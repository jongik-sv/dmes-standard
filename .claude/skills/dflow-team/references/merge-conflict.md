# /dflow-team 머지 충돌 해소 — 팀장 쪽 절차 (정본)

> 윈도우: 아래 `jq` 예시를 Bash 로 직접 칠 때 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 붙임(`_shared/platform-support.md` 「문서 속 인라인 jq」).

> 설계 정본: wbs-web 리포 docs/superpowers/specs/2026-09-23-parallel-merge-conflict-design.md §4~§8(킷에는 미동봉).

SKILL.md 「4-1. 머지 충돌 해소」·「5-2. 해소 spawn」 이 이 문서를 가리킴.
충돌 접수·해소 spawn·해소 결과·사람 머지 감지 기상에서 Bash `cat` 으로 읽음(컨텍스트 압축 뒤에도 그때 다시 읽음).
해소 워커 쪽 규칙 = `resolve-prompt.md`.

## 0. 상태와 불변식

- **해소 큐**: 해소하기로 정했으나 아직 못 띄운 id8.
  - 메모리 캐시, 재구성 안 함 (다음 스윕이 같은 충돌을 다시 내기 때문).
- **충돌 목록**: 표시를 풀어야 할 id8.
  - `team.conflict` 이벤트로 남김. id8 별 마지막 `decision` ≠ `cleared` (「5」 의 jq).
- **해소 슬롯**: 워크트리 이름이 `-resolve` 로 끝나는 슬롯 (`<MAIN>/.claude/worktrees/dflow-<id8>-resolve`, 두 백엔드 공통. 옛 방식 Orca 워크트리 = `<MAIN>/dflow-<id8>-resolve`).
  - `spawn_kind` 로 가르지 않음 (팀장 재기동 시 「1. 시작」 5번이 `spawn_kind: readopt` 로 다시 적음. `orig_kind` 는 옛 줄에 없음).
  - 판별 정본 = 워크트리 이름. 해소 결과 처리(「4」)·차단기(「6」)·동시 해소 상한이 모두 사용.
- **동시 해소 상한** = `max(1, ⌊인원/2⌋)`.
  - 세는 대상 = 위 판별(워크트리 접미사 `-resolve`)로 고른 해소 슬롯. 답 기다리는 `blocked` 해소 워커 포함.
  - 초과분은 해소 큐에 남김.
  - (`blocked` 해소 워커가 슬롯을 쥐므로, 상한 없으면 충돌 많은 밤에 모든 슬롯이 사람을 기다리며 섬.)
- 해소는 이 신원의 주문(`mine`)만 함. 같은 신원+프로젝트 팀장은 lease 하나로 묶임.
- `LEASE_LOST` 마감·잠금 상실 마감·「7. 마감」 진입 뒤 해소 새로 안 띄움 (spawn 이므로).
  - 떠 있는 해소 워커는 워커와 같이 끝까지 함.
- 해소 워커는 **워커 자동 재시작(H) 대상 아님**.
  - 결과 없이 죽으면 `failed no-result` 판정, `team.lost` 안 씀.
  - 해소 카운터(`spawn_kind == "resolve"` 개수) 1 증가.
  - 다음 스윕에서 충돌 다시 나면 「1」 로만 다시 띄움.

## 1. 충돌 접수

「4. 승인 스윕」 보고의 `머지 실패(충돌) <파일,…>` 마다 실행.

1. **주문 확인**
   ```bash
   (node .claude/skills/dflow-work/scripts/dflow.mjs show '<id8>') \
     | jq -c '{order: .order.id, status: .order.status, mine: .order.mine, ref: .order.item.external_ref}'
   ```
   - show 실패 → "조회 실패: <id8>" 보고, 이번에는 아무것도 안 함. 다음 스윕이 다시 냄.
   - `mine` ≠ `true` → "사람이 머지해야 함: <id8> (다른 신원의 주문) · 충돌 파일 <…>" 보고만. 표시도 안 쏨(서버 403).
   - `status` 가 `reported`·`approved` 아니면 보고만.
   - TSK = `ref` 의 마지막 `/` 뒤.
