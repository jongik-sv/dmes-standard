# 위젯 (WidgetWorkspace · WidgetBoard · WidgetFrame · WidgetTabs · WidgetPicker)

사용자가 위젯(조각 프로그램)을 24칸 격자에서 자유롭게 옮기고 크기를 바꾸며, 탭으로 나눠 서버에 저장하게 하는 홈 화면을 만들 때 쓴다(관리자 정의 위젯·사용 중지·기본 배치 편집 포함). 행 단위 대시보드가 필요하면 [dashboard](dashboard.md), 사용자가 자유 배치·탭·서버 저장을 쓰면 widget 을 고른다.

- import: `import { WidgetWorkspace, WidgetBoard, WidgetFrame, WidgetTabs, WidgetPicker, WidgetStyle, useWidgetStatus, useWidgetBodySize, useWidgetTitle, useWidgetRename, WidgetHeaderActions, WidgetTitleExtra, mergeWidgetRegistry, toWidgetDefRow, type WidgetWorkspaceProps, type WidgetBoardProps, type WidgetFrameProps, type WidgetTabsProps, type WidgetPickerProps, type WidgetMeta, type WidgetProps, type WidgetItem, type WidgetTab, type WidgetStore, type WidgetRegistry, type WidgetRegistryEntry, type WidgetStatus, type WidgetRenameHandler, type WidgetDefRow, type WidgetTypeRegistry, type WidgetTypeMeta, type WidgetTypeEditorProps } from "@dk-oasis/shared/widget";` (CSS import 없음 — 컴포넌트가 `<WidgetStyle />` 로 자기 스타일을 넣는다)
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

위젯 본체는 `default export` 로 `WidgetProps` 를 받는 컴포넌트다. 틀 훅으로 상태를 알린다. 도구 창(도크)에서 띄운 위젯은 `WidgetProps.screenContext`(활성 업무 탭의 그리드 선택 행 등)·`screenApply`(업무 화면에 값 넣기)도 받는다(보드는 null) — [screen-context](screen-context.md).

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
import { mergeWidgetRegistry, toWidgetDefRow, WidgetWorkspace, type WidgetDefRow, type WidgetRegistry } from "@dk-oasis/shared/widget";

import { WIDGET_REGISTRY } from "@/lib/generated/widget-registry";
import { WIDGET_TYPE_REGISTRY } from "@/lib/generated/widget-type-registry";

const TYPE_TITLES = Object.fromEntries(Object.values(WIDGET_TYPE_REGISTRY).map((t) => [t.meta.id, t.meta.title]));

