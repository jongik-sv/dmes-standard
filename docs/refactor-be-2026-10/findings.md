# BE 리팩토링 2026-10 (2회차) — 항목별 근거

[README.md](./README.md) 의 항목 ID 순서로 적는다. 경로의 `mdm/lib/…/mdm/` 는 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/` 를 줄인 것이다. 줄 번호는 2026-10-16 `dev`(f911dd50f) 기준이다. 「확인」 표시가 없는 근거는 감사 보고를 옮긴 것이므로, 착수할 때 다시 확인한다.

## 감사에서 문제 아님으로 판정한 것

다시 조사하지 않도록 남긴다.

- mdm `RuleSetAnalyzer`·`RuleSetRunner`·`RuleSetFlowJson` 은 엔진 `RuleAnalyzer`·`FlowRun`·`FlowParser` 의 사본이 아니다. 역할이 다르고(설계 시점 세트 분석, Spring 어댑터, JSON 코덱) 엔진에 위임한다.
- maru-mdm-engine 은 순수하다(Spring·Jackson·`com.dongkuk` import 없음).
- 프레임워크 모듈(cactus-core·oasis·analog·caravan-*)의 Java 는 업무 모듈을 import 하지 않는다. 모듈 간 순환 없음.
- cactus `SecUser`(`TB_SEC_USER`)와 mcm-core `SecUser`(`TB_MCM_SEC_USER`)는 다른 테이블이다(확인). 프레임워크 감사의 「같은 테이블 이중 매핑」 지적은 틀렸다.
- mcm-core 의 화면 서비스 + mcm/api 의 BPMN 배치는 ADR-0003 D4·D5 결정이다.
- mdm lib/api 나눔은 원칙대로다(api = 배포 단위·BPMN·Flyway, lib = Java).
- dmc(코드)와 dmd(데이터)는 저장 모델이 달라(버전 vs 시간 구간) 사본이 아니다.
- DB diff 구현은 하나(`ErdDbDiff`)뿐이고 DDL 생성은 아직 없다.
- `dmb/layout`(5.4k줄)은 작은 단일 목적 클래스 묶음이다. 큰 쪽은 `LayoutMngService` 다.
- `ColumnMngService`(801줄)는 길지만 주제가 하나이고 시험이 받친다.
- OASIS 서비스에 `@Transactional` 이 없는 것은 의도다(CGLIB 가 파라미터 이름을 잃는다).
- caravan-console 이 caravan-core 엔티티를 따로 매핑하는 것은 의도된 격리다(스키마 대조 시험 추가만 고려).
- `UserException`(oasis)과 `BusinessException`(cactus)은 층이 다르다.

## 1단계 — 결함

### F1. ERD 가 도메인 상속을 무시 (확인)
- `mdm/lib/…/mdm/dma/erdEdit/standard/ErdDictionaryLoader.java:38-40` 가 `MdmDomain` 의 `getDataType()`·`getLength()`·`getScale()` 원값으로 `ErdDomainSpec` 을 만든다.
- 자식 도메인은 길이·소수를 NULL 로 두고 부모에서 물려받는다. 정본은 `common/dictionary/DomainChainAssembler.java:44-63`(루트부터 덮어쓰기, 타입은 `root.dataType()`).
- 영향: 자식 STRING 도메인이 CLOB 으로 매핑(`ErdTypeMapping.physicalOf:44`), `ErdStandardJudge:38` 가 틀린 DOMAIN 위반을 낸다.
- 수정: `DomainTreeSnapshot` + `DomainChainAssembler`(또는 `MdmEffectiveDomainResolver`)로 스펙을 만든다. 상속 도메인이 든 시험 데이터부터 추가한다.
- 시험: `ErdTypeMappingTest`, `ErdStandardJudgeTest`.

### F2. mcm-core `BusinessException` 사본 (코드 확인, 실행 미확인)
- `mcm-core/…/mcm/common/exception/{BusinessException,ErrorCode,ErrorDetail}.java` 는 cactus 클래스의 사본이고 `ResponseCodeAware` 를 구현하지 않는다. mcm-core main 47개 파일이 이 사본을 import 한다.
- `cactus-core/…/cactus/oasis/CactusResponseConverter.java:133,165,190` 는 cactus `BusinessException` 과 `ResponseCodeAware` 만 알아본다.
- mcm-core 의 `ErrorDetail.ofGrid` 사용 26곳의 행 오류가 OASIS 응답 errors[] 에서 빠지고 코드가 일반 코드로 나갈 가능성이 크다. `mcm/lib/…/McmAuthController.java:175` 는 직접 잡아서 처리한다(OASIS 경로 아님).
- 수정: 먼저 OASIS HTTP 시험으로 실제 응답을 고정한다. 그다음 mcm-core 쪽 예외가 cactus 가 읽을 수 있는 계약을 따르게 한다. core 는 cactus 에 compileOnly 이므로 공용 인터페이스 위치를 정해야 한다.

### F3. 용어 저장 경로 두 개 (미확인)
- `dma/termRegPop/service/TermRegPopService.java:84-140` vs `dma/termMng/service/TermMngService.java:150-248`.
- 중복 약어: 팝업은 거부(`TERM_DUPLICATED`), 관리 화면은 경고(`ENG_ABBR_DUP`). 이름·약어 형식 검사는 팝업에만 있다.
- 팝업은 임베딩 인코딩과 `cache.refresh` 를 하지 않아 기동 전까지 추천에 안 나온다(`TermMngService:493`).
- 권한: 팝업은 `guard.requireStdAdmin()`, 관리 화면 서비스에는 없음(`termMng.bpmn` 은 미확인).
- 수정: C9(`TermWriter`)로 합치면서 어느 규칙을 정본으로 할지 정한다.

### F4. 엔진 값 변환기 두 벌 (확인)
- `maru-mdm-engine/…/engine/rule/ValueConverter.java` 는 `new BigDecimal(s)` 로 지수 표기(`1e3`)를 받는다. `…/engine/expr/ValueConverter.java:20,56` 는 `NUMBER_TEXT` 정규식으로 거부한다.
- `expr` 쪽 Javadoc 은 도메인 검증과 룰 판정이 같은 함수를 쓴다고 하지만, `RuleEvaluator:141,410`·`BranchCondition:46` 는 `rule` 쪽을 쓴다.
- `mdm/…/dme/ruleCalc/service/RuleCalcService.java:767-900` 에 세 번째 변환이 있다(크기 가드 포함).
- 같은 영역: `rule/RecordKeys` 는 `CATCH_*` 를 검사하고 `expr/RecordKeys` 는 안 한다. `ExpressionFailure` 가 두 패키지에 같은 이름으로 있다.
- 결정 필요: 지수 표기 허용 여부. TS 사본 동작도 확인한다.

### F5. analog `ClientKeyFilter` (미확인)
- `analog/api/…/security/ClientKeyFilter.java:98` 는 `equals` 로 비교한다. `cactus-core/…/security/filter/ClientKeyFilter.java:168-176` 는 `MessageDigest.isEqual` 로 고쳤다.
- 수정: 상수 시간 비교 + 시험(S). 공유 jar 로 합치는 것은 하지 않는다.

### F6. DML 가드 마스킹 (미확인)
- `mcm-core/…/job/builtin/QueryStatementGuard.java:73-111` 의 주석·문자열 마스커에는 `widget/query/SqlGuard.java:419-540` 에 있는 중첩 주석·단독 CR·특수 따옴표(`E'`·`$$`·backtick) 처리가 없다. DML·프로시저 호출을 막는 쪽이라 더 위험하다.
- 수정: S3 의 공용 마스커를 쓰고 정책(SELECT 전용 / DML·프로시저)만 둘로 둔다.

