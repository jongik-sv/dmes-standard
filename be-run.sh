#!/usr/bin/env bash
# be-run.sh — 백엔드 모듈(local 프로파일) 실행 스크립트
#
# 실행 대상 모듈과 포트:
#   mls 8092 · mqc 8093 · mpp 8094 · mpn 8095 · mdm 8096 · mcm 8100 · analog 8191
#   (mcm 이 포털 호스트 — FE 는 mcm 8100 을 본다)
#
# 사용법:
#   ./be-run.sh              # .run.env 의 BE_RUN_ARGS 사용 (기본 --all)
#   ./be-run.sh --all        # 전체 모듈
#   ./be-run.sh --mcm        # mcm 만
#   ./be-run.sh --mcm --mpn  # 여러 모듈 조합
#   ./be-run.sh --all --dry-run  # 아무것도 끄거나 띄우지 않고, 실행할 명령만 출력
#   ./be-run.sh --dry-run        # 모듈 플래그가 없으면 BE_RUN_ARGS(없으면 --all) 대상으로
#
#   ./be-run.sh --mcm --build-only  # 빌드(classpath 산출)만 하고 기동하지 않는다. 포트·이전 실행은 건드리지 않는다
#   ./be-run.sh --mdm --pdb=L_ORA_MDM  # Oracle PDB 접속값(DMES_ORA_PDB·DMES_ORA_URL)을 앱에 넘긴다(BE_ORA_PDB 도 같다). 없으면 종전 그대로
#
# 모듈 플래그: --mpn --mcm --mls --mqc --mpp --mdm --analog
# --all 은 7개 JVM 을 동시에 띄운다. 메모리가 빠듯하면 필요한 모듈만 골라 쓴다.
# 옵션(--dry-run·--keep-port·--build-only)만 주고 모듈 플래그가 없으면 BE_RUN_ARGS(없으면 --all)의 모듈을 쓴다.
#
# 기동 방식: Gradle 로 빌드만 하고(모듈이 2개 이상이면 src/backend 루트 composite 에서 한 번, 1개면 그 모듈 폴더에서),
#   앱은 java 로 직접 띄운다. bootRun 은 모듈마다 Gradle 데몬을 붙들어(데몬 1개 약 0.6GB) 서버가 도는 내내 메모리를 썼다.
#   빌드는 --no-daemon 이라 끝나면 Gradle 프로세스가 남지 않는다. main class·classpath 는 scripts/lib/be-run-classpath.init.gradle
#   이 <모듈>/api/build/be-run/classpath.txt 에 쓴다(bootRun 과 같은 값). 앱 작업 디렉터리는 bootRun 때처럼 src/backend/<모듈>.
#   BE_GRADLE_DAEMON=1   빌드에 Gradle 데몬을 쓴다(재기동이 몇 초 빨라지지만 데몬이 10분 남는다)
#   BE_GRADLE_RUN=1      종전처럼 모듈별 gradlew :api:bootRun 으로 띄운다(되돌리기용. 아래 BE_PREBUILD* 는 이때의 선빌드 설정)
#   BE_PREBUILD=0        빌드를 건너뛰고 직전 빌드가 남긴 classpath.txt 로 바로 띄운다(코드를 고쳤다면 최신이 아니다)
#   BE_PREBUILD_CONTINUE=1  빌드가 실패해도 classpath.txt 가 만들어진 모듈은 띄운다 (모듈 하나의 오류가 나머지를 막지 않게)
# 빌드가 실패하면 아무 모듈도 띄우지 않고 exit 1 로 끝난다.
#
# 앱 JVM 옵션(메모리 절약 기본값. 종전 서버 1개의 점유는 힙 밖 포함 383~472MB 였다):
#   기본 -XX:TieredStopAtLevel=1 -Xmx768m -XX:+UseSerialGC -Xss512k -XX:ReservedCodeCacheSize=40m
#        -Dfile.encoding=UTF-8 -Duser.country=KR -Duser.language=ko -Duser.variant -Duser.timezone=Asia/Seoul -Dbe.run.module=<모듈>
#   BE_JAVA_XMX(768m)·BE_JAVA_XSS(512k)·BE_JAVA_CODECACHE(40m)  기본값만 바꾼다
#   BE_JAVA_OPTS="-Xmx1g"        모든 모듈에 덧붙인다(뒤에 오는 옵션이 이긴다 — 위 기본값도 덮는다)
#   BE_JAVA_OPTS_MDM="-Xmx1g"    모듈 하나에만 덧붙인다(BE_JAVA_OPTS_<모듈 대문자>)
#   엑셀 내보내기처럼 큰 요청이 OOM 이면 그 모듈의 -Xmx 를 올린다. 실측 힙은 모듈당 66~141MB 였다.
#   KURE 임베딩 인코더를 다시 켜면(application-local.yml.kure-on) mdm 은 힙 밖(ONNX 네이티브)이 약 1GB 더 든다.
#   -Xmx 로는 막을 수 없으니 그만큼 메모리 여유가 있을 때만 켠다.
#
# 대상 포트를 이미 물고 있는 프로세스가 있으면 정리하고 시작한다.
#   ./be-run.sh --keep-port  # 회수하지 않고 "점유 중" 으로 중단 (종전 동작)
#
# 종료: Ctrl+C 로 이 실행이 띄운 것(앱 JVM·빌드 프로세스)만 정리한다.
#   Gradle 데몬은 멈추지 않는다(gradlew --stop 은 같은 버전의 모든 데몬을 멈춰 다른 워크트리 빌드를 깬다).
#   기본 방식은 데몬을 새로 남기지 않는다. 다른 곳에서 쉬는 데몬은 org.gradle.daemon.idletimeout(10분)으로 스스로 내려간다.
# ── 머리말 끝 (--help 는 여기까지 출력) ──

set -u
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/src/backend"
RUN_ENV_FILE="$ROOT_DIR/.run.env"

[ -f "$RUN_ENV_FILE" ] && . "$RUN_ENV_FILE"

# ── 공용 함수 ────────────────────────────────────────────────
# 로그(dev_log_*)·프로세스(terminate_pid_tree·wait_for_exit)·인자(load_default_args) 함수는
# fe-run.sh·local-run.sh 와 함께 scripts/lib/ 에 둔다. 경로는 현재 디렉터리가 아니라 이 스크립트 위치 기준이다.
# log.sh 는 .run.env 를 읽은 뒤에 source 한다(DEV_LOG_COLOR 를 .run.env 에 둘 수 있다).
SCRIPT_LIB_DIR="$ROOT_DIR/scripts/lib"
if [ ! -f "$SCRIPT_LIB_DIR/log.sh" ]; then
  printf '[error] scripts/lib 없음: %s (스크립트 파일 심볼릭 링크로 부르면 저장소 위치를 못 찾는다)\n' "$SCRIPT_LIB_DIR" >&2
  exit 1
