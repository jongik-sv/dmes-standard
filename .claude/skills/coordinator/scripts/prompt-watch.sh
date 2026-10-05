#!/usr/bin/env bash
# 사용법: prompt-watch.sh <레인> | --handle <h>  [--follow <초>]
#   레인 터미널 화면 끝에서 확인 창·선택 창·사용 한도 창을 판정한다(설계 §3.l). 판정만 하고 응답하지 않는다.
#   stdout: `NONE <h>` 또는 `PROMPT <h> <permission|choice|question|usage-limit>` 다음 줄부터 `---` 로 감싼 화면 발췌.
#   permission 이면 명령 전문이 잘리지 않게 120줄을 다시 읽어 확인 창 시작(위쪽 가로줄)부터 낸다.
#   --follow <초>: 감지될 때까지 3초 간격으로 최대 <초> 반복(끝까지 없으면 NONE).
set -uo pipefail
. "$(dirname "$0")/lib/common.sh"
. "$(dirname "$0")/lib/term.sh"

lane="" h="" follow=0
while [ $# -gt 0 ]; do
  case "$1" in
    --handle) h="${2:-}"; shift ;;
    --follow) follow="${2:-0}"; shift ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    -*) coord_die 2 "모르는 옵션: $1" ;;
    *) lane="$1" ;;
  esac
  shift
done
case "$follow" in ''|*[!0-9]*) coord_die 2 "--follow 는 초(정수)" ;; esac
if [ -z "$h" ]; then
  [ -n "$lane" ] || coord_die 2 "사용법: prompt-watch.sh <레인> | --handle <h> [--follow <초>]"
  coord_has_run || coord_die 3 "현재 회차가 없다"
  h="$(coord_lane_get "$lane" .session.handle)"
  [ -n "$h" ] || coord_die 3 "레인 $lane 의 handle 이 상태에 없다"
fi

# 화면 발췌: 비어 있는 앞뒤 줄을 걷어 낸다. permission 이면 "Do you want to proceed?" 위쪽의 마지막 가로줄부터.
excerpt() {
  local kind="$1" screen="$2"
  if [ "$kind" = permission ]; then
    printf '%s\n' "$screen" | awk '
      { line[NR] = $0 }
      /Do you want to proceed\?|will automatically deny this request/ { q = NR }
      END {
        s = 1
        if (q) for (i = q; i >= 1; i--) { t = line[i]; n = gsub(/─/, "", t); if ((n >= 10 && t ~ /^[[:space:]]*$/) || line[i] ~ /^[[:space:]]*╭/) { s = i; break } }
        for (i = s; i <= NR; i++) print line[i]
      }'
  else
    printf '%s\n' "$screen"
  fi | awk 'NF { started = 1 } started { buf[++n] = $0 } END { while (n > 0 && buf[n] !~ /[^[:space:]]/) n--; for (i = 1; i <= n; i++) print buf[i] }'
}

check_once() {
  local screen kind rc
  screen="$(term_read_screen "$h" 40)"; rc=$?
  if [ "$rc" -ne 0 ]; then
    [ "$rc" -eq 3 ] && coord_die 4 "터미널 handle 이 낡았다(stale): $h"
    coord_die 4 "화면 읽기 실패: $h"
  fi
  kind="$(printf '%s\n' "$screen" | coord_screen_prompt_kind)"
  [ -n "$kind" ] || return 1
  if [ "$kind" = permission ]; then
    local more; more="$(term_read_screen "$h" 120)" && [ -n "$more" ] && screen="$more"
  fi
  echo "PROMPT $h $kind"
  echo "---"
  excerpt "$kind" "$screen"
  echo "---"
  return 0
}

end=$(( $(coord_now_epoch) + follow ))
while :; do
  check_once && exit 0
  [ "$(coord_now_epoch)" -lt "$end" ] || break
  sleep 3
done
echo "NONE $h"
exit 0
