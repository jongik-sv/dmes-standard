# 스킬 윈도우 호환 점검과 수정 계획

- 작성: 2026-10-07, 레인 skills-win(지시 skills-win-1, 회차 notice-fill2), 브랜치 `fix/skills-win-audit`
- 범위: `.claude/skills` 아래 리포에 커밋된 스킬 34개(스크립트 107개). 이 문서는 1단계(조사와 계획)의 결과이며, 큰 수정은 하지 않았다.
- 사용자 지시: 모든 스킬이 윈도우에서 호환되는지 확인한다. 특히 스크립트가 윈도우에서 실행되어야 한다. 윈도우에는 node 가 기본으로 설치되어 있다.

## 0. 요약

1. **막히는 곳은 두 가지다.** jq 가 없으면 bash 스크립트 약 20개가 실행되지 않고, python 이 없으면 python 스크립트 28개(10,707줄)가 모두 실행되지 않는다.
2. **jq 는 호출 지점이 약 700곳이고 복잡한 필터(`reduce`, `capture`, `@tsv`, `def` 등)가 많다.** node 로 옮기면 사실상 재작성이라, 단일 실행 파일인 jq.exe 를 킷에 동봉하는 안을 권한다(결정 필요 D1).
3. **python 은 node 로 이식한다(약 6,000줄과 시험 약 1,500줄).** 훅과 게이트에 걸린 oasis-contract-check 를 가장 먼저 옮긴다.
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

## 3. 조사 표

세부 표는 조사 에이전트가 만든 파일별 표에 있다(레인 작업 폴더 `~/.coord/notice-fill2/lanes/skills-win/audit/` 에 복사). 여기에는 스킬 단위로 요약한다. 심각도는 「실행불가」(기능이 윈도우에서 못 돈다), 「일부 기능」, 「문서만」이다. 크기는 S(몇 줄), M(한 파일에서 수십 줄), L(여러 파일이나 이식)이다.

### 3.1 런타임 의존 요약

| 의존 | 영향 파일 | 윈도우에서 |
|---|---|---|
| jq | coordinator 20여 개, dflow-work(dflow.sh 83곳 포함) 외 dflow 스킬 8개, 시험 17개 중 12개 | 실행불가(핵심 경로 전부) |
| python3 | 스크립트 28개 외에 SKILL.md 인라인 5곳, `dflow-dev/scripts/junit-count.sh`, `tools/bp-sync*`, 훅 1개, `.dflow-gates` 약 14곳 | 실행불가 |
| perl | 이미 없음(compat.sh 와 mutate.mjs 는 주석에만 언급) | 문제 없음 |
| macOS 전용 명령 | coordinator 의 auto-answer·measure-window·term-send-safe(분기 처리됨), `caffeinate`(Darwin 가드) | 문제 없음 |
| ln -s | deps.sh, lead-worktree.sh, 시험 몇 개 | 복사로 바뀌어 기능이 조용히 빠짐 |
| tmux | dflow-team 의 tmux 백엔드 | 윈도우는 Orca 백엔드 전제(문서 보강 필요) |

### 3.2 스킬별 표