fi
. "$SCRIPT_LIB_DIR/log.sh"
. "$SCRIPT_LIB_DIR/proc.sh"
. "$SCRIPT_LIB_DIR/args.sh"
. "$SCRIPT_LIB_DIR/modules.sh"

# 인자가 없거나 옵션(--dry-run·--keep-port·--build-only)뿐인지. 그러면 모듈 대상은 기본값(BE_RUN_ARGS, 없으면 --all)에서
# 가져온다. 모듈 플래그·--help·모르는 인자가 하나라도 있으면 기본값을 붙이지 않는다.
be_args_options_only() {
  local a
  for a in "$@"; do
    case "$a" in
      --dry-run|--keep-port|--build-only|--pdb=*) ;;
      *) return 1 ;;
    esac
  done
  return 0
}

if be_args_options_only "$@"; then
  if load_default_args BE_RUN_ARGS; then
    set -- "$@" "${ENV_ARGS[@]}"
    dev_log_print "be" ".run.env 기본 옵션 사용: BE_RUN_ARGS=${BE_RUN_ARGS}"
  else
    # .run.env 는 개인 설정이라 git 에 없다(.gitignore). 새로 clone 한 저장소에서도
    # 인자 없이 바로 뜨도록 --all 로 폴백한다. 값을 바꾸려면 .run.env.example 을
    # .run.env 로 복사해 편집한다.
    set -- "$@" --all
    dev_log_print "be" ".run.env 없음 — 기본값 --all 로 진행 (.run.env.example 복사해 조정)"
  fi
fi

# ── 모듈 카탈로그 ────────────────────────────────────────────
# 실행 가능한 Spring Boot 모듈·포트·로그 색은 scripts/lib/modules.conf 한 곳에 있다(ps1 도 같은 파일을 읽는다).
# modules.sh 가 BE_ALL_MODULES(--all 순서)·be_module_port·be_module_color 를 채운다. 신규 모듈은 modules.conf 에
# 한 줄 더하면 --<모듈> 플래그까지 따라온다. 이 파일 머리말과 아래 "실행 대상을 선택하세요" 안내문은 사람이 읽는
# 글이라 따로 고친다.

# 모듈 전용 wrapper 가 있으면 그것을, 없으면 src/backend 공용 wrapper 를 쓴다.
# (표준 템플릿은 wrapper 를 src/backend 한 벌만 두고 모듈별 중복 사본을 두지 않는다.)
be_module_gradlew() {
  if [ -f "$BACKEND_DIR/$1/gradlew" ]; then
    printf './gradlew'
  else
    printf '%s' "$BACKEND_DIR/gradlew"
  fi
}

# 모듈별 기동 인자. 로컬 MDM 데이터는 기동 때 넣지 않는다 — db-snapshot CSV 를 레인 PDB 에 한 번 넣는다
# (python3 scripts/db-snapshot/snapshot.py import --pdb <PDB> MDMAPUSER, 또는 pdb.mjs template-data 템플릿에서 복제).
be_module_boot_args() {
  local args='--spring.profiles.active=local'
  printf '%s' "$args"
}

# BE_GRADLE_RUN=1 이면 종전처럼 모듈별 gradlew :api:bootRun 으로 띄운다(되돌리기용).
be_legacy_mode() {
  [ "${BE_GRADLE_RUN:-0}" = "1" ]
}

# 앱을 java 로 직접 띄우는 데 필요한 정보(1행 main class, 2행 classpath)를 빌드가 남기는 곳.
BE_CLASSPATH_INIT="$SCRIPT_LIB_DIR/be-run-classpath.init.gradle"
be_module_classpath_file() {
  printf '%s/%s/api/build/be-run/classpath.txt' "$BACKEND_DIR" "$1"
}

