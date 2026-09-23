# TSK-04-01 설계 — 용어·도메인·컬럼 공유 계약 (계약 전용)

> category infra · domain database · priority critical · Design Phase(--worker 자동 모드)
> 입력: `spec.md` · `.claude/skills/dflow-dev/references/dev-discipline.md` §"Phase 02 — Design" · `RULE.md`·`CLAUDE.md` ·
> `docs/guide/BackEnd/Backend-Implementation-Guide.md` · `docs/mdm/{PRD,TRD,decisions,naming-dialect-rules,engine-contract,wbs,term-embedding}.md` ·
> `docs/mdm/design/basic/02-term-domain-column.md`(원천) · `docs/mdm/tasks/{TSK-02-03,TSK-01-02}/design.md` ·
> 코드 `src/backend/mdm/{lib,api}/**`·`src/backend/maru-mdm-engine/**`(읽기 확인) · `.claude/skills/flyway-migration-add/SKILL.md`
> 근거 강약: spec 본문 > 승인된 선행 산출물(TSK-01-02, dev 머지) > 리포 기존 관례(V2 마이그레이션·mls 선례·Backend-Implementation-Guide) > 미승인 선행 산출물(TSK-02-03 ERD, dev 머지·서버 승인 전) > 원천 설계(PostgreSQL 문법)

---

## 0. 조사로 확인한 사실 (Build 가 원천 문서를 다시 읽지 않아도 되게 적는다)

| # | 사실 | 근거 |
|---|---|---|
| F1 | **SQLite 실측(이 Design Phase 가 직접 실행)**: `foreign_keys=ON` 상태에서 부모 테이블(`TB_MDM_CODE`)이 없는 채로 자식 테이블에 그 테이블을 가리키는 인라인 FK 를 걸면 — ①`CREATE TABLE` 자체는 성공한다(전방 참조 허용) ②그 칼럼을 향한 FK 가 걸린 테이블에 대한 **모든 INSERT/DELETE 가 `NULL` 값이어도 `[SQLITE_ERROR] no such table: main.TB_MDM_CODE` 로 거부된다**(prepare 단계 검사, "비NULL일 때만 검사"가 아니다) ③그 FK 칼럼을 건드리지 않는 UPDATE 는 통과한다. 스크래치패드 `FkProbe.java`(sqlite-jdbc 3.45.3.0)로 직접 실행해 확인했다 | 이 세션 실측, `PRAGMA foreign_keys` |
| F2 | 실제 Flyway 마이그레이션은 `src/backend/mdm/api/src/main/resources/db/migration/mdm/{sqlite,mssql}/`에 **V1(baseline)·V2(TB_MDM_SYSTEM)뿐**이다. `TB_MDM_CODE`(04 영역)는 **아직 어느 방언에도 생성되지 않는다** — `docs/mdm/erd/04-master-code.{mmd,sqlite,mssql}.sql`은 TSK-02-03(docs 전용, `src/` 변경 0)이 낸 **설계 참고 파일**일 뿐 실행되는 마이그레이션이 아니고, 04 영역의 실제 Flyway·엔티티는 TSK-06-01(아직 없음) 몫이다 | `find src/backend/mdm/api/.../db/migration` 결과 |
| F3 | `docs/mdm/erd/02-term-domain-column.{sqlite,mssql}.sql`(TSK-02-03 산출물)은 **docs 카테고리 Task 의 설계 참고 파일**이며 그 design.md 자신이 "운영 판단: docs 특례. `src/` 변경 0"이라 명시한다. 이 Task 가 내는 실제 Flyway·엔티티는 이 ERD 파일을 **1차 텍스트로 삼되 그대로 옮기지 않고**, 이 Design Phase 가 실측·재확인한 지점(§"담당자 확인 필요 결정" D1·D7, 본문 VER 타입)에서 명시적으로 갈라진다 | `docs/mdm/tasks/TSK-02-03/design.md` 머리말 |
| F4 | `naming-dialect-rules.md` §2(정본)는 감사 카운터를 **`VER BIGINT`**(두 방언 동일 텍스트)로 명시하고, 이미 병합된 `V2__create_mdm_system.sql` 이 그대로 `VER BIGINT`를 썼다. TSK-02-03 ERD 는 SQLite 쪽을 `VER INTEGER`로 썼다(SQLite 는 타입 친화도만 있어 동작은 동일하지만 텍스트가 규칙표·기존 코드와 다르다). 이 Task 는 규칙표·V2 선례를 따라 SQLite 도 `VER BIGINT`로 쓴다(기본값이 명확해 별도 D 항목을 두지 않는다) | naming-dialect-rules.md:29, `V2__create_mdm_system.sql`, `docs/mdm/erd/02-term-domain-column.sqlite.sql:20` |
| F5 | `application-local.yml`·`application-local-db.yml` 모두 `spring.jpa.hibernate.ddl-auto: none`이다. Hibernate 가 부팅 시 엔티티↔스키마를 검증하지 않으므로, 엔티티 매핑 오류(칼럼명·타입 불일치)는 **부팅으로 드러나지 않는다** — 테스트가 실제 INSERT/SELECT 로 직접 확인해야 한다 | `src/backend/mdm/api/src/main/resources/application-local*.yml:12·14` |
| F6 | 엔티티·리포지토리 명명·배치 관례(mls 선례): 클래스명은 테이블명이 아니라 업무명(`Notice`, 테이블 `TB_MLS_NOTICE`), 패키지는 모듈 아래 평면 `com.dongkuk.dmes.{module}.entity`/`.repository`, `@Table(name=...)`만 쓰고 schema 속성 없음, `CactusAuditEntity` 상속만으로 감사 9칼럼 확보(엔티티에 재선언 금지) | `src/backend/mls/lib/.../entity/Notice.java`, `CactusAuditEntity.java` |
| F7 | `com.dongkuk.dmes.mdm.contract` 패키지는 `MdmContractArchitectureTest`(ArchUnit)가 5개 규칙으로 고정한다: ①패키지가 비어있지 않다 ②인터페이스·enum·record·상수 클래스만 ③인터페이스는 추상 메서드만(default·static 금지) ④record·enum 은 접근자만(판정 메서드 금지) ⑤필드에 함수 객체 금지 ⑥`org.springframework..`·`jakarta.persistence..`·`org.hibernate..`·`java.sql..`·`javax.sql..` 비의존. 이 Task 가 추가하는 서브패키지도 그대로 적용받는다(테스트가 `com.dongkuk.dmes.mdm` 전체를 스캔) | `MdmContractArchitectureTest.java` |
| F8 | `engine-contract/java/.../spi/DefinitionLookup.java`(문서 초안, F15 참조)의 `effectiveStdExpr`/`effectiveBizExpr` 자바독은 "조상 AST 를 AND 로 조립한 파생값(02 '파생값을 저장하지 않는다')"이라고 명시한다 — **조립(AND 체이닝) 자체는 엔진이 하지 않고, `DefinitionLookup` 구현체(= mdm 서버, TSK-03-02·04-03 몫)가 조립해 완성된 문자열/AST 를 엔진에 건넨다.** 02 계약(이 Task)은 조립 로직을 담지 않고, 조립에 필요한 입력(부모 체인)과 조립 결과의 **모양(인터페이스+레코드)** 만 정의한다 | `docs/mdm/engine-contract/java/kr/dongkuk/maru/mdm/engine/spi/DefinitionLookup.java:35-36` |
| F9 | wbs 의존 그래프: `TSK-04-02`·`TSK-04-03`·`TSK-04-04`는 전부 `TSK-04-01`(+`TSK-01-03` 등)에만 의존하고 **`TSK-06-01`(04 영역, `TB_MDM_CODE` 소유)에도, `TSK-08-01`(06 영역, `TB_MDM_RULE_VAR` 소유)에도 의존하지 않는다.** F1 과 결합하면 두 가지 같은 모양의 위험이 있다: ①`TB_MDM_DOMAIN.MARU_CODE_ID → TB_MDM_CODE` FK 를 SQLite 에 인라인으로 걸면 이 세 후속 Task 가 작업하는 시점에 `TB_MDM_DOMAIN`(및 자식 `TB_MDM_COLUMN`)에 대한 모든 쓰기가 막힐 수 있다(§"담당자 확인 필요 결정" D1) ②영향도 조회 구현체(TSK-04-03)가 `TB_MDM_RULE_VAR`·`TB_MDM_LAYOUT_ITEM`을 직접 SQL 로 읽으면 그 테이블이 아직 없을 때 같은 종류의 오류가 난다(D9) | `docs/mdm/wbs.md` 의존 그래프, F1 |
| F10 | `decisions.md` D-024·D-025(TSK-02-02, dev 머지·서버 승인 전) · `term-embedding.md` §5 · `naming-dialect-rules.md` §3 #23·§6.1 인계표가 `TB_MDM_TERM.EMBEDDING`(SQLite `BLOB` / MSSQL `VARBINARY(4096)`) · `EMBEDDING_MODEL VARCHAR(100)` 칼럼과 **"MSSQL 왕복 실측 → TSK-04-01"** 을 명시적으로 이 Task 소관으로 지정한다. TSK-02-03 ERD 의 D4("이번 범위 제외")는 그 자체가 "TSK-02-02 가 원장 DB 보관을 확정하면 이 Task(=여기로 이관됨)가 EMBEDDING(BLOB/VARBINARY(MAX))·EMBEDDING_MODEL(CD50) 을 추가하는 마이그레이션을 낸다"는 반려 시 재작업 경로를 이미 규정했고, 그 조건(D-024)이 이미 참이다. **타입은 D4 재작업 문구가 아니라 더 나중·더 구체적인 `naming-dialect-rules.md` §3 #23·`term-embedding.md` §5(`VARBINARY(4096)`/`VARCHAR(100)`)를 따른다** | decisions.md D-024·D-025, `term-embedding.md` §5, naming-dialect-rules.md:75·100 |
| F11 | `api/build.gradle`의 `mssqlTest` 소스셋은 `sourceSets.test.output`을 classpath 에 더해 T11(SQLite)·T12(MSSQL) 테스트가 같은 기대값 헬퍼(`MdmSystemSeedExpectations`)를 공유한다. `mssqlMigrationTest` 태스크는 `test`/`testAll` 에 `dependsOn` 되지 않는 별도 gate 다(docker 필요, 팀장이 Phase 01 기준선에서 수동 실행: 4 passed) | `api/build.gradle`, state.json baseline |
| F12 | `MdmSharedContractMigrationTest.flyway_가_V1_과_V2_를_적용했다()`는 `assertEquals(Set.of("1","2"), versions)`로 **정확히** 단언한다. `MdmMssqlMigrationTest.local_db_설정의_locations_로_V1_V2_가_적용된다()`도 `migrationsExecuted==2`·`targetSchemaVersion=="2"`·`Set.of("1","2")`를 정확히 단언한다. V3 추가 시 **둘 다 깨진다** — Build 가 `"1","2","3"`/`3`/`"3"`으로 갱신해야 하며, 이는 완화가 아니라 새 버전 반영이다. 반대로 `MdmFlywayVersionParityTest`는 `containsAll(Set.of("1","2"))`(부분 포함)만 보고 두 방언 집합의 **상호 일치**만 요구하므로, V3 를 두 방언에 같이 추가하면 **수정 없이 그대로 통과**한다 | `MdmSharedContractMigrationTest.java`, `MdmMssqlMigrationTest.java`, `MdmFlywayVersionParityTest.java` |
| F13 | naming-dialect-rules.md §6.1 인계표가 "TSK-04-01"에 배정한 실측 필요 행은 §3 의 **#3(JSON CHECK, MSSQL `ISJSON`)·#5(`JSON_VALUE`)·#15(BOOLEAN→BIT)·#16(업무 일시→`DATETIME2`, `CactusAuditEntity.Instant` SQLite 저장 형식 포함)·#19(BIN2 대소문자 구분)·#20(NULL 허용 유일=필터 인덱스)·#23(임베딩 MSSQL 왕복)** 7행이다. 각 행은 SQLite 쪽만 TSK-02-03 이 이미 실측했고 MSSQL 쪽이 이 Task 몫이다 | naming-dialect-rules.md §3·§6.1 |
| F14 | **`CactusAuditListener` 실측(코드 읽기)**: `onPrePersist`는 `AuditHolder.getAudit()`의 존재 여부와 **무관하게** `C_AT`/`U_AT`를 `Instant.now()`로, `VER`를 `0L`로 항상 채운다. `C_USR_ID`/`C_SVC_ID`/`C_PGM_ID`(및 U_ 대응)는 `AuditHolder.getAudit()`가 `null`이면(OASIS 요청 문맥 밖, 예: 순수 리포지토리 테스트) 채워지지 않고 `null`로 남는다. `TB_MDM_SYSTEM` 시드 행의 `C_AT IS NULL`(D10)은 이 리스너를 거치지 않은 **원시 SQL INSERT**(Flyway 마이그레이션 스크립트)였기 때문이며 모순이 아니다 | `CactusAuditListener.java` 직접 읽기 |
| F15 | **`maru-mdm-engine` 모듈 실측(코드 읽기)**: 실제 컴파일 대상 소스(`src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/{spi,rule,domain,code}/`)에는 **`package-info.java`만 있고 `DefinitionLookup`·`DomainKind`·`RuleEngine`·`DomainValidator`·`CodeResolver` 실제 클래스가 아직 없다**(`expr.ExpressionEvaluator`만 실재). `docs/mdm/engine-contract/java/**`는 TSK-02-02 가 낸 **문서 초안**이고 TSK-03-01(엔진 공유 계약, 아직 미착수)이 이것을 실제 모듈로 옮긴다. 따라서 이 Task 는 엔진의 `DomainKind`와 값 집합이 같은지 **컴파일 검증할 수 없다**(대상이 컴파일되지 않는다) — 문서 정합성만 맞추고 TSK-03-01 에 실제 교차 검증 테스트를 인계한다(§8) | `find src/backend/maru-mdm-engine -iname *.java`, `settings.gradle`의 `includeBuild('../maru-mdm-engine')` |
| F16 | `Backend-Implementation-Guide.md` §2.3: "MES OASIS/BPMN 모듈(mcm·mls·mqc·mpp·mas)은 JPA 연관관계 매핑(`@ManyToOne`·`@OneToMany` 등)을 금지한다." mdm 은 이 목록에 문자 그대로는 없지만 `naming-dialect-rules.md` §4 가 "mdm 은 MES 모듈로 등재되며 backend-standard 04 의 MES 규칙을 따른다"고 이미 확정했으므로 같은 금지가 적용된다고 본다(mdm 을 이 열거에서 뺀 것은 이 가이드가 mdm 신설보다 먼저 쓰였기 때문으로 판단). §3.1 의 영속성 방식 선택표는 mdm 을 열거하지 않지만 `naming-dialect-rules.md` §4(JPA 1순위, MyBatis 미사용)가 이미 더 구체적으로 확정했다 | `docs/guide/BackEnd/Backend-Implementation-Guide.md` §2.3·§3.1 |
| F17 | ERD MSSQL DDL 은 `TB_MDM_COLUMN_SYSTEM.SYSTEM_CODE`·`TB_MDM_DICT_SYSTEM.SYSTEM_CODE` 모두 이미 `VARCHAR(20) COLLATE Latin1_General_100_BIN2`로 선언돼 있다(부모 `TB_MDM_SYSTEM.SYSTEM_CODE`와 동일 콜레이션) — Build 가 V3 를 옮겨 적을 때 이 절을 누락하면 #19 판정이 부모·자식 간에 갈릴 수 있으므로 불변 규칙(§5)에 명시적으로 남긴다 | `docs/mdm/erd/02-term-domain-column.mssql.sql:136·167` |

