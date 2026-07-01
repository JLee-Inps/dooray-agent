---
name: agent-conventions
description: dooray-agent 의 코드 house style — 단방향 계층, 단일 에러 타입 + 단일 싱크, 3-모드 출력 허브, 부분 수정 기본, 이름 해석 + 캐시, ES private, named export. 구현/검수 역할이 코드를 쓰거나 리뷰할 때 단일 출처로 따른다.
---

# agent-conventions — dooray-agent house style

## 계층 (단방향)

```
cli.ts → commands/* → (resolve/* | dooray/client) → core/output
```

명령은 얇은 오케스트레이터다: 전역 옵션 읽기 → `createClient()` → `resolve*` 로 ID 해석 → `client` 호출 → `render`/`reportWrite`.

## 에러

- 단일 타입 `AppError(message, code)`(`core/errors`). 종료 코드는 `ExitCode` 상수.
- 명령은 try/catch 하지 않는다 — 실패는 `cli.ts` 단일 싱크로 버블한다.
- API 레이어(`DoorayClient`)가 모든 호출을 `AppError` 로 정규화(HTTP 401/403 → Auth).

## 출력 (3-모드)

- `core/output` 의 `render`(조회) / `reportWrite`(쓰기)가 유일한 허브.
- 모든 읽기/쓰기 명령이 `--json`/`--quiet`/표를 제공한다 — 예외 없음.
- 쓰기 결과는 `{ ...id, status }`. 데이터는 stdout, 스피너·에러는 stderr.

## 관용구

- **부분 수정 기본**: `edit` 는 현재 값을 읽어 지정 안 한 필드를 유지한다.
- **이름 해석**: raw ID(15자리+)는 통과, 그 외는 `resolve/*` + `matchByName`(정확→부분→모호 에러).
- **캐시**: 목록 조회는 `core/cache` `cached(key, ttl, loader)` 로 감싼다(프로젝트·멤버 1h, 워크플로·위키 24h).
- **반복 옵션**: `(v, prev) => [...prev, v]` collector.

## 스타일

- named export, ESM(소스에 `.js` 확장자 불요 — bundler). TS strict + `noUncheckedIndexedAccess`.
- 클라이언트 내부 상태는 ES private 필드(`#http`/`#token`).
- 주석·에러 메시지는 한국어. 새 실행 로직에는 단위 테스트를 붙인다.
