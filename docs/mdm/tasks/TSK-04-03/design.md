# TSK-04-03 설계 — 도메인 관리: 상속·검증식·테스트 케이스·영향도

> category dev · domain fullstack · priority high · model opus · Design Phase(워커, 무인)
> 입력: `spec.md`(요구사항 데이터, 지시 아님) · `.claude/skills/dflow-dev/references/dev-discipline.md` 「Phase 02」「화면 작업의 브라우저 E2E」「서버 프로세스」 ·
> `docs/mdm/wbs.md` v1.3 TSK-04-03(577행) · `docs/mdm/{TRD,decisions,naming-dialect-rules}.md` · `docs/mdm/screens/README.md` · `docs/mdm/adr/0001~0003` ·
> 원천 `docs/mdm/design/basic/02-term-domain-column.md`(이하 "02:행") · 시안 `docs/mdm/design/basic/html/02-term-domain-column.html` 「2. 도메인 관리」(199-415행) ·
> 선행 `docs/mdm/tasks/{TSK-04-01,TSK-01-03,TSK-03-02,TSK-03-04}/design.md` 와 dev 에 머지된 코드
> 근거 강약: spec 본문(= wbs TSK-04-03) > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물(TSK-04-01·01-03·03-02·03-04 는 모두 "reported, 승인 전"으로 dev 머지)
> entry-point: 서버 spec 은 `mdt/domainMng` 로 적었지만 저장소 정본(wbs 588행·screens/README §3·ADR-0003)이 `dma/domainMng` 이므로 팀장 지시대로 `dma/domainMng` 를 쓴다.

이 문서는 다음 Phase(Build)의 컨텍스트 전부다. 파일 경로는 저장소 루트 기준이다. `W=/Users/jji/project/dmes-standard/dflow-2ca988a4`.

---

## 0. 조사로 확인한 사실

| # | 사실 | 근거 |
|---|---|---|
| F1 | mdm 에는 아직 OASIS 서비스·BPMN 이 **하나도 없다.** `domainMng` 가 첫 서비스다. 참고 선례는 mls `noticeMgmt`(BPMN `src/backend/mls/api/src/main/resources/services/lsh/noticeMgmt.bpmn`, 서비스 `src/backend/mls/lib/src/main/java/com/dongkuk/dmes/mls/lsh/noticeMgmt/service/NoticeMgmtService.java`)와 DTO+그리드 여러 개를 받는 mcm `MasterRuleFrameService.save(MasterRuleFrameSearchRequest request, List<Map<String,Object>> inList, List<Map<String,Object>> outList)`(`src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/cmb/masterRuleFrame/service/MasterRuleFrameService.java:98`) 다 | 조사 |
| F2 | **BPMN 규약**: `exclusiveGateway id="actionGateway"` + `camunda:property input=action`, 분기 sequenceFlow 의 `name` = action. serviceTask `camunda:class="{빈 이름}"`, 속성 `method`·`output`·`dto`(쉼표로 여러 DTO 가능). `grid` 속성 금지(PropertyException). 요청 `params` 는 DTO 로, `grids.{id}.rows` 는 **이름이 같은 메서드 파라미터** `List<Map<String,Object>> {id}` 로 들어간다(`-parameters` 컴파일, 이름이 다르면 조용히 null). 반환이 `Map` 이고 `output="result"` 면 응답은 `data.result.{…}` 이며 Map 안의 List 는 grid 로 분리되지 않는다 | `CactusRequestConverter.java:24-50`, `CactusResponseConverter.java:46-87`, `PlainJavaServiceTaskExecutable.java:42,183-200`, backend-standard `02-structure-naming-constraints.md:293-327` |
| F3 | **트랜잭션 경계 = action 요청 1건**. `CoreServiceStarter.java:91-100` 이 `transactionHandler.execute(() -> processStarter.start(...))` 로 BPMN 전체를 감싸고, `SpringTransactionHandler.java:204-256` 이 예외 시 `rollbackAll` 한다. mdm 은 `application.yml:29-32` `transactional: true`, TM 은 기본 `"transactionManager"`(Spring Boot 의 `JpaTransactionManager`) 하나(legacy 모드, `cactus.tx.managers` 없음). 서비스에 `@Transactional` 금지(CGLIB 프록시가 파라미터 이름을 잃어 `ParameterName must not be null`) | `OasisAutoConfiguration.java:100-127`, `OasisProperties.java:49`, NoticeMgmtService.java:42-46 |
| F4 | **커밋 오류는 삼켜진다**: `SpringTransactionHandler.commitAll()`(116-145)은 커밋 중 `TransactionException` 을 로그만 남기고 성공으로 응답한다. 그래서 CHECK·UX 위반을 드러내려면 서비스 안에서 `saveAndFlush` 로 flush 를 강제해야 한다. 같은 TM 으로 합류한 호출이 던진 예외를 잡고 계속 가면 rollback-only 가 남아 커밋 때 조용히 사라진다 — 잡지 않는다 | 조사 |
| F5 | **오류 응답 모양(코드 판독, 미실행)**: 서비스가 던진 예외는 `TaskExecutionException` 으로 감싸진 뒤 `CoreServiceStarter` 의 `catch (Exception)` 에서 SYSTEM_ERROR 결과가 되고, `CactusResponseConverter.convertError`(92-100)는 `meta.code="S001"`(USER_ERROR 면 `"E001"`)·`meta.message = e.getMessage()`만 싣는다. `OasisServiceExecutor.java:113` 의 `catch (BusinessException)`(오류 코드·`errors[]` 를 싣는 경로)은 서비스 예외로는 타지 않는다. 즉 **MDM 오류 코드와 `errors[]` 는 응답에 오지 않고, 메시지도 감싼 예외의 메시지(원문 그대로인지 미확인)** 다 — Build 첫 단계에서 실측한다(§4.3 B0). 참고로 DEC-001 「남은 관찰」은 mls `noticeMgmt` 실측에서 `meta.code` 가 `S001` 로 고정되지만 **메시지는 그대로 전달된다**고 기록했다 | `CoreServiceStarter.java:101-126`, `OasisServiceExecutor.java:60-130`, `docs/ai-build-log/DEC-001_noticeMgmt-on-mls.md` |
| F6 | **감사 칼럼**: `CactusAuditEntity`(9칼럼) + `CactusAuditListener` — PrePersist 에서 `VER=0`, PreUpdate 에서 `VER+1`. `VER` 은 `@Version` 이 아니라 자동 낙관적 잠금이 없다. `AuditHolder` 는 `OasisServiceExecutor` 가 요청마다 설정한다. SQLite 에서 `C_AT`(Instant)은 INTEGER(epoch millis)로 저장된다(TSK-04-01 D10) — 네이티브 SQL 로 `C_AT` 를 비교·정렬하지 않는다 | `src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/audit/CactusAuditEntity.java:24-51`, `CactusAuditListener.java:24-58` |
| F7 | **`TB_MDM_DOMAIN` 스키마(V3)** 는 이 작업에 필요한 칼럼을 모두 갖는다: `DOMAIN_ID`(IDENTITY)·`DOMAIN_NAME`·`STD_NAME VARCHAR(50)`·`PARENT_DOMAIN_ID`(자기 FK)·`DOMAIN_KIND`·`DATA_TYPE`(NOT NULL)·`LENGTH`·`SCALE`·`UNIT_CODE`(FK→`TB_MDM_UNIT`)·`MARU_CODE_ID`·`CATE_ID`·`STD_RULE`·`STD_AST`(json)·`BIZ_RULE`·`BIZ_AST`(json)·`DESCRIPTION`·`EXAMPLES`(json)·`TEST_CASES`(json)·`CHG_SEQ NOT NULL DEFAULT 0`·감사 9칼럼. CHECK `CK_TB_MDM_DOMAIN_CODE (DOMAIN_KIND <> 'CODE' OR STD_RULE IS NULL)`, `CK_TB_MDM_DOMAIN_FLAG (DOMAIN_KIND <> 'FLAG' OR PARENT_DOMAIN_ID IS NOT NULL OR STD_RULE IS NOT NULL)`, JSON CHECK 4개. **버전·유효기간 칼럼은 없다**(TSK-02-03 D3 — 감사 `VER` 과 저장 즉시 반영 정책으로 갈음). `FK_TB_MDM_DOMAIN_CODE` 는 걸지 않았다(TSK-04-01 D1). 엔티티 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/MdmDomain.java`, 리포지토리 `.../repository/MdmDomainRepository.java` 가 이미 있다 | `src/backend/mdm/api/src/main/resources/db/migration/mdm/{sqlite,mssql}/V3__create_mdm_term_domain_column.sql` |
| F8 | **배포는 보류다**: TRD §4.1·T4(확정, ADR-0002)·decisions D-019 — 배포 대상·배포 순번(`TB_MDM_DICT_SEQ`, `chg_seq`)·수신 로그 테이블은 DDL 만 있고 이번 범위의 코드는 쓰지 않는다. 활성 테이블의 `CHG_SEQ` 는 `DEFAULT 0`·엔티티 미매핑이다. 따라서 02 「배포 순번」의 "하위 트리에 순번을 찍는다"는 이번에 구현하지 않는다 | TRD.md:47·142, decisions.md:153 |
| F9 | **03·06 테이블 실재 여부**: 이 브랜치 HEAD(`beb2650`)의 Flyway 는 V1~V3 뿐이다. `origin/dev`(`78813e9`)는 HEAD 보다 TSK-05-01 커밋 12개가 앞서 있고 거기에 `V4__create_mdm_interface_layout.sql`(두 방언, `TB_MDM_EAI`·`TB_MDM_LAYOUT`·`TB_MDM_LAYOUT_ITEM`·`TB_MDM_LAYOUT_HEADER`·`TB_MDM_LAYOUT_CONST`)이 있다. **06(`TB_MDM_RULE*`, `TB_MDM_RULE_VAR` 포함)은 HEAD·dev 어디에도 없다**(ERD 문서 `docs/mdm/erd/06-business-rule.*.sql` 만 있다). 03 쪽 `MdmDomainReferenceSpi` 실 구현도 없다(TSK-05-01 F17 — "05-02/05-03 중 누가 할지 wbs 에 명시 없음"). 이 작업이 계획한 파일 중 TSK-05-01 이 바꾼 파일과 겹치는 것은 없다 | `/usr/bin/git diff --stat HEAD dev`, `git grep MdmDomainReferenceSpi dev` |
| F10 | **영향도 계약(TSK-04-01 D9, decisions.md:297)**: 02 는 03·06 테이블을 직접 SQL 로 읽지 않고 `contract.dictionary.MdmDomainReferenceSpi#referencesTo(Set<Long> domainIds, Set<String> columnPhysNames)` 구현체 목록(스프링 빈, 0개 가능)을 모아 집계한다. 03 은 `refKind="LAYOUT_ITEM"`, 06 은 `refKind="RULE_VAR"` 로 구현한다. 결과 모양은 `MdmDomainImpact(domainId, descendantDomainIds, referencingColumnIds, externalReferences, affectedSystemCodes)`. `MdmEffectiveDomainResolver`(`resolve(Long)`·`resolveDraft(MdmDomainDraft)`)와 `MdmDomainImpactLookup`(`impact(Long)`)의 **구현은 TSK-04-03 몫**으로 명시돼 있다 | `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/dictionary/*.java`, TSK-04-01 design §7·§8 |
| F11 | **계약 패키지 규칙**: `com.dongkuk.dmes.mdm.contract..` 는 인터페이스·enum·record·상수만, Spring/JPA/엔진 비의존(`MdmContractArchitectureTest`). 엔티티는 JPA 연관관계 매핑 금지(`MdmEntityArchitectureTest`). 구현체는 계약 밖에 둔다 | `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/contract/MdmContractArchitectureTest.java`, `.../entity/MdmEntityArchitectureTest.java` |
| F12 | **엔진(TSK-03-02) 재사용 지점** — 경로 접두 `E=src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine`: 평가기 `E/expr/MdmEvaluator.java`(`new MdmEvaluator(EngineLookups)`, `configuration()`, `usedVariables(text)`, `evaluate(text, values, evalTs)` → `EvaluationValue`, 캐시·1초 타임아웃·**가상 스레드 실행기에서 평가**), 칸별 검사 `E/expr/ExpressionChecker.java#check(String, FunctionSets.Slot)` → `List<Problem(kind, detail)>`(kind: `PARSE`·`FUNCTION`·`VARIABLE`·`RESERVED`·`MDM_ARGUMENT`·`REGEX`, null 텍스트는 막지 않음), 칸 `E/expr/FunctionSets.java`(`Slot.DOMAIN_STD`=STANDARD·value 전용, `Slot.DOMAIN_BIZ`=STANDARD∪비즈니스 함수), AST 내보내기 `E/expr/AstExporter.java#export(String, ExpressionConfiguration)` → `Map`(JSON 직렬화는 호출자가 Jackson 으로), 유효 식 조립 `E/domain/EffectiveExpressions.java`(`text(List)`·`ast(List<Map>)`·`codeRefText(CodeRef)`·`codeRefAst`·`effectiveCodeRef(List<CodeRef>)`·`bizRequiredVars(text, evaluator)`, 모두 최상위 조상부터 자신까지 순서), 검증기 `E/domain/DefaultDomainValidator.java`(`new DefaultDomainValidator(DefinitionLookup, MdmEvaluator)`, `validate(table, column, record, evalTs)` → `ValidationResult(valid, value, failures)`; 공백→NULL→필수→타입 변환→유효 표준식(CODE 이고 비었으면 MASTER 자동)→요구 변수 누락이면 실패→유효 비즈니스식; 불린이 아니면 `EngineEvaluationException`), 타입 변환 `E/expr/ValueConverter.java#convert(Object, DataType)`, SPI `E/spi/{EngineLookups,DefinitionLookup,CodeLookup,CodeEffLookup,MasterLookup,FunctionProvider}.java`(`CodeEffLookup.NONE`·`MasterLookup.NONE`·`FunctionProvider.NONE` 있음, `CodeLookup` 은 NONE 이 없음) | TSK-03-02 design, 코드 |
| F13 | **엔진에 없는 것**(이 작업이 만든다): 결과 타입이 boolean 인지 정적으로 보는 API(TSK-03-02 §6.4 "테스트 케이스 평가로 확인하는 서버 몫"), 도메인 단위 테스트 케이스 실행, "cate_id 가 RELEASED 버전에서 유효한가" 판정(`DefaultCodeResolver#compute` 는 카테고리 부재와 소속 0개를 구분하지 못한다), 서버용 `CodeLookup` 구현(04 `TB_MDM_CODE*` 가 없다 — TSK-06-01 몫), 비즈니스 함수 공급자, 서버 미리보기 서비스, `MdmColumnDictionaryLookup` 구현체 | 조사 |
| F14 | **표준 칸 범위 차이**: 엔진 `DOMAIN_STD` 는 `MASTER_AT` 와 `MASTER(…,"attrNN")` 도 받지만, 화면 평가기는 인자 3개·리터럴 id/cate·`codeSets` 에 있는 `MASTER` 만 평가하고 나머지는 폴백한다. 02:77·176 은 표준 칸을 "화면 화이트리스트 함수 + MASTER" 로 적는다 | `FunctionSets.java:22-45`, `src/frontend/m-mdm/src/evalex/interpreter.ts:118-148` |
| F15 | **화면 평가기(TSK-03-04)**: `src/frontend/m-mdm/src/evalex/` — m-mdm 안의 화면은 `@/evalex` 로 가져온다(선례 `pages/dma/mdmSample/page.tsx:13` 의 `@/shell`, tsconfig paths `@/* → ./src/*`). 도메인 표준식에는 `validate(ast, vars, opts?: {codeSets})` → `EvalOutcome`(`{kind:"value"}`·`{kind:"error", code}`·`{kind:"fallback", reason}`)을 쓴다. `isSupported`·`usedVariables`·`prepare`·`convertForType` 도 공개돼 있다. 서버 `AstExporter` 결과와 TS `AstNode` 는 같은 스키마(`maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json`)를 따른다. `computeInputContract` 는 룰 전용이다. 화면 JS 파서는 없다 — 편집 중인 식의 AST 는 서버가 만들어 줘야 한다 | `src/frontend/m-mdm/src/evalex/index.ts:7-21`, `interpreter.ts:424-442` |
| F16 | **메뉴·권한 시드**: `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` 의 `seedMdmMenus()`(866-901). 폴더 `mdm`(마루 MDM)과 `dma`(용어·도메인)는 TSK-01-01~01-03 이 이미 `insertMpnFld` 로 id 기준 멱등하게 만든다 — **부모 메뉴 "MDM > 용어·도메인" 은 이미 있다**. 화면은 `insertMcmSecObjIfAbsent(objId, name, "mdm")`·`insertMcmSecMenuIfAbsent(objId, "001", fullSeq, name, "dma", objId)`·SYSADMIN×PERM_ALL `insertIfAbsentComposite`·`seedMdmObjectRbac(objId, "dma")` 네 가지를 부른다(선례 `mdmSample` 884-899). componentPath 는 저장하지 않고 조회 때 `PARENT_MENU_ID + "/" + OBJECT_ID` 로 조립한다(`SecUserService.java:397-405`). FULL_SEQ 는 부팅 끝 `recomputeMenuFullSeq()` 가 다시 매긴다. 기존 "마스터관리(원장)" `cma`·"업무기준관리(원장)" `cmb`·"마스터관리(가동)" `cme` 는 `seedMcmSecMenuFld()`(716-771)·`seedMcmSecMenu()`(494-522)에 있다 — 건드리지 않는다 | 코드 |
| F17 | **액션 이름 제약**: MDM 역할 권한 세트는 `PERM_MDM_READ = search,view,export,compare`, `PERM_MDM_EDIT = READ + save,delete,reg,import,validate,execute,copy,restore`(insert-only, 백필 없음). `dma` 매트릭스는 표준 관리자 EDIT·담당자 READ. SYSADMIN 의 `PERM_ALL` allActions(297-329)에 없는 action 은 SYSADMIN 도 403 이다. 이 작업이 쓰는 `search`·`view`·`validate`·`execute`·`save` 는 **모두 두 목록에 이미 있어 allActions 수정이 필요 없다** | DataInitializer.java:297-329·912-969, `contract/security/MdmActions.java` |
| F18 | **서버 권한 가드**: 표준 관리자 전용을 서버에서 막는 공통 가드는 없다. 권한은 BFF RBAC(`/api/mdm/oasis/{obj}/{action}`)과 mcm 시드 매트릭스가 막는다(TSK-01-03 D6). mdm 백엔드 직접 호출은 신뢰 헤더(`X-Client-Key`·`X-Authenticated-User`·`X-Authenticated-Role`) 없이는 401 이다 | TSK-01-03 design:122·644-647, `application.yml:16-28` |
| F19 | **오류 코드 계약**: `contract/common/MdmErrorCode.java` 는 MDM001~MDM014 이고 도메인용 코드가 없다. `MDM001 ROW_VERSION_CONFLICT(409, "다른 사용자가 수정했습니다…")` 는 재사용할 수 있다. 던질 때는 `common/support/MdmErrors.of(MdmErrorCode, List<MdmCheckIssue>)` 를 쓴다(`MdmCheckIssue(code, message, field, itemKey)`) | 코드 |
| F20 | **테스트 기반**: DB 가 필요한 테스트는 `src/backend/mdm/api/src/test` 에 있고 `@SpringBootTest` + `@ActiveProfiles("local")` + `@TempDir` SQLite **파일** + `@DynamicPropertySource(spring.datasource.url)` 로 Flyway 를 실제 적용한다(공통 base 없음). HTTP 로 BPMN 을 태우는 선례는 없고, 가장 가까운 것은 `common/security/MdmSecurityChainTest.java`(`RANDOM_PORT`, `cactus.security.client-key=mdm-test-client-key`, JDK `HttpClient` 로 `POST /oasis/...`, 신뢰 헤더 3종)다. 가짜 빈은 `common/version/VersionScenarioTestConfig.java` 처럼 `@Primary` 로 둔다. `Clock` 빈은 `common/support/MdmClockConfig.java`. MSSQL 검증은 `api/src/mssqlTest`(Testcontainers, `:api:mssqlMigrationTest`, docker 필요, `testAll` 비포함) | 코드 |
| F21 | **프런트 구조**: 화면 `src/frontend/m-mdm/pages/{group}/{screenId}/page.tsx`, 셸 `MdmPageLayout`(`src/shell/MdmPageLayout.tsx`, props `group·screenId·title·buttons`, objId=screenId 로 버튼 RBAC). `@mantine/*` 직접 import 금지 — `@dk-oasis/shared/{layout,grid,form,modal,message-provider,http}` 래퍼만 쓴다. OASIS 호출은 화면별 `api.ts` 가 `apiRequest` 로 `{meta:{menuId}, params, grids}` 를 POST 하고 `meta.success===false` 면 throw 한다(선례 `src/frontend/m-mls/pages/lsh/noticeMgmt/api.ts:17,47-107`). 배열은 `params` 가 아니라 `grids` 로 보낸다. 들여쓰기 트리 그리드 선례는 없다 — `AgDataGrid` 컬럼 `render` 로 직접 그린다. 버튼 RBAC 판정은 `@dk-oasis/shared` 의 `useUserButtonRbac`·`canDoButton`(`shared/src/portal-shell/use-user-button-rbac.ts`) | 조사 |
| F22 | **포털 적재**: `src/frontend/m-mcm/scripts/generate-page-registry.mjs` 가 `m-mcm/lib/generated/page-registry.ts`(git 추적)를 만든다. 포털은 `@dk-oasis/m-mdm/pages/*` → **dist** 로 풀리므로 `src/frontend/m-mdm/tsup.config.ts` 의 pages entry 에 한 줄을 넣고 `pnpm build:libs` 를 다시 돌려야 한다(1:1 대응은 `m-mdm/tests/tsup-entries.smoke.test.ts` 가 검사). `next dev` 를 직접 띄우면 `predev` 훅(레지스트리 재생성)이 돌지 않는다 | 조사 |
| F23 | **vitest**: `m-mdm/vitest.config.ts` 는 `tests/**/*.test.ts` 만 모은다(`.tsx` 는 조용히 빠진다). 렌더 테스트는 JSX 대신 `createElement`, 첫 줄 `/** @vitest-environment happy-dom */`, `DmesUiProvider` 로 감싸고 `fetch` 를 스텁한다(선례 `m-mdm/tests/shell/mdm-page-layout.test.ts`). `@dk-oasis/shared/*` 는 dist 를 읽으므로 `pnpm build:libs` 가 먼저다 | 조사 |
| F24 | **E2E**: `src/frontend/playwright.config.ts` 는 서버를 띄우지 않고 `baseURL` 도 없다(`fullyParallel: true`). 기존 mdm 스펙은 `SMOKE_MCM_BASE_URL`(기본값 5100 = 메인 체크아웃 포털 → 거짓 통과 주의)·`SMOKE_LOGIN_USER/PASSWORD` 를 쓰고, 로그인은 스펙 안 `login()`(`/login` → 자리표시자 "아이디"·"비밀번호" → "로그인" → `/portal`), 메뉴 이동은 `.tree-item .item-name` 을 텍스트로 누른다. 시험 사용자 `e2e_mdm_steward`·`e2e_mdm_stdadmin`·`e2e_mdm_none` 은 `e2e/fixtures/mdm-rbac-users.sql` 을 격리 `mcm.db` 에 넣어 만든다. `e2e/fixtures/mdm-rbac-seed-check.sql` 은 `OBJECT_ID='mdmSample'` 만 보므로 새 OBJECT 를 추가해도 기대 파일은 바뀌지 않는다. `page.route` 선례는 없다. 기존 `mdm-sample-smoke.spec.ts` 는 추적 파일 `docs/mdm/tasks/TSK-01-02/screens/dma-mdmSample.png` 를, `mdm-shell-rbac-smoke.spec.ts` 는 `docs/mdm/tasks/TSK-01-03/screens/*.png` 를 덮어쓴다 | `src/frontend/e2e/*.spec.ts`, TSK-01-03 design F51·§3.6 |
| F25 | **화면 설계 산출물**: RULE.md·Mes-Guide §4 「개발 진입 가드」·ADR-0003 D3·인계 — 화면 Task 는 `docs/mdm/screens/{screenId}/` 에 5종(분석리포트·기능설계서·디자인설계서·BPMN설계서·정합체크, 템플릿 `docs/guide/design/templates/`)을 두고 식별자 사전 §A.3.2(`docs/guide/design/identifier-dictionary/01-modules-and-screens.md:200-`) 에 화면 행을 등재한다. mdm 에는 아직 선례 폴더가 없다(`docs/mdm/screens/` 에 README 만 있다). mls `noticeMgmt`(As-Is 없음)는 사용자 결정으로 기능설계서 1종으로 줄였다(`docs/ai-build-log/DEC-001_noticeMgmt-on-mls.md` 결정 2, 산출물 `docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md`). 팀장 지시(2026-09-24)로 이 화면도 기능설계서 1종만 둔다(D8) | RULE.md:24-25, `docs/guide/MES/Mes-Guide.md:51-62` |
| F26 | **재귀 CTE 방언**: 공통 문안은 `WITH name (cols) AS (anchor UNION ALL recursive)` — MSSQL 은 `RECURSIVE` 키워드가 없고 SQLite 는 선택이다(TRD §4.2). MSSQL 은 앵커와 재귀부의 칼럼 타입이 정확히 같아야 하고 기본 `MAXRECURSION` 이 100 이다 | TRD.md:62-64 |

