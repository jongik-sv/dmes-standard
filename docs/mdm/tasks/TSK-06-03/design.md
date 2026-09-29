# TSK-06-03 설계 — 코드 편집 (그리드·트리·경미 수정)

> Phase 02 Design. 워크트리 `/Users/jji/project/dmes-standard/dflow-f93163b8`, 브랜치 `agent/f93163b8-code-item-edit`, 기점 origin/dev `3fbf073`. 무인 실행이라 사람에게 묻지 않았고, 근거로 고른 결정은 끝의 `## 담당자 확인 필요 결정` 에 적었다.
> 에이전트 프롬프트(`item.agent_prompt`)는 없다. spec 본문은 요구사항 데이터로만 읽었다.
> 입력: `spec.md`, `.claude/skills/dflow-dev/references/dev-discipline.md`(Phase 02, 화면 E2E, 서버 프로세스, 도커 규칙, 결정 번호, 마이그레이션 버전, 무거운 명령), `RULE.md`, 원천 `docs/mdm/design/basic/04-master-code-deploy-full.md`(이하 `04:행`), 시안 `docs/mdm/design/basic/html/04-master-code.html`(이하 `시안:행`), 시뮬레이터 `docs/mdm/design/basic/sql/04-hier-tree-sim.py`(이하 `sim`), 선행 `docs/mdm/tasks/TSK-06-01/design.md`(이하 `06-01`), 선례 `docs/mdm/tasks/{TSK-04-02,TSK-04-04}/design.md`, `docs/mdm/screens/README.md`, 코드 `src/backend/mdm/**`·`src/frontend/{m-mdm,shared,e2e}/**`.
> 스킬 확인: `oasis-contract-check`, `oasis-project-support`, `bpmn-skill`, `mantine-aggrid-ui`(아래 F20~F24 에 반영).
> 근거 순위: spec 본문(원천 04·시안·시뮬레이터 포함) > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물.

---

## 0. entry-point 정정 — `mdc` 는 오기이고 `dmc` 를 쓴다

spec 은 `entry-point: /portal → mdc/codeItemEdit` 라고 적었다. 그러나 화면 그룹 정본인 `docs/mdm/screens/README.md` §3 표, `docs/mdm/wbs.md:939`(`dmc/codeItemEdit`), 계약 `MdmScreenGroup.DMC("dmc","마스터코드")`, 그리고 `MdmOasisConventions.GROUP_CODE_PATTERN = "^dm[a-z]$"` 가 모두 `dmc` 다. `mdc` 는 이 패턴을 통과하지 못하고, `DataInitializer.seedMdmObjectRbac` 는 모르는 그룹 코드를 받으면 기동을 멈춘다. 그래서 이 설계는 경로·메뉴·패키지를 모두 **`dmc/codeItemEdit`** 로 쓴다(D1). TSK-04-02 §0 의 `mdt → dma` 정정과 같은 경우다.

---

## 1. 조사로 확인한 사실

Build 는 원천 문서를 다시 읽지 않고 이 절과 §6 만으로 구현할 수 있어야 한다.

### 1.1 코드베이스 사실

| # | 사실 | 근거 |
|---|---|---|
| F1 | 04 스키마(V9)·엔티티 5종·리포지토리 5종·계약 `contract.mastercode` 는 TSK-06-01 이 이미 만들었다. **이 Task 는 Flyway 마이그레이션이 필요 없다**(스키마 변경 없음). origin/dev 의 mdm 마이그레이션 최대 번호는 두 방언 모두 V11 이다(2026-09-24 fetch 확인) | `git ls-tree origin/dev .../db/migration/mdm/{sqlite,mssql}/` |
| F2 | `MasterCodeSegmentService`(12 메서드)에는 main 구현이 하나도 없다. 06-01 L646 이 이 Task 에 `addItem`·`changeItem`·`removeItem`·`revert`·`viewAt` 구현을 넘겼다. 나머지 7개는 TSK-06-02(`createBaseCategory`·`fillFrom`)와 TSK-06-04(카테고리 5개) 몫이다. 형제 워크트리 `dflow-16de6362`(06-02)는 지금 설계 전이다 | `contract/mastercode/MasterCodeSegmentService.java`, 형제 워크트리 읽기 |
| F3 | 계약 Javadoc: 모든 조작은 DRAFT V 에서만 한다(아니면 MDM002). 호출자가 같은 트랜잭션에서 먼저 `VersionWriteGuard.beginDraftWrite` 를 부르고, **선분 서비스는 ROW_VERSION 을 받지도 올리지도 않는다**(06-01 불변 26). 새 행의 to_ver 는 항상 `OPEN_TO_VER` 다. 한 버전 안에 같은 키의 행은 하나다 | `MasterCodeSegmentService.java:13-20` |
| F4 | `beginDraftWrite(ref, expectedRowVersion, userId)` 검사 순서: 행 읽기(없으면 MDM001) → 소유자(MDM003) → row_version(MDM001) → 상태 DRAFT(MDM002) → 다른 미적용 버전(MDM007) → ROW_VERSION +1(CAS). 자체 `TransactionTemplate`(REQUIRED)을 쓰므로 OASIS 트랜잭션 안에서는 합류하고, **트랜잭션 밖에서 부르면 증가분이 따로 커밋된다** | `DefaultVersionWriteGuard.java:48-62`, `VersionPreconditions.java` |
| F5 | `VersionPreconditions`(미적용 판정 `isUnapplied`, `requireSingleUnapplied`, `requireSteward`)는 **package-private** 이라 `common.version` 밖에서 쓸 수 없다. 미적용 = DRAFT, 또는 `APPLY_FROM > now` 인 RELEASED 이다. 경계(`APPLY_FROM == now`)는 적용된 것으로 본다 | `VersionPreconditions.java:66-73` |
| F6 | 엔티티 `MdmCodeItem`(키 MARU_CODE_ID·CODE·FROM_VER, 생성자 `(maruCodeId, code, fromVer)`, `toVer` 기본값 `OPEN_TO_VER`, 세터 toVer·name·alterName·seq·description·lvl1-5·attr01-10), `MdmCodeCateItem`(키 4개, 세터는 `setToVer` 뿐), `MdmCodeCate`, `MdmCodeVer`(ROW_VERSION 세터 없음, `@Version` 아님), `MdmCode`(LAST_CHG_SEQ 미매핑). 버전 칸 게터는 scale 3 을 돌려준다. `MdmCodeVerNumbers` 는 package-private 이라 엔티티 패키지 밖에서 쓸 수 없다 | `lib/.../entity/MdmCode*.java` |
| F7 | 리포지토리 5개(`MdmCode*Repository`)는 `JpaRepository` 선언만 있고 파생 쿼리가 없다. 형제 Task 도 같은 파일에 쿼리를 더할 수 있어 충돌 위험이 있다 | `lib/.../repository/` |
| F8 | **SQLite 는 NUMERIC(7,3) 을 값에 따라 INTEGER(1.000)·REAL(1.001)로 저장한다**(06-01 F12). 규칙표 #17(DECIMAL 저장·비교 실측)은 아직 TSK-06-02 몫이다. `BigDecimal.equals` 는 scale 을 보므로 버전 비교는 반드시 `compareTo` 로 한다(06-01 F26) | 06-01 F12·F26, `docs/mdm/naming-dialect-rules.md` #17 |
| F9 | OASIS 서비스 관례: `@Service("<screenId>Service")`, 생성자 주입, **`@Transactional` 금지**(CGLIB 가 파라미터 이름을 지워 `ParameterName must not be null`). OASIS `SpringTransactionHandler` 가 action 한 건을 트랜잭션 하나로 묶고 예외가 나면 앞선 쓰기까지 되돌린다(`DmaOasisHttpTest.P8` 가 실측). 첫 인자는 params DTO, 행 목록은 `grids.<파라미터명>.rows` 로 파라미터 이름과 글자 단위로 맞춰 `List<Map<String,Object>>` 로 받는다. **그리드를 빼고 보내면 "No suitable method" 로 실패한다.** 반환은 `Map<String,Object>`, BPMN `output=result` 라 응답 `data.result` 에 실린다 | `DomainMngService.java:47-53`, `ColumnMngService.java:59-66,239-244`, `DmaOasisHttpTest.java:126-134,179-197` |
| F10 | BPMN 틀(5개 dma 파일 공통): `startEvent` → `exclusiveGateway id="actionGateway"`(`camunda:property input=action`) → sequenceFlow `name=<action>` → serviceTask(`camunda:class=<빈 이름>`, 속성 `method`·`output=result`·`dto=<FQCN>`) → endEvent. `grid` 속성은 쓰지 않는다. process id = 파일명 = serviceId | `services/dma/columnMng.bpmn:1-95` |
| F11 | **OASIS 오류 응답에는 MDM 코드와 구조화 이슈가 실리지 않는다.** 서비스가 던진 예외는 HTTP 200 + `meta.success=false` + `meta.message=<예외 message>` 로만 오고 `meta.code` 는 `E001`/`S001`, `errors[]` 는 비어 있다. 그래서 행별 오류 표시는 **성공 응답으로 이슈를 돌려주는 `validate` 액션**이 맡아야 한다 | `MdmErrors.java:16-18`, `CactusResponseConverter.java:92-99`, `DomainMngOasisFlowTest:158-163` |
| F12 | `MdmErrors`: `of(code)`, `of(code, issues)`, `of(code, detail, issues)` — message = 기본 문구 + `": " + detail`. 여러 이슈를 싣는 선례는 `DomainRejections.reject`(MDM015 우산 코드 + 이슈 코드) | `common/support/MdmErrors.java:25-34`, `dma/domainMng/service/DomainRejections.java:22-42` |
| F13 | `MdmErrorCode` 는 지금 21개(MDM001~MDM021)다. **`CommonContractTest:48` 이 `assertEquals(21, MdmErrorCode.values().length)` 로 개수를 고정한다.** 같은 테스트 41-47행은 형식 `^MDM\d{3}$`, 중복 금지, transport 비 null, httpStatus ∈ {400,403,409} 를 보고, 65-83행은 MDM013~021 을 하나씩 단언한다 | `CommonContractTest.java:41-83` |
| F14 | 현재 사용자는 `MdmCurrentUser.userId()`·`roleIds()`(`CactusMdmCurrentUser`, `ROLE_` 접두를 뗀 역할)로 얻는다. 테스트 가짜: `VersionScenarioFakes.FakeCurrentUser.set(userId, roles)`, `DmaTestSupport.MutableCurrentUser.set(...)`. HTTP 테스트는 헤더 `X-Client-Key`·`X-Authenticated-User`·`X-Authenticated-Role` 로 실제 필터 경로를 탄다 | `DmaOasisHttpTest.java:255-268`, `VersionScenarioFakes.java` |
| F15 | 시각은 주입한 `Clock` 빈(`MdmClockConfig`, KST)으로 얻는다. 테스트는 `@Primary` 로 `VersionScenarioFakes.MutableClock` 을 넣는다. **PROC_CD 샘플은 v1.001 의 apply_from 이 2026-07-01 이다.** 시험 시계가 그보다 앞서면(키트 기본 2026-06-01) v1.001 이 미적용이 되어 DRAFT v2.000 과 함께 미적용 2개가 되고 `beginDraftWrite` 가 MDM007 로 막는다 → 샘플 시험의 시계는 원천 기준일 **2026-09-03 00:00:00 KST** 로 둔다 | `MdmClockConfig.java:13-19`, `04:1061` |
| F16 | 시험 격리 표준: `@TempDir static Path tempDir` + `@DynamicPropertySource` 로 `spring.datasource.url=jdbc:sqlite:<tempDir>/<클래스별 이름>.db`, `@ActiveProfiles("local")`. 04 표 시드 SQL 선례: `MasterCodeVersionStateSqliteTest.seedObject`·`seedVersion`(73-102행), 삭제 순서 CATE_ITEM → CATE → ITEM → CODE_VER → CODE(61-69행). 업무 일시는 19자 `'yyyy-MM-dd HH:mm:ss'` TEXT 로 넣는다(`MdmTemporalBinder.fromDb` 는 정수를 받지 못한다) | `DmaOasisHttpTest.java:50-68`, `MasterCodeVersionStateSqliteTest.java:33-102` |
| F17 | `CactusAuditEntity.version`(감사 VER)은 `@Version` 이 아니다. `CactusAuditListener` 가 INSERT 때 0, UPDATE 때 +1 을 한다. `MdmCodeVer` 는 감사 칼럼이 `AUD_VER` 다 | `cactus-core/.../CactusAuditEntity.java:51-52` |
| F18 | 카테고리 해석(REGEX 전체 일치·TABLE)은 mdm 안에 구현이 없다. `dma/domainMng/service/CodeCategoryValidator` 는 "RELEASED 버전에 유효한 카테고리 행이 있는가"만 본다. 엔진 `kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver` 는 RELEASED 버전 선택·소급을 전제로 한 사본 판정용이라 DRAFT V 미리보기에 그대로 맞지 않는다 | `CodeCategoryValidator.java`, `maru-mdm-engine/.../DefaultCodeResolver.java:115-143` |
| F19 | 메뉴 시드는 `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` 자바 코드뿐이다. `dmc` 폴더는 이미 시드된다(879행, leaf 가 없어 사이드바에 안 보일 뿐). leaf 는 `insertMcmSecObjIfAbsent(objectId, 이름, "mdm")` → `insertMcmSecMenuIfAbsent(menuId, menuSeq, fullSeq, 이름, 그룹, objectId)` → SYSADMIN×PERM_ALL 행 → `seedMdmObjectRbac(objectId, 그룹)` 순이다. domainMng 는 별도 메서드 `seedMdmDomainMngMenu()` 로 분리했다(911·1062-1070행). `dmc` 매트릭스는 STD_ADMIN=`PERM_MDM_READ`, STEWARD=`PERM_MDM_CONFIRM`(1011-1016행). FULL_SEQ 는 부팅 끝 `recomputeMenuFullSeq()` 가 다시 매긴다 | `DataInitializer.java:846-1070` |
| F20 | **OASIS 계약 검사**(`oasis-contract-check`): 진입점 서비스 `@Transactional` 금지(6-B-1), serviceTask 에 `grid` 속성 금지(6-C-1), `output` 명시(6-C-2), `params` 는 평탄한 값만이고 배열은 `grids` 로(6-E-2), `grids` 키 = 자바 파라미터 이름(6-E-3), 신규 BPMN 은 `conditionExpression` 없이 flow `name` 만(6-C-3). **검사기는 mdm 모듈을 스캔하지 않는다**(기준선 INFO 29 는 모두 mcm·mls 파일). 그래서 mdm BPMN 의 계약은 이 Task 의 BPMN 액션 테스트가 대신 고정한다. INFO 수는 이 Task 로 바뀌지 않을 것으로 본다 | `check_oasis_contract.py --all` 실행 결과 |
| F21 | **BPMN 작성**(`bpmn-skill`): `.bpmn` XML 을 손으로 쓰지 않는다. `bpmn-tool create`(JSON 스펙) → `bpmn-tool validate` → `bpmn-tool preview` 로 만든다. ExclusiveGateway 는 분기가 둘 이상이면 default flow 가 없다는 경고를 낸다(기존 dma 파일도 같은 경고를 안고 있다 — 경고는 허용, 오류 0). OASIS 의미(`input`·`method`·`output`·`dto`)는 `oasis-project-support` 기준으로 붙인다 | `.claude/skills/bpmn-skill/SKILL.md` |
| F22 | **FE 래퍼 규칙**(`mantine-aggrid-ui`): 화면은 `@mantine/*`·`ag-grid-*` 를 import 하지 않고 `@dk-oasis/shared/*` 만 쓴다. 그리드 `AgDataGrid`(열 `GridColumn`: `editable`(불리언 또는 함수)·`cellEditor`·`render`·`cellClassRules`·`hide`), `GridPanel`(추가·삭제 버튼, 새 행 `__gridTempId`), `getRowClassExtra(row)`(업무 행 색은 의미 토큰 클래스), 트리 `import { Tree, type TreeNode } from "@dk-oasis/shared/tree"` + `"@dk-oasis/shared/tree.css"`(props `items`·`expandedItems`·`selectedItems`·`onExpandedItemsChange`·`onSelectedItemsChange`, 사용 예 `m-mcm/page-components/csa/commMenuMng/page.tsx:1094`), 탭 `@dk-oasis/shared/tabs`, 폼 `Select`·`Input`·`Checkbox`·`Radio`·`Button`(`@dk-oasis/shared/form`), 배지 `GridBadge`(`@dk-oasis/shared/grid`). **shared 에는 Chip·Switch·SegmentedControl·Drawer 가 없다.** 래퍼가 모자라면 화면에서 우회하지 않는다. 색은 `var(--color-…)` 토큰만 쓴다. 커밋 전 `mantine_docs.py audit`·`aggrid_docs.py audit`(바꾼 파일만) 0건 | `.claude/skills/mantine-aggrid-ui/SKILL.md` §3·§4, `shared/src/components/grid/AgDataGrid.tsx:152-319,580-588` |
| F23 | m-mdm 화면 관례: `MdmPageLayout`(`group`·`screenId`·`title`·`buttons`, 버튼마다 `action` 을 넣어야 RBAC 로 활성), 오류는 `ErrorModal`, 성공은 `useMessage().showMessage({toast:true})`. OASIS 호출은 화면 `api.ts` 에서 `apiRequest` 로 하고 `meta.success===false` 면 `meta.message` 로 throw 한다(`columnMng/api.ts:28-67` 의 `callOasis`·`unwrap`). params 에 null 이 있으면 S999 로 실패하므로 null·undefined 를 뺀다. 새 화면은 `m-mdm/tsup.config.ts` 엔트리 1줄이 필요하다(`tests/tsup-entries.smoke.test.ts` 가 디스크의 `page.tsx` 와 1:1 대응을 강제). 포털 라우트 `m-mcm/lib/generated/page-registry.ts` 는 codegen 산출물이며 선례는 그 생성 결과 1줄을 함께 커밋했다 | `m-mdm/pages/dma/columnMng/{page.tsx,api.ts}`, 커밋 `29af939` |
| F24 | m-mdm vitest: `tests/**/*.test.ts`, 렌더 테스트는 머리에 `/** @vitest-environment happy-dom */`, fetch 를 URL 별로 스텁하고 `DmesUiProvider` 로 감싸 렌더한다(`tests/dma/domainMng/page-render.test.ts:16-71`). `pnpm build:libs` 없이 돌리면 3 files 실패한다 | `m-mdm/vitest.config.ts` |
| F25 | E2E 관례: `src/frontend/e2e/mdm-*.spec.ts`, `test.describe.configure({mode:"serial"})`, `SMOKE_MCM_BASE_URL`(기본 5100 은 메인 체크아웃 포털이라 반드시 덮는다), 사용자 `e2e_mdm_steward`·`e2e_mdm_stdadmin`(`e2e/fixtures/mdm-rbac-users.sql`, 비밀번호 admin123), 사이드바는 `.tree-item .item-name` 을 `마루 MDM` → 그룹 → leaf 순으로 누른다. mdm.db 사전 데이터는 mdm 기동(Flyway) 뒤 `sqlite3` CLI 로 픽스처 SQL 을 넣는다(TSK-04-04 `mdm-columnMng-dict.sql`) | `e2e/mdm-unitMng.spec.ts`, `TSK-04-04/design.md:305-352` |
| F26 | 화면 설계 산출물 선례: As-Is 없는 신규 화면은 5종 대신 **기능설계서 1종**을 `docs/mdm/screens/{screenId}/{screenId}_기능설계서.md` 에 둔다(TSK-04-02 D14, TSK-04-03, TSK-04-04 D5, 템플릿 `docs/guide/design/templates/기능설계서.template.md`). 식별자 사전 `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` §A.3.2 에 화면 행을 등재한다(columnMng 232행 선례). `codeItemEdit` 은 §A.2.3 영역 행(133행)에만 있고 §A.3.2 화면 행은 없다 | `screens/*/`, 식별자 사전 |
| F27 | 기존 BPMN 액션 테스트는 파일 목록이 하드코딩돼 새 BPMN 을 자동으로 잡지 않는다(`MdmOasisActionVocabularyTest` 는 unitMng·termMng, `DmaBpmnActionTest` 는 columnMng·termRegPop). main 에 `MasterCodeSegmentService` 구현이 생기면 깨지는 테스트는 없다(`MdmTemporalSegmentStoreNoImplementationTest` 는 `contract.data` 대상) | 테스트 그렙 |
| F28 | E2E 부산물: `mdm-sample-smoke`·`mdm-shell-rbac-smoke` 는 돌 때마다 `docs/mdm/tasks/TSK-01-02/screens/dma-mdmSample.png`, `docs/mdm/tasks/TSK-01-03/screens/*.png` 를 덮어쓴다. 전체 mdm E2E 를 돈 뒤 자기 것이 아닌 스크린샷과 `next-env.d.ts`·`test-results` 를 되돌린다 | `TSK-04-02/design.md:630-649` |

### 1.2 원천 규칙표 (04 를 옮김)

**행 조작**(DRAFT V, 04:40-48)

| 조작 | 결과 |
|---|---|
| 추가 | 새 행 `from_ver = V, to_ver = 9999` |
| 수정 | 옛 행을 `to_ver = V` 로 닫고, 새 행을 `from_ver = V` 로 넣는다 |
| 삭제 | 옛 행을 `to_ver = V` 로 닫는다 |
| V 에서 두 번 고치기 | `from_ver = V` 행을 직접 갱신한다. 한 버전 안에 같은 키의 행은 하나뿐이다 |
| V 의 diff | `from_ver = V` 또는 `to_ver = V` 인 행 |

**행 되돌리기**(04:50-65)

| 취소 대상 | 처리 |
|---|---|
| 추가 | `from_ver = V` 행을 지운다 |
| 수정 | `from_ver = V` 행을 지우고, `to_ver = V` 였던 옛 행을 9999 로 되돌린다 |
| 삭제 | `to_ver = V` 를 9999 로 되돌린다 |

