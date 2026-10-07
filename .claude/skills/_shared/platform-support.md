# 스킬 스크립트 지원 환경 (정본)

coordinator·dflow-* 스킬의 셸 스크립트는 **macOS** 와 **Git for Windows 의 Git Bash(MSYS2, GNU coreutils, bash 5)** 에서 같이 돈다.
윈도우 사용자도 같은 스킬을 쓰므로, 스크립트를 새로 쓰거나 고칠 때 아래 규칙을 지킨다. (Linux 는 GNU 쪽 경로와 같다.)

윈도우 전제: Claude Code 는 Git for Windows 없이도 PowerShell 도구만으로 돌 수 있다(공식 문서 setup·tools-reference). 그러나 Bash 도구·Monitor 도구와 이 스킬의 `.sh` 는 Git Bash 가 있어야 돈다. 이 리포는 git 으로 작업하므로 Git for Windows(Git Bash 포함)를 전제로 한다. 전체 점검 결과와 python·jq 방침은 `docs/superpowers/specs/2026-10-07-skills-windows-compat.md` 를 본다.

## 필요 도구

| 도구 | macOS | Git Bash | 비고 |
|---|---|---|---|
| bash(3.2 이상)·sh·awk·sed·grep·cut·sort·tr·wc·date·stat·touch·mktemp·cksum·find·xargs | 기본 | 기본 | macOS 기본 bash 는 3.2 라 연관 배열·`${var,,}`·`$BASHPID`·`mapfile` 을 쓰지 않는다 |
| git·curl | 기본 | 기본 | |
| openssl 또는 sha256sum | 기본(openssl) | 기본 | 해시는 `lib/compat.sh` 의 `compat_sha256` 로 |
| **jq** | 설치 필요(`brew install jq`) | **동봉**(`_shared/bin/win64/jq.exe` 1.7.1, 설치 불필요) | 모든 coordinator·dflow 스크립트가 쓴다. 윈도우에서는 각 **스크립트가** `_shared/bin`(래퍼 `jq` → `win64/jq.exe -b`)을 PATH 앞에 둔다. 스킬 문서 속 인라인 `… | jq …` 예시를 에이전트가 Bash 도구로 직접 실행할 때는 PATH 가 바뀌지 않으므로 jq 를 찾지 못한다(후속: 인라인 호출을 `bash <_shared>/bin/jq` 로 바꾸거나 PATH 를 세션에 넣는다). `_shared` 를 빼고 dflow-* 만 설치하면 동봉 jq 를 찾지 못하므로 `_shared` 를 함께 배포한다. 출처·SHA-256·갱신 방법은 `_shared/bin/README.md` |
| node(**18.17 이상**) | 설치 필요 | 설치 필요 | python 에서 옮겨 온 스크립트(`.mjs`)와 `_shared/node/` 공용 헬퍼가 쓴다(`node:test`·`util.parseArgs`·`readdirSync` 재귀). 그 밖에 `mutate.sh`(변이 검증), `free-port.sh` 폴백, 해시 마지막 폴백 |
| orca CLI | 설치 필요 | 설치 필요 | coordinator 전반(터미널·워크트리 조작) |
| pnpm·gradle·docker | 프로젝트별 | 프로젝트별 | 스킬이 직접 요구하지 않는다 |
| python3 | 선택 | 선택 | `free-port.sh` 의 첫 선택지(없으면 node → lsof·nc). oasis-contract-check(훅·게이트·selftest)는 node(`.mjs`)로 옮겨져 python 이 필요 없다 |

Git Bash 에 **없는** 명령: `ps -o`·`ps -x`(Cygwin 판 ps 는 `-W`·`-e`·`-f` 만), `pgrep`·`pkill`, `lsof`, `sysctl`, `launchctl`, `caffeinate`, `memory_pressure`, `vm_stat`.
`perl` 은 Git for Windows 에 들어 있어도 쓰지 않는다.

## 작성 규칙

1. **macOS 전용 명령·옵션을 스크립트에서 직접 부르지 않는다.** `ps -axo`·`pgrep`·`pkill`·`lsof`·`stat -f`·`date -r <epoch>`·`date -j`·`date -v`·`sed -i ''`·`sysctl`·`shasum`·`/private/tmp` 경로.
   쓸 일이 있으면 coordinator 의 `scripts/lib/compat.sh` 공용 함수를 거친다(`compat_stat_mtime`·`compat_epoch_fmt`·`compat_ps_table`·`compat_descendants`·`compat_kill_tree`·`compat_pgrep_f`·`compat_pid_cwd`·`compat_pid_alive`·`compat_sha256`).
   dflow-* 스크립트는 coordinator 를 source 하지 않으므로 같은 규칙을 그 파일 안에 짧게 둔다.
