# CLAUDE.md — dooray-agent

터미널·Claude Code 에서 Dooray 문서(위키·업무)를 자동으로 읽고 쓰는 CLI.
목표는 AI 에이전트가 두레이 문서를 **가장 매끄럽게 자동화**하는 것이다 — 모든 명령이 기계가 읽는 출력을 제공한다.

## 아키텍처 (단방향 데이터 흐름)

```
cli.ts → commands/* → (resolve/* | dooray/client) → core/output
```

- `src/cli.ts` — 진입점. 전역 옵션(`--json`/`--quiet`/`--no-color`), 유일한 에러 출력·종료 지점.
- `src/core/` — 횡단 인프라: `errors`(AppError 단일 타입 + ExitCode), `output`(render/reportWrite 3-모드), `config`(~/.dooray-agent/), `cache`(파일 캐시 + TTL), `spinner`, `session`(createClient).
- `src/dooray/` — API 계층: `client`(ky 래퍼, 단일 에러 정규화, 페이지네이션), `types`.
- `src/resolve/` — 사용자 문자열 → Dooray ID(캐시 + 이름 매칭). `match`(정확→부분→모호 에러).
- `src/commands/` — 명령 그룹. 각 액션은 얇은 오케스트레이터.

## 규약

- 단일 에러 타입 `AppError(message, code)`. 명령은 try/catch 하지 않고 진입점 싱크로 버블한다.
- 출력: 데이터는 stdout(`render`/`reportWrite`), 스피너·에러는 stderr.
- **모든 읽기/쓰기 명령은 3-모드**(`--json`/`--quiet`/표)를 제공한다 — 예외 없음.
- 쓰기 결과는 `{ ...id, status }` 를 `--json` 으로 돌려준다(자동화 확인용).
- 수정은 부분 수정 기본 — 지정 안 한 필드는 현재 값을 유지한다.
- 이름 해석은 `resolve/*` + 캐시(`core/cache`). raw ID(15자리+)는 그대로 통과.
- TS strict + `noUncheckedIndexedAccess`. named export. ESM.

## 명령

```bash
pnpm build       # tsup ESM 번들 → dist/cli.js
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm lint        # eslint
node dist/cli.js # 실행 (별칭 dra)
```

## 에이전트 사용법

사용자·에이전트용 사용법은 `skills/dooray-agent/SKILL.md` 를 단일 출처로 한다.

## 문서

- `docs/architecture.md` — 레이어·데이터 흐름
- `docs/design-notes.md` — 설계 결정(왜)
- `docs/api-reference.md` — Dooray 엔드포인트 대응
- `contracts/` — 명령 표면·타입 SSOT(불변)

## 공통 방법론 (HARNESS)

@.claude/CLAUDE-core.md
