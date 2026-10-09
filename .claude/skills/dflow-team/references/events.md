# /dflow-team 이벤트: `~/.dflow/events.jsonl`

> 윈도우: 아래 `jq` 예시를 Bash 로 직접 칠 때는 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 를 붙인다(`_shared/platform-support.md` 「문서 속 인라인 jq」).

좌석표 설계와 같은 schema `{ts, host, repo, tsk, order, phase, event, agent}` + 이벤트별 추가 필드를 한 줄씩 append.
- 팀장이 씀. `agent` = `<신원>/<host>/lead`, `phase` = `team`.
- 기록 실패는 진행을 막지 않음.
- 재구성(SKILL.md 「팀장 상태」)은 `team.start` 이후 `team.spawn`·`team.result`·`team.blocked`·`team.answer` 를 보조 정본으로 읽음.
- 자동 재시작(`references/restart.md`)은 `team.lost` 를 `team.start` 로 자르지 않고 읽음.

## 이벤트

| 이벤트 | 시점(SKILL.md) | 추가 필드 |
|---|---|---|
| `team.start` | 「1. 시작」 5번 | `backend`, `slots`, `until`, `wp`, `scope` |
| `team.spawn` | 「5. 팀원 spawn」 6번, `references/resume.md` 9항, 「1. 시작」 5번(이어받은 슬롯 재기록) | `slot`, `id8`, `worktree`, `handle`, `spawn_kind` |
| `team.result` | 「3. 결과 처리」, 「1. 시작」 5번(이어받은 해시 재기록) | `slot`, `id8`, `status`, `worktree`, `hash`, `reason` |
| `team.blocked` | 「3. 결과 처리」·「6. blocked」, 「1. 시작」 5번(이어받은 해시·답 대기 재기록) | `slot`, `id8`, `worktree`, `hash`, `reason` |
| `team.answer` | 「6. blocked」 답 매칭, 「1. 시작」 5번(대기 중인 답 재기록) | `id8`, `answer` |
| `team.sweep` | 「4. 승인 스윕」 | `merged`, `waiting`, `rejected`, `resolved` |
| `team.conflict` | 「4-1. 머지 충돌 해소」(merge-conflict.md 「1」「4」「5」) | `id8`, `decision`, `files` |
| `team.extend` | 「인자」 실행 중 연장 | `until`, `until_label` |
| `team.lost` | 「3. 결과 처리」 재시작 판정(`references/restart.md`) | `slot`, `id8`, `worktree`, `cause`, `next`, `restart_at` |
| `team.issue` | 「2-4. 팀원 이슈 보고 처리」 1번(저장)·3번(지시 뒤 재기록) | `id8`, `summary`, `decision` |
| `team.stop` | 「7. 마감」 | 없음 |

- `team.start`:
  - `backend` = `tmux` 또는 `orca`. `slots` = 숫자.
  - `until` = `HH:MM`·`YYYY-MM-DD HH:MM`·`none`(종료 요청 전까지) 중 하나.
  - `wp` = WP 범위를 쉼표로 이은 문자열(예: `WP-2,dict/WP-3`). 전체면 `-`. 재구성이 이 값으로 poll 의 `--wp` 복원.
  - `scope` = 계약 2.11 팀장이면 늘 `server`(설계 방식은 작업마다 서버 판단, SKILL.md 「인자」).
  - 옛 줄의 `full`·`design`·`build` 는 재구성이 안 씀.
- `team.extend`:
  - `until` = `team.start` 의 `until` 과 같은 형식. `until_label` = 좌석표에 싣는 표시 문자열.
  - 재구성은 마지막 `team.extend` 를 `team.start` 의 `until` 보다 우선(SKILL.md 「팀장 상태」 요약, 전문 `references/lead-state.md` 「복원 규칙」).
