import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
} from "@liem-opc/chat-to-article-core";
import type { LexiconRuleWire } from "../shared/actions.ts";

export const SOURCE_TAG = "mcp-ui";

export function resolveArticle(path: string): string {
  return resolve(path.startsWith("~/") ? join(process.env.HOME ?? "", path.slice(2)) : path);
}

export function loadMeta(dir: string): ArticleMeta | null {
  return readJson<ArticleMeta>(join(dir, "meta.json"));
}

export function requireArticle(dir: string): ArticleMeta {
  const meta = loadMeta(dir);
  if (!meta) throw new UserFacingError(`${dir} 不是文章目录（缺少 meta.json）。先用 cta.py new-article 创建文章。`);
  return meta;
}

export class UserFacingError extends Error {}

export function ctaCommand(dir: string): string {
  const skill = findSkillDir(dir).dir;
  return skill ? `python3 ${join(skill, "scripts", "cta.py")}` : "python3 <skill>/scripts/cta.py";
}

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

/** 本篇已记下、仍生效的偏好（cta.py learn 写入），不含笔调选择本身。 */
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

/** cta_lib.check_draft 的移植：起草前的门禁。 */
export function checkDraft(dir: string, blockId: string): string | null {
  const meta = requireArticle(dir);
  if (!meta.writingPlanConfirmed || !meta.claimsConfirmed || !meta.outlineConfirmed)
    return "写作计划、主张和大纲都确认之后才能起草。";
  const outline = loadOutline(dir);
  const ids = outline.sections.flatMap((s) => s.blockIds);
  if (!ids.includes(blockId)) return `大纲里没有块 ${blockId}。`;
  const first = outline.sections[0];
  if (first.blockIds.includes(blockId) || meta.writeAll) return null;
  for (const id of first.blockIds) {
    const block = loadBlock(dir, id);
    if (!block.exists) return "第一节还没写完，先不要写后面的节。";
    if (block.meta?.status !== "accepted") return "第一节还没接受，先不要写后面的节。";
  }
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

/** 写入块正文并置为 draft；已有正文时追加修订记录（与 rewrite-block 相同）。 */
export function writeBlockDraft(
  dir: string,
  blockId: string,
  body: string,
  opts: { claimIds?: string[]; figureIds?: string[]; instruction: string },
): { previousBody: string | null; changed: boolean } {
  const existing = loadBlock(dir, blockId);
  const section = sectionOfBlock(dir, blockId);
  const meta: BlockMeta = {
    id: blockId,
    status: "draft",
    claimIds: opts.claimIds ?? existing.meta?.claimIds ?? section?.claimIds ?? [],
    figureIds: opts.figureIds ?? existing.meta?.figureIds ?? [],
  };
  const previousBody = existing.exists ? existing.body : null;
  const sameBody = previousBody != null && previousBody.trim() === body.trim();
  const sameMeta =
    existing.meta?.status === "draft" &&
    JSON.stringify(existing.meta.claimIds) === JSON.stringify(meta.claimIds) &&
    JSON.stringify(existing.meta.figureIds) === JSON.stringify(meta.figureIds);
  if (sameBody && sameMeta) return { previousBody, changed: false };
  writeText(join(dir, "blocks", `${blockId}.md`), formatBlock(meta, body.trim() + "\n"));
  if (previousBody != null && !sameBody) {
    appendJsonl(join(dir, "revisions.jsonl"), revisionRow(blockId, opts.instruction, previousBody, "draft"));
  }
  return { previousBody, changed: true };
}

/** 主张文本变化、被拒绝或标成争议时，引用它的块变为 stale（同 cta mark-claim）。 */
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

export function appendCandidateClaims(dir: string, drafts: { id: string; text: string; status?: string; sources?: Claim["sources"]; secret?: boolean }[]): string[] {
  const claims = loadClaims(dir);
  const known = new Set(claims.map((c) => c.id));
  const added: string[] = [];
  for (const draft of drafts) {
    if (known.has(draft.id)) continue;
    const row: Claim = { id: draft.id, text: draft.text, status: draft.status ?? "candidate", sources: draft.sources ?? [] };
    if (draft.secret) row.secret = true;
    claims.push(row);
    added.push(draft.id);
  }
  if (added.length) writeJsonl(join(dir, "claims.jsonl"), claims);
  return added;
}

export function applyClaimDecisions(
  dir: string,
  decisions: { id: string; text: string; status: string; sources?: Claim["sources"]; secret?: boolean; resolved?: boolean }[],
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
  return { updated, added, stale: invalidateBlocks(dir, invalidate) };
}

export function writeOutline(dir: string, sections: { id: string; title: string; claimIds: string[]; figureIds?: string[]; blockIds?: string[] }[]): void {
  writeJson(join(dir, "outline.json"), {
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      claimIds: s.claimIds,
      figureIds: s.figureIds ?? [],
      blockIds: s.blockIds ?? [],
    })),
  });
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

export function writePlan(dir: string, plan: object): void {
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, "writing-plan.json"), { status: "draft", ...plan });
}

export function writeMaterials(dir: string, materials: { selected: string[]; fullText: string[] }): void {
  writeJson(join(dir, "materials.json"), materials);
}
