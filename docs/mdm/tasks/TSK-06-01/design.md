# TSK-06-01 설계 — 마스터코드 공유 계약 (계약 전용)

> category infra · domain database · priority critical · model opus(spec 머리). 무인 실행(Design Phase 담당, 사람에게 묻지 않음).
> 에이전트 프롬프트 없음 — spec.md 에 `item.agent_prompt` 가 없다(`entry-point: -`만 있음). 팀장 지시는 Flyway 번호 배정(당초 V6, 2026-09-24 팀장 정정으로 머지 뒤 최대 버전+1 = **V9**)과 작업 규칙뿐이며 아래 D1 에 반영했다.
> 입력: `spec.md` · `.claude/skills/dflow-dev/references/dev-discipline.md` §Phase 02 · `RULE.md`(분기 3 MES 개발 → 세부 규칙 진입점) · `docs/guide/BackEnd/Backend-Implementation-Guide.md` §2·§3·§8·§10 · PRD 원천 `docs/mdm/design/basic/04-master-code-deploy-full.md`(이하 `04:행`) · `docs/mdm/{PRD,TRD,wbs,decisions,naming-dialect-rules}.md` · `docs/mdm/adr/0002-version-confirm-without-approval.md` · `docs/mdm/erd/04-master-code.{sqlite,mssql}.sql`·`99-cross-area-fk.mssql.sql` · `docs/mdm/tasks/{TSK-02-03,TSK-01-02,TSK-01-03,TSK-04-01,TSK-05-01}/design.md` · 머지 커밋 `34f6ea0`(TSK-05-01 구성) · 코드 `src/backend/mdm/{lib,api}/**`(읽기 확인)
> 근거 순위: spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물. PRD 원천 04 는 spec 이 `prd-ref` 로 지목한 요구사항 원천이라 spec 본문과 같은 층으로 읽는다. TSK-01-02·01-03·02-03·04-01·05-01 산출물은 모두 dev 머지·서버 승인 전(미승인)이지만 기존 코드가 그 위에 서 있다.

---

## 0. 조사로 확인한 사실 (Build 가 원천 문서를 다시 읽지 않아도 되게 적는다)

