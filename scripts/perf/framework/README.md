# 프레임워크 레인(a8) 성능 측정 하네스 (P1~P3)

## 용도
프레임워크 레인 리팩토링(S1~S3, S11)의 전후 성능을 같은 조건으로 번갈아 재는 스크립트 모음이다.
절차·판정·수치 정본은 [docs/refactor-2026-10/perf-framework.md](../../../docs/refactor-2026-10/perf-framework.md) 다.

| 항목 | 무엇을 재나 | 스크립트 |
|---|---|---|
| P1 | OASIS 서비스 캐시 적중 처리량(Mops/s, 스레드 1·4·8) | `p1_cache.sh` |
| P2 | analog 검색 동시 요청 지연·스레드 수, `/tree` 503, 유휴·처리 중 CPU | `p2_build.sh`, `p2_run.sh`, `p2_cleanup.sh` |
| P3 | OASIS 서비스 호출당 methodinvoker 로그 줄 수(결정적, 1회) | `p3_logs.sh` |

보조: `run_all.sh`(일괄), `summarize.py`(요약), `filter_load.py`(load 상한 초과 회차 제외), `p2_gen_logs.py`·`p2_load.py`·`p2_cpu.py`·`p2_common.py`(P2 부품), `lib.sh`(공통 설정).
측정용 Java 클래스는 하네스에 없다. P1 의 `CacheHitThroughputManualTest`·`FakeServices` 는 저장소 cactus-core 시험 소스에 이미 있다.

## 준비물
- macOS(`lockf`·`uptime`·`ps -M` 사용), bash, python3, curl, unzip, lsof, git, JDK 21. 도커 없음(mdm 시험은 SQLite).
- 측정 전 PC 가 조용해야 한다(다른 레인·서버·빌드 없음, 전원 연결). 이 PC 는 같은 설정에서도 2배 흔들리므로 단독으로 3회 이상 잰다.
- `git worktree list` 에 `perf-framework-*` 가 남아 있지 않을 것. 기준 태그 `refactor-2026-10-base` 가 있을 것.
- 변경 쪽 코드는 측정 전에 커밋을 끝낸다(`CHANGE_REF` 기본 `HEAD` 는 저장소 현재 HEAD).

## 환경 변수
스크립트는 저장소 어디서든 `scripts/perf/framework/<스크립트>` 로 부른다. PC 마다 다른 값은 모두 환경 변수다.

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `REPO_DIR` | 스크립트 위치에서 `git rev-parse --show-toplevel` | 저장소 루트 |
| `JAVA_HOME` | (비어 있으면 `/usr/libexec/java_home -v 21`·Homebrew `openjdk@21` 을 시도) | gradle·analog 기동용 JDK. **major 버전이 21 인지 `java -version` 으로 확인**하고 아니면 안내하고 종료한다(`java_home -v 21` 은 21 이상을 돌려줄 수 있어 결과도 다시 확인한다) |
| `PERF_RESULTS_DIR` | `${TMPDIR:-/tmp}/dmes-perf/framework` | 결과 폴더(저장소 밖, 절대 경로만. 상대 경로는 거부하고 종료한다. run_all.sh 가 스크립트 폴더로 cd 한 뒤 lib.sh 를 읽기 때문). CSV·로그·jar·합성 로그가 여기에 쌓인다 |
| `PERF_WT_ROOT` | `$REPO_DIR/.claude/worktrees` | 측정용 detached 워크트리 위치. 이름은 `perf-framework-base`·`-change`·`-<라벨>` |
| `GRADLE_LOCK` | 빈 값 | 지정하면 `lockf -k` 로 gradle 을 이 잠금 파일 아래 직렬화. 비면 잠금 없이 |
| `HEAVY_CMD` | 빈 값 | gradle 앞에 붙일 줄 세우기 명령. 예 `HEAVY_CMD=".claude/skills/dflow-dev/scripts/heavy.mjs"`(상대 경로는 `REPO_DIR` 기준). 다른 하네스에도 같은 이름이 있지만 뜻이 다르다(frontend 는 상태 기록용) — 셸에 export 해 두고 여러 하네스를 돌리지 않는다 |
| `BASE_REF` | `refactor-2026-10-base` | 기준(A) 커밋 |
| `CHANGE_REF` | `HEAD` | 변경(P1·P3 의 B) 커밋 |
| `TARGETS` | `A:$BASE_REF B:bb8ee036 C:$CHANGE_REF` | P2 대상 `라벨:ref` 목록(왼쪽부터 번갈아 기동). 첫 라벨이 요약의 기준. 모두 detached 워크트리 |
| `ANALOG_PERF_PORT` | `18191` | P2 analog 측정 서버 포트(메인 서버 8191 과 겹치지 않게) |
| `NS` | `1 4 8 16` | P2 동시 요청 수 목록 |
| `ROUND_START` | `1` | P2 회차 번호 시작값(중단 뒤 이어서 잴 때) |
| `LOAD_WAIT` | 빈 값 | P2 CPU 구간 전에 1분 load 가 이 값 아래로 내려갈 때까지 최대 180초 대기 |
| `DRY` | 빈 값 | `1` 이면 동작 확인용(ROUNDS=1, 작은 로그, 짧은 CPU 구간). 결과는 결과 폴더 아래 `dryrun/` 에만 쓴다 |
| `GIT` | `git` | git 실행 파일 |

