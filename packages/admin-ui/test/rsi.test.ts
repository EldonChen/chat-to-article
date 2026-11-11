import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "../src/server/app.ts";
import { feedbackMarkdown, parseScore, weightedTotal, type UserRating } from "../src/server/rsi.ts";
import { Workspace } from "../src/server/workspace.ts";

const root = mkdtempSync(join(tmpdir(), "cta-rsi-"));
const skill = join(root, "skill");
mkdirSync(skill, { recursive: true });

function write(path: string, text: string) {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), text);
}

write(
  "baseline-case/article/article.md",
  "# 基线\n\n一段说明。\n\n| 列 | 值 |\n| --- | --- |\n| a | b |\n",
);
write("baseline-case/article/rsi-scorecard.json", JSON.stringify({ baselineHumanTotal: 40, keepStrengths: ["分层还在"] }));
write(
  "iterations/fresh-01/article.md",
  "# 新鲜的一轮\n\n## 第一层原理：下一个词从哪来？\n\n**判断写在这里。**\n\n| 候选 | 分数 |\n| --- | --- |\n| a | 1 |\n\n![左右差在哪](./figures/fig-1.svg)\n",
);
write(
  "iterations/fresh-01/figures/fig-1.svg",
  `<svg xmlns="http://www.w3.org/2000/svg"><text>门</text></svg>\n`,
);
write(
  "iterations/fresh-01/score.md",
  `---
cursor:
  subagentId: "test"
---

# 评分

开篇只停一次。

## v4 闸门

| 闸门 | 判定 |
| --- | --- |
| Gate 1 哑谜标题 | 未触发。标题是路标。 |

## 六维

| 维 | 读者 | 编导 | 作者（仅维 6） | 中位数 | 引用 |
| --- | --- | --- | --- | --- | --- |
| 1 开篇 /20 | 10 | 12 | — | 11 | 第一段只有一次失败。 |
| 2 桥梁 /25 | 14 | 14 | — | 14 | 节末是问句。 |
| 6 审阅 /10 | — | — | 未复测 | 未复测 | 没有界面走查。 |

最终分: 55

overfit: true。规则里不该出现案例数字。

## 上一轮五条

1. 图先落盘。生效。
`,
);
write("iterations/fresh-01/gradient.md", "# 梯度\n\n1. 第一条建议，跨两行\n仍算同一条。\n\n2. 第二条建议。\n");
write("iterations/fresh-01/writing-plan.json", JSON.stringify({ audience: "工程师", purpose: "讲清下一词" }));
write("iterations/fresh-02/article.md", "");
mkdirSync(join(root, "iterations/fresh-02"), { recursive: true });
write(
  "iterations/round-02/score.md",
  `| 维 | 分 | 依据 |
| --- | --- | --- |
| A1 分层思维 | 16 | 三层还在 |
| **合计** | **68** | 较基线上涨 |
`,
);
write("iterations/round-02/article.md", "# 第二轮\n\n正文。\n");
write("iterations/_script-patched-not-from-scratch/round-09/article.md", "# 归档\n\n不是从零写的。\n");
write("iterations/_script-patched-not-from-scratch/README.md", "ignore\n");

const app = createApp(new Workspace({ root, home: join(root, "home"), skill, depth: 2 }), null, { rsiRoot: root });

