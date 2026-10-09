# MDM 백엔드·엔진 레인 성능 측정 하네스

`docs/refactor-2026-10/perf-mdm-backend.md` 의 P1~P5 측정 절차를 기준(before) 워크트리와 변경(after) 워크트리에서 같은 시험으로 돌리는 도구다. 2026-10-04 본 측정(SQLite 시절) 수치와 판정은 그 문서에 있다(이 폴더에는 결과를 두지 않는다).

**2026-10-07 부터 DB 는 Oracle 이다**(oracle-1007). P1~P4 는 시험 PDB(`T_<레인>`)의 `MDMAPUSER` 스키마에서 돌고, P3·P4 의 원본 데이터는 로컬 SQLite 사본이 아니라 저장소 스냅샷(`db-snapshot/MDMAPUSER/*.csv`)이다. 그래서 **Oracle 시험 기반(`MdmSharedTestDb` 의 `dmes.ora.url`)이 있는 커밋만 측정할 수 있다** — 옛 기준·변경 커밋(`b557ccbd`·`923aa9a0`)은 SQLite 시절이라 이 도구로 돌지 않는다. 기준(base)·변경(dev)은 Oracle 전환 이후의 두 커밋(워크트리)이다. **Oracle 에서 잰 값은 Oracle 에서 잰 값끼리만 견준다**(2026-10-04 SQLite 값과 직접 비교하지 않는다 — 데이터 규모도 스냅샷이 바뀌어 다르고 EMBEDDING 도 NULL 이다).

측정 시험 소스는 이 저장소의 시험 소스 폴더(`src/backend/**/src/test`)에 두지 않는다. `run-measure.sh` 가 측정할 때만 각 측정 워크트리의 test 폴더로 복사하고 gradle 이 끝나면 지운다. 그래서 평소 빌드·시험 대상에 들어가지 않는다(gradle 설정을 따로 고치지 않았다).

## 1. 구성

```
scripts/perf/mdm-backend/
  run-measure.sh                     실행기(복사·heavy.mjs 슬롯·gradle(Oracle 시험 하니스)·수집·정리)
  README.md                          이 문서
  src/mdm-api/com/dongkuk/dmes/mdm/measure/
    MeasureSupport.java              MEASURE 줄 출력·MDM_MEASURE/DRY·시간 요약
    StatProbe.java                   Hibernate Statistics 계수(트랜잭션 안·롤백) + 시간 반복
    SourceDb.java                    P3·P4 데이터: db-snapshot/MDMAPUSER CSV 를 JDBC(MDMAPUSER)로 원래 ID 로 적재 + 접속 PDB 안전장치
    MeasureP1MasterCodeFlushTest.java
    MeasureP2HeaderImpactTest.java
    MeasureP3TermSearchTest.java
    MeasureP4ColumnSearchTest.java
  src/maru-mdm-engine/kr/dongkuk/maru/mdm/engine/rule/
    MeasureP5RuleSetBenchTest.java
```

옛 `src/extra-base/`(변경 쪽 추적 시험의 SQLite 시절 사본 — P2 고정 5시나리오 `LayoutHeaderImpactEquivalenceSqliteTest`, P4 13·33컬럼 검색 `ColumnMngSearchCharacterizationTest`)는 `src/backend/mdm/archive/perf-mdm-backend-extra-base/` 로 옮겼다. 두 시험은 이제 Oracle 판이 `src/backend/mdm/api/src/test/` 에 추적되므로 기준·변경 워크트리 모두 그 파일을 그대로 돌린다(워크트리에 없으면 `run-measure.sh` 가 시작하지 않는다).

측정 시험은 두 워크트리 모두에서 컴파일되도록 공개 서비스 API·리포지토리·기준에도 있는 시험 기반만 쓴다:
`AbstractMdmSharedDbTest`·`MdmSharedTestDb`(Oracle 판, 두 쪽 동일), `LayoutTestSupport`·`DmeTestSupport`·`DmaTestSupport`·`MasterCodeFixtures`·`MasterCodeTestConfig`(두 쪽 동일 — `diff` 로 확인), 엔진 `FlowFixtures`·`SampleRules`·`InMemoryDefinitionLookup`. 변경 쪽 전용 클래스(`MdmStrings`·`MdmJsonLists`·`TermDictionaryLoader`·`ColumnSearchPrefilter`·`TermSearchPrefilter`·`MdmRuleEngine.cachedPlans()` 등)는 쓰지 않는다.
쿼리 수는 Hibernate Statistics 로 센다(기존 `QueryCountProbe` 와 같은 방식, 기준에도 같은 파일이 있다). mdm 설정에 `hibernate.jdbc.batch_size`·`order_inserts` 가 없어(2026-10-04 grep) JDBC 배치가 없으므로 준비한 문 수 ≈ 실행한 문 수다.
mdm 시험 JVM 은 build-logic 관례로 C1 만 쓴다(`-XX:TieredStopAtLevel=1`) — 두 쪽이 같은 조건이지만 절대 시간은 운영 JVM 과 다르다.

## 2. 준비

### 2.1 측정 워크트리

저장소 루트에서 기준·변경 워크트리를 detached 로 만든다(경로는 아무 데나 — 아래는 예. `<기준>`·`<변경>` 은 둘 다 Oracle 시험 기반이 있는 커밋).

