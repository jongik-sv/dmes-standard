# AgDataGrid

데이터 목록(머리행 + 데이터 행 반복)을 화면에 표로 그릴 때 쓴다. 열 정의는 `GridColumn` 으로 준다.

- import: `import { AgDataGrid, GridBadge, type GridColumn } from "@dk-oasis/shared/grid";` (CSS 는 `AgDataGrid` 가 스스로 불러오므로 화면에서 따로 import 하지 않는다)
- 소스: `src/frontend/shared/src/components/grid/AgDataGrid.tsx`
- 내부 구현: ag-grid-community 33 `AgGridReact` (shared 를 고치는 개발자용 참고. 화면은 `ag-grid-react`·`ag-grid-community` 를 import 하지 않는다)
- `DataGrid` 는 `AgDataGrid` 의 별칭이다. 새 화면은 `AgDataGrid` 로 쓴다.

## 언제 쓰나

- 쓴다: 조회 결과 목록, 편집 가능한 목록, 팝업·카드 안의 작은 목록(`height="auto"`).
- 쓰지 않는다: 라벨-값 짝의 상세 폼 표 → [detail-form](detail-form.md). 비교 매트릭스(피벗) 표 → [matrix-table](matrix-table.md).
- 제목·건수·행추가 버튼이 필요하면 [GridPanel](grid-panel.md) 안에 넣는다. 저장형 화면의 행 상태는 [use-grid-data-manager](use-grid-data-manager.md) 가 맡는다.

## 표준 사용

```tsx
import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";

type InspRow = { inspNo: string; itemNm: string; inspDt: string; qty: number; judge: string; remark: string };

// 열 정의는 컴포넌트 밖 모듈 상수로 둔다(매 렌더 새 배열을 만들지 않는다).
const COLUMNS: GridColumn[] = [
  { key: "inspNo", header: "검사번호", width: 120, align: "left" },
  { key: "itemNm", header: "품명", width: 180, align: "left" },
  { key: "inspDt", header: "검사일자", width: 100, align: "center" },
  { key: "qty", header: "수량", width: 100, align: "right", type: "number" },
  {
    key: "judge", header: "판정", width: 80, align: "center",
    render: (v) => (
      <GridBadge
        label={String(v)}
        bg={v === "NG" ? "var(--color-danger-soft)" : "var(--color-success-soft)"}
        color={v === "NG" ? "var(--color-danger)" : "var(--color-success)"}
      />
    ),
  },
  { key: "remark", header: "비고" },
];

export function InspList({ rows, selectedId, isBusy, onSelect }: {
  rows: InspRow[]; selectedId: string; isBusy: boolean; onSelect: (id: string) => void;
}) {
  return (
    <GridPanel title="검사 목록" count={rows.length}>
      <AgDataGrid
        rowKey="inspNo"
        columns={COLUMNS}
        data={rows}
        columnSizing="fit"
        highlightedRowKey={selectedId}
        onRowClick={(r) => onSelect(String(r.inspNo))}
        loading={isBusy}
        getRowClassExtra={(r) => (r.judge === "NG" ? "ag-row-error" : undefined)}
      />
    </GridPanel>
  );
}
```

`emptyMessage`·`loadingMessage` 는 주지 않는다(기본값 "데이터가 없습니다."·"조회 중..." 으로 통일).

## 변형

### 열 폭: columnSizing

열이 8개 이하면 `"fit"`(가로 스크롤 없이 꽉 채움), 9개 이상이면 `"fixed"`(가로 스크롤)를 준다. `"fit"` 에서 `width` 는 픽셀이 아니라 비율 가중치다(120:180:100 으로 나눈다).

### 작은 목록

카드·팝업 안의 몇 행짜리 목록은 `height="auto"`(예: `<AgDataGrid height="auto" columnSizing="fit" … />`)로 행 수만큼 높이를 늘린다. 행이 많아질 수 있는 목록에는 쓰지 않는다(가상 스크롤이 꺼진다).

### 셀 편집

`editable: true`(또는 행별 함수)와 `cellEditor`("text"·"number"·"select"·"datetime")를 준다. select 는 `cellEditorValues`(문자열 배열), 행별 목록은 `cellEditorValuesGetter`, 라벨이 필요하면 `cellEditorValueLabels`·`cellEditorOptionsGetter` 를 쓴다. 값은 `onCellValueChanged` 로 받는다. 저장형 화면의 연결과 한계는 [use-grid-data-manager](use-grid-data-manager.md) 를 본다.

