# TSK-05-02 설계 — 전문 헤더·레이아웃 편집 (headerMng · layoutMng)

> category dev · domain fullstack · priority high · model opus. 에이전트 프롬프트(`item.agent_prompt`) 없음.
> 기점: `86baa20`(브랜치 `agent/8c8a2080-header-layout-mng`). 설계 시점 `origin/dev` = `d52deb9`(기점 뒤 TSK-04-04 컬럼 사전 머지, §0 F20).
> 입력: `spec.md` · `RULE.md` · `.claude/skills/dflow-dev/references/dev-discipline.md` · 원천 `docs/mdm/design/basic/03-interface-layout.md`(이하 **03**) · 시안 `docs/mdm/design/basic/html/03-interface-layout.html`(이하 **html**) · `docs/mdm/{PRD,TRD,decisions}.md` · `docs/mdm/screens/README.md` · 선행 `docs/mdm/tasks/{TSK-05-01,TSK-01-03,TSK-04-03,TSK-01-02}/design.md` · 코드 `src/backend/mdm/**`, `src/backend/mcm/.../DataInitializer.java`, `src/frontend/{m-mdm,shared,e2e}/**`.
> 적용 스킬: `mantine-aggrid-ui`(m-mdm 화면·그리드, shared 래퍼 규칙), `oasis-project-support`·`bpmn-skill`·`oasis-contract-check`(OASIS 서비스 2개와 BPMN). 스키마 변경이 없어 `flyway-migration-add` 는 쓰지 않는다(§1).
> 근거 강약: spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물(TSK-05-01·TSK-01-03·TSK-04-03 은 dev 머지·서버 승인 전).

**RULE.md 라우팅**: 이 작업은 `src/backend/mdm`·`src/frontend/m-mdm` 을 고치는 MES 쪽 **분기 3(MES 개발)** 이다(RULE.md §"작업 분기" 식별 규칙 — 화면코드가 `APS_` 가 아니고 경로가 `src/backend/{moduleId}`). mdm 의 화면 산출물 위치는 `docs/mdm/screens/{screenId}/` 다(RULE.md:24). mdm 선례(TSK-04-03 D8, TSK-04-04)는 5종 대신 **기능설계서 1종**을 두었으므로 이 작업도 그렇게 한다(§2). FE 구현 규칙은 `docs/guide/FrontEnd/README.md`(RULE.md:31)를 따르고, 패키지 명명·URL 컨벤션은 `docs/mdm/screens/README.md` §5 가 정본이다:

| 대상 | 규칙(screens/README §5, TRD:14·17·38·39) | 이 작업의 값 |
|---|---|---|
| BE 패키지 | `com.dongkuk.dmes.mdm.{group}.{screenId}.{dto,service}` | `…mdm.dmb.headerMng.{dto,service}`, `…mdm.dmb.layoutMng.{dto,service}`, 그룹 공용 `…mdm.dmb.layout`(선례 `dma/naming`, TSK-04-04) |
| BPMN | `api/src/main/resources/services/{group}/{screenId}.bpmn`, process id = serviceId = screenId | `services/dmb/headerMng.bpmn`, `services/dmb/layoutMng.bpmn` |
| URL | `POST /api/mdm/oasis/{serviceId}/{action}` | `/api/mdm/oasis/headerMng/{search,view,save}`, `/api/mdm/oasis/layoutMng/{search,view,save}` |
| FE 화면 | `src/frontend/m-mdm/pages/{group}/{screenId}/page.tsx` | `pages/dmb/headerMng/page.tsx`, `pages/dmb/layoutMng/page.tsx` |
| componentPath | `{group}/{screenId}` | `dmb/headerMng`, `dmb/layoutMng`(D1) |

---

## 0. 조사로 확인한 사실 (Build 는 원천 문서를 다시 읽지 않아도 된다)

| # | 사실 | 근거 |
|---|---|---|
| F1 | **레이아웃 실행 로직(오프셋·총 길이 계산, fill_kind 검증, 3층 기본값 해석)은 lib 어디에도 없다.** TSK-05-01 은 계약 전용이었다 — 엔티티 5개·리포지토리 5개(finder 없음)·`contract.layout` record/enum/interface·스냅샷 JSON 스키마뿐이고, 사용처는 0건이다. 그래서 이 작업이 계산·검증을 새로 만든다. 단 **도메인 파생(타입·길이·소수·단위)은 이미 있는 `DomainTreeReader.load()` → `DomainTreeSnapshot.chainRootFirst(domainId)` → `DomainChainAssembler.assemble(chain)` → `EffectiveDomainView(dataType, length, scale, unitCode, domainKind, …)` 를 그대로 부른다**(재구현 금지, 불변 I4) | `lib/.../common/dictionary/{DomainTreeReader.java:20, DomainTreeSnapshot.java:81, DomainChainAssembler.java:30-67, EffectiveDomainView.java:16-29}`. 파생 규칙: dataType·domainKind = 최상위 조상, length·scale·unitCode = root→자신 방향 마지막 non-null(`DomainChainAssembler.java:44-47`) |
| F2 | 엔티티(모두 `CactusAuditEntity` 상속, 감사 `VER` = `Long version`, 연관관계 매핑 없음): `MdmEai`(`@Id eaiCode`, eaiName, encoding, padRule, `Long headerLayoutId`, 생성자 `(eaiCode, eaiName, encoding)`), `MdmLayout`(`@Id Long layoutId` IDENTITY, layoutKind, layoutName, eaiCode, sndSystem, rcvSystem, `int totalLength`, `long layoutVersion`=`` `VERSION` `` — `@Version` 아님, 생성자 `(layoutKind, layoutName)`), `MdmLayoutItem`(`@IdClass(MdmLayoutItemId)` layoutId+seq, fillKind, columnPhys, transUnit, unitItem, numFormat, defaultValue, `Integer fillerLength`, `int offset`=`` `OFFSET` ``, `int length`=`` `LENGTH` ``, 생성자 `(layoutId, seq, fillKind)`), `MdmLayoutHeader`(`@IdClass` layoutId+seq, `Long headerLayoutId`, 생성자 3인자·setter 없음), `MdmLayoutConst`(`@IdClass` layoutId+headerLayoutId+headerSeq, constValue, 생성자 4인자). 경로 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/entity/` | 파일 직접 확인 |
| F3 | DB 제약(V4 SQLite/MSSQL): `CK_TB_MDM_LAYOUT_KIND`(HEADER/MESSAGE), `CK_TB_MDM_LAYOUT_ITEM_FILL_KIND`(DATA/CONST/AUTO/FILLER), `CK_TB_MDM_LAYOUT_ITEM_UNIT`(TRANS_UNIT IS NULL OR UNIT_ITEM IS NULL), FK `COLUMN_PHYS→TB_MDM_COLUMN.PHYS_NAME`, `TRANS_UNIT→TB_MDM_UNIT`, `SND/RCV_SYSTEM→TB_MDM_SYSTEM`, `EAI_CODE→TB_MDM_EAI`, `TB_MDM_EAI.HEADER_LAYOUT_ID→TB_MDM_LAYOUT`, `UX_TB_MDM_LAYOUT_HEADER_HDR(LAYOUT_ID,HEADER_LAYOUT_ID)`, CONST 의 FK 3개(→LAYOUT, →LAYOUT_ITEM(HEADER_LAYOUT_ID,HEADER_SEQ), →LAYOUT_HEADER(LAYOUT_ID,HEADER_LAYOUT_ID)). CASCADE 없음. **"대상 항목이 CONST 인지", "헤더 쪽이 LAYOUT_KIND='HEADER' 인지" 는 앱 검사다**(TSK-05-01 §6.0) | `api/src/main/resources/db/migration/mdm/sqlite/V4__create_mdm_interface_layout.sql` |
| F4 | **예약어 칼럼(`OFFSET`·`LENGTH`·`VERSION`)은 JPA 엔티티 매핑의 백틱 인용으로만 안전하다**(D-047). 네이티브 SQL 에 백틱을 쓰면 MSSQL 에서 깨지고, 인용 없이 쓰면 방언별 예약어 충돌 위험이 있다 → 이 세 칼럼의 읽기·쓰기는 전부 엔티티(JPQL·리포지토리)로 한다. 네이티브 SQL 은 사전 조인·헤더 사용처 집계처럼 예약어가 없는 칼럼에만 쓰고, 행 수 제한은 `LIMIT`/`TOP` 이 아니라 `Query.setMaxResults` 로 한다(불변 I18) | `docs/mdm/decisions.md` D-047, TSK-05-01 D1 |
| F5 | **TB_MDM_COLUMN 에는 타입·길이 칸이 없다.** `MdmColumn` = columnId, columnName(논리명), labelLong/Mid/Short, physName(유일), domainId(NOT NULL), required, defaultValue, refKind… . 타입·길이·소수·단위는 모두 도메인에서 파생한다. 물리명 → 도메인 id finder 는 기점에 없다(`MdmColumnRepository` 는 선언만. dev 의 TSK-04-04 가 `findByPhysName` 을 더했다 — F20) | `entity/MdmColumn.java:24-73`, `repository/MdmColumnRepository.java` |
| F6 | **숫자 도메인의 LENGTH 는 전체 자리수(precision)다.** "숫자 3,1 → Oracle `NUMBER(3,1)`, SAP `DEC 3,1`"(02:191), `DomainRuleChecker` S06 "소수 자리 > 길이"(`DomainRuleChecker.java:257`). 도메인 10 코일 두께(숫자 3,1, mm)의 값은 최대 3.5 → 3자리면 담기지만 M201 은 이 항목을 **4바이트**(`0035`)로 싣는다(html 항목 상세 "표현 자리수 4 — 도메인 3,1을 담을 수 있다"). 즉 4 는 도메인에서 파생되지 않고 **항목의 숫자 표현 자리수(표현 형식)** 에서 온다 → 표현 자리수를 NUM_FORMAT 에 담는다(D3). 도메인 30 일자는 `문자 8`(STRING, LENGTH 8)이라 DATE 전용 보정이 필요 없다(02:998) | `02-term-domain-column.md:191,995-998`, html 항목 상세 |
| F7 | **M201 수치는 html 에 실제로 있다**: 헤더 L100 GLUE 공통 헤더 13항목 100바이트(항목 길이 8·4·3·4·3·14·14·12·1·5·1·6·FILLER 25, 헤더 내부 오프셋 0·8·12·15·19·22·36·50·62·63·68·69·75), L110 L2 구간 헤더 6항목 30바이트(2·4·5·8·6·FILLER 5, 오프셋 0·2·6·11·19·25), 전문 M201 = 헤더 L100(메시지 절대 0)+L110(100) → 헤더 합 130, 본문 COIL_ID 20(130)·PROD_DT 8(150)·COIL_THK 4(158, 암묵 소수 1·0 채움)·FILLER 25(162) → 본문 57, 총 187. 03 원문 샘플(157/100, L110 제외)은 하위집합이다(TSK-05-01 F12·D3) | html `p-hdr` 표 2개, `p-layout` "헤더 130 (100 + 30) + 본문 57 (20 + 8 + 4 + 25) = 187 바이트", 스냅샷 예시 |
| F8 | **오프셋 기준**: 헤더 항목의 OFFSET 은 그 헤더 안 상대값(0부터, html "오프셋은 이 헤더 안에서 0부터 센다"), 전문 본문 항목의 OFFSET 은 메시지 절대값(html COIL_ID 130). 헤더가 메시지에서 시작하는 절대 위치는 저장 칼럼이 없고 스택 순서로 계산한다(`MdmLayoutHeaderRef.offset`, TSK-05-01 F23) | TSK-05-01 F23, 불변 규칙 15 |
| F9 | 3층 기본값: "EAI 헤더 항목의 기본값 → 전문별 재정의 → 송신 시점 AUTO 채움. 앞 층이 정한 값을 뒤 층이 덮는 것이 아니라, 헤더 템플릿이 기본값을 제안하고 전문이 상수를 확정하며 AUTO만 실행 시점에 채워진다"(03:23). 상수 편집 표 = 항목 / 헤더 기본값 / 이 전문의 값, **AUTO·FILLER 항목은 나오지 않는다**, 재정의 값도 그 항목 도메인 유효 식으로 검증(html 상수 편집 아래 문구 — 유효 식 검증은 거부 #2 라 TSK-05-03 몫, D7) | 03:23-25, html `p-layout` 상수 편집 |
| F10 | fill_kind 별 입력 칸 표(html "닫힌 칸에 값이 들어가면 저장을 거부한다"): 컬럼 = DATA·CONST·AUTO 필수, FILLER 없음 / 기본값 = DATA 없음, CONST 상수 값, AUTO 열거형, FILLER 없음 / FILLER 길이 = FILLER 만 필수 / 전송 단위·단위 항목 = DATA·CONST 둘 중 하나, AUTO·FILLER 없음 / 숫자 표현 형식 = DATA·CONST·AUTO 숫자 도메인, FILLER 없음 / 타입·길이 = FILLER 빼고 파생. AUTO 열거형 = SEND_TIME·MSG_LENGTH·SEQ·LAYOUT_ID 넷(html, 03:21) | html `p-layout` "fill_kind별 입력 칸" 표 |
| F11 | **OASIS 규칙(TSK-04-03 B0 실측)**: 서비스에 `@Transactional` 금지(CGLIB 프록시가 파라미터 이름을 잃어 `ParameterName must not be null`), 트랜잭션은 `cactus.oasis.transactional: true` 로 action 한 건. 요청 `{meta, params, grids:{<id>:{rows:[…]}}}`, params 는 DTO 에 평탄 바인딩, 추가 파라미터 `List<Map<String,Object>>` 는 **파라미터 이름 = grid id** 로 바인딩(`-parameters` 컴파일 옵션). grid 를 빼면 바인딩 실패 → 화면은 grid 를 빈 배열이라도 늘 보낸다. params 값이 `null` 이면 S999, `""` 이면 NumberFormatException → 화면이 null·빈 문자열 키를 뺀다(`cleanParams`). `camunda:property optional` 은 쓸 수 없다. 서비스 예외는 HTTP 200 + `meta.success=false`, `meta.message` = 예외 message 원문, `errors[]` 비어 옴. 응답은 `Map` 결과가 `data.result.*` 로 간다. 행 키는 UPPER_SNAKE | TSK-04-03 design §9.1 B0, `DomainMngService.java:47-49`, `CactusRequestConverter.java:36-46`, `CactusResponseConverter.java:53-78` |
| F12 | **BFF RBAC 권한키 = module/serviceId/action.** 액션 이름은 `MdmActions` 13종(search·view·export·compare·save·delete·reg·import·validate·execute·copy·restore·confirm) 안에서만 고른다 — 밖의 이름은 SYSADMIN 도 403(DataInitializer:324 주석, PERM_ALL allActions). `dmb` 권한 매트릭스: MDM_STD_ADMIN=PERM_MDM_EDIT, MDM_STEWARD=PERM_MDM_READ(search·view·export·compare) (`DataInitializer.java:987`, `SecurityScreenContractTest:80`) → 이 작업의 액션은 **search·view·save 셋**만 쓴다(D8) | `contract/security/MdmActions.java`, `m-mcm/proxy.ts:104-107` |
| F13 | 메뉴·OBJECT·RBAC 시드는 `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` `seedMdmMenus()`(:866-902). `dmb "레이아웃"` 폴더는 이미 있다(`insertMpnFld("dmb","00000200","레이아웃","mdm",5020000L)` :878). leaf 가 없는 폴더는 사이드바에 안 보인다(:845-846). 선례 `seedMdmDomainMngMenu()`(:1032-1045): `insertMcmSecObjIfAbsent(objectId, 이름, "mdm")` → `insertMcmSecMenuIfAbsent(menuId, menuSeq, fullSeq, 이름, 그룹, objectId)`(:1202) → SYSADMIN×PERM_ALL `insertIfAbsentComposite` → `seedMdmObjectRbac(objectId, 그룹)`. FULL_SEQ 는 부팅 끝 `recomputeMenuFullSeq()` 가 다시 매긴다. 기존 줄은 한 글자도 고치지 않는다 | `DataInitializer.java` 직접 확인, TSK-04-03 §3.9 |
| F14 | FE 배선: 화면 등록은 ① `m-mdm/tsup.config.ts` pages entry 1줄씩(1:1 대응은 `tests/tsup-entries.smoke.test.ts` 가 자동 검사) ② `pnpm build:libs` ③ `node src/frontend/m-mcm/scripts/generate-page-registry.mjs` 로 `m-mcm/lib/generated/page-registry.ts` 재생성(추적 파일, 손으로 고치지 않는다. `next dev` 를 직접 띄우면 predev 가 돌지 않으므로 커밋된 레지스트리를 쓴다) | TSK-04-03 §3.9·F22 |
| F15 | FE 관례: 화면은 `@dk-oasis/shared/*` 만 import(`@mantine/*`·`ag-grid-*` 금지, mantine-aggrid-ui §3). 셸 `m-mdm/src/shell/MdmPageLayout.tsx`(props `group, screenId, title, buttons?, className?, children`, breadcrumb `마루 MDM > {그룹 폴더} > {title}`, footer screen-id), `MDM_GROUPS.dmb = "레이아웃"`. 호출 래퍼 모양은 `pages/dma/domainMng/api.ts`(`OASIS_BASE`, `unwrap`: `meta.success===false` 면 `meta.message` 로 throw, `cleanParams`, `callAction(action, params, grids)` body `{meta:{menuId}, params, grids}`). 오류는 shared `ErrorModal`(`.error-modal__body`, 버튼 "확인"), 성공은 `useMessage().showMessage({message, toast:true})`, 확인 창은 `showMessage({alertType:"confirm"})`. RBAC 버튼은 `useUserButtonRbac` + `canDoButton(rbac, SCREEN_ID, "save")`. 모달 `@dk-oasis/shared/modal` `Modal`(`open, title, toolbar, footer, onClose, size`) | `pages/dma/domainMng/{page.tsx,api.ts}`, `shared/src/layout/ErrorModal.tsx`, `shared/src/components/modal/modal.tsx:204-219` |
| F16 | **shared `AgDataGrid` 에는 행 드래그를 켤 방법이 없다** — `GridColumn`(`AgDataGrid.tsx:152-209`)에 `rowDrag` 가 없고, `AgDataGridProps`(:211~)에도 `rowDragManaged`·`onRowDragEnd` 가 없으며, `<AgGridReact>`(:1068-1126)에 넘기는 prop 이 고정 목록이다. 모듈은 `AllCommunityModule` 을 등록한다(:21) — 행 드래그(managed)는 community 기능이다. 리포 전체에 rowDrag 선례 0건. mantine-aggrid-ui §3: "래퍼가 요구를 못 채우면 화면에서 우회하지 않는다 … 승인되면 shared 에 추가"(D6) | `shared/src/components/grid/AgDataGrid.tsx` |
| F17 | vitest(m-mdm): `environment: "node"`, `include: ["tests/**/*.test.ts"]` — **`.tsx` 테스트는 조용히 빠진다**. 위치는 `m-mdm/tests/<화면 경로>`, 렌더 테스트는 첫 줄 `/** @vitest-environment happy-dom */` + `createElement` + `DmesUiProvider`, fetch 는 URL 별 스텁, `__dkOasisButtonRbacStore__` 는 테스트마다 지운다(선례 `tests/dma/domainMng/page-render.test.ts`). `lint` = `tsc --noEmit`(tsconfig include `src, pages, app` — tests 는 lint 대상 아님) | `m-mdm/vitest.config.ts`, `m-mdm/package.json` |
| F18 | 백엔드 테스트 관례: api SQLite 통합 테스트는 `@SpringBootTest(webEnvironment = MOCK)`(HTTP 흐름은 `RANDOM_PORT`) + `@ActiveProfiles("local")` + `@TempDir static Path tempDir` + `@DynamicPropertySource` 로 `spring.datasource.url=jdbc:sqlite:<tempDir>/x.db`(Flyway 가 새로 적용). 픽스처는 `JdbcTemplate` 네이티브 INSERT, 서비스는 빈 직접 호출. HTTP 흐름은 JDK `HttpClient` 로 `POST http://127.0.0.1:{port}/oasis/{serviceId}/{action}` + 헤더 `X-Client-Key`(`cactus.security.client-key` 테스트 값 또는 env `BACKEND_CLIENT_KEY`), `X-Authenticated-User`, `X-Authenticated-Role: SYSADMIN`. 메서드 이름은 한글+밑줄, `@DisplayName` 안 씀 | `api/src/test/.../dma/domainMng/{DomainMngOasisFlowTest.java:38-91, DomainMngApiSupport.java}` |
| F19 | 오류 운반: `MdmErrors.of(MdmErrorCode)`(`common/support/MdmErrors.java`)가 `BusinessException(code.transport(), message, details)` 를 만든다. 동시 수정은 `MdmErrorCode.ROW_VERSION_CONFLICT`(MDM001, "다른 사용자가 수정했습니다. 다시 불러오세요") — 요청 `ver` ≠ DB `VER` 이면 던진다(TSK-04-03 D5 선례). 저장 거부는 `DomainRejections`(`dma/domainMng/service/DomainRejections.java`) 모양: message = `접두어 + "L01[3] …; L02[…] …"`, details 첫 행 코드 + 이슈 행 | 파일 직접 확인 |
| F20 | **기점 이후 dev 에 TSK-04-04(컬럼 사전)가 머지됐다**(`b674fe0`). 이 작업과 같은 파일을 건드린다: `MdmErrorCode`(MDM016~MDM021 추가, `CommonContractTest` 개수 단언 변경), `MdmErrors`(message 형식 변경), `MdmColumnRepository`(`findByPhysName` 추가), 새 `common/security/MdmStdAdminGuard`(TSK-04-04 D1 — 서비스가 표준 관리자 역할을 직접 검사, SYSADMIN 도 거부), `DataInitializer.seedMdmMenus()`(columnMng 블록 추가), `m-mdm/tsup.config.ts`(external 배열 재정렬 + columnMng entry), `page-registry.ts`, 식별자 사전. 그리고 **E2E `mdm-columnMng.spec.ts` 의 E1 은 컬럼 사전이 완전히 비어 있어야 통과**하고(`column-list-empty`), E5 는 `코일 두께`(COIL_THK) 컬럼 저장이 MDM018 로 거부되기를 기대한다(같은 이름 컬럼이 있으면 MDM019 로 바뀌어 깨진다). 이 작업은 기점 위에서 설계하되 **이 파일들 중 고치지 않아도 되는 것은 고치지 않는다**(D4·D5, §2 겹침 표) | `/usr/bin/git diff HEAD origin/dev`, `origin/dev:src/frontend/e2e/mdm-columnMng.spec.ts:103-110,184` |
| F21 | Flyway: 기점·dev 모두 V1~V4 + V8(V5~V7 은 팀장 배정 공백). **이 작업은 스키마를 바꾸지 않는다**(D2 — 인코딩·패딩은 EAI 칸, 상수 재정의는 `TB_MDM_LAYOUT_CONST`, 숫자 표현 자리수는 `NUM_FORMAT` 문자열에 담는다). 따라서 마이그레이션 번호를 고르지 않는다 | `/usr/bin/git ls-tree origin/dev …/migration/mdm/{sqlite,mssql}/`(2026-09-24 fetch 후 확인) |
| F22 | `DomainMngStaticGuardTest` 는 `dma.domainMng`·`common.dictionary`·`common.engine` 패키지만 검사하고, "03 테이블을 읽지 않는다" 단언은 `DomainImpactQueries.ALL_SQL` 에만 건다 → 새 `dmb.*` 패키지의 SQL 이 `TB_MDM_LAYOUT` 을 읽어도 그 테스트는 깨지지 않는다 | `lib/src/test/.../dma/domainMng/DomainMngStaticGuardTest.java:25-67` |
| F23 | `MdmDomainReferenceSpi`(refKind `LAYOUT_ITEM`)의 실 구현은 아직 없다(테스트 스텁뿐). wbs TSK-05-03 요구사항 "컬럼·도메인 변경 영향 전문 목록"(wbs:815)이 같은 방향이다 → 이 작업은 만들지 않는다(D7) | TSK-05-01 F17, TSK-04-03 §8:540, D-055 |
| F24 | 형제 TSK-05-03(직렬화기·등록 검증 7종·버전·스냅샷, spec.md 는 아직 없음, wbs:791-837)이 **같은 `dmb.layoutMng` 패키지·BPMN·page.tsx·메뉴 leaf·`e2e/mdm-layoutMng.spec.ts`** 를 tech-spec 에 적었다(wbs:829-831) → 병렬로 돌면 layoutMng 한 벌이 add/add 충돌한다. 이 작업은 계산·검증을 `dmb.layout` 공용 패키지의 작은 클래스로 분리해 05-03 이 재사용하게 하고(§1), 겹칠 파일을 §2 에 적는다 | `docs/mdm/wbs.md:791-837` |
| F25 | html 의 "구간 종류 [미결]"(EAI 구간/시스템 구간)은 확정 ERD 에 칸이 없다(TSK-05-01 F24 인계). 헤더 적층 규칙 "헤더를 전문마다 고를지, 송수신 시스템에서 자동으로 정할지는 미결"(html). TSK-05-01 F4: 메시지 레이아웃 저장 시 `eai_code` 가 있으면 앱이 `TB_MDM_EAI.HEADER_LAYOUT_ID` 를 헤더 적층 seq=1 로 **자동 삽입**하고 담당자가 seq=2… 를 더 붙인다 | TSK-05-01 F4·F24, html `p-layout` 헤더 구성 |
| F26 | E2E 선례(TSK-04-03 §4.6, TSK-04-04 §3.6): 빈 포트에 mcm·mdm 백엔드를 `--no-daemon` bootRun 으로, 포털(m-mcm)을 `next dev --turbopack --port` 로 직접 띄운다. 워크트리에 `src/backend/data/` 가 없으면 mcm(local)이 **메인 체크아웃 DB 를 잡으므로** 반드시 만든다(TSK-01-02 F17). mcm 기동 뒤 `e2e/fixtures/mdm-rbac-seed-check.sql` 대조와 `mdm-rbac-users.sql`(e2e_mdm_none·steward·stdadmin, 비밀번호 admin123). `fullyParallel` 이라 병렬 로그인이 `SQLITE_BUSY` 를 내므로 `--workers=1`. 기존 스펙은 추적 중인 스크린샷(`TSK-01-02/screens/dma-mdmSample.png`, `TSK-01-03/screens/*`, `TSK-04-03/screens/*`)과 `m-mcm/next-env.d.ts` 를 덮어쓰므로 끝에 되돌린다. `playwright.config.ts` 는 서버를 띄우지 않고 `baseURL` 도 없다 — 스펙이 `SMOKE_MCM_BASE_URL` 을 읽는다(기본 5100 은 메인 체크아웃 포털이라 거짓 통과) | `docs/mdm/tasks/TSK-04-03/design.md:432-475`, `origin/dev:docs/mdm/tasks/TSK-04-04/design.md:313-333` |
| F27 | 이 기점의 mdm E2E 스펙은 `mdm-domainMng.spec.ts`·`mdm-sample-smoke.spec.ts`·`mdm-shell-rbac-smoke.spec.ts` 셋이다. dev 머지 뒤에는 `mdm-columnMng.spec.ts` 가 더해진다(자기 픽스처 `mdm-columnMng-dict.sql` 이 mdm 기동 뒤 필요, 같은 mdm.db 로 재실행 불가) | `ls src/frontend/e2e`, F20 |

