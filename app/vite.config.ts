import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    fs: {
      // Allow importing JSON ABIs from sibling contracts folder
      allow: [
        "..",
        path.resolve(__dirname, "../contracts"),
        path.resolve(__dirname, "../contracts/artifacts"),
      ],
    },
  },
  plugins: [
    react(), 
    mode === "development" && componentTagger(),
    nodePolyfills({
      exclude: ["fs"],
      protocolImports: true,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      buffer: "vite-plugin-node-polyfills/shims/buffer",
      global: "vite-plugin-node-polyfills/shims/global",
      process: "vite-plugin-node-polyfills/shims/process",
    },
  },
  envPrefix: ["VITE_"],
}));