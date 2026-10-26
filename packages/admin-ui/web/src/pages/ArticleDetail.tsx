import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { useArticle } from "../api.ts";
import { AttentionList, ExportMenu, GateStepper, PhaseBadge } from "../components/article.tsx";
import { CopyButton, ErrorBox, Loading, Tabs } from "../components/ui.tsx";
import { relativeTime } from "../lib/format.ts";
import { ChecksTab, ClaimsTab, FiguresTab, MarkdownTab, OutlineTab, PlanTab, ReaderTab, RevisionsTab } from "./article-tabs.tsx";

type TabId = "read" | "plan" | "claims" | "outline" | "figures" | "checks" | "revisions" | "markdown";

export function ArticleDetailPage() {
  const { id = "", tab = "read" } = useParams();
  const navigate = useNavigate();
  const { data: article, error, isLoading } = useArticle(id);
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !article) return <Loading />;

  const current = tab as TabId;
  const bans = article.lint.filter((f) => f.severity === "ban").length;
  const tabs: { id: TabId; label: string; count?: number; tone?: "danger" | "warn" }[] = [
    { id: "read", label: "阅读" },
    { id: "plan", label: "写作计划" },
    { id: "claims", label: "主张", count: article.claims.total, tone: article.claims.candidate + article.claims.disputed ? "warn" : undefined },
    { id: "outline", label: "大纲", count: article.sections },
    { id: "figures", label: "图", count: article.figures },
    {
      id: "checks",
      label: "检查",
      count: article.exportErrors.length,
      tone: bans ? "danger" : article.exportErrors.length ? "warn" : undefined,
    },
    { id: "revisions", label: "修订记录", count: article.revisions.length },
    { id: "markdown", label: "Markdown" },
  ];

  return (
    <>
      <Link to="/articles" className="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-indigo-600">
        <ArrowLeft className="size-4" /> 全部文章
      </Link>
      <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">{article.meta.title || article.meta.slug}</h1>
              <PhaseBadge phase={article.meta.phase} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
              <span className="font-mono">{article.meta.slug}</span>
              {article.meta.topic && <span>主题：{article.meta.topic}</span>}
              <span>风格版本 r{article.meta.styleRevision}</span>
              <span>{article.meta.locale}</span>
              <span>更新于 {relativeTime(article.updatedAt)}</span>
              <span className="inline-flex items-center font-mono">
                {article.dir}
                <CopyButton text={article.dir} />
              </span>
            </div>
          </div>
          <ExportMenu article={article} />
        </div>
        <div className="mt-5">
          <GateStepper article={article} />
        </div>
        <div className="mt-4">
          <AttentionList article={article} />
        </div>
      </div>

      <Tabs<TabId> value={current} onChange={(t) => navigate(`/articles/${id}/${t === "read" ? "" : t}`)} items={tabs} />
      <div className="mt-5">
        {current === "read" && <ReaderTab article={article} />}
        {current === "plan" && <PlanTab article={article} />}
        {current === "claims" && <ClaimsTab article={article} />}
        {current === "outline" && <OutlineTab article={article} />}
        {current === "figures" && <FiguresTab article={article} />}
        {current === "checks" && <ChecksTab article={article} />}
        {current === "revisions" && <RevisionsTab article={article} />}
        {current === "markdown" && <MarkdownTab article={article} />}
      </div>
    </>
  );
}
