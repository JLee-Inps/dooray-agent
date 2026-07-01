// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import type { DoorayClient } from "../dooray/client";
import { AppError, ExitCode } from "../core/errors";
import { cached, TTL } from "../core/cache";

/** 15자리 이상 숫자는 raw Dooray ID 로 본다. */
const RAW_ID = /^\d{15,}$/;

export function looksLikeId(value: string): boolean {
  return RAW_ID.test(value);
}

/** 프로젝트 코드 또는 raw ID 를 projectId 로 해석한다(캐시 사용). */
export async function resolveProjectId(
  client: DoorayClient,
  input: string,
): Promise<string> {
  if (looksLikeId(input)) return input;
  const projects = await cached("projects", TTL.hour, () =>
    client.listProjects(),
  );
  const hit = projects.find((project) => project.code === input);
  if (!hit) {
    throw new AppError(`프로젝트를 찾을 수 없습니다: ${input}`, ExitCode.Usage);
  }
  return hit.id;
}

/** 프로젝트(코드/ID)에 연결된 위키의 wikiId 를 해석한다(캐시 사용). */
export async function resolveWikiId(
  client: DoorayClient,
  projectInput: string,
): Promise<string> {
  const projectId = await resolveProjectId(client, projectInput);
  const wikis = await cached("wikis", TTL.day, () => client.listWikis());
  const hit = wikis.find((wiki) => wiki.project.id === projectId);
  if (!hit) {
    throw new AppError(
      `프로젝트에 연결된 위키가 없습니다: ${projectInput}`,
      ExitCode.Usage,
    );
  }
  return hit.id;
}
