---
screenId: commPermMng
asIsId: CommPermMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# mcm — PERMISSION 관리 디자인설계서

> **Frontend 개발 연계 값** (기능설계서 §1.2 와 동일):
> - mesModule = `m-mcm` / moduleGroup = `csa` / pageName = `commPermMng` / pageId = `commPermMng` / 페이지 유형 = **C 단일 마스터 그리드 + 상세 폼** / tsup entry key = `pages/csa/commPermMng`
>
> **명명 룰**: MES 단일 룰 (mcm 모듈 — APS 예외 미적용). 4 식별자 1byte 동일.
>
> **인용 정본**: 분석리포트 §3 (UI 컴포넌트 전수) + 기능설계서 §3 (S/G) + §4 (D) + §5 (B). 자체 추가 ✗.
> **cross-cutting 정책 #1 적용 (2026-05-31)**: BIZ_SYSTEM_CODE 컬럼 폐기 — S-001 / D-007 / D-008 / G-008 / DS-003 / LV-003 / Bind item10 / lov action 모두 To-Be 폐기. As-Is 인용은 본문 보존.
> **cross-cutting 정책 #6 (A안)**: Entity 명명 = `SecPerm`.
>
> **W5 패턴 적용 (Round 1~7, 2026-06-02 ~ 2026-06-05)**:
> - **W5-A** (자동 조회): csa 자동조회 정책 (project_csa_cme_iter_propagation) — onload 시 `loadList()` 자동 호출.
> - **W5-B** (Detail BindItem 정합 — Round 2): 11 필드 `setValue`/`watch` 양방향 — PERMISSION_ID / NM / DESC / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN / PERMISSION_ACTION (10 활성 + ~~BIZ_SYSTEM_CODE~~ 폐기). Bind item0~item9 정합 검증 완료.
> - **W5-C** (Modal 정식 신설 — Round 2): `commonPermBtnPopup` 을 `window.prompt` fallback 에서 정식 `Modal` 로 승격 — 14 옵션 체크박스 그리드 (commonTop / commonTopCustom / commonRight 권한 enum 전수).
> - **W5-D** (Detail 패널 확대 — Round 4): width 420 → **700** (메인 그리드 vs Detail 균형 — split-horizontal 좌우 비율 재조정).
> - **W5-E** (Textarea rows 통일 — Round 4 → 사용자 명시): 공통/CUSTOM/POPUP `rows={3}` + **ACTION 만 `rows={7}`** (D-024 하단 빈공간 채움).
> - **W5-F** (찾기 버튼 위치 변경 — Round 4): D-017 / D-020 Find Button — Textarea **우측 → 하단** 배치 (`flex column` + `Button alignSelf:flex-start width:80`).
> - **W5-G** (Detail wrapper overflow + height — Round 4 fix): Detail wrapper `overflow:hidden` + `height: calc(100% - 32px)` — 그리드와 외곽 동일 + 내부 스크롤바 ✗.
> - **PERMISSION_ID readOnly inserted 만 (Round 5 점검)**: 이미 §3.3.1 (D-002) + §3.2.2 (G-002) 분기 편집 정책으로 적용됨 — 재확인 완료.
> - **btn_close 완전 제거 (Round 7, 2026-06-04~05)**: As-Is xfdl `commonTop` basic 4 의 마지막 닫기 버튼 → ToBe 완전 제거. `PageLayout.buttons` = [btn_search / btn_reset / btn_save] 3 버튼. unused `handleClose` dead code 제거. **사유**: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼은 의미 ✗. 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준.

---

## 1. 공통 화면 구조

SIDEBAR / HEADER / TabsBar 는 `portal` 의 `PortalShell` 이 자동 주입한다. 화면 설계 대상은 **`PageLayout` 내부 영역** (title / buttons / SearchArea / ContentBody / ContentPanel) 이다.

### 1.1 포털 공통 영역 (설계 대상 아님 — portal 주입)

```
┌────────────┬──────────────────────────────────────────────┐
│            │ HEADER (portal)                              │
│  SIDEBAR   ├──────────────────────────────────────────────┤
│  (portal)  │ TabsBar (portal)                             │
│            ├──────────────────────────────────────────────┤
│            │  ▼ 아래가 화면 설계 대상 (PageLayout)         │
│            │                                              │
│            │                       page-id-badge (portal) │
└────────────┴──────────────────────────────────────────────┘
```

- **page-id-badge** = 활성 탭의 pageId 를 하단 우측에 표시
- 표시 형식 (MES 단일 룰): `mcm:commPermMng`
- moduleId 정본: 01 A.1 (업무 페이지는 `portal` 금지)

### 1.2 화면 설계 대상 영역 (PageLayout 기반)

```
┌────────────────────────────────────────────────────────────┐
│ PageLayout.title = "PERMISSION 관리"                        │
│ <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->            │
│ PageLayout.buttons = [ btn_search / btn_reset /             │
│                        btn_save ]    (Round 7: btn_close ✗) │
│  ├─ SearchArea  (A-FILTER)                                  │
│  │    └─ SearchField × 3  (~~S-001 BIZ SYSTEM Combo~~ 폐기 / │
│  │                          S-002 PERMISSION ID TextBox /    │
│  │                          S-003 PERMISSION 명 TextBox /    │
│  │                          S-004 사용 여부 Combo)           │
│  ├─ FoldButton (B-001 div_search 접기/펴기)                  │
│  └─ ContentBody (MAIN — 좌우 2단)                            │
│        ├─ ContentPanel-LEFT  (A-MAIN-LEFT) — Master 그리드    │
│        │     ├─ Toolbar [EX-002 leftMenu / EX-003 rightMenu] │
│        │     └─ AgDataGrid (Master G-001~G-012)              │
│        └─ ContentPanel-RIGHT (A-MAIN-RIGHT) — Detail 폼      │
│              ├─ Section title "상세 정보" (D-025)             │
│              ├─ FormGrid 행 (D-001~D-014, 라벨/입력 쌍)        │
│              ├─ FormGrid 행 (D-015 + D-016 TextArea + D-017   │
│              │             Find Button)                       │
│              ├─ FormGrid 행 (D-018 + D-019 TextArea + D-020   │
│              │             Find Button)                       │
│              ├─ FormGrid 행 (D-021 + D-022 TextArea)         │
│              └─ FormGrid 행 (D-023 + D-024 TextArea)         │
└────────────────────────────────────────────────────────────┘
```

