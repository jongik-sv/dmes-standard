# dflow-work 상황별 절차 (SKILL.md 에서 옮김)

> 출처: `../SKILL.md` 의 시작 절차 상세·목록 옵션·설계 선행·설계 상태·taskdir·scaffold·heartbeat·watch·포기. 본문은 원문 그대로.

## 시작 절차: 설정 (원 SKILL.md 「시작 절차」 0단계)

0. 설정
   - dflow.mjs 가 worktree 최상위 `.dflow`(프로젝트 공통: `api_base`·`project_id`·`release_branch`)를 스스로 읽음
   - `.dflow.local`(개인: `pats`·`as`·`dev_branch`·`automerge`·`project_map`·`build_model_trial`·`build_model_trial_rate`·`build_model_trial_tasks`)도 스스로 읽음
   - 이미 export 된 env 우선
   - 두 파일 다 없으면 종전대로 현재 디렉터리 `.env`(`DFLOW_ENV_FILE`) 읽음
   - 값 확인 = `dflow.mjs config <key>`(비밀 제외)·`dflow.mjs branch dev`
   - 두 파일 모두 받는 키 = `no_docker`·`dialect_check` (`.dflow.local` 이 `.dflow` 덮음)
   - 뜻: dflow-dev `references/dev-discipline.md` 「도커 사용 규칙」. `dialect_check` 실행: dflow-merge 「방언 검증」
   - `build_model_trial*` 셋(Build 모델 시험, 기본 꺼짐) 뜻: dflow-dev `references/dev-discipline.md` 「Build 모델 시험(build_model_trial)」

## 시작 절차: doctor 출력과 경고 해석 (원 SKILL.md 「시작 절차」 1단계)

   성공(exit 0) 출력:
   ```
   base: https://d-flow.example.com
   프로필 1: OxMb1D1097Qz 맥북-에어 alice@example.com (계약 2.4, 프로젝트 3) [선택됨]
   ```
   - 계약 버전은 **major 다를 때만** 문제. "계약 major 불일치" 경고 → 사용자에게 dflow-kit(스킬 배포 킷) 최신 갱신 안내
   - minor 차이(서버 additive 확장) = 정상, 경고 없음
   - 경고 때만 메시지에 서버·스킬 양쪽 값 출력 (정상 출력은 서버 값만)
   - **"계약 버전 확인 불가" 경고 = 처방 다름**: 서버 응답에 contract_version 없음. 킷 갱신으로 안 고쳐짐. 서버 deploy·응답 확인

## 시작 절차: 프로필 여럿 (원 SKILL.md 「시작 절차」 2단계)

2. 프로필 여럿(`DFLOW_PATS` 에 쉼표 구분 여러 토큰)이면 `.dflow.local` 의 `as=<prefix>`(레거시 `.env` 의 `DFLOW_AS`)가 이 리포의 키 고정.
   - prefix 확인 = `dflow.mjs profiles` (토큰마다 한 줄 JSON: `prefix`·`name`·`email`·`who`·`projects`·`bound`·`selected`. `who` = 키 신원 슬러그)
   - `DFLOW_AS` 없으면 첫 토큰. doctor 가 경고
   - 한 번만 다른 키 = `--as <prefix|email>`
   - 한 계정에 키 둘이면 email 로 안 갈림 → prefix 사용
   - `DFLOW_AS` 는 prefix 만 받음

## 목록 조회: 옵션·프로젝트 필터·예시 (원 SKILL.md 「목록 조회」)

**옵션**:
- `--all`: 모든 프로필 작업 동시 조회 (다중 계정)
- `--scope`: available(기본), claimed, assigned, all
- `--any-project`: 프로젝트 필터 끔 (진단용)

**프로젝트 필터**:
- 서버 목록 = PAT 주인이 속한 모든 프로젝트 주문
- `list` 는 이 리포에 바인딩된 프로젝트 주문만 보임: `.dflow` 의 `project_id` + `.dflow.local` 의 `project_map` 값 (레거시 `.env` 의 `DFLOW_PROJECT_ID`·`DFLOW_PROJECT_MAP`)
- 바인딩 없으면 경고와 함께 전부 보임
- `claim` 은 바인딩 밖 주문·바인딩 없는 리포에서 `PROJECT_MISMATCH`(exit 2) 거부
- 이유: 한 사람이 여러 프로젝트에 속하면 다른 프로젝트 작업을 이 리포에서 개발하게 됨

