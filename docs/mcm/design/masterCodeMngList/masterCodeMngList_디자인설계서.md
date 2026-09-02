---
screenId: masterCodeMngList
asIsId: MasterCodeMngList
moduleId: mcm
moduleGroup: cme
작성일: 2026-05-29 (W5 정합 + Round 2 카테고리 nowrap / 그리드 폭 확장 / V-702 cme 자동조회 예외: 2026-06-04)
작성자: Agent
---

# mcm — Master Code 상세조회 디자인설계서

> **Frontend 개발 연계 값** (기능설계서 §1.2 와 동일):
> - mesModule = `m-mcm` / moduleGroup = `cme` / pageName = `masterCodeMngList` / pageId = `masterCodeMngList` / 페이지 유형 = **D 다중 그리드** / tsup entry key = `pages/cme/masterCodeMngList`
>
> **명명 룰**: MES 단일 룰 (mcm 모듈 — APS 예외 미적용). 4 식별자 1byte 동일.
>
> **인용 정본**: 분석리포트 §3 (UI 컴포넌트 전수) + 기능설계서 §3 (S/G/GE) + §5 (B). 자체 추가 ✗.

---

## 0. W5 패턴 + cme 자동조회 예외 반영 (2026-06-04 사용자 검수 이력)

> **본 디자인설계서는 masterCodeMngList Round 2 사용자 검수 결과를 본문 반영한다.** 변경 카탈로그 5 항목 (W5 A 축소 적용 / 카테고리 라벨 nowrap / 그리드 폭 확장 / V-702 cme 자동조회 예외 / PK readOnly N/A) — 상세 이력 = 정합체크서 §J.

### 0.1 W5 A~G 적용 매핑 (csa 8 화면 대비 축소 적용)

| Pattern | 적용 여부 | 적용 위치 / 사유 |
|---|---|---|
| **A** PageLayout 레이아웃 | **✓ 적용 (축소)** | 본 §1.2 / §2.2 / §3.1.1 — `<PageLayout title="Master Code 상세조회" buttons={topButtons}>` + SearchArea + ContentBody + 2 분할 ContentPanel (Master Grid / Detail Toolbar+Grid). Master flex:2 / Detail flex:1 maxWidth:560 으로 좌우 비율 조정 |
| **B** Detail wrapper (28px gray header) | **N/A** | 본 화면 Detail 폼 **부재** (Detail 영역 = Toolbar + Detail Grid). wrapper 적용 대상 ✗ |
| **C** Form row 정렬 | **N/A** | 본 화면 Form row 부재 (SELECT-only — 입력 폼 컨트롤 없음) |
| **D** Grid editable | **✓ editable:false** | 본 §4.1 / §4.2 — Master G-001~G-011 + Detail GE-001~GE-012 모두 read-only (As-Is xfdl `edittype` 미명시 — Nexacro 기본은 진입만, 편집 ✗ → ToBe `editable:false` 1:1 등가) |
| **E** Buttons (commonTopButton 1 + 외부 commonRightButton 1) | **✓ 적용** | 본 §5.1~§5.3 — `fn_search` topMenu 1 버튼 + `btn_excelDown` Detail toolbar 1 버튼 + 외부 `btn_excelDown` Master commonRightButton (visible=false) wiring. csa 화면 대비 (등록/저장/취소/추가/복사/삭제) 6 버튼 ✗ — 조회 전용 |
| **F** Auto-search | **✗ 미적용 (cme 예외)** | **cme 그룹 자동조회 미적용 정책**. AsIs xfdl `//this.fn_search();` 주석 (xfdl:266) 와 정합. 화면 진입 시 빈 그리드 표시, 사용자 btn_search 클릭 시에만 조회. (사용자 결정 [2026-06-02 csa 8 화면 자동조회 정책의 cme 예외]) — 정합체크 §J Round 2 참조 |
| **G** BE 시간 | **N/A** | 본 화면 SELECT 전용 — INSERT/UPDATE/MERGE ✗ → audit (CREATE_DATE / UPDATE_DATE) 작성 행위 ✗. 단, 결과 표시 시 audit 컬럼 표시 대상 ✗ (G/GE 23 컬럼에 audit 미포함) |

### 0.2 csa 8 화면 W5 패턴 대비 축소 사유 요약

| 화면 유형 | csa 표준 W5 (commMenuMng / commObjMng 등) | 본 화면 (masterCodeMngList — cme/SELECT-only) |
|---|---|---|
| Detail 영역 구성 | Detail 입력 폼 (Static + Edit/Combo/Radio/Calendar 16~18 필드) | Detail **그리드** (GE-001~GE-012, read-only) — 폼 컨트롤 ✗ |
| 버튼 구성 | commonTopButton 4 (search/reset/save/close) + commonLeftButton 2~3 + commonRightButton 4~5 | commonTopButton 1 (search) + Detail toolbar Export 1 + commonRightButton 1 (visible=false) |
| Auto-search | csa 자동조회 (loadList onload 실행) | **미적용** (cme 정책 + As-Is 주석 정합) |
| PK readOnly | Detail 폼 수정 시 PK readOnly + 신규 행 추가 시 PK 입력 | **N/A** — Detail 폼 / 행 추가 부재 |