# 모듈 $1 의 java 를 고른다. 빌드가 남긴 classpath.txt 3행(bootRun 이 쓰던 java launcher 경로)이 있으면 그것,
# 없으면(빌드 전 드라이런 등) JAVA_HOME 이 있으면 그것, 없으면 PATH 의 java.
be_java_bin() {
  local launcher=""
  local file
  file="$(be_module_classpath_file "$1")"
  [ -s "$file" ] && launcher="$(sed -n 3p "$file")"
  if [ -n "$launcher" ] && [ -x "$launcher" ]; then
    printf '%s' "$launcher"
  elif [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    printf '%s' "$JAVA_HOME/bin/java"
  else
    printf 'java'
  fi
}

# 모듈 $1 의 앱 JVM 옵션을 BE_JVM_ARGS 배열에 채운다. 종전 bootRun 이 붙이던 옵션(TieredStopAtLevel·file.encoding·user.*)은
# 그대로 두고, 메모리 상한·GC·스택·코드 캐시를 줄인다. 환경 변수로 얹은 옵션은 뒤에 와서 앞의 기본값을 덮는다.
# 코드 캐시는 TieredStopAtLevel=1 에서 기본 48MB 이고 실측 사용 최대 약 27MB 라 40MB 로 둔다(예약만 줄어 효과는 작다).
be_module_jvm_args() {
  local m="$1" upper var opt file
  upper="$(printf '%s' "$m" | tr '[:lower:]' '[:upper:]')"
  var="BE_JAVA_OPTS_$upper"
  BE_JVM_ARGS=(
    -XX:TieredStopAtLevel=1
    "-Xmx${BE_JAVA_XMX:-768m}"
    -XX:+UseSerialGC
    "-Xss${BE_JAVA_XSS:-512k}"
    "-XX:ReservedCodeCacheSize=${BE_JAVA_CODECACHE:-40m}"
    -Dfile.encoding=UTF-8
    -Duser.country=KR
    -Duser.language=ko
    -Duser.variant
    -Duser.timezone=Asia/Seoul
    "-Dbe.run.module=$m"
  )
  # 모듈 build.gradle 의 bootRun.jvmArgs(classpath.txt 4행~, 예: analog 의 stdout 인코딩)는 기본값 뒤·환경 변수 앞에 둔다.
  file="$(be_module_classpath_file "$m")"
  if [ -s "$file" ]; then
    while IFS= read -r opt; do
      [ -n "$opt" ] && BE_JVM_ARGS+=("$opt")
    done < <(sed -n '4,$p' "$file")
  fi
  for opt in ${BE_JAVA_OPTS:-} ${!var:-}; do
    BE_JVM_ARGS+=("$opt")
  done
}

be_selected_contains() {
  local m
  for m in "${SELECTED_MODULES[@]:-}"; do
    [ "$m" = "$1" ] && return 0
  done
  return 1
}

be_select_module() {
  be_selected_contains "$1" || SELECTED_MODULES+=("$1")
}

SELECTED_MODULES=()
KEEP_PORT=0
DRY_RUN=0
BUILD_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --keep-port) KEEP_PORT=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --build-only) BUILD_ONLY=1 ;;
    --pdb=*) BE_ORA_PDB="${arg#--pdb=}" ;;
    --all|--full)
      for m in "${BE_ALL_MODULES[@]}"; do be_select_module "$m"; done ;;
    -h|--help) sed -n '2,/^# ── 머리말 끝/p' "$0" | sed '$d'; exit 0 ;;
    --*)
      # 모듈 플래그(--<모듈>)는 카탈로그에 있는 이름만 받는다.
      if [ -n "$(be_module_port "${arg#--}")" ]; then
        be_select_module "${arg#--}"
      else
        dev_log_error "알 수 없는 옵션: $arg"; exit 2
      fi ;;
    *) dev_log_error "알 수 없는 옵션: $arg"; exit 2 ;;
  esac
done

if [ "${#SELECTED_MODULES[@]}" -eq 0 ]; then
  dev_log_error "BE 실행 대상을 선택하세요: --all 또는 --mpn/--mcm/--mls/--mqc/--mpp/--mdm/--analog"
  exit 2
fi

# ── Oracle PDB 접속값(oracle-1007 b6) ────────────────────────────
# BE_ORA_PDB(또는 --pdb=<PDB>)가 있으면 앱 JVM 이 물려받을 환경 변수로 접속값을 내보낸다. 없으면 아무것도 하지 않아
# 종전 SQLite 동작 그대로다. Oracle 로 컷오버한 모듈의 프로파일이 이 값을 읽는다(docs/oracle-1007/schema-owners.md §3).
#   DMES_ORA_PDB  서비스 이름(PDB)   DMES_ORA_URL  jdbc:oracle:thin:@//host:port/PDB   DMES_ORA_HOST·DMES_ORA_PORT
# PDB 는 scripts/oracle/pdb.mjs 로 만든다(예: node scripts/oracle/pdb.mjs clone TPL_DATA L_<레인>).
if [ -n "${BE_ORA_PDB:-}" ]; then
  DMES_ORA_PDB="$(printf '%s' "$BE_ORA_PDB" | tr '[:lower:]' '[:upper:]')"
  DMES_ORA_HOST="${DMES_ORA_HOST:-localhost}"
  DMES_ORA_PORT="${DMES_ORA_PORT:-1521}"
  DMES_ORA_URL="jdbc:oracle:thin:@//${DMES_ORA_HOST}:${DMES_ORA_PORT}/${DMES_ORA_PDB}"
  export DMES_ORA_PDB DMES_ORA_HOST DMES_ORA_PORT DMES_ORA_URL
  dev_log_print "be" "Oracle PDB 접속값 전달: $DMES_ORA_URL"
fi

# ── 선빌드 ───────────────────────────────────────────────────
# 모듈마다 따로 bootRun 을 띄우면 Gradle 프로세스 여러 개가 공유 includeBuild(cactus-core·mcm-core·
# maru-mdm-engine 등)를 동시에 빌드하며 서로의 build/classes·jar 를 덮어쓴다. 그래서 모듈이 2개 이상이면
# 기동 전에 src/backend 루트 composite 에서 Gradle 한 번으로 bootRun 이 쓰는 산출물(classes·jar)을 먼저 만든다.
# includeBuild 의 실행 기록은 각 빌드 폴더의 .gradle 에 남으므로, 이어서 모듈 폴더에서 도는 bootRun 은
# 컴파일·jar 가 모두 UP-TO-DATE 라 기동만 한다(기동 방식·프로파일·JVM 옵션·로그는 종전 그대로).
#
# 선빌드할 태스크는 손으로 적지 않고 Gradle 에 묻는다 — 선택 모듈의 bootRun 을 -m(실행 없이 계획만)으로
# 돌려 나온 태스크 중 bootRun 만 뺀다. 의존이 바뀌어도 목록이 따라간다.
# 계획이나 선빌드가 실패하면 기동하지 않고 exit 1 로 끝난다 — 실패한 채 bootRun 을 띄우면 그 7개가 공유
# includeBuild 를 다시 동시에 빌드해 이 단계가 없애려던 경합이 되살아난다. 종전처럼 실패해도 띄우려면
# BE_PREBUILD_CONTINUE=1(모듈 하나의 컴파일 오류가 나머지를 막지 않게), 선빌드 자체를 끄려면 BE_PREBUILD=0.
BE_PREBUILD_TASKS=()
BE_PREBUILD_PLAN_OUTPUT=""

# 직접 기동 방식은 classpath.txt 를 만들려고 모듈이 1개여도 늘 빌드한다(BE_PREBUILD=0 이면 건너뛴다).
# 종전 bootRun 방식(BE_GRADLE_RUN=1)은 경합이 생기는 모듈 2개 이상일 때만 선빌드한다.
be_prebuild_enabled() {
  [ "${BE_PREBUILD:-1}" != "0" ] || return 1
  be_legacy_mode || return 0
  [ "${#SELECTED_MODULES[@]}" -ge 2 ]
}

# 빌드 실행 방법: 어느 폴더에서 어느 gradlew 로 어떤 태스크·옵션을 줄지 BE_BUILD_* 와 BE_PREBUILD_TASKS 에 채운다.
# 모듈이 2개 이상이면 루트 composite 에서 한 번(공유 includeBuild 를 한 Gradle 이 빌드), 1개면 그 모듈 폴더에서 한다.
# 종전 방식(BE_GRADLE_RUN=1)은 be_prebuild_plan 이 BE_PREBUILD_TASKS 를 채운 뒤 flags 만 정한다.
BE_BUILD_DIR=""
BE_BUILD_GRADLEW=""
BE_BUILD_FLAGS=()
be_build_setup() {
  local m
  if be_legacy_mode; then
    BE_BUILD_DIR="$BACKEND_DIR"
    BE_BUILD_GRADLEW="$BACKEND_DIR/gradlew"
    BE_BUILD_FLAGS=(--continue --console=plain)
    return 0
  fi

  BE_BUILD_FLAGS=(-I "$BE_CLASSPATH_INIT" --continue --console=plain)
  # Gradle 클라이언트는 데몬을 따로 띄워 빌드한다. --no-daemon 이면 빌드가 끝날 때 그 프로세스도 같이 끝난다.
  [ "${BE_GRADLE_DAEMON:-0}" = "1" ] || BE_BUILD_FLAGS+=(--no-daemon)
  BE_PREBUILD_TASKS=()
  if [ "${#SELECTED_MODULES[@]}" -ge 2 ]; then
    BE_BUILD_DIR="$BACKEND_DIR"
    BE_BUILD_GRADLEW="$BACKEND_DIR/gradlew"
    for m in "${SELECTED_MODULES[@]}"; do
      BE_PREBUILD_TASKS+=(":$m:api:beRunClasspath")
    done
  else
    m="${SELECTED_MODULES[0]}"
    BE_BUILD_DIR="$BACKEND_DIR/$m"
    BE_BUILD_GRADLEW="$(be_module_gradlew "$m")"
    BE_PREBUILD_TASKS=(":api:beRunClasspath")
  fi
}

# 선택한 모듈의 classpath.txt 가 모두 있는지. 없는 모듈은 오류로 알리고 1 을 돌려준다.
be_check_classpath_files() {
  local m missing=0
  for m in "${SELECTED_MODULES[@]}"; do
    if [ ! -s "$(be_module_classpath_file "$m")" ]; then
      dev_log_error "be-$m 실행 정보가 없다: $(be_module_classpath_file "$m")"
      missing=1
    fi
  done
  return "$missing"
}

be_prebuild_plan_args() {
  local m
  for m in "${SELECTED_MODULES[@]}"; do
    printf ':%s:api:bootRun\n' "$m"
  done
}

# BE_PREBUILD_TASKS 를 채운다. 계획 실패·빈 목록이면 1.
be_prebuild_plan() {
  local line rc
  local plan_args=()

  BE_PREBUILD_TASKS=()
  while IFS= read -r line; do
    [ -n "$line" ] && plan_args+=("$line")
  done < <(be_prebuild_plan_args)

  BE_PREBUILD_PLAN_OUTPUT="$(cd "$BACKEND_DIR" && "$BACKEND_DIR/gradlew" "${plan_args[@]}" -m -q --console=plain 2>&1)"
  rc=$?
  [ "$rc" = "0" ] || return 1

  while IFS= read -r line; do
    line="${line%$'\r'}"
    case "$line" in
      :*" SKIPPED")
        line="${line% SKIPPED}"
        case "$line" in
          *:bootRun) ;;
          *) BE_PREBUILD_TASKS+=("$line") ;;
        esac
        ;;
    esac
  done <<< "$BE_PREBUILD_PLAN_OUTPUT"

  [ "${#BE_PREBUILD_TASKS[@]}" -gt 0 ]
}

