# /dflow-team 선행 대기의 설계 선행 (SKILL.md 「2-3」 4번·「3. 결과 처리」·`references/lead-state.md` 「고아 스캔」 0번)

> 윈도우: 아래 `jq` 예시를 Bash 로 직접 칠 때는 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 를 붙인다(`_shared/platform-support.md` 「문서 속 인라인 jq」).

선행이 구현 중인 작업 Design 을 빈 slot 에서 먼저 해 두고, 선행 끝나면 같은 worktree 로 이어 구현.
- worker 쪽 흐름 정본: `/dflow-dev` `references/orch/design-first.md` 「설계 선행」 (계약 2.9)
- 설계 정본: wbs-web 리포 docs/superpowers/specs/2026-09-26-dflow-parallel-token-design.md §6 (킷 미동봉)
- 이유: `rationale.md` 「설계 선행」
- 읽는 때 (Bash `cat`): 설계 선행으로 줄 때 · `design_waiting` 결과 처리 · 설계 완료 대기 worktree 재개 판단

## 1. 설계 완료 대기 목록

정본 = 이 신원·이 PC 의 worktree (이벤트 아님 — 팀장 restart·압축 뒤에도 남음).
`<TASKS>/*/state.json` 이 `phase=wait_pred` 인 worktree = 설계 완료 대기.
출력 한 줄: `DESIGNED<TAB><id8><TAB><TSK><TAB><워크트리><TAB><미충족 선행,…>`
```bash
dirs=$(node .claude/skills/dflow-work/scripts/dflow.mjs config tasks-dirs); rc=$?
{ [ "$rc" = 0 ] && [ -n "$dirs" ]; } || { echo "FAIL TASKS_DIRS rc=$rc"; exit 1; }
git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r w; do
  case "$(head -n 1 "$w/.dflow-agent" 2>/dev/null)" in '<신원>/<host>/'*) ;; *) continue ;; esac
  printf '%s\n' "$dirs" | while IFS= read -r d; do
    [ -n "$d" ] || continue
    find "$w/$d" -mindepth 2 -maxdepth 2 -name state.json 2>/dev/null | while IFS= read -r f; do
      jq -r --arg w "$w" 'select(.phase == "wait_pred")
        | "DESIGNED\t\((.order // "-")[0:8])\t\(.tsk // "-")\t\($w)\t\((.design_first.unmet // []) | join(","))"' "$f" 2>/dev/null
    done
  done
done
```
- `FAIL TASKS_DIRS` → 이 기상에 설계 선행 주기·재개 둘 다 안 함 (빈 목록으로 오판 금지)
- worktree 가 이 PC 에 없는 설계 완료 대기 (다른 PC·사람이 지움) = 이 목록에 없음
  - 그 주문은 서버에 claimed 로 남아 「1. 시작」 3번 "멈춤" 표(`워크트리 없음`)로 감
  - 사람이 `--resume <id8>` 으로 이어받음. `references/resume.md` 3항이 `origin/agent/<id8>-<slug>` 에서 worktree 재생성 (멈출 때 push 해 둠)

## 2. 재개 판정

설계 완료 대기 worktree 마다 선행 풀렸는지 확인.
- 도는 때 = 재구성의 고아 스캔 (`references/lead-state.md` 「고아 스캔」 0번). 매 기상이지만 대상은 이 목록뿐이고 상한(`DFLOW_DESIGN_AHEAD_MAX`)이 있어 조회 적음
0. 계약 2.11 이면 먼저 `references/resume.md` 「서버 판단 확인」 수행.
   - `action` = `wait` → 아직. 그대로 둠
   - 표가 띄우지 않는다고 가르면 (다른 PC·다른 신원 등) → 이 목록·3번 상한에서 빼고 「멈춤」 표에 그 사유로 올림 (설계 상태 스펙 12절 Y8)
1. `dflow.mjs show <id8>` 을 SKILL.md 「2-3」 poll exit 0 show 필터 그대로 줄임 (`deps_unmet`·`deps_nohead`). show 실패 → 이번 기상 재개 안 함 (조회 실패를 풀림으로 보지 않음)
2. `deps_unmet` 비어 있지 않음 → 아직. 그대로 둠
3. `deps_unmet` 비었으면 `deps_nohead` 마다 `references/wake.md` 「선행 반영 사전 검사」 의 `pred-reflected.mjs` 수행.
   - `NOT_REFLECTED` 하나라도 있음 → 아직 (띄우면 worker 가 `design_waiting 선행 승인 대기` 로 곧 멈춤)
   - `UNKNOWN` → worker 에 맡김
