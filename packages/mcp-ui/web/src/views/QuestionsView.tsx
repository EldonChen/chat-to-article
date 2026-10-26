import clsx from "clsx";
import { Check, SkipForward, Sparkles } from "lucide-react";
import type { AskQuestionsInput, AskQuestionsResult, SessionDetail } from "../../../src/shared/actions.ts";
import { ActionBar } from "../components/ActionBar.tsx";
import { Badge, Card, inputClass } from "../components/ui.tsx";
import { useDraft } from "../store.ts";
import type { SubmitFn } from "./types.ts";

type Answer = { optionIds: string[]; custom: string; unsure: boolean };

export function QuestionsView({ session, submit }: { session: SessionDetail<AskQuestionsInput, unknown>; submit: SubmitFn }) {
  const { input } = session;
  const [draft, setDraft] = useDraft(session.id, () => ({
    answers: Object.fromEntries(input.questions.map((q) => [q.id, { optionIds: q.recommended ? [q.recommended] : [], custom: "", unsure: false }])) as Record<string, Answer>,
    note: "",
  }));
  const update = (id: string, patch: Partial<Answer>) => setDraft((d) => ({ ...d, answers: { ...d.answers, [id]: { ...d.answers[id], ...patch } } }));
  const answered = (q: AskQuestionsInput["questions"][number]) => {
    const a = draft.answers[q.id];
    return !!a && (a.unsure || a.optionIds.length > 0 || !!a.custom.trim());
  };
  const missing = input.questions.filter((q) => !answered(q)).length;

  const onAction = (id: string) => {
    const result: AskQuestionsResult = {
      decision: id as AskQuestionsResult["decision"],
      answers: input.questions.map((q) => {
        const a = draft.answers[q.id];
        return { questionId: q.id, optionIds: a.optionIds, custom: a.custom.trim() || undefined, unsure: a.unsure || undefined };
      }),
      note: draft.note.trim() || undefined,
    };
    submit(id, result);
  };

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {input.context && <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">{input.context}</p>}
        {input.questions.map((q, index) => {
          const a = draft.answers[q.id];
          return (
            <Card key={q.id} title={<span><span className="mr-2 text-stone-400">{index + 1}.</span>{q.prompt}</span>} actions={answered(q) ? <Badge tone="green"><Check className="size-3" />已答</Badge> : <Badge>待答</Badge>}>
              <div className="grid gap-2 @md:grid-cols-2">
                {q.options.map((o) => {
                  const on = a.optionIds.includes(o.id);
                  return (
                    <button
                      type="button"
                      key={o.id}
                      onClick={() =>
                        update(q.id, {
                          unsure: false,
                          optionIds: q.multiple ? (on ? a.optionIds.filter((x) => x !== o.id) : [...a.optionIds, o.id]) : on ? [] : [o.id],
                        })
                      }
                      className={clsx(
                        "rounded-lg border p-3 text-left text-sm transition",
                        on ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-500/20 dark:border-emerald-700 dark:bg-emerald-950/40" : "border-stone-200 hover:border-stone-300 dark:border-stone-700",
                      )}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <span className={clsx("flex size-4 shrink-0 items-center justify-center border", q.multiple ? "rounded" : "rounded-full", on ? "border-emerald-500 bg-emerald-500 text-white" : "border-stone-300")}>
                          {on && <Check className="size-3" />}
                        </span>
                        {o.label}
                        {q.recommended === o.id && (
                          <Badge tone="violet">
                            <Sparkles className="size-3" />推荐
                          </Badge>
                        )}
                      </div>
                      {o.description && <p className="mt-1 pl-6 text-xs leading-relaxed text-stone-500">{o.description}</p>}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {q.allowCustom !== false && (
                  <input value={a.custom} onChange={(e) => update(q.id, { custom: e.target.value, unsure: false })} placeholder="都不合适？自己写" className={clsx(inputClass, "flex-1")} />
                )}
                <label className="flex items-center gap-1.5 text-xs text-stone-500">
                  <input type="checkbox" checked={a.unsure} onChange={(e) => update(q.id, { unsure: e.target.checked, optionIds: e.target.checked ? [] : a.optionIds })} />
                  不确定，让 agent 再问
                </label>
              </div>
            </Card>
          );
        })}
      </div>
      <ActionBar
        note={draft.note}
        onNote={(note) => setDraft((d) => ({ ...d, note }))}
        status={missing ? `还有 ${missing} 个问题没回答` : "都回答了"}
        onAction={onAction}
        actions={[
          { id: "skip", label: "先跳过", icon: <SkipForward className="size-4" />, variant: "ghost" },
          { id: "submit", label: "提交回答", icon: <Check className="size-4" />, variant: "primary", disabled: missing > 0, hint: missing ? "每个问题选一项、自己写或勾选「不确定」" : undefined },
        ]}
      />
    </>
  );
}