be_prebuild_continue() {
  [ "${BE_PREBUILD_CONTINUE:-0}" = "1" ]
}

be_prebuild_print_plan_failure() {
  dev_log_error "선빌드 계획(gradlew -m) 실패 — 아래 출력에서 원인을 확인하세요."
  printf '%s\n' "$BE_PREBUILD_PLAN_OUTPUT" | tail -n 15 | dev_log_prefix_stream "be-build" >&2
}

# 선빌드가 실패했을 때: 기본은 아무것도 띄우지 않고 exit 1. BE_PREBUILD_CONTINUE=1 이면 종전처럼 기동을 이어 간다.
be_prebuild_fail() {
  if be_prebuild_continue; then
    dev_log_error "BE_PREBUILD_CONTINUE=1 — 선빌드 실패에도 모듈별 bootRun 으로 기동한다. 실패한 모듈은 자기 로그에 같은 오류를 다시 낸다."
    return 0
  fi
  dev_log_error "선빌드가 실패해 백엔드 모듈을 띄우지 않고 종료한다 (exit 1)."
  if be_legacy_mode; then
    dev_log_error "  선빌드 없이 종전처럼 모듈별 bootRun 으로 띄우려면: BE_PREBUILD=0 $0 ${SELECTED_MODULES[*]/#/--}"
  else
    dev_log_error "  종전 bootRun 방식으로 띄우려면: BE_GRADLE_RUN=1 $0 ${SELECTED_MODULES[*]/#/--}"
  fi
  dev_log_error "  선빌드 실패에도 기동을 이어 가려면: BE_PREBUILD_CONTINUE=1 (.run.env 에 둬도 된다)"
  exit 1
}

BE_PREBUILD_BG_PID=""

# 선빌드 도중 TERM·INT 를 받으면 선빌드 트리(서브셸·gradlew 가 exec 한 java 클라이언트·awk)를 함께 끝낸다.
# 선빌드는 종료 트랩보다 앞에서 돌기 때문에, 이 임시 트랩이 없으면 bash 만 죽고 빌드가 고아로 남는다.
# (백그라운드 잡은 비대화형 셸에서 SIGINT 를 무시하므로 Ctrl+C 도 여기서 대신 전한다.)
be_prebuild_abort() {
  local reason="$1"
  trap - INT TERM
  dev_log_error "선빌드 중 종료 신호($reason) 수신 — 선빌드 프로세스 정리 후 종료한다."
  if [ -n "$BE_PREBUILD_BG_PID" ]; then
    terminate_pid_tree TERM "$BE_PREBUILD_BG_PID"
    wait_for_exit "$BE_PREBUILD_BG_PID" || terminate_pid_tree KILL "$BE_PREBUILD_BG_PID"
  fi
  case "$reason" in
    INT) exit 130 ;;
    *) exit 143 ;;
  esac
}

be_run_prebuild() {
  local rc m

  if be_legacy_mode; then
    if ! be_prebuild_plan; then
      be_prebuild_print_plan_failure
      be_prebuild_fail
      return 0
    fi
    be_build_setup
  else
    be_build_setup
    # 이번 빌드가 실패한 뒤 지난 빌드의 낡은 classpath.txt 로 기동하지 않게 먼저 지운다.
    for m in "${SELECTED_MODULES[@]}"; do
      rm -f "$(be_module_classpath_file "$m")"
    done
  fi

  dev_log_print "be" "선빌드 시작 (태스크 ${#BE_PREBUILD_TASKS[@]}개, Gradle 1회) — cwd=$BE_BUILD_DIR"
  # src/backend/gradlew 는 bootRun 이 아닌 실행을 PC 전역 무거운 명령 슬롯(heavy.sh)에 줄 세운다. 선빌드는
  # 종전에 bootRun 7개가 슬롯 없이 하던 컴파일을 한 번으로 모은 것이라, 슬롯을 기다리게 하면 다른 세션의
  # 테스트가 많을 때 서버 기동이 수십 분 밀린다(종전엔 없던 대기). 그래서 종전처럼 슬롯 없이 돈다.
  # 백그라운드로 띄우고 wait 한다 — 그래야 아래 임시 트랩이 신호를 받는 즉시 트리를 정리할 수 있다.
  # 바깥 서브셸은 gradlew 의 종료 코드(PIPESTATUS[0])로 끝나므로 wait 가 그 값을 돌려준다.
  (
    (
      cd "$BE_BUILD_DIR" || exit 1
      export DFLOW_GRADLEW_NO_HEAVY=1
      dev_log_run "$BE_BUILD_GRADLEW" "${BE_PREBUILD_TASKS[@]}" "${BE_BUILD_FLAGS[@]}" 2>&1
    ) | dev_log_prefix_stream "be-build"
    exit "${PIPESTATUS[0]}"
  ) &
  BE_PREBUILD_BG_PID="$!"
  trap 'be_prebuild_abort INT' INT
  trap 'be_prebuild_abort TERM' TERM
  wait "$BE_PREBUILD_BG_PID"
  rc=$?
  trap - INT TERM
  BE_PREBUILD_BG_PID=""

  if [ "$rc" = "0" ] && ! be_legacy_mode; then
    be_check_classpath_files || rc=1
  fi

  if [ "$rc" = "0" ]; then
    if be_legacy_mode; then
      dev_log_print "be" "선빌드 완료 — 이어서 모듈별 bootRun 은 컴파일 없이 기동한다."
    else
      dev_log_print "be" "빌드 완료 — 이어서 java 로 직접 기동한다(Gradle 프로세스는 남지 않는다)."
    fi
    return 0
  fi
  dev_log_error "선빌드 실패 (exit=$rc) — 위 [be-build] 로그에서 원인을 확인하세요."
  be_prebuild_fail
  return 0
}

