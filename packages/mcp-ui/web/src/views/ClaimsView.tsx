import clsx from "clsx";
import { AlertTriangle, Check, CheckCheck, KeyRound, Layers, List, Plus, Send } from "lucide-react";
import { useState } from "react";
import type { ClaimsContext, ReviewClaimsInput, ReviewClaimsResult, SessionDetail } from "../../../src/shared/actions.ts";
import { ActionBar } from "../components/ActionBar.tsx";
import { ExpressChrome, toggleChip, withChips } from "../components/ExpressChrome.tsx";
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

export const CLAIM_ROLES: { id: string; label: string; hint: string; tone: "amber" | "green" | "blue" | "violet" }[] = [
  { id: "friction", label: "困惑/痛点", hint: "最初卡住的问题或直觉冲突", tone: "amber" },
  { id: "insight", label: "核心顿悟", hint: "追问后想通的关键判断", tone: "green" },
  { id: "evidence", label: "机制/证据", hint: "支撑结论的原理、代码、数据或案例", tone: "blue" },
  { id: "boundary", label: "适用边界", hint: "限制条件、反例、代价或脱敏约束", tone: "violet" },
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
        role: c.role ?? existing?.role,
        inquiryTurn: c.inquiryTurn ?? existing?.inquiryTurn,
        gapNote: c.gapNote ?? existing?.gapNote,
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
  const [groupByRole, setGroupByRole] = useState<boolean>(() => input.claims.some((c) => !!c.role));
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [express, setExpress] = useState(true);
  const [chips, setChips] = useState<string[]>([]);

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

  const filteredRows = rows.filter((r) => roleFilter === "all" || (r.role ?? "unassigned") === roleFilter);

  const onAction = (id: string) => {
    const result: ReviewClaimsResult = {
      decision: id as ReviewClaimsResult["decision"],
      claims: rows.map(({ original: _o, originalStatus: _s, ...r }) => ({
        ...r,
        text: r.text.trim(),
        gapNote: r.gapNote?.trim() || undefined,
        comment: r.comment?.trim() || undefined,
      })),
      note: withChips(draft.note, chips),
    };
    submit(id, result);
  };

  const renderRow = (r: Row) => {
    const used = context.usedBy[r.id] ?? [];
    const textChanged = r.original != null && r.original !== r.text.trim();
    const statusChanged = r.originalStatus === "accepted" && r.status !== "accepted";
    return (
      <div
        key={r.id}
        className={clsx(
          "rounded-xl border bg-white p-4 shadow-sm dark:bg-stone-900",
          r.status === "rejected"
            ? "border-stone-200 opacity-60 dark:border-stone-800"
            : r.status === "accepted"
              ? "border-emerald-200 dark:border-emerald-900"
              : "border-stone-200 dark:border-stone-800",
        )}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-stone-400">{r.id}</span>
          {r.inquiryTurn != null && <Tag>第 {r.inquiryTurn} 问</Tag>}
          {r.isNew && <Badge tone="violet">你新加的</Badge>}
          {r.original == null && !r.isNew && <Badge tone="blue">新候选</Badge>}
          <div className="flex flex-wrap items-center gap-1">
            {!express &&
              CLAIM_ROLES.map((role) => {
              const active = r.role === role.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  title={role.hint}
                  onClick={() => update(r.id, { role: active ? undefined : role.id })}
                  className={clsx(
                    "rounded-md px-1.5 py-0.5 text-[11px] transition",
                    active
                      ? "bg-emerald-600 font-medium text-white"
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400",
                  )}
                >
                  {role.label}
                </button>
              );
            })}
          </div>
          <div className="ml-auto">
            <Segmented value={r.status} onChange={(status) => update(r.id, { status })} items={STATUS} />
          </div>
        </div>
        <AutoTextarea value={r.text} onChange={(text) => update(r.id, { text })} minRows={3} className="font-serif text-base leading-relaxed" />
        {!express && (
          <>
        {(r.gapNote != null || r.status === "disputed") && (
          <div className="mt-2">
            <input
              value={r.gapNote ?? ""}
              onChange={(e) => update(r.id, { gapNote: e.target.value })}
              placeholder="认知缺口 / 待补证据说明（可选，例如：需补充高并发场景下的验证数据）"
              className="w-full rounded-md border border-dashed border-amber-300 bg-amber-50/40 px-2.5 py-1 text-xs text-amber-900 outline-none dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            />
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {r.sources?.map((s, i) => (
            <Tag key={i}>
              {s.kind}
              {s.id ? `:${s.id.slice(0, 12)}` : ""}
              {s.note ? ` · ${s.note}` : ""}
            </Tag>
          ))}
          {used.length > 0 && <span className="text-stone-400">被 {used.join("、")} 使用</span>}
          {r.gapNote == null && r.status !== "disputed" && (
            <button
              type="button"
              onClick={() => update(r.id, { gapNote: "" })}
              className="text-stone-400 hover:text-amber-600"
            >
              + 标记待补缺口
            </button>
          )}
          <span className="ml-auto">
            <FieldComment value={r.comment ?? ""} onChange={(comment) => update(r.id, { comment })} />
          </span>
        </div>
          </>
        )}
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
  };

  return (
    <>
      <ExpressChrome
        express={express}
        onExpress={setExpress}
        thread={context.motivation?.ahaMoment || input.context || "先确认哪些判断要写进正文"}
        hook={context.motivation?.initialConfusion || "主张按痛点、顿悟、证据、边界归堆"}
        structure={`${rows.filter((r) => r.status === "accepted").length} 条采用 / ${rows.length} 条`}
        chips={chips}
        onChip={(id) => setChips((list) => toggleChip(list, id))}
      />
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-4 @4xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-3">
          {input.context && <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">{input.context}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-stone-500">
                {rows.length} 条主张 · {open} 条未定
              </span>
              <div className="flex flex-wrap gap-1">
                {[
                  { id: "all", label: "全部" },
                  ...CLAIM_ROLES.map((r) => ({ id: r.id, label: r.label })),
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRoleFilter(item.id)}
                    className={clsx(
                      "rounded-full px-2.5 py-0.5 text-xs transition",
                      roleFilter === item.id
                        ? "bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900"
                        : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={buttonClass("secondary", "sm")}
                onClick={() => setGroupByRole((v) => !v)}
                title="切换按认知角色分组或平铺列表"
              >
                {groupByRole ? <List className="size-3.5" /> : <Layers className="size-3.5" />}
                {groupByRole ? "平铺列表" : "按认知链路分组"}
              </button>
              <button
                type="button"
                className={buttonClass("secondary", "sm")}
                onClick={() => setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.status === "candidate" ? { ...r, status: "accepted" } : r)) }))}
              >
                <CheckCheck className="size-3.5" /> 待定的全部采用
              </button>
            </div>
          </div>

          {groupByRole && roleFilter === "all" ? (
            <div className="space-y-4">
              {[...CLAIM_ROLES, { id: "unassigned", label: "未分类主张", hint: "可点击上方标签归入对应认知角色", tone: "gray" as const }].map((group) => {
                const items = filteredRows.filter((r) => (r.role ?? "unassigned") === group.id);
                if (!items.length) return null;
                return (
                  <div key={group.id} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
                      <Badge tone={group.tone}>{group.label}</Badge>
                      <span>{group.hint}</span>
                      <span className="ml-auto font-mono">{items.length} 条</span>
                    </div>
                    <div className="space-y-2.5">{items.map(renderRow)}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">{filteredRows.map(renderRow)}</div>
          )}

          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                rows: [
                  ...d.rows,
                  {
                    id: nextId(),
                    text: "",
                    status: "accepted",
                    role: roleFilter !== "all" ? roleFilter : "insight",
                    isNew: true,
                    comment: "",
                    sources: [{ kind: "user" }],
                  },
                ],
              }))
            }
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-stone-300 py-3 text-sm text-stone-500 hover:border-emerald-400 hover:text-emerald-600 dark:border-stone-700"
          >
            <Plus className="size-4" /> 补一条主张
          </button>
        </div>

        <aside className="space-y-4 @4xl:sticky @4xl:top-4 @4xl:self-start">
          {context.motivation && (context.motivation.initialConfusion || context.motivation.ahaMoment) && (
            <Card title="本篇追问动机对照">
              <div className="space-y-2 text-xs leading-relaxed">
                {context.motivation.initialConfusion && (
                  <div>
                    <div className="font-semibold text-amber-700 dark:text-amber-300">困惑起点</div>
                    <p className="text-stone-600 dark:text-stone-300">{context.motivation.initialConfusion}</p>
                  </div>
                )}
                {context.motivation.ahaMoment && (
                  <div>
                    <div className="font-semibold text-emerald-700 dark:text-emerald-300">核心顿悟</div>
                    <p className="text-stone-600 dark:text-stone-300">{context.motivation.ahaMoment}</p>
                  </div>
                )}
                {!!context.motivation.knowledgeGaps?.length && (
                  <div>
                    <div className="font-semibold text-violet-700 dark:text-violet-300">待补认知缺口</div>
                    <ul className="list-disc pl-4 text-stone-500">
                      {context.motivation.knowledgeGaps.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}
          <Card title="认知链路审阅指南">
            <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              <li>按「困惑/痛点 → 核心顿悟 → 机制/证据 → 适用边界」检查主张是否形成闭环。</li>
              <li>只有「采用」的主张能写进正文；改字会让引用它的块变为 stale。</li>
              <li>聊天里还没聊透的点，点「+ 标记待补缺口」或标「有疑问」，agent 会去补查材料。</li>
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
        status={
          blockingSecrets.length
            ? `${blockingSecrets.map((r) => r.id).join("、")} 含疑似密钥，勾选「已处理」后才能采用`
            : open
              ? `还有 ${open} 条未定，提交后主张关卡不会通过`
              : "全部定了，提交后可以通过主张关卡"
        }
        onAction={onAction}
        actions={[
          { id: "revise", label: "让 agent 再查", icon: <Send className="size-4" />, disabled: !commented && !draft.note.trim(), hint: "需要批注或整体意见" },
          { id: "submit", label: "提交决定", icon: <Check className="size-4" />, variant: "primary", disabled: blockingSecrets.length > 0 || rows.some((r) => !r.text.trim()) },
        ]}
      />
    </>
  );
}
