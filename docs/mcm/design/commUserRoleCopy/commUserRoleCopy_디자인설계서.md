---
screenId: commUserRoleCopy
asIsId: CommUserRoleCopy
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# mcm — 사용자 권한 일괄 등록 디자인설계서

> **Frontend 개발 연계 값** (기능설계서 §1.2 와 동일):
> - mesModule = `m-mcm` / moduleGroup = `csa` / pageName = `commUserRoleCopy` / pageId = `commUserRoleCopy` / 페이지 유형 = **D 다중 그리드** / tsup entry key = `pages/csa/commUserRoleCopy`
>
> **명명 룰**: MES 단일 룰 (mcm 모듈 — APS 예외 미적용). 4 식별자 1byte 동일.
>
> **인용 정본**: 분석리포트 §3 (UI 컴포넌트 전수) + 기능설계서 §3 (S/G/GE) + §5 (B). 자체 추가 ✗.
>
> **2026-05-31 갱신**: Q-001 / Q-002 / Q-003 / Q-004 / Q-006 5건 일괄 해소 (정책 #1 / #2 / #6 적용). 본 디자인설계서는 UI 좌표·cssclass 만 다루며 백엔드 변환 (외부 namespace 흡수, EAI → TB_MCM_DEPT_INFO, JPA Entity saveAll) 은 분석리포트 §6/§7/§9/§11 + BPMN설계서 §3/§6 본문 참조. 화면 디자인 (그리드 컬럼·라벨·셔틀·필터) 자체는 변경 ✗.
>
> **W5 패턴 적용 (Round 1~5, 2026-06-02 ~ 2026-06-04)**:
> - **W5-A** (Layout — 3 컬럼 분할 + 셔틀): As-Is xfdl 좌 300 / 중앙 600 / 우 가변 → To-Be 좌 310 / 중앙 480 narrow / 셔틀 60 / 우 flex:1 (좌·우 그리드 영역 확장 / W5 owner commUserMng `m-mcm/page-components/csa/commUserRoleCopy/page.tsx:432~613` 정본 정합).
> - **W5-B** (Detail BindItem 정합): **N/A — 본 화면은 셔틀 화면이며 Detail 폼 부재.** 중앙 패널은 권한생성 헤더 (D-002 `infReqNo` / D-004 `description` 2 필드) + `userTo` 그리드 조합으로, Detail 양방향 bind item 다중필드 매핑 (W5-B PERMISSION_ID/NM/DESC 등 11 필드 양방향) 대상 ✗. As-Is xfdl 의 `div_infReq` (2 행 header 입력) 가 양방향 watch 1:1 React state setter 로 충분.
> - **W5-C** (Modal 정식 신설): **N/A — 본 화면은 팝업 ✗ (분석 §5 / 기능 §9 / §6 "해당 없음" 보존).** `window.confirm` 1 호출 (V-003 infReqNoFlag 분기 M-004/M-005) 만 사용 — 권한 enum 14 옵션 체크박스 그리드 (W5-C commonPermBtnPopup) 같은 신규 Modal 필요 없음.
> - **W5-D** (Grid editable:false 통일): 4 그리드 (`COPY_USER` / `COPY_ROLEGRP` / `USER_TO` / `USER_FROM`) 모든 컬럼 `editable: false` (As-Is xfdl USER_ID `edittype="none"` + 표시 전용 그리드 정책 등가). date / code 컬럼 자체 ✗ → `toDateInputValue` / `LABEL_MAP` 미적용 (commPermMng W5-D 와 동일 정합 형식).
> - **W5-E** (Buttons — commonTopButton + basic): As-Is xfdl:268 `commonTopButton ["btn_search","btn_save"]` + basic `["btn_close"]` 정합 → `PageLayout.buttons = [btn_search, btn_save, btn_close]`. `btn_close` 신규 추가 (window.history.back). 사전 disabled (userTo.length===0 등) 제거 — 핸들러가 V-001 / V-002 ErrorModal 차단 + isSaving / isSearching 만 유지 (double-click 방지).
>
> **Round 5 결정 (2026-06-04 사용자 명시)**:
> 1. **본인 (Copy 대상) 제외** — `searchUserList(pUserIdCopy)` 응답에서 Copy 대상 본인 row 제외. BE `WHERE S.USER_ID <> :pUserIdCopy AND S.USER_EMP_NO <> :pUserIdCopy`, FE `handleSearch` 직후 + `performSave` 직후 `loadUserList(excludeUserIdCopy)` 재호출 (`m-mcm/page-components/csa/commUserRoleCopy/page.tsx:152~180,191~220,314~357` + `mcm-core/.../CommUserRoleCopyService.java:122~155`).
> 2. **권한 복사 save fix** — Round 5 결함: 종전 `entityManager.persist()` 분기는 OASIS transaction 컨텍스트에서 commit 안 됨 (가이드 §6-B "@Transactional ✗" 정책상 EM persist 는 별도 flush/commit 후크 누락). fix: `secUserMappingRepository.save(m)` 로 복원 (JpaRepository 자체 트랜잭션 정합 — commRoleGrpMng SecRoleGroupMapping 동일 패턴). target == source 가드 + 진단 로그 + `entityManager.flush()` 추가 (`CommUserRoleCopyService.java:290~344`).
> 3. **userTo 그리드 selectable 제거** — 옮긴 사용자 = 복사 대상이라 체크 불필요. CHK 컬럼 제거 (As-Is GE-002 1 컬럼 `displaytype=checkboxcontrol` 폐기). `handleShuttleRight` semantics 변경 "선택행 복귀" → **"전체 복귀"** (잘못 옮긴 경우 전체 되돌리기로 단순화).
>
> **As-Is 1:1 위반 (의도적 — Round 5 사용자 결정)**:
> - **D-V1**: GE-002-1 (`CHK` 컬럼 checkbox / selecttype) 폐기 — As-Is xfdl `grd_userTo` 1 컬럼 `displaytype="checkboxcontrol"` (분석 §3.3-C / 본 §3.6 / §4.3) 1:1 보존 ✗.
> - **D-V2**: 셔틀 우 (B-004 `btn_right`) 동작 "선택행 복귀 + CHK=0 해제" (As-Is xfdl:425) → "전체 복귀". 분석 §4.1 B-004 비고 1:1 보존 ✗.
> - **D-V3**: `searchUserList` 응답에 Copy 대상 본인 포함 (As-Is selectUserList xml:7~19) → 본인 제외. 분석 §6.1 #1 selectUserList SQL 본문 1:1 보존 ✗.
> - 사유: 자기 자신에게 자기 권한 복사 = no-op (의미 없음) / 옮긴 사용자 전체 = 복사 대상 (부분 복귀 use case 없음). 사용자 명시 결정 — As-Is 결함 보정으로 분류.
>
> <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
> **Round 6 결정 (2026-06-04 사용자 명시)**:
> 1. **UI 라벨 명확화 (방향 의미)** — "Copy 대상" → **"권한 부여자 (source)"** / "사용자 List" → **"권한 복사 받을 대상 List"** / "권한생성 대상" → **"권한 복사 받을 대상자"** 등 총 6개 라벨 갱신 (D-007 / D-008 / D-009 + 패널 헤더). FE `page.tsx` Section title / Panel header 라벨 일괄 변경.
> 2. **정보처리의뢰서 / 처리사유 영역 전체 제거** — D-001 ~ D-004 / D-011 / D-012 (정보처리의뢰서번호 / 처리사유 입력 + 박스 + 라벨) 일괄 폐기. FE state (`infReqNo` / `description`) / Input 컴포넌트 / 중앙 form wrapper (Detail header marginTop:32 + DETAIL_TABLE_STYLE) 모두 제거. BE `blankToNull` 정규화로 `SecUserRollHis` 의 `INF_REQ_NO` / `DESCRIPTION` 에 null 적재 — V-003 infReqNoFlag 분기 (window.confirm / M-004 / M-005) 자체 폐기. handleSave 즉시 performSave 호출로 단순화.
> 3. **레이아웃 재정렬** — 권한 복사 받을 대상자 그리드 (구 A-USER-TO) 가 중앙 패널 **최상단** 으로 이동 (Detail 영역 제거 후 위로 끌어올림). userTo 그리드 height = **704 px** 정렬 통일 (좌측 패널 grd_copyUser + grd_copyRoleGroup 합산 높이와 맞춤). 중앙 narrow 폭 480 보존.
>
> **Round 7 결정 (2026-06-04~05 사용자 명시)**:
> 1. **btn_close 완전 제거** — As-Is xfdl 의 `btn_close` (commonTop basic 4 의 마지막) → ToBe 에서 **완전 제거**. `PageLayout.buttons` 배열에서 `btn_close` entry 삭제, `handleClose` dead code 제거. 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) → ToBe **3 버튼 표준 (조회/초기화/저장)**. 사유: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼은 의미 ✗.
>
> **As-Is 1:1 위반 (의도적) 추가분 (Round 6~7)**:
> - <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> **D-V4 (Round 6)**: D-001 ~ D-004 / D-011 / D-012 (정보처리의뢰서번호 + 처리사유 입력/박스/라벨) 폐기 — As-Is xfdl `div_infReq` 2 행 header 입력 (xfdl:71~83) 1:1 보존 ✗. BE blankToNull 정규화로 SecUserRollHis 에 null 적재.
> - <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> **D-V5 (Round 6)**: D-007 / D-008 / D-009 + 패널 헤더 라벨 문구 갱신 — As-Is xfdl `edt_srch_cseq` text="COPY 대상" / "권한생성 대상" / "사용자 List" → To-Be "권한 부여자 (source)" / "권한 복사 받을 대상자" / "권한 복사 받을 대상 List". 텍스트 1:1 보존 ✗.
> - <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 --> **D-V6 (Round 7)**: B-006 (`btn_close` PageLayout basic 4 마지막) 폐기 — As-Is xfdl `commonTopButton` basic ["btn_close"] (xfdl:268) 1:1 보존 ✗. portal 탭 close = host 위임으로 화면 내부 닫기 버튼 무의미.

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
- 표시 형식 (MES 단일 룰): `mcm:commUserRoleCopy`
- moduleId 정본: 01 A.1 (업무 페이지는 `portal` 금지)

