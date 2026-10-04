# MDM 화면 렌더링 성능 — 1차 findings

- 브랜치: `perf/render-mdm` / 워크트리: `.claude/worktrees/perf-render`
- 기준: `dev` 6a016622
- 하네스: `scripts/perf/render/` (README 는 그 폴더)
- 출발점: `docs/idea.md` 111~115 절 「리팩토링 후속 → 화면 렌더링 시간 측정」

## 0. 이 문서의 상태 — 아직 수치가 없다

**이 문서는 측정 전 단계의 가설 목록이다.** 수치 칸은 비어 있고, 아래 각 항목은
「코드에서 직접 읽어 확인한 사실」과 「측정해야 확인할 추측」을 구분해 적었다.

- [x] 기존 측정 자산 확인 (`docs/refactor-2026-10/perf-frontend.md`, `structure-frontend.md`, `scripts/perf/frontend/`)
- [x] 5개 대상 화면 코드 정적 분석 — **가설 + 근거 file:line**
- [x] 측정 하네스 작성 — **문법 확인까지만. 실행하지 않았다**
- [ ] **1차 스캔 수치** — 「측정 시작」 신호를 기다리는 중
- [ ] 느린 Top 3 심층 분석 (CDP trace + React Profiler + 코드 읽기)
- [ ] 수정안 — **수정은 이번 단계 범위가 아니다.** 조정자 보고 → 사용자 승인 뒤 별도 시작

측정을 시작하지 않은 이유는 조정 세션의 측정 창 때문이다(다른 레인이 빌드 시간을 잰다).
CPU 를 많이 쓰는 일(`next build` 포함)은 「측정 시작」 뒤로 미뤘다.

---

## 1. 지표와 측정 방법 (무엇을 재는가)

`docs/idea.md:113` 이 정한 원 지표는 **메뉴 클릭 → 그리드 첫 행 표시** 다. 그런데 코드 확인 중
중요한 사실이 하나 나왔다.

> **MDM 목록 화면은 진입할 때 목록을 자동 조회하지 않는다.**
> (`src/frontend/e2e/support/mdm-e2e.ts:66-68` 주석 — "의도된 제품 변경, cf4fbb05 2026-10-02")

즉 사용자가 하는 실제 동작은 `메뉴 클릭 → [조회] 클릭 → 첫 행` 이고, "메뉴 클릭 → 첫 행" 하나로 재면
**사람이 조회 단추를 누르기까지의 대기 시간** 이 섞인다. 그래서 세 구간으로 따로 잰다.

| 지표 | 구간 | 왜 필요한가 |
|---|---|---|
| `shellReadyMs` | 메뉴 잎 클릭 → 화면 틀(breadcrumb) | 화면 골격 비용. 데이터와 무관 |
| `searchToRowMs` | [조회] 클릭 → 그리드 첫 행 | 렌더·데이터 반영 비용 |
| `clickToRowMs` | 메뉴 잎 클릭 → 그리드 첫 행 | idea.md 의 원 지표(위 둘의 합) |

여기에 long task 수·합계, API 호출 수·시간, CDP `Performance` 델타(script·task·layout·recalcStyle),
DOM 노드·힙 증감, React 커밋 수를 함께 잰다. 화면당 3회 이상·중앙값·load(1분) 초과 회차는 버린다
(`scripts/perf/render/README.md`).

**탭 상태를 두 갈래로 잰다**(`cold` / `warm`). 근거:

- `shared/src/portal-shell/portal-shell.tsx:133` 주석 — "본문은 isActive 와 무관하게 고정한다"
- `shared/src/portal-shell/portal-shell.tsx:154` — `style={{ display: isActive ? "flex" : "none" }}`
- `shared/src/portal-shell/use-portal-tabs.ts:190-196` — 이미 있는 탭은 `setActiveTabId` 만 한다(재마운트 없음)

즉 **숨겨진 탭의 화면은 마운트된 채 살아 있다.** 탭을 많이 열어 둔 사용자에게는 화면 N개가 동시에 살아 있고,
숨겨진 화면도 리사이즈 이벤트와 Meta 응답을 받는다. 이것이 `warm` 측정 항목을 새로 만든 이유다.

---

## 2. 공통 계층 — 5개 화면이 모두 지나는 길

`src/frontend/shared/src/components/grid/AgDataGrid.tsx` (약 1912줄). 화면마다 고친 게 아니라
여기서 고쳐야 하는 항목이 많다.

### A1. ★부정 발견★ `columnSizing="auto"` + `autoSizeOnDataUpdate` storms 는 5개 화면 모두에 없다

가장 흔하게 의심되는 원인이 **이 5개 화면에는 해당하지 않는다.** 이 사실을 먼저 고정한다(측정 방향을 틀리게 잡지 않으려고).