# ── 드라이런 ─────────────────────────────────────────────────
# 이전 인스턴스 종료·포트 회수·종료 트랩보다 앞에서 끝낸다 — 아무 프로세스도 끄거나 띄우지 않는다.
# 선빌드 태스크 목록을 보이려고 gradlew -m(계획만, 태스크 실행 없음)만 한 번 부른다.
if [ "$DRY_RUN" = "1" ]; then
  dev_log_print "be" "[dry-run] 기동 대상: $(printf '%s ' "${SELECTED_MODULES[@]}")"
  if [ "$KEEP_PORT" = "1" ]; then
    dev_log_print "be" "[dry-run] 포트 점유 시 중단(--keep-port): $(for m in "${SELECTED_MODULES[@]}"; do printf '%s ' "$(be_module_port "$m")"; done)"
  else
    dev_log_print "be" "[dry-run] 이 체크아웃의 이전 be-run.sh 종료 뒤 포트 회수: $(for m in "${SELECTED_MODULES[@]}"; do printf '%s ' "$(be_module_port "$m")"; done)"
  fi

  if ! be_legacy_mode; then
    if be_prebuild_enabled; then
      be_build_setup
      dev_log_print "be" "[dry-run] 1) 빌드 (Gradle 1회, 태스크 ${#BE_PREBUILD_TASKS[@]}개, classpath.txt 산출): (cd $BE_BUILD_DIR && DFLOW_GRADLEW_NO_HEAVY=1 $BE_BUILD_GRADLEW ${BE_PREBUILD_TASKS[*]} ${BE_BUILD_FLAGS[*]})"
      if be_prebuild_continue; then
        dev_log_print "be" "[dry-run]    빌드가 실패해도 classpath.txt 가 만들어진 모듈은 기동한다 (BE_PREBUILD_CONTINUE=1)."
      else
        dev_log_print "be" "[dry-run]    빌드가 실패하면 아무 모듈도 띄우지 않고 exit 1 (우회: BE_GRADLE_RUN=1 또는 BE_PREBUILD_CONTINUE=1)."
      fi
    else
      dev_log_print "be" "[dry-run] 빌드 생략 (BE_PREBUILD=0) — 직전 빌드가 남긴 classpath.txt 로 기동한다."
    fi
  elif be_prebuild_enabled; then
    dev_log_print "be" "[dry-run] 1) 선빌드 계획: (cd $BACKEND_DIR && $BACKEND_DIR/gradlew $(be_prebuild_plan_args | tr '\n' ' ')-m -q --console=plain)"
    if be_prebuild_plan; then
      dev_log_print "be" "[dry-run] 2) 선빌드 (Gradle 1회, 태스크 ${#BE_PREBUILD_TASKS[@]}개): (cd $BACKEND_DIR && DFLOW_GRADLEW_NO_HEAVY=1 $BACKEND_DIR/gradlew <아래 태스크> --continue --console=plain)"
      for t in "${BE_PREBUILD_TASKS[@]}"; do
        dev_log_print "be" "[dry-run]      $t"
      done
    else
      be_prebuild_print_plan_failure
    fi
    if be_prebuild_continue; then
      dev_log_print "be" "[dry-run]    계획·선빌드가 실패해도 기동을 이어 간다 (BE_PREBUILD_CONTINUE=1)."
    else
      dev_log_print "be" "[dry-run]    계획·선빌드가 실패하면 아무 모듈도 띄우지 않고 exit 1 (우회: BE_PREBUILD=0 또는 BE_PREBUILD_CONTINUE=1)."
    fi
  else
    dev_log_print "be" "[dry-run] 선빌드 생략 (모듈 1개 또는 BE_PREBUILD=0) — 종전처럼 bootRun 이 직접 빌드한다."
  fi

  dev_log_print "be" "[dry-run] 기동 순서 (각자 백그라운드, 로그 접두어 [be-<모듈>]):"
  for m in "${SELECTED_MODULES[@]}"; do
    if be_legacy_mode; then
      dev_log_print "be" "[dry-run]   be-$m :$(be_module_port "$m") — (cd $BACKEND_DIR/$m && $(be_module_gradlew "$m") :api:bootRun --args=\"$(be_module_boot_args "$m")\" --console=plain)"
    else
      be_module_jvm_args "$m"
      dev_log_print "be" "[dry-run]   be-$m :$(be_module_port "$m") — (cd $BACKEND_DIR/$m && $(be_java_bin "$m") ${BE_JVM_ARGS[*]} -cp <$(be_module_classpath_file "$m") 2행> <같은 파일 1행: main class> $(be_module_boot_args "$m"))"
    fi
  done
  [ "$BUILD_ONLY" = "1" ] && dev_log_print "be" "[dry-run] --build-only: 빌드까지만 하고 기동하지 않는다."
  exit 0
fi

# ── 사전 점검 ────────────────────────────────────────────────
for m in "${SELECTED_MODULES[@]}"; do
  [ -d "$BACKEND_DIR/$m" ] || { dev_log_error "디렉토리 누락: $BACKEND_DIR/$m"; exit 1; }
  # gradlew 실행권한 자동 보정 (모듈 전용 wrapper 가 있는 모듈만 해당)
  if [ -f "$BACKEND_DIR/$m/gradlew" ] && [ ! -x "$BACKEND_DIR/$m/gradlew" ]; then
    chmod +x "$BACKEND_DIR/$m/gradlew" 2>/dev/null || true
  fi
