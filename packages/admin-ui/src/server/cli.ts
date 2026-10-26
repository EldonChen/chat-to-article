import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import { pickPort, resolveVoiceHome } from "@liem-opc/chat-to-article-core";
import { createApp } from "./app.ts";
import { Workspace } from "./workspace.ts";

const HELP = `chat-to-article-admin-ui — 聊出文章来的只读管理台

用法
  npx @liem-opc/chat-to-article-admin-ui [选项]

选项
  --root <dir>    扫描文章的目录，默认当前目录
  --home <dir>    声音目录，默认 $CHAT_TO_ARTICLE_HOME 或 ~/.chat-to-article
  --skill <dir>   skill 目录（读取共享词表），默认自动查找
  --depth <n>     向下查找文章目录的层数，默认 6
  --port <n>      端口，默认 4310，被占用时顺延
  --host <host>   监听地址，默认 127.0.0.1
  --no-open       不自动打开浏览器
  -h, --help      显示帮助
`;

async function main() {
  const { values } = parseArgs({
    options: {
      root: { type: "string" },
      home: { type: "string" },
      skill: { type: "string" },
      depth: { type: "string" },
      port: { type: "string" },
      host: { type: "string" },
      "no-open": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }

  const root = resolve(values.root ?? process.cwd());
  const home = resolveVoiceHome(values.home);
  const host = values.host ?? "127.0.0.1";
  const workspace = new Workspace({ root, home, skill: values.skill, depth: Number(values.depth ?? 6) });

  const here = dirname(fileURLToPath(import.meta.url));
  const webDir = join(here, "web");
  const app = createApp(workspace, existsSync(join(webDir, "index.html")) ? webDir : null);

  const port = await pickPort(Number(values.port ?? 4310), host);
  const server = serve({ fetch: app.fetch, port, hostname: host }, async (info) => {
    const url = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${info.port}`;
    const count = workspace.articleDirs().length;
    process.stdout.write(
      [
        "",
        "  聊出文章来 · 管理台（只读）",
        `  地址      ${url}`,
        `  文章目录  ${root}（找到 ${count} 篇）`,
        `  声音目录  ${home}${existsSync(home) ? "" : "（不存在）"}`,
        `  skill     ${workspace.skill().dir ?? "未找到，共享词表不可用"}`,
        "",
        "  按 Ctrl+C 退出",
        "",
      ].join("\n"),
    );
    if (!values["no-open"]) {
      const { default: open } = await import("open");
      open(url).catch(() => undefined);
    }
  });

  const stop = () => server.close(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