- 래퍼 기본값은 `columnSizing = "auto"`(`AgDataGrid.tsx:1007`), `autoSizeOnDataUpdate = true`(`:998`).
  이 조합이면 데이터 변경마다 `onRowDataUpdated`(`:1402`) → `scheduleAutoSizeAllColumns`(`:1343`) →
  `autoSizeAllColumns(false)`(`:1334`) 로 **모든 셀의 컨텐츠 폭을 DOM 측정**한다. 강제 레이아웃이 반복된다.
- 그런데 **5개 화면의 `<AgDataGrid>` 11개 전부가 `columnSizing="fit"` 을 명시한다.**
  `shouldAutoSizeColumns` 은 `false` 가 되고(`:1029`), `autoSizeAllColumnsHandler` 는 `:1332` 에서,
  `fillRemainingColumnSpace` 는 `:1309` 에서 즉시 return 한다.
- 기계적으로 확인한 근거 (2026-10-04, `<AgDataGrid` 등장 수와 `columnSizing` 등장 수를 줄마다 대조):

| 파일 | `<AgDataGrid` | `columnSizing` | 근거 |
|---|---|---|---|
| `dma/termMng/page.tsx` | 2 | 2 | `:309`, `:400` |
| `dma/columnMng/page.tsx` | 3 | 3 | `:615`, `:683`, `:980` |
| `dmb/layoutConfirm/page.tsx` | 2 | 2 | `:318`, `:392` |
| `dmd/dataMng/page.tsx` | 1 | 1 | `:408` |
| `dmd/dataMng/DataDetail.tsx` | 1 | 1 | `:180` |
| `dmc/codeMng/page.tsx` | 1 | 1 | `:519` |
| `dmc/codeMng/CodeDetail.tsx` | 1 | 1 | `:331` |
| **합계** | **11** | **11** | 전부 `"fit"` |

→ 측정에서 "조회 후 autoSizeAllColumns 때문에 느리다" 는 결론이 나오면 **틀린 결론**이다. 그 경로는 없다.

### A2. 그런데 `fit` 모드에도 남는 강제 레이아웃이 있다 (5개 화면 공통)

`autoSize` 가 꺼져 있어도 아래 비용은 남는다. 그리고 **아무 효과가 없는 no-op** 이다.

- `AgDataGrid.tsx:1353-1362` `scheduleFillRemainingColumnSpace` 는 타이머(150ms) 뒤
  `fillRemainingColumnSpace()` 를 부르고 **그 다음에 `containerRef.current?.clientWidth` 를 읽는다**(`:1360`).
  `clientWidth` 읽기는 강제 레이아웃(리플로우)을 일으킨다.
- 그런데 `fillRemainingColumnSpace` 안의 `AgDataGrid.tsx:1309` 가 `if (columnSizingRef.current === "fit") return;` 이다.
  → **리플로우를 일으키고 아무것도 하지 않는다.**
- 언제 도나: 데이터 갱신(`:1409`), 첫 데이터 렌더(`:1399`), 컨테이너 폭 변경(`:1431`).
  컨테이너 폭 변경은 탭이 다시 보일 때(width 0 → 양수) 매번 일어난다.
- 크기: 힌트다(측정 대상 아님 — A1 이 무효화했으므로). 다만 **제거 비용이 거의 0** 이므로 수정안 1순위로 올린다.

### A3. MDM 메타가 늦게 도착하면 열 정의가 통째로 다시 만들어진다

- `useGridMdm`(`AgDataGrid.tsx:881-893`)는 메타 **내용**이 바뀔 때만 새 객체를 낸다(값 고정 장치).
- 그런데 `useMdmColumns` 가 `loading:true → 실제 컬럼` 으로 전이하는 것이 내용 변화다.
  → `mdm` 정체성 바뀜 → `columnDefs` useMemo 재계산(`:1079-1114`) → 새 배열이 `AgGridReact` 로 들어감(`:1833`).
- 래퍼 주석(`:877-879`, `:1130-1132`)이 스스로 "열 정의를 다시 넣으면 ag-grid 가 머리 셀을 다시 붙인다" 고 기록한다.
- **화면 진입 시 화면당 1회, 그리드 2개면 2회.** 여기에 `MdmHeaderLabel` 이 붙은 열이 있으면 `refreshHeader`(`:1149`)도 돈다.
- **확인됨**: `useMdmColumns` 는 `sig` 문자열로 effect 를 막고(`mdm-meta/context.tsx:98-123`) 저장소도
  16ms 배치 + in-flight 중복 제거 + 5분 TTL 이라 **메타 요청 자체는 중복되지 않는다.** 문제는 메타 **적용** 시점이다.

### A4. 데이터가 바뀌면 모든 행을 한 번 훑는다 (5개 화면 공통)

- `AgDataGrid.tsx:1553-1577` 의 effect 가 `data` 를 전부 순회하며 행마다 `Map` 삽입 + 템플릿 문자열 1개씩 만든다.
  deps 에 `data` 가 있다 → **행 배열 정체성이 바뀔 때마다** 실행.
