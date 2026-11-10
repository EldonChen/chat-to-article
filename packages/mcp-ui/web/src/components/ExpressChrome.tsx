import clsx from "clsx";
import type { ReactNode } from "react";

export interface ChipPlay {
  id: string;
  label: string;
  diagnosis: string;
  move: string;
  preview: string;
}

/** 计划页快审：点一下就有诊断、改法和一句预览，不必先划词。 */
export const DIAGNOSTIC_CHIPS: readonly ChipPlay[] = [
  {
    id: "bridge",
    label: "看不懂 / 过渡生硬",
    diagnosis: "下一节第一句没有接住上一节留下的物件。",
    move: "本节最后交一个具体物件，下一节第一句先点名它。",
    preview: "上一节留下的那张表还在柜台上。这一节先接住它，再往下写。",
  },
  {
    id: "metaphor",
    label: "记不住 / 比喻跑偏",
    diagnosis: "这一段又开了一套新画面。",
    move: "删掉新比喻，只用贯穿全文的那一套部件。",
    preview: "仍用同一套：章、格子、下一笔。不要再换一条管子或另一对圆。",
  },
  {
    id: "hook",
    label: "不吸引 / 故事弱",
    diagnosis: "开篇在解释，没有人和失败的物件。",
    move: "补上时间、手里的东西、停住的动作。先不要下定义。",
    preview: "夜里两点，回包上了色。手指停在解析函数上，不敢往下办。",
  },
  {
    id: "jargon",
    label: "术语太硬",
    diagnosis: "名字出现在画面前面。",
    move: "先写读者能看见的动作，名字挂在动作之后。",
    preview: "先看见有人按住下一笔，然后才叫它受约束解码。",
  },
] as const;

/** 成稿按段微调。点段、点芯片，批注里出现可执行的一句，不必先划词。 */
export const SECTION_CHIPS: readonly ChipPlay[] = [
  {
    id: "lost",
    label: "看不懂",
    diagnosis: "这一段的第一句读者接不上。",
    move: "第一句改成上一节留下的那个物件。",
    preview: "先点名上一段交出来的东西，再写本段的新动作。",
  },
  {
    id: "jump",
    label: "跳了",
    diagnosis: "中间少了读者本来会猜的那一步。",
    move: "在机制前面补一句将被推翻的解释。",
    preview: "你多半会猜是规则没写严。先把这句写上，再用仍然合法的荒谬结果推翻它。",
  },
  {
    id: "metaphor-off",
    label: "比喻跑偏",
    diagnosis: "这段换了一套画面。",
    move: "改回贯穿比喻里的同一个部件。",
    preview: "这里仍说章和格子，不另起一个比喻。",
  },
  {
    id: "term",
    label: "术语没解释",
    diagnosis: "名字先于动作。",
    move: "把术语挪到动作句的后面。",
    preview: "先写按住、落笔、挪格，最后才挂上那个名字。",
  },
  {
    id: "emphasis",
    label: "这句是重点",
    diagnosis: "读者合上文章应该记住的那一句埋在段中。",
    move: "把它放到段末，单独成句。",
    preview: "段末只留主线那一句，前后不再加解释。",
  },
  {
    id: "figure",
    label: "图没冲击力",
    diagnosis: "图是横向流程，看不出反差。",
    move: "改成一张能单独看出差异的对比或解剖。",
    preview: "左边是已经盖章的回包，右边是同一份回包里还没核的人。",
  },
  {
    id: "ok",
    label: "可以",
    diagnosis: "这一段先不动。",
    move: "跳过这一段，只修订被点过的段。",
    preview: "这一段保持原文。",
  },
] as const;

export function toggleChip(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function chipPlay(id: string): ChipPlay | undefined {
  return DIAGNOSTIC_CHIPS.find((chip) => chip.id === id) ?? SECTION_CHIPS.find((chip) => chip.id === id);
}

export function chipNote(play: ChipPlay, where?: string): string {
  const place = where ? `${where} · ` : "";
  return `【${place}${play.label}】${play.diagnosis}${play.move} 预览：${play.preview}`;
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

export function appendChipNote(note: string, play: ChipPlay, where?: string): string {
  const line = chipNote(play, where);
  if (note.includes(line)) return note;
  return [note.trim(), line].filter(Boolean).join("\n");
}

/** 快审顶部：主线、钩子、结构先出现。点中的芯片立刻给出改句和预览。 */
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
  const selected = DIAGNOSTIC_CHIPS.filter((chip) => chips.includes(chip.id));
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
      {selected.map((chip) => (
        <section key={chip.id} className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="text-sm font-medium text-amber-950 dark:text-amber-100">{chip.label}</div>
          <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-200">{chip.diagnosis}{chip.move}</p>
          <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm leading-relaxed text-stone-800 dark:bg-stone-900 dark:text-stone-100">预览：{chip.preview}</p>
        </section>
      ))}
      {children}
    </div>
  );
}

/** 成稿快审里的按段芯片。选中一段再点芯片，父组件把改句写入批注。 */
export function SectionTweaks({
  paragraphs,
  active,
  onSelect,
  onChip,
  preview,
}: {
  paragraphs: string[];
  active: number;
  onSelect: (index: number) => void;
  onChip: (id: string) => void;
  preview: string;
}) {
  const shown = paragraphs.slice(0, 6);
  if (!shown.length) return null;
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="text-sm font-medium text-stone-800 dark:text-stone-100">按段微调</div>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">先点一段，再点芯片。改句会写进下面的批注，不用先划词。</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {shown.map((paragraph, index) => (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            className={clsx(
              "max-w-full rounded-lg border px-2 py-1 text-left text-xs leading-relaxed",
              active === index
                ? "border-emerald-400 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300",
            )}
          >
            第{index + 1}段 {paragraph.slice(0, 28)}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SECTION_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => onChip(chip.id)}
            className="rounded-full border border-stone-200 px-3 py-1.5 text-sm text-stone-700 hover:border-amber-300 hover:bg-amber-50 dark:border-stone-700 dark:text-stone-200"
          >
            {chip.label}
          </button>
        ))}
      </div>
      {preview ? <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-sm leading-relaxed text-stone-800 dark:bg-stone-950 dark:text-stone-100">{preview}</p> : null}
    </section>
  );
}
