// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { collect } from "./capabilities";

interface CommandInfo {
  path: string;
  description: string;
  arguments: { name: string; required: boolean; description: string }[];
  options: { flags: string; description: string }[];
}

function buildRoot(): Command {
  const root = new Command("dra");
  const post = new Command("post").description("업무");
  post
    .command("get")
    .description("업무 조회")
    .argument("<projectId>", "프로젝트")
    .argument("[postId]", "업무 번호")
    .option("--json", "JSON 출력");
  root.addCommand(post);
  return root;
}

describe("collect", () => {
  it("중첩 명령을 경로와 함께 평면화한다", () => {
    const out: CommandInfo[] = [];
    collect(buildRoot(), "", out);
    const paths = out.map((info) => info.path);
    expect(paths).toContain("post");
    expect(paths).toContain("post get");
  });

  it("인자의 required/이름/설명을 담는다", () => {
    const out: CommandInfo[] = [];
    collect(buildRoot(), "", out);
    const get = out.find((info) => info.path === "post get");
    expect(get?.arguments).toEqual([
      { name: "projectId", required: true, description: "프로젝트" },
      { name: "postId", required: false, description: "업무 번호" },
    ]);
  });

  it("옵션 flags/설명을 담는다", () => {
    const out: CommandInfo[] = [];
    collect(buildRoot(), "", out);
    const get = out.find((info) => info.path === "post get");
    expect(get?.options).toContainEqual({
      flags: "--json",
      description: "JSON 출력",
    });
  });

  it("help 하위 명령은 건너뛴다", () => {
    const root = new Command("dra");
    root.command("real").description("실제");
    // commander 는 기본적으로 help 명령을 노출한다.
    const out: CommandInfo[] = [];
    collect(root, "", out);
    expect(out.every((info) => info.path !== "help")).toBe(true);
  });
});
