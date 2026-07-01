// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import { createClient } from "../core/session";
import { render, reportWrite, type OutputMode } from "../core/output";
import { startSpinner, stopSpinner } from "../core/spinner";

/** 메신저 명령 그룹 (실험적): channels, send. */
export function messengerCommand(): Command {
  const messenger = new Command("messenger").description(
    "메신저 명령 (실험적)",
  );

  const channels = new Command("channels")
    .description("채널 목록 (실험적)")
    .action(async () => {
      const mode = channels.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("채널 조회 중...");
      const items = await client.listChannels();
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "title"],
          rows: items.map((c) => [c.id, c.title ?? ""]),
        },
        json: items,
        ids: items.map((c) => c.id),
      });
    });

  const send = new Command("send")
    .description("메시지 전송 (실험적)")
    .requiredOption(
      "--channel <channelId>",
      "채널 ID (messenger channels 로 확인)",
    )
    .requiredOption("--text <msg>", "보낼 메시지")
    .action(async (opts: { channel: string; text: string }) => {
      const mode = send.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("메시지 전송 중...");
      const { id } = await client.sendMessage(opts.channel, opts.text);
      stopSpinner();
      reportWrite(mode, {
        json: { messageId: id, status: "sent" },
        id,
        message: `메시지를 전송했습니다: ${id}`,
      });
    });

  messenger.addCommand(channels);
  messenger.addCommand(send);
  return messenger;
}
