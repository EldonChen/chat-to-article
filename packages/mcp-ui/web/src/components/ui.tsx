import clsx from "clsx";
import { MessageSquarePlus } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDocumentTheme } from "@modelcontextprotocol/ext-apps/react";

export function Card({ title, actions, children, className, padded = true }: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={clsx("rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-2.5 dark:border-stone-800">
          <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">{title}</h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(padded && "p-4")}>{children}</div>
    </section>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  blue: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
  amber: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  red: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900",
  violet: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900",
  gray: "bg-stone-100 text-stone-600 ring-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={clsx("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone])}>{children}</span>;
}

export function Tag({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center rounded-md bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300", mono && "font-mono")}>
      {children}
    </span>
  );
}

export const buttonClass = (variant: "primary" | "secondary" | "ghost" | "danger" = "secondary", size: "sm" | "md" = "md") =>
  clsx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    size === "md" ? "px-3.5 py-2 text-sm" : "px-2.5 py-1 text-xs",
    variant === "primary" && "bg-emerald-600 text-white shadow-sm hover:bg-emerald-500",
    variant === "secondary" &&
      "border border-stone-200 bg-white text-stone-700 shadow-sm hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800",
    variant === "ghost" && "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800",
    variant === "danger" && "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-stone-900 dark:text-rose-300",
  );

export const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/20 placeholder:text-stone-400 focus:border-emerald-400 focus:ring-4 dark:border-stone-700 dark:bg-stone-900";

export function AutoTextarea({ value, onChange, placeholder, className, minRows = 2 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(inputClass, "resize-none leading-relaxed", className)}
    />
  );
}

export function Segmented<T extends string>({ value, onChange, items }: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: ReactNode; tone?: Tone }[];
}) {
  return (
    <div className="inline-flex rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800">
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          onClick={() => onChange(item.id)}
          className={clsx(
            "rounded-md px-2.5 py-1 text-xs transition",
            value === item.id
              ? clsx("font-medium shadow-sm", item.tone ? TONES[item.tone] : "bg-white text-stone-900 dark:bg-stone-700 dark:text-white")
              : "text-stone-500 hover:text-stone-800 dark:text-stone-400",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** 字段旁边的「批注」开关：展开后可以对这一项写意见，像 Word 的边注。 */
export function FieldComment({ value, onChange, label = "批注" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(!!value);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-amber-600">
        <MessageSquarePlus className="size-3.5" /> {label}
      </button>
    );
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2 dark:border-amber-900 dark:bg-amber-950/40">
      <AutoTextarea value={value} onChange={onChange} placeholder="写给 agent 的意见…" className="border-amber-200 bg-white/80 dark:border-amber-900" minRows={1} />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 px-6 py-12 text-center dark:border-stone-700">
      <div className="text-sm font-medium text-stone-700 dark:text-stone-200">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-stone-500">{children}</div>}
    </div>
  );
}

export function useDarkMode(): boolean {
  return useDocumentTheme() === "dark";
}
