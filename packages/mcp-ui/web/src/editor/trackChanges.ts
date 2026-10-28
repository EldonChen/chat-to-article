import { Extension, Mark, mergeAttributes, type Editor } from "@tiptap/core";
import { Fragment, Mark as PMMarkClass, Slice, type Mark as PMMark, type MarkType, type Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Mapping, ReplaceStep, StepMap } from "@tiptap/pm/transform";

/**
 * 修订模式（类似 Word 的「审阅 → 修订」）：
 * - 新输入的文字带 insertion 标记；
 * - 删除的原文不真正删除，而是带 deletion 标记留在原处；
 * - 删除自己刚插入的文字则直接删除。
 * 实现方式是在 appendTransaction 里把每个 ReplaceStep 的删除内容重新插回并加删除线。
 *
 * 输入法组字期间不能改动组字所在的 DOM，否则 Chrome 会放弃组字，把拼音原样上屏。
 * 所以组字期间的事务（ProseMirror 用 "composition" 元数据标记，包括 compositionend
 * 之后才读到的最终提交）只记录范围，组字结束后再一次性补标记、插回删除的原文。
 *
 * 插入、删除、批注三种标记都设为 inclusive：光标停在非 inclusive 标记的末尾时，
 * Chrome 组字会把字挤进或挤出标记元素，ProseMirror 随之重绘组字节点，输入法同样会被打断。
 * 新输入的文字因此会先继承这些标记，再由本插件去掉不该继承的（删除、批注；修订关闭时还有插入）。
 */

export const SKIP_META = "trackChanges$skip";
const FLUSH_META = "trackChanges$flush";

export const Insertion = Mark.create({
  name: "insertion",
  inclusive: true,
  excludes: "deletion",
  parseHTML: () => [{ tag: "ins" }],
  renderHTML: ({ HTMLAttributes }) => ["ins", mergeAttributes(HTMLAttributes, { class: "track-ins" }), 0],
});

export const Deletion = Mark.create({
  name: "deletion",
  inclusive: true,
  excludes: "insertion",
  parseHTML: () => [{ tag: "del" }],
  renderHTML: ({ HTMLAttributes }) => ["del", mergeAttributes(HTMLAttributes, { class: "track-del" }), 0],
});

interface PendingDeletion {
  pos: number;
  slice: Slice;
}

interface TrackState {
  enabled: boolean;
  /** 组字期间插入的范围，组字结束后补（修订开）或去掉（修订关）插入标记。 */
  pendingIns: { from: number; to: number }[];
  /** 组字期间被替换掉的原文，组字结束后带删除标记插回。 */
  pendingDel: PendingDeletion[];
}

export const trackKey = new PluginKey<TrackState>("trackChanges");

export const isCompositionTr = (tr: Transaction) => tr.getMeta("composition") != null;

function markTypes(schema: EditorState["schema"]) {
  return { ins: schema.marks.insertion as MarkType, del: schema.marks.deletion as MarkType, comment: schema.marks.comment as MarkType | undefined };
}

/** 给新输入的文字定标记：修订开时只带插入标记，修订关时不带修订标记；都不继承批注。 */
function markInserted(tr: Transaction, from: number, to: number, enabled: boolean): void {
  const { ins, del, comment } = markTypes(tr.doc.type.schema);
  if (comment && tr.doc.rangeHasMark(from, to, comment)) tr.removeMark(from, to, comment);
  if (tr.doc.rangeHasMark(from, to, del)) tr.removeMark(from, to, del);
  if (enabled) tr.addMark(from, to, ins.create());
  else if (tr.doc.rangeHasMark(from, to, ins)) tr.removeMark(from, to, ins);
}

/** 被删掉的内容：去掉自己插入的部分，其余加上删除标记。没有剩下文字时返回 null。 */
function toDeletedSlice(slice: Slice, ins: MarkType, del: PMMark): Slice | null {
  let hasText = false;
  const walk = (fragment: Fragment): Fragment => {
    const out: PMNode[] = [];
    fragment.forEach((child) => {
      if (child.isText) {
        if (ins.isInSet(child.marks)) return;
        hasText = true;
        out.push(child.mark(del.addToSet(child.marks)));
      } else if (child.isInline) {
        if (!ins.isInSet(child.marks)) out.push(child);
      } else {
        out.push(child.copy(walk(child.content)));
      }
    });
    return Fragment.fromArray(out);
  };
  const content = walk(slice.content);
  return hasText ? new Slice(content, slice.openStart, slice.openEnd) : null;
}

function mapThrough(maps: readonly StepMap[]): Mapping {
  return new Mapping(maps.slice());
}

interface Change {
  /** 起点（步骤前后相同） */
  from: number;
  /** 步骤前被替换内容的终点 */
  to: number;
  /** 步骤后插入内容的长度 */
  size: number;
}

