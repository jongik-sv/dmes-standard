# widget-dock 레인 정본 메모

- 레인: widget-dock (업무 화면 도구 창) / 브랜치 `feat/widget-dock` / 워크트리 `/Users/jji/project/dmes-standard-wt/widget-dock`
- 기준: dev `a4848de8` + floatable 메타(6bd18da2)
- 머리 순서: widget-meta 의 비공개(10)가 dev 에 들어간 뒤 머지(README §4-1).

## 진행

| 항목 | 커밋 | 상태 |
|---|---|---|
| WidgetMeta·WidgetTypeMeta `floatable`, 계산기·단위 변환·메모 유형 floatable | 6bd18da2 | 끝 |
| shared `widget-dock` 모델·저장소·훅·FloatingWindow·창 층·「도구」 메뉴 | df2321d7 | 끝 |
| 창·층·훅 동작 시험 | 8af9df37 | 끝 |
| PortalShell `widgetDock`·Header `toolsSlot`·portal-shell 재노출 | 55415464 | 끝 |
| m-mcm 포털 등록부 주입(`app/portal/use-dock-registry.ts`) | 33b13341 | 끝 |
| mantine-aggrid-ui 컴포넌트 문서·색인 | 41d62d4a | 끝 |
| 구조 기록·정본 메모 | (이 커밋) | 끝 |
| 브라우저 확인(포털 5100) | — | 조정 세션 요청 대기 |

시험: `pnpm exec vitest run tests/unit/widget-dock-*.unit.test.ts --maxWorkers=2`(shared) 56건 통과, 기존 portal-shell 시험 9파일 90건 통과. shared `tsc --noEmit` 0건.

## 결정(이 레인에서 정한 것)

1. **저장**: `WidgetDockStore { load(); save(windows) }` 계약. 1차는 브라우저 저장 `createBrowserDockStore(userId)` — 키 `oasis.widget-dock.v1.{userId}`, 값 `{ version: 1, windows }`, 모양 검사로 손상값 무시, 읽기·쓰기 실패 무시. **서버 저장은 후속**(같은 계약을 구현해 `widgetDock.store` 로 넘기면 된다).
2. **창 ID = 위젯 본체 instanceId**. 메모는 (사용자, instId)로 서버에 저장하고 instId 규칙이 `[A-Za-z0-9_-]{1,40}`·사용자당 100개이며 서버는 메모를 지우지 않는다(배치 저장과 무관 — secWidget 탭 저장은 SEC_USER_WIDGET 만 지운다, 임시본 정리는 7일 TTL 만). 그래서 창 ID 를 위젯·자리마다 고정했다 — 첫 창 `dk-{위젯ID 정리 25자}-{해시}`, 같은 위젯 두 번째부터 빈 첫 자리 `…-2`~`…-8`(최대 38자). 닫았다 다시 열어도 같은 메모, 서버 행은 위젯당 최대 8개.
   - 위젯 본체는 탭 맥락(TabPageContext·MdmMetaProvider) 밖에서 그려진다. 계산기·단위 변환·메모 본체와 `_content`·`lib/http` 는 탭 맥락을 읽지 않는다(메모 요청 menuId 는 고정 "HOME") — grep 으로 확인.
