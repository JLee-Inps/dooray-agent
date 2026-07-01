// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { AppError, ExitCode } from "../core/errors";
import type { Credentials } from "../core/config";

/** 메일 목록 한 통의 헤더 요약. */
export interface MailHeader {
  uid: number;
  subject: string;
  from: string;
  date: string;
}

/** 본문까지 파싱한 단일 메일. */
export interface MailMessage extends MailHeader {
  to: string;
  text: string;
}

interface ImapCreds {
  imapHost: string;
  mailUser: string;
  mailPassword: string;
}

interface SmtpCreds {
  smtpHost: string;
  mailUser: string;
  mailPassword: string;
}

/** IMAP 설정을 확인한다. 없으면 Config 에러. */
export function requireImap(config: Credentials): ImapCreds {
  const { imapHost, mailUser, mailPassword } = config;
  if (!imapHost || !mailUser || !mailPassword) {
    throw new AppError(
      "IMAP 설정이 없습니다. `config set imap-host/mail-user/mail-password` 로 등록하세요.",
      ExitCode.Config,
    );
  }
  return { imapHost, mailUser, mailPassword };
}

/** SMTP 설정을 확인한다. 없으면 Config 에러. */
export function requireSmtp(config: Credentials): SmtpCreds {
  const { smtpHost, mailUser, mailPassword } = config;
  if (!smtpHost || !mailUser || !mailPassword) {
    throw new AppError(
      "SMTP 설정이 없습니다. `config set smtp-host/mail-user/mail-password` 로 등록하세요.",
      ExitCode.Config,
    );
  }
  return { smtpHost, mailUser, mailPassword };
}

/** 주소 목록을 `이름 <주소>` 문자열로 좁힌다. */
export function formatAddresses(
  addresses: { name?: string; address?: string }[] | undefined,
): string {
  if (!addresses || addresses.length === 0) return "";
  return addresses
    .map((a) => (a.name ? `${a.name} <${a.address ?? ""}>` : (a.address ?? "")))
    .filter((s) => s.length > 0)
    .join(", ");
}

/** IMAP 클라이언트를 만든다(TLS). */
function imapClient(creds: ImapCreds): ImapFlow {
  return new ImapFlow({
    host: creds.imapHost,
    port: 993,
    secure: true,
    auth: { user: creds.mailUser, pass: creds.mailPassword },
    logger: false,
  });
}

/** IMAP/SMTP 예외를 AppError(Api) 로 정규화한다. */
function normalizeMailError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AppError(`메일 서버 오류: ${message}`, ExitCode.Api);
}

/** 최근 N 통의 헤더를 최신순으로 가져온다. */
export async function listMail(
  config: Credentials,
  opts: { mailbox: string; limit: number },
): Promise<MailHeader[]> {
  const creds = requireImap(config);
  const client = imapClient(creds);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(opts.mailbox);
    try {
      const box = client.mailbox;
      const total = box ? box.exists : 0;
      if (total === 0) return [];
      const start = Math.max(1, total - opts.limit + 1);
      const headers: MailHeader[] = [];
      for await (const msg of client.fetch(`${start}:*`, { envelope: true })) {
        headers.push({
          uid: msg.uid,
          subject: msg.envelope?.subject ?? "",
          from: formatAddresses(msg.envelope?.from),
          date: msg.envelope?.date ? msg.envelope.date.toISOString() : "",
        });
      }
      return headers.reverse();
    } finally {
      lock.release();
    }
  } catch (error) {
    throw normalizeMailError(error);
  } finally {
    await client.logout().catch(() => {});
  }
}

/** UID 로 단일 메일을 가져와 본문까지 파싱한다. */
export async function getMail(
  config: Credentials,
  uid: string,
  mailbox = "INBOX",
): Promise<MailMessage> {
  const creds = requireImap(config);
  const client = imapClient(creds);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);
    try {
      const msg = await client.fetchOne(
        uid,
        { uid: true, source: true, envelope: true },
        { uid: true },
      );
      if (!msg || !msg.source) {
        throw new AppError(`메일을 찾을 수 없습니다: ${uid}`, ExitCode.Usage);
      }
      const parsed = await simpleParser(msg.source);
      return {
        uid: msg.uid,
        subject: msg.envelope?.subject ?? parsed.subject ?? "",
        from: formatAddresses(msg.envelope?.from),
        to: formatAddresses(msg.envelope?.to),
        date: msg.envelope?.date ? msg.envelope.date.toISOString() : "",
        text: parsed.text ?? "",
      };
    } finally {
      lock.release();
    }
  } catch (error) {
    throw normalizeMailError(error);
  } finally {
    await client.logout().catch(() => {});
  }
}

/** 메일을 보낸다(SMTP over TLS). messageId 를 돌려준다. */
export async function sendMail(
  config: Credentials,
  opts: { to: string; subject: string; text: string },
): Promise<{ messageId: string }> {
  const creds = requireSmtp(config);
  try {
    const transport = nodemailer.createTransport({
      host: creds.smtpHost,
      port: 465,
      secure: true,
      auth: { user: creds.mailUser, pass: creds.mailPassword },
    });
    const info = await transport.sendMail({
      from: creds.mailUser,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });
    return { messageId: info.messageId };
  } catch (error) {
    throw normalizeMailError(error);
  }
}
