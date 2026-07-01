// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import type { DoorayClient } from "../dooray/client";
import { AppError, ExitCode } from "../core/errors";
import { cached, TTL } from "../core/cache";
import { matchByName } from "./match";
import { looksLikeId } from "./project";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 멤버 입력(raw id / 이메일 / 이름)을 organizationMemberId 로 해석한다.
 * - 15자리 이상 숫자 → 그대로
 * - 이메일 → 정확 검색
 * - 그 외 → 프로젝트 멤버 이름 매칭
 */
export async function resolveMemberId(
  client: DoorayClient,
  projectId: string,
  input: string,
): Promise<string> {
  if (looksLikeId(input)) return input;

  if (EMAIL.test(input)) {
    const hits = await client.searchMembers({ externalEmailAddresses: input });
    const first = hits[0];
    if (!first) {
      throw new AppError(
        `이메일로 멤버를 찾을 수 없습니다: ${input}`,
        ExitCode.Usage,
      );
    }
    return first.id;
  }

  const members = await cached(`members-${projectId}`, TTL.hour, () =>
    client.listProjectMembers(projectId),
  );
  const hit = matchByName(
    members,
    input,
    "멤버",
    (member) => member.name,
    (member) => `${member.name} (${member.organizationMemberId})`,
  );
  return hit.organizationMemberId;
}
