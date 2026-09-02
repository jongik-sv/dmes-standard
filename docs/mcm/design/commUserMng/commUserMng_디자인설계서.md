---
screenId: commUserMng
asIsId: CommUserMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
갱신일: 2026-06-05
작성자: Agent
---

# mcm — 사용자 관리 디자인설계서

> **Frontend 개발 연계 값** (기능설계서 §1.2 와 동일):
> - mesModule = `m-mcm` / moduleGroup = `csa` / pageName = `commUserMng` / pageId = `commUserMng` / 페이지 유형 = **D 다중 그리드 + 상세 폼 + 모달** / tsup entry key = `pages/csa/commUserMng`
>
> **명명 룰**: MES 단일 룰 (mcm 모듈 — APS 예외 미적용). 4 식별자 1byte 동일.
>
> **인용 정본**: 분석리포트 §3 (UI 컴포넌트 전수) + §17 (As-Is 1:1 컬럼 단위 행 분해) + 기능설계서 §3 (S/G/GR/GL) + §4 (D/DP) + §5 (B). 자체 추가 ✗.
>
> **2026-05-31 갱신**: 분석 §11 6 정책 결정 반영 (Q 13건 해소). 정책 #3 (D) (D-013/014/015 콤보 신규 미반영) / 정책 #2 (부서 LoV 출처 전환) / 정책 #3 (F) (Pwd 변경 페이지 신규) 본문 본 디자인설계서 §3.4 / §4.1 / §6 / §7 반영. 정책 #4 (0) As-Is/To-Be 표준 우선 원칙.
>
> **2026-06-04 갱신 (Round 5 — 사용자 검수 결과)**: 본 화면이 W5 reference (다른 csa 7 + cme 1 화면이 본 화면 패턴 정합) 로 확정. (1) Detail D-007 부서코드: 직접 타이핑 ✗ → readOnly + 검색 버튼 + shared `LookupModal` (DEPT_CD/DEPT_NM 컬럼) + 선택 시 DEPT_CD + DEPT_NM 두 컬럼 동시 자동 세트. BE 신규 action `searchDeptLov` (DTO + Service + Repository + BPMN serviceTask) — §3.4 / §3.4.4 / §4.1 G-008 / §5.4 / §6 P-002 / §J.8 본문 반영. (2) USER_ID 컬럼은 inserted 신규 행에서만 편집, 기존 행 readOnly = 이전 iter 에 이미 적용된 W5 reference. (3) DataInitializer `seedMcmDeptInfo` 4 row 추가 (DEPT_004 인사팀 / DEPT_005 재무팀 / DEPT_006 영업1팀 / DEPT_007 품질관리팀) → 총 7 row — §6 P-002 + 정합체크서 §J.8 본문 반영.
>
> **2026-06-04 갱신 (Round 6 — 계정생성/수정/계정삭제 3 버튼 → "저장" 1 버튼 통합)**: B-001 계정생성 / B-004 수정 / B-002 계정삭제 3 버튼 → **"저장" 1 버튼 통합 (`saveCmUser` 단일 action)**. master row 의 `nativeeditor_status` 별 applyInsert / applyUpdate / applyDelete 분기. END_ACTIVE_DATE sentinel `9999-12-31` 감지 시 applyDelete 가 today 로 정정 (계정삭제 동작 fix). Detail 의 정보처리의뢰서 (D-019) / 처리사유 (D-020) **제거** — §3.4 / §4.1 / §5.1 / §6 본문 반영.
>
> **2026-06-05 갱신 (Round 7 — btn_close 완전 제거)**: AsIs xfdl `btn_close` (commonTop basic 4 의 마지막) → ToBe 에서 **완전 제거**. PageLayout buttons 배열에서 `btn_close` entry 삭제, unused `handleClose` dead code 제거. 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) → ToBe **3 버튼 표준 (조회/초기화/저장)**. 사유: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼은 의미 ✗. §5.1 본문 반영.

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
- 표시 형식 (MES 단일 룰): `mcm:commUserMng`
- moduleId 정본: 01 A.1 (업무 페이지는 `portal` 금지)

### 1.2 화면 설계 대상 영역 (PageLayout 기반)

```
┌─────────────────────────────────────────────────────────────────┐
│ PageLayout.title = "사용자 관리"                                 │
│ <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> │
│ PageLayout.buttons = [B-003 조회 / B-NEW 초기화 / B-004 저장]    │
│   (Round 6: 계정생성/수정/계정삭제 → "저장" 1 버튼 통합           │
│    Round 7: btn_close 완전 제거 → 3 버튼 표준)                   │
│  ├─ SearchArea  (A-FILTER)                                       │
│  │    └─ SearchField × 1 (S-001 사용자 TextBox)                  │
│  │    └─ Select × 2  (S-002 사용 여부 / S-003 내부 외부 구분)     │
│  ├─ FoldButton (B-006 div_search 접기/펴기)                       │
│  └─ ContentBody (MAIN — 좌·중·우 3 단)                            │
│        ├─ ContentPanel-LEFT  (A-MAIN-LEFT)                        │
│        │     ├─ Toolbar [edt_srch_cseq "조회 결과" 라벨 + B-007    │
│        │     │           (commonLeft) + B-008 (commonRight)]      │
│        │     └─ AgDataGrid (Main G-001~G-017)                     │
│        ├─ ContentPanel-CENTER (A-MAIN-CENTER / A-DETAIL)          │
│        │     └─ DetailForm (D-001~D-020) + Buttons (B-013/14/15/16)│
│        └─ ContentPanel-RIGHT (A-MAIN-RIGHT — 상하 2 단)            │
│              ├─ Top (A-MAIN-RIGHT-TOP / A-GR)                     │
│              │   ├─ Toolbar [B-009/B-010 commonRight]             │
│              │   └─ AgDataGrid (UserRoleGrp GR-001~GR-002)        │
│              └─ Bottom (A-MAIN-RIGHT-BOT / A-GL)                  │
│                  ├─ Toolbar [B-011/B-012 commonRight]             │
│                  └─ AgDataGrid (RoleGrpList GL-001~GL-002)        │
│  └─ Modal (A-POPUP-DEL — B-002 트리거)                            │
│        └─ DeleteConfirmModal (DP-001~DP-006 + B-017/B-018)        │
└─────────────────────────────────────────────────────────────────┘
```

