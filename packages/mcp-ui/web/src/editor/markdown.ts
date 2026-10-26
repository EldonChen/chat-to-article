import MarkdownIt from "markdown-it";
import type { Node as PMNode } from "@tiptap/pm/model";
import { MarkdownSerializer, defaultMarkdownSerializer } from "prosemirror-markdown";

const md = new MarkdownIt({ html: false, linkify: false, breaks: false });

export function markdownToHtml(text: string): string {
  return md.render(text);
}

const base = defaultMarkdownSerializer.nodes;

/** prosemirror-markdown 的默认序列化器按 TipTap 的节点与标记名改写。 */
const serializer = new MarkdownSerializer(
  {
    doc: (state, node) => state.renderContent(node),
    text: base.text,
    paragraph: base.paragraph,
    heading: base.heading,
    blockquote: base.blockquote,
    horizontalRule: base.horizontal_rule,
    hardBreak: base.hard_break,
    image: base.image,
    codeBlock(state, node) {
      const fence = node.textContent.includes("```") ? "````" : "```";
      state.write(fence + (node.attrs.language || "") + "\n");
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write(fence);
      state.closeBlock(node);
    },
    bulletList(state, node) {
      state.renderList(node, "  ", () => "- ");
    },
    orderedList(state, node) {
      const start = (node.attrs.start as number) || 1;
      const maxW = String(start + node.childCount - 1).length;
      const space = state.repeat(" ", maxW + 2);
      state.renderList(node, space, (i) => {
        const n = String(start + i);
        return state.repeat(" ", maxW - n.length) + n + ". ";
      });
    },
    listItem: base.list_item,
  },
  {
    italic: { open: "*", close: "*", mixable: true, expelEnclosingWhitespace: true },
    bold: { open: "**", close: "**", mixable: true, expelEnclosingWhitespace: true },
    strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
    code: defaultMarkdownSerializer.marks.code,
    link: defaultMarkdownSerializer.marks.link,
  },
);

export function docToMarkdown(doc: PMNode): string {
  return serializer.serialize(doc, { tightLists: true }).trim() + "\n";
}

/** 把块正文规整成「编辑器能无损表达」的 Markdown，用于判断用户是否真的改过。 */
export function normalizeMarkdown(text: string, toDoc: (html: string) => PMNode): string {
  return docToMarkdown(toDoc(markdownToHtml(text)));
}