잠금(`GRADLE_LOCK`)·줄 세우기(`HEAVY_CMD`)는 선택이고 모든 gradle 은 늘 `--max-workers=2` 로 돈다.
`run_all.sh` 전체를 `heavy.mjs --exclusive` 로 감쌀 때는 `HEAVY_CMD` 를 비워 둔다(독점 실행 안의 `heavy.mjs` 는 같은 슬롯을 다시 쓰고 그냥 통과하므로 필요 없다. 안에서 `--exclusive` 를 다시 부르면 HEAVY_EXCL_NESTED 로 거부된다).

## 사용법(명령 순서)
저장소 루트에서:
```
S=scripts/perf/framework
$S/p3_logs.sh            # (1) 결정적, 1회. A·B 각 mdm 시험 1회
$S/p1_cache.sh 3         # (2) A·B 번갈아 3회
$S/p2_build.sh           # (3) analog jar 3개(A 기준, B=1차 머지 dev bb8ee036, C=HEAD) 빌드
$S/p2_run.sh 3           # (4) A B C 번갈아 3라운드
$S/p2_cleanup.sh         # (5) 남은 측정 워크트리 제거
for f in "${PERF_RESULTS_DIR:-${TMPDIR:-/tmp}/dmes-perf/framework}"/p*.csv; do python3 $S/summarize.py "$f" --base A; done
```
일괄은 `$S/run_all.sh`(위 (1)~(5) 와 요약). 공용 칸을 독점하려면 `node .claude/skills/dflow-dev/scripts/heavy.mjs --detach --exclusive $S/run_all.sh` 로 띄우고 출력된 id 로 `heavy.mjs wait <id>` 한다. wait 는 한 번에 최대 240초만 기다리므로 HEAVY_JOB_RUNNING(exit 76)인 동안 같은 wait 를 다시 부른다(HEAVY_JOB_BUSY 면 다시 --detach)(10분이 넘는 명령은 --detach 로 돌린다).
각 스크립트는 기준·변경 측정 워크트리(`git worktree add --detach … <ref>`)를 스스로 만들고 끝에(trap) `git worktree remove`(`--force` 없음)로 지운다. 이미 있으면 HEAD 가 요청 ref 와 같을 때만 재사용하고 다르면 종료한다(이전 실행의 잔여물은 `p2_cleanup.sh` 로 지운다). 쓴 커밋은 결과 폴더의 `worktree_commits.txt` 에 남는다. trap 은 **이번 실행이 새로 만든** 워크트리만 지운다(재사용한 것·거부한 것은 남긴다). 그래도 같은 워크트리를 쓰는 스크립트(P1·P3)를 동시에 돌리지 않는다.
메인 체크아웃과 실행 중 서버는 건드리지 않는다.

