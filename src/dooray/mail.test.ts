// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { formatAddresses, requireImap, requireSmtp } from "./mail";
import { AppError, ExitCode } from "../core/errors";
import type { Credentials } from "../core/config";

describe("formatAddresses", () => {
  it("undefined 이면 빈 문자열", () => {
    expect(formatAddresses(undefined)).toBe("");
  });

  it("빈 배열이면 빈 문자열", () => {
    expect(formatAddresses([])).toBe("");
  });

  it("이름이 있으면 `이름 <주소>` 형식", () => {
    expect(formatAddresses([{ name: "김철수", address: "kim@x.com" }])).toBe(
      "김철수 <kim@x.com>",
    );
  });

  it("이름이 없으면 주소만", () => {
    expect(formatAddresses([{ address: "kim@x.com" }])).toBe("kim@x.com");
  });

  it("여러 주소를 콤마로 합치고 빈 항목은 제외한다", () => {
    const out = formatAddresses([
      { name: "가", address: "a@x.com" },
      { address: "b@x.com" },
      {},
    ]);
    expect(out).toBe("가 <a@x.com>, b@x.com");
  });
});

const FULL: Credentials = {
  token: "t",
  baseUrl: "https://x",
  imapHost: "imap.x.com",
  smtpHost: "smtp.x.com",
  mailUser: "u",
  mailPassword: "p",
};

describe("requireImap", () => {
  it("IMAP 설정이 완전하면 자격증명을 돌려준다", () => {
    expect(requireImap(FULL)).toEqual({
      imapHost: "imap.x.com",
      mailUser: "u",
      mailPassword: "p",
    });
  });

  it("imapHost 가 없으면 Config 에러", () => {
    const partial: Credentials = { ...FULL, imapHost: undefined };
    try {
      requireImap(partial);
      expect.unreachable("throw 했어야 함");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ExitCode.Config);
    }
  });
});

describe("requireSmtp", () => {
  it("SMTP 설정이 완전하면 자격증명을 돌려준다", () => {
    expect(requireSmtp(FULL)).toEqual({
      smtpHost: "smtp.x.com",
      mailUser: "u",
      mailPassword: "p",
    });
  });

  it("mailPassword 가 없으면 Config 에러", () => {
    const partial: Credentials = { ...FULL, mailPassword: undefined };
    expect(() => requireSmtp(partial)).toThrow(AppError);
  });
});