### F7. `SecUserService` 죽은 경로 (확인)
- `mcm/api/…/services/security/secUser.bpmn` 에 search·save 흐름이 있고 `secUserService` 를 부른다.
- `mcm/lib/…/domain/security/service/McmSecUserRepository.java:250,252` — `findAll()` 은 빈 목록, `save()` 는 `UnsupportedOperationException`.
- 실제 사용자 관리는 `CommUserMngSaveService`·`CommUserMngPasswordService`. FE 는 `my*` 액션만 부른다(`m-mcm/proxy.ts:63-65`, 미확인).
- 1회차 결정: 「미룸」(a6-1).

## 2단계 — 공통화·정리

### C1. `parseApplyFrom` 위치
- `dme/ruleConfirm/service/RuleConfirmService.java:452`(public static)과 `dmc/codeConfirm/service/CodeConfirmService.java:361` 이 같은 사본.
- 호출: `dmb/layoutConfirm/LayoutConfirmService:193,240`, `dma/erdEdit/service/ErdEditService:632`, `dme/ruleSetConfirm` `:143,:201`.
- `issueMap` 은 Rule·RuleSet·Layout confirm 에 같은 사본, `confirm()` 본문도 Rule·RuleSet 이 거의 같다(`RuleConfirmService:231-257`, `RuleSetConfirmService:192-215`).
- 1회차 b9-4 의 「S1 남은 private 사본 5곳」 과 겹친다.

