// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { AppError, ExitCode } from "../core/errors";

/**
 * 이름으로 항목 하나를 고른다.
 * 정확 일치 우선 → 없으면 부분 일치 → 후보가 여럿이면 목록과 함께 에러.
 * 빈 이름 항목은 후보에서 제외한다.
 */
export function matchByName<T>(
  items: T[],
  input: string,
  label: string,
  name: (item: T) => string,
  describe: (item: T) => string,
): T {
  const named = items.filter((item) => name(item).length > 0);
  const exact = named.filter((item) => name(item) === input);
  const pool =
    exact.length > 0
      ? exact
      : named.filter((item) => name(item).includes(input));

  if (pool.length === 0) {
    throw new AppError(
      `${label}을(를) 찾을 수 없습니다: ${input}`,
      ExitCode.Usage,
    );
  }
  if (pool.length > 1) {
    const preview = pool
      .slice(0, 8)
      .map((item) => `  - ${describe(item)}`)
      .join("\n");
    throw new AppError(
      `${label} 후보가 여러 개입니다: "${input}"\n${preview}`,
      ExitCode.Usage,
    );
  }
  return pool[0]!;
}
