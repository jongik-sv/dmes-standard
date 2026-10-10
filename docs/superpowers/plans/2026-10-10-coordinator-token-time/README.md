# 조정자 토큰·시간 개편 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 조정자 스킬에 회차 모드(token/time), 레인 안 병렬 규칙, 비-Claude 워커 풀(`pool.mjs`), 컨텍스트 토큰 상한과 `/clear` 정리, 이벤트 틱(`tick.mjs --watch`), 결정 기록(`decide`), 측정(`run-metrics.mjs`)을 넣는다.

**Architecture:** 새 설정 키는 Task 1 이 한 번에 넣어서 뒤 Task 가 공용 파일(`lib/common.mjs`·golden·`contract.md` §1.2)을 건드리지 않게 한다. 순수 계산은 `lib/session-log.mjs`·`lib/pool-core.mjs` 에 두고 CLI(`run-metrics.mjs`·`pool.mjs`)는 입출력만 맡는다. 문서 변경은 파일별로 한 Task 에 몰아서 Task 끼리 같은 파일을 고치지 않게 한다.

**Tech Stack:** Node 18.17+ ESM `.mjs`, 외부 패키지 없음, `node:test` + `node:assert/strict`, 기존 lib(`common.mjs`·`common-ext.mjs`·`jq-json.mjs`·`compat.mjs`·`js-cli.mjs`·`term.mjs`).

**Spec:** [docs/superpowers/specs/2026-10-10-coordinator-token-time-design.md](../../specs/2026-10-10-coordinator-token-time-design.md)

**문서 구성:** 공통 내용은 이 README 에 둔다. Task 는 아래 「Task 문서」 표의 5개 파일에 나눠 둔다. Task 를 맡은 사람은 README 와 해당 파일을 함께 읽는다.

**경로 약칭:** `SK` = `.claude/skills/coordinator` (작업 워크트리 기준). 모든 명령은 `SK` 에서 실행한다.

## 스펙과 다르게 정한 점

| 번호 | 스펙 | 계획 | 이유 |
|---|---|---|---|
| P1 | 5.1 상한 판정을 `ctx-usage.mjs` 에 | `tick.mjs` 에 둔다 | 지금 `CTX_OVER`·`CTX_OVER_SELF` 판정이 `tick.mjs:124-164` 에 있다. `ctx-usage.mjs` 는 측정만 한다. |
| P2 | 2.1 `start --mode` 가 state `run.mode` 기록 | `init` 은 그대로 두고 새 하위 명령 `coord-state.mjs mode <token\|time>` 이 기록한다. 값이 없으면 `mode.default`(token) | `init` 이 새 칸을 쓰면 golden 시험 `init` 18건이 깨진다. |
| P3 | 2.3 `workflow.agents_by_band` 를 모드별 값으로 바꿈 | 기존 키는 그대로 두고 `workflow.agents_by_mode` 를 추가한다. 모드 값이 있으면 그것을 쓴다 | 기존 키를 읽는 문서·사람 절차를 깨지 않는다. |
| P4 | 2.3 `lanes.max_by_mode`, 2.2 하트비트, 6.1 Workflow 항목 수 | `mode.lanes_max`·`mode.heartbeat_min`·`mode.workflow_min_items` 로 한 블록에 모은다 | state 의 `lanes` 와 이름이 겹치지 않게 한다. |
| P5 | 4.8 `pool.opencode.max`·`pool.opencode.command` 등 | `pool.opencode_max`·`pool.glm_max`·`pool.opencode_command`·`pool.glm_command` | `opencode` 는 `common.test.mjs` 의 `OPAQUE` 목록에 있어서 그 아래 키가 표에 한 줄로만 적힌다. 평평한 이름이 시험과 맞는다. |
| P6 | 7.1 결과를 `~/.coord/metrics.csv` 에 | `<state_dir>/metrics.csv` | 설정 `state_dir` 가 정본이다. 기본값이 `~/.coord` 라서 같은 위치다. |
| P7 | 5.5 `decisions` 칸 | 항목 = `{at, lane, q, text}`. 기존 요약은 `text` 를 읽으므로 그대로 두고 `lane`·`q` 를 더한다 | 기존 `summary` 출력과 호환한다. |
| P8 | 5.1 레인 정리 = `/clear` | `compact-lane.mjs --clear` 를 추가한다. 기본은 지금처럼 `/compact`. 문서가 `--clear` 를 기본 절차로 적는다 | 스크립트 기본 동작을 바꾸면 기존 시험·사람 절차가 깨진다. |
| P9 | 9절 「단계마다 회차 하나를 돌려 측정」 | 이번 구현에서는 하지 않는다. 실사용 회차에서 `run-metrics.mjs` 로 잰다 | 구현 세션에서 실제 회차를 돌릴 수 없다. |

