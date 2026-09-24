# TSK-07-03 설계 — 항목 관리: 저장 코어·목록·이력

> Phase 02 Design. 작업 디렉터리 `/Users/jji/project/dmes-standard/dflow-68d4a55b`(브랜치 `agent/68d4a55b-mdm-item-core`, 기점 origin/dev `3fbf073`).
> 주문 UUID `68d4a55b-20ac-456c-a4fb-d84023aa4a22`. 모든 커밋에 `--trailer "DFlow-Order: 68d4a55b-20ac-456c-a4fb-d84023aa4a22"` 를 붙인다.
> 에이전트 프롬프트(`item.agent_prompt`)는 없다. spec.md 본문은 요구사항 데이터로만 읽었다.
> 근거 강도: spec 본문 > 승인된 선행(TSK-07-01 design.md·V10·엔티티) > 리포 기존 관례(TSK-04-02·04-03·04-04·01-03 코드) > 미승인 선행(TSK-01-03 design.md).
> 도커 금지 모드다(출처: 워커 기본). 「도커 금지로 생략한 검증」 절을 본다.
> 마이그레이션: **없음**(§1 마지막 단락, D10). 스키마는 TSK-07-01 의 V10 을 그대로 쓴다.

---

## 0. 조사로 확인한 사실

Build·Verify 가 원천 문서를 다시 읽지 않아도 되게 적는다.

| # | 사실 | 근거 |
|---|---|---|
| F1 | spec 의 entry-point `mdd/dataItemMng`·`mdd/dataHistory` 의 그룹 코드 `mdd` 는 낡은 값이다. 화면 그룹 정본(`docs/mdm/screens/README.md` §2·§3, ADR-0003)과 wbs.md TSK-07-03(1159행)·TRD 패키지(`com.dongkuk.dmes.mdm.dmd.*`)는 모두 **`dmd`** 다. 메뉴 폴더 `dmd`("마스터데이터")는 `DataInitializer.java:880` 이 이미 시드하고, `MdmScreenGroup.DMD`·`MDM_GROUPS.dmd`(m-mdm `src/shell/mdm-groups.ts:11`)도 있다. 이 설계는 `dmd` 를 쓴다(D1). e2e 파일명은 수용 기준대로 그대로다 | README §3 표, `DataInitializer.java:880` |
| F2 | **dmd 권한은 dma 와 반대다.** `MdmPermissions.MATRIX`(`contract/security/MdmPermissions.java:43`)와 `DataInitializer.java:1015` 가 dmd 를 `MDM_STD_ADMIN=READ`, `MDM_STEWARD=EDIT` 로 매핑한다. READ = search·view·export·compare, EDIT = READ + save·delete·reg·import·validate·execute·copy·restore. 그래서 e2e 쓰기 단계는 **`e2e_mdm_steward`**/`admin123` 로 로그인해야 한다 | 조사 보고 |
| F3 | `MdmActions` 는 13종(search, view, export, compare, save, delete, reg, import, validate, execute, copy, restore, confirm)이고 `SecurityScreenContractTest:66-75` 가 집합을 고정한다. close·reopen·history 같은 새 액션을 만들면 이 테스트와 e2e 시드 대조(`mdm-rbac-seed-check.expected.txt` 11~13행)가 깨진다. 새 액션을 만들지 않고 13종 안에서 매핑한다(D9) | `MdmActions.java:9-21` |
| F4 | 액션 어휘 정적 검사 두 개(`MdmOasisActionVocabularyTest`, `DmaBpmnActionTest`)는 **dma 파일 이름을 하드코딩**한다. dmd BPMN 은 자동 검사를 받지 않으므로 새 정적 검사 `DmdBpmnActionTest` 를 둔다 | `MdmOasisActionVocabularyTest.java:37-44,85-89` |
| F5 | **`MdmTemporalSegmentStoreNoImplementationTest`**(`src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmTemporalSegmentStoreNoImplementationTest.java`)는 lib·api main 에 `MdmTemporalSegmentStore` 구현체가 하나라도 있으면 빨강이다(:47-52, :68-74). TSK-07-01 design.md §3.5·불변 규칙 6 이 "TSK-07-03 이 실 구현체를 넣는 순간 뒤집힌다(인계)"라고 적었다. 이 Task 가 구현체를 넣으므로 이 테스트를 "허용 패키지 `com.dongkuk.dmes.mdm.common.segment` 의 정해진 세 클래스만 구현체다"로 **뒤집는다**. 완화가 아니라 인계받은 교정이다. 음성 테스트(고립 `FakeSegmentStoreImpl`)는 유지한다 | TSK-07-01 design.md §3.5 |
| F6 | 계약 패키지(`contract..`)는 default·static 메서드, Spring·JPA·JDBC·entity 의존을 금지한다(`MdmContractArchitectureTest`). 그래서 구현체와 보조 record 는 계약 패키지 밖(`common.segment`)에 둔다. 계약 파일(`contract/data/*`)은 고치지 않는다 | `MdmContractArchitectureTest.java:54-60,89-100` |
| F7 | 계약 시그니처: `MdmTemporalSegmentStore<K,V>` 의 `register(K,V,LocalDateTime at)`·`modify(K,V,at)`·`close(K,at)`·`reopen(K,at)`, 결과 `MdmTemporalSegmentResult<V>(MdmTemporalSegmentAction action, V value)`, `MdmTemporalSegmentAction{INSERT,UPDATE,CLOSE,REOPEN,NONE}`, `MdmTemporalSegmentRules.OPEN_END = 9999-12-31T00:00:00`. 계약에는 row_version 인자가 없다. 그래서 row_version 비교는 계약 구현체가 아니라 그 위의 저장 코어(`DataItemSaveCore`)가 잠금 뒤에 한다 | `contract/data/*.java` |
| F8 | 엔티티(TSK-07-01): `MdmDataItem` 은 PK(`maruDataId`, `code`, `validFrom`)이고 `validFrom` 은 `@Type(MdmLocalDateTimeIdUserType)` 이다. `rowVersion` 은 plain `int` 이고 `@Version` 이 아니다. `MdmDataCate`·`MdmDataCateItem` 에는 ROW_VERSION 이 없다. 리포지토리 4개는 추가 메서드가 0개다. TSK-07-01 Verify 는 "VALID_FROM(Id UserType, VARCHAR 힌트)과 VALID_TO(TIMESTAMP)를 HQL 로 직접 비교하는 쿼리는 검증하지 못했다"고 인계했다 | `entity/MdmDataItem.java:40-44,61-63`, TSK-07-01 design.md 「발견사항」 |
| F9 | **리포에 비관적 행 잠금 선례가 없다.** `DefaultVersionStateService`·`VersionRowStore` 는 조건부 UPDATE(CAS, `WHERE ROW_VERSION = :expected`, 0행이면 `ROW_VERSION_CONFLICT`)만 쓴다. `VersionStateServiceMssqlTest` 에도 동시성 시나리오가 없다(mdm src·test·mssqlTest 전체에 Executor·CountDownLatch·Thread 사용 0건). 이 Task 의 잠금 문은 새로 정한다(D6). 네이티브 SQL 조립·감사 스탬프·`MdmTemporalBinder` 바인딩 방식은 `VersionRowStore`(`common/version/VersionRowStore.java`)를 본뜬다 | `VersionRowStore.java`, 조사 보고 |
| F10 | SQLite 설정(`application-local.yml`)에는 `foreign_keys` 드라이버 속성과 `metadata_builder_contributor`(`MdmSqliteTemporalContributor`)만 있고 풀 크기·busy_timeout·journal_mode 설정은 없다(라이브러리 기본값: Hikari 10, xerial busy_timeout 3000ms, 롤백 저널). SQLite 는 쓰기 잠금이 DB 전체 단위라서 행 잠금 제거 변이를 "겹침"으로 드러내지 못한다(겹침 대신 SQLITE_BUSY 가 난다) | `application-local.yml` |
| F11 | `cactus.oasis.transactional: true`(`application.yml:32`)라서 OASIS 액션 하나가 트랜잭션 하나다. 서비스 클래스에 `@Transactional` 을 붙이면 CGLIB 프록시가 파라미터 이름을 지워 `ParameterName must not be null` 로 죽는다. 트랜잭션이 필요한 코어는 `TransactionTemplate` 으로 호출자 트랜잭션에 합류한다(`DefaultVersionStateService` 선례) | `UnitMngService.java:36-37` |
| F12 | BPMN serviceTask 안에서 던진 예외는 화면에 `meta.success=false`·`meta.message` 만 가고 `errors[]` 는 비며 `meta.code` 는 `S001` 이다(`MdmErrors.java:16-18`, `DomainMngOasisFlowTest:162`). 그래서 화면은 **메시지 접두어**로 충돌·닫힌 키를 판정한다. `MdmErrors.of(code, detail, issues)` 의 메시지는 `defaultMessage + ": " + detail` 이다. `ROW_VERSION_CONFLICT`(MDM001) 기본 문구는 `"다른 사용자가 수정했습니다. 다시 불러오세요"` 다 | `MdmErrorCode.java:14`, `MdmErrors.java:25-44` |
| F13 | `MdmErrorCode` 는 21개이고 `CommonContractTest:48` 이 개수를 고정한다. 새 코드를 추가하면 그 테스트를 고쳐야 하고 형제 Task 와 충돌한다. 새 코드를 만들지 않고 `INVALID_INPUT`(MDM021)·`ROW_VERSION_CONFLICT`·`RESERVED_CATEGORY`(MDM012)를 쓴다(D11) | `CommonContractTest.java:48` |
| F14 | OASIS `params` 는 배열과 null 을 받지 못한다(TSK-04-02 Build 실측: 배열 → "Generic type", null → "The type cannot be determined"). FE 는 `omitNullish` 로 null 을 빼고 보낸다(`m-mdm/pages/dma/unitMng/api.ts:57-65`). 그래서 DTO 는 `lvl1`~`lvl5`, `attr01`~`attr10` 를 **따로 된 필드**로 받는다. 빠진 필드는 DTO 에서 null 이고, 화면 저장은 행 전체를 보내므로 "빠짐 = NULL" 이 05 페이로드 규칙과 맞는다. DTO 는 record 가 아니라 no-arg 생성자·getter/setter POJO 다(mdm 관례) | TSK-04-02 design.md 「Build 이탈」 |
| F15 | 메뉴 leaf 는 4조각이 한 세트다: `insertMcmSecObjIfAbsent` → `insertMcmSecMenuIfAbsent(objectId, menuSeq, fullSeq, name, parent, componentPath)` → SYSADMIN×`PERM_ALL` `insertIfAbsentComposite` → `seedMdmObjectRbac(objectId, group)`. 별도 메서드로 묶은 선례가 `seedMdmDomainMngMenu()`(`DataInitializer.java:1058-1071`, 호출 :911)다. objectId 는 `^[a-z][a-zA-Z0-9]*$` 여야 기동한다. FULL_SEQ 는 부팅 끝 `recomputeMenuFullSeq()` 가 다시 매긴다 | `DataInitializer.java:886-907` |
| F16 | dev 에는 마루 데이터가 한 건도 없다(TSK-07-02 가 병렬 형제이고 이 Task 가 의존하지 않는다). e2e 는 Flyway 뒤 mdm.db 에 적재하는 픽스처 SQL 이 있어야 한다. EXTERNAL 원천의 FK 대상 `ERP` 는 V2 가 이미 시드한다(`V2__create_mdm_system.sql:21`). mdm.db 픽스처 선례는 `src/frontend/e2e/fixtures/mdm-columnMng-dict.sql`(INSERT OR IGNORE, mdm 기동 뒤 `sqlite3` 로 적재)다 | 조사 보고 |
| F17 | 포털 탭 사이에 파라미터를 넘길 수단이 없다. 탭을 여는 수단은 창 이벤트 `portal-open-tab`(pageId 만) 하나이고 업무 화면 선례가 없으며, 같은 pageId 탭이 열려 있으면 다시 초기화하지 않는다(`shared/src/portal-shell/portal-shell.tsx:379-385,579-589`). 「이력」 링크는 탭 이동 대신 같은 화면 안 이력 패널로 연다(D8) | 조사 보고 |
| F18 | shared 그리드: `AgDataGrid` 는 페이징 prop 이 없고 별도 `Pagination`(`@dk-oasis/shared/grid`, props `page`(0부터)·`totalPages`·`totalElements`·`onPageChange`·`disabled`)을 `GridPanel` 안에 둔다(선례 `m-mcm/page-components/cmb/masterRuleData/page.tsx:14,402,434-442`). 인라인 편집은 `GridColumn.editable`(boolean 또는 `(row)=>boolean`)·`cellEditor`·그리드 prop `onCellValueChanged({rowKey,field,newValue,oldValue,row})`·`singleClickEdit` 로 한다(`shared/src/components/grid/AgDataGrid.tsx:166-200,269-285`, 선례 `m-mdm/pages/dma/columnMng/page.tsx:428-455,923-936`). 셀 안 버튼은 `render: (_v,row) => <Button …>`(선례 `pages/dma/termRegPop/termRegPop.tsx:175-195`). 동적 열은 `columns` 배열을 `useMemo` 로 다시 만들면 된다(masterRuleData :85-101). AgDataGrid 정렬은 클라이언트 쪽이라 서버 페이징 화면에서는 `sortable={false}` 로 둔다 | 조사 보고 |
| F19 | m-mdm 화면은 `@mantine/*`·`ag-grid-*` 를 import 하지 않는다(Part B §4-2·§6·§17). `@dk-oasis/shared/{layout,form,grid,message-provider,http}` 만 쓴다. `modal`·`tabs`·`utils`·`lib` 은 ASK 라서 쓰지 않는다. 오류는 `ErrorModal`(`@dk-oasis/shared/layout`, e2e 선택자 `.error-modal__body`), 성공은 `useMessage().showMessage({message, toast:true})` 로 알린다. 날짜 표시 유틸·"열림" 표기 유틸·타임라인 컴포넌트는 shared 에 없다 — 서버가 `'yyyy-MM-dd HH:mm:ss'` 문자열을 주고 화면은 그대로 보인다 | Part B, 조사 보고 |
| F20 | `tsup-entries.smoke.test.ts` 가 디스크의 `pages/{group}/{leaf}/page.tsx` 와 `tsup.config.ts` 의 `pages/…/page` 엔트리를 정렬 후 정확히 대조한다. 새 page.tsx 두 개에 엔트리 두 줄을 더해야 한다. vitest include 는 `tests/**/*.test.ts` 라 `.tsx` 테스트는 돌지 않는다(렌더 테스트는 `createElement` 사용, 첫 줄 `/** @vitest-environment happy-dom */`, 선례 `tests/dma/unitMng/unit-mng-page.test.ts`) | 조사 보고 |
| F21 | `m-mcm/lib/generated/page-registry.ts` 는 codegen 산출물이지만 **커밋된 파일**이다. 선례는 화면 Task 가 재생성본을 따로 커밋했다(`7b5898b chore(m-mcm): unitMng·termMng 화면을 page-registry에 등록한다(codegen)`). 생성 스크립트는 `src/frontend/m-mcm/scripts/generate-page-registry.mjs`(predev·prebuild 훅)다 | `/usr/bin/git log` |
| F22 | 감사 칼럼 `C_AT`·`U_AT` 는 `CactusAuditEntity` 리스너가 `Instant.now()` 로 채우고, 네이티브 쓰기는 `MdmNativeAuditSupport.currentStamp()`(`AuditStamp(userId, serviceId, programId, at)`, `Instant.now(clock)`)로 명시한다. 감사 `VER` 는 `@Version` 이 아니라 INSERT 0, UPDATE +1 카운터다(`VersionRowStore.auditSet` 은 `COALESCE(counter,0)+1`) | `CactusAuditEntity`, `VersionRowStore.java` |
| F23 | 시각: 서비스는 `Clock` 빈(`MdmClockConfig`, KST)을 주입받는다. `MdmTemporalBinder.toDb(LocalDateTime)` 이 초 단위로 잘라 SQLite 는 `'yyyy-MM-dd HH:mm:ss'` 문자열, MSSQL 은 `LocalDateTime` 을 돌려준다. `fromDb(Object)` 는 String·Timestamp·LocalDateTime 을 받는다. `MdmLocalDateTimeIdUserType` 는 값을 자르지 않으므로 서비스가 `at` 을 `truncatedTo(SECONDS)` 해야 한다 | `MdmTemporalBinder.java:25-64` |
| F24 | 테스트 격리 관례: `@SpringBootTest(webEnvironment=MOCK)` + `@ActiveProfiles("local")` + `@TempDir static Path` + `@DynamicPropertySource` 로 `spring.datasource.url=jdbc:sqlite:<tempDir>/<클래스별 파일>.db`. 현재 사용자는 `@Import(DmaTestSupport.Config.class)`(`api/src/test/java/com/dongkuk/dmes/mdm/dma/DmaTestSupport.java`)의 `@Primary MutableCurrentUser`, 시계는 `VersionScenarioFakes.MutableClock`(`api/src/test/java/com/dongkuk/dmes/mdm/common/version/VersionScenarioFakes.java:50-78`, `setLocal(LocalDateTime)`)을 `@Primary` 빈으로 넣는다. 서비스는 OASIS 처럼 커밋되게 `TransactionTemplate` 으로 감싸 호출하고 `JdbcTemplate` 으로 확인한다(`ColumnMngServiceSqliteTest:52-59,91-95`). HTTP 통합은 `RANDOM_PORT` + `java.net.http.HttpClient` 로 `POST /oasis/{service}/{action}`, 헤더 `X-Client-Key`·`X-Authenticated-User`·`X-Authenticated-Role`(`DmaOasisHttpTest:41-43,222-266`) | 조사 보고 |
| F25 | mssqlTest 소스셋: `src/backend/mdm/api/src/mssqlTest/java/…`, 공용 서버 `MdmMssqlServer.newDatabase(label)`(+`user()`·`password()`), `@ActiveProfiles("local-db")` + `@DynamicPropertySource`(선례 `MdmMasterDataMssqlMigrationTest:42-60`, `VersionStateServiceMssqlTest`). Gradle 태스크는 `:api:mssqlMigrationTest`(`src/backend/mdm/api/build.gradle`)이고 testAll(`:test` 만)에 들어가지 않는다. testAll 은 mssqlTest 소스를 **컴파일하지도 않는다** | `build.gradle` |
| F26 | 화면 설계 산출물 5종(`docs/mdm/screens/{screenId}/`)은 만들지 않는다. TSK-04-02 D10 과 같은 근거(선행 mdm 화면 Task 전부 미작성, 이번 팀장 지시 없음)다. 식별자 사전 §A.3.2 등재도 선례가 없어 하지 않는다 | TSK-04-02 design.md D10 |

---

## 1. 접근 방식

이 Task 는 세 덩어리다. **(가) 일시 선분 저장 코어**, **(나) 항목 관리 화면 `dmd/dataItemMng`**, **(다) 항목 이력 화면 `dmd/dataHistory`** 다. 코어가 핵심이고 두 화면은 코어 위의 얇은 OASIS 서비스다.

**(가) 저장 코어**는 `com.dongkuk.dmes.mdm.common.segment` 패키지(lib)에 둔다. `common.version` 처럼 여러 Task 가 쓰는 공용 코어이기 때문이다(07-03 화면, 07-04 CSV, 07-02 카테고리가 쓸 수 있다). 코어는 두 층이다.
- 아래층은 계약 `MdmTemporalSegmentStore<K,V>` 의 구현체 셋(`DataItemSegmentStore`·`DataCateSegmentStore`·`DataCateItemSegmentStore`)이다. 05 「선분과 닫기」의 네 연산(등록·수정·닫기·다시 열기)을 **검사 없이** 수행한다. 호출자가 잠금을 쥐었다고 가정한다.
- 위층은 `DataItemSaveCore`·`DataCategorySegmentCore` 다. 한 사건마다 순서가 고정이다: ① 저장 시각 결정 → ② `TB_MDM_DATA` 행 잠금(선분·마루 데이터 행을 읽기 전) → ③ 잠금 뒤 마루 데이터 행과 그 키의 선분 행을 **네이티브 SQL 로** 다시 읽기 → ④ 검사 1~7 → ⑤ row_version 비교 → ⑥ 경계 시각 확정 → ⑦ 아래층 연산.
- 읽기·쓰기는 전부 네이티브 SQL(`DataSegmentRowStore`)로 한다. 이유는 셋이다. 잠금 뒤 읽기가 영속성 컨텍스트의 옛 엔티티를 다시 쓰면 잠금이 무의미해진다. TSK-07-01 이 VALID_FROM·VALID_TO 의 HQL 비교를 검증하지 못했다(F8). 리포 선례 `VersionRowStore` 가 같은 방식이다(F9). 감사 칼럼은 `MdmNativeAuditSupport` 로 명시한다(F22).

**행 잠금**은 `UPDATE TB_MDM_DATA SET LAST_CHG_SEQ = LAST_CHG_SEQ WHERE MARU_DATA_ID = :id` 다(D6). 방언 중립이고 값을 바꾸지 않는다(배포 순번 발급은 PRD §2 규칙 7 로 보류). MSSQL 은 이 문이 커밋까지 그 행에 X 잠금을 쥐어 같은 마루 데이터의 사건을 직렬화한다. SQLite 는 DB 전체 쓰기 잠금이라 어차피 직렬화된다. 그래서 **잠금을 빼는 변이는 SQLite 게이트로 잡히지 않는다**(F10). SQLite 로 잡을 수 있는 것만 SQLite 테스트로 덮는다: 잠금 호출 누락·순서 뒤바뀜(호출 순서 기록), 잠금 문이 쓰기 문이 아닌 변이(다른 JDBC 연결의 `BEGIN IMMEDIATE` 가 SQLITE_BUSY 를 받는지), 잠금 문이 값을 바꾸는 변이(LAST_CHG_SEQ·VER 불변), 0행이면 거부, row_version 충돌, 직렬 호출의 겹침 0. 실제 동시 저장의 겹침 0 은 mssqlTest 의 동시성 테스트로 설계하되 도커 금지라 워커가 돌리지 않는다. 수용 기준 매핑에 "확인하지 못함"으로 적는다.

**row_version** 은 "그 키의 마지막 행"(valid_from 이 가장 큰 행) 값이 클라이언트가 본 값과 같을 때만 쓰기를 허용한다. 수정의 새 행은 옛 값 +1, 닫기는 닫는 행을 +1, 다시 열기의 새 행은 마지막 행 +1 이다(D7). 그래서 오래된 화면의 저장은 어느 사건 뒤에도 `ROW_VERSION_CONFLICT` 로 막힌다.

**같은 초 경계**: 저장 시각은 초 단위라서 한 키에 같은 초 사건이 두 번 오면 PK 충돌이나 길이 0 구간이 생긴다. 05 「선분과 닫기」의 "같은 키의 사건은 앞 사건보다 뒤 시각이다"를 지키려고, 저장 시각이 그 키의 마지막 경계 이하이면 마지막 경계 +1초로 민다(D5).

**E1~E6·X1~X4 재현**: 이 Task 가 소유하지 않는 사건(E1 마루 데이터 생성, E2 라벨 지정은 TSK-07-02 몫)은 테스트 픽스처로 만들고, 선분 결과는 전부 코어로 만든다. E3(CSV 3,000건)은 코어의 일괄 upsert 로(D3), X1~X4(수신 API)는 코어의 API 경로 검사 집합(검사 1·2만)으로 재현한다(D2). 순번 칸과 수신 로그(RECV)는 뺀다. 재현은 05 표를 그대로 옮긴 데이터 주도 테스트다(§3.2 T-EX).

