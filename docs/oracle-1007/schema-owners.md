# 스키마 소유표와 연결 규약 (oracle-1007, b3)

개발·테스트·운영이 같은 스키마 이름을 쓴다. SQL 의 스키마 접두(`MCMAPUSER.` 등)는 그대로 유지하고, 로컬 Oracle 에도 같은 이름의 사용자를 만든다. 스키마 하나에는 **Flyway 주인 앱이 하나**만 있고, 나머지 앱은 `spring.jpa.hibernate.ddl-auto` 를 `none` 또는 `validate` 로 둔다.

## 1. 스키마 소유표

| 스키마(Oracle 사용자) | Flyway 주인 | 비고 |
|---|---|---|
| `MCMAPUSER` | mcm-core | 접두를 쓰는 SQL 이 가장 많다(453곳). mcm 앱은 주인이 아니므로 `ddl-auto none/validate` |
| `MCAAPUSER` | mcm-core | |
| `MCM_SOURCE` | mcm-core | 운영 MSSQL 과 같은 코드 원장 3표(`TB_MCM_CODE_MASTER`·`CATEGORY`·`DETAIL`)를 가진다. `MCMAPUSER` 에도 같은 이름 사본 3표와 `VI_MCM_CODE_ACCESS` 가 있으므로, 로컬 적재기는 3표를 양쪽에 넣는다 |
| `MCM_BACKUP` | mcm-core | `V1` 은 `MASTER`·`CATEGORY` 2표다. 백업 대상이라 로컬 적재기(b5)는 비워 두고, 동기화 관리 화면이 채운다 |
| `CARAVANUSER` | caravan-hub | |
| `IFUSER` | caravan-hub | |
| `EAIUSER` | (없음) | 표 없이 접속만 하는 사용자다. `IFUSER` 의 INBOUND 표에 SELECT·UPDATE, OUTBOUND 표에 INSERT 만 가진다(DELETE 없음). 정확한 표 목록은 `feat/ora-platform` 의 `docs/oracle-1007/memo-ora-platform.md` 에 있고, GRANT 는 caravan-hub 마이그레이션이 부여한다 |
| `MDMAPUSER` | mdm | 운영 이름이 없는 모듈이다. SQL 에 접두가 없으므로 접속 사용자가 곧 스키마 주인이다 |
| `MLSAPUSER` | mls | 위와 같다 |
| `MPPAPUSER` | mpp | 위와 같다 |
| `MQCAPUSER` | mqc | 위와 같다 |
| `MPNAPUSER` | mpn | 위와 같다 |
| `APSAPUSER` | aps-core | 위와 같다 |

- 운영(WildFly)에서는 Flyway 를 계속 끄고 DBA 가 같은 `V` 파일을 적용한다.
- 마이그레이션 `V1` 은 접두 없이 쓰고, 스키마 폴더별 Flyway `defaultSchema`(또는 접속 사용자)로 적용한다.
- **dev 에 머지된 뒤에는 `V1` 을 고치지 않는다.** 머리 주석 한 줄만 바뀌어도 Flyway 체크섬이 달라져 이미 적용한 PDB 에서 validate 가 실패한다. 바꿀 일은 `V2` 이상으로 새로 추가한다. 이미 옛 `V1` 이 적용된 레인 PDB 는 clean 후 다시 적용하거나 템플릿에서 다시 복제한다.
- 로컬 PDB 의 사용자 목록은 이 표의 스키마 전부이며, `scripts/oracle/pdb.sh` 가 만든다.

## 2. 접속 사용자와 권한

- 앱은 자기 스키마 주인 사용자로 접속한다. 다른 스키마의 표는 `스키마.표` 접두로 읽고 쓴다.
- `EAIUSER` 를 뺀 로컬 PDB 의 스키마 사용자 전부에게 `CONNECT`·`RESOURCE`·`UNLIMITED TABLESPACE` 와 다른 스키마 표 접근용 `SELECT·INSERT·UPDATE·DELETE ANY TABLE` 을 준다(운영의 교차 스키마 GRANT 를 간략하게 대신하는 로컬 전용 설정이다).
- 로컬 비밀번호는 모든 사용자가 같다(`dmes_password_123`). 운영 비밀번호는 저장소에 두지 않는다.

## 3. 연결 규약

