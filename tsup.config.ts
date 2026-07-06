import { defineConfig } from "tsup";

// ESM 번들 공통 옵션
const common = {
  format: ["esm"] as const,
  target: "node20" as const,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node\n/*! dooray-agent | Copyright (c) 2026 JLee-Inps | @license MIT */",
  },
};

// CLI: 의존성은 external 로 두고 런타임 node_modules 에서 해석한다(published bin 관례).
// MCP 엔트리: @modelcontextprotocol/sdk 의 wildcard exports("./*" → "./dist/esm/*")가
//   Node.js ESM runtime 에서 확장자 없이 해석돼 실패하므로 번들에 포함한다.
export default defineConfig([
  {
    ...common,
    entry: ["src/cli.ts"],
    clean: true,
  },
  {
    ...common,
    entry: ["src/mcp.ts"],
    noExternal: ["@modelcontextprotocol/sdk"],
  },
]);
