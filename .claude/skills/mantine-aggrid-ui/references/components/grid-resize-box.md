# GridResizeBox

24열 격자(위젯 보드와 같은 규칙) 단위로 마우스를 끌어 크기를 바꾸는 틀이다. 안쪽 children 을 틀 크기로 그리고, 끄는 동안 「12×8」 같은 칸 크기를 보인다. 칸 ↔ 픽셀 계산(`gridBoxPx`·`snapGridSize`)도 함께 내보낸다.

- import: `import { GridResizeBox, gridBoxPx, snapGridSize, DEFAULT_GRID_METRICS, type GridResizeBoxProps, type GridSize } from "@dk-oasis/shared/grid-resize-box";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣는다)
- 소스: `src/frontend/shared/src/components/grid-resize-box/` (`GridResizeBox.tsx`·`grid-size.ts`)
- 내부 구현: 포인터 이벤트(`setPointerCapture`)로 오른쪽 가장자리(가로)·아래 가장자리(세로)·오른쪽 아래 모서리(가로+세로) 손잡이를 끈다. 폭 = 영역 폭 × w/24, 높이 = h×20 + (h−1)×8 px 이며 `snapGridSize` 가 그 역으로 가장 가까운 칸에 맞춘다.
- Part B 허용 목록(§1): `grid-resize-box` SHOULD.

## 언제 쓰나

- 쓴다: 위젯 크기처럼 24열 격자 단위의 크기를 미리 보면서 끌어 정하게 할 때(위젯 관리 미리보기).
- 쓰지 않는다: 실제 보드 위 위젯 배치·크기 조절 → `WidgetBoard`(react-grid-layout). 픽셀 단위 자유 크기 → 화면 CSS `resize`.

## 표준 사용

```tsx
import { GridResizeBox } from "@dk-oasis/shared/grid-resize-box";

// areaWidth = 24열 전체의 폭(px). 부모 폭을 ResizeObserver 로 재서 넘긴다.
<GridResizeBox
  size={{ w: 12, h: 8 }}
  areaWidth={areaWidth}
  limits={{ minW: 1, maxW: 24 }}
  onResizeEnd={(next) => setSize(next)}
>
  <Preview />
</GridResizeBox>
```

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `size` | `{ w, h }` | — | 현재 확정 크기(칸) |
| `areaWidth` | `number` | — | 24열 전체의 폭(px) |
| `onResizeEnd` | `(size) => void` | — | 놓았을 때 확정 크기. 크기가 그대로이면 부르지 않는다. 화살표 키(손잡이 포커스)도 한 칸씩 이 콜백으로 알린다 |
| `onResize` | `(size \| null) => void` | 없음 | 끄는 중 크기가 바뀔 때마다. 끝나면 null |
| `limits` | `{ minW?, maxW?, minH?, maxH? }` | 가로 1~24, 세로 1 이상 | 끄는 범위. 가로는 늘 1~24 안 |
| `metrics` | `{ cols, rowHeight, gap }` | `{ 24, 20, 8 }` | 격자 규격 |
| `disabled` | `boolean` | `false` | 손잡이를 숨기고 끌 수 없게 한다 |
| `className`·`style`·`testId` | | `testId="grid-resize-box"` | 손잡이는 `<testId>-handle-e·s·se`, 끄는 중 표시는 `<testId>-badge` |

`gridBoxPx(areaWidth, size, metrics?)` 칸 → `{ width, height }`(px), `snapGridSize(areaWidth, { width, height }, limits?, metrics?)` 픽셀 → 가장 가까운 칸 크기.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `areaWidth` 에 틀(박스) 폭을 넘김 | 24열 **전체** 폭을 넘긴다. 틀 폭은 `size.w/24` 로 이 컴포넌트가 정한다 |
| `size` 를 끄는 중에 바꾸려고 `onResize` 로 상태를 갱신함 | 끄는 중 모습은 컴포넌트가 그린다. 확정은 `onResizeEnd` 에서만 반영한다 |
| 틀 안 내용이 포인터를 가로챔 | 끄는 동안 본문은 `pointer-events: none` 이다. 손잡이 위에 다른 요소를 겹치지 않는다 |
