import { defineConfig } from "vitest/config";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["client/src/**/*.ts", "shared/**/*.ts"],
      exclude: ["**/*.test.ts", "**/__tests__/**"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
