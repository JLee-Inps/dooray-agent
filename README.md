# dooray-agent

터미널과 Claude Code 에서 **NHN Dooray 문서(위키·업무)를 자동으로 읽고 쓰는** CLI.

AI 에이전트가 두레이 문서를 조회·생성·수정·댓글 자동화하는 것을 1순위로 설계했다.
**모든 명령이 3-모드 출력**(`--json`/`--quiet`/표)을 제공하므로, 에이전트는 결과를
파싱해 다음 액션에 그대로 이어 붙일 수 있다.

## 설치

### 1) 소스에서 설치 (현재 권장)

npm 레지스트리에 아직 배포되지 않았다. 지금 바로 동작하는 방법은 소스 설치다.

```bash
git clone https://github.com/JLee-Inps/dooray-agent.git
cd dooray-agent
pnpm install
pnpm build
npm link      # 전역에 dra / dooray-agent 링크
```

`dra` 는 `dooray-agent` 의 짧은 별칭이다.

### 1-b) CLI (npm) — npm 레지스트리 배포 후 사용 가능

```bash
npm install -g dooray-agent
```

### 2) Claude Code 플러그인

Claude Code 가 이 CLI 를 바로 쓰도록 플러그인으로 설치한다(스킬 + `/dooray` 슬래시 명령 포함).
위 CLI 설치(소스 또는 npm) 후 진행한다.

```bash
# 마켓플레이스 추가 (GitHub 저장소 또는 로컬 경로)
claude plugin marketplace add JLee-Inps/dooray-agent
# 플러그인 설치
claude plugin install dooray-agent@dooray-agent-marketplace
```

설치 후 Claude Code 는 `skills/dooray-agent` 스킬로 명령 사용법을 알고, `/dooray` 로 진입할 수 있다.

## 시작하기

```bash
dra login --token <DOORAY_API_TOKEN> --base-url https://api.dooray.com
dra whoami --json
```

## 명령

| 영역            | 명령                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------- |
| 인증·설정       | `login` · `setup` · `config get/set` · `whoami` · `doctor`                                     |
| 프로젝트        | `project list/create` · `project members/tags/milestones/workflows/groups/templates <project>` |
| 업무            | `post list/get/create/edit/done/workflow/search` · `post comment *` · `post file *`            |
| 위키            | `wiki pages` · `wiki page get/create/edit/delete` · `wiki page comment *` · `wiki page file *` |
| 멤버·메일       | `member get/search` · `mail list/get/send`                                                     |
| 캘린더          | `calendar list/events/create/get/edit/delete`                                                  |
| 메신저·드라이브 | `messenger channels/send` · `drive list/files/download/upload` (실험적)                        |
| 도구            | `cache clear` · `feedback` · `capabilities`                                                    |

전체 명령·인자·옵션은 에이전트가 직접 발견할 수 있다:

```bash
dra capabilities --json
```

## 자동 문서 읽기 → 쓰기

```bash
# 읽기 → 가공 → 쓰기 → 결과 확인 (지정 안 한 필드는 현재 값 유지)
BODY=$(dra wiki page get <project> <pageId> --json | jq -r '.body.content')
dra wiki page edit <project> <pageId> --body "$BODY

## 자동 갱신" --json | jq -r '.status'   # "updated"
```

## 출력 모드

| 모드      | 용도                                           |
| --------- | ---------------------------------------------- |
| (기본)    | 사람이 읽는 표. 조회 시 본문도 이어서 보여준다 |
| `--json`  | 구조화된 JSON — 에이전트는 항상 이걸 쓴다      |
| `--quiet` | 식별자만 — 파이프용                            |

## 에이전트 친화 설계

- **모든 쓰기 명령이 결과를 구조화 반환** — `{ ...id, status }` 로 성공을 확인·체이닝.
- **`--json` 에러도 구조화** — 실패도 `{ error: { message, code } }` 로 파싱 가능.
- **`capabilities` 자기탐색** — 에이전트가 사용 가능한 명령을 런타임에 발견.
- **부분 수정 기본** — `edit` 에서 지정 안 한 필드는 현재 값 유지.
- **이름·캐시 해석** — 프로젝트 코드·워크플로 이름 등을 자동 해석(파일 캐시로 반복 호출 최소화).
- 종료 코드: 0 성공 · 1 API · 2 인증 · 3 사용법 · 4 설정.

