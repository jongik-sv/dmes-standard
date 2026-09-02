#!/usr/bin/env bash
# DMES 로컬 풀스택 재기동 스크립트 (Git Bash / Windows)
#
# 동작: 포털(5000) · mcm(8100) · mqc(8300) 종료 → 프론트 라이브러리 모듈 재빌드
#       → 3개 서비스 재기동 → 포트 LISTEN 대기 → 기동 확인 출력
#
# 사용법:
#   bash scripts/restart-all.sh              # 전체 재기동 (프론트 재빌드 포함)
#   bash scripts/restart-all.sh --no-build   # 재빌드 건너뛰고 재기동만 (백엔드만 바꿨을 때)
#   bash scripts/restart-all.sh --no-front   # 백엔드(mcm,mqc)만 재기동, 포털은 건드리지 않음
#
# DB 프로파일 (DMES_PROFILE, 기본 local-kp):
#   local-kp : MSSQL 김포 개발 DB (172.16.2.154:5010 / ksm_dmes)   ← 기본
#   local-ph : MSSQL 포항 개발 DB (10.10.80.241:1433 / ksm_dmes)
#   local    : SQLite (src/backend/data/*.db) — 실데이터 없음, 조회 0건
#   예) DMES_PROFILE=local-ph bash scripts/restart-all.sh
#   ※ 구 `local,mssql` 조합은 폐기됐다(application-mssql.yml 삭제, 05b933dee).
#      지금 이 값을 주면 에러 없이 local 만 적용돼 SQLite 로 조용히 뜬다.
#
# 로그인: admin / admin123   포털: http://localhost:5000
set -u

# 백엔드 활성 프로파일 (local 계열과 dev/prod 는 상호배타 — 하나만 지정)
PROFILE="${DMES_PROFILE:-local-kp}"

# 빌드 JDK — 백엔드는 JDK 21 필요. 기본 java 가 11 이면 gradle 이 실패하므로
# JAVA21_HOME(기본 ~/jdk-21) 이 있으면 그것으로 교체한다.
JAVA21="${JAVA21_HOME:-$HOME/jdk-21}"
if [ -x "$JAVA21/bin/java" ]; then
  export JAVA_HOME="$JAVA21"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
JAVA_MAJOR="$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')"
if [ "${JAVA_MAJOR:-0}" -lt 21 ] 2>/dev/null; then
  echo "JDK 21 이 필요하다 (현재 java=$JAVA_MAJOR, JAVA_HOME=${JAVA_HOME:-미설정})."
  echo "JAVA21_HOME=/c/Users/<계정>/jdk-21 형태로 지정하고 다시 실행하라."
  exit 1
fi

# 저장소 루트 (이 스크립트 위치 기준)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FE="$ROOT/src/frontend"
BE="$ROOT/src/backend"
LOGDIR="${TMPDIR:-/tmp}"

DO_BUILD=1
DO_FRONT=1
for arg in "$@"; do
  case "$arg" in
    --no-build) DO_BUILD=0 ;;
    --no-front) DO_FRONT=0 ;;
    *) echo "알 수 없는 옵션: $arg"; exit 2 ;;
  esac
done

kill_port() {
  local p="$1"
  local pid
  pid="$(netstat -ano | grep -E ":$p\s" | grep LISTEN | head -1 | awk '{print $NF}')"
  if [ -n "$pid" ]; then
    taskkill //PID "$pid" //F //T >/dev/null 2>&1 \
      && echo "  [$p] 종료 (pid $pid)" \
      || echo "  [$p] 종료 실패 (pid $pid)"
  else
    echo "  [$p] 실행 중인 프로세스 없음"
  fi
}

wait_port() {
  local p="$1" name="$2" n=0
  printf "  [%s] %s 기동 대기" "$p" "$name"
  until netstat -ano | grep -E ":$p\s" | grep -q LISTEN; do
    n=$((n+1)); [ "$n" -ge 90 ] && { echo " ... 타임아웃(약 180s)"; return 1; }
    printf "."; sleep 2
  done
  echo " UP"
}

echo "=== 1) 종료 ==="
[ "$DO_FRONT" -eq 1 ] && kill_port 5000
kill_port 8100
kill_port 8300

