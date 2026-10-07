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
| 커넥션 풀 | Hikari `maximum-pool-size` **3 이하**(인스턴스를 모든 레인이 공유한다) |
| 운영 JNDI | `java:/jdbc/<모듈>/dsBiz` 같은 중립 이름을 기본값으로 두고 env 로 덮어쓴다 |

### 3.1 일시 칸 설정(레인 공통 결정)

감사 칸(`C_AT`·`U_AT`, cactus-core `CactusAuditEntity` 의 `Instant`)은 `TIMESTAMP(6)` 에 **UTC** 로 저장한다. 각 앱 설정에 아래 둘을 함께 둔다(b0 에서 이 조합으로 `OracleDialect` validate 가 통과함을 확인했다).

```yaml
spring.jpa.properties.hibernate.type.preferred_instant_jdbc_type: TIMESTAMP
spring.jpa.properties.hibernate.jdbc.time_zone: UTC
```

업무 일시(감사 아닌 것)는 변환하지 않는다.

### 3.2 운용 규칙(Podman VM 2GB 기준, 사용자 결정)

Podman VM 은 2GB 그대로 쓴다. b0 실측에서 **동시에 열린 PDB 가 4개가 되자 인스턴스가 종료**됐다(`docs/oracle-1007/spike.md` §0). 그래서 아래를 지킨다.

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
