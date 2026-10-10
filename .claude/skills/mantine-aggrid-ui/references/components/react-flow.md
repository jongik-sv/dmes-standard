# React Flow 캔버스 부품

노드·선을 그리는 캔버스 화면(React Flow)에서 업무와 무관한 부품을 함께 쓸 때 쓴다. `@xyflow/react` 전부와 선 경로 계산·끌기 스냅·화면 길잡이·우클릭 메뉴·단축키 판정·찾기 위젯을 한 서브패스로 준다.

- import: `import { ReactFlow, ReactFlowProvider, ViewportGuard, ContextMenu, FindWidget, shortcutOf, CANVAS_SHORTCUTS } from "@dk-oasis/shared/react-flow";` (CSS import 없음 — xyflow 스타일시트는 이 서브패스가 불러오고, 부품은 자기 `<style>` 을 넣는다)
- 소스: `src/frontend/shared/src/components/react-flow/` (`index.ts` 배럴)
- 내부 구현: 룰 세트 편집기(`m-mdm/pages/dme/ruleSetEdit/canvas/`) 부품의 복사본이다. 합치기는 `docs/erd-tool/deferred.md` 15번. 의존성 `@xyflow/react` 12.12.0·`@dagrejs/dagre` 3.1.1(shared `dependencies`).
- Part B 허용 목록(§1): `react-flow` SHOULD.

## 언제 쓰나

- 쓴다: ERD·흐름도처럼 노드를 놓고 선으로 잇는 캔버스 화면. 화면은 `@xyflow/react` 를 직접 import 하지 않고 이 서브패스에서 가져온다.
- 쓰지 않는다: 표·트리 → [AgDataGrid](ag-data-grid.md)·[Tree](tree.md). 업무 모델을 아는 노드·선 그리기(표 노드, 관계선 등)는 화면 폴더에 둔다(Part B §18-1).
- 클래스 접두는 기본 `rfx`(`DEFAULT_CLASS_PREFIX`)다. 한 화면에서 같은 접두를 쓴다. 접두를 바꾸면 `<style href>` 도 따로 들어간다.

## 표준 사용

```tsx
import { useRef, useState } from "react";
import {
  CANVAS_SHORTCUTS, ContextMenu, FindWidget, ReactFlow, ReactFlowProvider, ViewportGuard, dispatchShortcut, isMacPlatform,
  type FindState, type MenuItem,
} from "@dk-oasis/shared/react-flow";

export function Canvas({ find, onFit }: { find: FindState; onFit(): void }) {
  const mac = isMacPlatform();
  const inputRef = useRef<HTMLInputElement>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[] } | null>(null);
  return (
    <div
      tabIndex={0}
      style={{ position: "relative", height: "100%" }}
      onKeyDown={(e) => dispatchShortcut(e, { find: () => setFindOpen(true), fitView: onFit }, mac, CANVAS_SHORTCUTS)}
    >
      <ReactFlowProvider>
        <ReactFlow nodes={[]} edges={[]} onPaneContextMenu={(e) => setMenu({ at: { x: e.clientX, y: e.clientY }, items: [{ id: "fit", label: "전체 보기", run: onFit }] })}>
          <ViewportGuard onFit={onFit} fitKeyLabel={mac ? "⇧1" : "Shift+1"} testId="erd-lost" />
        </ReactFlow>
      </ReactFlowProvider>
      {findOpen ? <FindWidget find={find} inputRef={inputRef} focusSeq={0} mac={mac} onClose={() => setFindOpen(false)} testId="erd-find" /> : null}
      <ContextMenu items={menu?.items ?? []} at={menu?.at ?? null} onClose={() => setMenu(null)} testId="erd-menu" />
    </div>
  );
}
```

## 내보내는 것