> 본 §0 은 정합체크서 §J 사용자 검수 이력의 본문 반영 결과 — 분석/기능/BPMN 산출물의 자체 추가 ✗ 원칙 (사용자 요구사항 [§9]) 정합 유지.

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
- 표시 형식 (MES 단일 룰): `mcm:masterCodeMngList`
- moduleId 정본: 01 A.1 (업무 페이지는 `portal` 금지)

### 1.2 화면 설계 대상 영역 (PageLayout 기반)

```
┌────────────────────────────────────────────────────────────┐
│ PageLayout.title = "Master Code 상세조회"                    │
│ PageLayout.buttons = [ btn_search (공통 topMenu) ]          │
│  ├─ SearchArea  (A-FILTER)                                  │
│  │    └─ SearchField × 2  (S-001 코드ID / S-002 코드명)      │
│  ├─ FoldButton (B-001 div_search 접기/펴기)                  │
│  └─ ContentBody (MAIN — 좌우 2단)                            │
│        ├─ ContentPanel-LEFT  (A-MAIN-LEFT)                  │
│        │     └─ AgDataGrid (Master G-001~G-011, read-only)  │
│        │     └─ (commonRightButton 외부 url, visible=false) │
│        └─ ContentPanel-RIGHT (A-MAIN-RIGHT)                 │
│              ├─ Toolbar [FX-001 stcCat + FX-002 cboCat       │
│              │           + FX-003 stcMaster                  │
│              │           + B-002 btn_excelDown]              │
│              └─ AgDataGrid (Detail GE-001~GE-012, head 2줄, │
│                              read-only)                      │
└────────────────────────────────────────────────────────────┘
```

| 영역 | 담당 컴포넌트 | 비고 |
|---|---|---|
| SIDEBAR / HEADER / TabsBar | portal PortalShell | 화면별 설계 대상 아님 |
| 페이지 타이틀 / 상단 버튼바 | `PageLayout` `title` / `buttons` | `title` = "Master Code 상세조회" / `buttons` = [btn_search] |
| A-FILTER (조회조건) | `SearchArea` + `SearchField` × 2 | `@dk-oasis/shared/layout` |
| MAIN (콘텐츠) | `ContentBody` + `ContentPanel` × 2 (좌우 분할) | `@dk-oasis/shared/layout` |
| 그리드 (Master / Detail) | `AgDataGrid` (read-only mode) | `@dk-oasis/shared/grid` |
| 폼 (카테고리 콤보) | `Select` (`ComboBox` 대용) | `@dk-oasis/shared/form` |
| 팝업 | (해당 없음) | - |

---

## 2. 화면 레이아웃

### 2.1 레이아웃 유형 + 페이지 유형 자동 결정

| 항목 | 값 |
|---|---|
| **페이지 유형 (자동 결정)** | **D 다중 그리드** (분석 §3 — G=11 + GE=12 → GE≥1 충족) |
| **레이아웃 유형** | **좌우분할형** (As-Is xfdl: div1 right=51.61% / div2 left=49.19% — 좌우 2단 그리드 동시 표시) |
| **참조 화면** | masterCodeMng (등록/수정 가능 버전) — 본 화면은 그 read-only 뷰 |

### 2.2 메인 영역 구조도 (As-Is 좌표 1:1 보존)