---

## 1. 접근 방식

02 영역 7테이블(`TB_MDM_UNIT`·`TERM`·`DOMAIN`·`COLUMN`·`COLUMN_SYSTEM`·`DICT_SEQ`·`DICT_SYSTEM`)의 **Flyway V3(두 방언)를 새로 작성**하고, 그중 배포·업무 대상인 5개(`DICT_SEQ`·`DICT_SYSTEM` 제외, D2)에 JPA 엔티티·리포지토리를 붙인다. 번호 채번은 `flyway-migration-add` 스킬이 mdm 경로를 지원하지 않는다는 기존 판정(naming-dialect-rules.md §5, TSK-01-02)을 그대로 따라 **손으로** 매긴다 — sqlite·mssql 두 디렉터리를 함께 보고 두 방언 합집합의 최댓값(2) + 1 = **V3**. 파일명은 V2 선례(`V2__create_mdm_system.sql`)를 따라 `V3__create_mdm_term_domain_column.sql`(양쪽 방언 동일 파일명).

DDL 은 TSK-02-03 ERD(`docs/mdm/erd/02-term-domain-column.{sqlite,mssql}.sql`)를 1차 텍스트로 삼되, 이 Design Phase 가 직접 실측(F1)·재확인(F4·F10·F17)한 지점에서 명시적으로 갈라진다: ①`FK_TB_MDM_DOMAIN_CODE`(02→04)를 이번 V3 에서 아예 걸지 않는다(D1) ②감사 `VER`를 SQLite 도 `BIGINT`로 쓴다(F4) ③`TB_MDM_TERM`에 `EMBEDDING`/`EMBEDDING_MODEL`을 추가한다(D7) ④`SYSTEM_CODE` BIN2 콜레이션(F17)은 ERD 그대로 보존한다.

계약(contract-only) 부분은 spec 이 요구한 세 인터페이스 — 유효 식·유효 코드 참조 해석, 영향도 조회, 컬럼 사전 조회 — 를 TSK-01-02 가 이미 세운 패턴(`com.dongkuk.dmes.mdm.contract.{concern}` 서브패키지, 인터페이스·enum·record·상수만) 그대로 새 서브패키지 `com.dongkuk.dmes.mdm.contract.dictionary`에 선언한다. **구현은 이 Task 의 몫이 아니다**(TSK-04-03·04-04·05-01·08-01 등 후속 Task) — TSK-01-02 D3(`MdmNativeAuditSupport`·`MdmDialectResolver`를 인터페이스만 두고 구현은 첫 소비자에게 넘긴 것)과 같은 패턴이다(D3). 영향도 조회가 03·06 의 데이터(`TB_MDM_LAYOUT_ITEM`·`TB_MDM_RULE_VAR`)를 참조해야 하는 부분은 **02→03·02→06 로 향하는 직접 SQL 의존을 만들지 않고**, 03·06 이 구현하는 SPI(`MdmDomainReferenceSpi`)를 02 계약에 두어 TSK-01-02 의 `VersionConfirmCheckSpi`/`List<...>` 패턴을 재사용한다(D9) — 이는 F9 가 지목한 "아직 없는 테이블" 문제를 04→06 FK 문제(D1)와 같은 방식으로 푼 것이다.

