# /dflow-team 팀장 상태 상세

SKILL.md 「팀장 상태」 에서 옮긴 절 모음(원문 그대로). 재구성 때(시작 3번·압축 뒤 첫 기상) 해당 절을 Bash `cat` 으로 읽음.

> 윈도우: 아래 `jq` 예시를 Bash 로 직접 칠 때 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 를 붙임(`_shared/platform-support.md` 「문서 속 인라인 jq」).

## 정본 스캔

**정본**: 이 신원·이 PC 의 팀원 워크트리와 그 결과. `TM` = 「1. 시작」 전제 검사가 출력한 tmux 절대경로.
```bash
TM='<진짜 tmux 절대경로>'   # Orca 백엔드면 빈 값
dirs=$(node .claude/skills/dflow-work/scripts/dflow.mjs config tasks-dirs); rc=$?   # 팀장 체크아웃 기준 값이 정본. 워크트리마다 다시 부르지 않는다 — 팀원 워크트리는 detach 된 옛 커밋에 있어 project_map 이 다르게 나올 수 있다(DEV_BRANCH 와 같은 이유)
{ [ "$rc" = 0 ] && [ -n "$dirs" ]; } || { echo "FAIL TASKS_DIRS rc=$rc"; exit 1; }
git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r w; do
  [ -f "$w/.dflow-agent" ] || continue
  a=$(head -n 1 "$w/.dflow-agent")
  case "$a" in "<신원>/<host>/"*) ;; *) continue ;; esac
  rf=$(printf '%s\n' "$dirs" | while IFS= read -r dd; do
    find "$w/$dd" -mindepth 2 -maxdepth 2 -name .result 2>/dev/null; done | head -n 1)
  r=$([ -n "$rf" ] && head -n 1 "$rf")
  b=$(git -C "$w" branch --show-current)
  p=$(head -n 1 "$w/.dflow-pane" 2>/dev/null); alive=-
  if [ -n "$p" ] && [ -n "$TM" ]; then
    d=$("$TM" -L dflow list-panes -t "$p" -F '#{pane_dead}' 2>/dev/null | head -n 1)
    case "$d" in 0) alive=alive ;; *) alive=dead ;; esac
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$a" "$w" "${b:--}" "${r:--}" "${p:--}" "$alive"
done
```
- `FAIL TASKS_DIRS`(`config tasks-dirs` 실패·빈 값) → 재구성 중단(빈 폴더로 워크트리 전체를 훑어 오판).
- `.dflow-agent` = `<신원>/<host>/w<slot>` 인 워크트리 = 그 슬롯의 팀원 워크트리.
- `<신원>/<host>/parked` = 슬롯 아님. 고아 스캔만 본다.
- 워크트리 안 `<TASKS>/*/.result` = 결과. 브랜치 `agent/<id8>-…`·워크트리 이름 `dflow-<id8>` = 작업 식별.
- 마지막 칸(`.dflow-pane` 의 tmux pane): `alive` = 살아 있음, `dead` = 죽었거나 사라짐(빈 출력도 `dead`), `-` = Orca 팀원.

## 복원 규칙 (events.jsonl 에서 다시 만드는 값)

- `RUN` 의 `scope` = 옛 팀장 기록과의 호환 칸. 계약 2.11 팀장은 `server` 를 적고 이 값을 쓰지 않는다(범위는 작업마다 서버 판단).
- 종료 시각(`<UNTIL>`·`<UNTIL_LABEL>`) = **마지막 `team.extend`** 의 `until`·`until_label`. 없으면 `team.start` 의 `until`(`RUN` 의 `until`·`until_label`).
- `team.spawn` 의 `slot`·`id8`·`worktree`·`handle` 로 슬롯과 작업을 잇는다(`SLOT`. 브랜치 전인 Phase 01 팀원도 id8 을 앎).
- `spawn_kind` = `resolve` 인 줄 = 해소 워커(「5-2. 해소 spawn」, 워크트리 `<MAIN>/.claude/worktrees/dflow-<id8>-resolve`, detached).
  - **해소 워커 판별 = 워크트리 이름 접미사 `-resolve`**(재기록이 `spawn_kind` 를 `readopt` 로 덮음. `merge-conflict.md` 「0」).
  - 결과 처리 = `references/merge-conflict.md` 「4. 해소 결과 처리」 표.
  - 고아 스캔에서는 backends.md 「고아 정리 규칙」 2-1번으로 가른다. "재개 가능" 으로 보내지 않는다.
  - 워커 자동 재시작(H) 대상도 아니다.
