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
| `schema-users` | 만드는 사용자 목록 |
| `lock-hold [--wait-sec N]` | PC 잠금을 쥐고 `LOCKED <pid>` 를 낸 뒤 표준 입력이 닫힐 때까지 유지(시험 하니스용) |

## 이름 규칙

| 접두 | 용도 | 예 |
|---|---|---|
| `TPL_<태그>` | 템플릿. `TPL_EMPTY` = 마이그레이션만 한 빈 것, `TPL_DATA` = 데이터까지 적재한 것 | `TPL_EMPTY` |
| `L_<레인>` | 레인 개발·E2E 용(상주시키지 않는다) | `L_ORA_MDM` |
| `T_<레인>` | 레인 자동 시험용(Gradle 이 복제·삭제) | `T_ORA_BASE` |

도구는 이 세 접두의 PDB 만 만들고 지운다. `FREEPDB1`·`PDB$SEED` 와 조정자 데이터는 건드리지 않는다. 서비스 이름은 PDB 이름이고 접속은 `jdbc:oracle:thin:@//localhost:1521/<PDB>`, 사용자 비밀번호는 `dmes_password_123`(env `DMES_ORA_PASSWORD`)이다. 사용자 목록·소유 앱은 `docs/oracle-1007/schema-owners.md`.

## 운용 규칙(VM 2GB)

- 동시에 열린 PDB 는 **3개 이하**(FREEPDB1 + 템플릿 1 + 작업 1). 도구가 강제하고 넘기면 자리가 날 때까지 기다린다(`DMES_ORA_MAX_OPEN` 로 바꿀 수 있지만 VM 2GB 에서는 올리지 않는다. 4개째에서 인스턴스가 내려갔다: `docs/oracle-1007/spike.md`).
- 복제·열기·삭제는 PC 전체에서 한 번에 하나(`$TMPDIR/dmes-ora-pdb.lock`). `close` 는 잠금을 잡지 않고 바로 실행한다(열린 PDB 와 메모리를 줄이는 쪽이라 시험과 겹쳐도 안전하다).
- Gradle 시험 하니스(`-Pdmes.ora.test=clone` 또는 `-Pdmes.ora.pdb=…`)는 복제 직전부터 빌드가 끝나 PDB 를 지울 때까지(시험 JVM 이 도는 구간 포함) 이 PC 잠금을 `lock-hold` 로 쥔다. 그래서 PC 전체에서 Oracle 을 쓰는 시험 빌드는 한 번에 하나만 돈다. 기다리는 한도는 env `DMES_ORA_HARNESS_LOCK_WAIT_SEC`(기본 7200초).
- `pdb.mjs` 는 SIGTERM·SIGINT 를 받으면 자식 `podman exec` 를 먼저 끊고 잠금을 놓고 나가며, sqlplus 한 번은 `DMES_ORA_SQL_TIMEOUT_SEC`(기본 1200초)를 넘기면 끊는다.
- 시험 PDB 는 복제 → 시험 → 즉시 삭제. 레인 개발 PDB 는 쓸 때만 열고 끝나면 `close`.

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

모듈 V1 이 새로 머지되면 `--rebuild` 로 다시 만든다. V 파일 위치는 `src/backend/**/db/migration/**/oracle/**/V*.sql` 이고 스키마는 폴더 이름(`mcmapuser` 등) 또는 모듈(mdm→`MDMAPUSER`)로 정한다. 마이그레이션 자리표시자 `${app_user}` 는 `MCMAPUSER` 로 치환한다.

### 사용자만 있는 빈 템플릿(처음 한 번)

```
node scripts/oracle/pdb.mjs template-create TPL_EMPTY
# Flyway 로 각 스키마 사용자에 V1~ 을 적용한다(접속: jdbc:oracle:thin:@//localhost:1521/TPL_EMPTY, 사용자 = 스키마 주인)
node scripts/oracle/pdb.mjs template-seal TPL_EMPTY
node scripts/oracle/pdb.mjs clone TPL_EMPTY L_ORA_MDM    # 레인 PDB
```

## Gradle 시험 하니스

