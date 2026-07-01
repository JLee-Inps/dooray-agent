// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import ky, { HTTPError, type KyInstance, type Options } from "ky";
import { AppError, ExitCode } from "../core/errors";
import type {
  Calendar,
  CalendarEvent,
  CalendarEventInput,
  CommentInput,
  DoorayResponse,
  Drive,
  FileMeta,
  Me,
  Member,
  MemberGroup,
  MemberSearchHit,
  MessengerChannel,
  Milestone,
  Post,
  PostComment,
  PostInput,
  Project,
  Tag,
  Template,
  Wiki,
  WikiComment,
  WikiCommentInput,
  WikiPage,
  WikiPageInput,
  Workflow,
} from "./types";

type Query = Record<string, string | number | undefined>;

/** 한 페이지 조회 결과(순회용). */
export interface Page<T> {
  items: T[];
  totalCount: number;
}

/** 다운로드한 첨부파일(바이트 + 해석된 파일명). */
export interface DownloadedFile {
  buffer: Buffer;
  fileName: string;
}

/**
 * Dooray REST API 클라이언트.
 * 인증 헤더를 붙인 ky 인스턴스를 감싸고, 모든 호출을 단일 에러 타입으로 정규화한다.
 */
export class DoorayClient {
  readonly #http: KyInstance;
  readonly #token: string;
  readonly #baseUrl: string;

