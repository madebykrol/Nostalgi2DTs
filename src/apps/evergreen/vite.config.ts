import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const resourcesContentDir = resolve(__dirname, "../projects/content");
const skipStaticCopy = process.env.NOSTALGI_SKIP_STATIC_COPY === "1";

export default defineConfig({
  plugins: [
    react({
      babel: {
        parserOpts: {
          plugins: ['decorators-legacy'],
        },
      },
    }),
    !skipStaticCopy
      ? viteStaticCopy({
          targets: [
            {
              src: `${resourcesContentDir}/**/*`,
              dest: "content",
            },
          ],
          watch: {
            reloadPageOnChange: true,
          },
        })
      : undefined,
  ].filter(Boolean),
  base: "/",
  server: {
    port: 5176
  },
  build: {
    minify: 'esbuild',
    target: 'esnext',
  },
  esbuild: {
    keepNames: true,
  }
});
