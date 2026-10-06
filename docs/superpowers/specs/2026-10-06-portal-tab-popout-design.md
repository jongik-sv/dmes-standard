# 포털 탭 새 창 분리 · 같은 화면 중복 탭 설계

- 작성: 2026-10-06, 레인 tab-popout (지시 tab-popout-1), 브랜치 `feat/portal-tab-popout`
- 상태: 승인 (2026-10-06, 조정 세션 dmes-standard-90 경유 사용자 승인 — §8 항목 1~7 모두 기본안)
- 경로 분류: architectural (공개 부품 `PortalShell`·`TabsBar` 에 선택 prop 추가, 새 공통 부품 1개, 팝업 라우트 재정의)

## 1. 목적과 성공 기준

사용자 요청(2026-10-06): "화면 탭을 별도의 팝업 윈도우로 분리 가능하게, 분리하면 탭에 똑같은 화면을 더 실행할 수도 있게. 두 화면을 동시에 조회해 데이터 비교 작업을 효율적으로 하기 위해서."

두 기능을 모두 만든다.

1. 탭 우클릭 「새 창으로 분리」: 그 화면을 포털 탭·사이드바·머리 없이 단독 브라우저 창으로 띄우고, 포털의 원래 탭은 닫는다. 화면이 snapshot 으로 들고 있던 상태(검색 조건 등)를 새 창에 넘긴다.
2. 탭 우클릭 「새 탭으로 하나 더 열기」: 같은 화면을 포털 안에 탭 하나 더 연다.

성공 기준:
- 분리한 창과 포털이 같은 화면을 동시에 띄우고 각각 조회할 수 있다. 분리 뒤 포털 메뉴로 같은 화면을 누르면 새 탭이 열린다(원래 탭이 닫혔으므로).
- 분리한 창은 포털과 같은 권한·serviceId·MDM 캡션 메타로 동작한다. 메뉴 권한이 없는 화면을 URL 로 직접 열면 화면을 그리지 않는다.
- 팝업 차단 시 원래 탭은 그대로 두고 안내한다.
- 같은 화면 탭이 둘 이상이면 제목에 "(2)" 처럼 번호가 붙고, 뒤로가기·새로고침 복원이 각 탭을 구분한다.
- 기존 동작(메뉴로 같은 화면을 누르면 열린 탭으로 이동)은 그대로다.

## 2. 크기 추정 (지시서 요구)

| 묶음 | 파일 | 대략 줄 수 | 수단 |
|---|---|---|---|
| 탭 훅·히스토리 | `use-portal-tabs.ts`, `use-tab-history.ts` | +60 | D2 agent(sonnet/high) |
| 탭 막대 메뉴·번호 표시 | `tabs-bar/TabsBar.tsx` | +50 | 위와 같은 agent |
| 셸 연결·로그아웃 정리·serviceId 순수 함수 추출 | `portal-shell.tsx`, 새 `service-id.ts` | +70 / −25 | D2 |
| 분리 열기·handoff | 새 `popout.ts` | +90 | D2 |
| 단독 창 호스트(새 공통 부품) | 새 `page-window/PortalPageWindow.tsx` | +160 | D2 |
| 팝업 라우트·인증 layout | `m-mcm/app/popup/[...slug]/page.tsx`, 새 `layout.tsx` | +90 / −80 | D2 |
| 포털 연결 | `m-mcm/app/portal/page.tsx`(prop 3줄), 전송기 훅 파일 분리 | +15 / −90(이동) | D2 |
| 시험 | shared 단위 시험 5~6개 | +400 | 구현 agent 와 같이 |
| 문서 | mantine-aggrid-ui 컴포넌트 문서·색인, 이 설계 문서의 결정 기록 | +80 | D2 sonnet/medium |

핵심 제품 코드 약 10개 파일, 500줄 안팎이다. 업무 크기 M.

## 3. 현재 구조 (조사 사실)

