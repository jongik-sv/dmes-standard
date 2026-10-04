# MDM 백엔드·엔진 레인 성능 측정 하네스

`docs/refactor-2026-10/perf-mdm-backend.md` 의 P1~P5 측정 절차를 기준(before) 워크트리와 변경(after) 워크트리에서 같은 시험으로 돌리는 도구다. 2026-10-04 본 측정 수치와 판정은 그 문서에 있다(이 폴더에는 결과를 두지 않는다).

| 쪽 | 커밋 | 비고 |
|---|---|---|
| base(기준) | `b557ccbd` = 태그 `refactor-2026-10-base`(주석 태그 — `git rev-parse 'refactor-2026-10-base^{commit}'`) | detached 워크트리 |
| dev(변경) | `923aa9a0` | detached 워크트리 |

측정 시험 소스는 이 저장소의 시험 소스 폴더(`src/backend/**/src/test`)에 두지 않는다. `run-measure.sh` 가 측정할 때만 각 측정 워크트리의 test 폴더로 복사하고 gradle 이 끝나면 지운다. 그래서 평소 빌드·시험 대상에 들어가지 않는다(gradle 설정을 따로 고치지 않았다).

## 1. 구성

```
scripts/perf/mdm-backend/
  run-measure.sh                     실행기(잠금·복사·gradle·수집·정리)
  README.md                          이 문서
  src/mdm-api/com/dongkuk/dmes/mdm/measure/
    MeasureSupport.java              MEASURE 줄 출력·MDM_MEASURE/DRY·시간 요약
    StatProbe.java                   Hibernate Statistics 계수(트랜잭션 안·롤백) + 시간 반복
    SourceDb.java                    P3·P4 데이터: 로컬 MDM DB 사본을 ATTACH 해 원래 ID 로 옮김
    MeasureP1MasterCodeFlushTest.java
    MeasureP2HeaderImpactTest.java
    MeasureP3TermSearchTest.java
    MeasureP4ColumnSearchTest.java
  src/maru-mdm-engine/kr/dongkuk/maru/mdm/engine/rule/
    MeasureP5RuleSetBenchTest.java
  src/extra-base/                    변경 923aa9a0 의 추적 시험 사본 — 기준 워크트리에만 복사(변경 쪽은 추적 파일을 그대로 씀)
    com/dongkuk/dmes/mdm/dmb/layoutConfirm/LayoutHeaderImpactEquivalenceSqliteTest.java   (P2 고정 5시나리오)
    com/dongkuk/dmes/mdm/dma/columnMng/ColumnMngSearchCharacterizationTest.java           (P4 13·33컬럼 검색)
```

`src/extra-base/` 는 변경 쪽 추적 파일과 바이트까지 같아야 한다(고치면 기준 쪽이 다른 시험을 돌게 된다).

측정 시험은 두 워크트리 모두에서 컴파일되도록 공개 서비스 API·리포지토리·기준에도 있는 시험 기반만 쓴다:
`AbstractMdmSharedDbTest`(두 쪽 동일), `LayoutTestSupport`·`DmeTestSupport`·`DmaTestSupport`·`MasterCodeFixtures`·`MasterCodeTestConfig`(두 쪽 동일 — `diff` 로 확인), 엔진 `FlowFixtures`·`SampleRules`·`InMemoryDefinitionLookup`(엔진 모듈은 기준 = 262ca6df^). 변경 쪽 전용 클래스(`MdmStrings`·`MdmJsonLists`·`TermDictionaryLoader`·`ColumnSearchPrefilter`·`TermSearchPrefilter`·`MdmRuleEngine.cachedPlans()` 등)는 쓰지 않는다.
쿼리 수는 Hibernate Statistics 로 센다(기존 `QueryCountProbe` 와 같은 방식, 기준에도 같은 파일이 있다). mdm 설정에 `hibernate.jdbc.batch_size`·`order_inserts` 가 없어(2026-10-04 grep) JDBC 배치가 없으므로 준비한 문 수 ≈ 실행한 문 수다.

## 2. 준비

### 2.1 측정 워크트리

저장소 루트에서 기준·변경 워크트리를 detached 로 만든다(경로는 아무 데나 — 아래는 예).

