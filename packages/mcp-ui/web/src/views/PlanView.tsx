import clsx from "clsx";
import { ArrowDown, Check, ChevronDown, ChevronUp, Compass, HelpCircle, Lightbulb, Pause, Plus, Send, Sparkles, X } from "lucide-react";
import { useState } from "react";
import type {
  InquiryTurnWire,
  PlanContext,
  ReviewWritingPlanInput,
  ReviewWritingPlanResult,
  SessionDetail,
  WritingMotivationFields,
  WritingPlanFields,
} from "../../../src/shared/actions.ts";
import { ActionBar } from "../components/ActionBar.tsx";
import { AutoTextarea, Badge, buttonClass, Card, FieldComment, inputClass } from "../components/ui.tsx";
import { useDraft } from "../store.ts";
import type { SubmitFn } from "./types.ts";

const AXES: { id: string; label: string; poles: [string, string]; core?: boolean }[] = [
  { id: "explanationPace", label: "解释节奏", poles: ["一步一步铺垫", "直接给结论"], core: true },
  { id: "abstraction", label: "抽象程度", poles: ["从具体例子出发", "从概念框架出发"], core: true },
  { id: "stance", label: "立场", poles: ["克制、标明边界", "鲜明表态"], core: true },
  { id: "perspective", label: "视角", poles: ["第一人称经历", "旁观者分析"] },
  { id: "readerAssumption", label: "读者假设", poles: ["当新手", "当同行"] },
  { id: "structure", label: "结构", poles: ["线性叙事", "模块化、可跳读"] },
  { id: "tone", label: "语气", poles: ["正式克制", "口语亲切"] },
];

const GENRES = ["工程实践文章", "解释性文章", "硬核科技科普", "复盘", "教程", "观点文章", "调研报告", "设计文档"];

const AUDIENCE_PRESETS = [
  "熟悉相关技术、遇到过类似痛点的同行工程师",
  "刚接触该领域、希望顺着问题弄懂原理的学习者",
  "关注方案选型、成本与适用边界的技术负责人",
  "跨领域的一般读者（少用内部黑话，多用直观类比）",
];

const DEFAULT_APPROACH_OPTIONS = [
  {
    id: "inquiry-climb",
    label: "追问爬坡式：困惑起点 → 追问转折 → 核心机制 → 边界与代价",
    description: "顺着作者在聊天中真实经历的「困惑 → 追问碰撞 → 核心顿悟 → 补充边界」认知路径展开，读者最易产生共鸣。",
  },
  {
    id: "tech-blogger-six-act",
    label: "科技博主六幕式：悬念钩子 → 建立问题 → 推演笨办法 → 类比与机制 → 证据边界 → 回扣升维",
    description: "将专业问题包装为大众好奇的悬念，先推演直觉猜想为何碰壁，再用生活类比与真实原理分层揭秘，持续给出认知爽感。",
  },
  {
    id: "problem-tradeoff",
    label: "工程决策式：具体问题 → 约束条件 → 方案演进 → 权衡取舍",
    description: "从一次具体故障或痛点切入，对比候选方案为什么不够，再给出最终方案与适用边界。",
  },
  {
    id: "phenomenon-mechanism",
    label: "原理解析式：反直觉现象 → 底层机制 → 关键证据 → 实践启示",
    description: "先用反常识现象引发好奇，再拆解背后的工作机制与实验依据。",
  },
];

const INTENT_LABELS: { id: string; label: string; tone: "amber" | "blue" | "violet" | "green" }[] = [
  { id: "trigger", label: "初始困惑", tone: "amber" },
  { id: "probe", label: "深入追问", tone: "blue" },
  { id: "counter", label: "认知碰撞/反问", tone: "violet" },
  { id: "synthesis", label: "归纳收敛", tone: "green" },
];

function emptyMotivation(): WritingMotivationFields {
  return {
    initialConfusion: "",
    inquiryJourney: [],
    ahaMoment: "",
    knowledgeGaps: [],
    readerValue: "",
  };
}

