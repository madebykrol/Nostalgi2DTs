import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        babelrc: false,
        configFile: false,
        plugins: [
          ["@babel/plugin-proposal-decorators", { legacy: true }],
          ["@babel/plugin-proposal-class-properties", { loose: true }],
          "babel-plugin-transform-typescript-metadata",
        ],
      },
    }),
  ],
  base: "/",
  server: {
    port: 5173
  },
  optimizeDeps: {
    include: [],
    exclude: [],
    esbuildOptions: {},
    force: false,
    disabled: false,
    // Deduplicate shared packages to avoid multiple instances/bundles
    // Vite's DepOptimizationOptions in this setup doesn't expose a typed 'dedupe' key,
    // but Vite does respect the top-level 'resolve.dedupe'. Use that instead below.
  },
  resolve: {
    alias: {
      // Pin @repo/* imports to the single source copy to avoid duplicate module instances
      "@repo/engine": path.resolve(__dirname, "../../packages/engine"),
      "@repo/example": path.resolve(__dirname, "../../packages/example"),
      "@repo/tiler": path.resolve(__dirname, "../../packages/tiler"),
      "@repo/ui": path.resolve(__dirname, "../../packages/ui"),
      "@repo/client": path.resolve(__dirname, "../../packages/client"),
      "@repo/basicrenderer": path.resolve(__dirname, "../../packages/basicrenderer"),
      "@repo/planckphysics": path.resolve(__dirname, "../../packages/planckphysics"),
      "@repo/editor-plugins": path.resolve(__dirname, "../../packages/editor-plugins"),
    },
    dedupe: [
      "@repo/engine",
      "@repo/example",
      "@repo/tiler",
      "@repo/ui",
      "@repo/client",
      "@repo/basicrenderer",
      "@repo/planckphysics",
      "@repo/editor-plugins",
      "@xmldom/xmldom"
    ],
  },
  build: {
    minify: 'esbuild',
    target: 'esnext',
  },
  esbuild: {
    keepNames: true,
  }
});
