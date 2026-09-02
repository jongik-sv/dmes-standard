---
screenId: commRoleGrpMng
asIsId: CommRoleGrpMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# mcm — 역할 그룹 관리 디자인설계서

> **Frontend 개발 연계 값** (기능설계서 §1.2 와 동일):
> - mesModule = `m-mcm` / moduleGroup = `csa` / pageName = `commRoleGrpMng` / pageId = `commRoleGrpMng` / 페이지 유형 = **D 다중 그리드** / tsup entry key = `pages/csa/commRoleGrpMng`
>
> **명명 룰**: MES 단일 룰 (mcm 모듈 — APS 예외 미적용). 4 식별자 1byte 동일.
>
> **인용 정본**: 분석리포트 §3 (UI 컴포넌트 전수) + 기능설계서 §3 (S/G/GE1/GE2/LT) + §4 (D) + §5 (B/EX/EX2/EX3). 자체 추가 ✗.
>
> **갱신 이력**:
> - 2026-05-29 초안 — 5 패널 (Row1 메인+Detail / Row2 메뉴트리+sub1+셔틀+sub2) 4분할 As-Is 1:1.
> - 2026-05-31 — Q 12 건 일괄 해소 (정책 #1 BIZ SYSTEM 콤보 폐기 / Q-006 셔틀 cssclass 정정 / lov 폐기 등).
> - **2026-06-02 Round 2 — AsIs 1:1 재개발 적용** (사용자 지적: AsIs/ToBe 레이아웃 완전 불일치). 기존 ToBe 폐기, shared `<Tree>` 도입, **4분할 레이아웃** (Row1 메인+Detail / Row2 메뉴트리+sub1+셔틀+sub2) 채택. **3-chain auto load** (ds_main_onrowposchanged → searchCmRoleGrpMap + searchCmRole + searchCmRoleGrpMenu) 명시.
> - **2026-06-02 Round 3 — 메뉴 구조 트리 영역 제거** (사용자 결정). Row2 4분할 → **3분할** (sub1 + 셔틀 + sub2). FE searchCmRoleGrpMenu 호출 제거 (BE action 자체는 보존 — 다른 호출처 안전 확인 시점까지). Tree 컴포넌트 import 제거. **3-chain → 2-chain** (Promise.all 에 searchCmRoleGrpMap + searchCmRole 만).
> - **2026-06-02 Round 5 — ROLE_GROUP_ID readOnly inserted 만** (사용자 결정). PK ROLE_GROUP_ID 는 **신규 행 (`nativeeditor_status === "inserted"`) 만 편집 가능**, 기존 행은 readOnly. updateDetailField PK guard + Input readOnly={selected.nativeeditor_status !== "inserted"} 일관 적용.
> - **2026-06-04 W5 A~G 패턴 동기화** — csa 8 화면 표준 W5 패턴 본 화면 본문 직접 등재 (A 좌메인+우Detail 비율 / B Detail 헤더 정렬 / C 행 정렬 / D editable:false + 코드 라벨 / E commonTopButton 4 / F 자동조회 / G END_OF_TIME 00:00:00).
> - **2026-06-04~05 Round 6 — PK readOnly 정책 (N/A)**. csa 8 화면 일괄 적용 라운드. 본 화면은 Round 5 (2026-06-02) 에서 이미 ROLE_GROUP_ID readOnly inserted-only 정책 적용 완료 — 본 라운드 본 화면 추가 변경 ✗ (정합 확인만).
> - **2026-06-04~05 Round 7 — btn_close 완전 제거** (사용자 결정). PageLayout.buttons 4 종 (조회/초기화/저장/닫기) → **3 종 (조회/초기화/저장)**. unused `handleClose` dead code 제거. **사유**: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼은 의미 ✗. W5 E 4 버튼 표준 → **W5 E 3 버튼 표준 (조회/초기화/저장)** 으로 가이드 §6-E 갱신 정합.

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
- 표시 형식 (MES 단일 룰): `mcm:commRoleGrpMng`
- moduleId 정본: 01 A.1 (업무 페이지는 `portal` 금지)

### 1.2 화면 설계 대상 영역 (PageLayout 기반)

> **2026-06-02 Round 3 적용**: 메뉴 구조 트리 영역 (LT — grd_M0F1) 제거. Row2 가 4분할 → **3분할** (sub1 + 셔틀 + sub2) 로 단순화. FE searchCmRoleGrpMenu 호출 제거 (BE action 자체는 보존).

```
┌────────────────────────────────────────────────────────────┐
│ PageLayout.title = "역할 그룹 관리"                          │
│ <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->            │
│ PageLayout.buttons = [btn_search, btn_reset, btn_save]      │
│                      ※ btn_close 제거 (Round 7)             │
│                      ※ "사용자 관리" link 별도                │
│  ├─ SearchArea  (A-FILTER)                                  │
│  │    └─ SearchField × 3  (S-002 그룹ID / S-003 그룹명 /   │
│  │                         S-004 사용여부) — S-001 폐기 (정책 #1) │
│  ├─ FoldButton (B-001 div_search 접기/펴기)                 │
│  └─ ContentBody root (column stacker)                       │
│        ├─ ROW 1 (flex:1 row)                                │
│        │     ├─ TOP-LEFT  (A-MAIN-TOP-LEFT — div_mainGrd)   │
│        │     │     ├─ Toolbar [EX2-001~003 + EX3-001~004]   │
│        │     │     └─ AgDataGrid (Master G-001~G-008)       │
│        │     └─ TOP-RIGHT (A-MAIN-TOP-RIGHT — div_mainDetail)│
│        │           └─ Form (D-001 / D-003~D-007 + BindItem 6)│
│        │             width=430                              │
│        └─ ROW 2 (flex:1 row — 3분할 / Round 3 메뉴트리 제거) │
│              ├─ BOT-LEFT  (A-MAIN-BOT-LEFT — div_subGrd1)   │
│              │     └─ AgDataGrid (현재 역할 GE1-001~GE1-008) │
│              │     ※ LT 메뉴 트리 영역 제거 (Round 3)        │
│              ├─ CENTER    (A-MAIN-CENTER — div_buttonGrp)   │
│              │     ├─ ShuttleButton (B-003 ▲ 추가)           │
│              │     └─ ShuttleButton (B-002 ▼ 제외)           │
│              └─ BOT-RIGHT (A-MAIN-BOT-RIGHT — div_subGrd2)   │
│                    ├─ Toolbar (edt_rolefilter — V-801 GE2 필터)│
│                    └─ AgDataGrid (전체 역할 GE2-001~GE2-007) │
└────────────────────────────────────────────────────────────┘
```

| 영역 | 담당 컴포넌트 | 비고 |
|---|---|---|
| SIDEBAR / HEADER / TabsBar | portal PortalShell | 화면별 설계 대상 아님 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 페이지 타이틀 / 상단 버튼바 | `PageLayout` `title` / `buttons` | `title` = "역할 그룹 관리" / `buttons` = [btn_search, btn_reset, btn_save] **3 종** (Round 7 — btn_close 제거) (W5 E 3 버튼 표준) |
| A-FILTER (조회조건) | `SearchArea` + `SearchField` × 3 | `@dk-oasis/shared/layout` (S-001 BIZ SYSTEM 폐기) |
| MAIN (콘텐츠 — Row1 2패널 + Row2 3패널 = 5 패널 / Round 3 메뉴트리 제거) | `ContentBody root` + 명시적 column stacker `div` + Row1 row + Row2 row | `@dk-oasis/shared/layout`. commRoleMng 검증 패턴 (외곽 row + column stacker) 으로 collapse 회피. |
| 그리드 (Master / 현재역할 / 전체역할) | `AgDataGrid` (+ `GridPanel`) | `@dk-oasis/shared/grid` |
| ~~트리 (메뉴 구조 LT)~~ | **Round 3 폐기** | Tree 컴포넌트 import 제거. As-Is grd_M0F1 영역은 본 §3.5 / §4.3 As-Is 보존 표만 남기고 ToBe 미구현 명시. |
| 폼 (Detail D-NNN) | `<table>` + `Input` / `Radio` / `DatePicker` (D-002 BIZ SYSTEM 콤보 폐기로 6 필드) | `@dk-oasis/shared/form` + `DETAIL_TABLE_STYLE` / `DETAIL_LABEL_CELL` / `DETAIL_VALUE_CELL` |
| 셔틀 | `Button` × 2 (B-003 ▲ 추가 / B-002 ▼ 제외) — Q-006 정정 적용 | `@dk-oasis/shared/form` |

#### 1.2.1 ContentBody 비율 (W5 A — Round 2 결정)

| 영역 | 너비 정책 | 근거 |
|---|---|---|
| Row 1 좌 (Master 그리드) | `<ContentPanel>` (flex:1 — 가변) | xfdl div_mainGrd `right=440` ↔ Detail width=430 정합 → 좌측 = 메인 폭 - 440 |
| Row 1 우 (Detail 폼) | `<ContentPanel width={430}>` 고정 | xfdl:220 `div_mainDetail width=430` 1:1 |
| Row 2 좌 (sub1 현재 역할) | `<ContentPanel>` (flex:1 — 가변) | Round 3 메뉴트리 폐기로 sub1 단독. xfdl `div_subGrd1 width=800` → To-Be 가변 균등 |
| Row 2 중 (셔틀) | 36 px 고정 (`width: 36`) | xfdl `div_buttonGrp width=24` + padding |
| Row 2 우 (sub2 전체 역할) | `<ContentPanel>` (flex:1 — 가변) | xfdl `div_subGrd2 right=0` → To-Be 가변 균등 |

> 비율 의도: Row1 은 As-Is xfdl 좌표 비율 (좌 가변 / 우 430 px 고정) 보존. Row2 는 메뉴트리 폐기로 균등 2 그리드 + 좁은 셔틀 가운데.

#### 1.2.2 ContentBody 색상 정책 (W5 B — Round 2 결정)

| 영역 | 배경 | 근거 |
|---|---|---|
| Wrapper 외곽 (Detail 영역 `<div marginTop=32>`) | `#fff` + border `1px solid #d4dae0` | grid-panel-header (32px) 와 정렬 + 박스 외곽선 |
| Detail 헤더 (`상세 정보`) | `#f4f6f8` 회색 + border-bottom `1px solid #d4dae0` | 좌측 GridPanel 의 panel-header 와 동색 |
| Detail 폼 본문 (`<table>` 영역) | `#fff` (table cell 만) | `DETAIL_VALUE_CELL` / `DETAIL_LABEL_CELL` 정본 유지 |
| 셔틀 영역 | (별도 색상 없음 — 부모 배경) | - |

---

## 2. 화면 레이아웃

### 2.1 레이아웃 유형 + 페이지 유형 자동 결정

| 항목 | 값 |
|---|---|
| **페이지 유형 (자동 결정)** | **D 다중 그리드** (분석 §3 — G=8 + GE1=8 + GE2=7 + LT=1 → GE/GE2 ≥ 1 충족 + 보조 트리 LT) |
| **레이아웃 유형** | **상하 2단 + 좌우 분할형** (As-Is xfdl: div_mainGrd top=0/height=222 + div_mainDetail top=0/width=430/height=222 + div_subGrd1 top=202/width=800/bottom=0 + div_buttonGrp left=div_subGrd1:5/width=24 + div_subGrd2 left=div_buttonGrp:5/right=0/top=div_mainGrd:10/bottom=0) |
| **참조 화면** | (없음 — `-`) |

### 2.2 메인 영역 구조도 (As-Is 좌표 1:1 보존)

```
top=0 ──────────────────────────────────────────────────────  left=20, right=20
│ A-TITLE (div_title, height=40)                              │
│  edt_title "역할 그룹 관리"  │  commonTopButton (4btn + 1link)│
top=50 ─────────────────────────────────────────────────────
│ A-FILTER (div_search, height=43, cssclass=div_WFSA_Box)     │
│  [역할 그룹ID] [edt_ROLE_GROUP_ID] [역할 그룹명] [edt_ROLE_GROUP_NM]│
│  [사용여부] [cbo_USE_TP]   (BIZ SYSTEM 콤보 폐기 — 정책 #1)  │
top=93 ─────────────────────────────────────────────────────
│ B-001 btn_fold (height=10, 접기 토글)                        │
top=113 ────────────────────────────────────────────────────
│ A-MAIN (div_main, bottom=40, 상하 + 좌우 5패널)              │
│ ┌─────────────────────────────────────┬────────────────┐ │
│ │ A-MAIN-TOP-LEFT (div_mainGrd)        │ A-MAIN-TOP-     │ │
│ │  top=0 / right=440 / height=222      │  RIGHT          │ │
│ │  ┌─ Toolbar top=0 (Title + buttons)┐ │  (div_mainDetail│ │
│ │  │ edt_rol_grp_list "역할그룹 목록" │ │   width=430     │ │
│ │  │ div_leftMenu (commonLeftButton)   │ │   height=222)   │ │
│ │  │ div_rightMenu (commonRightButton  │ │ ┌── div_detail ┐│ │
│ │  │  — btn_rowAdd/Del/Copy/Cancel)    │ │ │ Static1/5/2  ││ │
│ │  └──────────────────────────────────┘ │ │ /3/9/11/12   ││ │
│ │  ┌── Grid top=25 ─────────────────┐  │ │ 7 라벨 배경  ││ │
│ │  │ grd_main (binddataset=ds_main) │  │ │  + 7 입력    ││ │
│ │  │  G-001 상태 (image)            │  │ │  D-001~D-007 ││ │
│ │  │  G-002 역할 그룹 ID            │  │ │  + BindItem 7││ │
│ │  │  G-003 역할 그룹명             │  │ └─────────────┘│ │
│ │  │  G-004 역할 그룹 설명           │  │                  │ │
│ │  │  G-005 (BIZ SYS 폐기 #1)        │  │                  │ │
│ │  │  G-006 사용구분                │  │                  │ │
│ │  │  G-007/008 유효일자 (date)     │  │                  │ │
│ │  └─────────────────────────────────┘  │                  │ │
│ └─────────────────────────────────────┴────────────────┘ │
│ ┌─────────────────────────┬──┬─────────────────────────┐ │
│ │ A-MAIN-BOT-LEFT          │  │ A-MAIN-BOT-RIGHT         │ │
│ │ (div_subGrd1)            │CN│ (div_subGrd2)            │ │
│ │  top=202 / width=800     │TR│  top=div_mainGrd:10      │ │
│ │  bottom=0                │  │  bottom=0 / right=0      │ │
│ │  ┌── LT 좌측 (250w) ──┐  │SH│  ┌── Toolbar top=0 ─┐   │ │
│ │  │ grd_M0F1 (메뉴 트리)│  │  │  │ edt_auth_list    │   │ │
│ │  │  treelevel=bind:LEV│  │  │  │  "전체 역할"      │   │ │
│ │  │  treestartlevel=0  │  │  │  │ edt_auth_list2   │   │ │
│ │  └────────────────────┘  │UT│  │  "Role"          │   │ │
│ │  ┌── GE1 우측 ────────┐  │TL│  │ edt_rolefilter   │   │ │
│ │  │ edt_roleMapList    │  │E │  │ div_rightMenu    │   │ │
│ │  │  "현재 역할"       │  │  │  └─────────────────┘   │ │
│ │  │ grd_sub1 (GE1)     │  │  │  ┌── Grid top=25 ─┐    │ │
│ │  │  CHK / ROLE_ID/NM  │  │  │  │ grd_sub2 (GE2) │    │ │
│ │  │  /PARENT/USE/DATES │  │  │  │ CHK / ROLE_ID/  │    │ │
│ │  │  /ROLE_GROUP_ID    │  │  │  │  NM/PARENT/USE  │    │ │
│ │  └────────────────────┘  │  │  │  /DATES         │    │ │
│ │                          │  │  └─────────────────┘    │ │
│ └─────────────────────────┴──┴─────────────────────────┘ │
│   (셔틀 div_buttonGrp top=62.50%/height=75/width=24       │
│    B-002 btn_right (좌→우, cssclass=ShuttleAddH 모양)     │
│    B-003 btn_left  (우→좌, cssclass=ShuttleDeleteH 모양)) │
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
| A-TITLE | 40 px 고정 | 100% (left=20 / right=20) | 없음 | N | div_title (xfdl:6) |
| A-FILTER | 43 px 고정 | 100% (left=20 / right=20) | 없음 | N (btn_fold 로 접기/펴기 토글) | div_search (xfdl:14) |
| A-FOLD | 10 px 고정 | 100% (left=20 / right=20) | 없음 | N | btn_fold (xfdl:46) |
| A-MAIN | 가변 (top=113 / bottom=40) | 100% (left=20 / right=20) | (자식 그리드별 세로) | Y (xfdl 좌우 분할 비율 고정) | div_main (xfdl:47) |
| A-MAIN-TOP-LEFT (Master 그리드) | 222 px 고정 (top=0 within div_main) | (right=440 — 우상이 440 폭) | 세로 (grd_main) | N | div_mainGrd (xfdl:124) |
| A-MAIN-TOP-RIGHT (Detail 폼) | 222 px 고정 (top=0) | 430 px 고정 (left=div_mainGrd:10) | 세로 (긴 폼 시) | N | div_mainDetail (xfdl:220) |
| A-MAIN-BOT-LEFT (LT 트리 + GE1) | A-MAIN 잔여 (top=202 / bottom=0) | 800 px 고정 (left=0) | 세로 (grd_M0F1 + grd_sub1) | N | div_subGrd1 (xfdl:50) |
| A-MAIN-CENTER (셔틀) | 75 px 고정 (top=62.50%) | 24 px 고정 (left=div_subGrd1:5) | 없음 | N | div_buttonGrp (xfdl:116) |
| A-MAIN-BOT-RIGHT (GE2) | A-MAIN 잔여 (top=div_mainGrd:10 / bottom=0) | (left=div_buttonGrp:5 / right=0) | 세로 (grd_sub2) | N | div_subGrd2 (xfdl:173) |
| A-FOOTER | 20 px 고정 | 100% (left=20 / right=20) | 없음 | N | div_bottom (xfdl:273) |

### 3.2 A-FILTER 내부 배치 (좌표 As-Is 1:1)

```
top=10 ───────────────────────────────────────────────────────────────────────────────
│ [역할 그룹ID] [edt_ROLE_GROUP_ID]   [역할 그룹명] [edt_ROLE_GROUP_NM]              │
│  ↑              ↑                   ↑              ↑                              │
│  sts_roleGId   width=100            sts_roleNm    width=200                       │
│  W=80          left=sts:10          W=75          left=edt_GID:40                  │
│                maxlength=100                       maxlength=100                  │
│                                                                                  │
│ [사용 여부] [cbo_USE_TP]                                                          │
│  ↑              ↑                                                                 │
│  sts_useTp     width=50                                                           │
│  W=60          left=sts_useTp:10                                                  │
│                value="Y" / displayrowcount=3                                      │
│                                                                                  │
│ (BIZ SYSTEM 콤보 + stc_bizSystemCode 라벨 → To-Be 정책 #1 폐기)                   │
top=31 ───────────────────────────────────────────────────────────────────────────────
```

| 컨트롤 | 정확한 xfdl 좌표 | cssclass | 비고 |
|---|---|---|---|
| ~~stc_bizSystemCode~~ | - | - | **To-Be 정책 #1 폐기** |
| ~~cbo_bizSystemCode~~ | - | - | **To-Be 정책 #1 폐기** (Q-005 자동 해소) |
| sts_roleGroupId (S-002 라벨) | left=10 / top=10 / width=80 / height=21 (To-Be — As-Is `left=cbo_bizSystemCode:40` 의 cbo 폐기로 첫 컨트롤 위치 시프트) | edi_WFSA_Label | "역할 그룹ID" |
| edt_ROLE_GROUP_ID (S-002 입력) | left=sts_roleGroupId:10 / top=10 / width=100 / height=21 | (없음) | text="부산역 CY" / maxlength=100 |
| sts_roleGroupNm (S-003 라벨) | left=edt_ROLE_GROUP_ID:40 / top=10 / width=75 / height=21 | edi_WFSA_Label | "역할 그룹명" |
| edt_ROLE_GROUP_NM (S-003 입력) | left=sts_roleGroupNm:10 / top=10 / width=200 / height=21 | (없음) | text="부산역 CY" / maxlength=100 |
| sts_useTp (S-004 라벨) | left=edt_ROLE_GROUP_NM:40 / top=10 / width=60 / height=21 | edi_WFSA_Label | "사용 여부" |
| cbo_USE_TP (S-004 입력) | left=sts_useTp:10 / top=10 / width=50 / height=21 | (없음) | value="Y" / displayrowcount=3 / innerdataset 정적 (Y/Y, N/N) |

### 3.3 A-MAIN-TOP-LEFT 내부 배치 (Master 그리드 영역)

```
top=0 ──────────────────────────────────────────────────────────────────  right=0
│ Toolbar (top=0, height=21)                                              │
│  [역할그룹 목록]  div_leftMenu (commonLeft — chk_check/btn_sum/copyPaste)│
│  edt_rol_grp_list  div_rightMenu (commonRight                            │
│  width=90          — btn_rowAdd/rowDelete/rowCopy/rowCancel)             │
│                    width=360 / right=0                                   │
top=25 ──────────────────────────────────────────────────────────────────
│ grd_main (binddataset=ds_main, taborder=0)                              │
│  Format: head 1줄 + body 1줄 / Column 8개 (band=left 1 + 7)             │
│  Columns: 48/90/140/140/80/80/80/80                                      │
│                                                                          │
│  Head row 0:  상태│역할 그룹 ID│역할 그룹명│역할 그룹 설명│BIZ SYSTEM│   │
│               사용구분│유효개시일│유효기한일                            │
│  Body row:    STATUS(img)│ROLE_GROUP_ID│ROLE_GROUP_NM│ROLE_GROUP_DESC│  │
│               BIZ_SYSTEM_CODE│USE_TP│START_DATE│END_DATE                 │
│               ↑                                                          │
│               displaytype=imagecontrol (auto row state)                  │
│                                                                          │
│  options: autofittype=col / cellmovingtype=col / cellsizingtype=col      │
│           selecttype=cell / autosizebandtype=allband                    │
│  events:  onheadclick → gfn_commonOnheadclick (정렬, xfdl:797)           │
│           onkeydown   → Ctrl+C 시 gfn_grdCopy_Paste (xfdl:790)           │
│  Dataset onrowposchanged → 자동 chain (xfdl:753 — Map+Role+Menu 3 회)    │
bottom=0 ───────────────────────────────────────────────────────────────
```

| Toolbar 컨트롤 위치 | 컨트롤ID | 좌표 (As-Is) |
|---|---|---|
| left=0 / top=0 / width=90 / height=21 | edt_rol_grp_list (Edit cssclass=edi_WF_Title1) | "역할그룹 목록" / readonly / tabstop=false |
| left=edt_rol_grp_list:5 / top=0 / width=210 / height=21 | div_leftMenu (Div url=`_com_div::commonLeftButton.xfdl`) | tabstop=false |
| top=0 / width=360 / height=21 / right=0 | div_rightMenu (Div url=`_com_div::commonRightButton.xfdl`) | font=12px/normal Malgun Gothic / tabstop=false |

### 3.4 A-MAIN-TOP-RIGHT 내부 배치 (Detail 폼 영역)

```
top=0 ───────────────────────────────────────────────  left=div_mainGrd:10, width=430
│ Toolbar (top=0, height=25)  div_detail top=25/left=0/height=197/width=430│
│                                                                          │
│  div_detail 내부 — 7 입력 + 7 라벨 + 7 Static 배경                       │
│                                                                          │
│  top=0   stc_Static1 (cssclass=stc_WF_BoxFirst, height=29)               │
│           edt_st_roleGroupId "역할 그룹 ID" (left=1/top=0/width=180/h=29 │
│             cssclass=edi_WF_LabelFirstE — Essential 라벨)                │
│           edt_role_group_id (left=184/top=4/width=240/h=21               │
│             text="부산역 CY" / cssclass=Essential / maxlength=90)        │
│  top=28  (stc_Static5 + edt_st_BIZ_SYSTEM_CODE + cbo_subSystemCode      │
│            모두 To-Be 정책 #1 폐기 — D-002 BIZ SYSTEM 콤보 제거)         │
│  top=56  stc_Static2 (height=29)                                         │
│           edt_st_roleGroupNm "역할 그룹명" (cssclass=edi_WF_Label)        │
│           edt_role_group_nm (left=184/top=60/width=240/h=21              │
│             text="부산역 CY" / maxlength=100)                            │
│  top=84  stc_Static3 (height=29)                                         │
│           edt_st_roleGroupDesc "역할 그룹 설명" (cssclass=edi_WF_Label)   │
│           edt_role_group_desc (left=184/top=88/width=240/h=21            │
│             text="부산역 CY" / maxlength=100)                            │
│  top=112 stc_Static9 (height=29)                                         │
│           edt_st_useTp "사용 여부" (cssclass=edi_WF_LabelFirst)          │
│           edt_use_tp (Radio left=185/top=116/width=128/h=21              │
│             direction=vertical / Y=Yes/N=No / value="Y")                 │
│  top=140 stc_Static11 (height=29)                                        │
│           edt_st_startActiveDate "유효 개시일" (cssclass=edi_WF_Label)   │
│           cal_start_active_date (Calendar left=184/top=143/width=240/h=21│
│             usetrailingday=true)                                         │
│  top=166 stc_Static12 (height=29)                                        │
│           edt_st_endActiveDate "유효 기한일" (cssclass=edi_WF_Label)     │
│           cal_end_active_date (Calendar left=184/top=170/width=240/h=21  │
│             usetrailingday=true)                                         │
bottom=0 ─────────────────────────────────────────────────────────────────
```

#### 3.4.1 Detail 폼 To-Be 행 구성 (Round 2 + Round 5)

> **Round 2**: shared `<table>` (`DETAIL_TABLE_STYLE` + `DETAIL_LABEL_CELL` + `DETAIL_VALUE_CELL`) 채택. AsIs 7 행 → ToBe 6 행 (D-002 BIZ SYSTEM 폐기). 1 행 = 1 `<tr>` (라벨 `<th>` + 입력 `<td>`).

| ToBe 행 | 라벨 | 입력 컴포넌트 | 필수 | readOnly 정책 (Round 5) |
|---|---|---|---|---|
| D-001 | `역할 그룹 ID *` | `<Input maxLength=100>` | 필수 (`V-004 gfn_cpRequired`) | **신규 행만 편집** — `selected.nativeeditor_status === "inserted"` 일 때만 `readOnly=false`. 기존 행 readOnly. |
| ~~D-002~~ | ~~BIZ SYSTEM~~ | **폐기** (정책 #1) | - | - |
| D-003 | `역할 그룹명` | `<Input maxLength=100>` | - | 항상 편집 가능 |
| D-004 | `역할 그룹 설명` | `<Input maxLength=100>` | - | 항상 편집 가능 |
| D-005 | `사용 여부` | `<Radio>` (`Y`/`N`) | - | 항상 편집 가능 |
| D-006 | `유효 개시일` | `<DatePicker>` (yyyy-MM-dd) | - | 항상 편집 가능 |
| D-007 | `유효 기한일` | `<DatePicker>` (yyyy-MM-dd) | - | 항상 편집 가능 |

#### 3.4.2 D-001 ROLE_GROUP_ID readOnly inserted 정책 (W5 — Round 5)

> 사용자 결정 (2026-06-02 Round 5): PK ROLE_GROUP_ID 는 **신규 행 (nativeeditor_status === "inserted") 만 편집 가능**. 기존 행은 readOnly 로 잠궈 PK 변조 방지.

| 항목 | 값 |
|---|---|
| 컴포넌트 | `<Input>` (D-001) |
| readOnly 식 | `readOnly={selected.nativeeditor_status !== "inserted"}` |
| onChange (PK guard) | `updateDetailField("ROLE_GROUP_ID", v)` 내부에서 `r.nativeeditor_status !== "inserted"` 이면 변경 무시 (이중 안전) |
| 사용자 의도 | As-Is xfdl `canchange` 미정의 (결함 #2 — 분석 §11.1 #15) → ToBe Service PK 중복 검증 + FE readOnly 이중 차단 |
| 신규 행 PK 입력 흐름 | `handleRowAdd` 시 `ROLE_GROUP_ID: ""` 로 초기화 → Detail 폼에서 사용자 직접 입력 → 저장 시 V-004 + 서버 PK 중복 검증 |
| 기존 행 보호 | row 클릭 시 `selected.nativeeditor_status === "updated"` 또는 `undefined` → Input readOnly 활성 |

#### 3.4.3 Detail wrapper marginTop / 헤더 정렬 (W5 B)

| 항목 | 값 | 근거 |
|---|---|---|
| Wrapper `marginTop` | `32` px | 좌측 GridPanel 의 `panel-header` (count + 행추가/행삭제 버튼 토글 영역 32px) 와 정렬 — Detail 만 헤더 상단이 위로 튀어나오는 것을 방지 |
| Detail 자체 헤더 텍스트 | `"상세 정보"` | commUserMng J-002 / J-008 동일 패턴 |
| Detail 헤더 height | `28` px | column-header 라인과 정렬 (cma 4 화면 동일 패턴) |
| Detail 헤더 배경 | `#f4f6f8` 회색 | grid panel-header 와 동색 |
| Detail 헤더 font | `weight=600` / `size=13` / `color=#333` | 본문 §1.2.2 참조 |
| Wrapper border | `1px solid #d4dae0` | 좌측 그리드 외곽선과 동일 |

### 3.5 A-MAIN-BOT-LEFT 내부 배치 (LT 트리 + GE1 그리드 영역)

> **2026-06-02 Round 3**: 사용자 결정으로 LT 메뉴 구조 트리 영역 (grd_M0F1, width=250) **제거**. ToBe 의 BOT-LEFT 는 `<ContentPanel>` (flex:1) 단독 + GE1 그리드 한 개 만 배치. 본 §3.5 의 좌측 250 px LT 영역은 As-Is 보존 표만 유지하고 ToBe 미구현. FE 의 `searchCmRoleGrpMenu` 호출도 제거 — BE action 자체는 다른 호출처 안전 확인 시점까지 보존.

#### 3.5.1 ToBe BOT-LEFT 구성

| 항목 | 값 |
|---|---|
| 컨테이너 | `<ContentPanel>` (flex:1 — Row2 균등) |
| 그리드 | `GridPanel "현재 역할"` + `<AgDataGrid columns={ROLEMAP_COLUMNS}>` (GE1-001~GE1-008) |
| LT 메뉴 트리 (As-Is grd_M0F1) | **ToBe 미구현** (Round 3 제거) — As-Is xfdl 보존표 §4.3 만 유지 |
| Tree 컴포넌트 import | **제거** (page.tsx 의 `import` 라인에 Tree 미포함) |

#### 3.5.2 As-Is 좌표 (보존 — ToBe 미구현)

```
top=0 ──────────────────────────────────────────────────────────────────  width=800
│ Toolbar (top=0, height=25)                                              │
│  left=260 edt_roleMapList "현재 역할" (cssclass=edi_WF_Title1, w=77)     │
│                                                                          │
top=25 ──────────────────────────────────────────────────────────────────
│ ┌── grd_M0F1 ────┐  ┌── grd_sub1 ──────────────────────────────────────┐│
│ │ 좌측 메뉴 트리  │  │ 우측 "현재 역할" 그리드                          ││
│ │ width=250       │  │ left=260 / right=0 / bottom=0                    ││
│ │ binddataset=    │  │ binddataset=ds_roleGrpMap                        ││
│ │  ds_menuTree   │  │  Format: head 1 + body 1 / Column 8               ││
│ │  List           │  │  Columns: 30(band=left)/89/140/101/60/80/80/80   ││
│ │ treeinit=expand,│  │                                                  ││
│ │  all            │  │  Head row 0: (CHK)/역할 ID/역할명/부모역할 ID/   ││
│ │ treeusebutton=  │  │   사용 여부/유효개시일/유효기한일/역할 그룹 ID    ││
│ │  use            │  │  Body row:  CHK(check)/ROLE_ID/ROLE_NM/          ││
│ │ wheelscrollrow=2│  │   PARENT_ROLE_ID(Q-010)/USE_TP/START/END_DATE/   ││
│ │ cssclass=       │  │   ROLE_GROUP_ID                                  ││
│ │  grd_LF_Tree    │  │                                                  ││
│ │ Head row: MENU_ │  │ options: autofittype=none / selecttype=row /     ││
│ │  NM (단일 컬럼) │  │  cellmovingtype=col / minheight=50               ││
│ │ Body row:       │  │ events:  onheadclick → CHK 헤드 시 전체 토글     ││
│ │  MENU_NM        │  │   / 그 외 정렬 (xfdl:802)                        ││
│ │  treelevel=     │  │  ondragmove / ondrop (xfdl:50 div 레벨)          ││
│ │   bind:LEV      │  │                                                  ││
│ └─────────────────┘  └──────────────────────────────────────────────────┘│
bottom=0 ───────────────────────────────────────────────────────────────
```

| 컨트롤 위치 | 컨트롤ID | 좌표 (As-Is) |
|---|---|---|
| left=260 / top=0 / width=77 / height=21 | edt_roleMapList (Edit cssclass=edi_WF_Title1) | "현재 역할" / readonly / tabstop=false |
| left=0 / top=25 / width=250 / bottom=0 | grd_M0F1 (Grid) | 메뉴 트리 — LT-001 (MENU_NM) |
| left=260 / top=25 / right=0 / bottom=0 (`minheight=50`) | grd_sub1 (Grid) | GE1 — 현재 역할 |

### 3.6 A-MAIN-CENTER 내부 배치 (셔틀 영역)

```
top=62.50% ──────────────────────────────────────────────  width=24, height=75
│ ┌── div_buttonGrp ──────────────┐
│ │ B-003 btn_right (top=1/h=31)   │  cssclass=btn_WF_ShuttleAddH (UI 모양: 추가)
│ │   onclick → fn_appendRoleMapRow│  실제 동작: GE2 → GE1 매핑 추가 (Q-006 해소: cssclass 의미 일치)
│ │                                │
│ │ B-002 btn_left (top=42/h=31)   │  cssclass=btn_WF_ShuttleDeleteH (UI 모양: 제외)
│ │   onclick → fn_removeRoleMapRow│  실제 동작: GE1 → GE2 매핑 제외 (Q-006 해소: cssclass 의미 일치)
│ └────────────────────────────────┘
top=62.50%+75 ─────────────────────────────────────────────
```

| 컨트롤 위치 | 컨트롤ID | 좌표 (To-Be 정정 — Q-006 해소) |
|---|---|---|
| top=1 / width=24 / height=31 / left=0 | btn_right (B-003) | cssclass=btn_WF_ShuttleAddH / enable=true / **동작: 추가 (fn_appendRoleMapRow)** — cssclass 의미와 일치 |
| top=42 / width=24 / height=31 / left=0 | btn_left (B-002) | cssclass=btn_WF_ShuttleDeleteH / enable=true / **동작: 제외 (fn_removeRoleMapRow)** — cssclass 의미와 일치 |

> **To-Be (Q-006 해소)** — cssclass 의 시각적 모양과 onclick 핸들러 동작 의미 일치. As-Is 의 모순 (cssclass=Add 인데 동작=Delete) 정정.

### 3.7 A-MAIN-BOT-RIGHT 내부 배치 (GE2 전체 역할 그리드 영역)

```
top=div_mainGrd:10 ─────────────────────────────────────────  left=div_buttonGrp:5
│ Toolbar (top=0, height=21)                                              │
│  [전체 역할]      [Role][edt_rolefilter]      div_rightMenu             │
│  edt_auth_list   edt_auth_list2  width=140    width=234                 │
│   width=77       width=35         right=0     right=0                   │
│   left=0         right=edt_rolefilter:0       url include common right  │
top=25 ──────────────────────────────────────────────────────────────────
│ grd_sub2 (binddataset=ds_role, taborder=0)                              │
│  Format: head 1 + body 1 / Column 7 (band=left 1 + 6)                   │
│  Columns: 48/105/120/80/60/80/80                                         │
│                                                                          │
│  Head row 0: (CHK)/역할 ID/역할명/부모역할 ID/사용여부/유효개시일/        │
│              유효기한일                                                  │
│  Body row:   CHK(check)/ROLE_ID/ROLE_NM/PARENT_ROLE_ID(Q-010)/          │
│              USE_TP/START_DATE/END_DATE                                  │
│                                                                          │
│  options: autofittype=col / treeinit=expand,all / selecttype=row /       │
│           autosizebandtype=allband / autoenter=select                    │
│  events:  onheadclick → CHK 헤드 시 전체 토글 / 그 외 정렬 (xfdl:819)    │
│           onkeydown → (본문 주석 — 실 동작 ✗, xfdl:829)                  │
│           Dataset oncolumnchanged → fn_setChkDs (head 동기화, xfdl:837)  │
bottom=0 ───────────────────────────────────────────────────────────────
```

| Toolbar 컨트롤 위치 | 컨트롤ID | 좌표 (As-Is) |
|---|---|---|
| top=0 / width=77 / height=21 / left=0 | edt_auth_list (Edit cssclass=edi_WF_Title1) | "전체 역할" / readonly / tabstop=false |
| top=0 / width=140 / height=21 / right=0 | edt_rolefilter (Edit) | 필터 입력 — onkeyup → V-801 (ds_role.filter) |
| top=0 / width=35 / height=21 / right=edt_rolefilter:0 | edt_auth_list2 (Edit cssclass=edi_WF_Title1) | "Role" |
| top=4 / width=234 / height=21 / right=0 | div_rightMenu (Div url=common right) | (xfdl Script 의 fn_commonRight_onload 호출 ✗ — 주석 처리 xfdl:380 — 외부 url include 만) |

---

## 4. 그리드 (G-NNN / GE1-NNN / GE2-NNN / LT-NNN — 기능설계서 §3.2 인용)

### 4.1 G-NNN 메인 그리드 (`grd_main`)

| 컬럼 | size (xfdl) | cell type (head / body) | format | 정렬 | 편집 | 필수 |
|---|---:|---|---|---|---|---|
| G-001 상태 | 48 (band=left) | head:displaytype=normal / body:displaytype=imagecontrol bind:STATUS / edittype=none | image (auto row state) | Center | N | - |
| G-002 역할 그룹 ID | 90 | head:text="역할 그룹 ID" edittype=none displaytype=normal / body:bind:ROLE_GROUP_ID textAlign=left | varchar | Left | Y (기본) | - |
| G-003 역할 그룹명 | 140 | head:text="역할 그룹명" / body:bind:ROLE_GROUP_NM | varchar | Left | Y | - |
| G-004 역할 그룹 설명 | 140 | head:text="역할 그룹 설명" / body:bind:ROLE_GROUP_DESC textAlign=left | varchar | Left | Y | - |
| ~~G-005 BIZ SYSTEM~~ | - | - | - | - | - | **To-Be 정책 #1 폐기** |
| G-006 사용구분 | 80 | head:text="사용구분" / body:bind:USE_TP | varchar | Center | Y | - |
| G-007 유효개시일 | 80 | head:text="유효개시일" / body:bind:START_ACTIVE_DATE displaytype=date | date(yyyy-MM-dd) | Center | Y | - |
| G-008 유효기한일 | 80 | head:text="유효기한일" / body:bind:END_ACTIVE_DATE displaytype=date | date(yyyy-MM-dd) | Center | Y | - |

> 그리드 옵션: head Row 1 + body Row 1 / `autofittype="col"` / `cellmovingtype="col"` / `cellsizingtype="col"` / `selecttype="cell"` / `autosizebandtype="allband"` / `autosizingtype="col"`. ds_main 의 `onrowposchanged` 가 자동 chain (Map+Role+Menu 3 회).

### 4.2 GE1-NNN 현재 역할 그리드 (`grd_sub1`)

| 컬럼 | size | head row 0 | body cell type / format | 정렬 | 편집 | 필수 |
|---|---:|---|---|---|---|---|
| GE1-001 (CHK) | 30 (band=left) | displaytype=checkboxcontrol edittype=checkbox / autosizecol=limitmin | bind:CHK / checkbox | Center | Y (checkbox) | - |
| GE1-002 역할 ID | 89 | text="역할 ID" autosizecol=limitmin | bind:ROLE_ID | Left | N (default) | - |
| GE1-003 역할명 | 140 | text="역할명" | bind:ROLE_NM textAlign=left | Left | N | - |
| GE1-004 부모역할 ID | 101 | text="부모역할 ID" | bind:PARENT_ROLE_ID (Q-010 — Mapper SELECT 절 누락) | Left | N | - |
| GE1-005 사용 여부 | 60 | text="사용 여부" | bind:USE_TP | Center | N | - |
| GE1-006 유효개시일 | 80 | text="유효개시일" | bind:START_ACTIVE_DATE displaytype=date | Center | N | - |
| GE1-007 유효기한일 | 80 | text="유효기한일" | bind:END_ACTIVE_DATE displaytype=date | Center | N | - |
| GE1-008 역할 그룹 ID | 80 | text="역할 그룹 ID" | bind:ROLE_GROUP_ID | Left | N | - |

> 그리드 옵션: head Row 1 + body Row 1 / `autofittype="none"` / `cellmovingtype="col"` / `cellsizingtype="col"` / `selecttype="row"` / `autoenter="select"` / `treeusebutton="no"` / `treeusecheckbox="false"` / `treeuseimage="false"` / `treeuseline="false"` / `autosizebandtype="allband"` / `autosizingtype="col"` / `cellsizebandtype="allband"` / `minheight="50"` / font=`12px/normal Malgun Gothic`. div 레벨에 `ondragmove` / `ondrop` 이벤트 등재 (xfdl:50 — 본문 핸들러 ✗).

### 4.3 LT 좌측 메뉴 트리 (`grd_M0F1`)

| 컬럼 | size | head text | body cell type | 정렬 | 편집 |
|---|---:|---|---|---|---|
| LT-001 메뉴 구조 | 182 | text="메뉴 구조" | bind:MENU_NM / displaytype=treeitemcontrol / edittype=tree / treelevel=`bind:LEV` / treestartlevel=0 | Left | Y (tree) |

> 그리드 옵션: head Row 1 + body Row 1 / `autofittype="col"` / `treeinitstatus="expand,all"` / `treeusebutton="use"` / `wheelscrollrow="2"` / `cssclass="grd_LF_Tree"` / width=250. 이벤트: oncellclick + onmousemove 모두 Script 본문 미정의 (Q-001 / Q-002).

### 4.4 GE2-NNN 전체 역할 그리드 (`grd_sub2`)

| 컬럼 | size | head row 0 | body cell type / format | 정렬 | 편집 | 필수 |
|---|---:|---|---|---|---|---|
| GE2-001 (CHK) | 48 (band=left) | displaytype=checkboxcontrol edittype=checkbox | bind:CHK / checkbox / autosizecol=limitmin | Center | Y (checkbox) | - |
| GE2-002 역할 ID | 105 | text="역할 ID" | bind:ROLE_ID | Left | N | - |
| GE2-003 역할명 | 120 | text="역할명" | bind:ROLE_NM textAlign=left | Left | N | - |
| GE2-004 부모역할 ID | 80 | text="부모역할 ID" | bind:PARENT_ROLE_ID textAlign=left (Q-010) | Left | N | - |
| GE2-005 사용여부 | 60 | text="사용여부" | bind:USE_TP | Center | N | - |
| GE2-006 유효개시일 | 80 | text="유효개시일" | bind:START_ACTIVE_DATE displaytype=date | Center | N | - |
| GE2-007 유효기한일 | 80 | text="유효기한일" | bind:END_ACTIVE_DATE displaytype=date | Center | N | - |

> 그리드 옵션: head Row 1 + body Row 1 / `autofittype="col"` / `cellmovingtype="col"` / `cellsizingtype="col"` / `selecttype="row"` / `autoenter="select"` / `treeinitstatus="expand,all"` / `treeusecheckbox="false"` / `treeuseimage="false"` / `treeuseline="false"` / `autosizebandtype="allband"` / `autosizingtype="col"` / `cellsizebandtype="allband"`. ds_role 의 `oncolumnchanged` 가 fn_setChkDs 호출 (head 동기화).

### 4.5 그리드 추가 동작 (UX)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| UX-001 | Master (G) 행 위치 변경 시 자동 chain 조회 (Map+Role+Menu 3 회) — reason=52 (rowposition 만 변경) 시 skip | ds_main onrowposchanged (xfdl:753) | 기능 §6.7 V-601~V-602 |
| UX-002 | GE1 / GE2 헤드 CHK 클릭 시 전체 행 CHK 토글 (gfn_setGridCheckAll) | grd_sub1 / grd_sub2 onheadclick | 기능 §6.8 V-701~V-702 |
| UX-003 | GE2 CHK 컬럼 변경 시 head row 0 의 text 자동 "1"/"0" 동기화 (전체 선택 상태 반영) | ds_role oncolumnchanged → fn_setChkDs | 기능 §6.8 V-703 |
| UX-004 | GE2 필터 입력 시 ds_role.filter (ROLE_ID 부분 일치) — 비어 있으면 filter clear | edt_rolefilter onkeyup | 기능 §6.9 V-801 |
| UX-005 | Master (G) 그리드 Ctrl+C 시 gfn_grdCopy_Paste 호출 | grd_main onkeydown (xfdl:790) | 분석 §4.6 #23 |
| UX-006 | onload 시 Detail 영역 비활성화 / 조회 후 rowcount > 0 일 때만 활성화 | CommRoleGrpMng_onload (xfdl:410) + fn_callBack searchCmRoleGrp (xfdl:534) | 기능 §6.11 V-1002 / V-1005 |
| UX-007 | 3 그리드 SelectedRow 색상 세팅 (red/blue) — onload 시 자동 | CommRoleGrpMng_onload (xfdl:411~413) | 기능 §6.11 V-1003 |
| ~~UX-008~~ | ~~onload 시 lov action 자동 호출~~ | - | ~~기능 §6.11 V-1004~~ (**To-Be 정책 #1 폐기** — BIZ SYSTEM 콤보 폐기로 lov action 자체 제거 / Q-005 / Q-008 자동 해소) |
| UX-009 (W5 F) | 화면 진입 (onMount) 시 `loadList(DEFAULT_FILTERS)` 자동 호출 — csa 자동조회 정책 (memory `feedback_csa_auto_search.md`) | `useEffect(() => { void loadList(DEFAULT_FILTERS); }, [])` | csa 7 화면 공통 W5 F |
| UX-010 (Round 3 — 2-chain) | Master (G) 행 선택 변경 시 **2-chain** 자동 호출 (`Promise.all([apiSearchCmRoleGrpMap, apiSearchCmRole])`) — Round 2 의 3-chain 中 `searchCmRoleGrpMenu` 폐기 | `useEffect(() => { loadSubGrids(roleGroupId); }, [selectedKey])` 내부 `Promise.all([rm, rl])` | Round 3 메뉴트리 폐기 정합 |
| UX-011 (Round 5) | Master 그리드 Cell 변경 시 PK ROLE_GROUP_ID 는 신규 행만 허용 — `nativeeditor_status !== "inserted"` 이면 변경 무시 | `handleDataChange` 내부 `if (fieldName === "ROLE_GROUP_ID" && r.nativeeditor_status !== "inserted") return;` | Round 5 PK 보호 |
| UX-012 (Round 5) | 신규 행 추가 시 `ROLE_GROUP_ID: ""` 강제 초기화 (사용자 직접 입력 강제 — V-004 필수 검증) + Detail 폼 readOnly false 활성 | `handleRowAdd` → `addRow({..., ROLE_GROUP_ID: "", nativeeditor_status: "inserted"})` | Round 5 PK 입력 보장 |

#### 4.5.1 2-chain auto load 상세 (Round 3 — UX-001 정정)

> **Round 2**: 3-chain (`searchCmRoleGrpMap` + `searchCmRole` + `searchCmRoleGrpMenu`).
> **Round 3 (2026-06-02 사용자 결정)**: 메뉴 트리 영역 제거에 따라 **2-chain 으로 축소** (`searchCmRoleGrpMap` + `searchCmRole`). `searchCmRoleGrpMenu` 호출은 FE 에서 제거 — BE action 본체는 보존.

| 단계 | 호출 | 트리거 |
|---|---|---|
| 1 | `apiSearchCmRoleGrpMap({ ROLE_GROUP_ID })` | `selectedKey` 변경 시 `useEffect` 내부 `Promise.all` |
| 2 | `apiSearchCmRole({ ROLE_GROUP_ID })` | (동시 호출) |
| ~~3~~ | ~~`apiSearchCmRoleGrpMenu({ ROLE_GROUP_ID })`~~ | **Round 3 제거** |

> `selected.nativeeditor_status === "inserted"` 인 신규 행 선택 시 2-chain skip (서버 미존재 PK 무의미).

---

## 5. 버튼 (toolbar / 그리드 셀) — 기능 §5.1 인용

### 5.1 본 화면 버튼 (B-NNN)

| 버튼ID | text | cssclass | width | 위치 | 동작 |
|---|---|---|---|---|---|
| B-001 | (아이콘) | btn_WFSA_Fold | 100% | top=93 / height=10 | `gfn_fold` — div_search 접기/펴기 |
| B-002 | (아이콘 — Shuttle Delete 모양) | btn_WF_ShuttleDeleteH | 24 | top=42 / height=31 / left=0 (within div_buttonGrp) | `fn_removeRoleMapRow` — GE1 의 CHK=1 행 제외 + saveCmRoleGrpMap DELETE. **To-Be 정정 (Q-006 해소)**: cssclass 의미와 동작 일치 |
| B-003 | (아이콘 — Shuttle Add 모양) | btn_WF_ShuttleAddH | 24 | top=1 / height=31 / left=0 (within div_buttonGrp) | `fn_appendRoleMapRow` — GE2 의 CHK=1 + ROLE_ID 비-null 행 추가 + saveCmRoleGrpMap INSERT. **To-Be 정정 (Q-006 해소)**: cssclass 의미와 동작 일치 |

### 5.2 외부 commonTopButton (EX-NNN)

| 버튼ID | 등록명 | 동작 |
|---|---|---|
| EX-001 | btn_search | `fn_search` → searchCmRoleGrp |
| EX-002 | btn_reset | `fn_reset` → gfn_setDivDefault |
| EX-003 | btn_save | `fn_save` (조건부 confirm 후) → saveCmRoleGrp |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| ~~EX-004~~ | ~~btn_close~~ | **Round 7 폐기** — As-Is `fn_close` → gv_AppTabPath.form.fn_closeForm(). To-Be 에서는 portal 탭 host 가 close 처리 — 화면 내부 닫기 ✗ |
| EX-005 | "사용자 관리" (link) | `fn_linkCommMenu` → fn_openMenu("csa/csa::CommObjMng", "") |

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
#### 5.2.1 PageLayout.buttons 3 종 (W5 E — Round 7 갱신)

> csa 8 화면 표준 W5 E — `PageLayout.buttons` 는 **상단 3 종 (btn_search / btn_reset / btn_save)** 만 등재. **Round 7 (2026-06-04~05)**: 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) → **3 버튼 표준 (조회/초기화/저장)** 으로 갱신. btn_close 폐기 사유: portal 탭 close 는 host 가 처리. EX-005 "사용자 관리" 외부 화면 이동 링크는 PageLayout 외 별도 영역 또는 미구현 (As-Is xfdl commonTopButton 정합 우선).

| 버튼 | onClick | disabled 정책 (J-004 정합 — RBAC 권한 활성, 사전 disabled 제거) |
|---|---|---|
| 조회 (btn_search) | `handleSearch` → `loadList(filters)` | `isSearching || isSaving` 만 |
| 초기화 (btn_reset) | `handleReset` → `setFilters(DEFAULT_FILTERS)` | `isSearching || isSaving` 만 |
| 저장 (btn_save) | `handleSave` → V-004 + `apiSaveCmRoleGrp` | `isSearching || isSaving` 만 (행 선택 없어도 클릭 허용 — 클릭 시 validation) |
| ~~닫기 (btn_close)~~ | **Round 7 폐기** — unused `handleClose` dead code 제거 | (PageLayout buttons 배열에서 entry 삭제) |

#### 5.2.2 W5 G — END_OF_TIME=00:00:00 (BE 정책)

> BE Service 의 신규/재등록 시 `END_ACTIVE_DATE` 기본값. commUserMng J-011 / iter#3 결정 (`feedback_design_thoroughness.md` 정합) 동일 패턴 본 화면 적용.

| 항목 | 값 |
|---|---|
| START_ACTIVE_DATE 기본값 | `LocalDate.now().atStartOfDay()` = `today 00:00:00` |
| END_ACTIVE_DATE 기본값 | `LocalDateTime.of(9999, 12, 31, 0, 0, 0)` (**00:00:00** — 23:59:59 ✗) |
| 근거 | As-Is xfdl `"99991231"` 8자 + Oracle DATE 자동 변환 시 시분초 = 00:00:00. 정합 위해 ToBe 도 동일 |

### 5.3 외부 commonLeftButton (EX2-NNN — div_mainGrd 좌측)

| 버튼ID | 등록명 | 동작 |
|---|---|---|
| EX2-001 | chk_check | (공통 left 기본 토글) |
| EX2-002 | btn_sum | (공통 left 기본 합계) |
| EX2-003 | btn_copyPaste | (공통 left 기본 복사/붙여넣기) |

### 5.4 외부 commonRightButton (EX3-NNN — div_mainGrd 우측)

| 버튼ID | 등록명 | 동작 |
|---|---|---|
| EX3-001 | btn_rowAdd | `fn_rowAdd` — ds_main.addRow + 기본값 자동 세트 (USE_TP=Y / START=today / END=99991231 / ROLE_GROUP_ID prefix) |
| EX3-002 | btn_rowDelete | `fn_rowDelete` — USER_MAPPING 종속 검증 + gfn_deleteRow |
| EX3-003 | btn_rowCopy | `fn_rowCopy` — gfn_rowcopyData |
| EX3-004 | btn_rowCancel | `fn_rowCancel` — gfn_grdInit |

### 5.5 그리드 셀 인라인 버튼 (GB-NNN)

해당 없음 — 본 화면 그리드 셀에 ButtonField / displaytype="button" ✗.

---

## 6. 팝업 (P-NNN — 기능 §9 인용)

해당 없음 — 본 화면에 modal 팝업 호출 없음. 외부 화면 이동 1 건 (EX-005 "사용자 관리" 메뉴) 만 존재.

| 연계 ID | 종류 | 화면 (xfdl url) | 트리거 | 전달 | 반환 처리 |
|---|---|---|---|---|---|
| EX-005 | 외부 화면 이동 | (메뉴 ID `csa/csa::CommObjMng`) | EX-005 (commonTop 링크 "사용자 관리") | (없음 — pArg="") | (외부 메뉴 화면 / callback ✗) |

---

## 7. 메시지 표기 (기능 §10 인용)

### 7.1 표기 위치별

| 위치 | 메시지 종류 | 컴포넌트 |
|---|---|---|
| confirm 모달 | M-001 ("저장하시겠습니까?") | `gfn_message("","","...","confirm","확인",callback)` — To-Be `ConfirmModal` 등가 |
| info 모달 | M-008 ("저장 되었습니다.") | `gfn_message("","","...","info","확인",callback)` — To-Be `InfoModal` 등가 |
| error 모달 | M-003 ("현재 연결된 역할이 존재 합니다. 삭제 후 처리하세요.") | `gfn_message("","","...","error","")` — To-Be `ErrorModal` 등가 |
| warning 모달 | M-004 ("연결된 사용자가 존재합니다...") / M-005 ("선택 행이 없습니다.") / M-006 ("선택된 Role 그룹 ID가 없습니다.") / M-009 ("메뉴가 존재하지 않습니다.") | `gfn_message("","","...","warning","","")` — To-Be `WarningModal` 등가 |
| information 모달 | M-002 ("저장할 데이터가 없습니다.") | `gfn_message("","","...","information","")` — To-Be `InformationModal` 등가 |
| 하단 status bar | M-007 ("{N}건 조회 되었습니다.") | `div_bottom.form.fn_commonBottomStatus_msg(text)` — To-Be `StatusBar` 등가 |
| gfn 표준 메시지 | M-010 (gfn_cpRequired 의 표준 메시지) | gfn 라이브러리 |

### 7.2 색상 / 강조

| 컴포넌트 | cssclass | 색상 의미 |
|---|---|---|
| div_search 박스 | div_WFSA_Box | 조회조건 영역 박스 |
| Static 라벨 (S-NNN) | edi_WFSA_Label | 조회조건 라벨 (회색) |
| Detail 라벨 (D-NNN, 첫 번째) | edi_WF_LabelFirstE | D-001 — Essential (필수) + 첫 번째 (테두리) |
| Detail 라벨 (D-NNN, 일반) | edi_WF_Label | D-002~D-007 |
| Detail 라벨 (D-005 첫 번째 그룹) | edi_WF_LabelFirst | D-005 USE_TP (라디오) |
| Detail 입력 (D-001 / D-002) | Essential | Essential — 필수 (배경 강조) |
| 그리드 타이틀 (edt_rol_grp_list / edt_roleMapList / edt_auth_list / edt_auth_list2) | edi_WF_Title1 | 그리드 옆 영역 타이틀 |
| ExclusiveGateway 분기 강조 (BPMN 시각) | (bpmn ext:style shapeBackground="#ffff00") | 노랑 — As-Is BPMN 시각 보존 |
| 그리드 SelectedRow 색상 | (gfn_gridSelectedRow "red"/"blue") | 그리드 행 선택 색상 (red 마우스 hover / blue 선택) |
| Static 박스 (Detail) | stc_WF_Box / stc_WF_BoxFirst | Detail 입력 행 배경 박스 |
| Footer | div_WF_Footer | 하단 상태 영역 |
| Fold 버튼 | btn_WFSA_Fold | 접기 토글 |

---

---

## 8. W5 A~G 패턴 종합 (csa 8 화면 표준 — 2026-06-04 동기화)

> csa 8 화면 공통 W5 패턴 본 화면 본문 직접 등재. 메모리 `project_csa_cme_iter_propagation.md` + commUserMng J-001~J-013 정합. **본 §8 은 §1~§7 의 각 sub-section 참조 인덱스만 제공하고 정본은 해당 §에 직접 위치한다**.

| 패턴 | 정의 | 본 화면 정본 위치 | Round 결정 일자 |
|---|---|---|---|
| **A** — 좌메인 + 우Detail 비율 | Row1 = `<ContentPanel>` (flex:1) + `<ContentPanel width=430>` 2 패널 | §1.2.1 / §3.3 / §3.4 | Round 2 (2026-06-02 사용자 결정) |
| **B** — Detail 헤더 정렬 | wrapper `marginTop=32` + 28 px gray header "상세 정보" + table cell 본문 | §1.2.2 / §3.4.3 | Round 2 (2026-06-02 사용자 결정) |
| **C** — form row alignment | 1 행 = 1 `<tr>` (`<th>` 라벨 + `<td>` 입력) — `DETAIL_TABLE_STYLE` / `DETAIL_LABEL_CELL` / `DETAIL_VALUE_CELL` | §3.4.1 | Round 2 (2026-06-02) |
| **D** — editable:false 전체 + 코드 라벨 | Master 그리드 `ROLEGRP_COLUMNS` 의 `editable: false` 전체 컬럼 적용. Detail 폼에서만 양방향 bind. | §4.1 / §4.5 UX-010~012 | Round 2 (2026-06-02) — commUserMng J-010 정합 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| **E** — commonTopButton 3 (Round 7 갱신) | PageLayout.buttons = [조회 / 초기화 / 저장] **3 종**. RBAC 권한 기반 활성화, 사전 disabled 제거 (J-004 정합). **Round 7 (2026-06-04~05)**: btn_close 폐기로 4 → 3 (portal 탭 host close 처리) | §5.2.1 | Round 2 (2026-06-02 — 4 버튼 초안) / **Round 7 (2026-06-04~05 — 3 버튼 갱신)** |
| **F** — csa 자동조회 | onMount `useEffect` → `loadList(DEFAULT_FILTERS)` 자동 호출 (memory `feedback_csa_auto_search.md`) | §4.5 UX-009 | Round 2 (2026-06-02 사용자 결정) |
| **G** — END_OF_TIME 00:00:00 | BE 신규/재등록 시 `END_ACTIVE_DATE = 9999-12-31 00:00:00` (23:59:59 ✗) | §5.2.2 | Round 2 (2026-06-02) — commUserMng J-011 정합 |

### 8.1 Round 별 변경 일자

| Round | 일자 | 사용자 결정 인용 | 변경 요지 |
|---|---|---|---|
| Round 1 | 2026-05-29 | 초안 작성자 결정 | 5 패널 As-Is 1:1 (메인+Detail / 메뉴트리+sub1+셔틀+sub2) |
| Round 1.1 | 2026-05-31 | 분석리포트 §12 결정 누적표 15 행 | Q 12 건 일괄 해소 (정책 #1 / Q-006 / lov 폐기 등) |
| **Round 2** | **2026-06-02** | "AsIs/ToBe 레이아웃 완전 불일치 — AsIs 1:1 재개발" | 기존 ToBe 폐기, shared `<Tree>` 도입, 4분할 채택, **3-chain auto load** |
| **Round 3** | **2026-06-02** | "메뉴 구조 트리 영역 제거" | Row2 4분할 → 3분할, FE searchCmRoleGrpMenu 호출 제거 (BE action 보존), Tree import 제거, **3-chain → 2-chain** |
| **Round 5** | **2026-06-02** | "ROLE_GROUP_ID 는 신규 행만 편집 가능" | PK readOnly inserted 만, updateDetailField PK guard, Input readOnly 일관 적용 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| Round 6 | 2026-06-04~05 | (csa 8 화면 일괄 PK readOnly 라운드 — 본 화면 N/A) | 본 화면은 Round 5 에서 이미 적용 — 본 라운드 본 화면 추가 변경 ✗ |
| **Round 7** | **2026-06-04~05** | "btn_close 완전 제거 — portal 탭 host close 처리" | PageLayout.buttons 4 → **3 종** (조회/초기화/저장), unused handleClose dead code 제거, 가이드 §6-E 4 → 3 버튼 표준 갱신 |

---

## §-1. §6.14 Phase 종료 자동 고해성사 4 질문

| # | 질문 | 답변 |
|---|---|---|
| 1 | 14항 위반? | No — 분석리포트 갱신본 1:1 인용. S 3 활성 (1 폐기) / G 7 활성 (1 폐기) / GE1 8 / LT 1 / GE2 7 / D 6 활성 (1 폐기) / B 3 / EX 4 활성 (EX-004 btn_close Round 7 폐기) + EX2 3 + EX3 4 모두 분석 행수 일치 |
| 2 | 검증 안 한 부분? | No — Q 12 건 해소 결정 (2026-05-31) §1.2 / §2.2 / §3.2 / §3.3 / §3.4 / §3.6 / §4.1 / §4.5 / §5.1 본문 직접 반영. 셔틀 cssclass 정정 (Q-006) 명시. **2026-06-02 Round 2/3/5 + 2026-06-04 W5 A~G 패턴 §8 신규 직접 등재 + 2026-06-04~05 Round 6 (N/A) + Round 7 btn_close 폐기 §1.2 / §5.2 / §5.2.1 / §8 / §8.1 반영** |
| 3 | 그대로 수용? | Yes — 정책 #1 (BIZ SYSTEM 콤보 제거) + Q-006 셔틀 정정 + lov action 폐기 + Round 2 AsIs 1:1 재개발 + Round 3 메뉴트리 제거 + Round 5 PK readOnly inserted 만 + **Round 7 btn_close 완전 제거 (W5 E 4 → 3 버튼)** 모두 수용 |
| 4 | 임의 합리화? | No — 가이드 §외 임의 신설 없음. 디자인설계서 §1~§8 표준 절 구조 유지 + Q-NNN 12 건 해소 결정 + Round 2/3/5/6/7 + W5 A~G 본문 직접 반영 |

> 4 질문 모두 통과 → Phase 3 디자인설계서 작성 완료. **2026-05-31 Q 12 건 해소 / 2026-06-02 Round 2 + 3 + 5 적용 / 2026-06-04 W5 A~G 패턴 §8 등재 / 2026-06-04~05 Round 6 (N/A) + Round 7 btn_close 폐기 동기화 완료**.