```
git worktree add --detach .claude/worktrees/mdm-perf-base <기준 커밋>
git worktree add --detach .claude/worktrees/mdm-perf-dev  <변경 커밋>
```

- 두 워크트리의 `git status --porcelain` 이 비어 있어야 한다(스크립트가 시작 때와 회차마다 확인한다).
- 스크립트는 시작할 때 각 워크트리에 `scripts/oracle/pdb.mjs`·`MdmSharedTestDb`(`dmes.ora.url`)가 있는지, P2·P4 가 같이 돌리는 추적 시험이 있는지 확인하고 없으면 종료 2 로 멈춘다(SQLite 시절 커밋 방지).
- 첫 실행은 cactus-core·mcm-core·engine·mdm lib/api 와 시험 소스 전체 컴파일이 붙어 수 분 걸린다. 정식 측정 전에 `--dry-run` 으로 한 번 데워 둔다(§4).
- 측정이 끝나면 `git worktree remove <경로>` 로 정리한다.

### 2.2 시험 PDB 와 P3·P4 데이터

**시험 PDB**: P1~P4 는 Oracle 시험 PDB 의 `MDMAPUSER` 스키마에서 돈다. 두 가지 중 하나를 고른다(P5 는 DB 가 없어 해당 없음).

| 방식 | 설정 | 동작 |
|---|---|---|
| 복제(기본) | `MEASURE_ORA_PDB` 없음 | gradle 한 번마다 하니스가 `-Pdmes.ora.test=clone` 으로 템플릿(`TPL_EMPTY`, `MEASURE_ORA_TEMPLATE` 로 바꿈)에서 `T_<레인>` PDB 를 복제하고 끝나면 지운다. 따로 정리할 것이 없다. 회차마다 복제 시간이 붙는다 |
| 있는 PDB | `MEASURE_ORA_PDB=T_MDMPERF` | 미리 만든 PDB 를 `-Pdmes.ora.pdb` 로 그대로 쓴다. 회차마다 복제·삭제가 없어 `--exclusive` 정식 측정에 맞다. 쓰고 나면 직접 `drop`(§7) |

- 측정 대상은 늘 **지워도 되는 시험 PDB** 다. `MdmSharedTestDb` 가 JVM 마다 스키마를 Flyway clean + migrate 하고 시험 클래스마다 모든 행을 지운다.
- `run-measure.sh` 는 `MEASURE_ORA_PDB` 가 `FREEPDB1`·`CDB$ROOT`·`PDB$SEED`·`TPL_*`·`L_*`(레인 개발 PDB·템플릿)면 어떤 값으로도 거부하고(종료 2), `T_` 로 시작하지 않으면 `MEASURE_ORA_ALLOW=<같은 이름>` 이 있어야 쓴다. 시험 쪽(`MdmSharedTestDb`·`SourceDb`)이 실제 접속한 PDB(`CON_NAME`)로 한 번 더 막는다.
- 열린 PDB 는 PC 전체에서 3개 이하(FREEPDB1 + 템플릿 + 작업)다 — 이 하네스는 PDB 를 하나만 쓴다(`scripts/oracle/README.md`).

**P3·P4 데이터 = 스냅샷**: 합성 데이터가 아니라 저장소의 `db-snapshot/MDMAPUSER/{TB_MDM_TERM,TB_MDM_DOMAIN,TB_MDM_COLUMN,TB_MDM_COLUMN_SYSTEM}.csv` 를 시험 PDB 에 원래 ID 로 적재한다. 변경 쪽 DB 1차 거름(LIKE)의 후보 행 수가 글자 모양(JSON 원문·약어 분포)에 달려 합성 분포로는 재현되지 않기 때문이다. 스냅샷이 없으면 P3·P4 는 시작하지 않는다.

- **`snapshot.py import` 를 측정 전에 한 번 돌리는 방식은 쓸 수 없다.** 시험 기반(`MdmSharedTestDb`)이 측정 JVM 이 뜰 때 스키마를 clean 하고 클래스마다 행을 지워, 미리 적재한 행은 측정 코드가 돌기 전에 사라진다. 그래서 같은 CSV 를 측정 클래스 안(`SourceDb.load`, 클래스 시작의 초기화 직후)에서 `snapshot.py` 와 같은 규칙(`\N`=NULL, 앞 백슬래시 하나 더, 빈 문자열=NULL, 일시 칸의 epoch 숫자=KST, 대상 표에 없는 칸 무시, 적재 뒤 IDENTITY 를 최대값 다음으로 맞춤)으로 읽어 넣는다. 별도 PDB 를 하나 더 열 필요도, python·oracledb 도 필요 없다.
  - `snapshot.py` 와 다른 점(대상 네 표 기준으로는 결과가 같다): FK 는 모두 끄지 않고 도메인이 네 표 밖(`TB_MDM_CODE`·`TB_MDM_UNIT`, 시험 클래스 시작 때 비어 있음)을 가리키는 `FK_TB_MDM_DOMAIN_CODE`·`FK_TB_MDM_DOMAIN_UNIT` 두 개만 적재 동안 끄고 `ENABLE NOVALIDATE` 로 되돌린다(P4 측정은 두 표를 읽지 않는다). PK 칸이 빈 행은 건너뛰지 않고 ORA-01400 으로 드러낸다. 일시의 소수 초·DATE 칸 처리처럼 네 표(`TIMESTAMP(6)`)에 없는 경우는 맞추지 않았다.
  - `T_` 가 아닌 PDB 를 허용할 때 `run-measure.sh` 는 `-Pdmes.ora.allowReset=<PDB>` 를 gradle 에 넘기고, `mdm/build.gradle` 이 이를 시험 JVM 시스템 속성으로 옮긴다. `SourceDb` 는 `CON_NAME` 과 함께 `CURRENT_SCHEMA`·`SESSION_USER` 가 모두 `MDMAPUSER` 인지 본다.