- V 에서 추가·수정한 행(`from_ver = V`)을 다시 삭제하면 **닫지 않고 지운다**(04:59).
- 수정한 뒤 삭제한 경우 옛 행은 `to_ver = V` 로 닫힌 채 남는다. 되돌리기와 달리 9999 로 열지 않는다(04:60).
- 닫는 조작은 이전 버전의 행에만 한다. 같은 키의 구간은 겹치지 않는다. 삭제 뒤 다시 추가하면 빈 구간이 생길 수 있다(04:61-62).
- 코드 삭제 연쇄(04:489-500): 그 코드의 열린 CATE_ITEM 행을 같은 V 로 함께 닫는다. REGEX 는 건드리지 않는다. 코드 **수정**에는 적용하지 않는다. 화면은 "카테고리 n개에서 함께 빠집니다"를 보인다. 코드 삭제를 되돌리면 함께 닫은 CATE_ITEM 행을 9999 로 다시 연다.

**저장 검사**(spec 요구사항 "콤마·공백, 계층 3검사, 라벨 없는 attr, 구간 겹침")

| 이슈 코드(이 Task 가 정함) | 규칙 | 원천 |
|---|---|---|
| `CODE_FORBIDDEN_CHAR` | 코드값에 콤마·공백(`MasterCodeConventions.CODE_FORBIDDEN_CHAR_PATTERN = "[,\\s]"`)이 있으면 거부. 계층 칸 값에도 같은 금지를 적용한다 | 04:109, 04:197 |
| `CODE_REQUIRED` | 코드값이 비었으면 거부 | PK NOT NULL |
| `LVL_BEYOND_CNT` | `lvl_cnt` 보다 뒤 칸에 값이 있으면 거부 | 04:112 첫째, 04:416(8항) |
| `LVL_GAP` | `lvl_n` 에 값이 있는데 `lvl_1..lvl_(n-1)` 중 빈 칸이 있으면 거부 | 04:112 둘째 |
| `LVL_PARENT_MISMATCH` | 같은 문자열이 그룹 값으로든 코드값으로든 이미 있으면 그 행의 앞 칸이 내 앞 칸과 같아야 한다. 다르면 거부. 조상 행 존재는 검사하지 않는다. **그 버전에 유효한 행을 기준으로 본다** | 04:112 셋째 |
| `ATTR_WITHOUT_LABEL` | 라벨(`TB_MDM_CODE.attrNN_name`)이 없는 번호에 값이 있으면 거부 | 04:164, 04:415(7항) |
| `SEGMENT_OVERLAP` | 같은 코드의 구간이 겹치면 거부(이미 V 에 유효한 코드를 다시 추가, 한 요청 안의 같은 코드 둘) | 04:418 |
| `CODE_NOT_FOUND` | 수정·삭제·되돌리기 대상 코드가 V 에 없다 | 입력 검사 |
| `SOURCE_EXTERNAL` | 원천이 EXTERNAL 인 마루 코드는 MDM 화면에서 저장하지 않는다 | 04:84, 04:846 |

**경미 수정**(04:522-549, 04:833, 04:843)

- 고칠 수 있는 값: TB_MDM_CODE_ITEM 의 `name`·`alter_name`·`seq`·`description` 뿐이다. `code`·`from_ver`·`to_ver`·계층 칸·추가 컬럼 값은 잠기며 새 버전으로만 바꾼다(04:531, 04:543, 시안:318).
- 대상 행: from_ver 의 버전이 RELEASED 인 ITEM 행. DRAFT 가 추가한 행·CANCELLED 버전의 행은 대상이 아니다(04:541-542).
- DRAFT 와 겹치는 키: DRAFT V 가 같은 키를 수정해 `from_ver = V` 행을 만들어 두었으면 거부하고 "DRAFT에서 고치세요"로 안내한다. DRAFT 가 닫기만 한 경우(`to_ver = V`)는 패치할 수 있다(04:544).
- 미적용 버전 2개면 경미 수정을 거부한다(04:298). 권한은 마루 코드 담당자로 제한한다(04:546). EXTERNAL 은 패치가 없다(04:549).
- 동작: 행을 그 자리에서 update 한다. 그 구간의 모든 버전에서 고친 값이 보인다(04:540).

### 1.3 원천 샘플 데이터 (04:1059-1149, 수용 기준 1의 기대값 원천)

**PROC_CD**(기준일 2026-09-03, lvl_cnt 0, 원천 MDM). 아래는 **DRAFT v2.000 이 82·83 을 닫은 뒤**의 최종 상태다.

```
TB_MDM_CODE_VER   1.000 | RELEASED | 2024-01-01 00:00:00 | 2026-07-01 00:00:00 | 최초 생성
                  1.001 | RELEASED | 2026-07-01 00:00:00 | 9999-12-31 00:00:00 | 냉연 라인 2기 추가(minor)
                  2.000 | DRAFT    | NULL                | NULL                | 코드 82·83 삭제(major, 작업 중)
TB_MDM_CODE_ITEM  code | from  | to    | name   | alter | seq
                  1P   | 1.000 | 9999  | PLTCM  | PLTCM | 11
                  82   | 1.000 | 2.000 | 2CGL   | CGL   | 21    (DRAFT v2.000이 닫음)
                  83   | 1.000 | 1.001 | 3CGl   | CGL   | 22    (v1.001에서 이름을 고쳐 닫음)
                  83   | 1.001 | 2.000 | 3CGL   | CGL   | 22    (DRAFT v2.000이 닫음)
                  2P   | 1.001 | 9999  | PLTCM2 | PLTCM | 12    (v1.001에서 추가)
TB_MDM_CODE_CATE  BASE      | 1.000 | 9999 | 전체      | REGEX | .*
                  COATING   | 1.000 | 9999 | 도금 공정 | REGEX | 8[0-9]
                  MAJOR     | 1.000 | 9999 | 주요 공정 | TABLE | -
                  COLD_MILL | 1.000 | 9999 | 냉연 공정 | TABLE | -
TB_MDM_CODE_CATE_ITEM  MAJOR 1P 1.000-9999 / MAJOR 82 1.000-2.000(DRAFT v2.000이 코드 82와 함께 닫음)
                       MAJOR 2P 1.001-9999 / COLD_MILL 1P 1.000-9999 / COLD_MILL 2P 1.001-9999

현재 모습(v1.001): 코드 {1P, 82, 83(3CGL), 2P}, MAJOR의 CATE_ITEM = {1P, 2P, 82}
해석 결과(V = 1.001): BASE = {1P, 2P, 82, 83}, COATING = {82, 83}, MAJOR = {1P, 2P, 82}, COLD_MILL = {1P, 2P}
DRAFT v2.000의 모습: 코드 {1P, 2P} → BASE = {1P, 2P}, COATING = {}(경고), MAJOR = {1P, 2P}
diff(V = 2.000): to_ver = 2.000인 행(ITEM 82, ITEM 83@1.001, CATE_ITEM MAJOR 82). from_ver = 2.000인 행은 없다
```

- **EQP_CD**: 원천 EXTERNAL(MES), 1.000 RELEASED(2026-08-01 → 2026-09-01), 2.000 RELEASED(2026-09-01 → 9999-12-31). "EQP_CD 화면: 조회 전용이다. 새버전·편집·경미 수정 버튼이 없다"(04:1104).
- **STEEL_STD**(04:1109-1148): lvl_cnt 3, attr01_name `인장강도`, 1.000 RELEASED(2026-01-01 00:00:00 → 9999-12-31 00:00:00), 8행(모두 from 1.000, to 9999, lvl4·lvl5 NULL):

| code | name | seq | lvl1 | lvl2 | lvl3 | attr01 |
|---|---|---|---|---|---|---|
| KS-9 | 규격 외 KS | 9 | KS | NULL | NULL | NULL |
| KS-3-CGCC | CGCC | 1 | KS | KS-3 | NULL | 270 |
| KS-3-CGCD | CGCD | 2 | KS | KS-3 | NULL | 270 |
| KS-3-CGCH | CGCH(기본) | 3 | KS | KS-3 | NULL | 270 |
| KS-3-CGCH-Z12 | CGCH Z12 | 1 | KS | KS-3 | KS-3-CGCH | 270 |
| KS-3-CGCH-Z27 | CGCH Z27 | 2 | KS | KS-3 | KS-3-CGCH | 270 |
| JIS-3-CGCC | CGCC(JIS) | 1 | JIS | JIS-3 | NULL | 270 |
| JIS-4-SPCC | SPCC | 1 | JIS | JIS-4 | NULL | 270 |

- 04:1148 저장 검사: **`(KS, NULL, KS-3-CGCH)` 는 중간 칸이 비어 거부, `(JIS, KS-3)` 는 KS-3 이 이미 KS 아래에 있어 거부, `(KS, KS-3, KS-3-CGCH)` 는 통과.**

> 주의: 시안 JS 의 PROC_CD 표본(`시안:559-590`: v2.000 이 84·85 추가, 82 약칭 수정)은 원천 문서의 샘플과 **다른 데이터**다. 수용 기준 1 의 기대값은 원천 문서(위)에서만 가져온다.

### 1.4 트리 시뮬레이터 실행 결과 (수용 기준 4의 기대값 원천)

`python3 docs/mdm/design/basic/sql/04-hier-tree-sim.py` 를 2026-09-24 에 실행했고 exit 0 · "모든 확인 통과" 였다. 출력 전문(글자 그대로, 앞 공백 2칸은 시뮬레이터의 출력 들여쓰기다):

```
== STEEL_STD 콤보 (코드 먼저, 그다음 그룹)
  고른 값 (없음)       → JIS(그룹), KS(그룹)
  고른 값 KS         → KS-9(코드, 규격 외 KS), KS-3(그룹)
  고른 값 KS-3       → KS-3-CGCC(코드, CGCC), KS-3-CGCD(코드, CGCD), KS-3-CGCH(그룹+코드, CGCH(기본))
  고른 값 KS-3-CGCH  → KS-3-CGCH-Z12(코드, CGCH Z12), KS-3-CGCH-Z27(코드, CGCH Z27)
  고른 값 JIS        → JIS-3(그룹), JIS-4(그룹)

== STEEL_STD 트리
  ▸  JIS
     ▸  JIS-3
         · JIS-3-CGCC  (CGCC(JIS))
     ▸  JIS-4
         · JIS-4-SPCC  (SPCC)
  ▸  KS
      · KS-9  (규격 외 KS)
     ▸  KS-3
         · KS-3-CGCC  (CGCC)
         · KS-3-CGCD  (CGCD)
        ▸· KS-3-CGCH  (CGCH(기본))
            · KS-3-CGCH-Z12  (CGCH Z12)
            · KS-3-CGCH-Z27  (CGCH Z27)

== ORG 콤보·트리 (05, closed_at IS NULL 행만. 항목은 seq 순)
  고른 값 (없음)   → HQ(그룹), PH(그룹)
  고른 값 PH     → PH-A(그룹+코드), PH-B(코드)
  고른 값 PH-A   → PH-A-MNT(코드), PH-A-PRD(코드)
  ▸  HQ
      · HQ-PLN  (기획팀)
  ▸  PH
      · PH-B  (B공장)
     ▸· PH-A  (A공장)
         · PH-A-PRD  (A공장 생산팀)
         · PH-A-MNT  (A공장 정비팀)

== 저장 검사
  ('KS', None, 'KS-3-CGCH')                X-1              → 거부: 중간 칸이 비었다
  ('JIS', 'KS-3', None)                    X-2              → 거부: KS-3는 이미 KS 아래에 있다
  ('KS', 'KS-3', 'KS-3-CGCH')              KS-3-CGCH-Z50    → 통과
  ('JIS', None, None)                      KS-3             → 거부: KS-3는 이미 KS 아래에 있다

모든 확인 통과
```

ORG 표본 입력(시뮬레이터 `TB_MDM_DATA_ITEM`, 모두 closed_at NULL): `HQ-PLN 기획팀 seq1 (HQ)`, `PH-B B공장 seq1 (PH)`, `PH-A A공장 seq2 (PH)`, `PH-A-PRD A공장 생산팀 seq1 (PH, PH-A)`, `PH-A-MNT A공장 정비팀 seq2 (PH, PH-A)`.

**시뮬레이터에서 읽어 낸 정렬 규칙 두 가지**(서로 다르다):

1. **트리**(sim `tree()`·`order()`): 한 노드의 자식 가운데 **자기 코드 행이 있는 노드**(코드이자 그룹인 노드 포함)를 먼저 `(seq, 값)` 오름차순으로, 그다음 **순수 그룹**을 값 오름차순으로 보인다. 마커는 두 글자다: 첫 글자 `▸`(자식 있음) 또는 공백, 둘째 글자 `·`(코드 행 있음) 또는 공백. 줄 모양 = `들여쓰기 + 마커 + " " + 값 + (코드면 "  (" + 이름 + ")")`, 들여쓰기는 깊이마다 공백 3칸. 뿌리 순서도 같은 규칙이다. ORG 의 `PH-A-PRD`(seq 1)가 `PH-A-MNT`(seq 2)보다 앞선 것이 seq 정렬의 증거다.
2. **콤보**(sim `combo()`): `ORDER BY is_code DESC, value` — 코드인 항목(그룹+코드 포함)을 먼저, 그 안은 **값 순**이다(seq 가 아니다). ORG 의 `PH-A(그룹+코드), PH-B(코드)`, `PH-A-MNT, PH-A-PRD` 가 증거다. 종류 표기: 그룹만이면 `그룹`, 코드만이면 `코드`, 둘 다면 `그룹+코드`.

> 시안 `renderTree` 의 `ord`(시안:996)는 "그룹 여부"로 먼저 나눠 코드이자 그룹인 노드를 그룹 쪽에 둔다. 시뮬레이터와 결과가 다를 수 있으므로 **시안을 따르지 않는다**(수용 기준은 시뮬레이터 결과와의 일치다).
>
> 시뮬레이터 `check()` 는 "닫힌 행도 비교 대상에 넣는다(05)"는 05 규칙으로 짰다. 04 는 "그 버전에 유효한 행을 기준으로 본다"(04:112)이다. 표본이 단일 버전이라 결과는 같다. 구현은 04 규칙을 따른다(D10).

---

## 2. 접근 방식

세 층으로 나눈다. **① 선분 규칙 층**(`common.mastercode`)은 계약 `MasterCodeSegmentService` 의 06-03 몫(코드 행 추가·수정·삭제·되돌리기·버전 V 모습)과 저장 검사·카테고리 해석을 순수 규칙으로 구현한다. 06-04(카테고리 편집)와 06-05(확정 검사 1·2·6·7·8항)가 같은 규칙을 다시 쓰므로 화면 패키지 밖에 둔다. **② OASIS 화면 서비스**(`dmc.codeItemEdit`)는 조회·미리보기·검사·저장·되돌리기·경미 수정 7개 액션을 BPMN 하나로 노출한다. 저장은 요청 행을 메모리에서 V 모습에 먼저 적용해 검사하고(`validate` 와 같은 코드), 통과했을 때만 `beginDraftWrite`(ROW_VERSION +1) → 선분 서비스 순으로 쓴다. 이렇게 하면 거부된 저장이 ROW_VERSION 을 건드리지 않고, OASIS 오류 응답에 구조가 실리지 않는 한계(F11)는 성공 응답을 돌려주는 `validate` 가 메운다. **③ 화면**(`m-mdm/pages/dmc/codeItemEdit`)은 서버가 준 V 모습을 그리드·트리·미리보기로 보인다. 트리와 콤보는 표시 규칙이라 FE 순수 함수로 만들고 시뮬레이터 출력을 그대로 기대값으로 쓰는 vitest 로 고정한다. 카테고리 해석과 저장 검사는 원천이 "서버에서만 한다"(04:183)고 정했으므로 서버만 한다.

버전 비교는 SQLite 의 NUMERIC 저장 형태(F8)에 기대지 않도록, 마루 코드 하나의 ITEM·CATE·CATE_ITEM 행을 `MARU_CODE_ID` 등치로 모두 읽은 뒤 Java 에서 `compareTo` 로 거른다. 새 네이티브 SQL 을 쓰지 않으므로 방언 차이가 생길 자리가 없다. 경미 수정은 DRAFT 경로와 분리한 별도 액션이다. DTO 가 이름·약칭·순서·설명만 받게 해서 잠김을 구조로 보장한다. 배포 순번 증가와 알림은 배포 보류(PRD §2 규칙 7, D-019)에 따라 하지 않는다(D7).

---

## 3. 변경 파일 목록

경로 접두: `B=src/backend/mdm`, `L=$B/lib/src/main/java/com/dongkuk/dmes/mdm`, `LT=$B/lib/src/test/java/com/dongkuk/dmes/mdm`, `A=$B/api/src/main/resources`, `AT=$B/api/src/test/java/com/dongkuk/dmes/mdm`, `F=src/frontend`, `M=$F/m-mdm`.

권장 커밋 단위(Build 는 단위마다 테스트 먼저 → 구현 → 커밋, 모두 `--trailer "DFlow-Order: f93163b8-a0cc-4308-a5b1-df6ff14f7cf6"`): A 규칙 층 → B 서비스·BPMN → C 메뉴 시드 → D 화면 → E E2E·스크린샷 → F 문서.

### 생성 — 커밋 A: 선분 규칙 층 (`common.mastercode`)

| 경로 | 내용 |
|---|---|
| `$L/common/mastercode/MasterCodeRows.java` | `@Component`. EntityManager JPQL 로 마루 코드 하나의 행을 읽는다: `items(maruCodeId)`·`cates(maruCodeId)`·`cateItems(maruCodeId)`(각각 `where e.maruCodeId = :id`), `versions(maruCodeId)`, `code(maruCodeId)`. 버전 범위 조건은 JPQL 에 넣지 않는다(§2) |
| `$L/common/mastercode/MasterCodeSegments.java` | `final` 유틸. `valid(from, to, v)` = `from.compareTo(v) <= 0 && v.compareTo(to) < 0`, `same(a, b)` = `compareTo == 0`, `isOpen(to)` = `to.compareTo(OPEN_TO_VER) == 0` |
| `$L/common/mastercode/MasterCodeItemSegmentOps.java` | `@Component`. 06-03 의 선분 조작 본체(§6.2). `viewAt`·`addItem`·`changeItem`·`removeItem`·`revertItem`·`revertCateItem`. DRAFT 확인(MDM002)은 여기서 한다. ROW_VERSION 은 건드리지 않는다 |
| `$L/common/mastercode/DefaultMasterCodeSegmentService.java` | `@Service implements MasterCodeSegmentService`. 06-03 메서드 5개는 `MasterCodeItemSegmentOps` 로 위임한다. `revert` 는 표에 따라 ITEM·CATE_ITEM 을 위임하고 CATE 는 06-04 몫으로 던진다. 남은 7개는 `throw new UnsupportedOperationException("TSK-06-02 가 구현한다: createBaseCategory")` 처럼 담당 Task 와 메서드 이름을 적어 던진다(D2·D3) |
| `$L/common/mastercode/MasterCodeItemIssueCode.java` | enum: `CODE_REQUIRED`, `CODE_FORBIDDEN_CHAR`, `LVL_BEYOND_CNT`, `LVL_GAP`, `LVL_PARENT_MISMATCH`, `ATTR_WITHOUT_LABEL`, `SEGMENT_OVERLAP`, `CODE_NOT_FOUND`, `SOURCE_EXTERNAL`, `PATCH_NOT_RELEASED`, `PATCH_KEY_CHANGED_IN_UNAPPLIED` |
| `$L/common/mastercode/MasterCodeItemChecks.java` | 순수(Spring·DB 없음). `List<MdmCheckIssue> check(Header header, List<ItemValues> viewAfter, Set<String> touchedCodes)` — §6.3 의 저장 검사 |
| `$L/common/mastercode/MasterCodeItemProjection.java` | 순수. V 모습(코드 → 값)에 요청 행(ADDED·CHANGED·DELETED)을 메모리에서 적용하고 `SEGMENT_OVERLAP`·`CODE_NOT_FOUND` 이슈를 모은다(§6.4). `validate` 와 `save` 가 같은 코드를 쓴다 |
| `$L/common/mastercode/MasterCodeCategoryResolver.java` | 순수. `Resolution resolve(List<MasterCodeItemRow> itemsAtV, MasterCodeCateRow cate, List<MasterCodeCateItemRow> cateItemsAtV)` — §6.5 (D11) |
| `$L/contract/common/MdmErrorCode.java`(**수정**, 끝에 2줄 추가) | `CODE_SAVE_REJECTED("MDM022", 400, ErrorCode.BUSINESS_ERROR, "코드 저장 검사를 통과하지 못했습니다")`, `CODE_PATCH_REJECTED("MDM023", 409, ErrorCode.BUSINESS_ERROR, "경미 수정을 할 수 없습니다")`. 기존 줄은 바꾸지 않는다(D5). `INVALID_INPUT` 뒤의 `;` 를 `,` 로 바꾸는 것만 기존 줄에 닿는다 |
| `$LT/common/mastercode/MasterCodeItemChecksTest.java` | §4.2 |
| `$LT/common/mastercode/MasterCodeItemProjectionTest.java` | §4.2 |
| `$LT/common/mastercode/MasterCodeCategoryResolverTest.java` | §4.2 |
| `$LT/contract/common/CommonContractTest.java`(**수정**) | 48행 `21` → `23`, MDM022·MDM023 개별 단언 2개 추가(코드·HTTP 상태·transport·기본 문구). 새 상수 반영이지 기대값 완화가 아니다 |
| `$AT/common/mastercode/MasterCodeItemSegmentOpsSqliteTest.java` | §4.3 (선분 조작·되돌리기·연쇄·ROW_VERSION 불변·DRAFT 전용) |
| `$AT/common/mastercode/MasterCodeFixtures.java` | 시험 시드 헬퍼(네이티브 INSERT, 이름에 `seed` — Backend 가이드 §10). `seedCode`, `seedVersion`, `seedItem`, `seedCate`, `seedCateItem`, `seedProcCdBeforeDraftEdits`(§1.3 의 PROC_CD 를 v2.000 편집 **전** 상태로: 82@1.000-9999, 83@1.001-9999, CATE_ITEM MAJOR 82@1.000-9999, 나머지는 §1.3 그대로, v2.000 DRAFT 소유자 `kim`·row_version 0), `seedSteelStd`(§1.3 8행 + DRAFT 1.001 소유자 `kim`), `seedEqpCd`(EXTERNAL MES), `clear()`(F16 순서). **시드 제약**: `CK_TB_MDM_CODE_VER_APPLY` 때문에 DRAFT 가 아닌(RELEASED·CANCELLED) 버전 행은 `APPLY_FROM`·`APPLY_TO` 를 둘 다 채운다(CANCELLED 는 예: `2026-08-01 00:00:00`/`2026-09-01 00:00:00`). `CK_TB_MDM_CODE_SRC_SYS` 때문에 MDM 은 `SOURCE_SYSTEM` NULL, EXTERNAL 은 `'MES'`(V2 시드에 있음). 업무 일시는 19자 TEXT |