### C2. 「미적용 버전」 판정
- `common/version/VersionPreconditions.java:96`(package-private), `common/mastercode/MasterCodeVersionSummary.java:85`, `common/rule/RuleVersions.java:18-25`, `dmc/codeCateEdit/…/CodeCateEditService.java:77,303`, `dmc/codeItemEdit/…/CodeItemEditService.java:508`, `LayoutVersionService` 의 `IN_APPROVAL`.
- 뜻이 둘이다: DRAFT+미래 RELEASED / 그것+REQUESTED·APPROVED. 지금은 REQUESTED·APPROVED 가 안 생기므로 실제 차이 없음.

### C3. 「새 버전 만들기」 사본
- `dma/erdEdit/service/ErdVersionService.java:117-137`, `dme/ruleMng/service/RuleVersionService.java:95-128`, `dme/ruleSetEdit/service/RuleSetVersionService.java:95-127`, `dmb/layout/LayoutVersionService.java:78-104`.
- 번호: ERD 는 최신 RELEASED 의 `getVer()` 기준, 나머지는 전체 `maxVer`. ERD 는 `RuleVersions.needsInUsePromotion` 대신 자체 검사. `LayoutVersionService` 에 `markParentInUse` 호출이 안 보임(미확인).
- 코드 화면은 버전 서비스가 없고 `dmc/codeEdit/service/CodeEditService.java:233-470` 이 직접 처리한다. `nextNumber`(:472) 가 `VersionRules.nextNumber` 와 다른 오류 코드를 쓰고 `common/mastercode/MasterCodeVersionNumbers` 는 `VersionNumbers` 를 감싸기만 한다.

### C4. `common/version` → `dmb.layout`
- `common/version/DefaultVersionStateService.java:28,58,224` 가 LAYOUT meta-rev 기록용으로 `dmb.layout.LayoutQueries` 를 import 한다.
- 수정: `VersionSpiRegistry` 에 대상별 「released 변경」 SPI 를 두고 dmb/layout 이 구현한다.

### C5. 패키지 재배치
- `dma/naming` 을 common·dmc·dmd·dme 가 쓴다(`common/rule/RuleIdRules.java:5` 등).
- `dmb/layout/LayoutConstJudge.java:4` → `dma/domainMng/service/DomainTestCaseRunner`.
- `common/rule` 의 `RunTraceJson`·`RuleSetGuide`·`RuleSetTestCaseWrites`(ruleSetEdit), `RuleTestCaseWrites`·`RuleHitPolicies`(ruleEdit), `confirm/RuleConfirmQueries`(ruleConfirm) 는 화면 하나만 쓴다.
- `dme/ruleSetEdit/service/RuleSetEditService.java:46,632` → `dme/ruleEdit/service/RuleEditService.parseExpr`, `ruleSetEdit/dto/RuleSetCondIoResult:4` → `ruleEdit.dto.RuleExprParseResult`.
- `dmb/layout/LayoutDraftBuilder.java:6,82,219`, `LayoutVersionService.java:16-17` 가 `layoutMng.dto` 를 내부 모델로 쓴다. `HeaderMngService.java:38-39` 도 같다.
- `dmd/dataHistory` → `dmd/dataItemMng/service/DataItemListQuery`.

### C6. dmc 헬퍼 사본 (일부 확인)
- `CodeCateEditService.java:277-421` 과 `CodeItemEditService.java:478-611` 에 `header`·`requireVersionExists`·`version`·`defaultVersion`·`versionMap`·`issueMap`·`ref`·`parseVer`·`str`·`display`·`text`·`isBlank` 가 같다. 조정 세션이 `requireVersionExists`·`defaultVersion`·`versionMap`·`parseVer` 를 확인했다.
- 본보기: `common/rule/RuleScreenSupport`.

