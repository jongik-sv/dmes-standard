#!/usr/bin/env bash
# 사용법: usage-band.sh   (인자 없음. 정본: ../references/contract.md §3.3, 설계 §3.f)
# stdout 한 줄: `BAND <G|Y|O|R|UNKNOWN> five=<n|-> week=<n|-> week_allow=<n|-> src=<kind|-> at=<iso|-> five_reset=<iso|-> week_reset=<iso|-> raw=<G|Y|O|R|->`
# 출처는 설정 usage.sources 순서대로 읽어 처음으로 유효한 것 하나만 쓴다(계정 전체 값).
#   cache      : <path> 의 .five_hour.utilization·.seven_day.utilization·.resets_at(ISO). 시각 = 파일 mtime
#   limits-dir : <path>/*.json 의 {"at":epoch,"rate_limits":{"five_hour":{"used_percentage","resets_at":epoch},"seven_day":…}} 중 at 이 가장 최근
#   coord-dump : <path>/*.json 의 {at,session_id,context_window,rate_limits} 중 at 이 가장 최근(rate_limits 형식은 limits-dir 와 같다)
# 유효 = 시각이 usage.max_age_min 안. 그보다 오래됐으면 reset 시각이 아직 안 지난 값만 남기고(지난 값은 -), 둘 다 없으면 다음 출처.
# 띠 = five·week 각각의 띠(usage.bands, 이상이면 그 띠) 중 높은 쪽. usage.week_pace(기본 false)가 true 이고 week reset 을 알면
# week_allow = 100×(7−남은 일수)/7+usage.week_pace_margin(기본 20) 을 계산해 week 가 이를 넘으면 week 의 띠를 한 단계 올린다(G→Y→O→R).
# usage.relaxed(기본 false)가 true 이면 계정 여유가 있다고 보고 Y·O 를 G 로 내려 BAND 에 낸다(R 은 그대로). raw= 는 내리기 전 띠.
# 출처가 모두 없으면 BAND UNKNOWN(막지 않는다).
set -uo pipefail
# shellcheck source=lib/common.sh
. "$(dirname "$0")/lib/common.sh"
coord_default_repo

case "${1:-}" in
  "") ;;
  -h|--help) sed -n '2,12p' "$0" >&2; exit 0 ;;
  *) coord_die 2 "사용법: usage-band.sh (인자 없음)" ;;
esac

now="$(coord_now_epoch)"
max_age="$(coord_cfg .usage.max_age_min)"; case "$max_age" in ""|*[!0-9]*) max_age=30 ;; esac
isnum() { awk -v x="${1:-}" 'BEGIN { exit !(x ~ /^[0-9]+(\.[0-9]+)?$/) }'; }

