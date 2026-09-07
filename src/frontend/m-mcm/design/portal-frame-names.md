# 포탈 프레임 표준 명칭

> 포탈 UI 작업 시 표준 명칭 및 작업 명령 형식의 **Single Source of Truth** 파일이다.
> 명칭을 변경할 경우 반드시 이 파일과 `../../../../docs/guide/FrontEnd/Local-Rules.md` 를 함께 갱신한다.

---

## 구조 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│ ① 포탈 프레임 · Portal Shell                                          │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ② 상단바 · Header                                                │ │
│ │   로고  /  사용자명  /  앱 이름 · 개인정보 버튼  /  로그아웃          │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ③ 본문 영역 · Body                                               │ │
│ │                                                                 │ │
│ │ ┌──────────────────┐ ║ ┌───────────────────────────────────────┐│ │
│ │ │ ④ 사이드바        │ ║ │ ⑩ 우측 영역 · Main                    ││ │
│ │ │ · Sidebar        │ ║ │                                       ││ │
│ │ │                  │ ║ │ ┌───────────────────────────────────┐ ││ │
│ │ │ ┌──────────────┐ │ ║ │ │ ⑪ 컨텐트 래퍼 · Content Wrapper   │ ││ │
│ │ │ │⑤ 탐색 탭      │ │ ║ │ │                                   │ ││ │
│ │ │ │ · Nav Tab    │ │ ║ │ │ ┌─────────────────────────────┐   │ ││ │
│ │ │ │ [메뉴][즐겨찾기]│ │ ║ │ │ │ ⑫ 탭 바 · Tabs Bar          │   │ ││ │
│ │ │ └──────────────┘ │ ║ │ │ │  🏠홈⑬  [탭항목⑭] [탭항목]  ⑮│   │ ││ │
│ │ │                  │ ║ │ │ └─────────────────────────────┘   │ ││ │
│ │ │ ┌──────────────┐ │ ║ │ │                                   │ ││ │
│ │ │ │⑥ 메뉴 검색창  │ │ ║ │ │ ┌─────────────────────────────┐   │ ││ │
│ │ │ │ · Search Bar │ │ ║ │ │ │ ⑯ 화면 영역 · Content Area   │   │ ││ │
│ │ │ └──────────────┘ │ ║ │ │ │                             │   │ ││ │
│ │ │                  │ ║ │ │ │ ┌───────────────────────┐   │   │ ││ │
│ │ │ ┌──────────────┐ │ ║ │ │ │ │ ⑰ 탭 화면 · Tab Page  │   │   │ ││ │
│ │ │ │⑦ 트리 펼침 버튼│ │ ║ │ │ │ │   업무 화면 컴포넌트    │   │   │ ││ │
│ │ │ │ · Tree Ctrls │ │ ║ │ │ │ │   로딩 상태            │   │   │ ││ │
│ │ │ └──────────────┘ │ ║ │ │ │ │   오류 상태            │   │   │ ││ │
│ │ │                  │ ║ │ │ │ │   페이지 컴포넌트        │   │   │ ││ │
│ │ │ ┌──────────────┐ │ ║ │ │ │ └───────────────────────┘   │   │ ││ │
│ │ │ │⑧ 메뉴 트리    │ │ ║ │ │ │                             │   │ ││ │
│ │ │ │ · Menu Tree  │ │ ║ │ │ │          ⑱ 페이지 ID 뱃지 ──►│   │ ││ │
│ │ │ │  ▾ 폴더 노드  │ │ ║ │ │ └─────────────────────────────┘   │ ││ │
│ │ │ │    페이지 항목│ │ ║ │ └───────────────────────────────────┘ ││ │
│ │ │ │  즐겨찾기 목록│ │ ║ │                                       ││ │
│ │ │ │  접기 버튼   │ │ ║ └───────────────────────────────────────┘│ │
│ │ │ └──────────────┘ │ ║                                          │ │
│ │ │   ⑨ 너비 조절바  │ ║  ← Resize Handle                         │ │
│ │ └──────────────────┘                                            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

> `║` — 너비 조절바(⑨ Resize Handle) 위치

---

## 영역·컴포넌트 명칭표

한국어 명칭과 영문 명칭 중 하나로 통일해서 사용하되, 혼용하지 않는다.

