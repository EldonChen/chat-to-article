import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { readJson, readJsonl, readText } from "./fsutil.ts";
import type { Candidate, PrivateEntry, Profile, VoiceSnapshot } from "./types.ts";

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names.sort()) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    try {
      if (statSync(full).isDirectory()) out.push(...walkFiles(full));
      else out.push(full);
    } catch {
      // unreadable entries are skipped
    }
  }
  return out;
}

export function loadVoice(home: string): VoiceSnapshot {
  const errors: string[] = [];
  const exists = existsSync(home);
  const profilePath = join(home, "profile.json");
  const profile = readJson<Profile>(profilePath);
  if (exists && !profile && existsSync(profilePath)) errors.push("profile.json 无法解析");

  const history: VoiceSnapshot["history"] = [];
  for (const file of walkFiles(join(home, "history"))) {
    const match = /r(\d+)\.json$/.exec(file);
    if (!match) continue;
    const snapshot = readJson<Profile>(file);
    if (!snapshot) {
      errors.push(`${relative(home, file)} 无法解析`);
      continue;
    }
    history.push({ revision: Number(match[1]), file: relative(home, file), profile: snapshot });
  }
  history.sort((a, b) => a.revision - b.revision);

  const privateLexicon = readJson<{ entries: PrivateEntry[] }>(join(home, "lexicon", "private.json"));
  const refs = new Set(profile?.exemplarRefs ?? []);
  const exemplars = walkFiles(join(home, "exemplars")).map((file) => {
    const ref = relative(home, file);
    return { ref, content: readText(file) ?? "", referenced: refs.has(ref) };
  });
  for (const ref of refs) {
    if (!exemplars.some((item) => item.ref === ref)) {
      errors.push(`profile.json 引用的范文 ${ref} 不存在`);
    }
  }

  return {
    home,
    exists,
    profile,
    history,
    privateLexicon: privateLexicon ? { entries: privateLexicon.entries ?? [] } : null,
    exemplars,
    candidates: readJsonl<Candidate>(join(home, "candidates.jsonl")),
    errors,
  };
}
