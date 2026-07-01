// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { resolveMemberId } from "./member";
import { AppError } from "../core/errors";
import type { DoorayClient } from "../dooray/client";
import type { Member, MemberSearchHit } from "../dooray/types";

const MEMBERS: Member[] = [
  { organizationMemberId: "om-1", name: "김철수" },
  { organizationMemberId: "om-2", name: "이영희" },
];

// resolveMemberId 는 cached 를 거치므로(이름 매칭 경로) 캐시 miss 를 보장하려고
// 매 테스트마다 고유 projectId 를 쓴다(test-setup 이 HOME 을 임시로 돌려 실제
// 홈은 무해). searchMembers/listProjectMembers 만 노출하는 가짜 client.
function fakeClient(hits: MemberSearchHit[] = [], members = MEMBERS) {
  return {
    searchMembers: async () => hits,
    listProjectMembers: async () => members,
  } as unknown as DoorayClient;
}

let counter = 0;
function uniqueProjectId(): string {
  counter += 1;
  return `member-test-${Date.now()}-${counter}`;
}

describe("resolveMemberId", () => {
  it("raw id(15자리+)는 그대로 통과한다", async () => {
    const raw = "123456789012345";
    const id = await resolveMemberId(fakeClient(), uniqueProjectId(), raw);
    expect(id).toBe(raw);
  });

  it("이메일이면 searchMembers 결과의 첫 id 를 돌려준다", async () => {
    const hits: MemberSearchHit[] = [{ id: "hit-1", name: "김철수" }];
    const id = await resolveMemberId(
      fakeClient(hits),
      uniqueProjectId(),
      "kim@example.com",
    );
    expect(id).toBe("hit-1");
  });

  it("이메일 검색 결과가 없으면 AppError 를 던진다", async () => {
    await expect(
      resolveMemberId(fakeClient([]), uniqueProjectId(), "none@example.com"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("이름으로 organizationMemberId 를 매칭한다", async () => {
    const id = await resolveMemberId(fakeClient(), uniqueProjectId(), "이영희");
    expect(id).toBe("om-2");
  });

  it("이름을 찾지 못하면 AppError 를 던진다", async () => {
    await expect(
      resolveMemberId(fakeClient(), uniqueProjectId(), "없는사람"),
    ).rejects.toBeInstanceOf(AppError);
  });
});
