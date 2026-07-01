// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

/** Dooray REST API 공통 응답 봉투. 모든 응답이 이 형태로 온다. */
export interface DoorayResponse<T> {
  header: {
    isSuccessful: boolean;
    resultCode: number;
    resultMessage: string;
  };
  result: T;
  totalCount?: number;
}

export interface Member {
  organizationMemberId: string;
  name: string;
}

export interface MemberSearchHit {
  id: string;
  name: string;
  externalEmailAddress?: string;
}

export interface Me {
  id: string;
  name: string;
  tenantId?: string;
}

export interface Project {
  id: string;
  code: string;
  wiki?: { id: string } | null;
}

export interface PostBody {
  mimeType: string;
  content: string;
}

export interface Post {
  id: string;
  number: number;
  subject: string;
  body?: PostBody;
  workflowClass?: string;
}

export interface PostComment {
  id: string;
  body?: PostBody;
  creator?: { member?: { organizationMemberId: string } };
  createdAt?: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Milestone {
  id: string;
  name: string;
}

export interface Workflow {
  id: string;
  name: string;
  class: string;
}

export interface MemberGroup {
  id: string;
  code?: string;
}

export interface Template {
  id: string;
  templateName: string;
}

export interface FileMeta {
  id: string;
  name: string;
  size: number;
}

export interface Wiki {
  id: string;
  project: { id: string };
  name: string;
}

export interface WikiPage {
  id: string;
  subject: string;
  body?: PostBody;
  parentPageId?: string | null;
}

export interface WikiComment {
  id: string;
  body?: { content: string };
  createdAt?: string;
}

// ── 캘린더 ───────────────────────────────────────────────

export interface Calendar {
  id: string;
  name?: string;
}

export interface CalendarEvent {
  id: string;
  subject: string;
  startedAt?: string;
  endedAt?: string;
  calendarId?: string;
}

// ── 메신저 (실험적) ──────────────────────────────────────
// TODO(verify): 공식 API 대조 필요 — 필드명(title vs name)이 불확실하다.

export interface MessengerChannel {
  id: string;
  title?: string;
}

// ── 드라이브 (실험적) ────────────────────────────────────
// TODO(verify): 공식 API 대조 필요 — 필드명·응답 형태가 불확실하다.

export interface Drive {
  id: string;
  name?: string;
}

// ── 요청 바디 ────────────────────────────────────────────

/** 업무 수신·참조 대상. Dooray 는 users.to / users.cc 로 멤버를 싣는다. */
export interface PostUserRef {
  type: "member";
  member: { organizationMemberId: string };
}

export interface PostInput {
  subject: string;
  body: PostBody;
  users?: { to?: PostUserRef[]; cc?: PostUserRef[] };
  tagIdList?: string[];
  // TODO(verify): payload 필드명 불확실 — Dooray 업무 생성 바디에서 마일스톤/초기
  // 워크플로 키가 milestoneId / workflowId 라고 가정한다. 실제 필드명이 다를 수 있다.
  milestoneId?: string;
  workflowId?: string;
}

export interface WikiPageInput {
  subject: string;
  body: PostBody;
  parentPageId?: string;
}

export interface CommentInput {
  body: PostBody;
}

export interface WikiCommentInput {
  body: { content: string };
}

export interface CalendarEventInput {
  subject: string;
  body?: PostBody;
  startedAt: string;
  endedAt: string;
  wholeDayFlag?: boolean;
  users?: { to?: PostUserRef[] };
}