```
top=0 ──────────────────────────────────────────────────────  left=20, right=20
│ A-TITLE (div_title, height=50)                              │
│  edt_title "Master Code 상세조회" │ commonTopButton (btn_search)│
top=50 ─────────────────────────────────────────────────────
│ A-FILTER (div_search, height=43, cssclass=div_WFSA_Box)     │
│  [코드ID] [edt_codeVal] [코드명] [edt_codeNm]                │
top=93 ─────────────────────────────────────────────────────
│ B-001 btn_fold (height=15, 접기 토글)                        │
top=113 ────────────────────────────────────────────────────
│ A-MAIN (div_main, bottom=30, 좌우 분할)                     │
│ ┌─────────────────────────┬─────────────────────────────┐  │
│ │ A-MAIN-LEFT (div1)       │ A-MAIN-RIGHT (div2)         │  │
│ │  right=51.61%            │  left=49.19% / right=0      │  │
│ │ ┌── Grid top=25 ───────┐│ ┌── Toolbar top=0 ───────┐ │  │
│ │ │ grd_main             ││ │ FX-001 [카테고리]        │ │  │
│ │ │  head 1줄 + body N   ││ │ FX-002 cbo_categoryId    │ │  │
│ │ │  G-001 ~ G-011       ││ │ FX-003 stc_master         │ │  │
│ │ │  (read-only — edit-  ││ │ B-002 btn_excelDown       │ │  │
│ │ │   type/displaytype   ││ └─────────────────────────┘ │  │
│ │ │   명시 ✗ 으로 표시만)││ ┌── Grid top=25 ───────────┐ │  │
│ │ │                      ││ │ grd_detail                │ │  │
│ │ │ div_rightMenu       ││ │  head 2줄 (rowspan/        │ │  │
│ │ │  (visible=false,     ││ │   colspan) + body N        │ │  │
│ │ │   외부 url include) ││ │  GE-001 ~ GE-012           │ │  │
│ │ │                      ││ │  (read-only)               │ │  │
│ │ └──────────────────────┘│ └─────────────────────────┘ │  │
│ └─────────────────────────┴─────────────────────────────┘  │
bottom=30 ──────────────────────────────────────────────────
│ A-FOOTER (div_bottom, height=20, cssclass=div_WF_Footer)    │
│  commonBottomStatus.xfdl include                            │
bottom=0 ───────────────────────────────────────────────────
```

---

## 3. 영역별 배치 상세

### 3.1 영역 크기 및 배치

| 영역 | 높이 | 너비 | 스크롤 | 리사이즈 | 비고 |
|---|---|---|---|---|---|
| A-TITLE | 50 px 고정 | 100% (left=20 / right=20) | 없음 | N | div_title (xfdl:6) |
| A-FILTER | 43 px 고정 | 100% (left=20 / right=20) | 없음 | N (btn_fold 로 접기/펴기 토글) | div_search (xfdl:19) |
| A-FOLD | 15 px 고정 | 100% (left=20 / right=20) | 없음 | N | btn_fold (xfdl:30) |
| A-MAIN | 가변 (top=113 / bottom=30) | 100% (left=20 / right=20) | (자식 그리드별 세로) | Y (xfdl 좌우 분할 비율 고정) | div_main (xfdl:31) |
| A-MAIN-LEFT (Master 영역) | A-MAIN 동일 (top=0 / bottom=0 within div_main) | 약 48.4% (left=0 / right=51.61%) | 세로 (grd_main) | N (xfdl 고정) | div1 (xfdl:34) |
| A-MAIN-RIGHT (Detail 영역) | A-MAIN 동일 | 약 50.8% (left=49.19% / right=0) | 세로 (grd_detail) | N (xfdl 고정) | div2 (xfdl:90) |
| A-FOOTER | 20 px 고정 | 100% (left=0 / right=0) | 없음 | N | div_bottom (xfdl:29) |

### 3.1.1 ContentPanel 비율 + 그리드 폭 확장 (W5 A — Round 2, 2026-06-04 정합)

> **목적**: AsIs xfdl 좌우 분할 (`div1 right=51.61% / div2 left=49.19%` — Master ≈ 48.4% / Detail ≈ 50.8%) 을 ToBe 에서 Master 그리드 폭 확장 + Detail 영역 좁힘으로 비율 조정. 사유 = 카테고리 라벨 + Select wrapper nowrap 정합 시 Detail toolbar 가 좌측으로 압축되며, **Master 그리드 정보 밀도 (11 컬럼 / 1175 px) 확보 + Detail 그리드 정보 밀도 (12 컬럼 / 676 px, autofittype=col) 유지** 의 균형을 위해 Master:Detail ≈ 2:1 비율 조정 (사용자 결정 [Round 2]).

| 영역 | ToBe 컴포넌트 | 비율 / 너비 | 비고 |
|---|---|---|---|
| ContentBody root | `<ContentBody>` (shared/layout) | `flex:1 / display:flex / flexDirection:column / gap:0` | AsIs `div_main` 등가 (top=113, bottom=30) |
| Column stacker div | `<div>` 직속 children stacker | `display:flex / flexDirection:column / gap:16 / height:100%` | csa W5 표준 — 2x2 collapse 회피 핵심. 본 화면은 Row2 미사용 (단일 행 좌우 분할 구조) |
| Row1 (Master + Detail) | `<div>` 1 layer 직속 | `display:flex / gap:16 / flex:1 / minHeight:0` | AsIs `div_main` 좌우 분할 1:1 |
| Row1-Left (Master Grid) | `<ContentPanel>` | **`flex: 2 1 0` / minWidth:0** | Round 2 — Master 그리드 폭 확장 (≈ 67%). AsIs `div1 right=51.61%` 정합 + 그리드 11 컬럼 정보 밀도 확보 |
| Row1-Right (Detail Toolbar + Grid) | `<ContentPanel>` | **`flex: 1 1 0` / minWidth:0 / maxWidth: 560** | Round 2 — Detail 영역 좁힘 (≈ 33%, 최대 560px 캡). AsIs `div2 left=49.19%` 보다 좁힘 = 카테고리 라벨 nowrap 적용 후 Detail 정보 밀도 (autofittype=col) 와 정합 |
| Row2 (sub1 + sub2) | (해당 없음 — 본 화면 미사용) | - | W5 정합 표준 구조만 보존 |