```
git worktree add --detach .claude/worktrees/mdm-perf-base 'refactor-2026-10-base^{commit}'
git worktree add --detach .claude/worktrees/mdm-perf-dev  923aa9a0
```

- 두 워크트리의 `git status --porcelain` 이 비어 있어야 한다(스크립트가 시작 때와 회차마다 확인한다).
- 첫 실행은 cactus-core·mcm-core·engine·mdm lib/api 와 시험 소스 전체 컴파일이 붙어 수 분 걸린다. 정식 측정 전에 `--dry-run` 으로 한 번 데워 둔다(§4).
- 측정이 끝나면 `git worktree remove <경로>` 로 정리한다.

### 2.2 P3·P4 원본 DB 사본

P3·P4 는 합성 데이터가 아니라 **로컬 MDM SQLite DB 의 사본**을 시험 DB 에 ATTACH 해 용어·도메인·컬럼·시스템 매핑을 원래 ID 로 옮긴다. 변경 쪽 DB 1차 거름(LIKE)의 후보 행 수가 글자 모양(JSON 원문·약어 분포)에 달려 합성 분포로는 재현되지 않기 때문이다. 사본이 없으면 P3·P4 는 시작하지 않는다(합성으로 대신하지 않는다). 실제 DB 파일은 저장소에 넣지 않는다.

- 원본: 로컬 실행 MDM 의 SQLite DB — `application-local.yml` 의 `jdbc:sqlite:../data/mdm.db`, 즉 저장소 본 체크아웃의 `src/backend/mdm/data/mdm.db`(`.gitignore` 대상).
- 사본 만들기(저장소 밖에 둔다):
  ```
  sqlite3 <본 체크아웃>/src/backend/mdm/data/mdm.db ".backup '<저장소 밖 경로>/mdm-copy.db'"
  ```
  `.backup` 은 서버가 떠 있어도 일관된 사본을 만든다. `cp` 는 MDM 서버를 멈춘 뒤에만 쓴다(WAL 중간 상태를 복사할 수 있다).
- 스키마: 시험 DB 와 같은 Flyway 스키마(2026-10-04 기준 V22)의 `TB_MDM_TERM`·`TB_MDM_DOMAIN`·`TB_MDM_COLUMN`·`TB_MDM_COLUMN_SYSTEM` 칸을 이름으로 옮긴다(`SourceDb.java` 의 칸 목록).
- 2026-10-04 본 측정 때 데이터 규모:

  | | 사본 행 수(`COUNT(*)`) | 시험 DB 로 옮긴 수 |
  |---|---|---|
  | 용어 | 8,152(EMBEDDING 4,096바이트 포함) | 8,152 |
  | 도메인 | 164 | 164 |
  | 컬럼 | 7,858 | 7,857 |
  | 시스템 매핑 | 11,168 | 약 11,166 |

  옮긴 수가 적은 것은 P4 저장 시나리오가 새로 만들 '원재료 코일 두께'/`RMTL_COIL_THK` 컬럼 1개와 그 매핑을 빼기 때문이다.
- 로컬 DB 는 계속 바뀌므로 다른 날 만든 사본이면 P3·P4 의 결정적 값(`loads`·`rows`·후보 수 등)도 달라진다. 비교는 같은 사본으로 기준·변경을 함께 돈 값끼리만 한다. 사본의 sha1 은 결과 파일 머리에 남는다.

### 2.3 JDK

JDK 21 이 필요하다. `JAVA_HOME` 을 반드시 준다(없으면 안내 후 종료 2). 다른 레인 gradle 데몬과 섞이지 않게 저장소 기본 JDK 가 아니라 JDK 21 경로를 직접 지정한다.

## 3. 환경변수

PC 마다 다른 값은 모두 환경변수로 받는다. 상대경로를 주면 스크립트가 절대경로로 바꾼다(gradle 은 측정 워크트리 안에서 돌기 때문).

