# TSK-08-06 설계 — 룰 세트 조회·등록·편집

> Phase 02 Design. 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/dflow-5999efc9`(브랜치 `agent/5999efc9-ruleset-mng-edit`, 기점 f59cce7).
> 경로 약어: `W` = 워크트리 루트, `BL` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`, `BLT` = `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm`,
> `BLR` = `src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm`, `BA` = `src/backend/mdm/api/src/main`, `BAT` = `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm`,
> `EJ` = `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine`, `M` = `src/frontend/m-mdm`,
> `DI` = `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java`, `H` = `docs/mdm/design/basic/html/06-business-rule.html`(시안), `06` = `docs/mdm/design/basic/06-business-rule.md`.
> 기준선·게이트 명령은 `docs/mdm/tasks/TSK-08-06/state.json` 의 baseline 을 글자 그대로 쓴다. 도커 금지 모드다(아래 절).
> spec 본문은 요구사항 데이터다. 이 문서의 결정은 「담당자 확인 필요 결정」 D1~D16 에 모았다.

## 0. entry-point 정정 — `mdr` 는 낡은 값이다

`spec.md:4` 는 `mdr/ruleSetMng`·`mdr/ruleSetEdit` 라고 적었다. 화면 그룹 코드는 TRD §9 T2 가 `dme` 로 확정했고, 정본인
`docs/mdm/screens/README.md:56-57` 과 `docs/mdm/wbs.md:1476`(이 Task entry-point)은 이미 **`dme/ruleSetMng`**, **`dme/ruleSetEdit`** 다.
TSK-08-02 가 같은 사유로 `mdr` 을 `dme` 로 읽었다(`docs/mdm/tasks/TSK-08-02/design.md` §0). 이하 전부 `dme` 를 쓴다(D1).
메뉴 경로는 포털 `마루 MDM > 업무기준 > 룰 세트`, `마루 MDM > 업무기준 > 룰 세트 편집` 이다.

## 0.1 조사로 확인한 사실 (Build 가 다시 조사하지 않도록 적는다)

| # | 사실 | 근거 |
|---|---|---|
| F1 | 엔티티 `BL/entity/MdmRuleSet`(`TB_MDM_RULE_SET`): `maruRuleSetId`(PK, 50)·`maruRuleSetName`(not null)·`ruleIds`(JSON 문자열, not null)·`description`·`status`(20)·`rowVersion`(**updatable=false**, `@Version` 아님). 생성자 `MdmRuleSet(String id, String name, String ruleIds)` 가 status `INUSE`·rowVersion 0 을 넣는다. `extends CactusAuditEntity`. 감사 카운터 칼럼은 `VER`(부모 테이블 관례) | 코드 |
| F2 | DDL(V8, sqlite·mssql): `STATUS IN ('INUSE','DEPRECATED')` CHECK, `RULE_IDS` 는 `json_valid`/`ISJSON` CHECK, 기본값 STATUS 'INUSE'·ROW_VERSION 0, MSSQL 이름 `NVARCHAR(100)`. **버전 테이블 없음**(06:907·924·929 "버전·승인·적용시점이 없다") | `BA/resources/db/migration/mdm/{sqlite,mssql}/V8__create_mdm_business_rule.sql` |
| F3 | `MdmRuleSetRepository extends JpaRepository<MdmRuleSet,String>` 에 메서드가 없다. `BLT/contract/rule/MdmRuleContractOnlyArchitectureTest._06_리포지토리는_메서드를_선언하지_않는다` 가 강제한다 → 조회는 `BL/common/rule/RuleQueries` 에 더한다. `findById`·`existsById`·`save` 같은 상속 메서드는 써도 된다 | 코드 |
| F4 | `RuleQueries`: `allSets()`(세트 ID 순 전부), `latestReleasedVers(Collection<String>)`(룰마다 RELEASED 중 **VER 최대**, 없으면 빠짐), `vars(ruleId, ver)`(COND 먼저 seq 순), `rows(ruleId, ver)`(NORMAL seq 순, DEFAULT 마지막), `searchPrefix(keyword, limit)`, `latestReleasedResultVarsExcept(ruleId)` | `BL/common/rule/RuleQueries.java` |
| F5 | `RuleUsageFinder`(룰 화면 활용처 카드)의 이름 계산은 이 Task 의 정의와 다르다: 자기 결과 이름도 reads 에 넣고, `VARIABLE_OR_CONSTANT` 상수를 거르지 않으며, `grp_cond_ast` 를 보지 않는다. **이 Task 는 이 클래스를 고치지 않는다**(D4) | `BL/common/rule/RuleUsageFinder.java:70-114` |
| F6 | 엔진의 세트 실행(`EJ/rule/MdmRuleEngine.evaluateSet`)은 `ruleIds` 순서 그대로 돌리고, 입력 키 확인(`missingInputKeys`)은 룰마다 (계약 always ∪ DERIVE 행 변수) − 앞 룰 결과 이름이다. 결과 이름은 `RuleEvaluator.resultNames(def)` = 결과 열 그룹이면 `resGrp`, 아니면 `varName`(slot 이름). 같은 이름은 뒤 룰이 덮어쓴다. 엔진에 순환 검출·위상 정렬은 없다 | `EJ/rule/MdmRuleEngine.java:68-140`, `RuleEvaluator.java:502-530` |
| F7 | EvalEx 상수 여덟: `EJ/expr/ReservedNames.CONSTANTS` = `NULL, TRUE, FALSE, PI, E, DT_FORMAT_ISO_DATE_TIME, DT_FORMAT_LOCAL_DATE_TIME, DT_FORMAT_LOCAL_DATE`(대소문자 무시). mdm/lib 은 엔진을 `api` 로 의존한다 | 코드 |
| F8 | 변수 타입 해석은 `RuleVarTypeResolver.resolve(ruleId, ver, List<MdmRuleVar>)` 한 곳이다(순서: Expression 조건 열 → DOMAIN_ID → DATA_TYPE(DECLARED) → 컬럼 사전(COLUMN) → 다른 룰 결과(RULE_RESULT) → UNRESOLVED). **DECLARED 가 COLUMN 보다 먼저**이므로 이 Task 의 출처 분류(컬럼 사전 우선)에 `typeSource` 를 그대로 쓰면 안 된다(I6). 한 번 호출에 도메인 트리를 한 번 읽는다 | `BL/common/rule/RuleVarTypeResolver.java` |
| F9 | 컬럼 사전 조회 `MdmColumnRepository.findByPhysName(String)`(Optional). 물리명 규칙 `BL/dma/naming/NamingRules.STD_PHYS_NAME`(`^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`)·`CODE_MAX`(50). `RuleIdRules.validateRuleId` 는 메시지가 "룰 ID" 라서 세트 ID 에 쓰지 않는다 | 코드 |
| F10 | JSON: `BL/common/dictionary/DomainJson.readList(String)`·`readMap(String)`·`write(Object)` | 코드 |
| F11 | 담당자 역할 판단은 `BL/common/rule/RuleStewardCheck.requireSteward()`(MDM013)·`isSteward()` 한 곳(08-02 I30). dme 권한 매트릭스는 `MDM_STD_ADMIN → PERM_MDM_READ`, `MDM_STEWARD → PERM_MDM_CONFIRM` | 코드 |
| F12 | action 어휘는 16종 고정(`MdmActions`): `search, view, export, compare, save, delete, reg, import, validate, execute, copy, restore, lock, unlock, handover, confirm`. `restore` 는 EDIT 세트·mcm `allActions` 에 이미 있다. 새 action 은 만들 수 없다. 같은 action 안의 갈래(target)는 Java 가 가른다(두 번째 게이트웨이 금지) | `BL/contract/security/`, `BA/resources/services/dme/ruleEdit.bpmn` 머리 주석 |
| F13 | 오류: `MdmErrors.of(MdmErrorCode)`·`of(code, detail, List<MdmCheckIssue>)` — message 는 기본 문구로 시작하고 `": "` 뒤에 상세를 붙인다(BPMN 안 예외는 `meta.message` 만 화면에 온다). 선례 `common/mastercode/MasterCodeRejections`(MDM022). 현재 마지막 코드는 `MDM023`. `MdmCheckIssue(code, message, field, itemKey)` | `BL/common/support/MdmErrors.java`, `BL/contract/common/MdmErrorCode.java` |
| F14 | OASIS 는 params 배열을 받지 않는다. 배열은 `grids.<이름>.rows` 로 보내고 같은 이름의 DTO 속성 `List<Map<String,Object>>` 로 받는다(08-02 이탈 B4, `RuleEditSaveRequest.rows`). FE 는 `callOasis(serviceId, action, params, grids?)`(`M/src/dme/oasis-call.ts`, null 자동 제거, `isRowVersionConflict`) | 코드 |
| F15 | 메뉴 시드: `DI.seedMdmRuleMenus()`(987줄)가 `{"ruleMng","룰","001","5050100"}`, `{"ruleEdit","룰 화면","002","5050200"}` 를 `insertMcmSecObjIfAbsent`·`insertMcmSecMenuIfAbsent(objectId, seq, fullSeq, 이름, "dme", objectId)`·SYSADMIN PERM_ALL·`seedMdmObjectRbac(objectId,"dme")` 로 넣는다. `seedMdmMenus()` 952줄이 부른다. 메뉴 멱등 키는 MENU_ID(= objectId). FULL_SEQ 는 부팅 끝에 다시 매긴다. TSK-08-05(ready)는 `dme/ruleConfirm` 를 같은 폴더에 더한다 | 코드, `docs/mdm/wbs.md:1435` |
| F16 | 시드 대조 `src/frontend/e2e/fixtures/mdm-rbac-seed-check.sql` 은 폴더·역할·권한만 본다(leaf 를 보지 않는다) → 고칠 필요 없음 | 코드 |
| F17 | 정적 검사 테스트: `BAT/dme/DmeBpmnActionTest`(action→method 표·권한 세트·serviceTask 속성), `BAT/MdmOasisActionVocabularyTest`(어휘·EDIT 세트·`allActions` 포함·스캔 대상), `BLT/contract/common/CommonContractTest`(오류 코드 값 단언) | 코드 |
| F18 | 화면 간 이동 공용: `@/shell` 의 `openMdmPage(componentPath, params?)` 와 `useMdmPageParams(componentPath, tabId, cb)`(받는 화면은 props `tabId` 를 받는다, 선례 `M/pages/dmc/codeMng` → `dmc/codeEdit`). 룰 화면 이동은 `@/dme/rule-handoff` 의 `openRuleEdit(ruleId, ver?)` | `M/src/shell/page-handoff.ts`, `M/src/dme/rule-handoff.ts` |
| F19 | shared `AgDataGrid`: 행 드래그 `rowDragField`·`isRowDraggable`·`onRowOrderChange(orderedKeys)`(순서 상태의 주인은 호출자, 정렬 꺼짐), `rowKey`, `render`, `Pagination` | `src/frontend/shared/src/components/grid/AgDataGrid.tsx:215,334-360` |
| F20 | FE 화면 골격 선례: `M/pages/dme/ruleMng/page.tsx`(`MdmPageLayout group="dme"`, `SearchArea`/`SearchField`, `AgDataGrid`, `Pagination`, 등록 패널 `ContentPanel width={380}`, `canDoButton(rbac, SCREEN_ID, action)` 으로 비활성), `M/pages/dme/ruleEdit/page.tsx`(상단 고르기 바·16칸 카드 그리드·`runWrite`·dirty 확인 문구) | 코드 |
| F21 | 화면 등록: `M/tsup.config.ts` 의 화면 entry 한 줄씩(47-48줄 부근), `src/frontend/m-mcm/lib/generated/page-registry.ts` 는 `m-mcm/scripts/generate-page-registry.mjs` 가 만든다(커밋된 파일을 e2e 가 쓴다) | 코드 |
| F22 | Vitest 렌더 테스트 관례: 첫 줄 `// @vitest-environment happy-dom`, `M/tests/dme/helpers/render.ts`(`installDomStorage`·`jsonResponse`·`typeInto`·`flush`·`findButton`·`RBAC_STORE_KEY`), `globalThis.fetch = vi.fn(...)`. 엔진·백엔드 경로 상수는 `M/tests/helpers/engine-paths.ts`(`ENGINE_ROOT` 등). `pnpm build:libs` 가 먼저 돌아야 m-mdm 테스트가 통과한다 | 코드 |
| F23 | BE 테스트 관례: `@SpringBootTest(MOCK)`+`@ActiveProfiles("local")`+`@Import(DmeTestSupport.Config.class)`+`@TempDir` SQLite `@DynamicPropertySource`, `@BeforeEach` 트리거 드롭 뒤 `DmeTestSupport.clear(jdbc)`(TB_MDM_RULE_SET 포함), `currentUser.set("kim", STEWARD)`. 헬퍼 `rule/released/pending/var/row/domain/column` 은 있고 **세트 헬퍼는 없다** | `BAT/dme/DmeTestSupport.java`, `BAT/dme/ruleMng/RuleMngServiceTest.java` |
| F24 | 네이티브 쓰기 관례: `RuleNativeWrites.audited(sql)` 모양 — `entityManager.flush()` 뒤 `MdmNativeAuditSupport.currentStamp()` 로 `U_USR_ID/U_AT/U_SVC_ID/U_PGM_ID`, 일시는 `MdmTemporalBinder.toDb`, 감사 카운터 `VER = COALESCE(VER,0)+1`. 서비스 클래스에 `@Transactional` 금지, `TransactionTemplate` 사용 | `BL/common/rule/RuleNativeWrites.java` |
| F25 | e2e 선례: `src/frontend/e2e/mdm-ruleMng.spec.ts`·`mdm-ruleEdit.spec.ts`(login·`menuItem`·메뉴 트리 열기·`test.describe.configure({mode:"serial"})`·스크린샷 경로 상수), 사용자 픽스처 `mdm-rbac-users.sql`(`e2e_mdm_steward`·`e2e_mdm_stdadmin`·`e2e_mdm_none`, 비밀번호 admin123). 기존 `mdm-ruleEdit-data.sql` 은 세트 `LS_E2E`(`["QLTY_GRD_JDG"]`)를 넣고, `mdm-ruleEdit.spec.ts` S2 가 활용처 카드에서 그것을 기대한다 | 코드 |
| F26 | 로컬 샘플 `src/backend/mdm/sample/mdm-local-sample.sql:657-660` 에 세트 `LS_A3`·`QG_A1`·`WID_OLD`(DEPRECATED)가 이미 있다. 이 Task 는 샘플을 고치지 않는다 | 코드 |
| F27 | 06 원문: 세트 저장 시 검사 넷(06:1092), 조회 화면 조건·열(06:754), 등록(06:755), 편집·입출력 표·의존 룰·링크·값 테스트 카드(06:756), 폐기 확인(06:766), 구성 지침 5단계(06:1110-1122). 시안 로직: `ruleIO`·`ruleTypes`(H:2125-2138), `setIO`(H:2139-2152), `setIOHtml`(H:2153-2165), `renderSet`(H:2185-2214), `setChecks`(H:2215-2233), `setDeps`(H:2234-2239), `guide`(H:2240-2259), `renderSlist`(H:2317-2324), 등록(H:2328-2333), 지침 버튼(H:2340-2341), 폐기·되살리기(H:2296-2308), `inputVars`(H:1196-1203), `astVars`(H:764) | 문서 |
| F28 | PRD FR-E5 "저장 즉시 배포는 보류", PRD §5 보류 목록의 "룰 세트 즉시 배포"(`docs/mdm/PRD.md:121,138`). 세트 값 테스트 카드는 06 본문(06:756)에만 있고 시안에 없다 | 문서 |

