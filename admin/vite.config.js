import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@store-shared": path.resolve(import.meta.dirname, "../storefront/js/shared"),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [".."] },
    proxy: { "/api": "http://localhost:5000", "/img": "http://localhost:5000" },
  },
  build: { outDir: "dist", emptyOutDir: true },
  test: { environment: "node", include: ["src/**/*.test.js"] },
});
