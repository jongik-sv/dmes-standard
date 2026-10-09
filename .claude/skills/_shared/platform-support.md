# 스킬 스크립트 지원 환경 (정본)

coordinator·dflow-* 스킬의 셸 스크립트는 **macOS** 와 **Git for Windows 의 Git Bash(MSYS2, GNU coreutils, bash 5)** 에서 같이 돈다.
윈도우 사용자도 같은 스킬을 쓰므로, 스크립트를 새로 쓰거나 고칠 때 아래 규칙을 지킨다. (Linux 는 GNU 쪽 경로와 같다.)

윈도우 전제: Claude Code 는 Git for Windows 없이도 PowerShell 도구만으로 돌 수 있다(공식 문서 setup·tools-reference). 그러나 Bash 도구·Monitor 도구와 이 스킬의 `.sh` 는 Git Bash 가 있어야 돈다. 이 리포는 git 으로 작업하므로 Git for Windows(Git Bash 포함)를 전제로 한다. 전체 점검 결과와 python·jq 방침은 `docs/superpowers/specs/2026-10-07-skills-windows-compat.md` 를 본다.

## 필요 도구

| 도구 | macOS | Git Bash | 비고 |
|---|---|---|---|
| bash(3.2 이상)·sh·awk·sed·grep·cut·sort·tr·wc·date·stat·touch·mktemp·cksum·find·xargs | 기본 | 기본 | macOS 기본 bash 는 3.2 라 연관 배열·`${var,,}`·`$BASHPID`·`mapfile` 을 쓰지 않는다 |
| git·curl | 기본 | 기본 | |
| openssl 또는 sha256sum | 기본(openssl) | 기본 | 해시는 `lib/compat.mjs` 의 `sha256Hex` 로 |
| **jq** | 설치 필요(`brew install jq`) | **동봉**(`_shared/bin/win64/jq.exe` 1.8.2, 설치 불필요) | 모든 coordinator·dflow 스크립트가 쓴다. 윈도우에서는 각 **스크립트가** `_shared/bin`(래퍼 `jq` → `win64/jq.exe -b`)을 PATH 앞에 둔다. 스킬 문서 속 인라인 `… | jq …` 예시를 에이전트가 Bash 도구로 직접 실행할 때는 PATH 가 바뀌지 않으므로, 호출마다 맨 앞에 PATH 를 잡는다(아래 「문서 속 인라인 jq」). `_shared` 를 빼고 dflow-* 만 설치하면 동봉 jq 를 찾지 못하므로 `_shared` 를 함께 배포한다. 출처·SHA-256·갱신 방법은 `_shared/bin/README.md` |
| node(**18.17 이상**) | 설치 필요 | 설치 필요 | python 에서 옮겨 온 스크립트(`.mjs`)와 `_shared/node/` 공용 헬퍼가 쓴다(`node:test`·`util.parseArgs`·`readdirSync` 재귀). 옮겨 온 스크립트는 oasis-contract-check(검사기·훅·selftest), flyway-migration-add·adr-write(채번·린트), dflow-export(`wbs-parse`·`wbs-validate`·`dep-analysis`·`wbs-envelope`), dflow-wbs(`decision-log`·`prd-validate`·`xlsx-read`·`xlsx-write`), dflow-wbs-nlevel(`wbs-nlevel-parse`)다. 그 밖에 `mutate.sh`(변이 검증), `free-port.sh`(첫 선택지), `capacity.sh`(윈도우 메모리·CPU 수), `timeout-guard.sh`(jq 없을 때), `junit-count.sh`(XML 합산), 해시 마지막 폴백 |
| orca CLI | 설치 필요 | 설치 필요 | coordinator 전반(터미널·워크트리 조작) |
| pnpm·gradle·docker | 프로젝트별 | 프로젝트별 | 스킬이 직접 요구하지 않는다 |
| python3 | 선택 | 선택 | 이식이 끝난 스킬(oasis-contract-check·flyway-migration-add·adr-write·dflow-export·dflow-wbs·dflow-wbs-nlevel·mantine-aggrid-ui·`junit-count.sh`·`free-port.sh`)의 실행 경로에는 필요 없다. 스킬 폴더에 남은 `.py` 는 `tests/golden/legacy/` 의 동결 원본과 그 원본을 부르는 시험 전용 드라이버(mantine-aggrid-ui 의 `aggrid_driver.py`·`aggrid_re_probe.py`)뿐이다. 시험이 이것으로 node 판 출력을 비교하며, python 이 없으면 그 비교는 건너뛰고 기대값 파일이 있는 시험은 그 값과 비교한다. 스킬 밖에서는 `tools/bp-sync*` 와 `scripts/perf/framework` 가 python 이다. `tools/bp-sync*` 는 python 유지(윈도우는 python 설치), `bp-sync-schedule` 은 macOS(launchd) 전용이다 |

