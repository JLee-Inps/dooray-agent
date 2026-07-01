// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { summarizeDownloads, type DownloadOutcome } from "./download";

describe("summarizeDownloads", () => {
  it("모두 성공하면 succeeded 로만 취합한다", () => {
    const outcomes: DownloadOutcome[] = [
      { fileId: "a", outputPath: "out/a.txt" },
      { fileId: "b", outputPath: "out/b.txt" },
    ];
    const summary = summarizeDownloads(outcomes);
    expect(summary.count).toBe(2);
    expect(summary.succeeded).toEqual([
      { fileId: "a", outputPath: "out/a.txt" },
      { fileId: "b", outputPath: "out/b.txt" },
    ]);
    expect(summary.failed).toEqual([]);
  });

  it("error 가 있으면 실패로 분류한다", () => {
    const outcomes: DownloadOutcome[] = [
      { fileId: "a", outputPath: "out/a.txt" },
      { fileId: "b", error: "404 Not Found" },
    ];
    const summary = summarizeDownloads(outcomes);
    expect(summary.count).toBe(2);
    expect(summary.succeeded).toEqual([
      { fileId: "a", outputPath: "out/a.txt" },
    ]);
    expect(summary.failed).toEqual([{ fileId: "b", error: "404 Not Found" }]);
  });

  it("모두 실패하면 succeeded 는 비어 있다", () => {
    const outcomes: DownloadOutcome[] = [
      { fileId: "a", error: "x" },
      { fileId: "b", error: "y" },
    ];
    const summary = summarizeDownloads(outcomes);
    expect(summary.succeeded).toEqual([]);
    expect(summary.failed).toHaveLength(2);
  });

  it("빈 입력이면 count 0, 양쪽 모두 비어 있다", () => {
    const summary = summarizeDownloads([]);
    expect(summary).toEqual({ count: 0, succeeded: [], failed: [] });
  });

  it("outputPath 가 없어도 error 가 없으면 성공으로 보고 빈 경로로 채운다", () => {
    const summary = summarizeDownloads([{ fileId: "a" }]);
    expect(summary.succeeded).toEqual([{ fileId: "a", outputPath: "" }]);
    expect(summary.failed).toEqual([]);
  });

  it("혼합 입력의 순서를 각 그룹 안에서 보존한다", () => {
    const outcomes: DownloadOutcome[] = [
      { fileId: "a", outputPath: "a" },
      { fileId: "b", error: "e1" },
      { fileId: "c", outputPath: "c" },
      { fileId: "d", error: "e2" },
    ];
    const summary = summarizeDownloads(outcomes);
    expect(summary.succeeded.map((s) => s.fileId)).toEqual(["a", "c"]);
    expect(summary.failed.map((f) => f.fileId)).toEqual(["b", "d"]);
  });

  it("count 는 항상 succeeded 와 failed 의 합과 같다", () => {
    const summary = summarizeDownloads([
      { fileId: "a", outputPath: "a" },
      { fileId: "b", error: "e" },
      { fileId: "c", outputPath: "c" },
    ]);
    expect(summary.count).toBe(
      summary.succeeded.length + summary.failed.length,
    );
    expect(summary.count).toBe(3);
  });
});
