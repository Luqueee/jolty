"""Record status after the frozen v10s run aborted before persisting any scores."""

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
        unsupported = all(len(question["criteria"]) == 1 for question in questions.values())
        output.append({
            "id": row["sample_id"],
            "failure": (
                "unsupported_all_singleton_questions"
                if unsupported else "run_aborted_no_persisted_score"
            ),
            "decision_ms": None,
        })
    if sum(row["failure"] == "unsupported_all_singleton_questions" for row in output) != 1:
        raise ValueError("Expected exactly one structurally incompatible observation")
    with open(args.output, "x", encoding="utf-8") as stream:
        json.dump(output, stream, indent=2)
        stream.write("\n")
    print(json.dumps({"output": args.output, "unscorable": 1, "scores_lost": len(output) - 1}))


if __name__ == "__main__":
    main()