## 기준 커밋·변경 커밋(기본 ref)
- 기준: `refactor-2026-10-base`(b557ccbd).
- 변경: P1·P3 는 `CHANGE_REF`(기본 `HEAD`). P2 는 B = `bb8ee036`(1차 dev 머지), C = `HEAD`(2차 포함).
  1차 머지 dev 가 HEAD 와 같으면 B 와 C 가 같은 코드니 `TARGETS="A:refactor-2026-10-base C:HEAD"` 로 B 를 빼도 된다.

## P1 캐시 적중 처리량 — `p1_cache.sh [ROUNDS]`
- 변경(B): 변경 워크트리 `src/backend/cactus-core` 에서 `CACTUS_CACHE_BENCH=1 ./gradlew :test --tests '*CacheHitThroughputManualTest' --rerun -i`.
- 기준(A): 기준 워크트리에는 하네스가 없다. 같은 폴더(`src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/oasis/provider/`)에
  `CacheHitThroughputManualTest.java`, `FakeServices.java` **두 파일만** 변경 워크트리에서 복사한다(측정용 임시, 커밋 금지; 변경 쪽에 없으면 `REPO_DIR` 의 것).
  바꿀 줄은 없다 — 기준의 `CactusCachingServiceProvider` 에 `(ServiceProvider, CacheService)` 와 `(ServiceProvider, int)` 생성자가 둘 다 있어 그대로 컴파일되고,
  `int` 편의 생성자는 기준에서 `new SizeBaseCacheService<>(cacheSize)` 다. 따라서 기준에서는 하네스의 `old(SizeBase)` 열과 `new(Concurrent)` 열이 **같은 구현**이며
  A 값은 `old(SizeBase)` 열을 쓴다(new 열은 무시). 변경 쪽 B 는 `new(Concurrent)` 열, 보조로 B 의 old 열을 `B_old` 로 함께 남긴다(같은 JVM 안 비교).
  스크립트 종료 시 복사본을 지운 뒤 워크트리를 제거한다.
- 하네스는 스레드 1·4·8 별로 5회 반복의 min~max 를 낸다. 지표 `t{스레드}_min/_max/_mid`(Mops/s, mid=평균) — 판정은 `_mid` 중앙값(3회 이상).
- 회차마다 gradle 한 번(콜드 JVM) → A,B 번갈아. 한 회차 소요 약 1~2분(컴파일 포함, 첫 회는 기준 워크트리 컴파일이 더 걸림).

## P2 analog 동시 검색·CPU — `p2_build.sh`, `p2_run.sh [ROUNDS]`
- 합성 로그(`p2_gen_logs.py`, `p2_run.sh` 가 자동 생성, 결과 폴더의 `synthetic-logs/`): fixture 가 없어 직접 만든다.
  `mpn/dmes-mpn.log` 5MB(작은 파일: 단일 스레드 검색 경로), `mpp/dmes-mpp.log` 200MB(큰 파일: `minimum_mega_bytes_for_multi_thread=80` 초과 → 멀티스레드 경로).
  analog lex_pattern 에 맞는 줄, 시각 2026-10-01 단조 증가, 시드 고정, 200줄당 1줄이 keyword `PERFKEY`(서비스 종료 줄이라 /tree 가 트리를 만든다).
- 서버: `java -Xmx1g -jar <결과 폴더>/jars/<라벨>.jar`, 환경변수 `ANALOG_PORT=<ANALOG_PERF_PORT> ANALOG_LOG_BASE_DIR=<root>/{MODULE} ANALOG_MODULES=mpn,mpp`, 로그 `p2_server_<라벨>_r<회차>.log`. 대상마다 기동·종료(포트 순차 재사용).
  빌드는 `:api:bootJar` 를 대상 워크트리의 `src/backend/analog` 에서(자체 gradlew). jar 는 `jars/<라벨>.jar` 로 복사해 이후 워크트리 변경과 분리.
