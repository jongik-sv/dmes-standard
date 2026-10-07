#!/bin/sh
# /dflow-dev 게이트 기준선: 콘솔에 테스트 총수가 안 나오는 러너(Gradle·Maven)의 JUnit XML 결과를 합산한다.
#
#   junit-count.sh [--failed-file <경로>] [--since <epoch 초 | 파일>] [<폴더>…]
#
# 왜: gradle testAll 콘솔 출력에는 총수가 없다. 한 워커가 json 의 tests 가 null 인 채 막혔고, build/test-results 의
# TEST-*.xml 을 perl 로 즉석 합산해 3220 을 구했다(2026-09-26). 그 임시변통을 스크립트로 고정한다.
#
# 찾는 파일: 각 <폴더> 아래(하위 모듈 깊이 제한 없음) 의
#   build/test-results/*/TEST-*.xml   (Gradle. */ 는 test·testDebugUnitTest 같은 태스크 이름)
#   target/surefire-reports/TEST-*.xml, target/failsafe-reports/TEST-*.xml   (Maven)
# node_modules·.git·.gradle·.claude/worktrees 아래는 내려가지 않는다. <폴더> 생략 시 현재 폴더.
# 모듈 게이트처럼 일부 모듈만 돌린 명령은 그 모듈 폴더만 넘긴다 — 리포 최상위를 넘기면 이번에 안 돈 다른 모듈의
# 오래된 결과까지 섞인다. 기준선과 게이트는 같은 폴더 인자로 센다(다른 인자를 쓰면 차분 비교가 두 다른 범위를
# 비교하는 셈이 된다).
# 주의: 한 결과 폴더(build/test-results/<태스크>/)에 이 명령과 다른 명령(예: testAll 과 별도로 도는 마이그레이션
# 시험)이 같은 태스크 이름으로 XML 을 남기면, 나중 센 쪽에 앞선 명령의 결과가 함께 잡힐 수 있다. 이 스크립트는
# 태스크 실행 명령을 구분하지 않는다 — 겹치면 리포의 게이트 명령 설계(태스크 분리)로 푼다.
#
# 합산: 각 XML 의 <testsuite>(또는 <testsuites> 의 자식들) tests·failures·errors·skipped 속성을 전부 더해
#   JUNIT_SUMMARY tests=<N> failures=<F> errors=<E> skipped=<S> files=<K>   (stdout, 정확히 한 줄. K=파싱에 쓴 파일 수)
# XML 을 하나도 못 찾으면 stdout 에 `JUNIT_SUMMARY_NONE <폴더들>` 을 내고 exit 1. 찾은 XML 이 전부 깨졌거나(JUNIT_SKIP)
# --since 로 전부 빠지면(JUNIT_STALE) tests=0 files=0 과 exit 0 으로 끝난다 — "찾았지만 셀 게 없다"와 "아예 없다"를
# 구분한 것이지만, 이 값을 그대로 기준선으로 적으면 "총수 미감소" 판정이 항상 통과해버린다. 호출하는 쪽(오케스트레이터)
# 이 files=0 을 보면 원인을 밝히고 기준선으로 적지 않는다.
# --failed-file <경로>: failure·error 자식이 있는 testcase 를 <classname>.<name> 형식으로 한 줄씩, 정렬·중복 제거해 쓴다.
#   baseline.sh note 의 --failed-file 에 그대로 넣을 수 있다.
#
# 결과 XML 은 그 폴더에서 마지막으로 돈 Test 태스크의 것이다. 실측(2026-09-26, GRADLE_USER_HOME 임시·--no-daemon,
# JUnit 5 최소 프로젝트, Gradle 9.3.1)으로 관찰한 것:
#   (a) 테스트 클래스를 지우고 같은 test 태스크를 다시 돌리면(코드가 바뀌어 UP-TO-DATE 가 아니다) 지운 클래스의 옛
#       TEST-*.xml 이 함께 사라졌다 — 옛 XML 이 남아 총수가 부풀지 않았다. (내부 동작까지는 확인하지 않았다. Gradle
#       공식 문서가 설명하는 "선언된 출력을 이번 실행이 만든 파일 집합으로 맞추고 나머지를 청소한다"는 동작과
#       일치해 보인다는 관찰이다.)
#   (b) build/test-results 를 통째로 지우고 코드 변경 없이 다시 돌리면, test 태스크가 UP-TO-DATE 로 건너뛰지 않고
#       다시 실행해 XML 을 되살렸다. "지웠는데 건너뛰어 총수가 준다" 경우는 재현되지 않았다.
#   (c) 코드·산출물 변경 없이 다시 돌리면 UP-TO-DATE 이고 XML 은 그대로 남았다(위 문서의 기존 규칙과 일치 — 결과가
#       바뀌지 않았다는 뜻이므로 합산에 포함하는 것이 맞다).
#   (d, 별도 관찰) `--tests <필터>` 로 일부 클래스만 골라 다시 돌리면, 필터 밖 클래스의 옛 XML 도 함께 사라졌다 —
#       그 직후 세면 필터 밖 클래스가 총수에서 빠져 실제보다 적게 나온다. 그러므로 **`--tests` 처럼 일부만 고른
#       필터 실행 직후에는 세지 않는다. 필터 없는(모듈 전체) 게이트 명령이 끝난 직후에만 센다.**
# (a)(c) 는 옛 결과가 남아 총수가 부푸는 경우가 아니었고 (b) 는 결과가 사라져 총수가 주는 경우가 아니었으므로, 이
# 둘을 자동으로 가려내는 로직(폴더별 최신 mtime 비교, "폴더가 비었으면 강제 재실행" 안내)은 넣지 않았다. 그래도 이
# 실측이 못 덮는 경우(빌드 캐시·원격 캐시를 쓰는 리포, 외부에서 XML 을 손으로 건드린 경우 등)를 위해 --since 를
# 수동 escape hatch 로 둔다: 그 시각보다 오래된 XML 은 stderr 에 JUNIT_STALE <파일> 을 내고 합산에서 뺀다(파일을
# 지우지는 않는다). 기본은 필터링 없음(모두 센다) — UP-TO-DATE 로 건너뛴 모듈의 이전 결과를 빼면 오히려 총수가
# 부당하게 준다.
#
# 파싱은 node 로 한다(같은 폴더의 junit-count.mjs — 외부 의존성 없는 XML 파서를 안에 갖고 있다. python 은 쓰지 않는다. 윈도우 Git Bash
# 에도 node 는 있다). node 가 없으면 stdout 에 JUNIT_SUMMARY_NONODE 를 내고 exit 2(예전 python 판의 JUNIT_SUMMARY_NOPY 자리).
# 깨진 XML 은 건너뛰고 stderr 에 JUNIT_SKIP <파일> 을 낸다(합산 계속). 이 파일은 인자 해석·XML 찾기·정렬만 하고 합산은 .mjs 가 한다.
# 단, 파일 내용이 아니라 이 도구의 한계 때문에 못 읽는 XML(약 512MiB 글자·2GiB 를 넘는 크기, node 가 못 푸는 인코딩 선언)은 건너뛰지 않는다 —
# 합계가 조용히 줄기 때문이다. 그때는 stdout 에 아무것도 내지 않고 stderr 에 `JUNIT_ABORT <파일> <사유>` 한 줄을 쓰고 exit 1 이다(센 것으로 치지 않는다).
# 목록 정렬은 로케일 영향을 받지 않게 LC_ALL=C 로 고정한다(JUNIT_SKIP·JUNIT_STALE 의 출력 순서가 PC 마다 같도록).
# 윈도우 Git Bash: find 가 낸 `/c/proj/…`·`/tmp/…` 는 파일 안에 적힌 글이라 MSYS 가 인자처럼 바꿔 주지 않는다. 그대로 node.exe 에 읽히면
# 모두 못 읽어 전부 JUNIT_SKIP 이 되므로, cygpath 가 있으면 같은 목록을 `C:/…` 꼴로 바꾼 사본을 .mjs 에 함께 넘긴다(읽을 때만 쓰고 출력은
# 원래 경로 그대로). macOS·Linux 에는 cygpath 가 없어 이 길은 타지 않는다.
# 이전 python 판은 tests/golden/legacy/junit-count.legacy.sh 에 동결해 두었고 tests/junit-count.sh 가 그 출력과 한 글자씩 비교한다.
# POSIX sh 다(macOS·Linux·Git Bash). 배열·[[·PIPESTATUS 를 쓰지 않는다.
set -u