  constructor(token: string, baseUrl: string) {
    this.#token = token;
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#http = ky.create({
      prefixUrl: this.#baseUrl,
      headers: { Authorization: `dooray-api ${token}` },
      retry: 0,
    });
  }

  // ── 공통 요청 래퍼 ────────────────────────────────────

  async #send<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw await this.#normalize(error);
    }
  }

  async #normalize(error: unknown): Promise<AppError> {
    if (error instanceof AppError) return error;
    if (error instanceof HTTPError) {
      const status = error.response.status;
      const code =
        status === 401 || status === 403 ? ExitCode.Auth : ExitCode.Api;
      const detail = await this.#readMessage(error);
      return new AppError(`Dooray API 오류 (${status}): ${detail}`, code);
    }
    const message = error instanceof Error ? error.message : String(error);
    return new AppError(message, ExitCode.Api);
  }

  async #readMessage(error: HTTPError): Promise<string> {
    try {
      const body = (await error.response.json()) as DoorayResponse<unknown>;
      return body.header?.resultMessage || error.message;
    } catch {
      return error.message;
    }
  }

  #get<T>(path: string, query?: Query): Promise<DoorayResponse<T>> {
    const options: Options = query ? { searchParams: clean(query) } : {};
    return this.#send(() =>
      this.#http.get(path, options).json<DoorayResponse<T>>(),
    );
  }

  #post<T>(path: string, json: unknown): Promise<DoorayResponse<T>> {
    return this.#send(() =>
      this.#http.post(path, { json }).json<DoorayResponse<T>>(),
    );
  }

  #put<T>(path: string, json: unknown): Promise<DoorayResponse<T>> {
    return this.#send(() =>
      this.#http.put(path, { json }).json<DoorayResponse<T>>(),
    );
  }

  #delete(path: string): Promise<void> {
    return this.#send(async () => {
      await this.#http.delete(path);
    });
  }

  // ── 멤버 ──────────────────────────────────────────────

  async getMe(): Promise<Me> {
    return (await this.#get<Me>("common/v1/members/me")).result;
  }

  async getMember(memberId: string): Promise<MemberSearchHit> {
    return (await this.#get<MemberSearchHit>(`common/v1/members/${memberId}`))
      .result;
  }

  async searchMembers(query: Query): Promise<MemberSearchHit[]> {
    return (await this.#get<MemberSearchHit[]>("common/v1/members", query))
      .result;
  }

  async listProjectMembers(projectId: string): Promise<Member[]> {
    return this.#collect((page, size) =>
      this.#page<Member>(`project/v1/projects/${projectId}/members`, {
        page,
        size,
      }),
    );
  }

  // ── 프로젝트 메타 ─────────────────────────────────────

  async listProjects(): Promise<Project[]> {
    return this.#collect((page, size) =>
      this.#page<Project>("project/v1/projects", { member: "me", page, size }),
    );
  }

  async createProject(input: {
    code: string;
    description?: string;
    scope?: string;
  }): Promise<{ id: string }> {
    return (await this.#post<{ id: string }>("project/v1/projects", input))
      .result;
  }

  async listWorkflows(projectId: string): Promise<Workflow[]> {
    return (
      await this.#get<Workflow[]>(`project/v1/projects/${projectId}/workflows`)
    ).result;
  }

  async listTags(projectId: string): Promise<Tag[]> {
    return this.#collect((page, size) =>
      this.#page<Tag>(`project/v1/projects/${projectId}/tags`, { page, size }),
    );
  }

  async listMilestones(projectId: string): Promise<Milestone[]> {
    return this.#collect((page, size) =>
      this.#page<Milestone>(`project/v1/projects/${projectId}/milestones`, {
        page,
        size,
      }),
    );
  }

  async listMemberGroups(projectId: string): Promise<MemberGroup[]> {
    // Dooray 는 그룹 목록을 중첩 배열로 돌려주기도 한다 — 1 레벨 평면화(멱등).
    const res = await this.#get<MemberGroup[] | MemberGroup[][]>(
      `project/v1/projects/${projectId}/member-groups`,
      { page: 0, size: 100 },
    );
    return (res.result as MemberGroup[][]).flat();
  }

  async listTemplates(projectId: string): Promise<Template[]> {
    return this.#collect((page, size) =>
      this.#page<Template>(`project/v1/projects/${projectId}/templates`, {
        page,
        size,
      }),
    );
  }

  // ── 업무 ──────────────────────────────────────────────

  async listPosts(projectId: string, query?: Query): Promise<Page<Post>> {
    return this.#page<Post>(`project/v1/projects/${projectId}/posts`, {
      ...query,
    });
  }

  async getPost(projectId: string, postId: string): Promise<Post> {
    return (
      await this.#get<Post>(`project/v1/projects/${projectId}/posts/${postId}`)
    ).result;
  }

  async createPost(
    projectId: string,
    input: PostInput,
  ): Promise<{ id: string }> {
    return (
      await this.#post<{ id: string }>(
        `project/v1/projects/${projectId}/posts`,
        input,
      )
    ).result;
  }

  async updatePost(
    projectId: string,
    postId: string,
    input: PostInput,
  ): Promise<void> {
    await this.#put(`project/v1/projects/${projectId}/posts/${postId}`, input);
  }

  async setPostWorkflow(
    projectId: string,
    postId: string,
    workflowId: string,
  ): Promise<void> {
    await this.#post(
      `project/v1/projects/${projectId}/posts/${postId}/set-workflow`,
      { workflowId },
    );
  }

  // ── 업무 댓글 (logs) ──────────────────────────────────

  async listPostComments(
    projectId: string,
    postId: string,
    query?: Query,
  ): Promise<Page<PostComment>> {
    return this.#page<PostComment>(
      `project/v1/projects/${projectId}/posts/${postId}/logs`,
      { ...query },
    );
  }

  async createPostComment(
    projectId: string,
    postId: string,
    input: CommentInput,
  ): Promise<{ id: string }> {
    return (
      await this.#post<{ id: string }>(
        `project/v1/projects/${projectId}/posts/${postId}/logs`,
        input,
      )
    ).result;
  }

  async updatePostComment(
    projectId: string,
    postId: string,
    commentId: string,
    input: CommentInput,
  ): Promise<void> {
    await this.#put(
      `project/v1/projects/${projectId}/posts/${postId}/logs/${commentId}`,
      input,
    );
  }

  async deletePostComment(
    projectId: string,
    postId: string,
    commentId: string,
  ): Promise<void> {
    await this.#delete(
      `project/v1/projects/${projectId}/posts/${postId}/logs/${commentId}`,
    );
  }

  // ── 업무 첨부파일 ─────────────────────────────────────

  async listPostFiles(projectId: string, postId: string): Promise<FileMeta[]> {
    return (
      await this.#get<FileMeta[]>(
        `project/v1/projects/${projectId}/posts/${postId}/files`,
      )
    ).result;
  }

  async uploadPostFile(
    projectId: string,
    postId: string,
    filePath: string,
  ): Promise<string> {
    return this.#uploadFile(
      `project/v1/projects/${projectId}/posts/${postId}/files`,
      filePath,
    );
  }

  async downloadPostFile(
    projectId: string,
    postId: string,
    fileId: string,
  ): Promise<DownloadedFile> {
    return this.#downloadFile(
      `project/v1/projects/${projectId}/posts/${postId}/files`,
      fileId,
    );
  }

  async deletePostFile(
    projectId: string,
    postId: string,
    fileId: string,
  ): Promise<void> {
    await this.#delete(
      `project/v1/projects/${projectId}/posts/${postId}/files/${fileId}`,
    );
  }

  // ── 위키 ──────────────────────────────────────────────

  async listWikis(): Promise<Wiki[]> {
    return this.#collect((page, size) =>
      this.#page<Wiki>("wiki/v1/wikis", { page, size }),
    );
  }

  async listWikiPages(wikiId: string): Promise<Page<WikiPage>> {
    return this.#page<WikiPage>(`wiki/v1/wikis/${wikiId}/pages`, {});
  }

  async getWikiPage(wikiId: string, pageId: string): Promise<WikiPage> {
    return (
      await this.#get<WikiPage>(`wiki/v1/wikis/${wikiId}/pages/${pageId}`)
    ).result;
  }

  async createWikiPage(
    wikiId: string,
    input: WikiPageInput,
  ): Promise<{ id: string }> {
    return (
      await this.#post<{ id: string }>(`wiki/v1/wikis/${wikiId}/pages`, input)
    ).result;
  }

  async updateWikiPage(
    wikiId: string,
    pageId: string,
    input: WikiPageInput,
  ): Promise<void> {
    await this.#put(`wiki/v1/wikis/${wikiId}/pages/${pageId}`, input);
  }

  async deleteWikiPage(wikiId: string, pageId: string): Promise<void> {
    await this.#delete(`wiki/v1/wikis/${wikiId}/pages/${pageId}`);
  }

  // ── 위키 페이지 댓글 ──────────────────────────────────

  async listWikiComments(
    wikiId: string,
    pageId: string,
  ): Promise<Page<WikiComment>> {
    return this.#page<WikiComment>(
      `wiki/v1/wikis/${wikiId}/pages/${pageId}/comments`,
      {},
    );
  }

  async createWikiComment(
    wikiId: string,
    pageId: string,
    input: WikiCommentInput,
  ): Promise<{ id: string }> {
    return (
      await this.#post<{ id: string }>(
        `wiki/v1/wikis/${wikiId}/pages/${pageId}/comments`,
        input,
      )
    ).result;
  }

  async updateWikiComment(
    wikiId: string,
    pageId: string,
    commentId: string,
    input: WikiCommentInput,
  ): Promise<void> {
    await this.#put(
      `wiki/v1/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`,
      input,
    );
  }

  async deleteWikiComment(
    wikiId: string,
    pageId: string,
    commentId: string,
  ): Promise<void> {
    await this.#delete(
      `wiki/v1/wikis/${wikiId}/pages/${pageId}/comments/${commentId}`,
    );
  }

  // ── 위키 첨부파일 ─────────────────────────────────────

  async listWikiFiles(wikiId: string, pageId: string): Promise<FileMeta[]> {
    return (
      await this.#get<FileMeta[]>(
        `wiki/v1/wikis/${wikiId}/pages/${pageId}/files`,
      )
    ).result;
  }

  async uploadWikiFile(
    wikiId: string,
    pageId: string,
    filePath: string,
  ): Promise<string> {
    return this.#uploadFile(
      `wiki/v1/wikis/${wikiId}/pages/${pageId}/files`,
      filePath,
    );
  }

  async downloadWikiFile(
    wikiId: string,
    pageId: string,
    fileId: string,
  ): Promise<DownloadedFile> {
    return this.#downloadFile(
      `wiki/v1/wikis/${wikiId}/pages/${pageId}/files`,
      fileId,
    );
  }

  async deleteWikiFile(
    wikiId: string,
    pageId: string,
    fileId: string,
  ): Promise<void> {
    await this.#delete(
      `wiki/v1/wikis/${wikiId}/pages/${pageId}/files/${fileId}`,
    );
  }

  // ── 캘린더 ────────────────────────────────────────────

  async listCalendars(): Promise<Calendar[]> {
    return (await this.#get<Calendar[]>("calendar/v1/calendars")).result;
  }

  async listEvents(query: {
    timeMin: string;
    timeMax: string;
  }): Promise<CalendarEvent[]> {
    // `*` = 전체 내 캘린더 대상 이벤트 조회.
    return (
      await this.#get<CalendarEvent[]>("calendar/v1/calendars/*/events", {
        timeMin: query.timeMin,
        timeMax: query.timeMax,
      })
    ).result;
  }

  async createEvent(
    calendarId: string,
    input: CalendarEventInput,
  ): Promise<{ id: string }> {
    return (
      await this.#post<{ id: string }>(
        `calendar/v1/calendars/${calendarId}/events`,
        input,
      )
    ).result;
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    return (
      await this.#get<CalendarEvent>(
        `calendar/v1/calendars/${calendarId}/events/${eventId}`,
      )
    ).result;
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    input: CalendarEventInput,
  ): Promise<void> {
    await this.#put(
      `calendar/v1/calendars/${calendarId}/events/${eventId}`,
      input,
    );
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.#delete(`calendar/v1/calendars/${calendarId}/events/${eventId}`);
  }

  // ── 메신저 (실험적) ───────────────────────────────────

  // TODO(verify): 공식 API 대조 필요 — 엔드포인트·응답 형태가 불확실하다.
  async listChannels(): Promise<MessengerChannel[]> {
    return (await this.#get<MessengerChannel[]>("messenger/v1/channels"))
      .result;
  }

  // TODO(verify): 공식 API 대조 필요 — logs 경로·바디({text})·응답({id})이 불확실하다.
  async sendMessage(channelId: string, text: string): Promise<{ id: string }> {
    return (
      await this.#post<{ id: string }>(
        `messenger/v1/channels/${channelId}/logs`,
        { text },
      )
    ).result;
  }

  // ── 드라이브 (실험적) ─────────────────────────────────

  // TODO(verify): 공식 API 대조 필요 — 엔드포인트·응답 형태가 불확실하다.
  async listDrives(): Promise<Drive[]> {
    return (await this.#get<Drive[]>("drive/v1/drives")).result;
  }

  // TODO(verify): 공식 API 대조 필요 — files 경로·FileMeta 필드가 불확실하다.
  async listDriveFiles(driveId: string): Promise<FileMeta[]> {
    return (await this.#get<FileMeta[]>(`drive/v1/drives/${driveId}/files`))
      .result;
  }

  // TODO(verify): 공식 API 대조 필요 — 파일 endpoint 가 307 이라는 가정으로
  // 기존 #downloadFile(basePath, fileId) 를 재사용한다. media=raw·경로가 다를 수 있다.
  async downloadDriveFile(
    driveId: string,
    fileId: string,
  ): Promise<DownloadedFile> {
    return this.#downloadFile(`drive/v1/drives/${driveId}/files`, fileId);
  }

  // TODO(verify): 공식 API 대조 필요 — multipart 업로드가 307 이라는 가정으로
  // 기존 #uploadFile(basePath, filePath) 를 재사용한다. 필드명·응답이 다를 수 있다.
  async uploadDriveFile(driveId: string, filePath: string): Promise<string> {
    return this.#uploadFile(`drive/v1/drives/${driveId}/files`, filePath);
  }

  // ── 첨부파일 수동 fetch (Dooray 파일 endpoint 는 307 redirect) ──

  /**
   * 파일 바이트를 내려받는다. 첫 요청은 `redirect:"manual"` 로 307 을 받고,
   * Location 이 가리키는 실제 URL 에 재요청한다.
   * same-scope(동일 호스트 또는 동일 등록가능 도메인) 일 때만 인증 헤더를 재부착한다.
   * 외부 호스트로 리다이렉트되면 Authorization 헤더 없이 재요청해 토큰 유출을 방지한다.
   */
  async #downloadFile(
    basePath: string,
    fileId: string,
  ): Promise<DownloadedFile> {
    return this.#send(async () => {
      const url = `${this.#baseUrl}/${basePath}/${fileId}?media=raw`;
      const first = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: this.#authHeader(),
      });
      let response: Response;
      if (isRedirect(first.status)) {
        const location = redirectLocation(first);
        // 상대 Location 방어: fetch 에 전달할 URL 을 절대화한다.
        const absLocation = new URL(location, this.#baseUrl).toString();
        const headers = sameAuthScope(this.#baseUrl, location)
          ? this.#authHeader()
          : undefined;
        response = await fetch(absLocation, { method: "GET", headers });
      } else {
        response = first;
      }
      await this.#ensureOk(response);
      const buffer = Buffer.from(await response.arrayBuffer());
      const fileName = parseContentDisposition(
        response.headers.get("content-disposition"),
        `file-${fileId}`,
      );
      return { buffer, fileName };
    });
  }

  /**
   * 로컬 파일을 multipart 로 업로드한다. 307 이면 Location 으로 재-POST 하되
   * FormData 는 스트림이 소진되므로 매번 새로 빌드한다. result.id 를 돌려준다.
   * same-scope 일 때만 인증 헤더를 재부착한다(외부 호스트 토큰 유출 방지).
   */
  async #uploadFile(basePath: string, filePath: string): Promise<string> {
    return this.#send(async () => {
      const bytes = await readFile(filePath);
      const fileName = basename(filePath);
      const url = `${this.#baseUrl}/${basePath}`;
      const first = await fetch(url, {
        method: "POST",
        redirect: "manual",
        headers: this.#authHeader(),
        body: buildForm(bytes, fileName),
      });
      let response: Response;
      if (isRedirect(first.status)) {
        const location = redirectLocation(first);
        // 상대 Location 방어: fetch 에 전달할 URL 을 절대화한다.
        const absLocation = new URL(location, this.#baseUrl).toString();
        const headers = sameAuthScope(this.#baseUrl, location)
          ? this.#authHeader()
          : undefined;
        response = await fetch(absLocation, {
          method: "POST",
          headers,
          body: buildForm(bytes, fileName),
        });
      } else {
        response = first;
      }
      await this.#ensureOk(response);
      const body = (await response.json()) as DoorayResponse<{ id: string }>;
      return body.result.id;
    });
  }

  #authHeader(): Record<string, string> {
    return { Authorization: `dooray-api ${this.#token}` };
  }

  /** ok 가 아니면 응답 본문의 메시지를 담아 AppError 로 던진다. */
  async #ensureOk(response: Response): Promise<void> {
    if (response.ok) return;
    const status = response.status;
    const code =
      status === 401 || status === 403 ? ExitCode.Auth : ExitCode.Api;
    let detail = response.statusText;
    try {
      const body = (await response.json()) as DoorayResponse<unknown>;
      detail = body.header?.resultMessage || detail;
    } catch {
      // 본문이 JSON 이 아니면 statusText 를 그대로 쓴다.
    }
    throw new AppError(`Dooray API 오류 (${status}): ${detail}`, code);
  }

  // ── 페이지네이션 도우미 ───────────────────────────────

  async #page<T>(path: string, query: Query): Promise<Page<T>> {
    const res = await this.#get<T[]>(path, query);
    return {
      items: res.result,
      totalCount: res.totalCount ?? res.result.length,
    };
  }

  /** totalCount 를 채울 때까지 페이지를 끝까지 모은다. */
  async #collect<T>(
    fetchPage: (page: number, size: number) => Promise<Page<T>>,
    size = 100,
  ): Promise<T[]> {
    const all: T[] = [];
    let page = 0;
    for (;;) {
      const { items, totalCount } = await fetchPage(page, size);
      all.push(...items);
      if (all.length >= totalCount || items.length === 0) break;
      page += 1;
    }
    return all;
  }
}

