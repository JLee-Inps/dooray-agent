// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { parseContentDisposition, sanitizeFileName } from "./client";

describe("sanitizeFileName", () => {
  it("경로 요소를 떨군다", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("dir/report.md")).toBe("report.md");
  });

  it(". / .. / 빈 값은 download 로 치환", () => {
    expect(sanitizeFileName("..")).toBe("download");
    expect(sanitizeFileName(".")).toBe("download");
    expect(sanitizeFileName("   ")).toBe("download");
  });

  it("정상 파일명은 유지", () => {
    expect(sanitizeFileName("설계.md")).toBe("설계.md");
  });
});

describe("parseContentDisposition", () => {
  it("filename*= 언어태그 포함 UTF-8 디코드", () => {
    const header = "attachment; filename*=UTF-8'ko'%EC%84%A4%EA%B3%84.md";
    expect(parseContentDisposition(header, "fallback")).toBe("설계.md");
  });

  it("filename*= 빈 언어태그도 처리", () => {
    const header = "attachment; filename*=UTF-8''report.pdf";
    expect(parseContentDisposition(header, "fallback")).toBe("report.pdf");
  });

  it('quoted filename="..." 처리', () => {
    const header = 'attachment; filename="a b.txt"';
    expect(parseContentDisposition(header, "fallback")).toBe("a b.txt");
  });

  it("헤더 없으면 fallback(sanitize 적용)", () => {
    expect(parseContentDisposition(null, "file-123")).toBe("file-123");
    expect(parseContentDisposition(null, "../evil")).toBe("evil");
  });

  it("filename* 이 traversal 이어도 안전하게 좁힌다", () => {
    const header = "attachment; filename*=UTF-8''%2e%2e%2fescape";
    expect(parseContentDisposition(header, "fallback")).toBe("escape");
  });
});