usage() {
  echo "usage: junit-count.sh [--failed-file <경로>] [--since <epoch 초 | 파일>] [<폴더>...]" >&2
  exit 2
}

FAILED_FILE=""
SINCE=""
roots=""
while [ $# -gt 0 ]; do
  case "$1" in
    --failed-file)
      [ $# -ge 2 ] || usage
      FAILED_FILE="$2"; shift 2 ;;
    --since)
      [ $# -ge 2 ] || usage
      SINCE="$2"; shift 2 ;;
    --)
      shift
      while [ $# -gt 0 ]; do roots="$roots$1
"; shift; done
      break ;;
    -*)
      usage ;;
    *)
      roots="$roots$1
"; shift ;;
  esac
done

if [ -z "$roots" ]; then
  roots=".
"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "JUNIT_SUMMARY_NONODE"
  exit 2
fi
here=$(cd "$(dirname "$0")" && pwd)

rootsfile=$(mktemp)
filelist=$(mktemp)
readlist=""
cleanup() { rm -f "$rootsfile" "$filelist" ${readlist:+"$readlist"}; }
trap cleanup EXIT INT TERM

printf '%s' "$roots" > "$rootsfile"
: > "$filelist"

while IFS= read -r root; do
  [ -n "$root" ] || continue
  find "$root" \
    \( -name node_modules -o -name .git -o -name .gradle -o -path '*/.claude/worktrees' \) -prune -o \
    -type f \( \
      -path '*/build/test-results/*/TEST-*.xml' \
      -o -path '*/target/surefire-reports/TEST-*.xml' \
      -o -path '*/target/failsafe-reports/TEST-*.xml' \
    \) -print
done < "$rootsfile" >> "$filelist"

LC_ALL=C sort -u "$filelist" -o "$filelist"

if [ ! -s "$filelist" ]; then
  roots_display=$(tr '\n' ' ' < "$rootsfile" | sed 's/[[:space:]]*$//')
  echo "JUNIT_SUMMARY_NONE $roots_display"
  exit 1
fi

if command -v cygpath >/dev/null 2>&1; then
  readlist=$(mktemp)
  cygpath -m -f "$filelist" > "$readlist" 2>/dev/null || { rm -f "$readlist"; readlist=""; }
fi

node "$here/junit-count.mjs" "$filelist" "$FAILED_FILE" "$SINCE" ${readlist:+"$readlist"}
exit $?
