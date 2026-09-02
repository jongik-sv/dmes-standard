---
screenId: commObjMng
asIsId: CommObjMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29 (6 정책 결정 일괄 반영: 2026-05-31 / W5 정합 + Round 4/5 정책 동기화: 2026-06-02 ~ 2026-06-04 / Round 6~7 btn_close 제거: 2026-06-04 ~ 2026-06-05)
작성자: Agent
---

# mcm — OBJECT 관리 디자인설계서

> **Frontend 개발 연계 값** (기능설계서 §1.2 와 동일):
> - mesModule = `m-mcm` / moduleGroup = `csa` / pageName = `commObjMng` / pageId = `commObjMng` / 페이지 유형 = **C 단일 그리드 + 단일 상세 폼** / tsup entry key = `pages/csa/commObjMng`
>
> **명명 룰**: MES 단일 룰 (mcm 모듈 — APS 예외 미적용). 4 식별자 1byte 동일.
>
> **인용 정본**: 분석리포트 §3 (UI 컴포넌트 전수) + 기능설계서 §3 (S/G) + §4 (D) + §5 (B). 자체 추가 ✗.

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
- 표시 형식 (MES 단일 룰): `mcm:commObjMng`
- moduleId 정본: 01 A.1 (업무 페이지는 `portal` 금지)

### 1.2 화면 설계 대상 영역 (PageLayout 기반)

```
┌────────────────────────────────────────────────────────────┐
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
│ PageLayout.title = "OBJECT 관리"                            │
│ PageLayout.buttons = [ btn_search / btn_reset / btn_save ]  │
│                        (공통 topMenu 3 버튼 — Round 7 btn_close 제거)│
│  ├─ SearchArea  (A-FILTER)                                  │
│  │    └─ As-Is: SearchField × 3  (S-001 BIZ SYSTEM Combo /  │
│  │       S-002 OBJECT TextBox / S-003 사용 여부 Combo)       │
│  │       To-Be 정책 #1: SearchField × 2 (S-001 폐기)        │
│  ├─ FoldButton (B-009 div_search 접기/펴기)                  │
│  └─ ContentBody (MAIN — 좌우 2단)                            │
│        ├─ ContentPanel-LEFT  (A-MAIN-LEFT — 마스터 그리드)    │
│        │     ├─ Toolbar [ commonLeftButton (chk_check,        │
│        │     │            btn_sum) +                          │
│        │     │            commonRightButton (rowAdd, rowDel,  │
│        │     │            rowCopy, rowCancel) ]               │
│        │     └─ AgDataGrid (Master G-001~G-015, head 1줄)     │
│        └─ ContentPanel-RIGHT (A-MAIN-RIGHT — 상세 입력 폼)    │
│              └─ Detail Form (D-001~D-016, 16 fields)          │
└────────────────────────────────────────────────────────────┘
```

| 영역 | 담당 컴포넌트 | 비고 |
|---|---|---|
| SIDEBAR / HEADER / TabsBar | portal PortalShell | 화면별 설계 대상 아님 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 페이지 타이틀 / 상단 버튼바 | `PageLayout` `title` / `buttons` | `title` = "OBJECT 관리" / `buttons` = [btn_search / btn_reset / btn_save] (Round 7 — btn_close 제거 / 사유: portal 탭 close 는 host 처리) |
| A-FILTER (조회조건) | As-Is: `SearchArea` + `SearchField` × 3 (Combo / TextBox / Combo) / **To-Be 정책 #1**: `SearchField` × 2 (TextBox / Combo — S-001 BIZ SYSTEM Combo 폐기) | `@dk-oasis/shared/layout` |
| MAIN (콘텐츠) | `ContentBody` + `ContentPanel` × 2 (좌우 분할) | `@dk-oasis/shared/layout` |
| 그리드 (Master) | `AgDataGrid` (+ `useGridDataManager`) | `@dk-oasis/shared/grid` |
| 상세 폼 (Detail) | As-Is: `Form` + Field × 16 (TextBox / Combo / Radio / Calendar) / **To-Be 정책 #1**: × 15 (D-003 BIZ SYSTEM 폐기) | `@dk-oasis/shared/form` |
| 팝업 | (해당 없음) | - |

---

## 2. 화면 레이아웃

### 2.1 레이아웃 유형 + 페이지 유형 자동 결정

