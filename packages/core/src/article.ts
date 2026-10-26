import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseBlock } from "./block.ts";
import { readJson, readJsonl, readText } from "./fsutil.ts";
import { lintBody, type CompiledRule } from "./lexicon.ts";
import type {
  ArticleMeta,
  ArticleSnapshot,
  ArticleSummary,
  Block,
  Claim,
  Figure,
  LintFinding,
  Materials,
  Outline,
  RevisionRow,
  WritingPlan,
} from "./types.ts";

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "export", "blocks", "figures", "history", "exemplars"]);

export function isArticleDir(dir: string): boolean {
  if (!existsSync(join(dir, "meta.json"))) return false;
  const meta = readJson<Partial<ArticleMeta>>(join(dir, "meta.json"));
  return !!meta && typeof meta.slug === "string" && "styleRevision" in meta;
}

/** 在 root 下递归查找文章目录（含 meta.json 且有 slug 与 styleRevision）。 */
export function findArticleDirs(root: string, maxDepth = 6): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (isArticleDir(dir)) {
      out.push(dir);
      return;
    }
    if (depth >= maxDepth) return;
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names.sort()) {
      if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      try {
        if (statSync(full).isDirectory()) walk(full, depth + 1);
      } catch {
        // skip unreadable
      }
    }
  };
  walk(resolve(root), 0);
  return out;
}

export function loadOutline(dir: string): Outline {
  const outline = readJson<Outline>(join(dir, "outline.json"));
  const sections = (outline?.sections ?? []).map((section) => ({
    ...section,
    claimIds: section.claimIds ?? [],
    figureIds: section.figureIds ?? [],
    blockIds: section.blockIds ?? [],
  }));
  return { sections };
}

export function loadClaims(dir: string): Claim[] {
  return readJsonl<Claim>(join(dir, "claims.jsonl"));
}

export function loadFigures(dir: string): Figure[] {
  return readJson<{ figures: Figure[] }>(join(dir, "figures", "manifest.json"))?.figures ?? [];
}

export function loadBlock(dir: string, blockId: string, sectionId: string | null = null): Block {
  const text = readText(join(dir, "blocks", `${blockId}.md`));
  if (text == null) return { id: blockId, exists: false, meta: null, body: "", sectionId };
  try {
    const { meta, body } = parseBlock(text);
    return { id: blockId, exists: true, meta, body, sectionId };
  } catch {
    return { id: blockId, exists: true, meta: null, body: text, sectionId };
  }
}

function outlineBlocks(dir: string, outline: Outline): Block[] {
  return outline.sections.flatMap((section) => section.blockIds.map((id) => loadBlock(dir, id, section.id)));
}

function latestMtime(dir: string): Date {
  let latest = 0;
  const visit = (path: string, depth: number) => {
    try {
      const st = statSync(path);
      if (st.isDirectory()) {
        if (depth > 2) return;
        for (const name of readdirSync(path)) visit(join(path, name), depth + 1);
      } else if (st.mtimeMs > latest) {
        latest = st.mtimeMs;
      }
    } catch {
      // ignore
    }
  };
  visit(dir, 0);
  return new Date(latest || Date.now());
}

function figureErrors(dir: string, fig: Figure): string[] {
  const errors: string[] = [];
  const source = join(dir, fig.source ?? "");
  const has = (p: string) => existsSync(p) && statSync(p).isFile();
  if (fig.status !== "accepted") return [`图 ${fig.id} 还没接受。`];
  switch (fig.kind) {
    case "raster":
      if (!fig.confirmed) errors.push(`图 ${fig.id} 没有作者的生图确认。`);
      if (!fig.prompt) errors.push(`图 ${fig.id} 缺少提示词。`);
      if (!has(source)) errors.push(`图 ${fig.id} 的文件不在。`);
      break;
    case "remote":
      if (!(fig.license ?? "").trim()) errors.push(`图 ${fig.id} 缺少出处或许可。`);
      if (!has(source)) errors.push(`图 ${fig.id} 的本地副本不在。`);
      break;
    case "drawio":
      if (!has(source) || !has(source.replace(/\.[^./]+$/, ".svg")))
        errors.push(`图 ${fig.id} 还没有 draw.io 源文件和导出的 SVG。`);
      break;
    case "mermaid":
    case "svg-chart":
      if (!has(source)) errors.push(`图 ${fig.id} 的源文件不在。`);
      break;
    default:
      errors.push(`图 ${fig.id} 的类型无法导出。`);
  }
  return errors;
}

