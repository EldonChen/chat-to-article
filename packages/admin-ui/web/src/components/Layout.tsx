import clsx from "clsx";
import {
  BookOpenText,
  Download,
  FolderOpen,
  LayoutDashboard,
  Lock,
  Monitor,
  Moon,
  PenLine,
  RefreshCw,
  Search,
  SpellCheck,
  Sun,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useArticles, useContext, useVoice } from "../api.ts";
import { useUi, type Theme } from "../store.ts";
import { CopyButton } from "./ui.tsx";

function useApplyTheme() {
  const theme = useUi((s) => s.theme);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

function NavItem({ to, icon, label, count, end }: { to: string; icon: ReactNode; label: string; count?: number; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
          isActive
            ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
            : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100",
        )
      }
    >
      <span className="[&_svg]:size-4">{icon}</span>
      <span className="flex-1">{label}</span>
      {count != null && <span className="text-xs tabular-nums text-stone-400">{count}</span>}
    </NavLink>
  );
}

function PathRow({ label, value, missing }: { label: string; value: string | null | undefined; missing?: string }) {
  return (
    <div className="group">
      <div className="text-[11px] uppercase tracking-wide text-stone-400">{label}</div>
      <div className="flex items-start gap-1">
        <div className={clsx("min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed", value ? "text-stone-600 dark:text-stone-300" : "text-amber-600")}>
          {value ?? missing}
        </div>
        {value && (
          <span className="opacity-0 transition group-hover:opacity-100">
            <CopyButton text={value} />
          </span>
        )}
      </div>
    </div>
  );
}

const THEMES: { id: Theme; icon: ReactNode; label: string }[] = [
  { id: "light", icon: <Sun className="size-3.5" />, label: "浅色" },
  { id: "system", icon: <Monitor className="size-3.5" />, label: "跟随系统" },
  { id: "dark", icon: <Moon className="size-3.5" />, label: "深色" },
];

function TopBar() {
  const { search, setSearch, autoRefresh, toggleAutoRefresh, theme, setTheme } = useUi();
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const fetching = useIsFetching();
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-stone-200 bg-stone-50/85 px-6 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/85">
      <label className="relative flex max-w-md flex-1 items-center">
        <Search className="pointer-events-none absolute left-3 size-4 text-stone-400" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!location.pathname.startsWith("/articles")) navigate("/articles");
          }}
          placeholder="搜索文章标题、slug、主题或路径"
          className="w-full rounded-lg border border-stone-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none ring-indigo-500/30 placeholder:text-stone-400 focus:border-indigo-400 focus:ring-4 dark:border-stone-700 dark:bg-stone-900"
        />
      </label>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1 rounded-full bg-stone-200/70 px-2 py-0.5 text-xs text-stone-600 sm:inline-flex dark:bg-stone-800 dark:text-stone-300">
          <Lock className="size-3" /> 只读
        </span>
        <button
          onClick={toggleAutoRefresh}
          title="每 4 秒从磁盘重新读取"
          className={clsx(
            "rounded-lg px-2 py-1 text-xs",
            autoRefresh ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800",
          )}
        >
          {autoRefresh ? "自动刷新中" : "自动刷新已关"}
        </button>
        <button
          onClick={() => client.invalidateQueries()}
          title="立即刷新"
          className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-stone-800"
        >
          <RefreshCw className={clsx("size-4", fetching > 0 && "animate-spin")} />
        </button>
        <div className="flex rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800">
          {THEMES.map((t) => (
            <button
              key={t.id}
              title={t.label}
              onClick={() => setTheme(t.id)}
              className={clsx(
                "rounded-md p-1.5",
                theme === t.id ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white" : "text-stone-500",
              )}
            >
              {t.icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Layout() {
  useApplyTheme();
  const ctx = useContext();
  const articles = useArticles();
  const voice = useVoice();
  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <div className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">文</div>
          <div>
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-50">聊出文章来</div>
            <div className="text-[11px] text-stone-400">管理台 {ctx.data ? `v${ctx.data.version}` : ""}</div>
          </div>
        </div>
        <nav className="space-y-0.5 px-3">
          <NavItem to="/" end icon={<LayoutDashboard />} label="概览" />
          <NavItem to="/articles" icon={<BookOpenText />} label="文章" count={articles.data?.length} />
          <div className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-stone-400">声音目录</div>
          <NavItem to="/voice" icon={<PenLine />} label="写作风格" count={voice.data?.profile ? voice.data.profile.revision : undefined} />
          <NavItem to="/lexicon" icon={<SpellCheck />} label="词表" />
          <div className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-stone-400">分享</div>
          <NavItem to="/export" icon={<Download />} label="导出" />
        </nav>
        <div className="mt-auto space-y-3 border-t border-stone-100 px-5 py-4 dark:border-stone-800">
          <div className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
            <FolderOpen className="size-3.5" /> 数据位置
          </div>
          <PathRow label="文章目录" value={ctx.data?.root} />
          <PathRow label="声音目录" value={ctx.data?.home} />
          <PathRow label="skill" value={ctx.data?.skillDir} missing="未找到（共享词表不可用）" />
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <TopBar />
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
