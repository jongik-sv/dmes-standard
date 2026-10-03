# 위젯 (WidgetWorkspace · WidgetBoard · WidgetFrame · WidgetTabs · WidgetPicker)

사용자가 위젯(조각 프로그램)을 24칸 격자에서 자유롭게 옮기고 크기를 바꾸며, 탭으로 나눠 서버에 저장하게 하는 홈 화면을 만들 때 쓴다(관리자 정의 위젯·사용 중지·기본 배치 편집 포함). 행 단위 대시보드가 필요하면 [dashboard](dashboard.md), 사용자가 자유 배치·탭·서버 저장을 쓰면 widget 을 고른다.

- import: `import { WidgetWorkspace, WidgetBoard, WidgetFrame, WidgetTabs, WidgetPicker, WidgetStyle, useWidgetStatus, useWidgetBodySize, WidgetHeaderActions, WidgetTitleExtra, mergeWidgetRegistry, toWidgetDefRow, type WidgetWorkspaceProps, type WidgetBoardProps, type WidgetFrameProps, type WidgetTabsProps, type WidgetPickerProps, type WidgetMeta, type WidgetProps, type WidgetItem, type WidgetTab, type WidgetStore, type WidgetRegistry, type WidgetRegistryEntry, type WidgetStatus, type WidgetDefRow, type WidgetTypeRegistry, type WidgetTypeMeta, type WidgetTypeEditorProps } from "@dk-oasis/shared/widget";` (CSS import 없음 — 컴포넌트가 `<WidgetStyle />` 로 자기 스타일을 넣는다)
- 소스: `src/frontend/shared/src/widget/` (`WidgetWorkspace.tsx`·`WidgetBoard.tsx`·`WidgetFrame.tsx`·`WidgetTabs.tsx`·`WidgetPicker.tsx`·`frame-context.ts`·`widget-layout.ts`(순수 함수)·`widget-registry.ts`(등록부 합치기 순수 함수)·`types.ts`·`constants.ts`·`styles.tsx`)
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

## 정의 위젯·유형

위젯은 두 갈래다(스펙 `docs/superpowers/specs/2026-10-02-widget-admin-generic-design.md` §1).

| 갈래 | ID | 본체 | 메타 출처 |
|---|---|---|---|
| 코드 위젯 | `{group}.{name}` (예: `home.notice`) | `widgets/{group}/{name}/widget.tsx` | `widget.meta.ts` + DB 덮어쓰기 행(`srcTp: "C"`) |
| 정의 위젯 | `def.{key}` (예: `def.k3x9q2ab`) | 위젯 **유형**의 렌더러 `widget-types/{typeId}/renderer.tsx` | DB 정의 행(`srcTp: "D"`) |

- 위젯 유형 하나 = m-mcm `widget-types/{typeId}/` 폴더 하나(`type.meta.ts` 의 `WidgetTypeMeta` + `renderer.tsx` + `editor.tsx`). 생성기가 `WIDGET_TYPE_REGISTRY`(`WidgetTypeRegistry`)를 만든다. 렌더러는 `WidgetProps.definition`(정의 설정)을 받아 그리고, 편집기는 관리 화면에서 `WidgetTypeEditorProps`(`value`·`onChange`·`onValidate?`)를 받는다.
- 화면은 코드 등록부 + 유형 등록부 + `widgetDef/list` 행을 `mergeWidgetRegistry` 로 합친 **실행 시 등록부**를 작업 공간에 넘긴다. 정의 목록을 받는 동안·실패하면 `registryStatus` 로 알려 편집 진입로([배치 편집]·(+) 새 탭)를 막는다 — 정의 위젯이 「없는 위젯」으로 보이는 상태에서 저장하면 사용자 탭에서 지워지기 때문이다.