- 5개 화면 중 `_rowState` / `nativeeditor_status` 를 쓰는 곳은 없다. → 순수한 낭비.
- 데이터 규모(용어 사전 등)가 커질수록 O(n) 이 커진다.

### A5. `AgDataGrid` 는 `memo` 다 — 인라인 화살표가 하나만 있어도 깨진다

- `AgDataGrid.tsx:1911` `export const AgDataGrid = memo(AgDataGridComponent)`. 비교 함수가 없다(기본 shallow).
- **5개 화면 전부** `onRowClick` 을 인라인 화살표로 넘긴다. 그 한 개만으로도 `memo` 가 깨진다.

| 화면 | 근거 |
|---|---|
| termMng | `dma/termMng/page.tsx:315` |
| columnMng | `dma/columnMng/page.tsx:621`, `:987` |
| layoutConfirm | `dmb/layoutConfirm/page.tsx:323` |
| dataMng | `dmd/dataMng/page.tsx:418` |
| codeMng | `dmc/codeMng/page.tsx:529`, `CodeDetail.tsx:336` |

(7줄 전부 `grep -n 'onRowClick={'` 로 기계적으로 재확인했다. 5개 화면 전부다.)

- 파급: `AgDataGridComponent` 본문(약 800줄) 재실행 + `onRowClick` 를 deps 에 둔 연쇄 콜백
  (`moveRowCursor` `:1594`, `handleRowClicked` `:1625`, `handleContainerKeyDown` `:1678`) 재생성 → `AgGridReact` 로 새 prop.
- **중요 단서**: 각 화면의 `columns` 와 `data` 는 이미 잘 만들어져 있다(§3 참조). 즉 **이건 지저분한 것이고
  고치기 쉽다.** 측정에서 "그리드가 매번 다시 그려진다" 는 결과가 나오면 여기다.

### A6. 레이아웃 껍데기가 매 렌더 다시 만든다

- `shared/src/layout/PageLayout.tsx:117-135` `effectiveButtons` 의 useMemo deps 에 `buttons` 가 있다.
  화면이 `buttons={[...]}` 인라인 배열을 넘기면 memo 가 **매번** 깨지고,
  `PageLayout.tsx:137-150` 의 effect 가 **매 렌더마다 `document` keydown 리스너를 떼고 다시 단다.**
  근거 — termMng `page.tsx:285-291`, columnMng `page.tsx:553-578`, dataMng `page.tsx:360-362`, codeMng `page.tsx:485-487`.
- `shared/src/layout/ContentBody.tsx:308` `ParentBodyContext.Provider` 의 `value={{...}}` 가 **매 렌더 새 객체**다.
  context 값 정체성이 바뀌면 아래쪽 consumer 의 `memo` 를 **무시하고** 전부 다시 그린다.
  `ContentBody.tsx:199` `React.Children.toArray` 도 매번 돈다.
  근거 — dataMng(리사이즈 패널 3개), codeMng(3개), columnMng(2개).
- `shared/src/portal-shell/use-user-button-rbac.ts:210-212` `canDoButton` 는 `state.rows` 를 선형 훑으며
  **행마다 `toLowerCase()` 를 부른다.** 렌더 본문에서 부르고 memo 가 없다.
  호출 횟수 — codeMng **12~14회/렌더**, dataMng 1~3회, layoutConfirm 2회.

### A7. `/api/auth/me` 가 구독자마다 한 번씩 다시 불린다

- `use-user-button-rbac.ts:150-183` — 훅 인스턴스마다 effect 가 `fetchCurrentUserId()`(`:64-73`) 를 부른다.
- **in-flight 중복 제거는 RBAC POST 에만 있다**(`:170`). `/api/auth/me` GET 에는 없다.
- 화면 첫 진입 시 구독자 수만큼 같은 GET 이 나간다 — layoutConfirm **3회**, dataMng **5회**, codeMng **5회**(추정).
- ⚠️ **추측 부분**: 요청 횟수는 코드에서 읽은 것이고, 브라우저 실측 요청 수는 아직 아니다.

### A8. 셀마다 래퍼 콜백 2개

- `AgDataGrid.tsx:810-825` — 커스텀 `render` 가 없는 **모든** 열에 `valueFormatter` 클로저를 단다.
  단순 문자열 열에서는 `String(value)` 로 떨어진다.
- 여기에 `defaultColDef.tooltipValueGetter`(`:1118-1128`)까지 겹쳐 **보이는 셀마다 래퍼 2개 호출**.
- 전 화면 공통이고 셀 수에 비례한다. 공유 래퍼 고치지 않으면 화면마다 손대야 한다.

### A9. `height="auto"` 는 가상 스크롤을 끈다 (2개 화면)

- `AgDataGrid.tsx:1817` `isAutoHeight` → `:1890` `domLayout={isAutoHeight ? "autoHeight" : "normal"}`.
  `autoHeight` 는 **가상화 없이 모든 행을 그린다.**