export function PlanView({ session, submit }: { session: SessionDetail<ReviewWritingPlanInput, PlanContext>; submit: SubmitFn }) {
  const { input, context } = session;
  const [draft, setDraft] = useDraft(session.id, () => ({
    plan: {
      ...structuredClone(input.plan),
      motivation: structuredClone(input.plan.motivation ?? context.existingPlan?.motivation ?? emptyMotivation()),
    } as WritingPlanFields,
    comments: {} as Record<string, string>,
    note: "",
  }));
  const [newGenre, setNewGenre] = useState("");
  const [showAllAxes, setShowAllAxes] = useState(false);
  const [showJourneyDetail, setShowJourneyDetail] = useState(true);

  const plan = draft.plan;
  const motivation = plan.motivation ?? emptyMotivation();
  const setPlan = (patch: Partial<WritingPlanFields>) => setDraft((d) => ({ ...d, plan: { ...d.plan, ...patch } }));
  const setMotivation = (patch: Partial<WritingMotivationFields>) =>
    setPlan({ motivation: { ...motivation, ...patch } });

  const comment = (field: string) => (
    <FieldComment value={draft.comments[field] ?? ""} onChange={(text) => setDraft((d) => ({ ...d, comments: { ...d.comments, [field]: text } }))} />
  );
  const changed = JSON.stringify(plan) !== JSON.stringify(input.plan);
  const comments = Object.entries(draft.comments)
    .filter(([, t]) => t.trim())
    .map(([field, text]) => ({ field, text: text.trim() }));

  const allAxisIds = [...new Set([...AXES.map((a) => a.id), ...Object.keys(plan.styleAxes)])];
  const visibleAxisIds = showAllAxes
    ? allAxisIds
    : allAxisIds.filter((id) => AXES.find((a) => a.id === id)?.core || (plan.styleAxes[id] ?? "").trim().length > 0);

  const approachChoices = input.approachOptions?.length ? input.approachOptions : DEFAULT_APPROACH_OPTIONS;

  const deriveFromMotivation = () => {
    const confusion = motivation.initialConfusion.trim();
    const aha = motivation.ahaMoment.trim();
    const journeySteps = (motivation.inquiryJourney ?? [])
      .map((t) => t.question.trim())
      .filter(Boolean);
    const gaps = (motivation.knowledgeGaps ?? []).filter((g) => g.trim());
    const nextPurpose =
      aha && confusion
        ? `解答「${confusion}」，阐明「${aha}」${motivation.readerValue ? `，${motivation.readerValue}` : ""}`
        : aha || confusion || plan.purpose;
    const journeyText = journeySteps.length
      ? `沿着追问链（${journeySteps.map((q, i) => `①②③④⑤⑥`[i] ? `${`①②③④⑤⑥`[i]} ${q}` : q).join(" → ")}）层层推进`
      : "从初始困惑切入，逐步拆解核心机制";
    const gapText = gaps.length ? `，并重点补齐「${gaps.join("；")}」等边界与证据。` : "，最后总结适用边界与工程启示。";
    const nextApproach = `从「${confusion || "具体痛点"}」切入，${journeyText}，导出核心判断「${aha || "核心结论"}」${gapText}`;
    setPlan({ purpose: nextPurpose, approach: nextApproach });
  };

  const updateTurn = (idx: number, patch: Partial<InquiryTurnWire>) => {
    const next = [...(motivation.inquiryJourney ?? [])];
    next[idx] = { ...next[idx]!, ...patch };
    setMotivation({ inquiryJourney: next });
  };

  const onAction = (id: string) => {
    const cleanedMotivation =
      motivation.initialConfusion.trim() || motivation.ahaMoment.trim() || (motivation.inquiryJourney ?? []).length
        ? {
            initialConfusion: motivation.initialConfusion.trim(),
            inquiryJourney: (motivation.inquiryJourney ?? []).filter((t) => t.question.trim() || t.shift?.trim()),
            ahaMoment: motivation.ahaMoment.trim(),
            knowledgeGaps: (motivation.knowledgeGaps ?? []).map((g) => g.trim()).filter(Boolean),
            ...(motivation.readerValue?.trim() ? { readerValue: motivation.readerValue.trim() } : {}),
          }
        : undefined;
    const result: ReviewWritingPlanResult = {
      decision: id as ReviewWritingPlanResult["decision"],
      plan: {
        ...plan,
        openQuestions: plan.openQuestions.map((q) => q.trim()).filter(Boolean),
        ...(cleanedMotivation ? { motivation: cleanedMotivation } : {}),
      },
      comments,
      note: draft.note.trim() || undefined,
    };
    submit(id, result);
  };

  return (
    <>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-4 @4xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-4">
          <Card
            title={
              <span className="flex items-center gap-2">
                <Compass className="size-4 text-emerald-600" />
                第一步：从追问轨迹还原写作动机（以写促学）
              </span>
            }
            actions={
              <button
                type="button"
                onClick={deriveFromMotivation}
                disabled={!motivation.initialConfusion.trim() && !motivation.ahaMoment.trim()}
                className={buttonClass("secondary", "sm")}
                title="根据下方的困惑起点、追问链和核心顿悟，自动生成写作目的与行文方案"
              >
                <Sparkles className="size-3.5 text-emerald-600" /> 一键推导目的与行文方案
              </button>
            }
          >
            <p className="mb-3 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
              你在聊天中的每一次追问，都暴露了最真实的认知爬坡过程。先确认「最初卡在哪 → 追问了什么 → 最后想通了什么」，文章就会顺着这条认知主线展开。
            </p>
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                  <HelpCircle className="size-3.5" /> 1. 困惑起点（Trigger：最初卡在什么问题或直觉冲突上？）
                </div>
                <AutoTextarea
                  value={motivation.initialConfusion}
                  onChange={(initialConfusion) => setMotivation({ initialConfusion })}
                  placeholder="例如：改文章时只想换掉一句话，为什么每次交给 AI 都会把整篇重写？"
                  minRows={1}
                />
              </div>

              <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-3 dark:border-stone-800 dark:bg-stone-900/40">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-stone-600 dark:text-stone-300">
                    2. 追问演进链（Inquiry Journey：{(motivation.inquiryJourney ?? []).length} 个关键追问节点）
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setMotivation({
                          inquiryJourney: [
                            ...(motivation.inquiryJourney ?? []),
                            { turn: (motivation.inquiryJourney?.length ?? 0) + 1, question: "", intent: "probe", shift: "" },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                    >
                      <Plus className="size-3.5" /> 加一轮追问
                    </button>
                    {(motivation.inquiryJourney?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowJourneyDetail((v) => !v)}
                        className="inline-flex items-center gap-0.5 text-xs text-stone-400 hover:text-stone-600"
                      >
                        {showJourneyDetail ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        {showJourneyDetail ? "收起" : "展开"}
                      </button>
                    )}
                  </div>
                </div>
                {showJourneyDetail && (motivation.inquiryJourney?.length ?? 0) > 0 && (
                  <ol className="mt-2.5 space-y-2.5">
                    {(motivation.inquiryJourney ?? []).map((step, idx) => (
                      <li key={idx} className="rounded-md border border-stone-200 bg-white p-2.5 text-xs dark:border-stone-700 dark:bg-stone-900">
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono font-semibold text-stone-500">第 {step.turn || idx + 1} 问</span>
                          <div className="flex flex-wrap gap-1">
                            {INTENT_LABELS.map((it) => {
                              const active = (step.intent ?? "probe") === it.id;
                              return (
                                <button
                                  key={it.id}
                                  type="button"
                                  onClick={() => updateTurn(idx, { intent: it.id })}
                                  className={clsx(
                                    "rounded px-1.5 py-0.5 text-[11px] transition",
                                    active
                                      ? "bg-emerald-600 text-white"
                                      : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400",
                                  )}
                                >
                                  {it.label}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            title="移除这一轮"
                            onClick={() =>
                              setMotivation({
                                inquiryJourney: (motivation.inquiryJourney ?? [])
                                  .filter((_, j) => j !== idx)
                                  .map((item, j) => ({ ...item, turn: j + 1 })),
                              })
                            }
                            className="ml-auto text-stone-400 hover:text-rose-600"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                        <div className="grid gap-1.5 @md:grid-cols-2">
                          <input
                            value={step.question}
                            onChange={(e) => updateTurn(idx, { question: e.target.value })}
                            placeholder="当时追问了什么问题？"
                            className={clsx(inputClass, "text-xs")}
                          />
                          <input
                            value={step.shift ?? ""}
                            onChange={(e) => updateTurn(idx, { shift: e.target.value })}
                            placeholder="这一问带来了什么认知推进 / 推翻了什么直觉？"
                            className={clsx(inputClass, "text-xs")}
                          />
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="flex justify-center text-stone-300 dark:text-stone-600">
                <ArrowDown className="size-4" />
              </div>

              <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/40 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  <Lightbulb className="size-3.5" /> 3. 核心顿悟（Aha Moment：追问到最后真正想通的结论是什么？）
                </div>
                <AutoTextarea
                  value={motivation.ahaMoment}
                  onChange={(ahaMoment) => setMotivation({ ahaMoment })}
                  placeholder="例如：将事实主张、章节大纲与正文块解耦，才能把每次修订严格收敛在单块范围内。"
                  minRows={1}
                />
              </div>

              <div className="grid gap-3 @md:grid-cols-2">
                <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                  <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-stone-500">
                    <span>4. 待补认知缺口（聊天时跳过或待验证处）</span>
                    <button
                      type="button"
                      onClick={() => setMotivation({ knowledgeGaps: [...(motivation.knowledgeGaps ?? []), ""] })}
                      className="inline-flex items-center gap-0.5 text-emerald-600 hover:underline"
                    >
                      <Plus className="size-3" /> 添加
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {(motivation.knowledgeGaps ?? []).map((gap, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <input
                          value={gap}
                          onChange={(e) =>
                            setMotivation({
                              knowledgeGaps: (motivation.knowledgeGaps ?? []).map((x, j) => (j === i ? e.target.value : x)),
                            })
                          }
                          placeholder="例如：需要补一个边界条件或反例"
                          className={clsx(inputClass, "text-xs")}
                        />
                        {gap.trim() && !plan.openQuestions.includes(gap.trim()) && (
                          <button
                            type="button"
                            title="转入待定问题"
                            onClick={() => setPlan({ openQuestions: [...plan.openQuestions, gap.trim()] })}
                            className="shrink-0 rounded bg-stone-100 px-1.5 py-1 text-[11px] text-stone-600 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-stone-800 dark:text-stone-300"
                          >
                            +待定
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setMotivation({
                              knowledgeGaps: (motivation.knowledgeGaps ?? []).filter((_, j) => j !== i),
                            })
                          }
                          className="text-stone-400 hover:text-rose-600"
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                    {!(motivation.knowledgeGaps ?? []).length && (
                      <li className="text-xs text-stone-400">暂无记录。写作 SOP 会在主张与大纲阶段帮你补齐证据边界。</li>
                    )}
                  </ul>
                </div>

                <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                  <div className="mb-1.5 text-xs font-medium text-stone-500">5. 读者共鸣价值（读者顺着这条路径读完能收获什么）</div>
                  <AutoTextarea
                    value={motivation.readerValue ?? ""}
                    onChange={(readerValue) => setMotivation({ readerValue })}
                    placeholder="例如：帮助同样受困于该问题的开发者，少走弯路并掌握可复现的做法。"
                    minRows={2}
                  />
                </div>
              </div>
              {comment("motivation")}
            </div>
          </Card>

          <Card title="第二步：文体、目标读者与写作目的">
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-medium text-stone-500">文体（点选，可组合）</div>
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
                          on
                            ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                            : "border-stone-200 text-stone-500 hover:border-stone-300 dark:border-stone-700",
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
                    <input
                      value={newGenre}
                      onChange={(e) => setNewGenre(e.target.value)}
                      placeholder="+ 其他"
                      className="w-24 rounded-full border border-dashed border-stone-300 bg-transparent px-3 py-1 text-sm outline-none dark:border-stone-700"
                    />
                  </form>
                </div>
                {comment("genre")}
              </div>
              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
                  <span className="text-xs font-medium text-stone-500">目标读者（可点选常见画像或直接修改）</span>
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {AUDIENCE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPlan({ audience: preset })}
                      className={clsx(
                        "rounded-md border px-2 py-1 text-xs transition",
                        plan.audience === preset
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                          : "border-stone-200 text-stone-500 hover:border-stone-300 dark:border-stone-700",
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <AutoTextarea value={plan.audience} onChange={(audience) => setPlan({ audience })} minRows={1} />
                {comment("audience")}
              </div>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-stone-500">写作目的：读者读完能理解或做到什么</div>
                <AutoTextarea value={plan.purpose} onChange={(purpose) => setPlan({ purpose })} minRows={1} />
                {comment("purpose")}
              </label>
            </div>
          </Card>

          <Card title="第三步：行文方案（读者认知爬坡路径）">
            <div className="mb-3 grid gap-2 @md:grid-cols-3">
              {approachChoices.map((o) => {
                const targetText = o.description ? `${o.label}：${o.description}` : o.label;
                const on = plan.approach === (o.description ?? o.label) || plan.approach === targetText;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setPlan({ approach: o.description ?? o.label })}
                    className={clsx(
                      "rounded-lg border p-3 text-left text-sm transition",
                      on
                        ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40"
                        : "border-stone-200 hover:border-stone-300 dark:border-stone-700",
                    )}
                  >
                    <div className="font-medium">{o.label}</div>
                    {o.description && <p className="mt-1 text-xs leading-relaxed text-stone-500">{o.description}</p>}
                  </button>
                );
              })}
            </div>
            <AutoTextarea value={plan.approach} onChange={(approach) => setPlan({ approach })} minRows={2} />
            {comment("approach")}
          </Card>

          <Card
            title="第四步：偏好轴（一键快选，可留空）"
            actions={<span className="text-xs text-stone-400">点选倾向即可，具体笔调会在首块出多版让你挑</span>}
          >
            <div className="divide-y divide-stone-100 dark:divide-stone-800">
              {visibleAxisIds.map((id) => {
                const axis = AXES.find((a) => a.id === id);
                const currentVal = plan.styleAxes[id] ?? "";
                const quickOptions = axis
                  ? [
                      `偏「${axis.poles[0]}」`,
                      `折中（兼顾${axis.poles[0]}与${axis.poles[1]}）`,
                      `偏「${axis.poles[1]}」`,
                    ]
                  : [];
                return (
                  <div key={id} className="grid gap-2 py-3 first:pt-0 last:pb-0 @md:grid-cols-[9rem_minmax(0,1fr)]">
                    <div>
                      <div className="text-sm font-medium">{axis?.label ?? id}</div>
                      {axis && (
                        <div className="text-xs text-stone-400">
                          {axis.poles[0]} ↔ {axis.poles[1]}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {quickOptions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {quickOptions.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setPlan({ styleAxes: { ...plan.styleAxes, [id]: currentVal === opt ? "" : opt } })}
                              className={clsx(
                                "rounded-md border px-2 py-0.5 text-xs transition",
                                currentVal === opt
                                  ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                                  : "border-stone-200 text-stone-500 hover:border-stone-300 dark:border-stone-700",
                              )}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                      <AutoTextarea
                        value={currentVal}
                        onChange={(v) => setPlan({ styleAxes: { ...plan.styleAxes, [id]: v } })}
                        placeholder={axis ? `可点选上方标签，或补充说明…` : ""}
                        minRows={1}
                      />
                      {comment(`styleAxes.${id}`)}
                    </div>
                  </div>
                );
              })}
            </div>
            {allAxisIds.length > visibleAxisIds.length || showAllAxes ? (
              <button
                type="button"
                onClick={() => setShowAllAxes((v) => !v)}
                className="mt-3 inline-flex items-center gap-1 text-xs text-stone-500 hover:text-emerald-600"
              >
                {showAllAxes ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                {showAllAxes ? "收起次要风格维度" : `展开其余 ${allAxisIds.length - visibleAxisIds.length} 项风格微调（可选）`}
              </button>
            ) : null}
          </Card>

          <Card title="待定问题（不阻碍开写，可在后续阶段决定）">
            <ul className="space-y-2">
              {plan.openQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-2">
                  <input
                    value={q}
                    onChange={(e) => setPlan({ openQuestions: plan.openQuestions.map((x, j) => (j === i ? e.target.value : x)) })}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    title="删掉这个问题"
                    onClick={() => setPlan({ openQuestions: plan.openQuestions.filter((_, j) => j !== i) })}
                    className="mt-2 text-stone-400 hover:text-rose-600"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setPlan({ openQuestions: [...plan.openQuestions, ""] })}
              className="mt-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-emerald-600"
            >
              <Plus className="size-4" /> 加一个待定问题
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
          {(motivation.initialConfusion.trim() || motivation.ahaMoment.trim()) && (
            <Card title="认知主线速览">
              <div className="space-y-2 text-xs leading-relaxed">
                {motivation.initialConfusion.trim() && (
                  <div>
                    <span className="font-semibold text-amber-700 dark:text-amber-300">困惑起点：</span>
                    <span className="text-stone-600 dark:text-stone-300">{motivation.initialConfusion}</span>
                  </div>
                )}
                {(motivation.inquiryJourney?.length ?? 0) > 0 && (
                  <div className="text-stone-500">
                    经由 {(motivation.inquiryJourney ?? []).length} 轮追问推进 →
                  </div>
                )}
                {motivation.ahaMoment.trim() && (
                  <div>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">核心顿悟：</span>
                    <span className="text-stone-600 dark:text-stone-300">{motivation.ahaMoment}</span>
                  </div>
                )}
              </div>
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
