import clsx from "clsx";
import { ArrowDown, ArrowUp, Check, Eye, HelpCircle, Image, Minus, Plus, Send, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useState } from "react";
import type { FigureDraftWire, OutlineContext, ReviewOutlineInput, ReviewOutlineResult, SessionDetail } from "../../../src/shared/actions.ts";
import { ActionBar } from "../components/ActionBar.tsx";
import { ExpressChrome, toggleChip, withChips } from "../components/ExpressChrome.tsx";
import { AutoTextarea, Badge, buttonClass, Card, FieldComment, inputClass, Tag } from "../components/ui.tsx";
import { useDraft } from "../store.ts";
import { VISUAL_STYLE_PRESETS } from "./PlanView.tsx";
import type { SubmitFn } from "./types.ts";

type Section = ReviewOutlineResult["sections"][number];

const pad = (n: number) => `b${String(n).padStart(3, "0")}`;

const COGNITIVE_ROLE_PRESETS = [
  "引发共鸣 · 破除直觉",
  "拆解机制 · 给出证据",
  "方案对比 · 权衡取舍",
  "适用边界 · 落地闭环",
];

const ROLE_BADGE: Record<string, { label: string; tone: "amber" | "green" | "blue" | "violet" }> = {
  friction: { label: "痛点", tone: "amber" },
  insight: { label: "顿悟", tone: "green" },
  evidence: { label: "证据", tone: "blue" },
  boundary: { label: "边界", tone: "violet" },
};

export const VISUAL_ROLES: { id: string; label: string; hint: string; tone: "amber" | "green" | "blue" | "violet" }[] = [
  { id: "hook", label: "视觉钩子", hint: "开场反常识现象或冲击对比", tone: "amber" },
  { id: "analogy", label: "生活类比/条漫", hint: "把抽象概念映射到日常场景或拟人对话小剧场", tone: "violet" },
  { id: "comparison", label: "方案对比", hint: "直觉笨办法 vs 新方案左右分屏反差", tone: "blue" },
  { id: "mechanism", label: "机制拆解", hint: "多步流转、3D解剖、时序状态或尺度切换", tone: "green" },
  { id: "evidence", label: "数据证据", hint: "数量级冲击或实验测试图表", tone: "blue" },
  { id: "architecture", label: "全局地图", hint: "多模块协作全景与认知模型", tone: "violet" },
];

export const FIGURE_KINDS: { id: FigureDraftWire["kind"]; label: string; hint: string }[] = [
  { id: "raster", label: "多模态 AI 生图 (raster)", hint: "由 Agent 调用 GenerateImage 直接生成类比插画、左右分屏对比、分镜条漫或 3D 轴测图" },
  { id: "svg-chart", label: "富排版 SVG / 数据图", hint: "可编程矢量图：数据冲击图表、红绿对比卡、代码解剖图" },
  { id: "mermaid", label: "Mermaid 逻辑拓扑", hint: "流程图、调用时序图、状态机" },
  { id: "drawio", label: "draw.io 精排架构", hint: "需要手调布局的工程架构图与泳道图" },
  { id: "remote", label: "实证截图 / 外部图", hint: "真实监控报错截图或带许可的外部图" },
];

export const ASPECT_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16"] as const;

