import unittest

from fetch import parse_elements


class HtmlProjectionTest(unittest.TestCase):
    def test_input_does_not_capture_later_button_text(self):
        elements = parse_elements(
            '<label>Name<input backend_node_id="1" placeholder="Name">'
            '<button backend_node_id="2">Continue</button></label>',
            "backend_node_id",
        )
        self.assertEqual([(item["id"], item["name"]) for item in elements],
                         [("1", "Name"), ("2", "Continue")])

    def test_aria_name_takes_precedence(self):
        elements = parse_elements(
            '<button backend_node_id="3" aria_label="Open menu">Icon</button>',
            "backend_node_id",
        )
        self.assertEqual(elements[0]["name"], "Open menu")


if __name__ == "__main__":
    unittest.main()