- 탭 상태는 `usePortalTabs`(shared/src/portal-shell/use-portal-tabs.ts)가 쥔다. `openPageTab(pageId)` 는 같은 pageId 탭이 있으면 그 탭으로 포커스만 옮긴다. 탭 id 는 `${pageId}-${시각}-${난수}` 라 중복 탭 자체는 상태 구조상 가능하다.
- 탭 목록은 localStorage `oasis.portal.tabs.v1` 에 저장한다. 그래서 새 창에 포털 전체를 띄우면 두 창이 탭 목록을 서로 덮어쓴다. 새 창은 탭 없는 단독 화면이어야 한다.
- 각 탭 화면은 `TabPageSlot` 이 `TabPageContext`(pageId·serviceId·tabId)와 `MdmMetaProvider` 로 감싸 그린다. serviceId 는 메뉴 트리에서 화면의 상위 dir 메뉴 id 다. 화면의 `/api/{module}/{serviceId}/…` 호출과 버튼 권한이 이 값에 기댄다.
- 단독 라우트 `m-mcm/app/popup/[...slug]/page.tsx` 가 있지만 moduleId 를 `"mpp"` 로 고정해 두었고(포털 모듈 설정에 mpp 없음), TabPageContext·MdmMetaProvider 가 없으며, 호출처가 0건이다. 또 `/popup` 은 proxy matcher 에도, 인증 layout 에도 걸려 있지 않다. 사실상 쓰이지 않은 경로다.
- 루트 layout 의 `DmesUiProvider` 가 Mantine·Notifications·MessageProvider 를 준다. 팝업 라우트도 이 공급자 아래에 있다.
- 로그인·권한·메뉴는 쿠키 기반이라 새 창에서도 그대로 동작한다.
- 브라우저 뒤로가기 동기화(`use-tab-history.ts`)는 `history.state.portalTab` 에 pageId 만 싣고, popstate 때 같은 pageId 의 첫 탭으로 간다.
- 화면 사용 통계는 셸 안 `UsageTracker` 가 탭 id 단위로 구간을 잰다. 전송기 훅 `usePortalUsageReporter` 는 `m-mcm/app/portal/page.tsx` 안에 있다.
- `onSnapshotChange` 를 쓰는 화면은 8개뿐이다(m-mdm 7개: ruleConfirm·ruleSetConfirm·layoutConfirm·codeMng·codeConfirm·dataMng·dataItemMng, m-mcm dashboard-overview). 나머지 화면은 snapshot 에 상태를 남기지 않는다.
- 화면 사이 값 넘김은 두 방식이다. m-mdm `page-handoff`(globalThis, pageId 키)와 `rule-handoff`(sessionStorage + 전역 이벤트 `mdm-rule-edit-target`). 둘 다 `portal-open-tab` 이벤트로 대상 탭을 연다.
- `PortalShell` 을 실제로 그리는 곳은 `m-mcm/app/portal/page.tsx` 와 `m-design-dummy/src/App.tsx` 두 곳이다.

## 4. 접근 방식 비교

| 안 | 내용 | 판단 |
|---|---|---|
| A. 단독 창 호스트 + localStorage 1회 handoff (권장) | 새 창은 `/popup/{moduleId}/{pageName}?h={token}` 로 열고, 화면 하나만 그리는 호스트가 메뉴 조회로 권한·serviceId·제목을 해결한다. snapshot 은 token 키로 localStorage 에 한 번 써 두고 새 창이 읽은 뒤 지운다. | 포털 탭 저장소와 섞이지 않는다. 동기 처리라 팝업 차단 판정이 분명하다. |
| B. 새 창에 포털 전체를 띄우고 탭 하나만 보이게 | `/portal?only=…` 로 셸을 다시 쓰고 저장 키를 바꾼다. | 셸 effect 순서(복원·기본 화면·저장)를 모두 분기해야 하고 사이드바·머리 숨김 처리가 넓다. 기각. |
| C. postMessage 로 snapshot 전달 | 새 창이 준비되면 opener 가 메시지로 넘긴다. | 창 준비 시점 맞추기·재시도가 필요하고 새로고침(F5) 때 다시 받을 수 없다. 기각. |

A 안으로 간다.

## 5. 설계

### 5.1 탭 우클릭 메뉴

