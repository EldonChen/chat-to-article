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
  reviewVariantsArgs,
  reviewVariantsResult,
  reviewWritingPlanArgs,
  reviewWritingPlanResult,
  type ActionKind,
  type BlockContext,
  type ClaimsContext,
  type FigureContext,
  type OutlineContext,
  type PlanContext,
  type VariantsContext,
} from "../shared/actions.ts";
import {
  appendCandidateClaims,
  applyClaimDecisions,
  articlePreferences,
  checkDraft,
  findStyleAnchorImage,
  invalidateBlocksByFigure,
  lexiconRules,
  loadBlockFigures,
  loadMeta,
  pinnedProfile,
  promoteStyleRules,
  readFigureDataUrl,
  readFigureSource,
  requireArticle,
  resolveArticle,
  saveSelectedVoice,
  sectionOfBlock,
  syncFigureBlockBindings,
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
  /** 工具被调用时执行：写入 agent 的草稿、收集审阅界面需要的上下文。 */
  prepare(input: z.infer<A>): Prepared;
  /** 用户提交时执行：按决定直接落盘，返回给 agent 的说明。 */
  submit(input: z.infer<A>, result: z.infer<R>): string;
}

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
    "把文章级写作计划（写作动机、文体、读者、目的、偏好轴、行文方案、待定问题）嵌入对话让用户修改与确认。用户确认后自动创建文章目录并写入 writing-plan.json 与 meta.json。",
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
            ...(existing.motivation ? { motivation: existing.motivation } : {}),
            ...(existing.visualStyle ? { visualStyle: existing.visualStyle } : {}),
          }
        : null,
      confirmed: !!meta?.writingPlanConfirmed || existing?.status === "confirmed",
    };
    return { title: `写作计划：${input.title ?? meta?.title ?? input.slug ?? dir}`, article: dir, context };
  },
  submit(input, result) {
    const dir = resolveArticle(input.article);
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
    writePlan(dir, result.plan, {
      title: input.title,
      slug: input.slug,
      topic: input.topic,
      confirmed: true,
    });
    return lines(
      `用户确认了写作计划，已自动创建并写入 ${join(dir, "writing-plan.json")}（status: confirmed）与 meta.json。`,
      ...comments,
      note(result.note),
      "可继续起草。默认科普快审到这里就可以写，不要接着把主张、大纲、笔调、逐块、逐图各开一轮。只在用户点了诊断芯片、留下批注，或有未处理的密钥和事实缺口时，再打开对应的审阅。",
    );
  },
};

// ---------------------------------------------------------------------------

const reviewClaims: Handler<typeof reviewClaimsArgs, typeof reviewClaimsResult> = {
  kind: "review_claims",
  description:
    "在对话里嵌入主张清单，让用户按认知角色审阅、接受、拒绝、标记争议或改写，并可新增主张。调用时新 id 以 candidate 写入 claims.jsonl；提交后直接落盘，文本改变或被拒绝的主张会自动将引用它的块标为 stale。",
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
    const plan = readJson<WritingPlan>(join(dir, "writing-plan.json"));
    const context: ClaimsContext = {
      existing: existing.map((c) => ({
        id: c.id,
        text: c.text,
        status: c.status,
        role: c.role,
        inquiryTurn: c.inquiryTurn,
        gapNote: c.gapNote,
        sources: c.sources,
        secret: c.secret,
        resolved: c.resolved,
      })),
      usedBy,
      materials: input.materials ?? readJson(join(dir, "materials.json")),
      motivation: plan?.motivation ?? null,
    };
    return { title: `主张：${meta.title}`, article: dir, context };
  },
  submit(input, result) {
    const dir = resolveArticle(input.article);
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
        ? `还有未决定的主张：${open.join("、")}。可补充查证后再处理。`
        : "所有主张均已决定并记录到 claims.jsonl 与 meta.json。",
    );
  },
};

// ---------------------------------------------------------------------------

