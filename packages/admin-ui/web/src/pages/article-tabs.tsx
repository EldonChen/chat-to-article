import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Download, FileText, Image as ImageIcon, KeyRound, Link2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Block, Claim, Figure } from "@liem-opc/chat-to-article-core/types";
import { assetUrl, fetchMarkdown, markdownUrl, type ArticleDetail, type MarkdownVariant } from "../api.ts";
import { Markdown, Mermaid } from "../components/Markdown.tsx";
import { buttonClass, Card, CopyButton, Empty, KV, Segmented, StatusBadge, Tag } from "../components/ui.tsx";
import { useUi } from "../store.ts";

function FigureView({ article, figure }: { article: ArticleDetail; figure: Figure }) {
  const source = article.figureSources[figure.id];
  let body;
  if (figure.kind === "mermaid" && source) body = <Mermaid source={source} />;
  else if (figure.source && /\.(svg|png|jpe?g|gif|webp)$/i.test(figure.source))
    body = <img src={assetUrl(article.id, figure.source)} alt={figure.alt ?? figure.id} className="mx-auto max-h-96 rounded-lg" />;
  else if (figure.kind === "drawio" && figure.source)
    body = <img src={assetUrl(article.id, figure.source.replace(/\.[^./]+$/, ".svg"))} alt={figure.alt ?? figure.id} className="mx-auto max-h-96" />;
  else
    body = (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-stone-400">
        <ImageIcon className="size-4" /> 图位 {figure.id} 还没有可预览的文件
      </div>
    );
  return (
    <figure className="my-4 rounded-xl border border-dashed border-stone-200 p-3 dark:border-stone-700">
      {body}
      <figcaption className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-stone-500">
        <Tag mono>{figure.id}</Tag>
        <StatusBadge status={figure.status} />
        {figure.caption}
      </figcaption>
    </figure>
  );
}