`TabsBar` 의 탭 동작 묶음(새로고침·캡쳐·즐겨찾기·기본 화면) 맨 앞에 두 항목을 더한다.

- 「새 창으로 분리」: `onPopoutTab?: (tabId) => void` 가 있을 때만 보인다. `canPopoutPage?: (pageId) => boolean` 이 false 면 disabled 다(5.5).
- 「새 탭으로 하나 더 열기」: `onDuplicateTab?: (tabId) => void` 가 있을 때만 보인다.
- 홈 탭에는 두 항목을 모두 숨긴다. 홈 탭은 닫을 수 없고, 저장소 복원이 홈 pageId 와 같은 탭을 버리기 때문이다.

콜백이 없으면 항목을 숨기는 방식은 기존 새로고침·캡쳐와 같다. 따라서 prop 을 넘기지 않는 사용처(m-design-dummy)는 아무것도 바뀌지 않는다.

### 5.2 중복 탭 (「새 탭으로 하나 더 열기」)

- `usePortalTabs` 에 `duplicateTab(tabId)` 를 더한다. 같은 pageId 로 새 탭 id 를 만들고, 원래 탭의 snapshot 을 복사해 넣고, 원래 탭 바로 오른쪽에 두고(기존 `newTabAnchorRef` 방식) 활성화한다. 히스토리에도 push 한다.
- snapshot 복사 이유: 비교 작업은 "같은 조건에서 하나만 바꿔 본다" 가 흔하다. snapshot 을 쓰지 않는 화면은 어차피 처음 상태로 열린다.
- 제목 번호: 표시할 때 계산한다. 같은 pageId 탭을 표시 순서대로 세어 첫 탭은 그대로, 다음부터 "화면명 (2)", "화면명 (3)" 으로 보인다. 저장되는 `title` 에는 번호를 넣지 않는다. 제목 동기화 effect 가 메뉴 표시명으로 `title` 을 덮어쓰기 때문이다. 순수 함수 `numberDuplicateTitles(tabs)` 로 두고 TabsBar 와 탭 제목 툴팁이 같이 쓴다.
- 메뉴 클릭·`portal-open-tab` 으로 같은 pageId 를 열 때: 지금 활성 탭이 그 pageId 면 그대로 두고, 아니면 표시 순서상 첫 탭으로 간다. 중복 탭이 없을 때는 지금과 같다.
- 저장·복원: 저장 구조는 이미 탭 id 단위다. 중복 탭은 바꾸지 않아도 그대로 저장·복원된다(시험으로 고정).
- 뒤로가기: `history.state` 에 `portalTabId` 를 함께 싣는다. popstate 는 `portalTabId` 로 먼저 찾고, 없으면(옛 기록·닫힌 탭) 지금처럼 pageId 로 찾는다. push 생략 판정도 탭 id 기준으로 바꾼다. 같은 pageId 의 두 탭 사이를 오갈 때 push 가 생략되던 문제가 없어진다.

### 5.3 새 창 분리 (「새 창으로 분리」)

shared 에 새 모듈 `portal-shell/popout.ts` 를 둔다.

```ts
export interface PortalPopoutHandoff { pageId: string; snapshot: unknown; createdAt: number }
/** 반환: 열린 창(성공) 또는 null(팝업 차단 전용). 그 밖의 실패는 예외로 전파한다. 동기 함수 — 클릭 처리기 안에서 await 없이 부른다. */
export function openPagePopout(args: {
  pageId: string;
  snapshot: unknown;
  buildUrl: (pageId: string, token: string) => string;
  win?: Window; // 시험용 주입
}): Window | null;
export function takePopoutHandoff(token: string): PortalPopoutHandoff | null;
```

