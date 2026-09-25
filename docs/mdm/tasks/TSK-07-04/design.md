# mdm/TSK-07-04 항목 트리·CSV 업로드 — design.md

> spec: [spec.md](./spec.md). agent_prompt(0090) 없음 — 팀장 프롬프트에 별도 위임 지시 없이 표준 Phase 절차만 있었다.

## 1. 접근 방식

TSK-07-03 이 이미 머지한 `dataItemMng`(항목 관리) 화면·`DataItemSaveCore`(선분 저장 코어)를 최대한 그대로 쓰고, 이번
작업은 그 위에 두 가지만 얹는다: ① 트리 보기·노드 필터, ② CSV 업로드. 새 테이블·DDL 은 없다(TSK-07-01 계약 그대로).

- **트리·노드 필터는 이미 TSK-06-03(`dmc/codeItemEdit`)이 값-기반 계층 트리를 구현해 뒀다.** `pages/dmc/codeItemEdit/code-tree.ts`
  의 `buildCodeTree`·`toTreeItems`(계층 칸 값을 그룹으로 접는 알고리즘, `sql/04-hier-tree-sim.py` 의 `tree()`/`order()` 규칙과
  글자 단위로 일치하도록 이미 테스트됨, `tests/dmc/codeItemEdit/code-tree.test.ts`)와 `grid-state.ts` 의 `filterByNode`·`pathOf`,
  `page.tsx` 의 그리드/트리 탭 전환 + "이 노드로 편집" 칩 패턴이 그대로 이번 요구사항(lvl 트리 보기·이 노드로 보기 필터 칩)의
  구현이다. **새로 만들지 않고 `code-tree.ts` 를 화면 그룹 경계 밖(m-mdm 공용)으로 옮겨 재사용한다(D1).**
  다른 점 하나: `codeItemEdit` 은 코드 전체를 한 번에 불러와 클라이언트에서 트리·필터를 만들지만, `dataItemMng` 은 서버
  페이징 그리드다. 그래서 트리 자체는 별도(비페이징) 조회로 받고, "이 노드로 보기" 필터는 서버 쪽 `search` 쿼리에
  WHERE 절로 추가한다(§ 불변 규칙 I5·I6).
- **CSV 업로드는 저장 로직을 새로 만들지 않는다.** `DataItemSaveCore.upsert(maruDataId, DataSavePath.CSV, null, rows, dryRun)`
  가 이미 검사 1~7·INSERT/UPDATE/NONE 판정·닫힌 키 거부(CSV 로 다시 열지 않음, 05 「CSV 형식」)·한 트랜잭션 저장을 갖추고
  있고 `MasterDataExamplesScenarioTest` 가 이미 이 경로로 돈다(TSK-07-03 이 CSV 경로를 염두에 두고 설계·검증만 해 두고
  OASIS 진입점을 만들지 않은 상태). 이번 작업은 ① RFC 4180 파서, ② 그 파서 결과를 `List<UpsertRow>` 로 바꿔 코어를 부르는
  얇은 OASIS 서비스, ③ 코어의 오류를 CSV 줄 번호에 정확히 되돌려 줄 작은 확장(§ 불변 규칙 I7, D3) 만 더한다.
- **`dataCsvUploadPop` 은 화면(page.tsx)이 아니라 팝업이다(D2).** `docs/mdm/screens/README.md` §4 가 이 판단을
  TSK-07-04 에 인계했고, 같은 문서가 mcm `masterRuleDataUploadFilePopup`(`docs/mcm/design/masterRuleDataUploadFilePopup/`,
  화면 유형 "modal popup — 단독 진입 불가, 부모의 자식") 선례를 들어 팝업을 권장한다. 이 저장소에 이미 있는 같은 모양의
  선례가 `dma/termRegPop`(TSK-04-04) 이다 — `{screenId}.tsx` + `index.ts` 배럴, `page.tsx`·메뉴 leaf 없음, 자기 OBJECT_ID
  로 RBAC 판정, 부모 화면(`columnMng`)이 `open`·콜백 props 로 연다. `dataCsvUploadPop` 도 이 모양을 그대로 따라
  `dataItemMng` 의 "CSV 업로드" 버튼이 연다. spec.md 의 엔트리포인트 문구("포털 메뉴 > CSV 업로드")·wbs.md 「기술
  스펙」("FE: `m-mdm/pages/dmd/dataCsvUploadPop/page.tsx`")·수용 기준의 "포털 메뉴에서 화면이 열리고"는 문구를 바꾸지
  않되(screens/README §4 가 "TSK-07-04 의 문구를 바꾸지 않고 판단을 인계한다"로 명시), 실제 구현은 `dataItemMng`
  화면 안에서 여는 팝업이다 — § 수용 기준 매핑에 근거를 적는다.

