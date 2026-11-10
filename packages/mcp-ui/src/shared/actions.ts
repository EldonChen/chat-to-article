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
  "review_variants",
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

export const inquiryTurnSchema = z.object({
  turn: z.number().describe("第几轮追问（从 1 开始）"),
  question: z.string().describe("用户提出的追问或反问"),
  intent: z
    .enum(["trigger", "probe", "counter", "synthesis"])
    .or(z.string())
    .optional()
    .describe("追问性质：trigger（初始困惑）、probe（深入追问）、counter（认知碰撞/反问）、synthesis（归纳收敛）"),
  shift: z.string().optional().describe("这一问带来的认知推进或解开的卡点"),
  sourceId: z.string().optional(),
});
export type InquiryTurnWire = z.infer<typeof inquiryTurnSchema>;

export const writingMotivationFields = z.object({
  initialConfusion: z.string().describe("困惑起点：作者最初卡在什么问题、痛点或直觉冲突上"),
  inquiryJourney: z.array(inquiryTurnSchema).optional().describe("追问演进链：用户在对话中一步步追问的关键节点"),
  ahaMoment: z.string().describe("核心顿悟：追问到最后真正想通的核心判断"),
  knowledgeGaps: z.array(z.string()).optional().describe("待补认知缺口：聊天中跳过、尚未验证或缺少边界条件的地方"),
  readerValue: z.string().optional().describe("读者共鸣价值：处于相似困惑起点的读者顺着这条路径读完能收获什么"),
});
export type WritingMotivationFields = z.infer<typeof writingMotivationFields>;

export const visualStyleSelection = z.object({
  id: z.string().min(1).describe("视觉画风 id：tech-spotlight（现代科技解构风）、whiteboard-sketch（手绘白板风）、editorial-comic（科技条漫/插画风）、minimal-blueprint（极简工程蓝图风）或 custom"),
  name: z.string().optional(),
  note: z.string().optional(),
  referenceImage: z.string().optional().describe("全篇画风参考垫图路径（用于传入 GenerateImage 的 reference_image_paths）"),
});
export type VisualStyleSelection = z.infer<typeof visualStyleSelection>;

export const writingPlanFields = z.object({
  genre: z.array(z.string()).describe("文体，可组合，例如 [\"工程实践文章\", \"解释性文章\"]"),
  audience: z.string(),
  purpose: z.string(),
  styleAxes: z
    .record(z.string(), z.string())
    .describe("偏好轴：explanationPace、abstraction、stance、perspective、readerAssumption、structure、tone，值写倾向的一句话"),
  approach: z.string().describe("行文方案：推进逻辑，以及为什么适合这篇"),
  openQuestions: z.array(z.string()),
  motivation: writingMotivationFields.optional().describe("从用户连续追问中提取的结构化写作动机与认知轨迹"),
  visualStyle: visualStyleSelection.optional().describe("全篇统一的视觉配图画风预设与参考垫图"),
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

export const claimRoleEnum = z.enum(["friction", "insight", "evidence", "boundary"]);
export type ClaimRoleKind = z.infer<typeof claimRoleEnum>;

export const claimDraft = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  status: z.enum(["candidate", "accepted", "rejected", "disputed"]).optional(),
  role: claimRoleEnum
    .or(z.string())
    .optional()
    .describe("认知角色：friction（困惑/痛点）、insight（核心顿悟）、evidence（机制/证据）、boundary（适用边界）"),
  inquiryTurn: z.number().optional().describe("源自用户第几轮追问"),
  gapNote: z.string().optional().describe("待补证据或边界说明"),
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
      role: claimRoleEnum.or(z.string()).optional(),
      inquiryTurn: z.number().optional(),
      gapNote: z.string().optional(),
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
  summary: z.string().optional().describe("这一节打算写什么"),
  readerQuestion: z.string().optional().describe("这一节回应读者心里的什么疑问"),
  cognitiveRole: z.string().optional().describe("这一节在认知爬坡路径中的角色，例如「从痛点切入 → 建立核心洞察」"),
});

export const visualRoleEnum = z.enum(["hook", "analogy", "comparison", "mechanism", "evidence", "architecture"]);
export type VisualRoleKind = z.infer<typeof visualRoleEnum>;

export const aspectRatioEnum = z.enum(["1:1", "4:3", "3:4", "16:9", "9:16"]);