2. **진행 중 확인**: 같은 id8 이 해소 슬롯이나 해소 큐에 있으면 건너뜀. 스윕 도는 동안 같은 id8 이 계속 충돌로 보고되기 때문.
3. **재시도 판정**
   ```bash
   git fetch origin
   dev=$(git rev-parse origin/<개발브랜치>)
   node .claude/skills/dflow-team/scripts/resolve-decide.mjs ~/.dflow/events.jsonl '<신원>/<host>/lead' '<MAIN>' '<id8>' "$dev"; echo "rc=$?"
   ```
   | 출력 | 처리 |
   |---|---|
   | `RESOLVE <n>` | 해소 큐 끝에 `{id8, order, TSK, n, 충돌 파일}` 추가. 표시 note `충돌 <k>개(<첫 파일>…) · 해소 대기 <n>/3`. `team.conflict`(decision `queued`) |
   | `RUNNING` | 아무것도 안 함. 2번에서 걸렀어야 하므로 "재구성 누락: <id8>" 한 줄 보고. 마지막이 `blocked` 인 해소 워커도 `RUNNING` — 그 워커가 답 없이 죽으면 이 스크립트는 못 알아채고, SKILL.md 「3. 결과 처리」 의 무응답 규칙이 `failed no-result` 결과를 남겨야 풀림 |
   | `HUMAN <사유>` | "사람이 머지해야 함: <id8> (<사유>) · 충돌 파일 <…>" 보고. 표시 note `사람 머지 필요: <사유>`. `team.conflict`(decision `human`) |
   | `UNKNOWN <사유>` | 해소 안 함(fail-closed). "해소 판정 불가: <id8> (<사유>)" 보고. 표시 note `사람 머지 필요: 판정 불가`. `team.conflict`(decision `human`) |
4. **보고**: 스윕 보고에 충돌 파일 목록 포함.

## 2. 해소 spawn

「2-3」 기상 순서 4번에서 **재개 다음, 대기 큐보다 먼저** 띄움 (해소가 막힌 후속 전체를 풀기 때문).
빈 슬롯·차단기 규칙은 새 작업과 같음. 동시 해소 상한(「0」) 초과 금지. 해소 큐 맨 앞부터.

1. 슬롯 번호 결정(「팀장 상태」 발급 규칙) → `AGENT_ID = <신원>/<host>/w<slot>` 생성.
2. **작업 폴더**: 아래 출력 = `<TASKS>`, `TASK_DIR = <TASKS>/<TSK>`.
   `TASKDIR_FAILED` 면 안 띄우고 "작업 폴더 해석 실패: <id8>" 보고(해소 큐에서 뺌. 다음 스윕이 다시 냄).
   ```bash
   if grep -q '^  taskdir <ref>' .claude/skills/dflow-work/scripts/dflow.mjs; then
     td=$(node .claude/skills/dflow-work/scripts/dflow.mjs taskdir '<order>') && dirname "$td" || echo "TASKDIR_FAILED"
   else
     echo docs/tasks
   fi
   node .claude/skills/dflow-team/scripts/docker-allow.mjs '<id8>'   # DOCKER=allow|ban — 4번 해소 포인터에 옮긴다
   ```
