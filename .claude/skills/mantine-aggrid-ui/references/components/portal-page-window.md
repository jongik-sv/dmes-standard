# PortalPageWindow

포털 셸(사이드바·탭 막대) 없이 업무 화면 하나를 포털 탭 안과 같은 조건으로 그리는 단독 창 호스트다. 포털 탭 우클릭 「새 창으로 분리」 가 여는 `/popup/…` 라우트가 쓴다. 권한 확인·화면 불러오기·공통 감싸기·상태 보관·창 제목·화면 사용 통계까지 한 번에 맡는다.

- import: `import { PortalPageWindow, openPagePopout, type PortalPageWindowProps, type PortalShellPopout } from "@dk-oasis/shared/portal-shell";` (CSS 는 포털과 같은 `portal-shell.css`·`grid.css`·`form.css`·`modal.css` 를 라우트가 import 한다)
- 소스: `src/frontend/shared/src/portal-shell/page-window/PortalPageWindow.tsx`, 열기·넘김 함수 `src/frontend/shared/src/portal-shell/popout.ts`, serviceId 계산 `portal-shell/service-id.ts`(`buildServiceIdByPageId`, 셸과 이 부품이 같이 쓰는 내부 함수라 진입점으로 내지 않는다)
- 내부 구현: `TabPageContext.Provider` → `MdmMetaProvider` → `ErrorBoundary` → 화면. 셸의 탭 화면과 같은 감싸기다. 메뉴·권한 판정은 셸과 같은 `buildMenuSearchItems` 를 쓴다
- 진입점: 별도 서브패스 없이 `portal-shell` 진입점으로 낸다(2026-10-06 탭 분리 회차). 지금 쓰는 곳은 m-mcm `/popup` 라우트 하나다.

## 언제 쓰나

- 쓴다: 포털 탭 하나를 별도 브라우저 창으로 떼어 내 보여 줄 때(두 화면을 나란히 놓고 비교). 호출부는 모듈의 `/popup` 라우트다.
- 쓰지 않는다: 포털 탭 안에서 화면을 여는 일 → `PortalShell` 이 맡는다. 업무 화면 위에 띄우는 도구 창 → [widget-dock](widget-dock.md)·[FloatingWindow](floating-window.md). 사용자의 답을 기다리는 창 → [Modal](modal.md).

## 표준 사용

탭 쪽(포털 페이지)은 `PortalShell` 에 `popout` 과 `allowDuplicateTabs` 를 넘긴다. 둘 다 선택 prop 이라 안 넘기면 우클릭 메뉴에 「새 창으로 분리」·「새 탭으로 하나 더 열기」 가 생기지 않는다(`m-mcm/app/portal/page.tsx`).

```tsx
<PortalShell
  /* …기존 props */
  popout={{ buildUrl: buildPopoutUrl, onBlocked: () => gfn_message("팝업이 차단되어 …", "", "", "warning") }}
  allowDuplicateTabs
/>
```

창 쪽은 `/popup/{moduleId}/{pageName…}?h={token}` 라우트 한 파일이다. 메뉴 조회가 끝난 뒤에 `PortalPageWindow` 를 마운트한다.

(줄임 — 실제 라우트는 m-mcm `app/popup/[...slug]/page.tsx`)

```tsx
"use client";
import { use } from "react";
import { PortalPageWindow, usePortalMenu } from "@dk-oasis/shared/portal-shell";
import "@dk-oasis/shared/portal-shell.css";
import { resolvePortalPage } from "../../portal/registered-modules";
import { popupSlugToPageId } from "../popup-target";

export default function PopupRoute({ params, searchParams }: { params: Promise<{ slug: string[] }>; searchParams: Promise<{ h?: string | string[] }> }) {
  const { slug } = use(params);
  const { h } = use(searchParams);
  const pageId = popupSlugToPageId(slug);
  const { menu, isLoading, errorMessage } = usePortalMenu({ endpoint: "/api/mcm/oasis/secUser/myMenusTree" });

  if (!pageId) return <p>잘못된 화면 경로입니다.</p>;
  if (isLoading) return <p>로딩 중...</p>;
  if (!menu || errorMessage) return <p>{errorMessage ?? "메뉴를 불러올 수 없습니다."}</p>;
  return (
    <PortalPageWindow
      pageId={pageId}
      menu={menu}
      resolvePage={resolvePortalPage}
      handoffToken={typeof h === "string" ? h : null}
      appName="DMES Portal"
      onUsageSegments={onUsageSegments}
    />
  );
}
```

