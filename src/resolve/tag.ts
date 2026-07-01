// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import type { DoorayClient } from "../dooray/client";
import { cached, TTL } from "../core/cache";
import { matchByName } from "./match";
import { looksLikeId } from "./project";

/** 태그 이름/raw ID 를 tagId 로 해석한다(프로젝트 태그 이름 매칭, 캐시 사용). */
export async function resolveTagId(
  client: DoorayClient,
  projectId: string,
  input: string,
): Promise<string> {
  if (looksLikeId(input)) return input;
  const tags = await cached(`tags-${projectId}`, TTL.day, () =>
    client.listTags(projectId),
  );
  const hit = matchByName(
    tags,
    input,
    "태그",
    (tag) => tag.name,
    (tag) => `${tag.name} (${tag.id})`,
  );
  return hit.id;
}
