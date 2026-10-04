#!/bin/bash
# P2 준비 — 대상별 워크트리를 만들고 analog api bootJar 를 빌드해 $RESULTS/jars/<라벨>.jar 로 복사한다. (max-workers=2, 선택 잠금·줄 세우기)
# 사용: [TARGETS="A:refactor-2026-10-base B:bb8ee036 C:HEAD"] ./p2_build.sh [--keep-worktrees]
# 워크트리는 jar 만 남기고 바로 제거한다. P2 측정이 끝날 때까지 두려면 --keep-worktrees (p2_cleanup.sh 가 제거한다).
source "$(dirname "$0")/lib.sh"
mkdir -p "$JARS"
KEEP=0; [ "$1" = "--keep-worktrees" ] && KEEP=1
# 실패로 끝나도 이번에 만든 워크트리를 치운다(--keep-worktrees 면 p2_cleanup.sh 가 치운다).
trap '[ "$KEEP" = 0 ] && targets_wt_remove' EXIT
targets_wt_add || exit 1
for t in $TARGETS; do
  l=$(target_label "$t"); r=$(target_ref "$t"); w=$(target_wt "$l" "$r")
  echo "[p2-build] $l ($r) @ $w → $($GIT -C "$w" rev-parse --short HEAD)"
  run_gradle "$w/src/backend/analog" :api:bootJar > "$RESULTS/p2_build_$l.log" 2>&1 || { echo "[p2-build] $l 빌드 실패 — $RESULTS/p2_build_$l.log" >&2; exit 1; }
  jar=$(ls "$w"/src/backend/analog/api/build/libs/*.jar | grep -v plain | head -1)
  cp "$jar" "$JARS/$l.jar"
  echo "$l,$r,$($GIT -C "$w" rev-parse HEAD)" >> "$RESULTS/p2_targets.txt"
done
echo "[p2-build] 완료: $(ls "$JARS")"
