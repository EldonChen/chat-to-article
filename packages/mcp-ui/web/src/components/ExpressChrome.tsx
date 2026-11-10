import clsx from "clsx";
import type { ReactNode } from "react";

export const DIAGNOSTIC_CHIPS = [
  { id: "bridge", label: "看不懂 / 过渡生硬" },
  { id: "metaphor", label: "记不住 / 比喻跑偏" },
  { id: "hook", label: "不吸引 / 故事弱" },
  { id: "jargon", label: "术语太硬" },
] as const;

export function toggleChip(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function chipSuffix(selected: string[]): string {
  const labels = DIAGNOSTIC_CHIPS.filter((chip) => selected.includes(chip.id)).map((chip) => chip.label);
  return labels.length ? `诊断：${labels.join("、")}` : "";
}

export function withChips(note: string, selected: string[]): string | undefined {
  const suffix = chipSuffix(selected);
  const text = [suffix, note.trim()].filter(Boolean).join("\n");
  return text || undefined;
}

/** 快审顶部：主线、钩子、结构先出现，诊断意见用芯片，不必先划词。 */
export function ExpressChrome({
  express,
  onExpress,
  thread,
  hook,
  structure,
  chips,
  onChip,
  children,
}: {
  express: boolean;
  onExpress: (value: boolean) => void;
  thread: string;
  hook: string;
  structure: string;
  chips: string[];
  onChip: (id: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-500">{express ? "轻量快审 · 先确认这三句，细项按需展开" : "完整字段已展开"}</p>
        <button
          type="button"
          onClick={() => onExpress(!express)}
          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
        >
          {express ? "展开全部字段" : "回到快审"}
        </button>
      </div>
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 dark:border-emerald-900 dark:bg-emerald-950/40">
        <div className="text-xs font-semibold tracking-wide text-emerald-800 dark:text-emerald-200">核心决策摘要</div>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="text-xs text-stone-500">一句话主线</dt>
            <dd className="mt-1 text-base font-medium leading-relaxed text-stone-900 dark:text-stone-50">{thread.trim() || "还没有写成一句能复述的话"}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">开篇故事钩子</dt>
            <dd className="mt-1 text-sm leading-relaxed text-stone-700 dark:text-stone-200">{hook.trim() || "还没有可指认的场景"}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">关键结构</dt>
            <dd className="mt-1 text-sm leading-relaxed text-stone-700 dark:text-stone-200">{structure.trim() || "还没有这一篇的推进路径"}</dd>
          </div>
        </dl>
      </section>
      <div className="flex flex-wrap gap-2">
        {DIAGNOSTIC_CHIPS.map((chip) => {
          const on = chips.includes(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => onChip(chip.id)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-sm leading-none transition",
                on
                  ? "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100"
                  : "border-stone-200 text-stone-600 hover:border-stone-300 dark:border-stone-700 dark:text-stone-300",
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}