- `team.spawn`:
  - `worktree` = 팀원 worktree 절대경로. 모르면 `-`.
  - `handle` = tmux 백엔드는 `tmux:<pane_id>`(예: `tmux:%3`), Orca 는 터미널 핸들. 없으면 `-`.
  - 기본 필드 `tsk`·`order` 도 채움.
  - `blocked` 는 재spawn 안 하므로 그 자리에 `team.spawn` 이 다시 오지 않음.
  - `spawn_kind` = 네 값 중 하나인 문자열:
    - `new` = 「5. 팀원 spawn」 의 새 작업.
    - `resume` = 「5-1. 재개 spawn」.
    - `resolve` = 「5-2. 해소 spawn」 의 해소 워커. 개수 = 해소 카운터(초기화 안 함, `scripts/resolve-decide.mjs`). 재개 재시도 계산은 `resolve` 줄을 세지 않음.
    - `readopt` = 「1. 시작」 5번이 이어받은 슬롯을 다시 기록한 줄.
  - `readopt` 줄은 원래 종류(`new`·`resume`·`resolve`)를 `orig_kind` 필드에 함께 실음(가드가 요구, 2026-09-23 머지 충돌). 재기록 뒤에도 해소 워커로 남게 하기 위함.
  - 판별 정본 = worktree 이름 접미사 `-resolve`(merge-conflict.md 「0」).
  - 재구성은 마지막 `team.result` 이후 **`resume` 줄 개수**로 재개 재시도 상한을 잼(`references/lead-state.md` 「고아 스캔」 2번).
  - 종류를 가르는 이유: 팀장을 다시 띄울 때마다 5번이 살아 있는 슬롯을 `team.spawn` 으로 재기록함. 안 가르면 멀쩡히 도는 팀원의 재기록이 재시도 횟수로 세어져 상한에 금방 닿음.
  - 이 필드 없는 옛 줄은 `new` 로 읽음(`.spawn_kind // "new"`).
- `team.result`·`team.blocked`:
  - `blocked` → `team.blocked`, 나머지 status → `team.result`.
  - `hash` = 결과 줄 cksum 첫 필드. `reason` = 결과 줄 7번째 칸부터(사유 또는 질문).
  - `.result` 정확한 경로 `<worktree>/<TASK_DIR>/.result` 는 `worktree` 와 기본 필드 `tsk` 만으로 안 정해짐. `TASK_DIR` 이 프로젝트의 `DOCS_DIR`(`project_map`)에 따라 달라지기 때문.
  - 재구성은 SKILL.md 「팀장 상태」 정본 블록처럼 `dflow.mjs config tasks-dirs` 로 후보 폴더를 훑어 그 worktree 안 `.result` 를 찾고, 경로별 마지막 처리 해시를 유도.
  - `status` = `.result` 의 status 칸. `failed` 이고 사유 첫 낱말이 팀장이 구분하는 값이면 붙임: `failed rate-limit`·`failed not-isolated`·`failed no-worker-flag`·`failed deps`·`failed permission`·`failed project`.
  - 결과 줄 없이 판정한 것(pane 이 죽었는데 `.result` 도 pane 화면 결과 줄도 없음) = `failed no-result`(hash `-`).
  - 해소 워커(`spawn_kind: resolve`)의 `status` = `resolved`·`skipped`·`failed <첫 낱말>`(첫 낱말 늘 붙임).
  - 재구성이 이 값으로 제외 목록과 차단기를 복원.
  - spec·TSK 부재로 걸러 spawn 안 한 작업 = `slot`·`worktree`·`hash` 를 `-`, `status` 를 `skipped`.
- `team.lost`:
  - 결과 줄 없이 멈춘 팀원을 자동 재시작 판정(`references/restart.md`)이 처리한 기록.
  - **이 손실에는 `team.result` 를 쓰지 않음.** 재시도 수가 마지막 `team.result` 에서 0 으로 돌아가므로(`references/lead-state.md` 「고아 스캔」 2번), 쓰면 상한 3 에 영영 안 닿음.
  - `cause` = `no-response` · `pane-dead` · `rate-limit` 중 하나.
  - `next` = `restart` · `wait` · `park` 중 하나. `restart` = 같은 기상에 곧바로 재투입, `wait` = 차단기·rate-limit 대기로 미룸, `park` = 멈춤.
  - `restart_at` = 재투입을 다시 볼 시각(epoch 초 문자열). 안 정해졌으면 `-`. `restart`·`park` 는 늘 `-`.
  - `evidence` = 선택 필드. rate-limit 감지 때 생존 증거 요약(restart.md 「rate-limit 대기」). 없으면 `-`.
  - 기본 필드 `tsk`·`order` 도 채움.
- `team.answer`:
  - `answer` = 사람이 준 답 한 줄. 팀장이 그 답을 팀원 화면에 넣은 **뒤에** 기록.
  - 같은 id8 의 `team.blocked` 뒤에 `team.answer` 없으면 아직 답 기다리는 질문.
  - 이 기록이 없으면 컨텍스트 압축 뒤 재구성이 이미 답한 질문을 사람에게 다시 통지.
- 제외 목록은 id8 마다 마지막 `team.spawn`·`team.blocked`·`team.result`·`team.lost` 로 정함:
  - 마지막이 `team.spawn` 이나 `team.blocked` → 진행 중(영구 제외).
  - `team.result` → 그 `status` 의 제외 칸(SKILL.md 「3. 결과 처리」).
  - `team.lost` → 진행 중(영구 제외, restart.md 「이벤트로 본 상태」).
  - `team.answer` 는 제외를 안 바꿈.
