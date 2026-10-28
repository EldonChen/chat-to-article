import { execFileSync } from "node:child_process";
import { analyzeCommits as analyze } from "@semantic-release/commit-analyzer";

/** 一个提交改过的文件。合并提交只看并入 main 的一侧。 */
export function filesInCommit(hash, cwd) {
  const out = execFileSync("git", ["log", "-1", "--first-parent", "--name-only", "--pretty=format:", hash], {
    cwd,
    encoding: "utf8",
  });
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** paths 里以 / 结尾的是目录前缀，其余是完整文件路径。 */
export function touches(files, paths) {
  return files.some((file) => paths.some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p)));
}

/** 只把改过指定路径的提交交给 commit-analyzer，并写回 context，发布说明也只用这些提交。 */
export async function analyzeCommits(pluginConfig, context) {
  const cwd = context.cwd ?? process.cwd();
  context.commits = context.commits.filter((commit) => touches(filesInCommit(commit.hash, cwd), pluginConfig.paths));
  return analyze(pluginConfig, context);
}