- 대상 지정: `TARGETS`(위 표). 모든 대상(HEAD 포함)은 detached 워크트리에서 빌드한다. ref 가 `BASE_REF`·`CHANGE_REF` 와 같으면 해당 워크트리를 공유한다.
- 동시 부하(`p2_load.py`): N=1,4,8,16 을 모듈(작은 mpn·큰 mpp) × 엔드포인트(`/log/range/time`, `/log/range/time/tree`)마다. 워밍업 1회 버림, 배리어로 동시 발사.
  지표 `{small|large}_{range|tree}_n{N}_` + `lat_median_ms`, `lat_p95_ms`, `max_threads_ps`(ps -M, 50ms 폴링 — 주 지표), `max_threads_jcmd`(jcmd Thread.print 의 `"` 시작 줄 수, 1초 간격 — 보조), `http503`, `http_other_err`.
  503 건수는 변경 쪽 /tree 만 의미 있다(기준은 상한 없음).
- 응답 동일성: 워밍업 응답 해시를 `p2_bodies.txt` 에 남긴다(`sha=`). 같은 모듈·엔드포인트의 sha 가 A·B·C 에서 같아야 한다(C 의 /tree 는 아래 알려진 문제 참조). `distinct_body_sha_among_200=1` 이면 동시 응답끼리도 같다.
- CPU(`p2_cpu.py`): 유휴 30초와 큰 로그 `/tree` 동시 1 요청 연속 40초 동안의 `ps -o time=` 누적 CPU 증가분 ÷ 경과 시간(코어 1개=100%). 지표 `idle_cpu_pct`, `tree_cpu_pct`, `tree_requests`, `tree_lat_median_ms`, `tree_cpu_ms_per_request`.
  바쁜 대기(sleep 폴링) 제거 효과는 `tree_cpu_pct`·`tree_cpu_ms_per_request` 가 A→B→C 로 내려가는지로 본다(요청 수가 다르므로 요청당 CPU 가 공정한 비교).
- 소형·대형 파일 결과는 지표 이름의 `small_`/`large_` 로 나뉘어 따로 적는다.

## P3 호출당 로그 줄 수 — `p3_logs.sh`
- A·B 각각 `src/backend/mdm` 에서 `../gradlew :api:test --tests '*DmeOasisHttpTest' --rerun -i`(max-workers=2) → 결과 XML
  `api/build/test-results/test/TEST-com.dongkuk.dmes.mdm.dme.DmeOasisHttpTest.xml` 의 `<system-out>` 만 `p3_<A|B>_system-out.txt` 로 뽑아
  Spring 형식 줄(`2026-…T… LEVEL pid --- [app] [thread] logger : msg`)에서 로거(축약형)·레벨별 줄 수를 센다.
- 지표 `logger_<로거>_lines`(전 로거), `methodinvoker_total`, `methodinvoker_<LEVEL>`.
  로거 이름 판정: 패키지 `oasis.methodinvoker` 가 `c.d.o.m.` 으로 축약돼 이름에 methodinvoker 가 안 남는다. 실제 로거는 `StrictMethodResolver`(54)·`TypeMatchableMethodArgumentBinder`(162) 라 스크립트는 이 이름들로 센다.
  1차 기록 54+162→0 의 구간 1·2 는 테스트 안 두 호출 구간이라 XML 에서 구분되지 않는다 — 합계 216→0 으로 대조하고, 구간별이 필요하면 `p3_<T>_system-out.txt` 를 수동으로 나눈다.
- 로거 이름이 축약형이라 methodinvoker 가 한 글자로 줄면 못 센다(XML 형식 확인함: `c.d.oasis.service.…`). A 가 216 이 아니면 로거 이름 판정을 의심한다.
- 기준 워크트리에서 mdm 이 `includeBuild('../cactus-core')` 로 기준 시점의 cactus-core·oasis 를 쓰므로 변경의 효과가 분리된다.

## 결과 형식
결과 폴더(`PERF_RESULTS_DIR`, DRY 면 그 아래 `dryrun/`)에 쌓인다. 저장소에는 결과를 넣지 않는다.
- CSV 컬럼: `round,target,metric,value,load1`(측정 시작 시점 1분 load). 파일: `p1_cache.csv`, `p2_load.csv`, `p2_cpu.csv`, `p3_logs.csv`.
- 그 밖: `p1_<T>_r<n>.log`, `p2_build_<라벨>.log`, `p2_server_<라벨>_r<n>.log`, `p2_bodies.txt`, `p2_targets.txt`(라벨,ref,커밋), `p3_<T>.log`, `p3_<T>_system-out.txt`, `worktree_commits.txt`(측정 워크트리별 ref·커밋), `run_all.log`(run_all.sh 단계별 시각·load), `jars/`, `synthetic-logs/`.
- 요약: `summarize.py <csv> [--single] [--base 라벨]` — 지표×대상 중앙값, 회차 수(n), load1 평균(L), 기준 대비 증감 %. `--single` 은 1회짜리(P3). `--base` 로 기준 라벨을 지정(기본: 가장 먼저 나오는 라벨).
- load 필터: `filter_load.py <in.csv> <out.csv> [상한=5]` — (회차,대상) 안에 load1 이 상한을 넘는 줄이 하나라도 있으면 그 회차·대상 전체를 버린다.