done
[ -x "$BACKEND_DIR/gradlew" ] || chmod +x "$BACKEND_DIR/gradlew" 2>/dev/null || true

# --build-only: 빌드(classpath.txt 산출)까지만 한다. 아무것도 띄우지 않으므로 이전 be-run.sh 종료·포트 회수는 하지 않는다
# (다른 체크아웃의 서버를 건드리지 않는다). 선빌드 도중 TERM·INT 는 be_run_prebuild 의 임시 트랩이 빌드 트리만 정리한다.
if [ "$BUILD_ONLY" = "1" ]; then
  if be_legacy_mode; then
    dev_log_error "--build-only 는 BE_GRADLE_RUN=1(종전 bootRun 방식)에서 쓸 수 없다."
    exit 2
  fi
  if be_prebuild_enabled; then
    BE_PREBUILD_CONTINUE=0
    be_run_prebuild
  else
    be_check_classpath_files || exit 1
  fi
  dev_log_print "be" "--build-only: 빌드만 끝내고 기동하지 않는다."
  exit 0
fi

# 빌드를 건너뛰는데(BE_PREBUILD=0) 직전 빌드의 classpath.txt 가 없으면, 이전 서버를 끄기 전에 알리고 끝낸다.
if ! be_legacy_mode && ! be_prebuild_enabled; then
  be_check_classpath_files || exit 1
fi

# local 프로파일 SQLite 파일 위치 — 모든 모듈의 application.yml 이 ../data/{모듈}.db 를 가리킨다.
# bootRun 의 workingDir 이 모듈 루트라 이 디렉토리가 없으면 SQLITE_CANTOPEN 으로 죽는다.
mkdir -p "$BACKEND_DIR/data"

# ── 이전 실행 인스턴스 종료 ──────────────────────────────────
# 포트만 뺏으면 이전 be-run.sh 가 "내 모듈이 다 죽었다" 고 판단해 뒤늦게 cleanup 을 돌린다.
# 그 cleanup 은 이 체크아웃 모듈 포트의 앱 JVM 을 정리하므로, 방금 새로 띄운 같은 포트의 모듈까지
# 함께 죽일 수 있다. 그래서 포트를 건드리기 전에 이전 인스턴스를 먼저 끝내고 기다린다.
#
# 대상은 **이 체크아웃의** be-run.sh 만이다. 같은 PC 의 다른 체크아웃·워크트리(예: /dflow-team 팀원
# 워크트리 dflow-<id8>)에서 도는 be-run.sh 까지 잡으면 남의 서버를 죽인다(2026-09-24 사고: 팀원이
# 워크트리에서 --mdm 을 띄우자 메인 체크아웃의 mcm 8100 이 함께 종료됐다).

# pid 의 작업 디렉터리(절대경로). 알 수 없으면 빈 값.
pid_cwd() {
  local pid="$1"
  if [ -e "/proc/$pid/cwd" ]; then
    readlink "/proc/$pid/cwd" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1
  fi
}

