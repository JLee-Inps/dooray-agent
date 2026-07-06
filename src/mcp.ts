// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT
// shebang 은 tsup banner 가 주입한다 — 소스에 두지 않음.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./mcp/serve";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * 최상위 에러 핸들러. tool 실행 오류는 runTool 이 흡수하므로 여기까지 오지 않는다.
 * 연결/치명 오류(설정 파싱 실패 등)만 여기서 잡아 비정상 종료한다.
 * stdout 오염 금지 — stderr 에만 출력한다.
 */
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`dooray-agent-mcp: fatal error: ${message}\n`);
  process.exit(1);
});
