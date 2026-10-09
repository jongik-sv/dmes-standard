# /dflow-team 기상 상세

SKILL.md 「2-2」·「2-3」 에서 옮긴 절 모음(원문 그대로). 각 절의 요약이 SKILL.md 에 있고, 아래 때 Bash `cat` 으로 읽음: TICK 건너뛰기를 판단할 때, `resume_requests`·`LEASE_KEEP_DEAD` 가 나왔을 때, `deps_nohead` 후보가 있을 때.

> 윈도우: 아래 `jq` 예시를 Bash 로 직접 칠 때 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 를 붙임(`_shared/platform-support.md` 「문서 속 인라인 jq」).

## 변화 없는 TICK 건너뛰기 (--may-skip) 전문

**변화 없는 TICK 건너뛰기** (`--may-skip`): TICK 시각에 아래가 모두 참이면 TICK 을 내지 않고 **한 번만** 건너뜀.
- 건너뛸 때 `TICK_SKIPPED at=<epoch> next=<epoch>` 줄을 남기고 계속함.
- 건너뛴 다음 TICK 은 반드시 냄 (건너뛴 수는 세대 파일에 남아 루프를 바꿔도 이어지고 `--new-tick` 이 0 으로 되돌림).
- 그래서 팀장 기상 간격은 최대 60분.

조건 (모두 참):
- 진행 중 슬롯 (결과 줄이 `blocked` 인 것 제외)마다 생존 증거 (`references/result-handling.md` 「생존 증거」 의 셋과 heartbeat)가 루프를 띄운 때와 달라졌고 서버 status 는 그대로.
  - 한 슬롯이라도 증거가 그대로면 (팀원 무응답 30분) 깨움. 재지 못해도 깨움.
- 승인 후보 (`sweep-check.mjs`)와 그 서버 status 가 그대로 (사람의 승인·반려는 깨움). 판정 불가면 깨움.
- 종료 시각이 안 지남 (poll 이 안 떠 있을 때의 종료 시각 확인). 형식을 못 읽으면 깨움.
- `scripts/wake.mjs` (「2-3」)가 `LOCK_OK` 를 냈고, 재개 요청 조회가 성공했으며, 이 리포의 요청이 없음.
  - `LOCK_LOST`·`WATCH_FAILED`·`HOLDER_FAILED`·`LEASE_KEEP_DEAD` 면 깨움.
  - 건너뛸 때도 이 호출이 잠금 `beat` 와 좌석표 STANDBY 를 갱신 (대가: 루프를 띄운 뒤 멈춘 팀장은 한 TICK (30분) 늦게 드러남).

건너뛸 때는 진행 슬롯마다 `EVIDENCE <id8> ct=<…> report=<…> heartbeat=<…> phase=<…> dirty=<…> status=<…>` 줄도 남김.
다음 TICK 에서 이 값 = 그 슬롯의 "직전 TICK" 증거 (`references/result-handling.md` 「생존 증거」).

`--may-skip` 은 TICK 이 시각으로 할 일이 없을 때만 붙임. 아래 중 하나라도 있으면 안 붙임.
- 차단기 걸림 (TICK 마다 시험 spawn 1건).
- 재시작 대기·rate-limit 대기 있음 (`references/restart.md` 「이벤트로 본 상태」 의 `RESTART_DUE`·`RL_WAIT`·`RL_DUE`).
- 빈 슬롯이 있는데 못 띄운 후보 (대기 큐·재개 대상·해소 큐. 입장 제어로 미룬 것 포함)가 남음.
- 「7. 마감」 에 들어섬 (마감의 기다림 = `TICK` 두 번).

## resume_requests 처리 전문

**`resume_requests` = 좌석표의 「이어서 시작」 요청.**
- 사람이 멈춘 좌석의 그 버튼을 누르면 서버가 주문에 표식을 남기고 watch 응답이 그것을 실어 옴.
- 최대 50건, 오래된 것부터, 이 신원이 점유한 `claimed` 주문뿐. **프로젝트를 가리지 않음.**
- 그래서 스크립트가 이 리포 바인딩 (`DFLOW_PROJECT_ID`·`DFLOW_PROJECT_MAP`) 밖의 요청을 `reqs` 에서 빼 `other_project` 로 따로 냄.
- `other_project` 는 처리 안 함. "다른 프로젝트의 요청: <id8…>. 그 프로젝트 리포의 팀장이 처리한다" 한 줄만 보고.

