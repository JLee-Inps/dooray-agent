// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { z, type ZodTypeAny } from "zod";
import type { DoorayClient } from "../dooray/client";
import type { Credentials } from "../core/config";
import { AppError, ExitCode } from "../core/errors";
import { resolveProjectId, resolveWikiId } from "../resolve/project";
import { resolveWorkflowId, findClosedWorkflowId } from "../resolve/workflow";
import { listMail, getMail, sendMail } from "../dooray/mail";

/** 마크다운 MIME 타입 — CLI 와 동일 값. */
const MARKDOWN = "text/x-markdown";

/**
 * 핸들러 컨텍스트. 캘린더·기존 툴은 getClient(), 메일 툴은 getConfig() 를 사용.
 * 각각 lazy 메모이즈 — 최초 호출 시에만 팩토리를 실행한다.
 */
export interface ToolContext {
  getClient(): Promise<DoorayClient>;
  getConfig(): Promise<Credentials>;
}

/** MCP 툴 정의. handler 는 순수 데이터를 반환하고 serialize/wrap 은 serve.ts 가 담당한다. */
export interface ToolDef {
  name: string;
  description: string;
  /** zod raw shape: { field: z.string(), ... }. 선택 필드는 .optional(). */
  inputSchema: Record<string, ZodTypeAny>;
  /** 코어만 호출. render/reportWrite/스피너 금지. */
  handler: (ctx: ToolContext, args: unknown) => Promise<unknown>;
}

/** 캘린더 기본 이벤트 조회 범위: 지금 ~ +7일 (RFC3339). CLI calendar.ts 와 동일 로직. */
function defaultRange(): { timeMin: string; timeMax: string } {
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { timeMin: now.toISOString(), timeMax: week.toISOString() };
}

