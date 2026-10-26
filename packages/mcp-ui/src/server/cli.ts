import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createMcpServer } from "./mcp.ts";
import { SessionManager } from "./sessions.ts";

declare const __APP_VERSION__: string;
const VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

const HELP = `chat-to-article-mcp-ui — 聊出文章来的 MCP Apps 审阅界面

作为 MCP 服务器运行（stdio）。审阅工具会在 agent 对话里嵌入交互界面（MCP Apps，ui:// 资源），
需要支持 MCP Apps 的客户端，例如 Cursor、Claude Desktop、VS Code。

MCP 客户端配置（Cursor：.cursor/mcp.json）
  {
    "mcpServers": {
      "chat-to-article-ui": {
        "command": "npx",
        "args": ["-y", "@liem-opc/chat-to-article-mcp-ui"]
      }
    }
  }

选项
  -v, --version       显示版本
  -h, --help          显示帮助

环境变量 CHAT_TO_ARTICLE_HOME 指定声音目录（用于词表检查），CHAT_TO_ARTICLE_SKILL 指定 skill 目录。
`;

const log = (message: string) => process.stderr.write(`[chat-to-article-mcp-ui] ${message}\n`);

async function main() {
  const { values } = parseArgs({
    options: {
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return void process.stdout.write(HELP);
  if (values.version) return void process.stdout.write(`${VERSION}\n`);

  const viewsDir = join(dirname(fileURLToPath(import.meta.url)), "views");
  const server = createMcpServer(new SessionManager(), { version: VERSION, viewsDir });
  await server.connect(new StdioServerTransport());
  log(`MCP 服务器已启动（v${VERSION}）`);
  const shutdown = () => {
    void server.close();
    process.exit(0);
  };
  process.stdin.on("close", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  log(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
