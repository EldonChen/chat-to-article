"""确定性操作：切分会话、词表扫描、编译导出、锚点同步、风格钉住。

起草和改写不在这里。
"""

from __future__ import annotations

import difflib
import hashlib
import json
import os
import re
import shutil
from pathlib import Path

SECRET_RES = [
    re.compile(r"sk-[A-Za-z0-9_\-]{8,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)api[_-]?key\s*[:=]\s*\S+"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9\-._~+/]{16,}"),
]

BLOCK_RE = re.compile(
    r"<!-- block:([A-Za-z0-9_-]+) -->\n(.*?)<!-- /block:\1 -->",
    re.S,
)


def skill_root() -> Path:
    return Path(__file__).resolve().parents[1]


def lexicon_dir() -> Path:
    return skill_root() / "lexicon"


def demo_root() -> Path:
    """样例跟 skill 放在一起，npx skills 安装后路径仍然有效。"""
    return skill_root() / "examples" / "demo"


def voice_home(explicit: str | None = None) -> Path:
    if explicit:
        return Path(explicit).expanduser()
    env = os.environ.get("CHAT_TO_ARTICLE_HOME")
    if env:
        return Path(env).expanduser()
    return Path.home() / ".chat-to-article"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_jsonl(path: Path) -> list:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)
    path.write_text(text, encoding="utf-8")


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def empty_profile(revision: int = 0) -> dict:
    return {
        "revision": revision,
        "locale": "zh-CN",
        "audience": "",
        "person": "",
        "paragraph": {"minChars": 80, "maxChars": 280},
        "structure": {"headingDepth": 2, "listPolicy": "能写成句子就写成句子"},
        "terms": [],
        "exemplarRefs": [],
        "rules": [],
    }


def empty_private() -> dict:
    return {"id": "private", "scope": "private", "entries": []}


def ensure_voice(voice: Path) -> dict:
    voice.mkdir(parents=True, exist_ok=True)
    profile_path = voice / "profile.json"
    if profile_path.exists():
        profile = read_json(profile_path)
    else:
        profile = empty_profile(0)
        write_json(profile_path, profile)
    private_path = voice / "lexicon" / "private.json"
    if not private_path.exists():
        write_json(private_path, empty_private())
    (voice / "exemplars").mkdir(exist_ok=True)
    (voice / "history").mkdir(exist_ok=True)
    (voice / "candidates.jsonl").touch(exist_ok=True)
    snapshot_profile(voice, profile)
    return profile


def snapshot_profile(voice: Path, profile: dict | None = None) -> None:
    profile = profile if profile is not None else read_json(voice / "profile.json")
    path = voice / "history" / f"r{profile['revision']}.json"
    if not path.exists():
        write_json(path, profile)


def load_pinned(voice: Path, revision: int) -> dict:
    ensure_voice(voice)
    profile = read_json(voice / "profile.json")
    if profile["revision"] == revision:
        return profile
    hist = voice / "history" / f"r{revision}.json"
    if hist.exists():
        return read_json(hist)
    raise SystemExit(f"找不到钉住的风格版本 {revision}")


def parse_block(text: str) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        raise ValueError("块文件缺少 frontmatter")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise ValueError("块文件 frontmatter 没有结束")
    meta: dict = {"claimIds": [], "figureIds": []}
    for line in text[4:end].splitlines():
        if not line.strip() or ":" not in line:
            continue
        key, raw = line.split(":", 1)
        raw = raw.strip()
        if raw.startswith("[") and raw.endswith("]"):
            inner = raw[1:-1].strip()
            meta[key.strip()] = [part.strip() for part in inner.split(",") if part.strip()]
        else:
            meta[key.strip()] = raw
    body = text[end + 5 :]
    if body.startswith("\n"):
        body = body[1:]
    return meta, body


def format_block(meta: dict, body: str) -> str:
    claims = ", ".join(meta.get("claimIds") or [])
    figures = ", ".join(meta.get("figureIds") or [])
    prose = body.strip("\n")
    return (
        "---\n"
        f"id: {meta['id']}\n"
        f"status: {meta['status']}\n"
        f"claimIds: [{claims}]\n"
        f"figureIds: [{figures}]\n"
        "---\n\n"
        f"{prose}\n"
    )


