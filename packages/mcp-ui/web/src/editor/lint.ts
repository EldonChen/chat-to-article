import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { LexiconRuleWire } from "../../../src/shared/actions.ts";

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

export const lintKey = new PluginKey<DecorationSet>("lexiconLint");

export const LexiconLint = Extension.create<{ rules: CompiledWireRule[] }>({
  name: "lexiconLint",
  addOptions: () => ({ rules: [] }),
  addProseMirrorPlugins() {
    const rules = this.options.rules;
    const build = (doc: PMNode) =>
      DecorationSet.create(
        doc,
        lintDoc(doc, rules).map((hit) =>
          Decoration.inline(hit.from, hit.to, {
            class: hit.severity === "ban" ? "lint-ban" : "lint-watch",
            title: `${hit.severity === "ban" ? "禁用" : "观察"}：${hit.id}${hit.replacement ? ` → 建议「${hit.replacement}」` : ""}`,
          }),
        ),
      );
    return [
      new Plugin({
        key: lintKey,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
        },
        props: { decorations: (state) => lintKey.getState(state) },
      }),
    ];
  },
});
