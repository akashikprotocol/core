import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/postgres.ts", "src/file.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  target: "es2022",
  // pg is an optional peer dependency, never bundled into either entry point.
  external: ["pg"],
});
