import vinext from "vinext";
import { defineConfig } from "vite";
import packageJson from "./package.json";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const usePolling =
  process.env.CODEX_SANDBOX === "seatbelt" || process.env.VITE_USE_POLLING === "true";
const developmentHost = process.env.VITE_DEV_HOST;

if (Number.isNaN(Date.parse(packageJson.releaseDate))) {
  throw new Error("package.json의 releaseDate는 유효한 ISO 8601 일시여야 합니다.");
}

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: [],
  r2_buckets: [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(developmentHost ? { host: developmentHost } : {}),
      ...(usePolling ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