| # | 사실 | 근거 |
|---|---|---|
| F1 | dev(`78813e9`)의 mdm 마이그레이션은 두 방언 모두 V1~V4 뿐이다. 팀장이 이 Task 에 **V6** 을 배정했다(V5 는 다른 Task 몫. 2026-09-24 팀장 정정으로 배정표가 폐기돼 V9 로 재채번했다 — D1). 형제 워크트리 `dflow-91b83c83`(term-unit-mng)의 디스크에 `V4__term_abbr_index_relax.sql` 이 있다 — dev 의 V4 와 번호가 겹쳐 V5 로 재배정될 후보로 보인다. 팀장 확인: 이 파일은 V5 로 재채번되며 `TB_MDM_TERM` 약어 인덱스(`UX_TB_MDM_TERM_ABBR` → `IX_TB_MDM_TERM_ABBR`)만 바꾸고 `TB_MDM_DOMAIN` 은 건드리지 않는다 → V6 의 SQLite 재생성은 origin/dev 최신 V3 의 `TB_MDM_DOMAIN` 정의를 그대로 옮기면 된다 | `ls .../db/migration/mdm/{sqlite,mssql}`, `git worktree list`, 형제 워크트리 `ls` 6회 |
| F2 | Flyway 는 `org.flywaydb:flyway-core` 11.14.1(Gradle 캐시)이다. 설정은 `spring.flyway.enabled: true` 와 방언별 `locations` 뿐이고 `out-of-order`·`ignore-migration-patterns` 를 따로 두지 않는다(기본값: outOfOrder=false, ignoreMigrationPatterns=`*:future`). 버전 번호의 **빈 칸(V5 없음)** 은 새 DB 에 V1~V4·V6 을 순서대로 적용하는 데 문제가 되지 않는다. 문제는 **V6 이 이미 적용된 DB 에 뒤늦게 V5 가 들어올 때**다 — 기본 설정에서는 "해석됐으나 적용되지 않은 마이그레이션"으로 검증 오류가 날 수 있다(Build 1회 실측 항목, D1) | `application.yml`, `application-local.yml`, `application-local-db.yml`, `~/.gradle/caches/.../flyway-core/11.14.1` |
| F3 | 버전 집합·개수를 고정한 기존 테스트는 4개다: `MdmSharedContractMigrationTest:64,75`(`Set.of("1","2","3","4")`), `MdmMssqlMigrationTest:78,81,82,91`(`migrationsExecuted==4`·`targetSchemaVersion=="4"`·집합), `MdmTermDomainColumnMssqlMigrationTest:87,96`(집합), `MdmInterfaceLayoutMssqlMigrationTest:83,91`(집합). `MdmFlywayVersionParityTest` 는 두 방언 집합이 같은지와 `containsAll({"1","2"})` 만 보므로 수정 없이 통과한다. 테이블 **총 개수**를 단언하는 테스트는 없다 | 그렙 `Set.of("1"`·`migrationsExecuted`·`targetSchemaVersion` |
| F4 | ERD `docs/mdm/erd/04-master-code.{sqlite,mssql}.sql`(TSK-02-03, 미승인)이 7테이블 DDL 을 이미 갖고 있다. `TB_MDM_CODE_VER`·`TB_MDM_CODE_RECV` 는 감사 카운터가 `AUD_VER` 다(업무 칼럼 `VER` 과 이름 충돌, decisions D-034, naming-dialect-rules §2 예외). 나머지 5테이블은 감사 `VER` 다 | ERD 두 파일 전체 |
| F5 | ERD SQLite 는 감사 `VER`/`AUD_VER` 를 `INTEGER` 로 적었다. naming-dialect-rules §2 정본은 `BIGINT` 이고 V2·V3·V4 가 모두 SQLite 도 `BIGINT` 로 교정했다(TSK-04-01 F4, TSK-05-01 F6) → V9 SQLite 도 감사 카운터는 `BIGINT` 로 쓴다. 업무 칼럼 `LAST_CHG_SEQ`·`CHG_SEQ`(BIGI 토큰)는 V3 선례(`CHG_SEQ INTEGER NOT NULL DEFAULT 0`)대로 SQLite `INTEGER` 를 유지한다 | `naming-dialect-rules.md:29`, `V3__...sqlite.sql:21,77`, `V4__...sqlite.sql:27` |
| F6 | **`FK_TB_MDM_DOMAIN_CODE`(02→04)는 이 Task 몫이다.** TSK-04-01 D1(decisions.md:281)이 두 방언 모두 V3 에서 빼고 "`TB_MDM_CODE` 가 생긴 뒤 TSK-06-01 이 후행 추가, SQLite 는 테이블 재생성(12단계 패턴)"이라고 넘겼다. V3 두 방언 파일 주석(sqlite:88-89, mssql:98)도 같은 말이다. TSK-02-03 §6.6 은 MSSQL 을 `99-cross-area-fk.mssql.sql` 의 `ALTER TABLE ... ADD CONSTRAINT` 로 적었다 | `decisions.md:281-283`, `V3__...{sqlite:4,88,mssql:4,98}`, `erd/99-cross-area-fk.mssql.sql` |
| F7 | **SQLite 재생성 실측(이 Design 이 sqlite3 3.50.6 CLI 로 확인, 운영 드라이버 3.45.3 과 판 다름).** `foreign_keys=ON` 인 한 트랜잭션에서 "새 표 생성 → 복사 → 옛 표 DROP → 새 표 RENAME" 을 하면: ① 표가 **비어 있을 때**는 커밋되고 새 FK 가 강제된다(없는 값 INSERT 거부). 행은 있지만 그 행을 가리키는 참조가 없는 경우는 탐침하지 않았다 — §3.2-A 가 확인한다. ② 자식 표(`TB_MDM_COLUMN`)에 행이 있거나 **자기참조(부모 도메인) 행**이 있으면 DROP 의 암묵 DELETE 가 FK 위반을 만들어 실패한다(`defer_foreign_keys=ON` 이면 COMMIT 에서 실패). ③ `legacy_alter_table=ON` 으로 옛 표를 먼저 개명하는 방법도 `foreign_keys=ON` 에서는 자식 FK 가 옛 이름으로 다시 써져 같은 실패를 낸다. ④ DROP 은 옛 표의 `sqlite_sequence` 행을 지우므로, 새 표의 AUTOINCREMENT 상한이 "복사한 행의 최댓값"으로 내려가 **지운 최댓값 ID 를 다시 쓰는 일**이 생긴다(옛 seq 3 → 새 seq 2 관찰) | scratchpad 탐침 3회(`p.db`·`q.db`·`r.db`) |
| F8 | 로컬 앱 DB 경로는 `jdbc:sqlite:../data/mdm.db`(작업 디렉터리 `src/backend/mdm`) = `src/backend/data/mdm.db` 다. 메인 체크아웃의 그 폴더에는 지금 `mdm.db` 가 **없다**(caravan·mcm DB 뿐). 테스트는 전부 `@TempDir` 새 DB 를 쓴다 | `application-local.yml:3`, `api/build.gradle:9`, `ls src/backend/data` |
| F9 | 형제 워크트리 `dflow-2ca988a4`(TSK-04-03 domainMng)가 `MdmDomain.maruCodeId` 를 읽고 쓰는 서비스를 만들고 있다(`DomainMngService`, `DomainRuleCheckerTest:137 setMaruCodeId("PROC_CD")` 는 순수 단위 테스트). 이 Task 가 FK 를 걸면 머지 뒤 **`TB_MDM_CODE` 행 없이 CODE 도메인을 DB 에 저장하는 통합 테스트**는 FK 로 거부된다. 팀장 확인: 도메인 관리 Task 는 **TSK-04-03**(2ca988a4)이고, `MARU_CODE_ID` 를 쓰는 테스트 파일은 `MdmDictionaryExpectations`·`VersionFixtureTables`·`VersionStateServiceSqliteTest`·`DefaultMdmEffectiveDomainResolverTest`·`MdmTermDomainColumnMigrationTest` 다. 이 중 dev 에 있는 네 파일은 이 Design 이 읽은 범위에서 칼럼 목록 기대값·픽스처 표(`TB_MDM_TC_*`)·NULL INSERT 만 쓰므로 FK 로 깨지지 않을 것으로 보이나, Build 가 전체 스위트로 확인한다. `DefaultMdmEffectiveDomainResolverTest` 는 dev(`78813e9`)에 아직 없다(04-03 브랜치 몫) | 형제 워크트리 그렙(읽기 전용) |
| F10 | **SQLite 업무 일시 결함이 이 영역에 처음 들어온다.** mcm-core 가 기록한 대로 SQLite community dialect + xerial 드라이버는 `LocalDateTime` 을 epoch millis 정수로 저장한다(`SqliteTemporalConverterContributor` Javadoc). mdm 에는 그 컨트리뷰터가 등록돼 있지 않다(naming-dialect-rules #16). 한편 공통 버전 서비스는 네이티브 SQL 로 `APPLY_FROM` 등을 `MdmTemporalBinder.toDb` = `'yyyy-MM-dd HH:mm:ss'` 19자 TEXT 로 쓰고, `fromDb` 는 String·Timestamp·LocalDateTime 만 받는다(정수는 예외). TSK-01-03 §7 ④ 인계: "버전 엔티티의 `LocalDateTime` 매핑이 이 문자열을 읽어야 한다". naming-dialect-rules #16 은 "업무 `LocalDateTime` 칼럼 실측 필요 → TSK-06-01" 이다 | `MdmTemporalBinder.java`, `mcm-core/.../SqliteTemporalConverterContributor.java`, `LocalDateTimeAttributeConverter.java`(쓰기 형식 `yyyy-MM-dd HH:mm:ss.SSS`), `TSK-01-03/design.md:593` |
| F11 | Hibernate 는 7.2.12(`hibernate-core`)이고 `EntityManagerFactoryBuilderImpl` 이 아직 `hibernate.metadata_builder_contributor` 설정을 읽는다(클래스 바이트 확인). mls 는 이 설정을 `application.yml` 의 `spring.jpa.properties.hibernate.metadata_builder_contributor` 로 켠다. mdm 은 Spring Boot 자동 EMF 를 쓴다(mcm 처럼 `JpaConfig` 로 직접 빌드하지 않는다) — 실제로 적용되는지는 Build 가 `typeof()` 로 실측한다 | hibernate-core jar, `mls/api/src/main/resources/application.yml:15-21` |
| F12 | **공통 버전 서비스가 이미 실제 04 테이블 이름을 기다린다.** `DefaultVersionTableRegistry`(MASTER_CODE) = `VersionTableSpec("TB_MDM_CODE_VER","MARU_CODE_ID","VER","TB_MDM_CODE","MARU_CODE_ID","AUD_VER","VER")`. `VersionRowStore` 가 쓰는 고정 칼럼: 버전 표 `STATUS·OWNER_ID·APPLY_FROM·APPLY_TO·REQUESTED_BY·REQUESTED_AT·RELEASED_AT·ROW_VERSION·U_USR_ID·U_AT·U_SVC_ID·U_PGM_ID·AUD_VER`, 부모 표 `STATUS·U_*·VER`. VER 는 SQLite NUMERIC 친화도 때문에 `CAST(VER AS VARCHAR(40))` 로 읽고 `setScale(3)` 한다(1.000 은 INTEGER, 1.001 은 REAL 로 저장돼 결과 타입이 첫 행을 따라가면 소수부가 잘린다 — TSK-01-03 Build 실측) | `DefaultVersionTableRegistry.java`, `VersionRowStore.java:43-60,213-218` |
| F13 | TSK-01-03 §7 ③ 인계: "`AbstractVersionStateScenarioTest` 를 실제 Flyway 테이블로 상속해 같은 시나리오를 돌린다(부모 FK·NOT NULL 칼럼은 그 Task 의 `seedObject`·`seedVersion` 이 채운다)". 키트는 추상 훅 `createSchema`·`clearTables` 와 재정의 가능한 `seedObject`·`seedVersion` 을 갖고, MASTER_CODE 와 BUSINESS_RULE 시나리오를 함께 돈다(`@Test` 44개). 비 DRAFT 시드는 모두 `APPLY_FROM`·`APPLY_TO` 를 채운다. 기존 두 구현(`VersionStateServiceSqliteTest`·`...MssqlTest`)은 픽스처 `TB_MDM_TC_*` 를 쓴다 | `AbstractVersionStateScenarioTest.java:51-60,683-701`, `VersionFixtureTables.java` |
| F14 | TSK-01-03 §7 ② 인계는 `ROW_VERSION BIGINT NOT NULL DEFAULT 0` 이고, 픽스처도 `BIGINT`, 계약 `VersionConventions.INITIAL_ROW_VERSION` 은 `long` 이다. ERD 는 `INT4`(INT)다 — 둘이 어긋난다(D5) | `TSK-01-03/design.md:593`, `VersionFixtureTables.java:74`, `erd/04-master-code.*.sql` |
| F15 | ERD `CK_TB_MDM_CODE_VER_APPLY = STATUS='DRAFT' OR (APPLY_FROM IS NOT NULL AND APPLY_TO IS NOT NULL)` 는 PRD 원천과 어긋난다. 원천 04:999-1000 은 apply_from 을 "DRAFT·반려는 NULL, **상신 시 희망 일시**", apply_to 를 "DRAFT 면 NULL, **승인 시** 9999-12-31" 로 정한다 → REQUESTED 행은 apply_from 만 있고 apply_to 가 NULL 이다. ERD CHECK 는 이 행을 거부한다. 결재는 지금 보류지만(PRD §2 규칙 7) "테이블은 이번에 만든다 — 결재·배포를 붙일 때 표를 다시 만들지 않는다"(D-019·ADR-0002 D7)가 원칙이다(D4) | `04:999-1000`, `decisions.md` D-019, ERD |
| F16 | ERD MSSQL `DEF_EXPR VARCHAR(MAX)`(TXT_A, "ASCII 전용") 이다. 원천 04:180·1032 는 REGEX 대상 칸으로 `ATTR01`-`ATTR10`(값 `NVARCHAR(500)`, 한글 가능)과 `LVL1`-`LVL5` 를 허용한다 — 한글 문자를 담은 정규식은 MSSQL `VARCHAR` 에서 `?` 로 손실된다(TSK-05-01 F28 과 같은 현상)(D6) | `04:171,180,1032`, ERD, `TSK-05-01/design.md` F28 |
| F17 | D-019·ADR-0002 D7(미승인): 배포 대상·배포 순번·수신 로그 표는 DDL 만 두고 엔티티·리포지토리·서비스를 만들지 않는다. 활성 표의 배포 칸 `CHG_SEQ`·`LAST_CHG_SEQ` 는 `DEFAULT 0` 을 주고 **엔티티가 매핑하지 않는다**. 그런데 TSK-04-01 은 `MdmDomain`·`MdmColumn`·`MdmUnit` 에 `CHG_SEQ` 를 `long chgSeq` 로 매핑했다(리포 관례가 ADR 과 갈라짐). TSK-04-01 D2 선례: spec 의 "N개 Flyway·엔티티"에서 엔티티는 업무 활성 표로 한정했다(D2) | `decisions.md:150-156`, `adr/0002...:56-58`, `MdmDomain.java:86-87`, `TSK-04-01/design.md:214-221` |
| F18 | 확정 검사 SPI 는 TSK-01-02 가 이미 선언했다: `VersionConfirmCheckSpi{ target(); diff(VersionRef); check(ConfirmCheckRequest) }`, Javadoc "04(TSK-06-01 선언·06-05 구현)", "apply_from 순서는 `VersionStateService` 가 `ApplyFromOrderCheck` 로 공통 검사하므로 SPI 가 반복하지 않는다". `VersionDiffEntry.key` 는 "04 가 code" 라고만 적었다 — 04 의 diff 는 ITEM·CATE·CATE_ITEM 세 표를 덮어야 하므로(04:48·420, wbs TSK-06-05 "테이블·키") 키 하나로 표를 가려야 한다. 공통 서비스는 검사 SPI 를 부르기 **전에** apply_from 순서 검사를 끝낸다(실패하면 SPI 를 부르지 않음, 키트 `S…순서 검사는…calls isEmpty`) | `VersionConfirmCheckSpi.java`, `VersionDiffEntry.java`, `AbstractVersionStateScenarioTest.java:231` |
| F19 | 재사용할 전사 계약(TSK-01-02, `contract.category`·`contract.version`): `CategoryKind{REGEX,TABLE}`, `CategoryDefTarget`, `CategoryOwner.MASTER_CODE`(BASE 대상 CODE·허용 대상 집합), `CategoryConventions`(BASE·`.*`), `CategoryDefinition`(record), `MaruIdKind.MASTER_CODE`, `MaruIdNamespace`(SPI), `MaruIdRules.FORBIDDEN_CHAR_PATTERN="[.,\\s]"`, `VersionTarget.MASTER_CODE("TB_MDM_CODE_VER",3)`, `VersionRef`, `VersionStatus`, `MaruObjectStatus`, `DiffKind`, `VersionDiff`·`VersionDiffEntry`, `ConfirmCheckRequest`·`ConfirmCheckResult`, `MdmCheckIssue`, `MdmErrorCode.RESERVED_CATEGORY(MDM012)`·`NOT_DRAFT(MDM002)`, `VersionConventions.OPEN_END`, `VersionWriteGuard`(DRAFT 저장 직전 `beginDraftWrite` 가 ROW_VERSION 을 올림), `VersionDraftDeletionSpi`(DRAFT 삭제 때 선분 복구 훅, 구현 TSK-06-02) | `contract/{category,version,common}/*.java` |
| F20 | `MdmContractArchitectureTest`·`MdmEntityArchitectureTest` 는 `contract..`·`entity..` 접두사 전체를 스캔한다 → 새 하위 패키지 `contract.mastercode` 와 새 엔티티에 **수정 없이 자동 적용**된다(인터페이스는 추상 메서드만, record·enum 은 접근자만, 상수 클래스 조건, 함수 객체 필드 금지, Spring·JPA·JDBC·엔티티 의존 금지, `@ManyToOne` 등 금지) | 두 테스트 파일 |
| F21 | `ContractStubCompileTest.확정_검사_SPI_구현이_모든_버전_대상을_하나씩_덮는다` 는 `CONFIRM_CHECKS` 목록의 target 이 전부 다르고 모든 target 을 덮는지 본다 → MASTER_CODE 스텁을 목록에 하나 더 넣으면 깨진다. 기존 `MasterCodeConfirmCheckStub`(TSK-01-02)의 Javadoc 이 "실구현은 TSK-06-01(선언)·06-05(구현)" 이다 | `ContractStubCompileTest.java:413-426`, `MasterCodeConfirmCheckStub.java` |
| F22 | "실행 로직 없음" 매핑 이력: TSK-03-01 은 "구현 클래스가 없다" 임시 폐쇄 규칙(`ContractOnlyPhaseTest`)을 뒀고, 후속 TSK-03-02·03-03 이 첫 구현 커밋에서 그 테스트를 **계획 삭제**해야 했다(테스트 총수 감소를 게이트 예외로 조율, 커밋 `be433b6`·`789728e`). TSK-05-01 은 임시 규칙을 두지 않고 영구 ArchUnit 규칙 자동 적용 + 스텁 컴파일로 매핑하고, "실 구현 없음"은 §2 파일 목록 대비 diff 로만 잡는 **알려진 커버리지 갭**으로 보고했다(불변 규칙 13) → 이 Task 도 TSK-05-01 방식을 쓴다 | `TSK-03-01/design.md:528-531`, `git log -S ContractOnlyPhaseTest`, `TSK-05-01/design.md:217` |
| F23 | naming-dialect-rules §3·§6.1 이 이 Task 에 배정한 실측: **#2**(04 `CODE_RECV.RECV_ID` MSSQL `IDENTITY` — 엔티티가 없으므로 JDBC 연속 INSERT 로), **#16**(04 업무 `LocalDateTime` 칼럼), **#19**(04 코드·키 칼럼 BIN2). #3·#5·#20 은 04 에 JSON·NULL 허용 유일 칼럼이 없어 해당 없음. #17(DECIMAL(7,3) 저장·비교)은 TSK-06-02 몫이다 — 이 Task 는 엔티티 왕복에서 본 사실만 기록하고 상태는 바꾸지 않는다 | `naming-dialect-rules.md:48,62,63,65,82` |
| F24 | 계약 패키지 위치는 `mdm/lib` 의 `com.dongkuk.dmes.mdm.contract.<영역>` 이다(TSK-04-01 `dictionary`, TSK-05-01 `layout`, D6 근거와 같다: 엔진 jar 에 04 계약 자리가 없고 `VersionConfirmCheckSpi` 가 이미 `mdm/lib` 에 있다). 04 는 `contract.mastercode` 로 한다 — `VersionTarget.MASTER_CODE`·`CategoryOwner.MASTER_CODE`·`MaruIdKind.MASTER_CODE`·`MasterCodeConfirmCheckStub` 와 이름을 맞춘 기본값이다 | 기존 패키지 목록 |
| F25 | 엔티티 관례: `lib/entity` 평면 패키지, `CactusAuditEntity` 상속, 연관관계 없이 원시 ID 필드, 복합 PK 는 `@IdClass`(필드명 = 엔티티 `@Id` 필드명, `Serializable`, `equals`/`hashCode`), 리포지토리는 `lib/repository` 에 선언만(`MdmLayoutItemRepository` 모양). NOT NULL 기본값 칼럼은 원시 타입으로 둔다(`MdmLayout.totalLength int`, `layoutVersion long`) | `entity/*.java`, `repository/*.java` |
| F26 | JPA `@IdClass` 의 `BigDecimal` 필드는 `equals` 가 scale 을 본다(`1` ≠ `1.000`). SQLite 는 `1.000` 을 INTEGER 1 로 저장하므로 Hibernate 가 읽은 엔티티의 `ver` 는 scale 0 이 된다(F12 와 같은 원인). IdClass 동등성을 scale 무관하게 만들지 않으면 `clear()` 뒤 `findById(…1.000)` 의 식별자 대조가 어긋날 수 있다(Build 실측) | `VersionRowStore.java:213-218`, JDK `BigDecimal.equals` |
| F27 | **Backend 구현 가이드 대조**(RULE.md 「세부 개발 규칙 진입점」 → `Backend-Implementation-Guide.md`). ① §2.2 "enum 기본값은 builder·생성자·DB default 중 어느 계층이 정본인지 모듈별로 하나만 정한다" — mdm 엔티티는 상태·종류 칼럼을 `String` 으로 매핑하는 관례다(TSK-04-01·05-01, `@Enumerated` 미사용). Hibernate 는 매핑한 칼럼에 null 을 명시해 INSERT 하므로 DB DEFAULT 는 엔티티 경로에서 동작하지 않는다 → **엔티티 경로의 정본은 필드 초기값**, DDL DEFAULT 는 네이티브·원시 INSERT 경로(공통 버전 서비스·키트 시드)용이며, 두 값이 같음을 §3.1-5·§3.3-1 이 함께 고정한다(§6.2). ② §2.3 MES 모듈 연관관계 금지 — mdm 도 같은 규칙(불변 규칙 16). ③ §8 "이미 공유된 migration 은 수정하지 않고 후속 migration 을 추가" — V3 를 고치지 않고 V9 에서 `TB_MDM_DOMAIN` 을 재생성한다(D3). mdm 은 SQLite template·seed 자산이 없다(테스트는 `@TempDir` 에 Flyway 를 돌린다 — §10.1 의 template 복사 방식 대신 mdm 기존 관례를 따른다). ④ §10 "직접 insert 는 생성 API 가 없을 때 seed-only 로만" — 이 Task 는 생성 API 가 없는 계약 전용이라 마이그레이션·왕복 테스트의 직접 INSERT 가 허용 범위이고, 헬퍼 이름에 `seed` 를 넣는다(키트의 `seedObject`·`seedVersion` 관례). ⑤ §3.1 "OASIS 서비스는 JPA/MyBatis 사용자 확인" — 이 Task 는 OASIS 서비스를 만들지 않는다(규칙표 §4 가 mdm 은 JPA 1순위로 이미 정했다) | `RULE.md` 세부 규칙 표, `Backend-Implementation-Guide.md:29-40,42-56,259-270,316-352` |

---

## 1. 접근 방식

TSK-05-01(03 영역 계약)과 같은 구성을 04 에 옮긴다: **두 방언 Flyway V9** + **엔티티·복합키 Id·리포지토리** + **`contract.mastercode` 계약(인터페이스·enum·record·상수 클래스)** + SQLite·MSSQL 마이그레이션 테스트 + JPA 왕복 테스트 + 계약 스텁 컴파일 테스트. DDL 은 ERD(`04-master-code.*.sql`)를 1차 텍스트로 삼고, 실측·원천 대조로 갈라지는 다섯 곳만 바꾼다(감사 카운터 BIGINT(F5), `ROW_VERSION` BIGINT(D5), `CK_TB_MDM_CODE_VER_APPLY` 의 REQUESTED 허용(D4), MSSQL `DEF_EXPR NVARCHAR(MAX)`(D6), `FK_TB_MDM_DOMAIN_CODE` 후행 추가(D3)). 엔티티는 업무 활성 5표만 만든다(`TB_MDM_CODE_SYSTEM`·`TB_MDM_CODE_RECV` 는 DDL 만, D2).

이 영역에만 있는 두 가지 영속성 함정을 설계에서 닫는다. 첫째, **SQLite 업무 일시**(F10): 공통 버전 서비스가 네이티브로 쓰는 19자 TEXT 와 엔티티가 쓰는 값이 글자 단위로 같아야 하므로, `MdmTemporalBinder` 와 같은 형식을 쓰는 mdm 전용 SQLite 컨버터를 `application-local.yml` 에서만 켠다(D7). 둘째, **DECIMAL(7,3) 복합키**(F26): IdClass 동등성을 scale 무관하게 하고 엔티티 게터가 scale 3 을 돌려준다. 공통 버전 서비스 인계(F13)대로 시나리오 키트를 실제 V9 테이블로 상속해 DDL 이 서비스의 고정 칼럼·CHECK 와 맞는지 두 방언에서 직접 증명한다.

계약은 두 덩어리다. **선분 조작 서비스 인터페이스**(`MasterCodeSegmentService`)는 원천 04 「구조」의 행 조작·행 되돌리기·코드 삭제 연쇄·복원 채우기·BASE 생성·버전 V 의 모습 조회를 DRAFT V 단위 추상 메서드로 선언하고, ROW_VERSION 증가(`VersionWriteGuard`)와 DRAFT 삭제 복구(`VersionDraftDeletionSpi`)는 기존 계약에 맡긴다(D8). **확정 검사 SPI 구현 대상 선언**은 기존 `VersionConfirmCheckSpi` 를 넓힌 `MasterCodeConfirmCheckSpi`(항목별 보고 1메서드 추가)와 검사 8항 enum·결과 record·diff 키 규약 상수로 한다(D9·D10). 카테고리 모델·ID 이름 공간·버전 상태·BASE 는 import 만 하고 다시 정의하지 않는다(불변 규칙 25). "실행 로직 없음"은 기존 ArchUnit 규칙의 자동 적용과 스텁 컴파일로 확인하며, TSK-03-01 식 임시 폐쇄 규칙은 두지 않는다(F22).

---

## 2. 변경 파일 목록

경로 접두: `B=src/backend/mdm`, `L=$B/lib/src/main/java/com/dongkuk/dmes/mdm`, `LT=$B/lib/src/test/java/com/dongkuk/dmes/mdm`, `AT=$B/api/src/test/java/com/dongkuk/dmes/mdm`, `AM=$B/api/src/mssqlTest/java/com/dongkuk/dmes/mdm`, `MIG=$B/api/src/main/resources/db/migration/mdm`.

### 생성

**마이그레이션**
- `$MIG/sqlite/V9__create_mdm_master_code.sql` — 7테이블(§6.0) + `TB_MDM_DOMAIN` 재생성으로 `FK_TB_MDM_DOMAIN_CODE` 추가(§6.0.8, D3)
- `$MIG/mssql/V9__create_mdm_master_code.sql` — 7테이블 + 파일 끝 `ALTER TABLE TB_MDM_DOMAIN ADD CONSTRAINT FK_TB_MDM_DOMAIN_CODE …`(D3)

**엔티티·리포지토리**(업무 활성 5표, D2)
- `$L/entity/MdmCode.java` — `LAST_CHG_SEQ` 미매핑(D2)
- `$L/entity/MdmCodeVer.java`·`MdmCodeVerId.java` — `@AttributeOverride(name="version", column=@Column(name="AUD_VER"))`, `ROW_VERSION` 은 `@Version` 아님
- `$L/entity/MdmCodeItem.java`·`MdmCodeItemId.java`
- `$L/entity/MdmCodeCate.java`·`MdmCodeCateId.java`
- `$L/entity/MdmCodeCateItem.java`·`MdmCodeCateItemId.java`
- `$L/repository/MdmCodeRepository.java`·`MdmCodeVerRepository.java`·`MdmCodeItemRepository.java`·`MdmCodeCateRepository.java`·`MdmCodeCateItemRepository.java` — `JpaRepository` 선언만

**SQLite 업무 일시 매핑**(D7)
- `$L/common/support/MdmSqliteLocalDateTimeConverter.java` — `AttributeConverter<LocalDateTime,String>`, 쓰기 = `MdmTemporalBinder.SQLITE_TEXT_PATTERN`, 읽기 = `fromDb` 문자열 규칙과 같음
- `$L/common/support/MdmSqliteTemporalContributor.java` — `MetadataBuilderContributor`, 위 컨버터 auto-apply

**계약**(`$L/contract/mastercode/`, §6.1)
- `package-info.java`
- `MasterCodeConventions.java`(상수 클래스) · `MasterCodeDiffConventions.java`(상수 클래스)
- `MasterCodeSourceKind.java` · `MasterCodeVerKind.java` · `MasterCodeSegmentTable.java` · `MasterCodeCheckSeverity.java` · `MasterCodeCheckStatus.java` · `MasterCodeConfirmCheckItem.java`(enum)
- `MasterCodeItemValues.java` · `MasterCodeItemRow.java` · `MasterCodeCateRow.java` · `MasterCodeCateItemRow.java` · `MasterCodeVersionView.java` · `MasterCodeSegmentKey.java` · `MasterCodeCheckItemResult.java` · `MasterCodeConfirmCheckReport.java`(record)
- `MasterCodeSegmentService.java` · `MasterCodeConfirmCheckSpi.java`(interface)

**테스트**
- `$LT/contract/mastercode/MasterCodeContractTest.java`(§3.5)
- `$LT/contract/stub/MasterCodeSegmentServiceStub.java`(§3.4, 06-02·06-03·06-04 역)
- `$LT/common/support/MdmSqliteLocalDateTimeConverterTest.java`(§3.6, 순수 단위)
- `$AT/MdmMasterCodeExpectations.java`(SQLite·MSSQL 공유 기대값: 표·칼럼·제약 이름·BIN2 칼럼 목록 — `MdmInterfaceLayoutExpectations` 모양)
- `$AT/MdmMasterCodeMigrationTest.java`(SQLite, §3.1)
- `$AT/MdmDomainCodeFkRebuildTest.java`(SQLite, Flyway 직접 호출, §3.2)
- `$AT/MdmMasterCodeEntityJpaRoundtripTest.java`(SQLite, §3.3)
- `$AT/common/version/MasterCodeVersionStateSqliteTest.java`(키트 상속, §3.7)
- `$AT/MdmMasterCodeDialectDdlParityTest.java`(docker 없이 두 방언 V9 파일을 읽어 대조, §3.11 — MSSQL 검증의 게이트 대체)
- `$LT/entity/MdmCodeEntityValueTest.java`(순수 단위: 세터 초 절단·게터 scale 3·IdClass scale 무관 동등, §3.12)
- `$AM/MdmMasterCodeMssqlMigrationTest.java`(MSSQL, §3.8 — **게이트에서 실행하지 않는다**, 사용자 결정 도커 금지)
- `$AM/common/version/MasterCodeVersionStateMssqlTest.java`(키트 상속, §3.7 — **게이트에서 실행하지 않는다**)

### 수정

- `$AT/MdmSharedContractMigrationTest.java` — `Set.of("1","2","3","4")` → `Set.of("1","2","3","4","8","9")`("8" 은 TSK-08-01 머지분), 메서드명 `flyway_가_V1_V2_V3_V4_를_적용했다` → `flyway_가_V1_V2_V3_V4_V8_V9_를_적용했다`. **새 버전 반영이지 기대값 완화가 아니다.**
- (아래 `$AM/…` 세 파일은 mssqlTest 소스셋이라 **게이트에서 실행되지 않는다** — 관례 유지를 위해 고치고, 컴파일은 `testAll` 이 아닌 `compileMssqlTestJava` 로만 확인된다. Build 는 `../gradlew :api:compileMssqlTestJava`(docker 불필요)로 컴파일만 확인한다)
- `$AM/MdmMssqlMigrationTest.java` — `migrationsExecuted` 4→6, `targetSchemaVersion` "4"→"9", 집합에 "8"·"9", 메서드명 `…V1_V2_V3_V4_V8_V9_가_적용된다`(새 버전 반영, "8" 은 TSK-08-01 머지분)
- `$AM/MdmTermDomainColumnMssqlMigrationTest.java` — 집합에 "8"·"9", 메서드명 동일 방식. `F1_대조군_TB_MDM_CODE_없이도_MARU_CODE_ID_NULL_INSERT_가_성공한다` → 이름·주석을 "FK 가 걸린 뒤에도 NULL 은 통과한다"로 고친다(본문 그대로 통과한다 — 이름이 거짓이 되므로 고친다)
- `$AM/MdmInterfaceLayoutMssqlMigrationTest.java` — 집합에 "8"·"9", 메서드명(팀장 목록에 없던 네 번째 고정 테스트, F3)
- `$AT/MdmTermDomainColumnMigrationTest.java` — `FK_TB_MDM_DOMAIN_CODE_부재_확인_MARU_CODE_ID_NULL_INSERT_가_성공한다` → `MARU_CODE_ID_NULL_INSERT_는_FK_추가_뒤에도_성공한다` 로 이름·주석만 고친다(FK 강제 단언은 §3.1 이 새로 한다)
- `$LT/contract/stub/MasterCodeConfirmCheckStub.java` — `implements MasterCodeConfirmCheckSpi` 로 바꾸고 `report()` 를 더한다. `diff()` 키를 `"ITEM:P01"`(D10 규약)로 바꾼다. 기존 단언(`kind`·`oldValues`·경고 `itemKey()=="P01"`)은 그대로 통과한다
- `$LT/contract/stub/ContractStubCompileTest.java` — 04 계약 스텁 컴파일 테스트 추가(§3.4). `CONFIRM_CHECKS` 목록은 늘리지 않는다(F21)
- `$L/entity/MdmDomain.java` — Javadoc 의 "DB FK 없음(D1)" 두 곳을 "V9(TSK-06-01)가 `FK_TB_MDM_DOMAIN_CODE` 를 걸었다"로 고친다(코드 변경 없음)
- `$L/common/support/MdmTemporalBinder.java` — 형식 문자열을 `public static final String SQLITE_TEXT_PATTERN = "yyyy-MM-dd HH:mm:ss"` 로 꺼내 기존 `TEXT` 포매터가 그 상수를 쓰게 한다(동작 불변, 컨버터와 형식 단일화)
- `$B/api/src/main/resources/application-local.yml` — `spring.jpa.properties.hibernate.metadata_builder_contributor: com.dongkuk.dmes.mdm.common.support.MdmSqliteTemporalContributor`(local 프로파일만, D7). `application-local-db.yml`·`application.yml` 은 건드리지 않는다
- `docs/mdm/naming-dialect-rules.md` — §3 #2·#16·#19 의 04 몫 중 **SQLite 쪽만** `확인(TSK-06-01 실측)` 으로 적고, MSSQL 쪽은 `실측 필요` 를 유지한 채 "사용자 결정: 도커 금지로 MSSQL 실측 생략, DDL 리뷰(`MdmMasterCodeDialectDdlParityTest`)로 대체" 를 덧붙인다, #16 규칙 칸에 "SQLite 엔티티 `LocalDateTime` 은 `MdmSqliteTemporalContributor`(local 전용)로 네이티브와 같은 19자 TEXT" 추가, #17 에 엔티티 왕복 관찰만 덧붙이고 상태(`→ TSK-06-02`)는 유지, §6.1 인계 표의 TSK-06-01 행 갱신
- **조건부 수정(D11)** — V9 FK 로 깨질 때만 고친다. Build 가 `testAll` 로 확인한 결과를 Build 기록에 남긴다: `$AT/MdmDictionaryExpectations.java`, `$AT/common/version/VersionFixtureTables.java`, `$AT/common/version/VersionStateServiceSqliteTest.java`, `$AT/MdmTermDomainColumnMigrationTest.java`(위 이름 수정과 별개), 그리고 Phase 06 전 dev 머지로 들어온 `DefaultMdmEffectiveDomainResolverTest.java`(TSK-04-03). 고치는 방법은 둘 중 하나다: 코드 참조가 필요한 픽스처는 `TB_MDM_CODE` 행을 먼저 seed 하고, 필요 없으면 `MARU_CODE_ID` 를 NULL 로 둔다. 04-03 브랜치는 직접 고치지 않는다
- `docs/mdm/decisions.md` — Build 완료 시 D3·D4·D6·D7(되돌리기 어려운 결정)을 현재 마지막 번호 뒤에 append(머지 때 번호 충돌은 머지 규약이 다시 매긴다)

### 수정하지 않음(자동 적용·참고만)

- `MdmContractArchitectureTest`·`MdmEntityArchitectureTest`·`MdmFlywayVersionParityTest` — 수정 없이 새 패키지·엔티티·V9 에 적용된다(F3·F20)
- `DefaultVersionTableRegistry`·`VersionRowStore`·`AbstractVersionStateScenarioTest`·`VersionFixtureTables`·`VersionScenarioTestConfig` — 상속·재사용만 한다
- `docs/mdm/erd/04-master-code.*`·`99-cross-area-fk.mssql.sql` — TSK-02-03 소유. 갈라진 다섯 곳은 §6.0 에 적었을 뿐 ERD 를 고치지 않는다
- mcm-core `SqliteTemporalConverterContributor` — 쓰지 않는다(쓰기 형식 `.SSS` 가 네이티브 19자와 달라 D7 판별 제약에 불합격)

---

## 3. 테스트 전략

**기준선 명령**(오케스트레이터가 기준선에서 실제로 돌린 줄 그대로):
```
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain
# → 1878 tests / 0 failures (TEST-*.xml 합산, mssqlMigrationTest 제외)
cd src/backend/mdm && ../gradlew :api:mssqlMigrationTest
# → 실행하지 않음 — 사용자 결정: 도커 금지로 MSSQL 실측 생략, DDL 리뷰로 대체
```
**사용자 결정: 도커 금지로 MSSQL 실측 생략, DDL 리뷰로 대체**(2026-09-24, 팀장 경유). `mssqlMigrationTest` 와 docker·Testcontainers 명령은 기준선·게이트·Build·Verify 어디에서도 돌리지 않는다.

게이트 = **`testAll` 하나**, 기준선 대비 신규 실패 0 + 총수 미감소(기준선 1878 / 0). MSSQL 방언 검증은 ① SQLite 테스트(`testAll`) 통과와 ② MSSQL DDL 을 SQLite DDL 과 대조하는 리뷰로 대체한다. ②는 기계 부분(§3.11 `MdmMasterCodeDialectDdlParityTest`, `testAll` 에 포함, docker 없이 파일만 읽음)과 사람 부분(Verify 가 두 V9 파일을 줄 단위로 나란히 읽고 §6.0 표·G1~G5 와 대조한 결과를 design.md Verify 기록에 남김)으로 나눈다. mssqlTest 소스셋의 새 파일(§3.7 MSSQL 판·§3.8)과 수정 파일은 선례·관례 유지를 위해 계획하지만 **게이트에서 실행되지 않으며**, 그 파일들이 잡는다고 적은 변이는 게이트 기준으로는 잡히지 않는다(아래 §5 는 게이트에서 실제로 잡는 테스트를 먼저 적고 mssqlTest 는 괄호로 참고 표시한다). 새 테스트의 Flyway 버전 단언은 **"9 가 포함된다"**(`MdmMasterCodeExpectations.VERSION`)로 쓴다(전체 집합을 고정하는 것은 §2 의 기존 4개 테스트뿐이다 — 재채번하면 그 4개와 `VERSION` 상수만 바꾸면 된다).

### 3.1 `MdmMasterCodeMigrationTest`(SQLite, `api/src/test`)

`MdmInterfaceLayoutMigrationTest` 패턴(`@SpringBootTest(webEnvironment=MOCK) @ActiveProfiles("local")`, `@TempDir`, 쓰기 단언은 한 연결에서 rollback). 기대값은 `MdmMasterCodeExpectations` 에서 읽는다.

1. `flyway_schema_history` 에 `"6"` 이 `success=1` 로 있다.
2. 7테이블이 있고 각 표의 칼럼 집합이 기대값과 같다(`pragma_table_info`). `TB_MDM_CODE_VER`·`TB_MDM_CODE_RECV` 에는 `AUD_VER` 가 있고 감사 `VER` 가 없다(업무 `VER` 만 있다). 나머지 5표는 감사 `VER` 가 있다.
3. PK 칼럼과 순서(`pragma_table_info.pk`)가 §6.0 과 같다. `CONSTRAINT PK_…`·`FK_…`·`CK_…` 이름이 `sqlite_master.sql` 텍스트에 있다.
4. 타입 텍스트: `VER`·`FROM_VER`·`TO_VER`·`RESTORED_FROM`·`TB_MDM_CODE_RECV.VER` 가 `NUMERIC(7,3)`, 감사 `VER`/`AUD_VER` 와 `ROW_VERSION` 이 `BIGINT`(F5·D5).
5. **기본값**: 필수 칼럼만 넣은 원시 INSERT 뒤 `TB_MDM_CODE.STATUS='CREATED'`·`LVL_CNT=0`·`LAST_CHG_SEQ=0`, `TB_MDM_CODE_VER.STATUS='DRAFT'`·`EMERGENCY_YN='N'`·`ROW_VERSION=0`, ITEM·CATE·CATE_ITEM `TO_VER` 가 9999 와 수치로 같다(`CAST(TO_VER AS TEXT)` 또는 `compareTo`).
6. **CHECK 위반 거부**(표마다 대표 1건 이상): STATUS·SRC_KIND 범위 밖, `SOURCE_KIND='EXTERNAL' AND SOURCE_SYSTEM IS NULL`, `SOURCE_KIND='MDM' AND SOURCE_SYSTEM='MES'`, `LVL_CNT` -1·6 거부와 0·5 통과(경계), `VER_KIND='PATCH'`, VER `STATUS='DONE'`, `EMERGENCY_YN='X'`, ITEM `CODE='A B'`·`'A,B'`, CATE `DEF_KIND='LIST'`, REGEX 인데 `DEF_EXPR` NULL, TABLE 인데 `DEF_TARGET='CODE'`, RECV `REQ_KIND='X'`·`RESULT='PARTIAL'`.
7. **`CK_TB_MDM_CODE_VER_APPLY`(D4)**: `DRAFT`+둘 다 NULL 통과, `REQUESTED`+APPLY_FROM 있음+APPLY_TO NULL **통과**, `REQUESTED`+APPLY_FROM NULL 거부, `RELEASED`+APPLY_TO NULL 거부, `RELEASED`+둘 다 있음 통과.
8. **FK 강제**: VER 의 `MARU_CODE_ID` 가 CODE 에 없으면 거부, ITEM·CATE·CATE_ITEM 의 `(MARU_CODE_ID, FROM_VER)` 가 VER 에 없으면 거부(부모 1.000·1.001 만 있을 때 `FROM_VER=1.002` 거부, `1.001` 통과 — DECIMAL 키 FK 대조), `TB_MDM_CODE.SOURCE_SYSTEM='NOPE'` 거부, CODE_SYSTEM·RECV 의 `SOURCE_SYSTEM`/`SYSTEM_CODE` 가 `TB_MDM_SYSTEM` 에 없으면 거부.
9. **FK 없음(의도)**: CATE_ITEM 을 CATE 행·ITEM 행 없이(VER 만 있고) 넣으면 통과, ITEM `TO_VER=1.500`(VER 행 없는 번호) 통과.
10. **CASCADE 없음**: ITEM 이 달린 VER 행 DELETE 거부, VER 가 달린 CODE 행 DELETE 거부.
11. **#19(SQLite 대조군)**: ITEM `CODE` 'A1'·'a1' 이 같은 `(MARU_CODE_ID, FROM_VER)` 에서 서로 다른 행으로 들어간다.
12. **#2(SQLite)**: `TB_MDM_CODE_RECV` 에 3행 INSERT → 최댓값 행 DELETE → 다시 INSERT 한 `RECV_ID` 가 지운 값보다 크다(AUTOINCREMENT 재사용 없음).
13. **`FK_TB_MDM_DOMAIN_CODE`(D3)**: `TB_MDM_DOMAIN` 에 `MARU_CODE_ID='NOPE'`(CODE 없음) INSERT 거부, `TB_MDM_CODE` 에 `PROC_CD` 를 넣은 뒤 `MARU_CODE_ID='PROC_CD'` 통과, NULL 통과. 재생성 뒤에도 `IX_TB_MDM_DOMAIN_PARENT`, `CK_TB_MDM_DOMAIN_CODE`·`_FLAG`, JSON CHECK 4개, `FK_TB_MDM_DOMAIN_DOMAIN`·`_UNIT`, `TB_MDM_COLUMN.FK_TB_MDM_COLUMN_DOMAIN` 이 살아 있다(`pragma_index_list`·`pragma_foreign_key_list`·`sqlite_master.sql`). 기존 `MdmTermDomainColumnMigrationTest` 전체가 그대로 초록인 것도 이 항목의 증거다.

### 3.2 `MdmDomainCodeFkRebuildTest`(SQLite, Flyway 직접 호출, `api/src/test`)

Spring 컨텍스트 없이 `Flyway.configure().dataSource("jdbc:sqlite:<tempfile>?foreign_keys=true", …).locations("classpath:db/migration/mdm/sqlite")` 로 돈다(`MdmMssqlMigrationTest` 가 Flyway API 를 직접 쓰는 선례). 앱과 같게 외래키 강제를 켠다(F7 이 `foreign_keys=ON` 에서만 성립하므로 필수).

- **이전 버전 계산**: `target` 을 하드코딩하지 않는다. `Flyway.info().all()` 에서 버전이 9 보다 작은 최댓값을 구해 그 버전까지 먼저 적용한다(지금은 "8" — 그 사이 버전이 `TB_MDM_DOMAIN` 을 바꾸면 아래 A-③ 이 V9 재생성 DDL 의 누락을 잡는다).
- **A. 참조 없는 도메인 데이터가 있는 DB**: 이전 버전까지 적용 → `TB_MDM_UNIT` 1행 + 부모 없는 도메인 3행(`MARU_CODE_ID` NULL, 하나는 JSON 칼럼 채움) INSERT → 최댓값 ID 행 DELETE → `sqlite_sequence` 값·`pragma_table_info`·`pragma_foreign_key_list`·`pragma_index_list`·CHECK 이름 목록과 V8 `TB_MDM_RULE_VAR` 의 DDL·FK 목록을 기록 → V9 적용. 단언: ① 남은 2행이 모든 칼럼 값 그대로 있다 ② 다음 INSERT 의 `DOMAIN_ID` 가 지운 최댓값보다 크다(F7-④) ③ 칼럼 정의(이름·타입·NOT NULL·기본값·PK)·인덱스·CHECK 가 V9 전과 같고, FK 는 전 목록 + `FK_TB_MDM_DOMAIN_CODE`(→`TB_MDM_CODE.MARU_CODE_ID`) 하나만 늘었다 ④ `MARU_CODE_ID='NOPE'` INSERT 가 거부된다 ⑤ `TB_MDM_RULE_VAR` 의 DDL·FK 목록이 V9 전과 같고, 남은 도메인을 가리키는 RULE_VAR 행은 들어가며 없는 도메인을 가리키는 행은 `FK_TB_MDM_RULE_VAR_DOMAIN` 이 거부하고, `pragma_foreign_key_check` 가 비어 있다(V8 FK 가 RENAME 뒤 새 표를 가리킨다 — 재작업 추가).
- **B. 도메인을 참조하는 행이 있는 DB(원자성)**: 이전 버전까지 적용 → 부모 도메인 1행·자식 도메인 1행(`PARENT_DOMAIN_ID`)·`TB_MDM_COLUMN` 1행 INSERT → V9 적용은 **실패해야 하고**(F7-②), 실패 뒤 `TB_MDM_CODE` 가 없고 `TB_MDM_DOMAIN`·`TB_MDM_COLUMN` 의 행과 스키마가 V9 전과 같으며, `flyway_schema_history` 에 버전 9 의 `success=1` 행이 없다. **B_업무기준**(재작업 추가): 도메인을 참조하는 것이 V8 `TB_MDM_RULE_VAR` 한 행뿐인 DB 에서도 V9 는 FK 위반으로 실패하고(메시지에 `FOREIGN KEY`), 같은 무부분적용 단언에 RULE_VAR 행·DDL 불변을 더한다. Build 는 이 경로를 실측한 뒤 결과를 §Build 기록에 남긴다. **Build 가 참조 행이 있어도 성공하는 기법을 찾으면**(D3 반려 방향 참고) B 를 "성공 + 행·FK 보존" 단언으로 바꾸고 D3 에 이탈로 적는다 — 어느 쪽이든 "부분 적용된 DB 가 남지 않는다"는 단언은 유지한다.

### 3.3 `MdmMasterCodeEntityJpaRoundtripTest`(SQLite, `api/src/test`)

`MdmLayoutEntityJpaRoundtripTest` 패턴(`@Transactional`, `@TempDir`). `ddl-auto: none` 이라 부팅이 매핑 오류를 다 잡지 못하므로 5개 엔티티 각각 저장→`flush()`→`clear()`→조회 왕복을 한다.

1. **기본값을 설정하지 않은 새 엔티티 저장**: `MdmCode`(id·name·sourceKind 만), `MdmCodeVer`(id·ver·verKind 만), `MdmCodeItem`(id 3칸만) 저장 뒤 조회 값이 `STATUS='CREATED'`·`LVL_CNT=0`, `STATUS='DRAFT'`·`EMERGENCY_YN='N'`·`ROW_VERSION=0`, `TO_VER=9999.000` 이다(엔티티 필드 초기값이 DDL 기본값과 같다 — Hibernate 는 매핑한 칼럼에 null 을 명시해 DB 기본값을 무력화하므로 필수).
2. **DECIMAL 복합키(F26)**: VER `1.000`·`1.001`·`2.000`, ITEM `(PROC_CD, 82, 1.000)`·`(PROC_CD, 82, 1.001)`, CATE `(PROC_CD, BASE, 1.000)`, CATE_ITEM `(PROC_CD, MAJOR, 82, 1.000)` 을 저장하고 `clear()` 뒤 scale 3 키(`new BigDecimal("1.000")`)로 `findById` 가 찾는다. 찾은 엔티티의 `getVer()`·`getFromVer()`·`getToVer()` 가 `assertEquals(new BigDecimal("1.000"), …)`(scale 까지 같음)로 통과한다. SQLite `typeof(VER)` 을 1.000·1.001 행에서 관찰해 Build 기록에 남긴다(#17 관찰).
3. **`AUD_VER` 독립**: `MdmCodeVer` 의 업무가 아닌 필드(`description`)를 고치고 flush·clear → 감사 `getVersion()`(AUD_VER)은 증가, 업무 `getVer()` 는 불변, `getRowVersion()` 도 불변(ROW_VERSION 은 `@Version` 아님 — 불변 규칙 13). `CactusAuditListener.onPreUpdate` 가 AuditHolder 문맥과 무관하게 VER(여기서는 AUD_VER)를 올린다(TSK-05-01 F25).
4. **업무 일시(D7, #16)**: `MdmCodeVer.applyFrom = 2026-07-01T00:00:00.700`·`applyTo = OPEN_END` 저장 → ① 네이티브 `SELECT typeof(APPLY_FROM), APPLY_FROM` 이 `text`·`'2026-07-01 00:00:00'`(19자, `MdmTemporalBinder.toDb(값)` 과 글자 단위로 같음) ② 엔티티 재조회 값이 `2026-07-01T00:00`(초 절단). **교차 읽기 양방향**: ③ 네이티브(`JdbcTemplate` 로 `'2024-01-01 00:00:00'` 을 넣은 행)를 엔티티로 읽으면 `LocalDateTime.of(2024,1,1,0,0)` ④ 엔티티로 저장한 행을 `VersionRowStore.find(VersionRef)` 로 읽으면 예외 없이 같은 값(`fromDb` 가 정수를 받으면 예외가 나므로 컨버터가 빠진 변이를 잡는다).
5. **부모 FK 대조군**: 부모 VER 없는 `MdmCodeItem(FROM_VER=1.002)` 저장 flush 가 실패한다.
6. `MdmCode` 의 `LAST_CHG_SEQ` 는 매핑되지 않는다 — 엔티티 저장 뒤 네이티브로 `LAST_CHG_SEQ=0`(DB 기본값) 확인.

### 3.4 계약 스텁 컴파일(`ContractStubCompileTest` 추가 메서드)

- `MasterCodeSegmentServiceStub`(test, `MasterCodeSegmentService` 구현, 호출 기록만 하는 흉내): 06-02(`createBaseCategory`·`fillFrom`)·06-03(`addItem`·`changeItem`·`removeItem`·`revert`·`viewAt`)·06-04(`addCategory`·`changeCategory`·`closeCategory`·`addCategoryMembers`·`removeCategoryMembers`) 역의 호출이 **인터페이스 타입으로만** 컴파일·동작한다. `addCategory` 에 `CategoryDefinition`(TSK-01-02)을 그대로 넘긴다.
- `MasterCodeConfirmCheckStub`(수정): `MasterCodeConfirmCheckSpi` 로 받아 `report(request)` 가 `MasterCodeConfirmCheckItem.values()` 순서대로 10행을 돌려주고, 최초 버전 요청(`previousReleasedApplyFrom == null`)이면 3·4항이 `EXEMPT`, 3항이 그 밖에는 `DELEGATED`, 5항이 `DEFERRED` 임을 생성자 호출로 보인다. 같은 스텁을 `VersionConfirmCheckSpi` 목록에 그대로 둬 기존 target 덮기 테스트가 초록으로 남는다(F21).
- `VersionDiffEntry` 키를 `MasterCodeDiffConventions` 상수로만 조립하는 3표 예시(`ITEM:82`, `CATE:COATING`, `CATE_ITEM:MAJOR,82`)가 컴파일된다(조립은 테스트 코드 안의 문자열 결합이지 계약 로직이 아니다).

### 3.5 `MasterCodeContractTest`(`lib/src/test/.../contract/mastercode`)

1. **검사 8항 표**: `MasterCodeConfirmCheckItem` 이 정확히 10개이고 순서·`no()` 가 `1, 2, 2-1, 2-2, 3, 4, 5, 6, 7, 8` 이다. `severity()` 는 2-1·2-2·5 만 `WARNING`, 나머지 `REJECT`(04:405-416). `firstVersionExempt()` 는 3·4 만 true(04:411-412). `sharedCheck()` 는 3 만 true(F18). `inScope()` 는 5 만 false(D9).
2. **선분 상수**: `OPEN_TO_VER.compareTo(9999)==0` 이고 scale 3, `FIRST_VER` = `1.000`(scale 3), `MAX_MINOR=999`, `MAX_MAJOR=9998`(9999 는 발급하지 않음, 04:278), `LVL_CNT_MIN=0`·`LVL_CNT_MAX=5`·`LVL_CNT_DEFAULT=0`, `LVL_SLOTS=5`, `ATTR_SLOTS=10`. scale 상수는 두지 않는다 — `VersionTarget.MASTER_CODE.versionScale()`(=3)를 그대로 쓴다(불변 규칙 25).
3. **diff 키 규약(D10)**: `KEY_PART_SEPARATOR` 가 `MaruIdRules.FORBIDDEN_CHAR_PATTERN` 과 `MasterCodeConventions.CODE_FORBIDDEN_CHAR_PATTERN` 양쪽에 걸린다(= cate_id·code 어디에도 나올 수 없다). `TABLE_KEY_SEPARATOR` 가 `MasterCodeSegmentTable` 이름에 없다.
4. **표 이름**: `MasterCodeSegmentTable.{ITEM,CATE,CATE_ITEM}.physicalTable()` 이 `TB_MDM_CODE_ITEM`·`TB_MDM_CODE_CATE`·`TB_MDM_CODE_CATE_ITEM` 이다.
5. **재정의 금지(불변 규칙 25)**: ArchUnit `ClassFileImporter().importPackages("com.dongkuk.dmes.mdm.contract.mastercode")` 로 가져온 클래스 중 ① 상수 집합이 `CategoryKind`·`CategoryDefTarget`·`MaruIdKind`·`VersionStatus`·`MaruObjectStatus`·`DiffKind` 중 하나와 같은 enum 이 없다 ② `static final String` 값이 `"BASE"`·`".*"`·`MaruIdRules.FORBIDDEN_CHAR_PATTERN` 인 필드가 없다 ③ `MaruIdNamespace`·`VersionConfirmCheckSpi`·`VersionDraftDeletionSpi` 와 같은 메서드 시그니처를 새로 선언한 인터페이스가 없다(`MasterCodeConfirmCheckSpi` 는 `VersionConfirmCheckSpi` 를 **상속**할 뿐이다) ④ 양성 대조: `MasterCodeSegmentService.addCategory` 의 인자 타입에 `CategoryDefinition.class` 가 있다.
6. **선분 서비스 경계(D8)**: `MasterCodeSegmentService` 가 선언한 메서드 집합(이름 + 인자 타입 목록 + 반환 타입)이 §6.1 목록 12개와 **정확히** 같다(`getDeclaredMethods()` 로 만든 문자열 집합 비교). 이 단언 하나가 `long expectedRowVersion`·`String userId` 인자 추가, `deleteDraft`·`beforeDraftDelete` 재선언, 메서드 누락을 모두 잡는다(인자 이름은 믿을 수 없어 타입 목록으로 판정한다). 모든 조작 메서드의 첫 인자가 `VersionRef` 인 것도 같은 집합에 들어 있다.
7. **엔티티 범위(D2)**: ArchUnit 으로 `com.dongkuk.dmes.mdm.entity` 의 `@Table` 이름 목록에 `TB_MDM_CODE_SYSTEM`·`TB_MDM_CODE_RECV` 가 없고, `MdmCode` 의 어떤 필드도 `@Column(name="LAST_CHG_SEQ")` 가 아니다.

### 3.6 `MdmSqliteLocalDateTimeConverterTest`(순수 단위)

쓰기: `2026-07-01T00:00:00.700` → `"2026-07-01 00:00:00"`(19자), null → null, 결과가 `DateTimeFormatter.ofPattern(MdmTemporalBinder.SQLITE_TEXT_PATTERN)` 출력과 같다. 읽기: `"2026-07-01 00:00:00"`·`"2026-07-01T00:00:00"`·`"2026-07-01 00:00:00.123"`(앞 19자) → 같은 값, null·빈 문자열 → null. 정수 문자열(epoch)은 받지 않는다(예외) — 형식을 하나로 고정하는 것이 목적이다(D7).

### 3.7 시나리오 키트 상속(`MasterCodeVersionStateSqliteTest`·`MasterCodeVersionStateMssqlTest`, F13)

`VersionStateServiceSqliteTest`·`…MssqlTest` 를 본떠 `AbstractVersionStateScenarioTest` 를 상속한다. 차이:
- `@Primary VersionTableRegistry` = MASTER_CODE 는 `new DefaultVersionTableRegistry().spec(…)`(실제 V9 표), BUSINESS_RULE 은 `VersionFixtureTables.RULE_SPEC`(06 표가 아직 없음). `createSchema` 는 픽스처 RULE 표만 만든다(`VersionFixtureTables.sqliteDdl()`/`mssqlDdl()` 중 RULE 두 문장).
- `seedObject` 재정의(MASTER_CODE 일 때): `MARU_CODE_NAME`(=objectId), `SOURCE_KIND='MDM'`, `SOURCE_SYSTEM` NULL 을 채운다(`CK_TB_MDM_CODE_SRC_SYS`). `seedVersion` 재정의: `VER_KIND='MAJOR'` 를 채운다. BUSINESS_RULE 은 `super` 로 넘긴다.
- `clearTables`: `TB_MDM_CODE_CATE_ITEM → TB_MDM_CODE_CATE → TB_MDM_CODE_ITEM → TB_MDM_CODE_VER → TB_MDM_CODE` 순(FK 역순) + `TB_MDM_DOMAIN` 의 `MARU_CODE_ID` 참조 행이 없음을 전제(키트는 도메인을 만들지 않는다) + 픽스처 RULE 두 표.
- MSSQL 판은 컨테이너에 별도 DB(`mdm_code_version`)를 만든다 — **게이트에서 실행하지 않는다**(도커 금지). S14(트리거 원자성)·S24(저장 형식)처럼 방언 전용 시나리오는 옮기지 않는다(키트 본체 44개만).
- SQLite 판이 "V9 DDL 이 공통 서비스의 고정 칼럼·이름·CHECK(`CK_TB_MDM_CODE_VER_APPLY` 포함)를 만족한다"의 **유일한 직접 증거**다(불변 규칙 31). MSSQL 쪽은 §3.11 이 칼럼 이름·CHECK 식이 두 방언에서 같음을 대조해 간접으로 잇는다.

### 3.8 `MdmMasterCodeMssqlMigrationTest`(MSSQL, `api/src/mssqlTest`) — 게이트 비실행

**사용자 결정(도커 금지)으로 이 테스트는 기준선·게이트·Verify 에서 돌리지 않는다.** 선례(`MdmInterfaceLayoutMssqlMigrationTest`)와 관례를 유지하려고 작성만 하며, 나중에 docker 사용이 허용되면 그대로 돌릴 수 있게 둔다. Build 는 `compileMssqlTestJava` 로 컴파일만 확인한다. 게이트 대체는 §3.11·§3.12 다.

`MdmInterfaceLayoutMssqlMigrationTest` 패턴(`@SpringBootTest`+`local-db`+Testcontainers, 별도 DB 이름). §3.1 의 1~10·13 을 MSSQL 로 반복하고(기대값 공유), 아래를 더한다:
1. **#19**: `MdmMasterCodeExpectations.BIN2_COLUMNS`(§6.0 표의 BIN2 표시 칼럼 전부)의 `sys.columns.collation_name='Latin1_General_100_BIN2'`, ITEM `CODE` 'A1'/'a1' 두 행이 PK 위반 없이 들어간다.
2. **#2**: `TB_MDM_CODE_RECV` 에 JDBC `getGeneratedKeys` 로 3행 연속 INSERT → `RECV_ID` 단조 증가, 최댓값 행 DELETE 뒤 새 INSERT 가 더 큰 값.
3. **#16**: `MdmCodeVer` 를 리포지토리로 저장·조회 — `APPLY_FROM` 에 `.700` 초 이하 값을 넣어도 `DATETIME2(0)` 에서 `…:00` 으로 돌아온다(엔티티 세터의 초 절단 — DATETIME2(0) 는 반올림하므로 절단이 없으면 `:01` 이 된다, 불변 규칙 22). `sys.columns` 로 `APPLY_FROM`·`APPLY_TO`·`REQUESTED_AT`·`APPROVED_AT`·`RELEASED_AT`·`CANCELLED_AT`·`RECEIVED_AT`·`PROCESSED_AT` 가 `datetime2` 이고 **`scale = 0`**(소수초 자릿수는 precision 이 아니라 scale 칸이다)인지 확인. MSSQL 에 컨버터가 적용되지 않음은 왕복 값으로는 판별할 수 없다(문자열로 바인딩돼도 왕복은 성공한다) — **설정 수준**에서 확인한다: 이 테스트 컨텍스트의 `Environment` 에 `spring.jpa.properties.hibernate.metadata_builder_contributor` 가 없음을 단언한다(`application-local-db.yml`·`application.yml` 에 그 키가 없다).
4. **D6**: `DEF_EXPR` 에 `N'.*강.*'` 을 저장·조회한 값이 같다(`?` 손실 없음). `sys.columns` 타입 `nvarchar`, max_length -1.
5. `FK_TB_MDM_DOMAIN_CODE` 가 `sys.foreign_keys` 에 있고 실제로 강제된다(없는 코드 거부, NULL 통과).
6. 복합키 왕복: 5개 엔티티 리포지토리 `save()` → `findById()`(scale 3 키) 일치, `getVer()` scale 3.
7. `DECIMAL(7,3)` 칼럼의 `sys.columns.precision=7, scale=3`.

### 3.9 ArchUnit

`MdmContractArchitectureTest`·`MdmEntityArchitectureTest` 는 수정 없이 `contract.mastercode`·새 엔티티에 적용된다(F20).

### 3.10 브라우저 E2E

**해당 없음** — `entry-point: -`, `domain: database`(화면 작업이 아니다). dev-discipline 「화면 작업의 브라우저 E2E」 트리거에 해당하지 않는다.

### 3.11 `MdmMasterCodeDialectDdlParityTest`(SQLite 소스셋 `api/src/test`, docker 없음 — MSSQL DDL 리뷰의 기계 부분)

Spring 컨텍스트 없이 classpath 의 `db/migration/mdm/sqlite/V9__create_mdm_master_code.sql`·`mssql/V9__…` 두 파일을 문자열로 읽는다. `--` 주석을 지우고 `;` 로 문장을 나눈 뒤, 정규식으로 `CREATE TABLE <이름> ( … )` 블록과 `ALTER TABLE … ADD CONSTRAINT` 문을 파싱한다. 식별자 인용(`"…"`·`[…]`)은 벗겨서 비교한다. 파서는 V9 파일 작성 모양(한 줄에 칼럼 하나 또는 쉼표로 이은 같은 타입 칼럼, 제약은 `CONSTRAINT 이름 …`)만 다루면 되며, 그 전제는 테스트 Javadoc 에 적는다(전제가 깨지면 파싱 실패로 빨개져 조용히 통과하지 않는다 — "파싱한 표가 7개, 칼럼이 기대 수 이상" 을 먼저 단언한다).

두 방언 **같아야 하는 것**:
1. 테이블 이름 집합(7개, `MdmMasterCodeExpectations.TABLES` 와도 같음).
2. 표마다 칼럼 이름 집합과 NOT NULL 여부.
3. PK 이름과 칼럼 목록(순서 포함). SQLite RECV 의 인라인 `CONSTRAINT PK_… PRIMARY KEY AUTOINCREMENT` 도 PK 로 읽는다.
4. FK 이름 → (자식 칼럼 목록, 부모 표, 부모 칼럼 목록). MSSQL 파일 끝 `ALTER TABLE TB_MDM_DOMAIN ADD CONSTRAINT FK_TB_MDM_DOMAIN_CODE …` 와 SQLite 재생성 표 안의 같은 이름 FK 가 같은 3순組다.
5. CHECK 이름 집합, 그리고 CHECK 식을 정규화(공백 제거·인용 벗김·대문자화)한 문자열이 같다 — `CK_TB_MDM_CODE_VER_APPLY`(D4) 식이 두 방언에서 글자 단위로 같다.
6. DEFAULT 가 있는 칼럼 집합과 기본값 리터럴(`'CREATED'`·`0`·`'DRAFT'`·`'N'`·`9999`). MSSQL 은 `CONSTRAINT DF_… DEFAULT (…)` 에서 괄호를 벗겨 비교한다.
7. 두 파일 어디에도 `ON DELETE CASCADE`·`ON UPDATE CASCADE` 가 없다.

**MSSQL 에만 있는 것**(ERD 규칙표 대조):
8. BIN2: `MdmMasterCodeExpectations.BIN2_COLUMNS` 의 칼럼 정의에 `COLLATE Latin1_General_100_BIN2` 가 있고, 그 목록 밖의 `VARCHAR` 칼럼(감사 `VARCHAR(100)` 제외)에는 없다.
9. 타입: 버전 칼럼(`VER`·`FROM_VER`·`TO_VER`·`RESTORED_FROM`·RECV `VER`)이 `DECIMAL(7,3)`, `ROW_VERSION`·감사 `VER`/`AUD_VER`·`LAST_CHG_SEQ`·`CHG_SEQ` 가 `BIGINT`, 업무 일시 8칼럼이 `DATETIME2(0)`, 감사 `C_AT`/`U_AT` 가 `DATETIME2`, `DEF_EXPR` 가 `NVARCHAR(MAX)`(D6), 한글 칼럼(`MARU_CODE_NAME`·`NAME`·`ALTER_NAME`·`CATE_NAME`·`ATTRnn_NAME`)이 `NVARCHAR(100)`, `ATTR01..10` 이 `NVARCHAR(500)`, `RECV_ID` 가 `BIGINT IDENTITY(1,1)`.
10. SQLite 쪽 대응: 버전 칼럼 `NUMERIC(7,3)`, `ROW_VERSION`·감사 카운터 `BIGINT`(F5·D5), `RECV_ID` `INTEGER … AUTOINCREMENT`.

한계(보고 대상): 이 테스트는 **텍스트 대조**라 MSSQL 이 그 DDL 을 실제로 받아들이는지(문법·FK 대상 타입 일치로 인한 생성 실패), `DATETIME2(0)` 반올림, IDENTITY 단조 증가, BIN2 비교 결과 같은 **실행 동작**은 증명하지 못한다. 이 부분은 사람의 DDL 리뷰(Verify)와 D7 세터 절단 단위 테스트(§3.12)로만 덮고, 규칙표 #2·#16·#19 의 MSSQL 열은 `실측 필요` 로 남긴다.

### 3.12 `MdmCodeEntityValueTest`(`lib/src/test/.../entity`, 순수 단위)

Spring·DB 없이 엔티티·IdClass 객체만 다룬다(MSSQL 실측을 못 하는 대신 방언과 무관한 값 규칙을 직접 고정한다).
1. `MdmCodeVer` 의 `LocalDateTime` 세터 6개에 `…00.700` 을 넣으면 게터가 `…00` 을 돌려준다(불변 규칙 22 — MSSQL `DATETIME2(0)` 반올림 대비).
2. `new BigDecimal("1")` 을 넣은 `MdmCodeVer.ver`·`MdmCodeItem.fromVer/toVer` 의 게터가 `new BigDecimal("1.000")` 과 `equals` 로 같다(불변 규칙 23 ①).
3. `MdmCodeVerId("PROC_CD", 1)` 과 `MdmCodeVerId("PROC_CD", 1.000)` 이 `equals` 이고 `hashCode` 가 같다(4개 IdClass 모두, 불변 규칙 23 ②).

### 3.13 Verify 체크리스트 — MSSQL DDL ↔ SQLite DDL 줄 단위 대조 리뷰(도커 금지 대체)

§3.11 이 옮기지 못한 항목, 즉 MSSQL 이 실제로 DDL 을 받아들이는지와 실행 동작은 Verify 가 두 V9 파일을 나란히 읽고 아래를 하나씩 확인해 design.md Verify 기록에 표로 남긴다(항목별 ✓/✗ 와 근거 줄 번호).
1. MSSQL 파일 순서: 부모 표가 자식 표보다 먼저 생성되고(CODE → SYSTEM·VER → ITEM·CATE·CATE_ITEM → RECV), `ALTER TABLE TB_MDM_DOMAIN ADD CONSTRAINT FK_TB_MDM_DOMAIN_CODE` 가 `TB_MDM_CODE` 생성 뒤에 있다(생성 실패 방지).
2. FK 칼럼과 부모 칼럼의 타입·길이·COLLATE 가 글자 단위로 같다 — `MARU_CODE_ID VARCHAR(50) COLLATE Latin1_General_100_BIN2`(부모 `TB_MDM_CODE`, 자식 6표 + `TB_MDM_DOMAIN`), `SYSTEM_CODE`/`SOURCE_SYSTEM VARCHAR(20) … BIN2`(V2 부모), `FROM_VER DECIMAL(7,3)` = `TB_MDM_CODE_VER.VER DECIMAL(7,3)`. MSSQL 은 불일치 시 FK 생성이 실패한다(TSK-05-01 F20).
3. `DF_…` 기본값 제약 이름이 전부 서로 다르고 128자 이하다.
4. `[RESULT]` 인용, 예약어 충돌 칼럼이 더 없는지.
5. 업무 일시 8칼럼은 `DATETIME2(0)`(반올림 동작은 §3.12-1 세터 절단이 대비), 감사 `C_AT`/`U_AT` 는 `DATETIME2`.
6. `RECV_ID BIGINT IDENTITY(1,1) NOT NULL` 과 `CONSTRAINT PK_TB_MDM_CODE_RECV PRIMARY KEY (RECV_ID)`(규칙표 #2 — 단조 증가 실측은 생략).
7. 한글이 들어갈 칼럼이 `NVARCHAR` 인지(`DEF_EXPR` 포함, D6), 코드·키 칼럼이 `VARCHAR … BIN2` 인지(규칙표 #18·#19 — 대소문자 구분 비교 실측은 생략).
8. G1~G5 외에 ERD 와 갈라진 곳이 없는지(ERD 파일과 diff).

---

## 4. 수용 기준 매핑

| spec 수용 기준 / 요구사항 | 검증 방법 |
|---|---|
| 실행 로직 없음 (contract-only) | ① `MdmContractArchitectureTest` 자동 적용(F20): `contract.mastercode` 는 인터페이스(추상 메서드만)·enum·record(접근자만)·상수 클래스뿐이고 Spring·JPA·엔티티에 의존하지 않는다 ② §3.4 스텁 컴파일 ③ §3.5-5·6(재정의 금지·선분 서비스 경계) ④ "main 에 구현 클래스가 없다"는 테스트로 고정하지 않는다(F22, TSK-05-01 방식) — Verify 가 변경 파일을 §2 목록과 diff 해 확인하는 **알려진 커버리지 갭**이다(불변 규칙 30). **`MdmSqliteLocalDateTimeConverter`·`MdmSqliteTemporalContributor` 는 영속성 설정(엔티티 매핑 인프라)이지 계약 로직이 아니다** — `common.support` 에 두고 계약 패키지와 무관하다(TSK-01-03 `MdmTemporalBinder` 와 같은 층) |
| 04 테이블 7개 Flyway 두 방언 | SQLite: §3.1, §3.2(교차 FK 재생성). MSSQL: **사용자 결정(도커 금지)으로 실측 생략** — §3.11 DDL 대조 테스트(`testAll` 포함) + Verify 의 줄 단위 DDL 리뷰로 대체. §3.8 은 작성만 하고 게이트에서 돌리지 않는다 |
| 엔티티 | §3.3, §3.12 (범위 5개 = D2, §3.5-7). §3.8-6 은 게이트 비실행 |
| 선분 조작 서비스 인터페이스(카테고리 모델·ID 이름 공간은 전사 계약 재사용) | §6.1 `MasterCodeSegmentService`, §3.4, §3.5-5·6. ID 이름 공간은 `MaruIdNamespace`(MASTER_CODE) 를 그대로 쓰며 구현은 TSK-06-02(`MdmCodeRepository.existsById`) — 새 타입을 만들지 않는다 |
| 확정 검사 SPI(diff·검사 8항) 구현 대상 선언 | §6.1 `MasterCodeConfirmCheckSpi`·`MasterCodeConfirmCheckItem`·`MasterCodeConfirmCheckReport`·`MasterCodeDiffConventions`, §3.4, §3.5-1·3 |
| naming-dialect-rules 인계 #2·#16·#19(04) | SQLite 쪽만 닫는다: §3.1-11·12, §3.3-4. MSSQL 쪽은 도커 금지로 `실측 필요` 유지, 텍스트 수준은 §3.11-8·9 가 확인 |
| TSK-01-03 인계 ③(시나리오 키트 실제 표) | §3.7 SQLite 판(게이트). MSSQL 판은 게이트 비실행 |
| TSK-04-01 D1 인계(`FK_TB_MDM_DOMAIN_CODE`) | §3.1-13, §3.2, §3.11-4(MSSQL `ALTER` 텍스트) |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것 (규칙 · 잡는 테스트 · 변이 예)

1. **V9 는 7테이블을 만든다**(`TB_MDM_CODE`·`_SYSTEM`·`_VER`·`_ITEM`·`_CATE`·`_CATE_ITEM`·`_RECV`). 잡는 테스트: §3.1-2, §3.11-1. 변이: SQLite `TB_MDM_CODE_RECV` 블록 삭제 → §3.1-2·12 빨강. MSSQL 만 삭제 → §3.11-1 빨강.
2. **두 방언 모두 파일명 `V9__create_mdm_master_code.sql` — origin/dev 머지 뒤 두 방언 최대 버전(V8) + 1 이다**(D1. 당초 팀장 배정 V6 이었고 2026-09-24 팀장 정정으로 V9 로 재채번). §3.1-1, `MdmFlywayVersionParityTest`, §2 수정 4개. 변이: SQLite 만 V9 → 패리티 테스트 빨강. `V7__…` 로 개명 → `MdmSharedContractMigrationTest` 집합 빨강.
3. **선분 칼럼 `FROM_VER`·`TO_VER` 는 NOT NULL, `TO_VER` 기본값 9999**(ITEM·CATE·CATE_ITEM, 04:32). §3.1-5, §3.3-1. 변이: `DEFAULT 9999` 제거 → 원시 INSERT 가 NOT NULL 위반으로 빨강. 엔티티 `toVer` 초기값 제거 → §3.3-1 빨강.
4. **버전 칼럼은 `DECIMAL(7,3)`/`NUMERIC(7,3)`**(`VER`·`FROM_VER`·`TO_VER`·`RESTORED_FROM`·RECV `VER`, 04:271·994, 규칙표 #17). §3.1-4, §3.11-9·10. 변이: SQLite `NUMERIC(9,3)` → §3.1-4 빨강, MSSQL `DECIMAL(9,3)` → §3.11-9 빨강.
5. **PK**: CODE(MARU_CODE_ID) · CODE_SYSTEM(MARU_CODE_ID,SYSTEM_CODE) · VER(MARU_CODE_ID,VER) · ITEM(MARU_CODE_ID,CODE,FROM_VER) · CATE(MARU_CODE_ID,CATE_ID,FROM_VER) · CATE_ITEM(MARU_CODE_ID,CATE_ID,CODE,FROM_VER) · RECV(RECV_ID). §3.1-3, §3.3-2(82@1.000·82@1.001 두 행). 변이: ITEM PK 에서 FROM_VER 제거 → §3.3-2 두 번째 저장이 PK 위반으로 빨강.
6. **FK 대상**: VER·ITEM·CATE·CATE_ITEM·CODE_SYSTEM·RECV 의 `MARU_CODE_ID → TB_MDM_CODE`, ITEM·CATE·CATE_ITEM 의 `(MARU_CODE_ID, FROM_VER) → TB_MDM_CODE_VER(MARU_CODE_ID, VER)`, `TB_MDM_CODE.SOURCE_SYSTEM`·`CODE_SYSTEM.SYSTEM_CODE`·`RECV.SOURCE_SYSTEM → TB_MDM_SYSTEM`(04:957). 이름 `FK_TB_MDM_CODE_SYSTEM_SRC`(형제 표 이름과 겹침 회피, TSK-02-03 §6.0). §3.1-8, §3.3-5, §3.11-4(MSSQL 강제 동작은 **MSSQL 실측 생략 — DDL 리뷰로 확인** §3.13-2). 변이: MSSQL 만 FK 제거 → §3.11-4 빨강. SQLite `FK_TB_MDM_CODE_ITEM_VER` 제거 → `FROM_VER=1.002` INSERT 통과로 빨강.
7. **FK 를 걸지 않는 자리**: CATE_ITEM → CATE·ITEM, 모든 `TO_VER`(04:958 — `9999` 는 실제 버전이 아니다). §3.1-9. 변이: `CATE_ITEM(MARU_CODE_ID,CODE,FROM_VER) → ITEM` FK 추가 → ITEM 없는 CATE_ITEM INSERT 거부로 빨강.
8. **V9 어디에도 `ON DELETE CASCADE` 가 없다.** §3.1-10, §3.11-7. 변이: MSSQL 에만 CASCADE → §3.11-7 빨강. SQLite `FK_TB_MDM_CODE_ITEM_VER` 에 CASCADE → VER DELETE 가 성공해 빨강.
9. **CHECK 전부 유지**(§6.0 목록, `LVL_CNT BETWEEN 0 AND 5` 경계 포함). §3.1-6, §3.11-5. 변이: MSSQL CHECK 식만 바꿈 → §3.11-5 빨강. SQLite `BETWEEN 0 AND 6` → LVL_CNT=6 통과로 빨강. `CK_TB_MDM_CODE_ITEM_CODE` 제거 → `'A B'` 통과로 빨강.
10. **DDL 기본값**: CODE `STATUS='CREATED'`·`LVL_CNT=0`·`LAST_CHG_SEQ=0`, VER `STATUS='DRAFT'`·`EMERGENCY_YN='N'`·`ROW_VERSION=0`, `TO_VER=9999`. 엔티티 필드 초기값이 같은 값이다. §3.1-5, §3.3-1. 변이: `MdmCodeVer.emergencyYn` 초기값 제거 → Hibernate 가 NULL 을 넣어 NOT NULL 위반으로 빨강.
11. **`AUD_VER` 예외**: `TB_MDM_CODE_VER`·`TB_MDM_CODE_RECV` 만 감사 카운터가 `AUD_VER`, 나머지 5표는 `VER`. `MdmCodeVer` 는 `@AttributeOverride(name="version", column=@Column(name="AUD_VER"))`. §3.1-2, §3.3-3, §3.7. 변이: `@AttributeOverride` 제거 → 감사 `version` 과 업무 `ver` 가 같은 `VER` 칼럼에 매핑돼 부팅 실패(중복 칼럼) → 그 컨텍스트의 테스트 전부 빨강.
12. **SQLite 감사 `VER`/`AUD_VER` 는 `BIGINT`**(F5). §3.1-4. 변이: ERD 대로 `INTEGER` → 빨강.
13. **`ROW_VERSION BIGINT NOT NULL DEFAULT 0`(D5), 엔티티는 `@Version` 이 아닌 `long rowVersion`**(증가는 `VersionWriteGuard`·`VersionRowStore` 몫). §3.1-4, §3.3-3, §3.7. 변이: `@Version` 부착 → §3.3-3 의 rowVersion 불변 단언 빨강.
14. **`MdmCode` 는 `LAST_CHG_SEQ` 를 매핑하지 않는다**(D2). §3.3-6, §3.5-7. 변이: `@Column(name="LAST_CHG_SEQ") long lastChgSeq` 추가 → §3.5-7 빨강.
15. **엔티티는 5개뿐 — `TB_MDM_CODE_SYSTEM`·`TB_MDM_CODE_RECV` 엔티티·리포지토리를 만들지 않는다**(D2). §3.5-7. 변이: `MdmCodeRecv` 엔티티 추가 → 빨강.
16. **엔티티는 JPA 연관관계를 쓰지 않는다**(원시 ID 필드). `MdmEntityArchitectureTest`(자동 적용). 변이: `MdmCodeItem` 에 `@ManyToOne MdmCodeVer` → 빨강.
17. **MSSQL 코드·키 칼럼은 `COLLATE Latin1_General_100_BIN2`**(§6.0 BIN2 표시, 규칙표 #19). §3.11-8(게이트). 변이: ITEM `CODE` 의 COLLATE 제거 → §3.11-8 빨강. **MSSQL 실측 생략 — DDL 리뷰로 확인**(실행 동작 'A1'/'a1' 은 §3.8-1 이 보지만 게이트 비실행, §3.13-7).
18. **MSSQL `DEF_EXPR` 는 `NVARCHAR(MAX)`**(D6). §3.11-9(게이트). 변이: ERD 대로 `VARCHAR(MAX)` → §3.11-9 빨강. **MSSQL 실측 생략 — DDL 리뷰로 확인**(한글 왕복 실측 §3.8-4 는 게이트 비실행, §3.13-7).
19. **`FK_TB_MDM_DOMAIN_CODE` 를 두 방언 모두 V9 에서 건다**(D3). SQLite 재생성은 V3(또는 머지 시점 직전 버전)의 `TB_MDM_DOMAIN` 정의를 칼럼·CHECK·FK·인덱스·AUTOINCREMENT 상한까지 보존한다. §3.1-13, §3.2-A, §3.11-4(MSSQL FK 강제 실측은 생략 — **MSSQL 실측 생략, DDL 리뷰로 확인** §3.13-1·2), 기존 `MdmTermDomainColumnMigrationTest` 전체. 변이 ①: FK 줄 누락 → §3.1-13·§3.2-A④ 빨강. ②: `CREATE INDEX IX_TB_MDM_DOMAIN_PARENT` 재생성 누락 → §3.2-A③ 과 V3 인덱스 테스트 빨강. ③: `sqlite_sequence` 보존 문장 누락 → §3.2-A② 빨강. ④: JSON CHECK 하나 누락 → §3.2-A③ 빨강.
20. **SQLite 재생성은 한 트랜잭션이다 — 실패하면 부분 적용이 남지 않는다**(D3). §3.2-B. 변이: `V9__…sql.conf` 로 `executeInTransaction=false` 를 주고 재생성을 파일 끝으로 옮긴다 → 실패 뒤 `TB_MDM_CODE` 가 남아 빨강.
21. **SQLite 엔티티 업무 일시 = 네이티브와 같은 19자 TEXT**(`'yyyy-MM-dd HH:mm:ss'`, `typeof=text`, D7, 규칙표 #16). §3.3-4, §3.6. 변이 ①: 컨버터 쓰기 형식에 `.SSS` 추가 → §3.3-4①·§3.6 빨강. ②: `application-local.yml` 의 contributor 줄 삭제 → `typeof=integer` 로 §3.3-4① 빨강, ④ 에서 `fromDb` 예외로 빨강.
22. **`MdmCodeVer` 의 `LocalDateTime` 세터는 초 단위로 자른다**(두 방언이 같은 값을 갖도록 — `MdmTemporalBinder` 와 같은 규칙). §3.12-1(게이트), §3.3-4②. 변이: 세터 절단 제거 → §3.12-1 빨강. **MSSQL 실측 생략 — DDL 리뷰로 확인**(MSSQL 반올림 실측 §3.8-3 은 게이트 비실행, §3.13-5. SQLite 왕복 §3.3-4② 는 컨버터도 자르므로 이 변이에 초록 — 그래서 §3.12 가 필요하다.)
23. **DECIMAL 키는 scale 무관하게 같고, 엔티티 게터는 scale 3 을 돌려준다**(F26). IdClass `equals`/`hashCode` 는 `compareTo`·`stripTrailingZeros()` 기반. §3.3-2, §3.12-2·3. 변이 ①: 게터 정규화 제거 → §3.12-2 와 SQLite `getVer()` 단언 빨강. ②: IdClass 에 `Objects.equals` 사용 → §3.12-3 빨강(§3.3-2 의 `findById` 가 함께 빨개지는지는 Build 가 관찰해 기록한다).
24. **계약 패키지 모양**: `contract.mastercode` 는 인터페이스(추상 메서드만)·enum·record(접근자만)·상수 클래스뿐, Spring·JPA·JDBC·엔티티·엔진에 의존하지 않는다. `MdmContractArchitectureTest`(자동 적용). 변이: `MasterCodeSegmentService` 에 `default` 메서드 추가 → 빨강. `MasterCodeItemValues` 에 `lvl(int)` 메서드 추가 → 빨강.
25. **전사 계약을 재정의·복제하지 않는다**(카테고리 종류·대상 칸·BASE·`.*`·ID 규칙·ID 이름 공간·버전 상태·마루 객체 상태·diff 종류). §3.5-5. 변이: `enum MasterCodeCateKind{REGEX,TABLE}` 추가 → 빨강. `MasterCodeConventions.BASE_CATE_ID="BASE"` 추가 → 빨강.
26. **선분 조작 서비스는 ROW_VERSION 을 받지도 올리지도 않고, DRAFT 삭제 복구를 다시 선언하지 않는다**(D8). §3.5-6. 변이: `addItem(VersionRef, long expectedRowVersion, …)` → 빨강. `deleteDraft(VersionRef)` 추가 → 빨강. (구현이 실제로 ROW_VERSION 을 올리지 않는지는 이 Task 에 구현이 없어 06-03 이 지킨다 — 계약 Javadoc 으로 넘긴다.)
27. **확정 검사 8항 표**(10행: 1·2·2-1·2-2·3~8, 심각도·최초 버전 면제 3·4·공통 검사 3·보류 5). §3.5-1. 변이: 2-1 을 `REJECT` 로 → 빨강. 5항 `inScope=true` → 빨강.
28. **diff 키 규약: `{표}:{부분}[,{부분}]`, 구분자 `,` 는 cate_id·code 금지 문자**(D10). §3.5-3. 변이: `KEY_PART_SEPARATOR="/"` → 빨강.
29. **MASTER_CODE 확정 검사 SPI 구현은 target 당 하나**(`MasterCodeConfirmCheckSpi extends VersionConfirmCheckSpi`). `ContractStubCompileTest.확정_검사_SPI_구현이_모든_버전_대상을_하나씩_덮는다`(기존). 변이: `CONFIRM_CHECKS` 에 MASTER_CODE 스텁 하나 더 → 빨강.
30. **main 에 `MasterCodeSegmentService`·`MasterCodeConfirmCheckSpi` 구현 클래스를 넣지 않는다**(수용 기준). **알려진 커버리지 갭**(F22, TSK-05-01 불변 규칙 13 과 같음): 잡는 테스트가 없다. Verify 가 `git diff --name-status <기점>..HEAD` 를 §2 목록과 대조해 확인하고 결과를 보고한다.
31. **V9 버전 표·부모 표가 공통 버전 서비스의 고정 칼럼과 CHECK 를 만족한다**(F12). §3.7 SQLite 판(게이트), MSSQL 판은 게이트 비실행. 변이: `RELEASED_AT` 을 `RELEASE_AT` 으로 오타 → 확정 시나리오 빨강. `CK_TB_MDM_CODE_VER_APPLY` 를 `STATUS='DRAFT' OR APPLY_TO IS NULL` 처럼 틀리게 → 확정 시나리오 빨강.
32. **`RECV_ID` 는 서버 채번이고 지운 값을 재사용하지 않는다**(SQLite `AUTOINCREMENT`, MSSQL `IDENTITY(1,1)`, 규칙표 #2). §3.1-12, §3.11-9·10. 변이: SQLite `AUTOINCREMENT` 제거 → §3.1-12·§3.11-10 빨강. MSSQL `IDENTITY(1,1)` 제거 → §3.11-9 빨강**MSSQL 실측 생략 — DDL 리뷰로 확인**(단조 증가 실측 §3.8-2 는 게이트 비실행, §3.13-6).

---

## 6. 결정 상세

### 6.0 테이블 설계 (Build 가 그대로 옮길 최종 칼럼표)

**1차 텍스트는 ERD `docs/mdm/erd/04-master-code.{sqlite,mssql}.sql` 이다.** 칼럼 이름·순서·NULL·기본값·제약 이름·COLLATE 는 ERD 를 글자 그대로 옮기고, 아래 **갈라지는 곳**만 바꾼다.

| # | 갈라지는 곳 | 방언 | 근거 |
|---|---|---|---|
| G1 | 감사 `VER`(5표)·`AUD_VER`(VER·RECV) `INTEGER` → `BIGINT` | SQLite | F5 |
| G2 | `TB_MDM_CODE_VER.ROW_VERSION` `INTEGER`/`INT` → `BIGINT` (NOT NULL DEFAULT 0 유지, MSSQL `DF_TB_MDM_CODE_VER_ROW_VERSION`) | 두 방언 | D5 |
| G3 | `CK_TB_MDM_CODE_VER_APPLY` → `CHECK (STATUS = 'DRAFT' OR (APPLY_FROM IS NOT NULL AND (STATUS = 'REQUESTED' OR APPLY_TO IS NOT NULL)))` | 두 방언 | D4 |
| G4 | `TB_MDM_CODE_CATE.DEF_EXPR` `VARCHAR(MAX)` → `NVARCHAR(MAX)` | MSSQL | D6 |
| G5 | 파일 끝에 `FK_TB_MDM_DOMAIN_CODE` 추가(SQLite 재생성 §6.0.8, MSSQL `ALTER`) | 두 방언 | D3 |

파일 머리 주석에 G1~G5 를 V4 파일 머리처럼 번호로 적는다("1차 텍스트는 ERD, 이 Task 가 갈라진 지점은 …").

**6.0.1 TB_MDM_CODE** — PK `PK_TB_MDM_CODE`(MARU_CODE_ID) · FK `FK_TB_MDM_CODE_SYSTEM_SRC`(SOURCE_SYSTEM→TB_MDM_SYSTEM) · CK `CK_TB_MDM_CODE_STATUS` IN('CREATED','INUSE','DEPRECATED'), `CK_TB_MDM_CODE_SRC_KIND` IN('MDM','EXTERNAL'), `CK_TB_MDM_CODE_SRC_SYS`, `CK_TB_MDM_CODE_LVL_CNT` BETWEEN 0 AND 5

| 칼럼 | SQLite | MSSQL | NULL | 기본값 | 엔티티 필드 |
|---|---|---|---|---|---|
| MARU_CODE_ID | VARCHAR(50) | VARCHAR(50) BIN2 | NOT NULL(PK) | - | `String maruCodeId`(@Id) |
| MARU_CODE_NAME | TEXT | NVARCHAR(100) | NOT NULL | - | `String maruCodeName` |
| STATUS | VARCHAR(20) | VARCHAR(20) BIN2 | NOT NULL | 'CREATED' | `String status = "CREATED"` |
| SOURCE_KIND | VARCHAR(20) | VARCHAR(20) BIN2 | NOT NULL | - | `String sourceKind` |
| SOURCE_SYSTEM | VARCHAR(20) | VARCHAR(20) BIN2 | NULL | - | `String sourceSystem` |
| DESCRIPTION | TEXT | NVARCHAR(MAX) | NULL | - | `String description` |
| ATTR01_NAME..ATTR10_NAME | TEXT | NVARCHAR(100) | NULL | - | `String attr01Name`..`attr10Name` |
| LVL_CNT | INTEGER | INT | NOT NULL | 0 | `int lvlCnt` |
| LAST_CHG_SEQ | INTEGER | BIGINT | NOT NULL | 0 | **미매핑**(D2) |
| +감사 9(VER) | | | | | `CactusAuditEntity` |

**6.0.2 TB_MDM_CODE_SYSTEM**(보류, DDL 만) — PK (MARU_CODE_ID,SYSTEM_CODE) · FK `FK_TB_MDM_CODE_SYSTEM_CODE`(→CODE), `FK_TB_MDM_CODE_SYSTEM_SYSTEM`(→TB_MDM_SYSTEM). 칼럼 MARU_CODE_ID VARCHAR(50)[BIN2], SYSTEM_CODE VARCHAR(20)[BIN2], DESCRIPTION TEXT/NVARCHAR(MAX), +감사 9(VER). 엔티티 없음.

**6.0.3 TB_MDM_CODE_VER** — PK (MARU_CODE_ID,VER) · FK `FK_TB_MDM_CODE_VER_CODE` · CK `_KIND` IN('MAJOR','MINOR'), `_STATUS` IN(5종), `_APPLY`(G3), `_EMERGENCY_YN` IN('Y','N')

| 칼럼 | SQLite | MSSQL | NULL | 기본값 | 엔티티 필드 |
|---|---|---|---|---|---|
| MARU_CODE_ID | VARCHAR(50) | VARCHAR(50) BIN2 | NOT NULL(PK) | - | `String maruCodeId`(@Id) |
| VER | NUMERIC(7,3) | DECIMAL(7,3) | NOT NULL(PK) | - | `BigDecimal ver`(@Id, precision 7 scale 3) |
| VER_KIND | VARCHAR(20) | VARCHAR(20) BIN2 | NOT NULL | - | `String verKind` |
| RESTORED_FROM | NUMERIC(7,3) | DECIMAL(7,3) | NULL | - | `BigDecimal restoredFrom` |
| STATUS | VARCHAR(20) | VARCHAR(20) BIN2 | NOT NULL | 'DRAFT' | `String status = "DRAFT"` |
| OWNER_ID | VARCHAR(50) | VARCHAR(50) BIN2 | NULL | - | `String ownerId` |
| APPLY_FROM / APPLY_TO | TEXT | DATETIME2(0) | NULL | - | `LocalDateTime applyFrom/applyTo`(세터 초 절단) |
| DESCRIPTION | TEXT | NVARCHAR(MAX) | NULL | - | `String description` |
| REQUESTED_BY | VARCHAR(50) | VARCHAR(50) BIN2 | NULL | - | `String requestedBy` |
| REQUESTED_AT | TEXT | DATETIME2(0) | NULL | - | `LocalDateTime requestedAt` |
| EMERGENCY_YN | VARCHAR(1) | VARCHAR(1) BIN2 | NOT NULL | 'N' | `String emergencyYn = "N"` |
| EMERGENCY_REASON | TEXT | NVARCHAR(MAX) | NULL | - | `String emergencyReason` |
| APPROVED_BY | VARCHAR(50) | VARCHAR(50) BIN2 | NULL | - | `String approvedBy` |
| APPROVED_AT / RELEASED_AT / CANCELLED_AT | TEXT | DATETIME2(0) | NULL | - | `LocalDateTime approvedAt/releasedAt/cancelledAt` |
| REJECT_REASON / CANCEL_REASON | TEXT | NVARCHAR(MAX) | NULL | - | `String rejectReason/cancelReason` |
| ROW_VERSION | **BIGINT**(G2) | **BIGINT**(G2) | NOT NULL | 0 | `long rowVersion`(`@Version` 아님) |
| +감사 8 + **AUD_VER BIGINT**(G1) | | | | | `CactusAuditEntity` + `@AttributeOverride(name="version", column=@Column(name="AUD_VER"))` |

**6.0.4 TB_MDM_CODE_ITEM** — PK (MARU_CODE_ID,CODE,FROM_VER) · FK `FK_TB_MDM_CODE_ITEM_CODE`, `FK_TB_MDM_CODE_ITEM_VER`((MARU_CODE_ID,FROM_VER)→VER) · CK `CK_TB_MDM_CODE_ITEM_CODE`(`CODE NOT LIKE '% %' AND CODE NOT LIKE '%,%'`)

| 칼럼 | SQLite | MSSQL | NULL | 기본값 | 엔티티 필드 |
|---|---|---|---|---|---|
| MARU_CODE_ID / CODE | VARCHAR(50) | VARCHAR(50) BIN2 | NOT NULL(PK) | - | `String maruCodeId`, `String code`(@Id) |
| FROM_VER | NUMERIC(7,3) | DECIMAL(7,3) | NOT NULL(PK) | - | `BigDecimal fromVer`(@Id) |
| TO_VER | NUMERIC(7,3) | DECIMAL(7,3) | NOT NULL | 9999 | `BigDecimal toVer = MasterCodeConventions.OPEN_TO_VER` |
| NAME / ALTER_NAME | TEXT | NVARCHAR(100) | NULL | - | `String name/alterName` |
| SEQ | INTEGER | INT | NULL | - | `Integer seq` |
| DESCRIPTION | TEXT | NVARCHAR(MAX) | NULL | - | `String description` |
| LVL1..LVL5 | VARCHAR(50) | VARCHAR(50) BIN2 | NULL | - | `String lvl1`..`lvl5` |
| ATTR01..ATTR10 | TEXT | NVARCHAR(500) | NULL | - | `String attr01`..`attr10` |
| +감사 9(VER BIGINT) | | | | | `CactusAuditEntity` |

**6.0.5 TB_MDM_CODE_CATE** — PK (MARU_CODE_ID,CATE_ID,FROM_VER) · FK `_CODE`, `_VER` · CK `CK_TB_MDM_CODE_CATE_KIND` IN('REGEX','TABLE'), `CK_TB_MDM_CODE_CATE_DEF`(REGEX ⇒ DEF_EXPR·DEF_TARGET 비NULL, TABLE ⇒ 둘 다 NULL)

| 칼럼 | SQLite | MSSQL | NULL | 기본값 | 엔티티 필드 |
|---|---|---|---|---|---|
| MARU_CODE_ID / CATE_ID | VARCHAR(50) | VARCHAR(50) BIN2 | NOT NULL(PK) | - | @Id 두 개 |
| FROM_VER | NUMERIC(7,3) | DECIMAL(7,3) | NOT NULL(PK) | - | `BigDecimal fromVer`(@Id) |
| TO_VER | NUMERIC(7,3) | DECIMAL(7,3) | NOT NULL | 9999 | `BigDecimal toVer = OPEN_TO_VER` |
| CATE_NAME | TEXT | NVARCHAR(100) | NULL | - | `String cateName` |
| DEF_KIND | VARCHAR(20) | VARCHAR(20) BIN2 | NOT NULL | - | `String defKind` |
| DEF_EXPR | TEXT | **NVARCHAR(MAX)**(G4) | NULL | - | `String defExpr` |
| DEF_TARGET | VARCHAR(20) | VARCHAR(20) BIN2 | NULL | - | `String defTarget` |
| DESCRIPTION | TEXT | NVARCHAR(MAX) | NULL | - | `String description` |
| +감사 9(VER BIGINT) | | | | | |

**6.0.6 TB_MDM_CODE_CATE_ITEM** — PK (MARU_CODE_ID,CATE_ID,CODE,FROM_VER) · FK `_CODE`, `_VER` 만(CATE_ID·CODE 는 FK 없음, 불변 규칙 7). 칼럼 MARU_CODE_ID·CATE_ID·CODE VARCHAR(50)[BIN2], FROM_VER·TO_VER(9999) NUMERIC/DECIMAL(7,3), +감사 9(VER BIGINT). 엔티티 `MdmCodeCateItem`(@Id 4개, `toVer = OPEN_TO_VER`).

**6.0.7 TB_MDM_CODE_RECV**(보류, DDL 만) — ERD 그대로 + G1. SQLite `RECV_ID INTEGER CONSTRAINT PK_TB_MDM_CODE_RECV PRIMARY KEY AUTOINCREMENT`, MSSQL `RECV_ID BIGINT IDENTITY(1,1)` + `PK_TB_MDM_CODE_RECV`. `"RESULT"`/`[RESULT]` 인용. FK `_CODE`(MARU_CODE_ID NULL 허용), `_SYSTEM`. CK `_REQ`, `_RESULT`. 엔티티 없음.

**BIN2 칼럼 목록**(`MdmMasterCodeExpectations.BIN2_COLUMNS`, MSSQL): CODE{MARU_CODE_ID, STATUS, SOURCE_KIND, SOURCE_SYSTEM}, CODE_SYSTEM{MARU_CODE_ID, SYSTEM_CODE}, VER{MARU_CODE_ID, VER_KIND, STATUS, OWNER_ID, REQUESTED_BY, EMERGENCY_YN, APPROVED_BY}, ITEM{MARU_CODE_ID, CODE, LVL1..LVL5}, CATE{MARU_CODE_ID, CATE_ID, DEF_KIND, DEF_TARGET}, CATE_ITEM{MARU_CODE_ID, CATE_ID, CODE}, RECV{MARU_CODE_ID, SOURCE_SYSTEM, SOURCE_REF, REQ_KIND, RESULT}.

**MSSQL 파일 순서**: CODE → CODE_SYSTEM → CODE_VER → CODE_ITEM → CODE_CATE → CODE_CATE_ITEM → CODE_RECV → `ALTER TABLE TB_MDM_DOMAIN ADD CONSTRAINT FK_TB_MDM_DOMAIN_CODE FOREIGN KEY (MARU_CODE_ID) REFERENCES TB_MDM_CODE (MARU_CODE_ID);`. 부모 `TB_MDM_SYSTEM`(V2)·`TB_MDM_DOMAIN`(V3)이 이미 있고 타입이 맞는다(`SYSTEM_CODE VARCHAR(20) BIN2`, `TB_MDM_DOMAIN.MARU_CODE_ID VARCHAR(50) BIN2` = `TB_MDM_CODE.MARU_CODE_ID`). 기본값 제약은 ERD 의 `DF_…` 이름을 그대로 쓴다. SQLite 도 같은 순서로 두고 재생성을 파일 끝에 둔다.

**6.0.8 SQLite `TB_MDM_DOMAIN` 재생성**(D3, F7). 한 Flyway 트랜잭션 안에서(설정 파일 없이 기본 동작) 아래 순서로 쓴다. `PRAGMA defer_foreign_keys` 는 쓰지 않는다 — 참조 행이 있으면 DROP 에서 곧바로 실패하는 편이 원인이 분명하다.
1. `CREATE TABLE TB_MDM_DOMAIN_NEW (...)` — **직전 버전의 `TB_MDM_DOMAIN` 정의를 글자 그대로** 옮긴다(지금은 V3 sqlite:58-92: 칼럼 순서·타입·NULL·DEFAULT·인라인 JSON CHECK 4개·`FK_TB_MDM_DOMAIN_DOMAIN`(자기참조는 `REFERENCES TB_MDM_DOMAIN`)·`FK_TB_MDM_DOMAIN_UNIT`·`CK_TB_MDM_DOMAIN_CODE`·`CK_TB_MDM_DOMAIN_FLAG`·`PK_TB_MDM_DOMAIN … AUTOINCREMENT`). V3 의 "걸지 않는다" 주석 자리에 `CONSTRAINT FK_TB_MDM_DOMAIN_CODE FOREIGN KEY (MARU_CODE_ID) REFERENCES TB_MDM_CODE (MARU_CODE_ID)` 를 넣는다.
2. `INSERT INTO TB_MDM_DOMAIN_NEW (<칼럼 전부 명시>) SELECT <같은 목록> FROM TB_MDM_DOMAIN;`
3. AUTOINCREMENT 상한 보존(F7-④): 옛 표의 `sqlite_sequence.seq` 를 새 표 이름으로 옮긴다 — 새 표 행이 없으면 `INSERT … SELECT … WHERE NOT EXISTS`, 있으면 `UPDATE`(옛 seq 가 더 클 때만 올리는 `MAX` 형태). 옛 표가 한 번도 행을 가진 적이 없으면 두 문장 모두 아무것도 하지 않는다.
4. `DROP TABLE TB_MDM_DOMAIN;` 5. `ALTER TABLE TB_MDM_DOMAIN_NEW RENAME TO TB_MDM_DOMAIN;` 6. `CREATE INDEX IX_TB_MDM_DOMAIN_PARENT ON TB_MDM_DOMAIN (PARENT_DOMAIN_ID);`
- 결과 `sqlite_master.sql` 은 `CREATE TABLE "TB_MDM_DOMAIN" (` 로 시작한다(SQLite 가 개명 때 따옴표를 붙인다). V3 테스트는 `CONSTRAINT PK_…` 포함 여부만 보므로 영향이 없다(Build 가 전체 스위트로 확인).
- **머지 시점 확인 의무**: V9 앞에 다른 Task 의 마이그레이션(V4~V8)이 `TB_MDM_DOMAIN` 을 바꿨다면 1번 DDL 을 그 정의로 맞춘다. §3.2-A③ 이 누락을 잡는다.

### 6.1 계약 (`com.dongkuk.dmes.mdm.contract.mastercode`)

패키지 규칙(F20)을 그대로 따른다: 인터페이스는 추상 메서드만, record 는 접근자만, enum 은 인자 없는 접근자만, 상수 클래스는 `final`·`private` 생성자·`static final` 필드뿐, 외부 의존은 `java.*`·`contract.{category,version,common}` 만. 아래는 모양 명세이며 Javadoc 에 적을 계약 문장을 함께 적는다.

```java
/** 04 선분·번호 상수 — 원천 04:32·106·271-278. */
public final class MasterCodeConventions {
    public static final BigDecimal FIRST_VER = new BigDecimal("1.000");         // 최초 버전(04:95)
    public static final BigDecimal OPEN_TO_VER = new BigDecimal("9999.000");    // 열린 행 to_ver(04:32). 실제 버전이 아니다
    public static final int MAX_MINOR = 999;                                    // 04:277
    public static final int MAX_MAJOR = 9998;                                   // 9999 는 발급하지 않는다(04:278)
    public static final int LVL_CNT_MIN = 0, LVL_CNT_MAX = 5, LVL_CNT_DEFAULT = 0;   // 04:106
    public static final int LVL_SLOTS = 5, ATTR_SLOTS = 10;
    /** 코드값·계층 칸 값 금지 문자(콤마·공백, 04:109·197). maru_code_id·cate_id 규칙은 MaruIdRules 를 쓴다. */
    public static final String CODE_FORBIDDEN_CHAR_PATTERN = "[,\\s]";
    private MasterCodeConventions() {}
}

public enum MasterCodeSourceKind { MDM, EXTERNAL }          // 04:82. EXTERNAL 원천 등록은 보류(PRD §2 규칙 7)
public enum MasterCodeVerKind { MAJOR, MINOR }              // 04:279

/** 선분(from_ver·to_ver)을 갖는 세 표 — 04:37. */
public enum MasterCodeSegmentTable {
    ITEM("TB_MDM_CODE_ITEM"), CATE("TB_MDM_CODE_CATE"), CATE_ITEM("TB_MDM_CODE_CATE_ITEM");
    public String physicalTable() { … }                    // 인자 없는 접근자
}

/** 코드 행의 선분 밖 값. lvls 는 길이 LVL_SLOTS(0번 = lvl1), attrs 는 길이 ATTR_SLOTS(0번 = attr01), 원소 null 허용. */
public record MasterCodeItemValues(String name, String alterName, Integer seq, String description,
                                   List<String> lvls, List<String> attrs) {}
public record MasterCodeItemRow(String code, BigDecimal fromVer, BigDecimal toVer, MasterCodeItemValues values) {}
public record MasterCodeCateRow(CategoryDefinition definition, BigDecimal fromVer, BigDecimal toVer) {}   // TSK-01-02 record 재사용
public record MasterCodeCateItemRow(String cateId, String code, BigDecimal fromVer, BigDecimal toVer) {}
/** 버전 V 의 모습 = from_ver <= V < to_ver 인 행(04:33). */
public record MasterCodeVersionView(VersionRef version, List<MasterCodeItemRow> items,
                                    List<MasterCodeCateRow> categories, List<MasterCodeCateItemRow> cateItems) {}
/** 되돌리기 대상 키. ITEM 이면 cateId null, CATE 면 code null, CATE_ITEM 이면 둘 다. */
public record MasterCodeSegmentKey(MasterCodeSegmentTable table, String cateId, String code) {}

/**
 * 선분 조작 서비스 — 원천 04 「구조」 행 조작·행 되돌리기, 「코드 삭제」 연쇄, 「이전 버전으로 복원」.
 * 구현 TSK-06-02(createBaseCategory·fillFrom)·06-03(코드 행)·06-04(카테고리). 모든 조작은 DRAFT V 에서만 한다
 * (아니면 MdmErrorCode.NOT_DRAFT). 호출자는 같은 트랜잭션에서 먼저 VersionWriteGuard.beginDraftWrite 를 부른다 —
 * 이 서비스는 ROW_VERSION 을 올리지 않는다(이중 증가 방지). DRAFT 삭제 때의 선분 복구는 VersionDraftDeletionSpi
 * (MASTER_CODE) 가 맡으며 이 인터페이스는 다시 선언하지 않는다. 새 행의 to_ver 는 항상 OPEN_TO_VER 다(04:64).
 * 한 버전 안에 같은 키의 행은 하나(04:47), 닫기는 이전 버전의 행에만(04:61), V 에서 만든 행을 지우면 닫지 않고 지운다(04:59).
 */
public interface MasterCodeSegmentService {
    MasterCodeVersionView viewAt(VersionRef version);
    /** 1.000 DRAFT 를 만들 때 BASE(REGEX, CategoryConventions.BASE_DEF_EXPR, CategoryOwner.MASTER_CODE.baseDefTarget()) 를 from_ver = V 로 만든다(04:95). */
    void createBaseCategory(VersionRef firstDraft);
    void addItem(VersionRef draft, String code, MasterCodeItemValues values);
    void changeItem(VersionRef draft, String code, MasterCodeItemValues values);
    /** 코드 삭제. 그 코드의 열린 TABLE CATE_ITEM 행도 같은 V 로 닫는다(04:489-496). 함께 닫은 cate_id 목록을 돌려준다. */
    List<String> removeItem(VersionRef draft, String code);
    /** BASE 는 MdmErrorCode.RESERVED_CATEGORY. */
    void addCategory(VersionRef draft, CategoryDefinition definition);
    void changeCategory(VersionRef draft, CategoryDefinition definition);
    /** TABLE 이면 그 CATE_ITEM 행을 모두 같은 V 로 닫는다(04:504). BASE 는 RESERVED_CATEGORY. */
    void closeCategory(VersionRef draft, String cateId);
    void addCategoryMembers(VersionRef draft, String cateId, Set<String> codes);
    void removeCategoryMembers(VersionRef draft, String cateId, Set<String> codes);
    /** V 의 변경 하나를 취소(04:50-57). ITEM 삭제를 되돌리면 함께 닫은 CATE_ITEM 도 9999 로 연다(04:498-500). */
    void revert(VersionRef draft, MasterCodeSegmentKey key);
    /** 복원 — sourceVer 와 V 직전 모습을 키마다 비교해 차이만 만든다(04:307-322). restored_from 기록은 호출자(06-02) 몫. */
    void fillFrom(VersionRef draft, BigDecimal sourceVer);
}

public enum MasterCodeCheckSeverity { REJECT, WARNING }
/** DELEGATED = 공통 서비스(ApplyFromOrderCheck)가 검사, DEFERRED = 보류(PRD §2 규칙 7), EXEMPT = 최초 버전 면제. */
public enum MasterCodeCheckStatus { PASSED, WARNED, REJECTED, EXEMPT, DELEGATED, DEFERRED }

/** 확정 검사 8항(원천 「상신 시 검사」 04:405-416, PRD FR-C5). 순서는 화면 표 순서다. */
public enum MasterCodeConfirmCheckItem {
    CODE_VALUE_CHARS("1", REJECT, false, false, true),
    CATEGORY_RESOLVE("2", REJECT, false, false, true),
    CATE_ITEM_CODE_MISSING("2-1", WARNING, false, false, true),
    CATEGORY_EMPTY("2-2", WARNING, false, false, true),
    APPLY_FROM_ORDER("3", REJECT, true, true, true),      // 규칙 7 로 "직전 RELEASED apply_from 보다 뒤"(F18)
    HAS_CHANGES("4", REJECT, true, false, true),
    DEPLOY_TARGET_EXISTS("5", WARNING, false, false, false),   // D9
    LVL_HIERARCHY("6", REJECT, false, false, true),
    ATTR_WITHOUT_LABEL("7", REJECT, false, false, true),
    LVL_BEYOND_CNT("8", REJECT, false, false, true);
    // 접근자: no(), severity(), firstVersionExempt(), sharedCheck(), inScope()
}

public record MasterCodeCheckItemResult(MasterCodeConfirmCheckItem item, MasterCodeCheckStatus status,
                                        List<MdmCheckIssue> issues) {}
public record MasterCodeConfirmCheckReport(VersionRef draft, List<MasterCodeCheckItemResult> results) {}

/**
 * 04 확정 검사 SPI 구현 대상(구현 TSK-06-05). target() 은 MASTER_CODE. check() 는 report() 의 REJECTED 이슈를
 * errors 로, WARNED 이슈를 warnings 로 편 것과 같아야 한다. report() 는 MasterCodeConfirmCheckItem 순서대로
 * 10행을 모두 담는다. MdmCheckIssue.code 는 항목 enum 의 name(), itemKey 는 MasterCodeDiffConventions 키다.
 * diff() 는 V 의 diff(from_ver = V 또는 to_ver = V 인 행, 04:48)를 세 표에 대해 돌려주고 SAME 을 내지 않는다.
 * 미적용 버전이 하나뿐이라(04:284) 이것이 곧 직전 RELEASED 대비 diff 다.
 */
public interface MasterCodeConfirmCheckSpi extends VersionConfirmCheckSpi {
    MasterCodeConfirmCheckReport report(ConfirmCheckRequest request);
}

/** VersionDiffEntry.key 와 MdmCheckIssue.itemKey 규약(D10). 키 = 표(MasterCodeSegmentTable.name()) + ":" + 부분.
 *  ITEM "ITEM:{code}", CATE "CATE:{cateId}", CATE_ITEM "CATE_ITEM:{cateId},{code}". 값 맵의 키는 물리 칼럼명
 *  (UPPER_SNAKE)이고 PK·FROM_VER·TO_VER·감사 칼럼은 넣지 않는다. */
public final class MasterCodeDiffConventions {
    public static final String TABLE_KEY_SEPARATOR = ":";
    public static final String KEY_PART_SEPARATOR = ",";
    private MasterCodeDiffConventions() {}
}
```

- 오류 코드는 기존 `MdmErrorCode` 만 인용한다(MDM002·MDM012). 저장 검사용 새 코드(콤마·공백, 계층 3검사, 구간 겹침 등)는 구현 Task(06-03·06-04)가 더한다 — 이 Task 가 TSK-01-02 소유 enum 을 고치지 않는다.
- `MasterCodeItemValues` 의 길이 검사·`lvl(int)` 같은 편의 메서드는 두지 않는다(불변 규칙 24).

### 6.2 엔티티 세부

- **세터 초 절단**(불변 규칙 22): `MdmCodeVer` 의 `LocalDateTime` 세터 6개는 `v == null ? null : v.truncatedTo(ChronoUnit.SECONDS)` 로 저장한다.
- **DECIMAL 정규화**(불변 규칙 23): `MdmCodeVer.getVer()/getRestoredFrom()`, `MdmCodeItem·MdmCodeCate·MdmCodeCateItem.getFromVer()/getToVer()` 는 `null` 이 아니면 `setScale(VersionTarget.MASTER_CODE.versionScale())` 를 돌려준다(scale 상수를 04 계약에 복제하지 않는다)(DECIMAL(7,3) 이라 반올림이 필요 없다 — 필요하면 `ArithmeticException` 으로 드러난다). IdClass 4개는 생성자에서 같은 정규화를 하고 `equals` 는 `BigDecimal.compareTo == 0`, `hashCode` 는 `stripTrailingZeros()` 로 계산한다.
- `@Column(precision = 7, scale = 3)` 을 DECIMAL 칼럼에 준다(검증용 표시, `ddl-auto: none`).
- **기본값 정본**(F27 ①): 엔티티 경로의 기본값 정본은 필드 초기값이다(`status="CREATED"`·`"DRAFT"`, `emergencyYn="N"`, `lvlCnt=0`, `rowVersion=0`, `toVer=MasterCodeConventions.OPEN_TO_VER`). DDL DEFAULT 는 네이티브 경로용으로 ERD 그대로 두며, 둘이 같은 값임을 테스트가 고정한다(불변 규칙 10). `@DynamicInsert` 로 DB DEFAULT 를 정본으로 삼는 방식은 리포 선례가 없어 쓰지 않는다.
- 예약어 칼럼: 04 에는 엔티티가 매핑하는 예약어 칼럼이 없다(`RESULT` 는 엔티티 없는 RECV 뿐). 백틱 인용이 필요 없다.
- `MdmCodeVer` 는 TSK-01-03 §7 "버전 엔티티를 들고 있다가 공통 서비스를 부른 뒤에는 다시 읽는다" 함정을 Javadoc 한 줄로 남긴다(네이티브 UPDATE 는 관리 엔티티를 갱신하지 않는다).

---

## 담당자 확인 필요 결정

### D1 — Flyway 버전 번호: 머지 뒤 최대 버전+1 = V9(당초 팀장 배정 V6, 2026-09-24 팀장 정정)
- **질문**: 04 마이그레이션의 버전 번호를 무엇으로 할 것인가. Design 시점 dev 에는 V1~V4 만 있었고, 규칙표 §5 기본 규칙("두 방언 합집합 최댓값 + 1")대로면 V5 였다. done 직전 origin/dev 머지(TSK-08-01 V8·TSK-04-03) 뒤 두 방언 최대는 V8 이다.
- **선택지**: (1) 팀장 배정대로 V6(V5 는 다른 Task 몫이라 비워 둔다). (2) 규칙표 기본값 V5. (3) 머지 시점에 다시 채번 — done 직전 origin/dev 를 머지한 뒤 mdm/sqlite·mdm/mssql 폴더의 최대 버전+1.
- **택한 것**: (3) **V9**. Design·Build 는 (1) 팀장 배정 V6 으로 진행했고, 2026-09-24 팀장이 배정표를 폐기하고 (3)으로 정정했다(재작업 기록 R2). DDL 본문은 그대로이고 파일명·주석·버전 기대 테스트만 바뀌었다.
- **근거와 근거 순위**: 오케스트레이터(팀장)가 병렬 워커 사이 번호 충돌을 피하려 번호를 배정했다(형제 `dflow-91b83c83` 에 V4 번호가 겹친 파일이 있어 V5 재배정 후보로 보인다, F1). 새 DB 에서 V5 빈 칸은 문제가 없다(F2). 남는 위험은 "V6 이 이미 적용된 DB 에 V5 가 뒤늦게 오는 경우"의 Flyway 검증 오류다 — 테스트는 모두 새 DB 라 영향이 없고, 운영 MSSQL 은 아직 배포 전이며, 로컬 `mdm.db` 는 메인 체크아웃에 지금 없다(F8). Build 는 이 동작을 **docker 없이 SQLite 로** 1회 실측해 Build 기록에 남긴다: 임시 디렉터리에 sqlite V1~V4·V6 을 복사해 `Flyway.configure().locations("filesystem:<tmp>")` 로 새 DB 에 적용 → 같은 디렉터리에 가짜 `V5__probe.sql`(빈 `SELECT 1;`)을 더해 다시 `migrate()` → 검증 오류 여부와 메시지를 기록한다. Flyway 검증 규칙은 방언과 무관하므로 SQLite 결과로 MSSQL 을 대신한다(테스트로 커밋하지 않는다 — Flyway 자체 동작의 기록이다). 근거 순위: 팀장 지시(작업 규칙) > 규칙표 기본값(리포 관례). **정정 근거(2026-09-24)**: 번호를 미리 배정하면 머지 순서에 따라 "큰 번호가 이미 적용된 DB 에 작은 번호가 뒤늦게 오는" 검증 오류(B3-1 실측)가 생긴다. 머지 뒤 최대+1 이면 새 버전이 늘 기존 버전 뒤에 오므로 이 위험이 없다. 대가는 V9 가 V8 뒤에 돌므로 V8 의 `TB_MDM_RULE_VAR.DOMAIN_ID` FK 가 SQLite 재생성을 견뎌야 한다는 점이며, §3.2-A⑤·B_업무기준이 고정한다.
- **반려되면 재작업할 방향**: 팀장이 다른 번호 N 을 정하면 두 방언 파일을 `VN__create_mdm_master_code.sql` 로 `git mv` 하고, `MdmMasterCodeExpectations.VERSION`·§2 의 버전 집합 고정 4곳·파일 경로 상수(`MdmMasterCodeDialectDdlParityTest`)·메서드 이름을 N 으로 바꾼다. N 이 V8 보다 작으면 §3.2 의 이전 버전 계산이 바뀌고 RULE_VAR 단언(A⑤·B_업무기준)은 V8 이 아직 없어 지운다. DDL 내용은 그대로다.

### D2 — 엔티티 범위 5개, `LAST_CHG_SEQ` 미매핑
- **질문**: spec "04 테이블 7개 Flyway 두 방언, 엔티티" 에서 보류 표(`TB_MDM_CODE_SYSTEM` 배포 대상·`TB_MDM_CODE_RECV` 수신 로그)도 엔티티화하는가. 활성 표 `TB_MDM_CODE` 의 배포 칸 `LAST_CHG_SEQ` 를 매핑하는가.
- **선택지**: (1) 5개(보류 2표 제외) + `LAST_CHG_SEQ` 미매핑. (2) 5개 + `LAST_CHG_SEQ` 를 `long` 으로 매핑(TSK-04-01 `chgSeq` 선례). (3) 7개 전부.
- **택한 것**: (1).
- **근거와 근거 순위**: D-019·ADR-0002 D7 이 보류 표는 "엔티티·리포지토리·서비스 없음", 활성 표 배포 칸은 "DEFAULT 0, 엔티티가 매핑하지 않는다(INSERT 가 기본값을 쓰게)"로 명시했다. TSK-04-01 D2 가 같은 문구의 spec 을 "엔티티는 업무 활성 표로 한정"으로 읽은 선례다(F17). 배포 순번 발급은 PRD §2 규칙 7 로 보류라 `LAST_CHG_SEQ` 를 읽고 쓸 소비자가 없다. TSK-04-01 이 02 의 `CHG_SEQ` 를 매핑한 것은 ADR 과 갈라진 리포 관례이지만, 결정 기록(D-019)을 이기는 근거가 되지 못한다. 근거 순위: 결정 기록·ADR(미승인 선행) + 선례 D2 > TSK-04-01 코드 관례.
- **반려되면 재작업할 방향**: (2)면 `MdmCode` 에 `@Column(name="LAST_CHG_SEQ", nullable=false) private long lastChgSeq;` 를 더하고 불변 규칙 14·§3.5-7 을 반대로 바꾼다. (3)이면 `MdmCodeSystem`(+Id)·`MdmCodeRecv` 엔티티·리포지토리 2세트를 더하고(RECV 는 `@GeneratedValue(IDENTITY)`, `[RESULT]` 예약어 칼럼은 백틱 인용), 불변 규칙 15 를 지운다.

### D3 — `FK_TB_MDM_DOMAIN_CODE` 를 V9 에서 두 방언 모두 건다(SQLite 는 한 트랜잭션 재생성)
- **질문**: TSK-04-01 D1 이 넘긴 02→04 FK 를 어떻게 거는가. SQLite 는 `ALTER TABLE ADD CONSTRAINT` 가 없다.
- **선택지**: (1) V9 에서 두 방언 모두 건다. SQLite 는 Flyway 기본 트랜잭션 안에서 `TB_MDM_DOMAIN` 재생성(§6.0.8). 참조 행(자식 컬럼·부모 도메인·V8 `TB_MDM_RULE_VAR`)이 있는 DB 에서는 V9 가 실패하고 롤백된다(F7). (2) SQLite 만 `V9__….sql.conf` 로 `executeInTransaction=false` 를 주고 `PRAGMA foreign_keys=OFF` → 재생성 → `ON`. 데이터가 있어도 되지만 실패 시 부분 적용이 남고, 풀링된 연결이 FK 강제 꺼진 채 반환될 위험이 있다. (3) SQLite 는 트리거(BEFORE INSERT/UPDATE·DELETE)로 FK 동작만 흉내 낸다 — 재생성이 없지만 `pragma foreign_key_list` 에 드러나지 않고 리포에 선례가 없다. (4) SQLite 는 영구히 앱 검사만, MSSQL 만 FK(TSK-04-01 D1 에서 "강도 중"으로 반려된 안). (5) 다음 Task 로 넘긴다.
- **택한 것**: (1).
- **근거와 근거 순위**: TSK-04-01 D1(decisions.md:281, dev 머지)이 "TSK-06-01 이 두 방언 모두 후행 추가, SQLite 는 재생성"으로 이 Task 에 넘겼고 V3 파일 주석도 같다(선행 산출물). 테스트·운영 신규 설치는 모두 빈 DB 라 (1)이 그대로 성립하고, 실패하더라도 트랜잭션 롤백으로 DB 가 V9 직전 상태 그대로 남는다(§3.2-B 가 고정). 로컬 `mdm.db` 는 지금 없다(F8). (2)는 실패 모드가 나쁘고, (3)(4)는 두 방언의 구조를 영구히 갈라놓으며, (5)는 인계를 어긴다. 근거 순위: 선행 산출물의 명시 인계 + 이 Design 의 실측(F7).
- **대가(보고 대상)**: ① 참조 행(업무기준 변수 포함)이 있는 로컬 SQLite DB 는 V9 적용이 실패한다 — `src/backend/data/mdm.db` 를 지우고 다시 띄우는 것이 안내다. ② 형제 TSK-04-03(`dflow-2ca988a4`)가 머지 뒤 `TB_MDM_CODE` 행 없이 CODE 도메인을 저장하면 FK 로 거부된다(F9) — 그 Task 는 시드에 `TB_MDM_CODE` 행을 먼저 넣어야 한다. ③ V9 앞에 `TB_MDM_DOMAIN` 을 바꾸는 마이그레이션이 들어오면 재생성 DDL 을 맞춰야 한다(§6.0.8, §3.2-A③ 이 잡는다). 팀장 확인으로 V5 는 `TB_MDM_TERM` 인덱스만 바꾸므로 지금은 origin/dev 최신 V3 정의를 그대로 옮긴다. ④ **팀장 지시로 D3 을 유지한다 — V9 에서 FK 를 빼지 않는다.** 이미 dev 에 있거나 Phase 06 전에 머지되는 TSK-04-03 픽스처가 이 FK 로 깨지면 D11 대로 이 Task 가 고친다.
- **반려되면 재작업할 방향**: (2)면 SQLite `V9__create_mdm_master_code.sql.conf`(`executeInTransaction=false`)를 더하고 재생성 앞뒤에 `PRAGMA foreign_keys=OFF/ON`·`PRAGMA foreign_key_check` 를 넣은 뒤 §3.2-B 를 "성공 + 행 보존"으로 바꾼다. (3)이면 재생성 대신 `TR_TB_MDM_DOMAIN_CODE_{INS,UPD}`·`TR_TB_MDM_CODE_DOMAIN_DEL` 트리거를 두고 §3.1-13·§3.2 를 트리거 기준으로 바꾼다. (4)(5)면 SQLite 재생성과 §3.2 를 지우고 MSSQL `ALTER` 만 남긴다.

### D4 — `CK_TB_MDM_CODE_VER_APPLY` 를 REQUESTED 행(apply_to NULL)이 통과하게 넓힌다
- **질문**: ERD CHECK(`STATUS='DRAFT' OR (APPLY_FROM·APPLY_TO 둘 다 비NULL)`)는 원천 04 의 REQUESTED 행(희망 apply_from 만 있고 apply_to 는 승인 때 채움)을 거부한다(F15). 그대로 옮기는가.
- **선택지**: (1) ERD 그대로. (2) `STATUS='DRAFT' OR (APPLY_FROM IS NOT NULL AND (STATUS='REQUESTED' OR APPLY_TO IS NOT NULL))`. (3) CHECK 를 없앤다.
- **택한 것**: (2).
- **근거와 근거 순위**: 원천 04:999-1000(spec prd-ref, 요구사항 층)이 REQUESTED 의 apply_to 를 NULL 로 정한다 — ERD(미승인 선행)보다 위다. 결재는 지금 보류지만 D-019 의 스키마 원칙("붙일 때 표를 다시 만들지 않는다") 때문에 지금 표가 원천 상태 전이를 받아야 한다. (2)는 ERD 가 막으려던 것(비 DRAFT·비 REQUESTED 행의 적용 구간 누락)을 그대로 막고, 공통 서비스의 확정 경로(DRAFT→RELEASED, 두 칸을 함께 씀)에는 영향이 없다(§3.7 이 증명). (3)은 보호를 버린다.
- **반려되면 재작업할 방향**: (1)이면 V9 두 방언의 CHECK 를 ERD 문장으로 되돌리고 §3.1-7 의 REQUESTED 통과 단언을 거부 단언으로 바꾼다(결재를 붙일 때 CHECK 를 바꾸는 마이그레이션이 필요해진다는 사실을 인계에 적는다).

### D5 — `ROW_VERSION` 은 `BIGINT`
- **질문**: ERD 는 `INT4`(INT), TSK-01-03 §7 ② 인계·픽스처·`VersionConventions`(long)는 `BIGINT` 다(F14). 어느 쪽인가.
- **선택지**: (1) `BIGINT`. (2) ERD 대로 `INT`/`INTEGER`.
- **택한 것**: (1).
- **근거와 근거 순위**: 둘 다 미승인 선행 산출물이다. TSK-01-03 이 공통 서비스 코드(`VersionRowStore` 가 `long` 으로 읽고 바인딩)와 함께 명시 인계한 값이고, 원천 04:1008 은 "정수"라고만 한다. `BIGINT` 는 Java `long` 과 맞고 범위 손해가 없다. 근거 순위: 같은 층에서는 실제로 이 칼럼을 쓰는 코드의 명시 인계가 우선.
- **반려되면 재작업할 방향**: 두 방언 `ROW_VERSION` 을 `INT`/`INTEGER` 로 되돌리고 §3.1-4 의 타입 단언을 바꾼다. 엔티티는 `long` 그대로 둬도 된다(읽기 호환).

### D6 — MSSQL `DEF_EXPR` 는 `NVARCHAR(MAX)`
- **질문**: ERD 는 `VARCHAR(MAX)`(ASCII 전용 토큰)다. REGEX 대상 칸이 ATTR·LVL(한글 가능)일 때 한글 정규식이 손실된다(F16). 그대로 두는가.
- **선택지**: (1) `NVARCHAR(MAX)`. (2) ERD 대로 `VARCHAR(MAX)`(정규식은 ASCII 로 쓰라고 안내).
- **택한 것**: (1).
- **근거와 근거 순위**: 원천 04:171·180 이 REGEX 대상 칸으로 ATTR01-ATTR10 을 명시하고, ATTR 값은 "받은 문자열 그대로"(04:165, MSSQL `NVARCHAR(500)`)다 — 그 값에 맞추는 정규식에 한글이 들어가는 것은 원천이 허용한 사용이다(요구사항 층 > ERD). TSK-05-01 F28 이 같은 손실을 실측했다. SQLite 는 `TEXT` 라 변경이 없다.
- **반려되면 재작업할 방향**: MSSQL `DEF_EXPR` 를 `VARCHAR(MAX)` 로 되돌리고 §3.8-4 를 지운 뒤, 06-04(카테고리 편집)에 "정규식에 비 ASCII 문자 저장 거부" 검사를 인계한다.

### D7 — SQLite 업무 일시 엔티티 매핑: mdm 전용 SQLite 컨버터(local 프로파일만) + 세터 초 절단
- **질문**: `TB_MDM_CODE_VER` 의 `LocalDateTime` 6칼럼을 엔티티가 SQLite 에 어떤 형식으로 쓰는가(F10, 규칙표 #16 이 이 Task 에 배정). 판별 제약: 엔티티가 쓴 문자열이 `MdmTemporalBinder.toDb` 출력과 글자 단위로 같아야 한다(TSK-01-03 §7 ④).
- **선택지**: (1) 컨버터 없음(Hibernate 기본 → epoch millis 정수, `fromDb` 가 읽지 못함). (2) mcm-core `SqliteTemporalConverterContributor` 재사용(mls 선례 — 쓰기 형식 `.SSS` 23자라 판별 제약 불합격, 경계 비교가 어긋난다). (3) mdm 전용 `MdmSqliteLocalDateTimeConverter`(쓰기 `MdmTemporalBinder.SQLITE_TEXT_PATTERN`) + `MdmSqliteTemporalContributor` 를 `application-local.yml` 에서만 켠다. (4) 엔티티 필드에 `@Convert` 를 두 방언 공통으로 붙인다(MSSQL 도 문자열 바인딩 — 암묵 변환에 기대는 편법). (5) 엔티티에서 일시 칼럼을 읽기 전용(`insertable=false, updatable=false`)으로 두고 쓰기는 네이티브로만.
- **택한 것**: (3). 두 방언이 같은 값을 갖도록 `MdmCodeVer` 세터가 초 단위로 자른다(MSSQL `DATETIME2(0)` 는 반올림한다).
- **근거와 근거 순위**: 판별 제약을 만족하는 안은 (3)·(4)·(5)다. (4)는 운영 MSSQL 에 문자열 바인딩을 들여오고, (5)는 06-02(DRAFT 생성)·06-05(확정 폼) 소비자가 엔티티로 일시를 쓸 수 없게 막는다. (3)은 mls·mcm 과 같은 구조(SQLite 에서만 컨트리뷰터 등록, MSSQL 무영향)이면서 형식을 네이티브 쪽 상수 하나로 묶는다. Hibernate 7.2 가 설정을 읽는 것은 확인했고(F11), 실제 적용은 §3.3-4 의 `typeof` 가 증명한다. 근거 순위: 선행 산출물 인계(TSK-01-03 §7 ④) + 리포 관례(mls·mcm 의 SQLite 전용 컨트리뷰터).
- **대가**: `autoApply` 라 앞으로 mdm 의 모든 `LocalDateTime` 엔티티 필드(05·06 포함)에 SQLite 에서 같은 형식이 적용된다 — 의도한 일관성이며 규칙표 #16 에 적는다. `Instant`(감사 `C_AT`)에는 적용되지 않는다(D-038 그대로).
- **반려되면 재작업할 방향**: (5)면 컨버터·컨트리뷰터·yml 줄을 지우고 `MdmCodeVer` 일시 필드를 읽기 전용으로 바꾸되, SQLite 에서 네이티브 19자 TEXT 를 Hibernate 가 읽는지 다시 실측한다. (2)면 mcm 컨트리뷰터를 쓰고 `MdmTemporalBinder.toDb` 를 `.SSS` 형식으로 바꿔 두 경로를 맞춘다(TSK-01-03 키트의 문자열 단언 `"yyyy-MM-dd HH:mm:ss"` 도 함께 바꾼다).

### D8 — 선분 조작 서비스의 경계와 모양
- **질문**: "선분 조작 서비스 인터페이스" 를 어떤 단위·경계로 선언하는가.
- **선택지**: (1) DRAFT V 단위의 행 조작 메서드(추가·수정·삭제·되돌리기·카테고리·소속·복원·BASE 생성·V 모습 조회). ROW_VERSION·사용자 확인·DRAFT 삭제 복구는 기존 계약(`VersionWriteGuard`·`VersionDraftDeletionSpi`)에 두고 다시 선언하지 않는다. (2) 화면 요청 단위(그리드 전체 저장 등)로 `expectedRowVersion`·`userId` 를 받는 메서드. (3) 조회(`viewAt`)를 뺀 조작만.
- **택한 것**: (1).
- **근거와 근거 순위**: 원천 04 「구조」 행 조작 표(04:40-65)가 행 단위 규칙을 정하고, 공통 서비스 계약(TSK-01-02·01-03)이 이미 row_version·소유자 검사를 `beginDraftWrite` 한 곳에 모았다 — (2)는 같은 검사를 두 번 하게 하거나 ROW_VERSION 이 두 번 오를 위험이 있다. `VersionDraftDeletionSpi` Javadoc 이 DRAFT 삭제 복구를 이미 04 몫으로 선언했다(재선언은 중복). "버전 V 의 모습"(04:33)은 선분 규칙의 읽기 쪽이라 06-03·06-04·06-05 가 모두 쓴다 — (3)이면 세 Task 가 같은 필터를 따로 쓴다. 코드 삭제 연쇄(04:489-500)는 삭제에만 붙는 규칙이라 `removeItem`·`revert` 계약 문장에 둔다. 근거 순위: 원천(요구사항 층) + 선행 계약(미승인).
- **반려되면 재작업할 방향**: (2)면 조작 메서드에 `long expectedRowVersion, String userId` 를 더하고 반환을 새 row_version 으로 바꾸며, Javadoc 을 "구현이 `beginDraftWrite` 를 부른다"로 고치고 불변 규칙 26·§3.5-6 을 지운다. (3)이면 `viewAt`·`MasterCodeVersionView` 를 지운다.

### D9 — 확정 검사 5항(배포 대상)은 선언하되 보류(`inScope=false`), 3항은 공통 서비스 위임, 항목별 보고 1메서드 추가
- **질문**: 8항 중 규칙 7 아래에서 실행할 수 없거나 공통 서비스가 이미 하는 항목을 어떻게 선언하는가. 화면(06-05)의 "검사 8항 결과 표(통과·경고·거부)"를 기존 `ConfirmCheckResult`(오류·경고 두 목록)로 그릴 수 있는가.
- **선택지**: (a) 5항: ① 선언 + `inScope=false`(보고 상태 `DEFERRED`) ② 실행(배포 대상 지정 화면이 보류라 항상 경고) ③ 선언하지 않음. (b) 3항: ① `sharedCheck=true`(상태 `DELEGATED`) ② SPI 가 다시 검사. (c) 보고: ① `MasterCodeConfirmCheckSpi extends VersionConfirmCheckSpi` 에 `report()` 추가 ② 기존 SPI 만.
- **택한 것**: (a)①, (b)①, (c)①.
- **근거와 근거 순위**: 5항은 `TB_MDM_CODE_SYSTEM` 을 읽어야 하는데 D-019 가 그 표에 "코드 없음"을 정했고, 배포 대상 지정 화면이 보류(PRD §5 표)라 ②는 모든 확정에 확인 불필요한 경고를 띄운다. 그래도 PRD FR-C5 가 "검사 8항"이라 적으므로 항목은 선언한다(`VersionTransition.inScope` 와 같은 모양의 선례). 3항은 `VersionConfirmCheckSpi` Javadoc 이 "반복하지 않는다"고 정했다(F18). 오류·경고 두 목록만으로는 "통과"와 "면제"·"보류"를 표에 그릴 수 없어 06-05 가 결국 같은 구조를 따로 만들게 된다 — 계약에 두면 06-05 의 화면·서비스가 한 모양을 쓴다. 근거 순위: 결정 기록 D-019·선행 계약 Javadoc + PRD FR-C5.
- **반려되면 재작업할 방향**: 5항을 실행하려면 `DEPLOY_TARGET_EXISTS` 의 `inScope` 를 true 로 바꾸고 06-05 가 `TB_MDM_CODE_SYSTEM` 을 네이티브로 읽는다(D-019 예외 기록 필요). 보고 메서드를 빼려면 `report()`·`MasterCodeCheckItemResult`·`MasterCodeConfirmCheckReport`·`MasterCodeCheckStatus` 를 지우고 스텁을 기존 SPI 로 되돌린다.

### D10 — diff 키 규약 `{표}:{부분}[,{부분}]`
- **질문**: 공유 record `VersionDiffEntry.key`(문자열 하나, TSK-01-02 소유)로 04 의 세 표(ITEM·CATE·CATE_ITEM) 변경을 어떻게 구분하는가.
- **선택지**: (1) 키에 표 이름을 접두한다: `ITEM:{code}`, `CATE:{cateId}`, `CATE_ITEM:{cateId},{code}`. 구분자 `,` 는 cate_id(`MaruIdRules`)·code(원천 04:197, `CK_TB_MDM_CODE_ITEM_CODE`) 양쪽 금지 문자. (2) 키는 code 만 두고 값 맵에 `"TABLE"` 항목을 넣는다. (3) `VersionDiffEntry` 에 표 필드를 더한다(공유 record 변경).
- **택한 것**: (1).
- **근거와 근거 순위**: (3)은 TSK-01-02 소유 공유 계약과 06(룰) 쪽 소비자를 함께 흔든다. (2)는 ADDED/REMOVED 에서 값 맵 하나가 null 이라(`VersionDiffEntry` Javadoc) 표 정보를 어느 맵에서 읽을지가 갈린다. (1)은 공유 record 를 바꾸지 않고, 금지 문자를 구분자로 써서 파싱이 모호하지 않다(표 이름에는 `:` 가 없다). 경고의 `MdmCheckIssue.itemKey` 에도 같은 키를 쓴다. 근거 순위: 선행 계약 불변(미승인이지만 코드 소비자 있음) + 원천 문자 규칙.
- **반려되면 재작업할 방향**: (2)면 `MasterCodeDiffConventions` 를 값 맵 키 상수(`TABLE_ENTRY="TABLE"`)로 바꾸고 스텁의 키를 `"P01"` 로 되돌린다. (3)이면 TSK-01-02 계약 개정으로 넘기고 이 Task 의 규약 상수는 지운다.

### D11 — V9 FK 로 깨지는 기존·병렬 Task 테스트 픽스처는 이 Task 가 고친다(04-03 브랜치는 건드리지 않는다)
- **질문**: `FK_TB_MDM_DOMAIN_CODE`(D3) 때문에 dev 에 있거나 머지 전 dev 로 들어오는 테스트(특히 TSK-04-03 domainMng 의 `MARU_CODE_ID` 사용 픽스처)가 깨지면 누가 어떻게 고치는가.
- **선택지**: (1) 이 Task 가 자기 브랜치에서 픽스처를 고친다 — 코드 참조가 필요하면 `TB_MDM_CODE` 행을 먼저 seed, 아니면 `MARU_CODE_ID` 를 NULL 로. (2) 04-03 브랜치를 직접 고친다. (3) FK 를 빼거나 미룬다(D3 반려). (4) 깨진 테스트를 두고 04-03 에 넘긴다.
- **택한 것**: (1). Phase 06 전 머지로 들어온 TSK-04-03 테스트 3파일은 모두 **seed** 로 고쳤다(재작업 기록 R1).
- **근거와 근거 순위**: 팀장 지시(작업 규칙)가 D3 유지·04-03 브랜치 직접 수정 금지·깨지는 픽스처는 이 Task 가 고침을 정했다. 게이트는 기준선 대비 신규 실패 0 이라 (4)는 게이트를 통과하지 못한다. 고칠 때 기대값을 완화하지 않는다 — 그 테스트가 원래 검증하던 도메인 동작은 그대로 두고 전제 데이터(부모 코드 행)만 채우거나, 코드 참조가 검증 대상이 아니면 NULL 로 바꾼다. 어느 쪽을 택했는지 파일마다 Build 기록과 decisions.md 에 남긴다.
- **반려되면 재작업할 방향**: (2)면 04-03 담당에 수정 목록을 넘기고 이 Task 의 해당 픽스처 변경을 되돌린다. (3)이면 D3 반려 방향을 따른다.

### D12 — 확정 검사 스텁을 계약 문장에 맞추려고 기존 스텁 테스트의 itemKey 기대값을 바꾼다(Build 추가)
- **질문**: §2 는 `MasterCodeConfirmCheckStub` 을 넓혀도 기존 단언(경고 `itemKey()=="P01"`)이 그대로 통과한다고 적었다. 그런데 같은 설계의 계약 Javadoc(§6.1, D10)은 "`MdmCheckIssue.itemKey` 는 `MasterCodeDiffConventions` 키, code 는 항목 enum 의 `name()`, `check()` 는 `report()` 를 편 것"이다. 스텁이 둘 중 무엇을 따르는가.
- **선택지**: (1) 스텁을 계약에 맞춘다 — `report()` 의 2-1 행이 `MdmCheckIssue("CATE_ITEM_CODE_MISSING", …, "CATE_ITEM:MAJOR,P01")` 를 담고 `check()` 는 `report()` 를 펴서 만든다. `ContractStubCompileTest.마스터코드_스텁은_경고만_…` 의 기대값을 `"P01"` → `"CATE_ITEM:MAJOR,P01"` 로 바꾼다. diff 키도 `"ITEM:P01"`, 값 맵 키는 물리 칼럼 `NAME`. (2) 기존 단언을 지키려고 스텁의 경고를 `("W2-1", "P01")` 로 두고 `report()` 에 같은 이슈를 넣는다(스텁이 자기 계약 문장을 어긴다).
- **택한 것**: (1).
- **근거와 근거 순위**: 스텁은 06-05 구현자가 계약 모양을 보고 따라 하는 예시다 — 계약 문장과 어긋난 스텁이 남으면 잘못된 모양이 복제된다. 기대값 변경은 정확한 값을 다른 정확한 값으로 바꾸는 것이지 완화가 아니다(경고 1건·오류 0건·kind·oldValues 단언은 그대로). 근거 순위: 이 설계의 계약 문장(D10·§6.1) > 같은 설계의 파일 목록 부기(§2).
- **반려되면 재작업할 방향**: 스텁 `report()` 의 2-1 이슈를 `("W2-1", …, "P01")` 로, diff 키를 `"P01"` 로 되돌리고 `ContractStubCompileTest` 의 두 곳(`"CATE_ITEM:MAJOR,P01"` 기대값·새 메서드의 `MdmCheckIssueView` 기대값)을 그 값으로 바꾼다. 계약 Javadoc 은 그대로 둔다.

---

## 7. Phase 06(완료 보고) 전 절차

1. `/usr/bin/git fetch origin` 으로 origin/dev 를 받는다.
2. TSK-04-03(2ca988a4)이 origin/dev 에 머지돼 있으면 origin/dev 를 이 브랜치에 머지하고(머지 커밋은 `/dflow-merge` 「트레일러 고정」 방식으로 DFlow-Order 를 붙인다), `testAll` 을 다시 돌린다. 머지돼 있지 않으면 그 사실을 보고에 적고 넘어간다.
3. FK(D3)로 깨지는 04-03 픽스처는 D11 대로 이 브랜치에서 고치고, 파일별 처리(부모 코드 seed / NULL)를 Build 기록과 decisions.md 에 결정으로 남긴다. 04-03 브랜치는 직접 고치지 않는다.
4. origin/dev 머지 뒤 mdm/sqlite·mdm/mssql 폴더의 최대 버전+1 로 재채번한다(D1 팀장 정정). 버전 집합 고정 테스트 4곳(§2)과 `MdmMasterCodeExpectations.VERSION` 을 맞추고, 사이 버전이 `TB_MDM_DOMAIN` 을 바꾸거나 참조하는지 다시 확인한다(§3.2-A③·⑤ 가 기계로도 잡는다).
5. 게이트는 `testAll` 하나다(도커 금지). 결과 수치와 신규 실패 0 을 보고에 적는다.

---

## 8. 인계

| 받는 Task | 인계 내용 |
|---|---|
| TSK-06-02(마루 코드 등록·버전) | `MaruIdNamespace`(MASTER_CODE) 구현 = `MdmCodeRepository.existsById`. 등록 한 트랜잭션: `MdmCode`(CREATED, `sourceKind="MDM"`) + `MdmCodeVer`(1.000, DRAFT, MAJOR, `ownerId`=등록자) + `MasterCodeSegmentService.createBaseCategory`. `VersionDraftDeletionSpi`(MASTER_CODE) 구현. `MasterCodeSegmentService.fillFrom` 과 `restored_from` 기록. 규칙표 #17(채번 저장·비교) 실측은 여전히 이 Task 몫 |
| TSK-06-03(코드 편집) | `MasterCodeSegmentService` 의 코드 행 메서드·`revert`·`viewAt` 구현, 저장 검사 오류 코드 추가(`MdmErrorCode` 는 TSK-01-02 소유이므로 새 enum 상수 추가는 그 파일 수정으로 기록). 구현은 ROW_VERSION 을 올리지 않는다(`beginDraftWrite` 가 올린다) |
| TSK-06-04(카테고리 편집) | 카테고리·소속 메서드 구현. BASE → MDM012. REGEX 해석은 `java.util.regex` 전체 일치(04:187). `DEF_EXPR` 는 MSSQL 에서도 한글을 담는다(D6) |
| TSK-06-05(확정) | `MasterCodeConfirmCheckSpi` 구현 하나(`check()` = `report()` 를 편 것), 5항 `DEFERRED`, 3항 `DELEGATED`, 최초 버전 3·4항 `EXEMPT`, diff 키 D10. 스텁 `MasterCodeConfirmCheckStub` 은 test 에 그대로 둔다 |
| TSK-04-03(domainMng, 형제 `dflow-2ca988a4`) | V9 머지 뒤 `TB_MDM_DOMAIN.MARU_CODE_ID` 는 FK 다(D3) — CODE 도메인을 저장하는 통합 테스트는 `TB_MDM_CODE` 행을 먼저 넣는다. 그 브랜치를 이 Task 가 직접 고치지는 않는다(D11, §7). **도메인 저장 API 가 없는 코드 ID 를 받으면 DB FK 오류가 난다 — 사용자에게 보일 오류 처리(저장 전 `MaruIdNamespace` 존재 검사와 오류 코드)는 후속 Task 몫이다(이 Task 는 계약 전용)** |
| 이후 mdm 마이그레이션을 추가하는 Task | 번호는 origin/dev 머지 뒤 두 방언 폴더의 최대 버전+1 이다(D1 팀장 정정) — V9 보다 작은 빈 번호(V5~V7)를 쓰지 않는다. V9 가 이미 적용된 DB 에 더 작은 번호가 뒤늦게 오면 기본 설정에서 `FlywayValidateException`("Detected resolved migration not applied to database")이 난다(Build 기록 B3-1 실측, 당시 V6·V5 로 확인). SQLite 에서 `TB_MDM_DOMAIN` 을 다시 재생성하는 후속 마이그레이션은 `FK_TB_MDM_DOMAIN_CODE` 줄을 보존한다(§6.0.8) |
| 로컬 개발자 | 도메인·컬럼·업무기준 변수 데이터가 든 로컬 `src/backend/data/mdm.db` 에서는 V9 가 실패하고 롤백된다(D3) — 파일을 지우고 다시 띄운다. 재채번 전 브랜치로 V6 을 이미 적용한 로컬 DB 도 "적용됐으나 로컬에 없는 마이그레이션 6" 검증 오류가 나므로 같은 방법으로 지운다 |

---

## Build 기록 (Phase 03, 2026-09-24)

> 재채번 주: 이 절을 적을 때 파일명은 `V6__create_mdm_master_code.sql`(당시 팀장 배정 V6)이었고, 2026-09-24 팀장 정정으로 `V9__create_mdm_master_code.sql` 로 재채번했다(재작업 기록 R2). 아래 파일명·버전은 V9 로 고쳐 적되, 버전 번호 자체가 실측 결과인 B3-1·B3-2 는 당시 번호를 그대로 둔다.

### B1. 커밋과 테스트 먼저 증거

| 단계 | 결과 |
|---|---|
| 새 마이그레이션 테스트 작성 뒤 V9 없이 실행 | `MdmMasterCodeMigrationTest`·`MdmDomainCodeFkRebuildTest`·`MdmMasterCodeDialectDdlParityTest` 16건 전부 빨강 |
| V9 두 방언 작성 뒤 | 25건 중 1건 빨강(파서 FK 수 하한 15 가 틀림 → 실제 13개로 정확 단언) → 초록 |
| 새 lib 단위 테스트(§3.5·§3.6·§3.12) 작성 뒤 | 엔티티·계약이 없어 `:lib:compileTestJava` 컴파일 오류 78건(빨강) |
| 엔티티만 있고 `application-local.yml` contributor 줄이 없을 때 | `MdmMasterCodeEntityJpaRoundtripTest` 6건 중 §3.3-4 빨강 — `APPLY_FROM` 이 `'1782831600000'` 으로 저장됨(아래 B3-3) |
| contributor 등록 뒤 | 6건 초록 |
| 키트 상속(§3.7) 첫 실행 | 22건 중 5건 빨강(S17~S21 이 부모 없이 버전을 시드 → `FK_TB_MDM_CODE_VER_CODE`) → seedVersion 이 부모를 먼저 채우도록 고친 뒤 22건 초록(B2-3) |
| mdm `:lib:test`·`:api:test` | lib 246 / 0 실패, api 126 / 0 실패 |

### B2. 설계 이탈(사유)

1. **`entity/MdmCodeVerNumbers.java` 추가**(§2 목록에 없음) — package-private 상수 없는 도우미. §6.2 의 "게터 scale 3·IdClass `compareTo` 동등·`stripTrailingZeros` 해시" 규칙을 4개 IdClass·4개 엔티티가 같은 코드로 쓰게 한 곳에 뒀다. 동작은 §6.2 그대로다.
2. **스텁 itemKey 기대값 변경** — D12(담당자 확인 필요 결정)에 적었다. `ContractStubCompileTest` 의 기존 단언 한 줄이 `"P01"` → `"CATE_ITEM:MAJOR,P01"` 로 바뀌었다(정확한 값 → 정확한 값).
3. **§3.7 `seedVersion` 이 부모 `TB_MDM_CODE` 행을 먼저 채운다** — 키트의 S17~S21 은 `seedObject` 없이 버전만 시드한다(픽스처 표에는 FK 가 없었다). TSK-01-03 §7 ③ 인계("부모 FK 는 seedVersion 이 채운다")대로 없을 때만 CREATED 로 만든다. 또 키트 본체는 `@Test` **22개**다(§3.7·F13 의 "44개"는 MASTER_CODE·BUSINESS_RULE 을 따로 센 오기로 보인다 — 한 메서드가 두 대상을 함께 돈다).
4. **§3.3-4 의 판별 칼럼** — 설계는 "컨버터가 빠지면 `typeof=integer`" 라고 봤으나 실측은 `typeof=text` 였다. `APPLY_FROM` 이 TEXT 친화도라 Hibernate 가 바인딩한 epoch millis 정수를 문자열 `'1782831600000'` 으로 바꿔 저장한다. 테스트는 `typeof` 와 함께 **값**(`'2026-07-01 00:00:00'`, `MdmTemporalBinder.toDb` 와 같음)을 단언하므로 변이 21② 는 값 단언과 §3.3-4④(`fromDb` 예외)로 빨개진다. 테스트 주석을 실측대로 고쳤다.
5. **§3.11 파서 보강** — SQLite V9 의 `CREATE TABLE` 은 8개(`TB_MDM_DOMAIN_NEW` 포함)라 표 집합에서 `TB_MDM_CODE*` 만 대조하고, 재생성 표 FK 의 자식 이름에서 `_NEW` 를 벗겨 MSSQL `ALTER` 와 비교한다. 쉼표는 괄호 깊이·작은따옴표를 인식해 최상위에서만 나눈다. SQLite 인라인 PK(`RECV_ID … PRIMARY KEY AUTOINCREMENT`)는 NOT NULL 로 본다. 설계 항목 외에 "FK 정확히 13개", "`CASCADE` 키워드 자체 없음", "SQLite 에 COLLATE 없음", "비감사 `VARCHAR` 는 전부 BIN2" 를 더 단언한다.
6. **§3.1 보강** — 표마다 CHECK 대표 외에 `TB_MDM_CODE_SYSTEM`·`TB_MDM_CODE_RECV` FK(코드·시스템 양쪽) 거부를 더했다. `CK_TB_MDM_CODE_CATE_DEF` 는 "TABLE 인데 DEF_TARGET 있음" 도 본다.
7. **MSSQL V9 파일** — ERD 파일에서 머리 주석 4줄을 빼고 G2·G3·G4 세 줄을 바꾼 뒤 표 설명 주석 4줄과 파일 끝 G5 `ALTER` 를 더했다. `diff` 로 확인한 ERD 대비 차이는 이것뿐이다(§3.13-8 의 Verify 대조 대상). SQLite V9 의 7테이블 부분도 ERD 대비 G1(감사 카운터 7곳)·G2·G3 과 주석만 다르고, 재생성 DDL 은 V3 `TB_MDM_DOMAIN` 과 "걸지 않는다" 주석 2줄 ↔ FK 1줄만 다르다.
8. **§3.8 MSSQL 테스트** — 별도 DB 이름은 `mdm_master_code`. 설계 항목을 한 파일에 모았고, 5·6·13 항목은 대표 단언으로 줄였다. 게이트 비실행이라 `:api:compileMssqlTestJava` 로 컴파일만 확인했다(B6).

### B3. 실측 기록

1. **D1 — V6 이 적용된 DB 에 V5 가 뒤늦게 들어올 때**(임시 테스트로 1회 실행, 커밋하지 않음): 임시 location 에 sqlite V1~V4·V6 을 복사해 새 DB 에 `migrate()` → `executed=5, target=6`. 같은 location 에 `V5__probe.sql`(`SELECT 1;`)을 더해 다시 `migrate()`:
   - 기본 설정: `FlywayValidateException: Validate failed: Migrations have failed validation / Detected resolved migration not applied to database: 5. / To ignore this migration, set -ignoreMigrationPatterns='*:ignored'. To allow executing this migration, set -outOfOrder=true.`
   - `ignoreMigrationPatterns("*:ignored")`: 오류 없이 `executed=0` — V5 는 적용되지 않은 채 남는다.
   - `outOfOrder(true)`: `executed=1, target=5`, 경고 `outOfOrder mode is active. Migration of schema "main" may not be reproducible.`, `info()` 상태 V5 = `OUT_OF_ORDER`.
   - Flyway 검증 규칙은 방언과 무관하므로 MSSQL 도 같다고 본다. 인계(§8 "V5 를 받은 Task")에 이 결과를 쓴다.
2. **§3.2-B**: 부모·자식 도메인과 컬럼 행이 든 V4 DB 에 V6(현 V9)을 적용하면 `FlywayException` 으로 실패하고, 실패 뒤 `TB_MDM_CODE`·`TB_MDM_DOMAIN_NEW` 가 없으며 도메인·컬럼의 행·DDL 텍스트·FK 가 V6 전과 같고 `flyway_schema_history` 에 버전 6 성공 행이 없다. 참조 행이 있어도 성공하는 기법은 찾지 않았다(D3 그대로).
3. **§3.3-4(D7·#16)**: 컨트리뷰터 없이 저장한 `APPLY_FROM` = `'1782831600000'`(`typeof=text`), 등록 뒤 = `'2026-07-01 00:00:00'`. Hibernate 7.2 가 `spring.jpa.properties.hibernate.metadata_builder_contributor` 를 실제로 적용함을 이 값 차이로 확인했다(F11).
4. **#17 관찰**(상태 변경 없음): 엔티티로 저장한 `TB_MDM_CODE_VER.VER` 의 `typeof` = `1:integer, 1.001:real, 2:integer`. scale 3 키 `findById` 와 게터 scale 3 단언은 통과했다.
5. **D11**: V9(당시 V6) 직후 `:api:test` 전체에서 빨강은 `MdmSharedContractMigrationTest` 의 버전 집합 1건뿐이었다(새 버전 반영으로 고침). `MdmDictionaryExpectations`·`VersionFixtureTables`·`VersionStateServiceSqliteTest`·`MdmTermDomainColumnMigrationTest` 는 FK 로 깨지지 않아 고친 픽스처가 없다(후자는 이름·주석만 고침). `DefaultMdmEffectiveDomainResolverTest` 는 이 브랜치(origin/dev `78813e9` 기준)에 없다 — §7 절차에서 다시 본다.

### B4. 변이 검증 (§5 불변 규칙, 52건)

Build 서브에이전트가 변이마다 원본을 바꾸고 관련 테스트를 돌린 뒤 되돌렸다(스크립트 기록). 결과는 **52건 전부 빨강**이다. 규칙 30(main 에 구현 클래스 없음)은 잡는 테스트가 없는 알려진 커버리지 갭이라 변이를 넣지 않았고, Verify 가 `git diff --name-status` 를 §2 목록과 대조해 확인한다. 변이를 모두 되돌린 뒤 작업 트리의 소스·테스트 파일에 변경이 남지 않았음을 오케스트레이터가 `git status` 로 확인했다.

| 규칙 | 변이 | 실행한 테스트 | 결과 |
|---|---|---|---|
| 1 | 1a SQLite TB_MDM_CODE_RECV 블록 삭제 | MdmMasterCodeMigrationTest | **빨강** — `MdmMasterCodeMigrationTest` 빨강(13 tests, 5 fail, 0 err) |
| 1 | 1b MSSQL TB_MDM_CODE_RECV 블록 삭제 | MdmMasterCodeDialectDdlParityTest | **빨강** — `MdmMasterCodeDialectDdlParityTest` 빨강(10 tests, 8 fail, 0 err) |
| 2 | 2a SQLite 만 V7 로 개명 | MdmFlywayVersionParityTest | **빨강** — `MdmFlywayVersionParityTest` 빨강(1 tests, 1 fail, 0 err) |
| 2 | 2b 두 방언 V5 로 개명 | MdmSharedContractMigrationTest | **빨강** — `MdmSharedContractMigrationTest` 빨강(6 tests, 1 fail, 0 err) |
| 3 | 3a SQLite ITEM TO_VER DEFAULT 9999 제거 | MdmMasterCodeMigrationTest | **빨강** — `MdmMasterCodeMigrationTest` 빨강(13 tests, 4 fail, 0 err) |
| 3 | 3b MdmCodeItem.toVer 초기값 제거 | MdmMasterCodeEntityJpaRoundtripTest | **빨강** — `MdmMasterCodeEntityJpaRoundtripTest` 빨강(6 tests, 2 fail, 0 err) |
| 4 | 4a SQLite ITEM FROM_VER NUMERIC(9,3) | MdmMasterCodeMigrationTest | **빨강** — `MdmMasterCodeMigrationTest` 빨강(13 tests, 1 fail, 0 err) |
| 4 | 4b MSSQL VER DECIMAL(9,3) | MdmMasterCodeDialectDdlParityTest | **빨강** — `MdmMasterCodeDialectDdlParityTest` 빨강(10 tests, 1 fail, 0 err) |
| 5 | 5 SQLite ITEM PK 에서 FROM_VER 제거 | MdmMasterCodeEntityJpaRoundtripTest | **빨강** — `MdmMasterCodeEntityJpaRoundtripTest` 빨강(6 tests, 1 fail, 0 err) |
| 6 | 6a MSSQL FK_TB_MDM_CODE_ITEM_VER 제거 | MdmMasterCodeDialectDdlParityTest | **빨강** — `MdmMasterCodeDialectDdlParityTest` 빨강(10 tests, 1 fail, 0 err) |
| 6 | 6b SQLite FK_TB_MDM_CODE_ITEM_VER 제거 | MdmMasterCodeMigrationTest | **빨강** — `MdmMasterCodeMigrationTest` 빨강(13 tests, 3 fail, 0 err) |
| 7 | 7 SQLite CATE_ITEM → ITEM FK 추가 | MdmMasterCodeMigrationTest | **빨강** — `MdmMasterCodeMigrationTest` 빨강(13 tests, 1 fail, 0 err) |
| 8 | 8a MSSQL FK_TB_MDM_CODE_ITEM_VER ON DELETE CASCADE | MdmMasterCodeDialectDdlParityTest | **빨강** — `MdmMasterCodeDialectDdlParityTest` 빨강(10 tests, 4 fail, 0 err) |
| 8 | 8b SQLite FK_TB_MDM_CODE_ITEM_VER ON DELETE CASCADE | MdmMasterCodeMigrationTest | **빨강** — `MdmMasterCodeMigrationTest` 빨강(13 tests, 1 fail, 0 err) |
| 9 | 9a MSSQL LVL_CNT BETWEEN 0 AND 6 | MdmMasterCodeDialectDdlParityTest | **빨강** — `MdmMasterCodeDialectDdlParityTest` 빨강(10 tests, 1 fail, 0 err) |
| 9 | 9b SQLite LVL_CNT BETWEEN 0 AND 6 | MdmMasterCodeMigrationTest | **빨강** — `MdmMasterCodeMigrationTest` 빨강(13 tests, 1 fail, 0 err) |
| 9 | 9c SQLite CK_TB_MDM_CODE_ITEM_CODE 제거 | MdmMasterCodeMigrationTest | **빨강** — `MdmMasterCodeMigrationTest` 빨강(13 tests, 2 fail, 0 err) |
| 10 | 10 MdmCodeVer.emergencyYn 초기값 제거 | MdmMasterCodeEntityJpaRoundtripTest | **빨강** — `MdmMasterCodeEntityJpaRoundtripTest` 빨강(6 tests, 5 fail, 0 err) |
| 11 | 11 MdmCodeVer @AttributeOverride 제거 | MdmMasterCodeEntityJpaRoundtripTest | **빨강** — `MdmMasterCodeEntityJpaRoundtripTest` 빨강(6 tests, 4 fail, 0 err) |
| 12 | 12 SQLite ITEM 감사 VER INTEGER | MdmMasterCodeMigrationTest | **빨강** — `MdmMasterCodeMigrationTest` 빨강(13 tests, 1 fail, 0 err) |
| 13 | 13 MdmCodeVer.rowVersion 에 @Version | MdmMasterCodeEntityJpaRoundtripTest | **빨강** — `MdmMasterCodeEntityJpaRoundtripTest` 빨강(6 tests, 1 fail, 0 err) |
| 14 | 14 MdmCode 에 LAST_CHG_SEQ 매핑 추가 | MasterCodeContractTest | **빨강** — `MasterCodeContractTest` 빨강(10 tests, 1 fail, 0 err) |
| 15 | 15 MdmCodeRecv 엔티티 추가 | MasterCodeContractTest | **빨강** — `MasterCodeContractTest` 빨강(10 tests, 1 fail, 0 err) |
| 16 | 16 MdmCodeItem 에 @ManyToOne | MdmEntityArchitectureTest | **빨강** — `MdmEntityArchitectureTest` 빨강(4 tests, 1 fail, 0 err) |
| 17 | 17 MSSQL ITEM CODE COLLATE 제거 | MdmMasterCodeDialectDdlParityTest | **빨강** — `MdmMasterCodeDialectDdlParityTest` 빨강(10 tests, 1 fail, 0 err) |
| 18 | 18 MSSQL DEF_EXPR VARCHAR(MAX) | MdmMasterCodeDialectDdlParityTest | **빨강** — `MdmMasterCodeDialectDdlParityTest` 빨강(10 tests, 2 fail, 0 err) |
| 19 | 19a SQLite FK_TB_MDM_DOMAIN_CODE 줄 누락 | MdmMasterCodeMigrationTest · MdmDomainCodeFkRebuildTest | **빨강** — `MdmMasterCodeMigrationTest` 빨강(13 tests, 1 fail, 0 err); `MdmDomainCodeFkRebuildTest` 빨강(2 tests, 1 fail, 0 err) |
| 19 | 19b SQLite IX_TB_MDM_DOMAIN_PARENT 재생성 누락 | MdmDomainCodeFkRebuildTest · MdmMasterCodeMigrationTest · MdmTermDomainColumnMigrationTest | **빨강** — `MdmDomainCodeFkRebuildTest` 빨강(2 tests, 1 fail, 0 err); `MdmMasterCodeMigrationTest` 빨강(13 tests, 1 fail, 0 err); `MdmTermDomainColumnMigrationTest` 빨강(12 tests, 1 fail, 0 err) |
| 19 | 19c SQLite sqlite_sequence 보존 문장 누락 | MdmDomainCodeFkRebuildTest | **빨강** — `MdmDomainCodeFkRebuildTest` 빨강(2 tests, 1 fail, 0 err) |
| 19 | 19d SQLite JSON CHECK(EXAMPLES) 누락 | MdmDomainCodeFkRebuildTest | **빨강** — `MdmDomainCodeFkRebuildTest` 빨강(2 tests, 1 fail, 0 err) |
| 20 | 20 SQLite V9 executeInTransaction=false | MdmDomainCodeFkRebuildTest | **빨강** — `MdmDomainCodeFkRebuildTest` 빨강(2 tests, 1 fail, 0 err) |
| 21 | 21a 컨버터 쓰기 형식 .SSS | MdmSqliteLocalDateTimeConverterTest · MdmMasterCodeEntityJpaRoundtripTest | **빨강** — `MdmSqliteLocalDateTimeConverterTest` 빨강(3 tests, 2 fail, 0 err); `MdmMasterCodeEntityJpaRoundtripTest` 빨강(6 tests, 1 fail, 0 err) |
| 21 | 21b application-local.yml contributor 줄 삭제 | MdmMasterCodeEntityJpaRoundtripTest | **빨강** — `MdmMasterCodeEntityJpaRoundtripTest` 빨강(6 tests, 1 fail, 0 err) |
| 22 | 22 MdmCodeVer 세터 초 절단 제거 | MdmCodeEntityValueTest · MdmMasterCodeEntityJpaRoundtripTest | **빨강** — `MdmCodeEntityValueTest` 빨강(3 tests, 1 fail, 0 err); `MdmMasterCodeEntityJpaRoundtripTest` 초록(6 tests, 0 fail, 0 err) |
| 23 | 23a scaled() 정규화 제거(게터·생성자) | MdmCodeEntityValueTest · MdmMasterCodeEntityJpaRoundtripTest | **빨강** — `MdmCodeEntityValueTest` 빨강(3 tests, 1 fail, 0 err); `MdmMasterCodeEntityJpaRoundtripTest` 빨강(6 tests, 3 fail, 0 err) |
| 23 | 23b MdmCodeVer.getVer 게터 정규화만 제거 | MdmCodeEntityValueTest · MdmMasterCodeEntityJpaRoundtripTest | **빨강** — `MdmCodeEntityValueTest` 초록(3 tests, 0 fail, 0 err); `MdmMasterCodeEntityJpaRoundtripTest` 빨강(6 tests, 2 fail, 0 err) |
| 23 | 23c MdmCodeVerId equals/hashCode 를 Objects 기반으로 | MdmCodeEntityValueTest · MdmMasterCodeEntityJpaRoundtripTest | **빨강** — `MdmCodeEntityValueTest` 빨강(3 tests, 1 fail, 0 err); `MdmMasterCodeEntityJpaRoundtripTest` 초록(6 tests, 0 fail, 0 err) |
| 24 | 24a MasterCodeSegmentService 에 default 메서드 | MdmContractArchitectureTest | **빨강** — `MdmContractArchitectureTest` 빨강(10 tests, 1 fail, 0 err) |
| 24 | 24b MasterCodeItemValues 에 lvl(int) | MdmContractArchitectureTest | **빨강** — `MdmContractArchitectureTest` 빨강(10 tests, 1 fail, 0 err) |
| 25 | 25a enum MasterCodeCateKind{REGEX,TABLE} 추가 | MasterCodeContractTest | **빨강** — `MasterCodeContractTest` 빨강(10 tests, 1 fail, 0 err) |
| 25 | 25b MasterCodeConventions.BASE_CATE_ID="BASE" | MasterCodeContractTest | **빨강** — `MasterCodeContractTest` 빨강(10 tests, 1 fail, 0 err) |
| 26 | 26a addItem 에 long expectedRowVersion 추가(스텁도 맞춤) | MasterCodeContractTest | **빨강** — `MasterCodeContractTest` 빨강(10 tests, 1 fail, 0 err) |
| 26 | 26b deleteDraft(VersionRef) 재선언(스텁도 맞춤) | MasterCodeContractTest | **빨강** — `MasterCodeContractTest` 빨강(10 tests, 1 fail, 0 err) |
| 27 | 27a 2-1 심각도 REJECT | MasterCodeContractTest | **빨강** — `MasterCodeContractTest` 빨강(10 tests, 1 fail, 0 err) |
| 27 | 27b 5항 inScope=true | MasterCodeContractTest | **빨강** — `MasterCodeContractTest` 빨강(10 tests, 1 fail, 0 err) |
| 28 | 28 KEY_PART_SEPARATOR="/" | MasterCodeContractTest | **빨강** — `MasterCodeContractTest` 빨강(10 tests, 1 fail, 0 err) |
| 29 | 29 CONFIRM_CHECKS 에 MASTER_CODE 스텁 하나 더 | ContractStubCompileTest | **빨강** — `ContractStubCompileTest` 빨강(15 tests, 1 fail, 0 err) |
| 31 | 31a SQLite RELEASED_AT → RELEASE_AT | MasterCodeVersionStateSqliteTest | **빨강** — `MasterCodeVersionStateSqliteTest` 빨강(22 tests, 12 fail, 0 err) |
| 31 | 31b SQLite CK_TB_MDM_CODE_VER_APPLY 를 STATUS='DRAFT' OR APPLY_TO IS NULL 로 | MasterCodeVersionStateSqliteTest | **빨강** — `MasterCodeVersionStateSqliteTest` 빨강(22 tests, 16 fail, 0 err) |
| 32 | 32a SQLite RECV AUTOINCREMENT 제거 | MdmMasterCodeMigrationTest · MdmMasterCodeDialectDdlParityTest | **빨강** — `MdmMasterCodeMigrationTest` 빨강(13 tests, 1 fail, 0 err); `MdmMasterCodeDialectDdlParityTest` 빨강(10 tests, 1 fail, 0 err) |
| 32 | 32b MSSQL RECV IDENTITY(1,1) 제거 | MdmMasterCodeDialectDdlParityTest | **빨강** — `MdmMasterCodeDialectDdlParityTest` 빨강(10 tests, 1 fail, 0 err) |
| 9 | D4 SQLite CK APPLY 를 ERD 원문으로(D4 되돌림) | MdmMasterCodeMigrationTest · MdmMasterCodeDialectDdlParityTest | **빨강** — `MdmMasterCodeMigrationTest` 빨강(13 tests, 1 fail, 0 err); `MdmMasterCodeDialectDdlParityTest` 빨강(10 tests, 1 fail, 0 err) |

### B5. Build 게이트 (오케스트레이터 직접 실행)

| 명령 | tests | failures | errors | 판정 |
|---|---|---|---|---|
| `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain` (TEST-*.xml 합산, mssqlMigrationTest 제외) | 1950 | 0 | 0 | 통과. 기준선 1878 / 0 대비 신규 실패 0, 총수 +72 |

mdm 테스트 결과 XML 마다 대응 소스가 있음을 확인했다(D1 임시 실측 테스트의 결과가 섞이지 않았다).

### B6. MSSQL 방언

- 사용자 결정: 도커 금지로 MSSQL 실측 생략, DDL 리뷰로 대체. `:api:mssqlMigrationTest` 는 실행하지 않았다.
- `cd src/backend/mdm && ../gradlew :api:compileMssqlTestJava --no-daemon` 은 BUILD SUCCESSFUL 이다(mssqlTest 소스셋 새 파일·수정 파일 컴파일 확인, docker 불필요).
- 기계 대조는 §3.11 `MdmMasterCodeDialectDdlParityTest`(testAll 포함)가 맡고, 남은 줄 단위 대조 리뷰는 §3.13 체크리스트로 Verify 가 수행한다.

---

## Verify 기록 (Phase 04, 2026-09-24)

### V1. testAll 게이트

| 메트릭 | 기준선 | 빌드 | Verify | 판정 |
|---|---|---|---|---|
| tests | 1878 | 1950 | 1950 | 통과 |
| failures | 0 | 0 | 0 | 통과 |
| errors | 0 | 0 | 0 | 통과 |
| 신규 테스트 | - | +72 | +72 | 통과 |

명령: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain`

### V2. 변이 재확인 (카테고리별 8건)

| 규칙 | 변이 설명 | 대표 테스트 | Verify 결과 |
|---|---|---|---|
| 1a (마이그레이션) | SQLite TB_MDM_CODE_RECV 블록 삭제 | MdmMasterCodeMigrationTest | 빨강 |
| 4b (DDL 대조) | MSSQL VER DECIMAL(9,3) | MdmMasterCodeDialectDdlParityTest | 빨강 |
| 14 (엔티티) | MdmCode 에 LAST_CHG_SEQ 매핑 | MasterCodeContractTest | 빨강 |
| 24a (계약) | MasterCodeSegmentService default 메서드 | MdmContractArchitectureTest | 빨강 |
| 19a (FK 재생성) | FK_TB_MDM_DOMAIN_CODE 줄 누락 | MdmMasterCodeMigrationTest, MdmDomainCodeFkRebuildTest | 빨강 |
| D4 (CHECK 역변이) | CK_TB_MDM_CODE_VER_APPLY ERD 원문으로 (REQUESTED 제거) | MdmMasterCodeMigrationTest | 빨강 |
| 29 (스텁) | CONFIRM_CHECKS 에 MASTER_CODE 중복 | ContractStubCompileTest | 빨강 |
| 21a (컨버터) | 쓰기 형식 .SSS 추가 | MdmMasterCodeEntityJpaRoundtripTest | 빨강 |

### V3. 불변 규칙 30 (구현 클래스 없음)

| 대상 | 검색 | 결과 |
|---|---|---|
| main 에 MasterCodeSegmentService 구현 | grep -rn "implements MasterCodeSegmentService" src/main | 0건 |
| main 에 MasterCodeConfirmCheckSpi 구현 | grep -rn "implements MasterCodeConfirmCheckSpi" src/main | 0건 |

판정: 통과 — 알려진 커버리지 갭으로 git diff 확인.

### V4. §3.13 MSSQL DDL ↔ SQLite DDL 줄 단위 대조 리뷰

파일 위치(Verify 당시 파일명은 `V6__…`, 재작업 R2 로 V9 재채번 — DDL 동일, 머리·G5 주석만 갱신). 아래 표의 라인 번호는 Verify 가 읽은 V6 시절 파일 기준이다. 지금 V9 파일에서는 MSSQL 은 3행부터 +1, SQLite 는 3~203행 +1, 207~208행 +3, 209행부터 +4 를 더한다:
- MSSQL: `src/backend/mdm/api/src/main/resources/db/migration/mdm/mssql/V9__create_mdm_master_code.sql`
- SQLite: `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V9__create_mdm_master_code.sql`

| # | 항목 | MSSQL (라인) | SQLite (라인) | 판정 |
|---|---|---|---|---|
| 1 | 테이블 생성 순서 | CODE(15) → SYSTEM(46) → VER(65) → ITEM(103) → CATE(133) → CATE_ITEM(160) → RECV(181), ALTER(211) | CREATE ... 마지막에 재생성 | 통과 |
| 2 | FK 칼럼 타입·길이·COLLATE 일치 | MARU_CODE_ID VARCHAR(50) BIN2, SOURCE_SYSTEM VARCHAR(20) BIN2, VER DECIMAL(7,3) | 동일 | 통과 |
| 3 | DF_... 제약명 다르고 128자 이하 | DF_TB_MDM_CODE_STATUS, DF_TB_MDM_CODE_VER_EMERGENCY_YN, DF_TB_MDM_CODE_VER_ROW_VERSION 등 8개 | 해당 없음 (SQLite) | 통과 |
| 4 | [RESULT] 인용, 예약어 충돌 | [RESULT] VARCHAR(20) BIN2, CHECK ([RESULT] IN ...)로 처리 | 해당 없음 | 통과 |
| 5 | 업무 일시 8칼럼 DATETIME2(0) | APPLY_FROM(72), APPLY_TO(73), REQUESTED_AT(76), APPROVED_AT(80), RELEASED_AT(82), CANCELLED_AT(83), RECEIVED_AT(187), PROCESSED_AT(193) | TEXT | 통과 |
| 6 | RECV_ID BIGINT IDENTITY + PK | RECV_ID BIGINT IDENTITY(1,1) NOT NULL, PK_TB_MDM_CODE_RECV | AUTOINCREMENT | 통과 |
| 7 | 한글 칼럼 NVARCHAR, 코드·키 BIN2 | DESCRIPTION·ATTR01_NAME 등 NVARCHAR(100/MAX); CODE·CATE_ID·FROM_VER·MARU_CODE_ID 등 BIN2 | 해당 없음 | 통과 |
| 8 | G1~G5 외 ERD 와 차이 없음 | diff 결과: 주석(G1~G5)·테이블 생성 순서·ALTER만 다름 | 동일 | 통과 |

판정: 모든 항목 통과.

### V5. 종합 판정

- **PHASE_RESULT: verify ok** — 전체 스위트 1950/0, 변이 8건 빨강 확인, 규칙 30 커버리지 갭 기록, DDL 리뷰 8항 통과. 추가 문제 없음.

---

## Phase 06 전 dev 머지 기록 (§7, 2026-09-24)

- `origin/dev` 에 새로 들어온 것은 TSK-08-01(06 업무기준, V8)과 `6855c6c`(공용 MSSQL 서버 `MdmMssqlServer`)다. TSK-04-03 은 아직 머지되지 않아 D11 의 픽스처 수정 대상은 없다.
- 충돌 11파일을 합집합으로 풀었다:
  - **SQLite 일시 컨버터(add/add)**: TSK-08-01 D5 와 이 Task D7 이 같은 경로·같은 이름으로 `MdmSqliteLocalDateTimeConverter`·`MdmSqliteTemporalContributor`·그 테스트를 각각 만들었다. 동작은 같아 한 벌로 합쳤다. 본문은 dev 쪽을 기반으로 하고, 이 Task 가 요구한 두 가지(빈 문자열 → `null`, 패턴은 `MdmTemporalBinder.SQLITE_TEXT_PATTERN` 상수 사용)를 얹었다. 테스트는 두 파일의 메서드를 모두 남겼다. `application-local.yml` 등록은 dev 의 중첩 키 한 줄을 쓴다.
  - **버전 집합 테스트 4곳**(`MdmSharedContractMigrationTest` 와 MSSQL 3개): `{1,2,3,4,6,8}`, MSSQL `migrationsExecuted=6`·`target=8` 로 맞췄다(새 버전 반영이지 완화가 아니다).
  - **`ContractStubCompileTest`**: 04 절과 06 절을 모두 남겼다.
  - **`decisions.md`**: 두 Task 가 모두 D-050~D-054 를 썼다. dev 쪽 번호를 유지하고 이 Task 의 결정을 **D-055~D-059** 로 재번호했다(내부 참조 포함). 이 문서의 D1~D12 번호는 바뀌지 않는다.
  - **`naming-dialect-rules.md`**: 행 2·16·19 는 dev 문장 안의 "04 몫 실측 필요 → TSK-06-01" 자리를 이 Task 의 SQLite 실측 결과로 바꿔 넣었고, 행 17·담당 표 첫 행은 이 Task 쪽, 나머지는 dev 쪽을 따랐다.
- 팀장 공지대로 새 MSSQL 테스트 2개(`MdmMasterCodeMssqlMigrationTest`·`MasterCodeVersionStateMssqlTest`)를 `MdmMssqlServer.newDatabase(...)`·`::user`·`::password` 로 바꿨다(Testcontainers 직접 사용 제거). 실행은 여전히 하지 않고 `:api:compileMssqlTestJava` 로 컴파일만 확인했다.
- 머지 트리 게이트: `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain --rerun-tasks` → **2034 tests / 0 failures / 0 errors**(머지 전 1950, 증가분은 TSK-08-01 테스트). 이 Task 의 FK(당시 V6, 현 V9)로 깨진 dev 쪽 테스트는 없었다.

## 재작업 기록 (Phase 06 전, 2026-09-24)

origin/dev 두 번째 머지(TSK-04-03 도메인 관리, `3c7aa75`) 뒤 머지 트리 `testAll` 에서 5건이 실패했다(2075 tests / 5 failures). 원인은 04-03 테스트 픽스처가 `TB_MDM_CODE` 행 없이 `MARU_CODE_ID='PROC_CD'` 인 도메인을 저장해 `FK_TB_MDM_DOMAIN_CODE`(D3)에 걸린 것이다. 팀장 지시 두 가지(D11 픽스처 수정, D1 정정에 따른 재채번)를 처리했다.

### R1. TSK-04-03 픽스처 수정(D11) — 커밋 `3b0cba6`

| 파일 | 깨진 테스트 | 방식 | 근거 |
|---|---|---|---|
| `api/src/test/.../common/dictionary/DefaultMdmEffectiveDomainResolverTest.java` | `resolve_는_목록의_유효값과_같다`, `resolveDraft_는_저장하지_않고_초안을_얹는다` | **seed** — `tree()` 에서 도메인 INSERT 앞에 `TB_MDM_CODE`(`PROC_CD`, INUSE, MDM) 한 행 | 3·4번 도메인의 유효 코드 참조(`PROC_CD`/`BASE`·`COATING`)가 검증 대상이라 NULL 로 바꾸면 검증이 사라진다 |
| `api/src/test/.../dma/domainMng/DomainMngRejectConditionTest.java` | `R09_CODE_종류는_체인에_코드_참조가_있어야_한다`, `R10_RELEASED_에_없는_카테고리는_거부한다` | **seed** — `setUp` 에서 `seedCodeHeader("PROC_CD")` | R09·R10 은 코드 참조를 가진 CODE 도메인 저장이 검증 대상이다. `NO_SUCH_CODE` 는 넣지 않는다(R10 두 번째 경우는 여전히 원장에 없는 코드여야 한다) |
| `api/src/test/.../dma/domainMng/DomainMngWithoutCodeLedgerTest.java` | `W02_코드_판정_불가는_경고이고_CODE_자식은_부모_참조로_저장된다` | **seed** — `setUp` 에서 `seedCodeHeader("PROC_CD")` | 부모 CODE 도메인 저장이 전제다. 테스트 전제인 "코드 원장 없음"은 `CodeLookup` **빈** 유무로 정해진다(`MdmCodeLookupAvailability` 가 `ObjectProvider<CodeLookup>` 만 보고, main 에 DB 를 읽는 `CodeLookup` 구현이 없으며 `MdmEngineConfig` 는 소비만 한다). DB 행을 넣어도 빈이 생기지 않고, 같은 클래스의 `코드_원장이_없는_컨텍스트다` 가 계속 초록이다 |

- 공용 도우미 `DomainMngApiSupport.seedCodeHeader(String)` 를 더했다(`INSERT OR IGNORE`, `SOURCE_KIND='MDM'`·`SOURCE_SYSTEM` NULL 로 `CK_TB_MDM_CODE_SRC_SYS` 통과, 상태는 메모리 원장 헤더와 같은 `INUSE`). `fixtures()` 에 숨기지 않고 두 클래스의 `setUp` 에서 명시적으로 부른다. `TB_MDM_CODE_VER`·`CATE` 행은 넣지 않는다 — FK 는 `MARU_CODE_ID` 만 보고, 그 행을 읽는 코드가 없다.
- 기대값·테스트 수·04-03 프로덕션 코드는 바꾸지 않았다. 세 파일 모두 V6(당시 파일명)에서 초록을 확인한 뒤 재채번했다(원인 분리).
- 변이 ①: `DomainMngWithoutCodeLedgerTest` 의 `seedCodeHeader` 호출을 주석 처리 → `W02_…` 빨강, 원인 `[SQLITE_CONSTRAINT_FOREIGNKEY] A foreign key constraint failed`(`insert into tb_mdm_domain`). 되돌림.

### R2. Flyway 재채번 V6 → V9(D1 팀장 정정)

- 팀장 정정: 배정표 폐기, "done 직전 origin/dev 머지 뒤 mdm/sqlite·mdm/mssql 폴더의 최대 버전+1". `git ls-tree` 로 두 방언 최대가 V8 임을 확인했다 → **V9**. 당초 V6 으로 배정되었고 2026-09-24 팀장 정정으로 V9 로 재채번했다.
- `git mv` 두 방언 `V6__create_mdm_master_code.sql` → `V9__create_mdm_master_code.sql`. DDL 본문은 그대로이고 주석만 고쳤다: 머리의 버전 설명(V9·재채번 이력), SQLite G5 절의 "V6 전체 롤백"·"V6 앞에" → V9, 참조 행 목록에 V8 `TB_MDM_RULE_VAR` 추가, "V8 FK 는 이름으로 가리켜 RENAME 뒤 새 표를 가리킨다" 한 줄 추가. `build/resources` 에 옛 V6 파일이 남지 않았음을 확인했다.
- 버전을 기대하는 테스트(새 버전 반영이지 완화가 아니다):
  - `MdmMasterCodeExpectations.VERSION` "6" → "9"
  - `MdmMasterCodeMigrationTest` — 메서드명 `flyway_가_V9_를_success_로_적용했다`, 메시지가 `VERSION` 을 쓴다
  - `MdmMasterCodeDialectDdlParityTest` — 두 파일 경로 상수 `SQLITE_V9`·`MSSQL_V9`
  - `MdmSharedContractMigrationTest` — `{1,2,3,4,6,8}` → `{1,2,3,4,8,9}`, 메서드명 `…V1_V2_V3_V4_V8_V9_를_적용했다`
  - mssqlTest(게이트 비실행, 컴파일만): `MdmMssqlMigrationTest`(`migrationsExecuted=6` 유지 — V1~V4·V8·V9, `targetSchemaVersion` "8" → "9", 집합), `MdmInterfaceLayoutMssqlMigrationTest`·`MdmTermDomainColumnMssqlMigrationTest`(집합·메서드명), `MdmMasterCodeMssqlMigrationTest`(메서드명·Javadoc), `MasterCodeVersionStateMssqlTest`(주석)
  - 주석만: `MasterCodeVersionStateSqliteTest`, `MdmTermDomainColumnMigrationTest`, `lib/src/main/.../entity/MdmDomain.java` Javadoc 두 곳(이 Task 가 쓴 문장, 코드 변경 없음)
  - `MdmFlywayVersionParityTest` 는 버전을 고정하지 않아 그대로다. TSK-08-01·04-03 쪽 테스트에 이 Task 의 버전을 고정한 곳은 없었다(`src/backend` 전체 grep).
- **V9 는 V8 뒤에 돈다** — `MdmDomainCodeFkRebuildTest`(§3.2):
  - 이전 버전 계산은 하드코딩이 없어 자동으로 V8 이 됐다(A·B 모두 V8 적용 DB 에 V9 를 올린다).
  - A 에 ⑤ 추가: `TB_MDM_RULE_VAR` 의 DDL·FK 목록(`TB_MDM_DOMAIN(DOMAIN_ID->DOMAIN_ID)` 포함)이 V9 전후 같고, V9 뒤 남은 도메인을 가리키는 RULE_VAR 행은 들어가며 없는 도메인을 가리키는 행은 거부되고, `pragma_foreign_key_check` 가 비어 있다. FK 목록은 표 이름만 보이므로 실제 INSERT 두 개로 새 표를 가리킴을 증명한다.
  - 새 메서드 `B_업무기준_변수만_도메인을_참조해도_V9_는_실패하고_부분_적용이_남지_않는다`: 도메인 1행 + RULE·RULE_VER·RULE_VAR(`DOMAIN_ID`) 만 있는 V8 DB 에서 V9 는 `FlywayException`(메시지에 `FOREIGN KEY`)으로 실패하고, `TB_MDM_CODE`·`TB_MDM_DOMAIN_NEW` 가 없으며 도메인 행·FK, RULE_VAR 행·DDL 이 그대로이고 버전 9 성공 행이 없다. 자식 도메인·컬럼 없이 RULE_VAR 만 두어 롤백 원인을 RULE_VAR 로 한정했다.
- 변이 ②: SQLite V9 재생성 SQL 에서 `CONSTRAINT FK_TB_MDM_DOMAIN_CODE …` 줄 삭제 → `A_…` 빨강(③ FK 집합 단언, 85행). 되돌림.
- 보조 변이: `B_업무기준` 에서 RULE_VAR INSERT 를 빼면 V9 가 성공해 빨강 → RULE_VAR 가 실패 원인임을 확인. 되돌림.
- 문서: 이 설계서의 D1·D3·D4·D11·§2·§3·§5(규칙 1·2·8·19·20·31)·§6.0.8·§7·§8 을 V9 로 고치고, Build·Verify 기록은 머리 주석 한 줄과 함께 파일명만 V9 로 바꿨다(B3-1·B3-2 의 실측 번호는 당시 그대로). `decisions.md` D-055·D-056(V9, RULE_VAR 롤백·FK 유지 근거)·D-059(04-03 세 파일 seed), `naming-dialect-rules.md` 행 19 의 이 Task 몫 V6 → V9.

### R3. 게이트

- mdm `:lib:test :api:test` 초록, `:api:compileMssqlTestJava` 성공(도커 명령은 실행하지 않았다).
- `cd src/backend && ./gradlew testAll --no-daemon --console=plain --rerun-tasks` → **BUILD SUCCESSFUL, 2139 tests / 0 failures / 0 errors / 0 skipped**(`count.sh all`, mssqlMigrationTest 제외). 머지 트리 기준선 2075 대비 줄지 않았다. 이 재작업이 더한 테스트는 `B_업무기준` 1건이다. 기준선 2075 와의 나머지 차이(63건)의 원인은 확인하지 않았다(이 수치는 `--rerun-tasks` 로 모든 모듈을 다시 돌려 얻었다).