- 복원 대상:
  - `team.result`·`team.blocked` 로 이미 판정한 작업.
  - 제외 목록: `skipped` = 일시. `failed`·`failed no-result`·`failed not-isolated`·`failed no-worker-flag`·`failed deps`·`failed not-assignee`·`cancelled`·`blocked` = 영구. `failed rate-limit`·`design_waiting`·`design_review`·`design_reopened` = 제외 없음.
  - 차단기 상태 = 끝에서부터 연속한 `failed…` 수.
    - `failed not-assignee`·`cancelled`·해소 워커의 내용 실패(`references/merge-conflict.md` 「6. 차단기」) = 세지도 끊지도 않고 건너뜀.
    - `team.lost` = `cause` 무관하게 실패 1건으로 셈. 단 `next=wait` 인 `team.lost` 는 세지도 끊지도 않음.
  - 결과 줄 경로별 마지막 처리 해시(경로 = `<worktree>/<TASKS>/<tsk>/.result`).
- 사유가 `선행 미충족(사전 검사:` 로 시작하는 `skipped` = 일시 제외가 아니라 **선행 대기**. 선행 대기 목록은 「2-3」 의 선행 대기 블록 출력으로 복원한다.
- 제외 목록 = id8 마다 마지막 `team.spawn`·`team.blocked`·`team.result` 로 정함.
  - 마지막이 `team.spawn` 이나 `team.blocked` → 진행 중(영구 제외).
  - 마지막이 `team.result` → SKILL.md 「3. 결과 처리」 표의 status 별 제외 칸.
  - `team.answer` 는 제외를 바꾸지 않음.
- **`team.lost`**: id8 의 마지막 이벤트(`team.spawn`·`team.blocked`·`team.result`·`team.lost` 중)가 `team.lost` → 영구 제외(진행 중).
  - 재시작 대기 목록·rate-limit 대기·보류 = `references/restart.md` 「이벤트로 본 상태」 블록으로 복원.
  - 이 블록은 `team.start` 로 자르지 않는다.
- 답 기다리는 질문 = `team.blocked` 중 그 뒤에 같은 id8 의 `team.answer` 가 없는 것(`WAIT_ANSWER`). 그 뒤에 같은 id8 의 결과·spawn·손실이 온 것은 끝난 질문이라 뺀다. 두 백엔드 공통.
- 지시 안 보낸 이슈 = `team.issue` 중 id8 마다 **마지막** 것의 `decision` 이 `pending`(`ISSUE_PENDING`)(「2-4. 팀원 이슈 보고 처리」).
  - 압축 뒤 첫 기상에서 이 목록을 복원해 곧바로 2·3번(판단·추가 지시)을 마무리한다.
  - 사람에게 넘긴 채 잊지 않는다.


## 고아 스캔·"멈춤" 보고·부트스트랩 실패 정리

- **고아 스캔**: 값이 `<신원>/<host>/` 로 시작하는 `.dflow-agent` 워크트리(`parked` 포함) 중 살아 있는 팀원이 없는 것을 **정리 가능·재개 가능·멈춤** 셋으로 가른다. 판정 순서 = 정리 → 재개 → 멈춤. 앞 갈래에 안 걸린 것이 뒤로 간다.
  0. **설계 완료 대기**: `<TASKS>/*/state.json` 이 `phase=wait_pred` → 정리·멈춤으로 보내지 않는다.
     - `references/design-ahead.md` 2번(재개 판정)을 통과할 때만 2번으로 보낸다. 아니면 그대로 둔다(재시작·재개 후보 아님).
     - `phase=wait_review`(설계만·검토 대기)도 재시작·재개 후보 아님.
     - 결과 줄이 없으면 restart.md 「판정」 4-2 대로 `design_review` 로 거둔다.
     - 「설계 승인」 뒤에는 「2-3」 의 `build`(승인된 작업)가 이어 가기를 부른다.
  1. **정리 가능**: backends.md 「고아 정리 규칙」 대로 깨끗하고(미커밋 변경 없음) HEAD = `origin/<그 브랜치>`. 그 규칙대로 지운다.
  2. **재개 가능**: 아래가 모두 참. 「5-1. 재개 spawn」 의 대상. `.dflow-agent` 를 `parked` 로 바꾸지 **않는다**.
     - 브랜치가 `agent/<id8>-…`(id8 을 여기서 얻음). 브랜치가 없으면 claim 전에 죽은 것 → 재개할 산출물 없음.
     - `.result` 가 없거나, 있어도 status 가 최종 판정(`done`·`needs-merge`·`skipped`·`failed`·`cancelled`·`resolved`)이 아님.
       - 최종 판정이 있으면 재개가 아니라 「3. 결과 처리」 의 몫.
       - 단 `RETRY_DUE`(`lead-state.mjs` — fetch·push 실패 뒤 30분)인 `skipped` 는 최종 판정이 아님(12절 Y11). `WARN_RETRY` 면 「멈춤」.
     - 서버 show 가 `status=claimed` 이고 `mine=true` 이며, `claimed_by` 를 소문자로 바꾼 값이 `claude-<host>` 와 같거나 팀원 라벨 `<신원>/<host>/w<슬롯>` 의 가운데 칸이 `<host>`(이 PC 가 claim 함).
       - 계약 2.11 이면 `references/resume.md` 「서버 판단 확인」 도 통과해야 함(`same_host` 는 옛 서버의 대체 판정).
     - 그 id8 의 재개 재시도가 상한(3)에 안 닿음.
     - 그 id8 이 `references/restart.md` 「이벤트로 본 상태」 에서 `PARKED`·`RL_WAIT`·`RL_DUE` 가 아님.
       - `RESTART_DUE` = 이 다섯 조건과의 교집합일 때만 재개 가능(`references/restart.md` 「재투입」 의 재투입 전 확인이 이번 기상의 show 로 판정).
       - 재시작 대기 목록과 id8 으로 합쳐 한 번만 띄운다.
     ```bash
     w='<워크트리>'; id8='<id8>'
     br=$(git -C "$w" branch --show-current)
     (node .claude/skills/dflow-work/scripts/dflow.mjs show "$id8") \
       | jq -c --arg h 'claude-<host>' '.order | {status, mine,
           same_host: (((.claimed_by // "") | ascii_downcase) as $c | $c == $h or (($c | split("/")) as $p | ($p | length) == 3 and $p[1] == ($h | ltrimstr("claude-"))))}'
     jq -r --arg a '<신원>/<host>/lead' --arg r '<MAIN>' --arg i "$id8" \
       'select(.agent == $a and .repo == $r and (.id8 // "") == $i)
        | select(.event == "team.result" or (.event == "team.spawn" and (.spawn_kind // "new") == "resume"))
        | .event' ~/.dflow/events.jsonl 2>/dev/null \
       | awk '/team\.result/{n=0; next} {n++} END{print "tries=" n+0}'
     ```
     - 재시도 수 = 마지막 `team.result` 이후 `spawn_kind == "resume"` 인 `team.spawn` 개수.
     - 새 작업(`new`)과 이어받은 슬롯의 재기록(`readopt`)은 세지 않는다.
     - `team.start` 로 구간을 자르지 않는다.
     - 결과 줄이 하나라도 나오면 `skipped` 여도 수가 0 으로 돌아감 = **의도한 것**(판정을 남긴 작업은 그 status 의 제외 규칙이 다룸).
  3. **멈춤**: 나머지. 자동으로 지우지 않는다.
     - `.dflow-agent` 값을 `<신원>/<host>/parked` 로 바꾼다(「고아 정리 규칙」 3번).
     - **"멈춤" 목록**에 넣는다.