| # | 한국어 명칭 | 영문 명칭 | CSS 클래스 | 소스 파일 |
|---|-----------|---------|-----------|---------|
| ① | 포탈 프레임 | Portal Shell | `portal-shell` | `shared/src/portal-shell/portal-shell.tsx` |
| ② | 상단바 | Header | `portal-header` | `shared/src/portal-shell/header/Header.tsx` |
| ③ | 본문 영역 | Body | `portal-shell__body` | `portal-shell.tsx` 내 |
| ④ | 사이드바 | Sidebar | `sidebar` | `shared/src/portal-shell/sidebar/Sidebar.tsx` |
| ⑤ | 탐색 탭 | Nav Tab | `tab-container label[data-active]` (Mantine SegmentedControl) | Sidebar 내 `tab-container` |
| ⑥ | 메뉴 검색창 | Search Bar | `search-box`, `search-input` | Sidebar 내 `search-container` |
| ⑦ | 트리 펼침 버튼 | Tree Controls | `toggle-all-button` | Sidebar 내 `expand-buttons` |
| ⑧ | 메뉴 트리 | Menu Tree | `tree-scroll-area` | Sidebar 내 `tree-scroll-area` |
| ⑨ | 너비 조절바 | Resize Handle | `sidebar-resize-handle` | Sidebar 내 드래그 핸들 |
| ⑩ | 우측 영역 | Main | `portal-shell__main` | `portal-shell.tsx` 내 |
| ⑪ | 컨텐트 래퍼 | Content Wrapper | `portal-shell__content-wrapper` | `portal-shell.tsx` 내 |
| ⑫ | 탭 바 | Tabs Bar | `tabs-bar` | `shared/src/portal-shell/tabs-bar/TabsBar.tsx` |
| ⑬ | 홈 탭 | Home Tab | `tab-item home-tab` | TabsBar 내 홈 버튼 |
| ⑭ | 탭 항목 | Tab Item | `tab-item` | TabsBar 내 일반 탭 |
| ⑮ | 탭 도구 | Tab Controls | `tabs-controls` | TabsBar 내 우측 버튼 모음 |
| ⑯ | 화면 영역 | Content Area | `portal-shell__content-area` | `portal-shell.tsx` 내 |
| ⑰ | 탭 화면 | Tab Page | `portal-shell__tab-page` | `portal/page-components/<그룹>/<화면>/page.tsx` |
| ⑱ | 페이지 ID 뱃지 | Page ID Badge | `portal-shell__page-id-badge` | `portal-shell.tsx` 내 뱃지 요소 |

### ⑧ 메뉴 트리 하위 항목

| 한국어 명칭 | 영문 명칭 | CSS 클래스 |
|-----------|---------|-----------|
| 폴더 노드 | Tree Node | `tree-item--folder` |
| 페이지 항목 | Tree Leaf | `tree-item--page` |
| 즐겨찾기 목록 | Favorites List | `navigationViewMode === 'favorites'` |
| 접기 버튼 | Collapse Handle | — |

### ⑰ 탭 화면 하위 상태

| 한국어 명칭 | 영문 명칭 | 코드 표현 |
|-----------|---------|---------|
| 로딩 상태 | Loading State | `tab.isLoading: true` |
| 오류 상태 | Error State | `tab.errorMessage !== null` |
| 업무 화면 | Page Component | `PortalShellPageComponent` |

---

## 컴포넌트 상태 명칭

| 상태 | 한국어 표현 | 코드 내 표현 |
|-----|-----------|------------|
| 사이드바 펼침 | 펼침 상태 | `isExpanded: true` |
| 사이드바 접힘 | 접힘 상태 | `isExpanded: false` |
| 탭 활성 | 활성 탭 | `activeTabId === tab.id` |
| 탭 로딩 중 | 로딩 상태 | `tab.isLoading: true` |
| 탭 오류 | 오류 상태 | `tab.errorMessage !== null` |
| 탐색 탭 — 메뉴 모드 | 메뉴 보기 | `navigationViewMode: 'menu'` |
| 탐색 탭 — 즐겨찾기 모드 | 즐겨찾기 보기 | `navigationViewMode: 'favorites'` |
| 헤더 노출 | 헤더 표시 | `isHeaderVisible: true` |
| 헤더 숨김 | 헤더 숨김 | `isHeaderVisible: false` |

---

## 작업 명령 형식

포탈 UI 수정·추가 작업을 에이전트에게 지시할 때 반드시 아래 형식을 사용한다.
형식을 지키면 에이전트가 대상 파일을 정확히 찾고, 의도하지 않은 영역을 건드리는 실수를 방지한다.

### 기본 형식

```
[대상] <한국어 명칭> > <세부 요소>
[행위] <구체적인 변경 내용>
[조건] <적용 범위 또는 전제 조건>   ← 없으면 생략 가능
[제약] <변경하지 말아야 할 영역>
[완료] <완료 판단 기준>
```

### 예시 모음

**UI 수정**
```
[대상] 상단바 > 로그아웃 버튼
[행위] 클릭 시 확인 다이얼로그 없이 바로 로그아웃되도록 수정
[조건] onBeforeLogout 콜백이 없는 경우에만 해당
[제약] 개인정보 버튼, 사용자명 표시 영역은 건드리지 말 것
[완료] 로그아웃 클릭 → /login 즉시 이동 확인
```

**기능 추가**
```
[대상] 사이드바 > 메뉴 검색창
[행위] 검색어 초기화(✕) 클릭 시 input 포커스 자동 복귀 추가
[조건] searchTerm이 비어있지 않을 때만 해당 (현재 노출 조건 유지)
[제약] 트리 펼침 버튼, 즐겨찾기 목록 로직은 변경하지 말 것
[완료] ✕ 클릭 후 input에 커서 위치 확인
```

**신규 탭 화면 생성**
```
[대상] 탭 화면 > scheduling/gantt
[행위] page-components/scheduling/gantt/page.tsx 신규 생성
[조건] PortalShellPageComponent 인터페이스 준수
[제약] portal-shell, shared 라이브러리는 수정하지 말 것
[완료] 메뉴 클릭 → 탭 열림 → 화면 렌더링 확인 (E2E)
```

**스타일 변경**
```
[대상] 탭 바 > 탭 항목
[행위] 활성 탭 항목 하단에 2px 강조 보더 추가
[조건] 활성 상태(active 클래스)일 때만 적용
[제약] 홈 탭, 탭 도구 스타일은 변경하지 말 것
[완료] 활성 탭에 하단 보더 표시 확인, 비활성 탭에 미적용 확인
```
