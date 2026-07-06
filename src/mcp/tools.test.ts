// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { vi, describe, it, expect, beforeEach } from "vitest";
import { tools } from "./tools";
import { AppError, ExitCode } from "../core/errors";
import { clearCache } from "../core/cache";
import type { DoorayClient } from "../dooray/client";
import type { Post, WikiPage } from "../dooray/types";

/** 15자리 raw ID — resolveProjectId/resolveWikiId 이름 해석을 우회한다. */
const RAW_PROJECT = "100000000000001";
const RAW_WIKI_ID = "200000000000001";
const RAW_POST_ID = "300000000000001";
const RAW_PAGE_ID = "400000000000001";
const RAW_COMMENT_ID = "500000000000001";
const RAW_WORKFLOW_ID = "600000000000001";

/** 위키 테스트용 mock wiki list. RAW_PROJECT 와 연결. */
const WIKI_LIST = [
  { id: RAW_WIKI_ID, project: { id: RAW_PROJECT }, name: "test-wiki" },
];

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
  } as unknown as DoorayClient;
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
  });

  // ── 1. dooray_whoami ────────────────────────────────────────────────
  it("dooray_whoami: getMe() 호출 결과 반환", async () => {
    const client = makeMockClient();
    const me = { id: "me-1", name: "홍길동" };
    (client.getMe as ReturnType<typeof vi.fn>).mockResolvedValue(me);
    const result = await findTool("dooray_whoami").handler(client, {});
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
    const result = await findTool("dooray_project_list").handler(client, {});
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
      const result = await findTool("dooray_member_search").handler(client, {
        email: "a@b.com",
      });
      expect(client.searchMembers).toHaveBeenCalledWith({
        externalEmailAddresses: "a@b.com",
      });
      expect(result).toEqual(hits);
    });

    it("name 으로 searchMembers 호출", async () => {
      const client = makeMockClient();
      (client.searchMembers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await findTool("dooray_member_search").handler(client, { name: "홍길동" });
      expect(client.searchMembers).toHaveBeenCalledWith({ name: "홍길동" });
    });

    it("email, name 둘 다 없으면 AppError(Usage) throw", async () => {
      const client = makeMockClient();
      await expect(
        findTool("dooray_member_search").handler(client, {}),
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
    const result = await findTool("dooray_post_list").handler(client, {
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
    await findTool("dooray_post_list").handler(client, {
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
    const result = await findTool("dooray_post_get").handler(client, {
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
    const result = await findTool("dooray_post_create").handler(client, {
      project: RAW_PROJECT,
      title: "새 업무",
      body: "내용",
    });
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
    await findTool("dooray_post_create").handler(client, {
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
      const result = await findTool("dooray_post_edit").handler(client, {
        project: RAW_PROJECT,
        postId: RAW_POST_ID,
        title: "새 제목",
      });
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
      await findTool("dooray_post_edit").handler(client, {
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
      await findTool("dooray_post_edit").handler(client, {
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
  });

  // ── 8. dooray_post_done ─────────────────────────────────────────────
  it("dooray_post_done: closed 워크플로를 찾아 setPostWorkflow 호출", async () => {
    const client = makeMockClient();
    // listWorkflows 는 cached 를 거치므로 mock 필요
    (client.listWorkflows as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: RAW_WORKFLOW_ID, name: "완료", class: "closed" },
      { id: "600000000000002", name: "진행중", class: "open" },
    ]);
    const result = await findTool("dooray_post_done").handler(client, {
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
    // raw 15자리+ workflow ID 는 resolveWorkflowId 에서 통과
    const result = await findTool("dooray_post_workflow").handler(client, {
      project: RAW_PROJECT,
      postId: RAW_POST_ID,
      workflow: RAW_WORKFLOW_ID,
    });
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
    const result = await findTool("dooray_post_search").handler(client, {
      project: RAW_PROJECT,
      keyword: "검색어",
    });
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
    const result = await findTool("dooray_post_comment_list").handler(client, {
      project: RAW_PROJECT,
      postId: RAW_POST_ID,
    });
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
    const result = await findTool("dooray_post_comment_add").handler(client, {
      project: RAW_PROJECT,
      postId: RAW_POST_ID,
      body: "댓글 내용",
    });
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
    const result = await findTool("dooray_wiki_pages").handler(client, {
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
    const result = await findTool("dooray_wiki_page_get").handler(client, {
      project: RAW_PROJECT,
      pageId: RAW_PAGE_ID,
    });
    expect(client.getWikiPage).toHaveBeenCalledWith(RAW_WIKI_ID, RAW_PAGE_ID);
    expect(result).toEqual(page);
  });

  // ── 15. dooray_wiki_page_create ─────────────────────────────────────
  it("dooray_wiki_page_create: createWikiPage 호출 + { pageId, status:'created' } 반환", async () => {
    const client = makeMockClient();
    (client.createWikiPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: RAW_PAGE_ID,
    });
    const result = await findTool("dooray_wiki_page_create").handler(client, {
      project: RAW_PROJECT,
      title: "새 페이지",
      body: "본문",
    });
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
    await findTool("dooray_wiki_page_create").handler(client, {
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
      const result = await findTool("dooray_wiki_page_edit").handler(client, {
        project: RAW_PROJECT,
        pageId: RAW_PAGE_ID,
        title: "새 제목",
      });
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
      await findTool("dooray_wiki_page_edit").handler(client, {
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
    const result = await findTool("dooray_wiki_page_delete").handler(client, {
      project: RAW_PROJECT,
      pageId: RAW_PAGE_ID,
    });
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
    const result = await findTool("dooray_wiki_comment_add").handler(client, {
      project: RAW_PROJECT,
      pageId: RAW_PAGE_ID,
      body: "위키 댓글",
    });
    // 위키 댓글은 mimeType 없이 { content } 만 전송 (도메인 규칙)
    expect(client.createWikiComment).toHaveBeenCalledWith(
      RAW_WIKI_ID,
      RAW_PAGE_ID,
      { body: { content: "위키 댓글" } },
    );
    expect(result).toEqual({ commentId: RAW_COMMENT_ID, status: "created" });
  });
});
