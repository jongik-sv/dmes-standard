# scripts/lib/modules.sh — modules.conf(모듈·포트 카탈로그) 를 읽는다 (source 전용)
#
# 채우는 값:
#   BE_ALL_MODULES  platforms 에 sh 가 있는 be 모듈 이름 (파일 순서 = --all 기동 순서)
#   PORTAL_PORT     프론트 포털 dev 포트
# 함수: be_module_port <모듈> (모르면 빈 값), be_module_color <모듈> (log.sh 의 dev_log_tag_color 가 부른다)
# 같은 파일을 ps1 쪽은 scripts/lib/modules.ps1 이 읽는다 — 값은 modules.conf 한 곳에서만 고친다.
# macOS 기본 /bin/bash 3.2 에서 돌아야 하므로 연관 배열·mapfile 을 쓰지 않고 같은 순서의 배열 셋을 둔다.

DMES_MODULES_CONF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/modules.conf"

BE_ALL_MODULES=()
BE_MODULE_PORTS=()
BE_MODULE_COLORS=()
PORTAL_PORT=""

if [ ! -f "$DMES_MODULES_CONF" ]; then
  printf '[error] 모듈 카탈로그가 없습니다: %s\n' "$DMES_MODULES_CONF" >&2
  exit 1
fi

while read -r _mc_kind _mc_name _mc_port _mc_color _mc_platforms _mc_rest || [ -n "${_mc_kind:-}" ]; do
  # Windows 체크아웃(CRLF)에서도 읽히게 줄 끝 \r 을 떼어 낸다.
  _mc_kind="${_mc_kind%$'\r'}"
  _mc_name="${_mc_name%$'\r'}"
  _mc_port="${_mc_port%$'\r'}"
  _mc_color="${_mc_color%$'\r'}"
  _mc_platforms="${_mc_platforms%$'\r'}"
  case "$_mc_kind" in
    ''|'#'*) continue ;;
  esac
  case ",$_mc_platforms," in
    *,sh,*) ;;
    *) continue ;;
  esac
  [ "$_mc_color" = "-" ] && _mc_color=""
  case "$_mc_kind" in
    be)
      BE_ALL_MODULES+=("$_mc_name")
      BE_MODULE_PORTS+=("$_mc_port")
      BE_MODULE_COLORS+=("$_mc_color")
      ;;
    portal) PORTAL_PORT="$_mc_port" ;;
  esac
done < "$DMES_MODULES_CONF"
unset _mc_kind _mc_name _mc_port _mc_color _mc_platforms _mc_rest

# 모듈의 배열 위치. 없으면 1.
_be_module_index() {
  local i=0
  while [ "$i" -lt "${#BE_ALL_MODULES[@]}" ]; do
    if [ "${BE_ALL_MODULES[$i]}" = "$1" ]; then
      printf '%s' "$i"
      return 0
    fi
    i=$((i + 1))
  done
  return 1
}

be_module_port() {
  local i
  i="$(_be_module_index "$1")" || { printf ''; return 0; }
  printf '%s' "${BE_MODULE_PORTS[$i]}"
}

be_module_color() {
  local i
  i="$(_be_module_index "$1")" || { printf ''; return 0; }
  printf '%s' "${BE_MODULE_COLORS[$i]}"
}
