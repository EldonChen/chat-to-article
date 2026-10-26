import { Extension, Mark, mergeAttributes, type Editor } from "@tiptap/core";
import { Fragment, Slice, type Mark as PMMark, type MarkType, type Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Mapping, ReplaceStep, type StepMap } from "@tiptap/pm/transform";

/**
 * 修订模式（类似 Word 的「审阅 → 修订」）：
 * - 新输入的文字带 insertion 标记；
 * - 删除的原文不真正删除，而是带 deletion 标记留在原处；
 * - 删除自己刚插入的文字则直接删除。
 * 实现方式是在 appendTransaction 里把每个 ReplaceStep 的删除内容重新插回并加删除线。
 * 输入法组字期间不改文档，组字结束后再统一补标记，避免打断中文输入。
 */

export const SKIP_META = "trackChanges$skip";

export const Insertion = Mark.create({
  name: "insertion",
  inclusive: false,
  excludes: "deletion",
  parseHTML: () => [{ tag: "ins" }],
  renderHTML: ({ HTMLAttributes }) => ["ins", mergeAttributes(HTMLAttributes, { class: "track-ins" }), 0],
});

export const Deletion = Mark.create({
  name: "deletion",
  inclusive: false,
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
  pendingIns: { from: number; to: number }[];
  pendingDel: PendingDeletion[];
}

export const trackKey = new PluginKey<TrackState>("trackChanges");

function markTypes(schema: EditorState["schema"]) {
  return { ins: schema.marks.insertion as MarkType, del: schema.marks.deletion as MarkType };
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

export const TrackChanges = Extension.create({
  name: "trackChanges",

  addProseMirrorPlugins() {
    let composing = false;
    const plugin: Plugin<TrackState> = new Plugin<TrackState>({
      key: trackKey,
      state: {
        init: () => ({ enabled: true, pendingIns: [], pendingDel: [] }),
        apply(tr, value, _old, newState) {
          const meta = tr.getMeta(trackKey) as Partial<TrackState> | undefined;
          let next: TrackState = meta ? { ...value, ...meta } : value;
          if (!tr.docChanged) return next;
          if (!composing || !next.enabled || tr.getMeta(SKIP_META)) {
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
            const map = step.getMap();
            if (step instanceof ReplaceStep && step.to > step.from) {
              const interim = pendingIns.some((r) => r.from <= step.from && step.to <= r.to);
              if (!interim) {
                const slice = toDeletedSlice(tr.docs[i].slice(step.from, step.to), ins, del.create());
                if (slice) pendingDel = [...pendingDel, { pos: step.from, slice }];
              }
            }
            pendingIns = pendingIns.map((r) => ({ from: map.map(r.from, -1), to: map.map(r.to, 1) }));
            pendingDel = pendingDel.map((d) => ({ ...d, pos: map.map(d.pos, -1) }));
            if (step instanceof ReplaceStep && step.slice.size > 0) {
              pendingIns = [...pendingIns, { from: step.from, to: step.from + step.slice.size }];
            }
          });
          next = { ...next, pendingIns, pendingDel };
          return next;
        },
      },

      appendTransaction(trs, oldState, newState) {
        const st = trackKey.getState(newState);
        if (!st?.enabled || composing) return null;
        if (!trs.some((t) => t.docChanged)) return null;
        if (trs.some((t) => t.getMeta(SKIP_META) || t.getMeta("history$") || t.getMeta("trackChanges$flush"))) return null;
        const { ins, del } = markTypes(newState.schema);
        const delMark = del.create();

        const steps: { step: ReplaceStep; doc: PMNode; index: number }[] = [];
        const maps: StepMap[] = [];
        for (const t of trs)
          t.steps.forEach((s, i) => {
            if (s instanceof ReplaceStep) steps.push({ step: s, doc: t.docs[i], index: maps.length });
            maps.push(s.getMap());
          });

        const insertions: { from: number; to: number }[] = [];
        const deletions: { pos: number; slice: Slice; backward: boolean }[] = [];
        for (const { step, doc, index } of steps) {
          const after = mapThrough(maps.slice(index + 1));
          if (step.slice.size > 0) {
            const a = after.map(step.from, 1);
            const b = after.map(step.from + step.slice.size, -1);
            if (b > a) insertions.push({ from: a, to: b });
          }
          if (step.to > step.from) {
            const slice = toDeletedSlice(doc.slice(step.from, step.to), ins, delMark);
            if (slice) {
              const sel = oldState.selection;
              const backward = index === 0 && sel.empty && sel.from === step.to && step.slice.size === 0;
              deletions.push({ pos: after.map(step.from, -1), slice, backward });
            }
          }
        }
        if (!insertions.length && !deletions.length) return null;

        const tr = newState.tr;
        for (const r of insertions) {
          tr.removeMark(r.from, r.to, del);
          tr.addMark(r.from, r.to, ins.create());
        }
        deletions.sort((a, b) => b.pos - a.pos);
        let cursor: number | null = null;
        for (const d of deletions) {
          const pos = tr.mapping.map(d.pos, -1);
          tr.replace(pos, pos, d.slice);
          if (d.backward && deletions.length === 1) cursor = pos;
        }
        if (cursor != null) tr.setSelection(TextSelection.create(tr.doc, cursor));
        return tr.setMeta(SKIP_META, true);
      },

      props: {
        handleDOMEvents: {
          compositionstart() {
            composing = true;
            return false;
          },
          compositionend(view) {
            composing = false;
            setTimeout(() => {
              if (view.isDestroyed || view.composing || composing) return;
              const st = trackKey.getState(view.state);
              if (!st || (!st.pendingIns.length && !st.pendingDel.length)) return;
              const { ins, del } = markTypes(view.state.schema);
              const tr = view.state.tr;
              const size = tr.doc.content.size;
              for (const r of st.pendingIns) {
                const from = Math.max(0, Math.min(r.from, size));
                const to = Math.max(from, Math.min(r.to, size));
                if (to > from) {
                  tr.removeMark(from, to, del);
                  tr.addMark(from, to, ins.create());
                }
              }
              for (const d of [...st.pendingDel].sort((a, b) => b.pos - a.pos)) {
                const pos = tr.mapping.map(Math.min(d.pos, size), -1);
                tr.replace(pos, pos, d.slice);
              }
              tr.setMeta(trackKey, { pendingIns: [], pendingDel: [] });
              tr.setMeta(SKIP_META, true).setMeta("trackChanges$flush", true);
              view.dispatch(tr);
            }, 40);
            return false;
          },
        },
      },
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
