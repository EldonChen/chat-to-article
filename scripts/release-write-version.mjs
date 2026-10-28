import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** 只替换 version 字段，避免 npm version 在 pnpm workspace 里改出 lockfile。 */
export function replaceVersion(text, version) {
  if (!/^\d+\.\d+\.\d+/.test(version)) throw new Error(`版本号不合法：${version}`);
  const next = text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
  if (next === text) throw new Error("package.json 里没有 version 字段");
  return next;
}

export async function prepare(pluginConfig, context) {
  const file = path.resolve(context.cwd ?? process.cwd(), pluginConfig.pkgRoot, "package.json");
  writeFileSync(file, replaceVersion(readFileSync(file, "utf8"), context.nextRelease.version));
}