function BlockView({ article, block, claims }: { article: ArticleDetail; block: Block; claims: Map<string, Claim> }) {
  const showMeta = useUi((s) => s.readerShowMeta);
  const status = !block.exists ? "missing" : (block.meta?.status ?? "draft");
  const lint = article.lint.filter((f) => f.blockId === block.id);
  const figures = (block.meta?.figureIds ?? [])
    .map((id) => article.figureList.find((f) => f.id === id))
    .filter((f): f is Figure => !!f);
  return (
    <div className="group relative grid grid-cols-[4.5rem_1fr] gap-4" id={`block-${block.id}`}>
      <div className="pt-1 text-right">
        <div className="font-mono text-xs text-stone-400">{block.id}</div>
        <div className="mt-1">
          <StatusBadge status={status} />
        </div>
      </div>
      <div
        className={clsx(
          "min-w-0 border-l-2 pl-5",
          status === "accepted" && "border-emerald-300 dark:border-emerald-800",
          status === "draft" && "border-sky-300 dark:border-sky-800",
          status === "stale" && "border-amber-400",
          status === "missing" && "border-stone-200 dark:border-stone-700",
        )}
      >
        {block.exists ? <Markdown text={block.body} /> : <p className="py-2 text-sm italic text-stone-400">这块还没有正文。</p>}
        {figures.map((f) => (
          <FigureView key={f.id} article={article} figure={f} />
        ))}
        {showMeta && (block.meta?.claimIds?.length || lint.length) ? (
          <div className="mt-2 flex flex-wrap gap-1.5 pb-1">
            {(block.meta?.claimIds ?? []).map((id) => (
              <span
                key={id}
                title={claims.get(id)?.text ?? "主张缺失"}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]",
                  claims.get(id)?.status === "accepted"
                    ? "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                )}
              >
                <Link2 className="size-3" /> {id}
              </span>
            ))}
            {lint.map((f) => (
              <span
                key={`${f.entryId}-${f.start}`}
                title={f.sentence}
                className={clsx(
                  "rounded-md px-1.5 py-0.5 text-[11px]",
                  f.severity === "ban" ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                )}
              >
                {f.severity === "ban" ? "禁用" : "观察"}：{block.body.slice(f.start, f.end)}
                {f.replacement && ` → ${f.replacement}`}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ReaderTab({ article }: { article: ArticleDetail }) {
  const { readerOnlyAccepted, setReaderOnlyAccepted, readerShowMeta, setReaderShowMeta } = useUi();
  const claims = useMemo(() => new Map(article.claimList.map((c) => [c.id, c])), [article.claimList]);
  const blocks = useMemo(() => new Map(article.blockList.map((b) => [b.id, b])), [article.blockList]);
  if (!article.outline.sections.length)
    return <Empty icon={<FileText className="size-8" />} title="还没有大纲">确认大纲之后，这里会按章节显示正文块。</Empty>;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_14rem]">
      <article className="min-w-0 rounded-xl border border-stone-200 bg-white px-6 py-8 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h1 className="mb-8 pl-[5.5rem] text-2xl font-semibold text-stone-900 dark:text-stone-50">{article.meta.title}</h1>
        <div className="space-y-10">
          {article.outline.sections.map((section) => (
            <section key={section.id} id={`section-${section.id}`}>
              <h2 className="mb-4 pl-[5.5rem] text-lg font-semibold text-stone-800 dark:text-stone-100">{section.title}</h2>
              <div className="space-y-4">
                {section.blockIds
                  .map((id) => blocks.get(id))
                  .filter((b): b is Block => !!b && (!readerOnlyAccepted || b.meta?.status === "accepted"))
                  .map((b) => (
                    <BlockView key={b.id} article={article} block={b} claims={claims} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      </article>
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card title="显示">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={readerOnlyAccepted} onChange={(e) => setReaderOnlyAccepted(e.target.checked)} />
            只看已接受的块
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={readerShowMeta} onChange={(e) => setReaderShowMeta(e.target.checked)} />
            显示主张与词表命中
          </label>
        </Card>
        <Card title="目录" padded={false}>
          <ol className="py-2 text-sm">
            {article.outline.sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#section-${s.id}`} className="flex gap-2 px-4 py-1.5 text-stone-600 hover:bg-stone-50 hover:text-indigo-600 dark:text-stone-300 dark:hover:bg-stone-800">
                  <span className="tabular-nums text-stone-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="flex gap-0.5 pt-1.5">
                    {s.blockIds.map((id) => {
                      const st = blocks.get(id)?.meta?.status ?? "missing";
                      return (
                        <span
                          key={id}
                          title={`${id} ${st}`}
                          className={clsx(
                            "size-1.5 rounded-full",
                            st === "accepted" ? "bg-emerald-500" : st === "stale" ? "bg-amber-400" : st === "draft" ? "bg-sky-400" : "bg-stone-300",
                          )}
                        />
                      );
                    })}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </Card>
      </aside>
    </div>
  );
}

const AXIS_LABELS: Record<string, string> = {
  explanationPace: "解释节奏",
  abstraction: "抽象程度",
  stance: "论证姿态",
  perspective: "叙述视角",
  readerAssumption: "读者假设",
  structure: "结构显性度",
  tone: "语气",
};

export function PlanTab({ article }: { article: ArticleDetail }) {
  const plan = article.plan;
  if (!plan) return <Empty title="没有 writing-plan.json">这篇文章还没有记录写作计划。</Empty>;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="文章契约" actions={<StatusBadge status={plan.status} label={plan.status === "confirmed" ? "已确认" : "草稿"} />}>
        <KV
          items={[
            ["文体", plan.genre?.length ? <div className="flex flex-wrap gap-1">{plan.genre.map((g) => <Tag key={g}>{g}</Tag>)}</div> : null],
            ["读者", plan.audience || null],
            ["目的", plan.purpose || null],
            ["行文方案", plan.approach || null],
          ]}
        />
      </Card>
      <Card title="写作偏好">
        {Object.keys(plan.styleAxes ?? {}).length ? (
          <KV items={Object.entries(plan.styleAxes).map(([k, v]) => [AXIS_LABELS[k] ?? k, v] as [string, string])} />
        ) : (
          <p className="text-sm text-stone-400">没有记录偏好维度。</p>
        )}
        {!!plan.openQuestions?.length && (
          <div className="mt-4 border-t border-stone-100 pt-3 dark:border-stone-800">
            <div className="mb-2 text-xs font-medium text-stone-500">待定问题</div>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {plan.openQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}

export function ClaimsTab({ article }: { article: ArticleDetail }) {
  const [filter, setFilter] = useState<string>("all");
  const usedBy = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const b of article.blockList) for (const id of b.meta?.claimIds ?? []) map.set(id, [...(map.get(id) ?? []), b.id]);
    return map;
  }, [article.blockList]);
  const selected = new Set(article.materials?.selected ?? []);
  const full = article.materials?.fullText ? new Set(article.materials.fullText) : null;
  const list = article.claimList.filter((c) => filter === "all" || c.status === filter);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          items={[
            { id: "all", label: `全部 ${article.claims.total}` },
            { id: "accepted", label: `已接受 ${article.claims.accepted}` },
            { id: "candidate", label: `候选 ${article.claims.candidate}` },
            { id: "disputed", label: `有争议 ${article.claims.disputed}` },
            { id: "rejected", label: `已拒绝 ${article.claims.rejected}` },
          ]}
        />
        {article.materials && (
          <div className="text-xs text-stone-500">
            材料：勾选 {article.materials.selected?.length ?? 0} 个会话，全文 {article.materials.fullText?.length ?? "未记录"} 个
          </div>
        )}
      </div>
      {!list.length ? (
        <Empty title="没有主张" />
      ) : (
        <div className="space-y-3">
          {list.map((c) => (
            <div key={c.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 font-mono text-xs text-stone-400">{c.id}</span>
                <p className={clsx("flex-1 text-sm leading-relaxed", c.status === "rejected" && "text-stone-400 line-through")}>{c.text}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  {c.secret && (
                    <span className={clsx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs", c.resolved ? "bg-stone-100 text-stone-500 dark:bg-stone-800" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300")}>
                      <KeyRound className="size-3" /> {c.resolved ? "密钥已处理" : "疑似密钥"}
                    </span>
                  )}
                  <StatusBadge status={c.status} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-8 text-xs text-stone-500">
                {(c.sources ?? []).map((s, i) => {
                  const warn = s.kind === "conversation" && (!selected.has(s.id ?? "") || (full && !full.has(s.id ?? "")));
                  return (
                    <span key={i} title={s.note} className={clsx("rounded-md px-1.5 py-0.5", warn ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-stone-100 dark:bg-stone-800")}>
                      {s.kind === "conversation" ? "会话" : s.kind === "file" ? "文件" : s.kind === "paste" ? "粘贴" : s.kind} {s.id}
                      {s.note && <span className="text-stone-400"> · {s.note}</span>}
                    </span>
                  );
                })}
                {usedBy.get(c.id)?.length ? <span>用于 {usedBy.get(c.id)!.join("、")}</span> : <span className="text-stone-400">未被块引用</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OutlineTab({ article }: { article: ArticleDetail }) {
  const blocks = new Map(article.blockList.map((b) => [b.id, b]));
  const claims = new Map(article.claimList.map((c) => [c.id, c]));
  if (!article.outline.sections.length) return <Empty title="大纲是空的" />;
  return (
    <div className="space-y-3">
      {article.outline.sections.map((s, i) => (
        <Card
          key={s.id}
          title={
            <span className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-indigo-50 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{i + 1}</span>
              {s.title}
              <span className="font-mono text-xs font-normal text-stone-400">{s.id}</span>
            </span>
          }
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="mb-1.5 text-xs font-medium text-stone-500">主张</div>
              <ul className="space-y-1 text-sm">
                {s.claimIds.map((id) => (
                  <li key={id} className="flex gap-2">
                    <span className="font-mono text-xs text-stone-400">{id}</span>
                    <span className="line-clamp-2 text-stone-600 dark:text-stone-300">{claims.get(id)?.text ?? "（缺失）"}</span>
                  </li>
                ))}
                {!s.claimIds.length && <li className="text-stone-400">—</li>}
              </ul>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-stone-500">块</div>
              <div className="flex flex-wrap gap-1.5">
                {s.blockIds.map((id) => (
                  <a key={id} href={`#block-${id}`} className="inline-flex items-center gap-1">
                    <Tag mono>{id}</Tag>
                    <StatusBadge status={blocks.get(id)?.exists ? (blocks.get(id)?.meta?.status ?? "draft") : "missing"} />
                  </a>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-stone-500">图位</div>
              <div className="flex flex-wrap gap-1.5">
                {s.figureIds.map((id) => (
                  <Tag key={id} mono>
                    {id}
                  </Tag>
                ))}
                {!s.figureIds.length && <span className="text-sm text-stone-400">—</span>}
              </div>
            </div>
          </div>
        </Card>
      ))}
      {!!article.orphanBlocks.length && (
        <p className="text-xs text-stone-500">不在大纲里的块文件（不会编译进文章）：{article.orphanBlocks.join("、")}</p>
      )}
    </div>
  );
}

export function FiguresTab({ article }: { article: ArticleDetail }) {
  if (!article.figureList.length) return <Empty icon={<ImageIcon className="size-8" />} title="没有图" />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {article.figureList.map((f) => (
        <Card key={f.id} title={<span className="font-mono">{f.id}</span>} actions={<><Tag>{f.kind}</Tag><StatusBadge status={f.status} /></>}>
          <FigureView article={article} figure={f} />
          <KV
            items={[
              ["说明", f.caption || null],
              ["替代文本", f.alt || null],
              ["源文件", f.source ? <code className="text-xs">{f.source}</code> : null],
              ["引用块", f.blockIds?.join("、") || null],
              ...(f.kind === "raster" ? ([["提示词", f.prompt || null]] as [string, string | null][]) : []),
              ...(f.kind === "remote" ? ([["出处/许可", f.license || null]] as [string, string | null][]) : []),
            ]}
          />
        </Card>
      ))}
    </div>
  );
}

export function ChecksTab({ article }: { article: ArticleDetail }) {
  const bans = article.lint.filter((f) => f.severity === "ban");
  const watches = article.lint.filter((f) => f.severity !== "ban");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card
        title="分享守卫"
        actions={article.exportReady ? <StatusBadge status="accepted" label="可以导出" /> : <StatusBadge status="ban" label={`${article.exportErrors.length} 项未通过`} />}
      >
        {article.exportReady ? (
          <div className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="mt-0.5 size-4" />
            所有块与引用的图都已接受，没有未处理的禁用说法和密钥。运行 <code>cta.py compile --export</code> 即可生成分享包。
          </div>
        ) : (
          <ul className="space-y-2 text-sm">
            {article.exportErrors.map((e) => (
              <li key={e} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-500 dark:border-stone-800">
          与 <code>cta.py</code> 的导出检查同一套规则，此处只读展示，不会生成或修改任何文件。
        </p>
      </Card>
      <Card title={`词表命中（禁用 ${bans.length} · 观察 ${watches.length}）`} padded={false}>
        {!article.lint.length ? (
          <div className="flex items-center gap-2 p-4 text-sm text-stone-500">
            <CheckCircle2 className="size-4 text-emerald-500" /> 没有命中。
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {[...bans, ...watches].map((f) => (
              <li key={`${f.blockId}-${f.entryId}-${f.start}`} className="px-4 py-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <StatusBadge status={f.severity} />
                  <Tag mono>{f.blockId}</Tag>
                  <Tag mono>{f.entryId}</Tag>
                  {f.replacement && <span className="text-sky-600">建议：{f.replacement}</span>}
                </div>
                <p className="text-stone-600 dark:text-stone-300">{f.sentence}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function RevisionsTab({ article }: { article: ArticleDetail }) {
  if (!article.revisions.length) return <Empty title="没有修订记录" />;
  return (
    <ol className="relative space-y-4 border-l border-stone-200 pl-6 dark:border-stone-800">
      {[...article.revisions].reverse().map((r, i) => (
        <li key={i} className="relative">
          <span
            className={clsx(
              "absolute -left-[1.85rem] top-1.5 size-3 rounded-full ring-4 ring-stone-50 dark:ring-stone-950",
              r.afterStatus === "accepted" ? "bg-emerald-500" : "bg-sky-400",
            )}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Tag mono>{r.blockId}</Tag>
            <span className="font-medium">{r.instruction}</span>
            <StatusBadge status={r.afterStatus} />
          </div>
          {r.before && <p className="mt-1 line-clamp-2 text-xs text-stone-500">改前：{r.before}</p>}
        </li>
      ))}
    </ol>
  );
}

export function MarkdownTab({ article }: { article: ArticleDetail }) {
  const [variant, setVariant] = useState<MarkdownVariant>(article.hasExport ? "export" : "clean");
  const [view, setView] = useState<"source" | "preview">("preview");
  const md = useQuery({
    queryKey: ["markdown", article.id, variant, article.updatedAt],
    queryFn: () => fetchMarkdown(article.id, variant),
    retry: false,
  });
  const desc: Record<MarkdownVariant, string> = {
    export: "export/article.md：通过分享守卫后由 cta.py 生成，可直接分享。",
    clean: "按大纲拼接当前块的草稿，包含未接受的块，不带锚点。",
    working: "带 <!-- block:id --> 锚点的工作稿，和 article.md 同格式。",
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<MarkdownVariant>
            value={variant}
            onChange={setVariant}
            items={[
              { id: "export", label: "分享包" },
              { id: "clean", label: "草稿" },
              { id: "working", label: "工作稿" },
            ]}
          />
          <Segmented value={view} onChange={setView} items={[{ id: "preview", label: "预览" }, { id: "source", label: "源码" }]} />
        </div>
        <div className="flex items-center gap-2">
          {md.data && <CopyButton text={md.data} label="复制" />}
          <a href={markdownUrl(article.id, variant, true)} download className={clsx(buttonClass("secondary"), !md.data && "pointer-events-none opacity-50")}>
            <Download className="size-4" /> 下载 .md
          </a>
        </div>
      </div>
      <p className="text-xs text-stone-500">{desc[variant]}</p>
      <div className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
        {md.isLoading ? (
          <div className="p-6 text-sm text-stone-400">读取中…</div>
        ) : md.error ? (
          <div className="p-6 text-sm text-stone-500">{(md.error as Error).message}</div>
        ) : view === "source" ? (
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-6 font-mono text-[13px] leading-relaxed text-stone-700 dark:text-stone-300">{md.data}</pre>
        ) : (
          <div className="px-8 py-6">
            <Markdown
              text={md.data ?? ""}
              resolveAsset={(src) => assetUrl(article.id, variant === "export" ? `export/${src}` : src)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