처리 규칙 셋:
- `n` 이 `"NULL"` = **요청 없음이 아니라 조회 실패.** `err` 에 사유.
  - 그 기상에서는 요청을 하나도 처리하지 않고 사유를 한 줄 보고한 뒤 다음 기상에 다시 읽음.
  - 빈 배열 (`n` 이 0)과 절대 뭉개지 않음.
- `host` 가 이 PC 의 `<host>` 슬러그와 **글자 그대로 같은 것만** 「5-1. 재개 spawn」 으로 보냄 (서버가 `claimed_by` 에서 파생한 값. 팀장이 다시 계산 안 함).
  - 다른 값이면 **"멈춤" 표에 사유 `다른 PC claim` 으로 적고 띄우지 않음.**
  - 계약 2.11 이면 `host` 대신 요청의 `mine` 으로 가름 (거짓이면 「멈춤」 `다른 PC 도는 중`).
  - `design_state` 가 `review` 면 띄우지 않고 "「설계 승인」 뒤에 이어 갑니다" 를 한 줄 알림.
  - 그 밖에는 서버 판단이 `skip` 이어도 띄움 (12절 Y10).
- **팀장은 표식을 지우지 않고 확인 응답도 안 보냄.** 되살아난 워커의 첫 heartbeat 가 비우고, 회수 뒤 재claim 하는 경로에서는 claim 라우트가 지움.

`WATCH_FAILED` (watch 호출 실패)·`HOLDER_FAILED` (`lease holder` 조회 실패로 watch 를 아예 안 부름. 빈 `--holder` 로 부르면 무필터로 전체 재개 요청이 옴):
- `beat` 는 이미 갱신돼 잠금은 유효.
- 그 기상의 요청 처리만 건너뜀.

## LEASE_KEEP_DEAD 처리

`LEASE_KEEP_DEAD` = lease 갱신 프로세스가 3분 넘게 갱신 못 함 (죽었거나 서버에 못 닿음).
- **이 기상이 「2-2」 감시 루프의 `LEASE_LOST` 로 온 것이면 이 문단은 건너뛰고 그 `LEASE_LOST` 를 그대로 따름 (SKILL.md 「2-3」 기상 표).**
- 둘이 같은 기상에 함께 뜰 수 있음. **우선순위 = `LEASE_LOST`**: 곧장 「7. 마감」 의 lease 상실 마감으로 가고, 함께 뜬 `LEASE_KEEP_DEAD` 는 무시.
- 그 밖의 기상 (감시 루프의 `LEASE_LOST` 없이 이 블록만 `LEASE_KEEP_DEAD` 를 낸 경우)에서는 `dflow.mjs lease renew` 를 한 번 부름.
  - `LEASE_OK` 면: lease 상실 표식 파일 (`dflow-team.lease-lost`, 「2-2」)이 남아 있으면 먼저 지운 뒤, 「1. 시작」 6번의 lease 갱신 블록과 감시 루프를 다시 띄움 (표식이 남으면 새 루프가 곧바로 `LEASE_LOST` 로 깨움).
  - `LEASE_LOST` (exit 4)나 `LEASE_NONE` 이면 「7. 마감」 의 lease 상실 마감.
  - 그 밖의 실패는 사유를 보고하고 다음 기상에 다시 봄.

## 선행 사전 검사·선행 대기 설명

**선행 사전 검사** (`deps_unmet`): 서버 판정 `reached` 가 거짓인 선행이 하나라도 있으면 spawn 안 함.
- 워커가 무엇을 하든 `skipped` 로 끝나는 확정 skip (`reached` 거짓이면 `head_sha` 도 없고, 서버 claim 게이트도 같은 `reached` 로 거부).
- 이 검사는 워커 G 의 판정을 대신하지 않음.
- `reached` 참인 선행 (승인 대기·기본 브랜치 반영 여부·스택 기점)은 전부 워커가 판정.
- `reached` 키 없는 옛 서버 응답이나 `depends_evidence` 없는 응답은 걸러내지 않고 워커에 맡김 (판정 불가를 미충족으로 단정 안 함).
- `state.json` 의 `phase=merged` 로 거르지 않음 (단, 행 G 갈래 2 의 반영 확인은 아래 「선행 반영 사전 검사」 가 사전에 함).
- 면제된 간선 (`waived:true`, 계약 2.8)은 서버가 `reached:true` 로 주므로 이 검사에 안 걸림 — 그대로 spawn.