| 스킬 | 필요 런타임 | 깨지는 지점 | 심각도 | 수정 방향 | 크기 |
|---|---|---|---|---|---|
| coordinator | bash, jq, orca, node(선택) | jq 필수(`lib/common.sh:75` 에서 종료). 네이티브 pid 에 `kill -0`(고침). 경로 형식 혼용(`C:/x`, `/c/x`, `C:\x`). auto-answer 의 `path_ok` 가 드라이브 문자 경로를 상대 경로로 봄(고침). load·프로세스 시작 시각을 얻지 못하는데 0 이나 빈 값으로 처리해 `QUIET yes` 가 나올 수 있음. 탭 모드가 bash 문법을 Orca 터미널로 보냄(추정). term.sh 의 `--text "/compact …"` 가 MSYS 경로 변환될 수 있음(추정). screen-cache 의 700/600 모드 검사가 NTFS 에서 항상 불신(추정). | 실행불가(jq), 나머지 일부 기능 | jq 방침(D1) 과 §6.2 수정 묶음 C1 | M |
| dflow-work | bash, curl, jq, git | `dflow.sh` 가 시작 시 `need jq`(1046줄)로 종료. `dflow-lease.sh` 도 jq. `curl --data "$3"` 로 본문 전체를 명령줄에 넘김(윈도우 한도 약 32,767자, 추정). | 실행불가 | D1, 큰 본문은 `--data-binary @-` | M |
| dflow-dev | bash, jq, python3, node | `baseline.sh` jq 12곳. `junit-count.sh` python 필수. `timeout-guard.sh` 훅이 jq 없으면 조용히 꺼짐. `pred-reflected.sh` 가 jq 없으면 `UNKNOWN`. `deps.sh` 의존성 링크가 복사로 바뀌어 한 건도 안 걸림. `mutate.mjs` 가 CRLF 소스면 변이가 전부 `anchor count=0`(추정). `heavy.sh` 의 owner pid 가 `$PPID` 폴백. | 실행불가(baseline, junit-count), 나머지 일부 기능 | D1, junit-count 를 node 로(L6), mutate.mjs 줄끝 처리(§6.2 D1) | M |
| dflow-team | bash, jq, git, tmux 또는 orca | `lead-state.sh` 의 jq 필터 90줄(실행불가). `worker-trim.sh` 가 jq 없으면 건너뜀. `docker-allow.sh` 는 항상 금지. `capacity.sh` 는 윈도우에서 `CAPACITY_UNKNOWN`(인원 조절 꺼짐). `lead-worktree.sh` 의 `ln -s` 가 복사. | 실행불가(lead-state), 나머지 일부 기능 | D1, capacity.sh 에 node `os` 분기(M) | M |
| dflow-merge | bash, git, jq | `sweep-check.sh` 가 jq 없으면 `SWEEP_UNKNOWN`(스윕을 그냥 돌림). `dialect-check.sh` 의 깊은 경로 워크트리(고침). | 일부 기능 | D1 | S |
| dflow-poll | bash, jq | 승인 감지가 jq 에 의존 | 실행불가 | D1 | - |
| dflow-export | python3, curl | `wbs-validate`, `wbs-parse --export`, `dep-analysis`, 봉투 조립이 모두 python. 서버 계약(import v2.1, byte 동일)이 걸림. | 실행불가(업로드 경로 차단) | node 이식(L4) | L |
| dflow-wbs | python3 | 구판 스냅샷 3개(`wbs-parse`, `wbs-validate`, `dep-analysis`)와 `decision-log`, `prd-validate`. 인라인 yaml·xlsx 5곳. `/tmp` 하드코딩(고침). | 일부 기능(생성은 가능, 검증과 입출력 불가) | export 판으로 통합, 나머지 이식(L5) | M~L |
| dflow-wbs-nlevel | python3 | `wbs-nlevel-parse` validate·export(import v2.2) | 일부 기능(업로드 게이트 불가) | node 이식(L5) | M~L |
| oasis-contract-check | python3 | `.claude/settings.json` 의 PostToolUse 훅이 모든 편집에서 `hook_post_edit.py` 를 실행하고, `.dflow-gates` 의 검사 줄 약 14곳도 python3 직접 호출 | 실행불가(훅이 편집마다 오류, 게이트 통과 불가) | node 이식(L1), 가장 먼저 | M |
| mantine-aggrid-ui | python3, node | `aggrid_docs`, `mantine_docs`, `ui_docs` 가 모두 python. FE 검수 `audit` 와 공통 컴포넌트 `coverage` 가 필수 단계. ts 파일 6개는 예제 코드라 실행 대상이 아니다. | 일부 기능(문서 열람은 가능, 검수 자동화 불가) | node 이식(L2) | L |
| flyway-migration-add | python3, Java | `migration_tool.py`, `selftest.py`. SKILL.md 의 sdkman 개인 경로(고침). | 실행불가(채번 도구) | node 이식(L3) | M |
| adr-write | python3 | `adr_tool.py`, `selftest.py` | 실행불가(린트와 채번) | node 이식(L3) | M |
| weekly-report | bash, date | `date -v` 는 BSD 전용이었다(고침: BSD/GNU 분기) | 일부 기능 → 해결 | 완료 | S |
| bp-update-intake, bp-workspace-sync | python3(`tools/bp-sync`) | 확장자 없는 python 스크립트라 윈도우에서 직접 실행 불가. 개인 경로 문구(고침). | 실행불가(미러 동기화 단계) | `tools/bp-sync` 이식은 별도 지시(리포 루트 `tools/`, 이 스킬 범위 밖) | M |
| classify-by-system | bash | `for … $(ls …)` 예시. Git Bash 에서 돈다. | 문서만 | Glob 도구 사용을 문서에 한 줄 | S |
| generate-bpa, bpmn-skill | bpmn-tool(npm), bash | PowerShell `echo` 파이프가 한글 JSON 을 깨뜨릴 수 있음(추정). `install.sh` 와 `install.ps1` 은 둘 다 윈도우에서 돈다. | 문서만 | Git Bash 에서 실행하거나 임시 파일 경유를 문서에 한 줄 | S |
| oasis-project-support | 없음 | `rg` 예시(고침) | 문서만 | 완료 | S |
| analyze-queries, analyze-service | 없음(죽은 코드) | `orchestrator.py` 는 리포에 없는 `query_cache` 를 import 해 지금도 즉시 실패한다. `phase2·3-generator.py` 는 SKILL.md:93 이 호출하지 않는다고 명시한다. `phase1-analyzer.js` 는 `path.join` 만 쓰는 사문이라 윈도우에서도 돈다. | 문제 없음(사문) | 이식 제외, 삭제 여부는 결정 필요 D3 | - |
| 그 밖의 스킬 | 없음 | analyze-custom-class, analyze-plsql, analyze-table-schema, analyze-trigger, analyze-view, define-process-groups, generate-legacy, generate-process-group, git-commit, issue-brief, meeting-minutes, `_shared` 에서 셸 의존을 찾지 못했다. | 문제 없음 | - | - |

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

