import { existsSync } from "node:fs";
import { join } from "node:path";
import { readText } from "./fsutil.ts";
import type { ArticleSnapshot, Figure } from "./types.ts";

export interface RenderOptions {
  /** 带 `<!-- block:id -->` 锚点的工作稿，否则为干净文本。 */
  anchors: boolean;
  provenance: boolean;
  /** 草稿预览：未接受的块也输出，并在锚点模式下标注状态。 */
  includeUnaccepted?: boolean;
}

function renderFigure(dir: string, fig: Figure, anchors: boolean): string {
  const sourcePath = join(dir, fig.source ?? "");
  if (fig.status === "planned" || !fig.source || !existsSync(sourcePath)) {
    const note = `图位 ${fig.id} 还没有可分享的文件。`;
    return anchors ? `<!-- figure:${fig.id} planned -->\n\n${note}\n` : `${note}\n`;
  }
  const alt = fig.alt || fig.id;
  let rendered: string;
  if (fig.kind === "mermaid") {
    rendered = "```mermaid\n" + (readText(sourcePath) ?? "").trim() + "\n```\n";
  } else {
    rendered = `![${alt}](${fig.source})\n`;
  }
  if (fig.caption) rendered += `\n${fig.caption}\n`;
  return rendered;
}

/** cta_lib.render_article 的移植。只读：不写 article.md，也不生成 export/。 */
export function renderArticle(snapshot: ArticleSnapshot, options: RenderOptions): string {
  const figures = new Map(snapshot.figureList.map((f) => [f.id, f]));
  const blocks = new Map(snapshot.blockList.map((b) => [b.id, b]));
  const chunks: string[] = [`# ${snapshot.meta.title}`, ""];
  for (const section of snapshot.outline.sections) {
    chunks.push(`## ${section.title}`, "");
    for (const blockId of section.blockIds) {
      const block = blocks.get(blockId);
      const body = block?.exists && block.meta ? block.body : "";
      const figureIds = block?.meta?.figureIds ?? [];
      if (options.anchors) {
        chunks.push(`<!-- block:${blockId} -->`, body.trimEnd(), `<!-- /block:${blockId} -->`, "");
      } else if (body) {
        chunks.push(body.trimEnd(), "");
      }
      for (const figureId of figureIds) {
        const fig = figures.get(figureId);
        if (fig) chunks.push(renderFigure(snapshot.dir, fig, options.anchors).trimEnd(), "");
      }
    }
  }
  if (options.provenance) {
    chunks.push("## 来源", "");
    for (const claim of snapshot.claimList) {
      if (claim.status !== "accepted") continue;
      for (const source of claim.sources ?? []) chunks.push(`- ${claim.id}: ${source.kind} ${source.id ?? ""}`);
    }
    chunks.push("");
  }
  return chunks.join("\n").trimEnd() + "\n";
}

/** 分享包引用到的图（块与大纲两处），用于打包导出。 */
export function referencedFigures(snapshot: ArticleSnapshot): Figure[] {
  const ids = new Set<string>();
  for (const block of snapshot.blockList) for (const id of block.meta?.figureIds ?? []) ids.add(id);
  for (const section of snapshot.outline.sections) for (const id of section.figureIds) ids.add(id);
  return snapshot.figureList.filter((f) => ids.has(f.id));
}
