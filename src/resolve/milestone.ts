// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import type { DoorayClient } from "../dooray/client";
import { cached, TTL } from "../core/cache";
import { matchByName } from "./match";
import { looksLikeId } from "./project";

/** 마일스톤 이름/raw ID 를 milestoneId 로 해석한다(프로젝트 마일스톤 이름 매칭, 캐시 사용). */
export async function resolveMilestoneId(
  client: DoorayClient,
  projectId: string,
  input: string,
): Promise<string> {
  if (looksLikeId(input)) return input;
  const milestones = await cached(`milestones-${projectId}`, TTL.day, () =>
    client.listMilestones(projectId),
  );
  const hit = matchByName(
    milestones,
    input,
    "마일스톤",
    (milestone) => milestone.name,
    (milestone) => `${milestone.name} (${milestone.id})`,
  );
  return hit.id;
}
