#!/usr/bin/env python3
"""聊出文章来的确定性命令。起草和改写仍由 agent 完成。"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cta_lib


def _voice(args) -> Path:
    return cta_lib.voice_home(getattr(args, "voice", None))


def _article(args) -> Path:
    return Path(args.article)


def cmd_extract(args) -> int:
    document, secrets = cta_lib.extract_jsonl(Path(args.jsonl))
    if args.out:
        Path(args.out).write_text(document, encoding="utf-8")
    else:
        sys.stdout.write(document)
    if args.secrets_out:
        cta_lib.write_json(Path(args.secrets_out), secrets)
    print(f"疑似密钥 {len(secrets)} 处", file=sys.stderr)
    return 0


def cmd_check_materials(args) -> int:
    hits = cta_lib.read_json(Path(args.hits))
    selected = [item for item in args.selected.split(",") if item]
    code, report = cta_lib.check_materials(hits, selected, args.supplement or [])
    sys.stdout.write(report)
    return code


def cmd_check_sources(args) -> int:
    article = _article(args)
    errors = cta_lib.check_sources(
        cta_lib.load_claims(article),
        cta_lib.materials_selected(article),
        cta_lib.materials_full_text(article),
    )
    if errors:
        print("\n".join(errors))
        return 1
    print("来源都在勾选范围内。")
    return 0


def cmd_new_article(args) -> int:
    directory = Path(args.dir) if args.dir else Path.cwd() / "articles" / args.slug
    meta = cta_lib.new_article(directory, args.title, args.slug, args.topic, _voice(args))
    print(f"文章目录：{directory}")
    print(f"钉住的风格版本：{meta['styleRevision']}")
    return 0


def cmd_set_gate(args) -> int:
    if not args.claims and not args.outline:
        print("指定 --claims 或 --outline。")
        return 1
    code, message = cta_lib.set_gate(_article(args), args.claims or None, args.outline or None)
    sys.stdout.write(message)
    return code


def cmd_check_draft(args) -> int:
    code, message = cta_lib.check_draft(_article(args), args.section)
    sys.stdout.write(message)
    return code


def cmd_allow_write_all(args) -> int:
    cta_lib.allow_write_all(_article(args))
    print("已记下：作者要求按当前风格写完。")
    return 0


def cmd_show_block(args) -> int:
    sys.stdout.write(cta_lib.show_block(_article(args), _voice(args), args.block))
    return 0


def cmd_rewrite_block(args) -> int:
    body = Path(args.body_file).read_text(encoding="utf-8")
    sys.stdout.write(cta_lib.rewrite_block(_article(args), args.block, body, args.instruction))
    return 0


def cmd_accept_block(args) -> int:
    code, message = cta_lib.accept_block(_article(args), _voice(args), args.block)
    sys.stdout.write(message)
    return code


def cmd_mark_claim(args) -> int:
    resolved = None
    if args.resolved:
        resolved = True
    if args.unresolved:
        resolved = False
    code, message = cta_lib.mark_claim(_article(args), args.id, args.status, args.text, resolved)
    sys.stdout.write(message)
    return code


def cmd_lint(args) -> int:
    findings = cta_lib.lint_article(_article(args), _voice(args), args.block)
    print(json.dumps(findings, ensure_ascii=False, indent=2))
    if any(item["severity"] == "ban" for item in findings):
        return 1
    return 0


def cmd_compile(args) -> int:
    code, message = cta_lib.compile_article(_article(args), _voice(args), args.export)
    sys.stdout.write(message)
    return code


def cmd_sync(args) -> int:
    code, message = cta_lib.sync_anchors(_article(args))
    sys.stdout.write(message)
    return code


def cmd_observe(args) -> int:
    sys.stdout.write(cta_lib.observe_style(_voice(args), [Path(item) for item in args.input]))
    return 0


def cmd_bump(args) -> int:
    code, message = cta_lib.bump_style(_voice(args), args.rule)
    sys.stdout.write(message)
    return code


def cmd_private(args) -> int:
    cta_lib.apply_private(_voice(args), args.action, args.phrase or "", args.replacement or "", args.entry or "", args.pattern or "")
    print("已写入私有词表。")
    return 0


def cmd_demo(_args) -> int:
    fixture = cta_lib.demo_root() / "fixture"
    voice = cta_lib.demo_root() / "voice"
    article = cta_lib.demo_root() / "article"
    if voice.exists():
        shutil.rmtree(voice)
    if article.exists():
        shutil.rmtree(article)
    voice.mkdir(parents=True)
    profile = cta_lib.read_json(fixture / "profile.json")
    cta_lib.write_json(voice / "profile.json", profile)
    cta_lib.write_json(voice / "lexicon" / "private.json", cta_lib.empty_private())
    exemplar = voice / "exemplars"
    exemplar.mkdir()
    shutil.copyfile(fixture / "exemplar.md", exemplar / "e1.md")
    (voice / "candidates.jsonl").touch()
    cta_lib.snapshot_profile(voice, profile)

    hits = cta_lib.read_json(fixture / "hits.json")
    for hit in hits:
        if hit.get("transcript"):
            hit["transcript"] = str(fixture / hit["transcript"])
    code, report = cta_lib.check_materials(hits, ["conv-full", "conv-summary"], [])
    sys.stdout.write(report)
    if code != 0:
        return code
    _document, secrets = cta_lib.extract_jsonl(fixture / "transcript.jsonl")
    if not secrets:
        print("demo 失败：样例会话里的密钥没有被标出。")
        return 1
    print(f"全文已抽出，疑似密钥 {len(secrets)} 处。密钥留在抽取结果里，不进入正文。")

    cta_lib.new_article(article, "按块修订", "block-revision", "块修订", voice)
    shutil.copyfile(fixture / "claims.jsonl", article / "claims.jsonl")
    shutil.copyfile(fixture / "outline.json", article / "outline.json")
    shutil.copyfile(fixture / "materials.json", article / "materials.json")
    figures = article / "figures"
    figures.mkdir(exist_ok=True)
    shutil.copyfile(fixture / "fig-flow.mmd", figures / "fig-flow.mmd")
    shutil.copyfile(fixture / "manifest.json", figures / "manifest.json")
    code, message = cta_lib.set_gate(article, True, None)
    sys.stdout.write(message)
    if code != 0:
        return code
    code, message = cta_lib.set_gate(article, None, True)
    sys.stdout.write(message)
    if code != 0:
        return code
    code, message = cta_lib.check_draft(article, "first")
    sys.stdout.write(message)
    if code != 0:
        return code
    (article / "blocks").mkdir(exist_ok=True)
    shutil.copyfile(fixture / "blocks" / "b001.md", article / "blocks" / "b001.md")
    code, message = cta_lib.check_draft(article, "rest")
    if code == 0:
        print("demo 失败：第一节还没接受时，不应该写后面的节。")
        return 1
    sys.stdout.write(message)
    code, message = cta_lib.accept_block(article, voice, "b001")
    sys.stdout.write(message)
    if code != 0:
        return code
    code, message = cta_lib.check_draft(article, "rest")
    sys.stdout.write(message)
    if code != 0:
        return code
    shutil.copyfile(fixture / "blocks" / "b002.md", article / "blocks" / "b002.md")
    code, message = cta_lib.accept_block(article, voice, "b002")
    sys.stdout.write(message)
    if code != 0:
        return code
    code, message = cta_lib.compile_article(article, voice, True)
    sys.stdout.write(message)
    if code != 0:
        return code
    export = (article / "export" / "article.md").read_text(encoding="utf-8")
    if "<!-- block:" in export or "conv-full" in export or "sk-demo" in export:
        print("demo 失败：分享包里出现了锚点、会话 id 或密钥。")
        return 1
    print(f"读者打开：{article / 'export'}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="聊出文章来")
    parser.add_argument("--voice", help="声音目录，默认 $CHAT_TO_ARTICLE_HOME 或 ~/.chat-to-article")
    sub = parser.add_subparsers(dest="command", required=True)

    extract = sub.add_parser("extract")
    extract.add_argument("--jsonl", required=True)
    extract.add_argument("--out")
    extract.add_argument("--secrets-out")
    extract.set_defaults(func=cmd_extract)

    materials = sub.add_parser("check-materials")
    materials.add_argument("--hits", required=True)
    materials.add_argument("--selected", default="")
    materials.add_argument("--supplement", action="append")
    materials.set_defaults(func=cmd_check_materials)

    sources = sub.add_parser("check-sources")
    sources.add_argument("--article", required=True)
    sources.set_defaults(func=cmd_check_sources)

    create = sub.add_parser("new-article")
    create.add_argument("--dir")
    create.add_argument("--title", required=True)
    create.add_argument("--slug", required=True)
    create.add_argument("--topic", required=True)
    create.set_defaults(func=cmd_new_article)

    gate = sub.add_parser("set-gate")
    gate.add_argument("--article", required=True)
    gate.add_argument("--claims", action="store_true")
    gate.add_argument("--outline", action="store_true")
    gate.set_defaults(func=cmd_set_gate)

    draft = sub.add_parser("check-draft")
    draft.add_argument("--article", required=True)
    draft.add_argument("--section", choices=["first", "rest"], required=True)
    draft.set_defaults(func=cmd_check_draft)

    write_all = sub.add_parser("allow-write-all")
    write_all.add_argument("--article", required=True)
    write_all.set_defaults(func=cmd_allow_write_all)

    show = sub.add_parser("show-block")
    show.add_argument("--article", required=True)
    show.add_argument("--block", required=True)
    show.set_defaults(func=cmd_show_block)

    rewrite = sub.add_parser("rewrite-block")
    rewrite.add_argument("--article", required=True)
    rewrite.add_argument("--block", required=True)
    rewrite.add_argument("--body-file", required=True)
    rewrite.add_argument("--instruction", required=True)
    rewrite.set_defaults(func=cmd_rewrite_block)

    accept = sub.add_parser("accept-block")
    accept.add_argument("--article", required=True)
    accept.add_argument("--block", required=True)
    accept.set_defaults(func=cmd_accept_block)

    claim = sub.add_parser("mark-claim")
    claim.add_argument("--article", required=True)
    claim.add_argument("--id", required=True)
    claim.add_argument("--status", choices=["candidate", "accepted", "rejected", "disputed"])
    claim.add_argument("--text")
    claim.add_argument("--resolved", action="store_true")
    claim.add_argument("--unresolved", action="store_true")
    claim.set_defaults(func=cmd_mark_claim)

    lint = sub.add_parser("lint")
    lint.add_argument("--article", required=True)
    lint.add_argument("--block")
    lint.set_defaults(func=cmd_lint)

    compile_cmd = sub.add_parser("compile")
    compile_cmd.add_argument("--article", required=True)
    compile_cmd.add_argument("--export", action="store_true")
    compile_cmd.set_defaults(func=cmd_compile)

    sync = sub.add_parser("sync-anchors")
    sync.add_argument("--article", required=True)
    sync.set_defaults(func=cmd_sync)

    observe = sub.add_parser("observe-style")
    observe.add_argument("--input", action="append", required=True)
    observe.set_defaults(func=cmd_observe)

    bump = sub.add_parser("bump-style")
    bump.add_argument("--rule", required=True)
    bump.set_defaults(func=cmd_bump)

    private = sub.add_parser("private")
    private.add_argument("--action", choices=["ban", "prefer", "allow", "promote-pattern"], required=True)
    private.add_argument("--phrase")
    private.add_argument("--replacement")
    private.add_argument("--entry")
    private.add_argument("--pattern")
    private.set_defaults(func=cmd_private)

    demo = sub.add_parser("demo")
    demo.set_defaults(func=cmd_demo)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
