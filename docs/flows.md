# 흐름 (시나리오)

대표 자동화 시나리오와 명령 순서. 모든 조회는 `--json`, 쓰기는 결과 `status` 로 분기한다.

## 흐름 1 — 위키 문서 자동 갱신

```bash
BODY=$(dra wiki page get proj <pageId> --json | jq -r '.body.content')
NEW="$BODY

## $(date +%F) 자동 갱신
- 상태 점검 완료"
dra wiki page edit proj <pageId> --body "$NEW" --json | jq -r '.status'   # updated
```

## 흐름 2 — 업무 찾아 완료 + 기록

```bash
POST=$(dra post search proj --keyword "graceful shutdown" --json | jq -r '.[0].id')
dra post comment add proj "$POST" --body "자동 점검 통과" --json
dra post done proj "$POST" --json | jq -r '.status'                        # done
```

## 흐름 3 — 새 업무 생성 + 담당자·태그

```bash
POST=$(dra post create proj \
  --title "배포 리허설" --body "체크리스트..." \
  --to 홍길동 --cc 김철수 --tag "release" --json | jq -r '.postId')
```

## 흐름 4 — 첨부파일 주고받기

```bash
FILE=$(dra post file upload proj <postId> ./report.pdf --json | jq -r '.fileId')
dra post file list proj <postId> --json
dra post file download proj <postId> "$FILE" --out ./dl --json | jq -r '.status'  # downloaded
```

## 흐름 5 — 설정·연결 확인

```bash
dra config set base-url https://api.dooray.com
dra config get --json          # 토큰은 마스킹되어 나옴
dra doctor --json | jq -r '.status'   # ok
```

## 실패 처리 (공통)

- 종료 코드로 성공/실패 판정(0 성공 · 1 API · 2 인증 · 3 사용법 · 4 설정).
- `--json` 모드는 stderr 로 `{ "error": { "message", "code" } }`.