| 변수 | 필수 | 기본값 | 뜻 |
|---|---|---|---|
| `JAVA_HOME` | 항상 | — | JDK 21 홈 |
| `MEASURE_BASE_WT` | `base`·`ab` | — | 기준 워크트리 경로(§2.1) |
| `MEASURE_DEV_WT` | `dev`·`ab` | — | 변경 워크트리 경로(§2.1) |
| `MDM_MEASURE_SOURCE_DB` | P3·P4(`all` 포함) | — | 로컬 MDM DB 사본(§2.2). 측정 시험에도 그대로 넘어간다 |
| `MEASURE_BASE_REV` | | `b557ccbd` | 기준 HEAD 기대값. 다르면 결과 파일에 경고 줄 |
| `MEASURE_DEV_REV` | | `923aa9a0` | 변경 HEAD 기대값 |
| `MEASURE_RESULTS_DIR` | | `${TMPDIR}/mdm-backend-perf` | 결과 폴더. 저장소 밖 기본값이라 `.gitignore` 를 건드리지 않는다. 저장소 안으로 바꾸면 결과를 커밋하지 않도록 주의한다 |
| `MEASURE_LOCK` | | `${TMPDIR}/mdm-backend-perf.lock` | 측정 잠금 디렉터리. 같은 PC 의 다른 측정 실행과 잠금을 나누려면 같은 경로를 준다 |
| `DFLOW_HEAVY_WAIT` | | heavy.sh 기본(90초) | `--exclusive` 독점 대기 상한(heavy.sh 가 읽는다) |

스크립트가 시험에 넣는 값(직접 줄 일 없음): `MDM_MEASURE=1`(없으면 측정 시험이 Assumptions 로 건너뛴다), `MDM_MEASURE_DRY=1`(`--dry-run`). 독점 안쪽 실행 구분용 `MDM_PERF_EXCL_INNER`·`MDM_PERF_LOCK_OWNER` 는 스크립트 내부용이다.

`heavy.sh` 는 스크립트 위치(`${BASH_SOURCE}`)에서 찾은 저장소 루트의 `.claude/skills/dflow-dev/scripts/heavy.sh` 를 쓴다. 없거나 실행할 수 없으면 `--exclusive` 를 거부한다(종료 2). heavy.sh 의 슬롯 폴더는 `~/.dflow/locks/heavy`(`DFLOW_HEAVY_DIR`)라 어느 워크트리의 heavy.sh 로 불러도 같은 PC 전역 세마포어다.

## 4. 사용법

```
run-measure.sh <base|dev|ab> <P1|P2|P3|P4|P5|all> [회차 수(기본 3)] [--dry-run] [--keep-rounds] [--exclusive]
```

예:

```
export JAVA_HOME=<JDK 21 홈>
export MEASURE_BASE_WT=<기준 워크트리> MEASURE_DEV_WT=<변경 워크트리>
export MDM_MEASURE_SOURCE_DB=<저장소 밖>/mdm-copy.db
scripts/perf/mdm-backend/run-measure.sh ab all --dry-run      # 첫 컴파일 데우기·출력 확인
scripts/perf/mdm-backend/run-measure.sh ab P1 3 --exclusive   # 정식 측정(시간 지표)
scripts/perf/mdm-backend/run-measure.sh ab P2                 # 결정적 지표만 — 독점 불필요
```

