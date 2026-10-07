# mcm 측정 하네스 (P3 메뉴 카탈로그 캐시 응답 시간)

## 용도
- `docs/refactor-2026-10/perf-mcm.md` 의 **P3 보조 지표**(`SecUserService.getMyMenus` 응답 시간, 메뉴 카탈로그 캐시 S3)를 잰다. P3 의 SELECT 수(결정적 지표)는 이 하네스가 아니라 `MenuCatalogCallersSelectCountTest`(mcm-core) 가 맡는다.
- 서버를 띄우지 않는다. `MyMenusLatencyPerfTest`(측정용 JUnit)가 `AnnotationConfigApplicationContext` + 빈 SQLite 임시 파일 + `DataInitializer` 시드(메뉴 44·OBJ 52·폴더 15·SYSADMIN 매핑 52)로 사용자 admin 의 `getMyMenus` 를 호출 단위 트랜잭션으로 반복해 nanoTime 으로 잰다.
- 조건: 기준은 `nocache` 한 조건, 변경은 `hit`(캐시 적중)·`miss`(매 호출 전 무효화) 두 조건. 기준과 변경을 번갈아(A·B·A·B…) 돌려 시간 흐름에 따른 편차를 상쇄한다.

## 파일
| 파일 | 설명 |
|---|---|
| `perf-mcm-p3.sh` | 실행 스크립트(zsh). prepare·run·cleanup·all |
| `MyMenusLatencyPerfTest.java` | 측정용 JUnit. **저장소 시험 소스에 두지 않는다.** 스크립트가 실행 때 작업용 워크트리의 `src/backend/mcm/api/src/test/java/com/dongkuk/dmes/mcm/perf/` 로 복사하고 끝나면(중단 포함, trap) 지운다 |

## 준비물
- macOS(zsh, `sysctl`, `/usr/libexec/java_home`), JDK 21, git. gradle 은 `--offline` 이라 의존성이 이미 캐시돼 있어야 한다(기준·변경 ref 모두).
- 기준·변경 ref 가 저장소에 존재해야 한다(기본 `refactor-2026-10-base` 와 `dev`).
- 시험 JVM 은 `-XX:TieredStopAtLevel=1` 이라 절대값은 실제 서버보다 비관적이다. 기준과 변경의 상대 비교로만 쓴다.

## 환경 변수
| 이름 | 기본값 | 뜻 |
|---|---|---|
| `PERF_REPO_DIR` | 스크립트 위치에서 `git rev-parse --show-toplevel` | 저장소 경로(워크트리를 만들 기준 저장소) |
| `JAVA_HOME` | (비어 있으면) `/usr/libexec/java_home -v 21`·Homebrew `openjdk@21` 을 시도 | JDK 경로. 설정된 값이든 찾은 값이든 `java -version` 의 major 가 21 이 아니면 안내하고 종료한다(`java_home -v 21` 은 21 이상을 돌려줄 수 있다) |
| `PERF_OUT_DIR` | `${TMPDIR:-/tmp}/dmes-perf/mcm` | 결과·로그·상태 폴더(저장소 밖) |
| `PERF_WT_ROOT` | `$PERF_REPO_DIR/.claude/worktrees` | 작업용 워크트리 위치. 그 아래 `perf-mcm-base`·`perf-mcm-after` 를 만든다 |
| `PERF_BASE_REF` | `refactor-2026-10-base` | 기준 ref(인자로 덮어쓸 수 있음) |
| `PERF_AFTER_REF` | `dev` | 변경 ref(인자로 덮어쓸 수 있음) |
| `PERF_GRADLE_LOCK` | (비면 잠금 없음) | 지정하면 gradle 을 `lockf -k <파일>` 로 감싸 한 번에 하나만 돌린다 |
| `HEAVY_CMD` | (비면 줄 세우기 없음) | 무거운 작업 줄 세우기 명령. 예 `HEAVY_CMD=".claude/skills/dflow-dev/scripts/heavy.sh"` (frontend 하네스의 같은 이름 변수와 뜻이 다르다. 첫 단어가 상대 경로이고 저장소 기준으로 존재하면 절대 경로로 바꿔 쓴다) |

