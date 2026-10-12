# scripts/oracle — 레인·시험용 Oracle PDB 도구 (oracle-1007)

로컬 Oracle 26ai Free 컨테이너(`tools/oracle-free/docker-compose.yml`, 컨테이너 이름 `oracle-26ai-free`) 안에서 레인(워크트리)마다 PDB 를 복제해 쓰는 도구다. macOS·Linux·Windows 공용이며 node 와 컨테이너 CLI(podman, 없으면 docker)만 있으면 된다. SQL 은 컨테이너 안의 sqlplus 로 실행하므로 Oracle 클라이언트가 필요 없다.

```
node scripts/oracle/pdb.mjs <명령>      # 어디서든
scripts/oracle/pdb.sh <명령>            # macOS·Linux
scripts\oracle\pdb.cmd <명령>           # Windows
```

| 명령 | 설명 |
|---|---|
| `list` | PDB 목록·열린 수 |
| `url <PDB> [사용자]` | JDBC URL 출력 |
| `template-create <TPL_이름>` | 시드에서 빈 템플릿 생성 + 운영 이름 사용자 13명 생성 |
| `template-seal <TPL_이름>` | 복제 원본으로 봉인(닫아 둠) |
| `template-unseal <TPL_이름>` | 수정하려고 READ WRITE 로 열기(수정 뒤 다시 seal) |
| `template-schema [TPL_SCHEMA] [--rebuild]` | 시드에서 새로 만들어 **dev 에 있는 모든 모듈의 Oracle V 파일**을 스키마 주인으로 순서대로 적용하고(`flyway_schema_history` 도 맞춘다) 봉인한 데이터 없는 템플릿. 레인·시험 PDB 의 기본 원본 |
| `template-data [TPL_DATA] [--from TPL_SCHEMA] [--rebuild]` | `TPL_SCHEMA` 를 복제해 `db-snapshot/` CSV 를 적재(`snapshot.py import`)하고 봉인한 템플릿 |
| `clone <TPL_이름> <PDB>` | 템플릿에서 복제하고 열기 |
| `open` · `close <PDB>` | 열기·닫기 |
| `drop <PDB>` | 닫고 데이터 파일까지 삭제 |
| `users <PDB>` | 운영 이름 사용자 (재)생성 |
| `quiet <PDB>` | 열린 PDB 의 autotask(통계·공간·SQL 튜닝)와 AWR 자동 스냅숏을 끄고 확인. `template-create`·`clone` 은 자동으로 거친다 |
| `sessions <PDB>` | 열린 PDB 의 세션 수(max·limit·cur) 한 줄. 시험 하니스가 끝에 로그로 남긴다 |
| `repair <PDB> [--dry-run]` | 바뀐 V 파일의 체크섬만 각 스키마 `flyway_schema_history` 에 맞춘다(버전·파일 이름이 같고 체크섬만 다른 성공 행만. 다른 행·실패 행 무변경). 컬럼 순서를 다시 배열한 V1 을 기존 DB 에 받아들일 때 쓴다(`docs/db-column-order/runbook.md`). 봉인된 템플릿은 `template-unseal` 먼저 |
| `migrate <PDB> [--dry-run] [--exclude <글자>]` | 이력에 없는 V 파일을 스키마마다 버전 순으로 적용하고 이력 행을 더한다(앱 기동 없이 반영). 이력 최고 버전보다 낮은 새 파일(out-of-order)은 멈춘다. `--exclude` = 파일 이름에 그 글자가 든 V 파일을 이번에는 건너뜀 |
| `schema-users` | 만드는 사용자 목록 |
| `lock-hold [--wait-sec N]` | CDB 잠금을 쥐고 `LOCKED <pid>` 를 낸 뒤 표준 입력이 닫힐 때까지 유지(e2e 무거운 적재·옛 하니스용) |
| `seat-hold [--wait-sec N] [--pdb PDB]` | 시험 자리 하나를 쥐고 `SEATED <pid> <번호>` 를 낸 뒤 표준 입력이 닫힐 때까지 유지(시험 하니스용). `--pdb` = 기존 PDB 모드의 PDB 사용 잠금도 쥔다 |
| `seat-held` | `DMES_ORA_SEAT_HELD` 가 가리키는 자리가 유효하면 `SEAT <번호>`·exit 0 |
| `seats` | CDB 잠금·시험 자리 주인 보기(Oracle 접속 없음) |

## 이름 규칙

