#!/usr/bin/env bash
# 사용법: glm-preflight.sh
#   GLM 세션을 띄우기 전 사전 확인(설계 §3.e 「GLM 기동 절차」 1~3단계).
#   1) zsh -ic 'alias <launch.glm>' 로 alias 를 읽는다  2) ANTHROPIC_BASE_URL 호스트가 api.z.ai 인지
#   3) 그 값으로 POST <base>/v1/messages(max_tokens 1, 제한 glm.timeout_s 초) → HTTP 200 이고 응답 model 에 glm 이 있는지.
#   stdout: `ok <host> <model> <초>` 또는 `fail <alias|host|call|model> <사유>`. 결과는 회차가 있으면 state `.glm` 에 남긴다.
#   비밀값(토큰)은 어떤 출력·임시 파일 이름·이벤트에도 남기지 않는다. 헤더는 chmod 600 임시 파일로 curl 에 넘긴다.
#   이 파일에 set -x 를 넣지 않는다.
set -uo pipefail
. "$(dirname "$0")/lib/common.sh"

tmpdir=""
cleanup() { [ -n "$tmpdir" ] && rm -rf "$tmpdir"; }
trap cleanup EXIT INT TERM

record() {  # record <ok|fail> <detail>
  local st="$1" detail="$2" json
  json="$(jq -cn --arg s "$st" --arg at "$(coord_now_iso)" --arg d "$detail" '{status:$s, at:$at, detail:$d}')"
  coord_state_call set '.glm' "$json"
  coord_state_call event glm-preflight - "$json"
}
fail() { echo "fail $1 $2"; record fail "$1 $2"; exit 0; }

name="$(coord_cfg .launch.glm)"; name="${name:-glm}"
case "$name" in *[!A-Za-z0-9_.-]*) fail alias "launch.glm 이 alias 이름 꼴이 아니다" ;; esac
command -v zsh >/dev/null 2>&1 || fail alias "zsh 없음"
command -v curl >/dev/null 2>&1 || fail call "curl 없음"

raw="$(zsh -ic "alias $name" 2>/dev/null)"
[ -n "$raw" ] || fail alias "alias $name 없음"
# zsh 출력 꼴: name='…' (안쪽 작은따옴표는 '\'' 로 이스케이프)
body="${raw#*=}"
case "$body" in "'"*"'") body="${body#\'}"; body="${body%\'}" ;; esac
q="'\\''" sq="'"
body="${body//"$q"/$sq}"

# getv <변수 이름>: alias 안의 VAR="x" | VAR='x' | VAR=x 값(비밀값이므로 변수에만 담는다)
getv() {
  local re1="(^|[[:space:];&])$1=\"([^\"]*)\"" re2="(^|[[:space:];&])$1='([^']*)'" re3="(^|[[:space:];&])$1=([^[:space:];&\"']*)"
  if [[ $body =~ $re1 ]] || [[ $body =~ $re2 ]] || [[ $body =~ $re3 ]]; then printf '%s' "${BASH_REMATCH[2]}"; fi
}
base="$(getv ANTHROPIC_BASE_URL)"
model="$(getv ANTHROPIC_DEFAULT_HAIKU_MODEL)"
tokvar=ANTHROPIC_AUTH_TOKEN
tok="$(getv ANTHROPIC_AUTH_TOKEN)"
[ -n "$tok" ] || { tok="$(getv ANTHROPIC_API_KEY)"; tokvar=ANTHROPIC_API_KEY; }
unset raw body
[ -n "$base" ] || fail alias "ANTHROPIC_BASE_URL 없음"
[ -n "$tok" ] || fail alias "ANTHROPIC_AUTH_TOKEN·ANTHROPIC_API_KEY 없음"
[ -n "$model" ] || fail alias "ANTHROPIC_DEFAULT_HAIKU_MODEL 없음"

host="${base#*://}"; host="${host%%/*}"; host="${host%%:*}"
[ "$host" = "api.z.ai" ] || fail host "$host"

tmpdir="$(umask 077; mktemp -d "${TMPDIR:-/tmp}/coord-glm.XXXXXX")" || fail call "임시 폴더 실패"
hdr="$tmpdir/h"; out="$tmpdir/o"
( umask 077
  printf 'x-api-key: %s\n' "$tok"
  printf 'authorization: Bearer %s\n' "$tok"
  printf 'anthropic-version: 2023-06-01\n'
  printf 'content-type: application/json\n' ) > "$hdr"
chmod 600 "$hdr"
unset tok
data="$(jq -cn --arg m "$model" '{model:$m, max_tokens:1, messages:[{role:"user", content:"ok"}]}')"
timeout_s="$(coord_cfg .glm.timeout_s)"; timeout_s="${timeout_s:-10}"

wout="$(curl -sS -m "$timeout_s" -o "$out" -w '%{http_code} %{time_total}' -H "@$hdr" -X POST \
  --data "$data" "${base%/}/v1/messages" 2>/dev/null)"; crc=$?
rm -f "$hdr"
code="${wout%% *}"; secs="${wout##* }"
if [ "$crc" -ne 0 ]; then
  case "$crc" in 28) fail call "timeout ${timeout_s}s" ;; 6) fail call "dns" ;; 7) fail call "connect" ;; *) fail call "curl-rc=$crc" ;; esac
fi
[ "$code" = 200 ] || fail call "http=$code"
rmodel="$(jq -r '.model // empty' "$out" 2>/dev/null)"
case "$(printf '%s' "$rmodel" | tr '[:upper:]' '[:lower:]')" in
  *glm*) ;;
  *) fail model "${rmodel:-none}" ;;
esac
secs="$(LC_ALL=C printf '%.1f' "${secs:-0}" 2>/dev/null || echo "$secs")"
echo "ok $host $rmodel $secs"
coord_log "(토큰 변수: $tokvar, 요청 모델: $model)"
record ok "$host $rmodel ${secs}s"
exit 0
