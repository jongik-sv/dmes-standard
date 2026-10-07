# ora-platform 레인 정본 메모

- 레인: ora-platform / 브랜치 `feat/ora-platform` / 워크트리 `/Users/jji/project/dmes-wt/ora-platform` (기준 dev b7c91cd6e)
- 조정 세션: dmes-standard-d8 (지시 ora-platform-1, 정본 지시문 `/Users/jji/.coord/oracle-1007/lanes/ora-platform/brief.md`)

## 지금 상태 (2026-10-07 19:20, 조정 compact 직전)

브랜치 HEAD `57ede574d`(dev 머지①b fb253556d 포함). 작업 트리 깨끗, 남은 백그라운드 0, Oracle 에 남긴 PDB 없음(시험 PDB `T_ORA_PLATFORM` 은 하니스가 삭제).

| 항목 | 상태 | 비고 |
|---|---|---|
| p1 caravan 기준선 | **완료·시험 통과** | `caravan-hub/src/main/resources/db/migration/{caravanuser,ifuser}`. `HubOracleBaselineTest` 2건 통과(Flyway 적용·표 5개, 4000자 초과 CLOB 을 String 으로 읽기, 읽은 U_AT 로 낙관락 갱신 1행) |
| p3 샘플 모듈 | 코드 완료·**기동 시험 미실행** | SQL archive 이동, yml(DMES_ORA_*·Hikari 3·Instant TIMESTAMP·boolean TINYINT), lib build.gradle(sqlite·community dialects 제거), MlsTestDb. 컴파일 통과. mls·mpp·mqc·mpn Spring 기동·Flyway 확인은 아직 안 함 |
| p2 caravan-hub·console·core | 코드 완료·hub 시험 통과 | HubFlywayConfig(CARAVANUSER 항상·IFUSER 로컬 전용), yml 6종, InterfaceMapper CLOB resultMap, TiberoDialectResolver·KafkaJpaConfig, 빈 값 검증(groupId·호스트 이름·URL). hub 앱 실기동(bootRun)은 안 함 |
| p5 H2 시험 | **진행 중: 시험 통과 못 함** | caravan-core h2 제거(완료). oasis-core 시험 16개를 `OracleTestDatabase` 로 전환. 아래 「oasis 시험 진행」 참조 |
| 리뷰 | p1·p3 초안 opus 리뷰 반영 완료, p2·p3·p5 코드 opus 리뷰 반영 완료 | 반영 안 한 지적 2건은 아래 「결정」 |
| p4 cactus-core SQLite 제거 | 대기 | ora-mdm·mcm 머지②·③ 뒤. `DialectDetector`·`LocalSqliteDataSource`·`SqliteColumnConverter`·`OasisCommitFailureSqliteTest`·`DialectDetectorTest` 제거 또는 archive, `DmomMapper.xml:65,70` 의 `NEXT VALUE FOR MCMAPUSER.SEQ_MCM_MOM_TC_ERROR` 를 `.NEXTVAL` 로 |
| p6 전체 시험·머지 요청(④) | 대기 | heavy.sh 경유 한 번, 머지②·③ 뒤 |

### oasis 시험 진행 (p5)
- 1차(병렬 켜짐): 618건 중 10건 실패 뒤 `SqlScriptProcessTaskTest` 에서 멈춤. 원인: junit-platform.properties 의 병렬 실행으로 같은 스키마 표가 서로 지워짐, `Integer` 캐스트(`MixDataAccessTechTest`·`PreStructuredMessageSendTaskServiceTest`).
- 2차(병렬 끔·캐스트 수정·연결 정리 리스너): 실패 1건(`PreStructuredMessageSendTaskServiceTest.service_having_SendTask_with_sql_task_result_binding_values_returns_bind_message`, 143행 `preStructuredMessageElements()).hasSize(count)`)과 `SpringTransactionHandlerTest.cleanup` 의 `DROP TABLE` 무한 대기(시험 JVM 이 같은 시험의 미완료 트랜잭션 행 잠금을 기다림)로 20분 정체 → 내 트리 TERM.
- 수정(57ede574d, **재시험 전**): `OracleTestDatabase.create`·`dropTables` 가 먼저 열린 연결을 롤백해 닫고, DDL 에 `ddl_lock_timeout=10`, `OracleConnectionCleaner`(TestExecutionListener)가 시험 클래스가 끝날 때마다 연결 정리.
- 남은 확인: 3차 실행(`cd src/backend/cactus-core && DMES_ORA_TEST=clone sh ../gradlew :oasis-core:test --offline --console=plain > 파일`, 출력은 파일로 받고 `grep ' FAILED$'` 로만 읽는다). 시험은 `dmes.ora.url` 이 필요해 cactus-core 합성 빌드에서만 돈다(oasis 단독 빌드는 시작 불가, 의도).
- `PreStructuredMessageSendTaskServiceTest` 143행 실패는 `sendTaskWithSqlScript.bpmn` 의 SQL 별칭(`firstName as name`) 결과 칸 이름 대소문자나 `initData.sql` 변환(`TO_TIMESTAMP`)과 관련 가능성. 3차에서도 실패하면 결과 맵 키를 출력해 확인한다.

