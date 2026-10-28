import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { Client as V1Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport as V1InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { parseBlock } from "@liem-opc/chat-to-article-core";
import type { ActionKind } from "../src/shared/actions.ts";
import { createDemoArticle, demoInputs } from "../src/server/demo.ts";
import { createMcpServer, VIEW_URIS } from "../src/server/mcp.ts";
import { SessionManager } from "../src/server/sessions.ts";

function setup() {
  const article = createDemoArticle(mkdtempSync(join(tmpdir(), "cta-mcp-test-")));
  const inputs = new Map(demoInputs(article));
  const manager = new SessionManager();
  const input = (kind: ActionKind) => structuredClone(inputs.get(kind)) as Record<string, unknown>;
  return { article, manager, input };
}

const readJsonl = (path: string) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);

test("review_block writes a draft on call and saves the user's tracked edits on submit", () => {
  const { article, manager, input } = setup();
  const session = manager.create("review_block", input("review_block"));
  const file = join(article, "blocks", "b001.md");
  const draft = parseBlock(readFileSync(file, "utf8"));
  assert.equal(draft.meta.status, "draft");
  assert.match(draft.body, /值得注意的是/);

  const finalBody = draft.body.replace("值得注意的是，", "");
  const out = manager.submit(session.id, {
    decision: "revise",
    finalBody,
    changes: [{ kind: "delete", before: "值得注意的是，", after: "", context: "被改过。〔此处〕返工" }],
    comments: [{ id: "cm-1", quote: "整篇都被改过", text: "太夸张" }],
  });
  assert.ok(out.ok);
  assert.match(out.response, /删除「值得注意的是，」/);
  assert.match(out.response, /「整篇都被改过」：太夸张/);
  const saved = parseBlock(readFileSync(file, "utf8"));
  assert.equal(saved.body.trim(), finalBody.trim());
  assert.equal(saved.meta.status, "draft");
  const revisions = readJsonl(join(article, "revisions.jsonl"));
  assert.ok(revisions.some((r) => r.source === "mcp-ui" && r.blockId === "b001"));

  assert.equal(manager.submit(session.id, { decision: "accept", finalBody, changes: [], comments: [] }).ok, false, "second submit is rejected");
});

test("review_block accept returns the accept-block command", () => {
  const { manager, input } = setup();
  const session = manager.create("review_block", input("review_block"));
  const body = (input("review_block").body as string).replace("值得注意的是，", "");
  const out = manager.submit(session.id, { decision: "accept", finalBody: body, changes: [], comments: [] });
  assert.ok(out.ok);
  assert.match(out.response, /accept-block --article .* --block b001/);
});

test("review_block refuses to draft a block that is not in the outline", () => {
  const { manager, input } = setup();
  assert.throws(() => manager.create("review_block", { ...input("review_block"), blockId: "b999" }), /b999/);
});

test("review_block shows article preferences and asks the agent to learn from the feedback", () => {
  const { article, manager, input } = setup();
  writeFileSync(
    join(article, "preferences.jsonl"),
    [
      JSON.stringify({ id: "p1", text: "讲经过时用我的原话", kind: "rule", status: "active" }),
      JSON.stringify({ id: "p2", text: "笔调用「工程笔记」", kind: "voice", status: "active" }),
      JSON.stringify({ id: "p3", text: "已停用", kind: "rule", status: "retired" }),
    ].join("\n") + "\n",
  );
  const session = manager.create("review_block", input("review_block"));
  const context = session.prepared.context as { styleRules: { id: string }[]; paragraph: unknown };
  assert.deepEqual(context.styleRules.map((r) => r.id), ["p1"]);
  assert.equal(context.paragraph, null);
  const out = manager.submit(session.id, { decision: "revise", finalBody: input("review_block").body, changes: [], comments: [{ id: "c", quote: "返工", text: "太书面" }] });
  assert.ok(out.ok);
  assert.match(out.response, /learn --article/);
});

