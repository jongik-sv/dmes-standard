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
- 카드·위젯 안의 표처럼 상단 버튼 막대가 없는 자리에서 표 아래에 「N행」과 [엑셀] 단추를 붙이려면 `excelExport` 속성을 준다(아래 §아래 줄과 엑셀 내려받기).

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
- 열 그룹: `GridColumn.children` 이 있으면 그 항목은 열 그룹이고 잎만 데이터 열이다. 모든 열 그룹에는 `marryChildren: true` 가 늘 붙는다 — 머리글 끌기로 잎이 그룹 밖으로 나가거나 남의 열이 그룹 사이에 끼면 ag-grid 가 거절한다(개인화 여부와 무관, 화면이 줄 것 없음).
- 행 드래그: `rowDragField`(손잡이 열 key)와 `onRowOrderChange(orderedKeys)` 를 항상 함께 준다. 켜면 정렬이 꺼진다. 순서는 호출자가 `data` 를 다시 만들어 넘겨 확정한다.

### MDM 캡션·머리글 툴팁(2026-10-03)

포털 탭은 본문을 `MdmMetaProvider` 로 감싼다([mdm-meta](mdm-meta.md)). 그래서 화면이 아무것도 하지 않아도 다음이 된다.

- `header` 를 **비운(생략한)** 열은 MDM 컬럼 사전 캡션(`labelShort` → `labelMid` → `labelLong` → `columnName`)으로 머리글을 채운다. MDM 에 없으면 `key`.
  열 `key` 를 물리명으로 바꿔(`noticeTitle` → `NOTICE_TITLE`, 대문자는 그대로) 찾는다. 다른 물리명이면 `meta: "TITLE"`, 끄려면 `meta: false`.
- `header` 를 적은 열은 그대로다. 공급자가 `captionPriority="mdm"` 이면 MDM 캡션이 이긴다. `header: ""` 는 일부러 비운 머리글로 그대로 둔다.
- MDM 메타가 있는 열은 머리글에 마우스를 올리면 `MdmMetaCard`(형식·필수·도메인·허용 코드 등) 툴팁이 뜬다. 화면이 `headerTooltip`·`headerComponent` 를 주면 그대로 둔다.
- 그리드 툴팁(머리글·셀 값·MDM 검증 오류)의 바탕은 폼 라벨 툴팁과 같은 어두운 색(`--ag-tooltip-background-color`·`-text-color` = `--shell-header-bg`·`-fg`, 테두리 `--ag-tooltip-border`)이다. `grid.css` 의 `.cm-data-grid.ag-theme-alpine` 에서 정하므로 화면이 색을 따로 주지 않는다. MDM 카드의 흐린 글자는 이 바탕 위 opacity 로 읽힌다.
- 툴팁은 그리드 밖(`document.body`)에 뜬다. 그리드(`.cm-data-grid`·`.grid-panel`)는 `overflow: hidden`·`contain: strict` 라서 안에 그리면 좁은 그리드에서 오른쪽이 잘렸다. 내부 훅 `useGridTooltipOutside`(`grid-tooltip-parent.ts`)가 머리글·셀 위에 마우스가 오르면 ag-grid `popupParent` 를 body 로 바꾸고, 눌림(mousedown)·키 입력·그리드를 떠남에서 되돌린다(`tooltipHide` 에서는 되돌리지 않는다 — 이전 칸의 늦은 숨김 이벤트가 새 칸의 body 설정을 되돌려 둘째 툴팁부터 잘렸다). 필터·열 메뉴·셀 편집기 팝업은 눌림이나 키 입력으로 시작하므로 늘 그리드 안(기본값)에 붙는다. 화면은 `popupParent` 를 따로 주지 않는다(body 가 아닌 값을 주면 이 훅은 건드리지 않아 툴팁도 그 부모 안에 뜬다. 호출자 `popupParent` 와 함께 쓰지 않는다). body 쪽 팝업 감싸개에는 `ag-theme-alpine` 이 아니라 Theming API 의 `ag-theme-params-N` 클래스만 붙으므로 grid.css 의 `body > .ag-popup` 규칙이 같은 툴팁 색·글꼴 변수를 준다.
- MDM 메타가 없는 잎 열도 머리글 툴팁에 표시 머리글 이름이 기본으로 뜬다. 빈 이름(공백만 포함) 열·화면이 `headerTooltip`·`headerComponent` 를 준 열·메타 카드 열(글자·HTML 카드)은 제외한다. 끄려면 열에 `headerTooltip: ""`. 열 그룹 머리·No 열은 기본 툴팁이 없다.
- 설명이 HTML(`descriptionHtml`)인 열은 머리글 칸 전체(`.ag-header-cell` — 글자 밖 빈 곳·정렬·필터·메뉴 아이콘 둘레 포함, 글자 머리글 툴팁과 같은 범위)에 마우스를 올리면 HTML 카드(최대 폭 640px, 마우스가 들어갈 수 있음, 150ms 유예·Escape 로 닫힘)가 ag-grid 머리글 툴팁과 같은 지연(`tooltipShowDelay`, 기본 500ms) 뒤 body 포털로 뜨고(위치는 캡션 글자 기준), 칸 안을 누르면 닫힌다(칸 안에서 옮겨 다니는 동안은 유지). 그리드 `tooltipInteraction` 은 쓰지 않아 셀 툴팁과 HTML 설명 열이 없는 그리드는 예전과 같다 — [mdm-meta](mdm-meta.md) §HTML 설명·상호작용 툴팁.
- 포털 밖(단독 실행·시험)에서는 예전과 똑같다. 단 `header` 를 비우면 `key` 가 머리글이다.
- 엑셀 내보내기처럼 화면이 `header` 를 직접 읽으면 `useResolvedGridColumns(columns)` 로 그리드와 같은 캡션을 받는다.

