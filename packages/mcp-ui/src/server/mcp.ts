import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getUiCapability, RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { CLIENT_CAPABILITIES_META_KEY, McpServer, type CallToolResult, type ClientCapabilities, type ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ACTIONS, type ActionKind } from "../shared/actions.ts";
import { UserFacingError } from "./article-io.ts";
import { HANDLERS } from "./handlers.ts";
import type { Session, SessionManager } from "./sessions.ts";

export interface McpOptions {
  version: string;
  /** 构建好的单文件视图（review.html、figure.html）所在目录。 */
  viewsDir: string;
}

export const VIEW_URIS = {
  review: "ui://chat-to-article/review.html",
  figure: "ui://chat-to-article/figure.html",
} as const;

const VIEW_OF: Record<ActionKind, keyof typeof VIEW_URIS> = {
  ask_questions: "review",
  review_writing_plan: "review",
  review_claims: "review",
  review_outline: "review",
  review_block: "review",
  review_figure: "figure",
  review_style_candidates: "review",
};

const TITLES: Record<ActionKind, string> = {
  ask_questions: "向作者提问",
  review_writing_plan: "审阅写作计划",
  review_claims: "审阅主张",
  review_outline: "审阅大纲",
  review_block: "审阅正文块（修订模式）",
  review_figure: "审阅图",
  review_style_candidates: "确认风格候选",
};

const text = (...parts: string[]): CallToolResult => ({ content: parts.map((t) => ({ type: "text" as const, text: t })) });
const failure = (message: string): CallToolResult => ({ ...text(message), isError: true });

