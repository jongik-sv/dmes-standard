# GridPanel

그리드 위에 목록 제목·건수·행추가/행삭제/행복사 버튼을 붙이는 머리를 만들 때 쓴다. 모든 목록은 이 안에 `AgDataGrid` 를 둔다.

- import: `import { GridPanel, getRowIdentifier, type GridButton } from "@dk-oasis/shared/grid";`
- 소스: `src/frontend/shared/src/components/grid/GridPanel.tsx` (도움말 팝업은 `GridHelpButton.tsx`)
- 내부 구현: 일반 `div` + `button`(`grid-btn` 클래스). 도움말 팝업은 shared `Modal`, 그리드 설정 메뉴는 Mantine `Menu`(`GridSettingsMenu.tsx`)

## 언제 쓰나

- 쓴다: 모든 목록의 머리. 제목과 건수만 있어도 쓴다.
- 쓴다: 행추가·행삭제·행복사 버튼을 그리드 머리에 둘 때(상단 PageLayout 버튼이 아니다).
- 안에 둔 그리드는 개인화 여부와 상관없이 머리줄 맨 오른쪽에 「그리드 설정」 아이콘 메뉴(칸별 필터 보기·컬럼 설정…·자동 설정 저장·설정 초기화…·엑셀 출력)가 자동으로 붙는다. 엑셀 출력은 `excelExport` 를 주지 않아도 기본으로 켜진다(`excelExport={false}` 로 끈다. 그리드의 `settingsMenu={false}` 는 메뉴를 통째로 끈다. §그리드 설정 메뉴).
- 쓰지 않는다: 그리드 없는 일반 카드 제목. 목록 자체는 [AgDataGrid](ag-data-grid.md), 행 상태 관리는 [useGridDataManager](use-grid-data-manager.md).

## 표준 사용

```tsx
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";

type UnitRow = { unitCd: string; unitNm: string };

const COLUMNS: GridColumn[] = [
  { key: "unitCd", header: "단위코드", width: 120, align: "left" },
  { key: "unitNm", header: "단위명", width: 180, align: "left" },
];

export function UnitList({ rows, isBusy }: { rows: UnitRow[]; isBusy: boolean }) {
  return (
    <GridPanel title="단위 목록" count={rows.length}>
      <AgDataGrid rowKey="unitCd" columns={COLUMNS} data={rows} columnSizing="fit" loading={isBusy} />
    </GridPanel>
  );
}
```

## 변형

### 행추가·행삭제·행복사가 있는 저장형 목록

`showAddButton`·`showCopyButton` 을 켜면 라벨 "행추가"·"행복사"(기본값 그대로) 버튼이 붙는다. 행삭제는 `showDeleteButton` 을 쓰지 않는다. 내장 행삭제는 확인창을 끼울 수 없고 삭제 표시 행을 맨 뒤로 옮기기 때문이다. 대신 `buttons` 에 확인창을 거치는 버튼을 넣는다(내장 버튼 뒤에 붙으므로 "행추가" 다음 자리가 된다).

```tsx
const confirmDeleteRow = () =>
  showMessage({ title: "확인", message: "선택한 행을 삭제하시겠습니까?", alertType: "confirm", onConfirm: grid.handleDeleteRow });

<GridPanel
  showAddButton
  buttons={[{ id: "btn_grid_delete", label: "행삭제", onClick: confirmDeleteRow, disabled: grid.selectedRowKey == null }]}
  …
>
```

 행 상태는 `useGridDataManager` 가 받으므로 `onDataChange` 는 훅의 `handleGridDataChange` 로 잇는다. 전체 연결 예제는 [use-grid-data-manager](use-grid-data-manager.md) 를 본다.

### 그리드 설정 메뉴

