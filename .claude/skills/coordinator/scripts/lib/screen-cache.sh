# 레인 화면 캐시(읽기 중복 제거). 정본: ../../references/contract.md §3.3 prompt-watch 항·§4.1 폴러.
# 쓰는 쪽은 콘솔 폴러(console-poll.sh) 하나, 읽는 쪽은 prompt-watch.sh(「창이 떴는가」 감지·Monitor 알림)뿐이다.
# 자동 응답 직전 재판정(auto-answer.sh·term-send-safe.sh·폴러 키 행)은 이 캐시를 절대 읽지 않는다(늘 직접 읽는다).
# common.sh 를 먼저 source 해야 한다.
#   위치: $DFLOW_CONSOLE_DIR/screen/(기본 ~/.dflow/console/screen, 폴더 700·파일 600)
#   파일: <키>.txt = 읽은 화면 원문(가리기 전, 로컬에만 둔다 — 서버·로그·stderr 로 내지 않는다)
#         <키>.json = {"kind":"permission|choice|question|usage-limit|trust|null","read_at_ms":<ms>,"lines":<n>,"full":"<창 지문>"}
#   키: 터미널 handle([A-Za-z0-9._:-], 앞 `.` 불가·100자 이하). `:` 는 `=` 로 바꾼다(handle 에 `=` 가 없어 충돌하지 않는다).
#   쓰기: .txt 를 먼저 .json 을 나중에 임시 파일 → mv -f 로 교체한다(json 이 새로우면 txt 도 새롭다).
#   읽기: 폴더·파일이 현재 사용자 소유·권한 700/600·심볼릭 링크 아님일 때만 믿는다. 어긋나면 직접 읽기로 물러난다.

sc_dir() { printf '%s/screen' "$(coord_expand "${DFLOW_CONSOLE_DIR:-$HOME/.dflow/console}")"; }

# 캐시를 믿는 시간(초). 0 이면 캐시 끔. 숫자가 아니면 20.
sc_ttl() {
  local t; t="$(coord_cfg .approvals.screen_cache_s 2>/dev/null)"
  case "$t" in ''|*[!0-9]*) t=20 ;; esac
  printf '%s' "$t"
}

# handle → 파일 이름 키. 허용 글자 밖·앞 `.`·너무 긴 handle 은 거절(경로 이탈 불가).
sc_key() {
  case "${1:-}" in ''|.*|*[!A-Za-z0-9._:-]*) return 1 ;; esac
  [ "${#1}" -le 100 ] || return 1
  printf '%s' "${1//:/=}"
}

# 지금 에포크 밀리초(정수·개행 없음). bash 5 $EPOCHREALTIME(프로세스 0개) → date +%s.%N(한 프로세스) → node → 초×1000.
# 앞 셋은 결과가 `숫자(.|,)숫자` 꼴일 때만 쓴다.
sc_now_ms() {
  local t s f
  t="${EPOCHREALTIME:-}"
  if [[ "$t" =~ ^([0-9]+)[.,]([0-9]+)$ ]]; then
    s="${BASH_REMATCH[1]}"; f="${BASH_REMATCH[2]}000"; printf '%d' $(( 10#$s * 1000 + 10#${f:0:3} )); return 0
  fi
  t="$(date +%s.%N 2>/dev/null)"
  if [[ "$t" =~ ^([0-9]+)\.([0-9]{9})$ ]]; then
    s="${BASH_REMATCH[1]}"; f="${BASH_REMATCH[2]}"; printf '%d' $(( 10#$s * 1000 + 10#${f:0:3} )); return 0
  fi
  if command -v node >/dev/null 2>&1; then
    t="$(node -e 'process.stdout.write(String(Date.now()))' 2>/dev/null)"
    case "$t" in ''|*[!0-9]*) ;; *) printf '%s' "$t"; return 0 ;; esac
  fi
  printf '%s000' "$(date +%s)"
}

# 파일의 `<소유 uid> <권한> <mtime> <크기>`
sc_stat() {
  local o
  o="$(stat -f '%u %Lp %m %z' "$1" 2>/dev/null)"
  case "$o" in *[!0-9\ ]*|'') o="$(stat -c '%u %a %Y %s' "$1" 2>/dev/null)" ;; esac
  case "$o" in *[!0-9\ ]*|'') return 1 ;; esac
  printf '%s' "$o"
}

