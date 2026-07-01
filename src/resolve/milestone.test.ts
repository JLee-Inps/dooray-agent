// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { resolveMilestoneId } from "./milestone";
import { AppError } from "../core/errors";
import type { DoorayClient } from "../dooray/client";
import type { Milestone } from "../dooray/types";

const MILESTONES: Milestone[] = [
  { id: "ms-1", name: "1차 스프린트" },
  { id: "ms-2", name: "2차 스프린트" },
];

// resolveMilestoneId 는 cached 를 거치므로 캐시 miss 보장을 위해 고유 projectId 사용.
function fakeClient(milestones = MILESTONES): DoorayClient {
  return {
    listMilestones: async () => milestones,
  } as unknown as DoorayClient;
}

let counter = 0;
function uniqueProjectId(): string {
  counter += 1;
  return `ms-test-${Date.now()}-${counter}`;
}

describe("resolveMilestoneId", () => {
  it("이름으로 milestoneId 를 매칭한다", async () => {
    const id = await resolveMilestoneId(
      fakeClient(),
      uniqueProjectId(),
      "2차 스프린트",
    );
    expect(id).toBe("ms-2");
  });

  it("부분 일치도 매칭한다", async () => {
    const id = await resolveMilestoneId(
      fakeClient([{ id: "ms-9", name: "릴리스 3.0" }]),
      uniqueProjectId(),
      "릴리스",
    );
    expect(id).toBe("ms-9");
  });

  it("raw id(15자리+)는 그대로 통과한다", async () => {
    const raw = "123456789012345";
    const id = await resolveMilestoneId(fakeClient(), uniqueProjectId(), raw);
    expect(id).toBe(raw);
  });

  it("찾지 못하면 AppError 를 던진다", async () => {
    await expect(
      resolveMilestoneId(fakeClient(), uniqueProjectId(), "없는마일스톤"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("후보가 여러 개면 AppError 를 던진다", async () => {
    await expect(
      resolveMilestoneId(fakeClient(), uniqueProjectId(), "스프린트"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("raw id 는 listMilestones 를 부르지 않고 통과한다", async () => {
    const throwing = {
      listMilestones: async () => {
        throw new Error("호출되면 안 됨");
      },
    } as unknown as DoorayClient;
    const raw = "999888777666555";
    expect(await resolveMilestoneId(throwing, uniqueProjectId(), raw)).toBe(
      raw,
    );
  });
});
