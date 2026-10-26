import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const SKILL_ID = "chat-to-article";

function expand(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return resolve(path);
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 声音目录：显式参数 > CHAT_TO_ARTICLE_HOME > ~/.chat-to-article。
 * 早期拼写 ~/.chat-to-artical 只在标准目录不存在时作为兜底。
 */
export function resolveVoiceHome(explicit?: string | null): string {
  if (explicit) return expand(explicit);
  const env = process.env.CHAT_TO_ARTICLE_HOME;
  if (env) return expand(env);
  const standard = join(homedir(), ".chat-to-article");
  const legacy = join(homedir(), ".chat-to-artical");
  if (!isDir(standard) && isDir(legacy)) return legacy;
  return standard;
}

function isSkillDir(path: string): boolean {
  return existsSync(join(path, "SKILL.md")) && isDir(join(path, "lexicon"));
}

const SKILL_PARENTS = [".cursor/skills", ".agents/skills", ".claude/skills", ".codex/skills", "skills"];

/** 列出可能装有本 skill 的目录，按优先级排列；共享词表从第一个命中的目录读取。 */
export function skillDirCandidates(cwd: string, explicit?: string | null): string[] {
  const out: string[] = [];
  const push = (path: string) => {
    const abs = resolve(path);
    if (!out.includes(abs)) out.push(abs);
  };
  if (explicit) push(expand(explicit));
  if (process.env.CHAT_TO_ARTICLE_SKILL) push(expand(process.env.CHAT_TO_ARTICLE_SKILL));
  let dir = resolve(cwd);
  for (;;) {
    for (const parent of SKILL_PARENTS) push(join(dir, parent, SKILL_ID));
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  for (const parent of SKILL_PARENTS.slice(0, 4)) push(join(homedir(), parent, SKILL_ID));
  return out;
}

export function findSkillDir(cwd: string, explicit?: string | null): { dir: string | null; searched: string[] } {
  const searched = skillDirCandidates(cwd, explicit);
  return { dir: searched.find(isSkillDir) ?? null, searched };
}