3. **워크트리**: 남아 있으면 먼저 backends.md 「고아 정리 규칙」 2-1번으로 정리 시도.
   그래도 있으면 안 띄우고 "해소 워크트리 남아 있음: <경로>" 보고. `team.conflict` decision = `human`.
   ```bash
   W='<MAIN>/.claude/worktrees/dflow-<id8>-resolve'
   [ ! -e "$W" ] || echo "RESOLVE_WT_EXISTS $W"
   ```
   - **tmux**: backends.md 「pane(tmux)」 의 스폰 블록(「팀원 워크트리 준비」)을 그대로 한 번의 Bash 호출로 실행. 워크트리 생성(`git worktree add --detach "$WT" origin/<기본브랜치>`)도 그 블록이 함.
     바꾸는 곳 셋:
     - 블록의(입장 제어 줄 다음) `WT="<MAIN>/.claude/worktrees/dflow-<id8>"` → `WT="<MAIN>/.claude/worktrees/dflow-<id8>-resolve"`
     - `<포인터 한 줄>` → 아래 4번의 해소 포인터
     - 이름표 → `w<slot> · 해소 <TSK> <id8>`

     그 뒤 `.dflow-pane` 기록·**폴더 신뢰 확인 루프**는 같음.
   - **Orca**: tmux 와 같은 블록을 같은 `WT` 치환(`-resolve` 접미)으로 그대로 실행(입장 제어 두 줄 포함이므로 따로 부르지 않음).
     그 뒤 `chmod +x "$WT/.dflow-run"` 줄 다음을 backends.md 「pane(Orca)」 대로 `orca terminal create --worktree "path:$WT" --title 'w<slot> · 해소 <TSK> <id8>' --command ./.dflow-run --json` 으로 잇기.
     결과 핸들을 `$WT/.dflow-pane` 에 쓰고 **폴더 신뢰 확인 루프** 실행(backends.md 「pane(Orca)」와 같음).
     준비 블록이 이미 포인터를 `$WT/.dflow-prompt` 에 썼으므로 따로 안 씀.
4. **포인터 한 줄**:
   ```
   <MAIN_CHECKOUT>/.claude/skills/dflow-team/references/resolve-prompt.md 를 읽고 그 규칙대로 실행하라. TSK=<TSK> ID8=<id8> ORDER=<order 전체 UUID> AGENT_ID=<신원>/<host>/w<slot> MAIN_CHECKOUT=<팀장 체크아웃 절대경로> MODEL=<opus|sonnet|default> DEV_BRANCH=<개발브랜치> TASK_DIR=<TASK_DIR> ATTEMPT=<n> ON_REPORT=<0|1> DOCKER=<allow|ban>
   ```
   - `DOCKER` = SKILL.md 「인자」 의 「도커 허용 태그」 대로 2번 블록의 `node .claude/skills/dflow-team/scripts/docker-allow.mjs '<id8>'` 출력값 (개발 워커와 같음. 옛 포인터 값 옮겨 쓰기 금지).
   - `MODEL` = 이번 실행의 인자 (해소도 같은 모델).
   - `ON_REPORT` = `AUTOMERGE_ON` 이면 `1`.
5. `team.spawn` 기록. 필드는 「5. 팀원 spawn」 6번과 같고 `spawn_kind` = `resolve`.
   - 이 줄 개수가 해소 카운터이므로 `new` 로 적으면 상한이 동작 안 함.
   - id8 은 진행 중으로 영구 제외에 넣음.
6. 표시 note → `해소 중 w<slot> <n>/3` (「3」).
7. 감시 루프(SKILL.md 「2-2」 `tick.mjs`)를 새로 띄울 때 이 슬롯의 인자 항목 = `'<워크트리>/<TASK_DIR>/.result|<해시 또는 ->|<pane id 또는 ->'`.
   이 리포에서 `TASK_DIR` = `docs/tasks/<TSK>` 라 워커 슬롯과 모양이 같음.

## 3. 표시 heartbeat 대리 호출

해소 워커는 서버를 안 부르므로 팀장이 대신 쏨.
- 주문 참조 = **전체 UUID**. `reported`·`approved` 주문은 목록 캐시에 없을 수 있어 id8 해석이 실패하기 때문.
- `--agent` = 늘 팀장 자신.
```bash
node .claude/skills/dflow-work/scripts/dflow.mjs heartbeat '<order 전체 UUID>' --agent '<신원>/<host>/lead' --phase merge_conflict --note '<note>' || echo "MC_MARK_FAILED $?"
node .claude/skills/dflow-work/scripts/dflow.mjs heartbeat '<order 전체 UUID>' --agent '<신원>/<host>/lead' --clear-merge-conflict || echo "MC_MARK_FAILED $?"
```
- 출력 = `MERGE_CONFLICT_SET`·`MERGE_CONFLICT_CLEARED`·`MERGE_CONFLICT_ABSENT` 중 하나. `ABSENT` 는 오류 아님(이미 풀림).
- note 는 500자 이하. 파일은 첫 하나와 개수만.
- `MC_MARK_FAILED` 나와도 팀장 멈추지 않고 보고에 한 줄 적음. 표시는 부가 기능.

