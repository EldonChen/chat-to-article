import clsx from "clsx";
import { BookOpenText, X } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useArticles, type ArticleListItem } from "../api.ts";
import { AttentionList, BlockBar, ExportMenu, GateDots, PhaseBadge } from "../components/article.tsx";
import { Empty, ErrorBox, Loading, PageHeader, Segmented } from "../components/ui.tsx";
import { PHASES, phaseIndex, progress, relativeTime } from "../lib/format.ts";
import { useUi, type SortKey } from "../store.ts";

function matches(a: ArticleListItem, q: string) {
  if (!q) return true;
  const hay = [a.meta.title, a.meta.slug, a.meta.topic, a.relDir].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((part) => hay.includes(part));
}

export function ArticlesPage() {
  const { data, isLoading, error } = useArticles();
  const { search, setSearch, phaseFilter, setPhaseFilter, sort, setSort } = useUi();
  const navigate = useNavigate();

  const rows = useMemo(() => {
    const list = (data ?? []).filter((a) => matches(a, search) && (!phaseFilter || a.meta.phase === phaseFilter));
    const sorted = [...list];
    if (sort === "title") sorted.sort((a, b) => (a.meta.title || a.meta.slug).localeCompare(b.meta.title || b.meta.slug, "zh-CN"));
    else if (sort === "progress") sorted.sort((a, b) => progress(b) - progress(a) || phaseIndex(b.meta.phase) - phaseIndex(a.meta.phase));
    else sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sorted;
  }, [data, search, phaseFilter, sort]);

  if (error) return <ErrorBox error={error} />;

  return (
    <>
      <PageHeader
        title="文章"
        subtitle="当前目录下所有用聊出文章来创建的文章（含 meta.json 的目录）。"
        actions={
          <Segmented<SortKey>
            value={sort}
            onChange={setSort}
            items={[
              { id: "updated", label: "最近更新" },
              { id: "progress", label: "进度" },
              { id: "title", label: "标题" },
            ]}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setPhaseFilter(null)}
          className={clsx(
            "rounded-full px-3 py-1 text-xs",
            !phaseFilter ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300",
          )}
        >
          全部 {data?.length ?? 0}
        </button>
        {PHASES.map((p) => {
          const count = data?.filter((a) => a.meta.phase === p.id).length ?? 0;
          return (
            <button
              key={p.id}
              onClick={() => setPhaseFilter(phaseFilter === p.id ? null : p.id)}
              disabled={!count && phaseFilter !== p.id}
              className={clsx(
                "rounded-full px-3 py-1 text-xs disabled:opacity-40",
                phaseFilter === p.id
                  ? "bg-indigo-600 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300",
              )}
            >
              {p.label} {count}
            </button>
          );
        })}
        {search && (
          <button onClick={() => setSearch("")} className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            搜索：{search} <X className="size-3" />
          </button>
        )}
      </div>

      {isLoading ? (
        <Loading />
      ) : !rows.length ? (
        <Empty icon={<BookOpenText className="size-8" />} title={data?.length ? "没有符合条件的文章" : "当前目录下还没有文章"}>
          {data?.length ? "换个关键词或清除阶段筛选。" : "用 --root 指定包含 articles/ 的项目目录。"}
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500 dark:bg-stone-900 dark:text-stone-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">文章</th>
                <th className="px-4 py-2.5 font-medium">阶段</th>
                <th className="px-4 py-2.5 font-medium" title="计划 · 主张 · 大纲 · 正文 · 分享包">门禁</th>
                <th className="w-44 px-4 py-2.5 font-medium">正文块</th>
                <th className="px-4 py-2.5 font-medium">更新</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {rows.map((a) => (
                <tr
                  key={a.id}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest("a,button")) navigate(`/articles/${a.id}`);
                  }}
                  className="cursor-pointer align-top hover:bg-stone-50 dark:hover:bg-stone-800/40"
                >
                  <td className="max-w-sm px-4 py-3">
                    <div className="font-medium text-stone-900 dark:text-stone-50">{a.meta.title || a.meta.slug}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-stone-400">
                      <span className="font-mono">{a.relDir}</span>
                      {a.meta.topic && <span>· {a.meta.topic}</span>}
                      <span>· 风格 r{a.meta.styleRevision}</span>
                    </div>
                    <div className="mt-1.5">
                      <AttentionList article={a} compact />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <PhaseBadge phase={a.meta.phase} />
                  </td>
                  <td className="px-4 py-3">
                    <GateDots article={a} />
                  </td>
                  <td className="px-4 py-3">
                    <BlockBar article={a} />
                    <div className="mt-1 text-xs tabular-nums text-stone-500">
                      {a.blocks.accepted}/{a.blocks.total} 已接受
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-stone-500">{relativeTime(a.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <ExportMenu article={a} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
