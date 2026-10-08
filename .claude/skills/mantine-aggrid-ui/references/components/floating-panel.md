# FloatingPanel

화면 위에 떠 있고 끌어서 옮기고 크기를 바꿀 수 있는 **비모달** 창을 열고 닫는 상태까지 한 번에 쓸 때 쓴다. `open` 이 true 인 동안 `document.body` 로 포털해 그리고, 위치·크기·접힘을 (선택) 브라우저에 저장해 다시 열 때 복원한다. 업무 도메인과 무관한 범용 부품이다.

- import: `import { FloatingPanel, type FloatingPanelProps } from "@dk-oasis/shared/floating-panel";` (CSS import 없음 — 안쪽 `FloatingWindow` 가 자기 스타일을 넣는다)
- 소스: `src/frontend/shared/src/components/floating-panel/` (`FloatingPanel.tsx`, 순수 함수 `floating-panel-model.ts`, `index.ts`)
- 내부 구현: [FloatingWindow](floating-window.md)(창 막대·크기 손잡이·접기) + 화면 크기 훅(`useDockViewport`) + `createPortal`. Mantine 을 쓰지 않는다
- 진입점: `@dk-oasis/shared/floating-panel` (2026-10-08 로그 뷰어 서비스 목록 창에서 등록)

## 언제 쓰나

- 쓴다: 조회 화면 옆에 띄워 두고 뒤 화면을 계속 조작하는 보조 창(서비스 목록·참고 표·메모 등). 창을 열고 닫는 일을 화면이 `open` 상태 하나로 다룬다.
- 쓰지 않는다: 사용자의 답을 받아야 하는 대화 상자 → [Modal](modal.md)(배경을 막는다). 칸 옆에 잠깐 뜨는 설명 → [DetailPopover](detail-popover.md). 포털 머리 「도구」 로 띄우는 위젯 창 → [widget-dock](widget-dock.md). 위치·크기를 부모가 직접 소유해야 하는 여러 창 → 낮은 층인 [FloatingWindow](floating-window.md).

**기존 모달과 달리 뒤 화면이 조작된다.** 배경 막이 없고(`pointer-events: none` 층), 창 자신만 눌린다. 창은 `role="dialog" aria-modal="false"` 다.

## 표준 사용

서비스 목록 창처럼 그리드를 안에 넣는 예. 열림 상태만 화면이 갖고, 위치·크기는 `FloatingPanel` 안에 있다.

```tsx
import { memo, useState } from "react";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { FloatingPanel } from "@dk-oasis/shared/floating-panel";

type ServiceRow = { svcId: string; svcNm: string };

const COLUMNS: GridColumn[] = [
  { key: "svcId", header: "서비스 ID", width: 120, align: "left" },
  { key: "svcNm", header: "서비스명", width: 200, align: "left" },
];
const DEFAULT_RECT = { width: 520, height: 420 };

// 본문은 memo 로 감싼다 — 창 밖 상태가 바뀌어도 열린 동안 다시 그려지지 않게.
const ServiceListBody = memo(function ServiceListBody({ rows }: { rows: ServiceRow[] }) {
  return <AgDataGrid rowKey="svcId" columns={COLUMNS} data={rows} columnSizing="fit" />;
});

export function ServiceListButton({ rows }: { rows: ServiceRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>서비스 목록</button>
      <FloatingPanel
        title="서비스 목록"
        open={open}
        onClose={() => setOpen(false)}
        storageKey="logviewer-services"
        defaultRect={DEFAULT_RECT}
        minWidth={320}
        testId="service-list-panel"
      >
        <ServiceListBody rows={rows} />
      </FloatingPanel>
    </>
  );
}
```

**자식은 창을 닫으면 언마운트되고, 열린 동안은 상위 상태 변경에 다시 그려지지 않도록 상위에서 memo 하라.** 끌기·크기 조절·접기로는 본문이 다시 그려지지 않는다(상태가 `FloatingPanel` 안에 있고 `children` 은 그대로 통과한다). 그러나 상위 컴포넌트가 다시 그려질 때 새 `children` 요소를 넘기면 본문도 다시 그려지므로, 무거운 본문(그리드)은 `memo` 컴포넌트로 두거나 요소를 `useMemo` 로 고정한다. `defaultRect` 도 모듈 상수로 둔다.

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| title | `string` | 필수 | 창 막대 제목·`aria-label`·접힌 아이콘 첫 글자 |
| open | `boolean` | 필수 | false 면 아무것도 그리지 않는다(자식 언마운트) |
| onClose | `() => void` | 필수 | 막대 [닫기] 를 눌렀을 때. 닫는 일(`open=false`)은 상위가 한다 |
| storageKey | `string` | - | 있으면 위치·크기·접힘을 localStorage `dmes:floating-panel:{storageKey}` 에 저장·복원. 없으면 열 때마다 기본값 |
| defaultRect | `Partial<{ x; y; width; height }>` | 480×360, 화면 오른쪽 위 | 저장값이 없을 때의 위치·크기(px). 일부만 줘도 된다 |
| minWidth, minHeight | `number` | `240`, `160` | 크기 조절 최소값(화면이 더 작으면 화면) |
| zIndex | `number` | `160` | 창 층 z-index. 화면 머리·사이드바 위, 모달(Mantine 200·공용 Modal 9999) 아래 |
| testId | `string` | - | 창 `data-testid`, 접힌 아이콘은 `{testId}-icon` |
| children | `ReactNode` | 필수 | 본문(창 높이를 채우려면 `height: 100%`) |

## 표준값: 모든 화면 동일

- 저장은 끌기·크기 조절·접기를 **마친 시점**에만, `try/catch` 로 감싸 한다(저장소를 못 쓰는 private 창이어도 창은 동작한다). 저장값이 깨졌거나 화면보다 크면 기본값·화면 안으로 잘라 쓴다.
- 화면이 줄어 창이 밖으로 나가면 그릴 때 화면 안으로 자른다(저장값은 그대로라 화면이 다시 커지면 원래 자리로 돌아온다).
- 서버 렌더에서는 `window`·`document` 를 건드리지 않는다(마운트 뒤에만 포털).
- 순수 함수(`floating-panel-model.ts`, 같은 진입점에서 export): `parsePanelState`·`serializePanelState`·`clampPanelRect`·`defaultPanelRect`·`resolveInitialPanelState`·`floatingPanelStorageKey`. 단위 시험은 `tests/unit/floating-panel.unit.test.ts`.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 뒤 화면을 막으려고 사용 | 비모달이다. 답을 받아야 하면 [Modal](modal.md) |
| `open` 이 false 일 때도 자식이 살아 있다고 가정(그리드 선택·스크롤 유지) | 닫으면 언마운트된다. 유지할 상태는 상위가 들고 `props` 로 내린다 |
| 상위가 자주 다시 그려지는데 `children` 을 인라인으로 만듦 | 본문을 `memo` 컴포넌트로 분리한다 |
| `storageKey` 를 화면마다 같은 값으로 씀 | 창 종류마다 다른 키(`dmes:floating-panel:` 뒤에 붙는다) |
| `defaultRect` 를 렌더마다 새 객체로 넘기고 위치가 바뀐다고 기대 | 기본값은 창을 **열 때 한 번** 쓴다. 열린 뒤에는 사용자가 정한 위치가 우선 |