### 1.2 화면 설계 대상 영역 (PageLayout 기반)

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
```
┌────────────────────────────────────────────────────────────────────────┐
│ PageLayout.title = "사용자 권한 일괄 등록"                                  │
│ PageLayout.buttons = [ btn_search, btn_save ]  (Round 7 — btn_close 폐기) │
│  ├─ SearchArea  (A-FILTER)                                              │
│  │    └─ SearchField × 1  (S-001 권한 부여자 (source) 사용자 ID/사번)         │
│  ├─ FoldButton (B-005 div_search 접기/펴기)                              │
│  └─ ContentBody (MAIN — 3 컬럼 + 셔틀 — Round 6 Detail 영역 제거)          │
│        ├─ ContentPanel-LEFT  (A-COPY)  width=310                        │
│        │     ├─ Section "권한 부여자 (source)" (D-V5)                     │
│        │     │   └─ AgDataGrid (grd_copyUser, G-001~G-003)               │
│        │     └─ Section "역할그룹"                                        │
│        │         └─ AgDataGrid (grd_copyRoleGroup, GE-001-*)             │
│        ├─ ContentPanel-MID   (A-USER-TO) width=480 narrow                │
│        │     └─ Section "권한 복사 받을 대상자" (D-V5)                       │
│        │         └─ AgDataGrid (grd_userTo, GE-002-2~5 — height 704)     │
│        ├─ Shuttle (btn_left + btn_right) width=60 flex                   │
│        └─ ContentPanel-RIGHT (A-USER-FROM)                               │
│              ├─ Section "권한 복사 받을 대상 List" (D-V5)                  │
│              │  + filter (USER + DEPT)                                   │
│              └─ AgDataGrid (grd_userFrom, GE-003-2~5 — selectable)       │
└────────────────────────────────────────────────────────────────────────┘
```

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 영역 | 담당 컴포넌트 | 비고 |
|---|---|---|
| SIDEBAR / HEADER / TabsBar | portal PortalShell | 화면별 설계 대상 아님 |
| 페이지 타이틀 / 상단 버튼바 | `PageLayout` `title` / `buttons` | `title` = "사용자 권한 일괄 등록" / `buttons` = **[btn_search, btn_save]** (Round 7 — btn_close 폐기 D-V6) |
| A-FILTER (조회조건) | `SearchArea` + `SearchField` × 1 | `@dk-oasis/shared/layout` |
| A-COPY 영역 (좌측 width=310) | `ContentPanel` + Section × 2 + `AgDataGrid` × 2 | `@dk-oasis/shared/layout` + `@dk-oasis/shared/grid`. Section title = **"권한 부여자 (source)"** (D-V5) |
| A-USER-TO 영역 (중앙 width=480 narrow) | `ContentPanel` + Section + `AgDataGrid` × 1 (height=704) | **Round 6**: Detail wrapper (의뢰서번호 + 처리사유) 전체 제거 (D-V4). Section title = **"권한 복사 받을 대상자"** (D-V5) |
| Shuttle (양방향) | `IconButton` × 2 (`btn_WF_ShuttleDeleteH` / `btn_WF_ShuttleAddH`) | `@dk-oasis/shared/form` |
| A-USER-FROM 영역 (우측 가변) | `ContentPanel` + Section + filter `TextField` × 2 + commonLeftButton + `AgDataGrid` × 1 | Section title = **"권한 복사 받을 대상 List"** (D-V5) |
| 팝업 | 없음 (분석 §5) | - |

---

## 2. 화면 레이아웃

### 2.1 레이아웃 유형 + 페이지 유형 자동 결정