### 4.2 python (결정 필요 D2)

사용자 전제는 「node 만 보장」이므로 **python 스크립트는 node 로 이식한다.** 세부 원칙은 다음과 같다.

- 형식: `.mjs`. 노드 18.17 이상(`node:test`, 전역 `fetch`, `util.parseArgs`, `readdirSync` recursive)을 하한으로 한다. `platform-support.md` 가 선언한 18 이상을 18.17 로 올린다.
- 전환 방식: python 판을 즉시 지우지 않는다. 레인마다 ① node 판 추가와 골든 대조 시험 통과, ② 호출 문서(SKILL.md, README, RULE.md, FE 가이드, `.dflow-gates`, `.claude/settings.json`)를 node 로 교체, ③ python 판 삭제는 별도 커밋(사용자 승인)으로 한다.
- 골든 대조: macOS 에는 python 이 있으므로 같은 입력으로 python 판과 node 판의 stdout 을 diff 하는 시험을 둔다. 서버 계약이 걸린 `wbs-parse --export`(import v2.1, byte 동일)와 `wbs-nlevel-parse export`(v2.2), 훅 입력 계약인 `check_oasis_contract --json` 은 필수다.
- 공용 헬퍼(L0): `readText`(BOM 제거, CRLF 를 LF 로 정규화), `writeText`(LF), 종료 코드 규약(사용 오류 2, 위반 1)을 가진 인자 파서, 이진 힙, 코드포인트 순 정렬 walk.
- 주의할 python 전용 동작: 인라인 `(?i)` 와 `\Z` 정규식, `re.match` 의 암묵 앵커, 유니코드 `\w`, `str.splitlines` 의 분할 문자, 읽을 때 CRLF 자동 정규화(가장 큰 윈도우 함정), 윈도우 python 이 `write_text` 에서 CRLF 로 쓰는 점, `ui_docs` 의 `node_modules/.bin/tsc` 가 윈도우에서 `tsc.cmd` 라는 점.
- 인라인 python 5곳(yaml 읽기, xlsx 읽기, xlsx 쓰기, 봉투 조립 2곳)과 `junit-count.sh` 도 대상이다. xlsx 는 node 에 zip 표준 API 가 없어 `zlib` 로 직접 구현해야 한다(의존성 0 유지). yaml 은 소형 파서를 쓰거나 JSON 변환을 요구하는 방식으로 문서화한다.

