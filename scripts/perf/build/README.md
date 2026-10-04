# 빌드·스크립트 레인 성능 측정 하네스 (P1~P3)

## 용도
빌드·스크립트 레인(1b) 리팩토링 중 S3(be-run 선빌드)와 S4(종료 때 전역 `gradlew --stop` 제거)의 전후 성능을 같은 조건으로 번갈아 재는 스크립트 모음이다.
절차·판정·수치 정본은 [docs/refactor-2026-10/perf-build.md](../../../docs/refactor-2026-10/perf-build.md) 다. 2026-10-04 본 측정 기록(수치, 사고 두 건, 해석 주의)은 그 문서에 있고 이 폴더에는 결과를 두지 않는다.

| 항목 | 무엇을 재나 | 스크립트 |
|---|---|---|
| P1 | `be-run.sh --all` 시작부터 백엔드 7개 포트가 모두 LISTEN 될 때까지 초(콜드·웜 따로, A·B 교대, 종료에 걸린 초도 함께 기록) | `p1_boot.sh` |
| P2 | 콜드 기동 로그에서 공유 includeBuild(cactus-core·mcm-core·maru-mdm-engine)의 compileJava 실행 횟수(결정적, P1 콜드 로그 재사용, 실행 없음) | `p2_count.sh` |
| P3 | be-run 종료가 다른 워크트리에서 돌던 gradle 빌드에 주는 영향: 희생 빌드 실패 여부·`Gradle build daemon has been stopped` 메시지 수·데몬 수 변화(결정적, A·B 각 1회) | `p3_stop.sh` |

보조: `run_all.sh`(P1 콜드·웜 → P2 → P3 일괄과 요약), `summarize.sh`(CSV 를 모드×지표×대상 중앙값으로 요약), `lib.sh`(공통 설정·워크트리·콜드 정리·기동 측정 부품).
측정용 Java 클래스는 없다. 이 하네스는 `be-run.sh` 를 있는 그대로 부르고 로그와 포트만 본다.

## 준비물
- macOS(`lsof`·`pmset`·`sysctl`·`uptime` 사용), bash 3.2 이상, perl, git, JDK 21. 도커 없음.
- **서버 창이 있어야 한다.** 측정 대상 포트(8092 8093 8094 8095 8096 8100 8191)를 메인 서버가 쓰고 있으면 스크립트가 포트 점유로 거부한다(be-run 은 점유 프로세스를 죽이므로 막아 둔 것이다). 다른 `be-run.sh` 가 살아 있어도 거부한다. 메인 서버를 직접 끄지 말고 조정 세션에 서버 창을 요청한다.
- 측정 전 PC 가 조용해야 한다(다른 레인의 빌드·서버·시험 없음, 전원 연결). 이 PC(MacBook Air M5)는 같은 설정에서도 2배 흔들리므로 3회 이상 재고 회차마다 load 를 본다. 스크립트는 회차 전에 1분 load 가 `LOAD_MAX` 이하가 되기를 기다린다.
- 기준 태그 `refactor-2026-10-base` 가 저장소에 있을 것. 변경 쪽 코드는 측정 전에 커밋을 끝낸다(`B_REF` 기본은 저장소 현재 HEAD 라서 커밋하지 않은 변경은 측정되지 않는다).
- gradle 의존성이 `~/.gradle` 에 이미 받아져 있을 것(측정 전용 Gradle 홈이 그 캐시를 읽기 공유한다).
- 측정 워크트리 `perf-build-a`·`perf-build-b` 가 다른 커밋으로 남아 있지 않을 것(요청 커밋과 HEAD 가 같으면 재사용한다).