---

## 1. 접근 방식

**서버가 기준, 화면은 같은 계산의 즉시 미리보기**로 둔다. 오프셋·총 길이·항목 길이·fill_kind 닫힌 칸·3층 기본값은 순수 함수로 두 벌 만든다 — Java `com.dongkuk.dmes.mdm.dmb.layout`(저장 시 계산·거부, 03 "저장 시 계산한다")과 TS `m-mdm/src/layout/`(편집 즉시 재계산, spec "오프셋·총 길이 즉시 재계산"). 두 벌은 같은 M201 벡터(F7)와 같은 NUM_FORMAT 문자열 벡터로 각각 시험해 어긋나면 한쪽이 빨개지게 한다. 저장된 `OFFSET`·`LENGTH`·`TOTAL_LENGTH` 는 항상 서버가 다시 계산한 값이고 화면이 보낸 값을 믿지 않는다. 도메인 파생은 TSK-04-03 의 조립기(F1)를 그대로 부르고, 계산·검증 클래스는 `dmb.layout` 공용 패키지에 작게 나눠 형제 TSK-05-03(직렬화·거부 7종)이 재사용하도록 한다(F24).

스키마는 바꾸지 않는다(F21). 헤더의 인코딩·패딩은 **EAI 가 소유**하고 헤더 상세에서 그 EAI 행을 함께 편집한다(D2, TSK-05-01 D5 "05-02 가 EAI 값을 표시·상속"). 상수 재정의는 `TB_MDM_LAYOUT_CONST` 에만 쓰고 헤더 항목의 `DEFAULT_VALUE` 는 전문 화면이 절대 쓰지 않는다 — **layoutMng 의 save 는 헤더 항목을 받는 입력 자체가 없다**(헤더 구성·길이 잠김을 구조로 보장, 불변 I8). 헤더를 저장하면 그 헤더를 쌓은 전문 전체의 오프셋·총 길이를 같은 트랜잭션에서 다시 계산하고, 재정의는 헤더 항목의 `COLUMN_PHYS` 로 다시 짝지어 옮긴다(D7). 버전 증가·스냅샷·직렬화·등록 거부 7종 중 유효 식·차원·자리 용량·unit_item 대상 검사·`LAYOUT_ITEM` 영향도 SPI 는 TSK-05-03 몫으로 남긴다(D7).

오류 코드는 공유 enum `MdmErrorCode` 에 더하지 않고(D4 — dev 가 MDM016~021 을 이미 가져가 같은 줄 충돌·번호 충돌이 확정적이다) `LayoutRejections` 가 cactus `BusinessException` 을 직접 만든다. 동시 수정만 기존 MDM001 을 쓴다. 컬럼 사전 검색은 새 액션·새 팝업 OBJECT 없이 각 서비스의 `search` 에 `target=COLUMN` 으로 태운다(D8 — 액션 허용 목록·RBAC 시드를 늘리지 않는다). 행 드래그 순서는 shared `AgDataGrid` 에 선택형 prop 두 개를 더해 구현한다(D6).

---

## 2. 변경 파일 목록

경로 약어: `BL = src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`, `BLT = src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm`, `BA = src/backend/mdm/api/src/main`, `BAT = src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm`, `BAM = src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm`, `FM = src/frontend/m-mdm`, `FE = src/frontend/e2e`.

### 생성 — 백엔드 lib (공용 `dmb.layout`, 순수 계산 + 조회)

| 파일 | 내용 |
|---|---|
| `BL/dmb/layout/package-info.java` | "03 인터페이스 레이아웃 공용 계산·검증·조회(TSK-05-02). TSK-05-03 이 재사용한다" |
| `BL/dmb/layout/LayoutFillKinds.java` | fill_kind 칸 행렬(F10). `enum Field { COLUMN, DEFAULT_VALUE, FILLER_LENGTH, UNIT(trans_unit·unit_item), NUM_FORMAT }`, `static Cell cell(MdmFillKind, Field)` → `REQUIRED / OPTIONAL / CLOSED`. AUTO 열거형 상수 `AUTO_KINDS = List.of("SEND_TIME","MSG_LENGTH","SEQ","LAYOUT_ID")` |
| `BL/dmb/layout/LayoutItemDraft.java` | record — 저장 요청 한 행: `int seq, String fillKind, String columnPhys, String transUnit, String unitItem, String numFormat, String defaultValue, Integer fillerLength`. `static LayoutItemDraft fromRow(Map<String,Object>)`(키 `SEQ, FILL_KIND, COLUMN_PHYS, TRANS_UNIT, UNIT_ITEM, NUM_FORMAT, DEFAULT_VALUE, FILLER_LENGTH`, 빈 문자열은 null 로) — 화면이 보낸 `OFFSET`·`LENGTH` 키는 **읽지 않는다** |
| `BL/dmb/layout/LayoutNumFormat.java` | record `(boolean sign, boolean zeroPad, int impliedScale, int width)` + `MdmLayoutNumFormat toContract()`(width 는 계약 record 에 없고 스냅샷 `length` 로 간다, TSK-05-01 §6.1) |
| `BL/dmb/layout/LayoutNumFormatCodec.java` | `static String encode(LayoutNumFormat)` → `"SIGN=N;ZERO=Y;SCALE=1;WIDTH=4"`, `static LayoutNumFormat decode(String)`(형식 위반이면 `IllegalArgumentException`) — 형식 정본은 D3 |
| `BL/dmb/layout/LayoutColumnInfo.java` | record — 컬럼 사전 한 행 + 파생값: `physName, columnName, labelLong, displayName(=labelLong ?? columnName), Long domainId, domainName, dataType, Integer length, Integer scale, unitCode` |
| `BL/dmb/layout/LayoutOffsetCalculator.java` | 순수 함수(F7·F8). `static int itemLength(MdmFillKind, Integer fillerLength, LayoutNumFormat numFormat, Integer derivedLength)`(규칙은 불변 I4), `static Placed placeHeader(List<Integer> itemLengths)` → 상대 오프셋 목록 + 합, `static Stacked placeMessage(List<Integer> headerTotals, List<Integer> bodyLengths)` → 헤더 절대 시작 목록·헤더 합·본문 절대 오프셋 목록·총 길이. 중첩 record `Placed(List<Integer> offsets, int total)`, `Stacked(List<Integer> headerOffsets, int headerLength, List<Integer> bodyOffsets, int total)` |
| `BL/dmb/layout/LayoutConstResolver.java` | 순수 함수(F9). `static String effective(MdmFillKind kind, String headerDefault, String override)` — CONST: override 가 비어 있지 않으면 override, 아니면 headerDefault. AUTO: `"(송신 시 채움: " + headerDefault + ")"` 표시 문자열, override 무시. DATA·FILLER: null |
| `BL/dmb/layout/LayoutIssueCode.java` | enum L01~L11(§6.2 표) |
| `BL/dmb/layout/LayoutIssue.java` | record `(LayoutIssueCode code, Integer seq, String field, String message)` |
| `BL/dmb/layout/LayoutItemRules.java` | 순수 검사. `static List<LayoutIssue> check(List<LayoutItemDraft> items, Map<String, LayoutColumnInfo> dictionary)` — L01~L08(§6.2). 사전 조회는 인자로 받는다(순수) |
| `BL/dmb/layout/LayoutRejections.java` | `static BusinessException reject(String prefix, List<LayoutIssue>)` — message = `prefix + "L01[3] 컬럼 사전에 없는 컬럼이다: NOPE_X; …"`, transport `ErrorCode.BUSINESS_ERROR`, details 첫 행 `ErrorDetail.of("LAYOUT_SAVE_REJECTED", …)` 뒤 이슈 행(`DomainRejections` 모양, D4). `static BusinessException notFound(Long layoutId, String kind)`(L11). 접두어 상수 `HEADER_PREFIX = "헤더 저장 거부: "`, `MESSAGE_PREFIX = "전문 저장 거부: "` |
| `BL/dmb/layout/LayoutDictionary.java` | `@Component`. `Map<String, LayoutColumnInfo> byPhysNames(Collection<String>)`(LayoutQueries 로 컬럼 행 → `DomainTreeReader.load()` 한 번 → 각 domainId 에 `DomainChainAssembler.assemble(snapshot.chainRootFirst(id))`), `List<LayoutColumnInfo> search(String keyword)`(최대 100행) |
| `BL/dmb/layout/LayoutQueries.java` | `@Component`, `EntityManager` 만 쓴다(`DataSource.getConnection` 금지). **JPQL**(엔티티 경유, 예약어 칼럼 안전 F4): `itemsOf(Long layoutId)`(`SELECT i FROM MdmLayoutItem i WHERE i.layoutId = :id ORDER BY i.seq`), `headersOf(Long)`, `constsOf(Long)`, `constsOfHeader(Long headerLayoutId)`, `stacksUsing(Long headerLayoutId)`(`MdmLayoutHeader` where headerLayoutId), `layoutsOfKind(String kind)`, `eaiOfHeader(Long)`. **네이티브 SQL**(예약어 없는 칼럼만, 상수 `COLUMN_SEARCH_SQL`·`COLUMNS_BY_PHYS_SQL`·`SYSTEMS_SQL`·`ALL_NATIVE_SQL`): 컬럼 검색 `SELECT c.PHYS_NAME, c.COLUMN_NAME, c.LABEL_LONG, c.DOMAIN_ID, d.DOMAIN_NAME FROM TB_MDM_COLUMN c JOIN TB_MDM_DOMAIN d ON d.DOMAIN_ID = c.DOMAIN_ID WHERE UPPER(c.PHYS_NAME) LIKE :kw OR UPPER(c.COLUMN_NAME) LIKE :kw OR UPPER(COALESCE(c.LABEL_LONG, '')) LIKE :kw ORDER BY c.PHYS_NAME` + `setMaxResults(100)` — **`:kw` 는 늘 문자열로 바인딩한다**(키워드가 없으면 `"%"`). `:param IS NULL` 비교는 Hibernate 6 가 널 파라미터 타입을 추론하지 못해 MSSQL 에서 깨질 수 있어 쓰지 않는다(I18), 물리명 IN 조회, 시스템 목록 `SELECT SYSTEM_CODE, SYSTEM_NAME FROM TB_MDM_SYSTEM ORDER BY SYSTEM_CODE`. 한글 키워드 대소문자는 그대로 두고 영문만 대문자화(자바에서 `toUpperCase(Locale.ROOT)` 후 `%kw%`) |
| `BL/dmb/layout/LayoutWriter.java` | `@Component`. 쓰기 한 곳: `replaceItems(Long layoutId, List<MdmLayoutItem>)`(기존 행 `deleteAll` → `flush` → 새 행 `saveAll`), `replaceStack(Long messageId, List<Long> headerIds, List<MdmLayoutConst> consts)`(CONST 먼저 지우고 → HEADER 지우고 → flush → HEADER 넣고 → CONST 넣음, FK 순서 F3), `recalculateUsers(Long headerLayoutId)`(§6.4). **모든 쓰기는 리포지토리의 `save`·`saveAll`·`deleteAll` 과 `repository.flush()` 로 명시적으로 한다 — 변경 감지(더티 체킹)에 기대지 않는다.** 서비스 빈을 직접 부르는 SQLite 테스트에는 OASIS 트랜잭션이 없어 JPQL 로 읽은 엔티티가 분리 상태이고 setter 만 부른 변경은 버려지며, 트랜잭션 밖 `EntityManager.flush()` 는 예외다(운영과 테스트가 갈리는 것을 막는다, I23). `LayoutQueries` 는 읽기만 한다 |

### 생성 — 백엔드 lib (화면 서비스)

