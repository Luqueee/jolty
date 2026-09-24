"""Download two bounded public-train fragments and project source demonstrations.

The projection is an offline retrieval proxy, never a production observation or an
outcome-validated label. HTML is parsed as inert text; source values and raw HTML
are not written to the sample artifacts.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import random
import re
import subprocess
import sys
import time
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SEED = 211
DEFAULT_STEPS = 200
MIND2WEB_DATASET = "osunlp/Mind2Web"
MIND2WEB_REVISION = "17ece8eb89862368edc0cc806acee6fca5163474"
MIND2WEB_TRAIN_ROWS = 1009
MIND2WEB_LICENSE = "CC-BY-4.0"
MIND2WEB_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
WEBCHAIN_DATASET = "webagentlab/webchain"
WEBCHAIN_REVISION = "59ab57fea3d6270c260b6603418afb93dee8c1ce"
WEBCHAIN_LICENSE = "CC-BY-4.0"
WEBCHAIN_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
WEBCHAIN_ACTIONS_SHA256 = "4501148ee11cd109fe0ce6804d86e21c832da584c40a5bb58079aabffacfe0bb"
WEBCHAIN_TRACES_SHA256 = "16c033d47e8ad92dc2cd42ce4669e29526bad76012bb53e8948816403172f1f1"
WEBCHAIN_TEST_IDS_SHA256 = "70307975fcb91bbb30d3e6ffe71d4402ae897a4df8e663c11548dba636b518f8"
WEBCHAIN_ACTIONS_PATH = "data/trace_sft/parts/part_00/metadata/actions.parquet"
WEBCHAIN_TRACES_PATH = "data/trace_sft/parts/part_00/metadata/traces.parquet"
WEBCHAIN_TEST_IDS_PATH = "data/trace_sft/test_suite_150/trace_ids.tsv"
WEBCHAIN_MANIFEST_PATH = "data/trace_sft/parts/part_00/MANIFEST.sha256"
TRAINING_INPUT_SCHEMA = "bdm-decision-v1"
TOP_K = 10
MAX_MIND2WEB_ROW_BYTES = 16 * 1024 * 1024
MAX_MIND2WEB_TOTAL_BYTES = 256 * 1024 * 1024
MAX_MIND2WEB_REQUESTS = 120
MIN_MIND2WEB_ROWS = 20
MAX_WEBCHAIN_FILE_BYTES = 12 * 1024 * 1024
MAX_WEBCHAIN_SNAPSHOT_BYTES = 5 * 1024 * 1024
MAX_WEBCHAIN_SNAPSHOT_TOTAL_BYTES = 128 * 1024 * 1024
MAX_WEBCHAIN_SNAPSHOTS = 200
INTERACTIVE = {"button", "input", "select", "textarea", "a", "summary"}
VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}
INTERACTIVE_ROLES = {
    "button", "link", "textbox", "searchbox", "combobox", "listbox", "checkbox",
    "radio", "option", "tab", "menuitem", "menuitemcheckbox", "menuitemradio",
    "slider", "spinbutton", "switch",
}
ROLES = {"button": "button", "a": "link", "textarea": "textbox", "summary": "button"}
EMAIL_RE = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
LONG_NUMBER_RE = re.compile(r"(?<!\w)(?:\+?\d[\d\s().-]{8,}\d)(?!\w)")
TOKEN_RE = re.compile(r"(?i)\b(password|passcode|secret|token|api[_ -]?key)\s*[:=]\s*\S+")
ID_SEGMENT_RE = re.compile(r"^(?:\d{5,}|[0-9a-f]{8}-[0-9a-f-]{27,})$", re.I)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def hash_sources(paths: list[str]) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update((ROOT / path).read_bytes())
    return digest.hexdigest()


def normalize_text(value: object, limit: int = 160) -> str:
    text = " ".join(str(value or "").split())
    text = EMAIL_RE.sub("[redacted-email]", text)
    text = LONG_NUMBER_RE.sub("[redacted-number]", text)
    text = TOKEN_RE.sub(r"\1=[redacted]", text)
    return text[:limit]


def normalized_site(value: object) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return "unknown"
    if "://" in text:
        text = urlsplit(text).hostname or text
    text = text.split(":", 1)[0].rstrip(".")
    return text[4:] if text.startswith("www.") else text


def safe_route(value: object) -> str:
    raw = str(value or "")
    try:
        route = urlsplit(raw).path
    except ValueError:
        route = raw.split("?", 1)[0].split("#", 1)[0]
    parts = []
    for segment in route.split("/"):
        if ID_SEGMENT_RE.fullmatch(segment):
            parts.append("{id}")
        else:
            parts.append(normalize_text(segment, 80))
    return "/".join(parts)[:240] or "/"


def history_bucket(length: int) -> str:
    if length == 0:
        return "0"
    if length <= 2:
        return "1-2"
    if length <= 5:
        return "3-5"
    return "6+"


def contract_action(operation: object) -> str | None:
    value = str(operation or "").strip().lower()
    return value if value in {"click", "type", "select"} else None


def source_evidence_tier(*, state_present: bool, action: str | None,
                         target_status: str, goal_present: bool = True) -> str:
    return "B" if state_present and action and goal_present and target_status == "unique" else "D"


def candidate_shape_mind2web(positive: list[dict]) -> str:
    unique = {str(item.get("backend_node_id", "")) for item in positive
              if item.get("backend_node_id")}
    if not unique:
        return "none"
    return "single" if len(unique) == 1 else "multiple"


def candidate_shape_webchain(selector: str, dom_path: str) -> str:
    value = selector or dom_path
    if not value:
        return "none"
    has_id = "#" in value
    has_class = "." in value
    has_nth = ":nth-child" in value or ":nth-of-type" in value
    if has_id and has_nth:
        return "id+nth"
    if has_id:
        return "id"
    if has_class and has_nth:
        return "class+nth"
    if has_class:
        return "class"
    return "tag-or-path"


def stratified_sample(items: list[dict], limit: int, seed: int) -> list[dict]:
    """Greedily balance site, source action, history depth, and target shape."""
    rng = random.Random(seed)
    remaining = list(items)
    rng.shuffle(remaining)
    tie_order = {item["example_id"]: index for index, item in enumerate(remaining)}
    dimensions = ("site_id", "source_action_type_for_sampling", "history_bucket", "target_shape")
    counts: dict[str, Counter[str]] = {dimension: Counter() for dimension in dimensions}
    selected = []
    while remaining and len(selected) < limit:
        position = min(
            range(len(remaining)),
            key=lambda index: (
                sum(counts[dimension][str(remaining[index].get(dimension, "unknown"))]
                    for dimension in dimensions),
                tie_order[remaining[index]["example_id"]],
            ),
        )
        chosen = remaining.pop(position)
        selected.append(chosen)
        for dimension in dimensions:
            counts[dimension][str(chosen.get(dimension, "unknown"))] += 1
    return selected


class Elements(HTMLParser):
    """Small inert HTML projection; it does not reproduce browser visibility."""

    def __init__(self, id_attribute: str):
        super().__init__(convert_charrefs=True)
        self.id_attribute = id_attribute
        self.elements: list[dict] = []
        self.stack: list[tuple[str, int | None]] = []

    @staticmethod
    def _role(tag: str, attrs: dict[str, str]) -> str | None:
        role = attrs.get("role") or ROLES.get(tag)
        if tag == "input":
            input_type = attrs.get("type", "text").lower()
            role = "button" if input_type in {"button", "submit", "reset", "image"} else (
                input_type if input_type in {"checkbox", "radio"} else (
                    "searchbox" if input_type == "search" else (
                        "spinbutton" if input_type == "number" else (
                            "slider" if input_type == "range" else "textbox"))))
        elif tag == "select" and not role:
            try:
                role = "listbox" if "multiple" in attrs or int(attrs.get("size", "1") or 1) > 1 else "combobox"
            except ValueError:
                role = "combobox"
        elif tag == "button" and not role:
            role = "button"
        elif tag == "div" and attrs.get("contenteditable", "").lower() in {"", "true"} and "contenteditable" in attrs and not role:
            role = "textbox"
        return role

    def handle_starttag(self, tag: str, pairs: list[tuple[str, str | None]]) -> None:
        attrs = {key.lower(): value or "" for key, value in pairs}
        role = self._role(tag, attrs)
        input_type = attrs.get("type", "text").lower()
        is_interactive = (
            tag in INTERACTIVE
            or role in INTERACTIVE_ROLES
            or "tabindex" in attrs
            or ("contenteditable" in attrs and attrs.get("contenteditable", "true").lower() != "false")
        )
        index: int | None = None
        if (is_interactive and attrs.get(self.id_attribute)
                and not (tag == "input" and input_type == "hidden")):
            index = len(self.elements)
            is_button = tag == "input" and input_type in {"button", "submit", "reset", "image"}
            self.elements.append({
                "id": attrs[self.id_attribute],
                "role": role or "generic",
                "name": normalize_text(
                    attrs.get("aria-label") or attrs.get("aria_label")
                    or attrs.get("placeholder") or attrs.get("alt")
                    or (attrs.get("value") if is_button else "")
                    or attrs.get("title") or ""),
                "text": "",
                "visible": "hidden" not in attrs and attrs.get("aria-hidden", "false").lower() != "true",
                "enabled": "disabled" not in attrs and attrs.get("aria-disabled", "false").lower() != "true",
                "editable": (tag in {"textarea", "select"}
                             or (tag == "input" and input_type not in {
                                 "button", "submit", "reset", "image", "checkbox", "radio", "hidden",
                             })
                             or "contenteditable" in attrs),
                "selected": "selected" in attrs or "checked" in attrs,
            })
        if tag not in VOID:
            self.stack.append((tag, index))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data: str) -> None:
        value = " ".join(data.split())
        if not value:
            return
        for _, index in self.stack:
            if index is not None and len(self.elements[index]["text"]) < 320:
                self.elements[index]["text"] = normalize_text(
                    f"{self.elements[index]['text']} {value}", 320)

    def finish(self) -> list[dict]:
        for element in self.elements:
            element["text"] = normalize_text(element["text"], 160)
            if not element["name"]:
                element["name"] = element["text"]
        return self.elements


def parse_elements(source_html: str, id_attribute: str) -> list[dict]:
    parser = Elements(id_attribute)
    parser.feed(source_html)
    return parser.finish()


class DomNode:
    def __init__(self, node_id: int, tag: str, attrs: dict[str, str], parent: "DomNode | None"):
        self.node_id = node_id
        self.tag = tag.lower()
        self.attrs = attrs
        self.parent = parent
        self.children: list[DomNode] = []
        self.text_parts: list[str] = []
        self.element: dict | None = None

    def text_content(self, limit: int = 320) -> str:
        parts = []
        stack = [self]
        remaining = limit
        while stack and remaining:
            node = stack.pop()
            if node.tag in {"script", "style", "noscript"}:
                continue
            for part in node.text_parts:
                text = " ".join(part.split())
                if text:
                    text = text[:remaining]
                    parts.append(text)
                    remaining -= len(text)
                    if not remaining:
                        break
            stack.extend(reversed(node.children))
        return " ".join(" ".join(parts).split())

    def siblings(self) -> list["DomNode"]:
        return self.parent.children if self.parent else [self]


class SnapshotDom(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = DomNode(-1, "#document", {}, None)
        self.nodes = [self.root]
        self.stack = [self.root]

    def handle_starttag(self, tag: str, pairs: list[tuple[str, str | None]]) -> None:
        attrs = {key.lower(): value or "" for key, value in pairs}
        parent = self.stack[-1]
        node = DomNode(len(self.nodes) - 1, tag, attrs, parent)
        parent.children.append(node)
        self.nodes.append(node)
        if tag.lower() not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, pairs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, pairs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag.lower():
                del self.stack[index:]
                break

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if text and self.stack[-1].tag not in {"script", "style", "noscript"}:
            self.stack[-1].text_parts.append(text)


def _is_editable(node: DomNode) -> bool:
    tag = node.tag
    input_type = node.attrs.get("type", "text").lower()
    return ((tag == "input" and input_type in {
                "date", "datetime-local", "email", "month", "number", "password", "search",
                "tel", "text", "time", "url", "week",
            })
            or tag == "textarea"
            or ("contenteditable" in node.attrs
                and node.attrs.get("contenteditable", "true").lower() != "false"))


def _role_for(node: DomNode) -> str:
    explicit = node.attrs.get("role", "").strip().split()
    if explicit:
        return explicit[0]
    tag = node.tag
    input_type = node.attrs.get("type", "text").lower()
    if tag == "input":
        if input_type in {"checkbox", "radio"}:
            return input_type
        if input_type in {"button", "submit", "reset", "image"}:
            return "button"
        if input_type == "search":
            return "searchbox"
        if input_type == "number":
            return "spinbutton"
        if input_type == "range":
            return "slider"
        return "textbox"
    if tag in {"button", "summary"}:
        return "button"
    if tag == "a" and node.attrs.get("href") is not None:
        return "link"
    if tag == "select":
        try:
            many = "multiple" in node.attrs or int(node.attrs.get("size", "1") or 1) > 1
        except ValueError:
            many = "multiple" in node.attrs
        return "listbox" if many else "combobox"
    if tag == "textarea" or _is_editable(node):
        return "textbox"
    return "generic"


def _is_candidate(node: DomNode) -> bool:
    role = _role_for(node)
    return (node.tag in INTERACTIVE or role in INTERACTIVE_ROLES
            or "tabindex" in node.attrs
            or ("contenteditable" in node.attrs
                and node.attrs.get("contenteditable", "true").lower() != "false"))


def _label_for(node: DomNode, id_nodes: dict[str, DomNode],
               labels_by_for: dict[str, list[DomNode]]) -> str:
    attrs = node.attrs
    labelled_by = attrs.get("aria-labelledby", "").split()
    if labelled_by:
        joined = " ".join(id_nodes[key].text_content() for key in labelled_by if key in id_nodes)
        if joined:
            return joined
    if attrs.get("aria-label"):
        return attrs["aria-label"]
    if node.tag in {"input", "select", "textarea"}:
        own_id = attrs.get("id")
        labels = labels_by_for.get(own_id or "", [])
        ancestor = node.parent
        while ancestor:
            if ancestor.tag == "label":
                labels = [*labels, ancestor]
                break
            ancestor = ancestor.parent
        if labels:
            return " ".join(label.text_content() for label in labels)
    if node.tag == "input":
        input_type = attrs.get("type", "text").lower()
        if input_type == "image" and attrs.get("alt"):
            return attrs["alt"]
        if input_type in {"button", "submit", "reset"} and attrs.get("value"):
            return attrs["value"]
    return attrs.get("placeholder") or attrs.get("alt") or attrs.get("title", "")


def _element_projection(node: DomNode, id_nodes: dict[str, DomNode],
                        labels_by_for: dict[str, list[DomNode]], element_id: str) -> dict:
    attrs = node.attrs
    role = _role_for(node)
    editable = _is_editable(node)
    text = "" if editable else normalize_text(node.text_content())
    name = normalize_text(_label_for(node, id_nodes, labels_by_for) or text)
    hidden_ancestor = False
    ancestor: DomNode | None = node
    while ancestor:
        style = ancestor.attrs.get("style", "").replace(" ", "").lower()
        if ("hidden" in ancestor.attrs or ancestor.attrs.get("aria-hidden", "").lower() == "true"
                or "display:none" in style or "visibility:hidden" in style
                or "visibility:collapse" in style):
            hidden_ancestor = True
            break
        ancestor = ancestor.parent
    enabled = ("disabled" not in attrs and attrs.get("aria-disabled", "").lower() != "true")
    if role in {"checkbox", "radio"}:
        selected = "checked" in attrs
    elif "aria-selected" in attrs:
        selected = attrs["aria-selected"].lower() == "true"
    elif "aria-checked" in attrs:
        selected = attrs["aria-checked"].lower() == "true"
    elif "aria-pressed" in attrs:
        selected = attrs["aria-pressed"].lower() == "true"
    else:
        selected = "selected" in attrs
    return {
        "id": element_id,
        "domIndex": node.node_id,
        "role": role,
        "name": name,
        "text": text,
        "visible": not hidden_ancestor,
        "enabled": enabled,
        "editable": enabled and editable and "readonly" not in attrs,
        "selected": selected,
        "_node_id": node.node_id,
    }


def css_matches(nodes: list[DomNode], selector: str) -> list[DomNode]:
    matched: dict[int, DomNode] = {}
    for group in _css_groups(selector):
        steps = _css_steps(group)
        for node in nodes:
            if _matches_chain(node, steps, len(steps) - 1):
                matched[node.node_id] = node
    return list(matched.values())


def parse_snapshot(source_html: str, selector: str = "", dom_path: str = "") -> tuple[list[dict], str | None, str, str]:
    parser = SnapshotDom()
    parser.feed(source_html)
    nodes = parser.nodes[1:]
    id_nodes = {node.attrs["id"]: node for node in nodes if node.attrs.get("id")}
    labels_by_for: dict[str, list[DomNode]] = defaultdict(list)
    for node in nodes:
        if node.tag == "label" and node.attrs.get("for"):
            labels_by_for[node.attrs["for"]].append(node)
    by_node_id: dict[int, dict] = {}
    for node in nodes:
        if _is_candidate(node) and not (node.tag == "input" and node.attrs.get("type", "text").lower() == "hidden"):
            element = _element_projection(
                node, id_nodes, labels_by_for, f"e{len(by_node_id) + 1}")
            node.element = element
            by_node_id[node.node_id] = element
    target_nodes: list[DomNode] = []
    selector_error = ""
    locator = selector.strip() or dom_path.strip()
    if locator:
        try:
            target_nodes = css_matches(nodes, locator)
        except ValueError as error:
            selector_error = str(error)
    target_elements: set[str] = set()
    for node in target_nodes:
        current: DomNode | None = node
        while current:
            if current.element:
                target_elements.add(current.element["id"])
                break
            current = current.parent
    target_id = next(iter(target_elements)) if len(target_elements) == 1 else None
    if not locator:
        target_status = "missing_target"
    elif len(target_elements) > 1 or (selector_error and not target_nodes):
        target_status = "ambiguous_target"
    elif len(target_elements) == 0:
        target_status = "target_unmapped"
    else:
        target_status = "unique"
    elements = []
    for node in nodes:
        if node.element:
            projected = {key: value for key, value in node.element.items() if not key.startswith("_")}
            elements.append(projected)
    return elements, target_id, target_status, selector_error


def _css_groups(selector: str) -> list[str]:
    groups, buffer = [], []
    quote = ""
    escaped = False
    depth = 0
    for char in selector:
        if escaped:
            buffer.append(char)
            escaped = False
            continue
        if char == "\\":
            buffer.append(char)
            escaped = True
        elif quote:
            buffer.append(char)
            if char == quote:
                quote = ""
        elif char in {"'", '"'}:
            quote = char
            buffer.append(char)
        elif char in "([":
            depth += 1
            buffer.append(char)
        elif char in ")]":
            depth -= 1
            buffer.append(char)
        elif char == "," and depth == 0:
            groups.append("".join(buffer).strip())
            buffer = []
        else:
            buffer.append(char)
    if quote or depth != 0:
        raise ValueError("unbalanced CSS selector")
    if buffer:
        groups.append("".join(buffer).strip())
    return [group for group in groups if group]


def _css_steps(selector: str) -> list[tuple[str | None, str]]:
    result: list[tuple[str | None, str]] = []
    buffer = []
    relation: str | None = None
    quote = ""
    escaped = False
    depth = 0
    for char in selector.strip():
        if escaped:
            buffer.append(char)
            escaped = False
            continue
        if char == "\\":
            buffer.append(char)
            escaped = True
            continue
        if quote:
            buffer.append(char)
            if char == quote:
                quote = ""
            continue
        if char in {"'", '"'}:
            quote = char
            buffer.append(char)
            continue
        if char in "([":
            depth += 1
            buffer.append(char)
            continue
        if char in ")]":
            depth -= 1
            buffer.append(char)
            continue
        if depth == 0 and char in ">+~":
            if buffer:
                result.append((relation, "".join(buffer).strip()))
                buffer = []
            relation = char
            continue
        if depth == 0 and char.isspace():
            if buffer:
                result.append((relation, "".join(buffer).strip()))
                buffer = []
                relation = " "
            continue
        buffer.append(char)
    if buffer:
        result.append((relation, "".join(buffer).strip()))
    if not result or not result[0][1]:
        raise ValueError("empty CSS selector")
    result[0] = (None, result[0][1])
    return result


def _nth_matches(expression: str, index: int) -> bool:
    value = expression.replace(" ", "").lower()
    if value == "odd":
        return index % 2 == 1
    if value == "even":
        return index % 2 == 0
    if re.fullmatch(r"\d+", value):
        return index == int(value)
    match = re.fullmatch(r"([+-]?\d*)n([+-]\d+)?", value)
    if not match:
        raise ValueError("unsupported nth expression")
    a_text, b_text = match.groups()
    a = -1 if a_text == "-" else (1 if a_text in {"", "+"} else int(a_text))
    b = int(b_text or 0)
    if a == 0:
        return index == b
    difference = index - b
    return difference % a == 0 and difference // a >= 0


def _match_compound(node: DomNode, compound: str) -> bool:
    position = 0
    tag = re.match(r"^(?:\*|[a-zA-Z_][\w-]*)", compound)
    if tag:
        tag_name = tag.group(0).lower()
        if tag_name != "*" and node.tag != tag_name:
            return False
        position = tag.end()
    elif compound.startswith("*"):
        position = 1
    if not tag and position == 0 and not compound.startswith(("#", ".", "[", ":")):
        raise ValueError("unsupported CSS type selector")
    while position < len(compound):
        char = compound[position]
        if char in {"#", "."}:
            match = re.match(r"[\w-]+", compound[position + 1:])
            if not match:
                raise ValueError("unsupported CSS identifier")
            name = match.group(0)
            position += len(name) + 1
            if char == "#" and node.attrs.get("id") != name:
                return False
            if char == "." and name not in node.attrs.get("class", "").split():
                return False
        elif char == "[":
            end = compound.find("]", position + 1)
            if end < 0:
                raise ValueError("unclosed CSS attribute selector")
            body = compound[position + 1:end].strip()
            match = re.fullmatch(r"([\w:-]+)\s*(?:(=|\^=|\$=|\*=|~=|\|=)\s*(.*))?", body)
            if not match:
                raise ValueError("unsupported CSS attribute selector")
            name, operator, expected = match.groups()
            actual = node.attrs.get(name.lower())
            if actual is None:
                return False
            if operator:
                expected = expected.strip().strip("\"'")
                tests = {
                    "=": lambda a: a == expected,
                    "^=": lambda a: a.startswith(expected),
                    "$=": lambda a: a.endswith(expected),
                    "*=": lambda a: expected in a,
                    "~=": lambda a: expected in a.split(),
                    "|=": lambda a: a == expected or a.startswith(expected + "-"),
                }
                if not tests[operator](actual):
                    return False
            position = end + 1
        elif char == ":":
            match = re.match(r":([\w-]+)(?:\(([^()]*)\))?", compound[position:])
            if not match:
                raise ValueError("unsupported CSS pseudo-class")
            name, argument = match.groups()
            position += len(match.group(0))
            siblings = node.siblings()
            same_type = [item for item in siblings if item.tag == node.tag]
            if name == "first-child" and siblings[0] is not node:
                return False
            if name == "last-child" and siblings[-1] is not node:
                return False
            if name == "only-child" and len(siblings) != 1:
                return False
            if name == "nth-child":
                if not _nth_matches(argument or "", siblings.index(node) + 1):
                    return False
            elif name == "nth-of-type":
                if not _nth_matches(argument or "", same_type.index(node) + 1):
                    return False
            elif name == "not" and argument:
                if _match_compound(node, argument.strip()):
                    return False
            elif name == "checked" and not ("checked" in node.attrs or "selected" in node.attrs):
                return False
            elif name == "disabled" and "disabled" not in node.attrs:
                return False
            elif name == "enabled" and "disabled" in node.attrs:
                return False
            elif name not in {
                "first-child", "last-child", "only-child", "nth-child", "nth-of-type",
                "not", "checked", "disabled", "enabled",
            }:
                raise ValueError(f"unsupported CSS pseudo-class: {name}")
        else:
            raise ValueError("unsupported CSS selector component")
    return True


def _matches_chain(node: DomNode, steps: list[tuple[str | None, str]], index: int) -> bool:
    relation, compound = steps[index]
    if not _match_compound(node, compound):
        return False
    if index == 0:
        return True
    previous_relation = relation or " "
    if previous_relation == ">":
        return node.parent is not None and _matches_chain(node.parent, steps, index - 1)
    siblings = node.siblings()
    if previous_relation == "+":
        position = siblings.index(node)
        return position > 0 and _matches_chain(siblings[position - 1], steps, index - 1)
    if previous_relation == "~":
        position = siblings.index(node)
        return any(_matches_chain(siblings[earlier], steps, index - 1)
                   for earlier in range(position))
    ancestor = node.parent
    while ancestor:
        if _matches_chain(ancestor, steps, index - 1):
            return True
        ancestor = ancestor.parent
    return False




class BoundedReadError(ValueError):
    def __init__(self, transferred: int):
        super().__init__("source row or snapshot exceeds the configured byte limit")
        self.transferred = transferred


def _read_bounded(url: str, byte_limit: int, *, allowed_host: str | None = None) -> tuple[bytes, str]:
    request = Request(url, headers={"User-Agent": "Jolty-import-pilot/1.0"})
    with urlopen(request, timeout=45) as response:
        final_url = response.geturl()
        final = urlsplit(final_url)
        if allowed_host and (final.scheme != "https" or final.hostname != allowed_host):
            raise ValueError("snapshot redirect escaped the allowed host")
        content_length = response.headers.get("Content-Length")
        if content_length and int(content_length) > byte_limit:
            raise BoundedReadError(0)
        body = response.read(byte_limit + 1)
    if len(body) > byte_limit:
        raise BoundedReadError(len(body))
    return body, final_url


def _mind2web_rows_url(offset: int) -> str:
    query = urlencode({
        "dataset": MIND2WEB_DATASET,
        "config": "default",
        "split": "train",
        "offset": offset,
        "length": 1,
        "revision": MIND2WEB_REVISION,
    })
    return f"https://datasets-server.huggingface.co/rows?{query}"


def _m2w_observation(row: dict, row_index: int, step_index: int) -> dict:
    actions = row.get("actions") or []
    action = actions[step_index]
    operation = action.get("operation") or {}
    source_operation = str(operation.get("op") or "unknown").upper()
    contract = contract_action(source_operation)
    positive = [candidate for candidate in (action.get("pos_candidates") or [])
                if candidate.get("backend_node_id")]
    target_ids = list(dict.fromkeys(str(candidate["backend_node_id"]) for candidate in positive))
    originals = list(dict.fromkeys(
        str(candidate["backend_node_id"]) for candidate in positive
        if candidate.get("is_original_target") is True
    ))
    if not originals:
        target_status, reference_ids = "missing_target", []
    elif len(originals) == 1:
        target_status, reference_ids = "unique", originals
    else:
        target_status, reference_ids = "ambiguous_target", []
    raw_html = action.get("cleaned_html") or ""
    elements = parse_elements(raw_html, "backend_node_id") if raw_html else []
    target_elements = {element["id"] for element in elements}
    if target_status == "unique" and not set(reference_ids).intersection(target_elements):
        target_status, reference_ids = "target_unmapped", []
    if target_status == "unique" and len(set(reference_ids).intersection(target_elements)) > 1:
        target_status, reference_ids = "ambiguous_target", []
    history = []
    for previous in actions[:step_index]:
        previous_op = str((previous.get("operation") or {}).get("op") or "unknown").lower()
        previous_positive = previous.get("pos_candidates") or []
        summary = ""
        if previous_positive:
            try:
                attributes = json.loads(previous_positive[0].get("attributes") or "{}")
                summary = normalize_text(attributes.get("name", ""))
            except (TypeError, json.JSONDecodeError):
                summary = ""
        history.append({
            "action_type": contract_action(previous_op) or previous_op,
            "target_summary": summary,
            "outcome": "unknown",
        })
    site = normalized_site(row.get("website"))
    trace_id = str(row.get("annotation_id") or f"row-{row_index}")
    step_id = str(action.get("action_uid") or step_index)
    example_id = f"mind2web:{trace_id}:{step_id}"
    goal = normalize_text(row.get("confirmed_task"), 1000)
    state_present = bool(raw_html and elements)
    snapshot_download_status = (
        "missing_snapshot" if not raw_html else ("available" if state_present else "unusable_dom"))
    capture_status = "pending_select_schema" if contract == "select" else "offline_projection_only"
    evidence_tier = source_evidence_tier(
        state_present=state_present, action=contract, target_status=target_status,
        goal_present=bool(goal))
    return {
        "schema_version": TRAINING_INPUT_SCHEMA,
        "example_id": example_id,
        "source": {
            "dataset": MIND2WEB_DATASET,
            "revision": MIND2WEB_REVISION,
            "original_split": "train",
            "license_id": MIND2WEB_LICENSE,
            "license_url": MIND2WEB_LICENSE_URL,
            "trace_id": trace_id,
            "site_id": site,
            "template_family_id": "unknown",
            "flow_id": trace_id,
            "source_row_index": row_index,
            "source_step_id": step_id,
            "source_step_index": step_index,
            "known_site_overlap": "unverified",
            "collection_time": "unknown",
        },
        "task": {
            "goal": goal,
            "locale": "en" if goal.isascii() else "unknown",
            "goal_origin": "human",
        },
        "state": {
            "url_route": "unknown",
            "title": "",
            "state_schema_version": None,
            "source_snapshot_sha256": sha256_bytes(raw_html.encode("utf-8")) if raw_html else None,
            "source_snapshot_bytes": len(raw_html.encode("utf-8")),
            "form_state": "input values omitted; current state not independently observed",
            "production_compatible": False,
            "projection_limitations": [
                "cleaned static HTML parsed with Python HTMLParser",
                "browser layout, CSS visibility, JavaScript state, and dynamic controls unavailable",
                "candidate output is not the production serializer output",
            ],
        },
        "state_schema_version": None,
        "retriever_version": None,
        "action": contract,
        "source_action_type": source_operation,
        "target_ids": target_ids,
        "reference_target_ids": reference_ids,
        "target_resolution": {
            "status": target_status,
            "target_shape": candidate_shape_mind2web(positive),
            "target_role": next((element["role"] for element in elements
                                 if reference_ids and element["id"] == reference_ids[0]), None),
            "target_name": next((element["name"] for element in elements
                                 if reference_ids and element["id"] == reference_ids[0]), None),
        },
        "label": {
            "status": "human_demonstration" if evidence_tier == "B" else "unresolved",
            "evidence_tier": evidence_tier,
            "acceptable_actions": ([{"action_type": contract, "candidate_id": reference_ids[0],
                                      "value_ref": None}] if reference_ids else []),
            "reference_action": ({"action_type": contract, "candidate_id": reference_ids[0]}
                                 if reference_ids else None),
            "unverified_alternative_target_ids": [item for item in target_ids
                                                   if item not in reference_ids],
            "abstain_reason": (None if evidence_tier == "B" else
                               ("unsupported_action" if contract is None else target_status)),
            "outcome_status": "no_independent_outcome",
        },
        "elements": elements,
        "state_present": state_present,
        "snapshot_download_status": snapshot_download_status,
        "capture_status": capture_status,
        "history": history,
        "history_length": len(history),
        "history_bucket": history_bucket(len(history)),
        "site_id": site,
        "source_action_type_for_sampling": source_operation,
        "target_shape": candidate_shape_mind2web(positive),
        "source_value_present": bool(operation.get("value")),
        "source_value_sha256": sha256_bytes(str(operation.get("value")).encode("utf-8"))
        if operation.get("value") else None,
        "evidence_tier": evidence_tier,
        "independent_outcome": False,
        "tier_a_rejection_reason": "no_independent_outcome",
        "manual_audit_status": "pending",
        "validation": {
            "executed": False,
            "step_postcondition_id": None,
            "step_passed": None,
            "task_postcondition_id": None,
            "task_passed": None,
            "evidence_status": "no_independent_outcome",
            "validator_revision": None,
            "evidence_digest": None,
        },
    }


def fetch_mind2web(seed: int, step_limit: int) -> tuple[list[dict], dict]:
    rng = random.Random(seed)
    offsets = list(range(MIND2WEB_TRAIN_ROWS))
    rng.shuffle(offsets)
    pool: list[dict] = []
    failures = []
    bytes_fetched = 0
    rows_fetched = 0
    attempts = 0
    next_offset = 0
    while (attempts < MAX_MIND2WEB_REQUESTS and next_offset < len(offsets)
           and bytes_fetched < MAX_MIND2WEB_TOTAL_BYTES):
        if rows_fetched >= MIN_MIND2WEB_ROWS and len(pool) >= max(step_limit * 2, 400):
            break
        row_index = offsets[next_offset]
        next_offset += 1
        attempts += 1
        row_byte_limit = min(
            MAX_MIND2WEB_ROW_BYTES, MAX_MIND2WEB_TOTAL_BYTES - bytes_fetched)
        try:
            body, _ = _read_bounded(_mind2web_rows_url(row_index), row_byte_limit)
            bytes_fetched += len(body)
            response = json.loads(body)
            row = response["rows"][0]["row"]
            rows_fetched += 1
            trace_id = str(row.get("annotation_id") or f"row-{row_index}")
            site = normalized_site(row.get("website"))
            for step_index, action in enumerate(row.get("actions") or []):
                operation = action.get("operation") or {}
                operation_name = str(operation.get("op") or "unknown").upper()
                step_id = str(action.get("action_uid") or step_index)
                pool.append({
                    "example_id": f"mind2web:{trace_id}:{step_id}",
                    "site_id": site,
                    "source_action_type_for_sampling": operation_name,
                    "history_bucket": history_bucket(step_index),
                    "target_shape": candidate_shape_mind2web(action.get("pos_candidates") or []),
                    "_row": row,
                    "_row_index": row_index,
                    "_step_index": step_index,
                })
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError,
                IndexError, json.JSONDecodeError) as error:
            failures.append({"row_index": row_index, "error": type(error).__name__,
                             "detail": str(error)[:240]})
            bytes_fetched += int(getattr(error, "transferred", 0))
    selected_meta = stratified_sample(pool, step_limit, seed)
    selected = [
        _m2w_observation(item["_row"], item["_row_index"], item["_step_index"])
        for item in selected_meta
    ]
    return selected, {
        "dataset": MIND2WEB_DATASET,
        "revision": MIND2WEB_REVISION,
        "original_split": "train",
        "license_id": MIND2WEB_LICENSE,
        "license_url": MIND2WEB_LICENSE_URL,
        "requested_steps": step_limit,
        "fetch_attempts": attempts,
        "fetched_rows": rows_fetched,
        "candidate_steps": len(pool),
        "sampled_steps": len(selected),
        "sample_seed": seed,
        "bytes_fetched": bytes_fetched,
        "row_fetch_failures": failures,
        "sampling_dimensions": ["normalized site", "source action", "history bucket", "target shape"],
        "sampling_note": "seeded greedy balancing across marginal strata; not a population estimator",
    }


def _download_pinned_file(relative_path: str, local_path: Path, expected_sha256: str,
                          byte_limit: int) -> dict:
    url = (f"https://huggingface.co/datasets/{WEBCHAIN_DATASET}/resolve/"
           f"{WEBCHAIN_REVISION}/{relative_path}")
    if not local_path.exists() or sha256_file(local_path) != expected_sha256:
        body, _ = _read_bounded(url, byte_limit)
        digest = sha256_bytes(body)
        if digest != expected_sha256:
            raise ValueError(f"checksum mismatch for {relative_path}: {digest}")
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(body)
    size = local_path.stat().st_size
    if size > byte_limit or sha256_file(local_path) != expected_sha256:
        raise ValueError(f"cached source file failed verification: {relative_path}")
    return {"source_path": relative_path, "local_path": str(local_path),
            "bytes": size, "sha256": expected_sha256, "url": url}


def download_license_evidence(
    dataset: str,
    revision: str,
    source_path: str,
    local_path: Path,
    license_pattern: str,
) -> dict:
    url = (f"https://huggingface.co/datasets/{dataset}/resolve/"
           f"{revision}/{source_path}")
    body, final_url = _read_bounded(url, 128 * 1024)
    text = body.decode("utf-8", "replace")
    if not re.search(license_pattern, text, re.IGNORECASE):
        raise ValueError(f"pinned source license evidence mismatch for {dataset}/{source_path}")
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(body)
    return {
        "source_path": source_path,
        "local_path": str(local_path),
        "bytes": len(body),
        "sha256": sha256_bytes(body),
        "url": url,
        "final_url": final_url,
    }


def _read_webchain_parquet(actions_path: Path, traces_path: Path) -> dict:
    helper = ROOT / "research/import_pilot/read_webchain_metadata.mjs"
    result = subprocess.run(
        ["node", str(helper), str(actions_path), str(traces_path)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def _webchain_target_shape(row: dict) -> str:
    return candidate_shape_webchain(str(row.get("selector") or ""), str(row.get("dom_path") or ""))


def _webchain_history(rows_by_trace: dict[str, list[dict]]) -> None:
    for trace_rows in rows_by_trace.values():
        trace_rows.sort(key=lambda item: (int(item.get("source_step_index") or 0), item.get("source_step_id") or ""))
        history = []
        for row in trace_rows:
            row["_history"] = list(history)
            action_type = str(row.get("action_type") or "unknown").lower()
            if action_type != "launchapp":
                history.append({
                    "action_type": contract_action(action_type) or action_type,
                    "target_summary": normalize_text(row.get("value") or row.get("title") or ""),
                    "outcome": "unknown",
                })


def _webchain_observation(row: dict, trace: dict, snapshot_result: dict) -> dict:
    trace_id = str(row.get("trace_uid") or "")
    step_id = str(row.get("source_step_id") or row.get("source_step_index") or "unknown")
    action_type = str(row.get("action_type") or "unknown")
    action = contract_action(action_type)
    goal = normalize_text(trace.get("user_query"), 1000)
    site = normalized_site(row.get("host") or row.get("href"))
    history = row.get("_history") or []
    html_text = snapshot_result.get("html", "")
    elements: list[dict] = []
    reference_ids: list[str] = []
    target_status = "missing_target" if not (row.get("selector") or row.get("dom_path")) else "target_unmapped"
    parser_note = ""
    if html_text:
        try:
            elements, target_id, target_status, selector_error = parse_snapshot(
                html_text, str(row.get("selector") or ""), str(row.get("dom_path") or ""))
            if target_id:
                reference_ids = [target_id]
            if not elements:
                snapshot_result["status"] = "unusable_dom"
            parser_note = selector_error
        except (ValueError, RecursionError) as error:
            snapshot_result["status"] = "unusable_dom"
            snapshot_result["error"] = type(error).__name__
            elements = []
            target_status = "target_unmapped"
    state_present = snapshot_result.get("status") == "downloaded" and bool(elements)
    capture_status = "pending_select_schema" if action == "select" else "offline_projection_only"
    evidence_tier = source_evidence_tier(
        state_present=state_present, action=action, target_status=target_status,
        goal_present=bool(goal))
    raw_value = row.get("input_text") or row.get("value") or ""
    target_element = next((element for element in elements
                           if reference_ids and element["id"] == reference_ids[0]), None)
    return {
        "schema_version": TRAINING_INPUT_SCHEMA,
        "example_id": f"webchain:{trace_id}:{step_id}",
        "source": {
            "dataset": WEBCHAIN_DATASET,
            "revision": WEBCHAIN_REVISION,
            "original_split": "train",
            "source_partition": "data/trace_sft/parts/part_00",
            "test_suite_trace_ids_excluded": True,
            "license_id": WEBCHAIN_LICENSE,
            "license_url": WEBCHAIN_LICENSE_URL,
            "trace_id": trace_id,
            "site_id": site,
            "template_family_id": "unknown",
            "flow_id": trace_id,
            "source_row_index": int(row.get("source_step_index") or 0),
            "source_step_id": step_id,
            "known_site_overlap": "unverified",
            "collection_time": "unknown",
        },
        "task": {
            "goal": goal,
            "locale": "en" if goal.isascii() else "unknown",
            "goal_origin": "human",
        },
        "state": {
            "url_route": safe_route(row.get("href")),
            "title": normalize_text(row.get("title") or row.get("host_title")),
            "state_schema_version": None,
            "source_snapshot_sha256": snapshot_result.get("sha256"),
            "source_snapshot_bytes": snapshot_result.get("bytes", 0),
            "ax_snapshot_available": bool(row.get("ax_tree_url")),
            "form_state": "input values omitted; static source DOM only",
            "production_compatible": False,
            "projection_limitations": [
                "WebChain static HTML parsed with Python HTMLParser; AX tree not used",
                "browser layout, CSS visibility, JavaScript state, and dynamic controls unavailable",
                "candidate output is not the production serializer output",
            ],
        },
        "state_schema_version": None,
        "retriever_version": None,
        "action": action,
        "source_action_type": action_type,
        "target_ids": reference_ids,
        "reference_target_ids": reference_ids,
        "target_resolution": {
            "status": target_status,
            "target_shape": _webchain_target_shape(row),
            "target_role": target_element.get("role") if target_element else None,
            "target_name": target_element.get("name") if target_element else None,
            "locator_sha256": sha256_bytes(str(row.get("selector") or row.get("dom_path") or "").encode("utf-8"))
            if (row.get("selector") or row.get("dom_path")) else None,
            "parser_note": parser_note or snapshot_result.get("error"),
        },
        "label": {
            "status": "human_demonstration" if evidence_tier == "B" else "unresolved",
            "evidence_tier": evidence_tier,
            "acceptable_actions": ([{"action_type": action, "candidate_id": reference_ids[0],
                                      "value_ref": None}] if reference_ids else []),
            "reference_action": ({"action_type": action, "candidate_id": reference_ids[0]}
                                 if reference_ids else None),
            "unverified_alternative_target_ids": [],
            "abstain_reason": (None if evidence_tier == "B" else
                               ("unsupported_action" if action is None else target_status)),
            "outcome_status": "no_independent_outcome",
        },
        "elements": elements,
        "state_present": state_present,
        "capture_status": capture_status,
        "history": history,
        "history_length": len(history),
        "history_bucket": history_bucket(len(history)),
        "site_id": site,
        "source_action_type_for_sampling": action_type,
        "target_shape": _webchain_target_shape(row),
        "source_value_present": bool(raw_value),
        "source_value_sha256": sha256_bytes(str(raw_value).encode("utf-8")) if raw_value else None,
        "snapshot_download_status": snapshot_result.get("status", "missing_snapshot"),
        "evidence_tier": evidence_tier,
        "independent_outcome": False,
        "tier_a_rejection_reason": "no_independent_outcome",
        "manual_audit_status": "pending",
        "validation": {
            "executed": False,
            "step_postcondition_id": None,
            "step_passed": None,
            "task_postcondition_id": None,
            "task_passed": None,
            "evidence_status": "no_independent_outcome",
            "validator_revision": None,
            "evidence_digest": None,
        },
    }


def _download_snapshot(url: str, bytes_remaining: int) -> dict:
    if not url:
        return {"status": "missing_snapshot", "html": "", "bytes": 0}
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname != "data.imean.tech":
        return {"status": "untrusted_snapshot_url", "html": "", "bytes": 0}
    if bytes_remaining <= 0:
        return {"status": "download_cap_reached", "html": "", "bytes": 0}
    try:
        raw, final_url = _read_bounded(
            url, min(MAX_WEBCHAIN_SNAPSHOT_BYTES, bytes_remaining), allowed_host="data.imean.tech")
        return {
            "status": "downloaded",
            "html": raw.decode("utf-8", "replace"),
            "bytes": len(raw),
            "sha256": sha256_bytes(raw),
            "source_url_sha256": sha256_bytes(url.encode("utf-8")),
            "final_url_sha256": sha256_bytes(final_url.encode("utf-8")),
        }
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as error:
        message = str(error)
        status = "snapshot_too_large" if isinstance(error, BoundedReadError) else "snapshot_fetch_failed"
        return {
            "status": status,
            "html": "",
            "bytes": int(getattr(error, "transferred", 0)),
            "error": type(error).__name__,
            "detail": message[:240],
        }


def fetch_webchain(seed: int, step_limit: int, cache_dir: Path) -> tuple[list[dict], dict]:
    metadata_dir = cache_dir / "webchain-part-00"
    files = [
        _download_pinned_file(
            WEBCHAIN_ACTIONS_PATH, metadata_dir / "actions.parquet", WEBCHAIN_ACTIONS_SHA256,
            MAX_WEBCHAIN_FILE_BYTES),
        _download_pinned_file(
            WEBCHAIN_TRACES_PATH, metadata_dir / "traces.parquet", WEBCHAIN_TRACES_SHA256,
            1024 * 1024),
        _download_pinned_file(
            WEBCHAIN_TEST_IDS_PATH, metadata_dir / "test-trace-ids.tsv", WEBCHAIN_TEST_IDS_SHA256,
            128 * 1024),
    ]
    manifest_path = metadata_dir / "part-manifest.sha256"
    manifest_url = (f"https://huggingface.co/datasets/{WEBCHAIN_DATASET}/resolve/"
                    f"{WEBCHAIN_REVISION}/{WEBCHAIN_MANIFEST_PATH}")
    if not manifest_path.exists():
        body, _ = _read_bounded(manifest_url, 16 * 1024)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_bytes(body)
    source_manifest_sha = sha256_file(manifest_path)
    manifest_text = manifest_path.read_text(encoding="utf-8")
    if (f"{WEBCHAIN_ACTIONS_SHA256}  metadata/actions.parquet" not in manifest_text
            or f"{WEBCHAIN_TRACES_SHA256}  metadata/traces.parquet" not in manifest_text):
        raise ValueError("WebChain part manifest does not match pinned metadata hashes")
    files.append({"source_path": WEBCHAIN_MANIFEST_PATH, "local_path": str(manifest_path),
                  "bytes": manifest_path.stat().st_size, "sha256": source_manifest_sha,
                  "url": manifest_url})
    test_ids_path = metadata_dir / "test-trace-ids.tsv"
    with test_ids_path.open(encoding="utf-8", newline="") as stream:
        excluded_ids = {row["trace_uid"] for row in csv.DictReader(stream, delimiter="\t")}
    decoded = _read_webchain_parquet(metadata_dir / "actions.parquet", metadata_dir / "traces.parquet")
    traces = {str(trace.get("uid")): trace for trace in decoded["traces"]}
    rows_by_trace: dict[str, list[dict]] = defaultdict(list)
    for row in decoded["actions"]:
        trace_id = str(row.get("trace_uid") or "")
        if trace_id not in excluded_ids:
            rows_by_trace[trace_id].append(row)
    _webchain_history(rows_by_trace)
    pool = []
    for trace_id, rows in rows_by_trace.items():
        trace = traces.get(trace_id, {})
        for row in rows:
            item = dict(row)
            item["_trace"] = trace
            item["_trace_id"] = trace_id
            item["site_id"] = normalized_site(row.get("host") or row.get("href"))
            item["source_action_type_for_sampling"] = str(row.get("action_type") or "unknown")
            item["history_length"] = len(row.get("_history") or [])
            item["history_bucket"] = history_bucket(item["history_length"])
            item["target_shape"] = _webchain_target_shape(row)
            item["example_id"] = f"webchain:{trace_id}:{row.get('source_step_id') or row.get('source_step_index')}"
            pool.append(item)
    sample = stratified_sample(pool, step_limit, seed)
    snapshots: dict[str, dict] = {}
    bytes_fetched = 0
    for row in sample:
        url = str(row.get("html_dom_url") or "")
        if url and url not in snapshots:
            if len(snapshots) >= MAX_WEBCHAIN_SNAPSHOTS:
                snapshots[url] = {"status": "snapshot_count_cap", "html": "", "bytes": 0}
            else:
                result = _download_snapshot(url, MAX_WEBCHAIN_SNAPSHOT_TOTAL_BYTES - bytes_fetched)
                snapshots[url] = result
                bytes_fetched += int(result.get("bytes", 0))
        row["_snapshot_result"] = snapshots.get(url, {"status": "missing_snapshot", "html": "", "bytes": 0})
    observations = [
        _webchain_observation(row, row["_trace"], row["_snapshot_result"])
        for row in sample
    ]
    return observations, {
        "dataset": WEBCHAIN_DATASET,
        "revision": WEBCHAIN_REVISION,
        "original_split": "train",
        "source_partition": "data/trace_sft/parts/part_00",
        "public_test_trace_ids_excluded": True,
        "excluded_public_test_traces": len(excluded_ids),
        "part_action_rows": len(decoded["actions"]),
        "part_trace_rows": len(decoded["traces"]),
        "license_id": WEBCHAIN_LICENSE,
        "license_url": WEBCHAIN_LICENSE_URL,
        "requested_steps": step_limit,
        "candidate_steps_after_test_exclusion": len(pool),
        "sampled_steps": len(observations),
        "sample_seed": seed,
        "metadata_download_bytes": sum(item["bytes"] for item in files),
        "metadata_files": files,
        "unique_snapshots_requested": len(snapshots),
        "unique_snapshots_downloaded": sum(item.get("status") == "downloaded" for item in snapshots.values()),
        "snapshot_bytes_downloaded": bytes_fetched,
        "snapshot_download_statuses": dict(Counter(item.get("status", "unknown") for item in snapshots.values())),
        "sampling_dimensions": ["normalized site", "source action", "history bucket", "target locator shape"],
        "sampling_note": "seeded greedy balancing across marginal strata; not a population estimator",
    }


def assign_duplicate_groups(observations: list[dict]) -> None:
    groups: dict[str, list[dict]] = defaultdict(list)
    for item in observations:
        signature = {
            "site": item.get("site_id"),
            "goal": " ".join(item.get("task", {}).get("goal", "").lower().split()),
            "action": item.get("action"),
            "history": [entry.get("action_type") for entry in item.get("history", [])],
            "target": {
                "role": (item.get("target_resolution") or {}).get("target_role"),
                "name": " ".join(
                    str((item.get("target_resolution") or {}).get("target_name") or "").lower().split()),
                "shape": (item.get("target_resolution") or {}).get("target_shape"),
            },
            "elements": [
                (element.get("role"), element.get("name"), element.get("text"),
                 element.get("visible"), element.get("enabled"), element.get("editable"))
                for element in item.get("elements", [])
            ],
        }
        digest = sha256_bytes(json.dumps(signature, sort_keys=True, ensure_ascii=False).encode("utf-8"))
        item["duplicate_group"] = f"dup-{digest[:16]}"
        groups[digest].append(item)
    for digest, members in groups.items():
        for item in members:
            item["duplicate_group_size"] = len(members)
            item["duplicate_status"] = "duplicate" if len(members) > 1 else "unique"


def count_dimensions(observations: list[dict]) -> dict:
    def counts(values):
        return dict(sorted(Counter(str(value) for value in values).items()))
    return {
        "observations": len(observations),
        "unique_sites": len({item.get("site_id", "unknown") for item in observations}),
        "by_site": counts(item.get("site_id", "unknown") for item in observations),
        "by_action": counts(item.get("source_action_type_for_sampling", "unknown") for item in observations),
        "by_history_bucket": counts(item.get("history_bucket", "unknown") for item in observations),
        "by_target_shape": counts(item.get("target_shape", "unknown") for item in observations),
        "by_evidence_tier": counts(item.get("evidence_tier", "unknown") for item in observations),
        "by_capture_status": counts(item.get("capture_status", "unknown") for item in observations),
        "independent_outcome_count": sum(bool(item.get("independent_outcome")) for item in observations),
        "no_independent_outcome_count": sum(not item.get("independent_outcome") for item in observations),
        "exact_duplicate_rows": sum(item.get("duplicate_status") == "duplicate" for item in observations),
        "unique_duplicate_groups": len({item.get("duplicate_group") for item in observations}),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--mind2web-steps", type=int, default=DEFAULT_STEPS)
    parser.add_argument("--webchain-steps", type=int, default=DEFAULT_STEPS)
    parser.add_argument("--output", type=Path, default=Path("artifacts/import-pilot-observations.json"))
    parser.add_argument("--manifest", type=Path, default=Path("artifacts/import-pilot-manifest.json"))
    parser.add_argument("--cache-dir", type=Path, default=Path("artifacts/import-pilot-cache"))
    args = parser.parse_args()
    if args.mind2web_steps < 1 or args.webchain_steps < 1:
        parser.error("sample sizes must be positive")
    args.cache_dir.mkdir(parents=True, exist_ok=True)

    mind2web_license_evidence = download_license_evidence(
        MIND2WEB_DATASET, MIND2WEB_REVISION, "README.md",
        args.cache_dir / "mind2web" / "README.md",
        r"(?m)^license:\s*cc-by-4\.0\s*$")
    webchain_license_evidence = download_license_evidence(
        WEBCHAIN_DATASET, WEBCHAIN_REVISION, "LICENSE",
        args.cache_dir / "webchain-license" / "LICENSE",
        r"creative commons attribution 4\.0 international license")

    mind2web, mind2web_manifest = fetch_mind2web(args.seed, args.mind2web_steps)
    webchain, webchain_manifest = fetch_webchain(args.seed + 1, args.webchain_steps, args.cache_dir)
    mind2web_manifest["license_evidence"] = mind2web_license_evidence
    webchain_manifest["license_evidence"] = webchain_license_evidence
    observations = mind2web + webchain
    state_schema = "browser-state-v0@sha256:" + hash_sources(["packages/browser/src/index.ts"])
    retriever = "candidate-retrieval-v0@sha256:" + hash_sources([
        "packages/retrieval/src/candidate-retrieval.ts",
        "packages/retrieval/src/candidate-filter.ts",
    ])
    for item in observations:
        item["state_schema_version"] = state_schema
        item["retriever_version"] = retriever
        item["state"]["state_schema_version"] = state_schema
        item["retrieval"] = {"retriever_version": retriever, "k": TOP_K, "gold_in_top_k": None}
        item.pop("_snapshot_text", None)
    assign_duplicate_groups(observations)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(observations, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    results = {"mind2web": mind2web_manifest, "webchain": webchain_manifest}
    manifest = {
        "schema_version": TRAINING_INPUT_SCHEMA,
        "created_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sampling": {
            "seed": args.seed,
            "mind2web_requested_steps": args.mind2web_steps,
            "webchain_requested_steps": args.webchain_steps,
            "strata": ["site", "source action type", "history length bucket", "target shape"],
            "note": "one seeded marginally-balanced pilot sample per source; not a population estimator",
        },
        "input_versions": {
            "state_schema_version": state_schema,
            "state_schema_hash_input_order": ["packages/browser/src/index.ts"],
            "retriever_version": retriever,
            "retriever_hash_input_order": [
                "packages/retrieval/src/candidate-retrieval.ts",
                "packages/retrieval/src/candidate-filter.ts",
            ],
            "production_compatible": False,
            "select_capture_status": "pending_select_schema; static offline HTML does not verify current value/selected option or frozen serializer parity",
        },
        "pipeline": {
            "fetch_script_sha256": sha256_file(Path(__file__)),
            "parquet_reader_sha256": sha256_file(ROOT / "research/import_pilot/read_webchain_metadata.mjs"),
            "webchain_parquet_reader": "apps/cli dependency hyparquet@1.31.1",
        },
        "sources": results,
        "site_overlap": {
            "v9": "unverified; parent cross-check required",
            "blind_sites": "unverified; protected manifest not opened",
            "blind_sites_v2": "unverified; protected manifest not opened",
            "template_family_overlap": "unknown",
        },
        "limitations": [
            "This import pilot samples public train data only; it does not change model training or runtime fast paths.",
            "All recorded source actions are demonstrations without an independent current step/task outcome; no item is tier A.",
            "Static HTML projection cannot establish browser layout/visibility, JavaScript state, selector parity, or full production feature parity.",
            "SELECT-dependent captures are pending until an owner verifies the frozen current-value/selected-option representation.",
            "Manual audit is pending for every row; tier-B candidates are not admitted to a training set.",
            "Site/template overlap against protected v9 and blind manifests is unverified and must be checked by the parent before admission.",
            "WebChain image, AX-tree contents, and dynamic browser state are not used; only a pinned part_00 train metadata fragment and bounded linked HTML snapshots are projected.",
        ],
        "observation_file": {
            "path": str(args.output),
            "bytes": args.output.stat().st_size,
            "sha256": sha256_file(args.output),
            "observation_count": len(observations),
        },
        "summary": {
            "total_observations": len(observations),
            "by_source": {
                "mind2web": count_dimensions(mind2web),
                "webchain": count_dimensions(webchain),
            },
        },
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "observations": len(observations),
        "observation_file": str(args.output),
        "observation_sha256": manifest["observation_file"]["sha256"],
        "manifest": str(args.manifest),
        "sources": {key: {"sampled_steps": value["sampled_steps"],
                          "unique_sites": count_dimensions(
                              mind2web if key == "mind2web" else webchain)["unique_sites"]}
                    for key, value in results.items()},
    }, indent=2))


if __name__ == "__main__":
    main()