### 이번 세션에서 확인한 운용 교훈
- 로그를 raw 로 `tail` 하지 않는다(gradle 진행바가 컨텍스트를 채운다). `--console=plain` 과 파일 출력, `grep -a` 필터를 쓴다.
- 시험 JVM 이 멈추면 `jstack <pid>` 로 멈춘 프레임(`dropTables` 등)을 먼저 본다.
- PDB 도구가 PC 잠금 대기열에 있을 때 `pdb.mjs` 를 TERM 하면 자식 `podman exec sqlplus` 가 고아로 남는다(dev fb253556d 이후 도구가 정리하지만 직접 끊지 않는다).

## 결정·가정

- 초안은 classpath 밖(`docs/oracle-1007/draft/`)에 둔다. 머지① 뒤 각 모듈 `db/migration/<모듈>/` 로 옮기고 SQLite 판은 `archive/` 로 `git mv` 한다(삭제 금지).
- mls 기준선은 `sample_inventory_item` 하나뿐이다. 공지는 b8c4ccd7a 에서 mcm 으로 옮겨져 `MCMAPUSER.TB_MCM_NOTICE`·`TB_MCM_NOTICE_TARGET` 을 쓰고 mls 코드는 `TB_MLS_NOTICE` 를 쓰지 않는다. 전환 시 SQLite V1~V4 는 `archive/` 로 `git mv`. `TB_MCM_NOTICE` Oracle DDL 은 ora-mcm-app 몫이다.
- 리뷰(opus/high, 2026-10-07) 반영: HTTP_HEADERS 는 VARCHAR2(4000 CHAR)(CLOB 이면 Map 결과가 Clob 객체가 되어 캐스트 실패), IF 표 C_AT·U_AT 는 DEFAULT SYSTIMESTAMP NOT NULL.
- p2 에서 할 일(리뷰 지적): ① `InterfaceMapper.xml` 이 INTERFACE_MSG(CLOB)를 String 으로 읽게 resultMap 또는 타입 핸들러 추가 ② `TopicAdminController.create` 에 groupId `required` 검증(완료, 28c47ca1b) ③ `AppHostCommandService.applyChanges` 에 APP_HOST_NM·APP_HOST_URL 빈 값 검증(완료, 28c47ca1b, AppHostCommandServiceTest 통과·caravan-core compileJava 통과) ④ `TiberoDialectResolver`·`DataInitializer` 의 SQLite·MSSQL 분기 제거.
- caravan Flyway 주인은 caravan-hub 로 가정한다(`schema-owners.md` 가 나오면 따른다). CARAVANUSER 표 4종(TOPICS·TC_ERROR·HUB_CONFIG·APPHOST).
- IFUSER 의 IF_* 표는 운영자가 정의하므로 기준선에 넣지 않고 시험용 예시 1개만 둔다.

- 조정 결정(2026-10-07): CARAVANUSER·EAIUSER·IFUSER 의 Flyway 주인은 caravan-hub. caravan-console 엔티티 표도 이 기준선에 포함한다. mcm-core 는 V1 을 만들지 않고 validate 만 한다. V1 DDL 은 접두 없이 쓰고 스키마 폴더별 Flyway defaultSchema 로 적용한다. EAIUSER 폴더는 만들지 않는다(사용자 생성·권한은 ora-base PDB 도구).

## EAIUSER 가 필요로 하는 권한 (ora-base·운영 DBA 에 전달)

hub 의 `if` 데이터소스 접속 사용자는 EAIUSER 이고, IF_* 표는 IFUSER 소유다(`TB_CARAVAN_HUB_CONFIG.DB_SCHEMA=IFUSER`). `InterfaceMapper.xml` 이 실행하는 SQL 기준으로 필요한 권한은 아래와 같다. DELETE 는 쓰지 않는다.

| 대상(IFUSER 소유) | SELECT | INSERT | UPDATE | DELETE | 근거 |
|---|---|---|---|---|---|
| `IF_*` 중 INBOUND 로 설정된 표(예 `IF_MMPPMMCMTT01`) | O | | O | | `selectPendingMessages`, `updateSuccess`, `updateError` |
| `IF_*` 중 OUTBOUND 로 설정된 표 | | O | | | `insertOutboundData` |

표가 늘 때마다 같은 권한을 부여해야 한다. 한 표를 INBOUND·OUTBOUND 양쪽으로 쓰면 SELECT·INSERT·UPDATE 모두 필요하다. 신규 IF 표 추가 절차에 GRANT 단계를 넣는 것이 안전하다.

## 일시 정지 (2026-10-07, 조정 지시)