**(나) 항목 관리 화면**은 서버 페이징 그리드다. 마루 데이터를 고르면 머리 정보(`view`)로 동적 열(계층 1..`lvl_cnt`, 라벨 있는 추가 컬럼)을 만들고 `search` 로 한 쪽을 받는다. 열린 행의 칸은 그 자리에서 고치고 행의 「저장」으로 1건을 저장한다. 「닫기」「다시 열기」「이력」 버튼이 행마다 있다. 등록은 오른쪽 등록 패널(`ContentPanel`)로 한다. `ROW_VERSION_CONFLICT` 문구를 받으면 "다른 사용자가 수정했습니다"를 보이고 목록을 다시 부른다. EXTERNAL 원천이거나 DEPRECATED 면 조회 전용이다.

**(다) 항목 이력 화면**은 (마루 데이터, 대상 = 항목/카테고리/소속, 키)의 선분 행을 시간순으로 보인다. 사건 이름(생성·변경·다시 열기), 빈 구간(닫혀 있던 구간), 마지막 상태(열림·소멸)는 **서버가 계산**해 내려 준다. 화면은 그대로 그린다. 같은 타임라인 컴포넌트를 항목 관리 화면의 「이력」 패널이 재사용한다(D8).

**스키마는 바꾸지 않는다.** "키당 열린 행 하나"를 DB 로 강제하는 필터 유일 인덱스는 넣지 않는다(D10). 잠금·CAS 가 그 역할을 하고, MSSQL 필터 인덱스는 도커 금지로 검증할 수 없으며, TSK-07-01(승인)이 PK 를 "원래 키 + valid_from"으로만 정했다. 그래서 Flyway 마이그레이션 번호도 고르지 않는다. Build 가 스키마 변경이 필요하다고 판단하면 dev-discipline 「마이그레이션 버전」대로 `/usr/bin/git fetch origin` 후 `/usr/bin/git ls-tree --name-only origin/dev src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/` 로 최대 번호를 보고 그 다음 번호를 sqlite·mssql 짝으로 쓰고, 이탈로 적는다.

---

## 2. 변경 파일 목록

### 생성 — 백엔드 저장 코어 (lib, `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/segment/`)

| 파일 | 내용 |
|---|---|
| `package-info.java` | 패키지 설명: 05 일시 선분 저장 코어, 불변 규칙 번호 목록 |
| `DataSavePath.java` | enum `SCREEN`, `CSV`, `API`. 검사 집합을 가른다(C0) |
| `DataItemKey.java` | record `(String maruDataId, String code)` |
| `DataCateKey.java` | record `(String maruDataId, String cateId)` |
| `DataCateItemKey.java` | record `(String maruDataId, String cateId, String code)` |
| `DataItemValue.java` | record `(String name, String alterName, Integer seq, String description, List<String> lvl /*5개, null 허용*/, List<String> attr /*10개*/)`. 정적 팩토리 `normalized(...)` 가 trim 하고 빈 문자열을 null 로, 리스트 길이를 5·10 으로 맞춘다(S5). `sameAs(DataItemValue)` 는 S5 의 필드 비교 |
| `DataCateValue.java` | record `(String cateName, String defKind, String defExpr, String defTarget, String description)` |
| `ItemSegmentRow.java` · `CateSegmentRow.java` · `CateItemSegmentRow.java` | 네이티브 읽기 결과 record(키, `validFrom`, `validTo`, 값, `rowVersion`(ITEM 만), `chgSeq`). `isOpen()` = `validTo.equals(OPEN_END)` |
| `LockedMaruData.java` | record `(maruDataId, status, sourceKind, sourceSystem, codePattern, int lvlCnt, List<String> attrNames /*10개*/)` — 잠금 뒤 읽은 마루 데이터 행 |
| `DataSegmentLock.java` | `@Component`. `LockedMaruData lock(String maruDataId)`: ① 잠금 UPDATE(L2) 실행, 0행이면 `MdmErrors.of(INVALID_INPUT, "없는 마루 데이터입니다: "+id, …)`(L3) ② 같은 행을 네이티브 SELECT 해 `LockedMaruData` 로 돌려준다. 잠금 SQL 문자열은 `static final String LOCK_SQL` 상수로 둔다 |
| `DataSegmentRowStore.java` | `@Repository`. `EntityManager` 네이티브 쿼리 전용(`VersionRowStore` 패턴: 쿼리 전 `flush()`, 문자열 null 은 `setParameter(name, v, String.class)`, 일시는 `MdmTemporalBinder`). 메서드: `itemRows(md, code)`(valid_from 오름차순), `latestItemRows(md)`(키별 마지막 행 — 5-1 검사용), `insertItem(ItemSegmentRow, AuditStamp)`, `closeItem(md, code, validFrom, at, Integer expectedRowVersion, boolean bumpRowVersion, AuditStamp)`(조건 `VALID_TO = :openEnd` 와 expected 가 있으면 `ROW_VERSION = :expected` 를 붙인 CAS, 갱신 행 수 반환), `cateRows`·`insertCate`·`closeCate`, `cateItemRows`·`insertCateItem`·`closeCateItem`. INSERT 는 `CHG_SEQ` 를 0 으로, 감사 `VER` 를 0 으로 명시한다. UPDATE 는 `U_*` 와 `VER = COALESCE(VER,0)+1` 을 쓴다(S13) |
| `SegmentBoundary.java` | `static LocalDateTime next(LocalDateTime now, Collection<? extends SegmentRow> rows)`: now 를 초로 자르고, 그 키 행들의 최대 경계(`validFrom` 과 `OPEN_END` 가 아닌 `validTo` 중 최댓값)가 now 이상이면 최대 경계+1초(S9) |
| `DataItemSegmentStore.java` | `@Component`, `implements MdmTemporalSegmentStore<DataItemKey, DataItemValue>`. 검사 없는 네 연산(S1·S2·S3·S6·S7). `modify` 는 값이 같으면 쓰기 없이 `NONE`(S5) |
| `DataCateSegmentStore.java` | `implements MdmTemporalSegmentStore<DataCateKey, DataCateValue>`. 카테고리 선분 네 연산 |
| `DataCateItemSegmentStore.java` | `implements MdmTemporalSegmentStore<DataCateItemKey, Void>`. 소속 등록(새 행)·닫기(소속 해제)·다시 열기(다시 소속 = 새 행). `modify` 는 값이 없어 항상 `NONE` |
| `DataItemChecks.java` | `@Component`. 05 검사 순서 1~7. `List<MdmCheckIssue> check(DataSavePath, LockedMaruData, String callerSystem, …)` 류 메서드로 나눈다: `requireActive`(C1), `requireSourcePath`(C2), `rowIssues(path, locked, code, value, isNew)`(C3·C4·C5·C5-2), `hierarchyIssues(locked, code, value, latestOtherRows)`(C5-1), `membershipIssues(itemRows, cateRows)`(C7). 이슈 `code` 는 `"CHK1"`~`"CHK7"`, `"CHK5-1"`, `"CHK5-2"` |
| `DataItemMessages.java` | 화면이 접두어로 판정하는 고정 문구 상수(A2): `CLOSED_KEY_REOPEN = "닫힌 키입니다. 새로 등록할 수 없으니 다시 여세요"`, `KEY_EXISTS = "이미 있는 키입니다"`, `NOT_OPEN = "열린 행이 없습니다(닫힌 항목)"`, `ALREADY_OPEN = "이미 열려 있습니다"`, `DEPRECATED = "폐기된 마루 데이터입니다"`, `SOURCE_MISMATCH = "원천이 맞지 않아 저장할 수 없습니다"` 등. 충돌 문구는 `MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage()` 를 그대로 쓴다 |
| `DataItemSaveCore.java` | `@Component`(OASIS 진입점이 아니다). `TransactionTemplate` 으로 호출자 트랜잭션에 합류한다. 공개 메서드: `register(String md, String code, DataItemValue v)`, `modify(String md, String code, DataItemValue v, int expectedRowVersion)`, `close(String md, String code, int expectedRowVersion)`, `reopen(String md, String code, int expectedRowVersion)` — 모두 `DataSavePath.SCREEN`; `UpsertResult upsert(String md, DataSavePath path, String callerSystem, List<UpsertRow> rows, boolean dryRun)` — CSV·API 경로(D2·D3). 반환 `SaveOutcome(MdmTemporalSegmentAction action, ItemSegmentRow latest, LocalDateTime at)` |
| `UpsertRow.java` · `UpsertResult.java` | upsert 입력(`code`, `DataItemValue`)과 결과(행마다 `code`·`action`, 검사 이슈 목록, 저장 시각). `dryRun` 이거나 이슈가 있으면 쓰지 않는다 |
| `DataCategorySegmentCore.java` | `@Component`. 카테고리 `registerCate`·`modifyCate`·`closeCate`·`reopenCate`(BASE 는 수정·닫기 거부 `RESERVED_CATEGORY`, S14), 소속 `addMember`·`removeMember`(C7 검사, TABLE 카테고리만). 순서는 `DataItemSaveCore` 와 같다(L1). 화면은 없다(D4) |

### 생성 — 백엔드 화면 서비스 (lib, `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmd/`)

