import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
    exclude: ["workflows/**", "**/node_modules/**", "**/dist/**", "**/dist-server/**"],
  },
});