| 접두 | 용도 | 예 |
|---|---|---|
| `TPL_<태그>` | 템플릿. `TPL_EMPTY` = 마이그레이션만 한 빈 것, `TPL_DATA` = 데이터까지 적재한 것 | `TPL_EMPTY` |
| `L_<레인>` | 레인 개발·E2E 용(상주시키지 않는다) | `L_ORA_MDM` |
| `T_<레인>_<자리>` | 레인 자동 시험용(Gradle 이 복제·삭제, 자리 번호는 시험 자리) | `T_ORA_BASE_1` |

도구는 이 세 접두의 PDB 만 만들고 지운다. `FREEPDB1`·`PDB$SEED` 와 조정자 데이터는 건드리지 않는다. 서비스 이름은 PDB 이름이고 접속은 `jdbc:oracle:thin:@//localhost:1521/<PDB>`, 사용자 비밀번호는 `dmes_password_123`(env `DMES_ORA_PASSWORD`)이다. 사용자 목록·소유 앱은 `docs/oracle-1007/schema-owners.md`.

## 운용 규칙(VM 3GB)

- 동시에 열린 PDB 는 기본 **4개 이하**(FREEPDB1 + 레인 PDB 1 + 시험 PDB 2, 복제 중 템플릿은 시험 PDB 자리를 잠깐 씀). 도구가 강제하고 넘기면 자리가 날 때까지 기다린다(`DMES_ORA_MAX_OPEN`). 기본값은 2026-10-12 에 3 → 4 로 올렸다: 시험 자리 2개를 쓰려면 필요하고, 컨테이너 3GB 에서 4개 열림을 실측했다(`docs/reports/2026-10-12-oracle-test-seats-trial.md`). VM 2GB 에서는 4개째에 인스턴스가 내려갔으므로(`docs/oracle-1007/spike.md`) 2GB PC 는 `DMES_ORA_MAX_OPEN=3`·`DMES_ORA_TEST_SEATS=1` 로 둔다.
- 잠금은 두 가지다(2026-10-12 잠금 세분화, 시험 결과 `docs/reports/2026-10-12-oracle-test-seats-trial.md`).
  - **CDB 잠금** `$TMPDIR/dmes-ora-pdb.lock`: 복제·열기·삭제·`template-*`·`repair`·`migrate` 등 CDB 단위 작업은 PC 전체에서 한 번에 하나, 짧게 쥔다. `close`·`template-seal` 은 잠금을 잡지 않고 바로 실행한다(열린 PDB 와 메모리를 줄이는 쪽이라 시험과 겹쳐도 안전하다).
  - **시험 자리** `$TMPDIR/dmes-ora-seat-<i>.lock`(i = 1..`DMES_ORA_TEST_SEATS`, 기본 2): Gradle 시험 하니스(`-Pdmes.ora.test=clone` 또는 `-Pdmes.ora.pdb=…`)는 복제 직전부터 빌드가 끝나 PDB 를 지울 때까지(시험 JVM 이 도는 구간 포함) 자리 하나를 `seat-hold` 로 쥐고, 복제·삭제 때만 CDB 잠금을 잠깐 잡는다. 그래서 PC 전체에서 Oracle 시험 빌드가 자리 수만큼 함께 돈다. `DMES_ORA_TEST_SEATS=1` 이면 옛 동작(한 번에 하나)과 같다. 같은 PC 의 모든 호출이 같은 값을 써야 상한이 맞는다.
  - 시험 PDB 이름은 `T_<레인>_<자리 번호>` 다. 같은 워크트리에서 두 빌드를 함께 돌려도 PDB 가 겹치지 않는다. 기존 PDB 모드(`-Pdmes.ora.pdb`)는 자리에 더해 그 PDB 의 사용 잠금(`dmes-ora-use-<PDB>.lock`)을 쥔다.
  - 잡는 순서는 늘 자리 → (사용 잠금) → CDB 잠금이다. CDB 잠금을 쥔 채 자리를 기다리지 않는다. 열린 PDB 자리(`DMES_ORA_MAX_OPEN`)도 CDB 잠금 밖에서 기다린다(잠금을 쥔 채 기다리면 PDB 를 지우려는 다른 시험 빌드와 서로 멈춘다).
  - **자리 수 ≤ `DMES_ORA_MAX_OPEN` − 늘 열려 있는 PDB 수**여야 한다(기본 4 − `FREEPDB1`·`L_MAIN` 2 = 2). 넘으면 두 번째 빌드의 복제가 열린 PDB 자리를 기다리고, 그동안 heavy 슬롯·시험 자리를 놀린 채 쥔다(실패하지는 않고 사실상 직렬). 레인 PDB 를 더 열어 두거나 상한을 낮춘 PC 는 `DMES_ORA_TEST_SEATS` 도 낮춘다.
  - 기다리는 한도는 env `DMES_ORA_HARNESS_LOCK_WAIT_SEC`(기본 7200초). 주인 보기: `node scripts/oracle/pdb.mjs seats`.
  - 상위가 넘기는 값: heavy 는 자리를 잡아 `DMES_ORA_SEAT_HELD=<pid>` 로 넘기고(하니스가 그 자리를 쓴다), 옛 상위가 `DMES_ORA_LOCK_HELD=<pid>` 로 CDB 잠금을 넘기면 하니스는 자리 없이 그 잠금을 쓴다(옛 동작).
