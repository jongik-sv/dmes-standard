# /dflow-team 마감 (SKILL.md 「7. 마감」)

SKILL.md 「7. 마감」 이 가리킴. 마감 진입 때(잠금·lease 상실 마감 포함) Bash `cat` 으로 읽음.
아래 번호 1-7 과 「잠금 상실 마감」·「lease 상실 마감」 = 다른 문서가 「7. 마감」 N번으로 가리키는 자리.

마감 진입 조건: poll exit 8, poll 오류 exit, `failed not-isolated`, 기상 때 확인한 종료 시각 경과, 종료 요청(`STOP_REQUESTED` 또는 사람 말).
잠금 상실·lease 상실은 1-6 안 타고 아래 「잠금 상실 마감」·「lease 상실 마감」 으로 이동.
1. 새 spawn stop. 대기 큐는 보고만 하고 비움.
2. 기다림 상한: `blocked`·무응답 슬롯 대기 안 함.
   - 진행 중 슬롯은 마감 진입 뒤 `TICK` 두 번까지만 결과 대기.
   - 이 동안 poll restart 안 함. 감시 루프만 `--may-skip` 없이 restart → 결과와 `TICK` 계속 수신(「2-3」 일은 spawn·poll 만 빼고 그대로).
   - 그 뒤에도 남은 슬롯 → TSK·id8·worktree 경로·마지막 생존 증거 목록 보고.
   - 이유: 사람 자리 비운 시간대에 답 안 오는 슬롯 하나가 팀장을 무한정 붙잡지 않게 함. 팀원은 팀장이 끝나도 자기 pane·탭에서 계속 동작.
   - 해소 워커도 같은 규칙으로 대기.
   - 마감은 남은 `merge_conflict` 표시 안 지움(사람이 봐야 함).
3. 집계 표(TSK · id8 · branch · head · done exit · status · 사유) 보고 후, 마지막 승인 스윕 1회 실행(사전 검사 없이 — 「4-0」 예외).
   - 대기 큐·남은 슬롯·"멈춤" 표(「팀장 상태」 — 재시작 명령 칸까지)도 함께 기록.
   - 이유: 마감 뒤 남는 worktree = 사람이 이어받는 수밖에 없음. 이어받는 방법이 그 자리에 있어야 함.
   - 이번 실행에서 붙인 문제 기록 있으면 `문제 기록 N건 → <MAIN>/docs/dflow-team/issues.md` 한 줄 추가(「3. 결과 처리」 문제 기록).
   - 재시작 대기·rate-limit 대기는 `references/restart.md` 「마감·lease·잠금」 대로 사유와 재시작 명령 기록(마감 중 재시작 안 함).
4. 남은 팀원 worktree 중 살아 있는 팀원(「팀장 상태」 정의) 없는 것만 백엔드별 정리.
   - tmux: worktree 가 아직 있을 때만 `git worktree remove --force <경로>`.
   - Orca: backends.md 「pane(Orca)」 「정리」 전환 규칙 적용. 경로가 `orca worktree list --json` 에 있으면 `orca worktree rm --worktree path:<경로>`, 없으면 `git worktree remove --force <경로>`.
   - 두 경우 모두 backends.md 「고아 정리 규칙」 적용. 깨끗하고 HEAD 가 `origin/<agent branch>` 와 같거나 그 merge 가 이미 기본 branch 조상일 때만 삭제(생성 branch 정리 포함). 나머지는 경로 보고.
   - 살아 있는 팀원 worktree 는 조건 무관 삭제 안 함. 경로(tmux 는 pane id 도)만 보고에 기록.
   - 이유: 팀원은 팀장이 끝나도 계속 동작. `blocked` 팀원 = pane·탭에서 답 대기. 깨끗하고 push 된 순간 삭제하면 도는 팀원 cwd 소실.
   - 살아남은 tmux 팀원은 다음 팀장 재구성이 `.dflow-pane` 과 `#{pane_start_path}` 로 흡수.
   - tmux 백엔드: 소켓에 pane 이 하나도 없을 때만 서버 종료(backends.md 「마감」).
   ```bash
   [ -z "$("$TM" -L dflow list-panes -a -F '#{pane_id}' 2>/dev/null)" ] && "$TM" -L dflow kill-server
   ```
   - 이 소켓 = 사용자 단위, 리포 단위 아님. 자기 슬롯 표만 보고 종료하면 같은 PC 다른 체크아웃 팀장의 살아 있는 팀원이 미 commit 산출물 안은 채 죽음.
   - 목록이 비지 않으면 서버 유지. 대가 = 서버 하나가 계속 도는 것뿐. 다음 팀장 재구성이 그 pane 들을 흡수.
   - `--force` 필요 이유 = 미추적 부산물: `.result`·`.dflow-agent`·`.dflow-prompt`·`.dflow-pane`·`.dflow-run`·`.dflow.local`(레거시 `.env`) 링크·`.dflow` 링크·스킬 링크.