```tsx
import { AgDataGrid, useResolvedGridColumns, type GridColumn } from "@dk-oasis/shared/grid";

const COLUMNS: GridColumn[] = [
  { key: "TITLE", width: 300 },              // 머리글 = MDM "제목", 툴팁 = MdmMetaCard
  { key: "CATEGORY", meta: "CATEGORY" },     // 명시 물리명
  { key: "regDt", header: "등록일", meta: false }, // MDM 연결 끔
];

const excelColumns = useResolvedGridColumns(COLUMNS); // header 가 그리드와 같은 캡션으로 채워진다
```

### 칸 검증 표시: mdmValidate·fieldErrors(2026-10-03)

- `mdmValidate`: 포털 탭 공급자 안에서, 편집 가능하고 MDM 에 연결된 열의 값이 바뀌면 그 칸을 MDM 정의로 검사한다([mdm-meta](mdm-meta.md) §화면 값 검증). 기본 꺼짐 — 컬럼 사전은 테이블 구분 없는 전역 물리명이라 화면이 고른다.
- `fieldErrors`: 서버 저장 검증 오류(`toFieldErrors(error, grid)` 결과)나 저장 전 `validateRows` 결과를 칸에 표시한다. 공급자 밖에서도 동작한다. 행은 `rowKey`(그리드 `rowKey` 칸·행의 `rowKey` 값·임시 ID)로 먼저, 없으면 `rowIndex` 를 `data` 의 자리로 찾는다. `field` 는 열 `key` 와 같거나 물리명이 같은 잎 열(`title` ↔ `TITLE`).
- 오류 칸에는 `cell-mdm-invalid` 클래스(옅은 위험 배경 + 안쪽 테두리)와 셀 툴팁(오류 문구)이 붙는다. 같은 칸이면 서버 문구가 이긴다. 사용자가 서버 오류 칸을 다시 고치면 서버 표시를 내리고 화면 검사로 돌아간다(새 `fieldErrors` 배열을 받으면 다시 처음부터).
- 두 prop 이 없으면 열 정의·렌더는 예전과 같다.

```tsx
<AgDataGrid columns={COLUMNS} data={rows} rowKey="NOTICE_ID" mdmValidate fieldErrors={fieldErrors} />
```