| 시점 | note |
|---|---|
| 충돌 접수(해소 큐) | `충돌 <k>개(<첫 파일>…) · 해소 대기 <n>/3` |
| 해소 spawn | `해소 중 w<slot> <n>/3` |
| 해소 워커 `blocked` | `해소 결정 대기: <질문>` |
| 재시도 가능한 실패 | `해소 대기(재시도 가능): <status> <n>/3` |
| 상한 초과·재시도 불가 | `사람 머지 필요: <사유>` |
| `resolved` 조상 확인, 사람 머지 감지 | 해제(`--clear-merge-conflict`) |

## 4. 해소 결과 처리

결과 줄 찾기·해시·`team.result`·`team.blocked` 기록·tmux 회수 = SKILL.md 「3. 결과 처리」 와 같음.
해소 슬롯(「0」 의 판별 — 워크트리 이름 접미사 `-resolve`)이면 그 절의 status 표 대신 아래 표 사용.
- `team.result` 의 `status` = `resolved`·`skipped`·`failed <첫 낱말>`.
- 해소 워커의 실패에는 첫 낱말을 **늘 붙임** (`resolve-decide.mjs` 가 그 값으로 가름).
- 워크트리는 backends.md 「고아 정리 규칙」 2-1번으로 정리. 결과 줄 branch 칸이 `-` 여도 1번(부트스트랩 실패) 쓰지 않음.
- SKILL.md 「3. 결과 처리」 에 결과 사유를 문제 기록으로 남기는 블록이 있는 판이면, `resolved` 도 `done`·`needs-merge` 처럼 사유를 안 적음.

| status | 슬롯 | 표시 | 그 밖 |
|---|---|---|---|
| `resolved` | 해제 | 먼저 조상 확인(아래). 참이면 해제 + `team.conflict`(decision `cleared`). 거짓이면 표시 유지, "해소 push 확인 불가: <id8>" 보고 + `team.conflict`(decision `human`) | 조상 참이면 선행 계열 일시 제외 해제(「4. 승인 스윕」 의 일시 제외 해제), 다음 `team.sweep` 의 `resolved` 에 1 더하고, **곧바로 승인 스윕** (따로 한 번 더가 아니라 이 기상의 스윕 1회 — SKILL.md 「4-0. 스윕을 부르는 규칙」. `sweep-check.mjs` 가 `SWEEP_NONE` 이면 안 부름. 해소 워커가 이미 머지했으므로 남은 후보가 없을 수 있음). 보고 "해소됨: <TSK> <id8> (<사유>)". 주문이 `approved` 였으면 "해소 내용은 승인 범위 밖 — 머지 커밋·resolution.md 확인" 추가 |
| `skipped` | 해제 | `pred-reflected.mjs '<TASKS>' '<TSK>' '<개발브랜치>'` 가 `REFLECTED` 면 해제 + `team.conflict` `cleared`. 아니면 note `해소 건너뜀: <사유>` | "해소 대상 아님: <id8> (<사유>)" 보고 |
| `blocked` | 유지 | note `해소 결정 대기: <질문>` | SKILL.md 「6. blocked」 통지와 `references/blocked-seat.md` 「답 넣기 (tmux)」 의 답 매칭 그대로. 통지 문구 앞에 "(해소)" 추가 |
| `failed push-race`·`failed rate-limit`·`failed no-result` | 해제 | note `해소 대기(재시도 가능): <status> <n>/3` | 다음 스윕에서 충돌 다시 나면 「1」 이 재시도 판정 |
| 그 밖의 `failed …` | 해제 | note `사람 머지 필요: <status> <사유>` | "사람이 머지해야 함: <id8> (해소 실패 <status>)" 보고 + `team.conflict`(decision `human`). `failed permission` 은 거부된 명령을 권한 목록 재료로 함께 보고 |