---

## 1. 접근 방식

도메인 관리는 **"원장에는 자기 행만 쓰고, 부모에 기대는 값은 쓸 때 조립한다"**(02:103-134)는 한 원칙 위에 선다. 그래서 서버의 중심은 도메인 트리를 요청 스레드에서 한 번 읽어 메모리 스냅샷으로 만들고, 그 위에서 순수 함수로 유효 식·유효 AST·유효 코드 참조·유효 길이를 조립하는 `DomainChainAssembler` 하나다. 조회(목록·상세), 도메인검증(미리 계산), 저장(쓰고 나서 DB 기준으로 다시 계산), 미리보기, 계약 구현체(`MdmEffectiveDomainResolver`) 가 모두 이 조립기 하나를 부르므로 세 자리가 같은 답을 낸다(02:852 "해석 규칙은 함수 하나로 고정"). 식에 관한 판정(파싱·칸별 화이트리스트·변수·AST 내보내기·조립·도메인 검증 단계)은 TSK-03-02 엔진을 그대로 쓰고, 이 작업은 엔진에 없는 것(F13) — 결과 타입 확인, 테스트 케이스 실행, 카테고리 유효성, 거부 조건 목록화, 변경 분류, 영향도 — 만 서버 mdm 모듈에 더한다.

저장은 OASIS action 한 건이 곧 트랜잭션 하나라는 사실(F3)에 기댄다. `save` 는 ① 자기 행에 대한 거부 조건을 전부 모아 검사하고 ② 통과하면 `saveAndFlush` 로 쓴 뒤 ③ **같은 트랜잭션·같은 커넥션에서 트리를 다시 읽어** 하위 도메인의 구조 제약과 테스트 케이스를 다시 돌리고 ④ 하나라도 실패하면 예외를 던진다. 예외는 OASIS 트랜잭션 핸들러가 받아 부모 쓰기까지 되돌린다. 이 순서가 수용 기준 5("하위 테스트 케이스 실패 시 부모 저장 롤백")를 코드 구조로 보장하고, 실제 DB·실제 BPMN 을 태우는 HTTP 통합 테스트가 그것을 증명한다(§4.3). 영향도는 02 자신의 테이블(하위 도메인·참조 컬럼)만 재귀 CTE 로 직접 읽고, 03·06 참조는 TSK-04-01 이 이미 정한 SPI 목록으로만 받는다(F10, D1). 그래서 03·06 테이블이 없든 비어 있든 조회는 같은 코드로 "참조 0건"을 낸다.

화면은 시안 「2. 도메인 관리」를 따른다: 들여쓴 상속 트리 그리드(유효 식 읽기 전용 표시) + 기본 속성 폼(고정·좁히기 표시) + 두 칸 검증식 편집기 + 미리보기·테스트 케이스 그리드 + 영향도·변경 분류·diff·검사 목록. 표준식 미리보기는 서버가 준 유효 표준 AST 를 TSK-03-04 JS 평가기로 즉시 평가하고, 비즈니스식과 편집 중인 식은 디바운스한 서버 `execute` 로 평가한다. 스키마는 바꾸지 않는다(F7).

---

## 2. 변경 파일 목록

접두 약어: `BL = src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`, `BLT = src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm`, `BA = src/backend/mdm/api/src/main`, `BAT = src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm`, `FM = src/frontend/m-mdm`.

### 생성 — 백엔드 (lib)

| 파일 | 내용 |
|---|---|
| `BL/common/engine/MdmEngineConfig.java` | `MdmEvaluator` 빈 1개(`@ConditionalOnMissingBean`). `EngineLookups(definitions=빈 DefinitionLookup, codes=ObjectProvider<CodeLookup>.getIfAvailable(없으면 늘 빈 값), codeEff=CodeEffLookup.NONE, masters=ObjectProvider<MasterLookup> 없으면 NONE, functions=ObjectProvider<FunctionProvider> 없으면 NONE)`. `ExpressionChecker` 빈도 여기서 만든다(D10) |
| `BL/common/engine/MdmCodeLookupAvailability.java` | "서버용 `CodeLookup` 구현체가 있는가"를 한 곳에서 답하는 작은 빈(`boolean available()`). R10·MASTER 판정 불가 경고(D2)가 쓴다 |
| `BL/common/dictionary/DomainNode.java` | 스냅샷 한 행(record): 엔티티에서 옮긴 원시 값 + 파싱해 둔 `stdAst`/`bizAst`(`Map`) |
| `BL/common/dictionary/DomainTreeSnapshot.java` | `Map<Long, DomainNode>` + 자식 색인. `chainRootFirst(id)`(깊이 가드 50, 넘거나 되돌아오면 순환), `descendants(id)`, `withDraft(DomainNode)`(메모리에서 한 노드 대체·추가) |
| `BL/common/dictionary/DomainTreeReader.java` | 요청 스레드에서 `MdmDomainRepository.findAll()` 로 스냅샷을 만든다. **테스트가 `@Primary` 로 감쌀 수 있게 빈으로 둔다**(§4.3 롤백 증명) |
| `BL/common/dictionary/DomainChainAssembler.java` | 순수 함수. 체인 → `EffectiveDomainView`(유효 표준식 텍스트·AST, 유효 비즈니스식 텍스트·AST, 요구 변수, 유효 코드 참조, 유효 종류·타입·단위·길이·소수). 엔진 `EffectiveExpressions` 를 호출할 뿐 다시 구현하지 않는다 |
| `BL/common/dictionary/EffectiveDomainView.java` | 조립 결과 record(계약 `MdmEffectiveDomain` 보다 넓다 — 길이·소수·단위·종류 포함). 계약 타입으로의 변환 메서드를 둔다 |
| `BL/common/dictionary/DomainImpactQueries.java` | **`EntityManager.createNativeQuery` 만 쓰는** 재귀 CTE 두 개(하위 트리+참조 컬럼, 조상 체인)와 컬럼 사전 물리명 조회(§3.6) |
| `BL/common/dictionary/DefaultMdmEffectiveDomainResolver.java` | `MdmEffectiveDomainResolver` 구현. `resolve(id)` = 스냅샷 체인 조립, `resolveDraft(draft)` = `withDraft` 후 조립 |
| `BL/common/dictionary/DefaultMdmDomainImpactLookup.java` | `MdmDomainImpactLookup` 구현. CTE + `List<MdmDomainReferenceSpi>`(0개 가능) 집계, `affectedSystemCodes` 는 빈 목록(D1) |
| `BL/dma/domainMng/dto/DomainMngSearchRequest.java` | `keyword`, `domainKind` (필드 + getter/setter, noticeMgmt DTO 관례) |
| `BL/dma/domainMng/dto/DomainMngViewRequest.java` | `domainId` |
| `BL/dma/domainMng/dto/DomainDraftRequest.java` | `domainId`(신규면 null), `ver`, `domainName`, `stdName`, `parentDomainId`, `domainKind`, `dataType`, `length`, `scale`, `unitCode`, `maruCodeId`, `cateId`, `stdRule`, `bizRule`, `description` |
| `BL/dma/domainMng/dto/DomainPreviewRequest.java` | `DomainDraftRequest` 의 식 관련 필드 + `value` |
| `BL/dma/domainMng/service/DomainMngService.java` | 빈 이름 `domainMngService`. 메서드 `search`·`view`·`validate`·`execute`·`save`(§3.1). `@Transactional` 금지 |
| `BL/dma/domainMng/service/DomainIssueCode.java` | 이슈 코드 상수 `R01`~`R10`·`S01`~`S06`·`W01`~`W03`(§3.2)와 수준(ERROR/WARN) |
| `BL/dma/domainMng/service/DomainRuleChecker.java` | 초안 + 스냅샷 → 이슈 목록. **첫 오류에서 멈추지 않고 전부 모은다** |
| `BL/dma/domainMng/service/DomainExpressionCompiler.java` | 칸별 `ExpressionChecker` 호출 + 표준 칸 추가 제한(D3) + `AstExporter` → JSON 문자열(Jackson `ObjectMapper`) |
| `BL/dma/domainMng/service/DomainTestCaseRunner.java` | 테스트 케이스·예시 값 실행(R03·R08·W02·W03). 엔진 `DefaultDomainValidator` 를 합성 `DefinitionLookup` 으로 부른다(§3.4) |
| `BL/dma/domainMng/service/CodeCategoryValidator.java` | R10 판정 — `CodeLookup.code(id)` 행으로 "RELEASED 버전 V 에서 `from_ver <= V < to_ver` 인 카테고리 행이 있는가"(§3.2) |
| `BL/dma/domainMng/service/DomainChangeClassifier.java` | 변경 분류(NEW·COMPATIBLE·NARROW_OR_WIDEN·STRUCTURAL)와 diff 목록(§3.3) |
| `BL/dma/domainMng/service/DomainTestCases.java` | `TEST_CASES`·`EXAMPLES` JSON ↔ 행 목록 변환(D4) |

### 생성 — 백엔드 (api·BPMN·테스트)

| 파일 | 내용 |
|---|---|
| `BA/resources/services/dma/domainMng.bpmn` | process id = `domainMng`. actionGateway 분기 5개 `search`·`view`·`validate`·`execute`·`save`, 각 serviceTask `camunda:class="domainMngService"`, `method`=action 과 같은 이름, `output="result"`, `dto`=§3.1 표 |
| `BLT/common/dictionary/DomainChainAssemblerTest.java` | 순수 단위 — §4.1 U1 |
| `BLT/common/dictionary/DomainTreeSnapshotTest.java` | 순수 단위 — U2 |
| `BLT/dma/domainMng/service/DomainRuleCheckerTest.java` | 순수 단위 — U3 |
| `BLT/dma/domainMng/service/DomainChangeClassifierTest.java` | 순수 단위 — U4 |
| `BLT/dma/domainMng/service/DomainTestCaseRunnerTest.java` | 엔진 실평가 — U5 |
| `BLT/dma/domainMng/service/CodeCategoryValidatorTest.java` | 메모리 `CodeLookup` — U6 |
| `BLT/dma/domainMng/service/DomainExpressionCompilerTest.java` | 엔진 실평가 — U7 |
| `BLT/dma/domainMng/DomainMngStaticGuardTest.java` | 정적 가드 — U8(ArchUnit `@Transactional` 금지, `DomainImpactQueries` SQL 문자열 검사) |
| `BAT/dma/domainMng/DomainMngRejectConditionTest.java` | SQLite 실 DB, 거부 조건 R01~R10 각 1개 + S01~S06·W01·W02 — §4.2 |
| `BAT/dma/domainMng/DomainMngTestConfig.java` | 테스트 전용 `@TestConfiguration`: 비즈니스 함수 `THK_OK` 를 주는 `FunctionProvider`, 메모리 `CodeLookup`, 스텁 `MdmDomainReferenceSpi` 2개(프로파일·속성으로 켜고 끈다) |
| `BAT/dma/domainMng/DomainMngOasisFlowTest.java` | `RANDOM_PORT` + 실제 BPMN·트랜잭션 — 롤백·오류 전달·동시 수정 — §4.3 |
| `BAT/common/dictionary/DomainImpactQueriesSqliteTest.java` | 재귀 CTE·참조 0건·SPI 집계 — §4.2 |
| `BAT/common/dictionary/DefaultMdmEffectiveDomainResolverTest.java` | `resolve` = 목록 조립 결과, `resolveDraft` — §4.2 |
| `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/DomainImpactQueriesMssqlTest.java` | 같은 CTE 를 MSSQL 에서(수동 docker 게이트) — §4.4 |

### 생성 — 프런트엔드

| 파일 | 내용 |
|---|---|
| `FM/pages/dma/domainMng/page.tsx` | 화면(§3.8). `MdmPageLayout group="dma" screenId="domainMng" title="도메인 관리"` |
| `FM/pages/dma/domainMng/api.ts` | `callAction(action, params, grids?)`, `unwrap`(`meta.success===false` → throw `Error(meta.message)`) — noticeMgmt 선례 |
| `FM/pages/dma/domainMng/types.ts` | 응답·요청 타입(§3.1 필드명 그대로) |
| `FM/pages/dma/domainMng/domain-tree.ts` | 순수 함수: 서버 행(DFS 순서·`DEPTH`) → 들여쓰기 표시 문자열(`└`·전각 공백), 부모 후보 목록(자기와 자기 하위 제외) |
| `FM/pages/dma/domainMng/preview.ts` | 순수 함수: 유효 표준 AST + 입력값 → 화면 판정(`@/evalex` 의 `validate`), 폴백이면 "서버 확인" 상태 |
| `FM/pages/dma/domainMng/change-view.ts` | 분류·이슈 코드 → 화면 문구, diff 행 표시 |
| `FM/pages/dma/domainMng/components/*.tsx` | `DomainTreeGrid`·`DomainBasicForm`·`DomainRuleEditor`·`DomainPreviewPanel`·`DomainTestCaseGrid`·`DomainImpactPanel`·`DomainCheckList`(나누는 단위는 Build 재량, page.tsx 이름 금지) |
| `FM/tests/dma/domainMng/domain-tree.test.ts`, `preview.test.ts`, `change-view.test.ts`, `api.test.ts`, `page-render.test.ts` | §4.5 |
| `src/frontend/e2e/mdm-domainMng.spec.ts` | §4.6 |