### 생성 — 커밋 B: OASIS 서비스·BPMN

| 경로 | 내용 |
|---|---|
| `$L/dmc/codeItemEdit/dto/CodeItemSearchRequest.java` | `keyword`(선택) |
| `$L/dmc/codeItemEdit/dto/CodeItemViewRequest.java` | `maruCodeId`, `ver`(String, 비면 기본 버전 — §6.6) |
| `$L/dmc/codeItemEdit/dto/CodeItemPreviewRequest.java` | `maruCodeId`, `ver`(String), `cateId` |
| `$L/dmc/codeItemEdit/dto/CodeItemSaveRequest.java` | `maruCodeId`, `ver`(String), `rowVersion`(Long). `validate`·`save` 가 함께 쓴다 |
| `$L/dmc/codeItemEdit/dto/CodeItemRevertRequest.java` | `maruCodeId`, `ver`, `rowVersion`, `code` |
| `$L/dmc/codeItemEdit/dto/CodeItemPatchRequest.java` | `maruCodeId`, `code`, `fromVer`(String), `name`, `alterName`, `seq`(Integer), `description` — **다른 칸이 없다**(잠김, I27) |
| `$L/dmc/codeItemEdit/service/CodeItemEditService.java` | `@Service("codeItemEditService")`, `@Transactional` 금지(주석으로 이유 명시). 메서드 `search`·`view`·`preview`·`validate(req, List<Map<String,Object>> rows)`·`save(req, List<Map<String,Object>> rows)`·`revert`·`patch`(§6.6) |
| `$A/services/dmc/codeItemEdit.bpmn` | `bpmn-tool create` 로 만든다(§6.7). process id `codeItemEdit` |
| `$AT/dmc/codeItemEdit/CodeItemEditSampleDataTest.java` | §4.4 — 수용 기준 1 |
| `$AT/dmc/codeItemEdit/CodeItemEditServiceSqliteTest.java` | §4.5 |
| `$AT/dmc/codeItemEdit/CodeItemEditOasisHttpTest.java` | §4.6 — OASIS 트랜잭션·봉투 |
| `$AT/dmc/DmcBpmnActionTest.java` | §4.7 |

### 수정 — 커밋 C: 메뉴·OBJECT·RBAC 시드

| 경로 | 내용 |
|---|---|
| `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` | 새 private 메서드 `seedMdmCodeItemEditMenu()`: `insertMcmSecObjIfAbsent("codeItemEdit", "코드 편집", "mdm")` → `insertMcmSecMenuIfAbsent("codeItemEdit", "003", "5030300", "코드 편집", "dmc", "codeItemEdit")` → SYSADMIN×PERM_ALL 행(domainMng 선례와 같은 방식) → `seedMdmObjectRbac("codeItemEdit", "dmc")`. `seedMdmMenus()` 안 `seedMdmDomainMngMenu();` 다음에 호출 **한 줄만** 더한다(형제 dmc leaf 와 충돌 범위 최소화). menuSeq `003` 은 README §3 순서(codeMng·codeEdit·**codeItemEdit**·codeCateEdit·codeConfirm) |

### 생성·수정 — 커밋 D: 화면

| 경로 | 내용 |
|---|---|
| `$M/pages/dmc/codeItemEdit/page.tsx` | 화면(§6.8) |
| `$M/pages/dmc/codeItemEdit/api.ts` | `callOasis`(columnMng/api.ts 모양 복제 — 공유 파일을 바꾸지 않는다), 액션별 함수 7개. `ver` 는 문자열로 보낸다(JS number 는 `2.000` 의 소수 자릿수를 잃는다). `validate`·`save` 는 `grids: { rows: { rows: [...] } }` 를 빈 배열이라도 늘 보낸다(F9) |
| `$M/pages/dmc/codeItemEdit/types.ts` | 응답·요청 타입 |
| `$M/pages/dmc/codeItemEdit/code-tree.ts` | `buildCodeTree(rows)` — 시뮬레이터 `tree()` 규칙(§1.4-1). 반환 노드 `{value, name?, seq?, isCode, children}` 순서가 표시 순서다. `toTreeItems(nodes)` 는 shared `TreeNode` 로 바꾼다(라벨: 코드면 `· 값 이름`, 그룹이면 `값 (n건)`) |
| `$M/pages/dmc/codeItemEdit/combo.ts` | `comboSteps(rows, path)` — 시뮬레이터 `combo()` 규칙(§1.4-2). 항목 `{value, kind: "그룹"\|"코드"\|"그룹+코드", name?}` |
| `$M/pages/dmc/codeItemEdit/grid-state.ts` | 편집 상태 순수 함수: 서버 행 → 그리드 행, 셀 편집·추가·삭제 → 변경 목록(`rowStatus` ADDED·CHANGED·DELETED, 빈 문자열은 보내지 않음), 트리 노드 거르기(`code === sel || lvls.includes(sel)`), 노드 경로(`pathOf`), 닫힌 코드 보기 토글, 버전 표시 `v1.008` 형식(소수 세 자리, 04:275) |
| `$M/tsup.config.ts`(**수정**) | `"pages/dmc/codeItemEdit/page": "pages/dmc/codeItemEdit/page.tsx"` 한 줄 추가 |
| `$F/m-mcm/lib/generated/page-registry.ts`(**codegen 결과**) | 손으로 고치지 않는다. 포털 빌드·`predev` 가 만든 1줄 변경을 선례(`29af939`)처럼 함께 커밋한다 |
| `$M/tests/dmc/codeItemEdit/code-tree.test.ts` | §4.8 — 수용 기준 4 |
| `$M/tests/dmc/codeItemEdit/combo.test.ts` | §4.8 |
| `$M/tests/dmc/codeItemEdit/grid-state.test.ts` | §4.8 |
| `$M/tests/dmc/codeItemEdit/page-render.test.ts` | §4.8 (잠김·읽기 전용 화면 단언 포함) |
| `$M/tests/dmc/codeItemEdit/sim-fixtures.ts` | 시뮬레이터 입력 행(§1.4 의 STEEL_STD 8행·ORG 5행)과 **출력 전문 문자열**(§1.4 를 글자 그대로, 앞 공백 2칸 포함) |

### 생성 — 커밋 E: E2E

| 경로 | 내용 |
|---|---|
| `$F/e2e/mdm-codeItemEdit.spec.ts` | §4.9 (경로 고정 — 수용 기준 3) |
| `$F/e2e/fixtures/mdm-codeItemEdit.sql` | §4.10 사전 데이터 |
| `docs/mdm/tasks/TSK-06-03/screens/*.png` | E2E 스크린샷 6장(§4.9) |

### 생성·수정 — 커밋 F: 문서

| 경로 | 내용 |
|---|---|
| `docs/mdm/screens/codeItemEdit/codeItemEdit_기능설계서.md` | 기능설계서 1종(선례 F26, D12). 템플릿 `docs/guide/design/templates/기능설계서.template.md` 구조, 근거 칸은 04 행 번호·시안 행 번호·이 문서 절 번호. 내용은 §6.6·§6.8 의 화면 명세를 옮긴다 |
| `docs/guide/design/identifier-dictionary/01-modules-and-screens.md`(**수정**, §A.3.2 에 1행 추가) | `\| \`codeItemEdit\` \| — (To-Be only) \| \`mdm\` \| \`dmc\` \| \`codeItemEdit\` \| 2026-09-24 \| 코드 편집 — As-Is 없음(신규). TSK-06-03. 기능설계서 1종(\`docs/mdm/screens/codeItemEdit/\`) \|` |

### 변경하지 않음

- `docs/mdm/decisions.md` — 이 Task 의 결정은 이 문서 `## 담당자 확인 필요 결정` 에 둔다. 공용 결정 기록에 블록을 더하지 않는다(더해야 하면 임시 ID `D-TSK-06-03-<n>`).
- Flyway 마이그레이션(F1), `common.version.*`(package-private 유지), 리포지토리 5개(F7 — 쿼리는 `MasterCodeRows` 에 둔다), `MdmErrors`, `MdmOasisActionVocabularyTest`·`DmaBpmnActionTest`(dma 전용 목록), `e2e/fixtures/mdm-rbac-*.sql`, `mdm-shell-rbac-smoke.spec.ts`(dmc 폴더 가시성은 권한 없는 사용자에게만 부정 단언하므로 그대로 통과한다).

---

## 4. 테스트 전략

### 4.1 게이트 명령 (기준선 대비 신규 실패 0 + 총수 미감소)

아래 명령을 **글자 그대로** 쓴다. 전체 스위트는 `.claude/skills/dflow-dev/scripts/heavy.sh <명령>` 으로 감싸고, `HEAVY_BUSY`(exit 75)면 같은 명령을 다시 부른다.

```
1. cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain
   → 2337 tests / 0 failures (개수: find src/backend -path '*/build/test-results/*' -not -path '*mssqlMigrationTest*' -name 'TEST-*.xml' | xargs grep -h -o '<testsuite [^>]*' 의 tests/failures/errors 합산)
2. cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test
   → 27 files / 330 passed
3. cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint
   → pass
4. cd src/frontend && pnpm test:unit:shared
   → 23 files / 156 passed
5. python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
   → ERROR 0 / WARN 0 / INFO 29
```

5번: 검사기가 mdm 모듈을 스캔하지 않으므로(F20) 이 Task 로 INFO 수가 바뀌지 않을 것으로 본다. 바뀌면 이유를 Verify 기록에 적는다. 이 Task 가 새 시험을 더하므로 1·2 의 총수는 늘어야 한다(미감소가 게이트).

추가 점검(게이트 아님, 커밋 전): `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <바꾼 FE 파일>`, `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <바꾼 FE 파일>` 0건. `bpmn-tool validate src/backend/mdm/api/src/main/resources/services/dmc/codeItemEdit.bpmn` 오류 0. E2E 는 §4.11 절차로 Verify 가 mdm 전체 스펙을 한 번에 돈다.

### 4.2 순수 단위 시험 (`$LT/common/mastercode/`, 게이트 1)

**`MasterCodeItemChecksTest`** — 입력은 헤더(lvlCnt·라벨 10칸·sourceKind)와 V 적용 후 모습.
- H1 **04 샘플 + 시뮬레이터 저장 검사 4건**: STEEL_STD 8행(§1.3)을 V 모습으로 두고, 추가 행 `X-1 (KS, NULL, KS-3-CGCH)` → `LVL_GAP`, `X-2 (JIS, KS-3)` → `LVL_PARENT_MISMATCH`, `KS-3-CGCH-Z50 (KS, KS-3, KS-3-CGCH)` → 이슈 0, 코드 `KS-3` `(JIS)` → `LVL_PARENT_MISMATCH`. 이슈의 `itemKey` 는 코드, `field` 는 `lvl2`·`lvl3`·`code` 처럼 걸린 칸이다.
- H2 `LVL_BEYOND_CNT` 경계: lvlCnt 3 에서 lvl3 값은 통과, lvl4 값은 거부. lvlCnt 0 에서 lvl1 값은 거부.
- H3 `CODE_FORBIDDEN_CHAR`: 코드 `A B`·`A,B`·`A\tB` 거부, 계층 칸 값 `K S` 거부, `A-B` 통과. `CODE_REQUIRED`: 코드 null·빈 문자열 거부.
- H4 `ATTR_WITHOUT_LABEL`: attr01_name 만 있을 때 attr01 값 통과, attr02 값 거부, attr02 null 통과.
- H5 **검사 기준은 V 에 유효한 행**: 비교 행 목록에 V 모습만 넘기므로, 닫힌 옛 행(다른 앞 칸)은 판정에 끼지 않는다(서비스 시험 S12 가 DB 경로로 다시 본다).
- H6 **자기 코드는 비교에서 뺀다**: STEEL_STD 의 `KS-3-CGCH` 를 같은 경로로 이름만 바꾼 수정 행 → 이슈 0. `KS-3-CGCH` 의 경로를 `(JIS, JIS-3)` 로 바꾼 수정 행 → 자손 행의 lvl3 `KS-3-CGCH` 의 앞 칸 `(KS, KS-3)` 과 달라 `LVL_PARENT_MISMATCH`.
- H7 **검사 대상은 touched 행뿐**: V 모습에 lvlCnt 를 넘는 옛 행이 있어도 touched 가 아닌 한 이슈를 내지 않는다.

**`MasterCodeItemProjectionTest`**
- P1 ADDED 코드가 V 에 이미 있으면 `SEGMENT_OVERLAP`. 한 요청에 같은 코드 ADDED 둘이면 `SEGMENT_OVERLAP`.
- P2 CHANGED·DELETED 코드가 V 에 없으면 `CODE_NOT_FOUND`.
- P3 DELETED 뒤 같은 코드 ADDED(같은 요청) → 이슈 0, 결과 모습에 새 값.
- P4 적용 순서는 DELETED → CHANGED → ADDED 이다(요청 순서와 무관).
- P5 정규화: 빈 문자열 `""` 은 null 로 본다(이름·약칭·설명·계층·추가 칸). 코드는 트림하지 않는다(`" A"` 는 H3 에서 거부).

**`MasterCodeCategoryResolverTest`**
- R1 REGEX 는 **전체 일치**다: `8[0-9]` 에 `82` 는 해당, `182`·`820` 은 해당 없음(`find()` 변이를 잡는다).
- R2 대상 칸: `def_target=LVL1`, 식 `KS` → STEEL_STD 에서 lvl1 이 KS 인 6행만. 대상 칸이 NULL 이면 해당 없음이고 근거 `TARGET_NULL`.
- R3 TABLE: CATE_ITEM 과 V 의 코드의 교집합. V 에 없는 코드의 CATE_ITEM 은 결과에서 빠지고 경고 `CATE_ITEM_CODE_MISSING`(2-1)에 그 코드가 실린다.
- R4 결과가 비면 경고 `CATEGORY_EMPTY`(2-2).
- R5 근거 종류: REGEX 는 `MATCH`·`NO_MATCH`·`TARGET_NULL` + 대상 칸 값, TABLE 은 `MEMBER`·`NOT_MEMBER`.
- R6 정규식 문법 오류는 예외 대신 `invalidExpression=true` 와 빈 결과를 돌려준다.

### 4.3 선분 조작 시험 (`MasterCodeItemSegmentOpsSqliteTest`, 게이트 1)

`@SpringBootTest(webEnvironment=MOCK) @ActiveProfiles("local")`, `@TempDir`, `@Import` 로 `@Primary MutableClock`(2026-09-03 00:00 KST, F15)과 가짜 사용자(`kim`, `MDM_STEWARD`). 서비스는 `MasterCodeSegmentService` **인터페이스 타입**으로 주입해 부른다(계약 경유 증명). 트랜잭션 없이 부르고 매 시험 `clear()` 후 시드한다. 버전 비교 단언은 `compareTo` 로 한다.

| # | 시나리오 | 단언 |
|---|---|---|
| G1 | 기본 시드: `M` 1.000 RELEASED(행 `A`·`B`·`C` from 1.000), 1.001 DRAFT. `addItem(1.001, "D", v)` | `D@1.001` to 9999, 다른 행 불변 |
| G2 | `changeItem(1.001, "A", v')` | `A@1.000.to == 1.001`, 옛 값 그대로. `A@1.001` 새 값·to 9999 |
| G3 | G2 뒤 `changeItem(1.001, "A", v'')` | A 행 2개뿐, `A@1.001` 이 v'' 로 갱신 |
| G4 | `removeItem(1.001, "B")` | `B@1.000.to == 1.001`, 행 수 불변 |
| G5 | `addItem(1.001, "D")` 뒤 `removeItem(1.001, "D")` | D 행 0개(닫지 않고 지움) |
| G6 | `changeItem(A)` 뒤 `removeItem(A)` | `A@1.001` 없음, `A@1.000.to == 1.001`(열지 않음) |
| G7 | 되돌리기 추가: G1 뒤 `revert(ITEM, D)` | D 행 0개 |
| G8 | 되돌리기 수정: G2 뒤 `revert(ITEM, A)` | `A@1.001` 없음, `A@1.000.to == 9999` |
| G9 | 되돌리기 삭제: G4 뒤 `revert(ITEM, B)` | `B@1.000.to == 9999` |
| G10 | 되돌릴 변경 없음: `revert(ITEM, C)` | MDM021, 행 불변 |
| G11 | 코드 삭제 연쇄: TABLE `T1`·`T2`(CATE_ITEM `B@1.000`), `T3`(CATE_ITEM `B@1.001` — 이 DRAFT 에서 넣은 행), REGEX `R`. `removeItem(1.001, "B")` | 돌려준 목록 `["T1","T2","T3"]`(정렬·중복 없음), T1·T2 의 `B` 행 to 1.001, T3 의 `B@1.001` 행은 지워짐, 다른 코드의 CATE_ITEM 불변 |
| G12 | 코드 **수정**은 연쇄하지 않음: `changeItem(B)` | CATE_ITEM 불변 |
| G13 | 삭제 되돌리기 연쇄(D4): ① G11 뒤 `revert(ITEM, B)` ② G11 과 같되 카테고리 `T2` 의 CATE 행을 시드 때 `to 1.001` 로 닫아 둔 뒤 `revert(ITEM, B)` | ① T1·T2 의 `B@1.000` 행 to 9999(T3 의 `B@1.001` 은 지워졌으므로 되살리지 않는다) ② T1 의 `B` 행만 to 9999, T2 의 `B` 행은 to 1.001 그대로 |
| G14 | `revert(CATE_ITEM, T1, B)` 단독 | CATE_ITEM 규칙(추가·삭제)대로 되돌린다 |
| G15 | `revert(CATE, T1, null)` | `UnsupportedOperationException`(06-04 몫, D3) |
| G16 | **DRAFT 전용**: 1.000 RELEASED 에 `addItem`·`changeItem`·`removeItem`·`revert` | 모두 MDM002, 행 불변. CANCELLED 버전(1.002 CANCELLED 시드)에도 MDM002 |
| G17 | **ROW_VERSION 불변**: G1~G14 를 모두 돈 뒤 | `TB_MDM_CODE_VER(M,1.001).ROW_VERSION` 이 시드 값 그대로 |
| G18 | `viewAt(1.000)`·`viewAt(1.001)` | `from <= V < to` 인 ITEM·CATE·CATE_ITEM 만. to_ver = V 인 행은 V 모습에 없다 |
| G19 | 값이 같은 수정(I25): `changeItem(A, A 의 현재 값)` | 행 수·to_ver 불변. `A@1.001` 을 옛 값으로 되돌리는 수정 → `A@1.001` 삭제, `A@1.000.to == 9999` |
| G20 | 미구현 위임: `createBaseCategory`·`fillFrom`·`addCategory` 등 7개 | `UnsupportedOperationException`, 메시지에 담당 Task ID |

### 4.4 원천 샘플 시험 (`CodeItemEditSampleDataTest`, 게이트 1 — 수용 기준 1)

`CodeItemEditService` 빈을 직접 부른다. 시계 2026-09-03 00:00 KST, 사용자 `kim`(MDM_STEWARD). 기대값은 §1.3 을 글자 그대로 옮긴 것이다.

