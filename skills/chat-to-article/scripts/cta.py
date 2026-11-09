#!/usr/bin/env python3
"""聊出文章来的机械辅助脚本（仅处理会话文本脱水、词表扫描、全文编译导出与块锚点同步）。

主流程、写作动机提取、大纲规划、正文起草与修订均由 Agent 自主完成。
"""

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
    if args.coverage:
        complete, reason = cta_lib.validate_transcript_coverage(Path(args.jsonl), Path(args.coverage))
        if not complete:
            print(f"全文未核验：{reason}", file=sys.stderr)
            return 2
    document, secrets = cta_lib.extract_jsonl(Path(args.jsonl))
    if args.out:
        Path(args.out).write_text(document, encoding="utf-8")
    else:
        sys.stdout.write(document)
    if args.secrets_out:
        cta_lib.write_json(Path(args.secrets_out), secrets)
    print(
        f"已抽出 {cta_lib.count_text_messages(Path(args.jsonl))} 条文本消息；疑似密钥 {len(secrets)} 处",
        file=sys.stderr,
    )
    return 0


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

    _document, secrets = cta_lib.extract_jsonl(fixture / "transcript.jsonl")
    if not secrets:
        print("demo 失败：样例会话里的密钥没有被标出。")
        return 1
    print(f"全文已抽出，疑似密钥 {len(secrets)} 处。密钥留在抽取结果里，不进入正文。")

    article.mkdir(parents=True, exist_ok=True)
    cta_lib.write_json(
        article / "meta.json",
        {
            "title": "按块修订",
            "slug": "block-revision",
            "topic": "块修订",
            "styleRevision": profile["revision"],
            "locale": profile.get("locale") or "zh-CN",
            "phase": "review",
            "writingPlanConfirmed": True,
            "claimsConfirmed": True,
            "outlineConfirmed": True,
            "writeAll": False,
            "includeProvenance": False,
        },
    )
    for name in ("writing-plan.json", "claims.jsonl", "outline.json", "materials.json"):
        shutil.copyfile(fixture / name, article / name)
    figures = article / "figures"
    figures.mkdir(exist_ok=True)
    shutil.copyfile(fixture / "fig-flow.mmd", figures / "fig-flow.mmd")
    shutil.copyfile(fixture / "manifest.json", figures / "manifest.json")
    blocks_dir = article / "blocks"
    blocks_dir.mkdir(exist_ok=True)
    for block_id in ("b001", "b002"):
        meta, body = cta_lib.parse_block((fixture / "blocks" / f"{block_id}.md").read_text(encoding="utf-8"))
        meta["status"] = "accepted"
        cta_lib.save_block(article, meta, body)
    cta_lib.write_jsonl(
        article / "revisions.jsonl",
        [
            {"blockId": "b001", "instruction": "接受这块", "before": "改文章时，我最怕只想换掉一句话…", "afterStatus": "accepted"},
            {"blockId": "b002", "instruction": "接受这块", "before": "结构图用 Mermaid 源文件放在 figures/…", "afterStatus": "accepted"},
        ],
    )
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
    parser = argparse.ArgumentParser(description="聊出文章来（机械辅助脚本）")
    parser.add_argument("--voice", help="声音目录，默认 $CHAT_TO_ARTICLE_HOME 或 ~/.chat-to-article")
    sub = parser.add_subparsers(dest="command", required=True)

    extract = sub.add_parser("extract", help="从会话 JSONL 抽出纯文本并扫描疑似密钥")
    extract.add_argument("--jsonl", required=True)
    extract.add_argument("--coverage", help="可选：核对分页和截断状态的 coverage.json")
    extract.add_argument("--out")
    extract.add_argument("--secrets-out")
    extract.set_defaults(func=cmd_extract)

    lint = sub.add_parser("lint", help="按共享与私有词表扫描禁用套话和观察句式")
    lint.add_argument("--article", required=True)
    lint.add_argument("--block")
    lint.set_defaults(func=cmd_lint)

    compile_cmd = sub.add_parser("compile", help="按大纲把块拼成工作稿 article.md 或干净的分享包 export/")
    compile_cmd.add_argument("--article", required=True)
    compile_cmd.add_argument("--export", action="store_true")
    compile_cmd.set_defaults(func=cmd_compile)

    sync = sub.add_parser("sync-anchors", help="把用户在 article.md 的修改按块锚点收回块文件")
    sync.add_argument("--article", required=True)
    sync.set_defaults(func=cmd_sync)

    demo = sub.add_parser("demo", help="生成样例文章与分享包")
    demo.set_defaults(func=cmd_demo)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
