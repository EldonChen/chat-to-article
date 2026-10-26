import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  entry: { cli: "src/server/cli.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: false,
  splitting: false,
  banner: { js: "#!/usr/bin/env node" },
  noExternal: ["@liem-opc/chat-to-article-core"],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  esbuildOptions(options) {
    // A stray .pnp.cjs in a parent directory would otherwise hijack package resolution.
    options.alias = { "@liem-opc/chat-to-article-core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)) };
  },
});