### 아래 줄과 엑셀 내려받기: excelExport

카드·위젯 안의 표 바로 아래에 「N행」과 [엑셀] 단추 줄([GridExcelFoot](grid-excel-foot.md))을 붙이고, 누르면 그리드의 컬럼·행을 엑셀로 내려받게 한다. 사용자가 숨긴 컬럼은 엑셀에도 숨긴 열로 들어간다. 속성을 주지 않으면 줄도 단추도 없고 모양·동작은 예전과 똑같다.

- 속성을 주면 그리드를 세로 flex 상자로 감싸 표가 남은 높이를 채우고 아래 줄이 바닥에 붙는다. `height` 는 이 바깥 상자의 높이다(기본 부모 높이 100%). `height="auto"` 일 때는 flex 대신 block 감싸개(`cm-grid-excel--auto`)이고, 표가 행 수만큼 늘어난 바로 뒤에 아래 줄이 온다.
- 컬럼: 모든 데이터 열을 사용자가 정한 순서(왼쪽 고정 → 가운데 → 오른쪽 고정)로 내보낸다. 사용자가 컬럼 설정에서 숨긴 열도 엑셀에는 숨긴 열(`!cols` 의 `hidden`, 열은 있고 접힌 상태)로 들어가니 엑셀에서 펼쳐 볼 수 있다. 화면 정의에서 `hide: true` 인 내부 열, `field` 가 없는 그리드 내부 열(행번호 `rowNumber`·선택 체크박스)은 빠진다. 단추·링크처럼 `render` 로만 그리는 열은 `excludeKeys` 에 key 를 넣어 뺀다(화면에 보이는 열이어도 엑셀에는 나가지 않는다). 같은 제목이 겹치면 「(2)」가 붙되 보이는 열이 먼저 원래 제목을 갖는다(숨긴 열이 번호를 받는다). 열 폭은 제목과 앞 100행 값의 길이로 어림한다(8~50).
- 행: 그리드의 정렬·필터 순서. 값은 `render` 결과가 아니라 행의 원래 값이다(숫자는 숫자, 배지 열은 상태 글). 그리드 API 가 아직 없으면 그리드가 화면에 쓰는 행 순서(정렬된 `data`, 추가한 행은 맨 뒤)이고 열은 `columns` 에서 숨긴 열을 뺀 잎 열이다. 「{n}행」과 단추 비활성은 늘 전체 `data` 수로 정한다.
- 행이 0이면 단추는 비활성이다. 아래 줄의 모양·`data-testid`(줄 `grid-foot`, 글 `grid-foot-note`)는 [GridExcelFoot](grid-excel-foot.md) 과 같다.
- [엑셀] 단추가 Mantine `Button` 이라 `MantineProvider` 안에서만 그린다(포털에서는 늘 감싸져 있다).
- 객체를 렌더마다 새로 만들면 `memo` 가 깨진다. 모듈 상수로 두거나 값이 바뀔 때만 `useMemo` 로 만든다.

```tsx
import { useMemo } from "react";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

const COLUMNS: GridColumn[] = [
  { key: "woNo", header: "작업지시번호", width: 130 },
  { key: "qty", header: "수량(t)", width: 80, align: "right", type: "number" },
];

export function OrderTable({ rows, title }: { rows: Record<string, unknown>[]; title?: string }) {
  // 파일 이름은 「{title}_{yyyyMMdd}.xlsx」, title 이 비면 fallbackName.
  const excelExport = useMemo(() => ({ title, fallbackName: "작업지시" }), [title]);
  return <AgDataGrid rowKey="woNo" columns={COLUMNS} data={rows} columnSizing="fit" excelExport={excelExport} />;
}
```

