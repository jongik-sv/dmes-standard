# ora-platform 레인 정본 메모

- 레인: ora-platform / 브랜치 `feat/ora-platform` / 워크트리 `/Users/jji/project/dmes-wt/ora-platform` (기준 dev b7c91cd6e)
- 조정 세션: dmes-standard-d8 (지시 ora-platform-1, 정본 지시문 `/Users/jji/.coord/oracle-1007/lanes/ora-platform/brief.md`)

## 지금 상태 (2026-10-07 18:30, Oracle 동결 중)

| 항목 | 상태 | 비고 |
|---|---|---|
| p1 caravan 기준선 | 코드 완료·시험 대기 | `caravan-hub/src/main/resources/db/migration/{caravanuser,ifuser}`. CARAVANUSER Flyway 는 시험 PDB 에서 통과, IFUSER V1 주석의 달러 중괄호가 Flyway 자리표시자로 해석되던 결함은 70379f8c5 로 고침(재시험 전) |
| p3 샘플 모듈 | 코드 완료·시험 대기 | SQL archive 이동·yml·lib build.gradle·MlsTestDb(ed6426fba·67145c31a·fb15b4f95). 컴파일 통과, Oracle 기동 시험 안 함 |
| p2 caravan-hub·console·core | 코드 완료·시험 대기 | HubFlywayConfig·yml 5종·InterfaceMapper CLOB·TiberoDialectResolver·KafkaJpaConfig(2131f1a40·ed854f285·ea8166ebe), 빈 값 검증(28c47ca1b). `HubOracleBaselineTest` 가 통합 시험 |
| p5 H2 시험 | 코드 완료·시험 미실행 | caravan-core h2 의존성 제거, oasis-core 시험 16개를 `OracleTestDatabase` 로 전환(f99be8b3b) |
| p4 cactus-core SQLite 제거 | 대기 | ora-mdm·mcm 머지②·③ 뒤. `DmomMapper.xml` NEXT VALUE FOR 변경 포함 |
| p6 전체 시험·머지 요청(④) | 대기 | |

### Oracle 동결 처리
- 조정자 동결(18:24, VM 메모리 고갈): 새 Oracle 명령 금지. hub 시험의 `pdb.mjs clone T_ORA_PLATFORM`(pid 75506)은 끊지 않고 끝나게 두었고, 그 gradle 데몬(34551)은 SIGSTOP 후 복제 종료 즉시 SIGKILL 한다(취소 정리의 drop 방지).
- 재개 뒤 할 일(순서, 한 번에 하나): ① `T_ORA_PLATFORM` drop ② `HubOracleBaselineTest` 1회(`-Pdmes.ora.test=clone`) ③ oasis-core 시험 1회 ④ mls·mpp·mqc·mpn 기동·Flyway 확인.

### oasis 전환에서 시험 실행 때 볼 것
- Oracle 은 `int` 칸을 `BigDecimal` 로 돌려준다(H2 는 Integer). `PreStructuredMessageSendTaskServiceTest` 의 `getValue()).isEqualTo(1)` 등 기대값 불일치가 나면 시험 쪽을 맞춘다.
- 여러 시험이 같은 스키마에서 `Employee`·`users` 표를 만들고 지운다. 시험 PDB 하나에서 병렬 실행하면 충돌하므로 forks=1 을 유지한다.
- `OracleTestDatabase` 는 `dmes.ora.url` 시스템 속성이 필요해 `cactus-core` 합성 빌드(`-Pdmes.ora.test=clone`)에서만 값이 넘어온다. oasis 단독 빌드에서는 시작하지 못한다.
- `META-INF/persistence.xml` 의 `local` 단위는 어느 시험도 쓰지 않으며 `jdbc:h2:`·`org.h2.Driver` 속성이 남아 있다(삭제 금지 규칙이라 그대로 둠, 정리는 사용자 승인 뒤).
- `oasis-core/build.gradle` 은 `libs` 카탈로그를 쓰지 않아 `ojdbc11:23.9.0.25.07` 을 직접 적었다.

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

## 남은 순서

1. 초안 Oracle 검증(FREEPDB1 `L_PLT_*` 사용자) → 리뷰 → 커밋
2. ora-base 머지① 알림 뒤 p3 실제 전환(yml·`lib/build.gradle` sqlite-jdbc 제거) → p2 → p5
3. 머지②·③ 뒤 p4 → p6

## 검증용 임시 사용자 (FREEPDB1)

`L_PLT_MLSAPUSER`·`L_PLT_MPPAPUSER`·`L_PLT_MQCAPUSER`·`L_PLT_MPNAPUSER`·`L_PLT_APSAPUSER`·`L_PLT_CARAVANUSER`·`L_PLT_IFUSER` — DDL 검증 후 삭제한다.
