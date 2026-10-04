#!/bin/bash
# P1 캐시 적중 처리량 — A(기준) / B(변경) 를 번갈아 ROUNDS 회 잰다.
# 사용: ./p1_cache.sh [ROUNDS=3]     (기준·변경 측정 워크트리는 이 스크립트가 만들고 끝에 제거한다)
# 산출: $RESULTS/p1_cache.csv   지표 t{스레드}_min / _max / _mid (Mops/s)  — mid = (min+max)/2
#  - A: 기준 워크트리(SizeBaseCacheService)에서 하네스의 old(SizeBase) 열을 쓴다. (기준에서는 new 열도 같은 SizeBase 구현이다)
#  - B: 변경 워크트리의 new(Concurrent) 열.  보조로 B 의 old 열을 B_old 대상으로 함께 기록한다.
source "$(dirname "$0")/lib.sh"
ROUNDS="${1:-3}"
[ "${DRY:-}" = 1 ] && ROUNDS=1
CSV="$RESULTS/p1_cache.csv"
PKG="src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/oasis/provider"
FILES="CacheHitThroughputManualTest.java FakeServices.java"
COPIED=""   # 측정용으로 임시 복사한 파일(끝나면 지운다)

cleanup() {
  for f in $COPIED; do rm -f "$f"; done
  rmdir "$BASE_WT/$PKG" 2>/dev/null
  pair_wt_remove
}
trap cleanup EXIT

pair_wt_add || exit 1
# 하네스 두 파일은 저장소 시험 소스에 이미 있다. 변경 쪽은 그대로 쓰고, 기준(또는 파일이 없는 쪽)에는 변경 워크트리에서 복사한다.
for w in "$BASE_WT" "$CHANGE_WT"; do
  mkdir -p "$w/$PKG"
  for f in $FILES; do
    if [ -f "$w/$PKG/$f" ]; then continue; fi
    if [ -f "$CHANGE_WT/$PKG/$f" ]; then src="$CHANGE_WT/$PKG/$f"; else src="$REPO_DIR/$PKG/$f"; fi
    [ -f "$src" ] || { echo "[p1] 하네스 원본 없음: $f" >&2; exit 1; }
    cp "$src" "$w/$PKG/$f"; COPIED="$COPIED $w/$PKG/$f"   # 측정용 임시 복사 — 커밋 금지
  done
done

parse() {  # parse <로그> <회차> <대상 old|new 열 선택 old/new> <기록 대상 이름> <load>
  local log="$1" round="$2" col="$3" name="$4" ld="$5"
  grep '\[cache-bench\]' "$log" | while read -r line; do
    t=$(echo "$line" | sed -E 's/.*threads=([0-9]+).*/\1/')
    if [ "$col" = old ]; then rng=$(echo "$line" | sed -E 's/.*old\(SizeBase\) ([0-9.]+~[0-9.]+) Mops.*/\1/')
    else rng=$(echo "$line" | sed -E 's/.*new\(Concurrent\) ([0-9.]+~[0-9.]+) Mops.*/\1/'); fi
    mn=${rng%~*}; mx=${rng#*~}
    mid=$(python3 -c "print(round(($mn+$mx)/2,3))")
    csv_add "$CSV" "$round" "$name" "t${t}_min" "$mn" "$ld"
    csv_add "$CSV" "$round" "$name" "t${t}_max" "$mx" "$ld"
    csv_add "$CSV" "$round" "$name" "t${t}_mid" "$mid" "$ld"
  done
}

run_one() {  # run_one <worktree> <로그>
  CACTUS_CACHE_BENCH=1 run_gradle "$1/src/backend/cactus-core" :test --tests '*CacheHitThroughputManualTest' --rerun -i > "$2" 2>&1
}

for r in $(seq 1 "$ROUNDS"); do
  for T in A B; do
    ld=$(load1)
    log="$RESULTS/p1_${T}_r${r}.log"
    if [ "$T" = A ]; then run_one "$BASE_WT" "$log"; else run_one "$CHANGE_WT" "$log"; fi
    if ! grep -q '\[cache-bench\]' "$log"; then echo "[p1] $T r$r: [cache-bench] 줄 없음 — $log 확인" >&2; continue; fi
    if [ "$T" = A ]; then parse "$log" "$r" old A "$ld"; else parse "$log" "$r" new B "$ld"; parse "$log" "$r" old B_old "$ld"; fi
    echo "[p1] round $r target $T 완료 (load1=$ld)"
  done
done
python3 "$PERF_DIR/summarize.py" "$CSV" --base A
