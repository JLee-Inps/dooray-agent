# 계약: 명령 표면 + 출력 스키마

dooray-agent 가 외부에 보장하는 동작. 이 표면은 자동화가 의존하므로 **불변**으로 지킨다.
바꾸려면 이 계약을 먼저 갱신한다.

## 전역 옵션 (모든 명령)

- `--json` — 구조화된 JSON 출력
- `--quiet` — 식별자만 출력(파이프용)
- `--no-color` — 색상 비활성화(`NO_COLOR` env 동일)

## 출력 3-모드 (불변)

- 읽기: `--json` = 원자료 / `--quiet` = 식별자 목록 / 기본 = 표(+ 본문)
- 쓰기: `--json` = `{ ...id, status }` / `--quiet` = 대표 식별자 / 기본 = 사람이 읽는 한 줄
- 데이터는 stdout, 스피너·에러는 stderr

## 쓰기 결과 status 값 (불변)

| 동작     | status       | 대표 필드                           |
| -------- | ------------ | ----------------------------------- |
| 생성     | `created`    | `{postId}`/`{pageId}`/`{commentId}` |
| 수정     | `updated`    | 동일                                |
| 삭제     | `deleted`    | 동일                                |
| 완료     | `done`       | `{postId}`                          |
| 워크플로 | `updated`    | `{postId, workflow}`                |
| 업로드   | `uploaded`   | `{fileId}`                          |
| 다운로드 | `downloaded` | `{outputPath, fileName, size}`      |

## 부분 수정 보존 (불변)

`edit` 계열은 부분 수정 — 지정하지 않은 필드는 현재 값을 유지한다. 서버 PUT 은 전체 교체이므로 GET 으로 현재값을 읽어 미지정 필드를 재공급한다(read-merge-resupply — PUT 이 교체든 병합이든 안전).

- `post edit` — 보존: `subject`·`body`·`tags`·담당자(`to`/`cc`). **milestone·초기 workflow 는 보존하지 않음**(known limitation: PUT 필드명 미확인 — 잘못된 추측 PUT 은 데이터 오염 위험). workflow 전이는 `post workflow` 전용 명령으로 관리.
- `calendar event edit` — 보존: `subject`·`startedAt`·`endedAt`·`body`·`wholeDayFlag`·참석자(`users`).

## 에러 (불변)

- 종료 코드: 0 성공 · 1 API · 2 인증 · 3 사용법 · 4 설정
- `--json` 모드: `{ error: { message, code } }` (stderr)
- 그 외: `오류: <message>` (stderr)

## 명령 그룹

`login`·`whoami`·`doctor`·`setup`·`config` · `project(list/members/tags/milestones/workflows/groups/templates)` · `post(list/get/create/edit/done/workflow/search/comment/file)` · `wiki(pages/page get·create·edit/comment/file)` · `member(get/search)` · `mail(list/get/send)` · `cache`·`feedback`·`capabilities`.

전체 목록·인자·옵션은 런타임에 `dooray-agent capabilities --json` 으로 얻는다(항상 최신).

## MCP 도구 표면 (교차참조)

`dooray-agent-mcp`(stdio, 두 번째 bin)가 위 CLI 명령을 미러하는 **MCP 도구 표면**은 `contracts/mcp-tools.md` 를 SSOT 로 한다. 명명 규칙·flat JSON 인자·`isError` 에러 표현이 CLI 3-모드와 다른 별개 표면이므로 분리해 관리한다.
