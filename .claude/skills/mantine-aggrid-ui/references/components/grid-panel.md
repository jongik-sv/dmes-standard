# GridPanel

그리드 위에 목록 제목·건수·행추가/행삭제/행복사 버튼을 붙이는 머리를 만들 때 쓴다. 모든 목록은 이 안에 `AgDataGrid` 를 둔다.

- import: `import { GridPanel, getRowIdentifier, type GridButton } from "@dk-oasis/shared/grid";`
- 소스: `src/frontend/shared/src/components/grid/GridPanel.tsx` (도움말 팝업은 `GridHelpButton.tsx`)
- 내부 구현: 일반 `div` + `button`(`grid-btn` 클래스). 도움말 팝업은 shared `Modal`

## 언제 쓰나

- 쓴다: 모든 목록의 머리. 제목과 건수만 있어도 쓴다.
- 쓴다: 행추가·행삭제·행복사 버튼을 그리드 머리에 둘 때(상단 PageLayout 버튼이 아니다).
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

### 추가 버튼·도움말·머리 노드

- `buttons`: 내장 버튼 뒤에 붙는 일반 버튼 배열(`GridButton`: `id`, `label`, `onClick`, `className`, `disabled`).
- `titleExtra`: 제목·건수 오른쪽 노드(필터 칩 등). `headerExtra`: 버튼 묶음 오른쪽 끝 노드(최대화 토글 등).
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
| headerExtra | `ReactNode` | - | 버튼 묶음 오른쪽 끝 노드 |
| help | `GridHelpConfig` | - | `{ title?, summary?, columns: { header, description, values?, note? }[] }`. `title` 기본값은 "그리드 도움말" |
| loading | `boolean` | `false` | 참이면 모든 버튼을 비활성화한다 |
| usePermission | `boolean` | `false` | 참이면 `fetchPermissions` 가 돌려준 버튼 id 만 보인다 |
| fetchPermissions | `() => Promise<string[]>` | - | 허용 버튼 id 목록 조회 |
| className | `string` | `""` | 루트 클래스 |
| style | `CSSProperties` | - | 루트 스타일 |

내장 버튼의 id 는 `btn_grid_add`·`btn_grid_delete`·`btn_grid_copy` 다. 같은 모듈에서 `getRowIdentifier(row, rowKey)`·`isTempRow`·`GRID_TEMP_ID_FIELD` 도 export 한다.

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

## 실제 사용 예

- `src/frontend/m-mls/pages/lsh/noticeMgmt/page.tsx:285`: 제목 + 건수만 쓰는 표준 모양(MES).
- `src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx:908-920`: `showAddButton`·`showCopyButton`·`showDeleteButton` + `onDataChange` + `loading`. 단, 훅을 쓰지 않고 화면이 직접 `handleDataChange` 를 구현한다.
- `src/frontend/m-mdm/pages/dmc/codeItemEdit/page.tsx:480-495`: `titleExtra`(필터 칩)와 `headerExtra`(코드 추가 버튼). 단, 버튼에 `size` prop 을 주는 점은 표준과 다름.
- `src/frontend/m-design-dummy/src/screens/MasterDataScreen.tsx:362-391`: `help` 의 형식. 단, 행추가·행삭제를 `buttons` 로 직접 만드는 점은 표준과 다름.