## 측정 요령 (2026-10-04 측정에서 배운 것)
- 조정 세션 규칙: 1분 load 가 **5 를 넘은 회차는 버리고 다시 잰다**. 재기 전에 `filter_load.py` 로 걸러 남은 회차를 확인하고, 모자란 회차는 `ROUND_START=<다음 번호>` 로 이어서 잰다. 버린 회차는 결과 문서에 적는다.
- A(기준)는 큰 로그 `/tree` N=16 을 처리한 뒤 스스로 load 를 끌어올린다(바쁜 대기). 그대로 CPU 구간에 들어가면 load 상한을 넘기므로 **`LOAD_WAIT=5`** 로 CPU 구간 전에 load 가 내려가길 기다린다.
- 공용 무거운 작업 칸을 독점해서 잰다: `node .claude/skills/dflow-dev/scripts/heavy.mjs --detach --exclusive scripts/perf/framework/run_all.sh` 뒤 `heavy.mjs wait <id>` 를 HEAVY_JOB_RUNNING(exit 76)인 동안 되풀이한다(HEAVY_JOB_BUSY 면 다시 --detach, 이때 `HEAVY_CMD` 는 비움).
- 결론은 3회 이상 중앙값으로만 낸다. 같은 설정에서도 이 PC 는 2배 흔들린다.
- 이 하네스의 2026-10-04 결과 수치와 판정은 `docs/refactor-2026-10/perf-framework.md` 에 있다. 원자료 CSV 는 저장소에 넣지 않았다.

## 예상 소요 (이 PC, 단독 가정)
| 단계 | 시간 |
|---|---|
| P3 | 약 10~20분(기준 워크트리 mdm·cactus·mcm 콜드 컴파일 포함) |
| P1 | 첫 회 5~10분(기준 컴파일) + 이후 회차 A·B 각 1~2분 → 약 15~20분 |
| P2 빌드 | 대상 3개 콜드 빌드 약 10~20분 |
| P2 측정 | 서버 1회 기동당 약 4~6분(부하 4 N × 2 엔드포인트 × 2 모듈 + CPU 70초 + 쿨다운) × 3대상 × 3라운드 ≈ 35~55분 |
| 합계 | 약 1.5~2 시간 (편차가 커서 재실행이 생기면 더) |

gradle 빌드 캐시가 적중하면(dry-run 실측) 합계 약 35~45분(P3 약 2분, P1 약 3~4분, P2 빌드 약 2분, P2 측정 약 25~35분).
`NS="1 4 8"` 로 N 을 줄이거나 ROUNDS 를 줄이면 짧아지지만 결론은 3회 이상 중앙값으로만 낸다.

## 알려진 문제·주의
- **load 기록**: 모든 CSV 줄에 측정 시작 시점의 load1 이 남는다. 5 를 넘는 회차는 위 '측정 요령' 대로 버린다.
- **반복 측정**: 한 번 값으로 결론 내지 않는다(3회 이상 중앙값). P3 만 결정적이라 1회.
- **메인 서버를 건드리지 않는다**: analog 측정 서버는 `ANALOG_PERF_PORT`(기본 18191) 에서만 뜨고, 이미 쓰는 중이면 시작하지 않는다. 메인 체크아웃·실행 중 서버·그 DB 는 읽지도 쓰지도 않는다. 도커 없음.
- **A(기준)의 `/log/range/time/tree` 는 jar 실행 시 500**: `LogSearchController.logRangeTimeTree` 가 `classpath:analog-serializer.json` 을 `ResourceUtils.getFile` 로 풀어 nested jar 에서 `FileNotFoundException`. 기준 코드의 결함이며(B·C 는 고쳐져 있음) 스크립트 버그가 아니다.
  대처: `p2_run.sh` 가 모든 대상의 jar 에서 `BOOT-INF/classes/analog-serializer.json` 을 꺼내 `-Danalog-serializer.config_file=file:<경로>` 로 지정한다(대상 간 조건 동일, 파일 내용은 A·B·C 동일 md5). 이 우회가 없으면 A 의 /tree 지표는 전부 500 이라 무의미하다.
