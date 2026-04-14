import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  optimizeDeps: {
    exclude: ["@noir-lang/noir_js", "@aztec/bb.js"],
  },
  server: {
    fs: {
      // Allow importing the compiled circuit artifacts that live outside
      // the frontend workspace.
      allow: [".."],
    },
  },
  worker: {
    format: "es",
  },
});
