import clsx from "clsx";
import { CheckCircle2, CircleAlert, FileArchive, FileDown, FileText } from "lucide-react";
import { useArticles, markdownUrl, zipUrl } from "../api.ts";
import { PhaseBadge } from "../components/article.tsx";
import { buttonClass, Card, Empty, ErrorBox, Loading, PageHeader, Segmented } from "../components/ui.tsx";
import { useUi } from "../store.ts";

export function ExportPage() {
  const { data, error, isLoading } = useArticles();
  const { exportSelection, toggleExport, setExportSelection, exportPrefer, setExportPrefer } = useUi();
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const valid = exportSelection.filter((id) => data.some((a) => a.id === id));
  const all = data.length > 0 && valid.length === data.length;

  return (
    <>
      <PageHeader
        title="导出"
        subtitle="下载文章对应的 Markdown。管理台只读，不会运行 cta.py，也不会改动 export/。"
        actions={
          <a
            href={valid.length ? zipUrl(valid, exportPrefer) : undefined}
            download
            className={clsx(buttonClass("primary"), !valid.length && "pointer-events-none opacity-50")}
          >
            <FileArchive className="size-4" /> 打包下载 {valid.length ? `（${valid.length} 篇）` : ""}
          </a>
        }
      />
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-stone-500">打包内容</span>
          <Segmented
            value={exportPrefer}
            onChange={setExportPrefer}
            items={[
              { id: "export", label: "优先分享包" },
              { id: "clean", label: "一律用当前草稿" },
            ]}
          />
          <span className="text-xs text-stone-500">
            {exportPrefer === "export"
              ? "有 export/ 的文章打包分享包；没有的打包草稿正文和被引用的图。"
              : "全部按当前块拼接草稿，包含未接受的块。"}
          </span>
        </div>
      </Card>
      {!data.length ? (
        <Empty icon={<FileText className="size-8" />} title="没有可导出的文章" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500 dark:bg-stone-900">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input type="checkbox" checked={all} onChange={() => setExportSelection(all ? [] : data.map((a) => a.id))} aria-label="全选" />
                </th>
                <th className="px-4 py-2.5 font-medium">文章</th>
                <th className="px-4 py-2.5 font-medium">分享包</th>
                <th className="px-4 py-2.5 text-right font-medium">单篇下载</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {data.map((a) => (
                <tr key={a.id} className={clsx(valid.includes(a.id) && "bg-indigo-50/50 dark:bg-indigo-950/30")}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={valid.includes(a.id)} onChange={() => toggleExport(a.id)} aria-label={`选择 ${a.meta.title}`} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.meta.title || a.meta.slug}</span>
                      <PhaseBadge phase={a.meta.phase} />
                    </div>
                    <div className="font-mono text-xs text-stone-400">{a.relDir}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.hasExport ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="size-3.5" /> 已生成
                      </span>
                    ) : a.exportReady ? (
                      <span className="inline-flex items-center gap-1 text-sky-600">
                        <CircleAlert className="size-3.5" /> 可生成，尚未运行 compile --export
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-stone-500">
                        <CircleAlert className="size-3.5" /> {a.exportErrorCount} 项检查未通过
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <a
                        href={a.hasExport ? markdownUrl(a.id, "export", true) : undefined}
                        download
                        title="export/article.md"
                        className={clsx(buttonClass("secondary"), "px-2 py-1 text-xs", !a.hasExport && "pointer-events-none opacity-40")}
                      >
                        <FileDown className="size-3.5" /> 分享包
                      </a>
                      <a href={markdownUrl(a.id, "clean", true)} download title="当前块拼接的草稿" className={clsx(buttonClass("secondary"), "px-2 py-1 text-xs")}>
                        <FileText className="size-3.5" /> 草稿
                      </a>
                    </div>
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