> **정책 (W5 A 축소)**: csa 8 화면 W5 A 의 column stacker div 4 단 명시 패턴은 유지하되, Row1-Left/Right 의 flex 비율을 **2:1 (Master 우선) + Detail maxWidth 560 캡** 으로 조정. AsIs xfdl 의 1:1 비율 (49.19% vs 48.4%) 은 ToBe shared 컴포넌트 환경에서 Master 그리드 컬럼 폭 (11 × 평균 107 px = 1175 px) 을 수용할 수 없어 Round 2 사용자 검수에서 비율 조정 결정.

### 3.2 A-FILTER 내부 배치 (좌표 As-Is 1:1)

```
top=10 ─────────────────────────────────────────────────────────────────────
│ [코드ID]  [edt_codeVal]    [코드명]   [edt_codeNm]                          │
│  ↑         ↑                ↑          ↑                                    │
│  stc_      width=135       stc_       width=135                             │
│  codeVal   left=stc:10     codeVal-   left=stc:10                           │
│  (50w)     value="USD"     Mean(50w)  value="USD"                           │
│            inputmode=upper                                                  │
top=30 ─────────────────────────────────────────────────────────────────────
```

| 컨트롤 | 정확한 xfdl 좌표 | cssclass | 비고 |
|---|---|---|---|
| stc_codeVal (S-001 라벨) | left=10 / top=10 / width=50 / height=20 | stc_WFSA_Label | "코드ID" |
| edt_codeVal (S-001 입력) | left=stc_codeVal:10 / top=10 / width=135 / height=20 | (없음) | value="USD" / inputmode="upper" / onkeydown=div_search_edtDpNm_onkeydown |
| stc_codeValMean (S-002 라벨) | left=edt_codeVal:20 / top=10 / width=50 / height=20 | stc_WFSA_Label | "코드명" |
| edt_codeNm (S-002 입력) | left=stc_codeValMean:10 / top=10 / width=135 / height=20 | (없음) | value="USD" / onkeydown=div_search_edtDpNm_onkeydown |

> **masterCodeMng 와의 차이점**: A-FILTER 에 stc_master (선택 Master 표시) ✗ — 본 화면은 stc_master 가 div2 toolbar (FX-003) 로 이동.

### 3.3 A-MAIN-LEFT 내부 배치 (Master 영역)

```
top=0 ──────────────────────────────────────────────────────────────────  right=0
│ (Toolbar 없음 — 본 화면은 Master 그리드에 별도 toolbar 부재)            │
│  div_rightMenu (visible=false, left=0, right=0, top=0, height=20)       │
top=25 ──────────────────────────────────────────────────────────────────
│ grd_main (binddataset=ds_grdMain, taborder=0)                           │
│  Format: head 1줄 (25px) + body 1줄 (25px) / Column 11개                 │
│  Columns: 30/120/120/120/120/120/120/120/120/120/55  (총 1175 px)        │
│                                                                          │
│  Head row 0:  NO │ 코드ID* │ 코드명* │ 설명 │ 마스터코드 │ 참조1 │ ...     │
│  Body row:    #   CODE_ID   CODE_NM    CODE_DESC MASTER_CODE             │
│                                       MASTER_CODE_REF1~5_NM USE_TP       │
│  ↑                  ↑          ↑                                         │
│  expr:currow+1     CellEssentail head + bold (* 표시 = 필수)              │
│                                                                          │
│  options: cellmovingtype=col / cellsizingtype=col / selecttype=cell /    │
│           autoenter=select                                               │
│  events:  oncellclick → fn_searchDetail (xfdl:363)                       │
│           onheadclick → gfn_commonOnheadclick (정렬, xfdl:404)            │
bottom=0 ───────────────────────────────────────────────────────────────
```

| Toolbar/Menu 위치 | 컨트롤 | 좌표 (As-Is) |
|---|---|---|
| top=0 / left=0 / right=0 / height=20 / visible=false | div_rightMenu (외부 commonRightButton.xfdl url include) | (taborder=1 — 숨김 / fn_button() 에서 btn_excelDown 기본버튼 등록 — visible=false 상태) |

