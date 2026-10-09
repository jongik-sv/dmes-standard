#!/usr/bin/env bash
# 사용법: prompt-watch.sh <레인> | --handle <h> | --lanes a,b,c  [--follow <초>] [--every <초>]
#   레인 터미널 화면 끝에서 확인 창·선택 창·사용 한도 창을 판정한다(설계 §3.l). 판정만 하고 응답하지 않는다.
#   stdout: `NONE <h>` 또는 `PROMPT <h> <permission|choice|question|usage-limit>` 다음 줄부터 `---` 로 감싼 화면 발췌.
#   permission 이면 명령 전문이 잘리지 않게 120줄을 다시 읽어 확인 창 시작(위쪽 가로줄)부터 낸다.
#   --follow <초>: 감지될 때까지 --every 간격으로 최대 <초> 반복(끝까지 없으면 NONE).
#   --every <초>: 읽기 간격. 기본은 설정 approvals.watch_every_s(10). 읽을 때마다 orca terminal read 가 CPU 를 쓰므로 3초보다 길게 둔다.
#   화면 캐시: 콘솔 폴러가 레인 화면을 읽으면 $DFLOW_CONSOLE_DIR/screen/ 에 남긴다. 신선한(설정 approvals.screen_cache_s, 기본 20초; 0 이면 끔)·
#     믿을 수 있는(현재 사용자 소유·권한 700/600) 캐시가 있으면 orca 를 부르지 않고 그 화면(마지막 40줄)으로 판정한다. 없거나 낡았거나 깨졌으면 조용히 직접 읽는다.
#     --follow 에서는 신선한 캐시가 있는 동안 캐시 json 의 내용(읽은 시각이 바뀐다)만 보고, 바뀐 때만 새로 판정한다(폴러가 꺼져 캐시가 낡으면 그때부터 직접 읽는다).
#     permission 의 120줄 재읽기는 늘 직접 읽는다(그 화면에 권한 창이 없으면 — 창이 사라졌다 — 이미 읽은 40줄 화면으로 발췌한다). 자동 응답(auto-answer.sh·term-send-safe.sh)은 이 캐시를 쓰지 않는다 — 여기서는 「창이 떴는가」 감지뿐이다.
#   --lanes a,b,c: 한 프로세스에서 레인을 차례로 본다. 줄 형식은 같고 줄 앞에 `<레인> ` 이 붙는다(`<레인> PROMPT <h> <kind>`).
#     창이 새로 뜨거나 종류가 바뀐 레인마다 한 번 블록을 내고 끝나지 않고 계속 본다(창이 사라지면 그 레인은 다시 새로 뜨는 것으로 센다).
#     같은 종류의 창이 사이에 「창 없음」 표본 없이 이어져도 창 지문(full — 캐시 json 의 값, 직접 읽은 화면은 lib/console-input.sh 로 같은 방식으로 계산)이
#     바뀌면 새 창으로 다시 알린다. 상태줄 숫자만 바뀐 같은 창은 지문이 같아 다시 알리지 않는다. 지문이 없는 창(머리를 못 찾음)은 종류로만 비교한다(한계).
#     --follow 시간이 다하면 레인마다 `<레인> NONE <h>` 를 낸다. 핸들이 없거나 낡은 레인은 `<레인> GONE <사유>` 한 줄을 내고 이후 건너뛴다.
#   interrupted: 창은 아니지만 자동 거부·Esc 뒤 화면 끝에 `Interrupted · What should Claude do instead?` 가 남아 사람의 지시를 기다리는 상태다(`PROMPT <h> interrupted`). 다른 종류가 없을 때만 낸다.
set -uo pipefail
_SD="${0%/*}"; [ "$_SD" != "$0" ] || _SD=.
. "$_SD/lib/js-bridge.sh"; if _jsb_on PROMPT_WATCH; then _jsb_exec "$_SD/prompt-watch" "$@"; fi   # node 판(스위치 COORD_JS_PROMPT_WATCH)
. "$(dirname "$0")/lib/common.sh"
. "$(dirname "$0")/lib/term.sh"
. "$(dirname "$0")/lib/screen-cache.sh"

