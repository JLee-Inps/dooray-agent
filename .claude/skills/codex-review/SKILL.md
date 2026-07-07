---
name: codex-review
description: Phase 완료 검증 시 누적 변경을 외부 모델(codex)로 적대적 리뷰하는 게이트 절차 — base_sha 추출, pnpm codex:review 실행, D9 KIND 선행 분류, severity 매핑, codex_review 블록 기록, 실패 모드. QA/게이트 역할이 Phase 종료 게이트를 수행할 때 로드.
---

# Codex Review — Phase 누적 변경 Codex Adversarial Review 게이트

Phase 전체 완료를 검증할 때, Claude(qa) 시각만으로는 잡기 어려운 blind spot을 외부 모델(codex) 적대적 리뷰로 보완하는 절차. 하네스 규약(`scripts/codex-review.mjs`, `tasks/phase-meta.yml`, `tasks/codex-reviews/`, `pnpm codex:review`) 위에서 동작한다.

## 적용 조건

- **opt-out 확인 (선결)**: `.claude/.hcg-harness.json` 마커의 `choices.codex === false` 면 이
  게이트 전체를 스킵한다 — `tasks/phase-meta.yml` 해당 Phase 에
  `codex_review: { executed: false, skipped: "opt-out" }` 기록, Phase 판정은 qa 자체 검증
  (verification-ladder rung 1-2: 테스트·빌드·타입·린트)으로 진행, 원하면 내장 `review` 워크플로
  수동 실행을 안내(비필수). 마커 부재·파싱 실패·codex 필드 없음은 opt-out 이 **아니다**(아래
  현행 절차 진행). Stop 훅(phase-gate-check)도 같은 마커를 읽어 opt-out 프로젝트는 경고하지 않는다.
- 본 검증이 **"Phase 전체 완료 검증"** 인 경우만 실행한다.
- 개별 Task QA, 부분 재검증에서는 스킵한다.
- `tasks/phase-meta.yml`에 해당 Phase의 `base_sha`가 기록되어 있어야 한다 (없으면 메타 등록을 먼저 요청 — `pipeline-phase` 스킬 참조).
- 단순 코드 리뷰가 아닌 **설계 가정·tradeoff·실패 시나리오에 도전(adversarial)** 하는 톤이라 Phase 누적 변경에 적합하다.

## 게이트 범위 (D9 — 정확성·명시 요구사항 한정)

> 근거: 설계 결정 D9 ("갭 찾으라는 리뷰어는 멀쩡해도 갭 보고 → 과설계", Anthropic 공식 Callout). codex는 적대적 톤이라 결함이 없어도 "더 추가하면 좋다"류 갭을 *반드시* 만들어낸다. 그 갭이 Phase 게이트를 FAIL 시키면 과설계를 강제하게 된다.

**KIND가 severity보다 먼저다.** 각 finding을 먼저 종류(KIND)로 분류하고, 그 다음에만 severity를 본다.

- **게이트 대상 (GATING)** — 다음 둘 중 하나일 때만 Phase를 FAIL 시킨다:
  1. **정확성·안전 결함**: crash / data loss·corruption / race condition / security·injection / auth bypass / 명백한 오동작(코드의 *자기 의도*와 모순되는 동작).
  2. **명시된 요구사항·계약 위반**: 해당 Phase가 약속한 요구사항, 또는 `contracts/`(db-schema·api-spec·shared-types·design-guide)·스펙에 적힌 내용과 어긋남.
- **부록 (NON-GATING)** — 위에 해당하지 **않는** 모든 것은 codex가 self-assign한 severity(Critical/High 포함)와 **무관하게** 보고서 부록에만 기록하고 게이트는 PASS 유지:
  - "이 기능/검증/엣지케이스를 *추가하면* 더 좋다" (요구사항에 없던 gap/enhancement)
  - "더 견고하게/방어적으로 만들 수 있다" (over-design 권장)
  - 스타일·네이밍·리팩터 제안, 요구사항 밖 커버리지 확대 제안.

> 즉 **Critical/High라도 KIND가 gap/enhancement/over-design이면 부록**(FAIL 아님). 반대로 정확성 결함·명시 요구사항 위반은 codex가 Medium/Low로 깎았어도 끌어올려 게이트 판정한다(아래 Severity 매핑 fallback 참조). codex 호출 시 이 범위가 자동 전달된다(↓ 실행 절차 2 — wrapper의 D9_FOCUS).

## 실행 절차

1. `tasks/phase-meta.yml`에서 현재 Phase의 `base_sha` 추출:

   ```bash
   node -e "const y=require('js-yaml').load(require('fs').readFileSync('tasks/phase-meta.yml','utf8')); const p=y.phases.find(x=>x.id===<N>); console.log(p.base_sha)"
   ```

2. Codex review 실행 + 로그 저장 (foreground 5~10분 대기 예상):

   ```bash
   pnpm codex:review <base_sha> 2>&1 | tee "tasks/codex-reviews/phase-<N>-$(date +%Y%m%d).log"
   ```

   - 첫 실행 전 codex-companion `setup --json`으로 인증 상태 확인 권장.
   - **D9 자동 적용**: `pnpm codex:review` → `scripts/codex-review.mjs`가 게이트 범위 지시(`D9_FOCUS`)를 codex adversarial-review의 focus text(`{{USER_FOCUS}}`)로 항상 전달한다(별도 인자 불필요). 이로써 codex가 정확성·요구사항 위반에 가중치를 두고 gap/enhancement는 비차단으로 표기하도록 유도된다. 단 codex의 base 템플릿은 plugin 측 고정이라 갭 보고를 완전히 막지는 못하므로, **최종 게이트 판정(PASS/FAIL)은 위 §게이트 범위(D9) KIND 분류로 qa가 내린다.**

