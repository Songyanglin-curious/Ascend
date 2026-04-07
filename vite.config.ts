import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const PAGE_API_PORT = Number(process.env.ASCEND_WEB_API_PORT ?? "4318");

export default defineConfig({
  root: resolve(__dirname, "web"),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${PAGE_API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "dist-web"),
    emptyOutDir: true,
  },
});
