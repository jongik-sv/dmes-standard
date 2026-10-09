# dflow-node-1010 회차 끝 스모크 런북

세 레인(dn-work·dn-team·dn-heavy)과 dn-merge-poll·dn-dev-small 이 dev 에 머지된 뒤 1회 돌린다.
실 API 쓰기·gradle·서버 재기동은 넣지 않았다. 🪟 표시 = 윈도우 PC 에서도 다시 돌릴 명령.

작성 시점(2026-10-10) 기준 확정 인자는 dn-merge-poll·dn-dev-small 의 LANE-REPORT.md 와 브랜치 커밋에서 읽었다.
dn-work·dn-team·dn-heavy 는 작업 중이라 파일 이름만 정본 지시에서 가져왔다. 표의 「확인 필요」 칸은 머지 뒤 `--help` 출력으로 채운다.

## 0. 준비

```
cd /Users/jji/project/dmes-standard          # 메인 체크아웃(머지 뒤 dev)
S=.claude/skills
node -v                                      # 🪟 20 이상
```

## 1. 구문 검사 (전부, 읽기 전용) 🪟

```
for f in $S/dflow-work/scripts/*.mjs $S/dflow-merge/scripts/*.mjs $S/dflow-poll/scripts/*.mjs $S/dflow-team/scripts/*.mjs $S/dflow-dev/scripts/*.mjs $S/coordinator/scripts/*.mjs $S/coordinator/scripts/lib/*.mjs; do node --check "$f" || echo "FAIL $f"; done
```

`FAIL` 줄이 없어야 한다. 윈도우 PowerShell 은 `Get-ChildItem` 으로 같은 목록을 돌린다.

## 2. 스크립트별 --help 와 읽기 전용 1건

`--help` 는 모두 🪟. 「안전 명령」은 파일·API·프로세스를 바꾸지 않는 것만 골랐다.

| 스킬 | 파일 | --help | 안전 명령 1개 | 출처 |
|---|---|---|---|---|
| dflow-work | dflow.mjs | `node $S/dflow-work/scripts/dflow.mjs --help` | `node …/dflow.mjs me` 는 서버 읽기 호출이라 PAT 가 있는 PC 에서만. 없으면 `--help` 로 끝 | 확인 필요 |
| dflow-work | dflow-config.mjs | `--help` | 확인 필요(설정 읽기 하위 명령) | 확인 필요 |
| dflow-work | dflow-lease.mjs | `--help` | 확인 필요(`status`·`list` 류 읽기만) | 확인 필요 |
| dflow-merge | migration-check.mjs | `--help` | 임시 저장소에서 `node …/migration-check.mjs --help` 의 사용법대로 인자 없이 실행해 사용법 종료 코드 확인 | LANE-REPORT |
| dflow-merge | sweep-check.mjs | `--help` | 실 리포 dry-run(옛 sh 와 같은 `SWEEP_UNKNOWN` 이 나와야 함). 인자는 `--help` 참조 | LANE-REPORT |
| dflow-merge | dialect-check.mjs | `--help` | `node …/dialect-check.mjs status` (읽기) | LANE-REPORT |
| dflow-merge | decisions.mjs | `--help` | 확인 필요(dn-merge-poll 항목 3 진행 중) | 확인 필요 |
| dflow-poll | poll.mjs | `--help` | 확인 필요(감시 시작은 하지 않는다. `--help`·`--once --dry-run` 류만) | 확인 필요 |
| dflow-team | capacity.mjs | `--help` | 확인 필요(용량 계산은 읽기) | 확인 필요 |
| dflow-team | lead-state.mjs | `--help` | `node …/lead-state.mjs --agent <이름> --repo <경로>` (읽기, `SLOT` 줄 출력) | 코디네이터 호출부 |
| dflow-team | live-leads.mjs · lead-worktree.mjs | `--help` | 확인 필요 | 확인 필요 |
| dflow-team | tick.mjs · wake.mjs · worker-trim.mjs | `--help` | `--dry-run` 이 있으면 그것만. 없으면 `--help` 로 끝 | 확인 필요 |
| dflow-team | resolve-decide.mjs · docker-allow.mjs · gradle-check.mjs | `--help` | docker-allow·gradle-check 는 판정만 하는 모드가 있을 때만 | 확인 필요 |
| dflow-dev | sections.mjs | `--help` | `node $S/dflow-dev/scripts/sections.mjs <wbs 파일> <제목>` (읽기) | LANE-REPORT |
| dflow-dev | free-port.mjs | `--help` | `node $S/dflow-dev/scripts/free-port.mjs` (포트 하나 출력, 점유 안 함) | LANE-REPORT |
| dflow-dev | pred-reflected.mjs | `--help` | `node …/pred-reflected.mjs <TASKS> <TSK> <DEV>` (읽기) | LANE-REPORT |
| dflow-dev | build-trial.mjs · gate-scope.mjs | `--help` | gate-scope `--base <기점>` 는 읽기. build-trial 은 빌드를 하므로 `--help` 로 끝 | LANE-REPORT |
| dflow-dev | baseline.mjs | `--help` | `node …/baseline.mjs list` (읽기) | LANE-REPORT |
| dflow-dev | junit-count.mjs · mutate.mjs | 인자 없이 실행해 사용법 확인 | 목록 파일 없이 실행해 사용법 종료 코드만 확인 | LANE-REPORT |
| dflow-dev | heavy.mjs | `--help` | `node $S/dflow-dev/scripts/heavy.mjs status` 와 `… snapshot` (읽기) | 확인 필요 |