실제 라우트는 위에 더해 `publishPortalMenu(menu.items)`(메뉴 저장소를 읽는 화면용)와 포털과 같은 사용 전송기 훅 `usePortalUsageReporter` 를 쓰고, `popup/layout.tsx` 에서 `portal/layout.tsx` 와 같은 서버 인증 확인을 한다.

## Props (`PortalPageWindowProps`)

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| pageId | `string` | 필수 | `{moduleId}:{pageName}`. 내 메뉴에 없으면 화면을 불러오지 않고 「이 화면을 열 권한이 없습니다.」 를 보인다 |
| menu | `PortalShellMenuResponse` | 필수 | 호출부가 `usePortalMenu` 로 받은 내 메뉴. 권한·serviceId·창 제목을 이것으로 정한다 |
| resolvePage | `PortalShellResolvePage` | 필수 | pageId → 화면 컴포넌트. 포털과 같은 `resolvePortalPage`. 렌더마다 새 함수여도 화면을 다시 불러오지 않는다 |
| handoffToken | `string \| null` | `null` | URL 의 `h`. 있으면 탭에서 넘긴 상태(snapshot)를 한 번 받고, 이 창의 새로고침에도 상태를 잇는다. 없으면 상태 없이 처음 상태로 연다 |
| appName | `string` | `"DMES"` | 창 제목 `"{메뉴 표시명} - {appName}"` 의 뒤쪽 |
| onUsageSegments | `(segments, { reason }) => void \| Promise<void>` | - | 있으면 화면 사용 통계를 이 창 하나 단위로 잰다(첫 업무 호출부터 OPEN, 구간 키는 tabId) |
| opener | `Window \| null` | `window.opener` | 시험용. 창 안 `portal-open-tab` 을 넘길 포털 창 |

화면은 탭과 같은 `tabId`(`popout-{token}`, token 이 없으면 `popout`)·`snapshot`·`onSnapshotChange` 로 받는다. 화면 쪽은 바꿀 것이 없다.

## 열기·넘김 함수 (`popout.ts`)

`PortalShell` 이 우클릭 항목을 처리할 때 부르며, 다른 곳에서 직접 열어야 하면 같은 함수를 쓴다.

| 이름 | 설명 |
|---|---|
| `openPagePopout({ pageId, snapshot, buildUrl, win?, now?, createToken? })` | handoff 를 쓰고 `window.open` 을 부른다. 열린 창 또는 `null`(팝업 차단·이때 handoff 를 지운다). **동기 함수** |
| `takePopoutHandoff(token)` | handoff 를 읽고 바로 지운다. 한 번만 준다. 10분(`POPOUT_HANDOFF_TTL_MS`) 지났거나 없으면 `null`(타입 `PortalPopoutHandoff`) |
| `readPopoutSnapshot(token)` / `writePopoutSnapshot(token, snapshot)` | 이 창 sessionStorage 의 snapshot 읽기·쓰기. 읽기는 `{ found, snapshot }` |
| `POPOUT_HANDOFF_PREFIX`·`POPOUT_SNAPSHOT_PREFIX`·`POPOUT_HANDOFF_TTL_MS` | 저장 키 접두와 만료 시간 |
| `PortalShellPopout` | `PortalShell` 의 `popout` prop 타입 `{ buildUrl(pageId, token); onBlocked?() }`. `buildUrl` 은 basePath 를 아는 모듈이 `/popup/…` URL 을 만든다 |

저장 위치:

