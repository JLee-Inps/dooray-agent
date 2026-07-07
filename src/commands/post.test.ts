// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { mergePostExtras } from "./post";
import type { Post, PostUserRef } from "../dooray/types";

const toRef = (id: string): PostUserRef => ({
  type: "member",
  member: { organizationMemberId: id },
});

const EMPTY_OPTS = { tag: [], cc: [], to: [] };

describe("mergePostExtras (부분 수정 anti-overfit)", () => {
  it("--tag/--cc/--to 미지정 시 current 의 tags/users 가 재공급된다 (핵심 회귀)", () => {
    const current: Post = {
      id: "p1",
      number: 1,
      subject: "s",
      tags: [{ id: "tag-1" }, { id: "tag-2" }],
      users: { to: [toRef("m-to")], cc: [toRef("m-cc")] },
    };
    const merged = mergePostExtras(current, EMPTY_OPTS, {});
    expect(merged.tagIdList).toEqual(["tag-1", "tag-2"]);
    expect(merged.users).toEqual({
      to: [toRef("m-to")],
      cc: [toRef("m-cc")],
    });
  });

  it("--tag 지정 시 resolved.tagIdList 를 쓰고, --cc/--to 미지정은 current.users 유지 (필드별 독립)", () => {
    const current: Post = {
      id: "p1",
      number: 1,
      subject: "s",
      tags: [{ id: "old-tag" }],
      users: { to: [toRef("old-to")], cc: [toRef("old-cc")] },
    };
    const merged = mergePostExtras(
      current,
      { tag: ["new"], cc: [], to: [] },
      { tagIdList: ["new-tag-id"] },
    );
    expect(merged.tagIdList).toEqual(["new-tag-id"]);
    expect(merged.users).toEqual({
      to: [toRef("old-to")],
      cc: [toRef("old-cc")],
    });
  });

  it("--to 만 지정 시 to 는 resolved 값, cc 는 current 값 (필드별 독립)", () => {
    const current: Post = {
      id: "p1",
      number: 1,
      subject: "s",
      users: { to: [toRef("old-to")], cc: [toRef("old-cc")] },
    };
    const merged = mergePostExtras(
      current,
      { tag: [], cc: [], to: ["new-member"] },
      { users: { to: [toRef("new-to")] } },
    );
    expect(merged.users).toEqual({
      to: [toRef("new-to")],
      cc: [toRef("old-cc")],
    });
  });

  it("양쪽 다 비어있으면 키를 생략한다 (anti-overfit: 빈 배열 삽입 아님)", () => {
    const current: Post = { id: "p1", number: 1, subject: "s" };
    const merged = mergePostExtras(current, EMPTY_OPTS, {});
    expect(merged).not.toHaveProperty("tagIdList");
    expect(merged).not.toHaveProperty("users");
  });

  it("current.tags/users 가 undefined 여도 방어적으로 동작한다 (GET 형태 미확인 시 무해)", () => {
    const current: Post = { id: "p1", number: 1, subject: "s" };
    expect(() => mergePostExtras(current, EMPTY_OPTS, {})).not.toThrow();
  });
});