- 스냅샷 폴더는 기본 `<저장소>/db-snapshot/MDMAPUSER` 이고 `MDM_MEASURE_SNAPSHOT_DIR` 로 바꾼다. **기준·변경 두 쪽이 같은 폴더 하나를 쓴다**(같은 데이터로 견주려고). 결과 파일 머리에 네 CSV 의 git blob 해시(`snapshot_blobs`)가, 시험 출력에 SHA-1 요약(`MEASURE P3|P4 data source=…`)이 남는다.
- 2026-10-07 스냅샷의 규모(CSV 레코드 수):

  | | CSV 행 | 시험 PDB 로 적재 |
  |---|---|---|
  | 용어 | 8,158 | 8,158 |
  | 도메인 | 171 | 171 |
  | 컬럼 | 7,951 | 7,950 (P4 저장 시나리오가 새로 만들 '원재료 코일 두께'/`RMTL_COIL_THK` 컬럼 1개를 뺌) |
  | 시스템 매핑 | 11,250 | 위에서 뺀 컬럼의 매핑을 뺀 수 |

- 스냅샷은 `TB_MDM_TERM.EMBEDDING·EMBEDDING_MODEL` 을 NULL 로 내보낸다. 예전 SQLite 측정은 행마다 4,096바이트 벡터가 있었지만, Oracle 에서 BLOB 은 4,000바이트를 넘으면 표 밖에 저장되어 표 훑기에 거의 들지 않으므로 채워 넣지 않는다. 그래도 2026-10-04 값과는 같은 조건이 아니다.
- 스냅샷은 git 로그에 따라 바뀐다. 다른 날 스냅샷이면 P3·P4 의 결정적 값(`loads`·`rows`·후보 수 등)도 달라진다. 비교는 같은 스냅샷으로 기준·변경을 함께 돈 값끼리만 한다.

### 2.3 JDK

JDK 21 이 필요하다. `JAVA_HOME` 을 반드시 준다(없으면 안내 후 종료 2). 다른 레인 gradle 데몬과 섞이지 않게 저장소 기본 JDK 가 아니라 JDK 21 경로를 직접 지정한다.

## 3. 환경변수

PC 마다 다른 값은 모두 환경변수로 받는다. 상대경로를 주면 스크립트가 절대경로로 바꾼다(gradle 은 측정 워크트리 안에서 돌기 때문).

| 변수 | 필수 | 기본값 | 뜻 |
|---|---|---|---|
| `JAVA_HOME` | 항상 | — | JDK 21 홈 |
| `MEASURE_BASE_WT` | `base`·`ab` | — | 기준 워크트리 경로(§2.1) |
| `MEASURE_DEV_WT` | `dev`·`ab` | — | 변경 워크트리 경로(§2.1) |
| `MDM_MEASURE_SNAPSHOT_DIR` | | `<저장소>/db-snapshot/MDMAPUSER` | P3·P4 데이터 스냅샷 폴더(§2.2). 측정 시험에도 그대로 넘어간다 |
| `MEASURE_ORA_PDB` | | (복제 방식) | 있는 시험 PDB 이름(`T_*`). 없으면 gradle 마다 `T_<레인>` 복제·삭제 |
| `MEASURE_ORA_ALLOW` | | — | `T_` 가 아닌 PDB 를 쓸 때 그 이름을 그대로 적는다(`FREEPDB1`·`TPL_*`·`L_*` 는 거부) |
| `MEASURE_ORA_TEMPLATE` | | 하니스 기본(`TPL_EMPTY`) | 복제 원본 템플릿 |
| `DMES_ORA_PASSWORD`·`DMES_ORA_HARNESS_LOCK_WAIT_SEC` | | `dmes_password_123`·7200 | Oracle 시험 하니스 값(`scripts/oracle/README.md`) |
| `MEASURE_BASE_REV`·`MEASURE_DEV_REV` | | — | HEAD 기대값(선택). 주면 다를 때 결과 파일에 경고 줄 |
| `MEASURE_RESULTS_DIR` | | `${TMPDIR}/mdm-backend-perf` | 결과 폴더. 저장소 밖 기본값이라 `.gitignore` 를 건드리지 않는다. 저장소 안으로 바꾸면 결과를 커밋하지 않도록 주의한다 |
| `DFLOW_HEAVY_WAIT` | | heavy.mjs 기본(90초) | 슬롯·`--exclusive` 독점 대기 상한(heavy.mjs 가 읽는다) |