# ---- 쓰는 쪽(폴러) --------------------------------------------------------------------------
# sc_drop <handle> — 그 handle 의 캐시와 임시 파일을 지운다(읽기 실패·터미널 없음).
sc_drop() {
  local key d; key="$(sc_key "$1")" || return 0
  d="$(sc_dir)"
  rm -f "$d/$key.txt" "$d/$key.json" 2>/dev/null
  return 0
}

# sc_clear — 캐시 폴더의 파일(캐시·임시 파일)을 모두 지운다. 폴더가 심볼릭 링크면 건드리지 않는다. 폴러가 끝날 때 부른다
#   (화면 원문이 로컬에 남지 않게. prompt-watch 는 캐시가 없으면 조용히 직접 읽는다).
sc_clear() {
  local d; d="$(sc_dir)"
  [ -d "$d" ] && [ ! -L "$d" ] || return 0
  find "$d" -maxdepth 1 -type f -delete 2>/dev/null
  return 0
}

# sc_store <handle> <화면 파일> <읽은 시각 ms> [창 지문] — 화면 원문과 판정을 남긴다. 실패하면 낡은 캐시를 지우고 rc 1.
#   이번에 남긴 판정(창 종류, 없으면 빈 값)을 SC_STORED_KIND 에 둔다(호출자가 같은 화면을 다시 판정하지 않게).
SC_STORED_KIND=""
sc_store() {
  local h="$1" scr="$2" at="$3" full="${4:-}" key d t1 t2 kind lines
  SC_STORED_KIND=""
  key="$(sc_key "$h")" || return 1
  case "$at" in ''|*[!0-9]*) at="$(sc_now_ms)" ;; esac
  d="$(sc_dir)"
  ( umask 077; mkdir -p "$d" ) 2>/dev/null
  if [ ! -d "$d" ] || [ -L "$d" ]; then return 1; fi
  chmod 700 "$d" 2>/dev/null
  t1="$d/.$key.txt.$$"; t2="$d/.$key.json.$$"
  kind="$(coord_screen_prompt_kind < "$scr")"
  lines="$(awk 'END { print NR }' "$scr")"
  if ( umask 077; cp "$scr" "$t1" ) 2>/dev/null && chmod 600 "$t1" 2>/dev/null \
     && ( umask 077; jq -nc --arg k "$kind" --argjson a "$at" --argjson l "${lines:-0}" --arg f "$full" \
          '{kind:(if $k == "" then null else $k end), read_at_ms:$a, lines:$l} + (if $f == "" then {} else {full:$f} end)' > "$t2" ) 2>/dev/null \
     && chmod 600 "$t2" 2>/dev/null \
     && mv -f "$t1" "$d/$key.txt" 2>/dev/null && mv -f "$t2" "$d/$key.json" 2>/dev/null; then
    SC_STORED_KIND="$kind"
    return 0
  fi
  rm -f "$t1" "$t2" "$d/$key.txt" "$d/$key.json" 2>/dev/null
  return 1
}

# sc_prune [분] — 오래된(기본 10분) 캐시·임시 파일을 지운다. 대상에서 빠진 handle·끝난 회차의 것이 여기서 사라진다.
sc_prune() {
  local d m="${1:-10}"; d="$(sc_dir)"
  [ -d "$d" ] && [ ! -L "$d" ] || return 0
  find "$d" -maxdepth 1 -type f -mmin "+$m" -delete 2>/dev/null
  return 0
}

# ---- 읽는 쪽(prompt-watch) ------------------------------------------------------------------
# 폴더·파일이 믿을 만한가: 심볼릭 링크 아님·현재 사용자 소유·폴더 700·파일 600.
_sc_trusted() {  # <파일> — 0 믿음
  local d me st; d="$(sc_dir)"; me="$(id -u)"
  [ -d "$d" ] && [ ! -L "$d" ] && [ ! -L "$1" ] && [ -f "$1" ] || return 1
  st="$(sc_stat "$d")" || return 1
  [ "${st%% *}" = "$me" ] || return 1
  st="${st#* }"; [ "${st%% *}" = 700 ] || return 1
  st="$(sc_stat "$1")" || return 1
  [ "${st%% *}" = "$me" ] || return 1
  st="${st#* }"; [ "${st%% *}" = 600 ]
}

