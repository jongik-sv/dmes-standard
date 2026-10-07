#!/usr/bin/env bash
# 사용법: coord-status.sh [--json]   (정본: ../references/contract.md §3.3, 설계 §3.c)
# 읽기 전용. 토큰을 쓰지 않고 한 화면짜리 상태표를 모은다. stdout(줄 형식은 계약 그대로):
#   LANE <레인> name=<세션> status=<busy|idle|gone> for=<분>m report=<HH:MM|-> commit=<HH:MM|-> ahead=<n|-> bg=<콤마목록|-> ctx=<n|->% hold=<사유|->
#   PC load1=<f> cpus=<n> per_core=<f> heavy=<held>/<waiting>/<K> swap_mb=<n|-> five=<n|-> week=<n|-> band=<띠>
#   UNLINKED <이름> pid=<pid> cwd=<경로>        cwd 가 이 리포(메인·워크트리)인 살아 있는 interactive 세션 중 레인·조정자가 아닌 것
#   WINDOW <kind> lane=<레인|-> until=<iso>
# --json 은 같은 정보를 객체 배열로 낸다(각 객체에 "type": lane|pc|unlinked|window).
# 세부: status·for 는 <sessions_dir>/<pid>.json 의 status·statusUpdatedAt(ms), pid 가 죽었거나 파일이 없으면 gone(for 는 알면 그 값, 모르면 -).
#   bg 는 lib coord_bg_signals(heavy RUN cwd·tasks 출력 mtime·워크트리 cwd 의 빌드·시험 프로세스). ctx 는 ctx-usage.sh --lane.
#   heavy.script 가 없으면 heavy=-/-/-, 레인의 heavy 신호는 보지 않는다. 세션 이름의 공백은 _ 로 바꾼다.
#   closed 레인은 내지 않는다.
set -uo pipefail
# shellcheck source=lib/common.sh
. "$(dirname "$0")/lib/common.sh"
coord_default_repo

JSON=""
case "${1:-}" in
  "") ;;
  --json) JSON=1 ;;
  -h|--help) sed -n '2,13p' "$0" >&2; exit 0 ;;
  *) coord_die 2 "사용법: coord-status.sh [--json]" ;;
esac

coord_has_run || coord_die 3 "현재 회차가 없다(coord-state.sh init 먼저)"
SF="$(coord_state_file)"
REPO="$(coord_repo)"
NOW="$(coord_now_epoch)"
DIR="$(dirname "$0")"
IB="$(jq -r '.run.integration_branch // empty' "$SF")"; [ -n "$IB" ] || IB="$(coord_cfg .integration_branch)"

SNAP=""; HEAVY_ON=""
if HS="$(coord_heavy_script)"; then HEAVY_ON=1; SNAP="$(bash "$HS" snapshot 2>/dev/null)"; fi

JOUT=""
jadd() { JOUT="$JOUT$1"$'\n'; }
dash() { [ -n "${1:-}" ] && [ "$1" != null ] && printf '%s' "$1" || printf -- '-'; }
hm_of_iso() { local e; e="$(coord_iso_to_epoch "${1:-}")"; [ -n "$e" ] && coord_epoch_to_hm "$e" || printf -- '-'; }