> **masterCodeMng 와의 차이점**: Master 그리드의 행추가/행복사/행삭제/행취소/Export/저장 (B-001~B-006) 6 버튼 toolbar ✗ — 본 화면은 조회 전용이라 모두 부재.

### 3.4 A-MAIN-RIGHT 내부 배치 (Detail 영역)

```
top=0 ───────────────────────────────────────────────────────────────────  right=0
│ Toolbar (top=0, height=20)                                              │
│  [카테고리] [cbo_categoryId] [stc_master indigo 강조] ............ Export │
│  (Static00) (cbo_categoryId) (FX-003 right=341)         (btn_excelDown) │
│  left=0     left=Static00:10                                            │
top=25 ──────────────────────────────────────────────────────────────────
│ grd_detail (binddataset=ds_grdDetail, taborder=0)                       │
│  Format: head 2줄 (25px × 2) + body 1줄 (25px) / Column 12개             │
│  Columns: 30/48/80/48/80/30/120/48/48/48/48/48  (총 676 px, autofittype=col)│
│                                                                          │
│  Head row 0:  NO│ 코드 (colspan=2) │ 카테고리 (colspan=2) │ 정렬\\r\\n순서 │
│               (rowspan=2)        (rowspan=2)                            │
│               │ 설명│ 참조1│ 참조2│ 참조3│ 참조4│ 참조5 (rowspan=2)       │
│  Head row 1:    값* │ 의미*│ ID*│ 명                                     │
│                                                                          │
│  Body row:    #│CODE_VAL│CODE_VAL_MEAN│CATEGORY_ID│CATEGORY_NM│SORT_SEQ │
│                │CODE_VAL_DESC│CODE_VAL_REF1_MN~5_MN                       │
│                                                                          │
│  options: autofittype=col / cellmovingtype=col / cellsizingtype=col /    │
│           selecttype=multiarea / autoenter=select                        │
│  events:  onheadclick → gfn_commonOnheadclick (정렬, xfdl:410)            │
bottom=0 ───────────────────────────────────────────────────────────────
```

| Toolbar 컨트롤 위치 | 컨트롤ID | 좌표 (As-Is) |
|---|---|---|
| left=0 / top=0 / width=60 | FX-001 Static00 | "카테고리" 라벨 (stc_WFSA_Label) |
| left=Static00:10 / top=0 / width=120 | FX-002 cbo_categoryId | innerdataset=ds_lovCategoryId / codecolumn=CATEGORY_ID / datacolumn=CATEGORY_NM |
| left=cbo_categoryId:5 / top=0 / right=341 / height=20 | FX-003 stc_master | stc_WFSA_Label, stc_fontColor_indigo (인디고 강조) — 조회 후 MASTER_CODE 표시 |
| right=0 / top=0 / width=64 / height=20 | B-002 btn_excelDown | btn_WF_ExcelDown / text="Export" / textPadding="0px 0px 0px 5px" |

#### 3.4.1 카테고리 라벨/Select wrapper nowrap (Round 2 — 2026-06-04 정합)

> **목적**: Round 1 검수 시 Detail 영역 폭이 좁혀짐 (§3.1.1 maxWidth:560 캡) + Detail toolbar 의 카테고리 영역 (`"카테고리:" 라벨 + Select 120px + stc_master indigo + Export 64px`) 의 자연 줄바꿈 발생으로 라벨이 두 줄로 깨지는 결함 확인. ToBe 정합으로 **라벨 텍스트 자체 + Select wrapper 양쪽 모두 `whiteSpace: nowrap`** 적용하여 한 줄 강제.

| 컴포넌트 | ToBe 스타일 | 사유 |
|---|---|---|
| 카테고리 라벨 `<span>` ("카테고리:") | **`whiteSpace: nowrap`** | 라벨 자체의 줄바꿈 차단 — Detail 영역 폭 압축 시에도 한 줄 유지. AsIs `Static00.text="카테고리"` 1:1 (To-Be 정합 시 콜론 `:` 1자 추가) |
| Select wrapper `<div>` (FX-002 cbo_categoryId 감싸기) | **`whiteSpace: nowrap`** | Select 외곽 wrapper 도 nowrap 적용 — 라벨 + Select 가 같은 flex row 에 머무르도록 강제. Detail 영역 폭이 좁아져도 Export 버튼이 우측으로 밀려나지 않음 |
| Toolbar row 컨테이너 | `display:flex / gap:8 / alignItems:center` | csa W5 C 표준 (다중 컴포넌트 행 정렬) 정합 |

> **Round 2 결정**: 본 Round 2 nowrap 정합은 §3.1.1 의 Master flex:2 / Detail maxWidth:560 캡과 짝을 이룬다. Detail 폭을 좁힘 → 카테고리 라벨 줄바꿈 위험 → nowrap 강제 → 한 줄 유지. AsIs 좌표 (`Static00 width=60 / cbo width=120 / stc_master right=341 / btn_excelDown right=0 width=64`) 의 절대 좌표 합 (60+120+stc_master+64) 은 Detail 영역 폭이 충분할 때만 한 줄 보장 → ToBe 좁힘 정책 시 nowrap 으로 동일 결과 강제.

