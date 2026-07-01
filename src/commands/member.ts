// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import { createClient } from "../core/session";
import { render, type OutputMode } from "../core/output";
import { startSpinner, stopSpinner } from "../core/spinner";
import { AppError, ExitCode } from "../core/errors";
import type { MemberSearchHit } from "../dooray/types";

/** 멤버 명령 그룹: get, search. */
export function memberCommand(): Command {
  const member = new Command("member").description("멤버 명령");

  const get = new Command("get")
    .description("멤버 조회")
    .argument("<member-id>", "멤버 ID")
    .action(async (memberId: string) => {
      const mode = get.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("멤버 조회 중...");
      const found = await client.getMember(memberId);
      stopSpinner();
      render(mode, {
        table: memberTable([found]),
        json: found,
        ids: [found.id],
      });
    });

  const search = new Command("search")
    .description("멤버 검색 (이메일 또는 이름)")
    .option("--email <e>", "이메일 주소")
    .option("--name <n>", "이름")
    .action(async (opts: { email?: string; name?: string }) => {
      const mode = search.optsWithGlobals() as OutputMode;
      if (!opts.email && !opts.name) {
        throw new AppError(
          "--email 또는 --name 중 하나를 지정하세요.",
          ExitCode.Usage,
        );
      }
      const client = await createClient();
      startSpinner("멤버 검색 중...");
      const hits = await client.searchMembers(
        opts.email
          ? { externalEmailAddresses: opts.email }
          : { name: opts.name },
      );
      stopSpinner();
      render(mode, {
        table: memberTable(hits),
        json: hits,
        ids: hits.map((m) => m.id),
      });
    });

  member.addCommand(get);
  member.addCommand(search);
  return member;
}

function memberTable(hits: MemberSearchHit[]) {
  return {
    columns: ["id", "name", "email"],
    rows: hits.map((m) => [m.id, m.name, m.externalEmailAddress ?? ""]),
  };
}
