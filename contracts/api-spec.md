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

## 에러 (불변)

- 종료 코드: 0 성공 · 1 API · 2 인증 · 3 사용법 · 4 설정
- `--json` 모드: `{ error: { message, code } }` (stderr)
- 그 외: `오류: <message>` (stderr)

## 명령 그룹

`login`·`whoami`·`doctor`·`setup`·`config` · `project(list/members/tags/milestones/workflows/groups/templates)` · `post(list/get/create/edit/done/workflow/search/comment/file)` · `wiki(pages/page get·create·edit/comment/file)` · `member(get/search)` · `mail(list/get/send)` · `cache`·`feedback`·`capabilities`.

전체 목록·인자·옵션은 런타임에 `dooray-agent capabilities --json` 으로 얻는다(항상 최신).
