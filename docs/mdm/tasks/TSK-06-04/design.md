# mdm/TSK-06-04 설계 — 카테고리 편집(REGEX·TABLE)

> Phase: design · entry-point: `dmc/codeCateEdit`(spec 의 `mdc` 는 오탈자 — §"담당자 확인 필요 결정" D1) · depends: TSK-06-01, TSK-01-03, TSK-03-02
> 다음 Phase(TDD 구현)는 이 문서가 컨텍스트의 전부다. 탐색으로 얻은 관례·함정은 마지막 절에 모았다.

## 1. 접근 방식

카테고리 도메인의 전사 계약(`CategoryDefinition`·`CategoryOwner`·`CategoryDefTarget`·`CategoryKind`·`CategoryConventions`, 모두 `src/backend/mdm/lib/.../contract/category/`)과 판정기(`common/mastercode/MasterCodeCategoryResolver`)는 TSK-01-02·06-03 이 이미 만들어 재사용만 하면 된다. `MasterCodeSegmentService`(계약)와 `DefaultMasterCodeSegmentService`(유일 구현 빈)에는 이 Task 몫 스텁 5개(`addCategory`·`changeCategory`·`closeCategory`·`addCategoryMembers`·`removeCategoryMembers`, 전부 `UnsupportedOperationException("TSK-06-04 가 구현한다: …")`)와 `revert` 의 `CATE` 분기(`UnsupportedOperationException("TSK-06-04 가 구현한다: revert(CATE)")`)가 이미 자리를 잡고 있다. 접근 방식은 세 갈래다.

1. **선분 조작 본체**: 새 컴포넌트 `common/mastercode/MasterCodeCateSegmentOps`(`@Component`, TSK-06-03 의 `MasterCodeItemSegmentOps` 자매)를 만들어 5개 메서드 + `revertCate`를 구현하고, `DefaultMasterCodeSegmentService` 는 이 스텁 5줄과 `revert`의 `case CATE` 분기만 이 컴포넌트로 위임하도록 고친다. `MasterCodeItemSegmentOps` 는 손대지 않는다(그 파일 주석이 이미 "CATE 는 호출자가 거른다"고 선언해 뒀다).
2. **OASIS 진입 서비스**: `dmc/codeCateEdit` 패키지에 `CodeItemEditService` 와 같은 모양의 서비스 1개(`@Transactional` 금지, F9)와 BPMN 1개를 새로 만든다. `MdmActions` 가 닫힌 16개 상수 집합이라(`DmcBpmnActionTest` 류가 이를 강제) `addCategory`·`close` 같은 액션을 새로 만들지 않고, `codeItemEdit.bpmn` 이 쓰는 `search`·`view`·`compare`·`validate`·`save`·`restore` 6개만 쓴다(§"담당자 확인 필요 결정" D2). 카테고리 추가·수정·닫기는 모두 `save` 액션의 `categories` 그리드(rowStatus `ADDED`/`CHANGED`/`DELETED`, `MasterCodeItemProjection` 과 같은 모양의 새 순수 클래스 `MasterCodeCateProjection` 을 하나 더 둔다) 로, TABLE 소속 이동은 같은 `save` 액션의 `members` 그리드(한 번에 카테고리 하나, rowStatus `ADDED`/`DELETED`)로 처리한다. **한 serviceTask 가 그리드 두 개를 동시에 받는 것은 이 저장소에 선례가 있다** — `MasterRuleFrameService`(mcm-core, `inList`+`outList`)·`CommSyncMngService`(mcm-core, `dsMain`+`dsObject`)가 이미 `grids.<key>.rows` 를 메서드 파라미터 두 개(`List<Map<String,Object>>`, 파라미터 이름이 grid 키와 글자 단위로 같아야 함, `DmcBpmnActionTest` 102행 주석)로 동시에 받는다. `save(CodeCateSaveRequest request, List<Map<String,Object>> categories, List<Map<String,Object>> members)` 로 선언한다. `restore` 액션은 `MasterCodeSegmentKey` 그대로 받아 `table=CATE`(신규)·`table=CATE_ITEM`(06-03 `revertCateItem` 이미 존재, 그대로 위임)을 함께 처리한다.
3. **화면**: `codeItemEdit` 화면 폴더 모양을 그대로 복제한다(`page.tsx`/`api.ts`/`types.ts`/컴포넌트 분리, "공유 파일을 바꾸지 않는다" 관례 계승). 좌측 카테고리 목록 + 추가 폼, 우측은 `defKind` 에 따라 TABLE(transfer list)·REGEX(정규식+대상 칸+두 목록) 편집 영역을 갈라 보여주고, 하단에 서버 재해석 미리보기 패널을 둔다. **`compare`(미리보기)는 REGEX 전용이다.** REGEX 는 대상 칸 값과 정규식을 서버(Java `Pattern`)로만 판정해야 하므로(원천 04:183, "화면은 정규식을 실행하지 않는다"), 폼의 현재 defExpr·defTarget(저장 전이면 아직 없는 cateId 후보도 가능)을 매 변경마다 `compare` 로 보내 `MasterCodeCategoryResolver.resolve` 결과를 그대로 그린다. TABLE 은 소속 여부 자체가 이미 화면이 들고 있는 두 목록(사용 가능/소속)의 상태라 재해석이 필요 없다 — `compare` 를 부르지 않고, 두 목록의 원본 데이터(그 버전에 유효한 코드 전체 + 현재 소속)는 `view` 응답 하나로 받는다. 시안 `evalCate`/`resolve`(JS `RegExp`)는 참고용 스텁일 뿐 이식하지 않는다.
4. **그리드 적용 순서**: `save` 는 `categories` 를 먼저 적용(DELETED→CHANGED→ADDED, `MasterCodeItemProjection` 과 동일 순서)해 카테고리 존재·defKind 를 확정한 다음 `members` 를 적용(DELETED→ADDED)한다. 검사 순서(모두 `validate`/`save` 공용, `project()` 한 번으로): ① `categories` 각 행의 cate_id 형식·필수값·defKind 불변·defTarget 허용 목록·defExpr 문법(REGEX) ② `members` 각 행의 대상 카테고리가 (categories 적용 후 기준으로) 존재하고 `defKind=TABLE` 인지 — REGEX 카테고리를 겨냥한 members 행이나 같은 save 안에서 닫힌(DELETED) 카테고리를 겨냥한 members 행은 `CATE_NOT_FOUND`/`DEF_KIND_IMMUTABLE`류로 거부 ③ `members` ADDED 행의 코드가 그 버전에 유효한지(불변 규칙 5). 같은 `save` 안에서 새 TABLE 카테고리를 추가하면서 그 카테고리에 멤버를 바로 넣는 것은 허용한다(②의 "적용 후 기준"이 이를 보장).

메뉴는 06-02·06-03 이 쓴 자바 시드(`mcm DataInitializer.seedMdmMenus()`)에 `seedMdmCodeCateEditMenu()` 한 메서드를 더하는 것으로 새 메뉴를 등록한다(마이그레이션 불필요, `docs/mdm/screens/README.md` §3 이 `codeCateEdit` menuSeq=004 로 이미 자리를 잡아 뒀다). 기존 메뉴(마스터관리·업무기준관리)는 건드리지 않는다.

## 2. 변경 파일 목록

### 신규

**백엔드 — lib(계약 재사용, 새 구현만)**
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/mastercode/MasterCodeCateSegmentOps.java` — 5 메서드 + `revertCate` 본체(§5 불변 규칙 1·2·3·5·9·10·11·12·13·14).
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/mastercode/MasterCodeCateIssueCode.java` — 카테고리 저장 검사 이슈 코드 enum(`CATE_ID_REQUIRED`·`CATE_ID_FORBIDDEN_CHAR`·`CATE_NAME_REQUIRED`·`INVALID_REGEX`·`DEF_TARGET_NOT_ALLOWED`·`DEF_KIND_IMMUTABLE`·`CATE_ID_OVERLAP`·`CATE_NOT_FOUND`·`MEMBER_CODE_NOT_FOUND`). 우산 오류는 새 `MdmErrorCode` 를 추가하지 않고 기존 `MdmErrorCode.CODE_SAVE_REJECTED`(MDM022)를 `MasterCodeRejections.saveRejected(List<MdmCheckIssue>)`(수정 없이 재사용) 로 그대로 싣는다(§"담당자 확인 필요 결정" D6).
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/mastercode/MasterCodeCateChecks.java` — cate_id 형식(`MaruIdRules.FORBIDDEN_CHAR_PATTERN` 재사용)·필수값·defTarget 허용 목록(`CategoryOwner.MASTER_CODE.allowedDefTargets()`)·defExpr 문법(`Pattern.compile`) 순수 검사.
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/mastercode/MasterCodeCateProjection.java` — `MasterCodeItemProjection` 자매. `categories` 그리드(키: cateId) 전용. TABLE 소속(`members` 그리드, 키: code, 카테고리 하나 범위)은 별도의 작은 순수 함수 `MasterCodeCateMemberProjection`(같은 파일 또는 별 파일, Build 판단)으로 둔다 — ADDED/DELETED 만 있고 CHANGED 는 없다(멤버는 값이 없는 존재 여부뿐).

