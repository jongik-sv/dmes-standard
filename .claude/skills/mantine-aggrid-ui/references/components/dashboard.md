# 대시보드 (DashboardGrid · DashboardRow · DashboardCell · DashboardCard · KpiTile · Sparkline · DashboardBoard)

홈·현황 화면을 12열 카드 격자로 배치하고, 높이 고정 카드·KPI 타일·작은 추이 선을 같은 모습으로 보이며, 사용자가 카드를 접고 폭·높이를 바꿔 저장하게 할 때 쓴다. 사용자가 카드를 위젯처럼 끌어 옮기고 숨기거나 다시 놓게 하려면 보드(`useDashboardBoard` + `DashboardBoard`)를 쓴다.

- import: `import { DashboardGrid, DashboardRow, DashboardCell, DashboardCard, KpiTile, KpiTileGroup, Sparkline, type DashboardCardProps, type DashboardCellProps, type DashboardGridProps, type DashboardSpan, type DashboardSpanProps, type KpiTileProps, type KpiTileGroupProps, type KpiDeltaTone, type SparklineProps, useDashboardLayout, type DashboardLayoutApi, type DashboardCardLayout, type DashboardBodySize, useDashboardRow, type DashboardRowProps, type DashboardRowState } from "@dk-oasis/shared/dashboard";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣는다)
- 보드 import: `import { useDashboardBoard, DashboardBoard, DashboardWidgetPicker, type DashboardWidget, type DashboardBoardApi, type DashboardBoardOptions, type DashboardBoardProps, type DashboardWidgetPickerProps, type DashboardWidgetPickerTrigger, type DashboardBoardDefaultRow, type DashboardBoardItem, type DashboardBoardRow, type DashboardBoardState, type DashboardDropTarget, type DashboardMoveKey } from "@dk-oasis/shared/dashboard";`
- 소스: `src/frontend/shared/src/components/dashboard/` (`DashboardGrid.tsx`·`DashboardCard.tsx`·`KpiTile.tsx`·`Sparkline.tsx`·`styles.tsx`, 보드: `DashboardBoard.tsx`·`board-state.ts`(순수 상태 함수)·`board-context.ts`)
- 내부 구현: CSS grid 12열 + 일반 `section`/`div`, 추이 선은 SVG. Mantine 을 쓰지 않는다. 색은 공통 토큰만 쓴다
- Part B 허용 목록(§1): `dashboard` SHOULD.

## 언제 쓰나

- 쓴다: 포털 홈, 공정·품질 현황 대시보드처럼 카드 여러 개를 격자로 놓는 화면.
- 쓰지 않는다: 목록 + 상세 같은 업무 화면 본문 → [ContentBody](content-body.md). 카드 안을 좌우로 나눠 크기를 조절하려면 카드(`bodyLayout="fill"`) 안에 ContentBody 를 둔다(아래 변형).
- 차트는 [charts](charts.md), 카드 안 목록은 [AgDataGrid](ag-data-grid.md) `height="auto"`, 상태 표지는 [Badge](badge.md) 를 넣는다.
- 격자 모드와 보드 모드: 카드 배치가 코드에 고정이고 사용자는 접기·폭·높이만 바꾸면 `DashboardGrid layoutKey` + `DashboardRow`(아래 "접기·크기 조절·배치 저장")를 쓴다. 사용자가 카드를 옮기고 숨기고 다시 놓아야 하면 보드(아래 "위젯 보드")를 쓴다. 한 격자 안에서 두 모드의 저장을 섞지 않는다 — 보드를 쓰면 `DashboardGrid` 에 `layoutKey` 를 주지 않는다.

## 표준 사용

```tsx
import { PageLayout } from "@dk-oasis/shared/layout";
import { DashboardCard, DashboardCell, DashboardGrid, KpiTile } from "@dk-oasis/shared/dashboard";

