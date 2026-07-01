# 공통 방법론 (HARNESS · portable core)

이 파일은 `CLAUDE.md` 에서 `@import` 된다 — 프로젝트 불변의 개발 방법론(개발 워크플로우 · fast-path · 공유 계약서 개념 · Task 관리 · Coding Agent Operating Rules §0~§5)을 담는다. 아래 §0~§5 본문은 역대 하드룰로 byte-verbatim 보존된다.

## 개발 워크플로우 (필수) 〔■ HARNESS〕

**모든 Task는 반드시 아래 팀 에이전트 파이프라인을 통해 개발한다. 직접 코드 작성 금지.**

```
① plan-agent   → contracts/ 계약서 업데이트 + tasks/ 에이전트별 Task 할당
② db-agent     → tasks/db-tasks.md 수행 (DB 변경이 있을 때)
③ backend-agent → tasks/backend-tasks.md 수행 (API/서비스 변경이 있을 때)
④ front-agent  → tasks/front-tasks.md 수행 (UI 변경이 있을 때)
⑤ qa-agent     → 전체 검증, contracts/ 일치 확인, 버그 리포트
⑥ 버그 발견 시 → plan-agent 재호출 → 수정 Task 할당 → 해당 에이전트 → qa-agent 재검증
```

- ②③④는 해당되는 에이전트만 병렬 호출 (DB 변경 없으면 db-agent 스킵 등)
- qa-agent 통과할 때까지 ⑤⑥ 반복

### 소규모 수정 fast-path (plan-agent 생략 조건)

기본은 위 풀 파이프라인이다. 단, **아래 4게이트가 전부 "아니오"일 때만** plan-agent(①)를 생략하고 단일 담당 에이전트로 직행할 수 있다. 하나라도 "예"이거나 **조금이라도 애매하면 풀 파이프라인**(오분류 비용은 비대칭 — 토큰 낭비보다 버그가 게이트를 통과하는 쪽이 훨씬 비싸다). 원칙: **"사소함을 논증해야 하면 사소한 게 아니다."**

1. **계약 변경?** — `contracts/`(db-schema/api-spec/shared-types/design-guide) 또는 그것이 미러하는 런타임 형태(`@/types`의 요청·응답·이벤트 타입, DB 스키마)가 바뀌나?
2. **2개 이상 에이전트 / 조율?** — 한 에이전트의 변경이 다른 에이전트의 변경을 강제하나?
3. **실제 설계 결정?** — 정당한 접근이 2개 이상이라 트레이드오프를 골라야 하나? 사용자가 신경 쓸 동작 선택이 끼나?
4. **되돌리기 어렵거나 폭발 반경이 큰가?** — auth / 데이터 삭제·마이그레이션 / 결제 / 외부 부작용 / 보안 경로?

- fast-path여도 **직접 코드 수정은 여전히 금지** — 단일 담당 에이전트(②③④ 중 하나)로 라우팅하고 그 에이전트가 검증(tsc/lint/build/test)까지 수행한다.
- **검수자(qa-agent)는 구현자와 동급(Opus) 유지** — 비용 절감은 qa 모델 강등이 아니라 이 fast-path(plan 세리머니 생략)로 한다.

**fast-path 내 codex 하위 결정** (게이트 통과와 별개):

- 새 실행 로직(분기 / 정규식 / async / 상태 변화) 추가 → qa-agent + codex 게이트 **유지**(codex가 잡을 게 있음).
- 순수 상수 / 설정값 / 주석 / 카피, **새 분기 0** → 빌드·타입·lint·grep 검증으로 충분, codex 생략 가능.

**사전 고지 의무 (필수):** fast-path로 가기로 하면 착수 전에 한 줄로 선언한다 — 예: `fast-path: 4게이트 전부 아니오(계약 무변경·단일 backend·설계 결정 없음·되돌리기 쉬움), 새 로직 없어 codex 생략`. 사용자가 거부(veto)하면 즉시 풀 파이프라인으로 전환한다. **선언 없이 fast-path 금지.** 이 선언은 휘발성이므로 사후 회귀 분석을 위해 `tasks/phase-meta.yml` 의 `fast_path_log:` 에도 한 줄 영속화한다(`pipeline-phase` 스킬).

## 공유 계약서 (contracts/) 〔■ HARNESS · 개념 portable / 파일 목록은 PROJECT〕