**백엔드 — lib(화면 서비스+DTO)**
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmc/codeCateEdit/service/CodeCateEditService.java` — `@Service("codeCateEditService")`. 액션: `search`(마루 코드 목록, `CodeItemEditService.search` 복제 수준)·`view`(카테고리 목록+각 카테고리 defKind별 상세+TABLE 이면 소속 코드 집합+ REGEX 면 두 목록 프리뷰 기초 데이터)·`preview`(→`compare`, 저장 전 후보 정의로 서버 재해석, 쓰기 없음)·`validate`(저장 검사만)·`save`(categories+members 그리드 diff 적용)·`revert`(→`restore`, `MasterCodeSegmentKey` 그대로).
- `.../dmc/codeCateEdit/dto/CodeCateSearchRequest.java`, `CodeCateViewRequest.java`, `CodeCatePreviewRequest.java`(REGEX 전용 — maruCodeId·ver·cateId(기존 카테고리면 이 값으로 저장된 정의를 읽고, 신규/편집 중이면 null 이고 아래 후보값을 그대로 씀)·defExpr·defTarget 후보값, TABLE 카테고리에는 이 액션을 부르지 않는다), `CodeCateSaveRequest.java`(maruCodeId·ver·rowVersion), `CodeCateRevertRequest.java`(maruCodeId·ver·rowVersion·table·cateId·code).

**백엔드 — api(BPMN·시드·테스트)**
- `src/backend/mdm/api/src/main/resources/services/dmc/codeCateEdit.bpmn` — process id=`codeCateEdit`, actionGateway 6분기(search/view/compare/validate/save/restore), `CodeItemEditService` 대신 `codeCateEditService` 빈 참조.
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/mastercode/MasterCodeCateSegmentOpsSqliteTest.java` — §5 불변 규칙 1·2·3·5·7·9·10·11·12·13·14 전부와 성능(불변 규칙 17)을 여기서 검증(같은 클래스 안에 `@Nested` 성능 그룹 또는 별 파일 `CodeCateEditPerformanceSqliteTest`, Build 판단. 후자를 권장 — `TermRecommendPerformanceTest` 패턴처럼 JDBC 배치 시딩이 필요해 SqliteTest 픽스처와 성격이 다르다).
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmc/codeCateEdit/CodeCateEditServiceSqliteTest.java` — 서비스 액션 단위(불변 규칙 4·6·8·15).
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmc/codeCateEdit/CodeCateEditOasisHttpTest.java` — `CodeItemEditOasisHttpTest` 골격 복제, HTTP→BPMN→서비스 왕복(수용 기준 3 일부).
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmc/codeCateEdit/CodeCateEditBpmnActionTest.java` — `DmcBpmnActionTest` 골격 복제(PATH 를 `codeCateEdit.bpmn` 로), 액션 6개가 전부 `MdmActions` 상수인지·READ/EDIT 세트 대조(불변 규칙 16 인접).
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmc/codeCateEdit/CodeCateEditPerformanceSqliteTest.java` — 위에서 권장한 별 파일로 갈 경우 이 파일(불변 규칙 17).

**프런트엔드**
- `src/frontend/m-mdm/pages/dmc/codeCateEdit/page.tsx`, `api.ts`, `types.ts`, `transfer.ts`(순수 transfer-list 로직 — 검색·attr/lvl1 필터·Shift 범위선택·전체선택·이동을 Set 기반으로, 1,000건에서도 목록 전체를 매번 다시 스캔하지 않도록 함, §5 불변 규칙 17 FE 쪽), `components/CategoryListPanel.tsx`(좌측 목록+추가 폼, BASE 는 편집·닫기 버튼 자체를 렌더링하지 않음), `components/RegexEditPanel.tsx`(defExpr·defTarget 입력 + 읽기전용 일치/불일치 두 목록), `components/TransferListPanel.tsx`(좌/우 패널, 전체선택 체크박스+건수, 검색, attr/lvl1 필터, `.tf-i`/`.tf-g` 상당의 `data-testid`, `>`/`>>`/`<`/`<<`), `components/PreviewPanel.tsx`(카테고리 편집 전용 — codeItemEdit 의 읽기전용 `PreviewPanel.tsx` 는 편집 기능이 없어 그대로 재사용하지 않고 모양만 참고해 새로 만든다), `components/styles.ts`.
- `src/frontend/m-mdm/tests/dmc/codeCateEdit/transfer.test.ts`(1,000건 성능 포함), `page-render.test.ts`, `grid-state.test.ts` 상당(Build 가 codeItemEdit 의 테스트 파일 목록을 그대로 벤치마크로 삼는다).
- `src/frontend/e2e/mdm-codeCateEdit.spec.ts` — 스모크 4종(§3).
- `src/frontend/e2e/fixtures/mdm-codeCateEdit.sql` — DRAFT 소유 마루 코드 1건 + `TB_MDM_CODE_CATE` 에 **BASE 행을 직접 INSERT**(REGEX·`.*`·CODE, from_ver=1.000, to_ver=9999 — 픽스처는 `createBaseCategory` 서비스 경로를 타지 않고 SQL 로 직접 넣으므로 빠뜨리면 BASE 숨김 검증(수용 기준 2) 자체가 무의미해진다) + REGEX/TABLE 카테고리 각 1개 + 코드 1,000건(성능 시나리오용, 나머지 스모크는 소수 코드로 충분)을 `WITH RECURSIVE` 로 생성.

**화면 설계 산출물(mdm 관례, 06-02/06-03 D11/F26 선례 계승 — 5종 대신 기능설계서 1종)**
- `docs/mdm/screens/codeCateEdit/codeCateEdit_기능설계서.md` — 템플릿 `docs/guide/design/templates/기능설계서.template.md` 구조. 근거 칸은 04 원천 행 번호(카테고리 정의 방식 절)·시안 탭5·6 행 번호·이 design.md 절 번호. 내용은 본 문서 §1·§3의 화면 명세를 옮긴다.
- `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` §A.3.2 표에 `codeCateEdit` 행 추가(`codeMng`·`codeEdit` 행 추가 선례, TSK-06-02 design.md 136행 형식 그대로: `— (To-Be only) | mdm | dmc | codeCateEdit | <오늘 날짜> | … TSK-06-04. 기능설계서 1종(docs/mdm/screens/codeCateEdit/)`).

### 수정

- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/mastercode/DefaultMasterCodeSegmentService.java` — 5개 스텁 줄 + `revert` 의 `case CATE` 를 `MasterCodeCateSegmentOps` 위임으로 교체(생성자에 새 컴포넌트 주입 추가).
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/mastercode/MasterCodeItemSegmentOpsSqliteTest.java` — 이 Task 몫 `UnsupportedOperationException` 단언 두 곳(약 253-256행 `revert(CATE)`, 349-353행 5개 메서드)을 지운다. 06-02 몫 단언(`createBaseCategory`·`fillFrom`)은 그대로 둔다 — 총 테스트 수는 줄지 않아야 하므로(게이트 "총수 미감소"), 지운 만큼을 위 신규 `MasterCodeCateSegmentOpsSqliteTest` 가 실동작 테스트로 흡수한다.
- `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` — `seedMdmMenus()` 안에 `seedMdmCodeCateEditMenu()` 호출 한 줄 + 그 private 메서드(06-03 `seedMdmCodeItemEditMenu()` 복제, menuSeq=004, group `dmc`).
- `src/frontend/m-mdm/tsup.config.ts` — `"pages/dmc/codeCateEdit/page": "pages/dmc/codeCateEdit/page.tsx"` entry 한 줄 추가.
- `src/frontend/m-mdm/pages/dmc/codeEdit/page.tsx` — `ver-item-edit` 버튼 옆에 `ver-cate-edit` 버튼(`onClick={() => moveTo("dmc/codeCateEdit")}`) 추가(§"담당자 확인 필요 결정" D5).
- `src/frontend/m-mdm/pages/dmc/codeEdit/buttons.ts` — `VersionButtons` 에 `cateEdit: VersionButtonState` 필드 추가, `cateEdit: on(mine && single)`(`itemEdit` 과 동일 게이팅).
- `docs/mdm/decisions.md` — D2·D6 을 임시 ID `D-TSK-06-04-1`·`D-TSK-06-04-2` 로 append(아래 §"담당자 확인 필요 결정" 참고, 전역 번호는 매기지 않는다).

