# 아키텍처

dooray-agent 는 단방향 데이터 흐름을 가진 얇은 계층형 CLI 다.

```
cli.ts → commands/* → (resolve/* | dooray/client) → core/output
```

## 레이어

| 레이어 | 위치             | 책임                                                                                       |
| ------ | ---------------- | ------------------------------------------------------------------------------------------ |
| 진입점 | `src/cli.ts`     | commander 조립, 전역 옵션(`--json`/`--quiet`/`--no-color`), **유일한 에러 출력·종료 지점** |
| 명령   | `src/commands/*` | 얇은 오케스트레이터. 입력 해석 → 클라이언트 호출 → 출력                                    |
| 해석   | `src/resolve/*`  | 사용자 문자열(코드·이름) → Dooray ID. 캐시 + 이름 매칭                                     |
| API    | `src/dooray/*`   | `DoorayClient`(ky 래퍼) + 타입. 모든 호출을 단일 에러로 정규화                             |
| 인프라 | `src/core/*`     | `errors`·`output`·`config`·`cache`·`spinner`·`session`                                     |

## 핵심 원칙

- **단일 에러 타입 + 단일 싱크**: 모든 실패는 `AppError(message, code)` 로 좁혀져 `cli.ts` 한 곳에서 출력된다. 명령은 try/catch 하지 않는다.
- **3-모드 출력**: 모든 읽기/쓰기 명령이 `--json`/`--quiet`/표를 제공한다(예외 없음). `core/output` 의 `render`/`reportWrite` 가 단일 허브.
- **부분 수정 기본**: `edit` 는 현재 값을 읽어 지정하지 않은 필드를 유지한다.
- **이름 해석 + 캐시**: raw ID(15자리+)는 그대로 통과, 그 외는 `resolve/*` 가 캐시(`core/cache`, TTL)와 매칭으로 해석한다.

## 데이터 흐름 예시 (`wiki page edit`)

1. `cli.ts` 가 전역 옵션을 읽고 `wiki page edit` 액션으로 라우팅.
2. 액션이 `createClient()` 로 인증된 `DoorayClient` 생성.
3. `resolveWikiId(project)` 가 프로젝트 코드 → wikiId 해석(캐시).
4. `getWikiPage` 로 현재 값을 읽어 지정 안 한 필드를 채움(부분 수정).
5. `updateWikiPage` 호출.
6. `reportWrite(mode, { json, id, message })` 로 3-모드 출력.
7. 실패 시 `AppError` 가 `cli.ts` 싱크로 버블 → `--json` 이면 `{ error }`, 아니면 `오류: …`.

## 빌드

- TypeScript strict + `noUncheckedIndexedAccess`, ESM.
- tsup 로 `dist/cli.js` 단일 ESM 번들(shebang 포함), 의존성은 external.
