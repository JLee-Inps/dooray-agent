// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

/** 파일 하나의 다운로드 결과(성공: outputPath / 실패: error). */
export interface DownloadOutcome {
  fileId: string;
  outputPath?: string;
  error?: string;
}

/** download-all 취합 결과. --json 으로 그대로 내보낸다. */
export interface DownloadSummary {
  count: number;
  succeeded: { fileId: string; outputPath: string }[];
  failed: { fileId: string; error: string }[];
}

/**
 * 파일별 다운로드 결과를 성공/실패로 취합한다(순수 함수).
 * `error` 가 있으면 실패로, 아니면 성공으로 분류한다.
 */
export function summarizeDownloads(
  outcomes: DownloadOutcome[],
): DownloadSummary {
  const succeeded: { fileId: string; outputPath: string }[] = [];
  const failed: { fileId: string; error: string }[] = [];
  for (const outcome of outcomes) {
    if (outcome.error !== undefined) {
      failed.push({ fileId: outcome.fileId, error: outcome.error });
    } else {
      succeeded.push({
        fileId: outcome.fileId,
        outputPath: outcome.outputPath ?? "",
      });
    }
  }
  return { count: outcomes.length, succeeded, failed };
}
