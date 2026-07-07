---
name: pipeline-phase
description: 신규 Phase를 선언/종료할 때 따르는 의무 절차 — phase 파일 생성, phase-meta.yml entry(base_sha 기록), TODO 인덱스, 에이전트별 Task 분배, Task ID 정책, phase-close. 기획/오케스트레이션 역할이 Phase 라이프사이클을 다룰 때 로드.
---

# Pipeline Phase — Phase 선언·완료 의무 절차

재사용 가능한 파이프라인 절차. 새 작업 단위(Phase)를 선언하고 종료하는 표준 라이프사이클을 정의한다. 이 절차는 프로젝트 도메인과 무관하며, `tasks/`·`contracts/` 하네스 규약 위에서 동작한다.

> 경로 토큰(`tasks/`, `contracts/`, `tasks/phase-meta.yml` 등)은 하네스 규약이므로 그대로 유지한다. 프로젝트 고유의 스택·도메인 값은 이 절차에 넣지 않는다.

## Phase 선언 시 의무 절차 (모든 신규 Phase에 적용)

1. **Phase 파일 생성**: `tasks/phases/phase-<N>-<slug>.md` 신규 작성. 헤더에 시작일 / 상태 / 책임 / 메타 링크 / 스펙 링크를 포함한다.

2. **`tasks/phase-meta.yml` 업데이트**: `phases:` 배열에 entry 추가:

   ```yaml
   - id: <N>
     title: <Phase 제목>
     status: in-progress
     base_sha: <Phase 선언 직전 git HEAD — Bash 가능 컨텍스트(오케스트레이터/Bash 보유 에이전트)가 `git rev-parse HEAD`로 캡처해 제공한 값을 기록(Phase 선언자는 직접 실행 안 함)>
     started: <오늘 날짜 YYYY-MM-DD>
     completed: null
     file: tasks/phases/phase-<N>-<slug>.md
     spec: <관련 스펙 경로, 없으면 null>
     moscow: <Must|Should|Could|Won't — 이 Phase 의 릴리스 분류 (plan-agent Phase 0)>
     codex_review:
       executed: false
       base_used: null
       log: null
       critical_high_count: null
   ```

   **`base_sha`는 반드시 Phase 선언 직전의 git HEAD여야 한다.** 이 값은 *캡처*(git 실행)와 *기록*(phase-meta 작성)을 분리한다 — **Bash 가능 컨텍스트(오케스트레이터 메인 스레드 또는 Bash 보유 에이전트)가 `git rev-parse HEAD`로 캡처**해 Phase 선언자에게 제공하고, Phase 선언자(read-only 역할일 수 있음)는 그 값을 phase-meta에 **기록만** 한다. Phase 선언자가 git을 직접 실행한다고 가정하지 말 것이며, `.git` 직독 같은 fragile 우회(packed refs/detached HEAD/worktree에서 비등가)에 의존하지 않는다. 이 SHA는 Phase 완료 검증 시 `pnpm codex:review <base_sha>`로 누적 diff를 분석하는 데 사용된다(→ `codex-review` 스킬). 누락 시 codex review를 수행할 수 없으므로 Phase가 정상 종료될 수 없다(codex 게이트 단계가 차단; opt-out 프로젝트 — 마커 choices.codex=false — 는 해당 없음, 자체 검증으로 종료).

3. **`tasks/TODO.md` 인덱스 업데이트**: "## 진행중" 표에 한 줄 추가. TODO.md는 인덱스(50줄 이내 유지)이며 상세는 phase 파일이 보유한다.

4. **에이전트별 Task 분배**: phase 파일 내부에서 구현 에이전트별 섹션(예: `#### DB Agent`, `#### Backend Agent`, `#### Front Agent`, `#### QA Agent`)으로 Task를 분배한다. 에이전트별 보조 미러(`tasks/<agent>-tasks.md`, 읽기 편의용)도 동기화한다. **분배(dispatch)는 plan 의 Analyze 교차-일관성 게이트(커버리지·계약 정합·경계)를 통과해야 한다** — 불일치 시 dispatch 금지(plan-agent §Analyze 게이트). 게이트 통과 후에도 **사용자의 설계 승인 전에는 dispatch 금지**(CLAUDE-core §설계 승인 체크포인트 ①.5).

## 관리 대상 파일

- `tasks/TODO.md` — 인덱스 (50줄 이내 유지)
- `tasks/phase-meta.yml` — 기계 가독 메타 (base_sha 등)
- `tasks/phases/phase-<N>-*.md` — Phase별 상세 (정본)
- `tasks/<agent>-tasks.md` — 에이전트별 보조 미러

## MoSCoW 분류 · fast-path 기록

- **`moscow:`** — 각 Phase entry 는 릴리스 분류(Must/Should/Could/Won't)를 싣는다(plan-agent Phase 0). Won't 은 codex 게이트 D9 의 비차단(부록) 라우팅 근거가 된다(`codex-review` 스킬).
- **`fast_path_log:`** — 소규모 수정 fast-path(plan ① 생략, 단일 에이전트 직행)는 Phase 를 선언하지 않을 수 있어, 휘발성 "한 줄 선언" 을 별도 audit 로그로 영속화한다(사후 회귀 분석용). Bash 가능 주체(오케스트레이터)가 `tasks/phase-meta.yml` 최상위에 append 한다:

  ```yaml
  fast_path_log:
    - date: <YYYY-MM-DD>
      summary: <무엇을 고쳤나 한 줄>
      gates: <4게이트 판정 — 예: 계약무변경·단일backend·설계없음·되돌리기쉬움>
      agent: <라우팅된 단일 담당 에이전트>
      codex: <수행 | 생략(사유)>
  ```

## Task ID 정책

- Task ID는 전체 프로젝트에서 유일하게 순차 부여: TASK-001, TASK-002, ...
- 중복 방지: 부여 전 `phase-meta.yml`과 archive 전체를 grep으로 확인한 뒤 다음 번호로 부여한다.
- Sub-task는 부모 Task ID에 suffix를 붙여 표기한다 (예: TASK-076-B1, TASK-076-Q1).
- 이슈 ID는 BUG-001, BUG-002, ... 형식으로 부여한다.

## Phase 완료 시 의무 절차

1. QA 역할의 PASS 보고를 받은 후, `tasks/phase-meta.yml`에서 해당 Phase의:
   - `status: completed` 로 변경
   - `completed: <오늘 날짜>` 기록
   - `codex_review` 블록은 QA 역할(codex 게이트 수행자)이 채운다 — Phase 선언자는 미터치.
2. `tasks/TODO.md` "진행중"에서 "완료 (요약)" 표로 이동한다.
3. phase 파일은 archive로 이동하지 않고 그대로 유지한다 (향후 회귀 분석용).

## 이슈 대응 (재오픈 루프)

QA가 `tasks/TODO.md` / phase 파일 "QA 이슈" 섹션에 기록한 이슈(BUG-xxx)를 확인하고:
1. 원인 분석.
2. 계약 변경이 필요하면 `contracts/`를 업데이트한다(계약은 기획/오케스트레이션 역할만 수정).
3. 수정 Task를 해당 에이전트의 task 파일에 추가하고, 게이트 통과까지 구현→QA 재검증을 반복한다.
