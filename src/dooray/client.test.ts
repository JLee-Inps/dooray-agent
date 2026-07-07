// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, ExitCode } from "../core/errors";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

// ky 전체를 모킹해 실제 네트워크 호출 없이 #get/#post/#put/#delete 경로를 통제한다.
// #normalize 가 `error instanceof HTTPError` 로 분기하므로, client.ts 가 import 하는
// HTTPError 와 테스트가 던지는 HTTPError 가 동일 클래스여야 한다 — 모듈 전체를 대체한다.
vi.mock("ky", () => {
  class MockHTTPError extends Error {
    response: Response;
    constructor(response: Response) {
      super(`Request failed with status code ${response.status}`);
      this.name = "HTTPError";
      this.response = response;
    }
  }
  return {
    default: {
      create: vi.fn(() => ({
        get: mockGet,
        post: mockPost,
        put: mockPut,
        delete: mockDelete,
      })),
    },
    HTTPError: MockHTTPError,
  };
});

// 모킹 후 import 해야 위 mock 이 적용된 바인딩을 가져온다(house style: tools.test.ts 참고).
const { DoorayClient } = await import("./client");
const { HTTPError } = await import("ky");

const BASE = "https://api.dooray.com";

/** ky 의 `<method>(...).json()` 체이닝을 흉내내는 성공 응답. */
function ok<T>(result: T, totalCount?: number) {
  return {
    json: () =>
      Promise.resolve({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "" },
        result,
        ...(totalCount === undefined ? {} : { totalCount }),
      }),
  };
}

/** #normalize/#readMessage 경로 테스트용 HTTPError 인스턴스를 만든다. */
function httpError(status: number, resultMessage: string): Error {
  const response = {
    status,
    json: () => Promise.resolve({ header: { resultMessage } }),
  } as unknown as Response;
  const Ctor = HTTPError as unknown as new (r: Response) => Error;
  return new Ctor(response);
}

function makeWikis(startId: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `wiki-${startId + i}`,
    project: { id: "p1" },
    name: `wiki ${startId + i}`,
  }));
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockPut.mockReset();
  mockDelete.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("에러 정규화", () => {
  it("401 → AppError(Auth), 상태코드·서버 메시지 포함", async () => {
    mockGet.mockReturnValueOnce({
      json: () => Promise.reject(httpError(401, "인증이 필요합니다")),
    });
    const client = new DoorayClient("t", BASE);
    await expect(client.getMe()).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof AppError &&
        e.code === ExitCode.Auth &&
        e.message.includes("401") &&
        e.message.includes("인증이 필요합니다"),
    );
  });

  it("403 → AppError(Auth)", async () => {
    mockGet.mockReturnValueOnce({
      json: () => Promise.reject(httpError(403, "권한 없음")),
    });
    const client = new DoorayClient("t", BASE);
    await expect(client.getMe()).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.code === ExitCode.Auth,
    );
  });

  it("404 → AppError(Api), 상태코드·서버 메시지 포함", async () => {
    mockGet.mockReturnValueOnce({
      json: () => Promise.reject(httpError(404, "존재하지 않음")),
    });
    const client = new DoorayClient("t", BASE);
    await expect(client.getMe()).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof AppError &&
        e.code === ExitCode.Api &&
        e.message.includes("404") &&
        e.message.includes("존재하지 않음"),
    );
  });

  it("500 → AppError(Api)", async () => {
    mockGet.mockReturnValueOnce({
      json: () => Promise.reject(httpError(500, "서버 오류")),
    });
    const client = new DoorayClient("t", BASE);
    await expect(client.getMe()).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.code === ExitCode.Api,
    );
  });

  it("non-HTTP(네트워크) 예외 → AppError(Api), 메시지 보존", async () => {
    mockGet.mockReturnValueOnce({
      json: () => Promise.reject(new Error("network down")),
    });
    const client = new DoorayClient("t", BASE);
    await expect(client.getMe()).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof AppError &&
        e.code === ExitCode.Api &&
        e.message === "network down",
    );
  });
});

