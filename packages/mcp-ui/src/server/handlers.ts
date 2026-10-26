import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadBlock, loadClaims, loadFigures, loadOutline, readJson, type WritingPlan } from "@liem-opc/chat-to-article-core";
import type { z } from "zod";
import {
  askQuestionsArgs,
  askQuestionsResult,
  reviewBlockArgs,
  reviewBlockResult,
  reviewClaimsArgs,
  reviewClaimsResult,
  reviewFigureArgs,
  reviewFigureResult,
  reviewOutlineArgs,
  reviewOutlineResult,
  reviewStyleCandidatesArgs,
  reviewStyleCandidatesResult,
  reviewWritingPlanArgs,
  reviewWritingPlanResult,
  type ActionKind,
  type BlockContext,
  type ClaimsContext,
  type FigureContext,
  type OutlineContext,
  type PlanContext,
} from "../shared/actions.ts";
import {
  appendCandidateClaims,
  applyClaimDecisions,
  checkDraft,
  ctaCommand,
  lexiconRules,
  loadMeta,
  pinnedProfile,
  readFigureSource,
  requireArticle,
  resolveArticle,
  sectionOfBlock,
  UserFacingError,
  upsertFigures,
  writeBlockDraft,
  writeFigureSource,
  writeMaterials,
  writeOutline,
  writePlan,
} from "./article-io.ts";

export interface Prepared {
  title: string;
  article: string | null;
  context: unknown;
}

export interface Handler<A extends z.ZodTypeAny = z.ZodTypeAny, R extends z.ZodTypeAny = z.ZodTypeAny> {
  kind: ActionKind;
  description: string;
  args: A;
  result: R;
  /** 工具被调用时执行：校验门禁、写入 agent 的草稿、收集审阅界面需要的上下文。 */
  prepare(input: z.infer<A>): Prepared;
  /** 用户提交时执行：按决定落盘，返回给 agent 的说明。 */
  submit(input: z.infer<A>, result: z.infer<R>): string;
}

const q = (s: string) => JSON.stringify(s);

