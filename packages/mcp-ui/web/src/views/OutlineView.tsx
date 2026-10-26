import clsx from "clsx";
import { ArrowDown, ArrowUp, Check, Image, Minus, Plus, Send, Trash2 } from "lucide-react";
import type { OutlineContext, ReviewOutlineInput, ReviewOutlineResult, SessionDetail } from "../../../src/shared/actions.ts";
import { ActionBar } from "../components/ActionBar.tsx";
import { AutoTextarea, Badge, Card, FieldComment, inputClass, Tag } from "../components/ui.tsx";
import { useDraft } from "../store.ts";
import type { SubmitFn } from "./types.ts";

type Section = ReviewOutlineResult["sections"][number];

const pad = (n: number) => `b${String(n).padStart(3, "0")}`;

export function OutlineView({ session, submit }: { session: SessionDetail<ReviewOutlineInput, OutlineContext>; submit: SubmitFn }) {
  const { input, context } = session;
  const [draft, setDraft] = useDraft(session.id, () => ({
    sections: input.sections.map((s) => ({ ...s, figureIds: s.figureIds ?? [], blockIds: s.blockIds ?? [] })) as Section[],
    comments: {} as Record<string, string>,
    note: "",
  }));
  const sections = draft.sections;
  const setSections = (fn: (s: Section[]) => Section[]) => setDraft((d) => ({ ...d, sections: fn(d.sections) }));
  const update = (id: string, patch: Partial<Section>) => setSections((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const move = (index: number, delta: number) =>
    setSections((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  const usedBlocks = () => new Set(sections.flatMap((s) => s.blockIds ?? []));
  const nextBlock = () => {
    const used = usedBlocks();
    let n = 1;
    while (used.has(pad(n))) n++;
    return pad(n);
  };
  const accepted = context.claims.filter((c) => c.status === "accepted");
  const usedClaims = new Set(sections.flatMap((s) => s.claimIds));
  const uncovered = accepted.filter((c) => !usedClaims.has(c.id));
  const figures = [...(input.figures ?? []), ...context.figures.filter((f) => !input.figures?.some((x) => x.id === f.id))];
  const comments = Object.entries(draft.comments)
    .filter(([, t]) => t.trim())
    .map(([sectionId, text]) => ({ sectionId, text: text.trim() }));
  const noBlocks = sections.filter((s) => !s.blockIds?.length);

  const onAction = (id: string) => {
    const result: ReviewOutlineResult = { decision: id as ReviewOutlineResult["decision"], sections, comments, note: draft.note.trim() || undefined };
    submit(id, result);
  };

  return (
    <>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-4 @4xl:grid-cols-[minmax(0,1fr)_19rem]">
        <ol className="space-y-3">
          {sections.map((s, i) => (
            <li key={s.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-medium text-stone-500 dark:bg-stone-800">{i + 1}</span>
                <input value={s.title} onChange={(e) => update(s.id, { title: e.target.value })} className={clsx(inputClass, "font-medium")} />
                <div className="flex shrink-0 gap-0.5 text-stone-400">
                  <button type="button" title="上移" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-stone-800">
                    <ArrowUp className="size-4" />
                  </button>
                  <button type="button" title="下移" disabled={i === sections.length - 1} onClick={() => move(i, 1)} className="rounded p-1 hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-stone-800">
                    <ArrowDown className="size-4" />
                  </button>
                  <button type="button" title="删掉这一节" onClick={() => setSections((list) => list.filter((x) => x.id !== s.id))} className="rounded p-1 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2 pl-8">
                <AutoTextarea value={s.summary ?? ""} onChange={(summary) => update(s.id, { summary })} placeholder="这一节打算写什么" minRows={1} className="text-stone-600 dark:text-stone-300" />
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs text-stone-500">主张</span>
                  {accepted.map((c) => {
                    const on = s.claimIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        title={c.text}
                        onClick={() => update(s.id, { claimIds: on ? s.claimIds.filter((x) => x !== c.id) : [...s.claimIds, c.id] })}
                        className={clsx(
                          "rounded-md px-1.5 py-0.5 font-mono text-xs ring-1 ring-inset",
                          on ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900" : "text-stone-400 ring-stone-200 hover:text-stone-600 dark:ring-stone-700",
                        )}
                      >
                        {c.id}
                      </button>
                    );
                  })}
                  {s.claimIds
                    .filter((id) => !accepted.some((c) => c.id === id))
                    .map((id) => (
                      <Badge key={id} tone="amber">{id} 未采用</Badge>
                    ))}
                </div>
                {figures.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-stone-500">图</span>
                    {figures.map((f) => {
                      const on = s.figureIds?.includes(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          title={f.caption}
                          onClick={() => update(s.id, { figureIds: on ? s.figureIds?.filter((x) => x !== f.id) : [...(s.figureIds ?? []), f.id] })}
                          className={clsx(
                            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ring-1 ring-inset",
                            on ? "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900" : "text-stone-400 ring-stone-200 dark:ring-stone-700",
                          )}
                        >
                          <Image className="size-3" />
                          {f.id}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs text-stone-500">块</span>
                  {(s.blockIds ?? []).map((b) => (
                    <Tag key={b} mono>
                      {b}
                      {context.blockStatus[b] && context.blockStatus[b] !== "missing" && <span className="ml-1 text-stone-400">{context.blockStatus[b]}</span>}
                    </Tag>
                  ))}
                  <button type="button" title="多拆一块" onClick={() => update(s.id, { blockIds: [...(s.blockIds ?? []), nextBlock()] })} className="rounded p-0.5 text-stone-400 hover:text-emerald-600">
                    <Plus className="size-3.5" />
                  </button>
                  {!!s.blockIds?.length && (
                    <button type="button" title="少一块" onClick={() => update(s.id, { blockIds: s.blockIds?.slice(0, -1) })} className="rounded p-0.5 text-stone-400 hover:text-rose-600">
                      <Minus className="size-3.5" />
                    </button>
                  )}
                  <span className="ml-auto">
                    <FieldComment value={draft.comments[s.id] ?? ""} onChange={(text) => setDraft((d) => ({ ...d, comments: { ...d.comments, [s.id]: text } }))} />
                  </span>
                </div>
              </div>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                let n = sections.length + 1;
                while (sections.some((s) => s.id === `s${n}`)) n++;
                setSections((list) => [...list, { id: `s${n}`, title: "新的一节", claimIds: [], figureIds: [], blockIds: [nextBlock()], summary: "" }]);
              }}
              className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-stone-300 py-3 text-sm text-stone-500 hover:border-emerald-400 hover:text-emerald-600 dark:border-stone-700"
            >
              <Plus className="size-4" /> 加一节
            </button>
          </li>
        </ol>

        <aside className="space-y-4 @4xl:sticky @4xl:top-4 @4xl:self-start">
          <Card title="主张覆盖">
            {uncovered.length ? (
              <ul className="space-y-1.5 text-sm">
                {uncovered.map((c) => (
                  <li key={c.id} className="flex gap-2 text-amber-700 dark:text-amber-300">
                    <span className="font-mono text-xs">{c.id}</span>
                    <span className="line-clamp-2">{c.text}</span>
                  </li>
                ))}
                <li className="text-xs text-stone-500">这些已采用的主张没有放进任何一节。</li>
              </ul>
            ) : (
              <p className="text-sm text-stone-500">已采用的 {accepted.length} 条主张都有位置。</p>
            )}
          </Card>
          {figures.length > 0 && (
            <Card title="图位">
              <ul className="space-y-1.5 text-sm">
                {figures.map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-stone-400">{f.id}</span>
                    <span className="flex-1 truncate">{f.caption || "（无图注）"}</span>
                    <Badge>{"status" in f ? String(f.status) : "planned"}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {input.rationale && (
            <Card title="agent 的理由">
              <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">{input.rationale}</p>
            </Card>
          )}
        </aside>
      </div>
      <ActionBar
        note={draft.note}
        onNote={(note) => setDraft((d) => ({ ...d, note }))}
        status={noBlocks.length ? `「${noBlocks.map((s) => s.title).join("」「")}」还没有块` : `${sections.length} 节，${usedBlocks().size} 块`}
        onAction={onAction}
        actions={[
          { id: "revise", label: "让 agent 重排", icon: <Send className="size-4" />, disabled: !comments.length && !draft.note.trim(), hint: "需要批注或整体意见" },
          { id: "confirm", label: "确认大纲", icon: <Check className="size-4" />, variant: "primary", disabled: noBlocks.length > 0 || sections.some((s) => !s.title.trim()) },
        ]}
      />
    </>
  );
}
