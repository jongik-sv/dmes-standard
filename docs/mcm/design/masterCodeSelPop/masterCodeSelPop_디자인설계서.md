---
screenId: masterCodeSelPop
asIsId: MasterCodeSelPop
moduleId: mcm
moduleGroup: cma
작성일: 2026-05-27
작성자: Agent
---

# MCM — 마스터코드 선택 팝업 디자인설계서

> **Frontend 개발 연계 값** (기능설계서 §1.3 와 동일): mesModule=m-mcm, moduleGroup=cma, pageName=masterCodeSelPop, pageId=masterCodeSelPop, 페이지 유형=A (단순 조회), tsup entry key=`pages/cma/masterCodeSelPop`
> **명명 룰**: MES 단일 룰 (camelCase 4 식별자 1byte 동일).

---

## 1. 공통 화면 구조

### 1.1 팝업 화면 특수성

본 화면은 **모달 팝업**이다. portal `PortalShell` 의 SIDEBAR / HEADER / TabsBar / page-id-badge 미주입.

| 영역 | 본 화면 적용 | 비고 |
|---|---|---|
| SIDEBAR / HEADER / TabsBar | 미주입 (모달 팝업) | 호출 화면 위에 오버레이로 표시 |
| page-id-badge | 미적용 (모달) | 페이지 ID 배지는 메인 페이지 전용 |
| Modal 컨테이너 | 적용 | `@dk-oasis/shared/modal` 의 Modal 컴포넌트 사용 (To-Be 결정) |

### 1.2 화면 설계 대상 영역 (Modal 기반)

```
┌──────────────────────────────────────────────────────────┐
│ Modal Header                                             │
│  ├─ title = "마스터코드 선택" (As-Is `edt_title.value`)    │
│  └─ buttons = [조회, 확인, 닫기] (commonTopButton 주입)    │
├──────────────────────────────────────────────────────────┤
│ SearchArea (A-FILTER)  [접기 가능 — btn_fold]              │
│  └─ SearchField × 4 (코드명 라벨 / 코드명 / 검색구분 / 검색어)│
├──────────────────────────────────────────────────────────┤
│ ContentBody (A-GRID — div_main)                          │
│  └─ ContentPanel (Grid grd_main, 5 columns × N rows)     │
├──────────────────────────────────────────────────────────┤
│ Footer (A-FOOTER)                                        │
│  └─ commonBottomStatus.xfdl (상태 메시지)                  │
└──────────────────────────────────────────────────────────┘
```

| 영역 | 담당 컴포넌트 (To-Be 권장) | 비고 |
|---|---|---|
| Modal 컨테이너 | `Modal` (@dk-oasis/shared/modal) | width=480 height=740 (As-Is 기준) |
| Modal Header (title + buttons) | `Modal` 의 `title` / `actions` prop | As-Is `edt_title` + commonTopButton |
| A-FILTER | `SearchArea` + `SearchField` × 4 | As-Is `div_search` |
| A-GRID | `ContentBody` + `ContentPanel` + `AgDataGrid` | As-Is `div_main` + `grd_main` |
| 그리드 | `AgDataGrid` (+ `useGridDataManager`) | 5 컬럼 + 행 더블클릭 핸들러 |
| Footer 상태 메시지 | (모달 하단 텍스트 영역) | As-Is `commonBottomStatus` 등가 |

---

## 2. 화면 레이아웃

### 2.1 레이아웃 유형 + 페이지 유형 (분석리포트 §3.1 인용)

| 항목 | 값 |
|---|---|
| 페이지 유형 (자동 결정) | A (단순 조회 — A-FILTER + A-GRID 단일, GE=0, D=0, L=0) |
| 레이아웃 유형 | 단일그리드형 (조회조건 + 단일 그리드) |
| 모달 여부 | Y (모달 팝업) |
| 참조 화면 | (LoV 모달 패턴 — To-Be 기존 화면 등가 결정 시 보강) |