| 파일 | 내용 |
|---|---|
| `BL/dmb/headerMng/dto/HeaderMngSearchRequest.java` | POJO(getter/setter): `String target`(`HEADER` 기본·`COLUMN`), `String keyword` |
| `BL/dmb/headerMng/dto/HeaderMngViewRequest.java` | `Long layoutId` |
| `BL/dmb/headerMng/dto/HeaderMngSaveRequest.java` | `Long layoutId`(신규면 없음), `Long ver`, `String layoutName`, `String eaiCode`, `String eaiName`, `String encoding`, `String padRule` |
| `BL/dmb/headerMng/service/HeaderMngService.java` | `@Service("headerMngService")`, `@Transactional` 금지. `Map<String,Object> search(HeaderMngSearchRequest)`, `view(HeaderMngViewRequest)`, `save(HeaderMngSaveRequest request, List<Map<String,Object>> items)`(§6.1) |
| `BL/dmb/layoutMng/dto/LayoutMngSearchRequest.java` | `String target`(`LAYOUT` 기본·`HEADER`·`COLUMN`), `String keyword`, `Long headerLayoutId`, `String sndSystem`, `String rcvSystem` |
| `BL/dmb/layoutMng/dto/LayoutMngViewRequest.java` | `Long layoutId` |
| `BL/dmb/layoutMng/dto/LayoutMngSaveRequest.java` | `Long layoutId`, `Long ver`, `String layoutName`, `String eaiCode`, `String sndSystem`, `String rcvSystem` |
| `BL/dmb/layoutMng/service/LayoutMngService.java` | `@Service("layoutMngService")`. `search(LayoutMngSearchRequest)`, `view(LayoutMngViewRequest)`, `save(LayoutMngSaveRequest request, List<Map<String,Object>> headers, List<Map<String,Object>> consts, List<Map<String,Object>> items)` — **헤더 항목을 받는 파라미터가 없다**(불변 I8) |

### 생성 — 백엔드 api (BPMN·테스트)

- `BA/resources/services/dmb/headerMng.bpmn`, `BA/resources/services/dmb/layoutMng.bpmn` — `domainMng.bpmn` 과 같은 모양: process id = serviceId, `actionGateway`(`input=action`) → `search|view|save` 세 serviceTask, 각 `camunda:class="headerMngService"`(또는 `layoutMngService`), `method=<action>`, `output=result`, `dto=<DTO FQCN>`. **BPMN 파일은 `bpmn-skill` 의 `bpmn-tool create`·`validate` 로 만든다**(손 XML 금지, oasis-project-support "Non-Negotiable Rule". `bpmn-tool` 경로는 bpmn-skill SKILL.md 가 정한다 — 이 셸 PATH 에는 없다). 만든 뒤 `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root . --module mdm` 이 ERROR 0(기본 대상에 mdm 이 없어 `--module mdm` 필수, TSK-04-03 X14)
- `BLT/dmb/layout/{LayoutOffsetCalculatorTest, LayoutItemRulesTest, LayoutConstResolverTest, LayoutNumFormatCodecTest, LayoutStaticGuardTest}.java`(§3.1)
- `BAT/dmb/LayoutTestSupport.java`(픽스처 도우미, §3.2), `BAT/dmb/headerMng/HeaderMngServiceSqliteTest.java`, `BAT/dmb/layoutMng/LayoutMngServiceSqliteTest.java`, `BAT/dmb/LayoutOasisFlowTest.java`(§3.2·§3.3)
- `BAM/LayoutQueriesMssqlTest.java` — 네이티브 SQL 3개가 MSSQL 에서 도는지(`@ActiveProfiles("local-db")`, `MdmMssqlServer.newDatabase("layoutqueries")`, 선례 `DomainImpactQueriesMssqlTest`). **작성만 하고 이 워커는 돌리지 않는다**(§도커 금지로 생략한 검증)

### 생성 — 프런트

| 파일 | 내용 |
|---|---|
| `FM/src/layout/types.ts` | `FillKind`, `LayoutItemRow`(서버 키 UPPER_SNAKE 그대로 + 파생 표시 칸 `DISPLAY_NAME, DOMAIN_NAME, DATA_TYPE, DOMAIN_LENGTH, SCALE, UNIT_CODE`), `HeaderStackRow`, `ColumnInfo`, `NumFormat` |
| `FM/src/layout/layout-calc.ts` | `itemLength(row)`, `placeHeader(rows)` → `{rows(OFFSET 채움), total}`, `placeMessage(headerTotals, bodyRows)` → `{headerOffsets, headerLength, rows, total}`, `moveRow(rows, from, to)`(SEQ 1..n 재부여), `positionLabel(offset, length)` → `"131-150"`/`"63"` — Java `LayoutOffsetCalculator` 와 같은 규칙 |
| `FM/src/layout/fill-kind.ts` | `cell(fillKind, field)` → `"required"|"optional"|"closed"`(F10 행렬 그대로), `AUTO_KINDS`, `clearClosedFields(row)`(fill_kind 를 바꾸면 닫힌 칸을 비운다), `precheck(rows)` → 화면 선검사 메시지 목록(서버 L02·L03 과 같은 문구) |
| `FM/src/layout/num-format.ts` | `encodeNumFormat`, `decodeNumFormat` — D3 형식, Java 와 같은 벡터 |
| `FM/src/layout/const-resolve.ts` | `effectiveConst(kind, headerDefault, override)` — Java `LayoutConstResolver` 와 같은 규칙 |
| `FM/src/layout/ColumnPickModal.tsx` | 컬럼 사전 검색 팝업(두 화면 공용). props `open, onClose, onPick(ColumnInfo), search(keyword) => Promise<ColumnInfo[]>`. shared `Modal` + `Input` + `Button` + `AgDataGrid`(선례 `m-mcm/page-components/csa/commMenuMng/page.tsx:1236-` "OBJECT 검색"). **자유 입력으로 항목을 만드는 경로가 없다** — 선택한 행만 넘긴다(수용 기준 1 화면 쪽). 빈 결과는 `column-pick-empty` "컬럼 사전에 없습니다. 먼저 컬럼 사전에 등재하세요"(html 문구) |
| `FM/src/layout/LayoutItemDetail.tsx` | 항목 상세 패널(두 화면 공용): fill_kind, 컬럼(읽기), 파생 타입·길이/기준 단위/도메인(읽기), 전송 단위·단위 항목(select), 부호 자리·0 채움·암묵 소수점·표현 자리수, 기본값(AUTO 면 select 4종), FILLER 길이, 오프셋/길이(계산값). 칸 열림·닫힘은 `fill-kind.ts` 의 `cell()` 로만 정한다(닫힌 칸은 `disabled` + 값 비움) |
| `FM/pages/dmb/headerMng/page.tsx` | `MdmPageLayout group="dmb" screenId="headerMng" title="전문 헤더 정의"`, SCREEN_ID `"headerMng"`. 좌: 검색(검색어) + 헤더 목록 그리드. 우: 헤더 상세(헤더 ID 읽기·이름*·EAI(선택/신규 코드)·EAI 이름·인코딩(EUC-KR/UTF-8)·패딩 규칙·헤더 길이 계산값 "100 바이트 (13항목)") + 사용 전문 영향도 패널. 아래: 헤더 항목 그리드(순서·항목명·표준 물리명·fill_kind·기본값·오프셋·길이·위치, 행 드래그) + [+ 항목 추가](ColumnPickModal) + [+ FILLER] + [삭제] + 항목 상세. 버튼 [신규]·[저장](`canDoButton(rbac,"headerMng","save")`) |
| `FM/pages/dmb/headerMng/api.ts` | `OASIS_BASE = "/api/mdm/oasis/headerMng"`, `search`, `searchColumns`, `view`, `save(draft, items)` — `callAction`/`unwrap`/`cleanParams` 는 domainMng 와 같은 모양으로 이 파일 안에 둔다(공유 헬퍼 신설 금지, TSK-04-03 선례). grid `items` 는 빈 배열이라도 보낸다 |
| `FM/pages/dmb/headerMng/types.ts` | 응답 타입(§6.1 키 그대로) |
| `FM/pages/dmb/headerMng/components/{HeaderList.tsx, HeaderForm.tsx, HeaderUsagePanel.tsx, HeaderItemGrid.tsx}` | 목록(빈 상태 `header-list-empty` "조회된 헤더가 없습니다"), 상세 폼, 영향도(사용 전문 목록 — 이름·송신→수신·쌓인 순서·총 길이, 저장 전 "이 헤더를 쓰는 전문 N건의 오프셋·총 길이가 다시 계산됩니다" 확인 창), 항목 그리드 |
| `FM/pages/dmb/layoutMng/page.tsx` | `MdmPageLayout group="dmb" screenId="layoutMng" title="전문 레이아웃"`. 검색(검색어·헤더·송신 시스템·수신 시스템) → 전문 목록(레이아웃 ID·전문 이름·송신→수신·헤더 구성·본문 항목 수·총 길이·버전). 기본 속성(레이아웃 ID·버전 읽기, 전문 이름*, EAI, 송신*·수신* 시스템, 총 길이 계산값 `헤더 130 (100 + 30) + 본문 57 (20 + 8 + 4 + 25) = 187 바이트`). 헤더 구성 그리드(순서·헤더·EAI·길이·위치·재정의한 상수·[상수 편집], 행 드래그, [+ 헤더 추가](HeaderPickModal)·[빼기]) — **헤더 안 항목의 구성·길이를 바꾸는 입력이 화면에 없다**. 본문 항목 그리드(헤더 요약 줄 `헤더 N — 본문 첫 오프셋 N` + 순서·항목명·표준 물리명·fill_kind·도메인(파생)·설정·오프셋·길이·위치, 행 드래그) + 항목 상세 |
| `FM/pages/dmb/layoutMng/api.ts`, `types.ts` | `OASIS_BASE = "/api/mdm/oasis/layoutMng"`, `search`, `searchHeaders`, `searchColumns`, `view`, `save(draft, headers, consts, items)` — grid `headers`·`consts`·`items` 세 개를 늘 보낸다 |
| `FM/pages/dmb/layoutMng/components/{LayoutList.tsx, LayoutBasicForm.tsx, HeaderStackGrid.tsx, HeaderPickModal.tsx, ConstEditModal.tsx, BodyItemGrid.tsx}` | ConstEditModal: 행 = 그 헤더의 **CONST 항목만**(AUTO·FILLER 제외, F9), 열 = 항목 / 헤더 기본값(텍스트, 입력 아님) / 이 전문의 값(`Input`, placeholder = 헤더 기본값) / 재정의 배지(값이 있으면). [적용] 은 화면 상태만 바꾸고 저장은 [저장] 이 한다 |
| `FM/tests/layout/{layout-calc,fill-kind,num-format,const-resolve}.test.ts`, `FM/tests/dmb/headerMng/api.test.ts`, `FM/tests/dmb/layoutMng/{api,page-render}.test.ts` | §3.4 |
| `FE/mdm-headerMng.spec.ts`, `FE/mdm-layoutMng.spec.ts` | §3.5 |
| `FE/fixtures/mdm-layout-m201.sql` | §3.6 — E2E 전용 mdm.db 픽스처(운영 시드 아님) |
| `docs/mdm/tasks/TSK-05-02/screens/*.png` | E2E 스크린샷(커밋) |
| `docs/mdm/screens/headerMng/headerMng_기능설계서.md`, `docs/mdm/screens/layoutMng/layoutMng_기능설계서.md` | 기능설계서 1종(TSK-04-03 D8·TSK-04-04 선례). 화면 구성·액션·요청/응답 키·거부 코드·testid |

### 수정

| 파일 | 변경 | 규칙 |
|---|---|---|
| `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` | `seedMdmMenus()` 의 `seedMdmDomainMngMenu();` **다음 줄에** `seedMdmLayoutMenus();` 호출 1줄 추가 + 새 private 메서드 `seedMdmLayoutMenus()`: `insertMcmSecObjIfAbsent("headerMng","전문 헤더 정의","mdm")`, `insertMcmSecObjIfAbsent("layoutMng","전문 레이아웃","mdm")`, `insertMcmSecMenuIfAbsent("headerMng","001","5020110","전문 헤더 정의","dmb","headerMng")`, `insertMcmSecMenuIfAbsent("layoutMng","002","5020120","전문 레이아웃","dmb","layoutMng")`, 두 OBJECT 에 SYSADMIN×PERM_ALL(`insertIfAbsentComposite`, columnMng 블록과 같은 SQL 모양), `seedMdmObjectRbac(objectId, "dmb")`, `log.info("[DataInitializer] TSK-05-02 MDM 레이아웃 시드 — OBJECT 2 + 메뉴 leaf 2 + RBAC(SYSADMIN 2 + MDM 역할 4)")` | 기존 줄 한 글자도 안 고친다(log 문구 포함). 추가만 |
| `src/frontend/shared/src/components/grid/AgDataGrid.tsx` | D6: `GridColumn` 에 `rowDrag?: boolean`(→ `ColDef.rowDrag`), `AgDataGridProps` 에 `onRowOrderChange?: (orderedKeys: (string \| number)[]) => void`. 이 prop 이 있을 때만 `rowDragManaged`(true) 와 `onRowDragEnd`(→ `api.forEachNode` 순서로 `getRowId` 키 목록을 모아 콜백)를 `<AgGridReact>` 에 넘긴다. 없으면 기존 동작과 바이트 단위로 같은 prop 을 넘긴다. **드래그를 켠 그리드는 정렬(sortable)을 끈다**(ag-grid managed drag 는 정렬 중 비활성) | 선택형 prop 추가만. 기존 prop 의미·기본값 불변. 끝나면 `pnpm build:libs` 로 shared 를 먼저 빌드하고 mantine-aggrid-ui §4 `audit` 두 개(바꾼 파일만)가 0건 |
| `src/frontend/m-mdm/tsup.config.ts` | pages entry 2줄 추가: `"pages/dmb/headerMng/page": "pages/dmb/headerMng/page.tsx"`, `"pages/dmb/layoutMng/page": "pages/dmb/layoutMng/page.tsx"` | 추가만 |
| `src/frontend/m-mcm/lib/generated/page-registry.ts` | generator 재생성 결과(`"dmb/headerMng"`, `"dmb/layoutMng"` 2줄) | 손으로 고치지 않는다 |
| `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` | §A.3.2 표 `domainMng` 행 아래에 `headerMng`·`layoutMng` 행 2줄 추가(`\| headerMng \| — (To-Be only) \| mdm \| dmb \| headerMng \| 2026-09-24 \| 전문 헤더 정의 — As-Is 없음(신규). TSK-05-02. 기능설계서 1종 \|` 모양) | 추가만(screens/README:62 등재 절차) |
| `docs/mdm/decisions.md` | Build 완료 때 아래 D1~D8 을 임시 ID 블록 `## D-066 (<UTC>)` … `## D-073 (<UTC>)` 으로 끝에 추가(필드: Phase·Decision needed·Decision made·Rationale·Reversible·Source, D-057 과 같은 모양). `decision-log.py append` 금지, 기존 블록 수정 금지 | 추가만 |

### 변경하지 않음

- 마이그레이션 전부(F21), `entity/**`, `repository/**`(finder 가 필요하면 `LayoutQueries` 의 JPQL 로 — 05-01·05-03·dev(04-04) 와 같은 파일 충돌을 피한다), `contract/**`(`MdmErrorCode`·`MdmActions`·`MdmPermissions` 포함, D4·D8), `common/support/MdmErrors.java`, `common/dictionary/**`(호출만), `dma/**`, `maru-mdm-engine/**`, e2e 기존 픽스처(`mdm-rbac-*`), `m-mcm/app/**`, `be-run.sh`·`fe-run.sh`, `docs/mdm/screens/README.md`(headerMng·layoutMng 가 이미 §3 에 있다), `docs/mdm/erd/**`, 원천·시안 문서.

### 병렬 충돌 예상 파일 (추가만 한다 — 머지 때 기계적으로 푼다)

| 파일 | 상대 | 성격 |
|---|---|---|
| `DataInitializer.java` `seedMdmMenus()` | dev(TSK-04-04 columnMng 블록, 같은 자리 뒤), TSK-05-03(layoutMng leaf 를 또 만들 수 있음) | 같은 위치 추가 — 둘 다 남긴다. 05-03 이 layoutMng leaf 를 또 넣으면 `IfAbsent` 라 중복 행은 안 생기지만 코드 중복은 머지 때 하나로 줄인다 |
| `m-mdm/tsup.config.ts`, `page-registry.ts` | dev(04-04 external 재정렬 + columnMng), 05-03 | entry 는 둘 다 남긴다. 레지스트리는 generator 재실행 결과를 쓴다 |
| `identifier-dictionary/01-modules-and-screens.md` | dev(04-04 행 2줄 같은 위치) | 행 둘 다 남긴다 |
| `docs/mdm/decisions.md` | 모든 형제 | 임시 ID 라 번호 충돌 없음 |
| `BL/dmb/layoutMng/**`, `BA/.../services/dmb/layoutMng.bpmn`, `FM/pages/dmb/layoutMng/**`, `FE/mdm-layoutMng.spec.ts`, `docs/mdm/screens/layoutMng/**` | **TSK-05-03**(wbs tech-spec 이 같은 경로) | add/add 충돌 확정적. 해소 원칙: 05-02 의 search·view·save 와 `dmb.layout` 계산은 유지하고 05-03 의 검사·버전·스냅샷을 그 위에 더한다 |
| `BL/dmb/layout/**` | TSK-05-03(직렬화·검증이 같은 패키지를 쓸 수 있음) | 05-03 이 이 클래스를 재사용하도록 공개 시그니처를 §2 표대로 둔다 |
| `shared/.../AgDataGrid.tsx` | shared 를 고치는 모든 병렬 작업 | 선택형 prop 추가만 |
| `MdmErrorCode`·`MdmColumnRepository`·`MdmErrors`·`MdmStdAdminGuard` | dev(04-04) | **이 작업은 건드리지 않는다**(D4·D5, F20) — 충돌 없음 |

---

## 3. 테스트 전략

**게이트 명령(기준선에서 실제로 돌린 줄, 글자 그대로)**:

```bash
rm -rf src/backend/*/build/test-results src/backend/mdm/*/build/test-results
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain
# 기준선 tests=2066 failures=0 — find src/backend -path '*/build/test-results/*' -name 'TEST-*.xml' 의 testsuite tests/failures/errors 합산
cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint
# 기준선 295 passed, lint(tsc --noEmit) pass
```

게이트 판정 = 기준선 대비 신규 실패 0 + 테스트 총수 미감소. 두 명령 모두 `heavy.sh` 로 감싼다(dev-discipline 「무거운 명령 줄 세우기」). 새 백엔드 테스트는 `testAll` 에, 새 vitest 는 m-mdm `test` 에 자동으로 들어간다. 추가로 커밋 전 `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root . --module mdm` ERROR 0, mantine-aggrid-ui `audit` 2종(바꾼 FE 파일만) 0건.

### 3.1 lib 단위 테스트 (`BLT/dmb/layout/`, 순수 — Spring 없음)