## MCP 서버

`dooray-agent-mcp` 는 Claude Desktop · Claude Code 에서 Dooray 를 직접 도구로 쓸 수 있게 하는
로컬 **stdio MCP 서버**다. CLI(`dra`)와 같은 패키지·같은 코어를 공유하며, `dra login` 한 번으로
인증을 공유한다.

> 설치→등록→"대화 문서화·일정 등록"까지의 핸즈온 레시피와 자가진단은 `docs/mcp-quickstart.md` 참조.

### 선행 조건

1. CLI 설치 (위 「설치」 참조)
2. 인증:
   ```bash
   dra login --token <DOORAY_API_TOKEN> --base-url https://api.dooray.com
   ```

### Claude Desktop 에 연결

`~/.config/claude/claude_desktop_config.json` 에 추가한다 (전역 설치 시):

```json
{
  "mcpServers": {
    "dooray": {
      "command": "dooray-agent-mcp"
    }
  }
}
```

전역 설치하지 않은 경우(소스에서 빌드) 절대 경로 또는 `node dist/mcp.js` 사용:

```json
{
  "mcpServers": {
    "dooray": {
      "command": "node",
      "args": ["/절대/경로/dooray-agent/dist/mcp.js"]
    }
  }
}
```

### Claude Code 에 연결

```bash
claude mcp add dooray -- dooray-agent-mcp
```

### 제공 툴 (27개)

| 툴 | 기능 |
| --- | --- |
| `dooray_whoami` | 로그인 사용자 정보 조회 |
| `dooray_project_list` | 프로젝트 목록 |
| `dooray_member_search` | 멤버 검색 (email/name) |
| `dooray_post_list` | 업무 목록 (최신순, 페이지네이션) |
| `dooray_post_get` | 업무 상세·본문 조회 |
| `dooray_post_create` | 업무 생성 |
| `dooray_post_edit` | 업무 수정 (부분 수정) |
| `dooray_post_done` | 업무 완료 처리 |
| `dooray_post_workflow` | 업무 워크플로 전이 |
| `dooray_post_search` | 업무 키워드 검색 |
| `dooray_post_comment_list` | 업무 댓글 목록 |
| `dooray_post_comment_add` | 업무 댓글 추가 |
| `dooray_wiki_pages` | 위키 페이지 목록 |
| `dooray_wiki_page_get` | 위키 페이지 상세·본문 조회 |
| `dooray_wiki_page_create` | 위키 페이지 생성 |
| `dooray_wiki_page_edit` | 위키 페이지 수정 (부분 수정) |
| `dooray_wiki_page_delete` | 위키 페이지 삭제 |
| `dooray_wiki_comment_add` | 위키 페이지 댓글 추가 |
| `dooray_calendar_list` | 캘린더 목록 조회 |
| `dooray_calendar_events` | 캘린더 이벤트 목록 (기본 오늘~+7일) |
| `dooray_calendar_event_get` | 캘린더 이벤트 상세 조회 |
| `dooray_calendar_event_create` | 캘린더 이벤트 생성 |
| `dooray_calendar_event_edit` | 캘린더 이벤트 수정 (부분 수정) |
| `dooray_calendar_event_delete` | 캘린더 이벤트 삭제 |
| `dooray_mail_list` | 메일 목록 조회 (IMAP/SMTP 설정 필요) |
| `dooray_mail_get` | 메일 상세 조회 (IMAP 설정 필요) |
| `dooray_mail_send` | 메일 발송 — 외부 부작용, 되돌릴 수 없음 (SMTP 설정 필요) |

툴 명세 전체는 `contracts/mcp-tools.md` 를 참조한다.

## 에이전트 스킬

Claude Code 용 사용 지침은 `skills/dooray-agent/SKILL.md` 를 참고한다.

## 라이선스

MIT © JLee-Inps