function errorMessage(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  if (error instanceof z.ZodError) return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** 宿主是否声明支持 MCP Apps：true / false / undefined（没有声明能力，无法判断）。 */
function hostRendersUi(server: McpServer, ctx: ServerContext): boolean | undefined {
  const perRequest = ctx.mcpReq._meta?.[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined;
  const caps = perRequest ?? server.server.getClientCapabilities();
  if (!caps) return undefined;
  return !!getUiCapability(caps)?.mimeTypes?.includes(RESOURCE_MIME_TYPE);
}

function agentInstructions(session: Session, rendersUi: boolean | undefined): string {
  const title = session.prepared.title;
  const lines =
    rendersUi === false
      ? [
          `已为「${title}」准备好审阅内容（会话 ${session.id}），但当前客户端没有声明支持 MCP Apps，用户可能看不到嵌入界面。`,
          "如果用户看不到界面，就在对话里按 SKILL.md 的原流程让用户审阅；工具已经写入的草稿文件照常有效。",
        ]
      : [
          `已在对话中嵌入「${title}」审阅界面（会话 ${session.id}）。`,
          "用一句话请用户在界面里审阅并点按钮提交，然后结束这一轮。不要替用户做决定，也不要进入依赖这个决定的下一步。",
          "用户提交后，结果会作为一条以「【审阅结果】」开头的用户消息出现在对话里，按其中的说明继续。",
          `如果用户说已经提交、对话里却没有结果，调用 get_review_result（sessionId: ${session.id}）。`,
        ];
  return lines.join("\n");
}

export function createMcpServer(manager: SessionManager, options: McpOptions): McpServer {
  const server = new McpServer(
    { name: "chat-to-article-mcp-ui", version: options.version },
    {
      instructions:
        "聊出文章来（chat-to-article）的审阅界面（MCP Apps）。需要作者决定或审阅时，调用对应的 review_* / ask_questions 工具：工具会在对话里嵌入一个审阅界面并立即返回。请用户在界面里操作后结束本轮；用户点按钮后，结果会作为一条用户消息回到对话。不要再把 writing-plan.json、claims.jsonl、outline.json 或整块正文贴进对话让用户确认。门禁（set-gate、accept-block、compile）仍用 cta.py。",
    },
  );

  for (const [key, uri] of Object.entries(VIEW_URIS)) {
    registerAppResource(
      server,
      key === "figure" ? "插图审阅界面" : "审阅界面",
      uri,
      { description: "chat-to-article 的嵌入式审阅视图", _meta: { ui: { prefersBorder: true } } },
      async () => ({
        contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: readFileSync(join(options.viewsDir, `${key}.html`), "utf8") }],
      }),
    );
  }

  for (const kind of ACTIONS) {
    const handler = HANDLERS[kind];
    registerAppTool(
      server,
      kind,
      {
        title: TITLES[kind],
        description: handler.description,
        inputSchema: handler.args,
        annotations: { readOnlyHint: kind === "ask_questions" || kind === "review_style_candidates" },
        _meta: { ui: { resourceUri: VIEW_URIS[VIEW_OF[kind]] } },
      },
      async (args: unknown, ctx: ServerContext): Promise<CallToolResult> => {
        let session: Session;
        try {
          session = manager.create(kind, args);
        } catch (error) {
          return failure(errorMessage(error));
        }
        return {
          ...text(agentInstructions(session, hostRendersUi(server, ctx))),
          structuredContent: { sessionId: session.id, action: kind, title: session.prepared.title },
        };
      },
    );
  }

  // 以下两个工具只给嵌入界面调用（visibility: app），agent 看不到。
  registerAppTool(
    server,
    "review_load",
    {
      title: "载入审阅内容",
      description: "嵌入界面载入审阅会话的内容。MCP 服务重启后会话丢失时，用原始工具参数重建。",
      inputSchema: z.object({
        sessionId: z.string(),
        action: z.enum(ACTIONS).optional(),
        args: z.record(z.string(), z.unknown()).optional(),
      }),
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ sessionId, action, args }): Promise<CallToolResult> => {
      let session = manager.sessions.get(sessionId);
      if (!session && action && args) {
        try {
          session = manager.create(action, args, sessionId);
        } catch (error) {
          return failure(errorMessage(error));
        }
      }
      if (!session) return failure("会话不存在，可能 MCP 服务已经重启。请让 agent 重新调用这个审阅工具。");
      const detail = manager.detail(session);
      return { ...text(`已载入「${detail.title}」`), structuredContent: detail as unknown as Record<string, unknown> };
    },
  );

  registerAppTool(
    server,
    "review_submit",
    {
      title: "提交审阅结果",
      description: "嵌入界面提交用户的决定、修改与批注；按决定写入文章目录，返回交给 agent 的说明。",
      inputSchema: z.object({ sessionId: z.string(), result: z.record(z.string(), z.unknown()) }),
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ sessionId, result }): Promise<CallToolResult> => {
      const out = manager.submit(sessionId, result);
      if (!out.ok) return failure(out.error);
      return {
        ...text(out.response),
        structuredContent: { sessionId, action: out.session.kind, title: out.session.prepared.title, decision: out.session.decision ?? null, response: out.response },
      };
    },
  );

  server.registerTool(
    "get_review_result",
    {
      title: "读取审阅结果",
      description: "读取某个审阅会话里用户提交的结果。正常情况下结果会作为用户消息自动回到对话；只有用户说已提交但对话里没有结果时才需要调用。",
      inputSchema: z.object({ sessionId: z.string() }),
    },
    async ({ sessionId }): Promise<CallToolResult> => {
      const session = manager.sessions.get(sessionId);
      if (!session) return failure(`没有会话 ${sessionId}。MCP 服务重启后旧会话会丢失，请重新调用对应的审阅工具。`);
      if (session.status !== "submitted") return text(`用户还没有在「${session.prepared.title}」界面里提交。请用户在界面里操作，然后结束这一轮。`);
      return text(session.response ?? "", JSON.stringify({ sessionId, action: session.kind, decision: session.decision, result: session.result }));
    },
  );

  server.registerTool(
    "list_review_sessions",
    {
      title: "列出审阅会话",
      description: "列出本进程里的审阅会话和它们的状态。",
      inputSchema: z.object({}),
    },
    async (): Promise<CallToolResult> => {
      const list = manager.list();
      return text(list.length ? JSON.stringify(list, null, 2) : "还没有审阅会话。");
    },
  );

  return server;
}