안쪽 `AgDataGrid` 의 컬럼 개인화가 켜져 있거나(기본 켬) 엑셀 출력이 켜져 있거나(GridPanel 안은 `excelExport={false}` 가 아닌 한 기본 켬) 걸러 보기가 있으면(`filter={false}` 가 아닌 한 기본으로 「칸별 필터 보기」 가 있다), 머리줄 맨 오른쪽 끝(업무 버튼 묶음과 `headerExtra` 뒤)에 톱니 아이콘 버튼 「그리드 설정」(`data-testid="grid-settings-menu"`, 툴팁·`aria-label` 「그리드 설정」)이 저절로 붙는다. 누르면 Mantine `Menu` 가 열린다. 내부 부품 `GridSettingsMenu`(`GridSettingsMenu.tsx`)가 그리며 화면이 직접 쓰지 않으므로 별도 문서 파일은 없다. GridPanel 에 줄 prop 은 없고(엑셀 이름만 `serverPaged`), 끄고 켜는 것은 안쪽 `AgDataGrid` 의 `settingsMenu`·`excelExport`·`personalize` 가 정한다. 예전의 머리줄 [컬럼 설정] 단추·「자동 저장」 스위치·[초기화] 단추와 그리드 아래 줄 [엑셀] 단추는 이 메뉴 하나로 모였다. 팝업(대화 상자) 안의 그리드는 이전처럼 이 머리줄 메뉴에 등록되지 않고, 자기 머리글 줄 아이콘에 엑셀 출력 항목만 둔다. 같은 메뉴를 GridPanel 밖의 그리드도 자기 머리줄(`header={false}` 면 머리글 줄 오른쪽 끝의 작은 아이콘)에 단다(항목·순서·이름·`data-testid` 가 같다. [AgDataGrid](ag-data-grid.md) §그리드 설정 아이콘과 settingsMenu).

| 항목 | 이름 | id · `data-testid` | 보이는 때·동작 |
|---|---|---|---|
| 칸별 필터 보기 | 칸별 필터 보기(`serverPaged` 의 `filter` 생략 그리드는 필터 창 보기) | 항목 `grid-filter-row-item`, 안의 스위치 `grid-filter-row-switch` | `filter={false}` 나 `settingsMenu={false}` 가 아니면 늘(대화 상자 안 그리드 제외). 빠른 검색 칸은 이 항목과 무관하게 기본으로 보이고, 이 항목은 머리글 아래 칸별 입력 줄만 펴고 접는다(끄면 칸별 조건만 지우고 검색어는 그대로). 켜짐은 그 그리드에 기억한다. 예외로 `serverPaged` 의 `filter` 생략 그리드는 검색 칸이 기본으로 없어 항목 이름이 「필터 창 보기」 로 남고, 켜면 검색 칸과 입력 줄이 함께 나타나며 끄면 둘 다 사라지고 조건과 검색어를 지운다. 툴팁에 검색 범위 안내(`serverPaged` 면 「지금 쪽에서만」)가 뜬다. 누르면 메뉴가 닫힌다 |
| (구분선) | | | 필터 창 항목 뒤에 개인화 항목이 있을 때 |
| 컬럼 원래대로 | 컬럼 원래대로 | `btn_grid_columns_reset` · `grid-columns-reset-button` | 개인화가 꺼진 그리드(`personalize={false}`·사용자 확인 전 등)만. 확인 창 없이 지금 화면의 칸 순서·너비·숨김·고정을 열 정의대로 되돌린다. 정렬은 그대로 두고(정렬 이벤트도 내지 않는다 — 정렬을 뺀 정의 상태를 한 번에 적용) 저장하는 것은 없다. 선택 체크박스 열은 맨 앞에 남고 auto 그리드는 바로 자동 너비를 잰다. 개인화 그리드는 [설정 초기화…] 가 같은 일을 하며 저장값까지 지운다 |
| 컬럼 설정 | 컬럼 설정… | `btn_grid_columns` · `grid-columns-button` | 개인화가 동작 중일 때. 그 그리드의 [컬럼 설정 창](column-settings-modal.md)을 연다 |
| 자동 설정 저장 | 자동 설정 저장 | 항목 `grid-autosave-item`, 안의 스위치 `grid-autosave-switch` | 개인화가 동작 중일 때. 스위치(`xs`)가 항목 안에 있고 항목 어디를 눌러도 값이 바뀌며 메뉴는 닫히지 않는다 |
| 설정 초기화 | 설정 초기화… | `btn_grid_reset` · `grid-reset-button` | 개인화가 동작 중일 때. 빨간 글자, 누르면 그리드가 확인 창을 띄운다 |
| (구분선) | | | 엑셀 항목 앞에 다른 항목이 있을 때. 개인화가 꺼진 그리드 메뉴는 「칸별 필터 보기 · 컬럼 원래대로 · (구분선) · 엑셀 출력」 이다 |
| 엑셀 출력 | 엑셀 출력 (`serverPaged` 면 「엑셀 출력 (현재 페이지)」) | `grid-excel` | 엑셀 출력이 켜진 그리드가 대상일 때(GridPanel 안은 `excelExport={false}` 가 아니면 기본 켬). 행이 0 이면 비활성(메뉴를 열 때마다 다시 읽는다) |