export default function StatusBoardPage() {
  return (
    <PageLayout title="생산 현황">
      {/* fill: PageLayout 의 남은 높이를 채우고 세로로 스크롤한다 */}
      <DashboardGrid fill ariaLabel="생산 현황">
        <DashboardCell span={2}>
          <KpiTile
            label="냉연 생산"
            value="5,860"
            unit="t"
            trend={[5.62, 5.71, 5.8, 5.86]}
            target="계획 6,000t"
            delta="전일 +1.4%"
            deltaTone="good"
            progress={97.7}
          />
        </DashboardCell>
        <DashboardCard span={8} title="월별 생산 실적" subtitle="단위 천 t">
          {/* 차트 */}
        </DashboardCard>
        <DashboardCard span={4} height={400} title="내 알림" subtitle="안읽음 4건" bodyPadding={false}>
          {/* 높이 고정 — 본문만 스크롤 */}
        </DashboardCard>
      </DashboardGrid>
    </PageLayout>
  );
}
```

## 변형

### 칸 너비와 반응형

`span`(넓은 화면), `spanMd`(화면 폭 1100px 이하), `spanSm`(480px 이하)으로 정한다. 생략하면 `span ≤ 3` 은 1100px 이하에서 두 배(2→4, 3→6), 나머지는 12(세로 쌓기)이고, 480px 이하에서 `span ≤ 2` 는 6, 나머지는 12다. 카드가 아닌 칸(인사말 줄·띠·KPI 타일)은 `DashboardCell` 로 놓는다.

### 높이 고정 카드

`height={400}` 이면 카드 높이가 고정되고 본문만 스크롤한다. 고른 항목의 내용 길이에 따라 격자 배치가 움직이면 안 되는 카드(공지 뷰어·알림 목록)에 쓴다. `toolbar` 는 머리 아래 고정 줄(필터 등)로, 본문과 함께 스크롤하지 않는다.

### 카드 안 좌우 분할(크기 조절)

`bodyLayout="fill"` 은 본문을 세로 flex 로 두고 스크롤하지 않는다. 안에 `ContentBody resizable` 을 두면 경계를 끌어 크기를 조절한다. ContentBody 의 배치 규칙은 `.page-layout` 아래에만 있으므로 **화면 루트가 `PageLayout` 이어야 한다**. 패널 안 스크롤은 패널의 자식이 맡는다(`flex: 1; min-height: 0; overflow: auto`).

```tsx
<DashboardCard span={8} height={400} title="공지사항" bodyLayout="fill" bodyPadding>
  <ContentBody resizable storageKey="mcm.home.notice">
    <ContentPanel key="list" flex={5}>{/* 목록(자체 스크롤) */}</ContentPanel>
    <ContentPanel key="viewer" flex={7}>{/* 본문(자체 스크롤) */}</ContentPanel>
  </ContentBody>
</DashboardCard>
```

### 접기·크기 조절·배치 저장

`DashboardGrid layoutKey="mcm.home.layout"` 아래에서 카드를 `DashboardRow rowId` 로 줄 단위로 묶고, 카드에 `cardId` 와 `collapsible`·`resizable` 을 준다.
- 접기는 **행 단위**다: 행 안 어느 카드의 화살표 버튼(`aria-expanded`·`aria-controls`, 키보드 Enter·Space, 이름 "이 줄 접기")을 눌러도 그 행의 카드가 모두(접기 버튼이 없는 카드 포함) 머리만 남고, 행 높이가 머리 높이가 되어 아래 행이 바로 올라온다. 고정 높이도 풀린다. 본문은 언마운트하지 않고 숨긴다(목록 선택·분할 크기 유지).
- 행은 격자 한 줄 전체를 차지하는 12열 하위 격자다. 카드 칸 수는 행 폭 기준이고, 폭 조절로 행 안에서 줄바꿈이 생겨도 그 행 묶음은 함께 접힌다. 카드 머리가 없는 행(KPI 칸 등)은 `collapsible={false}` 로 뺀다.
- 행 밖(격자 바로 아래)에 둔 카드와 `collapsible={false}` 행 안의 카드는 카드 하나만 접는다.
- 폭: 오른쪽 가장자리 가운데 손잡이를 끌면 넓은 화면 칸 수가 격자 칸 단위로 바뀐다(최소 `minSpan`, 기본 3). 1100px 이하에서는 폭 손잡이를 숨기고 선언한 `span` 규칙으로 세로 쌓는다.
- 높이: 아래 가장자리 가운데 손잡이를 끌면 카드 높이가 바뀐다(최소 `minHeight`, 기본 120). 높이를 정하면 본문이 스크롤한다.
- 손잡이는 `role="separator"`·Tab 포커스, 방향키(폭 ±1칸, 높이 ±20px), 두 번 누르면 그 치수만 기본값으로 돌아간다. hover 때 짧은 grip 과 `col-resize`/`row-resize` 커서만 보인다.
- 저장: `layoutKey` 가 있으면 사용자별로 브라우저(`localStorage`, `dmes:dash:v2:{userId}:{layoutKey}`, 행 접힘은 `row:{rowId}` 항목)에 남는다. 형식이 달랐던 v1 저장값은 읽지 않는다. 없으면 화면을 닫을 때까지만 유지된다. 그리드 밖 단독 카드는 카드 안 상태로 동작한다.
- 초기화: 그리드 **안쪽** 컴포넌트에서 `useDashboardLayout()` 의 `reset()`·`customized` 를 쓴다(페이지 본문에서 부르면 Provider 밖이라 null).

```tsx
function ResetLayoutButton() {
  const layout = useDashboardLayout();
  if (!layout) return null;
  return <Button size="mini" onClick={layout.reset} disabled={!layout.customized}>배치 초기화</Button>;
}

