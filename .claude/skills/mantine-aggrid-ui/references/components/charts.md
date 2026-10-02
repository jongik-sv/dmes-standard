# 차트 (DonutChart · PieChart · HBarChart · LineChart · StackedBarChart · StackedColumnChart)

현황 대시보드에서 비율(도넛·파이), 항목별 크기(가로 막대), 추이(선), 구성 비율(누적 막대), 기간별 누적 실적과 계획선(세로 누적 막대)을 간단한 SVG 차트로 보일 때 쓴다.

- import: `import { DonutChart, PieChart, HBarChart, LineChart, StackedBarChart, StackedColumnChart } from "@dk-oasis/shared/charts";` (CSS 없음)
- 소스: `src/frontend/shared/src/components/charts/` (서브패스 export 이름은 `index.ts` 와 shared `package.json` 의 `./charts` 로 확인했다)
- 내부 구현: 직접 그린 SVG 와 인라인 스타일. 차트 라이브러리를 쓰지 않는다
- **ASK 대상이다.** Part B 허용 목록(§1)에 `charts` 서브패스가 없다. 새 화면에서 쓰기 전에 사용자에게 확인한다. 이 문서는 확인을 받은 뒤 쓰는 방법이다.

## 언제 쓰나

- 쓴다: 사용자가 대시보드·현황 화면에 차트를 요청했고 ASK 확인을 받은 경우.
- 쓰지 않는다: 숫자를 정확히 읽어야 하는 목록 → [AgDataGrid](ag-data-grid.md). 시나리오 x 지표 비교표 → [matrix-table](matrix-table.md).
- 축 눈금·범례 클릭·확대 같은 상호작용이 필요한 차트는 지원하지 않는다(호버 툴팁만 있다).

## 표준 사용

```tsx
import { DonutChart, type DonutSlice } from "@dk-oasis/shared/charts";

const STATUS: DonutSlice[] = [
  { label: "완료", value: 84, color: "var(--color-success)" },
  { label: "진행", value: 31, color: "var(--color-primary)" },
  { label: "지연", value: 7, color: "var(--color-danger)" },
];

export function StatusDonut() {
  return <DonutChart data={STATUS} centerLabel="전체" centerValue="122" />;
}
```

색은 데이터마다 필수이며 의미 토큰(`var(--color-…)`)으로 준다. 16진수·rgb 를 주지 않는다. `data` 는 모듈 상수나 `useMemo` 로 둔다.

## 변형

### 가로 막대·파이·선·누적 막대

```tsx
import { HBarChart, LineChart, StackedBarChart, type BarData, type LineDataPoint, type StackedBarRow, type StackedBarSegment } from "@dk-oasis/shared/charts";

const BARS: BarData[] = [{ label: "SLITTING-01", value: 94, color: "var(--color-primary)" }];
const POINTS: LineDataPoint[] = [{ label: "10/01", value: 120 }, { label: "10/02", value: 135 }];
const SEGMENTS: StackedBarSegment[] = [
  { key: "done", label: "실적", color: "var(--color-success)" },
  { key: "remain", label: "잔여", color: "var(--color-warning)" },
];
const ROWS: StackedBarRow[] = [{ label: "1호", values: { done: 70, remain: 30 } }];

// <HBarChart data={BARS} />
// <LineChart data={POINTS} yLabel="생산량" avgLabel="평균" color="var(--color-primary)" avgColor="var(--color-success)" />
// <StackedBarChart rows={ROWS} segments={SEGMENTS} />
// <PieChart data={[{ label: "A", value: 3, color: "var(--color-primary)" }]} />
```

`LineChart` 는 부모 크기를 재서 폭을 맞춘다. 높이를 부모에 맞추려면 `height="100%"` 로 준다.

### 세로 누적 막대 + 계획선 (StackedColumnChart)

월·주 같은 항목마다 여러 계열(제품군 등)을 위로 쌓고, 계획 합계를 점선으로 겹친다. `dimFrom` 부터의 막대는 옅게(전망 구간), `totalAt` 막대 위에는 합계를 적는다. 폭은 부모의 실제 픽셀 폭(ResizeObserver)으로 다시 계산해 글자는 10px 로 고정되고 막대·간격만 늘어난다. 높이는 `height`(px)로 정한다 — 카드 본문 높이를 채우려면 본문 높이에서 범례 줄(약 26px)을 뺀 값을 넘긴다. 계열 색은 `--color-chart-1` … `--color-chart-5` 를 순서대로 쓴다.

```tsx
import { StackedColumnChart, type StackedColumnSeries } from "@dk-oasis/shared/charts";

const SERIES: StackedColumnSeries[] = [
  { key: "cold", label: "냉연", color: "var(--color-chart-1)", values: [112, 101, 118] },
  { key: "coated", label: "도금", color: "var(--color-chart-2)", values: [96, 88, 101] },
];
const PLAN = { label: "계획(합계)", color: "var(--color-chart-4)", values: [215, 190, 225] };

// <StackedColumnChart categories={["1월", "2월", "3월"]} series={SERIES} line={PLAN}
//   dimFrom={2} dimLabel="3월은 전망(옅은 색)" totalAt={1} unit="천 t" ariaLabel="월별 생산 실적" />
```