## 환경 변수
스크립트는 저장소 어디서든 `scripts/perf/build/<스크립트>` 로 부른다. PC 마다 다른 값은 모두 환경 변수다.

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `JAVA_HOME` | 비어 있으면 `/usr/libexec/java_home -v 21` 과 Homebrew `openjdk@21` 을 시도 | gradle·be-run 용 JDK. **major 가 21 인지 `java -version` 으로 확인하고 아니면 안내하고 종료한다**(`java_home -v 21` 은 21 이상을 돌려줄 수 있어 결과도 다시 확인한다) |
| `DFLOW_HEAVY_DIR` | 호출 환경 값 그대로(없으면 기본 동작) | PC 전역 heavy 슬롯 폴더. 레인 전용 칸을 쓰려면 호출 환경에서 지정한다. 스크립트는 정하지 않는다 |
| `DFLOW_HEAVY_SLOTS` | 호출 환경 값 그대로(없으면 기본 동작) | heavy 슬롯 수. 위와 같다 |
| `DMES_TEST_SLOTS` | `0` | 시험 동시 슬롯. 0 은 시험 줄 세우기를 끈다 |
| `REPO_DIR` | 스크립트 위치에서 `git rev-parse --show-toplevel` | 저장소 루트 |
| `PERF_WT_ROOT` | `$REPO_DIR/.claude/worktrees` | 측정용 detached 워크트리 위치. 이름은 `perf-build-a`·`perf-build-b`. 연결 워크트리에서 부르면 `REPO_DIR` 가 그 워크트리라서 그 안에 만들어지므로, 주 체크아웃 옆에 두려면 이 값을 지정한다 |
| `PERF_RESULTS` | `${TMPDIR:-/tmp}/dmes-perf/build` | 결과 폴더(저장소 밖, 절대 경로만. 상대 경로는 거부한다. 스크립트가 자기 폴더로 cd 한 뒤 읽기 때문). CSV·로그·`meta.txt` 가 쌓인다 |
| `PERF_GRADLE_HOME` | `${TMPDIR:-/tmp}/dmes-perf/build-gradle-home` | 측정 전용 Gradle 사용자 홈. P1 은 `<값>-A`·`<값>-B`, P3 는 `<값>` 을 쓴다. `global` 이면 분리하지 않는데 그러면 P3 는 실행을 거부한다(전역 `--stop` 이 다른 레인을 죽인다) |
| `A_REF` | `refactor-2026-10-base` | 기준(A) 커밋 |
| `B_REF` | 저장소 현재 `HEAD`(`run_all.sh <커밋>` 인자로도 줄 수 있다) | 변경(B) 커밋. 이후 HEAD 가 움직여도 같은 커밋으로 재려면 해시로 고정한다 |
| `GIT` | `/usr/bin/git`(없으면 PATH 의 git) | git 실행 파일 |
| `BE_PORTS` | `8092 8093 8094 8095 8096 8100 8191` | 점유 확인·LISTEN 대기 대상 포트 |
| `BE_ARGS` | `--all` | P1 이 be-run 에 넘길 모듈 인자 |
| `LOAD_MAX` · `LOAD_WAIT` | `3.0` · `600` | 회차 전 1분 load 상한과 최대 대기 초. 넘기면 경고하고 진행하며 load 는 CSV 에 남는다 |
| `BOOT_TIMEOUT` | `600` | P1 기동 대기 상한(벽시계 초) |
| `POLL` | `1` | P1 포트 확인 간격(초) |
| `P2_BUILDS` | `cactus-core mcm-core maru-mdm-engine` | P2 가 세는 공유 includeBuild 이름 |
| `P3_MODS` | `--analog` | P3 에서 띄웠다 내릴 be-run 모듈 인자 |
| `P3_PORT` | `8191` | P3 에서 LISTEN 을 기다릴 포트(P3_MODS 의 포트와 맞춘다) |
| `P3_VICTIM_CMD` | `cd src/backend/mdm && ../gradlew :lib:test :api:test --rerun-tasks --max-workers=2 --console=plain` | 희생 빌드(반대편 워크트리 루트에서 실행). **25초 넘게 걸려야 유효하다**(`maru-mdm-engine test`·`mdm :lib:test` 는 25초 안에 끝나 무효였다) |
| `P3_WARMUP` · `P3_VICTIM_TIMEOUT` | `25` · `1800` | 희생 빌드가 안정될 때까지 기다리는 초, 희생 빌드 대기 상한 초 |