5. agent branch 유지. 승인은 사람이 D'Flow 웹에서 함. 승인 뒤 merge 는 다음 `/dflow-team` 스윕이나 `/dflow-merge` 가 수행.
6. poll 이 떠 있으면 TaskStop 으로 stop(태스크 id 모르면 종료 시각에 스스로 끝남). 세대 파일 세대를 올려 감시 루프 종료(`node .claude/skills/dflow-team/scripts/tick.mjs --retire`).
   - `team.stop` 기록. 좌석표에 감시 종료를 알린 뒤 팀장 잠금 디렉터리 삭제.
   - 삭제 전에 「1. 시작」 소유 판정(`owner` 신원 = 자기 `<신원>/<host>/lead` 이고 PID = 현재 `$LEAD_PID`) 한 번 더 수행. 참일 때만 삭제.
   - 이유: 이 팀장이 `beat` 를 70분 넘게 놓쳐 다른 팀장이 잠금을 가져갔으면, 그 잠금은 신원·host·리포가 같아도 PID 가 다름. 삭제 금지.
   - events.jsonl `team.start` 시각과 비교 안 하는 이유: 두 팀장 이벤트가 같은 `agent`·`repo` 로 섞여, 마지막 `team.start` 가 새 팀장 것일 수 있음.
   - `owner` 읽는 `read` 는 `|| true` 로 감쌈. 이유: 파일 없으면 `read` 가 0 아닌 값으로 종료 → 실패에 멈추는 셸 설정에서 마감 나머지 통째로 건너뜀.
   - 좌석표 종료 신호: 같은 소유 판정이 참일 때만, 잠금 삭제 전에 전송. 신원을 잠금 `owner` 에서 읽으므로 삭제 뒤 전송 불가.
   ```bash
   LEAD_PID=${CLAUDE_PID:-$PPID}
   LOCK=$(git rev-parse --git-path dflow-team.lock); o_who=; o_ts=; o_pid=
   { read -r o_who o_ts o_pid < "$LOCK/owner"; } 2>/dev/null || true
   if [ "$o_who" = '<신원>/<host>/lead' ] && [ "$o_pid" = "$LEAD_PID" ]; then
     node .claude/skills/dflow-work/scripts/dflow.mjs watch --agent "$o_who" --stop || :
   fi
   if [ "$o_who" = '<신원>/<host>/lead' ] && [ "$o_pid" = "$LEAD_PID" ]; then
     node .claude/skills/dflow-work/scripts/dflow.mjs lease release || { rm -f "$(git rev-parse --git-path dflow-team.lease)" "$(git rev-parse --git-path dflow-team.lease).beat"; echo "LEASE_RELEASE_FAILED 3분 뒤 스스로 풀린다"; }
     rm -f "$(git rev-parse --git-path dflow-team.stop)"
     pkill -f "caffeinate -i -w $LEAD_PID" 2>/dev/null || :
     CP=.claude/skills/coordinator/scripts/console-poll.mjs   # 오피스 콘솔: 팀장 핸들 기록을 지운다(폴러는 할 일이 없으면 스스로 끝난다)
     [ -f "$CP" ] && node "$CP" handle-clear team --repo "$(git rev-parse --show-toplevel)" >/dev/null 2>&1 || :
     rm -rf "$LOCK" && echo LOCK_RELEASED
   else echo "LOCK_KEPT owner=$o_who $o_ts $o_pid"; fi
   ```
   - 종료 파일과 절전 방지도 여기서 정리.
   - 종료 파일을 남겨도 다음 팀장이 전제 검사에서 삭제 → 해 없음. 소유 맞을 때만 삭제 이유: 잠금 가져간 새 팀장에게 온 요청 보호.
   - lease 는 잠금보다 먼저 반납.
   - `dflow.mjs lease release` 성공하면 그 명령이 상태 파일·`.beat` 삭제. lease 갱신 프로세스는 다음 확인(최대 5초)에서 상태 파일 없음을 보고 종료.
   - 실패하면(예: 서버 호출 실패) `dflow.mjs lease release` 는 상태 파일을 안 지운 채 종료. 이 블록이 대신 삭제.
   - 삭제 = 갱신 프로세스 stop 신호. 안 지우면 세션 살아 있는 한 갱신 프로세스가 계속 서버에 renew 시도 → "3분 뒤 스스로 풀린다" 문장이 거짓(서버 lease 는 TTL 로 풀려도 로컬 프로세스 생존).
   - 반납 실패해도 마감 안 멈춤.
