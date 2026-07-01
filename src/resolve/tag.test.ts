// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { resolveTagId } from "./tag";
import { AppError } from "../core/errors";
import type { DoorayClient } from "../dooray/client";
import type { Tag } from "../dooray/types";

const TAGS: Tag[] = [
  { id: "tag-1", name: "버그" },
  { id: "tag-2", name: "기능" },
];

// resolveTagId 는 cached 를 거치므로 캐시 miss 보장을 위해 고유 projectId 사용.
function fakeClient(tags = TAGS): DoorayClient {
  return { listTags: async () => tags } as unknown as DoorayClient;
}

let counter = 0;
function uniqueProjectId(): string {
  counter += 1;
  return `tag-test-${Date.now()}-${counter}`;
}

describe("resolveTagId", () => {
  it("이름으로 tagId 를 매칭한다", async () => {
    const id = await resolveTagId(fakeClient(), uniqueProjectId(), "기능");
    expect(id).toBe("tag-2");
  });

  it("raw id(15자리+)는 그대로 통과한다", async () => {
    const raw = "999888777666555";
    const id = await resolveTagId(fakeClient(), uniqueProjectId(), raw);
    expect(id).toBe(raw);
  });

  it("찾지 못하면 AppError 를 던진다", async () => {
    await expect(
      resolveTagId(fakeClient(), uniqueProjectId(), "없는태그"),
    ).rejects.toBeInstanceOf(AppError);
  });
});