### 2.2 메인 영역 구조도 (As-Is xfdl 좌표 1:1 보존)

As-Is 좌표 (분석리포트 §3.1 인용):

```
┌────────────────────────────────────────────────────────┐
│ Form: MasterCodeSelPop  width=480  height=740           │
│ ──────────────────────────────────────────────────────  │
│ div_title  left=20 top=0  right=20  height=50           │
│   ┌─────────────────────────────────────────────────┐   │
│   │ edt_title "마스터코드 선택"   div_topMenu (270×23)│   │
│   │  W=140 H=30 bottom=10        right=0 bottom=10  │   │
│   │                              (commonTopButton:  │   │
│   │                               btn_search,       │   │
│   │                               btn_confirm,      │   │
│   │                               btn_close)        │   │
│   └─────────────────────────────────────────────────┘   │
│ ──────────────────────────────────────────────────────  │
│ div_search  left=20 top=50 right=20 height=43           │
│   ┌─────────────────────────────────────────────────┐   │
│   │ [stc_codeNm]  [edt_codeNm]   [cbo_div][edt_codeVal]│ │
│   │  L=0 W=50      L=stc+10 W=108  L=208 W=80  L=cbo+10│ │
│   │  top=10 H=20   top=11 H=20     top=11 H=20  top=10 │ │
│   │  "코드명"      "결함 코드"     "코드값" "USD"      │ │
│   │                              CODE_VAL/MEAN  W=135 │ │
│   └─────────────────────────────────────────────────┘   │
│ ──────────────────────────────────────────────────────  │
│ btn_fold  top=93 left=20 right=20 height=15  (접기 토글)│
│ ──────────────────────────────────────────────────────  │
│ div_main  left=20 top=btn_fold:5 right=20 bottom=35     │
│   ┌─────────────────────────────────────────────────┐   │
│   │ grd_main (Grid)  binddataset=ds_grdMain          │   │
│   │  left=0 top=26 right=0 bottom=0                  │   │
│   │  Columns (5): 30 / 80 / 80 / 160 / 160           │   │
│   │  Rows: head(26) / body(26)                       │   │
│   │  ┌────┬─────────┬─────────┬────────┬──────────┐  │   │
│   │  │ NO │카테고리ID│카테고리명│ 코드값  │ 코드의미   │  │   │
│   │  ├────┼─────────┼─────────┼────────┼──────────┤  │   │
│   │  │currow+1 │CATEGORY_ID│CATEGORY_NM│CODE_VAL│CODE_VAL_MEAN│
│   │  └────┴─────────┴─────────┴────────┴──────────┘  │   │
│   └─────────────────────────────────────────────────┘   │
│ ──────────────────────────────────────────────────────  │
│ div_bottom (Footer commonBottomStatus)                  │
│  left=0 bottom=0 right=0 height=20                      │
└────────────────────────────────────────────────────────┘
```

---

## 3. 영역별 배치 상세

### 3.1 A-TITLE (Modal Header)

| 항목 | As-Is | To-Be |
|---|---|---|
| 타이틀 | edt_title.value = "마스터코드 선택" (xfdl:47) | Modal title prop = "마스터코드 선택" |
| 타이틀 위치 | div_title 내부 left=0 W=140 H=30 bottom=10 | Modal Header 영역 |
| 타이틀 cssclass | edi_WFHD_Title (xfdl:47) | (To-Be 공통 모달 스타일) |
| 상단 메뉴 | div_topMenu (270×23, right=0 bottom=10) — commonTopButton.xfdl 주입 (btn_search / btn_confirm / btn_close) | Modal actions / 상단 버튼바 |

### 3.2 A-FILTER (조회조건 — div_search)

영역 박스 (xfdl `div_search` — cssclass="div_WFSA_Box"):

