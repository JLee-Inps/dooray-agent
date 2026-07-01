import { defineConfig } from "tsup";

// 단일 ESM 번들로 CLI 를 낸다. 의존성은 external 로 두고 런타임 node_modules 에서
// 해석한다(published bin 관례). 진입 파일에 shebang + 저작권 배너를 붙인다.
// (shebang 은 반드시 첫 줄. @license 태그로 esbuild 의 legal-comment 로 보존.)
export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node\n/*! dooray-agent | Copyright (c) 2026 JLee-Inps | @license MIT */",
  },
});