## Global Constraints

- Node 18.17 이상, 외부 패키지 없음. ESM `.mjs`.
- 스크립트 진입 = `export async function main(argv, {env, cwd})`, 파일 끝 `if (isMain(import.meta.url)) scriptMain(main);` (`lib/js-cli.mjs`).
- 오류 = `throw new CoordDie(rc, msg)`. 종료 코드: 0 성공, 2 사용 오류, 3 설정·회차 없음, 4 외부 도구 실패, 70 내부 오류.
- 부작용 있는 스크립트는 `--dry-run` 을 지원한다. 사전 메시지는 stderr `DRY …`, 성공 줄 앞에 `DRY `.
- 머리 주석·`HELP` 상수 형식은 기존 스크립트를 따른다(`// <name>.mjs — 조정자 스크립트(node). …`, `HELP` 는 `#` 로 시작하는 줄).
- macOS 전용 명령·perl 금지. 프로세스 실행 = `runSync`/`runCmd`(`lib/common-ext.mjs`), 플랫폼 차이 = `lib/compat.mjs`.
- 시험 = `node --test tests/` (SK 에서). 새 시험 파일 = `tests/<script>.test.mjs`. 임시 폴더·설정은 `tests/tick.test.mjs` 의 `world()` 방식.
- 설정 읽기: 문자열 = `cfgSub(c, '.a.b')` (false·null 은 `''`), 객체 = `J.parse(cfgAll(c))` 뒤 `J.index`.
- state 쓰기 = coord-state.mjs 안에서는 `stUpdate`, 다른 스크립트는 `coordStateCall(c, [...])`.
- 스킬 문서(`SKILL.md`·`references/*`·`templates/*`)는 `docs/guide/Common/Korean-STE-LLM-Guide.md` 문체를 따른다.
- opencode 지시문에는 `!`·`/`·`@` 를 넣지 않는다.
- Claude 모델 ID: Opus `claude-opus-5-5`, Sonnet `claude-sonnet-5-5`. 단가($/MTok, 입력·출력·캐시 읽기): Opus 5.5 4·20·0.20, Sonnet 5.5 2·10·0.20, Haiku 5.5 0.10·0.50·0.01, Haiku 4.5 1·5·0.10, Opus 4.8 5·25·0.50. 캐시 쓰기 = 입력 단가 × 2(1시간 TTL), × 1.25(5분 TTL).
- 커밋 메시지 = Conventional Commits `type(coordinator): 한국어 요약`. 끝 두 줄 = `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` 와 `Claude-Session: https://claude.ai/code/session_01C4auNDDkCkPjgve2feUvno`. 각 Task 의 커밋 예시에 두 번째 줄이 없어도 넣는다.

## Review Focus

1. **세션 로그의 중복 줄**: 같은 assistant 메시지가 스트리밍으로 여러 줄 기록된다. `message.id`+`requestId` 로 한 번만 세지 않으면 비용이 몇 배로 부푼다. → Task 2 시험 `dedupes streamed duplicates`.
2. **풀 실행기가 죽거나 PC 가 재부팅된 뒤의 `running` 묶음**: 실행기 pid 가 없는데 `running` 으로 남으면 슬롯이 영구히 막힌다. → Task 8 `reapStale` 시험, Task 9 `status` 가 죽은 실행기를 `fail`(reason `lost`)로 정리.
3. **같은 묶음 id 를 두 번 submit**: 두 실행기가 같은 파일을 쓴다. → Task 9 시험 `submit duplicate id refused` (`POOL refused <id> duplicate`).
4. **opencode 출력에 한도 문구가 섞였지만 rc=0**: 결과가 성공처럼 보인다. → Task 8 `classify` 는 rc=0 이어도 출력 끝 4KB 에 한도 문구가 있고 보고 파일이 없으면 `ratelimit` 으로 본다. 시험 `rc0 with quota text and no report`.
5. **metrics 대상 세션 로그가 다른 프로젝트 폴더에 있음**: 레인이 다른 워크트리 폴더에서 돌면 `~/.claude/projects/<다른 폴더>/` 에 로그가 있다. 세션 ID 로 모든 프로젝트 폴더를 찾아야 한다. → Task 3 시험 `finds lane log in another project dir`.

