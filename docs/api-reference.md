# API 레퍼런스

dooray-agent 가 래핑하는 Dooray REST API 와 명령 → 엔드포인트 대응.

## 공통

- 인증: `Authorization: dooray-api <token>` 헤더.
- 응답 봉투: `{ header: { isSuccessful, resultCode, resultMessage }, result, totalCount? }`.
- 페이지네이션: `page`(0-base)·`size`. `totalCount` 를 채울 때까지 순회한다.

## 멤버

| 명령              | 메서드·경로                                                    |
| ----------------- | -------------------------------------------------------------- |
| `whoami`          | `GET /common/v1/members/me`                                    |
| `member get <id>` | `GET /common/v1/members/{id}`                                  |
| `member search`   | `GET /common/v1/members?name=` 또는 `?externalEmailAddresses=` |
| `project members` | `GET /project/v1/projects/{id}/members`                        |

## 프로젝트 메타

| 명령                 | 경로                                                             |
| -------------------- | ---------------------------------------------------------------- |
| `project list`       | `GET /project/v1/projects?member=me`                             |
| `project workflows`  | `GET /project/v1/projects/{id}/workflows`                        |
| `project tags`       | `GET /project/v1/projects/{id}/tags`                             |
| `project milestones` | `GET /project/v1/projects/{id}/milestones`                       |
| `project groups`     | `GET /project/v1/projects/{id}/member-groups` (중첩 배열 평면화) |
| `project templates`  | `GET /project/v1/projects/{id}/templates`                        |

## 업무

| 명령                                    | 메서드·경로                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `post list` / `post search`             | `GET /project/v1/projects/{id}/posts` (`order=-createdAt`, `subjects=` 필터) |
| `post get`                              | `GET .../posts/{postId}`                                                     |
| `post create`                           | `POST .../posts`                                                             |
| `post edit`                             | `PUT .../posts/{postId}`                                                     |
| `post workflow` / `post done`           | `POST .../posts/{postId}/set-workflow` (done 은 closed 워크플로로 전이)      |
| `post comment list/add/edit/delete`     | `.../posts/{postId}/logs[/{logId}]`                                          |
| `post file list/upload/download/delete` | `.../posts/{postId}/files[/{fileId}]` (다운/업로드 307)                      |

## 위키

| 명령                  | 메서드·경로                                 |
| --------------------- | ------------------------------------------- |
| `wiki pages`          | `GET /wiki/v1/wikis/{wikiId}/pages`         |
| `wiki page get`       | `GET .../pages/{pageId}`                    |
| `wiki page create`    | `POST .../pages`                            |
| `wiki page edit`      | `PUT .../pages/{pageId}`                    |
| `wiki page comment *` | `.../pages/{pageId}/comments[/{commentId}]` |
| `wiki page file *`    | `.../pages/{pageId}/files[/{fileId}]` (307) |

wikiId 는 프로젝트에 연결된 위키(`GET /wiki/v1/wikis` 에서 `project.id` 매칭)로 해석한다.

## 캘린더

| 명령              | 메서드·경로                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `calendar list`   | `GET /calendar/v1/calendars`                                             |
| `calendar events` | `GET /calendar/v1/calendars/*/events` (`timeMin`·`timeMax` RFC3339, `*`=전체 내 캘린더) |
| `calendar create` | `POST /calendar/v1/calendars/{calendarId}/events`                        |
| `calendar get`    | `GET .../calendars/{calendarId}/events/{eventId}`                        |
| `calendar edit`   | `PUT .../calendars/{calendarId}/events/{eventId}` (부분수정 read-merge)  |
| `calendar delete` | `DELETE .../calendars/{calendarId}/events/{eventId}`                     |

이벤트 본문은 `{ mimeType:"text/x-markdown", content }`. 종일 일정은 `wholeDayFlag:true`.

## 메일 (IMAP/SMTP — REST 아님)

메일은 Dooray REST 가 아니라 표준 IMAP/SMTP 로 동작한다(`src/dooray/mail.ts`). `token` 과 별개로 `imapHost`/`smtpHost`/`mailUser`/`mailPassword` config 가 필요하다.

| 명령        | 프로토콜·동작                                                                  |
| ----------- | ----------------------------------------------------------------------------- |
| `mail list` | IMAP(993/TLS) — mailbox 최근 N통 헤더를 최신순(`ImapFlow.fetch` envelope)      |
| `mail get`  | IMAP — UID 로 단일 메일 fetch 후 `mailparser`(`simpleParser`)로 본문 파싱      |
| `mail send` | SMTP(465/TLS) — `nodemailer` 발송, `{ messageId, status:"sent" }` 반환         |

## 메신저·드라이브 (실험적 — 미검증 가정)

아래 엔드포인트는 공식 API 로 대조되지 않은 **가정**이다(`src/dooray/client.ts` 의 `TODO(verify)` 마커). 경로·응답 형태가 실제와 다를 수 있어 자동화 의존 전 검증이 필요하다.

| 명령                 | 메서드·경로 (미검증 가정)                                       |
| -------------------- | -------------------------------------------------------------- |
| `messenger channels` | `GET /messenger/v1/channels`                                   |
| `messenger send`     | `POST /messenger/v1/channels/{channelId}/logs` (`{text}` → `{messageId, status:"sent"}`) |
| `drive list`         | `GET /drive/v1/drives`                                         |
| `drive files`        | `GET /drive/v1/drives/{driveId}/files`                         |
| `drive download`     | `.../drives/{driveId}/files/{fileId}` (307 가정, 기존 다운로드 경로 재사용) |
| `drive upload`       | `POST .../drives/{driveId}/files` (307 multipart 가정)         |

## 파일 307 처리

1. `redirect:"manual"` 로 첫 요청 → 307/308 이면 `Location` 추출.
2. 그 URL 에 인증 헤더를 다시 붙여 재요청(다운로드는 GET, 업로드는 POST 재전송).
3. 파일명은 `content-disposition` 에서 파싱 후 `sanitizeFileName` 으로 안전화.

세부 사실은 Dooray 공식 API 문서가 단일 소스다. 직관에 반하는 동작은 `docs/design-notes.md` 에 기록한다.
