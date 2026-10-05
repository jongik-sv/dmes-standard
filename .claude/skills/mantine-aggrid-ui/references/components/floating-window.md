# FloatingWindow

업무 화면 위에 떠 있는 작은 창 하나를 그릴 때 쓴다. 창 막대(끌기 손잡이·제목·접기·닫기)로 옮기고, 오른쪽 아래 손잡이로 크기를 바꾸며, 접으면 같은 자리에 둥근 아이콘만 남는다. 업무 도메인과 무관한 범용 부품이다.

- import: `import { FloatingWindow, FLOATING_DRAG_THRESHOLD, type FloatingWindowProps } from "@dk-oasis/shared/portal-shell";` (CSS import 없음 — 컴포넌트가 `<FloatingWindowStyle />` 로 자기 스타일을 넣는다)
- 소스: `src/frontend/shared/src/widget-dock/FloatingWindow.tsx`, 스타일 `styles.tsx`(`FLOATING_WINDOW_CSS`)
- 내부 구현: 일반 `section`/`button` + 포인터 이벤트·포인터 캡처. 아이콘은 `@tabler/icons-react`. Mantine 을 쓰지 않는다. 색·간격은 공통 토큰만 쓴다
- 진입점: 별도 서브패스 없이 `portal-shell` 진입점으로 낸다(2026-10-05 위젯 도크 회차). 지금 쓰는 곳은 위젯 도크([widget-dock](widget-dock.md)) 하나다.

## 언제 쓰나

- 쓴다: 업무 화면을 가리지 않고 옆에 띄워 두는 도구 창(계산기·메모 등), 여러 개를 동시에 두고 옮기거나 접어 두는 창.
- 쓰지 않는다: 사용자의 답을 기다리는 대화 상자 → [Modal](modal.md)(배경을 막는다). 칸 옆에 잠깐 뜨는 설명 → [DetailPopover](detail-popover.md). 위젯을 띄우는 일 자체 → [widget-dock](widget-dock.md) 의 `WidgetDockLayer` 가 이 부품을 감싸 쓴다.

## 표준 사용

위치·크기·접힘은 부모가 소유하고, 창은 끌기·크기 조절이 끝났을 때 한 번만 알린다. 부모는 `position` 이 있는 층(예: `position: fixed; inset: 0; pointer-events: none`) 안에 창을 놓는다. 창 자신은 `pointer-events: auto` 다.

```tsx
import { useState } from "react";
import { FloatingWindow } from "@dk-oasis/shared/portal-shell";

export function ToolWindow({ onClose }: { onClose: () => void }) {
  const [rect, setRect] = useState({ x: 80, y: 80, w: 320, h: 240 });
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 160 }}>
      <FloatingWindow
        title="계산기"
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        collapsed={collapsed}
        bounds={{ width: window.innerWidth, height: window.innerHeight }}
        onMove={(x, y) => setRect((r) => ({ ...r, x, y }))}
        onResize={(w, h) => setRect((r) => ({ ...r, w, h }))}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onClose={onClose}
      >
        {/* 본문 */}
      </FloatingWindow>
    </div>
  );
}
```

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| title | `string` | 필수 | 막대 제목·`aria-label`·접힌 아이콘 기본 글자(첫 글자) |
| x, y | `number` | 필수 | 왼쪽 위 모서리(px, 부모 기준). 접힌 아이콘도 같은 자리 |
| width, height | `number` | 필수 | 펼친 창 크기(px) |
| collapsed | `boolean` | 필수 | 접힘. 접혀도 본문은 마운트한 채 숨긴다 |
| zIndex | `number` | - | 쌓임 순서(부모 층 안에서) |
| bounds | `{ width; height }` | 필수 | 끌기·크기 조절을 자를 영역(px) |
| minWidth, minHeight | `number` | `220`, `160` | 크기 조절 최소값(영역이 더 작으면 영역) |
| iconSize | `number` | `44` | 접힌 아이콘 한 변(px) |
| icon | `ReactNode` | 제목 첫 글자 | 접힌 아이콘 내용 |
| onMove | `(x, y) => void` | 필수 | 막대·아이콘 끌기를 놓을 때 한 번 |
| onResize | `(w, h) => void` | 필수 | 크기 손잡이를 놓을 때 한 번 |
| onToggleCollapse | `() => void` | 필수 | 막대 [접기]·아이콘 클릭 |
| onClose | `() => void` | 필수 | 막대 [닫기] |
| onFocus | `() => void` | - | 창 안을 누르거나 포커스가 들어올 때(맨 앞으로 가져오기) |
| children | `ReactNode` | 필수 | 본문(높이를 채우려면 `height: 100%`) |
| testId | `string` | - | 창 `data-testid`, 접힌 아이콘은 `{testId}-icon` |
| className | `string` | - | 창 루트에 덧붙일 클래스(`cm-float-win` 은 늘 붙는다) |

## 표준값: 모든 화면 동일

- 끌기 판정 거리 `FLOATING_DRAG_THRESHOLD` = 4px. 접힌 아이콘은 4px 미만이면 클릭(펼치기), 넘으면 옮기기만 한다.
- 막대 26px, 아이콘 44px 원, 그림자 `--shadow-modal`. 접기·닫기 버튼은 `aria-label` 「접기」·「닫기」, 아이콘은 「{제목} 펼치기」.
- 끄는 동안은 창 안에서만 위치를 그리고(부모를 다시 그리지 않는다), 놓을 때 부모에 알린다. 본문 `children` 이 같은 객체면 끄는 동안 본문은 다시 그려지지 않는다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 접을 때 본문을 언마운트하려고 `collapsed` 면 children 을 빼서 넘김 | 그대로 넘긴다. 창이 숨기기만 해서 입력 중인 값이 남는다 |
| 부모 층에 `pointer-events: none` 없이 화면 전체를 덮음 | 층은 `pointer-events: none`, 창만 눌린다 |
| `onMove` 에서 받은 값을 다시 자르지 않고 저장 | 창은 `bounds` 로 자르지만 화면 크기가 바뀌면 부모가 다시 자른다(위젯 도크는 그릴 때 `clampDockWindow`, 저장은 `placeDockWindow`) |
| 렌더마다 `children` 을 새로 만들어 끌 때 본문이 다시 그려짐 | 본문 요소를 `useMemo` 로 고정한다(`WidgetDockLayer` 참고) |
| 모달처럼 쓰려 함 | 배경을 막지 않는 비모달 창(`role="dialog" aria-modal="false"`)이다. 답을 받아야 하면 [Modal](modal.md) |

## 실제 사용 예

- `src/frontend/shared/src/widget-dock/WidgetDockLayer.tsx`: 위젯 틀(`WidgetFrame`)을 본문으로 넣고 창 ID 를 묶은 콜백을 `useCallback` 으로 고정한다.
