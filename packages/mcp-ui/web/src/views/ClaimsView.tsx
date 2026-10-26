import clsx from "clsx";
import { AlertTriangle, Check, CheckCheck, KeyRound, Plus, Send } from "lucide-react";
import type { ClaimsContext, ReviewClaimsInput, ReviewClaimsResult, SessionDetail } from "../../../src/shared/actions.ts";
import { ActionBar } from "../components/ActionBar.tsx";
import { AutoTextarea, Badge, buttonClass, Card, FieldComment, Segmented, Tag } from "../components/ui.tsx";
import { useDraft } from "../store.ts";
import type { SubmitFn } from "./types.ts";

type Status = ReviewClaimsResult["claims"][number]["status"];
type Row = ReviewClaimsResult["claims"][number] & { original?: string; originalStatus?: string };

const STATUS: { id: Status; label: string; tone: "green" | "gray" | "amber" | "red" }[] = [
  { id: "accepted", label: "采用", tone: "green" },
  { id: "candidate", label: "待定", tone: "gray" },
  { id: "disputed", label: "有疑问", tone: "amber" },
  { id: "rejected", label: "不要", tone: "red" },
];

export function ClaimsView({ session, submit }: { session: SessionDetail<ReviewClaimsInput, ClaimsContext>; submit: SubmitFn }) {
  const { input, context } = session;
  const [draft, setDraft] = useDraft(session.id, () => ({
    rows: input.claims.map((c): Row => {
      const existing = context.existing.find((e) => e.id === c.id);
      return {
        id: c.id,
        text: c.text,
        status: c.status ?? (existing?.status as Status | undefined) ?? "candidate",
        sources: c.sources ?? existing?.sources,
        secret: c.secret ?? existing?.secret,
        resolved: existing?.resolved,
        comment: "",
        original: existing?.text,
        originalStatus: existing?.status,
      };
    }),
    note: "",
  }));
  const rows = draft.rows;
  const update = (id: string, patch: Partial<Row>) => setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const allIds = new Set([...context.existing.map((e) => e.id), ...rows.map((r) => r.id)]);
  const nextId = () => {
    let n = allIds.size + 1;
    while (allIds.has(`c${n}`)) n++;
    return `c${n}`;
  };
  const blockingSecrets = rows.filter((r) => r.secret && !r.resolved && r.status === "accepted");
  const open = rows.filter((r) => r.status === "candidate" || r.status === "disputed").length;
  const commented = rows.filter((r) => r.comment?.trim()).length;

  const onAction = (id: string) => {
    const result: ReviewClaimsResult = {
      decision: id as ReviewClaimsResult["decision"],
      claims: rows.map(({ original: _o, originalStatus: _s, ...r }) => ({ ...r, text: r.text.trim(), comment: r.comment?.trim() || undefined })),
      note: draft.note.trim() || undefined,
    };
    submit(id, result);
  };

  return (
    <>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-4 @4xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          {input.context && <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">{input.context}</p>}
          <div className="flex items-center justify-between">
            <div className="text-sm text-stone-500">
              {rows.length} 条主张 · {open} 条未定
            </div>
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.status === "candidate" ? { ...r, status: "accepted" } : r)) }))}>
              <CheckCheck className="size-3.5" /> 待定的全部采用
            </button>
          </div>
          {rows.map((r) => {
            const used = context.usedBy[r.id] ?? [];
            const textChanged = r.original != null && r.original !== r.text.trim();
            const statusChanged = r.originalStatus === "accepted" && r.status !== "accepted";
            return (
              <div
                key={r.id}
                className={clsx(
                  "rounded-xl border bg-white p-4 shadow-sm dark:bg-stone-900",
                  r.status === "rejected" ? "border-stone-200 opacity-60 dark:border-stone-800" : r.status === "accepted" ? "border-emerald-200 dark:border-emerald-900" : "border-stone-200 dark:border-stone-800",
                )}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-stone-400">{r.id}</span>
                  {r.isNew && <Badge tone="violet">你新加的</Badge>}
                  {r.original == null && !r.isNew && <Badge tone="blue">新候选</Badge>}
                  <div className="ml-auto">
                    <Segmented value={r.status} onChange={(status) => update(r.id, { status })} items={STATUS} />
                  </div>
                </div>
                <AutoTextarea value={r.text} onChange={(text) => update(r.id, { text })} minRows={1} className="font-serif" />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {r.sources?.map((s, i) => (
                    <Tag key={i}>
                      {s.kind}
                      {s.id ? `:${s.id.slice(0, 12)}` : ""}
                      {s.note ? ` · ${s.note}` : ""}
                    </Tag>
                  ))}
                  {used.length > 0 && <span className="text-stone-400">被 {used.join("、")} 使用</span>}
                  <span className="ml-auto">
                    <FieldComment value={r.comment ?? ""} onChange={(comment) => update(r.id, { comment })} />
                  </span>
                </div>
                {r.secret && (
                  <label className="mt-2 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                    <KeyRound className="size-3.5" />
                    原文疑似含密钥，采用前请确认已脱敏
                    <input type="checkbox" className="ml-auto" checked={!!r.resolved} onChange={(e) => update(r.id, { resolved: e.target.checked })} />
                    已处理
                  </label>
                )}
                {used.length > 0 && (textChanged || statusChanged) && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    <AlertTriangle className="size-3.5" />
                    提交后 {used.join("、")} 会变成 stale，需要重写
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, rows: [...d.rows, { id: nextId(), text: "", status: "accepted", isNew: true, comment: "", sources: [{ kind: "user" }] }] }))}
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-stone-300 py-3 text-sm text-stone-500 hover:border-emerald-400 hover:text-emerald-600 dark:border-stone-700"
          >
            <Plus className="size-4" /> 补一条主张
          </button>
        </div>
        <aside className="space-y-4 @4xl:sticky @4xl:top-4 @4xl:self-start">
          <Card title="怎么用">
            <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              <li>只有「采用」的主张能写进正文。</li>
              <li>改字等于把旧主张作废、换成新的，用到它的块会重写。</li>
              <li>拿不准就标「有疑问」并批注，agent 会回去查材料。</li>
            </ul>
          </Card>
          {input.materials && (
            <Card title="材料">
              <div className="space-y-1 text-xs">
                {input.materials.selected.map((m) => (
                  <div key={m} className="flex items-center gap-1.5">
                    <Check className="size-3 text-emerald-600" />
                    <span className="truncate font-mono">{m}</span>
                    {input.materials?.fullText.includes(m) && <Badge>全文</Badge>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
      <ActionBar
        note={draft.note}
        onNote={(note) => setDraft((d) => ({ ...d, note }))}
        status={blockingSecrets.length ? `${blockingSecrets.map((r) => r.id).join("、")} 含疑似密钥，勾选「已处理」后才能采用` : open ? `还有 ${open} 条未定，提交后主张关卡不会通过` : "全部定了，提交后可以通过主张关卡"}
        onAction={onAction}
        actions={[
          { id: "revise", label: "让 agent 再查", icon: <Send className="size-4" />, disabled: !commented && !draft.note.trim(), hint: "需要批注或整体意见" },
          { id: "submit", label: "提交决定", icon: <Check className="size-4" />, variant: "primary", disabled: blockingSecrets.length > 0 || rows.some((r) => !r.text.trim()) },
        ]}
      />
    </>
  );
}
