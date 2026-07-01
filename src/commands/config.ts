// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import { loadRawConfig, saveConfig, type Credentials } from "../core/config";
import { render, reportWrite, type OutputMode } from "../core/output";
import { AppError, ExitCode } from "../core/errors";

/** CLI 키(대시) → 저장 필드 매핑. set/get 이 공유하는 유일한 키 목록. */
const KEY_MAP: Record<string, keyof Credentials> = {
  token: "token",
  "base-url": "baseUrl",
  "imap-host": "imapHost",
  "smtp-host": "smtpHost",
  "mail-user": "mailUser",
  "mail-password": "mailPassword",
};

/** 마스킹 대상(비밀) 필드. */
const SECRET: ReadonlySet<keyof Credentials> = new Set([
  "token",
  "mailPassword",
]);

/** 비밀 값을 앞 4글자 + **** 로 마스킹한다. */
function mask(value: string): string {
  return value.slice(0, 4) + "****";
}

/** 저장 필드 → 표시 값(비밀은 마스킹). */
function display(field: keyof Credentials, value: string): string {
  return SECRET.has(field) ? mask(value) : value;
}

/** 설정 명령 그룹: get, set. 비밀 값은 조회 시 마스킹된다. */
export function configCommand(): Command {
  const config = new Command("config").description("설정 조회·변경");

  const get = new Command("get")
    .description("설정 조회 (token/mail-password 는 마스킹)")
    .argument("[key]", "조회할 키 (생략 시 전체)")
    .action(async (key: string | undefined) => {
      const mode = get.optsWithGlobals() as OutputMode;
      const raw = await loadRawConfig();

      if (key !== undefined) {
        const field = KEY_MAP[key];
        if (!field) {
          throw new AppError(
            `알 수 없는 설정 키: ${key}. 가능한 키: ${Object.keys(KEY_MAP).join(", ")}`,
            ExitCode.Usage,
          );
        }
        const value = raw[field];
        if (value === undefined) {
          throw new AppError(`설정 값이 없습니다: ${key}`, ExitCode.Config);
        }
        const shown = display(field, value);
        render(mode, {
          table: { columns: ["key", "value"], rows: [[key, shown]] },
          json: { [key]: shown },
          ids: [shown],
        });
        return;
      }

      const entries = Object.entries(KEY_MAP)
        .map(([cliKey, field]) => {
          const value = raw[field];
          return value === undefined
            ? null
            : ([cliKey, display(field, value)] as const);
        })
        .filter((entry): entry is readonly [string, string] => entry !== null);

      if (entries.length === 0) {
        throw new AppError(
          "저장된 설정이 없습니다. `dooray-agent config set <key> <value>` 또는 `dooray-agent setup` 을 사용하세요.",
          ExitCode.Config,
        );
      }

      render(mode, {
        table: { columns: ["key", "value"], rows: entries.map((e) => [...e]) },
        json: Object.fromEntries(entries),
        ids: entries.map(([, value]) => value),
      });
    });

  const set = new Command("set")
    .description("설정 값 저장")
    .argument("<key>", `설정 키 (${Object.keys(KEY_MAP).join(", ")})`)
    .argument("<value>", "설정 값")
    .action(async (key: string, value: string) => {
      const mode = set.optsWithGlobals() as OutputMode;
      const field = KEY_MAP[key];
      if (!field) {
        throw new AppError(
          `알 수 없는 설정 키: ${key}. 가능한 키: ${Object.keys(KEY_MAP).join(", ")}`,
          ExitCode.Usage,
        );
      }
      await saveConfig({ [field]: value });
      reportWrite(mode, {
        json: { key, status: "saved" },
        id: key,
        message: `설정을 저장했습니다: ${key}`,
      });
    });

  config.addCommand(get);
  config.addCommand(set);
  return config;
}
