// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach } from "vitest";
import { looksLikeId, resolveProjectId } from "./project";
import { AppError } from "../core/errors";
import { clearCache } from "../core/cache";
import type { DoorayClient } from "../dooray/client";
import type { Project } from "../dooray/types";

describe("looksLikeId", () => {
  it("14자리는 raw ID 가 아니다(false)", () => {
    expect(looksLikeId("12345678901234")).toBe(false);
  });

  it("15자리는 raw ID 다(true)", () => {
    expect(looksLikeId("123456789012345")).toBe(true);
  });

  it("16자리 이상도 true", () => {
    expect(looksLikeId("12345678901234567")).toBe(true);
  });

  it("숫자가 아니면 false", () => {
    expect(looksLikeId("PROJECT")).toBe(false);
    expect(looksLikeId("12345678901234a")).toBe(false);
    expect(looksLikeId("")).toBe(false);
  });
});

const PROJECTS: Project[] = [
  { id: "p-1", code: "ALPHA" },
  { id: "p-2", code: "BETA" },
];

function fakeClient(projects = PROJECTS): DoorayClient {
  return { listProjects: async () => projects } as unknown as DoorayClient;
}

describe("resolveProjectId", () => {
  // resolveProjectId 의 이름 경로는 고정 캐시 키("projects")를 쓰므로
  // 테스트 간 캐시 오염을 막기 위해 매번 캐시를 비운다(HOME 은 임시).
  beforeEach(async () => {
    await clearCache();
  });

  it("raw id(15자리+)는 그대로 통과한다(캐시/조회 없이)", async () => {
    const raw = "123456789012345";
    // listProjects 를 부르면 안 되므로 던지는 client 를 준다.
    const throwing = {
      listProjects: async () => {
        throw new Error("호출되면 안 됨");
      },
    } as unknown as DoorayClient;
    expect(await resolveProjectId(throwing, raw)).toBe(raw);
  });

  it("프로젝트 코드로 projectId 를 찾는다", async () => {
    expect(await resolveProjectId(fakeClient(), "BETA")).toBe("p-2");
  });

  it("코드를 찾지 못하면 AppError 를 던진다", async () => {
    await expect(
      resolveProjectId(fakeClient(), "UNKNOWN"),
    ).rejects.toBeInstanceOf(AppError);
  });
});
