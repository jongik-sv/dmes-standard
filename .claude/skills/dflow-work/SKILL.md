---
name: dflow-work
description: D'Flow 작업(내 작업 조회·착수·진행 보고·완료 보고)을 처리할 때 사용. "내 D'Flow 작업", "디플로우 작업", "작업 착수", "진행 보고", "작업 완료" 같은 요청에서 트리거.
---

# D'Flow 작업 처리

> 문체: 산출 문서 → `../_shared/style/Korean-STE-Writing-Guide.md`.

- 모든 호출 = 대상 리포 `.claude/skills/dflow-work/scripts/dflow.sh` (cwd = 리포 루트. `DFLOW_SH` env 있으면 그것)
- 산문 파싱 금지. **exit code 로 분기**:

| exit | 뜻 |
|---|---|
| 0 | 성공 |
| 2 | 사용법·설정·push 미완료 |
| 3 | 인증 실패 |
| 4 | 선행·상태로 진행 불가: 409 충돌·로컬 선행 차단·선행 미충족(403 바디 `code=dependency_not_met` 재매핑) |
| 5 | 권한 부족 (그 밖의 403) |
| 6 | 네트워크·서버·로컬 환경 실패 (응답 파싱·파일 쓰기 포함) |
| 7 | 기능 꺼짐 |
| 10 | 중단됨: 사람이 D'Flow 에서 작업 중단 (409 바디 `code=cancelled`). 재시도 금지, 즉시 멈춤 |
| 11 | 설계 관문: 409 `design_gate`·`design_not_accepted` (계약 2.11). stderr 끝줄 `DESIGN_GATE <code>[ <reason>]`. 재시도 금지. 서버 판단(`action`) 다시 보거나 사람이 「설계 승인」·「설계 확정」 누름 |
| 12 | 다른 PC 도는 중: 409 `runner_active` (계약 2.11). stderr 끝줄 `RUNNER_ACTIVE <runner>`. 이 세션 멈춤 (다른 PC 세션이 이어 감) |

## 시작 절차 (매 세션 1회)

0. 설정
   - dflow.sh 가 워크트리 최상위 `.dflow`(프로젝트 공통: `api_base`·`project_id`·`release_branch`)를 스스로 읽음
   - `.dflow.local`(개인: `pats`·`as`·`dev_branch`·`automerge`·`project_map`·`build_model_trial`·`build_model_trial_rate`·`build_model_trial_tasks`)도 스스로 읽음
   - 이미 export 된 env 가 이김
   - 두 파일 다 없으면 현재 디렉터리 `.env`(`DFLOW_ENV_FILE`) 읽음
   - 값 확인 = `dflow.sh config <key>`(비밀 제외)·`dflow.sh branch dev`
   - 두 파일이 모두 받는 키 = `no_docker`·`dialect_check` (`.dflow.local` 이 `.dflow` 덮음)
   - 뜻: dflow-dev `references/dev-discipline.md` 「도커 사용 규칙」. `dialect_check` 실행: dflow-merge 「방언 검증」
   - `build_model_trial*` 셋(Build 모델 시험, 기본 꺼짐) 뜻: dflow-dev `references/dev-discipline.md` 「Build 모델 시험(build_model_trial)」
1. `dflow.sh doctor` 실행 — 모든 프로필 확인, 계약 버전 검증.
   ```bash
   dflow.sh doctor
   ```
   성공(exit 0) 출력:
   ```
   base: https://d-flow.example.com
   프로필 1: OxMb1D1097Qz 맥북-에어 alice@example.com (계약 2.4, 프로젝트 3) [선택됨]
   ```
   - 계약 버전은 **major 다를 때만** 문제. "계약 major 불일치" 경고 → 사용자에게 dflow-kit(스킬 배포 킷) 최신 갱신 안내
   - minor 차이(서버 additive 확장)는 정상, 경고 없음
   - 경고 때만 메시지에 서버·스킬 양쪽 값이 찍힘 (정상 출력은 서버 값만)
   - **"계약 버전 확인 불가" 경고는 처방이 다름**: 서버 응답에 contract_version 없음. 킷 갱신으로 안 고쳐짐. 서버 배포·응답 확인

2. 프로필 여럿(`DFLOW_PATS` 에 쉼표 구분 여러 토큰)이면 `.dflow.local` 의 `as=<prefix>`(레거시 `.env` 의 `DFLOW_AS`)가 이 리포의 키를 고정.
   - prefix 확인 = `dflow.sh profiles` (토큰마다 한 줄 JSON: `prefix`·`name`·`email`·`who`·`projects`·`bound`·`selected`. `who` = 키 신원 슬러그)
   - `DFLOW_AS` 없으면 첫 토큰. doctor 가 경고
   - 한 번만 다른 키 = `--as <prefix|email>`
   - 한 계정에 키 둘이면 email 로 안 갈림 → prefix 사용
   - `DFLOW_AS` 는 prefix 만 받음