const reviewOutline: Handler<typeof reviewOutlineArgs, typeof reviewOutlineResult> = {
  kind: "review_outline",
  description:
    "在对话里嵌入大纲编辑器：用户可改标题、调顺序、增删章节、编辑读者疑问与认知角色、给章节分配主张。用户确认后直接写入 outline.json、figures/manifest.json 与 meta.json。",
  args: reviewOutlineArgs,
  result: reviewOutlineResult,
  prepare(input) {
    const dir = resolveArticle(input.article);
    const meta = requireArticle(dir);
    const blockStatus: Record<string, string> = {};
    for (const s of loadOutline(dir).sections)
      for (const id of s.blockIds) blockStatus[id] = loadBlock(dir, id).meta?.status ?? "missing";
    const plan = readJson<WritingPlan>(join(dir, "writing-plan.json"));
    const context: OutlineContext = {
      claims: loadClaims(dir).map((c) => ({ id: c.id, text: c.text, status: c.status, role: c.role, inquiryTurn: c.inquiryTurn, gapNote: c.gapNote })),
      existing: loadOutline(dir).sections,
      figures: loadFigures(dir).map((f) => ({
        id: f.id,
        kind: f.kind,
        role: f.role,
        intent: f.intent,
        takeaway: f.takeaway,
        anchorSummary: f.anchorSummary,
        caption: f.caption,
        alt: f.alt,
        source: f.source,
        prompt: f.prompt,
        aspectRatio: f.aspectRatio,
        referenceImages: f.referenceImages,
        confirmed: f.confirmed,
        blockIds: f.blockIds,
        status: f.status,
      })),
      blockStatus,
      confirmed: !!meta.outlineConfirmed,
      motivation: plan?.motivation ?? null,
      visualStyle: plan?.visualStyle ?? null,
    };
    return { title: `大纲：${meta.title}`, article: dir, context };
  },
  submit(input, result) {
    const dir = resolveArticle(input.article);
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
        result.figures?.length ? "用户调整后的配图规划：" : null,
        result.figures?.length ? JSON.stringify(result.figures, null, 2) : null,
        comments.length ? "按章节的意见：" : null,
        ...comments,
        note(result.note),
        "按意见修改后再次调用 review_outline。",
      );
    writeOutline(dir, sections);
    const referenced = new Set(sections.flatMap((s) => s.figureIds ?? []));
    const candidateFigs = result.figures ?? input.figures ?? [];
    const figures = candidateFigs.filter((f) => referenced.has(f.id) || (f.blockIds?.length ?? 0) > 0);
    const known = new Map(loadFigures(dir).map((f) => [f.id, f]));
    upsertFigures(
      dir,
      figures.map((f) => {
        const ex = known.get(f.id);
        const kind = f.kind ?? ex?.kind ?? "mermaid";
        return ex
          ? {
              id: f.id,
              kind,
              role: f.role ?? ex.role,
              intent: f.intent ?? ex.intent,
              takeaway: f.takeaway ?? ex.takeaway,
              anchorSummary: f.anchorSummary ?? ex.anchorSummary,
              caption: f.caption ?? ex.caption,
              alt: f.alt ?? ex.alt,
              prompt: f.prompt ?? ex.prompt,
              aspectRatio: f.aspectRatio ?? ex.aspectRatio,
              referenceImages: f.referenceImages ?? ex.referenceImages,
              confirmed: kind === "raster" ? true : (f.confirmed ?? ex.confirmed),
              blockIds: f.blockIds ?? ex.blockIds,
            }
          : { ...f, kind, confirmed: kind === "raster" ? true : f.confirmed, status: "planned" };
      }),
    );
    for (const f of figures) {
      if (f.blockIds?.length) syncFigureBlockBindings(dir, f.id, f.blockIds);
    }
    const missingBlocks = sections.filter((s) => !s.blockIds.length).map((s) => s.id);
    const plannedRasters = figures.filter((f) => f.kind === "raster");
    return lines(
      `用户确认了大纲，已写入 outline.json（${sections.length} 节）${figures.length ? `与 figures/manifest.json（${figures.length} 张配图规划）` : ""}并更新 meta.json。`,
      plannedRasters.length
        ? `已授权的多模态生图（confirmed: true）：${plannedRasters.map((r) => `${r.id}（${r.role ?? "illustration"}${r.prompt ? `，prompt: "${r.prompt}"` : ""}）`).join("；")}。起草对应章节时可直接调用 GenerateImage 生成图片并用 Read 读图自检，使正文细节与画面咬合。`
        : null,
      ...comments,
      note(result.note),
      missingBlocks.length && `注意：这些章节还没有分配块 id：${missingBlocks.join("、")}。`,
    );
  },
};

