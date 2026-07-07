// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatAddresses,
  getMail,
  listMail,
  requireImap,
  requireSmtp,
  sendMail,
} from "./mail";
import { AppError, ExitCode } from "../core/errors";
import type { Credentials } from "../core/config";

/** Fake IMAP 클라이언트 형태(connect/getMailboxLock/fetch/fetchOne/logout 스텁). */
interface FakeImapClient {
  connect: ReturnType<typeof vi.fn>;
  getMailboxLock: ReturnType<typeof vi.fn>;
  mailbox: { exists: number };
  fetch: ReturnType<typeof vi.fn>;
  fetchOne: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  lock: { release: ReturnType<typeof vi.fn> };
}

// imapflow/nodemailer/mailparser 를 모킹해 실 연결 없이 listMail/getMail/sendMail 을
// 단위테스트한다(패턴: src/mcp/tools.test.ts 의 mail 모킹). `./mail` 을 정적 import 하면
// 그 내부의 `import { ImapFlow } from "imapflow"` 가 테스트 파일의 다른 top-level 문보다
// 먼저 평가되므로, mock 팩토리가 참조할 상태는 `vi.hoisted()` 로 미리 만들어 둔다
// (vi.mock 팩토리 안에서 일반 top-level 변수를 참조하면 TDZ 로 깨진다).
const { mockImapFlowCtor, imapState } = vi.hoisted(() => {
  const state: { instance?: FakeImapClient } = {};
  const ctor = vi.fn(function ImapFlow() {
    return state.instance;
  });
  return { mockImapFlowCtor: ctor, imapState: state };
});
vi.mock("imapflow", () => ({ ImapFlow: mockImapFlowCtor }));

const { mockSimpleParser } = vi.hoisted(() => ({
  mockSimpleParser: vi.fn(),
}));
vi.mock("mailparser", () => ({ simpleParser: mockSimpleParser }));

const { mockCreateTransport } = vi.hoisted(() => ({
  mockCreateTransport: vi.fn(),
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: mockCreateTransport },
}));

/** 기본 fake IMAP 클라이언트(연결/락/로그아웃은 항상 성공). */
function makeFakeImapClient(
  overrides: Partial<FakeImapClient> = {},
): FakeImapClient {
  const lock = { release: vi.fn() };
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    getMailboxLock: vi.fn().mockResolvedValue(lock),
    mailbox: { exists: 0 },
    fetch: vi.fn(),
    fetchOne: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    lock,
    ...overrides,
  };
}

describe("formatAddresses", () => {
  it("undefined 이면 빈 문자열", () => {
    expect(formatAddresses(undefined)).toBe("");
  });

  it("빈 배열이면 빈 문자열", () => {
    expect(formatAddresses([])).toBe("");
  });

  it("이름이 있으면 `이름 <주소>` 형식", () => {
    expect(formatAddresses([{ name: "김철수", address: "kim@x.com" }])).toBe(
      "김철수 <kim@x.com>",
    );
  });

  it("이름이 없으면 주소만", () => {
    expect(formatAddresses([{ address: "kim@x.com" }])).toBe("kim@x.com");
  });

  it("여러 주소를 콤마로 합치고 빈 항목은 제외한다", () => {
    const out = formatAddresses([
      { name: "가", address: "a@x.com" },
      { address: "b@x.com" },
      {},
    ]);
    expect(out).toBe("가 <a@x.com>, b@x.com");
  });
});

const FULL: Credentials = {
  token: "t",
  baseUrl: "https://x",
  imapHost: "imap.x.com",
  smtpHost: "smtp.x.com",
  mailUser: "u",
  mailPassword: "p",
};

describe("requireImap", () => {
  it("IMAP 설정이 완전하면 자격증명을 돌려준다", () => {
    expect(requireImap(FULL)).toEqual({
      imapHost: "imap.x.com",
      mailUser: "u",
      mailPassword: "p",
    });
  });

  it("imapHost 가 없으면 Config 에러", () => {
    const partial: Credentials = { ...FULL, imapHost: undefined };
    try {
      requireImap(partial);
      expect.unreachable("throw 했어야 함");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ExitCode.Config);
    }
  });
});

