# 스킬 윈도우 호환 점검과 수정 계획

- 작성: 2026-10-07, 레인 skills-win(지시 skills-win-1, 회차 notice-fill2), 브랜치 `fix/skills-win-audit`
- 범위: `.claude/skills` 아래 리포에 커밋된 스킬 34개(스크립트 107개). 이 문서는 1단계(조사와 계획)의 결과이며, 큰 수정은 하지 않았다.
- 사용자 지시: 모든 스킬이 윈도우에서 호환되는지 확인한다. 특히 스크립트가 윈도우에서 실행되어야 한다. 윈도우에는 node 가 기본으로 설치되어 있다.
- 갱신(2026-10-07, 문서 정리 레인 W): 이 문서는 계획서이므로 조사 당시의 서술은 그대로 두고, 이후 레인의 결과는 「현재」로 시작하는 줄과 §3.2 의 「현재 상태」 열, §7 의 「진행 현황」, §8 의 정리(§8.1·§8.2)로 덧붙였다. 표기가 「조사 당시」인 곳과 「현재」인 곳이 다르면 「현재」가 맞다.

## 0. 요약

1. **막히는 곳은 두 가지다.** jq 가 없으면 bash 스크립트 약 20개가 실행되지 않고, python 이 없으면 python 스크립트 28개(10,707줄)가 모두 실행되지 않는다.
   - 현재(2026-10-07): 두 가지 모두 해소되었다. jq 는 `_shared/bin` 에 동봉했고(J, `4396d7e98`), python 스크립트는 mantine-aggrid-ui 의 문서 조회 스크립트 3개(L2 진행 중)를 제외하고 모두 node 로 옮겼다(§7 의 「진행 현황」).
2. **jq 는 스크립트에서 약 415줄(coordinator 약 265줄, dflow 약 150줄), 시험과 문서 예시까지 합치면 약 700곳이고 복잡한 필터(`reduce`, `capture`, `@tsv`, `def` 등)가 많다.** node 로 옮기면 사실상 재작성이라, 단일 실행 파일인 jq.exe 를 킷에 동봉하는 안을 권한다(결정 필요 D1).
   - 현재: D1 이 확정되어 jq 1.7.1 윈도우 빌드를 동봉했다(`_shared/bin/win64/jq.exe` 와 `-b` 를 붙여 부르는 래퍼 `_shared/bin/jq`). 스킬 문서의 인라인 jq 예시에는 `_shared/bin` 을 PATH 앞에 두라는 안내 줄을 넣었다(D1 레인, `5f6b62211`).
3. **python 은 node 로 이식한다(약 6,000줄과 시험 약 1,500줄).** 훅과 게이트에 걸린 oasis-contract-check 를 가장 먼저 옮긴다.
   - 현재: L1(oasis-contract-check)·L3(flyway-migration-add, adr-write)·L4(dflow-export)·L5(dflow-wbs, dflow-wbs-nlevel)·L6(인라인 python 5곳, `junit-count.sh`)가 dev 에 머지되었다. python 원본은 `tests/golden/legacy/` 로 옮겨 골든 비교용으로만 남겼고 호출은 모두 node 판이다. 남은 것은 L2(mantine-aggrid-ui)와 별도 지시인 `tools/bp-sync*` 뿐이다.
4. **Git Bash 는 Claude Code 의 필수 조건이 아니다.** 공식 문서상 Git for Windows 가 없으면 PowerShell 도구만 돈다. 이 스킬의 `.sh` 는 Git Bash 가 있어야 돌므로, 이 리포는 git 작업이 전제라 Git for Windows 설치를 전제로 한다(§1).
5. **이미 처리된 것이 많다.** 줄끝은 `.gitattributes` 의 `.claude/skills/** text eol=lf` 로 고정되어 있고, 프로세스·stat·date 차이는 `coordinator/scripts/lib/compat.sh` 가 흡수한다. perl 은 mutate.mjs 를 포함해 스크립트에서 이미 걷혔다.
6. **가장 큰 새 결함은 네이티브 Windows pid 에 `kill -0` 을 직접 쓰는 것이었다.** `compat_pid_alive` 는 있었지만 호출처가 0건이어서 idle-check 가 모든 레인을 GONE 으로 보고, office reap 이 살아 있는 조정 세션을 내리고, spawn-lane 이 새 세션을 못 찾는 문제가 있었다. 이번에 고쳤다(§6).
7. **진짜 윈도우 실행 수단은 이 PC 에 없다.** 제한 PATH 모의 시험으로 jq 의존과 `JUNIT_SUMMARY_NOPY` 를 재현했다(§2).

## 1. 전제 확인: Claude Code 윈도우 요구 사항

공식 문서(`code.claude.com/docs/en/setup.md`, `tools-reference.md`, `skills.md`)에서 확인한 내용이다.

| 항목 | 내용 | 근거 |
|---|---|---|
| Git for Windows 필수 여부 | 필수가 아니다. 없으면 셸 명령을 PowerShell 도구로 실행한다. | setup.md |
| Bash 도구의 셸 | Git Bash 가 있으면 Git Bash 로 돈다. 경로를 못 찾으면 `CLAUDE_CODE_GIT_BASH_PATH` 로 지정한다. Bash 도구와 Monitor 도구는 Git Bash 를 요구한다. | tools-reference.md |
| PowerShell 도구 | Git Bash 가 없으면 자동으로 켜지고, 있으면 계정 종류에 따라 기본값이 다르다. | tools-reference.md |
| SKILL.md 안의 `bash script.sh` | 문서에 직접 설명이 없다. Bash 도구로 실행하면 Git Bash 에서 도는 것으로 보는 것이 자연스럽다(추론). | skills.md |
| Git Bash 동봉 도구, `/tmp` 매핑, `ln -s` | 문서에 없다. 일반 지식으로 `ln -s` 는 기본이 복사이고(진짜 링크는 개발자 모드와 `MSYS=winsymlinks:nativestrict`), jq·flock·python 은 동봉되지 않는다. | 문서 밖(실기 확인 필요) |

**지시서의 가정(Git Bash 는 윈도우용 Claude Code 의 전제 조건)은 문서와 다르다.** 그러나 이 리포의 작업 흐름(git 워크트리, dflow, coordinator)은 모두 git 이 전제이므로 Git for Windows 를 설치 전제로 두는 것은 합리적이다. 이 사실을 `_shared/platform-support.md` 에 한 문단으로 적었다. PowerShell 만 있는 PC 는 bash 스크립트를 쓸 수 없으며, 지원 대상에서 제외한다.

## 2. 시험 가능 범위

이 PC 는 macOS 이고 윈도우 실행 수단(실기, VM, Wine)이 없다. 가능한 모의 시험은 다음과 같다.

| 시험 | 방법 | 결과 |
|---|---|---|
| 도구 부재 모의 | PATH 를 허용 도구 53개의 심링크만 담은 새 폴더로 제한하고(jq·python3·perl·lsof·pgrep·pkill·pbcopy·osascript 제외) `COMPAT_FORCE_OS=windows`, `COMPAT_FORCE_USERLAND=bsd` 로 대표 스크립트를 실행했다. | 아래 표 |
| CRLF 체크아웃 | `.gitattributes` 와 `git ls-files --eol` 로 확인했다. `.claude/skills` 아래 408개 파일이 모두 `i/lf w/lf` 이고 나머지 19개는 텍스트가 아니다. | 문제 없음 |
| 실행 권한 | 윈도우에는 모드 비트가 없다. Git Bash 는 shebang 으로 실행하고 SKILL.md 는 `bash <경로>` 로 부르므로 영향이 없다. | 문제 없음 |
| compat.sh 경로 시험 | `coordinator/tests/compat.sh` 가 GNU 경로와 Git Bash 경로를 흉내 낸다. | 52건 통과 |