| 영역 | 담당 컴포넌트 | 비고 |
|---|---|---|
| SIDEBAR / HEADER / TabsBar | portal PortalShell | 화면별 설계 대상 아님 |
| 페이지 타이틀 / 상단 버튼바 | `PageLayout` `title` / `buttons` | `title` = "사용자 관리" / **`buttons` = [조회 / 초기화 / 저장] 3 버튼 표준** (2026-06-04~05 Round 6~7 — Round 6 계정생성/수정/계정삭제 → "저장" 1 버튼 통합 + Round 7 btn_close 완전 제거) |
| A-FILTER (조회조건) | `SearchArea` + `SearchField` × 1 + `Select` × 2 | `@dk-oasis/shared/layout` |
| MAIN (콘텐츠) | `ContentBody` + `ContentPanel` × 3 (좌·중·우 3단, 우측은 상하 2단) | `@dk-oasis/shared/layout` |
| 그리드 (Main / GR / GL) | `AgDataGrid` (+ `useGridDataManager`) | `@dk-oasis/shared/grid` |
| 상세 폼 (D-001~D-020) | `DetailForm` + `TextField` / `DatePicker` / `Select` / `RadioGroup` | `@dk-oasis/shared/form` |
| 부서 팝업 (P-002) | **shared `LookupModal` (2026-06-04 Round 5 확정)** — Detail 직접 타이핑 ✗ → readOnly Input + 검색 버튼 + LoV 모달. 출처 `MCMAPUSER.TB_MCM_DEPT_INFO` (정책 #2 / Q-002 해소). BE action 신규 `searchDeptLov` (DTO + Service + Repository + BPMN serviceTask) — 응답 컬럼 DEPT_CD / DEPT_NM. 선택 확정 시 DEPT_CD + DEPT_NM 두 컬럼 동시 자동 set. | `@dk-oasis/shared/lookup` |
| 계정삭제 모달 (P-001 / A-POPUP-DEL) | `Modal` | `@dk-oasis/shared/modal` |
| 비밀번호 변경 페이지 (P-003) | **신규 별도 페이지 `m-mcm/app/password-change/page.tsx` (정책 #3 (F) / Q-013 해소 / T-012)** | (외부 — Next.js) |

---

## 2. 화면 레이아웃

### 2.1 레이아웃 유형 + 페이지 유형 자동 결정

| 항목 | 값 |
|---|---|
| **페이지 유형 (자동 결정)** | **D 다중 그리드 + 상세 폼 + 모달** (분석 §3 — G=17 + GR=2 + GL=2 + D=20 + DP=6 → 모두 충족) |
| **레이아웃 유형** | **좌·중·우 3단 분할형** (As-Is xfdl: div_mainGrd right=760 / div_mainDetail width=430 / div_roleGrpId+div_roleGrpIdList right=20 — 3 컬럼 동시 표시) |
| **참조 화면** | (없음 — `-`) |

### 2.2 메인 영역 구조도 (As-Is 좌표 1:1 보존)

```
top=0 ──────────────────────────────────────────────────────  left=20, right=20
│ A-TITLE (div_title, height=40)                              │
│  edt_title "사용자 관리"  │  commonTopButton (5 buttons)     │
top=div_title:10 ────────────────────────────────────────────
│ A-FILTER (div_search, height=43, cssclass=div_WFSA_Box)     │
│  [사용자] [edt_USER_ID] [사용 여부] [cbo_USE_TP]              │
│  [내부 외부 구분] [cbo_IN_OUT_EMP_TP]                         │
top=93 ─────────────────────────────────────────────────────
│ B-006 btn_fold (height=12, 접기 토글)                        │
top=btn_fold:20 ────────────────────────────────────────────
│ A-MAIN (div_main, bottom=40, 좌·중·우 분할)                  │
│ ┌───────────────┬─────────────────┬─────────────────────┐  │
│ │ A-MAIN-LEFT   │ A-MAIN-CENTER   │ A-MAIN-RIGHT (상하)  │  │
│ │ (div_mainGrd) │ (div_mainDetail)│                      │  │
│ │ right=760      │ width=430        │ left=div_mainDetail:10│
│ │ ┌─Tool─────┐ │ ┌─Form─────────┐│ ┌── Top (height=291)─┐│ │
│ │ │edt_srch_  │ │ │D-001 사용자ID││ │A-MAIN-RIGHT-TOP    ││ │
│ │ │ cseq      │ │ │D-002 사원번호 ││ │(div_roleGrpId)     ││ │
│ │ │"조회결과" │ │ │D-003 SSO ID  ││ │┌── Toolbar ──────┐ ││ │
│ │ │div_left   │ │ │D-004 사용자명 ││ ││B-009 역할삭제   │ ││ │
│ │ │div_right  │ │ │D-005 유효개시 ││ ││B-010 역할저장   │ ││ │
│ │ └──────────┘ │ │D-006 유효기한 ││ │└────────────────┘ ││ │
│ │ ┌─Grid──────┐│ │D-007 부서코드 ││ │┌── Grid ────────┐ ││ │
│ │ │grd_main   ││ │ (commonDynamic)││ ││grd_userRolegrp │ ││ │
│ │ │head 1줄+   ││ │D-008 분류CD   ││ ││GR-001/GR-002   │ ││ │
│ │ │body N      ││ │D-009 이메일* ││ │└────────────────┘ ││ │
│ │ │G-001 STATUS││ │D-010 전화번호 ││ └────────────────────┘│ │
│ │ │G-002 USER_ID││ │D-011 모바일  ││ ┌── Bot (bottom=0)──┐│ │
│ │ │... G-017   ││ │D-012 내부외부*││ │A-MAIN-RIGHT-BOT     ││ │
│ │ │            ││ │D-013~015 그룹 ││ │(div_roleGrpIdList) ││ │
│ │ │            ││ │D-016 PWD 라디오││ │┌── Toolbar ─────┐ ││ │
│ │ │            ││ │D-017 ROLE 복사││ ││B-011 역할추가  │ ││ │
│ │ │            ││ │D-018 SSO 라디오││ ││B-012 역할조회  │ ││ │
│ │ │            ││ │D-019 의뢰서   ││ │└───────────────┘ ││ │
│ │ │            ││ │D-020 처리사유 ││ │┌── Grid ────────┐ ││ │
│ │ │            ││ │ B-013 PWD 초기││ ││grd_rolegrpList │ ││ │
│ │ │            ││ │ B-014 ROLE등록││ ││GL-001/GL-002   │ ││ │
│ │ │            ││ │ B-015 SSO 초기││ │└───────────────┘ ││ │
│ │ │            ││ │ B-016 재생성 ││ └────────────────────┘│ │
│ │ └────────── ┘│ └────────────┘│                       │ │
│ └───────────────┴─────────────────┴────────────────────┘  │
bottom=40 ──────────────────────────────────────────────────
│ A-FOOTER (div_bottom, height=20, cssclass=div_WF_Footer)    │
│  commonBottomStatus.xfdl include                            │
bottom=0 ───────────────────────────────────────────────────

(modal overlay)
┌─ A-POPUP-DEL (div_deletePopup, visible=false 기본) ────┐
│ top=270 / left=415 / width=470 / height=273           │
│ border=2px solid #D6e2ea                              │
│ ┌─ DP-001 edt_title "계정삭제" ───────────────┐       │
│ │ DP-002 img_MsgImg + DP-003 sts_message      │       │
│ │ DP-004 cal_end_active_date "유효개시기한일" │       │
│ │ DP-005 edt_infReqNo "정보처리의뢰서번호"    │       │
│ │ DP-006 edt_description "처리사유"           │       │
│ │ B-017 취소 (btn_close)  B-018 확인 (btn_save)│       │
│ └────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────┘
```

---

## 3. 영역별 배치 상세

### 3.1 영역 크기 및 배치

| 영역 | 높이 | 너비 | 스크롤 | 리사이즈 | 비고 |
|---|---|---|---|---|---|
| A-TITLE | 40 px 고정 | 100% (left=20 / right=20) | 없음 | N | div_title (xfdl:260) |
| A-FILTER | 43 px 고정 | 100% (left=20 / right=20) | 없음 | N (btn_fold 로 접기/펴기 토글) | div_search (xfdl:268) |
| A-FOLD | 12 px 고정 | 100% (left=20 / right=20) | 없음 | N | btn_fold (xfdl:7) |
| A-MAIN | 가변 (top=btn_fold:20 / bottom=40) | 100% (left=20 / right=20) | (자식 별) | Y (xfdl 좌·중·우 비율 고정) | div_main (xfdl:8) |
| A-MAIN-LEFT (Main) | A-MAIN 동일 | **flex=1 (가변, As-Is xfdl right=760 등가 — 좌측 다컬럼 그리드 우선)** | 세로 (grd_main) | N | div_mainGrd (xfdl:11) |
| A-MAIN-CENTER (Detail) | A-MAIN 동일 | **width=480 px 고정 (As-Is xfdl width=430 + 자체 헤더 "상세 정보" 패딩 50 = 480)** | formscrollbartype="none none" | N | div_mainDetail (xfdl:87) |
| A-MAIN-RIGHT-TOP (GR) | **상하 1:1 가변 (보유역할그룹 vs 추가가능역할그룹 동일 분할 — As-Is 291px 고정 → ToBe flex)** | **width=380 px 고정 (As-Is xfdl: 역할 그룹 ID + 역할 그룹명 2 컬럼 폭 정합)** | 세로 (grd_userRolegrp) | N | div_roleGrpId (xfdl:199) |
| A-MAIN-RIGHT-BOT (GL) | 상하 1:1 가변 | width=380 px 고정 (상단과 동일) | 세로 (grd_rolegrpList) | N | div_roleGrpIdList (xfdl:228) |
| A-POPUP-DEL | 273 px 고정 | 470 px 고정 (left=415 / top=270) | 없음 | N (visible toggle) | div_deletePopup (xfdl:280) |

#### 3.1.1 ToBe 너비 정책 변경 이력 (2026-06-02)

| 일자 | 변경 | 사유 |
|---|---|---|
| 2026-06-01 (초기) | 3 패널 모두 `flex=1` (균등 분할) | shared `ContentPanel` 기본값 사용 |
| **2026-06-02 (iter#2)** | **Left=flex:1 / Center=480px 고정 / Right=380px 고정** | **사용자 검수 결과 As-Is 비율 미반영. 좌측 그리드가 다컬럼(상태/사용자ID/사번/SSO ID/사용자명/유효개시일/유효기한일/부서코드/사용자분류코드/사용여부/이메일/전화번호/모바일번호/내부외부/그룹1/2/3) 인데 우측 역할그룹은 2 컬럼만 표시 → 좌측을 가장 넓게, 우측을 가장 좁게 조정 (As-Is xfdl right=760 + width=430 + right=20 등가)** |
| **2026-06-02 (iter#2)** | **Detail 패널 상단에 자체 헤더 "상세 정보" (height=32px / 회색 배경 #f4f6f8) 추가** | **사용자 검수: 양 그리드의 grid-panel-header (32px) 와 Detail 의 시작 Y 좌표 차이로 가운데가 위로 툭 튀어나오는 시각 결함. 양 그리드 헤더와 동일 높이 wrapper 추가로 정렬.** |
| **2026-06-02 (iter#3)** | **Detail 헤더 2 줄 구조로 변경 — line 1 = grid-panel-header 자리 (32px 빈) + line 2 = grid column-header 자리 (28px "상세 정보")** | **iter#2 의 단일 32px 헤더는 grid-panel-header 와만 정렬됨 → grid column-header (사용자ID*\|사번*\|...) 라인과는 불일치. 사용자 검수 J-008: Detail 의 "상세 정보" 라벨이 양 그리드의 컬럼 헤더 라인 (사용자ID*) 과 정확히 정렬되어야 함. 2 줄 헤더로 양쪽 그리드의 32+28 = 60px 헤더 영역과 1:1 매칭.** |
| **2026-06-02 (iter#4)** | **Detail wrapper outer background + line 1 background + 폼 본문 div background 모두 #f4f6f8 회색으로 통일 (table cell 만 흰색 — DETAIL_VALUE_CELL 정본)** | **iter#3 의 line 1 (panel-header 자리, 32px) 이 흰색이라 양 그리드의 panel-header 회색과 색 불일치 + 폼 본문 끝난 후 ContentPanel 의 흰색 영역이 보기 싫음. 사용자 검수 J-012: wrapper 전체를 회색화하여 흰 빈공간 ✗.** |

#### 3.1.2 ToBe Detail 영역 배경색 체계 (2026-06-02 iter#4)

```
┌──────────────────────────────────────────────────────────────┐ outer wrapper
│ background: #f4f6f8 (회색 — 양 그리드 panel-header 와 동일)    │
│ border: 1px solid #d4dae0                                     │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐ │ line 1 (panel-header 자리, 32px)
│ │ background: #f4f6f8 / 텍스트 없음                          │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │ line 2 (column-header 자리, 28px)
│ │ background: #f4f6f8 / "상세 정보" 라벨 (fontWeight: 600)   │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │ 폼 본문 영역 (flex:1)
│ │ background: #f4f6f8                                        │ │
│ │ ┌─table 행──────────────────────────────────────────────┐ │ │
│ │ │ th (라벨) #f4f6f8 │ td (값 cell) #fff                   │ │ │  ← table cell 만 흰색
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │   ...                                                       │ │
│ │ ┌─table 행──────────────────────────────────────────────┐ │ │
│ │ │ th (라벨) #f4f6f8 │ td (값 cell) #fff                   │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │ (폼 끝난 후 빈 영역도 #f4f6f8 — 흰색 빈 공간 ✗)            │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

(2026-06-02 iter#4 사용자 검수 J-012 결과 반영) — 흰색 영역은 오직 form table 의 값 cell (`DETAIL_VALUE_CELL` 정본) 만. 나머지 모든 영역 = 회색 (#f4f6f8) → 양 그리드의 panel-header / column-header 배경과 통일된 시각.


| A-FOOTER | 20 px 고정 | 100% (left=20 / right=20) | 없음 | N | div_bottom (xfdl:6) |

### 3.2 A-FILTER 내부 배치 (좌표 As-Is 1:1)

```
top=10 ─────────────────────────────────────────────────────────────────────
│ [사용자] [edt_USER_ID] [내부 외부 구분]                                     │
│ left=10  left=sts_userId:10  left=edt_USER_ID:20                            │
│ width=60 width=160           width=100                                       │
│ [cbo_IN_OUT_EMP_TP] [사용 여부] [cbo_USE_TP]                                 │
│ left=370            left=cbo_INOUT:20  left=sts_useTp:10                     │
│ width=80            width=70           width=80                              │
top=30 ─────────────────────────────────────────────────────────────────────
```

| 컨트롤 | 정확한 xfdl 좌표 | cssclass | 비고 |
|---|---|---|---|
| sts_userId (S-001 라벨) | left=10 / top=10 / width=60 / height=21 | edi_WFSA_Label | "사용자" |
| edt_USER_ID (S-001 입력) | left=sts_userId:10 / top=10 / width=160 / height=21 | (없음) | maxlength=100 |
| sts_InOutTp (S-003 라벨) | left=edt_USER_ID:20 / top=10 / width=100 / height=21 | edi_WFSA_Label | "내부 외부 구분" |
| cbo_IN_OUT_EMP_TP (S-003 입력) | left=370 / top=10 / width=80 / height=21 | (없음) | innerdataset=ds_inOutEmpTp, value="", index=-1 |
| sts_useTp (S-002 라벨) | left=cbo_IN_OUT_EMP_TP:20 / top=10 / width=70 / height=21 | edi_WFSA_Label | "사용 여부" |
| cbo_USE_TP (S-002 입력) | left=sts_useTp:10 / top=10 / width=80 / height=21 | (없음) | innerdataset=ds_useTp, value="Y", text="Y", index=0 |

### 3.3 A-MAIN-LEFT 내부 배치 (Main 영역)

```
top=0 ──────────────────────────────────────────────────────────────────  right=0
│ Toolbar (top=0, height=21)                                              │
│ ┌──────────────────────────────────────────────────────────────────┐  │
│ │ edt_srch_cseq "조회 결과" │ div_leftMenu (chk_check/btn_sum/btn_copyPaste) │
│ │ left=0 width=77             left=edt_srch_cseq:5 width=223         │
│ │                                          div_rightMenu (btn_rowAdd / btn_rowCancel) │
│ │                                          right=0 width=280         │
│ └──────────────────────────────────────────────────────────────────┘  │
top=25 ──────────────────────────────────────────────────────────────────
│ grd_main (binddataset=ds_main, taborder=0)                              │
│  Format: head 1줄 (24px) + body 1줄 (24px) / Column 17개                 │
│  Columns: 48/117/101/80/80/80/80/80/96/71/96/96/94/80/80/80/80           │
│                                                                          │
│  Head row 0: 상태│사용자ID│사번│SSO ID│사용자명│유효개시일│유효기한일│ │
│              부서코드│사용자분류코드│사용구분│EMAIL│전화번호│MOBILE번호│ │
│              내부외부구분│GROUP ID1│GROUP ID2│GROUP ID3                  │
│  Body row:   STATUS│USER_ID│USER_EMP_NO│SSO_ID│USER_NM│START_ACTIVE_DATE││
│              END_ACTIVE_DATE│DEPT_CD│USER_CATEGORY_CD│USE_TP│EMAIL│...   │
│                                                                          │
│  options: cellmovingtype=col / selecttype=row / scrollbartype=auto       │
│           autofittype=none / col 0 band=left (고정)                      │
│  events:  oncellclick → (없음 — onkeydown 본문 비어있음)                  │
│           onheadclick → gfn_commonOnheadclick (정렬, xfdl:1253)           │
│           ds_main.onrowposchanged → ds_main_onrowposchanged              │
│             (V-701~V-704 — 역할그룹 자동 조회 + Detail readonly 토글)     │
bottom=0 ───────────────────────────────────────────────────────────────
```

| Toolbar 컴포넌트 위치 | id | 좌표 (As-Is) | 비고 |
|---|---|---|---|
| left=0 / top=0 / width=77 | edt_srch_cseq | cssclass=edi_WF_Title1, readonly, value="조회 결과" | (FX-008) |
| left=edt_srch_cseq:5 / width=223 | div_leftMenu | url include `_com_div::commonLeftButton.xfdl` (B-007 등록 위치) | (FX-002) |
| right=0 / width=280 | div_rightMenu | url include `_com_div::commonRightButton.xfdl` (B-008 등록 위치) | (FX-003) |

### 3.4 A-MAIN-CENTER 내부 배치 (Detail 영역) — 좌표 As-Is 1:1

```
top=25 ───────────────────────────────────────────────────────  right=0
│ div_detail (top=25 / bottom=-20)                              │
│                                                                │
│ top=0  [stc_Static1]   사용자ID*  : [edt_user_id   (Essential)]│
│ top=28 [stc_Static2]   사원 번호* : [edt_user_emp_no(Essential)]│
│ top=56 [stc_Static3]   SSO ID    : [edt_sso_id]               │
│ top=84 [stc_Static4]   사용자명* : [edt_user_nm   (Essential)]│
│ top=112[stc_Static5]   유효개시일 : [cal_start_active_date]    │
│ top=140[stc_Static6]   유효기한일 : [cal_end_active_date]      │
│ top=168[stc_Static7]   부서코드* : [div_dept_cd  (Essential)] │
│ top=196[stc_Static8]   사용자분류CD: [edt_user_category_cd]    │
│ top=222[stc_Static10]  이메일*   : [edt_email   (LabelE)]     │
│ top=248[stc_Static11]  전화 번호  : [ed_tel_no]                │
│ top=276[stc_Static12]  모바일번호 : [edt_mobile_no]            │
│ top=304[stc_Static13]  내부외부*  : [edt_in_out_emp_tp(Combo Essential)]│
│ top=332[stc_Static14]  사용자그룹1: [edt_group_id1 (Combo)]    │
│ top=360[stc_Static15]  사용자그룹2: [edt_group_id2 (Combo)]    │
│ top=388[stc_Static16]  사용자그룹3: [edt_group_id3 (Combo)]    │
│ top=416[stc_Static25]  역할그룹복사: [edt_role_copy] [B-014 역할그룹등록]│
│ top=444[stc_Static26]  PWD 초기화 : [rdo_PwdReset] [B-013 PWD 초기화]│
│ top=472[stc_Static27]  SSO 초기화 : [rdo_SSOReset] [B-015 SSO 초기화]│
│ top=500[stc_Static28]  의뢰서번호 : [edt_infReqNo]             │
│ top=528[stc_Static29]  처리사유   : [edt_description]          │
│ top=556[stc_Static30]  계정 재생성: [B-016 btn_reRegister]      │
│                                                                │
bottom=-20 ───────────────────────────────────────────────────
```

| 라벨 컬럼 (Edit readonly) | 좌표 | 입력 컬럼 | 좌표 |
|---|---|---|---|
| edt_st_user_id "사용자ID" (Essential, edi_WF_LabelFirstE) | left=0/top=0/width=180/height=29 | edt_user_id (Essential, maxlength=90) | left=184/top=4/right=5/height=21 |
| edt_st_user_emp_no "사원 번호" (Essential, edi_WF_LabelE) | left=0/top=28/width=180/height=29 | edt_user_emp_no (Essential, maxlength=10, digit+alpha) | left=184/top=32/right=5/height=21 |
| edt_st_sso_id "SSO ID" | left=0/top=56/width=180/height=29 | edt_sso_id (maxlength=90, digit+alpha, displaynulltext="UNI DOS 연동") | left=184/top=60/right=5/height=21 |
| edt_st_user_nm "사용자명" (Essential) | left=0/top=84/width=180/height=29 | edt_user_nm (Essential, maxlength=90) | left=184/top=88/right=5/height=21 |
| edt_st_start_active_date "유효개시일" | left=0/top=112/width=180/height=29 | cal_start_active_date (yyyy-MM-dd) | left=184/top=116/right=5/height=21 |
| edt_st_end_active_date "유효개시기한일" | left=0/top=140/width=180/height=29 | cal_end_active_date (yyyy-MM-dd) | left=184/top=144/right=5/height=21 |
| edt_st_dept_cd "부서코드" | left=0/top=168/width=180/height=29 | div_dept_cd (Essential, commonDynamic.xfdl) — **To-Be: readOnly Input(코드, 100px) + 검색 Button(56px) + readOnly Input(부서명, flex:1) — shared `LookupModal` 트리거. 직접 타이핑 ✗. (2026-06-04 Round 5 / §3.4.4 / J-014)** | left=184/top=172/right=5/height=21 |
| edt_st_user_category_cd "사용자분류코드" | left=0/top=196/width=180/height=29 | edt_user_category_cd | left=184/top=200/right=5/height=21 |
| edt_st_email "이메일" (Essential, edi_WF_LabelE) | left=0/top=222/width=180/height=29 | edt_email (maxlength=300) | left=184/top=226/right=5/height=21 |
| ed_st_tel_no "전화 번호" | left=0/top=250/width=180/height=29 | ed_tel_no (maxlength=90, digit) | left=184/top=253/right=5/height=21 |
| edt_st_mobile_no "모바일번호" | left=0/top=276/width=180/height=29 | edt_mobile_no (maxlength=90, digit) | left=184/top=280/right=5/height=21 |
| edt_st_in_out_emp_tp "내부 외부 구분" (Essential) | left=0/top=304/width=180/height=29 | edt_in_out_emp_tp (Essential, Combo ds_inOutEmpTp) | left=184/top=309/right=5/height=21 |
| ~~edt_st_group_id1 "사용자 그룹1"~~ | ~~left=0/top=332/width=180/height=29~~ | ~~edt_group_id1 (Combo innerdataset="")~~ | ~~left=184/top=336/right=5/height=21~~ | **As-Is 보존 + To-Be FE 미반영 (정책 #3 (D) / Q-005 해소 / T-025) — 콤보 자체 제거** |
| ~~edt_st_group_id2 "사용자 그룹2"~~ | ~~left=0/top=360/width=180/height=29~~ | ~~edt_group_id2 (Combo)~~ | ~~left=184/top=364/right=5/height=21~~ | **To-Be FE 미반영 (정책 #3 (D))** |
| ~~edt_st_group_id3 "사용자 그룹3"~~ | ~~left=0/top=388/width=180/height=29~~ | ~~edt_group_id3 (Combo)~~ | ~~left=184/top=392/right=5/height=21~~ | **To-Be FE 미반영 (정책 #3 (D))** |
| edt_st_role_copy "사용자 역할그룹 복사" | left=0/top=416/width=180/height=29 | edt_role_copy (displaynulltext="USER_ID 입력") | left=184/top=420/right=110/height=21 |
| (B-014) btn_RoleCopy "역할그룹등록" | (top=420, right=5, width=100, height=22, cssclass=btn_topMenu) | - | - |
| edt_pwd_reset "비밀번호 초기화" | left=0/top=444/width=180/height=29 | rdo_PwdReset (vertical Y/N, index=1=No) | left=184/top=448/width=128/height=21 |
| (B-013) btn_PwdReset "비밀번호 초기화" | (top=448, right=5, width=100, height=22) | - | - |
| edt_pwd_reset00 "SSO 초기화" | left=0/top=472/width=180/height=29 | rdo_SSOReset (vertical Y/N, index=1=No) | left=184/top=476/width=128/height=21 |
| (B-015) btn_SSOPwdReset "SSO 초기화" | (top=476, right=5, width=100, height=22) | - | - |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| ~~edt_st_infReqNo "정보처리의뢰서번호" (D-019)~~ | ~~left=0/top=500/width=180/height=29~~ | ~~edt_infReqNo (maxlength=300)~~ | ~~left=184/top=504/right=5/height=21~~ | **Round 6 (2026-06-04) — Detail 폼에서 제거. 계정삭제 모달 (DP-005) 만 유지** |
| ~~edt_st_description "처리사유" (D-020)~~ | ~~left=0/top=528/width=180/height=29~~ | ~~edt_description (maxlength=300)~~ | ~~left=183/top=531/right=6/height=21~~ | **Round 6 (2026-06-04) — Detail 폼에서 제거. 계정삭제 모달 (DP-006) 만 유지** |
| edt_st_reRegister "계정 재생성" | left=0/top=556/width=180/height=29 | (B-016) btn_reRegister "계정 재생성" (enable=false 기본, cssclass=btn_topMenu) | left=183/top=559/right=6/height=23 |

#### 3.4.1 ToBe 행 정렬 정책 (2026-06-02 iter#2)

| 항목 | 정책 | 사유 |
|---|---|---|
| **DETAIL_LABEL_CELL** | width=130 px 고정 (shared `DetailFormStyles.ts`) | 모든 라벨 좌측 정렬 (As-Is xfdl width=180 → ToBe 130 — Detail 패널 폭 480px 안에서 라벨 130 + 값 350 비율) |
| **DETAIL_VALUE_CELL** | width = remaining (값 입력이 셀 전체 폭 차지) | shared 정본 |
| **D-007 부서코드 행** | **Round 5 (2026-06-04) 갱신**: 코드 Input width=100px readOnly + 검색 Button width=56px + 부서명 Input flex=1 readOnly (display=flex / gap=4 / alignItems=center). | **As-Is `div_dept_cd` 의 commonDynamic 팝업 → shared `LookupModal` 등가. Detail 직접 타이핑 ✗ (사용자 결정 J-014) — LoV 모달 선택만 허용. commRoleMng round-3 `searchObjectLov` 정합 패턴.** |
| **D-016 비밀번호 초기화 행** | Radio width=120 (Yes/No 가로 배치) + Button width=110 | AsIs rdo_PwdReset width=128 + btn_PwdReset width=100 등가. |
| **D-018 SSO 초기화 행** | 동일 (Radio 120 + Button 110) | AsIs 정합. |
| **D-017 역할그룹 복사 행** | Input flex=1 + Button width=110 | AsIs edt_role_copy right=110 + btn_RoleCopy width=100 등가. |
| **B-016 계정 재생성 행** | Button width=110 (단독) — wrap 허용 | AsIs btn_reRegister width=100 등가. 텍스트 "계정 재생성" 6 chars wrap 처리. |

**(2026-06-02 사용자 검수 결과 반영)**: Detail 폼 행간 라벨/입력 컬럼 정렬이 일관되지 않아 보기 불편 → 위 정책 적용으로 모든 행이 동일 좌·우 정렬되도록 강제. shared 정본 `DETAIL_LABEL_CELL` (width=130) 가 모든 행에 동일 적용되므로 입력 행만 내부 flex 정렬로 보정.

**(2026-06-02 iter#3 사용자 검수 J-009 추가 정합)**: "정렬" = **비슷한 배열의 행이 동일 패턴으로 정렬** 의미. 좌측 정렬만이 아닌 좌측 입력 + 우측 동일 너비 버튼 패턴. 3 행 (역할그룹복사 / 비밀번호 초기화 / SSO 초기화) 모두 같은 패턴 (좌측 입력 flex:1 + 우측 버튼 110px 고정 + `justify-content: space-between`) 적용으로 깔끔한 시각 정합 확보.

#### 3.4.2 iter#3 우측정렬 패턴 정리

```
┌─────────────────────────────────────────────────────────────────────────┐
│ │ 사용자 역할그룹 복사 │ [        USER_ID 입력 (flex:1)         ] [역할그룹등록 110px] │
├─┼─────────────────────┼─────────────────────────────────────────────────┤
│ │ 비밀번호 초기화      │ ○ Yes ● No (flex:1)                  [비밀번호 초기화 110px] │
├─┼─────────────────────┼─────────────────────────────────────────────────┤
│ │ SSO 초기화          │ ○ Yes ● No (flex:1)                       [SSO 초기화 110px] │
└─┴─────────────────────┴─────────────────────────────────────────────────┘
```

위 3 행의 우측 버튼 (역할그룹등록 / 비밀번호 초기화 / SSO 초기화) 모두 `width=110px` 동일 + 우측 끝 정렬 (`justify-content: space-between` + `flexShrink: 0`).

#### 3.4.3 iter#4 버튼 너비 강제 (사용자 검수 J-013)

iter#3 의 wrapper `width=110` 만으로는 form-button CSS 기본 `padding: 0 12px` + `white-space: nowrap` 때문에 Button 자체 너비는 텍스트 길이에 따라 변함 → 텍스트 "역할그룹등록"(6자)/"비밀번호 초기화"(7자)/"SSO 초기화"(6자) 길이 차이로 버튼 크기 불일치 발생.

**iter#4 정정**: 모든 Detail 영역 Button 에 `style={{ width: "100%" }}` 강제. wrapper `width=110` + Button `width:100%` 조합 시 모든 버튼이 정확히 110px 동일 너비로 렌더링.

| 행 | 버튼 텍스트 | iter#3 실제 너비 (텍스트 기준) | iter#4 (강제 100%) |
|---|---|---|---|
| D-017 사용자 역할그룹 복사 | 역할그룹등록 | ~90px | **110px** ✓ |
| D-016 비밀번호 초기화 | 비밀번호 초기화 | ~110px | **110px** ✓ |
| D-018 SSO 초기화 | SSO 초기화 | ~85px | **110px** ✓ |
| B-016 계정 재생성 | 계정 재생성 | ~85px | **110px** ✓ |

#### 3.4.4 Round 5 (2026-06-04) — D-007 부서코드 LoV 영역 (사용자 결정 J-014)

**배경**: iter#4 까지 D-007 부서코드 셀은 코드 Input + 부서명 Input 2 영역으로만 구성되어 사용자가 코드를 직접 타이핑하면 부서명 자동 lookup 도 없고 검증도 없는 As-Is `commonDynamic` 부재 상태였음. Round 5 사용자 검수 결과 **"부서코드는 LoV 팝업으로만 선택"** 으로 확정.

**Round 5 D-007 행 구조** (좌→우):

```
┌─────────────┬──────────────────────────────────────────────────────────────────────────────┐
│ 부서코드 *  │ ┌──────────────────┐ ┌──────┐ ┌──────────────────────────────────────────┐ │
│ (라벨, 130) │ │ DEPT_CD readOnly │ │ 검색  │ │ DEPT_NM readOnly (flex:1, placeholder="(부서명)") │ │
│             │ │ width=100        │ │ 56px  │ │                                          │ │
│             │ │ placeholder="(검색)" │ └──────┘ └──────────────────────────────────────────┘ │
│             │ └──────────────────┘                                                            │
└─────────────┴──────────────────────────────────────────────────────────────────────────────┘
            display: flex / gap: 4 / alignItems: center
```

| 영역 | 너비 | 속성 | 동작 |
|---|---|---|---|
| DEPT_CD Input | 100 px 고정 | readOnly + placeholder "(검색)" | 직접 타이핑 ✗ — LoV 모달 선택만 |
| 검색 Button | 56 px 고정 | `style={{ width: "100%" }}` (iter#4 규칙 정합) | onClick → `setIsDeptLovOpen(true)` |
| DEPT_NM Input | flex:1 (가변) | readOnly + placeholder "(부서명)" | DEPT_CD set 시 자동 연동 |

**LoV 모달 상세**:

| 항목 | 값 |
|---|---|
| 컴포넌트 | shared `@dk-oasis/shared/lookup` 의 `LookupModal` |
| 모달 타이틀 | "부서 검색" |
| 검색 입력 placeholder | "부서코드 또는 부서명 입력" |
| 출처 BE action | `searchDeptLov` (POST `/oasis/commUserMng/searchDeptLov`) — **2026-06-04 신설** |
| 응답 row 매핑 | `code = String(r.DEPT_CD ?? "")` / `name = String(r.DEPT_NM ?? "")` (`fetchDeptLov`) |
| 그리드 컬럼 | DEPT_CD / DEPT_NM 2 컬럼 |
| 선택 확정 (`onPick`) | selected row 의 DEPT_CD + DEPT_NM 두 컬럼 동시 set (`handleCellChange × 2`) — code/name 2 axis 동기화 |
| 검색 키워드 | LookupModal 의 keyword (`""` 이면 전체 조회) → BE `searchDeptLov(keyword)` |

**시드 데이터 (총 7 row)**:

| DEPT_CD | DEPT_NM (한글) | DEPT_NM_EN | UPPER | USE_TP |
|---|---|---|---|---|
| DEPT_001 | 경영지원본부 | Management Support HQ | (root) | Y |
| DEPT_002 | 정보기술팀 | IT Team | DEPT_001 | Y |
| DEPT_003 | 생산관리팀 | Production Mgmt Team | DEPT_001 | Y |
| **DEPT_004 (Round 5 신규)** | **인사팀** | HR Team | DEPT_001 | Y |
| **DEPT_005 (Round 5 신규)** | **재무팀** | Finance Team | DEPT_001 | Y |
| **DEPT_006 (Round 5 신규)** | **영업1팀** | Sales Team 1 | DEPT_001 | Y |
| **DEPT_007 (Round 5 신규)** | **품질관리팀** | Quality Mgmt Team | DEPT_001 | Y |

> 시드 정본 = `DataInitializer.seedMcmDeptInfo()` (`src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java`). UPPER_DEPT_CD = `DEPT_001` (경영지원본부 산하 가정 — 후속 운영 조직개편 시 정정).

**정합 reference**: 본 §3.4.4 패턴 = csa 7 + cme 1 화면 **W5 reference (정본)**. 다른 화면이 부서 / 분류코드 / 마스터 코드 LoV 가 필요한 셀에서 본 D-007 구조 (readOnly Input + 검색 Button + readOnly Input + LookupModal + BE `search*Lov` action) 를 그대로 정합한다.


### 3.5 A-MAIN-RIGHT-TOP (GR) 내부 배치

```
top=0 ───────────────────────────────────────────────────────────────  right=0
│ Toolbar (top=0, height=21)                                          │
│  div_rightRole (right=0/width=130, commonRightButton.xfdl)          │
│    └ B-009 btn_rolDel "역할삭제" + B-010 btn_rolSave "역할저장"      │
top=25 ──────────────────────────────────────────────────────────────
│ grd_userRolegrp (binddataset=ds_userRolegrp, autofittype=col)       │
│  Format: head 1줄 (24px) + body 1줄 (24px) / Column 2개              │
│  Columns: 120/166                                                    │
│  Head: 역할 그룹 ID │ 역할 그룹명                                    │
│  Body: ROLE_GROUP_ID │ ROLE_GROUP_NM                                 │
bottom=0 (height=291) ──────────────────────────────────────────────
```

### 3.6 A-MAIN-RIGHT-BOT (GL) 내부 배치

```
top=div_roleGrpId:10 ─────────────────────────────────────────────  right=0
│ Toolbar (top=0, height=21)                                          │
│  div_rightRoleList (right=0/width=130, commonRightButton.xfdl)      │
│    └ B-011 btn_rolAdd "역할추가" + B-012 btn_rolSearch "역할조회"    │
top=25 ──────────────────────────────────────────────────────────────
│ grd_rolegrpList (binddataset=ds_rolegrpList, autofittype=col,       │
│                  selecttype=multirow)                                │
│  Format: head 1줄 (24px) + body 1줄 (24px) / Column 2개              │
│  Columns: 114/172                                                    │
│  Head: 역할 그룹 ID │ 역할 그룹명                                    │
│  Body: ROLE_GROUP_ID │ ROLE_GROUP_NM                                 │
bottom=0 ───────────────────────────────────────────────────────────
```

### 3.7 A-POPUP-DEL 내부 배치 (계정삭제 모달)

```
left=415, top=270, width=470, height=273, visible=false (B-002 트리거)
border=2px solid #D6e2ea
┌────────────────────────────────────────────────────────────┐
│ top=11 [DP-001 edt_title "계정삭제"] (cssclass=edi_WFHD_Title) │
│ ┌────────── div_search00 (top=50, bottom=58, cssclass=div_WFSA_Box) ────┐│
│ │ top=7,left=63,40x40  [DP-002 img_MsgImg "img_msg_question.png"]      ││
│ │ top=17,left=117,289x21 [DP-003 sts_message "계정을 삭제 하시겠습니까?"]││
│ │ top=58,left=58,125x21  [sts_useTp "유효개시기한일"]                  ││
│ │   top=58,left=sts_useTp:10,right=53 [DP-004 cal_end_active_date (yyyy-MM-dd)]│
│ │ top=sts_useTp:10,left=58,125x21 [sts_useTp00 "정보처리의뢰서 번호"] ││
│ │   top=89,left=sts_useTp00:10,right=53 [DP-005 edt_infReqNo (maxlength=300)]││
│ │ top=sts_useTp00:10,left=58,125x21 [sts_useTp00_00 "처리사유"]       ││
│ │   top=120,left=sts_useTp00_00:10,right=53 [DP-006 edt_description (maxlength=300)]│
│ └─────────────────────────────────────────────────────────────────────┘│
│ bottom=15,right=btn_close:5  [B-018 btn_save "확인" cssclass=btn_WF_Save]│
│ bottom=15,right=178          [B-017 btn_close "취소" cssclass=btn_WF_CustomM,btn_WF_Delete]│
└────────────────────────────────────────────────────────────┘
```

---

## 4. 그리드 (G-NNN / GR-NNN / GL-NNN — 기능설계서 §3.2 인용)

### 4.1 G-NNN 메인 그리드 (`grd_main`) — 17 컬럼

| 컬럼 | size (xfdl) | head cell text | body cell (bind / displaytype / combo) | 정렬 | 편집 | 필수 |
|---|---:|---|---|---|---|---|
| G-001 STATUS | 48 (band=left 고정) | "상태" | bind:STATUS / displaytype=imagecontrol | Center | N | - |
| G-002 USER_ID | 117 | "사용자ID" | bind:USER_ID / displaytype=normal / edittype=none | Left | N (기존 행 편집 불가) | Y (D-001 Essential 연동) |
| G-003 USER_EMP_NO | 101 | "사번" | bind:USER_EMP_NO | Left | Y | Y (D-002 Essential) |
| G-004 SSO_ID | 80 | "SSO ID" | bind:SSO_ID | Left | Y | N |
| G-005 USER_NM | 80 | "사용자명" | bind:USER_NM | Left | Y | Y (D-004 Essential) |
| G-006 START_ACTIVE_DATE | 80 | "유효개시일" | bind:START_ACTIVE_DATE / displaytype=date / calendardateformat=yyyy-MM-dd | Center | Y | - |
| G-007 END_ACTIVE_DATE | 80 | "유효기한일" | bind:END_ACTIVE_DATE / displaytype=date / yyyy-MM-dd | Center | Y | - |
| G-008 DEPT_CD | 80 | "부서코드" | bind:DEPT_CD (**To-Be LoV 출처 = `MCMAPUSER.TB_MCM_DEPT_INFO` — 정책 #2 / Q-002. Round 5 (2026-06-04): 그리드 셀 자체는 readOnly (`editable: false` — J-010 정합) → Detail D-007 의 `LookupModal` 만 편집 경로**) | Left | N (Round 5 — J-010) | Y (D-007 Essential) |
| G-009 USER_CATEGORY_CD | 96 | "사용자분류코드" | bind:USER_CATEGORY_CD | Left | Y | N |
| G-010 USE_TP | 71 | "사용구분" | bind:USE_TP / displaytype=combotext / combodataset=ds_useTp (LV-001) / combocodecol=CD / combodatacol=NM | Center | Y (combo) | - |
| G-011 EMAIL | 96 | "EMAIL" | bind:EMAIL | Left | Y | Y (D-009 Essential 라벨) |
| G-012 TEL_NO | 96 | "전화번호" | bind:TEL_NO | Left | Y | - |
| G-013 MOBILE_TEL_NO | 94 | "MOBILE번호" | bind:MOBILE_TEL_NO | Left | Y | - |
| G-014 IN_OUT_EMP_TP | 80 | "내부외부구분" | bind:IN_OUT_EMP_TP / displaytype=combotext / combodataset=ds_inOutEmpTp (LV-002) | Center | Y (combo) | Y (D-012 Essential) |
| G-015 GROUP_ID1 | 80 | "GROUP ID1" | bind:GROUP_ID1 (그리드 노출 As-Is bind 보존. **Detail 콤보 D-013 자체는 To-Be 미반영 — 정책 #3 (D)**) | Left | Y | - |
| G-016 GROUP_ID2 | 80 | "GROUP ID2" | bind:GROUP_ID2 (**Detail D-014 미반영**) | Left | Y | - |
| G-017 GROUP_ID3 | 80 | "GROUP ID3" | bind:GROUP_ID3 (**Detail D-015 미반영**) | Left | Y | - |

> Header Row 1 + Body Row 1. `cellmovingtype="col"`, `selecttype="row"`, `scrollbartype="auto"`, `autofittype="none"`. col 0 (STATUS) 만 `band="left"` 고정.

### 4.2 GR-NNN 보유 역할그룹 그리드 (`grd_userRolegrp`) — 2 컬럼

| 컬럼 | size | head cell text | body cell bind | 정렬 | 편집 | 필수 |
|---|---:|---|---|---|---|---|
| GR-001 ROLE_GROUP_ID | 120 | "역할 그룹 ID" | bind:ROLE_GROUP_ID | Left | N | - |
| GR-002 ROLE_GROUP_NM | 166 | "역할 그룹명" | bind:ROLE_GROUP_NM | Left | N | - |

> Header Row 1 + Body Row 1. `autofittype="col"`.

### 4.3 GL-NNN 추가 가능 역할그룹 목록 (`grd_rolegrpList`) — 2 컬럼

| 컬럼 | size | head cell text | body cell bind | 정렬 | 편집 | 필수 |
|---|---:|---|---|---|---|---|
| GL-001 ROLE_GROUP_ID | 114 | "역할 그룹 ID" | bind:ROLE_GROUP_ID | Left | N (multirow 선택) | - |
| GL-002 ROLE_GROUP_NM | 172 | "역할 그룹명" | bind:ROLE_GROUP_NM | Left | N | - |

> Header Row 1 + Body Row 1. `autofittype="col"`, `selecttype="multirow"`.

### 4.4 그리드 추가 동작 (UX)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| UX-001 | Main 행 변경 시 보유 역할 자동 조회 (재선택 skip) | ds_main_onrowposchanged (xfdl:1199) | 기능 §6.8 V-701 |
| UX-002 | Main 행 변경 시 USER_ID 값 존재 → edt_user_id readonly=true / 미존재 (신규) → readonly=false | ds_main_onrowposchanged | 기능 §6.8 V-702 |
| UX-003 | Main 행 변경 시 USE_TP="Y" → btn_reRegister 비활성 / 그 외 → 활성 | ds_main_onrowposchanged | 기능 §6.8 V-703 |
| UX-004 | Main 행 변경 시 div_dept_cd 값/명 갱신 (DEPT_CD / DEPT_NM) | ds_main_onrowposchanged | 기능 §6.8 V-704 |
| UX-005 | edt_user_id onchanged → rdo_PwdReset / rdo_SSOReset = "N" / edt_role_copy = null 리셋 | edt_user_id_onchanged (xfdl:1398) | F-005 정정 ✗ — As-Is 보존 |
| UX-006 | search 콜백 후 ds_main.set_rowposition(-1) + roleSearch=true + Detail enable=true | fn_callBack("searchCmUser") (xfdl:748) | 기능 §6.9 V-802 |
| UX-007 | searchUserRoleGrp 콜백 후 자동 searchRoleGrp 후속 호출 | fn_callBack("searchUserRoleGrp") (xfdl:783) | 기능 §6.9 V-804 |
| UX-008 | btn_PwdReset / btn_SSOPwdReset 클릭 후 rdo 항상 N 복귀 (취소 케이스 포함) | btn_PwdReset_onclick / btn_SSOPwdReset_onclick (xfdl:1395 / 1418) | - |
| UX-009 | gds_btn_list 의 PERMISSION_CUSTOM="user" 권한 시 우측 메뉴 / RoleCopy / PWD / SSO 버튼 visible=false. **To-Be PortalShell + RBAC React Context `useRbac("mcm:csa:commUserMng:user")` 분기로 통합 (정책 #3 (G) / Q-015 해소 / T-015)** | fn_formBeforeOnload (xfdl:521~529) | 기능 §8 |

---

## 5. 버튼 (toolbar / 그리드 셀) — 기능 §5.1 인용

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### 5.1 div_title topMenu (커스텀 + 기본) — As-Is xfdl:455 정합 5 버튼 → ToBe 3 버튼 표준

| 버튼ID | text | cssclass | 등록 fn / onclick | 동작 |
|---|---|---|---|---|
| ~~B-001~~ | ~~계정생성 (커스텀)~~ | ~~(commonTopButton 표준)~~ | ~~`fn_register`~~ | **Round 6 (2026-06-04) — "저장" 1 버튼 통합. saveCmUser action 의 `nativeeditor_status="inserted"` 분기로 applyInsert** |
| ~~B-002~~ | ~~계정삭제 (커스텀)~~ | ~~(동일)~~ | ~~`fn_delete`~~ | **Round 6 (2026-06-04) — "저장" 1 버튼 통합. saveCmUser action 의 `nativeeditor_status="deleted"` 분기로 applyDelete. END_ACTIVE_DATE sentinel `9999-12-31` 감지 시 today 로 정정 (계정삭제 동작 fix)** |
| B-003 | (기본) 조회 | (동일) | `fn_search` | searchCmUser |
| ~~B-004~~ | ~~(기본) 수정~~ | ~~(동일)~~ | ~~`fn_modify`~~ | **Round 6 (2026-06-04) — "저장" 으로 통합. saveCmUser action 의 `nativeeditor_status="updated"` 분기로 applyUpdate** |
| **B-004' (Round 6)** | **저장** (통합) | (commonTopButton 표준) | `fn_save` | **saveCmUser 단일 action — master row 의 `nativeeditor_status` 별 applyInsert / applyUpdate / applyDelete 분기. END_ACTIVE_DATE sentinel `9999-12-31` 감지 시 applyDelete + today 로 정정** |
| ~~B-005~~ | ~~(기본) 닫기~~ | ~~(동일)~~ | ~~`fn_close`~~ | **Round 7 (2026-06-05) — 완전 제거. portal 탭 close 는 host 가 처리 → 화면 내부 닫기 버튼 의미 ✗. PageLayout buttons 배열에서 entry 삭제, unused `handleClose` dead code 제거** |
| **B-NEW (Round 7)** | **초기화** | (commonTopButton 표준) | `fn_reset` | **가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) 중 "초기화" 채택. ToBe 3 버튼 = [조회 / 초기화 / 저장]** |

#### 5.1.1 ToBe 버튼 활성화 정책 (2026-06-02 iter#2)

| 정책 | 결정 | 사유 |
|---|---|---|
| **RBAC 권한 기반 활성화** | PageLayout 의 `objId="commUserMng"` + `action="search/save/delete/cancel"` 가 RBAC 자동 결정. admin (SYSADMIN role) = 모든 action 권한 보유 → 5 버튼 모두 활성. 권한 없는 사용자 = 자동 비활성. | AsIs commonTopButton 의 `gds_btn_list` PERMISSION_CUSTOM 분기 등가 (xfdl:521~529). RBAC 통합 (정책 #3 (G) / Q-015 해소 / T-015). |
| **행 선택/변경 사전 disabled 제거** | btn_register / btn_modify / btn_delete 모두 사용자 동작 (행 선택 / inserted / updated) 사전 검사 ✗. 클릭 시 핸들러가 V-NNN 검증 후 ErrorModal 차단. | AsIs onclick 정합. 핸들러 내 검증 (V-101 "변경된 데이터가 없습니다.", V-102 "사용자 선택 후 삭제처리 해주세요." 등) 이 As-Is fn_modify / fn_delete 와 동일 동작. (2026-06-02 사용자 검수: "권한 있는 버튼은 항상 활성 + 클릭 시 validation"). |
| **isSaving / isSearching 만 유지** | double-click / race 방지용 in-progress disabled 만 적용. | UI 보호 패턴 — As-Is 동작에 영향 ✗. |
| ~~**초기화 (btn_reset) 부재**~~ | ~~AsIs xfdl:455 commonTop 기본 버튼 = `["btn_search","btn_modify","btn_close"]` 3 + 커스텀 = `["btn_register","btn_delete"]` 2 → 총 5 버튼. **초기화 (btn_reset) 는 AsIs 없음 → ToBe 도 미반영** (2026-06-02 iter#2 정정).~~ → **Round 7 (2026-06-05) 갱신: 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) 채택 + btn_close 제거 = ToBe 3 버튼 [조회/초기화/저장]. AsIs 5 버튼 (계정생성/계정삭제/조회/수정/닫기) → ToBe 3 버튼 — Round 6 의 "저장" 통합 + Round 7 의 btn_close 제거 + 초기화 신규.** | **ToBe 가이드 표준 우선 + portal 탭 close host 위임 (정책 #4 As-Is/To-Be 표준 우선).** |

### 5.2 div_search toolbar

| 버튼ID | text | cssclass | width / 위치 | 동작 |
|---|---|---|---|---|
| B-006 | (없음 — 아이콘) | btn_WFSA_Fold | top=93 / height=12 / left=20 / right=20 | div_search 접기/펴기 |

### 5.3 div_mainGrd toolbar (commonLeftButton + commonRightButton)

| 버튼ID | text | 위치 |
|---|---|---|
| B-007 | (외부 공통) chk_check / btn_sum / btn_copyPaste | div_leftMenu (left=edt_srch_cseq:5 / width=223) |
| B-008 | (외부 공통) btn_rowAdd → fn_rowAdd / btn_rowCancel → fn_rowCancel | div_rightMenu (right=0 / width=280) |

### 5.4 div_mainDetail (div_detail) toolbar

| 버튼ID | text | cssclass | width / 위치 | 동작 |
|---|---|---|---|---|
| B-013 | 비밀번호 초기화 | btn_topMenu | top=448 / right=5 / width=100 / height=22 | rdo_PwdReset=Y 시 confirm → pwdinit (PWD 분기) |
| B-014 | 역할그룹등록 | btn_topMenu | top=420 / right=5 / width=100 / height=22 | confirm → saveUserRoleGrpCopy |
| B-015 | SSO 초기화 | btn_topMenu | top=476 / right=5 / width=100 / height=22 | rdo_SSOReset=Y 시 confirm → pwdinit (SSO 분기) |
| B-016 | 계정 재생성 | btn_topMenu | top=559 / left=183 / right=6 / height=23 | enable=false 기본, USE_TP="N" 일 때만 활성 |
| **B-019 (Round 5 신규)** | **부서 검색** | (form-button shared 기본) | **Detail D-007 행 내 width=56 (코드 Input 우측)** | **onClick → `setIsDeptLovOpen(true)` 로 shared `LookupModal` (부서 LoV) 오픈. As-Is `commonDynamic` div_dept_cd 의 트리거 등가.** |

#### 5.4.1 ToBe Detail 버튼 활성화 정책 (2026-06-02 iter#2)

| 버튼 | ToBe 활성화 정책 | 사유 |
|---|---|---|
| B-013 비밀번호 초기화 | **항상 활성** (isSaving 만 disable) | AsIs xfdl:161 `btn_PwdReset` enable 속성 없음 = 기본 enable=true. 클릭 시 V-501 "사용자 이메일 저장 후" / V-502 "Radio Y 선택 후" 핸들러 검증. |
| B-014 역할그룹등록 | **항상 활성** (isSaving 만 disable) | AsIs xfdl:163 동일. 클릭 시 V-503 "선택된 사용자가 없습니다." / V-504 "복사 출처 USER_ID 를 입력하세요." 핸들러 검증. |
| B-015 SSO 초기화 | **항상 활성** (isSaving 만 disable) | AsIs xfdl:166 동일. 클릭 시 V-505 "SSO Radio Y 선택" 핸들러 검증. |
| B-016 계정 재생성 | **row-state 기반 disabled 유지** (`!selected || isNewRow || selected.USE_TP === "Y"`) | AsIs xfdl:1218~1222 명시: `obj.getColumn(e.newrow, "USE_TP") == "Y"` 면 `set_enable(false)`. As-Is 유일하게 row-state 기반 비활성 버튼 → ToBe 도 동일 유지. |
| **B-019 부서 검색 (Round 5 신규)** | **isSaving 만 disable** | **Round 5 (2026-06-04 J-014). AsIs `div_dept_cd` (commonDynamic 트리거) 등가. row 선택 여부와 무관 — 클릭 시 LookupModal 만 오픈 + 선택 시 selected row 의 DEPT_CD + DEPT_NM 동시 set. selected row 없으면 onPick 시 no-op (handleCellChange 내부 가드).** |

### 5.5 div_roleGrpId / div_roleGrpIdList toolbar (commonRightButton)

| 버튼ID | text | 등록 위치 |
|---|---|---|
| B-009 | 역할삭제 (btn_rolDel → fn_rolDel) | div_rightRole (right=0 / width=130) |
| B-010 | 역할저장 (btn_rolSave → fn_rolSave) | div_rightRole |
| B-011 | 역할추가 (btn_rolAdd → fn_rolAdd) | div_rightRoleList (right=0 / width=130) |
| B-012 | 역할조회 (btn_rolSearch → fn_rolSearch) | div_rightRoleList |

#### 5.5.1 ToBe 역할그룹 버튼 활성화 정책 (2026-06-02 iter#2)

| 버튼 | ToBe 활성화 정책 | 사유 |
|---|---|---|
| B-009 역할삭제 | **항상 활성** (isSaving 만 disable) | AsIs commonRightButton 표준 — 클릭 시 V-601 "삭제할 역할을 선택하세요." 핸들러 검증. |
| B-010 역할저장 | **항상 활성** (isSaving 만 disable) | AsIs 표준 — 클릭 시 V-602 "변경된 역할이 없습니다." 핸들러 검증. |
| B-011 역할추가 | **항상 활성** (isSaving 만 disable) | AsIs 표준 — 클릭 시 V-603 "선택된 Role 그룹이 없습니다." 핸들러 검증. |
| B-012 역할조회 | **항상 활성** (isSaving 만 disable) | AsIs 표준 — 클릭 시 V-604 "사용자를 먼저 선택하세요." 핸들러 검증. |

**(2026-06-02 사용자 검수 결과 반영)**: iter#1 에서 모든 버튼이 행 선택/변경/key set 사전 검사로 disabled 되어, 클릭조차 못 하는 상태였음 → AsIs "권한 있는 버튼은 항상 활성" 정합 위반. iter#2 에서 사전 disabled 모두 제거 + 핸들러 검증으로 차단 (AsIs onclick 패턴). 단 B-016 계정 재생성 만 AsIs xfdl:1218 명시적 row-state 분기 → 예외 유지.

### 5.6 div_deletePopup toolbar

| 버튼ID | text | cssclass | width / 위치 | 동작 |
|---|---|---|---|---|
| B-017 | 취소 | btn_WF_CustomM, btn_WF_Delete | bottom=15 / right=178 / width=65 / height=25 | 입력 초기화 + visible=false |
| B-018 | 확인 | btn_WF_Save | bottom=15 / right=btn_close:5 / width=65 / height=25 | rowposition deleteRow + setColumn → deleteCmUser + 닫기 |

### 5.7 그리드 셀 인라인 버튼 (GB-NNN)

해당 없음 — grd_main / grd_userRolegrp / grd_rolegrpList 의 Grid Cell 에 ButtonField ✗.

---

## 6. 팝업 (P-NNN — 기능 §9 인용)

| P-ID | 종류 | 화면 (xfdl url 또는 인라인) | 트리거 | 전달 | 반환 처리 |
|---|---|---|---|---|---|
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| P-001 | inline modal (Form 내부 Div) | `div_deletePopup` (xfdl:280~302) | **Round 6 (2026-06-04) — `B-002 fn_delete` 폐기 → 통합 "저장" 버튼 (B-004') 의 applyDelete 분기에서 트리거. master row 의 `nativeeditor_status="deleted"` + END_ACTIVE_DATE sentinel `9999-12-31` 감지 시 today 로 정정** | 동적: USER_ID 메시지 / today / edt_infReqNo / edt_description 복사 (모달 DP-005/DP-006 보존 — Detail D-019/D-020 만 제거) | B-018 → **saveCmUser (applyDelete 분기)** — Round 6 통합 |
| P-002 | external popup (commonDynamic.xfdl) → **To-Be shared `LookupModal` (Round 5 — 2026-06-04 사용자 결정 J-014 / T-016 갱신) + 출처 `MCMAPUSER.TB_MCM_DEPT_INFO` (정책 #2 / Q-002 해소)** | ~~`_com_div::commonDynamic.xfdl`~~ → **shared `@dk-oasis/shared/lookup` `LookupModal`** | D-007 셀 내 검색 Button (B-019) — Round 5 신설 | **BE action `searchDeptLov` 신규 (2026-06-04)** — POST `/oasis/commUserMng/searchDeptLov`, body `{keyword: string}`. 응답 = `{ result: [{DEPT_CD, DEPT_NM}, ...] }`. modal 타이틀 "부서 검색", placeholder "부서코드 또는 부서명 입력", 그리드 컬럼 DEPT_CD / DEPT_NM. | **`onPick(row)` → `handleCellChange(rowKey, "DEPT_CD", row.code)` + `handleCellChange(rowKey, "DEPT_NM", row.name)` 두 번 호출 — DEPT_CD + DEPT_NM 동시 set. AsIs `fn_callBack("commonUserDept")` 의 setColumn 등가 + 부서명 자동 연동 (AsIs 별도 단계 → ToBe 통합).** |
| P-003 | WebBrowser external → **To-Be 신규 Next.js 페이지 `m-mcm/app/password-change/page.tsx` (정책 #3 (F) / Q-013 해소 / T-012)** | ~~`/_uiEXt_/rsa/pwChg.html`~~ | B-013 / B-015 → fn_pwInit() | publicKeyModulus / publicKeyExponent | wb_pwdChg_init_onusernotify → ds_pwdtmp 적재 → ~~`/security/password/pwdtmp`~~ → **To-Be BE `POST /oasis/commUserMng/changePassword` (신규)** transaction |

> P-001 본문 디자인은 본 §3.7 참조. P-002 는 commonDynamic 표준 컴포넌트 → **Round 5 (2026-06-04) 확정: shared `LookupModal` + DMES `TB_MCM_DEPT_INFO` 출처 (정책 #2) + BE 신규 action `searchDeptLov` (DTO `CommUserMngSearchDeptLovRequest` + Service `CommUserMngService.searchDeptLov` + Repository.findDeptLov + BPMN `searchDeptLovTask`). 본 화면 = W5 reference — 다른 csa 7 + cme 1 화면의 LoV 셀 패턴 정합 기준.** 본 패턴 상세 = §3.4.4. P-003 은 **별도 페이지 신규 설계 — `m-mcm/app/password-change/page.tsx` + BE `POST /oasis/commUserMng/changePassword` + yml prefix `commUserMng.password.*` (정책 #3 (F))**.

---

## 7. 메시지 표기 (기능 §10 인용)

### 7.1 표기 위치별

| 위치 | 메시지 종류 | 컴포넌트 |
|---|---|---|
| 모달 알림 (warning / error) | M-001 ~ M-022, M-031 (validation / 차단) | `gfn_message("", "", text, "warning/error", "", "")` (xfdl 표준 — To-Be `MessageModal` 등가) |
| 모달 알림 (confirm) | M-004, M-006, M-007, M-016, M-017, M-019, M-020, M-021, M-023 | `gfn_message(..., "confirm", "확인", callback)` — To-Be `ConfirmModal` 등가 |
| 모달 알림 (info) | M-026 (saveUserRoleGrp / saveUserRoleGrpCopy 성공) | `gfn_message(..., "info")` — To-Be `Toast` 또는 `MessageModal info` |
| 하단 status bar | M-024 / M-025 / M-028 / M-029 / M-030 / M-032 | `gfn_commonBottomStatus_msg(text)` (div_bottom common — To-Be `StatusBar` 등가) |
| 팝업 내부 메시지 (DP-003) | M-009 / M-010 | `sts_message.set_value(text)` (xfdl:1155 동적 갱신) |
| 서버 로그 (사용자 미표시) | M-034 (Java log.debug/log.info) | log (java) — To-Be 화면 미표시 |
| 서버 예외 (사용자 표시) | M-033 (UserException) | `throw new UserException(text)` — To-Be 화면에 alert 표시 |

### 7.2 색상 / 강조

| 컴포넌트 | cssclass | 색상 의미 |
|---|---|---|
| 라벨 박스 (Static stc_WF_Box / stc_WF_BoxFirst) | (As-Is 기본 표준 — 회색 음영) | 그룹 박스 |
| Detail 입력 필수 필드 | Essential | 빨강 테두리 — 필수 표시 |
| Detail 라벨 Essential 표시 | edi_WF_LabelE (E suffix) / edi_WF_LabelFirstE | 라벨 텍스트 강조 |
| 그리드 row 선택 | (gfn_gridSelectedRow "red", "blue") | 선택 행 빨강 / 파랑 (xfdl:440) |
| 모달 (div_deletePopup) | border=2px solid #D6e2ea | 연한 청록 테두리 |
| 모달 메시지 아이콘 | theme://images/img_msg_question.png | 회색 물음표 |
| 취소 버튼 (B-017) | btn_WF_CustomM, btn_WF_Delete | 빨강 강조 (삭제) |
| 저장 버튼 (B-018) | btn_WF_Save | 파랑 강조 (저장) |
| div_search | div_WFSA_Box | 조회조건 영역 회색 박스 |
| div_search00 (in div_deletePopup) | div_WFSA_Box | 모달 내부 회색 박스 |
| div_bottom | div_WF_Footer | 하단 footer 영역 |
| topMenu 버튼 (B-013/B-014/B-015/B-016) | btn_topMenu | 상단 메뉴 표준 버튼 |
| 그리드 좌상단 라벨 | edi_WF_Title1 | 그리드 타이틀 강조 |
| 모달 타이틀 | edi_WFHD_Title | 헤더 타이틀 강조 |
| filter 라벨 | edi_WFSA_Label | 조회조건 라벨 표준 |
| Detail 라벨 (필수 아닌) | edi_WF_Label | 표준 라벨 |

---

## J. 사용자 검수 이력 / 라운드 카탈로그

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->

> 본 화면은 csa 7 + cme 1 화면의 **W5 reference (W5 A~G 정본)** — Round 5 사용자 검수 결과 확정. 신규 결함 발견 시 본 §J 에 라운드 단위로 등재 + 본문 §§ 갱신 + 코드 수정 + 정합체크서 §J/K cross-ref 동시 적용 (`feedback_q_resolution_propagation.md` 정합).

### J.1 라운드 카탈로그

| Round | 일자 | 변경 | 영향 §/D-NNN/G-NNN/B-NNN |
|---|---|---|---|
| iter#1 | 2026-06-01 | 초기 ToBe 코드 구현 (3 패널 균등 분할 / 그리드 인라인 편집 / 모든 버튼 사전 disabled) | §3.1 (초기) |
| iter#2 | 2026-06-02 | J-001~J-007 — 패널 비율 (Left flex:1 / Center 480 / Right 380) + Detail 헤더 32px 추가 + 행 정렬 (코드 120/명 flex / Radio 120 / Button 110) + RBAC 권한 활성화 + btn_reset 제거 + B-016 wrap + §J 신설 | §3.1 / §3.1.1 / §3.4.1 / §5.1.1 / §5.4.1 / §5.5.1 |
| iter#3 | 2026-06-02 | J-008~J-011 — Detail 헤더 2 줄 구조 (panel-header 32 + column-header 28) + 행 정렬 의미 재해석 (좌측 입력 flex:1 + 우측 버튼 110 + space-between) + 그리드 `editable: false` + END_OF_TIME 00:00:00 정합 | §3.1.1 / §3.4.1 / §3.4.2 / §4.1 G-002~G-017 |
| iter#4 | 2026-06-02 | J-012 / J-013 — wrapper 전체 + 폼 본문 #f4f6f8 회색 통일 (table cell 만 흰색) + Button `width:100%` 강제 | §3.1.1 / §3.1.2 / §3.4.3 |
| **Round 5** | **2026-06-04** | **W5 reference 확정 + D-007 부서 LoV (LookupModal) 신설 + DataInitializer 부서 4 row 추가 + USER_ID readOnly 회귀 확인 (J-014 / J-015 / J-016)** | **§1.2 / §3.4 D-007 / §3.4.4 / §4.1 G-008 / §5.4 B-019 / §6 P-002** |
| **Round 6** | **2026-06-04** | **B-001 계정생성 / B-004 수정 / B-002 계정삭제 3 버튼 → "저장" 1 버튼 통합 (`saveCmUser` 단일 action — `nativeeditor_status` 별 applyInsert / applyUpdate / applyDelete 분기). END_ACTIVE_DATE sentinel `9999-12-31` 감지 시 applyDelete + today 정정 (계정삭제 동작 fix). Detail D-019 정보처리의뢰서 / D-020 처리사유 제거 (모달 DP-005/DP-006 만 보존)** | **§3.4 D-019/D-020 / §4.1 (해당 없음 — Detail) / §5.1 B-001/B-002/B-004/B-004' / §6 P-001** |
| **Round 7** | **2026-06-05** | **AsIs xfdl `btn_close` (commonTop basic 4 의 마지막) → ToBe 완전 제거. PageLayout buttons 배열에서 entry 삭제, unused `handleClose` dead code 제거. 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준 (조회/초기화/저장). 사유: portal 탭 close 는 host 처리** | **§1.2 / §5.1 B-005 / §5.1.1** |

### J.2 W5 패턴 A~G 보존

| 패턴 | 적용 § | 상태 |
|---|---|---|
| A — 모듈 통합 가이드 (mcm/csa) | §1.2 | ✓ Round 5~7 보존 |
| B — Detail 폼 행 정렬 (라벨 130 + 값 flex / Button 110) | §3.4.1 / §3.4.2 / §3.4.3 | ✓ Round 5~7 보존 |
| C — 그리드 인라인 편집 금지 (`editable: false`) + Detail 양방향 bind | §4.1 / §4.4 UX-001 | ✓ Round 5~7 보존 |
| D — RBAC 권한 기반 활성화 + isSaving disable | §5.1.1 / §5.4.1 / §5.5.1 | ✓ Round 5~7 보존 (Round 7 의 3 버튼 표준에도 동일 적용) |
| E — LookupModal LoV 패턴 (readOnly Input + 검색 Button + readOnly Input + BE `search*Lov` action) | §3.4.4 / §5.4 B-019 / §6 P-002 | ✓ Round 5 신설 + Round 6~7 보존 |
| F — Detail 배경색 체계 (#f4f6f8 wrapper / table cell 만 흰색) | §3.1.2 | ✓ Round 5~7 보존 |
| G — 통합 "저장" 버튼 (`saveCmUser` nativeeditor_status 분기) | §5.1 B-004' / §6 P-001 | ✓ **Round 6 신설** + Round 7 보존 |

### J.3 신규 Q-NNN 등재 ✗

Round 6 / Round 7 모두 사용자 결정 즉시 본문 + 코드 + 정합체크 동시 갱신으로 해소. 미해결 결정 사항 ✗ → 신규 Q-NNN 등재 ✗.