- 쓰는 곳 — columnMng `page.tsx:687` (토큰 그리드), dataMng `DataDetail.tsx:179-187` (카테고리 그리드).
- 두 곳 모두 행 수가 작은 목록이라 규모는 제한적이다. 다만 `autoHeight` 는 데이터 변경마다 전 행을 다시 재배치한다.

---

## 3. 화면별 가설

각 항목 형식 — 근거 / 기전 / 예상 증상 / 신뢰도. **아무것도 측정하지 않았다.**

### 3.1 용어 관리 `dma/termMng` — 우선순위 1

| # | 근거 | 기전 | 예상 증상 | 신뢰도 |
|---|---|---|---|---|
| T1 | `page.tsx:182-200` (deps `:198`, 요청 `:190`), `api.ts:88-96` | `useDebouncedEffect(..., 300)` 가 표기·정의·영문명 중 **어느 하나라도** 300ms 조용해지면 `compare` 를 서버로 한 번 더 부른다. 11개 입력칸 중 3개가 대상이고 정의는 여러 줄 text area — 붙여넣기 후 편집하면 여러 번. 응답마다 `setCandidates` → 추천 그리드 `rowData` 재적용 | 입력할 때마다 끊깐 지연. 타이핑 속도에 따라 서버 부하 증가 | **high** |
| T2 | `page.tsx:251-278` (deps `:277` = `[form, ...]`) | 추천 그리드 `recoColumns` 가 `form` **객체 전체**를 deps 로 쓴다. `form` 은 입력 한 글자마다 새 객체(`:62`, `:123-125`). → `columns` 정체성 변화 → `buildColumnDefs` 재실행(`AgDataGrid.tsx:1079`) → `leafColDef` 가 `cellRenderer` 를 **새 화살표로 감싼다**(`:806-809`) → `AgGridReact` 가 새 `columnDefs` 를 받음. 그런데 `form` 은 오직 `disabled={!form}` 에만 쓰인다 — 불리언이면 충분 | 상세 폼 입력 중 미세 지연(추천 목록은 안 바뀜). 래퍼 주석(`:1038-1039`, `:1050-1051`)이 "새 열 정의 = 머리 셀 재부착" 이라 기록 | **high**(기전) / medium(규모) |
| T3 | `page.tsx:184-188` | `setCandidates([])` — `[]` 는 매번 새 객체라 `Object.is` bail-out 이 안 되고 → `recoRows`(`:238-250`) 재생성 → ag-grid `rowData` churn. 화면 진입 300ms 후, 조회·저장·삭제마다(모두 `form` 을 `null` 로 리셋), 표기가 2자 미만일 때마다 | 입 후·조회 후 보이지 않는 추가 렌더 | medium-high |
| T4 | `page.tsx:396-407` | 추천 그리드가 **조건 없이 항상 마운트**된다(후보 0건·`form` null 일 때도). 이 포털은 숨은 탭을 죽이지 않으므로(§1) **열린 탭 수만큼 그리드가 2배씩 살아 있다** | 탭 전환 진입이 느려지고, 탭이 쌓일수록 메모리·DOM 증가 | medium |
| T5 | `page.tsx:396` + `AgDataGrid.tsx:1315` | 숨은 탭은 컨테이너 폭이 0이다. `fillRemainingColumnSpace` 의 `gridWidth > 0` 가드 덕에 `sizeColumnsToFit` 은 건너뛴다. 다만 타이머·리플로우(A2)는 그대로 탄다 | 숨은 탭이 미묘하게 CPU 를 먹음 | medium |
| T6 | `page.tsx:83-96` (deps `[filters]`), `:285-291` | `handleSearch` 가 `filters` 객체에 키'd → 매 입력 새 정체성 → `handleSave`(`:162`)·`handleDelete`(`:179`) 도 새 정체성 → A6 의 `buttons` 재계산을 유발. **추가 렌더는 없다** | 없음(정체성 churn) | high(구성)/low(비용) |

**termMng 의 확정 사항**: `columns`(`TERM_COLUMNS` `:37-44`)·`RECO_COLUMNS_BASE`(`:47-53`)는 모듈 상수다.
**메인 그리드의 열 정의는 안정적이다.** 불안정한 것은 추천 그리드뿐이다(T2). 조회는 단추로만 한다 — 진입 시 중복 조회 없음.

### 3.2 컬럼 사전 `dma/columnMng` — 우선순위 2

5개 중 `page.tsx` 가 가장 크다(39100바이트).

