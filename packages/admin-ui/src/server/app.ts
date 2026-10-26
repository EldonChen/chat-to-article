import { Hono } from "hono";
import { zipSync } from "fflate";
import { readStaticFile, spaAsset } from "@liem-opc/chat-to-article-core";
import { Workspace, type MarkdownVariant } from "./workspace.ts";

declare const __APP_VERSION__: string;
const VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

function attachment(name: string): string {
  return `attachment; filename="${encodeURIComponent(name).replace(/%/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

const VARIANTS = new Set<MarkdownVariant>(["export", "clean", "working"]);

export function createApp(workspace: Workspace, webDir: string | null) {
  const app = new Hono();

  app.use("/api/*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      return c.json({ error: "管理台是只读的" }, 405);
    }
    await next();
    c.header("Cache-Control", "no-store");
  });

  app.get("/api/context", (c) => {
    const skill = workspace.skill();
    return c.json({
      version: VERSION,
      root: workspace.options.root,
      home: workspace.options.home,
      skillDir: skill.dir,
      readOnly: true,
    });
  });

  app.get("/api/voice", (c) => c.json(workspace.voice()));
  app.get("/api/lexicon", (c) => c.json(workspace.lexicon()));
  app.get("/api/articles", (c) => c.json(workspace.articles()));

  app.get("/api/articles/:id", (c) => {
    const snapshot = workspace.article(c.req.param("id"));
    if (!snapshot) return c.json({ error: "找不到这篇文章" }, 404);
    return c.json(snapshot);
  });

  app.get("/api/articles/:id/markdown", (c) => {
    const snapshot = workspace.article(c.req.param("id"));
    if (!snapshot) return c.json({ error: "找不到这篇文章" }, 404);
    const variant = (c.req.query("variant") ?? "export") as MarkdownVariant;
    if (!VARIANTS.has(variant)) return c.json({ error: "variant 只能是 export、clean 或 working" }, 400);
    const md = workspace.markdown(snapshot, variant);
    if (!md) return c.json({ error: "这篇文章还没有分享包（export/article.md）" }, 404);
    c.header("Content-Type", "text/markdown; charset=utf-8");
    if (c.req.query("download")) c.header("Content-Disposition", attachment(md.fileName));
    return c.body(md.text);
  });

  app.get("/api/articles/:id/asset", (c) => {
    const snapshot = workspace.article(c.req.param("id"));
    const rel = c.req.query("path");
    if (!snapshot || !rel) return c.json({ error: "找不到文件" }, 404);
    const file = readStaticFile(snapshot.dir, rel);
    if (!file) return c.json({ error: "找不到文件" }, 404);
    c.header("Content-Type", file.type);
    return c.body(new Uint8Array(file.body));
  });

  app.get("/api/export.zip", (c) => {
    const ids = (c.req.query("ids") ?? "").split(",").filter(Boolean);
    const prefer = c.req.query("prefer") === "clean" ? "clean" : "export";
    if (!ids.length) return c.json({ error: "没有选择文章" }, 400);
    const files: Record<string, Uint8Array> = {};
    for (const id of ids) {
      const snapshot = workspace.article(id);
      if (snapshot) Object.assign(files, workspace.bundle(snapshot, prefer));
    }
    if (!Object.keys(files).length) return c.json({ error: "选中的文章没有可导出的内容" }, 404);
    const name = ids.length === 1 ? `${Object.keys(files)[0].split("/")[0]}.zip` : "chat-to-article-export.zip";
    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", attachment(name));
    return c.body(zipSync(files));
  });

  app.all("/api/*", (c) => c.json({ error: "未知接口" }, 404));

  if (webDir) {
    app.get("*", (c) => {
      const asset = spaAsset(webDir, new URL(c.req.url).pathname);
      if (!asset) return c.text("前端资源缺失，请先运行 pnpm build。", 500);
      c.header("Content-Type", asset.type);
      c.header("Cache-Control", asset.cache ? "public, max-age=31536000, immutable" : "no-cache");
      return c.body(new Uint8Array(asset.body));
    });
  }

  return app;
}
