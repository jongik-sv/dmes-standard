#!/bin/bash
# 사용: compare.sh <A폴더> <B폴더> [--ignore-file <패턴파일>]... [-I <정규식>]... [--flat] [--show-ignored] [-q]
#
# dump-deps.sh 가 만든 두 덤프 폴더를 비교한다. 출력: 내용이 다른 파일 수, 한쪽에만 있는 파일, 파일별 바뀐 줄 수,
# (허용 차이를 줬으면) 패턴별로 걸러낸 줄 수(A / B) — 숨긴 줄이 몇 줄인지 늘 보인다.
#
#   --ignore-file F  허용 차이 패턴 파일(여러 번 줄 수 있다). 맞는 "줄만" 양쪽에서 빼고 비교한다(diff -I 처럼 덩어리 단위 아님).
#                    형식(한 줄에 하나, POSIX ERE — \d 대신 [0-9], 비교는 LC_ALL=C 바이트 단위):
#                      # 주석, 빈 줄            무시
#                      <줄 정규식>              모든 파일에 적용
#                      @<경로 정규식> <줄 정규식>  덤프 폴더 기준 상대경로(예: caravan-hub/settings/_root.txt)가 맞는 파일에만.
#                                               첫 공백이 경로와 줄 정규식을 가른다(경로 정규식에 공백 금지).
#                    한 줄에 여러 패턴이 맞으면 먼저 적힌 패턴에 센다.
#   -I <정규식>      패턴 하나를 명령줄로 더한다(모든 파일, --ignore-file 과 같은 방식).
#   --flat           deps/·buildEnvironment/ 아래 파일을 트리 대신 "줄 집합"으로 비교한다 — 트리 기호(+--- \--- |)와 끝의 (*) 를
#                    떼고 정렬·중복 제거. 선언 순서만 바뀐 경우(③ convention plugin 으로 공통 의존성을 옮길 때 등)를 해석 결과
#                    차이와 가르는 용도다. 허용 패턴은 평탄화 "전" 원래 줄에 적용된다.
#   --show-ignored   걸러낸 줄 전체를 파일·패턴 번호와 함께 출력한다.
#   -q               diff 본문은 빼고 요약만.
#
# 종료코드: 0 = 동일(허용 차이 제외 후)
#           1 = 다름
#           2 = 사용 오류·패턴 오류·diff 오류
#           3 = 내용은 동일하나 덤프에 구멍이 있을 수 있어 "동일" 판정 불가 — 다음 중 하나라도 해당:
#               어느 쪽 _errors.txt 가 비어 있지 않거나 없음 / 원본 트리에 ' FAILED'·'!ERROR'·'<error ' 줄이 있음
#               (허용 패턴으로 숨길 수 없다) / 옆 <폴더>.logs/_meta.txt 에 'finished' 줄이 없음(끊긴 덤프)
#           실제 차이가 있으면 위 경고를 출력하되 종료코드는 1.
#  옆 <폴더>.logs/_meta.txt 가 양쪽에 있으면 A.HEAD = B.HEAD^ 인지, gradle·java-home·guh-file·dflow-agent·tools·dirty·test-slots 줄이 같은지도 경고로 알린다.
set -u
export LC_ALL=C

usage() { sed -n '2,3p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

PATFILES=(); INLINE=(); QUIET=0; FLAT=0; SHOW=0; POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --ignore-file) [ $# -ge 2 ] || usage; PATFILES+=("$2"); shift 2 ;;
    --ignore-file=*) PATFILES+=("${1#*=}"); shift ;;
    -I) [ $# -ge 2 ] || usage; INLINE+=("$2"); shift 2 ;;
    --flat) FLAT=1; shift ;;
    --show-ignored) SHOW=1; shift ;;
    -q) QUIET=1; shift ;;
    -h|--help) usage ;;
    --) shift; POS+=("$@"); break ;;
    -*) echo "알 수 없는 옵션 $1" >&2; exit 2 ;;
    *) POS+=("$1"); shift ;;
  esac