<DashboardGrid fill layoutKey="mcm.home.layout">
  <DashboardCell><ResetLayoutButton /></DashboardCell>
  <DashboardRow rowId="charts">
    <DashboardCard cardId="monthly" collapsible resizable span={8} title="월별 생산 실적">
      {({ height }) => <StackedColumnChart height={height != null ? height - 26 : 230} … />}
    </DashboardCard>
    <DashboardCard cardId="equipment" collapsible resizable span={4} title="설비 가동 상태">{/* … */}</DashboardCard>
  </DashboardRow>
</DashboardGrid>
```

### 위젯 보드 — 끌어 옮기기·숨기기·추가(배치 편집)

화면은 **위젯 목록**(`DashboardWidget`: id·제목·설명·기본 크기·최소 크기·그리는 함수)과 **기본 배치**(행 배열)만 선언한다. 배치 상태·편집·저장은 `useDashboardBoard` 가 맡고, `DashboardBoard` 가 행과 위젯을 그린다.

- 카드는 늘 어떤 행에 속하고 접기는 행 단위다(행 안 어느 카드의 접기 버튼이든 그 행 전체). 행 접기는 편집 모드와 상관없이 동작한다.
- 편집 모드(`board.editing`)에서만 끌기 손잡이(머리 왼쪽 점 6개)·크기 조절 손잡이·숨기기 버튼이 보이고 카드 테두리가 점선이 된다. 행 사이에 "새 행" 놓기 자리(12px)가 생긴다.
- 끌기: 카드 머리(머리 안 버튼·입력 제외) 또는 끌기 손잡이를 끈다. ① 같은 행 안 순서 변경 ② 다른 행으로 이동 ③ 행 사이·맨 위·맨 아래 자리에 놓으면 새 행. 놓일 자리는 파란 선(카드 사이) 또는 새 행 자리 강조로 보이고, 빈 행은 자동으로 없앤다. Escape 로 취소한다. 스크롤 영역 위·아래 가장자리에서는 자동으로 스크롤한다. 1100px 이하(세로 쌓기)에서도 같은 방식으로 행·카드 순서를 바꾼다(폭 손잡이는 숨김).
- 키보드: 편집 모드에서 끌기 손잡이에 초점을 두고 ←→(같은 행 앞뒤) ↑(위 행 끝) ↓(아래 행 앞) Shift+↑↓(바로 위·아래 새 행). 맨 위·아래 행에서 ↑↓ 는 같은 행에 다른 위젯이 있으면 새 행으로 떼어 낸다. 옮긴 뒤 초점은 옮긴 카드의 손잡이로 돌아오고, 결과는 `role="status"` 로 읽어 준다.
- 숨기기·추가: 숨긴 위젯은 `DashboardWidgetPicker` 목록(이름·설명)에 나오고, 고르면 마지막 행 끝(칸 합이 12를 넘으면 새 행)에 다시 놓인다. 붙인 행이 접혀 있으면 펼친다. 기본 배치에 없는 위젯은 처음부터 숨김이다(추가 목록에만 나옴).
- 크기: 위젯 정의의 `span`·`height` 가 기본값이고, 편집 모드에서 손잡이로 바꾼 값은 편집을 마친 뒤에도 유지된다. 카드에는 `cardId`·`span`·`height`·`collapsible`·`resizable` 을 주지 않는다(위젯 정의가 정본).
- 저장: `layoutKey` 가 있으면 사용자별 `localStorage` `dmes:dash:v3:{userId}:{layoutKey}` 에 행 순서·행별 위젯 순서·폭·높이·접힘·숨김을 남긴다. 읽을 때 검증하고 v2(격자 모드) 값은 읽지 않는다. 코드에 새 위젯이 생기면 기본 배치의 같은 행(없으면 마지막 행 끝·새 행)에 붙이고, 사라진 위젯 ID 는 버린다. 기본 배치와 같아지면 저장값을 지운다.
- `board.reset()` 은 편집 모드 여부와 상관없이 기본 배치로 되돌린다. `board.reveal(id)` 는 숨긴 위젯을 다시 놓고 행을 펼친 뒤 그 자리로 스크롤한다(긴급 공지 [내용 보기] 등).
- 다른 행으로 옮긴 카드는 다시 마운트된다. 카드 안 선택·입력 같은 상태는 화면(페이지) 상태나 `storageKey` 로 둔다.

```tsx
import { Button } from "@dk-oasis/shared/form";
import { PageLayout } from "@dk-oasis/shared/layout";
import {
  DashboardBoard,
  DashboardCard,
  DashboardCell,
  DashboardGrid,
  DashboardWidgetPicker,
  useDashboardBoard,
  type DashboardBoardDefaultRow,
  type DashboardWidget,
} from "@dk-oasis/shared/dashboard";

