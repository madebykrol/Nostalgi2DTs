import { defineConfig } from "tsup";

export default defineConfig(({ watch }) => ({
  entry: ["server.ts"],
  format: ["esm"],
  sourcemap: true,
  clean: !watch,
  target: "node20",
  tsconfig: "tsconfig.json",
  noExternal: [/^@repo\//],
  external: ["ws"],
  minify: false,
}));
