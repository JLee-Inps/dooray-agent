// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { AppError, ExitCode, toAppError } from "./errors";

describe("AppError", () => {
  it("code 기본값은 ExitCode.Api", () => {
    const err = new AppError("실패");
    expect(err.code).toBe(ExitCode.Api);
    expect(err.message).toBe("실패");
  });

  it("전달한 code 를 보존한다", () => {
    const err = new AppError("인증 필요", ExitCode.Auth);
    expect(err.code).toBe(ExitCode.Auth);
  });

  it("Error 를 상속하고 name 은 AppError", () => {
    const err = new AppError("x");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AppError");
  });
});

describe("toAppError", () => {
  it("AppError 는 같은 인스턴스로 통과시킨다", () => {
    const original = new AppError("보존", ExitCode.Config);
    const result = toAppError(original);
    expect(result).toBe(original);
    expect(result.code).toBe(ExitCode.Config);
  });

  it("일반 Error 는 메시지를 보존해 AppError(Api) 로 감싼다", () => {
    const result = toAppError(new Error("네트워크 끊김"));
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe("네트워크 끊김");
    expect(result.code).toBe(ExitCode.Api);
  });

  it("문자열은 그대로 메시지로 쓴다", () => {
    const result = toAppError("문자열 오류");
    expect(result.message).toBe("문자열 오류");
    expect(result.code).toBe(ExitCode.Api);
  });

  it("Error 도 문자열도 아니면 String() 으로 좁힌다", () => {
    const result = toAppError({ reason: "x" });
    expect(result.message).toBe("[object Object]");
    expect(result.code).toBe(ExitCode.Api);
  });
});
