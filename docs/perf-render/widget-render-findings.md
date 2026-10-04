# 홈 대시보드 위젯 중복 렌더·요청 분석 (widget-render-findings)

- 대상: m-mcm 홈 대시보드 위젯(코드 위젯 11종 + 공용 위젯 계층). 1차 스캔 가설 W1~W7·F3 의 측정 판정.
- 측정: 2026-10-05 00:31~00:36, 워크트리 `.claude/worktrees/zcode-widgets`(브랜치 `perf/widget-render`, 기준 dev 4de0954f). **제품 코드 수정 없음.**
- 하네스: `scripts/perf/render/count-renders-home.mjs`(신규, 5027e44a + 방어 수정 3b87baf8). profiling 번들(`next build --profile --no-mangling`), 가짜 DevTools 훅으로 커밋·컴포넌트 집계, `/api/` 요청 기록.
- 동작(회차마다 새 컨텍스트·새 로그인): ①홈 진입 ②공지 목록 행 클릭(읽기) ③용어 관리 메뉴 탭 ④홈 탭 복귀 ⑤뷰포트 1600→1200 ⑥가만히 60초. 3회, 중앙값.
- 원자료(저장소 밖): `…/scratchpad/zcode-worker/widgets-raw/home-renders.json`(회차별 커밋·요청 원문), 같은 폴더 `repro-crash.mjs`·`tags-*-out*.txt`·`renderer-spin-sample.txt`(§1 하네스 결함 조사).
- 조건: AC 전원, lowpowermode 0, 회차 load1 1.97~2.47(측정 직전 2.60, next build·tsup 없음 확인). 서버 `next start -p 5301`(본인 기동·종료). 계정 admin/admin123, 로그인 실패 0회. 화면 읽기만.

## 0. 결론

