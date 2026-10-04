#!/bin/bash
# P2·P1·P3 가 만든 detach 측정 워크트리 제거(--force 없음). 기준·변경 워크트리도 함께 제거.
PERF_SKIP_JAVA=1
source "$(dirname "$0")/lib.sh"
WT_REMOVE_ALL=1   # 명시 정리: 이번 실행이 만들지 않은 측정 워크트리도 지운다
targets_wt_remove
pair_wt_remove
$GIT -C "$REPO_DIR" worktree list