## 3. 테스트 전략

- **백엔드 단위/통합(SQLite only)**: 위 §2 신규 파일 5종(`MasterCodeCateSegmentOpsSqliteTest`·`CodeCateEditServiceSqliteTest`·`CodeCateEditOasisHttpTest`·`CodeCateEditBpmnActionTest`·`CodeCateEditPerformanceSqliteTest`)이 정본이다. 전부 `src/backend/mdm/api/src/test/java/...`(SqliteTest 접미는 기존 관례상 실제로는 대부분 in-memory/temp sqlite 파일을 쓰는 통합 테스트다). MSSQL 방언 테스트는 스키마 변경이 없으므로 이번 Task 대상이 아니다(§"도커 금지로 생략한 검증").
- **프런트 vitest**: `pnpm --filter @dk-oasis/m-mdm test` 대상에 `tests/dmc/codeCateEdit/*.test.ts` 를 추가한다. `transfer.ts` 는 codeItemEdit 의 `code-tree.ts`/`grid-state.ts` 테스트만큼 순수 함수 단위로 촘촘히 짠다(검색·필터·Shift 범위·전체선택·이동 각각, 그리고 1,000건 배열에서 이동 함수 호출이 특정 시간 안(예: 200ms, 서버 왕복을 포함하지 않는 클라이언트 전용 예산) 끝나는지).
- **브라우저 E2E — `src/frontend/e2e/mdm-codeCateEdit.spec.ts`**(스모크 넷, dev-discipline 「화면 작업의 브라우저 E2E」 필수):
  1. 메뉴(MDM > 마스터코드 > 카테고리 편집)에서 화면 진입.
  2. 목록이 서버 데이터로 채워짐(카테고리 목록 REGEX 1개·TABLE 1개) / 빈 상태(카테고리가 BASE 뿐인 새 마루 코드).
  3. 등록·수정 한 번이 화면 조작만으로 끝나 목록에 반영 — TABLE 카테고리에 코드 1건을 `>` 로 옮기고 저장 → 소속 목록 갱신 확인.
  4. 서버 오류 시 화면에 오류 표시 — 정규식 문법 오류(`(` 미닫힘)를 넣고 저장 시도 → 오류 문구 노출.
  추가로 수용 기준 1(정규식 문법 오류 거부)·2(BASE 편집·닫기 버튼 비노출+서버 거부)·5(없는 코드 소속 저장 거부, TABLE 은 코드를 직접 타이핑하는 칸이 없어 화면에서는 유발 불가하므로 이 케이스는 서비스 단위 테스트로만 검증)를 스모크 4종에 자연스럽게 얹거나 별 케이스로 보탠다. 스크린샷은 `docs/mdm/tasks/TSK-06-04/screens/*.png` 로 남긴다.
  서버 기동은 §"서버·E2E 기동 방법"을 따른다(`be-run.sh`/`fe-run.sh` 금지, 새 포트 3개 직접 기동).
- **oasis-contract-check**: 커밋 전 `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` ERROR 0 필수(신규 BPMN 대상).
- **mantine-aggrid-ui**: 새/수정 FE 파일에 대해 스킬의 audit 두 개 0건.

## 4. 수용 기준 매핑

| # | 수용 기준 | 검증 방법 |
|---|---|---|
| 1 | 정규식 문법 오류 저장 거부 | `CodeCateEditServiceSqliteTest`(validate·save 모두 `Pattern.compile` 실패 시 `MasterCodeCateIssueCode.INVALID_REGEX` 로 MDM022 거부) + E2E 스모크 4(오류 표시) |
| 2 | BASE 편집·닫기 불가(화면·서버) | 서버: `MasterCodeCateSegmentOpsSqliteTest`(`addCategory`/`changeCategory`/`closeCategory`/`revert(CATE,"BASE")` 전부 MDM012). 화면: `CategoryListPanel.tsx` 가 `cateId==="BASE"` 면 편집·닫기 버튼을 렌더링하지 않음 — FE 컴포넌트 테스트(`page-render.test.ts` 상당)로 버튼 부재를 단언 |
| 3 | 포털 메뉴에서 화면이 열리고 e2e `mdm-codeCateEdit.spec.ts` 통과 | 메뉴 시드(`DataInitializer.seedMdmCodeCateEditMenu`) + E2E 스모크 1(메뉴 진입) + 전체 스펙 통과 |
| 4 | 코드 1,000건에서 이동·저장이 1초 이내 | 측정 방법(예산을 이동 200ms + 저장 800ms 로 나눠 합이 1,000ms 를 넘지 않게 한다 — 아래 D4 참고): (a) 이동 — FE vitest `transfer.test.ts` 가 1,000건 배열에서 `moveSelected`/`moveAllVisible` 호출 시간을 측정(서버 왕복 없는 순수 연산, 200ms 이내). (b) 저장 — `CodeCateEditPerformanceSqliteTest` 가 `TermRecommendPerformanceTest` 패턴대로(워밍업 1회 후 중앙값 측정) JDBC 배치로 `TB_MDM_CODE_ITEM` 1,000행을 직접 시딩한 뒤(서비스 `save` 경로를 타지 않는 시딩과, 측정 대상인 `CodeCateEditService.save` 호출은 구분한다) **`CodeCateEditService.save` 전체**(프로젝션+검사+세그먼트 쓰기 포함, OASIS 봉투·HTTP 왕복만 제외 — `MasterCodeCateSegmentOps` 메서드 단독 호출이 아니라 서비스 계층까지 포함해야 실제 저장 경로의 비용을 잰다) 호출 시간을 측정해 800ms 이내 단언. E2E 로 전체 왕복(네트워크+React 렌더 포함) 1초를 재는 단언은 넣지 않는다(CI 변동성 때문 — §"담당자 확인 필요 결정" D4가 이 갭을 명시한다) |
| 5 | 소속 코드는 유효 코드여야 저장 | `MasterCodeCateSegmentOpsSqliteTest`(`addCategoryMembers` 에 그 버전에 없는 코드가 섞이면 `MEMBER_CODE_NOT_FOUND` 로 전체 거부, `removeCategoryMembers` 는 검사 없이 허용) |

이번 Task 는 도커 금지로 확인하지 못하는 수용 기준이 없다(전부 SQLite·vitest·Playwright 로 검증 가능).

## 5. 불변 규칙

각 규칙 뒤 괄호가 대상 테스트다 — Build 는 이 테스트만으로 그 규칙의 변이(mutation)를 잡는다.