3. **틀 주입(frame)**: `PortalShellWidgetDock.frame` 을 필수로 더했다(착수 지시의 `{registry, registryStatus, store?}` 에 추가). shared 가 진입점마다 따로 묶여(tsup `splitting:false`) 셸이 `WidgetFrame` 을 직접 쓰면 `WidgetFrameContext` 가 위젯 본체와 갈리기 때문이다.
4. **크기·배치**: 칸당 40×30px, 최소 220×160, 창 8개 한도, 새 창은 오른쪽 위(오른쪽 32px·위 72px)에서 28px 계단식, 접힌 아이콘 44px(제목 첫 글자), 끌기 임계 4px, 저장 지연 400ms.
5. **z-index 160**: 셸 쌓임 맥락에서 탭 화면 일반 요소(1~2)·AppShell 머리(100)·사이드바 위, Mantine 모달(200)·Menu/Popover/Select 드롭다운(300)·공용 Modal(9999)·알림(10000) 아래. 위젯·「도구」 메뉴가 body 로 띄우는 팝오버는 창 위에 보인다.
   - 사이드바 폭 조절 손잡이(z 1002)가 창 위에서 마우스를 가로채던 결함(리뷰 1)은 도크 값을 1002 위로 올리지 않고 **`.sidebar-container` 에 `z-index: 150`**(자기 쌓임 맥락)을 줘 손잡이를 사이드바 안에 가두는 것으로 고쳤다. 도크만 1002 위로 올리면 Mantine 모달(200)·팝오버(300)가 창 뒤로 깔리고 「도구」 메뉴가 새 창 뒤에 열린다. 탭 전체 화면의 슬라이딩 사이드바(z 140)는 원래 같은 방식이다. 전체 화면은 문서 전체(`documentElement`)를 올리므로 창이 그대로 보인다.
   - 탭 화면 안에서 연 드롭다운(탭 목록·page-layout·ComboBox, z 1000)은 셸 쌓임에 참여해 창 위에 보인다 — 방금 연 메뉴가 창에 가려지지 않는 쪽이 맞아 그대로 둔다.
6. **접힘**: 본문(WidgetFrame)을 마운트한 채 `display:none` — 계산기 값·편집 중 메모가 남는다. 틀이 폭 0 을 무시하고 숨은 동안 자동 새로 고침을 멈춘다.
7. **정리 시점**: 등록부가 `ready` 일 때만 없는·사용 중지·floatable 아닌 위젯 창과 multiple=false 중복 창을 지우고 저장한다. 정의 조회 전(loading)·실패(error)에는 지우지 않고 그리지만 않는다.
8. **창 막대 제목**: 막대에 `meta.title` 을 보이고 WidgetFrame 제목 줄은 그대로 둔다(제목이 두 번 보인다). 메모 이름(useWidgetTitle)은 틀 제목 줄에만 나타나므로 틀 제목을 숨기지 않았다 — 아래 요청 1.
9. **로그아웃**: 도크 저장값은 지우지 않는다(사용자 키라 다음 사용자에게 보이지 않는다). 로그아웃 중에는 저장하지 않는다.

## 남은 일

1. **후속 — 서버 저장**: `WidgetDockStore` 서버 구현(예: secWidget 계열 서비스)으로 바꿔 PC 간에도 유지.
2. **후속 — 정의 조회 중복**: 포털 진입 때 `widgetDef/list` 를 포털(도크)과 홈이 따로 부른다(가이드 R15). 포털이 받은 정의를 올려 두고 홈이 읽게 바꾸면 한 번으로 줄어든다 — 홈(`page-components/home/**`)은 이 레인 소유 밖이라 하지 않았다.
3. **후속 — 브라우저 확인**: 포털에서 계산기·단위 변환·메모 창 띄우기·옮기기·크기·접기·탭 전환 유지·다시 로그인 복원을 조정 세션에 요청.
4. **소유 밖 요청(shared/src/widget)**:
   - 요청 1: `WidgetFrame` 에 제목 줄 제목을 숨기는 prop 또는 제목 변경 콜백(`onTitleChange`) — 도크 창 막대와 틀 제목이 겹치지 않게, 메모 이름을 막대에 보이게.
   - 요청 2: `WidgetFrameContext` 를 TabPageContext·MdmMeta 처럼 `globalThis` 캐시로 — 그러면 `frame` 주입 없이 셸이 틀을 직접 써도 된다.
5. **후속 — 셸 다시 그리기**: 도크 상태가 `PortalShell` 에 있어 창 놓기·접기·닫기·앞으로 가져오기마다 Header·Sidebar·TabsBar(memo 아님)가 다시 그려진다(탭 화면 슬롯은 memo 라 그대로). 끄는 동안은 창 안에서만 그리므로 이벤트당 한 번이다. 줄이려면 도크 상태를 작은 외부 저장소로 옮기고 「도구」 메뉴·창 층 두 곳만 구독하게 한다.
6. **기존 문제(이 레인 아님)**: mantine-aggrid-ui `ui_docs.py coverage` 의 `useWidgetVisible` 미등재 1건.
