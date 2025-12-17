import react from "@vitejs/plugin-react";
import tailwindcss from '@tailwindcss/vite'
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
  base: "/Nostalgi2DTs/projectsite/",
  server: {
    port: 5175
  }
});
