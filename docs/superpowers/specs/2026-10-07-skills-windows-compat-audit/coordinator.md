# coordinator 스킬 윈도우(Git Bash) 호환 점검

> 현재 상태(2026-10-07): 이 점검표는 조사 당시 기록이다. jq 의존은 동봉 jq 로 해소했고(`4396d7e98`), 표의 수정 항목 대부분은 C1(`384eebb34`)에서 처리했다. `references/contract.md` 의 「python3(선택)」 문구도 C1 에서 정리되어 지금은 python 을 언급하지 않는다.

- 대상: `.claude/skills/coordinator/` 의 `scripts/*.sh`, `scripts/lib/*.sh`, `SKILL.md`, `references/*.md`(읽기만 함, 수정 없음)
- 전제: node·Git Bash(bash/sed/grep/gawk/find/sort/tr/cut/date/stat/mktemp/curl/base64/xargs/openssl)만 있고 jq 는 없다. `tests/`·`templates/` 는 범위 밖.
- 기준: `scripts/lib/compat.sh` 를 먼저 읽고(stat·date·프로세스 표·후손·kill_tree·pgrep·cwd·sha256·posix_path·pid_alive 를 한 곳에 모음), 그걸 거치지 않은 직접 호출과 새 결함을 찾았다.
- 표기: 「추정」 = 코드만으로는 확정할 수 없고 Git Bash 실측이 필요한 것. 줄 번호는 현재 작업 트리 기준.
- 이미 처리돼 있어 문제로 보지 않은 것: `ps -o`/`pgrep`/`lsof`/`stat -f`/`date -r`/`perl`/`shasum` 직접 호출(compat 로 이전 완료), `setsid` 없을 때 nohup 폴백(console-poll.sh:1076~1088), CRLF(`.gitattributes` 의 `.claude/skills/** text eol=lf` 로 체크아웃은 LF 고정, 화면 `\r` 은 console-input.sh:146 이 제거), `timeout` 명령 대신 직접 만든 시간 제한(run_limited), 실행 권한(git 인덱스 100755, 단 lib/*.sh 는 source 전용이라 644), 모든 shebang 이 `#!/usr/bin/env bash`.

## 총평

1. **가장 큰 결함: 네이티브 Windows pid 에 `kill -0` 를 직접 쓴다.** `compat_pid_alive` 는 만들어졌고 `_shared/platform-support.md` 규칙 5 도 이를 쓰라고 하지만, 스크립트 쪽 호출은 0건이다(`grep` 확인: 호출처는 tests/compat.sh 뿐). Claude 세션 pid(`~/.claude/sessions/<pid>.json`, `CLAUDE_PID`)는 네이티브 pid 라 Git Bash 의 `kill -0` 이 늘 「없음」을 낸다. 그 결과 idle-check 는 모든 레인을 `GONE`, office.sh reap 은 살아 있는 조정 세션의 팀원 키를 30초마다 내리고, spawn-lane 은 새 세션을 못 찾아 `SPAWN_FAIL process`, console-resolve 는 살아 있는 회차를 죽은 것으로 본다.
2. **jq 는 사실상 필수다.** `lib/common.sh:75` 가 jq 없으면 `exit 4`. common.sh 를 source 하는 거의 모든 스크립트가 실행불가. Git for Windows 에는 jq 가 없으므로 설치 요건(문서에는 이미 적힘 contract.md:244)이다.
3. **경로 형식 혼용**: git 은 `C:/x`, Git Bash 는 `/c/x`, Claude/Orca JSON 은 `C:\x`. `case "$p" in /*)` 절대경로 판정과 `"$repo"/*` 접두 비교가 여러 곳에 그대로 남아 있다(compat_posix_path 를 거치는 곳은 `coord_path_in_wt` 한 곳뿐이고 거기서도 repo 쪽은 빠짐).
4. **Orca 터미널에 보내는 셸 줄이 bash 문법**이다(`cd 'x' && cmd`, `( set -o pipefail; … )`). Orca 가 윈도우에서 띄우는 기본 셸이 PowerShell/cmd 면 깨진다(추정).
5. 자동 응답 안전망 `path_ok` 가 드라이브 문자 경로를 상대 경로로 본다(보안 성격).

---

## (1) 파일별 표

심각도: 실행불가 = 그 스크립트(또는 그 기능 경로)가 윈도우에서 동작하지 않음 / 일부기능 = 돌지만 일부 판정·기능이 틀리거나 빠짐 / 문서만 = 코드는 무관, 문서 서술이 macOS 기준.
「필요 런타임」의 공통 항목: bash, git, jq(아래 (2) 참고), orca CLI, node(선택). 표에서는 공통 항목 외의 것만 적는다.

### scripts/lib

| 파일 | 필요 런타임 | 깨지는 지점(줄·명령) | 심각도 | 수정 방향 | 크기 |
|---|---|---|---|---|---|
| lib/common.sh | jq, git | (a) 438 `coord_pid_alive` 가 `kill -0` 만 씀 → 네이티브 pid 를 못 봄. (b) 395 `ps -o lstart= -p` → Git Bash ps 에 `-o` 없음, 빈 출력. 잠금 pstart 가 빈 값이 되어 pid 재사용 판정이 꺼짐(`[ -n "$ps" ]` 가드로 크래시는 없음). (c) 313~316 `coord_load1`: `sysctl` 없고 `/proc/loadavg` 도 MSYS 에 없음 → 빈 출력, 호출처가 0 으로 취급(아래 coord-status·measure-window 참고). (d) 389·422 `case "$p" in /*)` 가 `C:/x`·`C:\x` 를 상대경로로 보고 `$(coord_repo)/` 를 앞에 붙임. (e) 432~436 `coord_path_in_wt` 가 p·w 는 `compat_posix_path` 하면서 repo 는 안 함 → `/c/..` 와 `C:/..`(git 출력)이 달라 메인 체크아웃의 `.claude/worktrees/` 제외 판정이 윈도우에서 실패(워크트리 하위 프로세스를 메인 것으로 오인). (f) 18 기본 사용량 경로 `/tmp/claude-usage-cache.json`: node 가 쓰는 `/tmp` 와 Git Bash `/tmp` 가 다른 폴더(추정, 파일 없으면 다음 출처로 넘어가 무해). (g) 75 jq 없으면 즉시 종료. | 일부기능(jq 없으면 실행불가) | (a) `coord_pid_alive` 를 `compat_pid_alive` 호출로 교체. (b) `coord_pstart` 를 compat 로 옮겨 Git Bash 는 `/proc/<pid>/starttime` 또는 `ps -W` 의 STARTTIME 열 사용(추정: 열 이름 실측 필요), 못 얻으면 빈 값 유지. (c) compat 에 `compat_load1` 을 두고 윈도우는 「관측 불가」(예: 빈 값 + 호출자가 `-` 표시)를 명시. (d)(e) 절대경로 판정 함수 `compat_is_abs`(`/*|[A-Za-z]:[/\\]*`)와 repo 도 posix 정규화. | M |
| lib/compat.sh | cygpath(Git Bash 동봉), awk | 내부는 양호. 남은 약점: `_compat_proc_scan` 은 MSYS 가 띄운 프로세스만 봄(주석에 이미 기록). `compat_pid_alive` 는 구현됐으나 어디서도 안 씀. `compat_kill_tree` 만 `/usr/bin/kill -f` 폴백이 있고 console-poll 의 `kill_tree`(아래)에는 없음. | 문서만(자체 결함 없음) | 호출처 정리(위 표 참고). | - |
| lib/term.sh | jq, orca | 29~37·44~50·`_orca_json`: orca 가 `.cmd` 래퍼면 bash 가 `orca` 를 못 찾을 수 있음(추정, `.exe` 만 자동 해석). 94·`_term_key_bytes` 의 `\033[A` 등 이스케이프 바이트는 bash printf 라 무관. `--text` 인자가 `/` 로 시작하면(예: `/compact …`) MSYS 가 인자를 경로로 오인해 `C:/Program Files/Git/compact …` 로 바꿀 수 있음(추정, native exe 호출 시 자동 경로 변환). tmux 백엔드(74~)는 윈도우에서 사용 불가이나 설정 `terminal_backend` 기본이 orca 라 무관. | 일부기능 | `term.sh` 맨 위에 `export MSYS2_ARG_CONV_EXCL='*'`(또는 호출 단위 `MSYS_NO_PATHCONV=1`)와 `orca` 호출 가능 여부 점검(`command -v orca || command -v orca.cmd`) 추가. | S |
| lib/screen-cache.sh | id, chmod, stat | 79~88·108~115 `_sc_trusted`: 폴더 700·파일 600 이어야 신뢰. Git for Windows 는 NTFS 를 `noacl` 로 마운트해 `chmod` 가 무효 → 모드가 644/755 로 보여 항상 불신(추정). 캐시가 늘 무시되어 prompt-watch 가 매번 `orca terminal read` 를 직접 부름(동작은 정상, 읽기 중복 제거 이점만 사라짐). | 일부기능 | `COMPAT_WIN=1` 이면 모드 검사를 건너뛰고 소유자(uid)·심볼릭 링크 아님만 확인. | S |
| lib/console-input.sh | jq, node(선택), date | 259·262 `kill -0 "$cp"`(자기 자식 pid 라 MSYS pid → 문제없음). 346 `kill -0 "$p"`(잠금 주인 = MSYS `$$` → 문제없음). 313 `date +%N` GNU OK. 399·461 `chmod 600`·`umask` 무효(내용은 사용자 프로필 아래라 위험 낮음). 256 `command -v timeout` 가 Git Bash 의 GNU timeout 을 쓰는데, 프로세스 그룹이 없어 자손이 남을 수 있음(추정). | 일부기능 | 현 상태 유지 가능. timeout 사용 시 후손 정리는 console-poll 의 감시 방식으로 통일 권장. | S |
| lib/console-redact.sh | gawk(`LC_ALL=C`), tr, openssl/sha256sum | 52~60 awk 시작 시 `length("가")==3`·`sprintf("%c",200)` 1바이트를 확인하고 아니면 실패(fail-closed). Git Bash gawk 에서 `LC_ALL=C` 가 바이트 모드로 동작하는지 실측 필요(추정). gawk 전용 기능은 안 씀(`gensub`·`strftime` 등 없음, `tolower`·`index`·`sprintf` 만). 786~788 sha 폴백에 node 가 없음(console-input.sh 는 있음; openssl 이 전제라 영향 없음). | 일부기능(실측 필요) | `tests/console-redact.sh` 를 Git Bash 에서 한 번 돌려 확인. 확인 전에는 「추정」. | S |
| lib/console-resolve.sh | jq | 28·30 `_cr_pid_dead`/`_cr_pid_live` 가 `kill -0` 직접 사용. 대상 pid 는 세션 기록의 `.pid`(= Claude 네이티브 pid) → 살아 있는 회차를 죽은 것으로 판정, 폴러가 대상을 못 고름. 110 `bash "$1"`(lead-state)는 문제없음. | 실행불가(office·console 폴러 대상 선택) | 두 함수를 `compat_pid_alive` 로 교체. | S |
| lib/compact-screen.sh | grep -E, tr | 문제 없음(11줄 한 줄, `grep -Eio` 는 GNU OK). | - | - | - |

### scripts

| 파일 | 필요 런타임 | 깨지는 지점(줄·명령) | 심각도 | 수정 방향 | 크기 |
|---|---|---|---|---|---|
| office.sh | jq, git, bash, dflow.sh | 465·623·647 `coord_pid_alive` → 네이티브 pid 를 못 봐 reap 이 살아 있는 조정 세션을 죽은 것으로 보고 `watch --stop` 으로 팀원 키·팀장 칸을 내림(30초마다 반복). 75 `case "$DFLOW" in /*)` 윈도우 절대경로 `C:\…` 면 리포 경로를 앞에 붙임. 334 `hostname` OK. 116~117·137 `compat_descendants`·`compat_kill_tree` 사용(OK). | 실행불가(reap 경로 — 정상 세션을 내림) | common.sh 의 `coord_pid_alive` 만 고치면 해소. 75 는 `compat_is_abs`. | S |
| console-poll.sh | jq, node(선택), nohup | 135·140·142 자체 `kill_tree` 가 `kill -STOP/-CONT` 를 씀: MSYS kill 이 STOP/CONT 를 네이티브 자손에 보내지 못할 수 있고(추정) `/usr/bin/kill -f` 폴백이 없음 → 시간 초과 때 자손이 남을 수 있음. `compat_kill_tree` 와 중복. 226·1099~1102 `kill -0`(잠금 주인 = MSYS pid 라 OK). 228 `coord_pstart` 빈 값(가드 있음). 183 `/*)` 절대경로(윈도우 `C:` 경로 비인식). 1076~1088 setsid 없으면 nohup(OK, 윈도우는 node 경로 제외 코드가 이미 있음). 120 `mktemp -d "${TMPDIR:-/tmp}/…"`, 1105 임시 폴더 삭제 가드 `/*/coord-console.*` 는 TMPDIR 이 `C:\…` 이면 불일치로 정리를 건너뜀(추정). | 일부기능 | `kill_tree` 를 `compat_kill_tree` 로 대체(STOP 단계 제거 또는 비윈도우에만). 임시 폴더 가드는 `compat_posix_path` 후 비교. | M |
| spawn-lane.sh | jq, orca | (a) 61 `live_session_pids` 가 `kill -0 "$p"` → 윈도우에서 새 세션을 영영 못 찾아 30초 후 `SPAWN_FAIL process`. (b) 101~108 `--worktree` 가 `/*|path:*` 만 절대경로로 허용하고 `p` 도 `/*` 로 재검사 → `C:\x`·`C:/x` 를 거부(`die 2`). (c) 101·107 `pwd -P` 는 `/c/x` 를 내므로 130 에서 Orca 터미널의 셸로 보내는 `cd '/c/x' && claude …` 가 PowerShell/cmd 면 실패(추정). `&&` 는 PowerShell 5.1 에서 문법 오류. (d) 47 `$(cd "$(dirname "$pfile")" && pwd)/…` 지시 파일 경로가 `/c/...`(MSYS) 로 레인 세션에 전달됨 → 네이티브 Claude 의 Read 도구가 못 열 수 있음(추정). | 실행불가(spawn 전체) | (a)→compat_pid_alive. (b)→`compat_is_abs` 로 판정하고 내부에서는 `compat_posix_path`. (c)(d) 터미널에 보내는 경로는 윈도우면 `cygpath -m`(C:/…)로 변환하고, 셸이 bash 인지 확인하는 사전 점검(첫 화면에 `$`/`PS` 표시)을 두거나 설정 `launch.shell` 로 명령 템플릿을 갈음. | M |
| search.sh | jq, orca, agy/opencode | 80·84 탭 모드가 터미널에 `cd 'x' && ( set -o pipefail; … ; echo $? > 'f' )` 를 보냄 → 셸이 bash 가 아니면 실패(추정). 50 `shq`(sed 로 따옴표 이스케이프)도 bash/zsh 문법 전제. 122~123 `kill -0 "$pid"` 는 자기 서브셸 pid 라 OK. 75 `orca terminal create … | jq` OK. | 일부기능(탭 모드; 단발 `--print` 폴백은 동작) | 윈도우는 `mode=print` 를 기본으로 하거나, 탭에는 `bash -lc '…'` 로 감싸 보냄. | S |
| idle-check.sh | jq | 54 `coord_pid_alive "$spid"` → 모든 레인 `GONE`. 그 뒤 판정 전부 무의미. 나머지(`date`, `head`, `tr`)는 OK. | 실행불가(핵심 판정) | common.sh 수정으로 해소. | S |
| coord-status.sh | jq, git, sed, awk | 57·132 `coord_pid_alive`(위와 같음). 91~94 `load1` 이 빈 값 → `awk -v l=""` 이 0 으로 계산해 `per_core=0.00` 으로 표시(관측 불가가 아니라 한가함으로 보임). 99~104 `sysctl vm.swapusage`·`/proc/meminfo` 없음 → `swap=-`(가드 있음, OK). 120~128 UNLINKED 판정: `git worktree list` 는 `C:/x`, 세션 json 의 `cwd` 는 `C:\x`(네이티브) → 접두 비교(`case "${ucwd%/}/" in "${w%/}/"*`)가 항상 불일치 → 끼어든 세션을 한 건도 못 찾음. 69 `coord_wt_abs` 도 위 경로 문제. | 일부기능 | load 는 「관측 불가」로 `-` 출력, UNLINKED 비교 전에 양쪽을 `compat_posix_path`(백슬래시→슬래시 포함) 정규화. | S |
| close-lane.sh | jq, git | 63 `kill -0 "$pid"`(세션 pid 는 네이티브) → 후손 검사 생략(백그라운드가 도는 중에도 닫힘 가능). 54 `cd "$wt" && pwd -P` → `/c/x`, 104 `git worktree list` 는 `C:/x` 라 `grep -qxF "worktree $wt_check"` 불일치(경고만 누락). 83·89 `case "$cwd"` 는 `/proc/<pid>/cwd`(posix) 대 `$wt`(상태값 `C:/x`) 비교 → 89 의 `"$wt"` 쪽이 어긋남. | 일부기능(안전 가드 약화) | `compat_pid_alive`, 비교 전 posix 정규화. | S |
| measure-window.sh | jq | 44~47 `coord_pstart` 빈 값 → `[ -n "$cur" ] && [ "$cur" = "$ps0" ]` 가 거짓이어서 잡을 절대 안 끔(`kill -TERM` 도 네이티브 pid 면 효과 없음). 110~112 `quiet-check`: load 가 비면 `${load:-0}` 으로 0 취급 → 부하와 무관하게 `QUIET yes` 가 나올 수 있음(측정 신뢰도 문제). 113 `compat_ps_table` 의 `awk '{ $2=""; print }'`·`grep -viE` OK. | 일부기능 | load 관측 불가면 `QUIET unknown`(no 쪽으로)을 내도록 수정. 잡 정지는 `compat_kill_tree`. | S |
| stall-check.sh | gawk, git, xargs, cksum | 30~35 윈도우는 `CPU_OBS=0` 로 `OK` 만 출력(의도된 비활성). 이 경우 STALL 감지 자체가 없음. 82 `xargs -0 stat -c %Y`, `cksum` OK. 문서에서 STALL 에 기대는 곳이 있으면 안내 필요. | 일부기능(기능 비활성) | `/proc/<pid>/stat` 의 utime·stime 을 읽도록 `compat_proc_cpu` 추가(추정: MSYS 가 값을 주는지 실측 필요). 그전엔 `STALL?`(미관측)로 표시. | M |
| auto-answer.sh | jq, gawk 불필요 | (a) 225~226 `path_ok`: `C:\…`·`C:/…` 는 `/*` 에 안 걸려 마지막 `*)` 상대경로 분기로 들어가 `wt_abs` 만 알면 통과 → `cp x C:\Windows\…` 가 edit-own 으로 자동 허용될 수 있음(보안). 백슬래시 `..\` 도 `*/../*` 에 안 걸림. (b) 179 trust 판정이 `here`(Orca 의 `worktreePath`=`C:\…`)와 `repo`(`C:/…`)를 접두 비교 → 항상 `outside-repo` 로 올림(안전 방향, 기능 상실). (c) 209 거부 정규식에 윈도우 삭제·종료 명령(`del`, `rd /s`, `Remove-Item`, `taskkill`, `Stop-Process`, `format`)이 없음. 단 알 수 없는 명령은 249~258 범주표에서 `unknown` 으로 올리므로 우회는 `path_ok`·`status` 범주 오분류 때만 가능. 246 `status` 범주에 `ps` 가 있어 Git Bash `ps`(Cygwin) 도 허용(무해). | 일부기능(a 는 보안상 우선) | (a) 절대경로 분기에 `[A-Za-z]:*|*\\*` 추가, TMP 허용 목록을 `compat_posix_path` 후 비교. (b) 양쪽 정규화. (c) 거부 정규식에 `del|rd|Remove-Item|taskkill|Stop-Process|format\.com` 추가. | S |
| term-send-safe.sh | jq, gawk, sed | 77·104 `LC_ALL=C sed $'s/\xc2\xa0/ /g'` OK(바이트 치환). 150 `mktemp "${TMPDIR:-/tmp}/…"` OK. `--text` 가 `/` 로 시작하면 MSYS 경로 변환 위험은 term.sh 와 같음(compact-lane 의 `/compact …` 가 대표 사례, 추정). | 일부기능 | term.sh 수정으로 해소. | S |
| compact-lane.sh | jq | 61 `text="/compact …"` 를 orca `--text` 로 전달 → 경로 변환 위험(추정). 73 `--timeout-ms 300000` 문제 없음. 62 `tr '\n\r\t' '   '` OK. | 일부기능(추정) | term.sh 수정. | S |
| glm-preflight.sh | curl, jq, mktemp, chmod | 67 `-H "@$hdr"`: `@` 뒤 `/tmp/…` 는 MSYS 의 자동 경로 변환 대상이 아닐 수 있어 curl(native)이 못 찾을 수 있음(추정). 62 `chmod 600` 무효(토큰이 든 헤더 파일, 곧 삭제하고 `umask`도 무효). 55 `mktemp -d` OK. | 일부기능(추정) | 헤더 파일 대신 `-H "x-api-key: …"` 를 쓰지 말고(프로세스 목록에 노출), `cd "$tmpdir"` 후 상대 이름 `@h` 로 지정. | S |
| ctx-usage.sh | jq, tail -c, wc | 100~103 `wc -c`·`tail -c` OK. 문제 없음(상위 `coord_session_file`·`coord_epoch_to_iso` 는 compat 경유). | - | - | - |
| statusline-dump.sh | jq, node 없음 | 7~12 jq 가 없으면 아무것도 안 함(설계상 무해: 마지막 줄 `COORD_STATUSLINE_NEXT` 전달만 수행). `bash -c "$COORD_STATUSLINE_NEXT"` 의 실행 셸은 Claude 가 statusLine 명령을 어떤 셸로 실행하느냐에 따름(추정). | 일부기능 | statusLine 설정 문서에 윈도우 실행 방법(`bash <경로>`) 명시. | S |
| usage-band.sh | jq, awk | 문제 없음(날짜는 compat, 파일 mtime 은 `coord_file_mtime`). 기본 출처 `/tmp/claude-usage-cache.json` 만 윈도우에 없을 수 있으나 다음 출처로 폴백. | - | - | - |
| coord-state.sh | jq | 상태 파일 갱신이 `jq … "$f" \| cat > tmp; mv -f tmp f`(48~58). 네이티브 jq.exe 가 같은 파일을 읽는 중에 mv 가 겹치면 `Permission denied`(추정, 드묾). `CLAUDE_PID` 를 `.run.coordinator.pid` 로 기록하는데(cmd_init) 이 값이 네이티브 pid 라 위 `coord_pid_alive` 결함의 입력이 됨. | 일부기능 | 상태 쓰기 실패 시 재시도 1~2회(`mv -f` 실패 → `sleep 0.2` 후 재시도). | S |
| merge-gate.sh | git ≥ 2.38, jq | 93 `git merge-tree --write-tree`(Git for Windows 2.38+ OK). 84 `rev-parse --show-toplevel` 는 `C:/x`(cd 가능). 문제 없음. | - | - | - |
| tick.sh | jq, bash | 20 `$(cd "$(dirname "$0")" && pwd)` OK. 다른 스크립트를 `bash "$SD/…"` 로 호출(실행 권한 불필요). 하위 스크립트 결함의 영향만 받음. | - | - | - |
| prompt-watch.sh | jq, gawk | 문제 없음(화면 판정은 awk·bash). screen-cache 신뢰 실패 시 직접 읽기로 폴백. | - | - | - |

문제 없음(위 표에서 「-」 로 표시한 것 포함): lib/compact-screen.sh, ctx-usage.sh, usage-band.sh, merge-gate.sh, tick.sh, prompt-watch.sh. (이들은 jq 의존 외에 윈도우 고유 결함을 찾지 못했다.)

---

## (2) jq 의존 요약

jq 가 없으면 `lib/common.sh:75` 가 `exit 4` 해서 common.sh 를 source 하는 모든 스크립트가 종료된다.

| 파일 | jq 줄 수(대략) |
|---|---|
| console-poll.sh | 48 |
| coord-state.sh | 32 |
| office.sh | 29 |
| lib/common.sh | 20 |
| auto-answer.sh | 17 |
| coord-status.sh | 16 |
| lib/console-resolve.sh | 15 |
| lib/console-input.sh | 14 |
| measure-window.sh | 10 |
| lib/term.sh | 8 |
| idle-check.sh | 8 |
| compact-lane.sh / spawn-lane.sh | 7 / 7 |
| stall-check.sh | 6 |
| ctx-usage.sh | 5 |
| merge-gate.sh / search.sh / tick.sh | 4 / 4 / 4 |
| glm-preflight.sh | 3 |
| close-lane.sh / statusline-dump.sh / usage-band.sh / lib/screen-cache.sh | 2 / 2 / 2 / 2 |
| references/contract.md | 5(문서 예시) |

합계 약 265줄(스크립트). jq 를 안 쓰는 스크립트: term-send-safe.sh(term.sh 경유로는 씀), lib/compat.sh, lib/compact-screen.sh, lib/console-redact.sh.

jq 없이는 못 도는 핵심 경로:
- 설정 병합 `_coord_cfg_ensure`(common.sh 약 100~150줄): 기본값·`.coord.json`·`.coord.local.json` 을 jq 로 깊은 병합. 모든 `coord_cfg` 호출의 바탕.
- 회차 상태 `state.json` 읽기·쓰기 전부(coord-state.sh `st_apply`, `coord_lane_get`, `coord_state`).
- Orca 연동 전부(lib/term.sh 의 `terminal list/read/send/close/wait` 응답 파싱).
- tick·idle-check·coord-status·merge-gate·usage-band·spawn-lane·close-lane·compact-lane·auto-answer·console-poll·office 의 판정.
- 대체 가능성: 단순 키 조회는 bash 로 가능하나 깊은 병합·`@sh`·정규식(`\A`, `\z`)·`@tsv` 를 쓰므로 현실적으로 jq.exe 설치가 필요(Windows 용 jq.exe 단일 파일, 1.6 이상; 아래 CRLF 주의).
- **jq.exe CRLF 주의(추정)**: 윈도우용 jq 빌드는 stdout 을 텍스트 모드로 열어 줄끝에 `\r` 을 붙일 수 있다(1.7 의 `-b/--binary` 옵션이 이 때문에 존재). 스크립트는 `$(jq -r …)` 결과를 그대로 `case`·`[ = ]` 로 비교하므로 `\r` 이 섞이면 거의 모든 비교가 어긋난다. 설치 후 `jq -n '"a"' | od -c` 로 확인하고, 필요하면 common.sh 에서 `jq() { command jq "$@" | tr -d '\r'; }` 래퍼 또는 환경변수/별칭으로 `-b` 를 강제하는 보호막이 필요.

---

## (3) 몇 줄짜리 확실한 수정 목록

| 파일:줄 | 바꿀 내용 |
|---|---|
| lib/common.sh:438 | `coord_pid_alive() { compat_pid_alive "${1:-}"; }` (compat_pid_alive 가 0·null 도 거름). office.sh 465·623·647, idle-check.sh:54, coord-status.sh:57·132 가 한 번에 고쳐짐. |
| spawn-lane.sh:61 | `kill -0 "$p"` → `compat_pid_alive "$p"` (spawn-lane.sh 는 compat.sh 를 이미 source 하는지 확인, common.sh 가 source 하므로 가용) |
| close-lane.sh:63 | `kill -0 "$pid" 2>/dev/null` → `compat_pid_alive "$pid"` |
| lib/console-resolve.sh:28 | `! kill -0 "$1" 2>/dev/null` → `! compat_pid_alive "$1"` |
| lib/console-resolve.sh:30 | `kill -0 "$1" 2>/dev/null` → `compat_pid_alive "$1"` |
| lib/common.sh:432~436 | `repo="$(coord_repo 2>/dev/null)"` 다음에 `[ "$COMPAT_WIN" = 1 ] && repo="$(compat_posix_path "$repo")"` 한 줄 추가 |
| auto-answer.sh:226 | `/*|~*|..*|*/../*)` → `/*|~*|..*|*/../*|[A-Za-z]:*|*\\*)` (드라이브 문자·백슬래시 경로를 상대경로로 오인하지 않게) |
| spawn-lane.sh:104~105 | 절대경로 판정 `/*` 에 `[A-Za-z]:[/\\]*` 추가하고 값은 `compat_posix_path` 로 정규화 |
| lib/term.sh 맨 위(함수 정의 앞) | `export MSYS2_ARG_CONV_EXCL='*'` 한 줄(orca 에 `--text "/compact …"` 가 경로로 변환되는 것 방지, 추정이므로 먼저 실측) |
| lib/common.sh:313~316 | 윈도우면 `coord_load1` 이 빈 출력을 내고, 호출처(coord-status.sh:91, measure-window.sh:110)는 빈 값을 `-`/`QUIET unknown` 으로 취급(0 으로 취급하지 않기) |
| measure-window.sh:111~114 | load 가 비면 `r=no`(또는 unknown)로 판정하도록 분기 한 줄 |
| coord-status.sh:120~128 | `ucwd`·`w` 비교 전에 `ucwd="$(compat_posix_path "${ucwd//\\//}")"` 와 `w="$(compat_posix_path "$w")"` |
| console-poll.sh:128~143 | `kill_tree` 본문을 `compat_kill_tree "$1"` 호출 한 줄로 대체(STOP/CONT 단계는 제거) |
| lib/screen-cache.sh:108~115 | `_sc_trusted` 에서 `COMPAT_WIN=1` 이면 700/600 모드 비교를 건너뜀 |
| auto-answer.sh:209 | 거부 정규식에 `del|rd|Remove-Item|taskkill|Stop-Process` 추가(방어 심화, 알 수 없는 명령은 이미 올림) |

---

## (4) SKILL.md·references 에 적힌 macOS 전용 셸 명령·경로

SKILL.md 는 해당 없음(Claude 도구 `CronCreate`·`Monitor`·`SendMessage` 와 `scripts/*.sh` 호출만 있음). references 는 다음 한정된 곳만 macOS 식이다.

| 위치 | 내용 | 윈도우 영향·수정 |
|---|---|---|
| references/heavy.md:27 | 「회차마다 `uptime` load 를 남기게 한다」 | Git Bash 에 `uptime` 은 있어도(Cygwin 판) 부하 평균 값이 없을 수 있음(추정). 윈도우에서는 `coord_load1` 도 비므로 「load 관측 불가」 대안(작업 관리자 CPU %·`heavy.sh status`)을 병기. |
| references/heavy.md:52 | `ps -Ao pid,pcpu,etime,command` | Git Bash `ps` 는 `-A`/`-o` 불가. 윈도우 대안: `ps -W` 또는 `tasklist`, 프로세스별 CPU 는 PowerShell `Get-Process`(문서에서는 「macOS/Linux 한정」 표기). |
| references/protocol.md:25 | 세션 주소 `uds:/tmp/cc-socks/<pid>.sock` | 유닉스 소켓 경로 예시. 윈도우 Claude 의 `messagingSocketPath` 형식은 다를 수 있음(추정). 「예시」임을 밝히고 값은 세션 json 에서 읽는다고 적기. |
| references/protocol.md:101, templates/lane-rules-README.md:97 | `uptime` load 를 회차마다 남김 | heavy.md:27 과 같음. |
| references/contract.md:36 | 기본 사용량 출처 `/tmp/claude-usage-cache.json` | 윈도우 node 가 쓰는 `/tmp`(=C:\tmp) 와 Git Bash `/tmp` 가 다름(추정). 윈도우는 `~/.coord/ctx`(coord-dump) 출처를 우선한다고 안내. |
| references/contract.md:87 | `tasks_root` 예시 `/private/tmp/claude-501` | macOS 경로. 윈도우 예시(`C:/Users/<이름>/AppData/Local/Temp/claude/…`, 추정)를 병기. |
| references/contract.md:244 | 「python3(선택)」 | 스크립트가 python 을 쓰지 않음(grep 확인). 문구를 정리해 혼동 방지. 「Git Bash 에는 jq·node·orca 가 기본 제공이 아니다」는 정확. |
| references/contract.md:245~246 | compat 가이드 | 정확하지만 「`kill -0` 은 네이티브 pid 를 못 본다」(platform-support.md 규칙 5)를 작성 규칙에 한 줄 더 넣으면 이번 같은 누락을 막을 수 있음. |

`brew`·`pbcopy`·`open`·`osascript`·`launchctl`·`lsof`·`pgrep` 등 나머지 macOS 전용 명령은 SKILL.md·references·templates 어디에도 없다(grep 확인).