```tsx
{ key: "qty", header: "수량", width: 100, align: "right", type: "number", editable: true, cellEditor: "number" }
// <AgDataGrid … singleClickEdit onCellValueChanged={(p) => handleCell(p.rowKey, p.field, p.newValue)} />
```

### 셀·행 상태 색

셀은 `cellClassRules` 에 shared grid.css 의 클래스 `cell-light-pink`(오류) · `cell-warning` · `cell-edited` · `cell-emphasis` 를 건다. 행은 `getRowClassExtra` 로 `ag-row-error`(NG·오류 행)를 준다. 두 곳 모두 화면 CSS 에 색을 두지 않는다. 편집으로 행 클래스가 바뀔 수 있으면 `rowClassRefreshToken` 에 판정 집합(예: NG 행 키를 이은 문자열)을 넘긴다. 값이 바뀔 때 행을 다시 그린다.

```tsx
{ key: "qty", header: "수량", width: 100, cellClassRules: { "cell-light-pink": (r) => Number(r.qty) <= 0 } }
// <AgDataGrid … rowClassRefreshToken={rows.filter((r) => r.judge === "NG").map((r) => r.inspNo).join(",")} />
```

### 선택·행번호·열 그룹·행 드래그

- 선택: `selectable`(체크박스 열), `multiSelect`(여러 행 + 머리 체크박스), `selectedRows`(제어형), `onRowSelect`, `checkRowOnEdit`(편집한 행을 자동 체크).
- 행번호: `rowNumber` 는 맨 앞에 "No" 열(폭 56)을 둔다. 정렬하면 다시 매겨지는 표시 순서다.
- 열 그룹: `GridColumn.children` 이 있으면 그 항목은 열 그룹이고 잎만 데이터 열이다.
- 행 드래그: `rowDragField`(손잡이 열 key)와 `onRowOrderChange(orderedKeys)` 를 항상 함께 준다. 켜면 정렬이 꺼진다. 순서는 호출자가 `data` 를 다시 만들어 넘겨 확정한다.

## Props

자주 쓰는 props. 기본값은 소스의 구조분해 기본값이다.

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| columns | `GridColumn[]` | `[]` | 열 정의. 모듈 상수로 둔다 |
| data | `Record<string, unknown>[]` | `[]` | 행 데이터. 값을 바꿀 때는 새 배열·새 객체로 교체한다 |
| rowKey | `string` | `"id"` | 행 식별 열 key. 값이 비면 행이 서로 겹친다 |
| columnSizing | `"auto" \| "fixed" \| "fit"` | `"auto"` | 열 폭 방식. 표준은 8열 이하 fit, 9열 이상 fixed |
| height | `string \| number` | 부모 높이 100% | `"auto"` 면 행 수만큼 늘어난다 |
| highlightedRowKey | `string \| number \| null` | `undefined` | 값을 주면 화면이 커서를 소유하고(`null` 은 지움), 안 주면 그리드가 클릭·↑↓ 로 스스로 관리한다 |
| scrollToRow | `string \| number \| null` | `null` | 이 행이 가운데 오도록 스크롤한다 |
| onRowClick · onRowDoubleClick | `(row, event) => void` | - | 행 클릭·↑↓ 이동 시 호출 · 행 더블클릭 |
| loading | `boolean` | `false` | 로딩 오버레이. 로딩이 끝나고 0건이면 안내 문구를 다시 띄운다 |
| sortable | `boolean` | `true` | 머리 클릭 정렬. 열마다 `GridColumn.sortable: false` 로 끈다 |
| getRowClassExtra | `(row) => string \| string[] \| undefined` | - | 행에 추가할 클래스 |
| rowClassRefreshToken | `unknown` | - | 값이 바뀌면 행을 다시 그려 남은 클래스를 지운다 |
| onCellValueChanged | `(p: { rowKey, field, newValue, oldValue, row }) => void` | - | 편집 확정 시 호출. 열의 `editable` 이 참일 때만 발화 |
| singleClickEdit | `boolean` | `false` | 한 번 클릭으로 편집 시작 |
| rowNumber | `boolean \| { header?: string; width?: number }` | `false` | 맨 앞 행번호 열 |
| selectable | `boolean` | `false` | 행 체크박스 |
| multiSelect | `boolean` | `false` | 여러 행 선택. `selectable` 과 함께 쓴다 |
| selectedRows | `(string \| number)[]` | - | 제어형 선택 키 목록 |
| onRowSelect | `(ids, data) => void` | - | 선택 변경. 1건이면 data 가 객체, 아니면 배열이다 |
| checkRowOnEdit | `boolean` | `false` | 편집한 행을 자동 체크. `selectable` 이 있어야 한다 |
| emptyMessage · loadingMessage | `string` | `"데이터가 없습니다."` · `"조회 중..."` | 표준 화면은 주지 않는다 |
| rowDragField | `string` | - | 행 드래그 손잡이를 둘 열 key. 정렬이 꺼진다 |
| isRowDraggable | `(row) => boolean` | - | 행별 드래그 허용 |
| onRowOrderChange | `(orderedKeys) => void` | - | 드래그 후 새 순서의 행 키 목록. 이 prop 이 있어야 드래그가 동작한다 |