| # | 근거 | 기전 | 예상 증상 | 신뢰도 |
|---|---|---|---|---|
| C1 | `page.tsx:586,595` 등 약 18개 입력 상태가 페이지 최상위(`:802,813,836,890,911,919,662`) | 상태가 하나도 나뉘어 있지 않다. 검색어 한 글자에도 `MdmPageLayout` + 패널 2개 + Mantine Input 약 13개 + `DescriptionField` 2개 + 그리드 3개가 전부 재조정된다. debounce·자식 컴포넌트 분리·`memo` 경계가 하나도 없다 | 검색어 입력만 바꿔도 패널 전체가 미세하게 깜빡인다 | **high** |
| C2 | `page.tsx:244`(증가), `:387`, 사용처 `:927`, `:940` | `key={`description-${formSeq}`}` — 행을 열 때마다 `DescriptionField` 2개가 **unmount 후 재마운트**된다(형식 재감지 목적). HTML 형식이면 `HtmlEditor`(contentEditable) 인스턴스까지 새로 만들어졌다가 버려진다 | 행 클릭마다 우측 하단 상세 패널이 순간적으로 흔들림. 포커스도 잃음 | high(기전)/medium(규모) |
| C3 | `page.tsx:417-420` | 저장 후 `saveColumn` → `loadList` → `openColumn` 3연속 왕복. 그런데 `loadList` 과 `openColumn` 은 **의존 관계가 없다**(둘 다 `result.columnId` 만 필요). 최소 2회 | [저장] 후 바쁨 표시가 3회 왕복 동안 유지된다 | high |
| C4 | `page.tsx:462-495` (deps `[genTokens, ...]`), `:318-322` | 토큰 후보를 고를 때마다 `genTokens` 가 새 배열 → `tokenColumns` 재계산 → `mdmLeafEntries`(`AgDataGrid.tsx:883`)·`useMdmColumns` 의 `sig` 문자열(`context.tsx:97-98`)·`columnDefs`(`:1079`) 모두 다시 | 후보를 고를 때마다 그 표가 잠깐 재측정된다 | medium |
| C5 | `page.tsx:203-213` | `list.map(r => ({...r, ...}))` — 조회가 바뀔 때마다 모든 행이 새 객체. `getRowId` 는 `columnId` 기준이라 ag-grid 는 행 노드를 유지하지만 `rowNode.data` 가 전부 달라져 **N개 행을 다시 칠한다**(실제로 바뀐 건 1행) | [조회]·[저장] 뒤 목록 전체가 아주 잠깐 깜빡인다 | medium-high |
| C6 | `page.tsx:687` + `AgDataGrid.tsx:1817,1890` | 토큰 그리드가 `domLayout="autoHeight"` — 가상화 없음. C4 와 겹쳐 매 조작마다 전 행 재배치 | 토큰 표가 고를 때마다 reflow | medium |
| C7 | `page.tsx:719-731` | Mantine `Select` 에 `options={[{...}, ...gen.domains.map(...)]}` 인라인 — 매 렌더 새 배열 + 새 map | 검색어 입력마다 콤보박스까지 재조정 | high(기전)/low-medium(비용) |

**columnMng 의 확정 사항(부정 포함)**: `columns` 는 깨끗하다 — `LIST_COLUMNS` 가 모듈 상수(`:65-73`),
`tokenColumns`·`systemColumns` 는 `useMemo`. 인라인 열 배열 없음. `excelExport`·`fieldErrors`·`mdmValidate` ·
`getRowClassExtra` 를 **전혀 넘기지 않아** `issuesEnabled` 가 `false`(`AgDataGrid.tsx:1052`) →
`:1205-1219` 의 무거운 effect(`indexFieldErrors` + 전체 맵 `JSON.stringify` + `refreshCells({force:true})`) 는 **비활성**이다.
모달은 `memo` + Mantine `ModalBase` 가 닫히면 `null` 이라 마운트 비용이 없다(`termRegPop.tsx:90-92` 의 `open` 가드).

### 3.3 전문 헤더 정의 `dmb/layoutConfirm` — 우선순위 3

| # | 근거 | 기전 | 예상 증상 | 신뢰도 |
|---|---|---|---|---|
| L1 | `page.tsx:248,298`, `shared/src/components/form/DateTimePicker.tsx:127-134` | `DateTimePicker` 가 **해석 가능한 중간 문자열마다** `onChange` 를 부른다. `2026-07-01 09:30:15` 를 입력하면 약 15~17회. `LayoutConfirmPage` 에 `useState` 11개(`:92-101`), `DraftList`(`:298`)·`ValidateArea`(`:336`) 는 **평범한 함수 컴포넌트**라 memo 경계가 없다 | 검사 후에는 입력 한 글자마다 좌측 그리드와 검사 목록(`:352-356`) 이 전부 다시 그려진다 | **high** |
| L2 | `page.tsx:214,88`, `shared/src/layout/ContentBody.tsx:171`, `PageLayout.tsx:105` | A7 — `useUserButtonRbac` 구독자 3개 → `/api/auth/me` **3회 중복** | 탭 진입이 느리고 네트워크에 같은 요청이 3개 | high(요청 수)/추측(커밋 수) |
| L3 | `page.tsx:368`, `:374-382` | `impact={result.impact ?? []}` — 서버가 `impact` 를 안 주면 `?? []` 가 **매 렌더 새 배열** → `ImpactArea` 의 `useMemo([impact])` 깨짐 → 새 `rows` → `rowData` 재적용. `:162`, `:338` 도 같은 패턴, `:163-164` 는 `.filter()` 2회 순회 | 검사 결과가 비면 오른쪽 패널이 입력할 때마다 흔들린다(표가 비어 있어 비용은 작음) | medium |
| L4 | `page.tsx:313-330` | `{drafts.length === 0 ? <p/> : <AgDataGrid/>}` — 조회 결과가 0건이면 **그리드 인스턴스째 unmount**된다. 다음 조회에서 처음부터 다시 만들고(`useMdmColumns`·마운트 effect `:1371` 재실행) | 검색 결과가 비었다 돌아올 때 좌측 패널에 보이는 깜빡임 | medium |
| L5 | 화면 2개 + A3 | `mdm` 가 늦게 도착해 그리드당 한 번씩 열 정의를 다시 만든다(§A3) | 탭을 연 직후 머리글 잠깐 재계산 | medium |
| L6 | `checks.ts` | 순수 함수, O(checks) · 작은 배열. **문제 아님**(확인) | — | — |