| 항목 | 값 |
|---|---|
| **페이지 유형 (자동 결정)** | **D 다중 그리드** (분석 §3 — G=3 + GE 3종 = 12 + D=0 + L=0 → GE≥1 충족) |
| **레이아웃 유형** | **3 컬럼 분할형 + 셔틀** (As-Is xfdl: div_copyUser/div_copyRoleGroup width=300 좌측 / div_infReq + div_userTo width=600 중앙 / btn_left/right 셔틀 24 / div_userFrom right=0 우측 가변) |
| **참조 화면** | (없음 — As-Is mui 환경의 셔틀 + 일괄복사 패턴은 별도 화면 ✗) |

### 2.2 메인 영역 구조도 (As-Is 좌표 1:1 보존)

```
top=0 ──────────────────────────────────────────────────────  left=20, right=20
│ A-TITLE (div_title, height=40)                              │
│  edt_title "사용자 권한 일괄 등록" (left=0/top=10/width=250)  │
│  div_topMenu (left=270, right=0, top=10) — btn_search+btn_save│
top=40 ─────────────────────────────────────────────────────
│ A-FILTER (div_search, height=43, cssclass=div_WFSA_Box)     │
│  [Copy 대상 사용자 ID/사번] [edt_userIdCopy width=160]       │
top=93 ─────────────────────────────────────────────────────
│ B-005 btn_fold (height=12, 접기 토글)                        │
top=110 ────────────────────────────────────────────────────
│ A-MAIN (div_main, bottom=40)                                │
│ ┌─────────┐  ┌─────────────────┐ ┌─┐ ┌─────────────────┐  │
│ │ A-COPY  │  │ A-RIGHT          │ │S│ │ A-USER-FROM     │  │
│ │ width=300│  │ width=600        │ │H│ │ right=0 가변     │  │
│ │          │  │                  │ │U│ │                  │  │
│ │ div_     │  │ div_infReq       │ │T│ │ div_search       │  │
│ │ copyUser │  │ (top=0/h=80)     │ │T│ │ (top=22/h=38)    │  │
│ │ (h=77)   │  │  "권한생성 대상"  │ │L│ │ ID/사번/이름+부서│  │
│ │  COPY    │  │  의뢰서번호 입력  │ │E│ │ filter           │  │
│ │  대상    │  │  처리사유 입력    │ │ │ │ div_leftMenu     │  │
│ │  grd_    │  │                  │ │←│ │ commonLeftButton │  │
│ │  copyUser│  │ div_userTo       │ │ │ │ (전체선택 CHK)   │  │
│ │ ────     │  │ (top=infReq:10/  │ │ │ │ grd_userFrom     │  │
│ │ div_copy │  │  bottom=20)      │ │→│ │ (top=leftMenu:5/ │  │
│ │ RoleGroup│  │  grd_userTo      │ │ │ │  bottom=0)       │  │
│ │ (top=copy│  │  GE-002 5컬럼    │ │ │ │  GE-003 5컬럼    │  │
│ │  User:10/│  │                  │ │ │ │                  │  │
│ │  bottom= │  │                  │ │ │ │                  │  │
│ │  20)     │  │                  │ │ │ │                  │  │
│ │ 역할그룹 │  │                  │ │ │ │                  │  │
│ │  GE-001  │  │                  │ │ │ │                  │  │
│ │ 2 컬럼   │  │                  │ │ │ │                  │  │
│ └─────────┘  └─────────────────┘ └─┘ └─────────────────┘  │
bottom=40 ──────────────────────────────────────────────────
│ A-FOOTER (div_bottom, height=20, cssclass=div_WF_Footer)    │
│  commonBottomStatus.xfdl include                            │
bottom=0 ───────────────────────────────────────────────────
```

---

## 3. 영역별 배치 상세

### 3.1 영역 크기 및 배치

> **W5-A 적용 (Round 1~5)**: 좌·우 그리드 영역 확장을 위해 중앙 패널 폭 600 → 480 narrow / 우측 가변 = flex:1 (To-Be `m-mcm/page-components/csa/commUserRoleCopy/page.tsx:432~613` 정본). 좌측은 As-Is 300 → 310 (`ContentPanel width={310}` Round 1 정합) 보존.

| 영역 | 높이 | 너비 (As-Is xfdl) | 너비 (To-Be React W5-A) | 스크롤 | 리사이즈 | 비고 |
|---|---|---|---|---|---|---|
| A-TITLE | 40 px 고정 | 100% (left=20 / right=20) | `PageLayout.title` 자동 | 없음 | N | div_title (xfdl:175) — To-Be `PageLayout` |
| A-FILTER | 43 px 고정 | 100% (left=20 / right=20) | `SearchArea` 1 필드 | 없음 | N (btn_fold 로 접기/펴기 토글) | div_search (xfdl:183) — To-Be SearchArea |
| A-FOLD | 12 px 고정 | 100% (left=20 / right=20) | (미적용 — SearchArea 자체 접기 기능) | 없음 | N | btn_fold (xfdl:7) |
| A-MAIN | 가변 (top=btn_fold:5 / bottom=40) | 100% (left=20 / right=20) | `ContentBody root` flex | 없음 (자식 그리드별 세로) | Y (xfdl 좌→우 width 고정 + 가변 우측) | div_main (xfdl:8) |
| A-COPY-USER (좌측 상단) | 77 px 고정 | width=300 (left=0) | `ContentPanel width=310` GridPanel | 없음 | N | div_copyUser (xfdl:11) — Round 1 310 px |
| A-COPY-ROLEGRP (좌측 하단) | 가변 (top=`div_copyUser:10` / bottom=20) | width=300 (left=0) | 좌측 ContentPanel 내 두번째 GridPanel | 세로 (grd) | N | div_copyRoleGroup (xfdl:43) |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| ~~A-INF-REQ (중앙 상단)~~ | **폐기 (Round 6 D-V4)** | (As-Is 80 px 고정 width=600 left=340) | **제거** — Detail wrapper 자체 폐기. BE blankToNull 로 SecUserRollHis 에 null 적재 | - | - | div_infReq (xfdl:71) 폐기 — D-001~D-004 / D-011 / D-012 일괄 제거 |
| A-USER-TO (중앙 최상단) | **704 px 정렬 통일** (Round 6 — 좌측 패널 grd_copyUser + grd_copyRoleGroup 합산 높이 맞춤) | width=600 (left=340) | 중앙 `ContentPanel width=480 narrow` 내 GridPanel (단일 영역 — Detail 폐기로 위로 끌어올림) | 세로 (grd) | N | div_userTo (xfdl:84) — Section title "권한 복사 받을 대상자" (D-V5) |
| A-SHUTTLE | 좌측 31px + 우측 31px (btn 각 31 height) | width=24 (left=`div_userTo:15`) | width=60 flex column (Button × 2 / gap:8) | 없음 | N | btn_left top=322 / btn_right top=363 (xfdl:121~122) — shared `Button` 적용 |
| A-USER-FROM (우측 가변) | 가변 (top=0 / bottom=20) | left=`btn_left:15` / right=0 | `ContentPanel` (width 미지정 → flex:1 가변) | 세로 (grd) | Y (right=0 → 가변) | div_userFrom (xfdl:123) |
| A-FOOTER | 20 px 고정 | 100% (left=20 / right=20) | (미적용 — PortalShell 가 공통 처리) | 없음 | N | div_bottom (xfdl:6) |