# sc_sig <handle> — 믿을 수 있는 json 의 내용 자체(읽은 시각 read_at_ms 가 들어 있어 폴러가 다시 쓸 때마다 바뀐다 — mtime 은 1초 단위라 쓰지 않는다).
#   바뀜 감지용이라 파싱하지 않는다. 믿을 수 없거나 4KB 를 넘으면 rc 1.
sc_sig() {
  local key f st c
  key="$(sc_key "$1")" || return 1
  f="$(sc_dir)/$key.json"
  _sc_trusted "$f" || return 1
  st="$(sc_stat "$f")" || return 1
  [ "${st##* }" -le 4096 ] || return 1
  c="$(< "$f")" 2>/dev/null || return 1
  [ -n "$c" ] || return 1
  printf '%s' "$c"
}

# sc_load <handle> — 신선하고 믿을 수 있는 캐시면 rc 0, SC_SCREEN(마지막 40줄)·SC_KIND·SC_AT(읽은 시각 ms)·SC_FULL(창 지문, 없으면 빈 값)을 채운다.
#   없음·낡음·깨짐·소유/권한 이상·설정 0 이면 rc 1 이고 아무 출력도 하지 않는다(호출자가 조용히 직접 읽는다).
SC_SCREEN=""; SC_KIND=""; SC_AT=""; SC_FULL=""
sc_load() {
  local key d jf tf ttl now at jk jl jf2 txtn kind
  SC_SCREEN=""; SC_KIND=""; SC_AT=""; SC_FULL=""
  ttl="${SC_TTL:-}"; [ -n "$ttl" ] || ttl="$(sc_ttl)"   # 호출자가 SC_TTL 에 한 번 읽어 둔 값을 쓴다(루프마다 설정을 다시 읽지 않게)
  [ "$ttl" -gt 0 ] || return 1
  key="$(sc_key "$1")" || return 1
  d="$(sc_dir)"; jf="$d/$key.json"; tf="$d/$key.txt"
  _sc_trusted "$jf" && _sc_trusted "$tf" || return 1
  { read -r at jl jk jf2; } < <(jq -r '[(.read_at_ms | if type == "number" then floor else "x" end), (.lines | if type == "number" then floor else "x" end), (.kind // "null" | tostring), (.full // "" | if type == "string" and test("^[0-9a-f]{64}$") then . else "" end)] | @tsv' "$jf" 2>/dev/null) || return 1
  case "$at" in ''|*[!0-9]*) return 1 ;; esac
  case "$jl" in ''|*[!0-9]*) return 1 ;; esac
  case "$jk" in null|permission|choice|question|usage-limit|trust) ;; *) return 1 ;; esac
  now="$(sc_now_ms)"
  # 낡았거나(ttl 초 초과) 미래 값(시계 어긋남·위조)이면 믿지 않는다. 2초까지의 어긋남은 허용.
  [ "$at" -le $((now + 2000)) ] && [ $((now - at)) -le $((ttl * 1000)) ] || return 1
  [ "$(wc -c < "$tf" 2>/dev/null | tr -d ' ')" -le 1048576 ] || return 1
  txtn="$(awk 'END { print NR }' "$tf")"
  [ "$txtn" = "$jl" ] || return 1                # json·txt 가 같은 읽기의 것인지(반쯤 바뀐 쌍 거르기)
  SC_SCREEN="$(tail -n 40 "$tf")"
  kind="$(printf '%s\n' "$SC_SCREEN" | coord_screen_prompt_kind)"
  [ "${kind:-null}" = "$jk" ] || { SC_SCREEN=""; return 1; }   # 판정이 화면과 다르면(찢어진 쌍·손댄 파일) 믿지 않는다
  SC_KIND="$kind"; SC_AT="$at"; SC_FULL="$jf2"   # 창 지문은 json 의 값 그대로(없거나 모양이 틀리면 빈 값 — 호출자는 kind 로만 비교)
  return 0
}