function Home({ store, rawDefs, status, retry }: Props) {
  // rawDefs: widgetDef/list 응답 줄(configJson 문자열 포함). 응답 전·실패면 [].
  const defs = useMemo(() => rawDefs.map(toWidgetDefRow).filter((r): r is WidgetDefRow => r !== null), [rawDefs]);
  const prevRegistry = useRef<WidgetRegistry | undefined>(undefined);
  const registry = useMemo(() => {
    const next = mergeWidgetRegistry(WIDGET_REGISTRY, WIDGET_TYPE_REGISTRY, defs, prevRegistry.current);
    prevRegistry.current = next;
    return next;
  }, [defs]);
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

## 기본 탭·공유·내보내기·가져오기(2026-10-05)

- **고정 탭**: 「홈」과 기본 탭(`WidgetTab.defaultTab: true`, 관리자가 둔 `def-N`)은 탭 줄 앞(홈 → 기본 탭 → 일반 탭)에 고정이고 지우기·이름 바꾸기·옮기기가 없다. 일반 탭도 고정 탭 앞으로는 못 간다. 서버가 기본 탭 `seq` 를 100+ 로 줘도 `orderTabs` 가 앞에 둔다. 순서 저장(`reorderTabs`)에는 일반 탭 ID 만 넘긴다.
- **기본 탭 메뉴**: 잠그기 / 기본으로 되돌리기(`store.resetTab` 이 있을 때, `customized` 일 때만 켜짐) / 공유… / 내보내기. 되돌리기는 확인 → `resetTab(tabId)` → 스켈레톤 없이 조용히 다시 불러온다. 기본 탭 편집은 일반 탭처럼 [배치 편집]→[완료] 로 `saveTab` 하고, 저장·잠금 뒤에는 다시 불러오지 않아도 `customized` 가 켜진다. 「홈」 되돌리기는 예전처럼 `resetHome`. **(2026-10-07 개정)** 이 메뉴·개인화(`defaultTab`·`customized`)·`resetTab`·`resetHome` 은 `fixedHome` 을 쓰지 않는 기존 사용처 호환용이다. `fixedHome` 을 쓰는 홈에서는 「홈 기본 배치로 되돌리기」와 「기본으로 되돌리기」가 없고, 관리자 탭은 아래 「관리자 고정 탭」이 된다.
- **공유**: `store.shareTab`·`store.searchUsers` 가 둘 다 있으면 모든 탭 메뉴에 「공유…」 — [LookupMultiModal](lookup-multi-modal.md) 공유 창(2자 이상 검색, 최대 10명, `userId` 본인 제외)을 열 때만 마운트한다. 결과는 `shareResultMessage`(「n명에게 공유했습니다.」)로 한 번 알리고, 모두 성공이면 닫는다. 일부·전부 실패면 사유를 알리고 실패한 사람만 고른 채 창을 둔다. 호출이 던지면 알리고 창을 둔다.
- **내보내기·가져오기**: user 모드면 늘 보인다. 내보내기는 탭을 `{ version: 1, kind: "dmes-widget-tab", name, items[] }`(instId 없음) JSON 파일 「{탭 이름}_{yyyyMMdd}.json」 으로 내려받는다. 가져오기(탭 줄 (+) 옆, `data-action="import-tab"`)는 파일을 `parseTabImport` 로 검사해(버전·모양·위젯 30개·탭 한도) 없는·사용 중지 위젯을 빼고 새 `tab-N` 탭(새 instId, 이름이 겹치면 숫자 꼬리)으로 **바로 저장**한 뒤 고르고 알린다. 편집 중·저장 중·정의 목록 준비 전에는 막히고, 1MB 넘는 파일·widgetId 100자 초과·객체가 아닌 config·config JSON 4000자 초과는 거절한다.
- **새 탭 ID(fresh)**: (+)·가져오기로 만든 탭은 `fresh: true` 로 첫 `saveTab` 을 한다. 저장소가 다른 ID 를 `{ tabId }` 로 돌려주면(화면이 연 뒤 같은 `tab-N` 공유 사본이 생긴 경우 서버가 옮겨 저장) 작업 공간이 탭·고른 탭·편집 기준·마지막 탭 기억을 그 ID 로 바꾸고, 저장에 성공하면 `fresh` 를 끈다. admin 모드 어댑터는 `fresh` 를 쓰지 않는다.
- **`mode="admin"`**(위젯관리 「기본 배치」): 잠그기·홈 되돌리기·공유·내보내기·가져오기가 없고 「홈」에는 ⋯ 가 없다. 「홈」 외 탭은 이름 바꾸기·옮기기·지우기가 되며 탭 한도는 홈 + `MAX_DEFAULT_TABS`(5). 저장소 어댑터가 「홈」은 기본 배치 저장, 다른 탭은 기본 탭 저장으로 보낸다(새 탭 임시 ID `tab-N` → 서버 `def-N` 매핑은 어댑터가 기억한다).

```tsx
<WidgetWorkspace
  key={layoutKey} // 배치 키가 바뀌면 다시 마운트
  mode="admin"
  registry={registry}
  homeDefault={HOME_DEFAULT_LAYOUT}
  store={layoutStore} // createLayoutStore(layoutKey, …)
  typeTitles={TYPE_TITLES}
/>
```

## 관리자 고정 탭(2026-10-07)

전사·부서 기본 배치를 사용자에게 **늘 보이게** 하는 탭이다. 사용자 저장본이 없고 편집·되돌리기도 없다(설계: `docs/superpowers/specs/2026-10-07-widget-fixed-tabs-design.md`, 작성 가이드 §7).

- **`WidgetTab.fixed?: boolean`·`origin?: string`**: `fixed` 는 관리자 고정 탭 표시이고 사용자가 풀 수 없다. 기존 `locked`(사용자가 푸는 잠금)와 별개다. `origin` 은 탭 풍선에 보이는 출처 글(예: 「전사 기본 배치」, 「{부서명} 부서 탭」)이다. 고정 탭은 `isFixedTab` 이 참이고 `orderTabs` 가 「홈」 뒤·일반 탭 앞에 둔다(`tabRank` 홈 0 · 기본·고정 1 · 일반 2).
- **고정 탭에서 막히는 것**: [배치 편집](제목 「관리자가 정한 탭입니다. 내 탭에서 편집하세요.」)·위젯 서랍·저장 대상. 편집 중 고정 탭으로 옮겨도 보드가 움직이지 않는다. 탭 메뉴에는 공유·내보내기만 있고 잠그기·되돌리기·이름 바꾸기·옮기기·지우기가 없다(`onShare`·`onExport` 가 없으면 ⋯ 도 없다). 탭 풍선은 「관리자가 정한 탭입니다(바꿀 수 없습니다)」 + 출처. 빈 고정 탭은 `WidgetBoard` 에 `emptyText`(「관리자가 아직 위젯을 놓지 않은 탭입니다.」)를 넘겨 보인다. `saveTab` 흐름도 고정 탭이면 「관리자가 정한 탭은 바꿀 수 없습니다.」로 막는다.
- **`fixedHome?: boolean`(기본 false)**: true 면 「홈」은 서버가 `home` 탭을 주더라도 무시하고 늘 `homeDefault`(관리자 전사 배치)로 그리는 고정 탭(`fixed`, 출처 「전사 기본 배치」)이다. `registry`·`homeDefault` 가 바뀌면 다시 그린다. 마운트 때 정한 값을 쓴다. false 면 예전 동작(저장한 「홈」이 있으면 그것, 홈 되돌리기 있음).
- **`homeTabName?: string`**: 「홈」 탭 표시 이름(기본 「홈」). 위젯관리 「기본 배치」에서 부서 키의 대표 탭을 부서명으로 보일 때 쓴다. 바뀌면 이미 그린 「홈」 이름만 바꾸고 다시 불러오지 않는다.
- **탭 한도**: (+)·가져오기·`parseTabImport` 한도는 `countedTabCount(tabs)`(고정 탭을 뺀 탭 수)로 센다. `fixed` 탭이 없으면 `tabs.length` 와 같다. `WidgetTabs` 도 같은 값으로 (+)·가져오기를 막는다.
- **저장소(m-mcm `widget-store.ts`)**: 응답 줄의 `fixedYn=Y` 를 `fixed: true`, `origin` 을 `origin` 으로 싣는다. 고정 탭의 `lockYn=Y` 는 서버 강제라 `locked` 로 싣지 않는다. `resetTab` 은 서버가 거절하므로 구현하지 않는다(메뉴가 사라진다). `fixedYn` 이 없는 옛 응답은 `defaultYn`·`customYn` 으로 읽는다.

```tsx
<WidgetWorkspace registry={WIDGET_REGISTRY} homeDefault={companyHome} store={store} userId={userId} fixedHome />
```

## 편집 흐름

- [배치 편집]은 24칸(≥960px, 서랍 자리를 포함한 작업 공간 폭 기준)에서만 켜진다. 좁은 화면·잠긴 탭·불러오기 실패·정의 목록 불러오는 중(「위젯 목록을 불러오는 중입니다」)·정의 목록 실패(「위젯 정의를 불러오지 못했습니다」)면 비활성이고 안내 제목이 붙는다. 정의 목록이 불러오는 중·실패면 (+) 새 탭도 비활성이고 탭 메뉴(⋯)는 숨는다((+)도 편집 모드로 들어가는 길이라서다. 불러오기 실패 때와 같은 모양). 정의 목록 실패면 탭 줄 위에 띠와 [다시 시도](`onRetryRegistry` 가 있을 때)가 보이고, 편집 중에 정의 목록이 준비 상태가 아니게 되면 [완료]가 막힌다.
- [완료]는 편집을 시작한 뒤 바뀐 탭만 `store.saveTab` 한다. 저장이 실패하면 편집 모드와 변경을 유지하고 알린다(탭 여러 개면 저장된 탭은 [취소]로 되돌리지 않고, 다시 [완료]하면 실패한 탭만 저장한다). 불러오기가 끝나지 않았거나 실패한 상태에서는 [완료]가 막힌다. [취소]는 바뀐 것이 있으면 확인 뒤 되돌린다. 편집 중 Escape 는 [취소]와 같다. 저장하는 동안에는 보드 편집·서랍·[취소]·Escape·(+) 새 탭·탭 메뉴(이름 바꾸기)가 멈춘다(입력 칸·메뉴·확인 창 안의 Escape 는 각자 처리한다). 서랍에서 눌러 추가한 위젯으로는 스크롤한다.
- 미리 배치: 서랍 항목에 마우스를 올리면 보드의 첫 빈 자리(`firstFreeSpot` — y 0 부터 행 우선·x 0 부터, 잠긴 위젯도 점유, 꽉 차면 맨 아래 왼쪽)에 그 위젯의 제목·크기(w × h)·스켈레톤이 점선 자리 표시로 미리 보이고, 클릭해야 같은 자리에 실제로 놓인다. 마우스가 벗어나거나 끌기 시작·탭 전환·편집 종료·취소·서랍이 사라지면 미리 보기도 사라진다. 놓을 수 없는 위젯(이미 놓인 `multiple: false`·탭 한도)은 미리 보이지 않는다. 크기는 `placedSizeOf(meta)`(defaultSize 를 최소·최대·24칸으로 자른 값)다.
- 보기 모드 탭 메뉴 작업(이름 바꾸기·잠금·왼쪽/오른쪽·지우기·홈 기본 배치로 되돌리기. 「홈 기본 배치로 되돌리기」는 `fixedHome` 을 쓰지 않을 때만)은 바로 저장하며, 실패하면 화면을 원래대로 되돌린다.
- (+) 새 탭은 편집 모드로 들어가고 [취소]하면 사라진다. 그래서 [배치 편집]처럼 저장 중·불러오기 실패·정의 목록 불러오는 중·실패면 막힌다.
- [PDF](`pdfTarget` 을 줄 때)는 편집 중에 자리를 지킨 채 비활성이다. 인쇄 창에서 대상을 「PDF로 저장」으로 골라야 한 장으로 나온다(프린터는 A4 로 자른다). 보드는 한 장에 다 나오지만 그리드·메모처럼 위젯 안쪽에 스크롤이 있는 부분은 지금 보이는 만큼만 찍힌다. 외부 웹 주소 위젯은 그 사이트의 인쇄 스타일을 따른다.

## Props

WidgetWorkspaceProps

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| registry | `WidgetRegistry` | 필수 | 위젯 ID → `{ meta, load }`. 코드 생성물. 모듈 상수나 `useMemo` 로 안정된 참조를 넘긴다 |
| homeDefault | `readonly WidgetItem[]` | 필수 | 저장한 「홈」이 없을 때의 기본 배치(`fixedHome` 이면 「홈」을 늘 이 배치로 그린다). 안정된 참조를 넘긴다 |
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
| categoryTitles | `Readonly<Record<string, string>>` | - | 위젯 분류 코드 → 이름. 서랍이 분류별로 묶이고 분류 칩 필터가 생긴다(순서가 묶음 순서, 분류 없는 위젯은 「기타」). 없으면 분류 없이 보인다 |
| singleTab | `{ title: string }` | - | 탭 줄을 숨기고 「홈」 하나만 다룬다(관리자 기본 배치 편집). 인라인 객체로 넘겨도 다시 불러오지 않는다 |
| pdfTarget | `RefObject<HTMLElement \| null>` | - | 주면 도구 줄의 [배치 편집] 앞에 [PDF] 단추(`data-action="print-pdf"`)를 그린다. 누르면 대상 요소(ref 가 비면 작업 공간)를 [printElementAsPage](print-element-as-page.md) 로 한 장짜리 페이지로 인쇄하고, 기본 파일 이름은 「{지금 탭 이름}_{yyyyMMdd}」(못 쓰는 글자는 `_`, 80글자까지, 끝 공백·마침표 제거)다. 편집 중에는 비활성(title 「편집 중에는 사용할 수 없습니다」)이고 잠긴 탭·불러오기 실패·좁은 화면에서는 켜져 있다. 인쇄 창을 열지 못하면(`print()` 예외) 「인쇄 창을 열지 못했습니다.」 알림을 보인다. 없으면 단추가 없다 |
| fixedHome | `boolean` | `false` | true 면 「홈」을 서버 `home` 과 무관하게 늘 `homeDefault` 로 그리는 관리자 고정 탭으로 둔다(편집·「홈 기본 배치로 되돌리기」 없음). 마운트 때 정한 값을 쓴다. 기존 사용처는 그대로 둔다([관리자 고정 탭](#관리자-고정-탭2026-10-07)) |
| homeTabName | `string` | `"홈"` | 「홈」 탭 표시 이름. 부서 키 대표 탭을 부서명으로 보일 때 쓴다 |
| mode | `"user" \| "admin"` | `"user"` | `"admin"` 이면 잠그기·홈 되돌리기·공유·내보내기·가져오기를 숨기고 탭 한도를 홈 + 5 로 둔다([기본 탭·공유](#기본-탭공유내보내기가져오기2026-10-05)) |

WidgetBoardProps: `items`·`registry`·`editing`·`tabLocked`(필수), `onChange(items)`(필수), `onWideChange?(wide)`(안정된 함수를 넘긴다 — effect 의존성에 들어간다), `cols?: 24 | 12 | 1`(칸 수를 바깥에서 정함, 없으면 보드 자기 폭으로 판정), `width?`(고정 폭), `testId?`, `preview?: { meta, x, y, w, h } | null`(놓일 자리를 미리 보이는 static 스켈레톤 항목 `__preview__`. 편집할 수 있을 때만 그리고 `onChange` 배치에는 섞이지 않는다), `emptyText?`(위젯이 없고 편집할 수 없을 때의 안내. 없으면 「놓인 위젯이 없습니다. [배치 편집]에서 위젯을 추가하세요.」. 고정 탭은 「관리자가 아직 위젯을 놓지 않은 탭입니다.」).

WidgetFrameProps: `item`·`entry`(`undefined` 면 「없는 위젯」 칸, `entry.meta.disabled` 면 사용 중지 칸)·`editing`·`onToggleLock`·`onRemove`(필수), `sizeLabel?`·`onKeyMove?`. 제목 줄(제목·부제·새로 고침·화면 열기·잠금·빼기), 로딩 틀, 오류 경계를 그린다. 관리 화면 미리보기처럼 보드 밖에서 단독으로 그려도 된다. 위젯 본문 전체는 `LayoutContextBoundary`([content-body](content-body.md))로 감싸져 있어, 바깥 resizable ContentBody 패널 안에서 그려져도 위젯 안 ContentBody 는 바깥 레이아웃 규격을 받지 않는다.

WidgetTabsProps: `tabs`·`activeTabId`·`editing`·`renamingTabId`·`onSelect`·`onAdd`·`onRenameStart`·`onRenameCommit`(오류 문구를 돌려주면 입력 칸 유지)·`onRenameCancel`·`onToggleLock`·`onMove`·`onDelete`·`onResetHome`, 선택 `menuDisabled`(⋯ 메뉴와 (+) 모두 막음)·`addDisabled`(⋯ 는 두고 (+) 만 막음)·`addTitle`((+) 의 title, 막은 이유를 알릴 때)·`trailing`, 그리고 2026-10-05 추가 `mode`(`"admin"` 이면 잠그기·홈 되돌리기 숨김)·`maxTabs`(기본 10)·`onResetTab`·`onShare`·`onExport`·`onImport(file)`·`importDisabled`·`importTitle` — 핸들러가 없으면 그 항목·단추를 그리지 않는다.

WidgetPickerProps: `registry`·`items`·`onAdd(widgetId)`, 선택 `typeTitles`(유형 ID → 이름, 정의 위젯 제목 아래 작은 글씨)·`categoryTitles`(분류 코드 → 이름, 분류별 묶음·칩 필터)·`onPreview(meta | null)`(항목에 마우스 진입/이탈). [위젯 추가] 서랍 — 검색·눌러 추가·격자로 끌어 놓기. 사용 중지 위젯은 보이지 않고, 이미 놓인 위젯(`multiple: false`)과 탭 한도(30개)는 막는다.

WidgetMeta: `id`(`"{모듈}.{이름}"` 또는 `def.{key}`, 저장 키)·`title`·`defaultSize`(필수), `subtitle`·`description`·`minSize`(기본 `{ w: 4, h: 6 }`)·`maxSize`·`refreshSec`(600 미만이면 600, 비우면 자동 새로 고침 없음)·`linkPageId`·`multiple`(기본 true)·`bodyPadding`(기본 true)·`disabled`(관리자 사용 중지)·`kind`(`"code"` | `"def"`, 없으면 code)·`typeId`(정의 위젯의 유형 ID)·`floatable`(도구 창으로 띄울 수 있는지, 기본 false)·`icon`(접힌 도구 창 단추의 아이콘 컴포넌트 `WidgetIcon`, 없으면 제목 첫 글자)·`placement`(배치 옵션 `"W"` 위젯 화면만 | `"B"` 업무 화면(도구 창)만 | `"A"` 둘 다, 없으면 `floatable` 을 따른다. 정의 위젯은 `WidgetDefRow.placeTp`(DB `PLACE_TP`)가 `meta.placement` 가 된다). 판정은 `resolveWidgetPlacement(meta)` → `{ board, dock }` 하나로 한다: 서랍(`WidgetPicker`)은 `board` 가 false(B)면 숨기고, 도구 메뉴는 `dock` 이 false(W)면 숨긴다. A·B 는 `floatable` 과 상관없이 도구 창에 띄운다. 이미 보드에 놓인 B 위젯은 그대로 두되, 새로 놓는 길(`canAddWidget`·탭 가져오기)은 B 를 막는다.·`help`(선택 `WidgetHelp` `{ title, loadMarkdown }` — 있는 위젯에만 틀 머리(보드·도구 창 공통, 배치 편집 중 제외)에 「?」 단추(`data-action="help"`)가 생기고, 누르면 `loadMarkdown()` 문서를 목차가 있는 모달(`MarkdownDocViewer`)로 연다. 없으면 기존 모양 그대로. 정의 위젯은 유형 `type.meta.ts` 의 `help` 가 `meta.help` 로 전달된다. 모달 코드는 처음 누를 때 지연 로딩하고, 문서 보기(tiptap·marked)는 `widget.js` 에 넣지 않고 번들 밖 진입점 `@dk-oasis/shared/markdown-editor`(tsup external, 소스에서는 tsconfig paths·vitest alias)에서 지연 import 한다 — 안 그러면 포털 모든 화면이 도움말을 열기 전에 받는다 문서 원문은 `docs/guide/FrontEnd/*.md` 이고 화면 쪽에 생성 사본(`scripts/gen-widget-guide.mjs`)을 두어 `loadMarkdown` 이 지연 import 한다)

WidgetProps(위젯 본체가 받는 값): `instanceId`·`size`·`config`(인스턴스 설정 — 지금은 늘 `null`)·`refreshKey`(바뀌면 다시 조회)·`definition`(정의 위젯의 정의 설정, 코드 위젯은 `null`)·`widgetId`(정의 위젯이 자기 defId 로 서버를 부를 때).

유형 계약: `WidgetTypeMeta`(`id`·`title`·`defaultSize`·`initialConfig` 필수, `description`·`minSize`·`maxSize`·`bodyPadding`·`floatable`·`icon`·`help`), `WidgetTypeRegistryEntry`(`meta`·`loadRenderer`·`loadEditor`), `WidgetTypeRegistry`, `WidgetTypeEditorProps`(`value`·`onChange`·`onValidate?`), `WidgetTypeEditorComponent`, `WidgetDefRow`(`widgetDef/list`·`commWidgetMng/search` 응답 한 줄).

등록부 순수 함수(`widget-registry.ts`): `mergeWidgetRegistry(code, types, defs, prev?)`(실행 시 등록부. 선택 `prev` 는 지난번 결과 — 합친 결과의 항목이 모두 같은 객체면 `prev` 를 그대로 돌려줘 화면이 같은 등록부를 새것으로 보지 않게 한다), `toWidgetDefRow(raw)`(서버 응답 한 줄 → `WidgetDefRow`, `configJson` 문자열 파싱, srcTp 가 C·D 가 아니면 `null`), `applyWidgetOverride(meta, row)`(코드 메타 + 덮어쓰기 행), `defWidgetMeta(row, type)`(정의 위젯 메타), `defWidgetLoader(type, definition)`(유형 렌더러에 `definition` 을 끼운 본체 로더). 관리 화면 미리보기는 저장 전 폼 값으로 `applyWidgetOverride`·`defWidgetMeta`·`defWidgetLoader` 를 불러 `WidgetFrame` 에 넘긴다.

틀 훅: `useWidgetStatus()` → `(status: WidgetStatus) => void`, `useWidgetBodySize()` → `{ width, height }`, `<WidgetHeaderActions>`(제목 줄 오른쪽 버튼 자리), `<WidgetTitleExtra>`(제목 옆 동적 부제·배지), `useWidgetTitle(title: string | null | undefined)` → `void`(칸마다 제목이 다른 위젯이 틀 제목을 바꾼다), `useWidgetRename(handler: WidgetRenameHandler | null | undefined)` → `void`(틀 제목 줄에서 바로 이름을 바꾸게 한다).
- `useWidgetTitle`: 제목 줄 `h3` 와 틀의 `aria-label` 만 덮어쓴다. 본체가 받는 `props.title`(등록부 이름)·`WidgetFrameApi` 의 다른 값은 그대로다. `null`·`undefined`·공백뿐인 값은 덮어쓰지 않아 등록부 제목이 보이고, 값이 바뀌거나 본체가 사라지면 이전 덮어쓰기를 되돌린다(틀 밖에서는 아무 일도 하지 않는다). 틀은 덮어쓴 값을 위젯 ID 와 함께 기억하므로 같은 칸에 다른 위젯이 오면 저절로 풀린다. 사용 중지·없는 위젯 칸의 제목은 바꾸지 않는다. 이 훅을 부르지 않는 위젯의 DOM·동작은 이전과 같다. **틀 하나에 한 곳에서만 부른다** — 둘 이상이면 나중에 정한 값이 이기고, 한쪽이 사라지면 남은 쪽 값까지 지워져 정의 이름으로 돌아간다. 쓸 때는 저장된 값만 넘기고(편집 중 입력은 미리 보이지 않는다), 실제 칸이 아닌 곳(관리 화면 미리보기·기본 배치 보드)에서는 `null` 을 넘긴다. 예: 개인 메모장(m-mcm `widget-types/memo`) `useWidgetTitle(live ? memo?.title ?? null : null)`.
- `useWidgetRename`: 처리기(`WidgetRenameHandler = (title: string) => Promise<void>`)를 등록한 위젯에서만 틀이 **보기 모드**의 제목 줄에 연필 버튼(`data-action="rename"`)을 붙이고 제목(`h3`) 더블클릭도 켠다. 편집 모드(배치 편집)에서는 연필·더블클릭이 모두 없고 잠금·빼기만 있으며, 입력 중에 편집 모드로 바뀌면 입력칸이 저장 없이 닫힌다. 제목 자리가 입력칸(`aria-label="위젯 이름"`)으로 바뀌어 Enter 저장·Esc 취소·칸을 벗어나면 저장이고, 이름은 40자(`WIDGET_TITLE_MAX`, 코드 포인트·앞 공백 제외)까지만 담기며 한글 조합 중 Enter 는 저장하지 않는다. 처리기는 앞뒤 공백을 자른 새 이름(비우면 `""` = 등록부 제목으로 되돌림)을 받아 저장하고, 실패하면 사용자에게 보일 문장을 담은 `Error` 를 던진다 — 틀은 입력칸을 열어 둔 채 그 문장을 알리고(칸을 벗어나도 다시 보내지 않는다, Enter 로만 재시도) 저장 중에는 칸을 잠가 중복 호출을 막는다. 키보드(Enter·Esc)로 닫으면 포커스가 연필 버튼으로 돌아온다. 지금 제목과 같게 확정하면 처리기를 부르지 않는다. **저장이 성공했을 때 틀 제목을 바꾸는 일은 처리기 쪽 몫**이다(저장된 값을 `useWidgetTitle` 에 넘기는 기존 경로). `null`·`undefined` 를 넘기면 꺼지므로 저장할 수 없는 상태(불러오기 전·편집 중·미리보기)에서는 `null` 을 넘긴다. 처리기 함수가 렌더마다 새로 만들어져도 등록은 다시 하지 않는다(최신 함수를 부른다). 틀 하나에 한 곳에서만 부른다. 예: 개인 메모장 `useWidgetRename(live && loaded && mode === "view" ? renameTitle : null)` — 저장 직전에 서버 메모를 다시 읽어 그 형식·내용에 제목만 바꿔 기존 `saveMemo` 로 보낸다(제목만 보내는 경로가 없어, 화면의 옛 글을 보내면 다른 곳의 수정을 덮는다).

WidgetStore 계약(화면이 서버 서비스로 구현해 주입, 실패는 `Error(message)` 로 던진다)

| 메서드 | 역할 |
|---|---|
| `load(): Promise<WidgetTab[]>` | 사용자 탭 전체. 「홈」을 저장한 적 없으면 결과에 `home` 이 없다(`fixedHome` 이면 있어도 무시). `secWidget` 저장소는 고정 탭을 `fixed`·`origin` 으로 싣는다 |
| `saveTab(tab)` | 탭 하나를 통째로 바꾼다(없으면 만든다). `Promise<void \| { tabId?: string }>` — `tab.fresh` 첫 저장을 다른 ID 로 옮겼으면 그 ID 를 돌려준다 |
| `deleteTab(tabId)` | 탭을 지운다 |
| `reorderTabs(tabIds)` | 「홈」을 뺀 탭 ID 를 새 순서로 |
| `resetHome()` | 사용자 「홈」 배치를 지운다(다음부터 기본 배치). `fixedHome` 을 쓰는 홈에서는 부르지 않는다(인터페이스 필수라 남기며, 서버 `secWidget/resetHome` 은 2026-10-07 부터 거절한다) |
| `resetTab?(tabId)` | 선택. 기본 탭의 내 재정의를 지운다. 없으면 「기본으로 되돌리기」가 없다. `fixedHome` 을 쓰지 않는 기존 사용처 호환용이며 `secWidget` 저장소는 구현하지 않는다(서버 거절) |
| `shareTab?(tabId, userIds)` | 선택. 사본을 받는 사람들에게 새 탭으로 보내고 `WidgetShareResult[]`(`userId`·`ok`·`tabNm`·`message`)를 돌려준다 |
| `searchUsers?(keyword)` | 선택. 공유 받는 사람 검색 → `WidgetShareUser[]`(`userId`·`userNm`·`deptNm`). `shareTab` 과 둘 다 있어야 「공유…」가 보인다 |

`WidgetTab` 의 선택 칸: `fixed`(관리자 고정 탭, 사용자가 풀 수 없음)·`origin`(고정 탭의 출처 풍선 글), `defaultTab`(관리자 기본 탭 — 고정 탭)·`customized`(기본 탭을 개인화함 — 되돌리기 활성). `defaultTab`·`customized` 는 `fixedHome` 을 쓰지 않는 기존 사용처 호환용이고 `fixedHome` 을 쓰는 홈에서는 쓰지 않는다. 내보내기 파일 타입은 `WidgetTabExportFile`·`WidgetTabExportItem`.

탭 파일·공유 순수 함수(`widget-layout.ts`): `isFixedTab`·`orderTabs`·`fixedTabCount`(고정 탭 판정·정렬·앞쪽 고정 수)·`countedTabCount`(개인 탭 한도에 세는 탭 수 — `fixed` 탭을 뺀다. `@dk-oasis/shared/widget` 에서 export), `uniqueTabName(name, tabs)`(20자로 자르고 겹치면 숫자 꼬리), `buildTabExport(tab)`(내보내기 내용), `parseTabImport(text, { registry, tabs, maxTabs?, newId? })`(가져오기 검사 → `{ ok, tab, dropped }` 또는 `{ ok: false, error }`), `tabImportMessage(name, dropped)`, `shareResultMessage(results, names)`(알림 문구와 종류).

순수 함수(`widget-layout.ts`, 화면이 직접 부를 일은 드물다): `sanitizeLayout`·`reflowLayout`·`colsForWidth`·`minSizeOf`·`maxSizeOf`(격자 정리·칸 수·크기 범위), `addItem`·`removeItem`·`toggleLock`·`canAddWidget`(위젯 추가·빼기·잠금·한도·사용 중지 거절), `itemsEqual`·`tabsEqual`(변경 비교), `validateTabName`·`nextTabId`·`homeTab`·`newInstanceId`(탭·ID), `validateWidgetMeta`(등록부 메타 검사). `openPortalPage(pageId)` 는 `portal-open-tab` 이벤트로 포털 탭을 여는 함수이며 틀의 「화면 열기」가 쓴다.

## 성능 규칙

정본은 [화면 성능 가이드](../../../../docs/guide/FrontEnd/Screen-Performance-Guide.md) R13~R16·R7 이고, `A audit` 가 `[P-R14]`·`[P-R16]` 을 경고로 잡는다.

- **진입 불러오기는 `WidgetWorkspace` 가 한 번만 한다(R13).** `store.load()` 는 마운트와 배치 출처(`store`·사용자·`singleTab`)가 바뀔 때만 부른다. `registry`·`homeDefault`·`userId`(모름 → 확인됨)가 늦게 바뀌어도 다시 조회하지 않고, 이미 받은 탭을 새 등록부로 다시 정리하며 이미 보이는 보드는 스켈레톤으로 되돌리지 않는다. 그러니 **화면이 `key` 로 작업 공간을 다시 마운트하지 않는다**(배치 출처가 진짜로 바뀔 때만 예외 — 위 `singleTab` 예). 편집 중이면 등록부·기본 배치 변경에 따른 다시 불러오기는 편집이 끝난 뒤로 미룬다. `registry`·`homeDefault`·`store` 는 안정 참조를 넘긴다.
- **등록부 병합은 `prev` 를 넘긴다(R7).** `mergeWidgetRegistry(code, types, defs, prev)` — 같은 결과면 `prev`(그리고 항목은 원래 객체)를 돌려줘 틀의 지연 로딩 캐시(`entry.load` 기준)가 유지되고 본체가 다시 마운트되지 않는다. 직접 만든 entry·배치도 같은 결과면 새 객체를 만들지 않는다.
- **타이머는 표시와 연동한다(R14).** 자동 새로 고침은 틀의 `meta.refreshSec` 에 맡기는 것이 기본이다. 본체가 자기 `setInterval`·재귀 `setTimeout` 을 쓰면 `document.visibilityState`(`visibilitychange`)·`IntersectionObserver`·탭 활성 여부(`useTabPage().isActive`)를 확인해 숨은 탭·가려진 위젯에서는 멈추고, 다시 보일 때 한 번 갱신한다. 일회성·디바운스 `setTimeout` 은 해당 없음.
- **같은 목록은 호스트 저장소를 다시 쓴다(R15).** 사이드바·호스트가 이미 받은 목록(즐겨찾기 등)을 위젯 인스턴스마다 다시 조회하지 않는다. 호스트가 받을 때마다 올려 두는 작은 저장소를 두고 위젯은 읽는다 — `m-mcm/lib/portal-favorites-store.ts`(`publishPortalFavorites`·`usePublishedPortalFavorites`, 포털 밖이거나 받기 전이면 `null` → 위젯이 직접 조회). 화면 묶음이 여러 번 실려도 같은 저장소를 쓰도록 `globalThis` 에 둔다.
- **외부 스토어는 필드 훅으로 구독한다(R16).** `useSyncExternalStore` 훅을 통째 상태로만 내보내면 한 필드가 바뀔 때 구독자가 모두 다시 그려진다. getSnapshot 이 그 필드만 돌려주는 훅을 따로 내보내고, 위젯 본체는 필요한 필드 훅만 쓴다 — `m-mcm/page-components/home/notice-store.ts` 의 `useNotices`·`useSelectedNoticeId`. 갱신 함수는 건드리지 않은 필드를 같은 객체로 유지한다.

## 표준값: 모든 화면 동일

- 격자: 넓은 화면(≥960px) 24칸, 중간(≥768px) 12칸, 좁은 화면 1칸. 세로 한 칸 20px, 간격 8px. 저장은 넓은 화면 배치 하나뿐이고 중간·좁은 화면은 다시 흘린 배치를 보기 전용으로 보인다.
- 한도: 탭 사용자당 10개(홈·기본 탭 포함), 위젯 탭당 30개, 탭 이름 1~20자(사용자 안 중복 금지), 관리자 기본 탭 키당 5개, 공유 한 번에 10명. 「홈」 탭은 ID `home`, 늘 첫 자리이고 지우기·이름 바꾸기가 안 된다. 기본 탭 ID 는 `def-N`.
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
| 위젯 본체가 자기 제목 줄을 그린다 | 틀(`WidgetFrame`)이 그린다. 고유 버튼은 `WidgetHeaderActions`, 부제는 `WidgetTitleExtra`, 사용자가 붙인 제목은 `useWidgetTitle` |
| 위젯 본체가 제목 줄에 자기 이름 바꾸기 연필·입력칸을 그린다 | `useWidgetRename` 으로 처리기만 등록한다. 연필·더블클릭·입력칸·Enter/Esc·중복 방지·오류 알림은 틀이 맡는다 |
| 칸마다 다른 제목을 `WidgetTitleExtra` 로 제목 옆에 덧붙이거나 본문 첫 줄에 그린다 | 등록부 이름과 겹쳐 두 제목이 보인다. `useWidgetTitle` 로 틀 제목 자체를 바꾼다 |
| 유형 편집기(`widget-types/*/editor.tsx`)를 FormGroup·flex 로 그리고 `Input`·`Select` 에 `className` 으로 폭을 준다 | 위 공통 칸과 모양이 달라진다(라벨 회색 박스·값 칸 26px 고정·테두리 잘림). 공통 칸과 같은 표(`DETAIL_TABLE_STYLE`·`DETAIL_LABEL_CELL`·`DETAIL_VALUE_CELL` + `MdmFieldLabel`, `MdmMetaProvider disabled`)로 그리고, 폭은 감싸는 `div`(`flex: 1 1 auto; min-width: 0`)로 준다. `className` 은 input 요소로 가서 바깥 래퍼 폭을 못 바꾼다(`rule-calc/editor.tsx`, Local-Rules §26) |
| 유형 편집기 한 줄 행에 `ComboBox` 를 그대로 넣는다 | 바깥 상자 안 입력 묶음이 내용 폭만 차지해 입력이 좁고 테두리가 두 겹으로 보이며 펼친 목록도 좁다. 화면 스타일에서 `.form-combobox` 테두리를 없애고 `.mantine-Input-wrapper` 를 남은 폭으로 늘린다(`rule-calc-styles.ts`, Local-Rules §26) |
| 위젯 `id` 를 나중에 바꾼다 | 저장 키라서 사용자 배치에서 그 위젯이 빠진다. 새 ID 로 만들고 옛 것은 한동안 둔다 |
| shared `widget` 소스에 Mantine 컴포넌트를 import 한다 | 시험에 MantineProvider 가 없다. `<button>` + `WIDGET_CSS` 클래스로 만든다(위젯 본체를 만드는 화면은 shared 래퍼를 쓴다). 공유 창처럼 팝업이 꼭 필요하면 열 때만 조건부로 마운트하고(`WidgetShareDialog`), 그 시험만 `renderWithMantine` 으로 그린다 |
| 화면이 `key={...}` 로 `WidgetWorkspace` 를 등록부·기본 배치·사용자 확인이 바뀔 때마다 다시 마운트한다 | 진입 조회가 다시 일어나고 그린 보드가 스켈레톤으로 돌아간다. 작업 공간이 늦게 온 값을 다시 조회 없이 정리하므로 `key` 는 배치 출처가 진짜 바뀔 때만 쓴다([성능 규칙](#성능-규칙)) |
| 위젯 본체가 숨은 탭에서도 `setInterval` 로 조회하고, 사이드바가 받은 목록을 위젯마다 또 조회하고, 스토어를 통째 구독한다 | [성능 규칙](#성능-규칙) — 표시 연동 타이머·호스트 저장소 재사용·필드 훅 |
| `WidgetStore.load` 가 실패를 빈 배열로 돌려준다 | 던져야 한다. 빈 배열이면 작업 공간이 빈 상태를 저장해 사용자 배치를 지울 수 있다(던지면 [배치 편집]이 막힌다) |
| `userId` 를 요청 본문에 실어 저장소로 보낸다 | 서버가 `SecurityIdentity` 로만 얻는다. 저장소 구현에서 userId 를 보내지 않는다 |
| 위젯 컴포넌트 시험에 `@testing-library` 를 쓴다 | `createRoot` + `act` 를 쓴다(shared 시험 관례) |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/home/`: `WidgetWorkspace` 에 `WIDGET_REGISTRY`(`lib/generated/widget-registry.ts`)·`HOME_DEFAULT_LAYOUT`(`home-layout.ts`)·`secWidget` 저장소(`widget-store.ts`)를 넘기는 포털 홈. `pdfTarget` 으로 홈 뿌리 `.mcm-home`(인사말·공지 띠·탭 줄·보드)을 넘겨 [PDF] 를 켠다.
- `src/frontend/m-mcm/widgets/home/{이름}/`: `widget.meta.ts` + `widget.tsx` 로 이루어진 홈 위젯 11개.
- `src/frontend/m-mcm/widget-types/{typeId}/`: 정의 위젯 유형(`type.meta.ts` + `renderer.tsx` + `editor.tsx`), 생성물 `lib/generated/widget-type-registry.ts`.
- `src/frontend/m-mcm/page-components/csa/commWidgetMng/`: 위젯관리 화면 — 미리보기는 `WidgetFrame` 단독, 기본 배치 탭은 `WidgetWorkspace mode="admin"`(홈 + 기본 탭 여러 개) + 관리자 어댑터 저장소(`layout-store.ts`, 홈 → saveLayout, 기본 탭 → saveDefaultTab, `tab-N`→`def-N` 매핑).
- `src/frontend/m-mcm/page-components/home/widget-store.ts`: `secWidget` 저장소 — `fixedYn`·`origin` → `fixed`·`origin`(옛 응답은 `defaultYn`·`customYn` → `defaultTab`·`customized`), `shareTab`·`searchUsers` 구현(`resetTab` 은 서버가 거절해 없음). 홈 `page.tsx` 는 `fixedHome` 을 켠다.