| 클래스 | 테스트(메서드 이름) | 단언 |
|---|---|---|
| `LayoutOffsetCalculatorTest` | `L100_헤더_13항목은_100바이트이고_오프셋은_헤더_안에서_0부터_센다` | 길이 [8,4,3,4,3,14,14,12,1,5,1,6,25] → offsets [0,8,12,15,19,22,36,50,62,63,68,69,75], total 100 |
| | `L110_헤더_6항목은_30바이트이고_Length_항목_오프셋은_6이다` | [2,4,5,8,6,5] → [0,2,6,11,19,25], total 30 |
| | `M201_총_길이_187_본문_첫_오프셋_130_을_재현한다` | `placeMessage([100,30],[20,8,4,25])` → headerOffsets [0,100], headerLength 130, bodyOffsets [130,150,158,162], total 187 |
| | `헤더가_없으면_본문은_0부터_시작한다`, `본문이_없으면_총_길이는_헤더_합이다` | 경계 |
| | `항목_길이는_FILLER면_FILLER_길이_숫자_표현이면_표현_자리수_아니면_도메인_길이다` | `itemLength(FILLER,25,null,null)=25`, `itemLength(DATA,null,W4,3)=4`, `itemLength(DATA,null,null,20)=20`, `itemLength(DATA,null,null,null)` → 예외(L07 원인) |
| `LayoutItemRulesTest` | `@ParameterizedTest` `닫힌_칸에_값이_있으면_L02_로_거부한다(fillKind, field)` — F10 행렬의 **CLOSED 칸 전부**(DATA: DEFAULT_VALUE·FILLER_LENGTH / CONST: FILLER_LENGTH / AUTO: FILLER_LENGTH·TRANS_UNIT·UNIT_ITEM / FILLER: COLUMN·DEFAULT_VALUE·TRANS_UNIT·UNIT_ITEM·NUM_FORMAT) | 칸마다 한 케이스, issue code L02, field 이름 일치 |
| | `@ParameterizedTest` `필수_칸이_비면_L03_로_거부한다` — DATA·CONST·AUTO 의 COLUMN, AUTO 의 DEFAULT_VALUE, FILLER 의 FILLER_LENGTH | L03 |
| | `열린_칸만_채운_행은_통과한다` — fill_kind 4종 각각 올바른 행 | issues 비어 있음 |
| | `L01_컬럼_사전에_없는_컬럼은_거부한다` | 사전 맵에 없는 physName → L01, message 에 physName |
| | `L04_AUTO_종류가_네_가지가_아니면_거부한다`(`NOW`) · `L05_전송_단위와_단위_항목을_함께_넣으면_거부한다` · `L06_같은_레이아웃에_같은_컬럼을_두_번_쓰면_거부한다` · `L07_도메인_길이가_없으면_거부한다` · `L08_숫자가_아닌_도메인에_숫자_표현_형식을_넣으면_거부한다` · `L08_표현_형식_문자열이_깨졌으면_거부한다` · `L08_암묵_소수_자리가_0도_도메인_소수도_아니면_거부한다` · `FILLER_길이는_1_이상이어야_한다`(L03) | 각 코드 |
| `LayoutConstResolverTest` | `CONST_는_재정의가_있으면_재정의_값이다`, `CONST_는_재정의가_비면_헤더_기본값이다`(null·"" 둘 다), `AUTO_는_재정의를_무시하고_송신_시_채움으로_보인다`, `DATA_FILLER_는_값이_없다` | 3층 순서 |
| `LayoutNumFormatCodecTest` | `M201_코일_두께_형식을_문자열로_쓰고_읽는다` | `(false,true,1,4)` ↔ `"SIGN=N;ZERO=Y;SCALE=1;WIDTH=4"` |
| | `키_순서가_다르거나_키가_빠지거나_값이_틀리면_읽지_않는다` | `"ZERO=Y;SIGN=N;…"`, `"SIGN=N;ZERO=Y;SCALE=1"`, `"SIGN=X;…"`, `"…;WIDTH=0"` → 예외 |
| | `50자를_넘지_않는다` | 최대값 `(true,true,9,99)` 길이 ≤ 50 |
| `LayoutStaticGuardTest` | `dmb_패키지에_Transactional_과_직접_커넥션이_없다` | ArchUnit — `DomainMngStaticGuardTest` 의 규칙을 `com.dongkuk.dmes.mdm.dmb..` 에 적용(위반 샘플로 공허 통과 방지 1건 포함) |
| | `네이티브_SQL_은_예약어_칼럼을_쓰지_않는다` | `LayoutQueries.ALL_NATIVE_SQL` 각각에 **단어 경계 정규식** `\bOFFSET\b`·`\bLENGTH\b`·`\bVERSION\b`·`\bLIMIT\b`·`\bTOP\b`, 백틱, `:\w+\s+IS\s+NULL`(널 파라미터 비교) 이 없다. `TOTAL_LENGTH`·`FILLER_LENGTH` 는 단어 경계라 걸리지 않는다 — 오탐을 없애려고 검사를 느슨하게 하지 않는다. 위반 샘플(`"SELECT \`OFFSET\` FROM TB_MDM_LAYOUT_ITEM"`, `"… WHERE :kw IS NULL"`)은 걸림을 확인 |

### 3.2 api SQLite 통합 테스트 (`BAT/dmb/`, `@SpringBootTest(MOCK)` + `@ActiveProfiles("local")` + `@TempDir` DB)

`LayoutTestSupport`(도우미, 테스트 소스): `JdbcTemplate` 으로 도메인·컬럼을 넣는 `domain(stdName, dataType, length, scale)` → id, `column(physName, columnName, labelLong, domainId)`, 시스템은 V2 시드(L2·MES 등)를 쓴다. **M201 의 헤더 L100·L110 은 반드시 `HeaderMngService.save` 로 만든다**(SQL 로 넣으면 헤더 오프셋·총 길이 계산을 아무도 거치지 않는다). 헤더 항목 사전(물리명 → 도메인):

| 헤더 | 항목(순서대로: 물리명 fill_kind 기본값 도메인) |
|---|---|
| L100 `GLUE 공통 헤더` | `TC_CD` AUTO LAYOUT_ID STRING 8 · `SND_FAC_TP` CONST B0 STRING 4 · `SND_PROC_TP` CONST L2 STRING 3 · `RCV_FAC_TP` CONST B1 STRING 4 · `RCV_PROC_TP` CONST MES STRING 3 · `SNT_SND_HRP` AUTO SEND_TIME STRING 14 · `SND_PGM_ID` CONST L2IFSND STRING 14 · `EAI_IF_ID` CONST (없음) STRING 12 · `SNT_TP` CONST S STRING 1 · `SNT_ORD` AUTO SEQ NUMBER 5,0 · `IF_DATA_NTR` CONST I STRING 1 · `SNT_LTH` AUTO MSG_LENGTH NUMBER 6,0 · FILLER 25 |
| L110 `L2 구간 헤더` | `LINE_CODE` CONST B1 STRING 2 · `SEQUENCE_NO` AUTO SEQ NUMBER 4,0 · `LENGTH` AUTO MSG_LENGTH NUMBER 5,0 · `DATE` AUTO SEND_TIME STRING 8 · `TIME` AUTO SEND_TIME STRING 6 · FILLER 5 |
| M201 본문 | `COIL_ID` DATA 도메인 `COIL_ID`(ID, STRING 20) · `PROD_DT` DATA 도메인 `DT`(DATE 종류, STRING 8) · `COIL_THK` DATA 도메인 `COIL_THK`(QTY, NUMBER 3,1) + NUM_FORMAT `SIGN=N;ZERO=Y;SCALE=1;WIDTH=4` · FILLER 25 |

EAI `GLUE`(EUC-KR, "숫자 왼쪽 0, 문자 오른쪽 공백") 는 L100 헤더 저장 요청의 `eaiCode/eaiName/encoding/padRule` 로 만든다(→ `TB_MDM_EAI.HEADER_LAYOUT_ID = L100`).

**`HeaderMngServiceSqliteTest`**

| 테스트 | 단언 |
|---|---|
| `L100_을_저장하면_총_길이_100과_헤더_내부_오프셋을_저장한다` | `TB_MDM_LAYOUT.TOTAL_LENGTH=100`, `LAYOUT_KIND='HEADER'`, 항목 OFFSET = F7 목록, `SND_FAC_TP` OFFSET 8·LENGTH 4, SEQ 1..13 |
| `L110_Length_항목은_헤더_안_오프셋_6_길이_5다` | 불변 I2 |
| `EAI_를_함께_저장하면_그_EAI_의_표준_헤더가_된다` | `TB_MDM_EAI(GLUE).HEADER_LAYOUT_ID = L100`, ENCODING·PAD_RULE 저장. 다른 헤더에 EAI 를 옮기면 L100 을 가리키던 EAI 는 새 헤더를 가리킨다 |
| `L01_컬럼_사전에_없는_컬럼은_헤더_항목으로_저장하지_않는다` | `BusinessException`, message 가 `"헤더 저장 거부: L01"` 로 시작하고 `NOPE_X` 포함, 헤더 행 0건(롤백은 OASIS 트랜잭션 몫이므로 여기서는 쓰기 전에 거부됐는지 = 행 없음) |
| `L02_FILLER_에_기본값이_있으면_거부한다`, `L02_DATA_에_FILLER_길이가_있으면_거부한다` | 대표 2건(행렬 전체는 §3.1) |
| `헤더_길이가_바뀌면_그_헤더를_쌓은_전문의_오프셋과_총_길이를_다시_계산한다` | M201 저장 뒤 L110 에 항목(STRING 3) 추가 저장 → M201 `TOTAL_LENGTH=190`, 본문 OFFSET [133,153,161,165]. 응답 `recalculated` 에 M201 (187→190). `LAYOUT_VERSION` 은 그대로 0(불변 I17) |
| `헤더_항목_순서가_바뀌면_재정의를_물리명으로_다시_짝짓는다` | M201 이 `SND_FAC_TP=B1` 재정의 → L100 에서 SND_FAC_TP 를 1번째로 옮겨 저장 → `TB_MDM_LAYOUT_CONST` 행의 HEADER_SEQ 가 새 순서(1), 값 B1 유지 |
| `재정의된_항목이_빠지거나_CONST_가_아니게_되면_재정의를_지운다` | SND_FAC_TP 를 빼고 저장 → CONST 행 0건, 응답 `droppedOverrides=1` |
| `view_는_항목_파생값과_사용_전문을_돌려준다` | items 의 `DISPLAY_NAME`(label_long ?? 논리명), `DOMAIN_LENGTH`, `DATA_TYPE`, `usedBy` 에 M201 1건(`HEADER_SEQ=1`, `TOTAL_LENGTH=187`) |
| `search_COLUMN_은_물리명_논리명_표시명으로_찾는다` | `target=COLUMN, keyword=coil` → COIL_ID·COIL_THK, 파생 LENGTH 포함. 없는 키워드 → 빈 목록 |
| `요청_ver_가_DB_VER_와_다르면_MDM001_로_거부한다` | `ROW_VERSION_CONFLICT` 기본 문구 포함 |

**`LayoutMngServiceSqliteTest`**

| 테스트 | 단언 |
|---|---|
| `M201_총_길이_187_본문_첫_오프셋_130_을_재현한다` | 헤더 L100·L110 을 HeaderMngService 로 저장 → layoutMng.save(eai GLUE, snd L2, rcv MES, headers [L110 만 — L100 은 EAI 자동 삽입으로 들어와야 한다], items 4) → `TB_MDM_LAYOUT.TOTAL_LENGTH=187`, 본문 SEQ1 OFFSET 130, OFFSET [130,150,158,162], LENGTH [20,8,4,25], `TB_MDM_LAYOUT_HEADER` = [(1,L100),(2,L110)]. view 의 headers[].OFFSET = [0,100], `headerLength=130` |
| `EAI_를_고르면_그_EAI_표준_헤더를_1번으로_끼운다` | headers 그리드 비움 + eai GLUE → 스택 [(1,L100)]. 이미 있으면 중복으로 넣지 않는다 |
| `전문_저장은_헤더_행을_바꾸지_않는다` | 저장 전후로 L100·L110 의 `TB_MDM_LAYOUT`(TOTAL_LENGTH·VER)·`TB_MDM_LAYOUT_ITEM` 전 행(DEFAULT_VALUE·OFFSET·LENGTH)이 같다(불변 I8) |
| `상수_재정의는_이_전문에만_보이고_헤더_기본값은_그대로다` | 전문 A(SND_FAC_TP=B1 재정의)·전문 B(재정의 없음) 저장 → A view 의 SND_FAC_TP `EFFECTIVE_VALUE=B1`·`DEFAULT_VALUE=B0`·`OVERRIDE_VALUE=B1`, B view `EFFECTIVE_VALUE=B0`·`OVERRIDE_VALUE` 없음, L100 항목 DEFAULT_VALUE = B0(불변 I8·I10) |
| `L10_AUTO_DATA_FILLER_항목은_재정의할_수_없다` | TC_CD(AUTO)·L100 FILLER(seq 13) 재정의 → L10. (헤더에는 DATA 가 없으므로 DATA 케이스는 헤더에 DATA 항목 하나를 둔 별도 헤더로) |
| `L10_이_전문에_쌓이지_않은_헤더의_상수는_재정의할_수_없다` | L110 만 쌓고 L100 상수 재정의 → L10(DB FK 보다 먼저 앱이 거부) |
| `L09_HEADER_가_아닌_레이아웃은_헤더로_쌓을_수_없다`, `L09_같은_헤더를_두_번_쌓을_수_없다` | L09 |
| `L01_컬럼_사전에_없는_본문_항목은_거부한다` | message `"전문 저장 거부: L01"` 시작 — **DB FK 오류 문구가 아니라 이 문구**여야 한다(앱 검사 제거 변이를 잡는다) |
| `L02_FILLER_에_컬럼을_넣으면_거부한다`, `L11_송신_시스템이_없으면_거부한다` | 대표 |
| `상속_도메인의_길이로_항목_길이를_파생한다` | 자식 도메인(LENGTH null, 부모 NUMBER 3,1)을 쓰는 컬럼 → 항목 LENGTH 3(조립기 재사용, 불변 I4) |
| `저장은_전문_버전을_올리지_않는다` | 두 번 저장해도 `VERSION` 0(불변 I17, 버전은 05-03) |
| `view_는_헤더별_항목과_실효값을_돌려준다`, `search_는_헤더_요약과_총_길이를_돌려준다` | `HEADER_SUMMARY = "GLUE 공통 헤더 (100) + L2 구간 헤더 (30)"`, `TOTAL_LENGTH=187` |
| `요청_ver_가_DB_VER_와_다르면_MDM001_로_거부한다` | |

### 3.3 OASIS 흐름 테스트 (`BAT/dmb/LayoutOasisFlowTest`, `RANDOM_PORT`, `cactus.security.client-key` 테스트 값)

`DomainMngOasisFlowTest` 의 `post(action, params, grids)` 도우미 모양을 복제해 `/oasis/headerMng/{search,view,save}`·`/oasis/layoutMng/{search,view,save}` 를 부른다. BPMN 분기·DTO 바인딩·grid 이름 바인딩(`items`·`headers`·`consts`)·`data.result.*` 응답 모양을 증명한다.

- `헤더와_전문을_HTTP_로_저장하고_M201_총_길이_187_을_돌려받는다`
- `거부는_meta_message_에_L_코드와_함께_온다` — `meta.success=false`, `meta.message` 가 `"전문 저장 거부: L01"` 로 시작
- `전문_save_에_헤더_항목_grid_를_끼워_보내도_헤더는_바뀌지_않는다` — grids 에 `headers`·`consts`·`items` 와 함께 알 수 없는 `headerItems`(L100 SND_FAC_TP LENGTH 9) 를 보낸다 → 헤더 행 불변. OASIS 가 모르는 grid 를 무시하면 `success=true`, 거부하면 `success=false` — **어느 쪽이든 헤더 불변을 단언**하고 실측 결과를 design.md Build 기록에 적는다
- `search_target_COLUMN_은_컬럼_목록을_돌려준다`

### 3.4 프런트 vitest (`FM/tests/`, `.test.ts` 만 — F17)

| 파일 | 테스트 |
|---|---|
| `tests/layout/layout-calc.test.ts` | `M201 은 헤더 130 본문 첫 오프셋 130 총 187`(Java 와 같은 벡터), `L100 헤더 내부 오프셋`, `moveRow 로 FILLER 를 COIL_THK 앞으로 옮기면 FILLER 158·COIL_THK 183 으로 다시 계산된다`, `숫자 표현 자리수를 4→5 로 바꾸면 뒤 항목 오프셋과 총 길이가 1 늘어난다`, `positionLabel(130,20)="131-150", (62,1)="63"` |
| `tests/layout/fill-kind.test.ts` | F10 행렬 전 칸(Java 파라미터 테스트와 같은 표), `fill_kind 를 FILLER 로 바꾸면 컬럼·기본값·단위·형식이 비워진다`, `AUTO_KINDS 는 4종` |
| `tests/layout/num-format.test.ts` | Java `LayoutNumFormatCodecTest` 와 같은 벡터 |
| `tests/layout/const-resolve.test.ts` | Java `LayoutConstResolverTest` 와 같은 케이스 |
| `tests/dmb/headerMng/api.test.ts`, `tests/dmb/layoutMng/api.test.ts` | `unwrap`(meta.success=false → message throw, 성공이면 data.result 펼침), `save` 가 grid(`items` / `headers`·`consts`·`items`)를 빈 배열이라도 보냄, `cleanParams` 가 null·"" 키를 뺌, URL `/api/mdm/oasis/{headerMng|layoutMng}/{action}`. fetch 는 vi mock |
| `tests/dmb/layoutMng/page-render.test.ts` | `/** @vitest-environment happy-dom */`. fetch 스텁이 M201 view(헤더 2·본문 4)를 돌려줄 때 화면 텍스트에 `187 바이트`·`본문 첫 오프셋 130` 이 보인다(수용 기준 6 화면 쪽). 상수 편집 모달이 CONST 8행만 보이고 AUTO(TC_CD)·FILLER 는 없다 |

tsup entry 는 기존 `tests/tsup-entries.smoke.test.ts` 가 자동으로 검사한다.

### 3.5 브라우저 E2E — 스모크 넷 (dev-discipline 「화면 작업의 브라우저 E2E」)

공통: `mdm-columnMng.spec.ts`(dev)·`mdm-shell-rbac-smoke.spec.ts` 의 `login`·메뉴 이동 방식을 스펙 안에 둔다. 다만 2026-10-03 e2e 수리부터 픽스처 적재·[조회]·날짜 입력·가로 가상화 열 확인은 여러 MDM 스펙이 `e2e/support/mdm-e2e.ts` 의 공용 도우미를 함께 쓴다. `BASE_URL = SMOKE_MCM_BASE_URL`, 쓰기 사용자 `SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin"`(BFF dmb EDIT — 서버 가드가 없든(D5) 생기든 통과), 비밀번호 `SMOKE_LOGIN_PASSWORD ?? "admin123"`. `test.describe.configure({ mode: "serial" })`, `test.setTimeout(180_000)`, 뷰포트 1680×1200. `const STAMP = Date.now().toString(36).toUpperCase()` 로 이름 충돌을 피한다. 스크린샷 `path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-05-02/screens", name)`, fullPage. 메뉴: `.tree-item .item-name` 을 `/^마루 MDM$/` → `/^레이아웃$/` → `/^전문 헤더 정의$/`(또는 `/^전문 레이아웃$/`). 화면 범위는 `.page-layout__footer-screen-id` 가 screenId 인 `.page-layout`.

**픽스처 적재(두 스펙 공통 `test.beforeAll`)**: `process.env.SMOKE_MDM_DB` 가 없으면 즉시 실패시킨다("SMOKE_MDM_DB 에 워크트리 mdm.db 경로를 넣는다"). 있으면 공용 도우미 `loadMdmFixture`(`e2e/support/mdm-e2e.ts`)로 `fixtures/mdm-layout-m201.sql` 을 넣는다. 도우미는 sqlite3 `-bail` 로 한 트랜잭션에 넣고, 픽스처 파일 이름을 `C_PGM_ID` 로 가진 행이 probe 표에 이미 있으면 건너뛴다(같은 DB 에 다시 돌려도 중복 적재가 없다). 중간에 실패하면 `beforeAll` 이 실패하고 일부만 들어간 채 넘어가지 않는다. **스펙 안에서 적재하는 이유**: dev 의 `mdm-columnMng.spec.ts` E1 은 컬럼 사전이 비어 있어야 한다(F20). `--workers=1` 에서 파일은 이름순(`mdm-columnMng` < `mdm-domainMng` < `mdm-headerMng` < `mdm-layoutMng` < …)으로 돌므로 컬럼 사전 스펙이 끝난 뒤에 이 픽스처가 들어간다. 서버 기동 때 적재하면 그 스펙이 깨진다.