### 생성 — 문서

| 파일 | 내용 |
|---|---|
| [`docs/mdm/screens/domainMng/domainMng_기능설계서.md`](../../screens/domainMng/domainMng_기능설계서.md) | **생성(Design 에서 작성 완료)**. 화면 설계 산출물은 이 기능설계서 1종뿐이다(D8, DEC-001 선례). 근거 칸에 원천 02·시안 행 번호 인용 |
| `docs/mdm/tasks/TSK-04-03/screens/*.png` | E2E 스크린샷(§4.6) |

### 수정

| 파일 | 수정 내용 |
|---|---|
| `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` | `seedMdmMenus()` 안 `seedMdmObjectRbac("mdmSample", "dma");` 다음 줄에 `seedMdmDomainMngMenu();` **한 줄**, 그리고 새 private 메서드 `seedMdmDomainMngMenu()`(OBJECT `domainMng`/"도메인 관리"/`mdm`, leaf `insertMcmSecMenuIfAbsent("domainMng", "001", "5010130", "도메인 관리", "dma", "domainMng")`, SYSADMIN×PERM_ALL, `seedMdmObjectRbac("domainMng", "dma")`)를 `migrateMdmSampleGroupToDma()` 메서드 바로 뒤에 둔다. **기존 줄은 한 글자도 고치지 않는다**(log.info 개수 문구 포함) |
| `BL/contract/common/MdmErrorCode.java` | 끝에 `DOMAIN_SAVE_REJECTED("MDM0nn", 400, ErrorCode.BUSINESS_ERROR, "도메인 저장 검사를 통과하지 못했습니다")` 한 개 추가(D9). 번호는 커밋 직전 `origin/dev` 의 최댓값 + 1 로 다시 확인한다(§3.10) |
| `FM/tsup.config.ts` | pages entry 에 `"pages/dma/domainMng/page": "pages/dma/domainMng/page.tsx",` 한 줄 |
| `src/frontend/m-mcm/lib/generated/page-registry.ts` | 손으로 고치지 않는다 — `node src/frontend/m-mcm/scripts/generate-page-registry.mjs` 결과를 커밋 |
| `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` | §A.3.2 표 끝에 `domainMng` 행 1줄(As-Is 코드 "— (To-Be only)", moduleId `mdm`, moduleGroup `dma`, pageName `domainMng`, 비고 "도메인 관리 — As-Is 없음, 원천 02 maru03020/03030 계승") |
| `docs/mdm/decisions.md` | 끝에 되돌리기 어려운 결정 D1·D2·D6 을 append(선행 번호 체계를 이어서) |
| `docs/mdm/tasks/TSK-04-03/design.md` | Build 이탈·기록 |

### 변경하지 않음(명시)

`src/backend/mdm/api/src/main/resources/db/migration/**`(스키마 변경 없음), `BL/contract/dictionary/**`(계약 재정의 금지 — 구현만 한다), `BL/entity/**`·`BL/repository/**`(TSK-04-02·04-04 와 공유 — 파생 메서드도 추가하지 않고 네이티브 조회는 `DomainImpactQueries` 에 둔다), `maru-mdm-engine/**`(엔진 재구현·수정 금지), `DataInitializer` 의 `allActions`·`seedMcmSecMenuFld`·`seedMcmSecMenu`·`seedMdmRbac`·`seedMdmObjectRbac`, `src/frontend/e2e/fixtures/mdm-rbac-*.{sql,txt}`, `src/frontend/shared/**`, `src/frontend/m-mcm/app/**`, `be-run.sh`·`fe-run.sh`, `docs/mdm/tasks/TSK-01-0*/**`, TSK-04-02·04-04·05-0x 의 파일.

---

## 3. 상세 설계

### 3.1 OASIS 서비스 계약 (`/api/mdm/oasis/domainMng/{action}`)

모든 메서드는 `Map<String,Object>` 를 돌려주고 BPMN `output="result"` 이므로 화면은 `data.result.{키}` 로 읽는다. 행 키는 noticeMgmt 관례대로 UPPER_SNAKE(DB 칼럼명 + 파생 키)로 쓴다.

| action | 메서드 시그니처 | BPMN `dto` | 쓰기 | 권한(F17) |
|---|---|---|---|---|
| `search` | `search(DomainMngSearchRequest request)` | `...dto.DomainMngSearchRequest` | 없음 | READ |
| `view` | `view(DomainMngViewRequest request)` | `...dto.DomainMngViewRequest` | 없음 | READ |
| `validate` | `validate(DomainDraftRequest request, List<Map<String,Object>> testCases, List<Map<String,Object>> examples)` | `...dto.DomainDraftRequest` | 없음 | EDIT |
| `execute` | `execute(DomainPreviewRequest request, List<Map<String,Object>> vars)` | `...dto.DomainPreviewRequest` | 없음 | EDIT |
| `save` | `save(DomainDraftRequest request, List<Map<String,Object>> testCases, List<Map<String,Object>> examples)` | `...dto.DomainDraftRequest` | TB_MDM_DOMAIN 1행 | EDIT |

삭제 action 은 두지 않는다(02:197 폐기 없음 — 쓰지 않는 도메인은 참조를 끊고 남긴다).

**`search`** — `keyword`(도메인명·표준명 부분 일치, 대소문자 무시), `domainKind`(정확 일치, 빈 값 = 전체). 결과 `domains`: 일치 행 + **그 조상 전부**(트리 모양 유지, 조상은 `MATCHED=false`)를 DFS 순서로. 형제 순서는 `DOMAIN_NAME`, 같으면 `DOMAIN_ID`. 행 키: `DOMAIN_ID, PARENT_DOMAIN_ID, DEPTH(0=최상위), DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, UNIT_CODE, MARU_CODE_ID, CATE_ID, STD_RULE, BIZ_RULE, VER`(자기 값) + `EFF_LENGTH, EFF_SCALE, EFF_UNIT_CODE, EFF_MARU_CODE_ID, EFF_CATE_ID, EFF_STD_EXPR, EFF_STD_AST(JSON 문자열), EFF_BIZ_EXPR, BIZ_REQUIRED_VARS(배열), HAS_BIZ, CHILD_COUNT, MATCHED`. CODE 종류의 `EFF_STD_EXPR`·`EFF_STD_AST` 는 유효 코드 참조로 만든 `MASTER("id", "cate", value)` 를 조상 표준식 뒤에 `&&` 로 붙인 조립값이다(저장하지 않음). 결과가 0행이면 빈 배열.

**`view`** — `domain`(위 행 키 + `DESCRIPTION`, `EXAMPLES`(문자열 배열), `TEST_CASES`(D4 모양 배열)), `requiredVars`(유효 비즈니스식 요구 변수마다 `{PHYS_NAME, COLUMN_NAME|null, REGISTERED}` — 컬럼 사전 대조), `impact`(§3.6 모양). 없는 `domainId` 면 `S06` 오류.

**`validate`** — 초안 + 테스트 케이스 + 예시로 §3.2 검사를 전부 돌린다. 결과: `ok`(ERROR 이슈 0개), `issues[{CODE, LEVEL, FIELD, ITEM_KEY, MESSAGE}]`, `classification`, `diff[{FIELD, LABEL, BEFORE, AFTER, DIRECTION}]`, `testResults[{DOMAIN_ID, DOMAIN_NAME, OWN, IDX, VALUE, EXPECT, ACTUAL, RESULT(MATCH|MISMATCH|UNDECIDED|ERROR), MESSAGE}]`(자기 케이스 + 변경 분류가 NARROW_OR_WIDEN 이면 하위 도메인 케이스를 **초안을 얹은 메모리 스냅샷**으로 미리 돌린 결과), `effective`(초안 기준 조립값), `requiredVars`, `impact`(신규면 부모 기준 빈 영향도). 쓰기 없음.

**`execute`**(비즈니스식 서버 미리보기) — 초안의 식과 `value`, `vars` 그리드(`[{NAME, VALUE}]`)로 한 번 판정한다. 결과: `effStdExpr`, `effStdAst`, `effBizExpr`, `bizRequiredVars`, `compileIssues`(R01·R02·R04·S05 만), `std{RESULT, MESSAGE}`, `biz{RESULT, MESSAGE}`, `valid`, `step`(엔진 `ValidationResult` 의 실패 단계). `RESULT` 는 `true|false|UNDECIDED|ERROR`. 컴파일 이슈가 있으면 평가하지 않는다. 쓰기 없음. 화면은 편집·입력 변경 400 ms 디바운스로 부른다(§3.5).

**`save`** — §3.4 흐름. 결과: `domainId`, `ver`, `classification`, `warnings[]`, `rerunDomainIds[]`. 거부되면 예외(§3.2 끝).

### 3.2 저장 거부 조건과 경고

**원천 목록(02:177 「검증식 계약」의 저장 거부 조건)을 문장 순서 그대로 번호 매긴다. 원천 개수는 정확히 10 이다(spec "10종"과 일치 → D 결정 불필요).**

| 코드 | 원천 문구(02:177) | 판정(이 작업의 구현) | 서버 테스트(§4.2, `DomainMngRejectConditionTest`) |
|---|---|---|---|
| R01 | 파싱 실패 | 표준식·비즈니스식 각각 `ExpressionChecker.check(text, slot)` 에 `PARSE` 가 있으면(사전 밖 함수 포함 — 엔진은 이것을 파싱 단계에서 거른다) | `R01_파싱_실패는_저장을_거부한다` — std `value >=` |
| R02 | 화이트리스트 밖 함수 | 칸 검사 `FUNCTION` 문제. **표준 칸 추가 제한(D3)**: `MASTER_AT`, 인자 4개인 `MASTER`(attr 모양)도 R02 | `R02_칸_화이트리스트_밖_함수는_저장을_거부한다` — 테스트 설정이 등록한 비즈니스 함수 `THK_OK(value)` 를 **표준 칸**에 씀(엔진 고유 경로). D3 는 별도 테스트 `R02_표준칸_MASTER_AT_는_거부한다`(D3 반려 시 이것만 지운다) |
| R03 | 결과 타입이 boolean 이 아님(예시 값·테스트 케이스로 1회 평가) | 예시 값·테스트 케이스 값마다 **자기** 표준식(과 변수가 갖춰진 경우 자기 비즈니스식)을 `MdmEvaluator.evaluate` 로 평가해 결과가 불린도 NULL 도 아니면 | `R03_결과가_불린이_아니면_거부한다` — std `value + 1`, 테스트 케이스 `{"value":"1","expect":true}` |
| R04 | 표준식의 `value` 외 변수 사용(`getUsedVariables` 목록이 `value` 만이어야) | 표준 칸 `VARIABLE` 문제(`RESERVED` 는 S05) | `R04_표준식에_value_외_변수가_있으면_거부한다` — std `value > OTHER_COL` |
| R05 | 비즈니스식의 참조 변수가 컬럼 사전에 없음 | 자기 비즈니스식 `usedVariables − {value}` 를 `TB_MDM_COLUMN.PHYS_NAME` 과 대소문자 무시로 대조(`DomainImpactQueries.existingPhysNames`) | `R05_비즈니스식_변수가_컬럼_사전에_없으면_거부한다` — biz `value >= NO_SUCH_COL`(대조군: 컬럼 `COIL_NET_WGT` 를 SQL 로 넣은 뒤 `value >= COIL_NET_WGT` 는 R05 없음) |
| R06 | 길이·소수 자리가 부모보다 큼 | 초안 `LENGTH`·`SCALE`(비었으면 상속)이 부모 **유효** 길이·소수보다 크면. 부모를 좁혀 기존 하위 도메인의 명시값이 새 유효값보다 커지는 경우도 R06(하위 도메인 id 를 `ITEM_KEY` 에, 저장 경로에서는 쓰고 나서 검사 → 롤백) | `R06_길이가_부모보다_크면_거부한다` — 부모 길이 20, 자식 30 |
| R07 | 상속 순환 | 제안된 부모의 조상 체인에 자기 자신이 있거나 부모 = 자기, 또는 체인 깊이 가드(50) 초과 | `R07_상속_순환은_거부한다` — 기존 도메인 A→B(자식)에서 A 의 부모를 B 로. 부모 변경은 늘 S01 이기도 하므로 **R07 과 S01 이 함께 나오는지** 단언한다(검사기는 전부 모은다, 불변 I7) |
| R08 | 테스트 케이스 실패 | 자기 케이스(초안 기준 유효 정의)와, 저장 시 쓰고 난 뒤 하위 도메인 케이스(DB 기준 유효 정의)의 결과가 기대와 다르거나(`MISMATCH`) 판정 오류(`ERROR`) | 자기 케이스: `R08_자기_테스트_케이스가_틀리면_거부한다`. 하위 케이스 롤백: §4.3 `하위_테스트_케이스가_실패하면_부모_저장이_롤백된다` |
| R09 | CODE 종류인데 자기 행과 조상 어디에도 코드 참조가 없음 | 유효 코드 참조(`EffectiveExpressions.effectiveCodeRef`)가 null | `R09_CODE_종류는_체인에_코드_참조가_있어야_한다` — 최상위 CODE 에 참조 없음(대조군: 부모에만 참조가 있는 CODE 자식은 저장됨 = 수용 기준 2) |
| R10 | `cate_id` 가 RELEASED 버전에서 유효한 카테고리가 아님 | `CodeCategoryValidator`: `CodeLookup.code(maruCodeId)` 가 비었거나, RELEASED 버전 V(적용 전 RELEASED 포함, CANCELLED 제외) 중 어느 하나에서도 `from_ver <= V < to_ver` 인 `cateId` 행이 없으면. `BASE` 는 RELEASED 버전이 하나라도 있으면 유효. 자기 행에 참조를 지정한 경우만 본다(상속받은 참조는 조상 저장 때 봤다). **`CodeLookup` 구현체가 없으면 거부하지 않고 W02**(D2) | `R10_RELEASED_에_없는_카테고리는_거부한다` — 테스트 `CodeLookup` 에 DRAFT 버전에만 있는 카테고리 |

**보충 거부(원천의 다른 절에서 온다. 10종 목록에는 넣지 않는다)**

| 코드 | 근거 | 판정 | 테스트 |
|---|---|---|---|
| S01 구조 변경 금지 | 02:205 「변경 분류」, 수용 기준 1 | 수정 시 `DOMAIN_KIND`·`DATA_TYPE`·`UNIT_CODE`·`PARENT_DOMAIN_ID` 중 하나라도 바뀜 | `S01_구조_변경은_거부한다`(종류·타입·단위·부모 각각 파라미터화) |
| S02 고정 속성 불일치 | 02:71·73·75 「속성과 상속 규칙」, 시안 검사 목록 | 신규 자식의 종류·타입이 부모 유효값과 다르거나, 단위가 null 도 부모 유효 단위도 아님 | `S02_자식의_종류_타입_단위는_부모와_같아야_한다` |
| S03 코드 참조 모양 | 02:56·854, `CK_TB_MDM_DOMAIN_CODE` | CODE 종류에 표준식이 있음 / CODE 가 아닌데 코드 참조가 있음 / `MARU_CODE_ID`·`CATE_ID` 중 하나만 채움 | `S03_코드_참조_규칙` |
| S04 FLAG 최상위 표준식 필수 | 02:62, `CK_TB_MDM_DOMAIN_FLAG` | FLAG·부모 없음·표준식 비어 있음 | `S04_FLAG_최상위는_표준식이_있어야_한다` |
| S05 식 작성 규칙 위반 | 엔진 `RESERVED`·`MDM_ARGUMENT`·`REGEX`(TSK-03-02) | 칸 검사의 해당 kind | `S05_예약_변수_정규식_정책` |
| S06 필수·형식·존재 | 02:70·55 | 도메인명·표준명·종류·타입 필수, 표준명 `^[A-Z][A-Z0-9_]*$`·50자 이내, 부모·수정 대상 존재, 길이·소수 음수 금지·소수 ≤ 길이, QTY 는 타입 NUMBER 이고 최상위면 단위 필수, 단위 코드가 `TB_MDM_UNIT` 에 있음(FK 를 flush 전에 친절한 이슈로), 테스트 케이스 값 비움·기대값이 불린 아님 | `S06_필수_형식` |
| MDM001 동시 수정 | TRD §11, D5 | 요청 `ver` ≠ DB `VER` | §4.3 `동시_수정은_MDM001_로_거부된다` |

**경고(저장을 막지 않는다)**

| 코드 | 판정 |
|---|---|
| W01 빈 말단 | 부모가 있고, 자기 표준식·비즈니스식이 모두 비었고, 길이·소수가 비었거나 부모 유효값과 같고, CODE 가 아니거나 자기 코드 참조가 비었음. 메시지는 시안 원문 "부모와 정의가 같습니다. 컬럼이 부모를 직접 참조하면 됩니다."(02:149). 예외 3가지(02:151-153)는 사람이 판단하므로 저장은 허용한다 |
| W02 코드 판정 불가 | 서버 `CodeLookup` 구현체가 없어(04 원장 미구축) R10 을 보지 못했거나, 유효 식에 `MASTER`/`MASTER_AT` 가 있는 테스트 케이스·미리보기 결과를 `UNDECIDED` 로 두었다(D2) |
| W03 결과 타입 확인 불가 | 자기 식이 있는데 예시 값도 테스트 케이스도 없어 R03 을 평가하지 못했다 |

**거부의 전달**: `validate` 는 예외 없이 `issues` 로 돌려준다. `save` 는 ERROR 이슈가 하나라도 있으면 `MdmErrors.of(MdmErrorCode.DOMAIN_SAVE_REJECTED, issues)` 를 던진다. F5 때문에 화면에는 메시지만 갈 수 있으므로, 예외 **메시지 본문**을 `"도메인 저장 거부: R06 길이가 부모보다 큽니다(부모 20, 입력 30); R08 …"` 처럼 이슈 코드와 요약을 이어 붙인 문자열로 만든다(`BusinessException(transport, message, details)` 에서 message 에 요약을 넣도록 `MdmErrors` 를 쓰지 않고 직접 만들지, `MdmErrors` 에 메시지 인자 오버로드를 더할지는 B0 실측 결과로 Build 가 정한다 — 계약 파일은 늘리지 않는 쪽이 우선). 동시 수정은 `MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT)`.

### 3.3 상속 조립·변경 분류·diff

**조립(`DomainChainAssembler`, 순수 함수)** — 입력 = 최상위부터 자신까지의 `DomainNode` 목록.