한계는 두 가지다. 첫째, macOS 의 BSD `stat`·`date`·`sed` 가 GNU 를 대신하므로 GNU 전용 동작은 재현하지 못한다. 둘째, MSYS 의 경로 변환, 네이티브 pid, `ln -s` 복사, NTFS 권한은 재현하지 못한다. 따라서 §4 의 「추정」 표기 항목은 윈도우 PC 에서 한 번 확인해야 한다.

제한 PATH 모의 시험 결과다.

| 스크립트 | 결과 | 판정 |
|---|---|---|
| `coordinator/scripts/usage-band.sh` | `jq 가 필요하다`, rc 4 | jq 부재로 실행불가 |
| `coordinator/scripts/coord-status.sh` | `jq 가 필요하다`, rc 4 | 같음 |
| `dflow-work/scripts/dflow.sh help` | `필요한 명령이 없습니다: jq`, rc 2 | 같음 |
| `dflow-dev/scripts/junit-count.sh` | `JUNIT_SUMMARY_NOPY`, rc 2 | python 부재로 실행불가 |
| `dflow-team/scripts/capacity.sh` | `CAPACITY_UNKNOWN`(막지 않음), rc 0 | 일부 기능 꺼짐 |
| `dflow-dev/scripts/heavy.sh true` | 슬롯을 얻고 rc 0 | 단독 실행 가능 |
| `dflow-dev/scripts/free-port.sh` | 포트 출력, rc 0 | 가능 |
| `dflow-dev/scripts/deps.sh --help`, `dflow-dev/scripts/baseline.sh --help`, `dflow-team/scripts/tick.sh --help`, `dflow-merge/scripts/sweep-check.sh --help`, `dflow-poll/scripts/poll.sh --help` | 사용법 출력 | 인자 처리까지만 확인(본 기능은 jq 필요) |

위 표는 조사 당시(2026-10-07 오전)의 결과다. 현재는 jq 부재 항목(`usage-band.sh`, `coord-status.sh`, `dflow.sh help`)이 동봉 jq 로 해소되었고(`4396d7e98`), `junit-count.sh` 의 `JUNIT_SUMMARY_NOPY` 는 node 이식(L6, `b78edcd7e`)으로 사라졌고, node 가 없을 때만 `JUNIT_SUMMARY_NONODE`(rc 2)가 나온다. `junit-count.sh` 는 python 없이 node 만으로 돌며, 알 수 없는 입력은 `JUNIT_SKIP`·한 줄 오류로 알린다. `capacity.sh` 는 윈도우에서 node `os` 로 여유 메모리와 CPU 수를 얻는다(D1, `5f6b62211`).

## 3. 조사 표

파일별 세부 표는 같은 폴더의 `2026-10-07-skills-windows-compat-audit/` 에 있다(`coordinator.md`, `dflow.md`, `python.md`, `others.md`). 이 표는 소스 읽기 결과이며 실기 실행 결과가 아니다. 여기에는 스킬 단위로 요약한다. 심각도는 「실행불가」(기능이 윈도우에서 못 돈다), 「일부 기능」, 「문서만」이다. 크기는 S(몇 줄), M(한 파일에서 수십 줄), L(여러 파일이나 이식)이다.

### 3.1 런타임 의존 요약

| 의존 | 영향 파일 | 윈도우에서 |
|---|---|---|
| jq | coordinator 20여 개, dflow-work(dflow.sh 83곳 포함) 외 dflow 스킬 8개, 시험 17개 중 12개 | 실행불가(핵심 경로 전부) |
| python3 | 스크립트 28개 외에 SKILL.md 인라인 5곳, `dflow-dev/scripts/junit-count.sh`, `tools/bp-sync*`, 훅 1개, `.dflow-gates` 약 14곳 | 실행불가 |
| perl | 이미 없음(compat.sh 와 mutate.mjs 는 주석에만 언급) | 문제 없음 |
| macOS 전용 명령 | coordinator 의 auto-answer·measure-window·term-send-safe(분기 처리됨), `caffeinate`(Darwin 가드) | 문제 없음 |
| ln -s | deps.sh, lead-worktree.sh, 시험 몇 개 | 복사로 바뀌어 기능이 조용히 빠짐 |
| tmux | dflow-team 의 tmux 백엔드 | 윈도우는 Orca 백엔드 전제(문서 보강 필요) |

위 표의 「영향 파일」과 「윈도우에서」는 조사 당시 기준이다. 현재 상태는 다음과 같다.

- jq: `_shared/bin` 동봉으로 해소되었다(실행불가 → 동작). 줄끝 CRLF 와 `command -v jq` 판정은 실기 확인이 남았다(§8).
- python3: 스크립트 28개 중 죽은 코드 3개(D3)는 삭제했고, dflow-wbs 구판 3개(D4)는 export 판으로 통합해 삭제했다. 나머지는 mantine-aggrid-ui 3개(L2 진행 중)를 빼고 모두 node 로 옮겼다. 인라인 5곳, `junit-count.sh`, 훅 1개, `.dflow-gates` 는 node 호출로 바뀌었다. `tools/bp-sync*` 만 별도 지시를 기다린다(D5).
- ln -s: `deps.sh` 가 링크가 한 건도 안 걸리면 `DEPS_WARN` 한 줄을 내도록 알림을 추가했다(D1). 복사로 바뀌는 동작 자체는 그대로다.

### 3.2 스킬별 표

