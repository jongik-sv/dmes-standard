# TSK-06-02 설계 — 마루 코드 조회·등록·수정·버전

> Phase 02 Design. 워크트리 `/Users/jji/project/dmes-standard/dflow-16de6362`, 브랜치 `agent/16de6362-maru-code-mng`, 기점 origin/dev `3fbf073`. 도커 금지 모드(워커 기본).
> 에이전트 프롬프트(`item.agent_prompt`) 없음. 팀장 지시(범위 경계·구현 조각·E2E 서버 절차·D1)를 제약으로 따른다.
> 근거 강약: spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물. spec 이 `prd-ref` 로 지목한 원천 `docs/mdm/design/basic/04-master-code-deploy-full.md`(이하 `04:행`)는 spec 과 같은 층으로 읽는다. ADR-0002·0003 은 PROPOSED(미승인)다.
> **그룹 코드는 `dmc` 다(D1).** spec 의 `mdc/codeMng`·`mdc/codeEdit` 는 T2 확정 이전 표기로 본다. 이하 모든 경로·componentPath·메뉴는 `dmc`.
> **Build 는 이 문서만 보고 구현한다.** 원천을 다시 읽을 필요가 없게 §0·§6 에 사실·이름·시그니처를 모았다.

---

## 0. 조사로 확인한 사실

경로 접두: `L=src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`, `AT=src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm`, `FE=src/frontend`.

### 0.1 이미 있는 것(재사용, 새로 만들지 않음)

| # | 사실 | 근거 |
|---|---|---|
| F1 | 엔티티 `MdmCode`(`@Id maruCodeId`, `maruCodeName`, `status="CREATED"`, `sourceKind`, `sourceSystem`, `description`, `attr01Name`~`attr10Name`, `int lvlCnt=0`, 생성자 `(maruCodeId, maruCodeName, sourceKind)`, ID setter 없음, `LAST_CHG_SEQ` 미매핑), `MdmCodeVer`(`@IdClass MdmCodeVerId`, `ver` BigDecimal(7,3), `verKind`, `restoredFrom`, `status="DRAFT"`, `ownerId`, `applyFrom/applyTo/releasedAt…`(세터가 초 절단), `long rowVersion=0` **`@Version` 아님·setter 없음**, 감사 카운터 칼럼 `AUD_VER`, 생성자 `(maruCodeId, ver, verKind)`), `MdmCodeItem`(PK `maruCodeId,code,fromVer`, `toVer=OPEN_TO_VER`, `name, alterName, Integer seq, description, lvl1-5, attr01-10`), `MdmCodeCate`(PK `maruCodeId,cateId,fromVer`, 생성자 `(maruCodeId,cateId,fromVer,defKind)`, `toVer, cateName, defExpr, defTarget, description` 모두 String), `MdmCodeCateItem`(PK `maruCodeId,cateId,code,fromVer`, `toVer`). 게터는 BigDecimal 을 scale 3 으로 돌려주고 IdClass 동등성은 scale 무관 | `L/entity/MdmCode*.java`, TSK-06-01 §6.2 |
| F2 | 리포지토리 `MdmCodeRepository`(`JpaRepository<MdmCode,String>`)·`MdmCodeVerRepository`·`MdmCodeItemRepository`·`MdmCodeCateRepository`·`MdmCodeCateItemRepository` — **파생 쿼리 0개**. `MdmDataRepository extends JpaRepository<MdmData,String>`(TB_MDM_DATA, `@Id MARU_DATA_ID`) | `L/repository/*` |
| F3 | Flyway 최신은 두 방언 V11(origin/dev). V9 = 04 표 7개, V10 = TB_MDM_DATA. **이 Task 는 마이그레이션을 만들지 않는다** | `git ls-tree origin/dev …/sqlite/` |
| F4 | 계약 `contract.mastercode`: `MasterCodeConventions`(`FIRST_VER=1.000`, `OPEN_TO_VER=9999.000`, `MAX_MINOR=999`, `MAX_MAJOR=9998`, `LVL_CNT_MIN/MAX/DEFAULT=0/5/0`, `LVL_SLOTS=5`, `ATTR_SLOTS=10`, `CODE_FORBIDDEN_CHAR_PATTERN="[,\\s]"`), `MasterCodeSourceKind{MDM,EXTERNAL}`, `MasterCodeVerKind{MAJOR,MINOR}`, `MasterCodeSegmentTable{ITEM,CATE,CATE_ITEM}.physicalTable()`, `MasterCodeVersionView(VersionRef, items, categories, cateItems)`, `MasterCodeItemRow/CateRow/CateItemRow/ItemValues`, `MasterCodeSegmentService`(12개 메서드, 06-02 몫은 `createBaseCategory`·`fillFrom`), `MasterCodeDiffConventions`(`":"`, `","`) | `L/contract/mastercode/*` |
| F5 | 카테고리 계약: `CategoryConventions.BASE_CATE_ID="BASE"`, `BASE_DEF_KIND=CategoryKind.REGEX`, `BASE_DEF_EXPR=".*"`, `CategoryOwner.MASTER_CODE.baseDefTarget()=CODE`, `MaruIdKind{MASTER_CODE,MASTER_DATA}`, `MaruIdNamespace{ kind(); contains(String) }`, `MaruIdRules.FORBIDDEN_CHAR_PATTERN="[.,\\s]"` | `L/contract/category/*` |
| F6 | 버전 계약: `VersionRef(target, objectId, ver)`, `VersionTarget.MASTER_CODE("TB_MDM_CODE_VER",3)`, `VersionStatus{DRAFT,REQUESTED,APPROVED,RELEASED,CANCELLED}`, `MaruObjectStatus{CREATED,INUSE,DEPRECATED}`, `VersionConventions.OPEN_END=9999-12-31T00:00:00`, `VersionDiff/VersionDiffEntry(key, DiffKind, old, new)`. `VersionStateService{ confirm(ConfirmCommand); void deleteDraft(VersionRef, long expectedRowVersion, String userId) }`, `DraftOwnershipService{ long acquire(ref, rv, userId); long release(ref, rv, ownerId); long handover(ref, rv, ownerId, newOwnerId) }`(반환 = 새 rv), `VersionWriteGuard{ void checkCanCreateVersion(target, objectId) /*미적용 있으면 MDM006, 쓰기 없음*/; long beginDraftWrite(ref, rv, userId) }`, `VersionDraftDeletionSpi{ target(); void beforeDraftDelete(VersionRef) }` | `L/contract/version/*` |
| F7 | 공통 구현(`L/common/version`): `DefaultVersionStateService`·`DefaultDraftOwnershipService`·`DefaultVersionWriteGuard` 는 `@Transactional` 없이 `TransactionTemplate`(호출자 트랜잭션에 합류). `deleteDraft` 순서 = 행 로드(없으면 MDM001) → 소유자(MDM003) → rv(MDM001) → DRAFT(MDM002) → **`spis.draftDeletion(target).beforeDraftDelete(ref)`** → `casDeleteDraft`. `acquire` 만 `requireSteward`(MDM013)를 부르고 `release`·`handover`·`deleteDraft`·`checkCanCreateVersion` 은 **역할을 보지 않는다**. 사용자 ID 는 인자로 받고 현재 사용자와 대조하지 않는다. `acquire` 는 주인이 있으면 MDM004(자기 자신이어도). `handover` 는 대상이 비었거나 자기 자신이거나 `MdmStewardDirectory.isSteward=false` 면 MDM005 | `DefaultVersionStateService.java:116-128`, `DefaultDraftOwnershipService.java:44-92`, `VersionPreconditions.java` |
| F8 | "미적용" 정의 = `DRAFT` 이거나 `RELEASED` 이면서 `applyFrom.isAfter(now)`(경계 `applyFrom == now` 는 적용됨). `VersionPreconditions.isUnapplied` 는 package-private 이라 영역 코드가 같은 식을 따로 쓴다 | `VersionPreconditions.java:71-77` |
| F9 | 공통 서비스는 **새 버전 INSERT·채번·DEPRECATED 전이를 하지 않는다**(영역 몫). 부모 CREATED→INUSE 는 확정 때 `markParentInUse` 만. ADR-0002 D6 은 "그 밖에는 상위 객체 쓰기 경로에서 같은 트랜잭션에 올리고, 조회는 계산값" | `VersionTransition.java`, ADR-0002 D1·D6 |
| F10 | `VersionRowStore` 패턴(네이티브 SQL 정본): `entityManager.flush()` 뒤 `createNativeQuery(sql).unwrap(NativeQuery.class)`, 버전 키 바인딩은 `.setParameter("ver", ref.ver().setScale(3))`, 일시는 `MdmTemporalBinder.toDb(LocalDateTime)`/`fromDb(Object)`, VER 는 `CAST(VER AS VARCHAR(40))` 로 읽어 `new BigDecimal(s).setScale(3)`(SQLite NUMERIC 친화도: 1.000→integer, 1.001→real), 감사 UPDATE 는 `U_USR_ID/U_AT/U_SVC_ID/U_PGM_ID` 와 카운터 `COALESCE(c,0)+1`, 스탬프는 `MdmNativeAuditSupport.currentStamp()`→`AuditStamp(userId, serviceId, programId, at)` | `VersionRowStore.java:43-60,181-226` |
| F11 | **공통 서비스는 네이티브 UPDATE 로 바꾸므로 같은 영속성 컨텍스트에 이미 올라온 `MdmCodeVer` 는 갱신되지 않는다.** 공통 서비스를 부른 뒤 응답을 만들 때는 엔티티를 다시 쓰지 않는다 | `MdmCodeVer.java:24-25`, TSK-01-03 §7 |
| F12 | `VersionSpiRegistry` 는 `List<VersionDraftDeletionSpi>`·`List<VersionConfirmCheckSpi>` 를 대상별로 모으고 **같은 대상이 둘이면 기동 실패**(`IllegalStateException`), 없으면 그 대상 DRAFT 삭제가 fail-closed(`IllegalStateException("DRAFT 삭제 훅이 등록되지 않았습니다: MASTER_CODE")`). 운영 코드에 MASTER_CODE 삭제 훅이 **없다** → 지금 codeEdit 의 DRAFT 삭제는 불가능 | `VersionSpiRegistry.java:25-57` |
| F13 | `AT/common/version/VersionScenarioTestConfig`(@TestConfiguration)가 `FakeDraftDeletion`(MASTER_CODE·BUSINESS_RULE)·`FakeConfirmCheck`(둘)을 `@Bean` 으로 등록한다. 이것을 import 하는 `@SpringBootTest` 5개(`VersionStateServiceSqliteTest`, `MasterCodeVersionStateSqliteTest`, `BusinessRuleVersionScenarioSqliteTest`, mssqlTest 2개)는 운영 MASTER_CODE 훅이 생기면 F12 로 **컨텍스트가 뜨지 않는다**. 키트(`AbstractVersionStateScenarioTest:451`)는 가짜 훅에 실패·행위를 심는다 | 해당 파일 |
| F14 | 운영 `MaruIdNamespace` 구현 0개. 소비처는 `ColumnMngService:384-387` 하나 — **MASTER_DATA 빈이 없으면 검사를 건너뛴다**. 운영 MASTER_DATA 빈을 등록하면 columnMng 의 동작·테스트(C28 "빈 없으면 생략")가 뒤집힌다. `MaruIdNamespace` 타입을 단일 빈으로 주입받는 곳은 없다(테스트는 구체 타입 `FakeMaruIdNamespace` 로 주입) | 그렙 |
| F15 | 엔진: `CodeLookup{ Optional<CodeRows> code(String) }`, `CodeRows(CodeHeader(maruCodeId,status), List<CodeVersionRow(ver,status,applyFrom,applyTo)>, List<CodeItemRow(code,fromVer,toVer,name,alterName,Integer seq,List<String> lvl,List<String> attrs)>, List<CodeCateRow(cateId,fromVer,toVer,defKind,defExpr,defTarget)>, List<CodeCateItemRow(cateId,code,fromVer,toVer)>)`. `DefaultCodeResolver(CodeLookup, CodeEffLookup)`(public): `codeList(id,cateId,baseDt)` 은 **헤더 status 가 DEPRECATED 면 빈 목록**(`:80-82`), `isMember(id,cateId,code,baseDt)` 는 RELEASED 버전만 보고 status 는 보지 않는다. MASTER 판정(`MasterQuery:59`)은 `codes.code(id).isPresent()` 로 코드/데이터를 가른다 | `maru-mdm-engine/.../spi/CodeLookup.java`, `code/DefaultCodeResolver.java` |
| F16 | mdm 은 운영 `CodeLookup` 빈이 없다(`MdmEngineConfig.EMPTY_CODES`). decisions.md:449 — "빈을 등록하면 R10 거부·MASTER 판정이 자동으로 켜진다"(TSK-04-03 동작이 바뀜) | `MdmEngineConfig.java`, `MdmCodeLookupAvailability.java` |
| F17 | 넘기기 대상 검사 포트 `MdmStewardDirectory{ boolean isSteward(String) }` 의 운영 구현은 `UnresolvedStewardDirectory`(항상 false) → **운영 넘기기는 늘 MDM005**. mdm 은 다른 사용자의 역할을 조회할 수단이 없다(권한 표는 mcm DB) | `common/security/*`, TSK-01-03 D7·F40 |
| F18 | 오류 코드(`MdmErrorCode`, `MdmErrors.of(code)` / `MdmErrors.of(code, detail, List.of())` → `BusinessException`, message = "기본문구: detail"): MDM001 rv/동시수정 "다른 사용자가 수정했습니다. 다시 불러오세요", MDM002 DRAFT 아님, MDM003 소유자 아님, MDM004 이미 선점, MDM005 넘기기 대상 담당자 아님, MDM006 "미적용 버전이 있어 새 버전을 만들 수 없습니다", MDM007 "미적용 버전이 2개입니다. 하나를 삭제하세요", MDM009 "허용되지 않는 상태 전이입니다", MDM011 "마루 코드·마루 데이터에 같은 ID 가 있습니다", MDM013 "담당자 역할이 있어야 할 수 있습니다", MDM021 "입력값이 올바르지 않습니다". **BPMN serviceTask 안에서 던지면 화면에는 `meta.message` 만 오고 `meta.code="S001"`, `errors[]` 는 빈다** → 화면·E2E 는 문구의 앞부분으로 가린다 | `MdmErrorCode.java:14-45`, `MdmErrors.java`, TSK-04-04 F12 |
| F19 | 현재 사용자 `MdmCurrentUser{ userId(); roleIds() /*ROLE_ 접두 제거*/ }`(운영 `CactusMdmCurrentUser`). 역할 가드 선례 `MdmStdAdminGuard.requireStdAdmin()`(MDM016). 담당자 가드는 `VersionPreconditions.requireSteward` 뿐이고 package-private | `common/security/*` |
| F20 | 시계: `MdmClockConfig.mdmClock()` = `Clock.system(KST)` 빈, `MdmClockConfig.KST`. 공통 서비스는 `LocalDateTime.now(clock).truncatedTo(SECONDS)` | `MdmClockConfig.java` |
| F21 | **권한**: dmc 는 `MDM_STD_ADMIN→PERM_MDM_READ`, `MDM_STEWARD→PERM_MDM_CONFIRM`(dma 와 반대). E2E·HTTP 시험은 **담당자(`e2e_mdm_steward`, 역할 헤더 `MDM_STEWARD`)** 로 돈다. BFF 는 URL `module/serviceId/action` 키로 403 을 내며 FE 쪽 액션 화이트리스트는 없다. `MdmActions` 는 13개이고 `SecurityScreenContractTest` 가 "13개, lock·unlock·handover 없음"을 단언한다. ADR-0003 D5·TSK-01-03 인계는 소유권 액션 이름(권장 `lock/unlock/handover`)을 **첫 소유권 화면 Task** 가 확정하고 `allActions`·`PERM_MDM_EDIT`·`MdmActions`·시드 대조를 함께 고치라고 했다. `PERM_MDM_*` 는 `insertIfAbsent` 뿐이라 기존 DB 에 새 액션이 들어가지 않는다 | `MdmPermissions.java`, `SecurityScreenContractTest.java:65-74`, `DataInitializer.java:297-338,980-995`, ADR-0003 D5 |

### 0.2 서비스·BPMN·화면 관례(`dma` 선례)