스크립트가 시험에 넣는 값(직접 줄 일 없음): `MDM_MEASURE=1`(없으면 측정 시험이 Assumptions 로 건너뛴다), `MDM_MEASURE_DRY=1`(`--dry-run`), mdm 시험에는 `-Pdmes.ora.test=clone` 또는 `-Pdmes.ora.pdb=<PDB>`(환경에 남은 `DMES_ORA_PDB`·`DMES_ORA_URL`·`DMES_ORA_TEST` 는 치운다 — 하니스는 `DMES_ORA_PDB` 가 있으면 복제 대신 그 PDB 를 쓴다). 독점 안쪽 실행 구분용 `MDM_PERF_EXCL_INNER` 는 스크립트 내부용이다.

`heavy.mjs` 는 스크립트 위치(`${BASH_SOURCE}`)에서 찾은 저장소 루트의 `.claude/skills/dflow-dev/scripts/heavy.mjs` 를 쓴다. 없거나 실행할 수 없으면 시작하지 않는다(종료 2). heavy.mjs 의 슬롯 폴더는 `~/.dflow/locks/heavy`(`DFLOW_HEAVY_DIR`)라 어느 워크트리의 heavy.mjs 로 불러도 같은 PC 전역 세마포어다.

## 4. 사용법

```
run-measure.sh <base|dev|ab> <P1|P2|P3|P4|P5|all> [회차 수(기본 3)] [--dry-run] [--keep-rounds] [--exclusive]
```

예:

```
export JAVA_HOME=<JDK 21 홈>
export MEASURE_BASE_WT=<기준 워크트리> MEASURE_DEV_WT=<변경 워크트리>
scripts/perf/mdm-backend/run-measure.sh ab all --dry-run      # 첫 컴파일 데우기·출력 확인
scripts/perf/mdm-backend/run-measure.sh ab P1 3 --exclusive   # 정식 측정(시간 지표)
scripts/perf/mdm-backend/run-measure.sh ab P2                 # 결정적 지표만 — 독점 불필요
```

### 4.1 새 실행 순서(Oracle)

1. **시험 PDB 준비**
   - 기본(복제): 할 일 없음 — gradle 이 시작할 때 `T_<레인>` 을 복제하고 끝나면 지운다.
   - 있는 PDB: `node scripts/oracle/pdb.mjs clone TPL_EMPTY T_MDMPERF` 로 만들고 `export MEASURE_ORA_PDB=T_MDMPERF`(회차마다 복제 시간이 안 붙는다. `--exclusive` 정식 측정에 권장).
2. **스냅샷 적재**: 따로 돌릴 명령이 없다 — P3·P4 시험이 시작할 때 `db-snapshot/MDMAPUSER` CSV 를 PDB 에 적재한다(§2.2 에 `snapshot.py import` 를 쓰지 않는 이유).
3. **측정**: `run-measure.sh …`(위 예).
4. **PDB 정리**: 복제 방식은 하니스가 지운다. 있는 PDB 를 썼으면 `node scripts/oracle/pdb.mjs drop T_MDMPERF`(또는 쓸 계획이 있으면 `close`).

Oracle 시험이 실패하거나 시간 초과가 나면 다시 돌리기 전에 VM 상태(`podman machine ssh -- 'free -m; cat /proc/loadavg'`)를 보고, 결과 파일 꼬리의 `# ora:` 줄(하니스가 남기는 `[dmes-ora] … VM available=…MB load=…`)을 함께 적는다. VM 의심이면(available 150MB 미만·load 10 이상·ORA-04031 등) 재실행하지 않고 조정자에게 보고한다(`scripts/oracle/README.md` 「Oracle 오류 판별」).

### 4.2 동작

