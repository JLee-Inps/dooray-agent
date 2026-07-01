---
name: dooray-agent
description: NHN Dooray 문서(위키·업무)를 터미널에서 자동으로 읽고 쓰는 CLI. AI 에이전트가 두레이 문서를 조회·생성·수정·댓글 자동화할 때 사용. 모든 명령이 --json/--quiet 를 지원해 결과를 파싱·체이닝할 수 있다.
---

# dooray-agent — 에이전트용 Dooray 문서 자동화

`dooray-agent`(별칭 `dra`)는 NHN Dooray 의 위키·업무 문서를 읽고 쓰는 CLI 다.
**모든 명령이 3-모드 출력**을 제공하므로, 에이전트는 `--json` 으로 구조화된 결과를 받아
다음 액션에 그대로 이어 붙일 수 있다.

## 출력 모드 (핵심)

| 모드      | 용도                                            |
| --------- | ----------------------------------------------- |
| (기본)    | 사람이 읽는 표. 조회 시 본문도 이어서 보여준다  |
| `--json`  | 구조화된 원자료 — **에이전트는 항상 이걸 쓴다** |
| `--quiet` | 식별자만 — 파이프로 다음 명령에 넘길 때         |

- 읽기: `--json` 이 본문·필드를 전부 담는다.
- 쓰기(생성·수정·삭제·완료·워크플로): `--json` 이 `{ ...id, status }` 를 돌려줘 성공을 확인할 수 있다.
- 에러: stderr 로 `오류: <메시지>` + 종료 코드(1 API · 2 인증 · 3 사용법 · 4 설정).

## 준비

```bash
dra login --token <DOORAY_API_TOKEN> --base-url https://api.dooray.com
dra whoami --json   # 연결 확인
```

## 의도 → 명령 매핑

| 의도                   | 명령                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| 내 프로젝트 목록       | `dra project list --json`                                                |
| 업무 목록(최신순)      | `dra post list <project> --json`                                         |
| 업무 검색              | `dra post search <project> --keyword "<키워드>" --json`                  |
| 업무 조회(본문 포함)   | `dra post get <project> <post-id> --json`                                |
| 업무 생성              | `dra post create <project> --title "<제목>" --body "<본문>" --json`      |
| 업무 수정(부분)        | `dra post edit <project> <post-id> --title "<새 제목>" --json`           |
| 업무 완료 처리         | `dra post done <project> <post-id> --json`                               |
| 워크플로 변경          | `dra post workflow <project> <post-id> "<워크플로 이름>" --json`         |
| 댓글 목록              | `dra post comment list <project> <post-id> --json`                       |
| 댓글 추가              | `dra post comment add <project> <post-id> --body "<내용>" --json`        |
| 위키 페이지 목록       | `dra wiki pages <project> --json`                                        |
| 위키 페이지 조회(본문) | `dra wiki page get <project> <page-id> --json`                           |
| 위키 페이지 생성       | `dra wiki page create <project> --title "<제목>" --body "<본문>" --json` |
| 위키 페이지 수정(부분) | `dra wiki page edit <project> <page-id> --body "<새 본문>" --json`       |
| 위키 댓글 추가         | `dra wiki page comment add <project> <page-id> --body "<내용>" --json`   |
| 멤버 검색              | `dra member search --name "<이름>" --json`                               |

`<project>` 는 프로젝트 코드 또는 raw ID 를 모두 받는다.

## 자동 문서 읽기 → 쓰기 (에이전트 표준 흐름)

```bash
# 1) 문서를 읽는다 (자동 읽기)
PAGE=$(dra wiki page get <project> <page-id> --json)
BODY=$(echo "$PAGE" | jq -r '.body.content')

# 2) 본문을 가공해 반영한다 (자동 쓰기) — 지정 안 한 필드는 현재 값 유지
STATUS=$(dra wiki page edit <project> <page-id> \
  --body "$BODY

## 자동 추가된 섹션
- 갱신 시각 기록" --json | jq -r '.status')

# 3) 결과를 확인한다
[ "$STATUS" = "updated" ] && echo "반영 완료"
```

## 업무 처리 자동화 예시

```bash
# 검색 → 완료 처리 → 댓글로 기록
POST_ID=$(dra post search <project> --keyword "graceful shutdown" --json | jq -r '.[0].id')
dra post comment add <project> "$POST_ID" --body "자동 점검 완료" --json
dra post done <project> "$POST_ID" --json | jq -r '.status'   # "done"
```

## 첨부파일

```bash
# 업무/위키 문서에 파일 첨부·조회·다운로드
dra post file upload <project> <post-id> ./report.pdf --json     # → {fileId, status:"uploaded"}
dra post file list <project> <post-id> --json                     # → [{id, name, size}]
dra post file download <project> <post-id> <file-id> --out ./dl --json
dra wiki page file upload <project> <page-id> ./diagram.png --json
```

- 파일명은 서버 헤더에서 안전하게 추출한다(경로 요소·`..` 차단).
- `download` `--json` = `{ outputPath, fileName, size, status:"downloaded" }`.

## 확장 기능 (메일·캘린더·프로젝트 생성)

```bash
# 메일 발송
dra mail send --to user@example.com --subject "보고" --body "본문" --json

# 캘린더 — 목록·일정 조회·등록(RFC3339)
dra calendar list --json
dra calendar events --from 2026-07-10T00:00:00+09:00 --to 2026-07-17T00:00:00+09:00 --json
dra calendar create --calendar <calendarId> --subject "회의" \
  --start 2026-07-10T09:00:00+09:00 --end 2026-07-10T10:00:00+09:00 --json

# 프로젝트 생성
dra project create --code my-team --description "팀 프로젝트" --json
```

- `mail send`·`calendar create`·`project create` 는 쓰기 명령이라 `--json` 이 `{ ...id, status }` 를 돌려준다.

## 판단 기준

- 결과를 다음 액션에 쓰려면 반드시 `--json`.
- 이름을 모르면 먼저 목록/검색 명령으로 확인(`project list`, `post search`, `member search`).
- 수정은 부분 수정이 기본이다 — `--title` 만 주면 본문은 현재 값이 유지된다.
- 쓰기 결과의 `status`(`created`/`updated`/`deleted`/`done`)로 성공을 분기한다.
