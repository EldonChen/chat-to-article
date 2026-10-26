import { randomUUID } from "node:crypto";
import type { ActionKind, SessionDetail, SessionSummary } from "../shared/actions.ts";
import { HANDLERS, type Prepared } from "./handlers.ts";

export interface Session {
  id: string;
  kind: ActionKind;
  input: unknown;
  prepared: Prepared;
  createdAt: string;
  status: SessionSummary["status"];
  result?: unknown;
  response?: string;
  decision?: string;
}

export type SubmitOutcome = { ok: true; response: string; session: Session } | { ok: false; error: string };

/** 一次审阅动作 = 一次工具调用 = 一个会话。嵌入界面通过会话 id 取内容、提交结果。 */
export class SessionManager {
  readonly sessions = new Map<string, Session>();
  onSubmit: ((session: Session) => void) | null = null;

  /** 校验输入并执行 prepare（可能写入草稿）。门禁不通过时抛出 UserFacingError。 */
  create(kind: ActionKind, rawInput: unknown, id: string = randomUUID()): Session {
    const handler = HANDLERS[kind];
    const input = handler.args.parse(rawInput);
    const prepared = handler.prepare(input);
    const session: Session = { id, kind, input, prepared, createdAt: new Date().toISOString(), status: "pending" };
    this.sessions.set(session.id, session);
    return session;
  }

  summary(session: Session): SessionSummary {
    return {
      id: session.id,
      action: session.kind,
      title: session.prepared.title,
      article: session.prepared.article,
      createdAt: session.createdAt,
      status: session.status,
      decision: session.decision,
    };
  }

  detail(session: Session): SessionDetail {
    return {
      ...this.summary(session),
      input: session.input,
      context: session.prepared.context,
      result: session.result,
      response: session.response,
    };
  }

  list(): SessionSummary[] {
    return [...this.sessions.values()].map((s) => this.summary(s)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  submit(id: string, body: unknown): SubmitOutcome {
    const session = this.sessions.get(id);
    if (!session) return { ok: false, error: "会话不存在，可能 MCP 服务已经重启。请让 agent 重新调用这个审阅工具。" };
    if (session.status !== "pending") return { ok: false, error: "这个审阅已经提交过了。" };
    const handler = HANDLERS[session.kind];
    const parsed = handler.result.safeParse(body);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    let response: string;
    try {
      response = handler.submit(session.input, parsed.data);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    session.result = parsed.data;
    session.decision = (parsed.data as { decision?: string }).decision;
    session.response = response;
    session.status = "submitted";
    this.onSubmit?.(session);
    return { ok: true, response, session };
  }
}