4. 통과 → **재개 가능**.
   - 고아 스캔 2번의 서버 조건(`claimed`·`mine`·이 PC)·재시도 상한 그대로 확인
   - `.result` 가 `design_waiting` 인 것은 2번 "최종 판정" 조건에 안 걸리는 것으로 봄
   - 「5-1. 재개 spawn」(자동 갈래)으로 띄움. worktree 있으므로 claim·새 worktree 없이 이어 감
   - 재시도 수 = 마지막 `team.result`(`design_waiting`) 뒤부터 다시 셈

이 판정 못 넘은 설계 완료 대기 worktree = **restart·재개 후보에서 뺌** (고아 스캔의 재개 가능, restart.md 「재투입」 의 재투입 전 확인 둘 다).
- 안 빼면 "재개 → 여전히 미충족 → 멈춤 → 재개" 가 기상마다 돎
- 예외: 좌석표 「이어서 시작」 요청(`resume_requests`)은 그대로 띄움
- 이유: worker 가 선행을 다시 보고 미충족이면 `wait_pred` heartbeat(서버가 표식 비움) + `design_waiting` 으로 곧 끝남 → 한 번 누름에 한 번

## 3. 설계 선행으로 주기

**언제**: 「2-3」 4번에서 재개 대상·해소 큐·대기 큐를 모두 띄운 뒤에도 빈 slot 남았을 때만.
- 선행 충족 후보(대기 큐) 하나라도 있으면 그것이 먼저
- 차단기·rate-limit 보류·입장 제어·주간 사용량(「5」 0항)은 새 작업과 똑같이 적용 — 설계 선행 = 새 작업

**상한**:
- 설계 완료 대기(1번 목록 줄 수) + 설계 선행으로 띄워 아직 도는 팀원(아래 블록 `AHEAD` 줄 수) < `DFLOW_DESIGN_AHEAD_MAX` 일 때만, 그 차이만큼까지 줌
- `DFLOW_DESIGN_AHEAD_MAX` = 팀장 세션 환경변수, 기본 2, 0 이면 끔
- 도는 것까지 세는 이유: 빈 slot 셋이면 한 기상에 셋 띄워 상한 넘긴 채 설계만 쌓임
- 계약 2.11: 설계 완료 대기 수 = 2번 0에서 서버가 claimed·`mine`·단계 `dd` 로 확인한 것만 셈 (다른 PC 로 옮긴 옛 잔재가 한도 차지 방지, 12절 Y8)
- 설계 검토(`review`) 작업의 설계 선행 = 이 상한과 무관 — poll 이 `action=design` 으로 곧바로 줌 (SKILL.md 「2-3」 poll exit 0)
- 구현자동(`human`) = 서버가 선행 풀릴 때까지 `wait` 로 둬 후보에 안 옴 (스펙 6.6)

**후보**: 「2-3」 선행 대기 블록 출력(`<id8><TAB><선행 TSK,…>`)에서 아래 블록의 `TOO_EARLY` id8 을 뺀 것을 위에서부터 고름.
- 선행 단계(구현 전인지) = 팀장 판정 안 함 — 서버가 `design_first_too_early` 로 거부하고 팀원이 `skipped 선행 미충족(설계 선행 불가: <ref…>)` 로 끝남
- 그 작업은 기록 후 2시간 동안, 또는 그 선행 TSK 의 `done`·`needs-merge`·`resolved` 결과가 올 때까지 다시 안 고름 (`TOO_EARLY`). 안 그러면 30분 일시 제외가 풀릴 때마다 같은 거부 되풀이
- 후보 show(`show-<id8>.json`)에서 미충족 선행 `stage` 가 `as` 이거나 없으면 (선행에 주문 없음 — 위임 안 됨):
  - 설계 선행으로 안 줌
  - 시작·마감 보고에 `<id8> 선행 주문 없음: <ref>` 알림
  - 이유: 서버가 늘 거부해 2시간마다 되풀이됨. 사람이 선행을 위임하거나 강제 진행 (스펙 6.6)