### C7. 헤더 규칙·헤더 SQL
- `dmc/codeMng/service/CodeMngService.java:127-188` vs `dmd/dataMng/service/DataMngService.java:108-165`, `CodeEditService.java:153-207,627,637` vs `DataEditService.java:88-148,241,259` — `requireValidId`·이름/설명 검사·attr01..10 라벨·`requireAuditVer`.
- dmd 는 `lvlCnt` 0..5 를 하드코딩, dmc 는 `MasterCodeConventions`. `DataMngService.register` 에 정규식 컴파일 검사가 빠져 있다(`DataEditService.save` 에는 있음).
- `TB_MDM_DATA` 헤더 SQL: `dmd/dataItemMng/service/DataItemListQuery.java:69-101`, `dmd/dataCateEdit/service/DataCateEditService.java:302-318`, `job/ExchangeRateSyncService` `LABELS_SQL`, `common/segment/DataSegmentLock`.

### C8. ERD 정리
- `dma/erdEdit/stream/ErdEventHub.java`(930줄): SSE·스레드 풀 3개(`:170-180`, `:796-925`), 접속자(`:471-565`), 선점 저장 MERGE/DELETE(`:595-666`, `claims()` `:713`), 버전 읽기(`:440-460`), `deletedRevs`(`:157`).
- 순환: `ErdEventHub.java:158,170,303,851` ↔ `service/ErdCommandService.java:377-389`(`ObjectProvider` 로 우회). 허브는 `changesSince` 만 쓴다 → `ErdChangeFeed` 로 분리.
- `service/ErdEditService.java:120-305,520` 인라인 SQL → `ErdModelStore`·`ErdDiagramStore`. 클래스에 `@Transactional` 금지(Javadoc `:61-72`).
- 다이어그램 JSON 매퍼 두 벌: `ErdEditService.java:211-290` vs `ErdDiagramStore.java:330-363`(undo 가 이 모양을 비교한다).
- 편집자 쿼리 사본: `ErdEventHub.java:442-457`, `ErdEditService.java:214`, `ErdModelStore.java:84-135`.
- 요청 출처·길이 검사 3곳: `ErdEditService.java:76,670-720`, `ErdCommandService.java:68,151-160`, `ErdEventHub.java:497`.
- 이름 미리보기 두 벌(선택): `dma/columnMng/service/ColumnMngService.java:292-338` vs `ErdEditService.java:310-327`.

### C9. `TermWriter`
- F3 참조. 검사 → 저장 → 임베딩 → 커밋 뒤 캐시 갱신을 한 클래스로. 시험: `TermRegPopServiceSqliteTest`, `TermMngServiceTest`, `TermMngCacheAfterCommitTest`.

### D1. 미사용 mdm Repository (확인)
- `MdmErdClaimRepository`·`MdmErdCmdLogRepository`·`MdmErdDiagramRepository`·`MdmErdDiagramNodeRepository`·`MdmErdDiagramRouteRepository` — main·test 참조 0건(grep 확인).
- 시험에서만 쓰는 것: `MdmDataItem`·`MdmDataCate`·`MdmDataCateItem`·`MdmRuleTestCase` Repository → 시험 도우미로 옮길지 검토.

### D2. mcm-core 미사용 엔티티 (미확인)
- `entity/Mom*.java` 7개, `repository/{Mom*,InterfaceFormat*,TcErrorRowView}`, `audit/{entity/KeyStore,repository/KeyStoreRepository}` — main 소비자 없음, `oracheck/MomTcErrorSearchOraTest` 만 사용.
- X1(cactus 의 `TB_MCM_MOM_*` SQL)과 관련 있으므로 X1 설계 전에 옮기지 않는다.

### D3. `McmSecurityDefaults` (미확인)
- `mcm-core/…/config/McmSecurityDefaults.java:29-58` 의 `secRole`·`secPerm`·`secObj`·`secMenu`·`secRolePerm`·`secUserRole`·`secRoleGroup`·`secCode` matcher 에 해당 BPMN 이 없다.

### D4. `RuleSetRunner` OASIS 진입 (미확인)
- `common/rule/RuleSetRunner.java:235-450`(`execute`·`warnings`·`collectRuleIds`·`userText`·요청/결과 DTO). 참조 BPMN 은 `mdm/api/src/test/resources/services/probe/ruleSetRunProbe.bpmn` 하나. 운영 코드는 `session()`·`trace` 만 쓴다.

