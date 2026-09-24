"""Record the frozen v10s scorer's singleton-choice incompatibility without rescoring."""

import argparse
import json

from serialize_v2 import model_request_v2


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    args = parser.parse_args()
    with open(args.input, encoding="utf-8") as stream:
        observations = json.load(stream)
    if any(row.get("training_action") is not None for row in observations):
        raise ValueError("Only unlabeled observations may be inspected")
    output = []
    for row in observations:
        _, questions = model_request_v2(row)
        singleton = [
            name for name, question in questions.items()
            if len(question["criteria"]) == 1
        ]
        if not singleton:
            raise ValueError("This recording is limited to singleton-choice rows")
        output.append({
            "id": row["sample_id"],
            "failure": "unsupported_singleton_choice",
            "singleton_questions": singleton,
            "decision_ms": None,
        })
    with open(args.output, "x", encoding="utf-8") as stream:
        json.dump(output, stream, indent=2)
        stream.write("\n")
    print(json.dumps({"output": args.output, "unscorable_rows": len(output)}))


if __name__ == "__main__":
    main()