2. **perl 을 쓰지 않는다.** 셸 내장·POSIX 도구로 되면 그것으로, 안 되면 node(드문 경로에만 — 자주 부르는 곳에서 매번 node 를 띄우지 않는다).
3. **`BSD 명령 || GNU 명령` 사슬은 GNU 를 앞에 둔다.** GNU `stat -f` 는 파일시스템 모드라 `stat -f %m 파일` 이 `?` 를 내고 rc 0 으로 끝난다. 그래서 `stat -f %m X || stat -c %Y X` 는 GNU 에서 대안으로 넘어가지 못한다. `stat -c`(BSD 는 `illegal option` 으로 rc 1)를 먼저 한다. `date -r`·`date -j`·`date -v` 는 GNU 에서 오류 rc 로 끝나 `|| date -d` 대안이 실제로 돈다(그래도 공용 함수가 낫다).
4. **프로세스 조회·종료는 공용 함수로.** Git Bash 에서는 `/proc/<pid>/{ppid,cmdline,cwd}` 를 bash 내장으로 읽는다(fork 0). 후손 목록은 pid·ppid 표를 한 번 읽어 awk 로 구한다(`pgrep -P` 재귀 대신).
5. **`kill -0` 은 Git Bash 에서 네이티브 Windows pid 를 못 알아본다.** 살아 있는지 확인할 때는 `compat_pid_alive`(또는 `ps -W` 의 WINPID 열)를 쓴다.
6. **경로**: `/tmp` 는 Git Bash 에서도 동작하지만 `$TMPDIR` 우선(`${TMPDIR:-/tmp}`). PC 이름·사용자 홈 경로를 스크립트·문서에 박지 않는다. `ln -s` 는 Git Bash 기본이 **복사**를 만든다(진짜 심링크는 개발자 모드 + `MSYS=winsymlinks:nativestrict`) — 심링크를 전제로 하는 기능(`deps.sh` 의 의존성 링크)은 윈도우에서 동작이 다르다.
7. 시간 상한·새 프로세스 세션은 아직 통일하지 못했다: `console-poll.sh` 는 perl `POSIX::setsid` → nohup, `heavy.sh` 는 `set -m` + nohup, `console-input.sh` 의 시간 상한은 perl `alarm` 이다. 새로 쓸 때는 시간 상한을 GNU `timeout`(Git Bash 에 있음, macOS 에는 없음) → 셸 감시 순으로, 새 세션은 node spawn detached → nohup 순으로 한다.
8. **jq 를 쓰는 새 진입 스크립트는 머리말(첫 실행 줄 앞)에 동봉 jq 를 켜는 한 줄을 둔다.** 기존 스크립트(`dflow.sh`·`tick.sh` 등)의 첫 줄을 그대로 복사한다(`case "${COMPAT_FORCE_OS:-$(uname -s)}" in windows|MINGW*|… ) PATH="…/_shared/bin:$PATH"`). coordinator 스크립트는 `lib/common.sh` 를 source 하면 `lib/compat.sh` 가 같은 일을 하므로 필요 없다. 윈도우 jq.exe 는 `jq` 래퍼(`-b`)로만 부른다 — 그래야 출력 줄끝이 CRLF 가 되지 않는다.
9. **python 을 새로 쓰지 않는다.** 스크립트는 bash 나 node(`.mjs`, 18.17 이상)로 쓰고, node 공용 헬퍼는 `_shared/node/` 를 쓴다.

## 알려진 한계(Git Bash)

- **perl·pgrep 제거가 아직 끝나지 않은 파일**(다른 작업이 끝나는 대로 `compat.sh` 함수로 교체한다): `lib/common.sh`(`stat -f` 순서·`ps -o lstart`·`lsof`·`ps -axo`), `console-poll.sh`(`pgrep -P` 후손 종료·perl setsid), `lib/console-input.sh`(perl alarm·밀리초 시각), `lib/screen-cache.sh`(perl 밀리초). Git Bash 에서는 perl 이 있으면 그대로 돌고, `pgrep`·`lsof` 가 필요한 부분(폴러의 후손 종료·`coord_wt_procs`)은 동작하지 않는다.
- 신호: MSYS `kill -TERM` 이 node.exe 를 강제 종료하면 신호 핸들러가 돌지 못한다(`mutate.sh` 는 다음 실행이 사본을 되돌린다).
- /proc 에는 MSYS 가 띄운 프로세스만 보인다. 네이티브 프로세스(node.exe 등)의 손자는 후손 목록·`compat_kill_tree` 에서 빠져 시간 초과 정리 때 남을 수 있다.

윈도우에서 얻을 수 없는 값은 「관측 불가」로 열어 두고, 그 값이 필요한 판정은 하지 않는다(판정 불가를 알린다).

- 프로세스 누적 CPU 시간(`ps -o time=`): `stall-check.sh` 는 STALL 을 내지 않고 `OK` 만 낸다(stderr 에 사유 한 줄).
- 프로세스 시작 시각(`ps -o lstart=`): pid 재사용 판정을 생략한다(pid 존재만 본다).
- 1분 부하·스왑·메모리 압력: `capacity.sh` 는 `CAPACITY_UNKNOWN`(막지 않음), `coord-status.sh` 는 `-` 로 표시한다.
- 네이티브(비 MSYS) 프로세스의 작업 폴더: `/proc/<pid>/cwd` 가 없으면 빈 값이다.

## 시험

- 윈도우 실기 시험은 macOS PC 에서 못 한다. 대신 `coordinator/tests/compat.sh` 가 GNU 경로(PATH 앞에 GNU 흉내 `stat`·`date`, `stat -f` 함정 재현)와 Git Bash 경로(`ps -o` 가 없는 ps + 가짜 `/proc` 트리, `COMPAT_FORCE_OS=windows`·`COMPAT_PROC_ROOT`)를 강제로 탄다.
- 새 공용 함수를 추가하면 같은 파일에 GNU·Git Bash 경로 시험 1건을 함께 둔다.
- 변경 뒤 한 번은 실제 Git Bash 에서 `bash coordinator/tests/compat.sh` 를 돌려 본다(실기 확인은 윈도우 사용자 몫).
