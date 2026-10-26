import { diffArrays } from "diff";
import { useMemo } from "react";

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("zh-CN", { granularity: "word" }) : null;

function tokens(text: string): string[] {
  if (segmenter) return [...segmenter.segment(text)].map((s) => s.segment);
  return text.split(/(\s+|[，。！？；：、])/).filter(Boolean);
}

/** 按词对比两段文字（中文用 Intl.Segmenter 分词），只读展示。 */
export function TextDiff({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffArrays(tokens(before), tokens(after)), [before, after]);
  return (
    <div className="whitespace-pre-wrap font-serif text-sm leading-7">
      {parts.map((part, i) => {
        const text = part.value.join("");
        if (part.added) return <ins key={i} className="track-ins">{text}</ins>;
        if (part.removed) return <del key={i} className="track-del">{text}</del>;
        return <span key={i}>{text}</span>;
      })}
    </div>
  );
}

export function textChanges(before: string, after: string): { kind: "insert" | "delete" | "replace"; before: string; after: string; context: string }[] {
  const parts = diffArrays(tokens(before), tokens(after));
  const out: { kind: "insert" | "delete" | "replace"; before: string; after: string; context: string }[] = [];
  let context = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.added && !p.removed) {
      context = p.value.join("").slice(-30);
      continue;
    }
    if (p.removed && parts[i + 1]?.added) {
      out.push({ kind: "replace", before: p.value.join(""), after: parts[i + 1].value.join(""), context });
      i++;
    } else if (p.removed) out.push({ kind: "delete", before: p.value.join(""), after: "", context });
    else out.push({ kind: "insert", before: "", after: p.value.join(""), context });
  }
  return out;
}
