"""Score unlabeled v2 observations once with pinned browser Laya v10s."""

import argparse
import json
import time

import laya
import torch

from score_validation import joint_probabilities
from serialize_v2 import model_request_v2


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    args = parser.parse_args()
    with open(args.input, encoding="utf-8") as stream:
        observations = json.load(stream)
    if not isinstance(observations, list) or any(
        row.get("training_action") is not None for row in observations
    ):
        raise ValueError("Expected unlabeled observation rows")
    torch.set_num_threads(4)
    agent = laya.load("artifacts/laya-browser/v10s")
    if agent.cfg.get("laya_fmt") != "v3":
        raise ValueError("Expected browser Laya format v3")
    agent.cfg["head_max_len"] = agent.cfg["head_max_len_train"]
    output = []
    for row in observations:
        state, questions = model_request_v2(row)
        started = time.perf_counter()
        response = agent.predict(state, questions)
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        output.append({
            "id": row["sample_id"],
            "probabilities": joint_probabilities(row, response["answers"]),
            "input_tokens": response["usage"]["input_tokens"],
            "decision_ms": (time.perf_counter() - started) * 1000,
        })
    with open(args.output, "x", encoding="utf-8") as stream:
        json.dump(output, stream, indent=2)
        stream.write("\n")
    print(json.dumps({"output": args.output, "rows": len(output)}))


if __name__ == "__main__":
    main()
