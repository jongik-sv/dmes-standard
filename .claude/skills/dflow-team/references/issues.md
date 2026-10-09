# /dflow-team 팀원 이슈 보고 처리 (SKILL.md 「2-4. 팀원 이슈 보고 처리」)

SKILL.md 「2-4」 가 가리킴. 팀원 SendMessage 이슈 보고 도착한 턴에 Bash `cat` 으로 읽음. 그 턴 안에 1-3 완료.

팀원이 작업 중 사고·환경 문제·판단 필요 이슈 겪으면 SendMessage 로 이 세션에 직접 보고(worker-prompt.md 「9. 이슈 보고」).
- 감시 루프는 cross-session 메시지로 안 깨어남. 메시지 도착한 턴에 바로 아래 1-3 처리.
- 사람에게 보고만 하고 턴 끝내기 금지 (팀원·팀장 서로 기다리며 교착).

메시지 형식: 첫 줄 `[이슈 <TSK> <id8>] <요약>`. 이어서 경위·지금까지 조치·선택지(있으면)·기본안 도착(worker-prompt.md 「9」와 짝).

1. 저장: `docs/dflow-team/issues.md`(「3. 결과 처리」 문제 기록과 같은 파일, commit 안 함)에 원문 요약을 항목 하나로 추가.
   - `team.issue` 이벤트(`id8`, `summary`, `decision`)를 events.jsonl 에 기록(`references/events.md`).
   - 처음 저장 때 `decision` = `pending`.
   - 이 이벤트 = 재구성 대상(「팀장 상태」 「보조」).
2. 판단: 팀장이 최선의 선택을 직접 결정.
   - 판단 재료: 스킬 규칙, 리포 가이드(CLAUDE.md 등), memory, 다른 팀원 상황.
   - 사람에게 묻는 대상 = 사람만 정할 수 있는 것(운영 deploy, 되돌리기 어려운 외부 작업, 요구사항 해석)뿐.
   - 그때도 팀원에게 먼저 지시: 기본안 계속 or 그 단계만 미룸. 팀원을 답 없이 세워 두지 않음.
3. 추가 지시: 판단 내용을 `[팀장 지시 <id8>] …` 형식으로 SendMessage 전송.
   - `to` = 그 이슈 메시지 `from`.
   - 지시 내용: 할 일, 하지 말 것, 팀장이 따로 맡는 조치.
   - 전송 뒤 `team.issue` 를 `decision` 채워(실제 결정 요약, `pending` 아님) 같은 id8 로 다시 기록.
   - id8 별 마지막 `team.issue` 의 `decision` = `pending` → 아직 지시 안 보낸 이슈.
   - 답장 없는 이슈 남기지 않음.
4. 전파: 같은 문제가 다른 팀원에게도 생길 수 있으면 살아 있는 다른 팀원에게 같은 지시를 SendMessage 로 전송.
   - 새로 띄우는 팀원: 포인터나 worker-prompt.md 규칙에 반영될 때까지 팀장이 이 events 를 판단 재료로 보유.
5. 근본 조치: 리포 코드 문제는 팀장이 직접 고치거나 build·test 로 확인하지 않음(머리말 「팀장 역할」).
   - 이슈 보고한 팀원에게 그 branch 에서 고치라고 3번 지시로 넘김.
   - 예외 — 개발 branch 자체가 깨져 여러 팀원이 같은 실패를 보면: 무인 운영이 사람 답 기다리며 통째로 멈추지 않게, 팀장이 최소 수정(깨진 곳만, 기능 추가 금지) → 개발 branch 에 commit.
   - 확인 build·test 는 반드시 `heavy.mjs` 로 감쌈. 수정 내용·근거를 사람에게 보고.
   - 원인이 한 Task 의 merge 면 수정 대신 그 merge revert 먼저 선택.
   - 환경 문제: 설정(`.dflow`·`.dflow.local`·permission 목록)과 스킬 스크립트 호출 범위에서만 팀장이 조치.
   - 스킬 문제 → 스킬 개선 요청으로 넘김.
   - 결과를 issues.md 에 기록.

되돌릴 수 없는 조치는 미룸:
- 팀원은 이슈 보고 뒤에도 되돌릴 수 있는 작업은 기본안대로 계속.
- `push`·`done`·외부 상태 변경처럼 되돌릴 수 없는 것만 팀장 지시 기다리며 미룸(worker-prompt.md 「9」).
- 팀장이 10분 안에 지시 못 보내면 팀원은 `.result` 의 `blocked` 로 정규 경로 이동. 그러면 이 절 아니라 「6. blocked」 로 처리.

SendMessage 가 닿지 않을 때:
- backends.md 가 tmux 팀원의 `CLAUDE_CODE_MESSAGING_SOCKET`·`TOKEN` 을 일부러 제거(「팀원 환경을 벗기는 이유」) → SendMessage 가 양쪽 다 실패할 수 있음.
- 팀원 쪽 실패해도 `.issues` 와 10분 규칙(worker-prompt.md 「9」)으로 이동.
- 팀장 쪽 SendMessage 실패하면 1번(저장)은 그대로 하고, 같은 지시를 그 팀원 screen 에 직접 입력: `send-keys -l --`(tmux, backends.md 「생존·화면·답·회수」) 또는 `orca terminal`.