1. **정의 종류(REGEX/TABLE)는 카테고리 생성 뒤 바꿀 수 없다.** `changeCategory` 가 저장된 defKind 와 다른 defKind 로 오면 `MasterCodeCateIssueCode.DEF_KIND_IMMUTABLE` 로 거부한다(defKind 전환 시 잔여 CATE_ITEM 처리 규칙이 원천 문서에 없음, D3). (`MasterCodeCateSegmentOpsSqliteTest#defKind_변경은_거부한다`)
2. **BASE(cate_id="BASE")는 추가·수정·닫기·되돌리기 대상이 아니다(MDM012, `CategoryConventions.BASE_CATE_ID`).** `addCategory`(cate_id="BASE")·`changeCategory`·`closeCategory`·`revert(CATE,"BASE")` 모두 `MdmErrorCode.RESERVED_CATEGORY`. (`MasterCodeCateSegmentOpsSqliteTest#BASE_는_모든_조작에_MDM012`)
3. **REGEX 의 def_target 은 `CategoryOwner.MASTER_CODE.allowedDefTargets()` 안에서만 고른다(전사 계약 재사용, 새 목록 만들지 않음).** (`MasterCodeCateSegmentOpsSqliteTest#허용되지_않는_defTarget_은_거부한다`)
4. **REGEX defExpr 문법 오류는 저장을 막는다.** `MasterCodeCategoryResolver` 와 같은 기준(`Pattern.compile` 실패)으로 판정하고 새 정규식 엔진을 만들지 않는다. (`CodeCateEditServiceSqliteTest#정규식_문법_오류는_validate_save_모두_거부`)
5. **TABLE 소속에 넣는 코드는 그 버전에 유효해야 한다. 뺄 때는 유효성 검사를 하지 않는다(고아 소속 정리 허용).** (`MasterCodeCateSegmentOpsSqliteTest#없는_코드_addCategoryMembers_거부`, `#없는_코드도_removeCategoryMembers_허용`)
6. **카테고리 판정(REGEX 전체일치·TABLE 교집합) 로직은 `MasterCodeCategoryResolver` 하나뿐이다.** `preview`/`save`/화면 어디서도 재구현하지 않는다(엔진 모듈 `maru-mdm-engine.DefaultCodeResolver` 는 대조 기준이 의도적으로 다른 별개 구현이라 여기서 참고하지 않는다). 전체 일치·NULL 대상 칸 등 판정 자체의 변이는 기존 `MasterCodeCategoryResolverTest`(`src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/mastercode/MasterCodeCategoryResolverTest.java`, 확인함)가 이미 잡는다 — 이 Task 는 그 테스트를 건드리지 않고, `CodeCateEditServiceSqliteTest#preview_는_Resolver_호출_결과의_필드를_그대로_옮긴다`(신규, `resolve()` 를 스텁/스파이 없이 실제로 태우고 응답 JSON 의 hitCount·rows·invalidExpression 이 `Resolution` 값과 1:1인지 대조 — "그대로 반환"을 패스스루가 아니라 필드 매핑 오류까지 잡도록 값 대조로 검증)로 서비스 계층의 매핑만 추가로 잡는다.
7. **카테고리·소속 조작은 DRAFT 버전에서만 한다(그 외 MDM002).** (`MasterCodeCateSegmentOpsSqliteTest#RELEASED_CANCELLED_버전은_MDM002`)
8. **이 계층은 ROW_VERSION 을 받지도 올리지도 않는다 — 호출자(`CodeCateEditService`)가 같은 트랜잭션에서 먼저 `VersionWriteGuard.beginDraftWrite` 를 부른다(이중 증가 방지).** (`CodeCateEditServiceSqliteTest#검사_실패시_rowVersion_이_그대로다`)
9. **한 버전에 같은 cate_id 의 유효 행은 하나뿐이다.** 이미 유효한 cate_id 로 `addCategory` 하면 거부(`CATE_ID_OVERLAP`). (`MasterCodeCateSegmentOpsSqliteTest#이미_있는_cate_id_addCategory_거부`)
10. **새 카테고리·소속 행의 to_ver 는 항상 `MasterCodeConventions.OPEN_TO_VER`(9999)다.** (9번 테스트에 카테고리 행 단언 포함 + `MasterCodeCateSegmentOpsSqliteTest#addCategoryMembers_로_넣은_소속_행의_to_ver_는_9999다`(신규, 멤버 행 별도 단언 — 카테고리 행 검사만으로는 멤버 행의 to_ver 를 잡지 못한다))
11. **같은 버전(V) 안에서 그 V 에 새로 추가한 카테고리·소속을 다시 빼면 닫지 않고 삭제한다. V 이전부터 있던 것을 빼면 to_ver=V 로 닫는다(`changeItem`/`removeItem` 패턴 계승).** (`MasterCodeCateSegmentOpsSqliteTest#V_에서_추가한_것은_삭제되고_이전_것은_닫힌다`)
12. **카테고리를 닫으면(closeCategory) 그 카테고리의 TABLE 소속 중 V 에 열려 있던 행을 모두 같은 V 로 닫는다(연쇄).** (`MasterCodeCateSegmentOpsSqliteTest#closeCategory_는_열린_소속을_연쇄로_닫는다`)
13. **카테고리 되돌리기(revert CATE)는 12번의 연쇄로 닫혔던 소속도 함께 다시 연다(`reopenCascade` 대칭).** (`MasterCodeCateSegmentOpsSqliteTest#카테고리_되돌리기는_연쇄로_닫힌_소속을_다시_연다`)
14. **cate_id 는 점·콤마·공백을 포함할 수 없다(`MaruIdRules.FORBIDDEN_CHAR_PATTERN` 재사용, 새 패턴 만들지 않음).** (`MasterCodeCateSegmentOpsSqliteTest#cate_id_금지문자_거부`)
15. **`preview`(compare 액션)는 쓰기를 하지 않는다 — 저장 전 후보 정의를 받아도 DB 행 수를 바꾸지 않는다.** (`CodeCateEditServiceSqliteTest#preview_전후_행_개수가_같다`)
16. **`MasterCodeSegmentService` 구현 빈은 `DefaultMasterCodeSegmentService` 하나뿐이다 — 새 구현 클래스를 만들지 않고, 새 로직은 위임 컴포넌트(`MasterCodeCateSegmentOps`)로만 둔다(D2 머지 해소 규칙 계승).** `MasterCodeContractTest`(순수 리플렉션, Spring 컨텍스트 없음, 확인함)는 이 규칙을 잡지 못한다 — `CodeCateEditOasisHttpTest`(어차피 `@SpringBootTest` 로 전체 컨텍스트를 띄운다)에 `applicationContext.getBeansOfType(MasterCodeSegmentService.class)` 크기가 1인지 보는 단언을 하나 추가한다. (`CodeCateEditOasisHttpTest#MasterCodeSegmentService_구현빈은_하나다`, 신규)
17. **코드 1,000건에서 소속 이동·저장은 1초 이내다(측정 범위는 §4 수용 기준 4 그대로 — 이동 200ms/FE vitest, 저장 800ms/`CodeCateEditService.save` 전체).** (`CodeCateEditPerformanceSqliteTest`, `transfer.test.ts`)

## 도커 금지로 생략한 검증

- 금지 모드 출처: 사용자 지침(SQLite 만 테스트, 도커 금지)
- 해당 없음 — 이번 Task 는 Flyway 마이그레이션을 추가하지 않는다. `TB_MDM_CODE_CATE`·`TB_MDM_CODE_CATE_ITEM` 은 V9(`V9__create_mdm_master_code.sql`, sqlite·mssql 짝)의 기존 칼럼(`DEF_KIND`·`DEF_EXPR`·`DEF_TARGET`·`FROM_VER`·`TO_VER`)을 그대로 쓴다. 스키마 변경이 없으므로 `mssqlMigrationTest`·MSSQL 실측 대상 자체가 없다.

## 담당자 확인 필요 결정

