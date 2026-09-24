"""Request contract for native select state in browser Laya v2 experiments."""

import unittest

from serialize_v2 import model_request_v2


class SerializeV2Test(unittest.TestCase):
    def test_selected_option_reaches_model_question(self):
        sample = {
            "goal": "Save the indigo color",
            "browser_state": {
                "origin": "https://select-development.jolty.invalid",
                "pathname": "/inventory",
                "title": "Inventory development",
                "elements": [
                    {"id": "e1", "name": "Color", "text": "", "role": "combobox", "editable": False,
                     "native_select": True, "current_value": "Indigo", "has_value": False, "selected": False},
                    {"id": "e2", "name": "Save color", "text": "", "role": "button", "editable": False,
                     "has_value": False, "selected": False},
                ],
            },
            "candidates": [{"id": "e1"}, {"id": "e2"}],
        }
        _, questions = model_request_v2(sample)
        self.assertEqual(
            questions["select_target"]["criteria"]["1"],
            "[1] Color (combobox, current value: Indigo)",
        )
        self.assertEqual(questions["click_target"]["criteria"]["2"], "[2] Save color (button)")

    def test_missing_value_rejected(self):
        sample = {
            "goal": "Choose a color",
            "browser_state": {"origin": "https://example.invalid", "pathname": "/", "title": "Example",
                              "elements": [{"id": "e1", "name": "Color", "text": "", "role": "combobox",
                                            "editable": False, "native_select": True,
                                            "has_value": False, "selected": False}]},
            "candidates": [{"id": "e1"}],
        }
        with self.assertRaisesRegex(ValueError, "current_value"):
            model_request_v2(sample)


if __name__ == "__main__":
    unittest.main()
