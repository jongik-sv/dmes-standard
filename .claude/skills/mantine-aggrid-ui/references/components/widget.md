# 위젯 (WidgetWorkspace · WidgetBoard · WidgetFrame · WidgetTabs · WidgetPicker)

사용자가 위젯(조각 프로그램)을 24칸 격자에서 자유롭게 옮기고 크기를 바꾸며, 탭으로 나눠 서버에 저장하게 하는 홈 화면을 만들 때 쓴다. 행 단위 대시보드가 필요하면 [dashboard](dashboard.md), 사용자가 자유 배치·탭·서버 저장을 쓰면 widget 을 고른다.

- import: `import { WidgetWorkspace, WidgetBoard, WidgetFrame, WidgetTabs, WidgetPicker, WidgetStyle, useWidgetStatus, useWidgetBodySize, WidgetHeaderActions, WidgetTitleExtra, type WidgetWorkspaceProps, type WidgetBoardProps, type WidgetFrameProps, type WidgetTabsProps, type WidgetPickerProps, type WidgetMeta, type WidgetProps, type WidgetItem, type WidgetTab, type WidgetStore, type WidgetRegistry, type WidgetRegistryEntry, type WidgetStatus } from "@dk-oasis/shared/widget";` (CSS import 없음 — 컴포넌트가 `<WidgetStyle />` 로 자기 스타일을 넣는다)
- 소스: `src/frontend/shared/src/widget/` (`WidgetWorkspace.tsx`·`WidgetBoard.tsx`·`WidgetFrame.tsx`·`WidgetTabs.tsx`·`WidgetPicker.tsx`·`frame-context.ts`·`widget-layout.ts`(순수 함수)·`types.ts`·`constants.ts`·`styles.tsx`)
- 내부 구현: 격자는 react-grid-layout 2.x, 나머지는 일반 `div`/`button`. Mantine 을 쓰지 않는다. 색·간격은 공통 토큰만 쓴다
- Part B 허용 목록(§1): `widget` SHOULD.

## 언제 쓰나

- 쓴다: 사용자가 위젯을 골라 놓고 옮기며 탭별로 서버에 저장하는 포털 홈.
- 쓰지 않는다: 행·카드 순서를 브라우저에만 저장하는 현황 화면 → [dashboard](dashboard.md). 목록 + 상세 같은 업무 화면 → [ContentBody](content-body.md).
- 위젯 본문 안의 목록은 [AgDataGrid](ag-data-grid.md) `height="auto"`, 상태 표지는 [Badge](badge.md) 를 넣는다.

## 표준 사용

위젯 하나는 폴더 하나(`widget.meta.ts` + `widget.tsx`)다. 등록부(`WidgetRegistry`)는 화면(m-mcm)이 코드 생성으로 만들고, 작업 공간에는 등록부·기본 배치·저장소를 넘긴다.

```tsx
import { WidgetWorkspace, type WidgetStore } from "@dk-oasis/shared/widget";

import { HOME_DEFAULT_LAYOUT } from "./home-layout";
import { WIDGET_REGISTRY } from "@/lib/generated/widget-registry";

export default function HomePage({ store, userId }: { store: WidgetStore; userId: string }) {
  return <WidgetWorkspace registry={WIDGET_REGISTRY} homeDefault={HOME_DEFAULT_LAYOUT} store={store} userId={userId} />;
}
```

위젯 본체는 `default export` 로 `WidgetProps` 를 받는 컴포넌트다. 틀 훅으로 상태를 알린다.

```tsx
import { useWidgetStatus, WidgetHeaderActions, type WidgetProps } from "@dk-oasis/shared/widget";

export default function NoticeWidget({ refreshKey }: WidgetProps) {
  const setStatus = useWidgetStatus();
  // refreshKey 가 바뀌면 다시 조회하고 setStatus({ kind: "loading" | "ready" | "error", ... }) 로 알린다
  return <WidgetHeaderActions>{/* 제목 줄 버튼 */}</WidgetHeaderActions>;
}
```

## 편집 흐름