처리 순서:
1. 남은 옛 handoff 키(만든 지 10분 넘은 `oasis.portal.popout.*`)를 지운다.
2. token(`createRandomId()` — `crypto.randomUUID` 가 없는 비보안 문맥에서도 되는 대체 포함)을 만들고, `buildUrl(pageId, token)` 과 features 를 handoff 를 쓰기 전에 만든다(여기서 던지면 남는 것이 없고 예외는 그대로 전파한다). features 는 `popup,width,height,left,top` 이며 크기는 지금 포털 창 크기, 위치는 포털 창에서 40px 비켜 둔다.
3. `oasis.portal.popout.{token}` 에 `{pageId, snapshot, createdAt}` 를 `writeSecureJson` 으로 쓴다. 쓰기가 실패(Quota 등)하면 `console.warn` 만 남기고 handoff 없이 계속한다(상태 넘김은 best-effort, 새 창은 빈 상태로 정상 표시).
4. `window.open(url, "dmes-popout-" + token, features)` 를 동기로 부른다. 창 이름을 매번 다르게 해서 같은 화면을 두 창으로 띄울 수 있게 한다. `noopener` 는 넣지 않는다. 넣으면 반환값이 늘 null 이라 차단과 구분할 수 없다. `window.open` 이 던지면 handoff 키를 지우고 예외를 다시 던진다.
5. 반환값이 null 이면 handoff 키를 지우고 null 을 돌려준다.

`PortalShell` 의 `onPopoutTab` 처리:
- 열기에 성공하면 원래 탭을 닫는다(`closeTab`). 연 창의 참조를 셸이 들고 있다가 로그아웃 때 닫는다(5.7).
- 예외(null 이 아닌 실패)면 `console.error` 후 `popout.onError?.(err)` 를 부르고 탭은 닫지 않는다. m-mcm 은 `gfn_message` 로 "새 창을 열지 못했습니다. 다시 시도해 주세요." 를 띄운다.
- null 이면 탭을 두고 `popout.onBlocked()` 를 부른다. m-mcm 은 여기서 `gfn_message` 경고 창으로 "팝업이 차단되어 새 창을 열지 못했습니다. 브라우저 주소창의 팝업 차단을 이 사이트에 대해 허용한 뒤 다시 시도해 주세요." 를 띄운다. 셸이 `useGfnMessage` 를 직접 쓰지 않는 이유는 MessageProvider 없이 셸을 그리는 시험·사용처에서 그 훅이 예외를 던지기 때문이다.
- 탭 동작 실행은 TabsBar 의 클릭 처리기에서 동기로 이어진다. 중간에 await 를 넣지 않는다.

### 5.4 단독 창 호스트 `PortalPageWindow` (새 공통 부품)

`shared/src/portal-shell/page-window/PortalPageWindow.tsx`. 포털 셸 없이 화면 하나를 탭 화면과 같은 조건으로 그린다.

```ts
export interface PortalPageWindowProps {
  pageId: string;
  menu: PortalShellMenuResponse;          // 호출부가 usePortalMenu 로 받은 내 메뉴
  resolvePage: PortalShellResolvePage;     // 포털과 같은 resolvePortalPage
  handoffToken?: string | null;            // URL 의 h
  appName?: string;                        // 창 제목 뒤쪽 이름
  onUsageSegments?: PortalShellProps["onUsageSegments"];
}
```

동작:
- 권한: pageId 가 내 메뉴(`buildMenuSearchItems` 결과)에 없으면 화면을 불러오지 않고 "이 화면을 열 권한이 없습니다." 를 보인다.
- serviceId: 셸 안에 있던 계산을 순수 함수 `buildServiceIdByPageId(menuItems)`(새 `service-id.ts`)로 옮겨 셸과 이 부품이 같이 쓴다. 셸 쪽은 동작 보존 리팩터다.
- 그리기: `TabPageContext.Provider({pageId, serviceId, tabId})` → `MdmMetaProvider {...mdmMetaTabProps(pageId)}` → `ErrorBoundary` → 화면. tabId 는 `popout-{token}`(token 이 없으면 `popout`)이다. 셸의 탭 화면과 같은 감싸기다.
- snapshot: 처음 마운트 때 `takePopoutHandoff(token)` 로 받는다. 받은 값과 이후 `onSnapshotChange` 값은 sessionStorage `oasis.portal.popoutSnap.{token}` (D7)에 둔다. 그래서 새 창에서 새로고침해도 상태가 남는다. 키에 token 을 넣는 이유는 opener 의 sessionStorage 가 복사되는 브라우저에서도 키가 섞이지 않게 하기 위해서다.
- 창 제목: `document.title = "{메뉴 표시명} - {appName}"`.
- 화면 안 이동: 새 창 안에서 `portal-open-tab` 이벤트가 나면 opener(포털)가 살아 있을 때 opener 창에 같은 이벤트를 다시 내고 opener 에 focus 를 준다. opener 가 없으면 무시한다.
- 화면 사용 통계: `onUsageSegments` 가 있으면 `UsageTracker` + `installUsageActivity` 를 창 하나 단위로 붙인다(구간 key 는 tabId). 포털 탭과 같은 규칙(첫 업무 호출부터 OPEN)이다.
- 메뉴 저장소: m-mcm 라우트가 받은 메뉴를 `publishPortalMenu` 로 올린다(메뉴 저장소를 읽는 화면이 포털과 같게 동작하도록). 이것은 m-mcm 라우트 몫이다.

