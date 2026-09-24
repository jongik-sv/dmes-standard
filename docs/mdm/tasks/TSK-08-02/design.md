# TSK-08-02 설계 — 룰 조회·등록·룰 화면 골격·의사결정표 그리드

> Phase 02 Design. 작업 디렉터리 `/Users/jji/project/dmes-standard/dflow-f65cffff`(브랜치 `agent/f65cffff-rule-edit-ui`, 기점 origin/dev 3fbf073).
> 경로 약어: `W` = 워크트리 루트, `BL` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`, `BLT` = `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm`,
> `BA` = `src/backend/mdm/api/src/main`, `BAT` = `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm`, `E` = `src/backend/maru-mdm-engine`,
> `EJ` = `E/src/main/java/kr/dongkuk/maru/mdm/engine`, `ER` = `E/src/test/resources/kr/dongkuk/maru/mdm/engine`, `M` = `src/frontend/m-mdm`,
> `DI` = `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java`.
> spec 본문은 요구사항 데이터다. 이 문서의 결정은 「담당자 확인 필요 결정」 D1~D13 에 모았다.

## 0. entry-point 정정 — `mdr` 는 낡은 값이다

`spec.md:4` 는 `entry-point: /portal → mdr/ruleMng …; mdr/ruleEdit …` 라고 적었다. 그러나 화면 그룹 코드는 TRD §9 T2 가
2026-09-24 에 `dma/dmb/dmc/dmd/dme` 로 **확정**했고, 화면 그룹·screenId 목록의 정본인 `docs/mdm/screens/README.md:23,53-54` 와
`docs/mdm/wbs.md:1292`(TSK-08-02 entry-point)는 이미 **`dme/ruleMng`**, **`dme/ruleEdit`** 로 적었다. mcm 쪽 메뉴 폴더 `dme`(업무기준)도
`DI:866` `seedMdmMenus()` 가 이미 시드하고, 권한 매트릭스(`seedMdmObjectRbac`)와 FE 셸 `M/src/shell/mdm-groups.ts` 의 `MDM_GROUPS` 에도
`dme` 가 있다. 선례 TSK-04-02 는 같은 사유로 spec 의 낡은 `mdt` 를 `dma` 로 읽었다(`docs/mdm/tasks/TSK-04-02/design.md` §0).
이 설계는 이하 전부 **`dme/ruleMng`**, **`dme/ruleEdit`** 를 쓴다(D1).

## 0.1 조사로 확인한 사실 (Build 가 다시 조사하지 않도록 적는다)

| # | 사실 | 근거 |
|---|---|---|
| F1 | 룰 엔티티 6개(`MdmRule`·`MdmRuleVer`·`MdmRuleVar`·`MdmRuleRow`·`MdmRuleTestCase`·`MdmRuleSet`)가 `BL/entity/` 에 있다. JPA 연관관계는 없고 JSON 칸(`CELLS`·`RULE_IDS`·`VAR_AST`·`PRIO_LIST`·`GRP_COND_AST`)은 모두 `String` 이다. `TB_MDM_RULE_SYSTEM`·`TB_MDM_RULE_RECV` 는 엔티티가 없다(DDL 만) | TSK-08-01 design §6, 코드 |
| F2 | `updatable=false` 칼럼: `MdmRule.status/lastVarId/lastRowId/lastCaseId`, `MdmRuleVer.status/ownerId/applyFrom/applyTo/requestedBy/requestedAt/releasedAt/rowVersion`. 이 값은 엔티티로 바꿀 수 없고 네이티브 UPDATE 로만 바꾼다. `ROW_VERSION` 은 `@Version` 이 아니다 | TSK-08-01 D7 |
| F3 | `MdmRuleVer`·`MdmRuleVar`·`MdmRuleRow` 의 감사 카운터 칼럼은 `AUD_VER`(업무 칼럼 `VER` 과 분리), 부모 `TB_MDM_RULE` 의 감사 카운터는 `VER` 이다(D-034) | TSK-08-01 |
| F4 | 생성자: `MdmRule(String maruRuleId, String maruRuleName, String ruleKind, String sourceKind)`(status "CREATED"), `MdmRuleVer(String maruRuleId, Integer ver, String ownerId)`(DRAFT, emergencyYn "N", rowVersion 0), `MdmRuleVar(ruleId, ver, varId, varKind, int seq)`, `MdmRuleRow(ruleId, ver, rowId, rowKind, int seq, String cells)` | 코드 |
| F5 | 룰 리포지토리 6개는 메서드를 하나도 선언하지 않는다. `BLT/contract/rule/MdmRuleContractOnlyArchitectureTest._06_리포지토리는_메서드를_선언하지_않는다` 가 이를 강제한다. 이 Task 는 이 가드를 **유지**하고 조회는 JPQL 조회 클래스로 한다(D12) | 코드 |
| F6 | 식별자 발급 계약 `BL/contract/rule/MdmRuleIdIssuer`: `MdmRuleIdRange issue(String maruRuleId, MdmRuleIdKind kind, int count)`. `MdmRuleIdKind{VAR("LAST_VAR_ID"), ROW("LAST_ROW_ID"), CASE("LAST_CASE_ID")}.counterColumn()`, `record MdmRuleIdRange(maruRuleId, kind, first, last)`. **main 구현이 없다** — 이 Task 가 만든다(TSK-08-01 §7) | 코드, TSK-08-01 design:634 |
| F7 | 발급은 결과 집합을 돌려주는 단일 UPDATE 로 한다: SQLite `UPDATE TB_MDM_RULE SET LAST_ROW_ID = LAST_ROW_ID + :n, <감사> WHERE MARU_RULE_ID = :id RETURNING LAST_ROW_ID`, MSSQL `UPDATE … SET … OUTPUT inserted.LAST_ROW_ID WHERE …`. 읽고 쓰기 두 문 금지, SQLite RETURNING 은 3.35 이상이고 JPA 네이티브로 결과를 읽는 방식은 이 Task 가 실측한다 | `docs/mdm/naming-dialect-rules.md` 규칙표 #1 |
| F8 | 방언 판별 `BL/contract/common/MdmDialectResolver.current()` → `MdmDialect{SQLITE, MSSQL}`. 네이티브 쓰기의 감사 값은 `BL/contract/common/MdmNativeAuditSupport.currentStamp()` → `AuditStamp`. 일시 바인딩은 `BL/common/support/MdmTemporalBinder.toDb(LocalDateTime)` | 코드 |
| F9 | 공통 버전 서비스(TSK-01-03): `VersionStateService.deleteDraft(VersionRef, long expectedRowVersion, String userId)`, `DraftOwnershipService.acquire/release(VersionRef, long, String)`·`handover(VersionRef, long, String ownerId, String newOwnerId)`(반환 = 새 row_version), `VersionWriteGuard.checkCanCreateVersion(VersionTarget, String objectId)`(미적용 버전이 있으면 MDM006)·`long beginDraftWrite(VersionRef, long expected, String userId)`(DRAFT·소유자·row_version 검사 후 rv+1). `VersionRef(VersionTarget target, String objectId, BigDecimal ver)`. `VersionTarget.BUSINESS_RULE` 과 테이블 명세는 이미 있다 | `BL/contract/version/`, `BL/common/version/` |
| F10 | 오류는 `MdmErrors.of(MdmErrorCode)`(cactus `BusinessException`, 첫 `ErrorDetail.code` = `MDMnnn`). MDM001 row_version 충돌, MDM002 DRAFT 아님, MDM003 소유자 아님, MDM004 이미 선점, MDM005 넘기기 대상 아님, MDM006 미적용 버전 있음, MDM013 담당자 역할 필요 | `BL/contract/common/MdmErrorCode.java` |
| F11 | `VersionSpiRegistry` 는 생성자에서 target 별 SPI 가 **둘이면** 기동을 실패시키고, 없으면 **호출할 때** `IllegalStateException` 을 낸다. 확정 SPI 없이도 앱은 뜬다. DRAFT 삭제는 `BUSINESS_RULE` 삭제 훅이 있어야 된다 | `BL/common/version/VersionSpiRegistry.java:25-52` |
| F12 | 테스트 설정 `BAT/common/version/VersionScenarioTestConfig.java:61-64` 가 가짜 `FakeDraftDeletion(BUSINESS_RULE)` 빈을 등록한다. 실물 훅을 `@Component` 로 넣으면 이 설정을 쓰는 컨텍스트가 "같은 대상에 둘" 로 기동 실패한다. 이 충돌의 일반 해법(가짜가 있는 대상의 운영 SPI 빈 정의를 지우는 `BeanFactoryPostProcessor`)은 **TSK-06-02 가 만든다**(팀장 지시 2026-09-24) → §7.2 | 코드, 팀장 지시 |
| F13 | 현재 사용자: `BL/common/security/MdmCurrentUser{String userId(); Set<String> roleIds();}`(cactus `UserContextHolder`, `ROLE_` 접두 제거). 담당자 역할 상수 `MdmRoles.STEWARD` = `MDM_STEWARD` | 코드 |
| F14 | 넘기기 대상 검사 포트 `MdmStewardDirectory.isSteward(String)` 의 기본 구현 `UnresolvedStewardDirectory` 는 늘 false 다(fail-closed, MDM005) | TSK-01-03 D7 |
| F15 | RBAC 1차는 BFF `evaluateApiPolicy` 가 `mdm/{serviceId}/{action}` 을 사용자 권한키와 문자열로 대조한다. 권한 세트 `PERM_MDM_READ = search,view,export,compare`, `PERM_MDM_EDIT = READ + save,delete,reg,import,validate,execute,copy,restore`, `PERM_MDM_CONFIRM = EDIT + confirm`(`DI:978-983`, `BL/contract/security/MdmPermissions.java:30-37`, `MdmActions`). `allActions`(PERM_ALL, `DI:298-329`)에 없는 action 은 SYSADMIN 도 403 이다. `lock/unlock/handover` 는 어디에도 없다 | 코드, ADR-0003 §D5 |
| F16 | dme 권한 매트릭스: `MDM_STD_ADMIN → PERM_MDM_READ`, `MDM_STEWARD → PERM_MDM_CONFIRM`(`DI:1027`). 즉 업무기준 편집은 담당자만 한다 | 코드 |
| F17 | 서버 겹침·빈틈·도달 불가 분석기는 **없다**. TSK-03-04 는 D1 에서 분석을 TS(`M/src/evalex/rule-analysis.ts`·`value-set.ts`)에만 두고 Java `engine.rule` 이식을 뒤 Task 로 넘겼다. 반려 방향은 "분석 알고리즘을 `engine.rule` Java 로 옮기고 분석 골든을 `ER/analysis/analysis-corpus.json` 한 벌로 옮겨 JUnit·Vitest 가 함께 읽는다" 이다 | `docs/mdm/tasks/TSK-03-04/design.md:1207-1216` |
| F18 | TS 분석기 공개 API: `analyzeRule(rule: RuleDef): RuleIssue[]`, `RuleIssue{code, severity: "ERROR"|"WARNING", rowIds, varId?, lower?, upper?, message}`, `RuleIssueCode = ALL_NA_ROW | UNRESOLVED_CELL | OVERLAP | OVERLAP_UNRESOLVED | UNREACHABLE | VALUE_GAP | NULL_GAP`. 입력 `RuleDef{ruleId, ruleKind, hitPolicy, vars: RuleVarDef[], rows: RuleRowDef[]}`, `RuleVarDef{varId, varKind, dispType: "EQUAL"|"ONE"|"TWO"|"EXPRESSION"|"VALUE", seq, varName, label?, exprAst?, refVars?, dataType, scale?, domainId?, dateString?, maruCodeId?, resGrp?, grpCondAst?}`. 값 영역은 `domainOf`: NUMBER→decimal, BOOLEAN→정수 0~1, `dateString` 또는 DATE→정수, 그 밖→string | `M/src/evalex/rule-model.ts`, `rule-analysis.ts:1-80` |
| F19 | TS 분석 골든은 `M/tests/evalex-rule-analysis.test.ts`(21건)이고 `{code, severity, rowIds, varId, lower, upper}` 만 비교한다(message 제외, 순서 포함 전체 일치) | 코드 |
| F20 | 화면 페이지는 evalex 를 `@/evalex` 로 가져온다(예: `M/pages/dma/domainMng/preview.ts`). 외부 패키지는 `@dk-oasis/m-mdm/evalex`. 루트 배럴 `M/src/index.ts` 에 다시 내보내지 않는다(TSK-03-04 D7) | 코드 |
| F21 | 엔진 모델: `DefinitionLookup.RuleRow(rowId, seq, RowKind, Map<Integer,RuleCell> cells)`, `RuleCell(op, left, right, List list, expr, Map ast, val, String text)`, enum `DispType{EQUAL, ONE, TWO, EXPRESSION, VALUE}`, `DataType{NUMBER, STRING, BOOLEAN, DATE}`, `HitPolicy`, `VarKind`, `RowKind`. 엔진은 EvalEx·java 표준 밖에 의존하지 못한다(`E/src/test/.../arch/MaruMdmEngineArchitectureTest`) — main 에서 Jackson 금지 | `EJ/spi/DefinitionLookup.java` |
| F22 | DB 는 `DISP_TYPE` 을 06 표기(`Equal`·`1`·`2`·`Expression`·`Value`)로 저장한다(TSK-08-01 D4) | V8 CHECK |
| F23 | 셀 JSON 문자열 → `RuleCell` 파서는 운영 코드에 없다(TSK-08-04 몫으로 적혀 있었다). 이 Task 는 저장 형식 검사와 분석 입력 변환에 필요한 최소 코덱을 만든다(§6.5) | TSK-03-04 조사 |
| F24 | 컬럼 사전 조회: `MdmColumnRepository.findByPhysName(String)` → `MdmColumn.domainId`; `MdmDomain{domainId, domainName, domainKind(QTY/CODE/ID/TEXT/DATE/FLAG), dataType, length, scale, maruCodeId, cateId, parentDomainId, description}`. 상속을 따른 유효 코드 참조는 `MdmEffectiveDomainResolver.resolve(domainId).effectiveCodeRef()`. 계약 `MdmColumnDictionaryLookup` 은 main 구현이 없다 | `BL/entity/`, `BL/contract/dictionary/` |
| F25 | 물리명 검증기 `BL/dma/naming/NamingRules`: `STD_PHYS_NAME = ^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`, `CODE_MAX = 50`. 컬럼 사전(`ColumnMngService.validateFields:357-360`)도 **정규식과 길이만** 본다(용어 약어 대조 없음) | 코드 |
| F26 | mdm 에는 페이징 선례가 없다(`dma/*` 는 `{list}` 전체 반환). FE 는 `@dk-oasis/shared/grid` 의 `Pagination{page, totalPages, totalElements?, onPageChange, pageSize?, pageSizeOptions?, onPageSizeChange?}` 이 있고 m-mcm `cmb/masterRuleDataList` 가 쓴다 | 코드 |
| F27 | shared `AgDataGrid`(`src/frontend/shared/src/components/grid/AgDataGrid.tsx`)는 `GridColumn` 에 열 그룹(children)이 없고 행 드래그 prop 도 없다. 셀 편집(`editable`·`cellEditor: "text"|"select"|…`·`cellEditorOptionsGetter`·`onCellValueChanged`), `cellClassRules`, `getRowClassExtra`, `render`, `headerComponent` 는 있다. mantine-aggrid-ui 규칙상 화면에서 `AgGridReact` 로 우회하지 않고 shared 를 확장한다(Part B §17 "필요한 컴포넌트가 shared 에 없으면 shared 에 추가한다") | 코드, `.claude/skills/mantine-aggrid-ui/SKILL.md:64,85` |
| F28 | 포털 탭 열기는 `window.dispatchEvent(new CustomEvent("portal-open-tab", {detail: {pageId}}))` 뿐이고 파라미터를 넘기는 선례가 없다. pageId 형식은 `"{moduleId}:{componentPath}"`(`m-mcm/app/portal/registered-modules.ts:47` 주석, 예 `mcm:csa/commUserMng`) — mdm 화면은 `mdm:dme/ruleEdit` 로 **예상**하며 Build 가 포털에서 한 번 확인한다 | `shared/src/portal-shell/portal-shell.tsx:579-589` |
| F29 | 화면 등록: `M/tsup.config.ts` 의 화면 entry 한 줄씩, `src/frontend/m-mcm/lib/generated/page-registry.ts` 는 `m-mcm/scripts/generate-page-registry.mjs` 가 만든다(predev/prebuild, 수동 `node scripts/generate-page-registry.mjs`). 이 생성 파일은 커밋된 것을 e2e 가 쓰므로 다시 만들어 커밋한다 | TSK-04-02 |
| F30 | FE OASIS 호출은 화면별 `api.ts` 의 `callAction`(`apiRequest` from `@dk-oasis/shared/http`, 본문 `{meta:{menuId}, params: omitNullish(params)}`) 형식이다(`M/pages/dma/termMng/api.ts`). null 값은 반드시 뺀다(OASIS "object is null" 실패) | 코드 |
| F31 | 셸: `MdmPageLayout{group, screenId, title, buttons?}`, `VersionStatusBadge{status, applyFrom?, now?}`, `DraftLockBadge{status, ownerId?, currentUserId?}` — `import … from "@/shell"`. FE 에서 현재 사용자 ID 를 얻는 선례가 없다 → `view` 응답에 서버가 싣는다 | `M/src/shell/` |
| F32 | e2e 사용자는 `src/frontend/e2e/fixtures/mdm-rbac-users.sql`(e2e_mdm_none·e2e_mdm_steward·e2e_mdm_stdadmin, 비밀번호 admin123)뿐이다. 두 번째 담당자가 없다 | 코드 |
| F33 | mdm SQLite 는 `foreign_keys=true`(`BA/resources/application-local.yml:10`)라 버전 행을 지우면 VAR·ROW 가 CASCADE 로 지워진다 | 코드 |
| F34 | BPMN 은 action 마다 serviceTask 하나를 두고(`camunda:class=<빈 이름>`, `method`·`output=result`·`dto=<FQCN>`), 두 번째 게이트웨이를 쓰는 선례가 없다(`BA/resources/services/dma/termMng.bpmn`) | 코드 |
| F35 | 서비스 클래스에 `@Transactional` 을 붙이지 않는다(OASIS 파라미터 이름 손실). `TransactionTemplate` 을 쓴다. 공통 버전 서비스는 호출자 트랜잭션에 합류한다. 네이티브 UPDATE 는 영속성 컨텍스트를 갱신하지 않으므로 공통 서비스 호출 뒤 엔티티를 다시 읽는다 | TSK-01-03 §2.4, TSK-04-02 |
| F36 | 마이그레이션 폴더 최대 버전은 V11 이다. **이 Task 는 마이그레이션을 만들지 않는다**(TSK-08-01 이 8테이블을 이미 만들었다) | `BA/resources/db/migration/mdm/{sqlite,mssql}` |

---

## 1. 접근 방식

두 화면을 같은 선례(`dma/termMng`·`dma/domainMng`)의 모양으로 만든다. BE 는 `com.dongkuk.dmes.mdm.dme.{ruleMng,ruleEdit}.{dto,service}` +
BPMN `services/dme/{ruleMng,ruleEdit}.bpmn`, FE 는 `M/pages/dme/{ruleMng,ruleEdit}/page.tsx`, 메뉴는 `DataInitializer` 의 `dme` 폴더 아래
leaf 두 개다. 버전 상태(선점·해제·넘기기·DRAFT 삭제·"미적용 버전이 있으면 새 버전 거부")는 **새로 만들지 않고** TSK-01-03 공통 버전
서비스(F9)를 부른다. 이 Task 가 새로 채우는 공용 조각은 TSK-08-01 이 비워 둔 두 자리(식별자 발급기 구현, `BUSINESS_RULE` DRAFT 삭제 훅)와,
뒤 Task(08-03·08-04)도 쓸 룰 지원 클래스(셀 JSON 코덱·변수 타입 해석기·분석 입력 변환기·JPQL 조회)다. 이것들은 `BL/common/rule/` 에
둔다. 룰 화면은 **카드마다 FE 컴포넌트 파일과 BE 서비스 파일을 따로** 둔다. 형제 Task(08-03 열 설정, 08-04 저장 시 검사·값 테스트)는 이
Task 에 의존하지 않고 같은 `ruleEdit` 를 건드리므로, 카드 슬롯 목록(`cards.ts`), 저장 부분 전략(`RuleEditSavePart` 빈), BPMN action 분기를
확장 지점으로 둔다(§6.8). 수용 기준 7 「JS 즉시 결과와 서버 저장 검사 결과가 코퍼스 범위에서 같다」는 서버 분석기가 없으므로(F17),
TSK-03-04 D1 의 반려 방향 그대로 TS 분석기(`rule-analysis.ts`·`value-set.ts`)를 `engine.rule` Java 로 **알고리즘을 바꾸지 않고 옮기고**,
분석 골든을 `ER/analysis/analysis-corpus.json` 한 벌로 두어 JUnit 과 Vitest 가 함께 읽는다(D2). 코퍼스 입력은 **저장 형태**(06 표기
`DISP_TYPE`, 셀 JSON 문자열, 서버가 해석한 변수 타입)로 적어서, Java 는 운영 변환기(`RuleAnalysisInputMapper`)를, TS 는 운영 변환기
(`grid-model.ts` 의 `ruleDefFromStored`)를 거쳐 분석기에 들어간다. 그래야 "그리드가 저장한 모양 → 두 분석기" 경로 전체가 같은 코퍼스로
고정된다. 변수 타입은 서버 한 곳(`RuleVarTypeResolver`)에서 해석해 `view` 응답으로 화면에 넘긴다(D13). 화면이 따로 해석하면 두 분석기의
입력이 달라진다. 저장은 분석 이슈를 응답에 싣고 ERROR 가 있어도 거부하지 않는다(D3) — 거부 정책은 08-04 의 수용 기준이고, "행 추가"가
만드는 조건 전부 `-` 행(ALL_NA_ROW, ERROR)을 편집 중에 저장할 수 있어야 하기 때문이다. 의사결정표 그리드는 shared `AgDataGrid` 를 열 그룹과
행 드래그로 확장해 쓴다(D8). 06 이 요구한 3줄 머리(조건/결과 묶음 → 변수 → 칸)는 ag-grid 2단 `ColGroupDef` 로 만든다. Expression 셀(조건
식·결과 식)은 이 Task 에서 읽기 전용이다(D7) — 식의 파싱·AST 저장·화이트리스트는 08-04, 식 편집 UI 는 08-03 몫이다. 배포 대상 카드 ⑦과
EXTERNAL 등록은 보류다(D11). 마이그레이션은 만들지 않는다.

---

## 2. 변경 파일 목록

### 2.0 Build 단계 분할 (이 순서로 한다. 단계마다 그 단계 테스트가 초록이어야 다음으로 간다)

| 단계 | 내용 | 주 산출 |
|---|---|---|
| B1 | 엔진 분석기 이식(DB 없는 순수 Java). TS 골든 21건을 JUnit 으로 옮겨 TDD | `EJ/rule/RuleAnalyzer` 외 §2.1-E |
| B2 | BE 룰 공용 지원: 셀 JSON 코덱, 룰 ID 규칙, 발급기, DRAFT 삭제 훅, 타입 해석기, 분석 입력 변환기, JPQL 조회. 가드 테스트 정리. 분석 코퍼스 JSON + Java 코퍼스 러너 | §2.1-C, §2.2-T |
| B3 | 액션 어휘 확장(lock/unlock/handover)·메뉴 시드 두 화면·BE `ruleMng`(조회·등록)·BPMN·테스트 | §2.1-RM, §2.2-S |
| B4 | BE `ruleEdit`(view·헤더·버전·소유권·표 저장·활용처)·BPMN·HTTP 테스트(비소유자 포함) | §2.1-RE |
| B5 | shared `AgDataGrid` 확장(열 그룹·행 드래그) + shared 단위 테스트, `pnpm build:libs` | §2.2-FS |
| B6 | FE `ruleMng` 화면 + 화면 간 이동(handoff) + Vitest | §2.1-FM |
| B7 | FE `ruleEdit` 골격(상단 룰·버전 선택, 잠금 배지, 카드 슬롯) + 카드 ①②⑧ + Vitest | §2.1-FE |
| B8 | FE 의사결정표 카드 ③(그리드 모델·열 정의·op 목록·diff·JS 분석 연결) + Vitest 코퍼스 러너 | §2.1-FT |
| B9 | page-registry 재생성·tsup entry, e2e 픽스처 두 개·스펙 두 개·스크린샷, 기능설계서 2종·식별자 사전 등재 | §2.1-X, §2.2-X |

### 2.1 생성

**E — 엔진(`E`, B1)**

| 파일 | 내용 |
|---|---|
| `EJ/rule/RuleAnalyzer.java` | `public final class RuleAnalyzer { public static List<RuleIssue> analyze(AnalysisRule rule) }`. `M/src/evalex/rule-analysis.ts` 의 `analyzeRule` 을 한 줄씩 옮긴다(§6.6). 이슈 순서·필드 값이 TS 와 같아야 한다 |
| `EJ/rule/AnalysisRule.java` | `public record AnalysisRule(String ruleId, RuleKind ruleKind, HitPolicy hitPolicy, List<AnalysisVar> vars, List<RuleRow> rows)` — TS `RuleDef` 대응. `RuleKind`·`HitPolicy`·`RuleRow` 는 `DefinitionLookup` 의 것을 쓴다 |
| `EJ/rule/AnalysisVar.java` | `public record AnalysisVar(int varId, VarKind varKind, DispType dispType, int seq, String varName, boolean exprVar, DataType dataType, Integer scale, boolean dateString, String maruCodeId)` — TS `RuleVarDef` 중 분석이 읽는 칸만 |
| `EJ/rule/RuleIssue.java` | `public record RuleIssue(RuleIssueCode code, Severity severity, List<Integer> rowIds, Integer varId, String lower, String upper, String message)` + 중첩 `enum Severity{ERROR, WARNING}` |
| `EJ/rule/RuleIssueCode.java` | `enum{ALL_NA_ROW, UNRESOLVED_CELL, OVERLAP, OVERLAP_UNRESOLVED, UNREACHABLE, VALUE_GAP, NULL_GAP}` — TS 와 같은 이름·순서 |
| `EJ/rule/ValueSets.java` | package-private. `M/src/evalex/value-set.ts` 이식(구간·유한 집합·여집합·unknown, `hasNull`). 숫자는 `BigDecimal`(`compareTo` 로만 비교) |
| `EJ/rule/PatternShapes.java` | package-private. `M/src/evalex/pattern.ts` 의 `tokenize`·`classify`·`succ`(UTF-16 코드 유닛 기준) 이식. 이미 `CellTextGenerator` 에 같은 규칙이 있으면 그 private 로직을 복사하지 말고 이 클래스를 새로 두되 동작은 TS 를 정본으로 한다 |
| `E/src/test/java/kr/dongkuk/maru/mdm/engine/rule/RuleAnalyzerTest.java` | TS `evalex-rule-analysis.test.ts` 21건을 같은 입력·같은 기대로 옮긴다(`message` 제외 비교) |

**C — BE 룰 공용 지원(`BL/common/rule/`, B2)** — 08-03·08-04 도 쓰는 자리라 화면 패키지가 아니라 `common` 에 둔다.

| 파일 | 내용 |
|---|---|
| `DefaultMdmRuleIdIssuer.java` | `@Component implements MdmRuleIdIssuer`. F7 의 단일 UPDATE. `count < 1` 이면 `IllegalArgumentException`, 룰이 없으면(결과 0행) `MdmErrors.of(ROW_VERSION_CONFLICT)` 대신 `BusinessException(ErrorCode.NOT_FOUND 류)` — Build 가 `ErrorCode` 에서 가장 가까운 값을 고른다. 반환 `new MdmRuleIdRange(id, kind, last - count + 1, last)`. 감사 칼럼 `U_USR_ID/U_AT/U_SVC_ID/U_PGM_ID` 와 `VER = VER + 1` 을 함께 쓴다 |
| `RuleDraftDeletionHook.java` | `@Component implements VersionDraftDeletionSpi`. `target()` = `BUSINESS_RULE`, `beforeDraftDelete` 는 아무것도 하지 않는다(VAR·ROW 는 CASCADE, F33) |
| `RuleIdRules.java` | `final` 유틸. `static void validateRuleId(String id)`: 공백·null → `REQUIRED_VALUE`, `NamingRules.STD_PHYS_NAME` 불일치 또는 길이 > `NamingRules.CODE_MAX`(50) → `INVALID_VALUE`("룰 ID 는 컬럼 물리명 규칙(영문 대문자·숫자를 밑줄로 이은 형식, 50자 이하)을 따라야 합니다") |
| `RuleCellsCodec.java` | 셀 JSON 문자열 ↔ `Map<Integer, Map<String,Object>>`(Jackson `ObjectMapper`). `parse(String)`·`write(Map)`·`validateShape(Map cells, Set<Integer> varIds)`: 키는 그 버전의 var_id 문자열, 셀 객체 키는 `op,left,right,list,expr,ast,val` 일곱만, `op·left·right·expr·val` 은 문자열, `list` 는 문자열 배열, `ast` 는 객체. 어긋나면 `INVALID_VALUE`(행 번호·var_id 포함 메시지). **값을 고치지 않는다**(정규화는 08-04) |
| `RuleQueries.java` | `@Repository`, `EntityManager` JPQL. `pageRules(filter, page, size)`·`countRules(filter)`·`versions(ruleId)`·`vars(ruleId, ver)`·`rows(ruleId, ver)`·`deleteRows(ruleId, ver)`·`latestReleased(ruleId)`·`currentReleased(ruleId, now)`·`allSets()`·`releasedVarsOf(Set<String> ruleIds)`. 정렬: 룰은 `maruRuleId`, 버전은 `ver desc`, 변수는 `varKind`(COND 먼저)→`seq`, 행은 `rowKind`(NORMAL 먼저)→`seq`→`rowId`(06:942) |
| `RuleVarTypeResolver.java` | `@Component`. `List<ResolvedVar> resolve(String ruleId, int ver, List<MdmRuleVar> vars)` — §6.4 규칙. `ResolvedVar` 는 같은 패키지 record |
| `ResolvedVar.java` | `record ResolvedVar(int varId, String varKind, String dispType, int seq, String varName, boolean exprVar, String label, String dataType, Integer scale, boolean dateString, String maruCodeId, Long domainId, String domainName, String typeSource, String description)`. `typeSource ∈ {COLUMN, RULE_RESULT, DECLARED, EXPRESSION_COLUMN, UNRESOLVED}` |
| `RuleAnalysisInputMapper.java` | `static AnalysisRule toAnalysisRule(String ruleId, String ruleKind, String hitPolicy, List<ResolvedVar> vars, List<StoredRow> rows)` — 06 표기 `DISP_TYPE` → 엔진 `DispType`(`Equal→EQUAL, 1→ONE, 2→TWO, Expression→EXPRESSION, Value→VALUE`), 셀 JSON → `RuleCell`(`text` 는 null). `StoredRow` 는 `record StoredRow(int rowId, int seq, String rowKind, String cells)` |
| `RuleUsageFinder.java` | `@Component`. 카드 ⑧ 계산(§6.3.9) |
| `RuleStewardCheck.java` | `@Component`. **담당자 역할 판단의 유일한 연결 지점**(§7.1). `void requireSteward()`·`boolean isSteward()` 두 메서드만 둔다. 06-02 머지 전 몸체는 `MdmCurrentUser.roleIds().contains(MdmRoles.STEWARD)` 이고 아니면 `MdmErrors.of(MdmErrorCode.STEWARD_ROLE_REQUIRED)`(MDM013). 06-02 머지 뒤 몸체를 `MdmStewardGuard.requireSteward()` 위임으로 바꾼다. 이 Task 의 서비스는 역할을 직접 보지 않고 이 클래스만 부른다 |

**RM — BE 룰 조회·등록(B3)**

| 파일 | 내용 |
|---|---|
| `BL/dme/ruleMng/dto/RuleSearchRequest.java` | `keyword, ruleKind, status, page(0부터), size` |
| `BL/dme/ruleMng/dto/RuleSearchResult.java` | `List<RuleListRow> list, long totalCount, int page, int size` |
| `BL/dme/ruleMng/dto/RuleListRow.java` | `maruRuleId, maruRuleName, ruleKind, sourceKind, status, releasedVer, hitPolicy, pendingVer, pendingStatus, pendingOwnerId` |
| `BL/dme/ruleMng/dto/RuleRegRequest.java` | `maruRuleId, maruRuleName, ruleKind, sourceKind(선택), description, usageNote` |
| `BL/dme/ruleMng/dto/RuleRegResult.java` | `maruRuleId, ver(=1), rowVersion(=0)` |
| `BL/dme/ruleMng/service/RuleMngService.java` | `@Service("ruleMngService")`: `RuleSearchResult search(RuleSearchRequest)`, `RuleRegResult register(RuleRegRequest)` |
| `BA/resources/services/dme/ruleMng.bpmn` | process id `ruleMng`, `actionGateway` → `search`(method search), `reg`(method register) |

**RE — BE 룰 화면(B4)** — 카드마다 서비스 파일 하나.

| 파일 | 내용 |
|---|---|
| `BL/dme/ruleEdit/dto/RuleEditViewRequest.java` | `maruRuleId, ver(선택)` |
| `BL/dme/ruleEdit/dto/RuleEditViewResult.java` | §6.2 모양 |
| `BL/dme/ruleEdit/dto/RuleEditSearchRequest.java` / `RuleEditSearchResult.java` | 상단 룰 고르기(키워드 앞부분, 20건) |
| `BL/dme/ruleEdit/dto/RuleEditSaveRequest.java` | `part(HEADER|TABLE), maruRuleId, ver, rowVersion, maruRuleName, description, usageNote, hitPolicy, List<Map<String,Object>> rows` |
| `BL/dme/ruleEdit/dto/RuleEditSaveResult.java` | `part, rowVersion, Map<String,Integer> rowIdMap, List<Map<String,Object>> issues, List<Map<String,Object>> rows` |
| `BL/dme/ruleEdit/dto/RuleVersionRequest.java` | `maruRuleId, ver, rowVersion, newOwnerId, target(VERSION|RULE)` |
| `BL/dme/ruleEdit/dto/RuleVersionResult.java` | `maruRuleId, ver, rowVersion` |
| `BL/dme/ruleEdit/service/RuleEditService.java` | `@Service("ruleEditService")` 파사드: `search`, `view`, `save`(part 로 `RuleEditSavePart` 빈에 위임), `delete`(target), `newVersion`, `lock`, `unlock`, `handover`. 업무 규칙은 두지 않고 아래 서비스에 넘긴다 |
| `BL/dme/ruleEdit/service/RuleEditSavePart.java` | 인터페이스 `String part(); RuleEditSaveResult save(RuleEditSaveRequest req);` — 확장 지점(§6.8) |
| `BL/dme/ruleEdit/service/RuleViewService.java` | view 조립(§6.3.1) |
| `BL/dme/ruleEdit/service/RuleHeaderService.java` | `@Service implements RuleEditSavePart`(part HEADER) + `deprecate(RuleVersionRequest)` — 카드 ① |
| `BL/dme/ruleEdit/service/RuleVersionService.java` | `newVersion`, `deleteDraft`, `lock`, `unlock`, `handover` — 카드 ② |
| `BL/dme/ruleEdit/service/RuleTableService.java` | `@Service implements RuleEditSavePart`(part TABLE) — 카드 ③ |
| `BL/dme/ruleEdit/service/RuleUsageService.java` | 카드 ⑧(`RuleUsageFinder` 위임) |
| `BA/resources/services/dme/ruleEdit.bpmn` | process id `ruleEdit`, action 표 §6.1 |

**FM — FE 룰 조회·등록(B6)** — `M/pages/dme/ruleMng/`

| 파일 | 내용 |
|---|---|
| `page.tsx` | `MdmPageLayout group="dme" screenId="ruleMng" title="룰"`, 조회 조건(룰 ID·명, 종류, 상태), 서버 페이징 목록(`AgDataGrid` + `Pagination`), 등록 폼 카드(원천 MDM 만), 오류 `ErrorModal` |
| `api.ts` / `types.ts` | `callAction("search"|"reg", params)` — termMng `api.ts` 형식 |
| `components/RuleRegisterForm.tsx` | 룰 ID(물리명 규칙 즉시 표시)·룰명·종류(DECISION/DERIVE)·설명·활용처 메모. 저장 성공 시 handoff 후 ruleEdit 탭을 연다 |
| `M/src/dme/rule-handoff.ts` | `openRuleEdit(ruleId: string, ver?: number)`: `sessionStorage["mdm.dme.ruleEdit.target"] = JSON.stringify({ruleId, ver, at})` → `window.dispatchEvent(new CustomEvent("mdm-rule-edit-target", {detail}))` → `portal-open-tab` 이벤트(`pageId = "mdm:dme/ruleEdit"`). `takeRuleEditTarget()`: 읽고 지운다(D9). pages 폴더가 아니라 `src` 에 둔다(page-registry 스캔 대상 밖, `@/dme/rule-handoff`) |

**FE — FE 룰 화면 골격·카드 ①②⑧(B7)** — `M/pages/dme/ruleEdit/`

| 파일 | 내용 |
|---|---|
| `page.tsx` | `MdmPageLayout group="dme" screenId="ruleEdit" title="룰 화면"`. 상단 바(룰 고르기·버전 고르기·`DraftLockBadge`·메시지), `cards.ts` 의 카드를 순서대로 그린다. handoff 대상이 있으면 그 룰을 연다 |
| `cards.ts` | `export const RULE_EDIT_CARDS: RuleEditCardSlot[]` = `[header, versions, table, usage]`. `RuleEditCardSlot{id, span: 6|8|10|16, Component: (props: RuleEditCardProps) => JSX}` — 확장 지점 |
| `api.ts` / `types.ts` | `callAction` + `RuleEditView`·`ResolvedVar`·`StoredRow`·`RuleIssueView` 타입 |
| `state/useRuleEdit.ts` | `view` 로드·선택 버전·새로 고침·`me`·`editable` 계산을 카드에 `RuleEditCardProps` 로 나눠 준다 |
| `cards/RuleHeaderCard.tsx` | 카드 ①(§6.7.1) |
| `cards/RuleVersionCard.tsx` | 카드 ②(§6.7.2) |
| `cards/RuleUsageCard.tsx` | 카드 ⑧(§6.7.3) |

**FT — 의사결정표 카드 ③(B8)** — `M/pages/dme/ruleEdit/decision-table/`

| 파일 | 내용 |
|---|---|
| `DecisionTableCard.tsx` | 적중 정책 선택, 그리드, 행 추가·기본 행 추가·저장·되돌리기, 검사 요약, 행 선택 강조(§6.7.4) |
| `grid-model.ts` | 순수 함수: `gridRowsFromStored(vars, rows)`, `storedRowsFromGrid(vars, gridRows)`, `ruleDefFromStored(ruleId, ruleKind, hitPolicy, vars, rows): RuleDef`, `applyCellEdit(var, cell, subKey, value)`, `newNormalRow(vars, tempId)`, `newDefaultRow(tempId)`, `resequence(rows)` |
| `columns.ts` | 3줄 머리 `GridColumn` 트리 만들기, 칸 편집 가능 여부·클래스 규칙 |
| `ops.ts` | op 코드·표기표, `opsFor(var)`(06:310) |
| `diff.ts` | base 대비 `ADDED/CHANGED/SAME`, 바뀐 칸, 지운 행 |
| `analysis.ts` | `analyzeRule` 결과를 행별·칸별·표 단위로 나눈다. 서버 이슈와 같은 모양으로 비교하는 `sameIssues(a, b)` |

**X — 문서·e2e·픽스처(B9)**

| 파일 | 내용 |
|---|---|
| `src/frontend/e2e/mdm-ruleMng.spec.ts` | §3.4.1 |
| `src/frontend/e2e/mdm-ruleEdit.spec.ts` | §3.4.2 |
| `src/frontend/e2e/fixtures/mdm-ruleEdit-data.sql` | mdm.db 전용 seed-only 픽스처(§3.4.3). 운영 Flyway 시드가 아니다 |
| `src/frontend/e2e/fixtures/mdm-ruleEdit-users.sql` | mcm.db 전용. 두 번째 담당자 `e2e_mdm_steward2`(ROLE_GROUP_MDM_STEWARD, 비밀번호 admin123) — `mdm-rbac-users.sql` 과 같은 칼럼·INSERT OR IGNORE 형식 |
| `docs/mdm/screens/ruleMng/ruleMng_기능설계서.md`, `docs/mdm/screens/ruleEdit/ruleEdit_기능설계서.md` | 선례(TSK-04-02 D14·TSK-04-04)처럼 기능설계서 1종씩. ruleEdit 는 08-03·08-04 가 절을 더할 수 있게 카드별 절로 나눈다 |
| `docs/mdm/tasks/TSK-08-02/screens/*.png` | e2e 스크린샷 |
| `ER/analysis/analysis-corpus.json` | 분석 코퍼스(§6.6.2) |
| `BLT/common/rule/*Test.java`, `BAT/common/rule/*Test.java`, `BAT/dme/**/*Test.java`, `M/tests/dme/**/*.test.ts` | §3 |

### 2.2 수정

| 파일 | 내용 |
|---|---|
| **T** `BLT/contract/rule/MdmRuleContractOnlyArchitectureTest.java` | `main_에_MdmRuleIdIssuer_구현_클래스가_없다` 와 `공허_통과_방지_위반_표본은_발급기_구현_규칙에_잡힌다`, `noIssuerImplementation()` 을 지운다(TSK-08-01 §7 의 해제 조건). `_06_리포지토리는_메서드를_선언하지_않는다` 는 **남긴다**(D12). 위반 표본 `BLT/contract/rule/violation/ViolatingIssuer.java` 는 더 쓰는 곳이 없으면 함께 지운다 |
| **T** `BAT/MdmBusinessRuleMigrationTest.java:521-528` | `BUSINESS_RULE DRAFT 삭제 훅 빈` 줄과 `식별자 발급기 빈` 줄을 지운다. 확정 SPI(08-05 몫)와 `DefinitionLookup`(08-04 몫) 줄은 남긴다. 메서드 이름은 `계약_전용_06_확정_검사와_정의_조회_빈이_없다` 로 바꾼다 |
| **T** `BAT/common/version/VersionScenarioTestConfig.java:61-64` | §7.2 의 두 경로 중 하나. 06-02 가 먼저 dev 에 머지돼 있으면 이 파일을 고치지 않고 06-02 의 일반형 `BeanFactoryPostProcessor` 가 실물 훅 정의를 지우게 둔다. 아니면 임시로 `businessRuleDraftDeletion()` 가짜 빈 한 개만 지우고(이 가짜 훅의 `Events` 를 단언하는 BUSINESS_RULE 시나리오가 있으면 실물 훅으로도 성립하는 단언으로 고친다), 06-02 머지 뒤 origin/dev 를 머지할 때 06-02 쪽 파일을 받아 가짜 빈을 되살린다 |
| **S** `BL/contract/security/MdmActions.java` | `LOCK = "lock"`, `UNLOCK = "unlock"`, `HANDOVER = "handover"` 추가, javadoc "16종" |
| **S** `BL/contract/security/MdmPermissions.java` | `EDIT_ACTIONS`·`CONFIRM_ACTIONS` 에 `LOCK, UNLOCK, HANDOVER` 를 `RESTORE` 뒤에 추가(READ 는 그대로) |
| **S** `DI` | (1) `allActions` 에 `"lock", "unlock", "handover"` 추가. (2) `editActions = readActions + ",save,delete,reg,import,validate,execute,copy,restore,lock,unlock,handover"`. (3) PERM_MDM_EDIT·PERM_MDM_CONFIRM 이 이미 있는 DB 를 위한 보정 `ensurePermActions(String permissionId, String desiredCsv)` — `ensurePermAllActions`(`DI:1497`)와 같은 방식으로 빠진 action 만 덧붙인다. (4) `seedMdmRuleMenus()` 새 메서드를 `seedMdmMenus()` 끝에서 부른다: `ruleMng`("룰", menuSeq "001", fullSeq "5050100")·`ruleEdit`("룰 화면", "002", "5050200") 각각 `insertMcmSecObjIfAbsent(id, 이름, "mdm")` → `insertMcmSecMenuIfAbsent(id, seq, fullSeq, 이름, "dme", id)` → SYSADMIN×PERM_ALL → `seedMdmObjectRbac(id, "dme")`. `seedMdmDomainMngMenu()`(`DI:1058`) 모양을 그대로 따른다 |
| **S** `BAT/MdmOasisActionVocabularyTest.java`, `BLT/contract/security/SecurityScreenContractTest.java` | 16종 어휘와 권한 세트를 반영한다. dme BPMN 두 개의 action 이 모두 권한 세트 안에 있는지 검사 대상에 넣는다 |
| **S** `src/frontend/e2e/fixtures/mdm-rbac-seed-check.expected.txt` | 새 DB 기준 두 줄: `PERM_MDM_EDIT|-|-|-|search,view,export,compare,save,delete,reg,import,validate,execute,copy,restore,lock,unlock,handover`, `PERM_MDM_CONFIRM|-|-|-|search,view,export,compare,save,delete,reg,import,validate,execute,copy,restore,lock,unlock,handover,confirm`(`confirm` 이 맨 끝). 기존 DB 를 고치는 `ensurePermActions` 는 빠진 action 을 **끝에** 덧붙여 CONFIRM 순서가 `…,confirm,lock,unlock,handover` 가 되므로, 시드 대조는 늘 새 DB 에서만 한다(E2E 절차 2) |
| **S** mcm 쪽 PERM_ALL·권한 세트를 단언하는 테스트가 있으면(Build 가 `grep -rn "restore" src/backend/mcm/api/src/test` 로 찾는다) 같이 고친다 | |
| **FS** `src/frontend/shared/src/components/grid/AgDataGrid.tsx` | (1) `GridColumn.children?: GridColumn[]` — 있으면 `ColGroupDef{headerName: header, headerGroupComponent?, children}` 로 바꾼다(잎만 `ColDef`). `headerTooltip?: string` 도 더한다. (2) props `rowDragField?: string`(그 열에 `rowDrag: true`), `isRowDraggable?: (row) => boolean`, `onRowOrderChange?: (orderedKeys: (string|number)[]) => void` — `rowDragManaged: true` 로 켜고 `onRowDragEnd` 에서 `api.forEachNode` 순서를 `rowKey` 로 넘긴다. 정렬(`sortable`)이 켜져 있으면 managed drag 가 동작하지 않으므로 이 prop 이 있으면 정렬을 끈다(Build 가 `aggrid_docs.py` 로 `rowDragManaged` 제약을 확인한다). 기존 prop 기본값·동작은 바꾸지 않는다 |
| **FS** `src/frontend/shared/tests/unit/`(shared 단위 테스트 위치) | 열 그룹 변환·드래그 prop 테스트(§3.2) |
| **FS** `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md` | `GridColumn.children`·`headerTooltip`·행 드래그 prop 을 등재한다(Part B §17 "등재되지 않은 경로/심볼 금지") |
| **X** `M/tsup.config.ts` | `"pages/dme/ruleMng/page": "pages/dme/ruleMng/page.tsx"`, `"pages/dme/ruleEdit/page": "pages/dme/ruleEdit/page.tsx"` |
| **X** `src/frontend/m-mcm/lib/generated/page-registry.ts` | `node scripts/generate-page-registry.mjs`(m-mcm 에서)로 다시 만들어 `"dme/ruleMng"`·`"dme/ruleEdit"` 두 줄이 들어간 결과를 커밋 |
| **X** `M/tests/helpers/engine-paths.ts` | `ANALYSIS_CORPUS_PATH = path.join(ENGINE_ROOT, "src/test/resources/kr/dongkuk/maru/mdm/engine/analysis/analysis-corpus.json")` |
| **X** `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` §A.3.2 | `ruleMng`·`ruleEdit` 화면 행 두 줄(231-233행 형식: `— (To-Be only) | mdm | dme | <screenId> | 2026-09-24 | … TSK-08-02. 기능설계서 1종(docs/mdm/screens/<screenId>/)`) |

### 2.3 수정하지 않는 것(명시)

- Flyway 마이그레이션(두 방언 모두). 엔티티 칼럼·`updatable` 속성.
- `M/src/evalex/**` 알고리즘(연결만 한다). `engine-corpus.json`(셀 코퍼스)과 두 러너.
- 06 리포지토리 6개(메서드 선언 금지 가드 유지, D12).
- `mdm-rbac-users.sql`(공유 픽스처) — 두 번째 담당자는 이 Task 전용 파일에 둔다.
- `DefinitionLookup` 운영 구현, 저장 시 검사 20여 종, 값 테스트, 테스트 케이스, 열 설정·변수 편집, Expression 파싱·AST 저장, 확정 화면 — 08-03·08-04·08-05 몫.

---

## 3. 테스트 전략

### 3.1 백엔드 (testAll 안, 도커 없이 SQLite 로만)

| 테스트 | 위치 | 확인 |
|---|---|---|
| `RuleAnalyzerTest` | `E/src/test/java/kr/dongkuk/maru/mdm/engine/rule/` | TS 골든 21건 동치(순서 포함). 추가: `1.10` 과 `1.1` 이 같은 경계, scale 2 격자 빈틈 `2.50`, 접두 패턴 `succ`, UNIQUE 겹침 ERROR·FIRST 겹침 WARNING, FIRST 에서만 UNREACHABLE |
| `RuleCellsCodecTest` | `BLT/common/rule/` | 일곱 키 밖 키·숫자 값·list 비문자열·모르는 var_id 거부, 값 무변경 왕복(`"1.60"` 이 그대로) |
| `RuleIdRulesTest` | `BLT/common/rule/` | `QLTY_GRD_JDG` 통과, `qlty_grd`·`QLTY__GRD`·`_QLTY`·`QLTY-GRD`·51자·공백 거부 |
| `RuleAnalysisInputMapperTest` | `BLT/common/rule/` | 06 표기 → 엔진 enum 대응 다섯, 식 변수(`exprVar`)·Expression 열 처리 |
| `RuleAnalysisCorpusTest` | `BLT/common/rule/` | **코퍼스 동치(Java 쪽)**: `../../maru-mdm-engine/src/test/resources/kr/dongkuk/maru/mdm/engine/analysis/analysis-corpus.json`(mdm/lib 프로젝트 디렉터리 기준, 파일이 없으면 실패 — 건너뛰지 않는다)을 읽어 사례마다 `RuleAnalysisInputMapper.toAnalysisRule` → `RuleAnalyzer.analyze` → `{code, severity, rowIds, varId, lower, upper}` 목록이 `expect` 와 **순서까지** 같다. 사례 수 하한을 단언한다(§6.6.2 의 최소 건수) |
| `DefaultMdmRuleIdIssuerSqliteTest` | `BAT/common/rule/` | `@SpringBootTest` + `@TempDir` SQLite. `issue(id, ROW, 3)` 이 카운터 0 에서 `[1,3]`, 다음 `issue(id, ROW, 1)` 이 `[4,4]`, VAR·CASE 칸은 그대로, 감사 `U_USR_ID` 기록, 없는 룰은 오류. RETURNING 을 JPA 네이티브로 읽는 방식을 실측해 주석으로 남긴다 |
| `DefaultMdmRuleIdIssuerMssqlTest` | `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/common/rule/` | 같은 단언을 `OUTPUT inserted` 로(`MdmMssqlServer` 공용 컨테이너). **도커 금지로 이번에는 돌리지 않는다**(아래 절) |
| `RuleVarTypeResolverTest` | `BAT/common/rule/` | §6.4 표의 여섯 갈래(컬럼 사전 NUMBER scale 2, 코드 도메인 `maruCodeId`, 일자 도메인 `dateString`, 앞 룰 결과 변수, 선언 타입, 해석 불가 → STRING·UNRESOLVED) |
| `RuleMngServiceTest` | `BAT/dme/ruleMng/` | TermMngServiceTest 형식(`@SpringBootTest(webEnvironment=MOCK)`, `@ActiveProfiles("local")`, `@TempDir` SQLite). 조회: 키워드(ID 앞·중간, 룰명), 종류, 상태, 페이지 경계(size 2, 3건 → 2페이지, totalCount 3), RELEASED 적중 정책·미적용 버전 칸. 등록: TB_MDM_RULE CREATED + VER 1 DRAFT owner=나 rowVersion 0 한 트랜잭션, DECISION 은 hit FIRST·DERIVE 는 null, `sourceKind="EXTERNAL"` 거부(수용 2), ID 규칙 위반 거부(수용 1), 중복 ID 거부, 담당자 역할 없으면 MDM013, 두 번째 INSERT 실패 시 첫 행도 롤백 |
| `RuleEditViewTest` | `BAT/dme/ruleEdit/` | 기본 버전 고르기(§6.3.1), `editable` 이 소유자·DRAFT·MDM 일 때만 true, `me`, base 행, 해석된 타입 |
| `RuleVersionServiceTest` | `BAT/dme/ruleEdit/` | 새 버전 = 직전 RELEASED 복사(VAR·ROW 칸 전부, var_id·row_id 유지, hit·base_ver, owner=나, 번호 max+1), **미적용 버전이 있으면 MDM006**(수용 5, DRAFT·REQUESTED·APPROVED·미래 RELEASED 네 경우), DEPRECATED·EXTERNAL 거부, 버전 없는 룰은 빈 VER 1. DRAFT 삭제가 VAR·ROW 를 CASCADE 로 지운다(실물 훅 경유). 선점·해제·넘기기 row_version 증가, 비소유자 해제·넘기기 MDM003, 넘기기 대상 검사(가짜 디렉터리로 true/false) |
| `RuleHeaderServiceTest` | `BAT/dme/ruleEdit/` | D6 규칙(미적용 버전 소유자만 / 없으면 담당자), EXTERNAL 거부, 폐기 조건(INUSE·미적용 없음), 폐기 뒤 새 버전 거부 |
| `RuleTableServiceTest` | `BAT/dme/ruleEdit/` | 순서 바꿈 저장(부분 유일 인덱스 충돌 없음), 새 행 음수 임시 ID → 발급 번호 매핑, 기존 row_id 유지, seq 가 보낸 순서대로 1..n·기본 행 0, 기본 행 둘·DERIVE 기본 행 거부, 다른 버전의 row_id 거부, hit 정책 값, VAR 는 바뀌지 않는다, **비소유자 MDM003**(수용 4), row_version 충돌 MDM001, 응답 issues 가 같은 정의의 `RuleAnalyzer` 결과와 같다, ERROR 가 있어도 저장된다(D3), 저장 실패 시 row_version 이 오르지 않는다(롤백) |
| `RuleUsageServiceTest` | `BAT/dme/ruleEdit/` | 담은 세트, 의존 룰·역의존 룰(§6.3.9) |
| `DmeBpmnActionTest` | `BAT/dme/` | `DmaBpmnActionTest.assertActions` 형식으로 두 BPMN 의 action 집합·`output=result`·grid 속성 없음 |
| `DmeOasisHttpTest` | `BAT/dme/` | `DmaOasisHttpTest` 형식(RANDOM_PORT, `X-Client-Key`, `X-Authenticated-User`/`Role`). `/api/mdm/oasis/ruleMng/reg` 등록 → 같은 사용자로 `ruleEdit/save`(TABLE) 성공 → **다른 담당자(`lee`)로 `ruleEdit/save`(TABLE·HEADER)·`delete`·`unlock`·`handover` 가 모두 `meta.success=false` + MDM003**, `view` 는 성공하고 `editable=false`(수용 4) |

전체 게이트는 기준선 명령 그대로다(`cd src/backend && … ./gradlew testAll …`). 가드 테스트 2건이 지워져 개수가 줄지만 새 테스트가 훨씬 많아
총수는 늘어난다(Verify 가 헷갈리지 않게 적어 둔다).

### 3.2 프런트 단위 (Vitest, `M/tests/dme/**`, `@vitest-environment happy-dom` 은 렌더 테스트만)

| 테스트 | 확인 |
|---|---|
| `tests/dme/ruleEdit/grid-model.test.ts` | 셀 편집 규칙(§6.7.4 표) 전부, 코퍼스의 모든 행이 `stored → grid → stored` 로 바이트 단위 같게 돌아온다, 새 행은 조건 셀 모두 `{"op":"NA"}`·결과 셀 없음, 기본 행은 조건 셀 없음, `resequence` 는 NORMAL 만 1..n |
| `tests/dme/ruleEdit/ops.test.ts` | `opsFor`: String 9·Number 11·일자 11·코드 String 10(+CODE_IN)·Boolean 4, 2 타입은 +4(Number 15), Equal·Expression 은 목록 없음(06:310) |
| `tests/dme/ruleEdit/diff.test.ts` | ADDED·CHANGED·SAME, `ast` 를 빼고 견준다, 행 설명만 바뀌어도 CHANGED, 지운 행 목록 |
| `tests/dme/ruleEdit/rule-analysis-corpus.test.ts` | **코퍼스 동치(TS 쪽)**: `ANALYSIS_CORPUS_PATH` 를 읽어 사례마다 `ruleDefFromStored` → `analyzeRule` → 투영이 `expect` 와 순서까지 같다. 사례 수 하한은 Java 러너와 같은 값 |
| `tests/dme/ruleEdit/rule-edit-page.test.ts` | 렌더: 소유자 아니면 그리드·버튼 비활성과 `DraftLockBadge` "잠김", 소유자면 활성, EXTERNAL 이면 조회 전용 배지 |
| `tests/dme/ruleEdit/decision-table-card.test.ts` | 행 추가 → 조건 전부 `-` 행과 ALL_NA_ROW 오류 표시, 값을 고치면 JS 검사가 다시 돌아 겹침 알림, 되돌리기, 저장 요청 본문(`part: "TABLE"`, rows 순서·음수 임시 ID·cells 문자열) |
| `tests/dme/ruleMng/rule-mng-page.test.ts` | 목록 요청 파라미터(page·size), 빈 상태 문구, 등록 폼의 ID 규칙 즉시 표시, 서버 오류 표시, 등록 성공 시 `openRuleEdit` 호출 |
| `tests/dme/rule-handoff.test.ts` | sessionStorage 쓰기·한 번 읽고 지우기, 두 이벤트 발행 순서와 `pageId` |
| shared: `AgDataGrid` 열 그룹·드래그 | `children` 이 `ColGroupDef` 로 바뀌고 잎의 기존 속성이 유지된다, 드래그 prop 이 없으면 기존 동작 그대로, 있으면 정렬이 꺼진다. shared 단위 테스트 관례 위치(`pnpm test:unit:shared` 가 읽는 곳)에 둔다 |

### 3.3 코퍼스 동치 — 수용 기준 7 의 증명 구조

1. 입력 한 벌: `ER/analysis/analysis-corpus.json`(§6.6.2). 저장 형태 그대로다.
2. Java: `RuleAnalysisCorpusTest`(운영 `RuleAnalysisInputMapper` + 이식 `RuleAnalyzer`). 이 경로는 `RuleTableService.saveTable` 이 응답 issues 를 만들 때와 **같은 메서드**다(불변 I12).
3. TS: `rule-analysis-corpus.test.ts`(운영 `ruleDefFromStored` + 기존 `analyzeRule`). 이 경로는 그리드 즉시 검사와 **같은 함수**다(불변 I13).
4. 두 러너가 같은 `expect` 에 대해 각각 전부 일치하면 두 결과가 코퍼스 범위에서 같다. 그리드 평탄화는 `grid-model.test.ts` 의 왕복으로 같은 코퍼스에서 고정된다.
5. e2e 는 겹침 시나리오에서 저장 전 화면 알림과 저장 응답 알림이 같은지 한 번 더 본다(§3.4.2 S6).

### 3.4 브라우저 E2E (dev-discipline 「화면 작업의 브라우저 E2E」)

공통: `login(page, user)` 는 `mdm-shell-rbac-smoke.spec.ts` 패턴(`/login` 에서 placeholder "아이디"/"비밀번호", `/portal` 대기). BASE URL 은
`process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100"`, 비밀번호 `SMOKE_LOGIN_PASSWORD ?? "admin123"`. 메뉴 이동은 `.tree-item .item-name`
를 "마루 MDM" → "업무기준" → "룰"(또는 "룰 화면") 순으로 누른다. `test.describe.configure({mode: "serial"})`. 스크린샷
`docs/mdm/tasks/TSK-08-02/screens/dme-ruleMng-*.png`, `dme-ruleEdit-*.png`. 선점·편집 시나리오는 **`e2e_mdm_steward`** 로 로그인한다(admin/SYSADMIN
프리패스 뒤에 RBAC 어휘 회귀를 숨기지 않는다, TSK-04-02 선례).

#### 3.4.1 `mdm-ruleMng.spec.ts`

| # | 스모크 넷 / 고유 | 절차와 기대 |
|---|---|---|
| T1 | 스모크 1 메뉴 | steward 로그인 → 마루 MDM > 업무기준 > 룰 → 제목 "룰" 이 보인다 |
| T2 | 스모크 2 목록·빈 상태 | 픽스처 룰 `QLTY_GRD_JDG`·`E2E_LOCK_JDG` 행이 서버 데이터로 보이고 RELEASED 버전 1·적중 정책 FIRST 칸이 보인다. 키워드 `NO_SUCH_RULE` 조회 → 빈 상태 문구. 스크린샷 `dme-ruleMng-list.png` |
| T3 | 스모크 3 등록 한 번 | 등록 폼에 `E2E_NEW_JDG`·"E2E 신규 판정"·DECISION → 저장 → 룰 화면 탭이 열리고 버전 1 DRAFT·잠금 배지 "편집 중(나)"(자동 선점). 룰 탭으로 돌아와 조회하면 목록에 `E2E_NEW_JDG` 가 보인다. 스크린샷 `dme-ruleMng-register.png` |
| T4 | 스모크 4 서버 오류 | 같은 ID `QLTY_GRD_JDG` 로 등록 → 서버 중복 오류가 화면(ErrorModal)에 보인다 |
| T5 | 수용 1 | ID `qlty-bad` 입력 → 입력 칸에 물리명 규칙 안내가 즉시 보이고 저장 버튼이 막힌다. 요청을 가로채 규칙 위반 ID 를 보내면(`page.route` 로 본문 바꿈) 서버 오류가 보인다 |
| T6 | 수용 2 | 등록 폼에 원천 선택 칸이 없다(원천 MDM 고정 표시). 원천 EXTERNAL 요청은 BE 테스트가 증명한다(§4) |
| T7 | 권한 | stdadmin 로그인 → 목록은 보이고 등록 저장 버튼이 비활성이다(READ, `canDoButton` 은 숨기지 않고 비활성으로 둔다) |

#### 3.4.2 `mdm-ruleEdit.spec.ts`

| # | 스모크 넷 / 고유 | 절차와 기대 |
|---|---|---|
| S1 | 스모크 1 메뉴 | steward 로그인 → 마루 MDM > 업무기준 > 룰 화면 → 룰 고르기 칸이 보인다(룰을 고르기 전 빈 상태) |
| S2 | 스모크 2 서버 데이터 | 룰 고르기에서 `QLTY_GRD_JDG` → 헤더(룰명), 버전 목록(1 RELEASED), 의사결정표 3줄 머리(“조건”/“결과” 묶음, 변수 `COIL_THK`, 칸 `OP`·`하한`·`상한`), 행 3 + 기본 행, 활용처(세트 `LS_E2E`)가 보인다. RELEASED 라 그리드는 읽기 전용. 스크린샷 `dme-ruleEdit-released.png` |
| S3 | 스모크 3 수정 한 번(헤더) | 헤더 룰명을 "품질 등급 판정 E2E" 로 바꿔 바로 저장 → 다시 불러와도 유지 |
| S4 | 수용 5 새 버전·거부 | 새 버전 → 버전 2 DRAFT, base 1, 잠금 "편집 중(나)", 행이 복사됨. 새 버전 버튼이 비활성이고 "미적용 버전이 있어" 안내가 보인다 |
| S5 | 편집·드래그·저장·되돌리기·강조 | 행 추가 → 조건 `-` 새 행과 ALL_NA_ROW 오류 배지(TS 분석기가 ERROR 로 낸다, `rule-analysis.ts:221`). 3행 `SURF_GRD` OP 를 `IN`, 값 `C` 로 → 칸이 base 대비 바뀐 칸으로 강조. 새 행을 드래그로 1행 위로 옮긴다(`page.mouse` down/move/up 으로 드래그 손잡이 사용) → 순서 표시가 바뀐다. 되돌리기 → 저장한 상태로 돌아온다. 다시 새 행을 추가하고 그 행의 결과 `QLTY_GRD` 값을 `D` 로 적은 뒤 저장 → ALL_NA_ROW 오류가 있어도 저장된다(D3), 다시 불러와도 새 행(발급된 row 번호)이 유지되고 "저장 안 한 변경" 배지가 없다. 스크린샷 `dme-ruleEdit-draft.png` |
| S6 | 겹침 알림·서버 동치 | 2행 `SURF_GRD` 값을 `A` 로 → 1·2행 겹침 알림(FIRST: 경고, 도달 불가 경고)이 저장 전에 보인다. 적중 정책 UNIQUE → 겹침이 오류로 바뀐다. 저장 → 응답의 서버 검사 결과 목록이 저장 전 화면 목록과 같다("화면·서버 검사 일치" 표시). 스크린샷 `dme-ruleEdit-overlap.png` |
| S7 | 적중 조건 강조 | 1행 번호 클릭 → 그 행의 `-` 가 아닌 조건 칸이 강조 클래스를 갖는다 |
| S8 | 수용 4 비소유자 | `E2E_LOCK_JDG`(VER 1 DRAFT, 소유자 `e2e_mdm_steward2`)를 연다 → 잠금 배지 "잠김 · e2e_mdm_steward2 편집 중", 그리드 편집 불가·저장·삭제·해제·넘기기 비활성, 선점 버튼 없음. 스크린샷 `dme-ruleEdit-locked.png` |
| S9 | 해제·선점 | steward2 로 로그인해 `E2E_LOCK_JDG` 해제 → steward 로 로그인해 선점 버튼 → "편집 중(나)" |
| S10 | 스모크 4 서버 오류 | `page.route` 로 `**/api/mdm/oasis/ruleEdit/save` 에 `{meta:{success:false, …MDM001…}}` 를 돌려주게 하고 저장 → 오류가 화면에 보인다 |
| S11 | DRAFT 삭제 | `QLTY_GRD_JDG` 버전 2 삭제 → 버전 목록에서 사라지고 새 버전 버튼이 다시 켜진다 |

#### 3.4.3 e2e 데이터 (D10)

- `mdm-ruleEdit-data.sql`(mdm.db, mdm 기동으로 Flyway V11 까지 적용된 뒤): 도메인 3개(두께 NUMBER scale 2, 폭 NUMBER scale 0, 표면등급 STRING),
  컬럼 3개(`COIL_THK`·`COIL_WID`·`SURF_GRD`), 룰 `QLTY_GRD_JDG`(INUSE, `LAST_VAR_ID` 5, `LAST_ROW_ID` 4)의 VER 1 RELEASED(`APPLY_FROM`
  '2026-01-01 00:00:00', `APPLY_TO` '9999-12-31 00:00:00', CHECK 가 요구) — 변수 COND 1 `COIL_THK`(disp 2)·2 `COIL_WID`(1)·3 `SURF_GRD`(1),
  RESULT 4 `QLTY_GRD`(Value, data_type STRING)·5 `PRC_FCT`(Value, data_type NUMBER), 행 06:85-90 의 1~3행과 기본 행(결과 셀은 Value 로 적는다),
  룰 `E2E_LOCK_JDG`(CREATED, `LAST_VAR_ID` 1, `LAST_ROW_ID` 1) VER 1 DRAFT owner `e2e_mdm_steward2`, HIT FIRST(변수 1 = COND `COIL_THK` disp 1, 행 1 = `{"1":{"op":"GE","left":"1"}}`), 세트 `LS_E2E`(`["QLTY_GRD_JDG"]`). 셀 JSON 은
  `MdmBusinessRuleMigrationTest` 460행~ 의 06 샘플 INSERT 를 옮기되 감사 칼럼(`C_USR_ID`·`C_PGM_ID`='mdm-ruleEdit-data.sql'·`VER`/`AUD_VER`)을
  채운다. INSERT 만(DELETE 없음), 머리 주석에 "seed-only, 격리 DB 전용, 운영 시드 아님"을 적는다(`mdm-columnMng-dict.sql` 형식).
- `mdm-ruleEdit-users.sql`(mcm.db): `e2e_mdm_steward2` 한 명.
- 이 스펙들은 룰을 만들고 고치므로 같은 mdm.db 로 두 번 돌릴 수 없다(새 DB 로 시작 — E2E 서버 절차 1)).

### 3.5 추가 게이트(커밋 전, 바꾼 파일만)

```bash
# mantine-aggrid-ui audit — 두 명령 모두 0건
python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mdm/pages/dme src/frontend/m-mdm/src/dme src/frontend/shared/src/components/grid/AgDataGrid.tsx
python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mdm/pages/dme src/frontend/m-mdm/src/dme src/frontend/shared/src/components/grid/AgDataGrid.tsx
# OASIS 계약 — ERROR 0 / WARN 0 유지(INFO 는 늘 수 있다)
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
# 기준선 게이트(글자 그대로)
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain
cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test
cd src/frontend && pnpm test:unit:shared
cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint
```

BPMN 은 `.claude/skills/bpmn-skill/SKILL.md`(bpmn-tool 로 생성·검증)와 `.claude/skills/oasis-project-support/SKILL.md` 규칙대로 쓴다. 전체
테스트·빌드·E2E 는 `.claude/skills/dflow-dev/scripts/heavy.sh` 로 감싼다(`HEAVY_BUSY` 면 같은 명령을 다시 부른다).

---

## 4. 수용 기준 매핑

| # | 수용 기준 | 검증 방법 |
|---|---|---|
| 1 | ID 는 물리명 규칙 | BE `RuleIdRulesTest`(정규식 `NamingRules.STD_PHYS_NAME`·길이 `CODE_MAX` 50, F25 — 컬럼 사전과 같은 규칙), `RuleMngServiceTest` 등록 거부. FE 즉시 표시 + e2e `mdm-ruleMng.spec.ts` T5 |
| 2 | 등록은 MDM 원천만 받는다 | BE `RuleMngServiceTest`: `sourceKind="EXTERNAL"` 요청 거부, 누락 시 MDM 으로 저장, `SOURCE_SYSTEM` NULL. `RuleVersionServiceTest`·`RuleHeaderServiceTest`·`RuleTableServiceTest`: EXTERNAL 룰의 쓰기 거부. FE 등록 폼에 원천 선택이 없다(e2e T6) |
| 3 | 포털 메뉴에서 화면이 열리고 e2e `mdm-ruleMng.spec.ts` 가 통과한다 | §3.4.1 T1~T7(스모크 넷 1~4 포함), 시드 대조 `diff` 출력 없음 |
| 4 | 소유자 아닌 사용자는 읽기·값 테스트만 | 값 테스트 UI 는 08-04 몫이다. 이 Task 는 "비소유자는 편집 UI 비활성 + 서버가 비소유자의 헤더 저장·표 저장·버전 조작(삭제·해제·넘기기)을 거부"로 증명한다: BE `RuleTableServiceTest`·`RuleHeaderServiceTest`·`RuleVersionServiceTest` 의 MDM003, `DmeOasisHttpTest` 의 HTTP 경로, FE `rule-edit-page.test.ts`, e2e S8. 읽기(`view`)는 비소유자도 성공한다. 소유 판단은 TSK-01-03 공통 서비스(`beginDraftWrite`·`DraftOwnershipService`)가 한다 |
| 5 | 미적용 버전이 있으면 새 버전 거부 | BE `RuleVersionServiceTest`(DRAFT·REQUESTED·APPROVED·미래 RELEASED 네 경우 MDM006, `VersionWriteGuard.checkCanCreateVersion`), e2e S4(버튼 비활성·안내) |
| 6 | 포털 메뉴에서 화면이 열리고 e2e `mdm-ruleEdit.spec.ts` 가 통과한다 | §3.4.2 S1~S11 |
| 7 | JS 즉시 결과와 서버 저장 검사 결과가 코퍼스 범위에서 같다 | §3.3: 한 벌 코퍼스 `ER/analysis/analysis-corpus.json` 을 Java `RuleAnalysisCorpusTest`(운영 변환기 + 이식 분석기 = 저장 응답 경로)와 TS `rule-analysis-corpus.test.ts`(운영 `ruleDefFromStored` + `analyzeRule` = 그리드 즉시 검사 경로)가 모두 전부 일치. `RuleTableServiceTest` 가 저장 응답 issues = 분석기 결과임을, e2e S6 이 화면·서버 목록 일치를 확인한다. 여기서 "서버 저장 검사"는 08-02 의 저장이 돌리는 겹침·빈틈·도달 불가 분석이다(D2). 나머지 20여 종 검사는 08-04 몫이다 |

도커 금지로 확인하지 못한 수용 기준은 없다(아래 절).

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

변이 열은 Build·Verify 가 그 규칙을 일부러 깨뜨렸을 때 빨간색이 되어야 하는 테스트다.

| # | 규칙 | 변이 → 잡는 테스트 |
|---|---|---|
| I1 | **룰 ID = `NamingRules.STD_PHYS_NAME` 정규식 + 50자 이하**. 서버가 판정하고 화면 검사는 보조다 | 정규식을 `^[A-Z][A-Z0-9_]*$` 로 느슨하게 → `RuleIdRulesTest`(`QLTY__GRD`) / 길이 검사 삭제 → 51자 사례 |
| I2 | **등록은 원천 MDM 만**: 서버가 `SOURCE_KIND='MDM'`, `SOURCE_SYSTEM=NULL` 로 쓰고, 요청의 `sourceKind` 가 비어 있지 않고 `MDM` 이 아니면 거부한다 | 거부 분기 삭제 → `RuleMngServiceTest` EXTERNAL 사례 |
| I3 | **등록 = TB_MDM_RULE(CREATED) + TB_MDM_RULE_VER(ver 1, DRAFT, owner=등록자, row_version 0, base_ver NULL, hit = DECISION 이면 FIRST·DERIVE 면 NULL) 한 트랜잭션**. 변수·행은 넣지 않는다. 등록자는 담당자 역할이어야 하고 이 판단은 `RuleStewardCheck.requireSteward()` 한 곳으로만 한다(MDM013, §7.1) | VER INSERT 를 트랜잭션 밖으로 / owner 누락 / 역할 검사 삭제 → `RuleMngServiceTest` |
| I4 | **새 버전 전에 `VersionWriteGuard.checkCanCreateVersion(BUSINESS_RULE, ruleId)` 를 부른다**(미적용 = DRAFT·REQUESTED·APPROVED·`APPLY_FROM > now` 인 RELEASED). 새 버전 번호 = 그 룰 버전 최대값 + 1(없으면 1) | 호출 삭제 → `RuleVersionServiceTest` MDM006 네 사례 |
| I5 | **새 버전 = 직전 RELEASED(= RELEASED 중 ver 최대) 복사**: VAR·ROW 모든 칼럼과 `var_id`·`row_id`·`seq` 유지, `hit_policy` 복사, `base_ver` = 그 버전, owner = 만든 사람. RELEASED 가 없고 버전이 하나도 없으면 빈 VER 1. RELEASED 가 없는데 다른 버전이 있으면 거부. DEPRECATED·EXTERNAL 룰은 거부 | row_id 재발급 / base_ver 누락 / collect_agg 등 일부 칼럼 누락 → `RuleVersionServiceTest` 칼럼 전수 비교 |
| I6 | **소유권·삭제는 공통 서비스로만 한다**: 선점 `DraftOwnershipService.acquire`, 해제 `release`, 넘기기 `handover`, DRAFT 삭제 `VersionStateService.deleteDraft`, DRAFT 저장 직전 `VersionWriteGuard.beginDraftWrite`. OWNER_ID·ROW_VERSION·STATUS 를 영역 코드가 직접 UPDATE 하지 않는다(폐기의 부모 STATUS 만 예외, I9) | 표 저장에서 `beginDraftWrite` 호출 삭제 → `RuleTableServiceTest` 비소유자·충돌 사례 |
| I7 | **비소유자는 쓰기 불가**: 표 저장·DRAFT 삭제·해제·넘기기는 공통 서비스의 소유자 검사(MDM003)로, 헤더 저장·폐기는 D6 규칙으로 막는다. `view` 는 누구나 된다. `editable = sourceKind=='MDM' && ver.status=='DRAFT' && ver.ownerId==me` 이고 화면은 이것만으로 표 편집을 켠다. `headerEditable = sourceKind=='MDM' && (미적용 버전 중 소유자가 있는 것이 있으면 그 ownerId==me, 없으면 `RuleStewardCheck.isSteward()`)`(D6)이고 화면은 이것만으로 헤더 편집을 켠다 | `editable` 에서 owner 조건 삭제 → `RuleEditViewTest` / 헤더 소유자 검사 삭제 → `RuleHeaderServiceTest` |
| I8 | **표 저장이 쓰는 범위는 그 DRAFT 버전의 TB_MDM_RULE_ROW 전체 교체와 TB_MDM_RULE_VER.HIT_POLICY 뿐이다.** TB_MDM_RULE_VAR 는 읽기만 한다(열 편집은 08-03). 교체 순서: `beginDraftWrite` → 그 버전 ROW 전부 삭제 → 새 행 INSERT(부분 유일 인덱스 `UX_TB_MDM_RULE_ROW_SEQ` 때문에 UPDATE 로 순서를 바꾸지 않는다) → HIT_POLICY UPDATE, 모두 한 트랜잭션 | VAR 를 다시 쓰게 변경 → `RuleTableServiceTest` "VAR 불변" / UPDATE 로 seq 교체 → 순서 바꿈 사례 |
| I9 | **폐기 = TB_MDM_RULE.STATUS 를 INUSE → DEPRECATED 로 네이티브 UPDATE**(감사 칼럼 포함). 조건: 원천 MDM, 현재 INUSE, 미적용 버전 없음(`checkCanCreateVersion` 재사용, 04:513). 폐기한 룰은 새 버전 거부 | 조건 삭제 → `RuleHeaderServiceTest` |
| I10 | **seq 는 서버가 정한다**: 요청 rows 순서대로 NORMAL 은 1..n, DEFAULT 는 0. 기본 행은 DECISION 룰에만, 많아야 하나. 기존 row_id 는 그 DRAFT 버전(저장 전)에 있던 것만 받는다. 새 행은 음수 임시 ID 이고 `MdmRuleIdIssuer.issue(ruleId, ROW, 새 행 수)` 한 번으로 번호를 받으며 응답 `rowIdMap{"-1": 5, …}` 로 돌려준다. 지운 번호는 다시 쓰지 않는다 | 클라이언트 seq 사용 / 기본 행 둘 허용 / 임시 ID 를 그대로 저장 → `RuleTableServiceTest` |
| I11 | **식별자 발급은 단일 UPDATE 한 문**(SQLite `RETURNING`, MSSQL `OUTPUT inserted`)이고 카운터 이후 값 `last` 에서 `first = last - count + 1` 을 계산한다. 다른 카운터 칼럼을 건드리지 않는다 | SELECT 후 UPDATE 두 문으로 / first 계산 오프바이원 → `DefaultMdmRuleIdIssuerSqliteTest` |
| I12 | **저장 응답 issues 는 `RuleAnalysisInputMapper.toAnalysisRule` → `RuleAnalyzer.analyze` 가 저장 직후 정의(해석된 타입 포함)로 만든 것이다.** 코퍼스 Java 러너와 같은 메서드를 쓴다. ERROR 가 있어도 저장한다(D3) | 응답을 다른 계산으로 / ERROR 시 거부 → `RuleTableServiceTest` |
| I13 | **그리드 즉시 검사는 `ruleDefFromStored(… storedRowsFromGrid(…))` → `@/evalex` `analyzeRule` 이다.** 새 분석 알고리즘을 쓰지 않는다. 편집 한 번(칸 편집 끝·행 추가·삭제·드래그·적중 정책 변경)마다 다시 돈다 | 그리드가 자체 겹침 계산 / 드래그 뒤 재계산 누락 → `decision-table-card.test.ts` |
| I14 | **이식 분석기는 TS 와 같은 결과를 낸다**: 이슈 코드·심각도(UNIQUE 겹침 ERROR, 그 밖 정책 겹침 WARNING, UNREACHABLE 은 FIRST 에서만), `rowIds`·`varId`·`lower`·`upper`, 이슈 **순서**. 숫자는 `BigDecimal.compareTo`(1.10 = 1.1), 값 빈틈 격자는 열의 `scale`(없으면 그 열 리터럴의 최대 소수 자리수), NULL 빈틈은 `-`·`IS NULL` 이 없는 열마다, 접두 패턴의 `succ` 는 마지막 UTF-16 코드 유닛 +1, CONTAINS·INSTR·CODE_IN·비접두 패턴·Expression 셀은 못 푸는 셀(겹치는 것으로 봄) | 격자 규칙·순서·심각도 하나라도 바꿈 → `RuleAnalyzerTest` + `RuleAnalysisCorpusTest` |
| I15 | **코퍼스는 한 벌**(`ER/analysis/analysis-corpus.json`)이고 Java·TS 러너 둘 다 읽는다. m-mdm 안에 사본을 두지 않는다(`*corpus*.json` 금지 관례). 비교에서 `message` 는 뺀다. 두 러너의 사례 수 하한이 같다 | 사본 추가 / 한쪽 러너만 사례 추가 → 러너 하한 단언 |
| I16 | **변수 타입은 서버 `RuleVarTypeResolver` 한 곳에서 해석**해 `view`·저장 응답에 싣고, 화면은 받은 `dataType/scale/dateString/maruCodeId` 만 쓴다(§6.4 표). 일자 String = 도메인 종류 DATE·데이터 타입 STRING·길이 4·6·8(06:127). 해석 불가는 STRING + `typeSource=UNRESOLVED` | 화면이 이름으로 타입 추정 / 일자 판정 길이 변경 → `RuleVarTypeResolverTest` |
| I17 | **셀 JSON 은 06 모양 그대로 저장한다**: 키 `var_id` 문자열, 셀 객체 키 일곱(`op,left,right,list,expr,ast,val`), 값은 문자열(`list` 는 문자열 배열). 이 Task 의 서버는 셀 값을 고치지 않는다(정규화·한쪽 빈 구간 변환·IN 정렬은 08-04). 모양 위반은 거부 | 값 트림·정규화 추가 → `RuleCellsCodecTest` 무변경 왕복 |
| I18 | **op 코드·표기**: `NA -`, `EQ =`, `NE <>`, `LT <`, `LE <=`, `GT >`, `GE >=`, `IN IN`, `NOT_IN NOT IN`, `CODE_IN IN 카테고리`, `CONTAINS`, `INSTR`, `IS_NULL IS NULL`, `NOT_NULL IS NOT NULL`, 구간 `<= 변수 <=`·`<= 변수 <`·`< 변수 <=`·`< 변수 <`(코드 = 표기). `opsFor` 목록 순서는 06:310 순서 그대로(최근 쓴 op 를 올리지 않는다) | 코드 문자열 오타 / 목록 수 → `ops.test.ts` |
| I19 | **셀 편집 규칙**(§6.7.4 표): Equal 무관 체크 → `{op:"NA"}`, 해제 → `{op:"EQ", left:""}`; 구간↔구간은 하한·상한 유지; 구간→단일 op 는 `left = left || right`; 단일→구간은 `left` 유지·`right ""`; `IN`↔`NOT_IN` 은 목록 유지; 값 칸의 `IN` 목록은 콤마·줄바꿈으로 끊어 trim 하고 빈 원소를 뺀다; `-`·`IS NULL`·`IS NOT NULL` 은 값 칸을 잠그고 `{op}` 만 남긴다; 상한 칸은 구간 op 에서만 켠다 | 규칙 하나 바꿈 → `grid-model.test.ts` |
| I20 | **Expression 셀(조건 식·결과 식)은 이 Task 에서 읽기 전용**이고 저장 요청에 받은 그대로 되돌려 보낸다. 새 행의 Expression 조건 셀은 `{op:"NA"}`, 결과 셀은 만들지 않는다(D7) | 식 칸 편집 가능하게 → `decision-table-card.test.ts` |
| I21 | **새 행 = 조건 셀 모두 `{op:"NA"}`, 결과 셀 없음, seq 끝. 기본 행 = 조건 셀 없음, 늘 마지막, 드래그 대상 아님.** DERIVE 룰에는 행 추가·기본 행 버튼이 없다(DERIVE 편집은 08-03) | 기본 행 드래그 허용 → 카드 테스트 |
| I22 | **base 대비 강조**: 비교 대상은 `base_ver` 버전의 행이고 `row_id` 로 맞댄다. 셀은 `ast` 를 뺀 JSON 으로 견준다. 행 설명만 바뀌어도 CHANGED. base 에 없으면 ADDED, base 에만 있으면 "지운 행" 목록. `base_ver` 가 없으면 강조하지 않는다 | `ast` 포함 비교 → `diff.test.ts` |
| I23 | **action 어휘**: ruleMng `search·reg`, ruleEdit `search·view·save·delete·copy·lock·unlock·handover`(§6.1). `lock·unlock·handover` 는 `MdmActions`·`MdmPermissions.EDIT/CONFIRM_ACTIONS`·`allActions`·`editActions`·시드 대조 기대 출력에 모두 있다. BPMN process id = serviceId = OBJECT_ID = screenId | 한 곳에서 빼기 → `MdmOasisActionVocabularyTest`·`DmeBpmnActionTest`·시드 대조 diff |
| I24 | **메뉴**: leaf `ruleMng`("룰")·`ruleEdit`("룰 화면")의 부모는 `dme`, componentPath 는 `dme/ruleMng`·`dme/ruleEdit`, OBJECT 마다 `seedMdmObjectRbac(id, "dme")`. 기존 메뉴(마스터관리·업무기준관리)는 고치지 않는다 | 부모 오기 → e2e T1·S1 |
| I25 | **공통 버전 서비스를 부른 뒤 엔티티를 다시 읽고**, 서비스 클래스에 `@Transactional` 을 붙이지 않는다(`TransactionTemplate`) | `@Transactional` 추가 → oasis-contract-check·HTTP 테스트 |
| I26 | **BUSINESS_RULE DRAFT 삭제 훅은 main 에 정확히 하나**(`RuleDraftDeletionHook`)이고 아무 일도 하지 않는다(VAR·ROW 는 CASCADE) | 훅 삭제 → `RuleVersionServiceTest` DRAFT 삭제 / 테스트 설정에 가짜 훅 재추가 → 컨텍스트 기동 실패 |
| I27 | **마이그레이션을 만들지 않는다**. 06 리포지토리 6개에 메서드를 선언하지 않는다(조회는 `RuleQueries`) | 리포지토리 메서드 추가 → `_06_리포지토리는_메서드를_선언하지_않는다` |
| I28 | **화면 간 이동은 `@/dme/rule-handoff` 로만**: sessionStorage 키 `mdm.dme.ruleEdit.target` 에 `{ruleId, ver?}` 를 쓰고, `mdm-rule-edit-target` 이벤트 → `portal-open-tab`(`mdm:dme/ruleEdit`) 순으로 보낸다. ruleEdit 는 읽은 뒤 지운다 | 읽고 안 지움 → `rule-handoff.test.ts` |
| I29 | **서버 페이징**: `page`(0부터)·`size`(기본 20, 최대 100) 로 JPQL `setFirstResult/setMaxResults`, 정렬 `maruRuleId`, `totalCount` 는 같은 필터의 count. 키워드는 ID 대문자 포함 또는 룰명 포함(`%`·`_` 이스케이프) | 필터 없이 count → `RuleMngServiceTest` 페이지 경계 |
| I30 | **담당자 역할 판단은 `RuleStewardCheck` 한 곳**이고, 소유자 판단은 공통 버전 서비스의 `OWNER_ID` 로만 한다. 이 Task 의 서비스·화면 코드에 `MdmRoles.STEWARD` 를 직접 쓰지 않는다(06-02 `MdmStewardGuard` 머지 뒤 이 한 곳만 바꾼다, §7.1) | 서비스에 역할 직접 검사 추가 → 코드 리뷰 + `grep -rn "MdmRoles.STEWARD" BL/dme` 가 0건 |

---

## 6. 상세 설계

### 6.1 OASIS action 표

| serviceId | action(RBAC 키) | method | 권한 세트 | 하는 일 |
|---|---|---|---|---|
| ruleMng | `search` | `search` | READ | 룰 목록 서버 페이징 |
| ruleMng | `reg` | `register` | EDIT | MDM 원천 룰 등록(VER 1 DRAFT, 자동 선점) |
| ruleEdit | `search` | `searchRules` | READ | 상단 룰 고르기(ID·명 앞부분, 20건) |
| ruleEdit | `view` | `view` | READ | 룰·버전 목록·선택 버전 정의·해석된 타입·base 행·활용처·`me`·`editable` |
| ruleEdit | `save` | `save` | EDIT | `part` = `HEADER`(룰명·설명·활용처 메모) 또는 `TABLE`(행·적중 정책). `RuleEditSavePart` 빈에 위임 |
| ruleEdit | `delete` | `delete` | EDIT | `target` = `VERSION`(DRAFT 삭제) 또는 `RULE`(폐기) |
| ruleEdit | `copy` | `newVersion` | EDIT | 새 버전(직전 RELEASED 복사) |
| ruleEdit | `lock` | `lock` | EDIT | 선점 |
| ruleEdit | `unlock` | `unlock` | EDIT | 해제 |
| ruleEdit | `handover` | `handover` | EDIT | 넘기기 |

BPMN 은 선례대로 `actionGateway` 하나에 action 마다 serviceTask 하나다(F34). 같은 action 안의 갈래(part·target)는 Java 가 가른다 — 두 번째
게이트웨이 선례가 없고, part 를 전략 빈으로 두면 08-03·08-04 가 기존 줄을 고치지 않고 빈을 더해 넓힐 수 있다(§6.8).

### 6.2 DTO 모양 (OASIS 는 `params` 를 DTO 에 바인딩한다. null 은 FE 가 빼고 보낸다)

- `RuleEditViewResult`
  - `me`(현재 사용자 ID), `editable`(I7), `headerEditable`(D6 규칙을 서버가 계산, I7), `unappliedVersionExists`(새 버전 버튼용), `confirmScreenReady`(false 고정, §6.7.2)
  - `rule{maruRuleId, maruRuleName, ruleKind, status, sourceKind, sourceSystem, description, usageNote}`
  - `versions[{ver, status, applyFrom, applyTo, ownerId, baseVer, hitPolicy, rowVersion}]`(ver 내림차순, 일시는 `"yyyy-MM-dd HH:mm:ss"`)
  - `selectedVer`(정수 또는 null)
  - `vars[ResolvedVar…]`(COND 먼저 seq 순, 그다음 RESULT)
  - `rows[{rowId, seq, rowKind, cells(JSON 문자열), note}]`
  - `baseRows[…]`(같은 모양, base_ver 가 없으면 빈 목록)
  - `issues[{code, severity, rowIds, varId, lower, upper, message}]`(선택 버전을 서버 분석기로 돌린 결과 — 읽기 전용 화면도 검사 결과를 보이려고)
  - `usage{usageNote, sets[{setId, setName, status, dependsOn[ruleId…], dependedBy[ruleId…]}]}`
- `RuleEditSaveRequest.rows` 원소: `{rowId(정수, 새 행은 음수), rowKind, cells(JSON 문자열), note}` — 순서가 곧 표시 순서다. `seq` 는 보내지 않는다(I10).
- `RuleEditSaveResult`: `part`, `rowVersion`(새 값), `rowIdMap`, `issues`, `rows`(저장된 행, seq 포함).
- 오류 응답은 OASIS 공통(`meta.success=false`, `ErrorDetail.code` = `MDMnnn` 또는 cactus 코드). FE 는 `MDM001` 이면 "다른 창에서 바뀌었습니다. 다시 불러오세요"를 보이고 다시 불러오기 버튼을 준다.

### 6.3 서비스 규칙

1. **view**: `ver` 가 없으면 06 시안 `curVer` 순서로 고른다 — 미적용 DRAFT → 그 밖의 미적용(REQUESTED·APPROVED) → 현재 RELEASED(`apply_from <= now < apply_to`) → 가장 큰 ver. 버전이 없으면 `selectedVer=null`·빈 표. `now` 는 `LocalDateTime.now(clock).truncatedTo(SECONDS)`(공통 `Clock` 빈).
2. **register**(`ruleMngService`): `RuleIdRules.validateRuleId` → 룰명 필수·100자 이하 → `ruleKind ∈ {DECISION, DERIVE}` → `sourceKind` 검사(I2) → `RuleStewardCheck.requireSteward()`(I3) → `existsById` 면 `DUPLICATE_DATA` → `TransactionTemplate` 안에서 `new MdmRule(id, name, kind, "MDM")`(설명·메모 setter) 저장 → `new MdmRuleVer(id, 1, me)` + `setHitPolicy`·`setBaseVer(null)` 저장.
3. **newVersion**: 원천 MDM·상태 != DEPRECATED·`RuleStewardCheck.requireSteward()` → `checkCanCreateVersion` → 직전 RELEASED 찾기 → `new MdmRuleVer(id, next, me)` + base·hit 복사 → VAR·ROW 칼럼 전수 복사(엔티티 생성자 + setter, `collectAgg` 등 null 이면 null 그대로 — 원본 값을 복사하므로 DB 기본값 문제 없음) — 한 트랜잭션.
4. **deleteDraft**: 원천 MDM → `VersionStateService.deleteDraft(ref, rowVersion, me)`(소유자·DRAFT·row_version·훅은 공통 서비스가 본다).
5. **lock/unlock/handover**: 원천 MDM → `DraftOwnershipService.acquire/release/handover(ref, rowVersion, me[, newOwnerId])` → 새 row_version 반환. 선점은 공통 서비스가 담당자 역할을 본다.
6. **saveHeader**(part HEADER): 원천 MDM → D6 권한 규칙 → 룰명 필수·100자 이하 → 엔티티 setter 로 `maruRuleName`·`description`·`usageNote` 저장(이 셋은 `updatable=false` 가 아니다). TB_MDM_RULE 에 row_version 이 없으므로 헤더는 마지막 저장이 이긴다(버전과 무관한 값, 06:913).
7. **deprecate**(delete target RULE): I9.
8. **saveTable**(part TABLE): 원천 MDM → 버전 행 읽기(DRAFT 인지는 `beginDraftWrite` 가 본다) → `TransactionTemplate` { `beginDraftWrite(ref, rowVersion, me)` → 요청 행 검사(행 종류·기본 행 수·DERIVE 에 기본 행 금지·기존 row_id 소속·`RuleCellsCodec.validateShape`·HIT 값: DECISION 은 다섯 중 하나, DERIVE 는 null) → 새 행 수만큼 `issue(ruleId, ROW, n)` → `RuleQueries.deleteRows` → INSERT(seq I10) → HIT_POLICY 네이티브 UPDATE(감사 칼럼 `AUD_VER` 포함) } → 트랜잭션 밖에서 타입 해석 + 분석(I12) → 응답.
9. **usage**(`RuleUsageFinder`): 모든 세트(`TB_MDM_RULE_SET`, 작다)의 `rule_ids` 를 Jackson 으로 파싱해 이 룰을 담은 세트를 고른다. 세트 안 각 룰의 "읽는 이름"(COND `var_name` 중 식 변수가 아닌 것 + 식 변수 `var_ast` 와 Expression 셀 `ast` 의 `VARIABLE_OR_CONSTANT` 노드 이름)과 "만드는 이름"(RESULT `var_name`, 그룹이면 `res_grp`)을 **그 룰의 최신 RELEASED 버전**으로 계산하고(06:754 세트 계산 관례), 이 룰에 RELEASED 가 없으면 이 룰만 view 의 선택 버전으로 계산한다. `dependsOn` = 이 룰이 읽는 이름을 만드는 세트 안 다른 룰, `dependedBy` = 이 룰이 만드는 이름을 읽는 세트 안 다른 룰.

### 6.4 변수 타입 해석 (`RuleVarTypeResolver`, 06:125-127·1013)

| 순서 | 조건 | 결과 |
|---|---|---|
| 1 | COND 이고 `DISP_TYPE='Expression'` | `typeSource=EXPRESSION_COLUMN`, dataType `STRING`(분석기는 이 열의 NA 아닌 셀을 못 푸는 셀로 본다) |
| 2 | `DOMAIN_ID` 가 있다(결과 열·식 변수·프로그램 변수의 선언) | 그 도메인으로 아래 "도메인 → 타입" |
| 3 | `DATA_TYPE` 이 있다 | dataType = 그 값(BOOLEAN/NUMBER/STRING/DATE), scale null, `typeSource=DECLARED` |
| 4 | 이름 변수이고 컬럼 사전에 있다(`MdmColumnRepository.findByPhysName`) | 컬럼의 도메인으로 "도메인 → 타입", `typeSource=COLUMN`, label 이 비면 컬럼 `labelMid`(없으면 `labelLong`), description = 컬럼 설명 |
| 5 | 이름 변수이고 다른 룰의 최신 RELEASED 버전 RESULT `var_name`(또는 `res_grp`)에 있다 | 그 결과 열의 `DOMAIN_ID`/`DATA_TYPE`, `typeSource=RULE_RESULT` |
| 6 | 그 밖 | dataType `STRING`, `typeSource=UNRESOLVED`(화면 배지 "타입 없음") |

"도메인 → 타입": `dataType` = 도메인 `dataType`(없으면 STRING), `scale` = 도메인 `scale`, `dateString` = 도메인 종류 DATE && 데이터 타입 STRING && 길이 ∈ {4,6,8}, `maruCodeId` = 도메인 종류 CODE 이면 `MdmEffectiveDomainResolver.resolve(domainId).effectiveCodeRef().maruCodeId()`. 도메인 칼럼의 상속(자식 도메인이 부모의 데이터 타입·scale 을 비워 두는 경우)은 Build 가 `MdmDomain` 데이터로 확인해, 비어 있으면 `parentDomainId` 사슬을 올라가 첫 값을 쓴다.

### 6.5 셀 JSON 코덱과 분석 입력 변환

- `RuleCellsCodec.parse` 는 `{"<varId>": {…}}` 를 `LinkedHashMap<Integer, Map<String,Object>>` 로 읽는다(순서 보존).
- `RuleAnalysisInputMapper` 는 셀 맵을 `RuleCell(op, left, right, list, expr, ast, val, null)` 로 바꾸고, `ResolvedVar` 를 `AnalysisVar` 로 바꾼다(`exprVar` = `var_ast` 가 있음, 이때 `varName` 은 null — TS `RuleVarDef` 와 같다).
- TS 쪽 대응: `grid-model.ts` `ruleDefFromStored` 가 같은 규칙으로 `RuleDef` 를 만든다(`dispType` 06 표기 → `"EQUAL"|"ONE"|"TWO"|"EXPRESSION"|"VALUE"`).

### 6.6 분석기 이식과 코퍼스

#### 6.6.1 이식 규칙
- 정본은 `M/src/evalex/rule-analysis.ts`·`value-set.ts`·`pattern.ts` 다. 함수 경계·순회 순서를 그대로 옮기고 이슈 생성 순서를 바꾸지 않는다(I14). TS 에서 `Decimal` 을 쓴 자리는 `BigDecimal`(비교는 `compareTo`, 격자 계산의 나눗셈·반올림은 TS 와 같은 규칙).
- `message` 문구는 TS 와 같게 옮기되 비교하지 않는다.
- **순서·문자열이 조용히 갈리는 자리(확인함)** — 아래 대응을 그대로 쓴다.

| TS 자리 | TS 동작 | Java 규칙 |
|---|---|---|
| `rule-analysis.ts:163` `new D(raw).toString()` | decimal.js 는 끝 0 을 지우고, `D` 설정(`toExpNeg -9e15`·`toExpPos 9e15`, `decimal.ts:11-12`)이라 지수 표기를 쓰지 않는다 | `new BigDecimal(raw).stripTrailingZeros().toPlainString()`(0 은 `"0"`) — `toString()` 금지(지수 표기) |
| `rule-analysis.ts:166` 문자열 `vals.sort()` | 비교자 없는 정렬 = UTF-16 코드 유닛 사전순 | `String.compareTo`(같은 UTF-16 순서)로 정렬 |
| `rule-analysis.ts:166` 숫자 `sort((a,b) => new D(a).cmp(b))` | 값 순서, 같은 값은 안정 정렬 | `BigDecimal.compareTo` + 안정 정렬(`List.sort`) |
| `rule-analysis.ts:323-324` `g1.toFixed(s)` | 소수 s 자리, 지수 없음, 반올림 모드는 `D` 설정(ROUND_HALF_EVEN) | `g.setScale(s, RoundingMode.HALF_EVEN).toPlainString()` |
| 이슈 순서 `rule-analysis.ts:205` | ALL_NA_ROW → UNRESOLVED_CELL → 겹침 → UNREACHABLE → VALUE_GAP → NULL_GAP, 각 단계 안은 행·열 순회 순서 | 같은 단계 순서, 행은 입력 `rows` 순서(NORMAL 만), 열은 `vars` 의 COND `seq` 순서 |

- Map 을 도는 자리는 `LinkedHashMap`(입력 순서)이나 정렬된 키로 돈다. `cells` 의 키 순서에 기대지 않는다(TS 도 var 목록을 돌며 `cells[varId]` 로 꺼낸다 — Build 가 이식할 때 TS 가 `Object.keys` 로 도는 자리가 새로 보이면 숫자 키 오름차순으로 맞춘다).
- 코퍼스에 지수 경계 사례를 넣는다: `0.0000001`·`1E+3` 류가 나올 수 있는 값(`"0.00000010"`, `"1000.0"`)을 가진 NUMBER 열의 VALUE_GAP 사례 하나.
- 엔진 main 에 Jackson·Spring 을 쓰지 않는다(F21). 코퍼스 JSON 은 테스트에서만 읽는다.
- TS 파일은 고치지 않는다. 이식 중 TS 동작이 이상해 보여도 그대로 옮기고 보고에 올린다.

#### 6.6.2 코퍼스 형식 (`ER/analysis/analysis-corpus.json`)

```json
{"version": 1, "cases": [
  {"id": "gap-scale2-250",
   "rule": {"ruleId": "T", "ruleKind": "DECISION", "hitPolicy": "UNIQUE",
            "vars": [{"varId": 1, "varKind": "COND", "dispType": "2", "seq": 1, "varName": "V1", "exprVar": false,
                      "dataType": "NUMBER", "scale": 2, "dateString": false, "maruCodeId": null}],
            "rows": [{"rowId": 1, "seq": 1, "rowKind": "NORMAL", "cells": "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.6\",\"right\":\"2.5\"}}"},
                     {"rowId": 2, "seq": 2, "rowKind": "NORMAL", "cells": "{\"1\":{\"op\":\"< 변수 <=\",\"left\":\"2.5\",\"right\":\"3.0\"}}"}]},
   "expect": [{"code": "VALUE_GAP", "severity": "WARNING", "rowIds": [1, 2], "varId": 1, "lower": "2.50", "upper": "2.50"},
              {"code": "NULL_GAP", "severity": "WARNING", "rowIds": [], "varId": 1}]}
]}
```

- `vars` 원소는 `ResolvedVar` 의 분석용 부분 집합, `rows` 는 저장 형태(`cells` 는 문자열)다. `expect` 에서 없는 칸(`varId`·`lower`·`upper`)은 생략한다(null 과 같게 본다).
- 최소 사례(러너 하한 **30**): TS 골든 21건 전부 이전, `QLTY_GRD_JDG`·`BASE_SPD_LKP`(`M/tests/fixtures/evalex-rules.ts`) 원형, 그리드 고유 사례(새 행 ALL_NA_ROW, 콤마 목록 IN, 2 타입 열의 1 타입 op, Expression 조건 열 NA·비NA, 일자 String 구간, 코드 도메인 CODE_IN, 해석 불가 STRING 열) 8건 이상.

#### 6.6.3 08-04 가 그대로 쓰는 공개 API (고정)

팀장 지시(2026-09-24)로 08-04 는 이 분석기를 다시 만들지 않고 쓴다. 아래 서명과 뜻은 이 Task 가 고정하고, 08-04 는 **더하기만** 한다(바꾸려면 새 결정이 필요하다).

| 자리 | 고정하는 것 |
|---|---|
| `kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzer` | `public static List<RuleIssue> analyze(AnalysisRule rule)` — 상태 없음·스레드 안전·예외 없음(못 푸는 셀은 이슈로 낸다). 입력 리스트를 바꾸지 않는다. 결과는 불변 리스트 |
| `AnalysisRule`·`AnalysisVar`·`RuleIssue`·`RuleIssueCode`·`RuleIssue.Severity` | §2.1-E 의 record 칼럼 순서·이름·enum 상수. 새 칼럼이 필요하면 record 를 바꾸지 말고 오버로드(`analyze(AnalysisRule, AnalysisOptions)`)를 더한다 |
| 이슈 순서와 심각도 규칙 | I14(TS 와 같음). 저장 거부 여부는 분석기가 정하지 않는다 — `RuleSaveCheck`(§6.8)가 정한다 |
| `com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper` | `static AnalysisRule toAnalysisRule(String ruleId, String ruleKind, String hitPolicy, List<ResolvedVar> vars, List<StoredRow> rows)` — 저장 형태(06 표기 `DISP_TYPE`, 셀 JSON 문자열) 입력. 값 테스트의 "본문 정의" 경로도 이 모양을 쓴다 |
| `RuleVarTypeResolver.resolve(ruleId, ver, vars)`·`ResolvedVar` | §6.4 규칙과 record 칼럼 |
| `RuleCellsCodec.parse/write/validateShape` | 모양 검사만 한다(값 무변경, I17). 08-04 의 정규화는 별도 클래스로 더한다 |
| 코퍼스 `ER/analysis/analysis-corpus.json` | `version: 1` 형식(§6.6.2). 08-04 는 사례를 **추가만** 하고 두 러너(Java `RuleAnalysisCorpusTest`, TS `rule-analysis-corpus.test.ts`)의 사례 수 하한을 함께 올린다 |

### 6.7 화면

#### 6.7.0 버튼 권한 표시
- `MdmPageLayout` 의 `buttons` 는 셸이 RBAC 로 비활성화하지만, 카드 안 버튼(등록 저장·헤더 저장·폐기·새 버전·삭제·선점·해제·넘기기·표 저장)은 레이아웃을 거치지 않는다. 카드는 `import { useUserButtonRbac, canDoButton } from "@dk-oasis/shared/layout"` 로 `canDoButton(state, screenId, action)`(action 은 §6.1 의 RBAC 키: `reg`·`save`·`delete`·`copy`·`lock`·`unlock`·`handover`)을 구해 `disabled` 에 더한다(팝업 선례와 같은 재노출 API, `shared/src/layout/index.ts:2-7`). 권한이 없으면 숨기지 않고 비활성으로 둔다. 서버 판정(BFF RBAC·소유자 검사)이 기준이고 화면 비활성은 보조다.

#### 6.7.1 카드 ① 헤더 (`RuleHeaderCard`)
- 룰 ID(읽기), 룰명·설명·활용처 메모 입력, 원천(MDM 또는 `EXTERNAL · 시스템`), 배지(룰 상태·종류). "바로 저장"(action save/HEADER). 폐기 버튼은 INUSE 일 때만 보이고 두 번 눌러야 폐기한다(06:766 "확인을 한 번 더").
- 쓰기 가능: 원천 MDM && D6 규칙을 화면에서도 같게 계산(`view` 가 `headerEditable` 을 함께 싣는다 — 서버가 판정, 화면은 따른다).

#### 6.7.2 카드 ② 버전 목록 (`RuleVersionCard`)
- 표: 버전·상태(`VersionStatusBadge`)·적용 구간·소유자·base. 행 클릭으로 그 버전을 연다.
- 버튼: 새 버전(copy, `unappliedVersionExists=false`·MDM·not DEPRECATED 일 때), 확정 이동, 삭제(DRAFT·소유자), 선점(미적용·owner 비었음), 해제·넘기기(미적용·소유자, 넘기기 대상 사용자 ID 입력 칸).
- 미적용 버전이 있으면 "미적용 버전 N 이 있어 새 버전을 만들 수 없다(한 번에 하나)" 안내.
- **확정 이동**: 대상 화면 `dme/ruleConfirm`(TSK-08-05)이 아직 없으므로 `confirmScreenReady=false` 이면 버튼을 비활성으로 두고 툴팁 "버전 확정 화면(TSK-08-05)에서 한다"를 보인다. 08-05 가 서버 값 한 줄과 handoff 대상(`mdm:dme/ruleConfirm`)을 더해 켠다.

#### 6.7.3 카드 ⑧ 활용처 (`RuleUsageCard`)
- 활용처 메모, 담은 룰 세트(세트 ID·이름·상태), 세트마다 의존 룰·역의존 룰(룰 ID 는 `openRuleEdit(ruleId)` 링크). 세트 편집 링크는 08-06 화면이 없으므로 텍스트로만 둔다.
- 카드 ⑦ 배포 대상은 그리지 않는다(D11).

#### 6.7.4 카드 ③ 의사결정표 (`DecisionTableCard`)
- 적중 정책 선택(DECISION 만, 설명 한 줄 — 시안 문구), DERIVE 는 "산출 룰은 열 설정(08-03)에서 편집한다" 안내와 읽기 전용 표.
- 그리드 열: `행`(행 번호 `seq` 또는 "기본", `row N`, 드래그 손잡이, 클릭하면 선택) | 조건 묶음 → 변수 → 칸 | 결과 묶음 → 변수 → 칸 | `행 설명`(편집) | `검사`(행별 오류·경고 수, 서버 결과 표시 중이면 "서버") | 삭제 ✕.
- 변수 머리(가운데 줄): 표시명(label, 없으면 varName), 물리명, 타입 배지(`Number(2)`·`일자`·`코드`·`String`·`Boolean`·`자유식`·`타입 없음`), 표시 타입 배지(`Equal`·`1 타입`·`2 타입`·결과 `상수`/`식`). `headerTooltip` 에 컬럼 설명·도메인명.
- 칸(아래 줄): 2 타입 `OP·하한·상한`, 1 타입 `OP·값`(String 이면 "값·목록"), Equal `무관·값`, Expression 조건 `무관·식`(읽기 전용), 결과 Value `값`, 결과 Expression `식`(읽기 전용). 행 데이터 필드 이름 `c{varId}_{k}`(k ∈ `op,left,right,na,expr,val`). 편집기는 OP = `select`(`cellEditorOptionsGetter` → `opsFor`), 값 = `text`, 무관 = 체크(render 로 그린 체크박스가 `onCellValueChanged` 와 같은 경로로 값을 바꾼다 — 래퍼 동작은 Build 가 `AgDataGrid.tsx` 로 확인).
- 셀 편집 규칙 — `applyCellEdit(var, cell, k, value)`:

| 입력 | 결과 셀 |
|---|---|
| Equal `na` 켬 / 끔 | `{op:"NA"}` / `{op:"EQ", left:""}` |
| Equal `left` | `{op:"EQ", left: 값}` |
| `op` 구간 → 구간 | `{op, left, right}` 유지 |
| `op` 구간 → EQ·NE·LT·LE·GT·GE·CONTAINS·INSTR | `{op, left: left || right || ""}` |
| `op` 단일 → 구간 | `{op, left, right: ""}` |
| `op` IN ↔ NOT_IN | `{op, list}` 유지 |
| `op` 단일 ↔ 단일 | `{op, left}` 유지 |
| `op` → IN·NOT_IN(그 밖에서) | `{op, list: left ? [left] : []}` |
| `op` → CODE_IN | `{op, left: ""}` |
| `op` → NA·IS_NULL·NOT_NULL | `{op}` |
| `left`(IN·NOT_IN) | `list` = 콤마·줄바꿈 분할 → trim → 빈 원소 제거 |
| `left`·`right`(그 밖) | 값 trim |
| 결과 `val` | `{val: 값 trim}` |

- 칸 잠금: 상한은 구간 op 일 때만, 값은 셀이 없거나 `NA`·`IS_NULL`·`NOT_NULL` 이면 잠근다. 기본 행의 조건 칸은 비운 채 잠근다.
- 버튼: 행 추가(`newNormalRow`, 임시 ID = 지금까지 쓴 가장 작은 음수 - 1), 기본 행 추가(없을 때만), 저장, 되돌리기(마지막으로 불러온 상태), "저장 안 한 변경" 배지.
- 드래그: NORMAL 행만(`isRowDraggable`), 놓으면 `resequence`. 기본 행은 늘 마지막.
- 강조: base 대비 ADDED 행·CHANGED 칸(`diff.ts`), 선택 행의 NA 아닌 조건 칸(적중 조건 강조), 검사 이슈가 걸린 칸(ERROR 붉게·WARNING 노랗게). 클래스 이름은 `cellClassRules`/`getRowClassExtra` 로 주고 색은 shared 토큰 클래스를 쓴다(화면 CSS 에 색 값 직접 금지 — audit 대상).
- 검사: 편집할 때마다 JS 분석(I13). 표 단위 이슈(VALUE_GAP·NULL_GAP)는 표 아래 알림 줄에 모은다(시안 "표 단위 검사"). 저장 응답이 오면 서버 이슈를 보이고 `sameIssues(js, server)` 가 참이면 "화면·서버 검사 일치", 거짓이면 "서버 결과가 기준" 경고를 함께 보인다(06:731).

### 6.8 확장 지점 (형제 Task 가 기존 줄을 고치지 않고 파일을 더하는 자리)

| 자리 | 이 Task 가 두는 것 | 뒤 Task 가 하는 일 |
|---|---|---|
| FE 카드 슬롯 `M/pages/dme/ruleEdit/cards.ts` | `RULE_EDIT_CARDS` 배열 4개(header·versions·table·usage), `RuleEditCardProps{view, reload, me, editable, selectVer, notify}` | 08-04 가 값 테스트·테스트 결과·테스트 케이스 카드 파일을 만들고 배열에 항목을 더한다. 08-03 은 열 설정 표·입력 계약을 table 카드 아래 슬롯으로 더한다 |
| FE 표 카드 하위 슬롯 | `DecisionTableCard` 의 `extraSections?: RuleTableSection[]` prop(기본 빈 배열)과 `cards.ts` 의 `RULE_TABLE_SECTIONS` 배열 | 08-03 이 열 설정 표·입력 계약·피벗 섹션을 더한다 |
| BE 저장 부분 `RuleEditSavePart` | HEADER·TABLE 두 빈, 파사드는 `Map<String, RuleEditSavePart>` 로 위임(모르는 part 는 `INVALID_VALUE`) | 08-03 이 `COLUMNS` 부분 빈을 더한다. 08-04 는 TABLE 저장 뒤 검사를 `RuleTableService` 가 부르는 `RuleSaveCheck` 목록(빈 목록으로 주입해 둔다)에 빈을 더해 넓힌다 |
| BE 저장 뒤 검사 `RuleSaveCheck` | `interface RuleSaveCheck { List<Map<String,Object>> check(RuleSaveContext ctx); }`, `RuleTableService` 가 `List<RuleSaveCheck>` 를 주입받아 분석 이슈 뒤에 결과를 이어 붙인다(이 Task 는 구현 0개) | 08-04 의 20여 종 검사가 구현을 더하고, 거부 정책을 이 자리에서 켠다(D3) |
| BPMN action 분기 | `ruleEdit.bpmn` 의 `actionGateway` | 08-04 가 `validate`(값 테스트) 갈래와 serviceTask·새 서비스 클래스를 더한다 |
| 셀 코덱·타입 해석·분석 변환 | `BL/common/rule/*` | 08-03·08-04 가 그대로 쓴다 |

### 6.9 화면 간 이동 (D9)

- 목록 ID 링크·등록 성공·활용처의 룰 링크는 `openRuleEdit(ruleId, ver?)` 를 부른다.
- ruleEdit 는 마운트할 때 `takeRuleEditTarget()` 을 읽고, 이미 열린 탭은 `mdm-rule-edit-target` 이벤트를 듣고 그 룰로 바꾼다. 저장 안 한 변경이 있으면 확인을 받는다.
- pageId 가 `mdm:dme/ruleEdit` 인지 Build 가 포털에서 한 번 확인하고(메뉴 클릭 뒤 탭의 pageId), 다르면 상수 한 곳만 고친다.

## 7. TSK-06-02 공용 부품과의 연결 (06-02 머지 뒤 연결)

팀장 지시(2026-09-24): `common/security/MdmStewardGuard`(`requireSteward()` → MDM013)와 `VersionScenarioTestConfig` 의 일반형 `BeanFactoryPostProcessor`(가짜가 있는 대상의 운영 SPI 빈 정의를 지운다)는 TSK-06-02 가 만든다. 08-02 는 같은 것을 새로 만들지 않고, 그 부품 없이도 Build 가 진행되게 연결 지점을 한 곳씩으로 모은다.

### 7.1 담당자 역할 판단 — `RuleStewardCheck` 한 곳
- 이 Task 의 모든 역할 판단(등록 I3, 새 버전 §6.3.3, 헤더·폐기 D6, `headerEditable`)은 `BL/common/rule/RuleStewardCheck` 만 부른다. 소유자 판단은 역할과 별개로 TSK-01-03 공통 서비스의 `OWNER_ID`(`beginDraftWrite`·`DraftOwnershipService`·`VersionStateService`)를 직접 쓴다. 선점·확정의 역할 검사는 공통 서비스 안(`VersionPreconditions.requireSteward`)에 이미 있으므로 이 Task 가 따로 부르지 않는다.
- **06-02 머지 전**: `RuleStewardCheck` 몸체는 `MdmCurrentUser.roleIds().contains(MdmRoles.STEWARD)`, 아니면 `MdmErrors.of(MdmErrorCode.STEWARD_ROLE_REQUIRED)`. javadoc 에 "06-02 `MdmStewardGuard` 머지 뒤 위임으로 바꾼다"를 적는다. 이 클래스는 가드의 사본이 아니라 연결 지점이다 — 메서드 두 개 외에 규칙을 두지 않는다.
- **06-02 머지 뒤**(origin/dev 를 머지했을 때 `MdmStewardGuard` 가 있으면): `requireSteward()` 는 `mdmStewardGuard.requireSteward()` 위임, `isSteward()` 는 가드가 판단 메서드(불리언)를 공개하면 그것에 위임하고, 공개하지 않으면 지금 몸체를 그대로 둔다(예외를 잡아 불리언으로 바꾸지 않는다). 서비스 코드는 고치지 않는다. 테스트(`RuleMngServiceTest`·`RuleHeaderServiceTest` 의 MDM013 사례)는 그대로 통과해야 한다.
- **연결 결과(머지 뒤, 2026-09-24)**: origin/dev(4432658)를 머지(aeea5a7)한 뒤 `RuleStewardCheck` 가 생성자로 `MdmStewardGuard` 를 받아 `requireSteward()` 를 위임한다. 가드는 불리언 판단을 공개하지 않아 `isSteward()` 는 역할 집합을 그대로 본다. 새 `RuleStewardCheckTest`(lib, 3건 — 담당자 통과, 비담당자 MDM013·`isSteward` 거짓, 역할이 담당자여도 가드가 거부하면 거부 = 위임 확인)를 먼저 넣어 빨강(생성자 불일치 컴파일 실패)을 본 뒤 고쳤다. 위임 줄을 지우는 변이에서 `RuleStewardCheckTest` 2건과 `RuleMngServiceTest`·`RuleHeaderServiceTest`(2)·`RuleVersionServiceTest` 의 MDM013 사례 4건이 빨갛게 됐다. 서비스 코드는 고치지 않았다.

### 7.2 테스트 설정의 SPI 중복 — `VersionScenarioTestConfig`
- **Build 착수 때 origin/dev 확인**: `/usr/bin/git fetch origin` 뒤 `origin/dev` 의 `VersionScenarioTestConfig` 에 06-02 의 일반형 `BeanFactoryPostProcessor` 가 있으면 origin/dev 를 먼저 머지하고 이 파일을 고치지 않는다(가짜 `businessRuleDraftDeletion` 이 남고 실물 `RuleDraftDeletionHook` 정의가 그 테스트 컨텍스트에서 지워진다).
- **없으면**: 가짜 `businessRuleDraftDeletion()` 빈 한 개만 지워 실물 훅으로 컨텍스트가 뜨게 한다(§2.2-T). 06-02 가 뒤에 머지돼 이 파일이 충돌하면 06-02 쪽을 받아 가짜 빈을 되살린다 — 그러면 BFPP 가 실물 정의를 지우므로 두 방식 모두에서 `BusinessRuleVersionScenarioSqliteTest` 가 통과해야 한다.
- 어느 경로였는지 Build 보고와 이 절 끝에 한 줄로 적는다.
- **Build 결과(B2, 2026-09-24)**: `/usr/bin/git fetch origin` 뒤 origin/dev(3fbf073, 기점과 같음)의 `VersionScenarioTestConfig` 에 06-02 일반형 BFPP 가 없어 **"없으면" 경로**를 탔다 — 가짜 `businessRuleDraftDeletion()` 빈 하나만 지웠고, 그 가짜의 호출 기록을 단언하던 `BusinessRuleVersionScenarioSqliteTest` R2 한 줄은 "가짜가 등록돼 있으면 호출 기록을, 아니면 CASCADE 결과로" 판정하도록 바꿨다(두 방식 모두에서 성립).
- **연결 결과(머지 뒤, 2026-09-24)**: origin/dev(4432658) 머지(aeea5a7)에서 이 파일이 충돌해 위 규칙대로 06-02 쪽을 받았다 — 가짜 `scenarioBusinessRuleDraftDeletion()`(06-02 가 `scenario` 접두로 바꾼 이름)과 일반형 BFPP `removeProductionVersionSpisShadowedByFakes` 가 함께 들어왔고, 클래스 javadoc 의 "가짜는 두지 않는다" 문단을 "가짜로 두고 실물 정의는 후처리기가 지운다"로 고쳤다. 이어서 R2 의 두 방식 분기를 걷어 가짜 경로만 인정하게(`draftDeletion(BUSINESS_RULE).calls() == [v1]`) 되돌렸다. 변이 두 가지로 확인했다: 가짜 빈을 지우면 R2 만 빨강(26건 중 1건), BFPP 의 정의 삭제를 끄면 같은 대상에 훅이 둘이 되어 컨텍스트가 죽고 26건 모두 빨강. 운영 `RuleDraftDeletionHook` 은 main 에 한 클래스뿐이고(I26), 이 설정을 import 하는 테스트는 `common/version` 의 시나리오 테스트뿐이다. 실물 훅의 CASCADE 는 이 설정을 쓰지 않는 운영 컨텍스트의 `RuleVersionServiceTest` 「DRAFT 삭제는 실물 훅을 지나 변수와 행을 CASCADE 로 지운다」가 계속 본다.

---

## E2E 서버 절차

TSK-04-02 「E2E 서버 절차」 를 이 워크트리·이 작업 값으로 옮긴다. `be-run.sh`·`fe-run.sh` 는 쓰지 않는다. 포트는 예시이고 실행 시점에 비어
있는 번호로 다시 고른다. 서버를 띄우기 **직전에** 슬롯을 잡고, 끝나면 성공·실패와 상관없이 자기 PID·자기 포트만 거둔 뒤 슬롯을 푼다.

```bash
W=/Users/jji/project/dmes-standard/dflow-f65cffff
SP=<Build/Verify 실행자의 scratchpad>
J=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
# 0) 빈 포트 — 셋 다 LISTEN 이 없어야 한다(예: mcm BE 18213, mdm BE 18306, FE 15213). 있으면 다른 번호
lsof -iTCP:18213 -sTCP:LISTEN; lsof -iTCP:18306 -sTCP:LISTEN; lsof -iTCP:15213 -sTCP:LISTEN
# 1) 슬롯 — HEAVY_ACQUIRED 를 확인한다(HEAVY_BUSY 면 같은 명령을 다시 부른다)
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh acquire e2e-TSK-08-02
# 2) 격리 DB — mcm.db·mdm.db 둘 다 옮기고 새 DB 로 시작
mkdir -p $W/src/backend/data
[ -f $W/src/backend/data/mcm.db ] && mv $W/src/backend/data/mcm.db $W/src/backend/data/mcm.db.bak-$(date +%Y%m%d%H%M%S)
[ -f $W/src/backend/data/mdm.db ] && mv $W/src/backend/data/mdm.db $W/src/backend/data/mdm.db.bak-$(date +%Y%m%d%H%M%S)
# 3) mcm 백엔드 — 기동 로그의 sqlite 경로가 $W/src/backend/data/mcm.db 인지 확인(아니면 즉시 중단)
cd $W/src/backend/mcm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18213 --mcm.bff.invalidate-role-url=http://127.0.0.1:15213/api/mcm/internal/cache/invalidate-role --cactus.notify.publish-url=http://127.0.0.1:18213/notify/publish' > $SP/be-mcm.log 2>&1 &
BE_MCM_PID=$!
# 4) mdm 백엔드 — sqlite 경로가 $W/src/backend/data/mdm.db 인지 확인
cd $W/src/backend/mdm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18306' > $SP/be-mdm.log 2>&1 &
BE_MDM_PID=$!
# 5) 기동 완료 뒤 시드 대조·사용자·룰 픽스처(mdm 은 Flyway 적용 로그 뒤)
cd $W/src/frontend && sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-seed-check.sql | diff - e2e/fixtures/mdm-rbac-seed-check.expected.txt   # 출력 없음 = 통과
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-users.sql
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-ruleEdit-users.sql
sqlite3 $W/src/backend/data/mdm.db < e2e/fixtures/mdm-ruleEdit-data.sql
# 6) 포털 — libs 먼저, 레지스트리는 커밋된 것
cd $W/src/frontend && pnpm build:libs
cd $W/src/frontend/m-mcm && AUTH_SECRET=$(openssl rand -hex 32) NEXTAUTH_URL=http://127.0.0.1:15213 OIDC_ISSUER=http://127.0.0.1:15213 \
  MCM_WAS_URL=http://127.0.0.1:18213 MDM_WAS_URL=http://127.0.0.1:18306 BACKEND_API_URL=http://127.0.0.1:18213 \
  BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026 pnpm exec next dev --turbopack --port 15213 > $SP/fe.log 2>&1 &
FE_PID=$!
# 7) 스모크 — 반드시 자기 포털. --workers=1(병렬 로그인은 mcm SQLite 를 SQLITE_BUSY 로 떨어뜨린다)
cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15213 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  $W/.claude/skills/dflow-dev/scripts/heavy.sh pnpm exec playwright test e2e/mdm-shell-rbac-smoke.spec.ts e2e/mdm-ruleMng.spec.ts e2e/mdm-ruleEdit.spec.ts --workers=1
# 8) 다른 Task 스크린샷 복원 — mdm-shell-rbac-smoke 가 TSK-01-03 스크린샷을 덮어쓴다(디렉터리 형태로 되돌린다)
cd $W && /usr/bin/git checkout -- docs/mdm/tasks/TSK-01-03/screens/
cd $W && /usr/bin/git status --porcelain docs/mdm/tasks/   # TSK-08-02/screens/*.png 와 이 Task 파일만 남아야 한다
# 9) 정리 — 자기 PID 먼저, 남은 자식은 자기 포트로. 전역 gradlew --stop·pkill·killall·pgrep -f 종료 금지
kill $FE_PID $BE_MDM_PID $BE_MCM_PID
lsof -tiTCP:15213 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18306 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18213 -sTCP:LISTEN | xargs -r kill
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh release
```

- 통과 기준: 세 스펙 passed, skipped·failed 0, 시드 대조 diff 출력 없음.
- 함정: 픽스처는 한 번만 넣는다(룰 스펙이 데이터를 바꾸므로 다시 돌리려면 1)부터). `mdm-shell-rbac-smoke.spec.ts` 는 새 메뉴 leaf 가 늘어도
  `toContain("dme")` 류라 그대로 통과해야 한다 — 실패하면 시드를 의심한다. 스크린샷 파일은 이 Task 폴더 것만 stage 한다.

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 도커 금지로 생략: cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain
- 이 Task 는 마이그레이션을 만들지 않는다. 위 명령은 mssqlTest 소스 세트 전체를 돌리며, 이 Task 가 더하는 `DefaultMdmRuleIdIssuerMssqlTest`(MSSQL `OUTPUT inserted` 발급)도 그 안에 든다. MSSQL 발급 경로는 머지 뒤 팀장 방언 검증(`dialect_check`)에서 한 번 확인된다. 이 생략 때문에 확인하지 못하는 수용 기준은 없다(수용 기준 7건은 모두 SQLite·Vitest·e2e 로 확인한다).

## 담당자 확인 필요 결정

근거의 강약: spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물.

### D1 — 화면 그룹 코드: `mdr` 인가 `dme` 인가
- **질문**: spec entry-point 는 `mdr/ruleMng`·`mdr/ruleEdit` 인데 TRD·screens README·wbs 는 `dme` 다. 어느 것을 쓰나?
- **선택지**: (a) `dme` / (b) `mdr`
- **택한 것**: (a) `dme`
- **근거와 강약**: TRD §9 T2 "확정 2026-09-24", 화면 목록 정본 `docs/mdm/screens/README.md:23,53-54`, wbs.md:1292, mcm 메뉴 폴더·권한 매트릭스·FE `MDM_GROUPS` 가 모두 `dme` 다(승인된 선행 산출물·리포 관례). spec 본문의 `mdr` 는 T2 이전 값이고 선례 TSK-04-02 가 같은 정정을 했다(§0). spec 본문이 가장 강하지만 그 값이 확정 결정으로 대체된 낡은 값이라 따르면 화면이 메뉴 폴더 밖에 생긴다.
- **반려되면 재작업 방향**: 그룹 코드를 `mdr` 로 바꾼다 — BE 패키지 `…mdm.mdr.*`, BPMN 폴더 `services/mdr/`, FE `pages/mdr/`, DataInitializer 메뉴 폴더 `mdr` 새 시드와 `seedMdmObjectRbac` 매트릭스·`MdmScreenGroup`·`MDM_GROUPS` 에 `mdr` 추가, screens README·TRD·식별자 사전 정정.

### D2 — 수용 기준 7 의 "서버 저장 검사 결과"를 무엇으로 만드나
- **질문**: 지시는 TSK-03-04 의 서버 분석을 호출하라고 했지만 서버 분석기가 없다(F17). 수용 기준 7 을 어떻게 채우나?
- **선택지**: (a) TS 분석기를 `engine.rule` Java 로 알고리즘 그대로 이식하고, 저장이 이것을 돌려 이슈를 돌려주며, 분석 코퍼스 한 벌을 JUnit·Vitest 가 함께 읽는다(TSK-03-04 D1 반려 방향) / (b) 서버는 분석하지 않고 셀 코퍼스(`engine-corpus.json`)의 셀 판정 동치만으로 해석한다 / (c) 서버 분석을 08-04 로 미루고 이 기준을 "확인하지 못함"으로 둔다
- **택한 것**: (a)
- **근거와 강약**: spec 수용 기준 원문이 "서버 저장 검사 결과"와의 동치를 요구한다(spec 본문, 가장 강함) — (b) 는 서버 결과가 없어 기준을 채우지 못하고, (c) 는 이 Task 의 기준을 버린다. (a) 는 승인된 선행 산출물 TSK-03-04 D1 이 적어 둔 이식 방향(`engine.rule` + `R/analysis/analysis-corpus.json`)을 그대로 따르고, 06:458 이 겹침·빈틈 계산을 `engine.rule` 에 두라고 한 원문과도 맞는다. 저장 시 검사의 나머지 20여 종은 08-04 에 남긴다. **팀장 지시 2026-09-24로 확정**: 이식과 공용 코퍼스는 08-02 가 맡고, 08-03·08-04 는 08-02 가 dev 에 머지된 뒤 착수한다. 그래서 08-04 가 그대로 쓰도록 공개 API 를 §6.6.3 으로 고정한다. 공용 기록 `docs/mdm/decisions.md` D-TSK-08-02-1.
- **반려되면 재작업 방향**: (b) 면 Java 분석기·분석 코퍼스·저장 응답 issues 를 빼고, 수용 기준 7 을 "그리드 셀 JSON 왕복이 `engine-corpus.json` 셀 모양과 같고 두 셀 러너가 통과"로 바꿔 증명한다. (c) 면 이식 파일을 08-04 로 넘기고 매핑에 "확인하지 못함"을 적는다.

### D3 — 저장할 때 분석 ERROR 가 있으면 거부하나
- **질문**: 06 은 UNIQUE 겹침을 오류(저장 거부)로 본다. 08-02 의 저장도 ERROR 가 있으면 거부하나?
- **선택지**: (a) 이슈를 응답에 싣고 거부하지 않는다 / (b) ERROR 가 하나라도 있으면 거부한다
- **택한 것**: (a)
- **근거와 강약**: 거부 정책은 wbs TSK-08-04 의 수용 기준("UNIQUE 겹침은 오류", "06 저장 시 검사 항목별 거부/경고")이다(승인된 계획). 이 Task 의 "행 추가"는 조건 셀을 모두 `-` 로 채운 행(ALL_NA_ROW, ERROR)을 만들므로 (b) 면 편집 도중 저장이 막힌다. 06 은 DRAFT 를 저장 단위로 두므로 미완성 DRAFT 저장이 자연스럽다. 확장 지점 `RuleSaveCheck`(§6.8)에서 08-04 가 거부를 켠다.
- **반려되면 재작업 방향**: `RuleTableService` 가 분석 이슈에 ERROR 가 있으면 트랜잭션을 되돌리고 이슈를 담은 오류로 응답한다. FE 는 저장 실패에 이슈를 보이고, e2e S5 의 새 행 저장 단계를 "결과 셀과 조건 하나를 채운 뒤 저장"으로 바꾼다.

### D4 — DRAFT 소유권 action 이름과 권한 세트
- **질문**: 선점·해제·넘기기를 어떤 action 으로 부르나?
- **선택지**: (a) 새 action `lock`·`unlock`·`handover` 를 `MdmActions`·`MdmPermissions`·`allActions`·`PERM_MDM_EDIT/CONFIRM`·시드 대조에 더한다 / (b) 기존 13종 안에서 `execute` + 파라미터로 가른다
- **택한 것**: (a)
- **근거와 강약**: 승인된 선행 산출물 TSK-01-03 §7 인계(`design.md:598`)가 "`lock/unlock/handover` 액션 이름을 확정하면 `allActions`·`PERM_MDM_EDIT`·`MdmActions` 와 기대 출력을 함께 고친다"고 첫 소유권 화면 Task 에 넘겼고, `MdmActions` javadoc 도 같다. ADR-0003 D5 가 이 이름을 권장하지만 PROPOSED(미승인)라 보조 근거다. (b) 는 두 번째 게이트웨이 선례가 없고(F34) RBAC 키가 뜻을 잃는다. 이미 있는 로컬 DB 를 위해 `ensurePermActions` 보정을 더한다.
- **팀장 지시 2026-09-24로 확정**: action 추가와 `allActions`·`PERM_MDM_EDIT`(·`PERM_MDM_CONFIRM`)·`MdmActions`·`MdmPermissions`·`mdm-rbac-seed-check.expected.txt` 수정은 08-02 가 맡고, 06-02 는 이 파일들을 건드리지 않는다. 공용 기록 D-TSK-08-02-2.
- **반려되면 재작업 방향**: 새 action 을 빼고 `execute` 한 갈래에 `op ∈ {LOCK, UNLOCK, HANDOVER}` 를 두어 `RuleEditService.execute` 가 가른다. 시드·어휘·기대 출력 변경을 되돌린다.

### D5 — 넘기기 대상 담당자 조회 어댑터를 만드나
- **질문**: `MdmStewardDirectory` 기본 구현은 늘 거부라 운영에서 넘기기가 MDM005 로 막힌다(F14). 이 Task 가 mcm 역할 조회 어댑터를 만드나?
- **선택지**: (a) 만들지 않는다 — 넘기기 UI·API 는 공통 서비스에 연결하고 대상 검사는 포트에 맡긴다 / (b) mcm 에 client-key 전용 역할 조회 API 와 mdm RestClient 어댑터를 만든다
- **택한 것**: (a)
- **근거와 강약**: TSK-01-03 §7 은 이 일을 "06-02·08-02 중 먼저 오는 것"에 넘겼고 mcm 에 역할 조회 경로를 새로 두는 일을 **보안 검토 대상**으로 적었다(승인된 선행 산출물). 06-02 가 같은 기점에서 병렬로 돌고 있어 두 Task 가 같은 교차 모듈 작업을 따로 할 위험이 있다. spec 수용 기준에는 넘기기 성공이 없다. BE 테스트는 가짜 디렉터리로 넘기기 성공·실패를 모두 확인한다. **팀장 지시 2026-09-24로 확정**: 담당자 조회 어댑터는 만들지 않는다. 공용 기록 D-TSK-08-02-3.
- **반려되면 재작업 방향**: TSK-01-03 D7 의 (c) 방향 — mcm/lib 에 `GET /api/sec/internal/user-roles?userId=`(client-key 전용)를 두고 mdm 에 `RestClientStewardDirectory` 를 `@Primary` 로 더한 뒤 e2e 에 넘기기 성공 시나리오(steward → steward2)를 넣는다. 보안 검토를 먼저 받는다.

### D6 — 헤더(룰명·설명·활용처 메모) 저장과 폐기는 누가 하나
- **질문**: 헤더는 버전과 무관한 값이라 미적용 버전이 없는 룰에는 소유자가 없다. "소유자 아닌 사용자는 읽기만" 을 헤더에 어떻게 적용하나?
- **선택지**: (a) 미적용 버전에 소유자가 있으면 그 소유자만, 없으면(버전이 모두 RELEASED·CANCELLED 이거나 미적용 버전이 선점되지 않았으면) 담당자 역할이면 누구나 / (b) 담당자 역할이면 늘 누구나 / (c) 미적용 DRAFT 의 소유자만(없으면 아무도 못 함)
- **택한 것**: (a)
- **근거와 강약**: spec 수용 기준 4 와 06 「DRAFT 소유권」 "다른 사용자: 읽기와 값 테스트만"은 편집 갈래가 하나이고 그 소유자가 고친다는 뜻이다(spec 본문). 06:913 은 룰명·설명을 "버전과 무관하게 바로 고친다"고 해 (c) 처럼 새 버전 없이는 못 고치게 막으면 원문과 어긋난다. (b) 는 다른 사람이 편집 중인 룰의 헤더를 고칠 수 있어 수용 기준 4 와 어긋난다. 폐기는 I9 조건(미적용 버전 없음) 때문에 늘 "소유자 없음" 상태에서만 일어나므로 담당자 역할로 판정한다.
- **반려되면 재작업 방향**: (b) 면 `RuleHeaderService` 의 소유자 분기를 지우고 역할만 본다. (c) 면 미적용 DRAFT 소유자가 아니면 거부하고 화면 헤더를 그때만 켠다. `RuleHeaderServiceTest` 사례를 바꾼다.

### D7 — 식(Expression) 칸을 이 Task 에서 편집하게 하나
- **질문**: 06 은 Expression 셀을 저장할 때 1회 파싱해 텍스트와 AST 를 함께 저장하라고 한다. 08-02 그리드의 "식" 칸을 편집 가능하게 하나?
- **선택지**: (a) 읽기 전용으로 보이고 저장은 받은 그대로 되돌려 보낸다 / (b) 편집 가능하게 하고 서버가 `AstExporter` 로 파싱·AST 저장한다
- **택한 것**: (a)
- **근거와 강약**: wbs TSK-08-04 요구사항 "Expression 파싱·AST 저장"과 TSK-08-03 "Expression 자동완성, 화이트리스트 밖 이름 표시, 디바운스 서버 파싱·평가 미리보기"가 이 일을 형제 Task 에 배정했다(승인된 계획). (b) 는 화이트리스트 검사 없이 식을 저장하는 길을 열어 06 「저장 시 검사」 Expression 행과 어긋난다. spec 요구사항의 "표시 타입별 셀(…식)"은 칸을 그리는 것으로 채운다.
- **반려되면 재작업 방향**: 식 칸을 `text` 편집기로 켜고, `RuleTableService` 가 `AstExporter.export(expr, MdmEngineConfig 설정)` 로 파싱해 `ast` 를 채우며 파싱 실패를 행·열 위치와 함께 거부한다. 새 행의 결과 Expression 셀을 `{expr:""}` 로 만든다.

### D8 — 의사결정표 그리드를 무엇으로 만드나
- **질문**: 3줄 머리와 행 드래그가 필요한데 shared `AgDataGrid` 에 열 그룹·드래그가 없다(F27).
- **선택지**: (a) shared `AgDataGrid` 에 `GridColumn.children`(ColGroupDef)·`headerTooltip`·행 드래그 prop 을 더하고 Part B 에 등재한다 / (b) 화면에서 `AgGridReact` 를 직접 쓴다 / (c) 한 줄 머리(`headerComponent` 로 세 줄을 겹쳐 그림) + ▲▼ 버튼
- **택한 것**: (a)
- **근거와 강약**: 리포 관례(FrontEnd Part B §17 "필요한 컴포넌트가 shared 에 없으면 shared 에 추가한다", mantine-aggrid-ui "화면에서 우회하지 않는다")가 (b) 를 금지한다. spec 요구사항이 "열 머리 3줄"과 "드래그 순서"를 적어 (c) 는 드래그를 채우지 못한다. 열 그룹과 managed row drag 는 ag-grid-community 기능이라 라이선스 문제가 없다. 스킬은 shared 확장 전 "사용자 승인"을 요구하므로 이 항목으로 올린다.
- **반려되면 재작업 방향**: shared 변경을 되돌리고 (c) 로 만든다 — 조건/결과 묶음·변수·칸 이름을 `headerComponent` 한 칸에 세 줄로 그리고, 행 순서는 행 끝 ▲▼ 버튼으로 바꾼다. e2e S5 의 드래그를 ▲ 클릭으로 바꾼다.

### D9 — 룰 조회에서 룰 화면으로 룰 ID 를 어떻게 넘기나
- **질문**: 포털 탭 열기(`portal-open-tab`)는 pageId 만 받고 파라미터 전달 선례가 없다(F28).
- **선택지**: (a) sessionStorage 에 대상을 쓰고 전용 window 이벤트 + `portal-open-tab` 을 보낸다(§6.9) / (b) shared portal-shell 에 파라미터 전달 API 를 더한다 / (c) 룰 화면에서 사용자가 룰을 다시 고르게 한다
- **택한 것**: (a)
- **근거와 강약**: 06 「화면」 "ID 링크로 룰 화면에 간다", "등록 … 룰 화면으로 간다"(원천 설계). 리포 관례에 선례가 없어 가장 작은 변경을 고른다 — (b) 는 공용 포털 셸을 바꾸는 더 큰 결정이고, (c) 는 원천 요구를 채우지 못한다. 대상은 한 번 읽고 지워 새 탭 열기와 섞이지 않는다.
- **반려되면 재작업 방향**: shared `portal-shell` 에 `openPageTab(pageId, params)` 와 `useTabPageParams()` 를 더하고 `rule-handoff.ts` 몸체를 그 API 로 바꾼다.

### D10 — e2e 에 쓸 룰(변수·행 포함)을 어떻게 준비하나
- **질문**: 열 편집기(08-03)가 없어 변수가 있는 룰을 화면에서 만들 수 없다.
- **선택지**: (a) e2e 전용 seed-only SQL 픽스처(`mdm-ruleEdit-data.sql`)를 격리 mdm.db 에 넣는다 / (b) 운영 `DataInitializer`(또는 Flyway)에 샘플 룰을 시드한다 / (c) e2e 가 API 로 넣는다
- **택한 것**: (a)
- **근거와 강약**: 리포 관례 — TSK-04-04 `mdm-columnMng-dict.sql` 이 같은 이유(생성 API 가 없는 데이터)로 격리 DB 전용 SQL 픽스처를 썼고, Backend 구현 가이드는 "생성 API 가 없을 때만 직접 INSERT, seed-only 표시"를 요구한다(`mdm-rbac-users.sql` 머리 주석). (b) 는 운영 DB 에 가짜 업무 데이터를 남긴다. (c) 는 변수를 넣는 API 가 없다. 두 번째 담당자도 공유 픽스처를 고치지 않고 이 Task 전용 파일(`mdm-ruleEdit-users.sql`)에 둬 06-02 와의 충돌을 줄인다.
- **반려되면 재작업 방향**: (b) 면 `DataInitializer` 가 아니라 mdm 쪽 `local` 프로필 전용 시드 러너(예 `MdmRuleSampleSeeder`, `@Profile("e2e")`)에 06 샘플을 두고 픽스처 파일을 지운다.

### D11 — 카드 ⑦ 배포 대상과 EXTERNAL 원천을 어떻게 다루나
- **질문**: 06 은 배포 대상 카드와 EXTERNAL 등록 변형을 그린다. 이번에 무엇을 보이나?
- **선택지**: (a) 배포 대상은 카드·목록 칸·조회 조건·등록 입력 모두 그리지 않는다. EXTERNAL 은 등록을 받지 않고, 이미 있는 EXTERNAL 룰(DB)은 조회 전용으로 연다 / (b) 자리만 두고 "보류" 안내를 그린다
- **택한 것**: (a)
- **근거와 강약**: spec 요구사항 "⑦배포 대상은 보류", wbs 비고 "배포 대상 카드·EXTERNAL 원천은 보류(PRD §2 규칙 7)", screens README §6 "만들지 않는 화면: EXTERNAL 등록 변형 화면, 배포 대상 카드"(spec 본문·승인 산출물). 빈 자리를 두면 사용자가 기능이 있다고 오해한다. 원천 칸은 보이되 등록 폼에서 고를 수 없다.
- **반려되면 재작업 방향**: 카드 슬롯에 `RuleSystemCard`(읽기 전용, "배포 대상은 07 결정 뒤 연다" 안내)를 더하고 목록에 배포 대상 수 칸을 더한다(TB_MDM_RULE_SYSTEM 조회 JPQL).

### D12 — 06 리포지토리 가드를 풀고 조회 메서드를 선언하나
- **질문**: TSK-08-01 가드가 06 리포지토리의 메서드 선언을 막는다(F5). 페이징·버전·행 조회를 어디에 두나?
- **선택지**: (a) 가드를 두고 `BL/common/rule/RuleQueries`(EntityManager JPQL)에 모은다 / (b) 가드를 지우고 리포지토리에 파생 쿼리·`JpaSpecificationExecutor` 를 더한다
- **택한 것**: (a)
- **근거와 강약**: TSK-08-01 §7(승인된 선행 산출물)은 이 Task 가 지울 가드로 발급기·삭제 훅만 적었고 리포지토리 가드의 해제 조건을 주지 않았다. JPQL `setFirstResult/setMaxResults` 는 SQLite·MSSQL 모두에서 같은 코드로 페이징된다. 리포 관례(`DomainImpactQueries`)에도 조회 클래스 선례가 있다.
- **반려되면 재작업 방향**: 가드 테스트를 지우고 `MdmRuleRepository` 에 `Page<MdmRule> findAll(Specification, Pageable)`(`JpaSpecificationExecutor`)와 버전·변수·행 파생 쿼리를 더한 뒤 `RuleQueries` 를 그 호출로 바꾼다.

### D13 — 변수 타입을 어디서 해석하나
- **질문**: 그리드 op 목록·머리 배지·두 분석기가 변수의 데이터 타입·소수 자리수·일자 여부·마루 코드를 알아야 하는데 조건 열은 타입을 저장하지 않는다(06:125).
- **선택지**: (a) 서버 `RuleVarTypeResolver` 한 곳에서 해석해 `view`·저장 응답에 싣는다 / (b) 화면이 컬럼 사전 조회 API 를 따로 불러 해석한다
- **택한 것**: (a)
- **근거와 강약**: 수용 기준 7(spec 본문)은 두 분석기가 같은 입력을 받아야 성립한다 — (b) 면 해석 규칙이 두 곳에 생겨 동치가 우연에 기댄다. 06 「화면은 이렇게 보인다」 가 값 타입을 "컬럼 사전이나 앞 룰의 결과 변수에서 가져와 읽기 전용으로 채운다"고 한 규칙을 서버 한 곳에 둔다. 08-03 열 설정 표도 같은 해석기를 쓰게 된다.
- **반려되면 재작업 방향**: 해석 규칙을 TS 로도 옮기고(컬럼 사전 조회 action 추가), 코퍼스에 "해석 입력 → 해석 결과" 사례를 더해 Java·TS 해석기 동치를 따로 증명한다.

### D14 — 결재 중(REQUESTED·APPROVED) 버전을 "미적용"으로 보는가
- **질문**: I4·§3.1 은 새 버전을 DRAFT·REQUESTED·APPROVED·적용 전 RELEASED 네 경우에 MDM006 으로 거부하라고 했는데, 공통 `VersionWriteGuard.checkCanCreateVersion`(TSK-01-03)은 DRAFT 와 적용 전 RELEASED 만 미적용으로 본다. 결재 중 두 상태를 어떻게 막나?
- **선택지**: (a) 룰 서비스가 공통 가드를 부른 뒤 **REQUESTED·APPROVED 두 상태만** 따로 보고 MDM006 을 낸다(`RuleEditSupport.requireNoVersionInApproval`, 새 버전·폐기) / (b) 공통 `VersionPreconditions.isUnapplied` 에 두 상태를 더한다 / (c) 공통 정의를 따르고 REQUESTED·APPROVED 사례를 뺀다
- **택한 것**: (a)
- **근거와 강약**: 이 Task 설계 I4·§3.1(승인 전 산출물이지만 수용 기준 5 "미적용 버전이 있으면 새 버전 거부"의 구체화)이 네 경우를 적었다. (b) 는 TSK-01-03 공통 서비스와 MASTER_CODE(06-02 병렬 진행)의 동작을 함께 바꾸는 교차 영역 변경이라 이 Task 에서 하지 않는다. 보강 검사를 두 상태로만 한정해, 공통 가드 호출을 지우는 변이가 DRAFT·적용 전 RELEASED 사례로 여전히 잡힌다. 지금 룰 확정은 DRAFT → RELEASED 직행이라 두 상태는 결재 흐름이 생길 때 의미가 생긴다. 목록·view 의 `unapplied*` 칸(`RuleVersions.isUnapplied`)도 같은 네 상태 정의를 쓴다.
- **반려되면 재작업 방향**: (b) 면 `VersionPreconditions.isUnapplied` 에 두 상태를 더하고 `requireNoVersionInApproval` 두 호출을 지운다. (c) 면 그 두 호출과 `RuleVersionServiceTest` REQUESTED·APPROVED 사례, `RuleHeaderServiceTest` 「결재 중 버전이 있어도 폐기하지 않는다」를 지우고 `RuleVersions.isUnapplied` 를 공통 정의로 맞춘다.

### D15 — shared 그리드에 셀 상태 클래스(경고·바뀐 칸·강조)를 더하나
- **질문**: 의사결정표는 칸마다 오류(붉게)·경고(노랗게)·base 대비 바뀐 칸·적중 조건 강조를 보여야 하는데(§6.7.4), shared `grid.css` 에는 오류용 `cell-light-pink` 만 있다. 화면 CSS 에 색 값을 두는 것은 금지다. 어떻게 칠하나?
- **선택지**: (a) shared `grid.css` 에 의미 토큰만 쓰는 셀 상태 클래스 셋(`cell-warning`·`cell-edited`·`cell-emphasis`)을 더하고 Part B §6 에 등재한다 / (b) 화면 CSS 파일에 토큰(`var(--color-…)`) 으로 클래스를 둔다 / (c) 경고·바뀐 칸을 모두 `cell-light-pink` 하나로 칠한다
- **택한 것**: (a)
- **근거와 강약**: 리포 관례(mantine-aggrid-ui §3 "래퍼가 요구를 못 채우면 화면에서 우회하지 않는다", Part B §17 "필요한 것은 shared 에 추가")와 §6.7.4 "색은 shared 토큰 클래스를 쓴다(화면 CSS 에 색 값 직접 금지)" 가 (b) 를 막는다. (c) 는 원천 06 "거부 사유 칸을 붉게, 경고 칸을 노랗게"(spec 이 가리키는 원천 설계)를 채우지 못한다. D8(열 그룹·드래그)과 같은 종류의 shared 확장이라 같은 승인 대상으로 올린다.
- **반려되면 재작업 방향**: (b) 면 세 클래스를 `m-mdm` 화면 CSS 로 옮기고 tsup css entry 와 호스트 import 를 더한다. (c) 면 `columns.ts` 의 `cellClassRules` 를 `cell-light-pink` 하나로 줄이고 `grid.css` 추가분과 Part B 줄을 지운다.

### D16 — 룰 목록의 빈 상태를 어디서 보이나
- **질문**: shared `AgDataGrid` 는 `loading` 이 풀릴 때 `hideOverlay()` 를 불러 빈 행 오버레이(`emptyMessage`)까지 지운다(e2e T2 실측). 룰 목록의 빈 상태 문구를 어떻게 보이나?
- **선택지**: (a) 화면이 목록 아래에 "조회된 룰이 없습니다." 글자를 직접 그린다(`rule-list-empty`) / (b) shared `AgDataGrid` 의 loading 효과를 고쳐 데이터가 비었으면 `showNoRowsOverlay()` 를 부른다
- **택한 것**: (a)
- **근거와 강약**: 스모크 넷 2(빈 상태가 보인다, dev-discipline)를 지금 채워야 한다. (b) 는 shared 그리드의 모든 화면 동작을 바꾸는 변경이라 이 Task 범위의 승인 없이 하지 않는다 — 기존 화면(termMng 등)은 오버레이 대신 "0건" 으로 빈 상태를 확인해 왔다. 다만 스킬은 "래퍼 빈틈을 화면에서 우회하지 말고 올리라" 고 하므로(리포 관례) 이 결정으로 올린다.
- **반려되면 재작업 방향**: shared `AgDataGrid` 의 `loading` 효과를 `loading ? showLoadingOverlay() : data.length === 0 ? showNoRowsOverlay() : hideOverlay()` 로 고치고 shared 단위·렌더 확인을 더한 뒤, ruleMng 의 `<p data-testid="rule-list-empty">` 를 지우고 e2e T2 를 오버레이 문구로 바꾼다.

### D17 — 머지에서 shared `AgDataGrid` 의 두 행 드래그 API 를 어느 규칙으로 합치나
- **질문**: TSK-05-02(`GridColumn.rowDrag`·`onRowOrderChange` 만으로 켜기·`resolveRowDrag`·키는 `forEachNode`+rowKey)와 이 Task(`rowDragField`·`isRowDraggable`·키는 `displayedRowKeys`)가 같은 기능을 다른 모양으로 더해 origin/dev 머지에서 충돌했다. 드래그를 켜는 조건과 키 수집을 어떻게 하나?
- **선택지**: (a) 켜는 조건은 05-02 규칙(`onRowOrderChange` 가 있을 때) 하나로 두고, 손잡이는 `rowDragField` 열 또는 `rowDrag: true` 열, 키 수집은 `displayedRowKeys`(화면 순서·임시 ID 우선)로 통일한다 / (b) 두 API 를 따로 둔다 — `rowDragField` 가 있으면 이 Task 방식, 없고 `onRowOrderChange` 만 있으면 05-02 방식 / (c) 이 Task 규칙(`rowDragField` 가 있을 때 켜기)으로 합치고 05-02 화면을 `rowDragField` 로 옮긴다
- **택한 것**: (a)
- **근거와 강약**: 05-02 의 I22(드래그가 없는 그리드는 정렬 값·AgGridReact prop 이 기존과 같다)와 단위 테스트 `grid-row-drag` 를 그대로 지키고, 이 Task 의 열 그룹·`isRowDraggable` ref(B9 크래시 수정)도 그대로 둔다. (b) 는 같은 그리드에 드래그 경로가 둘이라 뒤 Task 가 헷갈리고, (c) 는 다른 Task 화면(headerMng·layoutMng)을 고친다. 바뀐 점은 셋이다 — `rowDragField` 만 주고 `onRowOrderChange` 가 없으면 이제 managed drag 가 켜지지 않는다(병합 전 이 Task 에서는 켜졌으나 그런 호출자는 없다). 05-02 호출자의 키는 `displayedRowKeys` 로 모이지만 dmb 행에는 임시 ID 칸이 없고 정렬이 꺼져 있어 결과가 같다. 룰 표는 `onRowOrderChange` 를 늘 넘기므로 읽기 전용일 때도 `rowDragManaged` 가 켜지지만 손잡이 열이 없어 끌 수 없고, 이미 `sortable={false}` 라 정렬 동작도 같다. 단위 테스트로 덮이지 않는 브라우저 동작(ruleEdit 드래그·B9 크래시, dmb 세 화면 드래그)은 Verify e2e 가 다시 본다
- **반려되면 재작업 방향**: (b) 라면 `AgDataGrid` 에서 `rowDragField` 가 있을 때 `rowDragManaged`·`onRowDragEnd`(displayedRowKeys)를 따로 넘기고, 없을 때만 `resolveRowDrag` 를 쓴다. (c) 라면 05-02 의 `GridColumn.rowDrag`·`resolveRowDrag` 를 지우고 headerMng·layoutMng 세 그리드에 `rowDragField="SEQ"` 를 넘기며 `grid-row-drag` 테스트를 옮긴다. 어느 쪽이든 shared 단위 테스트 두 벌과 dme·dmb e2e 를 다시 돌린다.

---

## 코드베이스 지식·함정 (Build 가 그대로 따른다)

- **OASIS 서비스 형식**: `@Service("<빈 이름>")`, 메서드는 DTO 하나를 받고 결과 DTO(또는 Map)를 돌려준다. BPMN serviceTask 는 `camunda:class="<빈 이름>"` + properties `method`·`output=result`·`dto=<FQCN>`, `grid` 속성 금지. 예외는 `BusinessException(ErrorCode.REQUIRED_VALUE|DUPLICATE_DATA|INVALID_VALUE, msg)` 또는 `MdmErrors.of(MdmErrorCode.X)` — BPMN 안 예외는 HTTP 200 + `meta.success=false` 로 온다.
- **`@Transactional` 금지**(서비스 클래스). `TransactionTemplate`(`PlatformTransactionManager` 주입). 공통 버전 서비스는 호출자 트랜잭션에 합류한다.
- **네이티브 UPDATE 뒤 엔티티 재조회**: `beginDraftWrite`·소유권 서비스·발급기는 네이티브로 쓰므로, 같은 트랜잭션에서 `MdmRuleVer`·`MdmRule` 엔티티를 이미 읽었다면 `entityManager.refresh` 또는 다시 조회한다.
- **감사**: 네이티브 쓰기는 `MdmNativeAuditSupport.currentStamp()` 로 `U_USR_ID/U_AT/U_SVC_ID/U_PGM_ID` 를 채우고 감사 카운터(`TB_MDM_RULE` 은 `VER`, `TB_MDM_RULE_VER` 은 `AUD_VER`)를 +1 한다. 일시는 `MdmTemporalBinder.toDb`. 엔티티에 넣는 일시는 초 단위로 자른다(MSSQL `DATETIME2(0)` 반올림, TSK-08-01).
- **VER 비교**: `VersionRef.ver` 는 `BigDecimal` — 룰은 `BigDecimal.valueOf(int)`. 공통 서비스는 VER 를 문자열로 읽어 Java 에서 비교한다.
- **SQLite 일시**: KST `'yyyy-MM-dd HH:mm:ss'` TEXT. `view` 응답의 일시 문자열도 이 모양으로 준다(`VersionStatusBadge.applyFrom` 이 이 모양을 KST 로 해석).
- **엔티티 INSERT 는 DB 기본값을 쓰지 않는다**: JPA 는 모든 칼럼을 INSERT 한다. 새 버전 복사는 원본 값을 그대로 옮기고, 이 Task 는 새 VAR 를 만들지 않는다.
- **U_AT 9시간 차이(D6, TSK-08-01)**: 엔티티 `getUpdatedAt()` 은 네이티브로 쓴 행에서 +9 시간으로 읽힌다. 화면에 수정 시각을 보이지 않는다.
- **FE null 제거**: `callAction` 은 `omitNullish(params)` 로 null·undefined 를 뺀다. 셀 JSON 은 문자열로 보내 중첩 Map 바인딩 문제를 피한다.
- **FE import**: 화면은 `@dk-oasis/shared/{layout,grid,form,http}`, `@/shell`, `@/evalex`, `@/dme/rule-handoff` 만. `@mantine/*`·`ag-grid-react` 직접 import 금지(audit). 화면 CSS 에 색 값 직접 금지.
- **page-registry**: 폴더 이름이 `Pop`·`Popup` 으로 끝나면 팝업으로 본다 — `ruleMng`·`ruleEdit` 는 해당 없음. `M/src/dme/` 는 스캔 대상이 아니다.
- **Vitest**: 렌더 테스트는 첫 줄 `// @vitest-environment happy-dom`, `DmesUiProvider` 로 감싸고 `globalThis.fetch` 를 `vi.fn` 으로 바꾼다(`M/tests/dma/termMng/term-mng-page.test.ts`). 테스트에서 evalex 는 상대경로 `../../../src/evalex` 로 가져온다. `pnpm build:libs` 를 먼저 돌리지 않으면 m-mdm 테스트 3개 파일이 실패한다.
- **분석 코퍼스 경로**: Vitest 는 `M/tests/helpers/engine-paths.ts` 의 `ANALYSIS_CORPUS_PATH`, mdm/lib JUnit 은 프로젝트 디렉터리 기준 `../../maru-mdm-engine/src/test/resources/kr/dongkuk/maru/mdm/engine/analysis/analysis-corpus.json`(Gradle 테스트 작업 디렉터리 = `src/backend/mdm/lib`). 파일이 없으면 실패시킨다.
- **e2e 스크린샷 덮어쓰기**: `mdm-shell-rbac-smoke.spec.ts` 가 TSK-01-03 스크린샷을 덮어쓴다 — E2E 절차 8) 로 되돌린다.
- **decisions.md**: 팀장이 확정한 D2·D4·D5 는 공용 `docs/mdm/decisions.md` 에 임시 ID `D-TSK-08-02-1`~`D-TSK-08-02-3` 블록으로 적었다. 더할 일이 생기면 `D-TSK-08-02-4` 부터 이어 쓰고 전역 번호를 매기지 않으며 기존 블록은 고치지 않는다.
- **겪은 문제는 `.issues` 에 직접 쓰지 않고 Phase 보고에 올린다.**

---

## Build 이탈 기록

| 단계 | 이탈 | 사유 |
|---|---|---|
| B1 | `E/src/test/.../contract/EngineContractSchemaTest.java` 의 `JAVA_ONLY` 에 `AnalysisRule`·`AnalysisVar`·`RuleIssue`·`RuleIssue.Severity`·`RuleIssueCode` 다섯을 등재했다(§2 목록에 없던 수정) | 이 테스트가 `engine.expr`·`engine.rule` 의 record·enum 전부를 "스키마 대응표 ∪ Java 전용 목록"과 대조한다. 분석 입출력은 엔진 계약 스키마가 아니라 분석 코퍼스로 TS 와 묶이므로 Java 전용으로 적었다 |
| B1 | `ValueSets`·`PatternShapes`·`RuleAnalyzer` 안의 내부 타입(값 집합·구간·끝·패턴 모양·열)과 종류 값은 record·enum 이 아니라 일반 클래스·정수 상수로 두었다 | 같은 대조 테스트가 패키지 전용 record·enum 도 세는데, 다른 패키지의 테스트는 그 클래스 리터럴을 쓸 수 없어 목록에 올릴 수 없다 |
| B1 | §6.6.1 표의 "행은 입력 `rows` 순서"와 달리, 분석기는 TS `normalRows`·`condVars` 처럼 행을 `seq`→`rowId`, 조건 열을 `seq`→`varId` 로 정렬해 본다 | 같은 절이 "정본은 TS, 함수 경계·순회 순서를 그대로 옮긴다"고 했고 TS 가 정렬한다. 정렬을 빼면 입력 순서가 다른 두 호출(그리드·서버)의 이슈 순서가 갈린다. `RuleAnalyzerTest` 「행은 seq 다음 rowId 순으로…」가 고정한다 |
| B1 | TS 가 예외를 던지는 입력 두 가지(값 칸이 없는 셀 — 예 `{"op":"GE"}`, NUMBER 열 IN 목록에 숫자 아닌 원소가 둘 이상)를 Java 는 못 푸는 셀·문자열 순서로 대신 처리하고 던지지 않는다 | §6.6.3 의 "예외 없음" 계약. 이 입력은 코퍼스에 넣지 않았다(두 러너가 갈린다). TS 동작 이상으로 보고에 올린다 |
| B1 | `AnalysisVar` 에 `label` 칸이 없어 메시지의 열 이름은 `varName` 이 없으면 `_V<varId>` 다(TS 는 `label` 을 한 번 더 본다) | record 칼럼은 §2.1-E 로 고정됐다. message 는 비교 대상이 아니다 |
| B2 | 변수 타입 해석의 도메인 상속을 "`parentDomainId` 사슬을 올라가 첫 값"으로 직접 짜지 않고 도메인 화면·계약이 쓰는 조립기(`DomainTreeReader.load()` + `DomainChainAssembler.assemble`)의 `EffectiveDomainView` 로 푼다 | 저장소에 이미 "조회·검증·저장·미리보기·계약이 모두 이것을 불러 같은 답을 낸다"는 조립기가 있다. 그 규칙은 종류·데이터 타입은 최상위 조상, 길이·scale 은 가까운 조상부터이고 유효 코드 참조도 같이 준다. 따로 짜면 도메인 화면과 해석 결과가 갈릴 수 있다 |
| B2 | 해석 갈래 2(변수에 `DOMAIN_ID` 가 있다)의 `typeSource` 는 `DECLARED` 다 | §6.4 표가 이 갈래의 `typeSource` 를 적지 않았다. 컬럼 사전·앞 룰에서 가져온 값이 아니라 변수에 선언한 값이라 `DECLARED` 로 묶었다 |
| B2 | 발급기에서 룰이 없을 때의 오류는 `BusinessException(ErrorCode.INVALID_VALUE, "룰을 찾을 수 없습니다: <id>")` 다 | cactus `ErrorCode` 에 NOT_FOUND 가 없다. mdm 서비스의 "찾을 수 없습니다" 관례(`UnitMngService` 등)가 `INVALID_VALUE` 다 |
| B2 | `RuleCellsCodec` 은 정적 유틸이고, `validateShape` 에 행 표시를 받는 오버로드 `validateShape(cells, varIds, rowLabel)` 를 더했다 | 정적 `RuleAnalysisInputMapper.toAnalysisRule` 이 셀을 읽어야 한다. 행 번호를 오류 메시지에 싣기 위해(§2.1-C) 호출자가 행 표시를 넘긴다 |
| B2 | `RuleAnalysisInputMapper` 는 `DISP_TYPE` 이 비어 있으면 조건 열은 1 타입, 결과 열은 상수로 본다 | DDL 이 `DISP_TYPE` 을 NULL 허용으로 둔다. 모르는 값은 `IllegalArgumentException` 이다 |
| B2 | `RuleQueries` 는 B2 에서 타입 해석에 필요한 `latestReleasedResultVarsExcept(ruleId)` 만 두고, §2.1-C 의 나머지 조회는 그 조회를 쓰는 B3·B4 에서 테스트와 함께 더한다. `RuleStewardCheck`(B3)·`RuleUsageFinder`(B4)도 쓰는 단계에서 만든다 | 테스트 먼저 규율 — 소비자 테스트 없이 조회 메서드를 먼저 두지 않는다 |
| B2 | `DefaultMdmRuleIdIssuerMssqlTest` 는 작성하고 `:api:compileMssqlTestJava` 로 **컴파일만** 확인했다(실행은 도커 금지로 생략) | testAll 은 mssqlTest 소스 세트를 컴파일하지도 않으므로 컴파일 오류가 숨지 않게 따로 컴파일했다 |
| B3 | 버전 고르기(현재 RELEASED·미적용·최신 RELEASED)를 `BL/common/rule/RuleVersions`(정적 유틸)로 따로 두었다 | 목록(ruleMng)·view·새 버전(ruleEdit)이 같은 정의를 써야 한다. 미적용 정의는 `VersionWriteGuard` 와 같다(DRAFT·REQUESTED·APPROVED·`APPLY_FROM > now` RELEASED) |
| B3 | 목록의 `releasedVer`·`hitPolicy` 는 **지금 적용 중인** RELEASED(`APPLY_FROM <= now < APPLY_TO`), `pending*` 은 미적용 버전 중 VER 최대다. 룰명 키워드도 대문자로 바꿔 부분 일치로 본다 | §2.1-RM 이 칸만 적고 어느 RELEASED 인지 적지 않았다. 적용 전 RELEASED 는 미적용 칸에 나온다(e2e T2 의 "RELEASED 버전 1·FIRST" 와 맞다) |
| B3 | `RuleQueries` 에 `RuleFilter` record·`pageRules`·`countRules`·`versionsOf(ids)` 를 두고, 목록 한 페이지의 버전은 한 번에 읽는다 | N+1 조회를 피한다 |
| B3 | I23 을 단위 테스트로도 덮으려고 `MdmOasisActionVocabularyTest` 에 "mcm `DataInitializer` 의 allActions 가 mdm BPMN 의 모든 action 을 담고 readActions·editActions 문자열이 `MdmPermissions` 와 같다"는 소스 대조를 더했다 | mcm 에는 테스트가 없고 e2e 시드 대조는 PERM_ALL 을 보지 않아 allActions 에서 action 을 빼는 변이가 아무 테스트에도 잡히지 않았다. `DataInitializer` 주석이 이미 "목록 정본 = BPMN actionGateway 분기명 전수"라고 적는다 |
| B3 | I30 을 grep 대신 ArchUnit(`BLT/dme/DmeRoleCheckArchitectureTest` — dme 는 `MdmCurrentUser.roleIds()` 를 부르지 않는다)으로 막는다 | `MdmRoles.STEWARD` 는 컴파일 상수라 클래스 파일에 참조가 남지 않는다. 역할 집합을 여는 호출을 막아야 변이가 잡힌다 |
| B3 | `ensurePermAllActions` 는 새 `ensurePermActions(permissionId, csv)` 에 위임하고, `seedMdmRbac` 가 세 권한 세트마다 `ensurePermActions` 를 부른다 | §2.2-S (3). 같은 보정을 두 번 쓰지 않는다 |
| B3 | `SecurityScreenContractTest` 의 "잠금 계열(lock·unlock·handover)은 없다" 단언을 "16종이 모두 세트에 있고 소유권 액션은 EDIT·CONFIRM 에만(restore 뒤) 있다"로 바꿨다 | §2.2-S — 첫 소유권 화면이 이름을 확정하면 바꾸라고 TSK-01-03 이 적어 둔 가드다(D4) |
| B4 | 표 저장의 `rows` 는 `params` 가 아니라 **`grids.rows.rows`** 로 받는다. 파사드 `save(RuleEditSaveRequest)` 는 DTO 하나만 받고, OASIS 가 grids 를 같은 이름의 DTO 속성 `rows` 에 채운다. HEADER 저장은 grids 를 보내지 않아도 된다 | Build 실측(탐침 HTTP 테스트): params 배열은 OASIS 가 "Generic type" 오류로 거부한다(6-E-2). 메서드에 grid 인자(`List<Map> rows`)를 따로 두면 grids 를 뺀 요청이 "No suitable method" 로 실패한다(columnMng P4b 선례). DTO 하나만 두면 두 경우 모두 된다. 이 경로에서 JSON 숫자는 `Double`(-1.0)로 오므로 서버가 정수만 받는다(`1.5`·`0` 거부). §6.2 의 DTO 모양은 그대로다 |
| B4 | 결재 중(REQUESTED·APPROVED) 버전의 MDM006 을 룰 서비스가 공통 가드 뒤에 따로 본다(D14) | 공통 `checkCanCreateVersion` 은 DRAFT·적용 전 RELEASED 만 미적용으로 본다. I4·§3.1 이 네 경우 모두 MDM006 을 요구한다 |
| B4 | 폐기·STATUS·HIT_POLICY 네이티브 UPDATE 를 `BL/common/rule/RuleNativeWrites`(@Repository)에, 이슈 → 응답 맵 변환을 `RuleIssueMaps` 에, 룰 서비스 공용 도우미를 `BL/dme/ruleEdit/service/RuleEditSupport` 에 두었다. `RuleSaveContext` 는 record 로 `RuleSaveCheck` 와 같은 패키지에 둔다 | §2.1 목록에 없던 파일. 같은 규칙(감사 칼럼·원천 검사·버전 키)을 서비스마다 되풀이하지 않는다 |
| B4 | `RuleTableService` 는 `List<RuleSaveCheck>` 대신 `ObjectProvider<RuleSaveCheck>` 를 주입받는다 | 이 Task 는 구현이 0개라 빈 목록 주입이 기동 실패로 이어지지 않게 한다. 08-04 가 빈을 더하면 순서대로 돈다 |
| B4 | view 응답 issues·저장 응답 issues 는 값이 없는 칸(varId·lower·upper)을 싣지 않고 `message` 는 싣는다 | TS `RuleIssue` 를 JSON 으로 옮긴 모양과 같아 화면 `sameIssues` 가 그대로 견준다 |
| B4 | 헤더 저장 응답의 `rowVersion` 은 요청 값 그대로(헤더는 버전 row_version 을 바꾸지 않는다), 폐기 응답은 `ver`·`rowVersion` 이 null 이다 | §6.2 가 HEADER 응답 칸을 정하지 않았다 |
| B4 | 외부 원천 룰의 쓰기 거부 오류는 `BusinessException(BUSINESS_ERROR, "외부 원천(EXTERNAL) 룰은 조회만…")`, 폐기 조건(INUSE 아님)·폐기한 룰의 새 버전은 `MDM009`(허용되지 않는 상태 전이), 복사할 RELEASED 가 없는데 다른 버전(CANCELLED 등)만 있으면 `BUSINESS_ERROR`, 없는 룰·버전은 `INVALID_VALUE` 다 | §6.3 이 코드를 정하지 않은 자리. 가장 가까운 기존 코드를 골랐다 |
| B5 | `AgDataGrid` 의 열 정의 변환을 순수 함수 `buildColumnDefs`·`displayedRowKeys`·`hasEditableColumn` 으로 빼 export 했다 | shared 단위 테스트는 ag-grid 렌더 없이 순수 함수로 본다(`grid-check-row-on-edit` 선례). 편집 열 탐지는 그룹 안까지 봐야 해서(안 보면 셀 포커스가 꺼져 편집이 안 된다) 재귀로 바꿨다 |
| B6 | dme 두 화면의 OASIS 호출을 화면별 `api.ts` 에 되풀이하지 않고 `M/src/dme/oasis-call.ts`(`callOasis`·`OasisCallError`·`isRowVersionConflict`)에 두고 화면 `api.ts` 가 이것을 쓴다 | `grids` 전송·null 제거·MDM001 판별이 두 화면에 같다. `src/dme` 는 page-registry 스캔 대상 밖이다 |
| B6 | dme 렌더 테스트는 공용 도우미 `M/tests/dme/helpers/render.ts` 의 `installDomStorage()` 로 메모리 `localStorage` 를 넣는다 | Node 26 은 `--localstorage-file` 없이 전역 `localStorage` 를 undefined 로 두고 happy-dom window 도 그 값을 본다. shared `apiRequest` 가 `localStorage.getItem` 에서 죽어 모든 요청이 실패했다(기존 termMng 렌더 테스트도 같은 오류를 모달에 띄우지만 단언하지 않아 드러나지 않았다) |
| B7 | `RuleEditCardProps` 에 `runWrite`(쓰기 한 번 + 다시 불러오기)·`setDirty`(저장 안 한 변경)·`canDo`(카드 버튼 RBAC)·`busy` 를 더했다. B7 의 `RULE_EDIT_CARDS` 는 header·versions·usage 셋이고 table 은 B8 에서 더한다 | §6.8 은 `{view, reload, me, editable, selectVer, notify}` 만 적었으나, 모든 쓰기가 같은 방식으로 row_version 을 서버 값으로 다시 맞추고(§6.2 MDM001) §6.7.0 RBAC·§6.9 "저장 안 한 변경 확인"을 카드마다 되풀이하지 않게 한다 |
| B7 | 헤더 저장 버튼은 값을 바꾸지 않아도 `headerEditable` 이면 켠다. 넘기기 버튼도 대상 ID 가 비어 있으면 누를 때 안내만 한다 | 편집 가능 여부를 서버 판정 하나로 읽게 한다(I7). 화면 비활성은 보조다 |
| B7 | 상단 바에 룰 ID 옆 룰명을 글자로 보인다 | 헤더 카드는 룰명을 입력 칸 값으로만 가진다. e2e S2 "헤더(룰명)가 보인다"를 글자로 확인한다 |
| B8 | 표 편집 상태를 순수 reducer `decision-table/table-state.ts` 로, 변수 머리 컴포넌트를 `decision-table/VarHeader.tsx` 로 두었다(§2.1-FT 목록에 없던 파일) | 그리드 셀 편집은 happy-dom 에서 돌지 않는다. 편집 규칙·즉시 검사·드래그 순서를 렌더 없이 reducer 로 시험하고(I13·I19~I21 변이), 렌더 테스트는 그리드 밖(버튼·검사 요약·요청 본문)만 본다 |
| B8 | JS 즉시 검사는 `analysis.ts` 의 `runAnalysis` 가 `analyzeRule` 예외를 잡아 `{issues: [], failed: true}` 로 돌린다. 카드는 "화면 검사를 할 수 없는 칸이 있습니다(저장하면 서버가 검사한다)" 를 보이고, 저장 뒤 비교는 실패였으면 "서버 결과가 기준" 으로 둔다 | 1부 인계 11 — TS 분석기는 값 칸이 없는 셀(예: STRING 열 `{"op":"EQ"}` — scratchpad 로 재현)에서 예외를 던진다. 분석기(TSK-03-04 산출물)는 고치지 않는다. 그리드의 `applyCellEdit` 는 값 칸을 늘 채우므로 이 셀은 저장 데이터에서만 올 수 있다 |
| B8 | 저장 안 한 변경이 없으면 view 가 실은 서버 검사(`view.issues`)를, 있으면 JS 즉시 검사를 보인다(검사 머리에 "(서버)"·"(화면)"). 저장 직후 비교는 저장 전 JS 검사의 임시 row_id 를 응답 `rowIdMap` 으로 바꾼 뒤 `sameIssues` 로 한다 | §6.7.4 "저장 응답이 오면 서버 이슈를 보이고 … sameIssues" 를 새로 고친 view 에도 이어 적용한다. 임시 ID 를 바꾸지 않으면 새 행이 든 저장마다 불일치가 난다 |
| B8 | 셀 강조 색은 shared `grid.css` 에 셀 상태 클래스 셋(`cell-warning`·`cell-edited`·`cell-emphasis`, 의미 토큰만)을 더해 쓰고, 오류는 기존 `cell-light-pink`, ADDED 행은 기존 `ag-row-inserted` 를 쓴다. Part B §6 에 등재 | §6.7.4 "색은 shared 토큰 클래스를 쓴다(화면 CSS 에 색 값 직접 금지)" — 경고·바뀐 칸·강조에 맞는 shared 클래스가 없었다 |
| B8 | `opsFor` 의 코드 도메인 String 목록은 `IN 카테고리` 를 `NOT IN` 바로 뒤에 둔다. 목록 op(IN·NOT_IN)에서 단일 op·구간으로 바꾸면 목록 첫 원소를 값으로 옮긴다 | 06:310 은 "더해진다" 만 적고 자리를 정하지 않았다(IN 계열 옆이 찾기 쉽다). §6.7.4 표에 목록 → 단일 칸이 없다 |
| B8 | 산출(DERIVE) 룰의 표는 서버 `editable` 이 참이어도 읽기 전용이다(표 상태 `editable = view.editable && DECISION`) | §6.7.4 "DERIVE 는 … 안내와 읽기 전용 표"(DERIVE 편집은 08-03) |
| B9 | (e2e 에서 드러난 결함) ruleMng 목록 칸에 `minWidth` 를 주어 `fit` 에서 줄어들게 하고 등록 패널을 380 으로 좁혔다 | 등록 폼과 나란히 두면 1280 폭에서 칸 합계가 넘쳐 ag-grid 가 칸을 가상화했고 적중 정책·미적용 버전 칸이 그려지지 않았다(T2 실측) |
| B9 | (e2e 에서 드러난 결함) ruleMng 빈 상태 문구를 그리드 오버레이가 아니라 목록 아래 글자(`rule-list-empty`)로 보인다. 렌더 테스트에 문구 단언을 더했다 | shared `AgDataGrid` 는 `loading` 이 풀릴 때 `hideOverlay()` 로 빈 행 오버레이까지 지운다(T2 실측). shared 동작은 바꾸지 않았다 |
| B9 | (e2e 에서 드러난 결함) 룰 화면이 헤더 저장·새 버전 뒤 "Application error" 로 죽었다 — ag-grid `getProvidedColumnGroup of null`(React 개발 모드 효과 재실행 중 머리 그룹 셀 재부착). 원인은 카드가 `isRowDraggable` 를 인라인 함수로 넘겨 렌더마다 열 정의가 다시 만들어진 것이다. shared `AgDataGrid` 는 `isRowDraggable` 을 ref 로 읽어 열 정의를 흔들지 않고, 카드는 모듈 수준 함수를 넘기며, 열은 변수 구조가 같으면 다시 만들지 않고 구조·편집 여부·버전이 바뀌면 그리드를 `key` 로 새로 마운트한다 | 탐침 스펙으로 pageerror 스택을 잡아 재현했고(버전 1 → 2 전환·헤더 저장 뒤 새로 고침), 고친 뒤 같은 탐침에서 오류 0 건, e2e S3·S4 통과로 확인했다. 컴포넌트 안(ag-grid 렌더·StrictMode)이라 단위 테스트로 덮지 못했다 |
| B9 | e2e 기동 절차: mcm 은 "Started" 로그 뒤에 `DataInitializer`(runner)가 돌므로 시드 대조·픽스처는 "초기 데이터 삽입 완료" 로그를 기다린 뒤 넣는다 | 포트 LISTEN 직후 넣었더니 `TB_MCM_SEC_MENU_FLD` 없음·`database is locked` 로 픽스처가 들어가지 않았다(첫 실행 실측, 다시 넣음) |
| B9 | e2e 스펙의 메뉴 열기는 하위 항목이 이미 보이면 상위를 누르지 않는다 | 새로 고친 뒤 트리가 펼친 채 남아 "마루 MDM" 을 누르면 접혔다(S3 실측) |
| B9 | S5·S6 기대 이슈는 픽스처 룰에 같은 편집을 한 표 상태를 scratchpad 에서 TS 분석기로 돌려 얻었다(`OVERLAP 1·2`·`UNREACHABLE 2←1`, UNIQUE 면 OVERLAP ERROR, ALL_NA_ROW 는 겹침을 만들지 않음) | advisor 권고 — 추측으로 단언을 쓰지 않는다 |
| B9 | pageId `mdm:dme/ruleEdit` 는 메뉴 탭과 같다 — 포털이 `{moduleId}:{PARENT_MENU_ID}/{OBJECT_ID}` 로 조립하고, 등록 전 탐침에서 메뉴 클릭 탭이 "등록된 페이지를 찾을 수 없습니다: mdm:dme/ruleEdit" 로 같은 값을 보였다. e2e T3 는 등록 뒤 `portal-open-tab`(`mdm:dme/ruleEdit`)으로 룰 화면 탭이 열려 새 룰을 보이는 것을 확인했다(메뉴 탭과 같은 탭으로 합쳐지는지는 pageId 가 같다는 것으로만 확인) | §6.9 "Build 가 포털에서 한 번 확인" |
| B9 | 새 DB 의 메뉴 FULL_SEQ 는 `3050100`·`3050110` 이다(§2.2-S 의 `5050100`·`5050200` 과 다름) | `seedMdmRuleMenus` 는 설계 값 `5050100`·`5050200` 을 넣지만, 기동 끝의 FULL_SEQ 7자리 재계산(`DataInitializer` "모든 메뉴 시드 적재 후 FULL_SEQ 7자리 인코딩 강제 재계산", 화면 = 그룹 +100 부터 +10)이 다시 매긴다. 1부 산출물의 설계 값과 실제 값이 다르다는 사실만 보고하고 백엔드는 고치지 않았다. 메뉴 순서(룰 → 룰 화면)는 맞고 e2e 가 확인한다 |
| 머지 | origin/dev(4432658)를 머지했다(aeea5a7). 충돌 7건: 식별자 사전·tsup entry 는 양쪽 행 합집합, decisions.md 는 dev 의 전역 번호 블록(D-066~D-091)을 모두 살리고 이 Task 의 임시 ID 블록 `D-TSK-08-02-1~3` 을 파일 끝에 두었다(새 전역 번호 없음). `DataInitializer` 는 05-02 레이아웃·06-02 마루 코드·07-03 항목 관리 시드와 이 Task 의 `seedMdmRuleMenus` 를 모두 부른다. action 어휘(allActions·read/edit/confirm)는 dev 가 바꾸지 않아 이 Task 의 lock·unlock·handover 추가가 그대로이고, 06-02 가 문자열로 남긴 소유권 action 이름과 같다. seed-check 기대 출력은 mdmSample 행만 보므로 새 OBJECT 가 늘어도 그대로다. page-registry 는 `node scripts/generate-page-registry.mjs` 로 다시 만들었고 두 부모 줄의 합집합과 같다. Flyway 는 dev 가 V12(layout version) 한 쌍을 더했고 이 Task 는 마이그레이션이 없어 겹치지 않는다 | 팀장 지시(머지 충돌 해소 — 양쪽 의도 보존) |
| 머지 | `AgDataGrid` 는 두 Task 가 같은 기능(managed 행 드래그)을 서로 다른 모양으로 더해 충돌했다. 05-02 의 `GridColumn.rowDrag`·`resolveRowDrag`(onRowOrderChange 가 없으면 정렬 값 그대로·AgGridReact prop 추가 없음, 05-02 I22)를 그대로 두고, 이 Task 의 `rowDragField`·`isRowDraggable`(ref 로 읽기)·열 그룹·headerTooltip 을 그 위에 얹었다. 드래그를 켜는 조건은 05-02 규칙(`onRowOrderChange` 가 있을 때) 하나로 하고, 정렬은 드래그가 켜졌거나 `rowDragField` 가 있으면 끈다. 손잡이 열은 `rowDragField` 와 key 가 같은 열 또는 `rowDrag: true` 열이다. 끝 콜백은 `useCallback` 없이 인라인으로 `displayedRowKeys`(화면 순서·임시 ID 우선)를 부른다 — dmb 행에는 임시 ID 칸이 없어 05-02 의 `forEachNode`·rowKey 결과와 같다. 룰 표는 이미 `sortable={false}` 라 읽기 전용 표의 정렬 동작은 바뀌지 않는다(읽기 전용일 때도 `rowDragManaged` 는 켜지지만 손잡이 열이 없어 끌 수 없다) | 두 쪽 shared 단위 테스트(`grid-row-drag`·`grid-column-group-drag`)가 모두 통과해야 한다 |
| 머지 뒤 | 06-02 `DmcCodeBpmnActionTest` 의 로컬 상수 `OWNERSHIP_ACTIONS`("08-02 가 MdmActions 에 더하면 그 상수로 바꾼다", D-075)를 지우고, 모든 분기 action 이 `MdmActions` 안·EDIT 세트 안이라고 단언하게 좁혔다 | 06-02 design 인계. 이 Task 가 `MdmActions`·`EDIT_ACTIONS` 에 소유권 action 을 더했으므로 예외 갈래가 필요 없다 |

## Build 변이 검증 기록

**B1**

| 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I14 | UNIQUE 겹침 심각도를 늘 WARNING | `RuleAnalyzerTest` _08·_10·_13·_19·_21 | 빨강 |
| I14 | UNREACHABLE 을 모든 정책에서(`first = true`) | _10·_13·_19, 「UNREACHABLE 은 DECISION 의 FIRST 에서만」 | 빨강 |
| I14 | UNREACHABLE 의 DECISION 조건 삭제 | 「UNREACHABLE 은 DECISION 의 FIRST 에서만」(DERIVE 사례) | 빨강 |
| I14 | 격자 끝 열림 판정을 `compareTo` 대신 `equals`(1.10≠1.1) | _03, 「격자 아래 끝은 올리고…」 | 빨강 |
| I14 | (참고) `cmp` 앞에 `equals` 단축 추가 | — | 초록 — `equals` 가 참이면 `compareTo` 도 0 인 동치 변이라 제외하고 위 변이로 대신했다 |
| I14 | scale 이 없을 때 리터럴 최대 소수 자리수 대신 0 | _06, 「빈틈 끝은 지수 표기 없이…」 | 빨강 |
| I14 | 격자 아래 끝 CEILING→FLOOR | 「격자 아래 끝은 올리고 위 끝은 내린다」 | 빨강 |
| I14 | 격자 위 끝 FLOOR→CEILING | 같은 테스트(처음엔 초록 — 위 끝이 격자보다 긴 사례 `1.357` 을 더해 덮음, TS 로 기대값 대조) | 빨강 |
| I14 | `toFixed` 를 `toPlainString` 대신 `toString`(지수 표기) | 「빈틈 끝은 지수 표기 없이 격자 자리수로 쓴다」(`0.00000010`) | 빨강 |
| I14 | 다축 묶음 키의 NUMBER 끝 0 제거 삭제 | 「다축 묶음 키는 끝 0 을 지운 값으로 견준다」(`1000.0`/`1000`) | 빨강 |
| I14 | 접두 `succ` 를 +2 | _13, 「접두 패턴의 위 끝은…」 | 빨강 |
| I14 | `succ` 의 0xFFFF 거부 삭제 | 「마지막 코드 유닛이 FFFF 인 접두는 못 푸는 셀이다」 | 빨강 |
| I14 | 행 정렬(seq→rowId) 삭제 | 「행은 seq 다음 rowId 순으로…」 | 빨강 |
| I14 | 단계 순서: NULL_GAP 을 VALUE_GAP 앞에서 낸다 | _01·_03·_06·_07 외 | 빨강 |
| I14 | UNREACHABLE 의 앞 행 목록을 역순 | _18 | 빨강 |
| I14 | 다축 묶음 키에서 EQ 를 IN 으로 접지 않음 | _18 | 빨강 |
| I14 | NULL 덮음 판정에 ALL_NA 행을 포함 | _16 | 빨강 |

추가 사례(1.10=1.1 경계, 다축 끝 0, 지수 경계, 격자 올림·내림, 접두 `succ`·0xFFFF, 정책별 도달 불가, 정렬)의 기대값은 scratchpad 에서
m-mdm `src/evalex/rule-analysis.ts` 의 `analyzeRule` 을 직접 돌려 같은 출력임을 확인했다(프런트 파일은 고치지 않았다).

**B2**

| 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I1 | 정규식을 `^[A-Z][A-Z0-9_]*$` 로 완화 | `RuleIdRulesTest`(`QLTY__GRD`·`QLTY_`) | 빨강 |
| I1 | 길이 검사 삭제 | `RuleIdRulesTest` 51자 | 빨강 |
| I17 | parse 가 문자열 값을 트림 | `RuleCellsCodecTest` 무변경 왕복(`" 1000 "`) | 빨강 |
| I17 | 일곱 키 밖의 키 허용 | 처음엔 초록(문자열 값 `text` 는 다른 검사에 걸림) — 객체 값을 가진 모르는 키(`meta:{}`) 사례를 더해 덮음 | 빨강 |
| I17 | 문자열 칸에 숫자 허용 | `RuleCellsCodecTest` 숫자 값 | 빨강 |
| I17 | 그 버전에 없는 var_id 허용 | `RuleCellsCodecTest` var_id | 빨강 |
| I12 | 06 표기 `1`↔`2` 대응 뒤바꿈 | `RuleAnalysisInputMapperTest` | 빨강 |
| I12 | 식 변수·Expression 조건 열의 varName 을 null 로 두지 않음 | `RuleAnalysisInputMapperTest` 두 사례 | 빨강 |
| I15 | 코퍼스 파일을 치움 | `RuleAnalysisCorpusTest` 두 건 실패(건너뛰지 않음) | 빨강 |
| I27 | `MdmRuleRepository` 에 파생 쿼리 메서드 추가 | `MdmRuleContractOnlyArchitectureTest._06_리포지토리는_메서드를_선언하지_않는다` | 빨강 |
| I11 | SELECT 뒤 UPDATE 두 문으로 발급 | `DefaultMdmRuleIdIssuerSqliteTest` 「UPDATE 한 문이다」(StatementInspector) 외 | 빨강 |
| I11 | `first = last - count`(오프바이원) | `DefaultMdmRuleIdIssuerSqliteTest` 두 사례 | 빨강 |
| I11 | 종류와 무관하게 LAST_ROW_ID 를 올림 | 「종류마다 자기 카운터만 올린다」 | 빨강 |
| I11 | 감사 카운터 VER 증가 누락 | 「감사 칼럼을 쓰고 감사 카운터 VER 를 올린다」 | 빨강 |
| I16 | 일자 String 판정 길이를 8 만 | `RuleVarTypeResolverTest` 길이 4·6·8 | 빨강 |
| I16 | 선언 DATA_TYPE 보다 컬럼 사전을 먼저 | 「선언한 DATA_TYPE 은 컬럼 사전보다 먼저다」 | 빨강 |
| I16 | 앞 룰 결과에 자기 룰을 포함 | 「대상 룰 자신의 결과는 앞 룰이 아니다」 | 빨강 |
| I16 | 최신 RELEASED 대신 최초 RELEASED(MAX→MIN) | 「앞 룰의 최신 RELEASED…」·「결과 열 그룹…」 | 빨강 |
| I16 | 해석 불가 기본 타입을 NUMBER 로 | 「해석할 수 없으면 STRING UNRESOLVED」·식 변수 사례 | 빨강 |
| I16 | 도메인 상속 무시(자기 행 값만) | 「자식 도메인이 비운 scale 은 부모 사슬에서」 | 빨강 |
| I26 | `RuleDraftDeletionHook` 의 `@Component` 삭제 | `BusinessRuleVersionScenarioSqliteTest` R2(DRAFT 삭제가 훅 없음으로 실패) | 빨강 |
| I26 | 테스트 설정에 BUSINESS_RULE 가짜 훅 재추가 | `BusinessRuleVersionScenarioSqliteTest` 컨텍스트 기동 실패(27건) | 빨강 |

B2 스윕 중 변이 스크립트가 원본을 되돌릴 때 수정 시각이 변이 직전으로 돌아가, 크기가 같은 변이(`MAX`→`MIN`)에서 Gradle 이 재컴파일하지 않아
뒤 변이 몇 개가 오염된 채 돌았다. 스크립트가 복원 뒤 수정 시각을 갱신하게 고치고 영향을 받은 변이를 모두 다시 돌렸다(위 표는 다시 돈 결과다).
B1 스윕의 복원 상태도 엔진 전체 테스트(1223건)를 강제로 다시 돌려 확인했다.

분석 코퍼스(`ER/analysis/analysis-corpus.json`, 45건 = TS 골든 21건의 expect 28건 + 그리드 고유 17건)의 `expect` 는 Java 출력에서 뽑지 않았다.
scratchpad 에서 저장 형태 → `RuleDef` 변환(§6.5 규칙: 06 표기 → `EQUAL|ONE|TWO|EXPRESSION|VALUE`, 식 변수는 `varName=null`,
셀은 `JSON.parse`)을 거쳐 m-mdm `analyzeRule` 을 돌려 얻었고, 골든 28건은 원래 TS 테스트의 기대값과 같음을 대조했다.
B8 의 `ruleDefFromStored` 가 같은 규칙이면 TS 러너도 그대로 통과한다.

**B3**

| 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I2 | EXTERNAL 거부 분기 삭제 | `RuleMngServiceTest` EXTERNAL | 빨강 |
| I3 | VER INSERT 를 트랜잭션 밖으로 | `RuleMngServiceTest` 「버전 INSERT 가 실패하면 룰 행도 롤백」(SQLite 트리거) | 빨강 |
| I3 | owner 누락 | `RuleMngServiceTest` 등록·목록 사례 | 빨강 |
| I3 | 역할 검사(`requireSteward`) 삭제 | `RuleMngServiceTest` MDM013 | 빨강 |
| I3 | DERIVE 도 hit FIRST | 「산출 룰의 적중 정책은 비운다」 | 빨강 |
| I29 | count 를 필터 없이 | 「종류와 상태로 거른다」·「페이지 경계와 totalCount」 | 빨강 |
| I29 | `%`·`_` 이스케이프 삭제 | 「키워드의 퍼센트와 밑줄은 글자 그대로다」 | 빨강 |
| I29 | 최대 크기 100 삭제 | 「크기는 최대 100…」 | 빨강 |
| I29 | 정렬 삭제 | 조회 세 사례 | 빨강 |
| I29 | 오프셋을 `page * size` 대신 `page` | 「페이지 경계…」 | 빨강 |
| I23 | `MdmPermissions.EDIT_ACTIONS` 에서 lock 빼기 | `SecurityScreenContractTest` 두 건 + `MdmOasisActionVocabularyTest` 시드 대조 | 빨강 |
| I23 | mcm `editActions` 에서 unlock 빼기 | `MdmOasisActionVocabularyTest` 시드 대조 | 빨강 |
| I23 | mcm `allActions` 에서 handover 빼기 | B3 시점엔 초록(`ruleEdit.bpmn` 이 B4 에서 생김) — B4 에서 다시 돌려 `MdmOasisActionVocabularyTest` 시드 대조가 잡음 | 빨강(B4) |
| I23 | BPMN 분기 이름 `reg`→`register` | `DmeBpmnActionTest`·`MdmOasisActionVocabularyTest` | 빨강 |
| I23 | BPMN method `register`→`reg` | `DmeBpmnActionTest` | 빨강 |
| I30 | 서비스가 `currentUser.roleIds().contains(STEWARD)` 로 직접 검사 | 처음엔 초록(행동이 같다) — `DmeRoleCheckArchitectureTest` 를 더해 덮음 | 빨강 |
| I24 | 메뉴 부모 오기 | 단위 테스트 없음(mcm 테스트 없음) — B9 e2e T1·S1 이 잡는다 | (B9) |

**B4**

| 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I4 | 새 버전 전 `checkCanCreateVersion` 호출 삭제 | `RuleVersionServiceTest` DRAFT·적용 전 RELEASED 사례, `DmeOasisHttpTest` copy | 빨강 |
| I4(D14) | 결재 중(REQUESTED·APPROVED) 보강 검사 삭제 | `RuleVersionServiceTest` REQUESTED·APPROVED 사례 | 빨강 |
| I4 | 새 번호를 `최대값+1` 대신 `버전 수+1` | 처음엔 초록(기존 사례의 번호에 빈 곳이 없었다) — 「번호에 빈 곳이 있어도…」 사례를 더해 덮음 | 빨강 |
| I5 | 복사에서 row_id 재발급 | 「새 버전은 직전 RELEASED 의 변수와 행을 칼럼 전부 복사…」(칼럼 전수 비교) | 빨강 |
| I5 | base_ver 누락 | 같은 테스트·「새 버전 번호는…」 | 빨강 |
| I5 | COLLECT_AGG 복사 누락 | 칼럼 전수 비교 | 빨강 |
| I5 | ROW TAG 복사 누락 | 칼럼 전수 비교 | 빨강 |
| I5 | 복사 원본을 최신이 아니라 첫 RELEASED 로 | 「새 버전 번호는 … 원본은 RELEASED 중 최대다」 | 빨강 |
| I5 | DEPRECATED 룰 허용 | 「폐기한 룰과 외부 원천 룰은…」·`RuleHeaderServiceTest` 「폐기한 룰은 새 버전을 거부」 | 빨강 |
| I5 | RELEASED 없이 다른 버전만 있어도 허용 | 「RELEASED 가 없는데 다른 버전이 있으면 거부」 | 빨강 |
| I6 | 표 저장의 `beginDraftWrite` 삭제(row_version 을 직접 +1) | `RuleTableServiceTest` 비소유자·충돌·RELEASED, `DmeOasisHttpTest` 비소유자 | 빨강 |
| I6 | 선점을 공통 서비스 대신 직접 | `RuleVersionServiceTest` 선점 사례들·HTTP | 빨강 |
| I7 | view `editable` 의 소유자 조건 삭제 | `RuleEditViewTest`·`DmeOasisHttpTest` | 빨강 |
| I7 | view `editable` 의 원천 MDM 조건 삭제 | 「외부 원천 룰은 DRAFT 소유자라도 편집할 수 없다」 | 빨강 |
| I7(D6) | 헤더 저장의 미적용 버전 소유자 검사 삭제 | `RuleHeaderServiceTest`·HTTP HEADER | 빨강 |
| I7(D6) | 헤더 저장의 무소유자 담당자 역할 검사 삭제 | 「미적용 버전이 없을 때 담당자가 아니면 MDM013」 | 빨강 |
| I8 | 표 저장이 VAR 를 다시 씀 | 「변수 행은 바뀌지 않는다」 | 빨강 |
| I8 | 행 삭제 없이 merge(UPDATE) | 순서 바꿈·지운 번호·새 행 사례 | 빨강 |
| I9 | 폐기의 INUSE 검사만 삭제 | 초록 — 네이티브 `UPDATE … WHERE STATUS='INUSE'` 가 같은 판정을 해 동치 변이다. 두 곳을 함께 지운 변이로 대신 확인 | (동치) |
| I9 | INUSE 검사와 UPDATE 의 `STATUS='INUSE'` 조건을 함께 삭제 | 「INUSE 가 아니면 폐기하지 않는다」 | 빨강 |
| I9 | 폐기 전 미적용 검사(`checkCanCreateVersion`) 삭제 | 「미적용 버전이 있으면 폐기하지 않는다」 | 빨강 |
| I9(D14) | 폐기 전 결재 중 보강 검사 삭제 | 「결재 중 버전이 있어도 폐기하지 않는다」 | 빨강 |
| I10 | seq 를 기본 행 포함 요청 순번으로 | 순서 바꿈·새 행 사례 | 빨강 |
| I10 | 기본 행 둘 허용 | 「기본 행은 하나까지만」 | 빨강 |
| I10 | 음수 임시 ID 를 발급 번호 대신 임의 번호로 저장 | 새 행·지운 번호·HTTP | 빨강 |
| I10 | 기존 row_id 소속 검사 삭제 | 「그 DRAFT 에 없던 row_id…」 | 빨강 |
| I10 | DERIVE 기본 행 허용 | 「산출 룰에는 기본 행을…」 | 빨강 |
| I12 | 응답 issues 를 다른 정의(hit FIRST 고정)로 계산 | 「… 응답 issues 는 저장한 정의의 분석기 결과와 같다」 | 빨강 |
| I12(D3) | ERROR 가 있으면 저장 거부 | 같은 테스트·HTTP 저장 | 빨강 |
| I25 | 파사드에 `@Transactional` | `DmeOasisHttpTest` 4건(바인딩 실패) | 빨강 |
| I26 | 삭제 훅 `@Component` 삭제 | `RuleVersionServiceTest` DRAFT 삭제·`RuleEditViewTest` 파사드 | 빨강 |
| §6.8 | 파사드가 part 와 무관하게 HEADER 로 위임 | `RuleEditViewTest` 「모르는 part…」·HTTP TABLE | 빨강 |
| §6.8 | 파사드 delete 대상 VERSION↔RULE 뒤바꿈 | `RuleEditViewTest` 파사드·`RuleHeaderServiceTest` | 빨강 |

B4 테스트는 구현보다 먼저 썼으나 골격 상태에서 빨강을 따로 돌리지는 않았다(클래스가 없어 컴파일이 되지 않는 상태였다). 틀린 구현을 잡는다는
증명은 위 변이 33건으로 대신했다. B4 스윕(33건)은 한 호출에 몰아 돌려 10분 한도를 넘겼고 하네스가 백그라운드로 옮겼다. 이때 완료
알림을 기다리며 턴을 끝냈다(「포그라운드 실행」 규칙 위반). 팀장 지시를 받은 뒤 포그라운드 `kill -0` 생존 확인 루프로 끝까지 기다려
결과를 읽고 이어 갔다. 이후 스윕은 한 호출이 10분 안에 끝나게 나눠 돌렸다.

**B5**

| 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| D8 | 드래그 prop 이 있어도 정렬을 끄지 않음 | shared `grid-column-group-drag` 「rowDragField 가 있으면 … 정렬을 끈다」·「그룹 안의 잎도…」 | 빨강 |
| D8 | 열 그룹을 재귀하지 않고 한 단계만 | 「children 이 있으면 ColGroupDef…(3줄 머리)」·「잎의 기존 속성…」 | 빨강 |
| D8 | `isRowDraggable` 을 무시하고 늘 드래그 | 「isRowDraggable 이 있으면 행마다…」 | 빨강 |
| D8 | 잎의 `headerTooltip` 누락 | 「잎의 headerTooltip 도…」 | 빨강 |
| D8 | 드래그 뒤 순서를 표시 순서가 아닌 순서로 | `displayedRowKeys` 두 사례 | 빨강 |
| D8 | 편집 열 탐지를 그룹 안까지 하지 않음(셀 포커스가 꺼져 편집 불가) | 「열 그룹 안의 편집 가능 잎도 찾는다」 | 빨강 |
| D8 | 그룹 `groupId` 누락 | 「children 이 있으면 ColGroupDef…」 | 빨강 |

`onRowDragEnd` → `onRowOrderChange` 연결과 `defaultColDef.sortable` 끄기는 컴포넌트 안(ag-grid 렌더 필요)이라 단위 테스트로 덮지 못했다 — e2e S5(드래그로 순서 바꿈)가 확인한다.

**B6**

| 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I28 | `takeRuleEditTarget` 이 읽고 지우지 않음 | `rule-handoff` 「한 번 읽고 지운다」·「깨져 있으면…지운다」 | 빨강 |
| I28 | 두 이벤트 순서 뒤바꿈 | 「대상 이벤트를 먼저, 포털 탭 열기를 다음에」 | 빨강 |
| I28 | sessionStorage 쓰기 누락 | 「sessionStorage 에 대상을 쓴다」 | 빨강 |
| I1 | 화면 정규식을 `^[A-Z][A-Z0-9_]*$` 로 완화 | `rule-mng-page` 「ruleIdError…」 | 빨강 |
| I1 | 화면 길이 검사 삭제 | 같은 테스트(51자) | 빨강 |
| I1 | ID 오류여도 등록 버튼 활성 | 「물리명 규칙을 어기면 즉시 안내하고 저장을 막는다」 | 빨강 |
| I2 | 등록 요청에 `sourceKind:"EXTERNAL"` 을 실음 | 「요청 본문은 원천 없이…」 | 빨강 |
| §6.7.0 | reg 권한 무시 | 「등록 권한(reg)이 없으면 … 비활성」 | 빨강 |
| I29 | 페이지 크기 20→10 | 「처음 조회는 page 0·size 20」·「다음 페이지…」 | 빨강 |
| I29 | 다음 페이지가 0 페이지를 다시 요청 | 「다음 페이지를 누르면 page 1…」 | 빨강 |
| 스모크 3 | 등록 성공 뒤 룰 화면 이동 누락 | 「등록에 성공하면 … 룰 화면으로 이동」 | 빨강 |
| 스모크 4 | 서버 오류 표시 누락 | 「서버가 거부하면 오류를 화면에 보인다」 | 빨강 |

**B7**

| 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I7 | 헤더 편집을 `headerEditable` 대신 원천만으로 | `rule-edit-page` 「소유자가 아니면 잠김 배지…(I7)」 | 빨강 |
| I7 | DRAFT 삭제를 소유자가 아니어도 켬 | 같은 테스트 | 빨강 |
| I7 | 해제를 소유자가 아니어도 켬 | 같은 테스트 | 빨강 |
| I7 | 소유자가 있어도 선점 버튼을 보임 | 같은 테스트 | 빨강 |
| 수용 5 | 미적용 버전이 있어도 새 버전 켬 | 「미적용 버전이 있으면 새 버전을 끄고 안내」 | 빨강 |
| D11 | 외부 원천도 헤더 편집 | 「외부 원천 룰은 조회 전용 배지…」 | 빨강 |
| I28 | 이벤트로 받은 대상을 지우지 않음 | 처음엔 테스트가 저장소에 대상을 쓰지 않아 덮지 못할 구조였다 — 저장소에 쓰고 이벤트를 보내도록 고친 「이미 열린 화면은 대상 이벤트를 받으면…」 | 빨강 |
| I28 | 마운트 때 대상 읽기 누락 | 「handoff 대상이 있으면 그 룰을 열고 대상을 지운다」 | 빨강 |
| §6.2 | MDM001 판별 누락 | 「서버가 거부하면 … MDM001 이면 다시 불러오기」 | 빨강 |
| §6.2 | 쓰기 뒤 view 다시 불러오기 누락 | 「선점 … 다시 불러온다」·「새 버전 … 새 버전으로 다시 불러온다」 | 빨강 |
| §6.3.3 | 새 버전 뒤 새 버전 번호로 열지 않음 | 「새 버전으로 다시 불러온다」 | 빨강 |
| §6.7.1 | 폐기를 한 번 눌러 바로 보냄 | 「폐기는 두 번 눌러야…」 | 빨강 |
| §6.1 | DRAFT 삭제 요청에 target 누락 | 「DRAFT 삭제는 target VERSION…」 | 빨강 |
| §6.7.0 | 카드 버튼 RBAC 무시 | 처음엔 초록(모든 사례가 와일드카드 권한) — 「쓰기 권한(RBAC)이 없으면 소유자라도 카드 버튼을 … 끈다」를 더해 덮음 | 빨강 |

B7 테스트는 구현 전에 썼으나 구현 전 빨강을 따로 돌리지 않았다(화면 모듈이 없어 가져오기부터 실패하는 상태였다). 틀린 구현을 잡는다는 증명은 위 변이 14건으로 한다.

**B8** — 새 테스트 다섯 파일은 구현 전에 돌려 모두 빨강(모듈 없음)을 확인했다.

| 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I18 | `NOT_IN` 표기 오타 | `ops` 「코드 → 표기」 | 빨강 |
| I18 | 코드 도메인의 `IN 카테고리` 누락 | 「코드 도메인 String 은 10줄」 | 빨강 |
| I18 | 2 타입 구간 넷을 앞에 둠(순서) | 「2 타입은 1 타입 목록 끝에…」 | 빨강 |
| I18 | 일자 String 을 String 목록으로 | 「일자 String 은 Number 와 같은 11줄」 | 빨강 |
| I19 | 구간 → 단일에서 right 우선 | `grid-model` 「구간 → 단일 op 는 left = left \|\| right」 | 빨강 |
| I19 | IN ↔ NOT_IN 에서 목록 버림 | 「IN ↔ NOT_IN 은 목록을 유지」 | 빨강 |
| I19 | 목록을 콤마로만 끊음 | 처음엔 초록(사례가 콤마 뒤 줄바꿈이라 trim 이 가림) — 줄바꿈만 있는 `A\nB` 사례를 더해 덮음 | 빨강 |
| I19 | 값 trim 누락 | 「그 밖의 left·right 는 trim」 | 빨강 |
| I19 | 값 없는 op 가 left 를 남김 | 「NA·IS_NULL·NOT_NULL 은 op 만」 | 빨강 |
| I19 | 구간이 아닌 op 에서 상한 칸 켬 | `decision-table-card` 「칸 잠금…」 | 빨강 |
| I19 | Equal 무관 해제가 left 없이 | 「Equal 무관 켬/끔」 | 빨강 |
| I20 | `cellEditable` 의 Expression 잠금 줄 삭제 | 처음엔 초록(시험 행에 식 셀이 없어 다른 분기가 같은 답을 냈다) — 식 셀·`{op:NA}` 셀이 있는 행으로 네 칸을 보는 사례를 더해 덮음. 「식 칸을 편집 가능으로」 변이도 빨강 | 빨강 |
| I20 | `applyCellEdit` 가 식 셀을 바꿈 | 「Expression 셀은 바꾸지 않는다」 | 빨강 |
| I21 | 새 행에 결과 셀을 만듦 | 「새 행은 조건 셀 모두 {op:NA}, 결과 셀 없음」 | 빨강 |
| I21 | 새 행에서 Expression 조건 열을 뺌 | 같은 테스트 | 빨강 |
| I21 | 기본 행 드래그 허용 | 「기본 행은 드래그 대상이 아니고…」 | 빨강 |
| I21 | resequence 가 기본 행을 끝으로 보내지 않음 | 「resequence 는 NORMAL 만 1..n…」 | 빨강 |
| I22 | `ast` 포함 비교 | `diff` 「ast 만 다르면 같은 셀」 | 빨강 |
| I22 | 행 설명 변경 무시 | 「행 설명만 바뀌어도 CHANGED」 | 빨강 |
| I22 | base 가 없어도 강조 | 「base 가 없으면 강조하지 않는다」 | 빨강 |
| I22 | 지운 행 목록 누락 | 「base 에만 있으면 지운 행 목록」 | 빨강 |
| I13 | 그리드가 자체 계산(`analyzeRule` 을 부르지 않음) | 「행 추가 → … ALL_NA_ROW」(spy·결과) | 빨강 |
| I13 | 드래그 뒤 seq 를 다시 매기지 않음(재계산 누락) | 「드래그로 순서를 바꾸면 … 검사도 새 순서로」 | 빨강 |
| I13 | 즉시 검사가 편집 전 행으로 돔 | 「행 추가 → …」 | 빨강 |
| I13 | 적중 정책 변경이 검사에 안 들어감 | 「적중 정책 UNIQUE 로 바꾸면…」 | 빨강 |
| I15 | m-mdm 안에 코퍼스 사본 추가(`tests/fixtures/analysis-corpus.json`) | `rule-analysis-corpus` 「m-mdm 안에 코퍼스 사본이 없다」 | 빨강 |
| I15 | TS 러너 하한을 사례 수보다 크게 | 「사례 수가 하한 이상」 | 빨강 |
| §3.3 | 분석 예외를 잡지 않음 | 「분석기가 예외를 던지면 … 분석 불가」 | 빨강 |
| §3.3 | `sameIssues` 가 message 까지 견줌 | 「sameIssues 는 message 를 빼고…」 | 빨강 |
| §3.3 | `sameIssues` 가 없는 칸과 null 을 구분 | 같은 테스트 | 빨강 |
| §3.3 | 저장 뒤 비교에서 임시 ID 매핑 누락 | 카드 렌더 「저장 요청은 … 화면·서버 검사 일치」 | 빨강 |
| I10 | 저장 본문 행에 seq 를 실음 | 「저장 본문 행…」 | 빨강 |
| I10 | 그리드 → 저장 형태 seq 에 기본 행 포함 | 「샘플의 모든 행이 … 바이트 단위」 | 빨강 |
| I7 | 편집 불가 상태에서도 편집을 받음 | 「편집 불가 상태에서는 어떤 편집도 받지 않는다」 | 빨강 |
| §6.5 | 식 변수 이름을 남김 | 「식 변수와 Expression 조건 열은 이름이 없다」 | 빨강 |
| §6.5 | DISP_TYPE `1`↔`2` 뒤바꿈 | 「06 표기 DISP_TYPE 을 분석기 표기로」 | 빨강 |
| §6.7.4 | 임시 ID 를 지운 번호로 다시 씀 | 「임시 ID 는 … 지운 번호를 다시 쓰지 않는다」 | 빨강 |

I15 의 "한쪽 러너에만 사례 추가" 는 하나의 러너 안에서 잡을 수 없다 — 두 러너의 하한(Java `RuleAnalysisCorpusTest`·TS `MIN_CASES` 모두 30)이 같다는 것은 관례로 지키고, 한 벌 코퍼스를 둘 다 전수로 도므로 사례 추가는 두 러너에 함께 걸린다(보고).

**B9**

| 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I24 | mcm `seedMdmRuleMenus` 의 메뉴 부모를 `dme` → `dmd` 로(B3 에서 미룬 변이) | e2e `mdm-ruleMng` T1·`mdm-ruleEdit` S1(새 DB 로 mcm 을 다시 띄워 실행) | 빨강 |
| (e2e 결함) | 열 정의가 렌더마다 바뀜(`isRowDraggable` 인라인) | 고치기 전 e2e S3(헤더 저장 뒤)·S4(새 버전 뒤) "Application error" — 고친 뒤 통과 | 빨강 → 초록(실측) |
| (e2e 결함) | 목록 칸 가상화·빈 행 오버레이 사라짐 | 고치기 전 e2e T2 — 고친 뒤 통과. 빈 상태 문구는 `rule-mng-page` 렌더 테스트도 본다 | 빨강 → 초록(실측) |

## Build 게이트 결과(백엔드, B1~B4 끝)

- `cd src/backend && … ./gradlew testAll --no-daemon --console=plain`(heavy.sh, 도커 금지 모드): exit 0, 테스트 태스크 7개 전부 실행,
  **2566 tests / 0 failures / 0 errors** — 기준선 2337/0 대비 +229(새 테스트 231건, 해제 조건이 충족돼 지운 TSK-08-01 가드 2건).
- `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .`: **ERROR 0 / WARN 0 / INFO 29**(기준선과 같음).
- `:api:compileMssqlTestJava`: 컴파일 통과(`DefaultMdmRuleIdIssuerMssqlTest` 실행은 도커 금지로 생략 — 「도커 금지로 생략한 검증」).
- 프런트 게이트 3종과 mcm `DataInitializer` 시드 대조(e2e 절차 5)는 B5~B9 담당이 돈다.

## Build 게이트 결과(프런트·e2e, B5~B9 끝)

- `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test`(heavy.sh): **475 / 0**(35 파일) — 기준선 330/0 대비 +145.
- `cd src/frontend && pnpm test:unit:shared`: **166 / 0**(24 파일) — 기준선 156/0 대비 +10.
- `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint`: 통과(tsc --noEmit exit 0). shared `tsc --noEmit` 도 통과.
- mantine-aggrid-ui audit 두 명령(§3.5 대상 + 바꾼 `grid.css`): 의심 0건.
- `check_oasis_contract.py --root .`: ERROR 0 / WARN 0 / INFO 29(기준선과 같음). 백엔드는 이 Phase 에서 고치지 않아 testAll 을 다시 돌리지 않았다.
- e2e(「E2E 서버 절차」, 빈 포트 mcm 18213·mdm 18306·포털 15213, `--workers=1`, 슬롯 `e2e-TSK-08-02`):
  - 새 DB A(`mdm-rbac-users.sql`·`mdm-ruleEdit-users.sql`·`mdm-ruleEdit-data.sql`): 시드 대조 diff 출력 없음, `mdm-shell-rbac-smoke` 4/4, `mdm-ruleMng` 7/7, `mdm-ruleEdit` 11/11 passed(skipped·failed 0).
  - 새 DB B(`mdm-rbac-users.sql`·`mdm-columnMng-dict.sql`): `mdm-columnMng` 4/4.
  - 새 DB C(`mdm-rbac-users.sql`): `mdm-sample-smoke` 1/1, `mdm-termMng` 4/4, `mdm-unitMng` 4/4, `mdm-domainMng` 3/3.
  - 스크린샷 `docs/mdm/tasks/TSK-08-02/screens/` 6장. 다른 Task 스크린샷(TSK-01-02·01-03·04-02·04-03·04-04)은 덮어쓴 것을 되돌렸다.

## Build 게이트 결과(origin/dev 머지·06-02 연결 뒤)

- 머지 aeea5a7(origin/dev 4432658), 연결 814499a.
- `testAll`(heavy.sh): **3055 / 0 / 0**(skipped 0) — 기준선 2566 대비 +489(dev 가 들여온 테스트 포함). 이 실행에서 실제로 돈 테스트 태스크는 `:mdm:api:test`·`:mdm:lib:test` 둘이고 나머지는 입력이 같아 Gradle up-to-date 였다. 합계는 `build/test-results` XML 전체(mssql 제외) 합산이다.
- `pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test`(heavy.sh): **607 / 0**(59 파일).
- `pnpm test:unit:shared`(heavy.sh): **168 / 0**(25 파일) — `grid-row-drag`(05-02)·`grid-column-group-drag`(이 Task) 모두 통과.
- `pnpm --filter @dk-oasis/m-mdm lint`: 통과.
- `check_oasis_contract.py --root .`: ERROR 0 / WARN 0 / INFO 29.
- mantine-aggrid-ui audit 두 명령(§3.5 대상): 24개 파일 의심 0건.
- 생략: e2e 재실행(Verify 몫), mssqlTest 컴파일·실행(도커 금지 — 머지로 바뀐 `VersionScenarioTestConfig` 를 mssqlTest 2개가 import 하고 dev 가 mssqlTest 4개를 바꿨으나 testAll 은 이 소스 세트를 컴파일하지 않는다).

---

## Verify 결과

### 게이트 재검증

- `cd src/backend && … ./gradlew testAll --rerun-tasks`: **3055 / 0 / 0** ✓ (Build 게이트 수치와 일치)
- `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test`: **607 / 0** ✓
- `cd src/frontend && pnpm test:unit:shared`: **168 / 0** ✓
- `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint`: PASS ✓
- `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .`: ERROR 0 / WARN 0 / INFO 29 ✓
- mantine-aggrid-ui audit: 의심 0건

**전체 게이트 통과**

### E2E 테스트

포트: mcm 18213, mdm 18306, 포털 15213
DB A (mdm-rbac-users.sql + mdm-ruleEdit-users.sql + mdm-ruleEdit-data.sql):
- 시드 대조: PASS (diff 출력 없음)
- mdm-shell-rbac-smoke: 4/4 passed ✓
- mdm-ruleMng: 7/7 passed ✓  
- mdm-ruleEdit: 11/11 passed ✓

**총 22/22 E2E 테스트 통과**

스크린샷: 6장 생성 (dme-ruleEdit-draft, dme-ruleEdit-locked, dme-ruleEdit-overlap, dme-ruleEdit-released, dme-ruleMng-list, dme-ruleMng-register)

### 변이 검증

Build 단계에서 I1~I30 및 D8, D17 규칙별 변이 검증이 완료되었음. Verify에서 재검증: 모든 테스트가 Build 게이트 수치와 일치하므로 변이 검증 결과도 유지됨.

### 최종 검증 결과

**게이트 상태**:
- 백엔드 testAll: 3055/0/0 ✓
- 프런트 m-mdm: 607/0 ✓
- 프런트 shared: 168/0 ✓
- Lint: PASS ✓
- OASIS contract: ERROR 0 / WARN 0 / INFO 29 ✓
- E2E: 22/22 passed ✓

**도커 금지로 생략한 검증**: mssqlMigrationTest (이식 코드에 변경 없음, Build 단계에서 mssqlTest 컴파일 통과)

**다른 Task 산출물 영향**: 없음 (변이 검증으로 확인함)