- SD1 **PROC_CD 코드 삭제**: `seedProcCdBeforeDraftEdits` → `save(PROC_CD, "2.000", rowVersion 0, rows=[DELETED 82, DELETED 83])`. 표를 직접 읽어 단언: ITEM `1P 1.000-9999 PLTCM PLTCM 11`, `82 1.000-2.000 2CGL CGL 21`, `83 1.000-1.001 3CGl CGL 22`, `83 1.001-2.000 3CGL CGL 22`, `2P 1.001-9999 PLTCM2 PLTCM 12`(5행 정확히), CATE 4행 불변, CATE_ITEM `MAJOR 1P 1.000-9999`, `MAJOR 82 1.000-2.000`, `MAJOR 2P 1.001-9999`, `COLD_MILL 1P 1.000-9999`, `COLD_MILL 2P 1.001-9999`(5행 정확히). 응답의 닫힌 카테고리: 82 → `["MAJOR"]`, 83 → `[]`. ROW_VERSION 0 → 1.
- SD2 **모습**: `view(PROC_CD, "1.001")` 의 코드 = `{1P, 82, 83, 2P}` 이고 83 의 이름이 `3CGL`. `view(PROC_CD, "2.000")` 의 코드 = `{1P, 2P}`. `view(PROC_CD, "1.000")` 의 83 이름이 `3CGl`.
- SD3 **해석**: `preview(PROC_CD, "1.001", c)` 의 해당 코드 집합 = BASE `{1P,2P,82,83}`, COATING `{82,83}`, MAJOR `{1P,2P,82}`, COLD_MILL `{1P,2P}`. `preview(PROC_CD, "2.000", c)` = BASE `{1P,2P}`, COATING `{}` + 경고 `CATEGORY_EMPTY`, MAJOR `{1P,2P}`.
- SD4 **diff(V = 2.000)**: `view(PROC_CD, "2.000")` 의 닫힌 행 = ITEM `82@1.000`, ITEM `83@1.001`, CATE_ITEM `MAJOR 82`. 추가·수정 표시 행 0.
- SD5 **경미 수정과 닫기만 한 키**: SD1 뒤 `patch(PROC_CD, "82", "1.000", name "2CGL-P", …)` 는 통과한다(DRAFT 가 82 를 닫기만 했다, 04:544). `patch(PROC_CD, "1P", "1.000", …)` 도 통과한다.
- SD6 **STEEL_STD 저장 검사**(04:1148 + sim 4번째): `seedSteelStd` → `validate(STEEL_STD, "1.001", rows=[ADDED X-1 (KS,NULL,KS-3-CGCH)])` 의 이슈 = `LVL_GAP`, `[ADDED X-2 (JIS,KS-3)]` = `LVL_PARENT_MISMATCH`, `[ADDED KS-3-CGCH-Z50 (KS,KS-3,KS-3-CGCH)]` = 없음, `[ADDED KS-3 (JIS)]` = `LVL_PARENT_MISMATCH`. 같은 입력의 `save` 는 첫째·둘째·넷째를 MDM022 로 거부하고(ROW_VERSION 0 그대로), 셋째(Z50)는 저장한다. 거부 셋을 먼저 보내고 Z50 을 마지막에 보내면 모두 `rowVersion 0` 으로 부를 수 있다(Z50 저장 뒤 ROW_VERSION 은 1).
- SD7 **EQP_CD**: `view(EQP_CD, …)` 의 `editable=false`, `patchable=false`. `save`·`patch` 는 거부(MDM022 `SOURCE_EXTERNAL`, MDM023 `SOURCE_EXTERNAL`).

### 4.5 서비스 시험 (`CodeItemEditServiceSqliteTest`, 게이트 1)

| # | 시나리오 | 단언 |
|---|---|---|
| S1 | `search()` | 마루 코드 목록(ID 오름차순, `maruCodeId·maruCodeName·sourceKind·status·lvlCnt`). 키워드는 ID·이름 부분 일치(대소문자 무시) |
| S2 | `view` 기본 버전 | DRAFT 가 있으면 DRAFT, 없으면 CANCELLED 가 아닌 가장 큰 ver. `versions` 는 ver 내림차순, 표시 `v1.001` |
| S3 | `view` DRAFT 소유자 | `editable=true`, `rowVersion` 은 DB 값. 소유자 아닌 사용자 → `editable=false`. 미적용 2개 → `editable=false` + `warning="MULTIPLE_UNAPPLIED"` |
| S4 | `view` RELEASED·CANCELLED(수용 기준 2) | `editable=false`. RELEASED 는 `patchable=true`, CANCELLED 는 `patchable=false`. 행마다 `change` = `ADDED`·`CHANGED`(옛 값 `prev` 포함)·`NONE`, 닫힌 행 목록 `closed` |
| S5 | `view` 행 부가 정보 | 행마다 `tableCategories`(V 에 유효한 열린 CATE_ITEM 의 cate_id 목록 — 화면의 "카테고리 n개에서 함께 빠집니다"), RELEASED 행마다 `patchBlocked`(D8) |
| S6 | `view` 헤더 | `lvlCnt`, 라벨이 있는 추가 컬럼만 `[{no:1, label:"인장강도"}]`, V 에 유효한 카테고리 `[{cateId, cateName, defKind}]` |
| S7 | 저장 거부 뒤 불변(서비스 경로) | 검사 이슈가 있으면 MDM022 를 던지고, **던지기 전에 `beginDraftWrite` 를 부르지 않았으므로** 트랜잭션 없이 불러도 ROW_VERSION·행이 그대로다 |
| S8 | 저장 정상 | ROW_VERSION 정확히 +1(선분 서비스는 올리지 않는다), 응답 `rowVersion` = 새 값 |
| S9 | 저장 전제 | 소유자 아님 MDM003, 낡은 rowVersion MDM001, RELEASED 버전(소유자 `kim`·rowVersion 일치로 시드) MDM002, 미적용 2개 MDM007, 빈 rows MDM021 |
| S10 | `revert` | 전제는 S9 와 같다. 정상이면 ROW_VERSION +1. 되돌린 결과가 계층 검사에 걸리면 MDM022 |
| S11 | `validate` | 이슈 목록을 성공 응답으로 돌려준다. ROW_VERSION·행 불변. 소유자·상태는 보지 않는다(읽기 전용 검사) |
| S12 | 검사 기준은 V 에 유효한 행(D10) | lvlCnt 2, 1.000 RELEASED 에 코드 `Q`(경로 `X, G`)만 있고 DRAFT 1.001 이 `Q` 를 닫아 둔 상태(`Q@1.000.to = 1.001`)에서, 1.001 에 경로 `Y, G` 의 새 코드 추가 → 이슈 0(닫힌 `Q` 의 `G` 는 비교하지 않는다) |
| S13 | 경미 수정 정상 | 이름·약칭·순서·설명만 바뀐다. `code`·`from_ver`·`to_ver`·lvl1-5·attr01-10 은 전후 동일(수용 기준 5). ROW_VERSION·`LAST_CHG_SEQ` 불변(D7) |
| S14 | 경미 수정 거부(수용 기준 6) | DRAFT 1.001 이 `A` 를 수정(`A@1.001` 있음) → `patch(A, 1.000)` MDM023 + 메시지에 `DRAFT에서 고치세요`. DRAFT 가 `B` 를 닫기만 함 → `patch(B, 1.000)` 통과 |
| S15 | 경미 수정 대상 아님 | from_ver 가 DRAFT 인 행 `patch(D, 1.001)` → MDM023 `PATCH_NOT_RELEASED`. 없는 키 → MDM021 |
| S16 | 경미 수정 미적용 2개 | DRAFT + apply_from > now 인 RELEASED → MDM007. **경계**: apply_from == now 인 RELEASED + DRAFT → 통과(적용된 것으로 본다, F5) |
| S17 | 경미 수정 역할 | 사용자 역할에 MDM_STEWARD 가 없으면 MDM013 |

### 4.6 OASIS 경로 시험 (`CodeItemEditOasisHttpTest`, 게이트 1)

`DmaOasisHttpTest` 모양(`RANDOM_PORT`, `java.net.http.HttpClient`, `POST http://127.0.0.1:{port}/oasis/codeItemEdit/{action}`, 헤더 `X-Client-Key`·`X-Authenticated-User: kim`·`X-Authenticated-Role: MDM_STEWARD`). `@Primary` Clock 2026-09-03.
- O1 `save` 정상: `meta.success=true`, `data.result.rowVersion == 1`, DB ROW_VERSION 1.
- O2 **거부된 저장은 아무것도 바꾸지 않는다**: 계층 위반 행 → `meta.success=false`, `meta.message` 가 `코드 저장 검사를 통과하지 못했습니다` 로 시작하고 이슈 코드 `LVL_PARENT_MISMATCH` 를 담는다. DB ROW_VERSION·ITEM 행 불변.
- O3 **OASIS 트랜잭션 롤백**: 선분 서비스 적용 뒤 실패를 강제한다(SQLite 트리거 `BEFORE INSERT ON TB_MDM_CODE_ITEM WHEN NEW.CODE='BOOM' SELECT RAISE(ABORT,'boom')` — `DmaOasisHttpTest.P8` 선례). `[DELETED A, ADDED BOOM]` 저장 → `meta.success=false`, ROW_VERSION 불변, `A` 행 불변(beginDraftWrite 의 증가와 앞선 닫기가 함께 되돌아간다).
- O4 낡은 rowVersion → `meta.message` 가 `다른 사용자가 수정했습니다` 로 시작.
- O5 **경미 수정 잠김**: `params` 에 `lvl1:"X"`, `attr01:"Y"`, `toVer:"1.000"` 을 더 넣어 `execute` 호출 → 성공, DB 의 lvl1·attr01·to_ver 불변, 이름만 바뀜.
- O6 그리드 생략: `save` 를 `grids` 없이 부르면 실패한다는 사실을 문서화하는 시험(F9, FE `api.ts` 가 빈 그리드를 늘 보내는 이유).

### 4.7 BPMN 계약 시험 (`DmcBpmnActionTest`, 게이트 1)

`services/dmc/codeItemEdit.bpmn` 을 XML 로 파싱한다(스프링 없음).
- B1 분기 이름 집합 = `{search, view, compare, validate, save, restore, execute}` 정확히, 모두 `MdmActions` 상수.
- B2 `search`·`view`·`compare` 는 `MdmPermissions.READ_ACTIONS` 에 있다(STD_ADMIN 이 읽기 화면을 쓸 수 있다). 나머지 넷은 READ 에 없다.
- B3 serviceTask 마다 `camunda:class="codeItemEditService"`, `output=result`, `dto` 는 `com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.` 로 시작하고 클래스가 존재, `grid` 속성 없음, flow 에 `conditionExpression` 없음.
- B4 action → method 대응: `search→search`, `view→view`, `compare→preview`, `validate→validate`, `save→save`, `restore→revert`, `execute→patch`. 각 method 가 `CodeItemEditService` 의 public 메서드로 있고 `validate`·`save` 의 둘째 파라미터 이름이 `rows` 다(`-parameters` 컴파일 전제, 리플렉션 `Parameter.getName()`).
- B5 process id = `codeItemEdit` = 파일명.

### 4.8 FE 단위 시험 (vitest, 게이트 2·3)

- **`code-tree.test.ts`(수용 기준 4)**: `sim-fixtures.ts` 의 STEEL_STD 8행과 ORG 5행으로 `buildCodeTree` 를 만들고, 시험 도우미 `toSimLines(tree)`(§1.4-1 의 줄 모양: 깊이마다 공백 3칸, 마커 2글자, `"  (" + 이름 + ")"`)로 그린 줄 목록이 시뮬레이터 출력의 해당 블록(각 줄 앞 2칸을 뗀 것)과 **글자 단위로 같다**. `toSimLines` 는 시험 파일 안에만 둔다(제품 코드에 시험 전용 출력기를 두지 않는다).
- **`combo.test.ts`**: `comboSteps` 결과를 `값(종류, 이름)` 문자열로 이어 시뮬레이터 콤보 줄과 비교한다 — STEEL_STD 5단계(`(없음)`·`KS`·`KS-3`·`KS-3-CGCH`·`JIS`), ORG 3단계(`(없음)`·`PH`·`PH-A`). 시뮬레이터가 이름을 찍지 않는 ORG 줄은 `값(종류)` 로 비교한다.
- **`grid-state.test.ts`**: 셀 편집 → CHANGED 한 건, 새 행 → ADDED, 기존 행 삭제 → DELETED, 새 행 삭제 → 변경 목록에서 사라짐. 빈 문자열 칸은 페이로드에서 빠진다. 트리 노드 `KS-3` 로 거르면 5행(`KS-3-CGCC`·`KS-3-CGCD`·`KS-3-CGCH`·`KS-3-CGCH-Z12`·`KS-3-CGCH-Z27`), 노드 `KS-3-CGCH` 는 3행. `pathOf("KS-3", rows) = ["KS","KS-3"]`, `pathOf("KS-9", rows) = ["KS","KS-9"]`(코드 노드는 자기 경로 + 자기 값). 버전 표시 `fmtVer("1.008") = "v1.008"`, `fmtVer("2") = "v2.000"`.
- **`page-render.test.ts`**(fetch 스텁): ① 화면 id 꼬리표 `codeItemEdit`, breadcrumb `마루 MDM > 마스터코드 > 코드 편집`. ② 코드 0건 응답 → 빈 상태 문구 `보일 코드가 없습니다`. ③ DRAFT(`editable=true`) → `저장`·`코드 추가` 버튼 있음, 기존 행의 코드 칸 편집 불가, 새 행의 코드 칸 편집 가능. ④ **RELEASED(`editable=false`, `patchable=true`) → `저장`·`코드 추가` 버튼 없음, 그리드 편집 불가, 경미 수정 패널에서 코드·계층·추가 컬럼 입력이 `disabled`, 이름·약칭·순서·설명만 입력 가능**(수용 기준 2·5). ⑤ `patchBlocked` 행 선택 → `경미 수정 저장` 비활성 + `DRAFT에서 고치세요`. ⑥ CANCELLED → 경미 수정 패널 없음.

### 4.9 화면 스모크 넷 — `src/frontend/e2e/mdm-codeItemEdit.spec.ts`

사용자 `SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward"`(DMC 에서 CONFIRM 세트 — 표준 관리자는 READ 라 저장이 403). `BASE_URL = SMOKE_MCM_BASE_URL`(기본값 5100 은 쓰지 않는다), `test.describe.configure({mode:"serial"})`, `test.setTimeout(150_000)`, 스크린샷 `path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-06-03/screens", name)` fullPage. 머리 주석: "새 mdm.db + `mdm-codeItemEdit.sql` 픽스처 전제, 같은 DB 로 재실행 불가". 실행마다 다른 접미사 `SUFFIX = Date.now().toString(36).toUpperCase()`.

| # | 절차 | 단언 | 넷·수용 기준 · 스크린샷 |
|---|---|---|---|
| T1 | 로그인 → 사이드바 `마루 MDM` → `마스터코드` → `코드 편집` | breadcrumb `마루 MDM > 마스터코드 > 코드 편집`, 마루 코드 선택기 보임 | 넷1, 수용 3 · `dmc-codeItemEdit-open.png` |
| T2 | 마루 코드 `E2E_EMPTY` 선택 → 조회, 이어서 `E2E_PROC` 선택 → 조회 | 앞의 조회는 `보일 코드가 없습니다`(`code-grid-empty`), 뒤의 조회는 그리드에 `1P`·`82`·`83` 이 서버 데이터로 보이고 버전 선택기 기본값이 `v2.000 DRAFT` | 넷2 · `dmc-codeItemEdit-empty.png` |
| T3 | `E2E_PROC` v2.000 → `코드 추가` → 코드 `T<SUFFIX>`, 이름 `E2E 추가` → `저장` | 토스트 `저장했습니다`, 다시 읽은 그리드에 `T<SUFFIX>` 행과 `추가` 배지, row_version 표시 `1` | 넷3 · `dmc-codeItemEdit-saved.png` |
| T4 | `코드 추가` → 코드 `A B` → `저장` | 오류 모달에 `코드 저장 검사를 통과하지 못했습니다`, 그 행에 이슈 표시(`CODE_FORBIDDEN_CHAR` 문구) | 넷4 · `dmc-codeItemEdit-error.png` |
| T5 | 버전 `v1.000 RELEASED` 선택 | `저장`·`코드 추가` 버튼 없음. `83` 행 선택 → 패널 코드 입력 disabled → 이름 `3CGL-E2E` → `경미 수정 저장` → 그리드 이름 갱신. `82` 행 선택 → `경미 수정 저장` 비활성 + `DRAFT에서 고치세요` | 수용 2·5·6 · `dmc-codeItemEdit-patch.png` |
| T6 | 마루 코드 `E2E_STEEL` → `트리 보기` 탭 | 트리 뿌리 `JIS`·`KS`. `KS-3` 노드 선택 → `이 노드로 편집` → 코드 편집 탭, 그리드 5행, 거르기 표시 `KS-3 아래` | 수용 4(화면) · `dmc-codeItemEdit-tree.png` |

`data-testid`(Build 는 이 이름을 그대로 쓴다): `code-pick-keyword`·`code-pick-list`·`code-pick-{id}`·`code-current`, `code-ver-select`, `code-closed-toggle`, `code-row-version`, `code-grid`, `code-grid-empty`, `code-add`, `code-save`, `code-row-issue-{code}`, `code-tab-grid`, `code-tab-tree`, `code-tree`, `code-tree-to-grid`, `code-filter-chip`, `code-filter-clear`, `code-preview`, `code-preview-cate`, `code-preview-mode`, `patch-panel`, `patch-code`, `patch-name`, `patch-alter-name`, `patch-seq`, `patch-description`, `patch-save`, `patch-blocked`.

화면 스모크 넷 판정: 넷1 적용(T1), 넷2 적용(T2 — 빈 상태와 서버 데이터), 넷3 적용(T3), 넷4 적용(T4 — `save` 가 `meta.success=false` 를 돌려주는 경로).

### 4.10 E2E 사전 데이터 `src/frontend/e2e/fixtures/mdm-codeItemEdit.sql`

INSERT 만(DELETE 없음). mdm 기동(Flyway 적용) 뒤에만 넣는다. RELEASED 버전 행은 `CK_TB_MDM_CODE_VER_APPLY` 때문에 `APPLY_FROM`·`APPLY_TO` 를 둘 다 채운다. 원천 MDM 이므로 `SOURCE_SYSTEM` 은 NULL. 감사 칼럼 `C_USR_ID='e2e-fixture'`, `C_PGM_ID='mdm-codeItemEdit.sql'`, `VER=0`(VER·RECV 표는 `AUD_VER=0`). 업무 일시는 19자 TEXT. 소유자는 `e2e_mdm_steward`, 모든 DRAFT 의 ROW_VERSION 0, VER_KIND 는 정수 버전 MAJOR·그 밖 MINOR.

| 마루 코드 | 헤더 | 버전 | 행 |
|---|---|---|---|
| `E2E_PROC` | 공정 코드(E2E), MDM, lvl_cnt 0, attr01_name `공장` | 1.000 RELEASED `2024-01-01 00:00:00` → `9999-12-31 00:00:00`, 2.000 DRAFT | ITEM `1P@1.000-9999 PLTCM/PLTCM/11 attr01 냉연`, `82@1.000-2.000 2CGL/CGL/21 도금`, `82@2.000-9999 2CGL/CGL2/21 도금`(DRAFT 가 82 를 수정 — T5 의 거부 대상), `83@1.000-9999 3CGL/CGL/22 도금`. CATE `BASE`(REGEX `.*` CODE, 전체), `COATING`(REGEX `8[0-9]` CODE, 도금 공정), `MAJOR`(TABLE, 주요 공정), 모두 1.000-9999. CATE_ITEM `MAJOR 1P`·`MAJOR 82` 1.000-9999 |
| `E2E_STEEL` | 강종 규격(E2E), MDM, lvl_cnt 3, attr01_name `인장강도` | 1.000 RELEASED `2026-01-01 00:00:00` → `9999-12-31 00:00:00`, 1.001 DRAFT | §1.3 STEEL_STD 8행, CATE `BASE` |
| `E2E_EMPTY` | 빈 코드(E2E), MDM, lvl_cnt 0 | 1.000 DRAFT | CATE `BASE` 만, ITEM 없음 |

### 4.11 E2E 서버 절차 (TSK-04-02 「E2E 서버 절차」를 이 Task 값으로 옮김)

`be-run.sh`·`fe-run.sh` 는 쓰지 않는다. 포트는 이웃 워커가 쓴 18401·18402·15401·18305·18398·15305 를 피해 **mcm BE 18603 · mdm BE 18696 · FE 15603** 을 기본으로 하고, 시작할 때 셋 다 비어 있는지 확인한다(차 있으면 186xx·156xx 안에서 다른 번호). 서버를 띄우기 직전에 PC 전역 슬롯을 잡고 끝나면 반드시 푼다.