나머지 props.

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| isRowSelectable · onFocusedRowChange | `(row) => boolean` · `(row) => void` | - | 행별 체크 허용 · 칸 포커스가 다른 행으로 옮겨 갈 때 호출 |
| editArrowNavigation | `boolean` | `false` | 글자 편집 중 ↑↓ 로 같은 열의 다음 행 편집을 연다 |
| stopEditingWhenCellsLoseFocus | `boolean` | `true` | 칸이 포커스를 잃으면 편집을 끝낸다 |
| enableRowClickSelect · rowClickCheck | `boolean` | `false` | 행 클릭으로 선택·체크를 토글한다. `rowClickCheck` 는 편집 열이 있는 그리드에 쓰지 않는다 |
| selectExcludeColumns | `string[]` | `[]` | 클릭 선택에서 뺄 열 key |
| getRowHeight | `(row) => number \| undefined` | 26 | 행별 높이(여러 줄 셀) |
| wrapHeaderText · autoHeaderHeight | `boolean` | `false` | 머리 글자 줄바꿈 · 머리 높이를 내용에 맞춤 |
| alwaysShowHorizontalScroll | `boolean` | `false` | 가로 스크롤 막대를 항상 표시 |
| autoSizeColumns · autoSizeOnDataUpdate | `boolean` | `undefined` · `true` | auto 방식에서 내용 기반 폭을 끔 · 데이터가 바뀔 때 폭을 다시 잼 |
| onRowExpandCollapse | `(rowKey, expand) => void` | - | 트리형 목록에서 ←→ 로 펼침·접힘 |
| ariaLabel · emptyTestId · className | `string` | `"데이터 목록"` · - · `""` | 접근성 라벨 · 빈 상태 문구의 `data-testid` · 루트 클래스 |
| sizeToFit | `boolean` | 효과 없음 | 폐기됨. 선언만 있고 구현이 읽지 않는다 |

### GridColumn

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| key | `string` | 필수 | 행 데이터의 필드 이름 |
| header | `string` | 필수 | 머리 글자 |
| width | `number \| string` | 방식별 | fixed 는 픽셀(생략하면 120), fit 은 가중치(생략하면 1) |
| minWidth | `number` | 50 | 최소 폭 |
| align | `"left" \| "center" \| "right"` | `"left"` | 셀 정렬 |
| headerAlign | `"left" \| "center" \| "right"` | `"center"` | 머리 정렬 |
| type | `"string" \| "number" \| "boolean"` | - | number 는 천 단위 구분, boolean 은 Y/N 으로 표시(`render` 가 없을 때) |
| render | `(value, row) => ReactNode` | - | 셀 내용을 직접 그린다. 상태 값은 `GridBadge` |
| sortable | `boolean` | 그리드 값 | `false` 면 이 열만 정렬을 끈다 |
| tooltip | `boolean` | 셀 값 | `false` 면 마우스오버 툴팁을 끈다 |
| editable | `boolean \| (row) => boolean` | - | 인라인 편집 허용 |
| cellEditor | `"text" \| "number" \| "select" \| "datetime"` | `"text"` | 편집기 종류. datetime 은 `YYYY-MM-DDTHH:mm:00` 문자열을 돌려준다 |
| cellEditorValues · cellEditorValuesGetter | `string[]` · `(row) => string[]` | - | select 정적 옵션 · 행별 옵션 |
| cellEditorOptionsGetter · cellEditorValueLabels | `(row) => { value, label }[]` · `Record<string, string>` | - | select 행별 값·라벨 옵션 · 값 → 표시 라벨 맵 |
| selectNativeEditor | `boolean` | - | ag-grid 내장 select 편집기를 쓴다 |
| hide | `boolean` | - | 열 숨김 |
| pinned | `"left" \| "right"` | - | 틀고정 |
| cellClass | `string \| string[] \| (row) => …` | - | 셀 상시 클래스 |
| cellClassRules | `Record<string, (row) => boolean>` | - | 조건부 셀 클래스 |
| rowDrag · headerTooltip | `boolean` · `string` | - | 이 열에 행 드래그 손잡이(`onRowOrderChange` 필요) · 머리 툴팁 |
| headerStyle · headerComponent · headerComponentParams | ag-grid 패스스루 | - | 머리 인라인 스타일(색은 의미 토큰만) · 커스텀 머리 컴포넌트 |
| children | `GridColumn[]` | - | 있으면 열 그룹. `groupId` 는 `key` |