| 값 | 규칙 | 근거 |
|---|---|---|
| 유효 종류·타입 | 최상위 값(자식은 같아야 함, S02) | 02:71·73 |
| 유효 단위 | 체인에서 가장 가까운 non-null `UNIT_CODE` | 02:75 |
| 유효 길이·소수 | 가장 가까운 non-null | 02:74 |
| 유효 표준식 텍스트 | `EffectiveExpressions.text(체인 std_rule)`; CODE 이면 그 뒤에 `codeRefText(유효 코드 참조)` 를 더한다(유효 참조가 있을 때) | 02:79·114 |
| 유효 표준 AST | `EffectiveExpressions.ast(체인 std_ast)`(다시 파싱하지 않는다), CODE 면 `codeRefAst` 를 AND 로 더한다 | 02:112·125 |
| 유효 비즈니스식·AST | 같은 방식(biz) | 02:79 |
| 비즈니스 요구 변수 | `EffectiveExpressions.bizRequiredVars(유효 비즈니스식, evaluator)` | 02:80 |
| 유효 코드 참조 | `EffectiveExpressions.effectiveCodeRef`(가장 가까운 쌍, 쌍 단위 대체) | 02:76·854 |

`DomainNode.stdAst` 는 DB 의 `STD_AST` JSON 을 읽어 `Map` 으로 둔 것이다. 이 조립기는 `MdmEvaluator` 의 `usedVariables` 만 호출하고(파싱 캐시 사용), DB·트랜잭션을 모른다.

**변경 분류(`DomainChangeClassifier`)** — spec 이 정한 세 구분에 신규를 더한다(D6).

| 분류 | 조건 | 처리 |
|---|---|---|
| NEW | `domainId` 가 null | 자기 케이스만 실행 |
| STRUCTURAL | 구조 칼럼(`DOMAIN_KIND`·`DATA_TYPE`·`UNIT_CODE`·`PARENT_DOMAIN_ID`) 중 하나라도 바뀜 | S01 거부 |
| NARROW_OR_WIDEN(좁히기·넓히기) | 값 정의 칼럼(`LENGTH`·`SCALE`·`STD_RULE`·`BIZ_RULE`·`MARU_CODE_ID`·`CATE_ID`) 중 하나라도 바뀜 | 자기 케이스 + **하위 트리 전체의 구조 제약(R06)과 테스트 케이스 재실행** |
| COMPATIBLE(호환) | 호환 칼럼(`DOMAIN_NAME`·`STD_NAME`·`DESCRIPTION`·`EXAMPLES`·`TEST_CASES`)만 바뀜 | 자기 케이스만 실행 |

식 편집의 방향(좁힘인지 넓힘인지)은 판정하지 않는다. diff 행의 `DIRECTION` 은 `LENGTH`·`SCALE` 숫자 비교에서만 `NARROW`/`WIDEN` 이고, 식·코드 참조는 `CHANGE`, 호환 칼럼은 `COMPATIBLE`, 구조 칼럼은 `STRUCTURAL` 이다. 문자열 비교는 앞뒤 공백을 자른 값으로 하고 빈 문자열은 null 로 본다(값이 바뀌지 않은 저장은 COMPATIBLE 이며 diff 가 빈 목록).

### 3.4 테스트 케이스 실행과 저장 트랜잭션

**테스트 케이스 모양(D4)** — `TEST_CASES` JSON 배열의 원소는 `{"value": "<문자열>", "expect": true|false, "vars": {"<표준 물리명>": <값>}?, "memo": "<문자열>"?}`. `value` 는 소수 오차를 피하려고 **문자열로 저장**하고, 읽을 때는 숫자도 받는다(`new BigDecimal(n.toString())` 경로가 아니라 `toString` 을 그대로 문자열로). `EXAMPLES` 는 문자열 배열. 화면 그리드와는 `[{VALUE, EXPECT, VARS(JSON 문자열), MEMO}]` 행으로 주고받는다.

**한 케이스 실행(`DomainTestCaseRunner`)** — 엔진 `DefaultDomainValidator` 를 **도메인마다 새로** 만든다: 합성 `DefinitionLookup` 이 `column("__DOMAIN_TEST__", <표준명>)` 에 대해 `ColumnDefinition(table, column, 유효 종류, 유효 타입, 유효 소수, required=true, 유효 표준식 텍스트(자동 MASTER 는 검증기가 넣으므로 CODE 는 조상 식만), 유효 비즈니스식, 요구 변수, 유효 코드 참조, null, null, null)` 을 돌려준다. 레코드 = `{<표준명>: value} + vars`(변수 이름이 표준명과 같으면 S06). `evalTs = Instant.now(clock)`(MdmClockConfig 의 `Clock`). 결과:
- `ValidationResult.valid()` 가 `ACTUAL`. `expect` 와 같으면 `MATCH`, 다르면 `MISMATCH`(R08).
- `EngineEvaluationException`(판정 오류 — 불린 아님·평가 예외)은 `ERROR`(R08).
- **서버 `CodeLookup` 이 없고**(`MdmCodeLookupAvailability.available()==false`) 유효 표준·비즈니스 AST 에 `MASTER`/`MASTER_AT` 함수 노드가 있거나 CODE 종류면 `UNDECIDED` + W02(D2). 이 경우 기대값과 비교하지 않는다.

**데이터와 스레드**: `MdmEvaluator.evaluate` 는 가상 스레드 실행기에서 평가하므로 요청 스레드의 트랜잭션 밖이다. 그래서 DB 에서 읽을 것은 전부 요청 스레드에서 스냅샷으로 먼저 읽고, 평가는 DB 를 부르지 않는 순수 계산으로 한다(불변 I11). 후속 TSK-06-01 의 서버 `CodeLookup` 도 요청 트랜잭션에 기대면 안 된다(§8 인계).

**`save` 흐름(한 OASIS action = 한 트랜잭션, F3)**

1. `snapshot = domainTreeReader.load()`(요청 스레드). 수정이면 대상 행을 찾고 없으면 S06. 요청 `ver` 와 엔티티 `VER` 가 다르면 MDM001(D5).
2. `DomainRuleChecker` 가 초안에 대해 §3.2 의 R01~R07·R09·R10·S01~S06 을 **전부** 모으고, `DomainTestCaseRunner` 가 자기 케이스·예시로 R03·R08(자기)·W02·W03 을 모은다. **하위 도메인 케이스는 이 단계에서 돌리지 않는다**(저장 경로의 하위 재실행은 반드시 쓰고 난 뒤 DB 기준, 불변 I6). ERROR 가 있으면 `DOMAIN_SAVE_REJECTED` 를 던진다(아직 쓰기 없음).
3. 엔티티에 자기 값만 옮긴다: 규칙 텍스트, `DomainExpressionCompiler` 로 만든 `STD_AST`·`BIZ_AST` JSON(규칙이 null 이면 AST 도 null, CODE 는 둘 다 null), `TEST_CASES`·`EXAMPLES` JSON, 기본 속성. `CHG_SEQ` 는 건드리지 않는다(F8). `mdmDomainRepository.saveAndFlush(entity)`.
4. 분류가 NARROW_OR_WIDEN 이면: `snapshot2 = domainTreeReader.load()`(같은 트랜잭션 — JPA 영속성 컨텍스트와 같은 커넥션이라 방금 쓴 값이 보인다). 하위 도메인마다 (a) 명시 길이·소수가 새 부모 유효값보다 크면 R06, (b) 그 도메인의 테스트 케이스를 `snapshot2` 기준 유효 정의로 실행해 MISMATCH/ERROR 면 R08(`ITEM_KEY` = 하위 `DOMAIN_ID`). 하나라도 있으면 `DOMAIN_SAVE_REJECTED` 를 던진다 → OASIS 핸들러가 3 의 쓰기까지 되돌린다.
5. 응답: `domainId`, 새 `VER`(flush 후 엔티티 값), 분류, 경고, 재실행한 하위 id 목록.

`validate` 는 1·2 와 같은 검사에, 분류가 NARROW_OR_WIDEN 이면 4 를 **메모리**(`snapshot.withDraft(초안)`)로 미리 돌린 결과를 더해 돌려준다. 그래서 사용자는 저장 전에 하위 실패를 보고, 저장 경로는 DB 기준으로 다시 확인한다.

**네이티브 SQL 은 전부 `EntityManager.createNativeQuery`** 로 한다(관례). 진짜 위험은 트랜잭션 밖 커넥션이다 — `DataSource.getConnection()` 을 직접 열면 SQLite 에서 커밋된 데이터만 보거나 쓰기 잠금에 걸려 `SQLITE_BUSY` 가 나고, 엔진 평가 스레드(가상 스레드)에서 DB 를 읽어도 같은 일이 생긴다(불변 I11). `JdbcTemplate` 은 `JpaTransactionManager` 가 노출한 같은 커넥션에 합류하므로 동작은 하지만 관례상 쓰지 않는다.

### 3.5 미리보기 (화면 JS + 서버)

| 상황 | 화면 동작 |
|---|---|
| 목록에서 저장된 도메인을 고르고 미리보기 입력값을 바꿈 | 서버 호출 없이 `search`/`view` 가 준 `EFF_STD_AST` 로 `preview.ts` → `@/evalex` `validate(ast, {value: 변환값})`. 결과 `value:true` = "표준 통과", `value:false` = "표준 실패", `fallback` = "서버 확인", `error` = "판정 오류" |
| 비즈니스식이 있는 도메인(`HAS_BIZ`) | 배지 "서버 확인 항목". 입력값·변수 값이 바뀌면 400 ms 디바운스로 `execute` |
| 표준식·비즈니스식·부모·코드 참조를 편집 중 | 화면은 AST 를 만들 수 없으므로(F15) 400 ms 디바운스로 `execute` 를 불러 새 `effStdAst` 를 받고, 그 뒤의 입력값 변경은 받은 AST 로 즉시 JS 평가 |
| 읽기 권한만 있는 사용자(담당자) | `execute`·`validate` 가 403 이므로 **자동 서버 미리보기를 끈다**(`canDoButton(rbac, "domainMng", "execute")` 가 거짓이면 호출하지 않음). 저장된 도메인의 JS 미리보기만 보인다 |
| CODE 종류 | 화면 `MASTER` 는 `codeSets` 가 있어야 평가하는데 코드 목록 API 가 없으므로(04 미구축) 폴백 → "서버 확인". 서버도 `CodeLookup` 이 없으면 `UNDECIDED`(D2) |

입력값 변환은 `@/evalex` 의 `convertForType`(또는 `prepare`)로 유효 타입에 맞춘다. 서버와 화면의 결과가 다르면 서버가 기준이다(02:362).

### 3.6 영향도 조회 (재귀 CTE + SPI)

`DomainImpactQueries`(모두 `EntityManager.createNativeQuery`, 파라미터는 이름 바인딩):

```sql
-- 하위 트리(자기 포함) + 참조 컬럼. 두 방언 공통 문안(RECURSIVE 키워드 없음, F26)
WITH SUBTREE (DOMAIN_ID, DEPTH) AS (
    SELECT DOMAIN_ID, 0 FROM TB_MDM_DOMAIN WHERE DOMAIN_ID = :domainId
    UNION ALL
    SELECT d.DOMAIN_ID, s.DEPTH + 1 FROM TB_MDM_DOMAIN d JOIN SUBTREE s ON d.PARENT_DOMAIN_ID = s.DOMAIN_ID
    WHERE s.DEPTH < 50
)
SELECT s.DOMAIN_ID, s.DEPTH, c.COLUMN_ID, c.COLUMN_NAME, c.PHYS_NAME
FROM SUBTREE s LEFT JOIN TB_MDM_COLUMN c ON c.DOMAIN_ID = s.DOMAIN_ID
ORDER BY s.DEPTH, s.DOMAIN_ID, c.COLUMN_ID
```

조상 체인 CTE 도 같은 모양으로 위로 올라간다(`MdmEffectiveDomainResolver` 단건 조회·순환 확인용). 규칙: 앵커와 재귀부의 칼럼 타입을 같게 둔다(문자열 경로 칼럼을 더하면 두 부분 모두 `CAST(… AS NVARCHAR(4000))` — MSSQL 은 타입이 다르면 실패한다), 깊이 가드 50 은 MSSQL 기본 `MAXRECURSION` 100 보다 작게, 깊이 50 인 행이 나오면 순환 데이터로 보고 R07 로 알린다.

`DefaultMdmDomainImpactLookup.impact(id)`:
- `descendantDomainIds` = DEPTH ≥ 1 인 DOMAIN_ID.
- `referencingColumnIds` = 자기 + 하위 트리를 참조하는 컬럼(02:88 "영향 받는 하위 도메인과 참조 컬럼").
- `externalReferences` = `List<MdmDomainReferenceSpi>` 각각에 `referencesTo(자기+하위 id 집합, 참조 컬럼 물리명 집합)` 을 불러 합친 것. 빈 목록이면 0건. **03·06 테이블을 이 작업의 SQL 이 직접 읽지 않는다**(D1).
- `affectedSystemCodes` = 빈 목록(배포 보류, D1).

화면 영향도 표(`impact` 응답): `descendants[{DOMAIN_ID, DOMAIN_NAME, STD_NAME, DEPTH}]`, `columns[{COLUMN_ID, COLUMN_NAME, PHYS_NAME, DOMAIN_ID}]`, `ruleVars[{REF_KEY}]`(refKind `RULE_VAR`), `layoutItems[{REF_KEY}]`(refKind `LAYOUT_ITEM`), `otherRefs[{REF_KIND, REF_KEY}]`, `systems[]`, `deployHeld: true`. 화면은 시안 표처럼 "하위 도메인 n / 참조 컬럼 n / 룰 결과 변수 n / 레이아웃 n / 배포 시스템: 배포 보류(PRD §2 규칙 7)" 행을 그린다.

### 3.7 엔진 빈 구성 (D10)

`MdmEngineConfig`(`@Configuration`):
- `@Bean @ConditionalOnMissingBean MdmEvaluator mdmEvaluator(ObjectProvider<CodeLookup>, ObjectProvider<MasterLookup>, ObjectProvider<FunctionProvider>)` — 없으면 `CodeLookup` 은 늘 `Optional.empty()`, `MasterLookup.NONE`, `FunctionProvider.NONE`. `CodeEffLookup.NONE`(원장 서버용). `DefinitionLookup` 은 이 작업에서 엔진 검증기에 합성 구현을 따로 주므로 여기서는 늘 빈 값을 주는 구현.
- `@Bean @ConditionalOnMissingBean ExpressionChecker expressionChecker(MdmEvaluator)`.
- `MdmCodeLookupAvailability` = `ObjectProvider<CodeLookup>.getIfAvailable() != null`.
- 평가기는 앱에 하나다(캐시 공유). 후속 TSK-06-01 이 `CodeLookup` 빈을 등록하면 자동으로 R10·MASTER 판정이 켜진다.
- 주의: 컴포넌트 스캔되는 `@Configuration` 안의 `@ConditionalOnMissingBean` 은 등록 순서에 따라 결과가 달라질 수 있다(Spring 은 자동 구성에서만 순서를 보장하고, mdm 에는 `AutoConfiguration.imports` 가 없다). 그래서 규칙은 "다른 작업은 `mdmEvaluator` 빈을 새로 만들지 않고 재사용하며, `CodeLookup`·`MasterLookup`·`FunctionProvider` 빈만 등록한다"이다. 조건부 등록은 보조 방어일 뿐이다.

### 3.8 화면 (`FM/pages/dma/domainMng/page.tsx`)

화면의 영역·필드·버튼·검증 규칙·권한·열거형은 기능설계서 [`docs/mdm/screens/domainMng/domainMng_기능설계서.md`](../../screens/domainMng/domainMng_기능설계서.md) 가 정본이다(여기서 다시 적지 않는다). 필드·버튼 ID(`S-`·`G-`·`D-`·`L-`·`B-`·`GB-`)와 검증 규칙 ID(§3.2 의 R/S/W 코드)는 그 문서와 코드가 같은 값을 쓴다. 구현 요점만 적는다.

- 공통 셸 `MdmPageLayout group="dma" screenId="domainMng" title="도메인 관리"`. 셸 버튼의 `action` 으로 버튼 RBAC 가 자동 판정된다.
- 목록은 `AgDataGrid` + 컬럼 `render` 로 들여쓰기를 그린다(`domain-tree.ts`, 트리 그리드 선례 없음 — F21).
- `저장` 은 현재 초안으로 `validate` 가 ERROR 0 을 돌려준 뒤에만 열리고, 폼·케이스를 고치면 다시 닫힌다.
- 오류는 `api.ts` 의 throw 를 잡아 `ErrorModal`(또는 `useMessage().showMessage`)로 `meta.message` 를 보인다(스모크 4).
- 미리보기 동작은 §3.5, 영향도 응답 모양은 §3.6 을 따른다.

권한: `useUserButtonRbac` + `canDoButton` 으로 `validate`·`execute`·`save` 가능 여부를 보고, 불가하면 편집 폼을 읽기 전용으로 두고 해당 버튼을 숨긴다(셸 버튼은 `action` 으로 자동 판정).

### 3.9 메뉴·권한·레지스트리 배선

- `DataInitializer.seedMdmDomainMngMenu()`(§2 수정 표). 부모 폴더 `dma`·루트 `mdm` 은 이미 멱등 시드돼 있으므로 새로 만들지 않는다. 필요한 경우를 대비한 방어는 기존 `insertMpnFld` 호출이 이미 한다. 기존 "마스터관리(원장)"·"업무기준관리(원장)" 메뉴는 고치지 않고 새 leaf 로만 등록한다.
- FULL_SEQ 는 screens/README §3 순서(unitMng·termMng·domainMng·columnMng)를 따라 `5010130` 으로 적는다. 부팅 끝 `recomputeMenuFullSeq()` 가 다시 매기므로 다른 작업과 같은 값을 골라도 동작은 깨지지 않는다. MENU_SEQ 는 선례대로 `"001"`.
- `allActions`·권한 세트는 고치지 않는다(F17).
- `FM/tsup.config.ts` entry 1줄 → `pnpm build:libs` → `node src/frontend/m-mcm/scripts/generate-page-registry.mjs` 로 `page-registry.ts` 재생성 후 커밋.

### 3.10 병렬 작업 충돌 지점 (TSK-04-02·04-04·04-05·05-0x 와 동시에 돈다)

