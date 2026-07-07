#!/usr/bin/env bash
# live-smoke.sh — dooray-agent 읽기 전용 실전 검증 (실 토큰 필요, write/send 없음)
#
# 목적: 단위테스트(모킹)로는 못 잡는 live API 대조 — TODO(verify) 가정(캘린더 필드·
#       메일·파일·자원 예약 모델)을 실제 Dooray 응답으로 실증한다.
# 안전: 오직 조회(list/get/whoami)만 호출. create/edit/delete/send 절대 없음.
# 사용: dra login 을 먼저 한 뒤  ->  bash scripts/live-smoke.sh
#
# 결과의 원자료(--json)를 그대로 보여주므로, 캘린더 이벤트에 회의실/자원 참석 필드가
# 있는지(자원 예약 가능 여부) 육안으로 확인할 수 있다.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
CLI="node dist/cli.js"
PASS=0; FAIL=0; SKIP=0

hr(){ printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
ok(){ printf '  \033[32m✓ %s\033[0m\n' "$1"; PASS=$((PASS+1)); }
no(){ printf '  \033[31m✗ %s\033[0m\n' "$1"; FAIL=$((FAIL+1)); }
sk(){ printf '  \033[33m∅ %s\033[0m\n' "$1"; SKIP=$((SKIP+1)); }

# JSON 조회 실행: 성공하면 stdout(원자료) 반환, 실패하면 비고
run(){ $CLI "$@" --json 2>/tmp/dra-smoke.err; }

# dist 존재 확인
if [ ! -f dist/cli.js ]; then echo "dist/cli.js 없음 — 먼저 'npm run build'"; exit 1; fi

hr "0. 인증 (whoami)"
if ME=$(run whoami); then ok "whoami OK"; echo "$ME" | head -c 400; echo
else no "whoami 실패 — dra login 먼저 (아래 에러)"; cat /tmp/dra-smoke.err; echo
     echo; echo "인증이 안 되면 이후 전부 실패합니다. 종료."; exit 1; fi

hr "1. 문서 조회 — 프로젝트/업무"
if PJ=$(run project list); then
  ok "project list OK"
  PID=$(printf '%s' "$PJ" | grep -oE '"id":"[0-9]+"' | head -1 | grep -oE '[0-9]+')
  if [ -n "${PID:-}" ]; then
    printf '    첫 프로젝트 id=%s\n' "$PID"
    if PL=$(run post list "$PID"); then
      ok "post list OK"
      POSTID=$(printf '%s' "$PL" | grep -oE '"id":"[0-9]+"' | head -1 | grep -oE '[0-9]+')
      if [ -n "${POSTID:-}" ]; then
        if run post get "$PID" "$POSTID" >/dev/null; then ok "post get OK (본문 포함)"; else no "post get 실패"; fi
      else sk "업무가 없어 post get 스킵"; fi
    else no "post list 실패"; fi
    hr "2. 문서 조회 — 위키"
    if run wiki pages "$PID" >/dev/null 2>&1; then ok "wiki pages OK"; else sk "위키 없음/권한없음 (스킵)"; fi
  else sk "프로젝트가 없어 하위 조회 스킵"; fi
else no "project list 실패"; fi

hr "3. 일정 — 캘린더 (자원 예약 모델 조사 포함)"
if CALS=$(run calendar list); then
  ok "calendar list OK"
  echo "  ── 캘린더 원자료(자원/회의실 캘린더가 섞여 있는지 확인) ──"
  printf '%s\n' "$CALS" | head -c 1200; echo
  echo "  ── type/category/resource 관련 필드 grep ──"
  printf '%s' "$CALS" | grep -oiE '"(type|category|kind|resource[A-Za-z]*|calendarType)":"?[^",}]*' | sort -u | sed 's/^/    /' || echo "    (해당 필드 없음)"
  hr "3b. 캘린더 이벤트 원자료 (참석/자원 필드 확인)"
  if EVS=$(run calendar events); then
    ok "calendar events OK"
    echo "  ── 이벤트 원자료(첫 1건 — users/attendees/resource/회의실 필드 유무) ──"
    printf '%s\n' "$EVS" | head -c 1500; echo
    echo "  ── 참석/자원 관련 키 grep ──"
    printf '%s' "$EVS" | grep -oiE '"(users|from|to|members|attendee[A-Za-z]*|resource[A-Za-z]*|location|meetingRoom)":' | sort -u | sed 's/^/    /' || echo "    (해당 키 없음)"
  else sk "이벤트 없음/범위 밖 (스킵)"; fi
else no "calendar list 실패 (아래 에러)"; cat /tmp/dra-smoke.err; fi

hr "4. 이메일 조회 (IMAP 설정 시)"
if ML=$(run mail list 2>/tmp/dra-smoke.err); then
  ok "mail list OK"; printf '%s\n' "$ML" | head -c 500; echo
else
  if grep -qiE 'IMAP|설정' /tmp/dra-smoke.err; then sk "IMAP 미설정 (config set imap-host 등) — 스킵"
  else no "mail list 실패 (아래 에러)"; cat /tmp/dra-smoke.err; fi
fi

hr "요약"
printf '  통과 %d · 실패 %d · 스킵 %d\n' "$PASS" "$FAIL" "$SKIP"
echo
echo "자원 예약 판정 가이드:"
echo "  · '3'의 캘린더 목록에 회의실/자원 이름의 캘린더가 있고, '3b' 이벤트에"
echo "    resource/attendee/회의실 계열 필드가 보이면 → 캘린더 이벤트로 예약 가능(구현 여지)."
echo "  · 그런 필드가 전혀 없으면 → 공개 API 로는 자원 예약 미지원(제품 UI 전용)."
echo
echo "이 출력을 그대로 붙여주시면, TODO(verify) 실증 + 자원 예약 구현 가능성을 판정하겠습니다."
[ "$FAIL" -eq 0 ]
