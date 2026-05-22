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
      // Pin @nostalgi2d/* imports to the single source copy to avoid duplicate module instances
      "@nostalgi2d/engine": path.resolve(__dirname, "../../packages/engine"),
      "@nostalgi2d-projects/flappy-rectangle": path.resolve(__dirname, "../../projects/flappy-rectangle"),
      "@nostalgi2d-projects/grasslands-demo": path.resolve(__dirname, "../../projects/grasslands-demo"),
      "@nostalgi2d/tiler": path.resolve(__dirname, "../../packages/tiler"),
      "@nostalgi2d/ui": path.resolve(__dirname, "../../packages/ui"),
      "@nostalgi2d/client": path.resolve(__dirname, "../../packages/client"),
      "@nostalgi2d/basicrenderer": path.resolve(__dirname, "../../packages/basicrenderer"),
      "@nostalgi2d/planckphysics": path.resolve(__dirname, "../../packages/planckphysics"),
      "@nostalgi2d/editor-plugins": path.resolve(__dirname, "../../packages/editor-plugins"),
    },
    dedupe: [
      "@nostalgi2d/engine",
      "@nostalgi2d-projects/flappy-rectangle",
      "@nostalgi2d-projects/grasslands-demo",
      "@nostalgi2d/tiler",
      "@nostalgi2d/ui",
      "@nostalgi2d/client",
      "@nostalgi2d/basicrenderer",
      "@nostalgi2d/planckphysics",
      "@nostalgi2d/editor-plugins",
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
