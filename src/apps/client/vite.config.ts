import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react({
      babel: {
        parserOpts: {
          plugins: ['decorators-legacy'],
        },
      },
    }),
  ],
  base: "/",
  server: {
    port: 5174
  },
  build: {
    minify: 'esbuild',
    target: 'esnext',
  },
  esbuild: {
    keepNames: true,
  }
});
