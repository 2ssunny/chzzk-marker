import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/test/**/*.test.ts", "extension/test/**/*.test.ts", "premiere-plugin/test/**/*.test.ts"],
    environment: "node",
  },
});