### 3.2 A-FILTER 내부 배치 (좌표 As-Is 1:1)

```
top=10 ─────────────────────────────────────────────────────────────────────
│ [Copy 대상 사용자 ID/사번]  [edt_userIdCopy]                                │
│  ↑                            ↑                                            │
│  sts_userId (left=10/         left=sts_userId:10 / top=10                   │
│  top=10/width=156/             width=160 / height=21                        │
│  height=21)                                                                 │
│  cssclass=edi_WFSA_Label       maxlength=100                                │
│  text="Copy 대상 사용자 ID/사번"                                            │
top=31 ─────────────────────────────────────────────────────────────────────
```

| 컨트롤 | 정확한 xfdl 좌표 | cssclass | 비고 |
|---|---|---|---|
| sts_userId (S-001 라벨) | left=10 / top=10 / width=156 / height=21 | edi_WFSA_Label | text="Copy 대상 사용자 ID/사번", tabstop=false, readonly=true |
| edt_userIdCopy (S-001 입력) | left=sts_userId:10 / top=10 / width=160 / height=21 | (없음) | maxlength=100 |

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### 3.3 A-COPY-USER 내부 배치 (권한 부여자 (source) 영역 — D-V5 라벨 갱신)

```
top=0 ──────────────────────────────────────────────────────────  width=310
│ edt_srch_cseq (D-007 라벨) — text 갱신                                       │
│  left=0 / top=0 / width=77 / height=21                                     │
│  cssclass=edi_WF_Title1, value="권한 부여자 (source)" (D-V5), readonly       │
top=25 ─────────────────────────────────────────────────────────────────────
│ grd_copyUser (G-001~G-003)                                                  │
│  left=0 / top=25 / right=0 / bottom=0                                       │
│  Format: head 1줄 (25px) + body 1줄 (25px) / Column 3개                     │
│  Columns: 117/101/80 (총 298 px)                                            │
│                                                                              │
│  Head row 0:  사용자ID  │ 사번        │ 사용자명                              │
│  Body row:    USER_ID     USER_EMP_NO   USER_NM                              │
│                                                                              │
│  options: font=12px/Malgun Gothic, autofittype=col, cellmovingtype=col,     │
│           selecttype=row, scrollbartype=auto                                │
│  events:  onkeydown="div_main_div_mainGrd_grd_main_onkeydown" (미정의)       │
│           onheadclick="fn_onHeadClick" → gfn_commonOnheadclick (xfdl:502)    │
│  dataset: ds_copyUser (onrowposchanged="ds_main_onrowposchanged" 미정의)     │
bottom=0 ──────────────────────────────────────────────────────────────────
```

### 3.4 A-COPY-ROLEGRP 내부 배치 (COPY 대상 역할그룹 List)

```
top=0 ──────────────────────────────────────────────────────────  width=300
│ grd_copyRoleGroup (GE-001-1 ~ GE-001-2)                                     │
│  left=0 / top=0 / right=0 / bottom=0                                        │
│  Format: head 1줄 (24px) + body 1줄 (24px) / Column 2개                     │
│  Columns: 120/170 (총 290 px)                                                │
│                                                                              │
│  Head row 0:  역할 그룹 ID  │ 역할 그룹명                                     │
│  Body row:    ROLE_GROUP_ID   ROLE_GROUP_NM                                  │
│                                                                              │
│  options: autofittype=col                                                    │
│  events:  onheadclick="fn_onHeadClick"                                       │
│  dataset: ds_copyRolegrp (USER_ID 컬럼도 보유 — 표시 ✗)                       │
bottom=0 ──────────────────────────────────────────────────────────────────
```

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### 3.5 ~~A-INF-REQ 내부 배치~~ (Round 6 D-V4 — 영역 전체 폐기)

> **Round 6 (2026-06-04, 사용자 명시) — D-V4 위반**: 본 §3.5 영역 전체 폐기. D-001 ~ D-004 / D-011 / D-012 (정보처리의뢰서번호 + 처리사유 입력 + 박스 + 라벨) 일괄 제거. FE state `infReqNo` / `description` / Input 컴포넌트 / 중앙 form wrapper (marginTop:32 + DETAIL_TABLE_STYLE + 28px gray header) 모두 제거. BE `blankToNull` 정규화로 `SecUserRollHis` 의 `INF_REQ_NO` / `DESCRIPTION` 컬럼에 null 적재. V-003 `infReqNoFlag` 분기 (window.confirm M-004 / M-005) 자체 폐기 — handleSave 즉시 performSave 호출로 단순화.
>
> As-Is xfdl `div_infReq` (xfdl:71~83) 정본 인용 보존을 위해 본 영역 좌표는 분석리포트 §3.4 D-001~D-004 / D-011 / D-012 / D-008 행에 그대로 남기되, 본 디자인설계서 §3.5 좌표 도식은 To-Be 미존재로 제거한다. 중앙 패널은 §3.6 A-USER-TO 단일 영역으로 통합 (Round 6 레이아웃 재정렬 — userTo 그리드가 중앙 패널 최상단으로 이동).
>
> (As-Is 좌표 보존은 분석리포트 §3.4 참조 — 본 §3.5 좌표 도식 미보존)

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### 3.6 A-USER-TO 내부 배치 (권한 복사 받을 대상자 그리드 — D-V5 라벨 갱신)

> **Round 5 (2026-06-04, 사용자 명시) — D-V1 위반**: As-Is xfdl `grd_userTo` 의 GE-002-1 (`CHK` 컬럼, displaytype=checkboxcontrol) 폐기. 옮긴 사용자 = 복사 대상이라 체크 불필요. To-Be 4 컬럼 (USER_ID / USER_EMP_NO / USER_NM / DEPT_NM) — `selectable / multiSelect / onRowSelect` 모두 제거 (`page.tsx:99~104,520~532`).
> **Round 6 (2026-06-04, 사용자 명시) — D-V5 + 레이아웃 재정렬**: Section title 라벨 "권한생성 대상" → **"권한 복사 받을 대상자"**. 중앙 Detail wrapper 폐기 (D-V4) 로 본 그리드가 중앙 패널 **최상단** 으로 이동. height = **704 px** 정렬 통일 (좌측 패널 합산 높이 맞춤).