/** undefined 쿼리 값을 떨궈 깔끔한 searchParams 를 만든다. */
function clean(query: Query): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** 메서드·바디를 보존하는 리다이렉트(307/308)만 처리한다. */
function isRedirect(status: number): boolean {
  return status === 307 || status === 308;
}

/** 리다이렉트 응답에서 Location 을 뽑거나 AppError 를 던진다. */
function redirectLocation(response: Response): string {
  const location = response.headers.get("location");
  if (!location) {
    throw new AppError(
      `Dooray 파일 리다이렉트에 Location 헤더가 없습니다 (${response.status})`,
      ExitCode.Api,
    );
  }
  return location;
}

/**
 * 리다이렉트 Location 이 baseUrl 과 같은 인증 스코프인지 판정한다.
 * 같은 스코프이면 Authorization 헤더를 재부착해도 안전하다.
 *
 * 판정 규칙(보수적 — 기능 안 깨지게):
 * 1. `location` 을 `new URL(location, baseUrl)` 로 파싱(상대 경로 resolve).
 *    baseUrl 도 `new URL(baseUrl)` 로 파싱. 실패 시 false.
 * 2. hostname 이 정확히 같으면 true.
 * 3. 두 hostname 의 마지막 2개 라벨(등록가능 도메인 근사)이 같으면 true.
 *    예: api.dooray.com vs files.dooray.com → dooray.com 공유 → true.
 *
 * 한계(다중 라벨 TLD):
 * - co.kr 처럼 라벨이 2개인 TLD 를 사용하면 마지막 2라벨이 TLD 와 일치,
 *   실제로는 다른 등록가능 도메인이어도 true 를 반환할 수 있다.
 * - 부정확 시 방향은 "넓게 허용"이지만, Dooray 의 실제 리다이렉트는
 *   *.dooray.com 서브도메인이므로 이 근사로 충분하다.
 * - 공개 접미사 목록(PSL) 없이는 정확한 판정 불가 — 의도적 단순화.
 */
