# dflow-dev·team·merge·work·poll 윈도우(Git Bash) 호환 점검

> 현재 상태(2026-10-07): 이 점검표는 조사 당시 기록이다. jq 의존은 동봉 jq 로 해소했고(J `4396d7e98`), D1(`5f6b62211`)이 mutate CRLF·`deps.sh` 경고·`heavy.sh` 경고·`capacity.sh` 윈도우 갈래·`free-port.sh` python 삭제·`dflow.sh` `--data-binary @-`·`timeout-guard.sh` node 파싱·인라인 jq 안내를 처리했다. 이식 완료(L6, `b78edcd7e`): `junit-count.sh` 의 python 필수 서술은 node 이식으로 해소되었다(이 표의 `JUNIT_SUMMARY_NOPY` 는 `JUNIT_SUMMARY_NONODE` 로 바뀌었다).

점검 대상: `.claude/skills/{dflow-dev,dflow-team,dflow-merge,dflow-work,dflow-poll}` 의 scripts/*, tests/*, SKILL.md, references/* (읽기만 했고 수정 없음).
전제: 대상 윈도우에는 node + Git for Windows(bash·sed·grep·gawk·find·sort·tr·cut·date·stat·mktemp·curl·base64·xargs·openssl)만 있다. python·perl·jq·lsof·pgrep·pkill·flock 와 macOS 명령은 없다.
표기: 줄 번호는 현재 파일 기준. 실행해 확인한 것이 아니라 소스 읽기 결과이며, 근거가 약한 것은 「추정」으로 적었다. 윈도우 실기 시험은 하지 못했다.

## 0. 먼저 알아 둘 것

- **이미 처리된 것**: 이 브랜치(fix/skills-win-audit)의 스크립트는 perl 을 쓰지 않는다(`mutate.mjs` 의 perl 은 주석 3곳뿐이고 본체는 node 로 이전 완료). `pgrep`/`pkill`/`lsof` 는 `command -v`·`/proc` 폴백이 붙어 있다. `stat`·`date` 는 GNU 우선 또는 `||` 대안 사슬이라 Git Bash 에서 돈다. `.gitattributes` 가 `.claude/skills/** text eol=lf` 로 줄끝을 고정한다(이 리포 한정 — 킷을 설치받는 리포는 install.sh 가 넣는다고 backends.md:494 가 적고 있으나 이 점검에서 install.sh 는 보지 않았다).
- **전제와 문서가 어긋난 곳(가장 큰 발견)**: 스킬 문서는 jq 를 「설치 필요 도구」(`winget install jqlang.jq`)로 적어 두었다(`_shared/platform-support.md`, `dflow-work/README.md:264`). 이번 전제는 「jq 없음」이므로 **dflow.sh 를 비롯한 핵심 경로가 전부 실행불가**다. 아래 (2) 참고.
- **도구 가정**: 전제의 괄호 목록은 Git Bash 가 기본으로 주는 coreutils 의 예시로 보고 점검했다. 「문제 없음」 판정 중 일부는 그 밖의 흔한 도구(`od`·`cksum`·`seq`·`paste`·`tee`·`readlink`·`cmp`·`nproc`·`hostname`)가 있다고 가정한다. `getconf` 는 있는지 확인하지 못했으나 `nproc` 가 폴백이다.
- **compat.sh 재사용**: `coordinator/scripts/lib/compat.sh` 는 dflow-* 에서 직접 source 하면 안 된다(platform-support.md 규칙 1 — dflow 스킬은 coordinator 없이 설치될 수 있음). 필요한 함수만 dflow-dev/scripts 쪽에 짧은 사본(예 `compat-lite.sh`)으로 두는 것이 맞다. 대상은 (a) 판단 절 참고.

## 1. 파일별 표

심각도: 실행불가 = 윈도우(jq 없음)에서 그 스크립트가 아예 못 돈다 / 일부기능 = 돌지만 일부 기능·판정이 빠지거나 조용히 건너뛴다 / 문서만 = 코드는 되고 문서·예시만 맞지 않는다.
크기: S = 몇 줄, M = 수십 줄·한 파일, L = 여러 파일·구조 변경.

| 파일 | 필요 런타임 | 깨지는 지점(줄·명령) | 심각도 | 수정 방향 | 크기 |
|---|---|---|---|---|---|
| dflow-work/scripts/dflow.sh | bash, curl, **jq**, git, awk | 1046 `need curl; need jq` 로 config·branch·stub-check 외 모든 명령이 exit 2. jq 호출 83줄(목록 가공 `@tsv`·`to_entries`·`unique_by`·`gsub`·`@uri`·`-se` 등 jq 고유 문법). 185-187 `curl --data "$3"` 로 본문 전체를 명령줄 인자로 넘김 — 윈도우 명령줄 한도 약 32,767자(추정: `done --decisions`·`console-screen` 큰 본문에서 걸릴 수 있음). 150-158·229 는 문제 없음(229 는 `stat -c` 가 먼저라 GNU 안전) | 실행불가 | (A) jq.exe 를 킷에 동봉하거나 설치 단계에서 받게 하고 `need jq` 메시지에 안내(S~M) — 가장 싸다. (B) node 로 이식(L, 83곳). `--data` 는 `--data-binary @-`(표준입력) 로 바꾸는 것이 안전 | A=M, B=L |
| dflow-work/scripts/dflow-lease.sh | bash, jq, curl(dflow.sh 경유), awk, od | 41·51·56·62·79-111·119-136 jq 10곳(79-111 는 `capture`·`splits`·`reduce`·`group_by` 를 쓰는 긴 필터). 9 `od -An -N16 -tx1 /dev/urandom` 은 Git Bash 에 있어 OK. 29-39 `lease_pid_alive` 는 `ps -W` 폴백이 있어 OK. 8·15 `chmod 700/600` 은 윈도우에서 효과 없음(경고도 없음 — 토큰은 아니지만 machine-id 파일이 보호되지 않음) | 실행불가 | jq 정책 (2) 에 따름. `lease_pid_alive` 는 compat_pid_alive 와 동일 로직이라 사본 하나로 합칠 수 있음 | M |
| dflow-work/scripts/dflow-config.sh | bash, awk, sed, git | jq 없음. CR 제거(33)·`.dflow-gates`류 파싱 모두 `\r` 처리됨. `. "$envf"`(112)만 CR 을 안 걷지만 dflow.sh:122-127 이 DFLOW_* 값에서 걷어 낸다 | 문제 없음 | — | — |
| dflow-work/tests/console-cmds.sh | bash, **jq**, mktemp, 가짜 curl(PATH 앞에 shebang 스크립트) | 44-101 jq 12곳. 11 `${TMPDIR:-/tmp}` 는 Git Bash OK. 가짜 curl 은 shebang `#!/bin/sh` 라 bash 에서 PATH 로 실행되므로 동작할 것으로 봄(추정). jq.exe 가 CRLF 를 내면(추정, 아래 (2)) `eq` 비교가 어긋남. 파일 모드 100644 라 `bash <경로>` 로만 실행(문서도 그렇게 적음) | 일부기능(시험 전용) | jq 정책에 따름. 시험이 jq 없이 돌 필요는 낮음 | S |
| dflow-work/tests/watch-summary.sh | 위와 동일 | 38·48-85 jq 4곳 | 일부기능(시험 전용) | 위와 같음 | S |
| dflow-poll/scripts/poll.sh | bash, jq, date, awk, dflow.sh | 182-202·251 jq 7곳. 중간에 `jq` 가 없으면 승인 감지가 조용히 건너뛰어지고(`|| continue`) 이어서 부르는 dflow.sh(221)가 exit 2 로 끝남. 62 `date -j` 는 GNU 에서 실패 후 `date -d` 로 넘어가 OK. 97 `[ -x "$DFLOW" ]` 는 Git Bash 가 shebang 으로 판정해 OK(추정) | 실행불가 | jq 정책에 따름. 폴링 루프 본체(awk·date·sleep)는 이식 문제 없음 | — |
| dflow-dev/scripts/baseline.sh | bash, **jq**, git, sha256sum, tee | 81-95·252-256·258·289-294·309 jq 12곳 — 캐시 JSON 읽기·쓰기 전부 jq. 69 `date -u -r "$1"` 은 GNU 에서 「파일 $1 없음」 오류 후 `date -u -d @` 로 넘어가 OK. 209 `kill -0 "$opid"` 는 `$$`(MSYS pid)라 OK. 261 `ln "$T" "$J"` 하드링크로 원자적 생성 — NTFS 에서 되는 것으로 보나 미확인(추정) | 실행불가 | jq 정책에 따름. 대안: 캐시를 JSON 대신 `key=value` 텍스트로 바꾸면 jq 가 필요 없음(필드 10개 정도라 가능) | M |
| dflow-dev/scripts/heavy.sh | bash, awk, sed, mkdir 락, seq | **jq 없음 — 단독 실행은 됨.** 171 `sysctl`→173 `/proc/meminfo`(Cygwin 에 있음, 추정)→없으면 슬롯 2. 202-203 `sysctl vm.loadavg`→`/proc/loadavg` 는 Cygwin 에서 항상 0 에 가까운 값일 수 있음(추정 — 부하 대기가 사실상 꺼짐). 223 `ps -o lstart` 는 Cygwin ps 에 없어 빈 값→PID 재사용 판정 생략(문서화된 한계). 226-236 `alive` 는 `ps -W` 폴백이 있어 OK. 238 `owner_pid` 는 `CLAUDE_PID` 없으면 `$PPID` — 윈도우에서 $PPID 가 1 이 될 수 있어(backends.md:488 이 같은 문제를 적음) acquire/release 소유자가 겹칠 수 있음(추정). 646 `pkill -P` 는 `command -v` 가드 + `/proc` 폴백이 있으나 네이티브(node.exe) 손자는 못 잡음(문서화된 한계). 983-985 `set -m` + `nohup bash … &` 는 부모(도구 호출)가 끝난 뒤에도 살아남는지 불확실(추정) | 일부기능 | 238 은 `CLAUDE_PID` 없으면 경고 한 줄(S). 시간·프로세스 처리는 compat 사본(descendants·kill_tree·pid_alive)으로 교체 가능하나 필수는 아님 | S |
| dflow-dev/scripts/deps.sh | bash, find, readlink, cp, mv, git, npm/pnpm/yarn | 175-189 `find -name node_modules -type l` + `readlink` 로 「밖을 가리키는 링크」를 지움 — 윈도우에서 `ln -s` 는 복사라 링크 자체가 없어 **그냥 건너뜀**(안전). 213-224 의존성 링크 만들기는 `-L "$MAIN/$p"` 조건 때문에 링크가 없으면 전부 `continue` → **DEPS_LINK 가 한 건도 안 걸림**(조용한 기능 상실, 문서에 한 줄만 있음). 229-232 `uname -s` 가 `MINGW64_NT-…` → `cp -R --reflink=auto` 갈래(GNU cp 라 됨). 273 `uname -sm` 은 캐시 키용이라 OK. 113·119 `${PIPESTATUS[0]}` 는 bash 라 OK. 302-305 `find -mmin`·`ls -1t` OK. pnpm 워크스페이스 복제(310-337)는 윈도우에서 pnpm 이 junction 을 만들어 `cp -R` 이 따라가며 부풀 수 있음(추정, 기본값 `DFLOW_DEPS_MAIN_CLONE=0` 이라 꺼져 있음) | 일부기능 | 윈도우에서 DEPS_LINK 가 안 걸릴 때 `DEPS_LINK_SKIP windows-copy` 같은 한 줄을 내거나, `cp -R` 로 복사하는 대안(크기 주의) 선택. 그냥 두면 gitignore 된 심링크(`docs/mdm/design` 등)가 워크트리에 없음 | S~M |
| dflow-dev/scripts/timeout-guard.sh | sh(PreToolUse 훅), **jq**, awk | 29 `command -v jq || exit 0` — jq 없으면 **훅이 조용히 꺼짐**(백그라운드 오용 차단 상실). 31-37 에서 stdin JSON 을 jq 로 파싱(tool_name·command·timeout·run_in_background). 42-205 awk 파서는 gawk 로 이식 문제 없음. backends.md:132 의 훅 명령은 `/bin/sh` 를 직접 지정(Git Bash 에 있음) | 일부기능 | 입력 JSON 파싱 5줄을 `node -e` 로 바꾸면 jq 없이 동작(node 기동 ~50ms, 훅 timeout 5초 안). 또는 awk/sed 로 `"command"` 키 추출 | M |
| dflow-dev/scripts/free-port.sh | bash, node(권장), python(없어도 됨) | 32-36 python3/python 을 **먼저** 시도 — 없으면 `command -v` 로 넘어가 문제없으나, 윈도우에 마이크로소프트 스토어 별칭 python3.exe 가 있어도 `valid()`(24)가 비정상 출력을 걸러 다음 방법으로 넘어가므로 동작은 됨(스토어 별칭이 멈추지는 않는 것으로 봄 — 추정). 38-41 node 폴백은 이미 있음. 45-52 `lsof`→`nc`, 없으면 무검사 번호(58 `RANDOM`) | 일부기능(경미) | python 블록(26-36)을 지우고 node 를 첫 선택지로(S). 폴백은 그대로 둠 | S |
| dflow-dev/scripts/junit-count.sh | sh, find, sort, **python3/python** | 88-95 python 없으면 `JUNIT_SUMMARY_NOPY` 출력 후 exit 2. 125-216 에 xml.etree 파이썬 본체. 97-99 `mktemp`(템플릿 없음)은 Git Bash OK. 108-117 find·117 `sort -u -o` OK | 실행불가 | 파이썬 본체를 `junit-count.mjs`(node)로 이식: `<testsuite … tests= failures= errors= skipped=>` 속성 합산과 `<testcase>` 안 `<failure|error>` 판별은 정규식·간단 파서로 충분. 셸 쪽은 `node "$HERE/junit-count.mjs" "$filelist" "$FAILED_FILE" "$SINCE"` 한 줄로 교체. `--since` 의 mtime 은 `fs.statSync(...).mtimeMs/1000` | M |
| dflow-dev/scripts/mutate.sh | sh, git, node | 42 node 필수 확인, 44 `exec node mutate.mjs`. perl 없음. 윈도우 문제 없음(Git Bash 의 sh 에서 node.exe 호출) | 문제 없음 | — | — |
| dflow-dev/scripts/mutate.mjs | node | perl 호출 없음(주석 2·23·63 만 언급). 59-60 마커 정규식이 `\n` 만 받음 → `.mut` 기록 파일이 CRLF 로 체크아웃되면 `MUTATION_BAD --- find 표지 없음`(추정: `.mut` 는 `.claude/skills` 밖이라 `.gitattributes` 규칙 밖이고 `core.autocrlf=true` 가 윈도우 기본값). 99-105 **대상 소스가 CRLF 체크아웃이면 변이 게이트 전체가 죽는다** — `find` 본문은 끝 줄바꿈까지 포함하므로(mutate.sh 머리말 20-21; tests M2·M4) LF 의 `"alpha\n"` 는 `"alpha\r\n"` 와 맞지 않아 한 줄 변이도 모두 `anchor count=0`(CRLF 여부는 대상 리포의 autocrlf 설정에 달려 추정). 80 `child.kill(sig)` 는 `sh` 만 죽이고 손자(gradle·test)는 남음, 윈도우에서 SIGTERM 핸들러는 아예 안 돔(mutate.sh 머리말 30-31 이 한계로 적음 — 다음 실행이 복구). 86 `spawn('sh', …)` 는 PATH 에 sh 가 있어야 함(Git Bash 안에서 호출되면 있음, 추정) | 일부기능(CRLF 체크아웃이면 사실상 실행불가) | 59-60 에서 `\r?\n` 허용 + 본문의 `\r` 제거, 99 이후는 소스에 `\r\n` 이 있으면 find/repl 도 `\r\n` 으로 맞추는 한 줄(S~M) | M |
| dflow-dev/tests/mutate.sh | bash, git, node | 61-66 `kill -TERM` 후 종료코드 143·원본 복구를 기대 — 윈도우에서는 mutate.sh 한계 설명대로 실패할 가능성(추정). 7 `${TMPDIR:-/tmp}` OK. 모드 100644 | 일부기능(시험 전용) | TERM 시험(58-66)을 윈도우에서는 건너뛰기: `case $(uname -s) in MINGW*|MSYS*) skip;; esac` | S |
| dflow-dev/scripts/pred-reflected.sh | sh, git, **jq** | 23 jq 없으면 `UNKNOWN no-jq` exit 2 — 호출자(워커 행 G·팀장 사전검사)는 「판정 불가」로 워커에 맡김(문서 규칙). 27-30 에서 state.json 의 `phase`·`order`·`head_sha` 3칸만 필요 | 일부기능 | state.json 이 한 줄 평탄 JSON 이면 `sed -n 's/.*"phase": *"\([^"]*\)".*/\1/p'` 로 대체 가능(S). 아니면 node -e 한 줄 | S |
| dflow-dev/scripts/gate-scope.sh | sh, git, mktemp, tr, sed | jq 없음. 69 `mktemp -d "${TMPDIR:-/tmp}/…"` OK. 84·109 CR 제거 있음. 126-127 `git rev-parse --show-toplevel`(`C:/x`)와 `pwd -P`(`/c/x`) 두 접두를 둘 다 처리. 단 `--ignore` 에 역슬래시 경로가 오면 못 맞춤(드묾, 추정) | 문제 없음 | — | — |
| dflow-dev/scripts/build-trial.sh | sh, cksum, sed, grep | jq 없음, `cksum`(Git Bash 있음)·`cut` 만 사용 | 문제 없음 | — | — |
| dflow-dev/scripts/sections.sh | bash, gawk | awk 만 사용(`\t`·정규식 gawk 호환). 문서가 CRLF 면 출력에 `\r` 이 섞일 뿐 | 문제 없음 | — | — |
| dflow-merge/scripts/decisions.sh | sh, git, awk, sort, mktemp | jq 없음. 51 `mktemp -d` OK. 33 `LC_ALL=C` OK. `git show :n:path`(64-69)는 LF 로 나옴. 큰 awk 블록(73·148·197 등)은 gawk 호환(추정) | 문제 없음 | — | — |
| dflow-merge/scripts/migration-check.sh | sh, git, awk, sort | jq 없음. 44 `mktemp -d` OK | 문제 없음 | — | — |
| dflow-merge/scripts/dialect-check.sh | bash, git, docker(`docker info`), dflow.sh config | jq 직접 호출 없음(`dflow.sh config` 는 jq 전 단계라 OK). 90·100 `kill -0 "$op"` 는 자기 `$$`(MSYS pid)·워크트리 이름의 pid 라 OK. 155 `docker info` 프로브 — Docker Desktop 없으면 DIALECT_DEFERRED 로 종료(설계된 동작). 193 `git worktree add` 가 `.claude/worktrees/dflow-dialect-$$` 에 깊은 경로 체크아웃 → 윈도우 MAX_PATH 260 에 걸릴 수 있음(추정, `core.longpaths` 필요) | 일부기능 | 필요 시 `git -c core.longpaths=true worktree add` (S) | S |
| dflow-merge/scripts/sweep-check.sh | bash, git, jq | 78·88·106 jq 3곳. jq 가 없으면 `|| unknown` 으로 `SWEEP_UNKNOWN`(fail-open) — 호출자가 스윕을 그냥 돌림. 61 `mktemp` OK. 단 이 스크립트가 앞서 `dflow.sh branch dev`·`config api_base` 를 부르는 경로는 jq 없이도 됨 | 일부기능 | 스윕 최적화(변경 없으면 건너뛰기)만 빠지고 기능은 유지. jq 정책 (2) 따름 | — |
| dflow-team/scripts/capacity.sh | bash, awk, sed, getconf, node(권장) | 77 `OS=$(uname -s)` → `MINGW64_NT-*` 이라 185-216 `case` 의 `*)` 로 떨어져 free/swap/load 가 모두 빈 값 → `CAPACITY_UNKNOWN`(막지 않음, rc 0). 즉 **팀원 수를 메모리·부하로 조절하는 기능이 윈도우에서 꺼짐**(문서화된 한계 — platform-support.md). 91-97 `max` 모드는 `/proc/meminfo` 가 있으면 동작(추정). 120-136 사용량 모드는 jq 필요 → jq 없으면 `CAPACITY_USAGE_UNKNOWN jq 없음`(막지 않음) | 일부기능 | `MINGW*|MSYS*|CYGWIN*` 갈래를 추가해 `node -e` 로 `os.freemem()/os.totalmem()` 을 읽어 free% 를 채움(S~M). 부하는 윈도우에 개념이 없어 계속 「관측 불가」 | M |
| dflow-team/scripts/docker-allow.sh | bash, jq, dflow.sh | 38·51 jq. jq 없으면 `v` 가 비어 `DOCKER=ban show-failed` — **도커 허용 태그가 있어도 늘 금지**로 나옴(안전한 쪽으로 실패). 어차피 `dflow.sh show`(45-46)가 jq 필요 | 일부기능 | jq 정책 따름 | — |
| dflow-team/scripts/gradle-check.sh | sh, find, grep | jq 없음. `find -maxdepth`·`grep -E` 만 사용 | 문제 없음 | — | — |
| dflow-team/scripts/lead-state.sh | bash, jq(큰 필터) | 58-147 이 사실상 jq 한 덩어리(`reduce`·`now`·`todate`·`capture`·`test` 등 jq 고유 기능). jq 없으면 147 `FAIL JQ events.jsonl 요약 실패` exit 1 → **팀장 재구성·재개가 불가** | 실행불가 | jq 정책 (2). 이식(node)은 L | M(동봉) / L(이식) |
| dflow-team/scripts/lead-worktree.sh | bash, git, ln, chmod | 36·43·49 `ln -s` 가 복사본을 만듦(Git Bash 기본) → 이 순간의 킷 스냅숏으로 고정되어 이후 메인 킷 수정이 반영되지 않음(문서화됨). 55·65 `chmod 600` 윈도우에서 효과 없음. 11·12 경로 비교는 둘 다 git 출력이라 형식 일치 | 일부기능 | `MSYS=winsymlinks:nativestrict`(개발자 모드 필요)를 문서에 안내하거나, 복사임을 시작 메시지에 한 줄 출력(S) | S |
| dflow-team/scripts/live-leads.sh | bash, git, jq(`--mark`만) | 38 jq 는 `--mark` 모드에서만, 실패하면 41 `|| printf '%s\n' "$line"` 로 원문 통과 — 안전 | 일부기능 | 이식 불필요 | — |
| dflow-team/scripts/resolve-decide.sh | sh, jq | 15 jq 없으면 `UNKNOWN no-jq` exit 2. 19-24 가 events.jsonl 을 jq 로 걸러 `S/R/B` 줄 생성 | 일부기능 | 이벤트가 한 줄 JSON 이면 grep+sed 로도 가능하나 비권장. jq 정책 따름 | S |
| dflow-team/scripts/tick.sh | bash, jq, git, date, tmux(선택), cksum | 65 `ps -o ppid=` 는 Git Bash 에서 실패 → 68 `/proc/$PPID/ppid` 폴백(OK, 단 네이티브 부모면 1 → 버림 → LEAD_PID 빈 값; 전제 검사가 `CLAUDE_PID` 를 강제하므로 실사용 OK). 94 `date -j` → `date -d` 폴백 OK. 108·131·178·182 jq 4곳(없으면 `may_skip_now` 가 거짓이 되어 매 TICK 마다 깨어남 — 비용만 늘고 오동작은 아님). 207 `$TM list-panes` 는 TM 이 있을 때만(tmux). 99-100 `sed '\{8\}'` BRE 는 GNU sed OK | 일부기능 | jq 정책 따름 | — |
| dflow-team/scripts/wake.sh | bash, jq, dflow.sh, git | 52-57 tick.sh 와 같은 pid 폴백. 75 jq 1곳. 65-67 `( … ) &` 로 console-poll.sh 를 백그라운드로 — 그쪽(coordinator)은 perl/pgrep 를 여전히 씀(platform-support.md 「알려진 한계」) | 일부기능 | jq 정책 따름. console-poll 은 범위 밖 | — |
| dflow-team/scripts/worker-trim.sh | sh, jq, find, sed, grep | 43 jq 없으면 `{}` 출력 후 정상 종료 → **팀원 환경 정리(스킬·플러그인 끄기, 출력 스타일) 가 전부 건너뛰어짐**. 139-150 의 `installPath`(윈도우 `C:\Users\…` 역슬래시)는 `[ -d ]` 에서 Git Bash 가 받아 줌(추정). 61·79 sed·grep OK | 일부기능 | jq 정책 따름 | — |
| dflow-team/references/backends.md | — | 필수 백엔드가 tmux 또는 Orca. Windows 용 tmux 는 「MSYS2 로 따로 설치, 미검증」(483·489). Orca 가 없으면 `NO_TMUX` 로 시작 거부(SKILL.md:465). 90-97·146 `ln -s`·`chmod +x` 는 복사·무효 동작. 114-125·131-133 이 jq 를 직접 호출(워커 설정 JSON 생성). 132 statusLine 도 jq | 일부기능 | Windows 팀장은 Orca 백엔드 전제임을 문서 맨 위에 명시. jq 정책 따름 | S |
| dflow-team/SKILL.md | — | 440 `date -j`(폴백 OK), 446 `find_tmux` 후보 경로가 macOS(homebrew)·Linux 만(Windows 는 PATH 의 `command -v tmux` 만 의존), 466 안내 메시지에만 윈도우 언급, 568-578 `caffeinate`(macOS 조건부 — Darwin 가드 있음 OK) | 문서만 | 아래 (4) | S |
| dflow-dev/SKILL.md, references/*.md | — | 윈도우를 직접 막는 셸 블록은 없음. 아래 (4) 의 예시 몇 줄만 macOS 전용 | 문서만 | 아래 (4) | S |
| dflow-merge/SKILL.md, references/*.md | — | jq 호출 예시 4건(SKILL.md)·`unapproved.md` 등. 플랫폼 전용 명령 없음 | 문서만 | — | — |
| dflow-poll/SKILL.md | — | 126 지원 환경 문단이 jq 를 필요 도구로 적음. 그 외 문제 없음 | 문서만 | — | — |

### 문제 없음(모아서)

`dflow-work/scripts/dflow-config.sh`, `dflow-dev/scripts/{mutate.sh,gate-scope.sh,build-trial.sh,sections.sh}`, `dflow-merge/scripts/{decisions.sh,migration-check.sh}`, `dflow-team/scripts/gradle-check.sh`.
(jq 없이 돌지만 설계된 폴백으로 이식 작업이 필요 없는 것: `live-leads.sh`.)

### 공통 점검 항목 결과

| 항목 | 결과 |
|---|---|
| CRLF 줄끝 | 이 리포는 `.gitattributes` 로 `.claude/skills/**` 를 LF 고정(OK). 킷을 받는 쪽은 install.sh 가 같은 파일을 넣는지 이 점검에서 확인하지 못함(추정). 스크립트가 읽는 사용자 파일(`.dflow`·`.dflow.local`·`.dflow-gates`)은 `\r` 을 걷어냄(OK). `.mut` 기록 파일(mutate.mjs)과 `state.json`·`decisions.md` 같은 작업 폴더 파일은 걷어내지 않음 |
| 실행 권한·shebang | scripts 는 git 모드 100755, tests·`dflow-lease.sh`(source 전용)는 100644. 윈도우는 모드 비트가 없고 Git Bash 가 shebang 으로 실행하므로 `[ -x … ]` 검사(deps.sh:109, baseline.sh:114·233, dialect-check.sh:194, tick.sh:123)는 shebang 이 있는 한 통과(추정). shebang 은 `#!/bin/sh`·`#!/usr/bin/env bash` 둘 다 Git Bash OK |
| /tmp 하드코딩 | 스크립트는 모두 `${TMPDIR:-/tmp}` 형태이거나 템플릿 없는 `mktemp`. `/tmp` 하드코딩 없음(문서 예시는 (4) 참고). 단 Git Bash 가 `/tmp` 를 윈도우 임시 폴더로 매핑하므로 네이티브 node 에 `/tmp/...` 를 문자열로 넘기면 안 됨 — 지금 코드에는 그런 호출이 없음 |
| 심볼릭 링크 | `ln -s`: deps.sh:223, lead-worktree.sh:36·43·49, backends.md:90-97, worker-prompt.md:62-71, resolve-prompt.md:67. 모두 윈도우에서는 복사. deps.sh 의 「링크만 대상」 판정이 복사에서는 성립하지 않아 조용히 건너뜀(위 표) |
| 프로세스 | `ps -o`: tick.sh:65·wake.sh:52(폴백 있음), heavy.sh:223(빈 값 허용). `kill`: heavy.sh:227·646-651, baseline.sh:209, dialect-check.sh:90·100, lease 계열(모두 MSYS pid 한정이면 OK, 네이티브 pid 는 `ps -W` 폴백). 프로세스 그룹 `kill -- -pgid` 는 사용하지 않음. 포트 점유 확인: free-port.sh 의 lsof·nc 뿐이고 node 폴백이 대체. `pgrep`/`pkill`: heavy.sh:646 한 곳(가드 있음) |
| 시간 초과 처리 | 스크립트 안에서 GNU `timeout` 은 쓰지 않음(timeout-guard.sh 는 인자를 해석만 함). 대기는 `sleep`+epoch 비교 루프(heavy.sh·baseline.sh)라 이식 OK. 단 `heavy.sh --detach` 의 `set -m`+`nohup`(983-985)은 Git Bash 에서 도구 호출이 끝난 뒤에도 자식이 살아남는지 확인 못 함(추정) |
| 경로 구분자 | git 은 `C:/x`, bash `pwd` 는 `/c/x` 를 내는 문제를 `pwd -P` 로 맞추거나 두 접두를 모두 처리(deps.sh:121, gate-scope.sh:126-127, backends.md:481). 문자열 비교로 남은 곳: lead-worktree.sh:12 와 live-leads.sh:21 은 양쪽이 같은 git 출력이라 OK MSYS 인자 변환: Git Bash 가 네이티브 exe(jq.exe·node.exe·curl.exe·git.exe)를 부를 때 `/` 로 시작하는 인자를 윈도우 경로로 바꾼다(예 backends.md 의 `jq --arg f "$LIM/…"`, lead-state.sh 의 `--repo`·`--arg r "$REPO"` 비교 값). 영향은 대체로 무해해 보이나(추정) 문자열 비교에 쓰는 `--arg` 값이 `C:/…` 로 바뀌면 events.jsonl 의 `repo` 와 어긋날 수 있다. 끄는 방법은 `MSYS_NO_PATHCONV=1`. |

## 2. jq 의존 요약

코드(주석 제외) 기준 jq 호출 줄 수. 문서에 나온 jq 예시는 마지막에.

| 파일 | 호출 수 | jq 없이 못 도는 핵심 경로 | jq 없을 때 동작 |
|---|---|---|---|
| dflow-work/scripts/dflow.sh | 83 | 목록·상세·claim·build-start·done·heartbeat·watch·console-*·scaffold·doctor·profiles 전부(1046 에서 즉시 exit 2) | 실행불가. `config`·`branch`·`stub-check` 만 jq 없이 동작 |
| dflow-work/scripts/dflow-lease.sh | 10 | 팀장 lease acquire·renew·release·keep, `lease_heavy_json` | 실행불가 |
| dflow-dev/scripts/baseline.sh | 12 | 기준선 캐시 읽기·쓰기·note·list 전부 | 실행불가 |
| dflow-team/scripts/lead-state.sh | 2(긴 필터 2개) | 이벤트 로그 → 팀장 상태 복원 전부 | 실행불가(FAIL JQ) |
| dflow-team/scripts/worker-trim.sh | 9 | 팀원 설정(스킬·플러그인 끄기·MCP 합성) | `{}` 출력 후 건너뜀 |
| dflow-poll/scripts/poll.sh | 7 | 승인·반려 감지(182-202), 후보 태그 확인(251) | dflow.sh 가 실패해 루프 종료 |
| dflow-team/scripts/tick.sh | 4 | 무응답 판정의 증거 수집·스킵 조건 | 항상 TICK(스킵 안 함) |
| dflow-dev/scripts/timeout-guard.sh | 5 | 훅 입력 JSON 파싱 | 훅이 조용히 꺼짐(오용 차단 없음) |
| dflow-merge/scripts/sweep-check.sh | 3 | state.json 후보 집계 | SWEEP_UNKNOWN(스윕을 그냥 돌림) |
| dflow-dev/scripts/pred-reflected.sh | 4 | state.json 3칸 읽기 | UNKNOWN no-jq |
| dflow-team/scripts/capacity.sh | 3 | 주간 사용량 덤프 | USAGE_UNKNOWN(막지 않음) |
| dflow-team/scripts/docker-allow.sh | 2 | 태그에서 docker 판정 | 항상 DOCKER=ban |
| dflow-team/scripts/resolve-decide.sh | 2 | 해소 시도 횟수 판정 | UNKNOWN no-jq |
| dflow-team/scripts/wake.sh | 1 | watch 응답 요약 | WATCH_FAILED |
| dflow-team/scripts/live-leads.sh | 1 | `--mark` 만 | 원문 통과 |
| dflow-work/tests/console-cmds.sh | 12 | 시험 전체 | 시험 불가 |
| dflow-work/tests/watch-summary.sh | 4 | 시험 전체 | 시험 불가 |
| 문서 속 셸 블록 | team/backends.md 8, restart.md 8, SKILL.md 8, events.md 6, merge-conflict.md 5, rationale.md 5, merge/SKILL.md 4 등 | 팀장이 스폰·이벤트 기록·재투입 때 그대로 돌리는 블록(예: backends.md:114-133, events.md:110) | 같은 정책에 따름 |

**jq 대응 전략 비교(판단)**

1. **jq.exe 동봉 또는 설치 안내(권장, S~M)** — 단일 실행 파일이고 라이선스가 MIT 라 킷에 넣을 수 있음(「추정」: 용량 1MB 안팎). 지금 코드의 jq 필터(`@tsv`·`reduce`·`capture`·`splits`·`try`·`walk`·`todate` 등)를 그대로 쓸 수 있다는 점이 결정적. 83+곳을 손대지 않음. install.sh 가 `~/.dflow/bin/jq.exe` 에 두고 PATH 에 넣는 방식이 가장 단순.
2. **node 이식(L)** — dflow.sh 85곳과 lead-state.sh 의 90줄짜리 필터를 node 로 옮기는 일. 그 필터들은 jq 문법이라 기계 변환이 안 되고, 시험(console-cmds.sh·watch-summary.sh 가 jq 로 검증)도 함께 옮겨야 함. 한 번에 하지 말고 jq 없이 쉽게 가능한 곳(`pred-reflected.sh`·`timeout-guard.sh`·`junit-count`·`resolve-decide.sh`)만 먼저.
3. **중간안** — jq 없는 PC 에서 자주 쓰는 소수 경로(`dflow.sh me/list/show/claim/progress/heartbeat/done`)만 node 로 따로 구현. 그러나 서버 계약 변경을 두 곳에서 따라가야 해 비권장.

**jq.exe 줄끝(CRLF) 위험 — 지금 문서가 안내하는 설치 방식(`winget install jqlang.jq`)에도 이미 걸린다**: jq 매뉴얼의 `-b`/`--binary` 항목은 Windows(MSYS2·Cygwin·WSL) 에서 jq 출력을 다른 프로그램으로 넘길 때 jq 가 줄끝을 CRLF 로 바꾸는 것을 막으려고 둔 옵션으로 설명한다(어느 버전에서 들어왔는지는 확인하지 못함 — 1.7 계열로 추정, 이 PC 의 jq 1.7.1 은 macOS 빌드라 `--help` 에 이 옵션이 보이지 않아 대조하지 못함). 이 코드는 `jq -r` 결과를 `=`·`case` 로 직접 비교하는 곳이 많다(예 dflow.sh:196 `"$(… jq -r '.code // empty')" = "dependency_not_met"`, poll.sh:197 `[ "$_st" = approved ]`) 반면 `tr -d '\r'` 은 `.dflow` 값에만 쓴다. 따라서 jq 를 동봉·설치하는 경우 **먼저 `printf a | jq -r . | od -c` 로 CRLF 여부를 확인**하고, 나오면 호출하는 모든 `jq` 에 `-b` 를 주는 래퍼 함수(`jq() { command jq -b "$@"; }`, 종료 코드가 그대로 보존됨)를 쓴다. `| tr -d '\r'` 을 파이프로 붙이는 방식은 `jq -e` 의 종료 코드를 가리므로 쓰지 않는다.

## 3. 몇 줄로 되는 확실한 수정

| 파일:줄 | 바꿀 내용 |
|---|---|
| dflow-dev/scripts/free-port.sh:26-36 | python 블록(`PY=…`, `for py in python3 python`)을 삭제하고 node 블록(38-41)을 첫 선택지로. 지금도 python 이 없거나 스토어 별칭이면 `valid()` 가 걸러 node 로 넘어가므로 **정리 수준**(윈도우에서 동작은 이미 됨, 스토어 별칭 python3.exe 가 있어도 비정상 종료 후 폴백으로 넘어가는 것으로 봄 — 추정) |
| dflow-dev/scripts/mutate.mjs:59-60 | `/^--- find\n/m`→`/^--- find\r?\n/m`, `/^--- replace\n/m`→`/^--- replace\r?\n/m`. 64 의 `split('\n')` 는 줄 끝 `\r` 을 `\s*$` 가 이미 걷으므로 유지 |
| dflow-dev/scripts/mutate.mjs:97-105 | 본문 줄바꿈 맞추기: 대상 소스에 `\r\n` 이 있으면 `find`·`repl` 의 `\n` 을 `\r\n` 으로 바꿔 비교·치환(한 줄 분기). `find` 본문은 끝 줄바꿈까지 포함하므로(mutate.sh 머리말 20-21, tests/mutate.sh M2·M4) 이 분기가 없으면 CRLF 소스에서는 **한 줄 변이도 전부 `anchor count=0`** |
| dflow-dev/tests/mutate.sh:58-66 | TERM 시험을 `case "$(uname -s)" in MINGW*\|MSYS*\|CYGWIN*) ;; *) … ;; esac` 로 감싸 윈도우에서는 건너뜀(mutate.sh 머리말 30-31 이 이미 한계로 적음) |
| dflow-dev/scripts/heavy.sh:238 | `owner_pid` 에서 `CLAUDE_PID` 도 없고 uname 이 MINGW/MSYS 이면 stderr 에 `HEAVY_WARN CLAUDE_PID 없음 — owner=$PPID` 한 줄(소유자 충돌 진단용, 동작 불변) |
| dflow-dev/scripts/deps.sh:213 직전(DEPS_LINK 루프 시작 전) | 윈도우에서 `-L "$MAIN/$p" \|\| continue`(218)에 모두 걸려 **링크가 한 건도 안 걸리는데 소리가 없음**. 루프 앞에 **한 번만** `case "$(uname -s)" in MINGW*\|MSYS*\|CYGWIN*) echo "DEPS_WARN windows: ln -s 는 복사라 gitignore 된 의존성 링크(DEPS_LINK)를 만들지 않는다" ;; esac` 출력. 토큰은 187행에서 이미 쓰는 `DEPS_WARN` 을 쓴다(`DEPS_LINK_SKIP` 은 `<경로> (사유)` 칸 형식이라 쓰지 않음). 동작 불변, 진단만 |
| dflow-merge/scripts/dialect-check.sh:193 | `git worktree add` → `git -c core.longpaths=true worktree add` (깊은 경로 체크아웃 대비, 맥·리눅스에는 무해) |
| dflow-dev/scripts/baseline.sh:69 | 현재 `date -u -r` 먼저. GNU 에서도 폴백으로 돌지만 `date -u -d "@$1" … \|\| date -u -r "$1" …` 로 순서를 바꾸면 platform-support.md 규칙 3(GNU 앞) 과 일치하고 우연한 파일명 충돌이 없어짐 |
| dflow-team/references/backends.md 맨 위 | 「Windows 는 Orca 백엔드 전제, tmux 는 미검증」 한 줄 상단 요약(현재는 483-490 에만 있음) |

### 검토 필요(추정이거나 여러 곳을 건드려 「확실한 수정」에서 뺀 것)

| 파일:줄 | 바꿀 내용 | 이유 |
|---|---|---|
| dflow-work/scripts/dflow.sh:185-187 | `--data "$3"` → `--data-binary @-` 로 표준입력 전달 | 윈도우 명령줄 한도(약 32,767자)에 걸린다는 것은 추정. 전달 방식 변경은 7개 호출처 영향 |
| dflow-work/scripts/dflow.sh:802 외 `--argjson i "$_items"` 류 | 큰 JSON 은 `--slurpfile` 로 임시 파일 읽기 | 같은 한도 추정, 8곳 정도를 건드림 |
| dflow-team/scripts/capacity.sh:185 | `case "$OS"` 에 `MINGW*\|MSYS*\|CYGWIN*)` 갈래 추가, `node -e 'const o=require("os");console.log(Math.round(o.freemem()*100/o.totalmem()))'` 로 `free` 를 채움(swap·load 는 계속 빈 값) | 새 분기·node 기동 비용(30분 주기라 영향은 작음), 임계값 의미를 윈도우에서 검증하지 못함 |
| dflow-dev/scripts/timeout-guard.sh:29-37 | `command -v jq` 가 없으면 `node -e` 로 입력 JSON 파싱하는 분기 추가. 지금은 jq 없으면 훅이 조용히 꺼짐 | 훅 timeout 5초 안에 node 기동이 들어가는지 미측정, 훅 입력 스키마 변경에 취약 |

### compat.sh 재사용 판단

- **직접 source 는 불가**: dflow-* 는 coordinator 없이 설치될 수 있다(platform-support.md 규칙 1). `_shared/` 에 두는 방법도 있으나 install.sh 가 `_shared` 를 함께 복사하는지 확인하지 못함(추정 필요). 안전한 방법은 필요한 6개만 `dflow-dev/scripts/compat-lite.sh`(약 60줄)로 복사하고 baseline.sh·heavy.sh·dialect-check.sh·dflow-lease.sh 가 source.
- **재사용 가치가 있는 함수**: `compat_pid_alive`(heavy.sh:226-236 과 dflow-lease.sh:29-39 가 같은 awk 를 복붙하고 있음 — 한 곳으로), `compat_epoch_fmt`(baseline.sh:69 `iso`), `compat_descendants`+`compat_kill_tree`(heavy.sh:644-654 `term_children` 대체 — 현재는 pkill→`/proc` 순회로 이미 동작), `compat_ps_pairs`(같은 이유), `compat_sha256`(baseline.sh:70-75 `hash12` 는 이미 `sha256sum`→`shasum`→`cksum` 이라 동작하지만 해시 종류가 PC 마다 달라 캐시 키가 PC 간에 안 맞음 — 캐시가 `git-common-dir` 안이라 PC 간 공유는 없어 실해는 없음).
- **불필요**: `compat_stat_mtime`(dflow.sh:229 는 이미 `stat -c` 먼저), `compat_pgrep_f`·`pkill_f`(dflow-* 는 이름 기반 종료를 e2e.md:39·68 이 금지), `compat_posix_path`(`pwd -P` 로 이미 맞춤).
- **한계**: compat.sh 의 알려진 한계(네이티브 node.exe 손자 프로세스 미추적, 부하·시작 시각 관측 불가)는 그대로 승계. 새 이점은 크지 않아 우선순위는 jq 보다 훨씬 낮다.

### mutate.mjs 의 perl 은 어떻게 쓰이나

perl 호출은 없다. 파일 머리(2·23·63줄) 주석이 「perl 이던 것을 node 로 옮겼다」·「perl split 과 같다」는 이력만 적고 있다. `mutate.sh:44` 가 `exec node mutate.mjs` 로 위임하고 본체는 node 내장(fs·child_process) 뿐이다. 남은 윈도우 이슈는 줄끝(CRLF)과 신호(위 표)뿐이다.

### junit-count.sh·free-port.sh 의 python 대체

- **free-port.sh**: 이미 node 폴백(38-41)이 있다. python 블록만 지우면 된다(S). node 호출은 `net.createServer().listen(0)` 로 python 과 같은 의미(모든 인터페이스의 빈 포트).
- **junit-count.sh**: node 이식이 필요하다(M). 요구 기능은 (1) XML 파일 목록 읽기 (2) `--since`(epoch 또는 파일 mtime) 필터 (3) `<testsuite>`(또는 `<testsuites>` 의 자식)의 `tests·failures·errors·skipped` 합산 (4) `<testcase>` 가 `<failure|error>` 자식을 가지면 `classname.name` 을 `--failed-file` 에 정렬·중복 제거로 기록 (5) 깨진 XML 은 `JUNIT_SKIP`. 표준 JUnit XML 은 노드 의존성 없이 정규식으로 속성을 뽑아도 충분하고(CDATA·엔티티는 속성에 거의 없음), 엄밀히 하려면 작은 SAX 형 파서(60줄 안팎)를 직접 쓴다. 출력 형식(`JUNIT_SUMMARY tests=… files=…`, exit 0/1/2)과 stderr 메시지는 바꾸지 않는다.

## 4. SKILL.md·references 에 적힌 macOS 전용 셸 명령

실제로 윈도우에서 모델이 그대로 실행하면 실패하거나 의미가 없는 것만 정리했다(분기·폴백이 이미 붙은 것은 표시).

| 파일:줄 | 명령 | 상태 | 비고 |
|---|---|---|---|
| dflow-team/SKILL.md:575-578, references/closing.md:62 | `caffeinate -i -w <LEAD_PID>`, `pkill -f "caffeinate -i -w $LEAD_PID"` | Darwin 가드 있음(「Linux 서버와 Windows 에서는 띄우지 않는다」) | closing.md:62 의 `pkill` 은 caffeinate 를 띄운 경우에만 도달. 윈도우에서는 `pkill` 이 없어 실행되면 `command not found` 가 stderr 로 나올 뿐 `\|\| :` 가 흡수 |
| dflow-team/SKILL.md:440·references/precheck.md:138, tick.sh:94, poll.sh:62 | `date -j -f '%Y-%m-%d %H:%M:%S' …` | `\|\| date -d` 폴백 있음 | OK |
| dflow-team/SKILL.md:446, backends.md:60 | `find_tmux` 후보 `/opt/homebrew/bin/tmux /usr/local/bin/tmux /usr/bin/tmux` | 윈도우에서는 `command -v tmux` 만 의존 | OK 하나 Windows 설치 경로(MSYS2 `/usr/bin/tmux` 는 Git Bash 가 보지 않음)가 목록에 없음 |
| dflow-team/SKILL.md:465, precheck.md:152 | `brew install tmux`·`apt install tmux` | 윈도우에는 MSYS2/WSL 안내만 | 안내 문구 |
| dflow-dev/references/dev-discipline.md:168 | `sysctl -n vm.loadavg … \|\| cut -d' ' -f1 /proc/loadavg` | 폴백 있음 | OK. 윈도우에서는 값이 의미 없을 수 있음(추정) |
| dflow-dev/references/dev-discipline.md:224·305, worker-prompt.md:240 | `orb start`·`orbctl start`·`open -a Docker`·`open -a OrbStack`·`colima start` | 「켜지 않는다」 금지 예시 | macOS 예시만이라 윈도우 대응(`Docker Desktop.exe` 등)이 예시에 없음. 금지 규칙 자체는 OS 무관 |
| dflow-dev/references/phase-verify.md:38 | `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit …` | **python 필요** | 이 스킬(mantine-aggrid-ui)의 스크립트. 범위 밖이지만 전제(python 없음)상 윈도우에서 검증 단계 한 줄이 실패 |
| dflow-dev/references/e2e.md:39·68, rationale.md:329, orch/phase-common.md:89, worker-prompt.md:208, SKILL.md:983(team) | `pgrep -f`·`pkill`·`killall` | 금지 규칙 또는 확인 예(`pgrep` 등) | 금지 예시는 OK. orch/phase-common.md:89 와 team SKILL.md:983 은 「`pgrep` 등으로 프로세스 확인」 이라고 모델에게 지시 — 윈도우에서는 `ps -W`·`/proc` 로 안내해야 함 |
| dflow-team/references/restart.md:300 | `lsof` 로 프로세스 종료 확인 | 설명 문구(Orca 동작 기록) | 지시 아님 |
| dflow-team/references/backends.md:90-97·146, worker-prompt.md:62-71, resolve-prompt.md:67 | `ln -s`·`chmod +x` | 윈도우에서는 복사·무효 | 문서(backends.md:221, worker-prompt.md:58)가 이미 「복사본으로 동작」이라 설명 |
| dflow-team/references/backends.md:131-133 | statusLine `jq -c … > … && mv -f …`, 훅 `/bin/sh` | jq 필요(2번 항목) | |
| dflow-team/references/help.md:84-85·113 | `TMUX= tmux -L dflow attach`, `caffeinate` 안내 | macOS·tmux 사용자용 안내 | 윈도우(Orca)에서는 해당 없음 |
| dflow-work/README.md:58-61 | `ln -s /path/to/wbs-web/.claude/skills/dflow-work <대상리포>/…` | 심링크 배포 안내(B 방식) | 윈도우는 복사가 되어 갱신이 반영되지 않음. README 에 `MSYS=winsymlinks:nativestrict`·개발자 모드 또는 A 방식(복사) 권장을 한 줄 |
| 문서 전체 | `/tmp/…` 하드코딩 | 이 5개 스킬 문서·스크립트에서는 발견되지 않음(dflow-dev/scripts/free-port.sh:10 의 `/tmp/api.log` 한 곳은 사용 예시 주석) | 예시이므로 `"$TMPDIR"` 로 바꾸면 좋음 |

## 범위 밖(참고)

- `dflow-dev/scripts/junit-count.sh:49` 주석이 「install.sh 가 python3 을 필수로 요구한다」고 적는다. 근거는 그 주석뿐이며 install.sh 는 보지 않았다 — 전제(python 없음)에서는 설치기 자체가 실패할 수 있다(추정).
- `dflow-dev/references/phase-verify.md:38` 의 `python3 …/mantine-aggrid-ui/scripts/aggrid_docs.py audit` 와 리포 루트 `.claude/settings.json` 의 `python3 …/oasis-contract-check/scripts/hook_post_edit.py` 훅은 dflow 스킬 밖이지만 python 이 필요하다.

## 5. 우선순위 제안

1. jq 확보 정책(동봉 또는 설치 단계) 결정 — 이것 하나로 dflow.sh·baseline·lease·poll·lead-state 등 「실행불가」 8개가 풀림.
2. junit-count.sh 의 node 이식(python 의존 제거, M)과 free-port.sh 의 python 블록 삭제(S).
3. 위 (3) 의 한 줄 수정(mutate.mjs CRLF, deps.sh 안내, heavy.sh owner 경고, dialect-check longpaths, dflow.sh `--data-binary`).
4. capacity.sh 윈도우 갈래(node os 모듈)로 팀원 수 조절을 살림.
5. compat-lite.sh 사본 도입은 (jq 다음) 낮은 우선순위.