```
top=0 ──────────────────────────────────────────────────────────  width=480 (W5-A narrow) / height=704 (Round 6)
│ Section title: "권한 복사 받을 대상자" (D-V5 — As-Is "권한생성 대상" 갱신)      │
│ grd_userTo (GE-002-2 ~ GE-002-5 — D-V1 GE-002-1 폐기)                       │
│  left=0 / top=0 / right=0 / bottom=0 / height=704                            │
│  Format: head 1줄 (25px) + body 1줄 (25px) / Column 4개 (As-Is 5 → To-Be 4)  │
│  Columns: 117/101/100/130 (총 448 px / columnSizing="fit")                   │
│                                                                              │
│  Head row 0:  사용자ID  │ 사번        │ 사용자명 │ 부서                       │
│  Body row:    USER_ID     USER_EMP_NO   USER_NM    DEPT_NM                   │
│                                                                              │
│  options: AgDataGrid columnSizing="fit", sortable=false, rowKey="__rowId"   │
│           (합성 rowKey — AgDataGrid rowKey 단일 컬럼만 지원 + 동일 USER_ID    │
│            충돌 방지)                                                         │
│  events:  (selectable / onRowSelect 모두 ✗ — 전체 복귀 semantics)             │
│  emptyMessage: "셔틀로 권한 복사 받을 대상자를 추가하세요." (D-V5 갱신)         │
bottom=0 ──────────────────────────────────────────────────────────────────
```

### 3.7 A-SHUTTLE 내부 배치 (셔틀 2 버튼)

> **Round 5 (2026-06-04, 사용자 명시) — D-V2 위반**: B-004 동작 "선택행 복귀 + CHK=0 해제" (As-Is xfdl:425) → **"전체 복귀"**. `userTo` 그리드 selectable 제거 (§3.6 D-V1) 에 따라 부분 복귀 use case 없음 — 잘못 옮긴 경우 전체 되돌리기로 단순화. (`page.tsx:266~291`).

| 버튼 | xfdl 좌표 | cssclass / To-Be | 동작 | 비고 |
|---|---|---|---|---|
| btn_left (B-003) | left=div_userTo:15 / top=322 / width=24 / height=31 | As-Is `btn_WF_ShuttleDeleteH` → To-Be shared `Button` (D-1 fix 2026-06-01) | userFrom selectedKeys → userTo 이동 (As-Is CHK=1 등가 — selectable + multiSelect + onRowSelect 기반) | `disabled={userFromSelectedKeys.length === 0}` / aria 라벨 보유. 중복 방지 (userTo 동일 USER_ID skip) (`page.tsx:225~259,547~554`) |
| btn_right (B-004) | left=div_userTo:15 / top=363 / width=24 / height=31 | As-Is `btn_WF_ShuttleAddH` → To-Be shared `Button` (D-1 fix) | **userTo 전체 → userFrom 복귀** (D-V2 위반, Round 5) | `disabled={userTo.length === 0}`. As-Is "CHK=1 행만 복귀" 폐기 — userTo.length === 0 이면 차단 메시지 (M-?). `existingIds` 가드로 userFrom 중복 방지 (`page.tsx:266~291,555~562`) |

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### 3.8 A-USER-FROM 내부 배치 (권한 복사 받을 대상 List + 필터 — D-V5 라벨 갱신)

```
top=0 ──────────────────────────────────────────────────────────  right=0
│ edt_srch_cseq (D-009 라벨) — text 갱신                                       │
│  left=0 / top=0 / width=83 / height=21                                      │
│  cssclass=edi_WF_Title1, value="권한 복사 받을 대상 List" (D-V5), readonly   │
top=22 ─────────────────────────────────────────────────────────────────────
│ div_search (cssclass=div_WFSA_Box, left=0/top=22/height=38/right=0)         │
│ ┌──────────────────────────────────────────────────────────────────┐       │
│ │ [ID/사번/이름] [edt_userFilter]  [부서]  [edt_deptFilter]          │       │
│ │  ↑              ↑                 ↑       ↑                        │       │
│ │  sts_userId   width=150       sts_dept  right=10 (가변 width)      │       │
│ │  (84w)         maxlength=100   (36w)    maxlength=100              │       │
│ │  edi_WFSA_     oninput=userFilter        oninput=deptFilter        │       │
│ │  Label                                                              │       │
│ └──────────────────────────────────────────────────────────────────┘       │
top=60 ─────────────────────────────────────────────────────────────────────
│ div_leftMenu (left=0 / top=div_search:5 / width=220 / height=21)            │
│  url include `_com_div::commonLeftButton.xfdl`                              │
│  → 전체선택 CHK 토글 (commonLeftButton 의 외부 동작)                          │
top=86 ─────────────────────────────────────────────────────────────────────
│ grd_userFrom (GE-003-1 ~ GE-003-5)                                          │
│  left=0 / top=div_leftMenu:5 / right=0 / bottom=0                           │
│  Format: head 1줄 (25px) + body 1줄 (25px) / Column 5개                     │
│  Columns: 48/117/101/80/120 (총 466 px)                                      │
│                                                                              │
│  Head row 0:  선택  │ 사용자ID  │ 사번        │ 사용자명 │ 부서              │
│  Body row:    CHK    USER_ID     USER_EMP_NO   USER_NM    DEPT_NM            │
│  ↑                                                       ↑                  │
│  checkbox                                              tooltiptext=DEPT_NM   │
│                                                                              │
│  options: 동일 + gfn_gridSelectedRow(red, blue, "") 선택 행 색상 (xfdl:254)  │
│  events:  동일                                                               │
│  dataset: ds_userFrom (5 컬럼)                                               │
bottom=0 ──────────────────────────────────────────────────────────────────
```

### 3.9 A-TITLE 내부 배치 (타이틀 + commonTopButton)

| 컨트롤 | xfdl 좌표 | cssclass | 비고 |
|---|---|---|---|
| edt_title (D-010) | left=0 / top=10 / width=250 / height=27 | edi_WFHD_Title | text="사용자 권한 일괄 등록", textAlign=left, readonly |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| div_topMenu | left=270 / top=10 / right=0 / height=27 | (외부 include) | url=`_com_div::commonTopButton.xfdl` — btn_search + btn_save + basic["btn_close"] (fn_button, xfdl:265~271). **Round 7 D-V6**: ToBe `PageLayout.buttons = [btn_search, btn_save]` 2 버튼만 (btn_close 폐기) |

### 3.10 A-FOOTER 내부 배치

| 컨트롤 | xfdl 좌표 | 비고 |
|---|---|---|
| div_bottom | left=20 / right=20 / bottom=0 / height=20 | cssclass=div_WF_Footer, url=`_com_div::commonBottomStatus.xfdl` |

---

## 4. 그리드 디자인 상세

### 4.1 G 그리드 (grd_copyUser)

| 항목 | 값 |
|---|---|
| dataset binding | `ds_copyUser` (분석 DS-002) |
| selecttype | row |
| autofittype | col |
| 컬럼 폭 합계 | 298 px |
| head 행수 | 1 (size=25) |
| body 행수 | 1 행만 표시 (Copy 대상 1 명만) |
| 정렬 / 헤드 클릭 | `gfn_commonOnheadclick` |
| 행 클릭 | (없음 — 표시 전용) |
| 편집 | USER_ID 컬럼 edittype="none" 강제 (xfdl:32) — 전체 read-only |