```tsx
import { mergeWidgetRegistry, toWidgetDefRow, WidgetWorkspace, type WidgetDefRow } from "@dk-oasis/shared/widget";

import { WIDGET_REGISTRY } from "@/lib/generated/widget-registry";
import { WIDGET_TYPE_REGISTRY } from "@/lib/generated/widget-type-registry";

const TYPE_TITLES = Object.fromEntries(Object.values(WIDGET_TYPE_REGISTRY).map((t) => [t.meta.id, t.meta.title]));

function Home({ store, rawDefs, status, retry }: Props) {
  // rawDefs: widgetDef/list 응답 줄(configJson 문자열 포함). 응답 전·실패면 [].
  const defs = useMemo(() => rawDefs.map(toWidgetDefRow).filter((r): r is WidgetDefRow => r !== null), [rawDefs]);
  const registry = useMemo(() => mergeWidgetRegistry(WIDGET_REGISTRY, WIDGET_TYPE_REGISTRY, defs), [defs]);
  return (
    <WidgetWorkspace
      registry={registry}
      homeDefault={HOME_DEFAULT_LAYOUT}
      store={store}
      registryStatus={status} // "loading" | "ready" | "error"
      onRetryRegistry={retry}
      typeTitles={TYPE_TITLES}
    />
  );
}
```

`mergeWidgetRegistry` 규칙: 코드 위젯 + 덮어쓰기 행 → 행의 비어 있지 않은 값이 코드 메타를 덮고 `useYn: "N"` 이면 `disabled: true`. 덮어쓰기 행만 있고 코드 위젯이 없으면 넣지 않는다. 정의 행은 유형이 등록부에 있으면 `kind: "def"`·`typeId` 메타와 렌더러에 `definition` 을 끼운 `load` 로 넣고, 유형이 없으면 넣지 않고 콘솔 경고. 코드 위젯을 덮어쓰지 않으면 원래 entry 객체를 그대로 돌려줘 틀의 지연 로딩 캐시가 유지된다.

## 사용 중지 칸

- 관리자가 사용 중지한 위젯(`meta.disabled`)은 **등록부에 남는다**(저장할 때 사용자 배치에서 지워지지 않는다). 등록부에 아예 없는 「없는 위젯」과 다르다.
- 서랍(`WidgetPicker`)에 보이지 않고 `canAddWidget` 도 거절한다(끌어 놓기·추가 경로 모두).
- 이미 놓인 자리는 보기·편집 모드 모두 자리를 지키고 「사용 중지된 위젯입니다」 빈 칸(`data-widget-disabled="true"`, 회색 점선 테두리)을 그린다. 본체 `load()` 를 부르지 않고, 제목 줄에는 제목만 있다(새로 고침·화면 열기·자동 새로 고침 없음). 편집 모드의 잠금·✕ 는 평소와 같다(잠기면 ✕ 비활성). 다시 사용하면 내용이 돌아온다.

## 관리자 단일 탭(singleTab)

`singleTab={{ title }}` 이면 탭 줄 대신 제목을 굵게 보이고 「홈」 탭 하나만 다룬다 — 위젯관리 화면의 전사·부서 기본 배치 편집용. `store.load()` 결과에서 `home` 만 쓰고(없으면 `homeDefault`), [완료]는 `store.saveTab({ tabId: "home", … })` 한 번이다. 탭 메뉴·(+) 새 탭·마지막 탭 기억(localStorage)은 없다. 저장소는 같은 `WidgetStore` 계약을 구현한 어댑터로 붙인다(`saveTab`→기본 배치 저장, 쓰지 않는 메서드는 Error).

```tsx
<WidgetWorkspace
  key={layoutKey} // 배치 키가 바뀌면 다시 마운트
  singleTab={{ title: "전사 기본 배치" }}
  registry={registry}
  homeDefault={HOME_DEFAULT_LAYOUT}
  store={layoutStore}
  typeTitles={TYPE_TITLES}
/>
```

## 편집 흐름