| # | 관례 | 근거 |
|---|---|---|
| C1 | BE 패키지 `com.dongkuk.dmes.mdm.{group}.{screenId}.{dto,service}` 는 **lib 모듈**. `@Service("<screenId>Service")`, 생성자 주입, **`@Transactional` 금지**(CGLIB 가 파라미터 이름을 지워 `ParameterName must not be null`). 트랜잭션은 OASIS 프로세스가 건다(`cactus.oasis.transactional: true`) — 예외면 그 액션의 쓰기 전체 롤백 | `UnitMngService.java:36-40`, `application.yml:29-32` |
| C2 | 액션 메서드: 어노테이션 없는 `public`, 인자 DTO 하나(그리드가 있으면 `List<Map<String,Object>>` 추가 인자, 이름 = `grids.<이름>`). DTO 는 getter/setter 일반 class(record·Lombok 금지), 박싱 타입·String, params 안 배열 불가. 응답은 DTO 또는 `Map<String,Object>`(LinkedHashMap) — 화면은 `data.result` 를 읽는다 | `UnitSaveRequest.java`, `ColumnMngService.java:240-245` |
| C3 | BPMN: `process id=<screenId>`, `startEvent` → `exclusiveGateway id="actionGateway"`(`<camunda:property name="input" value="action"/>`) → `sequenceFlow name="<action>"`(conditionExpression 없음) → `serviceTask id="<action>Task" camunda:class="<bean>"` + 속성 `method`, `output=result`, `dto=<FQCN>` → 개별 `endEvent`. `grid` 속성·PropertyEL·MethodBinding 쓰지 않음. `documentation` 에 액션↔메서드 표. 위치 `src/backend/mdm/api/src/main/resources/services/dmc/<screenId>.bpmn` | `services/dma/unitMng.bpmn` |
| C4 | 시드(`src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java`, mdm lib 비의존이라 문자열): `insertMcmSecObjIfAbsent(objId, 이름, "mdm")` → `insertMcmSecMenuIfAbsent(menuId, menuSeq, fullSeq, 이름, "dmc", objectId)` → SYSADMIN `PERM_ALL` 매핑(`insertIfAbsentComposite` 블록) → `seedMdmObjectRbac(objectId, "dmc")`. `dmc` 폴더("마스터코드", 부모 `mdm`)는 이미 있다(`:879`). MENU_ID = OBJECT_ID = screenId, componentPath 는 조회 때 `{group}/{screenId}` 로 조립. FULL_SEQ 는 부팅 끝 `recomputeMenuFullSeq()` 가 다시 매긴다 | `DataInitializer.java:866-928,1007-1030`, TSK-04-04 블록 `:910-925` |
| C5 | FE: `FE/m-mdm/pages/dmc/<screenId>/page.tsx`(`"use client"`, `export default function …Page(props: PageProps)`), 셸 `@/shell` 의 `MdmPageLayout{group,screenId,title,buttons}`(breadcrumb "마루 MDM > 마스터코드 > …", 버튼 권한 `objId=screenId`), `VersionStatusBadge{status, applyFrom?, now?}`, `DraftLockBadge{status, ownerId?, currentUserId?}`("선점 가능"/"편집 중(나)"/"잠김 · {owner} 편집 중"). 공용: `@dk-oasis/shared/layout`(`ContentBody, ContentPanel, SearchArea, SearchField, DETAIL_*`, `ErrorModal{message,onClose}`), `@dk-oasis/shared/grid`(`AgDataGrid, GridPanel, GridColumn`), `@dk-oasis/shared/form`(`Input, Textarea, Select, ComboBox, Radio, Button`), `@dk-oasis/shared/modal`(`Modal{open,title,footer,onClose,size}`), `@dk-oasis/shared/message-provider`(`useMessage().showMessage({message, alertType:"confirm", onConfirm, toast})`). m-mdm 은 `@mantine/*` 를 직접 import 하지 않는다 | `pages/dma/*`, `src/shell/*` |
| C6 | FE OASIS 호출: `apiRequest`(`@dk-oasis/shared/http`) `POST /api/mdm/oasis/<svc>/<action>` 본문 `{meta:{menuId:svc}, params: omitNullish(params)}` → `unwrap`(`meta.success===false` 면 `throw new Error(meta.message)`, 성공이면 `data`·`data.result` 병합). 복제 대상 `pages/dma/columnMng/api.ts:28-67`(`unwrap`, `callOasis`) | 해당 파일 |
| C7 | 버튼 권한: `PageButton{id,label,onClick,type?,disabled?,action?}`, `useUserButtonRbac(true)`·`canDoButton(state, objId, action)`(`@dk-oasis/shared/layout`) — 액션 문자열은 임의(`lock` 등)여도 서버 권한 행과 문자열 비교만 한다. 권한 없는 버튼은 비활성 | `shared/src/layout/PageLayout.tsx:27-135` |
| C8 | **포털 화면 간 파라미터 전달 API 가 없다.** 탭 열기는 `window.dispatchEvent(new CustomEvent("portal-open-tab",{detail:{pageId}}))` 하나(pageId = `mdm:dmc/codeEdit`), 이미 열린 탭은 다시 마운트하지 않고 활성화만 하며 그때 `portal-tab-activated`(`detail.tabId`) 가 발생한다. 페이지 props 는 `{tabId, snapshot, onSnapshotChange}`(snapshot 은 새로고침 뒤 복원). PAGE_REGISTRY 에 없는 pageId 는 "등록된 페이지를 찾을 수 없습니다" | `shared/src/portal-shell/portal-shell.tsx:368-408,579-589,693-698`, `types.ts:39-43` |
| C9 | `m-mcm/lib/generated/page-registry.ts` 는 코드젠 산출물(git 추적) — `cd src/frontend/m-mcm && pnpm generate:page-registry` 로 재생성해 커밋(선례 `7b5898b`). `FE/m-mdm/tsup.config.ts` 의 pages entry 에 한 줄씩 **수동 추가**(`tests/tsup-entries.smoke.test.ts` 가 page.tsx 와 1:1 강제). 팝업·모달 컴포넌트 파일은 스캔 대상이 아니다 | TSK-04-04, 해당 파일 |
| C10 | vitest: `FE/m-mdm/tests/<group>/<screen>/*.test.ts`, 렌더 테스트는 첫 줄 `/** @vitest-environment happy-dom */`, `DmesUiProvider` 로 감싸 `createRoot`+`act`, `globalThis.fetch` 를 URL 별 가짜로(`/oasis/<svc>/<action>` → `{meta:{success:true},data:{result}}`, `/api/auth/me` → `{user:{id:"tester"}}`, `/api/mcm/oasis/secUser/myButtonEndpoints` → `{grids:{buttons:{rows:[{objId:"*",action:"*",endpoint:"*",httpMethod:"*"}]}}}`), 전역 `"__dkOasisButtonRbacStore__"` 를 매번 지운다. 모달은 `document.body` 에서 찾는다 | `tests/dma/unitMng/unit-mng-page.test.ts` |
| C11 | BE 테스트 골격: `@SpringBootTest(webEnvironment=MOCK)` + `@ActiveProfiles("local")` + `@TempDir` SQLite + `@DynamicPropertySource`(`spring.datasource.url=jdbc:sqlite:<tmp>`), `@Import(DmaTestSupport.Config.class)`(`@Primary MutableCurrentUser.set(userId, roles)`, `FakeMaruIdNamespace`). 서비스 직접 호출은 `TransactionTemplate` 로 감싼다. HTTP 는 `DmaOasisHttpTest` 골격(`RANDOM_PORT`, `POST http://127.0.0.1:{port}/oasis/{svc}/{action}`, 헤더 `X-Client-Key`·`X-Authenticated-User`·`X-Authenticated-Role`, 실패 주입은 SQLite 트리거) | `ColumnMngServiceSqliteTest.java:50-107`, `DmaOasisHttpTest.java` |
| C12 | E2E: `FE/e2e/mdm-*.spec.ts`, 환경변수 `SMOKE_MCM_BASE_URL`·`SMOKE_LOGIN_PASSWORD`(admin123)·사용자 변수, `SUFFIX=Date.now().toString(36)`, 로그인 = placeholder "아이디"/"비밀번호" + "로그인" → `/portal`, 메뉴 = `.tree-item .item-name` 을 `^마루 MDM$` → `^마스터코드$` → `^마루 코드$`, `test.describe.configure({mode:"serial"})`, 오류는 `.error-modal__body` 문구. 스크린샷 `path.resolve(__dirname,"../../..","docs/mdm/tasks/TSK-06-02/screens",name)`. 시험 사용자 픽스처 `e2e/fixtures/mdm-rbac-users.sql`(담당자 1명뿐) | `e2e/mdm-unitMng.spec.ts`, `mdm-domainMng.spec.ts` |
| C13 | 화면 설계 산출물: mdm 은 `docs/mdm/screens/{screenId}/`. As-Is 없는 신규 화면은 **기능설계서 1종**으로 줄인 선례가 넷(unitMng·termMng·domainMng·columnMng, TSK-04-04 D5). 식별자 사전 `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` §A.3.2 표에 화면 행을 등재(선례 `:230-233`) | 해당 파일 |

---

## 1. 접근 방식

두 화면은 `dma` 선례(OASIS BPMN 액션 라우팅 + `@Service` 빈 + `MdmPageLayout`)를 그대로 복제하고, 버전 상태는 TSK-01-03 공통 서비스(`VersionWriteGuard`·`DraftOwnershipService`·`VersionStateService`)에 맡긴다. 공통 서비스가 하지 않는 일(채번·새 버전 INSERT·BASE 생성·복원 채우기·DRAFT 삭제 선분 복구·DEPRECATED 전이·CREATED→INUSE 쓰기 경로)만 새로 만든다. 04 영역에 공통인 부품(삭제 훅·선분 조작·조회 모델·엔진 조회 구현·ID 이름 공간)은 `com.dongkuk.dmes.mdm.common.mastercode` 에 두어 06-03·06-04·06-05 가 재사용하게 하고, 화면 서비스는 얇게 둔다.

동시에 도는 형제 Task 와 부딪히지 않게 세 가지를 지킨다. 첫째, `MasterCodeSegmentService` 구현 클래스는 만들지 않는다 — 06-03 도 같은 인터페이스를 구현하므로 add/add 충돌이 난다. 06-02 몫(`createBaseCategory`·`fillFrom`)은 같은 의미·시그니처의 공개 메서드를 가진 `MasterCodeVersionSegments` 에 두고, 뒤에 구현 클래스를 만드는 Task 가 위임한다(D6). 둘째, 공유 등록 파일(DataInitializer·page-registry·tsup·셸 index)은 줄을 **추가만** 한다. 셋째, DRAFT 소유권 액션 이름(`lock/unlock/handover`)은 ADR-0003 D5 권장 이름을 그대로 써 TSK-08-02 와 같은 편집이 되게 한다(D2, 팀장에게 조율 요청을 보냈다).

수용 기준이 기대는 두 대상은 지금 운영에 없다. TB_MDM_DATA ID 중복은 `MdmDataRepository.existsById` 로 직접 보고(운영 MASTER_DATA 이름 공간 빈을 등록하면 columnMng 동작이 뒤집힌다, D4), CODE_LIST·MASTER 판정은 운영 `CodeLookup` 빈을 등록하지 않은 채 DB 를 읽는 `MdmCodeLookup` 구현체를 실제 `DefaultCodeResolver` 에 붙여 시험한다(D5). 결재·배포·EXTERNAL 등록은 PRD §2 규칙 7 로 만들지 않는다 — 목록의 "배포 대상 수" 열, 배포 대상 카드, 결재자 열, 등록 화면의 배포 대상·원천 선택은 두지 않는다(`screens/README.md` §6).

---

## 2. 변경 파일 목록

경로 접두: `B=src/backend/mdm`, `LM=$B/lib/src/main/java/com/dongkuk/dmes/mdm`, `LT=$B/lib/src/test/java/com/dongkuk/dmes/mdm`, `AT=$B/api/src/test/java/com/dongkuk/dmes/mdm`, `AM=$B/api/src/mssqlTest/java/com/dongkuk/dmes/mdm`, `RES=$B/api/src/main/resources`, `DI=src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java`, `MDM=src/frontend/m-mdm`. 조각 (a)(b)(c) 는 §7 구현 순서다.

### 생성 — 백엔드

