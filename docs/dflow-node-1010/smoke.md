# dflow-node-1010 회차 끝 스모크 결과

실행: 2026-10-10, dev 42b288387 (메인 체크아웃 /Users/jji/project/dmes-standard, macOS). 읽기 전용·dry-run 만 돌렸다.
실 API 쓰기·gradle·서버 재기동·머지는 넣지 않았다. 🪟 = 윈도우 PC 에서 다시 돌릴 명령(이 회차에는 돌리지 못함).

## 결과 요약

| 구분 | pass | fail | skip |
|---|---|---|---|
| node --check (dflow-work·merge·poll·team·dev 의 .mjs 29개) | 29 | 0 | 0 |
| --help (같은 29개) | 29 | 0 | 0 |
| 읽기 전용 명령 (C01~C22 + me) | 22 | 0 | 1 |
| coordinator 기존 시험 7개 파일 | 39 | 0 | 0 |

fail 은 없다. 관찰 2건은 아래 「관찰」 절. 윈도우 재실행은 🪟 표시 명령 전부.

## 1. 구문 검사 🪟

```
for f in .claude/skills/dflow-{work,merge,poll,team,dev}/scripts/*.mjs .claude/skills/coordinator/scripts/*.mjs .claude/skills/coordinator/scripts/lib/*.mjs; do node --check "$f" || echo "FAIL $f"; done
```

결과: 스킬 5개 .mjs 29개 모두 통과(`check=0`). coordinator 파일은 시험 묶음에서 간접 통과.

## 2. --help (pass 29/29)

모두 종료 코드 0. 예외 1건은 의도: `dflow.mjs --help` 는 사용법을 stderr 로 내고 rc 2(옛 dflow.sh 와 같음).
`dflow-config.mjs`·`dflow-lease.mjs` 는 라이브러리라 CLI 가 없고 `--help` 는 출력 없이 rc 0.

| 스킬 | 파일 | --help 첫 줄 |
|---|---|---|
| dflow-work | dflow.mjs | `사용법: dflow.mjs [--as <prefix|email>] <cmd> [args]` (rc 2) |
| dflow-merge | decisions.mjs | `usage: decisions.mjs merge-conflicts|renumber [-C <dir>] [--tsk <TSK>] [--order <UUID>]` |
| dflow-merge | dialect-check.mjs | `사용법: dialect-check.mjs run --dev <브랜치> [--sweep-base <sha>] | status --dev <브랜치>` |
| dflow-merge | migration-check.mjs | `사용: migration-check.mjs [-C <dir>] [--allow-out-of-order] (<기준> <대상> | --staged)` |
| dflow-merge | sweep-check.mjs | `사용: sweep-check.mjs [--dev <개발 브랜치>]` |
| dflow-poll | poll.mjs | `사용법: poll.mjs [--interval 초] [--until …] [--exclude id8,id8] …` |
| dflow-team | capacity.mjs | `사용법: capacity.mjs [--state <파일>] | capacity.mjs max | capacity.mjs usage --live <n> …` |
| dflow-team | docker-allow.mjs | `사용법: docker-allow.mjs <id8|order> [--reuse-dir <dir>] | --json` |
| dflow-team | gradle-check.mjs | Gradle 빌드 루트의 gradle.properties 권장 키 상태(읽기만) |
| dflow-team | lead-state.mjs | `--agent <이름> --repo <경로>` 재구성 요약 |
| dflow-team | lead-worktree.mjs | 두 번째 팀장용 링크드 워크트리 생성 |
| dflow-team | live-leads.mjs | `사용: live-leads.mjs [--mark]` |
| dflow-team | resolve-decide.mjs | `사용: resolve-decide.mjs <EVENTS> <LEAD_AGENT> <REPO> <id8> <DEV_SHA>` |
| dflow-team | tick.mjs | `사용: tick.mjs [--new-tick] [--may-skip] [--until …] --tm <TM> --owner … --slots <N> --until-label <표시> …` |
| dflow-team | wake.mjs · worker-trim.mjs | 기상 블록 · 첫 턴 컨텍스트 줄이기 JSON |
| dflow-dev | baseline.mjs | `사용: baseline.mjs run --base <기점> [--task-dir <dir>] [--pool docker] -- '<명령>'` |
| dflow-dev | build-trial.mjs | `사용: build-trial.mjs <external_ref> <build_model_base>` |
| dflow-dev | deps.mjs | `사용법: node deps.mjs   (cwd = 워크트리 루트)` |
| dflow-dev | free-port.mjs · sections.mjs · pred-reflected.mjs | `사용: …` |
| dflow-dev | gate-scope.mjs | `usage: gate-scope.mjs --base <기점> [--map <파일>] [--ignore <경로 접두>]… [--paths-file <파일>]` |
| dflow-dev | heavy.mjs | `사용법: heavy.mjs [--pool docker | --exclusive] [--detach] [--] <명령> … | acquire <이름> | release | status | snapshot` |
| dflow-dev | junit-count.mjs · mutate.mjs | `usage: junit-count.mjs …` · `사용법: mutate.mjs run …` (관찰 1) |
| dflow-dev | timeout-guard.mjs | `usage: <PreToolUse hook JSON> | node timeout-guard.mjs` |

