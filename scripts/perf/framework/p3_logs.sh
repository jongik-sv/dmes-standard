#!/bin/bash
# P3 호출당 로그 줄 수 — mdm DmeOasisHttpTest 를 A(기준)·B(변경) 에서 1회씩 돌려 결과 XML 의 system-out 로거별 줄 수를 센다.
# 사용: ./p3_logs.sh
# 산출: $RESULTS/p3_logs.csv (지표 logger_<이름>_lines, methodinvoker_total, methodinvoker_<LEVEL>) + $RESULTS/p3_<A|B>_system-out.txt
source "$(dirname "$0")/lib.sh"
CSV="$RESULTS/p3_logs.csv"
MDM_REL="src/backend/mdm"
trap pair_wt_remove EXIT
pair_wt_add || exit 1

count_xml() {  # count_xml <대상> <mdm 디렉터리>
  local T="$1" dir="$2" xml out ld; ld=$(load1)
  xml=$(ls "$dir"/api/build/test-results/test/TEST-*DmeOasisHttpTest*.xml 2>/dev/null | head -1)
  [ -z "$xml" ] && xml=$(find "$dir" -path '*test-results*' -name 'TEST-*DmeOasisHttpTest*.xml' | head -1)
  if [ -z "$xml" ]; then echo "[p3] $T: 결과 XML 없음" >&2; return 1; fi
  out="$RESULTS/p3_${T}_system-out.txt"
  # <system-out> ~ </system-out> 사이만 추출
  python3 - "$xml" "$out" <<'PY'
import sys,re
x=open(sys.argv[1],encoding='utf-8',errors='replace').read()
m=re.findall(r'<system-out><!\[CDATA\[(.*?)\]\]></system-out>',x,re.S)
open(sys.argv[2],'w').write("\n".join(m))
PY
  # 로그 줄은 Spring Boot 형식: "2026-10-04T10:23:37.149+09:00  INFO 96972 --- [mdm] [    Test worker] c.d.o.logger.Name : msg"
  # 로거 이름은 %logger 축약형이라(패키지 oasis.methodinvoker 가 c.d.o.m. 으로 줄어 이름에 안 남는다) methodinvoker 는
  # 실제 로거 클래스명 StrictMethodResolver(54줄)·TypeMatchableMethodArgumentBinder(162줄) 로 센다(합 216, 1차 기록과 대조).
  grep -E '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T' "$out" \
    | sed -E 's/^[^ ]+ +([A-Z]+) [0-9]+ --- \[[^]]*\] \[[^]]*\] ([^ ]+) *:.*/\2 \1/' \
    | awk '{n[$1]++; if(tolower($1) ~ /methodinvoker|strictmethodresolver|typematchablemethodargumentbinder/){tot++; lv[$2]++}} END{for(k in n) print "logger_" k "_lines," n[k]; print "methodinvoker_total," tot+0; for(l in lv) print "methodinvoker_" l "," lv[l]}' \
    | while IFS=, read -r metric val; do csv_add "$CSV" 1 "$T" "$metric" "$val" "$ld"; done
  echo "[p3] $T 집계 완료 — $xml"
}

run_one() {  # run_one <워크트리> <대상>
  local dir="$1/$MDM_REL"
  rm -f "$dir"/api/build/test-results/test/TEST-*DmeOasisHttpTest*.xml   # 이전 실행 결과가 섞이지 않게(빌드 산출물)
  GRADLEW=../gradlew run_gradle "$dir" :api:test --tests '*DmeOasisHttpTest' --rerun -i > "$RESULTS/p3_$2.log" 2>&1 || echo "[p3] $2 gradle 실패/일부 실패 — 로그 확인" >&2
  count_xml "$2" "$dir"
}
run_one "$BASE_WT" A
run_one "$CHANGE_WT" B
python3 "$PERF_DIR/summarize.py" "$CSV" --single --base A