- 항목 이름은 `grid-settings-labels.ts` 의 `GRID_SETTINGS_LABELS` 한 곳에서 가져오며 머리글 우클릭 메뉴(`GridHeaderContextMenu`)도 같은 이름·순서(컬럼 설정…·자동 설정 저장·설정 초기화…)를 쓴다. 우클릭 메뉴에는 엑셀 항목이 없다. 엑셀 항목 이름이 「엑셀 내려받기」에서 「엑셀 출력」으로 바뀌었다. 스위치 이름이 「자동 저장」에서 「자동 설정 저장」으로 바뀌었다.
- 항목은 대상 그리드가 올려 둔 명령에 따라 달라진다. 개인화 항목은 개인화가 켜진 그리드가, 엑셀 항목은 엑셀 출력이 켜진 그리드(`excelExport={false}` 가 아닌 GridPanel 안의 그리드)가 채운다. 셋 다 없으면(개인화·엑셀·걸러 보기가 모두 꺼진 `filter={false}` 그리드뿐이면) 메뉴 버튼이 없다. `filter` 를 생략한 그리드는 다른 항목이 없어도 「칸별 필터 보기」 하나짜리 메뉴를 가진다. 개인화(`gridId`·`personalize`) 여부와 상관없이 GridPanel 안이면 메뉴 아이콘이 보이고 항목만 그리드 능력에 따라 달라진다. `personalize={false}` 인 그리드, 포털 밖이나 사용자 확인 전처럼 개인화가 아직 동작하지 않는 그리드, 개인화를 끄는 숨은 탭 패널의 그리드는 개인화 항목이 없다. 그리드가 켜고 끌 때 따라서 나타나고 사라진다.
- 권한 검사를 거치지 않는다: `usePermission`·`fetchPermissions` 가 허용 id 목록에 `btn_grid_columns`·`btn_grid_reset` 을 넣지 않아도 보이고 `loading` 이어도 활성이다. 그리드 모양만 바꾸고 보이는 행을 내려받을 뿐 데이터를 바꾸지 않기 때문이다. 엑셀 출력 항목도 같다. 화면에 보이는 데이터만 내려받으므로 버튼 권한 검사를 하지 않고 늘 활성이다. 권한 검사가 붙은 업무 엑셀 단추(`btn_excelDown`·`btn_excelDownL`·R·올리기 등)와 서버 조회·가공 값을 내리는 화면 전용 단추는 그대로 둔다.
- 머리줄 순서(고정): 빠른 검색 칸(`.grid-quick-filter`, `filter` 생략이면 기본으로, `serverPaged` 의 생략 그리드는 「필터 창 보기」 를 켰을 때) → 업무 버튼(`.grid-panel-buttons`) → `headerExtra`(`.grid-panel-header-extra`) → 그리드 설정 아이콘 칸(`.grid-panel-settings-slot`, `data-testid="grid-panel-settings-slot"`). 이 칸은 머리줄 DOM 의 마지막 자식이고 CSS 로 `order: 2147483647` 과 `margin-left: auto` 가 고정되어 있어, 화면이 `headerExtra` 로 넘긴 요소가 `order` 를 줘도 아이콘 앞에 서지 못하고 아이콘은 늘 맨 오른쪽 끝이다. 업무 버튼이 하나도 없어도(`headerExtra` 만 있거나 메뉴만 있어도) 같다. 이전 문서에 쓴 「버튼 묶음 맨 끝(`buttons` 뒤, `headerExtra` 앞)」 은 이 순서로 바뀌었다. 단 `position: absolute` 로 띄운 요소는 순서로 막지 못하므로 `headerExtra` 안에서 absolute·fixed 배치를 쓰지 않는다.
- `settingsMenu={false}` 인 그리드(읽기 전용 작은 표 등)는 이 메뉴의 대상에서 빠진다. 같은 GridPanel 에 다른 그리드가 있으면 그 그리드가 대상이 되고, 없으면 메뉴 칸이 없다. 이때 `excelExport` 객체가 있으면 그 그리드 아래 줄 [엑셀] 단추는 그대로 남는다.
- 한 GridPanel 안에 그리드가 여럿이면 메뉴 대상은 하나다: 개인화가 켜진 그리드 → 엑셀이 켜진 그리드 → 먼저 등록한 그리드 순(엑셀을 끈 그리드가 앞서 있어도 엑셀 항목이 남는다). 「칸별 필터 보기」·검색 칸·거른 건수는 메뉴 대상과 별개로 **걸러 보기 대상** 하나를 같이 가리킨다 — `filter={true}` 그리드 우선, 없으면 메뉴 대상. 대상이 아닌 `filter` 생략 그리드는 저장된 켜짐을 무시하고 꺼진 채 시작한다(끌 메뉴가 없으므로). 그리드마다 따로 쓰게 하려면 그리드마다 GridPanel 을 둔다.
- 자동 설정 저장 스위치는 대상 그리드의 값을 보이고 바꾼다. 대상 그리드가 사라져 다음 그리드가 대상이 되면 그 그리드의 값으로 바뀐다. 값은 사용자·화면·그리드별 옆 키에 저장되고, 저장 규칙(끄면 화면에만 적용, 켜면 저장)은 [AgDataGrid](ag-data-grid.md) 「컬럼 개인화」 절의 「자동 설정 저장 스위치·초기화」 항목을 본다.
- 「설정 초기화…」는 바로 되돌리지 않고 그리드가 확인 창을 띄운다. [확인]하면 그 그리드의 컬럼 상태를 기본값으로 되돌리고 저장값을 지운다(스위치 값은 그대로).
- 엑셀: `excelExport` 를 주지 않아도 메뉴 항목만 생기고 아래 줄(「N행」 안내·[엑셀] 단추)과 감싸개는 생기지 않는다. `excelExport` 객체를 주면 아래 줄이 붙고 메뉴가 대상 그리드의 엑셀을 맡아 [엑셀] 단추는 빠지고 「N행」 안내만 남는다([GridExcelFoot](grid-excel-foot.md) 의 `hideButton`). GridPanel 밖의 그리드는 자기 아이콘 메뉴가 같은 규칙으로 맡는다. 대상이 아닌 둘째 그리드(GridPanel 안)는 아래 줄 단추를 그대로 둔다. 화면의 업무 버튼(`btn_excelDown` 등)은 그대로다. 끄려면 `excelExport={false}` 를 준다.
- 파일 이름은 `excelExport.title`, 없으면 GridPanel 의 `title`, 없으면 `fallbackName` 또는 「목록」 이고 규칙은 「{이름}_{yyyyMMdd}.xlsx」 다. 내용 규칙(사용자 순서·숨긴 열은 숨긴 열·내부 열 제외·정렬·필터 반영·원래 값)은 [AgDataGrid](ag-data-grid.md) §아래 줄과 엑셀 내려받기와 같다.
- `serverPaged`: Pagination 으로 쪽을 넘기며 한 쪽의 행만 `data` 로 들고 있는 화면은 `<GridPanel serverPaged …>` 를 준다. 엑셀 항목 이름이 「엑셀 출력 (현재 페이지)」 가 되어 지금 쪽의 행만 나간다는 것을 알린다. 전체를 받는 업무 단추(엑셀다운)가 따로 있으면 그것은 그대로 둔다. `AgDataGrid` 는 서버·무한 행 모델을 쓰지 않으므로(클라이언트 `rowData` 만) 서버 행 모델 처리는 없다.
- GridPanel 없이 쓰는 그리드는 자기 머리줄의 메뉴(`header={false}` 면 머리글 줄 오른쪽 끝의 작은 아이콘 `data-testid="grid-settings-overlay"` 안의 `grid-settings-menu`)로 같은 메뉴를 쓴다(GridPanel 머리줄 메뉴와 내부 훅 `useGridSettingsMenuProps` 가 같다). 머리글 우클릭 메뉴로도 컬럼 설정·자동 설정 저장·초기화를 쓸 수 있다.
- 구현 계약: 그리드는 `register(controls, onTargetChange?)` 로 명령을 올린다. 개인화 명령 5개(`openSettings`·`requestReset`·`getAutoSave`·`setAutoSave`·`subscribeAutoSave`)와 엑셀 명령 2개(`exportExcel`·`canExportExcel`)는 모두 선택 속성이다(`grid-panel-context.ts`). `onTargetChange(isMenuTarget, isFilterTarget)` 로 메뉴 대상·걸러 보기 대상 여부를 알려 받는다(`filter` 생략 그리드는 걸러 보기 대상일 때만 켜진다). `GridPanelRegistry` 에는 `getTitle(): string | undefined` 도 있어 GridPanel 의 `title` 을 엑셀 파일 이름 기본값으로 읽는다(내려받을 때 읽는다).