### 4.2 GE-001 그리드 (grd_copyRoleGroup)

| 항목 | 값 |
|---|---|
| dataset binding | `ds_copyRolegrp` (분석 DS-001) |
| selecttype | (기본) |
| autofittype | col |
| 컬럼 폭 합계 | 290 px |
| head 행수 | 1 (size=24) |
| body 행수 | 24 (size=24) — N rows (검색 결과만큼) |
| 정렬 / 헤드 클릭 | `gfn_commonOnheadclick` |
| 행 클릭 | (없음 — 표시 전용) |
| 편집 | 표시 전용 |

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### 4.3 GE-002 그리드 (grd_userTo) — Round 6 height 704 / Section title 갱신

> **W5-D 적용 (Round 2~5)**: 모든 컬럼 `editable: false` 정합 — 표시 전용 (`page.tsx:99~104`).
> **Round 5 (2026-06-04, 사용자 명시) — D-V1 위반**: CHK 컬럼 폐기 — `selectable` 자체 제거.
> **Round 6 (2026-06-04, 사용자 명시) — D-V4 / D-V5 / 레이아웃 재정렬**: 중앙 Detail wrapper 폐기로 본 그리드가 중앙 패널 **최상단** 으로 이동. height = **704 px** 통일. Section title "권한생성 대상" → "권한 복사 받을 대상자".

| 항목 | As-Is 값 | To-Be 값 (W5-A / W5-D / Round 5~6) |
|---|---|---|
| dataset binding | `ds_userTo` (분석 DS-004) | React state `userTo: (CommUserRoleCopyUserToRow & RowWithKey)[]` |
| 그리드 컴포넌트 | xfdl Grid (selecttype=row) | `AgDataGrid` (`@dk-oasis/shared/grid`) |
| Section title | "권한생성 대상" (As-Is xfdl:75) | **"권한 복사 받을 대상자"** (D-V5, Round 6) |
| grid height | (가변 top=`div_infReq:10` / bottom=20) | **704 px 고정** (Round 6 — 좌측 패널 합산 높이 맞춤) |
| selectable | (xfdl 의 row 선택 자체는 기본) | **✗ 명시 disabled** (D-V1 위반) — `selectable / multiSelect / onRowSelect` 모두 미적용 |
| autofittype | col | `columnSizing="fit"` |
| 컬럼 수 | 5 (CHK + USER_ID + USER_EMP_NO + USER_NM + DEPT_NM) | **4** (CHK 폐기) — USER_ID / USER_EMP_NO / USER_NM / DEPT_NM |
| 컬럼 폭 합계 | 446 px | 448 px (columnSizing="fit" — 컨테이너 적응) |
| head 행수 | 1 (size=25) | 1 (AgDataGrid 기본) |
| body 행수 | 1 (size=25) — N rows (셔틀 이동 시 누적) | N rows (셔틀 좌 누적, 셔틀 우로 전체 비움) |
| editable | USER_ID: `edittype="none"` / 그외 normal | **모두 false** (W5-D) |
| rowKey | (xfdl 자동) | `"__rowId"` (합성 키 — `ut-{idx}-{USER_ID}`) |
| sortable | (xfdl 헤드클릭 정렬) | `sortable={false}` (셔틀 누적 순 유지) |
| 행 동작 | 셔틀 우 (btn_right) 클릭 시 CHK=1 행 ds_userFrom 으로 복귀 + CHK 해제 | **셔틀 우 → 전체 복귀** (D-V2 위반) — selectedKeys 추적 ✗ |
| emptyMessage | (xfdl 자체 메시지 없음) | **"셔틀로 권한 복사 받을 대상자를 추가하세요."** (D-V5 갱신) |

### 4.4 GE-003 그리드 (grd_userFrom)

> **W5-D 적용 (Round 2~5)**: 모든 컬럼 `editable: false` 정합 (`page.tsx:110~115`).
> **Round 5 (2026-06-04, 사용자 명시) — D-V3 위반**: `searchUserList` 응답에서 Copy 대상 본인 row 제외. As-Is `selectUserList` SQL 본문 1:1 보존 ✗. handleSearch 직후 + performSave 직후 `loadUserList(excludeUserIdCopy)` 재호출.

| 항목 | As-Is 값 | To-Be 값 (W5-A / W5-D / Round 5) |
|---|---|---|
| dataset binding | `ds_userFrom` (분석 DS-003) | React state `userFrom: (CommUserRoleCopyUserFromRow & RowWithKey)[]` |
| 그리드 컴포넌트 | xfdl Grid (selecttype=row) | `AgDataGrid` |
| selectable | (xfdl row 선택 + commonLeftButton 전체선택 토글) | **`selectable + multiSelect + onRowSelect`** (D-2 fix 2026-06-01 — As-Is CHK + commonLeftButton 등가물. 헤더 native 전체선택 + 행 native 체크박스) |
| autofittype | col | `columnSizing="fit"` |
| 컬럼 수 | 5 (CHK + USER_ID + USER_EMP_NO + USER_NM + DEPT_NM) | **4** (CHK 폐기 — selectable 이 자동 렌더) — USER_ID / USER_EMP_NO / USER_NM / DEPT_NM |
| 컬럼 폭 합계 | 466 px | 448 px (columnSizing="fit") |
| head 행수 | 1 (size=25) | 1 (AgDataGrid 기본) |
| body 행수 | 1 (size=25) — N rows (selectUserList 결과 만큼, **Copy 대상 본인 제외 — D-V3**) | N rows (필터 적용 후 `filteredUserFrom`) |
| editable | USER_ID: `edittype="none"` / 그외 normal | **모두 false** (W5-D) |
| rowKey | (xfdl 자동) | `"__rowId"` (합성 키 — `uf-{idx}-{USER_ID}`) |
| sortable | (xfdl 헤드클릭 정렬) | `sortable={false}` |
| DEPT_NM 컬럼 | head 의 tooltiptext="bind:DEPT_NM" (긴 부서명 툴팁) | (AgDataGrid 기본 cell overflow) |
| 선택 행 색상 | `gfn_gridSelectedRow(grd_userFrom, "red", "blue", "")` — 빨강 텍스트 / 파랑 배경 (xfdl:254) | (AgDataGrid 기본 selected highlight) |
| 필터 | `ds_userFrom.filter(...)` — D-005 (USER) + D-006 (DEPT) oninput | client-side `filteredUserFrom` — userFilter (USER_ID/USER_EMP_NO/USER_NM OR LIKE upper) AND deptFilter (DEPT_NM LIKE upper) (`page.tsx:297~309`) |
| 본인 제외 (Round 5) | (As-Is ✗ — 전체 사용자) | **handleSearch 후 BE 가 응답에서 제외** (`searchUserList(pUserIdCopy)`). 초기 onload 는 pUserIdCopy="" → 전체. |

