# 위젯 도크 (PortalShell widgetDock · WidgetDockLayer · DockToolsMenu · useWidgetDock)

포털 머리 「도구」 버튼으로 `floatable` 위젯(계산기·단위 변환·메모)을 업무 화면 위 떠 있는 창으로 띄울 때 쓴다. 창은 여러 개·이동·크기 조절·접기(아이콘)가 되고, 탭을 바꿔도 남으며 사용자별로 저장한다. 화면(m-*)은 이 부품을 직접 쓰지 않는다 — 포털 호스트가 `PortalShell` 에 `widgetDock` 을 넘기면 셸이 그린다.

- import: `import { PortalShell, WidgetDockLayer, DockToolsMenu, useWidgetDock, useDockableEntries, createBrowserDockStore, type PortalShellWidgetDock, type DockWindow, type WidgetDockStore, type DockRegistryStatus, type DockViewport, type WidgetDockApi, type UseWidgetDockOptions, type WidgetDockLayerProps, type DockToolsMenuProps, type OpenDockResult } from "@dk-oasis/shared/portal-shell";` (CSS import 없음 — 부품이 `<WidgetDockStyle />` 로 자기 스타일을 넣는다)
- 소스: `src/frontend/shared/src/widget-dock/` (`types.ts`·`dock-model.ts`(순수 함수)·`browser-dock-store.ts`·`use-widget-dock.ts`·`FloatingWindow.tsx`·`WidgetDockLayer.tsx`·`DockToolsMenu.tsx`·`styles.tsx`), 셸 연결 `src/frontend/shared/src/portal-shell/portal-shell.tsx`(`widgetDock`)·`header/Header.tsx`(`toolsSlot`)
- 내부 구현: 창은 [FloatingWindow](floating-window.md), 본문은 위젯 틀(`WidgetFrame`, 보기 모드), 「도구」 메뉴는 Mantine `Menu`. 색·간격은 공통 토큰만 쓴다
- 진입점: 별도 서브패스 없이 `portal-shell` 진입점으로 낸다(2026-10-05 위젯 도크 회차).

## 언제 쓰나

- 쓴다: 포털 호스트(m-mcm `app/portal/page.tsx`)가 도구 창 기능을 켤 때. 위젯 메타(코드 위젯 `meta.floatable` 또는 유형 `type.meta.ts` 의 `floatable: true`)로 띄울 위젯을 정한다. 접힌 단추 아이콘은 `meta.icon`(유형은 `type.meta.ts` 의 `icon`, tabler 아이콘 컴포넌트)으로 정하고, 없으면 제목 첫 글자를 보인다.
- 쓰지 않는다: 홈 보드에 위젯을 놓기 → [widget](widget.md) 의 `WidgetWorkspace`. 위젯이 아닌 아무 내용의 떠 있는 창 → [FloatingWindow](floating-window.md).

## 표준 사용

호스트는 홈과 같은 방식으로 실행 시 등록부를 만들고, 틀(`WidgetFrame`)을 **`@dk-oasis/shared/widget` 에서 가져와** 함께 넘긴다.

```tsx
import { PortalShell } from "@dk-oasis/shared/portal-shell";
import { WidgetFrame } from "@dk-oasis/shared/widget";

<PortalShell
  /* …기존 props… */
  widgetDock={{ registry, registryStatus, frame: WidgetFrame }} // store 를 빼면 브라우저 저장(사용자 ID 키)
/>
```

- `registry`·`registryStatus` 는 `mergeWidgetRegistry(WIDGET_REGISTRY, WIDGET_TYPE_REGISTRY, defRows, prev)` 와 widgetDef/list 조회 상태다(m-mcm `app/portal/use-dock-registry.ts`). 계산기·메모 같은 유형 기반 정의 위젯은 정의 조회가 끝나야 등록부에 생기므로, 그 전에는 `"loading"` 을 넘겨야 저장된 창이 지워지지 않는다.
- 저장소를 서버로 바꿀 때는 `WidgetDockStore`(`load(): Promise<DockWindow[]>`, `save(windows)`)를 구현해 `store` 로 넘긴다. 1차 구현은 `createBrowserDockStore(userId)`(키 `dockStorageKey(userId)` = `${DOCK_STORAGE_PREFIX}.${userId}`, 값은 `{ version: 1, windows }`, 읽기는 `parseDockWindows` 로 검사).