test("review_variants writes only the chosen version and returns pick-variant", () => {
  const { article, manager, input } = setup();
  const file = join(article, "blocks", "b001.md");
  const before = readFileSync(file, "utf8");
  const session = manager.create("review_variants", input("review_variants"));
  assert.equal(readFileSync(file, "utf8"), before, "calling the tool writes nothing");
  const out = manager.submit(session.id, {
    decision: "pick",
    chosenId: "B",
    feedback: [
      { variantId: "B", text: "像我说话" },
      { variantId: "C", text: "太冷" },
    ],
  });
  assert.ok(out.ok);
  const saved = parseBlock(readFileSync(file, "utf8"));
  assert.match(saved.body, /说实话/);
  assert.equal(saved.meta.status, "draft");
  assert.match(out.response, /pick-variant .* --block b001 --voice colleague --note "像我说话"/);
  assert.match(out.response, /C「工程笔记」：太冷/);
  assert.match(out.response, /review_block/);
});

test("review_variants regenerate writes nothing and pick without a choice is rejected", () => {
  const { article, manager, input } = setup();
  const file = join(article, "blocks", "b001.md");
  const before = readFileSync(file, "utf8");
  const missing = manager.create("review_variants", input("review_variants"));
  assert.equal(manager.submit(missing.id, { decision: "pick", feedback: [] }).ok, false);
  assert.equal(missing.status, "pending");
  const out = manager.submit(missing.id, { decision: "regenerate", feedback: [{ variantId: "A", text: "都太长" }] });
  assert.ok(out.ok);
  assert.match(out.response, /review_variants/);
  assert.equal(readFileSync(file, "utf8"), before);
});

test("invalid submissions are rejected without changing the session", () => {
  const { manager, input } = setup();
  const session = manager.create("review_outline", input("review_outline"));
  const out = manager.submit(session.id, { decision: "maybe" });
  assert.equal(out.ok, false);
  assert.match(!out.ok ? out.error : "", /decision/);
  assert.equal(session.status, "pending");
  assert.equal(manager.submit("missing", { decision: "confirm" }).ok, false);
});

test("review_claims appends new candidates and applies decisions", () => {
  const { article, manager, input } = setup();
  const raw = input("review_claims");
  const session = manager.create("review_claims", raw);
  const claimsFile = join(article, "claims.jsonl");
  const before = readJsonl(claimsFile);
  const drafted = (raw.claims as { id: string; text: string }[]).map((c) => c.id);
  for (const id of drafted) assert.ok(before.some((c) => c.id === id), `${id} appended as candidate`);

  const out = manager.submit(session.id, {
    decision: "submit",
    claims: [
      ...drafted.map((id) => ({ id, text: before.find((c) => c.id === id)!.text as string, status: "rejected" })),
      { id: "c1", text: "改过的第一条主张", status: "accepted" },
    ],
  });
  assert.ok(out.ok);
  const after = readJsonl(claimsFile);
  assert.equal(after.find((c) => c.id === "c1")!.text, "改过的第一条主张");
  for (const id of drafted) assert.equal(after.find((c) => c.id === id)!.status, "rejected");
  assert.equal(parseBlock(readFileSync(join(article, "blocks", "b001.md"), "utf8")).meta.status, "stale", "block using c1 goes stale");
  assert.match(out.response, /stale/);
});

test("review_outline confirm writes outline.json and planned figures", () => {
  const { article, manager, input } = setup();
  const raw = input("review_outline");
  const session = manager.create("review_outline", raw);
  const sections = (raw.sections as { id: string; title: string; claimIds: string[]; blockIds?: string[] }[]).map((s, i) =>
    i === 0 ? { ...s, title: "改过的标题" } : s,
  );
  const out = manager.submit(session.id, { decision: "confirm", sections, comments: [] });
  assert.ok(out.ok);
  const outline = JSON.parse(readFileSync(join(article, "outline.json"), "utf8")) as { sections: { title: string }[] };
  assert.equal(outline.sections[0].title, "改过的标题");
  assert.match(out.response, /set-gate/);
});

