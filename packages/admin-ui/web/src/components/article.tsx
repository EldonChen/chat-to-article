import clsx from "clsx";
import { AlertTriangle, Check, ChevronDown, FileArchive, FileDown, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { ArticleSummary } from "@liem-opc/chat-to-article-core/types";
import { markdownUrl, zipUrl, type ArticleListItem } from "../api.ts";
import { attention, gates, phaseLabel, relativeTime } from "../lib/format.ts";
import { buttonClass, ProgressBar } from "./ui.tsx";

export function GateDots({ article }: { article: ArticleSummary }) {
  return (
    <div className="flex items-center gap-1">
      {gates(article).map((g) => (
        <span
          key={g.id}
          title={`${g.label}：${g.detail}`}
          className={clsx(
            "grid size-5 place-items-center rounded-full text-[10px] font-medium",
            g.done
              ? "bg-emerald-500 text-white"
              : "bg-stone-100 text-stone-400 ring-1 ring-inset ring-stone-200 dark:bg-stone-800 dark:ring-stone-700",
          )}
        >
          {g.done ? <Check className="size-3" strokeWidth={3} /> : g.label[0]}
        </span>
      ))}
    </div>
  );
}

export function GateStepper({ article }: { article: ArticleSummary }) {
  const list = gates(article);
  const current = list.findIndex((g) => !g.done);
  return (
    <ol className="grid grid-cols-5 gap-2">
      {list.map((g, i) => (
        <li key={g.id} className="min-w-0">
          <div
            className={clsx(
              "h-1 rounded-full",
              g.done ? "bg-emerald-500" : i === current ? "bg-indigo-400" : "bg-stone-200 dark:bg-stone-700",
            )}
          />
          <div className="mt-2 flex items-center gap-1.5 text-xs font-medium">
            {g.done ? (
              <Check className="size-3.5 text-emerald-600" />
            ) : (
              <span className={clsx("size-1.5 rounded-full", i === current ? "bg-indigo-500" : "bg-stone-300")} />
            )}
            <span className={g.done ? "text-stone-700 dark:text-stone-200" : i === current ? "text-indigo-600 dark:text-indigo-400" : "text-stone-400"}>
              {g.label}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-stone-500 dark:text-stone-400" title={g.detail}>
            {g.detail}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function BlockBar({ article }: { article: ArticleSummary }) {
  const b = article.blocks;
  return (
    <ProgressBar
      segments={[
        { label: "已接受", value: b.accepted, className: "bg-emerald-500" },
        { label: "草稿", value: b.draft, className: "bg-sky-400" },
        { label: "待复核", value: b.stale, className: "bg-amber-400" },
        { label: "未写", value: b.missing, className: "bg-stone-300 dark:bg-stone-600" },
      ]}
    />
  );
}

export function PhaseBadge({ phase }: { phase: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
      {phaseLabel(phase)}
    </span>
  );
}

export function AttentionList({ article, compact }: { article: ArticleSummary; compact?: boolean }) {
  const items = attention(article);
  if (!items.length) return null;
  return (
    <div className={clsx("flex flex-wrap gap-1.5", compact && "gap-1")}>
      {items.map((item) => (
        <span
          key={item.text}
          className={clsx(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs",
            item.level === "danger" && "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
            item.level === "warn" && "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
            item.level === "info" && "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
          )}
        >
          {item.level !== "info" && <AlertTriangle className="size-3" />}
          {item.text}
        </span>
      ))}
    </div>
  );
}

export function ArticleCard({ article }: { article: ArticleListItem }) {
  return (
    <Link
      to={`/articles/${article.id}`}
      className="group block rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-stone-800 dark:bg-stone-900 dark:hover:border-indigo-700"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-stone-900 group-hover:text-indigo-700 dark:text-stone-50 dark:group-hover:text-indigo-300">
            {article.meta.title || article.meta.slug}
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-stone-400">{article.relDir}</div>
        </div>
        <PhaseBadge phase={article.meta.phase} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <GateDots article={article} />
        <span className="text-xs text-stone-400">{relativeTime(article.updatedAt)}</span>
      </div>
      <div className="mt-3">
        <BlockBar article={article} />
      </div>
      <div className="mt-3">
        <AttentionList article={article} compact />
      </div>
    </Link>
  );
}

/** 单篇导出：分享包优先；没有分享包时提供草稿和带锚点的工作稿。 */
export function ExportMenu({ article, align = "right" }: { article: ArticleSummary & { id: string }; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const items = [
    {
      href: markdownUrl(article.id, "export", true),
      icon: <FileDown className="size-4 text-emerald-600" />,
      title: "分享包 Markdown",
      desc: article.hasExport ? "export/article.md，已通过导出检查" : "还没有生成分享包",
      disabled: !article.hasExport,
    },
    {
      href: markdownUrl(article.id, "clean", true),
      icon: <FileText className="size-4 text-sky-600" />,
      title: "当前草稿 Markdown",
      desc: "按大纲拼接当前块，含未接受的块，不带锚点",
    },
    {
      href: markdownUrl(article.id, "working", true),
      icon: <FileText className="size-4 text-stone-500" />,
      title: "工作稿（带块锚点）",
      desc: "与 cta.py compile 生成的 article.md 同格式",
    },
    {
      href: zipUrl([article.id], article.hasExport ? "export" : "clean"),
      icon: <FileArchive className="size-4 text-violet-600" />,
      title: "打包下载（含图）",
      desc: article.hasExport ? "export/ 整个目录" : "草稿正文与被引用的图源文件",
    },
  ];
  return (
    <div className="relative" ref={ref}>
      <button className={buttonClass("primary")} onClick={() => setOpen((v) => !v)}>
        <FileDown className="size-4" /> 导出 <ChevronDown className="size-3.5" />
      </button>
      {open && (
        <div
          className={clsx(
            "absolute z-20 mt-2 w-80 overflow-hidden rounded-xl border border-stone-200 bg-white p-1 shadow-lg dark:border-stone-700 dark:bg-stone-900",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) =>
            item.disabled ? (
              <div key={item.title} className="flex cursor-not-allowed gap-3 rounded-lg px-3 py-2 opacity-50">
                {item.icon}
                <div>
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="text-xs text-stone-500">{item.desc}</div>
                </div>
              </div>
            ) : (
              <a
                key={item.title}
                href={item.href}
                download
                onClick={() => setOpen(false)}
                className="flex gap-3 rounded-lg px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800"
              >
                {item.icon}
                <div>
                  <div className="text-sm font-medium text-stone-800 dark:text-stone-100">{item.title}</div>
                  <div className="text-xs text-stone-500 dark:text-stone-400">{item.desc}</div>
                </div>
              </a>
            ),
          )}
        </div>
      )}
    </div>
  );
}
