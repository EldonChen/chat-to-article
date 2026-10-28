import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { analyzeCommits, filesInCommit, touches } from "./release-filter.mjs";
import { replaceVersion } from "./release-write-version.mjs";

test("path prefixes do not match sibling directories", () => {
  const files = ["packages/mcp-ui/src/a.ts", "packages/mcp-ui-extra/a.ts", "tsconfig.base.json"];
  assert.equal(touches(files, ["packages/mcp-ui/"]), true);
  assert.equal(touches(["packages/mcp-ui-extra/a.ts"], ["packages/mcp-ui/"]), false);
  assert.equal(touches(files, ["tsconfig.base.json"]), true);
  assert.equal(touches(["README.md"], ["packages/core/", "tsconfig.base.json"]), false);
});

test("replaceVersion changes only the version field", () => {
  const original = '{\n  "name": "demo",\n  "version": "0.1.0",\n  "description": "version: \\"keep\\""\n}\n';
  const next = replaceVersion(original, "0.2.0");
  assert.equal(next, original.replace("0.1.0", "0.2.0"));
  assert.throws(() => replaceVersion("{}", "0.2.0"), /version/);
  assert.throws(() => replaceVersion(original, "next"), /不合法/);
});

test("only commits touching the package decide the release type", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cta-release-"));
  const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "test"]);
  mkdirSync(path.join(dir, "packages/mcp-ui"), { recursive: true });
  mkdirSync(path.join(dir, "packages/core"), { recursive: true });
  writeFileSync(path.join(dir, "README.md"), "readme\n");
  writeFileSync(path.join(dir, "packages/mcp-ui/a.txt"), "a\n");
  git(["add", "."]);
  git(["commit", "-m", "chore: init"]);

  writeFileSync(path.join(dir, "README.md"), "readme 2\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "fix: readme only"]);
  const readme = git(["rev-parse", "HEAD"]).trim();

  writeFileSync(path.join(dir, "packages/mcp-ui/a.txt"), "b\n");
  git(["add", "."]);
  git(["commit", "-m", "feat: add a voice picker"]);
  const feature = git(["rev-parse", "HEAD"]).trim();

  writeFileSync(path.join(dir, "packages/core/b.txt"), "c\n");
  git(["add", "."]);
  git(["commit", "-m", "fix: shared reader"]);
  const fix = git(["rev-parse", "HEAD"]).trim();

  const context = (hashes) => ({
    cwd: dir,
    commits: hashes.map((hash) => ({ hash, message: git(["log", "-1", "--format=%B", hash]) })),
    logger: { log() {} },
  });
  const paths = ["packages/mcp-ui/", "packages/core/"];

  assert.equal(await analyzeCommits({ paths }, context([readme])), null);
  assert.equal(await analyzeCommits({ paths }, context([readme, feature])), "minor");
  assert.equal(await analyzeCommits({ paths }, context([fix])), "patch");
  assert.deepEqual(filesInCommit(feature, dir), ["packages/mcp-ui/a.txt"]);
});