- **D1 — entry-point 오탈자**: 질문: spec.md 의 `mdc/codeCateEdit` 를 그대로 쓰나, 아니면 `dmc`(마스터코드 그룹)로 고치나. 선택지: (a) `mdc` 그대로 (b) `dmc` 로 정정. 결정: (b). 근거: `docs/mdm/screens/README.md` §3 이 `codeCateEdit` 를 그룹 `dmc` 에 등재했고, 형제 Task TSK-06-02·06-03 의 design.md 가 이미 같은 오탈자를 각각 정정한 선례가 있다(`MdmOasisConventions.GROUP_CODE_PATTERN="^dm[a-z]$"` 는 애초에 `mdc` 를 허용하지 않는다). 반려 시 재작업: BE 패키지(`dmc→mdc`)·BPMN 경로·FE 폴더·메뉴 `OBJECT_ID`·serviceId 전체를 동시에 리네임해야 한다(전 파일 목록에 영향).
- **D2 — BPMN action 집합**: 질문: `addCategory`/`closeCategory`/`addCategoryMembers` 같은 세부 액션을 새로 만드나. 선택지: (a) 세부 액션 신설 (b) 기존 6액션(search/view/compare/validate/save/restore)만 쓰고 카테고리·소속 변경은 `save` 의 두 그리드(categories/members) diff 로 흡수. 결정: (b). 근거: `MdmActions` 는 닫힌 16개 상수 집합이고 `DmcBpmnActionTest`류가 BPMN 분기 이름이 그 상수 밖이면 실패하게 만들어 뒀다 — 세부 액션을 추가하려면 `MdmActions` 에 상수를 더해야 하는데 이는 전 mdm 화면이 공유하는 파일이라 형제 Task(TSK-07-02 `dataCateEdit` 도 같은 카테고리 계약을 쓸 예정)와 충돌 위험이 크다. `codeItemEdit.bpmn` 이 이미 코드 행 추가·수정·삭제를 `save` 하나로 처리하는 선례와도 일관된다. 반려 시 재작업: `MdmActions` 에 상수 추가 + `MdmPermissions` EDIT 세트 반영 + BPMN 분기 재설계(범위 확대, 공유 파일 변경 필요 — `docs/mdm/decisions.md` 에도 별도 기록 필요). 공용 기록: `docs/mdm/decisions.md` 에 `D-TSK-06-04-1` 로 append(다른 카테고리 화면 Task 가 참고할 수 있게).
- **D3 — defKind 전환 허용 여부**: 질문: `changeCategory` 로 REGEX↔TABLE 전환을 허용하나. 선택지: (a) 허용(전환 시 매치되던 코드를 초기 멤버로 자동 채움) (b) 금지. 결정: (b). 근거: 원천 04 설계서에 전환 절차·초기 멤버 규칙이 없고, spec 수용 기준에도 전환 요구가 없다 — 범위 밖 기능을 만들지 않는다. 반려 시 재작업: 전환 로직 추가(자동 멤버 채움 규칙 신규 설계 필요, 범위 확대).
- **D4 — 성능 측정 방법**: 질문: "1,000건에서 이동·저장 1초 이내"를 어떻게 재현성 있게 재나. 선택지: (a) E2E Playwright 로 전체 왕복 시간 단언 (b) 백엔드 서비스 메서드 호출 시간(저장)과 FE 순수 함수 호출 시간(이동)을 나눠 단위/vitest 로 측정. 결정: (b), 예산은 이동 200ms + 저장 800ms. 근거: `TermRecommendPerformanceTest` 선례가 이미 "OASIS 봉투·HTTP·네트워크 왕복은 포함하지 않는다"는 원칙을 세워 뒀고, E2E 타이밍 단언은 CI 환경 변동으로 flaky 하다. **알려진 갭**: (b)는 1,000행 ag-grid 렌더링(React commit) 시간을 재지 않는다 — 순수 로직과 화면 그리기는 별개 비용이라 vitest(jsdom)로는 실제 렌더 비용을 신뢰성 있게 재현하기 어렵다. E2E `mdm-codeCateEdit.spec.ts` 가 1,000건 픽스처를 이미 갖고 있으니, Build 는 게이팅 단언 없이 1회성 참고 타이밍(콘솔 로그 또는 테스트 주석)만 남겨 실제 체감 성능을 남긴다. 반려 시 재작업: E2E 스펙에 `page.evaluate` 기반 타이머를 추가하고 CI 재시도 전략을 별도로 마련해야 한다.
- **D5 — codeEdit 화면의 카테고리 편집 이동 버튼**: 질문: `codeEdit/page.tsx` 에 `코드 편집`(`ver-item-edit`) 옆 `카테고리 편집` 버튼을 추가하나. 선택지: (a) 추가 (b) 생략(포털 메뉴 진입만 지원). 결정: (a). 근거: `codeItemEdit` 선례가 버전 컨텍스트(maruCodeId+ver)를 URL 로 넘기는 유일한 통로이고, 포털 메뉴 진입만으로는 "이 버전을" 이라는 맥락을 못 넘긴다. 게이팅은 `itemEdit` 과 동일(`mine && single`, `buttons.ts`). 반려 시 재작업: codeCateEdit 화면 자체에 마루코드+버전 선택 UI를 새로 만들어야 한다(중복 구현, 화면 진입 경로가 메뉴 하나뿐이라 UX 저하).
- **D6 — 새 오류 코드를 만드나**: 질문: 카테고리 저장 거부를 위해 `MdmErrorCode` 에 새 값(MDM024)을 추가하나. 선택지: (a) 신설 (b) 기존 `CODE_SAVE_REJECTED`(MDM022)를 우산으로 재사용하고 세부는 새 이슈 코드 enum(`MasterCodeCateIssueCode`)에만 담는다. 결정: (b). 근거: `MdmErrorCode` 는 여러 Task 가 동시에 다음 번호를 채번하는 공유 파일이라 병렬 머지 충돌 위험이 크다(D-093 의 "한 Task 만 같은 줄을 고쳐 병렬 머지 충돌을 없앤다" 원칙과 동일). `CODE_SAVE_REJECTED` 는 이미 "세부는 이슈 코드로 싣는다"는 계약으로 설계돼 카테고리 이슈에도 그대로 맞는다. 반려 시 재작업: `MdmErrorCode` 에 MDM024 추가 + 그 항목의 httpStatus·transport·기본 메시지 재검토, 머지 시 번호 재조정 가능성. 공용 기록: `docs/mdm/decisions.md` 에 `D-TSK-06-04-2` 로 append.

## 탐색에서 얻은 관례·함정·기존 유틸

- **재사용해야 할 것, 새로 만들면 안 되는 것**: `CategoryDefinition`/`CategoryOwner`/`CategoryDefTarget`/`CategoryKind`/`CategoryConventions`(전사, `contract/category/`), `MasterCodeCategoryResolver`(판정), `MasterCodeSegmentKey`/`MasterCodeSegmentTable`(되돌리기 키), `MasterCodeConventions`(OPEN_TO_VER 등), `MaruIdRules.FORBIDDEN_CHAR_PATTERN`(cate_id 금지문자), `MasterCodeRejections.saveRejected`(이슈 우산). `DefaultMasterCodeSegmentService` 는 형제 Task 와 공유하는 유일 구현 빈이다 — 새 구현 클래스를 만들지 않는다(D2 머지 해소 규칙, 파일 상단 Javadoc 참고).
- **함정 1 — 06-02 스텁 잔존**: `DefaultMasterCodeSegmentService.createBaseCategory`/`fillFrom` 은 이 워크트리 기준(= origin/dev 기준, `git log HEAD..origin/dev` 0건으로 divergence 없음 확인) 여전히 `UnsupportedOperationException("TSK-06-02 가 구현한다")` 를 던진다. 그런데 실제 구현은 `MasterCodeVersionSegments.createBaseCategory` 에 이미 있다 — 06-02 가 아직 `DefaultMasterCodeSegmentService` 로 배선(위임)을 안 끝낸 상태로 보인다. **이건 06-02 몫이니 손대지 않는다.** 다만 우리가 5개 스텁+`revert(CATE)` 를 배선할 때 같은 생성자를 고치므로 병합 충돌 가능성이 있다 — Build 는 착수 직전 `git fetch && git log HEAD..origin/dev` 로 한 번 더 확인한다.
- **함정 2 — `MasterCodeItemSegmentOpsSqliteTest` 총수 유지**: 이 Task 몫 `assertUnsupported("TSK-06-04", …)` 단언을 지우면 테스트 총수가 줄어든다(게이트: "총수 미감소"). 지운 만큼(2곳: `revert(CATE)` 1개, 5개 메서드 묶음 1개 — 실제로는 이 파일 안에서 여러 개별 `@Test` 가 아니라 한두 메서드 안에 묶여 있으므로 정확한 개수는 Build 가 실제 파일을 보고 확인) 신규 `MasterCodeCateSegmentOpsSqliteTest` 가 그 이상으로 채운다.
- **함정 3 — OASIS 서비스에 `@Transactional` 금지(F9)**: 붙이면 CGLIB 프록시가 파라미터 이름을 지워 `ParameterName must not be null` 로 죽는다. `CodeItemEditService` 의 관례를 그대로 따른다.
- **함정 4 — `saveAndFlush` 반복 호출의 성능 비용**: `MasterCodeItemSegmentOps` 는 PK 재사용(같은 트랜잭션에서 지웠다 다시 넣기) 문제 때문에 행마다 `saveAndFlush`+개별 flush 를 강제한다. 카테고리 소속 1,000건 이동처럼 대량이면서 같은 키 재사용이 없는 경우까지 매 행 flush 하면 성능 기준(불변 규칙 17)을 못 맞출 위험이 크다 — `MasterCodeCateSegmentOps.addCategoryMembers`/`removeCategoryMembers` 는 삭제(또는 닫기) 배치 → 한 번 flush → 추가 배치 → 한 번 flush, 두 단계로만 나눠 처리한다(같은 트랜잭션 안에서 같은 (cateId,code) 가 "뺐다 다시 넣기"로 오는 극단 케이스만 이 순서로 정확하다). `CactusAuditEntity` 는 `Persistable` 을 구현하지 않으므로(확인함) 신규 엔티티에 `repository.save`/`saveAndFlush` 를 쓰면 Hibernate 가 SELECT-then-INSERT(merge)로 처리해 행마다 왕복이 늘어난다 — 신규 행은 가능하면 `EntityManager.persist()` 로 등록하는 것을 검토한다(Build 판단, 다만 `MdmCodeCateItemRepository` 가 `JpaRepository` 라 이 최적화가 어색하면 배치 flush 만으로도 충분한지 성능 테스트로 먼저 확인).
- **함정 5 — 시안(HTML) 로직은 참고용 스텁**: `evalCate`(JS `RegExp`)·`resolve` 는 원천 설계서(04:183)가 명시한 "화면은 정규식을 실행하지 않는다"와 어긋난다. 이식하지 않는다. 시안의 정렬 기준(계층 있는 마루 코드는 lvl 경로 우선)도 서버 `MasterCodeCategoryResolver.ITEM_ORDER`(seq 우선)와 다르다 — 화면은 서버가 내려준 순서를 그대로 쓴다.
- **재사용 유틸**: FE `apiRequest`(`@dk-oasis/shared/http`), `unwrap`(cactus 봉투 해제, `codeItemEdit/api.ts` 상단에 있는 패턴 그대로 복제), `AgDataGrid`/`Select`/`Radio`(`@dk-oasis/shared/*`).
- **RBAC**: 새 역할 필요 없음. `MDM_STD_ADMIN→PERM_MDM_READ`, `MDM_STEWARD→PERM_MDM_EDIT`(수정 액션인 save/restore), 나머지(search/view/compare/validate)는 READ 세트. `src/frontend/e2e/fixtures/mdm-rbac-seed-check.expected.txt` 는 화면별 항목을 나열하지 않는 파일이라(확인함) 수정 불필요.
- **DRAFT 삭제 시 CATE·CATE_ITEM 복구**: `MasterCodeDraftDeletion` 이 이미 `ITEM`·`CATE_ITEM`·`CATE` 세 표를 모두 다루는 목록을 갖고 있다(확인함) — 이 Task 가 추가로 손댈 것이 없다.
- **`page-registry.ts` 는 자동 생성 파일**: `src/frontend/m-mcm/lib/generated/page-registry.ts` 는 `scripts/generate-page-registry.mjs` 가 `page-components/**/page.tsx` 를 글롭해 만든다(파일 상단 "AUTO-GENERATED … do not edit manually"). `pages/dmc/codeCateEdit/page.tsx` 를 만들면 prebuild/predev 훅이 자동으로 다시 생성한다 — 손으로 고치지 않는다.