`@dk-oasis/shared/portal-shell` 진입점으로 낸다. CLAUDE.md 공통 컴포넌트 행동강령에 따라 mantine-aggrid-ui 스킬의 컴포넌트 문서·색인을 같은 작업에서 갱신한다.

### 5.5 분리할 수 있는 탭

`canPopoutPage(pageId)` = pageId 가 내 메뉴에 있다. `canRegisterPage` 와 같은 판정이다. 화면 안 이동(openMdmPage·openRuleEdit)으로 연 탭은 메뉴에 없는 pageId 일 수 있다. 그런 탭을 분리하면 원래 탭은 닫히고 새 창은 "권한 없음" 이 되므로 항목을 disabled 로 둔다. 「새 탭으로 하나 더 열기」 는 포털 안이므로 제한하지 않는다.

### 5.6 팝업 라우트 정비 (m-mcm)

- 경로 규칙을 `/popup/{moduleId}/{pageName…}` 로 바꾼다. slug 첫 칸이 moduleId, 나머지가 pageName 이며 pageId = `{moduleId}:{pageName}`. `parsePageId` 로 검증한다. 호출처가 0건이라 바꿔도 깨지는 곳이 없다.
- 페이지는 `usePortalMenu(MENU_ENDPOINT)` 로 메뉴를 받고, `publishPortalMenu` 로 올리고, `PortalPageWindow` 를 그린다. 화면 로딩은 포털과 같은 `resolvePortalPage`(registered-modules)를 쓴다.
- 옛 처리 `snapshot.action === cancel/confirm/save → window.close()` 를 지운다. 호출처가 없고, 일반 화면 snapshot 에 action 칸이 있으면 창이 닫혀 버린다.
- 새 `m-mcm/app/popup/layout.tsx` 에 `portal/layout.tsx` 와 같은 서버 인증 확인(`getAuthSession` → 없으면 `/login`)을 둔다. proxy.ts 는 건드리지 않는다.
- URL 조립 함수 `buildPopoutUrl(pageId, token)` 는 m-mcm 에 두고 `PortalShell` 에 넘긴다(basePath 를 아는 쪽이 m-mcm 이다).

### 5.7 로그아웃

포털에서 로그아웃하면 셸이 들고 있던 분리 창 참조를 모두 `close()` 한다(공용 단말에서 데이터가 띄워진 창이 남지 않게). 셸 밖에서 직접 연 창이나 포털을 새로고침해 참조를 잃은 창은 닫지 못한다. 그런 창도 이후 API 호출은 인증 실패로 막힌다.

### 5.8 연결 (m-mcm/app/portal/page.tsx)

`PortalShell` 에 `popout={{ buildUrl: buildPopoutUrl, onBlocked }}` 와 `allowDuplicateTabs` 를 넘긴다. 셸은 `popout` 이 있을 때 `onPopoutTab` 을, `allowDuplicateTabs` 가 true 일 때 `onDuplicateTab` 을 TabsBar 에 넘긴다. 둘 다 없으면 지금과 같다.
화면 사용 전송기 훅 `usePortalUsageReporter` 는 팝업 라우트도 써야 하므로 `m-mcm/app/portal/use-portal-usage-reporter.ts` 로 옮긴다(내용 변경 없음).