`PERF_RESULTS`·`PERF_GRADLE_HOME` 은 측정마다 새 값을 쓰는 편이 안전하다(CSV 는 이어 쓴다).

## 사용법
저장소 루트에서:
```
S=scripts/perf/build
$S/p1_boot.sh both 3     # (1) 콜드 3회, 웜 예열 뒤 3회. A·B 번갈아
$S/p2_count.sh           # (2) (1) 의 콜드 로그에서 compileJava 횟수 계수
$S/p3_stop.sh            # (3) 희생 빌드를 돌려 두고 A·B 각각 be-run 기동·종료
$S/summarize.sh "${PERF_RESULTS:-${TMPDIR:-/tmp}/dmes-perf/build}/p1.csv"
```
일괄은 `$S/run_all.sh [B 커밋]` 이다((1)~(3) 과 요약, 단계 시각·load 는 `$PERF_RESULTS/run_all.log` 에 남는다).
2026-10-04 본 측정과 같은 조건으로 재려면 B 를 고정한다(`<…>` 는 자리표시).
```
export JAVA_HOME=<JDK 21 경로>
export PERF_RESULTS=<절대 경로의 새 결과 폴더>
export DFLOW_HEAVY_DIR=<레인 전용 heavy 폴더> DFLOW_HEAVY_SLOTS=1   # 본 측정은 레인 전용 heavy 칸 한 개로 돌았다
$S/run_all.sh 114f909e
```
- `p1_boot.sh <cold|warm|both> [ROUNDS=3]`: 콜드는 매 회차 앞에 측정 워크트리의 git 무시 대상 `build/`·`.gradle/`(깊이 4 이하)를 지우고 빌드 캐시를 끄며(`-Dorg.gradle.caching=false`) 단발 데몬(`-Dorg.gradle.daemon=false`)으로 돈다. 웜은 시간을 재지 않는 예열 1회 뒤 기존 산출물·데몬 설정 그대로 잰다.
- `p2_count.sh [로그 접두]`: 기본 접두는 `$PERF_RESULTS/p1_cold`. 콜드 로그가 없으면 종료한다.
- `p3_stop.sh`: A 먼저 B 나중. 같은 Gradle 홈에서 반대편 워크트리의 희생 빌드가 돌고 있는 중에 대상의 be-run 을 띄웠다 TERM 으로 내리고, 희생 빌드의 성공 여부와 데몬 수를 기록한다.
- 각 스크립트는 측정 워크트리(`git worktree add --detach … <커밋>`)를 스스로 만들고 끝에(trap) `git worktree remove`(`--force` 없음)로 지운다. 이미 있으면 HEAD 가 요청 커밋과 같을 때만 재사용하고 다르면 종료한다.

## 기준 커밋·변경 커밋
- 기준: `refactor-2026-10-base`(b557ccbd). 기본 ref 는 `A_REF` 이고, 태그가 b557ccbd 가 아니면 경고한다.
- 변경: `B_REF`(기본 저장소 현재 `HEAD`, `run_all.sh <커밋>` 인자로도 줄 수 있다). 2026-10-04 본 측정은 dev 114f909e(빌드 레인 2차 머지)였다. 재현할 때는 해시로 고정한다.
- 실제로 쓰인 A·B 커밋의 전체 해시는 `$PERF_RESULTS/meta.txt` 에 남는다.
- 본 측정에 쓴 원본 스크립트와 달라진 기본값은 둘이다. 원본은 `B_REF` 기본이 114f909e 였고 저장소 판은 `HEAD` 다. 원본의 `P3_VICTIM_CMD` 기본은 `maru-mdm-engine test` 였는데 25초 안에 끝나 무효였으므로, 저장소 판은 세 번째(유효) 시도에서 환경 변수로 준 `mdm :lib:test :api:test --rerun-tasks` 를 기본으로 삼았다.

