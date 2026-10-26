import clsx from "clsx";
import { Check, Clock, RotateCcw, Send } from "lucide-react";
import { useMemo } from "react";
import type { FigureContext, ReviewFigureInput, ReviewFigureResult, SessionDetail } from "../../../src/shared/actions.ts";
import { ActionBar } from "../components/ActionBar.tsx";
import { Mermaid } from "../components/Mermaid.tsx";
import { TextDiff } from "../components/TextDiff.tsx";
import { Badge, buttonClass, Card, inputClass, useDarkMode } from "../components/ui.tsx";
import { compileRules } from "../editor/lint.ts";
import { useDraft } from "../store.ts";
import type { SubmitFn } from "./types.ts";

export function FigureView({ session, submit }: { session: SessionDetail<ReviewFigureInput, FigureContext>; submit: SubmitFn }) {
  const { input, context } = session;
  const dark = useDarkMode();
  const kind = input.kind ?? "mermaid";
  const [draft, setDraft] = useDraft(session.id, () => ({ source: input.source, caption: input.caption ?? "", alt: input.alt ?? "", note: "" }));
  const rules = useMemo(() => compileRules(context.rules), [context.rules]);
  const hits = useMemo(() => {
    const text = `${draft.caption}\n${draft.alt}`;
    return rules.flatMap((r) => [...text.matchAll(new RegExp(r.regex.source, r.regex.flags.includes("g") ? r.regex.flags : r.regex.flags + "g"))].map((m) => ({ id: r.id, severity: r.severity, text: m[0], replacement: r.replacement })));
  }, [rules, draft.caption, draft.alt]);
  const bans = hits.filter((h) => h.severity === "ban");
  const edited = draft.source !== input.source || draft.caption !== (input.caption ?? "") || draft.alt !== (input.alt ?? "");

  const onAction = (id: string) => {
    const result: ReviewFigureResult = { decision: id as ReviewFigureResult["decision"], source: draft.source, caption: draft.caption.trim(), alt: draft.alt.trim(), note: draft.note.trim() || undefined };
    submit(id, result);
  };

  return (
    <>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-4 @4xl:grid-cols-2">
        <Card title="预览" actions={<Badge>{kind}</Badge>}>
          <figure>
            <div className="min-h-48 rounded-lg bg-stone-50 p-4 dark:bg-stone-950">
              {kind === "mermaid" ? (
                <Mermaid source={draft.source} dark={dark} />
              ) : (
                <img alt={draft.alt} className="mx-auto max-w-full" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(draft.source)}`} />
              )}
            </div>
            <figcaption className="mt-3 text-center text-sm text-stone-500">{draft.caption || "（还没有图注）"}</figcaption>
          </figure>
        </Card>
        <div className="space-y-4">
          <Card
            title="源文件"
            actions={
              draft.source !== input.source && (
                <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setDraft((d) => ({ ...d, source: input.source }))}>
                  <RotateCcw className="size-3.5" /> 还原
                </button>
              )
            }
          >
            <textarea value={draft.source} onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))} spellCheck={false} rows={14} className={clsx(inputClass, "font-mono text-xs leading-relaxed")} />
          </Card>
          <Card title="图注与替代文字">
            <div className="space-y-3">
              <label className="block">
                <div className="mb-1 text-xs text-stone-500">图注：一句话说明读者该看出什么</div>
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
          {context.previousSource != null && context.previousSource !== input.source && (
            <Card title="agent 这一版相对上一版">
              <div className="font-mono text-xs">
                <TextDiff before={context.previousSource} after={input.source} />
              </div>
            </Card>
          )}
        </div>
      </div>
      <ActionBar
        note={draft.note}
        onNote={(note) => setDraft((d) => ({ ...d, note }))}
        status={bans.length ? `图注里有 ${bans.length} 处禁用说法` : edited ? "你的修改会写回图源和 manifest" : `图 ${input.figureId} · ${context.status}`}
        onAction={onAction}
        actions={[
          { id: "later", label: "稍后再说", icon: <Clock className="size-4" />, variant: "ghost" },
          { id: "revise", label: "让 agent 改", icon: <Send className="size-4" />, disabled: !draft.note.trim() && !edited, hint: "写下意见，或直接改源文件" },
          { id: "accept", label: "接受这张图", icon: <Check className="size-4" />, variant: "primary", disabled: bans.length > 0 || !draft.caption.trim() || !draft.alt.trim(), hint: "需要图注和替代文字" },
        ]}
      />
    </>
  );
}