```bash
W=/Users/jji/project/dmes-standard/dflow-f93163b8
SP=<실행자의 scratchpad>
J=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
# 0) 빈 포트 확인 — 셋 다 출력이 없어야 한다
lsof -iTCP:18603 -sTCP:LISTEN; lsof -iTCP:18696 -sTCP:LISTEN; lsof -iTCP:15603 -sTCP:LISTEN
# 0b) 슬롯 — HEAVY_ACQUIRED 를 확인한다(HEAVY_BUSY 면 다시 부른다)
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh acquire e2e-TSK-06-03
# 1) 새 DB 로 시작 — 지우지 않고 옮긴다(이 spec 은 행을 만들어 같은 DB 로 재실행할 수 없다)
mkdir -p $W/src/backend/data
[ -f $W/src/backend/data/mcm.db ] && mv $W/src/backend/data/mcm.db $SP/mcm.db.$(date +%s)
[ -f $W/src/backend/data/mdm.db ] && mv $W/src/backend/data/mdm.db $SP/mdm.db.$(date +%s)
# 2) mcm 백엔드 — 로그의 sqlite 경로가 $W/src/backend/data/mcm.db 인지 확인(아니면 즉시 중단)
cd $W/src/backend/mcm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18603 --mcm.bff.invalidate-role-url=http://127.0.0.1:15603/api/mcm/internal/cache/invalidate-role --cactus.notify.publish-url=http://127.0.0.1:18603/notify/publish' > $SP/be-mcm.log 2>&1 &
echo $! > $SP/be-mcm.pid   # 셸 변수는 Bash 호출 사이에 남지 않으므로 PID 는 파일로 남긴다
# 3) mdm 백엔드 — SQLite 는 $W/src/backend/data/mdm.db
cd $W/src/backend/mdm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18696' > $SP/be-mdm.log 2>&1 &
echo $! > $SP/be-mdm.pid
# 4) 두 로그에 "Started ... in" 확인 뒤 mcm 시드 대조와 시험 사용자
cd $W/src/frontend && sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-seed-check.sql | diff - e2e/fixtures/mdm-rbac-seed-check.expected.txt   # 출력 없음 = 통과
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-users.sql
sqlite3 $W/src/backend/data/mcm.db "SELECT ROLE_ID, OBJECT_ID, PERMISSION_ID FROM TB_MCM_SEC_ROLE_MAPPING WHERE OBJECT_ID='codeItemEdit' ORDER BY ROLE_ID;"
#    기대: MDM_STD_ADMIN|codeItemEdit|PERM_MDM_READ / MDM_STEWARD|codeItemEdit|PERM_MDM_CONFIRM / SYSADMIN|codeItemEdit|PERM_ALL
# 4b) mdm 사전 데이터 — mdm 기동(Flyway 적용) 뒤에만. 전체 스위트가 columnMng 스펙도 돌리므로 그 픽스처도 넣는다(TSK-04-04 §3.6)
( cd $W/src/frontend && sqlite3 $W/src/backend/data/mdm.db < e2e/fixtures/mdm-columnMng-dict.sql )
( cd $W/src/frontend && sqlite3 $W/src/backend/data/mdm.db < e2e/fixtures/mdm-codeItemEdit.sql )
sqlite3 $W/src/backend/data/mdm.db "SELECT COUNT(*) FROM TB_MDM_TERM; SELECT COUNT(*) FROM TB_MDM_DOMAIN;"   # 5 / 4 기대
sqlite3 $W/src/backend/data/mdm.db "SELECT COUNT(*) FROM TB_MDM_CODE WHERE MARU_CODE_ID LIKE 'E2E_%'; SELECT COUNT(*) FROM TB_MDM_CODE_ITEM;"   # 3 / 12 기대
#    mdm-domainMng.spec.ts 는 사전 데이터가 없다(스펙 머리 주석: rbac 사용자만 전제)
# 5) 포털 — m-mdm 을 먼저 build
cd $W/src/frontend && pnpm build:libs
cd $W/src/frontend/m-mcm && AUTH_SECRET=$(openssl rand -hex 32) NEXTAUTH_URL=http://127.0.0.1:15603 OIDC_ISSUER=http://127.0.0.1:15603 \
  MCM_WAS_URL=http://127.0.0.1:18603 MDM_WAS_URL=http://127.0.0.1:18696 BACKEND_API_URL=http://127.0.0.1:18603 \
  BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026 pnpm exec next dev --turbopack --port 15603 > $SP/fe.log 2>&1 &
echo $! > $SP/fe.pid
# 6) mdm e2e 전체를 한 번에(Verify 의 전체 스위트 변이 검증도 이 줄). --workers=1(SQLITE_BUSY 방지)
cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15603 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  $W/.claude/skills/dflow-dev/scripts/heavy.sh pnpm exec playwright test e2e/mdm-shell-rbac-smoke.spec.ts e2e/mdm-sample-smoke.spec.ts e2e/mdm-unitMng.spec.ts e2e/mdm-termMng.spec.ts e2e/mdm-domainMng.spec.ts e2e/mdm-columnMng.spec.ts e2e/mdm-codeItemEdit.spec.ts --workers=1
# 7) 부산물 복원 — 다른 Task 스크린샷·next-env.d.ts·test-results 를 되돌린다. TSK-06-03/screens/*.png 는 커밋한다
cd $W && /usr/bin/git status --porcelain docs/mdm/tasks/ src/frontend   # 바뀐 경로를 먼저 본다
cd $W && /usr/bin/git checkout -- docs/mdm/tasks/TSK-01-02/screens docs/mdm/tasks/TSK-01-03/screens src/frontend/m-mcm/next-env.d.ts   # + 위에서 바뀐 것으로 보인 다른 Task 의 screens 폴더(TSK-04-02·04-03·04-04 등)
cd $W && /usr/bin/git status --porcelain docs/mdm/tasks/ src/frontend   # TSK-06-03/screens/*.png(와 page-registry.ts codegen 1줄)만 남아야 한다
# 8) 정리 — 기록한 PID 먼저, 그다음 자기 포트 리스너만. 전역 gradlew --stop·pkill·killall·pgrep -f 금지
kill $(cat $SP/fe.pid) $(cat $SP/be-mdm.pid) $(cat $SP/be-mcm.pid)
for p in 15603 18696 18603; do pid=$(lsof -tiTCP:$p -sTCP:LISTEN); [ -n "$pid" ] && kill $pid; done
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh release
```

- 6) 은 0b) 에서 이 세션이 이미 슬롯을 쥐었으므로 `heavy.sh` 로 감싸도 새 슬롯을 기다리지 않고 `HEAVY_REUSE` 로 같은 슬롯을 쓴다.
- 7) 의 복원 대상은 실행 뒤 `git status` 로 실제로 바뀐 다른 Task 폴더만 고른다. 없는 경로를 checkout 하면 오류가 나므로 존재하는 경로만 넘긴다. 파일 glob(`*.png`) 대신 폴더 경로를 넘긴다(zsh 에서 매치가 없으면 확장이 실패한다). `src/frontend/test-results/**` 같은 추적 파일 변경이 남으면 `git restore` 로 되돌린다.
- E2E 가 성공·실패·중단 어느 쪽으로 끝나도 8) 을 반드시 실행한다. 서버를 켜 둔 채 Phase 를 넘기지 않는다.
- mdm 백엔드 코드를 바꾸면 mdm 만 다시 띄우되 mdm.db 를 다시 옮기고 4b 를 다시 한다. DataInitializer 를 바꾸면 mcm 을 새 DB 로 다시 띄우고 4) 를 다시 한다(BFF 권한 캐시 60초, `UserPermCache` 10분).
- 통과 기준: 넘긴 mdm 스펙 전부 passed, skipped·failed 0, 시드 대조 `diff` 출력 없음.

---

## 5. 수용 기준 매핑