// ---------------------------------------------------------------------------

const LEARN_HINT =
  "如果用户的修订、批注或评价里有能推广到后续块的写法偏好（用词、句式、语气、节奏、人称、段落处理），请将其归纳成 0–3 条具体规则追加写入 preferences.jsonl，并用一句话告诉用户；只针对当前这一处的事实修改不记偏好。";

const reviewVariants: Handler<typeof reviewVariantsArgs, typeof reviewVariantsResult> = {
  kind: "review_variants",
  description:
    "把同一块的 2–4 版（同样的主张、不同笔调）并排嵌入对话，让用户挑一版，并对各版写喜欢或不喜欢的地方。调用时不写文件；用户选定后，选中的正文自动以 draft 写入 blocks/<id>.md，且选定的笔调自动记录到 writing-plan.json。",
  args: reviewVariantsArgs,
  result: reviewVariantsResult,
  prepare(input) {
    const dir = resolveArticle(input.article);
    const meta = requireArticle(dir);
    const gate = checkDraft(dir, input.blockId);
    if (gate) throw new UserFacingError(gate);
    const ids = new Set(input.variants.map((v) => v.id));
    if (ids.size !== input.variants.length) throw new UserFacingError("版本 id 不能重复。");
    const section = sectionOfBlock(dir, input.blockId);
    const claims = new Map(loadClaims(dir).map((c) => [c.id, c]));
    const outlineIds = loadOutline(dir).sections.flatMap((s) => s.blockIds);
    const prevId = outlineIds[outlineIds.indexOf(input.blockId) - 1];
    const prev = prevId ? loadBlock(dir, prevId) : null;
    const plan = readJson<WritingPlan>(join(dir, "writing-plan.json"));
    const context: VariantsContext = {
      sectionTitle: section?.title ?? null,
      readerQuestion: section?.readerQuestion ?? null,
      claims: (input.claimIds ?? section?.claimIds ?? []).map((id) => ({
        id,
        text: claims.get(id)?.text ?? "（主张缺失）",
        status: claims.get(id)?.status ?? "missing",
        role: claims.get(id)?.role,
      })),
      prev: prev?.exists ? { id: prev.id, body: prev.body } : null,
      preferences: articlePreferences(dir),
      motivation: plan?.motivation ?? null,
    };
    return { title: `选笔调：${meta.title} · ${context.sectionTitle ?? ""} · ${input.blockId}`, article: dir, context };
  },
  submit(input, result) {
    const dir = resolveArticle(input.article);
    const label = (id: string) => {
      const v = input.variants.find((x) => x.id === id);
      return v ? `${v.id}「${v.label}」` : id;
    };
    const feedback = result.feedback.filter((f) => f.text.trim()).map((f) => `- ${label(f.variantId)}：${f.text.trim()}`);
    if (result.decision === "later") return lines(`用户暂时不选 ${input.blockId} 的版本，没有写入任何文件。`, note(result.note), ...feedback);
    if (result.decision === "regenerate")
      return lines(
        `用户对 ${input.blockId} 的几版都不满意，没有写入任何文件。`,
        feedback.length ? "用户对各版的评价：" : null,
        ...feedback,
        note(result.note),
        LEARN_HINT,
        "按评价换一组版本，再调用 review_variants。",
      );
    const chosen = input.variants.find((v) => v.id === result.chosenId);
    if (!chosen) throw new UserFacingError("选定时必须给出 chosenId。");
    writeBlockDraft(dir, input.blockId, chosen.body, {
      claimIds: input.claimIds,
      figureIds: input.figureIds,
      instruction: `用户从多版中选了 ${chosen.label}`,
    });
    const chosenFeedback = result.feedback.find((f) => f.variantId === chosen.id)?.text.trim();
    const voiceNote = [chosen.voice === "custom" ? chosen.summary ?? chosen.label : null, chosenFeedback, result.note?.trim()].filter(Boolean).join("；");
    saveSelectedVoice(dir, chosen.voice, chosen.label, voiceNote, input.blockId);
    return lines(
      `用户选了 ${label(chosen.id)}（笔调 ${chosen.voice}），正文已以 draft 写入 blocks/${input.blockId}.md，本篇笔调已记录到 writing-plan.json。`,
      feedback.length ? "用户对各版的评价（没选中的版本也说明了偏好）：" : null,
      ...feedback,
      note(result.note),
      LEARN_HINT,
      "接下来只在用户要求精修时调用 review_block。默认不要为了过关再逐块打开。",
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
    "把一个正文块以草稿写入 blocks/<id>.md，并在所见即所得的审阅界面里展示：用户可以像 Word 修订模式那样直接改字（保留修订痕迹）、选中文字加批注，然后点「接受这块 / 按批注修改 / 稍后再说」。用户点接受时直接把块标记为 accepted 并落盘。",
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
    const plan = readJson<WritingPlan>(join(dir, "writing-plan.json"));
    const section = sectionOfBlock(dir, input.blockId);
    const { figures, availableFigures } = loadBlockFigures(dir, input.blockId);
    const context: BlockContext = {
      previousBody: previousBody != null && previousBody.trim() !== input.body.trim() ? previousBody : null,
      status: block.meta?.status ?? "draft",
      sectionTitle: section?.title ?? null,
      readerQuestion: section?.readerQuestion ?? null,
      cognitiveRole: section?.cognitiveRole ?? null,
      claims: (block.meta?.claimIds ?? []).map((id) => ({
        id,
        text: claims.get(id)?.text ?? "（主张缺失）",
        status: claims.get(id)?.status ?? "missing",
        role: claims.get(id)?.role,
        gapNote: claims.get(id)?.gapNote,
      })),
      figures,
      availableFigures,
      visualStyle: plan?.visualStyle ?? null,
      prev: neighbor(idx - 1),
      next: neighbor(idx + 1),
      rules: lexiconRules(dir),
      styleRules: [
        ...articlePreferences(dir).map((p) => ({ id: p.id, text: p.text, strength: "本篇" })),
        ...(profile?.rules ?? []).filter((r) => r.status === "active").map((r) => ({ id: r.id, text: r.text, strength: r.strength })),
      ],
      paragraph: null,
      styleRevision: meta.styleRevision ?? null,
      motivation: plan?.motivation ?? null,
    };
    return { title: `${meta.title} · ${context.sectionTitle ?? ""} · ${input.blockId}`, article: dir, context };
  },
  submit(input, result) {
    const dir = resolveArticle(input.article);
    const current = loadBlock(dir, input.blockId);
    const edited = current.body.trim() !== result.finalBody.trim();
    const changes = describeChanges(result);
    const comments = result.comments.map((c) => `- 「${c.quote}」：${c.text}`);
    if (result.decision === "later")
      return lines(`用户暂时不处理 ${input.blockId}，块保持 draft，界面上的修改没有保存。`, note(result.note), ...comments);

    const reqs = result.figureRequests ?? [];
    const nextFigureIds = new Set<string>(result.figureIds ?? current.meta?.figureIds ?? []);
    if (reqs.length > 0) {
      const existingMap = new Map(loadFigures(dir).map((f) => [f.id, f]));
      upsertFigures(
        dir,
        reqs.map((r) => {
          nextFigureIds.add(r.id);
          const ex = existingMap.get(r.id);
          const kind: string = r.kind ?? ex?.kind ?? "mermaid";
          const blockIds = Array.from(new Set([...(ex?.blockIds ?? []), input.blockId]));
          return {
            id: r.id,
            kind,
            status: ex?.status ?? "planned",
            role: r.role ?? ex?.role ?? "mechanism",
            intent: r.intent,
            takeaway: r.takeaway ?? ex?.takeaway,
            anchorSummary: r.anchorSummary ?? ex?.anchorSummary,
            prompt: r.prompt ?? ex?.prompt ?? (kind === "raster" ? r.intent : ""),
            aspectRatio: r.aspectRatio ?? ex?.aspectRatio ?? (kind === "raster" ? "16:9" : undefined),
            confirmed: kind === "raster" ? true : ex?.confirmed,
            caption: r.caption ?? ex?.caption ?? "",
            blockIds,
          };
        }),
      );
      const outline = loadOutline(dir);
      const sec = outline.sections.find((s) => s.blockIds.includes(input.blockId));
      if (sec) {
        const secFigs = new Set(sec.figureIds ?? []);
        for (const r of reqs) secFigs.add(r.id);
        sec.figureIds = Array.from(secFigs);
        writeOutline(dir, outline.sections);
      }
    }
    const finalFigureIds = result.figureIds !== undefined || reqs.length > 0 ? Array.from(nextFigureIds) : undefined;
    const figLines = reqs.map(
      (r) =>
        `- 图 ${r.id}（${r.role ?? "mechanism"} / ${r.kind ?? "mermaid"}）：意图「${r.intent}」${r.takeaway ? `，一秒结论「${r.takeaway}」` : ""}${r.prompt ? `，生图 Prompt「${r.prompt}」` : ""}`,
    );

    if (result.decision === "accept") {
      writeBlockDraft(dir, input.blockId, result.finalBody, {
        status: "accepted",
        figureIds: finalFigureIds,
        instruction: edited ? "用户在审阅界面修改后接受" : "用户接受这块",
      });
      return lines(
        `用户接受了 ${input.blockId}${edited ? `，并亲手修改了 ${result.changes.length} 处` : ""}。blocks/${input.blockId}.md 已保存并置为 accepted。`,
        ...changes,
        figLines.length ? "用户在本块新增/更新了配图需求（已写入 figures/manifest.json 并绑定到本块，raster 图已标记 confirmed: true）：" : null,
        ...figLines,
        figLines.length
          ? "若为 raster 图，请结合本篇 visualStyle（及首张已确认图的 reference_image_paths）调用 GenerateImage 生成图片并复制到 figures/，用 Read 读图自检后再调用 review_figure；若为 mermaid/svg-chart，请直接调用 review_figure。"
          : null,
        comments.length ? "用户留下的批注（供后续参考）：" : null,
        ...comments,
        note(result.note),
        (changes.length || comments.length || result.note?.trim()) && LEARN_HINT,
        "可继续处理下一块。",
      );
    }
    if (edited || finalFigureIds !== undefined) {
      writeBlockDraft(dir, input.blockId, result.finalBody, {
        status: "draft",
        figureIds: finalFigureIds,
        instruction: "用户在审阅界面修改",
      });
    }
    return lines(
      `用户要求按批注修改 ${input.blockId}。${edited ? "用户亲手改的部分已保存到块文件，在此基础上改。" : ""}`,
      changes.length ? "用户的修订：" : null,
      ...changes,
      figLines.length ? "用户在本块提出的配图需求（已写入 figures/manifest.json 并绑定到本块，raster 图已标记 confirmed: true）：" : null,
      ...figLines,
      figLines.length
        ? "请先生成配图（raster 图调用 GenerateImage + Read 视觉自检，mermaid/svg-chart 调用 review_figure），再按「看图写文、以图减文」原则删减本块中被图替代的冗余过程描述，让文字与画面细节严丝合缝。"
        : null,
      comments.length ? "批注：" : null,
      ...comments,
      note(result.note),
      LEARN_HINT,
      "当前正文：",
      result.finalBody.trim(),
      "只改这一块，只用这块 claimIds 里已接受的主张；改的时候也照刚记下的偏好调整整块，不只改批注指到的字。改完再调用 review_block（instruction 写明改了什么）。",
    );
  },
};

// ---------------------------------------------------------------------------

const reviewFigure: Handler<typeof reviewFigureArgs, typeof reviewFigureResult> = {
  kind: "review_figure",
  description:
    "把 Mermaid、SVG 或多模态生图（raster）写入 figures/ 并在对话里嵌入实时预览；界面同时展示视觉设计简报（角色、配图意图、一秒结论、图文契约）、生图 Prompt/画幅/垫图参考以及关联正文块原文。用户可改图源或 Prompt、勾选将关联正文块标为 stale 以触发图文同步修订。接受后图记录置为 accepted。",
  args: reviewFigureArgs,
  result: reviewFigureResult,
  prepare(input) {
    const dir = resolveArticle(input.article);
    const meta = requireArticle(dir);
    const existing = loadFigures(dir).find((f) => f.id === input.figureId);
    const kind: string = input.kind ?? existing?.kind ?? "mermaid";
    const isTextSource = kind === "mermaid" || kind === "svg-chart";
    const ext = kind === "svg-chart" ? "svg" : kind === "drawio" ? "drawio" : kind === "raster" || kind === "remote" ? "png" : "mmd";
    const looksLikePath = /^(figures\/|.*\.(png|jpe?g|webp|gif|svg|drawio|mmd)$)/i.test(input.source.trim());
    const rel = !isTextSource && looksLikePath ? input.source.trim() : (existing?.source ?? `figures/${input.figureId}.${ext}`);
    const previousSource = isTextSource ? readFigureSource(dir, rel) : (existing?.prompt ?? null);
    if (isTextSource) {
      writeFigureSource(dir, rel, input.source);
    }
    const resolvedPrompt =
      input.prompt ?? (kind === "raster" && !looksLikePath ? input.source.trim() : existing?.prompt ?? "");
    const blockIds = input.blockIds ?? existing?.blockIds ?? [];
    const styleAnchorImage = findStyleAnchorImage(dir, input.figureId);
    const defaultRefs =
      input.referenceImages ?? existing?.referenceImages ?? (kind === "raster" && styleAnchorImage ? [styleAnchorImage] : undefined);
    upsertFigures(dir, [
      {
        id: input.figureId,
        kind,
        source: rel,
        status: "drafted",
        role: input.role ?? existing?.role,
        intent: input.intent ?? existing?.intent,
        takeaway: input.takeaway ?? existing?.takeaway,
        anchorSummary: input.anchorSummary ?? existing?.anchorSummary,
        prompt: resolvedPrompt,
        aspectRatio: input.aspectRatio ?? existing?.aspectRatio ?? (kind === "raster" ? "16:9" : undefined),
        referenceImages: defaultRefs,
        confirmed: kind === "raster" ? true : existing?.confirmed,
        caption: input.caption ?? existing?.caption,
        alt: input.alt ?? existing?.alt,
        blockIds,
      },
    ]);
    if (input.blockIds) {
      syncFigureBlockBindings(dir, input.figureId, input.blockIds);
    }
    const updatedFig = loadFigures(dir).find((f) => f.id === input.figureId);
    const outline = loadOutline(dir);
    const allBlocks: NonNullable<FigureContext["allBlocks"]> = [];
    const linkedBlocks: NonNullable<FigureContext["linkedBlocks"]> = [];
    const linkedSet = new Set(updatedFig?.blockIds ?? []);
    for (const sec of outline.sections) {
      for (const bId of sec.blockIds) {
        const b = loadBlock(dir, bId, sec.id);
        const status = b.exists ? (b.meta?.status ?? "draft") : "missing";
        allBlocks.push({ id: bId, sectionTitle: sec.title, status });
        if (linkedSet.has(bId) || (b.meta?.figureIds ?? []).includes(input.figureId)) {
          linkedBlocks.push({ id: bId, status, sectionTitle: sec.title, body: b.body });
        }
      }
    }
    const plan = readJson<WritingPlan>(join(dir, "writing-plan.json"));
    const imageDataUrl = !isTextSource && updatedFig ? readFigureDataUrl(dir, updatedFig) : null;
    const context: FigureContext = {
      previousSource:
        previousSource != null && previousSource.trim() !== (isTextSource ? input.source.trim() : resolvedPrompt.trim())
          ? previousSource
          : null,
      status: "drafted",
      rules: lexiconRules(dir),
      imageDataUrl,
      visualStyle: plan?.visualStyle ?? null,
      styleAnchorImage,
      figure: updatedFig
        ? {
            id: updatedFig.id,
            kind: updatedFig.kind,
            role: updatedFig.role,
            intent: updatedFig.intent,
            takeaway: updatedFig.takeaway,
            anchorSummary: updatedFig.anchorSummary,
            caption: updatedFig.caption,
            alt: updatedFig.alt,
            source: updatedFig.source,
            prompt: updatedFig.prompt,
            aspectRatio: updatedFig.aspectRatio,
            referenceImages: updatedFig.referenceImages,
            confirmed: updatedFig.confirmed,
            blockIds: linkedBlocks.map((b) => b.id),
          }
        : undefined,
      linkedBlocks,
      allBlocks,
    };
    return { title: `图 ${input.figureId}：${meta.title}`, article: dir, context };
  },
  submit(input, result) {
    const dir = resolveArticle(input.article);
    if (result.decision === "later") return lines(`用户暂时不处理图 ${input.figureId}，保持 drafted。`, note(result.note));
    const fig = loadFigures(dir).find((f) => f.id === input.figureId);
    const kind = fig?.kind ?? input.kind ?? "mermaid";
    const isTextSource = kind === "mermaid" || kind === "svg-chart";
    const rel = fig?.source ?? `figures/${input.figureId}.${kind === "svg-chart" ? "svg" : kind === "raster" ? "png" : "mmd"}`;
    const sourceChanged = isTextSource
      ? (readFigureSource(dir, rel) ?? "").trim() !== result.source.trim()
      : (fig?.prompt ?? "").trim() !== (result.prompt ?? "").trim();
    if (isTextSource && sourceChanged) writeFigureSource(dir, rel, result.source);
    const targetBlockIds = result.blockIds ?? fig?.blockIds;
    const nextPrompt = result.prompt !== undefined ? result.prompt.trim() : fig?.prompt;
    const nextAspectRatio = result.aspectRatio !== undefined ? result.aspectRatio.trim() || undefined : fig?.aspectRatio;
    const nextRefs = result.referenceImages !== undefined ? result.referenceImages.filter((r) => r.trim()) : fig?.referenceImages;
    upsertFigures(dir, [
      {
        id: input.figureId,
        caption: result.caption,
        alt: result.alt,
        ...(result.role !== undefined ? { role: result.role.trim() || undefined } : {}),
        ...(result.intent !== undefined ? { intent: result.intent.trim() || undefined } : {}),
        ...(result.takeaway !== undefined ? { takeaway: result.takeaway.trim() || undefined } : {}),
        ...(result.anchorSummary !== undefined ? { anchorSummary: result.anchorSummary.trim() || undefined } : {}),
        ...(nextPrompt !== undefined ? { prompt: nextPrompt } : {}),
        ...(nextAspectRatio !== undefined ? { aspectRatio: nextAspectRatio } : {}),
        ...(nextRefs !== undefined ? { referenceImages: nextRefs } : {}),
        ...(kind === "raster" ? { confirmed: true } : {}),
        ...(targetBlockIds !== undefined ? { blockIds: targetBlockIds } : {}),
        status: result.decision === "accept" ? "accepted" : "drafted",
      },
    ]);
    if (result.blockIds !== undefined) {
      syncFigureBlockBindings(dir, input.figureId, result.blockIds);
    }
    const shouldInvalidate = !!result.markBlocksStale || !!result.textSyncNote?.trim();
    const staleBlocks = shouldInvalidate ? invalidateBlocksByFigure(dir, input.figureId, targetBlockIds) : [];
    const syncLines = [
      result.textSyncNote?.trim() ? `用户的图文联动修改意见：${result.textSyncNote.trim()}` : null,
      staleBlocks.length
        ? `因图片迭代需要同步调整正文，关联块已自动标为 stale：${staleBlocks.join("、")}。请结合最新图与图文联动契约，调用 review_block 动态调整这些块的正文（删除已被图直观表达的冗余过程描述、对齐图中视觉元素与节点术语）。`
        : null,
    ];
    if (result.decision === "accept")
      return lines(
        `用户接受了图 ${input.figureId}，图记录已置为 accepted${sourceChanged ? "，用户改过图源/Prompt，已保存" : ""}。`,
        `图注：${result.caption || "（空）"}`,
        result.takeaway?.trim() ? `一秒结论：${result.takeaway.trim()}` : null,
        result.anchorSummary?.trim() ? `图文联动契约：${result.anchorSummary.trim()}` : null,
        ...syncLines,
        note(result.note),
      );
    if (kind === "raster") {
      const currentImgFull = join(dir, rel);
      const refHint = nextRefs?.length
        ? `reference_image_paths: ${JSON.stringify(nextRefs)}`
        : existsSync(currentImgFull)
          ? `若需保持当前构图局部微调，可将当前图片 ${currentImgFull} 传入 reference_image_paths`
          : null;
      return lines(
        `用户要求重新生成或微调多模态图片 ${input.figureId}（已授权 confirmed: true）。`,
        result.intent?.trim() ? `配图意图：${result.intent.trim()}` : null,
        result.takeaway?.trim() ? `一秒结论：${result.takeaway.trim()}` : null,
        nextPrompt ? `生图 Prompt：${nextPrompt}` : null,
        nextAspectRatio ? `画幅比例（aspect_ratio）：${nextAspectRatio}` : null,
        refHint,
        ...syncLines,
        note(result.note),
        `请调用 GenerateImage 生成图片并保存到 ${join(dir, rel)}，用 Read 工具亲眼检查画面细节后，再次调用 review_figure。`,
      );
    }
    return lines(
      `用户要求修改图 ${input.figureId}${sourceChanged ? "（用户改过的图源已保存，在此基础上改）" : ""}。`,
      result.intent?.trim() ? `配图意图：${result.intent.trim()}` : null,
      result.takeaway?.trim() ? `一秒结论：${result.takeaway.trim()}` : null,
      result.anchorSummary?.trim() ? `图文联动契约：${result.anchorSummary.trim()}` : null,
      ...syncLines,
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
    "把措辞修改或旧文归纳出的风格候选嵌入对话让用户勾选、改写。用户提交后，选中的规则会自动升级写入个人声音目录（profile.json 与 history/），已有文章钉住的 styleRevision 不变。",
  args: reviewStyleCandidatesArgs,
  result: reviewStyleCandidatesResult,
  prepare(input) {
    const dir = input.article ? resolveArticle(input.article) : null;
    const meta = dir ? loadMeta(dir) : null;
    return { title: `风格候选${meta ? `：${meta.title}` : ""}`, article: dir, context: {} };
  },
  submit(_input, result) {
    if (result.decision === "later") return lines("用户暂不处理风格候选，声音目录不变。", note(result.note));
    if (!result.selected.length) return lines("用户没有选择任何候选，声音目录不变。", note(result.note));
    const nextRevision = promoteStyleRules(result.selected);
    return lines(
      `已将用户选择的 ${result.selected.length} 条规则写入个人声音目录（风格档案升级至 r${nextRevision}，已有文章的 styleRevision 保持不变）：`,
      ...result.selected.map((s) => `- ${s.text}`),
      result.rejected.length && `未选：${result.rejected.join("、")}`,
      note(result.note),
    );
  },
};

export const HANDLERS: Record<ActionKind, Handler> = {
  ask_questions: askQuestions as unknown as Handler,
  review_writing_plan: reviewWritingPlan as unknown as Handler,
  review_claims: reviewClaims as unknown as Handler,
  review_outline: reviewOutline as unknown as Handler,
  review_variants: reviewVariants as unknown as Handler,
  review_block: reviewBlock as unknown as Handler,
  review_figure: reviewFigure as unknown as Handler,
  review_style_candidates: reviewStyleCandidates as unknown as Handler,
};
