import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
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
    port: 5173
  },
  build: {
    minify: 'esbuild',
    target: 'esnext',
  },
  esbuild: {
    keepNames: true,
  }
});