| 항목 | 규칙 |
|---|---|
| 호스트·포트 | `localhost:1521`(env `DMES_ORA_HOST`·`DMES_ORA_PORT` 로 덮어쓴다) |
| 서비스 이름 | PDB 이름과 같다. 레인 개발용 `L_<레인>`, 시험용 `T_<레인>`, 템플릿 `TPL_EMPTY`·`TPL_DATA`(이름 규칙은 `scripts/oracle/README.md`) |
| JDBC URL | `jdbc:oracle:thin:@//<host>:<port>/<PDB>` |
| 사용자·비밀번호 | `DMES_ORA_USER`·`DMES_ORA_PASSWORD`. 값이 없으면 앱 모듈의 기본 스키마 사용자와 로컬 비밀번호 |
| Spring 속성 | `SPRING_DATASOURCE_URL`·`SPRING_DATASOURCE_USERNAME`·`SPRING_DATASOURCE_PASSWORD` 로도 덮어쓸 수 있다 |
| 시험 시스템 속성 | `-Ddmes.ora.url=…`·`-Ddmes.ora.user=…`·`-Ddmes.ora.password=…`(시험 하니스가 전달한다) |
| 커넥션 풀 | Hikari `maximum-pool-size` **3 이하**(인스턴스를 모든 레인이 공유한다). 시험 하니스는 Spring 풀에 최대 2·유휴 0·idle-timeout 10초와 `spring.test.context.cache.maxSize=2` 를 넣는다. 시험 코드가 직접 만드는 풀은 최대 3·유휴 0 으로 두고 `@AfterEach` 에서 닫는다(`scripts/oracle/README.md`) |
| 운영 JNDI | `java:/jdbc/<모듈>/dsBiz` 같은 중립 이름을 기본값으로 두고 env 로 덮어쓴다 |

### 3.1 일시 칸 설정(레인 공통 결정)

모든 시각은 **KST** 로 통일한다. 처음에는 감사 칸을 UTC 로 저장하기로 했으나 철회했다. `hibernate.jdbc.time_zone=UTC` 가 `LocalDateTime` 칸까지 UTC 로 바꿔 저장해 DB 시계를 쓰는 native SQL·레거시 데이터와 섞이기 때문이다(ora-mcm-core 실측).

1. `hibernate.jdbc.time_zone` 은 넣지 않는다. JVM 기본 시간대(`Asia/Seoul`)를 쓴다.
2. 감사 칸(`C_AT`·`U_AT`, cactus-core `CactusAuditEntity` 의 `Instant`)은 `TIMESTAMP(6)` 로 두고 각 앱 설정에 아래 한 줄을 둔다. 값은 KST 로 저장된다.

   ```yaml
   spring.jpa.properties.hibernate.type.preferred_instant_jdbc_type: TIMESTAMP
   ```

3. JVM 시간대는 `-Duser.timezone=Asia/Seoul` 로 고정한다(KST 통일의 전제다). 로컬에서는 build-logic(`dmes.test-conventions`)이 시험 JVM(`Test`)과 `bootRun` 에 시스템 속성으로 넣고, `be-run.sh` 는 java 직접 기동 옵션에 넣는다(`be-run.cmd`·`be-run.ps1` 은 `bootRun` 을 쓰므로 build-logic 이 적용된다). 운영 WildFly 는 `standalone.conf` 의 `JAVA_OPTS` 에 `-Duser.timezone=Asia/Seoul` 을 추가한다(Windows 는 `standalone.conf.bat`).
4. Oracle 컨테이너 OS 시간대는 `Asia/Seoul` 이다(`tools/oracle-free/docker-compose.yml` 의 `TZ`). `SYSDATE`·`SYSTIMESTAMP` 가 KST 로 나온다.
   `DBTIMEZONE` 은 `+00:00` 으로 남는다. `TIMESTAMP WITH LOCAL TIME ZONE` 을 쓰지 않으므로 영향이 없다(쓰지 않는다).
5. 적재기(b5)는 epoch 밀리초를 KST 로 변환하고, KST 문자열은 그대로 넣는다. 업무 일시(감사 아닌 것)는 변환하지 않는다.

### 3.1.1 공통 Hibernate 설정(앱마다 자기 yml 에 둔다)

이 문서가 공통 기본값의 정본이다. 앱은 엔티티마다 매핑을 바꾸지 않고 설정에서 맞춘다.

```yaml
spring.jpa.properties.hibernate.type.preferred_boolean_jdbc_type: TINYINT   # boolean 칸을 NUMBER(1,0) 로 유지
spring.jpa.properties.hibernate.type.preferred_instant_jdbc_type: TIMESTAMP # Instant 감사 칸(KST 로 저장)
# hibernate.jdbc.time_zone 은 넣지 않는다(JVM 기본 Asia/Seoul)
```