- `team.issue`:
  - 팀원의 SendMessage 이슈 보고를 저장한 기록(SKILL.md 「2-4. 팀원 이슈 보고 처리」).
  - `summary` = 이슈 보고 첫 줄(`[이슈 <TSK> <id8>] <요약>`)의 요약부.
  - `decision` = 처음 저장할 때 `pending`. 팀장이 지시를 보낸 뒤 다시 기록할 때는 결정 요약(문자열, `pending` 아님).
  - id8 마다 **마지막** `team.issue` 의 `decision` 이 `pending` 이면 아직 지시 안 보낸 이슈. 재구성이 이 값으로 미답 이슈를 찾음(SKILL.md 「팀장 상태」 「보조」, 규칙 `references/lead-state.md` 「복원 규칙」).
  - id8 가 `dialect` 인 줄 = 팀원 이슈가 아니라 방언 검증 기록(SKILL.md 「4. 승인 스윕」 방언 검증).
    - `tsk`·`order` 는 `-`. 슬롯·팀원 없음.
    - `decision` 은 처음부터 결정 요약(`사람 판단(자동 되돌리기·재오픈 없음)`)이라 `pending` 이 안 됨.
    - 재구성은 이 줄로 지시 보낼 팀원을 찾지 않음.
- `team.sweep`: 네 필드 모두 개수(숫자). `resolved` = 직전 스윕 뒤 해소 머지가 조상 확인까지 통과한 수.
- `team.conflict`:
  - `decision` = `queued`(해소 큐에 넣음)·`human`(사람 몫)·`cleared`(표시 해제) 중 하나.
  - `files` = 충돌 파일 목록(쉼표로 이음, 모르면 `-`).
  - id8 마다 마지막 `decision` 이 `cleared` 가 아니면 충돌 목록에 남음(merge-conflict.md 「5」).

### 가드(기록 명령의 설명)

- 첫 `jq` 는 줄을 만들고 둘째 `jq` 는 가드. 둘을 `&&` 로 잇는다.
  - 파이프로 이으면 첫 `jq` 가 컴파일 오류(`--arg` 하나 빠뜨려 필터에 `$slot` 이 남은 경우)로 죽어도 가드가 빈 입력을 받아 0 으로 끝남. `EVENT_ARGS_MISSING` 이 안 나옴.
  - `&&` 이면 첫 `jq` 실패가 곧바로 `|| echo` 로 감.
- 아래 중 하나면 줄을 안 붙이고 `EVENT_ARGS_MISSING` 출력:
  - 공통 다섯 필드(`ts`·`host`·`repo`·`event`·`agent`) 중 하나가 빔.
  - `phase` ≠ `team`.
  - `host` ≠ 이 PC 호스트 이름(`hostname` 의 첫 점 앞부분).
  - 위 표의 이벤트별 추가 필드 중 하나가 없거나 빔(`reason` 은 비어도 됨. `done` 결과 줄에는 사유가 없을 수 있음).
- 모르는 값은 `""` 가 아니라 `-`.
- 이유: 압축 뒤 기억으로 재구성한 명령은 인자가 비거나 추가 필드를 빠뜨리고 `host` 를 slug 로 씀. 그런 줄로는 재구성이 슬롯·해시·제외 목록을 복원 못 함.
- 이 출력이 보이면 이 문서의 명령 블록을 다시 띄워(SKILL.md 「2-3」 마지막 명령) 그대로 재실행. 기록 실패는 팀장 절차를 멈추지 않음.
- `repo` = 팀장 체크아웃 절대경로. 재구성이 이 값으로 이 리포 줄만 거름. 이름만 쓰면 같은 이름 clone 둘이 섞임.
- `<주문 전체 UUID>` = show 응답의 `.order.id`. 모르면 `-`.
- `slot` = 문자열(`2` 또는 `-`).
- `team.start` 의 `slots` 와 `team.sweep` 의 네 필드 = `--argjson` 숫자.
- `team.spawn` 의 `spawn_kind` = `--arg` 문자열. `new`·`resume`·`readopt`·`resolve` 밖의 값 금지. 다른 값은 가드는 통과하지만 재시도 계산이 그 줄을 안 셈.

## 기록 명령