`-Pdmes.ora.test=clone`(또는 env `DMES_ORA_TEST=clone`)이면 빌드 한 번에 한 번 `-Pdmes.ora.template`(기본 `TPL_EMPTY`)에서 `T_<레인>` PDB 를 복제하고 빌드가 끝나면 지운다. 있는 PDB 를 그대로 쓰려면 `-Pdmes.ora.pdb=L_ORA_MDM`. 켜면 Test 는 forks=1 이고 접속 수를 줄이는 기본값(`spring.datasource.hikari.maximum-pool-size=2`·`minimum-idle=0`·`idle-timeout=10000`·`spring.test.context.cache.maxSize=2`, 다중 데이터소스 모듈은 `cactus.datasource.extras.<cmn|if|caravan>`·`spring.datasource.<mst|if>` 접두 키도 같은 값)이 시스템 속성으로 들어가며(끄려면 `-Pdmes.ora.poolExtras=none`), 시험이 끝나면 시험 PDB 의 세션 수를 `[dmes-ora] … sessions max=…` 한 줄로 남긴다. 접속값은 시스템 속성 `dmes.ora.url`·`dmes.ora.password`·`dmes.ora.pdb` 와 env `DMES_ORA_URL`·`DMES_ORA_PASSWORD`·`DMES_ORA_PDB`·`SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=3` 이 넘어간다. 기본(꺼짐)은 종전 동작 그대로다(구현: `src/backend/build-logic`).

### 시험 코드에서 직접 만드는 풀

하니스의 접속 수 기본값은 **Spring 이 만드는 풀에만** 듣는다. 시험 코드가 `new HikariDataSource()` 나 `HikariConfig` 로 직접 만드는 풀은 기본값(최대 10·유휴 10)이라 시험마다 새로 열고 닫지 않으면 VM 안 접속이 수십 개로 늘어 인스턴스가 스래싱한다(oracle-1007 19:52 사례).

- 시험 코드가 직접 만드는 풀은 **최대 3·유휴 0**(`setMaximumPoolSize(3)`·`setMinimumIdle(0)`)으로 둔다.
- 풀은 `@AfterEach`(또는 클래스 단위면 `@AfterAll`)에서 **반드시 닫는다**.
- Spring 컨텍스트가 시험 클래스마다 달라지지 않게 설정을 맞춘다(컨텍스트 캐시 최대 2).

## 환경 변수

`DMES_ORA_ENGINE`(podman|docker)·`DMES_ORA_CONTAINER`·`DMES_ORA_SYS_PASSWORD`·`DMES_ORA_PASSWORD`·`DMES_ORA_HOST`·`DMES_ORA_PORT`·`DMES_ORA_DATA_DIR`·`DMES_ORA_MAX_OPEN`·`DMES_ORA_LOCK_WAIT_SEC`·`DMES_ORA_SQL_TIMEOUT_SEC`·`DMES_ORA_HARNESS_LOCK_WAIT_SEC`·`DMES_ORA_POOL_EXTRAS`(= `-Pdmes.ora.poolExtras`).

## Oracle 오류 판별(VM 때문인가, 코드 때문인가)

로컬 인스턴스는 Podman VM 2GB·SGA 900M 이라 부하가 겹치면 스래싱한다. Oracle 시험 실패·접속 실패·시간 초과가 나면 **다시 돌리기 전에** VM 상태를 한 번 잰다(Oracle 명령이 아니다).

```bash
podman machine ssh -- 'free -m; cat /proc/loadavg'
```

시험 하니스는 Oracle 시험이 실패하거나 PDB 준비가 실패했을 때 같은 값을 `[dmes-ora] … VM available=…MB load=…` 한 줄로 로그에 남기고, 아래 VM 신호면 「VM 의심」 을 붙인다. 보고에는 오류 번호와 VM 값(available MB·load)을 함께 적는다.

| 구분 | 신호 | 처리 |
|---|---|---|
| VM 의심 | available **150MB 미만**, load **10 이상**, ORA-04031·04030·00020·00018·12516·12519·12520·3136·609·12751·00800·01092·00822, JDBC 접속·읽기 시간 초과 | **재실행하지 않고** 조정자에게 「VM 의심」 으로 보고한다 |
| 코드 | ORA-00942·00904·00001·01400·12899·00933 같은 SQL·제약 오류 | 평소대로 레인이 고친다 |

경고 로그(alert log)에 `Time drifted`·ORA-3136·ORA-609·ORA-12751·ORA-00800 이 쌓였으면 그 시각은 스래싱 구간이다.
