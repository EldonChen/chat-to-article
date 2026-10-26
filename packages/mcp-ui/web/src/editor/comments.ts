import { Mark, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { SKIP_META } from "./trackChanges.ts";

export const CommentMark = Mark.create({
  name: "comment",
  inclusive: false,
  excludes: "",
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-comment"),
        renderHTML: (attrs) => ({ "data-comment": attrs.id }),
      },
    };
  },
  parseHTML: () => [{ tag: "span[data-comment]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", { ...HTMLAttributes, class: "comment-mark" }, 0],
});

export interface CommentRange {
  id: string;
  from: number;
  to: number;
  quote: string;
}

/** 文档里每条批注覆盖的范围与原文（按出现位置排序）。 */
export function commentRanges(doc: PMNode): CommentRange[] {
  const map = new Map<string, CommentRange>();
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name !== "comment" || !mark.attrs.id) continue;
      const id = mark.attrs.id as string;
      const existing = map.get(id);
      if (existing) {
        existing.to = pos + node.nodeSize;
        existing.quote += node.text ?? "";
      } else {
        map.set(id, { id, from: pos, to: pos + node.nodeSize, quote: node.text ?? "" });
      }
    }
  });
  return [...map.values()].sort((a, b) => a.from - b.from);
}

export function addComment(editor: Editor, id: string): boolean {
  const { from, to, empty } = editor.state.selection;
  if (empty) return false;
  const tr = editor.state.tr.addMark(from, to, editor.schema.marks.comment.create({ id }));
  editor.view.dispatch(tr.setMeta(SKIP_META, true));
  return true;
}

export function removeComment(editor: Editor, id: string): void {
  const tr = editor.state.tr;
  for (const range of commentRanges(editor.state.doc).filter((r) => r.id === id)) {
    tr.removeMark(range.from, range.to, editor.schema.marks.comment.create({ id }));
  }
  editor.view.dispatch(tr.setMeta(SKIP_META, true));
}
