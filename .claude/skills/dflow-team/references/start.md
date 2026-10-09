# /dflow-team 시작 상세

SKILL.md 「1. 시작」 에서 옮긴 준비 단계 상세(원문 그대로). scaffold 블록·서버 claimed 대조·절전 방지 필요하면 Bash `cat` 으로 읽음.

## 1번 시작: 2번 scaffold 블록

   - 아래 블록 하나로 판정·호출(1번 변수 안 남음):
   ```bash
   dev=$(node .claude/skills/dflow-work/scripts/dflow.mjs branch dev); cur=$(git branch --show-current)
   if [ -n "$dev" ] && [ "$cur" = "$dev" ]; then
     if git pull -q --ff-only origin "$dev"; then
       node .claude/skills/dflow-work/scripts/dflow.mjs scaffold || echo "scaffold 경고: exit $?"
     else
       echo "scaffold 건너뜀(개발 브랜치 fast-forward 실패)"
     fi
   else
     echo "scaffold 건너뜀(detached HEAD 또는 개발 브랜치 아님)"
   fi
   ```
   - 실패(exit≠0) = 경고만 하고 계속(편의 기능, gate 아님)
   - **그래도 push 실패 보고되면** 다음 승인 스윕 전에 사람이 `git pull --rebase origin <기본브랜치>` 로 직접 되돌림

## 1번 시작: 3번 서버 claimed 대조

   - 서버에 claimed 인데 흡수한 슬롯·고아 worktree·답 기다리는 `blocked`·대기 중인 답 어디에도 없는 id8 → **"멈춤" 표(사유 `워크트리 없음`)** 에 넣고 영구 제외
   - 자동 재착수 안 함: 이 PC 에 worktree 없으면 다른 PC·수동 세션 실행과 구분 불가, `show` 는 생존 신호 안 줌
   - 사람이 `--resume <id8>` 로 지목할 때만 이어받음(「5-1. 재개 spawn」)
   - **worktree 가 이 PC 에 남은 갈래 = 이 조항 아닌 `references/lead-state.md` 「고아 스캔」 "재개 가능" 이 맡아 자동으로 이어받음**
   ```bash
   (node .claude/skills/dflow-work/scripts/dflow.mjs list --scope claimed) | awk -F'\t' 'NF>=4 && $2=="CL" {print $4}'
   ```
   - 상태 열 `CL` 행만 셈(`--scope claimed` 는 승인 대기 `RP` 행도 반환)
   - 계약 2.11 이면 목록 id8 마다 `references/resume.md` 「서버 판단 확인」 실행 → 사유는 그 표 것으로 기록
   - 그 표가 띄우라고 가르는 것 = 「설계 승인」 된 작업(`action=build`)뿐
     - 멈춤 아닌 재개 대상으로 넘김(「5-1」 이 원격 agent branch 에서 worktree 생성, 설계 상태 스펙 12절 Y3 이 여는 유일한 새 길)

## 1번 시작: 6번 절전 방지

   **절전 방지**: `<UNTIL>` 이 오늘 아니거나 `none` 이고 `uname -s` = `Darwin` 이면 이어서 아래를 Bash `run_in_background` 로 띄움
   - `-w` = 팀장 세션 프로세스 끝나면 함께 끝남. 「7. 마감」(closing.md 6번)이 거둠
   ```bash
   caffeinate -i -w <LEAD_PID>
   ```
   - `-i` = 시스템 유휴 절전만 막음
   - 시작 보고에 "전원을 연결하고 뚜껑을 연 채로 두라" 기재
   - Linux 서버·Windows 에서는 안 띄움