## 파일 구조

| 파일 | 책임 | Task |
|---|---|---|
| `SK/scripts/lib/common.mjs` (`COORD_DEFAULTS`) | 새 설정 기본값 | 1 |
| `SK/tests/golden/common-defaults.json` | 기본값 golden | 1 |
| `SK/templates/config.example.json` | 기본값 사본 | 1 |
| `SK/references/contract.md` §1.2·§1.3 | 설정 표, 모델 표 모드 열 | 1 |
| `SK/references/contract.md` §2.1·§3 | state 스키마, 스크립트 표 | 12 |
| `SK/scripts/lib/session-log.mjs` (새) | jsonl 파싱·중복 제거·비용·활동 시간 (순수) | 2 |
| `SK/scripts/run-metrics.mjs` (새) | 회차 측정 CLI | 3 |
| `SK/references/closing.md` | `finish` 에 측정 단계 | 3 |
| `SK/scripts/tick.mjs` | 토큰 상한(Task 4), `--watch`·`POOL_DONE`(Task 11) | 4, 11 |
| `SK/scripts/compact-lane.mjs` | `--clear` | 5 |
| `SK/references/compact.md`, `SK/references/resume.md` | `/clear` 경로, 재독 세트 | 5 |
| `SK/scripts/coord-state.mjs` | `mode`·`decide` 하위 명령, 요약의 결정 20개 | 6 |
| `SK/templates/brief.md`, `SK/references/decompose.md`, `SK/references/workflow.md`, `SK/references/sizing.md` | 레인 병렬·모드·Workflow 조건 | 7 |
| `SK/scripts/lib/pool-core.mjs` (새) | 큐·슬롯·실패 판정·기록 (순수 + 파일 I/O 최소) | 8 |
| `SK/scripts/pool.mjs` (새) | 풀 CLI·실행기 | 9 |
| `SK/references/pool.md` (새), `SK/templates/packet.md` (새), `SK/references/spawn.md`, `SK/references/usage.md` | 풀 문서 | 10 |
| `SK/SKILL.md`, `SK/references/protocol.md`, `SK/references/help.md` | 절차 정리 | 12 |

## Task 문서

| 문서 | Task | 내용 |
|---|---|---|
| [01-measure.md](01-measure.md) | 1, 2, 3 | 설정 기반, 세션 로그 lib, `run-metrics.mjs` |
| [02-context.md](02-context.md) | 4, 5 | tick 토큰 상한, `compact-lane --clear`·문서 |
| [03-mode-parallel.md](03-mode-parallel.md) | 6, 7 | `mode`·`decide`, 레인 병렬·Workflow 문서 |
| [04-pool.md](04-pool.md) | 8, 9, 10 | `pool-core`, `pool.mjs`, 풀 문서 |
| [05-watch-skill.md](05-watch-skill.md) | 11, 12 | `tick --watch`·`POOL_DONE`, SKILL·contract 정리 |

## 실행 순서와 병렬

| 웨이브 | Task | 선행 | 겹치는 파일 |
|---|---|---|---|
| 1 | 1, 2, 6, 8 | 없음 | 없음 (각자 다른 파일) |
| 2 | 3, 4, 5, 7, 9 | 3←1·2, 4←1, 5←1, 7←1, 9←1·8 | 없음 |
| 3 | 10, 11 | 10←9, 11←4·8 | 없음 |
| 4 | 12 | 전부 | 없음 |

- 같은 웨이브의 Task 는 서로 다른 파일만 고친다. 같은 워크트리에서 병렬로 돌려도 된다. 커밋은 자기 Task 파일만 `git add <경로>` 한다.
- 각 웨이브 끝에 `node --test tests/` 전체를 한 번 돌린다.