7. 남은 에이전트 확인: ListAgents 재호출. 이 세션에 `running` 인 이름 붙은 에이전트가 남아 있으면 그 이름으로 TaskStop 후 보고. 정상이면 하나도 없음.
   - 팀원과 그 Phase 손자 = 별도 프로세스 → 이 세션 목록에 안 나옴. 손자는 팀원이 회수.
   - poll 태스크와 감시 루프는 Bash 태스크라 이 목록에 없음.

잠금 상실 마감(「2-3」 `LOCK_LOST`):
- 위 1-7 중 기다림·마지막 승인 스윕·worktree 정리·`team.*` 기록·세대 파일 변경·잠금 삭제 안 함.
- 떠 있는 poll 을 TaskStop 으로 stop, 7번 그대로 수행.
- 집계·남은 슬롯(TSK·id8·worktree 경로·pane id)을 "잠금 상실: 이 체크아웃은 다른 팀장이 맡았다" 와 함께 보고한 뒤 종료.
- 팀원 pane 은 건드리지 않음. `kill-server` 도 안 함. 이유: 새 팀장 재구성이 `.dflow-pane` 으로 흡수.
- 이유: 이 세션 poll stop = 공유 상태 안 건드림. 남겨 두면 새 팀장 poll 과 같은 작업 두 번 배정.
- 체크아웃과 이 신원 worktree·세대 파일 = 이제 새 팀장 것. 새 팀장 재구성은 같은 `agent`·`repo` 의 마지막 `team.start` 이후 이벤트를 읽음. 이 팀장이 기록 남기면 새 팀장 슬롯 표·제외 목록에 섞임.

lease 상실 마감(「2-3」 `LEASE_LOST`): 다른 곳의 같은 신원 팀장이 이 프로젝트를 인수. 이 팀장은 즉시 손 뗌.
1. "팀장 lease 상실: <사유>. 이 프로젝트는 다른 곳의 팀장이 맡았다" 보고.
2. 새 claim·새 spawn·승인 스윕·merge 금지. 대기 큐는 보고만 하고 비움.
3. 떠 있는 poll 을 TaskStop 으로 stop, 세대 파일 세대를 올려 감시 루프 종료(`tick.mjs --retire`). lease 갱신 프로세스는 이미 종료됨(표식을 쓰고 끝남).
4. 떠 있는 워커는 건드리지 않음.
   - 워커는 하던 작업을 끝까지 수행하고 agent branch push 와 done 보고.
   - 그 결과는 새 팀장 승인 스윕이 서버에서 이어받음.
   - 팀원 pane·탭 닫지 않음. `kill-server` 도 안 함.
5. 위 6번 블록 그대로 실행: 좌석표 감시 종료, `lease release`, 로컬 잠금 삭제(소유 판정이 참일 때).
   - 그 블록 `lease release` 는 남의 lease 를 안 풂. 이유: 서버가 holder·generation 맞는 행만 풀어서, 빼앗긴 lease 는 0건으로 종료.
   - 서버에 못 닿아 끝난 경우(`LEASE_UNREACHABLE`): 아무도 안 가져간 내 lease 를 바로 해제.
   - 이유(로컬 잠금 삭제): 같은 체크아웃에서 사람이 나중에 팀장을 다시 띄울 수 있어야 함.
   - 표식 파일(`dflow-team.lease-lost`)은 다음 start 전제 검사가 삭제.
6. 7번(남은 에이전트 확인) 그대로 수행.
7. 보고에 남은 슬롯(TSK·id8·worktree 경로·pane id)과 "워커 N명은 하던 작업을 끝낸 뒤 스스로 끝난다" 기록.
