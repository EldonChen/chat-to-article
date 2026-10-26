import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { formatBlock, writeJson, writeJsonl, writeText } from "@liem-opc/chat-to-article-core";
import type { ActionKind } from "../shared/actions.ts";

/** 一篇已通过计划、主张、大纲三道门的示例文章，用来在没有 agent 时预览所有审阅界面。 */
export function createDemoArticle(dir?: string): string {
  const root = dir ? resolve(dir) : mkdtempSync(join(tmpdir(), "cta-mcp-demo-"));
  const article = join(root, "articles", "block-revision");
  writeJson(join(article, "meta.json"), {
    title: "按块修订",
    slug: "block-revision",
    topic: "块修订",
    styleRevision: 0,
    locale: "zh-CN",
    phase: "outline",
    writingPlanConfirmed: true,
    claimsConfirmed: true,
    outlineConfirmed: true,
    writeAll: false,
    includeProvenance: false,
  });
  writeJson(join(article, "writing-plan.json"), {
    status: "confirmed",
    genre: ["工程实践文章"],
    audience: "熟悉软件开发、想了解文章协作机制的工程师",
    purpose: "解释按块修订的机制和边界",
    styleAxes: { explanationPace: "先给具体问题，再说明做法" },
    approach: "从返工问题出发，说明按块修订，再给出工作流程。",
    openQuestions: [],
  });
  writeJsonl(join(article, "claims.jsonl"), [
    { id: "c1", text: "改一块时不把整篇文章放进修改上下文。", status: "accepted", sources: [{ kind: "conversation", id: "conv-1", note: "用户只想改一句" }] },
    { id: "c2", text: "流程和结构图用 Mermaid 源文件保存，亲手排的图要导出 SVG。", status: "accepted", sources: [{ kind: "conversation", id: "conv-1" }] },
  ]);
  writeJson(join(article, "materials.json"), { selected: ["conv-1"], fullText: ["conv-1"] });
  writeJson(join(article, "outline.json"), {
    sections: [
      { id: "s1", title: "为什么按块改", claimIds: ["c1"], figureIds: [], blockIds: ["b001"] },
      { id: "s2", title: "图放在哪", claimIds: ["c2"], figureIds: ["fig-flow"], blockIds: ["b002"] },
    ],
  });
  writeJson(join(article, "figures", "manifest.json"), {
    figures: [{ id: "fig-flow", kind: "mermaid", status: "planned", caption: "", alt: "", source: "figures/fig-flow.mmd", prompt: "", license: "", blockIds: ["b002"] }],
  });
  writeText(
    join(article, "blocks", "b001.md"),
    formatBlock(
      { id: "b001", status: "draft", claimIds: ["c1"], figureIds: [] },
      "改文章时，我经常只想换掉一句话。可每次把整篇交出去，拿回来的却是整篇都被动过的稿子。\n",
    ),
  );
  writeJsonl(join(article, "revisions.jsonl"), []);
  return article;
}

