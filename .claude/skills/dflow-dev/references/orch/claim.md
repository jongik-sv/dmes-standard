# /dflow-dev 단계 — 기점 이동·claim·브랜치

SKILL.md 「단계 지도」 가 가리킬 때 읽음. 다 읽기 전 단계 시작 금지. 모든 단계 공통 규칙(게이트 집행 원칙·상태 모델·서버 통신) = SKILL.md.

### 재claim 잔재 격리(상태 모델)

- **재claim 시 이전 시도 잔재 격리**: claim 할 작업의 `<TASKS>/<TSK>/` 이미 있으면 `<TASKS>/<TSK>.prev-<날짜>/` 로 옮긴 뒤 시작 (stale state 로 Phase 건너뜀 방지).
- 예외 (옮기지 않음):
  - **반려 재작업**: 산출물이 심사 대상이었던 그 트리 → 그 위에서 고침
  - **재개**: show 가 `status=claimed` + `mine=true` 면 이미 잡은 작업 → claim·격리 안 함. 격리는 **신규 claim 경로에서만** (잘못 돌면 design.md 가 `.prev-` 로 밀려 Design 부터 다시 함)
  - **scaffold 가 만든 폴더**: 폴더 안에 `state.json` 하나만 있고 `phase=ready` 면 잔재 아님 (`dflow.mjs scaffold` 가 미리 만든 자리). `order`·`api_base` 를 이번 claim 값으로 덮어쓴 뒤 진행 (남이 만든 ready 파일도 같음). 파일이 더 있거나 `phase` ≠ `ready` 면 종전대로 격리
  - **범위 `build`(구현자동)의 설계 폴더**: 위 scaffold 예외의 「`state.json` 하나만」 조건과 무관. 사람이 「설계 확정」 한 design.md 든 폴더 = 입력. 옮기지 않음, state.json 있으면 `order`·`api_base` 를 이번 claim 값으로 덮어씀 (없으면 `prepare` 쓰기에서 생성)

### 기점 이동과 claim

   - **claim 전 기점 이동은 항상 함.** 옮기기 전 원래 위치 기록.
     ```bash
     git symbolic-ref -q --short HEAD || git rev-parse HEAD
     ```
     그 다음 기점이 `origin/<기본브랜치>` 여도 detach (무관한 branch HEAD 를 보고 claim 이 exit 4 를 내지 않게).
     ```bash
     git fetch origin && git switch --detach <기점>
     ```
     해당 agent branch(`agent/<주문id8>-*`) 이미 있으면(재개) detach 대신 그 branch 로 switch.
   - 기점 이동 실패 → claim 안 하고 중단·보고 (detach·재개 branch switch 모두. 워커 = `.result` 에 `failed detach`). 거부된 switch 는 HEAD 를 안 옮김 → 복귀할 것 없음.
   - claim 이 `PROJECT_MISMATCH`(exit 2)로 거부 = 그 주문이 이 리포에 바인딩된 D'Flow 프로젝트 밖이거나 리포에 바인딩(`.dflow` 의 `project_id`·`.dflow.local` 의 `project_map`) 없음. 재시도 없이 원래 위치로 돌아가 중단·보고. 워커는 `.result` 에 `failed project <메시지>`.
   - **사람 설계 초안 확인(계약 2.11, 범위 `design`·`full`)**: 기점 이동에서 받은 origin 으로 `git cat-file -e origin/<기본브랜치>:<TASKS>/<TSK>/design.md` 확인 (`<TASKS>/<TSK>` = `dflow.mjs taskdir <ref>`).
     - exit 0 = 개발 branch 에 사람이 쓴 설계 초안 있음 → claim 안 하고 원래 위치로 돌아가 `"{TSK} 사람 설계 초안 있음 — 방식을 구현자동으로 바꾸거나 초안을 지우세요"` 로 알림 (에이전트 설계가 초안을 옮기거나 덮지 않게)
     - 범위 `build` = 이 확인 안 함 (그 design.md 가 입력)
   - **claim 명령**: `dflow.mjs contract-ge 2.9` exit 0 이면 늘 `dflow.mjs claim <ref> --design-first` (선행이 모두 충족돼도 그렇게 — 단계 `ds` 가 늘 "설계 중" 뜻 갖게). 아니면 종전 `dflow.mjs claim <ref>`.
     - 출력에 `DESIGN_FIRST_UNMET` 줄 있으면 설계 선행 모드 (「설계 선행」 1)
     - exit 4 + stderr `DESIGN_FIRST_TOO_EARLY` 면 아래 재시도 안 함 (선행 착수 전에는 다시 해도 같음) → 원래 위치로 돌아가 "선행 <ref:stage…> 이 구현 전이라 설계 선행 불가" 보고
   - **범위(계약 2.11)**: `dflow.mjs contract-ge 2.11` exit 0 이면 위 명령 끝에 `--scope <범위>`(`orch/start.md` 「서버 판단」) 붙임.
     - 출력 `CLAIM_SCOPE <범위>` 줄 = 서버가 저장한 범위 → 아래 3번 `prepare` 쓰기에서 state.json `scope` 로 기록
     - exit 11 (stderr 끝줄 `DESIGN_GATE <code>`) = 설계 관문 거부 → 아래 재시도 없이 원래 위치로 돌아가 `"{TSK} 설계 관문 거부(<code>) — 작업의 설계 방식·상태를 확인하세요"` 로 알림
   - claim exit 4 (선행·상태로 인한 진행 불가. 서버 403 `dependency_not_met` 재매핑 포함) → `git fetch origin` 뒤 기점을 다시 정해(다시 옮겨) 1회 재시도. 그래도 4 면 중단·보고.
     - 우회 금지
     - merge 안 함 (기본 branch 를 사용자의 현재 branch 에 섞게 됨)
   - detach 부터 3번 `git switch -c` 성공까지 **모든 실패**(claim 실패, branch 생성 실패 포함) → 기록한 원래 위치로 복귀. branch 면 `git switch <기록한 브랜치>`, 아니면 `git switch --detach <기록한 sha>`. `git switch -` 금지 (직전 위치 ≠ 기록한 위치일 수 있음).