## 6. 시험

shared 단위 시험(vitest, jsdom):
- `use-portal-tabs`: `duplicateTab` 이 같은 pageId 새 탭을 원래 탭 오른쪽에 만들고 snapshot 을 복사한다. 같은 pageId 열기는 활성 탭이 그 pageId 면 머문다. 중복 탭 저장·복원이 유지된다. 기존 characterization·tab-order 시험이 그대로 통과한다.
- `use-tab-history`: 같은 pageId 두 탭 사이 전환이 push 된다. popstate 가 `portalTabId` 로 정확한 탭을 고른다. `portalTabId` 없는 옛 state 는 pageId 로 찾는다.
- `TabsBar`: 콜백 없으면 두 항목이 없다. 홈 탭에는 없다. `canPopoutPage` false 면 disabled. 중복 제목 번호 표시.
- `popout.ts`: 열기 성공 시 handoff 를 쓰고 창을 돌려준다. `window.open` 이 null 이면 키를 지우고 null. 10분 지난 키 정리. `takePopoutHandoff` 는 한 번만 준다.
- `PortalPageWindow`: 메뉴에 없는 pageId 는 화면을 불러오지 않는다. TabPageContext 에 serviceId·tabId 가 들어간다. handoff snapshot 이 화면 props 로 들어가고 sessionStorage 에 남는다. 새 창 안 `portal-open-tab` 이 opener 로 넘어간다.
- `buildServiceIdByPageId`: 셸 안에 있던 계산과 같은 결과(기존 셸 시험이 함께 지킨다).
- 셸: `popout` 이 있을 때 분리 성공이면 탭이 닫히고, 차단이면 탭이 남고 `onBlocked` 가 불린다. 로그아웃 때 연 창을 닫는다.

시험은 SQLite·도커와 무관한 프론트 단위 시험뿐이다. 머지 직전 전체 시험은 `.claude/skills/dflow-dev/scripts/heavy.sh` 로 한 번 돌린다. 브라우저 확인(실제 팝업 창·차단 안내·rule-handoff 동작)은 머지 뒤 조정 세션이 한다.

## 7. 한계 (이 레인에서 고치지 않는 것)

- 상태 넘김은 snapshot 을 쓰는 화면(현재 8개)에서만 효과가 있다. 나머지 화면은 새 창에서 처음 연 상태로 뜬다. 화면별 snapshot 적용은 다른 모듈 화면 수정이라 범위 밖이다.
- 새 창 안에서 다른 화면으로 가는 이동은 opener 포털에 pageId 만 넘긴다. m-mdm `page-handoff`(globalThis) 값과 `rule-handoff`(sessionStorage) 값은 새 창의 것이라 포털로 가지 않는다. 그 이동은 대상 화면을 빈 조건으로 연다.
- 같은 화면 탭 두 개가 같은 전역 이벤트(예: `mdm-rule-edit-target`)를 함께 받는다. 룰 조회에서 룰 화면으로 갈 때 룰 화면 탭이 둘이면 둘 다 그 룰로 바뀐다.
- 분리한 창을 닫아도 포털 탭으로 되돌아오지 않는다. 다시 보려면 메뉴로 연다.
- 포털을 새로고침하면 셸이 분리 창 참조를 잃어 로그아웃 때 그 창을 닫지 못한다.

후속 과제 (사용자 확정 2026-10-06):
- F1. snapshot 을 쓰지 않는 화면에도 검색 조건 등 화면 상태를 snapshot 에 남겨, 새 창 분리·중복 탭에서 상태가 넘어가게 한다. 화면이 속한 모듈 레인에서 화면별로 진행한다.

## 8. 사용자 판단 필요 항목 (조정 세션 경유)

2026-10-06 결과: 항목 1~7 모두 기본안으로 승인. 항목 3 은 한계로 두고 §7 후속 과제 F1 로 등록했다.