---

## 1. 접근 방식

두 화면을 08-02 의 `ruleMng`·`ruleEdit` 선례 모양으로 만든다. BE 는 `com.dongkuk.dmes.mdm.dme.{ruleSetMng,ruleSetEdit}.{dto,service}` + BPMN
`services/dme/{ruleSetMng,ruleSetEdit}.bpmn`, FE 는 `M/pages/dme/{ruleSetMng,ruleSetEdit}/page.tsx`, 메뉴는 `DataInitializer` 의 `dme` 폴더 아래
leaf 두 개다. 룰 세트는 버전이 없는 목록 한 행(F2)이므로 공통 버전 서비스(선점·DRAFT)를 쓰지 않고, 쓰기는 `ROW_VERSION` 조건부 네이티브
UPDATE 하나로 한다. 이 Task 의 핵심은 **"룰마다 무엇을 읽고 무엇을 만드는가"를 한 정의로 고정하고, 그 위에서 세트 입출력·의존 룰·저장 시
검사를 같은 알고리즘으로 서버와 화면이 계산하는 것**이다. 룰 하나의 입출력(`RuleIo`)은 서버 `RuleIoReader` 한 곳이 DB 에서 계산한다 —
정의는 엔진이 세트를 실행하기 전에 요구하는 키(F6)와 같게 맞춘다(자기 결과 이름 제외, 결과 열 그룹은 `resGrp`, EvalEx 상수 제외). 세트
수준 계산(입출력 표·의존 룰·검사)은 순수 함수로 Java(`RuleSetAnalyzer`)와 TS(`set-model.ts`)에 같은 알고리즘으로 두고, 한 벌 코퍼스
(`rule-set-corpus.json`)를 JUnit 과 Vitest 가 함께 읽어 두 구현이 메시지까지 같음을 고정한다(08-02 분석 코퍼스 선례). 화면은 순서를 바꿀
때마다 서버를 부르지 않고 TS 로 즉시 다시 계산하고(06:756 "순서를 바꾸면 그 자리에서 다시 계산"), 서버는 저장·되살리기·조회 목록에서
Java 로 다시 계산해 거부를 판정한다(화면 계산을 믿지 않는다). 결과 변수 역추적 → 위상 정렬 제안(구성 지침)은 모든 룰의 결과 변수를 봐야
하므로 서버(`RuleSetGuide`)에만 둔다. 거부는 새 오류 코드 `MDM024`(룰 세트 저장 검사 거부)로 `MasterCodeRejections` 선례처럼 싣는다(D8).
"저장 즉시 배포"는 PRD 가 보류했으므로 저장은 `TB_MDM_RULE_SET` 한 행 갱신으로 끝나고 배포 스냅샷·알림 코드는 만들지 않는다(D11). 세트 값
테스트 카드는 운영 DB 를 읽는 엔진 정의 조회(`DefinitionLookup`) 구현이 아직 없어 이 Task 에서 빼고 기능설계서에 그 결정을 적는다(D2).
마이그레이션은 만들지 않는다.

---

## 구현 단위

오케스트레이터는 이 표 순서대로 단위마다 Build 서브에이전트를 하나씩 띄운다. 단위끼리 같은 파일을 고치지 않는다(아래 파일 목록의 「단위」 열이
정본이다). 단위마다 그 단위의 새 테스트가 초록이어야 끝난다.

| 단위 | 범위(파일·기능) | 새 테스트 | 담당 불변 규칙 |
|---|---|---|---|
| B1 | BE 순수 계산: `RuleIo`·`RuleSetCheck` 레코드, `RuleSetAnalyzer`(입출력 표·의존 룰·검사), `RuleSetGuide`(역추적·위상 정렬), 코퍼스 JSON + Java 러너 | `BLT/common/rule/RuleSetAnalyzerTest`, `RuleSetGuideTest`, `RuleSetCorpusTest` | I8·I9(Java 쪽)·I10·I11·I16 |
| B2 | BE DB 읽기: `RuleIoReader`(룰 하나의 입출력·출처·타입), `RuleQueries` 조회 두 개 추가, `DmeTestSupport` 세트 헬퍼 | `BAT/common/rule/RuleIoReaderTest` | I4·I5·I6·I7 |
| B3 | BE `ruleSetEdit`: DTO·서비스(search SET/RULE/GUIDE·view·save·delete·restore)·`RuleSetWrites`(네이티브 쓰기)·`MdmErrorCode.RULE_SET_SAVE_REJECTED`(MDM024)·`RuleSetRejections`·`ruleSetEdit.bpmn` | `BAT/dme/ruleSetEdit/RuleSetEditServiceTest`, `CommonContractTest` 한 줄 | I3·I12·I13·I14·I15·I19·I20·I23 |
| B4 | BE `ruleSetMng`: DTO·서비스(search·reg)·`ruleSetMng.bpmn`, mcm 메뉴 시드 두 leaf, BPMN·어휘 정적 테스트(두 BPMN 모두), HTTP 경로 테스트(두 서비스) | `BAT/dme/ruleSetMng/RuleSetMngServiceTest`, `DmeBpmnActionTest`·`MdmOasisActionVocabularyTest`·`DmeOasisHttpTest` 에 사례 추가 | I1·I2·I17 |
| B5 | FE 세트 계산 TS 이식 `set-model.ts` + 타입 + 코퍼스 Vitest 러너 + 경로 상수 | `M/tests/dme/ruleSetEdit/set-model.test.ts`, `rule-set-corpus.test.ts` | I9(TS 쪽)·I10·I11 |
| B6 | FE `ruleSetEdit` 화면(상단 세트 고르기, 룰 세트 카드: 목록 그리드·▲▼✕·드래그·룰 추가·검사 목록·입출력 표·저장·폐기/되살리기, 구성 지침 카드) + api | `M/tests/dme/ruleSetEdit/rule-set-edit-page.test.ts` | I21·I22(받는 쪽) |
| B7 | FE `ruleSetMng` 화면(조회 조건·목록·페이징·등록 패널·편집 이동) + api, tsup entry 두 줄, page-registry 재생성 | `M/tests/dme/ruleSetMng/rule-set-mng-page.test.ts` | I22(보내는 쪽) |
| B8 | 통합: e2e 픽스처 `mdm-ruleSet-data.sql`, 스펙 두 개(스모크 넷 포함)·스크린샷, 기능설계서 2종, 식별자 사전 등재, 게이트 전체 | e2e `mdm-ruleSetMng.spec.ts`·`mdm-ruleSetEdit.spec.ts` | I18(메뉴, e2e 로만 잡힘)·I24 |

- B3·B4 는 BPMN 을 쓰므로 `.claude/skills/bpmn-skill/SKILL.md`(bpmn-tool 로 생성·검증)와 `.claude/skills/oasis-project-support/SKILL.md` 를 읽고 따른다.
- B5·B6·B7 은 `.claude/skills/mantine-aggrid-ui/SKILL.md` 를 읽고 따른다(RULE.md 무조건 적용 스킬). `@mantine/*`·`ag-grid-react` 를 화면에서
  직접 import 하지 않는다.
- **병렬 실행(담당자 지시, 2026-09-26)**: 단위를 의존 관계에 따라 동시에 띄운다. 물결 1: B1 ∥ B7 / 물결 2(B1 뒤): B2 ∥ B5 /
  물결 3: B3(B2 뒤) ∥ B6(B5·B7 뒤) / 물결 4: B4(B3 뒤) / 물결 5: B8. 같은 작업 트리를 함께 쓰므로 커밋은 반드시 경로 지정
  커밋(`git commit -m … --trailer … -- <파일…>`)으로 하고 `git add` 로 index 에 올려 두지 않는다(남의 stage 가 섞인다).
  `index.lock` 오류는 잠시 뒤 다시 한다. 다른 단위의 파일은 고치지 않는다.
- 각 단위의 작은 테스트(단일 JUnit 클래스)는 `heavy.sh` 로 감싼 gradlew `--tests` 로, Vitest 단일 파일은 감싸지 않고 돌린다. 전체 게이트는 B8 이 돈다.

---

## 2. 변경 파일 목록

§2.1~§2.4 의 「단위」 열은 위 「구현 단위」 표의 단위다.

### 2.1 생성 — 백엔드

| 파일 | 단위 | 내용 |
|---|---|---|
| `BL/common/rule/RuleIo.java` | B1 | `record RuleIo(String ruleId, String ruleName, String ruleKind, String status, boolean exists, Integer releasedVer, String hitPolicy, List<IoName> conds, List<IoName> results)` 와 중첩 `record IoName(String name, String source, String label, String dataType, Integer scale, boolean dateString, String maruCodeId)`. `source` 는 conds 에서 `DICT`·`PROG`·`NONE`, results 에서 null. 없는 룰은 `exists=false`·빈 목록, RELEASED 가 없는 룰은 `releasedVer=null`·빈 목록 |
| `BL/common/rule/RuleSetCheck.java` | B1 | `record RuleSetCheck(String code, String severity, String ruleId, String otherRuleId, String varName, String message)`. severity `REJECT`·`WARN`. 코드 상수는 §6.3 표 |
| `BL/common/rule/RuleSetAnalyzer.java` | B1 | 순수(스프링·DB 없음) final 클래스. `static SetIo io(List<String> ids, Map<String,RuleIo> rules)`, `static Map<String,List<String>> deps(List<String> ids, Map<String,RuleIo> rules)`, `static List<RuleSetCheck> checks(List<String> ids, Map<String,RuleIo> rules)`. `SetIo(List<InputRow> inputs, List<ResultRow> results)`, `InputRow(name, label, dataType, scale, dateString, maruCodeId, source, List<String> users)`, `ResultRow(name, dataType, scale, dateString, maruCodeId, List<String> by, List<String> readers)`(`finalResult()` = readers 비었음). 알고리즘은 §6.2·§6.3 그대로. 08-04 가 룰 저장 때 "저장하려는 정의"로 세트를 다시 검사할 수 있게 `rules` 맵을 호출자가 넘긴다(맵의 한 항목을 바꿔 넣으면 된다, 06:327) |
| `BL/common/rule/RuleSetGuide.java` | B1 | 순수 final 클래스. `static GuideResult suggest(String target, Function<String,List<String>> producers, Function<String,RuleIo> io)`. `GuideResult(List<String> order, List<Ambiguity> ambiguous, String error)`, `Ambiguity(String varName, List<String> ruleIds)`. 알고리즘 §6.4 |
| `BL/common/rule/RuleIoReader.java` | B2 | `@Component`. `Map<String,RuleIo> read(Collection<String> ruleIds)`(입력 순서를 지킨 `LinkedHashMap`, 중복 ID 는 한 번), `Map<String,List<String>> producersOfActiveRules()`(이름 → 그 이름을 만드는 룰 ID 목록, 룰 ID 순. §6.4 대상 룰만). 정의는 §6.1. 의존: `MdmRuleRepository`, `MdmColumnRepository`, `RuleQueries`, `RuleVarTypeResolver` |
| `BL/dme/ruleSetEdit/dto/*` | B3 | `RuleSetEditSearchRequest{target, keyword, resultVar}`, `RuleSetPickResult{sets[{setId,setName,status}]}`, `RuleSetRuleSearchResult{rules[RuleIo]}`, `RuleSetGuideResult{target, order[], ambiguous[{varName,ruleIds}], error, rules[RuleIo]}`, `RuleSetViewRequest{setId}`, `RuleSetViewResult`(§6.5), `RuleSetSaveRequest{setId, setName, description, rowVersion, rules(List<Map<String,Object>>, grids.rules.rows)}`, `RuleSetSaveResult{setId, rowVersion, checks[]}`, `RuleSetStatusRequest{setId, rowVersion}`, `RuleSetStatusResult{setId, status, rowVersion, checks[]}` |
| `BL/dme/ruleSetEdit/service/RuleSetEditService.java` | B3 | `@Service("ruleSetEditService")` 파사드. `Object search(RuleSetEditSearchRequest)`(target `SET`(기본)·`RULE`·`GUIDE`), `RuleSetViewResult view(RuleSetViewRequest)`, `RuleSetSaveResult save(RuleSetSaveRequest)`, `RuleSetStatusResult delete(RuleSetStatusRequest)`(폐기), `RuleSetStatusResult restore(RuleSetStatusRequest)`(되살리기). 규칙 §6.6 |
| `BL/dme/ruleSetEdit/service/RuleSetWrites.java` | B3 | `@Repository`. 네이티브 조건부 UPDATE 세 개(`update`·`deprecate`·`restore`, §6.6) — `RuleNativeWrites.audited` 와 같은 감사 방식. 바뀐 행 수를 돌려준다 |
| `BL/dme/ruleSetEdit/service/RuleSetRejections.java` | B3 | `static BusinessException saveRejected(List<RuleSetCheck> rejects)` → `MdmErrors.of(RULE_SET_SAVE_REJECTED, detail, issues)`. issue = `MdmCheckIssue(check.code, check.message, check.varName, check.ruleId)`, detail = `"<ruleId>[<varName 또는 ->] <code> <message>; …"`(`MasterCodeRejections.detail` 모양) |
| `BA/resources/services/dme/ruleSetEdit.bpmn` | B3 | process id `ruleSetEdit`, `actionGateway` 하나에 `search→search`·`view→view`·`save→save`·`delete→delete`·`restore→restore`. serviceTask `camunda:class="ruleSetEditService"`, `method`·`output=result`·`dto=<FQCN>`, `grid` 속성 금지. 머리 주석에 action 표(ruleEdit.bpmn 형식) |
| `BL/dme/ruleSetMng/dto/*` | B4 | `RuleSetSearchRequest{keyword, ruleId, resultVar, status, page, size}`, `RuleSetListRow{setId, setName, ruleCount, finalResults[], inputCount, description, rejectCount, warnCount, status}`, `RuleSetSearchResult{rows[], totalCount}`, `RuleSetRegRequest{setId, setName, description}`, `RuleSetRegResult{setId, rowVersion}` |
| `BL/dme/ruleSetMng/service/RuleSetMngService.java` | B4 | `@Service("ruleSetMngService")`. `RuleSetSearchResult search(RuleSetSearchRequest)`, `RuleSetRegResult register(RuleSetRegRequest)`. 규칙 §6.7 |
| `BL/dme/ruleSetMng/service/RuleSetIdRules.java` | B4 | 세트 ID 규칙(§6.7 I1). 메시지 "룰 세트 ID 는 컬럼 물리명 규칙(영문 대문자·숫자를 밑줄로 이은 형식, 50자 이하)을 따라야 합니다". B3 의 저장 요청 룰 ID 검사는 기존 `RuleIdRules.validateRuleId` 를 쓴다 |
| `BA/resources/services/dme/ruleSetMng.bpmn` | B4 | process id `ruleSetMng`, `search→search`·`reg→register`, `camunda:class="ruleSetMngService"` |

### 2.2 생성 — 백엔드 테스트