| 조각 | 경로 | 내용 |
|---|---|---|
| a | `$LM/common/security/MdmStewardGuard.java` | `@Component`, `requireSteward()`: `currentUser.roleIds().contains(MdmRoles.STEWARD)` 아니면 `MdmErrors.of(MdmErrorCode.STEWARD_ROLE_REQUIRED)`. `MdmStdAdminGuard` 와 글자 모양을 맞춘다(§6.9) |
| a | `$LM/common/mastercode/MasterCodeVersionNumbers.java` | final 유틸(§6.2): `maxVer(List<BigDecimal>)`, `nextMajor(max)`, `nextMinor(max)`, `canMinor(max)`, `canMajor(max)`, `label(ver)` |
| a | `$LM/common/mastercode/MasterCodeVersionSummary.java` | final 유틸 + record(§6.3): 버전 행 목록과 `now` 로 현재 버전·배포 대기·미적용 목록·계산 상태를 만든다 |
| a | `$LM/common/mastercode/MasterCodeLedgerQueries.java` | `@Component`, 네이티브 조회 모델(§6.4): `headers(keyword)`, `header(id)`, `versions(Collection<String> ids)`, `versions(id)`, `maxLvlInUse(id, after)` |
| a | `$LM/common/mastercode/MasterCodeVersionSegments.java` | `@Component`(§6.5): `createBaseCategory(VersionRef firstDraft)`, `fillFrom(VersionRef draft, BigDecimal sourceVer)`, `rowsAt(String id, BigDecimal ver)` |
| a | `$LM/common/mastercode/MasterCodeIdNamespace.java` | `@Component implements MaruIdNamespace`: `kind()=MASTER_CODE`, `contains(id)=MdmCodeRepository.existsById(id)`(null·빈 문자열이면 false). TSK-06-01 인계, 소비자는 07-02 |
| a | `$LM/dmc/codeMng/dto/{CodeMngSearchRequest,CodeMngSearchResult,CodeMngRow,CodeRegRequest,CodeRegResult}.java` | §6.7 |
| a | `$LM/dmc/codeMng/service/CodeMngService.java` | `@Service("codeMngService")`: `search`, `register` |
| a | `$RES/services/dmc/codeMng.bpmn` | `search→search`, `reg→register` |
| b | `$LM/dmc/codeEdit/dto/{CodeEditSearchRequest,CodeEditViewRequest,CodeEditView,CodeHeaderView,CodeVersionRow,CodeEditFlags,CodeHeaderSaveRequest,CodeDeprecateRequest}.java` | §6.8 |
| b | `$LM/dmc/codeEdit/service/CodeEditService.java` | `@Service("codeEditService")`: `searchCodes`, `view`, `saveHeader`, `deprecate` (조각 c 에서 버전 메서드 추가) |
| b | `$RES/services/dmc/codeEdit.bpmn` | 조각 b: `search→searchCodes`, `view→view`, `save→saveHeader`, `execute→deprecate`. 조각 c 에서 나머지 분기 추가 |
| b | `$LM/common/mastercode/MdmCodeLookup.java` | `implements kr.dongkuk.maru.mdm.engine.spi.CodeLookup`, **`@Component` 아님**(D5). 생성자 `(EntityManager, MdmTemporalBinder)` 또는 `(MasterCodeLedgerQueries, MasterCodeVersionSegments)`. §6.6 |
| c | `$LM/common/mastercode/MasterCodeDraftDeletion.java` | `@Component implements VersionDraftDeletionSpi`, `target()=MASTER_CODE`, `beforeDraftDelete` = §6.5-3 선분 복구 |
| c | `$LM/dmc/codeEdit/dto/{CodeVersionCreateRequest,CodeVersionRestoreRequest,CodeDraftRequest}.java` | §6.8 |
| a | `$AT/dmc/MasterCodeSeeds.java` | **seed 전용** 헬퍼(생성 API 가 없는 상태 — RELEASED 버전·코드 행·카테고리·TB_MDM_DATA — 를 만든다. Backend 가이드 §10). `seedCode(id, status, sourceKind)`, `seedVer(id, ver, kind, status, applyFrom, applyTo, owner)`, `seedItem(id, code, from, to, name, seq, lvls…, attrs…)`, `seedCate(id, cateId, from, to, kind, expr, target, name)`, `seedCateItem(id, cateId, code, from, to)`, `seedData(maruDataId)`. JdbcTemplate 원시 INSERT, 일시는 `'yyyy-MM-dd HH:mm:ss'` 문자열 |
| a | `$AT/dmc/codeMng/CodeMngServiceSqliteTest.java` | §3.2 |
| a | `$AT/dmc/DmcOasisHttpTest.java` | §3.2(HTTP 경계: 등록 한 트랜잭션·역할 헤더) |
| a | `$AT/dmc/DmcBpmnActionTest.java` | §3.2(BPMN 액션↔메서드 정확 대조) |
| a | `$LT/common/mastercode/MasterCodeVersionNumbersTest.java`, `MasterCodeVersionSummaryTest.java` | 순수 단위 |
| b | `$AT/dmc/codeEdit/CodeEditHeaderSqliteTest.java` | 헤더·라벨·폐기·계산 상태 |
| b | `$AT/dmc/MasterCodeDeprecateEngineSqliteTest.java` | 폐기 후 CODE_LIST·MASTER(D5) |
| c | `$AT/dmc/codeEdit/CodeEditVersionSqliteTest.java` | 새 버전·미적용 규칙·소유권 |
| c | `$AT/dmc/MasterCodeDraftDeletionSqliteTest.java` | 선분 복구 |
| c | `$AT/dmc/MasterCodeRestoreSqliteTest.java` | 복원 diff |
| c | `$AM/dmc/MasterCodeNativeSqlMssqlTest.java` | MSSQL 방언 확인(삭제 훅·조회 모델·채번 저장·비교, 규칙표 #17). **게이트에서 돌리지 않는다**(도커 금지), `DomainImpactQueriesMssqlTest`·`MdmMssqlServer` 골격 |

### 생성 — 프런트

| 조각 | 경로 | 내용 |
|---|---|---|
| a | `$MDM/src/shell/page-handoff.ts` | §6.10 화면 간 파라미터 넘김 규약(06-03·06-05 가 따른다) |
| a | `$MDM/pages/dmc/codeMng/{page.tsx,api.ts,types.ts}` | §6.11 |
| b | `$MDM/pages/dmc/codeEdit/{page.tsx,api.ts,types.ts,buttons.ts}` | §6.12. `buttons.ts` = 순수 함수 `versionButtons(view, selectedVer)` |
| c | `$MDM/pages/dmc/codeEdit/{NewVersionModal.tsx,HandoverModal.tsx}` | 모달 컴포넌트(스크린 아님 — page.tsx·메뉴·OBJECT 없음) |
| a | `$MDM/tests/shell/page-handoff.test.ts`, `$MDM/tests/dmc/codeMng/code-mng-page.test.ts` | §3.3 |
| b·c | `$MDM/tests/dmc/codeEdit/{code-edit-page.test.ts,version-buttons.test.ts}` | §3.3 |
| a | `src/frontend/e2e/mdm-codeMng.spec.ts` | §3.4 |
| b·c | `src/frontend/e2e/mdm-codeEdit.spec.ts` | §3.4 |
| Verify | `docs/mdm/tasks/TSK-06-02/screens/*.png` | E2E 스크린샷(§3.4 파일명) |

### 생성 — 문서

| 조각 | 경로 | 내용 |
|---|---|---|
| a | `docs/mdm/screens/codeMng/codeMng_기능설계서.md` | 기능설계서 1종(D11, `docs/guide/design/templates/기능설계서.template.md` 구조, 근거 칸은 `04:행`). §6.11 을 옮긴다 |
| b | `docs/mdm/screens/codeEdit/codeEdit_기능설계서.md` | 같음. §6.12 를 옮긴다 |

### 수정

| 조각 | 경로 | 내용(추가만 — 이탈은 표시) |
|---|---|---|
| a | `$DI` `seedMdmMenus()` 끝(TSK-04-04 블록 뒤, `}` 앞) | 새 블록 추가: `insertMcmSecObjIfAbsent("codeMng","마루 코드","mdm")`, `insertMcmSecObjIfAbsent("codeEdit","마루 코드 수정","mdm")`, `insertMcmSecMenuIfAbsent("codeMng","001","5030100","마루 코드","dmc","codeMng")`, `insertMcmSecMenuIfAbsent("codeEdit","002","5030200","마루 코드 수정","dmc","codeEdit")`, 두 OBJECT 에 SYSADMIN PERM_ALL(TSK-04-04 `for` 블록 모양) + `seedMdmObjectRbac(objectId,"dmc")`, 로그 한 줄 |
| c | `$DI` `seedMcmSecRbac()` | `String allActions = String.join(…);` 문 **바로 다음 줄**에 `allActions = allActions + ",lock,unlock,handover";`(주석 "TSK-06-02 — DRAFT 소유권 액션(ADR-0003 D5)") 한 줄 추가. `ensurePermAllActions(allActions)` 보다 앞이어야 한다. 뒤에서 `allActions` 를 람다·익명 클래스가 참조하면 재할당이 컴파일을 깨므로 첫 컴파일로 확인하고, 깨지면 `String allActionsWithOwnership = allActions + "…";` 새 변수를 두고 그 뒤의 사용처를 새 변수로 바꾼다(그때는 이탈로 적는다). **이탈(D2)** |
| c | `$DI` `seedMdmRbac()` | `String editActions = …;` **바로 다음 줄**에 `editActions = editActions + ",lock,unlock,handover";` 한 줄 추가(confirmActions 는 그 뒤에 계산되므로 자동 포함). **이탈(D2)** |
| c | `$DI` 새 메서드 `ensureMdmPermActions()` + 조각 a 블록 끝에 호출 한 줄 `ensureMdmPermActions();` | 기존 DB 보정: `PERM_MDM_EDIT`·`PERM_MDM_CONFIRM` 행의 `PERMISSION_ACTION` 이 목표 문자열과 다르면 목표로 UPDATE(멱등, 새 DB 영향 0). 목표 문자열은 `seedMdmRbac` 과 같은 식으로 만든다(상수 중복을 피하려면 두 문자열을 private static 메서드로 뽑되 **기존 줄은 바꾸지 않는다** — 새 메서드 안에서 같은 식을 다시 쓰고 주석으로 짝을 표시). `ensurePermAllActions`(`:1497-1519`) 모양을 따른다 |
| c | `$LM/contract/security/MdmActions.java` | `RESTORE` 뒤·`CONFIRM` 앞에 `LOCK="lock"`, `UNLOCK="unlock"`, `HANDOVER="handover"` 추가, Javadoc 의 "화면 Task 가 이름을 확정한 뒤 더한다" 를 "TSK-06-02 가 확정(ADR-0003 D5 권장 이름)" 으로. **계약 이탈(D2)** |
| c | `$LM/contract/security/MdmPermissions.java` | `EDIT_ACTIONS` 에 `RESTORE` 뒤 `LOCK, UNLOCK, HANDOVER`, `CONFIRM_ACTIONS` 에 `RESTORE, LOCK, UNLOCK, HANDOVER, CONFIRM` 순. **계약 이탈(D2)** |
| c | `$LT/contract/security/SecurityScreenContractTest.java` | `EDIT` 기대 집합에 세 액션 추가, `액션_상수_13종…잠금_계열은_없다` → `액션_상수_16종은_모두_어느_세트엔가_있고_소유권_액션은_EDIT_이다`(기대 16개, lock·unlock·handover ∈ EDIT, ∉ READ). 기대값을 바꾸는 이유는 새 액션 반영이지 완화가 아니다 |
| c | `src/frontend/e2e/fixtures/mdm-rbac-seed-check.expected.txt` | 11·12행: `…,restore,lock,unlock,handover,confirm` / `…,restore,lock,unlock,handover` |
| c | `$AT/common/version/VersionScenarioTestConfig.java` | `@Bean static BeanFactoryPostProcessor` 1개 추가(§6.13): 이 설정의 가짜와 같은 대상의 **운영** `VersionDraftDeletionSpi`·`VersionConfirmCheckSpi` 빈 정의를 지운다(대상 이름을 박지 않는 일반형) |
| a | `$MDM/src/shell/index.ts` | `export { openMdmPage, takeMdmPageParams, useMdmPageParams, type MdmPageParams } from "./page-handoff";` 한 줄 추가 |
| a·b | `$MDM/tsup.config.ts` | pages entry 에 `"pages/dmc/codeMng/page": "pages/dmc/codeMng/page.tsx",`(a), `"pages/dmc/codeEdit/page": "pages/dmc/codeEdit/page.tsx",`(b) 추가 |
| a·b | `src/frontend/m-mcm/lib/generated/page-registry.ts` | 손으로 고치지 않고 `pnpm generate:page-registry` 재생성본을 커밋 |
| a·b | `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` §A.3.2 표 | `columnMng`·`termRegPop` 행 뒤에 `codeMng`·`codeEdit` 행 추가(`— (To-Be only) | mdm | dmc | <id> | 2026-09-24 | … TSK-06-02. 기능설계서 1종(docs/mdm/screens/<id>/)`) |
| c | `docs/mdm/naming-dialect-rules.md` #17 | SQLite 쪽 `확인(TSK-06-02 실측)` + 관찰 한 줄(Java 채번, 범위 비교는 Java, 등호 바인딩은 `setScale(3)`), MSSQL 쪽 `실측 필요 → 머지 뒤 dialect_check(MasterCodeNativeSqlMssqlTest)` |
| c | `docs/mdm/decisions.md` 끝 | 임시 ID 블록 3개 추가(§6.14): `D-TSK-06-02-1`(소유권 액션 이름), `D-TSK-06-02-2`(운영 CodeLookup 미등록), `D-TSK-06-02-3`(MasterCodeSegmentService 구현 분할). 전역 번호를 매기지 않는다 |

**수정하지 않는 것**: `common/version/*`(재사용만), `contract/mastercode/*`·`contract/category/*`·`contract/version/*`, 엔티티·리포지토리(파생 쿼리도 더하지 않는다 — 06-03 과 같은 파일 충돌 회피, 조회는 §6.4 네이티브), Flyway, `MdmOasisActionVocabularyTest`(dma 파일만 본다), `DmaBpmnActionTest`, `DmaTestSupport`(import 해서 재사용), `mdm-shell-rbac-smoke.spec.ts`(새 leaf 로 깨지지 않음), `UnresolvedStewardDirectory`(D3), `MdmEngineConfig`(D5).

---

## 3. 테스트 전략

### 3.1 검증 명령(기준선 명령 줄 그대로)

- `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain` — 기준선 2337 tests / 0 failures
- `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test` — 330 / 0 (27 files)
- `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint` — tsc exit 0
- `cd src/frontend && pnpm test:unit:shared` — 156 / 0
- `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` — ERROR 0 / WARN 0

무거운 명령(testAll·build·E2E)은 `.claude/skills/dflow-dev/scripts/heavy.sh <명령>` 으로 감싸고 `HEAVY_BUSY` 면 같은 명령을 다시 부른다. 포그라운드로 끝까지 돈다(Bash timeout 최대 600000ms). 게이트 = 기준선 대비 신규 실패 0 + 총수 미감소.

추가 확인(게이트 아님, Build 가 커밋 전 1회): `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <바꾼 FE 파일>`·`python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <바꾼 FE 파일>` 0건, `cd src/backend/mdm && JAVA_HOME=… ../gradlew :api:compileMssqlTestJava --no-daemon`(mssqlTest 컴파일만, 도커 불필요).

**Build 가 운영 삭제 훅을 추가한 직후 먼저 할 일**: `MasterCodeVersionStateSqliteTest`·`VersionStateServiceSqliteTest`·`BusinessRuleVersionScenarioSqliteTest` 만 돌려 컨텍스트가 뜨는지 확인한다(F12·F13, §6.13).

### 3.2 백엔드 테스트(testAll 에 포함, 모두 SQLite `@TempDir`)

공통 준비: `@SpringBootTest(webEnvironment=MOCK)`, `@ActiveProfiles("local")`, `@Import(DmaTestSupport.Config.class)`, `@BeforeEach` 에서 04 표 비우기(CATE_ITEM → ITEM → CATE → VER → CODE 순, TB_MDM_DATA), `currentUser.set("stw1", Set.of("MDM_STEWARD"))`, 서비스 호출은 `TransactionTemplate` 으로 감싼다(운영 트랜잭션 경계 검증은 `DmcOasisHttpTest` 가 한다). 시각: 과거 적용은 `2026-01-01 00:00:00`·`2026-03-01 00:00:00`, 미래 적용은 `2099-01-01 00:00:00` 으로 seed 해 실시간 시계로도 결정적이다. 경계(`apply_from == now`)는 순수 단위(`MasterCodeVersionSummaryTest`)가 `now` 를 인자로 받아 본다.

| 테스트 | 케이스(불변 규칙) |
|---|---|
| `MasterCodeVersionNumbersTest` | N1 max=1.007→major 2.000·minor 1.008, N2 max=2.000→2.001/3.000, N3 max=1.999→minor 불가(`canMinor=false`), 1.998→1.999 가능, N4 max=9998.xxx→major 불가, N5 max=null→major 1.000·minor 불가, N6 CANCELLED·DRAFT 가 max 에 포함(입력 목록에 상태를 거르지 않음 — `maxVer` 는 전체 목록), N7 `label(1.010)="v1.010"`(세 자리 유지) (I1~I4) |
| `MasterCodeVersionSummaryTest` | S1 구간 안 RELEASED→현재 "v1.001", S2 RELEASED 가 모두 미래→"배포 대기 v1.000", S3 RELEASED 없음→"미확정", S4 `apply_from==now` 는 적용됨(미적용 아님, 현재 버전), S5 DRAFT·미래 RELEASED 는 미적용, CANCELLED 는 아님, S6 저장 CREATED + 적용된 RELEASED → 계산 상태 INUSE, 저장 DEPRECATED 는 그대로 (I17·I18·I5 경계) |
| `CodeMngServiceSqliteTest` | R1 정상 등록 → CODE(CREATED, SOURCE_KIND='MDM', 이름·설명·LVL_CNT) + VER(1.000, DRAFT, MAJOR, OWNER_ID='stw1', ROW_VERSION=0, RESTORED_FROM NULL, APPLY_* NULL) + CATE(BASE, FROM 1.000, TO 9999, REGEX, '.*', CODE) 정확히 3행, 결과 `ver="1.000"`·`rowVersion=0`·`ownerId="stw1"`(I7·I11). R2 ID 제약 거부(MDM021): `"proc_cd"`, `"PROC.CD"`, `"PROC CD"`, `"PROC,CD"`, `"1PROC"`, 51자, `""`/null — 그리고 어느 경우도 행이 생기지 않음 / `"PROC_CD"`·`"A1_B2"` 통과(I9). R3 TB_MDM_CODE 중복 → MDM011, R4 **TB_MDM_DATA 에만 같은 ID** → MDM011, 두 경우 행 수 불변(I10). R5 `sourceKind="EXTERNAL"`·`"XYZ"` → MDM021, `null`·`"MDM"` → 통과(I8). R6 역할 `MDM_STD_ADMIN` 만·`SYSADMIN` 만 → MDM013, 행 없음(I12). R7 이름 공백 → MDM021, `lvlCnt=6`·`-1` → MDM021. R8 search: 코드 3개 seed(RELEASED 과거 적용 1.000+1.001 / 미래 RELEASED 만 / DRAFT 만) → 행별 `currentVerLabel` "v1.001" / "배포 대기 v1.000" / "미확정", `unappliedLabel` "없음" / "v1.000 RELEASED" / "v1.000 DRAFT", 계산 `status`(CREATED 저장 + 적용 RELEASED → "INUSE") — 그리고 search 뒤 DB STATUS 는 여전히 CREATED(I17·I18). R9 keyword(ID·이름 부분일치)·status 필터(계산 상태 기준), 결과 0건이면 `rows=[]`·`totalCount=0` |
| `DmcOasisHttpTest` | H1 역할 헤더 `MDM_STEWARD` 로 `POST /oasis/codeMng/reg` 성공 → `meta.success=true`, `data.result.ver="1.000"`, DB 3행, `C_USR_ID`·`OWNER_ID` = 헤더 사용자. H2 **트랜잭션 경계**: SQLite 트리거 `CREATE TRIGGER … BEFORE INSERT ON TB_MDM_CODE_CATE BEGIN SELECT RAISE(ABORT,'x'); END` 뒤 reg → `meta.success=false`, TB_MDM_CODE·TB_MDM_CODE_VER 행 0(I7). H3 `MDM_STD_ADMIN` 헤더 → `meta.message` 가 MDM013 기본 문구로 시작. H4 `codeEdit/lock`·`codeEdit/unlock` 라우팅(조각 c): 등록 → unlock → `ownerId` null → lock → 헤더 사용자 |
| `DmcBpmnActionTest` | 스프링 없이 두 BPMN 을 DOM 파싱: process id, `actionGateway` 분기 이름 집합이 **정확히** §6.1 표와 같고, 각 분기의 serviceTask `camunda:class`·`method`·`dto`·`output=result` 가 표와 같고, `grid` 속성 없음, 모든 액션이 `MdmActions` 상수 집합(리플렉션, 하드코딩 13개 아님) 안, READ 액션(`search`,`view`)만 `MdmPermissions.READ_ACTIONS` 에 있고 나머지는 `EDIT_ACTIONS` 에 있음(I21) |
| `CodeEditHeaderSqliteTest` | E1 view: 헤더·라벨 10개·버전 목록(ver 내림차순, `verLabel`, `restoredLabel`="v1.000 복원")·flags·`me`·`steward`. E2 saveHeader 정상 → 이름·설명·LVL_CNT·라벨 저장, 공백 라벨→NULL, 응답 `auditVer` +1. E3 `auditVer` 불일치 → MDM001(I19). E4 lvl_cnt 줄이기: 열린 ITEM 행 LVL3 값 있음 → 3→2 거부(MDM021), 값이 현재 적용 버전 이전에 닫힌 행에만 있으면 허용, DRAFT 에서 닫힌(to_ver=DRAFT) 행에 값이 있으면 거부, 늘리기는 항상 허용(I19). E5 미적용 2개(DRAFT 1.001·1.002 seed) → saveHeader MDM007, deprecate MDM007(I6). E6 미적용 1개 → deprecate MDM009, saveHeader 는 허용. E7 미적용 0개(RELEASED 과거) → deprecate → STATUS='DEPRECATED', ITEM·CATE·VER 행 수 불변, 다시 deprecate → MDM009, 이후 새 버전 → MDM009(I13, 조각 c 에서). E8 버전 0개인 CREATED 코드 deprecate 허용(D9). E9 EXTERNAL 코드(seed) → saveHeader·deprecate MDM021(I8). E10 저장 CREATED + 적용 RELEASED 인 코드에 saveHeader → 같은 트랜잭션에서 STATUS='INUSE' 저장(I18). E11 역할 없음 → MDM013(I12) |
| `MasterCodeDeprecateEngineSqliteTest` | G1 코드 seed(1.000 RELEASED 과거, ITEM A·B, BASE) → `new DefaultCodeResolver(new MdmCodeLookup(…), CodeEffLookup.NONE)`: 폐기 **전** `codeList(id,"BASE",now)` = [A,B](대조군), `isMember(id,"BASE","A",now)=true`. G2 `codeEditService.deprecate` 후 같은 resolver: `codeList=[]`, `isMember(...,"A",now)=true`, `isMember(...,"A",2026-01-02)=true`(과거 기준일), `selectVersion` 값 유지(I16) |
| `CodeEditVersionSqliteTest` | V1 등록 직후 새 버전(빈) → MDM006(DRAFT 미적용)(I5). V2 1.000 RELEASED(과거) + CANCELLED 1.001 seed → major=2.000·minor=1.002(CANCELLED 포함), 새 VER 행 DRAFT·`VER_KIND`·`OWNER_ID='stw1'`·`ROW_VERSION=0`·`RESTORED_FROM` NULL, 응답 `rowVersion=0`(I1·I2·I11). V3 max=1.999 → minor MDM021("major 를 올리십시오" 포함), major 는 2.000(I2). V4 미래 RELEASED 1.001 있음 → MDM006(I5). V5 미적용 2개(각자 소유) → 새 버전 MDM006, lock·unlock·handover MDM007, deleteDraft(소유자) 성공 → 남은 미적용 1개, 이제 unlock 허용(I6). V6 버전 0개(1.000 DRAFT 삭제 뒤) → minor MDM021, major → 1.000 + BASE 재생성(I4). V7 DEPRECATED → 새 버전 MDM009. V8 소유권: 등록자 unlock → owner NULL·rv 1, 다른 담당자 `stw2` lock → owner stw2·rv 2, stw1 lock → MDM004, stw2 handover("stw1") → MDM005(운영 디렉터리, D3), 가짜 디렉터리(테스트 `@Primary MdmStewardDirectory` stub 이 stw1 을 담당자로) → owner stw1, 응답 view 의 owner·rowVersion 이 새 값(I22·I23). V9 rv 불일치 → MDM001, 소유자 아닌 사람 deleteDraft → MDM003, 역할 없음(`MDM_STD_ADMIN`) lock·unlock·handover·delete·create → MDM013(I12). V10 확정 이동은 서버 액션이 없다(화면 이동만) |
| `MasterCodeDraftDeletionSqliteTest` | D1 1.000 RELEASED: ITEM A,B,C, CATE BASE·T(TABLE), CATE_ITEM (T,A),(T,B). DRAFT 1.001: A 수정(A@1.000 to=1.001, A@1.001 새 행), B 삭제(B@1.000 to=1.001, (T,B) to=1.001), D 추가(D@1.001), T 이름 수정(T@1.000 to=1.001, T@1.001), (T,D) 추가, R(REGEX) 추가. deleteDraft → `FROM_VER=1.001` 행 0(세 표), `TO_VER=1.001` 행 0, 세 표 전체가 DRAFT 만들기 전 스냅샷과 같다(행 집합 비교), VER 1.001 없음, 1.000 행 불변(I14). D2 1.000 DRAFT 삭제 → BASE 행도 없음, 코드 헤더 남음, 이어서 major → 1.000·BASE 다시 생김(I4·I14). D3 훅 안에서 예외(트리거) → VER 행·선분 모두 원상(같은 트랜잭션) |
| `MasterCodeRestoreSqliteTest` | P1 1.000 RELEASED(ITEM A(name a1),B; CATE BASE, T(TABLE,name t1); CATE_ITEM (T,A)), 1.001 RELEASED(A name a2, B 닫힘, C 추가, T name t2, (T,A) 닫힘, (T,C) 추가, R REGEX 추가), 둘 다 과거 적용. restore(MAJOR, source 1.000) → 2.000 DRAFT, `RESTORED_FROM=1.000`, `rowsAt(2.000)` 가 키·값으로 `rowsAt(1.000)` 과 같다(세 표). P2 diff(`FROM_VER=2.000 OR TO_VER=2.000`) 에 ITEM(A 변경·B 추가·C 닫힘), CATE(T 변경·R 닫힘), CATE_ITEM((T,A) 추가·(T,C) 닫힘) 이 **세 표 모두** 있고, BASE 와 값이 같은 키는 없다(I15). P3 source 가 DRAFT·CANCELLED·없는 버전 → MDM021. P4 restore 도 미적용 있으면 MDM006. P5 restore 뒤 deleteDraft → 1.001 상태로 복구(I14 와 조합) |
| `MasterCodeNativeSqlMssqlTest`(mssqlTest) | 게이트 밖. D1·P1·R8 의 축약판을 MSSQL 에서: 삭제 훅 네이티브 DELETE/UPDATE, `CAST(VER AS VARCHAR(40))` 읽기, 채번한 DECIMAL(7,3) 저장·등호 조회(#17) |

### 3.3 프런트 단위 테스트(m-mdm vitest)

| 테스트 | 케이스 |
|---|---|
| `tests/shell/page-handoff.test.ts` | `openMdmPage("dmc/codeEdit",{maruCodeId:"X"})` 가 `portal-open-tab` 이벤트(`detail.pageId="mdm:dmc/codeEdit"`)를 내고, `takeMdmPageParams("dmc/codeEdit")` 가 `{maruCodeId:"X"}` 를 한 번만 돌려준다(두 번째 null). `useMdmPageParams` 는 마운트 때와 `portal-tab-activated`(`detail.tabId` 가 자기 tabId)일 때 소비한다 |
| `tests/dmc/codeMng/code-mng-page.test.ts` | 렌더 → `/oasis/codeMng/search` 결과 행 표시, 빈 결과면 "조회된 마루 코드가 없습니다", 등록 성공 → `/oasis/codeMng/reg` 호출 본문에 `sourceKind` 없음(서버 기본 MDM), 성공 뒤 `portal-open-tab`(`mdm:dmc/codeEdit`)·handoff `{maruCodeId}`. 서버 오류(`meta.success=false`) → `ErrorModal` 문구 |
| `tests/dmc/codeEdit/version-buttons.test.ts` | `versionButtons` 순수 함수 매트릭스(§6.12 표 전 행): 미적용 있으면 새버전 둘 비활성, DEPRECATED·EXTERNAL 비활성, 버전 0개면 minor 비활성·major 활성, `canMinor=false` 면 minor 비활성+안내 "major 를 올리십시오", DRAFT 소유자=나 → 삭제·해제·넘기기·확정 이동·코드 편집 활성, 소유자 없음 → 선점만, 남의 DRAFT → 모두 비활성, 미적용 2개 → 경고 문구 + 삭제만(선점·해제·넘기기·확정 이동·코드 편집·새버전·헤더 저장·폐기 비활성), RELEASED·CANCELLED 선택 → 버전 버튼 비활성(I25) |
| `tests/dmc/codeEdit/code-edit-page.test.ts` | handoff/snapshot 으로 받은 코드로 `view` 호출, 버전 목록·`DraftLockBadge` 문구, 확정 이동 → `portal-open-tab`(`mdm:dmc/codeConfirm`)·handoff `{maruCodeId, ver}`, MDM001 문구 오류 → 오류 모달 닫으면 `view` 재호출, 새 버전 모달의 번호 미리보기가 서버 `nextMajor`/`nextMinor` 값 |

### 3.4 화면 스모크 넷 — 브라우저 E2E(러너 `pnpm exec playwright test`, 서버 절차 §9)

두 스펙 모두 `e2e_mdm_steward` 로 로그인(dmc 는 담당자만 편집, F21), `SUFFIX` 로 ID 를 만들어 재실행·전체 스위트 순서에 무관하게 한다(`E2E_CM_${SUFFIX.toUpperCase()}` — ID 패턴상 대문자·숫자·`_` 만). 빈 상태는 SUFFIX 필터로 확인한다. 화면 요소에 붙일 `data-testid`: `code-search-keyword`, `code-search-status`, `code-list`, `code-reg-id`, `code-reg-name`, `code-reg-desc`, `code-reg-lvl`, `code-reg-save`, `code-pick`, `header-name`, `header-desc`, `header-lvl`, `label-attr01`~`label-attr10`, `header-save`, `header-deprecate`, `header-status`, `version-list`, `version-empty`, `ver-new-major`, `ver-new-minor`, `ver-delete`, `ver-lock`, `ver-unlock`, `ver-handover`, `ver-confirm-move`, `ver-item-edit`, `ver-unapplied-warning`, `newver-kind-major`, `newver-kind-minor`, `newver-number`, `newver-content-empty`, `newver-content-restore-<ver>`, `newver-ok`, `handover-user`, `handover-ok`.

**`mdm-codeMng.spec.ts`**

| # | 스모크 | 조작 | 기대 | 스크린샷 |
|---|---|---|---|---|
| M1 | 1 메뉴 이동 | 로그인 → `마루 MDM` → `마스터코드` → `마루 코드` | breadcrumb "마루 MDM > 마스터코드 > 마루 코드", `code-list` 보임 | `dmc-codeMng-list.png` |
| M2 | 2 목록·빈 상태 | keyword=`E2E_CM_${SUFFIX}` 조회 | "조회된 마루 코드가 없습니다"(0건) | — |
| M3 | 3 등록 | 등록 폼에 ID `E2E_CM_${SUFFIX}`·이름·계층 칸 수 2 → 저장 | 토스트 "등록했습니다", codeEdit 탭이 열려 v1.000 DRAFT·"편집 중(나)" 보임. codeMng 탭으로 돌아가 같은 조회 → 1건, 상태 CREATED, 현재 버전 "미확정", 미적용 "v1.000 DRAFT" | `dmc-codeMng-reg.png` |
| M4 | 4 서버 오류 | 같은 ID 로 다시 등록 | `.error-modal__body` 에 "마루 코드·마루 데이터에 같은 ID 가 있습니다" | `dmc-codeMng-dup-error.png` |

**`mdm-codeEdit.spec.ts`** — `beforeAll` 에서 담당자 세션으로 `page.request.post(BASE_URL+"/api/mdm/oasis/codeMng/reg",{data:{meta:{menuId:"codeMng"},params:{maruCodeId:A, maruCodeName:"E2E 수정", lvlCnt:"0"}}})` 로 코드 A·B 두 개를 만든다.

| # | 스모크 | 조작 | 기대 | 스크린샷 |
|---|---|---|---|---|
| E1 | 1 메뉴 이동 | `마루 MDM` → `마스터코드` → `마루 코드 수정` | `code-pick` 보임(코드 미선택 안내) | — |
| E2 | 2 목록·빈 상태 | `code-pick` 에서 A 선택 | 헤더 이름, 버전 목록 1행 v1.000 MAJOR DRAFT "편집 중(나)", 새버전 두 버튼 비활성. [해제] → "선점 가능", [선점] → "편집 중(나)". [삭제] 확인 → `version-empty` "버전이 없습니다" | `dmc-codeEdit-versions.png` |
| E3 | 3 수정 반영 | A: 이름 변경·`label-attr01`="인장강도" → [저장] → 다시 조회해도 값 유지. [새버전(major)] → 모달 번호 "v1.000", 빈 버전 → 목록 v1.000 DRAFT 다시 보임. B: 버전 삭제 → [폐기] 확인 → 상태 DEPRECATED, 새버전 버튼 비활성 | `dmc-codeEdit-newver-dialog.png`, `dmc-codeEdit-deprecated.png` |
| E4 | 4 서버 오류 | A: [넘기기] → `e2e_mdm_none` 입력 → 확인 | 오류 모달 "넘겨받는 사람은 담당자 역할이 있어야 합니다"(MDM005). **이 스모크는 D3 의 fail-closed 디렉터리를 거친다** — 어댑터가 생기면 비담당자 대상으로 여전히 같은 오류가 나야 하므로 기대값은 유지된다 | `dmc-codeEdit-handover-error.png` |

확정 이동·코드 편집 이동은 이동 대상 화면(06-05·06-03)이 없으므로 E2E 가 아니라 vitest(§3.3)로 본다. 미적용 2개·복원은 UI 로 만들 수 없어(동시 클릭·RELEASED 필요) 백엔드 테스트로 본다.

### 3.5 변이 검증

Build·Verify 는 §5 각 행의 "변이 예" 를 하나씩 넣어 빨강을 확인한다. E2E 변이(I26)는 **전체 스위트**(§9 6단계의 전체 `mdm-*` 목록)로 돈다.

---

## 4. 수용 기준 매핑

| # | 수용 기준 | 검증 |
|---|---|---|
| AC1 | ID 문자 제약·TB_MDM_DATA ID 중복 거부 | `CodeMngServiceSqliteTest` R2(문자·길이·패턴)·R3·R4(TB_MDM_DATA 에만 있는 ID → MDM011), E2E M4(중복 → 오류 모달) |
| AC2 | 등록자가 DRAFT 를 자동 선점 | R1(`OWNER_ID`=등록자), H1(HTTP 헤더 사용자), V2(새 버전도 만든 사람), E2E E2("편집 중(나)") |
| AC3 | 포털 메뉴에서 화면이 열리고 e2e `mdm-codeMng.spec.ts` 통과 | E2E M1~M4(스모크 넷), 스크린샷 3장 |
| AC4 | 등록은 MDM 원천만 받는다 | R5(EXTERNAL·기타 → MDM021, 저장값 'MDM'), E9(EXTERNAL 코드 쓰기 거부), 화면에 원천 선택 없음(code-mng-page 테스트) |
| AC5 | 폐기 후 CODE_LIST 에서 숨고 MASTER 판정은 유지 | `MasterCodeDeprecateEngineSqliteTest` G1(폐기 전 목록 있음 대조)·G2(폐기 후 `codeList=[]`, `isMember=true`) — 실제 `DefaultCodeResolver` + DB 를 읽는 `MdmCodeLookup`(운영 빈 미등록, D5), E7(행 보존) |
| AC6 | 포털 메뉴에서 화면이 열리고 e2e `mdm-codeEdit.spec.ts` 통과 | E2E E1~E4(스모크 넷), 스크린샷 4장. E4 는 D3 fail-closed 경로 |
| AC7 | 미적용 버전이 있으면 새 버전 거부, 2개면 DRAFT 삭제만 허용 | V1·V4(MDM006), V5(2개: 새 버전 MDM006, deleteDraft 성공), E5(2개: saveHeader·deprecate MDM007), V5(2개: lock·unlock·handover MDM007), `version-buttons.test.ts`(2개면 삭제만) |
| AC8 | 복원 diff 가 코드·카테고리·CATE_ITEM 모두 채운다 | `MasterCodeRestoreSqliteTest` P1(복원 결과 = 원본 모습, 세 표)·P2(diff 에 세 표 모두, 같은 키 없음) |

8항 모두 SQLite 로 확인한다. MSSQL 방언 동작은 수용 기준이 아니며 머지 뒤 방언 검증 몫이다(아래 도커 절).

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것 (규칙 · 잡는 테스트 · 변이 예)

| # | 규칙 | 잡는 테스트 | 변이 예 |
|---|---|---|---|
| I1 | major = `floor(max ver) + 1`, max 는 그 코드의 **모든** VER 행(CANCELLED·DRAFT 포함) | N1·N2·N6, V2 | `ceil`, `max+1.000`, CANCELLED 제외 |
| I2 | minor = `max + 0.001`. max 의 소수부×1000 이 `MAX_MINOR(999)` 이면 minor 불가(MDM021, 문구에 "major 를 올리십시오"), minor 가 major 번호를 만들지 않는다 | N1·N3, V3 | 상한 `>=998`, 999→2.000 허용 |
| I3 | major 결과가 `MAX_MAJOR(9998)` 초과면 거부(9999 는 발급 안 함) | N4 | 상한 검사 제거 |
| I4 | 버전이 하나도 없으면 MAJOR 만, 번호 1.000, 같은 트랜잭션에서 BASE(REGEX `.*`, CODE, from 1.000, to 9999) 생성 | N5, V6, D2 | 1.000 재생성 때 BASE 누락, minor 허용 |
| I5 | 새 버전(빈·복원)은 INSERT 전에 `VersionWriteGuard.checkCanCreateVersion(MASTER_CODE,id)` — 미적용(DRAFT 또는 `applyFrom.isAfter(now)` 인 RELEASED)이 하나라도 있으면 MDM006. `applyFrom == now` 는 적용됨 | V1·V4·P4, S4 | 호출 누락, `!isBefore` 로 경계 반전 |
| I6 | 미적용 2개 이상이면 DRAFT 삭제·조회만: saveHeader·deprecate·lock·unlock·handover → MDM007, 새 버전 → MDM006, deleteDraft·view·search 허용(D7) | V5, E5, version-buttons | saveHeader·lock 의 개수 검사 제거, deleteDraft 에 개수 검사 추가 |
| I7 | 등록 = TB_MDM_CODE(CREATED) + TB_MDM_CODE_VER(1.000, DRAFT, MAJOR, owner=등록자, rv 0) + TB_MDM_CODE_CATE(BASE) 를 **한 OASIS 액션**에서. 어느 하나가 실패하면 셋 다 없다 | R1, H2 | BASE 생성을 별도 액션/비동기로, 서비스에 `REQUIRES_NEW` |
| I8 | 등록 원천은 MDM 만(`sourceKind` 없음 → MDM, 그 밖 → MDM021). 저장된 `SOURCE_KIND` 가 MDM 이 아닌 코드는 모든 쓰기 거부(MDM021) | R5, E9 | EXTERNAL 허용, 쓰기 경로의 원천 검사 제거 |
| I9 | ID = `NamingRules.STD_PHYS_NAME`(`^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`) 이고 1~50자이며 `MaruIdRules.FORBIDDEN_CHAR_PATTERN`(`[.,\s]`) 문자가 없다. 위반은 MDM021 이고 행을 만들지 않는다(D8) | R2 | 소문자 허용, 길이 51 허용, 점 허용 |
| I10 | 등록 전 `MdmCodeRepository.existsById` 와 `MdmDataRepository.existsById` 둘 다 확인, 하나라도 참이면 MDM011 | R3·R4 | TB_MDM_DATA 검사 제거, 검사 순서를 INSERT 뒤로 |
| I11 | 등록·새 버전·복원의 `OWNER_ID` 는 `MdmCurrentUser.userId()`(클라이언트 값 아님), `ROW_VERSION=0`, `STATUS=DRAFT` | R1·H1·V2 | owner NULL, 요청 파라미터 사용 |
| I12 | **모든 쓰기 액션**(codeMng `reg`, codeEdit `save`·`execute`·`reg`·`restore`·`delete`·`lock`·`unlock`·`handover`)은 첫 줄에서 `MdmStewardGuard.requireSteward()`(MDM013). 읽기(search·view)는 가드 없음 | R6, E11, V9, H3 | 가드 하나 제거(삭제·해제 등 공통 서비스가 역할을 안 보는 액션에서 특히) |
| I13 | DEPRECATED 전이 = 미적용 0개일 때만(2개 이상 MDM007, 1개 MDM009), 저장 상태 CREATED·INUSE 에서(D9), 이미 DEPRECATED 면 MDM009. 행(VER·ITEM·CATE)을 지우지 않는다. DEPRECATED 이후 새 버전·복원 MDM009 | E6·E7·E8·V7 | 미적용 검사 제거, 폐기 때 행 삭제, DEPRECATED 새 버전 허용 |
| I14 | DRAFT V 삭제 훅: 세 표에서 `FROM_VER=V` 행 삭제, `TO_VER=V` 행을 `OPEN_TO_VER` 로 되돌림, 그 밖 행 불변, VER 행 삭제 **전**에(공통 서비스가 부른다). 1.000 이면 BASE 도 사라진다 | D1·D2·D3·P5 | CATE_ITEM 생략, 되돌리기 값 오류, `TO_VER=V` 행 삭제 |
| I15 | 복원: 원본 S(RELEASED, S<V)와 "현재"(= `TO_VER=OPEN_TO_VER` 인 열린 행) 를 세 표 각각 키로 비교 — S 에만 → `FROM_VER=V` 추가, 현재에만 → `TO_VER=V` 로 닫기, 값 다름 → 닫고 추가, 같음 → 아무것도 안 함. `RESTORED_FROM=S`. 결과 `rowsAt(V) ≡ rowsAt(S)` | P1·P2·P3 | CATE_ITEM 생략, 같은 키도 새 행, 원본 CANCELLED 허용 |
| I16 | 폐기는 `TB_MDM_CODE.STATUS` 만 DEPRECATED 로 바꾸고, 엔진 `codeList` 는 빈 목록·`isMember` 는 그대로 참(`MdmCodeLookup` 헤더 status = 저장값) | G1·G2 | `MdmCodeLookup` 이 status 를 계산값/고정 "INUSE" 로, 폐기 때 버전 CANCELLED 처리 |
| I17 | 현재 버전 = `apply_from ≤ now < apply_to` 인 RELEASED(`v` + 소수 세 자리). 없고 RELEASED 가 있으면 "배포 대기 v{가장 큰 RELEASED}", RELEASED 가 없으면 "미확정". 저장 칼럼을 두지 않는다 | S1~S3, R8 | 소수 자리 절단("v1.1"), 배포 대기를 미확정으로 |
| I18 | 표시 상태: 저장 CREATED 이고 적용된 RELEASED 가 있으면 INUSE 로 계산. 조회는 쓰지 않고, 쓰기 경로(saveHeader·새 버전·복원)는 같은 트랜잭션에서 INUSE 로 저장 | S6, R8, E10 | search 에서 저장, 쓰기 경로에서 누락 |
| I19 | saveHeader: `auditVer`(TB_MDM_CODE.VER) 불일치 MDM001, 이름 필수 1~100자, 라벨 0~100자(공백→NULL), `lvlCnt` 0~5, 줄이기는 `TO_VER > 현재 적용 버전 번호`(현재 적용 버전이 없으면 모든 행)인 ITEM 행 중 새 값 뒤 LVL 칸에 값이 있으면 MDM021 | E2·E3·E4 | 낙관적 검사 제거, 닫힌 행만 보기, 늘리기도 검사 |
| I20 | 버전 번호의 범위 비교·산술은 Java(BigDecimal `compareTo`)에서만 한다. SQL 은 등호 조건만 쓰고 바인딩은 `ver.setScale(3)`(F10). 읽기는 `CAST(VER AS VARCHAR(40))` | D1·P1 (SQLite 1.000 integer / 1.001 real 혼재 데이터) | SQL `FROM_VER <= :v`, 문자열 비교 |
| I21 | BPMN 액션↔메서드 표(§6.1)가 정확하다. 모든 액션 ∈ `MdmActions`, READ 액션은 `search`·`view` 뿐 | `DmcBpmnActionTest` | 분기 이름 오타, save 를 READ 로 |
| I22 | 소유권·삭제 액션은 공통 서비스에 **행위자 = `MdmCurrentUser.userId()`** 를 넘긴다(요청의 사용자 ID 를 행위자로 쓰지 않음; 요청에서 받는 것은 `newOwnerId` 뿐) | V8·V9 | 요청 파라미터를 행위자로 |
| I23 | 공통 서비스 호출 뒤의 응답은 §6.4 네이티브 조회(`flush` 뒤)로 만든다 — 이미 로드한 `MdmCodeVer` 엔티티로 만들지 않는다(F11) | V8(lock 뒤 owner·rv 가 새 값) | lock 전에 엔티티를 로드해 응답에 사용 |
| I24 | 시드: `codeMng`·`codeEdit` leaf 는 `dmc` 아래, OBJECT·SYSADMIN PERM_ALL·`seedMdmObjectRbac(…,"dmc")`. 소유권 액션 3개가 `allActions`·`PERM_MDM_EDIT`·`PERM_MDM_CONFIRM` 에 있고 `ensureMdmPermActions` 는 멱등 | seed-check 대조(§9 4단계), `SecurityScreenContractTest`, E2E(담당자 lock 이 403 아님) | allActions 에서 누락 → E2E E2 [해제] 가 FORBIDDEN |
| I25 | 화면 버튼 매트릭스(§6.12 표) | `version-buttons.test.ts` | 미적용 있을 때 새버전 활성, 2개일 때 확정 이동 활성 |
| I26 | E2E 스모크 넷 두 스펙 | §3.4, 전체 스위트 | 메뉴 이름·leaf 시드 누락, 빈 상태 문구 |
| I27 | 화면 이동은 `openMdmPage(componentPath, params)` 한 경로(§6.10): pageId = `mdm:` + componentPath, params 는 한 번만 소비 | page-handoff 테스트 | pageId 접두 누락, 소비 뒤 삭제 안 함 |

---

## 6. 구현 상세

### 6.1 OASIS 액션 표(BPMN 분기 = RBAC 키, method = 자바 메서드)

| 서비스(빈) | action | method | DTO(`dto` 속성) | 반환 | 권한 세트 |
|---|---|---|---|---|---|
| `codeMng`(`codeMngService`) | `search` | `search` | `…dmc.codeMng.dto.CodeMngSearchRequest` | `CodeMngSearchResult` | READ |
| | `reg` | `register` | `…CodeRegRequest` | `CodeRegResult` | EDIT |
| `codeEdit`(`codeEditService`) | `search` | `searchCodes` | `…dmc.codeEdit.dto.CodeEditSearchRequest` | `Map{rows:[{maruCodeId,maruCodeName,status}]}` | READ |
| | `view` | `view` | `CodeEditViewRequest` | `CodeEditView` | READ |
| | `save` | `saveHeader` | `CodeHeaderSaveRequest` | `CodeEditView` | EDIT |
| | `execute` | `deprecate` | `CodeDeprecateRequest` | `CodeEditView` | EDIT |
| | `reg`(c) | `createVersion` | `CodeVersionCreateRequest` | `CodeEditView` | EDIT |
| | `restore`(c) | `restoreVersion` | `CodeVersionRestoreRequest` | `CodeEditView` | EDIT |
| | `delete`(c) | `deleteDraft` | `CodeDraftRequest` | `CodeEditView` | EDIT |
| | `lock`(c) | `acquire` | `CodeDraftRequest` | `CodeEditView` | EDIT(새 액션, D2) |
| | `unlock`(c) | `release` | `CodeDraftRequest` | `CodeEditView` | EDIT(새 액션) |
| | `handover`(c) | `handover` | `CodeDraftRequest` | `CodeEditView` | EDIT(새 액션) |

쓰기 응답이 전체 `CodeEditView` 인 이유: 화면이 한 번에 다시 그리고, rv·auditVer 를 새 값으로 받는다(I23).

### 6.2 채번(`MasterCodeVersionNumbers`)

```java
static BigDecimal maxVer(Collection<BigDecimal> all)          // null 이면 버전 없음. 상태로 거르지 않는다(I1)
static BigDecimal nextMajor(BigDecimal max)                    // max==null → FIRST_VER; floor(max)+1 을 scale 3 으로
static boolean canMajor(BigDecimal max)                        // nextMajor 정수부 ≤ MAX_MAJOR
static boolean canMinor(BigDecimal max)                        // max!=null && max 소수부×1000 < MAX_MINOR
static BigDecimal nextMinor(BigDecimal max)                    // max.add(new BigDecimal("0.001")) (canMinor 전제)
static String label(BigDecimal ver)                            // "v" + ver.setScale(3).toPlainString()
```
소수부 = `max.subtract(new BigDecimal(max.toBigInteger())).movePointRight(3).intValueExact()`. `floor` 는 `max.setScale(0, RoundingMode.FLOOR)`.

### 6.3 버전 요약(`MasterCodeVersionSummary`)

입력: `List<VerRow>`(`record VerRow(BigDecimal ver, String verKind, String status, String ownerId, LocalDateTime applyFrom, LocalDateTime applyTo, LocalDateTime releasedAt, BigDecimal restoredFrom, long rowVersion, String description)`), 저장 상태, `now`(KST 초). 출력 record `Summary(BigDecimal currentVer, String currentVerLabel, boolean pending, List<VerRow> unapplied, String unappliedLabel, String effectiveStatus, BigDecimal maxVer, BigDecimal currentAppliedVer)`.
- 미적용: `DRAFT` 또는 (`RELEASED` && `applyFrom.isAfter(now)`). `unappliedLabel` = 없으면 "없음", 1개면 "v1.000 DRAFT" / "v1.001 RELEASED", 2개 이상이면 ver 오름차순으로 ", " 연결.
- 현재: `RELEASED && !applyFrom.isAfter(now) && now.isBefore(applyTo)`. label I17.
- `currentAppliedVer` = 현재 버전 번호(I19 의 lvl 검사 기준, 없으면 null).
- `effectiveStatus` I18.
- `now` 는 `LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS)` — `Clock` 빈 주입(F20).

### 6.4 조회 모델(`MasterCodeLedgerQueries`, 네이티브, F10 패턴)

- 모든 메서드 첫 줄에서 `entityManager.flush()`. 버전 칼럼은 `CAST(… AS VARCHAR(40))` 로 읽어 `new BigDecimal(s).setScale(3)`, 일시는 `temporal.fromDb(obj)`.
- `headers(String keyword)`: `SELECT MARU_CODE_ID, MARU_CODE_NAME, STATUS, SOURCE_KIND, DESCRIPTION, LVL_CNT, ATTR01_NAME…ATTR10_NAME, VER FROM TB_MDM_CODE [WHERE UPPER(MARU_CODE_ID) LIKE :kw OR MARU_CODE_NAME LIKE :kw] ORDER BY MARU_CODE_ID`(`:kw` = `%` + 입력 + `%`, ID 쪽은 대문자로). 두 방언 모두 `UPPER`·`LIKE` 동작.
- `versions(Collection<String> ids)`: `SELECT MARU_CODE_ID, CAST(VER AS VARCHAR(40)), VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, RELEASED_AT, CAST(RESTORED_FROM AS VARCHAR(40)), ROW_VERSION, DESCRIPTION FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID IN (:ids)` → Java 에서 ver 내림차순 정렬. ids 가 비면 쿼리하지 않는다. (코드 수가 많아 IN 목록이 2000 을 넘을 일은 이번 범위에 없다 — 넘으면 1000 개씩 나눈다.)
- `maxLvlInUse(String id, BigDecimal after)`: `SELECT CAST(TO_VER AS VARCHAR(40)), LVL1…LVL5 FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID=:id` → Java 에서 `after==null || toVer.compareTo(after) > 0` 인 행의 값 있는 가장 큰 LVL 칸 번호(I19·I20).
- 헤더 쓰기는 JPA `MdmCode` 엔티티(`findById` → setter → 감사 자동). `auditVer` 대조는 `entity.getVersion()`.

### 6.5 선분 조작(`MasterCodeVersionSegments`, `MasterCodeDraftDeletion`)

1. `createBaseCategory(VersionRef firstDraft)`: `new MdmCodeCate(id, CategoryConventions.BASE_CATE_ID, FIRST_VER, BASE_DEF_KIND.name())` + `setDefExpr(BASE_DEF_EXPR)`, `setDefTarget(CategoryOwner.MASTER_CODE.baseDefTarget().name())`, `setCateName("전체")`, toVer 기본 9999 → `persist`. `firstDraft.ver()` 가 FIRST_VER 가 아니면 `IllegalArgumentException`. 끝에서 `entityManager.flush()` 한다 — INSERT 실패가 커밋 때가 아니라 serviceTask 안에서 나야 H2(트리거 실패 주입)의 `meta.success=false` 단언이 성립한다.
2. `rowsAt(String id, BigDecimal v)`: 세 표의 그 코드 행을 JPQL `where e.maruCodeId = :id` 로 **전부** 읽고 Java 에서 `from ≤ v < to` 로 거른다(I20). 반환 `record Rows(Map<String,MdmCodeItem> items, Map<String,MdmCodeCate> cates, Map<String,MdmCodeCateItem> cateItems)`(CATE_ITEM 키 `cateId + "," + code`).
3. `MasterCodeDraftDeletion.beforeDraftDelete(VersionRef v)`: 표마다 네이티브 두 문장(ITEM → CATE_ITEM → CATE 순서 무관, FK 는 FROM_VER→VER 만):
   `DELETE FROM <표> WHERE MARU_CODE_ID=:objectId AND FROM_VER=:ver` → `UPDATE <표> SET TO_VER=:open, U_USR_ID=:uUsrId, U_AT=:uAt, U_SVC_ID=:uSvcId, U_PGM_ID=:uPgmId, VER=COALESCE(VER,0)+1 WHERE MARU_CODE_ID=:objectId AND TO_VER=:ver`. `:open` = `OPEN_TO_VER.setScale(3)`, 스탬프 `MdmNativeAuditSupport.currentStamp()`, 바인딩은 F10(`flush` 먼저). 순서는 DELETE 먼저(되돌린 옛 행과 PK 가 다르므로 순서가 결과를 바꾸지 않지만 읽기 쉽게).
4. `fillFrom(VersionRef draft, BigDecimal sourceVer)`: 원본 S 는 `status=RELEASED && S < draft.ver()` 아니면 MDM021. `src = rowsAt(id,S)`, `cur` = 세 표에서 `toVer == OPEN_TO_VER && fromVer < V` 인 행(Java). 키 합집합마다: S 에만 → 새 엔티티(from V, 값 복사)를 persist; 현재에만 → `cur.setToVer(V)`; 둘 다 & 값 다름 → `cur.setToVer(V)` + 새 엔티티 persist; 같음 → 없음. 값 비교: ITEM(name, alterName, seq, description, lvl1-5, attr01-10), CATE(cateName, defKind, defExpr, defTarget, description), CATE_ITEM(존재만). `Objects.equals` 로 비교. BASE 는 늘 같아 건드리지 않는다.
5. **`MasterCodeSegmentService` 를 implements 하지 않는다**(D6). Javadoc 에 "계약 `createBaseCategory`·`fillFrom` 의 06-02 구현. 구현 클래스를 만드는 Task(06-03)는 이 두 메서드를 여기에 위임한다" 를 적는다.

### 6.6 `MdmCodeLookup`(D5)

`code(id)`: 헤더 없으면 `Optional.empty()`. 있으면 `CodeHeader(id, 저장 STATUS)`, 버전 전부(`CodeVersionRow(ver, status, applyFrom, applyTo)`), ITEM 전부(`lvl`=[lvl1..lvl5], `attrs`=[attr01..attr10] 길이 고정, null 원소 허용), CATE 전부, CATE_ITEM 전부. 필터링은 엔진이 한다. 데이터 원천은 §6.4·§6.5-2 와 같은 쿼리를 재사용한다. 트랜잭션에 기대지 않는다(엔진은 가상 스레드에서 부를 수 있다 — decisions.md:449) — 시험은 서비스 트랜잭션 **밖에서** resolver 를 부른다.

### 6.7 codeMng DTO·서비스

- `CodeMngSearchRequest{String keyword; String status}` → `CodeMngSearchResult{List<CodeMngRow> rows; int totalCount}`, `CodeMngRow{maruCodeId, maruCodeName, sourceKind, status(계산), storedStatus, currentVer(String "1.001"|null), currentVerLabel, boolean pending, unappliedLabel, int unappliedCount}`. status 필터는 계산 상태로 Java 에서.
- `CodeRegRequest{String maruCodeId; String maruCodeName; String description; Integer lvlCnt; String sourceKind}` → `CodeRegResult{maruCodeId, ver:"1.000", long rowVersion:0, ownerId}`.
- `register` 순서: `requireSteward` → 입력 정규화(trim) → ID 규칙(I9) → 이름·lvlCnt(기본 0)·sourceKind(I8) → `existsById` 두 개(I10) → `MdmCode` persist(status 기본 CREATED, sourceKind "MDM") → `MdmCodeVer(id, FIRST_VER, "MAJOR")` + `setOwnerId(userId)` persist → `flush` → `segments.createBaseCategory(ref)`. 쓰기 경로는 `checkCanCreateVersion` 을 부를 필요가 없다(새 코드).

### 6.8 codeEdit DTO·서비스

- `CodeEditSearchRequest{keyword}`, `CodeEditViewRequest{maruCodeId}`.
- `CodeEditView{CodeHeaderView header; List<CodeVersionRow> versions; CodeEditFlags flags; List<String> restoreSources; String me; boolean steward}`.
  - `CodeHeaderView{maruCodeId, maruCodeName, description, int lvlCnt, sourceKind, status(계산), storedStatus, Long auditVer, attr01Name…attr10Name, currentVerLabel, unappliedLabel}`.
  - `CodeVersionRow{String ver("1.000"), verLabel, verKind, status, ownerId, applyFrom, applyTo, releasedAt(문자열 'yyyy-MM-dd HH:mm:ss' 또는 null), restoredFrom, restoredLabel("v1.000 복원"|null), long rowVersion, boolean unapplied, description}`.
  - `CodeEditFlags{int unappliedCount; boolean canNewMajor; boolean canNewMinor; String nextMajor; String nextMinor; boolean minorLimit; boolean canDeprecate; boolean editable /*원천 MDM && 담당자*/}`. `canNew*` = 미적용 0 && 저장 상태 ≠ DEPRECATED && 원천 MDM && 번호 가능. `restoreSources` = RELEASED 버전 번호 내림차순.
- `CodeHeaderSaveRequest{maruCodeId; Long auditVer; maruCodeName; description; Integer lvlCnt; attr01Name…attr10Name}`, `CodeDeprecateRequest{maruCodeId; Long auditVer}`.
- `CodeVersionCreateRequest{maruCodeId; String verKind}`, `CodeVersionRestoreRequest{maruCodeId; String verKind; String sourceVer}`, `CodeDraftRequest{maruCodeId; String ver; Long rowVersion; String newOwnerId}`. ver 문자열 → `new BigDecimal(s)`, scale > 3·음수·파싱 실패는 MDM021, 그다음 `setScale(3)`.
- 쓰기 공통 머리(`requireWritable(id)`): `requireSteward` → 코드 로드(없으면 MDM021 "마루 코드가 없습니다") → 원천 MDM(I8). 각 메서드:
  - `saveHeader`: 머리 → 미적용 ≥2 MDM007 → auditVer(MDM001) → 입력 검사 → lvl 줄이기 검사(I19) → setter → INUSE 계산 저장(I18) → view.
  - `deprecate`: 머리 → 저장 DEPRECATED 면 MDM009 → 미적용 ≥2 MDM007, =1 MDM009("미적용 버전이 있어 폐기할 수 없습니다") → auditVer → `setStatus("DEPRECATED")` → view.
  - `createVersion`/`restoreVersion`: 머리 → DEPRECATED MDM009 → `writeGuard.checkCanCreateVersion` → max·kind 로 번호(I1~I4, 불가면 MDM021) → (restore) 원본 검사 → `MdmCodeVer` persist(owner=me, restoredFrom) → `flush` → 1.000 이면 `createBaseCategory` → (restore) `fillFrom` → INUSE 계산 저장 → view.
  - `deleteDraft`: `requireSteward` → `versionStateService.deleteDraft(ref, rv, me)` → view. (원천 검사는 하지 않아도 되지만 머리를 써도 된다 — EXTERNAL 은 DRAFT 가 없다.)
  - `acquire`/`release`/`handover`: `requireSteward` → 미적용 ≥2 MDM007(D7) → `ownership.acquire(ref, rv, me)` / `release(ref, rv, me)` / `handover(ref, rv, me, newOwnerId)` → view. `newOwnerId` 는 trim, 비면 그대로 넘겨 MDM005.

### 6.9 `MdmStewardGuard`(정본 모양 — 08-02 도 같은 파일이면 그대로 합쳐진다)

```java
package com.dongkuk.dmes.mdm.common.security;
/** 담당자 쓰기 가드(TSK-06-02). BFF 액션 권한(1차)과 별도로 서비스가 요청 역할을 직접 본다. SYSADMIN·MDM_STD_ADMIN 만으로는 거부한다 — MdmStdAdminGuard 와 같은 모양이다. */
@Component
public class MdmStewardGuard {
    private final MdmCurrentUser currentUser;
    public MdmStewardGuard(MdmCurrentUser currentUser) { this.currentUser = currentUser; }
    public void requireSteward() {
        if (!currentUser.roleIds().contains(MdmRoles.STEWARD)) {
            throw MdmErrors.of(MdmErrorCode.STEWARD_ROLE_REQUIRED);
        }
    }
}
```

### 6.10 화면 간 파라미터 넘김(`$MDM/src/shell/page-handoff.ts`) — 06-03·06-05 가 따르는 규약

```ts
export type MdmPageParams = Record<string, string>;
const KEY = "__mdmPageHandoff__";                         // globalThis[KEY]: Record<pageId, MdmPageParams>
export function openMdmPage(componentPath: string, params?: MdmPageParams): void
  // pageId = `mdm:${componentPath}`; params 가 있으면 저장; window.dispatchEvent(new CustomEvent("portal-open-tab",{detail:{pageId}}))
export function takeMdmPageParams(componentPath: string): MdmPageParams | null   // 꺼내고 지운다(한 번만)
export function useMdmPageParams(componentPath: string, tabId: string | undefined, onParams: (p: MdmPageParams) => void): void
  // useEffect: 마운트 때 take; window "portal-tab-activated" 에서 detail.tabId === tabId 면 take
```
- 받는 쪽은 받은 값을 `onSnapshotChange({...snapshot, maruCodeId})` 로 자기 snapshot 에 넣어 새로고침 뒤에도 유지한다. 초기값 우선순위: handoff > snapshot.
- 사용처: codeMng 등록 성공·ID 링크 → `openMdmPage("dmc/codeEdit",{maruCodeId})`. codeEdit 확정 이동 → `openMdmPage("dmc/codeConfirm",{maruCodeId, ver})`, 코드 편집 → `openMdmPage("dmc/codeItemEdit",{maruCodeId, ver})`. 대상 화면이 아직 없으면 포털이 "등록된 페이지를 찾을 수 없습니다" 를 보인다(형제 Task 머지 전 한시 상태).

### 6.11 codeMng 화면

- `MdmPageLayout group="dmc" screenId="codeMng" title="마루 코드"`, 버튼 `조회`(action `search`).
- 조회 영역: 마루 코드(ID·이름 부분일치, `code-search-keyword`), 상태(전체/CREATED/INUSE/DEPRECATED, `code-search-status`).
- 목록(`AgDataGrid`, `code-list`): ID(클릭 → codeEdit 열기) · 이름 · 원천 · 현재 버전(`currentVerLabel`) · 상태 · 미적용 버전(`unappliedLabel`). 건수 표시("N건"), 0건이면 "조회된 마루 코드가 없습니다".
- 등록 카드(`ContentPanel`): ID(안내 "영문 대문자·숫자·_ 만. 점·공백·콤마 불가. 마루 데이터 ID 와 한 이름 공간"), 이름(필수), 설명, 계층 칸 수(Select 0~5, 기본 0), 원천 "MDM" 읽기 전용 표기, [저장](action `reg`, `canDoButton(rbac,"codeMng","reg")`). 화면은 필수값만 막고 ID 형식 검사는 서버에 맡긴다(서버 오류 스모크를 위해 — 형식 안내 문구만 둔다). 성공: 토스트 "등록했습니다" → 폼 초기화 → 목록 재조회 → `openMdmPage("dmc/codeEdit",{maruCodeId})`.
- 오류: `ErrorModal`. 등록 화면에 배포 대상 시스템·원천 선택·EXTERNAL 등록 버튼 없음(보류).

### 6.12 codeEdit 화면

- `MdmPageLayout group="dmc" screenId="codeEdit" title="마루 코드 수정"`. 상단 조회 영역: 마루 코드 선택(`ComboBox`, `code-pick`, 데이터 = `codeEdit/search`) + [조회]. 선택 전에는 "마루 코드를 고르세요".
- 카드 ① 헤더: ID·원천(읽기), 상태 배지(계산), 현재 버전·미적용 표시, 이름, 설명, 계층 칸 수(Select 0~5). 버튼 [경미 수정 저장](`save`), [폐기](`execute`, `showMessage` 확인 "폐기하면 새 버전을 만들 수 없습니다. 폐기할까요?"). 안내: "이름·설명·계층 칸 수·라벨은 버전 밖의 값이라 결재 없이 고친다".
- 카드 ② 추가 컬럼 라벨: 표 10행(번호 attr01~attr10 · 라벨 입력). 저장은 카드 ①의 [경미 수정 저장]이 함께 보낸다. 안내: "라벨이 있는 번호만 값을 받는다. 지운 번호를 다른 뜻으로 다시 쓰지 않는다".
- 카드 ③ 버전 목록(`version-list`): 표시(`verLabel` + `restoredLabel`) · 종류 · 상태(`VersionStatusBadge status applyFrom`) · 적용 구간(`applyFrom - applyTo`) · 확정 일시(`releasedAt`) · 소유자(`DraftLockBadge status ownerId currentUserId=me`) · 설명. 0행이면 `version-empty` "버전이 없습니다". 행 선택. 미적용 2개면 `ver-unapplied-warning` "미적용 버전이 2개입니다. 하나를 삭제하세요".
- 버튼 매트릭스(`buttons.ts` `versionButtons(view, selectedVer)`, 모두 `editable` 이 거짓이면 비활성; 권한은 `canDoButton` 으로 추가 판정):

| 버튼(action) | 활성 조건 |
|---|---|
| 새버전(major)(`reg`) | `flags.canNewMajor` |
| 새버전(minor)(`reg`) | `flags.canNewMinor`. `minorLimit` 이면 비활성 + "major 를 올리십시오" |
| 삭제(`delete`) | 선택 DRAFT && owner==me(미적용 2개여도 활성) |
| 선점(`lock`) | 선택 DRAFT && owner==null && unappliedCount==1 |
| 해제(`unlock`) | 선택 DRAFT && owner==me && unappliedCount==1 |
| 넘기기(`handover`) | 선택 DRAFT && owner==me && unappliedCount==1 |
| 확정 이동(이동만, action `confirm` 으로 권한 판정) | 선택 DRAFT && owner==me && unappliedCount==1 |
| 코드 편집(이동만, action `save`) | 선택 DRAFT && owner==me && unappliedCount==1 |
| 헤더 저장(`save`) | unappliedCount < 2 |
| 폐기(`execute`) | storedStatus ≠ DEPRECATED && unappliedCount == 0 |

  미적용 버전이 있어 새버전이 비활성이면 안내 "미적용 버전 {label} 이 있어 새 버전을 만들 수 없습니다". RELEASED·CANCELLED 행을 고르면 버전 조작 버튼은 모두 비활성(diff 보기는 06-03·06-05 몫).
- 새 버전 모달(`NewVersionModal`): 종류 Radio(major/minor, 불가한 쪽 비활성), 새 번호 표시(`nextMajor`/`nextMinor`), 내용 Radio("빈 버전" / `restoreSources` 마다 "v1.001 내용으로 채우기(복원)"), 안내 "가장 큰 번호는 철회·작성 중 버전을 포함한다. 복원은 원본과 현재의 차이를 DRAFT 에 채운다". [확인] → 빈 버전이면 `reg`, 복원이면 `restore`.
- 넘기기 모달(`HandoverModal`): 받는 사람 사용자 ID 입력 → `handover`.
- 모든 쓰기는 선택 버전의 `rowVersion`·헤더 `auditVer` 를 함께 보낸다. 오류 문구가 "다른 사용자가 수정했습니다" 로 시작하면 오류 모달을 닫을 때 `view` 를 다시 부른다.

### 6.13 테스트 설정 — 운영 SPI 와 시나리오 가짜의 공존(`VersionScenarioTestConfig`)

```java
/** TSK-06-02 — 이 설정의 가짜 SPI 와 같은 대상의 운영 SPI 빈 정의를 지운다(VersionSpiRegistry 는 대상 중복이면 기동 실패). */
@Bean
static BeanFactoryPostProcessor removeProductionVersionSpisShadowedByFakes() {
    return beanFactory -> {
        BeanDefinitionRegistry registry = (BeanDefinitionRegistry) beanFactory;
        for (Class<?> spi : List.of(VersionDraftDeletionSpi.class, VersionConfirmCheckSpi.class)) {
            for (String name : beanFactory.getBeanNamesForType(spi, true, false)) {
                Class<?> type = beanFactory.getType(name, false);
                if (type != null && !type.getName().startsWith(VersionScenarioFakes.class.getName())) {
                    registry.removeBeanDefinition(name);
                }
            }
        }
    };
}
```
가짜가 두 대상을 모두 덮으므로 "가짜가 있는 대상" = 전부다. 이 설정을 import 하지 않는 컨텍스트(dmc 테스트·HTTP 테스트)는 운영 훅을 그대로 쓴다. Build 는 `getType` 이 `@Component` 정의에서 타입을 돌려주는지 첫 실행으로 확인하고, 안 되면 `getBeanDefinition(name).getBeanClassName()` 으로 바꾼다.

### 6.14 decisions.md 임시 ID 블록(Build 가 추가)

머리 `## D-TSK-06-02-<n> (<UTC>)`, 필드는 기존 블록과 같다(`Phase`·`Decision needed`·`Decision made`·`Rationale`·`Reversible`·`Source`). 1 = D2(소유권 액션 이름), 2 = D5(운영 CodeLookup 미등록), 3 = D6(`MasterCodeSegmentService` 구현 분할). 본문에서 가리킬 때도 임시 ID 전체를 쓴다.

---

## 7. 구현 순서(조각별 커밋)

각 조각: 테스트 먼저(빨강 확인) → 구현 → 조각 테스트 초록 → 관련 기존 테스트 → 커밋(파일명 명시, `--trailer "DFlow-Order: 16de6362-6033-4d08-b45a-20e107d40853"`, `Co-Authored-By` 줄). 전체 게이트(§3.1)는 조각 c 뒤 한 번 + E2E.

| 조각 | 범위 | 파일(§2) | 테스트 | 커밋 예 |
|---|---|---|---|---|
| (a) codeMng 조회·등록 | 가드·채번 유틸·요약·조회 모델·BASE 생성·ID 이름 공간·codeMng 서비스·BPMN·시드(메뉴 2 + OBJECT 2 + 매트릭스, 소유권 액션 제외)·page-handoff·codeMng 화면·tsup·page-registry·기능설계서·식별자 사전 | 표의 조각 a | `MasterCodeVersionNumbersTest`, `MasterCodeVersionSummaryTest`, `CodeMngServiceSqliteTest`, `DmcOasisHttpTest` H1~H3, `DmcBpmnActionTest`(codeMng), page-handoff·code-mng-page vitest, `mdm-codeMng.spec.ts` | `feat(mdm): TSK-06-02 마루 코드 조회·등록 화면을 추가한다` |
| (b) codeEdit 헤더·라벨·폐기 | codeEdit 서비스(searchCodes·view·saveHeader·deprecate)·BPMN 4분기·`MdmCodeLookup`·codeEdit 화면(헤더·라벨 카드, 버전 목록 읽기)·tsup·page-registry·기능설계서 | 조각 b | `CodeEditHeaderSqliteTest`, `MasterCodeDeprecateEngineSqliteTest`, `DmcBpmnActionTest`(codeEdit 4), code-edit-page vitest(헤더) | `feat(mdm): TSK-06-02 마루 코드 수정 헤더·라벨·폐기를 추가한다` |
| (c) 버전 목록·새 버전·복원·DRAFT 소유권 | 삭제 훅·`fillFrom`·createVersion·restoreVersion·deleteDraft·acquire·release·handover·BPMN 6분기·소유권 액션(계약·시드·보정·계약 테스트·seed-check)·`VersionScenarioTestConfig`·버튼 매트릭스·모달·mssqlTest·규칙표 #17·decisions.md | 조각 c | `CodeEditVersionSqliteTest`, `MasterCodeDraftDeletionSqliteTest`, `MasterCodeRestoreSqliteTest`, `DmcOasisHttpTest` H4, `DmcBpmnActionTest`(전체), `SecurityScreenContractTest`, version-buttons·code-edit-page vitest, `mdm-codeEdit.spec.ts` | `feat(mdm): TSK-06-02 버전 목록·새 버전·복원·DRAFT 소유권을 추가한다` |

조각 (a) 의 E2E M3 는 codeEdit 탭이 열리는지까지 보므로, E2E 는 조각 (b) 뒤에 처음 돌려도 된다(조각 a 커밋 시점에는 page-handoff 까지 vitest 로 확인). E2E 전체는 조각 (c) 뒤에 §9 로 돌리고 스크린샷을 커밋한다.

---

## 8. 형제 Task 범위 경계

| Task | 경계 |
|---|---|
| TSK-06-03(codeItemEdit, 동시 진행) | 코드 행 편집·되돌리기·`viewAt`·경미 수정(행). 이 Task 는 **`MasterCodeSegmentService` 구현 클래스를 만들지 않는다**(D6) — 06-03 이 만들 때 `createBaseCategory`·`fillFrom` 을 `MasterCodeVersionSegments` 에 위임하면 된다. "코드 편집" 버튼은 `openMdmPage("dmc/codeItemEdit",{maruCodeId,ver})` 이동만. 06-03 은 DRAFT 저장 직전 `beginDraftWrite` 를 부르고, 삭제 훅(`MasterCodeDraftDeletion`)이 그 행들을 복구한다 |
| TSK-06-04(codeCateEdit) | 카테고리 편집. BASE 생성만 이 Task(등록·1.000 재생성) |
| TSK-06-05(codeConfirm) | DRAFT→RELEASED 전이·검사 8항·확정 SPI·diff 화면. 이 Task 의 "확정 이동" 은 `openMdmPage("dmc/codeConfirm",{maruCodeId,ver})` **이동만** 한다. 06-05 가 확정 SPI 를 운영 빈으로 등록해도 §6.13 설정이 시나리오 테스트를 지킨다. 운영 `CodeLookup` 빈 등록 여부는 06-05 이후 판단(D5) |
| TSK-08-02(룰 화면, 동시 진행) | 같은 소유권 액션 이름·같은 추가 모양(D2), 같은 `MdmStewardGuard`(§6.9)·§6.13 을 쓰면 머지가 깨끗하다. 팀장에게 조율 요청을 보냈다 |
| TSK-07-02(마스터데이터 등록) | 운영 `MaruIdNamespace(MASTER_DATA)` 빈은 07-02 몫(D4). 이 Task 가 만든 `MasterCodeIdNamespace` 를 07-02 등록 검사가 쓴다 |
| 공유 파일 | DataInitializer·page-registry·tsup·셸 index 는 줄 추가만. 기존 줄을 바꾸는 곳은 §2 의 "이탈" 표시 3곳(`MdmActions`·`MdmPermissions`·`SecurityScreenContractTest`)과 seed-check 기대 2행뿐 |

---

## 9. E2E 서버 절차

「서버 프로세스」 규칙: `be-run.sh`·`fe-run.sh` 를 쓰지 않는다. 빈 포트에 직접 띄우고(Gradle `--no-daemon`), 자기 PID·자기 포트만 종료한다. 전역 `gradlew --stop`·`pkill`·`killall`·`pgrep -f` 종료 금지.

```bash
W=/Users/jji/project/dmes-standard/dflow-16de6362
SP=<실행자 scratchpad>
J=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
# 0) 슬롯 — HEAVY_ACQUIRED 확인(HEAVY_BUSY 면 다시)
$W/.claude/skills/dflow-dev/scripts/heavy.sh acquire e2e-TSK-06-02
# 1) 빈 포트 확인(예: mcm 18602, mdm 18696, FE 15602). LISTEN 이 있으면 다른 번호
lsof -iTCP:18602 -sTCP:LISTEN; lsof -iTCP:18696 -sTCP:LISTEN; lsof -iTCP:15602 -sTCP:LISTEN
# 2) 새 DB 로 시작 — 기존 파일은 지우지 않고 옮긴다(gitignore 대상)
mkdir -p $W/src/backend/data
[ -f $W/src/backend/data/mcm.db ] && mv $W/src/backend/data/mcm.db $SP/mcm.db.$(date +%s)
[ -f $W/src/backend/data/mdm.db ] && mv $W/src/backend/data/mdm.db $SP/mdm.db.$(date +%s)
# 3) mcm 백엔드
cd $W/src/backend/mcm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18602 --mcm.bff.invalidate-role-url=http://127.0.0.1:15602/api/mcm/internal/cache/invalidate-role --cactus.notify.publish-url=http://127.0.0.1:18602/notify/publish' > $SP/be-mcm.log 2>&1 &
BE_MCM_PID=$!
# 4) mdm 백엔드
cd $W/src/backend/mdm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18696' > $SP/be-mdm.log 2>&1 &
BE_MDM_PID=$!
# 두 로그에 "Started ... in" 과 SQLite 경로가 $W/src/backend/data/*.db 인지 확인
# 5) mcm 시드 대조(출력 없어야 함, 사용자 픽스처 넣기 전) + 시험 사용자
cd $W/src/frontend && sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-seed-check.sql | diff - e2e/fixtures/mdm-rbac-seed-check.expected.txt
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-users.sql
sqlite3 $W/src/backend/data/mcm.db "SELECT MENU_ID, PARENT_MENU_ID FROM TB_MCM_SEC_MENU WHERE MENU_ID IN ('codeMng','codeEdit');"   # dmc 2행
# 6) 포털
cd $W/src/frontend && pnpm build:libs
cd $W/src/frontend/m-mcm && AUTH_SECRET=$(openssl rand -hex 32) NEXTAUTH_URL=http://127.0.0.1:15602 OIDC_ISSUER=http://127.0.0.1:15602 \
  MCM_WAS_URL=http://127.0.0.1:18602 MDM_WAS_URL=http://127.0.0.1:18696 BACKEND_API_URL=http://127.0.0.1:18602 \
  BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026 pnpm exec next dev --turbopack --port 15602 > $SP/fe.log 2>&1 &
FE_PID=$!
# 7) 시험 — 이 Task 스펙 둘 + 전체 mdm 회귀(Verify 는 전체 목록으로 변이 검증). columnMng 는 사전 픽스처가 필요하다
( cd $W/src/frontend && sqlite3 $W/src/backend/data/mdm.db < e2e/fixtures/mdm-columnMng-dict.sql )
( cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15602 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  $W/.claude/skills/dflow-dev/scripts/heavy.sh pnpm exec playwright test e2e/mdm-shell-rbac-smoke.spec.ts e2e/mdm-sample-smoke.spec.ts \
  e2e/mdm-unitMng.spec.ts e2e/mdm-termMng.spec.ts e2e/mdm-domainMng.spec.ts e2e/mdm-columnMng.spec.ts \
  e2e/mdm-codeMng.spec.ts e2e/mdm-codeEdit.spec.ts --workers=1 )
# 8) 부산물 복원 — 다른 Task 스크린샷·next-env.d.ts·test-results 는 되돌리고 TSK-06-02 스크린샷만 커밋
cd $W && /usr/bin/git status --porcelain docs/mdm/tasks/ src/frontend
cd $W && /usr/bin/git checkout -- docs/mdm/tasks/TSK-01-02/screens/ docs/mdm/tasks/TSK-01-03/screens/ docs/mdm/tasks/TSK-04-02/screens/ docs/mdm/tasks/TSK-04-03/screens/ docs/mdm/tasks/TSK-04-04/screens/
# 9) 정리 — 성공·실패와 무관하게. 자기 PID 먼저, 그다음 자기 포트 리스너만
kill $FE_PID $BE_MDM_PID $BE_MCM_PID
lsof -tiTCP:15602 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18696 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18602 -sTCP:LISTEN | xargs -r kill
$W/.claude/skills/dflow-dev/scripts/heavy.sh release
```
- 통과 기준: 전부 passed, 5)의 diff 출력 없음. mdm 코드를 바꾸면 mdm 만 다시 띄우되 mdm.db 를 다시 옮기고 7)의 columnMng 픽스처를 다시 넣는다. DataInitializer 를 바꾸면 mcm 을 새 DB 로 다시 띄운다(권한 캐시: BFF 60초, `UserPermCache` 10분).
- 8)의 `git checkout` 은 다른 Task 스크린샷 폴더가 실제로 바뀐 것만 대상으로 한다(없는 경로는 빼고 실행).