function lines(...parts: (string | number | false | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join("\n");
}

function note(n?: string) {
  return n?.trim() ? `用户的整体意见：${n.trim()}` : null;
}

// ---------------------------------------------------------------------------

const askQuestions: Handler<typeof askQuestionsArgs, typeof askQuestionsResult> = {
  kind: "ask_questions",
  description:
    "在对话里嵌入一组选择题（1–6 道，带推荐项、自定义回答和「暂不确定」），让用户作答。用于写作计划、方向变化等需要作者决定的事项。只读，不写文件。",
  args: askQuestionsArgs,
  result: askQuestionsResult,
  prepare(input) {
    return { title: input.title, article: input.article ? resolveArticle(input.article) : null, context: {} };
  },
  submit(input, result) {
    if (result.decision === "skip") return lines("用户跳过了这组问题，请按你的推荐继续，并在下一步复述你的假设。", note(result.note));
    const out = ["用户的回答："];
    for (const question of input.questions) {
      const answer = result.answers.find((a) => a.questionId === question.id);
      const labels = (answer?.optionIds ?? []).map((id) => question.options.find((o) => o.id === id)?.label ?? id);
      const parts = [...labels];
      if (answer?.custom?.trim()) parts.push(`自定义：${answer.custom.trim()}`);
      if (answer?.unsure) parts.push("暂不确定，由你根据材料建议");
      out.push(`- ${question.prompt} → ${parts.join("；") || "（未作答）"}`);
    }
    out.push(note(result.note) ?? "", "先复述你对答案的理解，再更新计划或继续。");
    return lines(...out);
  },
};

// ---------------------------------------------------------------------------

const reviewWritingPlan: Handler<typeof reviewWritingPlanArgs, typeof reviewWritingPlanResult> = {
  kind: "review_writing_plan",
  description:
    "把文章级写作计划（文体、读者、目的、偏好轴、行文方案、待定问题）嵌入对话让用户修改与确认。用户确认后写入 <article>/writing-plan.json；目录不存在时会创建，之后你仍需运行 new-article 与 set-gate --plan。",
  args: reviewWritingPlanArgs,
  result: reviewWritingPlanResult,
  prepare(input) {
    const dir = resolveArticle(input.article);
    const meta = loadMeta(dir);
    const existing = readJson<WritingPlan>(join(dir, "writing-plan.json"));
    const context: PlanContext = {
      articleExists: !!meta,
      existingPlan: existing
        ? {
            genre: existing.genre ?? [],
            audience: existing.audience ?? "",
            purpose: existing.purpose ?? "",
            styleAxes: existing.styleAxes ?? {},
            approach: existing.approach ?? "",
            openQuestions: existing.openQuestions ?? [],
          }
        : null,
      confirmed: !!meta?.writingPlanConfirmed,
    };
    return { title: `写作计划：${input.title ?? meta?.title ?? input.slug ?? dir}`, article: dir, context };
  },
  submit(input, result) {
    const dir = resolveArticle(input.article);
    const cta = ctaCommand(dir);
    const comments = result.comments.filter((c) => c.text.trim()).map((c) => `- ${c.field}：${c.text.trim()}`);
    if (result.decision === "pause") return lines("用户暂停了写作计划，先不要创建文章或抽取主张。", note(result.note), ...comments);
    if (result.decision === "revise")
      return lines(
        "用户要求修改写作计划，尚未确认，没有写入任何文件。",
        "用户改过的计划：",
        JSON.stringify(result.plan, null, 2),
        comments.length ? "逐项意见：" : null,
        ...comments,
        note(result.note),
        "按意见修改后再次调用 review_writing_plan。",
      );
    writePlan(dir, result.plan);
    const hasMeta = existsSync(join(dir, "meta.json"));
    return lines(
      `用户确认了写作计划，已写入 ${join(dir, "writing-plan.json")}。`,
      ...comments,
      note(result.note),
      "下一步：",
      !hasMeta &&
        `${cta} new-article --title ${q(input.title ?? "标题")} --slug ${q(input.slug ?? "slug")} --topic ${q(input.topic ?? "")} --dir ${q(dir)}`,
      `${cta} set-gate --article ${q(dir)} --plan`,
    );
  },
};

// ---------------------------------------------------------------------------

const reviewClaims: Handler<typeof reviewClaimsArgs, typeof reviewClaimsResult> = {
  kind: "review_claims",
  description:
    "在对话里嵌入主张清单，让用户逐条接受、拒绝、标记争议或改写，并可新增主张。调用时新 id 以 candidate 写入 claims.jsonl；提交后写入用户的决定，文本改变或被拒绝的主张会让引用它的块变为 stale。",
  args: reviewClaimsArgs,
  result: reviewClaimsResult,
  prepare(input) {
    const dir = resolveArticle(input.article);
    const meta = requireArticle(dir);
    appendCandidateClaims(dir, input.claims);
    const existing = loadClaims(dir);
    const usedBy: Record<string, string[]> = {};
    for (const section of loadOutline(dir).sections)
      for (const blockId of section.blockIds) {
        const block = loadBlock(dir, blockId);
        for (const id of block.meta?.claimIds ?? []) (usedBy[id] ??= []).push(blockId);
      }
    const context: ClaimsContext = {
      existing: existing.map((c) => ({ id: c.id, text: c.text, status: c.status, sources: c.sources, secret: c.secret, resolved: c.resolved })),
      usedBy,
      materials: input.materials ?? readJson(join(dir, "materials.json")),
    };
    return { title: `主张：${meta.title}`, article: dir, context };
  },
  submit(input, result) {
    const dir = resolveArticle(input.article);
    const cta = ctaCommand(dir);
    const comments = result.claims.filter((c) => c.comment?.trim()).map((c) => `- ${c.id}：${c.comment!.trim()}`);
    if (result.decision === "revise")
      return lines(
        "用户要求你先补充或重新整理主张，本轮决定没有写入。",
        ...comments,
        note(result.note),
        "用户提交时的状态：",
        ...result.claims.map((c) => `- ${c.id} [${c.status}] ${c.text}`),
      );
    if (input.materials) writeMaterials(dir, input.materials);
    const { updated, added, stale } = applyClaimDecisions(dir, result.claims);
    const open = result.claims.filter((c) => c.status === "candidate" || c.status === "disputed").map((c) => c.id);
    const secrets = result.claims.filter((c) => c.secret && !c.resolved).map((c) => c.id);
    const accepted = result.claims.filter((c) => c.status === "accepted").length;
    return lines(
      `已写入 claims.jsonl：更新 ${updated.length} 条，新增 ${added.length} 条（${added.join("、") || "无"}）。已接受 ${accepted} 条。`,
      stale.length && `这些块引用的主张变了，已标为 stale：${stale.join("、")}。只复核这些块。`,
      comments.length ? "用户对主张的意见：" : null,
      ...comments,
      note(result.note),
      secrets.length && `疑似密钥尚未处理：${secrets.join("、")}。正文不要抄录原文。`,
      open.length
        ? `还有未决定的主张：${open.join("、")}。处理后再调用 review_claims，不要确认主张门。`
        : `所有主张都有了决定。下一步：${cta} set-gate --article ${q(dir)} --claims`,
    );
  },
};

// ---------------------------------------------------------------------------

const reviewOutline: Handler<typeof reviewOutlineArgs, typeof reviewOutlineResult> = {
  kind: "review_outline",
  description:
    "在对话里嵌入大纲编辑器：用户可改标题、调顺序、增删章节、给章节分配主张，并按章节留意见。用户确认后写入 outline.json，图位以 planned 写入 figures/manifest.json。",
  args: reviewOutlineArgs,
  result: reviewOutlineResult,
  prepare(input) {
    const dir = resolveArticle(input.article);
    const meta = requireArticle(dir);
    const blockStatus: Record<string, string> = {};
    for (const s of loadOutline(dir).sections)
      for (const id of s.blockIds) blockStatus[id] = loadBlock(dir, id).meta?.status ?? "missing";
    const context: OutlineContext = {
      claims: loadClaims(dir).map((c) => ({ id: c.id, text: c.text, status: c.status })),
      existing: loadOutline(dir).sections,
      figures: loadFigures(dir).map((f) => ({ id: f.id, kind: f.kind, caption: f.caption, status: f.status })),
      blockStatus,
      confirmed: !!meta.outlineConfirmed,
    };
    return { title: `大纲：${meta.title}`, article: dir, context };
  },
  submit(input, result) {
    const dir = resolveArticle(input.article);
    const cta = ctaCommand(dir);
    const comments = result.comments.filter((c) => c.text.trim()).map((c) => {
      const title = result.sections.find((s) => s.id === c.sectionId)?.title ?? c.sectionId;
      return `- ${c.sectionId}「${title}」：${c.text.trim()}`;
    });
    const sections = result.sections.map((s) => ({ ...s, blockIds: s.blockIds?.length ? s.blockIds : [] }));
    if (result.decision === "revise")
      return lines(
        "用户要求修改大纲，没有写入 outline.json。",
        "用户调整后的大纲：",
        JSON.stringify(sections.map(({ summary, ...s }) => ({ ...s, summary })), null, 2),
        comments.length ? "按章节的意见：" : null,
        ...comments,
        note(result.note),
        "按意见修改后再次调用 review_outline。",
      );
    writeOutline(dir, sections);
    const referenced = new Set(sections.flatMap((s) => s.figureIds ?? []));
    const figures = (input.figures ?? []).filter((f) => referenced.has(f.id));
    const known = new Set(loadFigures(dir).map((f) => f.id));
    upsertFigures(
      dir,
      figures.map((f) => (known.has(f.id) ? { id: f.id, caption: f.caption, alt: f.alt, blockIds: f.blockIds } : { ...f, status: "planned" })),
    );
    const missingBlocks = sections.filter((s) => !s.blockIds.length).map((s) => s.id);
    return lines(
      `用户确认了大纲，已写入 outline.json（${sections.length} 节）。`,
      ...comments,
      note(result.note),
      missingBlocks.length && `这些章节还没有块 id：${missingBlocks.join("、")}，set-gate 会拒绝。补上 blockIds 后再确认。`,
      `下一步：${cta} set-gate --article ${q(dir)} --outline`,
    );
  },
};

// ---------------------------------------------------------------------------

function describeChanges(result: z.infer<typeof reviewBlockResult>): string[] {
  return result.changes.map((c) => {
    const where = c.context ? `（${c.context}）` : "";
    if (c.kind === "insert") return `- 插入「${c.after}」${where}`;
    if (c.kind === "delete") return `- 删除「${c.before}」${where}`;
    return `- 「${c.before}」改为「${c.after}」${where}`;
  });
}

const reviewBlock: Handler<typeof reviewBlockArgs, typeof reviewBlockResult> = {
  kind: "review_block",
  description:
    "把一个正文块以草稿写入 blocks/<id>.md，并在所见即所得的审阅界面里展示：用户可以像 Word 修订模式那样直接改字（保留修订痕迹）、选中文字加批注，然后点「接受这块 / 按批注修改 / 稍后再说」。起草门禁与 check-draft 相同。用户提交后，最终正文、修订明细和批注会作为一条消息发回对话。",
  args: reviewBlockArgs,
  result: reviewBlockResult,
  prepare(input) {
    const dir = resolveArticle(input.article);
    const meta = requireArticle(dir);
    const gate = checkDraft(dir, input.blockId);
    if (gate) throw new UserFacingError(gate);
    const { previousBody } = writeBlockDraft(dir, input.blockId, input.body, {
      claimIds: input.claimIds,
      figureIds: input.figureIds,
      instruction: input.instruction ? `agent：${input.instruction}` : "agent 改写",
    });
    const block = loadBlock(dir, input.blockId);
    const ids = loadOutline(dir).sections.flatMap((s) => s.blockIds);
    const idx = ids.indexOf(input.blockId);
    const neighbor = (i: number) => {
      if (i < 0 || i >= ids.length) return null;
      const b = loadBlock(dir, ids[i]);
      return b.exists ? { id: b.id, body: b.body } : null;
    };
    const claims = new Map(loadClaims(dir).map((c) => [c.id, c]));
    const profile = pinnedProfile(meta);
    const context: BlockContext = {
      previousBody: previousBody != null && previousBody.trim() !== input.body.trim() ? previousBody : null,
      status: block.meta?.status ?? "draft",
      sectionTitle: sectionOfBlock(dir, input.blockId)?.title ?? null,
      claims: (block.meta?.claimIds ?? []).map((id) => ({
        id,
        text: claims.get(id)?.text ?? "（主张缺失）",
        status: claims.get(id)?.status ?? "missing",
      })),
      prev: neighbor(idx - 1),
      next: neighbor(idx + 1),
      rules: lexiconRules(dir),
      styleRules: (profile?.rules ?? []).filter((r) => r.status === "active").map((r) => ({ id: r.id, text: r.text, strength: r.strength })),
      paragraph: profile?.paragraph ?? null,
      styleRevision: meta.styleRevision ?? null,
    };
    return { title: `${meta.title} · ${context.sectionTitle ?? ""} · ${input.blockId}`, article: dir, context };
  },
  submit(input, result) {
    const dir = resolveArticle(input.article);
    const cta = ctaCommand(dir);
    const current = loadBlock(dir, input.blockId);
    const edited = current.body.trim() !== result.finalBody.trim();
    if (edited && result.decision !== "later") {
      writeBlockDraft(dir, input.blockId, result.finalBody, {
        instruction: result.decision === "accept" ? "用户在审阅界面修改后接受" : "用户在审阅界面修改",
      });
    }
    const changes = describeChanges(result);
    const comments = result.comments.map((c) => `- 「${c.quote}」：${c.text}`);
    if (result.decision === "later")
      return lines(`用户暂时不处理 ${input.blockId}，块保持 draft，界面上的修改没有保存。`, note(result.note), ...comments);
    if (result.decision === "accept")
      return lines(
        `用户接受了 ${input.blockId}${edited ? `，并亲手修改了 ${result.changes.length} 处（已保存到块文件）` : ""}。`,
        ...changes,
        comments.length ? "用户留下的批注（接受时仍附带，供后续参考）：" : null,
        ...comments,
        note(result.note),
        `下一步：${cta} accept-block --article ${q(dir)} --block ${input.blockId}`,
        "然后只把下一块交给用户看。",
      );
    return lines(
      `用户要求按批注修改 ${input.blockId}。${edited ? "用户亲手改的部分已保存到块文件，在此基础上改。" : ""}`,
      changes.length ? "用户的修订：" : null,
      ...changes,
      comments.length ? "批注：" : null,
      ...comments,
      note(result.note),
      "当前正文：",
      result.finalBody.trim(),
      "只改这一块，只用这块 claimIds 里已接受的主张；改完再调用 review_block（instruction 写明改了什么）。",
    );
  },
};

// ---------------------------------------------------------------------------

const reviewFigure: Handler<typeof reviewFigureArgs, typeof reviewFigureResult> = {
  kind: "review_figure",
  description:
    "把 Mermaid（或 SVG）图源写入 figures/ 并在对话里嵌入实时预览，用户可直接改源码、图注和替代文本，然后接受或要求修改。接受后图记录置为 accepted。",
  args: reviewFigureArgs,
  result: reviewFigureResult,
  prepare(input) {
    const dir = resolveArticle(input.article);
    const meta = requireArticle(dir);
    const kind = input.kind ?? "mermaid";
    const existing = loadFigures(dir).find((f) => f.id === input.figureId);
    const rel = existing?.source ?? `figures/${input.figureId}.${kind === "mermaid" ? "mmd" : "svg"}`;
    const previousSource = readFigureSource(dir, rel);
    writeFigureSource(dir, rel, input.source);
    upsertFigures(dir, [
      { id: input.figureId, kind, source: rel, status: "drafted", caption: input.caption ?? existing?.caption, alt: input.alt ?? existing?.alt, blockIds: input.blockIds ?? existing?.blockIds },
    ]);
    const context: FigureContext = {
      previousSource: previousSource != null && previousSource.trim() !== input.source.trim() ? previousSource : null,
      status: "drafted",
      rules: lexiconRules(dir),
    };
    return { title: `图 ${input.figureId}：${meta.title}`, article: dir, context };
  },
  submit(input, result) {
    const dir = resolveArticle(input.article);
    if (result.decision === "later") return lines(`用户暂时不处理图 ${input.figureId}，保持 drafted。`, note(result.note));
    const fig = loadFigures(dir).find((f) => f.id === input.figureId);
    const rel = fig?.source ?? `figures/${input.figureId}.mmd`;
    const sourceChanged = (readFigureSource(dir, rel) ?? "").trim() !== result.source.trim();
    if (sourceChanged) writeFigureSource(dir, rel, result.source);
    upsertFigures(dir, [
      { id: input.figureId, caption: result.caption, alt: result.alt, status: result.decision === "accept" ? "accepted" : "drafted" },
    ]);
    if (result.decision === "accept")
      return lines(
        `用户接受了图 ${input.figureId}，图记录已置为 accepted${sourceChanged ? "，用户改过图源，已保存" : ""}。`,
        `图注：${result.caption || "（空）"}`,
        note(result.note),
      );
    return lines(
      `用户要求修改图 ${input.figureId}${sourceChanged ? "（用户改过的图源已保存，在此基础上改）" : ""}。`,
      note(result.note),
      "当前图源：",
      "```mermaid",
      result.source.trim(),
      "```",
      "改完再调用 review_figure。",
    );
  },
};

// ---------------------------------------------------------------------------

const reviewStyleCandidates: Handler<typeof reviewStyleCandidatesArgs, typeof reviewStyleCandidatesResult> = {
  kind: "review_style_candidates",
  description:
    "一篇文章结束时，把这次措辞修改归纳出的风格候选嵌入对话让用户勾选、改写。只返回用户的选择，不修改声音目录；写入仍由 bump-style 完成。",
  args: reviewStyleCandidatesArgs,
  result: reviewStyleCandidatesResult,
  prepare(input) {
    const dir = input.article ? resolveArticle(input.article) : null;
    const meta = dir ? loadMeta(dir) : null;
    return { title: `风格候选${meta ? `：${meta.title}` : ""}`, article: dir, context: {} };
  },
  submit(input, result) {
    const cta = input.article ? ctaCommand(resolveArticle(input.article)) : "python3 <skill>/scripts/cta.py";
    if (result.decision === "later") return lines("用户暂不处理风格候选，声音目录不变。", note(result.note));
    if (!result.selected.length) return lines("用户没有选择任何候选，声音目录不变。", note(result.note));
    return lines(
      `用户选择写入 ${result.selected.length} 条规则：`,
      ...result.selected.map((s) => `- ${s.text}`),
      result.rejected.length && `未选：${result.rejected.join("、")}`,
      note(result.note),
      "逐条运行（每条都会让风格版本加一，已有文章的 styleRevision 不变）：",
      ...result.selected.map((s) => `${cta} bump-style --rule ${q(s.text)}`),
    );
  },
};

export const HANDLERS: Record<ActionKind, Handler> = {
  ask_questions: askQuestions as unknown as Handler,
  review_writing_plan: reviewWritingPlan as unknown as Handler,
  review_claims: reviewClaims as unknown as Handler,
  review_outline: reviewOutline as unknown as Handler,
  review_block: reviewBlock as unknown as Handler,
  review_figure: reviewFigure as unknown as Handler,
  review_style_candidates: reviewStyleCandidates as unknown as Handler,
};
