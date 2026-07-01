// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import Table from "cli-table3";

/** 전역 출력 플래그. commander 의 전역 옵션에서 주입된다. */
export interface OutputMode {
  json?: boolean;
  quiet?: boolean;
}

export interface TableView {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * 조회 결과의 3-모드 출력.
 * - json  → 원자료(raw)
 * - quiet → 식별자 목록(파이프용)
 * - 기본  → 사람이 읽는 표
 */
export function render(
  mode: OutputMode,
  view: { table: TableView; json: unknown; ids: string[] },
): void {
  if (mode.json) return writeJson(view.json);
  if (mode.quiet) return writeLines(view.ids);
  writeTable(view.table);
}

/**
 * 쓰기(생성·수정·삭제·상태변경) 결과의 3-모드 출력.
 * 자동화가 쓰기 성공을 프로그램적으로 확인·체이닝할 수 있게 한다.
 */
export function reportWrite(
  mode: OutputMode,
  result: { json: unknown; id: string; message: string },
): void {
  if (mode.json) return writeJson(result.json);
  if (mode.quiet) return writeLines([result.id]);
  process.stdout.write(result.message + "\n");
}

export function writeJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function writeLines(lines: string[]): void {
  if (lines.length > 0) process.stdout.write(lines.join("\n") + "\n");
}

export function writeTable(view: TableView): void {
  const table = new Table({ head: view.columns });
  for (const row of view.rows) table.push(row.map((cell) => String(cell)));
  process.stdout.write(table.toString() + "\n");
}
