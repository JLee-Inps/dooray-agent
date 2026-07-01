// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import { writeJson, writeLines, type OutputMode } from "../core/output";

interface CommandInfo {
  path: string;
  description: string;
  arguments: { name: string; required: boolean; description: string }[];
  options: { flags: string; description: string }[];
}

export function collect(
  cmd: Command,
  prefix: string,
  out: CommandInfo[],
): void {
  for (const sub of cmd.commands) {
    if (sub.name() === "help") continue;
    const path = prefix ? `${prefix} ${sub.name()}` : sub.name();
    out.push({
      path,
      description: sub.description(),
      arguments: sub.registeredArguments.map((arg) => ({
        name: arg.name(),
        required: arg.required,
        description: arg.description,
      })),
      options: sub.options.map((opt) => ({
        flags: opt.flags,
        description: opt.description,
      })),
    });
    collect(sub, path, out);
  }
}

/**
 * 에이전트 자기탐색용: 전체 명령·인자·옵션을 구조화해 출력한다.
 * 에이전트가 무엇을 할 수 있는지 런타임에 발견하게 한다.
 */
export function capabilitiesCommand(root: Command): Command {
  const capabilities = new Command("capabilities")
    .description("모든 명령·인자·옵션을 구조화해 출력 (에이전트 자기탐색)")
    .action(() => {
      const mode = capabilities.optsWithGlobals() as OutputMode;
      const infos: CommandInfo[] = [];
      collect(root, "", infos);
      if (mode.quiet) {
        writeLines(infos.map((info) => info.path));
        return;
      }
      // 에이전트 대상 명령이라 기본 출력도 JSON 이다.
      writeJson(infos);
    });
  return capabilities;
}
