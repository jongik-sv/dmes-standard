# EditableRowList

작은 설정 목록(표 컬럼 목록, 차트 계열 목록 등)을 칸 편집으로 고치고 행을 추가·위로·아래로·삭제하게 할 때 쓴다. 편집기·팝업 안에서 몇 행짜리 설정 배열을 다루는 칸에 맞다.

- import: `import { EditableRowList, type EditableRowListProps } from "@dk-oasis/shared/grid";` (CSS import 없음)
- 소스: `src/frontend/shared/src/components/grid/EditableRowList.tsx`, 목록 조작 `row-list-ops.ts`(`moveItem`·`removeAt`·`updateAt` 도 `grid` 에서 export)
- 내부 구현: [GridPanel](grid-panel.md) 안에 [AgDataGrid](ag-data-grid.md)(`columnSizing="fit"`, `singleClickEdit`, 행 하나 선택)
- Part B 허용 목록(§1): `grid` 서브패스에 포함(새 서브패스 없음, §18 등록).

## 언제 쓰나

- 쓴다: 저장 전의 설정 항목을 배열로 들고 있고, 항목마다 몇 칸을 바로 고치며 순서를 바꿔야 할 때.
- 쓰지 않는다: 서버에 저장하는 업무 데이터 목록(행 상태·저장·삭제 확인이 필요하면 `AgDataGrid` + [useGridDataManager](use-grid-data-manager.md)). 읽기 전용 목록은 `AgDataGrid`.
- `GridPanel showAddButton` 과의 차이: 이 부품은 항목 배열(`items`)을 바깥이 소유하고 바뀔 때마다 `onChange` 로 새 배열을 받는다. 임시 키·행 상태·삭제 확인창은 없다(저장 전 설정이라 바깥 화면이 저장하지 않은 변경을 지킨다).

## 표준 사용

```tsx
import { EditableRowList } from "@dk-oasis/shared/grid";
import type { GridColumn } from "@dk-oasis/shared/grid";

interface Series { field: string; label?: string }

const COLUMNS: GridColumn[] = [
  { key: "field", header: "필드", editable: true },
  { key: "label", header: "표시 이름", editable: true },
];

function normalize(field: string, value: unknown): unknown {
  const text = String(value ?? "").trim();
  return field === "field" ? text : text === "" ? undefined : text;
}

<EditableRowList<Series>
  title="값 계열"
  items={cfg.series}
  columns={COLUMNS}
  onChange={(series) => patch({ series })}
  newItem={() => ({ field: "" })}
  addLabel="계열 추가"
  emptyMessage="값 계열을 넣으세요"
  normalize={normalize}
/>;
```

`columns` 는 컴포넌트 밖 모듈 상수나 `useMemo` 로 둔다. 열 `key` 는 항목 필드 이름과 같아야 한다.

## 변형

### 버튼 더하기

기본 버튼(추가·위로·아래로·삭제) 뒤에 `extraButtons` 로 `GridButton` 을 붙인다.

```tsx
<EditableRowList<Column>
  …
  extraButtons={[{ id: "fill-all", label: "결과 컬럼 모두 넣기", disabled: columns.length === 0, onClick: fillAll }]}
/>
```

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| title | `string` | 필수 | 패널 제목 |
| items | `readonly T[]` | 필수 | 항목 배열. 바깥이 소유한다 |
| columns | `GridColumn[]` | 필수 | 칸 편집 열(`editable`). `key` 는 항목 필드 이름 |
| onChange | `(items: T[]) => void` | 필수 | 추가·이동·삭제·칸 편집 때마다 새 배열로 호출 |
| newItem | `() => T` | 필수 | 추가 버튼이 끝에 붙일 새 항목 |
| addLabel | `string` | 필수 | 추가 버튼 문구 |
| emptyMessage | `string` | 필수 | 항목이 없을 때 보일 문구 |
| normalize | `(field: string, value: unknown) => unknown` | 필수 | 칸 편집 값 정리. 돌려준 값이 항목에 들어간다 |
| extraButtons | `GridButton[]` | `[]` | 기본 버튼 뒤에 붙는 버튼 |
| height | `number` | `200` | 목록 영역 높이(px) |
| idPrefix | `string` | `"row-list"` | 버튼 id 앞머리(`-add`·`-up`·`-down`·`-remove`) |
| testId | `string` | - | 바깥 칸의 `data-testid` |

## 표준값: 모든 화면 동일

- 기본 버튼 순서·문구: 추가(문구는 `addLabel`) · 위로 · 아래로 · 삭제. 위로·아래로·삭제는 행을 고른 뒤 켜진다.
- 삭제 확인창은 없다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 서버에 저장하는 업무 목록에 쓴다 | `AgDataGrid` + `useGridDataManager`(행 상태·삭제 확인) |
| `normalize` 에서 빈 글자를 그대로 돌려준다 | 선택 필드는 빈 글자를 `undefined` 로 바꿔 저장 때 키가 빠지게 한다 |
| `columns` 를 렌더 안에서 매번 새로 만든다 | 모듈 상수나 `useMemo` 로 둔다 |
| 같은 화면에 이 부품을 둘 이상 두면서 `idPrefix` 를 안 바꾼다 | 버튼 id 가 겹치지 않게 `idPrefix` 를 준다 |

## 실제 사용 예

- `src/frontend/m-mcm/widget-types/query-table/editor.tsx`: 표 컬럼 목록(`extraButtons` 로 「결과 컬럼 모두 넣기」).
- `src/frontend/m-mcm/widget-types/query-chart/editor.tsx`: 값 계열 목록.