- `ab`: 기준·변경을 번갈아(기준·변경·기준·변경…) 회차 수만큼 돈다. P 마다 따로 돈다(`all` 이면 P1 의 모든 회차 → P2 … 순서).
- 결정적 지표만 있는 P2·P4 는 회차 수를 1로 강제한다(`--keep-rounds` 로 끈다 — P4 의 응답 시간 참고값을 A·B 교대로 다시 볼 때만).
- `--dry-run`: `MDM_MEASURE_DRY=1` — 규모를 아주 작게(용어·컬럼 50행, P1 N=10, P2 E·H 1·2, P5 100행·N=1, 반복 1·예열 0), 회차 1. 컴파일·실행·출력 수집만 확인한다. 결과는 `<결과 폴더>/dry/`. Oracle 은 쓰므로 heavy.mjs 슬롯 하나 아래에서 돈다.
- **한 번에 하나**: 모든 gradle 은 heavy.mjs 슬롯(PC 전역 세마포어) 아래에서 돈다. 이미 슬롯 안에서 불렸으면(독점 안쪽·`heavy.mjs acquire` 등) 다시 감싸지 않는다. Oracle 쓰는 mdm 빌드(P1~P4)는 여기에 더해 하니스가 복제 직전부터 PDB 삭제까지 PC Oracle 잠금(`pdb.mjs lock-hold`)을 쥐므로 PC 전체에서 한 번에 하나다. 예전 `MEASURE_LOCK`(mkdir 잠금)은 없앴다 — 슬롯 대기 상한은 `DFLOW_HEAVY_WAIT`, 못 잡으면 측정 없이 종료 75(`HEAVY_BUSY`)이며 같은 명령을 다시 부른다.
- `--exclusive`(정식 측정용): 측정 전체를 PC 전역 세마포어 `heavy.mjs` 의 `--exclusive` 한 번 안에서 돈다 — 일반 슬롯 K개(16GB PC 는 2개)를 모두 쥐어 다른 heavy.mjs 명령(게이트·빌드·gradle)이 끼어들지 못한다. 스크립트가 자기 자신을 `heavy.mjs --exclusive /bin/bash run-measure.sh <같은 인자>` 로 **한 번** 다시 부르므로, 회차마다 독점을 풀었다 다시 잡는 틈이 없다(`ab` 의 기준·변경 교대 전체가 한 독점 안).
  - `--dry-run` 과 함께 쓰지 않는다(종료 2). 독점은 정식 측정에만 쓴다.
  - **run-measure.sh 를 heavy.mjs 로 감싸지 않는다.** 슬롯을 쥔 채 독점을 부르면 heavy.mjs 가 `HEAVY_EXCL_NESTED`(종료 2)로 거부한다 — 스크립트가 `DFLOW_HEAVY_HELD`·`DFLOW_HEAVY_DOCKER_HELD` 를 보고 먼저 막는다. `heavy.mjs acquire` 로 붙잡은 슬롯(E2E 서버)이 있어도 같은 거부이므로 `heavy.mjs release` 뒤 부른다.
  - 독점 대기 상한은 heavy.mjs 의 `DFLOW_HEAVY_WAIT`(기본 90초)다. 못 잡으면 측정 없이 `HEAVY_BUSY` 와 종료 75 — 실패가 아니며, 180초(`DFLOW_HEAVY_EXCL_TTL`) 안에 같은 명령을 다시 부르면 독점 순번이 이어진다. 오래 기다려도 되는 실행이면 `DFLOW_HEAVY_WAIT=1800 run-measure.sh …` 처럼 늘린다.
  - 안쪽 실행은 `DFLOW_HEAVY_HELD`(독점 슬롯)가 없으면(heavy.mjs 가 슬롯 폴더를 못 만든 `HEAVY_UNLOCKED`) 측정하지 않고 종료 2 — 독점이 아닌 값이 정식 결과로 남지 않게. 결과 머리에 `exclusive=1 heavy_slot=slot-<i>` 를 적는다.
  - **독점 슬롯을 쥔 채 Oracle PC 잠금을 기다릴 수 있다**(다른 레인의 Oracle 시험이 돌고 있으면 하니스가 `DMES_ORA_HARNESS_LOCK_WAIT_SEC` 까지 기다린다). 그동안 PC 의 다른 heavy.mjs 명령도 멈춘다 — 정식 측정 전에 `pdb.mjs list`·`heavy.mjs status` 로 비었는지 보고 시작한다.
  - 독점이 막지 못하는 것: 떠 있는 E2E 서버, heavy.mjs 를 거치지 않는 명령, LLM 세션, **같은 Oracle VM 을 쓰는 다른 PDB 의 부하**(VM 은 2GB 라 서로 영향을 준다). 그래서 회차마다 남기는 `uptime_before`·`uptime_after`·`load1` 로 잡음을 계속 본다.
- gradle: `--max-workers=2`, `--rerun`(같은 소스를 다시 복사해도 UP-TO-DATE·캐시로 건너뛰지 않게 — 환경변수는 task 입력이 아니다), `-i --console=plain`. mdm 은 `src/backend/mdm` 에서 `../gradlew :api:test -Pdmes.ora.test=clone`(또는 `-Pdmes.ora.pdb=<PDB>`), P5 는 `src/backend/maru-mdm-engine` 에서 `../gradlew test`(DB 없음, 하니스 안 켬). 도커 직접 사용 없음(Oracle 컨테이너는 하니스가 다룬다).

실행 순서(스크립트가 하는 일):
1. 사전 점검 — 환경변수(§3), `MEASURE_ORA_PDB` 이름 규칙, 쓰는 쪽 워크트리의 Oracle 시험 기반·추적 시험 존재, P3·P4 면 스냅샷 CSV 4개, heavy.mjs, 쓰는 쪽 워크트리 `git status --porcelain` 이 비었는지.
   - `--exclusive` 면 이어서 `heavy.mjs --exclusive` 를 자식으로 띄워 자기 자신(안쪽 실행)을 부르고, 그 종료 코드로 끝난다. 중단(INT·TERM·HUP)은 바깥이 heavy.mjs 자식에 TERM 으로 넘기고, 안쪽이 복사본을 지우고 끝날 때까지 기다린다.
   - 안쪽 실행이 아래 2~4를 그대로 한다(사전 점검도 한 번 더 한다).