## 결정 (design.md 안에서만 참조하는 번호 — decisions.md 와 별개)

- **D1** — 트리 알고리즘·렌더 유틸(`buildCodeTree`·`toTreeItems`)을 새로 만들지 않고 `pages/dmc/codeItemEdit/code-tree.ts`
  를 `src/hier-tree.ts`(m-mdm 공용)로 옮겨 `dataItemMng` 도 쓴다. 「이동(D1)」 절.
- **D2** — `dataCsvUploadPop` 을 독립 화면이 아니라 팝업으로 만든다(`dataItemMng` 이 연다, page.tsx·메뉴 leaf 없음).
  공용 결정 기록 `docs/mdm/decisions.md` D-TSK-07-04-1 로 승격.
- **D3** — CSV 는 서버에서만 파싱·검증한다(화면은 `FileReader` 로 원문만 전달). 검증 결과를 CSV 줄 번호에 정확히
  대응시키기 위해 `UpsertResult.RowAction` 에 행별 `issues` 를 추가한다(기존 API 하위 호환 유지).
- CSV 파싱은 **서버에서만** 한다(D3). 05 시안(`html/05-master-data.html` `#p-csv`)의 프로토타입은 검증 로직을
  JS 로 중복 구현했지만(백엔드가 없던 목업이라 불가피), 실제로는 `DataItemChecks`·`DataItemSaveCore` 가 이미 검사
  1~7 의 단일 소스다. 화면은 업로드된 파일을 `FileReader.readAsText`(UTF-8)로 읽어 원문 그대로 서버에 보내고, 서버가
  파싱 + `upsert(dryRun=true/false)` 로 검증·저장을 모두 한다. **화면은 CSV 를 파싱하지 않으므로 시안의 "오류 행
  빼기" 버튼은 이번 범위에 넣지 않는다** — spec.md 요구사항·수용 기준 어디에도 없는 시안 전용 편의 기능이고, 화면이
  구현하려면 RFC 4180(인용부호 안 개행 포함)을 다시 파싱해야 해 "파싱은 서버만" 원칙과 정면으로 부딪힌다. 화면은
  "검증"·"저장" 두 조작만 제공하고, 오류가 있으면 사용자가 파일을 고쳐 다시 올린다.

## 2. 변경 파일 목록

### 생성

**백엔드 — 트리·노드 필터(B1)**: 새 파일 없음 — 아래 「수정」의 기존 파일만 고친다. 테스트도 기존
`DataItemMngServiceSqliteTest.java` 에 케이스를 추가한다(새 테스트 파일 없음, 아래 「테스트 전략」).

**백엔드 — CSV 업로드(B2)**
- `src/backend/mdm/api/src/main/resources/services/dmd/dataCsvUploadPop.bpmn` — process id = serviceId = `dataCsvUploadPop`.
  actionGateway 2 분기: `validate`(dryRun 검증, 읽기)·`save`(실제 저장, 쓰기). `dataItemMng.bpmn` 의 구조를 그대로 본뜬다.
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmd/dataCsvUploadPop/service/DataCsvUploadPopService.java` —
  `@Service("dataCsvUploadPopService")`. `validate`·`save` 두 메서드, 공통 로직(파싱 → `List<UpsertRow>` → 코어 호출 →
  `DataCsvRow` 목록 조립)을 사설 메서드 하나로 묶는다(`dryRun` 만 다름). `@Transactional` 안 붙임(F11, dataItemMng 선례).
  **파서 단계 오류(열 수 불일치·헤더 불일치·`seq` 정수 변환 실패)가 있는 행은 `upsert()` 를 부르지 않고 그 줄만
  오류로 표시한다** — 파서 오류가 하나라도 있으면 그 CSV 전체가 저장 대상에서 빠진다(오류 0건 전체 원칙, I2 와 동형).
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmd/dataCsvUploadPop/service/Rfc4180Csv.java` — RFC 4180
  최소 파서(따옴표 이스케이프·CRLF/LF, 인용부호 안 개행 허용). `batch.sapdict.SapCsv` 와 같은 문법이지만 배치 모듈에
  기대지 않도록 독립 구현한다(배치·화면 경로 결합 방지, `SapDictNoWriteArchitectureTest` 등 배치 전용 ArchUnit 경계를
  건드리지 않는다). 20 고정 컬럼(`code,name,alter_name,seq,description,lvl1..lvl5,attr01..attr10`) 헤더 검증까지 이
  클래스가 한다. **`recordNumber`(레코드 번호, `SapCsv.Row` 와 같은 규약 — 헤더=1, 첫 데이터 행=2, 인용부호 안 개행이
  있어도 레코드 단위로 센다)를 그대로 `DataCsvRow.lineNo` 로 쓴다.**
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmd/dataCsvUploadPop/dto/DataCsvRow.java` — `record
  DataCsvRow(int lineNo, String code, String action, List<String> issues)`. `action` 은 파서 오류 행이면 `"-"`, 그
  외엔 `MdmTemporalSegmentAction`(항상 INSERT/UPDATE/NONE 중 하나 — I3 로 CLOSE·REOPEN 없음, REOPEN 은 API 경로에서만
  나온다)의 이름 문자열.
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmd/dataCsvUploadPop/dto/DataCsvValidateRequest.java` —
  `maruDataId`, `csvText`.