---

## 5. 입력 컴포넌트 디자인 (D-NNN)

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### 5.1 ~~D-001 ~ D-004 (정보처리의뢰서번호 + 처리사유)~~ — Round 6 D-V4 전체 폐기

> **Round 6 (2026-06-04, 사용자 명시) — D-V4 위반**: D-001 (edt_st_infReqNo 라벨) / D-002 (edt_infReqNo 입력) / D-003 (edt_st_description 라벨) / D-004 (edt_description 입력) / D-011 (stc_Static28 박스) / D-012 (stc_Static29 박스) 전체 폐기. FE state / Input / 중앙 form wrapper 제거. BE `blankToNull` 정규화로 `SecUserRollHis.INF_REQ_NO` / `DESCRIPTION` 컬럼에 null 적재. V-003 `infReqNoFlag` 분기 (window.confirm M-004 / M-005) 자체 폐기 — handleSave 즉시 performSave 호출로 단순화.

| 컨트롤 | 상태 | 비고 |
|---|---|---|
| ~~D-002 edt_infReqNo~~ | **폐기 (Round 6 D-V4)** | FE Input 컴포넌트 / state 모두 제거. BE blankToNull → SecUserRollHis.INF_REQ_NO = null |
| ~~D-004 edt_description~~ | **폐기 (Round 6 D-V4)** | FE Input 컴포넌트 / state 모두 제거. BE blankToNull → SecUserRollHis.DESCRIPTION = null |
| ~~D-001 / D-003 라벨~~ | **폐기 (Round 6 D-V4)** | Static 라벨 미사용 |
| ~~D-011 / D-012 박스~~ | **폐기 (Round 6 D-V4)** | stc_WF_Box 미사용 |

### 5.2 D-005 / D-006 (필터)

| 컨트롤 | 유형 | maxlength | 동작 | 비고 |
|---|---|---|---|---|
| D-005 edt_userFilter | TextField | 100 | oninput → `fn_userFromFilter(value, "USER")` — USER_ID + USER_EMP_NO + USER_NM 3 컬럼 OR LIKE upper (대소문자 무시) | xfdl:130 / 438~443 / 452~471 |
| D-006 edt_deptFilter | TextField | 100 | oninput → `fn_userFromFilter(value, "DEPT")` — DEPT_NM LIKE upper | xfdl:132 / 445~450 / 473~493 |

> 두 필터는 **결합 AND** 조건. D-005 와 D-006 모두 비어있으면 필터 해제. 한쪽만 입력하면 그쪽 컬럼만 필터. 둘 다 입력하면 (USER 3 컬럼 OR) AND DEPT_NM 결합.

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### 5.3 라벨 컴포넌트 (D-007 / D-008 / D-009) — Round 6 D-V5 텍스트 갱신

> 모든 라벨은 Edit (readonly=true / tabstop=false) 로 구현. cssclass=edi_WF_Title1 — 강조 표시.
> **Round 6 (2026-06-04, 사용자 명시) — D-V5 위반**: 라벨 텍스트 6건 일괄 갱신 (방향성 명확화).

| 컨트롤 | As-Is text | To-Be text (D-V5 갱신) | 위치 |
|---|---|---|---|
| D-007 | "COPY 대상" | **"권한 부여자 (source)"** | div_copyUser 상단 |
| D-008 | "권한생성 대상" | **"권한 복사 받을 대상자"** | div_userTo 상단 (Round 6 — div_infReq 폐기로 위치 이동) |
| D-009 | "사용자 List" | **"권한 복사 받을 대상 List"** | div_userFrom 상단 |

---

## 6. 팝업 디자인 (P-NNN)

해당 없음. 본 화면 팝업 ✗.

---

## 7. 액션 디자인 (B-NNN / 외부 commonTopButton)

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
> **W5-E 적용 (Round 1~5)**: As-Is xfdl:268 `commonTopButton ["btn_search","btn_save"]` + basic `["btn_close"]` 정합 → To-Be `PageLayout.buttons = [btn_search, btn_save, btn_close]`. `btn_close` 신규 추가 (window.history.back). 사전 disabled (userTo.length === 0 등) 제거 — V-001/V-002 ErrorModal 차단으로 위임. `isSearching` / `isSaving` 만 유지 (double-click 방지) (`page.tsx:392~417`).
>
> **Round 6 (2026-06-04, 사용자 명시) — V-003 분기 폐기**: D-V4 (정보처리의뢰서 / 처리사유 영역 폐기) 에 따라 V-003 `infReqNoFlag` window.confirm 분기 (M-004 / M-005) 자체 폐기. handleSave 즉시 performSave 호출로 단순화.
> **Round 7 (2026-06-04~05, 사용자 명시) — D-V6 / btn_close 완전 제거**: `PageLayout.buttons` 배열에서 `btn_close` entry 삭제 + 미사용 `handleClose` dead code 제거. 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) → ToBe **3 버튼 표준 (조회/초기화/저장)**. 사유: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼 무의미. 본 화면 PageLayout.buttons = **[btn_search, btn_save]** 2 버튼만 (As-Is 동일하지만 사유 다름).

| ID | 위치 | xfdl id | As-Is cssclass | To-Be (W5-E / Round 7) | 동작 |
|---|---|---|---|---|---|
| B-001 | 외부 commonTopButton | btn_search | (외부 컴포넌트 표준) | `PageLayout.buttons[0]` (type=`primary`, action=`search`) | 조회 트리거 (fn_search, xfdl:269) — `handleSearch` |
| B-002 | 외부 commonTopButton | btn_save | (외부 컴포넌트 표준) | `PageLayout.buttons[1]` (type=`save`, action=`save`) | 저장 트리거 (fn_save, xfdl:269) — `handleSave` (Round 6 — V-003 분기 폐기, 즉시 `performSave`) |
| B-003 | div_main / shuttle 좌 | btn_left | btn_WF_ShuttleDeleteH | shared `Button` (◀) | 셔틀 좌 (xfdl:121) — userFrom selectedKeys → userTo 이동 (`handleShuttleLeft`) |
| B-004 | div_main / shuttle 우 | btn_right | btn_WF_ShuttleAddH | shared `Button` (▶) | 셔틀 우 (xfdl:122) — **userTo 전체 → userFrom 복귀** (D-V2 위반, Round 5) — `handleShuttleRight` |
| B-005 | div_main 상단 | btn_fold | btn_WFSA_Fold | (미적용 — `SearchArea` 자체 토글) | div_search 접기/펴기 (xfdl:7) |
| ~~B-006~~ | ~~PageLayout commonTop basic~~ | ~~btn_close~~ | ~~(외부 표준)~~ | **폐기 (Round 7 D-V6)** — `PageLayout.buttons` 배열에서 entry 삭제 + `handleClose` dead code 제거 | portal 탭 close = host 위임 |