| 파일 | 내용 |
|---|---|
| `dataItemMng/service/DataItemMngService.java` | `@Service("dataItemMngService")`, `@Transactional` 금지(F11). 메서드: `view(DataItemViewRequest)`, `search(DataItemSearchRequest)`, `register(DataItemSaveRequest)`, `modify(DataItemSaveRequest)`, `close(DataItemKeyRequest)`, `reopen(DataItemKeyRequest)`. 쓰기 넷은 `DataItemSaveCore` 에 위임하고 결과 행을 `DataItemRow` 로 돌려준다 |
| `dataItemMng/service/DataItemListQuery.java` | `@Repository`. 목록 네이티브 쿼리(Q1~Q4): 키별 마지막 행(`NOT EXISTS (… x.VALID_FROM > i.VALID_FROM)`), 키·이름 부분 일치(`UPPER(CODE) LIKE UPPER(:k) ESCAPE '\'`, `NAME LIKE :n ESCAPE '\'`, `%`·`_`·`\` 는 이스케이프), 닫힌 항목 제외 조건, TABLE 카테고리면 열린 소속 `EXISTS`, 정렬 `CASE WHEN SEQ IS NULL THEN 1 ELSE 0 END, SEQ, CODE`. 페이지는 `setFirstResult`/`setMaxResults`(Hibernate 가 방언별 LIMIT/OFFSET FETCH 로 바꾼다). REGEX 카테고리(BASE 제외)면 페이지 없이 후보를 모두 읽어 Java `Pattern.matches` 로 거른 뒤 메모리에서 쪽을 자른다 |
| `dataItemMng/dto/DataItemViewRequest.java` | `maruDataId`(선택). 없으면 마루 데이터 목록만 |
| `dataItemMng/dto/DataItemViewResult.java` | `maruDataOptions: List<MaruDataOption>`(id·name·status·sourceKind), `header: DataItemHeader`(선택된 경우) |
| `dataItemMng/dto/MaruDataOption.java` · `DataItemHeader.java` · `AttrLabel.java` · `CategoryOption.java` | 머리: `maruDataId`, `maruDataName`, `status`, `sourceKind`, `sourceSystem`, `lvlCnt`, `attrLabels: List<AttrLabel>`(`AttrLabel(field "attr01", label)`, 라벨 있는 번호만, 번호 순. 배열 금지는 요청 `params` 에만 해당하고 응답은 목록을 담아도 된다), `editable`(MDM && INUSE), `categories`(열린 카테고리 id·name·defKind) |
| `dataItemMng/dto/DataItemSearchRequest.java` | `maruDataId`(필수), `code`, `name`, `cateId`(없으면 BASE), `showClosed`(Boolean), `page`(0부터, 기본 0), `size`(기본 50, 상한 200) |
| `dataItemMng/dto/DataItemSearchResult.java` | `list: List<DataItemRow>`, `totalCount`, `page`, `size` |
| `dataItemMng/dto/DataItemRow.java` | `code`, `name`, `alterName`, `seq`, `description`, `lvl1`~`lvl5`, `attr01`~`attr10`, `validFrom`·`validTo`(문자열 `yyyy-MM-dd HH:mm:ss`), `open`, `rowVersion` |
| `dataItemMng/dto/DataItemSaveRequest.java` | `maruDataId`, `code`, `name`, `alterName`, `seq`(Integer), `description`, `lvl1`~`lvl5`, `attr01`~`attr10`, `expectedRowVersion`(Integer, 등록은 무시) |
| `dataItemMng/dto/DataItemKeyRequest.java` | `maruDataId`, `code`, `expectedRowVersion` |
| `dataItemMng/dto/DataItemSaveResult.java` | `action`(INSERT/UPDATE/CLOSE/REOPEN/NONE), `row: DataItemRow`, `at` |
| `dataHistory/service/DataHistoryService.java` | `@Service("dataHistoryService")`. `view(DataHistoryViewRequest)`(마루 데이터 목록 + 선택 시 머리·카테고리 목록), `search(DataHistoryRequest)`(H1~H3). 읽기 전용이라 잠금을 잡지 않는다 |
| `dataHistory/dto/DataHistoryViewRequest.java` · `DataHistoryViewResult.java` | view 입출력(머리는 `DataItemHeader` 재사용) |
| `dataHistory/dto/DataHistoryRequest.java` | `maruDataId`, `target`(`ITEM`/`CATE`/`CATE_ITEM`), `key`(항목 키 또는 카테고리 ID), `cateId`(소속일 때 카테고리) |
| `dataHistory/dto/DataHistoryResult.java` | `header`, `target`, `rows: List<DataHistoryRow>`, `state`(`OPEN`/`CLOSED`/`NONE`) |
| `dataHistory/dto/DataHistoryRow.java` | `validFrom`, `validTo`, `open`, `event`(`CREATED`/`CHANGED`/`REOPENED`), `rowState`(`OPEN`/`PAST`/`CLOSED`), `gapFrom`·`gapTo`(앞 행과 사이의 닫혀 있던 구간, 없으면 null), 항목 값 칸(`name`…`attr10`, `rowVersion`), 카테고리 값 칸(`cateName`, `defKind`, `defTarget`, `defExpr`) |

### 생성 — BPMN (`src/backend/mdm/api/src/main/resources/services/dmd/`)

`unitMng.bpmn` 구조를 그대로 본뜬다(process id = serviceId, `exclusiveGateway id="actionGateway"` + `camunda:property name="input" value="action"`, 분기 `sequenceFlow name="<action>"`, serviceTask `camunda:class="<빈 이름>"` + property `method`·`output=result`·`dto=<FQCN>`, 태스크마다 endEvent, `conditionExpression`·`grid` 속성 없음). 구조 편집은 `bpmn-skill`(bpmn-tool)로 만들고 OASIS 속성은 oasis-project-support 기준으로 붙인다.

| 파일 | action → method |
|---|---|
| `dataItemMng.bpmn` | `view→view`, `search→search`, `reg→register`, `save→modify`, `delete→close`, `restore→reopen` (D9) |
| `dataHistory.bpmn` | `view→view`, `search→search` |

### 생성 — 백엔드 테스트 (`src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/`)

| 파일 | 덮는 것 |
|---|---|
| `common/segment/DmdSegmentTestSupport.java` | 공용 픽스처: `@TestConfiguration` 에 `@Primary MutableClock`(VersionScenarioFakes 재사용)·`DmaTestSupport.Config` import, 마루 데이터·카테고리·항목 네이티브 삽입 헬퍼(`insertMaruData(id, sourceKind, sourceSystem, status, lvlCnt, labels…)`, `insertBase(id, at)`), 겹침 질의 `overlapCount(md)`, 키당 열린 행 수 `maxOpenRowsPerKey(md)` |
| `common/segment/DataItemSegmentCoreSqliteTest.java` | S1~S13 (§3.2 T-S) |
| `common/segment/DataItemChecksSqliteTest.java` | C0~C7 (§3.2 T-C) |
| `common/segment/DataSegmentLockSqliteTest.java` | L1~L3·S12 (§3.2 T-L) |
| `common/segment/DataCategorySegmentCoreSqliteTest.java` | S14·C7·카테고리·소속 선분 (§3.2 T-K) |
| `common/segment/MasterDataExamplesScenarioTest.java` | E1~E6·X1~X4 데이터 주도 재현 (§3.2 T-EX) |
| `dmd/dataItemMng/DataItemMngServiceSqliteTest.java` | Q1~Q6 (§3.2 T-Q) |
| `dmd/dataHistory/DataHistoryServiceSqliteTest.java` | H1~H3 (§3.2 T-H) |
| `dmd/DmdOasisHttpTest.java` | A2·A4 HTTP 왕복 (§3.2 T-A) |
| `dmd/DmdBpmnActionTest.java` | A1 정적 BPMN 검사 (§3.2 T-A) |

### 생성 — mssqlTest (도커 금지: 작성만, 실행·컴파일 확인 안 함)

| 파일 | 내용 |
|---|---|
| `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/dmd/DataSegmentConcurrencyMssqlTest.java` | §3.3. `MdmMssqlServer.newDatabase("dataseg")`, `@ActiveProfiles("local-db")`, 스레드 동시성 시나리오 M1~M4 |

### 수정 — 백엔드

| 파일 | 내용 |
|---|---|
| `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmTemporalSegmentStoreNoImplementationTest.java` | F5. "구현체 0개" 단언을 "구현체 집합 == {`common.segment.DataItemSegmentStore`, `DataCateSegmentStore`, `DataCateItemSegmentStore`}"로 바꾸고, 그 셋이 모두 `com.dongkuk.dmes.mdm.common.segment` 에 있음을 단언한다. 임포트 확인 테스트와 음성 테스트(`FakeSegmentStoreImpl`)는 그대로 둔다. 메서드 이름도 새 사실에 맞게 바꾼다. TSK-07-01 이 인계한 교정이다 |
| `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` | 새 메서드 `seedMdmDataItemMenus()` 를 추가하고 `seedMdmMenus()` 끝(TSK-04-04 블록 뒤)에 호출 **한 줄만** 더한다. 기존 줄은 고치지 않는다. 내용: `dataItemMng`("항목 관리", MENU_SEQ `"004"`, FULL_SEQ `"5040400"`, parent `"dmd"`, componentPath `"dataItemMng"`)와 `dataHistory`("항목 이력", `"005"`, `"5040500"`)를 F15 의 4조각으로, `seedMdmObjectRbac(id, "dmd")`. 로그 한 줄. MENU_SEQ 001~003 은 TSK-07-02(dataMng·dataEdit·dataCateEdit) 몫으로 비워 둔다 |

### 생성 — 프런트 (`src/frontend/m-mdm/`)

| 파일 | 내용 |
|---|---|
| `pages/dmd/dataItemMng/page.tsx` | `MdmPageLayout group="dmd" screenId="dataItemMng" title="항목 관리"`. SearchArea(마루 데이터 `Select`, 키 `Input`, 이름 `Input`, 카테고리 `Select`, "닫힌 항목 보기" `Checkbox`) → GridPanel(`count={totalCount}`) 안 `AgDataGrid`(`sortable={false}`, `columnSizing="fit"`, `singleClickEdit`, `onCellValueChanged`) + `Pagination` → 오른쪽 `ContentPanel` 등록 폼(「항목 추가」) → 아래 `ContentPanel` 이력 패널(`DataHistoryTimeline`). 행 버튼: 초안 있는 열린 행 = 저장·취소, 초안 없는 열린 행 = 닫기·이력, 닫힌 행 = 다시 열기·이력, 조회 전용 = 이력. 버튼 권한은 `useUserButtonRbac(true)` + `canDoButton(rbac, "dataItemMng", <action>)`(columnMng 선례) |
| `pages/dmd/dataItemMng/api.ts` | `callOasis("dataItemMng", action, params)`(columnMng `api.ts:46-67` 패턴, `omitNullish`, `unwrap`). `viewDataItems`, `searchDataItems`, `registerDataItem`, `modifyDataItem`, `closeDataItem`, `reopenDataItem` |
| `pages/dmd/dataItemMng/types.ts` | 서버 DTO camelCase 그대로, `emptyFilters()`, `emptyItemForm()` |
| `pages/dmd/dataItemMng/columns.ts` | 순수 함수 `buildItemColumns(header, handlers): GridColumn[]`(Q5·Q6), `toSaveParams(row)`(A4·S5: 빈 문자열 → 키 생략), `isRowVersionConflict(message)`·`isClosedKeyGuide(message)`(A2·F1) |
| `pages/dmd/dataItemMng/messages.ts` | 서버와 같은 고정 문구 상수(`ROW_VERSION_CONFLICT_PREFIX = "다른 사용자가 수정했습니다"`, `CLOSED_KEY_REOPEN`) |
| `pages/dmd/dataHistory/page.tsx` | `MdmPageLayout group="dmd" screenId="dataHistory" title="항목 이력"`. SearchArea(마루 데이터 `Select`, 대상 `Select`(항목/카테고리/소속), 소속이면 카테고리 `Select`, 키 `Input`, 조회 버튼) → `DataHistoryTimeline` |
| `pages/dmd/dataHistory/DataHistoryTimeline.tsx` | 표시 전용 컴포넌트(props: `result: DataHistoryResult`). `AgDataGrid` 한 개로 행을 시간순으로 그리고, `gapFrom` 이 있는 행 앞에 "닫혀 있던 구간" 줄을 서버 값 그대로 끼운다(행 데이터를 합성할 뿐 계산하지 않는다, F2). 사건·상태 배지는 m-mdm `@/shell` 의 `badgeStyle` 을 쓴다. 빈 결과면 "행이 없습니다" 빈 상태 |
| `pages/dmd/dataHistory/api.ts` · `types.ts` | `callOasis("dataHistory", …)`, `viewDataHistory`, `searchDataHistory` |
| `tests/dmd/dataItemMng/data-item-columns.test.ts` | Q5·Q6·A4·S5(FE 정규화)·F1 판정 함수 |
| `tests/dmd/dataItemMng/data-item-page.test.ts` | 렌더 스모크(fetch mock: view·search 응답 → 동적 열 머리가 라벨로 보인다, EXTERNAL 이면 「항목 추가」 비활성) |
| `tests/dmd/dataHistory/data-history-page.test.ts` | 렌더 스모크(fetch mock: 3행 + 빈 구간 → "닫혀 있던 구간" 줄, 빈 결과 문구) |
| `tsup.config.ts`(수정) | 엔트리 두 줄 추가: `"pages/dmd/dataItemMng/page": "pages/dmd/dataItemMng/page.tsx"`, `"pages/dmd/dataHistory/page": "pages/dmd/dataHistory/page.tsx"`. 기존 줄은 고치지 않는다 |

### 생성·수정 — e2e 와 산출물

| 파일 | 내용 |
|---|---|
| `src/frontend/e2e/mdm-dataItemMng.spec.ts` | §3.1 스모크 넷 + 수용 기준 3·4 |
| `src/frontend/e2e/mdm-dataHistory.spec.ts` | §3.1 스모크 넷(3은 대체 확인) |
| `src/frontend/e2e/fixtures/mdm-dataItem.sql` | mdm.db 픽스처(INSERT OR IGNORE, §3.1 표). 다른 Task 픽스처와 겹치지 않게 ID 를 `E2E_DI_` 로 시작한다 |
| `src/frontend/m-mcm/lib/generated/page-registry.ts` | codegen 재생성본(`dmd/dataItemMng`, `dmd/dataHistory` 두 줄). 손으로 고치지 않고 `cd src/frontend/m-mcm && node scripts/generate-page-registry.mjs` 로 만든 결과를 **별도 커밋**한다(F21) |
| `docs/mdm/tasks/TSK-07-03/screens/*.png` | e2e 스크린샷(`dmd-dataItemMng-*.png`, `dmd-dataHistory-*.png`) |

### 바꾸지 않음(참고만)

- `contract/data/*`, `contract/category/*`, `contract/security/*`(MdmActions·MdmPermissions), `MdmErrorCode`: 재사용만 한다(F3·F6·F13).
- `V10__create_mdm_master_data.sql`(두 방언), 엔티티·리포지토리(TSK-07-01): 그대로 쓴다. 이 Task 의 쓰기는 네이티브라 리포지토리 메서드를 더하지 않는다.
- `MdmOasisActionVocabularyTest`·`DmaBpmnActionTest`·`mdm-rbac-seed-check.*`·`mdm-shell-rbac-smoke.spec.ts`: 새 leaf·새 BPMN 을 더해도 그대로 통과한다(F4, 조사 보고 7·8번). 고치지 않는다.
- `docs/mdm/decisions.md`: Build 가 이 설계의 D 항목을 공용 기록에 옮길 때는 전역 번호를 매기지 말고 `## D-TSK-07-03-<n> (<UTC>)` 임시 ID 를 쓴다(dev-discipline 「공용 결정 기록의 번호」). 옮길지는 선택이며 이 design.md 가 정본이다.

---

## 3. 테스트 전략

### 게이트 명령 (기준선 대비 신규 실패 0 + 테스트 총수 미감소)

기준선: 총 tests 2823, failures 0. 명령은 글자 그대로, 모두 리포 루트에서 돌린다.

1. `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain` — 기준선 tests 2337, failures 0
2. `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test` — 기준선 tests 330, failures 0
3. `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` — exit 0
4. `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint` (= tsc --noEmit) — exit 0
5. `cd src/frontend && pnpm test:unit:shared` — tests 156, failures 0

전체 스위트는 dev-discipline 「무거운 명령 줄 세우기」대로 `.claude/skills/dflow-dev/scripts/heavy.sh` 로 감싸 돌린다(`HEAVY_BUSY` 면 같은 명령 재호출). 백엔드 테스트 집계: `find src/backend -path '*/build/test-results/*' -name 'TEST-*.xml' | xargs grep -h -o '<testsuite [^>]*'` 의 tests/failures/errors 합.

추가 점검(게이트 외, 커밋 전 0건):
- `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mdm/pages/dmd`
- `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mdm/pages/dmd`

E2E 명령은 「E2E 서버 절차」에 있다(게이트 명령과 별개).

### 3.1 화면 스모크 넷 (dev-discipline 「화면 작업의 브라우저 E2E」)

공통: 두 spec 모두 `mdm-unitMng.spec.ts` 구조를 따른다. `BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100"`, `STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward"`, `STDADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin"`, `PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123"`, `SUFFIX = Date.now().toString(36).toUpperCase()`, `test.describe.configure({ mode: "serial" })`, `test.setTimeout(150_000)`. 로그인은 `/login` → placeholder "아이디"/"비밀번호" → "로그인" → `/\/portal/` 대기. 메뉴는 `.tree-item .item-name` 을 `^마루 MDM$` → `^마스터데이터$` → `^항목 관리$`(또는 `^항목 이력$`) 순서로 누른다. 쓰기 단계는 **steward** 로 한다(F2). 스크린샷은 `path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-07-03/screens", name)`, `fullPage: true`. 응답 대기는 `page.waitForResponse(r => r.url().includes("/api/mdm/oasis/dataItemMng/<action>") && r.status() === 200)` 를 **동작 전에** 만든다. 새 키는 `E2E${SUFFIX}` 형식(기본 키 패턴 `^[0-9A-Z]{1,20}$` 통과, 길이 ≤ 20).

**픽스처 `e2e/fixtures/mdm-dataItem.sql`**(모두 `INSERT OR IGNORE`, 일시는 `'2026-08-20 09:00:00'`, 열린 끝 `'9999-12-31 00:00:00'`, 감사 `VER` 0):

| 표 | 행 |
|---|---|
| TB_MDM_DATA | `E2E_DI_PORT`(항구, INUSE, MDM, 키 패턴 기본값, `LVL_CNT` 1, `ATTR01_NAME` '국가', `ATTR03_NAME` '비고' — attr02 는 라벨 없음) / `E2E_DI_CUST`(거래처, INUSE, EXTERNAL, `SOURCE_SYSTEM` 'ERP', `ATTR01_NAME` '사업자번호') |
| TB_MDM_DATA_CATE | 두 마루 데이터의 `BASE`(REGEX, `.*`, KEY) / PORT `KR`(REGEX, `^KR$`, ATTR01) / PORT `MAJOR`(TABLE). `CK_TB_MDM_DATA_CATE_DEF` 때문에 REGEX 행은 `DEF_EXPR`·`DEF_TARGET` 둘 다 값이 있고, TABLE 행은 둘 다 NULL 이어야 한다 |
| TB_MDM_DATA_ITEM | PORT `KRPUS`(부산, lvl1 'KR', attr01 'KR', seq 1), `KRINC`(인천, 'KR', 'KR', seq 2), `CNSHA`(상하이, 'CN', 'CN', seq 3) / CUST `C0001`(동국철강, attr01 '1234567890') |
| TB_MDM_DATA_CATE_ITEM | PORT `MAJOR`/`KRPUS` |

e2e 는 픽스처 행을 **고치지 않는다**(읽기 확인에만 쓴다). 쓰기는 실행마다 새 키로 한다. 그래서 같은 mdm.db 로 다시 돌려도 결과가 같다.

**`mdm-dataItemMng.spec.ts`**

1. 메뉴 이동: steward 로그인 → `마루 MDM > 마스터데이터 > 항목 관리` → breadcrumb "마스터데이터"·제목 "항목 관리" 확인.
2. 목록 채워짐·빈 상태: 마루 데이터 `E2E_DI_PORT` 선택·조회 → 그리드에 KRPUS·KRINC·CNSHA, 열 머리 "1차"·"국가"·"비고" 가 보이고 "attr02" 머리는 없다(Q5). 카테고리 `KR` 로 조회 → KRPUS·KRINC 만 보이고 CNSHA 는 없다(Q4). 키에 `__NOMATCH_${SUFFIX}__` 를 넣어 조회 → 빈 상태 문구(`"0건"` 또는 그리드 `emptyMessage`). `E2E_DI_CUST` 선택 → 「항목 추가」 비활성, 행에 「닫기」 없음(Q6, EXTERNAL 조회 전용). 스크린샷 `dmd-dataItemMng-list.png`.
3. 화면 조작만으로 등록·수정 1회 반영: `E2E_DI_PORT` 에서 「항목 추가」 → 키 `E2E${SUFFIX}`, 이름 "테스트항목", 1차 "KR" → 저장 → 그리드에 행 반영. 그 행의 이름 칸을 그 자리에서 "테스트항목수정" 으로 고치고 행의 「저장」 → 그리드에 새 이름. 「이력」 → 이력 패널에 2행(생성, 변경), 1행 `valid_to` == 2행 `valid_from`. 스크린샷 `dmd-dataItemMng-edit.png`. 이어서 수용 기준 3: 「닫기」 → "닫힌 항목 보기" 켜고 조회 → 닫힘 표시 → 「항목 추가」로 같은 키 등록 → `.error-modal__body` 에 `닫힌 키입니다. 새로 등록할 수 없으니 다시 여세요` → 확인 → 「다시 열기」 → 열림 표시.
4. 서버 오류 노출: 「항목 추가」로 키 `bad key`(소문자·공백) 등록 → `.error-modal__body` 에 "키 패턴" 문구(C3). 이어서 수용 기준 4(충돌 재조회): 3의 키를 조회해 둔 상태에서 `page.request.post(\`${BASE_URL}/api/mdm/oasis/dataItemMng/save\`, { data: { meta: { menuId: "dataItemMng" }, params: { maruDataId, code, name: "뒤에서수정", expectedRowVersion: <현재 값> } } })` 로 다른 사용자 수정을 흉내 낸다 → 화면에서 같은 행 이름을 고쳐 「저장」 → `다른 사용자가 수정했습니다` 문구가 보이고, 목록이 다시 불려 이름 칸이 "뒤에서수정" 이다. 스크린샷 `dmd-dataItemMng-error.png`.

**`mdm-dataHistory.spec.ts`**

1. 메뉴 이동: steward 로그인 → `마루 MDM > 마스터데이터 > 항목 이력` → 제목 확인.
2. 목록 채워짐·빈 상태: `E2E_DI_PORT`·항목·`KRPUS` 조회 → 1행(생성, 열림). 대상 카테고리·`KR` → 1행. 대상 소속·카테고리 `MAJOR`·키 `CNSHA` 조회 → "행이 없습니다". 스크린샷 `dmd-dataHistory-list.png`.
3. 화면 조작만으로 등록·수정: **해당 없음**. 이 화면은 조회 전용이다(05 「화면」 항목 이력). **대체 확인**: `page.request` 로 `dataItemMng/reg`(키 `E2EH${SUFFIX}`) → 화면에서 그 키 조회 → 1행. `dataItemMng/save`(이름 변경) → 화면의 조회 버튼 → 2행, 1행 `valid_to` == 2행 `valid_from`, 사건 "변경". `dataItemMng/delete` → 조회 → 마지막 행 "소멸(닫힘)". `dataItemMng/restore` → 조회 → 3행, 2행과 3행 사이 "닫혀 있던 구간" 줄, 3행 사건 "다시 열기"(H2, 01 생성·변경·소멸). 스크린샷 `dmd-dataHistory-timeline.png`.
4. 서버 오류 노출: 키를 비운 채 조회 → 서버 거부 문구 `키를 입력하세요` 가 `.error-modal__body` 에 보인다(H3). 화면은 키 필수를 미리 막지 않는다(판정은 서버 한 곳). 스크린샷 `dmd-dataHistory-error.png`.

### 3.2 백엔드 테스트 (testAll, SQLite)

격리는 F24 그대로다. 클래스마다 고유 temp DB 파일, `@Primary MutableClock` 으로 사건 시각을 정한다. 코어 호출은 `TransactionTemplate` 밖에서 부르면 코어가 새 트랜잭션을 열어 커밋한다(운영 OASIS 트랜잭션과 같은 효과). 확인은 `JdbcTemplate` 네이티브 조회로 한다. `@Transactional` 테스트는 쓰지 않는다(잠금 탐침 테스트가 커밋·롤백 경계를 직접 다룬다).

**T-S `DataItemSegmentCoreSqliteTest`** (선분 의미)
- 등록 → 1행 `[t1, OPEN_END)`, row_version 0, CHG_SEQ 0 (S3·S12).
- 수정(t2) → 옛 행 `[t1,t2)`(row_version 그대로), 새 행 `[t2,OPEN_END)`, 새 행 row_version = 1, 새 행 값 = 요청 값 (S1·S2·S3).
- 값이 같은 수정 → `NONE`, 행 수·row_version·U_AT·VER 불변 (S5). 비교 필드 목록 전체(name, alterName, seq, description, lvl1~5, attr01~10 = 19개)를 순회해 한 칸씩만 다른 요청을 만드는 파라미터화 테스트는 모두 `UPDATE` (S5 비교 대상 누락 변이를 잡는다). `" "`·`""` 만 다른 요청은 NULL 과 같아 `NONE` (S5 정규화).
- 닫기(t3) → 열린 행 `valid_to = t3`, 새 행 없음, 닫힌 행 row_version +1 (S6·S3). 닫힌 키 닫기 → `NOT_OPEN` 거부.
- 다시 열기(t4) → 새 행 `[t4,OPEN_END)`, 값 = 마지막 행 값, row_version = 마지막 행 +1, 닫힌 구간 `[t3,t4)` 행 없음 (S7). 열린 키 다시 열기 → `ALREADY_OPEN` 거부.
- 등록 거부: 열린 키 → `KEY_EXISTS`, 닫힌 키 → 메시지가 `CLOSED_KEY_REOPEN` 을 포함 (S8, 수용 기준 3).
- CAS: 수정·닫기·다시 열기에 오래된 expectedRowVersion → 메시지가 `MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage()` 로 시작, 행 수·값 불변 (S4). **오래된 화면 시나리오**: A 가 rv 0 으로 읽음 → B 가 수정(rv 1) → A 가 rv 0 으로 수정 → 충돌. 새 행 rv 를 0 으로 두는 변이를 이것이 잡는다 (S3·S4, 수용 기준 4 의 서버 쪽).
- 같은 초: 시계를 멈춘 채(t 고정) 등록 → 수정 → 닫기 → 다시 열기 → 수정을 잇달아 부른다 → 모든 경계가 엄격히 증가(+1초씩), PK 충돌 없음, 길이 0 구간 없음 (S9).
- 경계 절삭: 시계를 `…09:00:00.700` 으로 두면 저장된 `VALID_FROM` 이 `'… 09:00:00'` (S9·F23).
- 직렬 무작위 50사건(등록·수정·닫기·다시 열기 섞음, 고정 시드) 뒤 `overlapCount(md) == 0`, `maxOpenRowsPerKey(md) <= 1` (S11 직렬 부분).
- 감사: 새 행 `C_USR_ID`·`U_USR_ID` = 현재 사용자, `VER` 0. 닫는 UPDATE 뒤 `VER` +1, `U_AT` 갱신 (S13).

**T-C `DataItemChecksSqliteTest`** (검사 1~7, 경로별)
- C1: DEPRECATED 마루 데이터에 등록·수정·닫기·다시 열기·upsert(CSV·API) → 모두 `DEPRECATED` 거부, 행 불변.
- C2: MDM 마루 데이터에 API 경로 → 거부. EXTERNAL 마루 데이터에 SCREEN·CSV 경로 → 거부. EXTERNAL 에 API 경로인데 callerSystem ≠ source_system → 거부. 같으면 통과.
- C3: MDM 원천 등록에서 키가 `code_pattern` 에 **전체 일치**해야 한다. `KRPUS`(통과), `krpus`·`KR PUS`·`KRPUSX…21자`(거부). 부분 일치만 되는 `"A-KRPUS"` 류를 패턴 `KR.*` 로 시험해 `find()` 변이를 잡는다. EXTERNAL 원천(API 경로)은 패턴에 어긋나도 통과.
- C4: SCREEN·CSV 경로에서 name 이 null·공백이면 거부한다. API 경로는 05 대로 행 내용을 검사하지 않으므로 C4 를 돌리지 않는다. 다만 `NAME` 은 DB NOT NULL 이라 name 이 없는 API 행은 DB 제약 오류로 요청 전체가 롤백된다(05 「수신 로그」의 요청 단위 FAILED 에 해당). 이 동작(검사 이슈가 아니라 저장 오류, 행 0건)을 테스트로 고정한다.
- C5: 라벨 없는 attr02 에 값 → SCREEN·CSV 거부, API 통과·저장(X2 의 C4 행과 같은 규칙).
- C5-1: 중간 칸 비움(`lvl1` 없음 + `lvl2` 있음) 거부. 값에 콤마·공백 거부. 다른 키의 마지막 행에서 같은 그룹 값이 다른 앞 칸 아래에 있으면 거부(닫힌 키 포함 — 그 키를 닫은 뒤에도 거부되는지 확인). 내 키가 다른 행에서 그룹으로 쓰이는데 앞 칸이 다르면 거부. 같은 앞 칸이면 통과. 다시 열기도 C5-1 을 돈다(닫혀 있는 동안 충돌하는 계층이 생기면 다시 열기 거부).
- C5-2: `lvl_cnt` 1 인데 `lvl2` 값 → 거부.
- C6: SCREEN 등록 중복은 T-S 에서 덮는다. CSV upsert: 없는 키 INSERT, 값이 바뀐 키 UPDATE, 같은 키 NONE, **닫힌 키 → 거부**(CSV 로 다시 열지 않는다, 05 「CSV 형식」·시안).
- C7: 소속 등록은 T-K 에서 덮는다.
- 순서: C1·C2 는 즉시 거부(다른 검사 이슈가 섞이지 않는다). C3~C6 은 한 번에 모아 거부하며 메시지에 모든 이슈가 들어간다(키 패턴 위반 + name 없음 + 라벨 없는 칸을 한 요청에 넣어 세 이슈 모두 확인).
- upsert 원자성: CSV 10행 중 1행만 C3 위반 → 아무 행도 쓰지 않는다. `dryRun=true` 면 이슈가 없어도 쓰지 않고 행마다 예정 action 을 돌려준다.

**T-L `DataSegmentLockSqliteTest`** (행 잠금 — SQLite 로 잡을 수 있는 부분)
- 호출 순서: `@TestConfiguration` 의 `@Primary` 기록용 하위 클래스(`RecordingDataSegmentLock extends DataSegmentLock`, `RecordingDataSegmentRowStore extends DataSegmentRowStore`)가 공유 목록에 `LOCK:<md>`·`READ:<메서드>` 를 남긴다. 등록·수정·닫기·다시 열기·upsert·카테고리·소속 쓰기 각각에서 **첫 사건이 `LOCK:<md>`** 이고 잠금이 정확히 1번임을 단언한다 (L1: 잠금 누락·순서 뒤바뀜 변이를 잡는다).
- 쓰기 잠금 탐침: `TransactionTemplate` 안에서 `lock.lock(md)` 만 부르고 커밋 전에, 같은 DB 파일로 연 **별도 JDBC 연결**(`jdbc:sqlite:<파일>`, `PRAGMA busy_timeout=0`)에서 `BEGIN IMMEDIATE` 를 시도하면 `SQLITE_BUSY` 로 실패한다. 트랜잭션을 끝낸 뒤에는 성공한다 (L2: 잠금 문을 SELECT 로 바꾸는 변이를 잡는다).
- 값 불변: 사건 뒤 `TB_MDM_DATA` 의 `LAST_CHG_SEQ`·`CHG_SEQ`·`VER`·`U_AT` 가 사건 전과 같다 (L2·S12: 잠금 문이 순번을 올리거나 감사 칼럼을 바꾸는 변이를 잡는다).
- 없는 마루 데이터: `lock("NOPE")` → `없는 마루 데이터` 거부, 아무 행도 없음 (L3).
- 잠금 뒤 재조회 논리: 기록용 잠금 하위 클래스에 "`super.lock()` 직전에 한 번 실행할 훅"을 두고, 훅에서 **다른 스레드**가 같은 키를 수정(rv 0→1)하고 커밋을 끝내게 한다. 그 뒤 원래 호출(expected 0)이 이어지면 코어는 잠금 뒤 다시 읽은 rv 1 로 판정해 `ROW_VERSION_CONFLICT` 를 내고, 행은 훅의 수정 결과(2행)에서 늘지 않는다(L1·S4). 읽기를 잠금 앞으로 옮기는 변이는 이 테스트에서 SQLite 읽기 잠금 때문에 훅의 커밋이 막혀 빨강이 되고, 호출 순서 테스트에서도 빨강이 된다.

**T-K `DataCategorySegmentCoreSqliteTest`**: 카테고리 등록·수정(새 행)·닫기·다시 열기 선분(S1·S6·S7 을 CATE 에), BASE 수정·닫기 → `RESERVED_CATEGORY` (S14), 소속 등록은 C7(항목 열림·카테고리 열림·`def_kind = TABLE`) 위반마다 거부, 소속 해제 = 닫기, 다시 소속 = 새 행, 닫힌 카테고리의 소속 행은 그대로(05).

**T-EX `MasterDataExamplesScenarioTest`** (수용 기준 1 — 05 「예」 표를 그대로 데이터로 옮긴다)

테스트 안에 05 표 두 개를 `List<Step>` 상수로 둔다. `record Step(String id, LocalDateTime at, String event, Consumer<Ctx> action, Set<SegRow> touched)` 이고 `SegRow(table, key, validFrom, validTo)` 다. `@TestFactory` 가 행마다 동적 테스트를 만들고, 각 단계에서 시계를 `at` 에 두고 `action` 을 실행한 뒤 "그 시각에 경계가 생긴 행"(`VALID_FROM = at` 또는 `VALID_TO = at`)의 집합이 `touched` 와 **정확히 같은지** 본다. 순번 칸(`chg_seq`·`last_chg_seq`)은 비교하지 않고, 대신 모든 행의 `CHG_SEQ` 가 0 이고 `LAST_CHG_SEQ` 가 0 인지 확인한다(순번 미발급, S12).

| 단계 | 05 사건 | 실행(이 Task 의 코어) | 기대 touched(05 「순번을 찍는 행」에서 순번을 뺀 것) |
|---|---|---|---|
| E1 (t1) | 마루 데이터 PORT 생성 | 픽스처로 `TB_MDM_DATA` PORT(MDM) 삽입(07-02 몫) + `DataCategorySegmentCore.registerCate(BASE)` | `CATE BASE [t1, OPEN)` |
| E2 (t2) | 라벨 지정(attr01 국가, attr02 위도, attr03 경도) | 픽스처 UPDATE(07-02 몫) | 없음(선분 행 변화 0) |
| E3 (t3) | CSV 3,000건 적재 | `upsert(PORT, CSV, …3,000행)` — KRPUS(부산, attr01 KR)·KRINC(인천, KR)·CNSHA(상하이, CN) 포함, 나머지 `P0001`~`P2997` | `ITEM ×3000 [t3, OPEN)`, 결과 action 전부 INSERT |
| E4 (t4) | 카테고리 KR(REGEX, ATTR01, `^KR$`) 등록 | `registerCate(KR)` | `CATE KR [t4, OPEN)` |
| E5 (t5) | 항목 KRPUS 이름 수정 | `DataItemSaveCore.modify(KRPUS, name 부산항)` | `ITEM KRPUS [t3, t5)`, `ITEM KRPUS [t5, OPEN)` |
| E6 (t6) | 항목 KRINC 닫기 | `DataItemSaveCore.close(KRINC)` | `ITEM KRINC [t3, t6)` |

추가 단언(05 「예」 두 번째 표 "사본"의 받는 행과 같은 집합, 순번 대신 시각으로): `t3 < 경계 ≤ t6` 인 행 집합 = {CATE KR, ITEM KRPUS 두 행, ITEM KRINC}(MES 가 E3 뒤 last 3 에서 받는 행과 같다).

| 단계 | 05 사건 | 실행 | 기대 |
|---|---|---|---|
| X0 (tx0) | 준비: CUST(EXTERNAL, ERP, 라벨 attr01 사업자번호·attr02 유형), C2·C3·C4 가 열려 있음 | 픽스처 삽입 | — |
| X1 (tx1) | ERP 가 4행 전송, RECV 1행 커밋 | **재현하지 않음**(수신 로그는 보류, PRD §2 규칙 7) | — |
| X2 (tx2) | 내용 검사 없이 저장. 값이 바뀐 행 C1·C2·C4 | `upsert(CUST, API, "ERP", [C1 신규, C2 이름 변경, C3 같은 값, C4 라벨 없는 attr03 값])` | touched = `C1 [tx2,OPEN)`, `C2 [tx0,tx2)`, `C2 [tx2,OPEN)`, `C4 [tx0,tx2)`, `C4 [tx2,OPEN)`(다섯 행). C4 새 행의 `ATTR03` 이 저장됨 |
| X3 | 응답 | 결과의 행별 action | `[INSERT, UPDATE, NONE, UPDATE]`(recv_id·순번 제외) |
| X4 | 동기화 | tx2 에 경계가 생긴 ITEM 행 | 다섯 행이고 C3 은 없다 |

**T-Q `DataItemMngServiceSqliteTest`**: 120키 픽스처(seq 일부 NULL)로 page 0·1·2(size 50) → 50·50·20건, totalCount 120, 정렬 seq(NULL 뒤)·code (Q2·Q3). size 1000 요청 → 200 으로 자름. 키 부분 일치 대소문자 무시, 이름 부분 일치, `%`·`_` 가 든 검색어가 와일드카드로 쓰이지 않음 (Q3). 닫힌 키는 `showClosed` 일 때만, 목록 행은 키별 마지막 행 (Q1). 카테고리 REGEX(ATTR01 `^KR$`)·REGEX 대상 NULL 불일치·TABLE(열린 소속만)·BASE 전체, REGEX 카테고리 페이지의 totalCount 가 필터 뒤 수 (Q4). 머리: `lvlCnt`·라벨 있는 attr 만·`editable`(MDM·INUSE 만 true) (Q5·Q6).

**T-H `DataHistoryServiceSqliteTest`**: 등록 → 수정 → 닫기 → 다시 열기 → 수정 키의 결과 행 4개가 valid_from 오름차순, 사건 `CREATED`·`CHANGED`·`REOPENED`·`CHANGED`, 3행에만 `gapFrom`·`gapTo`(닫힌 구간), 마지막 행 `OPEN`, 앞 행 `PAST`. 마지막 사건이 닫기면 마지막 행 `CLOSED`, `state = CLOSED`(소멸). 카테고리·소속 대상도 같은 규칙(H1·H2). 키 없음 → `키를 입력하세요` 거부, 없는 키 → 빈 목록·`state = NONE` (H3).

**T-A `DmdOasisHttpTest`**(`RANDOM_PORT`, `DmaOasisHttpTest` 패턴, 경로 `/oasis/dataItemMng/{action}`): `reg`→`search`→`save`→`delete`→`restore` 왕복이 성공하고 `data.result` 에 결과가 온다(output 누락 6-C-2 방지). null 필드를 빼고 보낸 `save` 가 성공한다(A4). 오래된 rv 의 `save` → `meta.success=false`, `meta.message` 가 `ROW_VERSION_CONFLICT.defaultMessage()` 로 시작 (A2). 닫힌 키 `reg` → `meta.message` 가 `CLOSED_KEY_REOPEN` 을 포함 (A2). `dataHistory/search` 왕복.

**T-A `DmdBpmnActionTest`**(순수 XML 파싱, 스프링 없음): `services/dmd/dataItemMng.bpmn`·`dataHistory.bpmn` 의 `actionGateway` 분기 이름 집합이 각각 `{view, search, reg, save, delete, restore}`·`{view, search}` 와 **정확히** 같고 `MdmActions` 13종의 부분집합이며, serviceTask 마다 `output=result`, `grid` 속성 없음, `camunda:class` 가 `dataItemMngService`·`dataHistoryService`, 액션→method 매핑이 D9 표와 같다 (A1).

**수정 `MdmTemporalSegmentStoreNoImplementationTest`**: F5.

### 3.3 MSSQL 동시성 테스트 (작성만, 도커 금지로 실행하지 않는다)

`DataSegmentConcurrencyMssqlTest`(mssqlTest). `@SpringBootTest(webEnvironment=MOCK)`, `@ActiveProfiles("local-db")`, `DB_URL = MdmMssqlServer.newDatabase("dataseg")`, `@DynamicPropertySource` 로 url·user·password. 스레드는 `ExecutorService` + `CountDownLatch`(모두 준비 뒤 동시 출발)로 띄우고, 각 스레드는 코어 공개 메서드를 그대로 부른다(코어가 자기 트랜잭션을 연다). 끝나면 겹침 질의로 확인한다.

- M1 같은 키 동시 등록 8개 → 성공 정확히 1, 나머지는 `KEY_EXISTS` 문구, 열린 행 1.
- M2 같은 키·같은 expected 로 동시 수정 8개 → 성공 1, 나머지 `ROW_VERSION_CONFLICT`, 행 2, 겹침 0.
- M3 같은 키 동시 다시 열기 8개(닫힌 키) → 성공 1, 열린 행 1.
- M4 같은 마루 데이터의 서로 다른 키 20개 동시 수정 → 전부 성공(직렬화돼도 실패가 없다), 겹침 0.
- M5 잠금 보유 확인: 스레드 A 가 `TransactionTemplate` 안에서 `lock(md)` 후 대기, 스레드 B 가 `SET LOCK_TIMEOUT 500` 뒤 같은 잠금 UPDATE → 오류 1222(잠금 시간 초과). A 가 커밋하면 B 가 성공. 이것이 L2 의 MSSQL 쪽 증거다.

겹침 질의(두 방언 공용): `SELECT COUNT(*) FROM TB_MDM_DATA_ITEM a JOIN TB_MDM_DATA_ITEM b ON a.MARU_DATA_ID = b.MARU_DATA_ID AND a.CODE = b.CODE AND a.VALID_FROM < b.VALID_FROM AND b.VALID_FROM < a.VALID_TO`.

### 3.4 프런트 단위 테스트 (m-mdm vitest)

- `data-item-columns.test.ts`: `buildItemColumns` — lvlCnt 0·1·5 에 계층 열 0·1·5개, 라벨 없는 attr 열 없음, 머리 = 라벨(Q5). editable 은 `header.editable && row.open` 일 때만(Q6). `toSaveParams` — 빈 문자열·null 키가 결과에 없음(A4·S5). `isRowVersionConflict("다른 사용자가 수정했습니다. 다시 불러오세요: …")` true, 다른 문구 false(F1).
- `data-item-page.test.ts`: fetch mock 으로 view·search 응답을 주면 열 머리 "국가" 가 보이고, EXTERNAL 머리면 「항목 추가」가 비활성이다. `save` 응답을 충돌 문구로 주면 `search` 가 다시 불린다(F1 — 재조회 누락 변이를 잡는다).
- `data-history-page.test.ts`: 3행 + 3행의 `gapFrom` 응답 → "닫혀 있던 구간" 줄 1개, 빈 결과 → "행이 없습니다".

### 3.5 E2E 전체 스위트 변이 검증

Verify 는 mdm e2e 전체를 한 번에 돈다: `pnpm exec playwright test e2e/mdm-*.spec.ts --workers=1`(mdm-sample-smoke, mdm-shell-rbac-smoke, mdm-unitMng, mdm-termMng, mdm-domainMng, mdm-columnMng, mdm-dataItemMng, mdm-dataHistory). columnMng spec 은 새 mdm.db 와 `mdm-columnMng-dict.sql` 픽스처가 전제이고 같은 mdm.db 로 다시 돌릴 수 없다(`mdm-columnMng.spec.ts:14-16`). 그래서 전체 스위트는 매번 「E2E 서버 절차」 1)부터 새 DB 로 시작한다. e2e 변이(예: 충돌 재조회 제거, 계층 열 머리를 번호로 바꾸기)는 전체 스위트로 확인한다(dev-discipline 「Phase 04」). TSK-04-02 Verify 가 보고한 `mdm-domainMng.spec.ts` 간헐 실패는 이 Task 와 무관한 선행 이슈로 따로 적는다.

---

## 4. 수용 기준 매핑

| # | 수용 기준(spec.md) | 검증 방법 |
|---|---|---|
| AC1 | 05 「예」 E1~E6·X1~X4 의 선분 결과 재현(순번 칸 제외) | `MasterDataExamplesScenarioTest`(T-EX, 표 그대로 데이터 주도). E1·E2 는 07-02 몫이라 픽스처, E3 은 CSV upsert, X 는 API 경로 upsert, X1 의 RECV 행과 모든 순번은 제외(D2·D3) |
| AC2 | 동시 저장에서 선분 겹침 0 | 확인하지 못함(도커 금지로 생략: cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain). 실제 동시성 증거는 `DataSegmentConcurrencyMssqlTest` M1~M5 로 설계했다. SQLite 게이트가 확인하는 것은 부분뿐이다: 직렬 50사건 겹침 0(T-S), 잠금 호출 순서·쓰기 잠금 탐침·값 불변·잠금 뒤 재조회(T-L), CAS 충돌(T-S). SQLite 초록만으로 이 기준을 충족했다고 보지 않는다 |
| AC3 | 닫힌 키로 신규 등록 시 다시 열기 안내 | T-S(등록 거부 문구 `CLOSED_KEY_REOPEN`), T-A(HTTP `meta.message`), e2e `mdm-dataItemMng.spec.ts` 스모크 3 후반 |
| AC4 | 다른 사용자 수정 충돌 시 재조회 | T-S(오래된 rv 거부), T-A(`meta.message` 접두어), FE `data-item-page.test.ts`(충돌 문구 → search 재호출), e2e `mdm-dataItemMng.spec.ts` 스모크 4 후반(`page.request` 로 뒤에서 수정 → 화면 저장 → 문구 + 새 값 표시) |
| AC5 | 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-dataItemMng.spec.ts` 가 통과한다 | e2e 스모크 1~4 전부 통과(「E2E 서버 절차」) |
| AC6 | 01 「이력 조회」 요구(생성·변경·소멸)를 충족 | T-H(사건 CREATED·CHANGED·REOPENED, 마지막 행 CLOSED = 소멸, 빈 구간), e2e `mdm-dataHistory.spec.ts` 스모크 3 대체 확인(등록→변경→닫기→다시 열기 타임라인) |
| AC7 | 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-dataHistory.spec.ts` 가 통과한다 | e2e 스모크 1·2·4 통과, 3 은 해당 없음 + 대체 확인 통과 |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

Build·Verify 의 변이 검증이 이 목록을 순회한다. "잡는 테스트" 칸이 비었거나 "SQLite 로 못 잡음"이면 은폐하지 않고 보고한다.

### 선분 (S)

| ID | 규칙 | 대표 변이 | 잡는 테스트 |
|---|---|---|---|
| S1 | 수정 = 그 키의 열린 행 `valid_to` 에 저장 시각 at 을 적고, **같은 at** 을 `valid_from` 으로 하는 새 행 하나를 만든다 | 새 행 `valid_from = at+1s` / 옛 행을 닫지 않음 | T-S, T-EX(E5·X2) |
| S2 | 수정의 새 행 값 = 요청 값(정규화 뒤). 다시 열기의 새 행 값 = 마지막 행 값 복사 | 다시 열기에 빈 값·요청 값 사용 | T-S |
| S3 | row_version: 등록 0 / 수정 새 행 = 옛 행 +1(옛 행은 그대로) / 닫기 = 닫는 행 +1 / 다시 열기 새 행 = 마지막 행 +1 (D7) | 새 행 0 / 닫기에서 올리지 않음 | T-S(오래된 화면 시나리오 포함) |
| S4 | 수정·닫기·다시 열기는 `expectedRowVersion` 이 잠금 뒤 읽은 **그 키 마지막 행**의 row_version 과 같아야 한다. 다르면 `ROW_VERSION_CONFLICT` 이고 어떤 행도 쓰지 않는다. 닫는 UPDATE 는 `VALID_TO = OPEN_END AND ROW_VERSION = :expected` 조건부이고 0행이면 같은 충돌이다 | 비교 제거 / 열린 행 대신 첫 행과 비교 / UPDATE 조건에서 ROW_VERSION 제거 | T-S, T-A, M2 |
| S5 | 값이 같으면 새 행 없음(`NONE`, 쓰기 0, row_version·감사 불변). 비교 필드는 name·alter_name·seq·description·lvl1~5·attr01~10 전부. 비교·저장 전에 문자열을 trim 하고 빈 문자열을 NULL 로 본다 | 비교 필드 하나 빼기 / 항상 새 행 / 정규화 제거 | T-S(비교 필드 19개 전체 순회·공백), `data-item-columns.test.ts` |
| S6 | 닫기 = 열린 행 `valid_to = at`, 새 행 없음. 물리 삭제 없음. 열린 행이 없으면 거부 | 닫기에서 DELETE / 새 행 생성 | T-S, T-EX(E6) |
| S7 | 다시 열기는 열린 행이 없을 때만 하고, 마지막 행 `valid_to` 는 그대로 둔다(닫혀 있던 구간 보존) | 마지막 행 valid_to 를 OPEN_END 로 되돌림 | T-S, T-H |
| S8 | 화면 등록은 그 키 행이 하나도 없을 때만 한다. 열린 키 → `KEY_EXISTS`, 닫힌 키 → `CLOSED_KEY_REOPEN` 안내 | 닫힌 키 등록 허용(새 행) | T-S, T-A, e2e |
| S9 | 저장 시각 at = `LocalDateTime.now(clock)` 을 초 단위로 자른 값. 그 키의 최대 경계(`valid_from`, OPEN_END 가 아닌 `valid_to`) 이상이면 최대 경계 +1초 (D5) | 밀기 제거 / 절삭 제거 | T-S(같은 초·절삭) |
| S10 | 열린 행 판정은 `valid_to = MdmTemporalSegmentRules.OPEN_END`(9999-12-31 00:00:00) 하나다. 새 열린 행은 이 상수를 명시한다(DB DEFAULT 에 기대지 않는다) | 다른 센티넬·NULL | T-S, T-Q |
| S11 | 키마다 열린 행은 최대 1개이고 한 키의 선분은 겹치지 않는다 | (잠금·CAS 제거) | T-S 직렬 50사건, M1~M4(**SQLite 로 동시성 부분은 못 잡음**) |
| S12 | 배포 순번을 발급하지 않는다: `TB_MDM_DATA.LAST_CHG_SEQ` 불변, 새 행 `CHG_SEQ = 0`, 닫는 행 `CHG_SEQ` 불변 | 잠금 문을 `+1` 로 / 새 행에 순번 | T-L, T-EX |
| S13 | 네이티브 INSERT 는 감사 9칼럼(`C_*`·`U_*` = `MdmNativeAuditSupport.currentStamp()`, `VER = 0`)을, UPDATE 는 `U_*` 와 `VER = COALESCE(VER,0)+1` 을 쓴다 | 감사 칼럼 누락 | T-S |
| S14 | 카테고리 BASE 는 수정·닫기를 거부한다(`RESERVED_CATEGORY`) | BASE 가드 제거 | T-K |

### 검사 (C) — 05 「저장 경로와 검증」 검사 순서

| ID | 규칙 | 대표 변이 | 잡는 테스트 |
|---|---|---|---|
| C0 | 경로별 검사 집합: SCREEN·CSV = 1·2·3·4·5·5-1·5-2·6(·7 소속), API = 1·2 만(행 내용 검사 없음). 1·2 는 즉시 거부, 3~6 은 모아서 한 번에 거부 | API 에서 C5 실행 / 1 뒤에도 계속 검사 | T-C, T-EX(X2 의 C4 행) |
| C1 | 마루 데이터 `STATUS = DEPRECATED` 면 모든 쓰기 거부(잠금 뒤 읽은 값으로 판정) | 검사 제거 / 잠금 전 값 사용 | T-C |
| C2 | SCREEN·CSV 는 `SOURCE_KIND = MDM`, API 는 `EXTERNAL` 이고 호출 시스템 = `SOURCE_SYSTEM` | 검사 제거 | T-C |
| C3 | MDM 원천이면 키가 `code_pattern` 에 전체 일치(`Pattern.compile(p).matcher(code).matches()`). EXTERNAL 은 검사하지 않는다. 수정에서 키는 바꿀 수 없다(요청 키가 곧 대상 키) | `find()` 로 부분 일치 / EXTERNAL 에도 적용 | T-C, e2e 스모크 4 |
| C4 | name 필수(null·공백 거부) | 검사 제거 | T-C |
| C5 | 라벨(`ATTRnn_NAME`)이 없는 칸에 값이 오면 거부 | 검사 제거 / 라벨 번호 어긋남 | T-C, T-EX(X2 는 API 라 통과) |
| C5-1 | 계층: 중간 칸 비면 거부 / 값에 콤마·공백 거부 / 같은 값이 다른 키의 **마지막 행**(닫힌 키 포함)에서 다른 앞 칸 아래 그룹이면 거부 / 내 키가 다른 행에서 그룹으로 쓰일 때 앞 칸이 다르면 거부. 다시 열기도 이 검사를 돈다 | 닫힌 키 제외 / 중간 칸 검사 제거 | T-C |
| C5-2 | `lvl_cnt` 보다 뒤 칸에 값이 있으면 거부 | 경계 off-by-one | T-C |
| C6 | 화면 등록 중복 = S8. CSV·API 는 upsert(없으면 INSERT, 바뀌었으면 UPDATE, 같으면 NONE). CSV 는 닫힌 키를 거부한다 | CSV 닫힌 키 재개 | T-C, T-EX(E3·X2) |
| C7 | 소속(TABLE) 등록은 항목 열림·카테고리 열림·카테고리 `def_kind = TABLE` 일 때만 | 검사 제거 | T-K |

### 잠금 (L)

| ID | 규칙 | 대표 변이 | 잡는 테스트 |
|---|---|---|---|
| L1 | 모든 쓰기 사건(항목 넷·upsert·카테고리·소속)은 선분·마루 데이터 행을 **읽기 전에** `DataSegmentLock.lock(md)` 을 정확히 한 번 부르고, 마루 데이터 행과 선분 행은 **그 뒤에 네이티브 SQL 로** 읽는다(영속성 컨텍스트의 엔티티를 판정에 쓰지 않는다) | 잠금 호출 제거 / 읽기 뒤로 옮김 / 잠금 전 읽은 값 재사용 | T-L(호출 순서, 잠금 뒤 재조회) — **실제 직렬화 효과는 SQLite 로 못 잡음**(M2·M4) |
| L2 | 잠금 문은 `UPDATE TB_MDM_DATA SET LAST_CHG_SEQ = LAST_CHG_SEQ WHERE MARU_DATA_ID = :id` 다: 쓰기 문이고 값을 바꾸지 않는다 | SELECT 로 바꿈 / 값을 올림 | T-L(쓰기 잠금 탐침, 값 불변). **MSSQL X 잠금 보유는 SQLite 로 못 잡음**(M5) |
| L3 | 잠금 문이 0행이면 "없는 마루 데이터"로 거부하고 아무것도 쓰지 않는다 | 0행 무시 | T-L |

### 목록·이력·계약 (Q·H·A·F)

| ID | 규칙 | 대표 변이 | 잡는 테스트 |
|---|---|---|---|
| Q1 | 목록 행은 키별 마지막 행(valid_from 최대)이다. `showClosed` 가 아니면 열린 키만 | 모든 행 표시 / 첫 행 | T-Q |
| Q2 | 정렬은 seq(NULL 뒤) → code | NULL 앞 | T-Q |
| Q3 | 서버 페이징: `page` 는 0부터, `size` 기본 50·상한 200, `totalCount` 는 모든 필터 뒤 수. 키는 대소문자 무시 부분 일치, 이름은 부분 일치, `%`·`_`·`\` 는 이스케이프 | 상한 제거 / total 을 필터 전 수로 | T-Q |
| Q4 | 카테고리 필터: BASE 는 전체, REGEX 는 서버 Java `Pattern.matches`(대상 칸 NULL 이면 불일치), TABLE 은 열린 소속 행. 닫힌 키는 카테고리 필터를 거치지 않는다(시안 `renderItems` 그대로) | SQL LIKE 로 대체 / NULL 일치 | T-Q, e2e 스모크 2 |
| Q5 | 동적 열: 계층 열은 1차~`lvl_cnt`차, 추가 컬럼 열은 라벨이 있는 번호만이고 열 머리는 라벨 원문 | 전 칸 표시 / 머리를 번호로 | T-Q, `data-item-columns.test.ts`, e2e 스모크 2 |
| Q6 | 편집 가능 = `source_kind = MDM` 이고 `INUSE` 이며 그 행이 열림. 그 밖은 조회 전용 | EXTERNAL 편집 허용 | T-Q, `data-item-columns.test.ts`, e2e 스모크 2 |
| H1 | 이력은 한 키(항목 code / 카테고리 cate_id / 소속 cate_id+code)의 선분 행을 valid_from 오름차순으로 전부 보인다 | 정렬 제거 / 열린 행만 | T-H |
| H2 | 사건: 첫 행 `CREATED`, 앞 행 `valid_to == valid_from` 이면 `CHANGED`, 앞 행 `valid_to < valid_from` 이면 `REOPENED` 와 그 사이 빈 구간(`gapFrom`·`gapTo`). 마지막 행이 닫혔으면 `CLOSED`(소멸), 나머지 지난 행은 `PAST`. 계산은 서버가 하고 화면은 그대로 그린다 | 부등호 뒤바뀜 / FE 재계산 | T-H, `data-history-page.test.ts`, e2e |
| H3 | 이력 조회는 키가 필수다(없으면 `키를 입력하세요` 거부). 없는 키는 빈 목록 | 필수 검사 제거 | T-H, e2e 스모크 4 |
| A1 | OASIS 액션은 `MdmActions` 13종 안에서만: dataItemMng = view·search·reg(register)·save(modify)·delete(close)·restore(reopen), dataHistory = view·search (D9). serviceTask 는 `output=result`, `grid` 없음 | 액션 오타 / 새 액션 | `DmdBpmnActionTest`, oasis-contract-check |
| A2 | 화면 판정 문구 고정: 충돌 = `MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage()`(접두어 "다른 사용자가 수정했습니다"), 닫힌 키 = `DataItemMessages.CLOSED_KEY_REOPEN`. FE 상수와 서버 상수가 같은 글자다 | 문구 변경 | T-A, `data-item-columns.test.ts` |
| A3 | `MdmTemporalSegmentStore` 구현체는 `com.dongkuk.dmes.mdm.common.segment` 의 세 클래스뿐이다 | 다른 패키지에 구현 추가 | 수정한 `MdmTemporalSegmentStoreNoImplementationTest` |
| A4 | FE 는 OASIS `params` 에 null·배열을 넣지 않는다(빈 값은 키를 뺀다) | `omitNullish` 제거 | `data-item-columns.test.ts`, T-A |
| F1 | 충돌 문구를 받으면 화면은 안내를 보이고 목록을 다시 부른다(재조회) | 재조회 제거 | `data-item-page.test.ts`, e2e 스모크 4 |

불변 규칙 개수: S 14 + C 10(C0~C7, C5-1·C5-2 포함) + L 3 + Q 6 + H 3 + A 4 + F 1 = **41개**.

---

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 도커 금지로 생략: cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain
- 도커 금지로 생략: cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:compileMssqlTestJava --no-daemon --console=plain
- 확인하지 못한 수용 기준: 동시 저장에서 선분 겹침 0 — cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain

설명:
- `compileMssqlTestJava` 는 도커를 띄우지 않지만 태스크 이름에 `mssql` 이 들어 있어 현행 금지 규칙(dev-discipline 「금지 모드에서 돌리지 않는 것」)에 걸린다. 그래서 새 `DataSegmentConcurrencyMssqlTest` 는 워커 단계에서 **컴파일조차 확인되지 않는다**(testAll 은 `:test` 만 돌려 mssqlTest 소스를 컴파일하지 않는다, F25). 머지 뒤 팀장 방언 검증(`dialect_check`)에서 처음 컴파일·실행된다. Build 는 작성 시 기존 mssqlTest 파일(`MdmMasterDataMssqlMigrationTest`)의 import·어노테이션을 글자 그대로 따라 컴파일 위험을 줄이고, 이 사실을 보고에 올린다.
- 이 Task 는 마이그레이션을 추가하지 않으므로 기존 mssqlTest 의 버전 집합 단언은 고치지 않는다.
- MSSQL 방언의 네이티브 SQL(페이징 `OFFSET … FETCH`, `LIKE … ESCAPE`, `DATETIME2` 바인딩, 자기 대입 UPDATE 의 X 잠금)도 실행 검증을 받지 못한다. 불변 규칙 표의 "SQLite 로 못 잡음" 항목(S11·L1·L2)과 함께 보고한다.

---

## 담당자 확인 필요 결정

### D1. 화면 그룹 코드 — spec 의 `mdd` 대신 `dmd`
- 질문: spec entry-point 는 `mdd/dataItemMng`·`mdd/dataHistory` 인데 화면 그룹 정본과 wbs·TRD 는 `dmd` 다. 어느 쪽으로 메뉴·패키지·BPMN 경로를 만드는가.
- 선택지: (a) `dmd` (b) spec 문자 그대로 `mdd`(새 메뉴 폴더 시드 필요).
- 택한 것: (a).
- 근거: `docs/mdm/screens/README.md` 가 "TRD §5 표와 wbs entry-point 는 이 문서와 같아야 한다"고 정본을 선언했고, wbs.md TSK-07-03 과 TRD 패키지(`com.dongkuk.dmes.mdm.dmd.*`)가 `dmd` 다. 메뉴 폴더 `dmd`·권한 매트릭스 `DMD`·FE `MDM_GROUPS.dmd` 가 이미 있다(F1). `mdd` 는 식별자 사전 §A.2.1 규칙(`dm`+순번)에도 맞지 않는다. TSK-04-02 의 `mdt→dma` 정정과 같은 경우다. spec 이 근거 최상위이지만 spec 의 이 값은 D'Flow 쪽 옛 값이 남은 것으로 판단했다.
- 반려되면: 메뉴 폴더 `mdd` 를 `DataInitializer` 에 멱등 추가하고, `MdmScreenGroup`·`MdmPermissions`·`seedMdmObjectRbac` 매핑·FE `MDM_GROUPS`·`mdm-shell-rbac-smoke.spec.ts` 의 그룹 목록·BPMN 경로·패키지·e2e 메뉴 경로를 모두 `mdd` 로 바꾼다(시드 대조 기대값도 바뀐다).

### D2. X1~X4 재현 방식 — 수신 API 없이 코어의 API 경로로
- 질문: 수신 API·수신 로그는 보류(PRD §2 규칙 7, FR-D4)인데 수용 기준은 X1~X4 의 선분 결과 재현을 요구한다. 어떻게 재현하는가.
- 선택지: (a) 코어 `upsert` 에 `DataSavePath.API`(검사 1·2만, callerSystem 대조)를 두고 X2 를 그 경로로 재현한다. HTTP 엔드포인트·RECV/RECV_ITEM 기록·`closed` 플래그 처리는 만들지 않는다. (b) 수신 API 까지 만든다. (c) X 는 재현하지 않는다.
- 택한 것: (a).
- 근거: spec 수용 기준이 X 재현을 명시하고 "순번 칸 제외"만 뺐다. 동시에 PRD 규칙 7 이 수신 코드를 막는다. 선분 결과는 저장 코어가 정하므로 코어 수준 재현이 두 요구를 함께 지킨다. X1(RECV 커밋)은 선분 결과가 없어 빼도 선분 재현에 빠짐이 없다.
- 반려되면: (b)면 수신 API·RECV 기록·`closed` 플래그를 별도 Task 로 추가하고 X 테스트를 HTTP 경로로 옮긴다. (c)면 T-EX 의 X 절과 `DataSavePath.API` 를 지운다.

### D3. 일괄 upsert(CSV 경로)를 이 Task 코어에 포함
- 질문: CSV 업로드는 TSK-07-04 몫인데, E3(CSV 3,000건) 재현과 "화면·CSV 가 같은 저장 코어"를 위해 코어에 일괄 upsert 를 둘 것인가.
- 선택지: (a) 코어에 `upsert(md, path, caller, rows, dryRun)` 을 두고 CSV 파싱·검증 결과 화면·업로드 팝업은 07-04 에 남긴다. (b) 07-04 가 upsert 를 만들고 E3 은 07-04 에서 재현한다.
- 택한 것: (a).
- 근거: wbs.md 1826행 "TSK-07-03 fan_in=3 유지: 화면·CSV 두 경로가 같은 선분 저장 코어를 써야 한다"와 07-04 의 depends(07-03)가 코어의 소유자를 이 Task 로 정한다. 수용 기준 1 이 E3 을 이 Task 에서 재현하라고 요구한다.
- 반려되면: `upsert`·`UpsertRow`·`UpsertResult` 를 지우고 T-EX 의 E3 을 픽스처 삽입으로 바꾼다. 07-04 가 upsert 를 새로 만든다.

### D4. 카테고리·소속 선분 코어를 이 Task 에 포함(화면 없이)
- 질문: 이력 화면이 카테고리·소속 선분을 보이고 E1·E4 가 카테고리 선분을 요구한다. 카테고리 선분 쓰기를 누가 만드는가. TSK-07-02(카테고리 편집)는 이 Task 에 의존하지 않는 병렬 형제다.
- 선택지: (a) `DataCategorySegmentCore`·`DataCateSegmentStore`·`DataCateItemSegmentStore` 를 이 Task 가 만들고 화면은 만들지 않는다. (b) 카테고리 쓰기는 07-02 에 맡기고 E1·E4 는 픽스처로 넣는다.
- 택한 것: (a).
- 근거: TSK-07-01(승인) D1 이 `MdmTemporalSegmentStore` 를 "항목·카테고리·소속 세 테이블 공통 SPI, 구현은 TSK-07-03"으로 정했다. spec 요구사항 "대상(항목/카테고리/소속)·키별 선분 타임라인"과 검사 7(TABLE 소속)도 이 Task 에 있다.
- 위험: 07-02 가 이 코어를 모른 채 카테고리 선분을 따로 구현하면 머지 때 중복이 생긴다. 보고에 올려 팀장이 07-02 쪽에 이 코어 재사용을 알리게 한다.
- 반려되면: 카테고리·소속 코어를 지우고 T-EX 의 E1·E4 와 T-H 의 카테고리·소속 케이스를 픽스처 삽입으로 바꾼다. ArchUnit 허용 구현체 목록도 하나로 줄인다.

### D5. 같은 초 경계 — 거부 대신 +1초로 민다
- 질문: 저장 시각이 초 단위라 한 키에 같은 초 사건이 두 번 오면 PK 충돌·길이 0 구간이 생긴다. 어떻게 하는가.
- 선택지: (a) 그 키의 최대 경계 이상이면 최대 경계 +1초로 민다. (b) "잠시 뒤 다시 저장하세요"로 거부한다. (c) 밀리초 정밀도를 쓴다.
- 택한 것: (a).
- 근거: 05 「선분과 닫기」 "같은 키의 사건은 … 앞 사건보다 뒤 시각이다"를 그대로 지킨다. (c)는 naming-dialect-rules §3 #16(초 단위 `DATETIME2(0)`, 텍스트 형식)과 V10 스키마를 바꾼다. (b)는 빠른 연속 편집(e2e 포함)을 실패시킨다. 밀린 시각은 실제 시각과 최대 몇 초 차이라 기준일 판정에 실질 영향이 없다.
- 반려되면: `SegmentBoundary.next` 가 경계 이상이면 `INVALID_INPUT`("잠시 뒤 다시 저장하세요")을 던지게 바꾸고 T-S 같은 초 케이스의 기대를 거부로 바꾼다. e2e 는 단계 사이에 1초 대기를 넣는다.

### D6. 행 잠금 문 — 방언 중립 자기 대입 UPDATE
- 질문: "TB_MDM_DATA 행 잠금으로 동시 저장 직렬화"를 어떤 SQL 로 하는가. 리포에 비관적 잠금 선례가 없다(F9).
- 선택지: (a) `UPDATE TB_MDM_DATA SET LAST_CHG_SEQ = LAST_CHG_SEQ WHERE MARU_DATA_ID = :id`(두 방언 공용, 값 불변). (b) MSSQL `SELECT … WITH (UPDLOCK, ROWLOCK)` + SQLite 는 아무것도 안 함(방언 분기). (c) JPA `PESSIMISTIC_WRITE`.
- 택한 것: (a).
- 근거: 05 「배포 순번」이 직렬화 수단으로 `UPDATE TB_MDM_DATA SET last_chg_seq = …` 를 정해 두었고, 순번 발급만 보류됐으므로 같은 행·같은 칸에 값을 바꾸지 않는 UPDATE 를 쓰면 나중에 `+1` 로 바꾸기만 하면 된다. 방언 분기가 없어 SQLite 테스트가 같은 코드 경로를 실행한다(T-L 탐침). (c)는 SQLite community dialect 의 잠금 절 처리와 Id UserType 결합이 검증되지 않았다.
- 반려되면: `DataSegmentLock.LOCK_SQL` 을 `MdmDialectResolver` 로 분기해 MSSQL `SELECT 1 FROM TB_MDM_DATA WITH (UPDLOCK, ROWLOCK) WHERE …` 로 바꾸고, T-L 의 쓰기 잠금 탐침은 SQLite 분기에서만 의미가 있음을 적는다. M5 는 그대로 쓴다.

### D7. 닫기에서도 row_version 을 올린다
- 질문: 시안(`05-master-data.html` 548-553행·788행)은 닫기에서 row_version 을 올리지 않는다. 닫기를 상태 전이로 보고 올릴 것인가.
- 선택지: (a) 닫는 행 +1 (b) 시안대로 그대로.
- 택한 것: (a).
- 근거: naming-dialect-rules §2 "같으면 저장·상태 전이 때 1 올린다"가 닫기(열림→닫힘 전이)에 해당한다. (b)면 "A 가 읽음 → B 가 닫고 다시 엶"은 잡히지만 "A 가 읽음 → B 가 닫음 → A 가 닫힌 키를 다시 엶(옛 rv)" 같은 흐름이 충돌 없이 통과해 사용자가 B 의 닫기를 모른 채 덮는다. 시안은 화면 구성 참고용이다(PRD §2 규칙 4).
- 반려되면: `DataSegmentRowStore.closeItem` 의 `bumpRowVersion` 을 닫기에서 false 로 하고 T-S 의 닫기 row_version 기대를 바꾼다.

### D8. 「이력」 링크 — 탭 이동 대신 같은 화면의 이력 패널
- 질문: 시안은 「이력」이 항목 이력 화면으로 이동하며 키를 넘긴다. 포털에는 탭 사이 파라미터 전달 수단이 없다(F17). 어떻게 하는가.
- 선택지: (a) 항목 관리 화면 아래 `ContentPanel` 에 `DataHistoryTimeline`(항목 이력 화면과 같은 컴포넌트)을 열고 `dataHistory/search` 를 부른다. (b) sessionStorage + `portal-open-tab` 이벤트로 키를 넘긴다. (c) shared 포털 셸에 파라미터 전달을 추가한다.
- 택한 것: (a).
- 근거: (b)는 Part B 에 등재되지 않은 이벤트이고 이미 열린 탭은 다시 초기화되지 않아 두 번째 클릭이 무시된다. (c)는 shared 변경(Part B §17 절차)이라 이 Task 범위를 넘는다. (a)는 같은 서버 계산·같은 컴포넌트를 쓰므로 두 화면의 표시가 갈리지 않는다. 다른 화면 서비스 호출은 columnMng→termRegPop 선례가 있다. dmd 두 OBJECT 의 권한 매핑이 같아 권한 차이도 없다.
- 반려되면: (c)로 shared 에 `openPageTab(pageId, params)` 와 탭 props 전달을 추가하는 별도 작업을 요청하고, 그때까지 (a)를 유지한다.

### D9. 액션 매핑 — 13종 안에서 닫기=delete, 다시 열기=restore
- 질문: 닫기·다시 열기·등록·수정을 어떤 OASIS 액션 이름으로 노출하는가.
- 선택지: (a) `reg→register`, `save→modify`, `delete→close`, `restore→reopen`, `search→search`, `view→view`. (b) 새 액션 `close`·`reopen` 추가.
- 택한 것: (a).
- 근거: (b)는 `SecurityScreenContractTest`·권한 세트 시드·e2e 시드 대조를 깨고 형제 Task 와 충돌한다(F3). 닫기는 "행을 지우지 않고 닫는 논리 삭제"(05 「구조」 닫기 행)라 delete 권한과 뜻이 맞고, 다시 열기는 restore 와 뜻이 맞다. 넷 다 EDIT 세트라 STEWARD 만 쓸 수 있다(F2).
- 반려되면: 새 액션을 `MdmActions`·`MdmPermissions`·`DataInitializer` 권한 세트·seed-check 기대값·`SecurityScreenContractTest` 에 함께 추가하고 BPMN 분기 이름과 FE 호출을 바꾼다.

### D10. 열린 행 유일 인덱스(마이그레이션)를 넣지 않는다
- 질문: "키당 열린 행 하나"를 DB 필터 유일 인덱스(`… WHERE VALID_TO = '9999-12-31 00:00:00'`)로도 막을 것인가.
- 선택지: (a) 넣지 않는다(잠금 + CAS + 코어 검사). (b) 새 Flyway 버전으로 두 방언에 필터 유일 인덱스를 더한다.
- 택한 것: (a).
- 근거: spec 이 정한 수단은 TB_MDM_DATA 행 잠금이다. TSK-07-01(승인)이 PK 를 "원래 키 + valid_from"만으로 정했다. MSSQL 필터 인덱스의 상수 비교(`DATETIME2` 칼럼 대 문자열 리터럴)는 도커 금지로 검증할 수 없고, 마이그레이션 번호는 병렬 Task 와 겹칠 위험이 있다.
- 반려되면: 새 버전(`origin/dev` 최대+1)으로 `UX_TB_MDM_DATA_ITEM_OPEN`·`UX_TB_MDM_DATA_CATE_OPEN`·`UX_TB_MDM_DATA_CATE_ITEM_OPEN` 을 sqlite·mssql 짝으로 추가하고, 버전 집합을 단언하는 기존 마이그레이션 테스트(`MdmSharedContractMigrationTest`, mssqlTest 5개)를 새 버전 반영으로 고친다.

### D11. 새 오류 코드 대신 `INVALID_INPUT` + 고정 문구
- 질문: 닫힌 키 안내·검사 실패·폐기 거부에 전용 `MdmErrorCode` 를 만들 것인가.
- 선택지: (a) 기존 `INVALID_INPUT`(MDM021)·`ROW_VERSION_CONFLICT`·`RESERVED_CATEGORY` 에 `DataItemMessages` 고정 문구를 detail 로 싣는다. (b) `CLOSED_KEY` 등 새 코드를 더한다.
- 택한 것: (a).
- 근거: BPMN 경로에서는 화면이 코드를 받지 못하고 `meta.message` 만 받는다(F12). 그래서 새 코드가 화면 판정에 주는 이득이 없다. 새 코드는 `CommonContractTest` 의 개수 21 고정을 깨고 형제 Task 와 충돌한다(F13).
- 반려되면: `MdmErrorCode` 에 코드를 더하고 `CommonContractTest` 개수를 고치며, 코어가 새 코드를 던지게 바꾼다. 화면 판정 문구(A2)는 새 코드의 `defaultMessage` 로 옮긴다.

### D12. API 경로(일괄 upsert)의 닫힌 키 — 받은 값으로 다시 연다(Build 추가)
- 질문: 수신 API 의 `closed` 플래그는 만들지 않았다(D2). 그러면 API 경로 upsert 에 닫힌 키가 오면 어떻게 하는가. design 은 CSV 의 닫힌 키 거부만 정했다.
- 선택지: (a) 받은 값으로 새 행을 열고 동작 REOPEN(마지막 행 +1, 닫힌 구간 보존). (b) CSV 처럼 이슈로 모아 요청 전체를 거부한다.
- 택한 것: (a).
- 근거: spec 본문은 이 경우를 정하지 않았다. 05 「저장 경로와 검증」은 API 를 upsert 로 두고 "닫기·다시 열기는 `closed` 플래그로 한다"와 "행 단위 거부가 없다(PARTIAL 없음), 요청 단위 거부는 모르는 마루 데이터·DEPRECATED·원천 불일치·본문 형식 오류뿐"을 정했다. 플래그가 없는 행은 `closed:false` 와 같고, 닫힌 키에 `closed:false` 가 오면 다시 열기다. (b)는 05 의 요청 단위 거부 목록에 없는 거부를 만든다. 검증: `DataItemChecksSqliteTest.C6_API_는_닫힌_키를_받은_값으로_다시_연다_D12`.
- 반려되면: `DataItemSaveCore.upsert` 의 닫힌 키 분기에서 API 도 CSV 와 같이 `CHK6` 이슈를 모으게 바꾸고, `DataItemSegmentStore.reopenWith` 와 위 시험을 지운다. 수신 API Task 가 `closed` 플래그를 만들 때 이 분기를 다시 정한다.

---

## E2E 서버 절차

TSK-04-02 design.md 「E2E 서버 절차」를 이 워크트리·이 Task 값으로 옮겼다. `be-run.sh`·`fe-run.sh` 는 쓰지 않는다(dev-discipline 「서버 프로세스」). 포트는 실행 시점에 비어 있는 번호로 다시 고른다(아래 번호는 예시). 전역 `gradlew --stop`, 이름 기반 `pkill`·`killall`·`pgrep -f` 종료, 남의 포트 종료는 금지다.

```bash
W=/Users/jji/project/dmes-standard/dflow-68d4a55b
SP=<Build/Verify 실행자의 scratchpad>
J=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
# 0) 빈 포트 고르기 — 셋 다 LISTEN 이 없어야 한다(예: mcm BE 18731, mdm BE 18732, FE 15731). 있으면 다른 번호.
lsof -iTCP:18731 -sTCP:LISTEN; lsof -iTCP:18732 -sTCP:LISTEN; lsof -iTCP:15731 -sTCP:LISTEN
# 0-1) PC 전역 무거운 명령 슬롯을 붙잡는다. HEAVY_ACQUIRED 를 확인한다(HEAVY_BUSY 면 같은 명령을 다시 부른다).
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh acquire e2e-TSK-07-03
# 1) 격리 DB — mcm.db·mdm.db 둘 다 옮겨 새 DB 로 시작한다(gitignore 대상).
mkdir -p $W/src/backend/data
[ -f $W/src/backend/data/mcm.db ] && mv $W/src/backend/data/mcm.db $W/src/backend/data/mcm.db.bak-$(date +%Y%m%d%H%M%S)
[ -f $W/src/backend/data/mdm.db ] && mv $W/src/backend/data/mdm.db $W/src/backend/data/mdm.db.bak-$(date +%Y%m%d%H%M%S)
# 2) mcm 백엔드
cd $W/src/backend/mcm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18731 --mcm.bff.invalidate-role-url=http://127.0.0.1:15731/api/mcm/internal/cache/invalidate-role --cactus.notify.publish-url=http://127.0.0.1:18731/notify/publish' > $SP/be-mcm.log 2>&1 &
BE_MCM_PID=$!   # 기동 로그의 sqlite 경로가 $W/src/backend/data/mcm.db 인지 반드시 확인(아니면 즉시 중단)
# 3) mdm 백엔드. SQLite 는 ../data/mdm.db = $W/src/backend/data/mdm.db
cd $W/src/backend/mdm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18732' > $SP/be-mdm.log 2>&1 &
BE_MDM_PID=$!   # 기동 로그의 sqlite 경로가 $W/src/backend/data/mdm.db 인지 확인
# 4) mcm 기동 완료(DataInitializer 로그 — "MDM 항목 관리·이력 시드" 한 줄 포함) 뒤 시드 대조와 시험 사용자.
#    새 leaf 를 더해도 대조는 그대로 통과한다(leaf 테이블을 보지 않고 역할 매핑은 mdmSample 만 본다).
cd $W/src/frontend && sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-seed-check.sql | diff - e2e/fixtures/mdm-rbac-seed-check.expected.txt   # 출력 없음 = 통과
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-users.sql
# 5) mdm 기동 완료(Flyway V11 적용 로그) 뒤 mdm.db 픽스처. 이 Task 픽스처는 필수, columnMng 픽스처는 전체 스위트일 때만.
cd $W/src/frontend && sqlite3 $W/src/backend/data/mdm.db < e2e/fixtures/mdm-dataItem.sql
cd $W/src/frontend && sqlite3 $W/src/backend/data/mdm.db < e2e/fixtures/mdm-columnMng-dict.sql   # 전체 스위트일 때
# 6) 포털 — m-mdm 을 먼저 build, 레지스트리는 predev 가 재생성한다(재생성 결과가 커밋본과 다르면 커밋 대상, F21)
cd $W/src/frontend && pnpm build:libs
cd $W/src/frontend/m-mcm && AUTH_SECRET=$(openssl rand -hex 32) NEXTAUTH_URL=http://127.0.0.1:15731 OIDC_ISSUER=http://127.0.0.1:15731 \
  MCM_WAS_URL=http://127.0.0.1:18731 MDM_WAS_URL=http://127.0.0.1:18732 BACKEND_API_URL=http://127.0.0.1:18731 \
  BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026 pnpm exec next dev --turbopack --port 15731 > $SP/fe.log 2>&1 &
FE_PID=$!
# 7) 시험 — 반드시 자기 포털(기본값 5100 은 메인 체크아웃 포털 → 거짓 통과). --workers=1(병렬 로그인 SQLITE_BUSY 방지).
#    이 Task 두 spec 만:
cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15731 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  $W/.claude/skills/dflow-dev/scripts/heavy.sh pnpm exec playwright test e2e/mdm-dataItemMng.spec.ts e2e/mdm-dataHistory.spec.ts --workers=1
#    전체 mdm 스위트(§3.5, Verify 변이 검증) — 1)부터 새 DB 로 다시 시작한 뒤:
cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15731 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  $W/.claude/skills/dflow-dev/scripts/heavy.sh pnpm exec playwright test e2e/mdm-*.spec.ts --workers=1
# 8) 다른 Task 의 추적 파일 복원 — 다른 spec 들이 자기 Task 스크린샷을 덮어쓴다. 이 Task 폴더(TSK-07-03/screens)는 되돌리지 않는다.
cd $W && /usr/bin/git checkout -- docs/mdm/tasks/TSK-01-02/screens/ docs/mdm/tasks/TSK-01-03/screens/ docs/mdm/tasks/TSK-04-02/screens/ docs/mdm/tasks/TSK-04-03/screens/ docs/mdm/tasks/TSK-04-04/screens/
cd $W && /usr/bin/git checkout -- src/frontend/m-mcm/next-env.d.ts 2>/dev/null; /usr/bin/git status --porcelain
#    남아야 하는 것: docs/mdm/tasks/TSK-07-03/screens/*.png, (재생성됐다면) src/frontend/m-mcm/lib/generated/page-registry.ts.
#    src/frontend/test-results/ 같은 산출물은 stage 하지 않는다. 한글 경로는 git diff --name-only -z | xargs -0 로 다룬다.
# 9) 정리 — 성공·실패·중단과 무관하게 반드시. 자기 PID 와 자기가 고른 포트만 거둔다.
kill $FE_PID $BE_MDM_PID $BE_MCM_PID
lsof -tiTCP:15731 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18732 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18731 -sTCP:LISTEN | xargs -r kill
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh release
```

- 통과 기준: 이 Task 두 spec 전부 passed, skipped·failed 0. 시드 대조 `diff` 출력 없음.
- 서버를 백그라운드로 띄우는 것은 서버 프로세스이고, 시험 명령과 게이트는 포그라운드로 끝까지 돌린다(dev-discipline 「포그라운드 실행」). 서버를 켜 둔 채 다음 Phase 로 넘기지 않는다.
- 기동 로그로 SQLite 경로가 이 워크트리 안인지 반드시 확인한다. 아니면 메인 체크아웃 DB 를 공유해 거짓 통과·데이터 오염이 난다.

---

## 코드베이스 지식 (Build 가 알아야 할 함정)

- **서비스 `@Transactional` 금지**(F11). 코어는 `new TransactionTemplate(transactionManager)` 로 합류한다. 코어 클래스도 `@Transactional` 을 붙이지 않는다(OASIS 진입점은 아니지만 일관성과 테스트 트랜잭션 경계 제어를 위해).
- **네이티브 쿼리 전에 `entityManager.flush()`**, 문자열 null 바인딩은 `setParameter(name, value, String.class)`(MSSQL 이 타입 없는 null 을 varbinary 로 보낼 수 있다). 일시는 반드시 `MdmTemporalBinder.toDb`/`fromDb`. DB 시각 함수 금지(`VersionRowStore` 주석).
- **Spring Data `save()` 를 쓰지 않는다.** 지정 복합 id 에 `@Version` 이 없으면 `save()` 는 merge 라 같은 PK 가 있어도 예외 없이 UPDATE 될 수 있다(조사 보고, 추측). 이 Task 의 쓰기는 전부 네이티브 INSERT/UPDATE 다.
- **VALID_TO 는 NOT NULL 이고 DB DEFAULT 에 기대지 않는다**: Hibernate·네이티브 모두 INSERT 에 값을 명시한다(S10).
- **MSSQL 코드 칼럼은 BIN2 콜레이션**이라 대소문자를 구분한다. 키 검색은 `UPPER(CODE) LIKE UPPER(:k)` 로 양쪽을 올린다. `ORDER BY CODE` 는 두 방언 모두 이진 순서다.
- **Hibernate 네이티브 페이징**: `setFirstResult`/`setMaxResults` 를 쓰면 SQLite `LIMIT/OFFSET`, MSSQL `OFFSET … FETCH` 로 바뀐다. MSSQL 은 `ORDER BY` 가 있어야 하므로 목록 쿼리는 항상 정렬을 둔다. COUNT 는 같은 WHERE 로 따로 한다.
- **Spring Boot 4 + Jackson 3**: classic `com.fasterxml.jackson.databind.ObjectMapper` 빈이 자동 등록되지 않는다(TSK-04-02 Build). JSON 이 필요하면 `new ObjectMapper()` 정적 인스턴스.
- **OASIS 요청 봉투**: `{meta:{menuId}, params:{…}}`. 서버 쪽 HTTP 테스트 경로는 `/oasis/{service}/{action}`, FE·BFF 경로는 `/api/mdm/oasis/{service}/{action}`. BFF(`m-mcm/proxy.ts` `evaluateApiPolicy`)가 메뉴 leaf RBAC 로 403 을 판정하고 mdm 백엔드는 역할 가드를 두지 않는다(TSK-01-03 D6). 그래서 백엔드 테스트에서는 역할과 무관하게 호출된다.
- **감사 사용자**: OASIS 밖에서 코어를 부르면 `AuditHolder` 가 비어 `C_USR_ID` 가 null 일 수 있다. 테스트는 `DmaTestSupport` 의 `MutableCurrentUser` 와 `UserContextHolder` 를 채우고 `@AfterEach` 에서 `AuditHolder.remove()`·`UserContextHolder.clear()` 를 부른다(`ColumnMngServiceSqliteTest:103-116`).
- **SQLite 동시성**: 잠금 탐침(T-L)의 별도 연결은 `DriverManager.getConnection("jdbc:sqlite:" + path)` 로 열고 `PRAGMA busy_timeout = 0` 뒤 `BEGIN IMMEDIATE` 를 실행한다. 스프링 풀 연결을 쓰면 같은 연결을 재사용해 잠금이 안 보일 수 있다. 끝나면 `ROLLBACK`·`close()`.
- **`MdmTemporalSegmentStore` 구현체 위치**: 계약 패키지 밖(`common.segment`). 계약의 javadoc("구현은 이 Task 밖")은 고치지 않는다(계약 파일 무변경 원칙). ArchUnit 뒤집기(F5)만 한다.
- **m-mdm 화면**: `@/shell` 의 `MdmPageLayout` 이 breadcrumb `마루 MDM > 마스터데이터 > {title}` 을 만든다. 버튼 권한은 `useUserButtonRbac(true)`·`canDoButton`. `Select`·`Input`·`Checkbox`·`Button` 은 `@dk-oasis/shared/form`, `Pagination`·`AgDataGrid`·`GridPanel`·`GridColumn` 은 `@dk-oasis/shared/grid`, `ContentBody`·`ContentPanel`·`SearchArea`·`SearchField`·`ErrorModal` 은 `@dk-oasis/shared/layout`. `size`·`radius` 를 지정하지 않고 색은 의미 토큰만 쓴다.
- **`pnpm build:libs` 선행** 없이 m-mdm vitest 를 돌리면 lib 산출물 의존 테스트가 실패한다(게이트 명령 2 가 이미 선행한다).
- **탭 스냅샷**: 화면 상태는 `PageProps` 의 `snapshot`/`onSnapshotChange` 로만 보존된다. 이 Task 는 스냅샷을 쓰지 않아도 된다(선례 화면도 쓰지 않는다).
- **형제 Task 공유 파일은 추가만**: `DataInitializer.java`(새 메서드 + 호출 한 줄), `tsup.config.ts`(엔트리 두 줄), `page-registry.ts`(codegen 재생성), e2e 픽스처는 새 파일. 기존 줄을 고치지 않는다. 머지 충돌이 나면 양쪽 줄을 모두 유지한다.
- **스크린샷 산출물**: `docs/mdm/tasks/TSK-07-03/screens/` 폴더는 아직 없다. spec 이 `mkdirSync` 하거나 Playwright `screenshot({ path })` 가 폴더를 만든다(Playwright 는 부모 폴더를 만든다).

---

## Build 게이트 결과

기준선 합계 tests=2823, failures=0. 모두 리포 루트에서 글자 그대로 돌렸다(1·2 는 `heavy.sh` 로 감쌈).

| # | 명령 | 결과 |
|---|---|---|
| 1 | backend `testAll` | exit 0, tests 2436(기준선 2337, +99), failures 0, errors 0 |
| 2 | `pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test` | 화면 수정 전: 첫 실행 exit 1 — 이 작업과 무관한 `tests/evalex-perf.test.ts` NFR-1 성능 2건(중앙값 118.7ms·105.4ms > 100ms, load average 약 21), 재실행 exit 0·tests 346·failures 0. 화면 수정(`072d703`) 뒤: 아래 「게이트 2 재측정」 |
| 3 | `check_oasis_contract.py --root .` | exit 0(BPMN 26 / bean 26 해석, ERROR 0 WARN 0) |
| 4 | `pnpm --filter @dk-oasis/m-mdm lint` | exit 0 |
| 5 | `pnpm test:unit:shared` | exit 0, tests 156, failures 0 |

게이트 2 재측정(화면 수정 `072d703` 뒤, load average 22~30): 1회 exit 1(evalex-perf 1건, BASE_SPD_LKP 중앙값 100.5ms), 2회 exit 1(evalex-perf 2건), 3회 exit 0·tests 347(기준선 330, +17)·failures 0. `tests/evalex-perf.test.ts` 는 이 작업이 건드리지 않은 TSK-03-04 성능 시험(1만 레코드 100ms)이고, 단독으로 두 번 돌려도 같은 부하에서 통과·실패가 갈렸다(환경 부하 의존). 게이트 3·4 도 재실행 exit 0.

추가 점검: `mantine_docs.py audit`·`aggrid_docs.py audit`(pages/dmd) 둘 다 의심 0건.

E2E(「E2E 서버 절차」, mcm 18731·mdm 18732·포털 15731, 격리 mcm.db·mdm.db, 시드 대조 diff 없음): 두 번 띄웠다.
- 1차: 8 passed. 스크린샷을 눈으로 보니 그리드가 가로로 밀려 키·이름 열이 가려지고, 조회영역 체크박스의 네모가 보이지 않았다.
- 화면을 고친 뒤(이탈 11) 새 DB 로 2차 기동: 첫 실행에서 `mdm-dataItemMng` S2 가 실패했다. 원인은 화면의 실제 경쟁 상태였다 — 첫 로드 때 자동 선택한 첫 마루 데이터(E2E_DI_CUST)의 search 응답이 뒤에 고른 E2E_DI_PORT 응답보다 늦게 와 목록을 덮었다(머리는 PORT, 행은 C0001). 1차 통과는 우연이었다. 요청 순번으로 늦은 응답을 버리게 고치고(렌더 시험 추가, 변이로 확인), e2e 는 그 마루 데이터의 응답을 기다리게 했다. 같은 mdm.db 로 두 spec 재실행 8 passed, 이어서 `mdm-dataItemMng.spec.ts` 만 두 번 더 4 passed·4 passed(재실행 안전성·경쟁 재발 없음).
- 스크린샷 6장은 마지막 실행 것으로 `screens/` 에 있다. 전체 mdm 스위트(§3.5)는 Verify 몫이라 돌리지 않았다.

## Build 변이 검증 결과

방법: 초록 커밋 위에서 파일 하나를 고치고 → 그 변이를 잡을 시험 클래스만 돌리고(백엔드 `:api:test --tests …`, 프런트 `vitest run <파일>`) → `/usr/bin/git checkout -- <파일>` 로 되돌렸다(A3 는 새 파일을 만들었다 지움). 컴파일 실패로만 빨강이 된 변이는 없다(Q1b 첫 형태는 파라미터 바인딩 오류로 빨강이라 의미 변이가 아니어서 형태를 바꿔 다시 돌렸다).

요약: 변이 64개(불변 규칙 41개 중 40개 대상) 모두 빨강(CAUGHT). 그중 둘(S4c, C3b)은 첫 스윕에서 살아남아 시험을 보탠 뒤 잡혔다. 스윕 전에 설계를 다시 보며 기존 시험이 못 잡을 변이 셋(S9b 절삭 제거, A2 서버 문구 변경, A4 omitNullish 제거)을 찾아 시험을 먼저 보탰다(`910fca3`).

**못 잡은 것·SQLite 로 확인하지 못한 것(은폐 금지)**
- S11(키당 열린 행 1개·겹침 0의 **동시** 부분): 변이를 돌리지 않았다. SQLite 는 DB 전체 쓰기 잠금이라 잠금·CAS 를 빼도 동시 저장이 겹치지 않는다(F10). 직렬 50사건 겹침 0 만 SQLite 로 확인했다. 동시 부분은 mssqlTest `DataSegmentConcurrencyMssqlTest` M1~M4 로 설계했으나 도커 금지로 컴파일·실행하지 않았다.
- L1·L2 의 실제 직렬화 효과(MSSQL 행 X 잠금 보유): SQLite 게이트가 잡는 것은 호출 순서·잠금 뒤 재조회·쓰기 잠금 탐침·값 불변뿐이다(표의 L1·L1b·L2). X 잠금 보유는 M5(미실행)가 맡는다.
- S4c 는 코어 경유로는 드러나지 않는다(코어가 잠금 뒤 먼저 비교하므로 CAS 는 두 번째 방어선). 저장소 계약을 직접 부르는 `S4_저장소의_닫는_UPDATE_는_ROW_VERSION_조건부_CAS_다` 로 덮었다.
- C3b 는 코어 경유로 도달하지 않는다(EXTERNAL 은 API 경로만 통과하고 API 는 행 내용 검사를 건너뛴다). 검사 컴포넌트 단위 시험 `DataItemChecksTest` 로 덮었다.
- e2e 변이(§3.5 — 충돌 재조회 제거, 열 머리 번호화 등을 전체 e2e 스위트로 확인)는 Verify 몫이라 돌리지 않았다. 같은 변이는 위 표에서 vitest 로 잡힌다(F1, Q5).

| 변이 | 규칙 | 대표 변이 | 결과 | 잡은 시험(첫 실패) | 비고 |
|---|---|---|---|---|---|
| S1 | S1 | 수정 새 행 valid_from = at+1s | CAUGHT | `MasterDataExamplesScenarioTest.X2 (X1 수신 로그는 보류라 재현하지 않음) 내용 검사 없이 C1·C2·C4 저장` |  |
| S1b | S1 | 수정에서 옛 행을 닫지 않음(닫기 UPDATE 생략) | CAUGHT | `MasterDataExamplesScenarioTest.X2 (X1 수신 로그는 보류라 재현하지 않음) 내용 검사 없이 C1·C2·C4 저장` |  |
| S2 | S2 | 다시 열기에 빈 값 사용 | CAUGHT | `DataItemSegmentCoreSqliteTest.S7_S2_다시_열기는_마지막_값을_복사하고_닫힌_구간을_남긴다()` |  |
| S3 | S3 | 수정 새 행 row_version 0 | CAUGHT | `DataItemSegmentCoreSqliteTest.S1_S2_S3_수정은_옛_행을_같은_시각에_닫고_새_행_row_version_을_올린다()` |  |
| S3b | S3 | 닫기에서 row_version 을 올리지 않음 | CAUGHT | `DataItemSegmentCoreSqliteTest.S6_S3_닫기는_열린_행_valid_to_만_적고_row_version_을_올린다()` |  |
| S4 | S4 | row_version 비교 제거 | CAUGHT | `DataItemSegmentCoreSqliteTest.S3_S4_남이_닫은_뒤_옛_row_version_으로_다시_열면_충돌한다()` |  |
| S4b | S4 | 마지막 행 대신 첫 행과 비교(수정) | CAUGHT | `DataItemSegmentCoreSqliteTest.S9_같은_초의_사건은_경계를_1초씩_민다()` |  |
| S4c | S4 | 닫는 UPDATE 조건에서 ROW_VERSION 제거 | CAUGHT | `DataItemSegmentCoreSqliteTest.S4_저장소의_닫는_UPDATE_는_ROW_VERSION_조건부_CAS_다()` | 첫 실행 SURVIVED → 시험 보강 뒤 CAUGHT |
| S5 | S5 | 비교 필드 attr10 누락 | CAUGHT | `DataItemSegmentCoreSqliteTest.비교 필드 18` |  |
| S5b | S5 | 값이 같아도 항상 새 행 | CAUGHT | `DataItemSegmentCoreSqliteTest.S5_값이_같은_수정은_NONE_이고_아무것도_쓰지_않는다()` |  |
| S5c | S5 | 정규화 제거(trim·빈 문자열) | CAUGHT | `DataItemSegmentCoreSqliteTest.S5_값이_같은_수정은_NONE_이고_아무것도_쓰지_않는다()` |  |
| S5d | S5 | FE 저장 파라미터 trim·빈 값 제외 제거 | CAUGHT | `toSaveParams (A4·S5) > 빈 문자열·공백·null 값은 키를 뺀다` |  |
| S6 | S6 | 닫기에서 새 행 생성 | CAUGHT | `MasterDataExamplesScenarioTest.E6 항목 KRINC 닫기` |  |
| S7 | S7 | 다시 열기가 닫힌 구간을 메움(새 행 valid_from = 마지막 valid_to) | CAUGHT | `DataHistoryServiceSqliteTest.H1_H2_생성_변경_닫힘_다시_열기_변경은_사건과_빈_구간으로_보인다()` |  |
| S8 | S8 | 닫힌 키 등록 허용 | CAUGHT | `DmdOasisHttpTest.A2_닫힌_키_reg_는_다시_열기_안내가_meta_message_에_온다()` |  |
| S9 | S9 | 같은 초 밀기 제거 | CAUGHT | `DataItemSegmentCoreSqliteTest.S9_저장_시각은_초_단위로_자른다()` |  |
| S9b | S9 | 저장 시각 절삭 제거 | CAUGHT | `DataItemSegmentCoreSqliteTest.S9_저장_시각은_초_단위로_자른다()` |  |
| S10 | S10 | 새 열린 행에 다른 센티넬 | CAUGHT | `DataItemSegmentCoreSqliteTest.S1_S2_S3_수정은_옛_행을_같은_시각에_닫고_새_행_row_version_을_올린다()` |  |
| S12 | S12 | 잠금 문이 순번을 올림 | CAUGHT | `DataSegmentLockSqliteTest.L2_S12_잠금과_사건은_TB_MDM_DATA_의_순번_감사_칼럼을_바꾸지_않는다()` |  |
| S12b | S12 | 새 행에 순번 1 | CAUGHT | `MasterDataExamplesScenarioTest.X4 동기화 — tx2 에 경계가 생긴 ITEM 5행, C3 은 없다` |  |
| S13 | S13 | UPDATE 감사 VER 증가 누락 | CAUGHT | `DataItemSegmentCoreSqliteTest.S13_새_행은_감사_9칼럼을_쓰고_닫는_UPDATE_는_U_와_VER_을_올린다()` |  |
| S13b | S13 | INSERT 감사 사용자 누락 | CAUGHT | `DataItemSegmentCoreSqliteTest.S13_새_행은_감사_9칼럼을_쓰고_닫는_UPDATE_는_U_와_VER_을_올린다()` |  |
| S14 | S14 | BASE 가드 제거 | CAUGHT | `DataCategorySegmentCoreSqliteTest.S14_BASE_는_수정_닫기를_거부한다()` |  |
| C0 | C0 | API 경로에서 행 내용 검사 실행 | CAUGHT | `MasterDataExamplesScenarioTest.X2 (X1 수신 로그는 보류라 재현하지 않음) 내용 검사 없이 C1·C2·C4 저장` |  |
| C1 | C1 | DEPRECATED 검사 제거 | CAUGHT | `DataItemChecksSqliteTest.C1_C2_는_즉시_거부라_다른_검사_이슈가_섞이지_않는다()` |  |
| C1b | C0 | 검사 1 을 즉시 거부 대신 이슈로 모아 계속 검사 | CAUGHT | `DataItemChecksSqliteTest.C1_C2_는_즉시_거부라_다른_검사_이슈가_섞이지_않는다()` |  |
| C2 | C2 | 원천 검사 제거 | CAUGHT | `DataItemChecksSqliteTest.C1_C2_는_즉시_거부라_다른_검사_이슈가_섞이지_않는다()` |  |
| C3 | C3 | 키 패턴 find() 부분 일치 | CAUGHT | `DataItemChecksSqliteTest.C3_MDM_원천_키는_code_pattern_전체_일치()` |  |
| C3b | C3 | EXTERNAL 에도 키 패턴 적용 | CAUGHT | `DataItemChecksTest.C3_키_패턴은_MDM_원천의_신규_키에만_적용한다()` | 첫 실행 SURVIVED → 시험 보강 뒤 CAUGHT |
| C4 | C4 | 이름 필수 검사 제거 | CAUGHT | `DataItemChecksSqliteTest.C4_화면_CSV_는_이름이_필수다()` |  |
| C5 | C5 | 라벨 없는 칸 검사 제거 | CAUGHT | `DataItemChecksSqliteTest.C5_라벨_없는_칸의_값은_화면_CSV_거부_API_통과()` |  |
| C5-1 | C5-1 | 계층 대조에서 닫힌 키 제외 | CAUGHT | `DataItemChecksSqliteTest.C5_1_닫힌_키의_마지막_행도_비교한다()` |  |
| C5-1b | C5-1 | 중간 칸 비움 검사 제거 | CAUGHT | `DataItemChecksSqliteTest.C5_1_중간_칸_비움과_콤마_공백을_거부한다()` |  |
| C5-2 | C5-2 | lvl_cnt 경계 off-by-one | CAUGHT | `DataItemChecksSqliteTest.C5_2_lvl_cnt_보다_뒤_칸의_값은_거부한다()` |  |
| C6 | C6 | CSV 가 닫힌 키를 다시 엶 | CAUGHT | `DataItemChecksSqliteTest.C6_CSV_는_닫힌_키를_다시_열지_않고_거부한다()` |  |
| C7 | C7 | 소속 검사 제거 | CAUGHT | `DataCategorySegmentCoreSqliteTest.C7_소속은_항목_열림_카테고리_열림_TABLE_일_때만()` |  |
| L1 | L1 | 선분 읽기를 잠금 앞으로(수정) | CAUGHT | `DataSegmentLockSqliteTest.L1_모든_쓰기_사건은_첫_사건으로_잠금을_정확히_한_번_부른다()` |  |
| L1b | L1 | 카테고리 등록에서 잠금 호출 누락 | CAUGHT | `DataSegmentLockSqliteTest.L1_모든_쓰기_사건은_첫_사건으로_잠금을_정확히_한_번_부른다()` |  |
| L2 | L2 | 잠금 문을 SELECT 로 | CAUGHT | `DataSegmentLockSqliteTest.L2_잠금은_쓰기_잠금이라_다른_연결의_BEGIN_IMMEDIATE_가_막힌다()` |  |
| L3 | L3 | 잠금 0행 무시 | CAUGHT | `DataSegmentLockSqliteTest.L3_없는_마루_데이터는_거부하고_아무것도_쓰지_않는다()` |  |
| Q1 | Q1 | 키별 마지막 행 조건 제거(모든 행) | CAUGHT | `DataItemMngServiceSqliteTest.Q1_목록은_키별_마지막_행이고_닫힌_키는_showClosed_일_때만()` |  |
| Q1b | Q1 | showClosed 무시(닫힌 키 늘 표시) | CAUGHT | `DataItemMngServiceSqliteTest.Q1_목록은_키별_마지막_행이고_닫힌_키는_showClosed_일_때만()` | 첫 형태는 파라미터 바인딩 오류로 빨강(의미 변이 아님) → 조건만 무력화한 형태로 재실행 |
| Q2 | Q2 | seq NULL 을 앞으로 | CAUGHT | `DataItemMngServiceSqliteTest.Q2_Q3_서버_페이징은_0부터_50건씩이고_seq_NULL_은_뒤_같으면_code_순()` |  |
| Q3 | Q3 | size 상한 제거 | CAUGHT | `DataItemMngServiceSqliteTest.Q3_size_는_기본_50_상한_200()` |  |
| Q3b | Q3 | REGEX totalCount 를 필터 전 수로 | CAUGHT | `DataItemMngServiceSqliteTest.Q4_카테고리_REGEX_는_서버_정규식_대상_NULL_불일치_TABLE_은_열린_소속_BASE_는_전체()` |  |
| Q3c | Q3 | LIKE 이스케이프 제거 | CAUGHT | `DataItemMngServiceSqliteTest.Q3_퍼센트_밑줄_역슬래시는_와일드카드가_아니다()` |  |
| Q4 | Q4 | REGEX 대상 NULL 을 빈 문자열로 일치 | CAUGHT | `DataItemMngServiceSqliteTest.Q4_카테고리_REGEX_는_서버_정규식_대상_NULL_불일치_TABLE_은_열린_소속_BASE_는_전체()` |  |
| Q4b | Q4 | TABLE 필터에서 닫힌 소속 포함 | CAUGHT | `DataItemMngServiceSqliteTest.Q4_카테고리_REGEX_는_서버_정규식_대상_NULL_불일치_TABLE_은_열린_소속_BASE_는_전체()` |  |
| Q5 | Q5 | FE 추가 컬럼 열 머리를 번호로 | CAUGHT | `buildItemColumns (Q5) > 추가 컬럼 열은 라벨이 있는 번호만이고 머리는 라벨 원문이다` |  |
| Q5b | Q5 | FE 계층 열 전 칸 표시 | CAUGHT | `buildItemColumns (Q5) > 계층 열은 1차~lvlCnt차만 만든다` |  |
| Q5c | Q5 | BE 라벨 없는 번호도 머리에 포함 | CAUGHT | `DataItemMngServiceSqliteTest.Q5_Q6_머리는_계층_칸_수_라벨_있는_번호만_편집_가능_여부를_준다()` |  |
| Q6 | Q6 | FE EXTERNAL 편집 허용 | CAUGHT | `isRowEditable (Q6) > MDM·INUSE 머리이고 그 행이 열려 있을 때만 편집한다` |  |
| Q6b | Q6 | BE editable 에서 INUSE 조건 제거 | CAUGHT | `DataItemMngServiceSqliteTest.Q5_Q6_머리는_계층_칸_수_라벨_있는_번호만_편집_가능_여부를_준다()` |  |
| H1 | H1 | 이력 행 정렬 뒤바꿈 | CAUGHT | `DataHistoryServiceSqliteTest.H2_마지막_사건이_닫기면_마지막_행은_CLOSED_상태는_소멸()` |  |
| H2 | H2 | 빈 구간 판정 부등호 뒤바꿈 | CAUGHT | `DataHistoryServiceSqliteTest.H1_H2_생성_변경_닫힘_다시_열기_변경은_사건과_빈_구간으로_보인다()` |  |
| H2b | H2 | FE 가 빈 구간 줄을 끼우지 않음 | CAUGHT | `DataHistoryPage > 빈 구간이 있는 행 앞에 닫혀 있던 구간 줄을 하나 끼운다` |  |
| H3 | H3 | 이력 키 필수 검사 제거 | CAUGHT | `DataHistoryServiceSqliteTest.H3_키가_없으면_거부하고_없는_키는_빈_목록()` |  |
| A1 | A1 | BPMN 액션 이름 restore→reopen | CAUGHT | `DmdBpmnActionTest.dataItemMng_액션은_view_search_reg_save_delete_restore()` |  |
| A1b | A1 | BPMN method 매핑 reg→save 뒤바꿈 | CAUGHT | `DmdBpmnActionTest.dataItemMng_액션은_view_search_reg_save_delete_restore()` |  |
| A2 | A2 | 서버 닫힌 키 문구 변경 | CAUGHT | `DmdScreenMessageParityTest.화면_판정_상수는_서버_문구와_같은_글자다()` |  |
| A2b | A2 | FE 충돌 접두어 변경 | CAUGHT | `문구 판정 (A2·F1) > 충돌 문구는 서버 기본 문구로 시작하면 참이다` |  |
| A3 | A3 | 다른 패키지에 네 번째 구현체 | CAUGHT | `MdmTemporalSegmentStoreNoImplementationTest.MdmTemporalSegmentStore_구현체는_common_segment_의_정해진_세_클래스뿐이다()` |  |
| A4 | A4 | FE omitNullish 제거 | CAUGHT | `dataItemMng api > 빈 조건은 params 키에서 빠지고 null 이 없다` |  |
| F1 | F1 | 충돌 뒤 재조회 제거 | CAUGHT | `DataItemMngPage > 충돌 문구를 받으면 안내를 보이고 목록을 다시 부른다(F1)` |  |
| S11 | S11 | 잠금·CAS 제거 뒤 동시 저장 | 미실행 | — | SQLite 로 못 잡음(위 설명). M1~M4 미실행(도커 금지) |
| RACE | (화면) | 늦게 도착한 옛 search 응답 무시 가드 제거 | CAUGHT | `DataItemMngPage > 늦게 도착한 옛 조회 응답은 새 선택의 목록을 덮지 않는다` | 불변 규칙 밖. e2e 2차에서 드러난 경쟁을 고치며 더한 시험 |

## Build 이탈

design 과 다르게 한 것과 design 에 없던 것을 적는다.

1. **보조 타입·파일 추가**(변경 파일 목록에 없음): `common.segment` 에 `SegmentRow`(열린 행 판정 공통 인터페이스, S10), `HierarchyIndex`(검사 5-1 메모리 색인 — 일괄 upsert 3,000행을 행마다 재조회하지 않으려고), `SaveOutcome`·`SegmentOutcome`(결과 record)을 두었다. `dmd.dataItemMng.service.DataItemRows`(DTO 변환·일시 문자열화)를 두었다. 목록 쿼리가 같은 칼럼 목록·변환을 쓰도록 `DataSegmentRowStore.ITEM_COLUMNS`·`toItem` 을 public 으로 열고, 머리의 카테고리 목록용 `openCateRows` 를 더했다.
2. **저장소 오버로드**: 계약에 row_version 인자가 없어(F7) `DataItemSegmentStore` 에 `modify(key, value, at, expected)`·`close(key, at, expected)`·`modifyOpen(openRow, …)`(일괄 upsert 가 이미 읽은 열린 행으로 부름)·`reopenWith(last, value, at)`(D12)를 더했다. 계약 메서드 넷은 그대로 구현한다.
3. **일괄 upsert 의 거부 방식**: 검사 1·2 는 던지고(즉시 거부), 검사 3~6 은 던지지 않고 `UpsertResult.issues` 로 돌려준다(`written=false`). 07-04 CSV 검증 결과 표가 행별 이슈를 그리게 하려는 것이다. design 의 "이슈가 있으면 쓰지 않는다"와 같은 뜻이다. 한 파일 안의 같은 키는 `CHK6` 이슈다.
4. **화면 서비스 읽기 트랜잭션**: `DataItemMngService`·`DataHistoryService` 의 읽기는 읽기 전용 `TransactionTemplate` 으로 감쌌다(`DataSegmentRowStore` 가 쿼리 전에 flush 해서 트랜잭션 밖 호출이 실패한다). OASIS 에서는 프로세스 트랜잭션에 합류한다. `@Transactional` 은 쓰지 않았다(F11).
5. **시험 보강**(design §3 에 없던 것): `DmdScreenMessageParityTest`(A2 — 서버 문구와 `messages.ts` 상수를 글자 그대로 대조), `DataItemChecksTest`(C3b), T-S 의 `S4_저장소의_닫는_UPDATE_는_ROW_VERSION_조건부_CAS_다`(S4c)·절삭 시험의 같은 순간 두 번째 사건(S9b), `DataItemChecksSqliteTest.C6_API_는_닫힌_키를_받은_값으로_다시_연다_D12`, 프런트 `data-item-api.test.ts`(A4).
6. **F1 렌더 시험의 동작**: design 은 "`save` 응답을 충돌 문구로 주면 search 가 다시 불린다"였다. happy-dom 에서 ag-grid 셀 편집을 흉내 내기 어려워 행의 「닫기」(`delete`) 응답을 충돌 문구로 주었다. 재조회는 쓰기 넷이 같은 오류 처리 함수(`handleWriteError`)를 거치므로 판정 대상은 같다. `save` 경로의 충돌 재조회는 e2e 스모크 4 가 실제로 확인한다.
7. **프런트 렌더 시험 순서**: 순수 함수 시험(`data-item-columns.test.ts`)은 구현 전에 썼지만, 두 렌더 시험은 화면을 쓴 뒤에 썼다(happy-dom 에서 ag-grid 가 머리·셀을 그리는지 먼저 확인해야 했다). 대신 변이 검증(Q5·F1·H2b)으로 그 시험이 틀린 구현을 잡는지 확인했다. 두 렌더 시험은 이 happy-dom 환경에 `localStorage` 가 없어 `vi.stubGlobal` 로 대신 넣는다(`apiRequest` 가 토큰을 읽는다).
8. **화면 세부**: 첫 로드 때 마루 데이터 목록의 첫 항목을 자동으로 고른다(늦게 도착한 옛 응답은 요청 순번으로 버린다). 조회조건 입력은 `SearchField` children 으로 넣어 `data-testid`·`aria-label` 을 달았다(e2e 선택자). 「닫힌 항목 보기」는 design 의 `Checkbox` 대신 `Select`(숨김/보기)다 — 조회영역 안 Mantine Checkbox 는 shared `page-layout.css` 의 `.page-layout .search-field input[type="checkbox"] { border: 0; background: none }` 규칙이 네모를 지워 보이지 않는다(shared 문제라 화면 CSS 로 덮지 않았다, 보고에 올린다). 키 열은 왼쪽·작업 열은 오른쪽에 고정(`pinned`)하고 최소 폭을 줄였다 — `columnSizing="fit"` 은 열 너비를 최소 폭으로 보장해 동적 열이 많으면 가로 스크롤이 생긴다. 이력 타임라인의 열린 행 끝 일시는 "열림"으로 보인다. 소속 이력의 카테고리 선택지는 열린 카테고리만이다.
9. **BPMN 작성 도구**: `bpmn-tool` 이 전역 설치돼 있지 않아 `npx -y @cothe/bpmn-tool create`(같은 패키지 v1.3.0)로 만들고 validate 했다. 경고는 default flow 미설정 1건으로 `unitMng.bpmn` 선례와 같다(OASIS 는 분기 이름으로 라우팅).
10. **mssqlTest**: `DataSegmentConcurrencyMssqlTest` 는 작성만 했고 컴파일도 확인하지 않았다(`compileMssqlTestJava` 는 이름에 mssql 이 들어 금지). `MdmMasterDataMssqlMigrationTest` 의 import·어노테이션을 따랐다. 머지 뒤 팀장 dialect_check 에서 처음 컴파일된다.
11. **화면 모양 수정(e2e 1차 스크린샷에서 발견)**: 그리드 가로 밀림(키·이름 열 가림)과 조회영역 체크박스 네모 없음을 이탈 8 의 방식으로 고쳤다(`072d703`). 고친 뒤 스크린샷을 다시 찍어 눈으로 확인했다. 시작 일시 열은 좁은 폭에서 뒤가 잘려 보일 수 있다.

---

## 공용 코어 명세 (TSK-07-02·07-04 재사용용)

팀장 확정: D4 (a)(카테고리·소속 선분 코어를 이 Task 가 만든다), D1(그룹 코드 `dmd`). 아래는 **실제로 구현한** 공용 코어다(커밋 `2be6fa0` 기준, 이후 시그니처 변경 없음). 새로 만들지 말고 이것을 주입받아 쓴다.

### 위치와 구성

- 패키지: `com.dongkuk.dmes.mdm.common.segment` (lib, `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/segment/`).
- 모두 스프링 빈이다(`@Component`·`@Repository`). 생성자 주입으로 받는다.

| 층 | 클래스 | 역할 |
|---|---|---|
| 위층(진입) | `DataItemSaveCore` | 항목 사건 — 화면 1건(등록·수정·닫기·다시 열기)과 일괄 upsert(CSV·API) |
| 위층(진입) | `DataCategorySegmentCore` | 카테고리 사건(등록·수정·닫기·다시 열기)과 소속(TABLE) 등록·해제 |
| 잠금 | `DataSegmentLock` | `TB_MDM_DATA` 행 잠금 + 잠금 뒤 마루 데이터 행 재조회 |
| 아래층 | `DataItemSegmentStore`·`DataCateSegmentStore`·`DataCateItemSegmentStore` | 계약 `MdmTemporalSegmentStore` 구현체 셋. 검사 없이 선분 연산만 한다 |
| 저장소 | `DataSegmentRowStore` | 세 선분 테이블 네이티브 SQL 읽기·쓰기 |
| 검사 | `DataItemChecks`, `HierarchyIndex` | 05 검사 1~7, 검사 5-1 계층 색인 |
| 보조 | `SegmentBoundary`, `DataItemMessages` | 경계(저장 시각) 확정, 고정 오류 문구 |
| 값·결과 타입 | `DataItemKey`·`DataCateKey`·`DataCateItemKey`, `DataItemValue`·`DataCateValue`, `ItemSegmentRow`·`CateSegmentRow`·`CateItemSegmentRow`(공통 `SegmentRow`), `LockedMaruData`, `DataSavePath`, `UpsertRow`·`UpsertResult`(`RowAction`), `SaveOutcome`, `SegmentOutcome` | record·enum |

**후속 Task 는 위층 두 클래스(`DataItemSaveCore`·`DataCategorySegmentCore`)만 부른다.** 잠금·아래층·저장소를 직접 조합하지 않는다(잠금 순서 L1 을 깨기 쉽다).

### public 시그니처

```java
// DataItemSaveCore — 화면 경로는 모두 DataSavePath.SCREEN 검사 집합
SaveOutcome register(String maruDataId, String code, DataItemValue value)
SaveOutcome modify(String maruDataId, String code, DataItemValue value, int expectedRowVersion)
SaveOutcome close(String maruDataId, String code, int expectedRowVersion)
SaveOutcome reopen(String maruDataId, String code, int expectedRowVersion)
UpsertResult upsert(String maruDataId, DataSavePath path, String callerSystem, List<UpsertRow> input, boolean dryRun)

// DataCategorySegmentCore
SegmentOutcome registerCate(String maruDataId, String cateId, DataCateValue value)
SegmentOutcome modifyCate(String maruDataId, String cateId, DataCateValue value)
SegmentOutcome closeCate(String maruDataId, String cateId)
SegmentOutcome reopenCate(String maruDataId, String cateId)
SegmentOutcome addMember(String maruDataId, String cateId, String code)     // 닫힌 소속이 있으면 REOPEN, 없으면 INSERT
SegmentOutcome removeMember(String maruDataId, String cateId, String code)  // 열린 소속 행을 닫는다(CLOSE)

// 결과·입력 타입
record SaveOutcome(MdmTemporalSegmentAction action, ItemSegmentRow latest, LocalDateTime at)  // latest = 사건 뒤 그 키의 마지막 행
record SegmentOutcome(MdmTemporalSegmentAction action, LocalDateTime at)
record UpsertRow(String code, DataItemValue value)
record UpsertResult(List<RowAction> rows, List<MdmCheckIssue> issues, LocalDateTime at, boolean written)
    record RowAction(String code, MdmTemporalSegmentAction action);   List<MdmTemporalSegmentAction> actions()
record DataItemValue(String name, String alterName, Integer seq, String description, List<String> lvl, List<String> attr)
    // 생성자가 정규화: trim, 빈 문자열→null, lvl 5칸·attr 10칸으로 맞춤. lvl(1..5)·attr(1..10)·lvlChain()·sameAs(other)
record DataCateValue(String cateName, String defKind, String defExpr, String defTarget, String description)
    // defKind = "REGEX"·"TABLE"(상수 DataCateValue.REGEX·TABLE), defTarget = KEY·LVL1~5·ATTR01~10
enum DataSavePath { SCREEN, CSV, API }

// 잠금·검사(직접 부를 일은 드물다)
LockedMaruData DataSegmentLock.lock(String maruDataId)      // LOCK_SQL = "UPDATE TB_MDM_DATA SET LAST_CHG_SEQ = LAST_CHG_SEQ WHERE MARU_DATA_ID = :id"
void DataItemChecks.requireActive(LockedMaruData)            // 검사 1
void DataItemChecks.requireSourcePath(DataSavePath, LockedMaruData, String callerSystem)   // 검사 2
List<MdmCheckIssue> DataItemChecks.contentIssues(DataSavePath, LockedMaruData, String code, DataItemValue, boolean isNew, HierarchyIndex)  // 3~5-2, API 는 빈 목록
List<MdmCheckIssue> DataItemChecks.rowIssues(LockedMaruData, String code, DataItemValue, boolean isNew)
List<MdmCheckIssue> DataItemChecks.hierarchyIssues(HierarchyIndex, String code, DataItemValue)
List<MdmCheckIssue> DataItemChecks.membershipIssues(String code, List<ItemSegmentRow>, List<CateSegmentRow>)  // 검사 7
List<MdmCheckIssue> DataItemChecks.cateDefIssues(String cateId, DataCateValue)
static BusinessException DataItemChecks.rejected(List<MdmCheckIssue>)   // INVALID_INPUT + 이슈 문구를 "; " 로 이음
static LocalDateTime SegmentBoundary.next(LocalDateTime now, Collection<? extends SegmentRow> rows)
```

아래층 `DataItemSegmentStore` 에는 계약 네 메서드 말고 `modify(key, value, at, Integer expected)`·`close(key, at, Integer expected)`·`modifyOpen(ItemSegmentRow open, value, at, Integer expected)`·`reopenWith(ItemSegmentRow last, value, at)` 가 더 있다. 위층이 쓰는 것이고 후속 Task 가 직접 부르지 않는다.

### 호출 전제

- **트랜잭션**: 위층 메서드는 스스로 `TransactionTemplate`(전파 REQUIRED)을 쓴다. OASIS 서비스 안에서 부르면 프로세스 트랜잭션(`cactus.oasis.transactional: true`)에 합류하고, 밖에서 부르면 새로 열어 커밋한다. 호출하는 서비스에 `@Transactional` 을 붙이지 않는다(F11 — OASIS 파라미터 이름이 지워진다). 여러 사건을 한 트랜잭션으로 묶으려면 호출자가 `TransactionTemplate` 으로 감싼다.
- **잠금 순서(L1)**: 위층이 사건마다 ① 저장 시각 → ② `DataSegmentLock.lock(maruDataId)`(선분·마루 데이터 행을 읽기 전, 정확히 1회) → ③ 잠금 뒤 네이티브 재조회 → ④ 검사 → ⑤ row_version 비교 → ⑥ 경계 확정 → ⑦ 선분 연산 순서를 지킨다. 호출자가 미리 읽은 값으로 판정하지 않는다. 잠금은 같은 마루 데이터의 모든 사건(항목·카테고리·소속)을 직렬화한다.
- **row_version 인자**: 항목의 `modify`·`close`·`reopen` 은 `expectedRowVersion` 이 필수다. 화면이 본 **그 키 마지막 행**(valid_from 최대, 닫힌 키면 닫힌 행)의 `ROW_VERSION` 을 넘긴다. 다르면 충돌이다. 값 증가 규칙(D7): 등록 0 / 수정 새 행 = 옛 행 +1 / 닫기 = 닫는 행 +1 / 다시 열기 새 행 = 마지막 행 +1. 카테고리·소속에는 row_version 이 없다(인자 없음). upsert 는 잠금 뒤 읽은 값으로 스스로 비교한다(인자 없음).
- **저장 시각**: `Clock` 빈(KST)으로 정하고 초 단위로 자른다. 같은 키에 같은 초 사건이 오면 그 키의 최대 경계 +1초로 민다(D5). 순번(`CHG_SEQ`·`LAST_CHG_SEQ`)은 발급하지 않는다(모두 0, S12).
- **감사 칼럼**: `MdmNativeAuditSupport.currentStamp()`(OASIS 문맥 → 없으면 `UserContextHolder` 사용자)로 채운다.
- **upsert 규칙**: 한 호출 = 한 트랜잭션·한 저장 시각. 검사 1·2 는 던진다. 검사 3~6 은 **던지지 않고** `UpsertResult.issues` 에 행별로 모으며(`MdmCheckIssue.itemKey` = 키), 이슈가 하나라도 있거나 `dryRun=true` 면 아무 행도 쓰지 않고 `written=false`·`at=null` 로 행별 예정 동작만 돌려준다. 동작: 없는 키 INSERT, 값이 바뀐 열린 키 UPDATE, 같은 값 NONE. 닫힌 키는 CSV 면 `CHK6` 이슈(CSV 로 다시 열지 않음), API 면 받은 값으로 REOPEN(D12). 한 입력 안의 같은 키는 `CHK6`. API 경로는 `callerSystem` = 마루 데이터 `SOURCE_SYSTEM` 이어야 하고 행 내용 검사를 하지 않는다(NAME NOT NULL 위반은 DB 오류로 요청 전체 롤백).
- **카테고리 규칙**: BASE(`CategoryConventions.BASE_CATE_ID`)는 수정·닫기 거부. 원천 검사(2)는 돌지 않는다(정의는 원천과 무관하게 MDM 담당자 몫). 소속 등록은 항목 열림·카테고리 열림·`defKind = TABLE` 일 때만(검사 7). 닫힌 카테고리의 소속 행은 그대로 둔다.

### 오류와 메시지 접두어

BPMN 안에서 던진 예외는 화면에 `meta.message` 만 간다(F12). 판정은 문구로 한다. 모두 cactus `BusinessException`(`MdmErrors.of`)이다.

| 경우 | 코드 | `getMessage()` 형태 |
|---|---|---|
| row_version 충돌(스테일 expected, 닫는 UPDATE CAS 0행) | `ROW_VERSION_CONFLICT`(MDM001) | `다른 사용자가 수정했습니다. 다시 불러오세요` 로 **시작**(상세 없음) |
| BASE 수정·닫기 | `RESERVED_CATEGORY`(MDM012) | `예약 카테고리 BASE 는 편집·삭제할 수 없습니다` 로 시작 |
| 없는 마루 데이터(잠금 0행) | `INVALID_INPUT`(MDM021) | `입력값이 올바르지 않습니다: 없는 마루 데이터입니다: <id>` |
| 검사 1 | `INVALID_INPUT` | `입력값이 올바르지 않습니다: 폐기된 마루 데이터입니다: <id>` |
| 검사 2 | `INVALID_INPUT` | `입력값이 올바르지 않습니다: 원천이 맞지 않아 저장할 수 없습니다: …` |
| 검사 3~7·키 상태(모아서 거부) | `INVALID_INPUT` | `입력값이 올바르지 않습니다: <이슈 문구>; <이슈 문구>…` |

이슈 문구는 `DataItemMessages` 상수로 시작한다(판정은 `contains`): `CLOSED_KEY_REOPEN`("닫힌 키입니다. 새로 등록할 수 없으니 다시 여세요") · `KEY_EXISTS`("이미 있는 키입니다") · `NOT_OPEN`("열린 행이 없습니다(닫힌 항목)") · `ALREADY_OPEN`("이미 열려 있습니다") · `KEY_NOT_FOUND`("없는 키입니다") · `KEY_PATTERN`("키가 키 패턴에 맞지 않습니다") · `KEY_REQUIRED`("키를 입력하세요") · `NAME_REQUIRED` · `ATTR_NO_LABEL` · `LVL_GAP` · `LVL_FORMAT` · `LVL_CONFLICT` · `LVL_OVER_COUNT` · `DUPLICATE_IN_BATCH`("같은 키가 두 번 있습니다") · `MEMBER_NOT_ALLOWED`("소속을 등록할 수 없습니다") · `CATE_DEF_INVALID`("카테고리 정의가 올바르지 않습니다"). 이슈 코드(`MdmCheckIssue.code`)는 `CHK3`~`CHK7`·`CHK5-1`·`CHK5-2`·`KEY`·`CATE` 다. 화면 상수는 `m-mdm/pages/dmd/dataItemMng/messages.ts` 에 있고 `DmdScreenMessageParityTest` 가 서버 문구와 글자 일치를 확인한다 — 문구를 바꾸면 두 곳을 같이 바꾼다.

### 사용 예

```java
// TSK-07-02 — 마루 데이터 생성과 같은 트랜잭션에서 BASE 를 만들고, 카테고리 편집·TABLE 소속 적용
categoryCore.registerCate(md, "BASE", new DataCateValue("전체", DataCateValue.REGEX, ".*", "KEY", null));
categoryCore.registerCate(md, "KR", new DataCateValue("한국 항구", DataCateValue.REGEX, "^KR$", "ATTR01", null));
categoryCore.addMember(md, "MAJOR", "KRPUS");      // TABLE 카테고리 소속
categoryCore.removeMember(md, "MAJOR", "KRPUS");   // 소속 해제 = 닫기

// TSK-07-04 — CSV 검증(dryRun) 뒤 저장. issues 가 비어 있을 때만 written=true
UpsertResult check = itemCore.upsert(md, DataSavePath.CSV, null, rows, true);   // 검증 결과 표: check.issues(), check.rows()
UpsertResult saved = itemCore.upsert(md, DataSavePath.CSV, null, rows, false);  // 한 트랜잭션·한 저장 시각
```

화면에서 쓸 때는 OASIS 서비스 메서드에서 위와 같이 부르고 `@Transactional` 을 붙이지 않는다. 마루 데이터 생성과 BASE 등록을 한 트랜잭션으로 묶으려면 서비스 안에서 `TransactionTemplate.execute(…)` 로 감싼다(코어가 그 트랜잭션에 합류한다). 마루 데이터 행 INSERT 는 07-02 가 직접 한다(`TB_MDM_DATA` 는 선분이 아니어서 이 코어에 없다). 행을 먼저 넣고 나서 `registerCate` 를 불러야 잠금이 0행으로 거부되지 않는다.

### 주의

- **ArchUnit 고정**: `MdmTemporalSegmentStoreNoImplementationTest` 가 `MdmTemporalSegmentStore` 구현체 집합을 `common.segment` 의 `DataItemSegmentStore`·`DataCateSegmentStore`·`DataCateItemSegmentStore` 셋으로 **정확히** 고정한다. 다른 패키지에 구현체를 더하거나 넷째 구현체를 만들면 빨강이다. 카테고리 선분을 따로 구현하지 말고 이 코어를 쓴다.
- **계약 파일 무변경**: `contract/data/*` 는 고치지 않았다(계약 javadoc 의 "구현은 이 Task 밖" 문구도 그대로다).
- **메뉴**: `DataInitializer.seedMdmDataItemMenus()` 가 dmd 폴더 아래 `dataItemMng`(MENU_SEQ 004)·`dataHistory`(005)를 시드한다. **MENU_SEQ 001~003 은 TSK-07-02(dataMng·dataEdit·dataCateEdit) 몫으로 비워 두었다.** 07-02 는 새 메서드를 더하고 `seedMdmMenus()` 끝에 호출 한 줄만 더한다(기존 줄 무수정, 머지 충돌 시 양쪽 유지).
- **shared 체크박스 문제**: shared `page-layout.css` 의 `.page-layout .search-field input[type="checkbox"] { border: 0; background: none; … }` 규칙이 조회영역(`SearchField`) 안 Mantine `Checkbox` 의 네모를 지워 보이지 않게 한다. 이 Task 는 화면 CSS 로 덮지 않고 `Select`(숨김/보기)로 우회했다. 07-02·07-04 화면도 조회영역에 체크박스를 두면 같은 문제를 겪는다. shared 에서 고칠지는 팀장 결정 사항이다.
- **동시성 검증 공백**: 잠금에 의한 실제 직렬화(동시 저장 겹침 0)는 SQLite 로 확인되지 않았다. mssqlTest `DataSegmentConcurrencyMssqlTest` 는 작성만 했다(도커 금지, 컴파일 미확인).

---

## Verify 결과

### 게이트 실행 결과

| # | 명령 | 결과 |
|---|---|---|
| 1 | backend `testAll` | UP-TO-DATE(Gradle 스킵 — 실행 아님). 원 기준선(state.json) tests 2337, failures 0. Build 직후 값 2436(기준선 오기 정정, 재시도에서 바로잡음) |
| 2 | `pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test` | exit 0, tests 347, failures 0 |
| 3 | `check_oasis_contract.py --root .` | exit 0, ERROR 0, WARN 0 |
| 4 | `pnpm --filter @dk-oasis/m-mdm lint` | exit 0 (tsc --noEmit) |
| 5 | `pnpm test:unit:shared` | exit 0, tests 156, failures 0 |

**합계**: 기준선 대비 신규 실패 0, 테스트 총수 미감소 (게이트 2: +17 from dataHistory).

### E2E 전체 스위트 실행 (§3.5)

**서버 절차** 완료:
- MCM 백엔드 (포트 18731) ✓
- MDM 백엔드 (포트 18732) ✓
- 포털 (포트 15731) ✓
- MCM seed 대조 ✓
- MDM fixtures 삽입 ✓

**E2E 테스트 결과** (모두 WORKERS=1, 격리 DB):

| Spec | 통과 수 |
|---|---|
| mdm-sample-smoke.spec.ts | 1 ✓ |
| mdm-shell-rbac-smoke.spec.ts | 4 ✓ |
| mdm-unitMng.spec.ts | 4 ✓ |
| mdm-termMng.spec.ts | 4 ✓ |
| mdm-domainMng.spec.ts | 3 ✓ |
| mdm-columnMng.spec.ts | 4 ✓ |
| mdm-dataItemMng.spec.ts | 4 ✓ |
| mdm-dataHistory.spec.ts | 4 ✓ |

**전체**: 28 passed in 50.9s, 0 skipped, 0 failed

**스크린샷**: 6장 캡처 (TSK-07-03/screens/)
- dmd-dataItemMng-list.png
- dmd-dataItemMng-edit.png
- dmd-dataItemMng-error.png
- dmd-dataHistory-list.png
- dmd-dataHistory-timeline.png
- dmd-dataHistory-error.png

### 불변 규칙 검증

Build 단계에서 64개 변이를 대상으로 검증 완료 (모두 CAUGHT, 시험은 관련 클래스 단위로만 돌림). **1차 Verify 는 변이를 새로 넣지 않았다 — 재시도에서 확인**(아래 「Verify 변이 검증(전체 스위트, 재시도)」). 항목별 근거:

- **S (선분)**: S1~S14 14개 — 게이트 1·E2E에서 검증
- **C (검사)**: C0~C7 10개 — 게이트 1·E2E에서 검증
- **L (잠금)**: L1~L3 3개 — 게이트 1에서 검증
- **Q (목록·이력)**: Q1~Q6 6개 — 게이트 1·E2E에서 검증
- **H (이력·계약)**: H1~H3 3개 — 게이트 1·E2E에서 검증
- **A (OASIS)**: A1~A4 4개 — 게이트 1·3·E2E에서 검증
- **F (화면)**: F1 1개 — 게이트 2·E2E에서 검증

**도커 금지로 생략**: AC2(동시 저장 겹침 0) — MSSQL mssqlMigrationTest 미실행. 설계 당시 mssqlTest `DataSegmentConcurrencyMssqlTest` M1~M5로 증거 준비됨 (컴파일·실행 미확인).

### Verify 변이 검증(전체 스위트, 재시도)

방법: Build 규율과 같다 — 초록 커밋(`0f183ff`) 위에서 파일 하나를 고치고, **전체 스위트**로 빨강을 확인하고, `/usr/bin/git checkout -- <그 파일>` 로 되돌린다. 백엔드 판정은 mdm 전체 `cd src/backend/mdm && JAVA_HOME=... ../gradlew :lib:test :api:test --rerun --continue --no-daemon --console=plain`(`--rerun` 으로 UP-TO-DATE 스킵을 막는다. `.claude/skills/dflow-dev/scripts/heavy.sh` 로 감쌈). 결과 집계는 `src/backend/mdm/{lib,api}/build/test-results/test/*.xml` 을 직접 합산(콘솔 요약이 불안정해 XML 로 판정). 프런트는 `pnpm --filter @dk-oasis/m-mdm test`(heavy.sh). E2E 는 mdm 전체 스위트(§3.5).

백엔드 변이 8개, mdm 전체 기준선 tests=858 failures=0(`:lib:test :api:test`, 리포 전체 testAll 과 별개 집계):

| 항목 | 규칙 | 파일 | 변이 내용 | 결과 | 잡은 시험(첫 실패) |
|---|---|---|---|---|---|
| (a) | S1 | `DataItemSegmentStore.modifyOpen` | 수정의 새 행 `valid_from = at+1s`(같은 시각에서 어긋나게) | CAUGHT (858/8 failed) | `MasterDataExamplesScenarioTest.X2` 외 7건(`S1_S2_S3_...`, `S9_...` 등) |
| (b) | S5 | `DataItemSegmentStore.modifyOpen` | `open.value().sameAs(value)` 단락 제거 — 값이 같아도 항상 새 행 | CAUGHT (858/1 failed) | `DataItemSegmentCoreSqliteTest.S5_값이_같은_수정은_NONE_이고_아무것도_쓰지_않는다()` |
| (c) | S6 | `DataItemSegmentStore.close` | 닫기 뒤 `insertItem` 을 추가 호출 — 닫기에서도 새 행 생성 | CAUGHT (858/15 failed) | `DataSegmentLockSqliteTest.L1_모든_쓰기_사건은_첫_사건으로_잠금을_정확히_한_번_부른다()` 외 14건 |
| (d) | S4 | `DataItemSaveCore.requireRowVersion` | 비교 본문 제거 — row_version 충돌 판정 제거 | CAUGHT (858/2 failed) | `DataItemSegmentCoreSqliteTest.S3_S4_남이_닫은_뒤_옛_row_version_으로_다시_열면_충돌한다()`, `S4_오래된_row_version_은_수정_닫기_다시_열기_모두_충돌이고_아무것도_쓰지_않는다()` |
| (e) | S8 | `DataItemSaveCore.register` | 닫힌 키(own 비었지 않고 open 없음)면 `CLOSED_KEY_REOPEN` 이슈를 내지 않음 — 다시 열기 안내 없이 등록 허용 | CAUGHT (858/2 failed) | `DmdOasisHttpTest.A2_닫힌_키_reg_는_다시_열기_안내가_meta_message_에_온다()`, `DataItemSegmentCoreSqliteTest.S8_열린_키_등록은_KEY_EXISTS_닫힌_키_등록은_다시_열기_안내()` |
| (f) | C3 | `DataItemChecks.rowIssues` | `matcher(code).matches()` → `.find()` — code_pattern 전체 일치를 부분 일치로 | CAUGHT (858/1 failed) | `DataItemChecksSqliteTest.C3_MDM_원천_키는_code_pattern_전체_일치()` |
| (g) | C4 | `DataItemChecks.rowIssues` | name 필수 검사(`value.name() == null` 블록) 제거 | CAUGHT (858/2 failed) | `DataItemChecksSqliteTest.C4_화면_CSV_는_이름이_필수다()`, `C3_C6_은_모아서_한_번에_거부한다()` |
| (h) | H2 | `DataHistoryService.build` | 마지막 행 `rowState`: 닫힘이면 `"CLOSED"` 대신 `"PAST"`(소멸 판정 제거) | CAUGHT (858/1 failed) | `DataHistoryServiceSqliteTest.H2_마지막_사건이_닫기면_마지막_행은_CLOSED_상태는_소멸()` |

프런트 변이 2개, `pnpm --filter @dk-oasis/m-mdm test` 기준선 tests=347 failures=0:

| 항목 | 규칙 | 파일 | 변이 내용 | 결과 | 잡은 시험 |
|---|---|---|---|---|---|
| FE1 | RACE(불변 규칙 밖, Build 이탈 항목) | `dataItemMng/page.tsx runSearch` | `if (seq !== searchSeq.current) return;` 제거 — 늦게 도착한 옛 조회 응답 무시 가드 제거 | CAUGHT (347/1 failed) | `DataItemMngPage > 늦게 도착한 옛 조회 응답은 새 선택의 목록을 덮지 않는다` |
| FE2 | F1 | `dataItemMng/page.tsx handleWriteError` | `if (isRowVersionConflict(message)) { await reload(); }` 제거 — 충돌 뒤 재조회 제거 | CAUGHT (347/1 failed) | `DataItemMngPage > 충돌 문구를 받으면 안내를 보이고 목록을 다시 부른다(F1)` |

E2E 변이 1개, mdm e2e 전체 스위트(`e2e/mdm-*.spec.ts`, 8 spec, `--workers=1`, 새 DB):

| 항목 | 규칙 | 파일 | 변이 내용 | 결과 | 잡은 시험 |
|---|---|---|---|---|---|
| E2E1 | H2(이력 라벨) | `dataHistory/types.ts EVENT_LABELS` | `CREATED: "생성"` → `"등록됨"` | CAUGHT (2 failed, 3 미실행 — S3 실패로 같은 파일 후속 중단, 나머지 23 passed) | `mdm-dataHistory.spec.ts` S2(`"등록됨2026-08-20 09:00:00..."` 수신), `mdm-dataItemMng.spec.ts` S3 |

**핫 리로드로 반영되는지 확인**(D-후속): 포털(m-mcm)은 `@dk-oasis/m-mdm` 을 소스가 아니라 「E2E 서버 절차」 6) 의 `pnpm build:libs` 산출물(`m-mdm/dist`)로 물고 들어간다. m-mcm 자체는 `next dev`(핫 리로드)지만 m-mdm 소스 변경은 그 안에 잡히지 않으므로, 프런트 소스 변이는 **`pnpm build:libs` 를 다시 돌려야** 반영된다(핫 리로드가 아니다). 그래서 위 표의 순서는: ① 변이 적용 → ② `pnpm build:libs`(변이 문자열이 dist 청크에 들어갔는지 `grep` 로 직접 확인, 위 청크 이름 참고) → ③ 새 DB 로 서버 기동 → ④ 전체 스위트 빨강 확인 → ⑤ 서버 종료·변이 되돌리기 → ⑥ `pnpm build:libs` 재실행(원래 문자열로 되돌아옴을 청크 이름 교체로 확인) → ⑦ 새 DB 로 재기동 → ⑧ 전체 스위트 초록 확인.

되돌린 뒤 전체 스위트(새 DB, 포트 mcm 18731·mdm 18732·포털 15731, `pnpm build:libs` 로 재빌드 — 변이 문자열이 청크 해시를 바꿔 `chunk-DWA2MMPF.js`(정상 "생성")로 갈아끼워짐, 구 청크 `chunk-QMYDIVFU.js` 는 어느 page.js 도 참조하지 않는 고아 산출물)로 재확인: 27 passed, `mdm-domainMng.spec.ts` E2~E6 1건만 실패(1 did not run) — TSK-04-02 Verify 가 이미 보고한 이 Task 와 무관한 선행 간헐 실패(§3.5)와 같은 spec·같은 증상이고, `mdm-dataHistory`·`mdm-dataItemMng` 8/8 전부 통과했다.

**되지 않은 것**: S11(동시성)·L1·L2 의 실제 직렬화 효과는 Build 와 같은 이유로 SQLite 로 못 잡는다(도커 금지, M1~M5 미실행) — 새로 시도하지 않았다. 안 깨진 변이는 없었다(8+2+1 = 11개 전부 CAUGHT, 시험 보강 불필요).

### 수용 기준 판정

| AC# | 수용 기준 | 검증 방법 | 판정 |
|---|---|---|---|
| AC1 | 05 「예」 E1~E6·X1~X4 선분 결과 재현 | 게이트 1: `MasterDataExamplesScenarioTest` | **충족** |
| AC2 | 동시 저장에서 선분 겹침 0 | 미실행 (도커 금지: mssqlMigrationTest) | **확인하지 못함** |
| AC3 | 닫힌 키 신규 등록 시 다시 열기 안내 | 게이트 1·E2E S3 | **충족** |
| AC4 | 다른 사용자 수정 충돌 시 재조회 | 게이트 1·2·E2E S4 | **충족** |
| AC5 | 메뉴 열림 + E2E dataItemMng 통과 | E2E S1~S4 (4/4 passed) | **충족** |
| AC6 | 이력 조회 생성·변경·소멸 충족 | 게이트 1·E2E (dataHistory S3) | **충족** |
| AC7 | 메뉴 열림 + E2E dataHistory 통과 | E2E S1·S2·S4 + 대체 S3 (4/4 passed) | **충족** |

### 발견 사항

1. **E2E 실행 안전성**: 같은 mdm.db 로 전체 스위트 재실행 가능 (2회 시작 필요 — columnMng 픽스처 때문에 새 DB 매회).
2. **게이트 2 NFR-1 불안정**: 환경 부하(load average 20+)에서 evalex-perf 간헐 실패. 이 Task 무관(TSK-03-04 성능 시험).
3. **스크린샷 신규 생성**: 모든 스크린샷은 마지막 E2E 실행에서 캡처됨.
4. **(재시도) mdm-domainMng.spec.ts 간헐 실패 재현**: Verify 재시도의 변이 되돌린 뒤 전체 스위트 확인 실행(초록 확인용)에서 `E2~E6` 1건이 `.domain-mng__preview-std` 텍스트 타임아웃으로 실패했다(TSK-04-02 Verify 가 보고한 것과 같은 spec·같은 종류의 타이밍 증상). 이 Task(dataItemMng·dataHistory) 스펙은 이 초록 확인용 실행에서 8/8 전부 통과해 이 실패와 무관함을 확인했다. (빨강 확인용 실행은 변이가 의도한 대로 dataHistory S2·dataItemMng S3 만 실패했다 — 위 「Verify 변이 검증」 E2E1 행.)
5. **`:lib:test :api:test --rerun` 의 mdm 전용 기준선**: 리포 전체 `testAll`(기준선 2337, Build 뒤 2436)과 별개로, mdm 모듈만의 기준선은 tests=858, failures=0(`--rerun --continue` 로 UP-TO-DATE 스킵 없이 강제 재실행, XML 직접 합산). 변이 판정은 이 858 을 기준으로 했다.

---

## Refactor 결과

대상은 이 Task 가 만든·고친 파일뿐이다(`/usr/bin/git diff --stat 3fbf073..HEAD -- src`). 동작 변경은 없다 — 공용 코어(`DataItemSaveCore`·`DataCategorySegmentCore`·`DataSegmentLock`·`DataItemSegmentStore`·`DataCateSegmentStore`·`DataCateItemSegmentStore`)의 public 시그니처와 오류 문구 접두어(§「공용 코어 명세」)는 그대로다.

### 바꾼 것

1. **`SegmentRow.firstOpen(List<T>)` 정적 헬퍼 추가**(`common/segment/SegmentRow.java`) — `DataItemSaveCore`와 `DataCategorySegmentCore` 양쪽에 있던 "목록에서 열린 행 하나를 찾는다" 한 줄짜리 private `open(...)` 메서드가 완전히 같은 스트림 로직을 반복하고 있었다. 공통 인터페이스 `SegmentRow`에 제네릭 정적 메서드로 올리고 두 Core 의 `open(...)`을 지운 뒤 호출부를 `SegmentRow.firstOpen(own)`으로 바꿨다. 두 Core 의 private/public 메서드 시그니처는 바뀌지 않았다.
2. **`DataItemRows.blankToNull(String)` 공용화**(`dmd/dataItemMng/service/DataItemRows.java`) — `DataItemMngService`와 `DataHistoryService`가 각각 똑같은 `blankToNull` private 메서드를 갖고 있었다(리포 전체에 같은 이름의 지역 헬퍼가 여럿 있지만, 이 Task 가 만든 두 서비스끼리의 중복만 정리했다 — 다른 화면의 `blankToNull`은 이 Task 범위 밖). `DataHistoryService`가 이미 `DataItemRows`를 의존하고 있어(`text` 정적 임포트 선례) 자연스러운 위치였다. 두 서비스의 `blankToNull`을 지우고 정적 임포트로 바꿨다.
3. **프런트 `errorMessage(e)`·`toMaruOptions(options)` 공용화**(`pages/dmd/dataItemMng/types.ts`) — `e instanceof Error ? e.message : String(e)`가 `dataItemMng/page.tsx`에 4곳, `dataHistory/page.tsx`에 3곳 그대로 반복되고 있었고, 마루 데이터 옵션 변환 `useMemo` 도 두 파일에서 완전히 같았다. `dataHistory`가 이미 `dataItemMng/types`를 의존하므로(같은 선례) 두 순수 함수를 그곳에 추가하고 두 페이지 모두 이를 쓰게 바꿨다.

### 바꾸지 않은 것

- **`DataItemSaveCore`의 등록/수정/닫기/다시열기 넷과 `DataCategorySegmentCore`의 등록/수정/닫기/다시열기 넷 사이의 "저장 시각 → 잠금 → 재조회 → 검사 → 경계 확정 → 저장" 흐름 반복**: 조사에서 발견했지만 추출하지 않았다. 두 Core 는 대상 타입(`ItemSegmentRow`/`CateSegmentRow`)과 아래층 저장소(`DataItemSegmentStore`/`DataCateSegmentStore`)가 다르고, 각 메서드가 검사 순서·예외 종류에서 미묘하게 갈린다(예: 카테고리는 검사 2를 건너뛰고 BASE 가드가 있다, D4·S14). 공통 템플릿으로 묶으려면 제네릭 상위 클래스나 콜백 인터페이스가 필요해 손대는 범위가 커지고, 잠금 순서(L1)를 지키는 미묘한 차이를 옮기다 깨뜨릴 위험이 이득보다 크다고 판단했다.
- **`DataSegmentRowStore`의 item/cate/cateItem 세 테이블 INSERT·CLOSE 네이티브 SQL 조립 반복**: 세 테이블의 컬럼 목록·CAS 조건(ROW_VERSION 유무)이 다르고, 이 Task 는 도커 금지로 MSSQL 방언 경로를 검증할 수 없다(design.md 「도커 금지로 생략한 검증」). SQL 문자열 조립을 공통 빌더로 묶으면 검증 안 된 채로 세 테이블 모두의 쓰기 경로를 건드리게 되어 손대지 않았다.
- **`DataHistoryService.fill`의 `ItemSegmentRow → DataItemRow → DataHistoryRow` 이중 변환**: 코드 중복(같은 줄이 두 번 있음)이 아니라 두 단계 변환을 거치는 설계라서, 직접 변환으로 줄이려면 19개 필드 대입을 다른 자리에 새로 쓰게 돼 리팩터가 아니라 재작성에 가깝다. 정리 가치가 뚜렷하지 않아 손대지 않았다.
- 그 밖에 조사에서 확인한 것: 쓰지 않는 import·죽은 코드 0건, `columns.ts`·`dataHistory/types.ts` 사이의 중복 타입·상수 0건(이미 `dataItemMng/types`를 공유해 정리돼 있었다).

### 게이트 결과 (기준선: testAll 2436/0, m-mdm 347/0, shared 156/0 — 모두 Verify 뒤 값과 같음)

| # | 명령 | 결과 |
|---|---|---|
| 1 | backend `testAll` | exit 0, tests 2436, failures 0, errors 0 (XML 합산, `testAll` UP-TO-DATE·`:mdm:lib:test` 재실행) |
| 2 | `pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test` | 1회차 exit 1(이 작업과 무관한 `tests/evalex-perf.test.ts` NFR-1 2건, load average 약 14) — 재실행 exit 0, tests 347/0 |
| 3 | `check_oasis_contract.py --root .` | exit 0 (BPMN 26 / bean 26 해석, ERROR 0 WARN 0) |
| 4 | `pnpm --filter @dk-oasis/m-mdm lint` | exit 0 |
| 5 | `pnpm test:unit:shared` | exit 0, tests 156/0 |

기준선 대비 회귀 없음. 변경 파일 9개(백엔드 6·프런트 3), 삽입 44줄·삭제 38줄(`git diff --stat`).
