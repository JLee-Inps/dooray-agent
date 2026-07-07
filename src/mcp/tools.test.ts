// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { vi, describe, it, expect, beforeEach } from "vitest";
import { tools, type ToolContext } from "./tools";
import { AppError, ExitCode } from "../core/errors";
import { clearCache } from "../core/cache";
import type { DoorayClient } from "../dooray/client";
import type { Post, WikiPage, CalendarEvent } from "../dooray/types";
import type { Credentials } from "../core/config";

// mail 함수를 모킹해 IMAP/SMTP 연결을 차단한다.
vi.mock("../dooray/mail", () => ({
  listMail: vi.fn(),
  getMail: vi.fn(),
  sendMail: vi.fn(),
}));

// 모킹 후 import 해야 vi.mocked() 가 동작한다.
const { listMail, getMail, sendMail } = await import("../dooray/mail");

/** 15자리 raw ID — resolveProjectId/resolveWikiId 이름 해석을 우회한다. */
const RAW_PROJECT = "100000000000001";
const RAW_WIKI_ID = "200000000000001";
const RAW_POST_ID = "300000000000001";
const RAW_PAGE_ID = "400000000000001";
const RAW_COMMENT_ID = "500000000000001";
const RAW_WORKFLOW_ID = "600000000000001";
const RAW_CALENDAR_ID = "700000000000001";
const RAW_EVENT_ID = "800000000000001";

/** 위키 테스트용 mock wiki list. RAW_PROJECT 와 연결. */
const WIKI_LIST = [
  { id: RAW_WIKI_ID, project: { id: RAW_PROJECT }, name: "test-wiki" },
];

/** 메일 테스트용 기본 config. */
const MOCK_CONFIG: Credentials = {
  token: "test-token",
  baseUrl: "https://api.dooray.com",
};

