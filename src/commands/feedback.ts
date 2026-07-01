// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Command } from "commander";
import { reportWrite, type OutputMode } from "../core/output";
import { AppError, ExitCode } from "../core/errors";

const execFileAsync = promisify(execFile);

const REPO = "JLee-Inps/dooray-agent";

/** 메시지 첫 줄을 이슈 제목으로 줄인다(최대 72자). */
function toTitle(message: string): string {
  const firstLine = message.split("\n")[0]?.trim() ?? "";
  const head = firstLine.length > 0 ? firstLine : message.trim();
  return head.length > 72 ? head.slice(0, 69) + "..." : head;
}

/**
 * 피드백을 GitHub 이슈로 보낸다. `gh` CLI 에 위임한다.
 * 본문에는 사용자가 준 메시지만 담는다 — 토큰·시크릿은 절대 포함하지 않는다.
 */
export function feedbackCommand(): Command {
  const feedback = new Command("feedback")
    .description("GitHub 이슈로 피드백을 보낸다 (gh CLI 필요)")
    .argument("<message>", "피드백 내용")
    .action(async (message: string) => {
      const mode = feedback.optsWithGlobals() as OutputMode;
      const title = toTitle(message);

      let url: string;
      try {
        const { stdout } = await execFileAsync("gh", [
          "issue",
          "create",
          "--repo",
          REPO,
          "--title",
          title,
          "--body",
          message,
        ]);
        url = stdout.trim();
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === "ENOENT") {
          throw new AppError(
            "gh CLI 를 찾을 수 없습니다. https://cli.github.com 에서 설치하고 `gh auth login` 으로 인증하세요.",
            ExitCode.Usage,
          );
        }
        const detail = err.message || String(error);
        throw new AppError(
          `피드백 전송에 실패했습니다: ${detail}`,
          ExitCode.Api,
        );
      }

      reportWrite(mode, {
        json: { status: "submitted", url },
        id: url,
        message: `피드백을 보냈습니다: ${url}`,
      });
    });

  return feedback;
}
