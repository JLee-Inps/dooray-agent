---
name: dooray-agent-domain
description: dooray-agent 의 불변 도메인 규칙 — ID 판별, 프로젝트·위키·멤버·워크플로 해석, post done 전이, 파일 307·파일명 안전화, 캐시 TTL, 응답 봉투. 구현/검수 역할이 동작을 설계·검증할 때 기준으로 따른다.
---

# dooray-agent Domain Rules

어기면 버그가 재발하는 불변 규칙. 근거는 `docs/design-notes.md`, 엔드포인트는 `docs/api-reference.md`.

## 입력 해석

- **raw ID 판별**: `^\d{15,}$` 이면 Dooray ID 로 보고 그대로 통과(`resolve/project` `looksLikeId`).
- **프로젝트**: 코드 → `listProjects` 매칭(캐시). **위키**: 프로젝트 → 연결 wiki(`listWikis` 에서 `project.id` 매칭).
- **멤버**: raw id / 이메일(`searchMembers` 정확) / 이름(`matchByName`).
- **워크플로**: 이름 매칭. **태그**: 이름 매칭.
- 이름 해석은 정확 일치 우선 → 부분 일치 → 모호(2+)면 후보 목록과 함께 에러.

## 쓰기 동작

- **부분 수정**: post/wiki `edit` 는 현재 값을 읽어 미지정 필드를 유지한다.
- **post done**: 전용 엔드포인트에 의존하지 않고 `class === "closed"` 워크플로를 찾아 `set-workflow` 로 전이한다.
- **댓글**: 업무 댓글은 `logs` 엔드포인트 + `{mimeType, content}`. 위키 댓글은 `{content}`(mimeType 없음).

## 파일 (307)

- 다운/업로드 endpoint 는 307/308 로 실제 URL 을 Location 에 준다. `redirect:"manual"` → Location 추출 → 인증 헤더 재부착 재요청.
- 파일명은 content-disposition 에서 뽑되 `sanitizeFileName` 으로 경로 요소·`..` 제거(traversal 차단).

## 캐시 TTL

- 1시간: projects · members
- 24시간: workflows · wikis · tags 등 거의 불변한 것
- 저장: `~/.dooray-agent/cache/<key>.json`, 봉투 `{ savedAt, data }`.

## 응답 봉투

- 모든 API 응답은 `{ header, result, totalCount? }`. client 는 `result` 만 벗겨 반환하고 에러는 `AppError` 로 정규화한다.