| 파일 | 단위 | 확인 |
|---|---|---|
| `BLT/common/rule/RuleSetAnalyzerTest.java` | B1 | §6.2 입출력 표(입력 첫 등장 순·`users`, 결과 `by`·`readers`·최종/중간, 뒤 룰이 만드는 이름을 앞 룰이 읽으면 입력으로 잡히고 출처 그대로), `deps`(DICT 이름 제외, 자기 제외, 목록 순), §6.3 검사 여덟 코드 각각의 코드·심각도·ruleId·otherRuleId·varName·**문구**·**순서**, 두 룰 순환·**세 룰 고리**(`[A,B,C]`, A 가 C 결과를 읽고 C→B→A 의존 → `CYCLE`(A, C)), 프로그램 변수(PROG) 통과·뒤 룰이 같은 이름을 만들면 `ORDER`, 세 번 대입 경고 두 건, 빈 목록 `EMPTY` 하나만, 없는 룰·DEPRECATED·RELEASED 없음이 각각 한 건 |
| `BLT/common/rule/RuleSetGuideTest.java` | B1 | 사슬 `S_SPD ← S_FCT ← S_GRD` 제안 순서(의존 먼저), 생산자 둘이면 룰 ID 순 첫 룰을 고르고 `ambiguous` 에 둘 다, DICT·PROG 이름은 거슬러 찾지 않음, 생산자 없는 NONE 이름 → `error` "<이름>를 만드는 룰이 없다", 대상 이름을 만드는 룰이 없음 → `error` "결과 변수 <이름>를 만드는 룰이 없다", 두 룰 순환 → `error` "순환이 있다(<룰>). …", 같은 룰을 두 번 고르지 않음 |
| `BLT/common/rule/RuleSetCorpusTest.java` | B1 | **코퍼스 동치(Java 쪽)**: 클래스패스 `/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json`(= `BLR/common/rule/rule-set-corpus.json`, 없으면 실패 — 건너뛰지 않는다)의 사례마다 `RuleSetAnalyzer.io`·`deps`·`checks` 결과가 `expect` 와 순서·문구까지 같다. 사례 수 하한 단언(≥ 14) |
| `BLR/common/rule/rule-set-corpus.json` | B1 | 형식 §6.8. 사례 최소 14: 빈 목록, 통과 사슬 3, 순서 뒤집힘(ORDER), 두 룰 순환, 세 룰 고리, 없는 룰, DEPRECATED 룰, RELEASED 없음, 알 수 없는 입력(NONE), 프로그램 변수 통과, 프로그램 변수를 뒤 룰이 만듦, 중복 대입 둘·셋, 결과 열 그룹 이름, DICT 이름을 만드는 룰(의존 제외 확인) |
| `BAT/common/rule/RuleIoReaderTest.java` | B2 | SQLite(`@TempDir`, F23 관례). §6.1 규칙 전부: 이름 조건 열, 식 변수(`VAR_AST`) 참조, Expression 조건 열의 셀 `ast` 참조(열 이름은 빼고), 결과 Expression 셀 참조, `GRP_COND_AST` 참조, 자기 결과 이름 제외(대소문자 무시), 결과 열 그룹 `resGrp` 하나, **상수 제외**(`IF(X = NULL, TRUE, PI)` 식에서 `X` 만), 중복 제거·첫 등장 순, 출처 DICT(컬럼 있고 DATA_TYPE 도 선언한 이름도 DICT)·PROG·NONE, 타입·표시명, **RELEASED 가 여럿이면 VER 최대**(적용 시작이 미래인 것 포함), RELEASED 없음 → `releasedVer` null·빈 목록, 없는 ID → `exists=false`, DEPRECATED 룰도 계산, `producersOfActiveRules` 가 DEPRECATED·RELEASED 없는 룰을 빼고 룰 ID 순 |
| `BAT/dme/ruleSetEdit/RuleSetEditServiceTest.java` | B3 | view(세트·룰 목록 순 IO·검사·`editable`/`restorable` 담당자 여부), save 통과(경고 포함 응답, `ROW_VERSION`+1, `RULE_IDS` JSON 순서, 이름·설명, 감사 `U_USR_ID`, `VER`+1), **순환 거부 MDM024**(메시지에 `CYCLE` 과 "순환", 행 무변경), ORDER·EMPTY·RULE_NOT_FOUND·RULE_DEPRECATED·UNKNOWN_INPUT 거부, 경고만이면 저장, row_version 불일치 MDM001, DEPRECATED 세트 저장 MDM009, 없는 세트, 요청 룰 ID 형식 위반·중복 ID·세트명 빈 값·100자 초과 거부(행 무변경), 폐기 INUSE→DEPRECATED(+1)·이미 DEPRECATED 면 MDM009, 되살리기: 거부 검사가 있으면 MDM024·경고만이면 INUSE(+1)·INUSE 에 되살리기 MDM009, 비담당자 쓰기 세 개(save·delete·restore) MDM013, search SET(ID·세트명 부분 일치, 20건)·RULE(룰 20건 + IO)·GUIDE(§6.4, 응답 `rules` 에 순서의 IO) |
| `BAT/dme/ruleSetMng/RuleSetMngServiceTest.java` | B4 | 검색 필터 넷(세트 ID·세트명 부분 일치 / 담은 룰 부분 일치 / 결과 변수 정확 일치 — **중간 결과도** / 상태), 계산 칸(룰 수·최종 결과 변수·입력 변수 수·거부·경고 수, DEPRECATED 세트는 검사 수 0), 페이지 경계(size 기본 20·최대 100, `totalCount` 는 같은 필터 전체), 등록: ID 규칙(`qlty-bad`·`A__B`·51자 거부, 메시지 "룰 세트 ID"), 중복 `DUPLICATE_DATA`, 세트명 필수·100자, 행 = INUSE·`RULE_IDS` `[]`·ROW_VERSION 0, 비담당자 MDM013 |
| `BAT/dme/DmeBpmnActionTest.java`(수정, 메서드 추가) | B4 | `ruleSetMng_는_search_reg`(search READ), `ruleSetEdit_는_search_view_save_delete_restore`(search·view READ) |
| `BAT/MdmOasisActionVocabularyTest.java`(수정, 메서드 추가·한 줄) | B4 | 두 BPMN 이 어휘·EDIT 세트 안, `scanned` 에 `dme/ruleSetMng.bpmn`·`dme/ruleSetEdit.bpmn` 포함 |
| `BAT/dme/DmeOasisHttpTest.java`(수정, 메서드 추가) | B4 | HTTP 경로: ruleSetMng reg → ruleSetEdit save(**grids.rules.rows** 로 룰 두 개, 숫자 `rowVersion` 바인딩) 성공, 순환 목록 save 는 `meta.success=false` 이고 `meta.message` 가 "룰 세트 저장 검사를 통과하지 못했습니다" 로 시작, 역할 헤더 `X-Authenticated-Role: MDM_STD_ADMIN` 인 사용자의 save 는 `meta.success=false`·MDM013(서버 역할 검사 — BFF RBAC 403 은 e2e M6·E9 가 본다. 지금 요청 헬퍼는 역할을 STEWARD 로 고정하므로 역할을 받는 오버로드를 더한다) |
| `BLT/contract/common/CommonContractTest.java`(수정, 한 줄) | B3 | `assertCode(RULE_SET_SAVE_REJECTED, "MDM024", 400, …)` |

### 2.3 생성 — 프런트

| 파일 | 단위 | 내용 |
|---|---|---|
| `M/pages/dme/ruleSetEdit/types.ts` | B5 | `RuleIo`·`IoName`·`RuleSetCheck`·`SetIo`·`InputRow`·`ResultRow`·`RuleSetView`·`GuideResult`·`RuleSetStatusResult`·`RuleSetSaveResult` 타입(서버 JSON 모양 §6.5) |
| `M/pages/dme/ruleSetEdit/set-model.ts` | B5 | `setIo(ids, rules)`·`setDeps(ids, rules)`·`setChecks(ids, rules)` — Java `RuleSetAnalyzer` 와 **같은 알고리즘·같은 문구**(§6.2·§6.3). 추가로 화면용 `condMarks(ids, rules)`(행마다 조건 변수 칩의 강조: §6.9) 와 `laterDeps(ids, deps)`(뒤에 있음). 순수 함수, React 의존 없음 |
| `M/tests/dme/ruleSetEdit/set-model.test.ts` | B5 | Java `RuleSetAnalyzerTest` 의 핵심 사례(세 룰 고리·PROG·중복 대입·빈 목록) + `condMarks`·`laterDeps` |
| `M/tests/dme/ruleSetEdit/rule-set-corpus.test.ts` | B5 | **코퍼스 동치(TS 쪽)**: `RULE_SET_CORPUS_PATH` 를 읽어 사례마다 `setIo`·`setDeps`·`setChecks` 가 `expect` 와 순서·문구까지 같다. 사례 수 하한 ≥ 14(Java 와 같은 값). 파일이 없으면 실패 |
| `M/pages/dme/ruleSetEdit/api.ts` | B6 | `SERVICE="ruleSetEdit"`: `searchSets(keyword)`(search target SET), `searchRules(keyword)`(target RULE), `guide(resultVar)`(target GUIDE), `viewSet(setId)`, `saveSet(setId, setName, description, rowVersion, ruleIds)`(→ `callOasis(SERVICE,"save",{setId,setName,description,rowVersion},{rules:{rows: ruleIds.map(ruleId=>({ruleId}))}})`), `deprecateSet(setId,rowVersion)`(delete), `restoreSet(setId,rowVersion)`(restore) |
| `M/pages/dme/ruleSetEdit/page.tsx` | B6 | 화면 골격 §6.9. props `{tabId?}`. `useMdmPageParams("dme/ruleSetEdit", tabId, p => open(p.setId))` |
| `M/pages/dme/ruleSetEdit/state/useRuleSetEdit.ts` | B6 | 불러온 view, 편집 중 목록 `ids`·`rules` 맵(불러온 IO + 추가·지침으로 받은 IO)·세트명·설명, dirty, `runWrite`, 세트 바꿀 때 dirty 확인(08-02 문구 "저장하지 않은 변경이 있습니다. 버리고 이동할까요?") |
| `M/pages/dme/ruleSetEdit/cards/RuleSetCard.tsx` | B6 | 룰 세트 카드(span 10): 머리(세트 ID·상태 배지·row_version·"버전·승인 없음" 배지), 세트명·설명 입력, 룰 목록 그리드(`RuleListGrid`), 룰 추가, 검사 목록, 입출력 표(`SetIoTables`), 버튼(세트 저장·폐기/되살리기), 안내 문구 |
| `M/pages/dme/ruleSetEdit/cards/RuleListGrid.tsx` | B6 | `AgDataGrid` — `rowKey="ruleId"`, `rowDragField="seqNo"`, `onRowOrderChange`, 열 §6.9, 행 버튼 ▲ ▼ ✕ |
| `M/pages/dme/ruleSetEdit/cards/SetIoTables.tsx` | B6 | 입력 변수 표·결과 변수 표(§6.9) |
| `M/pages/dme/ruleSetEdit/cards/GuideCard.tsx` | B6 | 세트 구성 지침 카드(span 6) §6.9 |
| `M/pages/dme/ruleSetEdit/links.ts` | B6 | 변수·룰 링크 동작(§6.10): 룰 → `openRuleEdit(ruleId)`, 컬럼 사전 변수 → `openMdmPage("dma/columnMng")`, 앞 룰 결과 변수 → `openRuleEdit(만드는 룰)`, 프로그램 변수·어디에도 없음 → 링크 없음 |
| `M/tests/dme/ruleSetEdit/rule-set-edit-page.test.ts` | B6 | 렌더: 넘겨받은 setId 로 view 요청, 목록·의존 룰·입출력 표 표시, ▲▼ 뒤 즉시 재계산(뒤에 있음 배지·입력 변수 출처 "어디에도 없음"·검사 목록 ORDER)이 **서버 호출 없이** 된다, 드래그(`onRowOrderChange` 호출 모사) 재계산, 룰 추가(중복 추가 막음 "이미 담은 룰이다"), 저장 요청의 grids 모양, 저장 거부 메시지 표시, 경고 저장 메시지, MDM001 충돌 안내·다시 불러오기, 폐기 두 단계(폐기 → 폐기 확인/취소), DEPRECATED 면 입력·그리드·저장 비활성이고 되살리기만, 비담당자(`editable=false`)·RBAC 없음이면 쓰기 버튼 비활성, 지침 적용이 목록을 바꾸고 dirty 가 된다, 룰 링크가 `openRuleEdit` 를 부른다 |
| `M/pages/dme/ruleSetMng/types.ts` · `api.ts` | B7 | `SERVICE="ruleSetMng"`: `searchSets(filters, page, size)`(page 0부터), `registerSet(form)` |
| `M/pages/dme/ruleSetMng/page.tsx` | B7 | §6.11 |
| `M/pages/dme/ruleSetMng/components/RuleSetRegisterForm.tsx` | B7 | 등록 패널 §6.11 |
| `M/tests/dme/ruleSetMng/rule-set-mng-page.test.ts` | B7 | 목록 요청 파라미터(`meta.menuId="ruleSetMng"`, page 0, 필터 넷), 계산 칸 표시(최종 결과 변수 코드 칩·통과/거부 N 배지·DEPRECATED 는 "-"), 빈 상태, ID 규칙 즉시 표시·저장 비활성, 서버 오류 표시, 등록 성공 → `openMdmPage("dme/ruleSetEdit", {setId})` 호출(`vi.mock("@/shell", …)` 부분 모의), RBAC 없으면 저장 비활성 |
| `src/frontend/e2e/fixtures/mdm-ruleSet-data.sql` | B8 | §3.4.3 |
| `src/frontend/e2e/mdm-ruleSetMng.spec.ts` · `mdm-ruleSetEdit.spec.ts` | B8 | §3.4.1·§3.4.2 |
| `docs/mdm/screens/ruleSetMng/ruleSetMng_기능설계서.md` · `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md` | B8 | `docs/mdm/screens/ruleMng/ruleMng_기능설계서.md` 목차(1 화면 개요 ~ 11 특이사항)를 따른다. 내용은 이 설계 §6 과 D-목록. **ruleSetEdit §11 에 "세트 값 테스트 카드 — 이번 범위에서 제외(D2), 사유·후속 조건"을 적는다**(spec 제약: 화면 설계 산출물에서 포함 여부 확정) |

### 2.4 수정

| 파일 | 단위 | 수정 |
|---|---|---|
| `BL/common/rule/RuleQueries.java` | B2 | 메서드 **추가만**: `List<MdmRuleVar> latestReleasedResultVarsOfActiveRules()`(`latestReleasedResultVarsExcept` 와 같은 JPQL 에 `MdmRule` 조인 `status <> 'DEPRECATED'`, 룰 ID·seq·var_id 순). 기존 메서드는 고치지 않는다 |
| `BAT/dme/DmeTestSupport.java` | B2 | 헬퍼 **추가만**: `ruleSet(JdbcTemplate, String id, String name, String ruleIdsJson, String status, long rowVersion)`(감사 칼럼 채움) |
| `BL/contract/common/MdmErrorCode.java` | B3 | `RULE_SET_SAVE_REJECTED("MDM024", 400, ErrorCode.BUSINESS_ERROR, "룰 세트 저장 검사를 통과하지 못했습니다")` 한 줄 추가(D8) |
| `DI`(`DataInitializer.java`) | B4 | 새 메서드 `seedMdmRuleSetMenus()`(javadoc: TSK-08-06, action 목록) — `{"ruleSetMng","룰 세트","004","5050400"}`, `{"ruleSetEdit","룰 세트 편집","005","5050500"}` 를 `seedMdmRuleMenus()` 와 같은 네 호출로 넣는다. `seedMdmMenus()` 의 `seedMdmRuleMenus();` 다음 줄에 호출 한 줄. `seedMdmRuleMenus()` 배열은 고치지 않는다(D12) |
| `M/tsup.config.ts` | B7·B6 | B7 이 `"pages/dme/ruleSetMng/page": "pages/dme/ruleSetMng/page.tsx"` 한 줄, B6 이 `"pages/dme/ruleSetEdit/page": "pages/dme/ruleSetEdit/page.tsx"` 한 줄(병렬 실행 — 없는 page.tsx 를 entry 로 걸면 `pnpm build:libs` 가 깨진다) |
| `src/frontend/m-mcm/lib/generated/page-registry.ts` | B7·B6 | `cd src/frontend/m-mcm && node scripts/generate-page-registry.mjs` 로 재생성(생성기는 page.tsx 를 스캔한다. B7 뒤 `dme/ruleSetMng` 한 줄, B6 뒤 `dme/ruleSetEdit` 한 줄이 늘어야 한다, 손으로 고치지 않는다) |
| `M/tests/helpers/engine-paths.ts` | B5 | `RULE_SET_CORPUS_PATH = path.resolve(__dirname, "../../../../backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json")` 한 줄(주석: TSK-08-06, Java `RuleSetCorpusTest` 와 함께 읽는다) |
| `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` | B8 | `ruleMng`·`ruleEdit` 행 아래 `ruleSetMng`·`ruleSetEdit` 두 행(08-02 커밋 3b4a534 형식) |

