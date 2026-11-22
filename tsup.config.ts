import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", notify: "src/notify/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node26",
  platform: "node",
  external: ["ajv", "ajv-formats"],
});
