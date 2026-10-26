import type { BlockMeta } from "./types.ts";

/** 与 cta_lib.parse_block 保持同一种 frontmatter 解析规则。 */
export function parseBlock(text: string): { meta: BlockMeta; body: string } {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) throw new Error("块文件缺少 frontmatter");
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) throw new Error("块文件 frontmatter 没有结束");
  const meta: Record<string, unknown> = { claimIds: [], figureIds: [] };
  for (const line of normalized.slice(4, end).split("\n")) {
    if (!line.trim() || !line.includes(":")) continue;
    const idx = line.indexOf(":");
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();
    if (raw.startsWith("[") && raw.endsWith("]")) {
      meta[key] = raw
        .slice(1, -1)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    } else {
      meta[key] = raw;
    }
  }
  let body = normalized.slice(end + 5);
  if (body.startsWith("\n")) body = body.slice(1);
  return { meta: meta as BlockMeta, body };
}

export function formatBlock(meta: Pick<BlockMeta, "id" | "status" | "claimIds" | "figureIds">, body: string): string {
  const prose = body.replace(/^\n+|\n+$/g, "");
  return (
    "---\n" +
    `id: ${meta.id}\n` +
    `status: ${meta.status}\n` +
    `claimIds: [${(meta.claimIds ?? []).join(", ")}]\n` +
    `figureIds: [${(meta.figureIds ?? []).join(", ")}]\n` +
    "---\n\n" +
    `${prose}\n`
  );
}