**layoutConfirm 의 확정 사항**: `columns` 는 `DRAFT_COLUMNS`(`:45`) 모듈 상수, `data` 는 `useMemo([drafts])`(`:299`) →
**키 입력 중에 열 정의·행 데이터가 재구성되지 않는다.** `useMdmPageParams` 의 인라인 콜백은
`page-handoff.ts:48-63` 이 ref 에 담아 effect deps 가 `[componentPath, tabId]` 라 **안전**하다(의심했으나 배제).
진입 시 중복 조회도 없다(`handedOff.current` 가드 `:151`). 중첩 그리드·숨겨진 채 마운트된 무거운 UI 없음.

### 3.4 마루 데이터 `dmd/dataMng` — 우선순위 4

| # | 근거 | 기전 | 예상 증상 | 신뢰도 |
|---|---|---|---|---|
| D1 | `page.tsx:235-241` → `:226-233` → `:166-177` + `:204-224` | **행 클릭 1번이 상태 갱신 4파동을 만든다.** `setSelectedId`+`setMode` → `begin()` `setPending(n+1)`(`:119`) → 응답 후 `setView`+`setForm`+`setFormAuditVer`(`:192-200`) → `end()` `setPending(n-1)`. 그 사이 `stale`(`:291`)·`busy`(`:292`) 가 뒤집히며 상세 패널이 그렸다·가렸다 다시 그려진다. 페이지 하위 컴포넌트에 memo 경계가 하나도 없다(`PageLayout.tsx:91`, `SearchArea.tsx:45`, `ContentBody.tsx:170`, `ContentPanel.tsx:18` 전부 평범한 함수) | **행 클릭마다 150~250ms 지연.** 상세 패널이 "다시 잠기는" 게 보인다 | **high**(기전)/medium(규모) |
| D2 | `page.tsx:81`, `PageLayout.tsx:105`, `ContentBody.tsx:171`(×3) | A7 — 구독자 5개 → `/api/auth/me` **5회 중복**. 상세 분기(`:425-454`)가 리사이즈 패널 2개를 더 붙이므로 **첫 행 선택 때 2회 추가** | 첫 페인트가 느리고 네트워크에 동일 요청 5~7개 | high |
| D3 | `page.tsx:418` + A5 | 인라인 `onRowClick` → `memo` 깨짐. `handleRowClick` 자체는 이미 `useCallback`(`:235-241`)이므로 **인라인 래퍼가 안정성을 버리는 유일한 지점** | 입력 중에 끊기지 않는 작은 CPU | medium-high |
| D4 | `page.tsx:84-86` → `:266` → `:360-362,364,370-382` | `handleSearch` deps 에 `id`·`name`·`status` 3개 원소 → 입력마다 새 정체성. 인라인 `onKeyDown` 2개 추가 | 검색 칸 입력 지연 | high |
| D5 | `DataDetail.tsx:179-187` + A9 | 카테고리 그리드가 `height="auto"` → `domLayout="autoHeight"`(가상화 없음). `columns.tsx:12-30` 의 `cellRenderer` 가 **셀마다 React 요소 + style 객체 + onClick 클로저**를 새로 만든다. 그리트는 첫 선택 시(`:425`) 분기 전환으로 마운트되고, 오류 때마다(`:216`) 다시 만들어진다 | 데이터의 카테고리가 많으면 상세 패널이 무거워진다 | medium |
| D6 | `page.tsx:332-334` | 등록 후 `reloadList()` → `chooseDetail(id)` 2연속. 서로 독립 | 등록 후 지연 시간이 2배로 느껴진다 | high(기전)/low(비용) |
| D7 | `page.tsx:347`, `DataDetail.tsx:161-162` + A6 | `canDoButton` 선형 스캔을 렌더 본문에서 1~3회. `rbac.rows` 가 크면(관리자 계정) 입력 지터에 영향을 준다 | 계정 권한이 많을수록 체감 | medium |