## 서버·E2E 기동 방법

`be-run.sh`/`fe-run.sh` 를 쓰지 않는다(관례). TSK-06-03 이 mcm BE 18603·mdm BE 18696·FE 15603 을 썼으므로 겹치지 않게 다음을 기본값으로 삼되, 착수 직전 `lsof -i :<port>` 로 세 포트가 비었는지 반드시 다시 확인한다(다른 병렬 워커가 먼저 잡았을 수 있다):

- mcm BE: `18604`, mdm BE: `18697`, FE: `15604`

기동 순서(TSK-06-03 design.md §4.11 그대로):

```
cd $WORKTREE/src/backend/mcm && JAVA_HOME=$JAVA_HOME ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18604 --mcm.bff.invalidate-role-url=... --cactus.notify.publish-url=...'
cd $WORKTREE/src/backend/mdm && JAVA_HOME=$JAVA_HOME ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18697'
cd $WORKTREE/src/frontend/m-mcm && AUTH_SECRET=... NEXTAUTH_URL=http://127.0.0.1:15604 ... \
  MCM_WAS_URL=http://127.0.0.1:18604 MDM_WAS_URL=http://127.0.0.1:18697 BACKEND_API_URL=http://127.0.0.1:18604 ... \
  pnpm exec next dev --turbopack --port 15604
cd $WORKTREE/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15604 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  heavy.sh pnpm exec playwright test e2e/mdm-codeCateEdit.spec.ts --workers=1
```

- mcm.db/mdm.db 는 새로 시작(기존 파일은 `mv` 로 보존), mdm 기동(Flyway 적용) 뒤에만 `sqlite3 mdm.db < e2e/fixtures/mdm-codeCateEdit.sql` 로 픽스처 주입.
- 무거운 명령(`gradlew`·`playwright test` 등)은 반드시 `heavy.sh` 로 감싸고, `HEAVY_BUSY`(exit 75)면 다시 부른다. `run_in_background` 금지.
- 종료 시 PID 파일 기반 kill, 다른 Task 가 만든 스크린샷·`next-env.d.ts`·`test-results` 는 `git checkout --` 로 복원(TSK-06-03 관례 계승).
- Playwright 는 이미 스캐폴드에 설치돼 있다(추가 설치 불필요, TSK-06-03 이 이미 이 러너를 썼다).

## Build 이탈과 보강 (Phase 03, 2026-09-24)

설계에서 벗어난 점과 설계에 없던 보강이다.

| # | 이탈·보강 | 사유 |
|---|---|---|
| B1 | `MasterCodeCateSegmentOps.addCategoryMembers`/`removeCategoryMembers` 를 설계 초안(행마다 `saveAndFlush`)이 아니라 배치 저장 → 한 번 flush 로 짰다(§2 함정 4의 "우선 배치 flush 만으로 충분한지 확인" 권고를 그대로 따름) | 1,000건 소속 이동 성능(불변 규칙 17)을 위해서다. `EntityManager.persist()` 전환까지는 필요 없었다(§"변이 검증 기록" 17 참고) |
| B2 | `CodeCateEditService.save()` 에 categories·members 그리드가 BASE 를 겨냥하면 `beginDraftWrite` 전에 먼저 MDM012 로 거른다(설계에 명시되지 않은 보강) | Ops 층의 BASE 보호만 믿으면 검사 통과 후 `beginDraftWrite` 가 이미 ROW_VERSION 을 올린 뒤에 Ops 가 던져, "거부된 저장은 ROW_VERSION 을 건드리지 않는다" 관례(§6.6 저장 순서 원칙)가 깨진다 |
| B3 | `codeEdit` 화면의 `카테고리 편집` 버튼(D5)이 이동한 뒤 되돌아오는 경로, 그리고 저장된(서버 반영) 카테고리 변경 한 건을 되돌리는 화면 버튼(restore UI)은 만들지 않았다 — `api.ts` 의 `revertCategory` 는 두고 화면에서 부르지 않는다 | dev-discipline 스모크 4종·수용 기준 어디에도 화면에서 되돌리기를 요구하지 않는다(BE `revert` 액션 자체는 Ops·Service·HTTP 세 층에서 모두 테스트함). 범위를 넓히지 않았다 |
| B4 | REGEX 미리보기(`compare`)의 `cateId` 는 신규/편집 중 카테고리면 `null` 로 보낸다(설계 문구 "저장 전이면 아직 없는 cateId 후보도 가능"을 `null` 로 구현) | 신규 카테고리는 서버에 cateId 가 아직 없어 `MasterCodeCateRow.definition().cateId()` 가 있어도 없어도 `resolve()` 결과에 영향이 없다(CATEGORY_EMPTY 경고의 itemKey 로만 쓰임) |

**변이 검증에서 잡지 못한 것(보고 대상)**: 불변 규칙 17(성능, 저장 쪽)의 변이 — `addCategoryMembers` 를 배치 저장(B1)에서
행마다 `saveAndFlush` 로 되돌리는 변이는 `CodeCateEditPerformanceSqliteTest` 에서 빨강이 되지 않는다. 실측: 배치 구현
중앙값 76ms([74,76,76,86,111]), 행마다 flush 로 되돌린 변이 중앙값 120ms([66,67,120,236,292]) — 둘 다 예산 800ms 에
크게 못 미친다. 이 워크스테이션의 SQLite 는 1,000행 규모에서 두 구현의 차이가 커밋 방식(flush 배치 vs 개별)만으로는
800ms 예산을 넘길 만큼 벌어지지 않는다(둘 다 0.1초대). 예산을 좁혀 억지로 갈라놓으면 표본이 겹치는 구간이 있어([66,67]
이 배치 구현의 [74,76,76] 보다 오히려 빠른 샘플도 나옴) CI 에서 flaky 해질 위험이 커서, 800ms 예산은 그대로 두고 이
간극을 보고로 남긴다(은폐 금지). 배치 저장 자체는 설계 함정 4의 권고를 따른 것이라 되돌리지 않는다.

