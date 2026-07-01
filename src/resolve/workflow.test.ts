// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { resolveWorkflowId, findClosedWorkflowId } from "./workflow";
import { AppError } from "../core/errors";
import type { DoorayClient } from "../dooray/client";
import type { Workflow } from "../dooray/types";

const WORKFLOWS: Workflow[] = [
  { id: "100", name: "할 일", class: "registered" },
  { id: "200", name: "진행", class: "working" },
  { id: "300", name: "완료", class: "closed" },
];

// listWorkflows 만 노출하는 가짜 client. resolveWorkflowId 는 cached 를 거치므로
// 캐시 miss 를 보장하기 위해 매 테스트마다 고유한 projectId 를 쓴다.
function fakeClient(workflows = WORKFLOWS): DoorayClient {
  return { listWorkflows: async () => workflows } as unknown as DoorayClient;
}

let counter = 0;
function uniqueProjectId(): string {
  counter += 1;
  return `wf-test-${Date.now()}-${counter}`;
}

describe("resolveWorkflowId", () => {
  it("이름으로 workflowId 를 매칭한다", async () => {
    const id = await resolveWorkflowId(fakeClient(), uniqueProjectId(), "진행");
    expect(id).toBe("200");
  });

  it("raw ID(15자리+)는 그대로 통과한다", async () => {
    const raw = "123456789012345";
    const id = await resolveWorkflowId(fakeClient(), uniqueProjectId(), raw);
    expect(id).toBe(raw);
  });

  it("찾지 못하면 AppError 를 던진다", async () => {
    await expect(
      resolveWorkflowId(fakeClient(), uniqueProjectId(), "없는워크플로"),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("findClosedWorkflowId", () => {
  it("closed 클래스 워크플로 ID 를 찾는다", async () => {
    const id = await findClosedWorkflowId(fakeClient(), uniqueProjectId());
    expect(id).toBe("300");
  });

  it("closed 워크플로가 없으면 AppError 를 던진다", async () => {
    const withoutClosed = WORKFLOWS.filter((w) => w.class !== "closed");
    await expect(
      findClosedWorkflowId(fakeClient(withoutClosed), uniqueProjectId()),
    ).rejects.toBeInstanceOf(AppError);
  });
});
