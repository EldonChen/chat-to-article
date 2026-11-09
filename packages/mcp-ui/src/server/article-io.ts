import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  appendJsonl,
  compileLexicon,
  findSkillDir,
  formatBlock,
  loadBlock,
  loadClaims,
  loadFigures,
  loadOutline,
  loadSharedLexicon,
  loadVoice,
  readJson,
  readJsonl,
  readText,
  resolveVoiceHome,
  writeJson,
  writeJsonl,
  writeText,
  type ArticleMeta,
  type BlockMeta,
  type Claim,
  type Figure,
  type Profile,
  type Section,
  type WritingPlan,
} from "@liem-opc/chat-to-article-core";
import type { LexiconRuleWire } from "../shared/actions.ts";

export const SOURCE_TAG = "mcp-ui";

export function resolveArticle(path: string): string {
  return resolve(path.startsWith("~/") ? join(process.env.HOME ?? "", path.slice(2)) : path);
}

export function loadMeta(dir: string): ArticleMeta | null {
  return readJson<ArticleMeta>(join(dir, "meta.json"));
}

export function saveMeta(dir: string, patch: Partial<ArticleMeta>): ArticleMeta {
  const existing = loadMeta(dir);
  const voice = loadVoice(resolveVoiceHome());
  const slug = patch.slug ?? existing?.slug ?? basename(dir);
  const next: ArticleMeta = {
    title: patch.title ?? existing?.title ?? slug,
    slug,
    topic: patch.topic ?? existing?.topic ?? "",
    styleRevision: existing?.styleRevision ?? voice.profile?.revision ?? 0,
    locale: existing?.locale ?? voice.profile?.locale ?? "zh-CN",
    phase: patch.phase ?? existing?.phase ?? "planning",
    writingPlanConfirmed: patch.writingPlanConfirmed ?? existing?.writingPlanConfirmed ?? false,
    claimsConfirmed: patch.claimsConfirmed ?? existing?.claimsConfirmed ?? false,
    outlineConfirmed: patch.outlineConfirmed ?? existing?.outlineConfirmed ?? false,
    writeAll: patch.writeAll ?? existing?.writeAll ?? false,
    includeProvenance: patch.includeProvenance ?? existing?.includeProvenance ?? false,
  };
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, "meta.json"), next);
  return next;
}

export function requireArticle(dir: string): ArticleMeta {
  const meta = loadMeta(dir);
  if (meta) return meta;
  if (existsSync(dir)) return saveMeta(dir, {});
  throw new UserFacingError(`${dir} 不是已存在的文章目录。`);
}

export class UserFacingError extends Error {}

/** 只给审阅界面做实时检查用：词表编译后的正则源码。 */
export function lexiconRules(dir: string): LexiconRuleWire[] {
  const skill = findSkillDir(existsSync(dir) ? dir : dirname(dir)).dir;
  const voice = loadVoice(resolveVoiceHome());
  return compileLexicon(loadSharedLexicon(skill), voice.privateLexicon?.entries ?? []).map((rule) => ({
    id: rule.id,
    severity: rule.severity,
    source: rule.pattern.source,
    flags: rule.pattern.flags,
    replacement: rule.replacement,
  }));
}

export function pinnedProfile(meta: ArticleMeta | null): Profile | null {
  const voice = loadVoice(resolveVoiceHome());
  if (!voice.profile) return null;
  if (!meta || voice.profile.revision === meta.styleRevision) return voice.profile;
  return voice.history.find((h) => h.revision === meta.styleRevision)?.profile ?? voice.profile;
}

/** 本篇已记下、仍生效的偏好（preferences.jsonl），不含笔调选择本身。 */
export function articlePreferences(dir: string): { id: string; text: string }[] {
  return readJsonl<{ id: string; text: string; kind?: string; status?: string }>(join(dir, "preferences.jsonl"))
    .filter((p) => p.status === "active" && p.kind !== "voice")
    .map((p) => ({ id: p.id, text: p.text }));
}

export function outlineBlockIds(dir: string): string[] {
  return loadOutline(dir).sections.flatMap((s) => s.blockIds);
}