**선행 대기**: 이 검사로 건너뛴 작업은 일시 제외 (30분)가 아니라 선행 대기에 둠.
사유의 `<ref…>` = `deps_unmet` 원소를 공백으로 이음 (`선행 미충족(사전 검사: d/TSK-03-01 d/TSK-03-02)`). 푸는 길 셋:
- **선행 완료**: 선행 대기 블록 (아래)에서, 그 선행 TSK 의 `done`·`needs-merge`·`resolved` 결과 (`team.result`)가 건너뛴 뒤에 있으면 목록에서 뺌.
  - 이 팀의 팀원이 선행을 끝낸 경우.
  - 결과를 처리한 기상에서 블록을 다시 돌려 줄었으면 재기동 조건 (「2-1」)대로 poll 을 줄어든 `--exclude-wait` 로 다시 띄움.
- **선행 머지**: 승인 스윕이 "머지됨"·"머지됨(승인 전)" 을 냈거나 해소 워커가 `resolved` 로 끝났으면, 그 TSK 를 선행 ref 에 가진 id8 을 이번 기상의 선행 대기에서 빼고 같은 방법으로 poll 을 다시 띄움.
  - 이 해제는 이벤트에 안 남음. poll 이 그 작업을 돌려주기 전에 컨텍스트가 압축되면 블록이 다시 넣음. 그때는 아래 안전망이 품.
- **안전망**: 블록은 기록한 지 2시간 지난 것을 빼고, poll.mjs 도 `--wait-cycles 40` (2시간) 뒤 스스로 풂. 다른 PC 나 사람이 선행을 끝낸 경우처럼 이 팀장이 신호를 못 받는 갈래.

푼 작업을 팀장이 직접 띄우지 않음.
- poll 이 다시 돌려주면 이 사전 검사를 다시 하고, 여전히 막히면 새 `team.result` 로 다시 선행 대기에 들어감 (2시간 계산도 새로 시작).
- poll exit 0 의 재대조는 선행 대기도 안 봄 (일시 제외와 같은 이유).

## 선행 반영 사전 검사

**선행 반영 사전 검사** (`deps_nohead`): `deps_unmet` 이 비고 `deps_nohead` (서버 `reached` 참인데 `head_sha` 없는 선행, 즉 완료 보고 뒤 승인 전)가 비어 있지 않으면, 워커 행 G 갈래 2 의 반영 확인을 여기서 먼저 함.
- 그대로 띄우면 워커가 `skipped 선행 승인 대기` 로 끝나는 확정 skip.
- `head_sha` 있는 선행은 거르지 않음 (워커 행 B 가 그 기점에 스택).
- `git fetch origin` 은 기상마다 한 번만.
- `<TASKS>` 는 `references/merge-conflict.md` 「2」 2번 블록으로 구함. `TASKDIR_FAILED` 면 사유 `작업 폴더 해석 실패` 로 일시 제외.
- 구한 작업 폴더는 「5. 팀원 spawn」 이 다시 씀 (두 번 안 부름).
```bash
node .claude/skills/dflow-dev/scripts/pred-reflected.mjs '<TASKS>' '<선행TSK>' '<개발브랜치>'; echo "rc=$?"
```
`<선행TSK>` = `deps_nohead` 원소의 마지막 `/` 뒤.
- 하나라도 `NOT_REFLECTED` (rc=1)이면 띄우지 않음.
  - 사유 `선행 미반영(사전 검사: <ref…>)` 로 일시 제외에 넣고 `team.result` (slot `-`, status `skipped`)를 남김.
  - 그 선행이 해소 큐나 해소 슬롯에 있으면 (TSK 로 대조) 사유 `선행 미반영(머지 충돌 해소 중: <ref>)`.
  - 두 문구 모두 「선행」 으로 시작해 일시 제외 해제의 선행 계열에 듦.
- `UNKNOWN` (rc=2)은 거르지 않고 워커에 맡김. 위 「선행 사전 검사」 의 "판정 불가를 미충족으로 단정 안 함" 과 같음.
- 모두 `REFLECTED` 면 그대로 spawn.
