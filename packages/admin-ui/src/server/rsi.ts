import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

/** 本机云端代理里的 iterations 根。环境变量和 --rsi 优先于这条自动探测。 */
const STORE_INTERNAL = "/cursor/stores/bc-6fa92af1-d707-4f94-a34d-2d94ecb0b87e/internal";

const ARCHIVE_DIR = "_script-patched-not-from-scratch";

export const RSI_DIMENSIONS = [
  { key: "opening", label: "开篇", weight: 20 },
  { key: "bridge", label: "桥梁", weight: 25 },
  { key: "mechanism", label: "机制", weight: 20 },
  { key: "analogy", label: "克制类比", weight: 15 },
  { key: "visual", label: "视觉", weight: 10 },
  { key: "review", label: "审阅", weight: 10 },
] as const;

export type RsiDimensionKey = (typeof RSI_DIMENSIONS)[number]["key"];

const DIMENSION_KEYS = new Set<string>(RSI_DIMENSIONS.map((d) => d.key));

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

export interface RsiGradient {
  text: string;
  items: { n: number; text: string }[];
}

export interface RsiImage {
  alt: string;
  file: string;
  url: string;
}

export interface RsiHeading {
  level: number;
  text: string;
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
  headings: RsiHeading[];
  charCount: number;
  tableCount: number;
  images: RsiImage[];
  articleMarkdown: string;
  articleSource: string;
  score: RsiScore | null;
  gradient: RsiGradient | null;
  writingPlan: unknown | null;
  writingPlanError: string | null;
  userRating: UserRating | null;
}

export interface RsiIndex {
  root: string | null;
  scannedAt: string;
  rounds: RsiRound[];
}

interface RoundSource {
  id: string;
  label: string;
  kind: RsiRound["kind"];
  archived: boolean;
  absDir: string;
  relDir: string;
  seq: number;
}

