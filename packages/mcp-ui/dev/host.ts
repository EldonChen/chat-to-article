import { AppBridge, getToolUiResourceUri, PostMessageTransport, type McpUiHostContext } from "@modelcontextprotocol/ext-apps/app-bridge";

type Tool = { name: string; _meta?: Record<string, unknown> };
type ToolResult = { content?: { type: string; text?: string }[]; structuredContent?: unknown; isError?: boolean };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const chat = $<HTMLElement>("chat");

async function rpc<T>(path: string, input: unknown = {}): Promise<T> {
  const res = await fetch(path, { method: "POST", body: JSON.stringify(input) });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

/** 供 e2e 读取：对话里出现的用户消息与模型上下文更新。 */
const log = { messages: [] as string[], modelContext: [] as string[], bridges: [] as AppBridge[] };
(window as unknown as { __host: typeof log }).__host = log;

let dark = false;
/** 模拟不支持 ui/message 的宿主：?nomessage */
const noMessage = new URLSearchParams(location.search).has("nomessage");
const hostContext = (): McpUiHostContext => ({
  theme: dark ? "dark" : "light",
  displayMode: "inline",
  availableDisplayModes: ["inline", "fullscreen"],
  platform: "web",
  locale: "zh-CN",
  styles: { variables: { "--color-text-primary": dark ? "#e7e5e4" : "#1c1917" } as NonNullable<McpUiHostContext["styles"]>["variables"] },
});

function append(cls: string, text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `msg ${cls}`;
  el.textContent = text;
  chat.append(el);
  el.scrollIntoView({ block: "end" });
  return el;
}

const textOf = (r: ToolResult) => (r.content ?? []).map((c) => c.text ?? "").join("\n");

async function callTool(tools: Tool[], name: string, args: Record<string, unknown>) {
  const tool = tools.find((t) => t.name === name);
  const card = document.createElement("div");
  card.className = "tool";
  card.innerHTML = `<details><summary>🔧 ${name}</summary><pre></pre></details>`;
  card.querySelector("pre")!.textContent = JSON.stringify(args, null, 2);
  chat.append(card);

  const resultPromise = rpc<ToolResult>("/mcp/call", { name, arguments: args });
  const uri = tool && getToolUiResourceUri(tool);
  if (!uri) {
    append("agent", textOf(await resultPromise));
    return;
  }

  last = { card, uri, args, resultPromise };
  void resultPromise.then((r) => append("agent", textOf(r)));
  await mountView(card, uri, args, resultPromise);
}

let last: { card: HTMLElement; uri: string; args: Record<string, unknown>; resultPromise: Promise<ToolResult> } | null = null;

async function mountView(card: HTMLElement, uri: string, args: Record<string, unknown>, resultPromise: Promise<ToolResult>) {
  card.querySelector("iframe")?.remove();
  const resource = await rpc<{ contents: { text?: string }[] }>("/mcp/read", { uri });
  const iframe = document.createElement("iframe");
  iframe.title = uri;
  // 和真实宿主一样：脚本可运行，但没有同源权限（localStorage、cookie 都不可用）
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.srcdoc = resource.contents[0]?.text ?? "";
  card.append(iframe);

  const bridge = new AppBridge(
    null,
    { name: "cta-dev-host", version: "dev" },
    noMessage ? { serverTools: {}, openLinks: {} } : { serverTools: {}, message: { text: {} }, updateModelContext: { text: {} }, openLinks: {} },
    { hostContext: hostContext() },
  );
  log.bridges.push(bridge);
  bridge.oncalltool = async (params) => rpc("/mcp/call", params);
  if (!noMessage) bridge.onmessage = async (params) => {
    const text = params.content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
    log.messages.push(text);
    append("user", text);
    append("agent", "（agent 收到审阅结果，继续下一步）");
    return {};
  };
  if (!noMessage) bridge.onupdatemodelcontext = async (params) => {
    const text = (params.content ?? []).map((c) => (c.type === "text" ? c.text : "")).join("\n");
    log.modelContext.push(text);
    append("context", `模型上下文更新：${text.slice(0, 80)}`);
    return {};
  };
  bridge.onrequestdisplaymode = async ({ mode }) => {
    const next = mode === "fullscreen" ? "fullscreen" : "inline";
    card.classList.toggle("fullscreen", next === "fullscreen");
    bridge.setHostContext({ ...hostContext(), displayMode: next });
    return { mode: next };
  };
  bridge.onsizechange = ({ height }) => {
    if (height !== undefined) iframe.style.height = `${Math.ceil(height)}px`;
  };
  bridge.oninitialized = async () => {
    await bridge.sendToolInput({ arguments: args });
    const result = await resultPromise;
    await bridge.sendToolResult(result as Parameters<AppBridge["sendToolResult"]>[0]);
  };
  await new Promise<void>((resolve) => iframe.addEventListener("load", () => resolve(), { once: true }));
  await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
}

const tools = await rpc<Tool[]>("/mcp/tools");
const demos = await rpc<{ name: string; args: Record<string, unknown> }[]>("/mcp/demos");
const select = $<HTMLSelectElement>("demo");
for (const [i, d] of demos.entries()) select.add(new Option(d.name, String(i)));
const params = new URLSearchParams(location.search);
if (params.get("demo")) select.value = String(demos.findIndex((d) => d.name === params.get("demo")));

const applyWidth = () => (chat.style.maxWidth = `${$<HTMLSelectElement>("width").value}px`);
$<HTMLSelectElement>("width").value = params.get("width") ?? "760";
$<HTMLSelectElement>("width").onchange = applyWidth;
applyWidth();

$("call").onclick = () => {
  const demo = demos[Number(select.value)]!;
  append("user", `请帮我处理：${demo.name}`);
  void callTool(tools, demo.name, demo.args).catch((e: unknown) => append("agent", `出错：${String(e)}`));
};
$("remount").onclick = () => {
  if (last) void mountView(last.card, last.uri, last.args, last.resultPromise);
};
$("theme").onclick = () => {
  dark = !dark;
  document.body.classList.toggle("dark", dark);
  for (const b of log.bridges) b.setHostContext(hostContext());
};
if (params.get("theme") === "dark") $("theme").click();
if (params.get("demo")) $("call").click();
