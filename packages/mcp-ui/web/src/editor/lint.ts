import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { LexiconRuleWire } from "../../../src/shared/actions.ts";
import { isCompositionTr } from "./trackChanges.ts";

export interface LintHit {
  id: string;
  severity: string;
  replacement: string;
  from: number;
  to: number;
  text: string;
}

export interface CompiledWireRule extends LexiconRuleWire {
  regex: RegExp;
}

export function compileRules(rules: LexiconRuleWire[]): CompiledWireRule[] {
  return rules.flatMap((rule) => {
    try {
      return [{ ...rule, regex: new RegExp(rule.source, rule.flags.includes("g") ? rule.flags : rule.flags + "g") }];
    } catch {
      return [];
    }
  });
}

/** 按段扫描「接受修订后」的文字（跳过删除线），把命中位置映射回文档坐标。 */
export function lintDoc(doc: PMNode, rules: CompiledWireRule[]): LintHit[] {
  const hits: LintHit[] = [];
  if (!rules.length) return hits;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    let text = "";
    const positions: number[] = [];
    node.forEach((child, offset) => {
      if (!child.isText || child.marks.some((m) => m.type.name === "deletion")) return;
      const start = pos + 1 + offset;
      for (let i = 0; i < (child.text ?? "").length; i++) positions.push(start + i);
      text += child.text ?? "";
    });
    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      for (const match of text.matchAll(rule.regex)) {
        if (!match[0].length) continue;
        const s = match.index ?? 0;
        const e = s + match[0].length - 1;
        hits.push({ id: rule.id, severity: rule.severity, replacement: rule.replacement, from: positions[s], to: positions[e] + 1, text: match[0] });
      }
    }
    return false;
  });
  return hits.sort((a, b) => a.from - b.from);
}

export const lintKey = new PluginKey("lexiconLint");

const HIGHLIGHT = { ban: "lint-ban", watch: "lint-watch" } as const;
const supportsHighlights = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

function domRange(view: EditorView, from: number, to: number): Range | null {
  try {
    const a = view.domAtPos(from);
    const b = view.domAtPos(to);
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    return range;
  } catch {
    return null;
  }
}

/**
 * 用 CSS Custom Highlight API 画词表标记：不改编辑器 DOM，组字时不会打断输入法。
 * 组字期间不重算（Range 会随文字编辑自动移动），组字结束后再检查一遍。
 */
function highlightPlugin(rules: CompiledWireRule[]) {
  return new Plugin({
    key: lintKey,
    view(view) {
      const sets = { ban: new Highlight(), watch: new Highlight() };
      CSS.highlights.set(HIGHLIGHT.ban, sets.ban);
      CSS.highlights.set(HIGHLIGHT.watch, sets.watch);
      let painted: PMNode | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const paint = () => {
        if (view.isDestroyed || view.composing) return;
        painted = view.state.doc;
        sets.ban.clear();
        sets.watch.clear();
        for (const hit of lintDoc(view.state.doc, rules)) {
          const range = domRange(view, hit.from, hit.to);
          if (range) (hit.severity === "ban" ? sets.ban : sets.watch).add(range);
        }
      };
      const onCompositionEnd = () => {
        clearTimeout(timer);
        timer = setTimeout(paint, 30);
      };
      view.dom.addEventListener("compositionend", onCompositionEnd);
      paint();
      return {
        update: (v) => {
          if (v.state.doc !== painted) paint();
        },
        destroy: () => {
          clearTimeout(timer);
          view.dom.removeEventListener("compositionend", onCompositionEnd);
          CSS.highlights.delete(HIGHLIGHT.ban);
          CSS.highlights.delete(HIGHLIGHT.watch);
        },
      };
    },
  });
}

/** 不支持 Highlight API 的浏览器：退回行内装饰。组字期间只映射位置，组字结束后重建。 */
function decorationPlugin(rules: CompiledWireRule[]) {
  const build = (doc: PMNode) =>
    DecorationSet.create(
      doc,
      lintDoc(doc, rules).map((hit) =>
        Decoration.inline(hit.from, hit.to, {
          class: HIGHLIGHT[hit.severity === "ban" ? "ban" : "watch"],
          title: `${hit.severity === "ban" ? "禁用" : "观察"}：${hit.id}${hit.replacement ? ` → 建议「${hit.replacement}」` : ""}`,
        }),
      ),
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Plugin<DecorationSet>({
    key: lintKey,
    state: {
      init: (_, state) => build(state.doc),
      apply: (tr, old) =>
        tr.getMeta(lintKey) === "rebuild" ? build(tr.doc) : !tr.docChanged ? old : isCompositionTr(tr) ? old.map(tr.mapping, tr.doc) : build(tr.doc),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
      handleDOMEvents: {
        compositionend(view) {
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (!view.isDestroyed && !view.composing) view.dispatch(view.state.tr.setMeta(lintKey, "rebuild"));
          }, 30);
          return false;
        },
      },
    },
    view: () => ({ destroy: () => clearTimeout(timer) }),
  });
}

export const LexiconLint = Extension.create<{ rules: CompiledWireRule[] }>({
  name: "lexiconLint",
  addOptions: () => ({ rules: [] }),
  addProseMirrorPlugins() {
    const rules = this.options.rules;
    if (!rules.length) return [];
    return [supportsHighlights() ? highlightPlugin(rules) : decorationPlugin(rules)];
  },
});