- `preferred_boolean_jdbc_type=TINYINT`: 운영 Oracle 이 23 미만일 수 있어 기준선의 boolean 칸은 `NUMBER(1,0)` + `CHECK (0,1)` 로 둔다. Spring Boot 4.0.6 이 관리하는 Hibernate 7.2.12 의 `OracleDialect` 는 Oracle 전용 legacy boolean 설정이 없어, 이 값이 없으면 23 이상에서 `BOOLEAN` 을 기대해 validate 가 실패한다(b0 에서 `TB_MDM_COLUMN.REQUIRED` 로 확인). 처음에는 `BIT` 로 정했으나 철회했다. 23 이상에서 `BIT` 는 boolean 으로 매핑돼 `NUMBER(1)` 칸 validate 가 실패한다(ora-mcm-core 실측, Hibernate 7.2.12·DB 23 계열). `TINYINT`(·`SMALLINT`·`INTEGER`·`NUMERIC`)는 오류가 0 이라 **23 미만·이상 모두 통하는 값**이다. 이 설정은 ora-mdm·ora-mcm-core 가 각 앱에서 validate 로 확인한다.

#### 확인된 동작과 주의(ora-mdm m3 실측, Hibernate 7.2.12·Oracle 26ai)

- `ddl-auto=validate` 로 mdm 엔티티 전체와 `V1` 이 맞았다(위 `TINYINT`·`TIMESTAMP` 규약 그대로).
- 세션 `NLS_SORT`·`NLS_COMP` 가 `BINARY` 라 `connection-init-sql` 로 따로 맞출 필요가 없다.
- CLOB 4000바이트 초과 네이티브 UPDATE, boolean 왕복, `INSERT … SELECT … FROM DUAL UNION ALL` 은 통과했다.
- **주의: JPQL 에서 `@Lob`(CLOB) 칸에 `UPPER`·`LOWER`·`LIKE` 를 쓰면 `FunctionArgumentException` 이 난다.** 해결은 네이티브 SQL 로 바꾸거나 칸을 `VARCHAR2` 로 두는 것이다(길이가 4000바이트를 넘지 않는 칸이면 `VARCHAR2(4000 CHAR)`). CLOB 칸에 대한 검색 조건을 새로 쓸 때 먼저 확인한다.

### 3.2 운용 규칙(Podman VM 3GB 기준, 사용자 결정)

Podman VM 은 처음 2GB 로 시작했으나 10-07 에 세 번 스래싱해 **3GB(cpus 2)로 올렸다**(사용자 결정). 설정값은 SGA 900M·PGA 목표 400M·`pga_aggregate_limit` 2G 이다(`oracle-26ai-test-guide.md` §8-5). b0 실측(2GB)에서 **동시에 열린 PDB 가 4개가 되자 인스턴스가 종료**됐다(`docs/oracle-1007/spike.md` §0). 3GB 에서도 아래를 지킨다.

1. 동시에 열린 PDB 는 **3개 이하**(FREEPDB1 + 템플릿 1 + 작업 1)다. `scripts/oracle/pdb.mjs` 가 강제하며, 넘기면 자리가 날 때까지 기다린다.
2. **시험 PDB 는 복제 → 시험 → 즉시 삭제**한다. PC 전체에서 동시에 하나만 돈다(도구의 PC 잠금 + `heavy.sh`). Gradle 은 `-Pdmes.ora.test=clone` 으로 이를 자동화한다(빌드 한 번에 한 번 복제, 끝나면 삭제).
3. **레인 개발 PDB(`L_<레인>`)는 상주시키지 않는다.** 쓸 때만 `pdb.mjs open`, 끝나면 `pdb.mjs close`(데이터는 남는다). 오래 쓰지 않으면 `drop` 하고 템플릿에서 다시 복제한다.
4. 템플릿(`TPL_*`)은 평소 닫아 두고 복제 때만 도구가 READ ONLY 로 잠깐 연다.
5. PDB 하나가 디스크를 약 0.8~0.9GB 쓴다(복제는 전체 복사). 쓰지 않는 PDB 는 지운다.
6. 인스턴스 부하를 줄이려고 조정자가 `job_queue_processes=0` 을 적용했다(개발용 로컬 설정: 자동 작업·통계 수집이 멈춘다). 컨테이너를 새로 만들면(`down -v`) 기본값으로 돌아가므로 같은 설정을 다시 적용한다.

## 4. 주인이 아닌 앱의 설정

- `spring.jpa.hibernate.ddl-auto`: `none`(기본) 또는 `validate`(시험에서 엔티티와 표를 대조할 때).
- `spring.flyway.enabled`: `false`. 앱이 주인 스키마만 마이그레이션한다.
- 적재기(`scripts/db-snapshot`, b5)는 Flyway 가 만든 표에 데이터만 넣는다.
