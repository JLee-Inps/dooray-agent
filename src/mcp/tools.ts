// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { z, type ZodTypeAny } from "zod";
import type { DoorayClient } from "../dooray/client";
import { AppError, ExitCode } from "../core/errors";
import { resolveProjectId, resolveWikiId } from "../resolve/project";
import { resolveWorkflowId, findClosedWorkflowId } from "../resolve/workflow";

/** 마크다운 MIME 타입 — CLI 와 동일 값. */
const MARKDOWN = "text/x-markdown";

/** MCP 툴 정의. handler 는 순수 데이터를 반환하고 serialize/wrap 은 serve.ts 가 담당한다. */
export interface ToolDef {
  name: string;
  description: string;
  /** zod raw shape: { field: z.string(), ... }. 선택 필드는 .optional(). */
  inputSchema: Record<string, ZodTypeAny>;
  /** 코어만 호출. render/reportWrite/스피너 금지. */
  handler: (client: DoorayClient, args: unknown) => Promise<unknown>;
}

export const tools: ToolDef[] = [
  // ── 1. dooray_whoami ────────────────────────────────────────────────
  {
    name: "dooray_whoami",
    description: "로그인한 사용자 정보(id, name, tenantId)를 조회한다.",
    inputSchema: {},
    handler: async (client) => client.getMe(),
  },

  // ── 2. dooray_project_list ──────────────────────────────────────────
  {
    name: "dooray_project_list",
    description: "내가 속한 프로젝트 목록을 조회한다.",
    inputSchema: {},
    handler: async (client) => client.listProjects(),
  },

  // ── 3. dooray_member_search ─────────────────────────────────────────
  {
    name: "dooray_member_search",
    description:
      "멤버를 이메일 또는 이름으로 검색한다. email, name 중 하나 이상 필수.",
    inputSchema: {
      email: z.string().optional(),
      name: z.string().optional(),
    },
    handler: async (client, args) => {
      const { email, name } = args as { email?: string; name?: string };
      if (!email && !name) {
        throw new AppError(
          "email 또는 name 중 하나를 지정하세요.",
          ExitCode.Usage,
        );
      }
      return client.searchMembers(
        email ? { externalEmailAddresses: email } : { name },
      );
    },
  },

  // ── 4. dooray_post_list ─────────────────────────────────────────────
  {
    name: "dooray_post_list",
    description:
      "업무 목록을 최신순으로 조회한다. page 기본 0, size 기본 20.",
    inputSchema: {
      project: z.string(),
      page: z.number().optional(),
      size: z.number().optional(),
    },
    handler: async (client, args) => {
      const { project, page, size } = args as {
        project: string;
        page?: number;
        size?: number;
      };
      const pid = await resolveProjectId(client, project);
      const { items } = await client.listPosts(pid, {
        page: page ?? 0,
        size: size ?? 20,
        order: "-createdAt",
      });
      return items;
    },
  },

  // ── 5. dooray_post_get ──────────────────────────────────────────────
  {
    name: "dooray_post_get",
    description: "업무 상세(본문 포함)를 조회한다.",
    inputSchema: {
      project: z.string(),
      postId: z.string(),
    },
    handler: async (client, args) => {
      const { project, postId } = args as { project: string; postId: string };
      const pid = await resolveProjectId(client, project);
      return client.getPost(pid, postId);
    },
  },

  // ── 6. dooray_post_create ───────────────────────────────────────────
  {
    name: "dooray_post_create",
    description: "업무를 생성한다. body 기본값은 빈 문자열.",
    inputSchema: {
      project: z.string(),
      title: z.string(),
      body: z.string().optional(),
    },
    handler: async (client, args) => {
      const { project, title, body } = args as {
        project: string;
        title: string;
        body?: string;
      };
      const pid = await resolveProjectId(client, project);
      const result = await client.createPost(pid, {
        subject: title,
        body: { mimeType: MARKDOWN, content: body ?? "" },
      });
      return { postId: result.id, status: "created" };
    },
  },

  // ── 7. dooray_post_edit ─────────────────────────────────────────────
  {
    name: "dooray_post_edit",
    description:
      "업무를 수정한다(부분 수정). 지정하지 않은 필드는 현재 값을 유지한다.",
    inputSchema: {
      project: z.string(),
      postId: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
    },
    handler: async (client, args) => {
      const { project, postId, title, body } = args as {
        project: string;
        postId: string;
        title?: string;
        body?: string;
      };
      const pid = await resolveProjectId(client, project);
      const current = await client.getPost(pid, postId);
      await client.updatePost(pid, postId, {
        subject: title ?? current.subject,
        body: {
          mimeType: MARKDOWN,
          content: body ?? current.body?.content ?? "",
        },
      });
      return { postId, status: "updated" };
    },
  },

  // ── 8. dooray_post_done ─────────────────────────────────────────────
  {
    name: "dooray_post_done",
    description:
      "업무를 완료(closed) 처리한다. closed 클래스 워크플로를 찾아 전이한다.",
    inputSchema: {
      project: z.string(),
      postId: z.string(),
    },
    handler: async (client, args) => {
      const { project, postId } = args as { project: string; postId: string };
      const pid = await resolveProjectId(client, project);
      const wfId = await findClosedWorkflowId(client, pid);
      await client.setPostWorkflow(pid, postId, wfId);
      return { postId, status: "done" };
    },
  },

  // ── 9. dooray_post_workflow ─────────────────────────────────────────
  {
    name: "dooray_post_workflow",
    description: "업무 워크플로를 지정한 워크플로로 전이한다.",
    inputSchema: {
      project: z.string(),
      postId: z.string(),
      workflow: z.string(),
    },
    handler: async (client, args) => {
      const { project, postId, workflow } = args as {
        project: string;
        postId: string;
        workflow: string;
      };
      const pid = await resolveProjectId(client, project);
      const wfId = await resolveWorkflowId(client, pid, workflow);
      await client.setPostWorkflow(pid, postId, wfId);
      return { postId, workflow, status: "updated" };
    },
  },

  // ── 10. dooray_post_search ──────────────────────────────────────────
  {
    name: "dooray_post_search",
    description: "업무를 키워드로 검색한다.",
    inputSchema: {
      project: z.string(),
      keyword: z.string(),
    },
    handler: async (client, args) => {
      const { project, keyword } = args as { project: string; keyword: string };
      const pid = await resolveProjectId(client, project);
      const { items } = await client.listPosts(pid, {
        subjects: keyword,
        order: "-createdAt",
      });
      return items;
    },
  },

  // ── 11. dooray_post_comment_list ────────────────────────────────────
  {
    name: "dooray_post_comment_list",
    description: "업무 댓글 목록을 조회한다.",
    inputSchema: {
      project: z.string(),
      postId: z.string(),
    },
    handler: async (client, args) => {
      const { project, postId } = args as { project: string; postId: string };
      const pid = await resolveProjectId(client, project);
      const { items } = await client.listPostComments(pid, postId);
      return items;
    },
  },

  // ── 12. dooray_post_comment_add ─────────────────────────────────────
  {
    name: "dooray_post_comment_add",
    description: "업무에 댓글을 추가한다. 본문은 마크다운.",
    inputSchema: {
      project: z.string(),
      postId: z.string(),
      body: z.string(),
    },
    handler: async (client, args) => {
      const { project, postId, body } = args as {
        project: string;
        postId: string;
        body: string;
      };
      const pid = await resolveProjectId(client, project);
      const result = await client.createPostComment(pid, postId, {
        body: { mimeType: MARKDOWN, content: body },
      });
      return { commentId: result.id, status: "created" };
    },
  },

  // ── 13. dooray_wiki_pages ───────────────────────────────────────────
  {
    name: "dooray_wiki_pages",
    description: "위키 페이지 목록을 조회한다.",
    inputSchema: {
      project: z.string(),
    },
    handler: async (client, args) => {
      const { project } = args as { project: string };
      const wikiId = await resolveWikiId(client, project);
      const { items } = await client.listWikiPages(wikiId);
      return items;
    },
  },

  // ── 14. dooray_wiki_page_get ────────────────────────────────────────
  {
    name: "dooray_wiki_page_get",
    description: "위키 페이지 상세(본문 포함)를 조회한다.",
    inputSchema: {
      project: z.string(),
      pageId: z.string(),
    },
    handler: async (client, args) => {
      const { project, pageId } = args as { project: string; pageId: string };
      const wikiId = await resolveWikiId(client, project);
      return client.getWikiPage(wikiId, pageId);
    },
  },

  // ── 15. dooray_wiki_page_create ─────────────────────────────────────
  {
    name: "dooray_wiki_page_create",
    description:
      "위키 페이지를 생성한다. body 기본값은 빈 문자열. parent 는 부모 페이지 ID(선택).",
    inputSchema: {
      project: z.string(),
      title: z.string(),
      body: z.string().optional(),
      parent: z.string().optional(),
    },
    handler: async (client, args) => {
      const { project, title, body, parent } = args as {
        project: string;
        title: string;
        body?: string;
        parent?: string;
      };
      const wikiId = await resolveWikiId(client, project);
      const result = await client.createWikiPage(wikiId, {
        subject: title,
        body: { mimeType: MARKDOWN, content: body ?? "" },
        parentPageId: parent,
      });
      return { pageId: result.id, status: "created" };
    },
  },

  // ── 16. dooray_wiki_page_edit ───────────────────────────────────────
  {
    name: "dooray_wiki_page_edit",
    description:
      "위키 페이지를 수정한다(부분 수정). 지정하지 않은 필드는 현재 값을 유지한다.",
    inputSchema: {
      project: z.string(),
      pageId: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
    },
    handler: async (client, args) => {
      const { project, pageId, title, body } = args as {
        project: string;
        pageId: string;
        title?: string;
        body?: string;
      };
      const wikiId = await resolveWikiId(client, project);
      const current = await client.getWikiPage(wikiId, pageId);
      await client.updateWikiPage(wikiId, pageId, {
        subject: title ?? current.subject,
        body: {
          mimeType: MARKDOWN,
          content: body ?? current.body?.content ?? "",
        },
      });
      return { pageId, status: "updated" };
    },
  },

  // ── 17. dooray_wiki_page_delete ─────────────────────────────────────
  {
    name: "dooray_wiki_page_delete",
    description: "위키 페이지를 삭제한다.",
    inputSchema: {
      project: z.string(),
      pageId: z.string(),
    },
    handler: async (client, args) => {
      const { project, pageId } = args as { project: string; pageId: string };
      const wikiId = await resolveWikiId(client, project);
      await client.deleteWikiPage(wikiId, pageId);
      return { pageId, status: "deleted" };
    },
  },

  // ── 18. dooray_wiki_comment_add ─────────────────────────────────────
  {
    name: "dooray_wiki_comment_add",
    description:
      "위키 페이지에 댓글을 추가한다. 위키 댓글은 mimeType 없이 content 만 전송한다.",
    inputSchema: {
      project: z.string(),
      pageId: z.string(),
      body: z.string(),
    },
    handler: async (client, args) => {
      const { project, pageId, body } = args as {
        project: string;
        pageId: string;
        body: string;
      };
      const wikiId = await resolveWikiId(client, project);
      const result = await client.createWikiComment(wikiId, pageId, {
        body: { content: body },
      });
      return { commentId: result.id, status: "created" };
    },
  },
];