| 공유 대상 | 충돌 모양 | 이 작업의 규칙 |
|---|---|---|
| `DataInitializer.seedMdmMenus()` | 04-02(`unitMng`·`termMng`)·04-04(`columnMng`)도 같은 자리에 줄을 더한다 | 호출 한 줄 + 독립 메서드만 더하고 기존 줄(log.info 개수 문구 포함)은 고치지 않는다. 부모 폴더는 id 기준 멱등 헬퍼가 이미 있으므로 다시 만들지 않는다. 머지 충돌은 두 쪽 줄을 모두 남기는 것으로 풀린다 |
| `FM/tsup.config.ts` pages entry | 인접 줄 추가 | 한 줄만 추가. 충돌 시 두 줄 모두 남긴다 |
| `m-mcm/lib/generated/page-registry.ts` | 정렬된 목록이라 인접 줄 | **손으로 병합하지 않는다.** 충돌 시 generator 를 다시 돌린 결과를 쓴다 |
| `MdmErrorCode` 다음 번호 | 04-02·04-04 도 MDM015 를 고를 수 있다 | 커밋 직전 `/usr/bin/git fetch origin` 후 `/usr/bin/git show origin/dev:src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/common/MdmErrorCode.java` 의 최댓값 + 1 을 쓴다(Flyway 번호와 같은 방식). 코드는 테스트에서 상수(`MdmErrorCode.DOMAIN_SAVE_REJECTED.code()`)로만 참조한다 |
| `MdmEvaluator` 빈 | 다른 작업이 평가기 빈을 따로 만들면 빈 중복 | `@ConditionalOnMissingBean`. 후속 작업은 `CodeLookup`·`FunctionProvider` 빈만 등록하면 된다 |
| `MdmColumnDictionaryLookup` 구현 | 04-04 가 구현할 가능성 | 이 작업은 **구현하지 않는다**(두 빈 충돌 방지). R05 는 `DomainImpactQueries` 의 네이티브 조회로 한다 |
| `entity`·`repository` 파일 | 04-02·04-04 가 파생 메서드를 더할 수 있다 | 고치지 않는다 |
| Flyway 번호 | HEAD 는 V3, `origin/dev` 는 V4(TSK-05-01) | 이 작업은 마이그레이션을 추가하지 않는다. Build 도중 스키마 변경이 필요해지면 `flyway-migration-add` 규칙과 naming-dialect-rules 를 따르고 커밋 직전 `origin/dev` 최신 번호 + 1(현재 기준 V5)로 다시 확인한다 |
| `docs/mdm/decisions.md` | 끝에 append 경합 | 끝에 추가만 한다 |
| 식별자 사전 §A.3.2 | 표 끝 행 추가 경합 | 한 행만 추가 |
| HEAD 와 `origin/dev` 차이 | HEAD 는 TSK-05-01 만큼 뒤져 있다(F9) | 계획한 파일이 겹치지 않고, 수용 기준 6 은 03·06 테이블을 읽지 않는 구조라 어느 쪽 스키마에서도 성립한다. Build 는 dev 를 병합하지 않는다(병합은 팀장 몫) |

### 3.11 화면 설계 산출물과 식별자 사전

기능설계서: [`docs/mdm/screens/domainMng/domainMng_기능설계서.md`](../../screens/domainMng/domainMng_기능설계서.md) (D8). 식별자 사전 §A.3.2 화면 행 등재(ADR-0003 인계)는 Build 몫이다.

---

## 4. 테스트 전략

### 4.0 게이트 명령과 기준선(Phase 01 실측, 글자 그대로)

```bash
# 백엔드 — 기준선 1853 tests / 실패 0
rm -rf src/backend/*/build/test-results src/backend/mdm/*/build/test-results
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain
# 합산(저장소 루트에서): tests/failures/errors 합계
find src/backend -path '*/build/test-results/*' -name 'TEST-*.xml' | xargs grep -h -o '<testsuite [^>]*'
# 프런트 — 기준선 m-mdm 278 tests / 실패 0, lint(tsc --noEmit) 통과. zsh 라 PIPESTATUS 를 쓰지 않고 exit 를 따로 받는다
cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint
```

게이트 판정 = 기준선 대비 신규 실패 0 + 총수 미감소. 추가 게이트 항목(기준선 명령 밖, 따로 보고): ① `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` ERROR 0 ② `cd src/backend/mdm && JAVA_HOME=… ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain`(docker 가 없으면 "미실행"으로 보고하고 실패로 위장하지 않는다) ③ E2E `e2e/mdm-domainMng.spec.ts` + 기존 `e2e/mdm-shell-rbac-smoke.spec.ts`·`e2e/mdm-sample-smoke.spec.ts`(§4.6). 테스트는 포그라운드로 끝까지 돌린다.

### 4.1 lib 단위 테스트(DB 없음, `BLT/...`)

| # | 파일 | 확인 |
|---|---|---|
| U1 | `DomainChainAssemblerTest` | 02 예시 트리(중량 WGT → 코일 중량 → GROSS·포장, 코일 두께 → 원재료 코일 두께)로 유효 텍스트 = `(a) && (b)`, 유효 AST = 유효 텍스트를 다시 파싱한 AST 와 같음(`AstExporter` 로 대조), 유효 길이·소수·단위 = 가장 가까운 non-null, CODE 자식 참조 대체·비우면 부모 참조, CODE 유효 표준식 끝에 `MASTER("PROC_CD", "COATING", value)`, 요구 변수 `COIL_NET_WGT` |
| U2 | `DomainTreeSnapshotTest` | DFS 순서·깊이, 조상 보존 필터, `withDraft` 가 원본을 바꾸지 않음, 부모=자기·A→B→A 순환과 깊이 50 가드 |
| U3 | `DomainRuleCheckerTest` | R04·R06·R07·R09·S01~S04·S06·W01 을 메모리 스냅샷으로. **여러 위반이 한 번에 모두 나온다**(R07+S01 동시) |
| U4 | `DomainChangeClassifierTest` | 칼럼별 분류(구조 4·값 정의 6·호환 5), 길이·소수 방향, 공백·빈 문자열 무변경 = COMPATIBLE·diff 0 |
| U5 | `DomainTestCaseRunnerTest` | MATCH/MISMATCH, 판정 오류 = ERROR, 비즈니스 변수 누락 = 실패, 소수 문자열 `"0.1"` 정밀, `CodeLookup` 없음 + MASTER = UNDECIDED·W02(D2), `CodeLookup` 있음 = 실제 판정 |
| U6 | `CodeCategoryValidatorTest` | 메모리 `CodeLookup` 으로 RELEASED 적용 중·적용 전 RELEASED 포함, CANCELLED·DRAFT 전용 카테고리 거부, 닫힌 구간 `to_ver` 배타, `BASE` |
| U7 | `DomainExpressionCompilerTest` | 칸별 문제 → R01/R02/R04/S05 매핑, 표준 칸 `MASTER_AT`·attr `MASTER` = R02(D3), AST JSON 이 `json_valid` 에 맞고 엔진 스키마 모양, null 규칙 → null AST |
| U8 | `DomainMngStaticGuardTest` | ① ArchUnit(`archunit-junit5` 는 `mdm/lib/build.gradle:50` 에 이미 있다): `..dma.domainMng..`·`..common.dictionary..`·`..common.engine..` 클래스·메서드에 `org.springframework.transaction.annotation.Transactional` 이 없다(I11). ② `DomainImpactQueries` 의 SQL 상수(패키지 전용 상수로 노출)가 `RECURSIVE` 를 포함하지 않는다(I13), `TB_MDM_LAYOUT`·`TB_MDM_RULE` 를 포함하지 않는다(I12). 각 규칙은 위반 샘플에 적용해 실제로 걸리는지(공허 통과 방지) 음성 확인을 한 번 둔다 |

### 4.2 api SQLite 통합(`BAT/...`, `@SpringBootTest(MOCK)` + `@ActiveProfiles("local")` + `@TempDir` + `@DynamicPropertySource`, F20)

- **`DomainMngRejectConditionTest`** — `DomainMngService` 빈을 직접 부른다. 테스트 설정 `DomainMngTestConfig` 가 비즈니스 함수 `THK_OK`, 메모리 `CodeLookup`(R10 용)을 준다(W02 테스트는 `CodeLookup` 없는 컨텍스트로 따로). 픽스처(단위 `mm`·`ton`, 컬럼 `COIL_NET_WGT`)는 네이티브 SQL 로 넣는다. §3.2 표의 테스트 이름대로 R01~R10 각 1개 + S01~S06 + W01·W02. **각 테스트는 ① `validate` 결과 `issues` 에 그 코드가 있고 ② `save` 가 `BusinessException` 을 던지며 ③ `TB_MDM_DOMAIN` 행 수·대상 행 값이 호출 전과 같다**를 단언한다. 수용 기준 2 의 양성 대조(부모에만 참조가 있는 CODE 자식 저장 성공)도 여기 둔다.
- **`DomainImpactQueriesSqliteTest`** — 3단 트리 + 컬럼으로 하위 id·깊이·참조 컬럼 정확, 말단 = 0건, **SPI 빈 0개 → `externalReferences` 0건**(수용 기준 6, 03·06 테이블 존재 여부와 무관 — 이 브랜치엔 03 테이블이 없고 dev 에선 있다; 어느 쪽이든 같은 결과), 스텁 SPI 2개 켠 컨텍스트 → `RULE_VAR`·`LAYOUT_ITEM` 이 합쳐지고 SPI 가 자기+하위 id·물리명 집합을 받음, `view` 응답 `impact` 도 같은 수. 순환 데이터(네이티브 UPDATE 로 만든 A↔B)에서 무한 반복 없이 끝남.
- **`DefaultMdmEffectiveDomainResolverTest`** — 모든 행에서 `resolve(id)` = `search` 행의 `EFF_*`, `resolveDraft` 가 저장 없이 초안을 얹음, 계약 레코드 필드 매핑.

### 4.3 OASIS 흐름·롤백 증명(`DomainMngOasisFlowTest`)

`@SpringBootTest(webEnvironment = RANDOM_PORT, properties = "cactus.security.client-key=mdm-test-client-key")` + `local` + `@TempDir` SQLite. JDK `HttpClient` 로 `POST /oasis/domainMng/{action}`(헤더 `X-Client-Key`·`X-Authenticated-User`·`X-Authenticated-Role`, `MdmSecurityChainTest` 패턴). 실제 BPMN·`SpringTransactionHandler` 를 탄다.

| # | 시나리오 | 단언 |
|---|---|---|
| B0 | **Build 첫 단계(스파이크)**: 거부되는 `save` 와 존재하지 않는 `view` 를 보내 응답 봉투를 그대로 기록한다 | `meta.success=false`, `meta.code`, `meta.message` 가 원래 예외 메시지를 담는지(감쌈 여부). 결과를 design.md Build 기록에 적고, 화면 오류 표시·메시지 단언 방식을 이 결과에 맞춘다(F5) |
| B1 | 최상위 저장 → 자식 저장 → `search` | 두 행, 자식 `DEPTH=1`, `EFF_STD_EXPR` 조립, `STD_AST` 가 DB 에 JSON 으로 저장, `CHG_SEQ = 0` 그대로 |
| B2 | **양성 대조**: 부모 P(`value <= 30`)를 `value <= 28` 로 좁힘, 자식 C 케이스 `{"value":"25","expect":true}` | `meta.success=true`, DB P.STD_RULE 이 새 값, `rerunDomainIds` 에 C |
| B3 | **롤백**: P 를 `value <= 20` 으로 좁힘(C 케이스 25→true 가 이제 거짓) | `meta.success=false`, 메시지에 `R08` 과 C 의 id(B0 결과에 따라), **DB P.STD_RULE·STD_AST·VER·U_AT 가 호출 전과 같다**. 추가로 테스트 설정의 `@Primary` `DomainTreeReader` 감싸개가 저장 중 두 번째 `load()` 에서 **P 의 새 규칙(`value <= 20`)을 보았다고 기록**한다 → 쓰기가 실제로 일어났고 같은 트랜잭션에서 읽혔으며 그 뒤 되돌려졌음을 증명한다. 감싸개가 읽을 때 쓰는 것은 위임받은 `DomainTreeReader`(=`EntityManager` 경로)뿐이다 |
| B4 | 하위 명시 길이가 새 부모 길이보다 큰 좁히기 | R06 거부 + 롤백(B3 와 같은 단언) |
| B5 | 동시 수정: `view` 로 받은 `ver` 로 저장 성공 후, 같은 옛 `ver` 로 다시 저장 | 두 번째가 `meta.success=false`(MDM001 메시지), DB 는 첫 저장 값 |
| B6 | `execute` 미리보기 | 비즈니스 변수 채움 → `biz.RESULT`, 누락 → 실패 단계 `BIZ_VAR_MISSING`, 컴파일 이슈 → 평가 없음. 쓰기 없음(행 수·VER 불변) |

### 4.4 MSSQL(수동 docker 게이트)

`src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/DomainImpactQueriesMssqlTest.java` — 기존 `MdmTermDomainColumnMssqlMigrationTest` 와 같은 컨테이너·`local-db` 부팅 순서로 §3.6 CTE 두 개와 물리명 조회를 실행해 SQLite 와 같은 결과(행·깊이·순서)를 단언한다. `testAll` 밖이다 — docker 가 없으면 "미실행"으로 보고한다.

### 4.5 프런트 vitest(`FM/tests/dma/domainMng/*.test.ts`, `.ts` 만)

| 파일 | 확인 |
|---|---|
| `domain-tree.test.ts` | DEPTH → 들여쓰기 문자열, 부모 후보에서 자기·하위 제외, 0행 |
| `preview.test.ts` | 서버 AST(02 코일 두께 예시 AST JSON 을 픽스처로)로 `1.6` 통과·`1.5` 실패, 소수 `% 0.1` 정밀, `MASTER` 폴백 → "서버 확인", 판정 오류 표시 |
| `change-view.test.ts` | 분류·이슈 코드·diff 방향 → 화면 문구 |
| `api.test.ts` | `fetch` 스텁: `meta.success=false` 면 `meta.message` 로 throw, 배열은 `grids` 로 보냄, URL `/api/mdm/oasis/domainMng/{action}` |
| `page-render.test.ts` | happy-dom + `createElement` + `DmesUiProvider`: `search` 가 빈 그리드면 빈 상태 문구가 보인다, 행이 있으면 들여쓴 이름이 보인다(`fetch` 스텁, `__dkOasisButtonRbacStore__` 초기화 — 선례 `tests/shell/mdm-page-layout.test.ts`) |

`tests/tsup-entries.smoke.test.ts` 가 새 entry 와 page.tsx 의 1:1 대응을 자동으로 본다.

### 4.6 브라우저 E2E — `src/frontend/e2e/mdm-domainMng.spec.ts`

`test.describe.configure({ mode: "serial" })`. 로그인·메뉴 이동·스크린샷 경로 함수는 `mdm-shell-rbac-smoke.spec.ts` 의 `login`·`item(...)`·`screenshot` 패턴을 복사해 이 스펙 안에 둔다(공유 헬퍼 파일을 새로 만들지 않는다). 이름 충돌을 피하려고 실행마다 `const STAMP = Date.now().toString(36).toUpperCase()` 로 도메인명·표준명(`E2E_ID_${STAMP}`)을 만든다 — **DB 가 비어 있지 않아도 다시 돌릴 수 있다.**

| # | 스모크 넷 | 절차와 단언 | 스크린샷(`docs/mdm/tasks/TSK-04-03/screens/`) |
|---|---|---|---|
| E1 | 1 메뉴 이동, 2 빈 상태 | admin 로그인 → `마루 MDM` → `용어·도메인` → `도메인 관리`. `.page-layout__footer-breadcrumb` = `"마루 MDM > 용어·도메인 > 도메인 관리"`, `.page-layout__footer-screen-id` = `"domainMng"`. 검색어 `없음-${STAMP}` 로 조회 → 빈 상태 문구가 보인다(데이터가 없는 경우와 같은 화면 경로) | `dma-domainMng-empty.png` |
| E2 | 3 등록이 화면 조작만으로 끝나고 목록에 반영, 2 서버 데이터로 채움 | `도메인 등록` → 도메인명·표준명·종류 ID·타입 STRING·길이 20·표준식 `STR_MATCHES(value, "^[A-Z0-9]{10,20}$")`·케이스 2건(`C24090401AB`→true, `abc`→false) → `도메인검증` → 검사 목록 통과·테스트 결과 일치 → `저장` → 검색어 `${STAMP}` 로 조회 → 목록에 그 행이 보인다 | `dma-domainMng-register.png` |
| E3 | (요구사항) 상속·JS 미리보기 | 그 행 선택 → `하위 도메인 등록` → 종류·타입이 "고정"·비활성, 길이 15, 표준식 `STR_LENGTH(value) <= 15` → 검증 → 저장 → 목록에 `└` 들여쓴 자식과 `&&` 가 든 유효 식. 이어서 **저장된** 자식 행을 선택하고 미리보기 입력 `C24090401AB` → "표준 통과", `abc` → "표준 실패". 비즈니스식이 없는 저장된 도메인이므로 판정이 서버 호출 없이 바뀐다 — 입력하는 동안 `/api/mdm/oasis/domainMng/execute` 요청이 나가지 않았음을 `page.on("request")` 로 확인한다(§3.5 첫 행) | `dma-domainMng-tree.png`, `dma-domainMng-preview.png` |
| E4 | (수용 기준 1 화면 쪽) 거부 표시 | 자식의 길이를 30 으로 → `도메인검증` → 검사 목록에 R06 문구, `저장` 비활성 | `dma-domainMng-reject.png` |
| E5 | 4 서버 오류가 화면에 보인다 | 자식을 열어 둔 채 `page.request.post(\`${BASE_URL}/api/mdm/oasis/domainMng/save\`, …)` 로 같은 행을 먼저 저장(설명만 바꿈) → 화면에서 설명을 고쳐 검증·저장 → 오류 모달(또는 알림)이 보이고 문구가 비어 있지 않다(B0 결과가 원문을 전달하면 "다른 사용자가 수정" 포함까지 단언). **D5 가 반려돼 동시 수정 검사가 없어지면** `page.route("**/api/mdm/oasis/domainMng/save", r => r.fulfill({json:{meta:{success:false, code:"S001", message:"e2e 서버 오류"}}}))` 로 바꾼다 | `dma-domainMng-error.png` |
| E6 | (수용 기준 6 화면 쪽) 영향도 | 부모 행 선택 → 영향도 표: 하위 도메인 1, 참조 컬럼 0, 룰 결과 변수 0, 레이아웃 0, 배포 시스템 "배포 보류" | `dma-domainMng-impact.png` |
| E7 | RBAC | `e2e_mdm_steward` 로그인 → 같은 메뉴로 화면이 열리고 목록이 보이며 `도메인검증`·`저장` 버튼이 없다. 콘솔 403 오류가 없다(자동 서버 미리보기 꺼짐) | `dma-domainMng-steward.png` |

**서버 기동 절차(be-run.sh·fe-run.sh 금지, 자기 포트·자기 PID 만)** — TSK-01-03 §3.6 을 이 워크트리로 옮긴 것이다. 포트는 예시이며 반드시 먼저 비었는지 확인한다.