export const tools: ToolDef[] = [
  // ── 1. dooray_whoami ────────────────────────────────────────────────
  {
    name: "dooray_whoami",
    description: "로그인한 사용자 정보(id, name, tenantId)를 조회한다.",
    inputSchema: {},
    handler: async (ctx) => (await ctx.getClient()).getMe(),
  },

  // ── 2. dooray_project_list ──────────────────────────────────────────
  {
    name: "dooray_project_list",
    description: "내가 속한 프로젝트 목록을 조회한다.",
    inputSchema: {},
    handler: async (ctx) => (await ctx.getClient()).listProjects(),
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
    handler: async (ctx, args) => {
      const { email, name } = args as { email?: string; name?: string };
      if (!email && !name) {
        throw new AppError(
          "email 또는 name 중 하나를 지정하세요.",
          ExitCode.Usage,
        );
      }
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project, page, size } = args as {
        project: string;
        page?: number;
        size?: number;
      };
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project, postId } = args as { project: string; postId: string };
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project, title, body } = args as {
        project: string;
        title: string;
        body?: string;
      };
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project, postId, title, body } = args as {
        project: string;
        postId: string;
        title?: string;
        body?: string;
      };
      const client = await ctx.getClient();
      const pid = await resolveProjectId(client, project);
      const current = await client.getPost(pid, postId);
      // 입력 표면에 tag/cc/to 가 없으므로 태그·담당자는 항상 current 를 read-back
      // 재공급한다(GET tags:[{id}] → PUT tagIdList:[id] 매핑). milestone/workflow
      // 는 보존 제외(known limitation — PUT 필드명 미확인).
      const tagIdList = current.tags?.map((t) => t.id);
      await client.updatePost(pid, postId, {
        subject: title ?? current.subject,
        body: {
          mimeType: MARKDOWN,
          content: body ?? current.body?.content ?? "",
        },
        ...(tagIdList && tagIdList.length > 0 ? { tagIdList } : {}),
        ...(current.users ? { users: current.users } : {}),
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
    handler: async (ctx, args) => {
      const { project, postId } = args as { project: string; postId: string };
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project, postId, workflow } = args as {
        project: string;
        postId: string;
        workflow: string;
      };
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project, keyword } = args as { project: string; keyword: string };
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project, postId } = args as { project: string; postId: string };
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project, postId, body } = args as {
        project: string;
        postId: string;
        body: string;
      };
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project } = args as { project: string };
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project, pageId } = args as { project: string; pageId: string };
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project, title, body, parent } = args as {
        project: string;
        title: string;
        body?: string;
        parent?: string;
      };
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project, pageId, title, body } = args as {
        project: string;
        pageId: string;
        title?: string;
        body?: string;
      };
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project, pageId } = args as { project: string; pageId: string };
      const client = await ctx.getClient();
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
    handler: async (ctx, args) => {
      const { project, pageId, body } = args as {
        project: string;
        pageId: string;
        body: string;
      };
      const client = await ctx.getClient();
      const wikiId = await resolveWikiId(client, project);
      const result = await client.createWikiComment(wikiId, pageId, {
        body: { content: body },
      });
      return { commentId: result.id, status: "created" };
    },
  },

  // ── 19. dooray_calendar_list ────────────────────────────────────────
  {
    name: "dooray_calendar_list",
    description: "내 캘린더 목록을 조회한다.",
    inputSchema: {},
    handler: async (ctx) => (await ctx.getClient()).listCalendars(),
  },

  // ── 20. dooray_calendar_events ──────────────────────────────────────
  {
    name: "dooray_calendar_events",
    description:
      "캘린더 이벤트 목록을 조회한다. from/to 미지정 시 지금~+7일, 전체 캘린더.",
    inputSchema: {
      from: z.string().optional(),
      to: z.string().optional(),
    },
    handler: async (ctx, args) => {
      const { from, to } = args as { from?: string; to?: string };
      const client = await ctx.getClient();
      const range = defaultRange();
      return client.listEvents({
        timeMin: from ?? range.timeMin,
        timeMax: to ?? range.timeMax,
      });
    },
  },

  // ── 21. dooray_calendar_event_get ───────────────────────────────────
  {
    name: "dooray_calendar_event_get",
    description: "캘린더 이벤트 상세를 조회한다.",
    inputSchema: {
      calendar: z.string(),
      eventId: z.string(),
    },
    handler: async (ctx, args) => {
      const { calendar, eventId } = args as {
        calendar: string;
        eventId: string;
      };
      return (await ctx.getClient()).getEvent(calendar, eventId);
    },
  },

  // ── 22. dooray_calendar_event_create ────────────────────────────────
  {
    name: "dooray_calendar_event_create",
    description:
      "캘린더 이벤트를 생성한다. start/end 는 RFC3339. allDay 가 true 이면 종일 일정.",
    inputSchema: {
      calendar: z.string(),
      subject: z.string(),
      start: z.string(),
      end: z.string(),
      body: z.string().optional(),
      allDay: z.boolean().optional(),
    },
    handler: async (ctx, args) => {
      const { calendar, subject, start, end, body, allDay } = args as {
        calendar: string;
        subject: string;
        start: string;
        end: string;
        body?: string;
        allDay?: boolean;
      };
      const client = await ctx.getClient();
      const { id } = await client.createEvent(calendar, {
        subject,
        startedAt: start,
        endedAt: end,
        ...(body ? { body: { mimeType: MARKDOWN, content: body } } : {}),
        ...(allDay ? { wholeDayFlag: true } : {}),
      });
      return { eventId: id, status: "created" };
    },
  },

  // ── 23. dooray_calendar_event_edit ──────────────────────────────────
  {
    name: "dooray_calendar_event_edit",
    description:
      "캘린더 이벤트를 수정한다(부분 수정). 지정하지 않은 필드는 현재 값을 유지한다.",
    inputSchema: {
      calendar: z.string(),
      eventId: z.string(),
      subject: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      body: z.string().optional(),
    },
    handler: async (ctx, args) => {
      const { calendar, eventId, subject, start, end, body } = args as {
        calendar: string;
        eventId: string;
        subject?: string;
        start?: string;
        end?: string;
        body?: string;
      };
      const client = await ctx.getClient();
      const current = await client.getEvent(calendar, eventId);
      // 입력 표면에 wholeDayFlag/참석자 옵션이 없으므로 body(미지정 시)·
      // wholeDayFlag·users 는 항상 current 를 read-back 재공급한다.
      const bodyField = body
        ? { mimeType: MARKDOWN, content: body }
        : current.body;
      await client.updateEvent(calendar, eventId, {
        subject: subject ?? current.subject,
        startedAt: start ?? current.startedAt ?? "",
        endedAt: end ?? current.endedAt ?? "",
        ...(bodyField ? { body: bodyField } : {}),
        ...(current.wholeDayFlag !== undefined
          ? { wholeDayFlag: current.wholeDayFlag }
          : {}),
        ...(current.users ? { users: current.users } : {}),
      });
      return { eventId, status: "updated" };
    },
  },

  // ── 24. dooray_calendar_event_delete ────────────────────────────────
  {
    name: "dooray_calendar_event_delete",
    description: "캘린더 이벤트를 삭제한다.",
    inputSchema: {
      calendar: z.string(),
      eventId: z.string(),
    },
    handler: async (ctx, args) => {
      const { calendar, eventId } = args as {
        calendar: string;
        eventId: string;
      };
      await (await ctx.getClient()).deleteEvent(calendar, eventId);
      return { eventId, status: "deleted" };
    },
  },

  // ── 25. dooray_mail_list ─────────────────────────────────────────────
  {
    name: "dooray_mail_list",
    description:
      "메일 목록을 조회한다. mailbox 기본 'INBOX', limit 기본 20. IMAP 설정 필요.",
    inputSchema: {
      mailbox: z.string().optional(),
      limit: z.number().optional(),
    },
    handler: async (ctx, args) => {
      const { mailbox, limit } = args as {
        mailbox?: string;
        limit?: number;
      };
      const config = await ctx.getConfig();
      return listMail(config, { mailbox: mailbox ?? "INBOX", limit: limit ?? 20 });
    },
  },

  // ── 26. dooray_mail_get ──────────────────────────────────────────────
  {
    name: "dooray_mail_get",
    description:
      "UID 로 단일 메일을 조회한다. uid 는 dooray_mail_list 의 uid 값. IMAP 설정 필요.",
    inputSchema: {
      uid: z.string(),
      mailbox: z.string().optional(),
    },
    handler: async (ctx, args) => {
      const { uid, mailbox } = args as { uid: string; mailbox?: string };
      const config = await ctx.getConfig();
      return getMail(config, uid, mailbox ?? "INBOX");
    },
  },

  // ── 27. dooray_mail_send ─────────────────────────────────────────────
  {
    name: "dooray_mail_send",
    description:
      "메일을 발송한다(외부 부작용 — 되돌릴 수 없음). SMTP 설정 필요.",
    inputSchema: {
      to: z.string(),
      subject: z.string(),
      body: z.string(),
    },
    handler: async (ctx, args) => {
      const { to, subject, body } = args as {
        to: string;
        subject: string;
        body: string;
      };
      const config = await ctx.getConfig();
      const { messageId } = await sendMail(config, { to, subject, text: body });
      return { messageId, status: "sent" };
    },
  },
];
