import { z } from "zod";

/**
 * 工具输入（agent 给的草案）与提交结果（用户在嵌入界面上的决定）的契约。
 * 服务端用它校验，界面只引用类型。
 */

export const ACTIONS = [
  "ask_questions",
  "review_writing_plan",
  "review_claims",
  "review_outline",
  "review_block",
  "review_figure",
  "review_style_candidates",
] as const;
export type ActionKind = (typeof ACTIONS)[number];

const articlePath = z
  .string()
  .min(1)
  .describe("文章目录的绝对路径，例如 /path/to/project/articles/<slug>。相对路径按 MCP 进程的工作目录解析。");

// ask_questions ---------------------------------------------------------------

export const questionOption = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional().describe("一句话说明这个选项会带来什么，或一段短例文"),
});

export const askQuestionsInput = {
  title: z.string().min(1).describe("这组问题要解决的决定，例如「确定文体和读者」"),
  context: z.string().optional().describe("为什么现在问、答案会影响什么"),
  questions: z
    .array(
      z.object({
        id: z.string().min(1),
        prompt: z.string().min(1),
        options: z.array(questionOption).min(2),
        recommended: z.string().optional().describe("推荐选项的 id；推荐理由写进 prompt 或 option.description"),
        multiple: z.boolean().optional().describe("允许多选"),
        allowCustom: z.boolean().optional().describe("允许自由填写，默认 true"),
      }),
    )
    .min(1)
    .max(6),
  article: articlePath.optional(),
};
export const askQuestionsArgs = z.object(askQuestionsInput);
export type AskQuestionsInput = z.infer<typeof askQuestionsArgs>;

export const askQuestionsResult = z.object({
  decision: z.enum(["submit", "skip"]),
  answers: z.array(
    z.object({
      questionId: z.string(),
      optionIds: z.array(z.string()),
      custom: z.string().optional(),
      unsure: z.boolean().optional(),
    }),
  ),
  note: z.string().optional(),
});
export type AskQuestionsResult = z.infer<typeof askQuestionsResult>;

// review_writing_plan -----------------------------------------------------------

export const writingPlanFields = z.object({
  genre: z.array(z.string()).describe("文体，可组合，例如 [\"工程实践文章\", \"解释性文章\"]"),
  audience: z.string(),
  purpose: z.string(),
  styleAxes: z
    .record(z.string(), z.string())
    .describe("偏好轴：explanationPace、abstraction、stance、perspective、readerAssumption、structure、tone，值写倾向的一句话"),
  approach: z.string().describe("行文方案：推进逻辑，以及为什么适合这篇"),
  openQuestions: z.array(z.string()),
});
export type WritingPlanFields = z.infer<typeof writingPlanFields>;

export const reviewWritingPlanInput = {
  article: articlePath.describe("文章目录。用户确认前目录可以不存在，确认后才会写入 writing-plan.json"),
  title: z.string().optional(),
  slug: z.string().optional(),
  topic: z.string().optional(),
  plan: writingPlanFields,
  approachOptions: z
    .array(z.object({ id: z.string(), label: z.string(), description: z.string().optional() }))
    .optional()
    .describe("可选的其他行文方案，用户可以一键换用"),
  rationale: z.string().optional().describe("你为什么这样建议，基于哪些材料"),
};
export const reviewWritingPlanArgs = z.object(reviewWritingPlanInput);
export type ReviewWritingPlanInput = z.infer<typeof reviewWritingPlanArgs>;

export const reviewWritingPlanResult = z.object({
  decision: z.enum(["confirm", "revise", "pause"]),
  plan: writingPlanFields,
  comments: z.array(z.object({ field: z.string(), text: z.string() })),
  note: z.string().optional(),
});
export type ReviewWritingPlanResult = z.infer<typeof reviewWritingPlanResult>;

// review_claims -----------------------------------------------------------------

export const claimSource = z.object({
  kind: z.string().describe("conversation、file 或 paste"),
  id: z.string().optional(),
  note: z.string().optional(),
});