---

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 도커 금지로 생략: cd src/backend/mdm && ../gradlew :api:mssqlMigrationTest --no-daemon
- 생략 대상은 이 Task 가 추가하는 `MasterCodeNativeSqlMssqlTest`(삭제 훅·조회 모델 네이티브 SQL, 규칙표 #17 MSSQL 쪽)와 기존 mssqlTest 전부다. `testAll` 은 mssqlTest 를 포함하지 않으므로(build.gradle 주석) 게이트 명령 줄의 제외 인자는 없다. Build 는 `:api:compileMssqlTestJava` 로 컴파일만 확인한다.
- 수용 기준 8항은 SQLite 로 모두 확인하므로 확인하지 못한 수용 기준은 없다. MSSQL 방언 동작은 머지 뒤 팀장 방언 검증(dialect_check)이 확인한다.

---

## 담당자 확인 필요 결정

### D1 — 화면 그룹 코드 `dmc`(spec 의 `mdc` 대신)
- **질문**: spec entry-point 는 `mdc/codeMng`·`mdc/codeEdit` 인데 wbs.md tech-spec(`dmc.codeMng`, `services/dmc/…`, `pages/dmc/…`, componentPath `dmc/…`), TRD.md T2(2026-09-24 확정, 86·124행), `docs/mdm/screens/README.md` 42~43행, `MdmScreenGroup.DMC("dmc")`, DataInitializer `dmc` 폴더, `mdm-groups.ts` 는 모두 `dmc` 다.
- **선택지**: ① `dmc` — 강도 강(확정 문서 셋·코드 둘이 같다). ② `mdc` — 강도 약(spec 문자열뿐이고 메뉴 폴더·계약 상수와 어긋난다).
- **택한 것**: ①. spec 의 `mdc` 는 T2 확정 이전 표기로 보인다(TSK-04-02 의 `mdt→dma` 정정과 같은 경우).
- **근거**: spec 본문이 가장 강하지만 같은 spec 의 wbs tech-spec 이 `dmc` 이고, 승인된 확정 결정(T2)이 그 뒤에 나왔다.
- **반려 시 재작업**: componentPath·BE 패키지(`com.dongkuk.dmes.mdm.mdc.*`)·BPMN 경로(`services/mdc/`)·FE 경로(`pages/mdc/`)·tsup entry·DataInitializer 폴더/leaf·e2e 메뉴 경로(폴더 이름)·page-handoff 의 componentPath 를 `mdc` 로 바꾼다. `MdmScreenGroup`·README·TRD 도 함께 바꿔야 하므로 사실상 T2 재결정이다.

### D2 — DRAFT 소유권 액션 이름 `lock`·`unlock`·`handover` 를 이 Task 가 확정·추가
- **질문**: 선점·해제·넘기기를 어떤 OASIS 액션(= RBAC 키)으로 둘지. `MdmActions` 13개에는 맞는 것이 없고 `SecurityScreenContractTest` 는 "lock 계열 없음"을 단언한다.
- **선택지**: ① ADR-0003 D5 권장 이름 `lock/unlock/handover` 를 추가(계약·시드·계약 테스트·seed-check·기존 DB 보정) — 강도 중(ADR-0003 D5·TSK-01-03 인계가 첫 소유권 화면 Task 에 배정, 둘 다 미승인). ② 기존 어휘 하나(`execute`)에 `op` 파라미터로 세 동작을 묶음 — 강도 약(한 액션이 세 의미, ADR 표와 어긋남, 권한을 동작별로 가를 수 없음). ③ 넘기기 등을 만들지 않음 — 강도 약(spec 요구사항 위반).
- **택한 것**: ①. 계약·공유 테스트 수정은 이탈로 §2 에 표시했다. DataInitializer 는 기존 줄을 바꾸지 않고 재할당 한 줄씩만 더한다. TSK-08-02 와 같은 편집이 되도록 팀장에게 이름·위치·순서를 알렸다.
- **근거**: 승인된 선행 산출물에 준하는 인계 문서(TSK-01-03 §7)와 ADR 표가 이름까지 제시했다.
- **반려 시 재작업**: 다른 이름이면 `MdmActions`·`MdmPermissions`·시드 두 줄·보정 메서드·`SecurityScreenContractTest`·seed-check 2행·BPMN 3분기·`DmcBpmnActionTest`·FE `action` 문자열을 바꾼다. ②면 세 분기를 `execute` 하나로 합치고 `CodeDraftRequest.op` 를 더하며 폐기는 다른 액션으로 옮긴다.

### D3 — 넘기기 대상 담당자 조회 어댑터를 만들지 않는다(fail-closed 유지)
- **질문**: TSK-01-03 인계는 `MdmStewardDirectory` 운영 어댑터를 첫 소유권 화면 Task 가 만들라고 했다. mdm 은 다른 사용자 역할을 볼 수단이 없다(F17).
- **선택지**: ① 만들지 않음(운영 넘기기 = 늘 MDM005) — 강도 중. ② mcm 에 client-key 전용 내부 조회 API + mdm RestClient 어댑터 — 강도 약(새 보안 경로·IDOR 검토·mcm 패키지 변경, 무인 범위 밖). ③ 항상 허용 — 강도 약(담당자 아닌 소유자는 BFF 권한이 없어 DRAFT 를 영영 풀 수 없게 될 수 있다, TSK-01-03 D7).
- **택한 것**: ①. 서버 경로·화면·오류 표시는 완성하고, 성공 경로는 테스트 가짜 디렉터리로 시험한다(V8).
- **대가**: **spec 요구사항 "넘기기"는 어댑터가 생길 때까지 운영에서 동작하지 않는다**(항상 "넘겨받는 사람은 담당자 역할이 있어야 합니다"). 끝 보고에 올린다. E2E E4 는 이 거부 경로를 쓴다(비담당자 대상이라 어댑터가 생겨도 기대값이 같다).
- **근거**: 리포 기존 관례·미승인 선행 산출물(TSK-01-03 D7 이 fail-closed 를 택했고 ②를 보안 검토 대상으로 적었다). spec 본문은 "넘기기"만 요구하고 대상 검사는 요구하지 않지만, 대상 검사를 빼는 ③은 되돌릴 수 없는 잠김을 만든다.
- **반려 시 재작업**: ②면 별도 설계(mcm 내부 API·보안 검토)를 올리고 mdm 에 어댑터 빈을 추가한다. 화면·서비스는 바뀌지 않는다.

### D4 — TB_MDM_DATA ID 중복은 리포지토리로 직접 본다(운영 MASTER_DATA 이름 공간 빈 미등록)
- **질문**: 계약 Javadoc 은 "등록 서비스는 `List<MaruIdNamespace>` 로 상대 표를 본다"인데 MASTER_DATA 구현(07-02 몫)이 없다.
- **선택지**: ① `MdmDataRepository.existsById` 직접 조회 + MASTER_CODE 빈만 등록 — 강도 중. ② 이 Task 가 MASTER_DATA 빈도 등록 — 강도 약(`ColumnMngService` 가 "빈 없으면 생략"에서 "TB_MDM_DATA 에 없으면 거부"로 바뀌어 columnMng 테스트·E2E 가 깨진다, F14). ③ 빈이 있으면 빈, 없으면 리포지토리 — 강도 약(두 경로라 07-02 이후 동작이 조용히 바뀐다).
- **택한 것**: ①.
- **근거**: 리포 기존 관례(`ColumnMngService` 가 MASTER_DATA 빈 부재를 "검사 생략"으로 쓰고 있다)와 spec 수용 기준 1(TB_MDM_DATA 중복 거부)을 함께 지키는 유일한 선택지다.
- **반려 시 재작업**: ②면 `MasterDataIdNamespace` 빈을 만들고 columnMng 테스트(C28 계열)와 E2E 픽스처를 고친다. 07-02 가 빈을 등록한 뒤에는 `CodeMngService` 를 이름 공간 목록 순회로 바꿀 수 있다(동작 동일).

### D5 — 운영 `CodeLookup` 빈을 등록하지 않고 수용 기준 5는 `MdmCodeLookup` 구현체로 시험
- **질문**: "폐기 후 CODE_LIST 숨김·MASTER 유지"를 보려면 엔진이 04 원장을 읽어야 한다. 운영 빈을 등록하면 decisions.md:449 대로 도메인 저장 R10 거부·MASTER 판정이 자동으로 켜져 TSK-04-03 동작·테스트가 바뀐다.
- **선택지**: ① 구현체(`MdmCodeLookup`)는 만들되 `@Component` 로 등록하지 않고 테스트가 `DefaultCodeResolver` 에 직접 붙인다 — 강도 중. ② 운영 빈 등록 — 강도 약(이 Task 범위 밖의 도메인 동작 변경, 형제 Task 테스트 영향). ③ 엔진 단위 테스트만 인용 — 강도 약(DB 상태→엔진 경로를 시험하지 않는다).
- **택한 것**: ①. 등록 시점은 06-05 이후 판단으로 넘긴다(인계).
- **근거**: spec 수용 기준 5 는 엔진 판정 결과를 요구할 뿐 운영 빈 등록을 요구하지 않는다. 리포 기존 결정(decisions.md:449)이 빈 등록의 부작용을 명시했다.
- **반려 시 재작업**: ②면 `@Component` 한 줄과 TSK-04-03 테스트(`DomainMngWithoutCodeLedgerTest` 등) 기대값 조정, `MdmCodeLookupAvailability` 의 W02 경로 재확인.

### D6 — `MasterCodeSegmentService` 구현 클래스를 만들지 않고 06-02 몫 두 메서드를 별도 컴포넌트에 둔다
- **질문**: 계약 인터페이스 하나를 06-02(`createBaseCategory`·`fillFrom`)·06-03·06-04 가 나눠 구현하게 돼 있고 06-03 이 동시에 돈다.
- **선택지**: ① `MasterCodeVersionSegments`(인터페이스 미구현, 같은 이름·시그니처의 두 메서드) — 강도 중(충돌 없음, 06-03 이 위임). ② 이 Task 가 구현 클래스를 만들고 나머지 10개 메서드는 `UnsupportedOperationException` — 강도 약(06-03 과 add/add 충돌, 미완성 빈이 운영에 뜬다).
- **택한 것**: ①.
- **근거**: 미승인 선행 산출물(TSK-06-01 계약의 구현 배정)과 팀장 지시(형제 Task 범위 경계·충돌 최소화)를 함께 지킨다.
- **반려 시 재작업**: ②면 구현 클래스를 만들어 두 메서드를 옮기고 06-03 머지 때 합친다.

### D7 — 미적용 2개 상태에서는 선점·해제·넘기기도 막는다(수용 기준을 글자 그대로)
- **질문**: 수용 기준은 "2개면 DRAFT 삭제만 허용"인데 공통 서비스(TSK-01-03)는 소유권 연산에 개수 검사를 두지 않았다(04:299 "허용: DRAFT 삭제, 조회"). 화면 서비스가 소유권 연산을 막아도 되는가.
- **선택지**: ① codeEdit 의 `acquire`·`release`·`handover` 앞에서 MDM007 — 강도 강(spec 수용 기준 글자 그대로). ② 공통 서비스처럼 허용 — 강도 약(수용 기준과 어긋난다).
- **택한 것**: ①. 공통 서비스는 허용하지만 화면 서비스가 막는다.
- **근거**: spec 본문(수용 기준 7). 막아도 막다른 상태가 생기지 않는다 — 미적용 2개는 major·minor 동시 클릭으로만 생기고(해제된 DRAFT 가 있으면 `checkCanCreateVersion` 이 둘째를 막는다), 그때 두 DRAFT 는 만든 사람이 각각 자동 선점하므로 각 소유자가 자기 DRAFT 를 지울 수 있다.
- **반려 시 재작업**: ②면 세 메서드의 개수 검사를 빼고 V5·I6·버튼 매트릭스(선점·해제 활성)·version-buttons 기대값을 고친다.

### D8 — ID 문자 제약 = 컬럼 물리명 규칙 전체(대문자 스네이크) + 50자
- **질문**: 04 는 "점·공백·콤마 금지. 컬럼 물리명 규칙과 같다"고 했다. 금지 문자만 볼지, 물리명 패턴 전체를 볼지.
- **선택지**: ① `NamingRules.STD_PHYS_NAME` + 50자 + `MaruIdRules` 금지 문자 — 강도 중(원천 문장 "물리명 규칙과 같다"를 그대로 적용, 원천 예시 ID 가 모두 대문자 스네이크). ② 금지 문자만 — 강도 약(소문자·한글·하이픈 ID 가 생겨 `MASTER("…")` 인자 규칙과 어긋날 수 있다).
- **택한 것**: ①. `NamingRules` 는 `dma.naming` 에 있으나 lib 안 유틸이라 그대로 import 한다.
- **근거**: spec 가 지목한 원천 04 「식별자」 표 문장("컬럼 물리명 규칙과 같다")과 리포 기존 유틸(`NamingRules.STD_PHYS_NAME`).
- **반려 시 재작업**: ②면 `CodeMngService` 의 패턴 검사 한 줄과 R2 의 소문자·숫자 시작 케이스를 뺀다.

### D9 — CREATED(버전 없음 포함)에서도 폐기 허용
- **질문**: 04 표는 "→ DEPRECATED 조건: 미적용 버전이 없을 것"만 적고 출발 상태를 적지 않았다.
- **선택지**: ① CREATED·INUSE 모두 허용 — 강도 중(조건 문장을 글자 그대로, 잘못 만든 코드를 치울 수단). ② INUSE 만 — 강도 약(원천에 없는 조건).
- **택한 것**: ①.
- **근거**: spec 가 지목한 원천 04 「마루 코드 폐기」 조건 문장을 글자 그대로 적용했다. 출발 상태 제한은 원천에 없다.
- **반려 시 재작업**: `deprecate` 에 "저장·계산 상태 INUSE" 검사(MDM009)를 더하고 E8·E2E E3(B 폐기)를 RELEASED 가 있는 코드로 바꾼다(06-05 확정이 필요해 E2E 는 seed 필요).

### D10 — DEPRECATED 이후에도 헤더 경미 수정 허용
- **질문**: 폐기된 코드의 이름·설명·라벨을 고칠 수 있는지 원천에 없다.
- **선택지**: ① 허용(판정에 쓰지 않는 값, 과거 기준일 판정은 계속된다) — 강도 약. ② 거부 — 강도 약.
- **택한 것**: ①(되돌리기 쉬운 쪽).
- **근거**: 원천 04 「경미 수정」은 판정에 쓰지 않는 값을 패치로 고치게 하고 DEPRECATED 를 예외로 두지 않았다. 강한 근거는 없어 되돌리기 쉬운 쪽을 골랐다.
- **반려 시 재작업**: `saveHeader` 에 DEPRECATED 검사(MDM009) 한 줄, 헤더 저장 버튼 조건에 `storedStatus ≠ DEPRECATED` 추가.

### D11 — 화면 설계 산출물은 기능설계서 1종
- **질문**: RULE.md·Mes-Guide 는 `docs/mdm/screens/{screenId}/` 5종을 요구한다.
- **선택지**: ① 기능설계서 1종(As-Is 없는 신규 화면 선례 넷, DEC-001) — 강도 중. ② 5종 — 강도 약(As-Is 분석 전제 템플릿이 "해당 없음"으로 채워진다). ③ design.md 만 — 강도 약(선례와 다름).
- **택한 것**: ①. Build 가 조각 a·b 에서 쓰고 식별자 사전 행을 함께 등재한다.
- **근거**: 리포 기존 관례(선례 넷: unitMng·termMng·domainMng·columnMng, DEC-001).
- **반려 시 재작업**: 문서만 바뀐다(코드 영향 없음).

### D12 — 화면 간 이동 규약(`openMdmPage`/handoff)을 새로 둔다
- **질문**: 포털에 파라미터를 들고 화면을 여는 API 가 없다(C8). "ID 링크로 수정 화면", "등록 뒤 수정 화면으로", "확정 이동" 이 모두 필요하다.
- **선택지**: ① m-mdm 셸에 전역 저장소 + `portal-open-tab` + `portal-tab-activated` 재확인 + snapshot 보존 규약 — 강도 약(선례 없음, shared 무수정). ② shared 포털에 파라미터 API 추가 — 강도 약(shared·포털 변경, 영향 범위 큼). ③ 이동 없이 codeEdit 에서 코드를 다시 고르게 함 — 강도 약(원천 04 화면 문장 위반).
- **택한 것**: ①. 06-03·06-05 가 같은 규약으로 받는다(§6.10).
- **근거**: spec 가 지목한 원천 04 「화면」 문장("ID 링크로 수정 화면에 간다", "수정 화면으로 간다")과 spec 요구사항 "확정 이동". 리포에 선례가 없어 shared 를 바꾸지 않는 쪽을 골랐다.
- **반려 시 재작업**: ②면 shared 에 API 를 두고 `page-handoff.ts` 를 그 API 호출로 바꾼다(호출부 불변).

### D13 — 복원 원본은 RELEASED 버전만
- **질문**: 새 버전 대화상자의 "vX 내용으로 채우기"에 어떤 버전을 보일지.
- **선택지**: ① RELEASED 만 — 강도 중(CANCELLED 는 철회 때 행이 지워져 모습을 재현할 수 없다 04:386, DRAFT 는 미적용이라 새 버전을 만들 수 없는 상태). ② 모든 버전 — 강도 약.
- **택한 것**: ①.
- **근거**: spec 가 지목한 원천 04 「되돌리기와 철회」(철회 때 행 삭제)와 「한 번에 하나」(미적용이 있으면 새 버전 불가).
- **반려 시 재작업**: `restoreSources`·P3 검사 조건만 바꾼다.

---

## 인계

| 받는 쪽 | 내용 |
|---|---|
| TSK-06-03 | `MasterCodeSegmentService` 구현 클래스를 만들 때 `createBaseCategory`·`fillFrom` 을 `MasterCodeVersionSegments` 에 위임(D6). 조회는 `MasterCodeLedgerQueries`·`MasterCodeVersionSegments.rowsAt` 재사용. 화면 진입 파라미터는 `useMdmPageParams("dmc/codeItemEdit", tabId, …)` → `{maruCodeId, ver}` |
| TSK-06-05 | 진입 파라미터 `useMdmPageParams("dmc/codeConfirm", tabId, …)` → `{maruCodeId, ver}`. 운영 확정 SPI 를 등록해도 `VersionScenarioTestConfig` 가 시나리오 테스트를 지킨다(§6.13). 운영 `CodeLookup` 등록 판단(D5) — `MdmCodeLookup` 에 `@Component` 만 붙이면 된다 |
| TSK-07-02 | `MasterCodeIdNamespace`(MASTER_CODE) 운영 빈이 있다. MASTER_DATA 빈은 07-02 가 만든다(D4) — 그때 columnMng 동작이 바뀐다 |
| TSK-08-02 | 소유권 액션 이름·추가 모양·`MdmStewardGuard`·§6.13 을 같게(D2). BUSINESS_RULE 삭제 훅을 운영 빈으로 등록해도 §6.13 이 덮는다 |
| 로컬 개발자 | 기존 mcm.db 는 `ensureMdmPermActions` 가 부팅 때 PERM_MDM_EDIT·CONFIRM 에 소유권 액션을 채운다. 넘기기는 D3 어댑터 전까지 항상 거부된다 |
| 팀장 | E2E 전체 목록(§9 7단계)에 `mdm-codeMng.spec.ts`·`mdm-codeEdit.spec.ts` 가 더해졌다. 머지 뒤 dialect_check 에 `MasterCodeNativeSqlMssqlTest` 가 포함된다 |
