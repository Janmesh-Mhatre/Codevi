import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Monaco's editor worker is bundled via Vite's `?worker` import (see
  // src/components/editor/CodeEditor.tsx) so the app works fully offline.
  // Forcing ES module format keeps that bundle consistent across builds.
  worker: {
    format: "es",
  },
}));