- `pdb.mjs` 는 SIGTERM·SIGINT 를 받으면 자식 `podman exec` 를 먼저 끊고 잠금을 놓고 나가며, sqlplus 한 번은 `DMES_ORA_SQL_TIMEOUT_SEC`(기본 1200초)를 넘기면 끊는다.
- Oracle 시험(gradle)은 `heavy.sh` 슬롯도 거친다. 슬롯이 차 있으면 기본 90초 뒤 exit 75(`HEAVY_BUSY`)로 끝나므로 **`DFLOW_HEAVY_WAIT=1800`** 으로 걸어 차례를 기다린다.
- 시험 PDB 는 복제 → 시험 → 즉시 삭제. 레인 개발 PDB 는 쓸 때만 열고 끝나면 `close`.
- 인스턴스 메모리(2026-10-12): Free 상한 SGA+PGA 2GB 안에서 `sga_target=900M`·`pga_aggregate_target=600M`(400M 에서 올림, spfile)·`pga_aggregate_limit=2G`(기본값).

## 레인 PDB 는 쓰는 동안만 OPEN

- 열린 PDB 슬롯은 PC 전체가 나눠 쓴다. 레인 PDB(`L_<레인>`)는 시험·적재·서버 확인을 **실제로 돌리는 동안만** `open` 하고 끝나면 바로 `close` 한다(`drop` 이 아니다: 데이터는 남는다).
- 슬롯이 없으면 `open`·`clone` 이 자리가 날 때까지 기다린다. 오래 기다리게 하지 않도록 쓰고 나면 닫는다.

## 템플릿 만들기

권장: 모듈 V 파일이 dev 에 머지된 뒤 한 번에 만든다.

```
node scripts/oracle/pdb.mjs template-schema TPL_SCHEMA         # 전 모듈 V1 적용, 데이터 없음
node scripts/oracle/pdb.mjs template-data TPL_DATA             # + db-snapshot CSV 적재(python3 + pip install oracledb)
node scripts/oracle/pdb.mjs clone TPL_DATA L_ORA_MDM           # 레인 PDB
```

모듈 V1 이 새로 머지되면 `--rebuild` 로 다시 만든다. V 파일 위치는 `src/backend/**/db/migration/**/oracle/**/V*.sql` 이고 스키마는 폴더 이름(`mcmapuser` 등) 또는 모듈(mdm→`MDMAPUSER`)로 정한다(스키마가 하나뿐인 모듈은 하위 폴더 없이 `db/migration/mdm/oracle/V1__baseline.sql` 처럼 둔다). 마이그레이션 자리표시자 `${app_user}` 는 `MCMAPUSER` 로 치환한다.

### 사용자만 있는 빈 템플릿(처음 한 번)

```
node scripts/oracle/pdb.mjs template-create TPL_EMPTY
# Flyway 로 각 스키마 사용자에 V1~ 을 적용한다(접속: jdbc:oracle:thin:@//localhost:1521/TPL_EMPTY, 사용자 = 스키마 주인)
node scripts/oracle/pdb.mjs template-seal TPL_EMPTY
node scripts/oracle/pdb.mjs clone TPL_EMPTY L_ORA_MDM    # 레인 PDB
```

## Gradle 시험 하니스