- [배치 편집]은 24칸(≥1200px)에서만 켜진다. 좁은 화면·잠긴 탭·불러오기 실패면 비활성이고 안내 제목이 붙는다.
- [완료]는 편집을 시작한 뒤 바뀐 탭만 `store.saveTab` 한다. 저장이 실패하면 편집 모드와 변경을 유지하고 알린다(탭 여러 개면 저장된 탭은 [취소]로 되돌리지 않고, 다시 [완료]하면 실패한 탭만 저장한다). 불러오기가 끝나지 않았거나 실패한 상태에서는 [완료]가 막힌다. [취소]는 바뀐 것이 있으면 확인 뒤 되돌린다. 편집 중 Escape 는 [취소]와 같다.
- 보기 모드 탭 메뉴 작업(이름 바꾸기·잠금·왼쪽/오른쪽·지우기·홈 기본 배치로 되돌리기)은 바로 저장하며, 실패하면 화면을 원래대로 되돌린다.
- (+) 새 탭은 편집 모드로 들어가고 [취소]하면 사라진다.

## Props

WidgetWorkspaceProps

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| registry | `WidgetRegistry` | 필수 | 위젯 ID → `{ meta, load }`. 코드 생성물. 모듈 상수나 `useMemo` 로 안정된 참조를 넘긴다 |
| homeDefault | `readonly WidgetItem[]` | 필수 | 저장한 「홈」이 없을 때의 기본 배치. 안정된 참조를 넘긴다 |
| store | `WidgetStore` | 필수 | 서버 저장소(아래 계약). 안정된 참조를 넘긴다 |
| userId | `string \| null` | - | 있으면 마지막 탭을 `localStorage` `dmes:widget:lastTab:{userId}` 에 기억 |
| confirm | `(title, message) => Promise<boolean>` | - | 없으면 `useMessage` 확인 창 |
| notify | `(message, kind: "success" \| "error") => void` | - | 없으면 `useMessage` 토스트 |
| boardWidth | `number` | - | 시험용 고정 폭(px). 보드에 넘기는 픽셀 폭 |
| workspaceWidth | `number` | - | 시험용 고정 폭(px). 서랍 자리까지 포함한 바깥 폭 — 칸 수·편집 가능 판정에 쓴다(칸 수는 서랍 열림에 흔들리지 않는다) |
| testId | `string` | - | 뿌리 `data-testid` |

WidgetBoardProps: `items`·`registry`·`editing`·`tabLocked`(필수), `onChange(items)`(필수), `onWideChange?(wide)`(안정된 함수를 넘긴다 — effect 의존성에 들어간다), `cols?: 24 | 12 | 1`(칸 수를 바깥에서 정함, 없으면 보드 자기 폭으로 판정), `width?`(고정 폭), `testId?`.

WidgetFrameProps: `item`·`entry`(`undefined` 면 「없는 위젯」 칸)·`editing`·`onToggleLock`·`onRemove`(필수), `sizeLabel?`·`onKeyMove?`. 제목 줄(제목·부제·새로 고침·화면 열기·잠금·빼기), 로딩 틀, 오류 경계를 그린다.

WidgetTabsProps: `tabs`·`activeTabId`·`editing`·`renamingTabId`·`onSelect`·`onAdd`·`onRenameStart`·`onRenameCommit`(오류 문구를 돌려주면 입력 칸 유지)·`onRenameCancel`·`onToggleLock`·`onMove`·`onDelete`·`onResetHome`, 선택 `menuDisabled`·`trailing`.

WidgetPickerProps: `registry`·`items`·`onAdd(widgetId)`. [위젯 추가] 서랍 — 검색·눌러 추가·격자로 끌어 놓기. 이미 놓인 위젯(`multiple: false`)과 탭 한도(30개)는 막는다.

WidgetMeta: `id`(`"{모듈}.{이름}"`, 저장 키)·`title`·`defaultSize`(필수), `subtitle`·`description`·`minSize`(기본 `{ w: 4, h: 6 }`)·`maxSize`·`refreshSec`(30 미만이면 30)·`linkPageId`·`multiple`(기본 true)·`bodyPadding`(기본 true).

WidgetProps(위젯 본체가 받는 값): `instanceId`·`size`·`config`(A 단계에서는 늘 `null`)·`refreshKey`(바뀌면 다시 조회).

틀 훅: `useWidgetStatus()` → `(status: WidgetStatus) => void`, `useWidgetBodySize()` → `{ width, height }`, `<WidgetHeaderActions>`(제목 줄 오른쪽 버튼 자리), `<WidgetTitleExtra>`(제목 옆 동적 부제·배지).

WidgetStore 계약(화면이 서버 서비스로 구현해 주입, 실패는 `Error(message)` 로 던진다)