```bash
W=/Users/jji/project/dmes-standard/dflow-2ca988a4
SP=<Build 자신의 scratchpad>
J=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
# 0) 빈 포트 확인 — 셋 다 출력이 없어야 한다. 있으면 다른 번호를 고른다(5100·8100·8096 금지)
lsof -iTCP:18113 -sTCP:LISTEN; lsof -iTCP:18206 -sTCP:LISTEN; lsof -iTCP:15113 -sTCP:LISTEN
# 1) 격리 DB — 옛 파일은 지우지 않고 옆으로 옮긴다
mkdir -p $W/src/backend/data
for f in mcm mdm; do [ -f $W/src/backend/data/$f.db ] && mv $W/src/backend/data/$f.db $W/src/backend/data/$f.db.bak-$(date +%Y%m%d%H%M%S); done
# 2) mcm 백엔드(로그인·메뉴)
cd $W/src/backend/mcm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18113 --mcm.bff.invalidate-role-url=http://127.0.0.1:15113/api/mcm/internal/cache/invalidate-role --cactus.notify.publish-url=http://127.0.0.1:18113/notify/publish' > $SP/be-mcm.log 2>&1 &
echo $! > $SP/be-mcm.pid
# 3) mdm 백엔드(도메인 API) — SQLite ../data/mdm.db = $W/src/backend/data/mdm.db
cd $W/src/backend/mdm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18206' > $SP/be-mdm.log 2>&1 &
echo $! > $SP/be-mdm.pid
# 4) mcm 기동 완료(DataInitializer 로그) 뒤 시드 대조와 시험 사용자
cd $W/src/frontend && sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-seed-check.sql | diff - e2e/fixtures/mdm-rbac-seed-check.expected.txt
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-users.sql
sqlite3 $W/src/backend/data/mcm.db "SELECT ROLE_ID, OBJECT_ID, PERMISSION_ID FROM TB_MCM_SEC_ROLE_MAPPING WHERE OBJECT_ID='domainMng' ORDER BY ROLE_ID;"
#    기대: MDM_STD_ADMIN|domainMng|PERM_MDM_EDIT / MDM_STEWARD|domainMng|PERM_MDM_READ / SYSADMIN|domainMng|PERM_ALL
# 5) 포털 — m-mdm 을 먼저 빌드, 레지스트리는 커밋한 것을 쓴다(next dev 직접 기동은 predev 를 돌리지 않는다)
cd $W/src/frontend && pnpm build:libs
cd $W/src/frontend/m-mcm && AUTH_SECRET=$(openssl rand -hex 32) NEXTAUTH_URL=http://127.0.0.1:15113 OIDC_ISSUER=http://127.0.0.1:15113 \
  MCM_WAS_URL=http://127.0.0.1:18113 MDM_WAS_URL=http://127.0.0.1:18206 BACKEND_API_URL=http://127.0.0.1:18113 \
  BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026 pnpm exec next dev --turbopack --port 15113 > $SP/fe.log 2>&1 &
echo $! > $SP/fe.pid
# 6) E2E — 반드시 자기 포털. 새 스펙과 기존 mdm 스펙 둘을 함께, workers 1(병렬 로그인은 SQLITE_BUSY)
cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15113 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  pnpm exec playwright test e2e/mdm-domainMng.spec.ts e2e/mdm-shell-rbac-smoke.spec.ts e2e/mdm-sample-smoke.spec.ts --workers=1
# 7) 정리 — 기록한 PID 를 먼저, 남은 자식은 자기가 고른 포트의 리스너만
kill $(cat $SP/fe.pid) $(cat $SP/be-mdm.pid) $(cat $SP/be-mcm.pid)
for p in 15113 18206 18113; do pid=$(lsof -tiTCP:$p -sTCP:LISTEN); [ -n "$pid" ] && kill $pid; done
# 8) 기존 스펙이 덮어쓴 추적 파일 되돌리기(이 작업의 산출물이 아니다)
cd $W && /usr/bin/git checkout -- docs/mdm/tasks/TSK-01-02/screens/dma-mdmSample.png docs/mdm/tasks/TSK-01-03/screens src/frontend/m-mcm/next-env.d.ts
/usr/bin/git status --short   # src/frontend/test-results/** 등 추적 파일 변경이 남으면 git restore 로 되돌리고, 이 작업 산출물(screens/TSK-04-03) 외에는 stage 하지 않는다
```

금지: `be-run.sh`·`fe-run.sh`, 전역 `gradlew --stop`, 이름 기반 `pkill`·`killall`·`pgrep -f` 종료, 남의 포트(5100·8100·8096 등) 점유 프로세스 종료. gradle 은 항상 `--no-daemon`.

**E2E 변이 검증은 전체 스위트(위 6의 세 스펙 함께)로 한다**(dev-discipline Phase 04).

---

## 5. 수용 기준 매핑