3. **branch 를 오케스트레이터가 직접 만듦** — dflow.mjs 는 branch 를 안 만듦(스크립트 실측).
   기점 규칙 (2번이 claim 전에 이 규칙으로 기점을 정해 HEAD 를 이미 그 기점에 옮겨 둠):
   - 기본: `origin/<기본브랜치>`
   - 선행이 approved 인데 main 미반영이거나 미승인(스택)이면 **선행 산출물 있는 agent/ branch 위**에 생성. state.json 에 `branch_base`(기점 commit sha)·`risk`(선행 반려 시 재작업)·`api_base`(상태 모델) 기록.
   ```bash
   git switch -c agent/<주문id8>-<slug> <기점>
   ```
   **agent branch 에 올라서면 곧바로 state.json `phase` 를 `prepare` 로 씀** — 설치·기준선·spec 판정 동안에도 heartbeat 훅이 신호를 보내게 함 (훅은 `ready` 를 안 보냄). claim 직후가 아니라 여기서 씀 (복귀 switch 를 막지 않게).
   - 파일 없거나 `phase` = `ready` 일 때만 씀. 재개로 이미 뒤 단계(`design` 이후)가 적혀 있으면 덮어쓰지 않음. 반려 재작업 경로(`phase=rejected`)에서는 안 씀.
   - 이 쓰기가 state.json 첫 기록이면 `order`(전체 UUID)·`api_base`(`.claude/skills/dflow-dev/references/state-model.md`) 함께 기록. commit 안 함 (다음 commit 에 실림).
   - 같은 쓰기에서 `scope` 기록 — claim 출력 `CLAIM_SCOPE` 값. 그 줄 없으면(옛 서버) 범위(`orch/start.md` 「서버 판단」).
   이미 해당 branch 면 재개. **main·staging 위에서 사이클 진행 금지** — Phase 진입 전 `git branch --show-current` 가 `agent/` 로 시작하는지 확인, 아니면 중단.
   <!-- worker:begin -->
   `--worker` 면 여기서 의존성을 설치한 뒤 4번으로(「--worker」 H).
   설치 절차 = worker-mode.md 「행 H」 — `node .claude/skills/dflow-dev/scripts/sections.mjs .claude/skills/dflow-dev/references/worker-mode.md '행 H'` 로 읽음.
   <!-- worker:end -->

**다음 단계**: claim 출력에 `DESIGN_FIRST_UNMET` 줄 있으면 `orch/design-first.md` 「1」 을 한 뒤, `orch/baseline.md`.