**예시**:
```bash
dflow.mjs list --scope all           # 모든 상태 조회
dflow.mjs --as bob@example.com list  # 다른 계정 (--as는 반드시 서브커맨드 앞)
dflow.mjs list --all                 # 모든 프로필 순회
```

## 착수: 설계 선행·설계 상태 (원 SKILL.md 「착수」)

**설계 선행(계약 2.9)**:
- `dflow.mjs claim <ref> --design-first` = 선행이 구현 중(`ip`)이어도 설계부터 잡음 (단계 `ds`)
- 미충족 선행 있으면 `DESIGN_FIRST_UNMET <JSON 배열>` 한 줄 추가
- 선행이 아직 착수 전이면 exit 4 + stderr `DESIGN_FIRST_TOO_EARLY`
- 설계 마치면 `dflow.mjs build-start <ref>` 로 구현(`ip`)으로 넘김
  - 선행 아직이면 exit 4
  - 옛 서버(404 이고 계약 < 2.9)면 stderr `BUILD_START_UNSUPPORTED` + exit 0
  - 새 서버의 404 = exit 7
  - 404 인데 계약 버전 확인 못 하면 실패로 봄
- 서버 지원 여부 = `dflow.mjs contract-ge 2.9` (exit 0 이면 지원)
- 흐름 정본: `/dflow-dev` `references/orch/design-first.md` 「설계 선행」

**설계 상태(계약 2.11)**:
- 작업마다 설계 방식(완전자동·설계 검토·구현자동) 있음. 서버가 판단을 실음
- `list` 출력 끝 두 칸 `action`·`mine`
- `show` 의 `.order.action`·`.order.mine`·`.order.design_state`·`.order.claim_scope`·`.order.runner`
- `claim <ref> [--design-first] [--scope full|design|build]` — 서버가 저장한 범위를 `CLAIM_SCOPE <범위>` 한 줄로 출력
- `build-start <ref> [--scope full|build|rework]` — 설계 관문이면 exit 11, 다른 PC 가 돌면 exit 12
- `design-done <ref>` — 설계 마치고 멈춤 (단계 `dd`)
  - 설계 검토 방식이거나 설계 범위(`--scope design`)로 claim 한 주문이면 설계 상태 `review`
  - 출력 `design-done <id8> <review|accepted|none>`
- `design-reopen <ref> --reason "<이유>"` — 설계를 사람에게 되돌림. 사유가 screen 에 보임
- 옛 서버(계약 < 2.11): 두 동사 모두 stderr `DESIGN_STATE_UNSUPPORTED` + exit 7. 지원 여부 = `dflow.mjs contract-ge 2.11`
- 흐름 정본: `/dflow-dev` `references/orch/start.md` 「서버 판단」·`references/orch/design.md` 「설계 받기」·「설계만 멈춤」

## 작업 폴더 조회 (원 SKILL.md 「작업 폴더 조회」)

```bash
dflow.mjs taskdir <ref>
```

- 이 작업의 작업 폴더(`<DOCS_DIR>/tasks/<TSK>`, 리포 최상위 기준 상대경로) 출력
- `<DOCS_DIR>` 를 `docs` 로 박은 고정 경로 직접 짓기 금지. 이 명령으로 구함

## 담당 작업 폴더 scaffold (원 SKILL.md 「담당 작업 폴더 scaffold」)

```bash
dflow.mjs scaffold
```

- 내게 배정된(assigned) 작업 중 **주문 status 가 `ready`(아무도 착수 안 한)인 것만** 골라, 바인딩된 프로젝트마다 `<DOCS_DIR>/tasks/<TSK>/state.json`(`{"tsk","order","api_base","phase":"ready"}`)을 미리 만듦
- 이미 있는 폴더 = 내용 안 보고 안 고치고 건너뜀
- 출력 한 줄: `scaffold created=N skipped=N no_ref=N` (필요하면 뒤에 안내 한 마디 추가)
- exit code:
  - **exit 2**: 바인딩 없음(`PROJECT_MISMATCH`) 또는 git 리포 아닌 곳에서 호출(`NOT_REPO`)
  - **exit 6**: 배정 목록 파싱 실패·폴더 `mkdir`·`state.json` 쓰기·commit 실패
  - API/인증 오류: `dflow.mjs` 의 기존 exit code 그대로
