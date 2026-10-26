import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  base: "/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:4310" },
  },
});
