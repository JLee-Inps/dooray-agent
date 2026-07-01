// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import { createClient } from "../core/session";
import { render, reportWrite, type OutputMode } from "../core/output";
import { startSpinner, stopSpinner } from "../core/spinner";

const MARKDOWN = "text/x-markdown";

/** 기본 이벤트 조회 범위: 지금 ~ +7일 (RFC3339). */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { from: now.toISOString(), to: week.toISOString() };
}

/** 캘린더 명령 그룹: list, events, create. */
export function calendarCommand(): Command {
  const calendar = new Command("calendar").description("캘린더 명령");

  const list = new Command("list")
    .description("내 캘린더 목록")
    .action(async () => {
      const mode = list.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("캘린더 조회 중...");
      const items = await client.listCalendars();
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "name"],
          rows: items.map((c) => [c.id, c.name ?? ""]),
        },
        json: items,
        ids: items.map((c) => c.id),
      });
    });

  const events = new Command("events")
    .description("이벤트 목록 (기본: 오늘 ~ +7일, 전체 캘린더)")
    .option("--from <rfc3339>", "시작 시각 (RFC3339)")
    .option("--to <rfc3339>", "종료 시각 (RFC3339)")
    .action(async (opts: { from?: string; to?: string }) => {
      const mode = events.optsWithGlobals() as OutputMode;
      const client = await createClient();
      const range = defaultRange();
      startSpinner("이벤트 조회 중...");
      const items = await client.listEvents({
        timeMin: opts.from ?? range.from,
        timeMax: opts.to ?? range.to,
      });
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "subject", "startedAt", "endedAt"],
          rows: items.map((e) => [
            e.id,
            e.subject,
            e.startedAt ?? "",
            e.endedAt ?? "",
          ]),
        },
        json: items,
        ids: items.map((e) => e.id),
      });
    });

  const create = new Command("create")
    .description("이벤트 생성")
    .requiredOption(
      "--calendar <calendarId>",
      "캘린더 ID (calendar list 로 확인)",
    )
    .requiredOption("--subject <s>", "일정 제목")
    .requiredOption("--start <rfc3339>", "시작 시각 (RFC3339)")
    .requiredOption("--end <rfc3339>", "종료 시각 (RFC3339)")
    .option("--body <text>", "본문(마크다운)")
    .option("--all-day", "종일 일정")
    .action(
      async (opts: {
        calendar: string;
        subject: string;
        start: string;
        end: string;
        body?: string;
        allDay?: boolean;
      }) => {
        const mode = create.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("이벤트 생성 중...");
        const { id } = await client.createEvent(opts.calendar, {
          subject: opts.subject,
          startedAt: opts.start,
          endedAt: opts.end,
          ...(opts.body
            ? { body: { mimeType: MARKDOWN, content: opts.body } }
            : {}),
          ...(opts.allDay ? { wholeDayFlag: true } : {}),
        });
        stopSpinner();
        reportWrite(mode, {
          json: { eventId: id, status: "created" },
          id,
          message: `이벤트가 생성되었습니다: ${id}`,
        });
      },
    );

  const get = new Command("get")
    .description("이벤트 조회")
    .argument("<event-id>", "이벤트 ID")
    .requiredOption(
      "--calendar <calendarId>",
      "캘린더 ID (calendar list 로 확인)",
    )
    .action(async (eventId: string, opts: { calendar: string }) => {
      const mode = get.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("이벤트 조회 중...");
      const event = await client.getEvent(opts.calendar, eventId);
      stopSpinner();
      render(mode, {
        table: {
          columns: ["field", "value"],
          rows: [
            ["id", event.id],
            ["subject", event.subject],
            ["startedAt", event.startedAt ?? ""],
            ["endedAt", event.endedAt ?? ""],
          ],
        },
        json: event,
        ids: [event.id],
      });
    });

  const edit = new Command("edit")
    .description("이벤트 수정 (부분 — 지정 안 한 필드는 현재 값 유지)")
    .argument("<event-id>", "이벤트 ID")
    .requiredOption("--calendar <calendarId>", "캘린더 ID")
    .option("--subject <s>", "새 제목")
    .option("--start <rfc3339>", "새 시작 시각 (RFC3339)")
    .option("--end <rfc3339>", "새 종료 시각 (RFC3339)")
    .option("--body <text>", "새 본문(마크다운)")
    .action(
      async (
        eventId: string,
        opts: {
          calendar: string;
          subject?: string;
          start?: string;
          end?: string;
          body?: string;
        },
      ) => {
        const mode = edit.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("이벤트 수정 중...");
        const current = await client.getEvent(opts.calendar, eventId);
        await client.updateEvent(opts.calendar, eventId, {
          subject: opts.subject ?? current.subject,
          startedAt: opts.start ?? current.startedAt ?? "",
          endedAt: opts.end ?? current.endedAt ?? "",
          ...(opts.body
            ? { body: { mimeType: MARKDOWN, content: opts.body } }
            : {}),
        });
        stopSpinner();
        reportWrite(mode, {
          json: { eventId, status: "updated" },
          id: eventId,
          message: `이벤트가 수정되었습니다: ${eventId}`,
        });
      },
    );

  const del = new Command("delete")
    .description("이벤트 삭제")
    .argument("<event-id>", "이벤트 ID")
    .requiredOption("--calendar <calendarId>", "캘린더 ID")
    .action(async (eventId: string, opts: { calendar: string }) => {
      const mode = del.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("이벤트 삭제 중...");
      await client.deleteEvent(opts.calendar, eventId);
      stopSpinner();
      reportWrite(mode, {
        json: { eventId, status: "deleted" },
        id: eventId,
        message: `이벤트가 삭제되었습니다: ${eventId}`,
      });
    });

  calendar.addCommand(list);
  calendar.addCommand(events);
  calendar.addCommand(create);
  calendar.addCommand(get);
  calendar.addCommand(edit);
  calendar.addCommand(del);
  return calendar;
}