| 키 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| title | `string` | - | 파일 이름 앞부분. 파일에 못 쓰는 글자는 `_` 로 바뀌고 80자까지만 쓴다 |
| fallbackName | `string` | `"목록"` | `title` 이 없거나 공백뿐일 때의 이름 |
| note | `string` | `"{n}행"`(천 단위 쉼표) | 아래 줄 왼쪽 글. 「N건」「상위 500행만 표시합니다」처럼 바꿀 때 준다 |
| sheetName | `string` | `"Sheet1"` | 시트 이름 |
| testId | `string` | `"grid-excel"` | [엑셀] 단추의 `data-testid` |
| excludeKeys | `string[]` | - | 엑셀에서 뺄 열 key. `render` 전용 열(단추·링크)에 쓴다. 상수나 `useMemo` 로 둔다 |

화면 전체 목록의 엑셀은 PageLayout 상단 「엑셀」 버튼(`action: "export"`)과 [exportToExcel](export-to-excel.md) 을 쓴다. 엑셀 내용을 직접 정해야 하면(열을 골라 바꾸거나 코드 대신 명칭으로 변환) 이 속성 대신 [GridExcelFoot](grid-excel-foot.md) 에 `onExcel` 을 넘긴다.

### 컬럼 개인화: gridId·personalize(2026-10-06)

사용자가 바꾼 컬럼 순서·너비·표시 여부·좌우 고정·정렬을 저장했다가 같은 화면을 다시 열 때 복원한다. **기본 켬**이라 전 화면에 자동으로 적용되고, 화면은 아무것도 주지 않아도 된다.

- 저장: 브라우저 `localStorage` 에만 둔다(서버에 보내지 않아 PC·브라우저를 바꾸면 공유되지 않는다). 키는 `dmes:grid:v1:{사용자ID}:{화면}:{gridId}` 이고 화면은 포털 탭의 `pageId`(없으면 `location.pathname`)다.
- 자동 저장: 헤더 조작(컬럼 이동·너비 끌기·고정·정렬)은 바로 저장된다.
- 컬럼 설정 창: 표시 여부·순서를 한 줄씩 바꾸고 [적용]으로 저장하거나 [기본값 복원]으로 저장값을 지운다. 공통 컴포넌트 [ColumnSettingsModal](column-settings-modal.md)을 AgDataGrid 가 스스로 소유하므로 화면은 아무것도 연결하지 않는다. 여는 길은 둘이다.
  - 헤더 우클릭 메뉴: 머리글 영역을 우클릭하면 마우스 위치에 「컬럼 설정」·「기본값 복원」 메뉴가 뜬다. 셀·빈 영역 우클릭과 머리글 안 입력 칸(필터 입력 등)은 브라우저 기본 메뉴 그대로다.
  - [GridPanel](grid-panel.md) 의 「컬럼 설정」 버튼: 그리드를 `GridPanel` 안에 두면 개인화가 켜진 동안 자동으로 붙는다.
