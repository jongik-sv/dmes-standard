# Tour

처음 쓰는 사람에게 화면을 단계별 말풍선으로 안내할 때 쓴다. 단계마다 화면의 한 요소를 밝게 강조하고 그 옆에 말풍선(제목·설명·[이전]·[다음]·[건너뛰기]·「다시 보지 않기」 칸)을 띄운다. 비모달이라 뒤 화면을 그대로 조작할 수 있다. 업무 도메인과 무관한 범용 부품이다.

- import: `import { Tour, type TourStep, type TourCloseResult } from "@dk-oasis/shared/tour";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣는다. 색·간격은 의미 토큰)
- 소스: `src/frontend/shared/src/components/tour/` (`Tour.tsx`, 순수 함수 `tour-model.ts`, `index.ts`)
- 내부 구현: `createPortal`(body) + 공용 `Button`·`Checkbox`. 대상 요소는 CSS 선택자로 찾는다
- 진입점: `@dk-oasis/shared/tour` (2026-10-12 ERD 편집 화면 처음 둘러보기에서 등록)

## 언제 쓰나

- 쓴다: 화면을 처음 연 사용자에게 핵심 동작 서너 가지를 차례로 보여 줄 때.
- 쓰지 않는다: 답을 받아야 하는 대화 상자 → [Modal](modal.md). 칸 옆 잠깐 설명 → [DetailPopover](detail-popover.md). 계속 떠 있는 보조 창 → [FloatingPanel](floating-panel.md).
- 「다시 보지 않기」 저장은 화면이 한다. `onClose` 의 `neverShow` 를 받아 화면 설정(localStorage 등)에 적고, 열기 전에 그 값을 확인한다.

## 표준 사용

```tsx
import { useState } from "react";
import { Tour, type TourStep } from "@dk-oasis/shared/tour";

const STEPS: readonly TourStep[] = [
  { id: "model", title: "모델 고르기", body: "위 막대에서 볼 모델을 고릅니다.", target: '[data-testid="model-select"]', placement: "bottom" },
  { id: "table", title: "표 추가", body: "캔버스의 빈 곳을 두 번 누릅니다.", target: '[data-testid="canvas"]' },
  { id: "done", title: "준비 끝", body: "도움말은 위 막대 [?] 에서 다시 볼 수 있습니다." }, // target 없음 → 화면 가운데
];

export function Guide({ seen, onNeverShow }: { seen: boolean; onNeverShow(): void }) {
  const [open, setOpen] = useState(!seen);
  return (
    <Tour
      open={open}
      steps={STEPS}
      onClose={(r) => {
        setOpen(false);
        if (r.neverShow) onNeverShow();
      }}
    />
  );
}
```

## Props

`Tour`

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `open` | `boolean` | 필수 | false 면 아무것도 그리지 않는다. true 가 될 때마다 처음 단계부터 시작한다 |
| `steps` | `readonly TourStep[]` | 필수 | 단계 목록. 비면 그리지 않는다 |
| `onClose` | `(r: TourCloseResult) => void` | 필수 | [완료]·[건너뛰기]·Esc. 닫는 일(`open=false`)은 상위가 한다 |
| `initialIndex` | `number` | `0` | 처음 단계 |
| `showNeverShow` | `boolean` | `true` | false 면 「다시 보지 않기」 칸을 감춘다 |
| `labels` | `{ prev; next; finish; skip; neverShow }` | `이전`·`다음`·`완료`·`건너뛰기`·`다시 보지 않기` | 단추·칸 글 |
| `zIndex` | `number` | `9100` | 층 z-index. 화면 머리·사이드바 위, 공용 Modal(9999) 아래 |
| `testId` | `string` | `"tour"` | 뿌리. 말풍선 `{testId}-bubble`, 단계 `-step`, 단추 `-prev`·`-next`·`-skip`, 칸 `-never`, 강조 틀 `-hole` |

`TourStep` — `{ id; title; body: ReactNode; target?: string; placement?: "top"|"bottom"|"left"|"right"|"center" }`.
`TourCloseResult` — `{ reason: "finish" | "skip"; neverShow: boolean; index: number }`.

## 표준값: 모든 화면 동일

- 대상은 단계가 바뀔 때·창 크기·스크롤이 바뀔 때·0.5초마다 다시 찾는다. 못 찾거나 크기가 0 이면 화면 가운데에 띄운다.
- 말풍선은 원하는 방향에 안 들어가면 반대 방향으로 뒤집고, 화면 가장자리에서 8px 안쪽으로 민다(`placeBubble`).
- 마지막 단계의 오른쪽 단추는 [완료], 그 밖에는 [다음]. 단계가 바뀌면 그 단추에 초점이 간다.
- 순수 함수(`tour-model.ts`, 같은 진입점에서 export): `placeBubble`·`highlightRect`·`clampTourIndex`. 단위 시험은 `tests/unit/tour.unit.test.ts`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 뒤 화면을 막으려고 사용 | 비모달이다. 막아야 하면 [Modal](modal.md) |
| 대상을 `.css-hash` 클래스로 지정 | 안정된 `data-testid` 또는 `id` 선택자를 쓴다 |
| 「다시 보지 않기」 값을 컴포넌트가 저장한다고 가정 | `onClose` 의 `neverShow` 를 화면이 저장한다 |
