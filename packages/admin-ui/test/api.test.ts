import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { createApp } from "../src/server/app.ts";
import { Workspace } from "../src/server/workspace.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const skill = join(repo, "skills/chat-to-article");
const demo = join(skill, "examples/demo");
const app = createApp(new Workspace({ root: demo, home: join(demo, "voice"), skill, depth: 4 }), null);

async function json<T>(path: string): Promise<T> {
  const res = await app.request(path);
  assert.equal(res.status, 200, path);
  return (await res.json()) as T;
}

test("lists the demo article with gate counts", async () => {
  const list = await json<{ id: string; relDir: string; hasExport: boolean; blocks: { accepted: number } }[]>("/api/articles");
  assert.equal(list.length, 1);
  assert.equal(list[0].relDir, "article");
  assert.equal(list[0].hasExport, true);
  assert.equal(list[0].blocks.accepted, 2);
});

test("serves the share-package markdown as a download", async () => {
  const [{ id }] = await json<{ id: string }[]>("/api/articles");
  const res = await app.request(`/api/articles/${id}/markdown?variant=export&download=1`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition") ?? "", /block-revision\.md/);
  assert.equal(await res.text(), readFileSync(join(demo, "article/export/article.md"), "utf8"));
});

test("zips the export directory", async () => {
  const [{ id }] = await json<{ id: string }[]>("/api/articles");
  const res = await app.request(`/api/export.zip?ids=${id}&prefer=export`);
  const files = Object.keys(unzipSync(new Uint8Array(await res.arrayBuffer()))).sort();
  assert.deepEqual(files, ["block-revision/article.md", "block-revision/figures/fig-flow.mmd"]);
});

test("is read-only and refuses path traversal", async () => {
  const [{ id }] = await json<{ id: string }[]>("/api/articles");
  assert.equal((await app.request("/api/articles", { method: "POST" })).status, 405);
  assert.equal((await app.request(`/api/articles/${id}/asset?path=../../SKILL.md`)).status, 404);
  assert.equal((await app.request(`/api/articles/${Buffer.from("..").toString("base64url")}`)).status, 404);
});

test("exposes voice and merged lexicon", async () => {
  const voice = await json<{ profile: { revision: number } }>("/api/voice");
  assert.equal(voice.profile.revision, 1);
  const lexicon = await json<{ skillDir: string; effective: unknown[] }>("/api/lexicon");
  assert.equal(lexicon.skillDir, skill);
  assert.ok(lexicon.effective.length > 20);
});