/**
 * 步骤真正改动的范围。ProseMirror 从 DOM 读取输入（组字、安卓输入等）时，
 * 替换范围可能连带前后没变的字，例如把「经常」换成「经常z」。剪掉文字和标记都相同的前后缀。
 */
function effectiveChange(step: ReplaceStep, doc: PMNode): Change {
  const raw = { from: step.from, to: step.to, size: step.slice.size };
  const { slice } = step;
  if (step.to === step.from || !slice.size || slice.openStart || slice.openEnd) return raw;
  const $from = doc.resolve(step.from);
  if (!$from.parent.isTextblock || step.to > $from.end()) return raw;
  const units = (nodes: PMNode[]) => nodes.flatMap((n) => [...(n.text ?? "")].flatMap((ch) => [...ch].map(() => ({ ch, marks: n.marks }))));
  const oldNodes: PMNode[] = [];
  doc.nodesBetween(step.from, step.to, (n, pos) => {
    if (n.isText) oldNodes.push(n.cut(Math.max(0, step.from - pos), step.to - pos));
    else if (n.isInline) oldNodes.push(n);
    return !n.isInline;
  });
  const newNodes: PMNode[] = [];
  slice.content.forEach((n) => newNodes.push(n));
  if (![...oldNodes, ...newNodes].every((n) => n.isText)) return raw;
  const a = units(oldNodes);
  const b = units(newNodes);
  const same = (x: (typeof a)[number], y: (typeof a)[number]) => x.ch === y.ch && PMMarkClass.sameSet(x.marks, y.marks);
  let p = 0;
  while (p < a.length && p < b.length && same(a[p], b[p])) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && same(a[a.length - 1 - q], b[b.length - 1 - q])) q++;
  return { from: step.from + p, to: step.to - q, size: slice.size - p - q };
}

interface StepInfo {
  change: Change;
  doc: PMNode;
  /** 这一步在所有步骤里的序号，用来把位置映射到合并后的文档 */
  index: number;
}

/** 只覆盖真正改动范围的位置映射，没变的前后缀里的位置保持不动。 */
const changeMap = (c: Change) => new StepMap([c.from, c.to - c.from, c.size]);

function replaceSteps(trs: readonly Transaction[]): { steps: StepInfo[]; maps: StepMap[] } {
  const maps: StepMap[] = [];
  const steps: StepInfo[] = [];
  for (const t of trs)
    t.steps.forEach((s, i) => {
      if (s instanceof ReplaceStep) {
        const change = effectiveChange(s, t.docs[i]);
        steps.push({ change, doc: t.docs[i], index: maps.length });
        maps.push(changeMap(change));
      } else maps.push(s.getMap());
    });
  return { steps, maps };
}

/** 新插入内容在合并后文档里的范围。 */
function insertedRanges(trs: readonly Transaction[]): { from: number; to: number }[] {
  const { steps, maps } = replaceSteps(trs);
  const out: { from: number; to: number }[] = [];
  for (const { change, index } of steps) {
    if (!change.size) continue;
    const after = mapThrough(maps.slice(index + 1));
    const a = after.map(change.from, 1);
    const b = after.map(change.from + change.size, -1);
    if (b > a) out.push({ from: a, to: b });
  }
  return out;
}

