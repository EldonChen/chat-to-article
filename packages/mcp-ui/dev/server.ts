/**
 * 本地开发 / e2e 用的 MCP Apps 宿主。不随包发布。
 *
 * Node 侧把真实的 MCP 服务连到进程内的 MCP 客户端（声明支持 MCP Apps），
 * 浏览器侧（dev/host.ts）像 Cursor 一样把 ui:// 资源放进沙箱 iframe，经 AppBridge 通信。
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createServer } from "vite";
import { createDemoArticle, demoInputs } from "../src/server/demo.ts";
import { createMcpServer } from "../src/server/mcp.ts";
import { SessionManager } from "../src/server/sessions.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const viewsDir = fileURLToPath(new URL("../dist/views", import.meta.url));
const port = Number(process.env.PORT ?? 4330);

const article = createDemoArticle(process.env.CTA_DEMO_DIR);
const server = createMcpServer(new SessionManager(), { version: "dev", viewsDir });
const client = new Client(
  { name: "cta-dev-host", version: "dev" },
  { capabilities: { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } } },
);
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
await client.connect(clientTransport);

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>) : {};
}

const routes: Record<string, (input: Record<string, unknown>) => Promise<unknown>> = {
  "/mcp/demos": async () => demoInputs(article).map(([name, args]) => ({ name, args })),
  "/mcp/tools": async () => (await client.listTools()).tools,
  "/mcp/call": async (input) => client.callTool({ name: input.name as string, arguments: input.arguments as Record<string, unknown> }),
  "/mcp/read": async (input) => client.readResource({ uri: input.uri as string }),
};

const vite = await createServer({
  root: here,
  configFile: false,
  server: { host: "127.0.0.1", port, strictPort: true },
  logLevel: "warn",
  plugins: [
    {
      name: "cta-mcp-proxy",
      configureServer(dev) {
        dev.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const route = req.url ? routes[req.url] : undefined;
          if (!route || req.method !== "POST") return next();
          try {
            const result = await route(await body(req));
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(result));
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
          }
        });
      },
    },
  ],
});
await vite.listen();
console.error(`MCP Apps 开发宿主：http://127.0.0.1:${port}/\n示例文章：${article}`);

const shutdown = async () => {
  await vite.close();
  await client.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