> 외부 commonTopButton 컴포넌트의 사용자정의버튼 = 빈 배열 (xfdl:268), 기본버튼 = btn_search + btn_save (xfdl:269) + basic ["btn_close"]. **Round 7**: To-Be 는 basic ["btn_close"] 폐기 (D-V6) — 가이드 §6-E 4 버튼 표준에서 ToBe **3 버튼 표준 (조회/초기화/저장)** 으로 축소. portal 탭 close 위임.

---

## 8. 색상 / 폰트 / cssclass 정본 (As-Is 보존)

| cssclass / 옵션 | 적용 위치 | 의미 (As-Is) | 비고 |
|---|---|---|---|
| `div_WF_Footer` | div_bottom | 표준 푸터 박스 | - |
| `div_WFSA_Box` | div_search (A-FILTER), div_userFrom 의 div_search | 검색 영역 박스 | - |
| `btn_WFSA_Fold` | btn_fold | 표준 접기/펴기 토글 버튼 | - |
| `edi_WF_Title1` | edt_srch_cseq 3 위치 (COPY 대상 / 권한생성 대상 / 사용자 List) | 영역 헤더 강조 라벨 | - |
| `edi_WFHD_Title` | edt_title (A-TITLE) | 페이지 타이틀 강조 | - |
| `edi_WFSA_Label` | sts_userId (S-001) / sts_dept (D-006 옆 라벨) | 검색 영역 라벨 | - |
| `edi_WF_Label` | edt_st_infReqNo (D-001) / edt_st_description (D-003) | 표준 라벨 | - |
| `stc_WF_Box` | stc_Static28 / stc_Static29 (D-011 / D-012) | 라벨 행 박스 구분선 | - |
| `btn_WF_ShuttleDeleteH` | btn_left (B-003) | 셔틀 좌 (← 화살표) | - |
| `btn_WF_ShuttleAddH` | btn_right (B-004) | 셔틀 우 (→ 화살표) | - |
| `font=12px/normal "Malgun Gothic"` | 4 그리드 (옵션 명시) | 그리드 폰트 표준 | - |
| `gfn_gridSelectedRow(grd_userFrom, "red", "blue", "")` | grd_userFrom only | 선택 행 텍스트 색=빨강 / 배경=파랑 / 폰트 없음 | xfdl:254 |

---

## 9. 인용 정합 (분석리포트 §3 ↔ 본 §1~§8)

| 본 § | 인용 정본 (분석리포트) | 인용 검증 |
|---|---|---|
| §1 | 분석 §3.1 + §3.6 | 11 영역 정합 |
| §2 | 분석 §3.1 좌표 표 | xfdl 좌표 1:1 |
| §3.1 | 분석 §3.1 (영역 크기) | 11 행 정합 |
| §3.2 | 분석 §3.2 (S-001) | 좌표 1:1 |
| §3.3 | 분석 §3.3-A (G) + §3.4 (D-007) | xfdl:6~42 |
| §3.4 | 분석 §3.3-B (GE-001) | xfdl:43~70 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| §3.5 | 분석 §3.4 (D-001 / D-002 / D-003 / D-004 / D-008 / D-011 / D-012) — **Round 6 D-V4 영역 전체 폐기 (좌표 도식 미보존, 분석 §3.4 참조)** | xfdl:71~83 |
| §3.6 | 분석 §3.3-C (GE-002) | xfdl:84~120 |
| §3.7 | 분석 §4.1 B-003 / B-004 좌표 | xfdl:121~122 |
| §3.8 | 분석 §3.3-D (GE-003) + §3.4 D-005/D-006/D-009 + §3.6 EX-002 | xfdl:123~171 |
| §3.9 | 분석 §3.4 D-010 + §3.6 EX-001 | xfdl:175~182 |
| §3.10 | 분석 §3.6 EX-003 | xfdl:6 |
| §4.1~§4.4 | 분석 §3.3-A~D + §3.7 DS-001~004 | 4 그리드 일치 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| §5 | 분석 §3.4 + §4.3 | D-001~D-012 + 필터 동작 — **Round 6 D-V4**: §5.1 (D-001~D-004 / D-011 / D-012) 폐기 + §5.3 D-007/D-008/D-009 텍스트 D-V5 갱신 |
| §6 | 분석 §5 | "해당 없음" 보존 |
| §7 | 분석 §4.1 | 5 B 일치 — **Round 7 D-V6**: B-006 (btn_close) 폐기 → ToBe `PageLayout.buttons = [btn_search, btn_save]` 2 버튼만 |
| §8 | 분석 §3.1 / §3.4 cssclass 인용 | 11 cssclass 정합 — Round 6 D-V4 로 `stc_WF_Box` 사용 ✗ (좌표 인용만 보존) |

---

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
## 10. 사용자 검수 이력 (Round 카탈로그)

> 본 절은 디자인 영역에 영향 있는 라운드만 행 보존. 정합체크서 §J 와 cross-ref. W5 패턴 A~G 표시는 frontmatter 보존.

| Round | 일자 | 변경 | 영향 § / D-NNN / G-NNN / B-NNN |
|---|---|---|---|
| Round 1 | 2026-06-02 | W5-A Layout 좌 310 / 중앙 480 narrow / 우 flex:1. W5-E `btn_close` 추가. UI 결함 D-1~D-7 일괄 보정 | §1.2 / §3.1 / §3.7 / §7 (B-001~B-006) / §3.6 (selectable+CHK 부활) |
| Round 2 | 2026-06-02 | W5-B/C 검토 결과 N/A (셔틀 + Detail 부재 + 팝업 ✗). W5-D 4 그리드 editable:false 통일 | §4.1~§4.4 (editable:false) |
| Round 3 | 2026-06-03 | Detail wrapper (marginTop:32 + border + bg + 28px gray header) + form row C 패턴 | §3.1 (A-INF-REQ 행) — **Round 6 D-V4 로 폐기** |
| Round 4 | 2026-06-03 | N/A (Detail 폭 / Textarea rows / Find Button 위치 등 본 화면 미해당) | - |
| Round 5 | 2026-06-04 | 본인 제외 (D-V3) / save fix (entityManager.persist → repository.save) / userTo selectable 제거 (D-V1 / D-V2) | §3.6 / §3.7 / §4.3 / §4.4 / §7 (B-004) |
| Round 6 | 2026-06-04 | UI 라벨 명확화 6건 (D-V5) / 정보처리의뢰서·처리사유 영역 전체 제거 (D-V4) / 레이아웃 재정렬 (userTo height 704 + 중앙 최상단 이동) | §1.2 / §3.1 (A-INF-REQ 폐기 / A-USER-TO 704) / §3.3 / §3.5 (폐기) / §3.6 / §3.8 / §4.3 / §5.1 (폐기) / §5.3 |
| Round 7 | 2026-06-04~05 | btn_close 완전 제거 (D-V6) → ToBe 3 버튼 표준 (조회/초기화/저장). PageLayout.buttons 배열 entry 삭제 + handleClose dead code 제거 | §1.2 / §3.9 / §7 (B-006 폐기) |
