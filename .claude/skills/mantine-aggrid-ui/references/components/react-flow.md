# React Flow 캔버스 부품

노드·선을 그리는 캔버스 화면(React Flow)에서 업무와 무관한 부품을 함께 쓸 때 쓴다. `@xyflow/react` 전부와 선 경로 계산·끌기 스냅·화면 길잡이·우클릭 메뉴·단축키 판정·찾기 위젯·자동 배치(dagre)를 한 서브패스로 준다.

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
| 자동 배치(순수) | `autoLayout`, `AUTO_LAYOUT_DEFAULTS`, 형 `LayoutNode`, `LayoutEdge`, `LayoutDirection`, `AutoLayoutOptions`. dagre 로 층을 나눠 왼쪽 위 좌표(정수)를 준다 |
| 화면 길잡이 | `ViewportGuard`, `RECHECK_MS`(400), `LOST_DELAY_MS`(300), 계산 `boundsOfRects`, `panExtentOf`, `sameExtent`, `visibleRect`, `insideExtent`, `allOutside`, `KEEP_VISIBLE_PX`(80), `NO_EXTENT` |
| 우클릭 메뉴 | `ContextMenu`, 형 `MenuItem`, `MenuSwatch` |
| 단축키 | `shortcutOf`, `dispatchShortcut`, `UNHANDLED`, `CANVAS_SHORTCUTS`, `isMacPlatform`, `isTypingTarget`, `isShown`, 형 `KeyLike`, `ShortcutBinding`, `ShortcutHandlers`, `ShortcutHelpRow`, `CanvasShortcutId` |
| 찾기 | `FindWidget`, `findCountText`, `FIND_NO_RESULT`, `compileFind`, `escapeRegExp`, `INVALID_FIND`, `DEFAULT_FIND_OPTIONS`, 형 `FindOptions`, `FindState`, `FindMatcher` |
| 단추·공통 | `ToolButton`(26×26 아이콘 단추 + CSS 툴팁), `TextToolButton`(글자 단추 + 꺼진 이유 안내), 형 `TextToolButtonProps`, `keepFocusOffButtons`(단추 mousedown 초점 이동 막기), `DEFAULT_CLASS_PREFIX` |

## 자동 배치

```ts
import { autoLayout, type LayoutEdge, type LayoutNode } from "@dk-oasis/shared/react-flow";

const nodes: LayoutNode[] = rf.getNodes().map((n) => ({ id: n.id, width: n.measured?.width ?? 240, height: n.measured?.height ?? 80 }));
const edges: LayoutEdge[] = rf.getEdges().map((e) => ({ source: e.source, target: e.target }));
const pos = autoLayout(nodes, edges, { direction: "LR", rankGap: 100, isolated: "grid" });
// pos[id] 는 node.position(왼쪽 위)에 그대로 넣는다. 서버에 저장하는 화면은 이 값으로 명령을 만든다.
```

| 옵션 | 기본 | 설명 |
|---|---|---|
| `direction` | `"TB"` | 층을 쌓는 방향(`TB`·`BT`·`LR`·`RL`) |
| `nodeGap` | `40` | 같은 층 노드 사이. 격자 칸 사이도 이 값 |
| `rankGap` | `60` | 층 사이. 격자를 선 묶음 아래에 둘 때 띄우는 거리도 이 값 |
| `origin` | `{x:0, y:0}` | 결과의 가장 왼쪽 위. 지금 그림 자리를 지키려면 지금 노드들의 최소 x·y 를 준다 |
| `isolated` | `"rank"` | 선이 없는 노드. `"grid"` 면 선 묶음 아래 격자(관계 없는 표가 많은 ERD) |
| `gridColumns` | `ceil(sqrt(n))` | `"grid"` 의 열 수 |

- 같은 id 는 처음 것만 쓴다. 자기 선·모르는 끝·같은 선 반복은 무시한다. 크기가 0·NaN 이면 1 로 본다.
- 같은 입력이면 같은 결과다. 노드·선 순서를 정해서(예: 이름 순) 넘기면 다시 눌러도 그림이 흔들리지 않는다.

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

