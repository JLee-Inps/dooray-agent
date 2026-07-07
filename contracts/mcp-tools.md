# contracts/mcp-tools.md — MCP 도구 표면 (SSOT)

`dooray-agent-mcp`(두 번째 bin, stdio 전송)가 노출하는 **MCP 도구 표면**의 단일 출처.
CLI 명령 표면(`contracts/api-spec.md`)과 **별개의 공개 표면**이다 — 자동화(Claude Desktop·Claude Code·기타 로컬 MCP 클라이언트)가 이 계약에 의존한다.
구현(`src/mcp/tools.ts`·`src/mcp/serve.ts`)은 이 문서를 권위로 따르고, QA 가 1:1 대조한다.

## 전송·엔트리 (불변)

- **전송**: stdio 전용(JSON-RPC over stdin/stdout). 원격/HTTP 없음.
- **엔트리/바이너리**: `src/mcp.ts` → `dist/mcp.js` → bin `dooray-agent-mcp`. `dra`/`dooray-agent`(CLI)와 **같은 패키지·같은 코어** 공유.
- **stdout 청결**: stdout 은 JSON-RPC 전용. 배너·로그·스피너 금지(로그는 stderr).
- **표면 종류**: `tools` 전용. resources/prompts 미의존(클라이언트 호환 최대화).
- **인증**: 기존 `~/.dooray-agent/config.json` + `createClient()` 재사용. 사용자는 `dra login` 한 번. 토큰은 로컬 밖으로 나가지 않는다. 미인증 시 최초 도구 호출에서 `AppError` → `isError` 로 표면화(서버 기동 자체는 config 없이 가능). 코드는 ExitCode 를 보존한다 — config 자체가 없으면 `code=4`(설정), config 는 있으나 토큰이 거부(API 401/403)되면 `code=2`(인증).

## 명명 규칙 (불변)

- `dooray_<group>_<action>` snake_case.
- `project` 인자는 프로젝트 **코드 또는 raw ID**를 모두 받는다(raw 15자리+ 통과, 그 외 이름 해석). `postId`/`pageId`/`commentId` 는 raw ID.
- `calendar` 인자는 raw calendarId 전용(이름 해석 없음 — `dooray_calendar_list` 로 확인). `eventId`/`uid` 는 raw. 메일은 이름 해석 없음.

## 도구 목록 (27개)

반환 열: **read** = API 원자료(리소스 타입 — `src/dooray/types.ts`, 메일은 `src/dooray/mail.ts`) · **write** = `{ ...id, status }` 봉투.

| # | tool | 인자 | 이름해석(resolve) | 반환 |
| - | ---- | ---- | ----------------- | ---- |
| 1 | `dooray_whoami` | `{}` | — | read `Me` |
| 2 | `dooray_project_list` | `{}` | — | read `Project[]` |
| 3 | `dooray_member_search` | `{ email?, name? }` (하나 이상 필수) | — | read `MemberSearchHit[]` |
| 4 | `dooray_post_list` | `{ project, page?=0, size?=20 }` | project | read `Post[]` (items) |
| 5 | `dooray_post_get` | `{ project, postId }` | project | read `Post` (body 포함) |
| 6 | `dooray_post_create` | `{ project, title, body?="" }` | project | write `{ postId, status:"created" }` |
| 7 | `dooray_post_edit` | `{ project, postId, title?, body? }` | project | write `{ postId, status:"updated" }` |
| 8 | `dooray_post_done` | `{ project, postId }` | project + closed workflow | write `{ postId, status:"done" }` |
| 9 | `dooray_post_workflow` | `{ project, postId, workflow }` | project + workflow | write `{ postId, workflow, status:"updated" }` |
| 10 | `dooray_post_search` | `{ project, keyword }` | project | read `Post[]` |
| 11 | `dooray_post_comment_list` | `{ project, postId }` | project | read `PostComment[]` |
| 12 | `dooray_post_comment_add` | `{ project, postId, body }` | project | write `{ commentId, status:"created" }` |
| 13 | `dooray_wiki_pages` | `{ project }` | wiki | read `WikiPage[]` |
| 14 | `dooray_wiki_page_get` | `{ project, pageId }` | wiki | read `WikiPage` (body 포함) |
| 15 | `dooray_wiki_page_create` | `{ project, title, body?="", parent? }` | wiki | write `{ pageId, status:"created" }` |
| 16 | `dooray_wiki_page_edit` | `{ project, pageId, title?, body? }` | wiki | write `{ pageId, status:"updated" }` |
| 17 | `dooray_wiki_page_delete` | `{ project, pageId }` | wiki | write `{ pageId, status:"deleted" }` |
| 18 | `dooray_wiki_comment_add` | `{ project, pageId, body }` | wiki | write `{ commentId, status:"created" }` |
| 19 | `dooray_calendar_list` | `{}` | — | read `Calendar[]` |
| 20 | `dooray_calendar_events` | `{ from?, to? }` (기본 지금~+7일 RFC3339, 전체 캘린더) | — | read `CalendarEvent[]` |
| 21 | `dooray_calendar_event_get` | `{ calendar, eventId }` | — | read `CalendarEvent` |
| 22 | `dooray_calendar_event_create` | `{ calendar, subject, start, end, body?, allDay? }` | — | write `{ eventId, status:"created" }` |
| 23 | `dooray_calendar_event_edit` | `{ calendar, eventId, subject?, start?, end?, body? }` | — | write `{ eventId, status:"updated" }` |
| 24 | `dooray_calendar_event_delete` | `{ calendar, eventId }` | — | write `{ eventId, status:"deleted" }` |
| 25 | `dooray_mail_list` | `{ mailbox?="INBOX", limit?=20 }` | — | read `MailHeader[]` |
| 26 | `dooray_mail_get` | `{ uid, mailbox?="INBOX" }` | — | read `MailMessage` |
| 27 | `dooray_mail_send` | `{ to, subject, body }` | — | write `{ messageId, status:"sent" }` |