- [배치 편집]은 24칸(≥960px, 서랍 자리를 포함한 작업 공간 폭 기준)에서만 켜진다. 좁은 화면·잠긴 탭·불러오기 실패·정의 목록 불러오는 중(「위젯 목록을 불러오는 중입니다」)·정의 목록 실패(「위젯 정의를 불러오지 못했습니다」)면 비활성이고 안내 제목이 붙는다. 정의 목록이 불러오는 중·실패면 (+) 새 탭도 비활성이고 탭 메뉴(⋯)는 숨는다((+)도 편집 모드로 들어가는 길이라서다. 불러오기 실패 때와 같은 모양). 정의 목록 실패면 탭 줄 위에 띠와 [다시 시도](`onRetryRegistry` 가 있을 때)가 보이고, 편집 중에 정의 목록이 준비 상태가 아니게 되면 [완료]가 막힌다.
- [완료]는 편집을 시작한 뒤 바뀐 탭만 `store.saveTab` 한다. 저장이 실패하면 편집 모드와 변경을 유지하고 알린다(탭 여러 개면 저장된 탭은 [취소]로 되돌리지 않고, 다시 [완료]하면 실패한 탭만 저장한다). 불러오기가 끝나지 않았거나 실패한 상태에서는 [완료]가 막힌다. [취소]는 바뀐 것이 있으면 확인 뒤 되돌린다. 편집 중 Escape 는 [취소]와 같다. 저장하는 동안에는 보드 편집·서랍·[취소]·Escape·(+) 새 탭·탭 메뉴(이름 바꾸기)가 멈춘다(입력 칸·메뉴·확인 창 안의 Escape 는 각자 처리한다). 서랍에서 눌러 추가한 위젯으로는 스크롤한다.
- 보기 모드 탭 메뉴 작업(이름 바꾸기·잠금·왼쪽/오른쪽·지우기·홈 기본 배치로 되돌리기)은 바로 저장하며, 실패하면 화면을 원래대로 되돌린다.
- (+) 새 탭은 편집 모드로 들어가고 [취소]하면 사라진다. 그래서 [배치 편집]처럼 저장 중·불러오기 실패·정의 목록 불러오는 중·실패면 막힌다.
- [PDF](`pdfTarget` 을 줄 때)는 편집 중에 자리를 지킨 채 비활성이다. 인쇄 창에서 대상을 「PDF로 저장」으로 골라야 한 장으로 나온다(프린터는 A4 로 자른다). 보드는 한 장에 다 나오지만 그리드·메모처럼 위젯 안쪽에 스크롤이 있는 부분은 지금 보이는 만큼만 찍힌다. 외부 웹 주소 위젯은 그 사이트의 인쇄 스타일을 따른다.

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
| testId | `string` | - | 뿌리 `data-testid`. 정의 목록 실패 띠는 `{testId}-registry-error`(testId 가 없으면 띠에 testid 없음) |
| registryStatus | `"ready" \| "loading" \| "error"` | `"ready"` | 정의 위젯 목록(`widgetDef/list`) 상태. loading·error 면 [배치 편집]·(+) 새 탭만 막고(⋯ 탭 메뉴는 보기 모드에서 그대로), error 면 탭 줄(또는 단일 탭 제목) 위에 「위젯 정의를 불러오지 못했습니다」 띠 |
| onRetryRegistry | `() => void` | - | 띠의 [다시 시도](`data-action="retry-registry"`). 없으면 버튼을 그리지 않는다 |
| typeTitles | `Readonly<Record<string, string>>` | - | 유형 ID → 이름. 서랍이 정의 위젯 제목 아래에 유형 이름을 보인다(서랍 검색도 유형 이름으로 찾는다) |
| singleTab | `{ title: string }` | - | 탭 줄을 숨기고 「홈」 하나만 다룬다(관리자 기본 배치 편집). 인라인 객체로 넘겨도 다시 불러오지 않는다 |
| pdfTarget | `RefObject<HTMLElement \| null>` | - | 주면 도구 줄의 [배치 편집] 앞에 [PDF] 단추(`data-action="print-pdf"`)를 그린다. 누르면 대상 요소(ref 가 비면 작업 공간)를 [printElementAsPage](print-element-as-page.md) 로 한 장짜리 페이지로 인쇄하고, 기본 파일 이름은 「{지금 탭 이름}_{yyyyMMdd}」(못 쓰는 글자는 `_`)다. 편집 중에는 비활성. 없으면 단추가 없다 |

