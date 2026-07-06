// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toAppError } from "../core/errors";
import { createClient } from "../core/session";
import type { DoorayClient } from "../dooray/client";
import { tools } from "./tools";

/**
 * package.json 버전과 동기화. ESM json import 배선이 번거로워 상수로 둔다.
 * TODO: package.json version 변경 시 동기화.
 */
const VERSION = "0.1.0";

/** lazy 클라이언트 메모. 최초 도구 호출 시 createClient() 를 실행한다. */
let _clientPromise: Promise<DoorayClient> | undefined;

async function getClient(): Promise<DoorayClient> {
  if (!_clientPromise) {
    _clientPromise = createClient();
  }
  return _clientPromise;
}

/**
 * 툴 핸들러를 실행하고 MCP CallToolResult 형태로 감싸는 단일 매핑 지점.
 * - 성공: `{ content: [{ type:"text", text: JSON.stringify(result) }] }`
 * - 실패: `{ isError:true, content:[{ type:"text", text: JSON.stringify({ error:{ message, code } }) }] }`
 *
 * 핸들러/코어는 try/catch 하지 않고 버블하면 여기서 흡수한다.
 */
export async function runTool(
  handler: (client: DoorayClient, args: unknown) => Promise<unknown>,
  args: unknown,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const client = await getClient();
    const result = await handler(client, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  } catch (err: unknown) {
    const appErr = toAppError(err);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: { message: appErr.message, code: appErr.code },
          }),
        },
      ],
    };
  }
}

/**
 * MCP 서버 인스턴스를 생성하고 18개 툴을 모두 등록한다.
 * transport 연결은 엔트리(`src/mcp.ts`)가 담당한다.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "dooray-agent-mcp", version: VERSION });
  for (const { name, description, inputSchema, handler } of tools) {
    server.registerTool(
      name,
      { description, inputSchema },
      (args: unknown) => runTool(handler, args),
    );
  }
  return server;
}
