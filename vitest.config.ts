import { defineConfig } from "vitest/config";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": root,
      // `server-only` throws unless the `react-server` export condition is set;
      // in unit tests we just want it to no-op so server modules can be imported.
      "server-only": join(root, "node_modules/server-only/empty.js"),
    },
  },
});