### 2.5 수정하지 않는 것 (명시)

- `RuleUsageFinder`(활용처 카드), `RuleVarTypeResolver`, `ResolvedVar`, `RuleNativeWrites`, `RuleIdRules`, `RuleCellsCodec`, 08-02·08-03 의 `dme/ruleMng`·`dme/ruleEdit`
  BE·FE 파일(위 표의 테스트 추가 세 파일 제외), `seedMdmRuleMenus()` 배열, 엔진(`maru-mdm-engine` main) — 세트 실행 의미는 엔진이 이미 정했고(F6) 이 Task 는 그 정의에
  맞춰 편집 화면을 만든다.
- 엔티티·DDL·Flyway 마이그레이션(칼럼이 다 있다), `MdmRuleSetRepository`(메서드 선언 금지, F3), `mdm-local-sample.sql`, `mdm-ruleEdit-data.sql`·`mdm-ruleEdit.spec.ts`·
  `mdm-rbac-seed-check.*`.
- `dma/columnMng` 화면(파라미터 받기를 더하지 않는다, D13).
- 배포 스냅샷·배포 목록·알림(보류, D11), 세트 값 테스트 카드(D2), 룰 저장 때의 세트 순서 재검사(06:327, 08-04 몫 — `RuleSetAnalyzer.checks` 를 그대로 쓸 수 있게 맵 입력으로 둔다).

---

## 3. 테스트 전략

### 3.1 백엔드 (testAll 안, 도커 없이 SQLite 로만)

§2.2 표가 전부다. 순서: 순수 계산(B1, DB 없음, 빠름) → DB 읽기(B2) → 서비스(B3·B4) → 정적·HTTP(B4). 서비스 테스트는 F23 관례를 따르고, 세트 행은 새 헬퍼
`DmeTestSupport.ruleSet(...)` 로 넣는다. 검증 쿼리는 `JdbcTemplate` 으로 `TB_MDM_RULE_SET` 을 다시 읽는다(네이티브 UPDATE 는 영속성 컨텍스트를 갱신하지 않는다).

### 3.2 프런트 단위 (Vitest, `M/tests/dme/ruleSet*/`)

§2.3 표의 Vitest 네 파일. 렌더 테스트는 F22 관례(happy-dom, `DmesUiProvider`, fetch 모의, `installDomStorage`). `@/shell` 은 `vi.mock` 으로 `openMdmPage` 만 스텁하고
나머지는 실제 것을 쓴다(`vi.importActual`). `@/dme/rule-handoff` 는 `openRuleEdit` 을 스텁한다.

### 3.3 코퍼스 동치 — 세트 계산 두 구현

한 벌 코퍼스 `BLR/common/rule/rule-set-corpus.json` 을 Java `RuleSetCorpusTest`(서버 저장·되살리기·조회 목록이 쓰는 `RuleSetAnalyzer`)와 TS `rule-set-corpus.test.ts`
(화면 즉시 계산 `set-model.ts`)가 모두 읽고, 두 러너가 같은 하한(≥ 14)을 단언한다. 비교는 `io`·`deps`·`checks` 전체이고 `checks` 는 **message 까지** 비교한다(화면 즉시
목록과 서버 거부 메시지가 사용자에게 같은 문장으로 보여야 한다). 사본을 m-mdm 안에 두지 않는다.

### 3.4 브라우저 E2E (dev-discipline 「화면 작업의 브라우저 E2E」)

공통: login·`menuItem`·메뉴 트리 열기는 `mdm-ruleMng.spec.ts` 패턴을 그대로 옮긴다(메뉴 `/^마루 MDM$/` → `/^업무기준$/` → `/^룰 세트$/` 또는 `/^룰 세트 편집$/`).
BASE URL `process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100"`, 비밀번호 `SMOKE_LOGIN_PASSWORD ?? "admin123"`, `test.describe.configure({mode:"serial"})`.
편집 시나리오는 **`e2e_mdm_steward`** 로 로그인한다(SYSADMIN 프리패스 뒤에 RBAC 회귀를 숨기지 않는다). 스크린샷은
`docs/mdm/tasks/TSK-08-06/screens/dme-ruleSetMng-*.png`·`dme-ruleSetEdit-*.png`. 두 스펙은 서로의 데이터에 기대지 않는다(각자 픽스처의 다른 세트를 쓴다). 목록 단언은
세트 키워드 `E2S_` 로 좁혀서 기존 픽스처의 `LS_E2E` 가 섞여도 흔들리지 않게 한다.

#### 3.4.1 `mdm-ruleSetMng.spec.ts`

| # | 스모크 넷 / 고유 | 절차와 기대 |
|---|---|---|
| M1 | 스모크 1 메뉴 | steward 로그인 → 마루 MDM > 업무기준 > 룰 세트 → 제목 "룰 세트" 와 등록 패널(`set-register-form`)이 보인다 |
| M2 | 스모크 2 목록·빈 상태 | 세트 칸 `E2S_` 조회 → `E2S_CHAIN`(룰 수 3, 최종 결과 변수 `S_SPD`, 입력 변수 수 3, "통과"), `E2S_BADORD`("거부 1"), `E2S_HASOLD`("거부 1"), `E2S_OLDSET`(DEPRECATED, 세트 검사 "-")가 서버 데이터로 보인다. 결과 변수 `S_GRD` 로 조회 → 중간 결과를 만드는 룰을 담은 `E2S_CHAIN`·`E2S_BADORD`·`E2S_OLDSET` 이 보이고 `E2S_HASOLD` 는 없다(편집 스펙이 다른 세트에 `S_GRD` 생산 룰을 더할 수 있으므로 "포함·제외"만 단언하고 건수는 단언하지 않는다). 담은 룰 `E2S_OLD` → `E2S_HASOLD` 만. 세트 `NO_SUCH_SET` → 빈 상태 문구. 스크린샷 `dme-ruleSetMng-list.png` |
| M3 | 스모크 3 + 수용 1 등록 → 편집 이동 | 등록 패널에 `E2S_NEW_SET`·"E2E 새 세트" → 저장 → **룰 세트 편집 탭이 열리고** 현재 세트 `E2S_NEW_SET`, 상태 INUSE, "룰이 없다" 빈 목록 문구, 검사 목록에 "룰이 하나도 없다"(거부). 룰 세트 탭으로 돌아와 `E2S_NEW` 로 조회하면 `E2S_NEW_SET` 행(룰 수 0, "거부 1")이 보인다. 스크린샷 `dme-ruleSetMng-register.png` |
| M4 | 스모크 4 서버 오류 | 같은 ID `E2S_CHAIN` 으로 등록 → 서버 중복 오류가 화면(ErrorModal)에 보인다 |
| M5 | ID 규칙 | ID `bad-id` → 입력 칸에 물리명 규칙 안내가 즉시 보이고 저장 버튼이 비활성 |
| M6 | 권한 | stdadmin 로그인 → 목록은 보이고 등록 저장 버튼이 비활성 |

#### 3.4.2 `mdm-ruleSetEdit.spec.ts`

| # | 스모크 넷 / 고유 | 절차와 기대 |
|---|---|---|
| E1 | 스모크 1 메뉴 | steward → 마루 MDM > 업무기준 > 룰 세트 편집 → 세트 고르기 칸(`set-pick-keyword`)과 빈 상태가 보인다 |
| E2 | 스모크 2 서버 데이터 | `E2S_CHAIN` 고르기 → 목록 3줄(1 `E2S_GRD`, 2 `E2S_FCT`, 3 `E2S_SPD`, 룰명·종류·정책), `E2S_FCT` 의 의존 룰 `E2S_GRD`(뒤에 있음 배지 없음), 입력 변수 표 3줄(`SET_THK`·`SET_SURF`·`SET_WID`, 출처 "컬럼 사전"), 결과 변수 표(`S_SPD` 최종, `S_GRD`·`S_FCT` 중간), 검사 목록 "통과". 스크린샷 `dme-ruleSetEdit-chain.png` |
| E3 | 순서 편집·뒤에 있음·즉시 재계산 | 1행 `E2S_GRD` 의 ▼ → `E2S_FCT` 가 1행이 되고 의존 룰 칸에 `E2S_GRD` + "뒤에 있음", 입력 변수 표에 `S_GRD`(출처 "어디에도 없음"), 검사 목록에 거부 "E2S_FCT가 뒤에 도는 E2S_GRD의 결과 변수 S_GRD를 읽는다. E2S_GRD를 E2S_FCT 앞으로 옮긴다". 이어서 드래그 손잡이로 `E2S_GRD` 를 맨 위로 끌어 놓는다(`page.mouse` down/move/up) → 배지·거부가 사라진다. 저장하지 않고 다른 세트로 가려 하면 dirty 확인 대화상자가 뜬다(취소). 스크린샷 `dme-ruleSetEdit-reorder.png`(▼ 직후) |
| E4 | 수용 3 순환 저장 거부 | `E2S_CYCSET`(`["E2S_GRD"]`) 고르기 → 룰 추가로 `E2S_CYA`, `E2S_CYB` 추가 → 검사 목록에 순환 거부가 즉시 보인다 → 세트 저장 → **서버 오류 메시지 "룰 세트 저장 검사를 통과하지 못했습니다: …CYCLE…(순환)"** 가 보이고, 다시 불러오면 목록이 `E2S_GRD` 하나 그대로다. 스크린샷 `dme-ruleSetEdit-cycle.png` |
| E5 | 수용 4 중복 대입 경고 + 스모크 3 수정 한 번 | `E2S_CYCSET` 에 `E2S_DUP` 추가 → 검사 목록에 경고 "E2S_GRD와 E2S_DUP가 같은 결과 변수 S_GRD에 대입한다", 결과 변수 표 `S_GRD` 에 "덮어씀" → 세트명 "E2E 순환 세트(수정)" 로 바꾸고 세트 저장 → 저장 성공 메시지와 같은 경고, row_version 이 1 늘었다. 다시 불러와도 목록 `[E2S_GRD, E2S_DUP]`·세트명 유지. 스크린샷 `dme-ruleSetEdit-warn.png` |
| E6 | 구성 지침 → 위상 정렬 제안 → 목록 적용 | `E2S_GUIDESET`(빈 목록) 고르기 → 지침 결과 변수 `S_SPD` → 찾기 → 제안 순서 "1. E2S_DUP → 2. E2S_FCT → 3. E2S_SPD" 와 "고르기" 배지(`S_GRD: E2S_DUP, E2S_GRD`) → "이 순서를 목록에 적용" → 목록이 그 셋으로 바뀌고 입출력 표가 다시 계산된다 → 세트 저장 성공. 지침 결과 변수 `S_CYA` → 찾기 → 오류 "순환이 있다(…)". 스크린샷 `dme-ruleSetEdit-guide.png` |
| E7 | 폐기·되살리기 | `E2S_OLDSET`(DEPRECATED) 고르기 → 세트명·설명·그리드·룰 추가·세트 저장이 비활성이고 버튼은 "되살리기" → 되살리기 → 상태 INUSE. 이어서 폐기 → "폐기 확인"·"취소"와 경고 문구 "폐기하면 이 세트를 부르는 호출은 판정 오류가 난다." → 폐기 확인 → 상태 DEPRECATED. 스크린샷 `dme-ruleSetEdit-deprecated.png` |
| E8 | 스모크 4 서버 오류 | `page.route("**/api/mdm/oasis/ruleSetEdit/save")` 가 `{meta:{success:false, code:"MDM001", message:"다른 사용자가 수정했습니다. 다시 불러오세요"}}` 를 돌려주게 하고 저장 → 충돌 안내와 다시 불러오기 버튼이 보인다 |
| E9 | 권한 | stdadmin → `E2S_CHAIN` 을 볼 수 있고 세트 저장·폐기·룰 추가·지침 적용이 비활성 |
| E10 | 룰 링크 | `E2S_CHAIN` 목록의 `E2S_GRD` 링크 → 룰 화면 탭이 열리고 현재 룰 `E2S_GRD`(`rule-edit-current`) |

#### 3.4.3 e2e 데이터 `mdm-ruleSet-data.sql`(mdm.db, mdm 기동으로 Flyway 적용 뒤 한 번)

**자체 완결**이다 — 도메인·컬럼·룰·세트를 모두 스스로 넣고 `mdm-ruleEdit-data.sql` 에 기대지 않는다(적재 순서 의존 없음, 같은 mdm.db 에 둘 다 넣어도 ID 가 겹치지 않는다).
머리 주석은 `mdm-ruleEdit-data.sql` 형식("seed-only, 격리 DB 전용, 운영 시드 아님", INSERT 만). 감사 칼럼 `C_USR_ID='e2e-fixture'`·`C_PGM_ID='mdm-ruleSet-data.sql'`·`VER`/`AUD_VER`=0.

- 도메인 셋: `SET_THK`(QTY NUMBER 5,2), `SET_WID`(QTY NUMBER 5,0), `SET_SURF`(TEXT STRING 2). 컬럼 셋: 물리명 `SET_THK`·`SET_WID`·`SET_SURF`(라벨 "세트 두께"·"세트 폭"·"세트 표면").
- 룰(모두 SOURCE_KIND 'MDM'). 따로 적지 않으면 STATUS 'INUSE', VER 1 RELEASED·HIT FIRST·`APPLY_FROM '2026-01-01 00:00:00'`·`APPLY_TO '9999-12-31 00:00:00'`·`RELEASED_AT` 같음,
  행은 NORMAL 1 개(조건 셀 `{"op":"NA"}`, 결과 셀 `{"val":…}`) + DEFAULT 1 개, `LAST_VAR_ID`·`LAST_ROW_ID` 는 넣은 최대값.

  | 룰 | 조건 열(DISP '1', 이름 변수) | 결과 열(DISP 'Value') | 비고 |
  |---|---|---|---|
  | `E2S_GRD` | `SET_THK`, `SET_SURF` | `S_GRD` STRING | |
  | `E2S_FCT` | `S_GRD`, `SET_WID` | `S_FCT` NUMBER | `S_GRD` 는 컬럼 사전에 없다 |
  | `E2S_SPD` | `S_FCT` | `S_SPD` NUMBER | |
  | `E2S_DUP` | `SET_WID` | `S_GRD` STRING | 같은 결과 변수 |
  | `E2S_CYA` | `S_CYB` | `S_CYA` NUMBER | 순환 짝 |
  | `E2S_CYB` | `S_CYA` | `S_CYB` NUMBER | 순환 짝 |
  | `E2S_OLD` | `SET_THK` | `S_OLD` NUMBER | STATUS 'DEPRECATED' |