- `ab`: 기준·변경을 번갈아(기준·변경·기준·변경…) 회차 수만큼 돈다. P 마다 따로 돈다(`all` 이면 P1 의 모든 회차 → P2 … 순서).
- 결정적 지표만 있는 P2·P4 는 회차 수를 1로 강제한다(`--keep-rounds` 로 끈다 — P4 의 응답 시간 참고값을 A·B 교대로 다시 볼 때만).
- `--dry-run`: `MDM_MEASURE_DRY=1` — 규모를 아주 작게(용어·컬럼 50행, P1 N=10, P2 E·H 1·2, P5 100행·N=1, 반복 1·예열 0), 회차 1. 컴파일·실행·출력 수집만 확인한다. 결과는 `<결과 폴더>/dry/`.
- `--exclusive`(정식 측정용): 측정 전체를 PC 전역 세마포어 `heavy.sh` 의 `--exclusive` 한 번 안에서 돈다 — 일반 슬롯 K개(16GB PC 는 2개)를 모두 쥐어 다른 heavy.sh 명령(게이트·빌드·gradle)이 끼어들지 못한다. 스크립트가 측정 잠금을 잡은 뒤 자기 자신을 `heavy.sh --exclusive /bin/bash run-measure.sh <같은 인자>` 로 **한 번** 다시 부르므로, 회차마다 독점을 풀었다 다시 잡는 틈이 없다(`ab` 의 기준·변경 교대 전체가 한 독점 안).
  - `--dry-run` 과 함께 쓰지 않는다(종료 2). 독점은 정식 측정에만 쓴다.
  - **run-measure.sh 를 heavy.sh 로 감싸지 않는다.** 슬롯을 쥔 채 독점을 부르면 heavy.sh 가 `HEAVY_EXCL_NESTED`(종료 2)로 거부한다 — 스크립트가 `DFLOW_HEAVY_HELD`·`DFLOW_HEAVY_DOCKER_HELD` 를 보고 먼저 막는다. `heavy.sh acquire` 로 붙잡은 슬롯(E2E 서버)이 있어도 같은 거부이므로 `heavy.sh release` 뒤 부른다.
  - 이중으로 잡지 않는다: 에이전트 훅은 Bash 도구의 맨 위 명령 줄만 보며 스크립트 안의 `../gradlew` 를 heavy.sh 로 감싸지 않는다. 독점 안에서는 heavy.sh 가 `DFLOW_HEAVY_HELD` 를 export 하므로 안쪽에서 heavy.sh 를 또 불러도 슬롯을 새로 기다리지 않는다.
  - 독점 대기 상한은 heavy.sh 의 `DFLOW_HEAVY_WAIT`(기본 90초)다. 못 잡으면 측정 없이 `HEAVY_BUSY` 와 종료 75 — 실패가 아니며, 180초(`DFLOW_HEAVY_EXCL_TTL`) 안에 같은 명령을 다시 부르면 독점 순번이 이어진다. 오래 기다려도 되는 실행이면 `DFLOW_HEAVY_WAIT=1800 run-measure.sh …` 처럼 늘린다.
  - 안쪽 실행은 `DFLOW_HEAVY_HELD`(독점 슬롯)가 없으면(heavy.sh 가 슬롯 폴더를 못 만든 `HEAVY_UNLOCKED`) 측정하지 않고 종료 2 — 독점이 아닌 값이 정식 결과로 남지 않게. 결과 머리에 `exclusive=1 heavy_slot=slot-<i>` 를 적는다.
  - 독점이 막지 못하는 것: 떠 있는 E2E 서버, heavy.sh 를 거치지 않는 명령(이 스크립트의 기본 모드도 그렇다), LLM 세션 등. 그래서 회차마다 남기는 `uptime_before`·`uptime_after`·`load1` 로 잡음을 계속 본다.
- gradle: `--max-workers=2`, `--rerun`(같은 소스를 다시 복사해도 UP-TO-DATE·캐시로 건너뛰지 않게 — 환경변수는 task 입력이 아니다), `-i --console=plain`. mdm 은 `src/backend/mdm` 에서 `../gradlew :api:test`, P5 는 `src/backend/maru-mdm-engine` 에서 `../gradlew test`. 도커 없음, SQLite(시험 공유 DB, 임시 파일)만.

실행 순서(스크립트가 하는 일):
1. 사전 점검 — 환경변수(§3), 쓰는 쪽 워크트리 `git status --porcelain` 이 비었는지, P3·P4 면 사본 파일이 있는지.
2. 잠금 — `MEASURE_LOCK` 을 `mkdir` 원자성으로 잡는다(죽은 보유 pid 면 지우고 다시, 60초마다 대기 알림). 측정 전체(모든 회차) 동안 쥔다 — 회차 사이에 다른 측정 gradle 이 끼어 부하가 바뀌지 않게.
   - `--exclusive` 면 이어서 `heavy.sh --exclusive` 를 자식으로 띄워 자기 자신(안쪽 실행)을 부르고, 그 종료 코드로 끝난다. 측정 잠금을 먼저 잡는 이유: 거꾸로 하면 PC 일반 슬롯 K개를 쥔 채 측정 잠금을 기다릴 수 있다. 안쪽 실행은 잠금 pid 가 바깥 실행인지 확인만 하고 잠금을 잡지도 지우지도 않는다. 중단(INT·TERM·HUP)은 바깥이 heavy.sh 자식에 TERM 으로 넘기고, 안쪽이 복사본을 지우고 끝날 때까지 기다린 뒤 잠금을 푼다.
   - 안쪽 실행이 아래 3~5를 그대로 한다(사전 점검도 한 번 더 한다).