### 셸이 하는 일

- 사용자 확인: `useCurrentUserState(enabled)` — 셸의 `/api/auth/me` 요청을 함께 쓴다. 사용자 없음·로그아웃 중(`loggingOutRef`)에는 불러오지도 저장하지도 않는다.
- 상태: `useWidgetDock({ enabled, userId, registry, registryStatus, store, isSaveBlocked })` — 불러오기, 조작 뒤 `DOCK_SAVE_DELAY_MS`(400ms) 디바운스 저장, 언마운트·사용자 바뀜·`pagehide` 때 남은 저장. 등록부가 `ready` 면 `sanitizeDockWindows` 로 없는·사용 중지·floatable 아닌 위젯 창을 정리해 저장한다.
- 머리: `Header toolsSlot` 에 `DockToolsMenu`(목록은 `useDockableEntries(registry)` = `listDockableEntries`, 제목순).
- 창 층: `WidgetDockLayer` 를 AppShell 최상위(탭 슬롯 바깥)에 둔다. `position: fixed; inset: 0; pointer-events: none`, z-index `WIDGET_DOCK_Z_INDEX`(160 — 사이드바 컨테이너가 z 150 쌓임 맥락이라 폭 조절 손잡이가 창 위로 새지 않고, Mantine 모달 200·팝오버 300 아래. 탭 화면 안 드롭다운은 z 1000 이라 창 위에 보인다). 접힌 아이콘은 `dockStackOrder` 로 펼친 창들보다 항상 위에 그린다. 화면 크기는 창이 있을 때만 층이 rAF 로 구독한다. 등록부에 아직 없는 창은 그리지 않고 상태에만 남긴다.

### 화면 문맥 전달(2026-10-06)

`WidgetDockLayer` 의 `activeTabId`(셸이 활성 탭 id 를 넘긴다)로 활성 업무 탭이 게시한 화면 문맥(그리드 선택 행 등)을 위젯 본체 `WidgetProps.screenContext` 로, 그 탭의 받기 처리기를 `screenApply` 로 내린다. 탭을 바꾸면 그 탭의 것으로 바뀌고 게시가 없으면 null·`available=false` 다. 보드(`WidgetFrame` 을 직접 쓰는 곳)는 null 이다. 계약·훅은 [screen-context](screen-context.md).

### 순수 함수(dock-model)

| 함수 | 하는 일 |
|---|---|
| `isDockMenuEntry(entry)` | 새로 띄울 수 있음 — 사용 중지가 아니고 배치 해석(`resolveWidgetPlacement`)이 도구 창을 허용(A·B 는 floatable 무관, W 는 막음, 배치 없으면 floatable) |
| `isDockableEntry(entry)` | 창을 그리고 저장값에 남길 수 있음 — 위 조건이거나 배치 W(이미 열린 창은 W 로 바꿔도 닫지 않음, 새로는 못 염) |
| `listDockableEntries(registry)` | 「도구」 메뉴 항목(`isDockMenuEntry`)을 제목순(한국어) |
| `windowSizeFor(meta)` | `defaultSize` 칸 → px(`DOCK_CELL_PX` 가로 40·세로 30), 최소 `DOCK_MIN_SIZE` 220×160 |
| `dockItemSize(win)` | 창 px → 위젯 본체 `size`(칸) |
| `openDockWindow(windows, entry, viewport)` | 새 창(오른쪽 위 계단식, 맨 앞) → `{ kind: "opened" }`. `multiple === false` 이고 열려 있으면 펼쳐 앞으로 → `"focused"`. 창 `DOCK_MAX_WINDOWS`(8)개면 `"limit"` |
| `stableDockWindowId(widgetId)` · `dockWindowSlotId(widgetId, slot)` | 창 ID 는 위젯·자리마다 고정 — 첫 창 `dk-{위젯ID}-{해시}`, 같은 위젯 두 번째부터 `…-2`~`…-8`(빈 첫 자리). 모두 `DOCK_WINDOW_ID_PATTERN`(`[A-Za-z0-9_-]{1,40}`) |
| `clampDockWindow(win, viewport)` | 그릴 때만 쓰는 표시용 자르기 — 크기·위치를 화면 안으로(접혔으면 `DOCK_ICON_SIZE` 44 기준). 저장 w·h 는 줄이지 않는다 |
| `placeDockWindow(win, viewport)` | 옮기기·접기·열기에 쓰는 위치 맞춤 — 저장 w·h 는 그대로 두고 x·y 만 화면 안으로 |
| `dockStackOrder(windows)` | 그리는 순서 — 접힌 아이콘이 펼친 창 위 |
| `readDockViewport()` · `useDockViewport()` | 화면 크기 읽기. 앞은 조작 순간에 한 번 읽고, 뒤는 rAF 로 묶어 구독하는 훅(창 층 안에서만 쓴다 — 셸에서 구독하면 Header·Sidebar 가 다시 그려진다) |
| `bringDockWindowToFront` · `toggleDockCollapse` · `closeDockWindow` · `moveDockWindow` · `resizeDockWindow` | 맨 앞(쌓임 1..n 재번호)·접기 토글(펼치면 앞으로)·닫기·옮기기·크기 |
| `sanitizeDockWindows(windows, registry, status)` | ID 겹침·한도는 늘, 등록부 판단은 `ready` 일 때만 |