2. 회차마다: `uptime` 기록(없는 PC 는 `-`) → 그 P 의 시험 소스 복사(대상이 이미 있으면 중단) → gradle(heavy.mjs 슬롯 아래, mdm 은 Oracle 하니스 켬) → 복사한 파일·만든 디렉터리만 지움 → 원 로그에서 MEASURE 줄·`[dmes-ora]` 줄 수집 → `uptime` 기록 → 워크트리 `git status` 가 비었는지 확인(아니면 종료 3).
3. MEASURE 줄이 0개면(건너뜀·컴파일 실패) 종료 4. gradle 이 실패했어도 MEASURE 줄이 있으면 남기고 다음으로 가며 끝에 종료 1 로 알린다. 복사 실패는 종료 5. 슬롯을 못 잡으면 종료 75.
4. 정리는 한 trap 함수가 한다(복사한 파일·만든 디렉터리). git stash·checkout 은 쓰지 않는다.

종료 코드: 0 성공 · 1 gradle 실패 있음 · 2 사용법·환경·점검 오류(또는 heavy.mjs 독점 거부) · 3 정리 뒤 워크트리가 더러움 · 4 MEASURE 줄 없음 · 5 복사 실패 · 75 슬롯·독점 못 잡음(`HEAVY_BUSY`) · 130 중단.

## 5. 출력 형식

시험은 표준 출력에 한 줄 `MEASURE <P번호> <시나리오> <지표>=<값> ...` 를 찍는다(값의 공백은 `_`). 스크립트가 `gradle -i` 원 로그에서 이 줄을 모으고, 복사해 돌리는 기존 시험의 줄도 같은 형식으로 바꾼다:

- `[query-count] headerImpact <이름> = N` → `MEASURE P2 equiv-<이름> probeStmts=N`
- `[query-count] columnMng.search <이름> = N` → `MEASURE P4 char-<이름> probeStmts=N`
- `[entity-load] columnMng.search <이름> = N` → `MEASURE P4 char-<이름> loads=N`

결과 파일 `<결과 폴더>/<YYYYmmdd-HHMMSS>-<base|dev>-<P>.txt`, 원 로그 `<결과 폴더>/raw/<같은 이름>.log`(gradle -i). `#` 로 시작하는 머리·꼬리 줄과 MEASURE 줄로 이뤄진다:

```
# side=base wt=… head=1a2b3c4d expected=- P=P1 round=1/3 dry=0 exclusive=1 heavy_slot=slot-1
# ora=clone snapshot_dir=…/db-snapshot/MDMAPUSER snapshot_blobs=aaaaaaaa,bbbbbbbb,cccccccc,dddddddd
# started=…
# uptime_before: … load averages: x y z
MEASURE P1 env java=21.0.12.1 cpus=10 dry=false load1=…
MEASURE P1 applyItems-N100 deleted=33 changed=33 added=34 flush=… stmts=… stmtsWithTrailingFlush=… loads=… fetches=… inserts=… updates=… deletes=…
MEASURE P1 applyItems-N100-time ms_median=… ms_min=… ms_max=… reps=7 runs_ms=12.3,11.8,… load1=…
# uptime_after: …
# finished=… gradle_exit=0 measure_lines=…
# gradle: … tests completed …
# ora: [dmes-ora] … sessions max=…
```

- 머리 줄: `side`·`wt`(워크트리 절대경로)·`head`(실제 HEAD)·`expected`(`MEASURE_*_REV` 를 줬을 때만, 다르면 `# 경고: HEAD 가 기대값과 다르다` 줄)·`P`·`round`·`dry`·`exclusive`(독점 안쪽 실행이면 1)·`heavy_slot`, `ora`(`clone` 또는 쓴 PDB 이름, P5 는 `none`)·스냅샷 폴더와 네 CSV 의 git blob 해시 앞 8자(P3·P4 일 때, 아니면 `-`), 시작 시각, 시작 load.
- 꼬리 줄: 끝 load, 끝 시각·gradle 종료 코드·MEASURE 줄 수, gradle 의 FAILED·SKIPPED·tests completed·BUILD 줄, Oracle 하니스의 `[dmes-ora]` 줄(복제·삭제한 PDB·세션 수·실패 때의 VM available·load).

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
- 데이터: `MasterCodeSegmentFlushSqliteTest`(이름은 옛 SQLite 시절 그대로, 지금은 Oracle 판) 를 본뜸 — `MasterCodeFixtures` 네이티브 INSERT, 코드 `M`, 1.000 RELEASED·1.001 DRAFT(kim), 사용자 kim·STEWARD.
- 결정적(1회): `applyItems-N10/100/500`(삭제 n/3 — 각 코드 TABLE 카테고리 2개 소속, 수정 n/3 — 1.000 행 닫고 새 구간, 추가 나머지; 투영 순서), `removeItem-m3/30`, `revertItem-m3/30`(같은 트랜잭션 removeItem 뒤 되돌리기만 셈), `closeCategory-m3/30`, `revertCate-m3/30`. 지표: `flush`·`stmts`·`stmtsWithTrailingFlush`·쓰기 수.
- 시간(A·B 교대): `applyItems-N<n>-time` — 예열 2·반복 7, ms.
- 판정 축: 변경 0daad719 는 행마다 `saveAndFlush` → `save` + 끝 flush 한 번이므로 `flush` 가 n 에 비례 → 상수로 주는지.