### 머리줄 공유와 「걸린 조건」 칩 줄(2026-10-08)

머리줄(그리드명·건수 배지·도움말·빠른 검색 칸·업무 버튼·설정 메뉴)은 내부 공통 부품 `GridHeaderBar` 가 그린다. GridPanel 은 안쪽 그리드를 위해, GridPanel 밖 [AgDataGrid](ag-data-grid.md) 는 스스로 같은 부품으로 같은 머리줄을 그린다(클래스·`data-testid` 는 `grid-panel-header`·`grid-panel-title`·`grid-panel-count` 그대로). GridPanel 안의 AgDataGrid 는 머리줄을 그리지 않아 겹치지 않는다.

머리줄 아래에는 검색어와 칸별 필터가 걸려 있을 때만 「걸린 조건」 칩 줄이 붙는다. 칩의 × 는 그 조건만 지우고(검색어 칩이면 검색 칸 입력도 비운다), 조건이 없으면 줄 자체가 없다. 대화 상자 안에는 칩도 검색 칸도 없다.

### 빠른 검색 칸과 거른 건수

안쪽 그리드가 `filter={true}` 이거나 `filter` 를 생략한 그리드(대화 상자 안과 `settingsMenu={false}` 제외)이면 머리줄 업무 버튼 앞에 빠른 검색 칸(`data-testid="grid-quick-filter-input"`)이 기본으로 늘 있다. 검색어는 저장하지 않고 데이터가 바뀌어도 유지되며, 내장 행추가·행복사 단추는 누를 때 검색어를 비운다. 단 `serverPaged` 의 `filter` 생략 그리드는 검색 칸이 기본으로 없고 사용자가 「그리드 설정」 > 「필터 창 보기」 를 켠 동안만 생긴다(끄면 사라지고 검색어·칸별 조건을 지운다). 거른 동안 제목 옆 건수가 「보이는 행 / 전체 행」(`grid-panel-filter-count`)으로 바뀌고, 거르지 않으면 `count` 그대로다. 검색 칸의 툴팁(title)과 안내 글은 「받아 둔 행 안에서만 찾습니다.」 이고, GridPanel 의 `serverPaged` 면 「지금 쪽에서만 찾습니다.」, 안쪽 그리드에 편집 칸이 있으면 「새로 넣은 행도 조건에 맞지 않으면 숨습니다.」 가 덧붙는다. GridPanel 에 줄 걸러 보기 prop 은 없다(`serverPaged` 만 안내 글에 쓰인다). 규칙은 [AgDataGrid](ag-data-grid.md) §걸러 보기: filter. 한 GridPanel 에 `filter={true}` 그리드가 여럿이면 먼저 등록한 그리드가 걸러 보기 대상(검색 칸·건수·메뉴의 「칸별 필터 보기」)이고, 없으면 설정 메뉴의 대상 그리드가 대상이다. 다시 마운트되는 검색 칸은 그리드에 걸린 검색어로 시작한다.