export const figureDraft = z.object({
  id: z.string().min(1),
  kind: z.enum(["mermaid", "drawio", "svg-chart", "raster", "remote"]),
  role: visualRoleEnum
    .or(z.string())
    .optional()
    .describe("视觉认知角色：hook（视觉钩子）、analogy（生活类比/条漫）、comparison（方案反差对比）、mechanism（核心机制拆解）、evidence（数据/实验证据）、architecture（全局认知地图）"),
  intent: z.string().optional().describe("配图意图（Visual Brief）：为什么这里需要一张图？替正文分担什么解释压力？"),
  takeaway: z.string().optional().describe("一秒结论（One-glance Takeaway）：读者扫一眼这张图 3 秒内该得出的核心判断"),
  anchorSummary: z.string().optional().describe("图文联动契约：图内关键节点/视觉锚点，以及正文因有此图可精简的描述"),
  caption: z.string().optional(),
  alt: z.string().optional(),
  source: z.string().optional(),
  prompt: z.string().optional().describe("当 kind 为 raster 时，提供给多模态生图工具 GenerateImage 的详细画面描述（至少 6 个词）"),
  aspectRatio: aspectRatioEnum.or(z.string()).optional().describe("多模态生图画幅比例：16:9、4:3、1:1、3:4 或 9:16"),
  referenceImages: z.array(z.string()).optional().describe("多模态生图的参考垫图路径列表（reference_image_paths）"),
  confirmed: z.boolean().optional().describe("用户是否已确认授权生成该 raster 插图"),
  blockIds: z.array(z.string()).optional(),
});
export type FigureDraftWire = z.infer<typeof figureDraft>;

export const reviewOutlineInput = {
  article: articlePath,
  sections: z.array(sectionDraft).min(1),
  figures: z.array(figureDraft).optional().describe("大纲里的图位；确认时写入 figures/manifest.json（raster 图确认后自动置 confirmed: true）"),
  rationale: z.string().optional(),
};
export const reviewOutlineArgs = z.object(reviewOutlineInput);
export type ReviewOutlineInput = z.infer<typeof reviewOutlineArgs>;

export const reviewOutlineResult = z.object({
  decision: z.enum(["confirm", "revise"]),
  sections: z.array(sectionDraft),
  figures: z.array(figureDraft).optional(),
  comments: z.array(z.object({ sectionId: z.string(), text: z.string() })),
  note: z.string().optional(),
});
export type ReviewOutlineResult = z.infer<typeof reviewOutlineResult>;

// review_variants ---------------------------------------------------------------

export const variantDraft = z.object({
  id: z.string().min(1).describe("版本 id，例如 A、B、C"),
  voice: z.string().min(1).describe("内置笔调 id（styles/presets.json 中定义的 id，如 tech-blogger、colleague、engineering、explainer、essay、opinion、narrative）、profile（按作者的偏好写）或 custom"),
  label: z.string().min(1).describe("给作者看的名字，例如「按你的偏好」「科技博主科普」「跟同事复盘」"),
  summary: z.string().optional().describe("一句话说这版和其他版差在哪"),
  body: z.string().min(1).describe("这一版的 Markdown 正文"),
});
export type VariantDraft = z.infer<typeof variantDraft>;

export const reviewVariantsInput = {
  article: articlePath,
  blockId: z.string().min(1).describe("大纲里的块 id，例如 b001"),
  variants: z.array(variantDraft).min(2).max(4).describe("同一块、同样主张、不同笔调的几版；有偏好材料时其中一版的 voice 为 profile"),
  claimIds: z.array(z.string()).optional(),
  figureIds: z.array(z.string()).optional(),
  context: z.string().optional().describe("为什么出这几版，例如「还没选定笔调」"),
};
export const reviewVariantsArgs = z.object(reviewVariantsInput);
export type ReviewVariantsInput = z.infer<typeof reviewVariantsArgs>;

export const reviewVariantsResult = z.object({
  decision: z.enum(["pick", "regenerate", "later"]),
  chosenId: z.string().optional(),
  feedback: z.array(z.object({ variantId: z.string(), text: z.string() })),
  note: z.string().optional(),
});
export type ReviewVariantsResult = z.infer<typeof reviewVariantsResult>;

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

export const blockFigureRequest = z.object({
  id: z.string().min(1),
  kind: z.enum(["mermaid", "drawio", "svg-chart", "raster", "remote"]).or(z.string()).optional(),
  role: visualRoleEnum.or(z.string()).optional(),
  intent: z.string().min(1),
  takeaway: z.string().optional(),
  anchorSummary: z.string().optional(),
  prompt: z.string().optional(),
  aspectRatio: z.string().optional(),
  caption: z.string().optional(),
});
export type BlockFigureRequest = z.infer<typeof blockFigureRequest>;

export const reviewBlockResult = z.object({
  decision: z.enum(["accept", "revise", "later"]),
  finalBody: z.string(),
  changes: z.array(trackedChange),
  comments: z.array(reviewComment),
  figureIds: z.array(z.string()).optional(),
  figureRequests: z.array(blockFigureRequest).optional(),
  note: z.string().optional(),
});
export type ReviewBlockResult = z.infer<typeof reviewBlockResult>;

// review_figure -----------------------------------------------------------------