`-Pdmes.ora.test=clone`(또는 env `DMES_ORA_TEST=clone`)이면 빌드 한 번에 한 번 `-Pdmes.ora.template`(기본 `TPL_EMPTY`)에서 `T_<레인>_<자리>` PDB 를 복제하고 빌드가 끝나면 지운다. 있는 PDB 를 그대로 쓰려면 `-Pdmes.ora.pdb=<일회용 T_* PDB>`(시험이 표를 비우므로 레인 `L_*`·`TPL_*`·`FREEPDB1` 에는 걸지 않는다. mdm 시험 가드는 `L_`·`TPL_` 지정을 거부한다). 켜면 Test 는 forks=1 이고 접속 수를 줄이는 기본값(`spring.datasource.hikari.maximum-pool-size=2`·`minimum-idle=0`·`idle-timeout=10000`·`spring.test.context.cache.maxSize=2`, 다중 데이터소스 모듈은 `cactus.datasource.extras.<cmn|if|caravan>`·`spring.datasource.<mst|if>` 접두 키도 같은 값)이 시스템 속성으로 들어가며(끄려면 `-Pdmes.ora.poolExtras=none`. 단 `spring.properties` 가 있는 모듈(mdm/api 등)은 Spring 이 그 파일을 시스템 속성보다 먼저 읽어 `spring.test.context.cache.maxSize` 시스템 속성이 무시되고 그 파일의 값이 적용된다), 시험이 끝나면 시험 PDB 의 세션 수를 `[dmes-ora] … sessions max=…` 한 줄로 남긴다. 접속값은 시스템 속성 `dmes.ora.url`·`dmes.ora.password`·`dmes.ora.pdb` 와 env `DMES_ORA_URL`·`DMES_ORA_PASSWORD`·`DMES_ORA_PDB`·`SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=2` 가 넘어간다. 기본(꺼짐)은 종전 동작 그대로다(구현: `src/backend/build-logic`).

### 여러 모듈을 한 빌드에서 시험할 때(교착 수정, 2026-10-07)

`src/backend` 루트에서 여러 모듈의 `test` 를 한 번에 걸면(`--continue` 포함) 모듈마다 included build 라 Gradle 이 하니스 서비스를 따로 만든다. 예전 하니스는 서비스마다 `lock-hold` 를 잡아, 먼저 잡은 쪽이 빌드가 끝날 때까지 쥐고 나머지가 7200초 기다리는 교착이 났다(시험 슬롯 2칸도 함께 묶임, 21:12 사례). 지금은 같은 Gradle JVM 안에서 **처음 부른 서비스가 잠금·PDB 를 하나만 만들고 나머지는 같은 값을 쓴다**(로그에 「같은 빌드의 시험 PDB … 를 함께 쓴다」). 또 PC Oracle 잠금을 시험 슬롯보다 먼저 잡는다(슬롯을 쥔 채 잠금을 기다리지 않게).

- 이 수정(①d)이 들어오기 전 브랜치에서는 **여러 모듈의 Oracle 시험을 모듈별로 따로 건다**(모듈 폴더에서 한 번에 하나). 수정 전 판과 수정 후 판이 같은 PC 에서 동시에 돌면 슬롯·잠금 순서가 달라 서로 붙잡을 수 있으니(슬롯 대기 한도 30분 뒤 풀림) dev 를 합쳐 판을 맞춘다. 이 규칙은 ①d 이전 브랜치에만 해당한다.
- 한 빌드 안에서 준비가 한 번 실패하면(복제 실패·lock-hold 가 도중에 끝남 등) 같은 빌드의 나머지 모듈도 곧바로 실패한다(모듈마다 복제를 되풀이하지 않게). 모든 모듈이 같은 `-Pdmes.ora.*` 설정을 써야 PDB 를 함께 쓴다.
- **같은 빌드의 모듈은 시험 PDB 를 겹쳐 쓰지 않는다(①e, 2026-10-07)**: Oracle 을 쓰는 test 태스크는 JVM 안에서 공유하는 「차례」를 받은 쪽만 돌아, `--parallel` 이어도 모듈 사이에서 직렬이다. 모듈 시험 틀이 클래스 시작 때 스키마를 Flyway clean 하므로 예전에는 `:mcm-core:test` 와 `:mcm:api:test` 를 한 실행에 묶으면 서로 표를 지워 oracheck 21건이 `ORA-00942` 로 실패했다. 순서는 차례 → PC 시험 자리 → 시험 슬롯이다(복제·삭제 때만 CDB 잠금을 잠깐 잡는다). 차례는 한 빌드 안의 직렬화, 시험 자리는 빌드 사이의 동시 실행 상한이다. 로그의 `[dmes-ora] 같은 빌드의 다른 Oracle 시험이 끝나기를 기다린다` 는 정상이다(대기 한도 `DMES_ORA_TURN_WAIT_MS`, 기본 10분, 넘으면 빌드 실패 — 쥔 쪽 태스크가 이미 끝났는데도 멈췄다면 `gradlew --stop` 으로 데몬을 내리고 다시 실행한다). 이 수정이 들어오기 전 브랜치에서는 같은 스키마를 쓰는 모듈(mcm-core·mcm 등)의 Oracle 시험을 **따로 건다**(모듈 폴더에서 한 번에 하나).
- 회귀 시험(Oracle 접속 없음): `bash src/backend/build-logic/tests/run.sh` — included build 3개가 서비스를 따로 만들어도 잠금·PDB 를 하나만 쓰고 probe 구간(시험 차례)이 겹치지 않는지 본다. `.claude/skills/dflow-dev/scripts/heavy.sh` 를 거쳐 돌린다.