- 세트(RULE_IDS JSON, ROW_VERSION 0): `E2S_CHAIN` INUSE `["E2S_GRD","E2S_FCT","E2S_SPD"]`, `E2S_BADORD` INUSE `["E2S_FCT","E2S_GRD"]`, `E2S_HASOLD` INUSE `["E2S_OLD"]`,
  `E2S_OLDSET` DEPRECATED `["E2S_GRD"]`, `E2S_CYCSET` INUSE `["E2S_GRD"]`, `E2S_GUIDESET` INUSE `[]`.
- 이 스펙들은 세트를 만들고 고치므로 같은 mdm.db 로 두 번 돌릴 수 없다(새 DB 로 시작 — 「E2E 서버 절차」 1)).

### 3.5 추가 게이트(커밋 전, 바꾼 파일만)

```bash
# mantine-aggrid-ui audit — 두 명령 모두 0건(B5~B8)
python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetMng src/frontend/m-mdm/pages/dme/ruleSetEdit
python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/m-mdm/pages/dme/ruleSetMng src/frontend/m-mdm/pages/dme/ruleSetEdit
# BPMN 스키마 검증(B3·B4) — bpmn-skill 의 bpmn-tool 검증 명령(SKILL.md 가 정한 것)
# OASIS 계약 — ERROR 0 / WARN 0 유지(INFO 는 늘 수 있다)
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
# 담당자 역할 판단 한 곳(I19) — 출력 0줄
grep -rn "MdmRoles.STEWARD" src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetMng src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit
# 기준선 게이트(글자 그대로, B8)
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain
cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test
cd src/frontend && pnpm test:unit:shared
cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint
```

전체 테스트·빌드·E2E·모든 gradlew 호출은 `.claude/skills/dflow-dev/scripts/heavy.sh` 로 감싼다(`HEAVY_BUSY`·`DEPS_BUSY` 면 같은 명령을 다시 부른다).

---

## 4. 수용 기준 매핑

| # | 수용 기준 | 검증 방법 |
|---|---|---|
| 1 | 등록 후 편집 화면으로 이동 | FE `rule-set-mng-page.test.ts`(등록 성공 → `openMdmPage("dme/ruleSetEdit", {setId})`), `rule-set-edit-page.test.ts`(넘겨받은 setId 로 view), BE `RuleSetMngServiceTest`(INUSE·룰 없음 한 행), e2e M3(편집 탭이 그 세트로 열린다) |
| 2 | 포털 메뉴에서 화면이 열리고 e2e `mdm-ruleSetMng.spec.ts` 가 통과한다 | §3.4.1 M1~M6(스모크 넷 1~4 = M1·M2·M3·M4) |
| 3 | 순환이 있으면 저장 거부 | BE `RuleSetAnalyzerTest`(두 룰 순환·세 룰 고리 모두 REJECT), `RuleSetCorpusTest`·TS `rule-set-corpus.test.ts`(같은 사례), `RuleSetEditServiceTest`(MDM024·행 무변경), `DmeOasisHttpTest`(HTTP 경로 `meta.message`), FE `rule-set-edit-page.test.ts`(거부 메시지 표시), e2e E4 |
| 4 | 같은 결과 변수 중복 대입 경고 | BE `RuleSetAnalyzerTest`(DUP_RESULT WARN, 셋이면 두 건), `RuleSetEditServiceTest`(경고만이면 저장되고 응답에 경고), 코퍼스 두 러너, FE 페이지 테스트, e2e E5 |
| 5 | 포털 메뉴에서 화면이 열리고 e2e `mdm-ruleSetEdit.spec.ts` 가 통과한다 | §3.4.2 E1~E10(스모크 넷 1~4 = E1·E2·E5·E8) |

요구사항(spec §요구사항) 대응: 조회 계산 칸 → `RuleSetMngServiceTest`·M2 / 빈 세트 등록 INUSE → M3 / 순서 편집·뒤에 있음·입출력 표 → E2·E3 / 역추적·위상 정렬·목록 적용·순환 검출 →
`RuleSetGuideTest`·E6 / 저장 시 검사 4개(+ 알림 한 종, D5)·폐기·되살리기 → `RuleSetEditServiceTest`·E4·E5·E7 / 저장 즉시 배포 보류 → D11(코드 없음).

도커 금지로 확인하지 못한 수용 기준은 없다(아래 절).

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

변이 열은 Build·Verify 가 그 규칙을 일부러 깨뜨렸을 때 빨간색이 되어야 하는 **대상 테스트**다.

| # | 규칙 | 변이 → 잡는 테스트 |
|---|---|---|
| I1 | **세트 ID = `NamingRules.STD_PHYS_NAME` + 50자 이하, 세트끼리 유일.** 서버가 판정하고(`RuleSetIdRules`, 메시지 "룰 세트 ID"), 화면 검사는 보조다. 중복은 `ErrorCode.DUPLICATE_DATA` | 정규식 느슨하게·길이 검사 삭제·중복 검사 삭제 → `RuleSetMngServiceTest` |
| I2 | **등록 = `TB_MDM_RULE_SET` 한 행: STATUS `INUSE`, `RULE_IDS` `[]`, ROW_VERSION 0, 세트명 필수·100자 이하, 설명 선택.** 등록자는 담당자여야 한다(`RuleStewardCheck.requireSteward()`). 다른 테이블을 쓰지 않는다 | 상태·빈 배열·역할 검사 바꿈 → `RuleSetMngServiceTest` |
| I3 | **세트에는 버전·DRAFT·선점이 없다.** 공통 버전 서비스(`VersionStateService`·`DraftOwnershipService`·`VersionWriteGuard`)를 부르지 않고 `TB_MDM_RULE_VER` 등 룰 테이블을 쓰지 않는다 | 저장·폐기·되살리기에 버전 서비스 호출이나 룰 테이블 쓰기 추가 → `RuleSetEditServiceTest`(룰 테이블 행 수·ROW_VERSION 무변경 단언) |
| I4 | **룰 하나의 입출력 정의(`RuleIoReader`, §6.1)**: 룰의 **최신 RELEASED 버전**에서 conds = (Expression 이 아닌 조건 열: 식 변수면 `VAR_AST` 참조, 아니면 `VAR_NAME`) → (결과 열 `GRP_COND_AST` 참조) → (행 순서대로 DISP `Expression` 인 열의 셀 `ast` 참조), 첫 등장 순·대소문자 무시 중복 제거, **자기 결과 이름 제외**. results = 결과 열마다 `resGrp` 가 있으면 `resGrp`, 없으면 `varName`(엔진 `RuleEvaluator.resultNames` 와 같다), 첫 등장 순 | 자기 결과 제외 삭제·`GRP_COND_AST` 누락·Expression 열 이름을 conds 에 넣음·그룹에서 varName 도 넣음 → `RuleIoReaderTest` |
| I5 | **EvalEx 상수는 이름이 아니다**: AST 의 `VARIABLE_OR_CONSTANT` 값이 `ReservedNames.CONSTANTS`(대소문자 무시)면 버린다 | 필터 삭제 → `RuleIoReaderTest`(`IF(X = NULL, TRUE, PI)`) |
| I6 | **출처 우선순위 DICT > PROG > NONE**: 컬럼 사전에 그 물리명이 있으면 DICT(`findByPhysName` 존재), 아니면 그 룰이 같은 이름의 **식 변수가 아닌** 조건 열에 `DOMAIN_ID` 나 `DATA_TYPE` 을 선언했으면 PROG, 아니면 NONE. `RuleVarTypeResolver.typeSource` 로 분류하지 않는다(F8) | resolver typeSource 로 분류 → `RuleIoReaderTest`(DICT 이면서 DATA_TYPE 선언한 이름이 DICT) |
| I7 | **"지금 RELEASED" 는 `RuleQueries.latestReleasedVers` 의 VER 최대 RELEASED 다** — 조회 목록·편집 view·저장 검사·되살리기·룰 검색·구성 지침이 모두 이 한 기준(`RuleIoReader`)을 쓴다(D3) | 한 곳만 적용 시점 기준으로 바꿈 → `RuleIoReaderTest`(미래 적용 RELEASED 가 선택됨) |
| I8 | **저장 시 검사(§6.3)**: 코드 여덟(`EMPTY`·`RULE_NOT_FOUND`·`RULE_DEPRECATED`·`NO_RELEASED`·`ORDER`·`CYCLE`·`UNKNOWN_INPUT`·`DUP_RESULT`), 심각도(`NO_RELEASED`·`DUP_RESULT` 만 WARN), 문구, **순서**. 순환은 **이행적**으로 본다: 뒤 룰 j 가 의존 그래프를 따라 이 룰에 닿거나 j 가 이 룰 결과를 읽으면 `CYCLE`. REJECT 가 하나라도 있으면 저장·되살리기를 거부한다 | 이행 검사를 직접 의존만으로 → `RuleSetAnalyzerTest` 세 룰 고리 / 심각도·순서·문구 바꿈 → `RuleSetAnalyzerTest`·`RuleSetCorpusTest` |
| I9 | **세트 계산 두 구현의 동치**: Java `RuleSetAnalyzer` 와 TS `set-model.ts` 는 한 벌 코퍼스에서 `io`·`deps`·`checks`(message 포함)가 같다. 코퍼스 사본 금지, 두 러너 하한 같음 | 한쪽 문구·순서만 바꿈 → `RuleSetCorpusTest` 또는 `rule-set-corpus.test.ts` |
| I10 | **세트 입출력 표(§6.2)**: 목록 순서대로 훑어 앞 룰이 이미 만든 이름을 읽으면 그 결과의 `readers` 에, 아니면 입력 변수(첫 읽는 룰의 출처·타입)로. 결과는 만든 룰마다 `by` 에 더한다. 최종 = `readers` 가 빈 결과, 중간 = 그 밖. 저장하지 않는다 | readers 계산에 뒤 룰 포함 → `RuleSetAnalyzerTest`·코퍼스·`set-model.test.ts` |
| I11 | **의존 룰·뒤에 있음**: deps[id] = 세트 안에서 id 가 아닌 룰 가운데 id 의 DICT 가 아닌 cond 를 만드는 룰(목록 순, 중복 없음). 그 룰이 목록에서 id 보다 뒤면 "뒤에 있음" | DICT 제외 삭제 → 코퍼스(DICT 이름을 만드는 룰 사례) / 뒤에 있음 비교 반대로 → `set-model.test.ts` |
| I12 | **저장(§6.6)**: 서버가 요청 목록으로 `RuleIoReader` → `RuleSetAnalyzer.checks` 를 **다시 계산**한다(화면 결과를 받지 않는다). REJECT 가 있으면 `MDM024`(쓰기 없음). 아니면 `TransactionTemplate` 안에서 조건부 네이티브 UPDATE 하나(세트명·`RULE_IDS` JSON(요청 순서)·설명·`ROW_VERSION+1`·감사 `U_*`·`VER+1`, `WHERE id AND ROW_VERSION=:rv AND STATUS='INUSE'`). 0행이면 다시 읽어 없는 세트·`MDM009`(DEPRECATED)·`MDM001`(rv) 로 가른다. 응답에 WARN 을 싣는다 | 검사 생략·클라이언트 값 사용·rv 조건 삭제 → `RuleSetEditServiceTest` |
| I13 | **요청 검사**: 룰 ID 마다 `RuleIdRules.validateRuleId`, 같은 룰 ID 두 번이면 `MDM021`, 세트명 필수·100자 이하, `rowVersion` 필수. 모두 쓰기 전에 거부 | 중복 허용 → `RuleSetEditServiceTest` |
| I14 | **폐기 = INUSE → DEPRECATED**(조건부 UPDATE, rv+1). 검사를 돌리지 않는다. 이미 DEPRECATED 면 `MDM009`. 폐기한 세트는 저장할 수 없고(`MDM009`) 되살리기만 한다. 화면은 두 단계(폐기 → 폐기 확인/취소)로만 폐기한다 | DEPRECATED 저장 허용 → `RuleSetEditServiceTest` / 한 번에 폐기 → `rule-set-edit-page.test.ts` |
| I15 | **되살리기 = DEPRECATED → INUSE, 저장된 `RULE_IDS` 로 검사를 다시 돌려 REJECT 가 없을 때만**(WARN 은 통과, 응답에 싣는다). INUSE 에 되살리기는 `MDM009` | 되살리기 검사 생략 → `RuleSetEditServiceTest` |
| I16 | **구성 지침(§6.4)**: 생산자 = DEPRECATED 가 아니고 RELEASED 가 있는 룰(`producersOfActiveRules`), 룰 ID 순 첫 룰을 고르고 둘 이상이면 `ambiguous`. DICT·PROG 이름은 거슬러 찾지 않는다. NONE 인데 생산자가 없으면 오류. 순서 = 고른 순서로 DFS 후위(의존 먼저), 순환이면 오류. 제안일 뿐 저장하지 않는다 | 생산자 정렬·DEPRECATED 포함·후위 순서 바꿈 → `RuleSetGuideTest` |
| I17 | **action 어휘**: ruleSetMng `search·reg`, ruleSetEdit `search·view·save·delete·restore`(§6.12). search·view 는 READ 세트, 나머지는 EDIT 세트. BPMN process id = serviceId = OBJECT_ID = screenId. 게이트웨이는 `actionGateway` 하나 | 한 곳에서 빼거나 바꿈 → `DmeBpmnActionTest`·`MdmOasisActionVocabularyTest` |
| I18 | **메뉴**: leaf `ruleSetMng`("룰 세트", seq 004, fullSeq 5050400)·`ruleSetEdit`("룰 세트 편집", 005, 5050500), 부모 `dme`, componentPath `dme/ruleSetMng`·`dme/ruleSetEdit`, OBJECT 마다 SYSADMIN PERM_ALL + `seedMdmObjectRbac(id,"dme")`. 새 메서드 `seedMdmRuleSetMenus()` 에 둔다. 기존 메뉴는 고치지 않는다 | 부모·이름 오기 → e2e M1·E1 |
| I19 | **담당자 역할 판단은 `RuleStewardCheck` 한 곳**(쓰기 네 action 과 등록에서 `requireSteward()`, view 의 `editable`·`restorable` 에서 `isSteward()`). dme/ruleSet* 코드에 `MdmRoles.STEWARD` 를 쓰지 않는다 | 역할 검사 삭제 → `RuleSetEditServiceTest`·`RuleSetMngServiceTest` MDM013 / grep 0건(§3.5) |
| I20 | **서비스 클래스에 `@Transactional` 금지(`TransactionTemplate`), 리포지토리 메서드 선언 금지, 마이그레이션 없음** | `@Transactional` 추가 → oasis-contract-check·`DmeOasisHttpTest` / 리포지토리 메서드 → `_06_리포지토리는_메서드를_선언하지_않는다` |
| I21 | **화면 즉시 계산**: 목록이 바뀔 때마다(▲·▼·✕·드래그·룰 추가·지침 적용) `set-model.ts` 의 `setIo`·`setDeps`·`setChecks` 로 다시 계산하고, 이때 서버를 부르지 않는다. 화면 검사 결과는 저장 버튼을 막지 않는다(서버가 판정한다, D9) | 재계산 누락·서버 호출 → `rule-set-edit-page.test.ts` |
| I22 | **화면 간 이동**: ruleSetMng 등록 성공·목록 ID 링크 → `openMdmPage("dme/ruleSetEdit", {setId})`. ruleSetEdit 는 `useMdmPageParams("dme/ruleSetEdit", tabId, …)` 로 받아 그 세트를 연다(dirty 면 확인). 룰 링크 → `openRuleEdit(ruleId)` | 경로·키 오기 → 두 페이지 테스트·e2e M3·E10 |
| I23 | **배포하지 않는다**: 저장·폐기·되살리기는 `TB_MDM_RULE_SET` 한 행만 바꾼다(배포 스냅샷·배포 목록·알림 없음, D11) | 다른 테이블 쓰기 추가 → `RuleSetEditServiceTest`(행 수 단언) |
| I24 | **08-02·08-03 산출물 불변**: §2.5 의 파일을 고치지 않는다(추가만 허용된 `RuleQueries`·`DmeTestSupport`·테스트 세 파일 제외). 기존 e2e `mdm-ruleEdit.spec.ts` 의 `LS_E2E` 기대가 그대로 성립한다(새 픽스처는 ruleEdit 룰을 담은 세트를 넣지 않는다) | `/usr/bin/git diff --stat f59cce7 -- <§2.5 파일>` 이 비어야 한다(B8 이 확인), 기존 e2e 스위트 |

