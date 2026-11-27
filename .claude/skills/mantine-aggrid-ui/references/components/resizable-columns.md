# ResizableColumns

칸 N 개를 가로 격자로 놓고 칸 사이 손잡이(10px)를 끌어 폭을 바꾸는 부품이다(`ResizableColumns`). 폭 규칙·저장 모양을 계산하는 순수 함수도 함께 낸다.

- import: `import { ResizableColumns, type ResizableColumnsHandle, type ResizableColumnsProps, type ResizableColumnDef } from "@dk-oasis/shared/resizable-columns";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣고, 색·간격은 의미 토큰)
- 소스: `src/frontend/shared/src/components/resizable-columns/ResizableColumns.tsx`, `column-resize.ts`
- 저장: shared `layout/split-sizing` 의 `loadSplit`·`saveSplit`(ContentBody `resizable` 과 같은 저장소 `dmes:split:v1:{userId}:{storageKey}`)을 쓴다. 사용자 ID 는 `useCurrentUserId`.
- Part B 허용 목록(§1): `resizable-columns` SHOULD (Part B §18 로 등록).

## 언제 쓰나

- 쓴다: 한 줄에 서로 독립된 패널(목록·상세·미리보기 등)을 가로로 놓고 사용자가 칸 폭을 직접 조절하게 할 때. 칸 합이 부모보다 넓어도 된다(부모가 가로 스크롤).
- 쓰지 않는다:
  - 좌우·상하 분할이 `ContentBody`·`ContentPanel` 안의 패널이면 → `layout` 의 `ContentBody resizable` + `storageKey`(Part B §4-3). 그쪽은 패널 크기를 남는 공간 안에서 나눈다(합이 보존된다).
  - 그리드 열 폭 → `AgDataGrid` 가 맡는다.
  - 격자 칸 수·크기(위젯 24열)를 고르는 일 → [grid-resize-box](grid-resize-box.md).
- 폭 규칙: 숫자는 px, `"fr"` 은 남는 폭(`minmax(0, 1fr)`)이다. 경계 `i`(칸 i 와 i+1 사이)를 끌면 **바로 옆 px 칸 하나만** 바뀐다. 칸 i 가 px 면 그 칸이 +dx, 아니고 i+1 이 px 면 그 칸이 -dx. 합이 0 이 되는 분배가 아니다. 두 칸 다 `"fr"` 이면 아무 일도 없다.
- 조작: 끌기(포인터 캡처, 끄는 동안 body 커서 `col-resize`, rAF 로 묶어 갱신, 놓을 때 한 번만 상태·저장), ← → 20px(Shift 80px), 손잡이 두 번 누르기 = 모든 칸 처음 폭. 손잡이는 `role="separator"`·`tabIndex=0`.
- 저장은 `storageKey` 를 줬을 때만, px 칸 중 처음 폭과 다른 것만 `{kind:"px"}` 로 둔다. 칸 정의에서 사라진 키·`"fr"` 이 된 칸의 저장값은 무시한다. 같은 화면에 격자가 둘이면 `storageKey` 를 다르게 준다.
- 좁은 화면에서 칸을 세로로 쌓는 동작은 없다(필요하면 화면이 처리한다).

## 표준 사용

```tsx
import { useRef } from "react";
import { Button } from "@dk-oasis/shared/form";
import { ResizableColumns, type ResizableColumnDef, type ResizableColumnsHandle } from "@dk-oasis/shared/resizable-columns";

// 칸 정의는 모듈 수준에 둔다(내용이 같으면 새 배열이어도 되지만 매 렌더 만들 이유가 없다).
const COLUMNS: ResizableColumnDef[] = [
  { key: "list", width: 280 },
  { key: "detail", width: "fr" },
  { key: "side", width: 320, minWidth: 200 },
];