WidgetBoardProps: `items`·`registry`·`editing`·`tabLocked`(필수), `onChange(items)`(필수), `onWideChange?(wide)`(안정된 함수를 넘긴다 — effect 의존성에 들어간다), `cols?: 24 | 12 | 1`(칸 수를 바깥에서 정함, 없으면 보드 자기 폭으로 판정), `width?`(고정 폭), `testId?`.

WidgetFrameProps: `item`·`entry`(`undefined` 면 「없는 위젯」 칸, `entry.meta.disabled` 면 사용 중지 칸)·`editing`·`onToggleLock`·`onRemove`(필수), `sizeLabel?`·`onKeyMove?`. 제목 줄(제목·부제·새로 고침·화면 열기·잠금·빼기), 로딩 틀, 오류 경계를 그린다. 관리 화면 미리보기처럼 보드 밖에서 단독으로 그려도 된다.

WidgetTabsProps: `tabs`·`activeTabId`·`editing`·`renamingTabId`·`onSelect`·`onAdd`·`onRenameStart`·`onRenameCommit`(오류 문구를 돌려주면 입력 칸 유지)·`onRenameCancel`·`onToggleLock`·`onMove`·`onDelete`·`onResetHome`, 선택 `menuDisabled`(⋯ 메뉴와 (+) 모두 막음)·`addDisabled`(⋯ 는 두고 (+) 만 막음)·`addTitle`((+) 의 title, 막은 이유를 알릴 때)·`trailing`.

WidgetPickerProps: `registry`·`items`·`onAdd(widgetId)`, 선택 `typeTitles`(유형 ID → 이름, 정의 위젯 제목 아래 작은 글씨). [위젯 추가] 서랍 — 검색·눌러 추가·격자로 끌어 놓기. 사용 중지 위젯은 보이지 않고, 이미 놓인 위젯(`multiple: false`)과 탭 한도(30개)는 막는다.

WidgetMeta: `id`(`"{모듈}.{이름}"` 또는 `def.{key}`, 저장 키)·`title`·`defaultSize`(필수), `subtitle`·`description`·`minSize`(기본 `{ w: 4, h: 6 }`)·`maxSize`·`refreshSec`(30 미만이면 30)·`linkPageId`·`multiple`(기본 true)·`bodyPadding`(기본 true)·`disabled`(관리자 사용 중지)·`kind`(`"code"` | `"def"`, 없으면 code)·`typeId`(정의 위젯의 유형 ID).

WidgetProps(위젯 본체가 받는 값): `instanceId`·`size`·`config`(인스턴스 설정 — 지금은 늘 `null`)·`refreshKey`(바뀌면 다시 조회)·`definition`(정의 위젯의 정의 설정, 코드 위젯은 `null`)·`widgetId`(정의 위젯이 자기 defId 로 서버를 부를 때).

유형 계약: `WidgetTypeMeta`(`id`·`title`·`defaultSize`·`initialConfig` 필수, `description`·`minSize`·`maxSize`·`bodyPadding`), `WidgetTypeRegistryEntry`(`meta`·`loadRenderer`·`loadEditor`), `WidgetTypeRegistry`, `WidgetTypeEditorProps`(`value`·`onChange`·`onValidate?`), `WidgetTypeEditorComponent`, `WidgetDefRow`(`widgetDef/list`·`commWidgetMng/search` 응답 한 줄).