/** cta_lib.export_errors 的只读移植，用于在界面上解释分享包为什么能或不能生成。 */
export function exportErrors(
  dir: string,
  meta: ArticleMeta,
  claims: Claim[],
  outline: Outline,
  blocks: Block[],
  figures: Figure[],
  lint: LintFinding[],
  materials: Materials | null,
): string[] {
  const errors: string[] = [];
  if (!meta.writingPlanConfirmed) errors.push("写作计划还没确认。");
  if (!meta.claimsConfirmed || !meta.outlineConfirmed) errors.push("主张或大纲还没确认。");
  const claimMap = new Map(claims.map((c) => [c.id, c]));
  for (const claim of claims) {
    if (claim.secret && !claim.resolved) errors.push(`主张 ${claim.id} 标了密钥，作者还没处理。`);
  }
  if (materials) {
    const selected = new Set(materials.selected ?? []);
    const fullText = materials.fullText ? new Set(materials.fullText) : null;
    for (const claim of claims) {
      for (const source of claim.sources ?? []) {
        if (source.kind !== "conversation") continue;
        if (!selected.has(source.id ?? "")) errors.push(`主张 ${claim.id} 使用了未勾选的会话 ${source.id}`);
        else if (fullText && !fullText.has(source.id ?? ""))
          errors.push(`主张 ${claim.id} 使用了只有摘要的会话 ${source.id}`);
      }
    }
  } else {
    errors.push("缺少 materials.json，无法核对会话是否勾选。");
  }
  const seenFigures = new Set<string>();
  for (const block of blocks) {
    if (!block.exists || !block.meta) {
      errors.push(`块 ${block.id} 还没有正文。`);
      continue;
    }
    if (block.meta.status !== "accepted") errors.push(`块 ${block.id} 状态是 ${block.meta.status}，不能进入分享包。`);
    for (const claimId of block.meta.claimIds ?? []) {
      if (claimMap.get(claimId)?.status !== "accepted") errors.push(`块 ${block.id} 使用了未接受的主张 ${claimId}。`);
    }
    for (const figureId of block.meta.figureIds ?? []) seenFigures.add(figureId);
  }
  for (const section of outline.sections) for (const id of section.figureIds) seenFigures.add(id);
  const figureMap = new Map(figures.map((f) => [f.id, f]));
  for (const id of seenFigures) {
    const fig = figureMap.get(id);
    if (!fig) errors.push(`缺少图 ${id}。`);
    else errors.push(...figureErrors(dir, fig));
  }
  for (const finding of lint) {
    if (finding.severity === "ban") errors.push(`块 ${finding.blockId} 有禁用说法 ${finding.entryId}：${finding.sentence}`);
  }
  return errors;
}

function countBlocks(blocks: Block[]): ArticleSummary["blocks"] {
  const counts = { total: blocks.length, accepted: 0, draft: 0, stale: 0, missing: 0 };
  for (const block of blocks) {
    if (!block.exists || !block.meta) counts.missing++;
    else if (block.meta.status === "accepted") counts.accepted++;
    else if (block.meta.status === "stale") counts.stale++;
    else counts.draft++;
  }
  return counts;
}

function countClaims(claims: Claim[]): ArticleSummary["claims"] {
  const counts = { total: claims.length, accepted: 0, candidate: 0, rejected: 0, disputed: 0 };
  for (const claim of claims) {
    if (claim.status in counts && claim.status !== "total") counts[claim.status as "accepted"]++;
  }
  return counts;
}

export function lintArticle(blocks: Block[], figures: Figure[], rules: CompiledRule[]): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const block of blocks) if (block.body) findings.push(...lintBody(block.body, block.id, rules));
  for (const fig of figures) if (fig.caption) findings.push(...lintBody(fig.caption, "fig:" + fig.id, rules));
  return findings;
}

export function loadArticle(dir: string, root: string, rules: CompiledRule[]): ArticleSnapshot {
  const meta = readJson<ArticleMeta>(join(dir, "meta.json")) ?? ({ title: "", slug: "", styleRevision: 0, phase: "planning" } as ArticleMeta);
  const outline = loadOutline(dir);
  const claims = loadClaims(dir);
  const figures = loadFigures(dir);
  const blocks = outlineBlocks(dir, outline);
  const materials = readJson<Materials>(join(dir, "materials.json"));
  const lint = lintArticle(blocks, figures, rules);
  const errors = exportErrors(dir, meta, claims, outline, blocks, figures, lint, materials);

  const inOutline = new Set(blocks.map((b) => b.id));
  let orphanBlocks: string[] = [];
  try {
    orphanBlocks = readdirSync(join(dir, "blocks"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.slice(0, -3))
      .filter((id) => !inOutline.has(id))
      .sort();
  } catch {
    orphanBlocks = [];
  }

  const figureSources: Record<string, string> = {};
  for (const fig of figures) {
    if (!fig.source) continue;
    if (fig.kind === "mermaid" || fig.kind === "svg-chart" || fig.source.endsWith(".svg")) {
      const text = readText(join(dir, fig.source));
      if (text != null) figureSources[fig.id] = text;
    }
  }

  let exportFigures: string[] = [];
  try {
    exportFigures = readdirSync(join(dir, "export", "figures")).sort();
  } catch {
    exportFigures = [];
  }

  return {
    dir,
    relDir: relative(root, dir) || ".",
    meta,
    updatedAt: latestMtime(dir).toISOString(),
    blocks: countBlocks(blocks),
    claims: countClaims(claims),
    figures: figures.length,
    sections: outline.sections.length,
    hasExport: existsSync(join(dir, "export", "article.md")),
    exportReady: errors.length === 0,
    exportErrorCount: errors.length,
    banCount: lint.filter((f) => f.severity === "ban").length,
    watchCount: lint.filter((f) => f.severity !== "ban").length,
    plan: readJson<WritingPlan>(join(dir, "writing-plan.json")),
    claimList: claims,
    outline,
    blockList: blocks,
    orphanBlocks,
    figureList: figures,
    figureSources,
    revisions: readJsonl<RevisionRow>(join(dir, "revisions.jsonl")),
    materials,
    exportErrors: errors,
    lint,
    files: {
      workingMarkdown: existsSync(join(dir, "article.md")),
      exportMarkdown: existsSync(join(dir, "export", "article.md")),
      exportFigures,
    },
  };
}

export function summarize(snapshot: ArticleSnapshot): ArticleSummary {
  const { plan, claimList, outline, blockList, orphanBlocks, figureList, figureSources, revisions, materials, exportErrors, lint, files, ...summary } =
    snapshot;
  return summary;
}
