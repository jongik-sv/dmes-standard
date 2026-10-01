# GridBadge

그리드 셀 안에 OK/NG 같은 상태 값을 색 배지로 보일 때 쓴다. 여러 배지는 `GridBadgeGroup`, 셀 정렬은 `GridBadgeCell` 이 맡는다.

- import: `import { GridBadge, GridBadgeCell, GridBadgeGroup } from "@dk-oasis/shared/grid";`
- 소스: `src/frontend/shared/src/components/grid/GridBadge.tsx` (스타일은 `grid.css` 의 `.cm-grid-badge*`)
- 내부 구현: 일반 `span`/`div`. 색은 CSS 변수(`--cm-grid-badge-bg`·`--cm-grid-badge-color`·`--cm-grid-badge-border`)로 받는다

## 언제 쓰나

- 쓴다: `GridColumn.render` 안에서 상태·판정·구분 값(OK/NG, 진행/완료)을 표시할 때.
- 쓰지 않는다: 행 전체의 오류 배경 → [AgDataGrid](ag-data-grid.md) 의 `getRowClassExtra` + `ag-row-error`. 셀 배경 강조 → `cellClassRules`.
- 쓰지 않는다: 그리드 밖의 상태 표시. 배지 스타일은 `.cm-data-grid` 안에서만 적용된다.

## 표준 사용

```tsx
import { GridBadge, type GridColumn } from "@dk-oasis/shared/grid";

// OK 는 성공, NG 는 위험 토큰 쌍을 쓴다. 16진수·rgb 값은 쓰지 않는다.
const COLUMNS: GridColumn[] = [
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
];
```

## 변형

### 의미 토큰 쌍

| 의미 | bg | color |
|---|---|---|
| 정상·완료·OK | `var(--color-success-soft)` | `var(--color-success)` |
| 오류·거부·NG | `var(--color-danger-soft)` | `var(--color-danger)` |
| 주의·미저장 | `var(--color-warning-soft)` | `var(--color-warning)` |
| 기본·값 없음 | 생략(회색 기본) | 생략 |

### 여러 배지와 정렬

한 셀에 배지를 여러 개 둘 때는 `GridBadgeGroup`(넘치면 `wrap`), 셀 안에서 정렬하려면 `GridBadgeCell`(기본 가운데, `align="left"` 등)로 감싼다.

```tsx
render: (_v, row) => (
  <GridBadgeCell align="left">
    <GridBadgeGroup wrap>
      {(row.tags as string[]).map((t) => <GridBadge key={t} label={t} />)}
    </GridBadgeGroup>
  </GridBadgeCell>
),
```

### 강조·흐림·값 없음

`strong` 은 굵은 글자, `dimmed` 는 반투명, `muted` 는 배경·테두리 없이 흐린 글자(예: "없음")다.

## Props

GridBadge

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| label | `ReactNode` | 필수 | 배지 안에 보일 내용 |
| title | `string` | - | 마우스오버 툴팁 |
| bg | `string` | 회색(`--color-bg-disabled`) | 배경색. 의미 토큰만 쓴다 |
| color | `string` | `--color-text-secondary` | 글자색. 의미 토큰만 쓴다 |
| borderColor | `string` | 투명 | 테두리색 |
| strong | `boolean` | `false` | 굵게 |
| dimmed | `boolean` | `false` | 반투명(0.5) |
| muted | `boolean` | `false` | 배경·테두리 없는 흐린 글자 |
| className | `string` | - | 추가 클래스 |

GridBadgeCell: `children`, `align`(`"left" | "center" | "right"`, 기본 `"center"`), `className`. GridBadgeGroup: `children`, `wrap`(기본 `false`), `className`.

## 표준값: 모든 화면 동일

- 상태 값은 `GridColumn.render` 에서 `GridBadge` 로 표시한다.
- 색은 위 표의 의미 토큰 쌍만 쓴다. OK 는 success, NG 는 danger.
- `size`·`radius` 를 주지 않는다(이 컴포넌트에는 없다).

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `bg="#e6f3ed"` 처럼 16진수를 준다 | `var(--color-success-soft)` 같은 토큰을 준다 |
| 그리드 밖(GridPanel 머리 `titleExtra` 등)에서 쓴다 | 스타일 규칙이 `.cm-data-grid` 안으로 한정돼 밖에서는 꾸밈이 없는 글자로 보인다. 확인 후 쓴다 |
| 여러 배지를 `GridBadgeGroup` 없이 나열한다 | 간격이 안 생긴다. `GridBadgeGroup` 으로 감싼다 |
| 행 전체를 칠하려고 배지를 쓴다 | `getRowClassExtra` 의 `ag-row-error` 를 쓴다 |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dmc/codeItemEdit/page.tsx:76-86` 의 `badgeOf` 와 `:359-363`: `render` 안에서 토큰 쌍으로 배지를 만든다(표준과 같다).
- `src/frontend/m-mdm/pages/dmc/codeItemEdit/page.tsx:485`: `GridPanel` 의 `titleExtra`(그리드 밖)에서 `strong` 배지를 쓴다. 단, 위 "흔한 실수" 대로 그리드 밖이라 스타일 적용 여부를 확인해야 한다.
- `src/frontend/m-design-dummy/src/screens/DataDisplayCatalogScreen.tsx:60-72`: 16진수 색(`#e8f1fb` 등)을 `bg`·`color` 로 준다. 단, 표준과 다름(토큰만 써야 한다). `GridBadgeCell`·`GridBadgeGroup` 의 사용법은 같은 파일 `:111-125`, `:310-322` 를 본다.
