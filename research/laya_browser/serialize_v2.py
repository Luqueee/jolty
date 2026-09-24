"""Versioned browser Laya request; first blind serializer remains unchanged."""

from score_validation import OPERATIONS, RULES, action_for


def option_text_v2(index, element):
    label = (element["name"] or element["text"] or element["role"])[:80]
    qualifiers = []
    if element.get("native_select"):
        value = element.get("current_value")
        if value is None:
            raise ValueError("Native select has no current_value in v2 projection")
        qualifiers.append(f"current value: {value[:80] or '(none)'}")
    elif element["has_value"]:
        qualifiers.append("has value")
    if element["selected"]:
        qualifiers.append("selected")
    detail = ", ".join(qualifiers)
    return f"[{index + 1}] {label} ({element['role']}{', ' + detail if detail else ''})"


def model_request_v2(sample):
    elements = {element["id"]: element for element in sample["browser_state"]["elements"]}
    by_action = {action: {} for action in OPERATIONS}
    for index, candidate in enumerate(sample["candidates"]):
        element = elements[candidate["id"]]
        by_action[action_for(element)][str(index + 1)] = option_text_v2(index, element)
    questions = {
        "operation": {
            "type": "choice",
            "criteria": {
                key: description
                for action, (key, description) in OPERATIONS.items()
                if by_action[action]
            },
            "instructions": {"goal": sample["goal"], "rules": RULES},
        }
    }
    for action, (key, _) in OPERATIONS.items():
        if by_action[action]:
            questions[f"{action if action != 'type' else 'type_text'}_target"] = {
                "type": "choice",
                "criteria": by_action[action],
                "instructions": {"goal": sample["goal"], "operation": key, "rules": RULES},
            }
    state = {
        "page": {
            "url": sample["browser_state"]["origin"] + sample["browser_state"]["pathname"],
            "title": sample["browser_state"]["title"],
            "text": "",
        },
        "recent_actions": [],
    }
    return state, questions
