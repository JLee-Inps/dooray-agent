// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import type { DoorayClient } from "../dooray/client";
import { AppError, ExitCode } from "../core/errors";
import { cached, TTL } from "../core/cache";
import { matchByName } from "./match";
import { looksLikeId } from "./project";

/** 워크플로 이름/클래스/raw ID 를 workflowId 로 해석한다. */
export async function resolveWorkflowId(
  client: DoorayClient,
  projectId: string,
  input: string,
): Promise<string> {
  if (looksLikeId(input)) return input;
  const workflows = await loadWorkflows(client, projectId);
  const hit = matchByName(
    workflows,
    input,
    "워크플로",
    (workflow) => workflow.name,
    (workflow) => `${workflow.name} [${workflow.class}] (${workflow.id})`,
  );
  return hit.id;
}

/** 완료(closed) 클래스 워크플로 ID 를 찾는다. `post done` 이 사용한다. */
export async function findClosedWorkflowId(
  client: DoorayClient,
  projectId: string,
): Promise<string> {
  const workflows = await loadWorkflows(client, projectId);
  const closed = workflows.find((workflow) => workflow.class === "closed");
  if (!closed) {
    throw new AppError(
      "완료(closed) 클래스 워크플로를 찾을 수 없습니다.",
      ExitCode.Usage,
    );
  }
  return closed.id;
}

function loadWorkflows(client: DoorayClient, projectId: string) {
  return cached(`workflows-${projectId}`, TTL.day, () =>
    client.listWorkflows(projectId),
  );
}