export function demoInputs(article: string): [ActionKind, Record<string, unknown>][] {
  return [
    [
      "ask_questions",
      {
        title: "确定文体和读者",
        context: "现有材料主要是一次设计过程和其中的取舍，答案会决定第一节怎么开头。",
        article,
        questions: [
          {
            id: "genre",
            prompt: "这篇文章你更希望读者把它当成哪一种？",
            recommended: "retro",
            options: [
              { id: "retro", label: "工程实践复盘", description: "材料里有完整的问题、约束和取舍" },
              { id: "tutorial", label: "面向新手的教程", description: "需要补充步骤和前置条件" },
              { id: "essay", label: "观点 / 论证文章" },
            ],
          },
          {
            id: "audience",
            prompt: "主要读者是谁？",
            recommended: "peers",
            options: [
              { id: "peers", label: "熟悉领域的同行", description: "保留专业细节" },
              { id: "newcomers", label: "刚入门的读者", description: "增加背景解释" },
              { id: "general", label: "跨领域的一般读者", description: "减少行话" },
            ],
          },
          {
            id: "focus",
            prompt: "这篇要覆盖哪些话题？（可多选）",
            multiple: true,
            options: [
              { id: "block", label: "按块修订" },
              { id: "figure", label: "图的存放" },
              { id: "lexicon", label: "词表与禁用说法" },
            ],
          },
        ],
      },
    ],
    [
      "review_writing_plan",
      {
        article: join(article, "..", "style-learning"),
        title: "从聊天到文章的风格学习",
        slug: "style-learning",
        topic: "风格",
        rationale: "材料是三次关于风格档案的讨论，适合写成设计论证。",
        plan: {
          genre: ["工程实践文章", "解释性文章"],
          audience: "熟悉后端开发、不了解本项目存储设计的工程师",
          purpose: "解释风格档案如何版本化，以及为什么只在文章结束时升级规则",
          styleAxes: { explanationPace: "先具体问题，再给原理", stance: "直接但标明适用边界", structure: "小标题清楚，正文保持连贯" },
          approach: "从一次风格被越改越空的具体问题出发，说明档案版本和候选规则，再讨论限制。",
          openQuestions: ["是否需要给出 profile.json 的完整示例？"],
        },
        approachOptions: [
          { id: "problem", label: "问题 → 约束 → 方案 → 取舍", description: "工程实践常用的推进方式" },
          { id: "concept", label: "现象 → 概念 → 证据 → 意义", description: "偏解释" },
        ],
      },
    ],
    [
      "review_claims",
      {
        article,
        context: "从 conv-1 的全文抽出 3 条候选主张。",
        claims: [
          { id: "c3", text: "审阅时只给前后两块的只读正文，用来接上语气。", sources: [{ kind: "conversation", id: "conv-1", note: "用户说怕改着改着语气断了" }] },
          { id: "c4", text: "用户要求整篇重写时，必须再确认一次。", sources: [{ kind: "conversation", id: "conv-1" }] },
          { id: "c5", text: "调试时用的 api_key=sk-test-123456789 不进正文。", secret: true, sources: [{ kind: "paste", id: "note-1" }] },
        ],
      },
    ],
    [
      "review_outline",
      {
        article,
        rationale: "按问题 → 方案 → 流程推进。",
        sections: [
          { id: "s1", title: "为什么按块改", claimIds: ["c1"], blockIds: ["b001"], summary: "从只想改一句却被整篇改写的经历开头" },
          { id: "s2", title: "图放在哪", claimIds: ["c2"], figureIds: ["fig-flow"], blockIds: ["b002"], summary: "图源和文章放一起" },
          { id: "s3", title: "一次修订怎么走", claimIds: [], blockIds: ["b003"], summary: "用流程把前两节串起来" },
        ],
        figures: [{ id: "fig-flow", kind: "mermaid", caption: "修订从主张走到分享包", blockIds: ["b002"] }],
      },
    ],
    [
      "review_block",
      {
        article,
        blockId: "b001",
        instruction: "按批注把开头改成具体问题",
        body:
          "我改文章时经常只想换掉一句，拿回来的却是整篇都被改过。值得注意的是，返工往往不是因为改错了，而是因为改多了。\n\n所以正文按块保存。修改时只提交这一块，前一块和后一块只供阅读，用来接上语气。没有点名的块留在原来的文件里，不会跟着重写。",
      },
    ],
    [
      "review_figure",
      {
        article,
        figureId: "fig-flow",
        caption: "修订从主张走到分享包，中间经过大纲和正文块。",
        alt: "从主张到分享包的四步",
        source: "flowchart LR\n  claims[主张] --> outline[大纲]\n  outline --> blocks[正文块]\n  blocks --> export[分享包]",
        blockIds: ["b002"],
      },
    ],
    [
      "review_style_candidates",
      {
        article,
        candidates: [
          { id: "cand-1", text: "段首先写具体问题，不写总括句", evidence: "b001：把「值得注意的是」开头改成了具体经历" },
          { id: "cand-2", text: "能写成句子就不列清单", evidence: "b002：把三条列表合成了一段" },
          { id: "cand-3", text: "少用「我们」，用第一人称单数", exemplars: ["我改文章时经常只想换掉一句。"] },
        ],
      },
    ],
  ];
}
