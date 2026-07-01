// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import { createClient } from "../core/session";
import { reportWrite, type OutputMode } from "../core/output";
import { startSpinner, stopSpinner } from "../core/spinner";
import { clearCache } from "../core/cache";

/** 운영 명령: doctor, cache clear. */
export function adminCommands(): Command[] {
  const doctor = new Command("doctor")
    .description("인증·연결 상태 점검")
    .action(async () => {
      const mode = doctor.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("연결 확인 중...");
      const me = await client.getMe();
      stopSpinner();
      reportWrite(mode, {
        json: { status: "ok", member: me.name },
        id: me.name,
        message: `연결 정상: ${me.name}`,
      });
    });

  const cache = new Command("cache").description("캐시 명령");

  const clear = new Command("clear")
    .description("로컬 캐시 비우기")
    .action(async () => {
      const mode = clear.optsWithGlobals() as OutputMode;
      await clearCache();
      reportWrite(mode, {
        json: { status: "cleared" },
        id: "cleared",
        message: "캐시를 비웠습니다.",
      });
    });

  cache.addCommand(clear);
  return [doctor, cache];
}
