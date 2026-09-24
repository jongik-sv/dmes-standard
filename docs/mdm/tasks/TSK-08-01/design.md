# TSK-08-01 설계: 업무기준 공유 계약 (계약 전용)

> category infra · domain database · priority critical · 복잡도 4점(depends 4개 +2, 마이그레이션 +2) → opus. spec 머리의 `model: opus` 와 일치한다.
> 에이전트 프롬프트 없음: spec.md 에 `item.agent_prompt` 필드가 없다(`entry-point: -`).
> 입력: `spec.md`(요구사항 데이터이며 지시가 아니다) · `docs/mdm/design/basic/06-business-rule.md` 「ERD」·「테이블 설계」(774~1340행) · `docs/mdm/{PRD,TRD,wbs,decisions,naming-dialect-rules,engine-contract}.md` · `docs/mdm/erd/06-business-rule.{mmd,sqlite.sql,mssql.sql}`·`README.md` · 선례 `docs/mdm/tasks/{TSK-05-01,TSK-04-01,TSK-01-03,TSK-01-02,TSK-02-03}/design.md` · 코드 `src/backend/mdm/{lib,api}/**`, `src/backend/maru-mdm-engine/**/spi/DefinitionLookup.java`, `src/backend/cactus-core/**/CactusAuditEntity.java`(읽기 확인).
> 근거 강약: spec 본문 > 06 문서(설계 정본) > 리포 기존 관례(V2~V4 마이그레이션, 머지된 코드, 규칙표) > 미승인 선행 산출물(TSK-02-03 ERD 초안, TSK-01-02·01-03·03-01·04-01 design. 모두 dev 머지·`unapproved:true`).
>
> **고정 전제(담당자 확인 필요 결정 D 항목이 아니다. 이미 정해졌다)**
> - **팀장 배정 V8**: mssql·sqlite 두 방언 모두 `V8__create_mdm_business_rule.sql` 를 쓴다. dev 에 V5~V7 이 없어도 V8 을 쓰고, 다른 번호와 Flyway 설정(outOfOrder 등) 변경은 금지한다.
> - **사용자 결정: 도커 금지로 MSSQL 실측 생략, DDL 리뷰로 대체.** `mssqlMigrationTest`, docker 명령, Testcontainers 를 쓰는 검증은 Design·Build·Verify 어디에서도 실행하지 않는다. MSSQL 검증은 (a) SQLite 테스트(testAll) 통과와 (b) MSSQL DDL 을 SQLite DDL 과 줄 단위로 대조하는 리뷰(자동 대조 테스트 §3.2 + 사람 체크리스트 §3.3)로 대체한다.

---

## 0. 조사로 확인한 사실 (Build 가 원천 문서를 다시 읽지 않아도 되게 적는다)