const DEFAULT_ROWS: DashboardBoardDefaultRow[] = [
  { id: "top", widgets: ["monthly", "alarms"] },
  { id: "bottom", widgets: ["shipments"] },
];

export default function StatusBoardPage() {
  // 위젯 목록은 렌더마다 새로 만들어도 된다(그리는 함수가 화면 상태를 잡아도 늘 최신 값으로 그린다).
  const widgets: DashboardWidget[] = [
    { id: "monthly", title: "월별 생산 실적", description: "제품군별 월 실적", span: 8, render: () => <DashboardCard title="월별 생산 실적">{/* 차트 */}</DashboardCard> },
    { id: "alarms", title: "설비 알람", description: "최근 24시간", span: 4, height: 360, render: () => <DashboardCard title="설비 알람">{/* 목록 */}</DashboardCard> },
    { id: "shipments", title: "출하 예정", span: 12, render: () => <DashboardCard title="출하 예정">{/* 그리드 */}</DashboardCard> },
  ];
  const board = useDashboardBoard({ widgets, defaultRows: DEFAULT_ROWS, layoutKey: "mqc.status.board" });
  return (
    <PageLayout title="생산 현황">
      <DashboardGrid fill ariaLabel="생산 현황">
        <DashboardCell>
          {board.editing && (
            <DashboardWidgetPicker
              board={board}
              renderTrigger={(t) => (
                <Button size="mini" onClick={t.onClick} aria-haspopup={t["aria-haspopup"]} aria-expanded={t["aria-expanded"]} aria-controls={t["aria-controls"]}>
                  위젯 추가
                </Button>
              )}
            />
          )}
          <Button size="mini" onClick={() => board.setEditing(!board.editing)}>{board.editing ? "완료" : "배치 편집"}</Button>
          <Button size="mini" onClick={board.reset} disabled={!board.customized}>배치 초기화</Button>
        </DashboardCell>
        <DashboardBoard board={board} />
      </DashboardGrid>
    </PageLayout>
  );
}
```

### KPI 타일 묶음

KPI 여러 개를 위젯 하나로 옮기고 숨기려면 카드 안에 `KpiTileGroup` 으로 묶는다. 타일 칸은 `repeat(auto-fit, minmax(최소 폭, 1fr))` 이라, 위젯 전체 폭(12칸)에서는 기본 최소 폭(`minTileWidth`, 150px)으로 6개가 한 줄에 놓이고 사용자가 위젯을 좁힐 때만 줄바꿈된다. 타일 폭이 210px 이하이면(컨테이너 질의) 추이 선을 값 아래로 내리고 기준·증감을 두 줄로 놓는다.

```tsx
<DashboardCard title="주요 지표" subtitle="전일 기준">
  <KpiTileGroup ariaLabel="주요 지표">
    <KpiTile label="냉연 생산" value="5,860" unit="t" />
    <KpiTile label="출하" value="4,120" unit="t" />
  </KpiTileGroup>