에이전트 간 불일치 방지를 위해 Plan Agent가 관리하는 계약서:

- `contracts/db-schema.md` — DB 테이블/컬럼 명세
- `contracts/api-spec.md` — API 엔드포인트/응답 명세
- `contracts/shared-types.ts` — 공유 TypeScript 타입
- `contracts/design-guide.md` — Figma 기반 디자인 가이드 (Front Agent 필수 참조)

## Task 관리 (tasks/) 〔■ HARNESS〕

- `tasks/TODO.md` — 전체 Task 목록 (마스터)
- `tasks/db-tasks.md` — DB Agent 할당 Task
- `tasks/backend-tasks.md` — Backend Agent 할당 Task
- `tasks/front-tasks.md` — Front Agent 할당 Task

## Coding Agent Operating Rules 〔■ HARNESS · §0~§5 verbatim 보존〕

## 0. Priority Order (read this first)

These rules sometimes conflict. When they do, resolve in this order:

1. The user's actual intent and correctness of the result
2. Reversibility / safety of the change (prefer changes that are easy to undo)
3. Simplicity
4. Consistency with the existing codebase

Explicit instructions from the user in chat always override these defaults.
When two rules collide, name the conflict out loud and choose the
higher-ranked one.

## 1. Think Before Coding — but know when to stop thinking

State assumptions explicitly. If multiple interpretations exist, surface them.
If a simpler approach exists, say so. If something is genuinely unclear, name
what's confusing.

The hard part is deciding whether to **ask** or **proceed**. Use this test:

- **Proceed** (state your assumption inline and keep going) when the decision is
  _easily reversible_ AND _cheap if wrong_. Most naming, internal structure, and
  local-logic choices qualify.
- **Stop and ask** when the decision is _hard to reverse_ OR _expensive if
  wrong_: schema/migration changes, public API or contract changes, and anything
  touching data deletion, auth, money, or external side effects.

Default to proceeding with a stated assumption. Asking on every ambiguity is its
own failure mode.

## 2. Simplicity First — but simple is not naive

Write the minimum code that correctly solves the problem. No speculative
features, no configurability nobody asked for, no error handling for impossible
states.

But match the complexity the problem _actually_ has:

- Don't abstract until there are 2+ real call sites (or one that's clearly
  imminent). Zero is premature; refusing at three is stubborn.
- Match the existing abstraction level of the surrounding code. Don't be simpler
  _or_ fancier than the file you're working in.

Test: "Would a senior engineer call this overcomplicated — or under-built?"
Both are failures.

## 3. Surgical Changes — minimal diff, full visibility

Touch only what the task requires. Don't reformat, rename, or refactor adjacent
code. Match existing style even where you'd choose differently. Remove only the
imports/variables that your _own_ change orphaned.

But do not pretend the codebase is perfect:

- If you notice unrelated bugs, dead code, or risks, **do not fix them silently**
  — list them at the end under "Noticed, not changed" so the human decides.

This keeps diffs reviewable without letting problems rot invisibly.

Test: every changed line traces to the request; everything else you noticed is
reported, not edited.

## 4. Verify, Don't Assume — use the strongest rung available

Turn the task into a checkable goal, then loop until it's met. Use the highest
rung of this ladder that the task allows:

1. **Automated test** that fails before your change and passes after.
   (Best — use whenever the task has definable I/O. For bug fixes: reproduce
   with a failing test first, then fix.)
2. **Type check + lint + compile/build** clean.
3. **Runnable smoke check** — actually run the code path and show the output, or
   give exact manual reproduction steps.
4. **Stated acceptance criteria in plain words + the diff**, when none of the
   above apply (UI, design, exploratory work, hard-to-reproduce concurrency or
   environment bugs). Make the human the verifier — explicitly.

Two guards:

- **Anti-overfit:** the test must capture the _requirement_, not your
  implementation. After it passes, ask: "Could this pass while the code is still
  wrong?" If yes, the check is insufficient.
- **Weak criteria:** if success is undefined, propose 2–3 concrete criteria back
  to the user and proceed with a stated default — don't invent a hidden target,
  and don't stall waiting for perfect specs.

## 5. Long-Session Hygiene

Before any large or irreversible action, restate in one line:
**goal / constraint / how I'll verify.**
This re-anchors you when the conversation is long and these rules have drifted
out of view.