## 워크플로우

### 내 신원 확인

```bash
dflow.sh me
```

- 현재 사용자 신원·스코프·접근 가능 프로젝트 출력
- 토큰 설정 후 첫 확인용

### 목록 조회

```bash
dflow.sh [--as <prefix|email>] list [--scope available|claimed|assigned|all] [--all]
```

- 기본 `--scope available` (새 작업)
- 작업 목록 출력. 순번(1~N)을 사용자에게 그대로 보임

**옵션**:
- `--all`: 모든 프로필 작업 동시 조회 (다중 계정)
- `--scope`: available(기본), claimed, assigned, all
- `--any-project`: 프로젝트 필터 끔 (진단용)

**프로젝트 필터**:
- 서버 목록은 PAT 주인이 속한 모든 프로젝트 주문을 돌려줌
- `list` 는 이 리포에 바인딩된 프로젝트 주문만 보임: `.dflow` 의 `project_id` + `.dflow.local` 의 `project_map` 값 (레거시 `.env` 의 `DFLOW_PROJECT_ID`·`DFLOW_PROJECT_MAP`)
- 바인딩 없으면 경고와 함께 전부 보임
- `claim` 은 바인딩 밖 주문·바인딩 없는 리포에서 `PROJECT_MISMATCH`(exit 2) 거부
- 이유: 한 사람이 여러 프로젝트에 속하면 다른 프로젝트 작업을 이 리포에서 개발하게 됨

**예시**:
```bash
dflow.sh list --scope all           # 모든 상태 조회
dflow.sh --as bob@example.com list  # 다른 계정 (--as는 반드시 서브커맨드 앞)
dflow.sh list --all                 # 모든 프로필 순회
```

### 상태 확인

```bash
dflow.sh show <순번>
```

- 특정 작업 상세 조회. JSON 형식
- ref = 순번 또는 UUID 8자 접두

### 착수

```bash
dflow.sh claim <순번>
```

- 선행·상태로 진행 불가 → **exit 4 차단**. 로컬 선행 차단이든 서버 거부(403 `code=dependency_not_met`)든 같은 코드
- 이 경우 fetch/merge 후 재시도. 우회 금지

성공 시:
- `<DOCS_DIR>/tasks/<TSK>/spec.md` 캐시 생성 — **구현 전 반드시 읽음**
  - DOCS_DIR = project_map 의 그 프로젝트 키, 없으면 docs (`dflow.sh taskdir <ref>`)
  - 명세 정본 = D'Flow DB. 이 파일 = claim 시점 스냅샷
  - 스크립트가 끝에 `spec 캐시: <경로>` 출력

⚠️ **브랜치는 만들어지지 않는다**
- dflow.sh 는 git 브랜치를 생성하지 않음 (스크립트에 해당 코드 없음)
- `agent/<주문id 8자>-<slug>` 브랜치 = **호출자가 claim 직후 직접 만듦**:
```bash
git fetch origin && git switch -c agent/<주문id8>-<slug> origin/<기본브랜치>
```
- main·staging 위에서 구현 금지. done 의 push 검증은 현재 브랜치를 그대로 쓰므로, 브랜치 안 만들면 main push 사고로 이어짐

**설계 선행(계약 2.9)**:
- `dflow.sh claim <ref> --design-first` = 선행이 구현 중(`ip`)이어도 설계부터 잡음 (단계 `ds`)
- 미충족 선행 있으면 `DESIGN_FIRST_UNMET <JSON 배열>` 한 줄 추가
- 선행이 아직 착수 전이면 exit 4 + stderr `DESIGN_FIRST_TOO_EARLY`
- 설계 마치면 `dflow.sh build-start <ref>` 로 구현(`ip`)으로 넘김
  - 선행 아직이면 exit 4
  - 옛 서버(404 이고 계약 < 2.9)면 stderr `BUILD_START_UNSUPPORTED` + exit 0
  - 새 서버의 404 = exit 7
  - 404 인데 계약 버전 확인 못 하면 실패로 봄
- 서버 지원 여부 = `dflow.sh contract-ge 2.9` (exit 0 이면 지원)
- 흐름 정본: `/dflow-dev` `references/orch/design-first.md` 「설계 선행」

