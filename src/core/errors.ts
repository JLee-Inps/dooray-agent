// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

/** 프로세스 종료 코드. CLI 전체가 이 값으로만 종료한다. */
export const ExitCode = {
  Success: 0,
  Api: 1,
  Auth: 2,
  Usage: 3,
  Config: 4,
} as const;

/**
 * 사용자에게 보여줄 단일 에러 타입.
 * 모든 실패 경로는 이 타입으로 좁혀져 진입점의 단일 핸들러에서 출력된다.
 */
export class AppError extends Error {
  readonly code: number;

  constructor(message: string, code: number = ExitCode.Api) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

/** 임의의 throw 값을 AppError 로 정규화한다(메시지 보존). */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AppError(message, ExitCode.Api);
}
