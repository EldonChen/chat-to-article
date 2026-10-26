import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";
export type SortKey = "updated" | "title" | "progress";

interface UiState {
  theme: Theme;
  autoRefresh: boolean;
  search: string;
  phaseFilter: string | null;
  sort: SortKey;
  readerOnlyAccepted: boolean;
  readerShowMeta: boolean;
  exportSelection: string[];
  exportPrefer: "export" | "clean";
  setTheme: (theme: Theme) => void;
  toggleAutoRefresh: () => void;
  setSearch: (search: string) => void;
  setPhaseFilter: (phase: string | null) => void;
  setSort: (sort: SortKey) => void;
  setReaderOnlyAccepted: (value: boolean) => void;
  setReaderShowMeta: (value: boolean) => void;
  toggleExport: (id: string) => void;
  setExportSelection: (ids: string[]) => void;
  setExportPrefer: (prefer: "export" | "clean") => void;
}

/** 全局界面状态。服务端数据由 TanStack Query 管，这里只放跨页面共享的界面偏好与选择。 */
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: "system",
      autoRefresh: true,
      search: "",
      phaseFilter: null,
      sort: "updated",
      readerOnlyAccepted: false,
      readerShowMeta: true,
      exportSelection: [],
      exportPrefer: "export",
      setTheme: (theme) => set({ theme }),
      toggleAutoRefresh: () => set((s) => ({ autoRefresh: !s.autoRefresh })),
      setSearch: (search) => set({ search }),
      setPhaseFilter: (phaseFilter) => set({ phaseFilter }),
      setSort: (sort) => set({ sort }),
      setReaderOnlyAccepted: (readerOnlyAccepted) => set({ readerOnlyAccepted }),
      setReaderShowMeta: (readerShowMeta) => set({ readerShowMeta }),
      toggleExport: (id) =>
        set((s) => ({
          exportSelection: s.exportSelection.includes(id)
            ? s.exportSelection.filter((x) => x !== id)
            : [...s.exportSelection, id],
        })),
      setExportSelection: (exportSelection) => set({ exportSelection }),
      setExportPrefer: (exportPrefer) => set({ exportPrefer }),
    }),
    {
      name: "cta-admin-ui",
      partialize: (s) => ({
        theme: s.theme,
        autoRefresh: s.autoRefresh,
        sort: s.sort,
        readerOnlyAccepted: s.readerOnlyAccepted,
        readerShowMeta: s.readerShowMeta,
        exportPrefer: s.exportPrefer,
      }),
    },
  ),
);