등록부 순수 함수(`widget-registry.ts`): `mergeWidgetRegistry(code, types, defs)`(실행 시 등록부), `toWidgetDefRow(raw)`(서버 응답 한 줄 → `WidgetDefRow`, `configJson` 문자열 파싱, srcTp 가 C·D 가 아니면 `null`), `applyWidgetOverride(meta, row)`(코드 메타 + 덮어쓰기 행), `defWidgetMeta(row, type)`(정의 위젯 메타), `defWidgetLoader(type, definition)`(유형 렌더러에 `definition` 을 끼운 본체 로더). 관리 화면 미리보기는 저장 전 폼 값으로 `applyWidgetOverride`·`defWidgetMeta`·`defWidgetLoader` 를 불러 `WidgetFrame` 에 넘긴다.

틀 훅: `useWidgetStatus()` → `(status: WidgetStatus) => void`, `useWidgetBodySize()` → `{ width, height }`, `<WidgetHeaderActions>`(제목 줄 오른쪽 버튼 자리), `<WidgetTitleExtra>`(제목 옆 동적 부제·배지).

WidgetStore 계약(화면이 서버 서비스로 구현해 주입, 실패는 `Error(message)` 로 던진다)

| 메서드 | 역할 |
|---|---|
| `load(): Promise<WidgetTab[]>` | 사용자 탭 전체. 「홈」을 저장한 적 없으면 결과에 `home` 이 없다 |
| `saveTab(tab)` | 탭 하나를 통째로 바꾼다(없으면 만든다) |
| `deleteTab(tabId)` | 탭을 지운다 |
| `reorderTabs(tabIds)` | 「홈」을 뺀 탭 ID 를 새 순서로 |
| `resetHome()` | 사용자 「홈」 배치를 지운다(다음부터 기본 배치) |

순수 함수(`widget-layout.ts`, 화면이 직접 부를 일은 드물다): `sanitizeLayout`·`reflowLayout`·`colsForWidth`·`minSizeOf`·`maxSizeOf`(격자 정리·칸 수·크기 범위), `addItem`·`removeItem`·`toggleLock`·`canAddWidget`(위젯 추가·빼기·잠금·한도·사용 중지 거절), `itemsEqual`·`tabsEqual`(변경 비교), `validateTabName`·`nextTabId`·`homeTab`·`newInstanceId`(탭·ID), `validateWidgetMeta`(등록부 메타 검사). `openPortalPage(pageId)` 는 `portal-open-tab` 이벤트로 포털 탭을 여는 함수이며 틀의 「화면 열기」가 쓴다.

## 표준값: 모든 화면 동일

