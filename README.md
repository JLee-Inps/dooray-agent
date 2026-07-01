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

## 에이전트 스킬

Claude Code 용 사용 지침은 `skills/dooray-agent/SKILL.md` 를 참고한다.

## 라이선스

MIT © JLee-Inps
