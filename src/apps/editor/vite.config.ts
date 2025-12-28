import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

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
  build: {
    minify: 'esbuild',
    target: 'esnext',
  },
  esbuild: {
    keepNames: true,
  }
});