export function resolveRsiRoot(explicit?: string | null): string | null {
  const candidates: string[] = [];
  if (explicit && explicit.trim()) candidates.push(resolve(explicit));
  if (process.env.CTA_RSI_ROOT) candidates.push(resolve(process.env.CTA_RSI_ROOT));
  candidates.push(STORE_INTERNAL);
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    candidates.push(join(dir, "internal"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (looksLikeRsiRoot(candidate)) return candidate;
  }
  return null;
}

function looksLikeRsiRoot(dir: string): boolean {
  return existsSync(join(dir, "iterations")) || existsSync(join(dir, "baseline-case"));
}

export function scanRsi(root: string | null): RsiIndex {
  return {
    root,
    scannedAt: new Date().toISOString(),
    rounds: root ? listSources(root).map((source, order) => readRound(root, source, order)) : [],
  };
}

export function readFigure(root: string, roundId: string, filename: string): { body: Buffer; type: string } | null {
  const source = listSources(root).find((item) => item.id === roundId);
  if (!source || !isSafeFilename(filename)) return null;
  const figuresDir = join(source.absDir, "figures");
  if (!existsSync(figuresDir)) return null;
  const target = join(figuresDir, filename);
  if (!existsSync(target) || !statSync(target).isFile()) return null;
  const realFigures = realpathSync(figuresDir);
  const realTarget = realpathSync(target);
  if (realTarget !== realFigures && !realTarget.startsWith(realFigures + sep)) return null;
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const type = FIGURE_TYPES[ext];
  if (!type) return null;
  return { body: readFileSync(target), type };
}

const FIGURE_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function saveRating(
  root: string,
  roundId: string,
  input: { dimensions?: unknown; chips?: unknown; note?: unknown },
): UserRating {
  const source = listSources(root).find((item) => item.id === roundId);
  if (!source) {
    const error = new Error("找不到这一轮");
    (error as Error & { status: number }).status = 404;
    throw error;
  }
  const dimensions = normalizeDimensions(input.dimensions);
  const chips = normalizeChips(input.chips);
  const note = normalizeNote(input.note);
  const rating: UserRating = {
    roundId,
    savedAt: new Date().toISOString(),
    dimensions,
    weights: Object.fromEntries(RSI_DIMENSIONS.map((d) => [d.key, d.weight])) as UserRating["weights"],
    weightedTotal: weightedTotal(dimensions),
    chips,
    note,
    feedbackMarkdown: "",
  };
  rating.feedbackMarkdown = feedbackMarkdown(source.label, rating);
  const file = join(source.absDir, "user-rating.json");
  mkdirSync(source.absDir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(rating, null, 2)}\n`, "utf8");
  return rating;
}

export function weightedTotal(dimensions: Record<RsiDimensionKey, number>): number {
  const total = RSI_DIMENSIONS.reduce((sum, dim) => sum + (dimensions[dim.key] / 100) * dim.weight, 0);
  return Math.round(total * 10) / 10;
}

export function feedbackMarkdown(label: string, rating: Pick<UserRating, "weightedTotal" | "dimensions" | "chips" | "note">): string {
  const rows = RSI_DIMENSIONS.map((dim) => `| ${dim.label} | ${dim.weight} | ${rating.dimensions[dim.key]} |`).join("\n");
  const chips = rating.chips.length ? rating.chips.join("、") : "（无）";
  const note = rating.note.trim() ? `\n\n补充意见：\n\n${rating.note.trim()}\n` : "\n";
  return `# 用户实评 · ${label}\n\n加权总分：**${rating.weightedTotal.toFixed(1)}** / 100\n\n| 维 | 权重 | 滑块 |\n| --- | --- | --- |\n${rows}\n\n诊断：${chips}${note}`;
}

function listSources(root: string): RoundSource[] {
  const sources: RoundSource[] = [];
  const baseline = join(root, "baseline-case", "article");
  if (existsSync(baseline) && statSync(baseline).isDirectory()) {
    sources.push({
      id: "baseline",
      label: "baseline",
      kind: "baseline",
      archived: false,
      absDir: baseline,
      relDir: "baseline-case/article",
      seq: 0,
    });
  }
  const iterations = join(root, "iterations");
  if (existsSync(iterations) && statSync(iterations).isDirectory()) {
    for (const name of readdirSync(iterations)) {
      if (name.startsWith(".")) continue;
      const abs = join(iterations, name);
      if (!statSync(abs).isDirectory()) continue;
      if (name === ARCHIVE_DIR) {
        for (const child of readdirSync(abs)) {
          if (child.startsWith(".") || child === "README.md") continue;
          const childAbs = join(abs, child);
          if (!statSync(childAbs).isDirectory()) continue;
          sources.push({
            id: `archive-${child}`,
            label: `${child} · 归档`,
            kind: "archive",
            archived: true,
            absDir: childAbs,
            relDir: `iterations/${ARCHIVE_DIR}/${child}`,
            seq: trailingNumber(child),
          });
        }
        continue;
      }
      const kind: RoundSource["kind"] = name.startsWith("fresh-") ? "fresh" : name.startsWith("round-") ? "round" : "other";
      sources.push({
        id: uniqueId(sources, name),
        label: name,
        kind,
        archived: false,
        absDir: abs,
        relDir: `iterations/${name}`,
        seq: trailingNumber(name),
      });
    }
  }
  const rank: Record<RoundSource["kind"], number> = { baseline: 0, round: 1, fresh: 2, other: 3, archive: 4 };
  return sources.sort((a, b) => rank[a.kind] - rank[b.kind] || a.seq - b.seq || a.id.localeCompare(b.id));
}

function uniqueId(sources: RoundSource[], name: string): string {
  return sources.some((item) => item.id === name) ? `dir-${name}` : name;
}

function trailingNumber(name: string): number {
  const match = name.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : 999;
}

function readRound(_root: string, source: RoundSource, order: number): RsiRound {
  const articleSource = stripFrontmatter(readOptional(join(source.absDir, "article.md")) ?? "");
  const article = parseArticle(articleSource, source.id);
  const scoreMd = readOptional(join(source.absDir, "score.md"));
  const scorecard = readJson(join(source.absDir, "rsi-scorecard.json"));
  const plan = readJsonResult(join(source.absDir, "writing-plan.json"));
  const gradientMd = readOptional(join(source.absDir, "gradient.md"));
  const updated = newestMtime([
    join(source.absDir, "article.md"),
    join(source.absDir, "score.md"),
    join(source.absDir, "gradient.md"),
    join(source.absDir, "user-rating.json"),
    source.absDir,
  ]);
  return {
    id: source.id,
    label: source.label,
    kind: source.kind,
    archived: source.archived,
    order,
    relDir: source.relDir,
    updatedAt: updated,
    hasArticle: articleSource.length > 0,
    title: article.title,
    headings: article.headings,
    charCount: article.charCount,
    tableCount: article.tableCount,
    images: article.images,
    articleMarkdown: article.markdown,
    articleSource,
    score: parseScore(scoreMd, scorecard),
    gradient: gradientMd == null ? null : parseGradient(gradientMd),
    writingPlan: plan.value,
    writingPlanError: plan.error,
    userRating: readUserRating(join(source.absDir, "user-rating.json"), source.id),
  };
}

function parseArticle(source: string, roundId: string): {
  title: string | null;
  headings: RsiHeading[];
  charCount: number;
  tableCount: number;
  images: RsiImage[];
  markdown: string;
} {
  const headings: RsiHeading[] = [];
  let fence = false;
  for (const line of source.split(/\r?\n/)) {
    if (/^```/.test(line.trim())) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const match = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (match) headings.push({ level: match[1].length, text: match[2].replace(/\s+#+\s*$/, "").trim() });
  }
  const images: RsiImage[] = [];
  for (const match of source.matchAll(/!\[([^\]]*)\]\((?:\.\/)?(?:export\/)?figures\/([A-Za-z0-9._-]+)\)/g)) {
    images.push({
      alt: match[1],
      file: match[2],
      url: figureUrl(roundId, match[2]),
    });
  }
  return {
    title: headings.find((heading) => heading.level === 1)?.text ?? headings[0]?.text ?? null,
    headings,
    charCount: source.match(/[\p{L}\p{N}]/gu)?.length ?? 0,
    tableCount: source.split(/\r?\n/).filter((line) => isSeparator(line)).length,
    images,
    markdown: rewriteFigureLinks(source, roundId),
  };
}

export function rewriteFigureLinks(markdown: string, roundId: string): string {
  const linked = markdown.replace(
    /(!?\[[^\]]*\]\()(?:\.\/)?(?:export\/)?figures\/([A-Za-z0-9._-]+)(\))/g,
    (_all, open: string, file: string, close: string) => `${open}${figureUrl(roundId, file)}${close}`,
  );
  return linked.replace(
    /(src=["'])(?:\.\/)?(?:export\/)?figures\/([A-Za-z0-9._-]+)(["'])/g,
    (_all, open: string, file: string, close: string) => `${open}${figureUrl(roundId, file)}${close}`,
  );
}

function figureUrl(roundId: string, file: string): string {
  return `/api/rsi/rounds/${encodeURIComponent(roundId)}/figures/${encodeURIComponent(file)}`;
}

export function parseScore(markdown: string | null, scorecard: unknown): RsiScore | null {
  if (markdown == null && !scorecard) return null;
  const text = stripFrontmatter(markdown ?? "");
  const tables = parseTables(text);
  const six = tables.find((table) => table.headers.some((header) => header.includes("中位数")));
  const simple = [...tables].reverse().find((table) => /维/.test(table.headers[0] ?? "") && table.headers.some((header) => header === "分" || header.includes("分")));
  const dimensions = six ? parseSixDimensions(six) : simple ? parseSimpleDimensions(simple) : [];
  const card = scorecard && typeof scorecard === "object" ? (scorecard as Record<string, unknown>) : null;
  const total = parseTotal(text, tables) ?? (typeof card?.baselineHumanTotal === "number" ? card.baselineHumanTotal : null);
  const rawMatch = text.match(/^raw\s*[:：]\s*(\d+(?:\.\d+)?)/m);
  const strengths = [
    ...sectionBullets(text, /上一轮|保持|优点/),
    ...linesContaining(text, /生效/),
    ...(Array.isArray(card?.keepStrengths) ? card.keepStrengths.filter((item): item is string => typeof item === "string") : []),
  ];
  const weaknesses = [...sectionBullets(text, /短板|仍要修|还能往上/), ...linesContaining(text, /仍低于/)];
  const summary = text.split(/^##\s+/m)[0].replace(/^#.+$/m, "").trim().slice(0, 500);
  if (!text && dimensions.length === 0 && total == null && strengths.length === 0) return null;
  return {
    total,
    raw: rawMatch ? Number(rawMatch[1]) : null,
    overfit: parseOverfit(text),
    summary,
    dimensions,
    gates: parseGates(text, tables),
    strengths: uniqueLines(strengths).slice(0, 8),
    weaknesses: uniqueLines(weaknesses).slice(0, 8),
    markdown: text,
  };
}

function parseSixDimensions(table: MarkdownTable): RsiDimensionScore[] {
  const col = (name: string) => table.headers.findIndex((header) => header.includes(name));
  const reader = col("读者");
  const director = col("编导");
  const author = col("作者");
  const median = col("中位数");
  const quote = col("引用");
  return table.rows
    .filter((row) => row[0] && !/^合计|^总分/.test(row[0]))
    .map((row) => {
      const label = row[0];
      return {
        label,
        max: maxFromLabel(label),
        reader: cellNumber(row[reader]),
        director: cellNumber(row[director]),
        author: cellNumber(row[author]),
        value: cellNumber(row[median]),
        quote: quote >= 0 ? (row[quote] ?? "") : "",
      };
    });
}

function parseSimpleDimensions(table: MarkdownTable): RsiDimensionScore[] {
  return table.rows
    .filter((row) => row[0] && !/^合计|^总分/.test(row[0]))
    .map((row) => {
      const label = row[0];
      const value = cellNumber(row[1]);
      return {
        label,
        max: maxFromLabel(label) ?? (label.startsWith("A") ? 20 : null),
        reader: null,
        director: null,
        author: null,
        value,
        quote: row.slice(2).join(" ").trim(),
      };
    });
}

function parseTotal(text: string, tables: MarkdownTable[]): number | null {
  const finalScore = text.match(/最终分\s*[:：]\s*(\d+(?:\.\d+)?)/);
  if (finalScore) return Number(finalScore[1]);
  let fromTable: number | null = null;
  for (const table of tables) {
    for (const row of table.rows) {
      if (!/^合计|^总分/.test(row[0] ?? "")) continue;
      const nums = row.map(cellNumber).filter((value): value is number => value != null);
      if (nums.length) fromTable = nums[nums.length - 1];
    }
  }
  if (fromTable != null) return fromTable;
  const equation = text.match(/文章五维[^。\n]*=\s*(\d+(?:\.\d+)?)/);
  return equation ? Number(equation[1]) : null;
}

function parseOverfit(text: string): RsiScore["overfit"] {
  const match = text.match(/^overfit\s*[:：]\s*(.+)$/im);
  if (!match) return null;
  const value = match[1].trim();
  if (/^true\b/i.test(value)) return true;
  if (/^false\b/i.test(value)) return false;
  return "unreviewed";
}

function parseGates(text: string, tables: MarkdownTable[]): RsiGate[] {
  const table = tables.find((item) => item.headers.some((header) => header.includes("闸门") || header === "Gate"));
  const fromTable = table
    ? table.rows
        .filter((row) => row[0])
        .map((row) => ({ name: row[0], passed: gatePassed(row[1] ?? ""), detail: row.slice(1).join(" ").trim() }))
    : [];
  if (fromTable.length) return fromTable;
  const prose = text.match(/^闸门\s*[:：]\s*(.+)$/m);
  return prose ? [{ name: "闸门", passed: gatePassed(prose[1]), detail: prose[1].trim() }] : [];
}

function gatePassed(detail: string): boolean | null {
  if (detail.includes("未触发") || detail.startsWith("通过")) return true;
  if (detail.includes("触发")) return false;
  return null;
}

function parseGradient(markdown: string): RsiGradient {
  const text = stripFrontmatter(markdown).trim();
  const items: { n: number; text: string }[] = [];
  const chunks = text.split(/^(?=\d+\.\s)/m);
  for (const chunk of chunks) {
    const match = /^(\d+)\.\s+([\s\S]+)$/.exec(chunk.trim());
    if (!match) continue;
    items.push({ n: Number(match[1]), text: match[2].trim() });
  }
  return { text, items };
}

function sectionBullets(text: string, heading: RegExp): string[] {
  const blocks = text.split(/^##\s+/m).slice(1);
  const lines: string[] = [];
  for (const block of blocks) {
    const nl = block.indexOf("\n");
    const title = (nl < 0 ? block : block.slice(0, nl)).trim();
    if (!heading.test(title)) continue;
    const body = nl < 0 ? "" : block.slice(nl + 1);
    for (const line of body.split(/\r?\n/)) {
      const bullet = /^[-*]\s+(.+)/.exec(line.trim());
      if (bullet) lines.push(bullet[1].trim());
    }
  }
  return lines;
}

function linesContaining(text: string, pattern: RegExp): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter((line) => line && pattern.test(line) && !line.startsWith("#"));
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const clean = line.replace(/\s+/g, " ").trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

interface MarkdownTable {
  headers: string[];
  rows: string[][];
}

function parseTables(markdown: string): MarkdownTable[] {
  const lines = markdown.split(/\r?\n/);
  const tables: MarkdownTable[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!isSeparator(lines[i]) || !lines[i - 1].includes("|")) continue;
    const headers = splitRow(lines[i - 1]);
    const rows: string[][] = [];
    let cursor = i + 1;
    while (cursor < lines.length && lines[cursor].includes("|") && !isSeparator(lines[cursor])) {
      rows.push(splitRow(lines[cursor]));
      cursor++;
    }
    tables.push({ headers, rows });
    i = cursor;
  }
  return tables;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.replace(/\*\*/g, "").replace(/`/g, "").trim());
}

function isSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function cellNumber(cell: string | undefined): number | null {
  if (!cell) return null;
  const cleaned = cell.replace(/\*\*/g, "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function maxFromLabel(label: string): number | null {
  const match = label.match(/\/\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function normalizeDimensions(input: unknown): Record<RsiDimensionKey, number> {
  if (!input || typeof input !== "object") fail(400, "dimensions 需要六维分数");
  const source = input as Record<string, unknown>;
  const dimensions = {} as Record<RsiDimensionKey, number>;
  for (const dim of RSI_DIMENSIONS) {
    const value = source[dim.key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
      fail(400, `${dim.label} 的分数要在 0 到 100 之间`);
    }
    dimensions[dim.key] = Math.round(value * 10) / 10;
  }
  for (const key of Object.keys(source)) {
    if (!DIMENSION_KEYS.has(key)) fail(400, `未知维度 ${key}`);
  }
  return dimensions;
}

function normalizeChips(input: unknown): string[] {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 20) fail(400, "诊断标签太多");
  return input.map((chip) => {
    if (typeof chip !== "string") fail(400, "诊断标签要是字符串");
    const text = chip.trim();
    if (!text || text.length > 40) fail(400, "诊断标签不能为空，且不超过 40 字");
    return text;
  });
}

function normalizeNote(input: unknown): string {
  if (input == null) return "";
  if (typeof input !== "string") fail(400, "补充意见要是字符串");
  const note = input.trim();
  if (note.length > 8000) fail(400, "补充意见超过 8000 字");
  return note;
}

function readUserRating(file: string, roundId: string): UserRating | null {
  const parsed = readJson(file);
  if (!parsed || typeof parsed !== "object") return null;
  const rating = parsed as Partial<UserRating>;
  if (!rating.dimensions || typeof rating.weightedTotal !== "number" || !Array.isArray(rating.chips)) return null;
  try {
    const dimensions = normalizeDimensions(rating.dimensions);
    return {
      roundId,
      savedAt: typeof rating.savedAt === "string" ? rating.savedAt : "",
      dimensions,
      weights: Object.fromEntries(RSI_DIMENSIONS.map((d) => [d.key, d.weight])) as UserRating["weights"],
      weightedTotal: rating.weightedTotal,
      chips: rating.chips.filter((chip): chip is string => typeof chip === "string"),
      note: typeof rating.note === "string" ? rating.note : "",
      feedbackMarkdown: typeof rating.feedbackMarkdown === "string" ? rating.feedbackMarkdown : "",
    };
  } catch {
    return null;
  }
}

function readOptional(file: string): string | null {
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  return readFileSync(file, "utf8");
}

function readJson(file: string): unknown | null {
  const text = readOptional(file);
  if (text == null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function readJsonResult(file: string): { value: unknown | null; error: string | null } {
  const text = readOptional(file);
  if (text == null) return { value: null, error: null };
  try {
    return { value: JSON.parse(text) as unknown, error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "writing-plan.json 无法解析" };
  }
}

function newestMtime(paths: string[]): string | null {
  let newest = 0;
  for (const file of paths) {
    if (!existsSync(file)) continue;
    newest = Math.max(newest, statSync(file).mtimeMs);
  }
  return newest ? new Date(newest).toISOString() : null;
}

export function stripFrontmatter(text: string): string {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return text;
  const next = text.indexOf("\n", end + 4);
  return next < 0 ? "" : text.slice(next + 1).replace(/^\n/, "");
}

function isSafeFilename(filename: string): boolean {
  return filename === basename(filename) && !filename.includes("..") && /^\w[\w.-]*\.(svg|png|jpe?g|webp|gif)$/i.test(filename);
}

function fail(status: number, message: string): never {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  throw error;
}

export function errorStatus(error: unknown): number {
  return error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 500;
}