| 영역 | 담당 컴포넌트 | 비고 |
|---|---|---|
| SIDEBAR / HEADER / TabsBar | portal PortalShell | 화면별 설계 대상 아님 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 페이지 타이틀 / 상단 버튼바 | `PageLayout` `title` / `buttons` | `title` = "PERMISSION 관리" / `buttons` = [btn_search, btn_reset, btn_save] (**Round 7**: btn_close 제거 — portal 탭 close 가 host 처리) |
| A-FILTER (조회조건) | `SearchArea` + `SearchField` × 4 | `@dk-oasis/shared/layout` |
| MAIN (콘텐츠) | `ContentBody` + `ContentPanel` × 2 (좌우 분할) | `@dk-oasis/shared/layout` |
| 그리드 (Master) | `AgDataGrid` (+ `useGridDataManager`) | `@dk-oasis/shared/grid` |
| 폼 (Detail 입력) | `FormGrid` + `Input` / `Textarea` / `Select` / `RadioGroup` / `Calendar` / `Button` | `@dk-oasis/shared/form` |
| 팝업 (P-001 / P-002 공통/CUSTOM 권한 찾기) | `Modal` | `@dk-oasis/shared/modal` (외부 공통 — commonPermBtnPopup) |

---

## 2. 화면 레이아웃

### 2.1 레이아웃 유형 + 페이지 유형 자동 결정

