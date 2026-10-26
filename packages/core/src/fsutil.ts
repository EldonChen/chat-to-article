import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export function readJson<T>(path: string): T | null {
  const text = readText(path);
  if (text == null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function readJsonl<T>(path: string): T[] {
  const text = readText(path);
  if (!text) return [];
  const rows: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed) as T);
    } catch {
      // A corrupt line must not hide the rest of the ledger.
    }
  }
  return rows;
}

function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}

/** 与 cta.py 的 write_json 一致：两格缩进、保留中文、末尾换行。 */
export function writeJson(path: string, value: unknown): void {
  writeAtomic(path, JSON.stringify(value, null, 2) + "\n");
}

export function writeJsonl(path: string, rows: unknown[]): void {
  writeAtomic(path, rows.map((row) => JSON.stringify(row) + "\n").join(""));
}

export function appendJsonl(path: string, row: unknown): void {
  const rows = readJsonl<unknown>(path);
  rows.push(row);
  writeJsonl(path, rows);
}

export function writeText(path: string, text: string): void {
  writeAtomic(path, text);
}

export { existsSync };