3. 회차마다: `uptime` 기록 → 그 P 의 시험 소스 복사(대상이 이미 있으면 변경 쪽 추적 파일인 extra 만 그대로 쓰고, 그 밖은 중단) → gradle → 복사한 파일·만든 디렉터리만 지움 → 원 로그에서 MEASURE 줄 수집 → `uptime` 기록 → 워크트리 `git status` 가 비었는지 확인(아니면 종료 3).
4. MEASURE 줄이 0개면(건너뜀·컴파일 실패) 종료 4. gradle 이 실패했어도 MEASURE 줄이 있으면 남기고 다음으로 가며 끝에 종료 1 로 알린다. 복사 실패는 종료 5.
5. 정리는 한 trap 함수가 한다(복사한 파일·만든 디렉터리·잠금). git stash·checkout 은 쓰지 않는다.

종료 코드: 0 성공 · 1 gradle 실패 있음 · 2 사용법·환경·점검 오류(또는 heavy.sh 독점 거부) · 3 정리 뒤 워크트리가 더러움 · 4 MEASURE 줄 없음 · 5 복사 실패 · 75 독점 못 잡음(`HEAVY_BUSY`) · 130 중단.

## 5. 출력 형식

시험은 표준 출력에 한 줄 `MEASURE <P번호> <시나리오> <지표>=<값> ...` 를 찍는다(값의 공백은 `_`). 스크립트가 `gradle -i` 원 로그에서 이 줄을 모으고, 복사해 돌리는 기존 시험의 줄도 같은 형식으로 바꾼다:

- `[query-count] headerImpact <이름> = N` → `MEASURE P2 equiv-<이름> probeStmts=N`
- `[query-count] columnMng.search <이름> = N` → `MEASURE P4 char-<이름> probeStmts=N`
- `[entity-load] columnMng.search <이름> = N` → `MEASURE P4 char-<이름> loads=N`

결과 파일 `<결과 폴더>/<YYYYmmdd-HHMMSS>-<base|dev>-<P>.txt`, 원 로그 `<결과 폴더>/raw/<같은 이름>.log`(gradle -i). `#` 로 시작하는 머리·꼬리 줄과 MEASURE 줄로 이뤄진다:

```
# side=base wt=… head=b557ccbd expected=b557ccbd P=P1 round=1/3 dry=0 exclusive=1 heavy_slot=slot-1
# source_db=…/mdm-copy.db sha1=…
# started=…
# uptime_before: … load averages: x y z
MEASURE P1 env java=21.0.12.1 cpus=10 dry=false load1=…
MEASURE P1 applyItems-N100 deleted=33 changed=33 added=34 flush=… stmts=… stmtsWithTrailingFlush=… loads=… fetches=… inserts=… updates=… deletes=…
MEASURE P1 applyItems-N100-time ms_median=… ms_min=… ms_max=… reps=7 runs_ms=12.3,11.8,… load1=…
# uptime_after: …
# finished=… gradle_exit=0 measure_lines=…
# gradle: … tests completed …
```

- 머리 줄: `side`·`wt`(워크트리 절대경로)·`head`(실제 HEAD)·`expected`(기대값, 다르면 `# 경고: HEAD 가 기대값과 다르다` 줄)·`P`·`round`·`dry`·`exclusive`(독점 안쪽 실행이면 1)·`heavy_slot`, 사본 경로와 sha1(P3·P4 가 아니어도 주어지면 적는다, 없으면 `-`), 시작 시각, 시작 load.
- 꼬리 줄: 끝 load, 끝 시각·gradle 종료 코드·MEASURE 줄 수, gradle 의 FAILED·SKIPPED·tests completed·BUILD 줄.

공통 계수 지표(`StatProbe`, 트랜잭션 안에서 부르고 롤백):

| 지표 | 뜻 |
|---|---|
| `stmts` | 호출이 돌아온 직후의 `prepareStatementCount`(호출 안의 SQL 문 수) |
| `stmtsWithTrailingFlush` | 그 뒤 `em.flush()` 까지 — `QueryCountProbe`·`[query-count]` 값과 같은 정의(커밋 본문 참고값과 견줄 값) |
| `flush` | 호출 안의 flush 횟수(자동 flush 포함, 뒤따르는 em.flush 제외) |
| `loads`·`fetches` | 엔티티 로드(읽은 행)·지연 로딩 수 |
| `inserts`·`updates`·`deletes` | 엔티티 쓰기 수 |

