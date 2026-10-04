#!/bin/bash
# 사용: [BACKEND=<리포>/src/backend] dump-deps.sh <출력폴더> [모듈...]
#   BACKEND 를 주지 않으면 이 스크립트가 든 저장소의 src/backend 를 쓴다(<저장소>/scripts/build-verify/ 기준 ../../src/backend).
#   자세한 사용법·종료코드·한계는 같은 폴더의 README.md 에 있다.
#
# included build 모듈마다 gradle 1회로 다음을 남긴다(init 스크립트 2개가 태스크를 등록한다).
#   <mod>/deps/<프로젝트>/<구성>.txt          canBeResolved=true 인 모든 구성의 dependencies 보고("선언 -> 해석")
#   <mod>/deps/<프로젝트>/_resolvable-configurations.txt
#   <mod>/buildEnvironment/<프로젝트>.txt     buildscript classpath(플러그인 클래스패스)
#   <mod>/settings/<프로젝트>.txt             플러그인·java·extensions·ext·저장소·Test·JavaCompile·보관 태스크·JavaExec·publishing
#   <mod>/settings/_settings.txt              settings 단계 저장소·versionCatalogs
#   <mod>/configurations/<프로젝트>.txt       모든 구성의 선언 의존성·제약·속성
#   _projects.txt  _errors.txt
# gradle 의 stdout/stderr·시간·실행 메타(_meta.txt: 커밋·Gradle 버전·heavy.sh·init.d 해시)는 <출력폴더>.logs/ 에 둔다(diff 대상 밖).
# 경로는 BACKEND·그 리포 루트 기준으로 바꾸므로 워크트리가 달라도 같은 내용이면 같은 출력이 나온다.
#
# 결과에 영향 줄 수 있는 환경은 고정한다: env -i 로 비우고 필요한 것만 넘긴다
# (CI·BACKEND_CLIENT_KEY·CACTUS_JWT_SECRET·MDM_EMBEDDING_MODEL_DIR·NEXUS_* 는 빠진다), DMES_TEST_SLOTS=0(DUMP_DMES_TEST_SLOTS 로 바꿈), 로캘 en_US.UTF-8.
# JAVA_HOME·DFLOW_HEAVY_DIR·DFLOW_HEAVY_SLOTS 는 PC 마다 다르므로 박지 않고 호출 환경에 있을 때만 그대로 넘긴다.
# 없으면 gradlew 의 기본 동작(PATH 의 java, 기본 heavy 칸)을 따른다. 넘긴 JAVA_HOME 은 _meta.txt 의 java-home 줄에 남는다.
# DUMP_GRADLE_ARGS: gradle 에 덧붙일 인자(예: --no-daemon — 새 JVM 에서도 같은지 결정성 확인용).
# DUMP_DMES_TEST_SLOTS: gradle 에 넘길 DMES_TEST_SLOTS 값(기본 0, 0 이상 정수). 0 이면 test-slot.gradle 이 BuildService 등록을
#   건너뛰어 Test 의 requiredServices·actions 에 슬롯이 안 보인다. ③(test-slot 적용을 convention plugin 으로 옮김)을 검증할 때는
#   양쪽을 같은 값(예: 2)으로 떠서 'requiredServices = [dmesTestSlot-<rootProject>]'·actions 가 그대로인지 본다.
#   구성 단계에서는 슬롯을 잡지 않는다(acquire 는 Test 의 doFirst 안에서만 불린다 — 덤프는 Test 를 실행하지 않는다).
set -u
[ $# -ge 1 ] && [ -n "$1" ] || { echo "사용: [BACKEND=<리포>/src/backend] dump-deps.sh <출력폴더> [모듈...]" >&2; exit 2; }
OUT_ARG="$1"; shift
HERE="$(cd "$(dirname "$0")" && pwd -P)"
BACKEND="$(cd "${BACKEND:-$HERE/../../src/backend}" && pwd -P)" || { echo "BACKEND 폴더 없음" >&2; exit 2; }
REPO="$(cd "$BACKEND/../.." && pwd -P)"
GUH="${GRADLE_USER_HOME:-$HOME/.gradle}"; GUH="$(cd "$GUH" 2>/dev/null && pwd -P)" || GUH=""
HOME_P="$(cd "$HOME" && pwd -P)"
[ -x "$BACKEND/gradlew" ] || { echo "$BACKEND/gradlew 없음 — BACKEND 는 <리포>/src/backend 여야 한다" >&2; exit 2; }
TEST_SLOTS="${DUMP_DMES_TEST_SLOTS:-0}"
[[ "$TEST_SLOTS" =~ ^[0-9]+$ ]] || { echo "DUMP_DMES_TEST_SLOTS 는 0 이상 정수여야 한다: '$TEST_SLOTS'" >&2; exit 2; }

MODS=("$@")
[ ${#MODS[@]} -eq 0 ] && MODS=(mpn cactus-core aps-core mcm-core caravan-console mpp mqc mls mcm localKafka caravan-core caravan-hub analog mdm maru-mdm-engine)

# 남은 파일이 diff 를 더럽히지 않게, 비어 있지 않은 출력 폴더는 거절한다(지우지 않는다).
if [ -e "$OUT_ARG" ] && [ -n "$(ls -A "$OUT_ARG" 2>/dev/null)" ]; then
  echo "출력 폴더가 비어 있지 않다: $OUT_ARG — 새 폴더를 주라" >&2; exit 2
fi
mkdir -p "$OUT_ARG"; OUT="$(cd "$OUT_ARG" && pwd -P)"
LOGS="${OUT}.logs"; mkdir -p "$LOGS"
: > "$OUT/_errors.txt"; : > "$OUT/_projects.txt"; : > "$LOGS/_timing.txt"

# 실행 메타(판정자가 A=B^ 인지, 같은 Gradle·같은 전역 init 스크립트로 돌았는지 확인용) — diff 대상 밖.
{
  echo "date        $(date '+%Y-%m-%d %H:%M:%S')"
  echo "BACKEND     $BACKEND"
  echo "REPO        $REPO"
  echo "HEAD        $(/usr/bin/git -C "$REPO" rev-parse HEAD 2>/dev/null)"
  echo "HEAD^       $(/usr/bin/git -C "$REPO" rev-parse HEAD^ 2>/dev/null)"
  echo "dirty       $(/usr/bin/git -C "$REPO" status --porcelain -- src/backend 2>/dev/null | wc -l | tr -d ' ') files under src/backend"
  echo "java-home   ${JAVA_HOME:-<unset>}"
  echo "gradle      $(grep '^distributionUrl' "$BACKEND/gradle/wrapper/gradle-wrapper.properties" 2>/dev/null)"
  echo "heavy.sh    $(shasum -a 256 "$REPO/.claude/skills/dflow-dev/scripts/heavy.sh" 2>/dev/null | cut -c1-16)"
  for f in "${GUH:-$HOME/.gradle}"/init.d/* "${GUH:-$HOME/.gradle}"/init.gradle "${GUH:-$HOME/.gradle}"/gradle.properties; do
    [ -f "$f" ] && echo "guh-file    $(shasum -a 256 "$f" | cut -c1-16) ${f#${GUH:-$HOME/.gradle}/}"
  done
  echo "dflow-agent $(d="$BACKEND"; while [ "$d" != / ]; do [ -e "$d/.dflow-agent" ] && { echo "$d/.dflow-agent"; break; }; d=$(dirname "$d"); done)"
  echo "tools       $(cat "$HERE"/dump-deps.sh "$HERE"/dump-deps.init.gradle "$HERE"/dump-settings.init.gradle | shasum -a 256 | cut -c1-16)"
  echo "modules     ${MODS[*]}"
  echo "test-slots  $TEST_SLOTS"
} > "$LOGS/_meta.txt"

# sed 정규식 메타문자 이스케이프(구분자 | 포함)
sed_re() { printf '%s' "$1" | sed -e 's/[][\\.*^$|]/\\&/g'; }
SED_ARGS=(-e "s|$(sed_re "$BACKEND")|<BACKEND>|g" -e "s|$(sed_re "$REPO")|<REPO>|g")
[ -n "$GUH" ] && SED_ARGS+=(-e "s|$(sed_re "$GUH")|<GRADLE_USER_HOME>|g")
SED_ARGS+=(-e "s|$(sed_re "$HOME_P")|~|g")

# 경로만 바꾼다(긴 접두어부터 — BACKEND ⊂ REPO, GRADLE_USER_HOME ⊂ HOME). 보고 파일의 줄은 지우지 않는다.
rewrite_paths() {
  sed "${SED_ARGS[@]}" "$1" > "$1.tmp" && mv "$1.tmp" "$1"
}

T0=$(date +%s)
for m in "${MODS[@]}"; do
  t1=$(date +%s)
  if [ ! -d "$BACKEND/$m" ]; then echo "$m 폴더없음" >> "$OUT/_errors.txt"; continue; fi
  ( cd "$BACKEND/$m" && env -i \
      HOME="$HOME" PATH="$PATH" USER="${USER:-}" LOGNAME="${LOGNAME:-}" TMPDIR="${TMPDIR:-/tmp}" \
      ${JAVA_HOME:+JAVA_HOME="$JAVA_HOME"} ${GRADLE_USER_HOME:+GRADLE_USER_HOME="$GRADLE_USER_HOME"} ${CLAUDE_PID:+CLAUDE_PID="$CLAUDE_PID"} \
      ${DFLOW_HEAVY_DIR:+DFLOW_HEAVY_DIR="$DFLOW_HEAVY_DIR"} ${DFLOW_HEAVY_SLOTS:+DFLOW_HEAVY_SLOTS="$DFLOW_HEAVY_SLOTS"} DMES_TEST_SLOTS="$TEST_SLOTS" \
      LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 TERM=dumb \
      ../gradlew -q --max-workers=2 --console=plain --continue --no-configuration-cache ${DUMP_GRADLE_ARGS:-} \
        -I "$HERE/dump-deps.init.gradle" -I "$HERE/dump-settings.init.gradle" \
        -Ddump.out="$OUT" -Ddump.mod="$m" -Ddump.repo="$REPO" \
        dumpDepsAll dumpSettings ) > "$LOGS/$m.stdout" 2> "$LOGS/$m.stderr"
  rc=$?
  if [ $rc -ne 0 ]; then
    echo "$m gradle 종료코드 $rc" >> "$OUT/_errors.txt"
    grep -E "Execution failed for task|What went wrong" -A1 "$LOGS/$m.stderr" | grep -v -E '^(--|\* What went wrong:)$' \
      | sed "${SED_ARGS[@]}" | sed "s|^|$m  |" | sort -u >> "$OUT/_errors.txt"
  fi
  if [ -f "$OUT/$m/_projects.txt" ]; then
    sed "s|^|$m |" "$OUT/$m/_projects.txt" >> "$OUT/_projects.txt"
    # 누락 검사 — 프로젝트는 있으나 settings·configurations·buildEnvironment 파일이 없는 조합
    while read -r p; do
      pn=$(echo "$p" | sed -e 's/^://' -e 's/:/_/g'); [ -z "$pn" ] && pn=_root
      for f in "settings/$pn.txt" "configurations/$pn.txt" "buildEnvironment/$pn.txt" "deps/$pn/_resolvable-configurations.txt"; do
        [ -f "$OUT/$m/$f" ] || echo "$m $p 누락: $f" >> "$OUT/_errors.txt"
      done
      if [ -f "$OUT/$m/deps/$pn/_resolvable-configurations.txt" ]; then
        while read -r c; do
          [ -z "$c" ] && continue
          [ -f "$OUT/$m/deps/$pn/$c.txt" ] || echo "$m $p 누락: deps/$pn/$c.txt" >> "$OUT/_errors.txt"
        done < "$OUT/$m/deps/$pn/_resolvable-configurations.txt"
      fi
    done < "$OUT/$m/_projects.txt"
  else
    echo "$m 프로젝트 목록 없음(구성 단계 실패?)" >> "$OUT/_errors.txt"
  fi
  echo "$m $(( $(date +%s) - t1 ))s rc=$rc" >> "$LOGS/_timing.txt"
done

# 경로 치환(전 파일) · 해석 실패·오류 표시 수집
#   ' FAILED'  DependencyReportTask 가 못 푼 의존성에 붙인다
#   '!ERROR'   dump-settings 의 safe{} 가 잡은 예외
#   '<error '  dump-settings 의 render/taskDeps 가 잡은 예외(값 자리에 들어간다) — 양쪽이 같은 오류면 diff 0 이 되므로 반드시 오류로 센다
ERR_RE=' FAILED$|^!ERROR|<error '
find "$OUT" -type f -name '*.txt' | while read -r f; do rewrite_paths "$f"; done
grep -rl -E "$ERR_RE" "$OUT" --include='*.txt' 2>/dev/null | grep -v '/_errors.txt$' | sort | while read -r f; do
  echo "해석 실패/오류 표시: ${f#$OUT/} ($(grep -c -E "$ERR_RE" "$f")줄)" >> "$OUT/_errors.txt"
  grep -E "$ERR_RE" "$f" | cut -c1-300 | sed 's/^/    /' | head -5 >> "$OUT/_errors.txt"
done
sort -o "$OUT/_projects.txt" "$OUT/_projects.txt"

echo "총 $(( $(date +%s) - T0 ))s — 모듈 ${#MODS[@]}, 프로젝트 $(wc -l < "$OUT/_projects.txt" | tr -d ' '), 의존성 파일 $(find "$OUT" -path '*/deps/*' -name '*.txt' ! -name '_*' | wc -l | tr -d ' '), 오류 $(wc -l < "$OUT/_errors.txt" | tr -d ' ')줄 (로그: $LOGS)"
# 끝까지 돌았다는 표식 — compare.sh 는 이 줄이 없으면(끊긴 덤프) "동일" 판정을 거부한다.
echo "finished    $(date '+%Y-%m-%d %H:%M:%S') errors=$(wc -l < "$OUT/_errors.txt" | tr -d ' ')" >> "$LOGS/_meta.txt"
[ -s "$OUT/_errors.txt" ] && exit 1
exit 0
