// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { mergeEventFields } from "./calendar";
import type { CalendarEvent, PostUserRef } from "../dooray/types";

const attendee = (id: string): PostUserRef => ({
  type: "member",
  member: { organizationMemberId: id },
});

describe("mergeEventFields (부분 수정 anti-overfit)", () => {
  it("--body 미지정 시 current.body 가 재공급된다 (핵심 회귀)", () => {
    const current: CalendarEvent = {
      id: "e1",
      subject: "원래 제목",
      startedAt: "2026-07-01T09:00:00Z",
      endedAt: "2026-07-01T10:00:00Z",
      body: { mimeType: "text/x-markdown", content: "원래 본문" },
    };
    const merged = mergeEventFields(current, { subject: "새 제목" });
    expect(merged.subject).toBe("새 제목");
    expect(merged.startedAt).toBe(current.startedAt);
    expect(merged.endedAt).toBe(current.endedAt);
    expect(merged.body).toEqual({
      mimeType: "text/x-markdown",
      content: "원래 본문",
    });
  });

  it("--body 지정 시 지정값으로 교체한다", () => {
    const current: CalendarEvent = {
      id: "e1",
      subject: "제목",
      startedAt: "2026-07-01T09:00:00Z",
      endedAt: "2026-07-01T10:00:00Z",
      body: { mimeType: "text/x-markdown", content: "원래 본문" },
    };
    const merged = mergeEventFields(current, { body: "새 본문" });
    expect(merged.body).toEqual({
      mimeType: "text/x-markdown",
      content: "새 본문",
    });
  });

  it("current.wholeDayFlag/users(참석자)는 edit 옵션이 없어도 무조건 재공급된다", () => {
    const current: CalendarEvent = {
      id: "e1",
      subject: "제목",
      startedAt: "2026-07-01T09:00:00Z",
      endedAt: "2026-07-01T10:00:00Z",
      wholeDayFlag: true,
      users: { to: [attendee("m1")] },
    };
    const merged = mergeEventFields(current, {});
    expect(merged.wholeDayFlag).toBe(true);
    expect(merged.users).toEqual({ to: [attendee("m1")] });
  });

  it("current 에 body/wholeDayFlag/users 가 없으면 키를 생략한다 (anti-overfit)", () => {
    const current: CalendarEvent = {
      id: "e1",
      subject: "제목",
      startedAt: "2026-07-01T09:00:00Z",
      endedAt: "2026-07-01T10:00:00Z",
    };
    const merged = mergeEventFields(current, {});
    expect(merged).not.toHaveProperty("body");
    expect(merged).not.toHaveProperty("wholeDayFlag");
    expect(merged).not.toHaveProperty("users");
  });

  it("startedAt/endedAt 이 undefined 인 경우 빈 문자열로 공급된다 (updateEvent 필수 인자)", () => {
    const current: CalendarEvent = { id: "e1", subject: "제목" };
    const merged = mergeEventFields(current, {});
    expect(merged.startedAt).toBe("");
    expect(merged.endedAt).toBe("");
  });
});