### P2 헤더 확정 영향도 (`MeasureP2HeaderImpactTest` + 추적 동치 시험)
- 결정적(1회, 회차 1 강제).
- `E<e>-H<h>`: 전문 E = 1·4·16·64 개(각 RELEASED 1.000 한 버전), 쌓인 헤더 H = 1·3·5(대상 HA + 다른 헤더 H−1), 짝수 전문은 HA 재정의. HA DRAFT 1.001 은 길이가 바뀌어 모든 전문이 영향 → `rows` 가 E 와 같아야 정상(아니면 시험 실패). 지표: `stmts`·`stmtsWithTrailingFlush`·`loads`. 옛 근사식 E×2×(4+3H) 와 견준다.
- `equiv-<이름>`: `LayoutHeaderImpactEquivalenceSqliteTest`(워크트리에 추적된 Oracle 판, 이름만 옛 그대로) 의 `[query-count]` — 문서 표의 "그대로·추가·삭제·변경 / 버전 경계 / 첫 확정 / 영향 없음 / 같은 트랜잭션" 행. 값 정의는 `stmtsWithTrailingFlush` 와 같다.

### P3 용어 검색 (`MeasureP3TermSearchTest`)
- 데이터: 스냅샷(`db-snapshot/MDMAPUSER`)의 용어 전체(2026-10-07 스냅샷 8,158행, EMBEDDING 은 NULL — §2.2)를 원래 ID 로 적재.
- 시나리오: `none`(조건 없음), `kw-koil`(키워드 '코일'), `kw-coil`('coil'), `ctx-dogeum`(상황 '도금'만), `sys-ERP`(시스템 'ERP'만), `combo`('coil'+'MES'+'공통').
- 결정적: `loads`(읽은 용어 행 수)·`stmts`·`rows`(결과 건수). 기대: 기준은 모든 시나리오에서 loads = 용어 전체 행 수, 변경은 1차 거름 후보 수(2026-10-04 SQLite 사본에서 '코일' 22·'coil' 249 — 지금 스냅샷의 값은 다시 잰다).
- 보조 시간(A·B 교대): `<시나리오>-time` 예열 3·반복 9.