엔티티·리포지토리는 계약 패키지 밖, mls `Notice` 선례를 그대로 따르는 평면 패키지 `com.dongkuk.dmes.mdm.entity`/`.repository`(lib 모듈)에 둔다(D5) — 필드 선언·JPA 애노테이션·Spring Data 파생 쿼리 메서드 선언은 "실행 로직"이 아니라는 해석이며, 커스텀 `@Query`에 담긴 분기·집계 로직이나 `@Service` 클래스는 이 Task 범위 밖이다(넣지 않는다). mdm 은 MES 모듈이므로(F16) 엔티티는 `@ManyToOne`/`@OneToMany` 연관관계 매핑을 쓰지 않고 FK 칼럼을 원시 ID 필드(`Long`/`String`)로만 매핑한다. ID 채번은 `GenerationType.IDENTITY`로 고정한다 — SQLite community dialect 와 MSSQL 모두 `AUTOINCREMENT`/`IDENTITY(1,1)` DDL 과 정확히 대응하는 전략이 이것뿐이다(다른 전략은 두 방언 중 하나에서 동작하지 않는다).

검증은 TSK-01-02 의 이중 게이트(로컬 SQLite `@SpringBootTest`+`@TempDir` / MSSQL Testcontainers `mssqlTest`)를 그대로 확장하되, MSSQL 쪽은 `MdmMssqlMigrationTest`(순수 JDBC)가 아니라 **`@SpringBootTest`+`local-db` 프로파일**로 바꿔 Hibernate 매핑(#15·#16·IDENTITY)까지 실제로 거치게 한다(§3.2). 판단 순서는: ① F1 실측으로 교차 FK 를 먼저 결정하고 ② F9 와 같은 문제(영향도 조회의 03·06 참조)를 같은 SPI 패턴으로 풀고 ③ naming-dialect-rules §6.1 인계 7행을 MSSQL 테스트로 하나씩 닫고 ④ 계약 인터페이스는 스텁 컴파일 테스트로 "03·06 이 이 인터페이스만 참조해도 필요한 걸 다 할 수 있다"를 지금 증명한다.

---

## 2. 변경 파일 목록

### 생성

- `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V3__create_mdm_term_domain_column.sql`
- `src/backend/mdm/api/src/main/resources/db/migration/mdm/mssql/V3__create_mdm_term_domain_column.sql`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmUnit.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmTerm.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDomain.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmColumn.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmColumnSystem.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmColumnSystemId.java`(복합 PK, `@IdClass` 대상, `Serializable`, 필드 `columnId`·`systemCode`·`physName`)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmUnitRepository.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmTermRepository.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmDomainRepository.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmColumnRepository.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/repository/MdmColumnSystemRepository.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/package-info.java`(§7)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/MdmDomainKind.java`(enum: QTY,CODE,ID,TEXT,DATE,FLAG)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/MdmDataType.java`(enum: NUMBER,STRING,BOOLEAN,DATE)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/MdmCodeRef.java`(record: maruCodeId, cateId)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/MdmColumnDictionaryEntry.java`(record, §7.1)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/MdmColumnDictionaryLookup.java`(interface, §7.1)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/MdmDomainDraft.java`(record, §7.2)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/MdmEffectiveDomain.java`(record, §7.2)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/MdmEffectiveDomainResolver.java`(interface, §7.2)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/MdmDomainReference.java`(record, §7.3)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/MdmDomainReferenceSpi.java`(interface, §7.3, D9)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/MdmDomainImpact.java`(record, §7.3)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/MdmDomainImpactLookup.java`(interface, §7.3)
- `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/dictionary/DictionaryContractTest.java`(§2.9 5원칙 대상 확장. 엔진 `DomainKind` 교차 검증은 **포함하지 않는다** — F15)
- `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/ColumnDictionaryConsumerStub.java`(03 소비자 흉내)
- `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/EffectiveDomainConsumerStub.java`(04-03 구현체 흉내)
- `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/stub/DomainReferenceSpiStub.java`(03·06 이 구현하는 `MdmDomainReferenceSpi` 흉내, 하나는 refKind="LAYOUT_ITEM", 하나는 "RULE_VAR")
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmTermDomainColumnMigrationTest.java`(SQLite, §3.1)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmEntityJpaRoundtripTest.java`(SQLite, JPA 왕복, §3.3 — **`api/src/test`**, `lib`이 아니다)
- `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmTermDomainColumnMssqlMigrationTest.java`(MSSQL, `@SpringBootTest`+`local-db`, §3.2)

### 수정

- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java` — `Set.of("1","2")` → `Set.of("1","2","3")`(F12)
- `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmMssqlMigrationTest.java` — `migrationsExecuted==2`→`3`, `targetSchemaVersion=="2"`→`"3"`, `Set.of("1","2")`→`Set.of("1","2","3")`(F12)
- `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/MdmContractArchitectureTest.java` — 규칙 추가: `contract..`는 `com.dongkuk.dmes.mdm.entity..`·`com.dongkuk.dmes.mdm.repository..`에 의존하지 않는다(§3.5) + 이 규칙의 공허 통과 방지 음성 테스트
- `docs/mdm/naming-dialect-rules.md` — §3 #3·#5·#15·#16·#19·#20·#23 의 "실측 필요 → TSK-04-01" 을 "확인(TSK-04-01 실측)"으로 갱신, 실측 결과(특히 #2 의 "수신 로그만 해당" 범위 정정 — 02 는 `TERM`·`DOMAIN`·`COLUMN` 도 `AUTOINCREMENT`/`IDENTITY`를 쓴다는 사실)를 §6.2 규칙대로 본문에 반영
- `docs/mdm/decisions.md` — D1(교차 FK 보류)·D9(영향도 SPI)·D7(EMBEDDING 포함) 등 되돌리기 어려운 결정을 Build 완료 시 append

### 변경하지 않음(참고만)

- `docs/mdm/erd/02-term-domain-column.{sqlite,mssql}.sql` — TSK-02-03 소유 문서. 이 Task 는 텍스트를 그대로 옮기지 않고 갈라지는 지점을 명시했으므로(§1) ERD 파일 자체를 고치지 않는다(고치면 TSK-02-03 의 담당 범위를 침범한다).

---

## 3. 테스트 전략

**기준선**(dev-discipline 공통, state.json 에 이미 기록):
```
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --console=plain
# → 447 tests / 0 failures
cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain
# → 4 passed (SQL Server 2022-CU27, testAll 비포함 수동 게이트, docker 필요)
```
게이트 판정 = 위 두 명령의 **기준선 대비 신규 실패 0**. MSSQL 게이트는 docker 가용 시에만 돈다 — Build·Verify 시점에 docker 가 없으면 "미실행"을 그대로 보고하고 실패로 위장하지 않는다.

### 3.1 `MdmTermDomainColumnMigrationTest`(SQLite, `api/src/test`)

`MdmSharedContractMigrationTest`와 같은 패턴(`@SpringBootTest(webEnvironment=MOCK) @ActiveProfiles("local")`, `@TempDir` + `@DynamicPropertySource`로 SQLite URL 주입, DataSource 직접 JDBC). 확인 항목:

1. `flyway_schema_history`에 버전 `"3"`이 `success=1`로 있다.
2. 7테이블 전부 생성됨(`sqlite_master`), PK·FK·CK·UX·IX 제약명이 규칙표(`PK_/FK_/CK_/UX_/IX_{테이블}_...`)를 따른다.
3. **F1 을 그대로 실증하는 테스트**: `TB_MDM_CODE`가 여전히 없는 상태에서 `TB_MDM_DOMAIN`에 `MARU_CODE_ID=NULL`인 행(QTY 종류)을 INSERT 하면 **성공**해야 한다(= FK 를 걸지 않기로 한 D1 의 직접 증거). 테스트 이름 자체에 "FK_TB_MDM_DOMAIN_CODE 부재 확인"을 명시해 이탈 이유를 코드에서 바로 읽히게 한다.
4. `TB_MDM_UNIT`·`TB_MDM_COLUMN_SYSTEM`·`TB_MDM_DICT_SYSTEM`이 참조하는 기존 FK(`TB_MDM_SYSTEM`, TSK-01-02 소유)는 이미 V2 가 만들었으므로 정상 동작해야 한다 — 존재하지 않는 `SYSTEM_CODE`로 INSERT 하면 거부됨을 확인(F1 과 대조군).
5. JSON CHECK **8칼럼**(`TERM.SYNONYMS`·`ALIASES`·`SYSTEMS` 3개, `DOMAIN.STD_AST`·`BIZ_AST`·`EXAMPLES`·`TEST_CASES` 4개, `COLUMN.TERM_IDS` 1개) 각각 부정형 JSON 문자열 INSERT 가 거부되고 NULL 은 통과함을 확인(TSK-02-03 Verify.java 체크 g#3 재현).
6. 유일 인덱스: `UX_TB_MDM_TERM_NAME_SENSE`(복합, `TERM_NAME`+`SENSE_NO` 둘 다 NOT NULL — 중복만 확인)·`UX_TB_MDM_COLUMN_NAME`·`UX_TB_MDM_COLUMN_PHYS_NAME`(둘 다 NOT NULL 칼럼 — 중복만 확인, "NULL 다건 허용" 대상이 **아니다**)은 중복 INSERT 거부를 확인한다. `UX_TB_MDM_TERM_ABBR`(`ENG_ABBR` NULL 허용, `WHERE ENG_ABBR IS NOT NULL` 부분 인덱스)**만** NULL 다건 허용 + 동일 비NULL 값 재삽입 거부를 확인한다(#20).
7. `TERM_ID`·`DOMAIN_ID`·`COLUMN_ID` 의 `INTEGER PRIMARY KEY AUTOINCREMENT`가 삭제된 최댓값을 재사용하지 않음을 연속 INSERT/DELETE/INSERT 로 확인(#2 범위 정정의 직접 증거 — "수신 로그만 해당"이 아니라 02 의 3개 엔티티 테이블도 해당함을 보인다).
8. `EMBEDDING`/`EMBEDDING_MODEL` 칼럼 존재와 NULL 허용을 확인하고, 4,096바이트 `BLOB`에 임의 float32 LE 배열을 왕복시켜 바이트 단위 일치를 확인(term-embedding.md PoC 재현, #23 SQLite 쪽).
9. `CK_TB_MDM_DOMAIN_CODE`·`CK_TB_MDM_DOMAIN_FLAG`·`CK_TB_MDM_COLUMN_REQUIRED` 각각 위반 INSERT 거부를 확인.

### 3.2 `MdmTermDomainColumnMssqlMigrationTest`(MSSQL, `api/src/mssqlTest`)

**JDBC 전용인 기존 `MdmMssqlMigrationTest` 패턴을 그대로 복제하지 않는다** — #15(BIT↔`boolean`)·#16(Instant→`DATETIME2`)·IDENTITY 채번은 Hibernate 매핑을 실제로 거쳐야 의미가 있기 때문이다. 대신:

- `@SpringBootTest(webEnvironment = MOCK)` + `@ActiveProfiles("local-db")`(mcm 선례가 이미 요구하는 프로파일, `mssql-jdbc` 의존은 `lib/build.gradle`에 이미 있음, F 항목 없음 — 기존 파악).
- `@Testcontainers` + `@Container static MSSQLServerContainer`(`MdmMssqlMigrationTest`와 동일 이미지: `mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04`).
- **부팅 순서**: `@DynamicPropertySource` 정적 메서드 안에서 (a) 컨테이너 master DB 에 raw JDBC 로 접속해 `CREATE DATABASE mdm`을 먼저 실행한 뒤 (b) `spring.datasource.url`을 `mdm` 데이터베이스로 등록한다. `@DynamicPropertySource`는 스프링 컨텍스트가 뜨기(및 Flyway 자동 마이그레이션이 실행되기) **전에** 평가되므로, DB 생성이 그보다 먼저 끝나 있어야 컨텍스트 기동 시 Flyway 가 성공한다(`MdmMssqlMigrationTest.migrate()`의 `@BeforeAll` 순서를 `@DynamicPropertySource` 안으로 옮긴 것과 같다).
- 확인 항목(naming-dialect-rules §6.1 인계 7행을 전부 닫는다):
  1. 마이그레이션 3건 적용, `flyway_schema_history`에 `{"1","2","3"}`.
  2. **#3**: `CHECK (... ISJSON(...) = 1)` 8개 제약이 `sys.check_constraints`에 존재하고, 부정형 JSON INSERT 가 SQLServer 오류 547(CHECK 위반)로 거부된다.
  3. **#5**: `JSON_VALUE(STD_AST, '$.type')`류 질의가 SQLite `json_extract`와 같은 값을 반환한다(같은 입력 JSON 으로 양쪽 실행 후 비교).
  4. **#15**: `MdmColumn.required`(boolean)를 실제 `MdmColumnRepository.save()`로 `true`/`false` 저장·조회해 Hibernate `boolean`↔`BIT` 매핑이 SQLite `INTEGER(0/1)` 매핑과 같은 논리값을 왕복함을 확인.
  5. **#16**: 엔티티 저장으로 `CactusAuditEntity.C_AT`를 채우고(F14 — `Instant.now()`로 항상 채워짐) `DATETIME2` 컬럼에서 다시 읽어 왕복 오차가 허용 범위(초 단위) 안임을 확인. `C_USR_ID` 등은 `AuditHolder` 문맥이 없는 테스트이므로 **NULL 로 남는 것이 정상**임을 단언한다(F14, "실패"가 아니라 "예상된 동작"으로 명시).
  6. **#19**: `STD_NAME`·`DOMAIN_KIND`·`PHYS_NAME`·`SYSTEM_CODE` 등 BIN2 콜레이션 칼럼에 대소문자만 다른 두 값이 서로 다른 행으로 INSERT 됨을 `sys.columns.collation_name='Latin1_General_100_BIN2'` 확인 + 실제 INSERT 로 이중 확인.
  7. **#20**: `UX_TB_MDM_TERM_ABBR`만 `sys.indexes`에서 `has_filter=1`임을 확인하고 실제로 NULL 다건·중복 비NULL 1건 규칙을 강제함을 확인한다(`UX_TB_MDM_COLUMN_PHYS_NAME`은 필터 인덱스가 **아니므로** 이 단언 대상이 아니다).
  8. **#23**: `VARBINARY(4096)`에 4,096바이트를 저장·재조회해 SQLite `BLOB` 결과와 바이트 단위로 동일함을 확인.
  9. `IDENTITY(1,1)`로 생성된 `DOMAIN_ID`가 실제 `MdmDomainRepository.save()` 연속 호출로 SQLite `AUTOINCREMENT`와 같은 단조 증가 성질을 가짐을 확인.
  10. **F1 대조군을 MSSQL 에서도 실행**: `TB_MDM_CODE`가 없는 상태에서 `TB_MDM_DOMAIN` INSERT 가 정상 동작함을 확인(MSSQL 은 애초에 `CREATE TABLE` 안에 FK 자체가 없으므로 자명하지만, D1 이 실제 파일에 반영됐음을 코드로 고정한다).

### 3.3 `MdmEntityJpaRoundtripTest`(SQLite, **`api/src/test`**)

`ddl-auto:none`(F5)이라 부팅이 매핑 오류를 잡지 못하므로, 5개 엔티티 각각 최소 1건 저장→조회 왕복을 직접 수행해 칼럼명·타입 매핑이 실제로 맞는지 확인한다. **`lib` 모듈이 아니라 `api` 모듈의 test 소스셋에 둔다** — Flyway 마이그레이션 리소스(V3 을 포함해 V1·V2 도)는 `api/src/main/resources`에만 있고 `lib`은 `api`에 의존하지 않는 방향(`api project(':lib')`, F6 참고)이라 `lib/src/test`에서는 실제 스키마를 만들 수 없다. `api`는 이미 `lib`에 의존하므로 엔티티 클래스는 그대로 보이고, `@SpringBootTest(webEnvironment=MOCK) @ActiveProfiles("local")` + `@TempDir`(`MdmSharedContractMigrationTest`와 동일 패턴)이면 V1~V3 이 전부 적용된 SQLite DB 위에서 리포지토리를 그대로 쓸 수 있다. `api`의 `@SpringBootApplication`(또는 등가 설정)이 `com.dongkuk.dmes.mdm` 전체를 컴포넌트/엔티티 스캔 범위로 잡는지(대개 base package 스캔이면 자동 포함) Build 가 먼저 확인한다. `MdmColumnSystem`의 `@IdClass` 복합키 저장·조회도 포함.

### 3.4 계약 스텁 컴파일 테스트

`ContractStubCompileTest` 패턴을 확장(같은 파일에 메서드 추가 또는 별도 스텁 파일, Build 판단):
- `ColumnDictionaryConsumerStub`(03 역): `MdmColumnDictionaryLookup`만 알아 `byPhysName`으로 얻은 `MdmColumnDictionaryEntry`의 `labelLong`·`domainId`·`refKind` 를 읽어 화면 라벨을 조립하는 흉내 메서드가 **컴파일**됨을 확인.
- `EffectiveDomainConsumerStub`(04-03 역): `MdmEffectiveDomainResolver`만 구현해(`resolve`/`resolveDraft`) 유효 식·유효 코드 참조를 돌려주는 흉내가 **컴파일·동작(단순 반환값)** 함을 확인.
- `DomainReferenceSpiStub`(03·06 역, D9): `MdmDomainReferenceSpi`를 구현하는 스텁 2개(refKind="LAYOUT_ITEM"인 03 역, refKind="RULE_VAR"인 06 역)를 만들고, `List<MdmDomainReferenceSpi>`를 순회해 결과를 합치는 흉내 메서드가 컴파일되며, **빈 리스트**(구현체 0개, wbs "참조 0건" 수용 기준)에서도 정상 동작(빈 결과)함을 확인한다.

### 3.5 ArchUnit 확장(§2 "수정" 목록)

- `contract..`는 `com.dongkuk.dmes.mdm.entity..`·`com.dongkuk.dmes.mdm.repository..`에 의존하지 않는다: `noClasses().that().resideInAPackage("com.dongkuk.dmes.mdm.contract..").should().dependOnClassesThat().resideInAnyPackage("com.dongkuk.dmes.mdm.entity..", "com.dongkuk.dmes.mdm.repository..")`.
- **음성 테스트**(대상 패키지가 비어 있으면 규칙이 공허 통과한다): `new ClassFileImporter().importClasses(...)`로 규칙 위반 클래스(계약 인터페이스를 가장한 클래스가 엔티티를 직접 참조하는 test-only 고립 클래스)를 만들고, 그 고립된 `JavaClasses`에 규칙을 적용하면 `evaluate(...).hasViolation()`이 참임을 확인한다. 03·06 의 실제 계약 패키지가 생기기 전까지 이 규칙이 "아무것도 못 잡는 채로 통과"하고 있지 않음을 보장한다.

### 3.6 브라우저 E2E

해당 없음 — entry-point 없음, domain=database(화면 작업이 아니다). dev-discipline §"화면 작업의 브라우저 E2E" 트리거 조건(entry-point 존재 또는 domain=fullstack/frontend)에 해당하지 않는다.

---

## 4. 수용 기준 매핑

| spec 수용 기준 | 검증 방법 |
|---|---|
| 실행 로직 없음(contract-only) | F7 확장 ArchUnit(§3.5)이 `contract.dictionary` 서브패키지에도 자동 적용됨을 확인. 엔티티·리포지토리 패키지는 계약 밖이므로 이 기준의 직접 대상이 아니되, §1 의 "선언=비로직" 해석을 불변 규칙(§5)에 명시해 리뷰 기준으로 남긴다 |
| 03·06 계약이 이 인터페이스만 참조한다 | §3.4 스텁 컴파일 테스트(지금 증명) + §3.5 ArchUnit 규칙(TSK-05-01·08-01 이 실제 계약 패키지를 만들 때 자동 집행) |
| (spec 요구사항) 02 테이블 7개 Flyway 두 방언 | §3.1-1,2 / §3.2-①  |
| (spec 요구사항) JPA 엔티티·리포지토리 | §3.3, D2(범위=5개) |
| (spec 요구사항) 유효 식·유효 코드 참조 해석 함수 인터페이스(저장·조회 공유) | §7.2 `MdmEffectiveDomainResolver`(persist 조회 `resolve` + 미저장 초안 미리보기 `resolveDraft` — "저장·조회 공유"의 저장측 근거는 D8), §3.4 |
| (spec 요구사항) 영향도 조회 인터페이스 | §7.3 `MdmDomainImpactLookup` + `MdmDomainReferenceSpi`(D9, 03·06 이 비어 있어도 "참조 0건"으로 동작 — wbs TSK-04-03 수용 기준과 정확히 일치), §3.4 |
| (spec 요구사항) 컬럼 사전 조회 인터페이스(03 레이아웃·06 룰 변수가 사용) | §7.1 `MdmColumnDictionaryLookup`, §3.4 |
| naming-dialect-rules §6.1 인계 7행(#3·5·15·16·19·20·23) | §3.2 전부, §3.1-5,6,7,8 |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

1. **02 원천 칼럼은 대소문자만 바꾼다** — naming-dialect-rules §1 그대로. TSK-02-03 ERD 가 이미 확정한 칼럼명·타입·NULL 여부·D3(관리속성 3종)·D6(`PHYS_NAME` UNIQUE)를 이 Task 가 재론하지 않는다. 이 Task 가 스스로 여는 이탈은 D1(FK 제외)·D7(EMBEDDING 추가)·VER 타입(F4, 기본값)·D9(SPI 신설) **뿐**이며, 그 밖의 모든 칼럼·제약은 ERD 파일 텍스트를 그대로 옮긴다.
2. **FK_TB_MDM_DOMAIN_CODE 를 이번 V3 어디에도(SQLite·MSSQL 모두) 인라인으로 걸지 않는다**(D1). 04 영역 마이그레이션(TSK-06-01)이 생긴 뒤 후행으로 추가하는 것은 그 Task 의 몫이고, SQLite 는 테이블 재생성이 필요하다는 사실을 인계 사항(§8)에 남긴다.
3. **계약 패키지(`contract..`)에는 인터페이스·enum·record·상수 클래스만 둔다.** 구현체·서비스·조립 로직(재귀 CTE, AND 체이닝, MASTER 삽입, SPI 목록 집계)은 이 Task 에 없다 — TSK-04-03·04-04·05-01·06-01·08-01 이 채운다.
4. **감사 9칼럼은 엔티티가 `CactusAuditEntity`를 상속해 얻는다.** 엔티티에 `C_USR_ID`~`VER`를 재선언하지 않는다. 이 5개 테이블 중 원천 업무 칼럼과 `VER`가 충돌하는 테이블은 없다(D-034 예외 대상 6개 테이블은 04·06 영역 소속) — `@AttributeOverride`는 필요 없다.
5. **`TB_MDM_DICT_SEQ`·`TB_MDM_DICT_SYSTEM`에는 엔티티·리포지토리를 붙이지 않는다**(D2, D-019·D-031 계승). DDL(Flyway)만 있다.
6. **엔진 타입(`kr.dongkuk.maru.mdm.engine..`)을 계약에 import 하지 않는다.** `MdmDomainKind`·`MdmDataType`은 엔진의(현재는 문서 초안뿐인, F15) `DomainKind`·`DataType`과 값 집합을 같게 **의도**하되(문서 대조로만, 컴파일 교차검증은 TSK-03-01 인계) 별도 타입으로 선언한다 — 두 모듈(`mdm/lib` vs `maru-mdm-engine`)의 결합을 만들지 않기 위해서다.
7. **EMBEDDING 값 형식은 L2 정규화 float32 little-endian 1024개(4,096바이트)로 고정한다**(term-embedding.md). 엔티티에 매핑하지 않고 네이티브 SQL 로만 다룬다 — D-024 의 명시적 결정이다.
8. **`VersionConventions`·`MdmAuditColumns`·`MdmDialect` 등 TSK-01-02 계약을 재정의하지 않는다.** 이 Task 는 기존 계약을 소비할 뿐 바꾸지 않는다.
9. **mdm 엔티티는 `@ManyToOne`/`@OneToMany` 등 JPA 연관관계 매핑을 쓰지 않는다**(F16, MES 모듈 규칙). FK 는 원시 ID 필드로만 표현한다.
10. **ID 채번은 `GenerationType.IDENTITY`로 고정한다**(`TERM`·`DOMAIN`·`COLUMN`). SQLite community dialect·MSSQL 모두 이 전략만 `AUTOINCREMENT`/`IDENTITY(1,1)` DDL 과 대응한다.
11. **`COLUMN_SYSTEM.SYSTEM_CODE`·`DICT_SYSTEM.SYSTEM_CODE`는 `VARCHAR(20) COLLATE Latin1_General_100_BIN2`를 유지한다**(F17, ERD 원문 그대로) — 부모 `TB_MDM_SYSTEM.SYSTEM_CODE`와 콜레이션이 어긋나면 FK 비교·#19 판정이 갈린다.
12. **JSON CHECK 대상은 정확히 8칼럼**(TERM 3·DOMAIN 4·COLUMN 1)이다. 늘리거나 줄이지 않는다.

---

## 담당자 확인 필요 결정

사람에게 묻지 않고 자동 모드 규칙(근거 강도)으로 결정했다. 각 항목에 선택지·강도(강/중/약)·택한 것·근거·반려 시 재작업을 남긴다. spec 이 지정한 판단 지점 1(교차 FK)은 D1, 2(엔티티 범위)는 D2, 3(의존 방향)은 D9 에서 다룬다.

### D1 — 교차 영역 FK(`FK_TB_MDM_DOMAIN_CODE`)를 이번 V3 에 걸 것인가 (판단 지점 1)
- **질문**: 02→04 FK 를 어떤 방식으로 처리할 것인가.
- **선택지**:
  1. ERD 그대로 — SQLite 인라인, MSSQL 후행 ALTER(`99-cross-area-fk.mssql.sql` 패턴). **강도: 약** — F1 실측(NULL INSERT/DELETE 까지 전부 `no such table`로 거부)과 F9(`TSK-04-02`~`04-04`가 `TSK-06-01`에 의존하지 않음)에 정면으로 부딪힌다.
  2. 양쪽 다 이번 V3 에서 FK 를 걸지 않고, `TSK-06-01`이 두 방언 모두 후행으로 추가(SQLite 는 테이블 재생성 필요). **강도: 강** — F1·F9 실측·사실이 직접 뒷받침한다.
  3. SQLite 에는 **영구히** FK 를 걸지 않고 애플리케이션 검사(`MaruIdNamespace`, 아래 §8)로 대체한다(MSSQL 은 여전히 후행 ALTER). **강도: 중** — F1 문제는 피하지만 "구조 오류를 DB 가 못 잡는다"는 대가가 영구적이고, 02 원천의 "MDM 데이터 참조는 FK 없음" 원칙이 이 FK(같은 저장소 안의 카탈로그 참조)에 그대로 적용되는지 근거가 약하다.
- **택한 것**: 2.
- **근거**: F1(SQLite 는 부모 테이블 부재 시 NULL INSERT·DELETE 까지 전부 거부) + F9(`TSK-04-02`·`04-03`·`04-04`가 `TSK-06-01`에 의존하지 않으므로 작업 시점에 `TB_MDM_CODE`가 없을 개연성이 실제로 있다) — 이때 1을 택하면 `TB_MDM_DOMAIN`(및 자식 `TB_MDM_COLUMN`)에 대한 **모든 쓰기**가 도메인 종류와 무관하게 막힌다. TSK-02-03 의 D7·F2 는 "선행 확정된 부모"(`TB_MDM_SYSTEM`)에는 맞지만 "후행 미확정 부모"(`TB_MDM_CODE`)에는 같은 논리를 적용할 수 없다. **강도: 강**.
- **반려 시 재작업**: 1로 되돌리려면 `TSK-04-02`~`04-04` 착수 전에 최소 빈 `TB_MDM_CODE` 스텁 테이블(또는 `TSK-06-01` 조기 실행)이 먼저 있어야 하고, §2·§3.1-3(FK 부재 증명 테스트)을 반대 방향(FK 강제 확인)으로 바꾼다.

### D2 — 엔티티 범위(7개 전부 vs 5개) (판단 지점 2)
- **질문**: spec "7개 Flyway·JPA 엔티티·리포지토리"에서 `TB_MDM_DICT_SEQ`·`TB_MDM_DICT_SYSTEM`도 엔티티화할 것인가.
- **선택지**:
  1. 7개 전부. **강도: 약** — decisions.md D-019 의 "배포 순번·수신 로그 테이블은 DDL-only" 분류와 정면 충돌한다.
  2. `DICT_SEQ`·`DICT_SYSTEM` 제외 5개만. **강도: 강** — D-019·D-031 이 이미 명시적으로 분류했고 TSK-02-03 F16 도 같은 취급을 했다.
- **택한 것**: 2.
- **근거**: decisions.md D-019(dev 머지, 이 Task 보다 선행·더 넓은 범위 결정)가 "배포 대상·배포 순번·수신 로그 테이블은 DDL-only(엔티티·리포지토리·서비스·BPMN·화면 없음)"라고 명시적으로 분류했고, `TB_MDM_DICT_SEQ`는 정확히 그 "배포 순번" 부류다. spec 의 "7개"는 데이터 모델(=Flyway DDL) 목록으로 읽고, JPA 엔티티·리포지토리 요구는 그중 업무 활성 테이블에 한정한다. **강도: 강**.
- **반려 시 재작업**: `DICT_SEQ`(배포 순번 발급, `UPDATE...RETURNING`/`OUTPUT` 네이티브 쿼리 필요, naming-dialect-rules §3 #1)·`DICT_SYSTEM` 엔티티·리포지토리 2세트를 추가한다.

### D3 — 계약 인터페이스의 구현 위치(직접 구현 vs 후속 Task 위임)
- **질문**: 세 인터페이스를 이 Task 가 (부분적으로나마) 구현할 것인가.
- **선택지**:
  1. 인터페이스만 선언, 구현은 전부 후속 Task. **강도: 강** — TSK-01-02 D3 선례와 spec 수용 기준 1(실행 로직 없음)에 직접 부합.
  2. 컬럼 사전 조회 정도는 이 Task 가 리포지토리 기반 구현까지 제공. **강도: 약** — 수용 기준 1 을 정면 위반하고, D2 번복 시 재작업 비용이 커진다.
- **택한 것**: 1.
- **근거**: 위 강도 그대로. TSK-01-02 D3 이 구조적으로 동일한 문제를 같은 방식으로 이미 풀었다.
- **반려 시 재작업**: 컬럼 사전 조회의 단순 구현체(`@Repository` 기반 어댑터)를 계약 밖 새 패키지에 추가한다.

### D4 — "03·06 계약이 이 인터페이스만 참조한다"의 검증 방법(대상 패키지가 아직 없음)
- **질문**: 대상 패키지가 없는 지금 이 수용 기준을 어떻게 검증하는가.
- **선택지**:
  1. ArchUnit 규칙만 미리 심어 둔다. **강도: 약** — 대상이 없어 공허 통과, 규칙 자체의 유효성이 증명되지 않는다.
  2. 스텁 컴파일 테스트만으로 지금 증명한다. **강도: 중** — "인터페이스만으로 충분하다"는 보이지만 향후 실제 위반을 자동으로 잡는 장치가 없다.
  3. 둘 다(ArchUnit + 공허 통과 방지 음성 테스트 + 스텁 컴파일). **강도: 강**.
- **택한 것**: 3.
- **근거**: TSK-01-02 자신도 `계약_패키지가_비어_있지_않다` 별도 테스트로 공허 통과 문제를 이미 경계했다. 스텁(§3.4)으로 지금 증명하고, ArchUnit(§3.5, 음성 테스트 포함)은 실제 03·06 계약이 생겼을 때 자동 집행되도록 미리 심는다.
- **반려 시 재작업**: 검증을 전부 TSK-05-01·08-01 로 미루고, 이 Task 는 §2.9 5원칙 ArchUnit 만 검증한다.

### D5 — 엔티티·리포지토리 배치 위치
- **질문**: 5개 엔티티·리포지토리를 어디에 둘 것인가.
- **선택지**:
  1. `lib` 모듈의 평면 패키지 `com.dongkuk.dmes.mdm.entity`/`.repository`(mls `Notice` 선례). **강도: 강**.
  2. `api` 모듈. **강도: 약** — `api`는 `war`+부트 실행 모듈이라 다른 잠재 소비자가 재사용 불가.
  3. `contract` 하위 서브패키지. **강도: 약** — `MdmContractArchitectureTest`(F7) 규칙을 정면 위반.
- **택한 것**: 1.
- **근거**: F6(mls 선례)이 리포 전역 관례이고, `lib/build.gradle`이 이미 JPA·Hibernate·SQLite JDBC 를 `api` 스코프로 갖는다(조사 확인).
- **반려 시 재작업**: 패키지 전체 이동 + `build.gradle` 의존 방향 재검토(영향 범위가 크다).

### D7 — `TB_MDM_TERM.EMBEDDING`/`EMBEDDING_MODEL`을 이번 V3 에 포함
- **질문**: TSK-02-03 D4 가 "이번 범위 제외"로 미뤘던 임베딩 칼럼을 이 Task 의 V3 에 지금 포함할 것인가.
- **선택지**:
  1. 포함(SQLite `BLOB`, MSSQL `VARBINARY(4096)`, 양쪽 `EMBEDDING_MODEL VARCHAR(100)`, 엔티티 미매핑). **강도: 강** — F10(D-024·D-025·naming-dialect-rules §6.1 인계표가 명시적으로 이 Task 를 지목).
  2. 제외하고 TSK-04-02 로 이월. **강도: 약** — 이미 참이 된 조건을 또 미뤄 마이그레이션을 한 번 더 늘린다.
- **택한 것**: 1.
- **근거**: F10. 타입은 TSK-02-03 D4 의 재작업 문구(`VARBINARY(MAX)`/`CD50`)가 아니라 더 나중·더 구체적인 `naming-dialect-rules.md`·`term-embedding.md`(`VARBINARY(4096)`/`VARCHAR(100)`)를 따른다.
- **반려 시 재작업**: 두 칼럼과 §3.1-8·§3.2-⑧ 테스트를 제거하고 TSK-04-02 로 넘긴다.

### D8 — "컬럼 사전 조회"와 "유효 식 해석"을 하나로 합칠지 분리할지
- **질문**: `MdmColumnDictionaryLookup`(컬럼 속성)과 `MdmEffectiveDomainResolver`(도메인 값 정의)를 하나로 합칠지, 분리할지.
- **선택지**:
  1. 분리. **강도: 강** — 02 원천이 "컬럼은 도메인을 참조만 한다"고 개념을 이미 분리했고, 03(라벨·ref 만 필요)·06(값 정의 필요)의 결합도가 낮아진다.
  2. 병합(engine `DefinitionLookup.ColumnDefinition`처럼 한 번에 반환). **강도: 중** — 엔진의 조회 편의(호출 1회)를 위한 것이지 02 계약 차원의 개념 분리를 부정하지 않는다.
- **택한 것**: 1.
- **근거**: 위 강도 그대로.
- **반려 시 재작업**: 두 레코드를 `MdmColumnDefinition` 하나로 합치고 인터페이스도 하나로 줄인다. §3.4 스텁도 함께 고친다.

### D9 — 영향도 조회가 03·06 데이터(`TB_MDM_LAYOUT_ITEM`·`TB_MDM_RULE_VAR`)를 참조하는 방식 (판단 지점 3, 의존 방향)
- **질문**: `MdmDomainImpactLookup` 구현체(TSK-04-03)가 03·06 의 데이터를 어떻게 참조하는가 — 두 테이블이 아직 없거나(06 은 `TSK-08-01` 미완료 시) 비어 있을 수 있는 상황(F9)에서.
- **선택지**:
  1. TSK-04-03 구현체가 `TB_MDM_RULE_VAR`·`TB_MDM_LAYOUT_ITEM`을 직접 네이티브 SQL 로 조인해 읽는다. **강도: 약** — F1 과 같은 종류의 실패(대상 테이블이 없으면 `no such table`)가 나고, 04→06/04→03 방향의 강한 결합이 생겨 wbs 의존 그래프(02→03·02→06 단방향, 역방향 없음)를 어긴다.
  2. `contract.dictionary`에 03·06이 구현하는 SPI(`MdmDomainReferenceSpi`)를 신설하고, 영향도 조회 구현체는 `List<MdmDomainReferenceSpi>`(스프링 빈 목록, 0개 가능)를 모아 집계한다(TSK-01-02 `VersionConfirmCheckSpi`/`ContractStubCompileTest`의 `List<VersionConfirmCheckSpi>` 패턴과 동일 구조). **강도: 강** — 구현체가 없으면(TSK-08-01 미완료) 리스트가 비어 "참조 0건"이 자연스럽게 나온다(wbs TSK-04-03 수용 기준과 정확히 일치), 03·06→02 방향의 계약 의존만 생기고 역방향 결합이 생기지 않는다.
  3. 영향도 조회에서 룰 결과 변수·레이아웃 참조는 아예 빼고 하위 도메인·참조 컬럼만 반환한다. **강도: 중** — F9 류 실패는 원천 차단되지만 02 원천("이 문서의 영향도는 이 참조도 센다")과 wbs TSK-04-03 요구사항("레이아웃 조회" 포함)을 축소하는 것이라 spec 근거가 더 강한 2에 밀린다.
- **택한 것**: 2.
- **근거**: F9 와 완전히 같은 구조의 문제이고, TSK-01-02 가 이미 검증한 패턴을 그대로 재사용해 새 리스크를 만들지 않는다. wbs 의 02→03·02→06 단방향 의존과도 정합적이다(03·06 이 SPI 구현체를 제공하는 쪽이지 02 가 03·06 타입을 아는 쪽이 아니다). **강도: 강**.
- **반려 시 재작업**: 1로 가면 `MdmDomainImpactLookup` 구현체가 `TB_MDM_LAYOUT_ITEM`·`TB_MDM_RULE_VAR`에 대한 네이티브 조인 SQL 을 직접 가져야 하고, 그 테이블들이 없는 동안 예외를 던지지 않도록 방어 코드(테이블 존재 여부 조회 등)를 추가해야 한다.

---

## 7. 계약 인터페이스 상세 (`com.dongkuk.dmes.mdm.contract.dictionary`)

패키지 규칙(F7)을 그대로 따른다: 인터페이스는 추상 메서드만, record 는 접근자만, 외부 의존은 `java.*`만(엔진·JPA·Spring 비의존).

### 7.1 컬럼 사전 조회

```java
public enum MdmDomainKind { QTY, CODE, ID, TEXT, DATE, FLAG }
public enum MdmDataType { NUMBER, STRING, BOOLEAN, DATE }

public record MdmColumnDictionaryEntry(
    Long columnId, String columnName, String physName, Long domainId,
    MdmDomainKind domainKind, boolean required, String labelLong, String labelMid, String labelShort,
    String defaultValue, String refKind, String refTarget, String refCateId, String usageNote) {}

public interface MdmColumnDictionaryLookup {
    Optional<MdmColumnDictionaryEntry> byPhysName(String physName);
    Optional<MdmColumnDictionaryEntry> byColumnId(Long columnId);
    List<MdmColumnDictionaryEntry> byDomainId(Long domainId);
}
```

### 7.2 유효 식·유효 코드 참조 해석(저장·조회 공유)

```java
public record MdmCodeRef(String maruCodeId, String cateId) {}

/** 아직 저장되지 않은 도메인(자기 식+부모 링크)의 유효 식을 미리 조립할 때 쓴다 — "저장" 경로(도메인검증 버튼·저장 전 diff 미리보기)의 입력. */
public record MdmDomainDraft(
    Long domainId, Long parentDomainId, MdmDomainKind domainKind,
    String stdRule, String bizRule, MdmCodeRef codeRef) {}

public record MdmEffectiveDomain(
    Long domainId, String effectiveStdExpr, String effectiveStdAstJson,
    String effectiveBizExpr, String effectiveBizAstJson,
    List<String> bizRequiredVars, MdmCodeRef effectiveCodeRef) {}

public interface MdmEffectiveDomainResolver {
    /** "조회" 경로 — 이미 저장된 도메인. */
    MdmEffectiveDomain resolve(Long domainId);
    /** "저장" 경로 — 아직 커밋되지 않은 초안을 부모 체인에 얹어 미리 계산한다. */
    MdmEffectiveDomain resolveDraft(MdmDomainDraft draft);
}
```

### 7.3 영향도 조회 (D9)

```java
/** refKind 예: "RULE_VAR"(06 이 구현), "LAYOUT_ITEM"(03 이 구현). refKey 는 그 소비자 쪽 식별자를 문자열로 담는다
  * — 02 계약이 03·06 의 PK 타입을 알 필요가 없게 한다. */
public record MdmDomainReference(String refKind, String refKey) {}

/** 03·06 이 각자 구현해 스프링 빈으로 등록한다. 구현체가 없으면(그 영역 미착수) 그 영역 참조는 0건이 된다. */
public interface MdmDomainReferenceSpi {
    List<MdmDomainReference> referencesTo(Set<Long> domainIds, Set<String> columnPhysNames);
}

public record MdmDomainImpact(
    Long domainId, List<Long> descendantDomainIds, List<Long> referencingColumnIds,
    List<MdmDomainReference> externalReferences, List<String> affectedSystemCodes) {}

public interface MdmDomainImpactLookup {
    MdmDomainImpact impact(Long domainId);
}
```

`descendantDomainIds`·`referencingColumnIds`는 02 자신의 테이블(`TB_MDM_DOMAIN`·`TB_MDM_COLUMN`)만으로 계산 가능하므로 구현체(TSK-04-03)가 재귀 CTE 로 직접 채운다. `externalReferences`는 `List<MdmDomainReferenceSpi>`(03·06 구현체, 0개 가능)를 순회해 합친 결과다. `affectedSystemCodes`는 02 원천 "영향도 미리보기(하위 도메인·참조 컬럼·룰 결과 변수·배포 시스템)" 절 근거다.

---

## 8. 인계 사항 (다음 Task 로)

| 받는 Task | 인계 내용 |
|---|---|
| **TSK-06-01**(04, `TB_MDM_CODE`) | `FK_TB_MDM_DOMAIN_CODE`를 두 방언 모두 **후행으로** 추가해야 한다(D1). MSSQL 은 `99-cross-area-fk.mssql.sql`(TSK-02-03 설계) 패턴을 실제 마이그레이션 버전으로 재현하면 되지만, **SQLite 는 `ALTER TABLE ADD CONSTRAINT`가 없으므로 `TB_MDM_DOMAIN` 테이블을 재생성(12단계 패턴: 새 테이블 생성→데이터 복사→구 테이블 드롭→rename)해야 한다.** Flyway 는 마이그레이션마다 트랜잭션을 열고 `PRAGMA foreign_keys`는 트랜잭션 안에서 바꿀 수 없다는 점, `TB_MDM_COLUMN`이 `TB_MDM_DOMAIN`을 참조하므로 단순 DROP 이 막힌다는 점, `TB_MDM_RULE_VAR`(06)이 이미 `TB_MDM_DOMAIN`을 참조하기 시작했다면 재생성 비용이 더 커진다는 점을 고려해야 한다. |
| **TSK-04-02·04-03·04-04** | `TB_MDM_CODE`가 아직 없는 동안에도(D1) 도메인·컬럼 CRUD 가 정상 동작해야 한다 — `MARU_CODE_ID`/`CATE_ID` 유효성은 직접 SQL 조인이 아니라 **TSK-01-02 의 `MaruIdNamespace`**(`com.dongkuk.dmes.mdm.contract.category`, `MaruIdKind.MASTER_CODE`, 04·05 가 구현하는 기존 SPI)를 `List<MaruIdNamespace>`로 주입받아 검사한다 — 구현체가 아직 없으면(06-01 미완료) 검사를 건너뛰거나 "확인 불가"로 표시하되 예외를 던지지 않는다(D1 선택지 3 과 같은 안전망을 이미 있는 계약으로 얻는다). `MdmEffectiveDomainResolver`·`MdmDomainImpactLookup`(§7)의 실제 구현체(재귀 CTE, AND 체이닝, `List<MdmDomainReferenceSpi>` 집계)를 만드는 것이 TSK-04-03 핵심 작업이다. `TB_MDM_RULE_VAR`가 없으면 `MdmDomainReferenceSpi` 구현체(TSK-08-01)도 없으므로 `externalReferences`의 "RULE_VAR" 부분은 자동으로 빈 리스트가 된다(D9). |
| **TSK-05-01**(03), **TSK-08-01**(06) | `com.dongkuk.dmes.mdm.contract.dictionary`의 세 인터페이스만 참조한다(§3.5 ArchUnit 이 자동 집행). `com.dongkuk.dmes.mdm.entity`/`.repository`를 직접 import 하면 안 된다. 각자 `MdmDomainReferenceSpi`를 구현해 자기 영역이 참조하는 도메인/컬럼을 알려준다(D9) — 03 은 `refKind="LAYOUT_ITEM"`, 06 은 `refKind="RULE_VAR"`. |
| **TSK-03-01**(엔진 공유 계약) | 실제 `kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup`·`DomainKind`가 컴파일되면, `com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainKind`·`MdmDataType`과 값 집합이 같은지 확인하는 교차 검증 테스트를 추가한다(F15 — 이 Task 는 대상이 없어 만들지 못했다). |
| **모든 후속 Task**(naming-dialect-rules §6.2) | §3 #3·#5·#15·#16·#19·#20·#23 이 "확인(TSK-04-01 실측)"으로 갱신되므로, 그 값(콜레이션·JSON 함수·BIT/DATETIME2 매핑 등)을 재실측 없이 그대로 인용할 수 있다. |

---

## Build 기록

작성 2026-09-24 · Phase 03 Build 담당(`agent/847a7616-term-domain-column-contract`).

### 설계 이탈

1. **§3.1-4 의 전제 오류** — "`TB_MDM_UNIT`·`TB_MDM_COLUMN_SYSTEM`·`TB_MDM_DICT_SYSTEM`이 참조하는 기존 FK(`TB_MDM_SYSTEM`)"라고 적었으나, ERD(`docs/mdm/erd/02-term-domain-column.sqlite.sql`)를 다시 확인하니 `TB_MDM_UNIT`에는 `TB_MDM_SYSTEM`을 가리키는 FK 가 없다(원문에도 없음). `MdmTermDomainColumnMigrationTest.기존_TB_MDM_SYSTEM_FK_는_여전히_강제된다()`는 실제로 FK 가 있는 두 테이블(`TB_MDM_COLUMN_SYSTEM`·`TB_MDM_DICT_SYSTEM`)만 대조군으로 쓴다. V3 DDL 자체는 이 오류의 영향을 받지 않는다(ERD 원문을 그대로 옮겼으므로).
2. **§3.4 스텁 컴파일 테스트 배치** — design 이 "같은 파일에 메서드 추가 또는 별도 스텁 파일, Build 판단"이라 위임한 대로, 기존 `ContractStubCompileTest.java`(TSK-01-02 소유)에 dictionary 세 인터페이스용 테스트 메서드 3개를 추가했다(별도 파일을 새로 만들지 않음) — §2 "수정" 목록에 이 파일이 없었던 것은 design 의 누락이다.
3. **변이 검증 커버리지 구멍을 메우기 위한 추가 산출물**(§2 목록 밖, dev-discipline "안 깨지는 변이는 테스트를 늘려 덮는다"에 따른 추가):
   - `lib/src/test/.../entity/MdmEntityArchitectureTest.java`(신규) — 엔티티 패키지가 엔진 타입에 의존하지 않는지(불변 규칙 6), `@ManyToOne`/`@OneToMany`/`@OneToOne`/`@ManyToMany` 연관관계 매핑을 쓰지 않는지(불변 규칙 9) ArchUnit 으로 고정. 왕복 테스트만으로는 두 변이 모두 통과해 버린다(아래 표 실측).
   - `MdmContractArchitectureTest`에 "계약_패키지는_엔진_타입에_의존하지_않는다" 규칙 추가(불변 규칙 6, 기존 Spring/JPA/Hibernate/JDBC 금지 목록에 엔진 패키지가 없었다).
   - `MdmEntityJpaRoundtripTest`에 "매핑된_엔티티는_정확히_5개다"(D2 가드)·"MdmTerm_은_EMBEDDING_EMBEDDING_MODEL_을_매핑하지_않는다"(불변 규칙 7 가드) 두 메서드 추가.
   - `MdmTermDomainColumnMigrationTest`의 JSON CHECK 8칼럼 확인 로직을 "알려진 8개 이름 존재 확인"에서 "`*_JSON CHECK` 패턴 전부를 정규식으로 세어 정확히 8개"로 강화(원래 방식은 9번째 미등재 CHECK 가 추가되는 변이를 못 잡았다, 아래 표 실측).
4. **F1 대조군(§3.2-⑩) 을 MSSQL 컨테이너로 매번 다시 실행하지 않음** — MSSQL 은 DDL 자체에 `FK_TB_MDM_DOMAIN_CODE` 가 없어(ERD 원문부터 이미 제외) SQLite 와 달리 "FK 를 다시 걸면 CREATE TABLE 자체가 실패"하는 구조적으로 자명한 실패 모드다. SQLite 쪽에서는 실제로 FK 를 넣는 변이를 실행해 6개 테스트가 즉시 빨강이 됨을 확인했다(아래 표) — MSSQL 쪽은 도커 컨테이너 재기동 비용 대비 추가 정보가 적어 생략했다.

### 변이 검증 결과표

design.md §5 불변 규칙 순서. "방언"은 실제로 변이를 실행해 확인한 방언, "원복 확인"은 `/usr/bin/git diff`(신규 파일은 원본 텍스트 재확인)로 완전 원복을 확인했다는 뜻이다.

| # | 불변 규칙 | 변이 | 결과 | 방언 |
|---|---|---|---|---|
| 1 | ERD 원문 칼럼 보존 | `TB_MDM_UNIT.DIMENSION` 칼럼 삭제 | 🔴 `_7테이블_전부_생성되고_칼럼_집합이_기대값과_같다` 실패 | SQLite |
| 2 | `FK_TB_MDM_DOMAIN_CODE` 미부착(D1) | sqlite V3 에 FK 재부착 | 🔴 6개 테스트 실패(`FK_TB_MDM_DOMAIN_CODE_부재_확인`·`JSON_CHECK_8칼럼`·`AUTOINCREMENT`·`CK_...`·`UX_TB_MDM_COLUMN_NAME_PHYS_NAME`·`기존_TB_MDM_SYSTEM_FK`) — F1 이 예측한 대로 `TB_MDM_DOMAIN`에 대한 모든 쓰기가 막혔다 | SQLite(MSSQL 은 구조상 자명, 이탈 4 참고) |
| 3 | 계약 인터페이스는 추상 메서드만 | `MdmColumnDictionaryLookup`에 `default` 메서드 추가 | 🔴 `계약_인터페이스의_메서드는_모두_추상이다` 실패(기존 TSK-01-02 규칙이 새 서브패키지에도 자동 적용됨을 재확인) | — |
| 4 | 감사 9칼럼은 `CactusAuditEntity` 상속만, 재선언 금지 | `MdmUnit`에 `@Column(name="VER") private Long dupVer` 추가 | 🔴 컨텍스트 부팅 자체가 `org.hibernate.MappingException`으로 실패(7개 테스트 모두 실패) — "가정하지 말고 실제로 확인"(Build 지시)한 결과 | SQLite |
| 5 | `DICT_SEQ`·`DICT_SYSTEM` 엔티티 없음(D2) | `TB_MDM_DICT_SEQ`용 임시 `@Entity` 클래스 추가 | 🟢(기존 테스트는 전부 통과) → 🔴 새로 추가한 "매핑된_엔티티는_정확히_5개다" 가드만 잡음(이탈 3 참고, 커버리지 구멍이었다) | SQLite |
| 6 | 엔진 타입을 계약에 import 하지 않음 | `MdmCodeRef`에 `kr.dongkuk.maru.mdm.engine.expr.ExpressionEvaluator` 참조 static 필드 추가 | 🟢 → 🔴 새로 추가한 "계약_패키지는_엔진_타입에_의존하지_않는다" 가드만 잡음(이탈 3, 기존 금지 목록에 엔진 패키지가 없었다) | — |
| 7 | `EMBEDDING`을 엔티티에 매핑하지 않음 | `MdmTerm`에 `byte[] embedding` 필드 매핑 추가 | 🟢(왕복 테스트 그대로 통과) → 🔴 새로 추가한 "MdmTerm_은_EMBEDDING_...을_매핑하지_않는다" 가드만 잡음(이탈 3) | SQLite |
| 9 | JPA 연관관계 매핑 금지 | `MdmDomain.parentDomainId`에 `@ManyToOne` 필드 추가 | 🟢(왕복은 그대로 통과) → 🔴 새로 추가한 `MdmEntityArchitectureTest` 가드만 잡음(이탈 3) | — |
| 10 | ID 채번은 `GenerationType.IDENTITY` 고정 | `MdmTerm`을 `GenerationType.AUTO`로 변경 | 🔴 `MdmTerm_은_IDENTITY_채번...` 실패(`org.sqlite.SQLiteException`) | SQLite |
| 11 | `COLUMN_SYSTEM.SYSTEM_CODE`는 BIN2 콜레이션 유지(F17) | mssql V3 에서 `COLLATE Latin1_General_100_BIN2` 제거 | 🔴 `MdmTermDomainColumnMssqlMigrationTest` 10개 전부 실패(콜레이션 불일치로 `TB_MDM_SYSTEM` FK 비교가 깨지며 컨텍스트 부팅 단계부터 실패 — 예상보다 넓게 잡혔지만 "잡지 못함"은 아니다) | MSSQL |
| 12 | JSON CHECK 정확히 8칼럼 | (a) sqlite `COLUMN.TERM_IDS` CHECK 제거 (b) sqlite `TERM.STD_BASIS`에 9번째 CHECK 추가 (c) mssql `COLUMN.TERM_IDS` CHECK 제거 | 🔴 세 방향 모두 `JSON_CHECK...` 관련 테스트 단독 실패(이탈 3 의 정규식 강화 이후) | SQLite(a,b) · MSSQL(c) |
| 8 | `VersionConventions`등 재정의 금지 | (해당 없음 — 이 Task 가 그 파일들을 건드리지 않아 구조적으로 자명, 별도 변이 생략) | — | — |

**요약**: 12개 항목 중 10개는 기존/신규 테스트가 곧바로 잡았고, 3개(#5·#6·#7·#9, 표에서는 4건)는 처음엔 안 잡혔다가 이번 Build 가 가드 테스트를 추가해 커버리지 구멍을 메웠다(은폐하지 않고 여기 기록). #8 은 파일을 건드리지 않아 변이 자체가 성립하지 않는다.

### 게이트 결과

- `testAll`: 476 tests / 0 failures(기준선 447 / 0 대비 +29, 신규 실패 0).
- `:api:mssqlMigrationTest`: 14 passed(기존 `MdmMssqlMigrationTest` 4 + 신규 `MdmTermDomainColumnMssqlMigrationTest` 10), SQL Server 2022-CU27.
- 새 테스트 red 확인: `MdmTermDomainColumnMigrationTest`·`MdmEntityJpaRoundtripTest`·`MdmTermDomainColumnMssqlMigrationTest`·`DictionaryContractTest`·`MdmEntityArchitectureTest`·`ContractStubCompileTest`(신규 메서드)·`MdmContractArchitectureTest`(신규 메서드)는 구현 전 컴파일 실패 또는 실패 상태에서 시작해 구현 후 초록이 됨을 확인했다.