- handoff: `localStorage` `oasis.portal.popout.{token}` (`writeSecureJson`). 새 창이 읽은 즉시 지운다. 새 창을 안 열고 남은 것은 다음 분리 때 10분이 넘은 키부터 정리한다.
- 창 snapshot: `sessionStorage` `oasis.portal.popoutSnap.{token}` (평문 JSON). 새 창이 처음 받은 값과 이후 `onSnapshotChange` 값을 둔다.
- 포털 탭 저장소 `oasis.portal.tabs.v1` 은 읽지도 쓰지도 않는다. 두 창이 탭 목록을 서로 덮어쓰지 않게 하려는 것이다.

## 표준값: 모든 화면 동일

- 창 크기·위치는 지금 포털 창 크기(최소 640×480)에서 40px 비켜 둔다. 창 이름은 `dmes-popout-{token}` 이라 같은 화면을 두 창으로 띄울 수 있다.
- 분리가 성공하면 셸이 원래 탭을 닫고, 포털 로그아웃 때 셸이 들고 있는 분리 창을 닫는다(포털을 새로고침해 참조를 잃은 창은 닫지 못한다).
- 창 안에서 `portal-open-tab` 이벤트가 나면 포털 창(opener)이 살아 있을 때 그쪽으로 다시 내고 앞으로 가져온다. opener 가 없거나 닫혔으면 아무 일도 없다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `openPagePopout` 앞에 `await` 를 두거나 클릭 처리기 밖(타이머·`then`)에서 부름 | 팝업 차단에 걸린다. 클릭 처리기 안에서 동기로 부른다. `PortalShell` 의 `onPopoutTab` 이 이미 그렇게 한다 |
| `window.open` features 에 `noopener` 를 넣음 | 반환값이 늘 `null` 이라 차단과 구분할 수 없다. 같은 출처 창이라 넣지 않는다 |
| 메뉴 조회가 끝나기 전에 `PortalPageWindow` 를 마운트하려 함 | `menu` 는 필수 prop 이라 호출부가 메뉴 조회를 끝낸 뒤에 마운트한다(그 동안 호스트가 로딩을 그린다). 메뉴에 없는 pageId 로 마운트하면 handoff 는 마운트 때 소비되어 사라지고 화면은 그려지지 않는다(「권한 없음」) |
| 화면이 메뉴에 없는 pageId(화면 안 이동으로 연 탭)인데 분리를 허용함 | 창은 「권한 없음」 이 되고 원래 탭만 닫힌다. `PortalShell` 이 `canPopoutPage` 로 항목을 비활성으로 둔다 |
| 포털 탭 저장소·`useGfnMessage` 를 이 부품이나 셸에서 직접 씀 | 탭 저장소는 건드리지 않는다. 차단 안내는 호출부가 `popout.onBlocked` 로 한다(셸은 MessageProvider 없이도 그려져야 한다) |
| 분리 창에서 쓰는 화면이 snapshot 을 안 씀 | 상태가 넘어가지 않고 처음 상태로 열린다. 지금은 snapshot 을 쓰는 화면만 넘어간다(설계 §7 후속 F1). 이 부품이 아니라 그 화면이 snapshot 을 남기게 고친다 |
| 다른 모듈에서 같은 라우트를 만들며 경로 규칙을 바꿈 | `/popup/{moduleId}/{pageName…}` 로 두고 `popupSlugToPageId`·`buildPopoutUrl`(m-mcm `app/popup/popup-target.ts`)을 본보기로 쓴다. OASIS 경로가 모듈별로 갈리므로 basePath 는 모듈이 정한다 |

## 실제 사용 예

- `src/frontend/m-mcm/app/popup/[...slug]/page.tsx`: 메뉴를 받아 `PortalPageWindow` 를 그리는 `/popup` 라우트.
- `src/frontend/m-mcm/app/portal/page.tsx`: `popout`·`allowDuplicateTabs` 로 탭 우클릭 항목을 켠다.
- 설계: `docs/superpowers/specs/2026-10-06-portal-tab-popout-design.md` §5.3~5.6, 한계 §7.