**`mdm-headerMng.spec.ts`**

| # | 절차 | 단언 | 스모크 넷·수용 기준 · 스크린샷 |
|---|---|---|---|
| H1 | 메뉴로 이동 | breadcrumb `마루 MDM > 레이아웃 > 전문 헤더 정의`, footer screen-id `headerMng`, 목록에 픽스처 헤더 `GLUE 공통 헤더(E2E)`(길이 100·항목 13)·`L2 구간 헤더(E2E)`(30·6) 가 서버 데이터로 보인다. 검색어 `없음-${STAMP}` 조회 → `header-list-empty` "조회된 헤더가 없습니다" | 넷1·넷2 · `dmb-headerMng-list.png`, `dmb-headerMng-empty.png` |
| H2 | [신규] → 이름 `E2E 헤더 ${STAMP}`, EAI 코드 `X${STAMP}`(신규)·이름·인코딩 UTF-8·패딩 규칙 → [+ 항목 추가] → 팝업 검색 `TC_CD` 선택(fill_kind AUTO, 기본값 LAYOUT_ID) → `SND_FAC_TP` 선택(CONST, B0) → [+ FILLER] 길이 10 | **저장 전** 항목 그리드 오프셋 0·8·12, `header-length` `22 바이트 (3항목)`(즉시 재계산). [저장] → 성공 토스트, 목록에 새 헤더 길이 22·항목 3 | 넷3 · `dmb-headerMng-register.png` |
| H3 | 팝업에서 `NOPE_${STAMP}` 검색 | `column-pick-empty` 문구, [선택] 비활성 — 사전에 없는 항목을 만들 경로가 없다. 이어서 `page.request.post(BASE_URL+"/api/mdm/oasis/headerMng/save", …COLUMN_PHYS "NOPE_X"…)` → `meta.success=false`, message 에 `L01` | AC1(화면·API) · `dmb-headerMng-column-pick.png` |
| H4 | 항목 상세에서 FILLER 행 선택 | 기본값·컬럼·단위·숫자 형식 칸 `disabled`, FILLER 길이만 열림. fill_kind 를 DATA 로 바꾸면 FILLER 길이 칸이 비워지고 닫힌다 | AC5(화면) |
| H5 | 목록에서 `GLUE 공통 헤더(E2E)` 선택 | `header-usage` 에 픽스처 전문 `출측검사 실적 수신(E2E)` 1건(총 길이 187) — 헤더 변경 영향도 | 요구 "헤더 변경 시 사용 전문 영향도" · `dmb-headerMng-impact.png` |
| H6 | H2 헤더 선택 → `page.request.post(…/headerMng/view)` 응답의 header·items 를 **그대로 다시 보내고 이름만 바꿔** `…/headerMng/save` 로 먼저 저장(save 는 항목을 통째로 교체하므로 grid 를 비워 보내면 항목이 지워진다) → 화면에서 이름 바꿔 [저장] | `.error-modal__body` 에 `다른 사용자가 수정` | 넷4 · `dmb-headerMng-error.png` |

**`mdm-layoutMng.spec.ts`**

| # | 절차 | 단언 | 스모크 넷·수용 기준 · 스크린샷 |
|---|---|---|---|
| L1 | 메뉴로 이동 | breadcrumb `마루 MDM > 레이아웃 > 전문 레이아웃`, 목록에 픽스처 전문 `출측검사 실적 수신(E2E)` 총 길이 187·헤더 구성 `GLUE 공통 헤더(E2E) (100) + L2 구간 헤더(E2E) (30)`. 검색어 `없음-${STAMP}` → `layout-list-empty` "조회된 전문이 없습니다" | 넷1·넷2 · `dmb-layoutMng-list.png`, `dmb-layoutMng-empty.png` |
| L2 | [신규] → 이름 `출측검사 ${STAMP}`, EAI `E2EGLUE` 선택 | 헤더 구성 1번에 `GLUE 공통 헤더(E2E)` 가 자동으로 들어온다(길이 100, 위치 1-100) | F25 자동 부착 |
| L3 | [+ 헤더 추가] → `L2 구간 헤더(E2E)` → 송신 L2·수신 MES → 본문 [+ 항목 추가] `COIL_ID`·`PROD_DT`·`EXIT_COIL_THK`(항목 상세: 0 채움 왼쪽 0, 암묵 소수점 사용, 표현 자리수 4) → [+ FILLER] 25 | **저장 전**: `layout-body-summary` 에 `130`, 본문 오프셋 셀 130·150·158·162, `layout-total-length` 에 `187` | **AC6(화면)**·즉시 재계산 · `dmb-layoutMng-m201.png` |
| L5 | 헤더 1번 [상수 편집] | 모달 행 8개(CONST 만), `const-default-SND_FAC_TP` 는 텍스트 `B0`(입력 아님), 헤더 항목의 길이·순서를 바꾸는 칸이 모달·화면 어디에도 없다(`header-item-length` 입력 0개). `const-input-SND_FAC_TP` 에 `B1` → [적용] → 헤더 구성 행 "재정의한 상수" 에 `송신공장구분 B1` | **AC3(화면)** · `dmb-layoutMng-const.png` |
| L6 | [저장] | 성공 토스트, 목록에 `출측검사 ${STAMP}` 총 길이 187. 다시 선택 → 상수 편집에 B1 이 남아 있다. 픽스처 전문을 선택해 상수 편집 → SND_FAC_TP 는 비어 있고 placeholder B0(다른 전문에 번지지 않음) | 넷3·AC3·AC6 |
| L7 | 저장한 전문을 `page.request.post(…/layoutMng/view)` 응답의 headers·consts(OVERRIDE_VALUE 가 있는 헤더 항목)·items 를 **그대로 다시 보내고 이름만 바꿔** `…/layoutMng/save` 로 먼저 저장 → 화면에서 이름 바꿔 [저장] | `.error-modal__body` 에 `다른 사용자가 수정` | 넷4 · `dmb-layoutMng-error.png` |
| L8 | (serial 모드라 불안정할 수 있는 드래그를 **맨 뒤**에 둔다 — 앞 단계가 skipped 되지 않게) 저장한 전문을 다시 선택 → 본문 FILLER 행의 드래그 손잡이를 `EXIT_COIL_THK` 행 위로 끌어 놓는다 | 오프셋 FILLER 158·EXIT_COIL_THK 183 으로 즉시 바뀐다(저장하지 않는다) | 요구 "드래그 순서"·I11 · `dmb-layoutMng-drag.png` |

화면이 붙일 `data-testid`(Build 는 이 이름을 그대로 쓴다): headerMng — `header-search-keyword`, `header-list`, `header-list-empty`, `header-form-name`, `header-form-eai`, `header-form-eai-name`, `header-form-encoding`, `header-form-pad-rule`, `header-length`, `header-items`, `header-item-add-column`, `header-item-add-filler`, `header-usage`. layoutMng — `layout-search-keyword`, `layout-list`, `layout-list-empty`, `layout-form-name`, `layout-form-eai`, `layout-form-snd`, `layout-form-rcv`, `layout-total-length`, `layout-header-stack`, `layout-header-add`, `header-pick-modal`, `const-edit-open-{seq}`, `const-edit-modal`, `const-default-{COLUMN_PHYS}`, `const-input-{COLUMN_PHYS}`, `const-edit-apply`, `layout-body-summary`, `layout-items`, `layout-item-add-column`, `layout-item-add-filler`. 공용 — `column-pick-modal`, `column-pick-keyword`, `column-pick-search`, `column-pick-grid`, `column-pick-empty`, `column-pick-select`, `item-detail`, `item-detail-fill-kind`, `item-detail-default`, `item-detail-filler-length`, `item-detail-sign`, `item-detail-zero`, `item-detail-implied`, `item-detail-width`, `item-detail-trans-unit`, `item-detail-unit-item`. 그리드 셀은 `.ag-cell[col-id="OFFSET"]` 처럼 col-id(= 행 키)로 찾는다. 드래그 손잡이는 ag-grid `.ag-row-drag` — `locator.dragTo` 가 불안정하면 `page.mouse.down/move(steps 10)/up` 으로 한다.

### 3.6 E2E 픽스처 `src/frontend/e2e/fixtures/mdm-layout-m201.sql`

머리 주석: "TSK-05-02 E2E 전용. 격리 mdm.db 에만. 운영 시드 아님. 스펙 beforeAll 이 적재한다. INSERT 만(DELETE 없음)". 내용:

- 도메인(`INSERT … SELECT … WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = …)`): **dev 의 `mdm-columnMng-dict.sql` 과 같은 STD_NAME 은 정의를 글자 그대로 맞춘다** — `COIL_THK`('코일 두께','QTY','NUMBER',3,1), `COIL_ID`('코일 식별자','ID','STRING',20,NULL). 나머지는 `E2E_` 접두 STD_NAME 으로 겹치지 않게: 헤더 항목용 STRING 1·2·3·4·6·8·12·14, NUMBER 4·5·6(scale 0), 일자 `E2E_DT`('일자','DATE','STRING',8).
- 컬럼(`INSERT OR IGNORE`, PHYS_NAME·COLUMN_NAME 유일): L100·L110 헤더 항목 물리명(§3.2 표), 본문 `COIL_ID`(코일 아이디), `PROD_DT`(생산일자), **`EXIT_COIL_THK`(출측 코일 두께, 도메인 COIL_THK)** — `COIL_THK`·`코일 두께` 컬럼은 **만들지 않는다**(dev columnMng E5 가 그 이름의 저장이 MDM018 로 거부되기를 기대, F20). `RMTL_COIL_THK_DEV`·`원재료 코일 두께 편차` 도 만들지 않는다.
- EAI `E2EGLUE`(EUC-KR, 패딩 문구) 와 HEADER 레이아웃 `GLUE 공통 헤더(E2E)`(TOTAL_LENGTH 100)·`L2 구간 헤더(E2E)`(30), 그 항목(OFFSET·LENGTH 는 F7 값을 **미리 계산해 넣는다**), `TB_MDM_EAI.HEADER_LAYOUT_ID` = 앞 헤더, MESSAGE 레이아웃 `출측검사 실적 수신(E2E)`(E2EGLUE, L2→MES, TOTAL_LENGTH 187)과 그 스택·본문 4항목(OFFSET 130·150·158·162, NUM_FORMAT `SIGN=N;ZERO=Y;SCALE=1;WIDTH=4`). 레이아웃 id 는 이름으로 찾는 서브쿼리로 잇는다.
- **한계(적어 둔다)**: 픽스처의 헤더·전문 행은 미리 계산한 값이라 E2E 가 증명하는 것은 **화면에서 새로 만든 전문의 본문 오프셋과 총 길이(L3·L6)** 와 화면 재계산이다. 헤더 오프셋·총 길이 계산은 §3.2 `HeaderMngServiceSqliteTest`·`LayoutMngServiceSqliteTest`(헤더를 save 경로로 만든다)가 증명하고, H2 가 화면에서 새 헤더의 오프셋을 한 번 확인한다.

### 3.7 E2E 실행 절차 (명령 줄 확정 — 오케스트레이터 기준선·Verify 공통)

서버 규칙은 dev-discipline 「서버 프로세스」·「무거운 명령 줄 세우기」. **`be-run.sh`·`fe-run.sh` 금지, 전역 `gradlew --stop` 금지, 이름 기반 `pkill`·`killall`·`pgrep -f` 종료 금지, 남의 포트(5100·8100·8096·18300·15300 등) 점유 프로세스 종료 금지. gradle 은 항상 `--no-daemon`.** 포트는 아래 후보(설계 시점 비어 있음 확인)를 쓰되 기동 직전 다시 확인하고, 차 있으면 다른 빈 번호로 바꾼다.

```bash
W=/Users/jji/project/dmes-standard/dflow-8c8a2080
SP=<자기 scratchpad 폴더>
J=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
BE_MCM=18521; BE_MDM=18596; FE=15521
# 0) 빈 포트 확인 — 세 줄 모두 출력이 없어야 한다(있으면 다른 번호)
lsof -iTCP:$BE_MCM -sTCP:LISTEN; lsof -iTCP:$BE_MDM -sTCP:LISTEN; lsof -iTCP:$FE -sTCP:LISTEN
# 1) PC 전역 슬롯 — HEAVY_ACQUIRED 확인, HEAVY_BUSY 면 같은 명령을 다시 부른다
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh acquire e2e-TSK-05-02
# 2) 격리 DB — 워크트리 로컬. 옛 파일은 지우지 않고 scratchpad 로 옮긴다(없으면 메인 체크아웃 DB 를 잡는다, F26)
#    -wal·-shm 와 caravan DB(caravan-if·caravan-console, mcm 이 만든다)도 함께 옮긴다 — 남으면 새 DB 가 아니다.
mkdir -p $W/src/backend/data
ts=$(date +%s)
for f in mcm mdm caravan-if caravan-console; do
  for x in db db-wal db-shm; do [ -f $W/src/backend/data/$f.$x ] && mv $W/src/backend/data/$f.$x $SP/$f.$x.$ts; done
done
# 3) mcm 백엔드(로그인·메뉴·RBAC 시드)
cd $W/src/backend/mcm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args="--spring.profiles.active=local --server.port=$BE_MCM --mcm.bff.invalidate-role-url=http://127.0.0.1:$FE/api/mcm/internal/cache/invalidate-role --cactus.notify.publish-url=http://127.0.0.1:$BE_MCM/notify/publish" > $SP/be-mcm.log 2>&1 &
echo $! > $SP/be-mcm.pid
# 4) mdm 백엔드 — SQLite ../data/mdm.db = $W/src/backend/data/mdm.db
cd $W/src/backend/mdm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args="--spring.profiles.active=local --server.port=$BE_MDM" > $SP/be-mdm.log 2>&1 &
echo $! > $SP/be-mdm.pid
# 5) 두 로그에 "Started … in" 이 찍힐 때까지 기다린다(Monitor 또는 짧은 간격 재확인 — 포그라운드 sleep 금지).
#    두 로그의 SQLite 경로가 $W/src/backend/data 인지 확인(아니면 즉시 중단·정리).
#    mcm 시드 대조(기대 파일과 diff 없음) 뒤 시험 사용자
cd $W/src/frontend && sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-seed-check.sql | diff - e2e/fixtures/mdm-rbac-seed-check.expected.txt
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-users.sql
sqlite3 $W/src/backend/data/mcm.db "SELECT ROLE_ID, OBJECT_ID, PERMISSION_ID FROM TB_MCM_SEC_ROLE_MAPPING WHERE OBJECT_ID IN ('headerMng','layoutMng') ORDER BY OBJECT_ID, ROLE_ID;"
#    기대(Build 이후): MDM_STD_ADMIN|…|PERM_MDM_EDIT / MDM_STEWARD|…|PERM_MDM_READ / SYSADMIN|…|PERM_ALL × 2 (기점에서는 0행 — 정상)
#    mdm 픽스처는 미리 넣지 않는다 — 각 스펙의 beforeAll 이 SMOKE_MDM_DB 에 자기 픽스처를 넣는다(e2e/support/mdm-e2e.ts
#    loadMdmFixture, 이미 들어 있으면 건너뜀). 서버 기동 때 모두 넣으면 이름순으로 먼저 도는 스펙의 전제가 깨진다
#    (예: mdm-ruleEdit-data 의 COIL_THK 컬럼 → mdm-columnMng E5). 시험 사용자(mcm)만 위에서 넣고, 둘째 담당자도 넣는다.
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-ruleEdit-users.sql
# 6) 포털 — shared·m-mdm 을 먼저 빌드(shared 를 바꿨으므로 필수), 레지스트리는 커밋된 것을 쓴다
cd $W/src/frontend && pnpm build:libs
cd $W/src/frontend/m-mcm && AUTH_SECRET=$(openssl rand -hex 32) NEXTAUTH_URL=http://127.0.0.1:$FE OIDC_ISSUER=http://127.0.0.1:$FE \
  MCM_WAS_URL=http://127.0.0.1:$BE_MCM MDM_WAS_URL=http://127.0.0.1:$BE_MDM BACKEND_API_URL=http://127.0.0.1:$BE_MCM \
  BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026 BFF_INTERNAL_SECRET=dmes-bff-internal-local-2026 pnpm exec next dev --turbopack --port $FE > $SP/fe.log 2>&1 &
echo $! > $SP/fe.pid
# 7) E2E — 기존 mdm 스펙까지 전부(셸 glob 이 있는 파일만 펼친다), 반드시 자기 포털, workers 1
cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:$FE SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  SMOKE_MDM_DB=$W/src/backend/data/mdm.db pnpm exec playwright test e2e/mdm-*.spec.ts --workers=1
# 8) 정리 — 성공·실패·중단과 무관하게. 기록한 PID 먼저, 남은 자식은 자기가 고른 포트의 리스너만
kill $(cat $SP/fe.pid) $(cat $SP/be-mdm.pid) $(cat $SP/be-mcm.pid)
for p in $FE $BE_MDM $BE_MCM; do pid=$(lsof -tiTCP:$p -sTCP:LISTEN); [ -n "$pid" ] && kill $pid; done
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh release
# 9) 전체 mdm 스펙이 덮어쓴 추적 스크린샷 되돌리기(이 작업 산출물 아님). 이 Task 의 스크린샷만 커밋한다
cd $W && /usr/bin/git status --short   # 먼저 무엇이 바뀌었는지 본다
#    추적 파일 중 이 Task 산출물이 아닌 docs/mdm/tasks/**/screens 변경은 git status 에 나온 경로를 골라 되돌린다:
#      /usr/bin/git restore -- <변경된 docs/mdm/tasks/**/screens 경로…> src/frontend/m-mcm/next-env.d.ts
#    새로 생긴 PNG(??) 는 지우지 않는다 — /usr/bin/git status --short | grep '^??' 로 목록을 내고, 이 Task 산출물인지 사람이 판단해 커밋하거나 scratchpad 로 옮긴다.
#    src/frontend/test-results/** 등 추적 파일 변경도 같은 방식으로 되돌린다.
```