- `.../dto/DataCsvValidateResult.java` — `record DataCsvValidateResult(List<DataCsvRow> rows, int insertCount,
  int updateCount, int noneCount, int errorCount)`.
- `.../dto/DataCsvSaveRequest.java` — `maruDataId`, `csvText`(검증 뒤 그대로 다시 보낸다 — 서버가 저장 시점에 다시
  파싱·검사한다. 화면이 보낸 "검증 통과" 상태를 신뢰하지 않는다, C0 원칙과 같다).
- `.../dto/DataCsvSaveResult.java` — `record DataCsvSaveResult(int insertCount, int updateCount, int noneCount, String at)`.
- 테스트: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmd/dataCsvUploadPop/DataCsvUploadPopServiceSqliteTest.java`,
  `.../Rfc4180CsvTest.java`.

**프론트엔드(B3)**
- `src/frontend/m-mdm/src/hier-tree.ts` — `pages/dmc/codeItemEdit/code-tree.ts` 를 옮긴 것(D1, 아래 「이동」 참조).
- `src/frontend/m-mdm/pages/dmd/dataItemMng/ItemTreePanel.tsx` — 새 컴포넌트(트리 렌더 + "이 노드로 보기"/"모두 펴기"/
  "모두 접기"). `codeItemEdit` `page.tsx` 의 트리 탭 JSX 를 그대로 뽑아 쓰지는 않는다 — 데이터 출처가 다르다
  (`codeItemEdit` 은 이미 불러온 전체 행에서 `buildCodeTree` 를 직접 부르지만, `ItemTreePanel` 은 서버 `treeRows`
  응답을 받는다). `Tree`(`@dk-oasis/shared/tree`) 사용법·버튼 배치는 `codeItemEdit` 트리 탭과 같은 패턴을 따른다(재사용은
  D1 의 `hier-tree.ts` 알고리즘까지이고, 이 컴포넌트 자체는 새로 쓴다).
- `src/frontend/m-mdm/pages/dmd/dataCsvUploadPop/dataCsvUploadPop.tsx` — `DataCsvUploadPopModal` 팝업(termRegPop.tsx
  구조 그대로: Modal + 자기 `useUserButtonRbac(true)` 훅 호출 + 자기 OBJ_ID(`dataCsvUploadPop`)로 `canDoButton` 판정,
  `open`/`maruDataId`/`maruDataName`/`lvlCnt`/`attrLabels`/`onClose`/`onSaved` props). 이 훅은 전역 module-singleton
  캐시(`use-user-button-rbac.ts`)라 `dataItemMng` 가 이미 호출해 캐시가 있으면 팝업이 다시 불러도 네트워크 재요청이
  없다 — 두 화면이 따로 불러도 안전하고 비용도 없다.
- `src/frontend/m-mdm/pages/dmd/dataCsvUploadPop/index.ts` — 배럴(termRegPop/index.ts 그대로 — "팝업은 page.tsx·메뉴
  leaf 없이 `{screenId}.tsx` + `index.ts`" 규약대로 화면 폴더 README §5 를 따름).
- `src/frontend/m-mdm/pages/dmd/dataCsvUploadPop/api.ts` — `validateCsv`·`saveCsv` OASIS 호출 + `CSV_COLS`(20 고정
  물리명, 안내 문구용)·결과 타입(`DataCsvRow` 등)을 이 파일에 둔다. **별도 `types.ts` 를 두지 않는다** — termRegPop
  도 타입을 `api.ts` 에 두고 `index.ts` 가 재노출하는 선례를 그대로 따른다.
- 테스트: `src/frontend/m-mdm/tests/dmd/dataItemMng/item-tree.test.ts`(ORG 표본 트리 일치, 아래 「테스트 전략」).
  `dataCsvUploadPop` 은 파싱·직렬화 로직이 화면에 없어(D3) 뽑아 낼 순수 함수가 없다 — 컴포넌트·API 단위 테스트를
  두지 않고 e2e 스모크로만 검증한다(termRegPop 도 컴포넌트 단위 테스트가 없다 — 화면 선례와 같다).

### 수정

**백엔드**
- `src/backend/mdm/lib/.../common/segment/UpsertResult.java` — `RowAction` 에 `List<MdmCheckIssue> issues` 필드
  추가(D3, 기존 2-인자 생성자 호출부는 `DataItemSaveCore.upsert()` 안 6곳뿐이라 하위 호환 깨지지 않음 — 이 레코드를
  직접 생성하는 테스트는 없다, 기존 호출부만 고친다). **(B2)**
- `src/backend/mdm/lib/.../common/segment/DataItemSaveCore.java` — `upsert()` 루프에서 행별 이슈(중복 배치·검사
  1~7·닫힌 키 거부)를 그 행의 `RowAction.issues` 에도 담는다(현재는 전역 `issues` 리스트에만 순서 없이 쌓여 CSV 줄
  번호로 되짚을 수 없다). 전역 `issues` 리스트는 그대로 유지(기존 호출부 호환). **(B2)**
- `src/backend/mdm/lib/.../dmd/dataItemMng/dto/DataItemSearchRequest.java` — `nodeFilter`(String)·`withTree`(Boolean)
  필드 추가. **(B1)**
- `src/backend/mdm/lib/.../dmd/dataItemMng/dto/DataItemSearchResult.java` — `tree`(`List<DataItemRow>`, null 허용)·
  `treeTruncated`(boolean) 필드 추가. **(B1)**
- `src/backend/mdm/lib/.../dmd/dataItemMng/service/DataItemListQuery.java` — `page()` 에 `nodeFilter` 파라미터 +
  WHERE 절(`i.CODE = :node OR i.LVL1 = :node OR ... OR i.LVL5 = :node`, mockup `renderItems` 의 `r.code === iSel ||
  r.lvl.includes(iSel)` 과 같은 규칙). `treeRows(String maruDataId)` 신설 — LATEST 서브쿼리 재사용 + `VALID_TO = :openEnd`
  (열린 행만, I6) + 기존 `ORDER` 상수 재사용(MSSQL 페이징은 ORDER BY 가 있어야 하므로 `page()` 와 마찬가지로 늘 정렬,
  Q2) + `setMaxResults(TREE_MAX)`. 새 SQL 도 기존 `page()` 와 같은 이식성 방식만 쓴다 — 파라미터 바인딩(`setParameter`),
  Hibernate `setFirstResult`/`setMaxResults`(LIMIT/OFFSET·TOP 리터럴을 직접 쓰지 않음), 기존 LIKE ESCAPE 패턴 재사용.
  방언 검사는 이 Task 가 새로 만들지 않는다(TSK-07-01 mssql 메모: "MSSQL 방언은 머지 뒤 팀장 dialect_check 1회"와 같은
  절차, 아래 「도커 금지로 생략한 검증」). **(B1)**
- `src/backend/mdm/lib/.../dmd/dataItemMng/service/DataItemMngService.java` — `search()` 가 `nodeFilter`·`withTree`
  를 읽어 `query.page(..., nodeFilter, ...)`·(withTree 면) `query.treeRows(md)` 를 부르고 `DataItemRows::toRow` 로
  결과 DTO 의 `tree` 를 채운다. `TREE_MAX = 2000` 상수 추가(DEFAULT_SIZE·MAX_SIZE 옆). 트리가 상한에 걸리면(반환 행 수
  == TREE_MAX) 화면이 "처음 2000건만 표시" 안내를 보이도록 결과에 `treeTruncated: boolean` 도 싣는다. **(B1)**
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmd/dataItemMng/DataItemMngServiceSqliteTest.java` —
  nodeFilter·withTree 케이스 추가(새 파일 아님, 아래 「테스트 전략」). **(B1)**
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmd/DmdBpmnActionTest.java` — `dataCsvUploadPop_액션은_validate_save()`
  테스트 메서드 추가: `assertActions("services/dmd/dataCsvUploadPop.bpmn", "dataCsvUploadPop", "dataCsvUploadPopService",
  Map.of("validate", "validate", "save", "save"), Set.of("save"))`(이 파일은 `dataItemMng`·`dataHistory` 두 BPMN을
  이미 하드코딩된 개별 `assertActions` 호출로 검사한다 — 동적 스캔이 아니라서 새 BPMN마다 이 파일에 메서드를 더해야
  한다). **(B2)**
- `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` — `seedMdmDataItemMenus()` 뒤에
  `seedMdmDataCsvUploadPopObject()` 신설 호출 추가: `insertMcmSecObjIfAbsent("dataCsvUploadPop", "CSV 업로드", "mdm")` +
  SYSADMIN PERM_ALL + `seedMdmObjectRbac("dataCsvUploadPop", "dmd")`. **메뉴 leaf 는 만들지 않는다**(팝업, termRegPop
  선례와 같은 주석을 남긴다). **(B2)** — `src/frontend/e2e/fixtures/mdm-rbac-seed-check.expected.txt` 확인함: 이
  픽스처는 폴더·역할·PERM_MDM_* 액션 집합·`mdmSample` OBJECT 행만 담고 있어(OBJECT_ID 별 전수 목록이 아니다) `dataCsvUploadPop`
  OBJECT 추가로 기대값이 바뀌지 않는다(변경 불필요, 확인만).

**프론트엔드**
- `src/frontend/m-mdm/pages/dmd/dataItemMng/page.tsx` — 그리드/트리 탭 전환(`iView` 상태), `ItemTreePanel` 마운트,
  "이 노드로 보기" 칩(`filterByNode`·`pathOf` 는 서버가 필터링하므로 화면은 칩 표시 + `nodeFilter` 를 검색 파라미터에
  싣는 것만 한다), "CSV 업로드" 버튼(헤더 버튼 목록에 추가, `canDoButton(rbac, "dataCsvUploadPop", "save")` 로 가드 —
  이미 로드된 `rbac` 매트릭스를 재사용, 새 훅 호출 없음) + `DataCsvUploadPopModal` 마운트(open/maruDataId/maruDataName/
  lvlCnt/attrLabels/onClose/onSaved props, termRegPop 이 `token` 을 props 로 받는 것과 같은 모양).
- `src/frontend/m-mdm/pages/dmd/dataItemMng/api.ts` — `searchDataItems` 에 `nodeFilter`·`withTree` 파라미터 추가.
- `src/frontend/m-mdm/pages/dmd/dataItemMng/types.ts` — `DataItemFilters` 에 `nodeFilter: string | null` 추가,
  `DataItemSearchResult` 에 `tree?: DataItemRow[]`·`treeTruncated?: boolean` 추가.
- `src/frontend/m-mdm/pages/dmc/codeItemEdit/code-tree.ts` 삭제, 대신 재노출 없이 직접 임포트 경로를 고친다(D1 「이동」).
- `src/frontend/m-mdm/pages/dmc/codeItemEdit/{combo.ts,grid-state.ts,components/PreviewPanel.tsx,page.tsx}` — import
  경로만 `./code-tree` → `@/hier-tree`(또는 상대 경로 `../../src/hier-tree`, Build 가 기존 별칭 관례를 grep 해 맞춘다)로 교체.
- `src/frontend/m-mdm/tests/dmc/codeItemEdit/{code-tree.test.ts,sim-fixtures.ts}` — import 경로만 교체(내용 불변).

이상 「생성」·「수정」 은 모두 B1·B2·B3 의 파일이다. **e2e 스펙·스크린샷은 B4(마지막 단위)만 만들고 고친다** — B3
는 화면·컴포넌트·vitest 까지만 하고 e2e 는 건드리지 않는다(B3·B4 가 같은 파일을 고치지 않도록 분리, 「구현 단위」
표).

### 생성·수정 — B4(e2e·통합, 마지막 단위)

- `src/frontend/e2e/mdm-dataItemMng.spec.ts`(수정) — 트리 탭·노드 필터 칩·CSV 업로드 버튼 존재 스모크 추가(기존
  S1~S4 유지).
- `src/frontend/e2e/mdm-dataCsvUploadPop.spec.ts`(신규).
- `docs/mdm/tasks/TSK-07-04/screens/*.png`(신규) — 두 화면 스크린샷(`references/e2e.md`).

### 이동(D1)

`src/frontend/m-mdm/pages/dmc/codeItemEdit/code-tree.ts` → `src/frontend/m-mdm/src/hier-tree.ts`. 내용은 그대로,
파일 머리 주석만 "codeItemEdit·dataItemMng 공용" 으로 고친다. `m-mdm/src/` 는 이미 화면 그룹을 넘나드는 공용 모듈
자리(`shell`·`layout`·`hooks`·`evalex`)라 새 규약을 만들지 않는다. `pages/dmc/codeItemEdit` 안에서만 쓰던 파일을
`pages/dmd/dataItemMng` 도 쓰게 되어 경계를 넘는데, 화면 그룹 폴더(`dmc`)가 아니라 모듈 공용 폴더(`src`)로 옮기므로
두 그룹 다 그 아래 계층이 된다(어느 쪽도 다른 쪽 화면 폴더를 참조하지 않는다).

## 3. 테스트 전략

### 백엔드
- `DataItemMngServiceSqliteTest.java`(기존 파일에 추가) — `search()` 에 `nodeFilter` 를 줬을 때 그 코드 자신 또는
  lvl1~5 어딘가에 그 값이 있는 행만 온다(열림·닫힘 무관, I5). `withTree=true` 면 `tree` 에 열린 행만 온다(I6, showClosed
  와 무관하게 트리는 항상 열린 행만).
- `Rfc4180CsvTest.java` — 인용부호·콤마·개행 포함 값, BOM 유무, 헤더 20 열 불일치 거부(I7-1), 행별 열 수 불일치 거부.
- `DataCsvUploadPopServiceSqliteTest.java` — 화면 경로(`DataItemChecksSqliteTest`)와 같은 스타일로:
  - 검증(validate): 오류 있는 CSV → `errorCount > 0`, 저장 안 됨(호출 자체가 dryRun). 오류 없는 CSV → 행별 INSERT/
    UPDATE/NONE 이 입력 순서와 1:1 (I7).
  - 저장(save): 오류 0건 CSV 저장 → 한 저장 시각, TB_MDM_DATA_ITEM 행 수 확인(I2). 오류 있는 CSV 저장 시도 → 전부
    미저장(I2).
  - 재업로드: 같은 파일 두 번 업로드 → 두 번째는 전부 NONE, 새 선분 없음(I4). 값 하나만 바꿔 재업로드 → 그 키만
    새 선분(I4).
  - 닫힌 키: 닫힌 키가 든 CSV → 거부, close 액션 생성 안 됨(I3).
  - 마루 데이터 DEPRECATED·EXTERNAL 원천 → 검사 1·2 로 즉시 거부(기존 `requireActive`·`requireSourcePath` 재사용
    확인, 새 테스트 아님).
- `DmdBpmnActionTest.java` — `dataCsvUploadPop_액션은_validate_save()` 신규 메서드(정적 분기·메서드 매핑 검사,
  기존 `dataItemMng_...`·`dataHistory_...` 와 같은 방식).

### 프론트엔드
- `item-tree.test.ts` — **수용 기준 1 의 실제 검증**: 기존 `tests/dmc/codeItemEdit/sim-fixtures.ts` 의 `ORG`(05 TB_MDM_DATA_ITEM
  표본 5행, 이미 `sql/04-hier-tree-sim.py` 출력과 대조돼 있음)를 그대로 가져와 `buildCodeTree`(→ 이동 후 `hier-tree.ts`)
  결과를 `code-tree.test.ts` 와 같은 방식(글자 단위 줄 비교)으로 검증한다. dataItemMng 쪽 어댑터(서버 `DataItemRow[]`
  → `HierRow[]`)가 정확히 같은 필드(code/name/seq/lvl1~5)를 넘기는지도 이 테스트가 함께 본다. **새 시뮬레이터 실행은
  하지 않는다** — TSK-06-03 이 이미 시뮬레이터 대조를 끝낸 같은 표본·같은 함수를 재사용한다(중복 검증 아님, 알고리즘은
  이미 증명됐고 이번엔 "그 알고리즘이 dataItemMng 트리에도 그대로 적용된다"만 새로 증명한다).
- `dataCsvUploadPop` 은 화면 쪽에 뽑아 낼 순수 함수가 없어(D3, 「생성」 절 참조) 별도 단위 테스트를 두지 않는다.

### e2e 스모크 넷 (`references/e2e.md`)
**`mdm-dataItemMng.spec.ts`(기존 파일 확장, 트리·CSV 버튼 부분만 추가 — S1~S4 유지)**
1. (기존 S1 유지) 메뉴 이동.
2. (확장) 트리 탭으로 전환하면 서버 트리 데이터로 노드가 채워진다. 데이터 없는 마루 데이터를 고르면 트리가 빈 상태.
3. 트리 노드를 골라 "이 노드로 보기"를 누르면 그리드가 그 노드 아래로만 필터되고 칩이 보인다. 칩 ✕ 로 해제.
4. (기존 S4 유지) 서버 오류 노출.

**`mdm-dataCsvUploadPop.spec.ts`(신규)**
1. `dataItemMng` 화면으로 이동해 마루 데이터(PORT 류)를 고르고 "CSV 업로드" 버튼으로 팝업을 연다(§ 수용 기준 매핑에
   "포털 메뉴에서 화면이 열리고" 를 이 경로로 재해석한 근거).
2. `input[type=file]` 에 `setInputFiles` 로 CSV 파일을 넣고 "검증"을 누르면 서버 데이터로 행별 결과 표가 채워진다.
   빈 CSV 는 "검증을 누르면 결과가 나온다" 빈 상태.
3. 오류 0건인 CSV 를 저장하면 팝업이 닫히거나 완료 배지를 보이고, `dataItemMng` 목록에 반영된다(한 조작으로 끝).
4. 오류 있는 CSV(예: 헤더 불일치·닫힌 키)를 검증하면 오류가 화면에 보이고 저장 버튼이 비활성.

## 4. 수용 기준 매핑

| 수용 기준 | 검증 방법 |
|---|---|
| ORG 샘플 트리가 `sql/04-hier-tree-sim.py` 결과와 일치 | `item-tree.test.ts` — TSK-06-03 이 이미 시뮬레이터와 대조해 둔 `ORG` 표본·`buildCodeTree`(이동 후 `hier-tree.ts`)를 dataItemMng 어댑터 경유로 재검증(글자 단위 줄 비교) |
| 포털 메뉴에서 화면이 열리고 e2e `mdm-dataItemMng.spec.ts` 가 통과한다 | 기존 e2e 파일 확장. `dataItemMng` 은 TSK-07-03 부터 이미 독립 화면·메뉴 leaf 라 엔트리포인트는 바뀌지 않는다 |
| 같은 파일 재업로드 시 바뀐 행만 새 선분 | `DataCsvUploadPopServiceSqliteTest` 재업로드 시나리오(I4) |
| CSV 로 닫기 불가 | `DataCsvUploadPopServiceSqliteTest` 닫힌 키 거부 + `DataItemSaveCore.upsert()` 코드 경로 자체가 CLOSE 액션을 만들지 않음(I3, 정적으로도 성립) |
| 포털 메뉴에서 화면이 열리고 e2e `mdm-dataCsvUploadPop.spec.ts` 가 통과한다 | **재해석(D2, screens/README §4 가 권한 위임)**: `dataCsvUploadPop` 은 팝업으로 확정해 `dataItemMng` 화면 안에서 연다. e2e 파일명·통과 요건(업로드→검증→저장→목록 반영이 화면 조작만으로 끝난다)은 그대로 지키되 "포털 메뉴에서" 대신 "dataItemMng 화면의 CSV 업로드 버튼으로" 열리는 것으로 확인한다 |

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

| # | 규칙 | 대상 테스트 |
|---|---|---|
| I1 | CSV 검증·저장은 화면 경로와 같은 검사 1~7 을 `DataItemChecks`/`DataItemSaveCore` 로만 돈다 — CSV 전용 검증 로직을 새로 만들지 않는다 | `DataCsvUploadPopServiceSqliteTest`(코드 리뷰 관점: 새 검사 클래스가 생기지 않는지도 Verify 가 본다) |
| I2 | CSV 저장은 오류가 하나라도 있으면 전부 미저장, 오류 0건일 때만 한 트랜잭션·한 저장 시각 | `DataCsvUploadPopServiceSqliteTest` 저장 케이스 |
| I3 | CSV 업로드는 CLOSE 액션을 만들지 않는다(닫기는 화면에서만) | `DataCsvUploadPopServiceSqliteTest` 닫힌 키 케이스 |
| I4 | 값이 같은 행은 NONE 이며 새 선분·순번을 받지 않는다(`DataItemValue.sameAs`, 이미 있는 규칙 — 재확인만) | `DataCsvUploadPopServiceSqliteTest` 재업로드 케이스 |
| I5 | "이 노드로 보기" 필터는 코드 자신 또는 lvl1~5 어딘가의 값이 노드 값과 같은 행만 남긴다(열림·닫힘 무관) | `DataItemMngServiceSqliteTest` nodeFilter 케이스 |
| I6 | 트리는 열린 행만으로 구성한다(닫힌 행은 트리에 없다) | `DataItemMngServiceSqliteTest` withTree 케이스 |
| I7 | CSV 헤더는 `code,name,alter_name,seq,description,lvl1..lvl5,attr01..attr10` 20 열 고정 순서이고, 검증 결과는 입력 행과 1:1 로 대응해 줄 번호별 오류를 보고한다(줄 번호 뒤섞임 없음) | `Rfc4180CsvTest` 헤더 케이스 + `DataCsvUploadPopServiceSqliteTest` 줄 번호 대응 케이스 |
| I8 | `buildCodeTree`/`toTreeItems`(`hier-tree.ts`)의 정렬·표시 규칙(코드 있는 노드 먼저 seq 순, 그 다음 순수 그룹 값 순)은 TSK-06-03 이 확정한 그대로다 — dataItemMng 재사용을 이유로 바꾸지 않는다 | `item-tree.test.ts` + 기존 `code-tree.test.ts`(이동 후에도 계속 초록이어야 한다) |

## 구현 단위

| 단위 | 범위(파일·기능) | 새 테스트 | 담당 불변 규칙 |
|---|---|---|---|
| B1 | 백엔드 — 트리·노드 필터 조회 확장. `dataItemMng` 패키지의 `DataItemSearchRequest`·`DataItemSearchResult`·`DataItemListQuery`·`DataItemMngService` + 그 테스트만 고친다 | `DataItemMngServiceSqliteTest` nodeFilter·withTree 케이스 | I5, I6 |
| B2 | 백엔드 — CSV 업로드 서비스. 신규 패키지 `dmd.dataCsvUploadPop` 전체(BPMN·서비스·파서·DTO) + `common/segment`(`UpsertResult`·`DataItemSaveCore`) 확장 + `DmdBpmnActionTest` + `DataInitializer` 시드. B1 과 파일이 겹치지 않는다(병렬 가능) | `DataCsvUploadPopServiceSqliteTest`, `Rfc4180CsvTest`, `DmdBpmnActionTest` 신규 메서드 | I1, I2, I3, I4, I7 |
| B3 | 프론트엔드 컴포넌트. `hier-tree.ts` 이동(+ codeItemEdit import 경로 고침), `dataItemMng` 트리 탭·노드 필터 칩·CSV 버튼, `dataCsvUploadPop` 팝업 신설. e2e·스크린샷은 만들지 않는다(B4 몫, 같은 파일을 두 단위가 고치지 않게). B1·B2 완료(API 계약) 뒤 시작 | `item-tree.test.ts` | I8 |
| B4 | 마지막 단위 — e2e·통합. `mdm-dataItemMng.spec.ts` 확장 + `mdm-dataCsvUploadPop.spec.ts` 신규 + 스크린샷. B3 완료 뒤 시작 | `mdm-dataItemMng.spec.ts`(확장), `mdm-dataCsvUploadPop.spec.ts`(신규) | 없음 — I1~I8 모두 B1~B3 가 담당 단위에서 변이 검증을 끝낸다. B4 는 그 결과가 E2E 로도 관통되는지만 확인한다 |

## 담당자 확인 필요 결정

- **D1** — `dataCsvUploadPop` 을 독립 화면(page.tsx·메뉴 leaf)으로 만드는가, `dataItemMng` 안에서 여는 팝업으로 만드는가?
  - 선택지: (A) 팝업 — `dataItemMng` 의 "CSV 업로드" 버튼으로 열고 page.tsx·메뉴 leaf 없음 / (B) 독립 화면 — page.tsx·메뉴
    leaf·포털 직접 진입(screenId 에서 `Pop` 을 뗀다)
  - 택한 것: (A) 팝업
  - 근거: `docs/mdm/screens/README.md` §4 가 이 판단을 이 작업에 인계하며 팝업을 권장했고, 리포 규칙(팝업은 page.tsx·메뉴
    금지)과 같은 모양의 병합된 선례 `dma/termRegPop`(TSK-04-04)이 있다(리포 관례). spec 의 entry-point 도 "항목 관리 > CSV
    업로드" 로 항목 관리 아래에 둔다. 다만 수용 기준 문구 "포털 메뉴에서 화면이 열리고 e2e `mdm-dataCsvUploadPop.spec.ts`
    가 통과한다" 를 "포털 메뉴로 항목 관리를 열고 CSV 업로드 버튼으로 팝업을 연다" 로 재해석했으므로 확인을 받는다.
    공용 결정 기록 `docs/mdm/decisions.md` D-TSK-07-04-1.
  - 반려되면: `pages/dmd/dataCsvUploadPop/page.tsx` 와 메뉴 leaf 시드를 더해 독립 화면으로 승격하고, screenId 에서 `Pop` 을
    떼어 식별자 사전에 등재한다. e2e 는 포털 메뉴에서 직접 여는 시나리오로 바꾼다(DDL 영향 없음).

나머지는 모두 TSK-07-01·07-03 이 이미 확정한 계약 위에서 결정 가능한 범위였다.

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님) — `dflow.sh config no_docker` 확인 결과 빈 값(설정 스위치는 꺼짐),
  wbs.md TSK-07-04 태그(`05, tree, csv`)에 `docker` 없음 → 팀장이 `DOCKER=allow` 를 싣지 않은 기본 금지다.
- 생략한 검증 없음 — 기준선 다섯 명령을 그대로 돈다. 이번 작업은 새 DDL·Flyway 마이그레이션이 없고(TSK-07-01 계약
  재사용), Testcontainers 를 쓰는 테스트(`mssqlMigrationTest` 류)를 새로 만들지 않는다.
- 참고(생략이 아니라 확인): `mssqlMigrationTest` 는 애초에 기준선 다섯 명령에 없고 `testAll` 에도 묶여 있지 않다
  (`src/backend/mdm/api/build.gradle`: "docker 가 필요하므로 test/testAll 에 연결하지 않는다", "워커 게이트는
  SQLite(testAll)만 쓰고, 이 태스크는 개발 브랜치 머지 뒤 팀장의 방언 검증(dialect_check)에서만 돈다") — 이 Task 가
  도커 금지 때문에 뺀 것이 아니라 원래 워커 범위가 아니다. B1 이 `DataItemListQuery` 에 더하는 새 네이티브 SQL(노드
  필터 WHERE 절·`treeRows`)은 기존 `page()` 와 같은 이식성 방식(파라미터 바인딩·Hibernate `setFirstResult`/
  `setMaxResults`, 리터럴 LIMIT/OFFSET·TOP 없음)만 써서 MSSQL 방언 위험을 낮췄고, MSSQL 실측은 다른 dmd 네이티브
  SQL(TSK-07-01·07-03)과 같은 절차대로 머지 뒤 팀장 `dialect_check` 1회가 본다.