describe("requireSmtp", () => {
  it("SMTP 설정이 완전하면 자격증명을 돌려준다", () => {
    expect(requireSmtp(FULL)).toEqual({
      smtpHost: "smtp.x.com",
      mailUser: "u",
      mailPassword: "p",
    });
  });

  it("mailPassword 가 없으면 Config 에러", () => {
    const partial: Credentials = { ...FULL, mailPassword: undefined };
    expect(() => requireSmtp(partial)).toThrow(AppError);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listMail (IMAP)", () => {
  it("빈 메일함(exists===0)이면 [] 을 반환하고 fetch 를 호출하지 않는다", async () => {
    const client = makeFakeImapClient({ mailbox: { exists: 0 } });
    imapState.instance = client;
    const result = await listMail(FULL, { mailbox: "INBOX", limit: 10 });
    expect(result).toEqual([]);
    expect(client.fetch).not.toHaveBeenCalled();
    expect(client.getMailboxLock).toHaveBeenCalledWith("INBOX");
    expect(client.lock.release).toHaveBeenCalledTimes(1);
    expect(client.logout).toHaveBeenCalledTimes(1);
  });

  it("정상: 최신순(reverse)으로 MailHeader[] 를 반환하고 from 을 조합한다", async () => {
    const msgs = [
      {
        uid: 1,
        envelope: {
          subject: "첫 번째",
          from: [{ name: "가", address: "a@x.com" }],
          date: new Date("2024-01-01T00:00:00Z"),
        },
      },
      {
        uid: 2,
        envelope: {
          subject: "두 번째",
          from: [{ address: "b@x.com" }],
          date: new Date("2024-01-02T00:00:00Z"),
        },
      },
    ];
    const client = makeFakeImapClient({
      mailbox: { exists: 2 },
      fetch: vi.fn().mockImplementation(async function* () {
        for (const m of msgs) yield m;
      }),
    });
    imapState.instance = client;
    const result = await listMail(FULL, { mailbox: "INBOX", limit: 10 });
    expect(result).toEqual([
      {
        uid: 2,
        subject: "두 번째",
        from: "b@x.com",
        date: "2024-01-02T00:00:00.000Z",
      },
      {
        uid: 1,
        subject: "첫 번째",
        from: "가 <a@x.com>",
        date: "2024-01-01T00:00:00.000Z",
      },
    ]);
    expect(client.fetch).toHaveBeenCalledWith("1:*", { envelope: true });
    expect(client.lock.release).toHaveBeenCalledTimes(1);
    expect(client.logout).toHaveBeenCalledTimes(1);
  });

  it("IMAP 예외는 AppError(Api) 로 정규화된다", async () => {
    const client = makeFakeImapClient();
    client.connect.mockRejectedValue(new Error("연결 거부"));
    imapState.instance = client;
    await expect(
      listMail(FULL, { mailbox: "INBOX", limit: 5 }),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.code === ExitCode.Api,
    );
  });

  it("IMAP 설정이 없으면 Config 에러(listMail 진입 경로 — 회귀 방지)", async () => {
    const partial: Credentials = { ...FULL, imapHost: undefined };
    await expect(
      listMail(partial, { mailbox: "INBOX", limit: 5 }),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.code === ExitCode.Config,
    );
  });
});

describe("getMail (IMAP)", () => {
  it("정상: fetchOne + simpleParser 로 본문까지 파싱한 MailMessage 를 반환한다", async () => {
    const client = makeFakeImapClient();
    client.fetchOne.mockResolvedValue({
      uid: 42,
      source: Buffer.from("raw mime"),
      envelope: {
        subject: "제목",
        from: [{ address: "a@b.com" }],
        to: [{ address: "c@d.com" }],
        date: new Date("2024-03-01T00:00:00Z"),
      },
    });
    imapState.instance = client;
    mockSimpleParser.mockResolvedValue({
      subject: "제목(파싱)",
      text: "본문 내용",
    });
    const result = await getMail(FULL, "42", "INBOX");
    expect(result).toEqual({
      uid: 42,
      subject: "제목",
      from: "a@b.com",
      to: "c@d.com",
      date: "2024-03-01T00:00:00.000Z",
      text: "본문 내용",
    });
    expect(client.fetchOne).toHaveBeenCalledWith(
      "42",
      { uid: true, source: true, envelope: true },
      { uid: true },
    );
  });

  it("메일 없음(fetchOne null) → AppError(Usage)", async () => {
    const client = makeFakeImapClient();
    client.fetchOne.mockResolvedValue(null);
    imapState.instance = client;
    await expect(getMail(FULL, "999")).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.code === ExitCode.Usage,
    );
  });

  it("메일 없음(source 없음) → AppError(Usage)", async () => {
    const client = makeFakeImapClient();
    client.fetchOne.mockResolvedValue({ uid: 1, source: undefined });
    imapState.instance = client;
    await expect(getMail(FULL, "1")).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.code === ExitCode.Usage,
    );
  });
});

describe("sendMail (SMTP)", () => {
  it("올바른 host/port/from/to/subject/text 로 전송하고 messageId 를 반환한다", async () => {
    const sendMailFn = vi.fn().mockResolvedValue({ messageId: "<abc@mail>" });
    mockCreateTransport.mockReturnValue({ sendMail: sendMailFn });
    const result = await sendMail(FULL, {
      to: "to@example.com",
      subject: "보고",
      text: "본문 내용",
    });
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: "smtp.x.com",
      port: 465,
      secure: true,
      auth: { user: "u", pass: "p" },
    });
    expect(sendMailFn).toHaveBeenCalledWith({
      from: "u",
      to: "to@example.com",
      subject: "보고",
      text: "본문 내용",
    });
    expect(result).toEqual({ messageId: "<abc@mail>" });
  });

  it("전송 실패 시 AppError(Api) 로 정규화된다", async () => {
    mockCreateTransport.mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error("smtp down")),
    });
    await expect(
      sendMail(FULL, { to: "a@b.com", subject: "s", text: "t" }),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.code === ExitCode.Api,
    );
  });

  it("SMTP 설정이 없으면 Config 에러(sendMail 진입 경로 — 회귀 방지)", async () => {
    const partial: Credentials = { ...FULL, smtpHost: undefined };
    await expect(
      sendMail(partial, { to: "a@b.com", subject: "s", text: "t" }),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.code === ExitCode.Config,
    );
  });
});
