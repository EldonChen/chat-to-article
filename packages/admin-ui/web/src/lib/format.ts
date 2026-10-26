import type { ArticleSummary } from "@liem-opc/chat-to-article-core/types";

export const PHASES: { id: string; label: string; hint: string }[] = [
  { id: "planning", label: "写作计划", hint: "确认文体、读者、目的和行文方案" },
  { id: "intake", label: "收集材料", hint: "检索并核对聊天全文" },
  { id: "claims", label: "主张", hint: "主张已确认，等待大纲" },
  { id: "outline", label: "大纲", hint: "大纲已确认，可以起草" },
  { id: "drafting", label: "起草", hint: "正在逐块起草" },
  { id: "review", label: "审阅", hint: "逐块审阅与接受" },
  { id: "export", label: "已导出", hint: "分享包已生成" },
];

export const phaseLabel = (phase: string) => PHASES.find((p) => p.id === phase)?.label ?? phase;
export const phaseIndex = (phase: string) => Math.max(0, PHASES.findIndex((p) => p.id === phase));

export interface Gate {
  id: string;
  label: string;
  done: boolean;
  detail: string;
}

export function gates(a: ArticleSummary): Gate[] {
  const blocksDone = a.blocks.total > 0 && a.blocks.accepted === a.blocks.total;
  return [
    { id: "plan", label: "计划", done: !!a.meta.writingPlanConfirmed, detail: a.meta.writingPlanConfirmed ? "写作计划已确认" : "写作计划未确认" },
    {
      id: "claims",
      label: "主张",
      done: !!a.meta.claimsConfirmed,
      detail: `${a.claims.accepted}/${a.claims.total} 条已接受${a.meta.claimsConfirmed ? "，已确认" : ""}`,
    },
    { id: "outline", label: "大纲", done: !!a.meta.outlineConfirmed, detail: `${a.sections} 节${a.meta.outlineConfirmed ? "，已确认" : "，未确认"}` },
    { id: "blocks", label: "正文", done: blocksDone, detail: `${a.blocks.accepted}/${a.blocks.total} 块已接受` },
    { id: "export", label: "分享包", done: a.hasExport, detail: a.hasExport ? "export/ 已生成" : a.exportReady ? "可以导出" : `${a.exportErrorCount} 项未通过` },
  ];
}

export function progress(a: ArticleSummary): number {
  const g = gates(a);
  const base = g.filter((x) => x.done && x.id !== "blocks").length;
  const blockShare = a.blocks.total ? a.blocks.accepted / a.blocks.total : 0;
  return Math.round(((base + blockShare) / g.length) * 100);
}

export interface Attention {
  level: "danger" | "warn" | "info";
  text: string;
}

export function attention(a: ArticleSummary): Attention[] {
  const out: Attention[] = [];
  if (a.banCount) out.push({ level: "danger", text: `${a.banCount} 处禁用说法` });
  if (a.blocks.stale) out.push({ level: "warn", text: `${a.blocks.stale} 块待复核（主张变了）` });
  if (a.claims.candidate || a.claims.disputed)
    out.push({ level: "warn", text: `${a.claims.candidate + a.claims.disputed} 条主张未决定` });
  if (a.blocks.draft) out.push({ level: "info", text: `${a.blocks.draft} 块草稿待审` });
  if (a.blocks.accepted === a.blocks.total && a.blocks.total > 0 && !a.hasExport && a.exportReady)
    out.push({ level: "info", text: "可以生成分享包" });
  return out;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.round(hour / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

export const STATUS_LABEL: Record<string, string> = {
  accepted: "已接受",
  draft: "草稿",
  stale: "待复核",
  candidate: "候选",
  rejected: "已拒绝",
  disputed: "有争议",
  planned: "规划中",
  drafted: "已出稿",
  active: "生效",
  confirmed: "已确认",
  ban: "禁用",
  watch: "观察",
  allow: "放行",
  prefer: "替换",
  enforce: "强制",
  missing: "未写",
};

export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;
