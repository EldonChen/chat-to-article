import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Columns2, Copy, RefreshCw, Rows3, Save, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { postJson, useRsiRounds } from "../api.ts";
import { Markdown } from "../components/Markdown.tsx";
import { buttonClass, Empty, ErrorBox, Loading, Tabs } from "../components/ui.tsx";
import { diffLines } from "../lib/diff.ts";
import {
  DIAGNOSIS_CHIPS,
  draftFrom,
  feedbackMarkdown,
  RSI_DIMENSIONS,
  SCORE_ANCHORS,
  weightedTotal,
  type RatingDraft,
  type RsiDimensionKey,
  type RsiRound,
  type UserRating,
} from "../lib/rsi.ts";

type View = "read" | "compare" | "score" | "gradient" | "plan";
type DiffMode = "side" | "unified";

const SERIES_COLORS = ["#e11d48", "#4f46e5", "#0f766e", "#b45309", "#7c3aed", "#0369a1"];

export function RsiWorkbenchPage() {
  const [poll, setPoll] = useState(true);
  const [showArchive, setShowArchive] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [otherId, setOtherId] = useState<string | null>(null);
  const [view, setView] = useState<View>("read");
  const [diffMode, setDiffMode] = useState<DiffMode>("side");
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const [arrived, setArrived] = useState<string[]>([]);
  const known = useRef<Set<string> | null>(null);
  const query = useRsiRounds(poll);
  const rounds = query.data?.rounds ?? [];

  useEffect(() => {
    if (!query.data) return;
    const ids = query.data.rounds.map((round) => round.id);
    if (known.current == null) {
      known.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !known.current?.has(id));
    if (!fresh.length) return;
    setArrived(fresh);
    for (const id of fresh) known.current.add(id);
    const timer = window.setTimeout(() => setArrived([]), 8000);
    return () => window.clearTimeout(timer);
  }, [query.data]);

  const visible = rounds.filter((round) => showArchive || !round.archived);
  const live = rounds.filter((round) => !round.archived);
  const fallback = [...live].reverse().find((round) => round.hasArticle) ?? live[live.length - 1] ?? rounds[0];
  const focus = rounds.find((round) => round.id === picked) ?? fallback;
  const other = rounds.find((round) => round.id === otherId) ?? previousOf(visible, focus?.id);

  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorBox error={query.error} />;
  if (!query.data?.root) {
    return (
      <Empty title="没有找到 iterations 目录" icon={<Rows3 className="size-5" />}>
        启动管理台时加上 --rsi，或设置 CTA_RSI_ROOT，指向含有 baseline-case 与 iterations 的目录。
      </Empty>
    );
  }
  if (!focus) {
    return <Empty title="这个目录里还没有轮次">baseline-case 或 iterations 下一有文章，刷新就会出现。</Empty>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-stone-900 dark:text-stone-50">RSI 演进看板</h1>
          <p className="truncate text-xs text-stone-500" title={query.data.root}>
            {query.data.root} · {new Date(query.data.scannedAt).toLocaleTimeString()} 扫描
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className={buttonClass("ghost")} onClick={() => setShowArchive((value) => !value)}>
            {showArchive ? "隐藏归档" : `归档 ${rounds.filter((round) => round.archived).length}`}
          </button>
          <button
            type="button"
            onClick={() => setPoll((value) => !value)}
            className={clsx("rounded-lg px-2 py-1 text-xs", poll ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "text-stone-500")}
          >
            {poll ? "每 5 秒刷新" : "自动刷新已关"}
          </button>
          <button type="button" className={buttonClass("secondary")} onClick={() => query.refetch()} title="立即重新扫描">
            <RefreshCw className={clsx("size-3.5", query.isFetching && "animate-spin")} /> 刷新
          </button>
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto border-b border-stone-200 px-4 py-2 dark:border-stone-800">
        {visible.map((round) => (
          <button
            key={round.id}
            type="button"
            onClick={() => setPicked(round.id)}
            className={clsx(
              "shrink-0 rounded-full border px-3 py-1 text-left text-xs transition",
              round.id === focus.id
                ? "border-rose-400 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
              round.archived && "border-dashed opacity-70",
              arrived.includes(round.id) && "ring-2 ring-rose-400",
            )}
          >
            <span className="font-medium">{round.label}</span>
            <span className="ml-1.5 tabular-nums text-stone-400">{round.score?.total ?? (round.hasArticle ? "—" : "待生成")}</span>
            {round.score?.overfit === true && <span className="ml-1 text-rose-500">overfit</span>}
            {round.userRating && <span className="ml-1 text-emerald-600">已评</span>}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-stone-900 dark:text-stone-50">{focus.title ?? focus.label}</div>
              <div className="mt-0.5 text-xs text-stone-500">
                {focus.relDir} · {focus.charCount} 字 · {focus.tableCount} 表 · {focus.images.length} 图
                {focus.score?.total != null && ` · 评分 ${focus.score.total}`}
              </div>
            </div>
          </div>
          <div className="px-4">
            <Tabs
              value={view}
              onChange={setView}
              items={[
                { id: "read", label: "全文" },
                { id: "compare", label: "对比" },
                { id: "score", label: "评分", count: focus.score?.total ?? undefined },
                { id: "gradient", label: "梯度", count: focus.gradient?.items.length },
                { id: "plan", label: "写作计划" },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {view === "read" && <ArticlePane round={focus} onImage={(src, alt) => setZoom({ src, alt })} />}
            {view === "compare" && (
              <ComparePane
                rounds={visible}
                left={other ?? focus}
                right={focus}
                mode={diffMode}
                onMode={setDiffMode}
                onLeft={(id) => setOtherId(id)}
                onRight={(id) => setPicked(id)}
                onImage={(src, alt) => setZoom({ src, alt })}
              />
            )}
            {view === "score" && <ScorePane round={focus} />}
            {view === "gradient" && <GradientPane round={focus} />}
            {view === "plan" && <PlanPane round={focus} />}
          </div>
        </section>
        <RatingDrawer round={focus} />
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 p-6" onClick={() => setZoom(null)}>
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-stone-700" onClick={() => setZoom(null)} aria-label="关闭">
            <X className="size-4" />
          </button>
          <img src={zoom.src} alt={zoom.alt} className="max-h-full max-w-full rounded-lg bg-white p-3" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function shortRoundId(id: string): string {
  if (id === "baseline") return "基线";
  const fresh = /^fresh-(\d+)$/.exec(id);
  if (fresh) return `f${Number(fresh[1])}`;
  const round = /^round-(\d+)$/.exec(id);
  if (round) return `r${Number(round[1])}`;
  return id.slice(0, 6);
}

function previousOf(rounds: RsiRound[], id: string | undefined): RsiRound | undefined {
  const index = rounds.findIndex((round) => round.id === id);
  if (index < 0) return undefined;
  return rounds[index - 1] ?? rounds[index + 1];
}

function ArticlePane({ round, onImage }: { round: RsiRound; onImage: (src: string, alt: string) => void }) {
  if (!round.hasArticle) {
    return <Empty title="这一轮还没有正文">article.md 落盘后，下一次刷新就会出现在这里。</Empty>;
  }
  const sections = round.headings.filter((heading) => heading.level > 1);
  return (
    <div className="space-y-4">
      {sections.length > 0 && (
        <ol className="flex flex-wrap gap-2 text-xs text-stone-500">
          {sections.map((heading) => (
            <li key={heading.text} className={clsx("rounded-full bg-stone-100 px-2 py-1 dark:bg-stone-800", heading.level === 3 && "opacity-70")}>
              {heading.text}
            </li>
          ))}
        </ol>
      )}
      <Markdown text={round.articleMarkdown} onImageClick={onImage} />
    </div>
  );
}

function ComparePane({
  rounds,
  left,
  right,
  mode,
  onMode,
  onLeft,
  onRight,
  onImage,
}: {
  rounds: RsiRound[];
  left: RsiRound;
  right: RsiRound;
  mode: DiffMode;
  onMode: (mode: DiffMode) => void;
  onLeft: (id: string) => void;
  onRight: (id: string) => void;
  onImage: (src: string, alt: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <RoundSelect rounds={rounds} value={left.id} onChange={onLeft} />
        <span className="text-xs text-stone-400">对比</span>
        <RoundSelect rounds={rounds} value={right.id} onChange={onRight} />
        <div className="ml-auto flex rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800">
          <button type="button" className={clsx("rounded-md px-2 py-1 text-xs", mode === "side" && "bg-white shadow-sm dark:bg-stone-700")} onClick={() => onMode("side")}>
            <Columns2 className="mr-1 inline size-3.5" /> 并排
          </button>
          <button type="button" className={clsx("rounded-md px-2 py-1 text-xs", mode === "unified" && "bg-white shadow-sm dark:bg-stone-700")} onClick={() => onMode("unified")}>
            <Rows3 className="mr-1 inline size-3.5" /> 逐行
          </button>
        </div>
      </div>
      <TotalChart rounds={rounds} mark={[left.id, right.id]} />
      <DimensionChart rounds={rounds} mark={[left.id, right.id]} />
      <DeltaTable left={left} right={right} />
      {mode === "side" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <article className="min-w-0 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
            <h3 className="mb-2 text-xs font-medium text-stone-500">{left.label}</h3>
            {left.hasArticle ? <Markdown text={left.articleMarkdown} onImageClick={onImage} /> : <p className="text-sm text-stone-400">还没有正文</p>}
          </article>
          <article className="min-w-0 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
            <h3 className="mb-2 text-xs font-medium text-stone-500">{right.label}</h3>
            {right.hasArticle ? <Markdown text={right.articleMarkdown} onImageClick={onImage} /> : <p className="text-sm text-stone-400">还没有正文</p>}
          </article>
        </div>
      ) : (
        <UnifiedDiff before={left.articleSource} after={right.articleSource} />
      )}
    </div>
  );
}

function RoundSelect({ rounds, value, onChange }: { rounds: RsiRound[]; value: string; onChange: (id: string) => void }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm dark:border-stone-700 dark:bg-stone-900"
    >
      {rounds.map((round) => (
        <option key={round.id} value={round.id}>
          {round.label}
          {round.score?.total != null ? ` · ${round.score.total}` : ""}
        </option>
      ))}
    </select>
  );
}

function UnifiedDiff({ before, after }: { before: string; after: string }) {
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  return (
    <div className="overflow-auto rounded-xl border border-stone-200 font-mono text-xs leading-5 dark:border-stone-800">
      {lines.map((line, index) => (
        <div
          key={index}
          className={clsx(
            "whitespace-pre-wrap px-3",
            line.type === "add" && "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
            line.type === "del" && "bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
          )}
        >
          <span className="mr-2 inline-block w-3 text-stone-400">{line.type === "add" ? "+" : line.type === "del" ? "−" : " "}</span>
          {line.text || " "}
        </div>
      ))}
    </div>
  );
}

function TotalChart({ rounds, mark }: { rounds: RsiRound[]; mark: string[] }) {
  const points = rounds.filter((round) => !round.archived && round.score?.total != null);
  if (points.length < 2) return <p className="text-xs text-stone-400">至少两轮有总分之后，这里画出分数折线。</p>;
  const width = 640;
  const height = 168;
  const padL = 28;
  const padR = 8;
  const padT = 12;
  const padB = 22;
  const x = (index: number) => padL + (index * (width - padL - padR)) / Math.max(1, points.length - 1);
  const y = (value: number) => padT + (1 - Math.min(100, Math.max(0, value)) / 100) * (height - padT - padB);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point.score?.total ?? 0).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full text-stone-200 dark:text-stone-800">
      {[0, 70, 85, 100].map((tick) => (
        <g key={tick}>
          <line x1={padL} x2={width - padR} y1={y(tick)} y2={y(tick)} stroke="currentColor" />
          <text x="0" y={y(tick) + 3} className="fill-stone-400 text-[10px]">{tick}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#4f46e5" strokeWidth="2" />
      {points.map((point, index) => (
        <g key={point.id}>
          <circle cx={x(index)} cy={y(point.score?.total ?? 0)} r={mark.includes(point.id) ? 5 : 3} fill={mark.includes(point.id) ? "#e11d48" : "#4f46e5"} />
          <text x={x(index)} y={height - 4} textAnchor="middle" className="fill-stone-500 text-[10px]">
            {shortRoundId(point.id)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function DimensionChart({ rounds, mark }: { rounds: RsiRound[]; mark: string[] }) {
  const live = rounds.filter((round) => !round.archived);
  const grouped = new Map<string, { color: string; points: { index: number; pct: number; id: string }[] }>();
  live.forEach((round, index) => {
    for (const dim of round.score?.dimensions ?? []) {
      if (dim.value == null || !dim.max) continue;
      const series = grouped.get(dim.label) ?? { color: SERIES_COLORS[grouped.size % SERIES_COLORS.length], points: [] };
      series.points.push({ index, pct: (dim.value / dim.max) * 100, id: round.id });
      grouped.set(dim.label, series);
    }
  });
  const series = [...grouped.entries()].filter(([, item]) => item.points.length >= 2).slice(0, 6);
  if (!series.length || live.length < 2) return null;
  const width = 640;
  const height = 150;
  const padL = 28;
  const padR = 8;
  const padT = 12;
  const padB = 8;
  const x = (index: number) => padL + (index * (width - padL - padR)) / Math.max(1, live.length - 1);
  const y = (value: number) => padT + (1 - value / 100) * (height - padT - padB);
  return (
    <div>
      <div className="mb-1 text-xs text-stone-500">各维占该维满分的百分比。标红的点是当前对比的两轮。</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full">
        {series.map(([label, item]) => (
          <path
            key={label}
            d={item.points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.index).toFixed(1)} ${y(point.pct).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={item.color}
            strokeWidth="1.6"
          />
        ))}
        {series.flatMap(([label, item]) =>
          item.points
            .filter((point) => mark.includes(point.id))
            .map((point) => <circle key={`${label}-${point.id}`} cx={x(point.index)} cy={y(point.pct)} r="3.5" fill={item.color} />),
        )}
      </svg>
      <div className="flex flex-wrap gap-3 text-[11px] text-stone-500">
        {series.map(([label, item]) => (
          <span key={label} className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full" style={{ background: item.color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function DeltaTable({ left, right }: { left: RsiRound; right: RsiRound }) {
  const rows = (right.score?.dimensions ?? [])
    .map((dim) => {
      const peer = left.score?.dimensions.find((item) => item.label === dim.label);
      if (dim.value == null && peer?.value == null) return null;
      return { label: dim.label, left: peer?.value ?? null, right: dim.value };
    })
    .filter((row): row is { label: string; left: number | null; right: number | null } => row != null);
  if (!rows.length) return null;
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-stone-400">
        <tr>
          <th className="py-1 font-medium">维</th>
          <th className="py-1 font-medium">{left.label}</th>
          <th className="py-1 font-medium">{right.label}</th>
          <th className="py-1 font-medium">变化</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const delta = row.left != null && row.right != null ? row.right - row.left : null;
          return (
            <tr key={row.label} className="border-t border-stone-100 dark:border-stone-800">
              <td className="py-1">{row.label}</td>
              <td className="py-1 tabular-nums">{row.left ?? "—"}</td>
              <td className="py-1 tabular-nums">{row.right ?? "—"}</td>
              <td className={clsx("py-1 tabular-nums", delta != null && delta > 0 && "text-emerald-600", delta != null && delta < 0 && "text-rose-600")}>
                {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ScorePane({ round }: { round: RsiRound }) {
  const score = round.score;
  if (!score) return <Empty title="这一轮还没有 score.md" icon={<Rows3 className="size-5" />}>评分文件一出现，六维、闸门和摘录会从原文里解析出来。</Empty>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">{score.total ?? "—"}</span>
        {score.raw != null && <span className="text-xs text-stone-400">raw {score.raw}</span>}
        <OverfitBadge value={score.overfit} />
      </div>
      {score.summary && <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">{score.summary}</p>}
      {score.dimensions.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-stone-400">
            <tr>
              <th className="py-1 font-medium">维</th>
              <th className="py-1 font-medium">中位 / 得分</th>
              <th className="py-1 font-medium">引用</th>
            </tr>
          </thead>
          <tbody>
            {score.dimensions.map((dim) => (
              <tr key={dim.label} className="border-t border-stone-100 align-top dark:border-stone-800">
                <td className="py-2 pr-3 whitespace-nowrap">{dim.label}</td>
                <td className="py-2 pr-3 tabular-nums">{dim.value ?? "—"}{dim.max ? ` / ${dim.max}` : ""}</td>
                <td className="py-2 text-stone-600 dark:text-stone-300">{dim.quote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {score.gates.length > 0 && (
        <ul className="space-y-1 text-sm">
          {score.gates.map((gate) => (
            <li key={gate.name}>
              <span className={clsx("mr-2 rounded px-1.5 py-0.5 text-xs", gate.passed ? "bg-emerald-50 text-emerald-700" : gate.passed === false ? "bg-rose-50 text-rose-700" : "bg-stone-100 text-stone-500")}>
                {gate.passed ? "未触发" : gate.passed === false ? "触发" : "未判"}
              </span>
              {gate.name}
              {gate.detail && <span className="text-stone-500"> · {gate.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      <Excerpt title="写得好的地方" lines={score.strengths} />
      <Excerpt title="还能往上走" lines={score.weaknesses} />
      <details className="rounded-xl border border-stone-200 p-3 text-sm dark:border-stone-800">
        <summary className="cursor-pointer text-stone-500">score.md 原文</summary>
        <Markdown text={score.markdown} />
      </details>
    </div>
  );
}

function OverfitBadge({ value }: { value: boolean | "unreviewed" | null }) {
  if (value == null) return null;
  const label = value === true ? "overfit" : value === false ? "overfit false" : "overfit 未审";
  return <span className={clsx("rounded-full px-2 py-0.5 text-xs", value === true ? "bg-rose-50 text-rose-700" : "bg-stone-100 text-stone-500")}>{label}</span>;
}

function Excerpt({ title, lines }: { title: string; lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-stone-400">{title}</h3>
      <ul className="list-disc space-y-1 pl-4 text-sm text-stone-700 dark:text-stone-300">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function GradientPane({ round }: { round: RsiRound }) {
  if (!round.gradient) return <Empty title="这一轮还没有 gradient.md">给下一轮的建议会显示在这里。</Empty>;
  return (
    <div className="space-y-3">
      {round.gradient.items.map((item) => (
        <div key={item.n} className="rounded-xl border border-stone-200 p-3 text-sm dark:border-stone-800">
          <div className="mb-1 text-xs font-medium text-stone-400">建议 {item.n}</div>
          <p className="whitespace-pre-wrap leading-relaxed">{item.text}</p>
        </div>
      ))}
      <details className="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
        <summary className="cursor-pointer text-sm text-stone-500">gradient.md 原文</summary>
        <Markdown text={round.gradient.text} />
      </details>
    </div>
  );
}

function PlanPane({ round }: { round: RsiRound }) {
  if (round.writingPlanError) return <ErrorBox error={round.writingPlanError} />;
  const plan = asRecord(round.writingPlan);
  if (!plan) return <Empty title="这一轮还没有 writing-plan.json" />;
  const opening = asRecord(plan.openingArc);
  const fields: [string, string | null][] = [
    ["读者", asText(plan.audience)],
    ["目的", asText(plan.purpose)],
    ["声音", asText(plan.voice)],
    ["主线", asText(plan.goldenThread)],
    ["路径", asText(plan.approach)],
    ["开篇", asText(opening?.scene)],
    ["悬念", asText(opening?.suspense)],
  ];
  return (
    <div className="space-y-3">
      <dl className="space-y-2 text-sm">
        {fields.filter((field): field is [string, string] => Boolean(field[1])).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-stone-400">{label}</dt>
            <dd className="leading-relaxed">{value}</dd>
          </div>
        ))}
      </dl>
      <details className="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
        <summary className="cursor-pointer text-sm text-stone-500">writing-plan.json</summary>
        <pre className="mt-2 overflow-auto text-xs leading-relaxed">{JSON.stringify(plan, null, 2)}</pre>
      </details>
    </div>
  );
}

function RatingDrawer({ round }: { round: RsiRound }) {
  const client = useQueryClient();
  const stamp = `${round.id}:${round.userRating?.savedAt ?? ""}`;
  const [stampSeen, setStampSeen] = useState(stamp);
  const [draft, setDraft] = useState<RatingDraft>(() => draftFrom(round.userRating));
  const [copied, setCopied] = useState(false);
  if (stamp !== stampSeen) {
    setStampSeen(stamp);
    setDraft(draftFrom(round.userRating));
  }

  const save = useMutation({
    mutationFn: (body: RatingDraft) =>
      postJson<{ rating: UserRating; feedbackMarkdown: string }>(`/api/rsi/rounds/${encodeURIComponent(round.id)}/rating`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["rsi-rounds"] }),
  });

  const total = weightedTotal(draft.dimensions);
  const chips = [...DIAGNOSIS_CHIPS, ...draft.chips.filter((chip) => !DIAGNOSIS_CHIPS.includes(chip as (typeof DIAGNOSIS_CHIPS)[number]))];

  function setScore(key: RsiDimensionKey, value: number) {
    setDraft((current) => (current ? { ...current, dimensions: { ...current.dimensions, [key]: value } } : current));
  }

  async function copy() {
    if (!draft) return;
    await navigator.clipboard.writeText(feedbackMarkdown(round.label, draft, total));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <aside className="flex min-h-0 flex-col border-t border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 lg:border-l lg:border-t-0">
      <div className="border-b border-stone-100 px-4 py-3 dark:border-stone-800">
        <div className="text-xs text-stone-400">给 {round.label} 打分</div>
        <div className="text-3xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">{total.toFixed(1)}</div>
        <div className="text-[11px] text-stone-400">六维按 20 / 25 / 20 / 15 / 10 / 10 加权，满分 100</div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {RSI_DIMENSIONS.map((dim) => (
          <div key={dim.key}>
            <div className="flex items-baseline justify-between text-xs">
              <span>{dim.label}<span className="ml-1 text-stone-400">×{dim.weight}</span></span>
              <span className="tabular-nums">{draft.dimensions[dim.key]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={draft.dimensions[dim.key]}
              onChange={(event) => setScore(dim.key, Number(event.target.value))}
              className="w-full accent-rose-600"
              aria-label={dim.label}
            />
            <div className="flex gap-1">
              {SCORE_ANCHORS.map((anchor) => (
                <button
                  key={anchor}
                  type="button"
                  onClick={() => setScore(dim.key, anchor)}
                  className={clsx(
                    "rounded px-1.5 py-0.5 text-[10px] tabular-nums",
                    draft.dimensions[dim.key] === anchor ? "bg-rose-100 text-rose-700" : "text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800",
                  )}
                >
                  {anchor}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => {
            const on = draft.chips.includes(chip);
            return (
              <button
                key={chip}
                type="button"
                onClick={() =>
                  setDraft((current) =>
                    current
                      ? { ...current, chips: on ? current.chips.filter((item) => item !== chip) : [...current.chips, chip] }
                      : current,
                  )
                }
                className={clsx(
                  "rounded-full px-2 py-0.5 text-[11px]",
                  on ? "bg-rose-600 text-white" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
                )}
              >
                {chip}
              </button>
            );
          })}
        </div>
        <textarea
          value={draft.note}
          onChange={(event) => setDraft((current) => (current ? { ...current, note: event.target.value } : current))}
          placeholder="补充意见，会写进反馈 Markdown"
          rows={4}
          className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-rose-400 dark:border-stone-700 dark:bg-stone-950"
        />
      </div>
      <div className="space-y-2 border-t border-stone-100 p-3 dark:border-stone-800">
        {save.error && <p className="text-xs text-rose-600">{save.error instanceof Error ? save.error.message : "保存失败"}</p>}
        {save.isSuccess && <p className="text-xs text-emerald-600">已写入 {round.relDir}/user-rating.json</p>}
        <div className="flex gap-2">
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
          disabled={save.isPending}
          onClick={() => save.mutate(draft)}
        >
          <Save className="size-3.5" /> {save.isPending ? "保存中" : "保存到本轮"}
        </button>
        <button type="button" className={buttonClass("secondary")} onClick={() => void copy()}>
          <Copy className="size-3.5" /> {copied ? "已复制" : "复制反馈"}
        </button>
        </div>
      </div>
    </aside>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