## 3. 읽기 전용 명령 (메인 체크아웃에서 실행)

COORD_DRY=1 환경. 🪟 = 윈도우에서도 다시.

| ID | 명령 | 결과 | 🪟 |
|---|---|---|---|
| C01 | `node …/dflow-dev/scripts/sections.mjs docs/dflow-node-1010/README.md 1` | pass rc 0, 절 본문 출력 | 🪟 |
| C02 | `free-port.mjs` | pass rc 0, 포트 한 개(53802) | 🪟 |
| C03 | `pred-reflected.mjs` (인자 없음) | pass rc 2 `UNKNOWN usage` | 🪟 |
| C04 | `baseline.mjs list --base HEAD` | pass rc 0 `BASELINE_LIST_NONE` | 🪟 |
| C05 | `gate-scope.mjs --base HEAD~1` | pass rc 0 `GATE_SCOPE full …` | 🪟 |
| C06 | `heavy.mjs status` | pass rc 0 `HEAVY_STATUS slots=2 held=0 waiting=0` | 🪟 |
| C07 | `heavy.mjs snapshot` | pass rc 0 `PC` 줄 | 🪟 |
| C08 | `timeout-guard.mjs` (빈 입력) | pass rc 0 출력 없음 | 🪟 |
| C09 | `migration-check.mjs --staged` | pass rc 0 `MIGRATION_OK` | 🪟 |
| C10 | `sweep-check.mjs --dev dev` | pass rc 0 `SWEEP_CANDIDATES n=32 …` (dflow.mjs 호출 성공) | 🪟 |
| C11 | `dialect-check.mjs status --dev dev` | pass rc 0 `DIALECT_PENDING deferred …` / `DIALECT_STATUS none` | 🪟 |
| C12 | `decisions.mjs` (인자 없음) | pass rc 2 usage | 🪟 |
| C13 | `capacity.mjs` | pass rc 0 `CAPACITY_OK free=48% …` | 🪟 |
| C14 | `capacity.mjs max` | pass rc 0 `TEAM_MAX 4 …` | 🪟 |
| C15 | `live-leads.mjs` | pass rc 0 (다른 팀장 없음) | 🪟 |
| C16 | `lead-state.mjs --agent smoke-none --repo <루트>` | pass rc 0 `RUN …` / `EVENTS window=0 …` (빈 상태, SLOT 줄 없음) | 🪟 |
| C17 | `gradle-check.mjs` | pass rc 0 `ROOT …/poc/camel-hub-poc` / `NOFILE …` | 🪟 |
| C18 | `worker-trim.mjs` | pass rc 0 JSON 한 줄 | 🪟 |
| C19 | `coord-status.mjs` (현재 회차) | pass rc 0, `heavy=0/0/2` (heavy.mjs snapshot 을 읽음) | 🪟 |
| C20 | `COORD_DRY=1 office.mjs beat` | pass rc 0 `DRY office.mjs beat` | 🪟 |
| C21 | `tick.mjs`(coordinator) 실행 | skip: 열린 회차 상태에 쓰므로 `--help` 만 확인(통과) | |
| C22 | `close-lane.mjs smoke-none --dry-run` | pass rc 2 `상태에 없는 레인: smoke-none` (없는 레인이라 기대한 거절) | |
| C23 | `dflow.mjs me` (D'Flow 읽기 호출 1회) | pass rc 0 `ok: true` + 신원 JSON (PAT·proxy 환경에서 네트워크 통과) | 🪟 |

COORD_RUN=smoke-1010 으로 돌린 coord-status·tick·close-lane 은 회차가 없어 rc 3(`현재 회차가 없다`)이었다. 스모크 오류가 아니라 환경 문제라 COORD_RUN 없이 다시 돌려 pass.

## 4. coordinator 기존 시험 (pass 39/39) 🪟

```
node --test .claude/skills/coordinator/tests/{office,console-resolve,auto-answer,stall-check,coord-status,measure-window,close-lane}.test.mjs
```

`office.test.mjs` 의 느린 dflow 시험은 `fake-dflow.sh`(bash)를 쓴다. 윈도우에서 bash 가 없으면 skip 이 정상.

## 5. 관찰 (실패 아님, 고치는 일은 조정자가 배분)

1. (수정됨) `junit-count.mjs`·`mutate.mjs` `--help` 사용법 문구가 옛 이름 `junit-count.sh`·`mutate.sh` 를 말해서 `.mjs` 로 고쳤다. node --check·--help 확인.
2. C16 은 빈 에이전트라 SLOT 줄 출력 경로(handle 포함)는 이번에 확인하지 못했다. 팀장이 도는 회차에서 `lead-state.mjs --agent <실제> --repo <루트>` 1회로 확인한다.

## 6. 뺀 것

실 D'Flow 쓰기(claim·lease 갱신·완료 보고), `dflow-poll` 상주 시작, `build-trial`·baseline `run`·gradle 실행, 서버 재기동, 머지, 열린 회차 상태를 바꾸는 `tick.mjs` 실행.