| # | 항목 | 선택지 | 기본안 |
|---|---|---|---|
| 1 | 공개 부품 prop 추가·연결 파일 | (a) `PortalShell` 에 선택 prop `popout`·`allowDuplicateTabs`, `TabsBar` 에 `onPopoutTab`·`onDuplicateTab`·`canPopoutPage` 를 더하고, 미지정이면 지금과 같게 둔다. 켜는 곳은 `m-mcm/app/portal/page.tsx` 몇 줄(소유 밖 파일)이다. (b) shared 에서 기본으로 켠다(공개 부품 동작 변경). | (a). page.tsx 수정(prop 2개·전송기 훅 파일 분리)을 함께 승인 요청한다. |
| 2 | 새 공통 부품 `PortalPageWindow` 등록 | shared portal-shell 진입점으로 낸다(행동강령상 묻지 않는 신규 등록). | 등록. 알림 목적으로 적는다. |
| 3 | 상태 넘김 범위 | (a) snapshot 을 쓰는 8개 화면만 상태가 넘어간다는 한계를 받아들인다. (b) 다른 화면에도 snapshot 저장을 넣는 후속 작업을 따로 만든다. | (a), 필요하면 (b)를 후속 과제로 등록한다. |
| 4 | 「새 탭으로 하나 더 열기」 의 상태 | (a) 원래 탭 snapshot 을 복사한다. (b) 빈 상태로 연다. | (a) |
| 5 | 분리 창 화면 사용 통계 | (a) 포털 탭과 같은 규칙으로 잰다(창 하나 = 탭 하나). (b) 재지 않는다. | (a) |
| 6 | 로그아웃 때 분리 창 닫기 | (a) 셸이 연 창을 닫는다. (b) 두고 API 인증 실패에 맡긴다. | (a) |
| 7 | 메뉴에 없는 화면(화면 안 이동으로 연 탭)의 분리 | (a) 「새 창으로 분리」 를 disabled 로 둔다. (b) 권한 판정을 넓힌다. | (a) |

## 9. 결정 기록

| 번호 | 결정 | 근거 |
|---|---|---|
| D1 | 새 창은 포털 셸이 아니라 단독 호스트로 띄운다 | 탭 저장소(`oasis.portal.tabs.v1`) 공유로 두 창이 서로 덮어쓰는 문제를 원천 차단 |
| D2 | snapshot 은 localStorage token 키 1회 handoff + 새 창 sessionStorage 보관 | 동기 처리로 팝업 차단 판정이 분명하고, 새 창 새로고침에도 상태 유지 |
| D3 | `window.open` 에 noopener 를 넣지 않는다 | 넣으면 반환값이 늘 null 이라 팝업 차단과 구분 불가. 같은 출처 창이라 opener 노출 위험 없음 |
| D4 | 중복 탭 번호는 표시 때 계산하고 저장 제목에 넣지 않는다 | 제목 동기화 effect 가 메뉴 표시명으로 덮어씀 |
| D5 | 히스토리 state 에 탭 id 를 싣고 pageId 는 대체 키로 둔다 | 중복 탭 사이 뒤로가기 구분, 옛 기록 호환 |
| D6 | `/popup` 경로는 첫 칸을 moduleId 로 재정의하고 인증 layout 을 둔다 | 기존 경로는 mpp 고정·호출처 0건·인증 없음 |
| D7 | 분리 창 snapshot 의 sessionStorage 키를 `oasis.portal.popoutSnap.{token}` 으로 정한다(설계 5.4 초안의 `oasis.portal.popout.snap.{token}` 에서 변경) | 구현 계획(Global Constraints)에서 handoff 키 접두 `oasis.portal.popout.` 와 이름이 겹치지 않게 갈랐다. 두 키는 저장소도 다르다(handoff localStorage, snapshot sessionStorage) |
| D8 | 분리 실패 계약 — null 은 팝업 차단 전용, 그 밖의 실패는 예외로 전파해 셸이 onError 로 알림. 토큰은 비보안 문맥(http IP 접속)에서도 되는 createRandomId. 로그아웃 때 handoff 키 삭제 — 최종 리뷰(2026-10-06) | 다른 실패를 null 로 삼키면 호출부가 "팝업 차단을 허용하라"는 틀린 안내를 띄운다 |
