#!/usr/bin/env bash
# compact 직후 화면으로 결과를 확인하는 순수 함수(compact-lane.sh 가 source, tests/lessons.sh 가 가짜 입력으로 시험).
# compact 직후에는 transcript 가 아직 갱신되지 않아 재측정이 직전 값과 같게 나온다(2026-10-06 교훈).

# 화면 끝(stdin)의 상태줄에서 사용률 정수 %(0~100)를 낸다. 못 찾으면 빈 출력.
# 읽는 꼴: `ctx 12%` · `Context: 12%` · `12% context` · `12% used`. 「남은」 뜻의 줄(left·remaining·until)은 뺀다.
compact_screen_ctx_pct() {
  local n
  n="$(tail -n 12 | grep -Eiv 'left|remaining|until' \
    | grep -Eio '(ctx|context)[^0-9%]{0,12}[0-9]{1,3}%|[0-9]{1,3}% *(ctx|context|used)' \
    | tail -n 1 | grep -Eo '[0-9]{1,3}%' | tr -d '%')" || true
  case "$n" in ""|*[!0-9]*) return 0 ;; esac
  [ "$n" -le 100 ] && printf '%s\n' "$n"
  return 0
}

# 화면 끝(stdin)에 「compacted」 문구(예: Conversation compacted)가 있으면 0.
compact_screen_compacted() {
  tail -n 20 | grep -qi 'compacted'
}