| 스킬 | 필요 런타임 | 깨지는 지점 | 심각도 | 수정 방향 | 크기 | 현재 상태(2026-10-07) |
|---|---|---|---|---|---|---|
| coordinator | bash, jq, orca, node(선택) | jq 필수(`lib/common.sh:75` 에서 종료). 네이티브 pid 에 `kill -0`(고침). 경로 형식 혼용(`C:/x`, `/c/x`, `C:\x`). auto-answer 의 `path_ok` 가 드라이브 문자 경로를 상대 경로로 봄(고침). load·프로세스 시작 시각을 얻지 못하는데 0 이나 빈 값으로 처리해 `QUIET yes` 가 나올 수 있음. 탭 모드가 bash 문법을 Orca 터미널로 보냄(추정). term.sh 의 `--text "/compact …"` 가 MSYS 경로 변환될 수 있음(추정). screen-cache 의 700/600 모드 검사가 NTFS 에서 항상 불신(추정). | 실행불가(jq), 나머지 일부 기능 | jq 방침(D1) 과 §6.2 수정 묶음 C1 | M | 완료: jq 동봉(J, skills-win, 4396d7e98), pid·경로 판정(skills-win, fc3bf483d), C1(skills-win-c1, 384eebb34). 실기 확인 항목은 §8 |
| dflow-work | bash, curl, jq, git | `dflow.sh` 가 시작 시 `need jq`(1046줄)로 종료. `dflow-lease.sh` 도 jq. `curl --data "$3"` 로 본문 전체를 명령줄에 넘김(윈도우 한도 약 32,767자, 추정). | 실행불가 | D1, 큰 본문은 `--data-binary @-` | M | 완료: jq 동봉(4396d7e98), `--data-binary @-`(D1, skills-win-4, 5f6b62211) |
| dflow-dev | bash, jq, python3, node | `baseline.sh` jq 12곳. `junit-count.sh` python 필수. `timeout-guard.sh` 훅이 jq 없으면 조용히 꺼짐. `pred-reflected.sh` 가 jq 없으면 `UNKNOWN`. `deps.sh` 의존성 링크가 복사로 바뀌어 한 건도 안 걸림. `mutate.mjs` 가 CRLF 소스면 변이가 전부 `anchor count=0`(추정). `heavy.sh` 의 owner pid 가 `$PPID` 폴백. | 실행불가(baseline, junit-count), 나머지 일부 기능 | D1, junit-count 를 node 로(L6), mutate.mjs 줄끝 처리(§6.2 D1) | M | 완료: jq 동봉(4396d7e98), D1(skills-win-4, 5f6b62211: mutate CRLF·deps `DEPS_WARN`·heavy 경고·timeout-guard node), junit-count 는 node(L6, skills-win-7, b78edcd7e) |
| dflow-team | bash, jq, git, tmux 또는 orca | `lead-state.sh` 의 jq 필터 90줄(실행불가). `worker-trim.sh` 가 jq 없으면 건너뜀. `docker-allow.sh` 는 항상 금지. `capacity.sh` 는 윈도우에서 `CAPACITY_UNKNOWN`(인원 조절 꺼짐). `lead-worktree.sh` 의 `ln -s` 가 복사. | 실행불가(lead-state), 나머지 일부 기능 | D1, capacity.sh 에 node `os` 분기(M) | M | 완료: jq 동봉(4396d7e98), capacity.sh 윈도우 갈래(D1, 5f6b62211). `lead-worktree.sh` 의 `ln -s` 복사는 실기 확인(§8) |
| dflow-merge | bash, git, jq | `sweep-check.sh` 가 jq 없으면 `SWEEP_UNKNOWN`(스윕을 그냥 돌림). `dialect-check.sh` 의 깊은 경로 워크트리(고침). | 일부 기능 | D1 | S | 완료: jq 동봉(4396d7e98), dialect-check `core.longpaths`(skills-win, fc3bf483d) |
| dflow-poll | bash, jq | 승인 감지가 jq 에 의존 | 실행불가 | D1 | - | 완료: jq 동봉(4396d7e98) |
| dflow-export | python3, curl | `wbs-validate`, `wbs-parse --export`, `dep-analysis`, 봉투 조립이 모두 python. 서버 계약(import v2.1, byte 동일)이 걸림. | 실행불가(업로드 경로 차단) | node 이식(L4) | L | 완료(L4, skills-win-5, 961bc7057). 업로드 봉투 조립은 L6(skills-win-7, b78edcd7e) |
| dflow-wbs | python3 | 구판 스냅샷 3개(`wbs-parse`, `wbs-validate`, `dep-analysis`)와 `decision-log`, `prd-validate`. 인라인 yaml·xlsx 5곳. `/tmp` 하드코딩(고침). | 일부 기능(생성은 가능, 검증과 입출력 불가) | export 판으로 통합, 나머지 이식(L5) | M~L | 완료(L5, skills-win-6, 6984c55ce): 구판 3개는 D4 에 따라 export 판으로 통합하고 삭제했다. 인라인 xlsx 는 L6(skills-win-7, b78edcd7e)에서 `xlsx-read`·`xlsx-write` 로, yaml 은 직접 읽기 안내로 바꿨다 |
| dflow-wbs-nlevel | python3 | `wbs-nlevel-parse` validate·export(import v2.2) | 일부 기능(업로드 게이트 불가) | node 이식(L5) | M~L | 완료(L5, skills-win-6, 6984c55ce). 업로드 봉투 조립은 L6(skills-win-7, b78edcd7e) |
| oasis-contract-check | python3 | `.claude/settings.json` 의 PostToolUse 훅이 모든 편집에서 `hook_post_edit.py` 를 실행하고, `.dflow-gates` 의 검사 줄 약 14곳도 python3 직접 호출 | 실행불가(훅이 편집마다 오류, 게이트 통과 불가) | node 이식(L1), 가장 먼저 | M | 완료(L1, skills-win-3, 04b6c524a) |
| mantine-aggrid-ui | python3, node | `aggrid_docs`, `mantine_docs`, `ui_docs` 가 모두 python. FE 검수 `audit` 와 공통 컴포넌트 `coverage` 가 필수 단계. ts 파일 6개는 예제 코드라 실행 대상이 아니다. | 일부 기능(문서 열람은 가능, 검수 자동화 불가) | node 이식(L2) | L | 진행 중(L2, 별도 레인 skills-win-l2, 아직 dev 에 머지되지 않았다) |
| flyway-migration-add | python3, Java | `migration_tool.py`, `selftest.py`. SKILL.md 의 sdkman 개인 경로(고침). | 실행불가(채번 도구) | node 이식(L3) | M | 완료(L3, skills-win-l3, 292dd47dc) |
| adr-write | python3 | `adr_tool.py`, `selftest.py` | 실행불가(린트와 채번) | node 이식(L3) | M | 완료(L3, skills-win-l3, 292dd47dc) |
| weekly-report | bash, date | `date -v` 는 BSD 전용이었다(고침: BSD/GNU 분기) | 일부 기능 → 해결 | 완료 | S | 완료(skills-win, fc3bf483d) |
| bp-update-intake, bp-workspace-sync | python3(`tools/bp-sync`) | 확장자 없는 python 스크립트라 윈도우에서 직접 실행 불가. 개인 경로 문구(고침). | 실행불가(미러 동기화 단계) | `tools/bp-sync` 이식은 별도 지시(리포 루트 `tools/`, 이 스킬 범위 밖) | M | 미착수(D5, 별도 지시) |
| classify-by-system | bash | `for … $(ls …)` 예시. Git Bash 에서 돈다. | 문서만 | Glob 도구 사용을 문서에 한 줄 | S | 완료(W, skills-win-w): Git Bash 실행 안내 한 줄을 추가했다 |
| generate-bpa, bpmn-skill | bpmn-tool(npm), bash | PowerShell `echo` 파이프가 한글 JSON 을 깨뜨릴 수 있음(추정). `install.sh` 와 `install.ps1` 은 둘 다 윈도우에서 돈다. | 문서만 | Git Bash 에서 실행하거나 임시 파일 경유를 문서에 한 줄 | S | 완료(W, skills-win-w): generate-bpa 에 한 줄을 추가했다. bpmn-skill 은 `install.ps1` 이 이미 있어 변경이 없다 |
| oasis-project-support | 없음 | `rg` 예시(고침) | 문서만 | 완료 | S | 완료(skills-win, fc3bf483d) |
| analyze-queries, analyze-service | 없음(죽은 코드) | `orchestrator.py` 는 리포에 없는 `query_cache` 를 import 해 지금도 즉시 실패한다. `phase2·3-generator.py` 는 SKILL.md:93 이 호출하지 않는다고 명시한다. `phase1-analyzer.js` 는 `path.join` 만 쓰는 사문이라 윈도우에서도 돈다. | 문제 없음(사문) | 이식 제외, 삭제 여부는 결정 필요 D3 | - | 완료(D3 삭제, skills-win-2, 4396d7e98) |
| 그 밖의 스킬 | 없음 | analyze-custom-class, analyze-plsql, analyze-table-schema, analyze-trigger, analyze-view, define-process-groups, generate-legacy, generate-process-group, git-commit, issue-brief, meeting-minutes, `_shared` 에서 셸 의존을 찾지 못했다. | 문제 없음 | - | - | - |

심링크로 다른 리포를 가리키는 스킬은 없다(`find .claude/skills -type l` 결과 0건). 따라서 정본 리포를 따로 적을 대상이 없다.

### 3.3 시험 스크립트

시험 17개 가운데 jq 없이 돌 가능성이 높은 것은 `coordinator/tests/compat.sh`(일부), `console-redact.sh`, `term-send-safe-input-state.sh`, `dflow-dev/tests/mutate.sh` 4개이다. 나머지 12개는 jq 가 없으면 첫 단계에서 실패한다. `deps-sh-no-main-write.sh` 는 심링크가 본질이라 윈도우에서는 의미가 없고, `screen-cache.sh` 와 `console-keys.sh` 는 `ln -s` 와 `chmod` 케이스가 달라진다. 모든 시험의 임시 폴더는 `${TMPDIR:-/tmp}` 형태라 하드코딩은 없다.

