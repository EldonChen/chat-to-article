#!/usr/bin/env python3
"""对照产品规格里能机械检查的验收。"""

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
    cta_lib.new_article(article, "按块修订", "block-revision", "块修订", voice)
    for name in ("writing-plan.json", "claims.jsonl", "outline.json", "materials.json"):
        shutil.copyfile(FIXTURE / name, article / name)
    (article / "figures").mkdir(exist_ok=True)
    shutil.copyfile(FIXTURE / "fig-flow.mmd", article / "figures" / "fig-flow.mmd")
    shutil.copyfile(FIXTURE / "manifest.json", article / "figures" / "manifest.json")
    code, message = cta_lib.set_gate(article, True, None, None)
    if code != 0:
        raise RuntimeError(message)
    code, message = cta_lib.set_gate(article, None, True, None)
    if code != 0:
        raise RuntimeError(message)
    code, message = cta_lib.set_gate(article, None, None, True)
    if code != 0:
        raise RuntimeError(message)
    (article / "blocks").mkdir(exist_ok=True)
    for block_id in ("b001", "b002"):
        shutil.copyfile(FIXTURE / "blocks" / f"{block_id}.md", article / "blocks" / f"{block_id}.md")
        code, message = cta_lib.accept_block(article, voice, block_id)
        if code != 0:
            raise RuntimeError(message)
    return article, voice