describe("페이지네이션 (#collect/#page) — 정상 경로", () => {
  it("totalCount 존재 시 여러 페이지를 모아 전체 items 를 채운다", async () => {
    mockGet.mockImplementation((_path: string, options: any) => {
      const page = options?.searchParams?.page ?? 0;
      if (page === 0) return ok(makeWikis(0, 100), 150);
      return ok(makeWikis(100, 50), 150);
    });
    const client = new DoorayClient("t", BASE);
    const result = await client.listWikis();
    expect(result).toHaveLength(150);
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenNthCalledWith(1, "wiki/v1/wikis", {
      searchParams: { page: 0, size: 100 },
    });
    expect(mockGet).toHaveBeenNthCalledWith(2, "wiki/v1/wikis", {
      searchParams: { page: 1, size: 100 },
    });
  });

  it("빈 페이지를 만나면 totalCount 미달이어도 순회를 종료한다(종료 가드)", async () => {
    mockGet.mockImplementation((_path: string, options: any) => {
      const page = options?.searchParams?.page ?? 0;
      if (page === 0) return ok(makeWikis(0, 100), 250);
      return ok([], 250);
    });
    const client = new DoorayClient("t", BASE);
    const result = await client.listWikis();
    expect(result).toHaveLength(100);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});

describe("페이지네이션 under-fetch 경계 (KNOWN LIMITATION)", () => {
  // totalCount 를 서버가 생략하면 #page 가 `res.result.length` 로 대체한다 →
  // 첫 페이지가 꽉 차 있어도 #collect 는 "다 모았다"고 착각해 조기 종료한다
  // (100개 초과가 누락되는 under-fetch). 아래는 "전체 페이지를 모아야 한다"는
  // 올바른 요구를 표현한 것으로, 현재 구현에서는 이 요구가 실패한다(의도적 xfail).
  // #collect 실제 수정은 이 Phase 범위 밖(별도 Phase 후보) — it.fails 로 green 유지,
  // 향후 #collect 를 고치면 이 테스트가 통과로 바뀌므로 `.fails` 를 제거해야 한다.
  it.fails(
    "totalCount 생략 시 전체 페이지를 모아야 하지만 현재는 under-fetch (KNOWN LIMITATION — 별도 Phase)",
    async () => {
      mockGet.mockImplementation((_path: string, options: any) => {
        const page = options?.searchParams?.page ?? 0;
        if (page === 0) return ok(makeWikis(0, 100)); // totalCount 생략
        return ok(makeWikis(100, 50));
      });
      const client = new DoorayClient("t", BASE);
      const result = await client.listWikis();
      expect(result).toHaveLength(150);
      expect(mockGet).toHaveBeenCalledTimes(2);
    },
  );
});

describe("listProjects — private+public 병합 (개인 프로젝트 누락 회귀)", () => {
  it("private/public 을 각각 조회해 병합하고, 개인 프로젝트가 결과에 포함된다", async () => {
    mockGet.mockImplementation((_path: string, options: any) => {
      const type = options?.searchParams?.type;
      if (type === "private") {
        return ok([{ id: "pj-priv", code: "@developer" }], 1);
      }
      if (type === "public") {
        return ok(
          [
            { id: "pj-team-1", code: "TEAM1" },
            { id: "pj-team-2", code: "TEAM2" },
          ],
          2,
        );
      }
      throw new Error(`unexpected type: ${String(type)}`);
    });
    const client = new DoorayClient("t", BASE);
    const result = await client.listProjects();

    expect(result).toEqual([
      { id: "pj-priv", code: "@developer" },
      { id: "pj-team-1", code: "TEAM1" },
      { id: "pj-team-2", code: "TEAM2" },
    ]);
    expect(mockGet).toHaveBeenCalledWith("project/v1/projects", {
      searchParams: { member: "me", type: "private", page: 0, size: 100 },
    });
    expect(mockGet).toHaveBeenCalledWith("project/v1/projects", {
      searchParams: { member: "me", type: "public", page: 0, size: 100 },
    });
  });

  it("같은 id 가 private/public 양쪽에 오면 dedupe 되어 1개만 남는다", async () => {
    mockGet.mockImplementation((_path: string, options: any) => {
      const type = options?.searchParams?.type;
      if (type === "private") return ok([{ id: "dup", code: "@dup" }], 1);
      return ok([{ id: "dup", code: "@dup" }], 1);
    });
    const client = new DoorayClient("t", BASE);
    const result = await client.listProjects();
    expect(result).toEqual([{ id: "dup", code: "@dup" }]);
  });
});

describe("decodeApiMessage 적용 — API 에러 메시지 URL 디코드", () => {
  it("#readMessage: URL 인코딩된 resultMessage 를 디코드해 노출한다", async () => {
    const encoded = encodeURIComponent("존재하지 않는 페이지입니다").replace(
      /%20/g,
      "+",
    );
    mockGet.mockReturnValueOnce({
      json: () => Promise.reject(httpError(404, encoded)),
    });
    const client = new DoorayClient("t", BASE);
    await expect(client.getMe()).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof AppError &&
        e.message.includes("존재하지 않는 페이지입니다"),
    );
  });

  it("#readMessage: malformed(%zz) 는 fail-safe 로 원문 그대로 노출한다", async () => {
    mockGet.mockReturnValueOnce({
      json: () => Promise.reject(httpError(400, "bad%zzmessage")),
    });
    const client = new DoorayClient("t", BASE);
    await expect(client.getMe()).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof AppError && e.message.includes("bad%zzmessage"),
    );
  });

  it("#readMessage: 평문 한글 메시지는 디코드해도 원문과 동일(무해, 회귀 확인)", async () => {
    mockGet.mockReturnValueOnce({
      json: () => Promise.reject(httpError(401, "인증이 필요합니다")),
    });
    const client = new DoorayClient("t", BASE);
    await expect(client.getMe()).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof AppError && e.message.includes("인증이 필요합니다"),
    );
  });
});

