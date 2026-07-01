// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import { requireConfig } from "../core/config";
import { render, reportWrite, type OutputMode } from "../core/output";
import { startSpinner, stopSpinner } from "../core/spinner";
import { listMail, getMail, sendMail } from "../dooray/mail";

/** 메일 명령 그룹: list, get, send. IMAP/SMTP 설정이 필요하다. */
export function mailCommand(): Command {
  const mail = new Command("mail").description("메일 명령 (IMAP/SMTP)");

  const list = new Command("list")
    .description("최근 메일 목록 (최신순)")
    .option("--mailbox <name>", "메일함", "INBOX")
    .option("--limit <n>", "가져올 개수", "20")
    .action(async (opts: { mailbox: string; limit: string }) => {
      const mode = list.optsWithGlobals() as OutputMode;
      const config = await requireConfig();
      startSpinner("메일 조회 중...");
      const items = await listMail(config, {
        mailbox: opts.mailbox,
        limit: Number(opts.limit),
      });
      stopSpinner();
      render(mode, {
        table: {
          columns: ["uid", "from", "subject", "date"],
          rows: items.map((m) => [m.uid, m.from, m.subject, m.date]),
        },
        json: items,
        ids: items.map((m) => String(m.uid)),
      });
    });

  const get = new Command("get")
    .description("메일 조회 (본문 포함)")
    .argument("<uid>", "메일 UID")
    .option("--mailbox <name>", "메일함", "INBOX")
    .action(async (uid: string, opts: { mailbox: string }) => {
      const mode = get.optsWithGlobals() as OutputMode;
      const config = await requireConfig();
      startSpinner("메일 조회 중...");
      const msg = await getMail(config, uid, opts.mailbox);
      stopSpinner();
      render(mode, {
        table: {
          columns: ["field", "value"],
          rows: [
            ["uid", msg.uid],
            ["from", msg.from],
            ["to", msg.to],
            ["subject", msg.subject],
            ["date", msg.date],
          ],
        },
        json: msg,
        ids: [String(msg.uid)],
      });
      if (!mode.json && !mode.quiet && msg.text) {
        process.stdout.write("\n" + msg.text + "\n");
      }
    });

  const send = new Command("send")
    .description("메일 보내기")
    .requiredOption("--to <address>", "받는 사람")
    .requiredOption("--subject <text>", "제목")
    .requiredOption("--body <text>", "본문")
    .action(async (opts: { to: string; subject: string; body: string }) => {
      const mode = send.optsWithGlobals() as OutputMode;
      const config = await requireConfig();
      startSpinner("메일 발송 중...");
      const { messageId } = await sendMail(config, {
        to: opts.to,
        subject: opts.subject,
        text: opts.body,
      });
      stopSpinner();
      reportWrite(mode, {
        json: { messageId, status: "sent" },
        id: messageId,
        message: `메일을 보냈습니다: ${messageId}`,
      });
    });

  mail.addCommand(list);
  mail.addCommand(get);
  mail.addCommand(send);
  return mail;
}