Git Bash 에 **없는** 명령: `ps -o`·`ps -x`(Cygwin 판 ps 는 `-W`·`-e`·`-f` 만), `pgrep`·`pkill`, `lsof`, `sysctl`, `launchctl`, `caffeinate`, `memory_pressure`, `vm_stat`.
`perl` 은 Git for Windows 에 들어 있어도 쓰지 않는다.

### 문서 속 인라인 jq

스킬 문서(`.md`)에는 `… | jq …` 꼴의 인라인 예시가 있다. 스크립트(`.sh`)는 스스로 `_shared/bin` 을 PATH 앞에 두지만, 에이전트가 이 예시를 Bash 도구로 직접 칠 때는 PATH 가 바뀌지 않아 윈도우에서 jq 를 찾지 못한다. Bash 도구는 호출 사이에 셸 환경을 유지하지 않으므로 **호출마다** 같은 호출 맨 앞에 아래를 붙인다.

```bash
export PATH="$PWD/.claude/skills/_shared/bin:$PATH"; <문서의 jq 예시>
```

- 저장소 루트에서 실행하는 전제다(이 문서의 다른 예시도 `.claude/skills/...` 상대 경로를 쓴다).
- macOS·리눅스는 jq 가 이미 PATH 에 있으므로 붙이지 않아도 된다.
- 스크립트(`.sh`)를 통해 실행하는 경우에는 스크립트가 알아서 하므로 필요 없다.
- 인라인 jq 예시가 있는 문서는 앞쪽에 같은 안내 한 줄을 둔다(`> 윈도우: …`). 새 문서에 인라인 예시를 쓰면 같은 줄을 넣는다.

## 작성 규칙

1. **macOS 전용 명령·옵션을 스크립트에서 직접 부르지 않는다.** `ps -axo`·`pgrep`·`pkill`·`lsof`·`stat -f`·`date -r <epoch>`·`date -j`·`date -v`·`sed -i ''`·`sysctl`·`shasum`·`/private/tmp` 경로.
   쓸 일이 있으면 coordinator 의 `scripts/lib/compat.mjs` 공용 함수를 거친다(`statMtime`·`epochFmt`·`psTable`·`descendants`·`killTree`·`pgrepF`·`pidCwd`·`pidAlive`·`sha256Hex`).
   dflow-* 스크립트는 coordinator 를 source 하지 않으므로 같은 규칙을 그 파일 안에 짧게 둔다.
2. **perl 을 쓰지 않는다.** 셸 내장·POSIX 도구로 되면 그것으로, 안 되면 node(드문 경로에만 — 자주 부르는 곳에서 매번 node 를 띄우지 않는다).
3. **`BSD 명령 || GNU 명령` 사슬은 GNU 를 앞에 둔다.** GNU `stat -f` 는 파일시스템 모드라 `stat -f %m 파일` 이 `?` 를 내고 rc 0 으로 끝난다. 그래서 `stat -f %m X || stat -c %Y X` 는 GNU 에서 대안으로 넘어가지 못한다. `stat -c`(BSD 는 `illegal option` 으로 rc 1)를 먼저 한다. `date -r`·`date -j`·`date -v` 는 GNU 에서 오류 rc 로 끝나 `|| date -d` 대안이 실제로 돈다(그래도 공용 함수가 낫다).
4. **프로세스 조회·종료는 공용 함수로.** Git Bash 에서는 `/proc/<pid>/{ppid,cmdline,cwd}` 를 bash 내장으로 읽는다(fork 0). 후손 목록은 pid·ppid 표를 한 번 읽어 awk 로 구한다(`pgrep -P` 재귀 대신).
5. **`kill -0` 은 Git Bash 에서 네이티브 Windows pid 를 못 알아본다.** 살아 있는지 확인할 때는 `pidAlive`(또는 `ps -W` 의 WINPID 열)를 쓴다.
6. **경로**: `/tmp` 는 Git Bash 에서도 동작하지만 `$TMPDIR` 우선(`${TMPDIR:-/tmp}`). PC 이름·사용자 홈 경로를 스크립트·문서에 박지 않는다. `ln -s` 는 Git Bash 기본이 **복사**를 만든다(진짜 심링크는 개발자 모드 + `MSYS=winsymlinks:nativestrict`) — 심링크를 전제로 하는 기능(`deps.sh` 의 의존성 링크)은 윈도우에서 동작이 다르다(링크가 한 건도 안 걸리면 `DEPS_WARN` 한 줄을 낸다).
7. 시간 상한·새 프로세스 세션은 스크립트마다 방식이 조금 다르다: 시간 상한은 `console-input.sh` 가 GNU `timeout`(Git Bash 에 있음, macOS 에는 없음) → 셸 감시 순이고, 새 세션은 `console-poll.sh` 가 `setsid` → node spawn detached(윈도우 제외) → nohup 순, `heavy.sh` 는 `set -m` + nohup 이다. 새로 쓸 때는 시간 상한을 GNU `timeout` → 셸 감시 순으로, 새 세션은 `setsid` → node spawn detached → nohup 순으로 한다.
8. **jq 를 쓰는 새 진입 스크립트는 머리말(첫 실행 줄 앞)에 동봉 jq 를 켜는 한 줄을 둔다.** 기존 스크립트(`dflow.sh`·`tick.sh` 등)의 첫 줄을 그대로 복사한다(`case "${COMPAT_FORCE_OS:-$(uname -s)}" in windows|MINGW*|… ) PATH="…/_shared/bin:$PATH"`). coordinator 스크립트(node)는 `lib/common.mjs` 를 import 하면 `lib/compat.mjs` 가 같은 일을 하므로 필요 없다. 윈도우 jq.exe 는 `jq` 래퍼(`-b`)로만 부른다 — 그래야 출력 줄끝이 CRLF 가 되지 않는다.
9. **python 을 새로 쓰지 않는다.** 스크립트는 bash 나 node(`.mjs`, 18.17 이상)로 쓰고, node 공용 헬퍼는 `_shared/node/` 를 쓴다.
10. **coordinator 는 node 판만 쓴다**: `COORD_JS_REDACT` 등 `COORD_JS_<이름>` 스위치와 `lib/js-bridge.sh` 는 퇴역했다(2026-10-09, node 판이 기본이고 유일하다). bash 판은 `coordinator/backup/` 에 보관하며 실행하지 않는다.

