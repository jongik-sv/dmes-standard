# scripts/lib/proc.sh — be-run.sh·fe-run.sh·local-run.sh 공용 프로세스 유틸 (source 전용)
#
# 여기 함수는 넘겨받은 pid·명령줄 패턴만 다룬다. 어느 pid 를 넘길지(이 체크아웃 것만 고르기)는
# 부르는 스크립트가 정한다 — 포트 번호만 보고 남의 프로세스를 고르는 판단은 여기 두지 않는다.
# macOS 기본 /bin/bash 3.2 에서 돌아야 하므로 연관 배열·mapfile 을 쓰지 않는다.

# be-run.sh 가 「맡은 모듈을 다른 be-run 이 모두 이어받아」 끝날 때의 종료 코드. local-run.sh 가 백엔드가 죽은 것과 구분한다.
BE_RUN_HANDED_OVER_RC=79

# pid 와 그 자손 전체에 신호를 보낸다(자식 먼저). pid 가 비었거나 이미 없으면 아무것도 안 한다.
#   terminate_pid_tree TERM 1234
terminate_pid_tree() {
  local signal="$1"
  local pid="$2"
  local child

  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0

  while IFS= read -r child; do
    [ -n "$child" ] && terminate_pid_tree "$signal" "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)

  kill "-$signal" "$pid" 2>/dev/null || true
}

# 넘긴 pid 가 모두 끝날 때까지 최대 5초(0.25초 x 20) 기다린다. 다 끝나면 0, 남아 있으면 1.
# 인자가 없거나 빈 값뿐이면 바로 0.
wait_for_exit() {
  local pid
  local alive
  local i

  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    alive=0
    for pid in "$@"; do
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        alive=1
      fi
    done
    [ "$alive" = "0" ] && return 0
    sleep 0.25
  done
  return 1
}

# 명령줄에 $2(절대경로 문자열)가 들어 있는 프로세스에 신호 $1 을 보낸다(자기 자신 $$ 는 뺀다).
# 자손까지 따라가지 않는다 — 트리 추적을 벗어난(재부모화된) 잔존 프로세스를 쓸어 담는 용도다.
# 경로를 이 체크아웃의 절대경로로 주므로 다른 체크아웃·다른 프로젝트 프로세스는 걸리지 않는다.
#   terminate_cmdline_stragglers TERM "$FRONTEND_DIR"
terminate_cmdline_stragglers() {
  local signal="$1"
  local needle="$2"
  local pid

  for pid in $(pgrep -f "$needle" 2>/dev/null || true); do
    [ "$pid" = "$$" ] && continue
    kill -0 "$pid" 2>/dev/null || continue
    kill "-$signal" "$pid" 2>/dev/null || true
  done
}
