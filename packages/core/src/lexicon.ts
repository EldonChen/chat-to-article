import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { readJson } from "./fsutil.ts";
import type {
  EffectiveEntry,
  LexiconSnapshot,
  LintFinding,
  PrivateEntry,
  SharedLexiconFile,
} from "./types.ts";

export interface CompiledRule {
  id: string;
  severity: string;
  pattern: RegExp;
  replacement: string;
}

const CJK = /[\u4e00-\u9fff]/;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Python 的 (?i) 等内联标志在 JS 中不可用，统一转成 flags。 */
function toJsRegex(source: string, flags: string): RegExp {
  let src = source;
  let extra = "";
  const inline = /^\(\?([a-z]+)\)/.exec(src);
  if (inline) {
    src = src.slice(inline[0].length);
    if (inline[1].includes("i")) extra += "i";
    if (inline[1].includes("s")) extra += "s";
  }
  const all = Array.from(new Set((flags + extra + "g").split(""))).join("");
  return new RegExp(src, all);
}

export function loadSharedLexicon(skillDir: string | null): SharedLexiconFile[] {
  if (!skillDir) return [];
  const dir = join(skillDir, "lexicon");
  let files: string[] = [];
  try {
    files = readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
  const out: SharedLexiconFile[] = [];
  for (const name of files) {
    const data = readJson<Partial<SharedLexiconFile>>(join(dir, name));
    if (!data) continue;
    out.push({
      file: name,
      id: data.id ?? basename(name, ".json"),
      scope: data.scope ?? "shared",
      phrases: data.phrases ?? [],
      patterns: data.patterns ?? [],
    });
  }
  return out;
}

function privateOverrides(entries: PrivateEntry[]): Set<string> {
  const allowed = new Set<string>();
  for (const entry of entries) {
    if (entry.action === "allow" && entry.entryId) allowed.add(entry.entryId);
    if (entry.action === "ban" && entry.patternId) allowed.add("promote:" + entry.patternId);
  }
  return allowed;
}

function phraseRegex(phrase: string): RegExp {
  if (CJK.test(phrase)) return new RegExp(escapeRegex(phrase), "g");
  return new RegExp("\\b" + escapeRegex(phrase) + "\\b", "gi");
}

/** cta_lib._compiled_lexicon 的移植：先应用 allow，再收 ban 与 watch。 */
export function compileLexicon(shared: SharedLexiconFile[], privateEntries: PrivateEntry[]): CompiledRule[] {
  const rules: CompiledRule[] = [];
  const allowed = privateOverrides(privateEntries);
  const addPhrase = (id: string, phrase: string | undefined, severity: string, replacement = "") => {
    if (allowed.has(id) || !phrase) return;
    rules.push({ id, severity, pattern: phraseRegex(phrase), replacement });
  };
  for (const file of shared) {
    for (const phrase of file.phrases) addPhrase(phrase.id, phrase.phrase, phrase.severity);
    for (const pattern of file.patterns) {
      const severity = allowed.has("promote:" + pattern.id) ? "ban" : pattern.severity;
      try {
        rules.push({ id: pattern.id, severity, pattern: toJsRegex(pattern.regex, "i"), replacement: "" });
      } catch {
        // An unparseable pattern is reported in the lexicon view, not thrown at lint time.
      }
    }
  }
  for (const entry of privateEntries) {
    if (entry.action === "ban" && entry.phrase) addPhrase(entry.id, entry.phrase, "ban");
    else if (entry.action === "prefer" && entry.phrase) addPhrase(entry.id, entry.phrase, "ban", entry.replacement ?? "");
  }
  return rules;
}

const TERMINATORS = "。！？\n";

export function sentenceBounds(text: string, index: number): [number, number] {
  let start = 0;
  for (let pos = 0; pos < index && pos < text.length; pos++) {
    if (TERMINATORS.includes(text[pos])) start = pos + 1;
  }
  let end = text.length;
  for (let pos = index; pos < text.length; pos++) {
    if (TERMINATORS.includes(text[pos])) {
      end = pos + 1;
      break;
    }
  }
  return [start, end];
}

export function lintBody(body: string, blockId: string, rules: CompiledRule[]): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of body.matchAll(rule.pattern)) {
      const start = match.index ?? 0;
      if (match[0].length === 0) continue;
      const [s, e] = sentenceBounds(body, start);
      findings.push({
        blockId,
        start,
        end: start + match[0].length,
        entryId: rule.id,
        severity: rule.severity,
        replacement: rule.replacement,
        sentence: body.slice(s, e).trim(),
      });
    }
  }
  return findings.sort((a, b) => a.start - b.start);
}

/** 生效视图：把共享条目和私有条目放在一起，标出被放行、被升级和替换建议。 */
export function effectiveLexicon(shared: SharedLexiconFile[], privateEntries: PrivateEntry[]): EffectiveEntry[] {
  const allowed = privateOverrides(privateEntries);
  const allowedBy = new Map<string, string>();
  const promotedBy = new Map<string, string>();
  for (const entry of privateEntries) {
    if (entry.action === "allow" && entry.entryId) allowedBy.set(entry.entryId, entry.id);
    if (entry.action === "ban" && entry.patternId) promotedBy.set(entry.patternId, entry.id);
  }
  const out: EffectiveEntry[] = [];
  for (const file of shared) {
    for (const phrase of file.phrases) {
      const isAllowed = allowed.has(phrase.id);
      out.push({
        id: phrase.id,
        kind: "phrase",
        text: phrase.phrase,
        origin: "shared",
        originFile: file.file,
        baseSeverity: phrase.severity,
        severity: isAllowed ? "allow" : phrase.severity,
        overriddenBy: allowedBy.get(phrase.id),
        allowed: isAllowed,
      });
    }
    for (const pattern of file.patterns) {
      const promoted = allowed.has("promote:" + pattern.id);
      out.push({
        id: pattern.id,
        kind: "pattern",
        text: `${pattern.name}  /${pattern.regex}/`,
        origin: "shared",
        originFile: file.file,
        baseSeverity: pattern.severity,
        severity: promoted ? "ban" : pattern.severity,
        overriddenBy: promotedBy.get(pattern.id),
        allowed: false,
      });
    }
  }
  for (const entry of privateEntries) {
    if (entry.action !== "ban" && entry.action !== "prefer") continue;
    if (!entry.phrase) continue;
    out.push({
      id: entry.id,
      kind: "phrase",
      text: entry.phrase,
      origin: "private",
      originFile: "lexicon/private.json",
      baseSeverity: "ban",
      severity: "ban",
      replacement: entry.replacement,
      allowed: false,
    });
  }
  return out;
}

export function buildLexiconSnapshot(
  skillDir: string | null,
  candidates: string[],
  privateEntries: PrivateEntry[],
): LexiconSnapshot {
  const shared = loadSharedLexicon(skillDir);
  return {
    skillDir,
    candidates,
    shared,
    private: privateEntries,
    effective: effectiveLexicon(shared, privateEntries),
  };
}