```
┌──────────────────────────────────────────────────────────┐
│ A-FILTER (div_search)                                    │
│  cssclass="div_WFSA_Box"   left=20 top=50 right=20 H=43  │
│                                                          │
│  [stc_codeNm]  [edt_codeNm]      [cbo_div]  [edt_codeVal]│
│   "코드명"       "결함 코드"        "코드값"     "USD"     │
│   W=50          W=108              W=80         W=135    │
│   X=0           X=stc+10           X=208        X=cbo+10 │
│   Y=10          Y=11               Y=11         Y=10     │
└──────────────────────────────────────────────────────────┘
```

| 필드 ID | As-Is 컨트롤 | As-Is 표시값 | To-Be 컴포넌트 | To-Be 좌표 | 입력 방식 | 비고 |
|---|---|---|---|---|---|---|
| S-001 | stc_codeNm | "코드명" (Static) | Label / FormGroup label | A-FILTER 좌측 | (라벨) | textAlign=center verticalAlign=middle |
| S-002 | edt_codeNm | "결함 코드" (호출 측 sCodeNm) | Input (readOnly 권장) | S-001 우측 W=108 | TextBox | 검색 미전송 (UI only — As-Is 보존) |
| S-003 | cbo_div | "코드값" (LV-001 innerdataset 2 행) | Select / ComboBox | 우측 W=80 | ComboBox | value=CODE_VAL 기본, CODE_VAL_MEAN 옵션 |
| S-004 | edt_codeVal | "USD" (호출 측 sCodeVal) | Input | S-003 우측 W=135 | TextBox | onkeydown Enter 자동 조회 비활성 (As-Is 보존) |

### 3.3 A-FOLD (접기 버튼 — btn_fold)

| 항목 | As-Is | To-Be |
|---|---|---|
| 버튼명 | btn_fold | (접기/펴기 토글 버튼) |
| 위치 | top=93 left=20 right=20 H=15 | A-FILTER 하단 (또는 SearchArea 내장 토글) |
| cssclass | btn_WFSA_Fold | (To-Be 공통 토글 스타일) |
| 동작 | gfn_fold(this, this.div_search, this.div_main, this.btn_fold) — 검색 영역 토글 | SearchArea collapse/expand |

### 3.4 A-GRID (결과 그리드 — div_main / grd_main)

영역 박스:

```
┌──────────────────────────────────────────────────────────┐
│ A-GRID (div_main)                                        │
│   left=20  top=btn_fold:5  right=20  bottom=35           │
│                                                          │
│   grd_main  binddataset=ds_grdMain  autofittype=col      │
│   selecttype=cell  cellmovingtype=col  cellsizingtype=col│
│                                                          │
│   onheadclick   → div_main_grd_main_onheadclick (정렬)    │
│   oncelldblclick → div_main_grd_main_oncelldblclick      │
│                    (선택 행 반환 + popupClose)            │
└──────────────────────────────────────────────────────────┘
```

**그리드 컬럼 배치** (분석리포트 §3.3 인용):

| 컬럼ID | 헤더 | bind | 컬럼 폭 (xfdl size) | 정렬 | 편집 | 표시 형식 / 속성 |
|---|---|---|---:|---|---|---|
| G-001 | NO | expr:currow+1 | 30 | Center | N | (UI 자동 산출) |
| G-002 | 카테고리 ID | CATEGORY_ID | 80 | Left | N | varchar |
| G-003 | 카테고리명 | CATEGORY_NM | 80 | Left | N | varchar |
| G-004 | 코드값 | CODE_VAL | 160 | Left | N | varchar(50), editimemode=alpha, editinputmode=upper, displaytype=normal, edittype=none |
| G-005 | 코드의미 | CODE_VAL_MEAN | 160 | Left | N | varchar(180), editimemode=hangul, displaytype=normal, edittype=none |

**Row 정의**: head=26 / body=26 (xfdl `<Rows>`)

### 3.5 A-FOOTER (하단 공통 — div_bottom)

