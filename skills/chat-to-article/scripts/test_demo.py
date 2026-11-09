#!/usr/bin/env python3
"""验证机械辅助脚本（extract、lint、compile、sync-anchors）与产物状态约束。"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cta_lib

FIXTURE = cta_lib.demo_root() / "fixture"
CTA = Path(__file__).resolve().parent / "cta.py"


def write_voice(voice: Path, profile: dict | None = None) -> None:
    voice.mkdir(parents=True)
    cta_lib.write_json(voice / "profile.json", profile or cta_lib.empty_profile(1))
    cta_lib.write_json(voice / "lexicon" / "private.json", cta_lib.empty_private())
    (voice / "exemplars").mkdir()
    (voice / "candidates.jsonl").touch()
    cta_lib.snapshot_profile(voice)


def ready(root: Path) -> tuple[Path, Path]:
    voice = root / "voice"
    article = root / "article"
    write_voice(voice, cta_lib.read_json(FIXTURE / "profile.json"))
    article.mkdir(parents=True, exist_ok=True)
    cta_lib.write_json(
        article / "meta.json",
        {
            "title": "按块修订",
            "slug": "block-revision",
            "topic": "块修订",
            "styleRevision": 1,
            "locale": "zh-CN",
            "phase": "review",
            "writingPlanConfirmed": True,
            "claimsConfirmed": True,
            "outlineConfirmed": True,
            "writeAll": False,
            "includeProvenance": False,
        },
    )
    for name in ("writing-plan.json", "claims.jsonl", "outline.json", "materials.json"):
        shutil.copyfile(FIXTURE / name, article / name)
    (article / "figures").mkdir(exist_ok=True)
    shutil.copyfile(FIXTURE / "fig-flow.mmd", article / "figures" / "fig-flow.mmd")
    shutil.copyfile(FIXTURE / "manifest.json", article / "figures" / "manifest.json")
    (article / "blocks").mkdir(exist_ok=True)
    for block_id in ("b001", "b002"):
        meta, body = cta_lib.parse_block((FIXTURE / "blocks" / f"{block_id}.md").read_text(encoding="utf-8"))
        meta["status"] = "accepted"
        cta_lib.save_block(article, meta, body)
    return article, voice


class DemoTests(unittest.TestCase):
    def test_extract_drops_tool_use_and_flags_secret(self):
        document, secrets = cta_lib.extract_jsonl(FIXTURE / "transcript.jsonl")
        self.assertIn("整篇都被重写", document)
        self.assertNotIn("TOOL_ONLY_MARKER", document)
        self.assertTrue(secrets)
        self.assertIn("sk-demo-secret-key-1234567890", document)

    def test_validate_transcript_coverage(self):
        ok, reason = cta_lib.validate_transcript_coverage(FIXTURE / "transcript.jsonl", FIXTURE / "coverage.json")
        self.assertTrue(ok, reason)

    def test_export_package_and_reader_view(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 0, message)
            export = (article / "export" / "article.md").read_text(encoding="utf-8")
            self.assertIn("```mermaid", export)
            self.assertIn("主张", export)
            self.assertNotIn("<!-- block:", export)
            self.assertNotIn("conv-full", export)
            self.assertNotIn("sk-demo", export)
            self.assertTrue((article / "export" / "figures" / "fig-flow.mmd").is_file())
            names = sorted(path.name for path in (article / "export").iterdir())
            self.assertEqual(names, ["article.md", "figures"])
            self.assertFalse((article / "export" / "claims.jsonl").exists())

    def test_ban_does_not_publish_package(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            code, _message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 0)
            original = (article / "export" / "article.md").read_bytes()
            meta, body = cta_lib.load_block(article, "b002")
            meta["status"] = "accepted"
            cta_lib.save_block(article, meta, body.rstrip() + "值得注意的是，这里不该出现。\n")
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1, message)
            self.assertIn("禁用说法", message)
            self.assertEqual(original, (article / "export" / "article.md").read_bytes())

    def test_watch_allows_export_and_allow_suppresses_ban(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            meta, body = cta_lib.load_block(article, "b001")
            cta_lib.save_block(article, meta, body.rstrip() + "这个闭环先留在观察里。\n")
            findings = cta_lib.lint_article(article, voice, "b001")
            self.assertTrue(any(item["entryId"] == "zh-bihuan" and item["severity"] == "watch" for item in findings))
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 0, message)
            cta_lib.save_block(article, meta, "值得注意的是，这句话本应挡住导出。另一句说明放行只作用于这一条。\n")
            code, _message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)
            private_data = cta_lib.read_json(voice / "lexicon" / "private.json")
            private_data["entries"].append({"id": "allow-zh-zhuyi", "action": "allow", "entryId": "zh-zhuyi"})
            cta_lib.write_json(voice / "lexicon" / "private.json", private_data)
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 0, message)

    def test_prefer_and_pattern_promotion(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            meta, body = cta_lib.load_block(article, "b001")
            cta_lib.save_block(article, meta, body.rstrip() + "这里写的是对话语料，应改成聊天记录。\n")
            private_data = cta_lib.read_json(voice / "lexicon" / "private.json")
            private_data["entries"].append({"id": "prefer-1", "action": "prefer", "phrase": "对话语料", "replacement": "聊天记录"})
            cta_lib.write_json(voice / "lexicon" / "private.json", private_data)
            findings = cta_lib.lint_body(cta_lib.load_block(article, "b001")[1], "b001", voice)
            matched = [item for item in findings if item["replacement"] == "聊天记录"]
            self.assertTrue(matched)
            self.assertEqual(matched[0]["severity"], "ban")
            code, _message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)

        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            meta, _body = cta_lib.load_block(article, "b001")
            cta_lib.save_block(article, meta, "这不是整篇重写，而是只改当前这一块的说法，其余句子先留着。\n")
            findings = cta_lib.lint_article(article, voice)
            self.assertTrue(any(item["entryId"] == "pat-bushi" and item["severity"] == "watch" for item in findings))
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 0, message)
            private_data = cta_lib.read_json(voice / "lexicon" / "private.json")
            private_data["entries"].append({"id": "promote-pat-bushi", "action": "ban", "patternId": "pat-bushi"})
            cta_lib.write_json(voice / "lexicon" / "private.json", private_data)
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1, message)

    def test_sentence_finding_stays_inside_one_sentence(self):
        with tempfile.TemporaryDirectory() as tmp:
            voice = Path(tmp) / "voice"
            write_voice(voice, cta_lib.empty_profile(1))
            findings = cta_lib.lint_body("第一句保持不动。值得注意的是第二句。", "b001", voice)
            ban = next(item for item in findings if item["entryId"] == "zh-zhuyi")
            self.assertEqual(ban["sentence"], "值得注意的是第二句。")
            self.assertNotIn("第一句", ban["sentence"])

    def test_unselected_and_summary_sources_cannot_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            claims = cta_lib.load_claims(article)
            claims[0]["sources"][0]["id"] = "conv-side"
            cta_lib.save_claims(article, claims)
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)
            self.assertIn("未勾选", message)
            self.assertFalse((article / "export").exists())

        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            claims = cta_lib.load_claims(article)
            claims[0]["sources"][0]["id"] = "conv-summary"
            cta_lib.save_claims(article, claims)
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)
            self.assertIn("只有摘要", message)

    def test_raster_requires_explicit_confirmation(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            image = article / "figures" / "cover.png"
            image.write_bytes(b"png-bytes")
            figures = cta_lib.load_figures(article)
            figures.append(
                {
                    "id": "fig-cover",
                    "kind": "raster",
                    "status": "accepted",
                    "caption": "封面",
                    "alt": "封面",
                    "source": "figures/cover.png",
                    "prompt": "一张安静的书桌",
                    "confirmed": False,
                    "license": "",
                    "blockIds": ["b002"],
                }
            )
            cta_lib.save_figures(article, figures)
            meta, body = cta_lib.load_block(article, "b002")
            meta["figureIds"] = ["fig-flow", "fig-cover"]
            cta_lib.save_block(article, meta, body)
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)
            self.assertIn("生图确认", message)
            figures[-1]["confirmed"] = True
            cta_lib.save_figures(article, figures)
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 0, message)
            self.assertEqual((article / "export" / "figures" / "cover.png").read_bytes(), b"png-bytes")

    def test_drawio_waits_for_exported_svg(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            xml = article / "figures" / "board.drawio"
            xml.write_text("<mxfile></mxfile>", encoding="utf-8")
            figures = cta_lib.load_figures(article)
            figures[0] = {
                "id": "fig-flow",
                "kind": "drawio",
                "status": "accepted",
                "caption": "排好的图",
                "alt": "图",
                "source": "figures/board.drawio",
                "prompt": "",
                "license": "",
                "blockIds": ["b002"],
            }
            cta_lib.save_figures(article, figures)
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)
            self.assertIn("SVG", message)
            xml.with_suffix(".svg").write_text("<svg></svg>", encoding="utf-8")
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 0, message)
            self.assertTrue((article / "export" / "figures" / "board.svg").is_file())

    def test_planned_figure_does_not_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            figures = cta_lib.load_figures(article)
            figures[0]["status"] = "planned"
            cta_lib.save_figures(article, figures)
            (article / "figures" / "fig-flow.mmd").unlink()
            code, message = cta_lib.compile_article(article, voice, False)
            self.assertEqual(code, 0, message)
            working = (article / "article.md").read_text(encoding="utf-8")
            self.assertIn("图位 fig-flow", working)
            code, _message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)
            self.assertFalse((article / "export").exists())

    def test_sync_anchors_and_refuse_guessing(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            cta_lib.compile_article(article, voice, False)
            original = cta_lib.file_hash(article / "blocks" / "b002.md")
            text = (article / "article.md").read_text(encoding="utf-8")
            text = text.replace(cta_lib.load_block(article, "b001")[1].strip(), "用户在稿子里改了这一段，希望收回到 b001。", 1)
            (article / "article.md").write_text(text, encoding="utf-8")
            code, message = cta_lib.sync_anchors(article)
            self.assertEqual(code, 0, message)
            meta, body = cta_lib.load_block(article, "b001")
            self.assertEqual(meta["status"], "draft")
            self.assertIn("用户在稿子里改了这一段", body)
            self.assertEqual(original, cta_lib.file_hash(article / "blocks" / "b002.md"))

            kept = cta_lib.file_hash(article / "blocks" / "b001.md")
            (article / "article.md").write_text("# 没有锚点\n\n整篇都被改了。\n", encoding="utf-8")
            code, message = cta_lib.sync_anchors(article)
            self.assertEqual(code, 2)
            self.assertIn("b001", message)
            self.assertEqual(kept, cta_lib.file_hash(article / "blocks" / "b001.md"))
            self.assertEqual(original, cta_lib.file_hash(article / "blocks" / "b002.md"))

    def test_secret_claim_blocks_until_resolved(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            claims = cta_lib.load_claims(article)
            for row in claims:
                if row["id"] == "c-secret":
                    row["resolved"] = False
            cta_lib.save_claims(article, claims)
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)
            self.assertIn("密钥", message)

    def test_candidate_claim_cannot_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            claims = cta_lib.load_claims(article)
            claims[0]["status"] = "candidate"
            cta_lib.save_claims(article, claims)
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)
            self.assertIn("未接受", message)

    def test_demo_command(self):
        completed = subprocess.run(
            [sys.executable, str(CTA), "demo"],
            cwd=cta_lib.skill_root(),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        export = cta_lib.demo_root() / "article" / "export" / "article.md"
        text = export.read_text(encoding="utf-8")
        self.assertIn("```mermaid", text)
        self.assertNotIn("<!-- block:", text)
        self.assertNotIn("conv-full", text)
        self.assertNotIn("sk-demo", text)


if __name__ == "__main__":
    unittest.main()