**띄우기**: 「5. 팀원 spawn」 그대로 (새 worktree, `spawn_kind` = `new`, 팀원이 claim).
- show 필터 결과: 선행 대기에 넣을 때 저장한 `show-<id8>.json` 있으면 사용, 없으면 다시 호출
- 계약 2.9 서버에서 팀원은 늘 `--design-first` 로 claim → 포인터에 따로 적을 것 없음
- `team.spawn` 남기면 그 id8 은 선행 대기 블록에서 빠지고 아래 블록 `AHEAD` 로 셈

설계 선행 블록 — 출력 줄:
- `AHEAD<TAB><id8>` = 설계 선행으로 띄워 아직 결과 없음
- `TOO_EARLY<TAB><id8><TAB><선행 TSK,…>` = 최근 2시간 안에 너무 이른 선행으로 거부됨
- 이벤트를 `team.start` 로 안 자름 (팀장 restart 해도 거부 기록 이어짐)
```bash
now=$(date +%s)
jq -c --arg a '<신원>/<host>/lead' --arg r '<MAIN>' 'select(.agent == $a and .repo == $r and (.id8 // "") != "")' ~/.dflow/events.jsonl 2>/dev/null \
  | jq -rs --argjson now "$now" '
      def t: (.ts // "");
      ($now - 7200 | todate) as $cut
      | [.[] | select(.event == "team.result" and (.status == "done" or .status == "needs-merge" or .status == "resolved"))
        | {tsk: (.tsk // ""), t: t}] as $done
      | [.[] | select(.event == "team.spawn" or .event == "team.blocked" or .event == "team.result" or .event == "team.lost")] as $ev
      | (reduce $ev[] as $e ({}; .[$e.id8] = (((.[$e.id8] // []) + [$e]) | .[-2:]))) as $last2
      | ( $last2 | to_entries[] | .value as $v
          | select(($v | length) == 2 and $v[1].event == "team.spawn" and (($v[1].spawn_kind // "new") == "new")
              and $v[0].event == "team.result" and $v[0].status == "skipped"
              and (($v[0].reason // "") | startswith("선행 미충족(사전 검사:")))
          | "AHEAD\t\(.key)" ),
        ( [$ev[] | select(.event == "team.result" and .status == "skipped"
              and ((.reason // "") | startswith("선행 미충족(설계 선행 불가:")) and t > $cut)]
          | group_by(.id8)[] | max_by(t) | t as $at
          | [.reason | ltrimstr("선행 미충족(설계 선행 불가:") | rtrimstr(")") | splits("[ ,]+") | select(. != "") | split("/") | last] as $refs
          | select(any($done[]; .t >= $at and (.tsk as $k | any($refs[]; . == $k))) | not)
          | "TOO_EARLY\t\(.id8)\t\($refs | join(","))" )'
```
시각 = `ts`(UTC `YYYY-MM-DDTHH:MM:SSZ`) 문자열끼리 비교 (선행 대기 블록과 같음).

## 4. `design_waiting` 결과 처리 (「3. 결과 처리」 표의 그 행)

- 실패 아님. slot 만 비우고 worktree 는 **안 지움** (backends.md 「고아 정리 규칙」 0번 — 마감도 같음).
  - `.dflow-agent` → `<신원>/<host>/parked` 로 바꿈 (정규 slot 스캔에서 빼고, 재개 때 「5-1」 이 되돌림)
  - tmux·Orca 회수 = 다른 결과와 같음
- `team.result`(status `design_waiting`, 사유 = 결과 줄 7번째 칸부터 — 미충족 선행 ref) 기록
  - 제외 없음 (주문이 claimed 라 poll 이 안 돌려줌)
  - 차단기 연속 수 → 0
- 결과 줄 없이 끝난 팀원 (멈춤 절차 3-4 사이 죽음 등)도 worktree state.json 이 `wait_pred` 면 같게 처리. restart.md 「재투입」 의 재투입 전 확인이 이 문서 2번을 먼저 봄
- 시작·마감 보고에 설계 완료 대기 목록(1번)을 `<id8> <TSK> 선행 대기: <ref…>` 로 한 줄씩 냄. "멈춤" 표에는 안 넣음 (사람이 할 일 없음)