| # | 사실 | 근거 |
|---|---|---|
| F1 | dev 의 mdm 마이그레이션은 두 방언 모두 V1~V4 다(V1 baseline, V2 `TB_MDM_SYSTEM`+시드 6행, V3 02 영역 7테이블, V4 03 영역 5테이블). 06 의 FK 부모인 `TB_MDM_SYSTEM`(V2)·`TB_MDM_DOMAIN`(V3)이 이미 있어 V8 의 모든 FK 를 인라인으로 걸 수 있다. 형제 워크트리 `dflow-087bc67d`(04 계약)·`dflow-e2017bfa`(05 계약)는 아직 V4 까지이고, `dflow-91b83c83` 에만 별도의 `V4__term_abbr_index_relax.sql` 이 있다(이 Task 와 번호가 겹치지 않는다) | `db/migration/mdm/{sqlite,mssql}` 목록, `git worktree list` 후 워크트리별 `ls` (2026-09-24) |
| F2 | FK 대상 칼럼 타입: `TB_MDM_SYSTEM.SYSTEM_CODE` = MSSQL `VARCHAR(20) COLLATE Latin1_General_100_BIN2`/SQLite `VARCHAR(20)`, `TB_MDM_DOMAIN.DOMAIN_ID` = MSSQL `BIGINT IDENTITY(1,1)`/SQLite `INTEGER PRIMARY KEY AUTOINCREMENT`. ERD 초안의 FK 칼럼(`SOURCE_SYSTEM`·`SYSTEM_CODE` = `VARCHAR(20)` BIN2, `DOMAIN_ID` = MSSQL `BIGINT`/SQLite `INTEGER`)과 정확히 같다 | mssql V2:5, V3:61·89, sqlite V2:4, V3:58 |
| F3 | **JSON 칼럼 관례는 V4 가 아니라 V3 에 있다.** V4 에는 JSON 칼럼이 없다(`PAD_RULE` 은 자유서술). V3 관례: CHECK 이름 `CK_{테이블}_{칼럼}_JSON`, SQLite 는 칼럼 정의 안의 인라인 제약 `COL TEXT CONSTRAINT CK_…_JSON CHECK (COL IS NULL OR json_valid(COL))`, MSSQL 은 칼럼 `NVARCHAR(MAX)` + 테이블 끝의 `CONSTRAINT CK_…_JSON CHECK (COL IS NULL OR ISJSON(COL) = 1)`. NOT NULL JSON 칼럼은 `IS NULL OR` 를 뺀다. 엔티티는 일반 `String` 으로 매핑하고 `@Lob`·컨버터를 쓰지 않는다(`MdmTerm.synonyms`) | sqlite V3:35-37·70-75·109, mssql V3:53-55·94-97·130, `MdmTerm.java:49-56` |
| F4 | ERD 초안의 SQLite 파일은 JSON CHECK 를 인라인(`VAR_AST`·`PRIO_LIST`·`GRP_COND_AST`)과 테이블 끝(`CELLS`·`INPUT_JSON`·`EXPECTED_JSON`·`RULE_IDS`)에 섞어 두었다. V8 은 V3 관례(SQLite 인라인)로 통일한다. 동작 차이는 없고 표기만 다르다 | `erd/06-business-rule.sqlite.sql` |
| F5 | 06 의 JSON 칼럼은 정확히 7개다: `RULE_VAR.VAR_AST`·`PRIO_LIST`·`GRP_COND_AST`, `RULE_ROW.CELLS`, `RULE_TEST_CASE.INPUT_JSON`·`EXPECTED_JSON`, `RULE_SET.RULE_IDS`. `RULE_RECV.BODY` 는 요청 원문이라 JSON 이 아닐 수 있어(파싱 실패 요청도 REJECTED 로 남긴다) JSON CHECK 를 두지 않는다 | naming-dialect-rules §3 #3, 06:1104 |
| F6 | **업무 칼럼 `VER` 과 감사 `VER` 의 충돌**: `TB_MDM_RULE_VER`·`RULE_VAR`·`RULE_ROW`·`RULE_RECV` 4테이블은 감사 카운터를 `AUD_VER BIGINT` 로 둔다(D-034, 규칙표 §2 예외). 엔티티는 `@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))` 를 붙인다. 리포 전체에 `@AttributeOverride` 사용처는 아직 0건이고 이 Task 가 처음 쓴다. `CactusAuditEntity` 는 `@MappedSuperclass` 이고 `version` 필드가 `@Column(name = "VER") Long` 이며 `@Version` 이 아니다. 리스너는 setter 로 값을 넣으므로 칼럼 재정의의 영향을 받지 않는다 | decisions D-034, naming-dialect-rules §2·§6.1, `CactusAuditEntity.java:23-25·51-52`, `CactusAuditListener.java:40·57-58` |
| F7 | `DefaultVersionTableRegistry`(머지됨)는 이미 `BUSINESS_RULE → VersionTableSpec("TB_MDM_RULE_VER","MARU_RULE_ID","VER","TB_MDM_RULE","MARU_RULE_ID","AUD_VER","VER")` 를 돌려준다. 공통 버전 서비스(`VersionRowStore`)는 버전 테이블의 `STATUS`·`OWNER_ID`·`APPLY_FROM`·`APPLY_TO`·`REQUESTED_BY`·`REQUESTED_AT`·`RELEASED_AT`·`ROW_VERSION`·`U_USR_ID`·`U_AT`·`U_SVC_ID`·`U_PGM_ID`·`AUD_VER` 와 부모의 `STATUS`·`U_*`·`VER` 를 네이티브로 읽고 쓴다. `ROW_VERSION` 은 `((Number) v).longValue()` 로 읽는다 | `DefaultVersionTableRegistry.java`, `VersionRowStore.java:188-239` |
| F8 | **TSK-01-03 이 TSK-08-01 에 넘긴 인계 4건**: ① `AUD_VER`+`@AttributeOverride`. ② 버전 테이블에 위 고정 칼럼이 그 이름으로 있어야 하고 **`ROW_VERSION BIGINT NOT NULL DEFAULT 0`**, 부모 `TB_MDM_RULE` 에 `STATUS`. ③ `AbstractVersionStateScenarioTest` 를 실제 테이블로 상속해 같은 시나리오를 돌린다(부모 FK·NOT NULL 칼럼은 `seedObject`·`seedVersion` 재정의로 채운다). ④ SQLite 일시는 `TEXT 'yyyy-MM-dd HH:mm:ss'`(KST)이고 버전 엔티티의 `LocalDateTime` 매핑이 이 문자열을 읽어야 한다 | `tasks/TSK-01-03/design.md:593`(§7), `:696`(X2) |
| F9 | 시나리오 키트는 추상 훅 `createSchema(JdbcTemplate)`·`clearTables(JdbcTemplate)` 와 재정의 가능한 `seedObject`·`seedVersion`·`readVersion` 을 갖고, 명세는 주입된 `VersionTableRegistry` 빈(함수형 인터페이스)에서 얻는다. 시나리오 대부분이 `MASTER_CODE` 대상이고 `BUSINESS_RULE` 은 S15 한 건뿐이다. 04 의 실제 테이블(`TB_MDM_CODE_VER`)은 dev 에 아직 없으므로, **MASTER_CODE 는 픽스처 명세(`VersionFixtureTables.CODE_SPEC`), BUSINESS_RULE 은 실제 명세(`DefaultVersionTableRegistry`)** 를 돌려주는 혼합 명세로 상속해야 키트 전체가 돈다. 기본 `seedObject` 는 부모에 `(ID, STATUS, U_USR_ID, VER)` 만 넣으므로 실제 `TB_MDM_RULE` 의 NOT NULL 칼럼(`MARU_RULE_NAME`·`RULE_KIND`·`SOURCE_KIND`)과 `CK_TB_MDM_RULE_SRC_SYS` 를 만족하도록 재정의해야 한다. 기본 `seedVersion` 은 실제 `TB_MDM_RULE_VER` 에 그대로 쓸 수 있다(`EMERGENCY_YN`·`ROW_VERSION` 은 기본값) | `AbstractVersionStateScenarioTest.java:54-104·400-418·seedObject/seedVersion`, `VersionStateServiceSqliteTest.java`, `VersionScenarioTestConfig.java`, `VersionFixtureTables.java:18-26` |
| F10 | **SQLite 업무 일시의 JPA 매핑 함정**: mdm 에는 SQLite 전용 일시 컨버터가 등록되어 있지 않다. xerial 기본 바인딩은 `Timestamp` 를 정수(epoch millis)로 저장해, 네이티브 쓰기(`MdmTemporalBinder`, KST `'yyyy-MM-dd HH:mm:ss'` 문자열)와 형식이 어긋난다(D-044 근거). 리포 선례: mcm-core `SqliteTemporalConverterContributor`(`MetadataBuilderContributor`, `LocalDate`/`LocalDateTime` 컨버터 auto-apply)를 **mls 가 `application.yml` 의 `spring.jpa.properties.hibernate.metadata_builder_contributor` 로 등록**한다(Spring Boot 기본 EMF, Hibernate 7). mdm 도 Spring Boot 기본 EMF 라 같은 방식이 먹는다. 다만 mcm 컨버터는 쓰기 형식이 `yyyy-MM-dd HH:mm:ss.SSS` 라 규칙표 #16·`MdmTemporalBinder`(초 단위)와 다르고, mdm 은 mcm-core 에 의존하지 않으므로 mdm 전용 컨버터를 둔다(D5) | `mls/api/src/main/resources/application.yml:13-21`, `mcm-core/.../SqliteTemporalConverterContributor.java`, `LocalDateTimeAttributeConverter.java`, `MdmTemporalBinder.java`, `mdm/api/src/main/resources/application-local.yml` |
| F11 | `local-db`(MSSQL) 프로파일은 `local` 을 include 하지 않고 프로파일 그룹도 `dev·prod → wildfly` 뿐이다. mssqlTest 는 모두 `@ActiveProfiles("local-db")` 다. 따라서 `application-local.yml` 에만 contributor 를 적으면 MSSQL 경로에는 켜지지 않는다 | `application.yml:4-11`, `application-local-db.yml`, mssqlTest `@ActiveProfiles` grep |
| F12 | **감사 일시 형식이 한 행 안에서 섞인다(실험으로 확인한 드라이버 동작)**: JPA 는 `C_AT`·`U_AT`(Instant)를 SQLite 에 정수 epoch millis 로 쓰고(D-038), 공통 버전 서비스의 네이티브 쓰기는 `U_AT` 를 KST 텍스트로 쓴다(`MdmTemporalBinder.toDb(Instant)`, S24). 06 은 같은 행(`TB_MDM_RULE`·`TB_MDM_RULE_VER`)을 JPA 와 네이티브가 함께 쓰는 첫 영역이다. sqlite-jdbc 3.45.3.0 으로 직접 실험한 결과, TEXT `'2026-06-20 09:08:07'` 을 `getTimestamp(i, UTC Calendar)` 로 읽으면 **예외 없이 `09:08:07Z` 로 읽혀** KST 로 쓴 실제 시각(`00:08:07Z`)과 9시간 어긋난다. 정수 값은 시간대와 무관하게 맞게 읽힌다. `getObject(i, Instant/OffsetDateTime)` 는 드라이버가 지원하지 않는다. Hibernate 7 이 `Instant` 를 UTC Calendar 로 읽으면 엔티티의 `getUpdatedAt()` 이 9시간 어긋난다. 이 Task 는 고치지 않고 실측·보고한다(D6) | 스크래치 실험 `TsProbe.java`(sqlite-jdbc 3.45.3.0, 2026-09-24), D-038, D-044 |
| F13 | **MSSQL 은 `(N)VARCHAR(MAX)` 칼럼을 인덱스 키로 받지 않는다.** ERD 초안은 `RULE_VAR.VAR_NAME VARCHAR(MAX)` 에 `UX_TB_MDM_RULE_VAR_NAME (MARU_RULE_ID, VER, VAR_NAME)` 을 걸었으므로 MSSQL 에서 `CREATE UNIQUE INDEX` 가 실패한다. 또 콜레이션이 없어 기본(대소문자 무시) 비교가 되어 SQLite(BINARY)와 유일성 판정이 갈린다(규칙표 #19). 이 초안은 MSSQL 에서 실행된 적이 없다(erd/README.md:41-49) | T-SQL 인덱스 키 규칙, `erd/06-business-rule.mssql.sql`(RULE_VAR), 규칙표 #19 |
| F14 | `UX_TB_MDM_RULE_VAR_NAME` 은 `WHERE VAR_KIND = 'RESULT'` 필터만 있고 `VAR_NAME` 은 NULL 을 허용한다. MSSQL 유일 인덱스는 NULL 을 하나만 허용하고 SQLite 는 여러 개 허용하므로(규칙표 #20) 결과 열의 `VAR_NAME` 이 NULL 이면 두 방언의 판정이 갈린다. 06:1011 은 "결과 열은 필수"라고 정한다 | 06:1011, 규칙표 #20, ERD 초안 |
| F15 | ERD 초안의 `DISP_TYPE` 에는 CHECK 가 없다. 06 은 저장값을 `Equal / 1 / 2 / Expression`(조건 열)·`Value / Expression`(결과 열)로 적고 예시 값이 `2` 다(06:1009, 샘플 06:1302-1307 은 `2`·`1`·`Value`·`Expression`). 엔진 `DefinitionLookup.DispType` 은 `EQUAL, ONE, TWO, EXPRESSION, VALUE` 다. 저장 코드와 엔진 enum 의 대응은 아무 문서도 정하지 않았다 | 06:1009·1302-1307, `DefinitionLookup.java`(DispType), `erd/06-business-rule.*.sql` |
| F16 | **`ROW_VERSION` 타입 차이**: ERD 초안은 `INTEGER`/`INT`, TSK-01-03 인계와 픽스처는 `BIGINT NOT NULL DEFAULT 0` 이고 서비스는 `long` 으로 읽는다(F7·F8) | ERD 초안, `VersionFixtureTables.java`, TSK-01-03 §7 |
| F17 | 보류 테이블 원칙: "배포 대상·배포 순번·수신 로그 테이블은 DDL-only(엔티티·리포지토리·서비스·BPMN·화면 없음)"(D-019). PRD:62 도 "보류 테이블(`*_SYSTEM`, `*_RECV`)도 DDL 은 만들되 코드는 쓰지 않는다"고 적는다. 06 에서 해당하는 것은 `TB_MDM_RULE_SYSTEM`(배포 대상)·`TB_MDM_RULE_RECV`(수신 로그)다. 선례: V3 의 `TB_MDM_DICT_SEQ`·`TB_MDM_DICT_SYSTEM` 은 엔티티가 없고, `MdmEntityJpaRoundtripTest` 가 "관리 엔티티 테이블 집합에 두 테이블이 없다"를 단언한다 | decisions D-019, PRD.md:62, `MdmEntityJpaRoundtripTest.java:169-186` |
| F18 | **확정 검사 SPI 는 이미 선언돼 있다**: `VersionConfirmCheckSpi { target(); diff(VersionRef); check(ConfirmCheckRequest); }`(javadoc: "06(TSK-08-01 선언·08-05 구현)"). `VersionDiffEntry(String key, DiffKind kind, Map<String,Object> oldValues, Map<String,Object> newValues)` 의 javadoc 은 "key 는 04 가 code, 06 이 row_id" 라고만 적고, 06 의 값 맵 키는 정하지 않았다. 06 diff SQL 은 `cells`·`seq` 두 값으로 CHANGED 를 판정한다(06:1255-1268). 기존 테스트 스텁 `BusinessRuleConfirmCheckStub` 은 key 를 `"ROW-1"`, 값 맵 키를 `"OUT_VAL"` 로 둔 임시 모양이다 | `contract/version/*.java`, 06:1253-1278, `BusinessRuleConfirmCheckStub.java` |
| F19 | "확정 검사"의 뜻: 결재 없이 담당자가 DRAFT→RELEASED 로 확정할 때 도는 검사다. 항목은 **저장 시 검사 전부 + 변수·행 1개 이상 + 기대값 있는 테스트 케이스 전부 통과 + 앞 룰(결과 변수 출처) RELEASED 확인**이고, apply_from 순서는 공통 서비스가 검사하며 룰 참조 검사(배포 대상 기준)는 하지 않는다 | wbs.md:1441-1447(TSK-08-05), PRD.md:60-61·FR-E4, `VersionConfirmCheckSpi.java:14` |
| F20 | **엔진 `DefinitionLookup` 과 06 테이블의 어긋남 4건**(엔진 서명은 고치지 않는다): ① `RuleVar.domainId`·`VarType.domainId` 는 `String`, `TB_MDM_RULE_VAR.DOMAIN_ID` 는 `BIGINT`. ② `RuleSetDefinition.status` 의 `SetStatus` 에 `CREATED` 가 있으나 `CK_TB_MDM_RULE_SET_STATUS` 는 `INUSE`·`DEPRECATED` 만 받는다(엔진 쪽이 상위집합이라 변환은 성립한다). ③ `DispType` 코드와 DB 저장 코드의 대응이 정해져 있지 않다(F15). ④ `RuleVar` 는 `varName`·`exprText` 를 나누지만 테이블은 `VAR_NAME` 한 칸에 이름 또는 식을 담고 `VAR_AST` 가 NULL 인지로 가른다(06:1012). 그 밖의 엔진 필드(`scale`·`refVars`·`engineVersion`·`contract`·`RuleCell.text`)는 칼럼이 아니라 파생값이라 어긋남이 아니다(06:1024·1152·1161-1164) | `DefinitionLookup.java`, 06:1003-1024·1152-1165, CK_TB_MDM_RULE_SET_STATUS |
| F21 | **계약 패키지는 엔진 타입에 의존할 수 없다**: `MdmContractArchitectureTest` 의 규칙 `계약_패키지는_엔진_타입에_의존하지_않는다`(`kr.dongkuk.maru.mdm.engine..`)와 `계약_패키지는_Spring_JPA_Hibernate_JDBC_에_의존하지_않는다`가 `com.dongkuk.dmes.mdm.contract..` 전체에 자동 적용된다. 따라서 `DefinitionLookup` 을 확장하는 인터페이스를 계약 패키지에 둘 수 없다. 반면 Gradle 의존 방향은 `mdm/lib → maru-mdm-engine`(`api` 스코프)이라 **테스트 코드와 계약 밖 패키지는 `DefinitionLookup` 을 구현할 수 있다**. ArchUnit 테스트는 `DO_NOT_INCLUDE_TESTS` 라 테스트 스텁은 검사 대상이 아니다 | `MdmContractArchitectureTest.java`(규칙 6·7), `mdm/lib/build.gradle:22`, `maru-mdm-engine/build.gradle:33` |
| F22 | `MdmContractArchitectureTest`·`MdmEntityArchitectureTest` 는 `contract..`·`entity..` 접두사 전체를 스캔하므로 새 서브패키지 `contract.rule` 과 새 엔티티에 **수정 없이 자동 적용**된다. 계약 규칙: 인터페이스·enum·record·상수 클래스(final, static final 필드, private 생성자, 메서드 0개)만, 인터페이스 메서드는 모두 추상, record·enum 은 접근자(enum 은 인자 0개 메서드)만, 함수 객체 필드 금지. 엔티티 규칙: `@ManyToOne`·`@OneToMany`·`@OneToOne`·`@ManyToMany` 금지 | 두 테스트 파일 |
| F23 | `ContractStubCompileTest` 는 Task 별 절 주석을 달아 메서드를 이어 붙이는 관례다(TSK-04-01 §3.4, TSK-05-01 §3.4). `CONFIRM_CHECKS` 는 `VersionTarget` 마다 스텁 하나이고 "같은 대상을 두 구현이 맡으면 안 된다"를 단언하므로 BUSINESS_RULE 스텁을 새로 하나 더 넣으면 기존 테스트가 깨진다. 기존 `BusinessRuleConfirmCheckStub` 의 값만 바꾸는 것은 기존 단언(entries 1건, CHANGED, base ver 2)과 충돌하지 않는다 | `ContractStubCompileTest.java:46-100` |
| F24 | 버전 기대값을 가진 기존 테스트: `MdmSharedContractMigrationTest.java:64·75`(`flyway_가_V1_V2_V3_V4_를_적용했다`, `Set.of("1","2","3","4")`), mssqlTest `MdmMssqlMigrationTest.java:78·81·82·91`(`migrationsExecuted == 4`, `targetSchemaVersion == "4"`), `MdmTermDomainColumnMssqlMigrationTest.java:87·96`, `MdmInterfaceLayoutMssqlMigrationTest.java:83·91`. `MdmFlywayVersionParityTest` 는 두 방언 집합이 같은지와 `containsAll("1","2")` 만 보므로 수정이 필요 없다. 테이블 총 개수를 단언하는 테스트는 없다 | 각 파일 grep |
| F25 | **mssqlTest 소스셋은 docker 없이 컴파일된다.** `cd src/backend/mdm && ../gradlew :api:compileMssqlTestJava --no-daemon` 을 2026-09-24 에 실행해 `BUILD SUCCESSFUL`(49초)을 확인했다. 다만 이번 실행은 이미 컴파일된 결과를 재사용한 `UP-TO-DATE` 였다. Testcontainers 는 컴파일 시점에는 jar 로만 필요하고 docker 는 실행 시점에만 필요하다. `mssqlMigrationTest` 태스크는 `test`·`check`·`testAll` 어디에도 연결되어 있지 않다 | 스크래치 로그 `compile-mssqltest.log`, `mdm/api/build.gradle:28-49` |
| F26 | 엔티티 관례: `lib/.../entity` 평면 패키지, `@Entity @Table(name="TB_MDM_…") extends CactusAuditEntity`, `protected` 기본 생성자 + PK 를 받는 public 생성자, 한 줄 getter, `setX(T v)` setter(PK setter 없음), FK 는 원시 필드. 복합 PK 는 `@IdClass(XxxId.class)` + `XxxId implements Serializable`(public 기본·전체 인자 생성자, getter, `equals`(패턴 매칭 instanceof), `Objects.hash`). 리포지토리는 `interface XxxRepository extends JpaRepository<Xxx, XxxId> {}` 로 메서드를 선언하지 않는다. 코드값 칼럼은 `String`(예: `MdmLayout.layoutKind`), boolean 은 원시 `boolean` | `MdmLayout.java`, `MdmLayoutItem.java`, `MdmLayoutItemId.java`, `MdmLayoutItemRepository.java`, `MdmColumn.java:51-52` |
| F27 | **예약어 확인(TSK-05-01 D1 같은 인용 필요 여부)**: 엔티티를 붙이는 6테이블의 칼럼 가운데 SQL Server·SQLite 예약어와 겹치는 이름은 없다(`VER`·`ROW_ID`·`ROW_KIND`·`ROW_VERSION`·`SEQ`·`STATUS`·`LABEL`·`AXIS`·`TAG`·`NOTE`·`CELLS`·`DESCRIPTION` 모두 예약어가 아니다. `ORDER`·`ROW`·`OFFSET`·`VERSION` 같은 이름은 06 에 없다). 인용이 필요한 `RESULT` 는 엔티티가 없는 `TB_MDM_RULE_RECV` 에만 있고 DDL 에서 SQLite `"RESULT"`·MSSQL `[RESULT]` 로 인용한다(ERD 초안 그대로). 따라서 엔티티 `@Column` 에 백틱 인용을 쓰지 않는다 | 06 테이블 칼럼 목록, TSK-05-01 D1, D-047 |
| F28 | `TB_MDM_SYSTEM` 시드는 `ERP·MES·APS·DKMS·L2·MDM` 여섯뿐이다. 06 샘플의 EXTERNAL 예(06:1332-1338)가 쓰는 `QMS` 는 없으므로, 샘플을 그대로 넣으면 `FK_TB_MDM_RULE_SYSTEM_SYSTEM` 이 거부한다. 테스트 픽스처는 `QMS` 대신 `APS` 를 쓴다(원문을 고치지 않는다) | V2 시드, 06:1336 |
| F29 | 06:938 은 SQLite 일시를 "TEXT(ISO 8601)"로 적었지만 규칙표 #16 은 `'YYYY-MM-DD HH:MM:SS'`(공백 구분, 초 단위)다. 규칙표가 우선한다(규칙표 머리말). 06:931 의 "05의 `last_key_no`" 는 오기다(TSK-02-03 F14) | 06:931·938, naming-dialect-rules 머리말·§3 #16 |
| F30 | `MdmDomainReferenceSpi`(refKind `"RULE_VAR"`)는 06 이 구현하기로 되어 있으나(D-037) 어느 08 Task 가 맡는지 wbs 에 명시가 없다. "실행 로직 없음" 수용 기준상 이 Task 에는 넣지 않고 인계만 한다 | decisions D-037, TSK-04-01 design §7 |
| F31 | 로컬 Flyway 주의(팀장 결정의 결과이며 설계 결정이 아니다): V8 이 적용된 개발자 로컬 `data/mdm.db` 는 나중에 V5~V7 이 들어오면 `outOfOrder=false` 기본값 때문에 validate 에서 실패한다. 테스트는 `@TempDir` 새 DB 라 영향이 없다. 로컬 DB 를 다시 만들면 된다 | Flyway 기본 동작, 팀장 배정 V8 |
| F32 | **02 영역이 main 에 `DefinitionLookup` 구현을 둘 예정이다**: 형제 워크트리 `dflow-2ca988a4`(TSK-04-03, dev 미머지, 커밋 `f93861e`)의 `mdm/lib/.../common/engine/MdmEngineConfig.java` 가 `EngineLookups` 를 만들 때 쓰는 **익명 빈 구현** `EMPTY_DEFINITIONS`(세 메서드 모두 `Optional.empty()`)를 static 필드로 둔다. 스프링 빈으로 등록하지는 않는다. 그 javadoc 은 "검증 정의(DefinitionLookup)는 도메인 검증기에 호출자가 따로 준다"고 적는다. 따라서 "main 에 `DefinitionLookup` 구현 클래스 0개" 같은 정적 가드는 그 Task 가 머지되면 깨진다. 이 Task 는 런타임 빈 검사만 둔다(§3.1-12·§3.7). 06 의 값 테스트 구현(08-04)은 자기 `DefinitionLookup` 을 따로 만들고 `column()` 은 02 계약에 위임한다(§6.4) | `dflow-2ca988a4` main 소스 grep(`implements DefinitionLookup`·`EngineLookups(`), 다른 형제 워크트리·dev 는 0건 |

---

## 1. 접근 방식

06 영역 8테이블을 **Flyway V8(두 방언)** 으로 새로 만든다. DDL 은 ERD 초안(`erd/06-business-rule.{sqlite,mssql}.sql`)을 1차 텍스트로 삼고, 조사로 확인한 지점만 갈라 적용한다: SQLite 감사 `VER`·`AUD_VER` 를 `BIGINT` 로(규칙표 §2, TSK-05-01 F6 선례), 모든 `ROW_VERSION` 을 `BIGINT` 로(D2), MSSQL `VAR_NAME` 을 인덱스 가능한 `VARCHAR(1000) COLLATE BIN2` 로 바꾸고 결과 열 `VAR_NAME` 필수 CHECK 를 더하며(D3), `DISP_TYPE` CHECK 를 더하고(D4), JSON CHECK 표기를 V3 관례로 통일한다(F3·F4). CASCADE 는 06 이 정한 두 FK(`RULE_VAR→RULE_VER`, `RULE_ROW→RULE_VER`)에만 둔다.

엔티티는 활성 6테이블(`TB_MDM_RULE`·`RULE_VER`·`RULE_VAR`·`RULE_ROW`·`RULE_TEST_CASE`·`RULE_SET`)에만 붙이고, 보류 2테이블(`RULE_SYSTEM`·`RULE_RECV`)은 DDL 만 둔다(D1, D-019). 엔티티는 기존 `lib/entity` 관례(F26)를 따르고, 감사 칼럼이 `AUD_VER` 인 3엔티티는 `@AttributeOverride` 를 붙인다(F6). 공통 버전 서비스·식별자 발급기가 네이티브 SQL 로만 바꾸는 칼럼(카운터, 상태·소유자·적용 구간, `ROW_VERSION`)은 `updatable = false` 로 매핑해 오래된 엔티티의 저장이 그 값을 되돌리지 못하게 한다(D7). SQLite 업무 일시(`LocalDateTime`)는 local 프로파일에만 등록하는 mdm 전용 컨버터로 `'yyyy-MM-dd HH:mm:ss'` 텍스트로 읽고 쓴다(D5). 이것이 이 Task 에서 **유일하게 실행되는 main 코드(영속성 매핑 인프라)** 이며, 업무 로직(발급·조회·검사·diff)은 하나도 두지 않는다.

계약은 새 서브패키지 `com.dongkuk.dmes.mdm.contract.rule` 에 선언만 둔다: 식별자 발급 인터페이스 `MdmRuleIdIssuer` 와 그 enum·record(D8), 값 테스트 정의 출처 enum `MdmRuleDefinitionSource`(엔진 `DefinitionLookup` 구현 대상 선언, D9), 확정 검사의 06 쪽 선언인 diff 관례 상수 `MdmRuleDiffConventions` 와 검사 항목 enum `MdmRuleConfirmCheckItem`(D10). 확정 검사 SPI 자체는 TSK-01-02 의 `VersionConfirmCheckSpi` 를 그대로 쓰고, 엔진 `DefinitionLookup` 서명은 바꾸지 않는다. 계약 패키지가 엔진 타입에 의존할 수 없으므로(F21) `DefinitionLookup` 구현 대상은 테스트 스텁(`RuleDefinitionLookupStub implements DefinitionLookup`)과 매핑표(§6.4)로 선언한다.

검증은 SQLite 에서 한다: 마이그레이션 테스트(제약 동작), JPA 왕복 테스트(매핑), 시나리오 키트 상속(공통 버전 서비스와의 호환), 계약 스텁 컴파일, 계약 전용 가드. MSSQL 은 실행하지 않고(사용자 결정), 두 방언 V8 파일을 파싱해 구조·타입 쌍·MSSQL 전용 규칙을 대조하는 **docker 없는 DDL 대조 테스트**(§3.2)와 사람 체크리스트(§3.3)로 대체한다. 새 MSSQL 테스트 클래스는 추가하지 않는다(D11).

---

## 2. 변경 파일 목록

경로 접두: `B = src/backend/mdm`, `L = B/lib/src/main/java/com/dongkuk/dmes/mdm`, `LT = B/lib/src/test/java/com/dongkuk/dmes/mdm`, `A = B/api/src/main/resources`, `AT = B/api/src/test/java/com/dongkuk/dmes/mdm`, `AM = B/api/src/mssqlTest/java/com/dongkuk/dmes/mdm`.

### 생성

마이그레이션
- `A/db/migration/mdm/sqlite/V8__create_mdm_business_rule.sql`
- `A/db/migration/mdm/mssql/V8__create_mdm_business_rule.sql`

엔티티·리포지토리(`L/entity`, `L/repository`)
- `MdmRule.java`, `MdmRuleVer.java` + `MdmRuleVerId.java`, `MdmRuleVar.java` + `MdmRuleVarId.java`, `MdmRuleRow.java` + `MdmRuleRowId.java`, `MdmRuleTestCase.java` + `MdmRuleTestCaseId.java`, `MdmRuleSet.java`
- `MdmRuleRepository.java`, `MdmRuleVerRepository.java`, `MdmRuleVarRepository.java`, `MdmRuleRowRepository.java`, `MdmRuleTestCaseRepository.java`, `MdmRuleSetRepository.java`(모두 메서드 없음)

SQLite 일시 매핑 인프라(`L/common/support`, D5)
- `MdmSqliteLocalDateTimeConverter.java`(`AttributeConverter<LocalDateTime,String>`, **`@Converter` 를 붙이지 않는다**)
- `MdmSqliteTemporalContributor.java`(`MetadataBuilderContributor`, 위 컨버터를 auto-apply 로 등록)

계약(`L/contract/rule`)
- `package-info.java`(§6.3 선언문·§6.4 매핑 요약)
- `MdmRuleIdKind.java`(enum), `MdmRuleIdRange.java`(record), `MdmRuleIdIssuer.java`(interface)
- `MdmRuleDefinitionSource.java`(enum)
- `MdmRuleDiffConventions.java`(상수 클래스), `MdmRuleConfirmCheckItem.java`(enum)

lib 테스트
- `LT/contract/stub/RuleIdIssuerConsumerStub.java`(TSK-08-02 역)
- `LT/contract/stub/RuleDefinitionLookupStub.java`(TSK-08-04 역, `implements kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup`)
- `LT/contract/rule/MdmRuleContractOnlyArchitectureTest.java`(계약 전용 가드, §3.7)
- `LT/common/support/MdmSqliteLocalDateTimeConverterTest.java`(컨버터 단위 테스트, §3.4)

api 테스트
- `AT/MdmBusinessRuleExpectations.java`(SQLite 테스트와 DDL 대조 테스트가 공유하는 기대값 헬퍼. `MdmInterfaceLayoutExpectations` 관례)
- `AT/MdmBusinessRuleMigrationTest.java`(SQLite, §3.1)
- `AT/MdmBusinessRuleDdlParityTest.java`(docker 없는 두 방언 DDL 대조, §3.2)
- `AT/MdmBusinessRuleEntityJpaRoundtripTest.java`(SQLite JPA 왕복, §3.4)
- `AT/common/version/BusinessRuleVersionScenarioSqliteTest.java`(시나리오 키트 혼합 명세 상속, §3.5)

### 수정

- `A/application-local.yml`: `spring.jpa.properties.hibernate.metadata_builder_contributor: com.dongkuk.dmes.mdm.common.support.MdmSqliteTemporalContributor` 한 줄과 사유 주석(D5). `application-local-db.yml`·`application-wildfly.yml` 은 고치지 않는다.
- `LT/contract/stub/BusinessRuleConfirmCheckStub.java`: diff key 를 `"ROW-1"` 에서 06 관례(`row_id` 10진 문자열, 예 `"15"`)로, 값 맵 키를 `"OUT_VAL"` 에서 `MdmRuleDiffConventions.SEQ`·`CELLS` 로 바꾼다. **다른 Task(TSK-01-02)가 만든 파일이지만 javadoc 이 "TSK-08-01(선언)" 을 이 스텁의 선언 주체로 지목하므로** 이 Task 가 06 관례를 반영한다. 기존 단언(entries 1건, CHANGED, base ver 2)은 그대로 통과한다(F23).
- `LT/contract/stub/ContractStubCompileTest.java`: `// TSK-08-01 §3.6` 절을 추가한다(기존 관례, F23).
- `AT/MdmSharedContractMigrationTest.java`: 메서드명 `flyway_가_V1_V2_V3_V4_를_적용했다` → `flyway_가_V1_V2_V3_V4_V8_을_적용했다`, `Set.of("1","2","3","4")` → `Set.of("1","2","3","4","8")`. **기대값 완화가 아니라 새 버전(V8) 반영이다.**
- `AM/MdmMssqlMigrationTest.java`: `migrationsExecuted` 4→5, `targetSchemaVersion` `"4"`→`"8"`, 집합에 `"8"` 추가, 메서드명에 `_V8` 반영. **컴파일만 확인하고 실행하지 않는다**(사용자 결정).
- `AM/MdmTermDomainColumnMssqlMigrationTest.java`·`AM/MdmInterfaceLayoutMssqlMigrationTest.java`: 집합에 `"8"` 추가, 메서드명에 `_V8` 반영. 컴파일만 확인한다.
- `docs/mdm/naming-dialect-rules.md` §3: #2·#3·#4·#5·#16·#19·#20 의 06 몫을 갱신한다. SQLite 쪽은 `확인(TSK-08-01 실측, SQLite)` 로 바꾸고, MSSQL 쪽은 "미실측: 사용자 결정(도커 금지)으로 TSK-08-01 은 DDL 대조 리뷰로 대체. 실측 필요 유지(담당 미정)" 로 적는다. #18 에 "MSSQL 인덱스·PK·UNIQUE 키 칼럼에 `(N)VARCHAR(MAX)` 금지" 를 규칙으로 더한다(F13). §6.1 의 TSK-08-01 행에 같은 내용을 반영한다.
- `docs/mdm/decisions.md`: Build 완료 때 D1~D11 가운데 되돌리기 어려운 결정을 D-050 부터 append 한다(형제 워크트리와 번호가 겹치면 머지 때 다시 매긴다).

### 수정하지 않음(자동 적용 또는 범위 밖)

- `MdmContractArchitectureTest`·`MdmEntityArchitectureTest`·`MdmFlywayVersionParityTest`: 수정 없이 새 패키지·엔티티·V8 에 자동 적용된다(F22·F24).
- `maru-mdm-engine/**`(엔진 서명 불변, F20), `cactus-core/**`, `MdmTemporalBinder`·`VersionRowStore`·`DefaultVersionTableRegistry`(TSK-01-03 산출물. F12 의 형식 혼재도 고치지 않는다, D6), `contract/common/MdmAuditColumns`(기대값 헬퍼가 `AUD_VER` 치환을 스스로 한다).
- `docs/mdm/erd/06-business-rule.*`(TSK-02-03 소유), `docs/mdm/design/basic/06-business-rule.md`(원천), `docs/mdm/engine-contract.md`(TSK-03-01 소유).

---

## 3. 테스트 전략

**기준선**(오케스트레이터 실측): `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain` → **1878 tests / 0 failures**. 집계는 `find src/backend -path '*/build/test-results/*' -not -path '*mssqlMigrationTest*' -name 'TEST-*.xml' | xargs grep -h -o '<testsuite [^>]*'` 의 tests·failures·errors 합산이다. 게이트 = 기준선 대비 신규 실패 0 + 총수 미감소. `mssqlMigrationTest` 는 제외한다(사용자 결정).

모든 SQLite 스프링 테스트는 기존 패턴을 따른다: `@SpringBootTest(webEnvironment = MOCK) @ActiveProfiles("local")`, `@TempDir static Path` + `@DynamicPropertySource` 로 테스트마다 다른 DB 파일, `@Autowired DataSource`/`JdbcTemplate`. 쓰기는 테스트마다 고유 키(`AtomicInteger`)를 쓰거나 트랜잭션 롤백한다.

### 3.1 `MdmBusinessRuleMigrationTest`(SQLite, `AT`)

1. `flyway_schema_history` 에 버전 `"8"` 이 `success = 1` 로 있다.
2. 8테이블이 모두 있고, 테이블마다 칼럼 **이름 목록(순서 포함)** 이 `MdmBusinessRuleExpectations.expectedColumns(table)` 과 같다(`PRAGMA table_info`). 기대값 = §6.0 업무 칼럼 + 감사 9칼럼(`TB_MDM_RULE_VER`·`RULE_VAR`·`RULE_ROW`·`RULE_RECV` 는 `VER` 대신 `AUD_VER`).
3. `sqlite_master.sql` 텍스트에 §6.0 의 PK·FK·UX·CK 이름이 모두 있다. 감사 `VER`·`AUD_VER` 와 모든 `ROW_VERSION` 선언이 `BIGINT` 다.
4. CHECK 거부(위반 INSERT 가 SQLException): `CK_TB_MDM_RULE_KIND`·`_STATUS`·`_SRC_KIND`·`_SRC_SYS`(MDM+시스템 있음, EXTERNAL+시스템 없음 둘 다), `CK_TB_MDM_RULE_SYSTEM_KIND`, `CK_TB_MDM_RULE_VER_STATUS`·`_HIT`·`_APPLY`(RELEASED+APPLY_FROM NULL)·`_EMERGENCY_YN`, `CK_TB_MDM_RULE_VAR_KIND`·`_DISP`·`_AXIS`·`_DTYPE`·`_AGG`·`_RESULT_NAME`, `CK_TB_MDM_RULE_ROW_KIND`, `CK_TB_MDM_RULE_SET_STATUS`, `CK_TB_MDM_RULE_RECV_REQ`·`_RESULT`.
5. JSON CHECK: 7칼럼(F5) 각각에 부정형 문자열(`'{bad'`)을 넣으면 거부되고, NULL 허용 4칼럼(`VAR_AST`·`PRIO_LIST`·`GRP_COND_AST`·`EXPECTED_JSON`)은 NULL 이 통과한다. `RULE_RECV.BODY` 는 부정형 문자열이 통과한다(JSON CHECK 없음의 대조군).
6. 부분 유일 인덱스: 같은 `(룰, 버전)` 에서 RESULT 두 열의 `VAR_NAME` 이 같으면 거부, COND 두 열은 같은 `VAR_NAME` 이 통과, `(VAR_KIND, SEQ)` 중복 거부. NORMAL 두 행의 `SEQ` 중복 거부, DEFAULT 행 `SEQ = 0` 과 NORMAL 행 `SEQ = 0` 은 공존. `PRAGMA index_list` 의 `partial` 이 `UX_TB_MDM_RULE_VAR_NAME`·`UX_TB_MDM_RULE_ROW_SEQ` 는 1, `UX_TB_MDM_RULE_VAR_SEQ` 는 0.
7. FK: 없는 `SOURCE_SYSTEM`·`SYSTEM_CODE`·`DOMAIN_ID`·`MARU_RULE_ID`(TEST_CASE·VER·RECV) 거부. `RULE_RECV.MARU_RULE_ID` NULL 은 통과(모르는 ID 요청 로그, 06:1099).
8. CASCADE: `RULE_VER` 행을 지우면 그 버전의 `RULE_VAR`·`RULE_ROW` 가 함께 사라진다. `RULE_VER` 이 있는 `RULE` 삭제, `TEST_CASE`·`RULE_SYSTEM`·`RECV` 가 있는 `RULE` 삭제는 거부된다(CASCADE 없음의 대조군).
9. 기본값: `STATUS`(`CREATED`/`DRAFT`/`INUSE`), `LAST_*_ID = 0`, `ROW_VERSION = 0`, `EMERGENCY_YN = 'N'`, `DEPLOY_KIND = 'DEF'`, `RULE_ROW.SEQ = 0`, `COLLECT_AGG = 'LIST'`(칼럼을 생략한 INSERT).
10. 규칙표 06 몫 SQLite 실측: #2 `RECV_ID` AUTOINCREMENT 가 지운 최댓값을 재사용하지 않는다. #4 `json_each(CELLS)` 의 `typeof(key)` 는 `text`, `json_each(RULE_IDS)` 는 `integer` 이고 순번이 0부터다. #5 `json_extract(CELLS, '$."1".op')` 가 값을 돌려준다. #19 대소문자만 다른 `MARU_RULE_ID`(`'QLTY_A'`/`'qlty_a'`)가 서로 다른 행으로 들어간다. #20 위 6번.
11. 양성 픽스처: 06 샘플(06:1293-1338)을 그대로 넣으면 모두 통과한다(QLTY_GRD_JDG 의 RULE·SYSTEM·VER·VAR 5·ROW 4·TEST_CASE, LS_A3 세트, EQP_CHK_JDG 의 RECV). 도메인 열은 V3 `TB_MDM_DOMAIN` 행을 먼저 넣어 쓰고, `QMS` 는 `APS` 로 바꾼다(F28). `DISP_TYPE` 값 `'2'`·`'1'`·`'Value'`·`'Expression'` 이 CHECK 를 통과해야 한다.
12. **계약 전용 가드(런타임)**: 이 테스트의 평범한 컨텍스트(가짜 빈 없음)에서 `VersionConfirmCheckSpi` 빈 가운데 `target() == BUSINESS_RULE` 인 것이 0개, `VersionDraftDeletionSpi` 빈 가운데 `target() == BUSINESS_RULE` 인 것도 0개, `MdmRuleIdIssuer` 빈 0개, `DefinitionLookup` 빈 0개다(`ApplicationContext.getBeansOfType`). 해제 조건은 §7 인계에 적는다.

### 3.2 `MdmBusinessRuleDdlParityTest`(docker 없는 두 방언 DDL 대조, `AT`)

스프링을 띄우지 않는 순수 JUnit 이다. 클래스패스의 `db/migration/mdm/{sqlite,mssql}/V8__create_mdm_business_rule.sql` 과, FK 대상 타입 확인용으로 `mssql/V2`·`mssql/V3` 를 읽는다. 새 의존성은 쓰지 않는다(정규식 + 괄호 깊이 기반 분할).

**파서 규격**: 주석(`--`) 제거 → `;` 로 문장 분할 → `CREATE TABLE name ( … )` 의 본문을 괄호 깊이 0 의 쉼표로 나눠 칼럼 정의와 `CONSTRAINT` 줄로 가른다. SQLite 인라인 제약(`CONSTRAINT CK_… CHECK (…)`, `CONSTRAINT PK_… PRIMARY KEY AUTOINCREMENT`)은 칼럼 정의에서 떼어 테이블 제약으로 옮긴다. `CREATE UNIQUE INDEX name ON table (cols) [WHERE pred]` 와 MSSQL `ALTER TABLE` 을 읽는다. 정규화: 대문자화, 공백 압축, 인용(`"X"`·`[X]`) 제거, `DEFAULT ('X')`↔`DEFAULT 'X'`, `DEFAULT (0)`↔`DEFAULT 0`, MSSQL `CONSTRAINT DF_… DEFAULT` 의 이름 분리.

| # | 판별 항목 | MSSQL 쪽만 바꾸는 변이 예 |
|---|---|---|
| P1 | 테이블 집합이 같고 8개다 | MSSQL 에서 `TB_MDM_RULE_SET` 제거 |
| P2 | 테이블마다 칼럼 이름 목록(순서 포함)이 같다 | MSSQL `RULE_VAR` 에서 `RES_GRP` 제거 또는 순서 교체 |
| P3 | 칼럼마다 NOT NULL 여부가 같다 | MSSQL `CELLS` 를 `NULL` 로 |
| P4 | PK 이름·칼럼 목록이 같다 | MSSQL `PK_TB_MDM_RULE_ROW` 에서 `VER` 제거 |
| P5 | FK 이름·칼럼·참조 테이블·참조 칼럼·CASCADE 여부가 같고, CASCADE 는 `FK_TB_MDM_RULE_VAR_VER`·`FK_TB_MDM_RULE_ROW_VER` 두 개뿐이다 | MSSQL `FK_TB_MDM_RULE_VER_RULE` 에 `ON DELETE CASCADE` 추가 |
| P6 | UX 이름·칼럼·WHERE 식(정규화)이 같다 | MSSQL `UX_TB_MDM_RULE_ROW_SEQ` 의 `WHERE` 제거 |
| P7 | CK 이름 집합이 같고, JSON CHECK 를 뺀 CK 는 본문(정규화)도 같다 | MSSQL `CK_TB_MDM_RULE_VER_HIT` 에서 `'ANY'` 제거 |
| P8 | DEFAULT 가 있는 칼럼과 리터럴이 같다 | MSSQL `EMERGENCY_YN` 기본값을 `'Y'` 로 |
| P9 | 칼럼마다 (SQLite 타입, MSSQL 타입) 쌍이 허용 목록 안에 있다(아래 표) | MSSQL `LAST_VAR_ID` 를 `BIGINT` 로 |
| P10 | JSON CHECK 가 정확히 F5 의 7칼럼에만 있다: SQLite `json_valid(COL)`, MSSQL `ISJSON(COL) = 1`, 이름 `CK_{테이블}_{칼럼}_JSON`, NULL 허용 여부에 맞는 `COL IS NULL OR` | MSSQL `CK_TB_MDM_RULE_SET_RULE_IDS_JSON` 제거 |
| P11 | (MSSQL 전용) PK·UX·FK 의 키 칼럼에 `VARCHAR(MAX)`·`NVARCHAR(MAX)` 가 없다(F13) | MSSQL `VAR_NAME` 을 `VARCHAR(MAX)` 로 |
| P12 | (MSSQL 전용) 감사 칼럼(`*_USR_ID`·`*_SVC_ID`·`*_PGM_ID`)을 뺀 길이 지정 `VARCHAR(n)` 에는 모두 `COLLATE Latin1_General_100_BIN2` 가 있다 | MSSQL `OWNER_ID` 의 `COLLATE` 제거 |
| P13 | (MSSQL 전용) FK 칼럼 타입이 참조 칼럼 타입과 같다. 참조가 V2·V3 이면 그 파일에서 읽는다(`DOMAIN_ID BIGINT`, `SYSTEM_CODE VARCHAR(20) BIN2`) | MSSQL `RULE_VAR.DOMAIN_ID` 를 `INT` 로 |
| P14 | (MSSQL 전용) `DEFAULT` 는 모두 `CONSTRAINT DF_{테이블}_{칼럼}` 이름을 갖는다. `IDENTITY(1,1)` 은 `RULE_RECV.RECV_ID` 에만 있다 | MSSQL `DF_TB_MDM_RULE_STATUS` 이름 제거 |
| P15 | 방언 금지 토큰: SQLite 파일에 `COLLATE`·`ISJSON`·`NVARCHAR`·`DATETIME2`·`IDENTITY`·`[`·`]` 없음, MSSQL 파일에 `AUTOINCREMENT`·`json_valid`·`IF NOT EXISTS`·큰따옴표 식별자·` TEXT`·`TIMESTAMP` 없음 | MSSQL 에 `"RESULT"` 표기 |
| P16 | MSSQL 테이블 생성 순서가 FK 참조 순서를 지킨다(참조되는 테이블이 앞) | MSSQL 에서 `RULE_VAR` 를 `RULE_VER` 앞으로 |

타입 쌍 허용 목록(P9):

| 분류 | SQLite | MSSQL | 적용 칼럼 |
|---|---|---|---|
| 코드·키 | `VARCHAR(n)` | `VARCHAR(n) COLLATE Latin1_General_100_BIN2`(같은 n) | 코드값·ID·사용자 ID 칼럼 |
| 감사 문자 | `VARCHAR(100)` | `VARCHAR(100)` | `C_USR_ID`·`C_SVC_ID`·`C_PGM_ID`·`U_*` |
| 감사 일시 | `TIMESTAMP` | `DATETIME2` | `C_AT`·`U_AT` |
| 감사 카운터 | `BIGINT` | `BIGINT` | `VER`(감사)·`AUD_VER` |
| 업무 일시 | `TEXT` | `DATETIME2(0)` | `APPLY_*`·`*_AT`(감사 제외)·`RECEIVED_AT`·`PROCESSED_AT` |
| 자유서술 | `TEXT` | `NVARCHAR(MAX)` | `DESCRIPTION`·`USAGE_NOTE`·`*_REASON`·`NOTE`·`BODY`·`RESULT_DETAIL`·JSON 7칼럼 |
| 이름 | `TEXT` | `NVARCHAR(100)` | `MARU_RULE_NAME`·`MARU_RULE_SET_NAME`·`LABEL`·`CASE_NAME` |
| 식 | `TEXT` | `VARCHAR(MAX)` | `GRP_COND`(V3 `STD_RULE` 관례) |
| 변수명 | `TEXT` | `VARCHAR(1000) COLLATE Latin1_General_100_BIN2` | `VAR_NAME` 만(D3) |
| 정수 | `INTEGER` | `INT` | `VER`(업무)·`BASE_VER`·`VAR_ID`·`ROW_ID`·`CASE_ID`·`SEQ`·`LAST_*_ID` |
| 큰 정수 | `BIGINT` | `BIGINT` | `ROW_VERSION` |
| FK→IDENTITY PK | `INTEGER` | `BIGINT` | `DOMAIN_ID` 만 |
| 서버 채번 PK | `INTEGER … PRIMARY KEY AUTOINCREMENT` | `BIGINT IDENTITY(1,1)` | `RECV_ID` 만 |

**Build 변이 의무**: P1~P16 각각에 대해 표의 변이를 MSSQL 파일에 실제로 넣어 이 테스트가 빨개지는지 확인하고 원복한다. 안 빨개지는 항목은 은폐하지 않고 보고한다.

### 3.3 MSSQL DDL 줄 단위 리뷰 체크리스트(사람, Build 작성 직후와 Verify 에서 각 1회)

파서가 T-SQL 문법 자체의 정당성은 증명하지 못하므로 아래를 사람이 눈으로 확인하고 결과를 design.md 「Build 기록」·「Verify 기록」에 표로 남긴다(항목별 ✓/✗ 와 근거 줄 번호).

1. 두 파일을 나란히 열어 테이블·칼럼을 줄 단위로 대응시켰다(칼럼 순서 동일).
2. 모든 문장이 `;` 로 끝나고, MSSQL 에 `GO` 가 없다(Flyway 는 `GO` 를 쓰지 않는 기존 V2~V4 관례).
3. 필터 인덱스 문법 `CREATE UNIQUE INDEX … ON … (…) WHERE …` 이 V3 `UX_TB_MDM_TERM_ABBR` 와 같은 모양이다. 필터 식에는 비교·`AND`·`IS [NOT] NULL` 만 있다(MSSQL 필터 인덱스는 `OR`·함수를 받지 않는다).
4. `UX_TB_MDM_RULE_VAR_NAME` 키 크기 = `MARU_RULE_ID` 50 + `VER` 4 + `VAR_NAME` 1000 = 1,054바이트 ≤ 1,700바이트(비클러스터 인덱스 한도). `UX_TB_MDM_RULE_VAR_SEQ`·`UX_TB_MDM_RULE_ROW_SEQ` 도 한도 안이다.
5. CHECK 식이 다른 칼럼만 참조하고 함수는 `ISJSON` 뿐이다. 문자열 리터럴이 SQLite 와 글자까지 같다(대소문자 포함, `'Equal'` 등).
6. `[RESULT]` 인용이 칼럼 정의와 CHECK 식 양쪽에 있다.
7. `IDENTITY(1,1)` 칼럼에 DEFAULT 가 없다. `ON DELETE CASCADE` 두 FK 가 가리키는 `RULE_VER` 로 가는 cascade 경로가 각각 하나뿐이다(규칙표 #14).
8. 제약 이름이 모두 128자 이하이고 V2~V4 의 이름과 겹치지 않는다.
9. V2·V3 의 참조 칼럼과 타입·길이·콜레이션이 같다(P13 결과를 눈으로 재확인).

### 3.4 `MdmBusinessRuleEntityJpaRoundtripTest`(SQLite, `AT`) 와 `MdmSqliteLocalDateTimeConverterTest`(`LT`)

`ddl-auto: none` 이라 부팅이 매핑 오류를 다 잡지 못하므로 6엔티티 각각을 저장→`flush`→`clear`→`findById` 로 왕복한다. 복합 PK 4종(`MdmRuleVerId`·`VarId`·`RowId`·`TestCaseId`)을 포함한다.

1. **AUD_VER 재정의**: `MdmRuleVer`·`MdmRuleVar`·`MdmRuleRow` 를 저장하면 `AUD_VER = 0`, 업무 `VER` 는 넣은 값이다. 업무 필드를 바꿔 `flush` 하면 `AUD_VER` 가 1 오르고 업무 `VER` 는 그대로다(JDBC 로 두 칼럼을 직접 읽어 확인).
2. **서비스 소유 칼럼 `updatable = false`(D7)**: `MdmRule` 을 읽어 영속 상태로 둔 채 JDBC 로 `LAST_VAR_ID = 5`·`STATUS = 'INUSE'` 를 바꾸고, 엔티티의 `maruRuleName` 만 바꿔 `flush` 한다. 그 뒤 JDBC 로 읽은 `LAST_VAR_ID` 가 5, `STATUS` 가 `INUSE` 로 남아 있어야 한다. `MdmRuleVer` 도 같은 절차로 `ROW_VERSION`·`STATUS`·`OWNER_ID`·`APPLY_FROM` 이 되돌아가지 않음을 확인한다. `MdmRuleTestCase`·`MdmRuleSet` 의 `ROW_VERSION` 도 같다.
3. **`ROW_VERSION` 은 `@Version` 이 아니다**: 업무 필드 변경 `flush` 뒤에도 `rowVersion` 이 그대로다.
4. **SQLite 업무 일시(D5)**: `MdmRuleVer.applyFrom = 2026-10-01T00:00:00.789` 로 저장하면 `typeof(APPLY_FROM) = 'text'`, 값이 `'2026-10-01 00:00:00'`(초 단위 절삭)이다. 반대로 JDBC 로 `'2026-09-21 10:00:00'` 을 넣은 행을 엔티티로 읽으면 `LocalDateTime.of(2026,9,21,10,0,0)` 이다.
5. **JSON CHECK 가 엔티티 경로에도 걸린다**: `MdmRuleRow.cells = "{bad"` 로 `flush` 하면 예외.
6. **보류 테이블 엔티티 없음(D1)**: `entityManager.getMetamodel().getEntities()` 의 테이블 이름 집합이 06 활성 6테이블을 포함하고 `TB_MDM_RULE_SYSTEM`·`TB_MDM_RULE_RECV` 를 포함하지 않는다(`MdmEntityJpaRoundtripTest.java:178` 관례).
7. **컨버터가 MSSQL 에 새지 않는다(D5, 정적 검사)**: `MdmSqliteLocalDateTimeConverter` 에 `jakarta.persistence.Converter` 어노테이션이 없고, 클래스패스 `application-local-db.yml`·`application-wildfly.yml` 텍스트에 `metadata_builder_contributor` 가 없다.

`MdmSqliteLocalDateTimeConverterTest`(순수 단위): 쓰기는 `yyyy-MM-dd HH:mm:ss` 로 초 단위 절삭, 읽기는 공백·`T` 구분과 소수초를 받고 앞 19자만 쓴다(`MdmTemporalBinder.fromDb` 와 같은 규칙), null↔null. 같은 입력에 대해 `MdmTemporalBinder` 의 SQLite 문자열과 글자까지 같음을 단언한다(바인더는 `MdmDialectResolver` 스텁으로 SQLITE 를 주어 만든다).

### 3.5 `BusinessRuleVersionScenarioSqliteTest`(`AT/common/version`, 시나리오 키트 상속)

TSK-01-03 인계 ③(F8)을 이행한다. `@SpringBootTest(MOCK) @ActiveProfiles("local") @Import({VersionScenarioTestConfig.class, MixedRegistry.class})`, `@TempDir` DB.

- **혼합 명세**: `@Primary VersionTableRegistry` 빈이 `MASTER_CODE → VersionFixtureTables.CODE_SPEC`, `BUSINESS_RULE → new DefaultVersionTableRegistry().spec(BUSINESS_RULE)` 를 돌려준다(F9).
- `createSchema`: `VersionFixtureTables.sqliteDdl()` 를 그대로 실행한다(쓰이지 않는 룰 픽스처도 함께 생기지만 무해하다). 실제 06 테이블은 Flyway 가 이미 만들었다.
- `clearTables`: `VersionFixtureTables.clear(jdbc)` 뒤에 실제 테이블을 자식부터 지운다: `TB_MDM_RULE_RECV` → `TB_MDM_RULE_TEST_CASE` → `TB_MDM_RULE_SYSTEM` → `TB_MDM_RULE_VER`(VAR·ROW 는 CASCADE) → `TB_MDM_RULE`.
- `seedObject` 재정의: `BUSINESS_RULE` 이면 `TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND, SOURCE_SYSTEM, STATUS, U_USR_ID, VER)` 에 `(id, id, 'DECISION', 'MDM', NULL, status, uUsrId, auditCounter)` 를 넣는다. `MASTER_CODE` 는 `super` 에 맡긴다. `seedVersion` 은 재정의하지 않는다(F9).
- 키트의 S1~S24 가 모두 통과해야 한다(MASTER_CODE 는 픽스처, S15 는 실제 `TB_MDM_RULE_VER`). S14·S24 는 SQLite 하위 클래스 전용이라 이 클래스에는 없다.
- 이 클래스에 더하는 06 전용 시나리오:
  - **R1 JPA 쓰기 → 네이티브 확정 → JPA 읽기**(F12 의 형식 혼재 실측): `MdmRule`·`MdmRuleVer`(v1 RELEASED, `applyFrom` 2026-01-01 00:00:00, `applyTo` 9999-12-31 00:00:00)와 v2 DRAFT 를 **리포지토리로** 저장한다. 시계를 `2026-06-20 09:08:07` 로 두고 v2 를 `versionStateService` 로 확정한다. `entityManager.clear()` 뒤 `findById` 로 읽은 v1 의 `applyTo` 가 확정 apply_from 과 같고, v2 는 `RELEASED`, `rowVersion` 이 1 올랐으며, 부모 `MdmRule.status` 가 `INUSE` 다. `getUpdatedAt()` 읽기가 **예외 없이** 끝나야 한다. 그 값이 시계(KST)와 몇 시간 차이인지를 Build 가 실측해 「Build 기록」에 적는다(F12 실험상 9시간 차이가 예상된다). 이 차이는 단언하지 않는다(D6). 반면 업무 `LocalDateTime` 칼럼(`applyFrom`·`applyTo`·`releasedAt`)은 정확히 같아야 한다.
  - **R2 DRAFT 삭제가 VAR·ROW 를 CASCADE 로 지운다**: v1 DRAFT 에 `RULE_VAR` 2행·`RULE_ROW` 2행을 넣고 `versionStateService.deleteDraft` 를 부르면(가짜 `FakeDraftDeletion(BUSINESS_RULE)` 등록) 네 행이 모두 사라진다.
  - **R3 실제 테이블의 네이티브 쓰기 형식**: 확정 뒤 `typeof(APPLY_FROM)`·`typeof(APPLY_TO)`·`typeof(RELEASED_AT)` 가 `text` 이고 값이 KST 초 단위 문자열이다(S24 의 실제 테이블판).
  - **R4 소유권 전이가 실제 테이블에서 돈다**: `ownershipService.release` → `acquire` 로 `OWNER_ID` 가 바뀌고 `ROW_VERSION` 이 1씩 오르며 `AUD_VER` 가 오른다.
- **빨개질 때의 규칙**: S15·R1~R4 가 실제 테이블에서만 빨개지면 공통 서비스(`VersionRowStore` 등)를 고치지 않는다. 원인이 V8 DDL 이면(예: `CK_TB_MDM_RULE_VER_APPLY` 가 서비스의 UPDATE 순서와 충돌) DDL 을 고치고 그 결정을 design.md 에 새 D 항목으로 추기한다. 원인이 서비스·바인더면 D 항목으로 올리고 멈춰 보고한다.

### 3.6 계약 스텁 컴파일(`ContractStubCompileTest` 의 `// TSK-08-01 §3.6` 절)

- `RuleIdIssuerConsumerStub`(08-02 역): `MdmRuleIdIssuer` 만 알고, 새 행 N개에 `issue(ruleId, ROW, N)` 로 받은 구간을 차례로 붙인다. 테스트는 메모리 카운터로 구현한 익명 발급기로 `issue(…, ROW, 3)` → `first = 5, last = 7`(카운터 4에서 시작) 이고, 구간 길이가 `last - first + 1 == count` 임을 확인한다. 세 `MdmRuleIdKind` 의 `counterColumn()` 이 `LAST_VAR_ID`·`LAST_ROW_ID`·`LAST_CASE_ID` 다.
- `RuleDefinitionLookupStub implements DefinitionLookup`(08-04 역): 메모리의 `MdmRuleVer`·`MdmRuleVar`·`MdmRuleRow` 엔티티(06 샘플 QLTY_GRD_JDG v1)로 `RuleDefinition` 을 만든다. §6.4 매핑표의 스칼라 대응만 한다(`DOMAIN_ID Long → String`, `HIT_POLICY`·`RULE_KIND`·`VAR_KIND`·`ROW_KIND` 는 `valueOf`, `DISP_TYPE` 은 D4 대응표). 셀 JSON 파싱·생성 텍스트·입력 계약은 하지 않고 빈 값으로 둔다(08-04 몫). `column()` 은 `Optional.empty()`, `ruleSet()` 은 `MdmRuleSet` 에서 만든다. 테스트는 변수 5·행 4, DEFAULT 행 `seq == 0`, `vars[3].domainId` 가 문자열, `dispType` 이 `TWO, ONE, ONE, VALUE, EXPRESSION` 순서임을 단언한다.
- 갱신한 `BusinessRuleConfirmCheckStub`: diff 첫 항목의 key 가 10진 정수 문자열(`Integer.parseInt` 성공)이고 값 맵 키 집합이 `{SEQ, CELLS}` 다. `MdmRuleDiffConventions.SEQ == "SEQ"`, `CELLS == "CELLS"`.
- `MdmRuleConfirmCheckItem.values()` 가 정확히 `SAVE_CHECKS, NOT_EMPTY, TEST_CASES, RESULT_VAR_RELEASED` 넷이다(룰 참조 검사가 없음을 이름 집합으로 고정). `MdmRuleDefinitionSource.values()` 가 `STORED_VERSION, REQUEST_BODY` 둘이다.

### 3.7 계약 전용 가드 `MdmRuleContractOnlyArchitectureTest`(`LT`, 정적)

`importPackages("com.dongkuk.dmes.mdm")` + `DO_NOT_INCLUDE_TESTS`.
1. `MdmRuleIdIssuer` 를 구현하는 main 클래스가 없다.
2. 06 리포지토리 6개(`MdmRule*Repository`)는 메서드를 선언하지 않는다(`getDeclaredMethods().length == 0`, 리플렉션).
3. 공허 통과 방지: 1번 규칙을 테스트 전용 위반 샘플 클래스(`LT/contract/rule/violation/ViolatingIssuer`)에 적용하면 위반으로 잡힌다(`MdmContractArchitectureTest` 규칙 10 관례. 샘플은 `ClassFileImporter` 로 직접 가져온다).

`DefinitionLookup` 은 정적 규칙으로 막지 않는다(F32: 02 영역이 빈 등록 없는 익명 빈 구현을 main 에 둘 예정이다). `DefinitionLookup` 부재는 §3.1-12 의 런타임 빈 검사만 본다. §3.1-12 와 합쳐 "실행 로직 없음"을 증명한다. 계약 패키지 자체의 모양은 `MdmContractArchitectureTest` 가 자동으로 본다(F22).

### 3.8 ArchUnit 자동 적용

`MdmContractArchitectureTest`(계약 모양·엔진/JPA 비의존)와 `MdmEntityArchitectureTest`(연관관계 금지)가 수정 없이 `contract.rule`·새 엔티티에 적용된다. 새 클래스를 넣은 뒤 이 두 테스트가 초록인지 Build 가 확인한다.

### 3.9 화면(브라우저 E2E) 스모크 넷

**해당 없음.** `entry-point: -` 이고 `domain: database` 인 계약 전용 작업이라 dev-discipline 「화면 작업의 브라우저 E2E」 트리거(entry-point 존재 또는 domain fullstack/frontend)에 해당하지 않는다. 룰 화면 e2e 는 TSK-08-02~06 이 각자 맡는다.

### 3.10 Build 가 실행할 검증 명령

```bash
# 1) 좁은 범위(개발 중 반복)
cd /Users/jji/project/dmes-standard/dflow-84b388b9/src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :lib:test :api:test --no-daemon --console=plain
# 2) MSSQL 테스트 소스는 컴파일만(도커를 쓰지 않는다. mssqlMigrationTest 실행 금지)
cd /Users/jji/project/dmes-standard/dflow-84b388b9/src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:compileMssqlTestJava --no-daemon --console=plain
# 3) 게이트(기준선 1878/0 대비 신규 실패 0 + 총수 미감소)
cd /Users/jji/project/dmes-standard/dflow-84b388b9/src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain
find src/backend -path '*/build/test-results/*' -not -path '*mssqlMigrationTest*' -name 'TEST-*.xml' | xargs grep -h -o '<testsuite [^>]*'
# 4) 다른 Task 산출물 불변 확인(출력이 비어야 한다)
/usr/bin/git diff --stat 78813e9 -- src/backend/maru-mdm-engine src/backend/cactus-core src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version
```

---

## 4. 수용 기준 매핑

| spec 수용 기준·요구사항 | 검증 방법 |
|---|---|
| 실행 로직 없음(contract-only) | §3.7 정적 가드(발급기 구현 0, 리포지토리 메서드 0) + §3.1-12 런타임 가드(BUSINESS_RULE 확정·삭제 SPI 빈 0, 발급기·`DefinitionLookup` 빈 0) + `MdmContractArchitectureTest` 자동 적용(계약 패키지는 선언만). 유일한 예외인 SQLite 일시 컨버터는 영속성 매핑 인프라이고 업무 로직이 아니다(D5, 불변 규칙 19) |
| 06 테이블 8개 Flyway 두 방언(JSON 칼럼) | §3.1(SQLite 제약 동작), §3.2(두 방언 구조·타입·JSON CHECK 대조), §3.3(MSSQL 줄 단위 리뷰). 사용자 결정: 도커 금지로 MSSQL 실측 생략, DDL 리뷰로 대체 |
| 엔티티 | §3.4(6엔티티 왕복, AUD_VER, updatable=false, 일시), §3.5(공통 버전 서비스와 같은 행 공유), §3.8 |
| 식별자 발급(last_var_id 등) 인터페이스 | §6.3 `MdmRuleIdIssuer`, §3.6 소비자 스텁 컴파일, §3.1-9(카운터 기본값 0) |
| 엔진 DefinitionLookup 구현 대상 선언 | §6.4 매핑표·어긋남, `MdmRuleDefinitionSource`, §3.6 `RuleDefinitionLookupStub` 컴파일·샘플 단언. 엔진 서명 불변은 §3.10-4 |
| 확정 검사 SPI(row_id diff·확정 검사) 구현 대상 선언 | §6.5 `MdmRuleDiffConventions`·`MdmRuleConfirmCheckItem`, 갱신한 `BusinessRuleConfirmCheckStub`, §3.6 |
| 선행 인계(TSK-01-03 ①~④) | ① §3.4-1, ② §3.1-2·§3.5, ③ §3.5, ④ §3.4-4·§3.5-R1 |
| 규칙표 06 몫(#2~#5·#16·#19·#20) | SQLite: §3.1-5·6·10, §3.4-4. MSSQL: 미실측(사용자 결정), §3.2 P10·P11·P12 로 DDL 대조 |

---

## 5. 불변 규칙: 이 작업에서 바꾸면 안 되는 것 (규칙 · 변이 · 빨개지는 테스트)

1. **8테이블의 칼럼 목록(이름·순서)은 §6.0 표와 같고 두 방언이 같다.** 변이: SQLite 에서 `RES_GRP` 제거 → §3.1-2. MSSQL 에서만 제거 → §3.2 P2.
2. **`RULE_VER`·`RULE_VAR`·`RULE_ROW`·`RULE_RECV` 의 감사 카운터는 `AUD_VER` 이고, 앞의 세 엔티티는 `@AttributeOverride(name="version", column=@Column(name="AUD_VER"))` 를 갖는다.** 변이: `MdmRuleVer` 에서 재정의 제거 → `VER` 이 두 번 매핑되어 부팅 실패 → api 의 모든 SpringBootTest, 특히 §3.4 가 빨개진다. DDL 에서 `AUD_VER` 를 `VER` 로 → `CREATE TABLE` 실패로 모든 SQLite 스프링 테스트가 빨개진다.
3. **SQLite 감사 `VER`·`AUD_VER`, 모든 `ROW_VERSION` 은 `BIGINT` 다.** 변이: `ROW_VERSION INTEGER` → §3.1-3.
4. **JSON CHECK 는 정확히 7칼럼에 있고 NULL 허용 칼럼만 NULL 을 통과시킨다.** 변이: SQLite `CK_TB_MDM_RULE_ROW_CELLS_JSON` 제거 → §3.1-5. MSSQL 에서만 제거 → §3.2 P10. `BODY` 에 JSON CHECK 추가 → §3.1-5 대조군.
5. **CASCADE 는 `FK_TB_MDM_RULE_VAR_VER`·`FK_TB_MDM_RULE_ROW_VER` 둘에만 있다.** 변이: `FK_TB_MDM_RULE_VER_RULE` 에 CASCADE 추가 → §3.1-8(RULE 삭제 거부가 성공으로 바뀜). VAR 의 CASCADE 제거 → §3.1-8·§3.5-R2.
6. **부분 유일 인덱스 3개(`UX_TB_MDM_RULE_VAR_SEQ`, `UX_TB_MDM_RULE_VAR_NAME` WHERE RESULT, `UX_TB_MDM_RULE_ROW_SEQ` WHERE NORMAL)를 유지한다.** 변이: `UX_TB_MDM_RULE_VAR_NAME` 의 WHERE 제거 → §3.1-6(COND 같은 이름이 거부됨). 인덱스 제거 → §3.1-6(중복 통과).
7. **결과 열 `VAR_NAME` 은 NULL 일 수 없다(`CK_TB_MDM_RULE_VAR_RESULT_NAME`).** 변이: CHECK 제거 → §3.1-4.
8. **`DISP_TYPE` 은 `'Equal','1','2','Expression','Value'` 또는 NULL 이다(`CK_TB_MDM_RULE_VAR_DISP`).** 변이: 목록을 엔진 enum 이름으로 바꿈 → §3.1-11(06 샘플 거부). CHECK 제거 → §3.1-4.
9. **MSSQL 인덱스·PK·FK 키 칼럼에 MAX 타입이 없고 `VAR_NAME` 은 `VARCHAR(1000) COLLATE BIN2` 다.** 변이: `VARCHAR(MAX)` → §3.2 P11(+P9).
10. **MSSQL 길이 지정 비감사 `VARCHAR` 에는 BIN2 콜레이션이 있다.** 변이: `OWNER_ID` 의 `COLLATE` 제거 → §3.2 P12.
11. **MSSQL FK 칼럼 타입은 V2·V3 참조 칼럼 타입과 같다.** 변이: `DOMAIN_ID INT` → §3.2 P13.
12. **두 방언의 CHECK·DEFAULT·UX·FK 가 같다.** 변이: MSSQL `CK_TB_MDM_RULE_VER_HIT` 에서 `'ANY'` 제거 → §3.2 P7. 기본값 변경 → P8.
13. **Flyway V 번호 집합은 두 방언이 같고 `{1,2,3,4,8}` 이다.** 변이: MSSQL V8 파일을 빼 둠 → `MdmFlywayVersionParityTest`(기존, 자동). SQLite V8 을 `V5` 로 바꿈 → `MdmSharedContractMigrationTest`.
14. **보류 2테이블(`RULE_SYSTEM`·`RULE_RECV`)에는 엔티티·리포지토리가 없다(D1).** 변이: `MdmRuleRecv` 엔티티 추가 → §3.4-6.
15. **엔티티는 JPA 연관관계를 쓰지 않는다(FK 는 원시 필드).** 변이: `MdmRuleVar` 에 `@ManyToOne MdmRuleVer` → `MdmEntityArchitectureTest`(자동).
16. **서비스 소유 칼럼은 `updatable = false` 다(D7)**: `MdmRule.status`·`lastVarId`·`lastRowId`·`lastCaseId`, `MdmRuleVer.status`·`ownerId`·`applyFrom`·`applyTo`·`requestedBy`·`requestedAt`·`releasedAt`·`rowVersion`, `MdmRuleTestCase.rowVersion`, `MdmRuleSet.rowVersion`. 변이: `lastVarId` 의 `updatable = false` 제거 → §3.4-2(5가 0으로 되돌아감).
17. **`ROW_VERSION` 은 `@Version` 이 아니다.** 변이: `@Version` 추가 → §3.4-3(값이 오름) 또는 부팅 실패.
18. **SQLite 업무 일시는 `'yyyy-MM-dd HH:mm:ss'` 텍스트로 저장·읽기되고, 이 형식은 `MdmTemporalBinder` 와 글자까지 같다.** 변이: `application-local.yml` 의 contributor 줄 제거 → §3.4-4(`typeof = integer`)·§3.5-R1. 컨버터 쓰기 형식을 `.SSS` 로 → `MdmSqliteLocalDateTimeConverterTest`·§3.4-4.
19. **SQLite 일시 컨버터는 MSSQL 경로에 적용되지 않는다(`@Converter` 없음, local 프로파일에만 등록). 이 컨버터와 contributor 가 이 Task 의 유일한 실행 main 코드다.** 변이: 컨버터에 `@Converter(autoApply = true)` 추가 → §3.4-7. `application-local-db.yml` 에 contributor 추가 → §3.4-7.
20. **`contract.rule` 은 인터페이스·enum·record·상수 클래스만 두고, 엔진·Spring·JPA 에 의존하지 않는다.** 변이: `MdmRuleIdIssuer` 에 default 메서드 추가 → `MdmContractArchitectureTest.계약_인터페이스의_메서드는_모두_추상이다`. `contract.rule` 에 `DefinitionLookup` 을 확장하는 인터페이스 추가 → `계약_패키지는_엔진_타입에_의존하지_않는다`.
21. **업무 실행 구현(발급기·`DefinitionLookup` 구현·BUSINESS_RULE 확정/삭제 SPI 빈)을 이 Task 에 넣지 않고, 06 리포지토리는 메서드를 선언하지 않는다.** 변이: `common` 에 `@Component class DefaultRuleIdIssuer implements MdmRuleIdIssuer` 추가 → §3.7-1·§3.1-12. `@Component` 로 등록한 `DefinitionLookup` 구현 추가 → §3.1-12. `MdmRuleRepository` 에 `@Query` 메서드 추가 → §3.7-2. 빈으로 등록하지 않은 `DefinitionLookup` 구현 클래스는 잡지 못한다: **알려진 커버리지 갭**(F32 때문에 정적 가드를 두지 않았다).
22. **엔진 `DefinitionLookup` 서명을 바꾸지 않는다.** 변이: `rule(String, Instant)` 의 인자 변경 → `RuleDefinitionLookupStub` 컴파일 실패(§3.6). 엔진 파일의 다른 변경(주석 등)은 테스트가 잡지 못한다: **알려진 커버리지 갭**이며 §3.10-4 의 `git diff --stat` 이 비어 있는지로만 확인한다.
23. **`MdmRuleIdIssuer.issue(String, MdmRuleIdKind, int) → MdmRuleIdRange` 서명과 `MdmRuleIdKind.counterColumn()` 값을 유지한다.** 변이: `count` 인자 제거 → `RuleIdIssuerConsumerStub` 컴파일 실패. `counterColumn` 값 변경 → §3.6 단언.
24. **06 diff 관례: key = `row_id` 10진 문자열, 값 맵 키 = `SEQ`·`CELLS`. 확정 검사 항목은 넷이고 룰 참조 검사가 없다.** 변이: `MdmRuleDiffConventions.CELLS = "CELL"` → §3.6. `MdmRuleConfirmCheckItem` 에 `RULE_REFERENCE` 추가 → §3.6.
25. **실제 `TB_MDM_RULE_VER`·`TB_MDM_RULE` 가 공통 버전 서비스 명세(F7)와 맞는다.** 변이: DDL 에서 `OWNER_ID` 를 `OWNER` 로 개명 → §3.5 S15·R1·R4(+§3.1-2). `ROW_VERSION` 기본값 제거 → §3.5 `seedVersion` 은 값을 넣으므로 통과하고 §3.1-9 가 잡는다.
26. **기존 테스트의 버전 기대값 수정은 추가(`"8"`)이지 완화가 아니다.** 변이: `MdmSharedContractMigrationTest` 를 `containsAll` 로 느슨하게 바꿈 → 리뷰가 잡는다. 이것은 테스트로 잡을 수 없는 **알려진 커버리지 갭**이며 Verify 가 diff 로 확인한다.
27. **`MdmDomainReferenceSpi`(refKind `RULE_VAR`)의 실구현을 넣지 않는다(F30).** **알려진 커버리지 갭**: 03 쪽 구현이 나중에 생기므로 "구현 0" 가드를 둘 수 없다. §2 대비 diff 로만 확인한다.

---

## 6. 결정 상세

### 6.0 테이블 설계 (Build 가 그대로 옮길 최종 칼럼표)

표기: `CD(n)` = SQLite `VARCHAR(n)` / MSSQL `VARCHAR(n) COLLATE Latin1_General_100_BIN2`. `NT` = `TEXT` / `NVARCHAR(MAX)`. `NM` = `TEXT` / `NVARCHAR(100)`. `JS` = `TEXT` / `NVARCHAR(MAX)` + JSON CHECK(F3 표기). `EX` = `TEXT` / `VARCHAR(MAX)`. `IN` = `INTEGER` / `INT`. `BI` = `BIGINT` / `BIGINT`. `DT` = `TEXT` / `DATETIME2(0)`. `AUD9` = `C_USR_ID VARCHAR(100), C_AT TIMESTAMP|DATETIME2, C_SVC_ID VARCHAR(100), C_PGM_ID VARCHAR(100), U_USR_ID VARCHAR(100), U_AT TIMESTAMP|DATETIME2, U_SVC_ID VARCHAR(100), U_PGM_ID VARCHAR(100), VER BIGINT`(모두 NULL 허용). `AUD9'` = 마지막 칼럼만 `AUD_VER BIGINT`. MSSQL 기본값은 `CONSTRAINT DF_{테이블}_{칼럼} DEFAULT (…)`. 표의 순서가 곧 칼럼 순서다. "★" 는 ERD 초안과 다른 곳(§6.1).

**① TB_MDM_RULE**: PK `PK_TB_MDM_RULE`(MARU_RULE_ID). FK `FK_TB_MDM_RULE_SYSTEM_SRC`(SOURCE_SYSTEM → TB_MDM_SYSTEM.SYSTEM_CODE). CK `CK_TB_MDM_RULE_KIND` `RULE_KIND IN ('DECISION','DERIVE')`, `CK_TB_MDM_RULE_STATUS` `STATUS IN ('CREATED','INUSE','DEPRECATED')`, `CK_TB_MDM_RULE_SRC_KIND` `SOURCE_KIND IN ('MDM','EXTERNAL')`, `CK_TB_MDM_RULE_SRC_SYS` `(SOURCE_KIND = 'EXTERNAL' AND SOURCE_SYSTEM IS NOT NULL) OR (SOURCE_KIND = 'MDM' AND SOURCE_SYSTEM IS NULL)`.

| 칼럼 | 타입 | NULL | 기본값 | 엔티티 필드 |
|---|---|---|---|---|
| MARU_RULE_ID | CD(50) | NN(PK) | | `String maruRuleId` |
| MARU_RULE_NAME | NM | NN | | `String maruRuleName` |
| RULE_KIND | CD(20) | NN | | `String ruleKind` |
| STATUS | CD(20) | NN | `'CREATED'` | `String status`(updatable=false) |
| SOURCE_KIND | CD(20) | NN | | `String sourceKind` |
| SOURCE_SYSTEM | CD(20) | NULL | | `String sourceSystem` |
| DESCRIPTION | NT | NULL | | `String description` |
| USAGE_NOTE | NT | NULL | | `String usageNote` |
| LAST_VAR_ID | IN | NN | 0 | `int lastVarId`(updatable=false) |
| LAST_ROW_ID | IN | NN | 0 | `int lastRowId`(updatable=false) |
| LAST_CASE_ID | IN | NN | 0 | `int lastCaseId`(updatable=false) |
| AUD9 | | | | 상속 |

**② TB_MDM_RULE_SYSTEM**(보류, DDL 만): PK `PK_TB_MDM_RULE_SYSTEM`(MARU_RULE_ID, SYSTEM_CODE). FK `FK_TB_MDM_RULE_SYSTEM_RULE`(→ TB_MDM_RULE), `FK_TB_MDM_RULE_SYSTEM_SYSTEM`(→ TB_MDM_SYSTEM). CK `CK_TB_MDM_RULE_SYSTEM_KIND` `DEPLOY_KIND IN ('DEF','RESULT')`.

| 칼럼 | 타입 | NULL | 기본값 |
|---|---|---|---|
| MARU_RULE_ID | CD(50) | NN(PK) | |
| SYSTEM_CODE | CD(20) | NN(PK) | |
| DEPLOY_KIND | CD(20) | NN | `'DEF'` |
| DESCRIPTION | NT | NULL | |
| AUD9 | | | |

**③ TB_MDM_RULE_VER**: PK `PK_TB_MDM_RULE_VER`(MARU_RULE_ID, VER). FK `FK_TB_MDM_RULE_VER_RULE`(→ TB_MDM_RULE, CASCADE 없음). CK `CK_TB_MDM_RULE_VER_STATUS` `STATUS IN ('DRAFT','REQUESTED','APPROVED','RELEASED','CANCELLED')`, `CK_TB_MDM_RULE_VER_HIT` `HIT_POLICY IS NULL OR HIT_POLICY IN ('FIRST','UNIQUE','PRIORITY','COLLECT','ANY')`, `CK_TB_MDM_RULE_VER_APPLY` `STATUS = 'DRAFT' OR (APPLY_FROM IS NOT NULL AND APPLY_TO IS NOT NULL)`, `CK_TB_MDM_RULE_VER_EMERGENCY_YN` `EMERGENCY_YN IN ('Y','N')`. 엔티티 `MdmRuleVer`(`@IdClass(MdmRuleVerId)`, `@AttributeOverride` AUD_VER).

| 칼럼 | 타입 | NULL | 기본값 | 엔티티 필드 |
|---|---|---|---|---|
| MARU_RULE_ID | CD(50) | NN(PK) | | `@Id String maruRuleId` |
| VER | IN | NN(PK) | | `@Id Integer ver` |
| STATUS | CD(20) | NN | `'DRAFT'` | `String status`(updatable=false) |
| BASE_VER | IN | NULL | | `Integer baseVer` |
| OWNER_ID | CD(50) | NULL | | `String ownerId`(updatable=false) |
| HIT_POLICY | CD(20) | NULL | | `String hitPolicy` |
| APPLY_FROM | DT | NULL | | `LocalDateTime applyFrom`(updatable=false) |
| APPLY_TO | DT | NULL | | `LocalDateTime applyTo`(updatable=false) |
| DESCRIPTION | NT | NULL | | `String description` |
| REQUESTED_BY | CD(50) | NULL | | `String requestedBy`(updatable=false) |
| REQUESTED_AT | DT | NULL | | `LocalDateTime requestedAt`(updatable=false) |
| EMERGENCY_YN | CD(1) | NN | `'N'` | `String emergencyYn` |
| EMERGENCY_REASON | NT | NULL | | `String emergencyReason` |
| APPROVED_BY | CD(50) | NULL | | `String approvedBy` |
| APPROVED_AT | DT | NULL | | `LocalDateTime approvedAt` |
| REJECT_REASON | NT | NULL | | `String rejectReason` |
| RELEASED_AT | DT | NULL | | `LocalDateTime releasedAt`(updatable=false) |
| CANCELLED_AT | DT | NULL | | `LocalDateTime cancelledAt` |
| CANCEL_REASON | NT | NULL | | `String cancelReason` |
| ROW_VERSION ★ | BI | NN | 0 | `long rowVersion`(updatable=false, `@Version` 아님) |
| AUD9' | | | | 상속(AUD_VER 재정의) |

**④ TB_MDM_RULE_VAR**: PK `PK_TB_MDM_RULE_VAR`(MARU_RULE_ID, VER, VAR_ID). FK `FK_TB_MDM_RULE_VAR_VER`((MARU_RULE_ID, VER) → TB_MDM_RULE_VER, **ON DELETE CASCADE**), `FK_TB_MDM_RULE_VAR_DOMAIN`(DOMAIN_ID → TB_MDM_DOMAIN.DOMAIN_ID). CK `CK_TB_MDM_RULE_VAR_KIND` `VAR_KIND IN ('COND','RESULT')`, `CK_TB_MDM_RULE_VAR_DISP` ★ `DISP_TYPE IS NULL OR DISP_TYPE IN ('Equal','1','2','Expression','Value')`, `CK_TB_MDM_RULE_VAR_AXIS` `AXIS IS NULL OR AXIS IN ('ROW','COL','NONE')`, `CK_TB_MDM_RULE_VAR_DTYPE` `DATA_TYPE IS NULL OR DATA_TYPE IN ('BOOLEAN','NUMBER','STRING','DATE')`, `CK_TB_MDM_RULE_VAR_AGG` `COLLECT_AGG IS NULL OR COLLECT_AGG IN ('LIST','SUM','MIN','MAX','COUNT')`, `CK_TB_MDM_RULE_VAR_RESULT_NAME` ★ `VAR_KIND <> 'RESULT' OR VAR_NAME IS NOT NULL`, JSON 3개. UX `UX_TB_MDM_RULE_VAR_SEQ`(MARU_RULE_ID, VER, VAR_KIND, SEQ), `UX_TB_MDM_RULE_VAR_NAME`(MARU_RULE_ID, VER, VAR_NAME) `WHERE VAR_KIND = 'RESULT'`. 엔티티 `MdmRuleVar`(`@IdClass(MdmRuleVarId)`, AUD_VER).

| 칼럼 | 타입 | NULL | 기본값 | 엔티티 필드 |
|---|---|---|---|---|
| MARU_RULE_ID | CD(50) | NN(PK) | | `@Id String maruRuleId` |
| VER | IN | NN(PK) | | `@Id Integer ver` |
| VAR_ID | IN | NN(PK) | | `@Id Integer varId` |
| VAR_KIND | CD(20) | NN | | `String varKind` |
| DISP_TYPE | CD(20) | NULL | | `String dispType` |
| AXIS | CD(20) | NULL | | `String axis` |
| VAR_NAME ★ | SQLite `TEXT` / MSSQL `VARCHAR(1000) COLLATE Latin1_General_100_BIN2` | NULL | | `String varName` |
| VAR_AST | JS | NULL | | `String varAst` |
| DOMAIN_ID | SQLite `INTEGER` / MSSQL `BIGINT` | NULL | | `Long domainId` |
| DATA_TYPE | CD(20) | NULL | | `String dataType` |
| COLLECT_AGG | CD(20) | NULL | `'LIST'` | `String collectAgg` |
| PRIO_LIST | JS | NULL | | `String prioList` |
| RES_GRP | CD(50) | NULL | | `String resGrp` |
| GRP_COND | EX | NULL | | `String grpCond` |
| GRP_COND_AST | JS | NULL | | `String grpCondAst` |
| SEQ | IN | NN | | `int seq` |
| LABEL | NM | NULL | | `String label` |
| DESCRIPTION | NT | NULL | | `String description` |
| AUD9' | | | | 상속(AUD_VER 재정의) |

주의: JPA 는 모든 칼럼을 INSERT 에 넣으므로 `collectAgg = null` 인 엔티티를 저장하면 기본값 `'LIST'` 가 아니라 NULL 이 들어간다. 06:1015 "기본 LIST. 그 밖은 NULL" 의 기본값은 저장 로직(08-03)이 채운다.

**⑤ TB_MDM_RULE_ROW**: PK `PK_TB_MDM_RULE_ROW`(MARU_RULE_ID, VER, ROW_ID). FK `FK_TB_MDM_RULE_ROW_VER`((MARU_RULE_ID, VER) → TB_MDM_RULE_VER, **ON DELETE CASCADE**). CK `CK_TB_MDM_RULE_ROW_KIND` `ROW_KIND IN ('NORMAL','DEFAULT')`, `CK_TB_MDM_RULE_ROW_CELLS_JSON`. UX `UX_TB_MDM_RULE_ROW_SEQ`(MARU_RULE_ID, VER, SEQ) `WHERE ROW_KIND = 'NORMAL'`. 엔티티 `MdmRuleRow`(`@IdClass(MdmRuleRowId)`, AUD_VER).

| 칼럼 | 타입 | NULL | 기본값 | 엔티티 필드 |
|---|---|---|---|---|
| MARU_RULE_ID | CD(50) | NN(PK) | | `@Id String maruRuleId` |
| VER | IN | NN(PK) | | `@Id Integer ver` |
| ROW_ID | IN | NN(PK) | | `@Id Integer rowId` |
| SEQ | IN | NN | 0 | `int seq` |
| ROW_KIND | CD(20) | NN | | `String rowKind` |
| CELLS | JS | NN | | `String cells` |
| NOTE | NT | NULL | | `String note` |
| TAG | CD(50) | NULL | | `String tag` |
| AUD9' | | | | 상속(AUD_VER 재정의) |

**⑥ TB_MDM_RULE_TEST_CASE**: PK `PK_TB_MDM_RULE_TEST_CASE`(MARU_RULE_ID, CASE_ID). FK `FK_TB_MDM_RULE_TEST_CASE_RULE`(→ TB_MDM_RULE). CK `CK_TB_MDM_RULE_TEST_CASE_INPUT_JSON`, `CK_TB_MDM_RULE_TEST_CASE_EXPECTED_JSON`. 엔티티 `MdmRuleTestCase`(`@IdClass(MdmRuleTestCaseId)`).

| 칼럼 | 타입 | NULL | 기본값 | 엔티티 필드 |
|---|---|---|---|---|
| MARU_RULE_ID | CD(50) | NN(PK) | | `@Id String maruRuleId` |
| CASE_ID | IN | NN(PK) | | `@Id Integer caseId` |
| CASE_NAME | NM | NULL | | `String caseName` |
| INPUT_JSON | JS | NN | | `String inputJson` |
| EXPECTED_JSON | JS | NULL | | `String expectedJson` |
| DESCRIPTION | NT | NULL | | `String description` |
| ROW_VERSION ★ | BI | NN | 0 | `long rowVersion`(updatable=false) |
| AUD9 | | | | 상속 |

**⑦ TB_MDM_RULE_SET**: PK `PK_TB_MDM_RULE_SET`(MARU_RULE_SET_ID). CK `CK_TB_MDM_RULE_SET_STATUS` `STATUS IN ('INUSE','DEPRECATED')`, `CK_TB_MDM_RULE_SET_RULE_IDS_JSON`. `RULE_IDS` 는 FK 가 아니다. 엔티티 `MdmRuleSet`.

| 칼럼 | 타입 | NULL | 기본값 | 엔티티 필드 |
|---|---|---|---|---|
| MARU_RULE_SET_ID | CD(50) | NN(PK) | | `@Id String maruRuleSetId` |
| MARU_RULE_SET_NAME | NM | NN | | `String maruRuleSetName` |
| RULE_IDS | JS | NN | | `String ruleIds` |
| DESCRIPTION | NT | NULL | | `String description` |
| STATUS | CD(20) | NN | `'INUSE'` | `String status` |
| ROW_VERSION ★ | BI | NN | 0 | `long rowVersion`(updatable=false) |
| AUD9 | | | | 상속 |

**⑧ TB_MDM_RULE_RECV**(보류, DDL 만): PK `PK_TB_MDM_RULE_RECV`(RECV_ID, SQLite `INTEGER CONSTRAINT PK_TB_MDM_RULE_RECV PRIMARY KEY AUTOINCREMENT` / MSSQL `BIGINT IDENTITY(1,1) NOT NULL` + 테이블 제약). FK `FK_TB_MDM_RULE_RECV_RULE`(→ TB_MDM_RULE), `FK_TB_MDM_RULE_RECV_SYSTEM`(SOURCE_SYSTEM → TB_MDM_SYSTEM). CK `CK_TB_MDM_RULE_RECV_REQ` `REQ_KIND IN ('VERSION','CANCEL','DEPRECATE')`, `CK_TB_MDM_RULE_RECV_RESULT` `RESULT IS NULL OR RESULT IN ('OK','REJECTED','FAILED')`(RESULT 는 SQLite `"RESULT"`·MSSQL `[RESULT]` 인용).

| 칼럼 | 타입 | NULL |
|---|---|---|
| RECV_ID | 서버 채번 PK | NN(PK) |
| MARU_RULE_ID | CD(50) | NULL |
| SOURCE_SYSTEM | CD(20) | NN |
| SOURCE_REF | CD(50) | NULL |
| REQ_KIND | CD(20) | NN |
| RECEIVED_AT | DT | NN |
| BODY | NT | NN |
| RESULT(인용) | CD(20) | NULL |
| RESULT_DETAIL | NT | NULL |
| VER | IN | NULL |
| PROCESSED_AT | DT | NULL |
| AUD9' | | |

**파일 순서**(두 방언 같음): ① RULE → ② RULE_SYSTEM → ③ RULE_VER → ④ RULE_VAR + UX 2개 → ⑤ RULE_ROW + UX → ⑥ RULE_TEST_CASE → ⑦ RULE_SET → ⑧ RULE_RECV. 순환 FK 가 없어 후행 `ALTER` 는 필요 없다. 파일 머리 주석에 근거(이 design.md, D-034, 규칙표 §3)와 "팀장 배정 V8"을 적는다.

### 6.1 06 문서 · ERD 초안 · 최종 V8 의 차이

| # | 지점 | 06 문서(정본) | ERD 초안(TSK-02-03, 미승인) | 최종 V8 | 근거 |
|---|---|---|---|---|---|
| 1 | 감사 칼럼 | "관리 속성은 공통 모듈이 정의"(06:905) | 9칼럼, 4테이블은 `AUD_VER` | ERD 그대로 | D-034, 규칙표 §2(리포 관례) |
| 2 | SQLite 감사 `VER`·`AUD_VER` 타입 | 없음 | `INTEGER` | `BIGINT` | 규칙표 §2 `VER BIGINT`, TSK-05-01 F6 선례 |
| 3 | `ROW_VERSION` 타입 | "낙관적 잠금용 정수" | `INTEGER`/`INT` | `BIGINT` | D2, TSK-01-03 인계 ②(F16) |
| 4 | `VAR_NAME` MSSQL 타입 | text | `VARCHAR(MAX)` | `VARCHAR(1000) COLLATE BIN2` | D3, F13 |
| 5 | 결과 열 `VAR_NAME` 필수 | "결과 열은 필수"(06:1011) | CHECK 없음 | `CK_TB_MDM_RULE_VAR_RESULT_NAME` 신설 | D3, F14 |
| 6 | `DISP_TYPE` 값 제약 | `Equal/1/2/Expression, Value/Expression`(06:1009) | CHECK 없음 | `CK_TB_MDM_RULE_VAR_DISP` 신설 | D4, F15 |
| 7 | SQLite JSON CHECK 위치 | 없음 | 인라인·테이블 끝 혼재 | 인라인으로 통일 | V3 관례(F3·F4) |
| 8 | SQLite 업무 일시 형식 | "TEXT(ISO 8601)"(06:938) | `TEXT` | `TEXT`, 값은 `'YYYY-MM-DD HH:MM:SS'` | 규칙표 #16 우선(F29) |
| 9 | `CK_TB_MDM_RULE_VER_APPLY` | 없음(적용 구간은 승인 때 확정) | 있음 | ERD 그대로 | 공통 서비스 확정 흐름과 모순 없음. §3.5 가 실제 테이블로 확인하고, 빨개지면 새 D 로 다룬다 |
| 10 | `CK_TB_MDM_RULE_SRC_SYS` | source_system 설명(06:954)과 같은 뜻 | 있음 | ERD 그대로 | 06:954 |
| 11 | 보류 테이블 | 표에 있음(8개) | DDL 있음 | DDL 만, 엔티티 없음 | D1, D-019, PRD:62 |
| 12 | JSON 칼럼 판정 | cells·prio_list·rule_ids·테스트 JSON | 7칼럼 CHECK | ERD 그대로 | 규칙표 #3(F5) |
| 13 | `SetStatus` | INUSE/DEPRECATED | CHECK 동일 | ERD 그대로. 엔진 `CREATED` 는 DB 에 없음 | F20 ② |
| 14 | EXTERNAL 샘플의 `QMS` | 샘플에 있음 | 해당 없음 | 테스트 픽스처는 `APS` 로 대체 | F28 |
| 15 | `last_*_id` 발급 설명 | "05의 last_key_no 와 같은 방식" | `INT NOT NULL DEFAULT 0` | ERD 그대로 | 06:931 오기(F29), TSK-02-03 D5 |

### 6.2 엔티티 설계

- 패키지 `com.dongkuk.dmes.mdm.entity`, 리포지토리 `com.dongkuk.dmes.mdm.repository`(F26 관례). 6엔티티 모두 `extends CactusAuditEntity`.
- `MdmRuleVer`·`MdmRuleVar`·`MdmRuleRow` 클래스 선언부:
  ```java
  @Entity
  @Table(name = "TB_MDM_RULE_VER")
  @IdClass(MdmRuleVerId.class)
  @AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
  public class MdmRuleVer extends CactusAuditEntity { … }
  ```
  이 재정의가 없으면 업무 필드 `ver`(칼럼 `VER`)와 상속 필드 `version`(칼럼 `VER`)이 같은 칼럼에 매핑되어 부팅이 실패한다(불변 규칙 2).
- `*Id` 클래스 필드명은 소유 엔티티의 `@Id` 필드명과 정확히 같아야 한다(`MdmRuleVerId{maruRuleId, ver}`, `MdmRuleVarId{maruRuleId, ver, varId}`, `MdmRuleRowId{maruRuleId, ver, rowId}`, `MdmRuleTestCaseId{maruRuleId, caseId}`. TSK-05-01 F26).
- 서비스 소유 칼럼(불변 규칙 16)은 `@Column(name = "…", updatable = false)` 로 매핑한다. `updatable = false` 는 INSERT 를 막지 않으므로 setter 는 두고, 그 setter 의 javadoc 에 "INSERT 때만 반영된다. 저장된 행의 값은 공통 버전 서비스·식별자 발급기가 네이티브 SQL 로 바꾼다" 를 적는다(§3.4-4·§3.5-R1 이 RELEASED 행과 `applyFrom` 을 엔티티로 INSERT 한다). 생성자 기본값: `MdmRule(String maruRuleId, String maruRuleName, String ruleKind, String sourceKind)` 는 `status = "CREATED"`, 카운터 0. `MdmRuleVer(String maruRuleId, Integer ver, String ownerId)` 는 `status = "DRAFT"`, `rowVersion = 0`, `emergencyYn = "N"`. `MdmRuleTestCase`·`MdmRuleSet` 은 `rowVersion = 0`. 엔티티에 상태 전이·발급 같은 업무 메서드(팩터리 포함)를 두지 않는다.
- 날짜 필드는 `LocalDateTime` 이다. SQLite 는 D5 컨버터가, MSSQL 은 Hibernate 기본 `DATETIME2` 매핑이 처리한다.
- 예약어 인용은 필요 없다(F27).

### 6.3 계약 선언 (`com.dongkuk.dmes.mdm.contract.rule`)

`java.*` 만 쓴다(엔진·Spring·JPA 비의존, F21·F22).

```java
/** 룰 안 식별자 카운터 — TB_MDM_RULE 의 last_*_id(06:931·937·957). */
public enum MdmRuleIdKind {
    VAR("LAST_VAR_ID"),
    ROW("LAST_ROW_ID"),
    CASE("LAST_CASE_ID");

    private final String counterColumn;

    MdmRuleIdKind(String counterColumn) { this.counterColumn = counterColumn; }

    public String counterColumn() { return counterColumn; }
}

/** 한 번에 발급한 연속 구간 [first, last]. count 1 이면 first == last. */
public record MdmRuleIdRange(String maruRuleId, MdmRuleIdKind kind, int first, int last) {}

/**
 * 룰 안 식별자 발급 — 구현 TSK-08-02(첫 소비자, 규칙표 #1 실측 담당).
 * TB_MDM_RULE 의 kind 카운터를 결과 집합을 돌려주는 단일 UPDATE(SQLite RETURNING / MSSQL OUTPUT inserted)로
 * count 만큼 올리고 새 구간을 돌려준다. 한 번 쓴 번호는 행을 지워도 다시 쓰지 않고, 버전 복사는 번호를 유지하며
 * 발급하지 않는다(06:931). 감사 칼럼은 구현이 MdmNativeAuditSupport 로 명시한다(규칙표 §2).
 * count 가 1 보다 작거나 룰이 없으면 구현이 예외를 던진다.
 */
public interface MdmRuleIdIssuer {
    MdmRuleIdRange issue(String maruRuleId, MdmRuleIdKind kind, int count);
}

/**
 * 엔진 DefinitionLookup 의 mdm 구현 대상 — 06 「값 테스트 API」 두 방식(06:1069-1074)·「DRAFT와 시험 사본」
 * 구현체(06:541). 구현 TSK-08-04. 배포 스냅샷을 읽는 구현(하위 시스템)과 시험 사본 구현은 보류라 두지 않는다.
 */
public enum MdmRuleDefinitionSource {
    /** 원장에서 ver 로(또는 evalTs 에 유효한 RELEASED 를) 골라 읽는다. DRAFT 포함. */
    STORED_VERSION,
    /** 요청 본문의 변수·행 정의를 메모리에서만 쓴다. 원장에 쓰지 않는다. */
    REQUEST_BODY
}

/**
 * 06 확정 검사 SPI(VersionConfirmCheckSpi, target BUSINESS_RULE)의 diff 관례 — 구현 TSK-08-05.
 * VersionDiffEntry.key 는 row_id 의 10진 문자열이고, oldValues·newValues 의 키는 아래 둘이다(06:1255-1268:
 * cells 나 seq 가 다르면 CHANGED). SEQ 값은 Integer, CELLS 값은 정규화 JSON 문자열(규칙표 #3·#6).
 */
public final class MdmRuleDiffConventions {
    public static final String SEQ = "SEQ";
    public static final String CELLS = "CELLS";

    private MdmRuleDiffConventions() {}
}

/**
 * 06 확정 검사 항목 — 구현 TSK-08-05 의 check() 가 모두 돈다(wbs TSK-08-05, PRD FR-E4).
 * apply_from 순서는 공통 서비스(ApplyFromOrderCheck)가, 룰 참조 검사(배포 대상 기준)는 이번 범위에서 하지 않는다.
 */
public enum MdmRuleConfirmCheckItem {
    /** 06 「저장 시 검사」 전부. */
    SAVE_CHECKS,
    /** 변수와 행이 하나 이상(06:900·1131). */
    NOT_EMPTY,
    /** 기대값이 있는 테스트 케이스 전부 통과(06:1132). */
    TEST_CASES,
    /** 조건 변수가 다른 룰의 결과 변수면 그 룰에 RELEASED 버전이 있다(06:1134). */
    RESULT_VAR_RELEASED
}
```

`package-info.java` 에는 "06(업무기준) 공유 계약 전용 서브패키지. 식별자 발급·DefinitionLookup 구현 대상·확정 검사 06 관례를 선언만 한다. 구현은 이 패키지 밖(TSK-08-02 발급기·08-04 DefinitionLookup·08-05 확정 검사)에 둔다. 엔진 DefinitionLookup 의 칼럼 대응은 TSK-08-01 design.md §6.4" 를 적는다. `MdmCheckIssue.field` 에는 확정 검사 항목 이름(`MdmRuleConfirmCheckItem.name()`)을 담도록 08-05 에 인계한다.

### 6.4 엔진 `DefinitionLookup` 구현 대상 매핑표 (06 칼럼 → 엔진 필드)

| 엔진 필드 | 06 원천 | 변환·비고 |
|---|---|---|
| `column(table, column)` | 06 테이블 아님. 02 계약(`contract.dictionary` 의 `MdmColumnDictionaryLookup`·`MdmEffectiveDomainResolver`) | 구현은 02 계약에 위임한다(02 구현 Task 몫) |
| `RuleDefinition.ruleId`·`ver` | `RULE_VER.MARU_RULE_ID`·`VER` | `Integer → int` |
| `ruleKind` | `RULE.RULE_KIND` | `RuleKind.valueOf` |
| `hitPolicy` | `RULE_VER.HIT_POLICY` | `valueOf`, DERIVE 는 null |
| `applyFrom`·`applyTo` | `RULE_VER.APPLY_FROM`·`APPLY_TO` | `LocalDateTime` 그대로 |
| `engineVersion` | 칼럼 없음 | 구현이 엔진 모듈 버전을 채운다(06:1152·1160) |
| `vars` | `RULE_VAR` `ORDER BY VAR_KIND, SEQ`(06:1216) | 아래 `RuleVar` |
| `contract` | 칼럼 없음(06 「입력 계약」 파생) | 08-04 가 계산 |
| `rows` | `RULE_ROW` `ORDER BY` NORMAL 먼저, `SEQ`, `ROW_ID`(06:1221) | 아래 `RuleRow` |
| `RuleVar.varId`·`varKind`·`seq` | `VAR_ID`·`VAR_KIND`·`SEQ` | `valueOf` |
| `RuleVar.dispType` | `DISP_TYPE` | D4 대응: `Equal→EQUAL`, `1→ONE`, `2→TWO`, `Expression→EXPRESSION`, `Value→VALUE` |
| `RuleVar.varName`·`exprText`·`exprAst` | `VAR_NAME`·`VAR_AST` | `VAR_AST` 가 NULL 이면 `varName = VAR_NAME`, 아니면 `exprText = VAR_NAME`·`exprAst = VAR_AST` 파싱(06:1012) |
| `RuleVar.refVars` | 칼럼 없음 | AST 에서 파생 |
| `RuleVar.dataType`·`scale` | `DATA_TYPE` 또는 `DOMAIN_ID` 의 도메인 | 도메인이 있으면 02 에서 읽는다(06:1013-1014) |
| `RuleVar.domainId` | `DOMAIN_ID`(BIGINT) | **어긋남 ①**: `String.valueOf(Long)` |
| `RuleVar.collectAgg`·`prioList` | `COLLECT_AGG`·`PRIO_LIST`(JSON 배열) | `valueOf`, JSON → `List<String>` |
| `RuleVar.resGrp`·`grpCond`·`grpCondAst` | `RES_GRP`·`GRP_COND`·`GRP_COND_AST` | JSON → `Map` |
| (싣지 않음) | `AXIS`·`LABEL`·`DESCRIPTION` | 스냅샷에 싣지 않는다(06:1022·1152) |
| `RuleRow.rowId`·`seq`·`rowKind` | `ROW_ID`·`SEQ`·`ROW_KIND` | `valueOf` |
| `RuleRow.cells` | `CELLS` JSON(키 = var_id 문자열) | 키 `Integer.valueOf`, 셀 7키 → `RuleCell`, `text` 는 생성기(08-04) |
| (싣지 않음) | `NOTE`·`TAG` | 06:1034 |
| `RuleSetDefinition.setId`·`ruleIds`·`status` | `RULE_SET.MARU_RULE_SET_ID`·`RULE_IDS`·`STATUS` | **어긋남 ②**: `CREATED` 는 DB 에 없다 |
| 구현 종류 | `MdmRuleDefinitionSource` | STORED_VERSION·REQUEST_BODY(D9) |

엔진 서명은 고치지 않는다. 어긋남 ①~④(F20)는 모두 구현 쪽 변환으로 흡수된다.

### 6.5 확정 검사 SPI 구현 대상 (06 쪽 선언)

- SPI: 기존 `VersionConfirmCheckSpi`(target `BUSINESS_RULE`). 구현 TSK-08-05. 새 SPI 를 만들지 않는다.
- `diff(draft)`: base = 직전 RELEASED(최초 버전이면 null), 항목 = `row_id` 마다 하나, `DiffKind` 는 `ADDED`·`REMOVED`·`CHANGED`·`SAME` 넷 모두 쓴다(04 와 달리 SAME 을 낸다, `DiffKind` javadoc). 키·값 관례는 `MdmRuleDiffConventions`. SQL 은 규칙표 #12(`FULL OUTER JOIN … ON` + `COALESCE`, 실측 TSK-08-05)를 따른다.
- `check(request)`: `MdmRuleConfirmCheckItem` 넷을 모두 돈다. 오류 코드는 `MDM010`(`CONFIRM_CHECK_FAILED`), `MdmCheckIssue.field` 는 항목 이름.
- DRAFT 삭제 훅 `VersionDraftDeletionSpi`(BUSINESS_RULE)는 CASCADE 가 있어 빈 구현이지만 반드시 등록해야 한다(TSK-08-02, TSK-01-03 인계).

### 6.6 SQLite 업무 일시 매핑 인프라 (D5)

```java
package com.dongkuk.dmes.mdm.common.support;

/** SQLite(local) 전용 LocalDateTime ↔ 'yyyy-MM-dd HH:mm:ss'(KST, 초 단위) 문자열. @Converter 를 붙이지 않는다:
 *  엔티티 스캔이 이 클래스를 자동 적용하면 MSSQL 에도 켜진다. 등록은 MdmSqliteTemporalContributor 로만 한다. */
public class MdmSqliteLocalDateTimeConverter implements AttributeConverter<LocalDateTime, String> { … }

/** application-local.yml 의 spring.jpa.properties.hibernate.metadata_builder_contributor 로만 등록한다(mls 선례). */
public class MdmSqliteTemporalContributor implements MetadataBuilderContributor {
    @Override
    public void contribute(MetadataBuilder metadataBuilder) {
        metadataBuilder.applyAttributeConverter(MdmSqliteLocalDateTimeConverter.class, true);
    }
}
```

쓰기는 `value.truncatedTo(SECONDS)` 를 `yyyy-MM-dd HH:mm:ss` 로 포맷한다. 읽기는 앞 19자를 `'T'→' '` 로 바꿔 파싱한다(`MdmTemporalBinder.fromDb` 와 같은 규칙). `application-local.yml` 에는 `spring.jpa.properties.hibernate.metadata_builder_contributor` 키를 추가한다. 이 설정이 Hibernate 7 에서 먹는지는 §3.4-4(`typeof = text`)가 실측한다. 먹지 않으면 설계 이탈로 기록하고 대안(`hibernate.type_contributors` 또는 `EntityManagerFactoryBuilderCustomizer` 빈)을 D 로 추기한다.

---

## 7. 후속 인계

| 받는 Task | 인계 내용 |
|---|---|
| TSK-08-02 (룰 등록·DRAFT) | `MdmRuleIdIssuer` 구현(단일 UPDATE RETURNING/OUTPUT, 규칙표 #1 실측, 감사 칼럼 명시). `VersionDraftDeletionSpi`(BUSINESS_RULE) 빈 구현 등록. 이 둘을 넣을 때 §3.7-1 과 §3.1-12 의 해당 줄(발급기·삭제 훅)을 지운다. 새 버전·룰 등록 INSERT 는 엔티티 생성자로 하고, 서비스 소유 칼럼은 엔티티로 바꾸지 않는다(D7). 공통 서비스를 부른 뒤에는 엔티티를 다시 읽는다(TSK-01-03 §2.4). `DISP_TYPE` 은 06 표기로 저장한다(D4). 엔티티에 넣는 일시는 호출자가 초 단위로 잘라서 넣는다: SQLite 컨버터는 소수초를 절삭하지만 MSSQL `DATETIME2(0)` 은 JPA 로 쓸 때 반올림하므로(`.789` 는 다음 초) 두 방언의 저장값이 1초 갈릴 수 있다(네이티브 쓰기는 바인더가 두 방언 모두 절삭한다) |
| TSK-08-03 (열 설정) | `COLLECT_AGG` 기본값 `'LIST'` 는 엔티티 저장 때 채운다(§6.0 ④ 주의). `VAR_NAME` 길이는 1,000자 이하로 검사한다(D3, 규칙표 #18) |
| TSK-08-04 (저장 시 검사·값 테스트) | `DefinitionLookup` 구현(§6.4 매핑표, `MdmRuleDefinitionSource` 두 방식). 빈으로 등록하면 §3.1-12 의 `DefinitionLookup` 줄을 지운다. `column()` 은 02 계약에 위임하고, 02 가 먼저 `DefinitionLookup` 빈을 등록했다면 06 은 `rule()`·`ruleSet()` 을 합성으로 붙인다(F32). 어긋남 ①~④ 는 구현에서 변환한다(엔진 서명 불변) |
| 02 영역(TSK-04-03 등) | `DefinitionLookup` 을 스프링 빈으로 등록하게 되면 §3.1-12 의 `DefinitionLookup` 줄을 지운다(F32) |
| TSK-08-05 (확정) | `VersionConfirmCheckSpi`(BUSINESS_RULE) 구현(§6.5, `MdmRuleDiffConventions`·`MdmRuleConfirmCheckItem`). 넣을 때 §3.1-12 의 확정 검사 줄을 지운다. 규칙표 #12 FULL OUTER JOIN 실측 |
| TSK-08-06 (룰 세트) | `MdmRuleSet` 엔티티. `ROW_VERSION` 은 조건부 네이티브 UPDATE 로만 올린다(규칙표 #13, D7) |
| 06 `MdmDomainReferenceSpi`(refKind `RULE_VAR`) 담당(미정) | 실구현은 이 Task 에 없다(F30) |
| TSK-01-03 후속(공통 버전 서비스)·사람 | 감사 `U_AT` 형식 혼재(F12, D6)로 엔티티가 읽는 `updatedAt` 이 어긋날 수 있다. Build 실측값을 보고에 올린다 |
| TSK-06-01 (04 계약, 병렬 워크트리) | 04 도 `LocalDateTime` 업무 일시를 SQLite 에 쓴다. 이 Task 의 `MdmSqliteTemporalContributor` 를 재사용하면 된다. 두 Task 가 각자 contributor 를 만들면 머지 때 `application-local.yml` 한 줄과 클래스를 하나로 합친다. 버전 기대값 줄(`Set.of(…)`)과 decisions.md 번호도 머지 때 합친다 |
| MSSQL 실측 담당(미정, 도커 허용 시) | 규칙표 #2~#5·#19·#20 의 06 MSSQL 몫과 V8 MSSQL 적용 자체가 미실측이다(사용자 결정). §3.2·§3.3 이 대신 확인한 범위를 넘는 것(필터 인덱스·ISJSON·IDENTITY 실제 동작)은 실측으로만 닫힌다 |

---

## 담당자 확인 필요 결정

### D1: 보류 테이블 `TB_MDM_RULE_SYSTEM`·`TB_MDM_RULE_RECV` 에 엔티티를 붙이는가
- **질문**: spec 은 "06 테이블 8개 Flyway …, 엔티티"라고 적는다. 8개 모두에 엔티티를 붙이는가, 보류 테이블 2개는 DDL 만 두는가.
- **선택지**: (1) 8개 모두 엔티티·리포지토리. (2) 활성 6개만 엔티티, 보류 2개는 DDL 만.
- **택한 것**: (2).
- **근거와 강약 순위**: spec 문장은 "엔티티"의 범위를 명시하지 않는다(해석 여지). PRD:62 "보류 테이블(`*_SYSTEM`, `*_RECV`)도 DDL 은 만들되 코드는 쓰지 않는다"와 decisions D-019 "배포 대상·수신 로그 테이블은 DDL-only(엔티티·리포지토리 … 없음)"가 직접 정한다(리포 기존 관례). V3 의 `DICT_SEQ`·`DICT_SYSTEM` 선례와 그 가드 테스트도 같다(F17). 강도: **강**.
- **반려되면 재작업할 방향**: `MdmRuleSystem`(+`MdmRuleSystemId`)·`MdmRuleRecv` 엔티티와 리포지토리를 추가하고(`RULE_RECV` 는 `@AttributeOverride` AUD_VER, `RESULT` 칼럼은 백틱 인용 `@Column(name="\`RESULT\`")`, `RECV_ID` 는 `GenerationType.IDENTITY`), §3.4-6 가드를 뒤집는다.

### D2: `ROW_VERSION` 타입을 `BIGINT` 로 할 것인가(ERD 초안은 `INT`)
- **질문**: `RULE_VER`·`RULE_TEST_CASE`·`RULE_SET` 의 `ROW_VERSION` 을 ERD 초안의 `INTEGER`/`INT` 로 둘지, `BIGINT` 로 둘지.
- **선택지**: (1) ERD 초안 `INT`. (2) 버전 테이블만 `BIGINT`. (3) 세 테이블 모두 `BIGINT`.
- **택한 것**: (3).
- **근거와 강약 순위**: 06 은 "정수"라고만 한다. TSK-01-03 인계 ②가 버전 테이블에 `ROW_VERSION BIGINT NOT NULL DEFAULT 0` 을 요구하고, 머지된 서비스가 `long` 으로 읽으며 소유권 API 가 `long` 을 돌려준다(리포 기존 관례, F7·F16). 같은 뜻의 칼럼(낙관적 잠금 카운터, 규칙표 §2)을 테이블마다 다른 타입으로 두면 08-04·08-06 의 조건부 UPDATE 헬퍼가 갈라진다. ERD 초안은 미승인 선행 산출물이라 순위가 가장 낮다. 강도: 버전 테이블 **강**, 나머지 두 테이블 **중**.
- **반려되면 재작업할 방향**: `RULE_TEST_CASE`·`RULE_SET` 의 `ROW_VERSION` 을 `INTEGER`/`INT` 로 되돌리고 엔티티 필드를 `int` 로 바꾼다. §3.2 P9 허용 목록과 §3.1-3 을 고친다. `RULE_VER` 은 서비스 호환 때문에 `BIGINT` 를 유지한다.

### D3: MSSQL `VAR_NAME` 타입과 결과 열 `VAR_NAME` 필수 CHECK
- **질문**: ERD 초안의 `VAR_NAME VARCHAR(MAX)` 는 MSSQL 에서 유일 인덱스 키가 될 수 없고(F13), 결과 열 `VAR_NAME` 이 NULL 이면 두 방언의 유일성 판정이 갈린다(F14). 어떻게 고칠 것인가.
- **선택지**: 타입은 (a) `VARCHAR(1000) COLLATE BIN2`, (b) `NVARCHAR(800) COLLATE BIN2`(한글 식 리터럴 보존), (c) `VARCHAR(MAX)` 유지 + MSSQL 에서만 유일성을 앱 검사로. NULL 은 (x) `CK_TB_MDM_RULE_VAR_RESULT_NAME`(`VAR_KIND <> 'RESULT' OR VAR_NAME IS NOT NULL`) 신설, (y) 인덱스 필터에 `AND VAR_NAME IS NOT NULL` 추가.
- **택한 것**: (a) + (x), 두 방언 모두.
- **근거와 강약 순위**: 06:1011 "결과 열은 필수이고 버전 안에서 유일"이 (x)를 직접 뒷받침한다(정본). 키 칼럼 BIN2 는 규칙표 #19(대소문자 구분을 두 방언에서 같게)를 따른다. `VARCHAR` 는 V3 식 칼럼(`STD_RULE VARCHAR(MAX)`) 관례를 따른다(리포 관례). 1,000자는 키 크기 1,054바이트로 1,700바이트 한도 안이다. (c)는 방언별 동작을 갈라 두고, (y)는 결과 열 필수 규칙을 DB 에서 놓친다. 길이 1,000 은 원문 근거가 없는 선택이다. 강도: 수정 필요성 **강**, 길이·`VARCHAR` 선택 **중**(식 변수에 한글 문자열 리터럴이 들어가면 MSSQL 에서 `?` 로 손실될 수 있다. TSK-05-01 F28 과 같은 종류의 위험).
- **반려되면 재작업할 방향**: (b)로 바꾼다면 V8 이 운영에 적용되기 전이면 MSSQL V8 의 `VAR_NAME` 을 `NVARCHAR(800) COLLATE Latin1_General_100_BIN2` 로 고치고, 적용 뒤라면 새 V 번호로 인덱스를 지우고 `ALTER COLUMN` 한 뒤 다시 만든다. §3.2 P9 허용 목록을 고친다.

### D4: `DISP_TYPE` 저장 코드와 CHECK
- **질문**: `DISP_TYPE` 에 무엇을 저장하고 DB 에서 제약할 것인가(F15). 06 표기(`Equal`·`1`·`2`·`Expression`·`Value`)와 엔진 enum 이름(`EQUAL`·`ONE`·`TWO`·`EXPRESSION`·`VALUE`)이 다르다.
- **선택지**: (1) CHECK 없이 두고 저장 코드는 후속 Task 가 정한다(ERD 초안). (2) 06 표기로 저장하고 CHECK 신설. (3) 엔진 enum 이름으로 저장하고 CHECK 신설.
- **택한 것**: (2).
- **근거와 강약 순위**: 06 정본이 칼럼 값을 `Equal / 1 / 2 / Expression, Value / Expression` 으로 적고 예시 값이 `2` 이며 샘플 행도 그 표기다(06:1009·1302-1307). 엔진 enum 은 미승인 선행 산출물의 Java 이름일 뿐 저장 코드를 정하지 않았다(engine-contract.md 에 대응 규정 없음). 08-02(쓰는 쪽)와 08-04(읽는 쪽)가 서로 다른 코드를 쓰는 사고를 공유 계약 단계에서 DB 로 막는다. 다른 코드성 칼럼(`VAR_KIND`·`AXIS` 등)은 모두 CHECK 가 있다(리포 관례). 강도: **중**(CHECK 신설은 ERD 에 없던 제약이다).
- **반려되면 재작업할 방향**: (1)이면 `CK_TB_MDM_RULE_VAR_DISP` 를 두 방언에서 빼고 §3.1-4·11 과 §3.2 CK 집합을 고친다. (3)이면 CHECK 목록을 엔진 이름으로 바꾸고, 06 샘플 픽스처와 §6.4 대응표를 항등 변환으로 고친다.

### D5: SQLite 업무 일시(`LocalDateTime`)를 엔티티가 어떻게 매핑하는가
- **질문**: SQLite 에서 JPA 기본 바인딩은 일시를 정수로 저장해 네이티브 쓰기(KST 텍스트)와 어긋난다(F10). TSK-01-03 인계 ④는 엔티티가 이 문자열을 읽어야 한다고 요구한다. 이 Task 에서 매핑 인프라를 둘 것인가. "실행 로직 없음" 수용 기준과 충돌하지 않는가.
- **선택지**: (1) mdm 전용 `AttributeConverter` + `MetadataBuilderContributor` 를 local 프로파일 yml 에만 등록(mls 선례). (2) 필드마다 `@Convert` 로 컨버터 지정(MSSQL 에도 적용됨). (3) xerial 연결 속성 `date_class=TEXT`·`date_string_format` 전역 변경(감사 `C_AT` 형식까지 바뀜). (4) 이 Task 는 매핑을 두지 않고 후속 Task 에 넘긴다.
- **택한 것**: (1). 컨버터에 `@Converter` 를 붙이지 않는다.
- **근거와 강약 순위**: TSK-01-03 인계 ④(미승인 선행)와 규칙표 #16(리포 관례: SQLite 업무 일시는 `'YYYY-MM-DD HH:MM:SS'` TEXT)이 요구한다. mls 가 Spring Boot 기본 EMF·Hibernate 7 에서 같은 등록 방식을 쓴다(리포 관례, F10). MSSQL 경로는 `local-db` 프로파일이 `local` 을 포함하지 않아 영향이 없다(F11). (2)는 검증할 수 없는 MSSQL 변경을 만들고, (3)은 기존 02·03 엔티티의 `C_AT` 저장 형식(D-038)을 바꾸며, (4)는 엔티티를 틀린 채로 넘긴다. "실행 로직 없음"은 업무 로직(발급·조회·검사)이 없다는 뜻으로 해석하고, 이 컨버터는 엔티티 선언을 올바르게 만드는 영속성 매핑 인프라라 **유일한 예외**로 명시한다(불변 규칙 19). 강도: 필요성 **강**, 수용 기준 해석 **중**.
- **반려되면 재작업할 방향**: "실행 코드 0" 을 문자 그대로 요구하면 컨버터·contributor 와 yml 줄을 빼고, 엔티티의 일시 필드를 `String` 으로 바꾸거나(08-02 가 변환) 매핑 인프라를 첫 소비자(TSK-08-02)로 넘긴다. §3.4-4·§3.5-R1·R3 은 그 Task 로 옮긴다.

### D6: 감사 `U_AT` 형식 혼재(JPA 정수 대 네이티브 KST 텍스트)를 이 Task 에서 고칠 것인가
- **질문**: 같은 행의 `U_AT` 를 JPA 는 epoch millis 정수로, 공통 서비스는 KST 텍스트로 쓴다. 드라이버 실험상 엔티티가 텍스트 `U_AT` 를 읽으면 예외 없이 9시간 어긋난 `Instant` 가 된다(F12). 고칠 것인가.
- **선택지**: (1) 고치지 않고 실측해 보고한다(§3.5-R1 은 읽기 예외 없음만 단언). (2) SQLite contributor 에 `Instant` 컨버터도 넣어 JPA 도 KST 텍스트로 쓰게 한다(02·03 의 `C_AT` 저장 형식이 바뀐다). (3) `MdmTemporalBinder.toDb(Instant)` 가 SQLite 에 epoch millis 를 쓰게 고친다(TSK-01-03 산출물·S24 기대값 변경).
- **택한 것**: (1).
- **근거와 강약 순위**: 결함의 원인은 TSK-01-03 바인더(D-044)와 cactus `CactusAuditEntity`(Instant, D-038) 사이의 형식 규약이고, 두 쪽 모두 이 Task 의 산출물이 아니다. (2)·(3)은 다른 Task 의 실측 결과와 테스트 기대값을 바꾼다. 업무 판정에 쓰는 일시(`APPLY_*`)는 D5 로 정확하고, 어긋나는 것은 감사 표시값이다. MSSQL 에서도 `DATETIME2` 에 KST 벽시계를 쓰고 `Instant` 를 UTC 로 읽으면 같은 차이가 날 수 있다(미실측). 강도: **중**.
- **반려되면 재작업할 방향**: (2)라면 `MdmSqliteTemporalContributor` 에 `Instant ↔ KST 텍스트` 컨버터를 더하고, `MdmEntityJpaRoundtripTest.C_AT_의_SQLite_저장_형식을_typeof_로_관찰한다` 의 기대값과 규칙표 #16·D-038 을 고친다. §3.5-R1 에 `updatedAt` 정확 일치 단언을 더한다.

### D7: 공통 서비스·발급기가 네이티브로 바꾸는 칼럼을 엔티티에서 `updatable = false` 로 둘 것인가
- **질문**: 카운터(`LAST_*_ID`), 버전 상태·소유자·적용 구간·`ROW_VERSION`, 부모 `STATUS` 는 네이티브 SQL 로만 바뀐다. 엔티티가 이 칼럼을 갱신할 수 있게 두면 오래된 엔티티를 저장할 때 발급된 번호나 잠금 값이 되돌아간다(발급 번호 재사용, 잠금 무력화).
- **선택지**: (1) 모두 갱신 가능(ERD·06 에 매핑 규정 없음, "다시 읽기" 규율에 맡김). (2) 서비스 소유 칼럼만 `updatable = false`(불변 규칙 16 목록).
- **택한 것**: (2).
- **근거와 강약 순위**: 06:931 "한 번 쓴 번호는 다시 쓰지 않는다", 규칙표 #1(발급은 단일 문)·#13(잠금은 조건부 UPDATE), TSK-01-03 §2.4 영속성 함정(리포 관례)이 이 칼럼들을 네이티브 전용으로 둔다. 조용한 데이터 손상을 계약 단계에서 막는다. `APPROVED_*`·`CANCELLED_*`·`EMERGENCY_*` 는 보류된 결재 흐름이라 지금 소유자가 없어 갱신 가능으로 둔다. 강도: **중**.
- **반려되면 재작업할 방향**: `updatable = false` 를 빼고 setter javadoc 의 "INSERT 때만 반영" 문구를 지운다. §3.4-2 를 지우고 §7 인계에 "공통 서비스 호출 뒤 반드시 다시 읽는다"를 강하게 적는다.

### D8: 식별자 발급 인터페이스의 모양
- **질문**: `last_var_id` 등 발급을 어떤 서명으로 선언하는가.
- **선택지**: (1) 종류별 메서드 셋(`nextVarId`·`nextRowId`·`nextCaseId`, 1개씩). (2) `issue(ruleId, MdmRuleIdKind kind, int count) → MdmRuleIdRange`(한 문장으로 여러 개). (3) (2)에 감사 값(`AuditStamp`) 인자 추가.
- **택한 것**: (2).
- **근거와 강약 순위**: 06:931 은 카운터를 `UPDATE … RETURNING` 으로 올린다고만 정하고, 규칙표 #1 은 "읽고 쓰기 두 문 금지, 단일 문"을 요구한다. 그리드 저장(08-02)은 새 행 여러 개를 한 번에 받으므로 `+count` 한 문장이 원자적이고 효율적이다. count 1 이면 06 의 +1 과 같다. 감사 값은 기존 `MdmNativeAuditSupport.currentStamp()` 가 요청 문맥에서 주므로 인자로 받지 않는다(TSK-01-02 D3 관례). 강도: **중**(원문은 한 번에 하나만 적는다).
- **반려되면 재작업할 방향**: (1)로 바꾸면 enum·record 를 지우고 메서드 셋의 인터페이스로 바꾼다. `RuleIdIssuerConsumerStub`·§3.6 을 고친다.

### D9: 엔진 `DefinitionLookup` "구현 대상 선언"을 무엇으로 하는가
- **질문**: 계약 패키지는 엔진 타입에 의존할 수 없다(F21). 선언을 어디에 어떤 모양으로 두는가. 06 테이블과 어긋나는 4곳(F20)은 어떻게 하는가.
- **선택지**: (1) 계약 밖 패키지(예: `com.dongkuk.dmes.mdm.dme`)에 `DefinitionLookup` 을 확장한 빈 인터페이스·추상 클래스를 둔다. (2) 계약 패키지에 구현 종류 enum(`MdmRuleDefinitionSource`)을 두고, 테스트 스텁 `RuleDefinitionLookupStub implements DefinitionLookup` 과 매핑표(§6.4)로 선언한다. (3) 엔진 인터페이스에 06 에 맞춘 메서드·타입을 더한다.
- **택한 것**: (2). 어긋남은 기록만 하고 구현 쪽 변환으로 흡수한다.
- **근거와 강약 순위**: 팀장 지시상 엔진 서명은 바꾸지 않는다((3) 배제). (1)의 추상 클래스는 구현 코드이고, 빈 확장 인터페이스는 소비자가 없는 타입을 늘린다. (2)는 06 「값 테스트 API」 두 방식(06:1069-1074)을 코드 이름으로 고정하고, 스텁 컴파일로 06 칼럼 타입 → 엔진 타입 변환이 성립함을 지금 증명한다(TSK-01-02·04-01 의 스텁 선례). 강도: **중**.
- **반려되면 재작업할 방향**: (1)이면 `com.dongkuk.dmes.mdm.dme.spi`(가칭)에 `interface MdmRuleDefinitionLookup extends DefinitionLookup {}` 를 두고 스텁이 그것을 구현하게 바꾼다. 이 패키지는 계약 ArchUnit 범위 밖이므로 §3.7 에 "구현 클래스 없음" 규칙을 더한다.

### D10: 확정 검사 SPI 의 06 쪽 "구현 대상 선언" 내용
- **질문**: `VersionConfirmCheckSpi` 가 이미 있는 상태에서(F18) 이 Task 가 무엇을 더 선언하는가.
- **선택지**: (1) 새 선언 없이 javadoc 만. (2) diff 관례 상수(`MdmRuleDiffConventions`)와 검사 항목 enum(`MdmRuleConfirmCheckItem`)을 선언하고 기존 스텁을 06 관례로 갱신. (3) 06 전용 SPI 를 새로 만든다.
- **택한 것**: (2).
- **근거와 강약 순위**: SPI 의 `VersionDiffEntry` 값 맵은 `Map<String,Object>` 라 06 의 키를 정하지 않으면 확정 화면과 구현이 따로 정하게 된다. 06 diff SQL(06:1255-1268)이 `cells`·`seq` 로 판정하므로 그 두 키를 고정한다(정본). 검사 항목은 wbs TSK-08-05·PRD FR-E4 가 정한 넷이고, "룰 참조 검사는 하지 않는다"를 enum 이름 집합으로 고정한다. (3)은 TSK-01-02 의 공통 SPI 를 우회한다. 기존 스텁은 javadoc 이 이 Task 를 선언 주체로 지목한다. 강도: **중**.
- **반려되면 재작업할 방향**: (1)이면 두 타입과 §3.6 의 해당 단언을 지우고, `BusinessRuleConfirmCheckStub` 을 원래 값으로 되돌린다. 관례는 TSK-08-05 가 정한다.

### D11: mssqlTest 소스셋에 새 MSSQL 테스트 클래스를 추가하는가
- **질문**: 선례(TSK-05-01)는 MSSQL 마이그레이션 테스트 클래스를 추가했다. 도커 금지 아래에서 이 Task 도 추가하는가.
- **선택지**: (1) 추가하지 않고, 기존 mssqlTest 3개의 버전 기대값만 V8 로 고친다(컴파일만 확인). (2) SQLite 테스트를 옮긴 `MdmBusinessRuleMssqlMigrationTest` 를 추가하고 컴파일만 확인한다.
- **택한 것**: (1).
- **근거와 강약 순위**: 사용자 결정(도커 금지)으로 실행할 수 없는 테스트는 한 번도 초록을 본 적 없는 코드가 되어, 나중에 실행했을 때 실패가 DDL 결함인지 테스트 결함인지 가를 수 없다. 대신 docker 없는 DDL 대조 테스트(§3.2)가 두 방언의 구조 동일성과 MSSQL 전용 규칙을 매 빌드마다 실제로 확인한다. mssqlTest 컴파일은 docker 없이 성공함을 확인했다(F25). 강도: **중**(선례는 반대다).
- **반려되면 재작업할 방향**: `AM/MdmBusinessRuleMssqlMigrationTest.java` 를 `MdmInterfaceLayoutMssqlMigrationTest` 패턴(`@SpringBootTest` + `local-db` + Testcontainers)으로 추가해 §3.1 의 1~9 항목과 #2~#5·#19·#20 MSSQL 몫을 옮기고, `:api:compileMssqlTestJava` 로 컴파일만 확인한다. 실행은 도커가 허용될 때 한다.

---

## Build 기록

### B1. 산출물과 커밋

| 커밋 | 내용 |
|---|---|
| `531d428` | 계약 `contract.rule` 7파일(`MdmRuleIdKind`·`MdmRuleIdRange`·`MdmRuleIdIssuer`·`MdmRuleDefinitionSource`·`MdmRuleDiffConventions`·`MdmRuleConfirmCheckItem`·`package-info`) |
| `3510743` | V8 두 방언, `MdmBusinessRuleExpectations`·`MdmBusinessRuleMigrationTest`·`MdmBusinessRuleDdlParityTest`, 기존 버전 기대값 4파일에 `"8"` 반영 |
| `3f91d9b` | `MdmSqliteLocalDateTimeConverter`·`MdmSqliteTemporalContributor`, `application-local.yml` 한 줄, 컨버터 단위 테스트 |
| `9d4f74b` | 활성 6엔티티·ID 클래스 4·리포지토리 6, `MdmBusinessRuleEntityJpaRoundtripTest`, `BusinessRuleVersionScenarioSqliteTest` |
| `11d1028` | `BusinessRuleConfirmCheckStub` 갱신, `ContractStubCompileTest` 절 추가, `RuleIdIssuerConsumerStub`·`RuleDefinitionLookupStub`, `MdmRuleContractOnlyArchitectureTest`·`violation/ViolatingIssuer` |

### B2. 테스트 먼저(빨강 확인)

| 테스트 | 처음 빨강 | 근거 |
|---|---|---|
| `MdmBusinessRuleMigrationTest`(13) · `MdmBusinessRuleDdlParityTest`(16) | 예(런타임) | SQLite V8 을 옮겨 둔 채 실행: 14 tests / 14 failed(파리티는 `initializationError`, V8 리소스 없음). V8 복원·MSSQL V8 작성 뒤 초록. 이때 `MdmSharedContractMigrationTest` 도 빨강을 확인하고 `"8"` 을 반영했다 |
| `MdmSqliteLocalDateTimeConverterTest` | 예(컴파일) | 컨버터 클래스가 없어 `cannot find symbol` |
| `MdmBusinessRuleEntityJpaRoundtripTest` | 예(런타임, D5 부분) | `application-local.yml` 의 contributor 줄을 지운 채 실행: 15 tests / 3 failed(`typeof` 가 text 가 아님, `ParseException`, yml 정적 검사). 줄을 되살려 초록 |
| `ContractStubCompileTest`(§3.6 절)·`MdmRuleContractOnlyArchitectureTest` | 예(컴파일) | `contract.rule` 타입이 없어 `cannot find symbol` |
| `BusinessRuleVersionScenarioSqliteTest`(R1~R4)·§3.1-12 런타임 가드 | 아니오 | 엔티티·DDL 을 먼저 쓴 뒤 작성했다(순서 이탈, B5-1). 대신 변이 I5c·I25a(시나리오)와 I21b·I21c(가드)로 빨강을 확인했다 |

### B3. 변이 검증

(아래 표는 `scratchpad/mutate.py` 로 변이 하나마다 적용 → 좁은 테스트 실행 → `git checkout` 원복한 결과다. 모든 변이 뒤 `git status` 가 깨끗함을 확인했다.)

| 변이 | 내용 | 결과 | 빨개진 테스트 |
|---|---|---|---|
| P2 | MSSQL RULE_VAR 에서 RES_GRP 제거 | KILLED | `MdmBusinessRuleDdlParityTest.P2_테이블마다_칼럼_이름_목록이_순서까지_같다`; `MdmBusinessRuleDdlParityTest.P3_칼럼마다_NOT_NULL_여부가_같다`; `MdmBusinessRuleDdlParityTest.P9_칼럼마다_SQLite_MSSQL_타입_쌍이_허용_목록_안에_있다` |
| P3 | MSSQL CELLS 를 NULL 로 | KILLED | `MdmBusinessRuleDdlParityTest.P10_JSON_CHECK_가_정확히_7칼럼에_방언별_함수로_있다`; `MdmBusinessRuleDdlParityTest.P3_칼럼마다_NOT_NULL_여부가_같다` |
| P4 | MSSQL PK_TB_MDM_RULE_ROW 에서 VER 제거 | KILLED | `MdmBusinessRuleDdlParityTest.P4_PK_이름과_칼럼이_같다` |
| P5 | MSSQL FK_TB_MDM_RULE_VER_RULE 에 CASCADE | KILLED | `MdmBusinessRuleDdlParityTest.P5_FK_가_같고_CASCADE_는_두_FK_뿐이다` |
| P6 | MSSQL UX_TB_MDM_RULE_ROW_SEQ 의 WHERE 제거 | KILLED | `MdmBusinessRuleDdlParityTest.P6_UX_이름_칼럼_WHERE_가_같다` |
| P7 | MSSQL CK_TB_MDM_RULE_VER_HIT 에서 'ANY' 제거 | KILLED | `MdmBusinessRuleDdlParityTest.P7_CK_이름_집합이_같고_JSON_을_뺀_CK_본문도_같다` |
| P8 | MSSQL EMERGENCY_YN 기본값 'Y' | KILLED | `MdmBusinessRuleDdlParityTest.P8_DEFAULT_칼럼과_리터럴이_같다` |
| P9 | MSSQL LAST_VAR_ID 를 BIGINT 로 | KILLED | `MdmBusinessRuleDdlParityTest.P9_칼럼마다_SQLite_MSSQL_타입_쌍이_허용_목록_안에_있다` |
| P10 | MSSQL CK_TB_MDM_RULE_SET_RULE_IDS_JSON 제거 | KILLED | `MdmBusinessRuleDdlParityTest.P10_JSON_CHECK_가_정확히_7칼럼에_방언별_함수로_있다`; `MdmBusinessRuleDdlParityTest.P7_CK_이름_집합이_같고_JSON_을_뺀_CK_본문도_같다` |
| P11 | MSSQL VAR_NAME 을 VARCHAR(MAX) 로 | KILLED | `MdmBusinessRuleDdlParityTest.P11_MSSQL_PK_UX_FK_키_칼럼에_MAX_타입이_없다`; `MdmBusinessRuleDdlParityTest.P9_칼럼마다_SQLite_MSSQL_타입_쌍이_허용_목록_안에_있다` |
| P12 | MSSQL OWNER_ID 의 COLLATE 제거 | KILLED | `MdmBusinessRuleDdlParityTest.P12_MSSQL_감사_칼럼을_뺀_길이_지정_VARCHAR_에는_BIN2_가_있다`; `MdmBusinessRuleDdlParityTest.P9_칼럼마다_SQLite_MSSQL_타입_쌍이_허용_목록_안에_있다` |
| P13 | MSSQL RULE_VAR.DOMAIN_ID 를 INT 로 | KILLED | `MdmBusinessRuleDdlParityTest.P13_MSSQL_FK_칼럼_타입이_참조_칼럼_타입과_같다`; `MdmBusinessRuleDdlParityTest.P9_칼럼마다_SQLite_MSSQL_타입_쌍이_허용_목록_안에_있다` |
| P14 | MSSQL DF_TB_MDM_RULE_STATUS 이름 제거 | KILLED | `MdmBusinessRuleDdlParityTest.P14_MSSQL_DEFAULT_는_모두_DF_이름을_갖고_IDENTITY_는_RECV_ID_뿐이다` |
| P15 | MSSQL 에 "RESULT" 표기 | KILLED | `MdmBusinessRuleDdlParityTest.P15_방언_금지_토큰이_없다` |
| I1 | SQLite 에서 RES_GRP 제거 | KILLED | `MdmBusinessRuleMigrationTest._8테이블_전부_생성되고_칼럼_목록이_순서까지_기대값과_같다` |
| I2a | MdmRuleVer 의 @AttributeOverride 제거 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.AUD_VER_테이블은_감사_카운터를_AUD_VER_에_쓰고_업무_VER_는_그대로다`; `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleRow_는_IdClass_복합_PK_로_저장_조회_왕복한다`; `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleVar_는_IdClass_복합_PK_로_저장_조회_왕복한다` |
| I2b | SQLite RULE_VER 의 AUD_VER 를 VER 로 | KILLED | `MdmBusinessRuleMigrationTest.CHECK_가_위반을_제약_이름으로_거부한다`; `MdmBusinessRuleMigrationTest.FK_가_없는_부모를_거부하고_RECV_의_룰_NULL_은_통과시킨다`; `MdmBusinessRuleMigrationTest.JSON_CHECK_는_7칼럼에서_부정형을_거부하고_NULL_허용_칼럼만_NULL_을_통과시킨다` |
| I3 | SQLite RULE_SET ROW_VERSION 을 INTEGER 로 | KILLED | `MdmBusinessRuleMigrationTest.제약_이름이_모두_있고_감사_카운터와_ROW_VERSION_은_BIGINT_다` |
| I4a | SQLite CK_TB_MDM_RULE_ROW_CELLS_JSON 제거 | KILLED | `MdmBusinessRuleMigrationTest.JSON_CHECK_는_7칼럼에서_부정형을_거부하고_NULL_허용_칼럼만_NULL_을_통과시킨다`; `MdmBusinessRuleMigrationTest.제약_이름이_모두_있고_감사_카운터와_ROW_VERSION_은_BIGINT_다` |
| I4b | SQLite BODY 에 JSON CHECK 추가 | KILLED | `MdmBusinessRuleMigrationTest.JSON_CHECK_는_7칼럼에서_부정형을_거부하고_NULL_허용_칼럼만_NULL_을_통과시킨다` |
| I5a | SQLite FK_TB_MDM_RULE_VER_RULE 에 CASCADE | KILLED | `MdmBusinessRuleMigrationTest.RULE_VER_삭제는_VAR_ROW_를_CASCADE_로_지우고_그_밖의_부모_삭제는_거부된다` |
| I5b | SQLite FK_TB_MDM_RULE_VAR_VER 의 CASCADE 제거(마이그레이션 테스트) | KILLED | `MdmBusinessRuleMigrationTest.RULE_VER_삭제는_VAR_ROW_를_CASCADE_로_지우고_그_밖의_부모_삭제는_거부된다` |
| I5c | SQLite FK_TB_MDM_RULE_VAR_VER 의 CASCADE 제거(시나리오 R2) | KILLED | `BusinessRuleVersionScenarioSqliteTest.R1_JPA_로_저장한_룰_버전을_공통_서비스가_확정하고_엔티티로_다시_읽는다`; `BusinessRuleVersionScenarioSqliteTest.R2_DRAFT_삭제는_그_버전의_변수와_행을_CASCADE_로_지운다`; `BusinessRuleVersionScenarioSqliteTest.R3_실제_TB_MDM_RULE_VER_에_네이티브_확정이_KST_초_단위_TEXT_로_쓴다` |
| I6a | SQLite UX_TB_MDM_RULE_VAR_NAME 의 WHERE 제거 | KILLED | `MdmBusinessRuleMigrationTest.JSON_CHECK_는_7칼럼에서_부정형을_거부하고_NULL_허용_칼럼만_NULL_을_통과시킨다`; `MdmBusinessRuleMigrationTest.부분_유일_인덱스가_결과_열_이름과_NORMAL_행_순번만_유일하게_묶는다` |
| I6b | SQLite UX_TB_MDM_RULE_VAR_SEQ 제거 | KILLED | `MdmBusinessRuleMigrationTest.부분_유일_인덱스가_결과_열_이름과_NORMAL_행_순번만_유일하게_묶는다`; `MdmBusinessRuleMigrationTest.제약_이름이_모두_있고_감사_카운터와_ROW_VERSION_은_BIGINT_다` |
| I7 | SQLite CK_TB_MDM_RULE_VAR_RESULT_NAME 제거 | KILLED | `MdmBusinessRuleMigrationTest.CHECK_가_위반을_제약_이름으로_거부한다`; `MdmBusinessRuleMigrationTest.제약_이름이_모두_있고_감사_카운터와_ROW_VERSION_은_BIGINT_다` |
| I8a | SQLite DISP_TYPE 목록을 엔진 enum 이름으로 | KILLED | `MdmBusinessRuleMigrationTest.CHECK_가_위반을_제약_이름으로_거부한다`; `MdmBusinessRuleMigrationTest._06_샘플_데이터가_모든_제약을_통과한다` |
| I8b | SQLite CK_TB_MDM_RULE_VAR_DISP 제거 | KILLED | `MdmBusinessRuleMigrationTest.CHECK_가_위반을_제약_이름으로_거부한다`; `MdmBusinessRuleMigrationTest.제약_이름이_모두_있고_감사_카운터와_ROW_VERSION_은_BIGINT_다` |
| I13a | MSSQL V8 파일을 빼 둠 | KILLED | `MdmFlywayVersionParityTest.sqlite_와_mssql_의_버전_집합이_같다` |
| I13b | SQLite V8 을 V5 로 개명 | KILLED | `MdmSharedContractMigrationTest.flyway_가_V1_V2_V3_V4_V8_을_적용했다` |
| I14 | MdmRuleRecv 엔티티 추가 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.관리_엔티티_테이블_집합에_06_활성_6테이블이_있고_보류_2테이블은_없다` |
| I15 | MdmRuleVar 에 @ManyToOne MdmRuleVer | KILLED | `MdmEntityArchitectureTest.엔티티_패키지는_ManyToOne_연관관계_매핑을_쓰지_않는다` |
| I16a | MdmRule.lastVarId 의 updatable=false 제거 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.MdmRule_의_카운터와_상태는_엔티티_저장으로_되돌아가지_않는다` |
| I16b | MdmRule.status 의 updatable=false 제거 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.MdmRule_의_카운터와_상태는_엔티티_저장으로_되돌아가지_않는다` |
| I16c | MdmRuleVer.status 의 updatable=false 제거 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleVer_의_서비스_소유_칼럼은_엔티티_저장으로_되돌아가지_않고_ROW_VERSION_도_자동으로_오르지_않는다` |
| I16d | MdmRuleVer.ownerId 의 updatable=false 제거 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleVer_의_서비스_소유_칼럼은_엔티티_저장으로_되돌아가지_않고_ROW_VERSION_도_자동으로_오르지_않는다` |
| I16e | MdmRuleVer.rowVersion 의 updatable=false 제거 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleVer_의_서비스_소유_칼럼은_엔티티_저장으로_되돌아가지_않고_ROW_VERSION_도_자동으로_오르지_않는다` |
| I16f | MdmRuleVer.releasedAt 의 updatable=false 제거 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleVer_의_서비스_소유_칼럼은_엔티티_저장으로_되돌아가지_않고_ROW_VERSION_도_자동으로_오르지_않는다` |
| I16g | MdmRuleVer.requestedBy 의 updatable=false 제거 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleVer_의_서비스_소유_칼럼은_엔티티_저장으로_되돌아가지_않고_ROW_VERSION_도_자동으로_오르지_않는다` |
| I16h | MdmRuleVer.applyTo 의 updatable=false 제거 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleVer_의_서비스_소유_칼럼은_엔티티_저장으로_되돌아가지_않고_ROW_VERSION_도_자동으로_오르지_않는다` |
| I16i | MdmRuleTestCase.rowVersion 의 updatable=false 제거 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleTestCase_와_MdmRuleSet_의_ROW_VERSION_은_엔티티_저장으로_되돌아가지_않는다` |
| I16j | MdmRuleSet.rowVersion 의 updatable=false 제거 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleTestCase_와_MdmRuleSet_의_ROW_VERSION_은_엔티티_저장으로_되돌아가지_않는다` |
| I17 | MdmRuleVer.rowVersion 에 @Version | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleVer_의_서비스_소유_칼럼은_엔티티_저장으로_되돌아가지_않고_ROW_VERSION_도_자동으로_오르지_않는다` |
| I18a | application-local.yml contributor 줄 제거 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleVer_는_IdClass_복합_PK_로_저장_조회_왕복한다`; `MdmBusinessRuleEntityJpaRoundtripTest.SQLite_일시_컨버터는_local_프로파일에만_등록되고_Converter_어노테이션이_없다`; `MdmBusinessRuleEntityJpaRoundtripTest.업무_일시는_초_단위_KST_텍스트로_저장되고_텍스트를_LocalDateTime_으로_읽는다` |
| I18b | 컨버터 쓰기 형식을 .SSS 로 | KILLED | `MdmSqliteLocalDateTimeConverterTest.같은_입력에_대해_MdmTemporalBinder_의_SQLite_문자열과_글자까지_같다`; `MdmSqliteLocalDateTimeConverterTest.쓰기는_초_단위로_잘라_yyyy_MM_dd_HH_mm_ss_문자열이다`; `MdmSqliteLocalDateTimeConverterTest.읽기는_공백과_T_구분_소수초를_받고_앞_19자만_쓴다` |
| I18c | 컨버터 쓰기 형식을 .SSS 로(엔티티 경로) | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.업무_일시는_초_단위_KST_텍스트로_저장되고_텍스트를_LocalDateTime_으로_읽는다` |
| I19a | 컨버터에 @Converter(autoApply = true) | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.AUD_VER_테이블은_감사_카운터를_AUD_VER_에_쓰고_업무_VER_는_그대로다`; `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleRow_는_IdClass_복합_PK_로_저장_조회_왕복한다`; `MdmBusinessRuleEntityJpaRoundtripTest.MdmRuleSet_은_지정_PK_로_저장_조회_왕복한다` |
| I19b | application-local-db.yml 에 contributor 추가 | KILLED | `MdmBusinessRuleEntityJpaRoundtripTest.SQLite_일시_컨버터는_local_프로파일에만_등록되고_Converter_어노테이션이_없다` |
| I20a | MdmRuleIdIssuer 에 default 메서드 | KILLED | `MdmContractArchitectureTest.계약_인터페이스의_메서드는_모두_추상이다` |
| I20b | contract.rule 에 DefinitionLookup 확장 인터페이스 | KILLED | `MdmContractArchitectureTest.계약_패키지는_엔진_타입에_의존하지_않는다` |
| I21a | @Component DefaultRuleIdIssuer(정적 가드) | KILLED | `MdmRuleContractOnlyArchitectureTest.main_에_MdmRuleIdIssuer_구현_클래스가_없다` |
| I21b | @Component DefaultRuleIdIssuer(런타임 가드) | KILLED | `MdmBusinessRuleMigrationTest.계약_전용_06_업무_실행_구현_빈이_없다` |
| I21c | @Component DefinitionLookup 구현(런타임 가드) | KILLED | `MdmBusinessRuleMigrationTest.계약_전용_06_업무_실행_구현_빈이_없다` |
| I21d | MdmRuleRepository 에 파생 쿼리 메서드 | KILLED | `MdmRuleContractOnlyArchitectureTest._06_리포지토리는_메서드를_선언하지_않는다` |
| I22 | (동치 변이) 스텁의 rule() 인자를 바꿔 엔진 서명과 어긋나게 | KILLED | 컴파일 실패(`:lib:compileTestJava`, `@Override`/추상 메서드 미구현) |
| I23a | MdmRuleIdIssuer.issue 의 count 인자 제거 | KILLED | 컴파일 실패(`:lib:compileTestJava`, `@Override`/추상 메서드 미구현) |
| I23b | counterColumn 값 변경 | KILLED | `ContractStubCompileTest.룰_식별자_종류마다_TB_MDM_RULE_카운터_칼럼이_정해져_있다` |
| I24a | MdmRuleDiffConventions.CELLS = "CELL" | KILLED | `ContractStubCompileTest.확정_검사_06_스텁이_row_id_키와_SEQ_CELLS_값_맵_관례를_따른다` |
| I24b | MdmRuleConfirmCheckItem 에 RULE_REFERENCE 추가 | KILLED | `ContractStubCompileTest.확정_검사_항목은_넷이고_룰_참조_검사가_없으며_정의_출처는_둘이다` |
| I25a | SQLite OWNER_ID 를 OWNER 로 개명(시나리오) | KILLED | `BusinessRuleVersionScenarioSqliteTest.R1_JPA_로_저장한_룰_버전을_공통_서비스가_확정하고_엔티티로_다시_읽는다`; `BusinessRuleVersionScenarioSqliteTest.R2_DRAFT_삭제는_그_버전의_변수와_행을_CASCADE_로_지운다`; `BusinessRuleVersionScenarioSqliteTest.R3_실제_TB_MDM_RULE_VER_에_네이티브_확정이_KST_초_단위_TEXT_로_쓴다` |
| I25b | SQLite OWNER_ID 를 OWNER 로 개명(마이그레이션) | KILLED | `MdmBusinessRuleMigrationTest._06_샘플_데이터가_모든_제약을_통과한다`; `MdmBusinessRuleMigrationTest._8테이블_전부_생성되고_칼럼_목록이_순서까지_기대값과_같다` |
| I25c | SQLite RULE_VER ROW_VERSION 기본값 제거 | KILLED | `MdmBusinessRuleMigrationTest.CHECK_가_위반을_제약_이름으로_거부한다`; `MdmBusinessRuleMigrationTest.FK_가_없는_부모를_거부하고_RECV_의_룰_NULL_은_통과시킨다`; `MdmBusinessRuleMigrationTest.JSON_CHECK_는_7칼럼에서_부정형을_거부하고_NULL_허용_칼럼만_NULL_을_통과시킨다` |

합계 62건, 전부 KILLED(살아남은 변이 0). 불변 규칙 9~12 는 파리티 변이 P7·P8·P11·P12·P13 이 덮는다. 알려진 커버리지 갭: 규칙 22 의 엔진 파일 비서명 변경, 규칙 26(기대값 완화), 규칙 27(`MdmDomainReferenceSpi` 구현) — 오케스트레이터가 diff 로 확인했다(엔진·cactus·공통 버전 diff 0행, 기대값은 `assertEquals` 동등 비교 유지, `implements MdmDomainReferenceSpi` 0건).

### B4. §3.3 MSSQL DDL 줄 단위 리뷰 체크리스트(Build 1회차)

대상: `mssql/V8__create_mdm_business_rule.sql`(커밋 `3510743`). 줄 번호는 그 파일 기준이다.

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | 두 파일의 테이블·칼럼을 줄 단위로 대응시켰다(칼럼 순서 동일) | ✓ | 테이블 시작 10·40·60·98·142·167·191·213행, SQLite 파일과 같은 순서. 자동 대조 P1·P2·P3 초록 |
| 2 | 모든 문장이 `;` 로 끝나고 `GO` 가 없다 | ✓ | `;` 로 끝나는 문장 11개(테이블 8 + 인덱스 3), `GO` 0개. P15 가 `GO` 줄을 금지한다 |
| 3 | 필터 인덱스 문법이 V3 `UX_TB_MDM_TERM_ABBR`(V3 58행)와 같은 모양이고, 필터 식에 비교만 있다 | ✓ | 140행 `WHERE VAR_KIND = 'RESULT'`, 165행 `WHERE ROW_KIND = 'NORMAL'`. `OR`·함수 없음 |
| 4 | `UX_TB_MDM_RULE_VAR_NAME` 키 크기 ≤ 1,700바이트 | ✓ | `MARU_RULE_ID` 50 + `VER`(INT) 4 + `VAR_NAME` 1,000 = 1,054바이트(140행). `UX_TB_MDM_RULE_VAR_SEQ` 50+4+20+4=78, `UX_TB_MDM_RULE_ROW_SEQ` 50+4+4=58 |
| 5 | CHECK 식이 자기 테이블 칼럼만 참조하고 함수는 `ISJSON` 뿐이며, 문자열 리터럴이 SQLite 와 글자까지 같다 | ✓ | CHECK 본문 grep: `ISJSON` 외 함수 없음. P7 이 JSON 외 CK 본문(리터럴 대소문자 포함)을 SQLite 와 비교한다(`'Equal'`·`'Expression'`·`'Value'` 동일) |
| 6 | `[RESULT]` 인용이 칼럼 정의와 CHECK 양쪽에 있다 | ✓ | 221행(칼럼), 238행(CHECK 두 곳) |
| 7 | `IDENTITY(1,1)` 칼럼에 DEFAULT 가 없고, CASCADE 경로가 각각 하나다 | ✓ | 214행 `RECV_ID BIGINT IDENTITY(1,1) NOT NULL`(DEFAULT 없음). CASCADE 는 127행(`RULE_VAR→RULE_VER`)·161행(`RULE_ROW→RULE_VER`) 둘뿐이고 `RULE_VER→RULE` 은 CASCADE 가 없어 다중 경로가 없다(규칙표 #14). P5 가 CASCADE 집합을 고정한다 |
| 8 | 제약 이름이 128자 이하이고 V2~V4 이름과 겹치지 않는다 | ✓ | V8 제약·인덱스 이름 60개, 최장 38자. V2~V4(MSSQL)의 이름과 교집합 0 |
| 9 | V2·V3 참조 칼럼과 타입·길이·콜레이션이 같다 | ✓ | `SOURCE_SYSTEM`·`SYSTEM_CODE` = `VARCHAR(20) COLLATE Latin1_General_100_BIN2`(V2 `SYSTEM_CODE` 와 같음), `RULE_VAR.DOMAIN_ID` = `BIGINT`(V3 `DOMAIN_ID BIGINT IDENTITY`). P13 초록 |

### B5. Build 이탈(design.md 대비)

1. **TDD 순서**: SQLite V8 을 테스트보다 먼저 썼다가, 실행 전에 옮겨 두고 빨강(14/14)을 확인한 뒤 되살렸다. 엔티티도 왕복 테스트보다 먼저 썼다. 왕복 테스트의 빨강은 D5 contributor 줄을 지운 실행으로 확인했고, 나머지 단언과 시나리오 R1~R4·런타임 가드는 변이 검증(B3)으로 빨강을 확인했다.
2. **§6.2 생성자 기본값 보강**: §6.2 목록에 없던 `MdmRuleSet.status`(NOT NULL, DB 기본값 `'INUSE'`)를 생성자가 `"INUSE"` 로 채운다. JPA 는 모든 칼럼을 INSERT 하므로 DB 기본값이 적용되지 않는다. `MdmRuleVar(ruleId, ver, varId, varKind, seq)`·`MdmRuleRow(ruleId, ver, rowId, rowKind, seq, cells)`·`MdmRuleTestCase(ruleId, caseId, inputJson)`·`MdmRuleSet(setId, name, ruleIds)` 는 NOT NULL 칼럼을 생성자 인자로 받는다(§6.2 가 정하지 않은 모양).
3. **JSON CHECK 이름 규칙 명확화**: §3.2 P10 은 `CK_{테이블}_{칼럼}_JSON` 이지만 §6.0 ⑥ 이름은 `CK_TB_MDM_RULE_TEST_CASE_INPUT_JSON`(접미사 겹침 없음)이다. §6.0 이름을 정본으로 보고 "칼럼 이름이 `_JSON` 으로 끝나면 접미사를 겹쳐 붙이지 않는다"로 구현했다(`MdmBusinessRuleExpectations.jsonCheckName`).
4. **검사 강화**: §3.1-4·5 의 CHECK 거부는 예외 발생만이 아니라 SQLite 오류 문구의 제약 이름까지 단언한다(다른 CHECK 가 대신 막는 경우를 가른다). 파리티 파서는 V8 에 CREATE TABLE·CREATE UNIQUE INDEX 밖의 문장이 있으면 실패하고, P15 는 `GO` 줄과 백틱도 금지한다.
5. **R1 세부**: 확정 apply_from 은 `2026-06-01 00:00:00`(v1 의 2026-01-01 보다 뒤, 시계 2026-06-20 09:08:07 이하 — 부모 INUSE 전이 조건 S22). 읽기는 트랜잭션 밖 리포지토리 `findById` 라 매번 새로 읽으므로 `entityManager.clear()` 를 부르지 않았다.
6. **불변 규칙 22 변이는 동치 변이로 했다**: 엔진 main 소스는 수정 금지라 `DefinitionLookup.rule` 서명을 실제로 바꾸지 않고, 스텁 `rule()` 의 인자 타입을 바꿔 `@Override` 컴파일 실패를 확인했다(서명이 어긋나면 스텁이 깨진다는 같은 결합을 보인다).
7. **`RuleDefinitionLookupStub.ruleSet()` 의 `ruleIds` 는 빈 목록**이다: JSON 파싱은 08-04 몫이라 스텁은 상태·ID 변환만 증명한다.

### B6. D6 감사 시각 실측값

`BusinessRuleVersionScenarioSqliteTest.R1` 표준 출력(2026-09-24): `U_AT raw={U_TYPE=text, U_AT=2026-06-20 09:08:07, C_TYPE=integer}`, 엔티티 `getUpdatedAt()` = `2026-06-20T09:08:07Z`, 시계(KST) = `2026-06-20T00:08:07Z`, **차이 +9.0시간**. 예외는 없다. 업무 일시(`applyFrom`·`applyTo`·`releasedAt`·`requestedAt`)는 정확히 같다(단언). F12 예상과 일치하며 고치지 않고 인계한다(§7 TSK-01-03 후속 행, decisions D-053).

### B7. 검증 명령 결과

오케스트레이터가 Build 게이트로 직접 실행한 결과(2026-09-24)다.

| 명령 | 결과 |
|---|---|
| `cd src/backend && ./gradlew testAll --no-daemon --console=plain` | BUILD SUCCESSFUL, **1962 tests / 0 failures / 0 errors**(기준선 1878/0 대비 +84, 신규 실패 0). 집계는 state.json `count_cmd` |
| `cd src/backend/mdm && ../gradlew :api:compileMssqlTestJava --no-daemon --rerun-tasks -x test` | BUILD SUCCESSFUL(강제 재컴파일, docker 호출 없음) |
| `mssqlMigrationTest` | 실행하지 않음. 사용자 결정: 도커 금지로 MSSQL 실측 생략, DDL 리뷰로 대체(B4 체크리스트 + `MdmBusinessRuleDdlParityTest`) |
| `/usr/bin/git diff --stat 78813e9 -- src/backend/maru-mdm-engine src/backend/cactus-core src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version` | 출력 없음(다른 Task 산출물 불변) |
| 변이 검증 | 62건 전부 KILLED(B3) |
