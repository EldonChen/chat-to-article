import { Columns3, FileQuestion, Image, ListChecks, ListTree, Notebook, PenLine, Sparkles, type LucideIcon } from "lucide-react";
import type { ActionKind } from "../../../src/shared/actions.ts";

export const ACTION_META: Record<ActionKind, { label: string; icon: LucideIcon; hint: string }> = {
  ask_questions: { label: "回答问题", icon: FileQuestion, hint: "agent 需要你做几个决定" },
  review_writing_plan: { label: "写作计划", icon: Notebook, hint: "文体、读者、偏好轴和行文方案" },
  review_claims: { label: "主张", icon: ListChecks, hint: "决定哪些主张能写进正文" },
  review_outline: { label: "大纲", icon: ListTree, hint: "章节顺序、主张和块的分配" },
  review_variants: { label: "选笔调", icon: Columns3, hint: "同一块的几种写法，挑最像你的" },
  review_block: { label: "正文块", icon: PenLine, hint: "像 Word 修订一样改字、加批注" },
  review_figure: { label: "插图", icon: Image, hint: "图源、图注和替代文字" },
  review_style_candidates: { label: "风格候选", icon: Sparkles, hint: "把修改习惯写进个人风格" },
};

export const DECISION_LABEL: Record<string, string> = {
  submit: "已提交",
  skip: "已跳过",
  confirm: "已确认",
  revise: "要求修改",
  pause: "暂停",
  accept: "已接受",
  pick: "已选定",
  regenerate: "换一组",
  later: "稍后",
};