**설계 상태(계약 2.11)**:
- 작업마다 설계 방식(완전자동·설계 검토·구현자동)이 있고 서버가 판단을 실음
- `list` 출력 끝 두 칸 `action`·`mine`
- `show` 의 `.order.action`·`.order.mine`·`.order.design_state`·`.order.claim_scope`·`.order.runner`
- `claim <ref> [--design-first] [--scope full|design|build]` — 서버가 저장한 범위를 `CLAIM_SCOPE <범위>` 한 줄로 냄
- `build-start <ref> [--scope full|build|rework]` — 설계 관문이면 exit 11, 다른 PC 가 돌면 exit 12
- `design-done <ref>` — 설계 마치고 멈춤 (단계 `dd`)
  - 설계 검토 방식이거나 설계 범위(`--scope design`)로 claim 한 주문이면 설계 상태 `review`
  - 출력 `design-done <id8> <review|accepted|none>`
- `design-reopen <ref> --reason "<이유>"` — 설계를 사람에게 되돌림. 사유는 화면에 보임
- 옛 서버(계약 < 2.11): 두 동사 모두 stderr `DESIGN_STATE_UNSUPPORTED` + exit 7. 지원 여부 = `dflow.sh contract-ge 2.11`
- 흐름 정본: `/dflow-dev` `references/orch/start.md` 「서버 판단」·`references/orch/design.md` 「설계 받기」·「설계만 멈춤」

### 작업 폴더 조회

```bash
dflow.sh taskdir <ref>
```

- 이 작업의 작업 폴더(`<DOCS_DIR>/tasks/<TSK>`, 리포 최상위 기준 상대경로) 출력
- `<DOCS_DIR>` 를 `docs` 로 박은 고정 경로를 손으로 짓지 않음. 이 명령으로 구함

### 담당 작업 폴더 scaffold

```bash
dflow.sh scaffold
```

- 내게 배정된(assigned) 작업 중 **주문 status 가 `ready`(아무도 착수 안 한)인 것만** 골라, 바인딩된 프로젝트마다 `<DOCS_DIR>/tasks/<TSK>/state.json`(`{"tsk","order","api_base","phase":"ready"}`)을 미리 만듦
- 이미 있는 폴더 = 내용 안 보고 안 고치고 건너뜀
- 출력 한 줄: `scaffold created=N skipped=N no_ref=N` (필요하면 뒤에 안내 한 마디 추가)
- exit code:
  - **exit 2**: 바인딩 없음(`PROJECT_MISMATCH`) 또는 git 리포가 아닌 곳에서 호출(`NOT_REPO`)
  - **exit 6**: 배정 목록 파싱 실패·폴더 `mkdir`·`state.json` 쓰기·커밋 실패
  - API/인증 오류: `dflow.sh` 의 기존 exit code 그대로
- 새 파일 있고 현재 브랜치가 `dflow.sh branch dev` 값이면 커밋·push 까지 함. 아니면 파일만 남김
- **push 실패 = 로컬 커밋만 남기고 exit 0 + 경고 한 줄** (팀장 시작을 막지 않음)

### 진행 보고

```bash
dflow.sh progress <순번> <0-99> "<요약>"
```

- 진행률 **0~99 범위만 허용** (100 은 서버가 400 거부)
- 출력: 현재 상태 (e.g. `claimed`)

### heartbeat

`dflow.sh heartbeat <ref> [--phase p] [--note "<질문>"] [--agent id] [--model m]` — 진행 중 신호.
- 보고 행을 만들지 않음. 주문의 `last_heartbeat_at`·`heartbeat_phase`·`heartbeat_agent`·`heartbeat_note` 만 갱신 (`--model` 있으면 `heartbeat_model` 도, 0100)
- 평소에는 PostToolUse 훅(`~/.dflow/hooks/heartbeat.sh`)이 60초에 1회 자동 전송. 직접 부를 경우:
- 담당자 결정 대기 직전: `dflow.sh heartbeat <id8> --phase blocked --note "<질문>"`
  - 좌석표에 손 든 사람과 질문이 뜸
  - 답 받은 뒤 첫 heartbeat(훅이든 명시든, `--phase` 가 blocked 아닌 것)가 이 상태를 풂
- Phase 경계 명시: `--phase prepare|design|build|verify|refactor|rejected|reported` (`prepare` = Phase 01 준비)
- 설계 마치고 선행 기다리며 멈추기 직전: `--phase wait_pred` (계약 2.9)
  - 훅은 이 값을 안 보냄 → 직접 호출
  - 계약 2.11 이면 heartbeat 대신 `dflow.sh design-done <ref>` (단계·좌석을 한 번에 바꿈)