- 헤더를 그리드 밖으로 끌어도 개인화가 켜진 그리드는 컬럼이 숨겨지지 않는다(숨김은 컬럼 설정 창으로만). `personalize={false}` 인 그리드는 ag-grid 기본대로 끌어서 숨겨지고 창·우클릭 메뉴·버튼도 없다.
- 컬럼 설정 창 규칙: 숨길 수 없는 열(`hideable` 잠금)은 체크가 고정이고 순서만 옮긴다. 선택 체크박스·행번호·화면이 숨긴 열은 창에 나오지 않지만 원래 자리를 지킨다. 고정 열은 구역(왼쪽 고정·일반·오른쪽 고정)별로 모여 같은 구역 안에서만 순서를 옮긴다. [적용]은 너비를 저장하지 않는다(너비는 헤더 경계를 끌 때만).
- 열 그룹(`children`) 규칙: 컬럼 설정 창은 그룹 이름을 제목 줄로 앞에 보이고(중첩 그룹은 바깥 → 안쪽), 순서는 **같은 그룹 안에서만** 옮긴다(그룹 경계의 위로·아래로 단추 비활성, 그룹 밖 열이 그룹 안으로 들어가거나 그 반대도 안 된다). 그룹을 통째로 옮기는 기능은 없고, 그룹 밖 열이 그룹 건너편으로 건너뛰는 이동은 창에서 안 되며 머리글 끌기로만 된다. 저장값 순서가 그룹을 가르면(예전 저장값·화면이 그룹 구조를 바꾼 경우) 복원 때 각 그룹의 잎을 그 그룹의 첫 잎 자리로 모은다(그룹 안 순서는 저장 순서). ag-grid 는 그룹을 가르는 `applyOrder` 를 받으면 순서 전체를 버리므로 이 모으기가 필요하다.
- 너비: 사용자가 머리글 경계를 끌어 바꾼 컬럼만 저장되고 그 컬럼은 폭이 고정된다. 나머지 컬럼은 예전처럼 자동 너비 맞춤(`columnSizing`)을 받고, 저장값이 없으면 동작은 예전과 같다.
- 숨김 잠금: 편집 가능한 열은 기본으로 숨길 수 없다(`GridColumn.hideable: true` 로 푼다). 선택 체크박스·행번호·`rowKey`·행 드래그 열은 늘 잠금이다. 잠긴 열도 순서는 옮길 수 있다.
- `gridId`: 한 화면(탭)에 그리드가 하나면 생략한다(`"main"`). 둘 이상이면 그리드마다 다른 고정 문자열을 준다. 같은 탭에 같은 키의 그리드가 이미 떠 있으면 나중 그리드는 개인화를 끈다(개발 모드 경고). **모달 안 그리드는 반드시 본 화면과 다른 `gridId`**(예: `"modal-user"`)를 준다. `LookupModal`·`EditableRowList` 는 자기 `gridId` prop 으로 안쪽 그리드에 넘긴다.
- `personalize`: 생략·`true` 켬, `false` 끔, `{ sort: false }` 는 정렬만 저장하지 않는다. 서버 페이징 그리드는 정렬이 서버 조회 조건이므로 `{ sort: false }` 를 준다.
- 동작 조건: 포털 안에서 사용자가 확인된 뒤에만 동작한다. 포털 밖이거나 확인 전이면 저장도 복원도 하지 않는다(그리드는 사용자 확인을 요청하지 않고 포털이 확인한 값을 구독만 한다).
- 엑셀: 사용자가 숨긴 컬럼도 `excelExport` 엑셀에는 숨긴 열로 들어간다(§아래 줄과 엑셀 내려받기).