- C 의 `/tree` 응답 sha 가 A·B 와 다른 것은 S11 fix(끝 줄 누락) 때문이다 — 의도된 차이(작은 로그 11003→11029 바이트, 큰 로그 909236→909262 바이트, 각 +26). `range` 응답은 A·B·C 동일. B(1차)는 A 와 /tree 동일.
- `DRY=1` 은 결과·jar·합성 로그를 모두 `<결과 폴더>/dryrun/` 아래에 쓴다. 실측 전에 `rm -rf <결과 폴더>/dryrun` 로 치워도 된다.
- 측정 워크트리 생성·제거는 `--force` 없이 깨끗했다. 제거가 실패하면 `git -C <워크트리> status` 로 남은 파일을 확인한다(강제 제거 금지). 다른 레인이 같은 시각 커밋하면 `git worktree list` 의 다른 항목 HEAD 는 바뀔 수 있다(무관).
- gradle 은 빌드 캐시 덕에 dry-run 에서 매우 빨랐다(컴파일 거의 캐시 적중). 캐시가 비면 위 예상 시간(콜드 컴파일)이 다시 맞다.
- P1 의 기준 워크트리에 하네스 두 파일을 복사해 쓴다. 스크립트가 중간에 죽어 복사본이 남으면 워크트리 제거가 실패하니, 해당 두 파일을 지운 뒤 `p2_cleanup.sh` 를 돌린다.

## dry-run 결과 (2026-10-04, 옛 위치 판, DRY=1, load1 3~6)
이 폴더로 옮기기 전 판의 결과다(옮긴 뒤 경로·환경 변수가 바뀌었고 JDK 는 major 21 만 받도록 검사를 더했다. 측정 논리는 같다).

| 단계 | 결과 | 소요 |
|---|---|---|
| p3_logs.sh | 성공. A methodinvoker_total=216, B=0 | 21초(2차 실행; 1차 34초) |
| p1_cache.sh | 성공(1회). A·B·B_old 컬럼·csv 정상, 기준 하네스 복사본·워크트리 제거됨 | 54초 |
| p2_build.sh | 성공(A·B·C jar 3개, 모두 24MB). 측정 워크트리 생성·제거 | 6초(빌드 캐시 적중) |
| p2_run.sh | 성공(NS=1, 5초 CPU 구간). 서버 3회 기동·종료 | 65초 |
| p2_cleanup.sh | 성공, `git worktree list` 에 측정 워크트리 없음 | 0초 |
| summarize.py | 정상(CSV 컬럼 round,target,metric,value,load1) | - |

발견·수정(스크립트만):
1. P3 `methodinvoker_total` 이 A 에서도 0 → 로거 이름 축약 때문. 실제 로거 이름 2개로 세도록 수정(A 216 / B 0).
2. `summarize.py` 열 너비가 좁아 값이 붙어 보임 → 지표열·값열 폭 확대.
3. P2 A 의 /tree 500(위 알려진 문제) → serializer 파일 경로 우회.
4. DRY=1 모드 추가(ROUNDS=1, NS="1", mpn 1MB·mpp 90MB, CPU 5+5초, 쿨다운 생략, 결과 분리).

P2 응답 sha: range 는 A·B·C 동일, tree 는 A=B ≠ C(위 S11 설명). 동시 응답끼리도 동일(distinct=1).
이 폴더의 새 판(환경 변수화·변경 쪽 detached 워크트리)은 bash -n·py_compile 만 확인했고 아직 실행하지 않았다. 처음 쓸 때 `DRY=1` 로 한 번 돌려 본다.
