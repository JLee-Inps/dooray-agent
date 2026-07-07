// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import type { DoorayClient } from "../dooray/client";
import type { WikiPage } from "../dooray/types";
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

/** 위키 페이지 목록에서 루트 페이지(`root === true`)의 id 를 찾는다. */
export function findRootPageId(pages: WikiPage[]): string {
  const root = pages.find((page) => page.root === true);
  if (!root) {
    throw new AppError("위키 루트 페이지를 찾을 수 없습니다", ExitCode.Api);
  }
  return root.id;
}

/**
 * 위키 페이지 생성 시 부모 페이지 ID 를 해석한다. `parent` 가 지정되면 그대로
 * 통과시키고(단축 경로), 없으면 해당 위키의 루트 페이지를 조회해 기본 부모로
 * 삼는다(Dooray 위키는 부모가 필수라 미지정 시 400 이 나기 때문).
 */
export async function resolveParentPageId(
  client: DoorayClient,
  wikiId: string,
  parent?: string,
): Promise<string> {
  if (parent) return parent;
  const { items } = await client.listWikiPages(wikiId);
  return findRootPageId(items);
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
