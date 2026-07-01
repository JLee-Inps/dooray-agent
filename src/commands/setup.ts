// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import { input, password } from "@inquirer/prompts";
import { saveConfig, type Credentials } from "../core/config";
import { reportWrite, type OutputMode } from "../core/output";
import { AppError, ExitCode } from "../core/errors";

/** 대화형 설정 마법사. TTY·사람 모드에서만 동작한다. */
export function setupCommand(): Command {
  const setup = new Command("setup")
    .description("대화형으로 인증·메일 설정을 입력한다")
    .action(async () => {
      const mode = setup.optsWithGlobals() as OutputMode;
      if (mode.json || mode.quiet || !process.stdin.isTTY) {
        throw new AppError(
          "대화형 설정은 TTY 에서만 가능합니다. 비대화형 환경에서는 `dooray-agent config set <key> <value>` 를 사용하세요.",
          ExitCode.Usage,
        );
      }

      const token = await password({ message: "Dooray API 토큰" });
      const baseUrl = await input({
        message: "API 베이스 URL",
        default: "https://api.dooray.com",
      });

      const next: Partial<Credentials> = { token, baseUrl };

      const imapHost = await input({
        message: "IMAP 호스트 (선택, 비우면 생략)",
        default: "",
      });
      if (imapHost) next.imapHost = imapHost;

      const smtpHost = await input({
        message: "SMTP 호스트 (선택, 비우면 생략)",
        default: "",
      });
      if (smtpHost) next.smtpHost = smtpHost;

      if (imapHost || smtpHost) {
        const mailUser = await input({
          message: "메일 계정 (선택, 비우면 생략)",
          default: "",
        });
        if (mailUser) next.mailUser = mailUser;

        const mailPassword = await password({
          message: "메일 비밀번호 (선택, 비우면 생략)",
        });
        if (mailPassword) next.mailPassword = mailPassword;
      }

      await saveConfig(next);
      reportWrite(mode, {
        json: { status: "saved" },
        id: "saved",
        message: "설정을 저장했습니다.",
      });
    });

  return setup;
}