lane="" h="" follow=0 every="" lanes=""
while [ $# -gt 0 ]; do
  case "$1" in
    --handle) h="${2:-}"; shift ;;
    --follow) follow="${2:-0}"; shift ;;
    --every) every="${2:-}"; shift ;;
    --lanes) lanes="${2:-}"; shift ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
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
# 화면은 신선한 캐시가 있으면 거기서(orca 호출 없음), 아니면 직접 읽는다. 캐시 서명(CSIG)·읽은 시각(CAT)은 호출자가 레인마다 들고 다닌다:
#   서명이 그대로고 아직 신선하면 화면이 바뀌지 않은 것이라 새 판정 없이 rc 3(= 이미 알린 상태 그대로)을 낸다.
SC_TTL="$(sc_ttl)"; export SC_TTL
MULTI=0; CK_KIND=""; CK_FULL=""; PREV=""; PREVF=""; CSIG=""; CAT=0
# 직접 읽은 화면의 창 지문(lib/console-input.sh 의 console_full_sha — 폴러가 캐시에 남기는 값과 같은 함수). 처음 필요할 때만 읽어 들이고,
# 못 읽거나 지문을 못 만들면 빈 값(그 창은 종류로만 비교한다).
PW_FULL_LOADED=""
pw_full() {
  if [ -z "$PW_FULL_LOADED" ]; then
    if . "$(dirname "$0")/lib/console-input.sh" 2>/dev/null && declare -F console_full_sha >/dev/null; then PW_FULL_LOADED=1; else PW_FULL_LOADED=0; fi
  fi
  [ "$PW_FULL_LOADED" = 1 ] || return 0
  printf '%s\n' "$1" | console_full_sha 2>/dev/null || true
}
# 화면 끝 30줄에 「Interrupted · What should Claude do instead?」 가 있으면 interrupted(자동 거부·Esc 로 끊긴 뒤 지시를 기다리는 상태).
pw_interrupted() {
  case "$(printf '%s\n' "$1" | tail -n 30)" in *"Interrupted · What should Claude do instead?"*) echo interrupted ;; esac
}
check_once() {
  local screen kind rc sig="" cached=0
  CK_KIND=""; CK_FULL=""
  if [ "$SC_TTL" -gt 0 ]; then
    sig="$(sc_sig "$h" 2>/dev/null)" || sig=""
    if [ -n "$sig" ] && [ "$sig" = "$CSIG" ] && [ $(( $(sc_now_ms) - CAT )) -le $(( SC_TTL * 1000 )) ]; then return 3; fi
  fi
  CSIG=""
  if [ -n "$sig" ] && sc_load "$h" 2>/dev/null; then
    screen="$SC_SCREEN"; rc=0; CSIG="$sig"; CAT="$SC_AT"; cached=1; CK_FULL="$SC_FULL"
  else
    screen="$(term_read_screen "$h" 40)"; rc=$?
  fi
  if [ "$rc" -ne 0 ]; then
    [ "$MULTI" = 1 ] && return 2
    [ "$rc" -eq 3 ] && coord_die 4 "터미널 handle 이 낡았다(stale): $h"
    coord_die 4 "화면 읽기 실패: $h"
  fi
  kind="$(printf '%s\n' "$screen" | coord_screen_prompt_kind)"
  [ -n "$kind" ] || kind="$(pw_interrupted "$screen")"
  [ -n "$kind" ] || return 1
  CK_KIND="$kind"
  if [ "$MULTI" = 1 ]; then
    # 직접 읽은 화면은 여기서 지문을 만든다(캐시를 쓴 화면은 폴러가 남긴 값 — 비어 있으면 폴러도 못 만든 창이다)
    [ "$cached" = 1 ] || CK_FULL="$(pw_full "$screen")"
    # 같은 종류이고 지문이 같거나 어느 한쪽이 없으면 같은 창이다(이미 알렸다). 지문이 둘 다 있고 다르면 새 창이다.
    if [ "$kind" = "$PREV" ] && { [ -z "$CK_FULL" ] || [ -z "$PREVF" ] || [ "$CK_FULL" = "$PREVF" ]; }; then return 3; fi
  fi
  if [ "$kind" = permission ]; then
    # 명령 전문이 잘리지 않게 120줄을 읽는다. 그 화면에 권한 창이 없으면(그사이 사라짐) 이미 읽은 40줄 화면으로 발췌한다.
    local more mk
    more="$(term_read_screen "$h" 120)" && [ -n "$more" ] && {
      mk="$(printf '%s\n' "$more" | coord_screen_prompt_kind)"
      [ "$mk" = permission ] && screen="$more"
    }
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
  names=(); hs=(); seen=(); seenf=(); dead=(); csigs=(); cats=()
  IFS=',' read -r -a want <<< "$lanes"
  for l in "${want[@]}"; do
    [ -n "$l" ] || continue
    hh="$(coord_lane_get "$l" .session.handle)"
    names+=("$l"); hs+=("$hh"); seen+=(""); seenf+=(""); dead+=("0"); csigs+=(""); cats+=("0")
    [ -n "$hh" ] || { echo "$l GONE handle 이 상태에 없다"; dead[$((${#names[@]} - 1))]=1; }
  done
  [ "${#names[@]}" -gt 0 ] || coord_die 2 "--lanes 에 레인이 없다"
  while :; do
    i=0
    while [ "$i" -lt "${#names[@]}" ]; do
      if [ "${dead[$i]}" = 0 ]; then
        h="${hs[$i]}"; PFX="${names[$i]} "
        PREV="${seen[$i]}"; PREVF="${seenf[$i]}"; CSIG="${csigs[$i]}"; CAT="${cats[$i]}"
        check_once; crc=$?
        csigs[$i]="$CSIG"; cats[$i]="$CAT"
        if [ "$crc" -eq 0 ]; then seen[$i]="$CK_KIND"; seenf[$i]="$CK_FULL"   # 새 창이거나 종류·지문이 바뀌어 블록을 냈다
        elif [ "$crc" -eq 1 ]; then seen[$i]=""; seenf[$i]=""         # 창이 사라졌다 — 다시 뜨면 새로 알린다
        elif [ "$crc" -eq 3 ]; then [ -z "$CK_FULL" ] || seenf[$i]="$CK_FULL"   # 같은 창이 계속 떠 있다(지문을 처음 얻었으면 기억해 둔다)
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
