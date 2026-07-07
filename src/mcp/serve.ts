// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toAppError } from "../core/errors";
import { createClient } from "../core/session";
import { requireConfig } from "../core/config";
import type { Credentials } from "../core/config";
import type { DoorayClient } from "../dooray/client";
import { tools, type ToolContext } from "./tools";

/**
 * package.json 버전과 동기화. ESM json import 배선이 번거로워 상수로 둔다.
 * TODO: package.json version 변경 시 동기화.
 */
const VERSION = "0.1.0";

/** lazy 클라이언트 메모. 최초 getClient() 호출 시 createClient() 를 실행한다. */
let _clientPromise: Promise<DoorayClient> | undefined;

/** lazy 설정 메모. 최초 getConfig() 호출 시 requireConfig() 를 실행한다. */
let _configPromise: Promise<Credentials> | undefined;

/**
 * 모든 핸들러에 주입되는 lazy ToolContext.
 * - getClient(): 캘린더·기존 18 툴용 DoorayClient (메모이즈).
 * - getConfig(): 메일 3 툴용 Credentials (메모이즈). DoorayClient 미구성.
 */
const ctx: ToolContext = {
  getClient(): Promise<DoorayClient> {
    if (!_clientPromise) {
      _clientPromise = createClient();
    }
    return _clientPromise;
  },
  getConfig(): Promise<Credentials> {
    if (!_configPromise) {
      _configPromise = requireConfig();
    }
    return _configPromise;
  },
};

/**
 * 툴 핸들러를 실행하고 MCP CallToolResult 형태로 감싸는 단일 매핑 지점.
 * - 성공: `{ content: [{ type:"text", text: JSON.stringify(result) }] }`
 * - 실패: `{ isError:true, content:[{ type:"text", text: JSON.stringify({ error:{ message, code } }) }] }`
 *
 * 핸들러/코어는 try/catch 하지 않고 버블하면 여기서 흡수한다.
 * runTool 은 handler 실행 전 client/config 를 eager 구성하지 않는다 — ctx 를 주입하면
 * 각 핸들러가 필요한 것만 lazy 로 당긴다.
 */
export async function runTool(
  handler: (ctx: ToolContext, args: unknown) => Promise<unknown>,
  args: unknown,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const result = await handler(ctx, args);
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
 * MCP 서버 인스턴스를 생성하고 27개 툴을 모두 등록한다.
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