## 도메인 규칙 (불변 — `dooray-agent-domain` 준수)

- **마크다운 mime**: 업무 본문·업무 댓글·위키 본문은 `{ mimeType:"text/x-markdown", content }`. **위키 댓글만 `{ content }`(mimeType 없음).**
- **부분 수정**(7·16): 현재 값을 읽어 미지정 필드를 유지한다. `dooray_post_edit`(7)는 `getPost` 로 `tags`·담당자(`to`/`cc`)까지 read-back 재공급한다(입력 표면은 title/body 만 — tag/cc/to 인자 없음이라 항상 현재값 보존). **milestone·workflow 는 보존 안 함**(known limitation). 위키(16)는 title/body 병합.
- **post done**(8): closed 클래스 워크플로를 찾아 set-workflow(전용 done 엔드포인트 미의존).
- **캘린더 mime**: 이벤트 body 는 `{ mimeType:"text/x-markdown", content }`. `allDay` → `wholeDayFlag:true`.
- **캘린더 부분수정**(23): `getEvent` 로 현재값 읽어 미지정 유지 — `body`·`wholeDayFlag`·참석자(`users`)까지 read-back 재공급한다(입력 표면은 subject/body/start/end 만). `startedAt`/`endedAt` 는 `updateEvent` 필수라 반드시 현재값을 공급.
- **캘린더 events 기본범위**(20): from/to 미지정 시 지금~+7일 RFC3339, 전체 캘린더(`*`).
- **메일 config 의존**: token 과 별개로 `imapHost`/`smtpHost`/`mailUser`/`mailPassword` config 필요. 미설정 시 `requireImap`/`requireSmtp` → `AppError(code=4 설정)`. baseline `getConfig`=`requireConfig`(login 전제, CLI 메일과 정합).
- **`dooray_mail_send`(27)는 외부 부작용**: 실제 메일 발송(되돌릴 수 없음).
- **mail `uid`**(26): `dooray_mail_list` 의 `uid` 값. 스키마 `z.string()`(number 관용 시 `z.coerce.string()`).

## 타입 SSOT (신규 없음)

- **반환**: `src/dooray/types.ts` 리소스 타입(읽기) + `{ ...id, status }` 쓰기 봉투(`contracts/api-spec.md` 「쓰기 결과 status 값」)를 **그대로 재사용**. 메일 반환은 `src/dooray/mail.ts`(MailHeader/MailMessage) 재사용. 신규 타입 SSOT 없음 — `tsc` 가 드리프트를 잡는다.
- **입력**: `src/mcp/tools.ts` 의 zod raw shape 로 선언(런타임 검증 + JSON Schema 자동 생성).

## 에러 표현 (불변)

- 모든 도구 오류는 단일 지점 `src/mcp/serve.ts` `runTool` 에서 `AppError` → MCP tool error 로 매핑:
  `{ isError: true, content: [{ type:"text", text: JSON.stringify({ error: { message, code } }) }] }`.
- `code` 는 `ExitCode` 를 보존(1 API · 2 인증 · 3 사용법 · 4 설정) — CLI `--json` 에러(`{ error:{ message, code } }`)와 **동일 스키마**.
- 성공은 `{ content: [{ type:"text", text: JSON.stringify(result) }] }`.
- **핸들러 컨텍스트**: 핸들러는 `(ctx: ToolContext, args)` 로 lazy `{ getClient(), getConfig() }`(각 메모이즈)를 받는다. 캘린더·기존 툴 = `getClient`, 메일 = `getConfig`. `runTool` 은 핸들러 실행 전 client 를 eager 구성하지 않는다 → 메일 툴은 DoorayClient 미구성. AppError→isError 매핑은 `runTool` 단일 지점 불변.

## v1 범위 밖 (Won't — 후속 Phase 후보)

- post create/edit 부가필드(tag/cc/to/milestone/초기 workflow) — 노출 시 `resolveExtras` 코어 추출 필요(CLI 무변경 원칙).
- 파일 upload/download, 댓글 edit/delete, wiki comment list, project meta(tags/milestones/workflows/groups/templates), member get, project create.
- messenger·drive·admin/config/setup/feedback/capabilities. (캘린더·메일은 Phase 3 에서 노출 완료.)
- 캘린더 참석자(users)·반복 일정, 메일 cc/첨부 — 후속 후보.