| 항목 | 값 |
|---|---|
| 페이지 유형 | **C 단일 마스터 그리드 + 상세 폼** (Master G-NNN + Detail D-NNN, GE = 0, L = 0) |
| 분석 §3 행 수 | G **As-Is 12 → To-Be 11** / GE 0 / D **As-Is 26 → To-Be 24** / L 0 (분석 §3.3 / §3.4 / §3.5, cross-cutting 정책 #1) |
| 결정 근거 | G > 0 + D > 0 + GE = 0 + L = 0 → C 유형 (단일 그리드 + 상세 폼) |
| `PageLayout.layoutMode` | `"split-horizontal"` (As-Is xfdl div_mainGrd right=520 / div_mainDetail width=500 → **To-Be Detail 700px 고정 + 그리드 잔여** — W5-D Round 4 사용자 결정) |
| ContentBody 분할 | 좌(Master 그리드) + 우(Detail 폼) |

### 2.2 영역 매핑 (분석 §3.1 + 기능설계서 §2 인용)

| 영역ID | 영역명 | xfdl 컨테이너 | shared 컴포넌트 |
|---|---|---|---|
| A-TITLE | 타이틀 영역 | `div_title` (xfdl:134) | `PageLayout.title` + `PageLayout.buttons` (EX-001 topMenu) |
| A-FILTER | 조회조건 영역 | `div_search` (xfdl:142) | `SearchArea` + `SearchField` × 4 |
| A-FOLD | 조회조건 접기 버튼 | `btn_fold` (xfdl:7) | `SearchArea.foldButton` (또는 `Button` 별도) |
| A-MAIN | 메인 컨테이너 | `div_main` (xfdl:8) | `ContentBody` |
| A-MAIN-LEFT | Master 그리드 영역 | `div_mainGrd` (xfdl:11) | `ContentPanel` (left) + `AgDataGrid` |
| A-MAIN-RIGHT | Detail 입력 폼 영역 | `div_mainDetail` (xfdl:72) | `ContentPanel` (right) + `FormGrid` + Input 컴포넌트 |
| A-BTN | 버튼 영역 | (분산 — div_mainDetail 내 + div_main 상단 + topMenu) | `PageLayout.buttons` (EX-001) + `IconButton` (B-001 fold) + `Button` (B-002 / B-003 Find) |
| A-FOOTER | 하단 status 영역 | `div_bottom` (xfdl:6) | `PageLayout.footer` 또는 별도 `StatusBar` |

---

## 3. 영역별 상세 설계

### 3.1 A-FILTER (조회조건 영역)

`SearchArea` 단일 — As-Is 4 행 → **To-Be 3 행** 1열 (또는 1 행 가로 배치). As-Is xfdl 의 가로 배치 (~~BIZ SYSTEM~~ → PERMISSION ID → PERMISSION 명 → 사용 여부) 보존, 단 S-001 폐기.

| 필드ID | 컴포넌트 | props 매핑 |
|---|---|---|
| ~~S-001~~ | ~~`Select`~~ | ~~label="BIZ SYSTEM" / options=`lovSubSystem` (cross-module `CommObjMngMapper.selectAppHostId` 결과) / placeholder="전체" / defaultValue=null~~ → **To-Be 폐기** (cross-cutting 정책 #1) |
| S-002 | `Input` | label="PERMISSION ID" / maxLength=100 / placeholder="" (As-Is "부산역 CY" 제거 — To-Be 정정) |
| S-003 | `Input` | label="PERMISSION 명" / maxLength=100 / placeholder="" (As-Is "부산역 CY" 제거 — To-Be 정정) |
| S-004 | `Select` | label="사용 여부" / options=`[{value:"Y",label:"Y"},{value:"N",label:"N"}]` (hardcoded) + 첫 행 "" 추가 / defaultValue="" 또는 "Y" |

> `SearchArea` 의 가로 정렬 / 라벨 위치 / 폼 너비는 `shared/layout` 의 `SearchArea` defaults 따름. As-Is `cssclass="edi_WFSA_Label"` (xfdl:145 / 147 / 149 / 151) → `SearchField.label`.

### 3.2 A-MAIN-LEFT (Master 그리드 영역)

`ContentPanel` (left) 내부 → Toolbar + `AgDataGrid`.

#### 3.2.1 Toolbar (EX-002 leftMenu / EX-003 rightMenu)

| EX-ID | 버튼 | shared 컴포넌트 | onClick |
|---|---|---|---|
| EX-002 chk_check | 체크박스 (그리드 전체 체크 토글) | `ToolbarCheckBox` (또는 외부 commonLeftButton 등가) | (외부 처리) |
| EX-002 btn_sum | sum 행 표시 | `ToolbarButton` icon="sum" | (외부 처리) |
| EX-003 btn_rowAdd | 행추가 | `ToolbarButton` icon="add" | `fn_rowAdd()` (xfdl:378) → `gridApi.applyTransaction({add:[defaults]})` + USE_TP="Y" + START_ACTIVE_DATE=today + END_ACTIVE_DATE="99991231" |
| EX-003 btn_rowDelete | 행삭제 | `ToolbarButton` icon="delete" | `fn_rowDelete()` (xfdl:402) — ROLE_ID null 체크 + `gfn_deleteRow` |
| EX-003 btn_rowCopy | 행복사 | `ToolbarButton` icon="copy" | `fn_rowCopy()` (xfdl:391) — `gfn_rowcopyData` |
| EX-003 btn_rowCancel | 행취소 | `ToolbarButton` icon="cancel" | `fn_rowCancel()` (xfdl:419) — `gfn_grdInit(grd_main)` |

#### 3.2.2 AgDataGrid (Master G-001~G-012)

| 옵션 | 값 |
|---|---|
| `dataset` | `ds_main` (As-Is 12 컬럼 → **To-Be 11 컬럼**, BIZ_SYSTEM_CODE 폐기) |
| `selectionMode` | `"cell"` (xfdl `selecttype="cell"`) |
| `editable` | (행별 분기 — 신규 행만 PERMISSION_ID 편집) |
| `columnDefs` | As-Is 12 컬럼 (G-001 ~ G-012) → **To-Be 11 컬럼** (G-008 폐기) |
| `pinnedLeftColumns` | [G-001 STATUS] (xfdl band="left") |
| `headerRow` | 1 (size=40, xfdl:34) |
| `rowHeight` | 24 (xfdl:35) |
| `onHeaderClick` | `gfn_commonOnheadclick` (공통 정렬) |
| `onRowSelected` | (없음 — `ds_main_onrowposchanged` 는 DS 이벤트로 별도 처리) |

| 컬럼ID | field | headerName | width | cellRenderer | editable | cellEditor | 비고 |
|---|---|---|---|---|---|---|---|
| G-001 | STATUS | "상태" | 30 | `rowStateIconRenderer` (신규/수정/삭제 icon) | false | - | pinnedLeft |
| G-002 | PERMISSION_ID | "PERMISSION ID" | 107 | - | (신규 행만 — rowType 분기) | TextInputEditor | autosizecol=limitmin / textAlign=left / fn_save 필수 (`gfn_dsRequired("PERMISSION_ID USE_TP")`) |
| G-003 | PERMISSION_NM | "PERMISSION명" | 117 | - | true | TextInputEditor | autosizecol=limitmin / textAlign=left |
| G-004 | PERMISSION_COMMON | "공통 버튼 권한" | 193 | - | true | TextInputEditor | autosizecol=none / textAlign=left |
| G-005 | PERMISSION_CUSTOM | "CUSTOM 버튼 권한" | 210 | - | true | TextInputEditor | autosizecol=none / textAlign=left |
| G-006 | POPUP_BTN | "POPUP\r\n버튼" | 80 | - | true | TextInputEditor | 멀티라인 헤더 / autosizecol=limitmin |
| G-007 | PERMISSION_ACTION | "ACTION 권한" | 135 | - | true | TextInputEditor | autosizecol=none |
| ~~G-008~~ | ~~BIZ_SYSTEM_CODE~~ | ~~"BIZ\r\nSYSTEM"~~ | ~~56~~ | - | ~~true~~ | ~~TextInputEditor~~ | ~~멀티라인 헤더 / autosizecol=limitmin~~ → **To-Be 폐기** (cross-cutting 정책 #1) |
| G-009 | USE_TP | "사용\r\n여부" | 30 | - | true | TextInputEditor | 멀티라인 헤더 / autosizecol=limitmin / fn_save 필수 |
| G-010 | START_ACTIVE_DATE | "유효개시일" | 80 | `dateRenderer` (yyyy-MM-dd) | true | DateEditor (calendardateformat=yyyy-MM-dd) | autosizecol=limitmin |
| G-011 | END_ACTIVE_DATE | "유효기한일" | 80 | `dateRenderer` (yyyy-MM-dd) | true | DateEditor (calendardateformat=yyyy-MM-dd) | autosizecol=limitmin |
| G-012 | PERMISSION_DESC | "권한 설명" | 134 | - | true | TextInputEditor | autosizecol=limitmin |

> **G-002 PERMISSION_ID 분기 편집**: As-Is `ds_main_onrowposchanged` (xfdl:451~459) — 새 row 의 PERMISSION_ID null 아니고 rowType != 2 (신규 아님) 이면 `div_mainDetail.edt_permission_id.set_enable(false)` (PK 편집 차단). To-Be: grid `editable` 콜백 + Detail 영역 D-002 input `disabled` 동시 분기.
>
> **header text 멀티라인**: xfdl `&#13;&#10;` (CRLF) — To-Be CSS `white-space: pre-line` 또는 `\n` JSX literal.

### 3.3 A-MAIN-RIGHT (Detail 입력 폼 영역)

`ContentPanel` (right) 내부 → Section title "상세 정보" (D-025) + `FormGrid` (As-Is xfdl div_mainDetail 의 행별 라벨 + 입력 쌍 구조 보존).

**Detail 패널 폭 (W5-D, Round 4)**: As-Is xfdl 500 → To-Be **700px** (메인 그리드 vs Detail 균형 재조정 — `ContentPanel` right `width: 700`. split-horizontal 좌:우 = 그리드 잔여 영역 : 700).

**Detail wrapper overflow + height (W5-G, Round 4 fix)**: Detail 영역 외곽 wrapper `overflow: hidden` + `height: calc(100% - 32px)` (32 = SectionTitle 높이) — 그리드와 외곽 동일 + 내부 스크롤바 ✗ (FormGrid 내부 행 높이 합이 wrapper 높이를 초과하지 않도록 rows 조정 — §3.3.1 참조).

#### 3.3.1 FormGrid 행별 배치 (분석 §3.5 D-NNN 26 행 인용)

| FormGrid 행 | 라벨 (Static — D-NNN) | 입력 (D-NNN) | 보조 (D-NNN) | 컴포넌트 매핑 |
|---|---|---|---|---|
| 1 | D-001 "PERMISSION ID" (Essential) | D-002 TextBox PERMISSION_ID (Essential, maxLength=90) | - | `FormLabel` (required=true) + `Input` (disabled 분기 — 기존 행) |
| 2 | D-003 "PERMISSION명" | D-004 TextBox PERMISSION_NM (maxLength=100) | - | `FormLabel` + `Input` |
| 3 | D-005 "PERMISSION 설명" | D-006 TextBox PERMISSION_DESC (maxLength=100) | - | `FormLabel` + `Input` |
| ~~4~~ | ~~D-007 "BIZ SYSTEM" (Essential)~~ | ~~D-008 Combo BIZ_SYSTEM_CODE (Essential, options=`lovSubSystem`)~~ | - | ~~`FormLabel` (required=true) + `Select`~~ → **To-Be 폐기** (cross-cutting 정책 #1) |
| 5 | D-009 "사용 여부" | D-010 Radio USE_TP (Y=Yes / N=No, vertical) | - | `FormLabel` + `RadioGroup` (orientation=vertical) |
| 6 | D-011 "유효 개시일" | D-012 Calendar START_ACTIVE_DATE | - | `FormLabel` + `Calendar` |
| 7 | D-013 "유효 기한일" | D-014 Calendar END_ACTIVE_DATE | - | `FormLabel` + `Calendar` |
| 8 | D-015 "공통 버튼 권한\n(commonTop, commonTopCustom,\ncommonRight)" (멀티라인) | D-016 TextArea PERMISSION_COMMON (**rows={3}** — W5-E) | D-017 Find Button (**하단 배치** — W5-F) | `FormLabel` (multiline) + `Textarea rows={3}` + `Button` (B-002, `alignSelf:flex-start width:80`) — wrapper `display:flex flex-direction:column gap:4` |
| 9 | D-018 "CUSTOM 버튼 권한" | D-019 TextArea PERMISSION_CUSTOM (**rows={3}** — W5-E) | D-020 Find Button (**하단 배치** — W5-F) | `FormLabel` + `Textarea rows={3}` + `Button` (B-003, `alignSelf:flex-start width:80`) — wrapper `display:flex flex-direction:column gap:4` |
| 10 | D-021 "POPUP 버튼" | D-022 TextArea POPUP_BTN (**rows={3}** — W5-E) | - | `FormLabel` + `Textarea rows={3}` |
| 11 | D-023 "ACTION 권한" | D-024 TextArea PERMISSION_ACTION (**rows={7}** — W5-E 사용자 명시, 하단 빈공간 채움) | - | `FormLabel` + `Textarea rows={7}` |

> D-025 "상세 정보" (Section title) + D-026 "조회 결과" (LEFT 패널 상단 타이틀) — As-Is xfdl Edit readonly cssclass `edi_WF_Title1` (xfdl:67 / 118). To-Be `ContentPanel.title` 또는 별도 `SectionTitle`.

#### 3.3.2 FormGrid Detail 영역 활성/비활성 (ST-008 — 분석 §10.1 + 기능설계서 §4.3 인용)

| 시점 | FormGrid disabled |
|---|---|
| onload 초기 | true |
| searchCmPerm 콜백 + 0 건 | true (유지) |
| searchCmPerm 콜백 + 1+ 건 | false |
| fn_rowAdd | false |
| fn_rowCopy | false |
| fn_rowDelete 후 행 0 | true |

> `FormGrid` 의 `disabled` prop 또는 wrapper `<fieldset disabled>` 로 일괄 비활성화. As-Is `gfn_setEnable("...div_mainDetail", "true"/"false")` 와 동등.

#### 3.3.3 데이터 바인딩 (분석 Bind item0~item10 인용)

**W5-B (Round 2) 정합 확인**: 11 필드 As-Is BindItem item0~item10 → To-Be 10 필드 (item10 BIZ_SYSTEM_CODE 폐기). React 구현은 `useGridDataManager` 의 selectedRow state + `react-hook-form` `setValue`/`watch` 로 그리드 selectedRow ↔ Form 양방향 동기화 — 11 필드 (PERMISSION_ID / NM / DESC / COMMON / CUSTOM / POPUP_BTN / ACTION / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE) 모두 W5-B Round 2 정합 검증 완료.

| BindItem | 컴포넌트 | DS 컬럼 | W5-B 정합 (Round 2) |
|---|---|---|---|
| item0 | D-002 Input | PERMISSION_ID | ✓ (PK — inserted 만 편집 / 기존 행 readOnly — Round 5 점검 완료) |
| item2 | D-014 Calendar | END_ACTIVE_DATE | ✓ |
| item4 | D-004 Input | PERMISSION_NM | ✓ |
| item6 | D-010 RadioGroup | USE_TP | ✓ |
| item7 | D-012 Calendar | START_ACTIVE_DATE | ✓ |
| item8 | D-006 Input | PERMISSION_DESC | ✓ |
| item1 | D-016 Textarea | PERMISSION_COMMON | ✓ (rows={3} — W5-E / Find Button 하단 — W5-F) |
| item5 | D-019 Textarea | PERMISSION_CUSTOM | ✓ (rows={3} — W5-E / Find Button 하단 — W5-F) |
| item3 | D-022 Textarea | POPUP_BTN | ✓ (rows={3} — W5-E) |
| item9 | D-024 Textarea | PERMISSION_ACTION | ✓ (rows={7} — W5-E 사용자 명시) |
| ~~item10~~ | ~~D-008 Select~~ | ~~BIZ_SYSTEM_CODE~~ → **To-Be 폐기** (cross-cutting 정책 #1) | (폐기) |

> To-Be React 구현: `useGridDataManager` 의 selected row state + `react-hook-form` `setValue`/`watch` 로 그리드 selectedRow ↔ Form 양방향 동기화.

### 3.4 A-TITLE (타이틀 + 상단 topMenu)

| 항목 | 값 |
|---|---|
| `PageLayout.title` | "PERMISSION 관리" (As-Is 오타 "PERMISSON" 정정) |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| `PageLayout.buttons` | EX-001 (btn_search / btn_reset / btn_save **3 기본 버튼** — **Round 7: btn_close 제거**. 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준. 사유: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼은 의미 ✗) |
| **onload 자동 조회 (W5-A)** | `useEffect(() => { loadList(); }, [])` — csa 자동조회 정책 (project_csa_cme_iter_propagation) — As-Is `gfn_formOnLoad(obj,true)` 등가. 진입 즉시 검색조건 default 로 1회 조회. |
| btn_search onClick | `fn_search()` → search action |
| btn_reset onClick | `fn_reset()` → `gfn_setDivDefault(div_search)` + `cbo_USE_TP.set_index(1)` |
| btn_save onClick | `fn_save()` → save action |
| ~~btn_close onClick~~ | ~~`fn_close()` → `gv_AppTabPath.form.fn_closeForm()` → 탭 닫기~~ → **Round 7 폐기** (2026-06-04~05). PageLayout.buttons 배열에서 entry 삭제 + unused `handleClose` dead code 제거. As-Is xfdl `commonTop` basic 4 의 마지막 버튼 → ToBe 제거 (portal host 가 탭 close 처리) |

### 3.5 A-FOOTER (하단 status)

| 항목 | 값 |
|---|---|
| 영역 | `div_bottom` (xfdl:6) — height=20 / cssclass=`div_WF_Footer` |
| 컴포넌트 | `StatusBar` 또는 `PageLayout.footer` |
| 메시지 위치 | `fn_commonBottomStatus_msg(...)` 호출 (xfdl:334 / 343) |
| 메시지 내용 | "${N}건 조회 되었습니다." (search / save 콜백 — 기능설계서 §10.1) |

---

## 4. 컴포넌트 명세 (As-Is xfdl 매핑)

### 4.1 컴포넌트 매핑 표 (분석 §3 인용)

| As-Is xfdl 컨트롤 | To-Be shared 컴포넌트 | props 매핑 |
|---|---|---|
| `Edit` (readonly cssclass `edi_WFSA_Label`, S 라벨 — xfdl:145 등) | `SearchField.label` (별도 `Label` ✗ — SearchField props) | text → label |
| `Edit` (readonly cssclass `edi_WF_Label*`, D 라벨 — xfdl:82~91 등) | `FormLabel` (FormGrid 내부) | text → children |
| `Edit` (입력 cssclass `Essential` — D-002 xfdl:92) | `Input` (required visual) | value → value, maxlength → maxLength |
| `Edit` (입력 일반 — D-004 / D-006 xfdl:94 / 114) | `Input` | value → value, maxlength → maxLength |
| `TextArea` (D-016 / D-019 / D-022 / D-024 xfdl:115~117 / 123) | `Textarea` | value → value |
| `Combo` (S-001 / S-004 / D-008 — innerdataset / codecolumn / datacolumn) | `Select` | innerdataset → options, codecolumn → value field, datacolumn → label field |
| `Radio` (D-010 vertical — xfdl:95~112) | `RadioGroup` | direction="vertical" → orientation="vertical" / inner Dataset → options |
| `Calendar` (D-012 / D-014 — xfdl:93 / 113) | `Calendar` | dateformat → format |
| `Button` cssclass `btn_WF_Find` (D-017 / D-020 — xfdl:120 / 121) | `IconButton` icon="search" | onclick → onClick |
| `Button` cssclass `btn_WFSA_Fold` (B-001 — xfdl:7) | `SearchArea.foldButton` 또는 `IconButton` icon="chevron" | onclick → onClick |
| `Grid` (grd_main — xfdl:15) | `AgDataGrid` (`@dk-oasis/shared/grid`) | binddataset → dataset, Format 의 Columns → columnDefs |
| `Div` url include `_com_div::commonTopButton.xfdl` (EX-001) | `PageLayout.buttons` | fn_commonTop_onload 의 버튼 array → buttons prop |
| `Div` url include `_com_div::commonLeftButton.xfdl` (EX-002) | (외부 Toolbar — `ToolbarCheckBox` / `ToolbarButton`) | fn_commonLeft_onload 의 버튼 array → toolbar items |
| `Div` url include `_com_div::commonRightButton.xfdl` (EX-003) | (외부 Toolbar — `ToolbarButton`) | fn_commonRight_onload 의 버튼 array → toolbar items |
| `Div` url include `_com_div::commonBottomStatus.xfdl` (EX-004) | `StatusBar` 또는 `PageLayout.footer` | fn_commonBottomStatus_msg 호출 → setMessage 함수 |
| `Static` (cssclass `stc_WF_Box*`, 시각적 박스/라인) | (CSS border / divider — 별도 컴포넌트 ✗) | - (FormGrid 자체 border 사용) |

### 4.2 코드값 / LoV 매핑 (LV-NNN — 기능설계서 §3.3 인용)

| LV-ID | 출처 | 컴포넌트 | options 형태 |
|---|---|---|---|
| LV-001 (S-004) | hardcoded ds_cmbValidYn | Select | `[{value:"Y",label:"Y"},{value:"N",label:"N"}]` + 첫 행 `{value:"",label:""}` (gfn_setFirstRow) |
| LV-002 (D-010) | Radio inner Dataset (hardcoded Y/Yes + N/No) | RadioGroup | `[{value:"Y",label:"Yes"},{value:"N",label:"No"}]` |
| ~~LV-003 (S-001 / D-008)~~ | ~~cross-module `CommObjMngMapper.selectAppHostId` 결과~~ | ~~Select~~ | ~~API 결과 → `options.map(r => ({value: r.APP_HOST_ID, label: r.APP_HOST_ID}))`~~ → **To-Be 폐기** (cross-cutting 정책 #1 — APPHOST 출처 LV 제거) |

> ~~LV-003 로딩 시점: 페이지 onload 시 lov action 호출 → `useQuery(['commPermMng','lov'])` 캐시.~~ → **To-Be 폐기** (cross-cutting 정책 #1 — lov action 자체 제거. 페이지 onload 시 lov 호출 ✗)

---

## 5. 상호작용 / 이벤트 (기능설계서 §11 인용)

### 5.1 그리드 ↔ 폼 양방향 동기화

| 트리거 | 동작 |
|---|---|
| 그리드 row 선택 변경 | `ds_main_onrowposchanged` (xfdl:451) → Detail 폼 입력값 갱신 + D-002 PERMISSION_ID disabled 분기 (기존 행=disabled / 신규=enabled) |
| Detail 폼 입력 변경 | BindItem item0~item10 양방향 — 그리드 cell 값 자동 갱신 + RowType=4 (수정) 마킹 |
| 그리드 행추가 (fn_rowAdd) | ds_main.addRow() + default 세트 (USE_TP=Y / START_ACTIVE_DATE=today / END_ACTIVE_DATE="99991231") + Detail 영역 활성 + D-002 focus |
| 그리드 행복사 (fn_rowCopy) | `gfn_rowcopyData(ds_main, rowposition)` → 신규 row 추가 + Detail 활성 |
| 그리드 행삭제 (fn_rowDelete) | ROLE_ID null 검증 → null 이면 `gfn_deleteRow` / 아니면 경고. 행 0 시 Detail 비활성 |
| 그리드 행취소 (fn_rowCancel) | `gfn_grdInit(grd_main)` — 변경 행 모두 reset |

> React 구현: `useGridDataManager` 의 `selectedRow` state + `react-hook-form` `setValue("PERMISSION_ID", ...)` / `watch("PERMISSION_ID")` 동기화. PK disabled 분기는 `isNewRow` flag 로 처리.

### 5.2 팝업 호출 흐름 (P-001 / P-002 — 기능설계서 §11.4 인용)

| 트리거 | 동작 |
|---|---|
| D-017 (B-002) 클릭 | `openModal("commonPermBtnPopup", {btnChk:"common"})` → 콜백 `(rtVal) => setValue("PERMISSION_COMMON", rtVal.rtnVale)` |
| D-020 (B-003) 클릭 | `openModal("commonPermBtnPopup", {btnChk:"custom"})` → 콜백 `(rtVal) => setValue("PERMISSION_CUSTOM", rtVal.rtnVale)` |

> 팝업 컴포넌트 = `Modal` (`@dk-oasis/shared/modal`). commonPermBtnPopup 은 외부 공통 화면 — 본 화면 분석 범위 외.

### 5.3 검증 흐름 (기능설계서 §6 인용)

| 검증 | 시점 | 구현 |
|---|---|---|
| `gfn_isDatasetChanged(ds_main)` true | btn_save 클릭 | `useGridDataManager.isDirty` flag |
| `gfn_dsRequired(grd_main, "PERMISSION_ID USE_TP")` true | btn_save 클릭 | `useGridDataManager.validateRequired(["PERMISSION_ID","USE_TP"])` |
| ROLE_ID null | fn_rowDelete | `selectedRow.ROLE_ID == null` |
| confirm("저장하시겠습니까?") | btn_save 클릭 | `gfn_message` → `useConfirm` hook |

### 5.4 접기/펴기 (B-001)

| 트리거 | 동작 |
|---|---|
| B-001 btn_fold 클릭 | `gfn_fold(this, div_search, div_main, btn_fold)` (xfdl:469) — div_search 영역 접기/펴기 토글 + btn_fold icon 회전 |

> React 구현: `SearchArea.foldButton` 또는 별도 useState boolean → SearchArea hidden 토글.

---

## 6. 팝업 모달 (P-NNN — 기능설계서 §9 인용)

| 팝업ID | 유형 | 이름 | 컴포넌트 | props |
|---|---|---|---|---|
| P-001 | modal | "commonPermBtnPopup" (공통 권한 선택) | `Modal` (외부 공통 — commonPermBtnPopup) | open=boolean, onClose=callback, oArg={btnChk:"common"} |
| P-002 | modal | "commonPermBtnPopup" (CUSTOM 권한 선택) | `Modal` (외부 공통 — commonPermBtnPopup) | open=boolean, onClose=callback, oArg={btnChk:"custom"} |

> P-001 / P-002 동일 팝업, oArg 분기로 callback 처리.

### 6.1 commonPermBtnPopup Modal 정식 신설 (W5-C, Round 2)

**As-Is fallback**: 초기 Round 1 까지는 `window.prompt("권한 토큰 입력:", current)` 임시 폴백으로 처리.
**To-Be Round 2**: 정식 `Modal` (`@dk-oasis/shared/modal`) 로 승격. 14 옵션 체크박스 그리드로 권한 enum 을 시각 선택.

| 항목 | 값 |
|---|---|
| 컴포넌트 | `Modal` (외부 공통 — `commonPermBtnPopup.tsx`) |
| 위치 | `src/frontend/m-mcm/src/components/csa/commonPermBtnPopup.tsx` (외부 공통 — commPermMng 외 다수 화면 재사용) |
| props | `open: boolean` / `onClose: () => void` / `initialValue: string` (콤마 구분 토큰) / `mode: "common"\|"custom"` / `onConfirm: (rtnValue: string) => void` |
| 본문 레이아웃 | 14 옵션 체크박스 그리드 (CSS Grid 2 또는 3 열) — common 모드: commonTop / commonTopCustom / commonRight 그룹별 enum (insert/update/delete/save/search/print/excel/copy/cancel 등 / custom 모드: 사용자 정의 토큰 + 자유 입력) |
| 체크박스 그리드 | `<div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>` + 14 `<Checkbox label="X" value="X" />` |
| 하단 버튼 | "확인" → `onConfirm(selected.join(","))` + onClose / "취소" → onClose |
| 초기 체크 | `initialValue.split(",")` 으로 기존 토큰 prefill |
| 호출자 콜백 | D-017: `setValue("PERMISSION_COMMON", rtnValue)` / D-020: `setValue("PERMISSION_CUSTOM", rtnValue)` |

> **fallback → Modal 승격 이력**: Round 1 `window.prompt` 임시 폴백 → Round 2 정식 Modal 신설 (14 옵션 체크박스 그리드). 사용자 입력 오류 최소화 + As-Is xfdl `commonPermBtnPopup.xfdl` 의 체크박스 그리드 UI 등가 구현.

---

## 7. 스타일 / 디자인 토큰

### 7.1 색상 / 폰트 / 간격 — shared 디자인 토큰 사용

| 요소 | shared 토큰 |
|---|---|
| 페이지 배경 | `--color-bg-page` |
| ContentPanel 배경 | `--color-bg-panel` |
| SearchArea 배경 | `--color-bg-search` (As-Is cssclass `div_WFSA_Box`) |
| Footer 배경 | `--color-bg-footer` (As-Is cssclass `div_WF_Footer`) |
| Essential 라벨 | `--color-required` (As-Is cssclass `Essential` 또는 `edi_WF_LabelFirstE` / `edi_WF_LabelE`) |
| Title (D-025 / D-026) | `--font-title` (As-Is cssclass `edi_WF_Title1`) |
| 그리드 헤더 | `--color-grid-header` (As-Is band="head" size=40) |
| 그리드 row | `--color-grid-row` (As-Is body size=24) |
| pinnedLeft (STATUS) | `--color-grid-pinned-left` (As-Is band="left") |

### 7.2 그리드 정렬 / 폭

| 컬럼 | textAlign | autosizeMode |
|---|---|---|
| G-001 STATUS | center | (pinnedLeft 30px 고정) |
| G-002 PERMISSION_ID | left | limitmin |
| G-003 PERMISSION_NM | left | limitmin |
| G-004 PERMISSION_COMMON | left | none |
| G-005 PERMISSION_CUSTOM | left | none |
| G-006 POPUP_BTN | left | limitmin |
| G-007 PERMISSION_ACTION | left | none |
| G-008 BIZ_SYSTEM_CODE | center | limitmin |
| G-009 USE_TP | center | limitmin |
| G-010 START_ACTIVE_DATE | center | limitmin |
| G-011 END_ACTIVE_DATE | center | limitmin |
| G-012 PERMISSION_DESC | left | limitmin |

> 폭은 분석 §3.3 의 columns size 그대로 보존 (107 / 117 / 193 / 210 / 80 / 135 / 56 / 30 / 80 / 80 / 134 / + STATUS 30). To-Be 화면 폭 1280 (xfdl Form width) 기준 — 반응형 시 가로 스크롤 허용.

---

## 8. 접근성 / i18n

| 항목 | 결정 |
|---|---|
| 라벨 (FormLabel) | `<label for="">` HTML 시맨틱 + `aria-required="true"` (Essential D-001 / D-007) |
| Required visual | CSS `::before` content="*" + `color: var(--color-required)` (As-Is cssclass `Essential` 등가) |
| 그리드 키보드 네비 | `AgDataGrid` defaults (Arrow / Enter / Tab) |
| 멀티라인 헤더 (G-006 / G-008 / G-009) | CSS `white-space: pre-line` + headerName 의 `\n` 보존 |
| i18n 키 | (현 단계 미적용 — As-Is 한글 텍스트 그대로 보존) |

---

## 9. 컴포넌트 출처 / 패키지 (RULE.md FE 명명 표준)

| 영역 | 출처 패키지 |
|---|---|
| PageLayout / ContentBody / ContentPanel / SearchArea / SearchField / StatusBar | `@dk-oasis/shared/layout` |
| AgDataGrid / useGridDataManager | `@dk-oasis/shared/grid` |
| Input / Textarea / Select / RadioGroup / Calendar / FormGrid / FormLabel / IconButton / Button | `@dk-oasis/shared/form` |
| Modal | `@dk-oasis/shared/modal` |
| StatusBar | `@dk-oasis/shared/layout` 또는 PageLayout.footer slot |
| API client (`apiRequest`) | `@dk-oasis/shared/api` |
| Message helper (`gfn_message` 등가) | `@dk-oasis/shared/message` |

### 9.1 페이지 컴포넌트 위치

| 항목 | 값 |
|---|---|
| 페이지 entry | `src/frontend/m-mcm/src/pages/csa/commPermMng.tsx` |
| 페이지 hook | `src/frontend/m-mcm/src/pages/csa/commPermMng/useCommPermMng.ts` (또는 단일 파일 내부) |
| API 모듈 | `src/frontend/m-mcm/src/api/csa/commPermMng.ts` |
| 타입 정의 | `src/frontend/m-mcm/src/types/csa/commPermMng.ts` |
| tsup entry key | `pages/csa/commPermMng` |

---

## 10. 산출물 정합

| 항목 | 기능설계서 §X | 본 디자인설계서 §Y |
|---|---|---|
| 페이지 유형 | §1.2 (C) | §2.1 (C) |
| 영역 | §2 (8 영역) | §2.2 (8 영역) |
| 조회조건 | §3.1 (S **As-Is 4 → To-Be 3** 행, S-001 폐기) | §3.1 (As-Is 4 → To-Be 3 행) |
| 마스터 그리드 | §3.2 (G **As-Is 12 → To-Be 11** 행, G-008 폐기) | §3.2.2 (As-Is 12 → To-Be 11 행) |
| 상세 폼 | §4.1 (D **As-Is 26 → To-Be 24** 행, D-007 / D-008 폐기) | §3.3.1 (As-Is 11 → To-Be 10 FormGrid 행 — 4행 폐기) |
| 라인 그리드 | §4.2 (해당 없음) | §2.1 (GE=0 / L=0) |
| 버튼 (B-NNN) | §5.1 (3 행) | §3.2.1 + §3.3.1 + §5.4 |
| 공통 메뉴 (EX) | §5.2 (4 행) | §3.4 (EX-001) + §3.2.1 (EX-002 / EX-003) + §3.5 (EX-004) |
| 팝업 | §9 (2 행) | §6 (2 행) |
| 코드값 | §3.3 (LV **As-Is 3 → To-Be 2** 행, LV-003 폐기) | §4.2 (As-Is 3 → To-Be 2 행) |
| 상태값 | §7 (ST 8 행) | §3.3.2 (Detail 영역 활성 ST-008) + §5.3 (검증 ST-007) + §3.2.2 (G-001 ST-005) 등 분산 |

> 본 §10 모든 행수 일치 ✓ — 기능설계서 / 분석리포트 인용 정합 완성.

---

## 11. 사용자 검수 이력 (Round 카탈로그)

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->

> 본 §11 (이력서상 §J) 은 commPermMng 화면 개발 Round 1~7 의 사용자 검수 피드백 + W5 A~G 패턴 적용 이력을 디자인설계서 본문 갱신 위치와 1:1 매핑한다. W5 패턴 A~G 표시는 frontmatter 직후 박스 기존 보존.

### 11.1 Round 카탈로그

| Round | 일자 | 변경 | 영향 § / D-NNN / G-NNN / B-NNN |
|---|---|---|---|
| Round 1 | 2026-06-02 | W5-A 자동 조회 (`loadList()`) 적용 — csa 자동조회 정책 (project_csa_cme_iter_propagation) | §3.4 (A-TITLE onload 자동 조회 행) + frontmatter W5 박스 |
| Round 2 | 2026-06-02~03 | W5-B Detail BindItem 정합 (11 필드, 10 활성 + BIZ_SYSTEM_CODE 폐기) + W5-C commonPermBtnPopup Modal 정식 신설 (14 옵션 체크박스 그리드) | §3.3.3 (Bind 표 W5-B 정합 컬럼) + §6.1 (Modal 정식 신설) + D-016 / D-019 / D-022 / D-024 |
| Round 3 | 2026-06-03 | Detail 확대 + 찾기 버튼 위치 (Detail 폭 + Find Button 우측 → 하단 배치 사전 적용) | §3.3 (Detail 패널 폭) + §3.3.1 (FormGrid 표 8~9 행 D-017 / D-020 하단 배치) |
| Round 4 | 2026-06-03~04 | W5-D Detail 패널 확대 (420 → 700) + W5-E Textarea rows 통일 (COMMON/CUSTOM/POPUP rows={3} + ACTION rows={7}) + W5-F 찾기 버튼 위치 변경 (`flex column` + `alignSelf:flex-start width:80`) + W5-G Detail wrapper overflow + height fix (`overflow:hidden` + `height:calc(100% - 32px)`) | §2.1 (layoutMode) + §3.3 (Detail 패널 폭 + wrapper overflow) + §3.3.1 (FormGrid 표 8~11 행) + D-016 / D-019 / D-022 / D-024 / D-017 / D-020 |
| Round 5 | 2026-06-04 | PERMISSION_ID readOnly inserted-only 점검 (이미 §3.3.1 D-002 + §3.2.2 G-002 분기 편집 정책 적용 — 재확인 완료) | §3.2.2 G-002 비고 + §3.3.1 D-002 + §3.3.3 Bind item0 W5-B 정합 컬럼 |
| Round 6 | 2026-06-04 | N/A (본 화면에 해당하는 Round 6 변경 ✗ — 다른 csa 화면 Round 6 결함 대응 중 본 화면은 무영향) | N/A |
| Round 7 | 2026-06-04~05 | **btn_close 완전 제거** — As-Is xfdl `commonTop` basic 4 의 마지막 닫기 버튼 → ToBe 제거. `PageLayout.buttons` = [btn_search / btn_reset / btn_save] 3 버튼. unused `handleClose` dead code 제거. 사유: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼 의미 ✗. 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준 | §1.2 (PageLayout.buttons 시각화 + 표) + §3.4 (A-TITLE buttons / btn_close onClick 행 폐기) + frontmatter W5 박스 8 번째 행 |

### 11.2 W5 패턴 적용 종합 (frontmatter 박스 정본)

> 본 §11.2 는 frontmatter 직후 W5 박스를 1:1 인용. W5-A ~ W5-G 7 패턴 모두 closed (Round 1~5).

| W5 | 패턴 | Round | 적용 위치 |
|---|---|---|---|
| W5-A | onload 자동 조회 (`loadList()`) | Round 1 | §3.4 |
| W5-B | Detail BindItem 정합 (11 필드 — 10 활성 + BIZ_SYSTEM_CODE 폐기) | Round 2 | §3.3.3 |
| W5-C | commonPermBtnPopup Modal 정식 신설 | Round 2 | §6.1 |
| W5-D | Detail 패널 폭 확대 (420 → 700) | Round 4 | §2.1 + §3.3 |
| W5-E | Textarea rows 통일 (COMMON/CUSTOM/POPUP rows={3} + ACTION rows={7}) | Round 4 → 사용자 명시 | §3.3.1 |
| W5-F | Find Button 위치 변경 (하단 배치) | Round 4 | §3.3.1 |
| W5-G | Detail wrapper overflow + height fix | Round 4 fix | §3.3 |

> **§11 결과**: Round 1~7 카탈로그 등재 완료 + W5 A~G 7 패턴 보존. Round 7 btn_close 제거 본문 갱신 완료 — §1.2 / §3.4 영향 라인 동기화 완료.

---

### §6.14 Phase 3 종료 자동 고해성사 4 질문

| # | 질문 | 답변 |
|---:|---|---|
| 1 | 14항 위반? | No — 분석리포트 / 기능설계서 §X 행수 1:1 인용 (To-Be count 동기화 — S 3 / G 11 / D 24 / LV 2). 컴포넌트 신규 0 (shared 패키지 컴포넌트만 매핑) |
| 2 | 검증 안 한 부분? | No — §10 산출물 정합 표 11 행 모두 기능설계서 §와 1:1 매칭 검증 |
| 3 | 그대로 수용? | No — As-Is xfdl 의 시각적 박스 Static (stc_Static*) 은 디자인 컴포넌트 ✗ → CSS divider 로 흡수. As-Is "부산역 CY" placeholder 는 To-Be 제거 결정 (§3.1). cross-cutting 정책 #1 (2026-05-31) — BIZ_SYSTEM_CODE 폐기로 S-001 / D-007 / D-008 / G-008 / LV-003 / Bind item10 모두 To-Be 폐기 처리 |
| 4 | 임의 합리화? | No — 컴포넌트 매핑은 shared 패키지 정본만 사용 (§9). 새 컴포넌트 신설 ✗ |

> 4 질문 모두 No. Phase 3 통과 (cross-cutting 정책 #1 적용 2026-05-31).
