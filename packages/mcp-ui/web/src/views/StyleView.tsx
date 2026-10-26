import clsx from "clsx";
import { Check, Clock } from "lucide-react";
import type { ReviewStyleCandidatesInput, ReviewStyleCandidatesResult, SessionDetail } from "../../../src/shared/actions.ts";
import { ActionBar } from "../components/ActionBar.tsx";
import { AutoTextarea, Segmented } from "../components/ui.tsx";
import { useDraft } from "../store.ts";
import type { SubmitFn } from "./types.ts";

type Choice = "keep" | "reject" | "skip";

export function StyleView({ session, submit }: { session: SessionDetail<ReviewStyleCandidatesInput, unknown>; submit: SubmitFn }) {
  const { input } = session;
  const [draft, setDraft] = useDraft(session.id, () => ({
    rows: Object.fromEntries(input.candidates.map((c) => [c.id, { text: c.text, choice: "skip" as Choice }])),
    note: "",
  }));
  const set = (id: string, patch: Partial<{ text: string; choice: Choice }>) => setDraft((d) => ({ ...d, rows: { ...d.rows, [id]: { ...d.rows[id], ...patch } } }));
  const kept = input.candidates.filter((c) => draft.rows[c.id].choice === "keep");
  const rejected = input.candidates.filter((c) => draft.rows[c.id].choice === "reject");

  const onAction = (id: string) => {
    const result: ReviewStyleCandidatesResult = {
      decision: id as ReviewStyleCandidatesResult["decision"],
      selected: kept.map((c) => ({ id: c.id, text: draft.rows[c.id].text.trim() })),
      rejected: rejected.map((c) => c.id),
      note: draft.note.trim() || undefined,
    };
    submit(id, result);
  };

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-4">
        <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">
          这些是从你最近的修改里总结出的写作习惯。选「写进风格」的会成为下一版风格的规则，以后每篇文章都会遵守；措辞可以直接改。
        </p>
        {input.candidates.map((c) => {
          const row = draft.rows[c.id];
          return (
            <div
              key={c.id}
              className={clsx(
                "rounded-xl border bg-white p-4 shadow-sm dark:bg-stone-900",
                row.choice === "keep" ? "border-emerald-300 dark:border-emerald-800" : row.choice === "reject" ? "border-stone-200 opacity-60 dark:border-stone-800" : "border-stone-200 dark:border-stone-800",
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-xs text-stone-400">{c.id}</span>
                <div className="ml-auto">
                  <Segmented
                    value={row.choice}
                    onChange={(choice) => set(c.id, { choice })}
                    items={[
                      { id: "keep", label: "写进风格", tone: "green" },
                      { id: "skip", label: "再观察" },
                      { id: "reject", label: "不是我的习惯", tone: "red" },
                    ]}
                  />
                </div>
              </div>
              <AutoTextarea value={row.text} onChange={(text) => set(c.id, { text })} minRows={1} />
              {c.evidence && <p className="mt-2 border-l-2 border-stone-200 pl-3 text-xs leading-relaxed text-stone-500 dark:border-stone-700">{c.evidence}</p>}
              {!!c.exemplars?.length && (
                <ul className="mt-2 space-y-1">
                  {c.exemplars.map((e, i) => (
                    <li key={i} className="rounded-md bg-stone-50 px-2 py-1 font-serif text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                      {e}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <ActionBar
        note={draft.note}
        onNote={(note) => setDraft((d) => ({ ...d, note }))}
        status={`写进风格 ${kept.length} 条 · 不要 ${rejected.length} 条`}
        onAction={onAction}
        actions={[
          { id: "later", label: "稍后再说", icon: <Clock className="size-4" />, variant: "ghost" },
          { id: "submit", label: "提交", icon: <Check className="size-4" />, variant: "primary", disabled: !kept.length && !rejected.length, hint: "至少决定一条" },
        ]}
      />
    </>
  );
}