```tsx
// 마스터-디테일 — 한 화면에 그리드 둘. 서버 페이징인 마스터는 정렬을 저장하지 않는다.
<AgDataGrid columns={MASTER_COLUMNS} data={masters} rowKey="woNo" gridId="master" personalize={{ sort: false }} />
<AgDataGrid columns={DETAIL_COLUMNS} data={details} rowKey="seq" gridId="detail" />

// 편집 열을 사용자가 숨겨도 되는 경우만 hideable 로 푼다.
{ key: "remark", header: "비고", editable: true, hideable: true }
```

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
| emptyMessage · loadingMessage | `string` | `"데이터가 없습니다."` · `"조회 중..."` | 표준 화면은 주지 않는다. 0건 안내가 떠 있는 동안 `emptyMessage` 가 바뀌거나 `data` 가 `undefined`→`[]` 로 바뀌어도 안내가 새 문구로 다시 뜬다(빈 문구를 상수로 고정하는 우회 불필요) |
| rowDragField | `string` | - | 행 드래그 손잡이를 둘 열 key. 정렬이 꺼진다 |
| isRowDraggable | `(row) => boolean` | - | 행별 드래그 허용 |
| onRowOrderChange | `(orderedKeys) => void` | - | 드래그 후 새 순서의 행 키 목록. 이 prop 이 있어야 드래그가 동작한다 |
| mdmValidate | `boolean` | `false` | 편집 가능 + MDM 연결 열의 바뀐 값을 MDM 정의로 검사해 `cell-mdm-invalid`·셀 툴팁을 단다(포털 탭 안에서만) |
| fieldErrors | `Array<{ rowKey?; rowIndex?; field; message }>` | - | 서버 오류 칸 표시(`toFieldErrors` 결과). rowKey → rowIndex(data 자리) 순으로 행을 찾는다 |
| excelExport | `{ title?; fallbackName?; note?; sheetName?; testId?; excludeKeys? }` | - | 주면 표 아래에 「N행」·[엑셀] 줄을 붙이고 컬럼·행을 내려받는다(사용자가 숨긴 열은 엑셀에도 숨긴 열). 없으면 줄도 단추도 없다(§아래 줄과 엑셀 내려받기). 상수나 `useMemo` 로 둔다 |
| gridId | `string` | `"main"` | 한 화면(탭)에 그리드가 여럿일 때 컬럼 개인화 저장을 나누는 이름. 화면 안에서 그리드마다 다른, 렌더마다 바뀌지 않는 고정 문자열로 준다(§컬럼 개인화) |
| personalize | `boolean \| { sort?: boolean }` | 켬 | 사용자별 컬럼 개인화. `false` 면 끈다. `{ sort: false }` 면 정렬은 저장·복원하지 않는다(서버 페이징 그리드) |

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
| tooltipShowDelay | `number` | `GRID_TOOLTIP_SHOW_DELAY_MS`(500) | 머리글 툴팁·MDM 글자 카드·셀 값 툴팁·HTML 설명 머리글 카드가 뜨기까지의 지연(ms). 예전 ag-grid 기본은 2000. ag-grid 하한 200. 상수는 `@dk-oasis/shared/grid` 에서 export. 셀 값 툴팁은 잘림과 상관없이 모든 셀 값을 띄우므로 0.5초 머물면 뜬다 — 열에서 끄려면 `GridColumn.tooltip: false`, 그리드 전체를 늦추려면 이 prop |
| sizeToFit | `boolean` | 효과 없음 | 폐기됨. 선언만 있고 구현이 읽지 않는다 |

### GridColumn

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| key | `string` | 필수 | 행 데이터의 필드 이름 |
| header | `string` | 생략 가능 | 머리 글자. 생략하면 MDM 캡션(포털 탭 안), 그 밖에는 `key`. `""` 는 빈 머리글 |
| meta | `string \| false` | `key` 의 물리명 | MDM 컬럼 사전 연결 물리명. `false` 면 끈다 |
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
| hide | `boolean` | - | 열 숨김. 화면이 숨긴 내부 열은 컬럼 설정 창에 나오지 않고 엑셀에서도 빠진다 |
| hideable | `boolean` | 편집 열은 `false`, 나머지 `true` | 컬럼 개인화에서 사용자가 이 열을 숨길 수 있는가. 편집 가능한 열(`editable` 이 참 또는 함수)은 기본 잠금이고 `true` 로 풀며, `false` 면 편집 불가 열도 잠근다. 선택 체크박스·행번호·`rowKey`·행 드래그 열은 늘 잠금. 잠긴 열도 순서 이동은 된다 |
| pinned | `"left" \| "right"` | - | 틀고정 |
| cellClass | `string \| string[] \| (row) => …` | - | 셀 상시 클래스 |
| cellClassRules | `Record<string, (row) => boolean>` | - | 조건부 셀 클래스 |
| rowDrag · headerTooltip | `boolean` · `string` | - | 이 열에 행 드래그 손잡이(`onRowOrderChange` 필요) · 머리 툴팁(주면 MDM 툴팁 대신 이것. 생략하면 표시 머리글 이름이 기본, `""` 면 끔) |
| headerStyle · headerComponent · headerComponentParams | ag-grid 패스스루 | - | 머리 인라인 스타일(색은 의미 토큰만) · 커스텀 머리 컴포넌트 |
| children | `GridColumn[]` | - | 있으면 열 그룹. `groupId` 는 `key`, 열 정의에 `marryChildren: true` 가 붙는다 |

## 표준값: 모든 화면 동일

