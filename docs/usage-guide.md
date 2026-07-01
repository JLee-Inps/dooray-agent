# 사용 가이드 (에이전트 튜토리얼)

Claude Code 같은 에이전트가 dooray-agent 로 Dooray 문서를 자동화하는 전체 흐름.

## 0. 준비

npm 레지스트리 미배포 시 소스 설치: `git clone https://github.com/JLee-Inps/dooray-agent.git && cd dooray-agent && pnpm install && pnpm build && npm link`

```bash
npm install -g dooray-agent   # npm 배포 후 사용 가능
dra login --token <DOORAY_API_TOKEN> --base-url https://api.dooray.com
dra whoami --json    # {"id":"...","name":"..."} 나오면 성공
```

## 1. 능력부터 발견한다

에이전트는 사용 가능한 명령을 스킬 문서에 의존하지 말고 런타임에 확인한다.

```bash
dra capabilities --json     # [{path, description, arguments, options}, ...]
```

## 2. 이름 대신 ID 를 얻는다

사용자는 "AI서비스 프로젝트" 라고 말하고 ID 는 모른다. 목록·검색으로 먼저 해석한다.

```bash
PROJECT=$(dra project list --json | jq -r '.[] | select(.code=="ai-service") | .id')
```

`<project>` 인자에는 코드·ID 둘 다 넣을 수 있으니 보통은 코드를 그대로 써도 된다.

## 3. 문서를 읽는다

```bash
# 위키 페이지 본문
dra wiki page get ai-service <pageId> --json | jq -r '.body.content'

# 업무 검색 → 첫 결과
dra post search ai-service --keyword "배포 체크리스트" --json | jq -r '.[0].id'
```

## 4. 문서를 쓴다 (부분 수정)

지정하지 않은 필드는 현재 값이 유지된다 — 본문만, 제목만 바꿀 수 있다.

```bash
dra wiki page edit ai-service <pageId> --body "$(cat updated.md)" --json | jq -r '.status'
# → "updated"
```

## 5. 결과로 분기한다

```bash
STATUS=$(dra post done ai-service <postId> --json | jq -r '.status')
if [ "$STATUS" = "done" ]; then
  dra post comment add ai-service <postId> --body "자동 완료 처리됨" --json
fi
```

## 6. 실패를 처리한다

`--json` 모드에서는 에러도 구조화된다.

```bash
dra post get ai-service 999999 --json 2> err.json
cat err.json    # {"error":{"message":"Dooray API 오류 (404): ...","code":1}}
```

## 왜 이렇게 동작하는가

- 3-모드·구조화 에러·`capabilities`·부분 수정은 **에이전트 자동화 1순위** 설계의 결과다.
- 설계 근거는 `docs/design-notes.md`, 엔드포인트 대응은 `docs/api-reference.md`.