def block_path(article: Path, block_id: str) -> Path:
    return article / "blocks" / f"{block_id}.md"


def load_block(article: Path, block_id: str) -> tuple[dict, str]:
    return parse_block(block_path(article, block_id).read_text(encoding="utf-8"))


def save_block(article: Path, meta: dict, body: str) -> None:
    path = block_path(article, meta["id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(format_block(meta, body), encoding="utf-8")


def load_meta(article: Path) -> dict:
    return read_json(article / "meta.json")


def save_meta(article: Path, meta: dict) -> None:
    write_json(article / "meta.json", meta)


def load_claims(article: Path) -> list:
    return read_jsonl(article / "claims.jsonl")


def save_claims(article: Path, claims: list) -> None:
    write_jsonl(article / "claims.jsonl", claims)


def load_outline(article: Path) -> dict:
    return read_json(article / "outline.json")


def load_figures(article: Path) -> list:
    path = article / "figures" / "manifest.json"
    if not path.exists():
        return []
    return read_json(path).get("figures", [])


def save_figures(article: Path, figures: list) -> None:
    write_json(article / "figures" / "manifest.json", {"figures": figures})


def append_revision(article: Path, row: dict) -> None:
    rows = read_jsonl(article / "revisions.jsonl")
    rows.append(row)
    write_jsonl(article / "revisions.jsonl", rows)


def outline_block_ids(outline: dict) -> list[str]:
    ids = []
    for section in outline.get("sections", []):
        for block_id in section.get("blockIds", []):
            ids.append(block_id)
    return ids


def figure_map(article: Path) -> dict:
    return {fig["id"]: fig for fig in load_figures(article)}


def claim_map(article: Path) -> dict:
    return {row["id"]: row for row in load_claims(article)}


def find_secrets(text: str) -> list[dict]:
    found = []
    for pattern in SECRET_RES:
        for match in pattern.finditer(text):
            found.append({"start": match.start(), "end": match.end(), "kind": pattern.pattern})
    return found


def extract_jsonl(path: Path) -> tuple[str, list[dict]]:
    parts = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        obj = json.loads(line)
        role = obj.get("role") or ""
        message = obj.get("message") or {}
        content = message.get("content")
        texts = []
        if isinstance(content, str):
            texts.append(content)
        elif isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text" and item.get("text"):
                    texts.append(item["text"])
        if texts:
            parts.append(f"## {role}\n\n" + "\n\n".join(texts).strip())
    document = "\n\n".join(parts).strip() + ("\n" if parts else "")
    return document, find_secrets(document)


def check_materials(hits: list, selected: list[str], supplements: list[str]) -> tuple[int, str]:
    by_id = {hit["id"]: hit for hit in hits}
    lines = []
    usable = False
    for hit in hits:
        chosen = hit["id"] in selected
        transcript = hit.get("transcript")
        has_file = bool(transcript) and Path(transcript).expanduser().is_file()
        if not chosen:
            lines.append(f"未勾选\t{hit['id']}\t{hit.get('title', '')}")
            continue
        if has_file:
            usable = True
            lines.append(f"有全文\t{hit['id']}\t{hit.get('title', '')}")
        else:
            lines.append(f"只有摘要\t{hit['id']}\t{hit.get('title', '')}")
    for item_id in selected:
        if item_id not in by_id:
            lines.append(f"只有摘要\t{item_id}\t不在检索结果里")
    for supplement in supplements:
        path = Path(supplement).expanduser()
        if path.is_file():
            usable = True
            lines.append(f"补充文件\t{path}")
        else:
            lines.append(f"找不到补充文件\t{path}")
    if not usable:
        lines.append("没有可用的全文或补充材料，停止。不要写文章。")
        return 2, "\n".join(lines) + "\n"
    return 0, "\n".join(lines) + "\n"


def check_sources(claims: list, selected: set[str], full_text: set[str] | None = None) -> list[str]:
    errors = []
    for claim in claims:
        for source in claim.get("sources") or []:
            if source.get("kind") != "conversation":
                continue
            source_id = source.get("id")
            if source_id not in selected:
                errors.append(f"主张 {claim['id']} 使用了未勾选的会话 {source_id}")
            elif full_text is not None and source_id not in full_text:
                errors.append(f"主张 {claim['id']} 使用了只有摘要的会话 {source_id}")
    return errors


def new_article(directory: Path, title: str, slug: str, topic: str, voice: Path) -> dict:
    profile = ensure_voice(voice)
    snapshot_profile(voice, profile)
    directory.mkdir(parents=True, exist_ok=True)
    meta = {
        "title": title,
        "slug": slug,
        "topic": topic,
        "styleRevision": profile["revision"],
        "locale": profile.get("locale") or "zh-CN",
        "phase": "intake",
        "claimsConfirmed": False,
        "outlineConfirmed": False,
        "writeAll": False,
        "includeProvenance": False,
    }
    save_meta(directory, meta)
    if not (directory / "claims.jsonl").exists():
        write_jsonl(directory / "claims.jsonl", [])
    if not (directory / "outline.json").exists():
        write_json(directory / "outline.json", {"sections": []})
    if not (directory / "figures" / "manifest.json").exists():
        save_figures(directory, [])
    if not (directory / "revisions.jsonl").exists():
        write_jsonl(directory / "revisions.jsonl", [])
    (directory / "blocks").mkdir(exist_ok=True)
    return meta


def set_gate(article: Path, claims_confirmed: bool | None, outline_confirmed: bool | None) -> tuple[int, str]:
    meta = load_meta(article)
    claims = load_claims(article)
    if claims_confirmed:
        if not any(row.get("status") == "accepted" for row in claims):
            return 1, "至少要有一条已接受的主张，才能确认主张。\n"
        open_rows = [row["id"] for row in claims if row.get("status") in ("candidate", "disputed")]
        if open_rows:
            return 1, "还有未决定的主张：" + "、".join(open_rows) + "\n"
        meta["claimsConfirmed"] = True
        meta["phase"] = "claims"
    if outline_confirmed:
        if not meta.get("claimsConfirmed"):
            return 1, "先确认主张，再确认大纲。\n"
        outline = load_outline(article)
        if not outline.get("sections"):
            return 1, "大纲是空的。\n"
        known = claim_map(article)
        figures = figure_map(article)
        for section in outline["sections"]:
            if not section.get("title") or not section.get("blockIds"):
                return 1, f"章节 {section.get('id', '')} 缺少标题或块。\n"
            for claim_id in section.get("claimIds", []):
                row = known.get(claim_id)
                if not row or row.get("status") != "accepted":
                    return 1, f"章节 {section['id']} 引用了未接受的主张 {claim_id}。\n"
            for figure_id in section.get("figureIds", []):
                if figure_id not in figures:
                    return 1, f"大纲引用了不存在的图 {figure_id}。\n"
        meta["outlineConfirmed"] = True
        meta["phase"] = "outline"
    save_meta(article, meta)
    return 0, "已更新确认状态。\n"


def allow_write_all(article: Path) -> None:
    meta = load_meta(article)
    meta["writeAll"] = True
    save_meta(article, meta)


def check_draft(article: Path, section: str) -> tuple[int, str]:
    meta = load_meta(article)
    if not meta.get("claimsConfirmed") or not meta.get("outlineConfirmed"):
        return 1, "主张和大纲都确认之后才能起草。\n"
    if section == "first":
        return 0, "可以写第一节。\n"
    if meta.get("writeAll"):
        return 0, "作者要求按当前风格写完，可以写后面的节。\n"
    outline = load_outline(article)
    first = outline["sections"][0]
    for block_id in first.get("blockIds", []):
        path = block_path(article, block_id)
        if not path.exists():
            return 1, "第一节还没写完，先不要写后面的节。\n"
        block_meta, _ = load_block(article, block_id)
        if block_meta.get("status") != "accepted":
            return 1, "第一节还没接受，先不要写后面的节。\n"
    return 0, "第一节已接受，可以写后面的节。\n"


def _active_rules(profile: dict) -> list[dict]:
    return [rule for rule in profile.get("rules", []) if rule.get("status") == "active"]


def show_block(article: Path, voice: Path, block_id: str) -> str:
    meta = load_meta(article)
    profile = load_pinned(voice, meta["styleRevision"])
    outline = load_outline(article)
    ids = outline_block_ids(outline)
    if block_id not in ids:
        raise SystemExit(f"大纲里没有块 {block_id}")
    index = ids.index(block_id)
    claims = claim_map(article)
    lines = [f"# 块 {block_id}", f"styleRevision: {meta['styleRevision']}", "规则:"]
    rules = _active_rules(profile)
    if rules:
        for rule in rules:
            lines.append(f"- {rule['id']}: {rule['text']}")
    else:
        lines.append("- （没有生效规则）")
    lines.append("术语:")
    if profile.get("terms"):
        for term in profile["terms"]:
            lines.append(f"- 用「{term.get('prefer', '')}」，不用「{term.get('avoid', '')}」")
    else:
        lines.append("- （没有）")
    lines.append("范文:")
    if profile.get("exemplarRefs"):
        for ref in profile["exemplarRefs"]:
            path = voice / ref
            if path.exists():
                lines.append(path.read_text(encoding="utf-8").strip())
    else:
        lines.append("- （没有）")
    if block_path(article, block_id).exists():
        block_meta, body = load_block(article, block_id)
        lines.append(f"status: {block_meta['status']}")
        lines.append("主张:")
        for claim_id in block_meta.get("claimIds", []):
            row = claims.get(claim_id)
            if row:
                lines.append(f"- {claim_id} {row.get('status')}: {row.get('text')}")
            else:
                lines.append(f"- {claim_id} 缺失")
        lines.append("正文:")
        lines.append(body.rstrip())
    else:
        lines.append("status: 未写")
        lines.append("正文:")
        lines.append("（还没有）")

    def neighbor(pos: int, label: str) -> None:
        lines.append(label)
        if pos < 0 or pos >= len(ids):
            lines.append("（没有）")
            return
        other = ids[pos]
        if not block_path(article, other).exists():
            lines.append(f"{other} 还没有正文")
            return
        _, other_body = load_block(article, other)
        lines.append(f"{other} 只读")
        lines.append(other_body.rstrip())

    neighbor(index - 1, "前一块:")
    neighbor(index + 1, "后一块:")
    return "\n".join(lines) + "\n"


def rewrite_block(article: Path, block_id: str, body: str, instruction: str) -> str:
    meta, old = load_block(article, block_id)
    meta["status"] = "draft"
    save_block(article, meta, body.strip() + "\n")
    append_revision(
        article,
        {
            "blockId": block_id,
            "instruction": instruction,
            "before": old.strip().replace("\n", " ")[:80],
            "afterStatus": "draft",
        },
    )
    diff = difflib.unified_diff(
        old.splitlines(),
        (body.strip() + "\n").splitlines(),
        fromfile=f"{block_id}.before",
        tofile=f"{block_id}.after",
        lineterm="",
    )
    return "\n".join(diff) + "\n"


def _compiled_lexicon(voice: Path) -> list[dict]:
    rules = []
    allowed = set()
    private_path = voice / "lexicon" / "private.json"
    private_entries = []
    if private_path.exists():
        private_entries = read_json(private_path).get("entries", [])
    for entry in private_entries:
        if entry.get("action") == "allow" and entry.get("entryId"):
            allowed.add(entry["entryId"])
        if entry.get("action") == "ban" and entry.get("patternId"):
            allowed.add("promote:" + entry["patternId"])

    def add_phrase(entry_id, phrase, severity, replacement=""):
        if entry_id in allowed or not phrase:
            return
        if re.search(r"[\u4e00-\u9fff]", phrase):
            pattern = re.compile(re.escape(phrase))
        else:
            pattern = re.compile(r"\b" + re.escape(phrase) + r"\b", re.I)
        rules.append(
            {
                "id": entry_id,
                "severity": severity,
                "pattern": pattern,
                "replacement": replacement,
            }
        )

    for path in sorted(lexicon_dir().glob("*.json")):
        data = read_json(path)
        for phrase in data.get("phrases", []):
            add_phrase(phrase["id"], phrase["phrase"], phrase["severity"])
        for pattern in data.get("patterns", []):
            severity = pattern["severity"]
            if "promote:" + pattern["id"] in allowed:
                severity = "ban"
            rules.append(
                {
                    "id": pattern["id"],
                    "severity": severity,
                    "pattern": re.compile(pattern["regex"], re.I),
                    "replacement": "",
                }
            )
    for entry in private_entries:
        action = entry.get("action")
        if action == "ban" and entry.get("phrase"):
            add_phrase(entry["id"], entry["phrase"], "ban")
        elif action == "prefer" and entry.get("phrase"):
            add_phrase(entry["id"], entry["phrase"], "ban", entry.get("replacement") or "")
    return rules


def sentence_bounds(text: str, index: int) -> tuple[int, int]:
    start = 0
    for pos, char in enumerate(text):
        if char in "。！？\n" and pos < index:
            start = pos + 1
    end = len(text)
    for pos in range(index, len(text)):
        if text[pos] in "。！？\n":
            end = pos + 1
            break
    return start, end


def lint_body(body: str, block_id: str, voice: Path) -> list[dict]:
    findings = []
    for rule in _compiled_lexicon(voice):
        for match in rule["pattern"].finditer(body):
            sent_start, sent_end = sentence_bounds(body, match.start())
            findings.append(
                {
                    "blockId": block_id,
                    "start": match.start(),
                    "end": match.end(),
                    "entryId": rule["id"],
                    "severity": rule["severity"],
                    "replacement": rule["replacement"],
                    "sentence": body[sent_start:sent_end].strip(),
                }
            )
    return findings


def iter_outline_blocks(article: Path) -> list[tuple[str, dict, str]]:
    rows = []
    for block_id in outline_block_ids(load_outline(article)):
        path = block_path(article, block_id)
        if not path.exists():
            rows.append((block_id, {}, ""))
            continue
        meta, body = load_block(article, block_id)
        rows.append((block_id, meta, body))
    return rows


def lint_article(article: Path, voice: Path, block_id: str | None = None) -> list[dict]:
    findings = []
    for current, _meta, body in iter_outline_blocks(article):
        if block_id and current != block_id:
            continue
        if body:
            findings.extend(lint_body(body, current, voice))
    if block_id is None:
        for fig in load_figures(article):
            caption = fig.get("caption") or ""
            if caption:
                findings.extend(lint_body(caption, "fig:" + fig["id"], voice))
    return findings


def accept_block(article: Path, voice: Path, block_id: str) -> tuple[int, str]:
    meta, body = load_block(article, block_id)
    claims = claim_map(article)
    for claim_id in meta.get("claimIds", []):
        row = claims.get(claim_id)
        if not row or row.get("status") != "accepted":
            return 1, f"主张 {claim_id} 还没接受，不能接受这块。\n"
    bans = [item for item in lint_body(body, block_id, voice) if item["severity"] == "ban"]
    if bans:
        return 1, "这块还有禁用说法：" + "、".join(item["entryId"] for item in bans) + "\n"
    if find_secrets(body):
        return 1, "这块正文里有疑似密钥，先删掉再接受。\n"
    meta["status"] = "accepted"
    save_block(article, meta, body)
    append_revision(
        article,
        {
            "blockId": block_id,
            "instruction": "接受这块",
            "before": body.strip().replace("\n", " ")[:80],
            "afterStatus": "accepted",
        },
    )
    article_meta = load_meta(article)
    article_meta["phase"] = "review"
    save_meta(article, article_meta)
    return 0, f"已接受 {block_id}。\n"


def mark_claim(article: Path, claim_id: str, status: str | None, text: str | None, resolved: bool | None) -> tuple[int, str]:
    claims = load_claims(article)
    target = next((row for row in claims if row["id"] == claim_id), None)
    if target is None:
        return 1, f"没有主张 {claim_id}。\n"
    invalidate = False
    if text is not None and text != target.get("text"):
        target["text"] = text
        invalidate = True
    if status is not None and status != target.get("status"):
        if status in ("rejected", "disputed"):
            invalidate = True
        target["status"] = status
    if resolved is not None:
        target["resolved"] = resolved
    save_claims(article, claims)
    stale_ids = []
    if invalidate:
        for block_id in outline_block_ids(load_outline(article)):
            path = block_path(article, block_id)
            if not path.exists():
                continue
            meta, body = load_block(article, block_id)
            if claim_id in (meta.get("claimIds") or []):
                meta["status"] = "stale"
                save_block(article, meta, body)
                stale_ids.append(block_id)
    if stale_ids:
        return 0, "已更新主张，这些块待复核：" + "、".join(stale_ids) + "\n"
    return 0, "已更新主张。\n"


def _figure_errors(article: Path, fig: dict) -> list[str]:
    errors = []
    kind = fig.get("kind")
    source = article / fig.get("source", "")
    if fig.get("status") != "accepted":
        errors.append(f"图 {fig['id']} 还没接受。")
        return errors
    if kind == "raster":
        if not fig.get("confirmed"):
            errors.append(f"图 {fig['id']} 没有作者的生图确认。")
        if not fig.get("prompt"):
            errors.append(f"图 {fig['id']} 缺少提示词。")
        if not source.is_file():
            errors.append(f"图 {fig['id']} 的文件不在。")
    elif kind == "remote":
        if not (fig.get("license") or "").strip():
            errors.append(f"图 {fig['id']} 缺少出处或许可。")
        if not source.is_file():
            errors.append(f"图 {fig['id']} 的本地副本不在。")
    elif kind == "drawio":
        svg = source.with_suffix(".svg")
        if not source.is_file() or not svg.is_file():
            errors.append(f"图 {fig['id']} 还没有 draw.io 源文件和导出的 SVG。")
    elif kind in ("mermaid", "svg-chart"):
        if not source.is_file():
            errors.append(f"图 {fig['id']} 的源文件不在。")
    else:
        errors.append(f"图 {fig['id']} 的类型无法导出。")
    return errors


def _render_figure(article: Path, fig: dict, anchors: bool) -> str:
    source = article / fig.get("source", "")
    if fig.get("status") == "planned" or not source.is_file():
        note = f"图位 {fig['id']} 还没有可分享的文件。"
        if anchors:
            return f"<!-- figure:{fig['id']} planned -->\n\n{note}\n"
        return note + "\n"
    caption = fig.get("caption") or ""
    alt = fig.get("alt") or fig["id"]
    if fig.get("kind") == "mermaid":
        body = source.read_text(encoding="utf-8").strip()
        rendered = f"```mermaid\n{body}\n```\n"
    else:
        rendered = f"![{alt}]({fig['source']})\n"
    if caption:
        rendered += f"\n{caption}\n"
    return rendered


def render_article(article: Path, anchors: bool, provenance: bool) -> str:
    meta = load_meta(article)
    outline = load_outline(article)
    figures = figure_map(article)
    chunks = [f"# {meta['title']}", ""]
    for section in outline.get("sections", []):
        chunks.append(f"## {section['title']}")
        chunks.append("")
        for block_id in section.get("blockIds", []):
            path = block_path(article, block_id)
            body = ""
            figure_ids: list[str] = []
            if path.exists():
                _meta, body = load_block(article, block_id)
                figure_ids = list(_meta.get("figureIds") or [])
            if anchors:
                chunks.append(f"<!-- block:{block_id} -->")
                chunks.append(body.rstrip())
                chunks.append(f"<!-- /block:{block_id} -->")
                chunks.append("")
            elif body:
                chunks.append(body.rstrip())
                chunks.append("")
            for figure_id in figure_ids:
                fig = figures.get(figure_id)
                if fig:
                    chunks.append(_render_figure(article, fig, anchors).rstrip())
                    chunks.append("")
    if provenance:
        chunks.append("## 来源")
        chunks.append("")
        for claim in load_claims(article):
            if claim.get("status") != "accepted":
                continue
            for source in claim.get("sources") or []:
                chunks.append(f"- {claim['id']}: {source.get('kind')} {source.get('id', '')}")
        chunks.append("")
    return "\n".join(chunks).rstrip() + "\n"


def export_errors(article: Path, voice: Path) -> list[str]:
    meta = load_meta(article)
    errors = []
    if not meta.get("claimsConfirmed") or not meta.get("outlineConfirmed"):
        errors.append("主张或大纲还没确认。")
    claims = claim_map(article)
    for claim in claims.values():
        if claim.get("secret") and not claim.get("resolved"):
            errors.append(f"主张 {claim['id']} 标了密钥，作者还没处理。")
    if (article / "materials.json").exists():
        errors.extend(
            check_sources(
                load_claims(article),
                materials_selected(article),
                materials_full_text(article),
            )
        )
    else:
        errors.append("缺少 materials.json，无法核对会话是否勾选。")
    seen_figures = set()
    for block_id, block_meta, body in iter_outline_blocks(article):
        if not block_meta:
            errors.append(f"块 {block_id} 还没有正文。")
            continue
        if block_meta.get("status") != "accepted":
            errors.append(f"块 {block_id} 状态是 {block_meta.get('status')}，不能进入分享包。")
        for claim_id in block_meta.get("claimIds") or []:
            row = claims.get(claim_id)
            if not row or row.get("status") != "accepted":
                errors.append(f"块 {block_id} 使用了未接受的主张 {claim_id}。")
        if find_secrets(body):
            errors.append(f"块 {block_id} 含有疑似密钥。")
        for figure_id in block_meta.get("figureIds") or []:
            seen_figures.add(figure_id)
    for section in load_outline(article).get("sections", []):
        for figure_id in section.get("figureIds") or []:
            seen_figures.add(figure_id)
    figures = figure_map(article)
    for figure_id in seen_figures:
        fig = figures.get(figure_id)
        if not fig:
            errors.append(f"缺少图 {figure_id}。")
            continue
        errors.extend(_figure_errors(article, fig))
    for finding in lint_article(article, voice):
        if finding["severity"] == "ban":
            errors.append(
                f"块 {finding['blockId']} 有禁用说法 {finding['entryId']}：{finding['sentence']}"
            )
    return errors


def _copy_figure(article: Path, fig: dict, dest_figures: Path) -> None:
    source = article / fig["source"]
    dest_figures.mkdir(parents=True, exist_ok=True)
    target = dest_figures / source.name
    shutil.copyfile(source, target)
    if fig.get("kind") == "drawio":
        svg = source.with_suffix(".svg")
        shutil.copyfile(svg, dest_figures / svg.name)
    if fig.get("kind") == "raster":
        prompt = dest_figures / (source.stem + ".prompt.txt")
        prompt.write_text(fig.get("prompt", ""), encoding="utf-8")


def compile_article(article: Path, voice: Path, do_export: bool) -> tuple[int, str]:
    ensure_voice(voice)
    working = render_article(article, anchors=True, provenance=False)
    (article / "article.md").write_text(working, encoding="utf-8")
    if not do_export:
        return 0, f"已写 {article / 'article.md'}\n"
    errors = export_errors(article, voice)
    if errors:
        return 1, "分享包没有生成。\n" + "\n".join(errors) + "\n"
    meta = load_meta(article)
    export_text = render_article(article, anchors=False, provenance=bool(meta.get("includeProvenance")))
    tmp = article / ".export-tmp"
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir()
    (tmp / "article.md").write_text(export_text, encoding="utf-8")
    copied = set()
    for _block_id, block_meta, _body in iter_outline_blocks(article):
        for figure_id in block_meta.get("figureIds") or []:
            copied.add(figure_id)
    for section in load_outline(article).get("sections", []):
        for figure_id in section.get("figureIds") or []:
            copied.add(figure_id)
    for figure_id in copied:
        _copy_figure(article, figure_map(article)[figure_id], tmp / "figures")
    final = article / "export"
    if final.exists():
        shutil.rmtree(final)
    tmp.rename(final)
    meta["phase"] = "export"
    save_meta(article, meta)
    return 0, f"分享包：{final}\n"


def sync_anchors(article: Path) -> tuple[int, str]:
    article_md = article / "article.md"
    if not article_md.exists():
        return 2, "没有 article.md。\n"
    text = article_md.read_text(encoding="utf-8")
    ids = outline_block_ids(load_outline(article))
    matches = list(BLOCK_RE.finditer(text))
    found = [match.group(1) for match in matches]
    if found != ids:
        lines = ["锚点对不上，没有写回任何块。请指定改的是哪一块。", ""]
        for block_id in ids:
            lines.append(f"## {block_id}")
            path = block_path(article, block_id)
            if path.exists():
                _meta, body = load_block(article, block_id)
                lines.append(body.rstrip())
            else:
                lines.append("（没有正文）")
            lines.append("")
        return 2, "\n".join(lines)
    bodies = {match.group(1): match.group(2).strip() + "\n" for match in matches}
    changed = []
    for block_id in ids:
        meta, old = load_block(article, block_id)
        new = bodies[block_id]
        if new.strip() != old.strip():
            meta["status"] = "draft"
            save_block(article, meta, new)
            changed.append(block_id)
    if not changed:
        return 0, "锚点已核对，正文没有变化。\n"
    return 0, "已收回改动，这些块回到审阅：" + "、".join(changed) + "\n"


def _paragraphs(markdown: str) -> list[str]:
    lines = []
    skipping = False
    for line in markdown.splitlines():
        if line.startswith("```"):
            skipping = not skipping
            continue
        if skipping or line.startswith("#"):
            continue
        lines.append(line)
    chunks = []
    buf: list[str] = []
    for line in lines:
        if line.strip():
            buf.append(line.strip())
        elif buf:
            chunks.append("".join(buf))
            buf = []
    if buf:
        chunks.append("".join(buf))
    return chunks


def observe_style(voice: Path, paths: list[Path]) -> str:
    profile = ensure_voice(voice)
    paragraphs = []
    depths = []
    wo = 0
    wo_men = 0
    for path in paths:
        text = path.read_text(encoding="utf-8")
        paragraphs.extend(_paragraphs(text))
        for line in text.splitlines():
            if line.startswith("#"):
                depths.append(len(line) - len(line.lstrip("#")))
        wo += len(re.findall(r"我", text))
        wo_men += len(re.findall(r"我们", text))
    wo -= wo_men
    lengths = sorted(len(item) for item in paragraphs) or [0]
    median = lengths[len(lengths) // 2]
    person = "第一人称" if wo >= wo_men else "我们"
    depth = max(depths) if depths else 0
    band = [item for item in paragraphs if 80 <= len(item) <= 280]
    band.sort(key=lambda item: abs(len(item) - median))
    exemplars = band[:3]
    row = {
        "id": f"cand-observe-{profile['revision']}-{len(read_jsonl(voice / 'candidates.jsonl')) + 1}",
        "text": f"段长中位数约 {median} 字，标题最深 {depth} 级，人称偏向{person}",
        "status": "candidate",
        "source": "observe",
        "exemplars": exemplars,
    }
    rows = read_jsonl(voice / "candidates.jsonl")
    rows.append(row)
    write_jsonl(voice / "candidates.jsonl", rows)
    lines = [
        f"段长中位数: {median}",
        f"标题深度: {depth}",
        f"人称: {person}",
        "建议范文:",
    ]
    if exemplars:
        for item in exemplars:
            lines.append(f"- {item}")
    else:
        lines.append("- （没有落在 80 到 280 字里的段落）")
    lines.append("这是候选，风格版本没有变。")
    return "\n".join(lines) + "\n"


def bump_style(voice: Path, rule_text: str) -> tuple[int, str]:
    profile = ensure_voice(voice)
    snapshot_profile(voice, profile)
    history = voice / "history" / f"r{profile['revision']}.json"
    write_json(history, profile)
    profile["revision"] = int(profile["revision"]) + 1
    rule_id = f"r{len(profile.get('rules', [])) + 1}"
    profile.setdefault("rules", []).append(
        {
            "id": rule_id,
            "text": rule_text,
            "strength": "enforce",
            "evidenceArticles": 1,
            "status": "active",
        }
    )
    write_json(voice / "profile.json", profile)
    snapshot_profile(voice, profile)
    return 0, f"风格版本现在是 {profile['revision']}。已有文章的 styleRevision 不会被这个命令修改。\n"


def apply_private(voice: Path, action: str, phrase: str, replacement: str, entry_id: str, pattern_id: str) -> None:
    ensure_voice(voice)
    path = voice / "lexicon" / "private.json"
    data = read_json(path)
    if action == "allow":
        data["entries"].append({"id": f"allow-{entry_id}", "action": "allow", "entryId": entry_id})
    elif action == "promote-pattern":
        data["entries"].append({"id": f"promote-{pattern_id}", "action": "ban", "patternId": pattern_id})
    elif action == "prefer":
        data["entries"].append(
            {
                "id": f"prefer-{len(data['entries']) + 1}",
                "action": "prefer",
                "phrase": phrase,
                "replacement": replacement,
            }
        )
    else:
        data["entries"].append(
            {"id": f"ban-{len(data['entries']) + 1}", "action": "ban", "phrase": phrase}
        )
    write_json(path, data)


def materials_selected(article: Path) -> set[str]:
    path = article / "materials.json"
    if not path.exists():
        return set()
    return set(read_json(path).get("selected") or [])


def materials_full_text(article: Path) -> set[str] | None:
    path = article / "materials.json"
    if not path.exists():
        return None
    data = read_json(path)
    if "fullText" not in data:
        return None
    return set(data.get("fullText") or [])
