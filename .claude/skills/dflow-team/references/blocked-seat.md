# /dflow-team blocked 답 넣기·좌석표 연동

SKILL.md 「6. blocked」·「좌석표 연동」 에서 옮긴 절(원문 그대로). 사람 답을 팀원 pane 에 넣을 때·좌석표 연동 확인할 때 Bash `cat` 으로 읽음.

## 답 넣기 (tmux)

**답 매칭(tmux)**
- 답 형식 = `<id8> <답>` (여러 팀원 질문이 동시에 쌓일 수 있음).
- 답 기다리는 `blocked` 가 하나뿐이면 id8 없는 답도 그 작업의 답으로 봄.
- 여럿인데 id8 없으면 어느 작업의 답인지 되물음.
  - loop 가 돈 뒤 팀장이 사람에게 묻는 곳 = 여기 하나 (시작 전 인자 질문 = 「인자」).
  - 답을 엉뚱한 작업에 넣지 않음.
- 답 넣기 **전에** "그 pane 에 답을 넣는다" 한 줄 알림 (사람이 같은 pane 에 동시에 치면 입력이 섞임).
  ```bash
  TM='<진짜 tmux 절대경로>'; PANE=$(head -n 1 '<워크트리>/.dflow-pane')
  d=$("$TM" -L dflow list-panes -t "$PANE" -F '#{pane_dead}' 2>/dev/null | head -n 1)
  if [ "$d" = 0 ]; then
    "$TM" -L dflow send-keys -t "$PANE" -l -- '<답 한 줄>'
    "$TM" -L dflow send-keys -t "$PANE" Enter
    echo ANSWER_SENT
  else
    echo "PANE_GONE dead=$d"
  fi
  ```
  `-l --` 로 넣음 (없으면 tmux 가 답을 키 이름으로 먼저 해석. backends.md 「생존·화면·답·회수」).
- `PANE_GONE` = 그 팀원 이미 끝남. 답 못 넣으므로:
  - "그 팀원은 이미 끝났다. 수동 `/dflow-dev <id8>` 대상" 보고.
  - 영구 제외에 남김 → slot 해제.
  - worktree = 「고아 정리 규칙」 따름.
- `ANSWER_SENT` 면 `team.answer`(id8, answer) 기록 (없으면 압축 뒤 재구성이 이미 답한 질문을 다시 통지).
- slot 그대로 둠. 팀원이 그 자리에서 이어 가므로 새로 띄울 것 없음.

## 좌석표 연동

- 팀원 좌석 식별 = 워커가 쓰는 worktree 루트 `.dflow-agent`(`<신원>/<host>/w<slot>`). 좌석표 S1 훅이 이 파일을 `heartbeat_agent` 로 읽음.
- `<신원>/<host>/parked` ≠ 좌석. heartbeat 안 보냄.
- 팀장 자신 = `<신원>/<host>/lead`. 같은 신원 두 PC 팀장이 좌석표에서 하나로 합쳐지지 않게 함.
- 좌석표 STANDBY 신호:
  - 「1. 시작」 6번·매 기상(「2-3」 `wake.mjs`)에서 잠금 `owner` 신원으로 `dflow.mjs watch --agent <신원>/<host>/lead --slots <N> --busy <M> --until '<UNTIL_LABEL>'` 1회 보냄.
  - 「7. 마감」에서 `--stop` 1회 보냄.
  - 감시 loop 가 TICK 건너뛸 때도 `wake.mjs` 로 1회 보냄 (「2-2」).
  - 좌석표는 마지막 신호 뒤 70분에 STANDBY 끔.
- poll.mjs = `DFLOW_WATCH=0` 으로 띄움 → watch 안 보냄.
- **이 호출 = 표시용만 아님.**
  - 응답 `resume_requests` 가 좌석표 「이어서 시작」 요청을 실어 옴 → `--json` 으로 호출하고 본문 읽음 (「2-3」).
  - 실패해도 팀장 안 멈춤. 단 실패를 "요청 없음" 으로 읽지 않음.
  - 「1. 시작」 6번·「7. 마감」 의 `--stop` = 종전대로 결과 안 봄.
- 팀원의 blocked 직전 heartbeat(worker-prompt.md)가 좌석표에 손 든 상태를 남기고, 다음 heartbeat 가 해제.
