import clsx from "clsx";
import { Check, Pause, Plus, Send, X } from "lucide-react";
import { useState } from "react";
import type { PlanContext, ReviewWritingPlanInput, ReviewWritingPlanResult, SessionDetail, WritingPlanFields } from "../../../src/shared/actions.ts";
import { ActionBar } from "../components/ActionBar.tsx";
import { AutoTextarea, Badge, Card, FieldComment, inputClass } from "../components/ui.tsx";
import { useDraft } from "../store.ts";
import type { SubmitFn } from "./types.ts";

const AXES: { id: string; label: string; poles: [string, string] }[] = [
  { id: "explanationPace", label: "解释节奏", poles: ["一步一步铺垫", "直接给结论"] },
  { id: "abstraction", label: "抽象程度", poles: ["从具体例子出发", "从概念框架出发"] },
  { id: "stance", label: "立场", poles: ["克制、中立", "鲜明表态"] },
  { id: "perspective", label: "视角", poles: ["第一人称经历", "旁观者分析"] },
  { id: "readerAssumption", label: "读者假设", poles: ["当新手", "当同行"] },
  { id: "structure", label: "结构", poles: ["线性叙事", "模块化、可跳读"] },
  { id: "tone", label: "语气", poles: ["正式", "口语"] },
];

const GENRES = ["工程实践文章", "解释性文章", "复盘", "教程", "观点文章", "调研报告", "设计文档"];

