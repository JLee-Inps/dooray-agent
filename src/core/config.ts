// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { homedir } from "node:os";
import { join } from "node:path";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { AppError, ExitCode } from "./errors";

/**
 * ~/.dooray-agent/config.json 에 저장하는 설정. env 폴백은 없다.
 * token·baseUrl 은 필수(인증), 나머지는 메일 기능용 선택 필드다.
 */
export interface Credentials {
  token: string;
  baseUrl: string;
  imapHost?: string;
  smtpHost?: string;
  mailUser?: string;
  mailPassword?: string;
}

export const CONFIG_DIR = join(homedir(), ".dooray-agent");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/** 저장된 설정 원본(부분)을 읽는다. 파일이 없으면 빈 객체. */
export async function loadRawConfig(): Promise<Partial<Credentials>> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    return JSON.parse(raw) as Partial<Credentials>;
  } catch {
    return {};
  }
}

export async function loadConfig(): Promise<Credentials | null> {
  const parsed = await loadRawConfig();
  if (!parsed.token || !parsed.baseUrl) return null;
  return { ...parsed, token: parsed.token, baseUrl: parsed.baseUrl };
}

/** 인증 정보가 없으면 명확한 안내와 함께 실패한다. */
export async function requireConfig(): Promise<Credentials> {
  const config = await loadConfig();
  if (!config) {
    throw new AppError(
      "인증 정보가 없습니다. `dooray-agent login --token <TOKEN> --base-url <URL>` 로 먼저 등록하세요.",
      ExitCode.Config,
    );
  }
  return config;
}

/**
 * 설정을 저장한다. 부분 저장 = 기존 값과 병합한다 —
 * 지정하지 않은 필드(선택 메일 설정 등)는 그대로 보존한다.
 *
 * 파일 권한 하드닝:
 * - 디렉터리를 0o700 으로, 파일을 0o600 으로 생성한다.
 * - writeFile 의 mode 는 기존 파일에 적용되지 않으므로, 쓰기 후
 *   명시적 chmod 로 신규·기존 파일 모두 0o600/0o700 으로 수렴시킨다(멱등).
 * - chmod 는 POSIX 한정 best-effort: 미지원 플랫폼(Windows 등)에서 던지는
 *   에러는 조용히 무시한다. mkdir/writeFile 실패는 여전히 버블한다.
 */
export async function saveConfig(next: Partial<Credentials>): Promise<void> {
  const current = await loadRawConfig();
  const merged: Partial<Credentials> = { ...current, ...next };
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    await chmod(CONFIG_FILE, 0o600);
    await chmod(CONFIG_DIR, 0o700);
  } catch {
    // POSIX 미지원 플랫폼(예: Windows)에서 chmod 가 실패해도 저장은 성공으로 유지.
  }
}