</DashboardCard>
```

### 본문 크기에 맞춰 차트 다시 그리기

`children` 에 함수를 주면 본문 크기 `{ width, height }`(여백 제외)를 받는다. `height` 는 카드 높이가 정해졌을 때(`height` prop·사용자 조절)만 숫자이고, 내용 높이를 따르는 카드에서는 `null` 이다 — 그때는 차트 기본 크기를 쓴다. `StackedColumnChart` 는 폭을 스스로 재므로 높이만 넘긴다. 크기 props 가 고정인 기존 차트(`DonutChart`·`HBarChart`·`StackedBarChart`)는 기본 크기로 두고 본문 가운데에 놓는다(포털 홈의 `mcm-home-chart-center`). 재기 전·접힌 동안 `width` 는 0 이다.

### Sparkline 단독

`<Sparkline values={[…]} color="var(--color-warning)" ariaLabel="7일 추이" />`. `ariaLabel` 이 없으면 장식으로 숨긴다.

## Props

DashboardGridProps

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| children | `ReactNode` | 필수 | `DashboardCard`·`DashboardCell` |
| fill | `boolean` | `false` | 부모의 남은 높이를 채우고 세로 스크롤, 좌우·아래 여백 10px. 스크롤은 바깥 감싸개(`cm-dash-scroll`)가 맡고 격자는 내용 높이를 갖는다 |
| layoutKey | `string` | - | 카드 배치(접힘·칸 수·높이) 저장 키(화면별 고유, 예 `"mcm.home.layout"`). 사용자별로 브라우저에 저장 |
| ariaLabel | `string` | - | 뿌리 aria-label |
| className · testId | `string` | - | 뿌리 클래스 · `data-testid` |

DashboardRowProps

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| rowId | `string` | 필수 | 행 ID(그리드 안에서 고유). 접힘 저장 키 `row:{rowId}` |
| collapsible | `boolean` | `true` | 행 접기 사용. `false` 면 안 카드는 카드 하나씩 접힌다 |
| children | `ReactNode` | 필수 | 카드·칸 |
| ariaLabel · className · testId | `string` | - | 뿌리(`role="group"`) aria-label · 클래스 · `data-testid` |

`useDashboardRow()`: 카드가 들어 있는 행의 `DashboardRowState`(`rowId`, `collapsed`, `collapsible`, `toggle()`)를 돌려준다. 행 밖이면 `null`.

DashboardCellProps: `children`(필수), `span`·`spanMd`·`spanSm`(`DashboardSpan` = 1~12), `className`, `testId`.

DashboardCardProps

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| title | `ReactNode` | 필수 | 카드 제목(머리 32px, 13px 700) |
| subtitle | `ReactNode` | - | 제목 옆 흐린 부제 |
| titleExtra | `ReactNode` | - | 부제 뒤 표지(배지 등) |
| actions | `ReactNode` | - | 머리 오른쪽 동작 |
| toolbar | `ReactNode` | - | 머리 아래 고정 줄 |
| span · spanMd · spanSm | `DashboardSpan` | 12 · 규칙 · 규칙 | 칸 너비 |
| height | `number` | - | 카드 높이(px). 주면 본문만 스크롤 |
| bodyLayout | `"flow" \| "fill"` | `"flow"` | fill 은 세로 flex·스크롤 없음 |
| bodyPadding | `boolean` | flow `true`(10px) · fill `false` | fill 에서 `true` 면 위쪽 8px 만 |
| cardId | `string` | - | 배치 저장용 ID(그리드 안에서 고유) |
| collapsible | `boolean` | `false` | 접기·펼치기 버튼 |
| resizable | `boolean \| "width" \| "height"` | `false` | 크기 조절 손잡이(true 는 폭·높이) |
| minSpan | `number` | `3` | 폭 조절 최소 칸 수 |
| minHeight | `number` | `120` | 높이 조절 최소값(px) |
| children | `ReactNode \| (size: DashboardBodySize) => ReactNode` | - | 함수면 본문 크기 `{ width, height \| null }` 를 받는다 |
| ariaLabel | `string` | title 이 문자열이면 그 값 | 뿌리 aria-label |
| className · testId | `string` | - | 뿌리 클래스 · `data-testid` |

KpiTileProps

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| label | `ReactNode` | 필수 | 지표 이름 |
| value | `ReactNode` | 필수 | 값(형식은 화면이 정함, 예 `"5,860"`) |
| unit | `ReactNode` | - | 단위 |
| trend | `number[]` | - | 추이 선 값(2개 이상일 때 그림) |
| target | `ReactNode` | - | 기준 문구(예 `"계획 6,000t"`) |
| delta | `ReactNode` | - | 증감 문구(예 `"전일 +1.4%"`) |
| deltaTone | `KpiDeltaTone` (`"good" \| "bad" \| "neutral"`) | `"neutral"` | 초록 · 빨강 · 흐림 |
| progress | `number` | - | 기준 대비 %(0~100 으로 자름). 없으면 막대 없음 |
| warn | `boolean` | `false` | 주의 배지 + 경고색 막대·추이 선 |
| warnLabel | `string` | `"주의"` | 주의 배지 문구 |
| className · testId | `string` | - | 뿌리 클래스 · `data-testid` |

`useDashboardLayout()`: 그리드 안에서 `DashboardLayoutApi`(`get(cardId)`, `update(cardId, patch, persist?)`, `commit()`, `reset()`, `customized`)를 돌려준다. 그리드 밖이면 `null`. `DashboardCardLayout` 은 `{ collapsed?, span?, height? }` 다.

SparklineProps: `values: number[]`(필수), `width`(84), `height`(26), `color`(`var(--color-primary)`), `area`(true, 선 아래 옅은 채움), `ariaLabel`, `testId`.

KpiTileGroupProps: `children`(필수, `KpiTile` 들), `minTileWidth`(150, px — 타일 최소 폭), `ariaLabel`(주면 `role="group"`), `testId`.

DashboardWidget(위젯 정의)

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| id | `string` | 필수 | 위젯 ID(보드 안 고유, 저장 키). 바꾸면 그 위젯의 사용자 저장 자리가 사라진다 |
| title | `string` | 필수 | 위젯 이름 — 추가 목록·손잡이 이름("{title} 옮기기")·안내 문구. 카드 제목과 같게 둔다 |
| description | `string` | - | 추가 목록의 짧은 설명 |
| span · spanMd · spanSm | `DashboardSpan` | 12 · 규칙 · 규칙 | 기본 칸 수 |
| height | `number` | - | 기본 카드 높이(px). 없으면 내용 높이 |
| minSpan · minHeight | `number` | 3 · 120 | 크기 조절 최소값 |
| resizable | `boolean \| "width" \| "height"` | `true` | 편집 모드 크기 조절 손잡이 |
| hideable | `boolean` | `true` | 숨기기 버튼 |
| render | `() => ReactNode` | 필수 | `DashboardCard` 하나를 돌려준다 |

DashboardBoardOptions(`useDashboardBoard` 인자): `widgets`(필수, `readonly DashboardWidget[]`), `defaultRows`(필수, `readonly DashboardBoardDefaultRow[]` = `{ id, widgets: string[] }[]`), `layoutKey`(저장 키, 없으면 저장하지 않음).

DashboardBoardApi(`useDashboardBoard` 반환)

| 필드 | 설명 |
|---|---|
| `state` | `DashboardBoardState` = `{ rows: DashboardBoardRow[]; hidden: string[] }`, 행 = `{ id, collapsed?, items: DashboardBoardItem[] }`, 항목 = `{ id, span?, height? }` |
| `widgets` · `hiddenWidgets` | 위젯 목록 · 숨긴 위젯(선언 순서) |
| `editing` · `setEditing(v)` | 편집 모드 |
| `customized` | 기본 배치와 다른지([배치 초기화] 활성화) |
| `move(id, target)` | `DashboardDropTarget` = `{ kind: "row", rowId, index }`(끄는 위젯을 뺀 뒤의 자리) \| `{ kind: "newRow", rowIndex }` |
| `moveByKey(id, key)` | `DashboardMoveKey` = `"left" \| "right" \| "up" \| "down" \| "newRowAbove" \| "newRowBelow"` |
| `hide(id)` · `add(id)` · `reveal(id)` | 숨기기 · 다시 놓기(마지막 행 끝, 모자라면 새 행) · 보이게 하기(숨김 해제·행 펼침·스크롤) |
| `setRowCollapsed(rowId, collapsed)` · `reset()` | 행 접힘 · 기본 배치로 |
| `layoutApi` · `signal` | 내부용(보드 안 행·카드가 쓰는 `DashboardLayoutApi` 어댑터, 초점·안내 알림) |

DashboardBoardProps: `board`(필수), `emptyText`(놓인 위젯이 없을 때 안내), `keyboardHint`(끌기 손잡이 `aria-describedby` 안내 문구).

DashboardWidgetPickerProps: `board`(필수), `renderTrigger`(필수, `(t: DashboardWidgetPickerTrigger) => ReactNode` — `t` 는 `open`·`count`(숨긴 위젯 수)·`onClick`·`aria-haspopup`·`aria-expanded`·`aria-controls`. 화면이 shared `Button` 으로 그리고 그대로 넘긴다), `title`("위젯 추가"), `emptyText`("숨긴 위젯이 없습니다."), `testId`(목록). 목록은 바깥을 누르거나 Escape 로 닫고(초점은 여는 버튼으로), ↑↓ 로 항목을 옮긴다.

## 표준값: 모든 화면 동일

- 카드 간격 8px, 카드 반경 4px, 머리는 패널 머리 표준(32px, `--color-bg-header`)이다. 화면에서 카드 모습을 CSS 로 덮지 않는다.
- 주의·상태는 배지와 색으로만 보인다. 카드·타일 한 변에 컬러 바를 붙이지 않는다(Local-Rules §8).
- 샘플 숫자로 그리는 동안은 화면에 "샘플 데이터" 표지([Badge](badge.md) `tone="warning"`)를 둔다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `fill` 격자를 `PageLayout` 밖 아무 div 에 둔다 | 부모가 세로 flex 여야 높이를 채운다. PageLayout 안에 둔다 |
| 격자(`cm-dash-grid`)에 직접 고정 높이·스크롤을 준다 | 자동 행이 줄어 `overflow: hidden` 카드가 머리 높이(약 76px)로 눌린다. 스크롤은 `fill` 의 감싸개에 맡긴다 |
| `bodyLayout="fill"` 카드 안 ContentBody 가 높이 0 으로 보인다 | 화면 루트가 PageLayout 인지, 카드에 `height` 를 줬는지 확인한다 |
| 높이 고정 카드의 본문 길이로 다른 카드가 밀린다고 `min-height` 를 덧댄다 | `height` 를 준다. 본문만 스크롤한다 |
| 본문에 `hidden` 만 주고 접혔다고 여긴다 | 작성자 `display: flex` 가 `[hidden]` 을 이긴다. 카드가 `[hidden] { display: none !important }` 를 넣어 두었으니 본문을 직접 숨기지 말고 `collapsible` 을 쓴다 |
| 카드를 격자 바로 아래에 두고 접었는데 아래 카드가 올라오지 않는다 | CSS grid 는 줄 단위로 배치해 같은 줄에 펼친 카드가 있으면 줄 높이가 그대로다. 같은 줄 카드를 `DashboardRow` 로 묶는다 — 행 접기는 줄 전체를 접는다 |
| 내용 높이 카드에서 함수 children 의 `height` 로 차트 높이를 정한다 | `height` 는 `null` 이다(되먹이면 순환). 카드에 `height` 를 주거나 사용자가 조절했을 때만 숫자다 |
| `useDashboardLayout()` 을 페이지 본문(그리드 밖)에서 부른다 | Provider 밖이라 `null` 이다. 그리드 안 칸에 둔 작은 컴포넌트에서 부른다 |
| dashboard 소스에 `@tabler/icons-react` 를 import 한다 | 아이콘 선언 파일이 커서 shared `.d.ts` 빌드가 기본 힙(4GB)을 넘었다(2026-10-02). 작은 인라인 SVG 를 쓴다 |
| KPI 값을 숫자로 넘겨 천 단위 구분이 빠진다 | 화면이 `toLocaleString` 으로 형식을 정해 문자열로 넘긴다 |
| 보드를 쓰면서 `DashboardGrid` 에도 `layoutKey` 를 준다 | 저장이 v2(격자)·v3(보드) 두 갈래가 된다. 보드는 `useDashboardBoard({ layoutKey })` 하나로 저장한다 |
| 보드 위젯 카드에 `cardId`·`span`·`height`·`collapsible`·`resizable` 을 준다 | 위젯 정의(`DashboardWidget`)가 정본이다. 카드에서 빼고 정의에 둔다 |
| 위젯 목록을 `useMemo([])` 로 한 번만 만든다 | 그리는 함수가 첫 렌더의 화면 상태를 붙잡는다. 렌더마다 만들어 넘긴다(보드는 ID 목록으로만 상태를 맞춘다) |
| 위젯 추가 버튼을 dashboard 안에서 Mantine `Button` 으로 그리려 한다 | dashboard entry 에 Mantine 을 들이지 않는다(`.d.ts` 힙). `DashboardWidgetPicker renderTrigger` 로 화면이 shared `Button` 을 넘긴다 |
| 숨긴 공지 위젯을 띠 버튼이 행 ID 로 펼치려 한다 | 행 ID 는 사용자가 옮기면 바뀐다. `board.reveal(widgetId)` 를 쓴다 |
| KPI 타일을 `minTileWidth` 를 크게(200px 이상) 줘 6개가 두 줄로 쌓인다 | 기본값(150)을 쓴다. 좁은 타일은 추이 선이 값 아래로 내려가 그대로 읽힌다 |
| 카드 안 상태(선택·입력)를 카드 컴포넌트 안에만 둔다 | 다른 행으로 옮기면 카드가 다시 마운트된다. 화면 상태나 `storageKey` 로 둔다 |
| 끌기 손잡이에 Enter 로 "잡기" 를 기대한다 | 손잡이에 초점을 두고 방향키를 바로 누른다(Shift+↑↓ 는 새 행) |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/home/page.tsx`: 포털 홈 — 위젯 11개(`DashboardWidget` 목록: 공지사항·내 알림·주요 지표·월별·설비·공정·불량·작업지시·알람·출하·바로가기)와 `useDashboardBoard({ layoutKey: "mcm.home.layout" })`, `DashboardGrid fill`(layoutKey 없음) 안 `DashboardBoard`. 긴급 공지 띠는 위젯이 아니라 `DashboardCell` 이고, [내용 보기]는 `board.reveal("notice")`.
- `src/frontend/m-mcm/page-components/home/home-widgets.tsx`: 기본 배치 `HOME_DEFAULT_ROWS` 와 샘플 위젯 카드(주요 지표 = `KpiTileGroup` 안 `KpiTile` 6개, 월별 차트는 함수 children 으로 본문 높이를 받음 — `chart-sizing.ts`).
- `src/frontend/m-mcm/page-components/home/LayoutControls.tsx`: 인사말 줄 [위젯 추가](`DashboardWidgetPicker`, 편집 모드에서만) · [배치 편집]/[완료] · [배치 초기화].
- `src/frontend/m-mcm/page-components/home/NoticeCard.tsx`: 위젯 높이 400 + `bodyLayout="fill"` 안의 `ContentBody resizable storageKey="mcm.home.notice"`.
- `src/frontend/m-mcm/page-components/home/NotificationCard.tsx`: 위젯 높이 400 + `toolbar`(필터) + `bodyPadding={false}`.
