# Pagination

서버 쪽 페이징으로 목록을 나눠 조회할 때 그리드 아래에 이전/다음 페이지 이동 막대를 붙이는 데 쓴다.

- import: `import { Pagination } from "@dk-oasis/shared/grid";`
- 소스: `src/frontend/shared/src/components/grid/Pagination.tsx`
- 내부 구현: 일반 `div`·`button`·`select` 에 인라인 스타일. Mantine 컴포넌트가 아니다

## 언제 쓰나

- 쓴다: 조회 결과가 많아 BE 가 `page`·`size` 로 잘라 주는 목록. 조회 결과를 한 번에 받는 목록에는 쓰지 않는다.
- 쓰지 않는다: 행 수가 적은 목록(`height="auto"` 의 작은 목록), 무한 스크롤. 팝업 선택 목록은 이미 [LookupModal](lookup.md) 이 이 컴포넌트를 쓴다.

## 표준 사용

```tsx
import { useState } from "react";
import { AgDataGrid, GridPanel, Pagination, type GridColumn } from "@dk-oasis/shared/grid";

type ItemRow = { itemCd: string; itemNm: string };

const PAGE_SIZE = 50;
const COLUMNS: GridColumn[] = [
  { key: "itemCd", header: "품번", width: 120, align: "left" },
  { key: "itemNm", header: "품명", width: 180, align: "left" },
];

export function ItemList({ rows, totalCount, isBusy, onLoad }: {
  rows: ItemRow[]; totalCount: number; isBusy: boolean; onLoad: (page: number) => Promise<void>;
}) {
  const [page, setPage] = useState(0); // 0 부터 시작한다
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <>
      <GridPanel title="품목 목록" count={totalCount}>
        <AgDataGrid rowKey="itemCd" columns={COLUMNS} data={rows} columnSizing="fit" loading={isBusy} />
      </GridPanel>
      <Pagination
        page={page}
        totalPages={totalPages}
        totalElements={totalCount}
        disabled={isBusy}
        onPageChange={(p) => { setPage(p); void onLoad(p); }}
      />
    </>
  );
}
```

`count` 는 현재 페이지가 아니라 전체 건수(`totalCount`)를 준다.

## 변형

### 첫/마지막 이동과 페이지 크기 선택

`showFirstLast` 를 켜면 «·» 버튼이 붙는다. `pageSize`·`pageSizeOptions`·`onPageSizeChange` 를 모두 주면 "페이지당" 선택이 나타난다. 크기를 바꾸면 `page` 를 0 으로 되돌려 다시 조회한다.

```tsx
<Pagination
  page={page} totalPages={totalPages} totalElements={totalCount} showFirstLast
  pageSize={size} pageSizeOptions={[50, 100, 200]}
  onPageSizeChange={(s) => { setSize(s); setPage(0); void onLoad(0); }}
  onPageChange={(p) => { setPage(p); void onLoad(p); }}
/>
```

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| page | `number` | 필수 | 현재 페이지 인덱스(0부터) |
| totalPages | `number` | 필수 | 전체 페이지 수. 0 이하면 아무것도 그리지 않는다 |
| onPageChange | `(page: number) => void` | 필수 | 페이지 이동(0부터) |
| totalElements | `number` | - | 주면 "총 N건"을 표시한다 |
| disabled | `boolean` | `false` | 조회 중 등 임시 비활성 |
| align | `"left" \| "center" \| "right"` | `"right"` | 막대 정렬 |
| showFirstLast | `boolean` | `false` | 첫/마지막 페이지 버튼 |
| pageSize | `number` | - | 현재 페이지 크기. 크기 선택에 필요하다 |
| pageSizeOptions | `number[]` | - | 크기 선택 후보. 비면 선택을 숨긴다 |
| onPageSizeChange | `(size: number) => void` | - | 있어야 크기 선택이 보인다 |

## 표준값: 모든 화면 동일

- 페이지는 0 부터 센다. 화면에는 "1 / N 페이지"로 보인다.
- 조회 중에는 `disabled={isBusy}` 를 준다. `totalPages` 는 `Math.max(1, Math.ceil(총건수 / 페이지크기))` 로 계산한다.
- 위치는 `GridPanel` 바깥, 바로 아래다(위 예제·`m-mdm/pages/dme/ruleMng`). 새 화면도 같은 위치에 둔다(GridPanel 안쪽 배치는 확인된 사용처가 없다).

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `page` 에 1부터 센 값을 준다 | 0부터 센다. 첫 페이지는 `0` |
| `totalPages` 를 0 으로 둬서 막대가 안 보인다 | 0 이하면 그리지 않는다. 0건이어도 보이려면 `Math.max(1, …)` |
| 크기 선택이 안 보인다 | `pageSize`·`pageSizeOptions`·`onPageSizeChange` 셋이 모두 필요하다 |
| 색·여백을 화면 CSS 로 바꾸려 한다 | 이 컴포넌트는 16진수 색과 인라인 스타일을 내부에 쓰며 테마 토큰을 따르지 않는다. 바꾸려면 shared 를 고친다(보강 후보) |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dme/ruleMng/page.tsx:254-260`: `GridPanel` 바깥, 바로 아래에 둔다. `totalPages` 는 `:186`.
- `src/frontend/m-mcm/page-components/cmb/masterRuleData/page.tsx:434-442`: `GridPanel` 안쪽 맨 끝에 둔다. 단, 위 예와 위치가 다르다.
- `src/frontend/m-design-dummy/src/screens/DataDisplayCatalogScreen.tsx:286-297`: `pageSizeOptions` 를 쓰는 샘플(하드코딩 데이터). 업무 화면 중에는 쓰는 곳이 없다.