### 4.3 bash 스크립트

bash 는 Git Bash 를 전제로 하고 다음을 지킨다.

- 플랫폼 차이는 `coordinator/scripts/lib/compat.sh` 함수를 거친다. dflow-* 는 coordinator 없이 설치될 수 있으므로 직접 source 하지 않고, 필요한 6개 함수(`pid_alive`, `descendants`, `kill_tree`, `epoch_fmt`, `ps_pairs`, `sha256`)만 `dflow-dev/scripts/compat-lite.sh` 사본으로 둔다. `heavy.sh` 와 `dflow-lease.sh` 에 같은 pid 확인 코드가 중복되어 있으므로 이때 합친다. 우선순위는 jq 보다 낮다.
- 네이티브 Windows pid(Claude 세션 등)에는 `kill -0` 을 쓰지 않고 `compat_pid_alive` 를 쓴다. 이 규칙은 `platform-support.md` 규칙 5 에 이미 있지만 스크립트가 따르지 않았으므로, 린트 시험(grep) 한 건을 추가해 재발을 막는다.
- 경로 판정은 절대 경로 함수(`/*` 와 `[A-Za-z]:[/\\]*` 를 모두 인식)를 공용으로 두고, 비교 전에 `compat_posix_path` 로 정규화한다.
- 윈도우에서 얻지 못하는 값(load, 프로세스 시작 시각, 누적 CPU)은 0 이 아니라 「관측 불가」로 열어 두고, 그 값이 필요한 판정은 하지 않는다.
- 네이티브 프로그램(`orca`, `jq.exe`, `node`)에 `/` 로 시작하는 문자열 인자를 넘길 때의 MSYS 경로 변환을 막으려고 `MSYS2_ARG_CONV_EXCL='*'` 를 쓴다(추정, 먼저 실기 확인).

## 5. 결정이 필요한 항목

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

동시 레인은 J 와 L0 를 먼저 띄우고, 그 뒤 L1, L3, C1 을 병렬로 돌리는 것이 효율적이다. L4 는 한 레인이 맡되 내부에서 3분할한다.

머지 때 윈도우 영향은 한 줄로 적는다. 이번 머지의 윈도우 영향은 §6.1 의 표와 같다(macOS 동작 변화 없음, 윈도우에서 pid 생존 판정과 경로 안전 판정이 올바르게 판정된다).

## 8. 실기 확인이 필요한 「추정」 목록

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

## 9. 부록: 지시 대비 보정

- 지시서의 python 스크립트 수(약 29개)는 실제로 28개(10,707줄)이다. mantine-aggrid-ui 의 ts 6개는 `references/examples/` 의 예제 코드이며 스크립트가 아니다.
- analyze-service 의 js 는 `phase1-analyzer.js` 하나이고 호출처가 없다.
- 스크립트 합계는 sh 외에 `bpmn-skill/install.ps1` 1개를 포함해 107개이다.
- `_shared/platform-support.md` 는 python3 를 「선택」으로 적었지만 `README.md:119`, `oasis-contract-check/SKILL.md:100`, `junit-count.sh` 는 필수로 취급한다. 이식이 끝나면 표를 정리한다.
