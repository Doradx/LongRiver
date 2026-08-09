import { defineConfig } from "vite";

export default defineConfig({
  base: "/LongRiver/",
  build: {
    outDir: "../.codex/outputs/pages",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        home: "index.html",
        station: "station/index.html",
        about: "about/index.html",
      },
    },
  },
});
