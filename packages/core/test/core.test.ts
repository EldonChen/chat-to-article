import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { formatBlock, parseBlock } from "../src/block.ts";
import { findArticleDirs, loadArticle } from "../src/article.ts";
import { compileLexicon, lintBody, loadSharedLexicon } from "../src/lexicon.ts";
import { renderArticle } from "../src/render.ts";
import { loadStylePresets, loadVisualStylePresets } from "../src/voice.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const skill = join(repo, "skills/chat-to-article");
const demo = join(skill, "examples/demo/article");
const rules = compileLexicon(loadSharedLexicon(skill), []);

test("block round trip matches cta.py format", () => {
  const text = readFileSync(join(demo, "blocks/b001.md"), "utf8");
  const { meta, body } = parseBlock(text);
  assert.equal(meta.id, "b001");
  assert.deepEqual(meta.claimIds, ["c1"]);
  assert.equal(formatBlock(meta, body), text);
});

test("render parity with the Python compiler", () => {
  const snapshot = loadArticle(demo, repo, rules);
  assert.equal(renderArticle(snapshot, { anchors: true, provenance: false }), readFileSync(join(demo, "article.md"), "utf8"));
  assert.equal(
    renderArticle(snapshot, { anchors: false, provenance: false }),
    readFileSync(join(demo, "export/article.md"), "utf8"),
  );
  assert.deepEqual(snapshot.exportErrors, []);
  assert.equal(snapshot.blocks.accepted, 2);
  assert.ok(snapshot.plan?.motivation?.initialConfusion.includes("整篇重写"));
  assert.equal(snapshot.plan?.motivation?.inquiryJourney?.length, 2);
  assert.equal(snapshot.claimList.find((c) => c.id === "c1")?.role, "insight");
  assert.ok(snapshot.outline.sections[0]?.readerQuestion?.includes("重写"));
});

test("article discovery finds the demo article", () => {
  const dirs = findArticleDirs(join(skill, "examples"));
  assert.ok(dirs.includes(demo));
});

test("lint finds banned phrases and sentence", () => {
  const findings = lintBody("开头一句。值得注意的是，这里有问题。结尾", "b9", rules);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].entryId, "zh-zhuyi");
  assert.equal(findings[0].start, 5);
  assert.equal(findings[0].sentence, "值得注意的是，这里有问题。");
  const allowed = compileLexicon(loadSharedLexicon(skill), [{ id: "allow-zh-zhuyi", action: "allow", entryId: "zh-zhuyi" }]);
  assert.equal(lintBody("值得注意的是", "b9", allowed).length, 0);
});

test("loads built-in style presets including tech-blogger and all preset samples pass lexicon lint", () => {
  const presets = loadStylePresets(skill);
  const techBlogger = presets.find((p) => p.id === "tech-blogger");
  assert.ok(techBlogger, "tech-blogger preset should exist");
  assert.equal(techBlogger.name, "科技博主科普");
  assert.equal(techBlogger.defaultVisualStyle, "tech-spotlight");
  for (const preset of presets) {
    const findings = lintBody(preset.sample, preset.id, rules);
    assert.deepEqual(findings, [], `preset ${preset.id} sample should have no lexicon findings`);
  }
  const visualStyles = loadVisualStylePresets(skill);
  assert.ok(visualStyles.some((v) => v.id === "tech-spotlight"));
  assert.ok(visualStyles.some((v) => v.id === "whiteboard-sketch"));
});
