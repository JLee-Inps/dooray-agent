---
name: contract-authoring
description: 공유 계약서(contracts/) 작성·갱신의 포터블 규약 — db-schema·api-spec·shared-types·design-guide의 포맷과 SSOT 규율, 기계 검증 가능성(typed SSOT), 변경 절차. 기획/오케스트레이션 역할이 계약을 작성/수정할 때 로드.
---

# Contract Authoring — 공유 계약서 작성 규약 (포터블)

`contracts/` 는 에이전트 간 불일치를 막는 **블랙보드 SSOT**다. 계약 소유자(기획/오케스트레이션 역할)만 작성·수정하며, 구현 역할은 읽기 전용으로 따른다. 이 스킬은 _어떻게 쓰는가_(포맷·규율)를 정의한다 — 프로젝트 고유 도메인 값은 넣지 않는다(그건 `project.md` / 도메인 스킬).

## 네 가지 계약서

| 파일                        | 무엇을                                           | 형태                            |
| --------------------------- | ------------------------------------------------ | ------------------------------- |
| `contracts/db-schema.md`    | 테이블·컬럼·타입·인덱스·제약·관계                | 산문 명세(표 권장)              |
| `contracts/api-spec.md`     | 엔드포인트·Request/Response 포맷·에러            | 산문 명세(+ 가능하면 스키마, ↓) |
| `contracts/shared-types.ts` | 공유 TypeScript 인터페이스(요청·응답·이벤트·DTO) | **실 코드(.ts)** — typed SSOT   |
| `contracts/design-guide.md` | 디자인 토큰·색상값(CSS 변수)·배지 매핑           | 산문 + 토큰 표                  |

> 산문은 _모호성 제거용 최소 tier_ 일 뿐이다. **프로덕션·장수명 계약은 가능한 한 머신 체크 가능 형태가 기본**(↓ 기계 검증 tier): db-schema↔`prisma/schema.prisma`, api-spec→OpenAPI/Zod, shared-types=`.ts`.

## 작성 규율

- **shared-types.ts 가 타입 SSOT 다.** 요청·응답·이벤트 타입은 여기 한 곳에 정의하고 구현은 **그대로 import** 한다(재정의·복제 금지). `.ts` 라서 `tsc` 가 드리프트를 잡는 유일한 계약 — 가능한 모든 형태를 산문이 아니라 타입으로 표현해 기계 검증 표면을 넓힌다.
- **이중 표현 드리프트를 최소화한다.** `db-schema.md`(산문) ↔ `prisma/schema.prisma`(코드), `api-spec.md`(산문) ↔ 실제 route/Zod 는 같은 진실의 두 사본이다. 어긋남은 `.md` 두 개로는 `tsc` 가 못 잡으므로:
  - DB: `db-schema.md` 는 사람이 읽는 명세로 두되, 컬럼/타입/인덱스는 **`prisma/schema.prisma` 와 1:1** 로 대응시키고 qa 가 대조한다.
  - API: 가능하면 `api-spec.md` 의 Request/Response 를 **Zod 스키마 또는 OpenAPI** 로도 표현해(또는 `shared-types.ts` 의 타입을 SSOT 로 삼아 런타임 Zod 를 파생) 기계 검증이 가능하게 한다. 순수 산문만 두면 검증은 qa 의 수동 대조에만 의존한다.
- **design-guide 색상값이 SSOT 다.** 색상·배지 매핑은 CSS 변수로 정의하고 프론트는 하드코딩 금지(변수만 사용).
- **요청/응답은 1:1.** api-spec 에 정의된 스키마와 구현 I/O 가 정확히 매핑되어야 한다.

## 기계 검증 tier · CI drift 게이트

산문 대조는 qa 의 수동 작업에만 의존한다. **프로덕션·장수명 계약은 머신 체크 tier 를 기본**으로 두어 드리프트를 자동·결정적으로 잡는다(spec-driven 문헌: 산문 design doc 은 강제 불가). 계약별 권장 머신 체크:

| 계약         | 머신 체크 형태                                                | CI 게이트                                                           |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| db-schema    | `prisma/schema.prisma` 가 정본, `db-schema.md` 는 사람용 미러 | `prisma validate` + `prisma migrate diff`(스키마↔마이그레이션 정합) |
| api-spec     | **OpenAPI** 문서 또는 `shared-types.ts` 에서 파생한 **Zod**   | route 핸들러를 Zod/OpenAPI 로 검증하는 계약 테스트                  |
| shared-types | `.ts` 자체가 머신 체크(typed SSOT)                            | `tsc --noEmit`(구현이 타입을 그대로 import)                         |
| design-guide | CSS 변수 토큰                                                 | 하드코딩 색상값 lint(변수만 허용)                                   |

**CI drift 게이트**: 위 결정적 체크를 CI 에 묶어 계약↔코드가 어긋나면 **빌드를 실패**시킨다. 템플릿·배선: `templates/ci-contract-drift.md`. 결정적 체크가 못 잡는 _의미적_ drift(누락·모순)는 `converge` 워크플로로 보완한다(read-only, 제안 task 산출).

> ⚠ "코드를 스펙에서 100% 재생성, 손수정 금지" 까지는 가지 않는다(과함) — 계약을 *권위*로 두고 머신 체크 + drift 게이트로 정합을 강제하는 _point-in-time 조정_ 모델.

## 변경 절차 (계약은 잠금 자원)

- 계약은 **기본 잠금**이다(PreToolUse `contracts-guard` 가 강제 — `portable-instance-boundary.md`). 의도적 작성/수정 단계에서만 `HARNESS_CONTRACTS_WRITE=1` 로 해제하고, 끝나면 다시 잠근다.
- 계약 변경은 **새 Phase 의 일부**로 선언한다(임시 수정 금지) — `pipeline-phase` 스킬 절차를 따른다. 변경 시 영향받는 db/backend/front Task 를 함께 재발급한다.
- 구현 역할이 불일치를 발견하면 계약을 직접 고치지 않고 `tasks/TODO.md` 에 BUG 로 보고한다(계약 소유자가 판단).

## 작성 순서 (Phase 1)

1. `db-schema.md` → 2. `shared-types.ts`(DB·도메인 형태를 타입으로) → 3. `api-spec.md`(shared-types 를 참조) → 4. `design-guide.md`(UI 가 있으면). 이 순서로 하류 의존을 먼저 고정한다.