> **masterCodeMng 와의 차이점**: Detail 그리드의 행추가/행복사/행삭제/행취소/Import/Export/저장 (B-007~B-013) 7 버튼 toolbar 대신 Export 1 개 (B-002) 만 존재. stc_master (선택 Master 표시) 가 A-FILTER 에서 본 toolbar 로 이동 (FX-003).

---

## 4. 그리드 (G-NNN / GE-NNN — 기능설계서 §3.2 인용)

### 4.1 G-NNN 메인 그리드 (`grd_main`)

| 컬럼 | size (xfdl) | cell type (head / body) | format | 정렬 | 편집 | 필수 |
|---|---:|---|---|---|---|---|
| G-001 NO | 30 | head:text="NO" / body:expr:currow+1 | int | Center | N | - |
| G-002 코드ID | 120 | head:text="코드ID" cssclass=CellEssentail font=bold / body:editmaxlength=50 / editimemode=alpha / editinputmode=upper / tooltiptext=bind:CODE_ID | varchar(50) | Left | N (조회 전용 — edittype 명시 ✗) | Y (head CellEssentail) |
| G-003 코드명 | 120 | head:text="코드명" cssclass=CellEssentail font=bold / body:editmaxlength=180 / editimemode=hangul / tooltiptext=bind:CODE_NM | varchar(180) | Left | N | Y (head CellEssentail) |
| G-004 설명 | 120 | head:text="설명" font=bold / body:editmaxlength=300 / editimemode=hangul / tooltiptext=bind:CODE_DESC | varchar(300) | Left | N | N |
| G-005 마스터코드 | 120 | head:text="마스터코드" font=bold / body:editmaxlength=300 / editimemode=hangul / tooltiptext=bind:MASTER_CODE | varchar(300) | Left | N | N |
| G-006 참조1 | 120 | head:text="참조1" / body:bind:MASTER_CODE_REF1_NM | varchar (scalar subquery 결과) | Left | N | N |
| G-007 참조2 | 120 | head:text="참조2" / body:bind:MASTER_CODE_REF2_NM | (동일) | Left | N | N |
| G-008 참조3 | 120 | head:text="참조3" / body:bind:MASTER_CODE_REF3_NM | (동일) | Left | N | N |
| G-009 참조4 | 120 | head:text="참조4" / body:bind:MASTER_CODE_REF4_NM | (동일) | Left | N | N |
| G-010 참조5 | 120 | head:text="참조5" / body:bind:MASTER_CODE_REF5_NM | (동일) | Left | N | N |
| G-011 사용여부 | 55 | head:text="사용여부" cssclass=delBorder_r,CellEssentail font=bold / body:displaytype=combotext / combodataset=ds_chkYn / combocodecol=CODE_VAL / combodatacol=CODE_VAL_MEAN / combodisplaynulltype=nulltext | combo (LV-001 ds_chkYn: Y/N) | Center | N (조회 전용 — combo 표시만) | Y (head CellEssentail) |

> 그리드 Header Row 1 + Body Row 1 (`band="head"` / body). `cellmovingtype="col"` / `cellsizingtype="col"` / `selecttype="cell"` / `autoenter="select"`. autofittype 미명시 (기본).
> **참고**: 본 화면의 G-NNN body cell 들은 `editmaxlength` / `editimemode` / `editinputmode` 만 지정되어 있고 별도 `edittype="text"` 가 없음. Nexacro 의 기본 grid 는 `autoenter="select"` 상태에서 셀 진입만 가능하고 실제 편집은 발생하지 않음 — 조회 전용 의도.

### 4.2 GE-NNN Detail 그리드 (`grd_detail`)