export function sameAuthScope(baseUrl: string, location: string): boolean {
  let baseHostname: string;
  let locHostname: string;
  try {
    baseHostname = new URL(baseUrl).hostname;
    locHostname = new URL(location, baseUrl).hostname;
  } catch {
    return false;
  }
  if (baseHostname === locHostname) return true;
  // 마지막 2개 라벨 비교(등록가능 도메인 근사)
  const baseLabels = baseHostname.split(".");
  const locLabels = locHostname.split(".");
  if (baseLabels.length < 2 || locLabels.length < 2) return false;
  const baseTld = baseLabels[baseLabels.length - 1];
  const baseSld = baseLabels[baseLabels.length - 2];
  const locTld = locLabels[locLabels.length - 1];
  const locSld = locLabels[locLabels.length - 2];
  // noUncheckedIndexedAccess: 인덱스 접근 결과가 undefined 일 수 있으므로 방어
  if (
    baseTld === undefined ||
    baseSld === undefined ||
    locTld === undefined ||
    locSld === undefined
  )
    return false;
  return baseTld === locTld && baseSld === locSld;
}

/**
 * 서버가 준 파일명을 안전한 단일 파일명으로 좁힌다.
 * 경로 요소를 떨구고(basename), `.`/`..`/빈 값은 최종 fallback 으로 치환한다.
 * 서버·사용자 입력이 `../` 등으로 --out 밖을 노리는 것을 막는다.
 */
