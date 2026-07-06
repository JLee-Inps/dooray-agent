// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { vi, describe, it, expect, beforeAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AppError, ExitCode } from "../core/errors";
import type { DoorayClient } from "../dooray/client";

// createClient 를 모킹해 serve.ts 의 getClient() 가 stub 클라이언트를 반환하게 한다.
// vi.mock 은 호이스팅되어 모든 import 보다 먼저 실행된다.
vi.mock("../core/session", () => ({
  createClient: vi.fn().mockResolvedValue({} as DoorayClient),
}));

// 모킹 설정 후 serve 를 import 한다.
const { runTool, createServer } = await import("./serve");

describe("runTool — MCP 성공/에러 매핑", () => {
  it("성공: content[0].text 가 JSON.stringify(result) 와 동일", async () => {
    const expected = { postId: "123", status: "created" };
    const handler = vi.fn().mockResolvedValue(expected);
    const result = await runTool(handler, {});
    expect(result.isError).toBeUndefined();
    const item = result.content[0];
    expect(item).toBeDefined();
    expect(item!.text).toBe(JSON.stringify(expected));
  });

  it("성공: content[0].type 이 'text'", async () => {
    const handler = vi.fn().mockResolvedValue(null);
    const result = await runTool(handler, {});
    expect(result.content[0]!.type).toBe("text");
  });

  it("AppError(Auth=2) → isError:true + code=2 보존", async () => {
    const handler = vi
      .fn()
      .mockRejectedValue(new AppError("인증 실패", ExitCode.Auth));
    const result = await runTool(handler, {});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]!.text) as {
      error: { message: string; code: number };
    };
    expect(body.error.code).toBe(ExitCode.Auth);
    expect(body.error.message).toBe("인증 실패");
  });

  it("AppError(Api=1) → isError:true + code=1 보존", async () => {
    const handler = vi
      .fn()
      .mockRejectedValue(new AppError("API 오류", ExitCode.Api));
    const result = await runTool(handler, {});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]!.text) as {
      error: { message: string; code: number };
    };
    expect(body.error.code).toBe(ExitCode.Api);
  });

  it("AppError(Usage=3) → isError:true + code=3 보존", async () => {
    const handler = vi
      .fn()
      .mockRejectedValue(new AppError("잘못된 인자", ExitCode.Usage));
    const result = await runTool(handler, {});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]!.text) as {
      error: { message: string; code: number };
    };
    expect(body.error.code).toBe(ExitCode.Usage);
  });

  it("일반 Error → isError:true + code=Api(1) 로 정규화", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("예상 못한 오류"));
    const result = await runTool(handler, {});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]!.text) as {
      error: { message: string; code: number };
    };
    expect(body.error.code).toBe(ExitCode.Api);
    expect(body.error.message).toBe("예상 못한 오류");
  });

  it("에러 content 는 { error: { message, code } } 스키마 (CLI --json 과 동일)", async () => {
    const handler = vi
      .fn()
      .mockRejectedValue(new AppError("msg", ExitCode.Config));
    const result = await runTool(handler, {});
    const body = JSON.parse(result.content[0]!.text) as unknown;
    expect(body).toMatchObject({
      error: { message: expect.any(String), code: expect.any(Number) },
    });
  });
});

describe("createServer / tools-list 스모크 (InMemoryTransport)", () => {
  let toolNames: string[] = [];

  beforeAll(async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const { tools } = await client.listTools();
    toolNames = tools.map((t) => t.name);
  });

  it("툴 수가 정확히 18개", () => {
    expect(toolNames).toHaveLength(18);
  });

  // 18개 툴 이름 전수 확인
  const expectedNames = [
    "dooray_whoami",
    "dooray_project_list",
    "dooray_member_search",
    "dooray_post_list",
    "dooray_post_get",
    "dooray_post_create",
    "dooray_post_edit",
    "dooray_post_done",
    "dooray_post_workflow",
    "dooray_post_search",
    "dooray_post_comment_list",
    "dooray_post_comment_add",
    "dooray_wiki_pages",
    "dooray_wiki_page_get",
    "dooray_wiki_page_create",
    "dooray_wiki_page_edit",
    "dooray_wiki_page_delete",
    "dooray_wiki_comment_add",
  ] as const;

  for (const name of expectedNames) {
    it(`툴 '${name}' 이 노출됨`, () => {
      expect(toolNames).toContain(name);
    });
  }
});
