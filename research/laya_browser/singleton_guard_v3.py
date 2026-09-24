"""Conservative pre-inference guard for browser Laya research runs."""

from serialize_v2 import model_request_v2


def guarded_request(sample):
    """Abstain when Jolty retrieval offers no choice; otherwise keep v2 input."""
    candidates = sample["candidates"]
    if len(candidates) < 2:
        return None
    return model_request_v2(sample)