### P4 컬럼 검색·저장·역분해 (`MeasureP4ColumnSearchTest` + 추적 검색 특성 시험)
- 결정적(회차 1 강제). 응답 시간은 1회차 참고값 `ms_ref`(예열 1·반복 3 중앙값)만 — A·B 교대가 필요하면 `--keep-rounds`.
- `small-*`: `ColumnMngLookupCharacterizationTest.쿼리_수_기록`(변경 쪽) 시나리오를 그대로 옮김(용어 3·도메인 1) — `save-terms0-compose`·`save-terms3`·`save-terms6-dup`·`save-conflict1/3`·`compare-reverse-1col-1map`·`3col-5map`·`compare-forward`. 커밋 본문 참고값(save 용어 3행 11→9·6행 14→9, 충돌 3개 8→6, REVERSE 3컬럼·5매핑 7→5)은 `stmtsWithTrailingFlush` 와 견준다.
- `char-*`: `ColumnMngSearchCharacterizationTest`(워크트리에 추적된 Oracle 판) — 13·33컬럼 검색 `probeStmts`·`loads`(참고값 search 4→4, 로드 24→5·64→5).
- `large-*`: 스냅샷에서 적재한 데이터(§2.2 표 — 2026-10-07 스냅샷 기준 용어 8,158·도메인 171·컬럼 7,950·매핑 약 11,250). 아래 괄호의 건수(184컬럼·8개 도메인 105컬럼·참조 용어 약 1,461)는 2026-10-04 SQLite 사본 값이라 스냅샷이 다르면 달라진다.
  - 검색: `large-<asis|k10|k500|k501|k2000|k8000>-search-<none|kw-dukke|dom-coil>` — 조건 없음, 검색어 '두께'(2026-10-04 사본에서 184컬럼, 저장용 1컬럼 제외 — `rows` 로 새로 읽는다), 도메인 키워드 'coil'(같은 사본에서 실제 도메인 8개·105컬럼). `asis` 는 스냅샷의 실제 TERM_IDS, `k<k>` 는 컬럼마다 원소 수를 지키며 앞 k 개 용어 ID 를 차례로 돌려 써서 전체 컬럼의 서로 다른 참조 용어 ID 가 정확히 k 가 되게 바꾼 데이터. 지표: `stmts`·`loads`·`rows`·`kOut`(결과 컬럼이 참조하는 서로 다른 용어 ID 수 — 문서의 3 + ⌈k/500⌉ 식의 k)·`dHits`(결과 컬럼의 서로 다른 도메인 수)·`ms_ref`.
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
```

빌드 산출물(`build/`·`.gradle/`)은 `.gitignore` 대상이라 git status 에 나오지 않는다.

**PDB**: 복제 방식(`MEASURE_ORA_PDB` 없음)의 `T_<레인>` 은 하니스가 빌드 끝에 지운다. 강제 종료로 남았으면 `node scripts/oracle/pdb.mjs list` 로 본 뒤 내 것(`T_<내 워크트리 이름>`)만 `node scripts/oracle/pdb.mjs drop <PDB>` 한다. 있는 PDB 방식으로 만든 `T_MDMPERF` 는 측정이 끝나면 `drop`(또는 곧 다시 쓰면 `close`)한다. 열린 PDB 슬롯은 PC 전체가 나눠 쓴다. `FREEPDB1`·`TPL_*`·다른 레인의 `L_*`·`T_*` 는 건드리지 않는다.

## 8. 소요 시간(2026-10-04 SQLite 시절 본 측정 실측 — Oracle 값은 아직 없다)

`ab all 3 --exclusive` 한 번(컴파일은 미리 데운 상태), MacBook Air M5(팬 없음, 16GB). 이 PC 는 같은 설정도 2배까지 흔들린다. 값은 결과 파일 시각 사이 간격이라 gradle 기동을 포함한다. **Oracle 전환 뒤에는 PDB 복제·열기·Flyway clean+migrate(JVM 마다)·스냅샷 적재(P3·P4 클래스마다 약 2만 7천 행)가 붙어 더 걸린다** — 복제 방식은 gradle 마다 복제 시간이 더해지므로 정식 측정은 있는 PDB(`MEASURE_ORA_PDB`)를 권한다.

| P | 1회 | 회차 | 합계 |
|---|---|---|---|
| P1 | 기준 약 15~17초 · 변경 약 6~7초 | 6 | 약 1분 10초 |
| P2 | 약 6~7초 | 2 | 약 13초 |
| P3 | 약 6~11초 | 6 | 약 53초 |
| P4 | 기준 약 34초 · 변경 약 18초 | 2 | 약 52초 |
| P5 | 약 3분 5초~3분 25초 | 6 | 약 19분 40초 |
| 전체 | | 22 | 약 23분(12:33:33~12:56:20) |

- **첫 컴파일은 독점 밖에서 끝낸다**: 새 측정 워크트리는 첫 실행에 수 분짜리 컴파일이 붙는다. 먼저 `ab all --dry-run`(독점 없음)으로 데워 두지 않으면 그 컴파일이 독점 창 안에 들어간다.
- **독점 창 = 측정 전체**다. 그동안 PC 의 다른 heavy.mjs 명령은 모두 멈춰 기다린다. `ab all 3 --exclusive` 는 PC 를 20분 넘게 세우므로 다른 작업과 시각을 맞춘 뒤에만 쓴다. 가벼운 쪽은 시간 지표가 있는 P1·P3·P5 만 `ab <P> 3 --exclusive` 로 P 하나씩 도는 것이다 — 기준·변경 교대는 P 안에서만 견주므로 P 사이에 독점이 풀려도 비교는 깨지지 않는다. P2·P4 는 결정적 계수만이라 `--exclusive` 없이 돈다.
- 에이전트의 Bash 도구 한 번에 10분 상한이 있으면 P5·`all` 은 백그라운드 실행으로 띄우고 완료를 기다린다. 이때 `DFLOW_HEAVY_WAIT` 를 늘리거나(예 `DFLOW_HEAVY_WAIT=1800`), 종료 75(`HEAVY_BUSY`)면 180초 안에 다시 부른다.

## 9. 두 워크트리 API 차이로 바꾸거나 뺀 지표

- P3 JSON 파싱 횟수(문서 지표): 재지 않는다. 기준에는 파서 호출을 셀 자리(`MdmJsonLists.readStrings`)가 없고 운영 코드를 고치지 않기로 했다. 읽는 행 수(`loads`)·문 수·응답 시간으로 대신한다.
- P4 `ColumnMngLookupCharacterizationTest`: 변경 전용 `TermDictionaryLoader` 를 써서 기준에서 컴파일되지 않는다 → 그 `쿼리_수_기록` 시나리오를 `small-*` 로 옮겨 적었다(같은 데이터·같은 호출·같은 계수 정의).
- P5: 변경 쪽 측정 시험의 `hit.cachedPlans()` 단언을 뺐다(기준 엔진에 없다). 기준에서도 A·B·C 와 짝 차이를 찍는다(사본 비용 기준선).
- P3·P4 데이터: 합성하지 않고 저장소 스냅샷(`db-snapshot/MDMAPUSER`)을 쓴다(§2.2).
- 문서 P1 의 "SQLite 인메모리 여부 확인 필요": 해당 없음 — 시험 DB 는 Oracle 시험 PDB 다.
- Oracle 로 옮기며 바꾼 시험 SQL(결과 지표의 정의는 그대로): P2 의 예약어 칸 `` `OFFSET` ``·`` `LENGTH` `` → `"OFFSET"`·`"LENGTH"` 와 일시 칸을 `Timestamp` 로 묶기(추적 동치 시험과 같다), P4 의 `LIMIT ?` → `FETCH FIRST ? ROWS ONLY`, `json_array_length(TERM_IDS)` → TERM_IDS 문자열을 읽어 자바에서 원소 수를 셈. `SourceDb` 는 ATTACH 대신 CSV 적재 + IDENTITY 재설정(`TB_MDM_TERM`·`DOMAIN`·`COLUMN`)을 한다 — 하지 않으면 P4 저장이 새로 만드는 ID 가 적재한 ID 와 겹친다(ORA-00001).
- 이 하니스 소스는 어느 gradle 소스 세트에도 없어 `compileTestJava` 로는 검증되지 않는다. 시험 클래스패스(`api/build/classes`·oasis·gradle 캐시 jar)로 직접 `javac` 한 컴파일만 확인했고, 실제 실행은 레인 세션이 한다.