---

## 6. 상세 설계

### 6.1 룰 하나의 입출력 — `RuleIoReader.read(ruleIds)`

1. `ruleRepository.findAllById(ids)` 로 룰을 읽고, 없는 ID 는 `RuleIo(id, null, null, null, exists=false, null, null, [], [])`.
2. `queries.latestReleasedVers(찾은 ID)` 로 버전을 고른다(I7). RELEASED 가 없으면 `releasedVer=null`·빈 목록(룰명·종류·상태는 싣는다).
3. 있으면 `vars = queries.vars(id, ver)`, `rows = queries.rows(id, ver)`, `hitPolicy` 는 그 버전의 `HIT_POLICY`.
4. `resNames` = 결과 열마다 `resName(v) = notBlank(resGrp) ? resGrp : varName`(첫 등장 순, 빈 값 제외). results = 이 목록.
5. conds 수집(`add(n)`: `ReservedNames.CONSTANTS` 에 대문자가 있으면 버림, 대문자 기준 `resNames` 에 있으면 버림, 대문자 기준 이미 있으면 버림):
   - 조건 열(seq 순) 가운데 `DISP_TYPE != 'Expression'`: `VAR_AST` 가 있으면 그 AST 의 이름들, 없으면 `VAR_NAME`.
   - 결과 열(seq 순) 가운데 `GRP_COND_AST` 가 있는 것: 그 AST 의 이름들.
   - 행(`rows` 순서) × 열(`vars` 순서) 가운데 `DISP_TYPE = 'Expression'` 인 열의 셀(`RuleCellsCodec.parse(row.cells).get(String.valueOf(varId))`)에 `ast` 가 있으면 그 이름들.
   - AST 이름 = `type = "VARIABLE_OR_CONSTANT"` 인 노드의 `value`, `params` 를 재귀로 훑는다(`RuleUsageFinder.collect` 와 같은 순회에 상수 필터를 더한 것 — 복사하지 말고 `RuleIoReader` 안의 private 메서드로 새로 쓴다).
6. cond 마다 출처·타입(I6): DICT 면 그 이름의 합성 변수(`new MdmRuleVar(id, ver, -k, "COND", k)` + `setVarName(name)`)를, PROG 면 그 선언 열을, 결과마다 그 결과 열(그룹이면 그 그룹의 첫 열)을
   **한 번의** `resolver.resolve(id, ver, 목록)` 호출로 해석해 `dataType·scale·dateString·maruCodeId·label` 을 채운다. NONE 은 타입 null·표시명 null.
7. `producersOfActiveRules()`: `queries.latestReleasedResultVarsOfActiveRules()` 의 각 결과 열 `resName` → 룰 ID 목록(룰 ID 순, 중복 없음).

### 6.2 세트 입출력 표·의존 룰 — `io`·`deps` (Java·TS 같은 알고리즘, 시안 H:2139-2152·2234-2238)

```
io(ids, rules):
  ins = 순서 있는 맵, res = 순서 있는 맵
  for id in ids:
    r = rules[id]  (없거나 exists=false 면 conds·results 빈 것으로 본다)
    for c in r.conds:
      if res has c.name: res[c.name].readers += id ; continue
      if ins lacks c.name: ins[c.name] = {name, label, dataType, scale, dateString, maruCodeId, source} (이 c 의 값)
      ins[c.name].users += id
    for x in r.results:
      if res lacks x.name: res[x.name] = {name, dataType, …, by: [], readers: []}  (처음 만든 룰의 타입)
      res[x.name].by += id
deps(ids, rules):
  deps[id] = [ j in ids | j != id and rules[j].results 에 id 의 (source != DICT) cond 이름이 있다 ] (ids 순, 중복 없음)
```

### 6.3 저장 시 검사 — `checks` (Java·TS 같은 알고리즘, 시안 H:2215-2233 + D5·D6)

```
out = []
for id in ids:                                   # 1단계 — 존재·상태
  r = rules[id]
  if r is null or !r.exists:        REJECT RULE_NOT_FOUND  "{id}는 없는 룰이다"
  elif r.status == "DEPRECATED":    REJECT RULE_DEPRECATED "{id}는 DEPRECATED다"
  elif r.releasedVer is null:       WARN   NO_RELEASED     "{id}는 RELEASED 버전이 없어 입출력을 계산하지 않았다. 이대로 부르면 판정 오류다"
if ids 가 비었다:                   REJECT EMPTY           "룰이 하나도 없다"
d = deps(ids, rules); produced = {}; prodBy = {}
for i, id in ids:                                # 2단계 — 순서·순환·출처
  for c in rules[id].conds:
    if c.source == DICT or produced has c.name: continue
    later = [ j in ids | index(j) > i, j != id, rules[j].results 에 c.name ]
    if later 가 있다:
      cyc = later 가운데 처음으로 (reaches(j, id, d) 또는 rules[id].results ∩ rules[j].conds 이름이 겹침) 인 j
      if cyc: REJECT CYCLE ruleId=id other=cyc var=c.name "{id}와 {cyc}가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다"
      else:   REJECT ORDER ruleId=id other=later[0] var=c.name "{id}가 뒤에 도는 {later 를 ', ' 로 이음}의 결과 변수 {c.name}를 읽는다. {later[0]}를 {id} 앞으로 옮긴다"
      continue
    if c.source != PROG: REJECT UNKNOWN_INPUT ruleId=id var=c.name "{id}의 조건 변수 {c.name}는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다"
  for x in rules[id].results:
    if prodBy has x.name: WARN DUP_RESULT ruleId=id other=prodBy[x.name] var=x.name "{prodBy[x.name]}와 {id}가 같은 결과 변수 {x.name}에 대입한다"
    prodBy[x.name] = id; produced += x.name
reaches(j, id, d): d 를 간선 (a → d[a] 의 각 원소)으로 보고 j 에서 출발해 id 에 닿는가(방문 집합으로 무한 루프 방지, j 자신은 시작점)
```

- 한 check 의 필드: `code, severity, ruleId, otherRuleId, varName, message`(없는 칸은 null). 1단계의 otherRuleId·varName 은 null. EMPTY 는 ruleId 도 null.
- 조사(가/와/는/를)는 받침과 무관하게 위 문구 그대로 쓴다(시안 문구, 두 구현이 같아야 한다).
- 화면 표시 이름: REJECT = "거부"(붉은 배지), WARN = "경고"(노란 배지).

### 6.4 구성 지침 — `RuleSetGuide.suggest(target, producers, io)` (시안 H:2240-2259 + D7)

```
first = producers(target); if empty → error "결과 변수 {target}를 만드는 룰이 없다"
pick = 순서 있는 집합, amb = [], need = [target]      # need 는 큐
while need:
  x = need.shift()
  ps = producers(x)
  if ps is empty:
    if x == target: (위에서 처리) ; else error "{x}를 만드는 룰이 없다"
  if ps.size > 1 and amb 에 x 없음: amb += {varName: x, ruleIds: ps}
  id = ps[0]; if pick has id: continue; pick += id
  for c in io(id).conds: if c.source == NONE: need.push(c.name)      # DICT·PROG 는 거슬러 찾지 않는다
order = []; state = {}
dep(id) = [ io(id).conds 가운데 source == NONE 인 c 마다, pick 가운데 io(j).results 에 c.name 이 있는 첫 j ] (null 빼고)
visit(id): state 2 면 끝; state 1 이면 cyc = id, 끝; state[id]=1; dep(id) 마다 visit; state[id]=2; order += id
pick 순서대로 visit
cyc 가 있으면 error "순환이 있다({cyc}). 룰 A의 조건이 B의 결과이고 B의 조건이 A의 결과인 경우다"
결과 {order, amb, error}
```

- `producers` 는 `RuleIoReader.producersOfActiveRules()` 맵 조회(룰 ID 순). `io` 는 필요한 룰만 `RuleIoReader.read` 로 읽어 캐시한다.
- 오류가 나면 `order`·`ambiguous` 는 빈 목록이다. 서비스 응답의 `rules` 는 `order` 룰의 IO(화면이 목록 적용 뒤 바로 다시 계산하려고).

### 6.5 응답 모양 (JSON 필드 이름 = 레코드 컴포넌트 이름)

- `RuleIo`: `{ruleId, ruleName, ruleKind, status, exists, releasedVer, hitPolicy, conds:[{name, source, label, dataType, scale, dateString, maruCodeId}], results:[{name, source(null), label, dataType, scale, dateString, maruCodeId}]}`
- `RuleSetCheck`: `{code, severity, ruleId, otherRuleId, varName, message}`
- `RuleSetViewResult`: `{set:{setId, setName, description, status, rowVersion, ruleIds[]}, rules:[RuleIo…](ruleIds 순, 중복 없음), checks:[…](저장된 목록 기준), editable(= isSteward && INUSE), restorable(= isSteward && DEPRECATED)}`
- `RuleSetSaveResult`: `{setId, rowVersion(새 값), checks:[WARN…]}`; `RuleSetStatusResult`: `{setId, status, rowVersion, checks}`
- 오류는 OASIS 공통(`meta.success=false`, `meta.message`). FE 는 `isRowVersionConflict(e)`(MDM001)면 "다른 창에서 바뀌었습니다. 다시 불러오세요" + 다시 불러오기 버튼, 그 밖은 `meta.message` 를 그대로 보인다.

### 6.6 ruleSetEdit 서비스 규칙

1. **search**: target `SET`(기본) — `queries.allSets()` 에서 ID 대문자 포함 또는 세트명 포함, ID 순 20건. `RULE` — `queries.searchPrefix(keyword, 20)` 룰마다 `RuleIoReader.read`. `GUIDE` — `resultVar` 필수(REQUIRED_VALUE), §6.4.
2. **view**: `setId` 필수, 없으면 `BusinessException(ErrorCode.INVALID_VALUE, "룰 세트를 찾을 수 없습니다: " + id)`. `ruleIds = DomainJson.readList(RULE_IDS)` 를 문자열로, `RuleIoReader.read(ruleIds)`, `checks = RuleSetAnalyzer.checks(ruleIds, io)`.
3. **save**: I13 요청 검사 → `requireSteward()` → `ids = rules 의 ruleId`(grids.rules.rows 순서) → `io = read(ids)` → `checks` → REJECT 있으면 `RuleSetRejections.saveRejected(rejects)` → `TransactionTemplate` { `writes.update(setId, name, DomainJson.write(ids), desc, rv)` → 0 이면 §I12 분류 } → 새 rv = 요청 rv + 1, 응답 checks = WARN 들.
4. **delete(폐기)**: `setId`·`rowVersion` 필수 → `requireSteward()` → tx { `writes.deprecate(setId, rv)` → 0 이면 분류(없음 / 이미 DEPRECATED MDM009 / MDM001) }.
5. **restore(되살리기)**: 필수 값 → `requireSteward()` → tx { 세트 읽기(없음·INUSE 면 MDM009) → rv 다르면 MDM001 → 저장된 목록으로 검사 → REJECT 있으면 MDM024 → `writes.restore(setId, rv)` → 0 이면 분류 }.
6. `RuleSetWrites` SQL(감사 조각은 `RuleNativeWrites` 와 같다, `VER = COALESCE(VER,0)+1`):
   - update: `UPDATE TB_MDM_RULE_SET SET MARU_RULE_SET_NAME=:name, RULE_IDS=:ids, DESCRIPTION=:desc, ROW_VERSION=ROW_VERSION+1, <감사> WHERE MARU_RULE_SET_ID=:id AND ROW_VERSION=:rv AND STATUS='INUSE'`
   - deprecate: `… SET STATUS='DEPRECATED', ROW_VERSION=ROW_VERSION+1, <감사> WHERE … AND ROW_VERSION=:rv AND STATUS='INUSE'`
   - restore: `… SET STATUS='INUSE', ROW_VERSION=ROW_VERSION+1, <감사> WHERE … AND ROW_VERSION=:rv AND STATUS='DEPRECATED'`
   - `DESCRIPTION` null 바인딩은 `q.setParameter("desc", desc, String.class)`(타입 지정, `RuleNativeWrites.updateHitPolicy` 선례). 설명 빈 문자열은 null 로 저장한다.

### 6.7 ruleSetMng 서비스 규칙

1. **search**: `queries.allSets()` 전부(작다, F4)를 메모리에서 거른다 — 세트(ID 대문자 포함 또는 세트명 포함) / 담은 룰(멤버 룰 ID 가운데 대문자 포함이 하나라도) / 결과 변수(대문자 정확 일치 — 멤버 룰의 IO results 에 있으면, 중간 포함) / 상태(같음).
   IO 는 걸러야 할 세트의 멤버 룰 전체를 **한 번의** `RuleIoReader.read` 로 읽는다. ID 순 정렬 → `page`(0부터)·`size`(기본 20, 1~100 밖이면 20/100 으로 자름) 로 자른다. `totalCount` = 거른 전체.
   행 계산: `ruleCount` = 목록 길이, `finalResults` = `io(...).results` 가운데 최종 이름(표 순서), `inputCount` = inputs 수, `rejectCount`·`warnCount` = checks 수(DEPRECATED 세트는 둘 다 0).
2. **register**: `RuleSetIdRules.validate(id)` → 세트명 필수·100자 이하 → `requireSteward()` → `existsById` 면 `DUPLICATE_DATA`("이미 있는 룰 세트 ID 입니다: " + id) → tx { `new MdmRuleSet(id, name, "[]")` + `setDescription(빈 문자열이면 null)` 저장 } → `{setId, rowVersion: 0}`.

### 6.8 코퍼스 형식 (`BLR/common/rule/rule-set-corpus.json`)

```json
{ "version": 1,
  "cases": [
    { "name": "순환 — 두 룰",
      "ids": ["E2S_CYA", "E2S_CYB"],
      "rules": { "E2S_CYA": { "exists": true, "status": "INUSE", "releasedVer": 1,
                              "conds": [{"name": "S_CYB", "source": "NONE"}], "results": [{"name": "S_CYA"}] }, … },
      "expect": { "io": { "inputs": [{"name": "S_CYB", "source": "NONE", "users": ["E2S_CYA"]}],
                          "results": [{"name": "S_CYA", "by": ["E2S_CYA"], "readers": ["E2S_CYB"]}, …] },
                  "deps": { "E2S_CYA": ["E2S_CYB"], "E2S_CYB": ["E2S_CYA"] },
                  "checks": [{"code": "CYCLE", "severity": "REJECT", "ruleId": "E2S_CYA", "otherRuleId": "E2S_CYB", "varName": "S_CYB",
                              "message": "E2S_CYA와 E2S_CYB가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다"}] } } ] }
```