done
[ ${#POS[@]} -eq 2 ] || usage
A="${POS[0]%/}"; B="${POS[1]%/}"
[ -d "$A" ] && [ -d "$B" ] || { echo "폴더가 아니다: $A 또는 $B" >&2; exit 2; }

TMP="$(mktemp -d -t dumpcompare)" || exit 2
trap 'rm -rf "$TMP"' EXIT

# 패턴 모으기 — 주석·빈 줄·CR 제거. 한 파일로 합쳐 번호를 매긴다.
PATS="$TMP/patterns"; : > "$PATS"
for pf in ${PATFILES[@]+"${PATFILES[@]}"}; do
  [ -f "$pf" ] || { echo "패턴 파일 없음: $pf" >&2; exit 2; }
  sed -e 's/\r$//' "$pf" | grep -v -E '^[[:space:]]*(#|$)' >> "$PATS"
done
for re in ${INLINE[@]+"${INLINE[@]}"}; do printf '%s\n' "$re" >> "$PATS"; done
NPAT=$(wc -l < "$PATS" | tr -d ' ')
if grep -n -E '^@[^ ]*$' "$PATS" >/dev/null; then
  echo "패턴 오류 — '@<경로 정규식> <줄 정규식>' 에 공백·줄 정규식이 없다:" >&2; grep -n -E '^@[^ ]*$' "$PATS" >&2; exit 2
fi

# 한 트리를 복사하며 패턴에 맞는 줄을 뺀다. 걸러낸 줄은 <side>.ign 에 "번호<TAB>경로<TAB>줄" 로 남긴다.
filter_tree() { # $1=원본 $2=사본 $3=걸러낸 줄 기록
  local src="$1" dst="$2" ign="$3"
  mkdir -p "$dst"; : > "$ign"
  ( cd "$src" && find . -type d ) | while IFS= read -r d; do mkdir -p "$dst/$d"; done
  ( cd "$src" && find . -type f | sed 's|^\./||' | sort ) > "$dst.files"
  awk -v src="$src" -v dst="$dst" -v pf="$PATS" -v ign="$ign" '
    BEGIN {
      n = 0
      while ((getline l < pf) > 0) {
        n++
        if (substr(l, 1, 1) == "@") { r = substr(l, 2); k = index(r, " "); scope[n] = substr(r, 1, k - 1); re[n] = substr(r, k + 1) }
        else { scope[n] = ""; re[n] = l }
      }
      close(pf)
    }
    {
      path = $0; f = src "/" path; out = dst "/" path
      printf "" > out
      while ((getline line < f) > 0) {
        hit = 0
        for (i = 1; i <= n; i++) if ((scope[i] == "" || path ~ scope[i]) && line ~ re[i]) { hit = i; break }
        if (hit) print hit "\t" path "\t" line > ign
        else print line > out
      }
      close(f); close(out)
    }' "$dst.files" || return 2
}

filter_tree "$A" "$TMP/A" "$TMP/A.ign" || { echo "패턴 적용 실패(정규식 오류?)" >&2; exit 2; }
filter_tree "$B" "$TMP/B" "$TMP/B.ign" || { echo "패턴 적용 실패(정규식 오류?)" >&2; exit 2; }

if [ $FLAT -eq 1 ]; then
  for side in A B; do
    ( cd "$TMP/$side" && find . -type f \( -path '*/deps/*' -o -path '*/buildEnvironment/*' \) ) | while IFS= read -r f; do
      sed -E -e 's/^[|+\\ -]+//' -e 's/ \(\*\)$//' "$TMP/$side/$f" | sort -u > "$TMP/$side/$f.flat" && mv "$TMP/$side/$f.flat" "$TMP/$side/$f"
    done
  done
fi

echo "A = $A"
echo "B = $B"
[ $FLAT -eq 1 ] && echo "(--flat: deps/·buildEnvironment/ 는 트리 기호를 뗀 정렬 줄 집합으로 비교)"

if [ "$NPAT" -gt 0 ]; then
  echo "--- 허용 차이로 걸러낸 줄 (패턴별 A / B) ---"
  i=0; zero=0
  while IFS= read -r p; do
    i=$((i + 1))
    ca=$(awk -F'\t' -v i=$i '$1 == i' "$TMP/A.ign" | wc -l | tr -d ' ')
    cb=$(awk -F'\t' -v i=$i '$1 == i' "$TMP/B.ign" | wc -l | tr -d ' ')
    printf '  [%d] A %d / B %d   %s\n' "$i" "$ca" "$cb" "$p"
    [ "$ca" -eq 0 ] && [ "$cb" -eq 0 ] && zero=$((zero + 1))
  done < "$PATS"
  ta=$(wc -l < "$TMP/A.ign" | tr -d ' '); tb=$(wc -l < "$TMP/B.ign" | tr -d ' ')
  echo "  합계: A ${ta}줄 / B ${tb}줄 걸러냄"
  [ $zero -gt 0 ] && echo "  주의: 한 줄도 맞지 않은 패턴 ${zero}개 — 오타이거나 형식이 바뀌었을 수 있다"
  if [ $SHOW -eq 1 ]; then
    echo "--- 걸러낸 줄 전체 (A) ---"; sed 's/^/  /' "$TMP/A.ign"
    echo "--- 걸러낸 줄 전체 (B) ---"; sed 's/^/  /' "$TMP/B.ign"
  fi
fi

# 판정 불가 조건 — 원본 트리 기준(허용 패턴 적용 전)이라 패턴으로 숨길 수 없다.
ERR_RE=' FAILED$|^!ERROR|<error '
errs=0
for side in "$A" "$B"; do
  if [ ! -f "$side/_errors.txt" ]; then echo "주의: $side/_errors.txt 없음 — dump-deps.sh 산출물이 아닐 수 있다"; errs=1
  elif [ -s "$side/_errors.txt" ]; then echo "주의: $side/_errors.txt 가 비어 있지 않다($(wc -l < "$side/_errors.txt" | tr -d ' ')줄):"; sed 's/^/    /' "$side/_errors.txt" | head -20; errs=1
  fi
  hits=$(grep -rc -E "$ERR_RE" "$side" 2>/dev/null | grep -v '/_errors\.txt:' | grep -v ':0$')
  if [ -n "$hits" ]; then
    echo "주의: $side 에 오류 표시 줄(' FAILED'·'!ERROR'·'<error ')이 있다 — 파일:줄수"
    printf '%s\n' "$hits" | sed "s|^$side/|    |" | head -20; errs=1
  fi
  meta="${side}.logs/_meta.txt"
  if [ -f "$meta" ] && ! grep -q '^finished ' "$meta"; then
    echo "주의: $meta 에 finished 줄이 없다 — 덤프가 끝까지 돌지 않았다(끊김·중단)"; errs=1
  fi
done

# 실행 메타 대조(경고만) — README 판정 절차 1·2
MA="${A}.logs/_meta.txt"; MB="${B}.logs/_meta.txt"
if [ -f "$MA" ] && [ -f "$MB" ]; then
  mval() { grep "^$2 " "$1" | sed -E "s/^$2 +//"; }
  ha=$(mval "$MA" HEAD); hbp=$(mval "$MB" 'HEAD\^')
  if [ "$ha" = "$(mval "$MB" HEAD)" ]; then echo "참고: A·B 가 같은 커밋($ha) — 결정성 확인용 비교"
  elif [ "$ha" != "$hbp" ]; then echo "경고: A.HEAD($ha) ≠ B.HEAD^($hbp) — A 가 B 의 바로 앞 커밋이 아니다"
  fi
  for k in gradle java-home guh-file dflow-agent tools dirty test-slots; do
    [ "$(grep "^$k " "$MA")" = "$(grep "^$k " "$MB")" ] || echo "경고: _meta.txt 의 '$k' 줄이 다르다 — A: $(grep "^$k " "$MA" | tr '\n' ' ') / B: $(grep "^$k " "$MB" | tr '\n' ' ')"
  done
fi

diff -r "$TMP/A" "$TMP/B" > "$TMP/diff.out"; rc=$?
# 사본 경로를 A:/B: 로 바꿔 읽기 쉽게
sed -e "s|$TMP/A: |A:./: |g" -e "s|$TMP/B: |B:./: |g" -e "s|$TMP/A/|A:|g" -e "s|$TMP/B/|B:|g" -e "s|$TMP/A|A:|g" -e "s|$TMP/B|B:|g" "$TMP/diff.out" > "$TMP/diff.txt"
mv "$TMP/diff.txt" "$TMP/diff.out"
if [ $rc -gt 1 ]; then cat "$TMP/diff.out"; echo "diff 오류(rc=$rc)" >&2; exit 2; fi

nfiles=$(wc -l < "$TMP/A.files" | tr -d ' ')
if [ $rc -eq 0 ]; then
  if [ $errs -ne 0 ]; then
    echo "내용 동일(${nfiles}개 파일) — 그러나 위 '주의' 항목(오류 표시·_errors.txt·끊긴 덤프) 때문에 판정 불가 (종료코드 3)"; exit 3
  fi
  echo "동일: ${nfiles}개 파일, 허용 차이 외 차이 0"; exit 0
fi

only=$(grep -c '^Only in ' "$TMP/diff.out")
differ=$(grep -c '^diff -r' "$TMP/diff.out")
echo "다름: 내용이 다른 파일 ${differ}개, 한쪽에만 있는 파일 ${only}개"
if [ "$differ" -gt 0 ]; then
  echo "--- 파일별 바뀐 줄 수 (-A쪽 / +B쪽) ---"
  awk '
    /^diff -r/ { if (f != "") printf "  %-90s -%d +%d\n", f, m, p; f = $NF; sub(/^B:/, "", f); m = 0; p = 0; next }
    /^< / { m++ } /^> / { p++ }
    END { if (f != "") printf "  %-90s -%d +%d\n", f, m, p }
  ' "$TMP/diff.out"
fi
[ "$only" -gt 0 ] && { echo "--- 한쪽에만 있는 파일 ---"; grep '^Only in ' "$TMP/diff.out" | sed 's/^/  /'; }
if [ $QUIET -eq 0 ]; then
  echo "--- diff 본문 ---"
  cat "$TMP/diff.out"
fi
exit 1
