# MatrixTable

"첫 열(라벨) + 동적으로 늘어나는 열 + 셀마다 직접 그린 값" 구조의 비교 매트릭스(피벗) 표를 보일 때 쓴다.

- import: `import { MatrixTable, type MatrixTableColumn, type MatrixTableRow } from "@dk-oasis/shared/matrix-table";`
- 소스: `src/frontend/shared/src/components/matrix-table/MatrixTable.tsx`
- 내부 구현: 원시 `table` + 인라인 스타일(외부 CSS 없음). Mantine 컴포넌트가 아니다
- Part B 허용 목록(§1)에 `matrix-table` 서브패스 항목은 없고, §6 에서 원시 `<table>` 금지의 예외로만 언급된다. 허용 목록 등재가 필요한 항목이다(ASK).

## 언제 쓰나

- 쓴다: KPI 를 시나리오별로 비교하는 표, 변수 x 단계 값 표처럼 열 수가 데이터로 정해지고 셀을 열 key 로 조회해 그리는 표.
- 쓰지 않는다: 같은 모양의 행이 반복되는 일반 목록 → [AgDataGrid](ag-data-grid.md). 라벨-값 짝의 폼 표 → [detail-form](detail-form.md).
- 일반 데이터 목록을 `MatrixTable` 이나 원시 `<table>` 로 그리지 않는다.

## 표준 사용

```tsx
import { MatrixTable, type MatrixTableColumn, type MatrixTableRow } from "@dk-oasis/shared/matrix-table";

type Scenario = { id: string; name: string };
type KpiValues = Record<string, Record<string, number>>; // 시나리오 id -> 지표 key -> 값

const KPI_ROWS: { key: string; label: string }[] = [
  { key: "otd", label: "납기 준수율" },
  { key: "util", label: "설비 가동률" },
];

export function ScenarioCompare({ scenarios, values, baseId }: {
  scenarios: Scenario[]; values: KpiValues; baseId: string;
}) {
  const columns: MatrixTableColumn[] = scenarios.map((s) => ({
    key: s.id, header: s.name, highlight: s.id === baseId, // 기준 시나리오 열 강조
  }));
  const rows: MatrixTableRow[] = KPI_ROWS.map((k) => ({
    key: k.key,
    label: k.label,
    renderCell: (columnKey) => values[columnKey]?.[k.key] ?? "-",
  }));
  return <MatrixTable cornerHeader="지표 \ 시나리오" columns={columns} rows={rows} />;
}
```

## 변형

### 행 강조와 셀별 스타일

합계·종합 행은 `highlight: true`, 셀마다 바꿔야 하는 스타일은 `cellStyle(columnKey)` 로 준다. 색은 의미 토큰만 쓴다.

```tsx
const row: MatrixTableRow = {
  key: "total", label: "종합", highlight: true,
  renderCell: (c) => values[c]?.total ?? "-",
  cellStyle: (c) => ((values[c]?.total ?? 0) < 80 ? { background: "var(--color-warning-soft)" } : undefined),
};
```

### 데이터 셀 정렬

`align` 으로 데이터 셀 정렬을 바꾼다(`"left"`·`"right"`·`"center"`). 기본은 숫자에 맞는 `"right"` 이고, 글자 값이 많으면 `"left"` 를 준다.

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| cornerHeader | `ReactNode` | 필수 | 좌상단 코너 머리 |
| columns | `MatrixTableColumn[]` | 필수 | 데이터 열: `key`, `header`, `highlight?`(머리·셀 배경 강조) |
| rows | `MatrixTableRow[]` | 필수 | 행: `key`, `label`, `renderCell(columnKey)`, `highlight?`(굵게 + 배경), `cellStyle?(columnKey)` |
| align | `"left" \| "right" \| "center"` | `"right"` | 데이터 셀 정렬 |
| className | `string` | `""` | `cm-matrix-table` 뒤에 덧붙일 클래스 |

머리는 스크롤할 때 위에 고정(sticky)된다.

## 표준값: 모든 화면 동일

- 일반 목록은 `AgDataGrid`. `MatrixTable` 은 열이 데이터로 정해지는 비교·피벗 표에만 쓴다.
- `cellStyle` 의 색은 의미 토큰(`var(--color-…)`)만, 16진수·rgb 는 쓰지 않는다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 일반 데이터 목록을 `MatrixTable` 로 그린다 | `AgDataGrid` 로 바꾼다 |
| `cellStyle` 에 `#f1f5f9` 같은 색을 준다 | `var(--color-warning-soft)` 같은 토큰을 준다 |
| 머리·강조 색을 화면 CSS 로 덮으려 한다 | 이 컴포넌트는 기본 배경·테두리를 16진수 인라인으로 두어 테마를 따르지 않는다. 바꾸려면 shared 를 고친다(보강 후보) |
| `columns` 의 `key` 와 `renderCell` 의 인자가 어긋난다 | `renderCell(columnKey)` 는 `column.key` 를 받는다. 같은 값으로 조회한다 |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/ValueTable.tsx:43-92`: 변수 x 단계 값 표. 열 `highlight`, 행 `renderCell`, `cellStyle`(토큰 색)을 모두 쓴다.
- `src/frontend/m-design-dummy/src/screens/DataDisplayCatalogScreen.tsx:360`: 카탈로그 샘플(`MATRIX_COLUMNS`·`MATRIX_ROWS`).
- MES 모듈(m-mpp·m-mqc·m-mls·m-mcm)에서는 아직 사용처 없음.