## 글자 단추 (TextToolButton)

툴바에 "표 추가"·"관계 ▾" 처럼 글자가 보이는 단추를 놓을 때 쓴다. 아이콘만 있는 단추는 `ToolButton`(26×26 정사각형, aria-label + CSS 툴팁)이고, 글자가 보이는 단추는 `TextToolButton`(공용 Button size sm)이다. 고르는 기준: 단추 하나에 보여 줄 글이 짧은 낱말이면 `TextToolButton`, 아이콘으로 뜻이 통하면 `ToolButton`.

```tsx
import { TextToolButton } from "@dk-oasis/shared/react-flow";

<TextToolButton className="my-toolbar__txt" label="표 추가" tip="표 추가 (2)" pressed={tool === "table"} testId="tool-table" onClick={() => setTool("table")} />
<TextToolButton label="컬럼 추가" tip="컬럼 추가 — 표를 먼저 고르세요" disabled={!one} testId="tool-addcol" onClick={addColumn} />
<TextToolButton label="관계 ▾" menu open={menuAt !== null} testId="tool-relmenu" onClick={openMenu} />
```

켜진 단추는 `tip` 을 단추 `title` 로 단다(단축키 안내). 꺼지면 감싼 span 의 `title` 로 이유를 보이고(꺼진 단추는 마우스 이벤트를 못 받는다), 보이지 않는 글 + `aria-describedby` 로 보조기기에도 읽힌다(`<testId>-reason`). 토글 도구는 `pressed` 로 `aria-pressed` 를, 메뉴를 여는 단추는 `menu`·`open` 으로 `aria-haspopup="menu"`·`aria-expanded` 를 단다(menu 이면 `aria-pressed` 는 달지 않는다).

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `label` | `string` | 필수 | 단추 글 |
| `tip` | `string` | `label` | 켜짐: 단추 title, 꺼짐: span title + 이유 글. 꺼진 이유는 "할 일 — 짧은 이유" 꼴로 쓴다 |
| `disabled` | `boolean` | `false` | 꺼짐 |
| `pressed` | `boolean` | — | 눌림. primary 색 + `aria-pressed` |
| `menu` | `boolean` | — | 메뉴 단추 ARIA |
| `open` | `boolean` | — | menu 일 때 `aria-expanded` |
| `onClick` | `(e) => void` | — | 누르기. 메뉴 위치는 `e.currentTarget` 으로 잡는다 |
| `testId` | `string` | — | 단추 data-testid. 이유 글은 `<testId>-reason` |
| `className` | `string` | — | 감싼 span 에 붙을 클래스(단추 간격 등) |

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 화면에서 `@xyflow/react` 를 직접 import | `@dk-oasis/shared/react-flow` 에서 가져온다. 스타일시트도 여기서 한 번 불러온다 |
| 화면에 `.css` 를 만들어 메뉴·찾기 위젯 모양을 덮음 | 화면 노드·선 규칙은 화면이 `<style href precedence>` 로 넣는다(Local-Rules §17). 부품 모양을 바꿔야 하면 shared 를 고친다(승인 뒤) |
| `import { Box } from "@dk-oasis/shared/react-flow"` 로 스냅 상자를 기대함 | 스냅 상자는 `SnapBox` 다. `Box` 는 xyflow 형식이다 |
| 글자 단추를 `Button` + `title` + 숨김 글로 화면마다 직접 만듦 | `TextToolButton` 을 쓴다. 꺼짐 이유 안내가 이미 들어 있다 |
| 단축키 표를 화면마다 처음부터 씀 | `[...CANVAS_SHORTCUTS, …화면 전용]` 로 잇는다 |
| 화면에서 `@dagrejs/dagre` 를 직접 import 해 배치를 짬 | 업무와 무관한 배치는 `autoLayout` 을 쓴다. 노드 크기·선 고르기만 화면이 정한다 |
| dagre 결과(가운데 좌표)를 `node.position` 에 그대로 넣음 | `autoLayout` 은 이미 왼쪽 위 좌표를 준다 |