시간 지표는 Statistics 를 끈 채 회마다 새 트랜잭션에서 호출 구간만 `System.nanoTime()` 으로 재고 롤백한다(예열 뒤 반복, 중앙값·최소·최대·원값).

## 6. P 별 시나리오·지표

### P1 마스터코드 선분 조작 (`MeasureP1MasterCodeFlushTest`, mdm api 통합 시험)
- 데이터: `MasterCodeSegmentFlushSqliteTest`(변경 쪽) 를 본뜸 — `MasterCodeFixtures` 네이티브 INSERT, 코드 `M`, 1.000 RELEASED·1.001 DRAFT(kim), 사용자 kim·STEWARD.
- 결정적(1회): `applyItems-N10/100/500`(삭제 n/3 — 각 코드 TABLE 카테고리 2개 소속, 수정 n/3 — 1.000 행 닫고 새 구간, 추가 나머지; 투영 순서), `removeItem-m3/30`, `revertItem-m3/30`(같은 트랜잭션 removeItem 뒤 되돌리기만 셈), `closeCategory-m3/30`, `revertCate-m3/30`. 지표: `flush`·`stmts`·`stmtsWithTrailingFlush`·쓰기 수.
- 시간(A·B 교대): `applyItems-N<n>-time` — 예열 2·반복 7, ms.
- 판정 축: 변경 0daad719 는 행마다 `saveAndFlush` → `save` + 끝 flush 한 번이므로 `flush` 가 n 에 비례 → 상수로 주는지.

### P2 헤더 확정 영향도 (`MeasureP2HeaderImpactTest` + 동치 시험 사본)
- 결정적(1회, 회차 1 강제).
- `E<e>-H<h>`: 전문 E = 1·4·16·64 개(각 RELEASED 1.000 한 버전), 쌓인 헤더 H = 1·3·5(대상 HA + 다른 헤더 H−1), 짝수 전문은 HA 재정의. HA DRAFT 1.001 은 길이가 바뀌어 모든 전문이 영향 → `rows` 가 E 와 같아야 정상(아니면 시험 실패). 지표: `stmts`·`stmtsWithTrailingFlush`·`loads`. 옛 근사식 E×2×(4+3H) 와 견준다.
- `equiv-<이름>`: `LayoutHeaderImpactEquivalenceSqliteTest`(ea1955c5, 기준에는 사본 복사) 의 `[query-count]` — 문서 표의 "그대로·추가·삭제·변경 / 버전 경계 / 첫 확정 / 영향 없음 / 같은 트랜잭션" 행. 값 정의는 `stmtsWithTrailingFlush` 와 같다.

### P3 용어 검색 (`MeasureP3TermSearchTest`)
- 데이터: 로컬 MDM DB 사본의 용어 전체(2026-10-04 사본 8,152행, EMBEDDING 4,096바이트 포함 — 엔티티에 매핑되지 않지만 표 훑기 비용에 든다)를 원래 ID 로 옮김.
- 시나리오: `none`(조건 없음), `kw-koil`(키워드 '코일'), `kw-coil`('coil'), `ctx-dogeum`(상황 '도금'만), `sys-ERP`(시스템 'ERP'만), `combo`('coil'+'MES'+'공통').
- 결정적: `loads`(읽은 용어 행 수)·`stmts`·`rows`(결과 건수). 기대: 기준은 모든 시나리오에서 loads = 용어 전체 행 수, 변경은 1차 거름 후보 수(2026-10-04 사본에서 '코일' 22·'coil' 249).
- 보조 시간(A·B 교대): `<시나리오>-time` 예열 3·반복 9.