사용자 퇴근으로 조정 세션이 멈추라고 지시했다. 진행 중 편집 없음(전부 커밋), 백그라운드·Workflow·Oracle 접속 없음, 임시 사용자 `L_PLT_*` 는 모두 삭제했다. 다음 지시까지 새 작업을 시작하지 않는다.
재개 때 확인할 것: ora-base 스파이크에서 mdm 이 mcm-core 를 포함해 mcm-core 엔티티가 mdm EMF 에 들어온다고 확인됐다. mls 도 같은 구조인지(mls EMF 에 mcm-core 엔티티가 들어오는지, `metadata_builder_contributor` 와 `TB_MLS_*`·`TB_MCM_*` 매핑) 확인해 이 메모에 적는다. 이어서 ora-base 머지① 알림을 받으면 p3 실제 전환부터 한다.

## 재개 확인 결과 (2026-10-07)

- mls 는 mcm-core 엔티티를 EMF 에 넣지 않는다. `lib/build.gradle` 이 `api libs.mcm.core` 로 의존은 하지만, `MlsApplication` 이 `@EntityScan("com.dongkuk.dmes.mls")`·`@EnableJpaRepositories("com.dongkuk.dmes.mls")`·`@SpringBootApplication`(기본 스캔) 모두 `com.dongkuk.dmes.mls` 로 한정되어 있고, `McmCoreAutoConfiguration` 은 엔티티 스캔을 하지 않는다(설정·스케줄링만). mls EMF 의 엔티티는 `SampleInventoryItem` 뿐이다. mdm 과 달리 mls 는 mcm-core 의 52개 엔티티가 EMF 에 들어오지 않으므로 MLSAPUSER 에 mcm-core 표가 필요 없다.
- 단, mls `application.yml` 의 `metadata_builder_contributor: com.dongkuk.dmes.mcm.common.persistence.SqliteTemporalConverterContributor` 가 mcm-core 의 SQLite 전용 클래스를 가리킨다. mcm-core 에서 이 클래스를 걷어내면(③) mls 기동이 깨지므로 p3 yml 전환에서 이 줄을 반드시 제거한다.
- 시각 결정(조정, 2026-10-07 변경): UTC 철회, KST 통일. `hibernate.jdbc.time_zone` 은 넣지 않고(JVM Asia/Seoul) `hibernate.type.preferred_instant_jdbc_type=TIMESTAMP` 만 yml 에 둔다. Oracle 컨테이너는 OS 시간대 Asia/Seoul 로 조정자가 재생성한다(재생성 알림 뒤에 Oracle 단계 재개).
- p4 추가: cactus `DmomMapper.xml:65,70` 의 `NEXT VALUE FOR MCMAPUSER.SEQ_MCM_MOM_TC_ERROR` 를 `MCMAPUSER.SEQ_MCM_MOM_TC_ERROR.NEXTVAL` 로 바꾼다.

- 리뷰 지적 중 반영하지 않은 것: ① `OracleTestDatabase` 가 `dmes.ora.url` 이 없으면 예외로 실패하는 것(조용한 건너뜀은 전체 통과로 오해시키므로 의도적으로 유지) ② `local` persistence-unit 의 `jdbc:h2:` 속성(삭제 금지 규칙, 사용자 승인 뒤 정리).
- WildFly JNDI 기본 이름은 mcm 과 같은 `java:/jdbc/mcm/dsIF`·`dsCaravan` 이다(조정자 확정, mcm 666812393·d998d2150 기준). env 는 JNDI_DS_IF 가 공통이고, mst 는 JNDI_DS_MST 또는 JNDI_DS_CARAVAN 을 받는다. p6 머지 요청에 「mcm JNDI 와 일치」를 적는다.
- hub 풀 설정은 `DataSourceConfig` 가 `spring.datasource.{mst,if}` 를 HikariDataSource 에 직접 바인딩하므로 `hikari:` 아래가 아니라 `mst:`·`if:` 바로 아래에 둔다.

## 남은 순서 (다음 단계)

1. **p5**: oasis 시험 3차 실행(위 명령). 실패가 남으면 실패 사다리(sonnet/medium → sonnet/high → opus/high)로 한 건씩 원인 확인. 통과하면 p5 완료.
2. **p3 기동 확인**: mls·mpp·mqc·mpn 이 시험 PDB 에서 Flyway V1 적용 후 부팅하는지(각 모듈 `:api:test` 또는 `MlsTestDb` 상속 시험 중 하나), hub 앱 부팅(local 프로파일, Flyway 두 개·mst·if 풀) 확인. Oracle 단계는 PC 에서 한 번에 하나(heavy.sh), 하니스 `-Pdmes.ora.test=clone`.
3. **p4**(머지②·③ 뒤): cactus-core SQLite 코드 제거(archive 이동 후 빌드에서 제외), 시험 전환, `DmomMapper.xml` NEXTVAL. 이어서 **p6** 전체 시험 1회(heavy.sh) → 머지 요청(④: 세션 이름 `ora-platform` / 원본 `feat/ora-platform` / 대상 dev, 겹칠 수 있는 파일: 각 모듈 `lib/build.gradle`·`application*.yml`, oasis 시험 전체, caravan-hub).
- 조정 세션: dmes-standard-d8. push 하지 않는다. 머지는 「머지 허가」 뒤에만.
