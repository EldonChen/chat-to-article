import clsx from "clsx";
import { Search, SpellCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useLexicon } from "../api.ts";
import { Card, Empty, ErrorBox, Loading, PageHeader, Segmented, StatusBadge, Tag } from "../components/ui.tsx";

type Severity = "all" | "ban" | "watch" | "allow";
type Origin = "all" | "shared" | "private";

export function LexiconPage() {
  const { data, error, isLoading } = useLexicon();
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState<Severity>("all");
  const [origin, setOrigin] = useState<Origin>("all");

  const rows = useMemo(
    () =>
      (data?.effective ?? []).filter(
        (e) =>
          (severity === "all" || e.severity === severity) &&
          (origin === "all" || e.origin === origin) &&
          (!q || `${e.id} ${e.text} ${e.replacement ?? ""}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, q, severity, origin],
  );

  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;

  const count = (s: string) => data.effective.filter((e) => e.severity === s).length;
  const allowEntries = data.private.filter((e) => e.action === "allow");

  return (
    <>
      <PageHeader
        title="词表"
        subtitle="共享词表来自 skill 目录，私有词表来自声音目录。下面是两者合并后的生效结果。"
      />
      {!data.skillDir && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          没找到 chat-to-article skill，只显示私有词表。可以用 <code>--skill</code> 指定 skill 目录，或设置 <code>CHAT_TO_ARTICLE_SKILL</code>。
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "禁用", value: count("ban"), tone: "text-rose-600" },
          { label: "观察", value: count("watch"), tone: "text-amber-600" },
          { label: "放行", value: count("allow"), tone: "text-emerald-600" },
          { label: "私有条目", value: data.private.length, tone: "text-indigo-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <div className="text-xs text-stone-500">{s.label}</div>
            <div className={clsx("mt-1 text-2xl font-semibold tabular-nums", s.tone)}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
            <label className="relative flex min-w-48 flex-1 items-center">
              <Search className="pointer-events-none absolute left-2.5 size-3.5 text-stone-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="筛选词条"
                className="w-full rounded-lg border border-stone-200 bg-transparent py-1 pl-8 pr-2 text-sm outline-none focus:border-indigo-400 dark:border-stone-700"
              />
            </label>
            <Segmented<Severity>
              value={severity}
              onChange={setSeverity}
              items={[
                { id: "all", label: "全部" },
                { id: "ban", label: "禁用" },
                { id: "watch", label: "观察" },
                { id: "allow", label: "放行" },
              ]}
            />
            <Segmented<Origin>
              value={origin}
              onChange={setOrigin}
              items={[
                { id: "all", label: "全部来源" },
                { id: "shared", label: "共享" },
                { id: "private", label: "私有" },
              ]}
            />
          </div>
          {rows.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="px-4 py-2 font-medium">说法 / 句式</th>
                  <th className="px-4 py-2 font-medium">生效</th>
                  <th className="px-4 py-2 font-medium">来源</th>
                  <th className="px-4 py-2 font-medium">id</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {rows.map((e) => (
                  <tr key={`${e.origin}-${e.id}`} className={clsx(e.allowed && "opacity-60")}>
                    <td className="px-4 py-2.5">
                      <span className={clsx(e.kind === "pattern" && "font-mono text-xs", e.allowed && "line-through")}>{e.text}</span>
                      {e.replacement && <span className="ml-2 text-xs text-sky-600 dark:text-sky-400">→ {e.replacement}</span>}
                      {e.overriddenBy && (
                        <div className="mt-0.5 text-xs text-stone-400">
                          {e.allowed ? "被私有条目放行" : `由私有条目从「${e.baseSeverity === "watch" ? "观察" : e.baseSeverity}」升级`}：{e.overriddenBy}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={e.severity} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Tag>{e.origin === "shared" ? e.originFile : "私有"}</Tag>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-stone-400">{e.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6">
              <Empty icon={<SpellCheck className="size-8" />} title="没有符合条件的词条" />
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="规则说明">
            <ul className="space-y-2 text-xs leading-relaxed text-stone-600 dark:text-stone-300">
              <li>
                <StatusBadge status="ban" /> 命中会挡住分享包导出。私有的「替换」条目也按禁用处理，并带替换建议。
              </li>
              <li>
                <StatusBadge status="watch" /> 只提示，不挡导出。共享句式默认是观察。
              </li>
              <li>
                <StatusBadge status="allow" /> 私有条目放行了某条共享词条。
              </li>
              <li>匹配顺序：先应用放行，再扫禁用和观察。</li>
            </ul>
          </Card>
          <Card title="共享词表文件">
            {data.shared.length ? (
              <ul className="space-y-1.5 text-sm">
                {data.shared.map((f) => (
                  <li key={f.file} className="flex items-center justify-between">
                    <span className="font-mono text-xs">{f.file}</span>
                    <span className="text-xs text-stone-500">
                      {f.phrases.length} 说法 · {f.patterns.length} 句式
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-400">没有读到共享词表。</p>
            )}
            {data.skillDir && <p className="mt-3 break-all font-mono text-[11px] text-stone-400">{data.skillDir}/lexicon</p>}
          </Card>
          {!!allowEntries.length && (
            <Card title="放行条目">
              <ul className="space-y-1 text-sm">
                {allowEntries.map((e) => (
                  <li key={e.id} className="font-mono text-xs">
                    {e.id} → {e.entryId}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