## 4. 공통 방침

### 4.1 jq (결정 필요 D1)

| 선택지 | 내용 | 장점 | 단점 | 크기 |
|---|---|---|---|---|
| **A. jq.exe 동봉(권장)** | 공식 jq 윈도우 단일 실행 파일(MIT, 1MB 안팎)을 `.claude/skills/_shared/bin/jq.exe` 로 두고, compat.sh 와 dflow 쪽 공용 머리말이 윈도우에서만 이 폴더를 PATH 앞에 넣는다. 설치 단계가 필요 없다. | 필터 700여 곳을 그대로 쓴다. 지시의 「node 만 있다」 전제를 만족한다(설치 불필요). | 바이너리를 리포에 커밋한다. 버전과 해시 관리가 필요하다. arm64 윈도우는 별도(추정). | M |
| B. node 이식 | dflow.sh 83곳, lead-state.sh 의 필터 90줄, coordinator 약 265줄을 node 로 재작성한다. | 외부 바이너리가 없다. | 사실상 재작성이고 시험(console-cmds, watch-summary 등)도 함께 옮겨야 한다. 두 구현을 한동안 병행해야 한다. | L(여러 레인) |
| C. 하이브리드 | 자주 쓰는 소수 경로만 node 로(`pred-reflected`, `timeout-guard`, `resolve-decide` 의 입력 파싱) 옮기고 나머지는 A. | 훅처럼 조용히 꺼지는 곳이 jq 없이도 동작한다. | A 와 함께 해야 한다. | S~M |

권장: **A 와 C 를 함께 한다.** 중요한 보완이 두 가지 있다.

1. **jq.exe 줄끝 문제(추정).** 윈도우용 jq 는 stdout 을 텍스트 모드로 열어 줄끝에 `\r` 을 붙일 수 있고(`-b/--binary` 옵션이 이 때문에 존재), 스크립트가 `$(jq -r …)` 결과를 `[ = ]` 와 `case` 로 직접 비교하므로 비교가 거의 다 어긋난다. 동봉 시점에 `printf a | jq -r . | od -c` 로 확인하고, 필요하면 공용 머리말에 `jq() { command jq -b "$@"; }` 래퍼를 둔다. `| tr -d '\r'` 파이프는 `jq -e` 의 종료 코드를 가리므로 쓰지 않는다.
2. **사전 점검.** jq 를 못 찾으면 스크립트가 각자 종료하지 말고, 공용 함수가 한 번에 안내한다(설치 방법, 동봉 위치).

기존 `_shared/platform-support.md` 는 jq 를 「설치 필요(`winget install jqlang.jq`)」로 적고 있는데, 이 안을 택하면 「동봉」으로 고친다. 회사 PC 에서 winget 이 막혀 있을 가능성이 있어 동봉이 더 안전하다(추정).

현재: 동봉안(A)으로 확정되어 `platform-support.md` 의 jq 행을 「동봉」으로 고쳤다. 줄끝은 래퍼 `_shared/bin/jq` 가 `-b` 를 붙여 부르는 방식으로 대비했다(실기 확인 항목은 §8). 하이브리드(C)로는 `timeout-guard.sh` 가 jq 가 없을 때 node 로 입력을 파싱한다(D1). jq 는 2026-10-07 에 1.7.1 에서 1.8.2 로 올렸다(보안 수정 반영, 윈도우 동봉본만 교체하고 macOS 시스템 jq 는 그대로이며, 상향 근거와 검증은 `_shared/bin/README.md`).

### 4.2 python (결정 필요 D2)

사용자 전제는 「node 만 보장」이므로 **python 스크립트는 node 로 이식한다.** 세부 원칙은 다음과 같다.

- 형식: `.mjs`. 노드 18.17 이상(`node:test`, 전역 `fetch`, `util.parseArgs`, `readdirSync` recursive)을 하한으로 한다. `platform-support.md` 가 선언한 18 이상을 18.17 로 올린다.
- 전환 방식: python 판을 즉시 지우지 않는다. 레인마다 ① node 판 추가와 골든 대조 시험 통과, ② 호출 문서(SKILL.md, README, RULE.md, FE 가이드, `.dflow-gates`, `.claude/settings.json`)를 node 로 교체, ③ python 판 삭제는 별도 커밋(사용자 승인)으로 한다.
- 골든 대조: macOS 에는 python 이 있으므로 같은 입력으로 python 판과 node 판의 stdout 을 diff 하는 시험을 둔다. 서버 계약이 걸린 `wbs-parse --export`(import v2.1, byte 동일)와 `wbs-nlevel-parse export`(v2.2), 훅 입력 계약인 `check_oasis_contract --json` 은 필수다.
- 공용 헬퍼(L0): `readText`(BOM 제거, CRLF 를 LF 로 정규화), `writeText`(LF), 종료 코드 규약(사용 오류 2, 위반 1)을 가진 인자 파서, 이진 힙, 코드포인트 순 정렬 walk.
- 주의할 python 전용 동작: 인라인 `(?i)` 와 `\Z` 정규식, `re.match` 의 암묵 앵커, 유니코드 `\w`, `str.splitlines` 의 분할 문자, 읽을 때 CRLF 자동 정규화(가장 큰 윈도우 함정), 윈도우 python 이 `write_text` 에서 CRLF 로 쓰는 점, `ui_docs` 의 `node_modules/.bin/tsc` 가 윈도우에서 `tsc.cmd` 라는 점.
- 인라인 python 5곳(yaml 읽기, xlsx 읽기, xlsx 쓰기, 봉투 조립 2곳)과 `junit-count.sh` 도 대상이다. xlsx 는 node 에 zip 표준 API 가 없어 `zlib` 로 직접 구현해야 한다(의존성 0 유지). yaml 은 소형 파서를 쓰거나 JSON 변환을 요구하는 방식으로 문서화한다.

현재: 위 원칙대로 이식했다. 공용 헬퍼는 `_shared/node/`(L0), node 하한은 18.17(D6)이다. 인라인 5곳은 L6 에서 처리했다: 봉투 조립은 `dflow-export/scripts/wbs-envelope.mjs`, xlsx 는 직접 구현한 zip(`_zip.mjs`)과 `xlsx-read.mjs`·`xlsx-write.mjs`, yaml 은 스크립트 없이 에이전트가 직접 읽도록 SKILL.md 를 고쳤다. python 판은 즉시 지우지 않고 `tests/golden/legacy/` 로 옮겨 골든 대조용으로 남겼다(L1 은 조정자의 답에 따라 L3 와 같은 방식으로, 별도 승인 없이 이 이동을 했다).

### 4.3 bash 스크립트

bash 는 Git Bash 를 전제로 하고 다음을 지킨다.