export function sectionOfBlock(dir: string, blockId: string): Section | null {
  return loadOutline(dir).sections.find((s) => s.blockIds.includes(blockId)) ?? null;
}

/** 轻量校验：若大纲已有章节与块列表，目标块应在大纲中。不再强制前置门禁或首节锁死。 */
export function checkDraft(dir: string, blockId: string): string | null {
  requireArticle(dir);
  const outline = loadOutline(dir);
  const ids = outline.sections.flatMap((s) => s.blockIds);
  if (ids.length > 0 && !ids.includes(blockId)) return `大纲里没有块 ${blockId}。`;
  return null;
}

function revisionRow(blockId: string, instruction: string, before: string, afterStatus: string) {
  return {
    blockId,
    instruction,
    before: before.trim().replace(/\n/g, " ").slice(0, 80),
    afterStatus,
    source: SOURCE_TAG,
  };
}

/** 写入块正文并置为指定状态（默认 draft）；已有正文或状态变更时追加修订记录。 */
export function writeBlockDraft(
  dir: string,
  blockId: string,
  body: string,
  opts: { claimIds?: string[]; figureIds?: string[]; instruction: string; status?: "draft" | "accepted" },
): { previousBody: string | null; changed: boolean } {
  const existing = loadBlock(dir, blockId);
  const section = sectionOfBlock(dir, blockId);
  const targetStatus = opts.status ?? "draft";
  const meta: BlockMeta = {
    id: blockId,
    status: targetStatus,
    claimIds: opts.claimIds ?? existing.meta?.claimIds ?? section?.claimIds ?? [],
    figureIds: opts.figureIds ?? existing.meta?.figureIds ?? [],
  };
  const previousBody = existing.exists ? existing.body : null;
  const sameBody = previousBody != null && previousBody.trim() === body.trim();
  const sameMeta =
    existing.meta?.status === targetStatus &&
    JSON.stringify(existing.meta.claimIds) === JSON.stringify(meta.claimIds) &&
    JSON.stringify(existing.meta.figureIds) === JSON.stringify(meta.figureIds);
  if (sameBody && sameMeta) return { previousBody, changed: false };
  writeText(join(dir, "blocks", `${blockId}.md`), formatBlock(meta, body.trim() + "\n"));
  if ((previousBody != null && !sameBody) || targetStatus === "accepted") {
    appendJsonl(
      join(dir, "revisions.jsonl"),
      revisionRow(blockId, opts.instruction, previousBody ?? body, targetStatus),
    );
  }
  if (targetStatus === "accepted") {
    saveMeta(dir, { phase: "review" });
  }
  return { previousBody, changed: true };
}

/** 记录本篇选定的笔调（写入 writing-plan.json 的 voice 字段及 preferences.jsonl）。 */
export function saveSelectedVoice(dir: string, voiceId: string, label: string, note: string, blockId: string): void {
  const planPath = join(dir, "writing-plan.json");
  const plan = readJson<WritingPlan>(planPath) ?? ({
    status: "confirmed",
    genre: [],
    audience: "",
    purpose: "",
    styleAxes: {},
    approach: "",
    openQuestions: [],
  } as WritingPlan);
  plan.voice = { id: voiceId, name: label, ...(note ? { note } : {}) };
  writeJson(planPath, plan);

  const prefsPath = join(dir, "preferences.jsonl");
  const prefs = readJsonl<{ id: string; text: string; kind?: string; status?: string; [k: string]: unknown }>(prefsPath);
  for (const row of prefs) {
    if (row.kind === "voice" && row.status === "active") row.status = "retired";
  }
  prefs.push({
    id: `p${prefs.length + 1}`,
    text: `笔调用「${label}」（${voiceId}）${note ? `：${note}` : ""}`,
    kind: "voice",
    source: "variant",
    blockId,
    evidence: note,
    status: "active",
    promoted: false,
  });
  writeJsonl(prefsPath, prefs);
}

