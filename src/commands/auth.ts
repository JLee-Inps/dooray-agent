// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import { saveConfig } from "../core/config";
import { createClient } from "../core/session";
import { render, reportWrite, type OutputMode } from "../core/output";
import { startSpinner, stopSpinner } from "../core/spinner";

/** 인증 관련 명령: login, whoami. */
export function authCommands(): Command[] {
  const login = new Command("login")
    .description("Dooray API 토큰을 등록한다 (~/.dooray-agent/config.json)")
    .requiredOption("--token <token>", "Dooray API 토큰")
    .requiredOption(
      "--base-url <url>",
      "API 베이스 URL (예: https://api.dooray.com)",
    )
    .action(async (opts: { token: string; baseUrl: string }) => {
      const mode = login.optsWithGlobals() as OutputMode;
      await saveConfig({ token: opts.token, baseUrl: opts.baseUrl });
      reportWrite(mode, {
        json: { status: "saved" },
        id: "saved",
        message: "인증 정보를 저장했습니다.",
      });
    });

  const whoami = new Command("whoami")
    .description("현재 인증된 멤버를 확인한다")
    .action(async () => {
      const mode = whoami.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("멤버 조회 중...");
      const me = await client.getMe();
      stopSpinner();
      render(mode, {
        table: { columns: ["id", "name"], rows: [[me.id, me.name]] },
        json: me,
        ids: [me.id],
      });
    });

  return [login, whoami];
}
