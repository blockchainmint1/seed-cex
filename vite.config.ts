// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { execSync } from "node:child_process";

// Build stamp shown on QA reports (src/lib/qa/build-id.ts): build time, plus the commit when git is available.
const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
})();
const buildId = `${new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-")}${commit ? `-${commit}` : ""}`;

export default defineConfig({
  vite: { define: { __SEEDS_BUILD__: JSON.stringify(buildId) } },
  // AI-assistant connections (MCP) at /mcp; server logic lives in src/lib/mcp/.
  plugins: [mcpPlugin()],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