- 설계만(`/dflow-dev --scope design`) 마치고 사람 검토 기다리며 멈추기 직전:
  - 계약 2.11: `dflow.sh design-done <ref>`
  - 옛 서버: `--phase wait_review` (계약 2.10). 훅은 안 보냄

- `--model` = 지금 도는 Phase 서브에이전트 모델 (좌석표 명찰·등급). 훅은 state.json 의 `model` 을 실음. 생략하면 서버 값 유지
- `--agent` 기본값 = 워크트리 루트 `.dflow-agent` 첫 줄, 없으면 `claude-<host>`. 값이 `*/parked` 면 안 보냄
- claimed 아니면 exit 4, 사람이 중단한 주문(`cancelled`)이면 exit 10, 소유자 아니면 exit 5. progress·done 도 같음

### watch

`dflow.sh watch [--agent id] [--slots n] [--busy n] [--until HH:MM] [--project id] [--stop]` — 감시자 존재 신호.
- 좌석표 층 헤더의 STANDBY 배지가 이 신호로 켜지고, 마지막 신호 70분 뒤 꺼짐. `--stop` = 즉시 끔
- `poll.sh` 가 매 주기 자동 전송, `--until` 도달 시 `--stop` 전송
- 팀장(`/dflow-team`) 아래에서 poll.sh 띄울 때는 `DFLOW_WATCH=0` 으로 끔. 이유: 팀장이 `<신원>/<host>/lead` 로 직접 보냄
- 기본 agent = `<신원>/<host>/poll`
- `--project` 기본값 = `.dflow` 의 `project_id` (레거시 `.env` 의 `DFLOW_PROJECT_ID`. 없으면 전 프로젝트 = 모든 층에 표시)

### 완료 보고

**push 완료가 선행 필수** — push 없이 done 호출하면 exit 2 거부.

```bash
git push origin agent/<주문id 8자>-<slug>
dflow.sh done <순번> "<요약>" --auto-links --decisions <DOCS_DIR>/tasks/<TSK>/decisions.json
```

- `--auto-links`: git 정보(브랜치·SHA·PR URL) 자동 수집해 서버 보고
- `--decisions <file>` (계약 2.6): 스스로 고른 확인 필요 결정 목록(JSON 배열)을 보고 필드로 실음. 0건이면 `[]`
- 형식이 틀리면 push 확인·전송 전에 exit 2 로 멈춤. 경고 뜻: `references/troubleshooting.md` exit 2 절

- 보고 후 상태 = **reported(승인 대기)**
- 사용자에게 "완료했습니다"가 아니라 "승인 대기로 보고했습니다"로 전달

### 포기

```bash
dflow.sh release <순번>
```

- claim 했던 작업 포기. 상태 → ready
- 계약 2.11: 설계 상태(검토 대기·승인됨)가 있는 주문은 반납 안 됨 (exit 11, 설계 상태 스펙 D13)
- 설계만 하던 주문(`claim_scope` `design`)이 단계 `ds`·`dd` 에 있으면 설계 상태 없어도 마찬가지
- 사람이 D'Flow 에서 「설계 되돌리기」나 중단을 씀

## 금지사항 (명령형)

다음 엄격히 금지:

- **옵션은 반드시 서브커맨드 앞에** — `dflow.sh --as bob@example.com list` (O), `dflow.sh list --as bob@example.com` (X). 뒤에 붙이면 에러 없이 다른 신원으로 조용히 실행되는 오동작 발생.
- **토큰을 echo·파일 기록·명령 문자열에 보간하지 않는다** — env 확장으로만 사용.
- `DFLOW_API_BASE` 기본값을 지어내지 않는다 — 미설정 시 즉시 실패.
- `--pct 100` 또는 `progress 100` 금지. approve 시도 금지(승인은 사람 몫).
- 409 충돌을 재시도로 뚫지 않는다 — 상태를 `dflow.sh show <순번>` 으로 확인하고 사용자에게 보고.
- 실패를 성공으로 요약하지 않는다 — 정직한 상태 전달.
- git author 를 D'Flow 신원으로 바꾸지 않는다 — 커밋 author 는 PC 주인 그대로.

### 작업 대상이 wbs-web 자신이면

- `git add -A` 금지 — 항상 파일명을 명시해 stage 한다.
- 마이그레이션과 코드를 같은 커밋에 담지 않는다(G1 pre-push 훅이 검사).
- `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/components/app/*` 변경 시 'Preview 확인 필요(G2)' 를 사용자에게 경고.

## 세션 복구

로컬 상태 파일에 의존하지 않음. 언제든:

```bash
dflow.sh list --scope claimed
```

서버에서 claimed 상태 작업을 복원한다.