- 플랫폼 차이는 `coordinator/scripts/lib/compat.sh` 함수를 거친다. dflow-* 는 coordinator 없이 설치될 수 있으므로 직접 source 하지 않고, 필요한 6개 함수(`pid_alive`, `descendants`, `kill_tree`, `epoch_fmt`, `ps_pairs`, `sha256`)만 `dflow-dev/scripts/compat-lite.sh` 사본으로 둔다. `heavy.sh` 와 `dflow-lease.sh` 에 같은 pid 확인 코드가 중복되어 있으므로 이때 합친다. 우선순위는 jq 보다 낮다.
- 네이티브 Windows pid(Claude 세션 등)에는 `kill -0` 을 쓰지 않고 `compat_pid_alive` 를 쓴다. 이 규칙은 `platform-support.md` 규칙 5 에 이미 있지만 스크립트가 따르지 않았으므로, 린트 시험(grep) 한 건을 추가해 재발을 막는다.
- 경로 판정은 절대 경로 함수(`/*` 와 `[A-Za-z]:[/\\]*` 를 모두 인식)를 공용으로 두고, 비교 전에 `compat_posix_path` 로 정규화한다.
- 윈도우에서 얻지 못하는 값(load, 프로세스 시작 시각, 누적 CPU)은 0 이 아니라 「관측 불가」로 열어 두고, 그 값이 필요한 판정은 하지 않는다.
- 네이티브 프로그램(`orca`, `jq.exe`, `node`)에 `/` 로 시작하는 문자열 인자를 넘길 때의 MSYS 경로 변환을 막으려고 `MSYS2_ARG_CONV_EXCL='*'` 를 쓴다(추정, 먼저 실기 확인).

## 5. 결정이 필요한 항목

> **확정(2026-10-07)**: 사용자가 D1~D6 을 모두 추천안대로 확정했다(D3 삭제 승인 포함). 진행 상태: J(jq 동봉)·L0(node 공용 헬퍼)·D3(삭제)·D6(node 18.17) 는 브랜치 `fix/skills-win-jq` 에서 구현했다. 훅(`.claude/settings.json` 의 PostToolUse)이 부르는 `hook_post_edit.py` 는 검사기 `check_oasis_contract.py` 를 같은 프로세스에서 import 하도록 옮겨야 의미가 있어 L1 레인에서 함께 옮긴다.
>
> **현재(2026-10-07)**: J·L0·D3·D6 는 `4396d7e98` 로 dev 에 머지되었고, L1 이 훅을 포함해 옮겼다(`04b6c524a`). D4 는 L5 에서 이행했다(`6984c55ce`: dflow-wbs 구판 3개를 삭제하고 SKILL.md 호출을 export 판으로 통합). D5(`tools/bp-sync*`)는 별도 지시를 기다린다.

| 번호 | 항목 | 선택지 | 추천 |
|---|---|---|---|
| D1 | jq 확보 방식 | A 동봉, B node 이식, C 하이브리드 | A+C(§4.1) |
| D2 | python 스크립트 | node 이식(레인 6개), 또는 python 을 설치 전제로 전환 | node 이식. 사용자 전제가 node 만 보장이다. |
| D3 | 죽은 코드 3개(1,589줄) 처리 | 삭제, 보관 폴더로 이동, 그대로 둠 | 삭제(삭제는 사용자 승인 필요). 이식은 하지 않는다. |
| D4 | dflow-wbs 구판 스냅샷 3개 | export 판으로 통합(dflow-wbs 호출 경로 교체), 구판도 이식 | export 판 하나만 이식하고 통합. dflow-wbs 흐름이 4단계 인식과 충족 임계(`[im]` 등)를 쓰게 되는 동작 변화가 있어 SKILL.md 제약 표를 함께 고친다. |
| D5 | `tools/bp-sync*`(리포 루트) 이식 | 이 작업에 포함, 별도 지시 | 별도 지시. 이 스킬 범위 밖이고 macOS launchd 성격도 있다(추정). |
| D6 | node 최소 버전 | 18 이상 유지, 18.17 이상으로 상향 | 18.17 이상 |

## 6. 이번 지시에서 고친 것

몇 줄짜리 확실한 수정만 했다. python 이식과 jq 처리는 하지 않았다.

### 6.1 적용한 수정

| 파일 | 수정 | 윈도우 영향 | 시험 |
|---|---|---|---|
| `coordinator/scripts/lib/common.sh` | `coord_pid_alive` 가 `compat_pid_alive` 를 부른다. | idle-check, office reap, coord-status 가 네이티브 pid 를 제대로 본다. macOS 는 같은 동작이다. | compat 52건, run-close, lessons, prompt-watch 19건, office-locks 22건, console-poll 237건 통과 |
| `coordinator/scripts/spawn-lane.sh` | `live_session_pids` 에서 `kill -0` 을 `compat_pid_alive` 로 바꿨다. | 새 세션을 찾지 못해 `SPAWN_FAIL process` 가 나던 문제 해소 | 위 시험, 문법 검사 |
| `coordinator/scripts/close-lane.sh` | 세션 pid 생존 확인을 `compat_pid_alive` 로 바꿨다. | 후손 검사가 윈도우에서 건너뛰어지던 문제 해소 | 같음 |
| `coordinator/scripts/lib/console-resolve.sh` | `_cr_pid_dead`, `_cr_pid_live` 를 `compat_pid_alive` 로 바꿨다. | 살아 있는 회차를 죽은 것으로 보던 문제 해소 | 같음 |
| `coordinator/scripts/auto-answer.sh` | `path_ok` 의 절대 경로 분기에 `[A-Za-z]:*` 와 `*\\*` 를 추가했다. | 드라이브 문자와 역슬래시 경로가 상대 경로로 통과해 워크트리 밖 쓰기가 자동 허용될 수 있던 문제(보안)를 막는다. macOS 에서는 역슬래시가 든 인자만 사람에게 올라간다(안전한 방향). | 문법 검사(전용 시험 없음) |
| `dflow-merge/scripts/dialect-check.sh` | `git -c core.longpaths=true worktree add` | 깊은 경로 체크아웃의 MAX_PATH 대비. macOS 에서는 무해하다. | 문법 검사 |
| `dflow-dev/tests/mutate.sh` | Git Bash 에서는 TERM 시험을 건너뛴다. | MSYS kill 이 node.exe 를 강제 종료해 핸들러가 돌지 않는 한계를 시험이 실패로 보지 않게 한다. | macOS 에서 22건 통과 |
| `weekly-report/SKILL.md` | `date -v`(BSD 전용)를 BSD/GNU 분기로 바꿨다. | Git Bash 에서 기간 계산이 된다. | 오늘(2026-10-07, 수요일) 기준 BSD 경로 결과 확인(2026-10-01 ~ 2026-10-07), GNU 경로는 같은 식 대조 |
| `flyway-migration-add/SKILL.md` | sdkman 개인 `JAVA_HOME` 경로를 지웠다. | 윈도우 사용자에게 무의미한 경로 제거 | 문서 |
| `dflow-wbs/SKILL.md` | `/tmp/dev-config.json` 을 `{scratchpad}/dev-config.json` 으로 바꿨다. | PowerShell 로 쓸 때의 `/tmp` 문제 제거 | 문서 |
| `oasis-project-support/SKILL.md` | `rg` 예시에 `grep -rn` 과 Glob/Grep 도구 대안을 병기했다. | rg 가 없는 PC | 문서 |
| `bp-workspace-sync/SKILL.md` | 소유자 개인 경로 문구를 일반화했다. | 문서 정리 | 문서 |
| `_shared/platform-support.md` | 윈도우 전제(Git Bash 는 Claude Code 필수가 아님) 한 문단과 이 문서 링크를 추가했다. | 문서 | - |

### 6.2 계획에 남긴 수정 묶음(이번에 하지 않음)

