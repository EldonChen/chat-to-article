#!/usr/bin/env node
/**
 * 清理本机与当前工作区中的 chat-to-article 用户数据：
 * 1. 个人声音目录：$CHAT_TO_ARTICLE_HOME、~/.chat-to-article、~/.chat-to-artical、.voice/
 * 2. 工作区用户文章与导出数据：articles/、exports/，以及除内置 demo 外的文章目录
 * 3. 系统临时目录中的测试与预览残留：$TMPDIR/cta-mcp-*
 *
 * 用法：
 *   node scripts/clean-user-data.mjs [--dry-run]
 */

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const demoArticleDir = path.join(repoRoot, "skills", "chat-to-article", "examples", "demo");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || args.has("-n");

function expandHome(p) {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return path.resolve(p);
}

function isSubPath(parent, target) {
  const rel = path.relative(parent, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function isArticleDir(dir) {
  const metaPath = path.join(dir, "meta.json");
  if (!existsSync(metaPath)) return false;
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    return Boolean(meta && typeof meta.slug === "string" && "styleRevision" in meta);
  } catch {
    return false;
  }
}

const SKIP_WALK_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "packages",
  "skills",
  ".cursor",
  ".github",
]);

function findWorkspaceUserArticles(root, maxDepth = 4) {
  const found = [];
  const walk = (dir, depth) => {
    if (isSubPath(demoArticleDir, dir)) return;
    if (isArticleDir(dir)) {
      found.push(dir);
      return;
    }
    if (depth >= maxDepth) return;
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith(".") || SKIP_WALK_DIRS.has(name)) continue;
      const full = path.join(dir, name);
      try {
        if (statSync(full).isDirectory()) walk(full, depth + 1);
      } catch {
        // ignore unreadable entries
      }
    }
  };
  walk(root, 0);
  return found;
}

function findTempDirs() {
  const tmp = tmpdir();
  const out = [];
  try {
    for (const name of readdirSync(tmp)) {
      if (/^cta-(mcp-test-|mcp-views-|mcp-demo-)/.test(name)) {
        out.push(path.join(tmp, name));
      }
    }
  } catch {
    // ignore
  }
  return out;
}

function collectTargets() {
  const targets = new Map();
  const add = (targetPath, label) => {
    if (!targetPath) return;
    const resolved = expandHome(targetPath);
    if (isSubPath(demoArticleDir, resolved)) return;
    if (existsSync(resolved) && !targets.has(resolved)) {
      targets.set(resolved, label);
    }
  };

  // 1. 个人声音目录（Voice Home）
  if (process.env.CHAT_TO_ARTICLE_HOME) {
    add(process.env.CHAT_TO_ARTICLE_HOME, "环境变量声音目录 ($CHAT_TO_ARTICLE_HOME)");
  }
  add(path.join(homedir(), ".chat-to-article"), "个人声音目录 (~/.chat-to-article)");
  add(path.join(homedir(), ".chat-to-artical"), "旧版声音目录 (~/.chat-to-artical)");
  add(path.join(repoRoot, ".voice"), "工作区声音目录 (.voice/)");

  // 2. 工作区用户文章与导出数据
  add(path.join(repoRoot, "articles"), "工作区文章目录 (articles/)");
  add(path.join(process.cwd(), "articles"), "当前目录文章 (articles/)");
  add(path.join(repoRoot, "exports"), "导出的对话数据 (exports/)");
  add(path.join(process.cwd(), "exports"), "当前目录导出数据 (exports/)");

  for (const dir of findWorkspaceUserArticles(repoRoot)) {
    add(dir, "工作区用户文章目录");
  }

  // 3. 临时目录残留
  for (const dir of findTempDirs()) {
    add(dir, "临时测试/预览目录");
  }

  return targets;
}

const targets = collectTargets();

if (targets.size === 0) {
  console.log("没有发现需要清理的 chat-to-article 用户数据。");
  process.exit(0);
}

for (const [targetPath, label] of targets) {
  if (dryRun) {
    console.log(`[dry-run] 将删除 ${label}: ${targetPath}`);
  } else {
    rmSync(targetPath, { recursive: true, force: true });
    console.log(`已清理 ${label}: ${targetPath}`);
  }
}

console.log(dryRun ? `共发现 ${targets.size} 处待清理路径。` : `清理完成，共移除 ${targets.size} 处用户数据路径。`);