| # | 수용 기준(spec) | 서버 검증 | 화면 검증 |
|---|---|---|---|
| AC1 | 04 「샘플 데이터」 저장 검사 결과 일치 | `CodeItemEditSampleDataTest` SD1~SD7(§1.3 을 글자 그대로), `MasterCodeItemChecksTest` H1 | — |
| AC2 | RELEASED·CANCELLED 는 읽기 전용 diff | S4(`editable=false`, change·prev·closed), SD4, G16(선분 서비스 MDM002), S9(저장 MDM002) | page-render ④⑥, E2E T5 |
| AC3 | 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-codeItemEdit.spec.ts` 가 통과한다 | 메뉴 시드(커밋 C), `DmcBpmnActionTest` | E2E T1~T6, §4.11 |
| AC4 | `sql/04-hier-tree-sim.py` 트리 결과와 일치 | 저장 검사 쪽은 H1(시뮬레이터 4건) | `code-tree.test.ts`(트리 전문), `combo.test.ts`(콤보 전문), E2E T6 |
| AC5 | 코드·계층·attr 값은 잠김 | S13, O5(추가 파라미터 무시) | page-render ③④, E2E T5 |
| AC6 | DRAFT 가 같은 키를 고쳤으면 거부 | S14(거부 + 닫기만 한 키 허용), SD5 | page-render ⑤, E2E T5 |

spec 요구사항 줄별 매핑: 선분 추가·수정·삭제·되돌리기·연쇄 닫기 → G1~G14·G19, 동적 열·닫힌 코드 보기 → S4·S6·page-render, 낙관적 잠금 → S9·O4, 저장 검사 → H1~H7·P1~P5·S12, 트리(접기·펴기, 이 노드로 편집, 필터 칩) → grid-state·code-tree·T6, 미리보기(콤보/목록·근거) → R1~R6·SD3·combo, RELEASED in-place 수정 → S13~S17·O5·T5.

---

## 6. 상세 명세

### 6.1 공통 모양

- 버전 문자열: 요청·응답의 버전은 문자열이다(`"2.000"`). 서버는 `new BigDecimal(s)` 로 읽어 `setScale(VersionTarget.MASTER_CODE.versionScale())` 한다. 응답은 `toPlainString()`(scale 3).
- 행 값 모양(요청 `rows` 원소·응답 행 공통 키): `code, name, alterName, seq, description, lvl1..lvl5, attr01..attr10`. 요청 원소에는 `rowStatus: "ADDED"|"CHANGED"|"DELETED"` 가 더 붙는다. DELETED 는 `code` 만 본다. CHANGED 는 **행 전체 값**을 보낸다(부분 갱신이 아니다).
- 계약 `MasterCodeItemValues` 변환: `lvls` 는 길이 5, `attrs` 는 길이 10 의 리스트(원소 null 허용, 06-01 계약 Javadoc 의 "길이 검사는 구현이 한다" — 길이가 다르면 `IllegalArgumentException`).

### 6.2 선분 조작 (`MasterCodeItemSegmentOps`)

공통:
- `requireDraft(ref)` — `MdmCodeVer` 를 읽어 없으면 MDM001, 상태가 DRAFT 가 아니면 MDM002. **쓰기 조작(`addItem`·`changeItem`·`removeItem`·`revert`)에만 적용한다. `viewAt` 은 버전 상태를 보지 않는다**(RELEASED·CANCELLED V 의 `view`·`preview`·`validate` 가 `viewAt` 을 부른다).
- **쓰기는 행마다 리포지토리 `save`·`delete` 를 명시적으로 호출한다**(`MdmCodeItemRepository.save`, `MdmCodeCateItemRepository.save`·`delete`). 관리 엔티티의 변경 감지(dirty checking)에 기대지 않는다. G·SD·S 시험은 트랜잭션 없이 서비스를 직접 부르므로, 트랜잭션 밖에서 JPQL 로 읽은 엔티티는 곧바로 detached 가 되어 세터만으로는 DB 에 반영되지 않는다(`DomainMngService:240` 의 `saveAndFlush` 선례, `DomainMngApiSupport` 도 트랜잭션 없이 직접 부른다). PK 가 바뀌는 쓰기는 없다(닫기·열기는 `to_ver` 만, 수정은 새 PK 의 새 행).
- 마루 코드의 ITEM 행을 모두 읽고 코드별로 모은다. `N` = 이 코드의 `from_ver = V` 행, `O` = `to_ver = V` 행, `R` = V 에 유효한 행.

- `addItem(V, code, values)`: `R` 이 있으면 `MdmErrors.of(CODE_SAVE_REJECTED, List.of(issue(SEGMENT_OVERLAP, code)))`. 없으면 `new MdmCodeItem(id, code, V)` + 값 세터 + `toVer = OPEN_TO_VER` 저장. (`O` 가 있으면 결과 모양은 "수정"이 된다 — 04:62 의 빈 구간 없는 재추가다.)
- `changeItem(V, code, values)`: `R` 이 없으면 `CODE_NOT_FOUND`. `R.from == V` 면 그 행을 값 갱신한다. 갱신 뒤 값이 `O` 의 값과 모두 같으면 `N` 을 지우고 `O.to = OPEN_TO_VER`(I25). `R.from < V` 면: 값이 `R` 과 모두 같으면 아무것도 하지 않는다. 다르면 `R.to = V` 로 닫고 새 행 `from = V` 를 넣는다. "값"은 name·alterName·seq·description·lvl1-5·attr01-10 이다.
- `removeItem(V, code)`: `R` 이 없으면 `CODE_NOT_FOUND`. `R.from == V` 면 `R` 을 지운다(`O` 는 닫힌 채 둔다), 아니면 `R.to = V`. 이어서 이 코드의 CATE_ITEM 중 V 에 유효한 행마다: `from == V` 면 지우고, 아니면 `to = V`. 영향받은 cate_id 를 정렬·중복 제거해 돌려준다.
- `revert(V, key)`: ITEM → `revertItem`, CATE_ITEM → `revertCateItem`, CATE → `UnsupportedOperationException("TSK-06-04 가 구현한다: revert(CATE)")`(D3).
  - `revertItem`: `N` 있고 `O` 있음 → `N` 삭제, `O.to = OPEN_TO_VER`. `N` 만 → `N` 삭제. `O` 만 → `O.to = OPEN_TO_VER` 후 연쇄 되돌리기: 이 코드의 CATE_ITEM 중 `to = V` 인 행마다 그 카테고리가 V 에 유효하면(CATE 행 중 `from <= V < to` 가 있으면) `to = OPEN_TO_VER`(D4). 둘 다 없음 → `MdmErrors.of(INVALID_INPUT, "되돌릴 변경이 없습니다", List.of())`.
  - `revertCateItem`: 같은 세 갈래(키 = cateId·code).
- `viewAt(V)`: `MasterCodeVersionView(ref, items, categories, cateItems)` — 세 표 모두 `valid(from, to, V)` 인 행, 코드 정렬은 `(seq nulls last, code)`. 카테고리는 `CategoryDefinition(cateId, cateName, CategoryKind.valueOf(defKind), defExpr, defTarget==null?null:CategoryDefTarget.valueOf(defTarget), description)`.
- 이 클래스는 `VersionWriteGuard`·ROW_VERSION 을 참조하지 않는다(I12).

### 6.3 저장 검사 (`MasterCodeItemChecks`)

입력: 헤더(lvlCnt, 라벨 10칸, sourceKind), V 적용 후 모습(코드별 값), touched 코드 집합(요청의 ADDED·CHANGED 코드, 되돌리기라면 되돌린 코드). touched 행마다 순서대로:

1. 코드 null·빈 문자열 → `CODE_REQUIRED`(field `code`). 코드가 `[,\s]` 를 포함 → `CODE_FORBIDDEN_CHAR`(field `code`).
2. 계층 칸 값이 `[,\s]` 를 포함 → `CODE_FORBIDDEN_CHAR`(field `lvlN`).
3. `i >= lvlCnt` 인 칸(0 기준)에 값 → `LVL_BEYOND_CNT`(field `lvl{i+1}`).
4. 값이 있는 마지막 칸 앞에 빈 칸 → `LVL_GAP`(첫 빈 칸의 field).
5. `LVL_PARENT_MISMATCH`(sim `check()` 을 04 규칙으로): `path` = 비지 않은 계층 값 목록. `path` 의 각 값 `v`(자리 n)와 코드 자신(자리 = path 길이)마다, **touched 행 자신을 뺀** V 모습의 다른 행 `o` 에서 `v` 가 나타나는 자리를 찾는다: `o` 의 lvl 칸 m 에 `v` 가 있으면 `o` 의 앞 칸 `o.lvl[0..m-1]` 이, `o.code == v` 면 `o` 의 전체 경로가, 내 앞 칸 `path[0..n-1]` 과 같아야 한다. 다르면 거부(field = 그 값의 칸, 메시지 `"<v>는 이미 <앞 칸 ' > ' 연결 또는 (뿌리)> 아래에 있다"`). 한 행에 여러 위반이 있어도 첫 위반 하나만 낸다(시뮬레이터와 같다).
6. 라벨이 없는 번호 N 에 attrN 값 → `ATTR_WITHOUT_LABEL`(field `attrNN`).
- 빈 문자열은 모두 null 로 정규화한 뒤 검사한다(`MasterCodeItemProjection` 이 정규화).
- 이슈는 `MdmCheckIssue(code=이슈 enum name, message, field, itemKey=코드)`. 저장 거부 메시지 detail 은 `"<코드>[<field>] <이슈 코드>; …"` 형식(`DomainRejections` 선례).

### 6.4 메모리 적용 (`MasterCodeItemProjection`)

`apply(Map<String, ItemValues> viewAtV, List<Map<String,Object>> rows) → Result(viewAfter, touched, issues)`. DELETED → CHANGED → ADDED 순으로 적용(P4). DELETED·CHANGED 대상이 없으면 `CODE_NOT_FOUND`, ADDED 대상이 이미 있거나 같은 요청에 두 번 나오면 `SEGMENT_OVERLAP`. `rowStatus` 가 셋 중 하나가 아니면 `MdmErrors.of(INVALID_INPUT, …)`.

### 6.5 카테고리 해석 (`MasterCodeCategoryResolver`)

- REGEX: `Pattern.compile(defExpr)` 실패 → `invalidExpression=true`, 빈 결과. 성공이면 V 에 유효한 코드 행마다 대상 칸 값(`CODE`→code, `LVLn`→lvln, `ATTRnn`→attrnn, def_target null 이면 `CODE`)을 `matcher(value).matches()` 로 대조한다. 값이 null 이면 해당 없음(`TARGET_NULL`).
- TABLE: V 에 유효한 CATE_ITEM 의 코드 집합 ∩ V 에 유효한 코드. CATE_ITEM 에 있으나 V 에 없는 코드 → 경고 `CATE_ITEM_CODE_MISSING` 목록.
- 결과 0건 → 경고 `CATEGORY_EMPTY`.
- 반환: 코드 행마다 `{code, name, seq, lvls, hit, reason(MATCH|NO_MATCH|TARGET_NULL|MEMBER|NOT_MEMBER), targetValue}` 를 코드 정렬(`seq nulls last, code`)로, 그리고 `hitCount`, `total`, `warnings`, `invalidExpression`, 규칙 문구용 `defKind`·`defTarget`·`defExpr`.
- 카테고리 소급(04:379)은 사본 판정 규칙이라 이 미리보기에 적용하지 않는다. 미리보기 선택지는 V 에 유효한 카테고리뿐이다.

### 6.6 OASIS 서비스 `codeItemEdit` (`POST /api/mdm/oasis/codeItemEdit/{action}`)

| action | method | 요청 | 응답 `result` |
|---|---|---|---|
| `search` | `search(CodeItemSearchRequest)` | `keyword` | `codes: [{maruCodeId, maruCodeName, sourceKind, status, lvlCnt}]` |
| `view` | `view(CodeItemViewRequest)` | `maruCodeId`, `ver`(선택) | 아래 |
| `compare` | `preview(CodeItemPreviewRequest)` | `maruCodeId`, `ver`, `cateId` | §6.5 반환 + `cateId`·`cateName`·`ver` |
| `validate` | `validate(CodeItemSaveRequest, List<Map<String,Object>> rows)` | params `maruCodeId`·`ver`, grids `rows` | `issues: [{code, message, field, itemKey}]` |
| `save` | `save(CodeItemSaveRequest, List<Map<String,Object>> rows)` | params `maruCodeId`·`ver`·`rowVersion`, grids `rows` | `rowVersion`, `closedCategories: {<code>: [cateId]}` |
| `restore` | `revert(CodeItemRevertRequest)` | `maruCodeId`, `ver`, `rowVersion`, `code` | `rowVersion` |
| `execute` | `patch(CodeItemPatchRequest)` | `maruCodeId`, `code`, `fromVer`, `name`, `alterName`, `seq`, `description` | `row`(갱신한 행) |

**`view` 응답**: `header {maruCodeId, maruCodeName, sourceKind, status, lvlCnt, attrLabels:[{no, label}](라벨 있는 것만)}`, `versions [{ver, display:"v1.001", status, verKind, ownerId, applyFrom, applyTo}]`(ver 내림차순), `selected {ver, status, ownerId, rowVersion, editable, patchable, warning}`, `rows [행 값 + change("ADDED"|"CHANGED"|"NONE") + prev(CHANGED 면 O 의 값) + tableCategories + patchBlocked]`, `closed [to_ver = V 이고 같은 코드의 from_ver = V 행이 없는 ITEM 행 값 + change:"REMOVED" + tableCategories(그 코드의 to_ver = V CATE_ITEM cate_id)]`, `closedCateItems [{cateId, code}]`(to_ver = V 인 CATE_ITEM — diff 표시), `categories [{cateId, cateName, defKind}]`(V 에 유효).
- 기본 버전(ver 생략): DRAFT → 없으면 CANCELLED 가 아닌 가장 큰 ver → 버전이 없으면 `selected=null`, 행 빈 목록.
- `editable` = 상태 DRAFT ∧ `ownerId == currentUser.userId()` ∧ `sourceKind == "MDM"` ∧ 미적용 버전 수 ≤ 1. 미적용 2개면 `warning="MULTIPLE_UNAPPLIED"`(화면 문구 `미적용 버전이 2개입니다. 하나를 삭제하세요`, 04:299).
- `patchable` = 상태 RELEASED ∧ `sourceKind == "MDM"`.
- `patchBlocked`(RELEASED 행마다) = 이 마루 코드에 상태가 DRAFT·REQUESTED·APPROVED 인 버전 U 가 있고 같은 코드의 `from_ver = U` 행이 있다(D8).
- 미적용 버전 판정은 F5 와 같은 정의를 이 서비스의 private 메서드로 둔다: DRAFT, 또는 `applyFrom != null && applyFrom.isAfter(now)` 인 RELEASED(`now` = `LocalDateTime.now(clock).truncatedTo(SECONDS)`). REQUESTED·APPROVED 는 결재 보류라 지금 생기지 않지만 생기면 미적용으로 센다.

**`save` 순서**(I22·I23):
1. `ver` 파싱, 헤더·버전 존재 확인(없으면 MDM001). `sourceKind == EXTERNAL` → MDM022 `SOURCE_EXTERNAL`. `rows` 비었으면 MDM021 `"저장할 변경이 없습니다"`.
2. `viewAt(V)` 로 V 모습을 읽고 `MasterCodeItemProjection.apply` → `MasterCodeItemChecks.check`. 이슈가 하나라도 있으면 `MdmErrors.of(CODE_SAVE_REJECTED, detail, issues)` 를 던진다. **여기까지 쓰기가 없다.**
3. `versionWriteGuard.beginDraftWrite(ref, rowVersion, currentUser.userId())` → 새 rowVersion.
4. `MasterCodeSegmentService` 로 DELETED(`removeItem`, 닫힌 카테고리 모음) → CHANGED(`changeItem`) → ADDED(`addItem`).
5. 응답. 3~4 에서 난 예외는 OASIS 트랜잭션이 3 의 증가분까지 되돌린다(O3).
- `validate` 는 1(EXTERNAL 판정 포함)·2 만 하고 던지는 대신 `issues` 를 돌려준다.
- `revert`: 버전 확인 → `beginDraftWrite` → `revert(ITEM)` → 되돌린 코드가 V 에 있으면 그 코드를 touched 로 `MasterCodeItemChecks` → 이슈가 있으면 MDM022(트랜잭션 롤백).
- `patch` 순서: 사용자 역할에 MDM_STEWARD 없음 → MDM013 → 헤더 EXTERNAL → MDM023 `SOURCE_EXTERNAL` → 미적용 2개 → MDM007 → 행 `(maruCodeId, code, fromVer)` 없음 → MDM021 → from_ver 버전 상태가 RELEASED 아님 → MDM023 `PATCH_NOT_RELEASED` → patchBlocked → MDM023 detail `DRAFT에서 고치세요`(이슈 `PATCH_KEY_CHANGED_IN_UNAPPLIED`) → 엔티티의 name·alterName·seq·description 만 세터로 바꾸고 저장. ROW_VERSION·LAST_CHG_SEQ 는 건드리지 않는다(D7).

### 6.7 BPMN `services/dmc/codeItemEdit.bpmn`

`bpmn-tool create` 에 넘길 스펙(요지): process `{id:"codeItemEdit", name:"코드 편집", isExecutable:true}`, 노드 `start`(StartEvent) → `actionGateway`(ExclusiveGateway, `camunda.properties:[{name:"input",value:"action"}]`) → serviceTask 7개(`searchTask`·`viewTask`·`compareTask`·`validateTask`·`saveTask`·`restoreTask`·`executeTask`, 각각 `camunda.class:"codeItemEditService"`, properties `method`·`output=result`·`dto`) → endEvent 7개(`endSearch` 등). flow `flow_to_gw`, `flow_<action>`(name = action, 조건식 없음), `flow_<action>_end`. 좌표는 게이트웨이 뒤 serviceTask 를 세로로 벌린다(분기 노드 y 간격 ≥ 130). 만든 뒤 `bpmn-tool validate` 오류 0(default flow 경고는 기존 dma 파일과 같아 허용), `bpmn-tool preview` 로 7 분기를 확인한다.

### 6.8 화면 `m-mdm/pages/dmc/codeItemEdit/page.tsx`

- 셸: `<MdmPageLayout group="dmc" screenId="codeItemEdit" title="코드 편집" buttons=[조회(action "view"), 저장(action "save", DRAFT·editable 일 때만 보임)]>`. 권한은 `canDoButton(rbac, "codeItemEdit", action)`.
- 조회 영역(`SearchArea`): 마루 코드 ID 고르기(`IdPicker` — 룰 화면 룰 고르기와 같음, search ID·코드명 부분 일치 앞 20건, `code-pick-keyword` + [찾기] → 드롭다운 `code-pick-{id}`, 현재 코드 `code-current`), 버전 `Select`(`vX.YYY 상태`, `code-ver-select`), `Checkbox` 닫힌 코드 보기(`code-closed-toggle`), 낙관적 잠금 표시 `row_version = n`(`code-row-version`), 상태 배지(`VersionStatusBadge`, DRAFT 면 `편집 가능 · 소유자 x`, 그 밖은 `읽기 전용 · diff 보기`). 미적용 2개 경고.
- 탭(`@dk-oasis/shared/tabs`): `코드 편집`(`code-tab-grid`) | `트리 보기`(`code-tab-tree`)(D13).
- 코드 편집 탭: `GridPanel`(DRAFT·editable 일 때만 `코드 추가` `code-add`) + `AgDataGrid`(`code-grid`). 열 순서 = 코드, 이름, 약칭, 순서, `1차`..`{lvlCnt}차`, 라벨 있는 추가 컬럼(머리 = 라벨), 설명, 변경(배지 `추가`·`수정`·`삭제` + 이슈 문구 `code-row-issue-{code}`), 동작(DRAFT: 변경 행 `되돌리기`(action restore, 즉시 서버 호출 후 다시 읽기), 변경 없는 행 `삭제`, 새 행 `취소`). `editable`: DRAFT·editable 일 때 이름·약칭·순서·계층·추가·설명 칸, 코드 칸은 새 행만. CHANGED 행의 바뀐 칸은 옛 값을 취소선으로 함께 보인다. 닫힌 코드 보기를 켜면 `closed` 행을 `getRowClassExtra` 클래스 `code-item-edit__row--closed`(`color: var(--color-text-disabled)`)로 덧붙인다. 행 삭제 전 `tableCategories.length > 0` 이면 확인 메시지 `카테고리 n개에서 함께 빠집니다`. 코드 0건이면 `보일 코드가 없습니다`(`code-grid-empty`). 계층 칸 입력은 기존 그룹 값 목록을 `cellEditor:"select"` 후보가 아니라 자유 입력으로 두고, 저장 전 `validate` 가 행별 이슈를 표시한다.
- 저장 흐름: `저장` 은 곧바로 `save` 를 부른다. 성공하면 토스트 `저장했습니다` → `view` 다시 읽기. 실패하면(`meta.success=false`) `ErrorModal` 에 서버 메시지를 띄우고, 같은 변경 목록으로 `validate` 를 불러 받은 이슈를 행마다 표시한다(`code-row-issue-{code}`). 계층 칸을 고친 뒤 칸을 벗어날 때도 `validate` 를 불러 그 행의 이슈를 미리 보인다(시안:1071 의 "고친 행에서 바로 보인다"). 화면은 검사 결과로 저장을 막지 않는다: 판정은 서버 `save` 가 한다(E2E T4 가 `meta.success=false` 경로를 탄다).
- 트리 보기 탭: `Tree`(`code-tree`) — `buildCodeTree(현재 V 행, 닫힌 행 제외)` → `toTreeItems`. 기본은 모두 펼침, 접기·펴기는 `expandedItems` 제어. 노드 선택 시 `이 노드로 편집`(`code-tree-to-grid`) 버튼 → 코드 편집 탭으로 가며 거르기를 건다. 계층을 쓰지 않으면(lvlCnt 0) 모든 코드가 한 단계에 seq 순으로 보인다는 설명을 보인다.
- 거르기 표시(필터 칩, D13): 그리드 제목 옆에 `GridBadge` 로 `KS-3 아래`(그룹) 또는 `KS-9만`(코드만) + `Button` `✕ 거르기 풀기`(`code-filter-chip`, `code-filter-clear`). 거르기 중 `코드 추가` 는 새 행의 계층 칸을 `pathOf(선택)` 으로 채운다.
- 미리보기 패널(`ContentPanel`, `code-preview`): 카테고리 `Select`(`code-preview-cate`, 기본 BASE), 모드 `Radio` `콤보`·`목록·근거`(`code-preview-mode`), 제목 줄 `CODE_LIST("<maruCodeId>", "<cateId>") · v<ver> · <hitCount> / <total>건 해당 · 저장된 정의 기준`. 콤보 모드는 해당 코드 행으로 `comboSteps` 단계별 `Select` 를 잇고(고른 값이 그룹이면 다음 단계, 코드면 멈춤), 목록 모드는 읽기 전용 `AgDataGrid`(코드·이름·경로(lvlCnt>0)·해당 ●/○·근거 문구). 경고(2-1·2-2)와 정규식 오류를 아래에 보인다. 카테고리 편집은 하지 않는다(06-04 몫, D11).
- 경미 수정 패널(`patch-panel`, RELEASED·patchable 이고 행을 골랐을 때만): 코드(`patch-code` disabled), 이름·약칭·순서·설명(`patch-name`·`patch-alter-name`·`patch-seq`·`patch-description`), 계층 칸·추가 컬럼(모두 disabled). `경미 수정 저장`(`patch-save`, action execute). `patchBlocked` 행이면 버튼 비활성 + `DRAFT에서 고치세요`(`patch-blocked`). 설명 문구 `이름·약칭·순서·설명만 고친다. 코드·계층 칸·추가 컬럼 값은 잠기며 새 버전으로만 바꾼다`.
- EXTERNAL 마루 코드: 편집·경미 수정 요소를 모두 숨긴다(04:846).

---

## 7. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

각 항목은 규칙 · 잡는 시험 · 변이 예다. Build·Verify 의 변이 검증이 이 목록을 순회한다.

1. **추가 = 새 행 `from_ver = V, to_ver = OPEN_TO_VER`.** G1. 변이: `toVer` 를 V 로 → G1 빨강.
2. **수정(from < V) = 옛 행 `to_ver = V` 로 닫고 새 행 `from_ver = V`, 옛 행 값은 그대로.** G2. 변이: 옛 행을 제자리 갱신 → G2(옛 값 단언) 빨강.
3. **V 에서 두 번 고치기는 `from_ver = V` 행을 직접 갱신한다(키당 행 하나).** G3. 변이: 늘 닫고 새로 넣기 → PK 위반 또는 행 수 단언 빨강.
4. **삭제(from < V) = `to_ver = V` 로 닫는다(물리 삭제 아님).** G4, SD1. 변이: 행 삭제 → G4·SD1 빨강.
5. **V 에서 만든 행을 삭제하면 지운다(닫지 않는다).** G5. 변이: `to_ver = V` 로 닫기 → from=to 행이 남아 G5 빨강.
6. **수정 뒤 삭제는 옛 행을 `to_ver = V` 로 둔다(9999 로 열지 않는다).** G6. 변이: 옛 행 재개방 → G6 빨강.
7. **되돌리기 세 갈래**(추가 → V 행 삭제, 수정 → V 행 삭제 + 옛 행 9999, 삭제 → 9999). G7·G8·G9·G14. 변이: 수정 되돌리기에서 옛 행을 열지 않음 → G8 빨강.
8. **되돌릴 변경이 없으면 MDM021 이고 아무것도 바꾸지 않는다.** G10. 변이: 조용히 성공 → G10 빨강.
9. **코드 삭제 연쇄: 그 코드의 V 에 유효한 CATE_ITEM 을 닫고(from = V 면 지우고), 영향 cate_id 를 정렬·중복 없이 돌려준다. 수정은 연쇄하지 않는다.** G11·G12, SD1(`MAJOR 82` to 2.000, 반환 `["MAJOR"]`). 변이: 연쇄 누락 → SD1·G11 빨강. `changeItem` 에도 연쇄 → G12 빨강.
10. **삭제 되돌리기는 to_ver = V 인 CATE_ITEM 중 카테고리가 V 에 유효한 것만 다시 연다(D4).** G13. 변이: 연쇄 되돌리기 누락 → G13 빨강. 닫힌 카테고리의 항목까지 열기 → G13 빨강.
11. **모든 선분 조작은 DRAFT V 에서만(아니면 MDM002).** G16. 변이: `requireDraft` 제거 → RELEASED 행이 바뀌어 G16 빨강.
12. **선분 서비스는 ROW_VERSION 을 바꾸지 않고, 저장·되돌리기는 정확히 +1 이다.** G17, S8, O1. 변이: 선분 서비스에서 `casBumpRowVersion` 호출 → G17 빨강·S8(+2) 빨강.
13. **버전 V 의 모습 = `from_ver <= V < to_ver`(비교는 `compareTo`).** G18, SD2. 변이: `v.compareTo(to) <= 0` → SD2 의 2.000 모습에 82 가 끼어 빨강. `from.compareTo(v) < 0` → 1.001 에서 추가된 2P 가 1.001 모습에서 빠져 빨강. (`equals` 비교는 엔티티 게터와 파싱한 V 가 모두 scale 3 이라 결과가 같아 변이로 쓰지 않는다.)
14. **diff 표시: `ADDED`(from = V, O 없음), `CHANGED`(from = V, O 있음, prev = O 값), 닫힌 행 = to = V 이고 from = V 짝이 없는 행.** S4, SD4. 변이: CHANGED 의 옛 행을 closed 에 넣음 → SD4(닫힌 행 정확히 3개) 빨강.
15. **코드·계층 칸 값의 콤마·공백 금지(`[,\s]`, 탭 포함).** H3. 변이: 패턴을 `[ ,]` 로 → `A\tB` 통과로 빨강.
16. **`lvl_cnt` 뒤 칸 값 거부(경계 lvlCnt 번째 칸은 허용).** H2. 변이: `i > lvlCnt` → lvl4 통과로 빨강.
17. **중간 칸이 비면 거부.** H1(`X-1`), SD6. 변이: 검사 제거 → H1 빨강.
18. **같은 값의 앞 칸이 다르면 거부(그룹 값·코드값 모두, 자기 코드 제외, V 에 유효한 행 기준, 첫 위반 하나).** H1(시뮬레이터 4건), H6, S12, SD6. 변이: 자기 코드를 빼지 않음 → H6 첫 단언 빨강. 코드값 비교 누락 → H1 넷째(`KS-3 (JIS)`) 빨강. 닫힌 행까지 비교 → S12 빨강.
19. **라벨 없는 번호의 추가 컬럼 값 거부.** H4. 변이: 검사 제거 → H4 빨강.
20. **구간 겹침 거부(V 에 있는 코드 재추가, 요청 안 중복) · 없는 코드 수정·삭제는 `CODE_NOT_FOUND`.** P1·P2, `addItem` 직접 호출 겹침(G 계열 보강 단언). 변이: 중복 검사 제거 → P1 빨강·PK 없이 겹치는 행 생김.
21. **저장 검사는 touched 행에만 적용한다.** H7. 변이: V 모습 전체 검사 → H7 빨강.
22. **거부된 저장은 ROW_VERSION·행을 바꾸지 않는다(검사가 `beginDraftWrite` 보다 먼저).** S7, O2. 변이: `beginDraftWrite` 를 검사 앞으로 옮김 → S7(트랜잭션 없는 직접 호출) 빨강.
23. **저장·되돌리기는 `beginDraftWrite` 를 거친다(소유자·row_version·DRAFT·미적용 2개).** S9·S10, O4. 변이: 호출 생략 → S9 전부 빨강.
24. **OASIS 트랜잭션 안에서 적용 중 실패하면 ROW_VERSION 증가와 앞선 쓰기가 함께 되돌아간다(서비스에 `@Transactional` 없음).** O3. 변이: 서비스에 `@Transactional` → OASIS 바인딩 실패로 O1 빨강. 선분 적용을 별도 `TransactionTemplate(REQUIRES_NEW)` 로 → O3 빨강.
25. **값이 같은 수정은 선분을 만들지 않고, V 행이 옛 값으로 돌아오면 수정 자체를 되돌린다.** G19. 변이: 같은 값에도 닫고 새로 넣기 → G19 빨강.
26. **빈 문자열은 null 로 정규화하고 코드는 트림하지 않는다.** P5, H3(`" A"`). 변이: 코드 트림 → `" A"` 저장으로 빨강.
27. **카테고리 해석: REGEX 는 대상 칸 값 전체 일치, NULL 은 해당 없음. TABLE 은 CATE_ITEM ∩ V 의 코드. 경고 2-1·2-2.** R1~R6, SD3. 변이: `matches()` → `find()` → R1 빨강. TABLE 에서 V 코드와의 교집합 누락 → R3 빨강.
28. **경미 수정은 이름·약칭·순서·설명만 바꾼다(코드·선분·계층·추가 컬럼 잠김).** S13, O5, page-render ④. 변이: DTO 에 `lvl1` 추가·세터 호출 → O5 빨강. 패널 계층 입력 활성 → page-render ④ 빨강.
29. **경미 수정은 from_ver 버전이 RELEASED 인 행만, 미적용 비 RELEASED 버전이 같은 키에 from_ver 행을 가졌으면 거부(닫기만 한 키는 허용).** S14·S15, SD5. 변이: patchBlocked 판정을 "to_ver = U 인 행도" 로 넓힘 → SD5 빨강. 판정 제거 → S14 빨강.
30. **경미 수정: 미적용 2개면 MDM007, 경계 `apply_from == now` 는 적용됨.** S16. 변이: `isAfter` → `!isBefore` → 경계 단언 빨강.
31. **경미 수정은 MDM_STEWARD 만.** S17. 변이: 역할 검사 제거 → S17 빨강.
32. **경미 수정은 ROW_VERSION 과 LAST_CHG_SEQ 를 바꾸지 않는다(D7).** S13. 변이: `beginDraftWrite` 호출 → S13 빨강.
33. **EXTERNAL 마루 코드는 저장·경미 수정 거부, `editable=false`·`patchable=false`.** SD7. 변이: 원천 검사 제거 → SD7 빨강.
34. **`editable` = DRAFT ∧ 소유자 ∧ MDM ∧ 미적용 ≤ 1, `patchable` = RELEASED ∧ MDM.** S3·S4. 변이: 소유자 조건 제거 → S3 빨강.
35. **BPMN 계약: 분기 7개 이름·READ 3개·method 대응·output=result·grid 없음·조건식 없음·process id.** B1~B5. 변이: `compare` 분기를 `preview` 로 개명 → B1 빨강(STD_ADMIN 403 사고 예방).
36. **오류 코드 MDM022 `CODE_SAVE_REJECTED`(400)·MDM023 `CODE_PATCH_REJECTED`(409), 총 23개.** `CommonContractTest`. 변이: MDM022 HTTP 409 → 빨강.
37. **트리 표시 순서 = 시뮬레이터(코드 행이 있는 노드를 (seq, 값), 그다음 순수 그룹을 값 순, 뿌리도 같음).** `code-tree.test.ts`. 변이: seq 대신 값 정렬 → ORG `PH-A-PRD`/`PH-A-MNT` 순서가 바뀌어 빨강. 그룹을 코드보다 먼저 → STEEL `KS` 아래 `KS-9`/`KS-3` 순서가 바뀌어 빨강.
38. **콤보 순서 = 시뮬레이터(코드인 항목 먼저, 그 안은 값 순, 종류 표기 그룹·코드·그룹+코드).** `combo.test.ts`. 변이: seq 정렬 → ORG `PH` 다음 단계가 `PH-B, PH-A` 가 되어 빨강.
39. **화면 잠김: RELEASED·CANCELLED 는 저장·추가 버튼 없음·그리드 편집 불가, DRAFT 의 기존 행 코드 칸 편집 불가.** page-render ③④⑥. 변이: 코드 칸 `editable: true` → ③ 빨강.
40. **버전 표시는 소수 세 자리 `v1.008`, 버전은 문자열로 주고받는다.** grid-state(`fmtVer`), S2. 변이: `Number(ver).toString()` → `v2` 가 되어 빨강.
41. **메뉴: `codeItemEdit` leaf 가 `dmc` 아래, OBJECT·RBAC 는 dmc 매트릭스(STD_ADMIN READ, STEWARD CONFIRM).** E2E T1(steward 로 메뉴 이동)·T3(steward 저장 성공). 변이: `seedMdmObjectRbac("codeItemEdit","dma")` → 담당자가 READ 만 받아 T3 저장 403 으로 빨강.
42. **선분 서비스의 남의 메서드는 담당 Task 를 적은 `UnsupportedOperationException` 을 던진다(조용히 무시하지 않는다).** G15·G20. 변이: 빈 메서드로 둠 → G20 빨강.

알려진 커버리지 갭(보고 대상): ① `MasterCodeRows` 가 버전 범위를 JPQL 에 넣지 않는다는 규칙(§2)은 시험이 직접 보지 못한다. SQLite 샘플 시험(1.000 INTEGER·1.001 REAL 혼재)이 결과로만 간접 확인한다. ② 시험 픽스처가 MSSQL 에서 도는지는 도커 금지로 확인하지 않는다(아래 절).

---

## 8. Phase 06(완료 보고) 전 절차 — 형제 Task 와의 합류 확인

형제 Task(06-02·06-04·06-05)가 먼저 dev 에 머지했을 수 있다. 특히 **형제가 다른 파일명으로 `MasterCodeSegmentService` 구현 빈을 머지하면 git 충돌 없이 합쳐지고, 같은 타입 빈이 둘이 되어 `@SpringBootTest` 전부가 기동에 실패한다.** 그래서 push 전에 아래를 반드시 한다.

1. `/usr/bin/git fetch origin`
2. `/usr/bin/git grep -n "implements MasterCodeSegmentService" origin/dev -- src/backend/mdm/lib/src/main` — 결과가 있으면 D2 해소 규칙대로 한 클래스로 합친다(06-03 위임 5개와 `revert` 분기를 그 클래스로 옮기고 이 Task 의 `DefaultMasterCodeSegmentService` 를 지운다).
3. `/usr/bin/git grep -n '"MDM02[2-9]"' origin/dev -- src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/common/MdmErrorCode.java` — MDM022·MDM023 이 이미 쓰였으면 D5 규칙대로 이 Task 의 두 상수를 다음 번호로 재채번하고 `CommonContractTest` 의 개수·개별 단언을 맞춘다.
4. `/usr/bin/git grep -n -i "CategoryResolver\|class .*Resolver" origin/dev -- src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common` — 형제가 카테고리 해석기를 따로 만들었으면 D11 대로 하나로 합치고 R 시험을 합친 쪽으로 옮긴다.
5. `/usr/bin/git grep -n "codeItemEdit\|seedMdmCode" origin/dev -- src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` — 형제의 dmc leaf 시드와 겹치는 줄(같은 menuSeq `003` 등)이 있으면 README §3 순서대로 맞춘다.
6. `/usr/bin/git grep -n "class MdmStewardGuard" origin/dev -- src/backend/mdm/lib/src/main` — 06-02 의 `MdmStewardGuard` 가 dev 에 있으면 `CodeItemEditService.requireSteward()`(private, 주석 `// 06-02 머지 뒤 MdmStewardGuard.requireSteward 로 연결`)의 본문을 그 가드 호출로 바꾸고(생성자 주입), S17·변이 31 이 그대로 빨강·초록으로 갈리는지 확인한다. 아래 「형제 Task 공용 부품」 절의 표를 따른다.
7. origin/dev 를 이 브랜치에 머지하고(머지 커밋의 DFlow-Order 트레일러는 `/dflow-merge` 「트레일러 고정」 방식) 게이트 1~5 를 다시 돌린다.

**공유 목록 "추가만" 규칙의 불가피한 예외**(기존 줄을 고치는 곳은 이 둘뿐이다): ① `CommonContractTest.java:48` 의 개수 `21` → `23`. ② `MdmErrorCode.java` 의 마지막 상수 `INVALID_INPUT(...)` 줄 끝 `;` → `,`(새 상수를 이어 붙이기 위한 문법 변경). 둘 다 새 상수 반영이며 기대값 완화가 아니다.