| 묶음 | 이름 |
|---|---|
| React Flow | `@xyflow/react` 의 모든 export(`ReactFlow`, `useStore`, `Position` …). xyflow 의 `Box` 는 그대로 xyflow 뜻이다 |
| 선 경로(순수) | `routePath`, `routeMidpoint`, `insertRoutePoint`, `smoothStepPoints`, `autoRoute`, `finishRoute`, `simplifyRoute`, `roundPoint`, `segmentAxis`, `segmentHandles`, `isClear`, `moveSegment`, `snapRoutePoint`, `snapSegmentDelta`, 상수 `ROUTE_RADIUS`, `AUTO_ROUTE_OFFSET`, `ROUTE_STUB`, `SEGMENT_MIN_PX`, `SEGMENT_CLEAR_PX`, `SEGMENT_SNAP_PX`, `ROUTE_GUIDE_OVERHANG`, 형 `FlowPos`, `Side`, `SmoothStepInput`, `SegmentAxis`, `SegmentHandle`, `RoutePointGuide` |
| 끌기 스냅(순수) | `snapIndex`, `snapHitIn`, `snapMoveIn`, `snapMove`, `snapThreshold`, `boundsOf`, `SNAP_THRESHOLD_PX`, 형 `SnapBox`(xyflow `Box` 와 겹쳐 이름을 바꿨다), `Guide`, `GuideAxis`, `SnapResult`, `SnapIndex`, `SnapHit`. 안내선 규칙은 `SnapGuideStyle` |
| 화면 길잡이 | `ViewportGuard`, `RECHECK_MS`(400), `LOST_DELAY_MS`(300), 계산 `boundsOfRects`, `panExtentOf`, `sameExtent`, `visibleRect`, `insideExtent`, `allOutside`, `KEEP_VISIBLE_PX`(80), `NO_EXTENT` |
| 우클릭 메뉴 | `ContextMenu`, 형 `MenuItem`, `MenuSwatch` |
| 단축키 | `shortcutOf`, `dispatchShortcut`, `UNHANDLED`, `CANVAS_SHORTCUTS`, `isMacPlatform`, `isTypingTarget`, `isShown`, 형 `KeyLike`, `ShortcutBinding`, `ShortcutHandlers`, `ShortcutHelpRow`, `CanvasShortcutId` |
| 찾기 | `FindWidget`, `findCountText`, `FIND_NO_RESULT`, `compileFind`, `escapeRegExp`, `INVALID_FIND`, `DEFAULT_FIND_OPTIONS`, 형 `FindOptions`, `FindState`, `FindMatcher` |
| 단추·공통 | `ToolButton`(26×26 아이콘 단추 + CSS 툴팁), `keepFocusOffButtons`(단추 mousedown 초점 이동 막기), `DEFAULT_CLASS_PREFIX` |

## Props

`ViewportGuard` — ReactFlow 의 자식으로 둔다.

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `onFit` | `() => void` | — | [전체 보기] 단추 |
| `fitKeyLabel` | `string` | — | 단추 옆에 적을 화면 맞춤 단축키 글 |
| `ignoreNodeTypes` | `readonly string[]` | `[]` | 화면 밖 판정에서 뺄 노드 형식(그룹 틀 등) |
| `lostText` | `string` | `"화면에 보이는 요소가 없습니다."` | 안내 글 |
| `fitText` | `string` | `"전체 보기"` | 단추 글 |
| `testId` | `string` | `"flow-lost"` | 안내 틀. 단추는 `<testId>-fit` |
| `flowExemptClassName` | `string` | `"nopan nodrag nowheel"` | 안내 상자의 React Flow 예외 클래스 |
| `classPrefix` | `string` | `"rfx"` | 클래스 접두 |

`ContextMenu` — `items: MenuItem[]`, `at: {x, y} | null`(null 이면 닫힘), `onClose()`, `testId`(기본 `"flow-menu"`, 항목 `<testId>-item-<id>`, 견본 `<testId>-swatch-<id>`), `classPrefix`. `MenuSwatch.color`·`borderColor` 는 CSS 색 값(`var(--color-…)`)이고 `MenuItem.icon` 은 `ReactNode` 다(견본 항목 단추에 그린다).

`FindWidget` — `find: FindState`(화면의 찾기 훅이 만든다. 일치 판정은 `compileFind`), `inputRef`, `focusSeq`(올리면 입력 칸 초점·전체 선택), `onClose()`, `mac`, `testId`(기본 `"flow-find"` — 입력 칸. 위젯 `-widget`, 옵션 `-case`·`-word`·`-regex`, 건수 `-count`, 단추 `-prev`·`-next`·`-close`), `label`(기본 `"찾기"`), `inputLabel`(기본 `"찾을 글"`), `placeholder`(기본 `"찾기"`), `noResultText`(기본 `"결과 없음"`), `classPrefix`.

`shortcutOf(e, mac, bindings)` · `dispatchShortcut(e, handlers, mac, bindings)` — `bindings` 는 `ShortcutBinding<Id>[]`(`key` 또는 `code`, `mod`·`shift`·`alt`). 앞에 있는 묶음이 먼저 맞는다. 입력 칸이면 무시하고, Alt 조합은 `code` 로만 보며 Ctrl·Meta 가 함께면(AltGr) 무시한다. 손잡이가 `UNHANDLED` 를 돌려주면 막지 않는다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 화면에서 `@xyflow/react` 를 직접 import | `@dk-oasis/shared/react-flow` 에서 가져온다. 스타일시트도 여기서 한 번 불러온다 |
| 화면에 `.css` 를 만들어 메뉴·찾기 위젯 모양을 덮음 | 화면 노드·선 규칙은 화면이 `<style href precedence>` 로 넣는다(Local-Rules §17). 부품 모양을 바꿔야 하면 shared 를 고친다(승인 뒤) |
| `import { Box } from "@dk-oasis/shared/react-flow"` 로 스냅 상자를 기대함 | 스냅 상자는 `SnapBox` 다. `Box` 는 xyflow 형식이다 |
| 단축키 표를 화면마다 처음부터 씀 | `[...CANVAS_SHORTCUTS, …화면 전용]` 로 잇는다 |