| 묶음 | 내용 | 크기 |
|---|---|---|
| **C1 coordinator 윈도우 보강** | 경로 판정 공용 함수 추가와 `spawn-lane` 의 `--worktree` 판정, `coord_path_in_wt` 의 repo 정규화, `coord-status` 의 UNLINKED 판정 양쪽 정규화, load 관측 불가를 `-`/`QUIET unknown` 으로 처리, `measure-window` 의 잡 정지를 `compat_kill_tree` 로, `console-poll` 의 자체 `kill_tree` 를 `compat_kill_tree` 로(STOP/CONT 제거), `screen-cache` 의 모드 검사를 윈도우에서 건너뜀, `term.sh` 의 `MSYS2_ARG_CONV_EXCL`, 탭 모드 `bash -lc` 감싸기, `auto-answer` 의 거부 정규식에 `del|rd|Remove-Item|taskkill|Stop-Process` 추가, `coord-state` 의 mv 재시도, references 의 macOS 예시(`uptime`, `ps -Ao`, `/private/tmp/claude-501`, contract.md 의 `python3`) | M |
| **D1 dflow 보강** | `mutate.mjs` 의 CRLF 허용(마커 `\r?\n` 와 대상 소스의 `\r\n` 맞춤), `deps.sh` 의 윈도우 `DEPS_WARN` 한 줄, `heavy.sh` 의 `CLAUDE_PID` 경고, `capacity.sh` 의 윈도우 갈래(node `os`), `free-port.sh` 의 python 블록 삭제, `dflow.sh` 의 `--data-binary @-`, `timeout-guard.sh` 의 node 파싱, backends.md 상단에 「윈도우는 Orca 백엔드 전제」, README 의 심링크 배포 안내, `phase-verify.md:38` 의 python 호출 | M |
| **J jq 동봉(D1 가 A 인 경우)** | `_shared/bin/jq.exe`, 버전·해시 기록, 공용 머리말(PATH, `-b` 래퍼, 사전 점검), coordinator 와 dflow 의 `need jq` 메시지 통일 | M |
| **P python 이식** | §7 의 레인 L0~L6 | L(합계 약 6,000줄 + 시험 약 1,500줄) |
| **T 시험 정비** | 윈도우에서 의미 없는 시험(`deps-sh-no-main-write.sh`)은 건너뛰기, `ln -s` 와 `chmod` 케이스는 윈도우 분기, `kill -0` 직접 사용 금지 린트 시험 | S~M |
| **W 문서** | classify-by-system, generate-bpa 의 「Git Bash 에서 실행」 한 줄, `platform-support.md` 의 python·jq 표 갱신, README 의 필요 명령 갱신 | S |

현재 상태: 위 묶음 중 C1(`384eebb34`)·D1(`5f6b62211`)·J(`4396d7e98`)·P(L1~L6, L2 제외)는 dev 에 머지되었다. D1 의 `phase-verify.md:38` 은 `aggrid_docs.mjs` 가 아직 없어(L2 몫) node 판을 우선하고 python 판을 폴백으로 두는 문구로 고쳤다. W 는 이 문서 정리 레인(skills-win-w)에서 처리했다. T 는 L2 머지 뒤 착수 여부를 정한다.

## 7. 레인 분할 제안과 순서

사용자 영향이 큰 순서(훅, FE 게이트, 번호 채번, 업로드, 부가)로 한다. python 이식 레인은 공용 헬퍼(L0)에 의존한다.

| 순서 | 레인 | 포함 | 크기 | 의존 | 비고 |
|---|---|---|---|---|---|
| 1 | **J jq 동봉** | §6.2 J, D1 결정 뒤 | M | D1 | 이것 하나로 실행불가 bash 스크립트 약 20개가 풀린다. 제일 먼저 한다. |
| 1 | **L0 공용 헬퍼** | readText, writeText, 인자 파서, 힙, 시험 헬퍼 | S | D2, D6 | 위치 후보 `.claude/skills/_shared/node/` |
| 2 | **L1 oasis-contract-check** | `check_oasis_contract.mjs`, `hook_post_edit.mjs`(검사기를 같은 프로세스에서 import), selftest, `.claude/settings.json`, `.dflow-gates`, SKILL.md, RULE.md | M | L0 | 훅이 편집마다 오류를 내는 것을 막는다. python 판과 `--json` 출력 diff. |
| 2 | **L3 flyway + adr** | `migration_tool.mjs`, `adr_tool.mjs`, selftest 2개 | M | L0 | 줄끝은 LF 로 고정 |
| 2 | **C1 coordinator 윈도우 보강** | §6.2 C1 | M | J | 레인을 하나로 해도 된다. |
| 3 | **L2 mantine-aggrid-ui** | `aggrid_docs.mjs`(audit 규칙 40여 개), `mantine_docs.mjs`, `ui_docs.mjs`와 호출 문서 12곳 | L | L0 | aggrid 와 나머지 둘로 나눌 수 있다. audit 규칙은 같은 샘플로 출력 diff 한다. |
| 3 | **D1 dflow 보강** | §6.2 D1 | M | J | `junit-count` 이식은 L6 에서 한다. |
| 4 | **L4 dflow-export 계열** | `_wbs_md`, `_wbs_status`, `wbs-parse`(1,214줄), `wbs-validate`, `dep-analysis`와 시험 3파일(61건) | L(최대) | L0 | ⓐ `_wbs_md`·`_wbs_status`·`wbs-validate` ⓑ `wbs-parse` 비 export 모드 ⓒ `--export` 와 `dep-analysis` 로 3분할 가능. 골든 대조 필수. |
| 5 | **L5 dflow-wbs 잔여와 nlevel** | `decision-log`, `prd-validate`, `wbs-nlevel-parse`와 시험 19건, dflow-wbs 호출을 L4 로 교체(D4) | M~L | L4 | `decision-log` 는 python 판이 쓴 decisions.md 와 상호 validate 시험 |
| 6 | **L6 인라인 python 과 junit-count** | 인라인 5곳, `junit-count.mjs` | M | L4 | xlsx zip 직접 구현 |
| 후순위 | T 시험 정비, W 문서, compat-lite | | S~M | | |
| 제외 | 죽은 코드 3개(D3), `tools/bp-sync*`(D5) | | | | 사용자 결정 |

### 진행 현황(2026-10-07 기준, dev `b78edcd7e`)

위 표는 계획 당시의 순서다. 실제 진행 상태는 다음과 같다. 지시 이름은 조정 세션이 붙인 이름이다.

| 레인 | 지시 | 상태 | 머지 커밋 | 비고 |
|---|---|---|---|---|
| 조사와 계획 | skills-win-1 | 완료 | `fc3bf483d` | 이 문서와 조사 원본, §6.1 의 pid·경로 판정 수정 |
| J jq 동봉, L0 공용 헬퍼, D3 삭제, D6 node 18.17 | skills-win-2 | 완료 | `4396d7e98` | |
| L3 flyway-migration-add, adr-write | skills-win-l3 | 완료 | `292dd47dc` | |
| L1 oasis-contract-check, 훅 | skills-win-3 | 완료 | `04b6c524a` | 훅 표기는 `node "${CLAUDE_PROJECT_DIR}/…"` |
| C1 coordinator 윈도우 보강 | skills-win-c1 | 완료 | `384eebb34` | |
| D1 dflow 보강, 인라인 jq 안내 | skills-win-4 | 완료 | `5f6b62211` | |
| L4 dflow-export 계열 | skills-win-5 | 완료 | `961bc7057` | 서버 계약 v2.1 출력이 python 판과 같다 |
| L5 dflow-wbs 잔여, nlevel | skills-win-6 | 완료 | `6984c55ce` | D4 이행(구판 3개 삭제) |
| L6 인라인 python 5곳, junit-count | skills-win-7 | 완료 | `b78edcd7e` | xlsx zip 직접 구현 |
| L2 mantine-aggrid-ui | skills-win-l2(별도 레인) | 진행 중 | - | 끝나면 `phase-verify.md` 의 python 폴백 문구를 지운다 |
| T 시험 정비 | - | 대기 | - | L2 머지 뒤 착수 여부를 정한다 |
| W 문서 | skills-win-w | 이 정리로 완료 | - | 조정자가 커밋한다 |
| `tools/bp-sync*`(D5) | - | 별도 지시 대기 | - | |

