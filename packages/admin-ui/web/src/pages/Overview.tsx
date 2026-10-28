import { ArrowRight, BookOpenText, CheckCircle2, FilePenLine, PenLine, SpellCheck } from "lucide-react";
import { Link } from "react-router";
import { useArticles, useContext, useLexicon, useVoice } from "../api.ts";
import { ArticleCard, AttentionList, PhaseBadge } from "../components/article.tsx";
import { Card, Empty, ErrorBox, Loading, PageHeader, Stat, StatusBadge } from "../components/ui.tsx";
import { attention, PHASES } from "../lib/format.ts";
import { useUi } from "../store.ts";

function PhaseFunnel() {
  const { data = [] } = useArticles();
  const setPhaseFilter = useUi((s) => s.setPhaseFilter);
  const max = Math.max(1, ...PHASES.map((p) => data.filter((a) => a.meta.phase === p.id).length));
  return (
    <div className="space-y-2">
      {PHASES.map((phase) => {
        const count = data.filter((a) => a.meta.phase === phase.id).length;
        return (
          <Link
            key={phase.id}
            to="/articles"
            onClick={() => setPhaseFilter(phase.id)}
            className="group grid grid-cols-[5rem_1fr_2rem] items-center gap-3 text-sm"
            title={phase.hint}
          >
            <span className="text-stone-500 group-hover:text-indigo-600 dark:text-stone-400">{phase.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
              <span className="block h-full rounded-full bg-indigo-400 transition-all group-hover:bg-indigo-500" style={{ width: `${(count / max) * 100}%` }} />
            </span>
            <span className="text-right tabular-nums text-stone-600 dark:text-stone-300">{count}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function OverviewPage() {
  const articles = useArticles();
  const voice = useVoice();
  const lexicon = useLexicon();
  const ctx = useContext();
  if (articles.error) return <ErrorBox error={articles.error} />;
  const list = articles.data ?? [];
  const needs = list.filter((a) => attention(a).some((x) => x.level !== "info"));
  const pendingBlocks = list.reduce((n, a) => n + a.blocks.draft + a.blocks.stale, 0);
  const profile = voice.data?.profile;
  const activeRules = profile?.rules?.filter((r) => r.status === "active").length ?? 0;
  const bans = lexicon.data?.effective.filter((e) => e.severity === "ban").length ?? 0;

  return (
    <>
      <PageHeader title="概览" subtitle={ctx.data ? `正在查看 ${ctx.data.root}` : undefined} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="文章" value={list.length} hint={`${list.filter((a) => a.hasExport).length} 篇已有分享包`} icon={<BookOpenText className="size-4" />} />
        <Stat label="待审块" value={pendingBlocks} hint="草稿与待复核" icon={<FilePenLine className="size-4" />} />
        <Stat
          label="风格版本"
          value={profile ? `r${profile.revision}` : "—"}
          hint={profile ? `${activeRules} 条生效规则` : "声音目录还没有 profile.json"}
          icon={<PenLine className="size-4" />}
        />
        <Stat
          label="词表"
          value={lexicon.data?.effective.length ?? "—"}
          hint={`${bans} 条禁用 · 私有 ${lexicon.data?.private.length ?? 0} 条`}
          icon={<SpellCheck className="size-4" />}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="需要关注"
            actions={needs.length ? <span className="text-xs text-stone-400">{needs.length} 篇</span> : null}
            padded={false}
          >
            {articles.isLoading ? (
              <div className="p-4">
                <Loading />
              </div>
            ) : needs.length ? (
              <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                {needs.map((a) => (
                  <li key={a.id}>
                    <Link to={`/articles/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{a.meta.title || a.meta.slug}</span>
                          <PhaseBadge phase={a.meta.phase} />
                        </div>
                        <div className="mt-1.5">
                          <AttentionList article={a} compact />
                        </div>
                      </div>
                      <ArrowRight className="size-4 text-stone-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-stone-500">
                <CheckCircle2 className="size-4 text-emerald-500" /> 没有需要处理的问题。
              </div>
            )}
          </Card>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-200">最近更新</h2>
              <Link to="/articles" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                全部文章
              </Link>
            </div>
            {articles.isLoading ? (
              <Loading />
            ) : list.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {list.slice(0, 4).map((a) => (
                  <ArticleCard key={a.id} article={a} />
                ))}
              </div>
            ) : (
              <Empty icon={<BookOpenText className="size-8" />} title="当前目录下还没有文章">
                文章目录里需要有 <code>meta.json</code>。可以换一个目录启动，或用 <code>--root</code> 指定。
              </Empty>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card title="阶段分布">
            <PhaseFunnel />
          </Card>
          <Card
            title="写作风格"
            actions={
              <Link to="/voice" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                详情
              </Link>
            }
          >
            {voice.data && !voice.data.exists ? (
              <p className="text-sm text-stone-500">声音目录不存在。第一次运行 skill 时会自动创建。</p>
            ) : profile ? (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge status="active" label={`r${profile.revision}`} />
                  {profile.person && <StatusBadge status="planned" label={profile.person} />}                </div>
                <ul className="space-y-1.5">
                  {(profile.rules ?? []).filter((r) => r.status === "active").slice(0, 4).map((r) => (
                    <li key={r.id} className="flex gap-2 text-stone-600 dark:text-stone-300">
                      <span className="font-mono text-xs text-stone-400">{r.id}</span>
                      <span>{r.text}</span>
                    </li>
                  ))}
                  {!activeRules && <li className="text-stone-400">还没有生效规则</li>}
                </ul>
                {!!voice.data?.candidates.length && (
                  <div className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                    {voice.data.candidates.length} 条风格候选等待确认
                  </div>
                )}
              </div>
            ) : (
              <Loading />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