## 판정 규칙(스크립트에 들어 있는 것)
- P1 rc: `0` 성공, `3` 포트·be-run 점유, `4` 종료 뒤 포트 잔존, `5` be-run 이 포트가 열리기 전에 종료, `7` 모듈 하나의 bootRun 이 먼저 끝남(로그의 `프로세스가 종료됐습니다`를 감지해 기다리지 않고 바로 끝낸다), `124` 시간 초과(벽시계 `BOOT_TIMEOUT`).
- rc 가 0 이 아닌 행은 `summarize.sh` 의 중앙값에서 빠지고 `all` 개수에만 센다. 기준 콜드가 전부 실패하면 중앙값은 `-` 로 나온다.
- P2 는 `from_cache_lines_all_tasks` 가 0 보다 크면 빌드 캐시가 꺼지지 않은 것이라 콜드 조건이 무효다. 기준 쪽이 실패(rc 7)한 회차의 횟수는 멈출 때까지 끝난 태스크만 센 하한이다.
- P3 의 희생 빌드가 `P3_WARMUP` 초 안에 끝나면 `victim_valid` 0 행(rc 6)을 남기고 종료한다. `P3_VICTIM_CMD` 를 더 긴 시험으로 바꿔 다시 잰다.
- 측정 환경은 `$PERF_RESULTS/meta.txt` 에 남는다: A·B 커밋 전체 해시, 호스트, OS 버전, 전원 상태, `lowpowermode`(0 이어야 한다), 일시. 회차별 1분 load 는 CSV 의 `load1` 열이다.

## 결과 형식
- `$PERF_RESULTS/p1.csv`(P1), `p2.csv`(P2), `p3.csv`(P3): 열은 `round,time,target,mode,metric,value,rc,load1`.
- `$PERF_RESULTS/p1_<모드>_<A|B>_r<회차>.log`(회차별 be-run 로그), `p1_warmup_<A|B>.log`, `p3_<A|B>_victim.log`·`p3_<A|B>_be.log`, `meta.txt`, `run_all.log`.
- 결과 폴더는 저장소 밖이라 커밋 대상이 아니다. 수치는 `docs/refactor-2026-10/perf-build.md` 에 옮겨 적는다.

## 알려진 문제·주의
- 메인 서버가 떠 있는 동안에는 실행하지 않는다(점유 확인이 막지만 서버 창 없이 시도하지 않는다). P3 의 기준(A)은 be-run 종료에서 전역 `gradlew --stop` 을 부르므로 측정 전용 Gradle 홈 안에서만 돌려야 한다. `PERF_GRADLE_HOME=global` 은 쓰지 않는다.
- 같은 워크트리를 쓰는 P1·P3 를 동시에 돌리지 않는다. `run_all.sh` 는 한 번에 하나씩 차례로 돈다.
- 2026-10-04 측정에서 기준 콜드는 `be-run --all` 이 공유 includeBuild 를 동시에 컴파일하다 실패했다. 스크립트가 rc 7 로 감지하면 그 회차를 바로 끝낸다. 기준 콜드가 0/3 이어도 스크립트 오류가 아니라 관측 결과일 수 있으니 회차 로그(`Unable to delete directory`)를 확인한다.
- 웜 회차는 데몬이 유지되지 않는다. 기준은 종료 때 `gradlew --stop` 을 부르고 변경도 8개 호출 중 6개가 새 데몬을 띄운다(2026-10-04 로그 확인). 웜 결과를 해석할 때 perf-build.md 의 해석 주의를 함께 읽는다.
- `be_boot_once` 가 be-run 에 `GRADLE_OPTS`(워커 2, 콜드는 캐시·데몬 끔)로 gradle 옵션을 넘기는 것은 be-run 이 gradle 추가 인자를 받지 않기 때문이다.
- 결과 폴더·Gradle 홈·측정 워크트리는 사람이 확인하고 정리한다(스크립트는 측정 워크트리만 지운다).