export const TrackChanges = Extension.create({
  name: "trackChanges",

  addProseMirrorPlugins() {
    let composing = false;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    const flush = (view: EditorView) => {
      if (view.isDestroyed || view.composing || composing) return;
      const st = trackKey.getState(view.state);
      if (!st || (!st.pendingIns.length && !st.pendingDel.length)) return;
      const tr = view.state.tr;
      const size = tr.doc.content.size;
      for (const r of st.pendingIns) {
        const from = Math.max(0, Math.min(r.from, size));
        const to = Math.max(from, Math.min(r.to, size));
        if (to > from) markInserted(tr, from, to, st.enabled);
      }
      for (const d of [...st.pendingDel].sort((a, b) => b.pos - a.pos)) {
        const pos = tr.mapping.map(Math.min(d.pos, size), -1);
        tr.replace(pos, pos, d.slice);
      }
      tr.setMeta(trackKey, { pendingIns: [], pendingDel: [] });
      view.dispatch(tr.setMeta(SKIP_META, true).setMeta(FLUSH_META, true));
    };

    const plugin: Plugin<TrackState> = new Plugin<TrackState>({
      key: trackKey,
      state: {
        init: () => ({ enabled: true, pendingIns: [], pendingDel: [] }),
        apply(tr, value, _old, newState) {
          const meta = tr.getMeta(trackKey) as Partial<TrackState> | undefined;
          let next: TrackState = meta ? { ...value, ...meta } : value;
          if (!tr.docChanged) return next;
          if (!(composing || isCompositionTr(tr)) || tr.getMeta(SKIP_META)) {
            if (!next.pendingIns.length && !next.pendingDel.length) return next;
            return {
              ...next,
              pendingIns: next.pendingIns.map((r) => ({ from: tr.mapping.map(r.from, -1), to: tr.mapping.map(r.to, 1) })),
              pendingDel: next.pendingDel.map((d) => ({ ...d, pos: tr.mapping.map(d.pos, -1) })),
            };
          }
          const { ins, del } = markTypes(newState.schema);
          let pendingIns = next.pendingIns;
          let pendingDel = next.pendingDel;
          tr.steps.forEach((step, i) => {
            const change = step instanceof ReplaceStep ? effectiveChange(step, tr.docs[i]) : null;
            const map = change ? changeMap(change) : step.getMap();
            if (next.enabled && change && change.to > change.from) {
              // 组字过程中被替换掉的拼音（还在本次组字的插入范围里）不算删除
              const interim = pendingIns.some((r) => r.from <= change.from && change.to <= r.to);
              if (!interim) {
                const slice = toDeletedSlice(tr.docs[i].slice(change.from, change.to), ins, del.create());
                if (slice) pendingDel = [...pendingDel, { pos: change.from, slice }];
              }
            }
            pendingIns = pendingIns.map((r) => ({ from: map.map(r.from, -1), to: map.map(r.to, 1) }));
            pendingDel = pendingDel.map((d) => ({ ...d, pos: map.map(d.pos, -1) }));
            if (change && change.size > 0) pendingIns = [...pendingIns, { from: change.from, to: change.from + change.size }];
          });
          next = { ...next, pendingIns, pendingDel };
          return next;
        },
      },

      appendTransaction(trs, oldState, newState) {
        const st = trackKey.getState(newState);
        if (!st || composing) return null;
        if (!trs.some((t) => t.docChanged)) return null;
        if (trs.some((t) => isCompositionTr(t) || t.getMeta(SKIP_META) || t.getMeta("history$") || t.getMeta(FLUSH_META))) return null;
        const { ins, del } = markTypes(newState.schema);

        if (!st.enabled) {
          const tr = newState.tr;
          for (const r of insertedRanges(trs)) markInserted(tr, r.from, r.to, false);
          return tr.docChanged ? tr.setMeta(SKIP_META, true) : null;
        }

        const delMark = del.create();
        const { steps, maps } = replaceSteps(trs);
        const deletions: { pos: number; slice: Slice; backward: boolean }[] = [];
        for (const { change, doc, index } of steps) {
          if (change.to <= change.from) continue;
          const slice = toDeletedSlice(doc.slice(change.from, change.to), ins, delMark);
          if (!slice) continue;
          const sel = oldState.selection;
          const backward = index === 0 && sel.empty && sel.from === change.to && change.size === 0;
          deletions.push({ pos: mapThrough(maps.slice(index + 1)).map(change.from, -1), slice, backward });
        }
        const insertions = insertedRanges(trs);
        if (!insertions.length && !deletions.length) return null;

        const tr = newState.tr;
        for (const r of insertions) markInserted(tr, r.from, r.to, true);
        deletions.sort((a, b) => b.pos - a.pos);
        let cursor: number | null = null;
        for (const d of deletions) {
          const pos = tr.mapping.map(d.pos, -1);
          tr.replace(pos, pos, d.slice);
          if (d.backward && deletions.length === 1) cursor = pos;
        }
        if (cursor != null) tr.setSelection(TextSelection.create(tr.doc, cursor));
        if (!tr.docChanged && cursor == null) return null;
        return tr.setMeta(SKIP_META, true);
      },

      props: {
        handleDOMEvents: {
          compositionstart() {
            composing = true;
            clearTimeout(flushTimer);
            return false;
          },
          compositionend(view) {
            composing = false;
            // 等 ProseMirror 读完组字最终提交的 DOM（它在 compositionend 之后的微任务里读取）
            clearTimeout(flushTimer);
            flushTimer = setTimeout(() => flush(view), 30);
            return false;
          },
          blur(view) {
            composing = false;
            clearTimeout(flushTimer);
            flush(view);
            return false;
          },
        },
      },
      view: () => ({ destroy: () => clearTimeout(flushTimer) }),
    });
    return [plugin];
  },
});

export function isTracking(editor: Editor): boolean {
  return trackKey.getState(editor.state)?.enabled ?? false;
}

export function setTracking(editor: Editor, enabled: boolean): void {
  editor.view.dispatch(editor.state.tr.setMeta(trackKey, { enabled }));
}

// ---------------------------------------------------------------------------
// 修订列表与接受 / 拒绝

export interface Run {
  type: "insertion" | "deletion";
  from: number;
  to: number;
  text: string;
}