## 알려진 한계(Git Bash)

- **perl 은 스크립트에서 모두 걷혔다**(주석에만 남아 있다). `pgrep`·`lsof`·`ps -axo` 는 `lib/compat.mjs` 함수가 흡수한다(Git Bash 에서는 `/proc` 을 읽는다). 단 `lib/common.mjs` 의 `coord_pstart` 에 해당하는 값(`ps -o lstart=`)처럼 Git Bash 에서 값을 얻지 못하는 곳은 아래 「관측 불가」로 처리한다.
- 신호: MSYS `kill -TERM` 이 node.exe 를 강제 종료하면 신호 핸들러가 돌지 못한다(`mutate.sh` 는 다음 실행이 사본을 되돌린다).
- /proc 에는 MSYS 가 띄운 프로세스만 보인다. 네이티브 프로세스(node.exe 등)의 손자는 후손 목록·`killTree` 에서 빠져 시간 초과 정리 때 남을 수 있다.

윈도우에서 얻을 수 없는 값은 「관측 불가」로 열어 두고, 그 값이 필요한 판정은 하지 않는다(판정 불가를 알린다).

- 프로세스 누적 CPU 시간(`ps -o time=`): `stall-check.sh` 는 STALL 을 내지 않고 `OK` 만 낸다(stderr 에 사유 한 줄).
- 프로세스 시작 시각(`ps -o lstart=`): pid 재사용 판정을 생략한다(pid 존재만 본다).
- 1분 부하·스왑·메모리 압력: `capacity.sh` 는 node `os` 로 여유 메모리와 CPU 수만 얻고 스왑·부하는 `?` 로 둔다(전부 못 얻으면 `CAPACITY_UNKNOWN`, 막지 않음). `coord-status.sh` 는 `-` 로 표시한다.
- 네이티브(비 MSYS) 프로세스의 작업 폴더: `/proc/<pid>/cwd` 가 없으면 빈 값이다.

## 시험

- 윈도우 실기 시험은 macOS PC 에서 못 한다. 대신 GNU 경로(PATH 앞에 GNU 흉내 `stat`·`date`, `stat -f` 함정 재현)와 Git Bash 경로(`ps -o` 가 없는 ps + 가짜 `/proc` 트리, `COMPAT_FORCE_OS=windows`·`COMPAT_PROC_ROOT`)를 강제로 탄다.
- 새 공용 함수를 추가하면 GNU·Git Bash 경로 시험 1건을 `coordinator/tests/compat-js.test.mjs` 에 함께 둔다.
- node 로 옮긴 스크립트와 공용 헬퍼의 시험은 `node --test` 로 돈다(`.claude/skills/_shared/node/tests/`, 각 스킬의 `tests/`). 동봉 jq 의 PATH 처리는 `bash .claude/skills/_shared/tests/jq-prelude.sh` 가 확인한다.
- 윈도우 실기에서만 확인되는 항목은 macOS 에서 흉내 낼 수 없다. 변경 뒤 실제 윈도우에서 `node --test tests/`(coordinator 스킬 폴더 기준)를 돌려 보는 일은 다음 주 실기에서 한다. 실기 확인이 남은 항목 목록은 `docs/superpowers/specs/2026-10-07-skills-windows-compat.md` §8 에 있다(실기 확인은 윈도우 사용자 몫).
