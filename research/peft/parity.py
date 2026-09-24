"""Compare the pinned PyTorch encoder with saved TypeScript decision features."""

import json
import sys

import torch
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer


def action_for(element):
    if element["editable"]:
        return "type"
    if element["role"] == "combobox" or element.get("native_select"):
        return "select"
    return "click"


def candidate_text(element):
    action = action_for(element)
    label = (element["name"] or element["text"] or element["role"])[:160]
    return f"{action} {element['role']}: {label}"


def embed(model, tokenizer, texts):
    result = {}
    model.eval()
    with torch.no_grad():
        for start in range(0, len(texts), 32):
            batch = texts[start : start + 32]
            tokens = tokenizer(
                batch, padding=True, truncation=True, max_length=128,
                return_tensors="pt",
            )
            output = model(**tokens).last_hidden_state
            mask = tokens["attention_mask"].unsqueeze(-1)
            pooled = (output * mask).sum(dim=1) / mask.sum(dim=1)
            normalized = F.normalize(pooled, p=2, dim=1)
            result.update(zip(batch, normalized))
    return result


def verify(path):
    with open(path, encoding="utf-8") as stream:
        reference = json.load(stream)
    rows = reference["rows"]
    assert len(rows) == 20
    tokenizer = AutoTokenizer.from_pretrained(
        reference["encoder_model"], revision=reference["encoder_revision"]
    )
    model = AutoModel.from_pretrained(
        reference["encoder_model"], revision=reference["encoder_revision"]
    )
    embeddings = embed(model, tokenizer, list(reference["embeddings"]))
    cosines = {}
    for text, expected in reference["embeddings"].items():
        actual = embeddings[text]
        cosine = F.cosine_similarity(
            actual, torch.tensor(expected, dtype=actual.dtype), dim=0
        ).item()
        cosines[text] = cosine
    weights = torch.tensor(reference["head_weights"], dtype=torch.float32)
    top_mismatches = []
    option_mismatches = []
    for row in rows:
        options = []
        scores = []
        goal = embeddings[row["goal"]]
        for candidate in row["candidates"]:
            element = candidate["element"]
            action = action_for(element)
            options.append({"id": candidate["id"], "action": action})
            product = goal * embeddings[candidate_text(element)]
            retrieval = min(max(candidate["score"] / 100, 0), 1)
            indicator = [float(action == item) for item in ("click", "select", "type")]
            features = torch.cat((product, torch.tensor([retrieval, *indicator])))
            scores.append(torch.dot(features, weights).item())
        if options != row["options"]:
            option_mismatches.append(row["sample_id"])
        if options[scores.index(max(scores))] != row["top_choice"]:
            top_mismatches.append(row["sample_id"])
    result = {
        "corpus_sha256": reference["corpus_sha256"],
        "rows": len(rows),
        "texts": len(cosines),
        "minimum_cosine": min(cosines.values()),
        "below_0_999": [text for text, value in cosines.items() if value < 0.999],
        "option_mismatches": option_mismatches,
        "top_choice_mismatches": top_mismatches,
        "torch_version": torch.__version__,
    }
    print(json.dumps(result, indent=2))
    if result["below_0_999"] or option_mismatches or top_mismatches:
        raise SystemExit("Python and TypeScript encoder parity failed")


if __name__ == "__main__":
    verify(sys.argv[1] if len(sys.argv) > 1 else "artifacts/peft-parity-reference.json")