| spec 수용 기준 | 검증 방법 |
|---|---|
| 상속 순환·길이 확대·구조 변경 저장 거부 | 서버: `R07_상속_순환은_거부한다`, `R06_길이가_부모보다_크면_거부한다`, `S01_구조_변경은_거부한다`(§4.2) + 롤백 경로 B4(§4.3). 화면: E4 |
| CODE 도메인은 체인 어딘가에 참조가 있어야 저장 | `R09_CODE_종류는_체인에_코드_참조가_있어야_한다`(거부) + 같은 클래스의 양성 대조(부모에만 참조가 있는 자식 저장 성공, `CodeLookup` 없는 기본 컨텍스트에서 W02 와 함께 저장됨 — D2) |
| 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-domainMng.spec.ts` 가 통과한다 | §4.6 E1~E7(스모크 넷 1~4 포함), 서버 기동 절차 그대로, 스크린샷 커밋 |
| 거부 조건 10종 각각 서버 테스트 | §3.2 표의 R01~R10 ↔ `DomainMngRejectConditionTest` 메서드 1:1(R08 하위 경로는 `DomainMngOasisFlowTest` B3 가 추가로 본다) |
| 하위 테스트 케이스 실패 시 부모 저장 롤백 | `DomainMngOasisFlowTest` B3(실제 BPMN·실제 SQLite, 감싸개로 "쓰기 후 같은 트랜잭션에서 읽힘"과 "응답 뒤 원래 값" 둘 다 단언) + B2 양성 대조 |
| 03·06 테이블이 비어 있어도 조회가 동작한다(참조 0건) | `DomainImpactQueriesSqliteTest` 의 SPI 0개 → 0건, 스텁 SPI 집계 대조, `view` 의 `impact`. 화면 E6 |

**스모크 넷(dev-discipline)**: 1 메뉴 이동 = E1, 2 목록 서버 데이터·빈 상태 = E1·E2, 3 등록 한 번이 화면 조작만으로 목록 반영 = E2(E3 도), 4 서버 오류 표시 = E5. 해당 없음 항목 없음.

---

## 6. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

Build·Verify 의 변이 검증이 이 목록을 순회한다. 오른쪽은 변이를 잡아야 하는 테스트다.

| # | 불변 규칙 | 변이 예 → 잡는 테스트 |
|---|---|---|
| I1 | **파생값은 저장하지 않는다**: 유효 표준식·유효 비즈니스식·유효 AST·요구 변수·CODE 의 `MASTER` 식·유효 코드 참조·유효 길이는 `TB_MDM_DOMAIN` 에 쓰지 않는다. 행에는 자기 `STD_RULE`/`STD_AST`/`BIZ_RULE`/`BIZ_AST` 만 쓴다 | `STD_AST` 에 유효 AST 저장 → B1(DB AST = 자기 식 AST)·U1 |
| I2 | `STD_AST`/`BIZ_AST` = 자기 텍스트의 `AstExporter.export` JSON. 규칙이 null 이면 AST 도 null, CODE 는 `STD_RULE`·`STD_AST` 모두 null | AST 를 텍스트 대신 유효식으로 → B1, CODE 에 MASTER 텍스트 저장 → S03 테스트·DB CHECK |
| I3 | 유효 식 = 최상위부터 자신까지 `&&` 누적(`EffectiveExpressions.text`/`ast`), AST 는 다시 파싱하지 않고 AND 노드로 잇는다. CODE 는 그 뒤에 유효 참조의 `MASTER("id","cate",value)` | 순서 뒤집기·부모 식 누락 → U1·`DefaultMdmEffectiveDomainResolverTest` |
| I4 | 유효 코드 참조 = 가장 가까운 `(MARU_CODE_ID, CATE_ID)` **쌍**. 두 칸을 다른 조상에서 따로 가져오지 않는다 | 칸별 따로 해석 → U1 |
| I5 | 상속 규칙: 종류·타입·단위 고정(자식 = 부모 유효값, 단위는 null 허용), 길이·소수는 부모 유효값 이하, 유효 길이·소수·단위 = 가장 가까운 non-null | 비교 부호 뒤집기(`>=`) → R06 테스트·U3, 단위 비교 누락 → S02 테스트 |
| I6 | **저장 경로에서 하위 도메인 재검사(R06·R08)는 자기 행을 `saveAndFlush` 한 뒤 같은 트랜잭션에서 다시 읽은 스냅샷으로 한다.** 실패하면 예외를 던져 action 전체를 되돌린다. 쓰기 전 사전 검사로 옮기지 않는다 | 하위 재실행을 쓰기 전으로 이동 → B3 감싸개 단언(두 번째 load 가 새 규칙을 봄) 실패, 예외를 잡고 계속 → B3 DB 불변 단언 실패 |
| I7 | 검사기는 **모든 이슈를 모은다**(첫 오류에서 멈추지 않음). ERROR 가 하나라도 있으면 쓰기 전에 거부 | 첫 이슈에서 반환 → R07 테스트(R07+S01 동시) |
| I8 | 거부 조건 R01~R10·S01~S06 의 판정 정의(§3.2 표). W01·W02·W03 은 저장을 막지 않는다 | 조건 하나 제거 → 해당 R/S 테스트, W01 을 ERROR 로 → W01 테스트(저장 성공 단언) |
| I9 | 변경 분류 칼럼 집합: 구조 = {DOMAIN_KIND, DATA_TYPE, UNIT_CODE, PARENT_DOMAIN_ID}, 값 정의 = {LENGTH, SCALE, STD_RULE, BIZ_RULE, MARU_CODE_ID, CATE_ID}, 호환 = {DOMAIN_NAME, STD_NAME, DESCRIPTION, EXAMPLES, TEST_CASES}. 값 정의 변경만 하위 재실행을 부른다 | `STD_RULE` 을 호환으로 → U4·B3 |
| I10 | `CHG_SEQ` 는 쓰지 않는다(0 그대로), `TB_MDM_DICT_SEQ`·`TB_MDM_DICT_SYSTEM` 을 읽지도 쓰지도 않는다(배포 보류 T4) | 순번 발급 추가 → B1(`CHG_SEQ = 0`) |
| I11 | 네이티브 SQL 은 `EntityManager.createNativeQuery` 만(관례). `DataSource.getConnection()` 직접 사용 금지. 서비스·구현체에 `@Transactional` 금지(별도 트랜잭션을 여는 `TransactionTemplate` 도 금지). DB 읽기는 요청 스레드에서 끝내고 엔진 평가는 순수 계산으로 | `DomainTreeReader` 를 `dataSource.getConnection()` 직접 읽기로 교체 → B3(트랜잭션 밖 커넥션은 새 규칙을 못 보거나 BUSY), `@Transactional` 추가 → `DomainMngStaticGuardTest`(정적 규칙 — 프록시 해제 여부에 기대지 않는다) |
| I12 | 영향도의 03·06 참조는 `List<MdmDomainReferenceSpi>` 로만 얻는다. `TB_MDM_LAYOUT*`·`TB_MDM_RULE*` 를 이 작업의 SQL 이 읽지 않는다. SPI 0개 → 0건. `affectedSystemCodes` 는 빈 목록 | 03·06 테이블 직접 조회 추가 → `DomainMngStaticGuardTest`(SQL 문자열 검사 — dev V4 병합 뒤 03 테이블이 생겨도 잡는다), 0건 대신 예외 → `DomainImpactQueriesSqliteTest` |
| I13 | 재귀 CTE 는 두 방언 공통 문안(`WITH … UNION ALL`, `RECURSIVE` 없음), 앵커·재귀부 타입 동일, 깊이 가드 50 | `RECURSIVE` 추가 → `DomainMngStaticGuardTest`(SQLite 는 `RECURSIVE` 를 받아들이고 MSSQL 테스트는 수동 게이트라 정적 검사로 잡는다), 가드 제거 → 순환 데이터 테스트가 끝나지 않음(타임아웃) |
| I14 | 표준 칸: 변수는 `value` 하나, `MASTER_AT`·attr `MASTER` 금지(D3). 비즈니스 칸: 비즈니스 함수·다른 컬럼 변수 허용, 서버에서만 평가(화면 JS 는 유효 **표준** AST 만 평가) | 표준 칸 슬롯을 `DOMAIN_BIZ` 로 → R04 테스트, JS 가 비즈니스 AST 평가 → `preview.test.ts` |
| I15 | 테스트 케이스 JSON 모양 `{value(문자열), expect(불린), vars?, memo?}`, 판정은 엔진 `DefaultDomainValidator` 의미(공백→NULL→필수→타입 변환→표준→요구 변수→비즈니스)를 그대로 쓴다. `CodeLookup` 이 없으면 MASTER 가 든 케이스는 UNDECIDED | 자체 판정으로 바꿔 변수 누락을 통과 처리 → U5 |
| I16 | action 은 `search`·`view`·`validate`·`execute`·`save` 다섯 개(MdmActions 13종·allActions 안). 삭제 action 없음. 쓰기는 `save` 만 | 새 action 이름 → E7/권한 403, 다른 action 에서 쓰기 → B6 행 수·VER 불변 단언 |
| I17 | 메뉴: `dma` 아래 새 leaf `domainMng`("도메인 관리"), OBJECT_ID = screenId = componentPath 끝 = BPMN process id = 서비스 빈 이름 접두. 기존 메뉴·폴더·권한 시드 줄은 고치지 않는다(insert-if-absent 만) | 이름 한 글자 변경 → E1 breadcrumb, 기존 줄 수정 → `mdm-rbac-seed-check` diff |
| I18 | 스키마 변경 없음(Flyway 파일 추가·수정 0). 계약 패키지(`contract.dictionary`) 시그니처 불변, `MdmErrorCode` 는 끝에 1개 추가만 | 마이그레이션 추가 → `MdmSharedContractMigrationTest`(버전 집합 정확 단언) |
| I19 | 동시 수정: 요청 `ver` ≠ DB `VER` 이면 MDM001, 쓰기 없음(D5) | 비교 제거 → B5 |
| I20 | 서버 프로세스 규칙(§4.6): be-run.sh·fe-run.sh 금지, 빈 포트 직접 선택, `--no-daemon`, 자기 PID·자기 포트만 종료, 전역 `gradlew --stop`·이름 기반 종료 금지 | (절차 규칙 — Verify 가 명령 기록으로 확인) |

---

## 7. 판별 질문 결론

1. **03·06 테이블이 비어도 조회**: 03 테이블은 이 브랜치엔 없고 `origin/dev` V4 에 있으며, 06 테이블은 어디에도 없다(F9). 영향도는 TSK-04-01 D9(decisions.md)의 `MdmDomainReferenceSpi` 목록 집계로만 03·06 참조를 얻고 이 작업은 03·06 SPI 를 구현하지 않으므로, 테이블 유무와 무관하게 참조 0건으로 동작한다(D1, I12, §4.2).
2. **저장 거부 조건 10종**: 02:177 이 정확히 10개를 열거한다 → R01~R10 으로 번호를 매기고 서버 테스트와 1:1 매핑했다(§3.2). 개수가 같아 D 결정은 없다. 구조 변경·고정 속성·CHECK 제약 등은 보충 거부 S01~S06 으로, 빈 말단은 경고 W01 로 따로 다룬다.
3. **하위 테스트 케이스 실패 시 롤백**: 트랜잭션은 OASIS action 1건이다(`CoreServiceStarter` → `SpringTransactionHandler`, F3). `save` 는 쓰고 flush 한 뒤 같은 트랜잭션에서 다시 읽어 하위 케이스를 돌리고 실패하면 던진다. 실제 BPMN·실제 SQLite HTTP 테스트 B3 가 "쓰기 후 읽힘"과 "응답 뒤 원래 값"을 함께 증명한다.
4. **표준식·비즈니스식**: 파싱·칸별 화이트리스트·AST 내보내기·조립은 엔진(`ExpressionChecker`·`AstExporter`·`EffectiveExpressions`·`DefaultDomainValidator`)을 재사용하고, 화면 미리보기는 `@/evalex` `validate` 로 유효 표준 AST 를 평가한다. 비즈니스식·편집 중 식은 `execute` action(400 ms 디바운스)이 서버에서 평가한다.
5. **상속·변경 분류**: 종류·타입·단위 고정, 길이·소수 좁히기, 코드 참조 쌍 대체를 조립기·검사기로 구현한다. 분류는 spec 의 세 구분(호환 / 좁히기·넓히기 / 구조 변경 금지)에 신규를 더하고 diff 를 저장 전에 보인다. 현재 `TB_MDM_DOMAIN` 스키마로 충분하다 — **스키마 변경 없음**. "새 버전"은 칼럼이 없어 물리화하지 않고 `CHG_SEQ` 도 찍지 않는다(D6).
6. **병렬 충돌 지점**: DataInitializer(한 줄 + 독립 메서드, 부모 폴더 `dma` 는 이미 멱등 시드), tsup entry, page-registry(재생성만), `MdmErrorCode` 번호(커밋 직전 재확인), 평가기 빈(`@ConditionalOnMissingBean`), 컬럼 사전 조회 구현 회피, decisions·식별자 사전 append, Flyway 없음. 기존 마스터관리·업무기준관리 메뉴는 건드리지 않고 새 leaf 로 등록한다(§3.10).
7. **E2E**: 서버는 스펙 밖에서 직접 띄운다(`playwright.config.ts` 에 webServer 없음). 로그인은 스펙 안 `login()`, 메뉴는 `.tree-item .item-name` 텍스트 클릭. 실행 명령과 서버 기동·정리 절차, 스모크 넷, 스크린샷 경로를 §4.6 에 적었다.

---

## 8. 인계 사항

| 받는 작업 | 내용 |
|---|---|
| TSK-06-01(04 원장) | 서버용 `kr.dongkuk.maru.mdm.engine.spi.CodeLookup` 빈을 등록하면 `MdmEngineConfig` 가 그것을 평가기에 넣고, R10 과 MASTER 판정이 자동으로 켜진다(D2). **그 구현은 요청 트랜잭션·`EntityManager` 에 기대면 안 된다** — `MdmEvaluator.evaluate` 는 가상 스레드에서 돈다. 켜진 뒤에는 기존 CODE 도메인의 테스트 케이스 가운데 UNDECIDED 였던 것이 판정되므로 한 번 `validate` 로 확인하라고 알린다. 단 UNDECIDED 규칙은 `CodeLookup` 유무만 본다 — `CodeLookup` 이 생긴 뒤에도 마루 데이터 대상 `MASTER` 는 `MasterLookup` 구현(TSK-07-01 등)이 생길 때까지 false 로 판정된다 |
| TSK-05-02·05-03(03) / TSK-08-01(06) | `MdmDomainReferenceSpi` 를 refKind `LAYOUT_ITEM`·`RULE_VAR` 로 구현해 빈으로 등록하면 도메인 영향도 표에 자동으로 나온다(D1) |
| TSK-04-04(컬럼 사전) | `MdmColumnDictionaryLookup` 구현은 이 작업이 만들지 않았다. 도메인 쪽 공개 부품은 `MdmEffectiveDomainResolver`(유효 식)와 `MdmDomainImpactLookup` 빈이다 |
| 배포 구현(보류 해제 시) | 02 「배포 순번」의 하위 트리 순번 찍기는 `save` 흐름 4단계(분류 NARROW_OR_WIDEN) 자리에 붙이면 된다 — 대상 id 목록은 이미 `rerunDomainIds` 로 계산된다 |

---

## 9. Build 기록

### 9.1 B0 스파이크 실측(2026-09-24, Build 첫 단계)

실제 `services/dma/domainMng.bpmn` + 골격 `DomainMngService` 를 `RANDOM_PORT` SQLite 로 띄우고 신뢰 헤더를 붙여 `POST /oasis/domainMng/{action}` 을 보냈다(임시 테스트, 측정 뒤 삭제). 응답 원문:

| # | 요청 | 응답(원문) | 결론 |
|---|---|---|---|
| a | `view` — 서비스가 `new BusinessException(BUSINESS_ERROR, "B0 view 원문 메시지 id=999")` 를 던짐 | `{"meta":{"success":false,"code":"S001","message":"B0 view 원문 메시지 id=999"}}` | **메시지는 감싸지지 않고 원문 그대로** `meta.message` 에 온다. `meta.code` 는 `S001` 고정, `errors[]` 는 없다(F5 확인). |
| b | `validate` + grids `testCases`(2행)·`examples`(1행), params `parentDomainId:7` | `{"data":{"result":{"parent":7,"testCases":2,"examples":1}},"meta":{"success":true,"code":"0000"}}` | grids 행이 **메서드 파라미터 이름으로 바인딩**된다(mdm lib 의 `-parameters` 정상). 결과는 `data.result.{키}`. |
| c | `validate` 에 grids 를 빼고 보냄 | `success:false`, `"No suitable method … Key [testCases] is not visible in the binding context … Parameter [testCases] is not marked optional."` | grid 가 없으면 바인딩 실패다. |
| c' | BPMN serviceTask 에 `camunda:property optional="testCases,examples"` | `"[optional] is an unavailable attribute. Element [saveTask] … Executor [JavaServiceTaskExecutable]"` | `optional` 속성은 이 실행기에서 **쓸 수 없다**(BPMN 에서 뺐다). → **화면은 grids 를 빈 행 배열이라도 늘 보낸다**(`api.ts` 가 보장, `api.test.ts` 로 고정). |
| d | `save` — `saveAndFlush` 로 1행을 쓰고 나서 `BusinessException` 을 던짐 | `{"meta":{"success":false,"code":"S001","message":"B0 save 원문 메시지 R08 id=1"}}`, 호출 뒤 `SELECT COUNT(*) FROM TB_MDM_DOMAIN` = **0** | 쓰고 난 뒤 던지면 action 전체가 **실제로 되돌려진다**(F3 전제 확인). |
| e | params `parentDomainId:""` | `"java.lang.NumberFormatException: For input string: \"\""` | Gson 은 `Long` 의 빈 문자열을 null 로 바꾸지 못한다. |
| e' | params `parentDomainId:null` | `{"meta":{"code":"S999","message":"The type cannot be determined because object is null…"}}` | **params 에 null 값이 있으면 요청 전체가 실패**한다. → 화면 `api.ts` 는 값이 null·빈 문자열인 params 키를 **빼고** 보낸다(`api.test.ts` 로 고정). |

**§3.2 끝 "거부의 전달" 확정**: 메시지가 원문으로 전달되므로, `save` 거부는 `DomainRejections.reject(issues)`(`dma/domainMng/service` 안의 작은 헬퍼)가 `new BusinessException(DOMAIN_SAVE_REJECTED.transport(), 요약 메시지, details)` 를 직접 만들어 던진다. 요약 메시지는 `"도메인 저장 거부: R06 …; R08 …"`(ERROR 이슈 코드·메시지·`ITEM_KEY` 를 `; ` 로 이음), details 첫 행은 `ErrorDetail.of("MDM015", 기본 메시지)`, 뒤 행은 이슈마다 `ErrorDetail.ofGrid` — `MdmErrors.of` 와 같은 모양이지만 메시지만 요약으로 바꾼다. 공유 파일 `MdmErrors` 는 고치지 않는다(D11). 동시 수정은 `MdmErrors.of(ROW_VERSION_CONFLICT)` 그대로(메시지 = "다른 사용자가 수정했습니다. 다시 불러오세요"). 화면은 `meta.message` 를 그대로 오류 모달에 보인다. E5 는 "다른 사용자가 수정" 포함까지 단언한다.


### 9.2 설계 이탈과 추가 기록

| # | 이탈·추가 | 사유 |
|---|---|---|
| X1 | BPMN 에 grid 선택 속성(`optional`)을 두지 않는다. 화면 `api.ts` 가 grids 를 빈 배열이라도 늘 보내고, params 에서 null·빈 문자열 값 키를 뺀다(`cleanParams`) | B0 c·c'·e·e'. `api.test.ts` 가 두 규칙을 고정한다 |
| X2 | 거부 예외는 `dma/domainMng/service/DomainRejections`(reject·notFound)가 직접 만든다. `MdmErrors` 는 고치지 않았다 | §9.1 확정, D11 |
| X3 | `CommonContractTest` 의 오류 코드 개수 단언을 14 → 15 로 바꾸고 MDM015 단언 테스트 1개를 더했다 | 계약 enum 에 1개를 더한 사실의 반영(기대값 완화 아님). **04-02·04-04 가 같은 줄을 고치면 병합 충돌이 난다** — 두 쪽 코드를 모두 남기고 개수를 합으로 맞춘다 |
| X4 | 테스트 파일을 설계 목록보다 나눴다: 코드 원장 없는 컨텍스트(W02·수용 기준 2 양성 대조) `DomainMngWithoutCodeLedgerTest`, 스텁 SPI 컨텍스트 `DomainImpactSpiAggregationTest`, 공용 도우미 `DomainMngApiSupport`(api)·`DomainFixtures`·`DomainDrafts`(lib) | 빈 구성이 다른 스프링 컨텍스트는 클래스를 나눠야 한다. 테스트 설정은 모두 `@TestConfiguration` + `@Import` 라 다른 컨텍스트로 새지 않는다(`코드_원장이_없는_컨텍스트다` 가 확인) |
| X5 | 파일 추가: `common/dictionary/DomainJson`(JSON 칼럼 읽기·쓰기), `dma/domainMng/service/{DomainIssue, DomainDraft, DomainTestCase}`(값 record) | 설계 파일 목록의 책임을 나눈 것. 계약·엔티티·리포지토리·엔진은 건드리지 않았다 |
| X6 | `view` 의 없는 id 는 메시지 `"S06 필수 입력·형식을 확인하세요 — 도메인이 없다: {id}"` 로 던진다("도메인 저장 거부:" 접두 없음). 영향도 응답에 `cycle`(깊이 가드 행이 있었는가)을 더했다 | 조회 오류에 "저장 거부"는 뜻이 틀리다. 순환 데이터 표시용 |
| X7 | `execute` 의 vars grid 값은 화면이 문자열로 보내므로 숫자·true/false 모양이면 BigDecimal·Boolean 으로 바꿔 넣는다. 테스트 케이스 `vars` 는 JSON 값 타입을 그대로 쓴다 | 엔진 검증기는 요구 변수 값을 변환하지 않는다(D2 경계) — 문자열 "8" 과 숫자 비교가 판정 오류가 된다 |
| X8 | R03 은 결과가 불린도 NULL 도 아닐 때만이다. 예시 값 평가가 예외(타입 불일치 등)로 끝나면 R03 으로 보지 않는다(테스트 케이스라면 R08 ERROR 로 잡힌다) | 결과 "타입"을 확인할 수 없는 경우를 거부 사유로 섞지 않는다 |
| X9 | 화면: 테스트 케이스 편집은 AgDataGrid 인라인 편집 대신 shared form 컨트롤 표(`.domain-mng__cases`)로, 읽기 전용 목록(트리·영향도·diff·검사 목록)은 AgDataGrid 로 그렸다. 단위(D-008)는 단위 목록 API 가 없어(unitMng 는 TSK-04-02) 텍스트 입력이다. 빈 상태는 그리드 오버레이 대신 `.domain-mng__empty` 요소로 그린다 | D12 |
| X10 | 화면 RBAC: 툴바 `도메인 등록`·`하위 도메인 등록` 은 `action: "save"`(셸이 자동 비활성), 본문 `도메인검증`·`저장` 은 `canDoButton` 으로 save·validate 권한이 없으면 숨긴다. 편집 폼은 save 권한이 없으면 읽기 전용, execute 권한이 없으면 자동 서버 미리보기를 끈다 | §3.8, E7 |
| X11 | `page-render.test.ts` 는 `localStorage` 를 스텁한다 | 이 happy-dom 환경에 저장소가 없어 `apiRequest` 가 토큰을 읽다가 던진다(측정) |
| X12 | decisions.md 번호는 D-050~D-052 | 이 브랜치 끝은 D-046 이지만 `origin/dev` 가 D-049 까지 있어 겹치지 않게 이었다 |
| X13 | E2E 뷰포트 1680×1200, 검사 목록·영향도는 스크롤해 찍는다 | 스크린샷이 승인 근거라 목록·상세가 한 화면에 보이게 했다 |
| X14 | `oasis-contract-check` 기본 대상 모듈(mcm·mls·mqc·mpp·mas·mcm-core)에 mdm 이 없다. `--module mdm` 으로 따로 돌렸다 | 기본 실행만으로는 domainMng 가 검사되지 않는다(보고에 올린다) |

### 9.3 변이 검증(불변 규칙 I1~I20)

변이 하나마다 파일 하나를 고치고 대상 테스트 클래스만 돌린 뒤 되돌렸다(스크립트, 커밋한 초록 구현 기준). RED = 해당 테스트가 실패했다.

| 변이 | 내용 | 결과 | 빨강 낸 테스트 |
|---|---|---|---|
| I1 | 저장 AST 를 유효 AST 로 | RED | `B1_최상위와_자식을_저장하고_조회한다`, `저장은_자기_식의_AST_만_쓰고_파생값과_배포_순번은_쓰지_않는다` |
| I2 | STD_AST 를 늘 null | RED | `B1_최상위와_자식을_저장하고_조회한다`, `저장은_자기_식의_AST_만_쓰고_파생값과_배포_순번은_쓰지_않는다` |
| I3 | 유효 식 순서 뒤집기 | RED | `유효_표준식은_최상위부터_자신까지_AND_로_잇는다` |
| I3b | 부모 식 누락(자기 식만) | RED | `유효_표준식은_최상위부터_자신까지_AND_로_잇는다` |
| I4 | 코드 참조를 칸별로 따로 | RED | `CODE_는_가장_가까운_참조_쌍으로_MASTER_식을_만든다` |
| I5 | R06 비교 >= 로 | RED | `W01_부모와_같은_빈_말단은_경고다`, `R06_길이_소수는_부모_유효값_이하` |
| I5b | S02 단위 비교 누락 | RED | `S02_자식의_종류_타입_단위는_부모와_같아야_한다` |
| I5c | 유효 길이 = 가장 먼 non-null | RED | `유효_길이_소수_단위는_가장_가까운_non_null_이다` |
| I6 | 하위 재검사를 쓰기 전으로 | RED | `B4_하위_명시_길이가_새_부모_길이보다_크면_롤백된다`, `하위_테스트_케이스가_실패하면_부모_저장이_롤백된다` |
| I6b | 하위 실패를 잡고 계속 | RED | `B4_하위_명시_길이가_새_부모_길이보다_크면_롤백된다`, `하위_테스트_케이스가_실패하면_부모_저장이_롤백된다` |
| I7 | 첫 이슈에서 반환 | RED | `R07_상속_순환은_거부한다` |
| I8 | R09 조건 제거 | RED | `R09_CODE_종류는_체인에_코드_참조가_있어야_한다` |
| I8b | W01 을 ERROR 로 | RED | `R09_CODE_종류는_체인에_코드_참조가_있어야_한다`, `R07_상속_순환은_거부한다`, `W01_빈_말단은_경고만_하고_저장된다` |
| I8c | R10 조건 제거 | RED | `R10_RELEASED_에_없는_카테고리는_거부한다` |
| I8d | R05 조건 제거 | RED | `R05_비즈니스식_변수가_컬럼_사전에_없으면_거부한다` |
| I8e | R03 조건 제거 | RED | `R03_결과가_불린이_아니면_거부한다` |
| I8f | R08 조건 제거(자기) | RED | `R08_자기_테스트_케이스가_틀리면_거부한다` |
| I9 | STD_RULE 을 호환 칼럼으로 | RED | `B2_부모를_좁혀도_하위_케이스가_통과하면_저장된다`, `하위_테스트_케이스가_실패하면_부모_저장이_롤백된다` |
| I9b | STD_RULE 을 호환 칼럼으로(단위) | RED | `칼럼별_분류와_방향(String, String, String) > [7] column = "STD_RULE", kind = "NARROW_OR_WIDEN", direction = "CHANGE"` |
| I10 | CHG_SEQ 발급 | RED | `B1_최상위와_자식을_저장하고_조회한다`, `저장은_자기_식의_AST_만_쓰고_파생값과_배포_순번은_쓰지_않는다` |
| I11 | @Transactional 추가 | RED | `서비스와_구현체에_Transactional_과_직접_커넥션이_없다` |
| I11b | reader 가 직접 커넥션 | RED | `서비스와_구현체에_Transactional_과_직접_커넥션이_없다` |
| I12 | 03 테이블 직접 조회 | RED | `영향도_SQL_은_공통_문안이고_03_06_테이블을_읽지_않는다` |
| I12b | SPI 0개면 예외 | RED | `말단은_하위_0건이다`, `하위_트리와_깊이_참조_컬럼을_정확히_읽는다`, `SPI_구현이_없으면_03_06_참조는_0건이다` |
| I13 | RECURSIVE 추가 | RED | `영향도_SQL_은_공통_문안이고_03_06_테이블을_읽지_않는다` |
| I13b | 깊이 가드 제거 | RED | `순환_데이터에서도_끝난다` |
| I13c | 스냅샷 깊이 가드 제거 | RED | `깊이_가드_50을_넘으면_순환으로_본다` |
| I14 | 표준 칸 슬롯을 DOMAIN_BIZ 로 | RED | `R04_표준식에_value_외_변수가_있으면_거부한다`, `R02_칸_화이트리스트_밖_함수는_저장을_거부한다`, `R02_표준칸_MASTER_AT_는_거부한다`, `거부_예외는_MDM_오류_코드와_이슈를_싣는다` |
| I14b | D3 표준 칸 추가 제한 제거 | RED | `R02_표준칸_MASTER_AT_는_거부한다` |
| I15 | 변수 누락을 통과로 | RED | `비즈니스_변수가_없으면_실패이고_있으면_평가한다` |
| I15b | 원장 없음에도 UNDECIDED 아님 | RED | `코드_원장이_없으면_CODE_케이스는_판정_불가다` |
| I16 | execute 에서 쓰기 | RED(테스트 보강 후) | `B6_서버_미리보기는_평가만_하고_쓰지_않는다` |
| I16b | validate 에서 쓰기 | RED(테스트 보강 후) | `R02_칸_화이트리스트_밖_함수는_저장을_거부한다`, `R04_표준식에_value_외_변수가_있으면_거부한다`, `R05_비즈니스식_변수가_컬럼_사전에_없으면_거부한다`, `R09_CODE_종류는_체인에_코드_참조가_있어야_한다` 외 |
| I18 | 마이그레이션 추가 | RED | `flyway_가_V1_V2_V3_를_적용했다` |
| I19 | ver 비교 제거 | RED | `B5_동시_수정은_MDM001_로_거부된다` |
| I14c | 화면 JS 가 비즈니스 AST 를 평가 | 해당 없음(구조적으로 막힘) | 서버가 화면에 비즈니스 AST 를 보내지 않는다(`search`·`view` 행에 `EFF_BIZ_AST` 없음). `preview.ts` 는 유효 표준 AST 만 받는다 |
| I17 | 화면 제목 한 글자 변경(`도메인 관리X`) | RED(E2E 세 스펙 전체 실행) | `E1 메뉴로 이동하고 결과가 없으면 빈 상태가 보인다`(breadcrumb) |
| I20 | 서버 프로세스 규칙 | 변이 대상 아님 | 절차 규칙 — 명령 기록으로 확인(자기 포트 18113·18206·15113, 기록한 PID 종료) |

- **처음에 초록으로 남은 변이 1건(I16 execute 에서 쓰기)**: B6 가 `owner` 행의 VER 만 보고 있어 다른 행 쓰기를 놓쳤다. B6 를 표 전체 지문(DOMAIN_ID·VER·U_AT·DESCRIPTION·STD_RULE) 비교로 늘린 뒤 RED 를 확인했다.
- I11b(트랜잭션 밖 직접 커넥션)는 정적 가드(ArchUnit `DataSource.getConnection` 호출 금지)만 잡는다. B3 는 이 변이를 잡지 않는다 — SQLite 풀에서 커넥션을 여는 것만으로는 실패하지 않는다.
- I16b(validate 에서 쓰기)는 보강 전 코드로는 돌리지 않았다 — `assertRejected` 가 validate 뒤에 행 수를 재므로 놓친다고 코드로 판단해 먼저 보강했다. 도우미가 validate 전에 행 수를 재고 validate 직후에도 비교하게 늘린 뒤 RED 를 확인했다(`R02_…`·`R04_…`·`R05_…`·`R09_…` 등 거부 테스트 전부).

### 9.4 게이트 실행 결과(Build 완료 시점, 명령은 §4.0 글자 그대로)

| 게이트 | 결과 |
|---|---|
| 백엔드 `testAll` | **1957 tests, 실패 0·오류 0**(기준선 1853 + 신규 104: lib 63·api 41) |
| 프런트 `pnpm build:libs` | 성공 |
| m-mdm `vitest run` | 295 tests(기준선 278 + 신규 17). 신규·기존 기능 테스트는 모두 통과. **`tests/evalex-perf.test.ts` NFR-1 시간 한도(1만 레코드 100 ms) 1~4건 실패** — 호스트 load average 35~51(다른 워크트리 빌드·OrbStack) 상태에서 중앙값 177~843 ms. 이 파일과 `src/evalex/**` 는 설계 커밋(8701833) 이후 바뀌지 않았고, 그 파일만 단독으로 돌려도 같은 실패가 난다 → 환경 부하로 판단(보고에 올린다) |
| m-mdm `lint`(tsc --noEmit) | 통과 |
| `oasis-contract-check --root .` | ERROR 0(기본 대상에 mdm 없음, X14). `--module mdm`: ERROR 0 · INFO 1(6-D-2 Map 반환 — 화면 `api.ts` 가 `data.result` 를 펼친다) |
| `:api:mssqlMigrationTest`(docker/OrbStack) | 40 tests 통과(신규 `DomainImpactQueriesMssqlTest` 2 포함) |
| E2E 세 스펙(자기 포트 18113·18206·15113, workers 1) | `mdm-domainMng` 3 + `mdm-shell-rbac-smoke` 4 + `mdm-sample-smoke` 1 = **8 passed** |

## 담당자 확인 필요 결정

무인 실행이라 근거가 강한 쪽을 골랐다. 근거 강약은 spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물 순이다.

### D1 — 영향도의 03·06 참조와 배포 시스템을 어떻게 얻는가
- **질문**: 룰 결과 변수(06)·레이아웃(03) 참조와 배포 시스템을 영향도에 어떻게 채우는가. 06 테이블은 없고 03 테이블은 dev 에만 있으며 둘 다 SPI 구현이 없다.
- **선택지**: (1) 이 작업이 `TB_MDM_LAYOUT_ITEM`·`TB_MDM_RULE_VAR` 를 네이티브 SQL 로 직접 읽는다(테이블 부재 방어 포함). (2) TSK-04-01 D9 대로 `List<MdmDomainReferenceSpi>` 집계만 하고 03·06 SPI 구현은 각 영역 작업에 맡긴다. 배포 시스템은 빈 목록 + "배포 보류" 표시. (3) (2) + 03 테이블이 dev 에 생겼으니 LAYOUT_ITEM SPI 를 이 작업이 구현한다.
- **택한 것**: (2).
- **근거**: decisions.md 의 TSK-04-01 D9(dev 머지)가 이미 이 방식을 정했고 wbs 의존 방향(02→03·06 단방향)과 맞다. (3) 은 03 영역 산출물을 선점하고(TSK-05-01 F17 이 담당 미정으로 남김) 이 브랜치엔 03 테이블도 없다. 배포 시스템은 TRD T4(확정, ADR-0002)·D-019 로 배포 테이블 코드를 쓰지 않는다.
- **반려되면 재작업할 방향**: (1)이면 `DomainImpactQueries` 에 두 테이블 조인을 더하고 테이블 존재 확인(방언별 카탈로그 조회)을 넣은 뒤 I12 와 §4.2 테스트를 바꾼다. 배포 시스템을 채우라면 `TB_MDM_DICT_SYSTEM` 네이티브 조회 한 개를 더한다.

### D2 — 04 원장이 없을 때 R10 과 MASTER 판정
- **질문**: `TB_MDM_CODE*` 와 서버 `CodeLookup` 이 없어 R10(카테고리 유효성)을 볼 수 없고 `MASTER` 는 늘 false 다. CODE 도메인(과 그 하위)의 저장을 어떻게 다루는가.
- **선택지**: (1) 판정할 수 없으면 거부한다. (2) R10 은 `CodeLookup` 이 있을 때만 거부하고 없으면 경고 W02, `MASTER` 가 든 테스트 케이스·미리보기 결과는 UNDECIDED(비교하지 않음) + W02. (3) R10 은 건너뛰되 MASTER 결과는 false 로 비교한다.
- **택한 것**: (2).
- **근거**: 수용 기준 2 는 CODE 도메인이 저장될 수 있어야 한다고 요구하는데 (1)·(3) 은 CODE 도메인과 그 하위의 `expect:true` 케이스를 전부 실패시킨다. TSK-04-01 §8 인계(dev 머지)가 "구현체가 아직 없으면 검사를 건너뛰거나 '확인 불가'로 표시하되 예외를 던지지 않는다"고 적었다.
- **반려되면 재작업할 방향**: (1)이면 `CodeCategoryValidator` 가 `CodeLookup` 부재 시 R10 을 내게 바꾸고, CODE 관련 테스트·E2E 를 TSK-06-01 이후로 미루거나 테스트 `CodeLookup` 을 주입하는 방식으로 바꾼다.

### D3 — 표준 칸을 엔진 `DOMAIN_STD` 보다 좁힐 것인가
- **질문**: 엔진 `DOMAIN_STD` 는 `MASTER_AT` 와 attr 모양 `MASTER` 를 받지만 화면 평가기는 평가하지 못한다(F14). 표준 칸에서 거부할 것인가.
- **선택지**: (1) 엔진 칸 그대로. (2) 이 작업에서 두 형태를 R02 로 더 거부한다.
- **택한 것**: (2).
- **근거**: 원천 02:77·176(spec prd-ref)이 표준 칸을 "화면 화이트리스트 + MASTER" 로 적는다. 엔진 칸 정의는 미승인 선행(TSK-03-02)이라 근거가 약하다. 표준식은 화면에서도 판정할 수 있어야 한다는 칸 분리 취지(02:179)에도 맞다.
- **반려되면 재작업할 방향**: `DomainExpressionCompiler` 의 추가 검사와 테스트 `R02_표준칸_MASTER_AT_는_거부한다` 만 지운다. R02 본 테스트(비즈니스 함수를 표준 칸에)는 그대로 남는다.

### D4 — 테스트 케이스 JSON 모양
- **질문**: 02 예시는 `{"value":0.1,"expect":true}` 뿐인데, 비즈니스식이 있는 도메인은 변수 값이 없으면 판정이 늘 실패하고 시안에는 메모 칸이 있다. 무엇을 저장하는가.
- **선택지**: (1) 원천 예시 그대로(값·기대). (2) `{value(문자열), expect, vars?, memo?}` 로 넓힌다.
- **택한 것**: (2).
- **근거**: 시안 테스트 케이스 그리드에 "메모" 칸이 있고, 02:180 은 요구 변수를 넣지 못하면 검증 실패로 처리하라고 하므로 비즈니스식 도메인의 케이스는 변수 값이 있어야 의미가 있다. 값을 문자열로 두는 것은 JSON 숫자가 double 로 읽혀 소수 판정이 흔들리는 것을 막는다. 칼럼은 JSON 이라 스키마 변경이 없다.
- **반려되면 재작업할 방향**: `DomainTestCases` 가 `vars`·`memo` 를 쓰지 않게 하고 숫자 값으로 저장한다. 비즈니스식 도메인의 케이스는 표준식만 평가하도록 러너를 바꾼다.

### D5 — 동시 수정 검사를 할 것인가, 무엇으로
- **질문**: `TB_MDM_DOMAIN` 에는 `ROW_VERSION` 이 없고 `VER` 은 감사 카운터다(D-034). 동시 수정을 어떻게 다루는가.
- **선택지**: (1) 검사하지 않는다(나중 저장이 이긴다). (2) 요청 `ver` 와 DB `VER` 을 비교해 다르면 MDM001. (3) 스키마에 `ROW_VERSION` 을 추가한다.
- **택한 것**: (2).
- **근거**: TRD §11 이 "편집 충돌은 409" 를 요구하고 MDM001 이 이미 있다. `VER` 은 수정마다 1 씩 오르는 값이라 읽기 비교에 쓸 수 있고, (3) 은 공유 테이블 스키마 변경이라 병렬 작업과 부딪친다. D-034 는 버전 테이블의 감사 칼럼 이름 충돌에 관한 결정이라 이 비교를 막지 않는다.
- **반려되면 재작업할 방향**: (1)이면 비교와 B5 를 지우고 E5 는 `page.route` 로 서버 오류를 흉내 낸다(§4.6 E5 대체 절차). (3)이면 Flyway 두 방언 + 엔티티 필드를 추가한다(번호는 커밋 직전 `origin/dev` 최신 + 1).

### D6 — 변경 분류와 "새 버전"·배포 순번
- **질문**: 02 는 좁히기·넓히기를 "새 버전"으로, 하위 트리 배포 순번 찍기로 처리한다. 버전 칼럼이 없고 배포는 보류다. 무엇을 구현하는가.
- **선택지**: (1) 도메인 버전 칼럼을 추가하고 순번도 찍는다. (2) 분류는 spec 의 세 구분(+신규)으로 계산·표시만 하고, 효과는 "값 정의 변경이면 하위 재검사"로 한정한다. 버전은 감사 `VER` 이 대신하고 `CHG_SEQ` 는 쓰지 않는다.
- **택한 것**: (2).
- **근거**: TSK-02-03 D3(버전은 감사 VER 과 즉시 반영 정책으로 갈음)과 TRD T4(확정)·D-019(배포 순번 코드 금지). spec 이 요구한 것은 분류 표시와 구조 변경 금지다. 좁히기와 넓히기는 처리가 같아(02:203-204) 방향을 가르지 않고 길이·소수 diff 에만 방향을 붙인다.
- **반려되면 재작업할 방향**: 버전 칼럼 마이그레이션과 `save` 4단계 순번 발급(`UPDATE … RETURNING`/`OUTPUT`, naming-dialect-rules §3 #1)을 추가하고, 식 방향 판정(AND 포함 관계)을 분류기에 더한다.

### D7 — 표준명 자동 제안과 용어 존재 검사
- **질문**: 02:70 은 도메인명을 용어 조합, 표준명을 약어 조합 자동 생성으로 적고 시안에도 "자동 제안"이 있다. 이번에 구현하는가.
- **선택지**: (1) 용어집 최장 일치 분해·약어 조합을 이 작업이 구현한다. (2) 이번에는 직접 입력 + 형식 검사(S06)만 하고 자동 제안·용어 존재 검사는 TSK-04-04 분해기가 생긴 뒤로 미룬다.
- **택한 것**: (2).
- **근거**: spec 요구사항 목록에 자동 생성이 없다. 분해·치환 기능은 TSK-04-04(병렬, 이 작업의 선행이 아님) 산출물이라 재사용할 수 없고 따로 만들면 중복 구현과 충돌이 생긴다.
- **반려되면 재작업할 방향**: TSK-04-04 머지 뒤 그 분해 서비스를 `validate` 에서 불러 표준명 제안·미등록 용어 경고를 더한다(화면 기본 속성 폼에 제안 버튼).

### D8 — 화면 설계 산출물을 몇 종 만드는가
- **질문**: RULE.md·Mes-Guide §4 개발 진입 가드·ADR-0003 D3 은 화면마다 5종(분석리포트·기능설계서·디자인설계서·BPMN설계서·정합체크)을 요구한다. MDM 화면은 As-Is 가 없다.
- **선택지**: (1) 만들지 않고 design.md 로 갈음한다. (2) 5종을 모두 만든다(As-Is 대신 원천 02·시안을 분석 대상으로). (3) 기능설계서 1종만 만든다.
- **택한 것**: (3). 산출물 [`docs/mdm/screens/domainMng/domainMng_기능설계서.md`](../../screens/domainMng/domainMng_기능설계서.md) 를 이 Design Phase 에서 작성해 커밋했다.
- **근거**: 팀장 지시(MDM 화면 기준, TSK-04-04 이슈에서 정함) + DEC-001 선례(`docs/ai-build-log/DEC-001_noticeMgmt-on-mls.md` 결정 2). As-Is 가 없어 분석리포트와 G1~G7 게이트가 성립하지 않는다. 1종으로 줄인 사실과 한계는 기능설계서 머리말과 §11.1 GAP-001 에 남겼다.
- 모듈 전체 규칙(MDM 화면 전부에 1종을 적용하는 것)은 팀장이 사람에게 확인받는다.
- **반려되면 재작업할 방향**: 나머지 4종(분석리포트·디자인설계서·BPMN설계서·정합체크)을 템플릿(`docs/guide/design/templates/`)대로 `docs/mdm/screens/domainMng/` 에 추가한다.

### D9 — 저장 거부의 오류 코드
- **질문**: 도메인 저장 거부를 어떤 오류 코드로 던지는가. `MdmErrorCode` 에 도메인용 코드가 없고, 병렬 작업이 같은 번호를 고를 수 있다.
- **선택지**: (1) 기존 코드 재사용(예: MDM010 확정 검사 실패). (2) `MdmErrorCode` 끝에 `DOMAIN_SAVE_REJECTED` 1개를 추가하고 세부는 R/S 이슈 코드로 싣는다. (3) `MdmErrorCode` 를 쓰지 않고 cactus `BusinessException` 을 직접 던진다.
- **택한 것**: (2).
- **근거**: `MdmErrors` 가 "MdmErrorCode 를 싣는 한 곳"이라는 선행 관례(TSK-01-03 B5)를 따른다. (1) 은 의미가 틀리다. 번호 경합은 커밋 직전 `origin/dev` 재확인 규칙(§3.10)으로 막는다.
- **반려되면 재작업할 방향**: (3)이면 enum 추가를 지우고 `BusinessException(ErrorCode.BUSINESS_ERROR, 요약 메시지, details)` 로 바꾼다. 테스트는 메시지·이슈 코드만 보므로 영향이 작다.

### D10 — 엔진 평가기 빈의 위치와 확장 방식
- **질문**: `MdmEvaluator` 빈을 어디에 두고 `CodeLookup`·`FunctionProvider` 를 어떻게 꽂는가.
- **선택지**: (1) `domainMng` 패키지 안에 이 화면 전용으로 둔다. (2) `common.engine` 에 공용 빈으로 두고 `@ConditionalOnMissingBean` + `ObjectProvider` 로 후속 작업이 조회 구현만 등록하게 한다.
- **택한 것**: (2).
- **근거**: 엔진 설계("평가기 한 개를 앱당 하나 두고 모든 API 가 공유", TSK-03-02)와 캐시 공유. 04-04·06·08 작업이 같은 평가기를 쓰게 되며, 화면 전용으로 두면 빈이 중복된다. 스캔되는 설정의 조건부 등록은 순서 보장이 없으므로(§3.7) 후속 작업은 평가기를 재사용하고 조회 구현 빈만 등록한다는 규칙을 함께 둔다.
- **반려되면 재작업할 방향**: 설정 클래스를 `dma.domainMng.service` 로 옮기고 조건부 등록을 뺀다.

### D11 — 저장 거부를 화면에 어떻게 전달하는가(B0 실측 뒤)
- **질문**: OASIS 서비스 예외는 `meta.message` 만 원문으로 가고 `meta.code` 는 S001 고정, `errors[]` 는 오지 않는다(§9.1). 거부 사유(R·S 코드)를 화면에 어떻게 보이는가.
- **선택지**: (1) 공유 `MdmErrors` 에 메시지 인자 오버로드를 더한다. (2) domainMng 안의 헬퍼가 `BusinessException(DOMAIN_SAVE_REJECTED.transport(), "도메인 저장 거부: R06 …; R08[id] …", details)` 를 직접 만든다. (3) 코드 없이 기본 메시지만 보인다.
- **택한 것**: (2) `DomainRejections`.
- **근거**: 설계가 "계약 파일은 늘리지 않는 쪽이 우선"이라 했고 `MdmErrors` 는 병렬 작업이 공유한다. details 모양은 `MdmErrors.of` 와 같아 나중에 오류 코드가 응답에 실리게 되면 그대로 쓸 수 있다. 화면은 사전 검사 목록을 `validate` 응답으로 따로 보이므로 메시지는 요약이면 충분하다.
- **반려되면 재작업할 방향**: (1)이면 `MdmErrors.of(code, issues, message)` 를 더하고 `DomainRejections.reject` 가 그것을 부르게 바꾼다. 테스트는 메시지·이슈 코드만 보므로 그대로 통과한다.

### D12 — 테스트 케이스 편집을 그리드 인라인 편집으로 할 것인가
- **질문**: 기능설계서는 테스트 케이스를 "그리드"로 적었다. 행 편집을 AgDataGrid 인라인 편집으로 할 것인가, form 컨트롤 표로 할 것인가. 단위(D-008)는 ComboBox 로 적혀 있으나 단위 목록 API 가 없다.
- **선택지**: (1) AgDataGrid 인라인 편집(`editable`·`cellEditor`). (2) shared form 컨트롤(`Input`·`Select`·`Button`) 표. 단위는 (a) 텍스트 입력 (b) TSK-04-02 단위 목록을 기다린다.
- **택한 것**: (2) + (a).
- **근거**: 케이스는 몇 행뿐이고 입력·기대·변수·메모·삭제가 한 행에 있어 폼 컨트롤이 접근성(aria-label)과 E2E 안정성이 좋다. 읽기 전용 목록은 모두 AgDataGrid 로 두었다. 단위 목록 API 는 병렬 작업(04-02) 산출물이라 지금 쓸 수 없고, 서버가 단위 원장 존재를 S06 으로 검사한다.
- **반려되면 재작업할 방향**: `DomainTestCaseGrid` 를 `AgDataGrid` + `editable`/`cellEditor: "select"`(기대) 로 바꾸고 E2E 의 케이스 입력 선택자를 셀 편집으로 바꾼다. 단위는 04-02 머지 뒤 `Select` + 단위 조회로 바꾼다.

### 9.5 Verify 변이 재확인

Verify Phase 에서 불변 규칙 I1~I19 의 변이 검증을 실행했다(I20 절차 규칙 제외, I14c 구조 제외).

| 변이 | 변이 내용 | 빨강 낸 테스트 | 되돌림 확인 |
|---|---|---|---|
| I17 | 화면 제목 `"도메인 관리"` → `"도메인 관리X"` | E2E 세 스펙 (E2~E6 등록·상속·미리보기 실패) | `/usr/bin/git diff --stat` = 0 |
| I1~I16, I18, I19 | Build §9.3 의 변이 목록(각각 RED 확인) | 각 테스트 클래스(Build 기록 참고) | Build 후 원상 복구 완료 |

**사용자 결정: 도커·Testcontainers 금지로 MSSQL 실측 생략** — Build Phase 에서 1회 실행해 40건 통과. Verify 에서 재실행하지 않음. 대신 SQL 문안 리뷰 (§9.6 참고).

**MSSQL SQL 문안 리뷰**:
- 재귀 CTE: RECURSIVE 키워드 없음(공통 문안) ✓
- 앵커·재귀부 칼럼 타입 일치 (`BIGINT`, `VARCHAR`) ✓
- 깊이 가드: `WHERE DEPTH < 50` (MAXRECURSION 100 대비) ✓

### 9.6 Verify 게이트 결과

| 게이트 | 결과 |
|---|---|
| 백엔드 `testAll` (로컬) | **1957 tests, 실패 0·오류 0**(Build 결과와 동일) |
| 프런트 `pnpm build:libs` | 성공 |
| m-mdm `vitest run` | **295 tests, 실패 0** (단, `tests/evalex-perf.test.ts` NFR-1 1건 — 환경 load average 60.67 51.15 45.28, 단독 재확인 3 pass 1 fail) |
| m-mdm `lint` | 통과 |
| `oasis-contract-check --module mdm` | ERROR 0, INFO 1 |
| E2E 기준선(3개 스펙, workers 1) | `mdm-domainMng` 3 + `mdm-shell-rbac-smoke` 4 + `mdm-sample-smoke` 1 = **8 passed** |
| E2E I17 변이(화면 제목 변경) | **RED**(변이 감지, E2~E6 실패) |
| 나머지 변이 I1~I16, I18, I19 | Build §9.3 기록 인용(모두 RED, 19개 불변 규칙 커버) |

**스모크 넷**: E1(메뉴 이동) + E2(목록·등록) + E5(오류 표시) + E6(영향도) 모두 통과. E3(상속·미리보기), E4(거부), E7(RBAC) 포함.

**수용 기준 6개 확인** (Build 테스트로 검증):
1. 상속 순환·길이·구조 저장 거부 — R07, R06, S01 서버 테스트 + E4 화면
2. CODE 도메인 체인 참조 — R09 테스트 + 양성 대조 (W02 경고)
3. 포털 메뉴 + E2E — E1~E7 + 스크린샷 커밋
4. 거부 조건 10종 — `DomainMngRejectConditionTest` 1:1 매핑
5. 하위 케이스 실패 시 롤백 — `DomainMngOasisFlowTest` B3 + B2 양성
6. 03·06 테이블 비어도 조회 — `DomainImpactQueriesSqliteTest` + E6 화면

**서버 프로세스 규칙** (I20 절차): 포트 18113(mcm), 18206(mdm), 15113(포털) 자기 포트 사용, PID 기록/종료 완료, be-run.sh·fe-run.sh·pkill 미사용 ✓

**load average 단독 재확인**: 60.67 51.15 45.28 (고부하 상태)에서 evalex-perf.test.ts 3 pass 1 fail → 환경 요인 확인 ✓