# 출처 하나 읽기 → 전역 r_five r_week r_fr r_wr r_at (값 또는 빈 값, 시각은 epoch)
read_src() {
  local kind="$1" path="$2" row f best
  r_five="" r_week="" r_fr="" r_wr="" r_at=""
  case "$kind" in
    cache)
      [ -f "$path" ] || return 1
      row="$(jq -r '[(.five_hour.utilization // ""), (.seven_day.utilization // ""),
                     (.five_hour.resets_at // ""), (.seven_day.resets_at // "")] | map(tostring) | @tsv' "$path" 2>/dev/null)" || return 1
      r_five="$(printf '%s' "$row" | cut -f1)"; r_week="$(printf '%s' "$row" | cut -f2)"
      r_fr="$(coord_iso_to_epoch "$(printf '%s' "$row" | cut -f3)")"; r_wr="$(coord_iso_to_epoch "$(printf '%s' "$row" | cut -f4)")"
      r_at="$(coord_file_mtime "$path")"
      ;;
    limits-dir|coord-dump)
      [ -d "$path" ] || return 1
      best=""
      for f in "$path"/*.json; do
        [ -f "$f" ] || continue
        case "$f" in *.settings.json) continue ;; esac
        row="$(jq -r '(.at | if type == "number" then (if . > 100000000000 then (. / 1000 | floor) else floor end) else . end) as $at
                      | select(.rate_limits != null)
                      | [$at, (.rate_limits.five_hour.used_percentage // ""), (.rate_limits.seven_day.used_percentage // ""),
                         (.rate_limits.five_hour.resets_at // ""), (.rate_limits.seven_day.resets_at // "")]
                      | map(tostring) | @tsv' "$f" 2>/dev/null)" || continue
        [ -n "$row" ] || continue
        local a; a="$(printf '%s' "$row" | cut -f1)"
        case "$a" in ""|*[!0-9]*) a="$(coord_iso_to_epoch "$a")"; row="$a$(printf '%s' "$row" | cut -f2- | sed 's/^/\t/')" ;; esac
        [ -n "$a" ] || continue
        if [ -z "$best" ] || [ "$a" -gt "$(printf '%s' "$best" | cut -f1)" ]; then best="$row"; fi
      done
      [ -n "$best" ] || return 1
      r_at="$(printf '%s' "$best" | cut -f1)"
      r_five="$(printf '%s' "$best" | cut -f2)"; r_week="$(printf '%s' "$best" | cut -f3)"
      r_fr="$(printf '%s' "$best" | cut -f4)"; r_wr="$(printf '%s' "$best" | cut -f5)"
      ;;
    *) coord_log "모르는 usage source kind: $kind"; return 1 ;;
  esac
  isnum "$r_five" || r_five=""; isnum "$r_week" || r_week=""
  case "$r_fr" in *[!0-9]*) r_fr="" ;; esac; case "$r_wr" in *[!0-9]*) r_wr="" ;; esac
  case "$r_at" in ""|*[!0-9]*) return 1 ;; esac
  if [ $((now - r_at)) -gt $((max_age * 60)) ]; then
    # 오래된 값: reset 시각이 아직 안 지난 값만 믿는다
    if [ -z "$r_fr" ] || [ "$r_fr" -le "$now" ]; then r_five=""; fi
    if [ -z "$r_wr" ] || [ "$r_wr" -le "$now" ]; then r_week=""; fi
  fi
  [ -n "$r_five$r_week" ]
}

n="$(coord_cfg_json '.usage.sources | length')"
found="" src=""
i=0
while [ "$i" -lt "${n:-0}" ]; do
  kind="$(coord_cfg ".usage.sources[$i].kind")"; path="$(coord_expand "$(coord_cfg ".usage.sources[$i].path")")"
  if read_src "$kind" "$path"; then found=1; src="$kind"; break; fi
  i=$((i + 1))
done

if [ -z "$found" ]; then
  echo "BAND UNKNOWN five=- week=- week_allow=- src=- at=- five_reset=- week_reset=- raw=-"
  exit 0
fi

int() { [ -n "${1:-}" ] && awk -v x="$1" 'BEGIN { printf "%d", x + 0.5 }' || printf -- '-'; }
five="$(int "$r_five")"; week="$(int "$r_week")"

# 띠 순위 G=0 Y=1 O=2 R=3
rank_of() { # <값> <five|week>
  local v="$1" k="$2" r=0 i=0 b t
  [ "$v" = "-" ] && { echo 0; return; }
  for b in Y O R; do
    i=$((i + 1))
    t="$(coord_cfg ".usage.bands.$b.$k")"
    if [ -n "$t" ] && awk -v v="$v" -v t="$t" 'BEGIN { exit !(v >= t) }'; then r=$i; fi
  done
  echo "$r"
}
rf="$(rank_of "$five" five)"; rw="$(rank_of "$week" week)"

allow="-"
if [ "$(coord_cfg .usage.week_pace)" = true ] && [ -n "$r_wr" ]; then
  margin="$(coord_cfg .usage.week_pace_margin)"; isnum "$margin" || margin=20
  allow="$(awk -v r="$r_wr" -v n="$now" -v m="$margin" 'BEGIN { d = (r - n) / 86400; if (d < 0) d = 0; if (d > 7) d = 7; printf "%d", 100 * (7 - d) / 7 + m + 0.5 }')"
  if [ "$week" != "-" ] && [ "$week" -gt "$allow" ] && [ "$rw" -lt 3 ]; then rw=$((rw + 1)); fi
fi
r=$rf; [ "$rw" -gt "$r" ] && r=$rw
raw="$(echo "G Y O R" | cut -d' ' -f$((r + 1)))"
band="$raw"
if [ "$(coord_cfg .usage.relaxed)" = true ] && { [ "$band" = Y ] || [ "$band" = O ]; }; then band=G; fi

iso_or_dash() { local s; s="$(coord_epoch_to_iso "${1:-}")"; printf '%s' "${s:--}"; }
echo "BAND $band five=$five week=$week week_allow=$allow src=$src at=$(iso_or_dash "$r_at") five_reset=$(iso_or_dash "$r_fr") week_reset=$(iso_or_dash "$r_wr") raw=$raw"