`dflow-dev` 의 junit-count·mutate 호출 형태는 옛 `.sh` 와 다르다(LANE-REPORT 호출 경로 변경표 참조).

## 3. 조정자 쪽 dflow 호출 경로 (이 레인이 바꾼 곳)

조정 세션이 쓰는 스크립트라 **메인 체크아웃 상태를 쓰지 않는 DRY 모드만** 돌린다. `COORD_RUN` 은 시험용 임의 이름을 쓴다.

| 확인 | 명령 | 기대 | 🪟 |
|---|---|---|---|
| 오피스 dflow 경로 | `COORD_DRY=1 COORD_RUN=smoke-1010 node $S/coordinator/scripts/office.mjs beat` | 종료 코드 0, 경고 없음, 실 전송 없음 | 🪟 |
| 기본 dflow 경로 존재 | `ls $S/dflow-work/scripts/dflow.mjs` | 파일 있음. 없으면 office 가 조용히 건너뜀 | 🪟 |
| 폴러 DRY | `COORD_DRY=1 node $S/coordinator/scripts/console-poll.mjs --help` 가 있으면 그것. 없으면 시험 `tests/console-poll-js.test.mjs` | 통과 | 🪟 |
| 대상 판정(lead-state) | `node $S/coordinator/scripts/lib/console-resolve.mjs` 의 도움말 | `lead-state.mjs` 를 node 로 부름. `COORD_LEAD_STATE=<임의 .sh>` 이면 bash | 🪟 |
| heavy 호출 | `node $S/coordinator/scripts/coord-status.mjs` (설정 heavy.script 가 `.mjs` 인 PC) | heavy 줄이 `-/-/-` 가 아님 | 🪟 |
| 닫기 DRY | `node $S/coordinator/scripts/close-lane.mjs <레인> --dry-run` | 거부 사유에 `bg-running` 판정이 heavy snapshot 으로 나옴, 실제 닫기 없음 | |
| tick | `COORD_DRY=1 COORD_RUN=smoke-1010 node $S/coordinator/scripts/tick.mjs` | 종료 코드 0, 레인 변경 없음 | 🪟 |
| 시험 묶음 | `node --test $S/coordinator/tests/office.test.mjs $S/coordinator/tests/console-resolve.test.mjs $S/coordinator/tests/auto-answer.test.mjs $S/coordinator/tests/stall-check.test.mjs $S/coordinator/tests/coord-status.test.mjs $S/coordinator/tests/measure-window.test.mjs $S/coordinator/tests/close-lane.test.mjs` | 전부 pass | 🪟 |

`office.test.mjs` 의 느린 dflow 시험은 `fake-dflow.sh`(bash) 를 쓴다. 윈도우에서는 bash 가 없으면 skip 된다.

## 4. 판정

- 1절에 `FAIL` 없음, 2절의 `--help` 전부 종료 코드 0, 3절 기대 충족이면 통과.
- 「확인 필요」 칸은 머지 뒤 `--help` 로 명령을 확정해 이 문서를 고친다. 확정 전에는 `--help` 까지만 돌린다.
- 하나라도 어긋나면 해당 레인 담당 세션 대신 조정 세션에 `질문:` 으로 알린다.

## 5. 뺀 것

실 D'Flow 쓰기(claim·lease 갱신·완료 보고), `dflow-poll` 상주 시작, gradle·build-trial 실행, 서버 재기동, 머지 자체, 메인 체크아웃 `~/.coord` 상태 변경.
