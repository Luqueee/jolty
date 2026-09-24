"""Development-only check that selected text reaches the v10s inference call."""

import json
from pathlib import Path

import laya
import torch

from serialize_v2 import model_request_v2

INPUT = Path("artifacts/laya-select-development-v2.json")
CHECKPOINT = Path("artifacts/laya-browser/v10s")


def main():
    sample = json.loads(INPUT.read_text())
    state, questions = model_request_v2(sample)
    selection = questions["select_target"]["criteria"]
    if not any("current value: Indigo" in text for text in selection.values()):
        raise ValueError("Current value is missing from the model request")
    torch.set_num_threads(4)
    agent = laya.load(str(CHECKPOINT))
    if agent.cfg.get("laya_fmt") != "v3":
        raise ValueError("Expected the pinned v10s format")
    agent.cfg["head_max_len"] = agent.cfg["head_max_len_train"]
    response = agent.predict(state, questions)
    print(json.dumps({
        "development_only": True,
        "model": "browser-laya-v10s",
        "select_target_criteria": selection,
        "input_tokens": response["usage"]["input_tokens"],
        "model_returned_answers": "select_target" in response["answers"],
    }))


if __name__ == "__main__":
    main()
