import clsx from "clsx";
import { AlertTriangle, Check, Clock, FileText, Image as ImageIcon, Link2, Plus, RotateCcw, Send, Sparkles, Wand2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { FigureContext, ReviewFigureInput, ReviewFigureResult, SessionDetail } from "../../../src/shared/actions.ts";
import { ActionBar } from "../components/ActionBar.tsx";
import { ExpressChrome, toggleChip, withChips } from "../components/ExpressChrome.tsx";
import { Mermaid } from "../components/Mermaid.tsx";
import { TextDiff } from "../components/TextDiff.tsx";
import { AutoTextarea, Badge, buttonClass, Card, inputClass, Tag, useDarkMode } from "../components/ui.tsx";
import { compileRules } from "../editor/lint.ts";
import { useDraft } from "../store.ts";
import { ASPECT_RATIOS, VISUAL_ROLES } from "./OutlineView.tsx";
import { VISUAL_STYLE_PRESETS } from "./PlanView.tsx";
import type { SubmitFn } from "./types.ts";

export function FigureView({ session, submit }: { session: SessionDetail<ReviewFigureInput, FigureContext>; submit: SubmitFn }) {
  const { input, context } = session;
  const dark = useDarkMode();
  const kind = input.kind ?? context.figure?.kind ?? "mermaid";
  const isTextSource = kind === "mermaid" || kind === "svg-chart";
  const initialBlockIds = input.blockIds ?? context.figure?.blockIds ?? context.linkedBlocks?.map((b) => b.id) ?? [];
  const initialRefs = input.referenceImages ?? context.figure?.referenceImages ?? [];
  const [draft, setDraft] = useDraft(session.id, () => ({
    source: input.source,
    caption: input.caption ?? context.figure?.caption ?? "",
    alt: input.alt ?? context.figure?.alt ?? "",
    role: input.role ?? context.figure?.role ?? "mechanism",
    intent: input.intent ?? context.figure?.intent ?? "",
    takeaway: input.takeaway ?? context.figure?.takeaway ?? "",
    anchorSummary: input.anchorSummary ?? context.figure?.anchorSummary ?? "",
    prompt: input.prompt ?? context.figure?.prompt ?? (kind === "raster" ? input.source : ""),
    aspectRatio: input.aspectRatio ?? context.figure?.aspectRatio ?? "16:9",
    referenceImages: initialRefs,
    blockIds: initialBlockIds,
    markBlocksStale: false,
    textSyncNote: "",
    note: "",
  }));
  const [newRefPath, setNewRefPath] = useState("");
  const [express, setExpress] = useState(true);
  const [chips, setChips] = useState<string[]>([]);

  const rules = useMemo(() => compileRules(context.rules), [context.rules]);
  const hits = useMemo(() => {
    const text = `${draft.caption}\n${draft.alt}\n${draft.takeaway}`;
    return rules.flatMap((r) =>
      [...text.matchAll(new RegExp(r.regex.source, r.regex.flags.includes("g") ? r.regex.flags : r.regex.flags + "g"))].map((m) => ({
        id: r.id,
        severity: r.severity,
        text: m[0],
        replacement: r.replacement,
      })),
    );
  }, [rules, draft.caption, draft.alt, draft.takeaway]);
  const bans = hits.filter((h) => h.severity === "ban");
  const sourceEdited = isTextSource
    ? draft.source !== input.source
    : draft.prompt !== (input.prompt ?? context.figure?.prompt ?? "");
  const metaEdited =
    draft.caption !== (input.caption ?? context.figure?.caption ?? "") ||
    draft.alt !== (input.alt ?? context.figure?.alt ?? "") ||
    draft.role !== (input.role ?? context.figure?.role ?? "mechanism") ||
    draft.intent !== (input.intent ?? context.figure?.intent ?? "") ||
    draft.takeaway !== (input.takeaway ?? context.figure?.takeaway ?? "") ||
    draft.anchorSummary !== (input.anchorSummary ?? context.figure?.anchorSummary ?? "") ||
    draft.aspectRatio !== (input.aspectRatio ?? context.figure?.aspectRatio ?? "16:9") ||
    JSON.stringify(draft.referenceImages) !== JSON.stringify(initialRefs) ||
    JSON.stringify(draft.blockIds) !== JSON.stringify(initialBlockIds);
  const edited = sourceEdited || metaEdited;

  const linkedBlocks = context.linkedBlocks ?? [];
  const allBlocks = context.allBlocks ?? [];
  const vRole = VISUAL_ROLES.find((r) => r.id === draft.role);
  const activeVisualPreset = VISUAL_STYLE_PRESETS.find((p) => p.id === context.visualStyle?.id);

  const onAction = (id: string) => {
    const result: ReviewFigureResult = {
      decision: id as ReviewFigureResult["decision"],
      source: draft.source,
      caption: draft.caption.trim(),
      alt: draft.alt.trim(),
      role: draft.role || undefined,
      intent: draft.intent.trim() || undefined,
      takeaway: draft.takeaway.trim() || undefined,
      anchorSummary: draft.anchorSummary.trim() || undefined,
      prompt: kind === "raster" ? draft.prompt.trim() : undefined,
      aspectRatio: kind === "raster" ? draft.aspectRatio : undefined,
      referenceImages: kind === "raster" ? draft.referenceImages : undefined,
      blockIds: draft.blockIds,
      markBlocksStale: draft.markBlocksStale || undefined,
      textSyncNote: draft.textSyncNote.trim() || undefined,
      note: withChips(draft.note, chips),
    };
    submit(id, result);
  };

  return (
    <>
      <ExpressChrome
        express={express}
        onExpress={setExpress}
        thread={draft.takeaway || "这张图 3 秒内要让人说出的那句"}
        hook={draft.intent || "开篇用强反差，机制用一张解剖"}
        structure={`${kind} · ${draft.role}`}
        chips={chips}
        onChip={(id) => setChips((list) => toggleChip(list, id))}
      />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-4 @4xl:grid-cols-2">
        <div className="space-y-4">
          <Card
            title="实时视觉预览"
            actions={
              <div className="flex items-center gap-1.5">
                {vRole && <Badge tone={vRole.tone}>{vRole.label}</Badge>}
                <Badge tone={kind === "raster" ? "violet" : "gray"}>{kind}</Badge>
              </div>
            }
          >
            {draft.takeaway.trim() && (
              <div className="mb-3 rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                <span className="font-semibold">一秒结论（图眼）：</span>
                {draft.takeaway}
              </div>
            )}
            <figure>
              <div className="min-h-48 rounded-lg bg-stone-50 p-4 dark:bg-stone-950">
                {kind === "mermaid" ? (
                  <Mermaid source={draft.source} dark={dark} />
                ) : kind === "svg-chart" ? (
                  <img alt={draft.alt} className="mx-auto max-w-full" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(draft.source)}`} />
                ) : context.imageDataUrl ? (
                  <img alt={draft.alt || input.figureId} className="mx-auto max-h-[28rem] rounded-lg object-contain shadow-sm" src={context.imageDataUrl} />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-xs text-stone-500">
                    <ImageIcon className="size-8 text-violet-500" />
                    <div className="font-medium text-stone-700 dark:text-stone-200">
                      多模态图片 {input.figureId} 尚未落盘或待调用 GenerateImage 生成
                    </div>
                    {draft.prompt && (
                      <p className="max-w-md rounded bg-white px-3 py-2 font-mono text-[11px] text-stone-600 shadow-xs dark:bg-stone-900 dark:text-stone-300">
                        Prompt: {draft.prompt}
                      </p>
                    )}
                    <span className="text-[11px] text-stone-400">可调整右侧 Prompt 与画幅比例后点击「让 agent 生图/改图」</span>
                  </div>
                )}
              </div>
              <figcaption className="mt-3 text-center text-sm text-stone-500">{draft.caption || "（还没有图注）"}</figcaption>
            </figure>
          </Card>

          <Card
            title={
              <span className="flex items-center gap-2">
                <FileText className="size-4 text-sky-600" />
                关联正文块对照 & 图文动态同步
              </span>
            }
            actions={<span className="text-xs text-stone-400">改图后可一键通知 agent 同步精简/对齐正文</span>}
          >
            <div className="space-y-3 text-xs">
              {allBlocks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-stone-500">挂载位置（点选切换）：</span>
                  {allBlocks.map((b) => {
                    const bound = draft.blockIds.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            blockIds: bound ? d.blockIds.filter((x) => x !== b.id) : [...d.blockIds, b.id],
                          }))
                        }
                        className={clsx(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono transition",
                          bound ? "bg-sky-600 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800",
                        )}
                      >
                        <Link2 className="size-3" /> {b.id}
                        {b.sectionTitle ? <span className="font-sans opacity-80">· {b.sectionTitle}</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}

              {linkedBlocks.length > 0 ? (
                <div className="space-y-2">
                  {linkedBlocks.map((b) => (
                    <div key={b.id} className="rounded-lg border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/50">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="font-mono font-semibold text-stone-700 dark:text-stone-200">
                          {b.id} {b.sectionTitle ? <span className="font-sans font-normal text-stone-500">（{b.sectionTitle}）</span> : null}
                        </span>
                        <Tag>{b.status}</Tag>
                      </div>
                      <p className="whitespace-pre-wrap font-serif text-xs leading-6 text-stone-700 dark:text-stone-200">
                        {b.body.trim() || "（这块还没有起草正文）"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-stone-400">当前还没有绑定或起草关联的正文块。</p>
              )}

              <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={draft.markBlocksStale}
                    onChange={(e) => setDraft((d) => ({ ...d, markBlocksStale: e.target.checked }))}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1 font-medium text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="size-3.5 text-amber-600" />
                      图结构、视觉隐喻或结论已调整，将关联正文块标为 stale 以便同步改文
                    </div>
                    <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                      遵循「看图写文、以图减文」原则：当画面细节、步骤顺序或对比维度发生变化时，勾选此项让 agent 同步修订对应段落。
                    </p>
                  </div>
                </label>
                <div className="mt-2">
                  <AutoTextarea
                    value={draft.textSyncNote}
                    onChange={(textSyncNote) => setDraft((d) => ({ ...d, textSyncNote, markBlocksStale: textSyncNote.trim() ? true : d.markBlocksStale }))}
                    placeholder="给正文块的联动修改指令（可选，例如：图里已经画清了四步流转，把 b002 里罗列步骤的句子删掉，直接点出单向引用关系）"
                    minRows={3}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title={
              <span className="flex items-center gap-2">
                <Sparkles className="size-4 text-emerald-600" />
                视觉设计简报与图文契约
              </span>
            }
          >
            <div className="space-y-3 text-xs">
              <div>
                <div className="mb-1.5 text-stone-500">视觉认知角色（这张图在文章里承担什么任务？）</div>
                <div className="flex flex-wrap gap-1.5">
                  {VISUAL_ROLES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      title={r.hint}
                      onClick={() => setDraft((d) => ({ ...d, role: r.id }))}
                      className={clsx(
                        "rounded-md border px-2 py-1 text-xs transition",
                        draft.role === r.id
                          ? "border-emerald-400 bg-emerald-50 font-medium text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                          : "border-stone-200 text-stone-500 hover:border-stone-300 dark:border-stone-700",
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <div className="mb-1 text-stone-500">配图意图（Visual Brief）：为什么这里需要一张图？替正文分担什么解释压力？</div>
                <AutoTextarea
                  value={draft.intent}
                  onChange={(intent) => setDraft((d) => ({ ...d, intent }))}
                  placeholder="例如：左边整篇都被写回，右边只写回这次提交的那一块。图上用文件和写回范围，不用另一套生活场景"
                  minRows={3}
                />
              </label>
              <label className="block">
                <div className="mb-1 text-stone-500">一秒结论（One-glance Takeaway）：读者扫一眼这张图 3 秒内得出的核心判断</div>
                <AutoTextarea
                  value={draft.takeaway}
                  onChange={(takeaway) => setDraft((d) => ({ ...d, takeaway }))}
                  placeholder="例如：修改只发生在单块文件内，主张与大纲作为上游契约按引用精确传播"
                  minRows={3}
                />
              </label>
              <label className="block">
                <div className="mb-1 text-stone-500">图文联动契约（Visual-Text Contract）：图中核心元素/节点词与正文删减约定</div>
                <AutoTextarea
                  value={draft.anchorSummary}
                  onChange={(anchorSummary) => setDraft((d) => ({ ...d, anchorSummary }))}
                  placeholder="例如：图中节点依次为「主张」→「大纲」→「正文块」→「分享包」；正文直接引用这四个名称，不重复抄写箭头顺序"
                  minRows={3}
                />
              </label>
            </div>
          </Card>

          {kind === "raster" ? (
            <Card
              title={
                <span className="flex items-center gap-2">
                  <Wand2 className="size-4 text-violet-600" />
                  多模态 AI 生图控制（GenerateImage）
                </span>
              }
              actions={
                sourceEdited && (
                  <button
                    type="button"
                    className={buttonClass("ghost", "sm")}
                    onClick={() => setDraft((d) => ({ ...d, prompt: input.prompt ?? context.figure?.prompt ?? "" }))}
                  >
                    <RotateCcw className="size-3.5" /> 还原 Prompt
                  </button>
                )
              }
            >
              <div className="space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-stone-500">画幅比例（aspect_ratio）：</span>
                  <div className="flex flex-wrap gap-1">
                    {ASPECT_RATIOS.map((ar) => (
                      <button
                        key={ar}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, aspectRatio: ar }))}
                        className={clsx(
                          "rounded px-2 py-0.5 font-mono text-xs transition",
                          draft.aspectRatio === ar
                            ? "bg-violet-600 text-white"
                            : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300",
                        )}
                      >
                        {ar}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-stone-500">
                    <span>画面描述（Prompt，支持五要素组装：画风前缀 + 主体动作隐喻 + 构图 + 色彩焦点 + 负向约束）</span>
                    {activeVisualPreset && !draft.prompt.includes(activeVisualPreset.promptPrefix) && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            prompt: `${activeVisualPreset.promptPrefix}. ${(d.prompt || d.intent || "").trim()}`.trim(),
                          }))
                        }
                        className="text-violet-600 hover:underline dark:text-violet-400"
                      >
                        + 注入本篇「{activeVisualPreset.name}」画风
                      </button>
                    )}
                  </div>
                  <AutoTextarea
                    value={draft.prompt}
                    onChange={(prompt) => setDraft((d) => ({ ...d, prompt }))}
                    placeholder="左边是什么，右边差在哪一个变量，视线先落在哪里"
                    minRows={6}
                    className="text-sm leading-relaxed"
                  />
                </div>

                {!express && (
                <div>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-stone-500">
                    <span>参考垫图（reference_image_paths，用于跨图锁定画风或草图转精图）：</span>
                    {context.styleAnchorImage && !draft.referenceImages.includes(context.styleAnchorImage) && (
                      <button
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, referenceImages: [...d.referenceImages, context.styleAnchorImage!] }))}
                        className="text-violet-600 hover:underline dark:text-violet-400"
                      >
                        + 引用本篇首图锚点锁画风
                      </button>
                    )}
                  </div>
                  {draft.referenceImages.length > 0 && (
                    <ul className="mb-2 space-y-1">
                      {draft.referenceImages.map((refPath, idx) => (
                        <li key={idx} className="flex items-center justify-between rounded bg-stone-100 px-2 py-1 font-mono text-[11px] dark:bg-stone-800">
                          <span className="truncate">{refPath}</span>
                          <button
                            type="button"
                            onClick={() => setDraft((d) => ({ ...d, referenceImages: d.referenceImages.filter((_, j) => j !== idx) }))}
                            className="ml-2 text-stone-400 hover:text-rose-600"
                          >
                            <X className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-1.5">
                    <input
                      value={newRefPath}
                      onChange={(e) => setNewRefPath(e.target.value)}
                      placeholder="输入参考图路径（如前一张图或 Mermaid 导出的草图路径）…"
                      className={clsx(inputClass, "font-mono text-xs")}
                    />
                    <button
                      type="button"
                      disabled={!newRefPath.trim()}
                      onClick={() => {
                        if (newRefPath.trim()) {
                          setDraft((d) => ({ ...d, referenceImages: [...d.referenceImages, newRefPath.trim()] }));
                          setNewRefPath("");
                        }
                      }}
                      className={buttonClass("secondary", "sm")}
                    >
                      <Plus className="size-3.5" /> 添加
                    </button>
                  </div>
                </div>
                )}
              </div>
            </Card>
          ) : (
            <Card
              title="源文件"
              actions={
                sourceEdited && (
                  <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setDraft((d) => ({ ...d, source: input.source }))}>
                    <RotateCcw className="size-3.5" /> 还原
                  </button>
                )
              }
            >
              <textarea
                value={draft.source}
                onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
                spellCheck={false}
                rows={11}
                className={clsx(inputClass, "font-mono text-xs leading-relaxed")}
              />
            </Card>
          )}

          <Card title="图注与替代文字">
            <div className="space-y-3">
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
                  <span>图注：一句话说明读者该看出什么结论（别只写「系统架构图」）</span>
                  {draft.takeaway.trim() && draft.caption !== draft.takeaway && (
                    <button
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, caption: d.takeaway }))}
                      className="text-emerald-600 hover:underline"
                    >
                      套用一秒结论
                    </button>
                  )}
                </div>
                <input value={draft.caption} onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))} className={inputClass} />
              </label>
              <label className="block">
                <div className="mb-1 text-xs text-stone-500">替代文字：看不到图的读者靠它理解</div>
                <textarea value={draft.alt} onChange={(e) => setDraft((d) => ({ ...d, alt: e.target.value }))} rows={2} className={inputClass} />
              </label>
              {hits.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {hits.map((h, i) => (
                    <Badge key={i} tone={h.severity === "ban" ? "red" : "amber"}>
                      {h.text}
                      {h.replacement && ` → ${h.replacement}`}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {context.previousSource != null && context.previousSource !== (isTextSource ? input.source : draft.prompt) && (
            <Card title="agent 这一版相对上一版">
              <div className="font-mono text-xs">
                <TextDiff before={context.previousSource} after={isTextSource ? input.source : draft.prompt} />
              </div>
            </Card>
          )}
        </div>
      </div>
      <ActionBar
        note={draft.note}
        onNote={(note) => setDraft((d) => ({ ...d, note }))}
        status={
          bans.length
            ? `图注里有 ${bans.length} 处禁用说法`
            : draft.markBlocksStale
              ? `提交后将同步把关联块（${draft.blockIds.join("、") || "无"}）标为 stale`
              : edited
                ? "你的修改会写回图源/Prompt 和 manifest"
                : `图 ${input.figureId} · ${context.status}`
        }
        onAction={onAction}
        actions={[
          { id: "later", label: "稍后再说", icon: <Clock className="size-4" />, variant: "ghost" },
          {
            id: "revise",
            label: kind === "raster" ? "让 agent 按 Prompt 生图/微调" : "让 agent 改图",
            icon: <Send className="size-4" />,
            disabled: !draft.note.trim() && !edited && !draft.textSyncNote.trim(),
            hint: "写下意见，或直接改 Prompt/源文件/设计简报",
          },
          {
            id: "accept",
            label: draft.markBlocksStale ? "接受图并标记正文待改" : "接受这张图",
            icon: <Check className="size-4" />,
            variant: "primary",
            disabled: bans.length > 0 || !draft.caption.trim() || !draft.alt.trim(),
            hint: "需要图注和替代文字",
          },
        ]}
      />
    </>
  );
}