## 사용법
```
scripts/perf/mcm/perf-mcm-p3.sh prepare [기준 ref] [변경 ref]        # 워크트리 2개 + 워밍업 빌드
scripts/perf/mcm/perf-mcm-p3.sh run [회차=3] [warmup=300] [iters=500]  # 회차마다 기준→변경 1회씩
scripts/perf/mcm/perf-mcm-p3.sh cleanup                              # 복사본 확인·삭제, 깨끗하면 worktree remove
scripts/perf/mcm/perf-mcm-p3.sh all [회차=3] [기준] [변경] [--cleanup] [warmup] [iters]
```
- 실제 측정: `scripts/perf/mcm/perf-mcm-p3.sh all 3 --cleanup`
- 시험 가동(dry-run, 값은 쓰지 않는다): `scripts/perf/mcm/perf-mcm-p3.sh all 1 refactor-2026-10-base HEAD --cleanup 20 50`
- 측정 JUnit 이 읽는 입력은 워크트리의 `src/backend/mcm/api/build/perf-mcm-p3/config.properties`(warmup·iters)이며 스크립트가 쓴다.

## 기준 커밋·변경 커밋
- 기준: `refactor-2026-10-base`(b557ccbd). 변경: `dev`(2026-10-04 본 측정은 d529e992, 3번 메뉴 캐시 머지 bfd25e48 포함).
- 기준에는 `com.dongkuk.dmes.mcm.menu.MenuCatalog` 가 없다. 측정 클래스가 이름으로 찾아 있으면 hit·miss 를, 없으면 nocache 를 잰다(생성자 시그니처에 기대지 않는다).

## 결과 형식
- `$PERF_OUT_DIR/perf-mcm-p3-results.tsv` — 조건마다 한 줄. 컬럼: `ts round side commit condition warmup iters median_ms p90_ms mean_ms min_ms max_ms rows menu obj fld rolemap seed_ms load1 gradle_s status`
  - `side` base/after, `condition` nocache/hit/miss, `load1` 각 쪽 gradle 실행 직전 1분 부하, `gradle_s` 그 쪽 gradle 실행 전체 벽시계(초), 실패하면 `condition` 이 `-` 이고 `status` 가 FAIL.
  - 결론은 회차별 `median_ms` 의 중앙값으로 낸다.
- `$PERF_OUT_DIR/perf-mcm-p3-prepare.tsv` — 워밍업 빌드 기록(`ts side commit task gradle_s status`). 입력이 아니라 prepare 가 쌓는 실행 기록이라 저장소에 넣지 않았다. 스크립트가 없으면 만든다.
- `$PERF_OUT_DIR/logs/` — 워크트리 생성·워밍업·회차별 gradle 로그. `$PERF_OUT_DIR/state` — 두 쪽 커밋 기록.

## 알려진 문제·주의
- 개발 PC(MacBook Air M5)는 편차가 크다(같은 설정에서 2배 흔들림). 반드시 반복 측정(3회 이상)하고 회차마다 `load1` 을 확인한다. load 가 높거나 다른 gradle·서버가 돌 때의 값은 버린다. 반복 없이 결론 내지 않는다.
- 이 하네스가 재는 값은 시험 JVM(TieredStopAtLevel=1)의 값이다. 절대값 비교 금지.
- 메인 체크아웃과 실행 중 서버는 건드리지 않는다. 작업용 워크트리(`perf-mcm-base`·`perf-mcm-after`, detached)만 만들고, 제거는 `git worktree remove`(`--force` 없음)다. 워크트리가 더럽거나(예: 중단 후 잔여 변경) 이미 다른 HEAD 로 있으면 스크립트가 멈추니 확인 후 사람이 정리한다.
- 측정 클래스 복사본은 trap 이 지우지만, 강제 종료(kill -9)로 남았으면 `cleanup` 으로 지운다.
- `PERF_OUT_DIR` 의 `state` 와 TSV 는 이어 쓴다. 새 측정은 폴더를 비우거나 `PERF_OUT_DIR` 을 바꾼다.
- 결과 TSV·logs·dry-run 산출물은 저장소에 넣지 않는다. 수치는 `docs/refactor-2026-10/perf-mcm.md` 에 옮겨 적는다.
