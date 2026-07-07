# 계약: 공유 타입

타입의 단일 출처는 소스의 정의 그 자체다. 이 문서는 위치와 불변 규약만 고정한다.

## 위치

- **API 타입**: `src/dooray/types.ts`
  - 응답 봉투 `DoorayResponse<T>` — 모든 client 메서드가 통과.
  - 리소스: `Me`·`Member`·`Project`·`Post`·`WikiPage`·`PostComment`·`WikiComment`·`Tag`·`Milestone`·`Workflow`·`MemberGroup`·`Template`·`FileMeta`.
  - 요청 바디: `PostInput`·`WikiPageInput`·`CommentInput`·`WikiCommentInput`.
- **출력 모드 타입**: `src/core/output.ts` `OutputMode`(`{ json?, quiet? }`).
- **인증 정보**: `src/core/config.ts` `Credentials`.
- **에러/종료 코드**: `src/core/errors.ts` `AppError` + `ExitCode`.

## 불변 규약

- 에러 타입은 `AppError(message, code)` 하나. 새 에러 타입 도입 금지.
- 종료 코드는 `ExitCode` 상수만 사용(매직 넘버 금지).
- 페이지 조회는 `Page<T> = { items, totalCount }`(`src/dooray/client.ts`).
- `--json` 출력의 리소스 형태는 API 원자료(`result`)를 그대로 유지한다.

## MCP 도구 표면 (재사용 note)

- MCP 도구 I/O 는 신규 타입 SSOT 를 만들지 않는다 — 반환은 `src/dooray/types.ts` 리소스 타입 + `src/dooray/mail.ts`(MailHeader/MailMessage) + 쓰기 `{ ...id, status }` 봉투를 재사용하고, 입력만 `src/mcp/tools.ts` 의 zod raw shape 로 선언한다.
- `AppError` → MCP tool error(`isError` content, `code` 보존) 매핑은 `src/mcp/serve.ts` `runTool` 단일 지점. 새 에러 타입 도입 금지(불변 규약 유지).
- 표면 상세는 `contracts/mcp-tools.md` 참조.
