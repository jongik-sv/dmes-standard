#!/bin/bash
# P2: 콜드 기동 로그에서 공유 includeBuild compileJava 실행 횟수를 센다(결정적, p1 콜드 로그 재사용, 실행 없음).
# 사용: p2_count.sh [로그 접두 $RESULTS/p1_cold]   출력 CSV: $RESULTS/p2.csv
cd "$(dirname "$0")" && . ./lib.sh
PREFIX="${1:-$RESULTS/p1_cold}"
BUILDS="${P2_BUILDS:-cactus-core mcm-core maru-mdm-engine}"
CSV="$RESULTS/p2.csv"; rm -f "$CSV"
found=0
for f in "$PREFIX"_*_r*.log; do
  [ -f "$f" ] || continue; found=1
  b="$(basename "$f" .log)"          # p1_cold_A_r1
  t="$(echo "$b" | sed -E 's/^p1_cold_([AB])_r([0-9]+)$/\1/')"; r="$(echo "$b" | sed -E 's/^p1_cold_([AB])_r([0-9]+)$/\2/')"
  # ANSI 색 제거 후 "Task :<빌드>...:compileJava [상태]" 줄만 뽑는다.
  clean="$(perl -pe 's/\e\[[0-9;]*m//g' "$f")"
  fromcache="$(echo "$clean" | grep -cE 'Task :.*:compileJava FROM-CACHE')"
  csv_add "$CSV" "$r" "$t" cold from_cache_lines_all_tasks "$fromcache" 0 0
  for bld in $BUILDS; do
    lines="$(echo "$clean" | grep -E "Task :${bld}(:[^ ]+)?:compileJava( [A-Z-]+)?\$")"
    tot=$(echo "$lines" | grep -c . ); exe=$(echo "$lines" | grep -cE 'compileJava$'); [ -z "$lines" ] && { tot=0; exe=0; }
    csv_add "$CSV" "$r" "$t" cold "${bld}_compileJava_executed" "$exe" 0 0
    csv_add "$CSV" "$r" "$t" cold "${bld}_compileJava_lines" "$tot" 0 0
    # 선빌드([be-build]) 와 모듈별([be-<모듈>]) 로 나눠 센다.
    for tag in be-build mls mqc mpp mpn mdm mcm analog; do
      pat="be-${tag#be-}"; [ "$tag" = be-build ] && pat="be-build"
      n=$(echo "$lines" | grep -E "^\[?${pat}\]?[ :]" | grep -cE 'compileJava$')
      [ "$n" -gt 0 ] && csv_add "$CSV" "$r" "$t" cold "${bld}_executed_by_${pat}" "$n" 0 0
    done
  done
  # 모든 compileJava 실행 줄 수(선빌드 단계 총계)
  pre=$(echo "$clean" | grep -E '^\[?be-build\]?' | grep -E 'Task :[^ ]*compileJava$' | grep -c .)
  csv_add "$CSV" "$r" "$t" cold prebuild_compileJava_executed_all "$pre" 0 0
done
[ "$found" = 1 ] || die "콜드 로그가 없다: p1_boot.sh cold 먼저 실행"
echo "--- 결과(회차별 원자료)"; column -s, -t "$CSV"
echo "주의: from_cache_lines_all_tasks > 0 이면 빌드 캐시가 꺼지지 않은 것이므로 콜드 조건이 무효다."
echo "주의: 접두 형식(\`[be-mcm]\` 등)이 로그와 다르면 *_by_* 행이 비므로 로그 한두 줄을 보고 정규식을 고친다."
