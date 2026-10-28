import clsx from "clsx";
import { Check, Clock, RefreshCw } from "lucide-react";
import type { ReviewVariantsInput, ReviewVariantsResult, SessionDetail, VariantsContext } from "../../../src/shared/actions.ts";
import { ActionBar } from "../components/ActionBar.tsx";
import { AutoTextarea, Badge, Card } from "../components/ui.tsx";
import { useDraft } from "../store.ts";
import type { SubmitFn } from "./types.ts";

export function VariantsView({ session, submit }: { session: SessionDetail<ReviewVariantsInput, VariantsContext>; submit: SubmitFn }) {
  const { input, context } = session;
  const [draft, setDraft] = useDraft(session.id, () => ({
    chosenId: null as string | null,
    feedback: Object.fromEntries(input.variants.map((v) => [v.id, ""])) as Record<string, string>,
    note: "",
  }));
  const chosen = input.variants.find((v) => v.id === draft.chosenId);
  const hasFeedback = Object.values(draft.feedback).some((t) => t.trim()) || !!draft.note.trim();

  const onAction = (id: string) => {
    const result: ReviewVariantsResult = {
      decision: id as ReviewVariantsResult["decision"],
      chosenId: id === "pick" ? draft.chosenId ?? undefined : undefined,
      feedback: input.variants.map((v) => ({ variantId: v.id, text: draft.feedback[v.id].trim() })).filter((f) => f.text),
      note: draft.note.trim() || undefined,
    };
    submit(id, result);
  };

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">
          同一块内容写了 {input.variants.length} 种笔调，挑一版最像你的。喜欢或不喜欢哪里都可以写在下面，没选中的那几版也算，agent 会把这些记成你的写作偏好，后面的块照着写。
        </p>
        {input.context && <p className="text-xs text-stone-500">{input.context}</p>}
        {context.preferences.length > 0 && (
          <div className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500 dark:bg-stone-800/60 dark:text-stone-400">
            本篇已记下的偏好：{context.preferences.map((p) => p.text).join("；")}
          </div>
        )}
        <div className={clsx("grid gap-4", input.variants.length >= 3 ? "@4xl:grid-cols-3" : "@3xl:grid-cols-2")}>
          {input.variants.map((v) => {
            const selected = draft.chosenId === v.id;
            return (
              <Card
                key={v.id}
                className={clsx("flex flex-col", selected && "ring-2 ring-emerald-400 dark:ring-emerald-700")}
                title={
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-stone-400">{v.id}</span>
                    {v.label}
                    {v.voice === "profile" && <Badge tone="violet">按你的偏好</Badge>}
                  </span>
                }
                actions={
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, chosenId: selected ? null : v.id }))}
                    className={clsx(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
                      selected ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300",
                    )}
                  >
                    <Check className="size-3.5" />
                    {selected ? "已选" : "选这版"}
                  </button>
                }
              >
                {v.summary && <p className="mb-3 text-xs text-stone-500">{v.summary}</p>}
                <div className="whitespace-pre-wrap font-serif leading-7 text-stone-700 dark:text-stone-200">{v.body.trim()}</div>
                <div className="mt-4">
                  <AutoTextarea
                    value={draft.feedback[v.id]}
                    onChange={(text) => setDraft((d) => ({ ...d, feedback: { ...d.feedback, [v.id]: text } }))}
                    placeholder="喜欢或不喜欢哪里（可选），例如「开头这句像我会说的」「太正式了」"
                    minRows={1}
                  />
                </div>
              </Card>
            );
          })}
        </div>
        {(context.prev || context.claims.length > 0) && (
          <details className="text-sm text-stone-500">
            <summary className="cursor-pointer select-none">这块用到的主张和前文</summary>
            <ul className="mt-2 space-y-1">
              {context.claims.map((c) => (
                <li key={c.id}>
                  <span className="mr-2 font-mono text-xs text-stone-400">{c.id}</span>
                  {c.text}
                </li>
              ))}
            </ul>
            {context.prev && (
              <p className="mt-3 whitespace-pre-wrap border-l-2 border-stone-200 pl-3 font-serif text-xs leading-6 dark:border-stone-700">
                <span className="mr-2 font-sans text-stone-400">{context.prev.id} ↑</span>
                {context.prev.body.slice(-200)}
              </p>
            )}
          </details>
        )}
      </div>
      <ActionBar
        note={draft.note}
        onNote={(note) => setDraft((d) => ({ ...d, note }))}
        status={chosen ? `选了 ${chosen.id}「${chosen.label}」` : "还没选"}
        onAction={onAction}
        actions={[
          { id: "later", label: "稍后再说", icon: <Clock className="size-4" />, variant: "ghost" },
          { id: "regenerate", label: "都不满意，换一组", icon: <RefreshCw className="size-4" />, disabled: !hasFeedback, hint: "先写下不满意的地方" },
          { id: "pick", label: "就用这版", icon: <Check className="size-4" />, variant: "primary", disabled: !chosen, hint: chosen ? "选定后交给你精修" : "先选一版" },
        ]}
      />
    </>
  );
}
