# MCP 퀵스타트 — 설치부터 "대화 문서화·일정 등록"까지

Claude Desktop(또는 Claude Code)에서 Dooray 를 **말로 시키는** 데까지의 재현 가능한 레시피.
설치·등록의 상세는 `README.md` 「MCP 서버」를, 툴 계약 전체는 `contracts/mcp-tools.md` 를 단일 출처로 참조한다 — 이 문서는 **실제 흐름과 검증**에 집중한다.

---

## 0. 이게 실제로 되는가 (E2E 실증)

토큰 없이도 서버는 기동하고, 실 MCP 클라이언트(Claude Desktop)가 보는 그대로 핸드셰이크·툴 나열이 동작한다. 아래는 `dist/mcp.js` 를 stdio JSON-RPC 로 직접 두드린 결과다:

```
initialize.serverInfo      = {"name":"dooray-agent-mcp","version":"0.1.0"}
initialize.protocolVersion = 2024-11-05
tools.count                = 27
dooray_calendar_event_create.inputSchema.required = ["calendar","subject","start","end"]
whoami(no-config).isError  = true | {"error":{"message":"인증 정보가 없습니다. … login … 로 먼저 등록하세요.","code":4}}
STDERR clean, stdout = JSON-RPC 전용
```

- **27개 툴** 전수 노출 · 입력 스키마 정상 · **에러 봉투**(`isError` + `code` 보존) · **stdout 청결**.
- 재현: `node scripts/smoke-mcp.mjs` 는 없다 — 대신 아래 §5 「자체 smoke」로 언제든 재확인한다.

미로그인 상태의 `code=4`(설정 없음)와, 로그인은 됐으나 토큰이 거부된 `code=2`(인증)는 서로 다르다 — 자가진단 §4 참조.

---

## 1. 5분 셋업

```bash
# ① 설치 (소스 빌드 기준 — npm 전역 설치 시 README 참조)
git clone https://github.com/JLee-Inps/dooray-agent && cd dooray-agent
npm install && npm run build      # dist/cli.js(dra) + dist/mcp.js(dooray-agent-mcp)

# ② 인증 (한 번 — 토큰은 ~/.dooray-agent/config.json 0600 로컬 보관, 밖으로 안 나감)
node dist/cli.js login --token <DOORAY_API_TOKEN> --base-url https://api.dooray.com
node dist/cli.js whoami            # 인증 확인 (내 정보 출력되면 OK)

# ③ (선택) 메일 툴을 쓸 때만 — IMAP/SMTP 설정
node dist/cli.js config set imap-host   imap.dooray.com
node dist/cli.js config set smtp-host   smtp.dooray.com
node dist/cli.js config set mail-user   me@company.com
node dist/cli.js config set mail-password <APP_PASSWORD>
```

**Claude Desktop 등록** — `~/.config/claude/claude_desktop_config.json` (전역 설치면 `"command":"dooray-agent-mcp"`, 소스 빌드면 절대경로):

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

저장 후 **Claude Desktop 완전 재시작**. 입력창의 🔌(커넥터) 아이콘에 `dooray` 27개 툴이 뜨면 연결 완료.

Claude Code 는 한 줄: `claude mcp add dooray -- node /절대/경로/dooray-agent/dist/mcp.js`

---

## 2. 레시피 A — 대화 내용을 위키 문서로

**말**: *"방금 정한 내용 정리해서 `<프로젝트>` 위키에 'API 설계 회의 2026-07-07' 페이지로 남겨줘."*

**LLM 이 실제로 부르는 툴 사슬**:

1. `dooray_project_list` — 프로젝트 이름 → 후보 확인 (모호하면 되물음)
2. `dooray_wiki_page_create` — `{ project, title:"API 설계 회의 2026-07-07", body:"<마크다운 정리>" }`
   → `{ pageId, status:"created" }`

**검증**: 반환된 `pageId` 로 `dooray_wiki_page_get` 을 시키거나 — *"방금 만든 페이지 다시 보여줘"* — Dooray 웹에서 페이지 확인.

> 본문은 마크다운(`text/x-markdown`)으로 저장된다. 위키 **댓글**만 mime 없이 평문이다(계약 §도메인 규칙).

---

## 3. 레시피 B — 일정 등록·확인

**말**: *"내일 14시부터 15시까지 '스프린트 리뷰' 일정 잡아줘."*

**툴 사슬**:

1. `dooray_calendar_list` — 내 캘린더 → `calendarId` 확보 (여러 개면 되물음)
2. `dooray_calendar_event_create` —
   `{ calendar, subject:"스프린트 리뷰", start:"2026-07-08T14:00:00+09:00", end:"2026-07-08T15:00:00+09:00" }`
   → `{ eventId, status:"created" }`

**확인**: *"이번 주 일정 보여줘"* → `dooray_calendar_events`(인자 없으면 지금~+7일 전체 캘린더).

**수정은 부분 수정**: *"그 일정 30분 뒤로 미뤄"* → `dooray_calendar_event_edit` 이 현재값을 읽어 `start/end`만 바꾼다(`startedAt`/`endedAt` 는 항상 현재값을 공급하므로 다른 필드는 유지).

> 종일 일정은 "하루 종일"이라고 말하면 `allDay:true`(→ `wholeDayFlag`). `start`/`end` 는 RFC3339(타임존 포함) 권장.

---

## 4. 자가진단

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 커넥터에 `dooray` 안 뜸 | config 경로/JSON 오타, 재시작 안 함 | JSON 유효성 확인 → **완전 재시작**. `command` 절대경로 확인 |
| 툴은 뜨는데 첫 호출이 `code:4` | 미로그인(설정 파일 없음) | `dra login` 먼저. `dra whoami` 로 확인 |
| 첫 호출이 `code:2` | 토큰 거부(401/403) — 만료·오타·권한 | 토큰 재발급 후 `dra login` 재실행 |
| 메일 툴만 `code:4` | IMAP/SMTP 미설정 (login 은 됨) | §1 ③ `config set` |
| 서버가 조용히 죽음 | Node 버전/빌드 누락 | `node -v`(≥18), `npm run build` 재실행, §5 smoke |

`code` 규약: **1** API · **2** 인증 · **3** 사용법 · **4** 설정. CLI `--json` 에러와 동일 스키마.

---

## 5. 자체 stdio smoke (언제든 재확인)

토큰 없이 서버 기동 + 27툴 나열 + 에러 봉투를 5초 만에 검증한다. `dist/mcp.js` 를 stdio 로 띄우고 `initialize`→`tools/list`→`tools/call` 을 순서대로 흘려보내면 된다:

```bash
node --input-type=module -e '
import { spawn } from "node:child_process";
const s = spawn("node", ["dist/mcp.js"], { stdio:["pipe","pipe","inherit"] });
let buf=""; const p=new Map();
s.stdout.on("data",d=>{buf+=d; let i; while((i=buf.indexOf("\n"))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);if(!l.trim())continue;const m=JSON.parse(l);if(p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}}});
const rpc=(id,method,params)=>new Promise(r=>{p.set(id,r);s.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n");});
await rpc(1,"initialize",{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"smoke",version:"0"}});
const {result}=await rpc(2,"tools/list",{});
console.log("tools:", result.tools.length);
s.kill(); process.exit(0);
'
# 기대: tools: 27
```

빈 `HOME`(설정 없음)으로 돌려도 서버는 기동하고 첫 툴 호출만 `code:4` 로 응답한다 — 이것이 정상이다.
정식 유닛/통합 커버리지는 `pnpm test`(192 tests, `src/mcp/*.test.ts`).