| 메서드 | 역할 |
|---|---|
| `load(): Promise<WidgetTab[]>` | 사용자 탭 전체. 「홈」을 저장한 적 없으면 결과에 `home` 이 없다 |
| `saveTab(tab)` | 탭 하나를 통째로 바꾼다(없으면 만든다) |
| `deleteTab(tabId)` | 탭을 지운다 |
| `reorderTabs(tabIds)` | 「홈」을 뺀 탭 ID 를 새 순서로 |
| `resetHome()` | 사용자 「홈」 배치를 지운다(다음부터 기본 배치) |

순수 함수(`widget-layout.ts`, 화면이 직접 부를 일은 드물다): `sanitizeLayout`·`reflowLayout`·`colsForWidth`·`minSizeOf`·`maxSizeOf`(격자 정리·칸 수·크기 범위), `addItem`·`removeItem`·`toggleLock`·`canAddWidget`(위젯 추가·빼기·잠금·한도), `itemsEqual`·`tabsEqual`(변경 비교), `validateTabName`·`nextTabId`·`homeTab`·`newInstanceId`(탭·ID), `validateWidgetMeta`(등록부 메타 검사). `openPortalPage(pageId)` 는 `portal-open-tab` 이벤트로 포털 탭을 여는 함수이며 틀의 「화면 열기」가 쓴다.

## 표준값: 모든 화면 동일

- 격자: 넓은 화면(≥1200px) 24칸, 중간(≥768px) 12칸, 좁은 화면 1칸. 세로 한 칸 20px, 간격 8px. 저장은 넓은 화면 배치 하나뿐이고 중간·좁은 화면은 다시 흘린 배치를 보기 전용으로 보인다.
- 한도: 탭 사용자당 10개, 위젯 탭당 30개, 탭 이름 1~20자(사용자 안 중복 금지). 「홈」 탭은 ID `home`, 늘 첫 자리이고 지우기·이름 바꾸기가 안 된다.
- 위젯 최소 크기 기본 `{ w: 4, h: 6 }`, 크기 조절 손잡이 8방향.
- 서버에서 받은 배치는 `sanitizeLayout` 이 정리한다(격자 밖·겹침·최소 크기 미만·중복 instId). 등록부에 없는 위젯 ID 는 보기 모드에서 숨기고 편집 모드에서 「없는 위젯」 칸으로 보여 준다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `store`·`homeDefault`·`registry` 를 렌더마다 새로 만들어 넘긴다 | 참조가 바뀌면 작업 공간이 다시 불러오며 편집 중이던 변경이 사라지고 편집 모드가 끝난다. 모듈 상수나 `useMemo` 로 안정된 참조를 넘긴다 |
| `onWideChange` 에 렌더마다 새 화살표 함수를 넘긴다 | 보드가 effect 의존성으로 쓴다. `useCallback` 이나 `setState` 함수를 넘긴다 |
| 위젯 본체가 자기 제목 줄을 그린다 | 틀(`WidgetFrame`)이 그린다. 고유 버튼은 `WidgetHeaderActions`, 부제는 `WidgetTitleExtra` |
| 위젯 `id` 를 나중에 바꾼다 | 저장 키라서 사용자 배치에서 그 위젯이 빠진다. 새 ID 로 만들고 옛 것은 한동안 둔다 |
| shared `widget` 소스에 Mantine 컴포넌트를 import 한다 | 시험에 MantineProvider 가 없다. `<button>` + `WIDGET_CSS` 클래스로 만든다(위젯 본체를 만드는 화면은 shared 래퍼를 쓴다) |
| `WidgetStore.load` 가 실패를 빈 배열로 돌려준다 | 던져야 한다. 빈 배열이면 작업 공간이 빈 상태를 저장해 사용자 배치를 지울 수 있다(던지면 [배치 편집]이 막힌다) |
| `userId` 를 요청 본문에 실어 저장소로 보낸다 | 서버가 `SecurityIdentity` 로만 얻는다. 저장소 구현에서 userId 를 보내지 않는다 |
| 위젯 컴포넌트 시험에 `@testing-library` 를 쓴다 | `createRoot` + `act` 를 쓴다(shared 시험 관례) |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/home/`: `WidgetWorkspace` 에 `WIDGET_REGISTRY`(`lib/generated/widget-registry.ts`)·`HOME_DEFAULT_LAYOUT`(`home-layout.ts`)·`secWidget` 저장소(`widget-store.ts`)를 넘기는 포털 홈.
- `src/frontend/m-mcm/widgets/home/{이름}/`: `widget.meta.ts` + `widget.tsx` 로 이루어진 홈 위젯 11개.