| 컬럼 | size | head row 0 | head row 1 | body cell type / format | 정렬 | 편집 | 필수 |
|---|---:|---|---|---|---|---|---|
| GE-001 NO | 30 | "NO" (rowspan=2) | - | expr:currow+1 | Center | N | - |
| GE-002 코드 값 | 48 | "코드" (colspan=2, col=1) | "값" (row=1 col=1, CellEssentail font=bold) | bind:CODE_VAL / editmaxlength=50 / editimemode=alpha / editinputmode=upper / tooltiptext=bind:CODE_VAL | Left | N (조회 전용) | Y (head CellEssentail) |
| GE-003 코드 의미 | 80 | (colspan 흡수) | "의미" (row=1 col=2, CellEssentail font=bold) | bind:CODE_VAL_MEAN / editmaxlength=120 / editimemode=hangul / tooltiptext=bind:CODE_VAL_MEAN | Left | N | Y (head CellEssentail) |
| GE-004 카테고리 ID | 48 | "카테고리" (colspan=2, col=3) | "ID" (row=1 col=3, CellEssentail font=bold) | bind:CATEGORY_ID / tooltiptext=bind:CATEGORY_ID | Left | N (read-only) | Y (head CellEssentail) |
| GE-005 카테고리 명 | 80 | (colspan 흡수) | "명" (row=1 col=4) | bind:CATEGORY_NM / tooltiptext=bind:CATEGORY_NM | Left | N | - |
| GE-006 정렬순서 | 30 | "정렬\\r\\n순서" (rowspan=2) | - | bind:SORT_SEQ / maskeditformat="###,###,###,###,###,###" | Right | N (mask 표시만) | - |
| GE-007 설명 | 120 | "설명" (rowspan=2) | - | bind:CODE_VAL_DESC / editmaxlength=300 / editimemode=hangul / tooltiptext=bind:CODE_VAL_DESC | Left | N | - |
| GE-008 참조1 | 48 | "참조1" (rowspan=2) | - | bind:CODE_VAL_REF1_MN / tooltiptext=bind:CODE_VAL_REF1_MN | Left | N | - |
| GE-009 참조2 | 48 | "참조2" (rowspan=2) | - | bind:CODE_VAL_REF2_MN / tooltiptext=bind:CODE_VAL_REF2_MN | Left | N | - |
| GE-010 참조3 | 48 | "참조3" (rowspan=2) | - | bind:CODE_VAL_REF3_MN / tooltiptext=bind:CODE_VAL_REF3_MN | Left | N | - |
| GE-011 참조4 | 48 | "참조4" (rowspan=2) | - | bind:CODE_VAL_REF4_MN / tooltiptext=bind:CODE_VAL_REF4_MN | Left | N | - |
| GE-012 참조5 | 48 | "참조5" (rowspan=2) | - | bind:CODE_VAL_REF5_MN / tooltiptext=bind:CODE_VAL_REF5_MN | Left | N | - |

> 그리드 Header Row 2 (rowspan / colspan 사용) + Body Row 1. `autofittype="col"` / `selecttype="multiarea"` / `cellmovingtype="col"` / `cellsizingtype="col"` / `autoenter="select"`.

### 4.3 그리드 추가 동작 (UX)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| UX-001 | Master 행 클릭 시 Detail 자동 조회 (rowType==2 가드는 dead code) | grd_main oncellclick (xfdl:363) | 기능 §6.3 V-201~V-204 |
| UX-002 | Detail 헤드 클릭 시 gfn_commonOnheadclick (단순 정렬) | grd_detail onheadclick (xfdl:410) | 기능 §4.4 #13 |
| UX-003 | Master 헤드 클릭 시 gfn_commonOnheadclick (단순 정렬) | grd_main onheadclick (xfdl:404) | 기능 §4.4 #12 |
| UX-004 | 카테고리 콤보 변경 시 Detail 그리드 필터링 (`CATEGORY_ID == '{값}'` 또는 null 이면 전체) | cbo_categoryId onitemchanged (xfdl:355) | 기능 §6.4 V-301~V-303 |
| UX-005 | Form onload 시 ds_grdMain.set_enableevent(false) — 초기 이벤트 비활성화 | MasterCodeMngList_onload (xfdl:260) | 기능 §6.7 V-604 |
| UX-006 | search 콜백에서 ds_grdMain.set_enableevent(true) 로 이벤트 복구 | fn_callBack("search") (xfdl:330) | 기능 §6.6 V-501 |
| UX-007 | searchDetail 콜백에서 ds_lovCategoryId 에 "" / "전체" 행 prepend + cbo_categoryId.set_index(0) + stc_master.set_text(MASTER_CODE) | fn_callBack("searchDetail") (xfdl:341~345) | 기능 §6.6 V-505 |
| UX-008 | **자동 조회 미적용 (cme 그룹 예외 정책)** — Form onload 시 fn_search 호출 ✗. 화면 진입 시 빈 그리드 상태, 사용자 btn_search 클릭 시점에만 ds_grdMain 채움. AsIs `//this.fn_search();` 주석 처리 (xfdl:266) 와 1:1 정합 | MasterCodeMngList_onload (xfdl:266) | 기능 §6.7 V-702 + 본 §0.1 W5 F |

> **masterCodeMng 와의 차이점**: UX-002 (CHK 헤드 토글 전체선택) / UX-003 (CHK 외 컬럼 변경 시 자동 CHK=1) / UX-005 (search 콜백 후 onkeydown 등록) / UX-006 (ds_grdMainAll 에 USER_DEFINE prepend) — 4 가지 동작 모두 본 화면에서 부재. 본 화면은 조회 전용 UX 만 유지.

