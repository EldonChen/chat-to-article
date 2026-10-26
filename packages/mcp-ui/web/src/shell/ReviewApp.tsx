import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { AlertTriangle, CheckCircle2, Copy, FolderOpen, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import type { ActionKind, SessionDetail } from "../../../src/shared/actions.ts";
import { Badge, buttonClass } from "../components/ui.tsx";
import { ACTION_META, DECISION_LABEL } from "../lib/actions.ts";
import { clearDraft } from "../store.ts";
import { SubmitState, type SubmitFn } from "../views/types.ts";

declare const __APP_VERSION__: string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ViewMap = Partial<Record<ActionKind, ComponentType<{ session: SessionDetail<any, any>; submit: SubmitFn }>>>;

interface ToolHandle {
  sessionId: string;
  action: ActionKind;
  title: string;
}

type Phase =
  | { kind: "waiting" }
  | { kind: "loading" }
  | { kind: "ready"; session: SessionDetail }
  | { kind: "submitted"; session: SessionDetail; response: string; delivered: boolean }
  | { kind: "error"; message: string };

type ToolResultLike = { content?: { type: string; text?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

const textOf = (r: ToolResultLike) =>
  (r.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");

async function callTool(app: App, name: string, args: Record<string, unknown>): Promise<ToolResultLike> {
  const result = (await app.callServerTool({ name, arguments: args })) as ToolResultLike;
  if (result.isError) throw new Error(textOf(result) || `${name} 失败`);
  return result;
}

/** 把提交结果作为一条用户消息发回对话，触发 agent 的下一轮；宿主不支持时退回到更新模型上下文。 */
async function deliver(app: App, message: string): Promise<boolean> {
  const content = [{ type: "text" as const, text: message }];
  try {
    const res = await app.sendMessage({ role: "user", content });
    if (!res.isError) return true;
  } catch {
    // 宿主不支持 ui/message，或用户拒绝
  }
  try {
    await app.updateModelContext({ content });
  } catch {
    // 也不支持时，界面提示用户手动让 agent 继续
  }
  return false;
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="@container text-stone-800 dark:text-stone-100">{children}</div>;
}

function Status({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-5 text-sm">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        {children && <div className="mt-1 text-stone-500 dark:text-stone-400">{children}</div>}
      </div>
    </div>
  );
}

function Header({ session, app, hostContext }: { session: SessionDetail; app: App; hostContext?: McpUiHostContext }) {
  const meta = ACTION_META[session.action];
  const modes = hostContext?.availableDisplayModes ?? [];
  const fullscreen = hostContext?.displayMode === "fullscreen";
  const canToggle = fullscreen ? modes.includes("inline") : modes.includes("fullscreen");
  return (
    <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-2.5 dark:border-stone-800">
      <meta.icon className="size-4 shrink-0 text-emerald-600" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{session.title}</span>
          <Badge>{meta.label}</Badge>
        </div>
        {session.article && (
          <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-stone-500" title={session.article}>
            <FolderOpen className="size-3 shrink-0" />
            <span className="truncate font-mono">{session.article}</span>
          </div>
        )}
      </div>
      {canToggle && (
        <button
          type="button"
          title={fullscreen ? "退出全屏" : "全屏审阅"}
          onClick={() => void app.requestDisplayMode({ mode: fullscreen ? "inline" : "fullscreen" })}
          className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
        >
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      )}
    </div>
  );
}

function Submitted({ phase }: { phase: Extract<Phase, { kind: "submitted" }> }) {
  const [copied, setCopied] = useState(false);
  const label = DECISION_LABEL[phase.session.decision ?? ""] ?? "已提交";
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/50">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div className="flex-1">
          <div className="font-medium">{label}</div>
          <div className="mt-0.5 text-stone-600 dark:text-stone-300">
            {phase.delivered ? "结果已发回对话，agent 会接着处理。" : "结果已保存到文章目录。在对话里回复「继续」，agent 会读取这次的审阅结果。"}
          </div>
        </div>
        {!phase.delivered && (
          <button
            type="button"
            className={buttonClass("secondary", "sm")}
            onClick={() => {
              void navigator.clipboard?.writeText(phase.response).then(() => setCopied(true));
            }}
          >
            <Copy className="size-3.5" /> {copied ? "已复制" : "复制结果"}
          </button>
        )}
      </div>
      <details className="rounded-lg border border-stone-200 text-sm dark:border-stone-800">
        <summary className="cursor-pointer px-3 py-2 text-stone-500">交给 agent 的内容</summary>
        <pre className="whitespace-pre-wrap break-words border-t border-stone-200 px-3 py-2 font-mono text-xs leading-relaxed text-stone-600 dark:border-stone-800 dark:text-stone-300">
          {phase.response}
        </pre>
      </details>
    </div>
  );
}

export function ReviewApp({ views }: { views: ViewMap }) {
  const [toolArgs, setToolArgs] = useState<Record<string, unknown> | null>(null);
  const [handle, setHandle] = useState<ToolHandle | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "waiting" });
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();
  const [pending, setPending] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { app, error } = useApp({
    appInfo: { name: "chat-to-article-review", version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev" },
    capabilities: { availableDisplayModes: ["inline", "fullscreen"] },
    onAppCreated: (created) => {
      created.ontoolinput = (params) => setToolArgs((params.arguments as Record<string, unknown>) ?? {});
      created.ontoolresult = (result) => {
        const r = result as ToolResultLike;
        if (r.isError) return setPhase({ kind: "error", message: textOf(r) || "工具调用失败" });
        const sc = r.structuredContent as Partial<ToolHandle> | undefined;
        if (sc?.sessionId && sc.action) setHandle({ sessionId: sc.sessionId, action: sc.action, title: sc.title ?? "" });
        else setPhase({ kind: "error", message: "工具结果里没有审阅会话。" });
      };
      created.ontoolcancelled = () => setPhase({ kind: "error", message: "这次工具调用被取消了。" });
      created.onhostcontextchanged = (ctx) => setHostContext((prev) => ({ ...prev, ...ctx }));
    },
  });

  useHostStyles(app, app?.getHostContext());
  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  useEffect(() => {
    if (!app || !handle) return;
    let cancelled = false;
    setPhase({ kind: "loading" });
    callTool(app, "review_load", { sessionId: handle.sessionId, action: handle.action, ...(toolArgs ? { args: toolArgs } : {}) })
      .then((res) => {
        if (cancelled) return;
        const session = res.structuredContent as unknown as SessionDetail;
        if (session.status === "submitted")
          setPhase({ kind: "submitted", session, response: session.response ?? "", delivered: true });
        else setPhase({ kind: "ready", session });
      })
      .catch((err: unknown) => !cancelled && setPhase({ kind: "error", message: err instanceof Error ? err.message : String(err) }));
    return () => {
      cancelled = true;
    };
    // toolArgs 只用于 MCP 服务重启后的重建，不触发重新载入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, handle]);

  const submit: SubmitFn = useCallback(
    (actionId, result) => {
      if (!app || phase.kind !== "ready") return;
      const session = phase.session;
      setPending(actionId);
      setSubmitError(null);
      callTool(app, "review_submit", { sessionId: session.id, result: result as Record<string, unknown> })
        .then(async (res) => {
          const sc = res.structuredContent as { response: string; decision: string | null };
          clearDraft(session.id);
          const label = DECISION_LABEL[sc.decision ?? ""] ?? "已提交";
          const delivered = await deliver(app, `【审阅结果】${session.title} · ${label}\n\n${sc.response}`);
          setPhase({ kind: "submitted", session: { ...session, decision: sc.decision ?? undefined, status: "submitted" }, response: sc.response, delivered });
        })
        .catch((err: unknown) => setSubmitError(err instanceof Error ? err.message : String(err)))
        .finally(() => setPending(null));
    },
    [app, phase],
  );

  if (error)
    return (
      <Frame>
        <Status icon={<AlertTriangle className="size-4 text-rose-600" />} title="无法连接到宿主">
          这个界面需要在支持 MCP Apps 的客户端里打开。{error.message}
        </Status>
      </Frame>
    );

  if (phase.kind === "error")
    return (
      <Frame>
        <Status icon={<AlertTriangle className="size-4 text-rose-600" />} title="审阅界面无法打开">
          <span className="whitespace-pre-wrap">{phase.message}</span>
        </Status>
      </Frame>
    );

  if (phase.kind === "waiting" || phase.kind === "loading" || !app)
    return (
      <Frame>
        <Status icon={<Loader2 className="size-4 animate-spin text-stone-400" />} title={handle?.title || "正在准备审阅内容…"}>
          {phase.kind === "loading" ? "正在载入草稿和上下文" : "等待 agent 的工具调用完成"}
        </Status>
      </Frame>
    );

  const session = phase.session;
  const View = views[session.action];
  return (
    <Frame>
      <Header session={session} app={app} hostContext={hostContext} />
      {phase.kind === "submitted" ? (
        <Submitted phase={phase} />
      ) : View ? (
        <SubmitState.Provider value={{ pending, error: submitError }}>
          <View key={session.id} session={session} submit={submit} />
        </SubmitState.Provider>
      ) : (
        <Status icon={<AlertTriangle className="size-4 text-amber-600" />} title={`这个视图不支持 ${session.action}`} />
      )}
    </Frame>
  );
}