3. 출력에서 finding을 **먼저 KIND(정확성·요구사항 위반 vs gap/enhancement/over-design)로 분류**한 뒤 severity를 본다 (위 §게이트 범위(D9) + 아래 §Severity 매핑 표 참조).

4. **Critical/High 발견 시** (단, **KIND가 게이트 대상일 때만** — §게이트 범위(D9)):
   - 먼저 KIND 확인: 정확성·안전 결함 **또는** 명시 요구사항·계약 위반인가? **아니면**(gap/enhancement/over-design 권장) Critical/High라도 Step 5 부록으로 보내고 게이트는 PASS 유지.
   - 게이트 대상이면:
     - 해당 Phase 파일(`tasks/phases/phase-<N>-*.md`)의 "QA 이슈" 섹션에 BUG-xxx 자동 등록 (다음 기획 호출 시 이 BUG들을 읽고 수정 Task 발급).
     - 본 Phase의 검증 결과를 **FAIL**로 기록.
     - `tasks/phase-meta.yml`의 `status`를 `in-progress`로 유지 (`completed` 표시 금지).
     - 사용자에게 명확한 메시지 출력: "Phase <N> 검증 FAIL — Codex 정확성/요구사항 위반 N건. BUG-XXX~YYY 등록. 기획 재호출 필요."

5. **부록(NON-GATING) 처리** — 게이트 PASS 유지하며 보고서 부록에만 기록:
   - 모든 Medium/Low finding.
   - **KIND가 gap/enhancement/over-design인 finding은 severity(Critical/High 포함) 무관 부록**(D9). 부록 기록 시 codex self-assigned severity와 "비차단 사유(요구사항 밖 제안)"를 함께 남겨 추적 가능하게 한다.

6. `tasks/phase-meta.yml`의 `codex_review` 블록 업데이트:

   ```yaml
   codex_review:
     executed: true
     base_used: <base_sha>
     log: tasks/codex-reviews/phase-<N>-<YYYYMMDD>.log
     critical_high_count: <N>
   ```

## Severity 매핑

> **선결 조건 (D9 — KIND가 severity보다 먼저):** 아래 표의 "Phase FAIL" 액션은 finding의 KIND가 **게이트 대상**(정확성·안전 결함 *또는* 명시 요구사항·계약 위반)일 때만 적용된다. KIND가 gap/enhancement/over-design이면 아래 매핑상 Critical/High라도 **부록**으로 강등(게이트 PASS). §게이트 범위(D9) 참조.

| Codex 출력 패턴 | severity 매핑 | 액션 (KIND=게이트 대상) | 액션 (KIND=gap/enhancement) |
|---|---|---|---|
| `### Critical`, `**Critical**`, `[CRITICAL]` | Critical | BUG-xxx + Phase FAIL | 부록(비차단) |
| `### High`, `**High**`, `[HIGH]` | High | BUG-xxx + Phase FAIL | 부록(비차단) |
| `### Medium`, `**Medium**`, `[MEDIUM]` | Medium | 보고서 부록 | 부록 |
| `### Low`, `**Low**`, `[LOW]`, `### Info` | Low | 보고서 부록 | 부록 |
| 위 패턴 없이 finding 본문에 `security` / `injection` / `auth bypass` / `data loss` / `race condition` | High (fallback) | BUG-xxx + Phase FAIL | 부록(비차단) |
| 매칭 안 됨 | Medium (default) | 보고서 부록 + 사용자 alert | 부록 + 사용자 alert |

분류는 `grep -iE` 패턴으로 raw log 파싱. **단 severity 파싱 전에 각 finding의 KIND를 판정**(정확성·요구사항 위반 vs gap/제안)하여 게이트 대상 열/부록 열 중 어느 액션을 적용할지 먼저 정한다.

## 보고서 템플릿 추가 섹션

기존 QA 보고서 끝에 다음을 첨부:

```markdown
### Codex Adversarial Review 결과
- 실행: `pnpm codex:review <sha>` (Phase <N> 시작 시점, D9 focus 자동 적용)
- 누적 diff: M files, +X -Y lines
- 게이트 대상 Critical/High (정확성·요구사항 위반): N건 (BUG-XXX, ...)
- 비차단 부록 (gap/enhancement/over-design — severity 무관): G건
- Medium: M건
- Low: K건
- Raw log: `tasks/codex-reviews/phase-<N>-<YYYYMMDD>.log`

<details><summary>게이트 대상 Critical/High findings (전문)</summary>
... Codex 원문 발췌 ...
</details>

<details><summary>비차단 부록 — gap/enhancement/over-design (D9 — 게이트 무영향)</summary>
... codex self-assigned severity + 비차단 사유(요구사항 밖 제안) ...
</details>
```

## 실패 모드

- Codex 인증 만료 (`pnpm codex:review` exit 1): 사용자에게 codex `setup --json` 실행 요청.
- codex-companion 미설치 (exit 1, "not found"): 사용자에게 codex 플러그인 설치 요청.
- Codex 응답 시간 15분 초과: 메인 스레드의 하네스 `run_in_background`로 실행(권장·현행 — codex 게이트는 이 방식으로 백그라운딩한다) 또는 재시도·원인 조사. (codex review 자체에는 백그라운딩 플래그가 없다 — companion review 핸들러가 foreground 고정이라 `--wait`로만 동작.)

## 관련 문서

- Wrapper: `scripts/codex-review.mjs` (D9_FOCUS focus text 주입)
- 로그 디렉토리: `tasks/codex-reviews/` (`*.log` gitignored)
- 메타: `tasks/phase-meta.yml` (`base_sha`, `codex_review` 블록)