class DemoTests(unittest.TestCase):
    def test_extract_drops_tool_use_and_flags_secret(self):
        document, secrets = cta_lib.extract_jsonl(FIXTURE / "transcript.jsonl")
        self.assertIn("整篇都被重写", document)
        self.assertNotIn("TOOL_ONLY_MARKER", document)
        self.assertTrue(secrets)
        self.assertIn("sk-demo-secret-key-1234567890", document)

    def test_summary_only_stops_without_creating_article(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            hits = [{"id": "conv-summary", "title": "只有标题", "transcript": None}]
            code, report = cta_lib.check_materials(hits, ["conv-summary"], [])
            self.assertEqual(code, 2)
            self.assertIn("只有摘要", report)
            self.assertIn("不要写文章", report)
            self.assertFalse((root / "articles").exists())

    def test_supplement_counts_as_material(self):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            note.write_text("补充材料。", encoding="utf-8")
            hits = [{"id": "conv-summary", "title": "只有标题", "transcript": None}]
            code, report = cta_lib.check_materials(hits, ["conv-summary"], [str(note)])
            self.assertEqual(code, 0)
            self.assertIn("补充文件", report)

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
            self.assertNotIn("UNSELECTED_MARKER", export)
            self.assertTrue((article / "export" / "figures" / "fig-flow.mmd").is_file())
            names = sorted(path.name for path in (article / "export").iterdir())
            self.assertEqual(names, ["article.md", "figures"])
            self.assertFalse((article / "export" / "claims.jsonl").exists())
            self.assertFalse((article / "export" / "revisions.jsonl").exists())

    def test_rewrite_does_not_change_other_accepted_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, _voice = ready(Path(tmp))
            before = cta_lib.file_hash(article / "blocks" / "b002.md")
            body = "这一块改成直接讲我只想换一句的问题。其余段落不在这次修改里，所以另一块文件应保持原样。"
            cta_lib.rewrite_block(article, "b001", body, "改开头")
            self.assertEqual(before, cta_lib.file_hash(article / "blocks" / "b002.md"))
            meta, new_body = cta_lib.load_block(article, "b001")
            self.assertEqual(meta["status"], "draft")
            self.assertIn("直接讲", new_body)

    def test_style_upgrade_keeps_pinned_revision(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            article, voice = ready(root)
            self.assertEqual(cta_lib.load_meta(article)["styleRevision"], 1)
            code, _message = cta_lib.bump_style(voice, "NEW_RULE_ONLY_ON_NEXT")
            self.assertEqual(code, 0)
            self.assertEqual(cta_lib.load_meta(article)["styleRevision"], 1)
            shown = cta_lib.show_block(article, voice, "b001")
            self.assertIn("段首先写具体问题", shown)
            self.assertNotIn("NEW_RULE_ONLY_ON_NEXT", shown)
            self.assertNotIn("CANDIDATE_RULE_HIDDEN", shown)
            later = root / "later"
            meta = cta_lib.new_article(later, "下一篇", "next", "主题", voice)
            self.assertEqual(meta["styleRevision"], 2)
            self.assertEqual(cta_lib.load_meta(article)["styleRevision"], 1)

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
            meta, body = cta_lib.load_block(article, "b001")
            cta_lib.save_block(article, meta, "值得注意的是，这句话本应挡住导出。另一句说明放行只作用于这一条。\n")
            code, _message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)
            cta_lib.apply_private(voice, "allow", "", "", "zh-zhuyi", "")
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 0, message)

    def test_prefer_and_pattern_promotion(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            meta, body = cta_lib.load_block(article, "b001")
            cta_lib.save_block(article, meta, body.rstrip() + "这里写的是对话语料，应改成聊天记录。\n")
            cta_lib.apply_private(voice, "prefer", "对话语料", "聊天记录", "", "")
            findings = cta_lib.lint_body(
                (cta_lib.load_block(article, "b001")[1]),
                "b001",
                voice,
            )
            matched = [item for item in findings if item["replacement"] == "聊天记录"]
            self.assertTrue(matched)
            self.assertEqual(matched[0]["severity"], "ban")
            code, _message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)

        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            meta, body = cta_lib.load_block(article, "b001")
            cta_lib.save_block(article, meta, "这不是整篇重写，而是只改当前这一块的说法，其余句子先留着。\n")
            findings = cta_lib.lint_article(article, voice)
            self.assertTrue(any(item["entryId"] == "pat-bushi" and item["severity"] == "watch" for item in findings))
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 0, message)
            cta_lib.apply_private(voice, "promote-pattern", "", "", "", "pat-bushi")
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
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)
            self.assertFalse((article / "export").exists())

    def test_claim_edit_stales_only_citing_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            before = cta_lib.file_hash(article / "blocks" / "b002.md")
            code, message = cta_lib.mark_claim(article, "c1", None, "改过的主张", None)
            self.assertEqual(code, 0, message)
            meta, body = cta_lib.load_block(article, "b001")
            self.assertEqual(meta["status"], "stale")
            self.assertIn("只想换掉一句", body)
            self.assertEqual(before, cta_lib.file_hash(article / "blocks" / "b002.md"))
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)
            self.assertIn("stale", message)

    def test_sync_anchors_and_refuse_guessing(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            cta_lib.compile_article(article, voice, False)
            original = cta_lib.file_hash(article / "blocks" / "b002.md")
            text = (article / "article.md").read_text(encoding="utf-8")
            old, _body = cta_lib.load_block(article, "b001")
            text = text.replace(old and cta_lib.load_block(article, "b001")[1].strip(), "用户在稿子里改了这一段，希望收回到 b001。", 1)
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

    def test_section_gate_and_write_all(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            article, voice = ready(root)
            meta, body = cta_lib.load_block(article, "b001")
            meta["status"] = "draft"
            cta_lib.save_block(article, meta, body)
            code, message = cta_lib.check_draft(article, "rest")
            self.assertEqual(code, 1, message)
            cta_lib.allow_write_all(article)
            code, message = cta_lib.check_draft(article, "rest")
            self.assertEqual(code, 0, message)

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

    def test_show_block_omits_far_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            outline = cta_lib.load_outline(article)
            outline["sections"].append(
                {"id": "s3", "title": "远处", "claimIds": ["c1"], "figureIds": [], "blockIds": ["b003"]}
            )
            cta_lib.write_json(article / "outline.json", outline)
            cta_lib.save_block(
                article,
                {"id": "b003", "status": "accepted", "claimIds": ["c1"], "figureIds": []},
                "ONLY_IN_B003 这段不该出现在第一块的上下文里。\n",
            )
            shown = cta_lib.show_block(article, voice, "b001")
            self.assertNotIn("ONLY_IN_B003", shown)
            self.assertIn("b002 只读", shown)

    def test_observe_does_not_bump_revision(self):
        with tempfile.TemporaryDirectory() as tmp:
            voice = Path(tmp) / "voice"
            write_voice(voice, cta_lib.empty_profile(3))
            sample = Path(tmp) / "old.md"
            sample.write_text("# 标题\n\n" + ("我把碰到的问题先写下来，再写后来是怎么处理的。" * 2) + "\n", encoding="utf-8")
            message = cta_lib.observe_style(voice, [sample])
            self.assertIn("风格版本没有变", message)
            self.assertEqual(cta_lib.read_json(voice / "profile.json")["revision"], 3)
            self.assertEqual(len(cta_lib.read_jsonl(voice / "candidates.jsonl")), 1)

    def test_candidate_claim_cannot_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            claims = cta_lib.load_claims(article)
            claims[0]["status"] = "candidate"
            cta_lib.save_claims(article, claims)
            code, message = cta_lib.compile_article(article, voice, True)
            self.assertEqual(code, 1)
            self.assertIn("未接受", message)

    def test_learned_preference_reaches_the_next_block_without_bumping_style(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            code, _message = cta_lib.learn_preference(article, voice, "PREF_FROM_B001", "改前 → 改后", "b001", "annotation")
            self.assertEqual(code, 0)
            shown = cta_lib.show_block(article, voice, "b002")
            self.assertIn("PREF_FROM_B001", shown)
            self.assertEqual(cta_lib.load_meta(article)["styleRevision"], 1)
            self.assertEqual(cta_lib.read_json(voice / "profile.json")["revision"], 1)
            candidates = cta_lib.read_jsonl(voice / "candidates.jsonl")
            self.assertEqual(candidates[-1]["text"], "PREF_FROM_B001")

            cta_lib.forget_preference(article, "p1")
            self.assertNotIn("PREF_FROM_B001", cta_lib.show_block(article, voice, "b002"))

    def test_bump_style_marks_preference_promoted(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            cta_lib.learn_preference(article, voice, "用我的原话", "", "b001", "edit")
            code, message = cta_lib.bump_style(voice, "用我的原话", article, "p1")
            self.assertEqual(code, 0, message)
            self.assertTrue(cta_lib.load_preferences(article)[0]["promoted"])
            self.assertEqual(cta_lib.read_jsonl(voice / "candidates.jsonl")[-1]["status"], "accepted")
            self.assertEqual(cta_lib.unpromoted_preferences(article), [])

    def test_pick_variant_sets_article_voice(self):
        with tempfile.TemporaryDirectory() as tmp:
            article, voice = ready(Path(tmp))
            self.assertIn("还没选定", cta_lib.show_block(article, voice, "b001"))
            brief = cta_lib.variant_brief(article, voice, "b001")
            self.assertIn("按你的偏好", brief)
            self.assertIn("段首先写具体问题", brief)
            code, message = cta_lib.pick_variant(article, voice, "b001", "nope", None, "")
            self.assertEqual(code, 1, message)
            code, message = cta_lib.pick_variant(article, voice, "b001", "colleague", "选中的这一版正文。\n", "保留了原话")
            self.assertEqual(code, 0, message)
            self.assertEqual(cta_lib.load_plan(article)["voice"]["id"], "colleague")
            meta, body = cta_lib.load_block(article, "b001")
            self.assertEqual(meta["status"], "draft")
            self.assertIn("选中的这一版", body)
            shown = cta_lib.show_block(article, voice, "b002")
            self.assertIn("跟同事复盘", shown)
            self.assertIn("保留了原话", shown)
            cta_lib.pick_variant(article, voice, "b001", "engineering", None, "")
            voices = [row for row in cta_lib.load_preferences(article) if row["kind"] == "voice" and row["status"] == "active"]
            self.assertEqual(len(voices), 1)
            self.assertIn("工程笔记", voices[0]["text"])

    def test_brief_without_preferences_offers_only_presets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            voice = root / "voice"
            write_voice(voice, cta_lib.empty_profile(0))
            article = root / "article"
            cta_lib.new_article(article, "标题", "slug", "主题", voice)
            cta_lib.write_json(article / "outline.json", {"sections": [{"id": "s1", "title": "一", "claimIds": [], "blockIds": ["b001"]}]})
            brief = cta_lib.variant_brief(article, voice, "b001")
            self.assertIn("3 版内置笔调", brief)
            self.assertNotIn("「按你的偏好」那一版的材料", brief)

    def test_default_profile_has_no_paragraph_limit(self):
        self.assertNotIn("paragraph", cta_lib.empty_profile(0))

    def test_default_article_directory_and_demo_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            voice = Path(tmp) / "voice"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(CTA),
                    "--voice",
                    str(voice),
                    "new-article",
                    "--title",
                    "默认位置",
                    "--slug",
                    "hello",
                    "--topic",
                    "主题",
                ],
                cwd=tmp,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr + completed.stdout)
            meta = cta_lib.read_json(Path(tmp) / "articles" / "hello" / "meta.json")
            self.assertEqual(meta["styleRevision"], 0)
            self.assertEqual(meta["slug"], "hello")

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
        self.assertIn("只有摘要", completed.stdout)
        self.assertIn("未勾选", completed.stdout)


if __name__ == "__main__":
    unittest.main()