- **오케스트레이터가 E2E 기준선을 잴 줄은 7)** 이다(1~6 으로 서버를 띄운 뒤). 기점에서는 glob 이 `mdm-domainMng`·`mdm-sample-smoke`·`mdm-shell-rbac-smoke` 셋으로 펼쳐지고(F27, TSK-04-03 실측 "8 passed"), `SMOKE_MDM_DB` 는 쓰이지 않는다. Build 뒤에는 `mdm-headerMng`·`mdm-layoutMng` 가 더해지고, dev 머지 뒤에는 `mdm-columnMng` 도 더해진다 — 그 스펙은 **새 mdm.db**(2) 가 전제다. mdm 픽스처는 각 스펙의 `beforeAll` 이 넣는다. 같은 DB 로 7) 을 다시 돌리려면 2) 로 새 mdm.db 를 만들고 서버를 다시 띄운다(스펙들이 행을 만든다).
- mdm 백엔드 코드를 바꾸면 mdm 만 다시 띄우되 mdm.db 를 다시 옮긴다(2). mdm 픽스처는 스펙 `beforeAll` 이 넣는다. DataInitializer 를 바꾸면 mcm 을 새 DB 로 다시 띄우고 5) 를 다시 한다(BFF 권한 캐시 60초·`UserPermCache` 10분 영향 제거).
- 통과 기준: 7) 이 failed·skipped 0. 거짓 통과 방지 증거 셋을 보고에 붙인다 — ① 두 백엔드 로그의 SQLite 경로가 워크트리 쪽, ② `be-mdm.log` 에 `/oasis/headerMng`·`/oasis/layoutMng` 요청이 찍힘, ③ V21 뒤 `TB_MDM_LAYOUT` 에는 `TOTAL_LENGTH` 칸이 없고 길이는 `TB_MDM_LAYOUT_VER.OWN_LENGTH` 에 있다. 다음 질의에 L6 에서 만든 `출측검사 <STAMP>…|1|57|1,2|187` 행이 나와야 한다(본문 57 + 헤더 구성 1·2 의 OWN_LENGTH 합 = 187):
  ```sql
  SELECT l.LAYOUT_NAME, v.VER, v.OWN_LENGTH,
         (SELECT GROUP_CONCAT(h.HEADER_LAYOUT_ID) FROM TB_MDM_LAYOUT_HEADER h WHERE h.LAYOUT_ID = v.LAYOUT_ID AND h.VER = v.VER) AS HEADERS,
         v.OWN_LENGTH + COALESCE((SELECT SUM(hv.OWN_LENGTH) FROM TB_MDM_LAYOUT_HEADER h
              JOIN TB_MDM_LAYOUT_VER hv ON hv.LAYOUT_ID = h.HEADER_LAYOUT_ID AND hv.STATUS = 'RELEASED'
                   AND hv.APPLY_FROM <= datetime('now', '+9 hours') AND datetime('now', '+9 hours') < hv.APPLY_TO
              WHERE h.LAYOUT_ID = v.LAYOUT_ID AND h.VER = v.VER), 0) AS TOTAL
  FROM TB_MDM_LAYOUT l JOIN TB_MDM_LAYOUT_VER v ON v.LAYOUT_ID = l.LAYOUT_ID
  WHERE l.LAYOUT_KIND = 'MESSAGE';
  ```

---

## 4. 수용 기준 매핑

| spec 수용 기준 | 검증 방법 |
|---|---|
| 컬럼 사전에 없는 항목 추가 불가 | 서버: `LayoutItemRulesTest.L01_컬럼_사전에_없는_컬럼은_거부한다`, `HeaderMngServiceSqliteTest.L01_컬럼_사전에_없는_컬럼은_헤더_항목으로_저장하지_않는다`, `LayoutMngServiceSqliteTest.L01_컬럼_사전에_없는_본문_항목은_거부한다`(앱 문구 단언 — DB FK 가 가리지 못하게), `LayoutOasisFlowTest.거부는_meta_message_에_L_코드와_함께_온다`. 화면: `ColumnPickModal` 이 선택 행만 넘김, E2E H3(빈 검색·[선택] 비활성·API 거부) |
| 포털 메뉴에서 화면이 열리고 e2e `mdm-headerMng.spec.ts` 통과 | §3.5 H1~H6 전부 통과(§3.7 7) 줄). 메뉴 시드는 H1 + §3.7 5) 의 역할 매핑 조회 |
| 헤더 구성·길이는 전문에서 편집 불가, 상수만 재정의 | 구조: `LayoutMngService.save` 에 헤더 항목 입력 없음(§2). 서버: `LayoutMngServiceSqliteTest.전문_저장은_헤더_행을_바꾸지_않는다`, `…상수_재정의는_이_전문에만_보이고_헤더_기본값은_그대로다`, `…L10_*` 2종, `LayoutOasisFlowTest.전문_save_에_헤더_항목_grid_를_끼워_보내도_헤더는_바뀌지_않는다`. 화면: vitest `page-render`(상수 모달 CONST 만), E2E L5·L6 |
| 포털 메뉴에서 화면이 열리고 e2e `mdm-layoutMng.spec.ts` 통과 | §3.5 L1~L8 전부 통과 |
| fill_kind 별 닫힌 칸에 값이 있으면 거부 | `LayoutItemRulesTest.닫힌_칸에_값이_있으면_L02_로_거부한다`(행렬 CLOSED 칸 전부 파라미터), `…필수_칸이_비면_L03_로_거부한다`, 통합 대표(`HeaderMngServiceSqliteTest.L02_*`, `LayoutMngServiceSqliteTest.L02_*`), vitest `fill-kind.test.ts`(화면 칸 닫힘·값 비움), E2E H4 |
| M201 예시 총 길이 187바이트·본문 첫 오프셋 130 재현 | 백엔드: `LayoutOffsetCalculatorTest.M201_총_길이_187_본문_첫_오프셋_130_을_재현한다`(순수), `LayoutMngServiceSqliteTest.M201_총_길이_187_본문_첫_오프셋_130_을_재현한다`(헤더를 save 경로로 만든 통합), `LayoutOasisFlowTest.헤더와_전문을_HTTP_로_저장하고_M201_총_길이_187_을_돌려받는다`. 화면: vitest `layout-calc.test.ts` M201·`page-render.test.ts`, E2E L3(저장 전 즉시 표시)·L6(저장 후 목록 187) |
| (스모크 넷 1 메뉴 이동) | H1, L1 |
| (스모크 넷 2 목록 서버 데이터·빈 상태) | H1(픽스처 헤더 목록 + `header-list-empty`), L1(픽스처 전문 + `layout-list-empty`) |
| (스모크 넷 3 등록 한 번이 화면 조작만으로 → 목록 반영) | H2, L3·L6 |
| (스모크 넷 4 서버 오류가 화면에 보임) | H6, L7(MDM001 동시 수정 — `page.request.post` 로 먼저 저장, TSK-04-03 E5 선례) |
| (요구) 헤더 변경 시 사용 전문 영향도 | `HeaderMngServiceSqliteTest.view_는_…사용_전문을_돌려준다`, `…헤더_길이가_바뀌면_…다시_계산한다`, E2E H5 |
| (요구) 드래그 순서·즉시 재계산 | vitest `layout-calc.test.ts` moveRow·자리수 변경, E2E L3(저장 전 값)·L8(드래그) |

도커 금지로 확인하지 못하는 수용 기준은 없다(§도커 금지로 생략한 검증).

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것 (규칙 · 변이 · 빨개지는 테스트)

| # | 규칙 | 변이(일부러 넣는 틀린 구현) | 빨개지는 테스트 |
|---|---|---|---|
| I1 | **M201 = 헤더 130(100+30) + 본문 57 = 총 187, 본문 첫 오프셋 130**, 본문 오프셋 130·150·158·162 | ① 본문 오프셋을 0부터 셈 ② 헤더 합 대신 첫 헤더 길이만 더함 ③ 오프셋을 1부터 셈(위치와 혼동) | `LayoutOffsetCalculatorTest.M201_…`, `LayoutMngServiceSqliteTest.M201_…`, `LayoutOasisFlowTest.헤더와_전문을_…187…`, vitest `layout-calc` M201(TS 쪽 변이), E2E L3 |
| I2 | **헤더 항목 OFFSET 은 그 헤더 안 상대값(0부터), 본문 항목 OFFSET 은 메시지 절대값, 헤더의 메시지 시작 위치 = 앞 헤더 길이 합**(F8) | 헤더 항목에 메시지 절대 오프셋을 저장(L110 LENGTH 를 106 으로) | `HeaderMngServiceSqliteTest.L110_Length_항목은_헤더_안_오프셋_6_…`, `LayoutOffsetCalculatorTest.L110_…`, `LayoutMngServiceSqliteTest.view_…`(헤더 OFFSET [0,100]) |
| I3 | **헤더 TOTAL_LENGTH = 항목 길이 합, 전문 TOTAL_LENGTH = 쌓인 헤더 TOTAL_LENGTH 합 + 본문 길이 합**(03 "자동 계산") | 전문 총 길이에서 헤더를 빼먹음 / 헤더 FILLER 를 합에서 뺌 | `HeaderMngServiceSqliteTest.L100_…100…`, `LayoutMngServiceSqliteTest.M201_…` |
| I4 | **항목 길이 규칙**: FILLER → `FILLER_LENGTH`(1 이상), NUM_FORMAT 이 있으면 그 `WIDTH`(숫자 표현 자리수 — 도메인 길이 칸의 "직접 입력"이 아니라 표현 형식이다, F6·D3), 아니면 컬럼 → 도메인 조립기(`DomainChainAssembler`)의 유효 length. 유효 length 가 없으면 L07. **FILLER 가 아닌 항목의 `FILLER_LENGTH` 는 닫힌 칸**(I6) | ① WIDTH 를 무시하고 도메인 길이 사용(M201 186) ② 조립기 대신 자기 행 LENGTH 만 사용(상속 무시) ③ 화면이 보낸 `LENGTH` 를 그대로 저장 | ① `…M201_…`(186≠187) ② `LayoutMngServiceSqliteTest.상속_도메인의_길이로_항목_길이를_파생한다` ③ `LayoutOasisFlowTest`(요청 LENGTH 를 999 로 보내도 저장값은 계산값 — 이 단언을 흐름 테스트에 넣는다) |
| I5 | **컬럼 사전에 있는 컬럼만 항목이 된다**(DATA·CONST·AUTO, L01). 앱이 먼저 거부하고 DB FK 에 기대지 않는다. 화면은 사전 검색 결과 선택으로만 항목을 만든다 | 서비스의 L01 검사 제거(DB FK 가 다른 문구로 막음) / 팝업에 자유 입력 추가 | `…L01_*` 3종(문구 `"… 저장 거부: L01"` 단언), E2E H3 |
| I6 | **fill_kind 칸 행렬(F10)**: CLOSED 칸에 값이 있으면 L02, REQUIRED 칸이 비면 L03, AUTO 기본값은 SEND_TIME·MSG_LENGTH·SEQ·LAYOUT_ID 넷 중 하나(L04), 전송 단위·단위 항목 동시 입력 L05, NUM_FORMAT 은 NUMBER 도메인만(L08) | 행렬의 칸 하나를 OPTIONAL 로 바꿈 / AUTO 목록에 값 추가 | `LayoutItemRulesTest` 파라미터 케이스 중 그 칸 하나, `L04_…`, vitest `fill-kind` 같은 칸 |
| I7 | **같은 레이아웃 안 컬럼 중복 금지**(L06 — 재정의 재짝짓기·unit_item 이 물리명으로 항목을 가리키므로 유일해야 한다) | 검사 제거 | `LayoutItemRulesTest.L06_…`, `HeaderMngServiceSqliteTest.헤더_항목_순서가_바뀌면_…`(중복이면 짝짓기가 모호) |
| I8 | **전문에서 헤더 구성·길이는 잠긴다**: layoutMng 는 헤더 레이아웃·헤더 항목 행(TOTAL_LENGTH·DEFAULT_VALUE·OFFSET·LENGTH·SEQ)을 쓰지 않는다. 재정의는 `TB_MDM_LAYOUT_CONST` 에만 쓴다 | ① 재정의를 헤더 항목 `DEFAULT_VALUE` 에 씀 ② 전문 저장 때 헤더 총 길이를 다시 계산해 헤더 행에 씀 ③ save 에 헤더 항목 grid 를 받아 반영 | ① `…상수_재정의는_이_전문에만_보이고_헤더_기본값은_그대로다`(B 가 B1 을 봄) ② `…전문_저장은_헤더_행을_바꾸지_않는다`(VER 증가 감지) ③ `LayoutOasisFlowTest.전문_save_에_헤더_항목_grid_를_…` |
| I9 | **재정의 대상은 이 전문에 쌓인 헤더의 CONST 항목뿐**(L10). AUTO·FILLER·DATA 는 재정의할 수 없다 | 대상 fill_kind 검사 제거 | `LayoutMngServiceSqliteTest.L10_AUTO_DATA_FILLER_…`, `…L10_이_전문에_쌓이지_않은_…` |
| I10 | **3층 기본값 해석 순서**: 실효값 = (CONST) 이 전문의 재정의가 비어 있지 않으면 재정의, 아니면 헤더 항목 기본값 → (AUTO) 송신 시점 채움 표시, 재정의 불가 → (DATA·FILLER) 값 없음. 빈 문자열 재정의는 "재정의 없음" | 순서 뒤집기(헤더 기본값 우선) / 빈 문자열을 재정의로 저장 | `LayoutConstResolverTest` 4종, vitest `const-resolve`, `LayoutMngServiceSqliteTest.view_는_헤더별_항목과_실효값을_…` |
| I11 | **편집 즉시 재계산**: 화면에서 항목 추가·삭제·드래그·fill_kind·표현 자리수·FILLER 길이를 바꾸면 서버 호출 없이 오프셋·위치·총 길이·헤더 길이가 바로 바뀐다(`layout-calc.ts`) | 재계산을 저장 응답 때만 함 | E2E H2·L3(저장 전 값 단언)·L8, vitest `layout-calc` moveRow·자리수 |
| I12 | **헤더 저장 = 그 헤더를 쌓은 전문 전체의 오프셋·총 길이 재계산을 같은 트랜잭션에서**(D7). 본문 항목 길이는 저장된 LENGTH 를 그대로 쓰고 오프셋만 다시 민다 | 재계산 생략 | `HeaderMngServiceSqliteTest.헤더_길이가_바뀌면_…다시_계산한다` |
| I13 | **헤더 항목이 재배열되면 재정의는 COLUMN_PHYS 로 다시 짝짓고, 빠지거나 CONST 가 아니게 된 항목의 재정의는 지운다**(D7) | SEQ 를 그대로 둠 / 지우지 않고 FK 오류 | `…헤더_항목_순서가_바뀌면_…`, `…재정의된_항목이_빠지거나_…` |
| I14 | **EAI 를 고른 전문에는 그 EAI 의 표준 헤더(`TB_MDM_EAI.HEADER_LAYOUT_ID`)가 헤더 구성 1번에 들어간다**(F25). 이미 있으면 다시 넣지 않는다 | 자동 삽입 제거 / 중복 삽입 | `LayoutMngServiceSqliteTest.EAI_를_고르면_…`, `…M201_…`(headers 그리드에 L110 만 보냄), E2E L2 |
| I15 | **NUM_FORMAT 문자열 형식 = `SIGN=Y|N;ZERO=Y|N;SCALE=<0 또는 도메인 소수>;WIDTH=<1 이상>`, 키 순서 고정, 50자 이하**(D3). Java·TS 가 같은 벡터를 통과한다 | 키 순서·구분자 변경 / 한쪽만 변경 | `LayoutNumFormatCodecTest`, vitest `num-format`(같은 벡터 — 한쪽만 바꾸면 한쪽이 빨개진다) |
| I16 | **요청 `ver` ≠ DB `VER` 이면 MDM001**(헤더·전문 모두) | 검사 제거 | `…요청_ver_가_…MDM001…` 2종, E2E H6·L7 |
| I17 | **이 작업의 저장은 `TB_MDM_LAYOUT.VERSION`(layoutVersion)을 올리지 않는다**(버전은 TSK-05-03, D7) | 저장마다 +1 | `LayoutMngServiceSqliteTest.저장은_전문_버전을_올리지_않는다`, `HeaderMngServiceSqliteTest.헤더_길이가_바뀌면_…`(VERSION 0) |
| I18 | **예약어 칼럼(`OFFSET`·`LENGTH`·`VERSION`)은 엔티티(JPQL·리포지토리)로만 읽고 쓴다. 네이티브 SQL 은 예약어·백틱·`LIMIT`·`TOP`·널 파라미터 비교(`:p IS NULL`)를 쓰지 않는다**(F4) | 네이티브 SQL 로 `\`OFFSET\`` 읽기 추가 / 검색 SQL 을 `:kw IS NULL OR …` 로 바꿈 | `LayoutStaticGuardTest.네이티브_SQL_은_예약어_칼럼을_쓰지_않는다`. MSSQL 실행 확인은 `LayoutQueriesMssqlTest`(도커 금지로 생략 — 머지 뒤 방언 검증) |
| I19 | **`dmb` 서비스·구현에 `@Transactional`·`TransactionTemplate`·`DataSource.getConnection` 이 없다**(F11) | 서비스에 `@Transactional` | `LayoutStaticGuardTest.dmb_패키지에_Transactional_과_…`, `LayoutOasisFlowTest`(ParameterName 오류) |
| I20 | **상수 편집 표에는 CONST 항목만 나오고 헤더 기본값 칸은 입력이 아니다**(F9) | AUTO 도 표에 넣음 / 기본값 칸을 입력으로 | vitest `page-render`(8행·TC_CD 없음), E2E L5 |
| I21 | **액션은 search·view·save 셋만**(F12). 컬럼 사전 검색은 `search` 의 `target=COLUMN`(D8) | 새 액션 이름(`lookup`) 추가 | `LayoutOasisFlowTest.search_target_COLUMN_…`(권한 목록 밖 액션은 BFF 403 이라 E2E H2·L3 에서 팝업 검색이 실패) |
| I22 | **shared `AgDataGrid` 는 `onRowOrderChange` 를 주지 않으면 기존과 같은 prop 을 넘긴다**(D6) | 드래그 prop 을 늘 켬 | 기존 화면 E2E(`mdm-domainMng`·`mdm-sample-smoke`·`mdm-shell-rbac-smoke`)와 m-mdm vitest 전체. **알려진 커버리지 갭**: shared 의 "기본 동작 불변"을 직접 단언하는 테스트는 게이트 명령에 없다 — Build 가 `pnpm --filter @dk-oasis/shared test` 를 한 번 돌려 결과를 보고한다(게이트 판정에는 넣지 않는다) |
| I23 | **쓰기는 리포지토리 `save`·`saveAll`·`deleteAll`·`flush` 로 명시적으로 한다. 변경 감지에 기대지 않고, `LayoutQueries` 는 읽기만 한다**(서비스 직접 호출 테스트에는 OASIS 트랜잭션이 없다) | `recalculateUsers` 에서 setter 만 부르고 `saveAll` 을 뺌 / EAI upsert 에서 `save` 를 뺌 | `HeaderMngServiceSqliteTest.헤더_길이가_바뀌면_…다시_계산한다`(M201 190 이 저장되지 않음), `…EAI_를_함께_저장하면_…`(EAI 행 없음) |

---

## 6. 결정 상세

### 6.1 API (요청·응답 키 — 행 키 UPPER_SNAKE, F11)

**headerMng**

| action | 요청 | 응답(`data.result`) |
|---|---|---|
| search | params `target`(`HEADER` 기본·`COLUMN`), `keyword` | HEADER: `headers[{LAYOUT_ID, LAYOUT_NAME, EAI_CODE(이 헤더를 표준 헤더로 가리키는 EAI, 없으면 없음), ENCODING, ITEM_COUNT, TOTAL_LENGTH, USED_BY_COUNT, VER}]`, `eais[{EAI_CODE, EAI_NAME, ENCODING, PAD_RULE, HEADER_LAYOUT_ID}]`. COLUMN: `columns[{PHYS_NAME, COLUMN_NAME, LABEL_LONG, DISPLAY_NAME, DOMAIN_ID, DOMAIN_NAME, DATA_TYPE, LENGTH, SCALE, UNIT_CODE}]`(최대 100) |
| view | params `layoutId` | `header{LAYOUT_ID, LAYOUT_NAME, EAI_CODE, EAI_NAME, ENCODING, PAD_RULE, TOTAL_LENGTH, VER}`, `items[{SEQ, FILL_KIND, COLUMN_PHYS, DISPLAY_NAME, DOMAIN_NAME, DATA_TYPE, DOMAIN_LENGTH, SCALE, UNIT_CODE, TRANS_UNIT, UNIT_ITEM, NUM_FORMAT, DEFAULT_VALUE, FILLER_LENGTH, OFFSET, LENGTH}]`, `usedBy[{LAYOUT_ID, LAYOUT_NAME, SND_SYSTEM, RCV_SYSTEM, HEADER_SEQ, TOTAL_LENGTH}]`, `units[{UNIT_CODE, DIMENSION, BASE_UNIT}]` |
| save | params `layoutId?, ver?, layoutName, eaiCode?, eaiName?, encoding?, padRule?`; grid `items[{SEQ, FILL_KIND, COLUMN_PHYS, TRANS_UNIT, UNIT_ITEM, NUM_FORMAT, DEFAULT_VALUE, FILLER_LENGTH}]` | `layoutId, ver, totalLength, recalculated[{LAYOUT_ID, LAYOUT_NAME, TOTAL_LENGTH_BEFORE, TOTAL_LENGTH_AFTER}], droppedOverrides` |

