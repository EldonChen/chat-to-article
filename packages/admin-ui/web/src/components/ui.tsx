import clsx from "clsx";
import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { statusLabel } from "../lib/format.ts";

export function Card({ title, actions, children, className, padded = true }: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={clsx(
        "rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
          <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">{title}</h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(padded && "p-4")}>{children}</div>
    </section>
  );
}

const TONE: Record<string, string> = {
  accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  allow: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  draft: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
  drafted: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
  candidate: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900",
  planned: "bg-stone-100 text-stone-600 ring-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700",
  missing: "bg-stone-100 text-stone-500 ring-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:ring-stone-700",
  stale: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  disputed: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  watch: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  prefer: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900",
  ban: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900",
  enforce: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-900",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE[status] ?? "bg-stone-100 text-stone-600 ring-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700",
      )}
    >
      {label ?? statusLabel(status)}
    </span>
  );
}

export function Tag({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300",
        mono && "font-mono",
      )}
    >
      {children}
    </span>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-center justify-between text-xs font-medium text-stone-500 dark:text-stone-400">
        <span>{label}</span>
        <span className="text-stone-400">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">{value}</div>
      {hint && <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{hint}</div>}
    </div>
  );
}

export function ProgressBar({ value, segments }: { value?: number; segments?: { value: number; className: string; label: string }[] }) {
  if (segments) {
    const total = segments.reduce((a, s) => a + s.value, 0) || 1;
    return (
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        {segments.map((s) =>
          s.value ? <div key={s.label} title={`${s.label} ${s.value}`} className={s.className} style={{ width: `${(s.value / total) * 100}%` }} /> : null,
        )}
      </div>
    );
  }
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 px-6 py-12 text-center dark:border-stone-700">
      {icon && <div className="text-stone-400">{icon}</div>}
      <div className="text-sm font-medium text-stone-700 dark:text-stone-200">{title}</div>
      {children && <div className="max-w-md text-sm text-stone-500 dark:text-stone-400">{children}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; count?: number; tone?: "danger" | "warn" }[];
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-stone-200 dark:border-stone-800" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={value === item.id}
          onClick={() => onChange(item.id)}
          className={clsx(
            "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
            value === item.id
              ? "border-indigo-500 font-medium text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200",
          )}
        >
          {item.label}
          {item.count != null && (
            <span
              className={clsx(
                "rounded-full px-1.5 text-xs tabular-nums",
                item.tone === "danger"
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                  : item.tone === "warn"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
              )}
            >
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items }: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={clsx(
            "rounded-md px-2.5 py-1 text-xs transition",
            value === item.id
              ? "bg-white font-medium text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-50"
              : "text-stone-500 hover:text-stone-800 dark:text-stone-400",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title="复制"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-stone-800 dark:hover:text-stone-200"
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {label}
    </button>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-stone-500 dark:text-stone-400">{k}</dt>
          <dd className="min-w-0 break-words text-stone-800 dark:text-stone-200">{v ?? <span className="text-stone-400">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-stone-200/60 dark:bg-stone-800/60" />
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const buttonClass = (variant: "primary" | "secondary" | "ghost" = "secondary") =>
  clsx(
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" && "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500",
    variant === "secondary" &&
      "border border-stone-200 bg-white text-stone-700 shadow-sm hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800",
    variant === "ghost" && "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800",
  );