- 열 폭: 코드·ID 120 left / 명칭 180 left / 날짜 100 center / 수량·금액 100 right(`type: "number"`) / 상태·여부 80 center / 비고 폭 생략.
- 표준 props: `rowKey`, `columns`, `data`, `columnSizing`(8열 이하 `"fit"`, 9열 이상 `"fixed"`), `highlightedRowKey`, `onRowClick`, `loading`.
- 목록은 항상 `<GridPanel title count>` 안에 둔다. NG·오류 행은 `ag-row-error`, 상태 값은 `GridBadge`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 소스의 JSDoc("columnSizing 기본 fixed")을 믿고 생략한다 | 실제 기본값은 `"auto"` 다. auto 에서는 `width` 가 무시되고 내용 폭으로 잰다. 표준대로 항상 명시한다 |
| 비고·제목 열을 폭 생략하고 남는 폭을 기대한다 | fit 에서는 가중치 1 이라 최소 폭 50px 까지 줄고, fixed 에서는 120px 이 된다. 넓게 보이려면 fit 의 `width` 를 큰 가중치(예: `100`)로 주고 `minWidth`(예: `180`)를 함께 준다. 좁은 목록이면 짧은 열은 가중치 `1` + 내용 폭 `minWidth` 로 둔다([screen-patterns](../screen-patterns.md) §목록 그리드) |
| `useGridDataManager` 의 추가·수정 행에 배경이 자동으로 칠린다고 본다 | 소스는 `nativeeditor_status === "deleted"` 만 `ag-row-deleted` 로 칠하고, 추가·수정 배경은 `_rowState`(`useRowStateManager`)일 때만 칠한다. UI-Visual-Standard §7 과 어긋나는 shared 결함이다. 자세한 내용은 [use-grid-data-manager](use-grid-data-manager.md) |
| `columns` 를 렌더 안에서 새로 만든다 | 열 상태와 선택이 초기화된다. 모듈 상수로 둔다 |
| `data` 의 행을 제자리에서 바꾼다 | 참조 비교라 갱신되지 않는다. 새 객체로 교체한다 |
| `rowDragField` 만 주고 `onRowOrderChange` 를 안 준다 | 손잡이만 생기고 정렬만 꺼진다. 항상 함께 준다 |
| 추가한 행이 맨 앞에 있을 줄 안다 | `nativeeditor_status: "inserted"` 행은 항상 맨 뒤로 정렬되고, `onRowClick` 에는 그 행의 rowKey 칸이 임시 ID(`__new_N`)로 바뀌어 온다 |
| `onRowSelect` 의 두 번째 인자를 항상 배열로 쓴다 | 1건이면 객체, 그 밖에는 배열이다 |
| `rowClickCheck` 를 편집 열이 있는 그리드에 쓴다 | `checkRowOnEdit` 을 쓴다 |
| MDM 캡션을 쓰려고 `header: ""` 를 준다 | `header` 를 생략한다. `""` 는 빈 머리글로 그대로 남는다 |
| 엑셀 내보내기에서 `c.header` 를 그대로 읽는다(`header` 생략 열은 undefined) | `useResolvedGridColumns(COLUMNS)` 결과의 `header` 를 쓴다 |
| 오류 칸을 칠하려고 `cellClassRules` 에 직접 검사를 넣는다 | `mdmValidate`·`fieldErrors` 를 쓴다. 클래스·툴팁·서버 우선 규칙이 들어 있다 |
| 저장 실패 오류의 `rowIndex`(요청 목록 자리)를 바뀐 행만 보낸 화면에서 그대로 넘긴다 | 그리드는 `data` 자리로 본다. `rowKey` 를 쓰거나 자리를 바꿔 넘긴다 |
| 표 아래 줄을 직접 만들려고 감싸개 CSS 와 `GridExcelFoot` 을 따로 붙인다 | `excelExport` 를 준다. 감싸개·아래 줄·내려받기를 그리드가 맡는다 |
| `excelExport={{ … }}` 를 렌더 안에서 인라인으로 넘긴다 | 렌더마다 새 객체라 `memo` 가 깨진다. 모듈 상수 또는 `useMemo` |
| `excelExport` 를 조건부로 줬다 뺐다 한다 | 루트 요소가 바뀌어 그리드가 다시 마운트된다(정렬·선택·스크롤 초기화). 항상 주거나 항상 뺀다 |
| 한 화면에 그리드가 여럿인데 `gridId` 를 안 준다 | 모두 `"main"` 이라 먼저 뜬 그리드만 개인화되고 나중 그리드는 개인화가 꺼진다(개발 모드 경고). 그리드마다 다른 고정 `gridId` 를 준다 |
| 모달 안 그리드에 `gridId` 를 안 준다 | 본 화면 그리드와 저장 키(`"main"`)가 겹쳐 나중에 뜬 모달 그리드의 개인화가 꺼진다(개발 모드 경고). `"modal-user"` 처럼 다른 이름을 준다(`LookupModal`·`EditableRowList` 는 `gridId` prop) |
| `gridId` 를 렌더마다 바뀌는 값(행 번호·시각)으로 준다 | 저장 키가 계속 바뀌어 복원이 안 된다. 코드에 박은 고정 문자열을 쓴다 |
| 서버 페이징 그리드에 `personalize={{ sort: false }}` 를 안 준다 | 저장된 정렬이 복원되면서 서버 조회 조건과 어긋난다. 정렬이 서버 조건이면 `{ sort: false }` |
| 편집 컬럼을 사용자가 숨겨야 하는데 `hideable` 을 안 준다 | 편집 가능한 열은 기본으로 숨길 수 없다. 숨겨도 되는 열만 `hideable: true`. 반대로 편집 불가 열을 못 숨기게 하려면 `hideable: false` |
| 개인화가 켜진 그리드에서 헤더를 밖으로 끌어 열을 숨기려 한다 | 숨겨지지 않는다. 숨김은 컬럼 설정 창으로만 한다 |
| `excelExport` 를 쓰는 표의 `height="100%"` 가 감싸개 높이를 정해 줄 거라 본다 | `height` 는 바깥 상자의 높이다. 부모가 높이를 정하는 자리(위젯·패널 본문)에서만 기본값으로 쓴다 |

