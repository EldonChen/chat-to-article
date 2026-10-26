import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// MCP Apps 的视图在沙箱 iframe 里渲染，默认 CSP 不允许加载外部脚本与样式，
// 所以每个视图打成一个自包含的 HTML。一次构建只能有一个入口：用 --mode review|figure 选择。
export default defineConfig(({ mode }) => {
  const view = mode === "figure" ? "figure" : "review";
  return {
    root: "web",
    plugins: [react(), tailwindcss(), viteSingleFile()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    build: {
      outDir: "../dist/views",
      emptyOutDir: false,
      chunkSizeWarningLimit: 8000,
      rollupOptions: { input: fileURLToPath(new URL(`./web/${view}.html`, import.meta.url)) },
    },
  };
});