export const claimDraft = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  status: z.enum(["candidate", "accepted", "rejected", "disputed"]).optional(),
  sources: z.array(claimSource).optional(),
  secret: z.boolean().optional().describe("原文疑似含密钥"),
});

export const reviewClaimsInput = {
  article: articlePath,
  claims: z.array(claimDraft).min(1).describe("本轮要用户决定的主张。新 id 会先作为 candidate 写入 claims.jsonl"),
  materials: z
    .object({ selected: z.array(z.string()), fullText: z.array(z.string()) })
    .optional()
    .describe("check-materials 之后的勾选结果；提交时写入 materials.json"),
  context: z.string().optional(),
};
export const reviewClaimsArgs = z.object(reviewClaimsInput);
export type ReviewClaimsInput = z.infer<typeof reviewClaimsArgs>;

export const reviewClaimsResult = z.object({
  decision: z.enum(["submit", "revise"]),
  claims: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      status: z.enum(["candidate", "accepted", "rejected", "disputed"]),
      sources: z.array(claimSource).optional(),
      secret: z.boolean().optional(),
      resolved: z.boolean().optional(),
      comment: z.string().optional(),
      isNew: z.boolean().optional(),
    }),
  ),
  note: z.string().optional(),
});
export type ReviewClaimsResult = z.infer<typeof reviewClaimsResult>;

// review_outline ----------------------------------------------------------------

export const sectionDraft = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  claimIds: z.array(z.string()),
  figureIds: z.array(z.string()).optional(),
  blockIds: z.array(z.string()).optional(),
  summary: z.string().optional().describe("这一节打算写什么，只用于审阅，不写入 outline.json"),
});

export const figureDraft = z.object({
  id: z.string().min(1),
  kind: z.enum(["mermaid", "drawio", "svg-chart", "raster", "remote"]),
  caption: z.string().optional(),
  alt: z.string().optional(),
  source: z.string().optional(),
  blockIds: z.array(z.string()).optional(),
});

export const reviewOutlineInput = {
  article: articlePath,
  sections: z.array(sectionDraft).min(1),
  figures: z.array(figureDraft).optional().describe("大纲里的图位；确认时以 planned 状态写入 figures/manifest.json"),
  rationale: z.string().optional(),
};
export const reviewOutlineArgs = z.object(reviewOutlineInput);
export type ReviewOutlineInput = z.infer<typeof reviewOutlineArgs>;

export const reviewOutlineResult = z.object({
  decision: z.enum(["confirm", "revise"]),
  sections: z.array(sectionDraft),
  comments: z.array(z.object({ sectionId: z.string(), text: z.string() })),
  note: z.string().optional(),
});
export type ReviewOutlineResult = z.infer<typeof reviewOutlineResult>;

// review_block ------------------------------------------------------------------

export const reviewBlockInput = {
  article: articlePath,
  blockId: z.string().min(1).describe("大纲里的块 id，例如 b001"),
  body: z.string().min(1).describe("这块的 Markdown 正文。调用时会以 draft 状态写入 blocks/<id>.md"),
  claimIds: z.array(z.string()).optional().describe("这块使用的主张；默认沿用块文件或所在章节的 claimIds"),
  figureIds: z.array(z.string()).optional(),
  instruction: z.string().optional().describe("这一版做了什么，例如「按批注把开头改成具体问题」"),
};
export const reviewBlockArgs = z.object(reviewBlockInput);
export type ReviewBlockInput = z.infer<typeof reviewBlockArgs>;

export const trackedChange = z.object({
  kind: z.enum(["insert", "delete", "replace"]),
  before: z.string(),
  after: z.string(),
  context: z.string(),
});
export type TrackedChange = z.infer<typeof trackedChange>;

export const reviewComment = z.object({ id: z.string(), quote: z.string(), text: z.string() });
export type ReviewComment = z.infer<typeof reviewComment>;