**dataMng 의 확정 사항(부정 포함)**: `columns` 는 **안정**하다. `columns.tsx` 는 팩토리지만
`page.tsx:345` 가 `useMemo(() => buildDataMngColumns(), [])` 로 한 번만 호출한다.
`mdm` 도 `AgDataGrid.tsx:864-872` `sameGridMdmValues` 로 깊이 비교 고정된다.
`excelExport` 미사용. N+1(행마다 요청) 패턴 없음. `MessageProvider` 는 context 값을 memo 한다(`message-provider.tsx:152`).
render·`useMemo`·무방어 effect 에서 데이터 로드를 부르는 곳 없음.

### 3.5 마루 코드 `dmc/codeMng` — 우선순위 5

보조 UI 가 가장 많다(상세 패널 + 등록 폼 + 모달 2개).

| # | 근거 | 기전 | 예상 증상 | 신뢰도 |
|---|---|---|---|---|
| K1 | `page.tsx:363` → `:545,560` | `form` 이 페이지 최상위 상태. 입력 한 글자에 `CodeHeaderCard`+`CodeLabelsCard`+`CodeVersionCard` 가 새로 그려진다. `ATTR_KEYS` 는 10개(`edit-types.ts:6`)라 `CodeDetail.tsx:219-235` 에 Input 10개. shared `Input` 은 memo 없는 Mantine `TextInput` 래퍼이고 렌더마다 `attributes`·`classNames` 를 새로 만든다(`shared/src/components/form/Input.tsx:29,57,63`) | 상세 입력 필드가 체감 없이 무겁다. 데이터가 안 바뀌어도 좌측 그리드가 "깜빡인다" | **high** |
| K2 | `page.tsx:270-276` → `:261-268` → `:239-259`, `AgDataGrid.tsx:1594,1712` | ↑/↓ 커서 이동이 `onRowClick` 으로 들어온다. **키 한 번에 상세 요청 1회 + 렌더 여러 번.** `begin`/`end` 렌더 2회(`:142-143`), `writeSnapshotTarget` → 포털 부모 렌더(`:145-154`), 응답 후 `apply`(`:214`) 렌더. `detailSeq` 는 응답을 버리기만 하고 요청을 취소하지 않는다 | 목록을 키보드로 내려갈 때 눈에 띄게 끊기고 버전 패널이 매 행마다 흔들린다 | **high** |
| K3 | `CodeDetail.tsx:333` (`data={view.versions}`) + `page.tsx:223` | `view` 가 응답마다 새 서버 객체 → `versions` 배열 정체성이 **행 클릭마다** 바뀐다. 내부 파급: `sortedData` 두 번 `.filter()`(`AgDataGrid.tsx:1786-1790`) → `rowData` 재적용 → `onRowDataUpdated`(`:1402`) → `sizeColumnsToFit`(`:1316`) **강제 레이아웃** → A4 의 행 전수 순회 | 행마다 버전 목록 열이 미세하게 reflow | high(기전)/추측(ag-grid 내부 작업) |
| K4 | `page.tsx:473,476`, `CodeDetail.tsx:284-308`(9회)·`:103-105`(3회) + A6 | `canDoButton` 선형 스캔 **12~14회/렌더**. 각 행마다 `toLowerCase()` 2회. K1 때문에 **입력 한 글자마다** 실행 | 권한이 많은 계정에서 체감 | high(기전)/medium(규모) |
| K5 | `page.tsx:328` | `view?.versions.find(...)` 를 매 렌더 실행, memo 없음. 새 정체성 → `runDraft`(`:377`)·`handleCancelConfirm`(`:386`)·`moveTo`(`:403`) 가 전부 새 정체성 → `VersionActionBar`(memo 아님, `m-mdm/src/shell/VersionActionBar.tsx:71`) 가 `Button` 8개를 다시 그림 | 페이지가 그릴 때마다 항상 | high(기전)/medium(규모) |
| K6 | `CodeDetail.tsx:278-282`(10키 객체), `:284-291,308`(객체 8개) | `VersionActionBar` 가 매 렌더 객체 리터럴 10개를 받는다 | K5 와 곱해짐 | high |
| K7 | `page.tsx:421-426` | 등록 후 `registerCode` → `reloadList` → `chooseDetail` 3연속. 뒤의 둘은 독립 | 등록 후 최소 대기 시간의 약 3배 | high |
| K8 | `page.tsx:101`, `PageLayout.tsx:105`, `ContentBody.tsx:171`(×3, `:506,539,540`) | A7 — 구독자 5개 → `/api/auth/me` 5회 | 첫 페인트 지연 | high(코드상 개수)/추측(실측) |
| K9 | `page.tsx:485-487`, `:513-516` + A6 | 인라인 `buttons` 배열 → `PageLayout` listener 재등록 매 렌더. `GridPanel`(`GridPanel.tsx:257` memo)도 깨짐 | 입력 중 숨은 CPU | high |

