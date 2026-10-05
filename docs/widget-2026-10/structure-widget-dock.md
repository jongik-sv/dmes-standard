# widget-dock 레인 구조 변경 기록

업무 화면 도구 창(포털 머리 「도구」 → floatable 위젯을 떠 있는 창으로). 형식은 `.claude/skills/coordinator/templates/lane-rules-README.md` §6.1.

## S1. shared `widget-dock` 모듈 신설
- 커밋: df2321d7, 8af9df37(시험)
- 바뀌기 전: 위젯은 홈 보드(`WidgetWorkspace`) 안에서만 그려졌다. 떠 있는 창 부품이 없었다.
- 바뀐 뒤: `src/frontend/shared/src/widget-dock/` — `types.ts`(DockWindow·WidgetDockStore), `dock-model.ts`(순수 함수: 열기·계단식 배치·칸→px·자르기·앞으로·접기·닫기·8개 한도·ready 정리·multiple=false 재사용·고정 창 ID), `browser-dock-store.ts`(사용자 ID 키 브라우저 저장, 손상값 무시), `use-widget-dock.ts`(불러오기·400ms 디바운스·언마운트/사용자 바뀜/pagehide 저장), `FloatingWindow.tsx`(범용 떠 있는 창), `WidgetDockLayer.tsx`(창 층), `DockToolsMenu.tsx`(「도구」 메뉴), `styles.tsx`(`<style href precedence>`).
- 바꾼 이유: 사용자 결정 3(2026-10-05) — 계산기·단위 변환·메모를 업무 화면 위에 띄운다. 범용 부품은 Part B §18 에 따라 shared 에 둔다.
- 동작 보존 근거: 새 모듈이라 기존 호출부가 없다. `widget-dock-model`(20)·`widget-dock-store`(8)·`widget-dock-window`(20) 시험 통과.
- 영향 범위: 없음(새 파일). shared/src/widget 은 타입·`WidgetFrame` 을 import 만 한다.
- 되돌리는 방법: df2321d7·8af9df37 revert. S2·S3 이 이 모듈을 쓰므로 S3 → S2 → S1 순서로 되돌린다.

## S2. PortalShell `widgetDock`·Header `toolsSlot`, portal-shell 진입점 재노출
- 커밋: 55415464
- 바뀌기 전: `PortalShellProps` 에 도구 창 설정이 없고, 머리 오른쪽에는 사용자 메뉴만 있었다.
- 바뀐 뒤: `PortalShellProps.widgetDock?: { registry; registryStatus; frame; store? }`. 있으면 `Header toolsSlot` 에 `DockToolsMenu`, AppShell 최상위(탭 슬롯 바깥)에 `WidgetDockLayer`(z-index 160). 사용자 ID 는 `useCurrentUserState(enabled)`(셸 요청 공유), 로그아웃 중(`loggingOutRef`)·사용자 없음은 저장 안 함. `portal-shell/index.ts` 가 `export * from "../widget-dock"` 로 공개 API 를 낸다(package.json·tsup 진입점은 그대로).
- 바꾼 이유: 창을 탭 화면 바깥에 두면 탭 전환에도 저절로 유지된다. 틀(`WidgetFrame`)은 호스트가 `frame` 으로 넘긴다 — tsup `splitting:false` 라 셸 진입점이 틀을 직접 묶으면 `WidgetFrameContext`(globalThis 캐시 없음)가 위젯 본체가 읽는 것과 다른 객체가 되어 `useWidgetTitle`·`useWidgetStatus` 등이 조용히 동작하지 않는다. 빌드 결과 `dist/portal-shell.js` 에 `WidgetFrameContext`·`cm-widget__head` 가 없음을 확인했다.
- 동작 보존 근거: `widgetDock` 미지정이면 새 훅은 enabled=false 로 요청·리스너를 만들지 않고 DOM 도 그대로. 기존 셸 시험 9파일 90건 통과(portal-shell-characterization·mantine-portal-shell·portal-shell-usage·tab-order·tab-error·start-pages·menu-search·mdm-meta·module), `widget-dock-portal`(6) 통과(미지정 시 도구 버튼·창 층 없음, 지정해도 `/api/auth/me` 호출 수 같음).
- 영향 범위: `PortalShell` 을 쓰는 모든 포털(m-mcm 만 `widgetDock` 을 넘긴다). Header 를 직접 쓰는 곳 없음(셸 내부).
- 되돌리는 방법: 55415464 revert(S3 를 먼저 되돌린다 — m-mcm 이 `widgetDock` prop 을 넘긴다).

## S3. m-mcm 포털이 위젯 등록부를 만들어 주입
- 커밋: 33b13341
- 바뀌기 전: 위젯 등록부는 홈 화면(`page-components/home/page.tsx`)만 만들었다.
- 바뀐 뒤: `app/portal/use-dock-registry.ts` 가 홈과 같은 방식(코드·유형 등록부 + `fetchWidgetDefs`, `mergeWidgetRegistry` prev 재사용, `onWidgetDefsChanged` 재조회)으로 등록부를 만들고 `frame: WidgetFrame`(`@dk-oasis/shared/widget`)과 함께 `PortalShell widgetDock` 으로 넘긴다.
- 바꾼 이유: 포털 머리는 홈 탭과 별개로 등록부가 필요하다(홈 탭이 닫혀 있어도 도구 창이 떠야 한다).
- 동작 보존 근거: 기존 홈 등록부·조회는 그대로(파일 수정 없음). m-mcm `tsc --noEmit` 의 바뀐 파일 오류 0건(남은 22건은 형제 패키지 m-mdm·m-mls·m-analog dist 미빌드로 인한 기존 오류).
- 영향 범위: 포털 진입 때 `widgetDef/list` 가 한 번 더 나간다(홈도 따로 부른다 — state-widget-dock.md 후속 1).
- 되돌리는 방법: 33b13341 revert.
