"""Score the value-aware development validation projection with pinned v10s."""

import hashlib
import json
import sys
import time
from pathlib import Path

import laya
import torch

from score_validation import REVISION, action_for, joint_probabilities
from serialize_v2 import model_request_v2

INPUT = Path("artifacts/laya-browser-validation-input-v2.json")
OUTPUT = Path("artifacts/laya-browser-validation-scores-v2.json")
CHECKPOINT = Path("artifacts/laya-browser/v10s")


def main():
    source = INPUT.read_bytes()
    data = json.loads(source)
    if data["purpose"] != "browser-laya-v2-validation-only" or len(data["samples"]) != 76:
        raise ValueError("Expected the 76-row value-aware validation input")
    if any(sample["split"] != "validation" for sample in data["samples"]):
        raise ValueError("Non-validation row is forbidden")
    torch.set_num_threads(4)
    agent = laya.load(str(CHECKPOINT))
    if agent.cfg.get("laya_fmt") != "v3":
        raise ValueError("Expected pinned format-v3 checkpoint")
    agent.cfg["head_max_len"] = agent.cfg["head_max_len_train"]
    rows = []
    for sample in data["samples"]:
        state, questions = model_request_v2(sample)
        start = time.perf_counter()
        response = agent.predict(state, questions)
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        elapsed_ms = (time.perf_counter() - start) * 1000
        probabilities = joint_probabilities(sample, response["answers"])
        expected = sample["training_action"]
        elements = {element["id"]: element for element in sample["browser_state"]["elements"]}
        correct_index = next(
            (
                index for index, candidate in enumerate(sample["candidates"])
                if candidate["id"] == expected["target_id"]
                and action_for(elements[candidate["id"]]) == expected["action"]
            ), None,
        )
        rows.append({
            "id": sample["sample_id"],
            "probabilities": probabilities,
            "correctIndex": correct_index,
            "input_tokens": response["usage"]["input_tokens"],
            "decision_ms": elapsed_ms,
        })
    report = {
        "input_sha256": hashlib.sha256(source).hexdigest(),
        "checkpoint_revision": REVISION,
        "checkpoint": "v10s",
        "format": "v3",
        "head_max_len": agent.cfg["head_max_len"],
        "serializer": "browser-laya-v2: ranked candidate descriptions include native-select current_value",
        "versions": {"python": sys.version.split()[0], "torch": torch.__version__, "laya": "0.3.4"},
        "rows": rows,
    }
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output": str(OUTPUT), "validation_rows": len(rows)}))


if __name__ == "__main__":
    main()