export const reviewBlockResult = z.object({
  decision: z.enum(["accept", "revise", "later"]),
  finalBody: z.string(),
  changes: z.array(trackedChange),
  comments: z.array(reviewComment),
  note: z.string().optional(),
});
export type ReviewBlockResult = z.infer<typeof reviewBlockResult>;

// review_figure -----------------------------------------------------------------

export const reviewFigureInput = {
  article: articlePath,
  figureId: z.string().min(1),
  kind: z.enum(["mermaid", "svg-chart"]).optional().describe("可在界面里直接编辑源文件的图类型，默认 mermaid"),
  source: z.string().min(1).describe("图源文本。调用时写入 figures/<id>.mmd（或 .svg），图记录置为 drafted"),
  caption: z.string().optional(),
  alt: z.string().optional(),
  blockIds: z.array(z.string()).optional(),
};
export const reviewFigureArgs = z.object(reviewFigureInput);
export type ReviewFigureInput = z.infer<typeof reviewFigureArgs>;

export const reviewFigureResult = z.object({
  decision: z.enum(["accept", "revise", "later"]),
  source: z.string(),
  caption: z.string(),
  alt: z.string(),
  note: z.string().optional(),
});
export type ReviewFigureResult = z.infer<typeof reviewFigureResult>;

// review_style_candidates ------------------------------------------------------

export const reviewStyleCandidatesInput = {
  article: articlePath.optional(),
  candidates: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1).describe("候选规则，写成可执行的一句话"),
        evidence: z.string().optional().describe("来自哪次修改，例如修订记录里的前后对比"),
        exemplars: z.array(z.string()).optional(),
      }),
    )
    .min(1),
};
export const reviewStyleCandidatesArgs = z.object(reviewStyleCandidatesInput);
export type ReviewStyleCandidatesInput = z.infer<typeof reviewStyleCandidatesArgs>;

export const reviewStyleCandidatesResult = z.object({
  decision: z.enum(["submit", "later"]),
  selected: z.array(z.object({ id: z.string(), text: z.string() })),
  rejected: z.array(z.string()),
  note: z.string().optional(),
});
export type ReviewStyleCandidatesResult = z.infer<typeof reviewStyleCandidatesResult>;

// session wire format ------------------------------------------------------------

export interface LexiconRuleWire {
  id: string;
  severity: string;
  source: string;
  flags: string;
  replacement: string;
}

export interface SessionSummary {
  id: string;
  action: ActionKind;
  title: string;
  article: string | null;
  createdAt: string;
  status: "pending" | "submitted" | "expired" | "cancelled";
  decision?: string;
}

export interface SessionDetail<I = unknown, C = unknown> extends SessionSummary {
  input: I;
  context: C;
  result?: unknown;
  response?: string;
}

export interface BlockContext {
  previousBody: string | null;
  status: string;
  sectionTitle: string | null;
  claims: { id: string; text: string; status: string }[];
  prev: { id: string; body: string } | null;
  next: { id: string; body: string } | null;
  rules: LexiconRuleWire[];
  styleRules: { id: string; text: string; strength: string }[];
  paragraph: { minChars?: number; maxChars?: number } | null;
  styleRevision: number | null;
}

export interface ClaimsContext {
  existing: { id: string; text: string; status: string; sources?: { kind: string; id?: string; note?: string }[]; secret?: boolean; resolved?: boolean }[];
  usedBy: Record<string, string[]>;
  materials: { selected?: string[]; fullText?: string[] } | null;
}

export interface OutlineContext {
  claims: { id: string; text: string; status: string }[];
  existing: { id: string; title: string; claimIds: string[]; figureIds: string[]; blockIds: string[] }[];
  figures: { id: string; kind: string; caption?: string; status: string }[];
  blockStatus: Record<string, string>;
  confirmed: boolean;
}

export interface PlanContext {
  articleExists: boolean;
  existingPlan: WritingPlanFields | null;
  confirmed: boolean;
}

export interface FigureContext {
  previousSource: string | null;
  status: string;
  rules: LexiconRuleWire[];
}
