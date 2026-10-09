# /dflow-team spawn 상세

SKILL.md 「5. 팀원 spawn」·「5-2」·「5-3」 에서 옮긴 절 모음(원문 그대로). 팀원을 띄우는 5번 단계, 해소 spawn 세부, 입장 제어 알림·기준값을 다룰 때 Bash `cat` 으로 읽음. 입장 제어의 집행 명령과 `CAPACITY_*` 판정은 SKILL.md 「5-3」 에 있음.

## 5번 띄우기: tmux·Orca 단계

   - **pane(tmux)**: 팀장 체크아웃에서
     `git worktree add --detach <MAIN>/.claude/worktrees/dflow-<id8> origin/<기본브랜치>` 로 워크트리 생성.
     1. `.dflow.local`(레거시 `.env`)·스킬 링크 연결.
     2. 포인터를 `<워크트리>/.dflow-prompt` 에, 실행 스크립트를 `<워크트리>/.dflow-run` 에 씀.
     3. 서버 없으면 `new-session`, 있으면 `split-window` 로 pane 생성 (명령 전문 = backends.md 「pane(tmux)」).
     4. pane id 를 `<워크트리>/.dflow-pane` 에 씀.
     5. `allow-set-title off` 설정 → `select-pane -T` 로 이름표 `w<slot> · <TSK> <id8> · <작업 이름>`.
     6. **이어서 폴더 신뢰 확인 루프 필수** (넘기면 팀원이 첫 화면에서 멈춰 슬롯 하나가 놂).
     - 기점 = `origin/<기본브랜치>` 명시. 스택 기점은 `/dflow-dev` Phase 01 2번이 claim 전에 맞춤.
   - **pane(Orca)**:
     1. backends.md 「pane(tmux)」 스폰 블록의 처음(입장 제어 두 줄 포함)부터 `chmod +x "$WT/.dflow-run"` 줄까지 **그대로, 한 번의 Bash 호출 안에서** 실행.
     2. 이어서 (tmux 의 `has-session` 대신) backends.md 「pane(Orca)」 의 `orca terminal create --worktree "path:$WT" … --command ./.dflow-run --json` 블록 실행.
     3. `WT` = tmux 와 같은 `<MAIN>/.claude/worktrees/dflow-<id8>`.
     4. 결과 JSON 핸들을 슬롯 표와 `$WT/.dflow-pane` 에 저장. 핸들 없으면 화면 읽기 없이 git·서버 증거만 사용.
     5. **이어서 폴더 신뢰 확인 루프 필수** (backends.md 「pane(Orca)」 「폴더 신뢰 확인」).
        `I trust this folder` 가 보이면 키를 보내지 않고 "사람 확인 필요"로 보고.
     6. 이후 이 워크트리는 `--worktree "path:$WT"` 선택자로 가리킴.


## 5-2. 해소 spawn 세부

- 재개 다음·대기 큐보다 먼저 띄움.
- 동시 상한 `max(1, ⌊인원/2⌋)` (인원 = 「인자」 인원 상한으로 자른 뒤 값. 16GB PC 기본 상한 4 면 해소 2개까지).
- claim 안 함.
- tmux·Orca 띄우기, 신뢰 확인 루프, 이름표(`w<slot> · 해소 <TSK> <id8>`)는 5번과 같음.
- 입장 제어도 같음 (「5-3」): merge-conflict.md 가 backends.md 공용 스폰 블록을 그대로 돌리므로 그 첫 단계가 집행.
- `SPAWN_DEFERRED_CAPACITY` 면:
  - 해소 큐에 그대로 둠.
  - merge-conflict.md 「2」 5-7번(`team.spawn`·표시 note·감시 루프 항목) 안 함.
  - 띄우지 않았으므로 해소 시도로 안 셈. `team.spawn`(`resolve`) 줄 수 = 해소 카운터이고 그 id8 을 진행 중(영구 제외)으로 만들기 때문.

## 5-3. 입장 제어: 알림·기준값

- `CAPACITY_UNKNOWN`(rc=0): 판정 불가 OS 이거나 측정 명령 실패. 막지 않고 띄움 (성능 보호이지 보안 가드 아님).
  - 일부 항목만 못 읽었으면 `unknown=` 에 적히고, 읽은 항목으로 판정.
- **알림은 줄 끝이 `notify=1` 일 때만** 사람에게 한 줄.
  - `CAPACITY_LOW` → "자원 부족으로 새 팀원 보류: <출력 줄>"
  - `CAPACITY_OK` → "자원 회복, 팀원 spawn 재개"
  - `CAPACITY_UNKNOWN` → "자원 판정 불가(막지 않음): <출력 줄>"
  - `notify=0` 이면 알리지 않음.
  - 상태 파일(git-path `dflow-team.capacity`) = 마지막 판정과 시각 기록. 판정이 바뀔 때만 `notify=1` → `TICK` 마다나 컨텍스트 압축 뒤 같은 알림 반복 없음.
- 기준값 정본 = `capacity.mjs` 머리. 하나라도 걸리면 `CAPACITY_LOW`:
  - macOS 메모리 압박 warn 이상
  - 여유 메모리 30% 미만
  - 5분 load average 가 코어당 2.0 초과
  - 무거운 명령 슬롯의 대기자 수 ≥ 슬롯 수 (`heavy_wait=<대기>/<슬롯>`, `heavy.mjs status` 첫 줄에서 읽음)
- 스왑은 RAM 의 150% 이상일 때만 막는 극단 안전망 (macOS 스왑은 압박이 풀린 뒤에도 몇 시간씩 남음).
- `heavy.mjs status` 를 못 읽으면 그 항목만 판정 안 함 (`unknown=heavy`).
- 사람이 바꾸려면 팀장 세션 환경변수 `DFLOW_CAP_MIN_FREE_PCT`·`DFLOW_CAP_MAX_LOAD_PER_CPU`·`DFLOW_CAP_MAX_SWAP_PCT` 로 덮음.