바뀐 것이 없으면 모두 들어온 배열·객체를 그대로 돌려준다.

## Props

`PortalShellWidgetDock`(`PortalShell` 의 `widgetDock`):

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| registry | `WidgetRegistry` | 필수 | 실행 시 위젯 등록부 |
| registryStatus | `"loading" \| "ready" \| "error"` | 필수 | 등록부 준비 상태. `ready` 일 때만 저장된 창을 정리 |
| frame | `ComponentType<WidgetFrameProps>` | 필수 | `@dk-oasis/shared/widget` 의 `WidgetFrame` |
| store | `WidgetDockStore` | 브라우저 저장 | 사용자별 창 배치 저장소 |

`DockWindow`: `id`(본체 `instanceId`)·`widgetId`·`x`·`y`·`w`·`h`(px)·`collapsed`·`z`.

## 표준값: 모든 화면 동일

- 창 8개 한도, 칸당 40×30px, 최소 220×160, 아이콘 44px, 저장 지연 400ms, z-index 160.
- 「도구」 메뉴 문구: 머리 「도구」, 메뉴 머리 「업무 화면 위에 띄우기」, 한도 안내 「창은 8개까지 띄울 수 있습니다.」.
- 창 ID = 위젯 본체 `instanceId`. 메모처럼 instanceId 로 서버에 저장하는 위젯은 자리 ID 가 고정이라 닫았다 다시 열어도 같은 내용이고, 서버 행은 위젯당 최대 8개다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `frame` 을 빼거나 셸 안에서 `WidgetFrame` 을 직접 import | shared 는 진입점마다 따로 묶여(tsup `splitting: false`) 틀 컨텍스트가 위젯 본체와 갈린다 — 본체의 `useWidgetTitle`·`useWidgetStatus` 가 동작하지 않는다. 호스트가 `@dk-oasis/shared/widget` 의 것을 넘긴다 |
| 정의 조회 전에 `registryStatus: "ready"` 를 넘김 | 계산기·메모 창이 「없는 위젯」으로 정리돼 저장값에서 사라진다. 조회 상태를 그대로 넘긴다 |
| 창마다 무작위 ID 로 새로 만듦 | 메모가 다시 열 때마다 빈 칸이 되고 서버 행이 쌓인다(사용자당 100개 한도). `openDockWindow` 를 쓴다(자리 고정 ID) |
| 사용자 확인 전·로그아웃 중에도 저장 | 셸이 `userId` 가 비면 끄고 `isSaveBlocked` 로 막는다. 따로 저장 코드를 두지 않는다 |
| 화면 모듈에서 `FloatingWindow` 로 위젯을 직접 띄움 | 위젯은 셸 도크가 띄운다. 화면은 위젯 메타 `floatable` 만 정한다 |

## 실제 사용 예

- `src/frontend/m-mcm/app/portal/use-dock-registry.ts`: 홈과 같은 등록부 합치기 + `onWidgetDefsChanged` 재조회, `frame: WidgetFrame`.
- `src/frontend/m-mcm/app/portal/page.tsx`: `PortalShell widgetDock={useDockRegistry()}`.