test("scans baseline, live rounds, and archives in evolution order", async () => {
  const res = await app.request("/api/rsi/rounds");
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    root: string;
    rounds: {
      id: string;
      archived: boolean;
      title: string | null;
      charCount: number;
      tableCount: number;
      images: { url: string }[];
      articleMarkdown: string;
      score: { total: number | null; overfit: boolean | string | null; dimensions: { label: string; value: number | null }[]; gates: { passed: boolean | null }[]; strengths: string[] } | null;
      gradient: { items: { n: number; text: string }[] } | null;
      writingPlan: { audience?: string } | null;
    }[];
  };
  assert.deepEqual(
    body.rounds.map((round) => round.id),
    ["baseline", "round-02", "fresh-01", "fresh-02", "archive-round-09"],
  );
  assert.equal(body.rounds[4].archived, true);
  assert.equal(body.rounds[0].score?.total, 40);
  assert.deepEqual(body.rounds[0].score?.strengths, ["分层还在"]);

  const fresh = body.rounds[2];
  assert.equal(fresh.title, "新鲜的一轮");
  assert.ok(fresh.charCount > 10);
  assert.equal(fresh.tableCount, 1);
  assert.equal(fresh.images[0].url, "/api/rsi/rounds/fresh-01/figures/fig-1.svg");
  assert.match(fresh.articleMarkdown, /\]\(\/api\/rsi\/rounds\/fresh-01\/figures\/fig-1\.svg\)/);
  assert.equal(fresh.score?.total, 55);
  assert.equal(fresh.score?.overfit, true);
  assert.equal(fresh.score?.dimensions[0].value, 11);
  assert.equal(fresh.score?.dimensions[2].value, null);
  assert.equal(fresh.score?.gates[0].passed, true);
  assert.match(fresh.score?.strengths.join("\n") ?? "", /生效/);
  assert.equal(fresh.gradient?.items.length, 2);
  assert.match(fresh.gradient?.items[0].text ?? "", /仍算同一条/);
  assert.equal(fresh.writingPlan?.audience, "工程师");

  assert.equal(body.rounds[1].score?.total, 68);
  assert.equal(body.rounds[1].score?.dimensions[0].label, "A1 分层思维");
});

test("serves a round svg and rejects path traversal", async () => {
  const ok = await app.request("/api/rsi/rounds/fresh-01/figures/fig-1.svg");
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("content-type") ?? "", /image\/svg\+xml/);
  assert.match(await ok.text(), /门/);
  assert.equal((await app.request("/api/rsi/rounds/fresh-01/figures/..%2F..%2Fsecret.svg")).status, 404);
  assert.equal((await app.request("/api/rsi/rounds/missing/figures/fig-1.svg")).status, 404);
});

test("saves a six-dimension rating into the round directory", async () => {
  const dimensions = { opening: 70, bridge: 80, mechanism: 60, analogy: 90, visual: 40, review: 20 };
  const res = await app.request("/api/rsi/rounds/fresh-01/rating", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dimensions, chips: ["图片死链"], note: "开篇还可以再收一点。" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { feedbackMarkdown: string; rating: UserRating };
  assert.equal(body.rating.weightedTotal, weightedTotal(dimensions));
  assert.match(body.feedbackMarkdown, /加权总分/);
  assert.match(body.feedbackMarkdown, /图片死链/);
  const saved = JSON.parse(readFileSync(join(root, "iterations/fresh-01/user-rating.json"), "utf8")) as UserRating;
  assert.equal(saved.feedbackMarkdown, feedbackMarkdown("fresh-01", saved));
  assert.equal(existsSync(join(root, "iterations/fresh-01/user-rating.json")), true);

  const again = await app.request("/api/rsi/rounds");
  const rounds = ((await again.json()) as { rounds: { id: string; userRating: UserRating | null }[] }).rounds;
  assert.equal(rounds.find((round) => round.id === "fresh-01")?.userRating?.dimensions.opening, 70);

  const bad = await app.request("/api/rsi/rounds/fresh-01/rating", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dimensions: { opening: 101, bridge: 0, mechanism: 0, analogy: 0, visual: 0, review: 0 } }),
  });
  assert.equal(bad.status, 400);
  assert.equal((await app.request("/api/articles", { method: "POST" })).status, 405);
  const missing = await app.request("/api/rsi/rounds/not-a-round/rating", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dimensions: { opening: 1, bridge: 1, mechanism: 1, analogy: 1, visual: 1, review: 1 }, chips: [], note: "" }),
  });
  assert.equal(missing.status, 404);
});

test("parseScore reads a final score without inventing dimensions", () => {
  const score = parseScore("最终分: 12\n\noverfit: 未审。\n", null);
  assert.equal(score?.total, 12);
  assert.equal(score?.overfit, "unreviewed");
  assert.deepEqual(score?.dimensions, []);
});

test.after(() => {
  rmSync(root, { recursive: true, force: true });
});