### D5. jsoup
- `mls|mpp|mqc|mpn/lib/build.gradle` 의 jsoup. 사용처는 `mcm/lib/…/NoticeHtmlSanitizer.java` 뿐(공지가 2026-10-07 mls → mcm 이동).

### D6. `Sample*` 슬라이스
- mls·mpp·mqc·mpn·aps-core 와 mcm-core·mcm/lib 의 `sample/**`. 각 스텁의 `V1__baseline.sql` 이 샘플 테이블을 만든다. RULE.md 는 이 저장소를 표준 템플릿으로 정의하고 sample 을 예시로 둔다.

## 3단계 — 구조

### S1. 모듈 간 소스 읽기 (빌드 입력 확인)
- `mdm/api/build.gradle:59-65` 가 FE `messages.ts` 3개와 `../mcm/api/…/MdmMenuSeeder.java`·`CoreRbacSeeder.java` 를 시험 입력으로 둔다. `mcm-core/build.gradle:36-41` 은 `CoreRbacSeeder.java` 와 mcm/api BPMN 2개.
- `mdm/api/src/test/…/MdmOasisActionVocabularyTest.java:131-253,341-347` 가 시더 Java 원문을 정규식으로 읽는다.
- `mcm-core/src/test/…/ScreenUsageOasisContractTest.java:35-64` 가 상위 모듈 mcm/api 파일을 경로로 읽는다 → mcm/api 로 옮기면 빌드 입력도 지운다.
- `api/…/dmd/DmdScreenMessageParityTest.java:39-43` 는 FE 가 한국어 문구 접두로 판정하기 때문에 있다 → 고정 이슈 코드로 바꾸면 없앨 수 있다(FE 변경 동반이라 UI 회차와 묶을 수 있음).
- mdm lib 시험이 `api/src/main/resources/application.yml` 을 읽는다(역방향).
- 1회차 1b S7·S8·S21 이 이 입력을 선언했다(빌드 캐시 정확성용).

### S2. 환율
- `mcm-core/…/widget/ext/FxMasterReader.java:30-60` 가 mdm `TB_MDM_DATA_ITEM`·`TB_MDM_DATA` 를 원시 SQL 로 읽고 `ATTR01-10` 해석을 안다.
- `widget/ext/{Frankfurter,KoreaExim}Provider`·`ExchangeRateProvider` 는 `mdm/lib/…/job/ExchangeRateSyncService` 만 쓴다. `mdm/…/job/MdmJobConfig.java` 가 직접 `new` 한다.
- `ExchangeRateSyncService.java:78-140` 원시 SQL 5개가 `DataSegmentRowStore` 를 우회하고 `TIMESTAMP '9999-12-31'` 리터럴을 쓴다.

### S3. 읽기 전용 SQL 커널
- `mcm-core/…/job/builtin/collect/JobCollectSql.java:52-184` vs `widget/query/WidgetQueryExecutor.java:391-470,602-622` — 시스템 변수 switch, `extract()`, `NamedParameterJdbcTemplate` 하위 클래스. 값 변환이 갈라졌다(`Timestamp.toString()` vs ISO+CLOB).
- 마스커 두 벌은 F6.

### S4. 큰 클래스
- `dme/ruleSetEdit/service/RuleSetEditService.java`(1063): 조회 184-290, view 293-410, 저장 검사 422-495·913-1033, 삭제·폐기·복구 496-620, cond IO 625, 시뮬레이션 681-850 → `RuleSetSimulateService`·`RuleSetSaveChecks`·`RuleSetLookupService`.
- `dme/ruleCalc/service/RuleCalcService.java`(1069): 모양 380-540, `CondWalk` 546-672, 변환 760-935, trace 949-1035 → X3·F4 뒤에 `RuleCalcShapes`·`RuleCalcInputs`·`RuleCalcTraceView`.
- `dme/ruleEdit/service/RuleColumnsService.java:185-187,499-503`: 서비스 안 JPQL·bulk DELETE → `RuleQueries`·`RuleNativeWrites`.
- `dmb/layoutMng/service/LayoutMngService.java`(718)·`HeaderMngService.java:405-429` → `LayoutViewAssembler`·`LayoutSearch`. legacy view 삭제는 LEGACY 스냅숏 행 존재 확인 뒤.
- `dmc/codeEdit/service/CodeEditService.java`(648) → C3.
- `mcm-core/…/widget/service/SecWidgetService.java`(726): 탭 CRUD, 공유 301-373·543-610, 읽을 때 이전하는 shim 396-540(별도 tx·Semaphore) → shim 을 일회성 단계로, 공유를 `SecWidgetShareService` 로.
- `mcm/lib/…/notice/noticeMgmt/service/NoticeMgmtService.java`(787) → `NoticeRowValidator`·`NoticeRowMapper`(`NoticeBoardService.toRows:154` 와 공유)·`NoticeStatusPolicy`.
- `mcm-core/…/widget/query/QueryParams.java`(663) → `QueryParamDefs`(112-295)·`QueryParamBinder`(362-660).
- `WidgetQueryExecutor`(622) → S3 뒤 정의 조회·캐시만 남김.

