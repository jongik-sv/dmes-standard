# GridLimitNotice

서버가 목록을 행 수 상한(예: 1,000건)으로 잘라 보냈을 때, 그리드 패널 머리에 「전체 N건 중 M건을 표시합니다. 조건을 좁히거나 [전체 보기]를 누르세요.」 안내와 [전체 보기] 단추를 한 줄로 보인다. 화면 성능 가이드 R1(첫 조회 상한)의 화면 쪽 부품이다.

- import: `import { GridLimitNotice, gridLimitNoticeText, type GridLimitNoticeProps } from "@dk-oasis/shared/grid";` (CSS import 없음)
- 소스: `src/frontend/shared/src/components/grid/GridLimitNotice.tsx`
- 내부 구현: `span` 두 개 + shared `Button`(`size="mini"`). 스타일은 컴포넌트가 `<style href="cm-grid-limit-notice">` 로 직접 넣는다(Part B §18-3). 색은 `--color-warning`, 간격·글자 크기는 공통 토큰만 쓴다
- Part B §18(새 공통 컴포넌트 등록)로 등록했다. `grid` 서브패스가 이미 있어 진입점·exports 추가는 없다

## 언제 쓰나

- 쓴다: 조건 없는 첫 조회가 수천 건을 넘을 수 있는 목록에서, 서버가 상한만큼만 주고 `totalCount`(전체 건수)를 함께 줄 때. [전체 보기] 는 상한 없이 다시 받는 기능 축소 방지 장치다(엑셀 내보내기 전체 필요 등).
- 쓰지 않는다: 페이지를 넘겨 보는 서버 페이징 → [Pagination](pagination.md). 표 아래 행 수·엑셀 단추 → [GridExcelFoot](grid-excel-foot.md) 또는 `AgDataGrid excelExport`. 패널 머리의 건수 자체 → [GridPanel](grid-panel.md) `count`.
- 조건이 있는 조회는 상한을 걸지 않으므로(전부 받음) 이 안내가 나오지 않는다. 잘리지 않은 목록에 「N건 중 M건」을 보이면 사실과 다르다.

## 표준 사용

`GridPanel` 의 `titleExtra`(제목·건수 오른쪽) 자리에 넣는다. GridPanel 없이 쓰는 [AgDataGrid](ag-data-grid.md) 도 같은 이름의 `titleExtra` 가 같은 자리(그리드 머리줄의 제목·건수 오른쪽)이니 그리드 위에 따로 두지 말고 거기에 넣는다. 감싸개를 따로 만들지 않는다. 잘리지 않았으면(`shownCount >= totalCount` 또는 `totalCount` 없음) 아무것도 그리지 않으므로 화면은 늘 넣어 두면 된다.

```tsx
import { useCallback, useState } from "react";
import { AgDataGrid, GridLimitNotice, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";

const LIMIT = 1000; // m-mdm 은 `@/oasis-screen` 의 FIRST_SEARCH_LIMIT

export function ItemList({ columns, search }: {
  columns: GridColumn[];
  search: (limit?: number) => Promise<{ list: Record<string, unknown>[]; totalCount?: number; truncated?: boolean }>;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // [조회] 는 load(), [전체 보기] 는 load(true)
  const load = useCallback(async (all = false) => {
    setBusy(true);
    try {
      const res = await search(all ? undefined : LIMIT);
      setRows(res.list);
      setTotal(res.truncated ? (res.totalCount ?? null) : null);
    } finally {
      setBusy(false);
    }
  }, [search]);

  return (
    <GridPanel
      title="품목 목록"
      count={rows.length}
      titleExtra={
        <GridLimitNotice shownCount={rows.length} totalCount={total} onShowAll={() => void load(true)} disabled={busy} />
      }
    >
      <AgDataGrid rowKey="itemId" columns={columns} data={rows} loading={busy} />
    </GridPanel>
  );
}
```

서버 쪽 짝(MDM 선례 `ColumnMngService.search`·`TermMngService.search`): 요청에 `limit` 이 오고 조건이 없을 때만 앞쪽 `limit` 건을 DB 단계에서 줄여 읽고, 응답에 `totalCount`·`truncated` 를 싣는다. `limit` 을 보내지 않는 기존 호출자는 지금처럼 전체를 받는다.

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `shownCount` | `number` | (필수) | 지금 그리드에 실린 행 수 |
| `totalCount` | `number \| null` | — | 조건에 맞는 전체 건수(서버 `totalCount`). 비우거나 `shownCount` 이하면 그리지 않는다 |
| `onShowAll` | `() => void` | (필수) | [전체 보기] 를 눌렀을 때. 상한 없는 재조회는 화면이 한다 |
| `disabled` | `boolean` | `false` | 조회 중 단추 비활성 |
| `testId` | `string` | `"grid-limit-notice"` | 안내 줄 data-testid. 단추는 `<testId>-show-all` |

`gridLimitNoticeText(shown, total)` 은 같은 문구를 돌려준다(시험·문서용).

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 화면에서 `<div style={{color: ...}}>전체 N건 중…</div>` 를 직접 만듦 | 이 컴포넌트를 `titleExtra` 에 넣는다 |
| 응답의 `truncated` 를 보지 않고 `totalCount` 를 늘 넘김 | 잘리지 않았으면 그리지 않으므로 해는 없지만, 화면 상태는 `truncated ? totalCount : null` 로 둔다 |
| [전체 보기] 뒤 저장·삭제 재조회가 다시 상한으로 돌아감 | 마지막 조회 모드(전체 보기 여부)를 기억해 재조회에 넘긴다. [조회] 를 누르면 상한 모드로 돌아간다 |
| 조건이 있는 조회도 잘라서 안내를 띄움 | 조건 조회는 상한 없이 전부 받는다(화면 성능 가이드 R1) |

## 실제 사용 예

- `src/frontend/m-mdm/pages/dma/columnMng/page.tsx` — 컬럼 사전 목록(`testId="column-list-limit"`)
- `src/frontend/m-mdm/pages/dma/termMng/page.tsx` — 용어 관리 목록(`testId="term-list-limit"`)