export function OutlineView({ session, submit }: { session: SessionDetail<ReviewOutlineInput, OutlineContext>; submit: SubmitFn }) {
  const { input, context } = session;
  const [draft, setDraft] = useDraft(session.id, () => {
    const mergedFigures: FigureDraftWire[] = [
      ...(input.figures ?? []),
      ...context.figures
        .filter((f) => !input.figures?.some((x) => x.id === f.id))
        .map((f) => ({
          id: f.id,
          kind: (f.kind as FigureDraftWire["kind"]) ?? "mermaid",
          role: f.role,
          intent: f.intent,
          takeaway: f.takeaway,
          anchorSummary: f.anchorSummary,
          caption: f.caption,
          alt: f.alt,
          source: f.source,
          prompt: f.prompt,
          aspectRatio: f.aspectRatio,
          referenceImages: f.referenceImages,
          confirmed: f.confirmed,
          blockIds: f.blockIds ?? [],
        })),
    ];
    return {
      sections: input.sections.map((s) => ({
        ...s,
        figureIds: s.figureIds ?? [],
        blockIds: s.blockIds ?? [],
        readerQuestion: s.readerQuestion ?? "",
        cognitiveRole: s.cognitiveRole ?? "",
      })) as Section[],
      figures: mergedFigures,
      comments: {} as Record<string, string>,
      note: "",
    };
  });
  const [editingFigId, setEditingFigId] = useState<string | null>(null);
  const [express, setExpress] = useState(true);
  const [chips, setChips] = useState<string[]>([]);

  const sections = draft.sections;
  const figures = draft.figures ?? [];
  const setSections = (fn: (s: Section[]) => Section[]) => setDraft((d) => ({ ...d, sections: fn(d.sections) }));
  const setFigures = (fn: (f: FigureDraftWire[]) => FigureDraftWire[]) => setDraft((d) => ({ ...d, figures: fn(d.figures ?? []) }));
  const update = (id: string, patch: Partial<Section>) => setSections((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const updateFigure = (id: string, patch: Partial<FigureDraftWire>) =>
    setFigures((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));

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
  const nextFigureId = () => {
    const used = new Set(figures.map((f) => f.id));
    let n = figures.length + 1;
    while (used.has(`fig-${n}`)) n++;
    return `fig-${n}`;
  };

  const addFigureForSection = (section: Section, defaultKind: FigureDraftWire["kind"] = "raster") => {
    const id = nextFigureId();
    const defaultBlock = section.blockIds?.[0];
    const newFig: FigureDraftWire = {
      id,
      kind: defaultKind,
      role: "comparison",
      intent: "",
      takeaway: "",
      anchorSummary: "",
      caption: "",
      prompt: "",
      aspectRatio: "16:9",
      confirmed: defaultKind === "raster" ? true : undefined,
      blockIds: defaultBlock ? [defaultBlock] : [],
    };
    setFigures((list) => [...list, newFig]);
    update(section.id, { figureIds: [...(section.figureIds ?? []), id] });
    setEditingFigId(id);
  };

  const accepted = context.claims.filter((c) => c.status === "accepted");
  const usedClaims = new Set(sections.flatMap((s) => s.claimIds));
  const uncovered = accepted.filter((c) => !usedClaims.has(c.id));
  const comments = Object.entries(draft.comments)
    .filter(([, t]) => t.trim())
    .map(([sectionId, text]) => ({ sectionId, text: text.trim() }));
  const noBlocks = sections.filter((s) => !s.blockIds?.length);
  const activeVisualPreset = VISUAL_STYLE_PRESETS.find((p) => p.id === context.visualStyle?.id);

  const autoAssignUncovered = () => {
    if (!uncovered.length || !sections.length) return;
    setSections((list) => {
      const next = list.map((s) => ({ ...s, claimIds: [...s.claimIds] }));
      for (const c of uncovered) {
        let targetIdx = 0;
        if (c.role === "friction") targetIdx = 0;
        else if (c.role === "boundary") targetIdx = next.length - 1;
        else if (c.role === "evidence" && next.length > 1) targetIdx = Math.min(1, next.length - 1);
        else if (c.role === "insight") targetIdx = 0;
        next[targetIdx]!.claimIds.push(c.id);
      }
      return next;
    });
  };

  const onAction = (id: string) => {
    const result: ReviewOutlineResult = {
      decision: id as ReviewOutlineResult["decision"],
      sections,
      figures,
      comments,
      note: withChips(draft.note, chips),
    };
    submit(id, result);
  };

  return (
    <>
      <ExpressChrome
        express={express}
        onExpress={setExpress}
        thread={context.motivation?.ahaMoment || sections.map((s) => s.title).join(" → ")}
        hook={context.motivation?.initialConfusion || sections[0]?.readerQuestion || ""}
        structure={sections.map((s, i) => `${i + 1}. ${s.title}`).join("  ")}
        chips={chips}
        onChip={(id) => setChips((list) => toggleChip(list, id))}
      />
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-4 @4xl:grid-cols-[minmax(0,1fr)_21rem]">
        <ol className="space-y-3">
          {sections.map((s, i) => {
            const sectionFigs = figures.filter((f) => s.figureIds?.includes(f.id));
            return (
              <li key={s.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    {i + 1}
                  </span>
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

                <div className="mt-3 space-y-2.5 pl-8">
                  {!express && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-stone-500">认知角色：</span>
                    {COGNITIVE_ROLE_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => update(s.id, { cognitiveRole: s.cognitiveRole === preset ? "" : preset })}
                        className={clsx(
                          "rounded-md border px-2 py-0.5 text-[11px] transition",
                          s.cognitiveRole === preset
                            ? "border-emerald-400 bg-emerald-50 font-medium text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                            : "border-stone-200 text-stone-500 hover:border-stone-300 dark:border-stone-700",
                        )}
                      >
                        {preset}
                      </button>
                    ))}
                    <input
                      value={s.cognitiveRole ?? ""}
                      onChange={(e) => update(s.id, { cognitiveRole: e.target.value })}
                      placeholder="或自定义本节角色…"
                      className="w-36 rounded-md border border-dashed border-stone-300 bg-transparent px-2 py-0.5 text-xs outline-none dark:border-stone-700"
                    />
                  </div>
                  )}

                  <div className="space-y-2">
                    <AutoTextarea
                      value={s.readerQuestion ?? ""}
                      onChange={(readerQuestion) => update(s.id, { readerQuestion })}
                      placeholder="这一节回应读者心里的什么疑问？"
                      minRows={3}
                    />
                    <AutoTextarea
                      value={s.bridgeFromPrev ?? ""}
                      onChange={(bridgeFromPrev) => update(s.id, { bridgeFromPrev })}
                      placeholder="接住上一节的哪个状态或未解问题？"
                      minRows={2}
                    />
                    <AutoTextarea
                      value={s.hookToNext ?? ""}
                      onChange={(hookToNext) => update(s.id, { hookToNext })}
                      placeholder="本节最后交出去什么，下一节第一句必须先接住？"
                      minRows={2}
                    />
                  </div>

                  {!express && (
                  <div className="flex items-center gap-2 rounded-lg border border-stone-200/80 bg-stone-50/60 px-2.5 py-1.5 dark:border-stone-800 dark:bg-stone-800/40">
                    <HelpCircle className="size-3.5 shrink-0 text-amber-600" />
                    <input
                      value={s.readerQuestion ?? ""}
                      onChange={(e) => update(s.id, { readerQuestion: e.target.value })}
                      placeholder="这一节回应读者心里的什么疑问？（例如：为什么只改一句却导致全文重写？）"
                      className="w-full bg-transparent text-xs text-stone-700 outline-none dark:text-stone-200"
                    />
                  </div>
                  )}

                  <AutoTextarea
                    value={s.summary ?? ""}
                    onChange={(summary) => update(s.id, { summary })}
                    placeholder="这一节打算怎么展开（可选）"
                    minRows={3}
                  />

                  {!express && (
                  <>
                  <div>
                    <div className="mb-1.5 text-xs text-stone-500">本节支撑主张（点选分配，直接显示主张摘要与认知角色）：</div>
                    <div className="space-y-1.5">
                      {accepted.map((c) => {
                        const on = s.claimIds.includes(c.id);
                        const roleInfo = c.role ? ROLE_BADGE[c.role] : undefined;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => update(s.id, { claimIds: on ? s.claimIds.filter((x) => x !== c.id) : [...s.claimIds, c.id] })}
                            className={clsx(
                              "flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition",
                              on
                                ? "border-emerald-300 bg-emerald-50/70 text-stone-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-stone-100"
                                : "border-stone-200/80 text-stone-400 hover:border-stone-300 hover:text-stone-600 dark:border-stone-800",
                            )}
                          >
                            <span className="mt-0.5 font-mono text-[11px] font-semibold">{c.id}</span>
                            {roleInfo && <Badge tone={roleInfo.tone}>{roleInfo.label}</Badge>}
                            <span className="flex-1">{c.text}</span>
                          </button>
                        );
                      })}
                      {s.claimIds
                        .filter((id) => !accepted.some((c) => c.id === id))
                        .map((id) => (
                          <Badge key={id} tone="amber">
                            {id} 未采用
                          </Badge>
                        ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-sky-200/70 bg-sky-50/30 p-2.5 dark:border-sky-900/50 dark:bg-sky-950/20">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-800 dark:text-sky-300">
                          <Image className="size-3.5" /> 本节视觉表达（一图胜千言）
                        </span>
                        {figures.map((f) => {
                          const on = s.figureIds?.includes(f.id);
                          const vRole = VISUAL_ROLES.find((r) => r.id === f.role);
                          return (
                            <button
                              key={f.id}
                              type="button"
                              title={f.intent || f.caption || f.id}
                              onClick={() => {
                                const nextOn = !on;
                                update(s.id, { figureIds: nextOn ? [...(s.figureIds ?? []), f.id] : s.figureIds?.filter((x) => x !== f.id) });
                                if (nextOn && (!f.blockIds || !f.blockIds.length) && s.blockIds?.[0]) {
                                  updateFigure(f.id, { blockIds: [s.blockIds[0]] });
                                }
                              }}
                              className={clsx(
                                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ring-1 ring-inset transition",
                                on
                                  ? "bg-sky-600 font-medium text-white ring-sky-600"
                                  : "bg-white text-stone-500 ring-stone-200 hover:ring-sky-300 dark:bg-stone-900 dark:ring-stone-700",
                              )}
                            >
                              <span>{f.id}</span>
                              {vRole && <span className="opacity-85">· {vRole.label}</span>}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => addFigureForSection(s, "raster")}
                          className="inline-flex items-center gap-0.5 text-xs font-medium text-violet-700 hover:underline dark:text-violet-300"
                        >
                          <Wand2 className="size-3.5" /> + AI 多模态生图
                        </button>
                        <button
                          type="button"
                          onClick={() => addFigureForSection(s, "mermaid")}
                          className="inline-flex items-center gap-0.5 text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"
                        >
                          <Plus className="size-3.5" /> + 矢量图/流程
                        </button>
                      </div>
                    </div>

                    {sectionFigs.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {sectionFigs.map((fig) => {
                          const isEditing = editingFigId === fig.id;
                          const vRole = VISUAL_ROLES.find((r) => r.id === fig.role);
                          return (
                            <div key={fig.id} className="rounded-md border border-sky-200/80 bg-white p-2.5 text-xs dark:border-sky-900/60 dark:bg-stone-900">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono font-semibold text-sky-700 dark:text-sky-300">{fig.id}</span>
                                <Badge tone={fig.kind === "raster" ? "violet" : "gray"}>{fig.kind}</Badge>
                                {vRole && <Badge tone={vRole.tone}>{vRole.label}</Badge>}
                                <span className="line-clamp-1 flex-1 text-stone-600 dark:text-stone-300">
                                  {fig.intent || fig.takeaway || fig.prompt || fig.caption || "点击右侧展开编写配图意图、一秒结论与生图描述"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setEditingFigId(isEditing ? null : fig.id)}
                                  className="text-sky-600 hover:underline dark:text-sky-400"
                                >
                                  {isEditing ? "收起简报" : "设计简报"}
                                </button>
                              </div>
                              {isEditing && (
                                <div className="mt-2.5 space-y-2 border-t border-stone-100 pt-2.5 dark:border-stone-800">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-stone-500">图片载体：</span>
                                    {FIGURE_KINDS.map((k) => (
                                      <button
                                        key={k.id}
                                        type="button"
                                        title={k.hint}
                                        onClick={() => updateFigure(fig.id, { kind: k.id, confirmed: k.id === "raster" ? true : fig.confirmed })}
                                        className={clsx(
                                          "rounded px-2 py-0.5 text-[11px] transition",
                                          fig.kind === k.id
                                            ? "bg-sky-600 text-white"
                                            : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300",
                                        )}
                                      >
                                        {k.label}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-stone-500">视觉角色：</span>
                                    {VISUAL_ROLES.map((r) => (
                                      <button
                                        key={r.id}
                                        type="button"
                                        title={r.hint}
                                        onClick={() => updateFigure(fig.id, { role: r.id })}
                                        className={clsx(
                                          "rounded px-2 py-0.5 text-[11px] transition",
                                          fig.role === r.id
                                            ? "bg-emerald-600 text-white"
                                            : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300",
                                        )}
                                      >
                                        {r.label}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="grid gap-2 @md:grid-cols-2">
                                    <input
                                      value={fig.intent ?? ""}
                                      onChange={(e) => updateFigure(fig.id, { intent: e.target.value })}
                                      placeholder="配图意图：这里文字哪儿讲着费劲？想画什么对比、隐喻或过程？"
                                      className={clsx(inputClass, "text-xs")}
                                    />
                                    <input
                                      value={fig.takeaway ?? ""}
                                      onChange={(e) => updateFigure(fig.id, { takeaway: e.target.value })}
                                      placeholder="一秒结论：读者扫一眼这张图，3 秒内该看懂什么结论？"
                                      className={clsx(inputClass, "text-xs")}
                                    />
                                  </div>
                                  {fig.kind === "raster" && (
                                    <div className="rounded-lg border border-violet-200/80 bg-violet-50/40 p-2.5 dark:border-violet-900/60 dark:bg-violet-950/20">
                                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
                                        <span className="font-medium text-violet-800 dark:text-violet-300">
                                          多模态生图画面描述（确认大纲即授权 Agent 调用 GenerateImage）
                                        </span>
                                        <div className="flex items-center gap-1">
                                          <span className="text-[11px] text-stone-500">画幅：</span>
                                          {ASPECT_RATIOS.map((ar) => (
                                            <button
                                              key={ar}
                                              type="button"
                                              onClick={() => updateFigure(fig.id, { aspectRatio: ar })}
                                              className={clsx(
                                                "rounded px-1.5 py-0.5 font-mono text-[10px]",
                                                (fig.aspectRatio ?? "16:9") === ar
                                                  ? "bg-violet-600 text-white"
                                                  : "bg-white text-stone-500 dark:bg-stone-800",
                                              )}
                                            >
                                              {ar}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <AutoTextarea
                                        value={fig.prompt ?? ""}
                                        onChange={(prompt) => updateFigure(fig.id, { prompt })}
                                        placeholder="描述画面主体、分屏对比/分镜动作与视觉焦点（可留空由 Agent 根据配图意图与本篇画风自动组装五要素 Prompt）"
                                        minRows={2}
                                        className="text-xs"
                                      />
                                      {activeVisualPreset && !(fig.prompt ?? "").includes(activeVisualPreset.promptPrefix) && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateFigure(fig.id, {
                                              prompt: `${activeVisualPreset.promptPrefix}. ${(fig.prompt || fig.intent || "").trim()}`.trim(),
                                            })
                                          }
                                          className="mt-1 text-[11px] text-violet-700 hover:underline dark:text-violet-300"
                                        >
                                          + 注入本篇「{activeVisualPreset.name}」画风前缀
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  <div className="grid gap-2 @md:grid-cols-2">
                                    <input
                                      value={fig.anchorSummary ?? ""}
                                      onChange={(e) => updateFigure(fig.id, { anchorSummary: e.target.value })}
                                      placeholder="图文联动契约：图内包含哪些关键元素？正文因有此图可少写什么？"
                                      className={clsx(inputClass, "text-xs")}
                                    />
                                    <input
                                      value={fig.caption ?? ""}
                                      onChange={(e) => updateFigure(fig.id, { caption: e.target.value })}
                                      placeholder="图注（可选）：一句话点明图眼"
                                      className={clsx(inputClass, "text-xs")}
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-stone-500">挂载到正文块：</span>
                                    {(s.blockIds ?? []).map((bId) => {
                                      const bound = (fig.blockIds ?? []).includes(bId);
                                      return (
                                        <button
                                          key={bId}
                                          type="button"
                                          onClick={() =>
                                            updateFigure(fig.id, {
                                              blockIds: bound ? (fig.blockIds ?? []).filter((x) => x !== bId) : [...(fig.blockIds ?? []), bId],
                                            })
                                          }
                                          className={clsx(
                                            "rounded px-2 py-0.5 font-mono text-[11px] transition",
                                            bound ? "bg-sky-600 text-white" : "bg-stone-100 text-stone-500 dark:bg-stone-800",
                                          )}
                                        >
                                          {bId}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  </>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="mr-1 text-xs text-stone-500">正文块</span>
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
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => {
                let n = sections.length + 1;
                while (sections.some((s) => s.id === `s${n}`)) n++;
                setSections((list) => [...list, { id: `s${n}`, title: "新的一节", claimIds: [], figureIds: [], blockIds: [nextBlock()], summary: "", readerQuestion: "", cognitiveRole: "" }]);
              }}
              className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-stone-300 py-3 text-sm text-stone-500 hover:border-emerald-400 hover:text-emerald-600 dark:border-stone-700"
            >
              <Plus className="size-4" /> 加一节
            </button>
          </li>
        </ol>

        <aside className="space-y-4 @4xl:sticky @4xl:top-4 @4xl:self-start">
          <Card title="读者认知爬坡路线图">
            <div className="space-y-2 text-xs">
              {context.motivation?.initialConfusion && (
                <div className="rounded-lg bg-amber-50/70 p-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <span className="font-semibold">起点困惑：</span>
                  {context.motivation.initialConfusion}
                </div>
              )}
              <ol className="space-y-1.5 border-l-2 border-emerald-200 pl-3 dark:border-emerald-900">
                {sections.map((s, i) => (
                  <li key={s.id} className="space-y-0.5">
                    <div className="font-medium text-stone-700 dark:text-stone-200">
                      {i + 1}. {s.title}
                      {s.cognitiveRole && <span className="ml-1 text-[11px] font-normal text-emerald-600">（{s.cognitiveRole}）</span>}
                    </div>
                    {s.readerQuestion && <div className="text-stone-500">→ {s.readerQuestion}</div>}
                    {!!s.figureIds?.length && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {s.figureIds.map((fId) => {
                          const f = figures.find((x) => x.id === fId);
                          const vRole = VISUAL_ROLES.find((r) => r.id === f?.role);
                          return (
                            <span key={fId} className="inline-flex items-center gap-0.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                              <Eye className="size-2.5" /> {fId}
                              {vRole ? `·${vRole.label}` : ""}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              {context.motivation?.ahaMoment && (
                <div className="rounded-lg bg-emerald-50/70 p-2 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <span className="font-semibold">抵达顿悟：</span>
                  {context.motivation.ahaMoment}
                </div>
              )}
            </div>
          </Card>

          <Card
            title="主张覆盖"
            actions={
              uncovered.length > 0 ? (
                <button type="button" onClick={autoAssignUncovered} className={buttonClass("secondary", "sm")} title="按主张的认知角色自动归入对应章节">
                  <Sparkles className="size-3.5 text-emerald-600" /> 自动分配
                </button>
              ) : null
            }
          >
            {uncovered.length ? (
              <ul className="space-y-1.5 text-sm">
                {uncovered.map((c) => (
                  <li key={c.id} className="flex gap-2 text-amber-700 dark:text-amber-300">
                    <span className="font-mono text-xs">{c.id}</span>
                    <span className="line-clamp-2">{c.text}</span>
                  </li>
                ))}
                <li className="text-xs text-stone-500">这些已采用的主张还没有放进任何一节。</li>
              </ul>
            ) : (
              <p className="text-sm text-stone-500">已采用的 {accepted.length} 条主张都有位置。</p>
            )}
          </Card>

          <Card title={`视觉规划（${figures.length} 张图）`}>
            {context.visualStyle && (
              <div className="mb-2.5 rounded-lg bg-violet-50/70 px-2.5 py-1.5 text-xs text-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
                <span className="font-semibold">本篇画风：</span>
                {context.visualStyle.name || context.visualStyle.id}
              </div>
            )}
            {figures.length > 0 ? (
              <ul className="space-y-2 text-xs">
                {figures.map((f) => {
                  const status = context.figures.find((x) => x.id === f.id)?.status ?? "planned";
                  const vRole = VISUAL_ROLES.find((r) => r.id === f.role);
                  return (
                    <li key={f.id} className="rounded-lg border border-stone-200/80 p-2 dark:border-stone-800">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-stone-700 dark:text-stone-200">{f.id}</span>
                        <Badge tone={f.kind === "raster" ? "violet" : "gray"}>{f.kind}</Badge>
                        {vRole && <Badge tone={vRole.tone}>{vRole.label}</Badge>}
                        <span className="ml-auto">
                          <Badge tone={status === "accepted" ? "green" : status === "drafted" ? "blue" : "gray"}>{status}</Badge>
                        </span>
                        <button
                          type="button"
                          title="移除此图规划"
                          onClick={() => {
                            setFigures((list) => list.filter((x) => x.id !== f.id));
                            setSections((list) => list.map((s) => ({ ...s, figureIds: (s.figureIds ?? []).filter((id) => id !== f.id) })));
                          }}
                          className="text-stone-400 hover:text-rose-600"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                      {(f.intent || f.takeaway || f.prompt || f.caption) && (
                        <p className="mt-1 line-clamp-2 text-stone-500">
                          {f.takeaway ? `图眼：${f.takeaway}` : f.intent ? `意图：${f.intent}` : f.prompt ? `Prompt：${f.prompt}` : f.caption}
                        </p>
                      )}
                      {!!f.blockIds?.length && (
                        <div className="mt-1 font-mono text-[11px] text-stone-400">挂于：{f.blockIds.join("、")}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs leading-relaxed text-stone-500">
                在复杂机制、方案反差或生活类比处点击各节的「+ AI 多模态生图」或「+ 矢量图/流程」，用一图胜千言代替冗长文字。
              </p>
            )}
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
        status={noBlocks.length ? `「${noBlocks.map((s) => s.title).join("」「")}」还没有块` : `${sections.length} 节，${usedBlocks().size} 块，${figures.length} 张配图`}
        onAction={onAction}
        actions={[
          { id: "revise", label: "让 agent 重排", icon: <Send className="size-4" />, disabled: !comments.length && !draft.note.trim(), hint: "需要批注或整体意见" },
          { id: "confirm", label: "确认大纲", icon: <Check className="size-4" />, variant: "primary", disabled: noBlocks.length > 0 || sections.some((s) => !s.title.trim()) },
        ]}
      />
    </>
  );
}