**layoutMng**

| action | 요청 | 응답 |
|---|---|---|
| search | params `target`(`LAYOUT` 기본·`HEADER`·`COLUMN`), `keyword`, `headerLayoutId`, `sndSystem`, `rcvSystem` | LAYOUT: `layouts[{LAYOUT_ID, LAYOUT_NAME, EAI_CODE, SND_SYSTEM, RCV_SYSTEM, HEADER_SUMMARY, ITEM_COUNT, TOTAL_LENGTH, LAYOUT_VERSION, VER}]`, `systems[{SYSTEM_CODE, SYSTEM_NAME}]`, `eais[…]`, `headers[{LAYOUT_ID, LAYOUT_NAME, TOTAL_LENGTH}]`(검색 조건·헤더 추가 팝업용). HEADER: `headers[…]`. COLUMN: headerMng 와 같다(같은 `LayoutDictionary.search`) |
| view | params `layoutId` | `layout{LAYOUT_ID, LAYOUT_NAME, EAI_CODE, SND_SYSTEM, RCV_SYSTEM, TOTAL_LENGTH, HEADER_LENGTH, LAYOUT_VERSION, VER}`, `headers[{SEQ, HEADER_LAYOUT_ID, HEADER_NAME, TOTAL_LENGTH, OFFSET(메시지 절대), items[헤더 항목 + DEFAULT_VALUE, OVERRIDE_VALUE, EFFECTIVE_VALUE — OFFSET 은 헤더 안 상대]}]`, `items[본문, OFFSET 절대]`, `units` |
| save | params `layoutId?, ver?, layoutName, eaiCode?, sndSystem, rcvSystem`; grid `headers[{SEQ, HEADER_LAYOUT_ID}]`, `consts[{HEADER_LAYOUT_ID, HEADER_SEQ, CONST_VALUE}]`, `items[…headerMng 와 같은 키]` | `layoutId, ver, totalLength, headerLength` |

`search`·`view` 는 쓰지 않는다. 쓰기는 `save` 만 한다. 서비스가 받는 `OFFSET`·`LENGTH`·`TOTAL_LENGTH` 는 없다(서버 계산).

### 6.2 거부 코드 (`LayoutIssueCode`, message 는 `접두어 + "Lnn[seq] 문구; …"`)

