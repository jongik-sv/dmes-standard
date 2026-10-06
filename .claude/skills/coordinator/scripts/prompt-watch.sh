#!/usr/bin/env bash
# 사용법: prompt-watch.sh <레인> | --handle <h> | --lanes a,b,c  [--follow <초>] [--every <초>]
#   레인 터미널 화면 끝에서 확인 창·선택 창·사용 한도 창을 판정한다(설계 §3.l). 판정만 하고 응답하지 않는다.
#   stdout: `NONE <h>` 또는 `PROMPT <h> <permission|choice|question|usage-limit>` 다음 줄부터 `---` 로 감싼 화면 발췌.
#   permission 이면 명령 전문이 잘리지 않게 120줄을 다시 읽어 확인 창 시작(위쪽 가로줄)부터 낸다.
#   --follow <초>: 감지될 때까지 --every 간격으로 최대 <초> 반복(끝까지 없으면 NONE).
#   --every <초>: 읽기 간격. 기본은 설정 approvals.watch_every_s(10). 읽을 때마다 orca terminal read 가 CPU 를 쓰므로 3초보다 길게 둔다.
#   --lanes a,b,c: 한 프로세스에서 레인을 차례로 본다. 줄 형식은 같고 줄 앞에 `<레인> ` 이 붙는다(`<레인> PROMPT <h> <kind>`).
#     창이 새로 뜨거나 종류가 바뀐 레인마다 한 번 블록을 내고 끝나지 않고 계속 본다(창이 사라지면 그 레인은 다시 새로 뜨는 것으로 센다).
#     --follow 시간이 다하면 레인마다 `<레인> NONE <h>` 를 낸다. 핸들이 없거나 낡은 레인은 `<레인> GONE <사유>` 한 줄을 내고 이후 건너뛴다.
set -uo pipefail
. "$(dirname "$0")/lib/common.sh"
. "$(dirname "$0")/lib/term.sh"

lane="" h="" follow=0 every="" lanes=""
while [ $# -gt 0 ]; do
  case "$1" in
    --handle) h="${2:-}"; shift ;;
    --follow) follow="${2:-0}"; shift ;;
    --every) every="${2:-}"; shift ;;
    --lanes) lanes="${2:-}"; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    -*) coord_die 2 "모르는 옵션: $1" ;;
    *) lane="$1" ;;
  esac
  shift
done
case "$follow" in ''|*[!0-9]*) coord_die 2 "--follow 는 초(정수)" ;; esac
[ -n "$every" ] || every="$(coord_cfg .approvals.watch_every_s 2>/dev/null)"
case "$every" in ''|*[!0-9]*|0) every=10 ;; esac
if [ -n "$lanes" ]; then
  [ -z "$h" ] && [ -z "$lane" ] || coord_die 2 "--lanes 는 <레인>·--handle 과 함께 쓰지 않는다"
  coord_has_run || coord_die 3 "현재 회차가 없다"
elif [ -z "$h" ]; then
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

# 단일 모드는 읽기 실패에서 바로 끝내고(기존 동작), --lanes 모드(MULTI=1)는 그 레인만 건너뛴다.
# 종류를 CK_KIND 에 남긴다(여러 레인이 같은 창을 다시 알리지 않게). 창이 없으면 rc 1.
MULTI=0; CK_KIND=""; PREV=""
check_once() {
  local screen kind rc
  CK_KIND=""
  screen="$(term_read_screen "$h" 40)"; rc=$?
  if [ "$rc" -ne 0 ]; then
    [ "$MULTI" = 1 ] && return 2
    [ "$rc" -eq 3 ] && coord_die 4 "터미널 handle 이 낡았다(stale): $h"
    coord_die 4 "화면 읽기 실패: $h"
  fi
  kind="$(printf '%s\n' "$screen" | coord_screen_prompt_kind)"
  [ -n "$kind" ] || return 1
  CK_KIND="$kind"
  [ "$MULTI" = 1 ] && [ "$kind" = "$PREV" ] && return 3   # 같은 창이 계속 떠 있다 — 이미 알렸다
  if [ "$kind" = permission ]; then
    local more; more="$(term_read_screen "$h" 120)" && [ -n "$more" ] && screen="$more"
  fi
  echo "${PFX}PROMPT $h $kind"
  echo "---"
  excerpt "$kind" "$screen"
  echo "---"
  return 0
}
PFX=""

end=$(( $(coord_now_epoch) + follow ))
if [ -n "$lanes" ]; then
  MULTI=1
  # 레인마다 현재 알린 창 종류(없으면 빈 칸), 핸들, 건너뜀 표식. bash 3.2 라 연관 배열 대신 평행 배열을 쓴다.
  names=(); hs=(); seen=(); dead=()
  IFS=',' read -r -a want <<< "$lanes"
  for l in "${want[@]}"; do
    [ -n "$l" ] || continue
    hh="$(coord_lane_get "$l" .session.handle)"
    names+=("$l"); hs+=("$hh"); seen+=(""); dead+=("0")
    [ -n "$hh" ] || { echo "$l GONE handle 이 상태에 없다"; dead[$((${#names[@]} - 1))]=1; }
  done
  [ "${#names[@]}" -gt 0 ] || coord_die 2 "--lanes 에 레인이 없다"
  while :; do
    i=0
    while [ "$i" -lt "${#names[@]}" ]; do
      if [ "${dead[$i]}" = 0 ]; then
        h="${hs[$i]}"; PFX="${names[$i]} "
        PREV="${seen[$i]}"
        check_once; crc=$?
        if [ "$crc" -eq 0 ]; then seen[$i]="$CK_KIND"   # 새 창이거나 종류가 바뀌어 블록을 냈다
        elif [ "$crc" -eq 1 ]; then seen[$i]=""         # 창이 사라졌다 — 다시 뜨면 새로 알린다
        elif [ "$crc" -eq 3 ]; then :                   # 같은 창이 계속 떠 있다
        else echo "${names[$i]} GONE 화면 읽기 실패(낡은 handle)"; dead[$i]=1; fi
      fi
      i=$((i + 1))
    done
    [ "$(coord_now_epoch)" -lt "$end" ] || break
    sleep "$every"
  done
  i=0
  while [ "$i" -lt "${#names[@]}" ]; do
    [ "${dead[$i]}" = 0 ] && echo "${names[$i]} NONE ${hs[$i]}"
    i=$((i + 1))
  done
  exit 0
fi
while :; do
  check_once && exit 0
  [ "$(coord_now_epoch)" -lt "$end" ] || break
  sleep "$every"
done
echo "NONE $h"
exit 0
