import clsx from "clsx";
import { FolderX, History, Lightbulb, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useArticles, useVoice } from "../api.ts";
import { Markdown } from "../components/Markdown.tsx";
import { Card, Empty, ErrorBox, KV, Loading, PageHeader, StatusBadge, Tabs, Tag } from "../components/ui.tsx";
import { diffLines } from "../lib/diff.ts";

type TabId = "profile" | "rules" | "exemplars" | "history" | "candidates";

function RevisionHistory() {
  const { data } = useVoice();
  const articles = useArticles();
  const history = data?.history ?? [];
  const [selected, setSelected] = useState<number | null>(null);
  const current = selected ?? history.at(-1)?.revision ?? null;
  const idx = history.findIndex((h) => h.revision === current);
  const lines = useMemo(() => {
    if (idx < 0) return [];
    const prev = idx > 0 ? JSON.stringify(history[idx - 1].profile, null, 2) : "";
    return diffLines(prev, JSON.stringify(history[idx].profile, null, 2));
  }, [history, idx]);
  if (!history.length) return <Empty icon={<History className="size-8" />} title="没有历史版本" />;
  const pinned = (rev: number) => (articles.data ?? []).filter((a) => a.meta.styleRevision === rev);
  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <ol className="space-y-1">
        {[...history].reverse().map((h) => (
          <li key={h.revision}>
            <button
              onClick={() => setSelected(h.revision)}
              className={clsx(
                "w-full rounded-lg px-3 py-2 text-left text-sm",
                h.revision === current ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "hover:bg-stone-100 dark:hover:bg-stone-800",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">r{h.revision}</span>
                {h.revision === data?.profile?.revision && <StatusBadge status="active" label="当前" />}
              </div>
              <div className="mt-0.5 text-xs text-stone-500">
                {(h.profile.rules ?? []).filter((r) => r.status === "active").length} 条规则 · {pinned(h.revision).length} 篇文章钉住
              </div>
            </button>
          </li>
        ))}
      </ol>
      <Card title={idx > 0 ? `r${history[idx - 1].revision} → r${current}` : `r${current}（最早版本）`} padded={false}>
        <pre className="max-h-[65vh] overflow-auto py-3 font-mono text-xs leading-relaxed">
          {lines.map((l, i) => (
            <div
              key={i}
              className={clsx(
                "px-4",
                l.type === "add" && "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
                l.type === "del" && "bg-rose-50 text-rose-800 line-through decoration-rose-300 dark:bg-rose-950/60 dark:text-rose-300",
                l.type === "same" && "text-stone-500",
              )}
            >
              {l.type === "add" ? "+ " : l.type === "del" ? "- " : "  "}
              {l.text}
            </div>
          ))}
        </pre>
        {!!pinned(current ?? -1).length && (
          <div className="border-t border-stone-100 px-4 py-3 text-xs text-stone-500 dark:border-stone-800">
            钉住这个版本的文章：{pinned(current ?? -1).map((a) => a.meta.title || a.meta.slug).join("、")}
          </div>
        )}
      </Card>
    </div>
  );
}

export function VoicePage() {
  const { tab = "profile" } = useParams();
  const navigate = useNavigate();
  const { data, error, isLoading } = useVoice();
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  if (!data.exists)
    return (
      <>
        <PageHeader title="写作风格" />
        <Empty icon={<FolderX className="size-8" />} title="声音目录不存在">
          <code>{data.home}</code> 还没有创建。第一次用 skill 新建文章时会自动生成；也可以用 <code>--home</code> 指向别的位置。
        </Empty>
      </>
    );
  const p = data.profile;
  const rules = p?.rules ?? [];
  const active = rules.filter((r) => r.status === "active");
  const cands = rules.filter((r) => r.status !== "active");
  const current = tab as TabId;

  return (
    <>
      <PageHeader
        title="写作风格"
        subtitle={<span className="font-mono">{data.home}</span>}
        actions={p && <StatusBadge status="active" label={`当前版本 r${p.revision}`} />}
      />
      {!!data.errors.length && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {data.errors.join("；")}
        </div>
      )}
      <Tabs<TabId>
        value={current}
        onChange={(t) => navigate(`/voice/${t === "profile" ? "" : t}`)}
        items={[
          { id: "profile", label: "档案" },
          { id: "rules", label: "规则", count: rules.length },
          { id: "exemplars", label: "范文", count: data.exemplars.length },
          { id: "history", label: "版本历史", count: data.history.length },
          { id: "candidates", label: "候选", count: data.candidates.length, tone: data.candidates.length ? "warn" : undefined },
        ]}
      />
      <div className="mt-5">
        {current === "profile" &&
          (p ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="基本设定">
                <KV
                  items={[
                    ["版本", `r${p.revision}`],
                    ["语言", p.locale || null],
                    ["读者", p.audience || null],
                    ["人称", p.person || null],
                    ["段落字数", p.paragraph ? `${p.paragraph.minChars ?? "?"} – ${p.paragraph.maxChars ?? "?"} 字` : null],
                    ["标题深度", p.structure?.headingDepth != null ? `${p.structure.headingDepth} 级` : null],
                    ["列表策略", p.structure?.listPolicy || null],
                  ]}
                />
              </Card>
              <Card title={`术语（${p.terms?.length ?? 0}）`} padded={false}>
                {p.terms?.length ? (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-stone-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">使用</th>
                        <th className="px-4 py-2 font-medium">不用</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {p.terms.map((t, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 text-emerald-700 dark:text-emerald-300">{t.prefer}</td>
                          <td className="px-4 py-2 text-stone-400 line-through">{t.avoid}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-4 text-sm text-stone-400">还没有术语偏好。</p>
                )}
              </Card>
              <Card title="规则摘要" className="lg:col-span-2">
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <div className="text-2xl font-semibold tabular-nums">{active.length}</div>
                    <div className="text-xs text-stone-500">生效规则（起草时注入）</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold tabular-nums">{cands.length}</div>
                    <div className="text-xs text-stone-500">候选规则（不注入）</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold tabular-nums">{p.exemplarRefs?.length ?? 0}</div>
                    <div className="text-xs text-stone-500">引用的范文</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold tabular-nums">{data.candidates.length}</div>
                    <div className="text-xs text-stone-500">待确认的风格候选</div>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <Empty title="没有 profile.json" />
          ))}

        {current === "rules" &&
          (rules.length ? (
            <div className="space-y-6">
              {[
                { title: "生效", list: active },
                { title: "候选", list: cands },
              ].map(({ title, list }) =>
                list.length ? (
                  <Card key={title} title={`${title}（${list.length}）`} padded={false}>
                    <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                      {list.map((r) => (
                        <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                          <span className="mt-0.5 font-mono text-xs text-stone-400">{r.id}</span>
                          <span className="flex-1 text-sm">{r.text}</span>
                          <StatusBadge status={r.strength} label={r.strength === "enforce" ? "强制" : "倾向"} />
                          {r.evidenceArticles != null && <Tag>证据 {r.evidenceArticles} 篇</Tag>}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : null,
              )}
            </div>
          ) : (
            <Empty icon={<ScrollText className="size-8" />} title="还没有规则">
              一篇文章结束时，确认的风格候选会通过 <code>bump-style</code> 写成规则。
            </Empty>
          ))}

        {current === "exemplars" &&
          (data.exemplars.length ? (
            <div className="space-y-4">
              {data.exemplars.map((e) => (
                <Card key={e.ref} title={<span className="font-mono">{e.ref}</span>} actions={e.referenced ? <StatusBadge status="active" label="已引用" /> : <StatusBadge status="planned" label="未引用" />}>
                  <Markdown text={e.content} className="prose-sm" />
                </Card>
              ))}
            </div>
          ) : (
            <Empty title="没有范文">范文放在声音目录的 exemplars/ 下，并在 profile.json 的 exemplarRefs 里引用。</Empty>
          ))}

        {current === "history" && <RevisionHistory />}

        {current === "candidates" &&
          (data.candidates.length ? (
            <div className="space-y-3">
              {data.candidates.map((c) => (
                <Card key={c.id}>
                  <div className="flex items-start gap-3">
                    <Lightbulb className="mt-0.5 size-4 text-violet-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{c.text}</span>
                        <StatusBadge status={c.status ?? "candidate"} />
                        {c.source && <Tag>{c.source === "observe" ? "从旧文观察" : c.source}</Tag>}
                      </div>
                      <div className="mt-1 font-mono text-xs text-stone-400">{c.id}</div>
                      {!!c.exemplars?.length && (
                        <ul className="mt-3 space-y-2">
                          {c.exemplars.map((x, i) => (
                            <li key={i} className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                              {x}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Empty icon={<Lightbulb className="size-8" />} title="没有待确认的候选" />
          ))}
      </div>
    </>
  );
}