test("review_writing_plan confirm creates the plan only after confirmation", () => {
  const { manager, input } = setup();
  const raw = input("review_writing_plan");
  const target = raw.article as string;
  const session = manager.create("review_writing_plan", raw);
  assert.equal(existsSync(join(target, "writing-plan.json")), false);
  const out = manager.submit(session.id, { decision: "confirm", plan: raw.plan, comments: [] });
  assert.ok(out.ok);
  const plan = JSON.parse(readFileSync(join(target, "writing-plan.json"), "utf8")) as { status: string; audience: string };
  assert.equal(plan.status, "draft");
  assert.equal(plan.audience, (raw.plan as { audience: string }).audience);
  assert.match(out.response, /new-article/);
});

test("review_figure writes the source on call and records the decision", () => {
  const { article, manager, input } = setup();
  const raw = input("review_figure");
  const session = manager.create("review_figure", raw);
  assert.equal(readFileSync(join(article, "figures", "fig-flow.mmd"), "utf8").trim(), (raw.source as string).trim());
  const source = "flowchart LR\n  a --> b\n";
  const out = manager.submit(session.id, { decision: "accept", source, caption: "图注", alt: "替代文字" });
  assert.ok(out.ok);
  assert.equal(readFileSync(join(article, "figures", "fig-flow.mmd"), "utf8"), source);
  const manifest = JSON.parse(readFileSync(join(article, "figures", "manifest.json"), "utf8")) as { figures: { id: string; status: string; caption: string }[] };
  const fig = manifest.figures.find((f) => f.id === "fig-flow")!;
  assert.equal(fig.status, "accepted");
  assert.equal(fig.caption, "图注");
});

type ToolResult = { content: { type: string; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

function viewsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cta-mcp-views-"));
  writeFileSync(join(dir, "review.html"), "<!doctype html><title>review</title>");
  writeFileSync(join(dir, "figure.html"), "<!doctype html><title>figure</title>");
  return dir;
}

const UI_CAPS = { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } };

async function connect(manager: SessionManager, capabilities: Record<string, unknown> = UI_CAPS) {
  const server = createMcpServer(manager, { version: "test", viewsDir: viewsDir() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-host", version: "0" }, { capabilities });
  await client.connect(clientTransport);
  const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as ToolResult;
  return { client, call };
}

test("action tools link to ui:// views, app-only tools are marked, and views are served as MCP App HTML", async () => {
  const { client } = await connect(new SessionManager());
  try {
    const tools = (await client.listTools()).tools;
    const meta = (name: string) => tools.find((t) => t.name === name)?._meta?.ui as { resourceUri?: string; visibility?: string[] } | undefined;
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      "ask_questions",
      "get_review_result",
      "list_review_sessions",
      "review_block",
      "review_claims",
      "review_figure",
      "review_load",
      "review_outline",
      "review_style_candidates",
      "review_submit",
      "review_variants",
      "review_writing_plan",
    ]);
    assert.equal(meta("review_block")?.resourceUri, VIEW_URIS.review);
    assert.equal(meta("review_figure")?.resourceUri, VIEW_URIS.figure);
    assert.deepEqual(meta("review_load")?.visibility, ["app"]);
    assert.deepEqual(meta("review_submit")?.visibility, ["app"]);
    assert.equal(meta("get_review_result"), undefined);

    const resources = (await client.listResources()).resources.map((r) => r.uri).sort();
    assert.deepEqual(resources, Object.values(VIEW_URIS).sort());
    const read = await client.readResource({ uri: VIEW_URIS.review });
    const content = read.contents[0] as { mimeType?: string; text?: string };
    assert.equal(content.mimeType, RESOURCE_MIME_TYPE);
    assert.match(content.text ?? "", /<title>review<\/title>/);
  } finally {
    await client.close();
  }
});