## 표준값: 모든 화면 동일

- 열 폭: 코드·ID 120 left / 명칭 180 left / 날짜 100 center / 수량·금액 100 right(`type: "number"`) / 상태·여부 80 center / 비고 폭 생략.
- 표준 props: `rowKey`, `columns`, `data`, `columnSizing`(8열 이하 `"fit"`, 9열 이상 `"fixed"`), `highlightedRowKey`, `onRowClick`, `loading`.
- 목록은 항상 `<GridPanel title count>` 안에 둔다. NG·오류 행은 `ag-row-error`, 상태 값은 `GridBadge`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 소스의 JSDoc("columnSizing 기본 fixed")을 믿고 생략한다 | 실제 기본값은 `"auto"` 다. auto 에서는 `width` 가 무시되고 내용 폭으로 잰다. 표준대로 항상 명시한다 |
| 비고 열을 폭 생략하고 남는 폭을 기대한다 | fit 에서는 가중치 1 이라 최소 폭 50px 까지 줄고, fixed 에서는 120px 이 된다. 넓게 보이려면 fit 의 `width` 를 큰 가중치로 준다 |
| `useGridDataManager` 의 추가·수정 행에 배경이 자동으로 칠린다고 본다 | 소스는 `nativeeditor_status === "deleted"` 만 `ag-row-deleted` 로 칠하고, 추가·수정 배경은 `_rowState`(`useRowStateManager`)일 때만 칠한다. UI-Visual-Standard §7 과 어긋나는 shared 결함이다. 자세한 내용은 [use-grid-data-manager](use-grid-data-manager.md) |
| `columns` 를 렌더 안에서 새로 만든다 | 열 상태와 선택이 초기화된다. 모듈 상수로 둔다 |
| `data` 의 행을 제자리에서 바꾼다 | 참조 비교라 갱신되지 않는다. 새 객체로 교체한다 |
| `rowDragField` 만 주고 `onRowOrderChange` 를 안 준다 | 손잡이만 생기고 정렬만 꺼진다. 항상 함께 준다 |
| 추가한 행이 맨 앞에 있을 줄 안다 | `nativeeditor_status: "inserted"` 행은 항상 맨 뒤로 정렬되고, `onRowClick` 에는 그 행의 rowKey 칸이 임시 ID(`__new_N`)로 바뀌어 온다 |
| `onRowSelect` 의 두 번째 인자를 항상 배열로 쓴다 | 1건이면 객체, 그 밖에는 배열이다 |
| `rowClickCheck` 를 편집 열이 있는 그리드에 쓴다 | `checkRowOnEdit` 을 쓴다 |

## 실제 사용 예

- `src/frontend/m-mls/pages/lsh/noticeMgmt/page.tsx:286`: 목록 + `highlightedRowKey` + `onRowClick` + `loading` 의 MES 기준 모양. 단, `:295-296` 에서 `emptyMessage`·`loadingMessage` 를 주는 점은 표준과 다름.
- `src/frontend/m-mdm/pages/dme/ruleConfirm/page.tsx:457-464`: `height="auto"` + `columnSizing="fit"` + `ag-row-error`.
- `src/frontend/m-mdm/pages/dme/ruleEdit/sections/columns/column-grid.tsx:366-374`: 편집 열(select, `cellEditorValuesGetter`)과 `cellClassRules`.
- `src/frontend/m-mdm/pages/dme/ruleEdit/sections/columns/ColumnSettingsSection.tsx:336-344`: `onCellValueChanged` 와 `rowClassRefreshToken`. 단, `getRowClassExtra` 로 `ag-row-inserted`·`ag-row-deleted` 를 직접 준다(위 함정 참고).
- `src/frontend/m-mdm/pages/dmc/codeItemEdit/page.tsx:498-505`: `rowDragField` + `isRowDraggable` + `onRowOrderChange`. `rowNumber` 는 `src/frontend/m-mdm/pages/dmd/dataItemMng/page.tsx:698`.
- `src/frontend/m-mcm/page-components/cmb/masterRuleData/page.tsx:419-428`: `selectable` + `multiSelect` + `selectedRows` + `onRowSelect`.
- 열 그룹(`children`)은 아직 사용처 없음.