### P4 컬럼 검색·저장·역분해 (`MeasureP4ColumnSearchTest` + 검색 특성 시험 사본)
- 결정적(회차 1 강제). 응답 시간은 1회차 참고값 `ms_ref`(예열 1·반복 3 중앙값)만 — A·B 교대가 필요하면 `--keep-rounds`.
- `small-*`: `ColumnMngLookupCharacterizationTest.쿼리_수_기록`(변경 쪽) 시나리오를 그대로 옮김(용어 3·도메인 1) — `save-terms0-compose`·`save-terms3`·`save-terms6-dup`·`save-conflict1/3`·`compare-reverse-1col-1map`·`3col-5map`·`compare-forward`. 커밋 본문 참고값(save 용어 3행 11→9·6행 14→9, 충돌 3개 8→6, REVERSE 3컬럼·5매핑 7→5)은 `stmtsWithTrailingFlush` 와 견준다.
- `char-*`: `ColumnMngSearchCharacterizationTest`(f2392a4a, 기준에는 사본 복사) — 13·33컬럼 검색 `probeStmts`·`loads`(참고값 search 4→4, 로드 24→5·64→5).
- `large-*`: 로컬 DB 사본에서 옮긴 데이터(§2.2 표 — 2026-10-04 사본 기준 용어 8,152·도메인 164·컬럼 7,857·매핑 약 11,166).
  - 검색: `large-<asis|k10|k500|k501|k2000|k8000>-search-<none|kw-dukke|dom-coil>` — 조건 없음, 검색어 '두께'(2026-10-04 사본에서 184컬럼, 저장용 1컬럼 제외), 도메인 키워드 'coil'(같은 사본에서 실제 도메인 8개·105컬럼). `asis` 는 실제 TERM_IDS(참조 용어 ID 약 1,461), `k<k>` 는 컬럼마다 원소 수를 지키며 앞 k 개 용어 ID 를 차례로 돌려 써서 전체 컬럼의 서로 다른 참조 용어 ID 가 정확히 k 가 되게 바꾼 데이터. 지표: `stmts`·`loads`·`rows`·`kOut`(결과 컬럼이 참조하는 서로 다른 용어 ID 수 — 문서의 3 + ⌈k/500⌉ 식의 k)·`dHits`(결과 컬럼의 서로 다른 도메인 수)·`ms_ref`.
  - 저장: `large-save-terms0-compose`·`terms3`·`terms6-dup`·`terms30`·`terms600`(600 은 IN 500개 나눔 확인), `large-save-conflict1/3/30`(MES 안에서 대문자 기준 한 컬럼만 쓰는 실제 매핑과 충돌). 모두 성공 또는 기대 오류 MDM018 인지 확인해 `ok`·`err` 로 찍고, 아니면 시험 실패 — 이름 분해 실패(MDM017)·중복(MDM019)으로 일찍 끝난 호출의 작은 문 수가 개선처럼 보이지 않게. `large-precheck` 줄이 '원재료 코일 두께' 분해 결과(placeholder)를 남긴다.
  - 역분해: `large-compare-reverse-charg`(실제), `large-compare-reverse-<m>col-<m>map`(측정용 ERP 매핑 `MSRREV<m>` 을 앞 m=1·5·50 컬럼에 넣음 — `dups` 가 m 이어야 함).

### P5 evaluateSet (`MeasureP5RuleSetBenchTest`, maru-mdm-engine 단위 시험)
- 변경 쪽 `RuleSetPrepareBenchTest`(87ac5868 판)에서 변경 전용 `cachedPlans()` 단언만 뺀 판. 1,000행 × 세트 N(1·5·20), 예열 3 뒤 9회, 한 JVM 안에서 100행 블록마다 A(같은 정의 객체)·B(부를 때마다 새 세트 정의 사본)·C(파싱 + `new FlowKeys` 만)를 순서를 돌려 가며 번갈아 잰다.
- `N<n>`: `A_us_*`·`B_us_*`·`C_us_*`(µs/호출 중앙값·최소·최대), `BminusA_us_*`(회차별 짝 차이), `BgtA`. `N<n>-raw`: 회차별 원값(ms)·짝 차이·load.
- 해석: 기준 쪽은 기억이 없으므로 B − A ≈ 사본 비용, 변경 쪽 B − A = 기억 효과 + 사본 비용 → 둘의 차가 기억 효과의 추정. 기준 A 와 변경 A 의 절대 비교는 C 로 보정하고 회차(A·B 교대 3회 이상) 중앙값으로 본다.

## 7. 정리