/** 将用户在 review_style_candidates 中选中的风格规则直接升级写入全局声音目录。 */
export function promoteStyleRules(rules: { id: string; text: string }[]): number {
  const home = resolveVoiceHome();
  const voice = loadVoice(home);
  const current: Profile = voice.profile ?? {
    revision: 0,
    locale: "zh-CN",
    audience: "",
    person: "",
    structure: { headingDepth: 2, listPolicy: "能写成句子就写成句子" },
    terms: [],
    exemplarRefs: [],
    rules: [],
  };
  mkdirSync(join(home, "history"), { recursive: true });
  writeJson(join(home, "history", `r${current.revision}.json`), current);

  const nextRevision = (current.revision ?? 0) + 1;
  const existingRules = [...(current.rules ?? [])];
  for (const item of rules) {
    if (!item.text.trim()) continue;
    existingRules.push({
      id: `r${existingRules.length + 1}`,
      text: item.text.trim(),
      strength: "enforce",
      evidenceArticles: 1,
      status: "active",
    });
  }
  const updated: Profile = {
    ...current,
    revision: nextRevision,
    rules: existingRules,
  };
  writeJson(join(home, "profile.json"), updated);
  writeJson(join(home, "history", `r${nextRevision}.json`), updated);
  return nextRevision;
}

/** 主张文本变化、被拒绝或标成争议时，引用它的块变为 stale。 */
export function invalidateBlocks(dir: string, claimIds: Set<string>): string[] {
  const stale: string[] = [];
  if (!claimIds.size) return stale;
  for (const blockId of outlineBlockIds(dir)) {
    const block = loadBlock(dir, blockId);
    if (!block.exists || !block.meta) continue;
    if (!(block.meta.claimIds ?? []).some((id) => claimIds.has(id))) continue;
    if (block.meta.status === "stale") continue;
    writeText(join(dir, "blocks", `${blockId}.md`), formatBlock({ ...block.meta, status: "stale" }, block.body));
    stale.push(blockId);
  }
  return stale;
}

export function appendCandidateClaims(
  dir: string,
  drafts: {
    id: string;
    text: string;
    status?: string;
    role?: string;
    inquiryTurn?: number;
    gapNote?: string;
    sources?: Claim["sources"];
    secret?: boolean;
  }[],
): string[] {
  const claims = loadClaims(dir);
  const known = new Set(claims.map((c) => c.id));
  const added: string[] = [];
  for (const draft of drafts) {
    if (known.has(draft.id)) continue;
    const row: Claim = { id: draft.id, text: draft.text, status: draft.status ?? "candidate", sources: draft.sources ?? [] };
    if (draft.role) row.role = draft.role;
    if (draft.inquiryTurn != null) row.inquiryTurn = draft.inquiryTurn;
    if (draft.gapNote) row.gapNote = draft.gapNote;
    if (draft.secret) row.secret = true;
    claims.push(row);
    added.push(draft.id);
  }
  if (added.length) writeJsonl(join(dir, "claims.jsonl"), claims);
  return added;
}

