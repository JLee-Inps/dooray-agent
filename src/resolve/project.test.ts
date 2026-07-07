// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach } from "vitest";
import {
  looksLikeId,
  resolveProjectId,
  findRootPageId,
  resolveParentPageId,
} from "./project";
import { AppError } from "../core/errors";
import { clearCache } from "../core/cache";
import type { DoorayClient } from "../dooray/client";
import type { Project, WikiPage } from "../dooray/types";

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

describe("findRootPageId (순수 함수)", () => {
  it("root===true 인 페이지의 id 를 반환한다", () => {
    const pages: WikiPage[] = [
      { id: "child", subject: "자식" },
      { id: "root-id", subject: "루트", root: true },
    ];
    expect(findRootPageId(pages)).toBe("root-id");
  });

  it("여러 페이지 중 root===true 하나만 선택한다", () => {
    const pages: WikiPage[] = [
      { id: "a", subject: "A" },
      { id: "b", subject: "B", root: true },
      { id: "c", subject: "C" },
    ];
    expect(findRootPageId(pages)).toBe("b");
  });

  it("root 페이지가 없으면 AppError 를 던진다", () => {
    const pages: WikiPage[] = [{ id: "child", subject: "자식" }];
    expect(() => findRootPageId(pages)).toThrow(AppError);
  });
});

describe("resolveParentPageId", () => {
  it("parent 지정 시 조회 없이 그대로 반환한다(단축 경로)", async () => {
    const throwing = {
      listWikiPages: async () => {
        throw new Error("호출되면 안 됨");
      },
    } as unknown as DoorayClient;
    expect(await resolveParentPageId(throwing, "wiki-1", "given-parent")).toBe(
      "given-parent",
    );
  });

  it("parent 미지정 시 listWikiPages 로 루트 페이지를 찾아 반환한다", async () => {
    const client = {
      listWikiPages: async () => ({
        items: [
          { id: "child", subject: "자식" },
          { id: "root-id", subject: "루트", root: true },
        ] as WikiPage[],
        totalCount: 2,
      }),
    } as unknown as DoorayClient;
    expect(await resolveParentPageId(client, "wiki-1", undefined)).toBe(
      "root-id",
    );
  });

  it("parent 미지정 + 루트 미발견 시 AppError 를 던진다", async () => {
    const client = {
      listWikiPages: async () => ({
        items: [{ id: "child", subject: "자식" }] as WikiPage[],
        totalCount: 1,
      }),
    } as unknown as DoorayClient;
    await expect(
      resolveParentPageId(client, "wiki-1", undefined),
    ).rejects.toBeInstanceOf(AppError);
  });
});