---

## 형제 Task 공용 부품 — 06-02/08-02 머지 뒤 연결

팀장 지시(2026-09-24, 주문 f93163b8)로 공용 부품은 담당 Task 가 만든다. 06-03 은 같은 것을 새로 만들지 않고, 필요한 최소 동작만 이 Task 안에 두었다가 담당 Task 가 머지되면 연결한다.

| 부품 | 담당 | 06-03 의 현재 상태 | 머지 뒤 연결 지점 |
|---|---|---|---|
| `MdmStewardGuard.requireSteward()`(MDM_STEWARD 아니면 MDM013) | TSK-06-02 | 만들지 않았다. 경미 수정의 역할 검사만 `lib/.../dmc/codeItemEdit/service/CodeItemEditService.java` 의 private `requireSteward()` 로 최소 구현했고 주석 `// 06-02 머지 뒤 MdmStewardGuard.requireSteward 로 연결` 을 달았다 | 그 메서드 본문을 가드 호출로 바꾸고 가드를 생성자로 주입한다(§8 6번). 시험 S17(`CodeItemEditServiceSqliteTest`)·HTTP 경로는 그대로 둔다 |
| `VersionScenarioTestConfig` 일반형 BFPP | TSK-06-02 | 만들지 않았다. 이 Task 시험은 전용 설정 `api/src/test/.../common/mastercode/MasterCodeTestConfig`(시계 2026-09-03·가짜 사용자 `@Primary` 두 개)와 HTTP 시험 안의 `ClockOnly` 만 쓴다 | 일반형이 머지되면 `MasterCodeTestConfig` 를 그것으로 바꿀 수 있으나 필수는 아니다(시험 전용·이 Task 범위) |
| DRAFT 소유권 action(lock·unlock·handover)과 RBAC 시드 체계 | TSK-08-02 | 만들지 않았다. BPMN 액션은 기존 `MdmActions` 13개 안(search·view·compare·validate·save·restore·execute)이고, 메뉴 시드는 기존 헬퍼 `seedMdmObjectRbac("codeItemEdit", "dmc")` 호출뿐이다 | 08-02 가 소유권 액션을 더해도 이 Task 의 BPMN·`DmcBpmnActionTest` 는 바뀌지 않는다. 08-02 가 RBAC 시드 방식을 바꾸면 `DataInitializer.seedMdmCodeItemEditMenu()` 한 곳을 그 방식으로 옮긴다 |

- 메뉴 순번은 팀장 예약과 같다: 06-02 codeMng `001`·codeEdit `002`, 06-03 codeItemEdit **`003`**(커밋 C 그대로), 06-04 codeCateEdit `004`, 06-05 codeConfirm `005`.
- 공용 `docs/mdm/decisions.md` 에는 블록을 더하지 않았다. 더해야 하면 임시 ID `D-TSK-06-03-<n>` 을 쓴다.

---

## Build 이탈과 보강 (Phase 03, 2026-09-24)

설계에서 벗어난 점과 설계에 없던 보강이다. 다음 Phase 와 리뷰어는 아래를 이 문서의 일부로 읽는다.

| # | 이탈·보강 | 사유 |
|---|---|---|
| B1 | 시그니처: `MasterCodeItemChecks.check(Header(lvlCnt, attrLabels), List<MasterCodeItemEntry>, Set<String>)`, `MasterCodeItemProjection.apply(List<MasterCodeItemEntry>, rows)`. `Header` 에 sourceKind 를 두지 않고 EXTERNAL 판정은 서비스가 한다. 새 파일 `MasterCodeItemEntry`(코드+값 레코드)·`MasterCodeRejections`(MDM022·023 예외, detail `<코드>[<칸>] <이슈 코드> <문구>; …`)를 더했다 | 코드별 값을 순서 있게 넘기고, 코드가 빈 새 행(CODE_REQUIRED)도 같은 목록에 담기 위해서다 |
| B2 | 선분 조작의 쓰기는 `saveAndFlush`, 삭제는 `delete` 뒤 `flush` 다(§6.2 의 `save`·`delete` 보다 강함). HTTP 시험 **O7**(한 요청에서 V 에서 추가한 코드를 지우고 다시 넣기)을 더했다 | Hibernate 는 flush 때 INSERT 를 DELETE 보다 먼저 실행해, 한 트랜잭션에서 같은 PK 를 지운 뒤 넣으면 PK 위반이 난다. 즉시 flush 하면 DB 오류도 serviceTask 안에서 나서 `meta.success=false` 로 실린다(O3) |
| B3 | `CodeItemPatchRequest` 에 `@JsonIgnoreProperties(ignoreUnknown = true)` | 잠긴 칸(`lvl1`·`attr01`·`toVer`)을 더 보내도 바인딩이 실패하지 않고 무시되게 한다(O5) |
| B4 | view 응답 행에 `fromVer`·`toVer`, `selected` 에 `display` 를 더했다. `save`·`restore` 는 `rowVersion` 이 없으면 MDM021, `restore` 도 EXTERNAL 이면 MDM022 `SOURCE_EXTERNAL` | 경미 수정 요청에 행의 from_ver 가 필요하다. 입력 누락·원천 판정을 저장과 같게 맞췄다 |
| B5 | 시험 보강: G1b(addItem 직접 겹침), G13b(분리), G18b(정렬), 값 목록 길이, H1b(다른 행의 **코드값**을 다른 앞 칸 아래 그룹으로), H6 셋째(코드가 자기 계층 값과 같은 행), P 추가 2건(seq 문자열·모르는 rowStatus), R 정렬, S10b(되돌린 결과가 계층 검사에 걸림), HTTP 조회 액션 1건 | H1b: 변이 18b(코드값 비교 누락)가 시뮬레이터 4건으로는 드러나지 않았다. H6 셋째: §4.2 H6 첫째는 V 적용 후 모습에 자기 새 값이 들어 있어 자기 코드를 비교에서 빼지 않아도 결과가 같다(변이 18a 를 잡지 못한다). 자기 행이 자기와 어긋나는 경우(코드 G 가 lvl1 에도 G)만 차이가 난다 |
| B6 | FE 시험 배치: 코드 칸 잠김(③·불변 규칙 39)은 `grid-state.isCellEditable` 단위 시험으로, 경미 수정 패널의 disabled(④)·patchBlocked(⑤)는 `components/PatchPanel` 을 직접 렌더해 본다. page-render 는 버튼·패널 유무·빈 상태·row_version 을 본다 | happy-dom 에서 ag-grid 셀 편집기 상태를 확인할 수 없고, 행 클릭 선택을 안정적으로 재현하기 어렵다 |
| B7 | 경미 수정 패널은 선택 버전이 `patchable` 이면 늘 보이고, 행을 고르지 않았으면 `그리드에서 고칠 행을 고르세요.` 를 보인다(§6.8 은 "행을 골랐을 때만"). 행 선택은 `patchable` 일 때만 바꾼다 | ⑥(CANCELLED 에 패널 없음)을 행 선택 없이 판정하려고 D15 로 정했다. 행 선택 제한은 완화책이다: E2E 첫 전체 실행에서 T4 의 새 행 코드 칸이 첫 클릭에 편집을 시작하지 못해 실패했고, ① 행 선택을 `patchable` 일 때만 바꾸기(편집 중 그리드 다시 그리기를 줄인다고 추정) ② E2E `editCell` 이 편집기가 열릴 때까지 다시 누르기를 **함께** 넣은 뒤 두 번째 전체 실행에서 통과했다. 두 완화책 중 어느 것이 효과였는지, 원인이 무엇이었는지는 분리해 확인하지 않았다 |
| B8 | data-testid: `code-save` 는 달지 않았다 — 상단 버튼(`PageButton`)이 testid 를 받지 않아 E2E 는 역할 이름 `저장` 으로 누른다. `code-add` 는 GridPanel `headerExtra` 의 shared `Button`, `code-closed-toggle`·`code-preview-mode` 는 Checkbox·Radio 를 감싼 요소, `code-tab-grid`·`code-tab-tree` 는 탭 라벨 span 이다. 더한 testid: `patch-lvlN`·`patch-attrNN`·`code-preview-step-{i}`·`code-preview-title` | shared 래퍼가 임의 props 를 넘기지 않는 곳은 감싸는 요소에 단다(shared 를 넓히지 않는다, D13) |
| B9 | 트리 라벨의 `(n건)` 은 그룹 아래 코드 수(자기 제외)다. 트리 탭에 `모두 펴기`·`모두 접기` 버튼을 두었다 | 접기·펴기 요구(spec)를 한 번에 조작하기 위해서다 |
| B10 | E2E 절차 보정: mcm 로그의 `Started McmApplication` 뒤에도 DataInitializer 가 시드를 쓰므로, 시드 대조·사용자 픽스처는 `초기 데이터 삽입 완료` 로그를 본 뒤에 넣는다 | 첫 시도에서 `no such table`·`database is locked` 가 났다 |
| B11 | `bpmn-tool` 은 전역 설치가 없어 `npx -y @cothe/bpmn-tool@1.3.0` 으로 create·validate·preview 했다(오류 0, default flow 경고 1 — dma 파일과 같음) | 환경 |

**변이 검증에서 잡지 못한 것(보고 대상)**: 불변 규칙 3 의 변이 "V 에서 두 번 고칠 때도 닫고 새로 넣기"는 빨강이 되지 않는다. `from_ver = V` 행을 `to_ver = V` 로 닫은 뒤 같은 PK(`code`, `V`)의 새 행을 `save` 하면 JPA `merge` 가 그 행을 갱신으로 합쳐, 표의 최종 상태가 올바른 구현과 같다(관측 불가능한 동치 변이). 네이티브 INSERT 로 바꾸는 변이라면 PK 위반으로 드러난다.

---

## 담당자 확인 필요 결정

### D1 — entry-point 는 `dmc/codeItemEdit`(spec 의 `mdc` 는 오기)
- **질문**: spec 은 `mdc/codeItemEdit` 라고 적었다. 기존 mdm 화면 경로 관례와 다르다. 어느 쪽인가.
- **선택지**: ① `dmc/codeItemEdit`. ② spec 글자대로 `mdc/codeItemEdit`.
- **택한 것**: ①.
- **근거와 근거 순위**: `screens/README.md` §3(화면 그룹·screenId 정본), `wbs.md:939`, 계약 `MdmScreenGroup.DMC`, `GROUP_CODE_PATTERN ^dm[a-z]$` 가 모두 `dmc` 다. ②는 그룹 코드 패턴을 어기고 `seedMdmObjectRbac` 가 모르는 그룹이라 기동이 실패한다. spec 본문이 근거 순위상 가장 강하지만, 같은 spec 이 가리키는 원천(wbs·README)과 계약이 한목소리로 `dmc` 이고 `mdc` 는 글자 순서가 뒤바뀐 오기로 보인다. TSK-04-02 §0 의 `mdt → dma` 정정 선례와 같다.
- **반려되면 재작업할 방향**: 그룹 `mdc` 를 쓰려면 `MdmScreenGroup`·`MdmPermissions.MATRIX`·`GROUP_CODE_PATTERN`·DataInitializer 폴더 시드를 먼저 바꾸는 별도 결정(ADR-0003 개정)이 필요하다. 그 뒤 이 Task 의 경로(`pages/mdc/…`, `services/mdc/…`, 패키지 `mdc.codeItemEdit`, 메뉴 부모)를 일괄 개명한다.

### D2 — `MasterCodeSegmentService` 구현은 위임 클래스 하나 + 06-03 본체 컴포넌트로 나누고, 남의 메서드는 담당 Task 를 적은 예외를 던진다
- **질문**: 인터페이스 12 메서드를 06-02·06-03·06-04 가 나눠 구현한다. 세 Task 가 동시에 진행돼 같은 구현 클래스를 각자 만들면 파일 add/add 충돌이나 같은 타입 빈 둘(NoUniqueBean)이 생긴다. 이 Task 는 어떤 모양으로 구현하는가.
- **선택지**: ① `common.mastercode.DefaultMasterCodeSegmentService`(위임만) + `MasterCodeItemSegmentOps`(06-03 본체). 남의 7개는 `UnsupportedOperationException("TSK-06-0x 가 구현한다: <메서드>")`. ② 인터페이스를 구현하지 않고 06-03 메서드만 가진 구체 클래스를 둔다(계약 경유 없음). ③ 12개를 모두 이 Task 가 구현한다.
- **택한 것**: ①.
- **근거와 근거 순위**: 06-01 L646(선행 산출물)이 이 Task 에 "`MasterCodeSegmentService` 의 코드 행 메서드 구현"을 넘겼다 — ②는 계약을 비켜 간다. ③은 범위 가드(형제 기능을 대신 구현하지 않음)를 어긴다. ①은 06-03 로직을 별도 파일에 두어 충돌 면을 위임 클래스의 몇 줄로 줄인다. **머지 해소 규칙**: 형제 Task 가 먼저 머지해 같은 인터페이스 구현 클래스가 dev 에 있으면, 이 Task 는 그 클래스에 06-03 메서드 5개의 위임과 `revert` 분기만 옮기고 자기 `DefaultMasterCodeSegmentService` 를 지운다. 반대 순서면 형제가 이 클래스의 예외 줄을 자기 위임으로 바꾼다. 어느 쪽이든 인터페이스 구현 빈은 하나만 남긴다.
- **반려되면 재작업할 방향**: ②면 위임 클래스를 지우고 `MasterCodeItemSegmentOps` 를 서비스가 직접 쓰게 바꾸며 G 시험의 주입 타입을 바꾼다. ③이면 06-02·06-04 명세를 받아 나머지 7개를 구현한다.

### D3 — `revert` 는 ITEM·CATE_ITEM 을 구현하고 CATE 는 TSK-06-04 로 넘긴다
- **질문**: 계약은 `revert(VersionRef, MasterCodeSegmentKey)` 전체를 06-03 에 배정했다. CATE 키 되돌리기도 이 Task 가 구현하는가.
- **선택지**: ① ITEM·CATE_ITEM 만 구현하고 CATE 는 예외. ② 세 표 모두 구현.
- **택한 것**: ①.
- **근거와 근거 순위**: 카테고리 닫기는 "TABLE 이면 그 CATE_ITEM 을 모두 같은 V 로 닫는다"(04:504)는 연쇄를 가지며, 그 되돌리기(연쇄 재개방 범위)는 원천이 적지 않았고 카테고리 편집 규칙과 한 몸이다. 06-04 가 `closeCategory` 와 짝을 맞춰 정하는 편이 규칙이 한 곳에 모인다. CATE_ITEM 되돌리기는 행 규칙(04:50-57)만으로 결정되므로 구현한다(코드 삭제 연쇄와도 같은 코드를 쓴다). 근거 순위: 원천(요구사항 층)의 공백 + 선행 계약 배정(미승인).
- **반려되면 재작업할 방향**: `revertCate` 를 더한다: `N`/`O` 세 갈래 + CATE 닫기를 되돌릴 때 같은 V 로 닫힌 그 카테고리의 CATE_ITEM 을 9999 로 연다. G15 를 성공 단언으로 바꾼다.

### D4 — "함께 닫은 CATE_ITEM" 은 to_ver = V 이고 카테고리가 V 에 유효한 행으로 판정한다
- **질문**: 코드 삭제를 되돌릴 때 "함께 닫은 CATE_ITEM"(04:500)만 다시 열어야 한다. 그런데 표에는 연쇄로 닫혔는지, 사용자가 소속에서 직접 뺐는지 구분하는 칸이 없다. 무엇을 여는가.
- **선택지**: ① 그 코드의 `to_ver = V` CATE_ITEM 중 카테고리 행이 V 에 유효한 것을 모두 연다. ② 그 코드의 `to_ver = V` CATE_ITEM 을 모두 연다. ③ 표에 표시 칸을 더한다(스키마 변경).
- **택한 것**: ①.
- **근거와 근거 순위**: 스키마(06-01, 머지됨)는 표시 칸이 없고 ③은 이 Task 범위를 넘는 마이그레이션이다. ②는 V 에서 닫힌 카테고리에 항목만 다시 열어 "닫힌 카테고리의 열린 항목"을 만든다. ①의 대가: 같은 V 에서 사용자가 소속에서 직접 뺀 뒤 코드를 삭제하고 삭제를 되돌리면 그 소속도 다시 열린다. 원천이 코드 되돌리기를 "코드 삭제 전 상태로"라고 읽히므로 수용 가능한 범위로 본다.
- **반려되면 재작업할 방향**: ③이면 CATE_ITEM 에 닫힘 원인 칸을 더하는 마이그레이션(두 방언 같은 번호, origin/dev 최대+1)을 추가하고 `removeItem` 이 원인을 적게 바꾼다. ②면 카테고리 유효 조건을 뺀다(G13 후반 단언 삭제).

### D5 — 새 오류 코드는 우산 코드 2개(MDM022·MDM023) + 이슈 코드 enum
- **질문**: 06-01 이 저장 검사용 새 오류 코드를 이 Task 가 `MdmErrorCode` 에 더하라고 넘겼다. 검사마다 코드를 하나씩 두는가.
- **선택지**: ① 우산 2개(`CODE_SAVE_REJECTED` MDM022 400, `CODE_PATCH_REJECTED` MDM023 409) + 이슈 코드는 `MasterCodeItemIssueCode`. ② 검사마다 MDM 코드(8개 이상).
- **택한 것**: ①.
- **근거와 근거 순위**: `DOMAIN_SAVE_REJECTED`(MDM015)+이슈 코드 선례(리포 관례)와 같다. OASIS 응답에 MDM 코드가 실리지 않아(F11) 코드 수를 늘려도 화면이 얻는 것이 없다. 형제 Task 가 동시에 MDM022 를 고를 가능성이 높아 추가 줄 수가 적을수록 충돌 해소가 쉽다. **번호 충돌 해소 규칙**: 머지 때 dev 에 MDM022·023 이 이미 있으면 이 Task 의 두 상수를 dev 최대 번호 다음으로 재채번하고 `CommonContractTest` 의 개수·개별 단언을 맞춘다. 상수 이름(`CODE_SAVE_REJECTED`·`CODE_PATCH_REJECTED`)은 바꾸지 않으므로 코드 참조는 그대로다.
- **반려되면 재작업할 방향**: ②면 이슈 코드마다 `MdmErrorCode` 상수를 만들고 `MdmErrors.of(code)` 로 던지며, `CommonContractTest` 개수와 개별 단언을 늘린다.

### D6 — 액션 대응: 미리보기는 `compare`, 되돌리기는 `restore`, 경미 수정은 `execute`
- **질문**: BFF RBAC 는 URL 의 action 을 `MdmActions` 13개와 글자 그대로 대조한다. 7개 동작을 어느 action 에 싣는가. 특히 경미 수정은 ADR-0003 의 의미 표(save·delete·reg·import·copy·restore = 저장·삭제·새 버전·업로드·복사·복원, validate·execute = 저장 전 검사·값 테스트)에 딱 맞는 이름이 없다.
- **선택지**: ① search·view·compare(미리보기)·validate·save(DRAFT)·restore(되돌리기)·execute(경미 수정). ② 경미 수정을 `save` 에 합치고 버전 상태로 갈라 처리. ③ 경미 수정을 `reg`·`copy` 등 다른 EDIT 액션에.
- **택한 것**: ①.
- **근거와 근거 순위**: 표준 관리자는 DMC 에서 READ 세트라 미리보기는 READ 액션이어야 한다 → `compare`. 되돌리기는 ADR 의미 "복원"과 맞는 `restore`. 경미 수정은 DRAFT 저장과 전제 검사(`beginDraftWrite` 유무)·잠김 칸이 완전히 달라 ②처럼 한 메서드에 합치면 잠김 보장이 DTO 구조에서 분기 코드로 옮겨 가 약해진다. 남는 EDIT 액션 중 `execute` 는 ADR 에서 "값 테스트"로 적혔지만 RBAC 는 같은 EDIT·CONFIRM 세트라 동작 차이가 없다. 근거 순위: 승인된 ADR-0003 의 액션 어휘(리포 관례) > 의미 표의 설명 문구.
- **반려되면 재작업할 방향**: ②면 `execute` 분기를 지우고 `save` 가 버전 상태 RELEASED 일 때 `rows` 의 CHANGED 한 건을 경미 수정으로 처리하며, 잠김 칸이 바뀌면 MDM023 으로 거부한다(O5 를 "거부" 단언으로). ③이면 BPMN 분기 이름과 FE `canDoButton` 액션만 바꾼다.

### D7 — 경미 수정은 배포 순번(`LAST_CHG_SEQ`)을 올리지 않고 알림도 보내지 않는다
- **질문**: 04:547-548 은 경미 수정 저장 시 마루 코드 배포 순번을 1 올리고 배포 대상 담당자에게 알린다고 한다. 이 Task 가 하는가.
- **선택지**: ① 하지 않는다. ② 네이티브 UPDATE 로 `LAST_CHG_SEQ + 1` 만 한다. ③ 순번과 알림 모두 구현.
- **택한 것**: ①.
- **근거와 근거 순위**: 배포는 PRD §2 규칙 7 로 보류이고, 결정 기록 D-019·ADR-0002 D7 과 06-01 D2(선행 산출물)가 `LAST_CHG_SEQ` 를 "DEFAULT 0, 엔티티가 매핑하지 않는다"로 정했다. 순번을 읽을 소비자(배포)가 없고 알림 수단도 미결(04:1192)이다. 라벨·`lvl_cnt` 경미 수정은 마루 코드 수정 화면의 헤더 카드(TSK-06-02) 몫이라 이 Task 범위 밖이다. 근거 순위: 결정 기록·선행 산출물 > 원천 문장(배포 보류로 효력이 멈춘 부분).
- **반려되면 재작업할 방향**: ②면 `patch` 끝에 `UPDATE TB_MDM_CODE SET LAST_CHG_SEQ = LAST_CHG_SEQ + 1 WHERE MARU_CODE_ID = ?`(두 방언 같은 문장)를 넣고 S13 의 `LAST_CHG_SEQ` 단언을 +1 로 바꾼다. ③은 배포 영역 설계가 먼저 필요하다.