### 추가 버튼·도움말·머리 노드

- `buttons`: 내장 버튼 뒤에 붙는 일반 버튼 배열(`GridButton`: `id`, `label`, `onClick`, `className`, `disabled`).
- `titleExtra`: 제목·건수 오른쪽 노드(필터 칩 등). `headerExtra`: 업무 버튼 묶음 바로 뒤 노드(최대화 토글 등). 그리드 설정 아이콘은 늘 이 노드보다 오른쪽이다(§그리드 설정 메뉴의 머리줄 순서).
- `help`: 제목 옆 "?" 버튼. 누르면 컬럼 설명 팝업이 열린다.

```tsx
<GridPanel
  title="검사 목록"
  count={rows.length}
  help={{
    summary: "검사 결과를 보여 줍니다.",
    columns: [{ header: "판정", description: "합격 여부", values: [{ label: "NG", description: "불합격" }] }],
  }}
>
  {/* AgDataGrid */}
</GridPanel>
```

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| title | `string` | - | 패널 제목 |
| count | `number` | - | 건수. 주면 "N건"으로 표시하고, 안 주면 표시하지 않는다 |
| serverPaged | `boolean` | `false` | Pagination 으로 쪽을 넘기며 한 쪽의 행만 `data` 로 들고 있으면 준다. 「그리드 설정」 메뉴의 엑셀 항목이 「엑셀 출력 (현재 페이지)」 가 되고, 빠른 검색 칸 안내 글이 「지금 쪽에서만 찾습니다.」 가 된다(§그리드 설정 메뉴) |
| children | `ReactNode` | - | 보통 `AgDataGrid` |
| showAddButton | `boolean` | `false` | 행추가 버튼. `data`·`columns`·`onDataChange` 가 있어야 동작한다 |
| showDeleteButton | `boolean` | `false` | 행삭제 버튼. `selectedRowKey` 가 없으면 비활성 |
| showCopyButton | `boolean` | `false` | 행복사 버튼. `selectedRowKey` 가 없으면 비활성 |
| addButtonLabel | `string` | `"행추가"` | 표준은 기본값 그대로 |
| deleteButtonLabel | `string` | `"행삭제"` | 표준은 기본값 그대로 |
| copyButtonLabel | `string` | `"행복사"` | 표준은 기본값 그대로 |
| data | `Record<string, unknown>[]` | - | 현재 그리드 데이터 |
| rowKey | `string` | `"id"` | 행 식별 키 |
| columns | `GridColumn[]` | - | 빈 행을 만들 때 쓰는 열 정의 |
| selectedRowKey | `string \| number \| null` | - | 현재 선택 행 키(삭제·복사 대상) |
| defaultRowValues | `Record<string, unknown>` | - | 새 행의 기본값 |
| onDataChange | `(data, addedRowKey?) => void` | - | 추가·삭제·복사 결과. 추가·복사면 두 번째 인자가 임시 ID |
| buttons | `GridButton[]` | `[]` | 추가 버튼 |
| titleExtra | `ReactNode` | - | 제목·건수 오른쪽 노드 |
| headerExtra | `ReactNode` | - | 업무 버튼 묶음 뒤 노드. 그리드 설정 아이콘 칸이 항상 이 노드 뒤 맨 오른쪽이다. 안에서 absolute·fixed 배치를 쓰지 않는다 |
| help | `GridHelpConfig` | - | `{ title?, summary?, columns: { header, description, values?, note? }[] }`. `title` 기본값은 "그리드 도움말" |
| loading | `boolean` | `false` | 참이면 행추가·행삭제·행복사·`buttons` 를 비활성화한다(「그리드 설정」 메뉴는 제외) |
| usePermission | `boolean` | `false` | 참이면 `fetchPermissions` 가 돌려준 버튼 id 만 누를 수 있고, 나머지 버튼은 보이되 비활성이다(「그리드 설정」 메뉴는 제외 — 늘 활성) |
| fetchPermissions | `() => Promise<string[]>` | - | 허용 버튼 id 목록 조회 |
| className | `string` | `""` | 루트 클래스 |
| style | `CSSProperties` | - | 루트 스타일 |