describe("307 다운로드 redirect", () => {
  it("same-scope 리다이렉트 시 Authorization 재부착 + 파일명 파싱", async () => {
    const redirect = new Response(null, {
      status: 307,
      headers: { Location: "https://files.dooray.com/real-file" },
    });
    const final = new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-disposition": 'attachment; filename="report.md"' },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirect)
      .mockResolvedValueOnce(final);
    vi.stubGlobal("fetch", fetchMock);

    const client = new DoorayClient("secret-token", BASE);
    const result = await client.downloadPostFile("p1", "post1", "file1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${BASE}/project/v1/projects/p1/posts/post1/files/file1?media=raw`,
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
        headers: { Authorization: "dooray-api secret-token" },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://files.dooray.com/real-file",
      expect.objectContaining({
        headers: { Authorization: "dooray-api secret-token" },
      }),
    );
    expect(result.fileName).toBe("report.md");
    expect(Buffer.compare(result.buffer, Buffer.from([1, 2, 3]))).toBe(0);
  });

  it("외부 host 리다이렉트 시 Authorization 헤더를 재부착하지 않는다 (토큰 유출 방지 — 핵심 요구사항)", async () => {
    const redirect = new Response(null, {
      status: 307,
      headers: { Location: "https://evil.com/steal" },
    });
    const final = new Response(new Uint8Array([9]), { status: 200 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirect)
      .mockResolvedValueOnce(final);
    vi.stubGlobal("fetch", fetchMock);

    const client = new DoorayClient("secret-token", BASE);
    await client.downloadPostFile("p1", "post1", "file1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://evil.com/steal",
      expect.objectContaining({ headers: undefined }),
    );
  });

  it("non-ok 401 → AppError(Auth)", async () => {
    const errorResponse = new Response(
      JSON.stringify({ header: { resultMessage: "인증 실패" } }),
      { status: 401 },
    );
    const fetchMock = vi.fn().mockResolvedValueOnce(errorResponse);
    vi.stubGlobal("fetch", fetchMock);
    const client = new DoorayClient("t", BASE);
    await expect(client.downloadPostFile("p", "post", "f")).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.code === ExitCode.Auth,
    );
  });

  it("non-ok 404 → AppError(Api)", async () => {
    const errorResponse = new Response(
      JSON.stringify({ header: { resultMessage: "없음" } }),
      { status: 404 },
    );
    const fetchMock = vi.fn().mockResolvedValueOnce(errorResponse);
    vi.stubGlobal("fetch", fetchMock);
    const client = new DoorayClient("t", BASE);
    await expect(client.downloadPostFile("p", "post", "f")).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.code === ExitCode.Api,
    );
  });

  it("#ensureOk: non-ok 응답의 URL 인코딩된 resultMessage 도 디코드해 노출한다", async () => {
    const encoded = encodeURIComponent("파일을 찾을 수 없습니다").replace(
      /%20/g,
      "+",
    );
    const errorResponse = new Response(
      JSON.stringify({ header: { resultMessage: encoded } }),
      { status: 404 },
    );
    const fetchMock = vi.fn().mockResolvedValueOnce(errorResponse);
    vi.stubGlobal("fetch", fetchMock);
    const client = new DoorayClient("t", BASE);
    await expect(client.downloadPostFile("p", "post", "f")).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof AppError && e.message.includes("파일을 찾을 수 없습니다"),
    );
  });
});