## Props

차트 컴포넌트의 props interface 는 export 되지 않는다. 데이터 타입만 export 된다(`DonutSlice`, `PieSlice`, `BarData`, `LineDataPoint`, `StackedBarSegment`, `StackedBarRow`).

DonutChart

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| data | `DonutSlice[]` | 필수 | `{ label, value, color, icon? }` |
| size | `number` | `200` | 지름(px). 컴포넌트 크기 prop 이 아니라 그림 크기다 |
| innerRadius | `number` | 바깥 반지름의 0.6 | 안쪽 구멍 반지름 |
| centerLabel | `string` | - | 가운데 라벨 |
| centerValue | `string` | - | 가운데 값 |

PieChart: `data: PieSlice[]`(`{ label, value, color }`), `size`(180), `showLegend`(`true`).

HBarChart: `data: BarData[]`(`{ label, value, color }`), `maxValue`(데이터 최댓값), `barHeight`(22), `labelWidth`(100), `chartWidth`(320).

LineChart

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| data | `LineDataPoint[]` | 필수 | `{ label, value }` |
| height | `number \| "100%"` | `250` | 높이 |
| color | `string` | 16진수 파랑 | 선 색. 기본값이 16진수라 항상 토큰으로 덮어쓴다 |
| avgColor | `string` | 16진수 초록 | 평균선 색. 항상 토큰으로 덮어쓴다 |
| showAvg | `boolean` | `true` | 평균선 표시 |
| avgLabel | `string` | `"AVG"` | 평균선 라벨 |
| yLabel | `string` | - | y축 라벨 |

StackedBarChart: `rows: StackedBarRow[]`(`{ label, values: Record<string, number> }`), `segments: StackedBarSegment[]`(`{ key, label, color }`), `barHeight`(26), `labelWidth`(50), `chartWidth`(400), `showPercentLabels`(`true`).

StackedColumnChart (`StackedColumnChartProps` 를 export 한다)

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| categories | `string[]` | 필수 | 가로축 항목 |
| series | `StackedColumnSeries[]` | 필수 | `{ key, label, color, values }`, 아래에서 위로 쌓는다 |
| line | `StackedColumnLine` | - | `{ label, color, values, dashed? }` 기준선(기본 점선) |
| dimFrom | `number` | - | 이 순번부터 막대를 옅게 |
| dimLabel | `string` | - | 범례 끝 설명 |
| totalAt | `number` | - | 이 순번 막대 위에 합계 |
| unit | `string` | `""` | 툴팁 단위 |
| height | `number` | `230` | 그림 높이(px, 최소 120). 범례 줄은 별도 |
| showLegend | `boolean` | `true` | 범례 |
| ariaLabel | `string` | - | 그림 설명 |
| testId | `string` | - | 뿌리 `data-testid` |

## 표준값: 모든 화면 동일

- 색은 데이터·`color`·`avgColor` 모두 의미 토큰만 쓴다(성공 `--color-success`, 위험 `--color-danger`, 주의 `--color-warning`, 기본 `--color-primary`). 상태가 아닌 여러 계열(제품군·교대조 등)은 `--color-chart-1` … `--color-chart-5` 를 순서대로 쓴다.
- 합계가 0 이거나 데이터가 없으면 "데이터 없음" 글자가 보인다. 별도 빈 상태 문구를 만들지 않는다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| ASK 확인 없이 차트를 추가한다 | 먼저 사용자에게 확인한다 |
| `color: "#337ab7"` 처럼 16진수를 준다 | `var(--color-primary)` 같은 토큰을 준다 |
| `LineChart` 의 `color`·`avgColor` 를 생략한다 | 기본값이 16진수라 테마와 어긋난다. 항상 준다 |
| 데이터에 `color` 를 빼먹는다 | 모든 조각·막대·구분에 필수다 |
| 내부 글자색·여백을 화면 CSS 로 바꾼다 | 내부에 16진수(`#999`·`#555` 등)가 들어 있어 테마를 따르지 않는다. 바꾸려면 shared 를 고친다(보강 후보) |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/home/page.tsx`: 포털 홈 — `StackedColumnChart`(월별 실적 + 계획선), `DonutChart`(설비 가동), `StackedBarChart`(교대조 누적, `showPercentLabels={false}`), `HBarChart`(불량 유형). 색은 `--color-chart-*`·상태 토큰(표준과 같다).
- `src/frontend/m-design-dummy/src/screens/ChartDashboardScreen.tsx:134-230`: 다섯 차트를 모두 쓰는 카탈로그 샘플. 단, `COLORS` 상수(`#337ab7` 등)와 `"#dfe4e9"` 같은 16진수 색을 주는 점은 표준과 다름.
- `src/frontend/m-design-dummy/src/screens/OperationsDashboardScreen.tsx:174-197`: `LineChart`(`color="#337ab7"`)·`DonutChart`. 단, 16진수 색은 표준과 다름.