export function PlanView({ session, submit }: { session: SessionDetail<ReviewWritingPlanInput, PlanContext>; submit: SubmitFn }) {
  const { input, context } = session;
  const [draft, setDraft] = useDraft(session.id, () => ({
    plan: structuredClone(input.plan) as WritingPlanFields,
    comments: {} as Record<string, string>,
    note: "",
  }));
  const [newGenre, setNewGenre] = useState("");
  const plan = draft.plan;
  const setPlan = (patch: Partial<WritingPlanFields>) => setDraft((d) => ({ ...d, plan: { ...d.plan, ...patch } }));
  const comment = (field: string) => (
    <FieldComment value={draft.comments[field] ?? ""} onChange={(text) => setDraft((d) => ({ ...d, comments: { ...d.comments, [field]: text } }))} />
  );
  const changed = JSON.stringify(plan) !== JSON.stringify(input.plan);
  const comments = Object.entries(draft.comments)
    .filter(([, t]) => t.trim())
    .map(([field, text]) => ({ field, text: text.trim() }));
  const axisIds = [...new Set([...AXES.map((a) => a.id), ...Object.keys(plan.styleAxes)])];

  const onAction = (id: string) => {
    const result: ReviewWritingPlanResult = { decision: id as ReviewWritingPlanResult["decision"], plan, comments, note: draft.note.trim() || undefined };
    submit(id, result);
  };

  return (
    <>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-4 @4xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <Card title="文体与读者">
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-medium text-stone-500">文体（可组合）</div>
                <div className="flex flex-wrap gap-2">
                  {[...new Set([...GENRES, ...plan.genre])].map((g) => {
                    const on = plan.genre.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setPlan({ genre: on ? plan.genre.filter((x) => x !== g) : [...plan.genre, g] })}
                        className={clsx(
                          "rounded-full border px-3 py-1 text-sm transition",
                          on ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200" : "border-stone-200 text-stone-500 hover:border-stone-300 dark:border-stone-700",
                        )}
                      >
                        {g}
                      </button>
                    );
                  })}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (newGenre.trim()) setPlan({ genre: [...plan.genre, newGenre.trim()] });
                      setNewGenre("");
                    }}
                  >
                    <input value={newGenre} onChange={(e) => setNewGenre(e.target.value)} placeholder="+ 其他" className="w-24 rounded-full border border-dashed border-stone-300 bg-transparent px-3 py-1 text-sm outline-none dark:border-stone-700" />
                  </form>
                </div>
                {comment("genre")}
              </div>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-stone-500">读者</div>
                <AutoTextarea value={plan.audience} onChange={(audience) => setPlan({ audience })} minRows={1} />
                {comment("audience")}
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-stone-500">目的：读完能做什么</div>
                <AutoTextarea value={plan.purpose} onChange={(purpose) => setPlan({ purpose })} minRows={1} />
                {comment("purpose")}
              </label>
            </div>
          </Card>

          <Card title="偏好轴" actions={<span className="text-xs text-stone-400">每条写这篇的倾向，空着表示不限定</span>}>
            <div className="divide-y divide-stone-100 dark:divide-stone-800">
              {axisIds.map((id) => {
                const axis = AXES.find((a) => a.id === id);
                return (
                  <div key={id} className="grid gap-2 py-3 first:pt-0 last:pb-0 @md:grid-cols-[8rem_minmax(0,1fr)]">
                    <div>
                      <div className="text-sm font-medium">{axis?.label ?? id}</div>
                      {axis && <div className="text-xs text-stone-400">{axis.poles[0]} ↔ {axis.poles[1]}</div>}
                    </div>
                    <div>
                      <AutoTextarea
                        value={plan.styleAxes[id] ?? ""}
                        onChange={(v) => setPlan({ styleAxes: { ...plan.styleAxes, [id]: v } })}
                        placeholder={axis ? `例如：偏「${axis.poles[0]}」，因为…` : ""}
                        minRows={1}
                      />
                      {comment(`styleAxes.${id}`)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="行文方案">
            {!!input.approachOptions?.length && (
              <div className="mb-3 grid gap-2 @md:grid-cols-2">
                {input.approachOptions.map((o) => {
                  const on = plan.approach === (o.description ?? o.label);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setPlan({ approach: o.description ?? o.label })}
                      className={clsx("rounded-lg border p-3 text-left text-sm", on ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40" : "border-stone-200 hover:border-stone-300 dark:border-stone-700")}
                    >
                      <div className="font-medium">{o.label}</div>
                      {o.description && <p className="mt-1 text-xs leading-relaxed text-stone-500">{o.description}</p>}
                    </button>
                  );
                })}
              </div>
            )}
            <AutoTextarea value={plan.approach} onChange={(approach) => setPlan({ approach })} minRows={3} />
            {comment("approach")}
          </Card>

          <Card title="待定问题">
            <ul className="space-y-2">
              {plan.openQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-2">
                  <input value={q} onChange={(e) => setPlan({ openQuestions: plan.openQuestions.map((x, j) => (j === i ? e.target.value : x)) })} className={inputClass} />
                  <button type="button" title="删掉这个问题" onClick={() => setPlan({ openQuestions: plan.openQuestions.filter((_, j) => j !== i) })} className="mt-2 text-stone-400 hover:text-rose-600">
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setPlan({ openQuestions: [...plan.openQuestions, ""] })} className="mt-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-emerald-600">
              <Plus className="size-4" /> 加一个问题
            </button>
          </Card>
        </div>

        <aside className="space-y-4 @4xl:sticky @4xl:top-4 @4xl:self-start">
          <Card title="这篇文章">
            <dl className="space-y-2 text-sm">
              {input.title && (
                <div>
                  <dt className="text-xs text-stone-500">标题</dt>
                  <dd className="font-medium">{input.title}</dd>
                </div>
              )}
              {input.topic && (
                <div>
                  <dt className="text-xs text-stone-500">主题</dt>
                  <dd>{input.topic}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-stone-500">状态</dt>
                <dd className="flex flex-wrap gap-1">
                  {context.articleExists ? <Badge tone="blue">目录已存在</Badge> : <Badge tone="amber">确认后创建</Badge>}
                  {context.confirmed && <Badge tone="green">计划已确认过</Badge>}
                </dd>
              </div>
            </dl>
          </Card>
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
        status={changed || comments.length ? `你改了计划${comments.length ? `，写了 ${comments.length} 条批注` : ""}` : "确认后才会写入 writing-plan.json"}
        onAction={onAction}
        actions={[
          { id: "pause", label: "先不写", icon: <Pause className="size-4" />, variant: "ghost" },
          { id: "revise", label: "让 agent 再想想", icon: <Send className="size-4" />, disabled: !comments.length && !draft.note.trim(), hint: "需要批注或整体意见" },
          { id: "confirm", label: "确认计划", icon: <Check className="size-4" />, variant: "primary", disabled: !plan.genre.length || !plan.audience.trim() || !plan.purpose.trim() },
        ]}
      />
    </>
  );
}