- 새 파일 있고 현재 branch 가 `dflow.mjs branch dev` 값이면 commit·push 까지 함. 아니면 파일만 남김
- **push 실패 = 로컬 commit 만 남기고 exit 0 + 경고 한 줄** (팀장 시작 안 막음)

## heartbeat (원 SKILL.md 「heartbeat」)

`dflow.mjs heartbeat <ref> [--phase p] [--note "<질문>"] [--agent id] [--model m]` — 진행 중 신호.
- 보고 행 안 만듦. 주문의 `last_heartbeat_at`·`heartbeat_phase`·`heartbeat_agent`·`heartbeat_note` 만 갱신 (`--model` 있으면 `heartbeat_model` 도, 0100)
- 평소에는 PostToolUse 훅(`~/.dflow/hooks/heartbeat.sh`)이 60초에 1회 자동 전송. 직접 호출 시:
- 담당자 결정 대기 직전: `dflow.mjs heartbeat <id8> --phase blocked --note "<질문>"`
  - 좌석표에 손 든 사람과 질문 표시
  - 답 받은 뒤 첫 heartbeat(훅이든 명시든, `--phase` 가 blocked 아닌 것)가 이 상태 해제
- Phase 경계 명시: `--phase prepare|design|build|verify|refactor|rejected|reported` (`prepare` = Phase 01 준비)
- 설계 마치고 선행 기다리며 멈추기 직전: `--phase wait_pred` (계약 2.9)
  - 훅은 이 값 안 보냄 → 직접 호출
  - 계약 2.11 이면 heartbeat 대신 `dflow.mjs design-done <ref>` (단계·좌석을 한 번에 바꿈)
- 설계만(`/dflow-dev --scope design`) 마치고 사람 검토 기다리며 멈추기 직전:
  - 계약 2.11: `dflow.mjs design-done <ref>`
  - 옛 서버: `--phase wait_review` (계약 2.10). 훅은 안 보냄

- `--model` = 지금 도는 Phase 서브에이전트 모델 (좌석표 명찰·등급). 훅은 state.json 의 `model` 을 실음. 생략하면 서버 값 유지
- `--agent` 기본값 = worktree 루트 `.dflow-agent` 첫 줄, 없으면 `claude-<host>`. 값이 `*/parked` 면 안 보냄
- claimed 아니면 exit 4, 사람이 중단한 주문(`cancelled`)이면 exit 10, 소유자 아니면 exit 5. progress·done 도 같음

## watch (원 SKILL.md 「watch」)

`dflow.mjs watch [--agent id] [--slots n] [--busy n] [--until HH:MM] [--project id] [--stop]` — 감시자 존재 신호.
- 좌석표 층 헤더의 STANDBY 배지가 이 신호로 켜지고, 마지막 신호 70분 뒤 꺼짐. `--stop` = 즉시 끔
- `poll.mjs` 가 매 주기 자동 전송, `--until` 도달 시 `--stop` 전송
- 팀장(`/dflow-team`) 아래에서 poll.mjs 띄울 때는 `DFLOW_WATCH=0` 으로 끔. 이유: 팀장이 `<신원>/<host>/lead` 로 직접 보냄
- 기본 agent = `<신원>/<host>/poll`
- `--project` 기본값 = `.dflow` 의 `project_id` (레거시 `.env` 의 `DFLOW_PROJECT_ID`. 없으면 전 프로젝트 = 모든 층에 표시)

## 포기 (원 SKILL.md 「포기」)

```bash
dflow.mjs release <순번>
```

- claim 했던 작업 포기. 상태 → ready
- 계약 2.11: 설계 상태(검토 대기·승인됨) 있는 주문은 반납 안 됨 (exit 11, 설계 상태 스펙 D13)
- 설계만 하던 주문(`claim_scope` `design`)이 단계 `ds`·`dd` 에 있으면 설계 상태 없어도 마찬가지
- 사람이 D'Flow 에서 「설계 되돌리기」나 중단을 씀