- 격자: 넓은 화면(≥960px) 24칸, 중간(≥768px) 12칸, 좁은 화면 1칸. 세로 한 칸 20px, 간격 8px. 저장은 넓은 화면 배치 하나뿐이고 중간·좁은 화면은 다시 흘린 배치를 보기 전용으로 보인다.
- 한도: 탭 사용자당 10개, 위젯 탭당 30개, 탭 이름 1~20자(사용자 안 중복 금지). 「홈」 탭은 ID `home`, 늘 첫 자리이고 지우기·이름 바꾸기가 안 된다.
- 위젯 최소 크기 기본 `{ w: 4, h: 6 }`, 크기 조절 손잡이 8방향.
- 편집 모드의 보드(`.cm-widget-board[data-editing="true"]`)에서는 shared 위젯 스타일이 안의 `iframe` 에 `pointer-events: none` 을 건다(iframe 이 마우스를 삼켜 끌기·크기 조절이 끊기는 것을 막는다). 위젯 유형마다 따로 막지 않는다.
- 서버에서 받은 배치는 `sanitizeLayout` 이 정리한다(격자 밖·겹침·최소 크기 미만·중복 instId). 등록부에 없는 위젯 ID 는 보기 모드에서 숨기고 편집 모드에서 「없는 위젯」 칸으로 보여 준다. 없는 위젯 칸은 잠겨 있어도 ✕ 로 뺄 수 있다(`removeItem(items, instId, force)`).

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `store`·`homeDefault`·`registry` 를 렌더마다 새로 만들어 넘긴다 | 참조가 바뀌면 작업 공간이 다시 불러오며 편집 중이던 변경이 사라지고 편집 모드가 끝난다. 모듈 상수나 `useMemo` 로 안정된 참조를 넘긴다(`mergeWidgetRegistry` 결과도 `useMemo`). `singleTab`·`typeTitles`·`registryStatus` 는 바뀌어도 다시 불러오지 않는다 |
| `widgetDef/list` 응답 전·실패인데 `registryStatus` 를 넘기지 않는다 | 정의 위젯이 「없는 위젯」으로 보이는 상태에서 편집·저장하면 사용자 탭에서 정의 위젯이 지워진다. 응답 전 `"loading"`, 실패 `"error"` 를 넘긴다 |
| 사용 중지 위젯을 등록부에서 빼 버린다 | 「없는 위젯」이 되어 저장할 때 사용자 배치에서 사라진다. `meta.disabled: true` 로 남긴다(`mergeWidgetRegistry` 가 그렇게 한다) |
| `onWideChange` 에 렌더마다 새 화살표 함수를 넘긴다 | 보드가 effect 의존성으로 쓴다. `useCallback` 이나 `setState` 함수를 넘긴다 |
| 위젯 본체가 자기 제목 줄을 그린다 | 틀(`WidgetFrame`)이 그린다. 고유 버튼은 `WidgetHeaderActions`, 부제는 `WidgetTitleExtra` |
| 위젯 `id` 를 나중에 바꾼다 | 저장 키라서 사용자 배치에서 그 위젯이 빠진다. 새 ID 로 만들고 옛 것은 한동안 둔다 |
| shared `widget` 소스에 Mantine 컴포넌트를 import 한다 | 시험에 MantineProvider 가 없다. `<button>` + `WIDGET_CSS` 클래스로 만든다(위젯 본체를 만드는 화면은 shared 래퍼를 쓴다) |
| `WidgetStore.load` 가 실패를 빈 배열로 돌려준다 | 던져야 한다. 빈 배열이면 작업 공간이 빈 상태를 저장해 사용자 배치를 지울 수 있다(던지면 [배치 편집]이 막힌다) |
| `userId` 를 요청 본문에 실어 저장소로 보낸다 | 서버가 `SecurityIdentity` 로만 얻는다. 저장소 구현에서 userId 를 보내지 않는다 |
| 위젯 컴포넌트 시험에 `@testing-library` 를 쓴다 | `createRoot` + `act` 를 쓴다(shared 시험 관례) |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/home/`: `WidgetWorkspace` 에 `WIDGET_REGISTRY`(`lib/generated/widget-registry.ts`)·`HOME_DEFAULT_LAYOUT`(`home-layout.ts`)·`secWidget` 저장소(`widget-store.ts`)를 넘기는 포털 홈. `pdfTarget` 으로 홈 뿌리 `.mcm-home`(인사말·공지 띠·탭 줄·보드)을 넘겨 [PDF] 를 켠다.
- `src/frontend/m-mcm/widgets/home/{이름}/`: `widget.meta.ts` + `widget.tsx` 로 이루어진 홈 위젯 11개.
- `src/frontend/m-mcm/widget-types/{typeId}/`: 정의 위젯 유형(`type.meta.ts` + `renderer.tsx` + `editor.tsx`), 생성물 `lib/generated/widget-type-registry.ts`.
- `src/frontend/m-mcm/page-components/csa/commWidgetMng/`: 위젯관리 화면 — 미리보기는 `WidgetFrame` 단독, 기본 배치 탭은 `WidgetWorkspace singleTab` + 관리자 어댑터 저장소.