| 항목 | 값 |
|---|---|
| **페이지 유형 (자동 결정)** | **C 단일 그리드 + 단일 상세 폼** (분석 §3 — As-Is: G=15 + D=16 / **To-Be 정책 #1**: G=14 + D=15 (G-006/D-003 폐기) + GE=0 + L=0) |
| **레이아웃 유형** | **좌우분할형** (As-Is xfdl: div_mainGrd right=440 / div_mainDetail width=430 — 좌측 그리드 + 우측 상세 입력 폼) |
| **참조 화면** | (없음 — `-`) |

### 2.2 메인 영역 구조도 (As-Is 좌표 1:1 보존)

```
top=0 ──────────────────────────────────────────────────────  left=20, right=20
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
│ A-TITLE (div_title, height=40)                              │
│  edt_title "OBJECT 관리"  │  commonTopButton (btn_search /  │
│                              btn_reset / btn_save)           │
│                              (Round 7 — btn_close 제거)      │
top=50 ─────────────────────────────────────────────────────
│ A-FILTER (div_search, height=43, cssclass=div_WFSA_Box)     │
│  [BIZ SYSTEM] [cbo_bizSystemCode] [OBJECT] [edt_OBJECT_ID]  │
│  [사용 여부] [cbo_USE_TP]                                    │
top=93 ─────────────────────────────────────────────────────
│ B-009 btn_fold (height=12, 접기 토글)                        │
top=113 ────────────────────────────────────────────────────
│ A-MAIN (div_main, bottom=40, 좌우 분할)                     │
│ ┌─────────────────────────┬─────────────────────────────┐  │
│ │ A-MAIN-LEFT             │ A-MAIN-RIGHT                │  │
│ │ (div_mainGrd)           │ (div_mainDetail)            │  │
│ │  right=440              │  left=div_mainGrd:10 /      │  │
│ │                         │  width=430                  │  │
│ │ ┌── Toolbar top=0 ────┐ │ ┌── div_detail top=25 ────┐ │  │
│ │ │ edt_srch_cseq "조회 │ │ │ Static + Edit 16쌍       │ │  │
│ │ │   결과" (라벨)       │ │ │ (배경 + 라벨 + 입력)     │ │  │
│ │ │ div_leftMenu        │ │ │                          │ │  │
│ │ │  (chk_check,        │ │ │ Row 1  OBJECT ID*        │ │  │
│ │ │   btn_sum)          │ │ │ Row 2  SYSTEM            │ │  │
│ │ │ div_rightMenu       │ │ │ Row 3  BIZ SYSTEM*       │ │  │
│ │ │  (rowAdd, rowDel,   │ │ │ Row 4  MENU ID           │ │  │
│ │ │   rowCopy,          │ │ │ Row 5  ID*               │ │  │
│ │ │   rowCancel)        │ │ │ Row 6  OBJECT명          │ │  │
│ │ └─────────────────────┘ │ │ Row 7  프로그램 설명     │ │  │
│ │ ┌── Grid top=25 ──────┐ │ │ Row 8  OBJECT TYPE       │ │  │
│ │ │ grd_main            │ │ │ Row 9  SERVICE           │ │  │
│ │ │  head 1줄 + body N  │ │ │ Row 10 접속 경로*        │ │  │
│ │ │  G-001 ~ G-015      │ │ │ Row 11 FORM URL          │ │  │
│ │ │  (상태/OBJECT ID/   │ │ │ Row 12 외부 접속 주소    │ │  │
│ │ │   NAME/PROGRAM_DESC/│ │ │ Row 13 사용 여부 (Radio) │ │  │
│ │ │   SYSTEM/BIZ_SYSTEM/│ │ │ Row 14 파라메터          │ │  │
│ │ │   OBJECT_TYPE/      │ │ │ Row 15 유효 개시일       │ │  │
│ │ │   SERVICE/USE_TP/   │ │ │ Row 16 유효 기한일       │ │  │
│ │ │   FORM_URL/         │ │ │                          │ │  │
│ │ │   OUT_ACCESS_IP/    │ │ │ (* = Essential 필수)     │ │  │
│ │ │   PARAM/            │ │ │                          │ │  │
│ │ │   START/END/        │ │ │                          │ │  │
│ │ │   ACCESS_TP)        │ │ └──────────────────────────┘ │  │
│ │ └─────────────────────┘ │                              │  │
│ └─────────────────────────┴─────────────────────────────┘  │
bottom=40 ──────────────────────────────────────────────────
│ A-FOOTER (div_bottom, height=20, cssclass=div_WF_Footer)    │
│  commonBottomStatus.xfdl include                            │
bottom=0 ───────────────────────────────────────────────────
```

---

## 3. 영역별 배치 상세

### 3.1 영역 크기 및 배치

| 영역 | 높이 | 너비 | 스크롤 | 리사이즈 | 비고 |
|---|---|---|---|---|---|
| A-TITLE | 40 px 고정 (height=40) | 100% (left=20 / right=20) | 없음 | N | div_title (xfdl:145) |
| A-FILTER | 43 px 고정 (height=43) | 100% (left=20 / right=20) | 없음 | N (btn_fold 로 접기/펴기 토글) | div_search (xfdl:153) |
| A-FOLD | 12 px 고정 (height=12) | 100% (left=20 / right=20) | 없음 | N | btn_fold (xfdl:7) |
| A-MAIN | 가변 (top=btn_fold:20 / bottom=40) | 100% (left=20 / right=20) | (자식 그리드별 세로) | Y (xfdl 좌우 분할 비율 고정) | div_main (xfdl:8) |
| A-MAIN-LEFT (Master 영역) | A-MAIN 동일 (top=0 / bottom=0 within div_main) | right=440 (가변 너비) | 세로 (grd_main) | N (xfdl 고정) | div_mainGrd (xfdl:11) |
| A-MAIN-RIGHT (Detail 영역) | A-MAIN 동일 | width=430 (left=div_mainGrd:10 / 고정 너비 430) | 세로 (div_detail) | N (xfdl 고정) | div_mainDetail (xfdl:81) |
| A-FOOTER | 20 px 고정 (height=20) | 100% (left=20 / right=20) | 없음 | N | div_bottom (xfdl:6) |

### 3.1.1 ContentPanel 비율 + 컬럼 스태커 (W5 A — 2x2 collapse 회피, 2026-06-02 ~ 2026-06-04 정합)

> **목적**: csa 8 화면 W5 패턴 (commUserMng 제외) 전파의 일환. AsIs xfdl 의 좌우 분할 (`div_mainGrd right=440 / div_mainDetail width=430`) 을 ToBe Next.js 16 + React 19 + shared `ContentBody` / `ContentPanel` 로 1:1 변환하되, **2x2 자동 collapse (`MainRow → Detail | Sub1 → Sub2` 자동 grid)** 가 본 화면의 Master 단일 그리드 + 단일 Detail 폼 구조에 맞지 않아 발생하던 column 정렬 깨짐 문제를 정책으로 해소.

| 영역 | ToBe 컴포넌트 | 비율 / 너비 | 비고 |
|---|---|---|---|
| ContentBody root | `<ContentBody>` (shared/layout) | `flex:1 / display:flex / flexDirection:column / gap:0` | AsIs `div_main` 등가 (top=113, bottom=40) |
| Column stacker div | `<div>` 직속 children stacker | `display:flex / flexDirection:column / gap:16 / height:100%` | **신규 — 2x2 collapse 회피 핵심**. ContentBody → Row1 → Row2 명시적 수직 적층 |
| Row1 (메인 + Detail) | `<div>` 1 layer 직속 | `display:flex / gap:16 / flex:1 / minHeight:0` | 좌(Master Grid) + 우(Detail) — AsIs `div_main` 좌우 분할 1:1 |
| Row1-Left (Master Grid) | `<ContentPanel>` | `flex:1 / minWidth:0` | AsIs `div_mainGrd right=440` 등가 |
| Row1-Right (Detail) | `<ContentPanel>` | `width:430 / flexShrink:0` | AsIs `div_mainDetail width=430` 1:1 |
| Row2 (sub1 + sub2) | (해당 없음 — 본 화면 미사용) | - | 본 화면 = C 단일 그리드 + 단일 상세 폼 (sub 그리드 ✗). W5 정합 표준 구조만 보존 |

> **정책 (W5 A)**: ContentBody 직속에 column stacker div 1 개를 강제로 두어 `ContentBody → flex column → Row1 → Row2` 4 단 명시. shared 컴포넌트의 grid auto-place 가 본 화면에 적용되어 column-header 라인이 어긋나던 결함을 차단.

### 3.1.2 Detail wrapper 배경 체계 (W5 B — 28px gray header, 2026-06-02 정합)

> AsIs xfdl `edt_dtl_info "상세 정보"` (top=0, width=77, height=21, `edi_WF_Title1`) 라벨을 ToBe 에서는 **Detail wrapper 의 상단 28px gray header 영역**으로 일관 변환. Master Grid 의 column-header (40px head row) 라인과 Detail "상세 정보" header 라인이 시각적으로 정렬되도록 wrapper 의 `marginTop:32` 를 강제.

| wrapper 속성 | 값 | 사유 |
|---|---|---|
| `marginTop` | **32px** | Master Grid head 라인 (40px) 과 Detail header 라인 정렬 — Master Toolbar 25px 이후 head row 시작점과 Detail wrapper start 일치 |
| `height` | **auto** | Detail 폼 필드 수 (To-Be 15 필드) 에 따라 가변. AsIs `div_detail` 자식 절대좌표 합 (`top=4 ~ top=423`) 보존 |
| `border` | **1px solid #d4dae0** | shared 디자인 시스템 회색 톤 — wrapper 경계 명확화 |
| `background` | **#fff** | Master 영역 회색 (`#f5f6f8`) 과 대비 |
| header bar | **height:28 / background:#f1f3f5 / color:#3a4a5c / paddingLeft:12 / borderBottom:1px solid #d4dae0** | "상세 정보" 라벨을 wrapper 의 상단 28px gray strip 으로 변환 (AsIs `edt_dtl_info` 1:1 등가) |
| header text | `"상세 정보"` | AsIs xfdl `edt_dtl_info.value` 보존 |

### 3.1.3 Form row 정렬 정책 (W5 C — 다중 컴포넌트 + 우측 버튼, 2026-06-02 ~ 2026-06-03 정합)

> AsIs Detail 폼은 단일 컴포넌트 행 (배경 Static + 라벨 + 입력 1개) 위주. ToBe 정합 과정에서 D-NNN 일부 행이 **다중 컴포넌트 (입력 + 우측 트리거 버튼)** 으로 확장되는 케이스 발생 (예: cbo_folder + 라벨 옆 추가 트리거). 본 화면 자체는 다중 컴포넌트 행이 없으나 csa W5 정합 패턴으로 본문에 명시 (8 화면 통일).

| 항목 | 값 | 사유 |
|---|---|---|
| Form row container | `display:flex / gap:8 / justifyContent:space-between / alignItems:center` | 다중 컴포넌트 간 8px gap + 좌우 끝맞춤 |
| 우측 버튼 wrapper | `width:110 / flexShrink:0` | 버튼 영역 고정 너비 (입력 컴포넌트 flex 신축에 영향 ✗) |
| 우측 Button 자체 | `<Button style={{ width: "100%" }}>` | wrapper 110px 안에서 100% 채움 — 시각적 정렬 일관 |

> 본 화면은 W5 C 적용 행 0 (모두 단일 컴포넌트 행) — **표준 보존만 명시**.

### 3.2 A-FILTER 내부 배치 (좌표 As-Is 1:1 / **To-Be 정책 #1**: S-001 BIZ SYSTEM 콤보 폐기 + 라벨/입력 좌표 좌측 시프트)

```
top=10 ─────────────────────────────────────────────────────────────────────
│ [BIZ SYSTEM] [cbo_bizSystemCode] [OBJECT] [edt_OBJECT_ID]                 │
│  ↑              ↑                  ↑          ↑                            │
│  stc_           width=80          sts_         width=300                   │
│  bizSystem-     left=stc:10       objectId    left=cbo:40                  │
│  Code (90w)     displaynulltext   (100w)      maxlength=100                │
│                 ="전체"                                                    │
│                                                                            │
│ [사용 여부] [cbo_USE_TP]                                                    │
│  ↑           ↑                                                             │
│  sts_useTp  width=50, ds_useTp Y/N, index=0                                │
│  (100w)     left=sts:10                                                    │
top=30 ─────────────────────────────────────────────────────────────────────
```

| 컨트롤 | 정확한 xfdl 좌표 | cssclass | 비고 |
|---|---|---|---|
| ~~stc_bizSystemCode (S-001 라벨)~~ | ~~left=10 / top=10 / width=90 / height=21~~ | ~~edi_WFSA_Label~~ | ~~"BIZ SYSTEM" (Edit readonly)~~ — **To-Be 정책 #1 폐기** |
| ~~cbo_bizSystemCode (S-001 입력)~~ | ~~left=stc_bizSystemCode:10 / top=10 / width=80 / height=21~~ | ~~(없음)~~ | ~~innerdataset=ds_lovSubSystem, displaynulltext="전체", index=0, value="Y" (As-Is 보존)~~ — **To-Be 정책 #1 폐기** |
| sts_objectId (S-002 라벨) | As-Is: left=cbo_bizSystemCode:40 / top=10 / width=100 / height=21 / **To-Be 정책 #1**: left=10 (좌측 시프트) | edi_WFSA_Label | "OBJECT" |
| edt_OBJECT_ID (S-002 입력) | left=sts_objectId:10 / top=10 / width=300 / height=21 | (없음) | maxlength=100, text="부산역 CY" (디자인 더미) |
| sts_useTp (S-003 라벨) | left=edt_OBJECT_ID:40 / top=10 / width=100 / height=21 | edi_WFSA_Label | "사용 여부" |
| cbo_USE_TP (S-003 입력) | left=sts_useTp:10 / top=10 / width=50 / height=21 | (없음) | innerdataset=ds_useTp Y/N, index=0, value="Y" |

### 3.3 A-MAIN-LEFT 내부 배치 (Master 영역)

```
top=0 ──────────────────────────────────────────────────────────────────  right=0
│ Toolbar (top=0, height=21)                                              │
│  edt_srch_cseq "조회 결과" (77w, readonly)                              │
│  div_leftMenu  (213w, left=edt_srch_cseq:5)                             │
│   commonLeftButton: chk_check, btn_sum                                  │
│  div_rightMenu (310w, right=0)                                          │
│   commonRightButton: btn_rowAdd, btn_rowDelete, btn_rowCopy,            │
│                       btn_rowCancel                                      │
top=25 ──────────────────────────────────────────────────────────────────
│ grd_main (binddataset=ds_main, taborder=0)                              │
│  Format: head 1줄 (40px) + body 1줄 (24px) / Column 15개                 │
│  Columns: 30/120/110/103/60/60/60/120/42/180/167/99/97/93/80            │
│            (band="left" 첫 컬럼 STATUS 고정)                             │
│                                                                          │
│  Head row 0:  상태 │ OBJECT ID │ OBJECT NAME │ 프로그램 설명 │ SYSTEM │   │
│               BIZ\\r\\nSYSTEM │ OBJECT\\r\\nTYPE │ SERVICE │ 사용\\r\\n여부 │  │
│               FORM URL │ 외부 접속 주소 │ PARAM │ 유효개시일 │ 유효기한일 │ │
│               접속 경로                                                   │
│                                                                          │
│  Body row:    STATUS(아이콘) │ OBJECT_ID │ OBJECT_NM │ PROGRAM_DESC │    │
│               SYSTEM_CODE │ ~~BIZ_SYSTEM_CODE~~ (To-Be 정책 #1 폐기) │ OBJECT_TYPE │ SERVICE │
│               USE_TP(combo Y/N) │ FORM_URL │ OUT_ACCESS_IP │ PARAM │    │
│               START_ACTIVE_DATE(date) │ END_ACTIVE_DATE(date) │         │
│               ACCESS_TP(combo 1/2/3)                                     │
│                                                                          │
│  options: cellmovingtype=col / cellsizingtype=col / selecttype=cell      │
│           autofittype=none / cellsizingbandtype=allband /                │
│           autosizingtype=col / autosizebandtype=body                     │
│  events:  onheadclick → gfn_commonOnheadclick (정렬, xfdl:511)            │
│           (oncellclick 없음 — Detail 영역은 BindItem 자동 동기화)         │
bottom=0 ───────────────────────────────────────────────────────────────
```

| Toolbar 컨트롤 위치 | 컨트롤ID | 좌표 (As-Is) |
|---|---|---|
| left=0 / top=0 / width=77 | edt_srch_cseq (라벨) | "조회 결과" / cssclass=edi_WF_Title1 / readonly |
| left=edt_srch_cseq:5 / top=0 / width=213 / height=21 | div_leftMenu | url include `_com_div::commonLeftButton.xfdl` / common (chk_check, btn_sum) |
| right=0 / top=0 / width=310 / height=21 | div_rightMenu | url include `_com_div::commonRightButton.xfdl` / common (rowAdd, rowDelete, rowCopy, rowCancel) |

### 3.4 A-MAIN-RIGHT 내부 배치 (Detail 폼 — div_detail width=430)

> 본 §3.4 는 분석 §3.5 의 16 D-NNN 의 As-Is 절대 좌표를 1:1 보존. Form 구조는 좌측 (배경 + 라벨 readonly Edit, top=0~28 / left=0~180) + 우측 (입력 컨트롤, top=4~28 / left=184~420) 의 2 열 배치. 모든 행 height=29 (배경) / 21 (입력).

```
top=0 ────────────────────────────────────────────────────────────────  right=0
│ edt_dtl_info "상세 정보" (top=0, width=77, height=21, readonly,         │
│                           cssclass=edi_WF_Title1)                       │
top=25 ──────────────────────────────────────────────────────────────────
│ div_detail (right=0 / bottom=0 / width=430)                             │
│  ┌──────────────────────┬──────────────────────────────────────────┐    │
│  │ 배경 Static (180w)    │ 입력 컨트롤 (236w, left=184)              │    │
│  │ + 라벨 Edit readonly │                                          │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static1 (top=0)  │ edt_object_id (top=4, Essential, readonly)│    │
│  │ + edt_st_object_id   │   "OBJECT ID*"                            │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static4 (top=28) │ edt_system_code (top=32)                  │    │
│  │ + edt_st_system_code │   "SYSTEM"                                │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static5 (top=56) │ cbo_bizSystemCode (top=60, Essential)     │    │
│  │ + edt_st_BIZ_SYSTEM_ │   "BIZ SYSTEM*"                           │    │
│  │   CODE               │                                          │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static8_00       │ cbo_folder (top=88)                       │    │
│  │  (top=84)            │   "MENU ID"                              │    │
│  │ + edt_st_bizSystemC. │                                          │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static2_00       │ edt_id (top=116, Essential)               │    │
│  │  (top=112) + edt_st_ │   "ID*"                                  │    │
│  │   id                 │                                          │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static2 (top=140)│ edt_object_nm (top=144)                   │    │
│  │ + edt_st_object_nm   │   "OBJECT명"                              │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static3 (top=168)│ edt_program_desc (top=172)                │    │
│  │ + edt_st_program_d.  │   "프로그램 설명"                          │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static6 (top=196)│ edt_object_type (top=200)                 │    │
│  │ + edt_st_object_type │   "OBJECT TYPE"                          │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static7 (top=224)│ edt_service (top=228)                     │    │
│  │ + edt_st_service     │   "SERVICE"                              │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static8 (top=252)│ edt_access_tp (top=256, Essential, Combo) │    │
│  │ + edt_st_access_tp   │   "접속 경로*"                            │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static81         │ edt_form_url (top=284)                    │    │
│  │  (top=280) +         │   "FORM URL"                              │    │
│  │ edt_st_form_url      │                                          │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static7_00       │ edt_out_access_ip (top=312, enable=false) │    │
│  │  (top=308) +         │   "외부  접속 주소" (더블 스페이스 As-Is) │    │
│  │ edt_st_out_access_ip │                                          │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static9 (top=336)│ edt_use_tp (top=340, Radio Y/N vertical)  │    │
│  │ + edt_st_use_tp      │   "사용 여부"                             │    │
│  │  (edi_WF_LabelFirstE)│                                          │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static10         │ edt_param (top=368)                       │    │
│  │  (top=364) +         │   "파라메터"                              │    │
│  │ edt_st_param         │                                          │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static11         │ cal_start_active_date (top=395, Calendar) │    │
│  │  (top=390) +         │   "유효 개시일"                            │    │
│  │ ed_st_start_active_d.│   (As-Is 라벨 id `ed_st_*` 오타 보존)     │    │
│  ├──────────────────────┼──────────────────────────────────────────┤    │
│  │ stc_Static12         │ cal_end_active_date (top=423, Calendar)   │    │
│  │  (top=418) +         │   "유효 기한일"                            │    │
│  │ edt_st_end_active_d. │                                          │    │
│  └──────────────────────┴──────────────────────────────────────────┘    │
bottom=0 ───────────────────────────────────────────────────────────────
```

| D-NNN | 배경 Static 좌표 / id (xfdl:line) | 라벨 Edit readonly 좌표 / id (cssclass) (xfdl:line) | 입력 컨트롤 좌표 / id / width (xfdl:line) |
|---|---|---|---|
| D-001 OBJECT ID | top=0 / height=29 / id=stc_Static1 (cssclass=stc_WF_BoxFirst) (xfdl:91) | left=1 / top=0 / width=180 / height=29 / id=edt_st_object_id (edi_WF_LabelFirstE) "OBJECT ID" (xfdl:119) | left=184 / top=4 / width=236 / height=21 / id=edt_object_id (Essential, readonly, maxlength=90) (xfdl:104) |
| D-002 SYSTEM | top=28 / id=stc_Static4 (stc_WF_Box) (xfdl:88) | top=28 / id=edt_st_system_code (edi_WF_Label) "SYSTEM" (xfdl:97) | top=32 / id=edt_system_code (maxlength=50, inputtype=normal) (xfdl:108) |
| ~~D-003 BIZ SYSTEM~~ (To-Be 정책 #1 폐기) | ~~top=56 / id=stc_Static5 (stc_WF_Box) (xfdl:120)~~ | ~~top=56 / id=edt_st_BIZ_SYSTEM_CODE (edi_WF_LabelE) "BIZ SYSTEM" (xfdl:121)~~ | ~~top=60 / id=cbo_bizSystemCode (Combo, Essential, ds_lovSubSystem) (xfdl:125)~~ — **To-Be 폐기** (배경 Static + 라벨 + 입력 컨트롤 모두 제거 + 후속 D-NNN 행 top 좌표 28px 위로 시프트) |
| D-004 MENU ID | top=84 / id=stc_Static8_00 (stc_WF_Box) (xfdl:122) | top=84 / id=edt_st_bizSystemCode (edi_WF_Label) "MENU ID" — 라벨 id 가 bizSystemCode 인데 실 라벨은 MENU ID (As-Is 보존) (xfdl:123) | top=88 / id=cbo_folder (Combo, ds_lovMenuId) (xfdl:124) |
| D-005 ID | top=112 / id=stc_Static2_00 (stc_WF_Box) (xfdl:132) | top=112 / id=edt_st_id (edi_WF_Label) "ID" (xfdl:133) | top=116 / id=edt_id (TextBox, Essential, maxlength=100) (xfdl:134) |
| D-006 OBJECT명 | top=140 / id=stc_Static2 (stc_WF_Box) (xfdl:126) | top=140 / id=edt_st_object_nm (edi_WF_Label) "OBJECT명" (xfdl:128) | top=144 / id=edt_object_nm (maxlength=100) (xfdl:130) |
| D-007 프로그램 설명 | top=168 / id=stc_Static3 (stc_WF_Box) (xfdl:127) | top=168 / id=edt_st_program_desc (edi_WF_Label) "프로그램 설명" (xfdl:129) | top=172 / id=edt_program_desc (maxlength=100) (xfdl:131) |
| D-008 OBJECT TYPE | top=196 / id=stc_Static6 (stc_WF_Box) (xfdl:92) | top=196 / id=edt_st_object_type (edi_WF_Label) "OBJECT TYPE" (xfdl:96) | top=200 / id=edt_object_type (maxlength=90) (xfdl:105) |
| D-009 SERVICE | top=224 / id=stc_Static7 (stc_WF_Box) (xfdl:99) | top=224 / id=edt_st_service (edi_WF_Label) "SERVICE" (xfdl:100) | top=228 / id=edt_service (maxlength=90) (xfdl:107) |
| D-010 접속 경로 | top=252 / id=stc_Static8 (stc_WF_Box) (xfdl:93) | top=252 / id=edt_st_access_tp (edi_WF_LabelE) "접속 경로" (xfdl:101) | top=256 / id=edt_access_tp (Combo, Essential, ds_access_tp) (xfdl:115) |
| D-011 FORM URL | top=280 / id=stc_Static81 (stc_WF_Box) (xfdl:112) | top=280 / id=edt_st_form_url (edi_WF_Label) "FORM URL" (xfdl:113) | top=284 / id=edt_form_url (maxlength=100) (xfdl:114) |
| D-012 외부 접속 주소 | top=308 / id=stc_Static7_00 (stc_WF_Box) (xfdl:116) | top=308 / id=edt_st_out_access_ip (edi_WF_Label) "외부  접속 주소" (라벨 더블 스페이스 As-Is) (xfdl:117) | top=312 / id=edt_out_access_ip (maxlength=90, enable=false) (xfdl:118) |
| D-013 사용 여부 | top=336 / id=stc_Static9 (stc_WF_Box) (xfdl:87) | top=336 / id=edt_st_use_tp (edi_WF_LabelFirstE) "사용 여부" (xfdl:98) | top=340 / id=edt_use_tp (Radio Y/N vertical, ds_useTp, width=128) (xfdl:109) |
| D-014 파라메터 | top=364 / id=stc_Static10 (stc_WF_Box) (xfdl:90) | top=364 / id=edt_st_param (edi_WF_Label) "파라메터" (xfdl:95) | top=368 / id=edt_param (maxlength=100) (xfdl:110) |
| D-015 유효 개시일 | top=390 / id=stc_Static11 (stc_WF_Box) (xfdl:89) | top=392 / id=ed_st_start_active_date (edi_WF_Label) "유효 개시일" — 라벨 id 오타 `ed_` not `edt_` (As-Is 보존) (xfdl:94) | top=395 / id=cal_start_active_date (Calendar, yyyy-MM-dd) (xfdl:111) |
| D-016 유효 기한일 | top=418 / id=stc_Static12 (stc_WF_Box) (xfdl:102) | top=418 / id=edt_st_end_active_date (edi_WF_Label) "유효 기한일" (xfdl:103) | top=423 / id=cal_end_active_date (Calendar) (xfdl:106) |

---

## 4. 그리드 (G-NNN — 기능설계서 §3.2 인용)

### 4.1 G-NNN 메인 그리드 (`grd_main`)

| 컬럼 | size (xfdl) | cell type (head / body) | format | 정렬 | 편집 | 필수 |
|---|---:|---|---|---|---|---|
| G-001 상태 | 30 (band="left") | head:text="상태" / body:bind:STATUS displaytype=imagecontrol | imagecontrol (Nexacro auto row state) | Center | N | - |
| G-002 OBJECT ID | 120 | head:text="OBJECT ID" / body:bind:OBJECT_ID textAlign=left autosizecol=limitmin | varchar | Left | Y | Y (저장 필수) |
| G-003 OBJECT NAME | 110 | head:text="OBJECT NAME" / body:bind:OBJECT_NM textAlign=left | varchar | Left | Y | - |
| G-004 프로그램 설명 | 103 | head:text="프로그램 설명" / body:bind:PROGRAM_DESC textAlign=left controlautosizingtype=width | varchar | Left | Y | - |
| G-005 SYSTEM | 60 | head:text="SYSTEM" / body:bind:SYSTEM_CODE | varchar | Center | Y | - |
| ~~G-006 BIZ\\r\\nSYSTEM~~ (To-Be 정책 #1 폐기) | 60 | ~~head:text="BIZ\\r\\nSYSTEM" / body:bind:BIZ_SYSTEM_CODE~~ | varchar | Center | Y | ~~Y (저장 필수)~~ — **To-Be 폐기** |
| G-007 OBJECT\\r\\nTYPE | 60 | head:text="OBJECT\\r\\nTYPE" / body:bind:OBJECT_TYPE | varchar | Center | Y | - |
| G-008 SERVICE | 120 | head:text="SERVICE" / body:bind:SERVICE textAlign=left | varchar | Left | Y | - |
| G-009 사용\\r\\n여부 | 42 | head:text="사용\\r\\n여부" / body:bind:USE_TP displaytype=combotext combodataset=ds_useTp combocodecol=CD combodatacol=NM | combo (LV-003 Y/N) | Center | Y (combo) | Y (저장 필수) |
| G-010 FORM URL | 180 | head:text="FORM URL" / body:bind:FORM_URL textAlign=left | varchar | Left | Y | - |
| G-011 외부 접속 주소 | 167 | head:text="외부 접속 주소" / body:bind:OUT_ACCESS_IP textAlign=left | varchar | Left | Y | - |
| G-012 PARAM | 99 | head:text="PARAM" / body:bind:PARAM textAlign=left | varchar | Left | Y | - |
| G-013 유효개시일 | 97 | head:text="유효개시일" / body:bind:START_ACTIVE_DATE displaytype=date calendardateformat=yyyy-MM-dd | date | Center | Y (date) | - |
| G-014 유효기한일 | 93 | head:text="유효기한일" / body:bind:END_ACTIVE_DATE displaytype=date calendardateformat=yyyy-MM-dd | date | Center | Y (date) | - |
| G-015 접속 경로 | 80 | head:text="접속 경로" / body:bind:ACCESS_TP displaytype=combotext combodataset=ds_access_tp combocodecol=condCd combodatacol=condNm | combo (LV-004 1/2/3) | Center | Y (combo) | Y (저장 필수) |

> 그리드 Header Row 1 + Body Row 1 (`band="head"` / body). 첫 컬럼 `band="left"` 고정 (xfdl:19 — STATUS 컬럼). `cellmovingtype="col"` / `cellsizingtype="col"` / `selecttype="cell"` / `autofittype="none"` / `cellsizingbandtype="allband"` / `autosizingtype="col"` / `autosizebandtype="body"`. **To-Be 정책 #1**: G-006 BIZ_SYSTEM_CODE 폐기 → 컬럼 15→14 / size 합계 60px 감.

### 4.1.1 ToBe Grid 편집 정책 (W5 D — editable:false 전체, 2026-06-03 정합)

> AsIs xfdl `grd_main` 의 컬럼별 `edittype` (text/combo/date 혼재) 으로 인한 cell 직접 편집은 **ToBe 폐기**. ToBe 는 Master Grid = 읽기 전용 + Detail 폼 = 편집 전담 패턴으로 통일 (csa W5 정합).

| 컬럼 분류 | ToBe 표시 정책 | 사유 |
|---|---|---|
| 모든 컬럼 (G-001 ~ G-014) | `editable: false` 전체 강제 | Master Grid 셀 클릭 시 Detail 폼 자동 동기화 (UX-001 BindItem 등가) — 셀 직접 편집 불필요 |
| 날짜 (G-013 START_ACTIVE_DATE / G-014 END_ACTIVE_DATE) | `toDateInputValue(value)` 헬퍼로 **yyyy-MM-dd** 포맷 | AsIs xfdl `calendardateformat="yyyy-MM-dd"` 1:1. LocalDateTime → ISO 문자열 → 앞 10자 slice |
| 사용 여부 (G-009 USE_TP) | `LABEL_MAP_USE_TP = { Y: "사용", N: "미사용" }` 적용 | AsIs combodataset=ds_useTp Y/N → ToBe LABEL_MAP 으로 사용자 가독 표시 |
| 접속 경로 (G-014 ACCESS_TP) | **AsIs LABEL_MAP 폐기 — value=label 동일** (정책 #ACC2 후속) | Round 4 ACCESS_TP 2 옵션 (`내부` / `외부`) 결정 — value 자체가 한글 label 이라 LABEL_MAP 불필요 |

### 4.1.2 ACCESS_TP 2 옵션 정책 (Round 4, 2026-06-03 정합 — As-Is 3 enum → To-Be 2 enum)

> **결정 (Round 4, 2026-06-03)**: As-Is xfdl `ds_access_tp` 3 enum (`1 내부 neXacro` / `2 외부 neXacro` / `3 외부 url`) 을 To-Be 2 enum (`내부` / `외부`) 로 축소. 사유: neXacro 종속 enum (`1`, `2`) 은 ToBe Next.js 환경에서 의미 없음. `외부 url` 만 외부 호출이고 나머지 둘은 내부 → 의미 단위로 통합.

| As-Is enum (xfdl `ds_access_tp`) | To-Be enum | 변환 정책 |
|---|---|---|
| `1` (내부 neXacro) | `내부` | 의미 통합 — 내부 라우팅 |
| `2` (외부 neXacro) | `내부` | 의미 통합 — 내부 라우팅 |
| `3` (외부 url) | `외부` | OUT_ACCESS_IP 입력 활성 |

| 항목 | 값 | 사유 |
|---|---|---|
| `LABEL_MAP_ACCESS_TP` | **폐기** | value=label 이라 변환 불필요 |
| Combo `options` | `[{value:"내부", label:"내부"}, {value:"외부", label:"외부"}]` | value 자체가 한글 |
| 컬럼 너비 (DDL) | VARCHAR(1) → **VARCHAR(10)** ALTER | "내부"/"외부" 한글 3 byte (UTF-8) 수용 |
| DataInitializer 이행 | 기존 row 멱등 UPDATE — `1` / `2` → `내부` / `3` → `외부` | 기존 데이터 손실 방지 + idempotent |
| OUT_ACCESS_IP enable 분기 | ACCESS_TP=`외부` 일 때 활성 / `내부` 일 때 비활성 | UX-004 V-401 ~ V-403 정책 As-Is 유지 (분기 키만 변경) |

### 4.1.3 FORM_URL ToBe 라우팅 정책 (Round 4, 2026-06-03 정합 — `{group}/{OBJECT_ID}` 패턴)

> **결정 (Round 4, 2026-06-03)**: As-Is FORM_URL 자동 세트 (`${OBJECT_ID}.xfdl`) 는 ToBe 폐기. ToBe Next.js 동적 라우팅 패턴 `{group}/{OBJECT_ID}` 적용 (예: `csa/commObjMng`). `group` 은 SEC_MENU 의 `PARENT_MENU_ID` 에서 조회.

| 항목 | 값 | 사유 |
|---|---|---|
| As-Is FORM_URL 패턴 | `${OBJECT_ID}.xfdl` (xfdl:526) | neXacro 파일명 |
| To-Be FORM_URL 패턴 | `{group}/{OBJECT_ID}` (예: `csa/commObjMng`) | Next.js dynamic route 등가 |
| `{group}` 결정 키 | SEC_MENU.PARENT_MENU_ID | xfdl `cbo_folder` (MENU ID) 선택 시 부모 메뉴 ID 조회 |
| BE 신규 메서드 | `findOneParentMenuIdByObjectId(objectId)` (Repository / Mapper) | SEC_MENU + SEC_MENU_FLD JOIN — 본 화면 OBJECT_ID 로 부모 메뉴 ID 1행 반환 |
| 응답 row 추가 컬럼 | `PARENT_MENU_ID` (List/Detail 응답 DTO 에 신규) | FE 가 FORM_URL 생성 시 group 토큰으로 사용 |
| DataInitializer 이행 | 기존 row 의 FORM_URL 멱등 UPDATE — SEC_MENU JOIN 으로 PARENT_MENU_ID 추출 + `{parent}/{OBJECT_ID}` 재구성 | idempotent + 기존 데이터 손실 방지 |
| UX-004 V-401 ~ V-403 갱신 | ACCESS_TP=`내부` 시 FORM_URL 자동 세트 = `{PARENT_MENU_ID}/{OBJECT_ID}` (As-Is `{OBJECT_ID}.xfdl` 대체) | 분기 자체는 보존, 값 패턴만 ToBe |

### 4.1.4 OBJECT_ID readOnly 정책 (Round 5, 2026-06-04 정합 — 신규 행만 편집 가능)

> **결정 (Round 5, 2026-06-04)**: Detail 폼 D-001 OBJECT ID Input 의 readOnly 정책을 **행 상태별 분기** 로 강제. 기존 행 (`updated` / `selected`) 의 OBJECT_ID 는 절대 수정 불가 (PK 변경 차단). 신규 행 (`inserted`) 만 사용자 편집 가능.

| 행 상태 (`selected.nativeeditor_status`) | OBJECT_ID Input readOnly | 사유 |
|---|---|---|
| `"inserted"` (신규 행추가) | **false** (편집 가능) | 사용자가 새 OBJECT_ID 입력. 단, V-502 MENU_ID + ID 자동 합성 분기도 동시 활성 (cbo_folder + edt_id 변경 시 자동 세트) |
| `"updated"` (기존 행 변경) | **true** (readOnly) | PK 변경 차단 |
| 행 미선택 / null | **true** (readOnly) | 비활성 |

> **V-502 보존**: cbo_folder (MENU ID) + edt_id 변경 시 `{MENU_ID 앞 3자}::{ID}` 로 OBJECT_ID 자동 합성하는 분기는 신규 행 (`inserted`) 에서만 유효. As-Is 보존 + readOnly 정책과 양립.

### 4.2 그리드 추가 동작 (UX)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| UX-001 | Master 행 클릭 시 → BindItem 으로 Detail 영역 자동 동기화 (`ds_main.rowposition` 변경 → 16 BindItem 갱신) | grd_main 행 선택 (Nexacro 표준) | 기능 §4.1 + 분석 §3.9 |
| UX-002 | row 가 RowType=1 (삭제) 일 때 edt_id / cbo_folder 비활성 | ds_main_onrowposchanged (xfdl:491) | 기능 §6.7 V-601 |
| UX-003 | row 가 RowType != 1 일 때 edt_id / cbo_folder 활성 | 동일 | 기능 §6.7 V-602 |
| UX-004 | D-010 (접속 경로) 변경 시 FORM_URL / OUT_ACCESS_IP enable 분기 + value 자동 세트 (ACCESS_TP=1 면 `{OBJECT_ID}.xfdl`) | edt_access_tp onitemchanged (xfdl:521) | 기능 §6.5 V-401~403 |
| UX-005 | D-004 (MENU ID Combo) 변경 시 OBJECT_ID 자동 조합 (`{MENU_ID 전체}::{ID}`) | cbo_folder onitemchanged (xfdl:551) | 기능 §6.6 V-501 |
| UX-006 | D-005 (ID TextBox) 변경 시 OBJECT_ID 자동 조합 (`{MENU_ID 앞 3자}::{ID}`) — V-501 과 mismatch (As-Is 보존) | edt_id onchanged (xfdl:560) | 기능 §6.6 V-502 |
| UX-007 | 행추가 시 5 default 자동 세트 + Detail 영역 활성 + edt_id 포커스 | btn_rowAdd → fn_rowAdd (xfdl:414) | 기능 §6.4 V-301~302 |
| UX-008 | 행삭제 시 MENU_ID 존재 시 차단 모달 / null 시 정상 삭제 + 행 0 시 Detail 영역 비활성 | btn_rowDelete → fn_rowDelete (xfdl:443) | 기능 §6.2 V-101~103 |
| UX-009 | 행복사 시 rowposition < 0 차단 / 정상 시 OBJECT_ID="" clear + Detail 영역 활성 | btn_rowCopy → fn_rowCopy (xfdl:431) | 기능 §6.3 V-201~202 |
| UX-010 | 행취소 시 grd_main 초기화 (`gfn_grdInit`) | btn_rowCancel → fn_rowCancel (xfdl:460) | 기능 §5.1 B-008 |
| UX-011 | Form onload 시 fn_lov 자동 호출 — As-Is: ds_lovSubSystem + ds_lovMenuId 사전 로드 / **To-Be 정책 #1**: ds_lovMenuId 1 dataset 만 사전 로드 (ds_lovSubSystem 폐기) | Form onload (xfdl:261) | 분석 §4.4 #1, #3 |
| UX-012 | onload 시 Detail 영역 비활성 (행 미선택 상태) | fn_onload (xfdl:266) | 분석 §4.4 #1 |

---

## 5. 버튼 (toolbar / 그리드 셀) — 기능 §5.1 인용

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### 5.1 공통 topMenu (`div_title.div_topMenu` — 외부 등록 3 버튼 / Round 7 btn_close 제거)

| 버튼ID | text | 등록 위치 | 동작 |
|---|---|---|---|
| B-001 | 조회 (btn_search) | commonTopButton의 fn_commonTop_onload (xfdl:277~281) | `fn_search` → `fn_run("searchCmObj")` |
| B-002 | 초기화 (btn_reset) | (동일) | `fn_reset` → `gfn_setDivDefault(div_search)` + cbo_USE_TP.set_index(1) |
| B-003 | 저장 (btn_save) | (동일) | `fn_save` → 3 validation → `fn_run("saveCmObj")` |
| ~~B-004~~ | ~~닫기 (btn_close)~~ | ~~(동일)~~ | **Round 7 (2026-06-04~05) 제거** — AsIs xfdl commonTop basic 4 의 마지막 btn_close 를 ToBe 에서 완전 폐기. PageLayout buttons 배열에서 entry 삭제 + unused handleClose dead code 제거. 사유: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼 의미 ✗ |

### 5.2 공통 rightMenu (`div_mainGrd.div_rightMenu` — 외부 등록 4 버튼)

| 버튼ID | text | 등록 위치 | 동작 |
|---|---|---|---|
| B-005 | 행추가 (btn_rowAdd) | commonRightButton 의 fn_commonRight_onload (xfdl:289~293) | `fn_rowAdd` → addRow + 5 default + Detail 활성 |
| B-006 | 행삭제 (btn_rowDelete) | (동일) | `fn_rowDelete` → MENU_ID 검증 + deleteRow + Detail 비활성 |
| B-007 | 행복사 (btn_rowCopy) | (동일) | `fn_rowCopy` → rowposition 검증 + copyData + OBJECT_ID="" + Detail 활성 |
| B-008 | 행취소 (btn_rowCancel) | (동일) | `fn_rowCancel` → grdInit |

### 5.3 공통 leftMenu (`div_mainGrd.div_leftMenu` — 외부 등록 2 컴포넌트)

| 버튼ID | text | 등록 위치 | 동작 |
|---|---|---|---|
| B-010 | (가변) chk_check / btn_sum | commonLeftButton 의 fn_commonLeft_onload (xfdl:283~287) | (외부 공통 — 그리드 체크 / 합계 등) |

### 5.4 외부 버튼 / 접기

| 버튼ID | text | cssclass | width / 위치 | 동작 |
|---|---|---|---|---|
| B-009 | (없음 — 아이콘) | btn_WFSA_Fold | top=93 / height=12 / left=20 / right=20 | div_search 접기/펴기 (`btn_fold_onclick` → `gfn_fold`, xfdl:516) |

### 5.5 그리드 셀 인라인 버튼 (GB-NNN)

해당 없음 — 본 화면 그리드 셀에 ButtonField / displaytype="button" ✗.

### 5.6 ToBe 버튼 활성화 정책 (W5 E — row-state pre-disable 제거, 2026-06-03 정합)

> **결정 (2026-06-03)**: csa W5 정합 표준 — AsIs commonTopButton 의 row-state 사전 비활성 (예: 행 미선택 시 btn_save / btn_rowDelete 자동 disable) 을 **ToBe 폐기**. 대신 `isSearching || isSaving` 진행 중 plane 만 `disabled` 강제. row-state 검증은 핸들러 진입 시점 V-NNN ErrorModal 로 처리.

| 버튼 ID | AsIs 사전 disable 조건 (제거) | ToBe disabled 조건 | 핸들러 진입 검증 |
|---|---|---|---|
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| B-001 btn_search | (없음) | `isSearching \|\| isSaving` | - |
| B-002 btn_reset | (없음) | `isSearching \|\| isSaving` | - |
| B-003 btn_save | AsIs: 행 미선택 / dirty 행 0 시 사전 disable | `isSearching \|\| isSaving` (row-state ✗) | 핸들러 진입 시 V-101 (저장할 행 없음) ErrorModal |
| ~~B-004 btn_close~~ | ~~(없음)~~ | ~~`isSearching \|\| isSaving`~~ | **Round 7 (2026-06-04~05) 제거** — PageLayout buttons 에서 entry 삭제 |
| B-005 btn_rowAdd | (없음) | `isSearching \|\| isSaving` | - |
| B-006 btn_rowDelete | AsIs: 행 미선택 시 사전 disable | `isSearching \|\| isSaving` (row-state ✗) | 핸들러 진입 시 V-201 (삭제할 행 없음) ErrorModal |
| B-007 btn_rowCopy | AsIs: rowposition<0 시 사전 disable | `isSearching \|\| isSaving` (row-state ✗) | 핸들러 진입 시 V-301 (복사할 행 없음) ErrorModal |
| B-008 btn_rowCancel | (없음) | `isSearching \|\| isSaving` | - |

> **Round 7 (2026-06-04~05) btn_close 제거 (B-004)**: 이전 W5 E 정합 시 commonTopButton 4 버튼 보존을 명시했으나, 사용자 결정으로 본 화면에서 btn_close 완전 폐기. PageLayout buttons 배열 entry 삭제 + 미사용 `handleClose` dead code 제거. 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) → ToBe 3 버튼 표준 (조회/초기화/저장). 사유: portal 탭 close 는 host (PortalShell) 가 처리하므로 화면 내부 닫기 버튼은 의미 ✗. AsIs xfdl commonTop basic 4 의 마지막 btn_close 는 To-Be 폐기로 결정.

> **V-NNN ErrorModal 정책**: row-state 위반 시 `shared/ErrorModal` 로 사용자 피드백 — V-101 ("저장할 행이 없습니다") / V-201 ("삭제할 행이 없습니다") / V-301 ("복사할 행이 없습니다") / V-502 (OBJECT_ID 합성 실패).

### 5.7 자동조회 정책 (W5 F — csa 자동조회 표준, 2026-06-02 정합)

> **결정 (2026-06-02)**: csa 8 화면 진입 시 `useEffect → loadList(DEFAULT_FILTERS)` 자동 호출 강제 (commUserMng 제외 + cme 가동은 V-702 예외). AsIs xfdl `gfn_formOnLoad(obj, true)` 등가. 본 화면 commObjMng 도 csa 자동조회 정책 적용.

| 항목 | 값 | 사유 |
|---|---|---|
| 자동조회 트리거 | `useEffect(() => { void loadList(DEFAULT_FILTERS) }, [])` | 페이지 진입 시 1회만 실행 |
| DEFAULT_FILTERS | `{ OBJECT_ID: "", USE_TP: "Y" }` | AsIs xfdl `cbo_USE_TP.value="Y"` (index=0) 보존 / S-001 BIZ_SYSTEM_CODE 정책 #1 폐기로 미포함 |
| 검색 결과 표시 | M-007 ("{N}건 조회 되었습니다.") `StatusBar` 등가 | AsIs `fn_commonBottomStatus_msg` 1:1 |

### 5.8 BE 시간 표준 정책 (W5 G — END_OF_TIME + parseLocalDateTime, 2026-06-03 정합)

> **결정 (2026-06-03)**: csa W5 정합 표준 — BE 의 시간 처리를 통일. 유효기간의 무한 미래 표기 + 문자열 → LocalDateTime 변환 정책을 본 화면 동일 적용.

| 항목 | 값 | 사유 |
|---|---|---|
| 무한 미래 상수 | `END_OF_TIME = LocalDateTime.of(9999, 12, 31, 0, 0, 0)` | AsIs xfdl `END_ACTIVE_DATE="99991231"` 등가 — LocalDateTime 도메인에서 동일 의미 |
| `parseLocalDateTime(dateStr)` 정책 | `yyyy-MM-dd` 입력 → `${dateStr}T00:00:00` 으로 ISO LocalDateTime 변환 | FE 가 보내는 yyyy-MM-dd 단순 날짜 문자열을 BE 의 LocalDateTime 필드 (START_ACTIVE_DATE / END_ACTIVE_DATE) 에 일관 매핑 |
| 영향 컬럼 | START_ACTIVE_DATE / END_ACTIVE_DATE | AsIs xfdl `cal_start_active_date` / `cal_end_active_date` 1:1 |
| FE 표시 정책 | grid + Detail 모두 `toDateInputValue(value)` 으로 yyyy-MM-dd 슬라이스 | W5 D 그리드 표시 정책과 일관 |

---

## 6. 팝업 (P-NNN — 기능 §9 인용)

해당 없음 — 본 화면은 팝업 호출 ✗.

> 주석된 `this.fn_detailPopup()` 호출 (xfdl:507) 은 미구현 + 주석 처리 (As-Is 비활성).

---

## 7. 메시지 표기 (기능 §10 인용)

### 7.1 표기 위치별

| 위치 | 메시지 종류 | 컴포넌트 |
|---|---|---|
| 모달 알림 (warning) | M-002 / M-004 / M-005 (validation / 차단) | `gfn_message("", "", text, "warning", "", "")` (xfdl 표준 — To-Be `MessageModal` 등가) |
| 모달 알림 (confirm) | M-001 / M-003 | `gfn_message("", "", text, "confirm", "확인", callback)` |
| 모달 알림 (info) | M-006 ("성공적으로 저장되었습니다.") | `gfn_message("", "", text, "info", "확인", fn_msgSuccessSave)` |
| 하단 status bar | M-007 ("{N}건 조회 되었습니다.") | `div_bottom.fn_commonBottomStatus_msg(text)` (commonBottomStatus include — To-Be `StatusBar` 등가) |
| 서버 에러 응답 | M-008 (CommonMultiSaveTask 의 server 에러) | OASIS framework 표준 → callback else 분기 → `gfn_commonBottomStatus_msg(strErrorMsg)` |

### 7.2 색상 / 강조

| 컴포넌트 | cssclass | 색상 의미 |
|---|---|---|
| 그리드 선택 행 | (`gfn_gridSelectedRow(grd_main, "red", "blue", "")`, xfdl:268) | 빨강 (배경) / 파랑 (테두리) — 선택 행 강조 |
| Master 필수 입력 컴포넌트 | As-Is: Essential (D-001 / D-003 / D-005 / D-010 — cssclass="Essential") / **To-Be 정책 #1**: D-001 / D-005 / D-010 (D-003 폐기 — 4→3) | (xfdl 기본 cssclass — 필수 표시) |
| div_search 영역 | div_WFSA_Box | 조회조건 영역 박스 |
| div_bottom 영역 | div_WF_Footer | 하단 status 푸터 |
| Detail 배경 첫 행 | stc_WF_BoxFirst (stc_Static1) | 상세 폼 첫 행 박스 (테두리 강조) |
| Detail 배경 그 외 | stc_WF_Box (stc_Static4 등 15 개) | 상세 폼 그 외 행 박스 |
| Detail 라벨 첫 행 | edi_WF_LabelFirstE (edt_st_object_id / edt_st_use_tp) | 라벨 첫 행 (Essential 강조) |
| Detail 라벨 Essential | As-Is: edi_WF_LabelE (edt_st_BIZ_SYSTEM_CODE / edt_st_access_tp) / **To-Be 정책 #1**: edi_WF_LabelE (edt_st_access_tp 만) — edt_st_BIZ_SYSTEM_CODE 폐기 | 라벨 Essential |
| Detail 라벨 일반 | edi_WF_Label (그 외 12 개 라벨) | 라벨 일반 |

---

## 8. Phase 3 자체 검증 (§6.14 4질문)

| 질문 | 답 |
|---|---|
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 1. 14항 위반? | **No** — 분석 §3 + 기능 §3/§4/§5 직접 인용 + xfdl 좌표 1:1 보존. 16 D-NNN 좌표/cssclass 전수 등재. W5 정합 (A~G) + Round 4 (ACCESS_TP 2 enum / FORM_URL `{group}/{OBJECT_ID}`) + Round 5 (OBJECT_ID readOnly) + Round 7 (btn_close 제거) 정책 모두 §3.1.1 ~ §3.1.3 / §4.1.1 ~ §4.1.4 / §5.1 / §5.6 ~ §5.8 등재. |
| 2. 검증 안 한 부분? | **No** — 미존재 컴포넌트 추가 0. G 15 / D 16 / B 10 → B-004 Round 7 폐기 후 활성 9 (commonTop 3 + commonRight 4 + commonLeft 1 + fold 1) / UX 12 / 배경 Static 16 / 라벨 Edit 16 모두 cite. |
| 3. 그대로 수용? | **No** — As-Is 결함 (라벨 더블 스페이스 / ed_ 오타 / 라벨 id mismatch / D-004 핸들러 이름 mismatch) 모두 As-Is 보존 + 분석 §12 인용. ACCESS_TP 3→2 enum 축소 + FORM_URL ToBe 라우팅 재구성 + OBJECT_ID readOnly 정책은 ToBe 결정 사항으로 §4.1.2 / §4.1.3 / §4.1.4 본문 별도 명시. |
| 4. 임의 합리화? | **No** — 디자인 더미 (text="부산역 CY") 등도 As-Is 보존 명시. W5 정합 표준 (A~G) 은 csa 8 화면 사용자 결정에 의한 정책 반영으로 본문 명시. |

> Phase 3 모두 No → Phase 4 진입.

---

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
## J. 사용자 검수 이력 (라운드 카탈로그)

> 본 §J 는 5 종 설계 산출물 1차 완성 (2026-05-31) 이후 사용자 검수 라운드별 결정 사항을 카탈로그화한다. 각 라운드 행은 본 화면에 해당하는 결정만 등재 (해당 사항이 없는 라운드는 "N/A"). 정합체크서 §J 와 1:1 동기화.

| Round | 일자 | 변경 | 영향 §/D-NNN/G-NNN/B-NNN |
|---|---|---|---|
| Round 1~3 | 2026-05-29 ~ 2026-05-31 | 6 정책 결정 일괄 반영 (#1 APP_HOST/BIZ_SYSTEM_CODE 폐기 + cma 정본 패턴 + schema=MCMAPUSER + 테이블명 As-Is 대문자 + Entity `mcm.entity.*` + Service/DTO `mcm.csa.commObjMng.{service|dto}` + JPA only + McmAuditEntity 상속 / #6 (A) Entity 명명 As-Is 직역) | §3.2 S-001 폐기 / §3.4 D-003 폐기 + 후속 top 28px 시프트 / §4.1 G-006 폐기 / §4.2 UX-011 / §5.5 / §7.2 cssclass / 정합 §A~§F 전체 |
| Round 4 (W5 A~G + ACCESS_TP + FORM_URL) | 2026-06-02 ~ 2026-06-03 | W5 A 레이아웃 (ContentBody column stacker) + W5 B Detail wrapper 28px gray header + W5 C Form row 정렬 (적용 행 0) + W5 D Grid editable:false + W5 E 버튼 row-state pre-disable 제거 + W5 F 자동조회 + W5 G BE 시간 표준 / ACCESS_TP 3 enum → 2 enum (`내부` / `외부`) + DDL ALTER VARCHAR(1)→VARCHAR(10) / FORM_URL ToBe 라우팅 `{PARENT_MENU_ID}/{OBJECT_ID}` + BE 신규 `findOneParentMenuIdByObjectId` + 응답 row PARENT_MENU_ID 컬럼 추가 + DataInitializer 멱등 UPDATE | §3.1.1 (W5 A) / §3.1.2 (W5 B) / §3.1.3 (W5 C) / §4.1.1 (W5 D) / §4.1.2 (ACCESS_TP) / §4.1.3 (FORM_URL) / §4.2 UX-004 / §5.6 (W5 E) / §5.7 (W5 F) / §5.8 (W5 G) / §7.1 |
| Round 5 (PK readOnly inserted-only) | 2026-06-04 | OBJECT_ID readOnly 정책 — Detail D-001 OBJECT ID Input `readOnly={selected.nativeeditor_status !== "inserted"}` (기존 행 PK 변경 차단 / 신규 행만 사용자 편집 가능 / V-502 MENU_ID+ID 자동 합성 분기는 신규 행만 유효) | §4.1.4 (OBJECT_ID readOnly) / D-001 / V-502 |
| Round 6 | 2026-06-04 | N/A (본 화면 영향 ✗ — 사용자 검수 결과 Round 6 변경은 다른 화면 대상) | - |
| Round 7 (btn_close 제거) | 2026-06-04 ~ 2026-06-05 | AsIs xfdl commonTop basic 4 의 마지막 btn_close → ToBe 완전 제거 / PageLayout buttons 배열에서 btn_close entry 삭제 + 미사용 handleClose dead code 제거 / 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) → ToBe 3 버튼 표준 (조회/초기화/저장) / 사유: portal 탭 close 는 host (PortalShell) 가 처리 — 화면 내부 닫기 버튼 의미 ✗ | §1.2 (PageLayout buttons 3) / §2.2 (구조도 commonTopButton 3) / §5.1 (B-004 폐기) / §5.6 (B-004 폐기) / §8 자체 검증 (B 활성 10→9) |

### J.1 W5 패턴 A~G 표시 (기존 보존)

| 패턴 | 설명 | 본 화면 적용 |
|---|---|---|
| W5 A | 레이아웃 (ContentBody column stacker + Row1/Row2 명시 적층) | ✓ (sub 그리드 0 — Row2 미사용 표준 보존만 명시) |
| W5 B | Detail wrapper (marginTop:32 + 28px gray header + border #d4dae0 + bg #fff) | ✓ |
| W5 C | Form row 다중 컴포넌트 정렬 (flex+gap:8+space-between / 우측 버튼 width:110) | ✓ 표준 보존 (적용 행 0) |
| W5 D | Grid editable:false 전체 + 날짜 toDateInputValue + code LABEL_MAP | ✓ |
| W5 E | 버튼 row-state pre-disable 제거 + V-NNN ErrorModal | ✓ (Round 7 btn_close 제거 반영) |
| W5 F | 자동조회 useEffect → loadList(DEFAULT_FILTERS) | ✓ |
| W5 G | BE 시간 표준 END_OF_TIME + parseLocalDateTime | ✓ |
