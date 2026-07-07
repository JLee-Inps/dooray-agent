// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { sameAuthScope } from "./client";

const BASE = "https://api.dooray.com";

describe("sameAuthScope", () => {
  it("동일 host → true", () => {
    expect(sameAuthScope(BASE, "https://api.dooray.com/download/abc")).toBe(
      true,
    );
  });

  it("동일 상위도메인 서브도메인(files.dooray.com) → true (다운로드 정상 케이스 보존)", () => {
    expect(sameAuthScope(BASE, "https://files.dooray.com/x")).toBe(true);
  });

  it("외부 host(evil.com) → false (토큰 유출 차단 — 핵심 요구사항)", () => {
    expect(sameAuthScope(BASE, "https://evil.com/steal")).toBe(false);
  });

  it("상대 경로 → true (baseUrl 기준 resolve → 동일 host)", () => {
    expect(sameAuthScope(BASE, "/download/abc?media=raw")).toBe(true);
  });

  it("파싱 불가 URL(http://) → false", () => {
    expect(sameAuthScope(BASE, "http://")).toBe(false);
  });

  it("위장 도메인(api.dooray.com.evil.com) → false (마지막 2라벨=evil.com ≠ dooray.com)", () => {
    expect(sameAuthScope(BASE, "https://api.dooray.com.evil.com/x")).toBe(
      false,
    );
  });

  it("동일 host https→http 강등 → false (핵심 회귀 — 프로토콜 다운그레이드 차단)", () => {
    expect(sameAuthScope(BASE, "http://api.dooray.com/x")).toBe(false);
  });

  it("서브도메인 https→http 강등 → false (프로토콜 게이트가 hostname 근사보다 앞섬)", () => {
    expect(sameAuthScope(BASE, "http://files.dooray.com/x")).toBe(false);
  });

  it("base=http, location=https → true (http→https 업그레이드 허용)", () => {
    expect(
      sameAuthScope("http://api.dooray.com", "https://api.dooray.com/x"),
    ).toBe(true);
  });

  it("base=http, location=http → true (동일 프로토콜)", () => {
    expect(
      sameAuthScope("http://api.dooray.com", "http://api.dooray.com/x"),
    ).toBe(true);
  });
});
