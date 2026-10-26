import clsx from "clsx";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useSubmitState } from "../views/types.ts";
import { AutoTextarea, buttonClass } from "./ui.tsx";

export interface ActionButton {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  hint?: string;
}

/** 固定在页面底部的动作栏：整体意见 + 固定的几个动作按钮。点下去就把结果交回 agent。 */
export function ActionBar({ note, onNote, actions, onAction, status }: {
  note: string;
  onNote: (v: string) => void;
  actions: ActionButton[];
  onAction: (id: string) => void;
  status?: ReactNode;
}) {
  const { pending, error } = useSubmitState();
  return (
    <div className="sticky bottom-0 z-20 mt-auto border-t border-stone-200 bg-white/95 backdrop-blur dark:border-stone-800 dark:bg-stone-900/95">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 @4xl:flex-row @4xl:items-end">
        <div className="min-w-0 flex-1">
          <AutoTextarea value={note} onChange={onNote} placeholder="整体意见（可选）：会和你的修改一起交给 agent" minRows={1} />
          {(status || error) && (
            <div className={clsx("mt-1.5 text-xs", error ? "text-rose-600" : "text-stone-500")}>{error ?? status}</div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              title={a.hint}
              disabled={a.disabled || !!pending}
              onClick={() => onAction(a.id)}
              className={buttonClass(a.variant ?? "secondary")}
            >
              {pending === a.id ? <Loader2 className="size-4 animate-spin" /> : a.icon}
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