결과 줄에서 해시와 사유를 뽑는다(`team.result`·`team.blocked`).
```bash
l=$(head -n 1 '<.result 경로>')
hash=$(printf '%s\n' "$l" | cksum | cut -d' ' -f1)
reason=$(printf '%s\n' "$l" | cut -d' ' -f7-)
```
한 줄을 jq 로 만들어 붙인다.
- 문자열은 모두 `--arg`. 숫자(`team.start` 의 `slots`, `team.sweep` 의 네 필드)만 `--argjson`.
- `slot` = 문자열 `2` 또는 `-`. 모르는 값은 `""` 가 아니라 `-`.
- 아래는 `team.result` 예. 다른 이벤트는 첫 `jq` 마지막 두 줄(인자와 추가 객체)만 「이벤트」 표의 필드로 바꿈.
- `EVENT_ARGS_MISSING` 이 나오면 줄이 안 붙은 것. 이 절의 블록을 그대로 재실행(기록 실패는 팀장 절차를 멈추지 않음).
- `repo` = 팀장 체크아웃 절대경로. `<주문 전체 UUID>` = show 응답의 `.order.id`(모르면 `-`).
- `team.spawn` 의 `spawn_kind` 는 `new`·`resume`·`readopt`·`resolve` 밖의 값 금지.
```bash
mkdir -p ~/.dflow && line=$(jq -nc \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg host "$(hostname | cut -d. -f1)" --arg repo '<MAIN_CHECKOUT>' \
  --arg tsk '<TSK 또는 ->' --arg order '<주문 전체 UUID 또는 ->' --arg event 'team.result' --arg agent '<신원>/<host>/lead' \
  --arg slot '<slot 또는 ->' --arg id8 '<id8>' --arg status '<status>' --arg worktree '<워크트리 또는 ->' --arg hash "$hash" --arg reason "$reason" \
  '{ts:$ts,host:$host,repo:$repo,tsk:$tsk,order:$order,phase:"team",event:$event,agent:$agent} + {slot:$slot,id8:$id8,status:$status,worktree:$worktree,hash:$hash,reason:$reason}') \
  && printf '%s\n' "$line" | jq -c --arg h "$(hostname | cut -d. -f1)" '{"team.start":["backend","slots","until","wp","scope"],"team.spawn":["slot","id8","worktree","handle","spawn_kind"],"team.result":["slot","id8","status","worktree","hash","reason"],"team.blocked":["slot","id8","worktree","hash","reason"],"team.answer":["id8","answer"],"team.sweep":["merged","waiting","rejected","resolved"],"team.conflict":["id8","decision","files"],"team.extend":["until","until_label"],"team.lost":["slot","id8","worktree","cause","next","restart_at"],"team.issue":["id8","summary","decision"],"team.stop":[]} as $req
      | if ([.ts,.host,.repo,.event,.agent] | all(. != null and . != "")) and .phase == "team" and .host == $h and $req[.event] != null
           and ([$req[.event][] as $k | has($k) and .[$k] != null and ($k == "reason" or .[$k] != "")] | all)
           and (.event != "team.spawn" or .spawn_kind != "readopt" or ((.orig_kind // "") != "")) then . else error("EVENT_ARGS_MISSING") end' \
  >> ~/.dflow/events.jsonl || echo EVENT_ARGS_MISSING
```
`team.spawn` 의 `readopt` 재기록:
- 추가 인자 줄에 `--arg orig_kind '<그 슬롯의 원래 spawn_kind>'` 추가.
- 객체에 `orig_kind:$orig_kind` 추가.
- 원래 종류 = 이어받은 슬롯 마지막 `team.spawn` 의 `orig_kind // spawn_kind`.

`team.lost`: 위 블록의 `--arg event` 를 `'team.lost'` 로 쓰고, 넷째·다섯째 줄(추가 인자 줄과 객체 줄)을 아래 두 줄로 바꾼다. `cause`·`next`·`restart_at` 값은 restart.md 가 정한다.
```text
  --arg slot '<slot 또는 ->' --arg id8 '<id8>' --arg worktree '<워크트리 또는 ->' --arg cause '<no-response|pane-dead|rate-limit>' --arg next '<restart|wait|park>' --arg restart_at '<epoch 초 또는 ->' --arg evidence '<생존 증거 요약 또는 ->' \
  '{ts:$ts,host:$host,repo:$repo,tsk:$tsk,order:$order,phase:"team",event:$event,agent:$agent} + {slot:$slot,id8:$id8,worktree:$worktree,cause:$cause,next:$next,restart_at:$restart_at,evidence:$evidence}') \
```
`team.issue`: 위 블록의 `--arg event` 를 `'team.issue'` 로 쓰고, 넷째·다섯째 줄을 아래 두 줄로 바꾼다.
- `summary` = 이슈 보고 첫 줄의 요약부.
- `decision` = 처음 저장할 때 `pending`, 지시를 보낸 뒤 다시 기록할 때는 결정 요약.
```text
  --arg id8 '<id8>' --arg summary '<이슈 보고 첫 줄의 요약부>' --arg decision '<pending 또는 결정 요약>' \
  '{ts:$ts,host:$host,repo:$repo,tsk:$tsk,order:$order,phase:"team",event:$event,agent:$agent} + {id8:$id8,summary:$summary,decision:$decision}') \
```
