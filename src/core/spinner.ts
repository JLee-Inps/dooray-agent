// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import ora, { type Ora } from "ora";

let active: Ora | null = null;
let muted = false;

/** --json/--quiet 모드에서는 스피너를 꺼 stdout 오염을 막는다. */
export function muteSpinner(value: boolean): void {
  muted = value;
}

export function startSpinner(text: string): void {
  if (muted) return;
  active = ora({ text, stream: process.stderr }).start();
}

export function stopSpinner(ok = true, text?: string): void {
  if (!active) return;
  if (ok) active.succeed(text);
  else active.fail(text);
  active = null;
}