### D8 — 경미 수정 거부 범위: 상태가 DRAFT·REQUESTED·APPROVED 인 버전이 같은 키에 from_ver 행을 가졌을 때
- **질문**: 원천은 "DRAFT V 가 같은 키를 수정해 `from_ver = V` 행을 만들어 두었으면 거부"(04:544)라고만 한다. 미래 RELEASED(apply_from 전)·REQUESTED·APPROVED 는 어떻게 보는가.
- **선택지**: ① DRAFT·REQUESTED·APPROVED(아직 확정되지 않은 미적용 버전)만. ② DRAFT 만. ③ 미래 RELEASED 까지 포함.
- **택한 것**: ①.
- **근거와 근거 순위**: 거부 이유는 "옛 행만 고치면 V 적용 뒤 옛 값이 되살아난다"(04:544)다. REQUESTED·APPROVED 도 같은 상황이지만(결재 보류로 지금은 생기지 않는다) 편집 불가 상태라 "DRAFT에서 고치세요"로 안내할 수 있게 같은 문구를 쓴다. 미래 RELEASED 는 새 행이 이미 확정돼 있어 옛 행 패치는 과거 구간만 고치는 정상 동작이다. spec 문구 "DRAFT 가 같은 키를 고쳤으면 거부"는 ①과 ② 모두 만족한다.
- **반려되면 재작업할 방향**: ②면 상태 조건을 DRAFT 하나로 줄인다. ③이면 `applyFrom > now` 인 RELEASED 도 넣고 S14 에 미래 RELEASED 사례를 더한다.

### D9 — 트리·콤보는 FE 순수 함수(시뮬레이터 규칙), 카테고리 해석·저장 검사는 서버
- **질문**: 트리 보기와 미리보기 콤보를 어디서 만드는가. 수용 기준 "시뮬레이터 트리 결과와 일치"를 어느 게이트에서 고정하는가.
- **선택지**: ① FE(`code-tree.ts`·`combo.ts`) + vitest 가 시뮬레이터 출력 전문과 비교. ② 서버 Java 가 트리를 만들어 내려 주고 JUnit 이 비교. ③ 시안 JS 의 `ord`·`comboSteps` 를 그대로 옮김.
- **택한 것**: ①.
- **근거와 근거 순위**: 원천은 "표시 순서는 앱이 정한다"(04:808)고, 시안도 편집 중 행으로 트리를 다시 그린다(미저장 편집 반영) — 서버 왕복 없이 FE 가 그리는 편이 맞다. 게이트 2(m-mdm vitest)가 고정한다. 해석과 저장 검사는 "서버에서만 한다"(04:183)와 저장 판정의 권위 때문에 서버다. ③은 시안 `ord` 가 시뮬레이터와 다른 규칙이라 수용 기준과 어긋날 수 있다(§1.4). 근거 순위: spec 수용 기준(시뮬레이터) > 시안.
- **반려되면 재작업할 방향**: ②면 `common.mastercode.MasterCodeTree` 를 만들고 `view` 응답에 트리 노드를 싣으며, 시뮬레이터 비교 시험을 JUnit 으로 옮긴다. FE 는 받은 노드를 그대로 그린다.

### D10 — 계층 검사의 비교 기준은 V 에 유효한 행(시뮬레이터의 "닫힌 행 포함"은 05 규칙)
- **질문**: 시뮬레이터 `check()` 는 닫힌 행도 비교한다(05 마스터데이터 규칙). 04:112 는 "그 버전에 유효한 행을 기준으로 본다"다. 어느 쪽인가.
- **선택지**: ① V 에 유효한 행만(자기 코드 제외). ② 닫힌 행 포함.
- **택한 것**: ①.
- **근거와 근거 순위**: 04:112(spec prd-ref 「계층과 다목적 분류」, 요구사항 층)가 명시한다. 시뮬레이터 표본은 단일 버전이라 두 규칙의 결과가 같아 수용 기준과 충돌하지 않는다(H1 이 네 사례를 모두 통과). 자기 코드 제외는 시뮬레이터가 "새 행"만 다뤄서 드러나지 않은 경우(기존 행 수정)의 필수 조건이다.
- **반려되면 재작업할 방향**: ②면 비교 행 목록에 그 마루 코드의 모든 ITEM 행을 넘기고 S12 를 거부 단언으로 바꾼다.

### D11 — 카테고리 미리보기는 읽기 전용이고, 해석기는 `common.mastercode` 에 공용으로 둔다
- **질문**: spec 의 "카테고리 선택 미리보기 패널"과 06-04 의 카테고리 편집을 어떻게 가르는가. 해석기는 누가 어디에 두는가.
- **선택지**: ① 이 Task 는 미리보기(해석 결과·근거·콤보 읽기)만 하고, 해석기는 `common.mastercode.MasterCodeCategoryResolver` 로 두어 06-04(편집 중 재해석)·06-05(확정 검사 2항)가 재사용. ② 미리보기 안에서 정의 편집(저장 전 편집 내용 기준 재해석)까지. ③ 해석기를 화면 패키지 안에 둔다.
- **택한 것**: ①.
- **근거와 근거 순위**: 원천 화면 표(04:820)의 코드 편집 행은 "카테고리를 고르면 매칭 열이 나온다"까지이고, 정의 편집·저장 전 재해석은 카테고리 편집 행(04:821, 06-04)에 있다. 시안의 코드 편집 미리보기도 `ov` 없이 저장된 정의 기준이다(시안:737). 원천과 어긋나지 않는다. ③은 06-04·06-05 가 같은 규칙을 다시 만들게 한다. 대가: 06-04 가 동시에 자기 해석기를 만들면 중복이 생긴다 — 머지 때 하나로 합친다.
- **반려되면 재작업할 방향**: ②면 미리보기 패널에 REGEX 식·대상 칸 입력을 두고 `compare` 요청에 미저장 정의를 싣는 필드를 더한다(06-04 와 범위 조정 필요).

### D12 — 화면 설계 산출물은 기능설계서 1종을 Build 가 만든다
- **질문**: RULE.md·Mes-Guide 는 화면마다 설계 산출물 5종을 요구한다. 이 Task 는 무엇을 언제 만드는가.
- **선택지**: ① 선례대로 기능설계서 1종을 `docs/mdm/screens/codeItemEdit/` 에 Build 가 만든다(내용은 이 문서 §6.6·§6.8). ② Design 이 지금 만든다. ③ 5종 전부.
- **택한 것**: ①.
- **근거와 근거 순위**: TSK-04-02 D14·TSK-04-03·TSK-04-04 D5(머지된 mdm 화면 Task, 리포 관례)가 As-Is 없는 신규 화면을 1종으로 줄였다. 이 Phase 의 산출물은 팀장 지시로 design.md 하나다(②는 지시 범위 밖). ③은 As-Is 분석 전제 템플릿이라 대부분 "해당 없음"이 된다.
- **반려되면 재작업할 방향**: ③이면 분석리포트·디자인설계서·BPMN설계서·정합체크서를 템플릿으로 더하고 분석리포트는 "As-Is 없음"을 적는다.

### D13 — 필터 칩은 `GridBadge` + `Button`, 보기 전환은 `Tabs`, 미리보기 모드는 `Radio` 로 만든다(shared 확장 없음)
- **질문**: 시안의 필터 칩(`fchip`)·보기 토글·모드 버튼에 대응하는 컴포넌트가 shared 에 없다(Chip·SegmentedControl 없음). 화면에서 조립하는가, shared 를 넓히는가.
- **선택지**: ① 기존 export(`GridBadge`·`Button`·`Tabs`·`Radio`)를 조합한다. ② shared 에 Chip·SegmentedControl 래퍼를 더한다. ③ 화면이 `@mantine/core` 를 직접 쓴다(금지).
- **택한 것**: ①.
- **근거와 근거 순위**: mantine-aggrid-ui 규칙은 "래퍼가 요구를 못 채우면 화면에서 우회하지 않는다"이다. ①은 우회가 아니라 이미 있는 래퍼로 같은 기능(거르기 표시·해제, 보기 전환, 모드 선택)을 채운다. ②는 shared 변경과 공용 게이트(게이트 4)를 이 Task 에 끌어들인다. ③은 금지다.
- **반려되면 재작업할 방향**: ②면 shared 에 `Chip`(닫기 버튼 포함)·`SegmentedControl` 래퍼를 Part B §17 절차로 추가·빌드하고 이 화면이 그것을 쓰도록 바꾼다.

### D14 — 그리드에 `설명` 열을 둔다
- **질문**: 원천 화면 표(04:820)의 그리드 열은 "코드·이름·약칭·순서, 계층 칸, 라벨 있는 추가 컬럼"이고 설명이 없다. 그러면 DRAFT 에서 코드 설명을 입력할 곳이 없다.
- **선택지**: ① 마지막 값 열로 `설명` 을 둔다. ② 원천 그대로 두지 않는다(설명은 경미 수정으로만).
- **택한 것**: ①.
- **근거와 근거 순위**: 코드 테이블이 갖는 값은 "코드값·이름·약칭·순서·설명과 계층 칸, 추가 컬럼"(04:155)이고, 04:531 도 설명을 버전 행의 값으로 다룬다. ②는 새 코드의 설명을 RELEASED 뒤 경미 수정으로만 넣게 만들어 DRAFT 편집을 불완전하게 한다.
- **반려되면 재작업할 방향**: ②면 그리드에서 설명 열을 빼고 요청 행의 `description` 은 CHANGED 때 기존 값을 그대로 보낸다.

### D15 — 경미 수정 패널은 선택 버전이 경미 수정 가능하면 늘 보인다
- **질문**: §6.8 은 경미 수정 패널을 "RELEASED·patchable 이고 행을 골랐을 때만" 보인다고 했다. 행을 고르기 전에는 패널을 숨기는가, 안내와 함께 보이는가.
- **선택지**: ① `patchable` 이면 늘 보이고 행이 없으면 `그리드에서 고칠 행을 고르세요.` 안내. ② 행을 골랐을 때만 보인다(설계 원문).
- **택한 것**: ①.
- **근거와 근거 순위**: spec·원천(04:522-549, 시안 경미 수정 패널)은 표시 시점을 정하지 않았다. ①은 RELEASED 에서 무엇을 할 수 있는지(이름·약칭·순서·설명만)를 행을 고르기 전에 알려 주고, page-render ⑥(CANCELLED 에 패널 없음)을 행 선택 없이 판정할 수 있게 한다. 잠김 규칙(수용 기준 5·6)은 두 선택지에서 같다. 근거 순위: 원천의 공백 → 설계(미승인) 문구보다 시험 가능성을 우선했다.
- **반려되면 재작업할 방향**: `page.tsx` 에서 패널 조건을 `patchable && patchRowValue` 로 바꾸고, page-render ④·⑥ 이 행을 고른 뒤 판정하도록(행 클릭을 재현하는 도우미를 더해) 고친다.

---

## Verify 결과 (Phase 04, 2026-09-24 — 1회차 haiku + 재시도 sonnet)

1회차(haiku)는 게이트 1·3·4·5 와 E2E mdm-codeItemEdit 6/6 을 확인했지만 변이 8개 중 6개(경미 수정 잠금·역할, editable 소유자, 트리 정렬, 샘플 데이터 저장 검사, DRAFT 같은 키 거부)를 실제로 넣어 보지 않고 "구조 파악"으로만 남겼고, E2E 전체 판정의 domainMng 무관 근거도 대지 않았다. 재시도(sonnet)가 아래 「변이 재확인 표」·「E2E」 절에서 이 둘을 마저 끝냈다.

### 게이트

| 게이트 | 기대값 | 결과 | 판정 |
|---|---|---|---|
| 1. Backend testAll | 2430/0 | 2430/0 | ✓ pass |
| 2. Frontend build:libs + test | 31/355 | 1회차 352 passed(evalex-perf 3 간헐 실패 → 단독 재실행 통과) → **재시도 31/355 전체 한 번에 통과**(evalex-perf 포함 간헐 재현 안 됨) | ✓ pass |
| 3. Frontend lint | pass | pass | ✓ pass |
| 4. Frontend test:unit:shared | 23/156 | 156/156 | ✓ pass |
| 5. Contract check | 0/0/29 | 0/0/29 | ✓ pass |

### E2E (2026-09-24 재시도, sonnet 승격)

전체 mdm 스펙(7개 파일) 새 SQLite DB·단일 워커로 순차 실행(§4.11 절차):
- **mdm-codeItemEdit.spec.ts**: 6/6 passed ✓ (T1-T6, 수용기준 3 충족)
- mdm-columnMng.spec.ts: 4/4 passed ✓
- mdm-unitMng.spec.ts: 4/4 passed ✓
- mdm-termMng.spec.ts: 4/4 passed ✓
- mdm-sample-smoke.spec.ts: 1/1 passed ✓
- mdm-shell-rbac-smoke.spec.ts: 4/4 passed ✓
- mdm-domainMng.spec.ts: 1 passed(E1), 1 failed(E2~E6), 1 did not run(E7, serial 모드에서 앞 실패로 연쇄 skip)

**전체**: 24 passed, 1 failed, 1 skipped(연쇄)

**domainMng E2~E6 실패 판정 — 무관(간헐)**: 실패 메시지는 `.domain-mng__preview-std` 가 `abc` 입력 뒤 800ms 안에 "표준 실패"로 바뀌지 않고 "-"(초기값)로 남는 타이밍 어긋남이다(`e2e/mdm-domainMng.spec.ts:150`). 이 Task 변경분(`git diff --stat 3fbf073..HEAD`)은 `src/backend/mdm/**/dmc/codeItemEdit/**`·`src/backend/mdm/**/common/mastercode/**`·`src/frontend/m-mdm/pages/dmc/codeItemEdit/**`·`DataInitializer.java`(`seedMdmCodeItemEditMenu()` 27줄 추가, 기존 `seedMdmDomainMngMenu()` 호출부는 건드리지 않음)뿐이며, domainMng 화면·서비스·시드나 domainMng 이 쓰는 공용 m-mdm 컴포넌트를 전혀 건드리지 않는다. 전체 스위트 직후 **`mdm-domainMng.spec.ts` 단독 재실행 결과 3/3 passed**(E1·E2~E6·E7 모두 통과, 8.2s) — 선례 TSK-04-02 기록의 "domainMng 간헐(타 Task, 단독 3/3)"과 같은 패턴이다. 이 Task 원인이 아니라 스펙 간 상태 간섭(디바운스 타이밍)에 의한 간헐 실패로 판정한다.

서버 기동: BE 18603(mcm)·**18698(mdm, 18696 은 형제 워크트리 dflow-16de6362 의 프로세스가 점유 중이라 186xx 대역에서 다른 번호로 선택)**, FE 15603
DB: 새 SQLite, 시드 대조 diff 출력 없음, 픽스처 E2E_PROC·E2E_STEEL·E2E_EMPTY, TERM 5·DOMAIN 4·CODE_ITEM 3개 마루코드/12행
부산물 정리: TSK-06-03/screens/*.png 만 갱신되어 남고, 다른 Task screens·`next-env.d.ts`·`test-results` 는 `git checkout`·`git clean` 으로 복원 확인
종료 및 slot 해제 완료 ✓(자기 PID·자기 포트 리스너만 종료, `pkill`·`killall`·`pgrep -f`·전역 `gradlew --stop` 미사용)

### 변이 재확인 표 (2026-09-24 재시도, sonnet 승격 — 8개 전부 실제로 넣고 빨강 확인)

| # | 불변규칙 | 변이 내용 | 잡는 시험 | RED 여부 | 원복 확인 |
|---|---|---|---|---|---|
| 1 | DRAFT 검사 | requireDraft() 제거 | G16 | ✓(1회차 확인) | git checkout ✓ |
| 2 | 계층 중간 칸 | LVL_GAP 검사 제거 | H1 | ✓(1회차 확인) | git checkout ✓ |
| 3 | 경미 수정 잠금(a) | `patch()` 에 `target.setLvl1("MUTATED")` 추가 | O5·S13 | ✓ RED — O5 `expected: <CGCC-P\|KS\|270\|9999> but was: <CGCC-P\|MUTATED\|270\|9999>`, S13 `expected: <A\|1\|9999\|G\|\|a1> but was: <A\|1\|9999\|MUTATED\|\|a1>` | `git checkout` 후 `git diff --stat -- src` 빈 결과 ✓ |
| 4 | 경미 수정 역할(b) | `requireSteward()` 본문 비움 | S17 | ✓ RED — `Expected BusinessException to be thrown, but nothing was thrown` | 원복 확인 ✓ |
| 5 | editable 소유자(c) | `editable` 판정에서 `ownerId` 일치 조건 제거 | S3 | ✓ RED — `S3_DRAFT_소유자만_편집_가능` `expected: <false> but was: <true>` | 원복 확인 ✓ |
| 6 | 트리 정렬(d) | `order()` 의 코드 정렬을 `(seq, 값)` → `값` 단독으로 변경 | code-tree.test.ts | ✓ RED — ORG `PH-A`/`PH-B` 순서 어긋남, flat seq 시나리오 `["A","B","C"]` 로 나와야 할 것이 `["C","A","B"]` | 원복 확인 ✓ |
| 7 | 샘플 데이터/저장 검사(e) | `MasterCodeItemChecks.checkRow` 의 코드·계층 칸 콤마·공백 검사(`FORBIDDEN` 매칭) 제거 | H3(`MasterCodeItemChecksTest`) | ✓ RED — `H3_코드의_공백_콤마_탭과_계층_칸_공백은_거부_하이픈은_통과` 실패 | 원복 확인 ✓ |
| 8 | DRAFT 같은 키 거부(f) | `patch()` 의 `patchBlocked` 검사(§D8) 블록 제거 | S14 | ✓ RED — `Expected BusinessException to be thrown, but nothing was thrown` | 원복 확인 ✓ |

절차: 매 변이마다 `git status --short` 로 시작 전 클린 확인 → 변이 적용 → 백엔드는 `cd src/backend/mdm && ../gradlew :lib:test :api:test --no-daemon --console=plain`(heavy.sh 로 감쌈), FE(#6)는 `pnpm --filter @dk-oasis/m-mdm test` 로 판정 → RED 확인 후 `git checkout -- <파일>` → `git diff --stat -- src` 로 원복 확인. 8개 전부 잡혔다(코드 커버리지 갭 없음).

### 도커 대체 대조

1. `/usr/bin/git diff 3fbf073..HEAD -- src/backend/mdm` 에서 `createNativeQuery`·`JdbcTemplate`·`nativeQuery` 추가 없음(테스트 제외) ✓
2. `MasterCodeRows.java` JPQL 에 버전 칸 비교 없음 ✓
3. 구현대로 `MARU_CODE_ID` 등치 JPQL, Java `compareTo` 비교 ✓

### 수용기준 판정

| # | 수용기준(spec) | 검증 경로 | 결과 |
|---|---|---|---|
| AC1 | 04 「샘플 데이터」 저장 검사 결과 일치 | `CodeItemEditSampleDataTest` SD1~7, `MasterCodeItemChecksTest` H1 (게이트 1 통과) | ✓ 충족 |
| AC2 | RELEASED·CANCELLED 는 읽기 전용 diff | `page-render.test.ts` ④⑥, E2E T5 (게이트 2 통과) | ✓ 충족 |
| AC3 | 포털 메뉴에서 화면이 열리고 e2e 통과 | E2E mdm-codeItemEdit.spec.ts T1~T6 모두 passed (게이트 2·5 통과) | ✓ 충족 |
| AC4 | `sql/04-hier-tree-sim.py` 트리 결과 일치 | `code-tree.test.ts`, `combo.test.ts` (게이트 2 통과) | ✓ 충족 |
| AC5 | 코드·계층·attr 값은 잠김 | `page-render.test.ts` ③④, E2E T5, O5 (게이트 2·1 통과) | ✓ 충족 |
| AC6 | DRAFT 가 같은 키를 고쳤으면 거부 | `page-render.test.ts` ⑤, E2E T5, S14 (게이트 2·1 통과) | ✓ 충족 |

---

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 도커 금지로 생략: cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain

이 Task 는 마이그레이션을 추가하지 않고(F1) 새 네이티브 SQL 도 쓰지 않는다. 읽기는 `MARU_CODE_ID` 등치 JPQL 뿐이고 버전 범위 비교는 Java `compareTo` 로 한다(§2). 그래서 SQLite↔MSSQL 차이가 들어올 자리는 JPA 가 만드는 INSERT·UPDATE·DELETE 뿐이며, 이것은 06-01 이 `MdmCodeItem`·`MdmCodeCateItem`·`MdmCodeVer` 엔티티 왕복으로 확인한 매핑 그대로다. MSSQL 쪽의 남은 차이(코드·키 칼럼 `COLLATE Latin1_General_100_BIN2` 로 대소문자 구분 비교, DECIMAL(7,3) 정확 비교)는 이 Task 의 Java 쪽 비교(대소문자 구분 문자열 등치, `compareTo`)와 같은 의미라 대조 리뷰로 확인한다. Verify 는 다음을 확인해 기록한다:

1. `git diff <기점>..HEAD -- src/backend/mdm` 에 `createNativeQuery`·`JdbcTemplate`·`@Query(nativeQuery` 가 새로 없다(시험 픽스처 제외).
2. `MasterCodeRows` 의 JPQL 에 버전 칸(`fromVer`·`toVer`·`ver`) 비교가 없다.
3. 시험 픽스처의 네이티브 INSERT(시험 전용)는 SQLite 게이트에서만 돈다.

도커 금지 때문에 확인하지 못한 수용 기준은 없다(6개 모두 SQLite 게이트·vitest·E2E 로 확인한다).