### S5. mcm-core 규칙
- `sample/controller/SampleMasterCodeController.java:18-20`, `widget/media/WidgetMediaController.java:36-61` — ADR-0003 D4 「mcm-core 는 컨트롤러를 갖지 않는다」 위반.
- `repository/SecMenuNativeRepository.java`(Javadoc 은 읽기 전용이라는데 쓰기 메서드 있음, `:376-458`), `MasterRuleColListRepository`(cmb 전용), `SecUserHisRepository`(commUserMng 전용) → 화면 패키지로.
- `job/server/JobServerConfig.java:11-12,84-97` 가 `audit.RevokedTokenPurger`·`screenusage.ScreenUsageRollup` 을 import → 각 기능이 `ScheduledJob` 빈을 내놓게.
- notice 만 mcm/lib 에 있음 → mcm-core·mcm/lib 구분 규칙을 문서로 정한다.

### S6. 트랜잭션 규약
- dmd 5개 서비스(DataMng·DataEdit·DataCateEdit·DataHistory·DataItemMng)는 `TransactionTemplate` 으로 직접 경계를 연다. dmc·dmb 는 OASIS 프로세스 트랜잭션에 맡긴다(`LayoutStaticGuardTest` 가 자체 tx 를 금지).

### S7. 빌드
- `mdm/build.gradle:1-45` 가 `build-logic/…/dmes.business-module.gradle:30-54` 와 같은 내용을 직접 쓴다.
- 단일 모듈 9개(aps-core·mcm-core·cactus-core·caravan-*·maru-mdm-engine·localKafka·analog)가 Java 버전·인코딩·저장소·JUnit 설정을 반복한다.
- `libs.versions.toml:19,24-25,41,45-46`: `cactus-core-v1020`(1.0.20) vs `versions.cactus-core`(1.0.22), `maru-mdm-engine-versioned`·`-unversioned`, `caffeine-managed`·`-v320`.
- mls·mpp·mqc·mpn: `JobAgentWiringTest`·`*TestDb`·`*ColumnOrderOraTest`·`application.yml` 이 이름·포트만 다른 사본.
- 루트 `build.gradle:12-13` `includedProjectNames` 가 settings 목록을 손으로 반복.
- mdm/lib: `onnxruntime`·`djl` 이 `api`(→ `implementation`), 주석이 지운 `poc/mdm-embedding-bench` 를 가리킴.

### S8. 응답 봉투
- `cactus-core/…/common/ApiResponse.java` vs `web/response/CactusResponse.java`. `ApiResponse` 사용: `QueryController`·`LovController`(cactus-core), `McmAuthController`·`SecPermKeysController`·`MasterCodeController`(mcm/lib). `GlobalExceptionHandler` 는 `CactusResponse` 로 응답한다.

### S9. analog
- `analog/core` 에 패키지 루트 `com.dongkuk.analog.*` 와 `com.dongkuk.analogexpress.*` 가 함께 있다. api 는 `com.dongkuk.dmes.analog.*`.
- `analog/api/…/db/DbViewer*`(약 1.8k줄)가 로그 검색 앱 안에 있고, 거부 목록이 mcm 테이블 이름으로 하드코딩돼 있다(`DbViewerProperties.java:25-26`).

## 4단계 — 설계 먼저