# ---------- 레인 ----------
lanes="$(jq -r '.lanes | to_entries[] | select((.value.state // "active") != "closed") | .key' "$SF")"
for L in $lanes; do
  row="$(jq -r --arg l "$L" '.lanes[$l] as $x | [($x.session.name // ""), ($x.session.session_id // ""), ($x.session.pid // 0 | tostring),
          ($x.worktree // ""), ($x.branch // ""), ($x.last_report_at // ""), ($x.hold.reason // "")] | map(tostring) | join("\u001f")' "$SF")"
  IFS=$'\037' read -r name sid pid wt branch rep hold <<EOF
$row
EOF
  sfile="$(coord_session_file "$pid" "$sid" 2>/dev/null || true)"
  status=gone; upd=""
  if [ -n "$sfile" ]; then
    spid="$(jq -r '.pid // empty' "$sfile")"
    s="$(jq -r '.status // empty' "$sfile")"
    upd="$(jq -r '(.statusUpdatedAt // .updatedAt // empty) / 1000 | floor' "$sfile" 2>/dev/null)"
    [ -n "$name" ] || name="$(jq -r '.name // empty' "$sfile")"
    [ -n "$sid" ] || sid="$(jq -r '.sessionId // empty' "$sfile")"
    if coord_pid_alive "$spid"; then
      if [ "$s" = idle ]; then status=idle; else status=busy; fi
    fi
  fi
  if [ -n "$upd" ]; then for_m="$(( (NOW - upd) / 60 ))"; [ "$for_m" -lt 0 ] && for_m=0; else for_m="-"; fi
  name="$(dash "$name" | tr ' \t' '__')"
  report="$(hm_of_iso "$rep")"
  commit="-"; ahead="-"
  if [ -n "$branch" ]; then
    ct="$(coord_git -C "$REPO" log -1 --format=%ct "$branch" -- 2>/dev/null)"
    [ -n "$ct" ] && commit="$(coord_epoch_to_hm "$ct")"
    a="$(coord_git -C "$REPO" rev-list --count "$IB..$branch" 2>/dev/null)" && [ -n "$a" ] && ahead="$a"
  fi
  wta="$(coord_wt_abs "$wt")"
  bg="$(coord_bg_signals "$wta" "$sid" "$SNAP")"; bg="$(dash "$bg")"
  ctx="-"
  if [ -n "$sid" ]; then
    c="$(bash "$DIR/ctx-usage.sh" --lane "$L" 2>/dev/null)"
    case "$c" in *" pct="*) ctx="$(printf '%s' "$c" | sed 's/.* pct=\([0-9]*\).*/\1/')" ;; esac
  fi
  hold="$(dash "$hold" | tr ' \t' '__')"
  if [ -n "$JSON" ]; then
    jadd "$(jq -nc --arg lane "$L" --arg name "$name" --arg status "$status" --arg for "$for_m" --arg report "$report" \
      --arg commit "$commit" --arg ahead "$ahead" --arg bg "$bg" --arg ctx "$ctx" --arg hold "$hold" --arg sid "$sid" '
      def n: if . == "-" then null else (tonumber? // .) end; def s: if . == "-" then null else . end;
      {type: "lane", lane: $lane, name: ($name | s), session_id: ($sid | if . == "" then null else . end), status: $status,
       for_min: ($for | n), report: ($report | s), commit: ($commit | s), ahead: ($ahead | n),
       bg: (if $bg == "-" then [] else ($bg | split(",")) end), ctx_pct: ($ctx | n), hold: ($hold | s)}')"
  else
    echo "LANE $L name=$name status=$status for=${for_m}m report=$report commit=$commit ahead=$ahead bg=$bg ctx=${ctx}% hold=$hold"
  fi
done

# ---------- PC ----------
load1="$(coord_load1)"; cpus="$(coord_cpus)"
# load1 을 못 얻으면(Git Bash 등) 0 으로 두지 않고 `-` 로 낸다 — 0 이면 한가한 PC 로 읽혀 측정 창·부하 조절이 오판한다
if [ -n "$load1" ]; then per_core="$(awk -v l="$load1" -v c="$cpus" 'BEGIN { printf "%.2f", (c > 0 ? l / c : 0) }')"; else load1="-"; per_core="-"; fi
heavy="-/-/-"
if [ -n "$HEAVY_ON" ]; then
  pcl="$(printf '%s\n' "$SNAP" | awk -F'\t' '$1 == "PC" { print $3 "/" $4 "/" $2; exit }')"
  [ -n "$pcl" ] && heavy="$pcl"
fi
swap="-"
if su="$(sysctl -n vm.swapusage 2>/dev/null)" && [ -n "$su" ]; then
  swap="$(printf '%s' "$su" | sed -n 's/.*used = *\([0-9.]*\)\([MG]\).*/\1 \2/p' | awk '{ printf "%d", ($2 == "G" ? $1 * 1024 : $1) }')"
elif [ -r /proc/meminfo ]; then
  swap="$(awk '/^SwapTotal:/ { t = $2 } /^SwapFree:/ { f = $2 } END { if (t != "") printf "%d", (t - f) / 1024 }' /proc/meminfo)"
fi
swap="$(dash "$swap")"
ub="$(bash "$DIR/usage-band.sh" 2>/dev/null)"
band="$(printf '%s' "$ub" | awk '{ print $2 }')"; band="${band:-UNKNOWN}"
five="$(printf '%s' "$ub" | sed -n 's/.* five=\([^ ]*\).*/\1/p')"; five="$(dash "$five")"
week="$(printf '%s' "$ub" | sed -n 's/.* week=\([^ ]*\).*/\1/p')"; week="$(dash "$week")"
if [ -n "$JSON" ]; then
  jadd "$(jq -nc --arg l "$load1" --arg c "$cpus" --arg p "$per_core" --arg h "$heavy" --arg s "$swap" --arg f "$five" --arg w "$week" --arg b "$band" '
    def n: if . == "-" then null else (tonumber? // .) end;
    ($h | split("/")) as $hv |
    {type: "pc", load1: ($l | n), cpus: ($c | n), per_core: ($p | n),
     heavy: {held: ($hv[0] | n), waiting: ($hv[1] | n), slots: ($hv[2] | n)}, swap_mb: ($s | n), five: ($f | n), week: ($w | n), band: $b}')"
else
  echo "PC load1=$load1 cpus=$cpus per_core=$per_core heavy=$heavy swap_mb=$swap five=$five week=$week band=$band"
fi

# ---------- UNLINKED ----------
wts="$(coord_git -C "$REPO" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p')"
[ -n "$wts" ] || wts="$REPO"
known="$(jq -r '[.run.coordinator, (.lanes[] | .session)] | map(select(. != null) | (.session_id // ""), ((.pid // 0) | tostring))
                | map(select(. != "" and . != "0")) | .[]' "$SF")"
sdir="$(coord_expand "$(coord_cfg .sessions_dir)")"
# Git Bash: 워크트리 목록은 한 번만 같은 꼴(/c/x)로 맞춘다(세션마다 서브셸을 띄우지 않게). macOS 는 그대로.
if [ "$COMPAT_WIN" = 1 ]; then
  wts_n=""; while IFS= read -r w; do [ -n "$w" ] && wts_n="$wts_n$(compat_norm_path "${w%/}")"$'\n'; done <<WTS_EOF
$wts
WTS_EOF
  wts="$wts_n"
fi
for f in "$sdir"/*.json; do
  [ -f "$f" ] || continue
  row="$(jq -r 'select(.kind == "interactive") | [(.pid // 0 | tostring), (.sessionId // ""), (.cwd // ""), (.name // "")] | join("\u001f")' "$f" 2>/dev/null)"
  [ -n "$row" ] || continue
  IFS=$'\037' read -r upid usid ucwd uname <<EOF
$row
EOF
  coord_pid_alive "$upid" || continue
  inrepo=""; ucwd_n="${ucwd%/}"
  [ "$COMPAT_WIN" != 1 ] || ucwd_n="$(compat_norm_path "$ucwd_n")"   # Git Bash: C:/x · C:\x · /c/x 를 같은 꼴로
  while IFS= read -r w; do
    [ -n "$w" ] || continue
    w="${w%/}"
    case "$ucwd_n/" in "$w/"*) inrepo=1; break ;; esac
  done <<EOF
$wts
EOF
  [ -n "$inrepo" ] || continue
  if printf '%s\n' "$known" | grep -qxF -e "$upid" -e "${usid:-@none@}"; then continue; fi
  uname="$(dash "$uname" | tr ' \t' '__')"
  if [ -n "$JSON" ]; then
    jadd "$(jq -nc --arg n "$uname" --arg p "$upid" --arg c "$ucwd" --arg s "$usid" '{type: "unlinked", name: $n, pid: ($p | tonumber), session_id: $s, cwd: $c}')"
  else
    echo "UNLINKED $uname pid=$upid cwd=$ucwd"
  fi
done

# ---------- WINDOW ----------
while IFS=$'\037' read -r wk wl wu; do
  [ -n "$wk" ] || continue
  if [ -n "$JSON" ]; then
    jadd "$(jq -nc --arg k "$wk" --arg l "$wl" --arg u "$wu" '{type: "window", kind: $k, lane: (if $l == "-" then null else $l end), until: (if $u == "-" then null else $u end)}')"
  else
    echo "WINDOW $wk lane=$wl until=$wu"
  fi
done <<EOF
$(jq -r '.windows[]? | [(.kind // "-"), (.lane // "-"), (.until // "-")] | map(tostring) | join("\u001f")' "$SF")
EOF

[ -n "$JSON" ] && printf '%s' "$JOUT" | jq -s .
exit 0
