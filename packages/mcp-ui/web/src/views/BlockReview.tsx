import Placeholder from "@tiptap/extension-placeholder";
import { DOMParser } from "@tiptap/pm/model";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import clsx from "clsx";
import {
  Bold,
  Check,
  CheckCheck,
  Clock,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Italic,
  MessageSquarePlus,
  PenLine,
  Plus,
  Redo2,
  Send,
  Trash2,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { BlockContext, BlockFigureRequest, ReviewBlockInput, ReviewBlockResult, SessionDetail } from "../../../src/shared/actions.ts";
import { ActionBar } from "../components/ActionBar.tsx";
import { ExpressChrome, toggleChip, withChips } from "../components/ExpressChrome.tsx";
import { Mermaid } from "../components/Mermaid.tsx";
import { TextDiff, textChanges } from "../components/TextDiff.tsx";
import { AutoTextarea, Badge, buttonClass, inputClass, Tag, useDarkMode } from "../components/ui.tsx";
import { addComment, CommentMark, commentRanges, removeComment } from "../editor/comments.ts";
import { compileRules, LexiconLint, lintDoc } from "../editor/lint.ts";
import { docToMarkdown, markdownToHtml } from "../editor/markdown.ts";
import {
  acceptAll,
  acceptChange,
  changeCards,
  Deletion,
  finalDocJSON,
  Insertion,
  isTracking,
  rejectAll,
  rejectChange,
  setTracking,
  TrackChanges,
  type ChangeCard,
} from "../editor/trackChanges.ts";
import { useDraft, useUi } from "../store.ts";
import { ASPECT_RATIOS, VISUAL_ROLES } from "./OutlineView.tsx";
import { VISUAL_STYLE_PRESETS } from "./PlanView.tsx";
import type { SubmitFn } from "./types.ts";

interface Draft {
  doc: Record<string, unknown> | null;
  comments: Record<string, string>;
  figureIds: string[];
  figureRequests: BlockFigureRequest[];
  note: string;
}

type SideTab = "changes" | "comments" | "figures" | "basis" | "context";

function ToolButton({ onClick, active, disabled, title, children }: { onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition disabled:opacity-40",
        active ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900" : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800",
      )}
    >
      {children}
    </button>
  );
}

function newId() {
  return `cm-${Math.random().toString(36).slice(2, 8)}`;
}