export function applyClaimDecisions(
  dir: string,
  decisions: {
    id: string;
    text: string;
    status: string;
    role?: string;
    inquiryTurn?: number;
    gapNote?: string;
    sources?: Claim["sources"];
    secret?: boolean;
    resolved?: boolean;
  }[],
): { updated: string[]; added: string[]; stale: string[] } {
  const claims = loadClaims(dir);
  const byId = new Map(claims.map((c) => [c.id, c]));
  const invalidate = new Set<string>();
  const updated: string[] = [];
  const added: string[] = [];
  for (const d of decisions) {
    const row = byId.get(d.id);
    if (!row) {
      const fresh: Claim = { id: d.id, text: d.text, status: d.status, sources: d.sources ?? [] };
      if (d.role) fresh.role = d.role;
      if (d.inquiryTurn != null) fresh.inquiryTurn = d.inquiryTurn;
      if (d.gapNote) fresh.gapNote = d.gapNote;
      if (d.secret) fresh.secret = true;
      if (d.resolved != null) fresh.resolved = d.resolved;
      claims.push(fresh);
      byId.set(d.id, fresh);
      added.push(d.id);
      continue;
    }
    let changed = false;
    if (d.text !== row.text) {
      row.text = d.text;
      invalidate.add(d.id);
      changed = true;
    }
    if (d.status !== row.status) {
      if (d.status === "rejected" || d.status === "disputed") invalidate.add(d.id);
      row.status = d.status;
      changed = true;
    }
    if (d.role !== undefined && d.role !== row.role) {
      row.role = d.role;
      changed = true;
    }
    if (d.inquiryTurn !== undefined && d.inquiryTurn !== row.inquiryTurn) {
      row.inquiryTurn = d.inquiryTurn;
      changed = true;
    }
    if (d.gapNote !== undefined && d.gapNote !== row.gapNote) {
      row.gapNote = d.gapNote || undefined;
      changed = true;
    }
    if (d.sources && JSON.stringify(d.sources) !== JSON.stringify(row.sources ?? [])) {
      row.sources = d.sources;
      changed = true;
    }
    if (d.secret != null && d.secret !== !!row.secret) {
      row.secret = d.secret;
      changed = true;
    }
    if (d.resolved != null && d.resolved !== row.resolved) {
      row.resolved = d.resolved;
      changed = true;
    }
    if (changed) updated.push(d.id);
  }
  writeJsonl(join(dir, "claims.jsonl"), claims);
  const allDecided = claims.length > 0 && claims.every((c) => c.status !== "candidate" && c.status !== "disputed");
  const hasAccepted = claims.some((c) => c.status === "accepted");
  if (allDecided && hasAccepted) {
    saveMeta(dir, { claimsConfirmed: true, phase: "claims" });
  }
  return { updated, added, stale: invalidateBlocks(dir, invalidate) };
}

export function writeOutline(
  dir: string,
  sections: {
    id: string;
    title: string;
    claimIds: string[];
    figureIds?: string[];
    blockIds?: string[];
    summary?: string;
    readerQuestion?: string;
    cognitiveRole?: string;
  }[],
): void {
  writeJson(join(dir, "outline.json"), {
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      ...(s.readerQuestion?.trim() ? { readerQuestion: s.readerQuestion.trim() } : {}),
      ...(s.cognitiveRole?.trim() ? { cognitiveRole: s.cognitiveRole.trim() } : {}),
      ...(s.summary?.trim() ? { summary: s.summary.trim() } : {}),
      claimIds: s.claimIds,
      figureIds: s.figureIds ?? [],
      blockIds: s.blockIds ?? [],
    })),
  });
  if (sections.length > 0 && sections.every((s) => (s.blockIds?.length ?? 0) > 0)) {
    saveMeta(dir, { outlineConfirmed: true, phase: "outline" });
  }
}

export function upsertFigures(dir: string, figures: Partial<Figure>[]): void {
  const list = loadFigures(dir);
  for (const fig of figures) {
    if (!fig.id) continue;
    const idx = list.findIndex((f) => f.id === fig.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...stripUndefined(fig) } as Figure;
    else
      list.push({
        id: fig.id,
        kind: fig.kind ?? "mermaid",
        status: fig.status ?? "planned",
        caption: fig.caption ?? "",
        alt: fig.alt ?? "",
        source: fig.source ?? `figures/${fig.id}.mmd`,
        prompt: fig.prompt ?? "",
        license: fig.license ?? "",
        blockIds: fig.blockIds ?? [],
      });
  }
  writeJson(join(dir, "figures", "manifest.json"), { figures: list });
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function readFigureSource(dir: string, rel: string): string | null {
  return readText(join(dir, rel));
}

export function writeFigureSource(dir: string, rel: string, text: string): void {
  writeText(join(dir, rel), text.trim() + "\n");
}

export function writePlan(
  dir: string,
  plan: object,
  opts?: { title?: string; slug?: string; topic?: string; confirmed?: boolean },
): void {
  mkdirSync(dir, { recursive: true });
  const status = opts?.confirmed ? "confirmed" : "draft";
  writeJson(join(dir, "writing-plan.json"), { status, ...plan });
  saveMeta(dir, {
    title: opts?.title,
    slug: opts?.slug,
    topic: opts?.topic,
    writingPlanConfirmed: opts?.confirmed ?? true,
    phase: "intake",
  });
}

export function writeMaterials(dir: string, materials: { selected: string[]; fullText: string[] }): void {
  writeJson(join(dir, "materials.json"), materials);
}
