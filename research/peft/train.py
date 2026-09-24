"""Fit the fixed Milestone 13 LoRA recipe on admitted train decisions only."""

import argparse
import json
import math
import os
import platform
import random
import time
from pathlib import Path

import peft
import torch
import torch.nn.functional as F
import transformers
from peft import LoraConfig, get_peft_model
from transformers import AutoModel, AutoTokenizer

from parity import action_for, candidate_text


SEED = 17
EPOCHS = 4
LEARNING_RATE = 2e-4
WEIGHT_DECAY = 0.01
ACCUMULATION = 8
MAX_LENGTH = 128
TEMPERATURES = (0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4)


def load_input(path):
    with open(path, encoding="utf-8") as stream:
        data = json.load(stream)
    train = [sample for sample in data["samples"] if sample["split"] == "train"]
    validation = [sample for sample in data["samples"] if sample["split"] == "validation"]
    if len(train) != 168 or len(validation) != 76:
        raise ValueError("Unexpected train or validation count")
    if any(sample["split"] == "test" for sample in data["samples"]):
        raise ValueError("The PEFT fitting input must not contain test observations")
    if len(data["frozen_head_weights"]) != 388:
        raise ValueError("Expected 388 matched frozen-head weights")
    if any(data["frozen_head_weights"][385:]):
        raise ValueError("Global action intercepts must be fixed at zero")
    return data, train, validation


def prepare(sample):
    elements = {entry["id"]: entry for entry in sample["browser_state"]["elements"]}
    candidates = sample["candidates"]
    options = [
        (candidate["id"], action_for(elements[candidate["id"]]))
        for candidate in candidates
    ]
    label = sample["training_action"]
    label_index = options.index((label["target_id"], label["action"]))
    texts = [sample["goal"]] + [
        candidate_text(elements[candidate["id"]]) for candidate in candidates
    ]
    scores = [min(max(candidate["score"] / 100, 0), 1) for candidate in candidates]
    return texts, scores, label_index


def logits_for(sample, model, tokenizer, head, device):
    texts, retrieval_scores, label_index = prepare(sample)
    tokens = tokenizer(
        texts, padding=True, truncation=True, max_length=MAX_LENGTH,
        return_tensors="pt",
    ).to(device)
    output = model(**tokens).last_hidden_state
    mask = tokens["attention_mask"].unsqueeze(-1)
    pooled = (output * mask).sum(dim=1) / mask.sum(dim=1)
    embeddings = F.normalize(pooled, p=2, dim=1)
    product = embeddings[0].unsqueeze(0) * embeddings[1:]
    retrieval = torch.tensor(retrieval_scores, device=device).unsqueeze(1)
    features = torch.cat((product, retrieval), dim=1)
    return features @ head, label_index


def new_model(data, device):
    tokenizer = AutoTokenizer.from_pretrained(
        data["encoder_model"], revision=data["encoder_revision"]
    )
    base = AutoModel.from_pretrained(
        data["encoder_model"], revision=data["encoder_revision"]
    )
    config = LoraConfig(
        r=8, lora_alpha=16, lora_dropout=0.05, bias="none",
        target_modules=["query", "value"],
    )
    model = get_peft_model(base, config).to(device)
    head = torch.nn.Parameter(
        torch.tensor(data["frozen_head_weights"][:385], device=device)
    )
    return tokenizer, model, head


def one_batch_smoke(data, train):
    tokenizer, model, head = new_model(data, "cuda")
    model.train()
    torch.cuda.reset_peak_memory_stats()
    logits, label_index = logits_for(train[0], model, tokenizer, head, "cuda")
    loss = F.cross_entropy(logits.unsqueeze(0), torch.tensor([label_index], device="cuda"))
    loss.backward()
    torch.cuda.synchronize()
    peak = torch.cuda.max_memory_allocated()
    result = {
        "stage": "smoke", "loss": loss.item(),
        "peak_vram_bytes": peak,
        "gpu_total_bytes": torch.cuda.get_device_properties(0).total_memory,
        "candidate_count": len(train[0]["candidates"]),
    }
    print(json.dumps(result, indent=2))
    if peak >= result["gpu_total_bytes"]:
        raise RuntimeError("One-batch memory smoke exceeded GPU capacity")


def evaluate(samples, model, tokenizer, head):
    model.eval()
    with torch.no_grad():
        return [
            (logits.detach().cpu(), label_index, sample["sample_id"])
            for sample in samples
            for logits, label_index in [
                logits_for(sample, model, tokenizer, head, "cuda")
            ]
        ]


