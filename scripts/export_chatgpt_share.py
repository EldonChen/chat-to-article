#!/usr/bin/env python3
"""Export one public ChatGPT share into a single JSON file.

The share page embeds the conversation in a React Router turbo-stream
payload. This script fetches that HTML, decodes the stream, and writes
every message the page actually contains.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SHARE_RE = re.compile(
    r"(?:https?://(?:chatgpt\.com|chat\.openai\.com)/share/)?"
    r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
    re.IGNORECASE,
)
ENQUEUE_RE = re.compile(
    r"__reactRouterContext\.streamController\.enqueue\("
    r'"((?:\\.|[^"\\])*)"\)'
)

# Sentinels from React Router's turbo-stream decoder.
UNDEFINED = -7
HOLE = -1
NAN = -2
NEG_INF = -3
NEG_ZERO = -4
NULL = -5
POS_INF = -6
UNSET: Any = object()

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


class TurboStreamDecoder:
    """Decode the newline-delimited turbo-stream embedded in a share page."""

    def __init__(self) -> None:
        self.values: list[Any] = []
        self.hydrated: list[Any] = []
        self.deferred: dict[int, dict[str, Any]] = {}

    def read(self, text: str) -> Any:
        root = None
        for line in text.splitlines():
            if line:
                root = self._read_line(line, root)
        if root is None:
            raise ValueError("turbo-stream payload is empty")
        return root

    def _read_line(self, line: str, root: Any) -> Any:
        if line[0] in {"P", "E"} and len(line) > 1 and line[1].isdigit():
            colon = line.find(":")
            if colon < 0:
                raise ValueError(f"malformed deferred line: {line[:40]}")
            deferred_id = int(line[1:colon])
            value = self._hydrate_batch(json.loads(line[colon + 1 :]))
            box = self.deferred.get(deferred_id)
            if box is None:
                raise ValueError(f"deferred id {deferred_id} was not declared")
            box.clear()
            if isinstance(value, dict):
                box.update(value)
            else:
                box["$resolved"] = value
            if line[0] == "E":
                box["$rejected"] = True
            return root
        return self._hydrate_batch(json.loads(line))

    def _hydrate_batch(self, batch: Any) -> Any:
        if not isinstance(batch, list) or not batch:
            raise ValueError("turbo-stream batch must be a non-empty array")
        start = len(self.values)
        self.values.extend(batch)
        self.hydrated.extend([UNSET] * len(batch))
        return self._hydrate(start)

    def _hydrate(self, index: int) -> Any:
        special = _special(index)
        if special is not UNSET:
            return special
        if index < 0 or index >= len(self.values):
            raise ValueError(f"turbo-stream index out of range: {index}")
        cached = self.hydrated[index]
        if cached is not UNSET:
            return cached

        raw = self.values[index]
        if isinstance(raw, list):
            if raw and isinstance(raw[0], str):
                return self._hydrate_typed(index, raw)
            out: list[Any] = []
            self.hydrated[index] = out
            for item in raw:
                out.append(None if item == HOLE else self._hydrate(item))
            return out
        if isinstance(raw, dict):
            out_dict: dict[str, Any] = {}
            self.hydrated[index] = out_dict
            for key_ref, value_ref in raw.items():
                if not (isinstance(key_ref, str) and key_ref.startswith("_")):
                    raise ValueError(f"unexpected object key: {key_ref}")
                key = self._hydrate(int(key_ref[1:]))
                value = self._hydrate(value_ref)
                if value is UNDEFINED:
                    continue
                out_dict[str(key)] = value
            return out_dict

        self.hydrated[index] = raw
        return raw

    def _hydrate_typed(self, index: int, raw: list[Any]) -> Any:
        tag = raw[0]
        payload = raw[1] if len(raw) > 1 else None
        if tag == "D":
            value: Any = _as_date(payload)
        elif tag in {"U", "B", "Y"}:
            value = str(payload)
        elif tag == "R":
            value = {"$regexp": payload, "$flags": raw[2] if len(raw) > 2 else ""}
        elif tag == "S":
            value = []
            self.hydrated[index] = value
            for item in raw[1:]:
                value.append(self._hydrate(item))
            return value
        elif tag == "M":
            value = []
            self.hydrated[index] = value
            pairs = raw[1:]
            for cursor in range(0, len(pairs), 2):
                key = self._hydrate(pairs[cursor])
                mapped = self._hydrate(pairs[cursor + 1]) if cursor + 1 < len(pairs) else None
                value.append([key, mapped])
            return value
        elif tag == "N":
            value = {}
            self.hydrated[index] = value
            if isinstance(payload, dict):
                for key_ref, value_ref in payload.items():
                    key = self._hydrate(int(key_ref[1:]))
                    item = self._hydrate(value_ref)
                    if item is not UNDEFINED:
                        value[str(key)] = item
            return value
        elif tag == "P":
            deferred_id = int(payload)
            existing = (
                self.hydrated[deferred_id]
                if 0 <= deferred_id < len(self.hydrated)
                else UNSET
            )
            if existing is not UNSET and existing:
                self.hydrated[index] = existing
                return existing
            box: dict[str, Any] = {}
            self.deferred[deferred_id] = box
            self.hydrated[index] = box
            return box
        elif tag == "E":
            value = {"$error": payload}
        elif tag == "Z":
            value = self._hydrate(int(payload))
            self.hydrated[index] = value
            return value
        else:
            value = {"$type": tag, "$raw": raw[1:]}
        self.hydrated[index] = value
        return value


def _special(index: int) -> Any:
    if index == NULL or index == NAN or index == HOLE:
        return None
    if index == UNDEFINED:
        return UNDEFINED
    if index == POS_INF:
        return "Infinity"
    if index == NEG_INF:
        return "-Infinity"
    if index == NEG_ZERO:
        return 0
    return UNSET


def _as_date(value: Any) -> str:
    if isinstance(value, (int, float)):
        seconds = value / 1000 if value > 10_000_000_000 else value
        return datetime.fromtimestamp(seconds, timezone.utc).isoformat()
    return str(value)


def share_id_from(value: str) -> str:
    match = SHARE_RE.search(value.strip())
    if not match:
        raise ValueError(f"not a ChatGPT share URL or id: {value}")
    return match.group(1)


def fetch_html(share_id: str) -> str:
    request = urllib.request.Request(
        f"https://chatgpt.com/share/{share_id}",
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")[:200]
        raise RuntimeError(f"share page returned HTTP {error.code}: {body}") from error


def extract_stream(html: str) -> str:
    chunks = [json.loads(f'"{chunk}"') for chunk in ENQUEUE_RE.findall(html)]
    if chunks:
        return "".join(chunks)
    if "Just a moment" in html or "cf-challenge" in html:
        raise RuntimeError("Cloudflare blocked the share page")
    raise RuntimeError("share page has no conversation stream")


def find_conversation(root: Any) -> tuple[str | None, dict[str, Any]]:
    loader = root.get("loaderData") if isinstance(root, dict) else None
    if not isinstance(loader, dict):
        raise RuntimeError("decoded payload has no loaderData")
    for route in loader.values():
        if not isinstance(route, dict):
            continue
        data = (route.get("serverResponse") or {}).get("data")
        if isinstance(data, dict) and isinstance(data.get("linear_conversation"), list):
            share_id = route.get("sharedConversationId") or data.get("conversation_id")
            return share_id if isinstance(share_id, str) else None, data
    raise RuntimeError("decoded payload has no shared conversation")


def node_id(value: Any) -> Any:
    if isinstance(value, dict):
        return value.get("id")
    return value


def build_export(source_url: str, share_id: str, conversation: dict[str, Any]) -> dict[str, Any]:
    linear = conversation.get("linear_conversation") or []
    mapping = conversation.get("mapping") if isinstance(conversation.get("mapping"), dict) else {}
    messages = []
    for node in linear:
        if not isinstance(node, dict):
            continue
        current_id = node.get("id")
        mapped = mapping.get(current_id) if isinstance(current_id, str) else None
        source = mapped if isinstance(mapped, dict) else node
        message = source.get("message") if isinstance(source.get("message"), dict) else {}
        author = message.get("author") if isinstance(message.get("author"), dict) else {}
        children = source.get("children")
        messages.append(
            {
                "id": current_id,
                "parent": node_id(source.get("parent")),
                "children": [node_id(child) for child in children] if isinstance(children, list) else [],
                "role": author.get("role"),
                "author": author or None,
                "create_time": message.get("create_time"),
                "update_time": message.get("update_time"),
                "status": message.get("status"),
                "end_turn": message.get("end_turn"),
                "weight": message.get("weight"),
                "recipient": message.get("recipient"),
                "channel": message.get("channel"),
                "content": message.get("content"),
                "metadata": message.get("metadata"),
            }
        )

    meta = {
        key: value
        for key, value in conversation.items()
        if key not in {"linear_conversation", "mapping"}
    }
    return {
        "source_url": source_url,
        "share_id": share_id,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "title": conversation.get("title"),
        "conversation": meta,
        "message_count": len(messages),
        "messages": messages,
    }


def text_of(message: dict[str, Any]) -> str:
    content = message.get("content")
    if not isinstance(content, dict):
        return ""
    chunks: list[str] = []
    parts = content.get("parts")
    if isinstance(parts, list):
        for part in parts:
            if isinstance(part, str):
                chunks.append(part)
            elif isinstance(part, dict):
                chunks.append(json.dumps(part, ensure_ascii=False))
    for key in ("text", "content", "model_set_context"):
        extra = content.get(key)
        if isinstance(extra, str) and extra not in chunks:
            chunks.append(extra)
    thoughts = content.get("thoughts")
    if isinstance(thoughts, list):
        for thought in thoughts:
            if isinstance(thought, str):
                chunks.append(thought)
            elif isinstance(thought, dict):
                for key in ("summary", "content"):
                    item = thought.get(key)
                    if isinstance(item, str):
                        chunks.append(item)
    return "\n".join(chunks)


def summarize(document: dict[str, Any]) -> str:
    roles: dict[str, int] = {}
    text_chars = 0
    for message in document["messages"]:
        role = message.get("role") or "unknown"
        roles[role] = roles.get(role, 0) + 1
        text_chars += len(text_of(message))
    role_text = ", ".join(f"{role} {count}" for role, count in sorted(roles.items()))
    title = document.get("title") or "(untitled)"
    return f"{title}: {document['message_count']} messages ({role_text}), {text_chars} text chars"


def export_share(source: str, output: Path | None = None) -> Path:
    share_id = share_id_from(source)
    source_url = f"https://chatgpt.com/share/{share_id}"
    root = TurboStreamDecoder().read(extract_stream(fetch_html(share_id)))
    found_id, conversation = find_conversation(root)
    if found_id:
        share_id = found_id
        source_url = f"https://chatgpt.com/share/{share_id}"
    document = build_export(source_url, share_id, conversation)
    destination = output or Path("exports") / f"{share_id}.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(summarize(document))
    return destination


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("share", help="ChatGPT share URL or share id")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="output JSON path (default: exports/<share-id>.json)",
    )
    args = parser.parse_args(argv)
    try:
        print(export_share(args.share, args.output))
    except (ValueError, RuntimeError, urllib.error.URLError, json.JSONDecodeError, TimeoutError) as error:
        print(f"export failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
