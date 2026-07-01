// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import { createClient } from "../core/session";
import { render, reportWrite, type OutputMode } from "../core/output";
import { startSpinner, stopSpinner } from "../core/spinner";
import { cached, TTL } from "../core/cache";
import { resolveProjectId } from "../resolve/project";

/** 프로젝트 명령 그룹: list, tags, milestones, workflows, groups, templates, members. */
export function projectCommand(): Command {
  const project = new Command("project").description("프로젝트 명령");

  const list = new Command("list")
    .description("내가 속한 프로젝트 목록")
    .action(async () => {
      const mode = list.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("프로젝트 조회 중...");
      const projects = await client.listProjects();
      stopSpinner();
      render(mode, {
        table: {
          columns: ["code", "id"],
          rows: projects.map((p) => [p.code, p.id]),
        },
        json: projects,
        ids: projects.map((p) => p.id),
      });
    });

  const create = new Command("create")
    .description("프로젝트 생성")
    .requiredOption("--code <code>", "프로젝트 코드")
    .option("--description <d>", "프로젝트 설명")
    .option("--scope <scope>", "공개 범위 (public|private)")
    .action(
      async (opts: { code: string; description?: string; scope?: string }) => {
        const mode = create.optsWithGlobals() as OutputMode;
        const client = await createClient();
        startSpinner("프로젝트 생성 중...");
        const { id } = await client.createProject({
          code: opts.code,
          description: opts.description,
          scope: opts.scope,
        });
        stopSpinner();
        reportWrite(mode, {
          json: { projectId: id, status: "created" },
          id,
          message: `프로젝트가 생성되었습니다: ${id}`,
        });
      },
    );

  const tags = new Command("tags")
    .description("프로젝트 태그 목록")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .action(async (projectInput: string) => {
      const mode = tags.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("태그 조회 중...");
      const projectId = await resolveProjectId(client, projectInput);
      const items = await cached(`tags-${projectId}`, TTL.day, () =>
        client.listTags(projectId),
      );
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "name"],
          rows: items.map((t) => [t.id, t.name]),
        },
        json: items,
        ids: items.map((t) => t.id),
      });
    });

  const milestones = new Command("milestones")
    .description("프로젝트 마일스톤 목록")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .action(async (projectInput: string) => {
      const mode = milestones.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("마일스톤 조회 중...");
      const projectId = await resolveProjectId(client, projectInput);
      const items = await client.listMilestones(projectId);
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "name"],
          rows: items.map((m) => [m.id, m.name]),
        },
        json: items,
        ids: items.map((m) => m.id),
      });
    });

  const workflows = new Command("workflows")
    .description("프로젝트 워크플로 목록")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .action(async (projectInput: string) => {
      const mode = workflows.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("워크플로 조회 중...");
      const projectId = await resolveProjectId(client, projectInput);
      const items = await client.listWorkflows(projectId);
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "name", "class"],
          rows: items.map((w) => [w.id, w.name, w.class]),
        },
        json: items,
        ids: items.map((w) => w.id),
      });
    });

  const groups = new Command("groups")
    .description("프로젝트 멤버 그룹 목록")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .action(async (projectInput: string) => {
      const mode = groups.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("멤버 그룹 조회 중...");
      const projectId = await resolveProjectId(client, projectInput);
      const items = await client.listMemberGroups(projectId);
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "code"],
          rows: items.map((g) => [g.id, g.code ?? ""]),
        },
        json: items,
        ids: items.map((g) => g.id),
      });
    });

  const templates = new Command("templates")
    .description("프로젝트 템플릿 목록")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .action(async (projectInput: string) => {
      const mode = templates.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("템플릿 조회 중...");
      const projectId = await resolveProjectId(client, projectInput);
      const items = await client.listTemplates(projectId);
      stopSpinner();
      render(mode, {
        table: {
          columns: ["id", "templateName"],
          rows: items.map((t) => [t.id, t.templateName]),
        },
        json: items,
        ids: items.map((t) => t.id),
      });
    });

  const members = new Command("members")
    .description("프로젝트 멤버 목록")
    .argument("<project>", "프로젝트 코드 또는 ID")
    .action(async (projectInput: string) => {
      const mode = members.optsWithGlobals() as OutputMode;
      const client = await createClient();
      startSpinner("멤버 조회 중...");
      const projectId = await resolveProjectId(client, projectInput);
      const items = await cached(`members-${projectId}`, TTL.hour, () =>
        client.listProjectMembers(projectId),
      );
      stopSpinner();
      render(mode, {
        table: {
          columns: ["organizationMemberId", "name"],
          rows: items.map((m) => [m.organizationMemberId, m.name]),
        },
        json: items,
        ids: items.map((m) => m.organizationMemberId),
      });
    });

  project.addCommand(list);
  project.addCommand(create);
  project.addCommand(tags);
  project.addCommand(milestones);
  project.addCommand(workflows);
  project.addCommand(groups);
  project.addCommand(templates);
  project.addCommand(members);
  return project;
}