- `rules` 원소는 `RuleIo` 에서 계산에 쓰는 칸만(`exists, status, releasedVer, conds[name, source], results[name]`) 적고, 러너가 나머지를 null·false 로 채운다. `rules` 에 키가 없는 ID 는 "없는 룰" 사례다.
- 비교: `io.inputs` 는 `name·source·users`, `io.results` 는 `name·by·readers`, `deps` 전체, `checks` 는 여섯 칸 전부. 순서까지 같아야 한다.

### 6.9 ruleSetEdit 화면 (시안 H:309-336 대응)

- `MdmPageLayout group="dme" screenId="ruleSetEdit" title="룰 세트 편집"`. 상단 바(`data-testid="set-edit-topbar"`): 세트 고르기 `Input`(`set-pick-keyword`) + "찾기" → 후보 버튼(`set-pick-{setId}`),
  현재 세트 표시(`set-edit-current`). 세트를 고르기 전에는 빈 상태 문구 "세트를 골라 편집한다. 새 세트는 룰 세트 화면에서 등록한다".
- 16칸 그리드: 룰 세트 카드(span 10), 세트 구성 지침 카드(span 6).
- **룰 세트 카드**
  - 머리: 세트 ID, 상태 배지(`set-status`, `badgeStyle`), `row_version N`, 배지 "버전·승인 없음", 안내 "저장하면 바로 반영된다. 배포(스냅샷 발행)는 보류다".
  - 세트명(`set-name`)·설명(`set-desc`) 입력.
  - 룰 목록 그리드(`set-rules-grid`, `AgDataGrid`): 열 = 순서(`seqNo`, 드래그 손잡이) · 룰 ID(링크 `set-rule-link-{id}`) · 룰명(없으면 "(없음)") · 종류·정책(`DECISION · FIRST` / `DERIVE`) · 조건 변수(칩) · 결과 변수(칩) ·
    의존 룰(링크 + `뒤에 있음` 배지 `set-dep-later-{id}-{dep}`, 없으면 "없음") · 동작(▲ `set-rule-up-{id}`, ▼ `set-rule-down-{id}`, ✕ `set-rule-remove-{id}`). 빈 목록 문구
    "룰이 없다. 아래에서 룰을 더하거나 오른쪽 지침으로 순서를 받는다". 조건 변수 칩: DICT 거나 (앞에서 아직 안 만들어졌고 PROG) 면 보통 칩, 그 밖은 붉은 칩이고 앞에서 만들어지지
    않은 것에는 "앞에 없음" 배지(시안 H:2196 `condMarks`). `editable=false` 거나 DEPRECATED 면 드래그·▲▼✕ 가 없다.
  - 룰 추가: `Input`(`set-rule-add-keyword`) + "찾기"(`set-rule-add-find`) → 후보(`set-rule-cand-{id}`, 룰명·상태) 클릭으로 목록 끝에 더한다(IO 는 후보 응답의 것). 이미 있으면 "이미 담은 룰이다".
  - 검사 목록(`set-checks`): 즉시 계산 결과. 없으면 "통과" 배지, 있으면 줄마다 배지(거부/경고)+문구(`set-check-{index}`).
  - 입출력 표(`SetIoTables`): 제목 "세트 입출력 — 룰 순서에서 계산한다. 저장하지 않는다". 입력 변수 표(`set-io-inputs`) 열 변수·표시명·타입·출처(배지 "컬럼 사전"/"프로그램 변수"/"어디에도 없음")·읽는 룰,
    머리 "입력 변수 N개 · 세트를 부를 때 레코드에 넣어야 하는 값". 결과 변수 표(`set-io-results`) 열 변수·타입·구분(최종/중간)·만드는 룰(둘 이상이면 "덮어씀" 배지)·읽는 룰, 최종 먼저 그다음 중간,
    머리 "결과 변수 N개 · 최종 a개, 중간 b개". 표 아래 시안 H:2164 설명 문장. 타입 표시: NUMBER 는 `Number(scale 또는 -)`, 일자 String 은 "일자 String", 코드 도메인은 "코드 String", 그 밖은 dataType, 없으면 "-".
  - 버튼: 세트 저장(`set-save`, dirty && editable && canDo("save") 일 때만), 폐기(`set-deprecate`, INUSE·editable·canDo("delete")) → 경고 문구(`set-message`) "폐기하면 이 세트를 부르는 호출은 판정 오류가 난다." 와
    "폐기 확인"(`set-deprecate-confirm`)·"취소", 되살리기(`set-restore`, DEPRECATED·restorable·canDo("restore")).
  - 메시지(`set-message`): 저장 성공 "저장 · row_version N" + 경고 목록, 거부는 서버 `meta.message`, 폐기 "폐기 · row_version N. 행은 남기고 되살릴 수 있다", 되살림 "되살림 · row_version N".
  - 안내(시안 H:325): "행을 끌어서 순서를 바꾼다(▲▼도 된다). 폐기한 세트는 고칠 수 없고 되살리기만 한다. 세트 안의 룰은 각자 평가 시각에 유효한 RELEASED 버전으로 돈다. 붉은 조건 변수는 컬럼 사전에 없는 것으로, 앞 룰의 결과 변수여야 한다."
- **세트 구성 지침 카드**: 설명(시안 H:329), 결과 변수 입력(`set-guide-var`) + "찾기"(`set-guide-run`) → 오류(`set-guide-error`) 또는 제안(`set-guide-order`: "제안 순서 · 1. A → 2. B …",
  고르기 배지 "한 결과 변수를 만드는 룰이 둘 이상이다: x: a, b") + "이 순서를 목록에 적용"(`set-guide-apply`, editable·canDo("save")) + "의존이 없는 룰끼리의 순서는 사용자가 정한다".
  적용하면 목록을 제안 순서로 바꾸고 응답 `rules` 의 IO 를 맵에 더한다(dirty).
- 세트 값 테스트 카드는 두지 않는다(D2).

### 6.10 변수·룰 링크 (06:756)

- 룰 ID → `openRuleEdit(ruleId)`.
- 변수: 출처 DICT(입력 변수 표·조건 칩) → `openMdmPage("dma/columnMng")`(파라미터 없음, D13). 결과 변수·앞 룰이 만든 조건 변수 → 그 이름을 만드는 첫 룰(목록 순)의 `openRuleEdit`. PROG·NONE → 링크 없음(title "컬럼 사전 밖 이름이라 갈 곳이 없다").

### 6.11 ruleSetMng 화면 (시안 H:281-307 대응)

- `MdmPageLayout group="dme" screenId="ruleSetMng" title="룰 세트" buttons=[조회]`.
- 조회 조건: 세트(`set-search-keyword`, "ID 또는 세트명"), 담은 룰(`set-search-rule`, "룰 ID"), 결과 변수(`set-search-var`, "예: LINE_SPD"), 상태(`set-search-status`, 전체/INUSE/DEPRECATED).
- 목록(`AgDataGrid`, `rowKey="setId"`): 세트 ID(링크 → 편집) · 세트명 · 룰 수 · 최종 결과 변수(코드 칩, 없으면 "-") · 입력 변수 수 · 설명 · 세트 검사(DEPRECATED 면 "-", 거부 있으면 "거부 N", 아니면 "통과"; 경고가 있으면 뒤에 "경고 N") · 상태(배지).
  `Pagination`(size 20). 빈 상태 문구 "조건에 맞는 룰 세트가 없다". 목록 아래 설명(시안 H:295).
- 등록 패널(`ContentPanel width={380}`, `data-testid="set-register-form"`): 세트 ID(`set-reg-id`, 즉시 규칙 표시 `set-reg-id-error`, 설명 "컬럼 물리명 규칙을 따르는 전역 이름"), 세트명(`set-reg-name`), 설명(`set-reg-desc`),
  안내 "TB_MDM_RULE_SET 한 행(INUSE, 룰 없음)을 만들고 세트 편집으로 간다. 룰은 편집 화면에서 담는다.", 저장(`set-reg-save`, ID 규칙·세트명 통과 && canDo("reg")). 성공 → 목록 다시 조회 + `openMdmPage("dme/ruleSetEdit", {setId})`.

### 6.12 OASIS action 표

| serviceId | action(RBAC 키) | method | 권한 세트 | 하는 일 |
|---|---|---|---|---|
| ruleSetMng | `search` | `search` | READ | 세트 목록(계산 칸 포함) 페이징 |
| ruleSetMng | `reg` | `register` | EDIT | 빈 세트 등록(INUSE) |
| ruleSetEdit | `search` | `search` | READ | target SET(세트 고르기)·RULE(룰 추가 후보 + IO)·GUIDE(구성 지침) |
| ruleSetEdit | `view` | `view` | READ | 세트·멤버 IO·검사·editable·restorable |
| ruleSetEdit | `save` | `save` | EDIT | 세트명·설명·룰 목록 저장(검사 통과 시) |
| ruleSetEdit | `delete` | `delete` | EDIT | 폐기(INUSE → DEPRECATED) |
| ruleSetEdit | `restore` | `restore` | EDIT | 되살리기(검사 통과 시 DEPRECATED → INUSE) |

---

## 코드베이스 지식·함정 (Build 가 그대로 따른다)

- **OASIS 서비스 형식**: `@Service("<빈 이름>")`, 메서드는 DTO 하나를 받고 결과 DTO 를 돌려준다. BPMN serviceTask 는 `camunda:class="<빈 이름>"` + properties `method`·`output=result`·`dto=<FQCN>`, `grid` 속성 금지.
  BPMN 안 예외는 HTTP 200 + `meta.success=false`, 화면에는 `meta.message` 만 온다(그래서 MDM024 의 message 에 상세를 붙인다).
- **grids 바인딩**: `grids.rules.rows` 의 원소는 `Map<String,Object>` 로 오고 숫자는 `Double` 이다. 룰 ID 는 `String.valueOf(map.get("ruleId"))` 로 읽고 null·빈 값은 요청 오류로 거부한다.
- **`@Transactional` 금지**, `TransactionTemplate`(`PlatformTransactionManager` 주입). 네이티브 UPDATE 는 영속성 컨텍스트를 갱신하지 않으므로 같은 트랜잭션에서 세트 엔티티를 이미 읽었다면
  0행 분류 때 `entityManager.refresh` 하거나 `JdbcTemplate`/네이티브 SELECT 로 다시 읽는다.
- **엔티티 INSERT**: 등록은 JPA `save` 라 `CactusAuditEntity` 가 감사 칼럼을 채운다. `rowVersion` 은 생성자 0. `RULE_IDS` 는 반드시 JSON(`"[]"`) — CHECK 가 있다.
- **U_AT 9시간 차이(TSK-08-01 D6)**: 네이티브로 쓴 행의 `getUpdatedAt()` 은 +9시간으로 읽힌다. 화면에 수정 시각을 보이지 않는다.
- **FE import**: 화면은 `@dk-oasis/shared/{layout,grid,form,http}`, `@/shell`, `@/dme/rule-handoff`, `@/dme/oasis-call` 만. `@mantine/*`·`ag-grid-react` 직접 import 금지(audit). 화면 CSS 에 색 값 직접 금지 — 배지는 `badgeStyle`.
- **FE null 제거**: `callOasis` 가 `omitNullish(params)` 로 null·undefined 를 뺀다. 빈 설명은 보내지 않는다.
- **page-registry**: 폴더 이름이 `Pop`·`Popup` 으로 끝나면 팝업으로 본다 — 해당 없음. 레지스트리는 스크립트로만 만든다.
- **Vitest**: `pnpm build:libs` 를 먼저 돌리지 않으면 m-mdm 테스트 일부가 실패한다. 코퍼스 경로는 `engine-paths.ts` 상수만 쓴다.
- **e2e 스크린샷 덮어쓰기**: `mdm-shell-rbac-smoke.spec.ts` 가 TSK-01-03 스크린샷을 덮어쓴다 — E2E 절차 8) 로 되돌린다. 이 Task 폴더의 png 만 stage 한다.
- **결정 기록**: 이 Task 는 공용 `docs/mdm/decisions.md` 에 쓰지 않는다. 결정은 아래 「담당자 확인 필요 결정」 에만 둔다. 공용 기록이 필요해지면 dev-discipline 「공용 결정 기록(decisions.md)의 번호」 대로
  임시 ID `D-TSK-08-06-1` 부터 쓴다.
- **겪은 문제는 `.issues` 에 직접 쓰지 않고 Phase 보고에 올린다.** 구현 중 기록(설계 이탈·변이 검증 기록·인계)은 이 파일이 아니라 `build-log.md` 에 쓴다.

---

## E2E 서버 절차

TSK-08-02 「E2E 서버 절차」 를 이 워크트리·이 작업 값으로 옮긴다. `be-run.sh`·`fe-run.sh` 는 쓰지 않는다. 포트는 예시이고 실행 시점에 비어 있는 번호로 다시 고른다.
서버를 띄우기 **직전에** 슬롯을 잡고, 끝나면 성공·실패와 상관없이 자기 PID·자기 포트만 거둔 뒤 슬롯을 푼다.

```bash
W=/Users/jji/project/dmes-standard/.claude/worktrees/dflow-5999efc9
SP=<Build/Verify 실행자의 scratchpad>
J=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
# 0) 빈 포트 — 셋 다 LISTEN 이 없어야 한다(예: mcm BE 18213, mdm BE 18306, FE 15213). 있으면 다른 번호
lsof -iTCP:18213 -sTCP:LISTEN; lsof -iTCP:18306 -sTCP:LISTEN; lsof -iTCP:15213 -sTCP:LISTEN
# 1) 슬롯 — HEAVY_ACQUIRED 를 확인한다(HEAVY_BUSY 면 같은 명령을 다시 부른다)
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh acquire e2e-TSK-08-06
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
# 5) 기동 완료 뒤 시드 대조·사용자·세트 픽스처(mdm 은 Flyway 적용 로그 뒤). mdm-ruleSet-data.sql 은 자체 완결이라 다른 픽스처에 기대지 않는다.
#    회귀로 룰 스펙까지 함께 돌리려면 mdm-ruleEdit-users.sql(mcm.db)·mdm-ruleEdit-data.sql(mdm.db)도 넣는다(ID 가 겹치지 않는다).
cd $W/src/frontend && sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-seed-check.sql | diff - e2e/fixtures/mdm-rbac-seed-check.expected.txt   # 출력 없음 = 통과
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-users.sql
sqlite3 $W/src/backend/data/mdm.db < e2e/fixtures/mdm-ruleSet-data.sql
# 6) 포털 — libs 먼저, 레지스트리는 커밋된 것
cd $W/src/frontend && pnpm build:libs
cd $W/src/frontend/m-mcm && AUTH_SECRET=$(openssl rand -hex 32) NEXTAUTH_URL=http://127.0.0.1:15213 OIDC_ISSUER=http://127.0.0.1:15213 \
  MCM_WAS_URL=http://127.0.0.1:18213 MDM_WAS_URL=http://127.0.0.1:18306 BACKEND_API_URL=http://127.0.0.1:18213 \
  BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026 pnpm exec next dev --turbopack --port 15213 > $SP/fe.log 2>&1 &
FE_PID=$!
# 7) 스모크 — 반드시 자기 포털. --workers=1(병렬 로그인은 mcm SQLite 를 SQLITE_BUSY 로 떨어뜨린다)
cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15213 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  $W/.claude/skills/dflow-dev/scripts/heavy.sh pnpm exec playwright test e2e/mdm-shell-rbac-smoke.spec.ts e2e/mdm-ruleSetMng.spec.ts e2e/mdm-ruleSetEdit.spec.ts --workers=1
# 8) 다른 Task 스크린샷 복원 — mdm-shell-rbac-smoke 가 TSK-01-03 스크린샷을 덮어쓴다
cd $W && /usr/bin/git checkout -- docs/mdm/tasks/TSK-01-03/screens/
cd $W && /usr/bin/git status --porcelain docs/mdm/tasks/   # TSK-08-06/screens/*.png 와 이 Task 파일만 남아야 한다
# 9) 정리 — 자기 PID 먼저, 남은 자식은 자기 포트로. 전역 gradlew --stop·pkill·killall·pgrep -f 종료 금지
kill $FE_PID $BE_MDM_PID $BE_MCM_PID
lsof -tiTCP:15213 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18306 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18213 -sTCP:LISTEN | xargs -r kill
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh release
```