`resolved` 의 조상 확인:
```bash
git fetch origin && git merge-base --is-ancestor '<결과 줄 head>' origin/<개발브랜치>; echo "anc=$?"
```
- `<결과 줄 head>` = 결과 줄 넷째 칸의 **전체 sha** (`resolve-prompt.md` 「결과 줄」).
- 짧은 값이 오면 모호할 수 있으므로 `git rev-parse --verify -q '<값>^{commit}'` 로 먼저 전체 sha 로 변환. 실패하면 조상 확인 거짓과 같이 처리.
- 해제를 스윕 보고에 기대지 않는 이유: 해소 워커가 머지하면 `/dflow-merge` 뒷정리가 원격 agent 브랜치를 지움.
  그래서 다음 스윕에서 그 주문은 후보가 아니고, "머지됨" 줄을 기다리면 표시가 영영 남음.

## 5. 사람 머지 감지

스윕을 판정하는 기상마다 실행.
- SKILL.md 「4-0. 스윕을 부르는 규칙」 — `SWEEP_NONE` 이라 `/dflow-merge` 를 안 부른 기상도 실행. 사람이 머지하면 agent 브랜치가 지워져 후보가 없기 때문.
- 대상 = 충돌 목록 중 해소 슬롯·해소 큐에 없는 id8. id8 마다 사람이 손으로 머지했는지 확인.
```bash
jq -rs --arg a '<신원>/<host>/lead' --arg r '<MAIN>' '[.[] | select(.agent == $a and .repo == $r and .event == "team.conflict")] | group_by(.id8) | map(last) | .[] | select(.decision != "cleared") | [.id8, .tsk, .order] | @tsv' ~/.dflow/events.jsonl 2>/dev/null
```
줄마다 「2」 2번 블록으로 `<TASKS>` 를 구한 뒤 `pred-reflected.mjs '<TASKS>' '<TSK>' '<개발브랜치>'` 호출.
- `REFLECTED` → 표시 해제 + `team.conflict`(decision `cleared`) 기록 + "사람 머지 확인: <id8>" 보고.
- 그 밖 → 아무것도 안 함.

## 6. 차단기

해소 워커의 **내용 실패** `failed gate`·`failed push-race`·`failed push-hook`·`failed push-other`·`failed not-detached`·`failed dirty-dev-state` = `not-assignee` 처럼 **세지도 끊지도 않음** (의미 충돌 두 건으로 차단기가 걸리면 해소가 풀려던 정지가 되돌아오기 때문).
- **환경 실패**(`rate-limit`·`no-result`·`deps`·`permission`·부트스트랩 실패 값)만 워커와 같이 셈.
- 실패 아닌 결과(`resolved`·`skipped`·`blocked`)는 워커와 같이 연속 수를 0으로 되돌림.
- 재구성에서 해소 워커 여부 = id8 별 마지막 `team.spawn` 의 워크트리 이름으로 가름(「0」).
  `readopt` 줄이 `spawn_kind` 를 덮어도 워크트리와 `orig_kind` 가 남으므로, 팀장 재기동 뒤에도 해소 워커의 내용 실패가 차단기에 안 세짐.

해소 워커 id8 목록:
```bash
jq -rs --arg a '<신원>/<host>/lead' --arg r '<MAIN>' '[.[] | select(.agent == $a and .repo == $r and .event == "team.spawn")] | group_by(.id8) | map(last) | .[] | select(((.worktree // "") | test("-resolve/?$")) or .spawn_kind == "resolve" or (.orig_kind // "") == "resolve") | .id8' ~/.dflow/events.jsonl 2>/dev/null
```

## 7. 마감

해소 워커도 다른 팀원과 같이 기다림(`references/closing.md` 2번).
- 마감은 남은 `merge_conflict` 표시를 안 지움. 사람이 봐야 하기 때문.
- 마감 보고에 충돌 목록(「5」 jq) 함께 기재.