if [ "$DO_BUILD" -eq 1 ] && [ "$DO_FRONT" -eq 1 ]; then
  echo "=== 2) 프론트 라이브러리 모듈 재빌드 ==="
  FE_BUILD_LOG="$LOGDIR/fe-build.log"
  ( cd "$FE" && pnpm \
      --filter @dk-oasis/shared \
      --filter @dk-oasis/m-mpn \
      --filter @dk-oasis/m-mpp \
      --filter @dk-oasis/m-mqc \
      --filter @dk-oasis/m-analog \
      --filter @dk-oasis/m-mls \
      build ) > "$FE_BUILD_LOG" 2>&1
  fe_rc=$?
  grep -aiE 'Build success|Done' "$FE_BUILD_LOG" | tail -8

  # 종료코드만 믿으면 안 된다. tsup 은 esbuild 모듈 해석 실패 뒤 'SyntaxError: Unexpected end of
  # JSON input' 으로 죽으면서도 rc=0 을 돌려준다. 게다가 tsup.config 가 clean:false 라 실패해도
  # 옛 dist 산출물이 남아 있어 겉보기엔 정상이다. 실제로 이 조합 때문에 m-analog 의
  # react18-json-view 미설치 → dist/pages/anl/logViewer.js 미생성 → 포털에서
  # "Module not found: Can't resolve '@dk-oasis/m-analog/pages/anl/logViewer'" 가 났다.
  # 조용히 깨진 dist 로 기동하지 않도록 로그의 실패 표식도 함께 검사한다.
  if [ "$fe_rc" -ne 0 ] \
     || grep -aqE '\[ERROR\]|Could not resolve|Cannot find module|Build failed|ELIFECYCLE' "$FE_BUILD_LOG"; then
    echo
    echo "!! 프론트 빌드 실패 (rc=$fe_rc) — 아래 오류를 먼저 해결하라."
    grep -aE -A3 '\[ERROR\]|Could not resolve|Cannot find module|Build failed|ELIFECYCLE' "$FE_BUILD_LOG" | head -25
    echo
    echo "   전체 로그 : $FE_BUILD_LOG"
    echo "   의존성 누락이면 : (cd '$FE' && pnpm install) 후 다시 실행하라."
    exit 1
  fi
  # 프론트 라이브러리(shared/dist 등)를 새로 빌드했으면 포털의 Turbopack 빌드 캐시(.next)를
  # 반드시 지운다. 캐시가 남아 있으면 pnpm dev 재기동 시 옛 컴파일본(구 oasis-proxy = /api/{module}
  # 전체경로 포워딩)을 서빙해 BFF→BE 가 /api/mcm/oasis/... 로 잘못 전달 → BE 는 /oasis/... 만
  # 매핑하므로 NoResourceFound(500) = 기동 직후 "메뉴 조회 실패". 신규 dist 반영을 강제한다.
  echo "=== 2.5) 포털 Turbopack 캐시(.next) 제거 (stale 컴파일본 방지) ==="
  rm -rf "$FE/m-mcm/.next" && echo "  [.next] 제거 완료"
else
  echo "=== 2) 재빌드 건너뜀 ==="
fi

echo "=== 2.7) 백엔드 순차 사전 빌드 ==="
# mcm 과 mqc 는 ../cactus-core, ../mcm-core 를 includeBuild 로 "공유"한다 (각 settings.gradle).
# 두 bootRun 을 동시에 띄우면 두 Gradle 데몬이 같은 build/ 출력 디렉터리에 동시에 써서
# 한쪽이 반쯤 쓰인 클래스를 읽고 "cannot find symbol" / "package ... does not exist" 로 깨진다.
# (같은 패키지의 형제 클래스를 못 찾는 형태로 나타나 원인 파악이 어렵다.)
# 먼저 순차로 컴파일해 두면 이후 bootRun 의 빌드는 up-to-date no-op 이 되어 경합하지 않는다.
for m in mcm mqc; do
  printf "  [%s] compile ... " "$m"
  if ( cd "$BE/$m" && ./gradlew :api:classes --console=plain -q ); then
    echo "OK"
  else
    echo "실패 — 위 오류 확인 후 다시 실행하라."
    exit 1
  fi
done

echo "=== 3) 재기동 (프로파일: $PROFILE) ==="
# nohup + disown: 본 스크립트가 종료돼도 서비스는 계속 떠 있도록 분리
# mcm biz=MCMAPUSER / cmn=MCMAPUSER / if=EAIUSER (프로파일 yml 정의). local-* 는 JNDI 아닌 Hikari 직결.
nohup bash -c "cd '$BE/mcm' && ./gradlew :api:bootRun --args='--spring.profiles.active=$PROFILE --server.port=8100'" > "$LOGDIR/mcm-boot.log" 2>&1 &
disown
echo "  [8100] mcm bootRun($PROFILE) 시작 -> $LOGDIR/mcm-boot.log"
# mqc biz=MQCAPUSER / cmn=MCMAPUSER / if=EAIUSER (프로파일 yml 정의).
nohup bash -c "cd '$BE/mqc' && ./gradlew :api:bootRun --args='--spring.profiles.active=$PROFILE --server.port=8300'" > "$LOGDIR/mqc-boot.log" 2>&1 &
disown
echo "  [8300] mqc bootRun($PROFILE) 시작 -> $LOGDIR/mqc-boot.log"
if [ "$DO_FRONT" -eq 1 ]; then
  nohup bash -c "cd '$FE/m-mcm' && pnpm run dev" > "$LOGDIR/m-mcm-dev.log" 2>&1 &
  disown
  echo "  [5000] m-mcm 포털 시작 -> $LOGDIR/m-mcm-dev.log"
fi

echo "=== 4) 기동 확인 ==="
wait_port 8100 "mcm"
wait_port 8300 "mqc"
[ "$DO_FRONT" -eq 1 ] && wait_port 5000 "portal"

echo "=== 완료 ==="
grep -aiE 'Started McmApplication' "$LOGDIR/mcm-boot.log" | tail -1
grep -aiE 'Started MqcApplication' "$LOGDIR/mqc-boot.log" | tail -1
[ "$DO_FRONT" -eq 1 ] && grep -aiE 'Ready in' "$LOGDIR/m-mcm-dev.log" | tail -1
echo
echo "포털: http://localhost:5000  (admin / admin123)"
echo "브라우저에서 Ctrl+Shift+R 하드 리프레시 후 화면 조회하세요."