export function ThreePane({ list, detail, side }: { list: React.ReactNode; detail: React.ReactNode; side: React.ReactNode }) {
  const ref = useRef<ResizableColumnsHandle>(null);
  return (
    <>
      <Button size="sm" onClick={() => ref.current?.resetAll()}>폭 초기화</Button>
      <ResizableColumns ref={ref} columns={COLUMNS} storageKey="my-screen:three-pane">
        {list}
        {detail}
        {side}
      </ResizableColumns>
    </>
  );
}
```

## Props

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `columns` | `ResizableColumnDef[]` = `{ key: string; width: number \| "fr"; minWidth?: number }` | — | 칸 정의(순서대로). `key` 는 저장 키 |
| `children` | `ReactNode` | — | 칸마다 한 요소(순서·개수는 `columns` 와 같게). `renderCell` 이 있으면 쓰지 않는다 |
| `renderCell` | `(column, index) => ReactNode` | — | `children` 대신 칸 내용을 그린다 |
| `storageKey` | `string` | — | 주면 px 칸 폭을 사용자별로 저장한다 |
| `minWidth` / `maxWidth` | `number` | `150` / `2200` | 모든 칸의 최소·최대 폭(px). 칸마다 `minWidth` 로 최소를 덮어쓴다 |
| `handleWidth` | `number` | `10` | 손잡이 칸 폭(px) |
| `handleLabel` / `handleTitle` | `string` | 한국어 안내 | 손잡이 `aria-label`·마우스오버 설명 |
| `onWidthsChange` | `(widths: ColumnWidth[]) => void` | — | 끌기 끝·키·초기화 뒤 현재 폭 배열로 부른다 |
| `ref` | `Ref<ResizableColumnsHandle>` | — | `resetAll()` — 모든 칸 처음 폭, 저장값 삭제 |
| `className` / `style` / `testId` | | `testId="resizable-columns"` | testId 조립은 아래 |

testId(`{p}` = `testId`): 뿌리 `{p}`, 손잡이 `{p}-handle-{경계 번호}`, 칸 `{p}-cell-{key}`.

## 순수 함수

모두 입력 배열을 바꾸지 않는다.

| 함수 | 하는 일 |
|---|---|
| `resizeColumns(base, i, dx, { min, max, mins })` | 경계 `i` 를 `dx` 만큼 옮긴 새 폭 배열(위 폭 규칙, 한계로 자름) |
| `resizeTarget(widths, i)` | 경계 `i` 가 바꿀 칸 번호, 없으면 -1 |
| `gridTemplate(widths, handle)` | CSS `grid-template-columns` 문자열(칸 사이 손잡이 칸 포함) |
| `widthsToSaved(columns, widths)` / `applySaved(columns, saved, limits)` | 저장 모양 ↔ 폭 배열(없어진 키 무시·한계로 자름) |
| `keyDelta(key, shift)` | ←/→ 키의 이동 폭, 다른 키는 `null` |
| `defaultWidths`, `sameWidths` | 처음 폭 배열, 폭 배열 비교 |

기본값 상수: `DEFAULT_HANDLE_WIDTH`(손잡이 폭 10px), `DEFAULT_MIN_COLUMN_WIDTH`(칸 최소 폭), `DEFAULT_MAX_COLUMN_WIDTH`(칸 최대 폭). props 를 안 주면 이 값을 쓴다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `children` 개수가 `columns` 와 다름 | 칸마다 한 요소. 조건부 칸은 `null` 대신 빈 요소를 두거나 `columns` 도 함께 바꾼다 |
| 두 칸 다 `"fr"` 로 두고 끌어 보려 함 | 폭이 바뀌는 칸은 px 칸뿐이다. 조절할 쪽을 px 로 둔다 |
| 같은 화면 격자 둘이 같은 `storageKey` | 서로 다른 키를 준다 |
| 「폭 초기화」 단추를 화면이 직접 저장소를 지워 만듦 | `ref.current?.resetAll()` |
| ContentBody 분할 대신 이 부품으로 화면 본체를 나눔 | 화면 본체 분할은 `ContentBody resizable`(Part B §4-3) |
