import { execFileSync } from "node:child_process";

/**
 * @semantic-release/git 在 prepare 阶段才提交版本号，而 semantic-release 打 tag 用的是
 * 更早记下的 gitHead。这个插件排在 git 之后，把 tag 指到已经写入版本号的提交。
 */
export async function prepare(_pluginConfig, context) {
  context.nextRelease.gitHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: context.cwd ?? process.cwd(),
    encoding: "utf8",
  }).trim();
}
