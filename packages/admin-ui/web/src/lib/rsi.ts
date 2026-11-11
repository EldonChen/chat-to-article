export const RSI_DIMENSIONS = [
  { key: "opening", label: "开篇", weight: 20 },
  { key: "bridge", label: "桥梁", weight: 25 },
  { key: "mechanism", label: "机制", weight: 20 },
  { key: "analogy", label: "克制类比", weight: 15 },
  { key: "visual", label: "视觉", weight: 10 },
  { key: "review", label: "审阅", weight: 10 },
] as const;

export type RsiDimensionKey = (typeof RSI_DIMENSIONS)[number]["key"];

export const DIAGNOSIS_CHIPS = [
  "哑谜标题",
  "知识树缺层",
  "普通生成晚于掩码",
  "开篇不是一次失败",
  "数字离开了原材料",
  "格式前后不一致",
  "图片死链或乱码",
  "节末不是问句",
  "伪比喻抢了机制",
  "overfit",
] as const;

export const SCORE_ANCHORS = [20, 40, 60, 70, 90] as const;

export interface RsiDimensionScore {
  label: string;
  max: number | null;
  reader: number | null;
  director: number | null;
  author: number | null;
  value: number | null;
  quote: string;
}

export interface RsiGate {
  name: string;
  passed: boolean | null;
  detail: string;
}

export interface RsiScore {
  total: number | null;
  raw: number | null;
  overfit: boolean | "unreviewed" | null;
  summary: string;
  dimensions: RsiDimensionScore[];
  gates: RsiGate[];
  strengths: string[];
  weaknesses: string[];
  markdown: string;
}

export interface RsiRound {
  id: string;
  label: string;
  kind: "baseline" | "round" | "fresh" | "archive" | "other";
  archived: boolean;
  order: number;
  relDir: string;
  updatedAt: string | null;
  hasArticle: boolean;
  title: string | null;
  headings: { level: number; text: string }[];
  charCount: number;
  tableCount: number;
  images: { alt: string; file: string; url: string }[];
  articleMarkdown: string;
  articleSource: string;
  score: RsiScore | null;
  gradient: { text: string; items: { n: number; text: string }[] } | null;
  writingPlan: unknown;
  writingPlanError: string | null;
  userRating: UserRating | null;
}

export interface UserRating {
  roundId: string;
  savedAt: string;
  dimensions: Record<RsiDimensionKey, number>;
  weights: Record<RsiDimensionKey, number>;
  weightedTotal: number;
  chips: string[];
  note: string;
  feedbackMarkdown: string;
}

export interface RsiIndex {
  root: string | null;
  scannedAt: string;
  rounds: RsiRound[];
}

export interface RatingDraft {
  dimensions: Record<RsiDimensionKey, number>;
  chips: string[];
  note: string;
}

export function weightedTotal(dimensions: Record<RsiDimensionKey, number>): number {
  const total = RSI_DIMENSIONS.reduce((sum, dim) => sum + (dimensions[dim.key] / 100) * dim.weight, 0);
  return Math.round(total * 10) / 10;
}

export function feedbackMarkdown(label: string, draft: RatingDraft, total = weightedTotal(draft.dimensions)): string {
  const rows = RSI_DIMENSIONS.map((dim) => `| ${dim.label} | ${dim.weight} | ${draft.dimensions[dim.key]} |`).join("\n");
  const chips = draft.chips.length ? draft.chips.join("、") : "（无）";
  const note = draft.note.trim() ? `\n\n补充意见：\n\n${draft.note.trim()}\n` : "\n";
  return `# 用户实评 · ${label}\n\n加权总分：**${total.toFixed(1)}** / 100\n\n| 维 | 权重 | 滑块 |\n| --- | --- | --- |\n${rows}\n\n诊断：${chips}${note}`;
}

export function draftFrom(rating: UserRating | null): RatingDraft {
  const dimensions = {} as Record<RsiDimensionKey, number>;
  for (const dim of RSI_DIMENSIONS) dimensions[dim.key] = rating?.dimensions[dim.key] ?? 60;
  return { dimensions, chips: [...(rating?.chips ?? [])], note: rating?.note ?? "" };
}