export function sanitizeFileName(name: string): string {
  const base = basename(name.trim());
  if (base === "" || base === "." || base === "..") return "download";
  return base;
}

/**
 * content-disposition 헤더에서 파일명을 파싱한다.
 * `filename*=<charset>'<lang>'<pct-encoded>`(RFC 5987, 언어태그 포함) 를 우선하고,
 * 없으면 `filename="..."` / `filename=...`. 결과와 fallback 모두 sanitize 한다.
 */
export function parseContentDisposition(
  header: string | null,
  fallback: string,
): string {
  if (header) {
    const extended = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header);
    if (extended?.[1]) {
      try {
        return sanitizeFileName(decodeURIComponent(extended[1].trim()));
      } catch {
        // 디코딩 실패 시 다음 패턴으로 넘어간다.
      }
    }
    const quoted = /filename\s*=\s*"([^"]+)"/i.exec(header);
    if (quoted?.[1]) return sanitizeFileName(quoted[1]);
    const bare = /filename\s*=\s*([^";]+)/i.exec(header);
    if (bare?.[1]) return sanitizeFileName(bare[1]);
  }
  return sanitizeFileName(fallback);
}

/** 업로드용 multipart FormData 를 새로 빌드한다(스트림 재사용 불가). */
function buildForm(bytes: Buffer, fileName: string): FormData {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), fileName);
  return form;
}