스크립트가 회차마다 지우므로 평소에는 할 일이 없다. 중간에 강제 종료(kill -9 등)로 남았을 때만 아래를 지운다(추적 파일이 아니므로 `git status` 에 `??` 로 보인다):

```
<wt>/src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/measure/            (디렉터리 통째)
<wt>/src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/MeasureP5RuleSetBenchTest.java
기준만: <base>/src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutConfirm/LayoutHeaderImpactEquivalenceSqliteTest.java
기준만: <base>/src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/columnMng/ColumnMngSearchCharacterizationTest.java
잠금(보유 프로세스가 죽었으면 다음 실행이 스스로 지운다): ${MEASURE_LOCK}
```

빌드 산출물(`build/`·`.gradle/`)은 `.gitignore` 대상이라 git status 에 나오지 않는다.

## 8. 소요 시간(2026-10-04 본 측정 실측)

`ab all 3 --exclusive` 한 번(컴파일은 미리 데운 상태), MacBook Air M5(팬 없음, 16GB). 이 PC 는 같은 설정도 2배까지 흔들린다. 값은 결과 파일 시각 사이 간격이라 gradle 기동을 포함한다.

| P | 1회 | 회차 | 합계 |
|---|---|---|---|
| P1 | 기준 약 15~17초 · 변경 약 6~7초 | 6 | 약 1분 10초 |
| P2 | 약 6~7초 | 2 | 약 13초 |
| P3 | 약 6~11초 | 6 | 약 53초 |
| P4 | 기준 약 34초 · 변경 약 18초 | 2 | 약 52초 |
| P5 | 약 3분 5초~3분 25초 | 6 | 약 19분 40초 |
| 전체 | | 22 | 약 23분(12:33:33~12:56:20) |

- **첫 컴파일은 독점 밖에서 끝낸다**: 새 측정 워크트리는 첫 실행에 수 분짜리 컴파일이 붙는다. 먼저 `ab all --dry-run`(독점 없음)으로 데워 두지 않으면 그 컴파일이 독점 창 안에 들어간다.
- **독점 창 = 측정 전체**다. 그동안 PC 의 다른 heavy.sh 명령은 모두 멈춰 기다린다. `ab all 3 --exclusive` 는 PC 를 20분 넘게 세우므로 다른 작업과 시각을 맞춘 뒤에만 쓴다. 가벼운 쪽은 시간 지표가 있는 P1·P3·P5 만 `ab <P> 3 --exclusive` 로 P 하나씩 도는 것이다 — 기준·변경 교대는 P 안에서만 견주므로 P 사이에 독점이 풀려도 비교는 깨지지 않는다. P2·P4 는 결정적 계수만이라 `--exclusive` 없이 돈다.
- 에이전트의 Bash 도구 한 번에 10분 상한이 있으면 P5·`all` 은 백그라운드 실행으로 띄우고 완료를 기다린다. 이때 `DFLOW_HEAVY_WAIT` 를 늘리거나(예 `DFLOW_HEAVY_WAIT=1800`), 종료 75(`HEAVY_BUSY`)면 180초 안에 다시 부른다.

## 9. 두 워크트리 API 차이로 바꾸거나 뺀 지표

- P3 JSON 파싱 횟수(문서 지표): 재지 않는다. 기준에는 파서 호출을 셀 자리(`MdmJsonLists.readStrings`)가 없고 운영 코드를 고치지 않기로 했다. 읽는 행 수(`loads`)·문 수·응답 시간으로 대신한다.
- P4 `ColumnMngLookupCharacterizationTest`: 변경 전용 `TermDictionaryLoader` 를 써서 기준에서 컴파일되지 않는다 → 그 `쿼리_수_기록` 시나리오를 `small-*` 로 옮겨 적었다(같은 데이터·같은 호출·같은 계수 정의).
- P5: 변경 쪽 측정 시험의 `hit.cachedPlans()` 단언을 뺐다(기준 엔진에 없다). 기준에서도 A·B·C 와 짝 차이를 찍는다(사본 비용 기준선).
- P3·P4 데이터: 합성하지 않고 로컬 MDM DB 사본을 쓴다(§2.2).
- 문서 P1 의 "SQLite 인메모리 여부 확인 필요": 공유 시험 DB 는 `Files.createTempFile` 임시 파일이다(`MdmSharedTestDb`).