**codeMng 의 확정 사항(부정 포함)**:
- **모달은 비용이 아니다.** `NewVersionModal`(`:596-606`)·`HandoverModal`(`:607-615`)은 항상 마운트되지만
  shared `Modal` 이 `memo`(`modal.tsx:319`)이고 Mantine `ModalBase` 는 닫히면 `null` 반환 → DOM·그리드 없음.
  `inline onClose` 로 `memo` 가 깨지는 것은 4개 훅 정도라 무시할 만하다. **두 모달 모두 그리드를 담지 않는다.**
- `CodeRegisterForm` 은 `isRegOpen &&`(`:618`)로 정확히 가드된다.
- **진입 시 중복 조회가 없다.** `useMdmPageParams` 의 effect(`:280`)가 마운트 effect(`:290`)보다 먼저 선언되어
  `handedOff.current` 를 세팅하고, 마운트 effect 가 이를 확인한다(`:292`).
- **탭을 다시 열어도 조회하지 않는다.** `useMdmPageParams` 는 파라미터를 한 번만 소비한다(`page-handoff.ts:33-40`).
- `CodeDetail.tsx:271` `useMemo(() => versionColumns(view.me), [view.me])` — 원시값에 키'd 라 버전 그리드 열 정의는 안정.
- `buttons.ts:46-87` `versionButtons` 는 순수 O(V) 이고 `page.tsx:474` 에서 `useMemo` — 문제 없다.
- effect deps 에 새 객체·배열 리터럴이 있는 곳 없음.

---

## 4. 측정에서 확인해야 할 것 (우선순위)

1. **A1 은 측정으로 재확인할 필요가 없다** — 코드에서 이미 확정했다. "autoSize 때문에 느리다" 는 결론을 버려라.
2. **A5 가 체감 시간의 큰 몫을 차지하는가** — 5개 화면 전부 해당한다. 열 정의가 실제로 재적용되는지
   trace 의 `columnDefs` 갱신 이벤트로 본다. 가능하다면 인라인 래퍼 1개만 `useCallback` 으로 바꾼 뒤
   A/B 로 재측정하면 **가장 값싸게 확인할 수 있는 가설**이다(화면 5곳, 수정량 최소).
3. **A6 의 리스너 재등록·컨텍스트 재생성** — `document` keydown 리스너가 렌더마다 떼어졌다 붙는 것이
   trace 에 잡히는지는 본다. 잡히지 않아도 CPU 는 쓴다.
4. **A7 의 중복 요청 수** — 네트워크 로그로 실측. 계정·패널 구성에 따라 개수가 다르다.
5. **K2(커서 이동)·D1(행 클릭 1번의 4파동)** — 이 둘이 "클릭 반응" 체감의 주 후보다. 상위 2개로만 2차 파고든다.
6. **A2 의 강제 레이아웃** — `RecalcStyleCount`·`LayoutCount` 가 조회 1회당 몇 회씩 늘는지. 5개 화면 공통이라 제거 비용 대비 효과가 크다.
7. **T1(용어 추천 300ms 디바운스 왕복)** — 서버 로그와 네트워크로 확인. 화면 성능이 아니라 서버 부하 문제일 수 있다.

1차 스캔이 끝나면 **느린 Top 3** 를 정해 2차에서 CDP trace + React Profiler 데이터 + 코드 읽기로 깊게 파고,
`수정안(예상 효과·위험·공통 컴포넌트 변경 여부)` 을 이 문서에 추가한다.
**제품 코드 수정은 하지 않는다** — 특히 `@dk-oasis/shared` 의 기존 props·동작 변경은 사용자 승인 대상이다(`CLAUDE.md`).

---

## 5. 이 문서의 한계

- **아무 수치도 없다.** 전부 코드 읽기와 파일럿 근거다. 측정으로 확인·기각되지 않은 항목은 가설이다.
- **ag-grid 내부 동작은 추측이다.** 각 화면 분석에서 `node_modules` 를 읽지 못했다.
  `columnDefs` 정체성 변화가 열 상태 재적용을 유발한다는 판단은 **래퍼 자신의 주석**(`AgDataGrid.tsx:1038-1039`,
  `:1129-1132`)에서 온 것이다. 실제로 어떤 일이 하는지는 프로덕션 번들 trace 로 봐야 한다.
- **행 수·카테고리 수·`rbac.rows` 길이를 재지 않았다.** O(n)·O(rows) 성질의 절대 비용은 모른다.
- **로컬 SQLite 데이터 규모**라 운영보다 차이가 작게 나올 수 있다(`docs/idea.md:115`).
- **헤드리스 단일 브라우저 1개.** 첫 회차가 그 뒤보다 느리다(파일 캐시·JIT). 중앙값으로 줄인다.
- **계정 권한에 따라 목록이 비면** `clickToRowMs` 가 나오지 않고 `shellReadyMs` 만 나온다. 그 경우는 표에 "0건" 으로 적는다.
- **숨은 탭 유지의 실제 비용**(A9·T4·§1)은 `warm` 측정에서만 드러난다. `cold` 만 보면 놓친다.