### X1. cactus-core 의 mcm 테이블 SQL
- `cactus-core/…/cactus/job/JobRunResultWriter.java:56,71`(`TB_MCM_JOB_RUN`·`TB_MCM_JOB_COLLECT_DATA`), `dmom/format/DmomFormatRepository`, `dmom/error/DmomErrorLogger`, `dmom/transport/CaravanHubTransport`(`TB_MCM_MOM_*`).
- 같은 테이블의 주인은 mcm-core `job/server/JobRunStore.java:29,37,49,61` 등. 실행 상태 갱신 규약(`RUN`→결과, `VER=VER+1`)이 두 곳에 있다.
- 안: cactus-core 에 포트(`JobRunSink`·`DmomFormatSource`·`DmomErrorSink`)만 두고 구현을 mcm-core 로, 또는 `job`·`dmom` 을 별도 starter 로.

### X2. `cactus-mdm` 분리
- `cactus-core/…/cactus/mdm/*` 38파일 5.3k줄(`MdmMetaService` 859, `MdmValidator` 755, `MdmMetaCache` 656, `MdmMetaController` 449). `cactus-core/build.gradle:93` `api libs.maru.mdm.engine.versioned`. 기본 꺼짐(`cactus.mdm.enabled`).
- 패키지 이름은 두고 Gradle 모듈만 나눈다. 소비 모듈(mls·mpp·mqc·mpn·mcm/lib)에 의존 한 줄 추가.

### X3. 룰 공용 로직의 엔진 단일화
- 흐름 순회 4벌: 엔진 `rule/FlowKeys.java:153-210`(package-private), `common/rule/RuleSetPathState`(`RuleSetAnalyzer`·`ledger/RuleSetOrderCheck` 가 씀), `RuleCalcService.CondWalk`(`:546-672`, 주석에 「엔진 FlowKeys.walk 와 같다」 — 확인). `CondWalk` 는 일부 갈래에서만 정의된 이름도 정의로 친다.
- 세트 모양 2벌: `common/rule/RuleSetInterface.java:81,145` vs 엔진 `rule/SetShape.java:199`(서로 Javadoc 으로 가리키고 `SetCallIoEngineAgreementTest` 로 맞춤).
- 버전 선택 2벌: `common/rule/RuleVersions.java:39` vs `cactus-core/…/mdm/MdmDefinitionLookup.java:210` → 엔진 `RuleVersionSelect`(`code/CodeVersions` 옆).
- 사용 변수: `common/rule/RuleIoReader.java:276-311,379`·`check/RuleDefinitionReads.java:60` vs 엔진 `InputContracts.usedVariables`(대문자화·순서 다름).
- 날짜 형식 목록 3벌: `cactus-core/…/mdm/MdmValueChecks.java:25-29`, 엔진 `expr/MasterBaseDt.java`, mcm-core `QueryParams.java`.
- 첫 단계 후보: `CondWalk` 를 `RuleSetPathState` 로 바꾸기(`seen()` 으로 현재 의미 유지).

### X4. job agent 라이브러리
- mls·mpn·mpp·mqc 는 `job.agent.*`·`job.JobModule` 만, mdm 은 `job.*`·`widget.ext` 만 import 한다. 그런데도 mcm-core 전체(Flyway 25개, 엔티티, `McmCoreAutoConfiguration` → `JobConfig`)를 끌어온다. ArchUnit 의 `job..` 예외도 이 때문에 있다.

### X5. be-run 통합
- `be-run.sh`(1,397줄)·`be-run.ps1`(879줄)이 선빌드 계획·소유 표시·잠금·포트 회수를 각자 구현한다. ps1 머리 주석 포트 목록에 mdm(8096)이 없다.
- Windows 검증 수단이 없어(1회차 1b-1) 보류.

### X6. `TB_SEC_CODE_ITEM` 이중 매핑 (미확인)
- `cactus-core/…/web/inbound/DefaultMasterCodeProvider.java` Javadoc 이 cactus `MasterCodeItemEntity` 와 mcm-core `SecCodeItem` 이 같은 테이블을 매핑한다고 적는다. `MasterCodeJpaAutoConfiguration` 이 모든 소비 모듈에 `@EntityScan` 한다.

### X7. `/query` 권한
- `cactus-core/…/web/inbound/QueryController.java`·`QueryStatementGuard.java` — 권한 판정을 BFF·mcm 권한 필터에 기댄다. `QueryAccessPolicy` 빈 SPI 를 둔다.