function ChangeItem({ card, editor, focused, onFocus }: { card: ChangeCard; editor: Editor; focused: boolean; onFocus: () => void }) {
  return (
    <li
      onClick={onFocus}
      className={clsx(
        "cursor-pointer rounded-lg border p-3 text-sm transition",
        focused ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-stone-200 hover:border-stone-300 dark:border-stone-700",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between text-xs text-stone-500">
        <span>{card.kind === "insert" ? "插入" : card.kind === "delete" ? "删除" : "替换"}</span>
        <span className="flex gap-1">
          <button
            type="button"
            title="接受这处修订"
            onClick={(e) => {
              e.stopPropagation();
              acceptChange(editor, card);
            }}
            className="rounded p-1 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            title="拒绝这处修订"
            onClick={(e) => {
              e.stopPropagation();
              rejectChange(editor, card);
            }}
            className="rounded p-1 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900"
          >
            <X className="size-3.5" />
          </button>
        </span>
      </div>
      <div className="font-serif leading-relaxed">
        {card.deleted && <del className="track-del">{card.deleted}</del>}
        {card.inserted && <ins className="track-ins">{card.inserted}</ins>}
      </div>
    </li>
  );
}

export function BlockReview({ session, submit }: { session: SessionDetail<ReviewBlockInput, BlockContext>; submit: SubmitFn }) {
  const { input, context } = session;
  const dark = useDarkMode();
  const rules = useMemo(() => compileRules(context.rules), [context.rules]);
  const initialFigureIds = useMemo(
    () => input.figureIds ?? (context.figures ?? []).map((f) => f.id),
    [input.figureIds, context.figures],
  );
  const [draft, setDraft] = useDraft<Draft>(session.id, () => ({
    doc: null,
    comments: {},
    figureIds: initialFigureIds,
    figureRequests: [],
    note: "",
  }));
  const { showMarkup, setShowMarkup } = useUi();
  const [, force] = useState(0);
  const [tab, setTab] = useState<SideTab>(() => ((context.figures?.length ?? 0) > 0 ? "figures" : "changes"));
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [bubble, setBubble] = useState<{ top: number; left: number } | null>(null);
  const [newFigRole, setNewFigRole] = useState<string>("comparison");
  const [newFigKind, setNewFigKind] = useState<string>("raster");
  const [newFigIntent, setNewFigIntent] = useState<string>("");
  const [newFigTakeaway, setNewFigTakeaway] = useState<string>("");
  const [newFigAnchor, setNewFigAnchor] = useState<string>("");
  const [newFigPrompt, setNewFigPrompt] = useState<string>("");
  const [newFigAspectRatio, setNewFigAspectRatio] = useState<string>("16:9");
  const [express, setExpress] = useState(true);
  const [chips, setChips] = useState<string[]>([]);

  const paperRef = useRef<HTMLDivElement>(null);
  const commentInputs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false }),
      Insertion,
      Deletion,
      CommentMark,
      TrackChanges,
      LexiconLint.configure({ rules }),
      Placeholder.configure({ placeholder: "这块还没有正文" }),
    ],
    content: draft.doc ?? markdownToHtml(input.body),
    editorProps: { attributes: { spellcheck: "false" } },
    onUpdate: ({ editor: ed }) => {
      force((n) => n + 1);
      setDraft((d) => ({ ...d, doc: ed.getJSON() as Record<string, unknown> }));
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to, empty } = ed.state.selection;
      const paper = paperRef.current;
      if (empty || !paper) return setBubble(null);
      const start = ed.view.coordsAtPos(from);
      const end = ed.view.coordsAtPos(to);
      const box = paper.getBoundingClientRect();
      setBubble({ top: Math.min(start.top, end.top) - box.top - 40, left: (start.left + end.left) / 2 - box.left });
      const hit = commentRanges(ed.state.doc).find((r) => r.from <= from && to <= r.to);
      if (hit) setActiveComment(hit.id);
    },
  }, [session.id]);

  const doc = editor?.state.doc;
  const cards = useMemo(() => (doc ? changeCards(doc) : []), [doc]);
  const ranges = useMemo(() => (doc ? commentRanges(doc) : []), [doc]);
  const lint = useMemo(() => (doc ? lintDoc(doc, rules) : []), [doc, rules]);
  const bans = lint.filter((h) => h.severity === "ban");
  const finalMarkdown = useMemo(() => (editor && doc ? docToMarkdown(editor.schema.nodeFromJSON(finalDocJSON(doc))) : input.body), [editor, doc, input.body]);
  const agentMarkdown = useMemo(() => (editor ? docToMarkdown(parseMarkdown(editor, input.body)) : input.body), [editor, input.body]);
  const edited = finalMarkdown.trim() !== agentMarkdown.trim();
  const comments = ranges.map((r) => ({ ...r, text: draft.comments[r.id] ?? "" }));
  const filledComments = comments.filter((c) => c.text.trim());
  const paragraphs = finalMarkdown.split(/\n{2,}/).map((p) => p.replace(/\s+/g, "")).filter((p) => p && !p.startsWith("#"));

  const availableFigures = context.availableFigures ?? context.figures ?? [];
  const currentFigureIds = draft.figureIds ?? initialFigureIds;
  const figureRequests = draft.figureRequests ?? [];
  const attachedFigures = availableFigures.filter((f) => currentFigureIds.includes(f.id));
  const figuresChanged = JSON.stringify(currentFigureIds) !== JSON.stringify(initialFigureIds) || figureRequests.length > 0;
  const activeVisualPreset = VISUAL_STYLE_PRESETS.find((p) => p.id === context.visualStyle?.id);

  const addFigureRequest = () => {
    if (!newFigIntent.trim()) return;
    const existingIds = new Set([...availableFigures.map((f) => f.id), ...figureRequests.map((r) => r.id)]);
    let idx = 1;
    let id = `fig-${input.blockId}-${idx}`;
    while (existingIds.has(id)) {
      idx++;
      id = `fig-${input.blockId}-${idx}`;
    }
    const req: BlockFigureRequest = {
      id,
      kind: newFigKind,
      role: newFigRole,
      intent: newFigIntent.trim(),
      takeaway: newFigTakeaway.trim() || undefined,
      anchorSummary: newFigAnchor.trim() || undefined,
      prompt: newFigKind === "raster" ? (newFigPrompt.trim() || undefined) : undefined,
      aspectRatio: newFigKind === "raster" ? newFigAspectRatio : undefined,
    };
    setDraft((d) => ({
      ...d,
      figureIds: [...new Set([...(d.figureIds ?? initialFigureIds), id])],
      figureRequests: [...(d.figureRequests ?? []), req],
    }));
    setNewFigIntent("");
    setNewFigTakeaway("");
    setNewFigAnchor("");
    setNewFigPrompt("");
  };

  const startComment = useCallback(() => {
    if (!editor) return;
    const id = newId();
    if (!addComment(editor, id)) return;
    setDraft((d) => ({ ...d, comments: { ...d.comments, [id]: "" } }));
    setActiveComment(id);
    setTab("comments");
    setBubble(null);
    setTimeout(() => commentInputs.current[id]?.focus(), 50);
  }, [editor, setDraft]);

  const focusRange = (from: number, to: number) => {
    if (!editor) return;
    editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
  };

  if (!editor) return null;
  const tracking = isTracking(editor);

  const onAction = (id: string) => {
    const changes = cards.length
      ? cards.map((c) => ({ kind: c.kind, before: c.deleted, after: c.inserted, context: c.context }))
      : edited
        ? textChanges(agentMarkdown, finalMarkdown)
        : [];
    const result: ReviewBlockResult = {
      decision: id as ReviewBlockResult["decision"],
      finalBody: edited ? finalMarkdown : input.body,
      changes,
      comments: filledComments.map((c) => ({ id: c.id, quote: c.quote, text: c.text.trim() })),
      ...(figuresChanged ? { figureIds: currentFigureIds } : {}),
      ...(figureRequests.length > 0 ? { figureRequests } : {}),
      note: withChips(draft.note, chips),
    };
    submit(id, result);
  };

  const canRevise = edited || filledComments.length > 0 || figuresChanged || !!draft.note.trim() || chips.length > 0;
  const styleTag = activeComment ? `[data-comment="${activeComment}"]{background:rgb(252 211 77 / .75);border-color:#d97706}` : "";

  return (
    <>
      <style>{styleTag}</style>
      <ExpressChrome
        express={express}
        onExpress={setExpress}
        thread={context.readerQuestion || input.instruction || "先读这一块，像读文章一样"}
        hook={context.cognitiveRole || "看不懂就点上面的芯片，不必先划词"}
        structure={input.blockId}
        chips={chips}
        onChip={(id) => setChips((list) => toggleChip(list, id))}
      />
      <div className={clsx("mx-auto grid max-w-7xl gap-6 px-4 py-4", !express && "@4xl:grid-cols-[minmax(0,1fr)_23rem]")}>
        <div className="min-w-0 space-y-4">
          {input.instruction && (
            <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
              <PenLine className="mt-0.5 size-4 shrink-0" />
              <span>
                agent 说明：{input.instruction}
                {context.previousBody != null && (
                  <button type="button" onClick={() => setTab("context")} className="ml-2 underline underline-offset-2">
                    看这一版改了什么
                  </button>
                )}
              </span>
            </div>
          )}
          <div ref={paperRef} className="relative rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-t-xl border-b border-stone-100 bg-white/95 px-3 py-2 backdrop-blur dark:border-stone-800 dark:bg-stone-900/95">
              <ToolButton title="修订模式：开启时你的修改会以插入/删除标记保留" active={tracking} onClick={() => (setTracking(editor, !tracking), force((n) => n + 1))}>
                <PenLine className="size-3.5" /> 修订{tracking ? "：开" : "：关"}
              </ToolButton>
              <ToolButton title="显示或隐藏修订标记（隐藏时看到的是接受全部修订后的样子）" active={showMarkup} onClick={() => setShowMarkup(!showMarkup)}>
                {showMarkup ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} 显示标记
              </ToolButton>
              <ToolButton title="接受全部修订" disabled={!cards.length} onClick={() => acceptAll(editor)}>
                <CheckCheck className="size-3.5" /> 全部接受
              </ToolButton>
              <ToolButton title="拒绝全部修订，回到 agent 的版本" disabled={!cards.length} onClick={() => rejectAll(editor)}>
                <X className="size-3.5" /> 全部拒绝
              </ToolButton>
              <span className="mx-1 h-4 w-px bg-stone-200 dark:bg-stone-700" />
              <ToolButton title="为选中的文字添加批注" disabled={editor.state.selection.empty} onClick={startComment}>
                <MessageSquarePlus className="size-3.5" /> 批注
              </ToolButton>
              <ToolButton title="查看或为本块规划配图（看图写文、以图减文）" active={tab === "figures"} onClick={() => setTab("figures")}>
                <ImageIcon className="size-3.5" /> 配图({attachedFigures.length + figureRequests.length})
              </ToolButton>
              <span className="mx-1 h-4 w-px bg-stone-200 dark:bg-stone-700" />
              <ToolButton title="加粗" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
                <Bold className="size-3.5" />
              </ToolButton>
              <ToolButton title="斜体" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
                <Italic className="size-3.5" />
              </ToolButton>
              <ToolButton title="撤销" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
                <Undo2 className="size-3.5" />
              </ToolButton>
              <ToolButton title="重做" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
                <Redo2 className="size-3.5" />
              </ToolButton>
              <span className="ml-auto text-xs text-stone-400">
                {cards.length} 处修订 · {filledComments.length} 条批注
              </span>
            </div>
            {bubble && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={startComment}
                style={{ top: bubble.top, left: bubble.left }}
                className="absolute z-20 -translate-x-1/2 rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs text-white shadow-lg hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900"
              >
                <MessageSquarePlus className="mr-1 inline size-3.5" />
                批注
              </button>
            )}
            <div className={clsx("review-editor px-10 py-8", !showMarkup && "hide-markup")}>
              {context.prev && (
                <div className="mb-6 border-l-2 border-stone-200 pl-4 font-serif text-sm leading-7 text-stone-400 dark:border-stone-700" title="前一块，只读">
                  <span className="mr-2 font-sans text-xs">{context.prev.id} ↑</span>
                  {context.prev.body}
                </div>
              )}
              <EditorContent editor={editor} />

              {(attachedFigures.length > 0 || figureRequests.length > 0) && (
                <div className="mt-6 space-y-4 border-t border-dashed border-stone-200 pt-5 font-sans dark:border-stone-800">
                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span className="font-medium text-sky-700 dark:text-sky-300">本块配图同屏对照（检查正文是否与图重复啰嗦、画面细节是否咬合）</span>
                    <button type="button" onClick={() => setTab("figures")} className="text-sky-600 hover:underline dark:text-sky-400">
                      管理本块配图 →
                    </button>
                  </div>
                  {attachedFigures.map((fig) => {
                    const vRole = VISUAL_ROLES.find((r) => r.id === fig.role);
                    return (
                      <figure key={fig.id} className="rounded-xl border border-stone-200/90 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-950/60">
                        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-mono font-semibold text-stone-700 dark:text-stone-200">{fig.id}</span>
                          <Badge tone={fig.kind === "raster" ? "violet" : "gray"}>{fig.kind}</Badge>
                          {vRole && <Badge tone={vRole.tone}>{vRole.label}</Badge>}
                          <Badge tone={fig.status === "accepted" ? "green" : fig.status === "drafted" ? "blue" : "amber"}>{fig.status}</Badge>
                          {fig.takeaway && <span className="ml-1 text-emerald-700 dark:text-emerald-300">图眼：{fig.takeaway}</span>}
                        </div>
                        {fig.kind === "mermaid" && fig.content ? (
                          <div className="rounded-lg bg-white p-3 dark:bg-stone-900">
                            <Mermaid source={fig.content} dark={dark} />
                          </div>
                        ) : fig.kind === "svg-chart" && fig.content ? (
                          <div className="rounded-lg bg-white p-3 dark:bg-stone-900">
                            <img alt={fig.alt ?? fig.id} className="mx-auto max-h-72" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(fig.content)}`} />
                          </div>
                        ) : fig.imageDataUrl ? (
                          <div className="rounded-lg bg-white p-3 dark:bg-stone-900">
                            <img alt={fig.alt ?? fig.id} className="mx-auto max-h-80 rounded object-contain" src={fig.imageDataUrl} />
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-stone-200 py-4 text-center text-xs text-stone-400 dark:border-stone-800">
                            {fig.intent ? `规划意图：${fig.intent}` : `图位 ${fig.id}（${fig.status}）待生成图源`}
                            {fig.prompt && <div className="mt-1 font-mono text-[11px] text-violet-500">Prompt: {fig.prompt}</div>}
                          </div>
                        )}
                        {fig.caption && <figcaption className="mt-2 text-center text-xs text-stone-500">{fig.caption}</figcaption>}
                        {fig.anchorSummary && (
                          <div className="mt-2 rounded bg-amber-50/60 px-2.5 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                            <span className="font-semibold">图文联动契约：</span>
                            {fig.anchorSummary}
                          </div>
                        )}
                      </figure>
                    );
                  })}
                  {figureRequests.map((req) => {
                    const vRole = VISUAL_ROLES.find((r) => r.id === req.role);
                    return (
                      <div key={req.id} className="rounded-xl border border-dashed border-sky-300 bg-sky-50/40 p-3 text-xs dark:border-sky-800 dark:bg-sky-950/20">
                        <div className="flex items-center gap-1.5">
                          <Badge tone="blue">新增配图请求</Badge>
                          <span className="font-mono font-semibold">{req.id}</span>
                          <Badge tone={req.kind === "raster" ? "violet" : "gray"}>{req.kind ?? "raster"}</Badge>
                          {vRole && <Badge tone={vRole.tone}>{vRole.label}</Badge>}
                        </div>
                        <p className="mt-1 text-stone-700 dark:text-stone-200">配图意图：{req.intent}</p>
                        {req.takeaway && <p className="mt-0.5 text-emerald-700 dark:text-emerald-300">一秒结论：{req.takeaway}</p>}
                        {req.prompt && <p className="mt-0.5 font-mono text-[11px] text-violet-600 dark:text-violet-300">Prompt：{req.prompt}</p>}
                      </div>
                    );
                  })}
                </div>
              )}

              {context.next && (
                <div className="mt-6 border-l-2 border-stone-200 pl-4 font-serif text-sm leading-7 text-stone-400 dark:border-stone-700" title="后一块，只读">
                  <span className="mr-2 font-sans text-xs">{context.next.id} ↓</span>
                  {context.next.body}
                </div>
              )}
            </div>
          </div>
        </div>

        {!express && (
        <aside className="space-y-3 @4xl:sticky @4xl:top-4 @4xl:self-start">
          <div className="flex flex-wrap gap-1 rounded-lg bg-stone-200/60 p-0.5 dark:bg-stone-800">
            {(
              [
                ["changes", `修订 ${cards.length}`],
                ["comments", `批注 ${comments.length}`],
                ["figures", `配图 ${attachedFigures.length + figureRequests.length}`],
                ["basis", `依据${bans.length ? ` ⚠${bans.length}` : ""}`],
                ["context", "上下文"],
              ] as [SideTab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={clsx(
                  "flex-1 rounded-md px-2 py-1.5 text-xs",
                  tab === id ? "bg-white font-medium shadow-sm dark:bg-stone-700" : "text-stone-500",
                  id === "basis" && bans.length > 0 && tab !== id && "text-rose-600",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "changes" && (
            <div className="space-y-2">
              {cards.length ? (
                <ul className="space-y-2">
                  {cards.map((c) => (
                    <ChangeItem
                      key={c.key}
                      card={c}
                      editor={editor}
                      focused={focusKey === c.key}
                      onFocus={() => {
                        setFocusKey(c.key);
                        focusRange(c.from, c.to);
                      }}
                    />
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed border-stone-300 p-4 text-sm leading-relaxed text-stone-500 dark:border-stone-700">
                  直接在正文里改字即可。{tracking ? "修订模式开着：新写的字带下划线，删掉的字留着删除线，你可以逐处接受或拒绝。" : "修订模式关着：修改不会留痕。"}
                </p>
              )}
              {!cards.length && edited && <p className="text-xs text-stone-500">修订模式关闭期间的修改不会单独列出，但会一并保存。</p>}
            </div>
          )}

          {tab === "comments" && (
            <div className="space-y-2">
              {!comments.length && (
                <p className="rounded-lg border border-dashed border-stone-300 p-4 text-sm leading-relaxed text-stone-500 dark:border-stone-700">
                  选中左边的文字，点「批注」写下意见。agent 会按批注只改这一块。
                </p>
              )}
              {comments.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setActiveComment(c.id);
                    focusRange(c.from, c.to);
                  }}
                  className={clsx(
                    "rounded-lg border bg-white p-3 dark:bg-stone-900",
                    activeComment === c.id ? "border-amber-400 shadow-sm" : "border-stone-200 dark:border-stone-700",
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="line-clamp-2 border-l-2 border-amber-400 pl-2 font-serif text-xs text-stone-500">{c.quote}</span>
                    <button
                      type="button"
                      title="删除批注"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeComment(editor, c.id);
                        setDraft((d) => {
                          const next = { ...d.comments };
                          delete next[c.id];
                          return { ...d, comments: next };
                        });
                      }}
                      className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-rose-600 dark:hover:bg-stone-800"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <textarea
                    ref={(el) => {
                      commentInputs.current[c.id] = el;
                    }}
                    value={c.text}
                    rows={5}
                    placeholder="写下你的意见…"
                    onChange={(e) => setDraft((d) => ({ ...d, comments: { ...d.comments, [c.id]: e.target.value } }))}
                    className="w-full resize-none rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 text-sm outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-800"
                  />
                </div>
              ))}
            </div>
          )}

          {tab === "figures" && (
            <div className="space-y-3 text-xs">
              <section className="rounded-lg border border-sky-200/80 bg-sky-50/40 p-3 dark:border-sky-900/60 dark:bg-sky-950/20">
                <h4 className="mb-1.5 font-semibold text-sky-900 dark:text-sky-200">图文协同「看图写文、以图减文」自查</h4>
                <ul className="list-disc space-y-1 pl-4 leading-relaxed text-stone-600 dark:text-stone-300">
                  <li>
                    <strong>图替文言</strong>：图上已画出的步骤/分屏对比，正文绝不按顺序再啰嗦抄一遍。
                  </li>
                  <li>
                    <strong>看图咬合</strong>：正文直接指代画面里的视觉元素（如「看下图左侧标红的单车道」），点出反差与隐含边界。
                  </li>
                  <li>
                    <strong>锚点对齐</strong>：正文中提到的组件名、序号与图中元素完全一致。
                  </li>
                </ul>
              </section>

              {availableFigures.length > 0 && (
                <section className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                  <h4 className="mb-2 font-medium text-stone-500">挂载已有图位到本块</h4>
                  <div className="space-y-1.5">
                    {availableFigures.map((f) => {
                      const on = currentFigureIds.includes(f.id);
                      const vRole = VISUAL_ROLES.find((r) => r.id === f.role);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() =>
                            setDraft((d) => {
                              const list = d.figureIds ?? initialFigureIds;
                              return { ...d, figureIds: on ? list.filter((x) => x !== f.id) : [...list, f.id] };
                            })
                          }
                          className={clsx(
                            "flex w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left transition",
                            on
                              ? "border-sky-400 bg-sky-50/70 text-stone-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-stone-100"
                              : "border-stone-200 text-stone-500 hover:border-stone-300 dark:border-stone-800",
                          )}
                        >
                          <span className="font-mono font-semibold">{f.id}</span>
                          <Badge tone={f.kind === "raster" ? "violet" : "gray"}>{f.kind}</Badge>
                          {vRole && <Badge tone={vRole.tone}>{vRole.label}</Badge>}
                          <span className="ml-auto">
                            <Badge tone={f.status === "accepted" ? "green" : f.status === "drafted" ? "blue" : "amber"}>{f.status}</Badge>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                <h4 className="mb-2 flex items-center gap-1.5 font-medium text-stone-700 dark:text-stone-200">
                  <Wand2 className="size-3.5 text-violet-600" />
                  觉得这段文字太干？在此块补一张图
                </h4>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ["raster", "AI 多模态生图"],
                        ["svg-chart", "富排版 SVG/数据图"],
                        ["mermaid", "Mermaid 逻辑图"],
                        ["drawio", "draw.io"],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setNewFigKind(k)}
                        className={clsx(
                          "rounded px-1.5 py-0.5 text-[11px] transition",
                          newFigKind === k
                            ? k === "raster"
                              ? "bg-violet-600 text-white"
                              : "bg-sky-600 text-white"
                            : "bg-stone-100 text-stone-500 dark:bg-stone-800",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {VISUAL_ROLES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        title={r.hint}
                        onClick={() => setNewFigRole(r.id)}
                        className={clsx(
                          "rounded px-1.5 py-0.5 text-[11px] transition",
                          newFigRole === r.id ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-500 dark:bg-stone-800",
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <AutoTextarea
                    value={newFigIntent}
                    onChange={setNewFigIntent}
                    placeholder="配图意图（必填）：这里哪段解释太绕口？想画什么对比、生活隐喻或流程来代替文字？"
                    minRows={2}
                    className="text-xs"
                  />
                  <input
                    value={newFigTakeaway}
                    onChange={(e) => setNewFigTakeaway(e.target.value)}
                    placeholder="一秒结论（可选）：读者看一眼这张图能立刻明白什么？"
                    className={clsx(inputClass, "text-xs")}
                  />
                  {newFigKind === "raster" && (
                    <div className="space-y-1.5 rounded-md border border-violet-200/80 bg-violet-50/40 p-2 dark:border-violet-900/60 dark:bg-violet-950/20">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-violet-800 dark:text-violet-300">多模态生图描述（可留空由 Agent 自动组装）</span>
                        <div className="flex gap-1">
                          {ASPECT_RATIOS.map((ar) => (
                            <button
                              key={ar}
                              type="button"
                              onClick={() => setNewFigAspectRatio(ar)}
                              className={clsx(
                                "rounded px-1 py-0.5 font-mono text-[10px]",
                                newFigAspectRatio === ar ? "bg-violet-600 text-white" : "bg-white text-stone-500 dark:bg-stone-800",
                              )}
                            >
                              {ar}
                            </button>
                          ))}
                        </div>
                      </div>
                      <AutoTextarea
                        value={newFigPrompt}
                        onChange={setNewFigPrompt}
                        placeholder="描述画面主体与分屏对比细节…"
                        minRows={2}
                        className="font-mono text-xs"
                      />
                      {activeVisualPreset && !newFigPrompt.includes(activeVisualPreset.promptPrefix) && (
                        <button
                          type="button"
                          onClick={() => setNewFigPrompt(`${activeVisualPreset.promptPrefix}. ${(newFigPrompt || newFigIntent).trim()}`.trim())}
                          className="text-[11px] text-violet-700 hover:underline dark:text-violet-300"
                        >
                          + 注入「{activeVisualPreset.name}」画风前缀
                        </button>
                      )}
                    </div>
                  )}
                  <input
                    value={newFigAnchor}
                    onChange={(e) => setNewFigAnchor(e.target.value)}
                    placeholder="图文联动契约（可选）：图画好后，本块哪句啰嗦话可以删掉？"
                    className={clsx(inputClass, "text-xs")}
                  />
                  <button
                    type="button"
                    disabled={!newFigIntent.trim()}
                    onClick={addFigureRequest}
                    className={clsx(buttonClass("secondary", "sm"), "w-full justify-center")}
                  >
                    <Plus className="size-3.5 text-sky-600" /> 加入本块配图需求清单
                  </button>
                </div>

                {figureRequests.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-stone-100 pt-2.5 dark:border-stone-800">
                    {figureRequests.map((req) => (
                      <li key={req.id} className="flex items-start justify-between gap-2 rounded bg-sky-50/60 p-2 dark:bg-sky-950/30">
                        <div>
                          <div className="font-mono font-semibold text-sky-800 dark:text-sky-200">
                            {req.id} · {req.role} ({req.kind})
                          </div>
                          <div className="text-stone-600 dark:text-stone-300">{req.intent}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              figureIds: (d.figureIds ?? []).filter((id) => id !== req.id),
                              figureRequests: (d.figureRequests ?? []).filter((r) => r.id !== req.id),
                            }))
                          }
                          className="text-stone-400 hover:text-rose-600"
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === "basis" && (
            <div className="space-y-3 text-sm">
              {(context.readerQuestion || context.cognitiveRole) && (
                <section className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <h4 className="mb-1 text-xs font-medium text-emerald-800 dark:text-emerald-300">本节认知任务</h4>
                  {context.cognitiveRole && <div className="text-xs font-medium text-stone-700 dark:text-stone-200">{context.cognitiveRole}</div>}
                  {context.readerQuestion && <div className="mt-1 text-xs text-stone-600 dark:text-stone-300">回应读者疑问：{context.readerQuestion}</div>}
                </section>
              )}
              <section className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                <h4 className="mb-2 text-xs font-medium text-stone-500">这块只能使用的主张</h4>
                <ul className="space-y-1.5">
                  {context.claims.map((c) => (
                    <li key={c.id} className="space-y-0.5">
                      <div className="flex gap-2">
                        <span className="font-mono text-xs text-stone-400">{c.id}</span>
                        {c.role && <Badge tone="blue">{c.role}</Badge>}
                        <span className={clsx("flex-1", c.status !== "accepted" && "text-amber-700")}>{c.text}</span>
                        {c.status !== "accepted" && <Badge tone="amber">{c.status}</Badge>}
                      </div>
                      {c.gapNote && <div className="pl-6 text-xs text-amber-600">缺口提示：{c.gapNote}</div>}
                    </li>
                  ))}
                  {!context.claims.length && <li className="text-stone-400">没有列出主张</li>}
                </ul>
              </section>
              <section className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                <h4 className="mb-2 text-xs font-medium text-stone-500">词表（按修订后的文字检查）</h4>
                {lint.length ? (
                  <ul className="space-y-1.5">
                    {lint.map((h) => (
                      <li key={`${h.id}-${h.from}`} className="flex cursor-pointer items-center gap-2" onClick={() => focusRange(h.from, h.to)}>
                        <Badge tone={h.severity === "ban" ? "red" : "amber"}>{h.severity === "ban" ? "禁用" : "观察"}</Badge>
                        <span className="font-serif">{h.text}</span>
                        {h.replacement && <span className="text-xs text-sky-600">→ {h.replacement}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-stone-400">{context.rules.length ? "没有命中" : "没有读到词表（找不到 skill 目录）"}</p>
                )}
                {bans.length > 0 && <p className="mt-2 text-xs text-rose-600">禁用说法会挡住 accept-block。可以直接改掉，或批注让 agent 只重写那一句。</p>}
              </section>
              <section className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                <h4 className="mb-2 text-xs font-medium text-stone-500">风格 r{context.styleRevision ?? "?"}</h4>
                {context.styleRules.length ? (
                  <ul className="space-y-1">
                    {context.styleRules.map((r) => (
                      <li key={r.id} className="flex gap-2">
                        <span className="font-mono text-xs text-stone-400">{r.id}</span>
                        <span>{r.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-stone-400">没有生效规则</p>
                )}
                {context.paragraph && (
                  <div className="mt-3">
                    <div className="mb-1 text-xs text-stone-500">
                      段落字数（建议 {context.paragraph.minChars}–{context.paragraph.maxChars}）
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {paragraphs.map((p, i) => {
                        const out = (context.paragraph?.minChars && p.length < context.paragraph.minChars) || (context.paragraph?.maxChars && p.length > context.paragraph.maxChars);
                        return (
                          <Tag key={i}>
                            <span className={out ? "text-amber-600" : ""}>
                              第{i + 1}段 {p.length}
                            </span>
                          </Tag>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === "context" && (
            <div className="space-y-3 text-sm">
              {context.previousBody != null && (
                <section className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                  <h4 className="mb-2 text-xs font-medium text-stone-500">agent 这一版相对上一版</h4>
                  <TextDiff before={context.previousBody} after={input.body} />
                </section>
              )}
              {[context.prev, context.next].map((n, i) =>
                n ? (
                  <section key={n.id} className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                    <h4 className="mb-2 text-xs font-medium text-stone-500">
                      {i === 0 ? "前一块" : "后一块"} {n.id}（只读）
                    </h4>
                    <p className="whitespace-pre-wrap font-serif leading-7 text-stone-600 dark:text-stone-300">{n.body}</p>
                  </section>
                ) : null,
              )}
              {!context.prev && !context.next && context.previousBody == null && <p className="text-stone-400">这是文章里唯一的块。</p>}
            </div>
          )}
        </aside>
        )}
      </div>

      <ActionBar
        note={draft.note}
        onNote={(note) => setDraft((d) => ({ ...d, note }))}
        status={
          edited || figuresChanged
            ? `你改了 ${cards.length || "若干"} 处${figureRequests.length ? `，新增 ${figureRequests.length} 项配图需求` : ""}，提交时会写进 blocks/${input.blockId}.md`
            : "还没有修改"
        }
        onAction={onAction}
        actions={[
          { id: "later", label: "稍后再说", icon: <Clock className="size-4" />, variant: "ghost" },
          {
            id: "revise",
            label: figureRequests.length ? "按批注与配图需求修改" : "按批注修改",
            icon: <Send className="size-4" />,
            disabled: !canRevise,
            hint: canRevise ? "把修订、批注和配图需求交给 agent，生图并精简这一块" : "先改字、加批注、提配图需求或写整体意见",
          },
          {
            id: "accept",
            label: "接受这块",
            icon: <Check className="size-4" />,
            variant: "primary",
            disabled: bans.length > 0,
            hint: bans.length ? `还有 ${bans.length} 处禁用说法` : edited ? "保存你的修改并接受" : "接受 agent 的版本",
          },
        ]}
      />
    </>
  );
}

function parseMarkdown(editor: Editor, markdown: string) {
  const el = document.createElement("div");
  el.innerHTML = markdownToHtml(markdown);
  return DOMParser.fromSchema(editor.schema).parse(el);
}
