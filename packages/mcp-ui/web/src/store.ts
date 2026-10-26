import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

interface UiState {
  showMarkup: boolean;
  setShowMarkup: (value: boolean) => void;
}

export const useUi = create<UiState>()((set) => ({
  showMarkup: true,
  setShowMarkup: (showMarkup) => set({ showMarkup }),
}));

/** 沙箱 iframe 里 localStorage 可能不可用（访问即抛错），此时草稿只留在内存里。 */
const storage = (() => {
  try {
    const s = window.localStorage;
    s.getItem("cta-probe");
    return s;
  } catch {
    return null;
  }
})();

const draftKey = (sessionId: string) => `cta-draft:${sessionId}`;

export function clearDraft(sessionId: string): void {
  try {
    storage?.removeItem(draftKey(sessionId));
  } catch {
    // ignore
  }
}

/**
 * 每个审阅会话的草稿状态。宿主允许时存进 localStorage：
 * 对话界面重新渲染这个视图后，已做的修改还在；提交成功后清除。
 */
export function useDraft<T>(sessionId: string, initial: () => T): [T, (update: T | ((prev: T) => T)) => void] {
  const key = draftKey(sessionId);
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = storage?.getItem(key);
      if (saved) return JSON.parse(saved) as T;
    } catch {
      // ignore corrupt drafts
    }
    return initial();
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      try {
        storage?.setItem(key, JSON.stringify(value));
      } catch {
        // quota or sandbox restrictions
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [key, value]);
  return [value, setValue];
}