def calibrate(validation):
    temperature = min(
        TEMPERATURES,
        key=lambda value: sum(
            -F.log_softmax(logits / value, dim=0)[label].item()
            for logits, label, _ in validation
        ),
    )
    decisions = []
    for logits, label, sample_id in validation:
        probabilities = F.softmax(logits / temperature, dim=0)
        top = int(torch.argmax(probabilities))
        decisions.append({
            "sample_id": sample_id,
            "correct": top == label,
            "confidence": float(probabilities[top]),
        })
    thresholds = [0] + [
        confidence["confidence"] + math.ulp(1.0)
        for confidence in decisions
    ]
    safe = [
        (sum(row["confidence"] >= threshold for row in decisions), threshold)
        for threshold in thresholds
        if any(row["confidence"] >= threshold for row in decisions)
        and all(
            row["correct"] for row in decisions
            if row["confidence"] >= threshold
        )
    ]
    threshold = min(safe, key=lambda pair: (-pair[0], pair[1]))[1] if safe else 1
    covered = [row for row in decisions if row["confidence"] >= threshold]
    return {
        "temperature": temperature,
        "threshold": threshold,
        "total": len(decisions),
        "correct": sum(row["correct"] for row in decisions),
        "covered": len(covered),
        "covered_correct": sum(row["correct"] for row in covered),
        "decisions": decisions,
    }


def fit(data, train, validation):
    tokenizer, model, head = new_model(data, "cuda")
    optimizer = torch.optim.AdamW(
        [*filter(lambda item: item.requires_grad, model.parameters()), head],
        lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY,
    )
    torch.cuda.reset_peak_memory_stats()
    started = time.perf_counter()
    losses = []
    for epoch in range(EPOCHS):
        model.train()
        order = list(train)
        random.Random(SEED + epoch).shuffle(order)
        optimizer.zero_grad(set_to_none=True)
        for index, sample in enumerate(order):
            logits, label_index = logits_for(sample, model, tokenizer, head, "cuda")
            loss = F.cross_entropy(
                logits.unsqueeze(0), torch.tensor([label_index], device="cuda")
            )
            (loss / ACCUMULATION).backward()
            losses.append(float(loss.detach()))
            if (index + 1) % ACCUMULATION == 0:
                optimizer.step()
                optimizer.zero_grad(set_to_none=True)
        print(json.dumps({"epoch": epoch + 1, "mean_loss": sum(losses[-len(order):]) / len(order)}), flush=True)
    torch.cuda.synchronize()
    training_seconds = time.perf_counter() - started
    validation_scores = evaluate(validation, model, tokenizer, head)
    calibration = calibrate(validation_scores)
    output = Path("artifacts/peft-v9")
    output.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(output / "adapter")
    weights = head.detach().cpu().tolist() + [0.0, 0.0, 0.0]
    (output / "head.json").write_text(json.dumps({
        "schema_version": 0,
        "corpus_sha256": data["corpus_sha256"],
        "encoder_model": data["encoder_model"],
        "encoder_revision": data["encoder_revision"],
        "feature_version": 1,
        "weights": weights,
        "temperature": calibration["temperature"],
        "threshold": calibration["threshold"],
    }, indent=2) + "\n", encoding="utf-8")
    report = {
        "corpus_sha256": data["corpus_sha256"],
        "train_count": len(train),
        "validation_count": len(validation),
        "model": data["encoder_model"],
        "revision": data["encoder_revision"],
        "recipe": {
            "lora_rank": 8, "lora_alpha": 16, "lora_dropout": 0.05,
            "target_modules": ["query", "value"], "max_length": MAX_LENGTH,
            "epochs": EPOCHS, "learning_rate": LEARNING_RATE,
            "weight_decay": WEIGHT_DECAY, "gradient_accumulation": ACCUMULATION,
            "microbatch_decision_groups": 1, "seed": SEED,
            "global_action_intercepts": [0, 0, 0],
        },
        "training_seconds": training_seconds,
        "peak_vram_bytes": torch.cuda.max_memory_allocated(),
        "gpu": torch.cuda.get_device_name(0),
        "versions": {
            "python": platform.python_version(), "torch": torch.__version__,
            "transformers": transformers.__version__, "peft": peft.__version__,
        },
        "validation": calibration,
    }
    (output / "report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "output": str(output), "training_seconds": training_seconds,
        "peak_vram_bytes": report["peak_vram_bytes"],
        "validation_correct": calibration["correct"],
        "validation_covered": calibration["covered"],
        "validation_covered_correct": calibration["covered_correct"],
    }, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=("smoke", "train"), required=True)
    args = parser.parse_args()
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    random.seed(SEED)
    torch.manual_seed(SEED)
    if not torch.cuda.is_available():
        raise RuntimeError("The PEFT experiment requires a local NVIDIA GPU")
    data, train, validation = load_input("artifacts/peft-training-input.json")
    if args.stage == "smoke":
        one_batch_smoke(data, train)
    else:
        fit(data, train, validation)


if __name__ == "__main__":
    main()
