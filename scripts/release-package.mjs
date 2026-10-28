import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semanticRelease from "semantic-release";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * 两个包独立发版。packages/core 和共享的 tsconfig 会让两个包一起发。
 * core 不单独发布，它在构建时打进各自的包。
 */
export const PACKAGES = [
  {
    id: "mcp-ui",
    dir: "packages/mcp-ui",
    tagPrefix: "mcp-ui-v",
    workflow: "release-mcp-ui.yml",
    paths: ["packages/mcp-ui/", "packages/core/", "tsconfig.base.json"],
  },
  {
    id: "admin-ui",
    dir: "packages/admin-ui",
    tagPrefix: "admin-ui-v",
    workflow: "release-admin-ui.yml",
    paths: ["packages/admin-ui/", "packages/core/", "tsconfig.base.json"],
  },
];

const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const repository = process.env.GITHUB_REPOSITORY ?? "EldonChen/chat-to-article";
const repositoryUrl = `https://github.com/${repository}.git`;

function redact(text) {
  let out = String(text);
  const token = process.env.GITHUB_TOKEN;
  if (!token) return out;
  return out.replaceAll(token, "***").replaceAll(Buffer.from(`x-access-token:${token}`).toString("base64"), "***");
}

function git(args, env = process.env) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", env }).trim();
  } catch (error) {
    error.message = redact(error.message);
    throw error;
  }
}

function packageVersion(dir) {
  return JSON.parse(readFileSync(path.join(root, dir, "package.json"), "utf8")).version;
}

function tags(prefix) {
  return git(["tag", "-l", `${prefix}*`])
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** 还没有任何 tag 时，用 package.json 里的版本在 HEAD 做基线，不发布。 */
function ensureBaseline(pkg) {
  const existing = tags(pkg.tagPrefix);
  if (existing.length) return false;
  const version = packageVersion(pkg.dir);
  const tag = `${pkg.tagPrefix}${version}`;
  if (dryRun) {
    console.log(`[dry-run] ${pkg.id} 还没有 tag，会在当前提交打基线 ${tag}，不发布`);
    return true;
  }
  git(["tag", tag, "HEAD"]);
  const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env.GITHUB_TOKEN}`).toString("base64")}`;
  git(["-c", `http.extraheader=${header}`, "push", repositoryUrl, `refs/tags/${tag}`]);
  console.log(`${pkg.id} 已打基线 tag ${tag}。这个版本视为已经发布，npm 不会再发一次。`);
  return true;
}

async function releasePackage(pkg) {
  const result = await semanticRelease(
    {
      dryRun,
      ci: !dryRun,
      branches: ["main"],
      tagFormat: `${pkg.tagPrefix}\${version}`,
      repositoryUrl,
      plugins: [
        [path.join(here, "release-filter.mjs"), { paths: pkg.paths }],
        "@semantic-release/release-notes-generator",
        [path.join(here, "release-write-version.mjs"), { pkgRoot: pkg.dir }],
        [
          "@semantic-release/git",
          {
            assets: [`${pkg.dir}/package.json`],
            message: `chore(release): ${pkg.id} \${nextRelease.version} [skip ci]`,
          },
        ],
        path.join(here, "release-mark-head.mjs"),
        [
          "@semantic-release/github",
          {
            successCommentCondition: false,
            failCommentCondition: false,
            failTitle: false,
            labels: false,
            releasedLabels: false,
          },
        ],
      ],
    },
    { cwd: root },
  );
  if (!result?.nextRelease) {
    console.log(`${pkg.id} 没有需要发布的提交`);
    return null;
  }
  console.log(`${pkg.id} 下一版本是 ${result.nextRelease.gitTag}`);
  return dryRun ? null : result.nextRelease;
}

async function github(apiPath, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.github.com${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${apiPath} → ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 用 GITHUB_TOKEN 打的 tag 不会触发工作流，所以这里显式启动原来的发布工作流。 */
async function publish(pkg, release) {
  const started = Date.now();
  let dispatched = false;
  let lastError;
  for (let attempt = 0; attempt < 6 && !dispatched; attempt += 1) {
    try {
      await github(`/repos/${repository}/actions/workflows/${pkg.workflow}/dispatches`, {
        method: "POST",
        body: { ref: release.gitTag, inputs: { "dry-run": "false" } },
      });
      dispatched = true;
    } catch (error) {
      lastError = error;
      await sleep(5000);
    }
  }
  if (!dispatched) throw lastError;

  let run;
  for (let attempt = 0; attempt < 30 && !run; attempt += 1) {
    await sleep(2000);
    const list = await github(`/repos/${repository}/actions/workflows/${pkg.workflow}/runs?event=workflow_dispatch&per_page=10`);
    run = list.workflow_runs.find((item) => item.head_sha === release.gitHead && Date.parse(item.created_at) >= started - 15000);
  }
  if (!run) throw new Error(`找不到 ${pkg.workflow} 的运行。可以在 Actions 里手动重跑，ref 用 ${release.gitTag}，并取消 dry-run。`);

  const deadline = Date.now() + 20 * 60 * 1000;
  while (run.status !== "completed") {
    if (Date.now() > deadline) throw new Error(`${pkg.workflow} 超时：${run.html_url}`);
    await sleep(15000);
    run = await github(`/repos/${repository}/actions/runs/${run.id}`);
  }
  if (run.conclusion !== "success") throw new Error(`${pkg.id} 发布失败：${run.html_url}`);
  console.log(`${pkg.id} 已发布：${run.html_url}`);
}

async function main() {
  if (!process.env.GITHUB_ACTIONS && !dryRun) {
    console.error("发布只在 GitHub Actions 里执行。本地查看会发什么版本：DRY_RUN=1 node scripts/release-package.mjs");
    process.exit(1);
  }
  const pending = [];
  for (const pkg of PACKAGES) {
    if (ensureBaseline(pkg)) continue;
    const release = await releasePackage(pkg);
    if (release) pending.push(publish(pkg, release));
  }
  const results = await Promise.allSettled(pending);
  const failed = results.filter((result) => result.status === "rejected");
  for (const result of failed) console.error(redact(result.reason?.stack || result.reason));
  if (failed.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(redact(error?.stack || error));
    process.exit(1);
  });
}
