"""Score unlabeled saved Jolty observations with the fixed v9 MiniLM LoRA adapter."""

import argparse
import json
import time

import torch
import torch.nn.functional as F
from peft import PeftModel
from transformers import AutoModel, AutoTokenizer

from parity import candidate_text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    args = parser.parse_args()
    with open(args.input, encoding="utf-8") as stream:
        observations = json.load(stream)
    with open("artifacts/peft-v9/head.json", encoding="utf-8") as stream:
        head = json.load(stream)
    if not isinstance(observations, list) or any(
        row.get("training_action") is not None for row in observations
    ):
        raise ValueError("Expected unlabeled observation rows")
    torch.set_num_threads(4)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tokenizer = AutoTokenizer.from_pretrained(
        head["encoder_model"], revision=head["encoder_revision"]
    )
    base = AutoModel.from_pretrained(
        head["encoder_model"], revision=head["encoder_revision"]
    )
    model = PeftModel.from_pretrained(base, "artifacts/peft-v9/adapter").to(device)
    model.eval()
    weights = torch.tensor(head["weights"][:385], device=device)
    output = []
    with torch.no_grad():
        for row in observations:
            elements = {element["id"]: element for element in row["browser_state"]["elements"]}
            texts = [row["goal"]] + [
                candidate_text(elements[candidate["id"]])
                for candidate in row["candidates"]
            ]
            started = time.perf_counter()
            tokens = tokenizer(
                texts, padding=True, truncation=True, max_length=128,
                return_tensors="pt",
            ).to(device)
            hidden = model(**tokens).last_hidden_state
            mask = tokens["attention_mask"].unsqueeze(-1)
            pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1)
            embeddings = F.normalize(pooled, p=2, dim=1)
            retrieval = torch.tensor(
                [min(max(candidate["score"] / 100, 0), 1)
                 for candidate in row["candidates"]], device=device
            ).unsqueeze(1)
            features = torch.cat(
                (embeddings[0].unsqueeze(0) * embeddings[1:], retrieval), dim=1
            )
            logits = features @ weights
            probabilities = F.softmax(logits / head["temperature"], dim=0)
            if device == "cuda":
                torch.cuda.synchronize()
            output.append({
                "id": row["sample_id"],
                "probabilities": probabilities.cpu().tolist(),
                "decision_ms": (time.perf_counter() - started) * 1000,
            })
    with open(args.output, "w", encoding="utf-8") as stream:
        json.dump(output, stream, indent=2)
        stream.write("\n")
    print(json.dumps({"output": args.output, "rows": len(output), "device": device}))


if __name__ == "__main__":
    main()