# pid 가 이 체크아웃($ROOT_DIR)의 be-run.sh 인지.
# - 명령줄의 be-run.sh 가 절대경로면 그 경로가 이 체크아웃의 것일 때만 참이다.
# - 상대경로(./be-run.sh)면 cwd 로 본다. 서브셸은 모듈 폴더(src/backend/<m>)로 cd 해 있으므로
#   $ROOT_DIR 자체이거나 $ROOT_DIR/src/ 아래면 참이다. 워크트리는 $ROOT_DIR/dflow-<id8>·
#   $ROOT_DIR/.claude/worktrees/ 아래에 생기므로 단순 접두 비교를 쓰지 않는다.
is_own_be_run() {
  local pid="$1" args tok cwd
  args="$(ps -o command= -p "$pid" 2>/dev/null || true)"
  for tok in $args; do
    case "$tok" in
      /*be-run.sh) [ "$tok" = "$ROOT_DIR/be-run.sh" ]; return ;;
      *be-run.sh) break ;;
    esac
  done
  cwd="$(pid_cwd "$pid")"
  case "$cwd" in
    "$ROOT_DIR"|"$ROOT_DIR/src/"*) return 0 ;;
  esac
  return 1
}

terminate_previous_be_runs() {
  local pid
  local victims=()

  command -v pgrep >/dev/null 2>&1 || return 0

  for pid in $(pgrep -f "be-run.sh" 2>/dev/null || true); do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    [ "$pid" = "$PPID" ] && continue          # local-run.sh 등 부모는 건드리지 않는다
    kill -0 "$pid" 2>/dev/null || continue
    is_own_be_run "$pid" || continue          # 다른 체크아웃·워크트리의 인스턴스는 건드리지 않는다
    victims+=("$pid")
  done

  [ "${#victims[@]}" -gt 0 ] || return 0

  dev_log_print "be" "이전 be-run.sh 인스턴스 종료 대기 (pid ${victims[*]}) — 그 cleanup 이 끝나야 안전하다"
  for pid in "${victims[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done

  # cleanup(앱 JVM 정리 포함)이 끝날 때까지 최대 30초 기다린다.
  local i alive
  for i in $(seq 1 120); do
    alive=0
    for pid in "${victims[@]}"; do
      kill -0 "$pid" 2>/dev/null && alive=1
    done
    [ "$alive" = "0" ] && break
    sleep 0.25
  done

  for pid in "${victims[@]}"; do
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
  done
}

terminate_previous_be_runs

# ── 포트 회수 ────────────────────────────────────────────────
# 이전 실행이 남긴 bootRun JVM 이 포트를 물고 있으면 그냥 정리하고 시작한다
# (fe-run.sh 가 포털 포트 5100 에 대해 하는 것과 같은 동작).
# 다른 프로그램이 쓰는 포트까지 건드리는 게 부담스러우면 --keep-port 로 종전처럼
# "점유 중이면 중단" 동작을 쓴다.
reclaim_backend_port() {
  local port="$1"
  local tag="$2"
  local pid
  local occupied=0

  if ! command -v lsof >/dev/null 2>&1; then
    dev_log_error "lsof 를 찾을 수 없어 포트 $port 점유 여부를 확인할 수 없습니다."
    return 1
  fi

  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    occupied=1

    if [ "$KEEP_PORT" = "1" ]; then
      dev_log_error "$tag 가 사용할 포트 $port 가 이미 점유 중입니다 (pid=$pid)."
      echo "        --keep-port 가 지정돼 회수하지 않습니다. 직접 정리한 뒤 다시 실행하세요:" >&2
      echo "          kill $pid" >&2
      return 1
    fi

    # 무엇을 죽이는지 보이게 남긴다 — 예상 밖의 프로세스면 여기서 알아챌 수 있다.
    dev_log_print "be" "$tag 포트 $port 점유 프로세스 정리 (TERM pid=$pid) — $(ps -o comm= -p "$pid" 2>/dev/null | head -1)"
    terminate_pid_tree TERM "$pid"
  done

  [ "$occupied" = "0" ] && return 0

  wait_for_exit $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true) || true

  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    dev_log_print "be" "$tag 포트 $port 강제 종료 (KILL pid=$pid)"
    terminate_pid_tree KILL "$pid"
  done

  sleep 0.3
  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    dev_log_error "$tag 가 사용할 포트 $port 를 비우지 못했습니다 (pid=$pid). 권한이 없는 프로세스일 수 있습니다."
    return 1
  done

  return 0
}

for m in "${SELECTED_MODULES[@]}"; do
  reclaim_backend_port "$(be_module_port "$m")" "be-$m" || exit 1
done

# 종료 트랩보다 앞에서 돈다 — 띄운 모듈이 아직 없으므로 선빌드 중 Ctrl+C·TERM 은 be_run_prebuild 의
# 임시 트랩이 선빌드 트리만 정리하고 끝낸다. 선빌드가 실패하면 여기서 exit 1(BE_PREBUILD_CONTINUE=1 이면 계속).
if be_prebuild_enabled; then
  be_run_prebuild
fi

# ── 로그 프리픽스 ────────────────────────────────────────────
PIDS=()
PID_TAGS=()   # PIDS 와 같은 인덱스의 모듈 태그 (be-mcm 등) — 어느 모듈이 죽었는지 알리기 위함
LOG_PIDS=()

run_with_prefix() {
  local tag="$1"; shift
  local dir="$1"; shift
  local pid_file="${TMPDIR:-/tmp}/dev-be-${tag}-$$.pid"
  rm -f "$pid_file"

  (
    cd "$dir" || exit 1
    # 직접 기동 방식은 함수(dev_log_run)를 거치지 않는다 — 함수를 백그라운드로 부르면 서브셸이 한 겹 더 생겨
    # 추적 pid 가 java 가 아니게 되고, 그 서브셸이 먼저 죽으면 java 가 고아로 남아 KILL 단계에서 빠진다.
    if [ "${BE_RUN_DIRECT:-0}" = "1" ]; then
      "$@" 2>&1 &
    else
      dev_log_run "$@" 2>&1 &
    fi
    local child_pid="$!"
    printf '%s\n' "$child_pid" > "$pid_file"
    wait "$child_pid" 2>/dev/null || true
  ) | dev_log_prefix_stream "$tag" &

  local log_pid="$!"
  # Bash reports disowned background pipelines less noisily on Ctrl+C.
  # The real Gradle child PID is tracked separately in PIDS below.
  disown "$log_pid" 2>/dev/null || true
  local run_pid=""
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if [ -s "$pid_file" ]; then
      run_pid="$(cat "$pid_file")"
      break
    fi
    sleep 0.05
  done
  rm -f "$pid_file"

  if [ -n "$run_pid" ]; then
    PIDS+=("$run_pid")
    PID_TAGS+=("$tag")
    dev_log_print "be" "$tag 시작 (pid $run_pid, log $log_pid) — cwd=$dir : $*"
  else
    dev_log_error "$tag 실행 PID 확인 실패 — cwd=$dir : $*"
  fi
  LOG_PIDS+=("$log_pid")
}

# ── 종료 핸들러 ─────────────────────────────────────────────
CLEANUP_DONE=0

# 모듈 하나가 죽어도 나머지는 계속 띄운다.
#
# 종전에는 자식 하나만 끝나도 즉시 return 해서 전체를 정리했다. 모듈이 6개가 되면
# (예: 메모리 부족으로 한 JVM 이 OOM) 멀쩡한 5개와 프론트까지 동반 종료돼,
# 정작 사용자에게는 "왜 백엔드가 통째로 사라졌는지" 가 안 보인다.
# 이제는 죽은 모듈만 이름을 찍어 알리고, 전부 죽었을 때만 빠져나온다.
wait_for_backend_exit() {
  local i pid alive

  while :; do
    alive=0
    for i in "${!PIDS[@]}"; do
      pid="${PIDS[$i]}"
      [ -n "$pid" ] || continue
      if kill -0 "$pid" 2>/dev/null; then
        alive=1
      else
        dev_log_error "${PID_TAGS[$i]} 프로세스가 종료됐습니다 (pid=$pid). 위 로그에서 원인을 확인하세요."
        dev_log_error "  다시 띄우려면: ./be-run.sh --${PID_TAGS[$i]#be-}"
        PIDS[$i]=""
      fi
    done

    [ "$alive" = "0" ] && {
      dev_log_error "실행 중인 백엔드 모듈이 없습니다 — 정리 후 종료합니다."
      return 0
    }
    sleep 0.5
  done
}

# pid 가 이 체크아웃의 모듈($2) bootRun 앱 JVM 인지.
# bootRun 의 앱 JVM 은 be-run 의 프로세스 트리가 아니라 Gradle 데몬의 자식이다. 그래서 gradlew 실행기만
# 끊으면 남는다 — 종료 경로에서 모듈 포트의 리스너를 따로 정리하되, 다른 체크아웃(메인 저장소·다른 워크트리)의
# 같은 포트 서버는 절대 건드리지 않게 여기서 고른다.
# - 이름이 java 인 프로세스만.
# - 작업 디렉터리를 알면 그것으로만 판단한다: bootRun 이 workingDir = rootProject.projectDir 이라
#   이 체크아웃의 모듈 폴더($BACKEND_DIR/<모듈>)와 정확히 같아야 한다(lsof 는 실제 경로를 내므로 pwd -P 도 비교).
#   워크트리는 $ROOT_DIR/.claude/worktrees/·$ROOT_DIR/dflow-<id8> 아래라 정확 비교로 서로 갈린다.
# - 작업 디렉터리를 모르면 명령줄(공백·콜론으로 나눈 classpath 항목)이 그 모듈 폴더 아래 경로로 시작할 때만.
is_own_backend_jvm() {
  local pid="$1"
  local m="$2"
  local mod_dir="$BACKEND_DIR/$m"
  local mod_dir_phys comm cwd args tok
  local IFS=$' \t\n'

  mod_dir_phys="$(cd "$mod_dir" 2>/dev/null && pwd -P)"
  [ -n "$mod_dir_phys" ] || mod_dir_phys="$mod_dir"

  comm="$(ps -o comm= -p "$pid" 2>/dev/null | head -n 1)"
  [ "${comm##*/}" = "java" ] || return 1

  cwd="$(pid_cwd "$pid")"
  if [ -n "$cwd" ]; then
    [ "$cwd" = "$mod_dir" ] || [ "$cwd" = "$mod_dir_phys" ]
    return
  fi

  args="$(ps -ww -o command= -p "$pid" 2>/dev/null || true)"
  IFS=$' \t\n:'
  for tok in $args; do
    case "$tok" in
      "$mod_dir"/*|"$mod_dir_phys"/*) return 0 ;;
    esac
  done
  return 1
}

# 이 실행이 맡은 모듈 포트를 LISTEN 중인 이 체크아웃의 앱 JVM 에 신호를 보낸다.
# 신호를 보낸 pid 는 BE_OWN_PORT_PIDS 에 남는다(호출할 때마다 새로 찾는다 — KILL 단계는 다시 스캔해
# 그사이 끝난 pid 나 새로 바인드한 남의 프로세스를 치지 않는다).
BE_OWN_PORT_PIDS=()
terminate_backend_ports() {
  local signal="$1"
  local m port tag port_pid

  BE_OWN_PORT_PIDS=()
  command -v lsof >/dev/null 2>&1 || return 0

  for m in "${SELECTED_MODULES[@]}"; do
    port="$(be_module_port "$m")"
    tag="be-$m"
    for port_pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
      [ -n "$port_pid" ] || continue
      [ "$port_pid" = "$$" ] && continue
      if is_own_backend_jvm "$port_pid" "$m"; then
        dev_log_print "be" "$tag 포트 $port 앱 JVM 정리 ($signal pid=$port_pid)"
        terminate_pid_tree "$signal" "$port_pid"
        BE_OWN_PORT_PIDS+=("$port_pid")
      elif [ "$signal" = "TERM" ]; then
        dev_log_print "be" "$tag 포트 $port 리스너 pid=$port_pid 는 이 체크아웃의 bootRun JVM 이 아니라 건드리지 않는다 — $(ps -o comm= -p "$port_pid" 2>/dev/null | head -n 1)"
      fi
    done
  done
}

cleanup() {
  local reason="${1:-EXIT}"
  local first_signal="TERM"
  local pid

  trap - INT TERM EXIT
  if [ "$CLEANUP_DONE" = "1" ]; then
    return 0
  fi
  CLEANUP_DONE=1

  echo
  dev_log_print "be" "종료 신호 수신, 자식 프로세스 정리 중..."
  # 배열이 비어도 bash 3.2 + set -u 에서 죽지 않게 ${arr[@]+"${arr[@]}"} 로 편다.
  if [ "$reason" = "INT" ]; then
    wait_for_exit ${PIDS[@]+"${PIDS[@]}"} || true
  else
    for pid in ${PIDS[@]+"${PIDS[@]}"}; do
      terminate_pid_tree "$first_signal" "$pid"
    done
  fi

  # gradlew 실행기 트리 → 이 체크아웃의 앱 JVM(데몬의 자식이라 실행기 트리 밖) 순서로 TERM → 대기 → KILL.
  for pid in ${PIDS[@]+"${PIDS[@]}"}; do
    terminate_pid_tree TERM "$pid"
  done
  terminate_backend_ports TERM
  wait_for_exit ${PIDS[@]+"${PIDS[@]}"} ${BE_OWN_PORT_PIDS[@]+"${BE_OWN_PORT_PIDS[@]}"} || true

  for pid in ${PIDS[@]+"${PIDS[@]}"}; do
    terminate_pid_tree KILL "$pid"
  done
  terminate_backend_ports KILL

  for pid in ${LOG_PIDS[@]+"${LOG_PIDS[@]}"}; do
    terminate_pid_tree TERM "$pid"
  done
  wait_for_exit ${LOG_PIDS[@]+"${LOG_PIDS[@]}"} || true

  # Gradle 데몬은 멈추지 않는다. gradlew --stop 은 같은 사용자·같은 Gradle 버전의 데몬을 모두 멈춰
  # 다른 워크트리에서 도는 빌드·시험을 "Gradle build daemon has been stopped" 로 깨뜨린다.
  # bootRun 을 돌던 데몬은 빌드가 끝나 쉬게 되고, org.gradle.daemon.idletimeout(10분)으로 스스로 내려간다.
  if be_legacy_mode; then
    dev_log_print "be" "정리 완료. (Gradle 데몬은 그대로 둔다 — 쉬면 10분 뒤 스스로 내려간다)"
  else
    dev_log_print "be" "정리 완료. (앱을 Gradle 없이 직접 띄웠으므로 이 실행이 남긴 Gradle 데몬은 없다)"
  fi

  case "$reason" in
    INT) exit 130 ;;
    TERM) exit 143 ;;
  esac
}
trap 'cleanup INT' INT
trap 'cleanup TERM' TERM
trap 'cleanup EXIT' EXIT

# ── 백엔드 실행 ─────────────────────────────────────────────
# 앱을 java 로 직접 띄운다. 작업 디렉터리는 bootRun 의 workingDir 과 같은 모듈 폴더(application.yml 의 ../data 가 걸린다).
be_start_module() {
  local m="$1" file main cp
  file="$(be_module_classpath_file "$m")"
  if [ ! -s "$file" ]; then
    dev_log_error "be-$m 는 실행 정보(classpath.txt)가 없어 띄우지 않는다: $file"
    return 0
  fi
  { IFS= read -r main; IFS= read -r cp; } < "$file"
  be_module_jvm_args "$m"
  # shellcheck disable=SC2046  # 부트 인자는 공백 없는 --키=값 들이라 단어 분리가 의도다
  BE_RUN_DIRECT=1 run_with_prefix "be-$m" "$BACKEND_DIR/$m" \
    "$(be_java_bin "$m")" ${BE_JVM_ARGS[@]+"${BE_JVM_ARGS[@]}"} -cp "$cp" "$main" $(be_module_boot_args "$m")
}

for m in "${SELECTED_MODULES[@]}"; do
  if be_legacy_mode; then
    run_with_prefix "be-$m" "$BACKEND_DIR/$m" \
      "$(be_module_gradlew "$m")" :api:bootRun --args="$(be_module_boot_args "$m")" --console=plain
  else
    be_start_module "$m"
  fi
done

if [ "${#PIDS[@]}" -eq 0 ]; then
  dev_log_error "띄운 백엔드 모듈이 없다 — 실행 정보(classpath.txt)가 없거나 실행 PID 를 확인하지 못했다."
  exit 1
fi

dev_log_print "be" "기동 대상: $(printf '%s ' "${SELECTED_MODULES[@]}")"
for m in "${SELECTED_MODULES[@]}"; do
  dev_log_print "be" "  be-$m → http://localhost:$(be_module_port "$m")"
done
dev_log_print "be" "백엔드 기동 완료. Ctrl+C 로 종료."
wait_for_backend_exit