> **csa 8 화면과의 차이점 (V-702 / W5 F 자동조회 정책)**: csa 그룹 (commMenuMng / commObjMng 등 7 화면) 은 화면 진입 시 자동 loadList 실행 (사용자 결정 [2026-06-02]). 본 화면은 **cme 그룹 예외** 로 자동조회 ✗ (UX-008). AsIs xfdl:266 의 `this.fn_search();` 주석 처리 흔적과 V-702 결정이 직접 정합.

---

## 5. 버튼 (toolbar / 그리드 셀) — 기능 §5.1 인용

### 5.1 div_main 상단 (접기)

| 버튼ID | text | cssclass | width / 위치 | 동작 |
|---|---|---|---|---|
| B-001 | (없음 — 아이콘) | btn_WFSA_Fold | top=93 / height=15 / left=20 / right=20 | div_search 접기/펴기 |

### 5.2 Detail toolbar (div2 상단)

| 컨트롤ID | text | cssclass | width | right anchor / left | 동작 |
|---|---|---|---|---|---|
| FX-001 | "카테고리" (Static) | stc_WFSA_Label | 60 | (left=0) | 라벨 |
| FX-002 | (Combo) | (없음) | 120 | (left=Static00:10) | 카테고리 선택 / 필터 |
| FX-003 | (Static — 동적 텍스트) | stc_WFSA_Label,stc_fontColor_indigo | (right=341) | (left=cbo_categoryId:5) | 조회 후 MASTER_CODE 표시 |
| B-002 | Export | btn_WF_ExcelDown | 64 | right=0 | Detail Excel export (마스터코드 헤더 포함) |

### 5.3 외부 버튼 / Master 측 commonRightButton

| 버튼ID | text | cssclass | width / 위치 | 동작 |
|---|---|---|---|---|
| EX-001 (외부 등록) | (btn_search) | (외부) | div_title.div_topMenu | 공통 topMenu 의 fn_commonTop_onload 가 btn_search 자동 등록 → fn_search 호출 |
| EX-002 (외부 등록, 숨김) | (btn_excelDown) | (외부) | div1.div_rightMenu (visible=false) | commonRightButton 의 fn_commonRight_onload 가 btn_excelDown 등록 → fn_excelDown (xfdl:387) → gfn_exportExcel(grd_main, titletext) — Master 그리드 Excel export. visible=false 이므로 화면에서는 보이지 않으나 외부 menu 호출 시 동작 가능 |

### 5.4 그리드 셀 인라인 버튼 (GB-NNN)

해당 없음 — 본 화면 그리드 셀에 ButtonField / displaytype="button" ✗.

---

## 6. 팝업 (P-NNN — 기능 §9 인용)

해당 없음 — xfdl Script 의 `gfn_openPopup` / `OpenForm` grep 결과 0 회.

| P-ID | 종류 | 화면 (xfdl url) | 트리거 | 전달 | 반환 처리 |
|---|---|---|---|---|---|
| - | - | - | - | - | - |

---

## 7. 메시지 표기 (기능 §10 인용)

### 7.1 표기 위치별

| 위치 | 메시지 종류 | 컴포넌트 |
|---|---|---|
| 하단 status bar | M-001 (search 건수) / M-002 (searchDetail 건수) | `gfn_commonBottomStatus_msg(text)` (div_bottom common — To-Be `StatusBar` 등가) |
| 하단 status bar (오류) | M-003 (서버 오류 메시지 `strErrorMsg`) | 동일 |

> 본 화면은 조회 전용이라 validation 모달 메시지 0 개. masterCodeMng 의 M-001~M-013 (warning) 미적용.

### 7.2 색상 / 강조

| 컴포넌트 | cssclass | 색상 의미 |
|---|---|---|
| stc_master (FX-003) | stc_WFSA_Label,stc_fontColor_indigo | 인디고 — 선택된 Master 표시 강조 |
| Master 그리드 head 필수 컬럼 (G-002 / G-003 / G-011) | CellEssentail / font=bold | 굵은 글씨 — 필수 입력 컬럼 (조회 전용이지만 head 표기 유지) |
| Master 그리드 head 일반 컬럼 (G-004 / G-005) | font=bold | 굵은 글씨 (CellEssentail ✗) |
| Detail 그리드 head 필수 컬럼 (GE-002 / GE-003 / GE-004) | CellEssentail / font=bold | 굵은 글씨 |
| 사용여부 head (G-011) | delBorder_r,CellEssentail | 우측 테두리 제거 + 필수 |

> **masterCodeMng 와의 차이점**: Detail 행 CHK=1 시 cssclass cellBody_BgColor_red 미적용 — 본 화면은 CHK 토글 ✗.