| 코드 | 조건 | 범위 |
|---|---|---|
| L01 | DATA·CONST·AUTO 항목의 `COLUMN_PHYS` 가 컬럼 사전에 없다 | 05-02(수용 기준 1, 03 거부 #1) |
| L02 | fill_kind 의 닫힌 칸에 값이 있다(field 이름을 싣는다) | 05-02(수용 기준 5, 03 거부 #5 포함) |
| L03 | 필수 칸이 비었다(컬럼, AUTO 종류, FILLER 길이 ≥1) | 05-02 |
| L04 | AUTO 종류가 SEND_TIME·MSG_LENGTH·SEQ·LAYOUT_ID 가 아니다 | 05-02 |
| L05 | 전송 단위와 단위 항목을 함께 넣었다(03 거부 #6 — DB CHECK 보다 먼저) | 05-02 |
| L06 | 같은 레이아웃에 같은 컬럼을 두 번 넣었다 | 05-02 |
| L07 | 항목 길이를 파생할 수 없다(유효 도메인 길이 없음) | 05-02 |
| L08 | 숫자 표현 형식: 숫자가 아닌 도메인·형식 문자열 위반·SCALE 이 0 도 도메인 소수도 아님 | 05-02(형식만. 자리 용량 #4 는 05-03) |
| L09 | 헤더 구성: HEADER 가 아닌 레이아웃·같은 헤더 중복·없는 헤더 | 05-02 |
| L10 | 상수 재정의 대상이 이 전문에 쌓인 헤더의 CONST 항목이 아니다 | 05-02 |
| L11 | 기본 속성: 이름 빈 값·없는 시스템·없는 EAI·대상 레이아웃 없음 또는 종류 불일치(헤더 화면에서 MESSAGE 를 열거나 반대) | 05-02 |
| (05-03) | CONST·재정의 값의 도메인 유효 식(#2), 전송 단위 차원(#3), 숫자 표현 자리 용량(#4), unit_item 이 같은 레이아웃 항목을 가리킴(#7) | TSK-05-03 — 이 작업은 검사하지 않는다(D7) |

### 6.3 저장 절차 (OASIS action 한 건 = 트랜잭션 한 개 — 예외면 전부 되돌린다)

**headerMng.save**: ① 요청 행 → `LayoutItemDraft` ② 대상이 있으면 `MdmLayout` 을 읽어 kind=HEADER 확인(L11)·`ver` 대조(MDM001) ③ `LayoutDictionary.byPhysNames` → `LayoutItemRules.check`(L01~L08) — 이슈가 하나라도 있으면 쓰기 전에 `LayoutRejections.reject(HEADER_PREFIX, …)` ④ 길이·상대 오프셋 계산(`LayoutOffsetCalculator`) ⑤ 헤더 행 저장(TOTAL_LENGTH) ⑥ EAI: `eaiCode` 가 있으면 upsert(`findById` → 없으면 `new MdmEai(code, name, encoding)` → 칸 설정 → **`eaiRepository.save`** 명시 호출, `HEADER_LAYOUT_ID` = 이 헤더), 이 헤더를 가리키던 다른 EAI 는 `HEADER_LAYOUT_ID` 를 비운다. `eaiCode` 가 없으면 이 헤더를 가리키던 EAI 만 비운다 ⑦ 재정의 재짝짓기 준비: `constsOfHeader(이 헤더)` 를 읽어 (전문, 옛 SEQ → 옛 COLUMN_PHYS) 를 기억하고 CONST 행을 지운다 ⑧ 항목 교체(`replaceItems`) ⑨ 기억한 재정의를 새 항목의 같은 COLUMN_PHYS·CONST 인 SEQ 로 다시 넣고, 짝이 없으면 버린다(`droppedOverrides`) ⑩ `recalculateUsers(이 헤더)`(§6.4).

**layoutMng.save**: ① 기본 속성 검사(L11)·`ver` 대조 ② 헤더 그리드 → 헤더 id 목록, EAI 표준 헤더가 없으면 맨 앞에 끼움(I14), 각 id 가 HEADER 인지·중복 없는지(L09) ③ 재정의 그리드 검사(L10 — 대상 헤더가 스택에 있고, 그 헤더 항목 SEQ 가 CONST). `CONST_VALUE` 가 빈 행은 버린다(I10) ④ 본문 항목 검사(L01~L08) ⑤ 헤더 TOTAL_LENGTH(저장된 값)와 본문 길이로 `placeMessage` ⑥ 전문 행 저장(LAYOUT_KIND=MESSAGE, TOTAL_LENGTH, `VERSION` 그대로) ⑦ `replaceStack`(CONST→HEADER 지우고 다시 넣기) ⑧ `replaceItems`(본문).

### 6.4 헤더 변경 재계산 (`LayoutWriter.recalculateUsers`)

`stacksUsing(headerId)` 로 이 헤더를 쌓은 전문 id 들을 모은다. 전문마다: 스택 헤더들의 현재 TOTAL_LENGTH → 헤더 합, 본문 항목은 저장된 LENGTH 를 SEQ 순으로 → `placeMessage` → 본문 항목 엔티티의 OFFSET 과 전문 엔티티의 TOTAL_LENGTH 를 setter 로 바꾼 뒤 **`saveAll`·`save` 로 명시 저장하고 `flush`** 한다(I23). 본문 항목 길이는 다시 파생하지 않는다(도메인 변경 영향은 05-03 의 영향도 몫). `VERSION` 은 올리지 않는다(I17). 감사 `VER` 은 리스너가 올린다 — 그 전문을 화면에 띄워 둔 사용자는 다음 저장에서 MDM001 을 받는다(의도된 동작, 기능설계서에 적는다).

### 6.5 화면 흐름 요점

- **headerMng**: 목록 행 선택 → view → 상세·항목·사용 전문 표시. [신규] 는 빈 상세. 항목 추가는 `ColumnPickModal` 선택 또는 [+ FILLER] 뿐. 항목을 고르면 아래 `LayoutItemDetail` 이 열린다. fill_kind 를 바꾸면 `clearClosedFields`. 저장 전 `precheck` 로 화면 선검사(서버와 같은 문구)를 하고, 사용 전문이 있으면 확인 창 "이 헤더를 쓰는 전문 N건의 오프셋·총 길이가 다시 계산됩니다"를 띄운다. 저장 후 목록 재조회·같은 헤더 재선택.
- **layoutMng**: EAI 선택 시 그 EAI 표준 헤더를 헤더 구성 맨 앞에 넣는다(서버도 같은 규칙, I14). 헤더 추가는 `HeaderPickModal`(layoutMng `search target=HEADER`). 헤더 구성 행 [상수 편집] → `ConstEditModal`. 본문 그리드 위에 헤더 요약 줄. 총 길이 계산값 문구는 `헤더 {H} ({h1} + {h2}) + 본문 {B} ({b1} + … ) = {T} 바이트`(html). 레이아웃 ID·버전은 읽기 전용.
- 권한: [저장]·[신규]·항목 추가 버튼은 `canDoButton(rbac, SCREEN_ID, "save")` 가 거짓이면 숨긴다(담당자는 조회만 — dmb READ).

---

## 담당자 확인 필요 결정

### D1 — 화면 그룹 경로를 spec 의 `mdl` 대신 `dmb` 로 쓴다
- **질문**: spec entry-point 는 `/portal → mdl/headerMng`·`mdl/layoutMng` 인데, 리포 정본 그룹 코드는 `dmb` 다. 어느 쪽으로 메뉴·componentPath·패키지·BPMN 경로를 만들 것인가.
- **선택지**: (1) `dmb`(리포 정본). (2) spec 글자 그대로 `mdl`.
- **택한 것**: (1) — 메뉴 경로 `마루 MDM > 레이아웃 > 전문 헤더 정의/전문 레이아웃`(spec 이 적은 메뉴 이름과 같다), componentPath `dmb/headerMng`·`dmb/layoutMng`.
- **근거**: D-015(decisions.md:118-121)가 옛 TRD 가정 T2 의 `mdt/mdl/…` 를 `dma~dme` 로 바꿨고, `docs/mdm/screens/README.md` §3(:40-41)·wbs TSK-05-02 tech-spec(:776-781)·TRD:85·`DataInitializer` 의 기존 `dmb "레이아웃"` 폴더(:878)·`MdmScreenGroup.DMB`·`SecurityScreenContractTest`(:80·95)가 모두 `dmb` 다. `mdl` 로 만들면 폴더·권한 매트릭스·계약 테스트가 모두 어긋난다. 같은 불일치를 TSK-04-03 이 `mdt/domainMng` → `dma/domainMng` 로 처리한 선례가 있다(TSK-04-03 design.md:9). spec 이 적은 **메뉴 이름**(MDM > 레이아웃 > …)은 그대로 지킨다. 근거 강도: 강(승인 여부와 무관하게 리포 전체가 `dmb` 로 맞춰져 있다).
- **반려되면 재작업할 방향**: `DataInitializer` 에 `mdl` 폴더를 새로 시드하고 leaf 의 PARENT_MENU_ID·패키지·BPMN·pages 경로·tsup entry·레지스트리·스크린샷 이름을 `mdl` 로 옮긴다. `MdmScreenGroup`·권한 매트릭스·screens/README 도 함께 바꿔야 하므로 D-015 개정이 먼저다.

### D2 — 인코딩·패딩은 EAI 가 소유하고, 헤더 상세에서 그 EAI 를 함께 편집한다(스키마 변경 없음)
- **질문**: spec "헤더 목록·상세(인코딩·패딩)"와 html 헤더 상세 입력란은 헤더마다 인코딩·패딩이 있는 것처럼 보이지만, 확정 스키마는 `TB_MDM_EAI.ENCODING/PAD_RULE` 에만 칸이 있다. 어떻게 담을 것인가.
- **선택지**: (1) 헤더 상세에서 EAI 를 고르거나 새 코드로 만들고, 그 EAI 의 이름·인코딩·패딩을 편집해 `TB_MDM_EAI` 에 저장, `TB_MDM_EAI.HEADER_LAYOUT_ID` = 이 헤더(EAI 표준 헤더 지정). EAI 가 없는 헤더(시스템 구간 헤더 등)는 "전문의 EAI 인코딩을 따른다"로 표시. (2) `TB_MDM_LAYOUT` 에 `ENCODING`·`PAD_RULE` 칸을 더하는 마이그레이션(V9).
- **택한 것**: (1).
- **근거**: 03 테이블 설계(:58-59)와 TSK-05-01 D5("encoding·padRule 은 EAI 소유라 스냅샷 최상위에만 둔다. html 헤더 상세 입력란은 05-02 가 EAI 값을 표시·상속하는 것으로 구현할 여지") — 스냅샷 계약(`MdmLayoutSnapshot.encoding/padRule`)도 전문 단위다. (2) 는 TSK-02-03 소유 ERD 와 05-01 계약을 함께 바꿔야 해 이 작업의 권한 밖이다. html 의 "구간 종류 [미결]"은 칸이 없어 저장하지 않는다(F25, TSK-05-01 F24 인계를 이어받아 여기서도 미결로 남긴다). 근거 강도: 중(확정 스키마 근거는 강하지만 html 이 헤더별 인코딩을 의도했을 가능성을 배제하지 못한다).
- **반려되면 재작업할 방향**: V9 마이그레이션(두 방언)으로 `TB_MDM_LAYOUT.ENCODING`·`PAD_RULE`(HEADER 전용) 추가, 엔티티 필드 추가, 헤더 상세의 EAI 편집부를 헤더 칸 편집으로 바꾸고 EAI 는 별도 선택만 남긴다. 스냅샷 계약에 헤더별 인코딩을 더할지는 05-03 과 함께 정한다.

### D3 — `NUM_FORMAT` 문자열 형식에 숫자 표현 자리수(WIDTH)까지 담는다
- **질문**: TSK-05-01 이 "05-02 가 쓰고 05-03 이 읽으니 두 Task 가 형식을 맞춘다"고 인계한 `TB_MDM_LAYOUT_ITEM.NUM_FORMAT VARCHAR(50)` 의 형식, 그리고 M201 COIL_THK 의 4바이트(도메인 3,1 에서 파생되지 않는 값, F6)를 어디에 담을 것인가.
- **선택지**: (1) `SIGN=Y|N;ZERO=Y|N;SCALE=<n>;WIDTH=<n>`(키 순서 고정, 네 키 필수) — WIDTH 가 항목 길이가 된다. (2) JSON `{"sign":false,"zeroPad":true,"impliedScale":1,"width":4}`(55자라 50자 칸을 넘는다 — 배제). (3) 표현 자리수를 두지 않고 도메인 길이를 늘려 M201 을 맞춘다(도메인 10 코일 두께의 정의 "숫자 3,1"과 어긋난다 — 배제).
- **택한 것**: (1). `SCALE` 은 암묵 소수 자리로 0(소수점 문자 사용) 또는 도메인 소수 자리만 허용한다(html "암묵 소수점: 사용(1자리)/소수점 문자", "자릿수는 도메인 소수 자리").
- **근거**: html 항목 상세가 부호 자리·0 채움·암묵 소수점·**표현 자리수**를 항목 칸으로 두고, 등록 거부 #4 "숫자 표현 자리가 도메인의 길이·부호를 담기에 부족하면 거부"가 표현 자리수와 도메인 길이가 다른 값임을 전제한다. 표현 자리수는 "FILLER 가 아닌 항목에 길이 직접 입력"(거부 #5)과 다르다 — 길이 칸(`FILLER_LENGTH`)이 아니라 표현 형식의 일부이며, 그래서 불변 I4·I6 에서 둘을 따로 적었다. 계약 record `MdmLayoutNumFormat(sign, zeroPad, impliedScale)` 에는 width 가 없지만 스냅샷 항목 `length` 가 같은 값을 싣는다. 사람이 DB 에서 읽을 수 있고 50자 안에 든다(최대 29자). 근거 강도: 중(형식 자체는 원천이 정하지 않았다).
- **반려되면 재작업할 방향**: 코덱 두 벌(`LayoutNumFormatCodec`·`num-format.ts`)과 그 벡터 테스트만 바꾸면 된다. 이미 저장된 행이 있으면 변환 스크립트가 필요하므로 05-03 이 읽기 시작하기 전에 확정해야 한다.

### D4 — 저장 거부에 새 `MdmErrorCode` 를 더하지 않는다
- **질문**: 레이아웃 저장 거부를 `MdmErrorCode` 에 새 상수(`LAYOUT_SAVE_REJECTED`)로 더할 것인가.
- **선택지**: (1) 더하지 않고 `LayoutRejections` 가 cactus `BusinessException(ErrorCode.BUSINESS_ERROR, "…저장 거부: Lnn…", details)` 를 직접 만든다(첫 detail 코드 문자열 `LAYOUT_SAVE_REJECTED`). 동시 수정만 기존 MDM001. (2) `MdmErrorCode` 에 `origin/dev` 최대 + 1(현재 MDM022)로 추가하고 `CommonContractTest` 개수 단언을 바꾼다.
- **택한 것**: (1).
- **근거**: 기점 이후 dev 가 MDM016~MDM021 을 이미 가져갔다(F20). (2) 는 enum 마지막 줄(`;`→`,`)과 `CommonContractTest` 의 개수 줄을 **같은 줄에서** 고쳐 머지 충돌이 확정적이고, 기점 위에서는 MDM016 을 쓰면 번호까지 겹친다 — 팀장 지시 "공유 목록은 같은 줄을 고치지 말고 추가만". OASIS 서비스 예외는 화면에 `meta.message` 원문만 가고 `errors[]` 는 비어 온다(F11, TSK-04-03 B0·TSK-04-04 F12 실측) — 화면이 기대는 것은 message 의 `Lnn` 코드라 enum 코드가 없어도 기능 차이가 없다. 근거 강도: 중(리포 관례는 "mdm 공통 오류 코드는 MdmErrorCode" 쪽이다).
- **반려되면 재작업할 방향**: 머지 뒤 `MdmErrorCode` 에 `LAYOUT_SAVE_REJECTED("MDM0nn", 400, BUSINESS_ERROR, "전문 레이아웃 저장 검사를 통과하지 못했습니다")` 를 더하고, `LayoutRejections` 가 그 코드의 transport·code·기본 문구를 쓰게 바꾼다(message 형식 `기본 문구: Lnn…` 은 dev 의 `MdmErrors.of(code, detail, issues)` 로 맞춘다). 화면 문구 단언(`"… 저장 거부: L01"`)을 새 문구로 바꾼다.

### D5 — 서버 쪽 표준 관리자 역할 가드를 두지 않는다(BFF RBAC 만)
- **질문**: "표준 관리자 역할만 등록·수정"(03 화면 절, PRD:69)을 서버 서비스가 직접 검사할 것인가.
- **선택지**: (1) 기점 방식 — 메뉴·API 액션 RBAC 는 mcm 시드와 BFF 가 맡고(dmb: MDM_STD_ADMIN EDIT, MDM_STEWARD READ, SYSADMIN PERM_ALL), 서비스는 역할을 보지 않는다. (2) dev 의 TSK-04-04 D1 처럼 `MdmStdAdminGuard.requireStdAdmin()` 을 save 첫 줄에서 부른다(SYSADMIN 도 거부).
- **택한 것**: (1).
- **근거**: 기점의 D-041(TSK-01-03 D6)이 "메뉴·API 액션 RBAC 는 mcm 시드와 BFF, mdm 은 신뢰 채널로 역할만 받는다"로 정했고, 서버 가드 클래스(`MdmStdAdminGuard`)는 **기점에 없다**(dev 의 TSK-04-04 가 만들었고 서버 승인 전이다, F20). 같은 경로에 이 작업이 가드를 따로 만들면 add/add 충돌이 난다. 반대 근거: TSK-04-04 D1 은 컬럼 쓰기에 서버 가드를 둬 모듈 안에서 방식이 갈린다 — 이 결정을 사람이 보고 통일해야 한다. E2E 는 쓰기를 표준 관리자 계정으로 해 두 방식 모두에서 통과하게 했다(§3.5). 근거 강도: 중.
- **반려되면 재작업할 방향**: dev 를 브랜치에 들인 뒤 `HeaderMngService.save`·`LayoutMngService.save` 첫 줄에 `stdAdminGuard.requireStdAdmin()` 을 넣고(생성자 주입), 통합 테스트 도우미에 역할 문맥(표준 관리자)을 세우며, "SYSADMIN 저장은 MDM016 으로 거부" 테스트를 더한다.

### D6 — 드래그 순서를 위해 shared `AgDataGrid` 에 선택형 prop 을 더한다
- **질문**: spec "본문 항목 그리드(… 드래그 순서)"·html "행을 끌어 순서를 바꾼다"를 어떻게 구현할 것인가. shared 래퍼에는 행 드래그가 없다(F16).
- **선택지**: (1) shared `AgDataGrid` 에 `GridColumn.rowDrag`·`AgDataGridProps.onRowOrderChange` 를 더한다(주지 않으면 기존과 같은 동작, ag-grid community managed row drag). (2) 화면에서 `<table>` + HTML5 드래그로 직접 만든다. (3) 드래그 없이 [위로]/[아래로] 버튼만 둔다.
- **택한 것**: (1).
- **근거**: spec 본문이 드래그를 요구한다(근거 최상위). mantine-aggrid-ui 스킬 §3 과 FrontEnd Part B §17 은 "래퍼가 요구를 못 채우면 화면에서 우회하지 않는다 — 사용자에게 알리고 승인되면 shared 에 추가"라 (2) 는 규칙 위반이고 (3) 은 spec 과 다르다. 행 드래그(managed)는 community 기능이며 이미 `AllCommunityModule` 을 등록하므로 새 의존성·Enterprise 가 없다(ADR-0001 준수). 추가 prop 은 선택형이라 기존 화면 동작이 바뀌지 않는다(I22). 이 결정이 스킬이 말한 "승인" 요청이다. 근거 강도: 중(spec 강 + 규칙이 요구하는 승인은 사람 몫).
- **반려되면 재작업할 방향**: shared 변경을 되돌리고 두 화면 그리드에 [위로]/[아래로] 버튼(`moveRow` 재사용)을 둔다. E2E L8 을 버튼 조작으로 바꾼다. 재계산 로직은 그대로다.

### D7 — 05-02 와 05-03 의 경계, 헤더 변경 시 사용 전문 재계산과 재정의 재짝짓기
- **질문**: 형제 TSK-05-03 과 겹치는 영역(등록 거부 7종, 버전, 영향도)을 어디까지 이 작업이 하는가. 그리고 헤더를 바꾸면 그 헤더를 쓰는 전문의 저장값(오프셋·총 길이·재정의)을 어떻게 다루는가.
- **선택지**: (1) 이 작업은 L01~L11(§6.2)만 검사하고, 헤더 저장 트랜잭션에서 사용 전문의 오프셋·총 길이를 다시 계산하며, 재정의는 COLUMN_PHYS 로 다시 짝짓고 짝이 없으면 지운다. `VERSION` 은 올리지 않는다. 거부 #2·#3·#4·#7, 버전 이력·변경 분류·스냅샷·직렬화, `MdmDomainReferenceSpi(LAYOUT_ITEM)` 는 05-03. (2) 헤더 저장은 헤더만 바꾸고 사용 전문은 다음 전문 저장 때 재계산(저장값이 한동안 틀린 채 남는다). (3) 사용 전문이 있으면 헤더 구성 변경을 거부.
- **택한 것**: (1).
- **근거**: 03 "오프셋과 전문 총 길이는 저장 시 계산 … 수작업으로 맞추는 값이 없다" — (2) 는 저장값과 실제 구성이 어긋난 상태를 만든다. spec 이 "헤더 변경 시 사용 전문 전체를 영향도에 표시"를 요구하므로 영향이 곧바로 계산값에 반영되는 편이 맞고, html "헤더 구성 변경 → 그 헤더를 쓰는 전문 전체 동시 전환"도 변경 자체를 막지 않는다((3) 배제). 재정의는 SEQ 로만 걸려 있어(F3 FK) 헤더 항목을 지우고 다시 넣는 순간 FK 가 막거나 엉뚱한 항목을 가리키므로 물리명으로 다시 짝지어야 한다(I7 이 유일성을 보장). wbs 가 거부 7종·버전·영향 전문 목록을 05-03 요구사항으로 적었다(wbs:808-816) — 버전을 이 작업이 올리면 05-03 의 "저장 즉시 스냅샷 버전 생성"과 두 번 오른다. 근거 강도: 중(wbs 경계는 강, 재짝짓기 규칙은 이 작업의 판단).
- **반려되면 재작업할 방향**: (2) 라면 `recalculateUsers` 호출을 빼고 view 가 계산값을 즉석에서 다시 내게 한다. 재정의 정책이 다르면(예: 항목이 빠지면 거부) ⑨ 단계를 L10 거부로 바꾼다. 경계가 바뀌면 L 코드 표에 05-03 몫 검사를 더한다.

### D8 — 컬럼 사전 검색·헤더 선택은 새 액션이 아니라 `search` 의 `target` 인자로 한다
- **질문**: 두 화면의 컬럼 사전 검색 팝업과 layoutMng 의 헤더 추가 팝업이 부를 API 를 새 액션·새 팝업 서비스로 둘 것인가.
- **선택지**: (1) 각 서비스 `search` 에 `target=COLUMN`(·`HEADER`)을 두고 공용 `LayoutDictionary.search` 를 부른다. (2) 새 액션 이름(`lookup` 등). (3) 새 팝업 screenId(예 `columnPickPop`)와 OBJECT·RBAC 시드.
- **택한 것**: (1).
- **근거**: 액션은 `MdmActions` 13종 안에서만 고를 수 있고 밖의 이름은 SYSADMIN 도 403 이다(F12) — (2) 는 `MdmActions`·`MdmPermissions`·PERM_ALL allActions·RBAC 기대 파일(`mdm-rbac-seed-check.expected.txt`)을 모두 고쳐야 한다. (3) 은 screens/README §3 정본 목록(24종)과 식별자 사전·DataInitializer 에 새 OBJECT 를 더해야 하고, 조회만 하는 팝업이라 얻는 것이 없다. `search` 는 담당자(READ)에게도 열려 있어 권한 모양도 맞는다. 반대 근거: 한 액션이 목록 두 가지를 돌려주므로 계약이 덜 명확하다 — `target` 값과 응답 키를 기능설계서·§6.1 에 못박는다. 근거 강도: 중.
- **반려되면 재작업할 방향**: (3) 이라면 `pages/dmb/columnPickPop/{columnPickPop.tsx,index.ts}` 팝업과 `services/dmb/columnPickPop.bpmn`·서비스를 만들고 OBJECT·RBAC 시드·screens/README·식별자 사전에 등재한 뒤 `ColumnPickModal` 의 search 함수만 바꾼다. 서버 검색 로직(`LayoutDictionary.search`)은 그대로 쓴다.

---

### D9 — (Build) TSK-04-03 의 `mdm-domainMng.spec.ts` `selectRow` 가 view 응답까지 기다리게 고친다
- **질문**: Build 의 E2E 게이트(§3.7 7)에서 기존 스펙 `mdm-domainMng.spec.ts` E2~E6 가 새 DB 첫 실행마다 E3 미리보기("abc" → "표준 실패")에서 `-` 로 실패했다. 다른 Task 의 테스트를 고칠 것인가.
- **선택지**: (1) 그 스펙의 `selectRow` 도우미만 고쳐, 클릭 전에 `waitForResponse(/domainMng/view)` 를 걸고 클릭 뒤 응답과 두 프레임 반영을 기다린 다음 기존 단언을 둔다(단언·기대값 불변). (2) shared `AgDataGrid` 를 바꿔 우회한다. (3) 스펙을 그대로 두고 실패를 보고한다.
- **택한 것**: (1).
- **근거**: 포커스 추적 실측 — 테스트의 행 클릭(pointerdown~click) 뒤 ag-grid 가 `rowClicked` 를 `LocalEventService.flushAsyncQueue` 로 약 19ms 늦게 보내고, 그 콜백(`handleRowClicked`)이 그리드 컨테이너로 포커스를 가져간 뒤 `view` 를 부른다. 그런데 `selectRow` 의 대기 조건(도메인명 값 = 행 이름)은 저장 직후 화면이 같은 행을 이미 열어 두어 **처음부터 참**이라, 테스트가 곧바로 미리보기 입력을 시작하고 늦게 온 view 응답이 입력값을 비운다. 즉 기존 스펙의 공허한 대기가 원인이다. 기본 경로의 `AgGridReact` prop 은 기점과 같지만(컴파일 결과 diff 확인) 렌더 타이밍이 조금 바뀌어 경쟁이 드러났다(기점 shared 로 단독 2/2 통과, 이 작업 shared 로 4/4 실패. 기점 shared 로 전체 실행은 돌리지 않았다). (1) 은 공허한 대기를 실제 왕복 대기로 바꾸는 **강화**이며 기대값을 완화하지 않는다. E5·E7 도 같은 도우미를 쓰므로 함께 안전해진다. 수정 뒤 새 DB 전체 실행 연속 2회가 모두 12 passed 다. (2) 는 원인이 스펙에 있어 맞지 않고, (3) 은 E2E 게이트를 통과하지 못한다. 근거 강도: 강(실측).
- **반려되면 재작업할 방향**: `mdm-domainMng.spec.ts` 의 `selectRow` 변경만 되돌리고(커밋 `test(TSK-05-02): 도메인 관리 E2E 행 선택이 view 응답까지 기다린다`), TSK-04-03 쪽에서 같은 경쟁을 다른 방법(예: 저장 직후 재선택 생략)으로 푼다.

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 도커 금지로 생략: cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain
- 위 명령이 돌릴 새 테스트는 `LayoutQueriesMssqlTest`(네이티브 SQL 4개의 MSSQL 실행 — Build 이탈 B3 로 3개에서 4개가 됐다) 하나다. 수용 기준 6개는 모두 SQLite 통합·vitest·E2E 로 확인하므로 이 생략 때문에 확인하지 못하는 수용 기준은 없다. MSSQL 방언 확인은 머지 뒤 팀장 방언 검증(`dialect_check`)이 한다.

---

## 인계·후속 (보고에 올린다)

- TSK-05-03: `dmb.layout`(계산·규칙·코덱·사전 조회)을 재사용한다. NUM_FORMAT 형식은 D3, 거부 코드 L01~L11 과 05-03 몫(#2·#3·#4·#7)은 §6.2. `layoutMng` 한 벌은 add/add 충돌이 확정적이다(§2 겹침 표). `MdmDomainReferenceSpi(LAYOUT_ITEM)` 실 구현과 `VERSION` 증가는 05-03 몫이다(D7).
- html "구간 종류 [미결]", AUTO(MSG_LENGTH)의 "세는 범위", SEND_TIME 날짜·시각 분할(html 미결 배지)은 이 작업도 저장하지 않는다(TSK-05-01 F24·D7 인계 유지).
- CONST 값 칼럼은 MSSQL 에서 `VARCHAR(50) BIN2` 라 한글이 손실된다(TSK-05-01 D9·F28) — 상수 입력은 코드값(영문·숫자) 전제이며, 기능설계서에 그렇게 적는다. 화면 입력 검사로 막지는 않는다(05-03 유효 식 검사 몫).

---

## Build 이탈 (Build Phase 추기, 2026-09-24)

| # | 이탈 | 사유 |
|---|---|---|
| B1 | `layoutMng search target=HEADER` 응답 행에 `EAI_CODE`·`items`(헤더 항목·기본값·파생값)를 더했다(§6.1) | 저장 전 새 전문에서 EAI 자동 부착·헤더 추가로 들어온 헤더의 [상수 편집]을 열려면 헤더 항목이 필요하다. view 는 저장된 전문만 준다. 새 액션을 만들지 않고(D8) 같은 target 의 응답만 넓혔다. `LayoutMngServiceSqliteTest.search_는_헤더_요약과_총_길이를_돌려준다` 가 단언한다 |
| B2 | `LayoutFillKinds.Field` 의 `UNIT` 을 `TRANS_UNIT`·`UNIT_ITEM` 둘로 나누고 `key()`(행 키)를 더했다. `parse(String)` 추가 | §3.1 파라미터 테스트가 칸마다 field 이름을 단언한다(두 칸의 열림·닫힘은 같다) |
| B3 | 새 클래스 `dmb.layout.LayoutRows`(응답 행 조립·초안→엔티티·길이 계산), `LayoutQueries` 에 JPQL `allStacks`·`itemCounts`·`allEais` 와 네이티브 `UNITS_SQL`(단위 목록, 예약어 없음 — `ALL_NATIVE_SQL` 에 넣어 정적 가드 대상) | 두 서비스가 같은 행 모양·계산을 쓴다. 단위 목록은 항목 상세의 전송 단위 선택용 |
| B4 | 항목 SEQ 는 grid **행 순서**가 정본이다 — 서버는 요청의 `SEQ` 를 읽지 않고 1..n 으로 다시 매긴다(`LayoutItemDraft.fromRow(row, seq)`) | 드래그 순서가 곧 저장 순서다. 중복·누락 SEQ 로 PK 충돌이 나지 않는다 |
| B5 | 헤더 레이아웃 행의 `EAI_CODE` 는 비워 둔다 — 헤더와 EAI 의 관계는 `TB_MDM_EAI.HEADER_LAYOUT_ID` 하나로 둔다 | 순환 FK(LAYOUT.EAI_CODE, EAI.HEADER_LAYOUT_ID) 때문에 신규 헤더를 먼저 넣고 EAI 를 upsert 해야 한다(D2). EAI 이름·인코딩·패딩은 요청에 값이 있을 때만 바꾼다 |
| B6 | 화면 오른쪽에 쌓이는 그리드(사용 전문·헤더 항목·헤더 구성·본문 항목)는 shared `GridPanel` 대신 제목 + 높이를 준 `AgDataGrid` 로 둔다(domainMng 선례). 왼쪽 목록은 `GridPanel` 안의 감싸는 div 가 패널을 채운다 | `GridPanel` 은 `height:100%; contain: strict` 라 높이가 정해지지 않은 세로 흐름에서 0 으로 접히고, 그 안의 `.cm-data-grid` 는 절대 배치다(E2E 실측) |
| B7 | 계산 표시 칸(항목명·도메인(파생)·설정·위치·재정의 요약)을 `render` 가 아니라 행 데이터 필드로 넣는다(`src/layout/item-rows.ts`). 헤더 구성의 위치 열 col-id 는 `POSITION` | ag-grid 는 필드 값이 바뀐 셀만 다시 그려, 필드 없는 `render` 칸은 상수 적용·드래그 뒤 갱신되지 않았다(E2E L5 실측) |
| B8 | shared `AgDataGrid`: `resolveRowDrag()` 를 export 하고, `onRowOrderChange` 가 없으면 hook·핸들러를 만들지 않는다. 기본 동작 불변은 shared `tests/unit/grid-row-drag.unit.test.ts` 가 단언한다(I22 의 알려진 갭을 덮음) | shared 에는 `test` 스크립트가 없어 `pnpm --filter @dk-oasis/shared test` 대신 `test:unit`(vitest `tests/unit`)을 돌렸다 — 158 passed. 게이트 판정에는 넣지 않는다 |
| B9 | 테스트 추가: headerMng `page-render.test.ts`(목록·빈 상태·헤더 길이 즉시 계산·영향도), SQLite `화면이_보낸_OFFSET_LENGTH_는_무시하고_다시_계산한다`(두 서비스), `view_는_전문_레이아웃을_열지_않는다`, `search_HEADER_…`, `fill_kind_가_없거나_모르는_값이면_L03…`, `칸_행렬은_F10_표와_같다`, `이슈는_행_순서대로_모두_모은다`. `LayoutTestSupport` 는 M201 한 벌마다 새 EAI 코드를 쓴다(한 클래스가 DB 하나를 공유) | 변이 I4③·I11 을 단위·vitest 로 잡기 위해. page-render 두 파일은 화면 파일보다 먼저 빨강을 확인하지 못했다(보고에 올린다) — 민감도는 변이 I11·I20 으로 보였다 |
| B10 | Java 테스트 이름 `50자를_넘지_않는다` → `형식_문자열은_50자를_넘지_않는다` | Java 식별자는 숫자로 시작할 수 없다 |
| B11 | TSK-04-03 `mdm-domainMng.spec.ts` 의 `selectRow` 도우미를 view 응답 대기로 강화 | D9 |
| B12 | E2E 스크린샷은 12장이다(§3.5 표에 적은 이름 전부) | §3.5 표 |

## Build 기록 (실측)

- **알 수 없는 grid**: `LayoutOasisFlowTest.전문_save_에_헤더_항목_grid_를_끼워_보내도_헤더는_바뀌지_않는다` — OASIS 는 모르는 grid `headerItems` 를 무시했다(`meta.success=true`). 헤더 행·항목(DEFAULT_VALUE `B0`, LENGTH 4)은 바뀌지 않았다. 변이 I8③(save 에 5번째 인자 `headerItems` 를 더해 반영)은 OASIS 가 그 메서드를 골라 이 테스트를 빨갛게 했다.
- **E2E**: §3.7 절차(포트 18521·18596·15521)로 새 DB 전체 실행을 연속 2회 돌려 모두 12 passed 였다(domainMng 3·headerMng 2·layoutMng 2·sample 1·shell-rbac 4). D9 이전에는 domainMng E2 가 새 DB 첫 실행에서 실패했다.
- **BPMN**: `bpmn-tool@1.3.0 create`·`validate`(npx) — 유효, 경고 1(actionGateway default flow 미설정, domainMng 와 같다). `check_oasis_contract.py --module mdm` ERROR 0.
- **MSSQL**: `LayoutQueriesMssqlTest` 는 `:api:compileMssqlTestJava` 로 컴파일만 확인했다(도커 금지).