| 항목 | As-Is | To-Be |
|---|---|---|
| 영역 | div_bottom (commonBottomStatus.xfdl) | Modal Footer / Status Bar |
| 위치 | left=0 bottom=0 right=0 H=20 | Modal 하단 |
| 표시 메시지 | M-001 `{n}건 조회 되었습니다.` / M-002 strErrorMsg | (To-Be 모달 상태바 또는 Toast) |

---

## 4. 결과 그리드 (G-NNN — 기능설계서 §3.2 인용)

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| G-001 | (UI 산출) | NO | 행 번호 (currow+1) | Center | int |
| G-002 | CATEGORY_ID | 카테고리 ID | 코드 카테고리 식별자 | Left | varchar |
| G-003 | CATEGORY_NM | 카테고리명 | 카테고리 한글명 (뷰 JOIN 컬럼) | Left | varchar |
| G-004 | CODE_VAL | 코드값 | 코드 실값 | Left | varchar(50), alpha upper |
| G-005 | CODE_VAL_MEAN | 코드의미 | 코드 한글 의미 | Left | varchar(180), hangul |

---

## 5. 버튼 (B-NNN — 기능설계서 §5 인용)

### 5.1 Modal Header Buttons (commonTopButton 주입)

| 버튼ID | 버튼명 | 위치 | 동작 |
|---|---|---|---|
| B-001 | 조회 | Modal Header (commonTopButton btn_search) | fn_search 호출 |
| B-002 | 확인 | Modal Header (commonTopButton btn_confirm) | 현재 선택 행 반환 + popupClose |
| B-003 | 닫기 | Modal Header (commonTopButton btn_close) | this.close() |

### 5.2 A-FOLD

| 버튼ID | 버튼명 | 위치 | 동작 |
|---|---|---|---|
| B-004 | 조회조건 접기/펴기 | A-FOLD (div_search 하단) | div_search 와 div_main 토글 |

### 5.3 Grid 이벤트

| ID | 트리거 | 동작 |
|---|---|---|
| E-001 | grd_main 행 더블클릭 | { sCodeVal, sCodeValMean } 반환 + popupClose (= B-002 등가) |
| E-002 | grd_main 헤더 클릭 | 정렬 토글 |

---

## 6. 메시지 표기 (기능설계서 §10 인용)

| ID | 메시지 | 표시 위치 | 트리거 |
|---|---|---|---|
| M-001 | `{n}건 조회 되었습니다.` | A-FOOTER (commonBottomStatus) | fn_search 성공 |
| M-002 | strErrorMsg | A-FOOTER | fn_search 실패 |

**To-Be 메시지 권장**:
- 모달 하단 상태바 텍스트로 표시 (As-Is 1:1 보존)
- 또는 Toast / Snackbar 로 변경 가능 (To-Be 결정 — As-Is 보존이 우선)

---

## 7. 스타일 / cssclass (As-Is 보존)

| xfdl 컨트롤 | cssclass | To-Be 매핑 후보 |
|---|---|---|
| btn_fold | btn_WFSA_Fold | (조회조건 접기/펴기 표준 토글) |
| edt_title | edi_WFHD_Title | (모달 헤더 타이틀 스타일) |
| div_search | div_WFSA_Box | (SearchArea 박스 스타일) |
| div_bottom | div_WF_Footer | (Footer 영역 스타일) |
| (기타 컨트롤) | (cssclass 미명시 — As-Is 기본 스타일 사용) | (To-Be 기본) |

---

## 8. 응답형 / 폭 제약

| 항목 | 값 | 근거 |
|---|---|---|
| Form width | 480 | MasterCodeSelPop.xfdl:3 |
| Form height | 740 | MasterCodeSelPop.xfdl:3 |
| mobileorientation | landscape | MasterCodeSelPop.xfdl:5 |
| 모달 크기 (권장) | 480 × 740 (As-Is 보존) | To-Be 결정 — 모바일 대응 시 별도 |
