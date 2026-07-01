# 프로젝트: dooray-agent

> 하네스의 인스턴스 슬롯. 에이전트 셸이 spawn 시 이 파일을 읽어 경로·스택을 주입받는다.
> 이 프로젝트는 풀스택 웹앱이 아니라 **단일 바이너리 CLI** 이므로 db·frontend 레이어는 비활성이다.

## 정체성

터미널·Claude Code 에서 NHN Dooray 문서(위키·업무)를 자동으로 읽고 쓰는 CLI.
모든 명령이 3-모드 출력을 제공해 에이전트 자동화를 1순위로 한다.

## 스택

- TypeScript(strict + `noUncheckedIndexedAccess`), ESM
- 빌드: tsup → `dist/cli.js` 단일 ESM 번들
- CLI: commander · HTTP: ky · 표: cli-table3 · 스피너: ora · 대화형: @inquirer/prompts
- 메일: imapflow + mailparser(조회) · nodemailer(발송)
- 테스트: Vitest · 린트/포맷: ESLint + Prettier · 패키지 매니저: pnpm

## 경로

- 진입점 `src/cli.ts` · 명령 `src/commands/**` · 해석 `src/resolve/**`
- API `src/dooray/**` · 인프라 `src/core/**`
- app dir(hook 검증): `.`

## 계약 (contracts/)

- `contracts/api-spec.md` — 명령 표면 + 출력 스키마(불변)
- `contracts/shared-types.md` — 타입 SSOT 위치

## 도메인 스킬

- `dooray-agent-domain` — 입력 해석·post done 전이·파일 307·캐시 TTL 등 불변 규칙(`.claude/skills/dooray-agent-domain/SKILL.md`).

## 코드 컨벤션 스킬

- `agent-conventions` — 계층·단일 에러·3-모드·부분 수정 등 house style(`.claude/skills/agent-conventions/SKILL.md`).
- 상세 근거는 `docs/design-notes.md`, `CLAUDE.md`.

## 활성 에이전트

- 활성: `plan` · `backend`(유일 구현자) · `qa`. 비활성: `db`·`front`(DB/UI 없음).

## 모델 배정

- plan=opus · qa=opus · backend(구현)=sonnet 기본(새 아키텍처/복잡 알고리즘만 opus).