/** mock DoorayClient 팩토리. 테스트별로 vi.fn() 스텁을 심는다. */
function makeMockClient(): DoorayClient {
  return {
    getMe: vi.fn(),
    listProjects: vi.fn().mockResolvedValue([]),
    searchMembers: vi.fn(),
    listPosts: vi.fn(),
    getPost: vi.fn(),
    createPost: vi.fn(),
    updatePost: vi.fn().mockResolvedValue(undefined),
    setPostWorkflow: vi.fn().mockResolvedValue(undefined),
    listPostComments: vi.fn(),
    createPostComment: vi.fn(),
    listWikis: vi.fn().mockResolvedValue(WIKI_LIST),
    listWikiPages: vi.fn(),
    getWikiPage: vi.fn(),
    createWikiPage: vi.fn(),
    updateWikiPage: vi.fn().mockResolvedValue(undefined),
    deleteWikiPage: vi.fn().mockResolvedValue(undefined),
    createWikiComment: vi.fn(),
    listWorkflows: vi.fn().mockResolvedValue([]),
    listCalendars: vi.fn(),
    listEvents: vi.fn(),
    getEvent: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn().mockResolvedValue(undefined),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as DoorayClient;
}

/**
 * 핸들러에 주입할 mock ToolContext.
 * - getClient: client 를 그대로 반환.
 * - getConfig: MOCK_CONFIG 를 그대로 반환.
 */
function makeCtx(
  client: DoorayClient,
  config: Credentials = MOCK_CONFIG,
): ToolContext {
  return {
    getClient: async () => client,
    getConfig: async () => config,
  };
}

function findTool(name: string) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

describe("mcp/tools 핸들러 단위 테스트", () => {
  // resolveProjectId/resolveWikiId 의 캐시가 테스트 간 오염을 일으키지 않도록 매번 비운다.
  beforeEach(async () => {
    await clearCache();
    vi.mocked(listMail).mockReset();
    vi.mocked(getMail).mockReset();
    vi.mocked(sendMail).mockReset();
  });

  // ── 1. dooray_whoami ────────────────────────────────────────────────
  it("dooray_whoami: getMe() 호출 결과 반환", async () => {
    const client = makeMockClient();
    const me = { id: "me-1", name: "홍길동" };
    (client.getMe as ReturnType<typeof vi.fn>).mockResolvedValue(me);
    const result = await findTool("dooray_whoami").handler(makeCtx(client), {});
    expect(client.getMe).toHaveBeenCalledTimes(1);
    expect(result).toEqual(me);
  });

  // ── 2. dooray_project_list ──────────────────────────────────────────
  it("dooray_project_list: listProjects() 호출 결과 반환", async () => {
    const client = makeMockClient();
    const projects = [{ id: "p1", code: "ALPHA" }];
    (client.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue(
      projects,
    );
    const result = await findTool("dooray_project_list").handler(
      makeCtx(client),
      {},
    );
    expect(client.listProjects).toHaveBeenCalledTimes(1);
    expect(result).toEqual(projects);
  });

  // ── 3. dooray_member_search ─────────────────────────────────────────
  describe("dooray_member_search", () => {
    it("email 로 searchMembers 호출 (externalEmailAddresses 키)", async () => {
      const client = makeMockClient();
      const hits = [{ id: "m1", name: "유저", externalEmailAddress: "a@b.com" }];
      (client.searchMembers as ReturnType<typeof vi.fn>).mockResolvedValue(
        hits,
      );
      const result = await findTool("dooray_member_search").handler(
        makeCtx(client),
        { email: "a@b.com" },
      );
      expect(client.searchMembers).toHaveBeenCalledWith({
        externalEmailAddresses: "a@b.com",
      });
      expect(result).toEqual(hits);
    });

    it("name 으로 searchMembers 호출", async () => {
      const client = makeMockClient();
      (client.searchMembers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await findTool("dooray_member_search").handler(makeCtx(client), {
        name: "홍길동",
      });
      expect(client.searchMembers).toHaveBeenCalledWith({ name: "홍길동" });
    });

    it("email, name 둘 다 없으면 AppError(Usage) throw", async () => {
      const client = makeMockClient();
      await expect(
        findTool("dooray_member_search").handler(makeCtx(client), {}),
      ).rejects.toSatisfy(
        (e: unknown) => e instanceof AppError && e.code === ExitCode.Usage,
      );
    });
  });

  // ── 4. dooray_post_list ─────────────────────────────────────────────
  it("dooray_post_list: listPosts 호출 후 items 반환, page/size 기본값 적용", async () => {
    const client = makeMockClient();
    const posts: Post[] = [{ id: RAW_POST_ID, number: 1, subject: "제목" }];
    (client.listPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: posts,
      totalCount: 1,
    });
    const result = await findTool("dooray_post_list").handler(makeCtx(client), {
      project: RAW_PROJECT,
    });
    expect(client.listPosts).toHaveBeenCalledWith(RAW_PROJECT, {
      page: 0,
      size: 20,
      order: "-createdAt",
    });
    expect(result).toEqual(posts);
  });

  it("dooray_post_list: page, size 명시 시 그대로 전달", async () => {
    const client = makeMockClient();
    (client.listPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      totalCount: 0,
    });
    await findTool("dooray_post_list").handler(makeCtx(client), {
      project: RAW_PROJECT,
      page: 2,
      size: 50,
    });
    expect(client.listPosts).toHaveBeenCalledWith(RAW_PROJECT, {
      page: 2,
      size: 50,
      order: "-createdAt",
    });
  });

  // ── 5. dooray_post_get ──────────────────────────────────────────────
  it("dooray_post_get: getPost 호출 결과 반환", async () => {
    const client = makeMockClient();
    const post: Post = {
      id: RAW_POST_ID,
      number: 1,
      subject: "s",
      body: { mimeType: "text/x-markdown", content: "본문" },
    };
    (client.getPost as ReturnType<typeof vi.fn>).mockResolvedValue(post);
    const result = await findTool("dooray_post_get").handler(makeCtx(client), {
      project: RAW_PROJECT,
      postId: RAW_POST_ID,
    });
    expect(client.getPost).toHaveBeenCalledWith(RAW_PROJECT, RAW_POST_ID);
    expect(result).toEqual(post);
  });

  // ── 6. dooray_post_create ───────────────────────────────────────────
  it("dooray_post_create: createPost 호출 + { postId, status:'created' } 반환", async () => {
    const client = makeMockClient();
    (client.createPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: RAW_POST_ID,
    });
    const result = await findTool("dooray_post_create").handler(
      makeCtx(client),
      {
        project: RAW_PROJECT,
        title: "새 업무",
        body: "내용",
      },
    );
    expect(client.createPost).toHaveBeenCalledWith(RAW_PROJECT, {
      subject: "새 업무",
      body: { mimeType: "text/x-markdown", content: "내용" },
    });
    expect(result).toEqual({ postId: RAW_POST_ID, status: "created" });
  });

  it("dooray_post_create: body 생략 시 빈 문자열로 createPost 호출", async () => {
    const client = makeMockClient();
    (client.createPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: RAW_POST_ID,
    });
    await findTool("dooray_post_create").handler(makeCtx(client), {
      project: RAW_PROJECT,
      title: "제목만",
    });
    expect(client.createPost).toHaveBeenCalledWith(RAW_PROJECT, {
      subject: "제목만",
      body: { mimeType: "text/x-markdown", content: "" },
    });
  });

  // ── 7. dooray_post_edit (부분 수정 anti-overfit) ────────────────────
  describe("dooray_post_edit (부분 수정)", () => {
    it("title 만 지정 시 body 는 현재 값 유지", async () => {
      const client = makeMockClient();
      const current: Post = {
        id: RAW_POST_ID,
        number: 1,
        subject: "원래 제목",
        body: { mimeType: "text/x-markdown", content: "원래 본문" },
      };
      (client.getPost as ReturnType<typeof vi.fn>).mockResolvedValue(current);
      const result = await findTool("dooray_post_edit").handler(
        makeCtx(client),
        {
          project: RAW_PROJECT,
          postId: RAW_POST_ID,
          title: "새 제목",
        },
      );
      expect(client.updatePost).toHaveBeenCalledWith(
        RAW_PROJECT,
        RAW_POST_ID,
        expect.objectContaining({
          subject: "새 제목",
          body: expect.objectContaining({ content: "원래 본문" }),
        }),
      );
      expect(result).toEqual({ postId: RAW_POST_ID, status: "updated" });
    });

    it("body 만 지정 시 title 은 현재 값 유지", async () => {
      const client = makeMockClient();
      const current: Post = {
        id: RAW_POST_ID,
        number: 1,
        subject: "원래 제목",
        body: { mimeType: "text/x-markdown", content: "원래 본문" },
      };
      (client.getPost as ReturnType<typeof vi.fn>).mockResolvedValue(current);
      await findTool("dooray_post_edit").handler(makeCtx(client), {
        project: RAW_PROJECT,
        postId: RAW_POST_ID,
        body: "새 본문",
      });
      expect(client.updatePost).toHaveBeenCalledWith(
        RAW_PROJECT,
        RAW_POST_ID,
        expect.objectContaining({
          subject: "원래 제목",
          body: expect.objectContaining({ content: "새 본문" }),
        }),
      );
    });

    it("updatePost 에 mimeType:'text/x-markdown' 이 항상 포함됨", async () => {
      const client = makeMockClient();
      (client.getPost as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: RAW_POST_ID,
        number: 1,
        subject: "s",
        body: { mimeType: "text/plain", content: "c" },
      });
      await findTool("dooray_post_edit").handler(makeCtx(client), {
        project: RAW_PROJECT,
        postId: RAW_POST_ID,
        title: "t",
      });
      expect(client.updatePost).toHaveBeenCalledWith(
        RAW_PROJECT,
        RAW_POST_ID,
        expect.objectContaining({
          body: expect.objectContaining({ mimeType: "text/x-markdown" }),
        }),
      );
    });

    it("getPost 가 tags/users 를 돌려주면 title 만 지정해도 tagIdList/users 가 read-back 재공급된다 (핵심 회귀)", async () => {
      const client = makeMockClient();
      const current: Post = {
        id: RAW_POST_ID,
        number: 1,
        subject: "원래 제목",
        body: { mimeType: "text/x-markdown", content: "원래 본문" },
        tags: [{ id: "tag-1" }, { id: "tag-2" }],
        users: {
          to: [{ type: "member", member: { organizationMemberId: "m-to" } }],
          cc: [{ type: "member", member: { organizationMemberId: "m-cc" } }],
        },
      };
      (client.getPost as ReturnType<typeof vi.fn>).mockResolvedValue(current);
      await findTool("dooray_post_edit").handler(makeCtx(client), {
        project: RAW_PROJECT,
        postId: RAW_POST_ID,
        title: "새 제목",
      });
      expect(client.updatePost).toHaveBeenCalledWith(
        RAW_PROJECT,
        RAW_POST_ID,
        expect.objectContaining({
          tagIdList: ["tag-1", "tag-2"],
          users: current.users,
        }),
      );
    });

    it("getPost 가 tags/users 를 돌려주지 않으면 updatePost payload 에 해당 키가 없다 (anti-overfit)", async () => {
      const client = makeMockClient();
      (client.getPost as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: RAW_POST_ID,
        number: 1,
        subject: "s",
      });
      await findTool("dooray_post_edit").handler(makeCtx(client), {
        project: RAW_PROJECT,
        postId: RAW_POST_ID,
        title: "t",
      });
      const callArg = (client.updatePost as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[2] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty("tagIdList");
      expect(callArg).not.toHaveProperty("users");
    });
  });

  // ── 8. dooray_post_done ─────────────────────────────────────────────
  it("dooray_post_done: closed 워크플로를 찾아 setPostWorkflow 호출", async () => {
    const client = makeMockClient();
    (client.listWorkflows as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: RAW_WORKFLOW_ID, name: "완료", class: "closed" },
      { id: "600000000000002", name: "진행중", class: "open" },
    ]);
    const result = await findTool("dooray_post_done").handler(makeCtx(client), {
      project: RAW_PROJECT,
      postId: RAW_POST_ID,
    });
    expect(client.setPostWorkflow).toHaveBeenCalledWith(
      RAW_PROJECT,
      RAW_POST_ID,
      RAW_WORKFLOW_ID,
    );
    expect(result).toEqual({ postId: RAW_POST_ID, status: "done" });
  });

  // ── 9. dooray_post_workflow ─────────────────────────────────────────
  it("dooray_post_workflow: raw workflow ID 로 setPostWorkflow 호출", async () => {
    const client = makeMockClient();
    const result = await findTool("dooray_post_workflow").handler(
      makeCtx(client),
      {
        project: RAW_PROJECT,
        postId: RAW_POST_ID,
        workflow: RAW_WORKFLOW_ID,
      },
    );
    expect(client.setPostWorkflow).toHaveBeenCalledWith(
      RAW_PROJECT,
      RAW_POST_ID,
      RAW_WORKFLOW_ID,
    );
    expect(result).toEqual({
      postId: RAW_POST_ID,
      workflow: RAW_WORKFLOW_ID,
      status: "updated",
    });
  });

  // ── 10. dooray_post_search ──────────────────────────────────────────
  it("dooray_post_search: subjects 파라미터로 listPosts 호출, items 반환", async () => {
    const client = makeMockClient();
    const posts: Post[] = [
      { id: RAW_POST_ID, number: 1, subject: "검색결과" },
    ];
    (client.listPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: posts,
      totalCount: 1,
    });
    const result = await findTool("dooray_post_search").handler(
      makeCtx(client),
      {
        project: RAW_PROJECT,
        keyword: "검색어",
      },
    );
    expect(client.listPosts).toHaveBeenCalledWith(RAW_PROJECT, {
      subjects: "검색어",
      order: "-createdAt",
    });
    expect(result).toEqual(posts);
  });

  // ── 11. dooray_post_comment_list ────────────────────────────────────
  it("dooray_post_comment_list: listPostComments 호출 후 items 반환", async () => {
    const client = makeMockClient();
    const comments = [{ id: RAW_COMMENT_ID }];
    (client.listPostComments as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: comments,
      totalCount: 1,
    });
    const result = await findTool("dooray_post_comment_list").handler(
      makeCtx(client),
      {
        project: RAW_PROJECT,
        postId: RAW_POST_ID,
      },
    );
    expect(client.listPostComments).toHaveBeenCalledWith(
      RAW_PROJECT,
      RAW_POST_ID,
    );
    expect(result).toEqual(comments);
  });

  // ── 12. dooray_post_comment_add ─────────────────────────────────────
  it("dooray_post_comment_add: createPostComment 에 mimeType markdown 으로 호출", async () => {
    const client = makeMockClient();
    (client.createPostComment as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: RAW_COMMENT_ID,
    });
    const result = await findTool("dooray_post_comment_add").handler(
      makeCtx(client),
      {
        project: RAW_PROJECT,
        postId: RAW_POST_ID,
        body: "댓글 내용",
      },
    );
    expect(client.createPostComment).toHaveBeenCalledWith(
      RAW_PROJECT,
      RAW_POST_ID,
      { body: { mimeType: "text/x-markdown", content: "댓글 내용" } },
    );
    expect(result).toEqual({ commentId: RAW_COMMENT_ID, status: "created" });
  });

  // ── 13. dooray_wiki_pages ───────────────────────────────────────────
  it("dooray_wiki_pages: resolveWikiId 후 listWikiPages 호출, items 반환", async () => {
    const client = makeMockClient();
    const pages: WikiPage[] = [{ id: RAW_PAGE_ID, subject: "페이지" }];
    (client.listWikiPages as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: pages,
      totalCount: 1,
    });
    const result = await findTool("dooray_wiki_pages").handler(makeCtx(client), {
      project: RAW_PROJECT,
    });
    expect(client.listWikiPages).toHaveBeenCalledWith(RAW_WIKI_ID);
    expect(result).toEqual(pages);
  });

  // ── 14. dooray_wiki_page_get ────────────────────────────────────────
  it("dooray_wiki_page_get: resolveWikiId 후 getWikiPage 호출", async () => {
    const client = makeMockClient();
    const page: WikiPage = {
      id: RAW_PAGE_ID,
      subject: "위키",
      body: { mimeType: "text/x-markdown", content: "내용" },
    };
    (client.getWikiPage as ReturnType<typeof vi.fn>).mockResolvedValue(page);
    const result = await findTool("dooray_wiki_page_get").handler(
      makeCtx(client),
      {
        project: RAW_PROJECT,
        pageId: RAW_PAGE_ID,
      },
    );
    expect(client.getWikiPage).toHaveBeenCalledWith(RAW_WIKI_ID, RAW_PAGE_ID);
    expect(result).toEqual(page);
  });

  // ── 15. dooray_wiki_page_create ─────────────────────────────────────
  it("dooray_wiki_page_create: createWikiPage 호출 + { pageId, status:'created' } 반환", async () => {
    const client = makeMockClient();
    (client.createWikiPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: RAW_PAGE_ID,
    });
    const result = await findTool("dooray_wiki_page_create").handler(
      makeCtx(client),
      {
        project: RAW_PROJECT,
        title: "새 페이지",
        body: "본문",
      },
    );
    expect(client.createWikiPage).toHaveBeenCalledWith(RAW_WIKI_ID, {
      subject: "새 페이지",
      body: { mimeType: "text/x-markdown", content: "본문" },
      parentPageId: undefined,
    });
    expect(result).toEqual({ pageId: RAW_PAGE_ID, status: "created" });
  });

  it("dooray_wiki_page_create: parent 지정 시 parentPageId 전달", async () => {
    const client = makeMockClient();
    (client.createWikiPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: RAW_PAGE_ID,
    });
    await findTool("dooray_wiki_page_create").handler(makeCtx(client), {
      project: RAW_PROJECT,
      title: "하위 페이지",
      parent: "700000000000001",
    });
    expect(client.createWikiPage).toHaveBeenCalledWith(
      RAW_WIKI_ID,
      expect.objectContaining({ parentPageId: "700000000000001" }),
    );
  });

  // ── 16. dooray_wiki_page_edit (부분 수정 anti-overfit) ──────────────
  describe("dooray_wiki_page_edit (부분 수정)", () => {
    it("title 만 지정 시 body 는 현재 값 유지", async () => {
      const client = makeMockClient();
      const current: WikiPage = {
        id: RAW_PAGE_ID,
        subject: "원래 제목",
        body: { mimeType: "text/x-markdown", content: "원래 본문" },
      };
      (client.getWikiPage as ReturnType<typeof vi.fn>).mockResolvedValue(
        current,
      );
      const result = await findTool("dooray_wiki_page_edit").handler(
        makeCtx(client),
        {
          project: RAW_PROJECT,
          pageId: RAW_PAGE_ID,
          title: "새 제목",
        },
      );
      expect(client.updateWikiPage).toHaveBeenCalledWith(
        RAW_WIKI_ID,
        RAW_PAGE_ID,
        expect.objectContaining({
          subject: "새 제목",
          body: expect.objectContaining({ content: "원래 본문" }),
        }),
      );
      expect(result).toEqual({ pageId: RAW_PAGE_ID, status: "updated" });
    });

    it("body 만 지정 시 title 은 현재 값 유지", async () => {
      const client = makeMockClient();
      (client.getWikiPage as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: RAW_PAGE_ID,
        subject: "원래 제목",
        body: { mimeType: "text/x-markdown", content: "원래 본문" },
      });
      await findTool("dooray_wiki_page_edit").handler(makeCtx(client), {
        project: RAW_PROJECT,
        pageId: RAW_PAGE_ID,
        body: "새 본문",
      });
      expect(client.updateWikiPage).toHaveBeenCalledWith(
        RAW_WIKI_ID,
        RAW_PAGE_ID,
        expect.objectContaining({
          subject: "원래 제목",
          body: expect.objectContaining({ content: "새 본문" }),
        }),
      );
    });
  });

  // ── 17. dooray_wiki_page_delete ─────────────────────────────────────
  it("dooray_wiki_page_delete: deleteWikiPage 호출 + { pageId, status:'deleted' } 반환", async () => {
    const client = makeMockClient();
    const result = await findTool("dooray_wiki_page_delete").handler(
      makeCtx(client),
      {
        project: RAW_PROJECT,
        pageId: RAW_PAGE_ID,
      },
    );
    expect(client.deleteWikiPage).toHaveBeenCalledWith(
      RAW_WIKI_ID,
      RAW_PAGE_ID,
    );
    expect(result).toEqual({ pageId: RAW_PAGE_ID, status: "deleted" });
  });

  // ── 18. dooray_wiki_comment_add ─────────────────────────────────────
  it("dooray_wiki_comment_add: mimeType 없이 content 만 담아 createWikiComment 호출", async () => {
    const client = makeMockClient();
    (client.createWikiComment as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: RAW_COMMENT_ID,
    });
    const result = await findTool("dooray_wiki_comment_add").handler(
      makeCtx(client),
      {
        project: RAW_PROJECT,
        pageId: RAW_PAGE_ID,
        body: "위키 댓글",
      },
    );
    expect(client.createWikiComment).toHaveBeenCalledWith(
      RAW_WIKI_ID,
      RAW_PAGE_ID,
      { body: { content: "위키 댓글" } },
    );
    expect(result).toEqual({ commentId: RAW_COMMENT_ID, status: "created" });
  });

  // ── 19. dooray_calendar_list ────────────────────────────────────────
  it("dooray_calendar_list: listCalendars() 호출 결과 반환", async () => {
    const client = makeMockClient();
    const calendars = [{ id: RAW_CALENDAR_ID, name: "내 캘린더" }];
    (client.listCalendars as ReturnType<typeof vi.fn>).mockResolvedValue(
      calendars,
    );
    const result = await findTool("dooray_calendar_list").handler(
      makeCtx(client),
      {},
    );
    expect(client.listCalendars).toHaveBeenCalledTimes(1);
    expect(result).toEqual(calendars);
  });

  // ── 20. dooray_calendar_events ──────────────────────────────────────
  describe("dooray_calendar_events", () => {
    it("from/to 미지정 시 기본 범위(now~+7d) 전달", async () => {
      const client = makeMockClient();
      (client.listEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const before = Date.now();
      await findTool("dooray_calendar_events").handler(makeCtx(client), {});
      const after = Date.now();
      expect(client.listEvents).toHaveBeenCalledTimes(1);
      const call = (client.listEvents as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as { timeMin: string; timeMax: string };
      const timeMin = new Date(call.timeMin).getTime();
      const timeMax = new Date(call.timeMax).getTime();
      // timeMin ≈ now
      expect(timeMin).toBeGreaterThanOrEqual(before);
      expect(timeMin).toBeLessThanOrEqual(after + 100);
      // timeMax ≈ +7일
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(timeMax - timeMin).toBeGreaterThanOrEqual(sevenDays - 1000);
      expect(timeMax - timeMin).toBeLessThanOrEqual(sevenDays + 1000);
    });

    it("from/to 지정 시 그대로 전달", async () => {
      const client = makeMockClient();
      (client.listEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await findTool("dooray_calendar_events").handler(makeCtx(client), {
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-08T00:00:00Z",
      });
      expect(client.listEvents).toHaveBeenCalledWith({
        timeMin: "2026-07-01T00:00:00Z",
        timeMax: "2026-07-08T00:00:00Z",
      });
    });
  });

  // ── 21. dooray_calendar_event_get ───────────────────────────────────
  it("dooray_calendar_event_get: getEvent(calendar, eventId) 호출 결과 반환", async () => {
    const client = makeMockClient();
    const event: CalendarEvent = {
      id: RAW_EVENT_ID,
      subject: "회의",
      startedAt: "2026-07-01T09:00:00Z",
      endedAt: "2026-07-01T10:00:00Z",
    };
    (client.getEvent as ReturnType<typeof vi.fn>).mockResolvedValue(event);
    const result = await findTool("dooray_calendar_event_get").handler(
      makeCtx(client),
      { calendar: RAW_CALENDAR_ID, eventId: RAW_EVENT_ID },
    );
    expect(client.getEvent).toHaveBeenCalledWith(RAW_CALENDAR_ID, RAW_EVENT_ID);
    expect(result).toEqual(event);
  });

  // ── 22. dooray_calendar_event_create ────────────────────────────────
  describe("dooray_calendar_event_create", () => {
    it("createEvent 에 올바른 인자 전달 + { eventId, status:'created' } 반환", async () => {
      const client = makeMockClient();
      (client.createEvent as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: RAW_EVENT_ID,
      });
      const result = await findTool("dooray_calendar_event_create").handler(
        makeCtx(client),
        {
          calendar: RAW_CALENDAR_ID,
          subject: "회의",
          start: "2026-07-01T09:00:00Z",
          end: "2026-07-01T10:00:00Z",
        },
      );
      expect(client.createEvent).toHaveBeenCalledWith(RAW_CALENDAR_ID, {
        subject: "회의",
        startedAt: "2026-07-01T09:00:00Z",
        endedAt: "2026-07-01T10:00:00Z",
      });
      expect(result).toEqual({ eventId: RAW_EVENT_ID, status: "created" });
    });

    it("body 지정 시 { mimeType:'text/x-markdown', content } 포함", async () => {
      const client = makeMockClient();
      (client.createEvent as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: RAW_EVENT_ID,
      });
      await findTool("dooray_calendar_event_create").handler(makeCtx(client), {
        calendar: RAW_CALENDAR_ID,
        subject: "s",
        start: "2026-07-01T09:00:00Z",
        end: "2026-07-01T10:00:00Z",
        body: "안건 목록",
      });
      expect(client.createEvent).toHaveBeenCalledWith(
        RAW_CALENDAR_ID,
        expect.objectContaining({
          body: { mimeType: "text/x-markdown", content: "안건 목록" },
        }),
      );
    });

    it("body 미지정 시 body 키 없음 (anti-overfit: 빈 값 삽입 아님)", async () => {
      const client = makeMockClient();
      (client.createEvent as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: RAW_EVENT_ID,
      });
      await findTool("dooray_calendar_event_create").handler(makeCtx(client), {
        calendar: RAW_CALENDAR_ID,
        subject: "s",
        start: "2026-07-01T09:00:00Z",
        end: "2026-07-01T10:00:00Z",
      });
      const callArg = (client.createEvent as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[1] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty("body");
    });

    it("allDay:true → wholeDayFlag:true", async () => {
      const client = makeMockClient();
      (client.createEvent as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: RAW_EVENT_ID,
      });
      await findTool("dooray_calendar_event_create").handler(makeCtx(client), {
        calendar: RAW_CALENDAR_ID,
        subject: "종일 일정",
        start: "2026-07-01T00:00:00Z",
        end: "2026-07-01T23:59:59Z",
        allDay: true,
      });
      expect(client.createEvent).toHaveBeenCalledWith(
        RAW_CALENDAR_ID,
        expect.objectContaining({ wholeDayFlag: true }),
      );
    });

    it("allDay 미지정 시 wholeDayFlag 키 없음", async () => {
      const client = makeMockClient();
      (client.createEvent as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: RAW_EVENT_ID,
      });
      await findTool("dooray_calendar_event_create").handler(makeCtx(client), {
        calendar: RAW_CALENDAR_ID,
        subject: "s",
        start: "2026-07-01T09:00:00Z",
        end: "2026-07-01T10:00:00Z",
      });
      const callArg = (client.createEvent as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[1] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty("wholeDayFlag");
    });
  });

  // ── 23. dooray_calendar_event_edit (부분 수정 anti-overfit) ─────────
  describe("dooray_calendar_event_edit (부분 수정)", () => {
    const CURRENT_EVENT: CalendarEvent = {
      id: RAW_EVENT_ID,
      subject: "원래 제목",
      startedAt: "2026-07-01T09:00:00Z",
      endedAt: "2026-07-01T10:00:00Z",
    };

    it("subject 만 주면 start/end 는 현재값 유지", async () => {
      const client = makeMockClient();
      (client.getEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
        CURRENT_EVENT,
      );
      const result = await findTool("dooray_calendar_event_edit").handler(
        makeCtx(client),
        {
          calendar: RAW_CALENDAR_ID,
          eventId: RAW_EVENT_ID,
          subject: "새 제목",
        },
      );
      expect(client.updateEvent).toHaveBeenCalledWith(
        RAW_CALENDAR_ID,
        RAW_EVENT_ID,
        expect.objectContaining({
          subject: "새 제목",
          startedAt: CURRENT_EVENT.startedAt,
          endedAt: CURRENT_EVENT.endedAt,
        }),
      );
      expect(result).toEqual({ eventId: RAW_EVENT_ID, status: "updated" });
    });

    it("body 만 주면 subject/startedAt/endedAt 는 현재값 유지", async () => {
      const client = makeMockClient();
      (client.getEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
        CURRENT_EVENT,
      );
      await findTool("dooray_calendar_event_edit").handler(makeCtx(client), {
        calendar: RAW_CALENDAR_ID,
        eventId: RAW_EVENT_ID,
        body: "새 안건",
      });
      expect(client.updateEvent).toHaveBeenCalledWith(
        RAW_CALENDAR_ID,
        RAW_EVENT_ID,
        expect.objectContaining({
          subject: CURRENT_EVENT.subject,
          startedAt: CURRENT_EVENT.startedAt,
          endedAt: CURRENT_EVENT.endedAt,
          body: expect.objectContaining({
            mimeType: "text/x-markdown",
            content: "새 안건",
          }),
        }),
      );
    });

    // 반전 갱신(핵심 회귀): 이 테스트는 원래 "body 미지정 시 body 키 없음"을
    // 무조건 단언해 현행 버그 동작(current.body 가 있어도 소실)을 고정하고
    // 있었다. read-merge-resupply 도입 후에는 current.body 가 있으면 재공급
    // 되어야 하므로 반전한다 — current.body 없을 때만 키가 생략된다.
    it("current.body 가 있고 body 미지정 시 body 키에 current.body 가 재공급된다 (반전 갱신 — 핵심 회귀)", async () => {
      const client = makeMockClient();
      const withBody: CalendarEvent = {
        ...CURRENT_EVENT,
        body: { mimeType: "text/x-markdown", content: "기존 안건" },
      };
      (client.getEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
        withBody,
      );
      await findTool("dooray_calendar_event_edit").handler(makeCtx(client), {
        calendar: RAW_CALENDAR_ID,
        eventId: RAW_EVENT_ID,
        subject: "새 제목",
      });
      expect(client.updateEvent).toHaveBeenCalledWith(
        RAW_CALENDAR_ID,
        RAW_EVENT_ID,
        expect.objectContaining({
          body: expect.objectContaining({ content: "기존 안건" }),
        }),
      );
    });

    it("current.body 가 없고 body 미지정 시 updateEvent 에 body 키 없음 (anti-overfit)", async () => {
      const client = makeMockClient();
      (client.getEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
        CURRENT_EVENT,
      );
      await findTool("dooray_calendar_event_edit").handler(makeCtx(client), {
        calendar: RAW_CALENDAR_ID,
        eventId: RAW_EVENT_ID,
        subject: "새 제목",
      });
      const callArg = (client.updateEvent as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[2] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty("body");
    });

    it("current.wholeDayFlag/users(참석자)는 edit 옵션이 없어도 무조건 read-back 재공급된다", async () => {
      const client = makeMockClient();
      const withExtras: CalendarEvent = {
        ...CURRENT_EVENT,
        wholeDayFlag: true,
        users: {
          to: [{ type: "member", member: { organizationMemberId: "m1" } }],
        },
      };
      (client.getEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
        withExtras,
      );
      await findTool("dooray_calendar_event_edit").handler(makeCtx(client), {
        calendar: RAW_CALENDAR_ID,
        eventId: RAW_EVENT_ID,
        subject: "새 제목",
      });
      expect(client.updateEvent).toHaveBeenCalledWith(
        RAW_CALENDAR_ID,
        RAW_EVENT_ID,
        expect.objectContaining({
          wholeDayFlag: true,
          users: withExtras.users,
        }),
      );
    });

    it("startedAt/endedAt 가 undefined 인 경우 빈 문자열로 공급 (updateEvent 필수 인자)", async () => {
      const client = makeMockClient();
      const noTime: CalendarEvent = {
        id: RAW_EVENT_ID,
        subject: "제목",
        // startedAt/endedAt 없음
      };
      (client.getEvent as ReturnType<typeof vi.fn>).mockResolvedValue(noTime);
      await findTool("dooray_calendar_event_edit").handler(makeCtx(client), {
        calendar: RAW_CALENDAR_ID,
        eventId: RAW_EVENT_ID,
      });
      expect(client.updateEvent).toHaveBeenCalledWith(
        RAW_CALENDAR_ID,
        RAW_EVENT_ID,
        expect.objectContaining({ startedAt: "", endedAt: "" }),
      );
    });
  });

  // ── 24. dooray_calendar_event_delete ────────────────────────────────
  it("dooray_calendar_event_delete: deleteEvent 호출 + { eventId, status:'deleted' } 반환", async () => {
    const client = makeMockClient();
    const result = await findTool("dooray_calendar_event_delete").handler(
      makeCtx(client),
      { calendar: RAW_CALENDAR_ID, eventId: RAW_EVENT_ID },
    );
    expect(client.deleteEvent).toHaveBeenCalledWith(
      RAW_CALENDAR_ID,
      RAW_EVENT_ID,
    );
    expect(result).toEqual({ eventId: RAW_EVENT_ID, status: "deleted" });
  });

  // ── 25. dooray_mail_list ─────────────────────────────────────────────
  describe("dooray_mail_list", () => {
    it("listMail 에 config + { mailbox, limit } 전달", async () => {
      vi.mocked(listMail).mockResolvedValue([]);
      const client = makeMockClient();
      await findTool("dooray_mail_list").handler(makeCtx(client), {
        mailbox: "SENT",
        limit: 10,
      });
      expect(vi.mocked(listMail)).toHaveBeenCalledWith(MOCK_CONFIG, {
        mailbox: "SENT",
        limit: 10,
      });
    });

    it("mailbox/limit 미지정 시 기본값 INBOX/20 적용", async () => {
      vi.mocked(listMail).mockResolvedValue([]);
      const client = makeMockClient();
      await findTool("dooray_mail_list").handler(makeCtx(client), {});
      expect(vi.mocked(listMail)).toHaveBeenCalledWith(MOCK_CONFIG, {
        mailbox: "INBOX",
        limit: 20,
      });
    });

    it("listMail AppError(Config=4) → 핸들러가 그대로 전파", async () => {
      vi.mocked(listMail).mockRejectedValue(
        new AppError("IMAP 설정이 없습니다.", ExitCode.Config),
      );
      const client = makeMockClient();
      await expect(
        findTool("dooray_mail_list").handler(makeCtx(client), {}),
      ).rejects.toSatisfy(
        (e: unknown) => e instanceof AppError && e.code === ExitCode.Config,
      );
    });
  });

  // ── 26. dooray_mail_get ──────────────────────────────────────────────
  it("dooray_mail_get: getMail(config, uid, mailbox) 에 올바른 인자 전달", async () => {
    vi.mocked(getMail).mockResolvedValue({
      uid: 42,
      subject: "제목",
      from: "a@b.com",
      to: "c@d.com",
      date: "",
      text: "",
    });
    const client = makeMockClient();
    const result = await findTool("dooray_mail_get").handler(makeCtx(client), {
      uid: "42",
      mailbox: "SENT",
    });
    expect(vi.mocked(getMail)).toHaveBeenCalledWith(MOCK_CONFIG, "42", "SENT");
    expect(result).toMatchObject({ uid: 42, subject: "제목" });
  });

  it("dooray_mail_get: mailbox 미지정 시 INBOX 기본", async () => {
    vi.mocked(getMail).mockResolvedValue({
      uid: 1,
      subject: "",
      from: "",
      to: "",
      date: "",
      text: "",
    });
    const client = makeMockClient();
    await findTool("dooray_mail_get").handler(makeCtx(client), { uid: "1" });
    expect(vi.mocked(getMail)).toHaveBeenCalledWith(
      MOCK_CONFIG,
      "1",
      "INBOX",
    );
  });

  // ── 27. dooray_mail_send ─────────────────────────────────────────────
  describe("dooray_mail_send", () => {
    it("body → text 매핑 후 sendMail 호출 + { messageId, status:'sent' } 반환", async () => {
      vi.mocked(sendMail).mockResolvedValue({ messageId: "<abc@mail>" });
      const client = makeMockClient();
      const result = await findTool("dooray_mail_send").handler(
        makeCtx(client),
        {
          to: "to@example.com",
          subject: "보고",
          body: "본문 내용",
        },
      );
      expect(vi.mocked(sendMail)).toHaveBeenCalledWith(MOCK_CONFIG, {
        to: "to@example.com",
        subject: "보고",
        text: "본문 내용",
      });
      expect(result).toEqual({ messageId: "<abc@mail>", status: "sent" });
    });

    it("sendMail AppError(Config=4) → 핸들러가 그대로 전파", async () => {
      vi.mocked(sendMail).mockRejectedValue(
        new AppError("SMTP 설정이 없습니다.", ExitCode.Config),
      );
      const client = makeMockClient();
      await expect(
        findTool("dooray_mail_send").handler(makeCtx(client), {
          to: "a@b.com",
          subject: "s",
          body: "b",
        }),
      ).rejects.toSatisfy(
        (e: unknown) => e instanceof AppError && e.code === ExitCode.Config,
      );
    });
  });

  // ── 컨텍스트 dispatch 검증 ───────────────────────────────────────────

  describe("ctx dispatch: 메일 툴은 getClient 미호출, 캘린더 툴은 getConfig 미호출", () => {
    it("dooray_mail_list: getClient 미호출(0회), getConfig 1회", async () => {
      vi.mocked(listMail).mockResolvedValue([]);
      const getClientSpy = vi.fn();
      const getConfigSpy = vi.fn().mockResolvedValue(MOCK_CONFIG);
      const spyCtx: ToolContext = {
        getClient: getClientSpy,
        getConfig: getConfigSpy,
      };
      await findTool("dooray_mail_list").handler(spyCtx, {});
      expect(getClientSpy).not.toHaveBeenCalled();
      expect(getConfigSpy).toHaveBeenCalledTimes(1);
    });

    it("dooray_mail_send: getClient 미호출, getConfig 1회", async () => {
      vi.mocked(sendMail).mockResolvedValue({ messageId: "<x>" });
      const getClientSpy = vi.fn();
      const getConfigSpy = vi.fn().mockResolvedValue(MOCK_CONFIG);
      const spyCtx: ToolContext = {
        getClient: getClientSpy,
        getConfig: getConfigSpy,
      };
      await findTool("dooray_mail_send").handler(spyCtx, {
        to: "a@b",
        subject: "s",
        body: "b",
      });
      expect(getClientSpy).not.toHaveBeenCalled();
      expect(getConfigSpy).toHaveBeenCalledTimes(1);
    });

    it("dooray_calendar_list: getConfig 미호출, getClient 1회", async () => {
      const client = makeMockClient();
      (client.listCalendars as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const getClientSpy = vi.fn().mockResolvedValue(client);
      const getConfigSpy = vi.fn();
      const spyCtx: ToolContext = {
        getClient: getClientSpy,
        getConfig: getConfigSpy,
      };
      await findTool("dooray_calendar_list").handler(spyCtx, {});
      expect(getConfigSpy).not.toHaveBeenCalled();
      expect(getClientSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ── ctx 메모이즈 검증 ────────────────────────────────────────────────

  it("ctx.getClient 메모: 동일 ctx 로 핸들러 2회 호출 시 factory 1회", async () => {
    const client = makeMockClient();
    (client.listCalendars as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const factory = vi.fn().mockResolvedValue(client);
    let memo: Promise<DoorayClient> | undefined;
    const memoCtx: ToolContext = {
      getClient: () => (memo ??= factory()),
      getConfig: async () => MOCK_CONFIG,
    };
    await findTool("dooray_calendar_list").handler(memoCtx, {});
    await findTool("dooray_calendar_list").handler(memoCtx, {});
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("ctx.getConfig 메모: 동일 ctx 로 메일 핸들러 2회 호출 시 factory 1회", async () => {
    vi.mocked(listMail).mockResolvedValue([]);
    const configFactory = vi.fn().mockResolvedValue(MOCK_CONFIG);
    let memo: Promise<Credentials> | undefined;
    const memoCtx: ToolContext = {
      getClient: async () => makeMockClient(),
      getConfig: () => (memo ??= configFactory()),
    };
    await findTool("dooray_mail_list").handler(memoCtx, {});
    await findTool("dooray_mail_list").handler(memoCtx, {});
    expect(configFactory).toHaveBeenCalledTimes(1);
  });
});