- **"멈춤" 보고**: 아래를 한 표로 낸다.
  - 멈춤으로 분류한 것.
  - 서버에 claimed 인데 이 PC 어디에도 워크트리가 없는 id8(「1. 시작」 3번).
  - 결과가 `failed…` 이거나 무응답 자동 정리로 끝났는데 서버에 claimed 로 남은 작업(「3. 결과 처리」).
  - 칸: id8 · TSK · 워크트리 경로(없으면 `-`) · 브랜치 · 미커밋 파일 수 · 사유 · **재시작 명령**.
  - 사유: `미커밋 보존`·`서버 미claim`·`다른 PC claim`·`재시도 상한`·`워크트리 없음`·`무응답`·`pane 죽음`·`rate-limit 반복`·`rate-limit 대기(<HH:MM>)`·`중단 표식 불일치`·`중단 표식 삭제 실패`·`거두기 실패`·`살아 있는 팀원`·`서버 <status>`·`서버 조회 실패`(`references/restart.md`), 계약 2.11 의 `references/resume.md` 「서버 판단 확인」 사유·`사람 설계 초안 있음`·`fetch·push 3회 연속 실패`·`설계 멈춤 미완료`, 또는 결과 줄의 `failed <사유>`.
  - `failed…` 로 끝난 작업은 자동 재개로 가지 않는다(원인을 사람이 먼저 고친 뒤 `--resume` 이 그 워크트리를 그대로 이어받음).
  - 이 표는 시작 보고와 마감 보고에 모두 낸다.
  - 재시작 명령은 갈래마다 아래 중 하나를 그대로 적는다(사람이 복사해 쓸 수 있게).
    - 팀장에게 맡긴다: `/dflow-team <종료시각> --resume <id8>`
    - 사람이 그 워크트리에서 직접 한다(워크트리가 있을 때):
      ```bash
      printf '%s\n' '<신원>/<host>/w<slot>' > <워크트리>/.dflow-agent   # parked 를 되돌린다
      cd <워크트리> && claude   # 그 세션에서 /dflow-dev <TSK>
      ```
      - `.dflow-agent` 를 먼저 되돌린다(`dflow.mjs heartbeat` 는 값이 `*/parked` 면 exit 2 로 거부).
      - `<slot>` = `.dflow-prompt` 의 `AGENT_ID=` 에 박힌 번호.
- **부트스트랩 실패 정리**(해소 워크트리 `dflow-<id8>-resolve` 는 예외 — 「고아 정리 규칙」 2-1번): `.result` 의 branch 가 `-`(브랜치를 만들기 전에 끝남)이면 backends.md 「고아 정리 규칙」 1번대로 한다.
  - 알려진 부산물만 있을 때만 `--force` 로 정리.
  - 그 밖의 변경이 있으면 보존하고 보고.
