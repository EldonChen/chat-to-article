import { readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".md": "text/markdown; charset=utf-8",
  ".mmd": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export function contentType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** 把 rel 解析到 base 之内；越界或不存在时返回 null。 */
export function safeJoin(base: string, rel: string): string | null {
  const root = resolve(base);
  const target = resolve(root, normalize(rel).replace(/^([/\\])+/, ""));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

export function readStaticFile(base: string, rel: string): { body: Buffer; type: string } | null {
  const target = safeJoin(base, rel);
  if (!target) return null;
  try {
    if (!statSync(target).isFile()) return null;
    return { body: readFileSync(target), type: contentType(target) };
  } catch {
    return null;
  }
}

/** SPA 静态托管：命中文件就返回文件，否则返回 index.html。 */
export function spaAsset(webDir: string, urlPath: string): { body: Buffer; type: string; cache: boolean } | null {
  const rel = decodeURIComponent(urlPath.split("?")[0]);
  const hit = rel !== "/" ? readStaticFile(webDir, rel) : null;
  if (hit) return { ...hit, cache: rel.startsWith("/assets/") };
  const index = readStaticFile(webDir, "index.html");
  return index ? { ...index, cache: false } : null;
}

function portFree(port: number, host: string): Promise<boolean> {
  return new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.once("listening", () => probe.close(() => done(true)));
    probe.listen(port, host);
  });
}

/** 从 preferred 开始找空闲端口；preferred 为 0 时交给系统分配。 */
export async function pickPort(preferred: number, host: string, attempts = 20): Promise<number> {
  if (preferred === 0) return 0;
  for (let i = 0; i < attempts; i++) {
    if (await portFree(preferred + i, host)) return preferred + i;
  }
  return 0;
}

export function webDirFrom(moduleDir: string): string {
  return join(moduleDir, "web");
}