1. **W1 참 — 홈 진입에 `secWidget/search` 3회 + 보드 전체 2회 구성.** 요청 타임라인(+0.00 auth/me → +0.07 `secWidget` #1·#2 동시 → +0.12 #3)이 코드 분석의 유발 순서(mount → userId 해결 → widgetDef/list 해결 후 registry 교체)와 일치한다. WidgetFrame 마운트 22회 = 11개 위젯 × 2회(+0.08s 본체 없는 프레임 72마운트 → +0.19s 본체 포함 206마운트). 진입 커밋 102회·67.4ms.
2. **W4 참 — `secFavorite/search` 진입 3회 + 홈 탭 복귀마다 1회.** 진입 3회 = 셸 사이드바(1) + quickLinks 위젯 마운트 2회(W1 리마운트에 끌려 2회). 복귀 1회는 K5 수정 방침(자기 탭 활성화 시 재요청) 그대로.
3. **W8(신규) 참 — 공지 행 클릭 하나에 보드 전체 재렌더.** `useNoticeStore`가 통째 상태를 반환하는데 홈 페이지(`page-components/home/page.tsx:43`)가 구독 중이라, 행 선택(`selectedId`)만 바뀌어도 페이지→WidgetWorkspace→WidgetBoard→프레임 11개로 이어진다(커밋 2회, 219개 컴포넌트 갱신, 8.6~15.9ms).
4. **숨은 탭·유휴는 깨끗하다.** 다른 메뉴 탭 열기 뒤 홈 복귀는 커밋 4회·마운트 0회(재요청은 secFavorite 1회뿐). 60초 대기 커밋 0회·요청 0회 — 기본 배치엔 타이머·폴링이 없다(W5 media·W6 refreshSec 는 기본 배치 밖이라 미계측).
5. **창 크기 변경은 전 위젯 재렌더(마운트 없음).** 1600→1200 에 커밋 34회·13ms, WidgetFrame 143회(11×13) 렌더. ResizeObserver→`useWidgetBodySize` 체인으로 프레임·본체가 함께 다시 그려진다. 비용은 작지만 "위젯 하나가 아니라 보드 전체"라는 구조적 특징은 기록할 만하다.
6. **`noticeBoard/search`·`widgetDef/list`·`auth/me` 는 각 1회** — 모듈 가드(notice-store.ts:43-45)·세션 캐시(K1)가 진입 중 보드 재구성에도 불구하고 중복을 막았다.

## 1. 하네스 결함 조사(기록)

첫 측정부터 chrome-headless-shell 이 포털 부팅 중 `EXC_BREAKPOINT`(SIGTRAP, ThreadPoolForegroundWorker 스레드)로 죽어 측정이 불가했다. 훅 변형을 이분법으로 좁힌 결과:

| 훅 변형 | 결과 |
|---|---|
| `onCommitFiberRoot` 비운 훅(noop) | 크래시 없음, 정상 부팅 |
| fiber 트리를 탐색하는 훅(원자 배열 누적 유무 무관) | SIGTRAP 크래시 또는 렌더러 99% CPU 무한 스팬(위젯 안 뜸) |
| 방문 집합(seen)을 넣은 탐색 | 102커밋·깊이 152·재방문(순환) 0 으로 유한하게 종료, 정상 부팅 |

- `sample(1)` 로 잡은 스팬 스택은 JIT 주소 `0x177fc4c30` 에서 같은 프레임 수천 개 — JS 자기재귀 폭주.
- 전체 chromium 바이너리(`channel: 'chromium'`)로 바꿔도 재현 → 바이너리 문제가 아니다.
- 방어 없는 판이 한 번은 정상 완료(34,291 노드)하기도 했다 — **비결정적**이며, 부팅 타이밍에 따른 일시적 fiber 트리 상태에서만 폭주한다. 순환은 관측되지 않았다(방문 집합 판에서 cycles 0).
- **근본 원인은 규명하지 못했다.** 커밋당 방문 집합 + 깊이 상한 1000 을 넣어 폭주를 막았다(3b87baf8). 정상 트리(순환·공유 없음)에서 집계 의미는 변하지 않는다.

## 2. 동작별 측정 (3회 중앙값)

| 동작 | 커밋 | React 시간 합 | 주요 요청 |
|---|---|---|---|
| ① 홈 진입 | 102 (101/103/102) | 67.4ms | `secWidget/search` **3회**, `secFavorite/search` **3회**, `widgetDef/list`·`noticeBoard/search`·`auth/me`·`myMenusTree`·`secStartPgm`·`mdmMeta/columns`·`mdmMeta/domains` 각 1회 |
| ② 공지 행 클릭 | 2 (2/2/2) | 11.7ms | 0건 |
| ③ 용어 관리 탭 | 22 (22/23/20) | 20.3ms | 해당 화면 몫(홈 위젯 재요청 없음) |
| ④ 홈 탭 복귀 | 4 (4/4/4) | 4.3ms | `secFavorite/search` **1회** |
| ⑤ 창 폭 1600→1200 | 34 (34/34/34) | 13.0ms | 0건 |
| ⑥ 60초 대기 | 0 | 0ms | 0건 |

- ③④: 숨은 홈 탭은 언마운트되지 않는다(④ 마운트 0). ③의 22커밋은 termMng 화면 자체 부팅 몫이다.
- ⑤: 마운트 0, WidgetFrame 렌더 143회(11프레임 × 13)·KpiTile 78회·Badge 247회 — 전부 갱신 렌더.

### 2.1 진입 요청 타임라인 (round 2 원자료)

```
+0.00s GET  auth/me
+0.00s POST secFavorite/search        # 셸 사이드바(app/portal/page.tsx:313)
+0.07s POST secWidget/search  #1      # 마운트 effect(user=null, defs=loading)
+0.07s POST widgetDef/list
+0.07s POST noticeBoard/search        # 모듈 가드로 1회뿐
+0.07s POST secWidget/search  #2      # userId null→id 로 sourceChanged
+0.12s POST secWidget/search  #3      # widgetDef/list 해결 → registry 교체 → load 재실행
+0.12s POST secFavorite/search #2     # quickLinks 마운트(보드 1차)
+0.20s POST secFavorite/search #3     # quickLinks 리마운트(보드 2차)
```

### 2.2 진입 컴포넌트 (round 2, 상위·위젯 본체)

| 컴포넌트 | 렌더 | 마운트 | 비고 |
|---|---|---|---|
| Anonymous | 452 | 283 | |
| @mantine/core/Box | 392 | 152 | |
| WidgetFrame | 165 | **22** | 11 위젯 × 2회 보드 구성 |
| WidgetErrorBoundary | 165 | 22 | |
| GridItem·DraggableCore·Resizable | 각 33 | 각 22 | react-grid-layout 항목 |
| KpiWidget | 12 | **2** | 본체 2회 마운트 |
| AlarmsWidget·MonthlyWidget·QuickLinksWidget·NotificationsWidget·EquipmentWidget·ProcessWidget·DefectWidget | 각 12 | **2** | |
| NoticeWidget·WorkOrdersWidget·ShipmentsWidget | 각 12 | 1 | 2차 보드에서만 마운트 |

- 보드 구성 파형: `+0.08s` 커밋(프레임 11개·총 72마운트, **본체 없음** — registry 미도착) → `+0.19s` 커밋(프레임 11개·총 206마운트, **본체 11종 전부**). 사용자는 스켈레톤→빈 프레임→해체→완성 보드 순으로 보게 된다.

## 3. 가설 판정

| 가설 | 판정 | 근거(측정·코드) |
|---|---|---|
| **W1** 진입 `secWidget/search` 3회 + 보드 전체 재구성 | **참** | §2.1·§2.2. 요청 3회(3회 반복 전부 동일), WidgetFrame m22, 본체 m2, 커밋 102회·67.4ms. 코드: `WidgetWorkspace.tsx:175`(`defaultHome` deps [homeDefault, registry])→`:177-202`(load)→`:212-225`(load effect)→`:179`(setStatus("loading"))→`:413-431`(loading 초기 리턴이 보드를 스켈레톤으로 교체). 보드 재구성은 예측 "2~3회" 중 **2회**로 관측(3번째 load 는 2차 구성에 흡수). |
| **W2** registry 교체 시 entry 재생성 → 본체 리마운트 | **참(코드)·측정 분리 불가** | `widget-registry.ts:139`(C 행이 있으면 값 변화 없이도 항상 새 entry 객체), `WidgetFrame.tsx:41-54`(lazyCache = entry 기준 WeakMap). 다만 이번 측정에선 W1 의 보드 재구성이 같은 현상을 만들어 분리 계측이 안 됐다(W1 수정 뒤에 드러남). |
| **W3** 매 load 마다 새 items 객체 → 프레임 전체 재렌더 | **참(코드)·측정 분리 불가** | `WidgetWorkspace.tsx:187`(`loaded.map(... sanitizeLayout)`). W1 과 같은 커밋에서 발생해 분리 안 됨. |
| **W4** `secFavorite/search` 부팅 2회 + 복귀마다 1회 | **참(3회로 확대)** | 진입 3회 = 사이드바(1, `app/portal/page.tsx:313`) + quickLinks 마운트 2회(`widgets/home/quickLinks/widget.tsx:19`, W1 리마운트로 2회). 복귀 1회(`quickLinks/widget.tsx:29-38`, K5 방침). 인스턴스 간 캐시 공유 없음. |
| **W5** media 슬라이드 타이머 숨은 탭 무시 | **미판정(배치 밖)** | 기본 배치에 media 위젯 없음 → ⑥ 유휴 커밋 0회와 모순 없음. 코드 확정:`widget-types/media/renderer.tsx:116-121`. |
| **W6** refreshSec 자동 새로고침이 표시 무관 | **미판정(잠재)** | 현재 메타 어디도 refreshSec 미설정(⑥ 유휴 0커밋과 합치). 코드:`WidgetFrame.tsx:110-116`. |
| **W7** WidgetFrame props 객체 매 렌더 신규 | **참(코드)·무해** | `WidgetFrame.tsx:223-231`. 본체가 memo 가 아니라 지금은 영향 없음. 기록만. |
| **W8(신규)** 공지 행 클릭 → 보드 전체 재렌더 | **참** | ②에서 WidgetBoard→GridItem×11→WidgetFrame×11 갱신(219개 컴포넌트, 11.7ms). 원인: `notice-store.ts:21-24`(`set` 이 항상 새 상태 객체)·`:52-54`(selectNotice) + `page-components/home/page.tsx:43`(홈 페이지가 통째 스토어 구독 — 긴급 공지 띠용 `notices` 만 필요). |
| **F3** useUserButtonRbac 과다 구독 | **미판정(기본 배치 밖)** | memo·unit-converter 위젯이 기본 배치에 없어 이번 측정 범위 밖. 가이드 §8 후속표 그대로. |

## 4. 고칠 가치 순위와 수정 방향 (실제 수정은 하지 않음)

1. **W1 — 진입 load 통합(shared)**. user·defs 준비 뒤 한 번만 `secWidget/search`(3→1), 이미 ready 면 현재 배치 유지(스켈레톤 재교체 금지). 효과(측정 근거): 중복 POST 2건 제거, 206마운트 재구성 파형 제거, quickLinks 2회 마운트→1회(§2.1 #2·#3), 체감 깜빡임 제거. 진입 커밋 102회·67.4ms 상당 절감 예상.
2. **W2·W3 — W1 과 같은 영역에서 참조 안정화(shared)**. registry 병합이 같은 결과면 base entry 반환(또는 lazyCache 를 widgetId 기준), sanitize 결과 참조 재사용. W1 만 고치면 다음번 드러날 문제라 같이 설계할 것.
3. **W4 — 즐겨찾기 fetch 공유(m-mcm)**. quickLinks 가 사이드바가 받은 목록을 재사용(컨텍스트·모듈 캐시)하면 진입 3→2회. 복귀 시 재요청은 K5 방침이라 유지하되, 필요하면 mtime 검사로 완화.
4. **W8 — 공지 스토어 셀렉터 세분화(m-mcm)**. `useNoticeStore` 를 필드별 훅(`useNotices()`·`useSelectedNoticeId()`)으로 나누거나 스냅샷을 필드별로 캐싱. 행 클릭이 공지 위젯 서브트리에만 머물게 한다(219개→수십 개 컴포넌트).
5. **W5·W6 — 잠재 규칙**: 타이머·자동 새로고침은 위젯·탭 표시 여부와 연동(§5 R13 후보).
6. **F3 — 가이드 후속표 그대로** `useCurrentUserId()` 전환.
7. **W7 — 조치 없음**(본체 memo 화 시에만 의미).

## 5. 가이드 규칙 후보 (본문 반영은 별도 — 가이드는 다른 세션이 고치는 중)

- **R13(안) 타이머·자동 새로고침은 표시 여부를 보게**: 위젯 타이머(슬라이드·refreshSec)는 탭 활성·요소 표시 상태와 연동하라(W5·W6, §2 ⑥이 현 기본 배치의 청결을 보여줌).
- **부팅 로드 통합**: 화면 진입 로드가 마운트→사용자→정의 순으로 연쇄 재실행되지 않게, 준비 조건을 모아 한 번에 발사하라. 이미 렌더된 보드를 스켈레톤으로 되돌리지 마라(W1).
- **엔트리·배치 참조 안정성**: 병합 결과가 같으면 원래 객체를 돌려주라(R7 의 위젯 등록부 확장, W2·W3).
- **인스턴스 간 같은 엔드포인트 공유**: 같은 데이터를 쓰는 컴포넌트끼리 요청을 공유하라(사이드바·quickLinks, W4).
- **외부 스토어 셀렉터 세분화**: `useSyncExternalStore` 스토어를 통째 구독하지 마라 — 필요 필드만 훅으로 노출하라(W8, K-계열 일반화).
