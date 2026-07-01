// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import chalk from "chalk";
import { AppError, toAppError } from "./core/errors";
import { muteSpinner } from "./core/spinner";
import { authCommands } from "./commands/auth";
import { projectCommand } from "./commands/project";
import { postCommand } from "./commands/post";
import { wikiCommand } from "./commands/wiki";
import { memberCommand } from "./commands/member";
import { adminCommands } from "./commands/admin";
import { capabilitiesCommand } from "./commands/capabilities";
import { configCommand } from "./commands/config";
import { setupCommand } from "./commands/setup";
import { feedbackCommand } from "./commands/feedback";
import { mailCommand } from "./commands/mail";
import { calendarCommand } from "./commands/calendar";
import { messengerCommand } from "./commands/messenger";
import { driveCommand } from "./commands/drive";

const program = new Command();

program
  .name("dooray-agent")
  .description("터미널·Claude Code 에서 Dooray 문서를 읽고 쓰는 CLI")
  .version("0.1.0")
  .option("--json", "구조화된 JSON 으로 출력")
  .option("--quiet", "식별자만 출력 (파이프용)")
  .option("--no-color", "색상 비활성화");

program.hook("preAction", () => {
  const opts = program.opts();
  if (opts.color === false || process.env.NO_COLOR) chalk.level = 0;
  if (opts.json || opts.quiet) muteSpinner(true);
});

for (const command of authCommands()) program.addCommand(command);
program.addCommand(projectCommand());
program.addCommand(postCommand());
program.addCommand(wikiCommand());
program.addCommand(memberCommand());
program.addCommand(mailCommand());
program.addCommand(calendarCommand());
program.addCommand(messengerCommand());
program.addCommand(driveCommand());
for (const command of adminCommands()) program.addCommand(command);
program.addCommand(configCommand());
program.addCommand(setupCommand());
program.addCommand(feedbackCommand());
program.addCommand(capabilitiesCommand(program));

// 유일한 에러 출력·종료 지점. 모든 실패는 여기로 버블한다.
// --json 모드에서는 에러도 구조화해 내보낸다 — 에이전트가 실패를 파싱할 수 있다.
program.parseAsync().catch((error: unknown) => {
  const err: AppError = toAppError(error);
  if (program.opts().json === true) {
    process.stderr.write(
      JSON.stringify({ error: { message: err.message, code: err.code } }) +
        "\n",
    );
  } else {
    process.stderr.write(chalk.red(`오류: ${err.message}`) + "\n");
  }
  process.exit(err.code);
});