### 시험 코드에서 직접 만드는 풀

하니스의 접속 수 기본값은 **Spring 이 만드는 풀에만** 듣는다. 시험 코드가 `new HikariDataSource()` 나 `HikariConfig` 로 직접 만드는 풀은 기본값(최대 10·유휴 10)이라 시험마다 새로 열고 닫지 않으면 VM 안 접속이 수십 개로 늘어 인스턴스가 스래싱한다(oracle-1007 19:52 사례).

- 시험 코드가 직접 만드는 풀은 **최대 3·유휴 0**(`setMaximumPoolSize(3)`·`setMinimumIdle(0)`)으로 둔다.
- 풀은 `@AfterEach`(또는 클래스 단위면 `@AfterAll`)에서 **반드시 닫는다**.
- Spring 컨텍스트가 시험 클래스마다 달라지지 않게 설정을 맞춘다(컨텍스트 캐시 최대 2).

## 환경 변수

`DMES_ORA_ENGINE`(podman|docker)·`DMES_ORA_CONTAINER`·`DMES_ORA_SYS_PASSWORD`·`DMES_ORA_PASSWORD`·`DMES_ORA_HOST`·`DMES_ORA_PORT`·`DMES_ORA_DATA_DIR`·`DMES_ORA_MAX_OPEN`·`DMES_ORA_LOCK_WAIT_SEC`·`DMES_ORA_ROOM_WAIT_SEC`(열린 PDB 자리 대기, 기본 600초)·`DMES_ORA_SQL_TIMEOUT_SEC`·`DMES_ORA_HARNESS_LOCK_WAIT_SEC`·`DMES_ORA_TEST_SEATS`(시험 자리 수, 기본 2)·`DMES_ORA_POOL_EXTRAS`(= `-Pdmes.ora.poolExtras`).

## Oracle 오류 판별(VM 때문인가, 코드 때문인가)

로컬 인스턴스는 Podman VM 3GB·SGA 900M 이다(2GB 에서는 세 번 스래싱했다). 부하가 겹치면 여전히 느려질 수 있다. Oracle 시험 실패·접속 실패·시간 초과가 나면 **다시 돌리기 전에** VM 상태를 한 번 잰다(Oracle 명령이 아니다).

```bash
podman machine ssh -- 'free -m; cat /proc/loadavg'
```

시험 하니스는 Oracle 시험이 실패하거나 PDB 준비가 실패했을 때 같은 값을 `[dmes-ora] … VM available=…MB load=…` 한 줄로 로그에 남기고, 아래 VM 신호면 「VM 의심」 을 붙인다. 보고에는 오류 번호와 VM 값(available MB·load)을 함께 적는다.

| 구분 | 신호 | 처리 |
|---|---|---|
| VM 의심 | available **150MB 미만**, load **10 이상**, ORA-04031·04030·00020·00018·12516·12519·12520·3136·609·12751·00800·01092·00822, JDBC 접속·읽기 시간 초과 | **재실행하지 않고** 조정자에게 「VM 의심」 으로 보고한다 |
| 코드 | ORA-00942·00904·00001·01400·12899·00933 같은 SQL·제약 오류 | 평소대로 레인이 고친다 |

경고 로그(alert log)에 `Time drifted`·ORA-3136·ORA-609·ORA-12751·ORA-00800 이 쌓였으면 그 시각은 스래싱 구간이다.