동시 레인은 J 와 L0 를 먼저 띄우고, 그 뒤 L1, L3, C1 을 병렬로 돌리는 것이 효율적이다. L4 는 한 레인이 맡되 내부에서 3분할한다.

머지 때 윈도우 영향은 한 줄로 적는다. 이번 머지의 윈도우 영향은 §6.1 의 표와 같다(macOS 동작 변화 없음, 윈도우에서 pid 생존 판정과 경로 안전 판정이 올바르게 판정된다).

## 8. 실기 확인이 필요한 「추정」 목록

현재(2026-10-07) 정리: 조사 당시 목록(§8.3)을 이후 레인(C1·D1·L1~L6)에서 나온 항목까지 합쳐 두 갈래로 나누었다. §8.1 은 공식 문서나 macOS 에서의 흉내 실행으로 이미 확인되어 실기가 필요 없는 항목이고, §8.2 는 윈도우 PC 에서 한 번 확인해야 하는 항목을 한 표로 모은 것이다. §8.3 은 조사 당시 목록의 원문이다.

### 8.1 이미 확인된 항목(실기 불필요)

| 항목 | 확인 방법 | 근거 |
|---|---|---|
| Git for Windows 는 Claude Code 의 필수 조건이 아니며, Bash 도구와 Monitor 도구와 이 스킬의 `.sh` 는 Git Bash 가 있어야 돈다 | 공식 문서 | §1 |
| 훅 command 는 Git Bash 가 있으면 Git Bash 로, 없으면 PowerShell 로 실행되고 `shell` 필드로 고를 수 있다 | 공식 hooks 문서 | 조사 당시 §8-7 의 앞부분 |
| PostToolUse 훅의 비정상 종료(1·2·127)는 편집을 막지 않고 비차단 오류로 알려진다 | 공식 hooks 문서 | 조사 당시 §8-7 의 뒷부분 |
| 훅 stdin 의 `file_path` 는 윈도우에서 역슬래시로 오므로 훅이 `\` 를 `/` 로 바꿔야 한다 | 공식 문서와 node 판 훅 시험(역슬래시 stdin 케이스) | L1(`04b6c524a`) |
| 맨 `$CLAUDE_PROJECT_DIR` 는 PowerShell 에서 null 이 되므로 중괄호 표기 `${CLAUDE_PROJECT_DIR}` 가 양쪽 셸에서 안전하다 | 공식 문서(표기를 고른 근거) | L1. 실제 해석은 §8.2 의 7번 |
| 줄끝: `.claude/skills` 아래 텍스트 408개가 모두 `i/lf w/lf` 이고 `.gitattributes` 가 `.claude/skills/** text eol=lf` 를 강제한다 | `git ls-files --eol` | §2 |
| 실행 권한 비트가 없어도 shebang 과 `bash <경로>` 호출에는 영향이 없다 | 소스 읽기 | §2 |
| 동봉 jq.exe 가 공식 릴리스 그대로다(1.7.1, SHA-256 `7451fbbf…d6ab`) | 릴리스의 `sha256sum.txt` 와 대조 | `_shared/bin/README.md` |
| coordinator 의 GNU 경로와 Git Bash 경로(`stat -f` 함정, `ps -o` 없는 ps, 가짜 `/proc`, `COMPAT_FORCE_OS=windows`)의 논리 | 흉내 시험 `coordinator/tests/compat.sh`(83건), `coordinator/tests/windows-c1.sh`(29건) | C1(`384eebb34`) |
| 윈도우에서 jq 를 못 찾을 때의 PATH 머리말과 `-b` 래퍼 동작의 논리 | `bash .claude/skills/_shared/tests/jq-prelude.sh`(`COMPAT_FORCE_OS=windows`, `SKILLS_JQ_EXE`) | J(`4396d7e98`) |
| node 이식본이 python 판과 같은 출력을 낸다(서버 계약 v2.1·v2.2, 검사기 `--json`, decision-log, junit-count, xlsx 왕복 등) | macOS 에서 python 3.9 동결 원본(`tests/golden/legacy/`)과 같은 입력으로 바이트 비교 | L1~L6 |
| 윈도우에서 `mutate.mjs` 가 CRLF `.mut` 를 받는다(논리) | CRLF 입력 흉내 시험 | D1(`5f6b62211`) |

### 8.2 실기가 필요한 항목(윈도우 PC 에서 한 번 확인)

번호는 새로 매겼다. 「원」은 조사 당시 §8.3 의 번호다. 정본 메모의 후속 기록 4번과 L1·D1·L5·L6 절에서 나온 항목을 모두 합쳤다.

| 번호 | 확인할 것 | 확인 방법 | 지금의 대비책 | 원 | 출처 |
|---|---|---|---|---|---|
| 1 | 동봉 도구가 실제로 잡히는지 | `bash -lc 'command -v node gawk jq'` 를 돌려 `jq` 가 `_shared/bin/jq` 래퍼를 가리키는지 본다. perl·python3 는 없어도 된다 | 스크립트가 PATH 앞에 `_shared/bin` 을 둔다 | 1 | 후속 기록 4 |
| 2 | jq.exe 출력 줄끝에 `\r` 이 붙지 않는지 | 래퍼 경유로 `printf a \| jq -r . \| od -c` | 래퍼가 `-b` 를 붙여 부른다 | 2 | 후속 기록 4 |
| 3 | `compat_pid_alive` 가 네이티브 pid(Claude 세션)를 찾는지 | `ps -W` 의 WINPID 열 대조 | `compat_pid_alive` 가 WINPID 를 대조한다 | 3 | 후속 기록 4 |
| 4 | `orca … --text "/compact …"` 처럼 `/` 로 시작하는 인자가 MSYS 경로 변환되지 않는지 | `term.sh` 로 실제 전송 | C1 이 `MSYS2_ARG_CONV_EXCL` 을 적용했다 | 4 | 후속 기록 4, C1 |
| 5 | Orca 터미널의 기본 셸이 bash 인지 PowerShell 인지, 탭 모드가 보내는 bash 문법이 통하는지 | `spawn-lane`·`search` 의 탭 모드 실행 | C1 이 탭 명령을 `bash -lc` 로 감쌌다 | 5 | 후속 기록 4, C1 |
| 6 | gawk 에서 `LC_ALL=C` 가 바이트 모드로 동작하는지 | `console-redact.sh` 가 시작 시 확인한다 | 바이트 모드가 아니면 실행을 거부한다(fail-closed) | 6 | 조사 당시 목록 |
| 7 | 훅 command `node "${CLAUDE_PROJECT_DIR}/.claude/skills/oasis-contract-check/scripts/hook_post_edit.mjs"` 가 Git Bash 형태와 PowerShell 형태 양쪽에서 풀리고, 편집 뒤 실제로 도는지 | 윈도우에서 `.java`·`.bpmn` 을 편집해 훅 출력 확인, 셸을 바꿔 한 번 더 | 중괄호 표기와 큰따옴표. 훅 비정상 종료는 비차단(§8.1) | 7 | L1 후속 |
| 8 | `ln -s` 복사 때문에 `deps.sh` 의 `[ -L ]` 판정이 어떻게 보이는지, `MSYS=winsymlinks:nativestrict` 설정에 따라 달라지는지, `lead-worktree.sh` 의 동작 | 링크가 한 건도 안 걸릴 때 `DEPS_WARN` 이 뜨는지 | D1 이 `DEPS_WARN` 한 줄을 추가했다 | 8 | D1 |
| 9 | 네이티브 프로세스 손자의 종료(`compat_kill_tree`)가 `heavy.sh` 시간 상한에서 충분한지 | 시간 상한 시험 | 후손 목록은 `/proc` 기준이라 네이티브 손자는 빠질 수 있음(알려진 한계) | 9 | 조사 당시 목록 |
| 10 | `compat_pid_alive` 의 `ps -W` WINPID 대조가 pid 재사용 때 무관한 프로세스와 맞는지(오래된 세션 기록이 살아 있는 것으로 보이는지), TTL 정리와 함께 | 오래된 세션 기록으로 `coord-status` 확인 | 없음(추정) | 10 | 조사 당시 목록 |
| 11 | `capacity.sh` 의 node `os.freemem()` 값이 윈도우에서 실제 여유 메모리를 반영하는지와 `DFLOW_CAP_MIN_FREE_PCT`(기본 30)로 인원 조절이 현실적으로 판정되는지, CPU 수 | `capacity.sh` 출력과 작업 관리자 값 대조 | 못 얻으면 `CAPACITY_UNKNOWN` 으로 막지 않는다 | - | D1 |
| 12 | 실제 CRLF 체크아웃(`core.autocrlf=true`)의 `.mut` 파일에 `mutate.mjs` 가 변이를 적용하는지 | 윈도우에서 `bash .claude/skills/dflow-dev/tests/mutate.sh` | 마커 `\r?\n` 허용과 대상 소스 줄끝 맞춤(흉내 시험 통과) | - | D1 |
| 13 | `heavy.sh` 의 소유자 pid 가 윈도우에서 `$PPID`·`CLAUDE_PID` 로 acquire 와 release 사이에 이어지는지, `HEAVY_WARN` 이 뜨는지 | `heavy.sh acquire` 와 `release` 를 따로 호출 | `CLAUDE_PID` 가 없고 `$PPID` 로 떨어지면 stderr 에 경고 | - | D1 |
| 14 | `timeout-guard.sh` 의 `node -e` 가 Git Bash 에서 stdin(훅 JSON)을 읽는지 | 훅 JSON 을 파이프로 넣어 실행(jq 를 PATH 에서 뺀 경우 포함) | jq 우선, 없으면 node | - | D1 |
| 15 | Git Bash 의 curl.exe 에서 `--data-binary @-` 로 큰 본문(약 32,767자 초과, `done --decisions` 등)이 stdin 으로 넘어가는지 | `dflow.sh` 로 큰 본문 전송(스테이징 서버) | 본문을 명령줄이 아니라 stdin 으로 넘긴다 | - | D1 |
| 16 | `junit-count.sh` 가 윈도우에서 도는지, 시험 `tests/junit-count.sh` 의 MINGW 분기(python 이 없다고 보기, `sort` 에 `LC_ALL=C`)가 통과하는지, `--failed-file` 이 LF 인지 | 두 스크립트를 Git Bash 에서 실행 | python 없이 node 로 돈다. 시험 스크립트는 MSYS 에서 `HAVE_PY=0` | - | L6 |
| 17 | `xlsx-read.mjs`·`xlsx-write.mjs` 가 윈도우 node 에서 도는지, 만든 `.xlsx` 가 Excel 에서 열리는지(한글 시트 이름·셀 포함) | 임의 xlsx 읽기와 쓰기, Excel 로 열기 | 직접 구현한 zip(`_zip.mjs`, node 18.17 에 없는 `zlib.crc32` 를 쓰지 않음)과 시험 192건 | - | L6 |
| 18 | python 이 없는 윈도우에서 `node --test` 가 통과하는지(골든 비교를 건너뛰고 기대값 파일과 비교하는 경로) | `node --test .claude/skills/_shared/node/tests/` 와 각 스킬 `tests/` | `DMES_NO_PYTHON=1` 로 macOS 에서 같은 경로를 흉내 낼 수 있다 | - | L1~L6 |
| 19 | 동봉 jq.exe 1.8.2 가 윈도우에서 실제로 실행되고 기존 jq 필터가 같은 결과를 내는지 | 윈도우 Git Bash 에서 `jq --version`(`jq-1.8.2` 확인), `printf a \| jq -r . \| od -c` 로 줄끝 확인, `bash .claude/skills/coordinator/tests/compat.sh` 와 jq 를 쓰는 `tests/*.sh` 실행 | macOS 에서 같은 1.8.2 공식 바이너리(`jq-macos-arm64`)로 쓰는 시험을 돌려 필터 회귀 없음을 확인했다. 윈도우 빌드의 실행 자체는 미확인 | - | jq-up |

### 8.3 조사 당시 목록(원문)

Git Bash 가 있는 윈도우 PC 에서 한 번 확인해야 하는 항목이다.

1. `bash -lc 'command -v node jq perl gawk python3'` 로 실제 동봉 도구를 확인한다.
2. jq.exe 출력 줄끝이 CRLF 인지(`printf a | jq -r . | od -c`).
3. `compat_pid_alive` 가 네이티브 pid(Claude 세션)를 찾는지(`ps -W` 의 WINPID 열).
4. `orca --text "/compact …"` 가 MSYS 경로 변환되는지.
5. Orca 터미널의 기본 셸(bash 인지 PowerShell 인지). spawn-lane 과 search 의 탭 모드가 bash 문법을 보낸다.
6. gawk 에서 `LC_ALL=C` 가 바이트 모드로 동작하는지(`console-redact.sh` 가 시작 시 확인하고 아니면 fail-closed 한다).
7. `.claude/settings.json` 의 훅이 윈도우에서 어떤 셸로 실행되는지와, PostToolUse 훅의 비정상 종료가 비차단인지.
8. `ln -s` 복사 동작이 `deps.sh` 와 `lead-worktree.sh` 에서 어떻게 보이는지.
9. 네이티브 프로세스 손자의 종료(`compat_kill_tree`)가 `heavy.sh` 시간 상한에서 충분한지.
10. `coord_pid_alive` 호출처(idle-check, coord-status, office reap)는 모두 세션 json 의 네이티브 Claude pid 를 넘긴다. MSYS pid(잠금 주인 `$$`)는 `kill -0` 을 직접 쓰는 곳이라 이번 변경과 무관하다. 다만 `compat_pid_alive` 의 `ps -W` WINPID 대조가 pid 재사용 때 무관한 프로세스와 맞을 수 있어(오래된 세션 기록이 살아 있는 것으로 보임), 실기에서 TTL 정리와 함께 확인한다.

## 9. 부록: 지시 대비 보정

- 지시서의 python 스크립트 수(약 29개)는 실제로 28개(10,707줄)이다. mantine-aggrid-ui 의 ts 6개는 `references/examples/` 의 예제 코드이며 스크립트가 아니다.
- analyze-service 의 js 는 `phase1-analyzer.js` 하나이고 호출처가 없다.
- 스크립트 합계는 sh 외에 `bpmn-skill/install.ps1` 1개를 포함해 107개이다.
- `_shared/platform-support.md` 는 python3 를 「선택」으로 적었지만 `README.md:119`, `oasis-contract-check/SKILL.md:100`, `junit-count.sh` 는 필수로 취급한다. 이식이 끝나면 표를 정리한다.
  - 현재: 해소되었다. L1(`04b6c524a`)·L6(`b78edcd7e`)로 `oasis-contract-check/SKILL.md`·`junit-count.sh` 가 node 기준이 되었고, 이 레인(W)에서 `README.md` 의 필요 명령과 `platform-support.md` 의 python3·node 행을 현재 사실에 맞췄다. 지금은 `platform-support.md`·`README.md`·`oasis-contract-check/SKILL.md`·`junit-count.sh` 가 모두 「python3 는 스킬 실행에 필요 없다」(남은 예외는 mantine-aggrid-ui 의 문서 조회 스크립트)로 일치한다.