내장 버튼의 id 는 `btn_grid_add`·`btn_grid_delete`·`btn_grid_copy` 다. 개인화가 켜졌거나 엑셀 출력이 켜진 그리드(GridPanel 안은 기본 켬)가 있으면 자동으로 붙는 「그리드 설정」 메뉴(항목 id `btn_grid_columns`·`btn_grid_reset`, 엑셀 `grid-excel`)는 권한·`loading` 과 무관하다(§그리드 설정 메뉴). 같은 모듈에서 `getRowIdentifier(row, rowKey)`·`isTempRow`·`GRID_TEMP_ID_FIELD` 도 export 한다.

## 표준값: 모든 화면 동일

- 모든 목록: `<GridPanel title="<목록명>" count={rows.length}>`.
- 행추가·행삭제·행복사는 PageLayout 상단 버튼이 아니라 GridPanel 머리에 둔다. 행추가·행복사는 `showAddButton`·`showCopyButton`(라벨 기본값 그대로), 행삭제는 `buttons` 의 확인창 버튼(`id: "btn_grid_delete"`, `label: "행삭제"`)이다.
- 처리 중 변수는 `isBusy` 하나로 쓴다(`loading={isBusy}`).

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 행추가 버튼을 PageLayout 상단 `buttons` 에 둔다 | GridPanel 의 `showAddButton` 으로 옮긴다 |
| `showAddButton` 만 주고 `data`·`columns`·`onDataChange` 를 안 준다 | 버튼은 보이지만 눌러도 아무 일이 없다 |
| 행복사에 훅을 쓰면서 `defaultRowValues` 를 줬는데 복사본이 기본값으로 덮인다 | 훅의 `handleGridDataChange` 가 복사 행에 `defaultRowValues` 를 덮어쓴다. 복사는 `grid.handleCopyRow` 를 직접 부르거나 `showCopyButton` 을 쓰지 않는다 |
| 라벨에 업무명을 붙인다("단위 행추가") | 기본 라벨을 그대로 쓴다 |
| `count` 에 선택 건수나 하드코딩 값을 준다 | 목록 전체 건수(`rows.length`)를 준다 |
| `headerExtra` 안에서 `position: absolute`·`fixed` 로 요소를 띄우거나 `order` 로 설정 아이콘 앞에 세우려 한다 | 설정 아이콘 칸은 DOM 마지막·`order: 2147483647` 로 고정이라 `order` 는 통하지 않고, absolute 로 띄운 요소는 순서로 막지 못해 아이콘을 가린다. 일반 흐름(flex 자식)으로만 둔다 |
| 읽기 전용 작은 표인데 설정 아이콘이 필요 없다고 GridPanel 머리줄 CSS 를 덮는다 | 안쪽 그리드에 `settingsMenu={false}` 를 준다 |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/lsh/noticeMgmt/page.tsx:285`: 제목 + 건수만 쓰는 표준 모양(MES).
- `src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx:908-920`: `showAddButton`·`showCopyButton`·`showDeleteButton` + `onDataChange` + `loading`. 단, 훅을 쓰지 않고 화면이 직접 `handleDataChange` 를 구현한다.
- `src/frontend/m-mdm/pages/dmc/codeItemEdit/page.tsx:480-495`: `titleExtra`(필터 칩)와 `headerExtra`(코드 추가 버튼). 단, 버튼에 `size` prop 을 주는 점은 표준과 다름.
- `src/frontend/m-design-dummy/src/screens/MasterDataScreen.tsx:362-391`: `help` 의 형식. 단, 행추가·행삭제를 `buttons` 로 직접 만드는 점은 표준과 다름.
