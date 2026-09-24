"""The next browser Laya experiment abstains before an all-singleton call."""

import unittest

from singleton_guard_v3 import guarded_request


def sample(candidates):
    return {
        "goal": "Open the ticket",
        "browser_state": {
            "origin": "https://development.invalid",
            "pathname": "/",
            "title": "Development",
            "elements": [
                {"id": "e1", "role": "button", "name": "Open", "text": "Open",
                 "editable": False, "has_value": False, "selected": False},
                {"id": "e2", "role": "button", "name": "Close", "text": "Close",
                 "editable": False, "has_value": False, "selected": False},
            ],
        },
        "candidates": [{"id": identifier} for identifier in candidates],
    }


class SingletonGuardTest(unittest.TestCase):
    def test_one_candidate_abstains_without_model_request(self):
        self.assertIsNone(guarded_request(sample(["e1"])))

    def test_multiple_candidates_keep_v2_request(self):
        state, questions = guarded_request(sample(["e1", "e2"]))
        self.assertEqual(state["page"]["title"], "Development")
        self.assertEqual(len(questions["click_target"]["criteria"]), 2)


if __name__ == "__main__":
    unittest.main()
