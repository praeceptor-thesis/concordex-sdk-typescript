import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    // The spec corpus lives in a sibling repo (configurable for local
    // dev). CI checks out the pinned tag via the conformance workflow.
    env: {
      CONCORDEX_SPEC_PATH:
        process.env["CONCORDEX_SPEC_PATH"] ?? "../concordex-sdk-spec",
    },
  },
});