## Build 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| 1 defKind 불변 | `changeCategory` 의 defKind 불일치 검사를 `if (false)` 로 비활성화 | `MasterCodeCateSegmentOpsSqliteTest#defKind_변경은_거부한다` | 잡힘 |
| 2 BASE 보호 | `requireNotBase` 의 BASE 판정을 `if (false)` 로 비활성화 | `MasterCodeCateSegmentOpsSqliteTest#BASE_는_모든_조작에_MDM012` | 잡힘 |
| 3 defTarget 허용 목록 | `MasterCodeCateChecks.checkDefinition` 의 defTarget 허용 판정을 `if (false)` 로 비활성화 | `MasterCodeCateSegmentOpsSqliteTest#허용되지_않는_defTarget_은_거부한다` | 잡힘 |
| 4 defExpr 문법 | `checkDefinition` 의 `!validRegex(...)` 판정을 `if (false)` 로 비활성화 | `CodeCateEditServiceSqliteTest#정규식_문법_오류는_validate_save_모두_거부` | 잡힘 |
| 5 소속 코드 유효성(add) | `addCategoryMembers` 의 `missing` 거부 분기를 `if (false)` 로 비활성화 | `MasterCodeCateSegmentOpsSqliteTest#없는_코드_addCategoryMembers_거부` | 잡힘 |
| 6 Resolver 패스스루 | `CodeCateEditService.preview` 의 `result.put("hitCount", r.hitCount())` 를 `r.total()` 로 바꿔 매핑 오류를 흉내 | `CodeCateEditServiceSqliteTest#preview_는_Resolver_호출_결과의_필드를_그대로_옮긴다` | 잡힘 |
| 7 DRAFT 전용 | `requireDraft` 의 상태 판정을 `if (false)` 로 비활성화 | `MasterCodeCateSegmentOpsSqliteTest#RELEASED_CANCELLED_버전은_MDM002` | 잡힘 |
| 8 rowVersion 불변(검사 우선) | `save()` 의 `if (!projected.issues().isEmpty())` 를 `if (false)` 로 비활성화 | `CodeCateEditServiceSqliteTest#검사_실패시_rowVersion_이_그대로다` | 잡힘 |
| 9 cate_id overlap | `addCategory` 의 `validAt(...).isPresent()` 판정을 `if (false)` 로 비활성화 | `MasterCodeCateSegmentOpsSqliteTest#이미_있는_cate_id_addCategory_거부` | 잡힘 |
| 10 새 소속 행 to_ver=9999 | `addCategoryMembers` 의 신규 행 `ci.setToVer(OPEN)` 을 `ci.setToVer(v)` 로 | `MasterCodeCateSegmentOpsSqliteTest#addCategoryMembers_로_넣은_소속_행의_to_ver_는_9999다` | 잡힘 |
| 11 V 안 추가삭제 vs 이전닫기 | `removeCategoryMembers` 의 `same(e.getFromVer(), v)` 분기를 `if (false)` 로 바꿔 늘 "닫기" 로만 처리 | `MasterCodeCateSegmentOpsSqliteTest#V_에서_추가한_것은_삭제되고_이전_것은_닫힌다` | 잡힘 |
| 12 closeCategory 연쇄 닫기 | `closeCategory` 의 소속 순회 guard 를 `if (true) { continue; }` 로 바꿔 연쇄를 건너뜀 | `MasterCodeCateSegmentOpsSqliteTest#closeCategory_는_열린_소속을_연쇄로_닫는다` | 잡힘 |
| 13 revert 연쇄 재개방 | `revertCate` 의 `if (n.isEmpty()) { reopenMembersCascade(...); }` 를 `if (false)` 로 비활성화 | `MasterCodeCateSegmentOpsSqliteTest#카테고리_되돌리기는_연쇄로_닫힌_소속을_다시_연다` | 잡힘 |
| 14 cate_id 금지문자 | `checkDefinition` 의 `FORBIDDEN.matcher(cateId).find()` 판정을 `if (false)` 로 비활성화 | `MasterCodeCateSegmentOpsSqliteTest#cate_id_금지문자_거부` | 잡힘 |
| 15 preview 는 쓰기 없음 | `preview()` 안에 `segments.addCategoryMembers(ref, "BASE", Set.of("A"))` 호출을 끼워 넣음 | `CodeCateEditServiceSqliteTest#preview_전후_행_개수가_같다`(BASE 보호에 막혀 예외로 적발) | 잡힘 |
| 16 구현 빈 하나 | 테스트 클래스패스에 `MasterCodeSegmentService` 를 구현하는 두 번째 `@Service` 클래스를 임시로 추가 | `CodeCateEditOasisHttpTest#MasterCodeSegmentService_구현빈은_하나다`(컨텍스트 중복 빈으로 전체가 실패) | 잡힘 |
| 17 성능(저장 쪽) | `addCategoryMembers` 의 배치 저장(saveAll+flush 한 번)을 행마다 `saveAndFlush` 로 되돌림 | `CodeCateEditPerformanceSqliteTest` | 안 잡힘(보고, 위 "변이 검증에서 잡지 못한 것" 참고) |
| 17 성능(이동 쪽) | 해당 없음 — FE `transfer.ts` 는 이 Task 가 새로 짠 순수 함수라 되돌릴 "이전 구현"이 없다. 대신 `transfer.test.ts` 의 1,000건 성능 시험 두 개(moveSelected·moveAllVisible)가 각각 200ms 예산으로 통과함을 확인 | `transfer.test.ts` | 통과(변이 대상 없음) |

17개 규칙 모두 최소 한 변이를 실제로 넣고 돌렸다. 16개는 빨강, 1개(17, 저장 쪽 성능)는 이 하드웨어에서 SQLite 1,000행
규모가 두 구현을 가를 만큼 느리지 않아 안 잡혔다(위에 실측값과 함께 보고). 은폐 없이 있는 그대로 적는다.

## Verify 감사 기록 (Phase 04, 2026-09-24)

입력: Build 게이트 결과(HEAD 50ae46f, 백엔드 3093/실패0, `m-mdm` vitest 635/실패0, `test:unit:shared` 168/실패0, lint 통과,
oasis-contract ERROR0/WARN0) — 전체 스위트는 다시 돌리지 않았다.

- **L1·O1 재확인**: `pnpm --filter @dk-oasis/m-mdm lint`(`tsc --noEmit`) 통과. `check_oasis_contract.py --root .` →
  `BPMN 26 / 진입점 bean 26 (해석 26, 미해석 0)`, `ERROR 0 / WARN 0`(INFO 29 는 참고성).