test("a tool call returns at once; the view loads the session, submits, and the result is readable afterwards", async () => {
  const { input } = setup();
  const manager = new SessionManager();
  const { client, call } = await connect(manager);
  try {
    const opened = await call("review_style_candidates", input("review_style_candidates"));
    assert.notEqual(opened.isError, true);
    assert.match(opened.content[0].text, /嵌入/);
    assert.match(opened.content[0].text, /【审阅结果】/);
    const { sessionId, action } = opened.structuredContent as { sessionId: string; action: string };
    assert.equal(action, "review_style_candidates");

    const loaded = await call("review_load", { sessionId });
    assert.equal((loaded.structuredContent as { status: string }).status, "pending");
    assert.match((await call("get_review_result", { sessionId })).content[0].text, /还没有/);

    const submitted = await call("review_submit", {
      sessionId,
      result: { decision: "submit", selected: [{ id: "cand-1", text: "段首先写具体问题" }], rejected: ["cand-2"] },
    });
    assert.notEqual(submitted.isError, true);
    assert.match(submitted.content[0].text, /bump-style/);
    assert.equal((submitted.structuredContent as { decision: string }).decision, "submit");

    const again = await call("review_submit", { sessionId, result: { decision: "later" } });
    assert.equal(again.isError, true, "a session can only be submitted once");

    const reloaded = await call("review_load", { sessionId });
    assert.equal((reloaded.structuredContent as { status: string }).status, "submitted", "a re-rendered view sees the submitted state");

    const result = await call("get_review_result", { sessionId });
    assert.match(result.content[0].text, /bump-style/);
    assert.match(result.content[1].text, /"decision":"submit"/);

    const bad = await call("review_block", { ...input("review_block"), blockId: "b999" });
    assert.equal(bad.isError, true);
  } finally {
    await client.close();
  }
});

test("after a server restart the view rebuilds the session from the original tool arguments", async () => {
  const { input } = setup();
  const args = input("review_outline");
  const first = await connect(new SessionManager());
  const { sessionId } = (await first.call("review_outline", args)).structuredContent as { sessionId: string };
  await first.client.close();

  const second = await connect(new SessionManager());
  try {
    assert.equal((await second.call("review_load", { sessionId })).isError, true);
    const rebuilt = await second.call("review_load", { sessionId, action: "review_outline", args });
    assert.notEqual(rebuilt.isError, true);
    assert.equal((rebuilt.structuredContent as { id: string }).id, sessionId);
    const out = await second.call("review_submit", { sessionId, result: { decision: "confirm", sections: args.sections, comments: [] } });
    assert.notEqual(out.isError, true);
  } finally {
    await second.client.close();
  }
});

test("hosts that do not declare MCP Apps support get chat fallback instructions", async () => {
  const { input } = setup();
  const { client, call } = await connect(new SessionManager(), {});
  try {
    const res = await call("ask_questions", input("ask_questions"));
    assert.match(res.content[0].text, /没有声明支持 MCP Apps/);
  } finally {
    await client.close();
  }
});

test("clients built on the v1 MCP SDK can use the server", async () => {
  const { input } = setup();
  const server = createMcpServer(new SessionManager(), { version: "test", viewsDir: viewsDir() });
  const [clientTransport, serverTransport] = V1InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new V1Client({ name: "v1-host", version: "0" }, { capabilities: UI_CAPS });
  await client.connect(clientTransport);
  try {
    const tool = (await client.listTools()).tools.find((t) => t.name === "review_block");
    assert.equal((tool?._meta?.ui as { resourceUri: string }).resourceUri, VIEW_URIS.review);
    const res = (await client.callTool({ name: "review_block", arguments: input("review_block") })) as ToolResult;
    assert.match(res.content[0].text, /嵌入/);
  } finally {
    await client.close();
  }
});