export const reviewFigureInput = {
  article: articlePath,
  figureId: z.string().min(1),
  kind: z.enum(["mermaid", "svg-chart", "drawio", "raster", "remote"]).optional().describe("图类型：mermaid、svg-chart、raster（多模态生图）、drawio 或 remote，默认 mermaid"),
  role: visualRoleEnum.or(z.string()).optional().describe("视觉认知角色：hook、analogy、comparison、mechanism、evidence、architecture"),
  intent: z.string().optional().describe("配图意图（Visual Brief）：为什么这里需要一张图"),
  takeaway: z.string().optional().describe("一秒结论（读者扫一眼得出的核心判断）"),
  anchorSummary: z.string().optional().describe("图文联动契约（图中关键节点/视觉元素与正文删减/呼应约定）"),
  source: z.string().min(1).describe("当为 mermaid/svg-chart 时传图源文本（写入 figures/<id>.mmd 或 .svg）；当为 raster/remote 时传图片相对路径（如 figures/<id>.png）或画面描述"),
  prompt: z.string().optional().describe("当 kind 为 raster 时，提供给 GenerateImage 的画面描述 Prompt"),
  aspectRatio: aspectRatioEnum.or(z.string()).optional().describe("当 kind 为 raster 时，画幅比例（16:9、4:3、1:1、3:4、9:16）"),
  referenceImages: z.array(z.string()).optional().describe("当 kind 为 raster 时，传入 GenerateImage 的参考垫图路径列表（reference_image_paths）"),
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
  role: z.string().optional(),
  intent: z.string().optional(),
  takeaway: z.string().optional(),
  anchorSummary: z.string().optional(),
  prompt: z.string().optional(),
  aspectRatio: z.string().optional(),
  referenceImages: z.array(z.string()).optional(),
  blockIds: z.array(z.string()).optional(),
  markBlocksStale: z.boolean().optional(),
  textSyncNote: z.string().optional(),
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

export interface BlockFigureWire {
  id: string;
  kind: string;
  status: string;
  role?: string;
  intent?: string;
  takeaway?: string;
  anchorSummary?: string;
  caption?: string;
  alt?: string;
  source?: string;
  prompt?: string;
  aspectRatio?: string;
  referenceImages?: string[];
  confirmed?: boolean;
  content?: string | null;
  imageDataUrl?: string | null;
}

export interface BlockContext {
  previousBody: string | null;
  status: string;
  sectionTitle: string | null;
  readerQuestion?: string | null;
  cognitiveRole?: string | null;
  claims: { id: string; text: string; status: string; role?: string; gapNote?: string }[];
  figures?: BlockFigureWire[];
  availableFigures?: BlockFigureWire[];
  visualStyle?: VisualStyleSelection | null;
  prev: { id: string; body: string } | null;
  next: { id: string; body: string } | null;
  rules: LexiconRuleWire[];
  styleRules: { id: string; text: string; strength: string }[];
  paragraph: { minChars?: number; maxChars?: number } | null;
  styleRevision: number | null;
  motivation?: WritingMotivationFields | null;
}

export interface VariantsContext {
  sectionTitle: string | null;
  readerQuestion?: string | null;
  claims: { id: string; text: string; status: string; role?: string }[];
  prev: { id: string; body: string } | null;
  preferences: { id: string; text: string }[];
  motivation?: WritingMotivationFields | null;
}

export interface ClaimsContext {
  existing: {
    id: string;
    text: string;
    status: string;
    role?: string;
    inquiryTurn?: number;
    gapNote?: string;
    sources?: { kind: string; id?: string; note?: string }[];
    secret?: boolean;
    resolved?: boolean;
  }[];
  usedBy: Record<string, string[]>;
  materials: { selected?: string[]; fullText?: string[] } | null;
  motivation?: WritingMotivationFields | null;
}

export interface OutlineContext {
  claims: { id: string; text: string; status: string; role?: string; inquiryTurn?: number; gapNote?: string }[];
  existing: {
    id: string;
    title: string;
    claimIds: string[];
    figureIds: string[];
    blockIds: string[];
    summary?: string;
    readerQuestion?: string;
    cognitiveRole?: string;
  }[];
  figures: {
    id: string;
    kind: string;
    role?: string;
    intent?: string;
    takeaway?: string;
    anchorSummary?: string;
    caption?: string;
    alt?: string;
    source?: string;
    prompt?: string;
    aspectRatio?: string;
    referenceImages?: string[];
    confirmed?: boolean;
    blockIds?: string[];
    status: string;
  }[];
  blockStatus: Record<string, string>;
  confirmed: boolean;
  motivation?: WritingMotivationFields | null;
  visualStyle?: VisualStyleSelection | null;
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
  imageDataUrl?: string | null;
  visualStyle?: VisualStyleSelection | null;
  styleAnchorImage?: string | null;
  figure?: {
    id: string;
    kind: string;
    role?: string;
    intent?: string;
    takeaway?: string;
    anchorSummary?: string;
    caption?: string;
    alt?: string;
    source?: string;
    prompt?: string;
    aspectRatio?: string;
    referenceImages?: string[];
    confirmed?: boolean;
    blockIds: string[];
  };
  linkedBlocks?: {
    id: string;
    status: string;
    sectionTitle?: string | null;
    body: string;
  }[];
  allBlocks?: {
    id: string;
    sectionTitle?: string | null;
    status: string;
  }[];
}