- **변이 검증 기록 감사**: 「불변 규칙」 17개가 표에 빠짐없이 있고, 각 규칙마다 표의 변이를 워크트리에 그대로 다시
  넣어 표의 대상 테스트를 Gradle `--tests '<FQCN>#<메서드>' --fail-fast --no-daemon` 으로(프런트는 vitest) 단독 실행했다.
  스크립트 하나(변이 넣기 → 대상 테스트 → `git checkout --` 되돌리기, `trap` 으로 중단 시에도 되돌림)를 `heavy.sh` 로
  감싸 두 호출(1~8번, 9~17번 상당)로 나눠 돌렸다(각 10분 이내). 16번(구현 빈 하나)은 표대로 테스트 소스셋에 두 번째
  `@Service` 구현을 임시 파일로 추가해 재현했다.
  - 1~14, 16번(defKind 불변·BASE 보호·defTarget 허용 목록·defExpr 문법·소속 코드 유효성·Resolver 패스스루·DRAFT
    전용·rowVersion 불변·cate_id overlap·새 소속 행 to_ver·V 안 추가삭제 vs 이전닫기·closeCategory 연쇄·revert 연쇄
    재개방·cate_id 금지문자·구현 빈 하나) — **15개 모두 표대로 대상 테스트가 빨강**이었다(재현). 표 밖에 있거나 표와
    다른 행은 없었다.
  - **15번(preview 쓰기 없음) — 감사에서 약한 변이 검증을 발견해 보강했다.** 표의 변이(BASE 카테고리에
    `addCategoryMembers` 호출 삽입)를 다시 넣어 대상 테스트가 빨강임은 재현했지만, 실패 원인을 보니 BASE 보호
    가드(`requireNotBase`)가 던진 예외로 우연히 잡힌 것이었다 — 검사 대상이어야 할 "CATE_ITEM(TABLE 소속) 행 개수
    불변"은 애초에 비교하지 않고 있었다(`preview_전후_행_개수가_같다` 는 `cateSegments`·`itemSegments` 만 보고
    `cateItemSegments` 는 안 봄). **실증**: BASE 대신 존재하지 않는 cateId(`ZZ_ORPHAN_TABLE`, BASE 가드를 타지
    않음)로 `addCategoryMembers` 를 호출하는 변이를 만들어 돌리니 그 상태에서는 **초록**이었다(빌드 성공, 테스트
    실패 없음) — 진짜 커버리지 구멍이었다. `fx.cateItemSegments("M")` 전후 비교를 테스트에 추가해(별도 커밋
    8dff160, `CodeCateEditServiceSqliteTest.java` 2줄 추가) 같은 orphan-cateId 변이를 다시 돌리니 빨강이 됨을
    확인했다. 원래 표의 BASE 변이도 여전히 빨강이다(둘 다 확인함).
  - 17번(성능, 저장 쪽) — `안 잡힘(보고)` 는 design.md 본문에 실측값(배치 76ms 중앙값 vs 행마다 flush 120ms 중앙값,
    둘 다 800ms 예산 안)과 함께 이미 적혀 있어 사실 확인만 했다(재실행하지 않음, 은폐 아님을 확인).
  - 17번(이동 쪽) — `transfer.test.ts` 를 vitest 로 재실행, 14개 전부 통과(1,000건 `moveSelected`/`moveAllVisible`
    성능 시험 포함, 각 200ms 예산 안).
  - 감사 끝에(15번 보강 제외) 변이를 모두 되돌려 `git status --porcelain` 이 비었음을 확인했다(`git stash` 쓰지
    않음, 변이 미커밋). 이번 감사 중 세 차례 `../gradlew :api:test` 단독 호출(m9 계산·15번 재현·15번 보강 확인)이
    `heavy.sh` 없이 돌았다 — 규율 위반이나 게이트 판정에는 영향 없음(끝 보고 「겪은 문제」에 기록).
- **화면 E2E**: 빈 포트 확인(18604 mcm·18697 mdm·15604 FE) → `heavy.sh acquire`. 두 차례 돌렸다.
  1. **1차**(codeCateEdit 단독 + 인접 4스펙, 기본 `src/backend/data/{mcm,mdm}.db`) — `page-registry.ts` 재생성이
     커밋된 내용과 동일함을 확인 → `mdm-rbac-users.sql`(mcm) + `mdm-codeCateEdit.sql`(mdm, Flyway 적용 뒤) 주입,
     `TB_MCM_SEC_ROLE_MAPPING` 에서 `codeCateEdit` 행 3개 확인 → `pnpm build:libs` → FE 기동.
     `e2e/mdm-codeCateEdit.spec.ts --workers=1` **4/4 통과**(T1~T4) + `mdm-shell-rbac-smoke`(4)·`mdm-codeMng`(4)·
     `mdm-codeEdit`(4)·`mdm-codeItemEdit`(6) **18/18 통과**. 스크린샷 5장 갱신.
  2. **2차**(design.md 가 지시한 대로 mdm 을 명시적 파일로 재기동 — 1차는 이 지시를 놓치고 기본 `mdm.db` 를 썼다,
     끝 보고에 기록): mdm.db·mcm.db 를 옮기고 `--spring.datasource.url=jdbc:sqlite:$W/src/backend/data/e2e-06-04-verify-mdm.db`
     로 mdm 을 새로 기동(로그로 그 경로가 실제 쓰였음을 확인), mcm 은 기본 새 파일. `mdm-rbac-users.sql`·
     `mdm-ruleEdit-users.sql`(mcm) + `mdm-columnMng-dict.sql`·`mdm-codeItemEdit.sql`·`mdm-codeCateEdit.sql`·
     `mdm-dataItem.sql`·`mdm-ruleEdit-data.sql`(mdm) 주입 → `SMOKE_MDM_DB` 를 쥐고(headerMng·layoutMng 의
     beforeAll 이 이 값으로 M201 픽스처를 넣는다) mdm-\*.spec.ts **16개 전부**를 한 번에 돌렸다(`--workers=1`,
     2.5분). **72개 중 68 통과·1 실패·3 미실행**(같은 `describe` 의 serial 모드로 E1 실패 뒤 E2~E6 이 건너뜀).
     실패: `mdm-columnMng.spec.ts` E1("빈 목록 상태") — `TB_MDM_COLUMN` 조회로 원인을 확인하니 이 Task 와
     무관한 `mdm-ruleEdit-data.sql`(내가 이번 1회성 통합 실행을 위해 미리 넣은 픽스처, COIL_THK·COIL_WID·
     SURF_GRD 3행을 `TB_MDM_COLUMN` 에 직접 INSERT)이 이미 들어가 있어 "빈 목록"이 깨졌다 — columnMng·ruleEdit
     두 스펙은 각자 design.md 상 **격리된 새 DB** 를 전제하는데 내가 한 DB 에 모아 돌리며 그 전제를 깼다.
     이 Task 의 변경(카테고리 세그먼트·codeCateEdit 화면·`codeEdit` 버튼·메뉴 시드)은 `TB_MDM_COLUMN`·컬럼 사전
     화면을 건드리지 않는다 — **이 Task 의 회귀가 아니다.** 나머지 15개 스펙(68개 테스트)은 전부 통과, codeCateEdit
     4/4 를 포함한다.
  - 종료(두 차례 모두): 자기 PID(FE·mdm·mcm) 먼저 kill, 세 포트(15604·18697·18604) 리스너 잔존 없음 확인 후
    `heavy.sh release`. 다른 Task 의 스크린샷·`next-env.d.ts`·`test-results` 는 `git checkout --` 로 복원(2차는
    16개 스펙이 스크린샷을 남겨 대조 범위가 넓었다 — TSK-01-02·01-03·04-02·04-03·05-02·05-03·06-02·06-03·
    07-03·08-02 전부 복원). 끝난 뒤 `git status --porcelain` 은 이 Task 의 스크린샷과 테스트 보강 커밋만 남았다.
- **수용 기준 5개 대조**(design.md §4 그대로, 코드·테스트 확인):
  1. 정규식 문법 오류 저장 거부 — `CodeCateEditServiceSqliteTest#정규식_문법_오류는_validate_save_모두_거부` +
     E2E T4. 확인함.
  2. BASE 편집·닫기 불가 — 서버 `MasterCodeCateSegmentOpsSqliteTest#BASE_는_모든_조작에_MDM012`, 화면
     `CategoryListPanel.tsx` 가 `cateId==="BASE"` 면 편집·닫기 버튼 미렌더링(E2E T2 에서도 BASE 행에 버튼 없음을
     확인). 확인함.
  3. 포털 메뉴 진입 + `mdm-codeCateEdit.spec.ts` 통과 — 메뉴 시드(`DataInitializer.seedMdmCodeCateEditMenu`,
     RBAC 행 확인함) + E2E 4/4. 확인함.
  4. 1,000건에서 이동·저장 1초 이내 — 이동 `transfer.test.ts`(200ms 예산 통과), 저장
     `CodeCateEditPerformanceSqliteTest`(800ms 예산, 실측 중앙값 76~120ms 대). 확인함(E2E 전체 왕복 타이밍은
     D4 결정대로 게이팅 대상이 아님).
  5. 소속 코드는 유효 코드여야 저장 — `MasterCodeCateSegmentOpsSqliteTest#없는_코드_addCategoryMembers_거부`
     (변이 검증으로 재확인). 확인함.
- **판정: PASS.** 단, 테스트 코드 보강 1건(`CodeCateEditServiceSqliteTest.java`, 커밋 8dff160)이 있었다 —
  「Verify 게이트는 Verify 가 코드를 고쳤을 때만 전체 스위트를 돈다」 규칙에 따라 오케스트레이터가 전체 스위트
  게이트를 다시 돌려야 한다(이 서브에이전트는 관련 테스트만 확인했다, 위 참고). 그 외에는 이 절·스크린샷 갱신
  커밋(33c922a)뿐이다.
