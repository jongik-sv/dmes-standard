# GridExcelFoot

표(그리드) 바로 아래에 왼쪽 행 수 안내와 오른쪽 [엑셀] 단추를 한 줄로 붙이고, 그 줄을 표 영역 바닥에 고정할 때 쓴다. 단추를 누르면 `onExcel` 만 부르므로 파일 만들기는 화면이 한다.

- import: `import { GridExcelFoot, type GridExcelFootProps } from "@dk-oasis/shared/grid";` (CSS import 없음)
- 소스: `src/frontend/shared/src/components/grid/GridExcelFoot.tsx`
- 내부 구현: 일반 `div`·`span` + shared `Button`(`size="mini"`) + `@tabler/icons-react` 의 `IconDownload`. 스타일은 컴포넌트가 `<style href="cm-grid-foot">` 로 직접 넣는다(`grid.css` 아님 — 포털이 원격 모듈의 CSS 파일을 싣지 않는다, Part B §18-3). 색·간격은 공통 토큰만 쓴다
- Part B §18(새 공통 컴포넌트 등록)로 등록했다. `grid` 서브패스가 이미 있어 진입점·exports 추가는 없다

## 언제 쓰나

- 쓴다: 카드·위젯 안의 작은 목록처럼 PageLayout 상단 버튼 막대가 없는 자리에서, 표 아래에 「N건」과 엑셀 내려받기를 함께 둘 때. 보이는 행 그대로를 내려받는 화면에 맞다.
- 쓰지 않는다: 화면 전체 목록의 엑셀 버튼 → PageLayout 상단 「엑셀」 버튼(`action: "export"`)과 [exportToExcel](export-to-excel.md). 이 컴포넌트는 파일을 만들지 않고 단추 줄만 그린다.
- 쓰지 않는다: 서버 페이징 막대 → [Pagination](pagination.md)(페이지 이동·총 건수). 패널 머리의 건수·버튼 → [GridPanel](grid-panel.md)(`count`·`buttons`).
- 엑셀 파일 내용(컬럼·파일 이름)은 `onExcel` 안에서 [exportToExcel](export-to-excel.md) 로 만든다.

## 표준 사용

표를 남은 높이만큼 채우고(`AgDataGrid height="100%"`) 이 줄을 바닥에 두려면, 세로 flex 감싸개 안에 표 칸(`flex: 1 1 0; min-height: 0`)과 이 줄을 순서대로 둔다. 이 줄은 `flex: none` 이라 높이를 키우지 않는다. 감싸개의 높이가 정해져 있어야 한다(위젯 본문처럼 부모가 높이를 주는 자리).

```tsx
import { useCallback } from "react";
import { AgDataGrid, GridExcelFoot, type GridColumn } from "@dk-oasis/shared/grid";
import { exportToExcel, today } from "@dk-oasis/shared/utils";

const COLUMNS: GridColumn[] = [
  { key: "woNo", header: "작업지시번호", width: 130 },
  { key: "qty", header: "수량(t)", width: 80, align: "right", type: "number" },
];

// 감싸개 스타일(화면 CSS 문자열 한 곳에 둔다): 배치 규칙만 있고 색은 없다.
//   .fill { display: flex; flex-direction: column; height: 100%; min-height: 0; }
//   .fill__grow { flex: 1 1 0; min-height: 0; }

export function OrderTable({ rows }: { rows: Record<string, unknown>[] }) {
  const handleExcel = useCallback(() => {
    if (rows.length === 0) return;
    void exportToExcel(rows, `작업지시_${today()}.xlsx`, "Sheet1", COLUMNS.map((c) => ({ key: c.key, header: c.header ?? c.key })));
  }, [rows]);

  return (
    <div className="fill">
      <div className="fill__grow">
        <AgDataGrid rowKey="woNo" columns={COLUMNS} data={rows} columnSizing="fit" height="100%" />
      </div>
      <GridExcelFoot
        note={`${rows.length.toLocaleString()}건`}
        onExcel={handleExcel}
        disabled={rows.length === 0}
      />
    </div>
  );
}
```

## 변형

### 안내 글과 단추 data-testid

`note` 는 문자열이다. 길면 말줄임(`…`)으로 줄어들고 단추는 밀리지 않는다. 단추의 `data-testid` 기본값은 `wq-excel` 이고 `testId` 로 바꾼다. 줄 전체는 `grid-foot`, 안내 글은 `grid-foot-note` 로 고정이다.

```tsx
<GridExcelFoot note="상위 500행만 표시합니다" onExcel={handleExcel} testId="order-excel" />
```

### 내려받을 행이 없을 때

`disabled` 를 주면 단추가 비활성이 된다. 0건이면 줄 자체를 그리지 않고 빈 상태 안내만 보여 주는 화면도 있다(쿼리 표).

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| note | `string` | 필수 | 왼쪽 안내 글(「3행」「N건」). 길면 말줄임 |
| onExcel | `() => void` | 필수 | [엑셀] 을 눌렀을 때. 파일 만들기는 호출한 쪽이 한다 |
| disabled | `boolean` | `false` | 단추 비활성(내려받을 행 없음) |
| testId | `string` | `"wq-excel"` | [엑셀] 단추의 `data-testid` |

## 표준값: 모든 화면 동일

- 단추는 `size="mini"` 의 기본(회색) 버튼에 아이콘과 「엑셀」, `title` 은 「보이는 행을 엑셀로 내려받기」로 고정이다. props 로 바꿀 수 없다.
- 줄 모양은 높이 자동(위아래 2px), 윗 테두리 1px(`--color-border-light`), 글자는 `--font-size-xs`·`--color-text-muted` 이다.
- 엑셀 파일 이름은 「{제목}_{yyyyMMdd}.xlsx」, 시트 이름은 `Sheet1`, 보이는 행·컬럼 그대로 내려받는다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 표를 `height="auto"` 로 두고 이 줄을 바로 뒤에 둬서 줄이 위젯 가운데에 뜬다 | 세로 flex 감싸개 + 표 칸 `flex: 1 1 0` + `AgDataGrid height="100%"`, 이 줄은 감싸개의 마지막 자식 |
| 감싸개에 높이가 없는데 `height="100%"` 를 쓴다 | 부모가 높이를 정하는 자리(위젯·패널 본문)에서만 쓴다 |
| 표 칸에 `min-height: 0` 이 없어 최소 크기에서 이 줄이 밀려 나간다 | `.grow { flex: 1 1 0; min-height: 0; }` |
| 이 컴포넌트가 파일을 만들 거라 기대한다 | `onExcel` 안에서 `exportToExcel` 을 부른다 |
| 이 줄의 색·여백을 화면 CSS 로 바꾼다 | 바꾸지 않는다. 모양을 바꾸려면 shared 를 고친다(사용자 승인 필요) |

## 실제 사용 예

- `src/frontend/m-mcm/widget-types/query-table/renderer.tsx`: 쿼리 표 위젯. `.wq-fill`/`.wq-fill__grow` 감싸개 + `AgDataGrid height="100%"` + 이 줄(행 수·잘림 안내).
- `src/frontend/m-mcm/widgets/home/workOrders/widget.tsx`, `src/frontend/m-mcm/widgets/home/shipments/widget.tsx`: 홈 기본 표 위젯. `widgets/home/_shared/grid-fill.tsx` 의 `HomeGridFill`(감싸개 + 스타일)에 표와 이 줄을 넣는다. 제목이 없을 때 파일 이름은 각각 「작업지시」「출하」.
