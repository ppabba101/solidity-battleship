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
    // COOP + COEP unlock SharedArrayBuffer, which lets @aztec/bb.js load its
    // multi-threaded wasm build instead of silently falling back to single-
    // threaded. Without these headers, crossOriginIsolated === false and the
    // prover pins to one thread no matter what `Barretenberg.new({ threads })`
    // asks for. With them, browser proving drops from ~30–60s to ~4–8s on a
    // multi-core machine.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  worker: {
    format: "es",
  },
});
