import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/core/src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@subboost/core": path.resolve(__dirname, "packages/core/src"),
      "@subboost/server-core": path.resolve(__dirname, "packages/server-core/src"),
    },
  },
});