export interface ChangeCard {
  key: string;
  kind: "insert" | "delete" | "replace";
  from: number;
  to: number;
  deleted: string;
  inserted: string;
  context: string;
}

export function changeRuns(doc: PMNode): Run[] {
  const runs: Run[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const type = node.marks.some((m) => m.type.name === "insertion")
      ? "insertion"
      : node.marks.some((m) => m.type.name === "deletion")
        ? "deletion"
        : null;
    if (!type) return;
    const last = runs[runs.length - 1];
    if (last && last.type === type && last.to === pos) {
      last.to = pos + node.nodeSize;
      last.text += node.text ?? "";
    } else {
      runs.push({ type, from: pos, to: pos + node.nodeSize, text: node.text ?? "" });
    }
  });
  return runs;
}

function finalTextBetween(doc: PMNode, from: number, to: number): string {
  let out = "";
  doc.nodesBetween(from, to, (child, pos) => {
    if (!child.isText || child.marks.some((m) => m.type.name === "deletion")) return;
    const text = child.text ?? "";
    out += text.slice(Math.max(0, from - pos), Math.max(0, to - pos));
  });
  return out;
}

/** 修订前后各取一小段最终文字，〔此处〕标出修订位置，方便 agent 定位。 */
function contextAround(doc: PMNode, from: number, to: number): string {
  const $from = doc.resolve(from);
  const before = finalTextBetween(doc, $from.start(), from).slice(-15);
  const after = finalTextBetween(doc, to, doc.resolve(to).end()).slice(0, 15);
  return `${before}〔此处〕${after}`;
}

export function changeCards(doc: PMNode): ChangeCard[] {
  const runs = changeRuns(doc);
  const cards: ChangeCard[] = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const next = runs[i + 1];
    if (run.type === "deletion" && next?.type === "insertion" && next.from === run.to) {
      cards.push({ key: `${run.from}`, kind: "replace", from: run.from, to: next.to, deleted: run.text, inserted: next.text, context: contextAround(doc, run.from, next.to) });
      i++;
    } else {
      const context = contextAround(doc, run.from, run.to);
      cards.push({
        key: `${run.from}`,
        kind: run.type === "insertion" ? "insert" : "delete",
        from: run.from,
        to: run.to,
        deleted: run.type === "deletion" ? run.text : "",
        inserted: run.type === "insertion" ? run.text : "",
        context,
      });
    }
  }
  return cards;
}

function resolveRange(editor: Editor, from: number, to: number, accept: boolean): void {
  const { state } = editor;
  const tr = state.tr;
  const remove = accept ? "deletion" : "insertion";
  const keep = accept ? "insertion" : "deletion";
  const runs = changeRuns(state.doc).filter((r) => r.from >= from && r.to <= to);
  for (const r of runs.filter((x) => x.type === remove).sort((a, b) => b.from - a.from)) tr.delete(r.from, r.to);
  const a = tr.mapping.map(from, 1);
  const b = tr.mapping.map(to, -1);
  if (b > a) tr.removeMark(a, b, state.schema.marks[keep]);
  editor.view.dispatch(tr.setMeta(SKIP_META, true));
}

export const acceptChange = (editor: Editor, card: Pick<ChangeCard, "from" | "to">) => resolveRange(editor, card.from, card.to, true);
export const rejectChange = (editor: Editor, card: Pick<ChangeCard, "from" | "to">) => resolveRange(editor, card.from, card.to, false);
export const acceptAll = (editor: Editor) => resolveRange(editor, 0, editor.state.doc.content.size, true);
export const rejectAll = (editor: Editor) => resolveRange(editor, 0, editor.state.doc.content.size, false);

/** 应用所有修订后的文档：删掉删除线文字，去掉修订与批注标记，丢弃因此变空的段落。 */
export function finalDocJSON(doc: PMNode): Record<string, unknown> {
  type J = { type: string; text?: string; marks?: { type: string }[]; content?: J[]; attrs?: unknown };
  const strip = (node: J): J | null => {
    if (node.type === "text") {
      if (node.marks?.some((m) => m.type === "deletion")) return null;
      const marks = node.marks?.filter((m) => !["insertion", "deletion", "comment"].includes(m.type));
      return { ...node, marks: marks?.length ? marks : undefined };
    }
    if (!node.content) return node;
    const content = node.content.map(strip).filter((c): c is J => !!c);
    const textBlock = ["paragraph", "heading"].includes(node.type);
    const hadText = node.content.some((c) => c.type === "text");
    if (textBlock && hadText && !content.some((c) => c.type === "text" && c.text?.trim())) return null;
    if (!textBlock && node.type !== "doc" && node.content.length && !content.length) return null;
    return { ...node, content };
  };
  return (strip(doc.toJSON() as J) ?? { type: "doc", content: [] }) as Record<string, unknown>;
}