## 실제 사용 예

- `src/frontend/m-mls/pages/lsh/noticeMgmt/page.tsx:286`: 목록 + `highlightedRowKey` + `onRowClick` + `loading` 의 MES 기준 모양. 단, `:295-296` 에서 `emptyMessage`·`loadingMessage` 를 주는 점은 표준과 다름.
- `src/frontend/m-mdm/pages/dme/ruleConfirm/page.tsx:457-464`: `height="auto"` + `columnSizing="fit"` + `ag-row-error`.
- `src/frontend/m-mdm/pages/dme/ruleEdit/sections/columns/column-grid.tsx:366-374`: 편집 열(select, `cellEditorValuesGetter`)과 `cellClassRules`.
- `src/frontend/m-mdm/pages/dme/ruleEdit/sections/columns/ColumnSettingsSection.tsx:336-344`: `onCellValueChanged` 와 `rowClassRefreshToken`. 단, `getRowClassExtra` 로 `ag-row-inserted`·`ag-row-deleted` 를 직접 준다(위 함정 참고).
- `src/frontend/m-mdm/pages/dmc/codeItemEdit/page.tsx:498-505`: `rowDragField` + `isRowDraggable` + `onRowOrderChange`. `rowNumber` 는 `src/frontend/m-mdm/pages/dmd/dataItemMng/page.tsx:698`.
- `src/frontend/m-mcm/page-components/cmb/masterRuleData/page.tsx:419-428`: `selectable` + `multiSelect` + `selectedRows` + `onRowSelect`.
- `excelExport`: `src/frontend/m-mcm/widget-types/query-table/renderer.tsx`(쿼리 표, 잘리면 `note` 를 「상위 N행만 표시합니다」로), `src/frontend/m-mcm/widgets/home/workOrders/widget.tsx`·`shipments/widget.tsx`(홈 기본 표, `note` 「N건」·기본 이름 「작업지시」「출하」·`testId: "wq-excel"`).