- 통과 기준: 세 스펙 passed, skipped·failed 0, 시드 대조 diff 출력 없음.
- 함정: 픽스처는 한 번만 넣는다(스펙이 데이터를 바꾸므로 다시 돌리려면 1)부터). 룰 세트 편집 탭은 등록(M3)·링크로도 열리므로, 탭이 이미 열린 상태에서 메뉴를 다시 누르면 새 탭이 아니라
  그 탭이 활성화된다 — 스펙은 각 테스트 시작에서 새로 로그인한다(`mdm-ruleMng.spec.ts` 선례).

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 도커 금지로 생략: cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain
- 이 Task 는 마이그레이션과 mssqlTest 를 만들지 않는다. 새 네이티브 SQL(`RuleSetWrites` 의 조건부 UPDATE 세 개)은 방언 전용 구문(RETURNING·OUTPUT·json 함수)을 쓰지 않는
  표준 UPDATE 이고, `RULE_IDS` 는 `DomainJson.write` 가 만든 JSON 이라 MSSQL `ISJSON` CHECK 도 통과해야 한다 — 이 두 가지는 머지 뒤 팀장 방언 검증(`dialect_check`)에서 한 번 확인된다.
  이 생략 때문에 확인하지 못하는 수용 기준은 없다(수용 기준 5건은 모두 SQLite·Vitest·e2e 로 확인한다).

## 담당자 확인 필요 결정

근거의 강약: spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물.

### D1 — 화면 그룹 코드: `mdr` 인가 `dme` 인가
- **질문**: spec entry-point 는 `mdr/ruleSetMng`·`mdr/ruleSetEdit` 인데 TRD·screens README·wbs 는 `dme` 다.
- **선택지**: (a) `dme` / (b) `mdr`
- **택한 것**: (a). 화면 그룹 정본(`docs/mdm/screens/README.md`)과 wbs 가 `dme` 이고 메뉴 폴더·권한 매트릭스·FE 셸이 `dme` 만 안다. 08-02 가 같은 판단을 했다(D1).

### D2 — 세트 값 테스트 카드를 이 Task 에 넣나
- **질문**: 06:756 은 "세트 값 테스트 카드(입력은 세트의 입력 변수, 룰마다 적중 행과 중간 결과)"를 두라고 했지만 시안에 없다. spec 제약은 "화면 설계 산출물에서 포함 여부 확정".
- **선택지**: (a) 이번 범위에서 빼고 후속으로 넘긴다 / (b) 넣는다 — 운영 DB 를 읽는 엔진 `DefinitionLookup` 구현과 세트 평가 API 를 새로 만든다
- **택한 것**: (a). 엔진 세트 평가(`MdmRuleEngine.evaluateSet`)는 있으나 운영 DB 를 읽는 `DefinitionLookup` 구현이 리포에 없고(`BL/common/engine/MdmEngineConfig.java:35-50` 의 `EMPTY_DEFINITIONS` 는 세트·룰 조회가 늘 빈 값이다), 룰 값 테스트(TSK-08-04, ready)가 같은
  조회기를 만들 자리다. 여기서 먼저 만들면 08-04 와 겹친다. 수용 기준에 값 테스트가 없다. 후속 조건: 08-04 의 조회기가 머지되면 `ruleSetEdit` 에 카드 하나(`view` 옆 `execute` action)로 더한다.
  이 결정은 B8 이 `ruleSetEdit_기능설계서.md` §11 에 옮겨 적는다.

### D3 — "지금 RELEASED" 를 어떤 버전으로 보나
- **질문**: 06:754 는 "지금 RELEASED인 버전", 06:1112 는 "최신 RELEASED 버전"이다. 적용 시작이 미래인 RELEASED 가 있을 때 갈린다.
- **선택지**: (a) RELEASED 가운데 VER 최대(`RuleQueries.latestReleasedVers`) / (b) 지금 시각에 적용 중인 RELEASED
- **택한 것**: (a). 08-02 활용처 카드·변수 타입 해석이 이미 (a) 를 쓰므로 두 화면의 의존 계산이 같은 버전을 본다. 미래 버전은 곧 적용될 정의라 세트 검사도 그것으로 보는 편이 앞으로의 판정 오류를 먼저 드러낸다.

### D4 — 룰 하나의 "읽는 이름"을 무엇으로 정의하나, 활용처 카드는 맞추나
- **질문**: 리포에 정의가 셋이다(F5 `RuleUsageFinder`, 시안 `inputVars`, TS `alwaysNames`). 세트 입출력의 입력 변수는 엔진이 세트 실행 전에 요구하는 키(F6)와 같아야 한다.
- **선택지**: (a) 엔진 기준(시안 `inputVars` + 결과 이름 = 엔진 slot 이름 + 상수 제외)으로 새 `RuleIoReader` 를 두고 `RuleUsageFinder` 는 그대로 / (b) (a) 에 더해 `RuleUsageFinder` 도 같은 정의로 옮긴다
- **택한 것**: (a). `RuleUsageFinder` 는 08-02 의 승인된 산출물이고 그 테스트가 지금 정의를 고정한다. 차이(자기 결과 이름·상수·`grp_cond_ast`) 때문에 드문 룰(식에 NULL·TRUE 를 쓰거나 결과 열 조건이
  있는 룰)에서 룰 화면 활용처 카드의 의존 룰이 세트 편집의 의존 룰과 다르게 보일 수 있다. 맞추는 일은 후속 과제로 남긴다(`RuleUsageFinder` 가 `RuleIoReader` 를 쓰게 바꾸면 된다).

### D5 — 저장 시 검사 넷 밖의 "RELEASED 없음"을 알리나
- **질문**: 06:1092 의 넷은 "룰이 있고 DEPRECATED 가 아님"만 본다. 등록만 하고 확정하지 않은 룰(RELEASED 없음)을 담으면 입출력이 비어 다른 검사가 조용히 통과하고, 세트를 부르면 판정 오류다.
- **선택지**: (a) 경고(`NO_RELEASED`, 저장은 된다) / (b) 거부 / (c) 알리지 않는다(시안 그대로)
- **택한 것**: (a). 확정 전 룰로 세트를 미리 짜는 흐름을 막지 않으면서 사용자가 빈 입출력의 이유를 알게 한다. 06 의 거부 조건을 늘리지 않는다.

### D6 — 순환을 두 룰 사이로만 보나
- **질문**: 06·시안은 "두 룰이 서로의 결과 변수를 읽으면 순환"이다. 세 룰 이상 고리는 시안 코드로는 "앞으로 옮긴다"(ORDER) 거부가 되어, 옮겨도 풀리지 않는 안내를 준다.
- **선택지**: (a) 이행적으로 본다(뒤 룰이 의존 그래프를 따라 이 룰에 닿으면 CYCLE) / (b) 시안 그대로 두 룰만
- **택한 것**: (a). 어느 쪽이든 저장은 거부되지만(수용 3), (a) 는 "순서를 바꿔서는 풀리지 않는다"는 옳은 안내를 준다. 두 룰 경우의 결과·문구는 시안과 같다.

### D7 — 구성 지침의 생산자 고르기
- **질문**: 한 결과 변수를 여러 룰이 만들 때 무엇을 고르고, DEPRECATED·RELEASED 없는 룰과 프로그램 변수는 어떻게 다루나.
- **선택지**: (a) 생산자 = DEPRECATED 아니고 RELEASED 있는 룰, 룰 ID 순 첫 룰, 여럿이면 "고르기"로 모두 보임, DICT·PROG 는 거슬러 찾지 않음 / (b) 시안 그대로(모든 룰, 프로그램 변수도 생산자를 찾다가 오류)
- **택한 것**: (a). DEPRECATED 룰을 제안하면 적용 뒤 저장이 곧바로 검사 ②에 걸린다. 프로그램 변수는 호출자가 넣는 입력이라 생산 룰이 없다. 사용자가 다른 생산자를 원하면 적용 뒤 목록에서 바꾼다(06:1122 "화면이 모두 보이고 사용자가 고른다").

### D8 — 저장 거부를 어떻게 돌려주나
- **질문**: 거부를 정상 응답(`saved=false`)으로 줄지 오류로 줄지.
- **선택지**: (a) 새 오류 코드 `MDM024 RULE_SET_SAVE_REJECTED`(400) + 상세 message(`MasterCodeRejections` 선례) / (b) 정상 응답에 거부 목록
- **택한 것**: (a). 도메인(MDM015)·코드(MDM022) 저장 검사가 같은 방식이다. 화면은 같은 검사를 이미 즉시 계산해 목록으로 보이므로 서버 메시지는 한 줄이면 된다. **병렬 Task(08-04·08-05, ready)도
  오류 코드를 더할 수 있어 `MDM024` 가 겹칠 수 있다** — 머지하는 쪽이 `CommonContractTest` 와 코드 값을 보고 다음 번호로 바꾼다(코드 값은 이 Task 의 BE·테스트·기능설계서에만 쓴다).

### D9 — 화면 즉시 검사가 저장을 막나
- **질문**: 화면이 즉시 계산한 거부가 있을 때 세트 저장 버튼을 막을지.
- **선택지**: (a) 막지 않는다 — 서버가 판정하고 거부 메시지를 보인다 / (b) 막는다
- **택한 것**: (a). 판정 권한은 서버 하나이고(I12), 코퍼스가 두 구현을 같게 고정한다. 사용자는 검사 목록으로 미리 알고, 눌러도 서버 거부로 같은 문장을 본다.

### D10 — 조회 목록의 거르기·페이징
- **질문**: "결과 변수·최종 결과 변수·세트 검사"는 저장하지 않는 계산값이라 SQL 로 거를 수 없다.
- **선택지**: (a) 세트 전체를 메모리에서 거르고 자른다 / (b) SQL 로 세트 ID·이름·상태만 거르고 결과 변수 필터는 뺀다
- **택한 것**: (a). 세트는 작다(F4 `allSets` 선례, 06 "목록일 뿐"). 결과 변수는 대문자 정확 일치(중간 포함), 담은 룰·세트는 부분 일치다. 세트가 수천 개로 늘면 SQL 선거르기(세트 ID·이름·상태)를 더한다.

### D11 — "저장 즉시 배포"
- **질문**: 06 은 세트 저장 = 바로 배포, PRD FR-E5 는 "저장 즉시 배포는 보류". 이번에 배포 쪽 코드를 만드나.
- **선택지**: (a) 테이블 저장만 하고 배포는 만들지 않는다 / (b) 배포 목록 싣기·스냅샷 발행까지 만든다
- **택한 것**: (a). 저장은 `TB_MDM_RULE_SET` 한 행 갱신으로 끝나고 배포 스냅샷·배포 목록·수신 시스템 알림 코드는 만들지 않는다(I23). 화면 안내는 "저장하면 바로 반영된다. 배포(스냅샷 발행)는 보류다".

### D12 — 메뉴 순번
- **질문**: 같은 `dme` 폴더에 TSK-08-05 `ruleConfirm` 이 들어올 예정이다. 두 leaf 의 순번과 시드 자리를 어떻게 잡나.
- **선택지**: (a) 004·005 로 두고 새 메서드에 시드한다 / (b) 003·004 로 두고 08-02 배열에 원소를 더한다
- **택한 것**: (a). `ruleSetMng` 004/5050400, `ruleSetEdit` 005/5050500. 003/5050300 은 TSK-08-05 `ruleConfirm`(같은 폴더, ready) 자리로 비워 둔다. 멱등 키는 MENU_ID 라 순번이 겹쳐도 메뉴가 빠지지는 않는다(순서만).
  08-02 배열을 고치지 않고 새 메서드 `seedMdmRuleSetMenus()` 로 둔다(병렬 Task 와의 충돌 줄이기).

### D13 — 컬럼 사전 변수 링크
- **질문**: 06:756 "컬럼 사전의 변수는 02 컬럼 화면으로 간다". `dma/columnMng` 는 넘겨받은 파라미터를 읽지 않는다(`tabId`·`useMdmPageParams` 없음).
- **선택지**: (a) 컬럼 화면 탭만 연다(검색어 넘기지 않음, columnMng 무변경) / (b) columnMng 에 파라미터 받기를 더해 그 물리명으로 조회해 연다
- **택한 것**: (a). 다른 Task 의 화면(998줄)을 고치는 범위를 피한다. (b) 는 columnMng 가 파라미터를 받게 되면 `links.ts` 한 줄로 바꾼다.

### D14 — 폐기 확인 방식
- **질문**: 06:766 "확인을 한 번 더 받는다"를 어떤 조작으로 만드나.
- **선택지**: (a) 두 단계 버튼(폐기 → 폐기 확인/취소) / (b) 시안처럼 같은 버튼을 두 번 누름
- **택한 것**: (a). 시안은 같은 버튼을 두 번 누르게 하지만, 08-02 룰 폐기(`RuleHeaderCard` "폐기" → "폐기 확인"/"취소")와 같은 두 단계 버튼으로 한다. 06:766 "확인을 한 번 더 받는다"를 만족하고 두 화면의 조작이 같다.

### D15 — 목록에 같은 룰을 두 번 담나
- **질문**: 06·시안은 같은 룰 중복을 정하지 않았다.
- **선택지**: (a) 담지 않는다(화면이 막고 서버가 거부) / (b) 담을 수 있다
- **택한 것**: (a). 화면은 "이미 담은 룰이다"로 막고 서버는 MDM021 로 거부한다. 엔진은 목록을 그대로 두 번 돌리지만 같은 룰을 다시 돌려도 새 결과가 없고, 활용처 계산(`RuleUsageFinder`)은 중복을 없앤다.

### D16 — 누가 세트를 고치나
- **질문**: 세트에는 소유자·선점이 없다. 쓰기 권한을 BFF RBAC 만으로 두나, 서버에서도 역할을 보나.
- **선택지**: (a) BFF RBAC + 서버 담당자 검사 / (b) BFF RBAC 만
- **택한 것**: (a). 쓰기(등록·저장·폐기·되살리기)는 담당자(`RuleStewardCheck.requireSteward()`)만. BFF RBAC(EDIT 세트 = STEWARD) 위에 서버 검사를 한 번 더 둔다(08-02 등록 선례). 세트에는 소유자·선점이 없으므로
  동시 편집은 `ROW_VERSION`(MDM001)으로만 막는다.
