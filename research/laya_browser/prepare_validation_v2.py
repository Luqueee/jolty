"""Merge fresh validated select states with the sealed v9 validation projection."""

import hashlib
import json
from pathlib import Path

BASE = Path("artifacts/peft-training-input.json")
RECAPTURE = Path("artifacts/laya-select-validation-recapture-v2.json")
OUTPUT = Path("artifacts/laya-browser-validation-input-v2.json")


def main():
    base_source = BASE.read_bytes()
    recapture_source = RECAPTURE.read_bytes()
    base = json.loads(base_source)
    recapture = json.loads(recapture_source)
    validation = [row for row in base["samples"] if row["split"] == "validation"]
    if len(validation) != 76 or any(row["split"] == "test" for row in base["samples"]):
        raise ValueError("Expected sealed train/validation input with 76 validation rows")
    fresh = {row["sample_id"]: row for row in recapture["samples"]}
    if len(fresh) != 9 or len(recapture["samples"]) != 9:
        raise ValueError("Expected nine unique select recaptures")
    if not set(fresh).issubset({row["sample_id"] for row in validation}):
        raise ValueError("Recapture includes an unknown validation ID")
    merged = []
    for row in validation:
        if row["sample_id"] in fresh:
            replacement = fresh[row["sample_id"]]
            if replacement["training_action"] is None or replacement["split"] != "validation":
                raise ValueError("Recapture lacks a validated label")
            if replacement["training_action"]["action"] != row["training_action"]["action"]:
                raise ValueError("Reference action changed")
            row = replacement
        else:
            elements = {element["id"]: element for element in row["browser_state"]["elements"]}
            if any(elements[candidate["id"]].get("native_select") for candidate in row["candidates"]):
                raise ValueError("Unrecaptured select candidate lacks current value")
        merged.append(row)
    report = {
        "schema": 1,
        "purpose": "browser-laya-v2-validation-only",
        "base_sha256": hashlib.sha256(base_source).hexdigest(),
        "recapture_sha256": hashlib.sha256(recapture_source).hexdigest(),
        "recaptured_ids": sorted(fresh),
        "samples": merged,
    }
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output": str(OUTPUT), "validation_rows": len(merged), "recaptured": len(fresh)}))


if __name__ == "__main__":
    main()
