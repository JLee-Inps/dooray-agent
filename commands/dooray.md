---
description: Dooray 문서(위키·업무·캘린더 등)를 dra CLI 로 자동 읽기/쓰기
---

# /dooray

`dooray-agent`(별칭 `dra`) CLI 로 NHN Dooray 문서를 다룬다.
모든 명령이 `--json`/`--quiet` 를 지원하므로, 결과를 파싱해 다음 액션에 이어 붙인다.

## 전제 (최초 1회)

- CLI 설치: `npm i -g dooray-agent` (npm 미배포 시 소스 설치: `git clone https://github.com/JLee-Inps/dooray-agent.git && cd dooray-agent && pnpm install && pnpm build && npm link`)
- 인증: `dra login --token <DOORAY_API_TOKEN> --base-url https://api.dooray.com`
- 확인: `dra whoami --json`

## 사용

사용 가능한 명령·인자·옵션은 런타임에 발견한다(스킬 문서가 낡아도 정확):

```bash
dra capabilities --json
```

자동화 흐름·의도→명령 매핑은 `dooray-agent` 스킬(`skills/dooray-agent/SKILL.md`)을 단일 출처로 따른다.

- 읽기: `dra wiki page get <project> <page-id> --json` / `dra post get ...`
- 쓰기: `dra wiki page edit ... --json | jq -r '.status'` (부분 수정, `updated` 로 확인)
- 실패: `--json` 모드는 stderr 로 `{ "error": { "message", "code" } }`.

CLI 가 없으면 먼저 설치를 안내하고, 인증이 없으면 `dra login` 을 안내한다.
