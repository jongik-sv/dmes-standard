---
screenId: commRoleMng
asIsId: CommRoleMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
갱신일: 2026-06-05
작성자: Agent
---

# mcm — 역할 관리 디자인설계서

## §0. 환경 제약 (분석리포트 §0 동일)

| 항목 | 결정 | 사유 |
|---|---|---|
| Auto Manifest Runner (R-14) | 적용 ✗ | mui 자산 비정합 |
| R-13 SOP 30 Step | 미실행 | manifest 부재 |
| 정합체크서 §A.3 / §A.A-R12-1 / §D.4 | ✗ + 사유 명시 | "Runner mui 미지원" |
| 가이드 템플릿 (WinForms 전제) | 절 구조 참고만 | mui 등가물 (xfdl Layout) 매핑 |

> 본 디자인설계서는 분석리포트 §0.1.3 (단일 원천) 에 따라 분석 §3 + 기능설계서 §3 / §3.2 / §3.3 / §4 / §5 / §9 의 행을 1:1 인용. 자체 추가 ✗.

> **Frontend 개발 연계 값** (기능설계서 §1.2 와 동일):
> - mesModule=`m-mcm` / moduleGroup=`csa` / pageName=`commRoleMng` / pageId=`commRoleMng` / 페이지 유형=D / tsup entry key=`pages/csa/commRoleMng`
>
> **명명 룰**: MES 단일 룰 — screenId=pageId=serviceId=pageName=`commRoleMng` camelCase 4 식별자 동일. Frontend 파일명 = `commRoleMng.tsx`.

---

## §1. 공통 화면 구조

SIDEBAR / HEADER / TabsBar 는 portal PortalShell 이 자동 주입. 본 디자인 설계 대상은 `PageLayout` 내부 영역 (title / buttons / SearchArea / ContentBody / ContentPanel).

### §1.1 포털 공통 영역 (설계 대상 아님 — portal 주입)

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
- 표시 형식 (MES): `mcm:commRoleMng`

### §1.2 화면 설계 대상 영역 (PageLayout 기반)

```
┌────────────────────────────────────────────────────────────┐
│ PageLayout.title = "역할 관리"   PageLayout.buttons = [...] │
│  ├─ SearchArea  (A-FILTER)                                  │
│  │    ├─ SearchField (S-001 BIZ SYSTEM)                     │
│  │    ├─ SearchField (S-002 역할 ID)                        │
│  │    ├─ SearchField (S-003 역할명)                         │
│  │    └─ SearchField (S-004 사용 여부)                      │
│  └─ ContentBody (MAIN — 2x2 분할 → 그리드 + 상세 + 권한 2)    │
│        ├─ ContentPanel (좌상 — 역할 목록 G)                  │
│        │   └─ AgDataGrid (ds_main)                          │
│        ├─ ContentPanel (우상 — 역할 상세 D)                  │
│        │   └─ FormGroup (D-001~D-009 9 컬럼)                 │
│        ├─ ContentPanel (좌하 — 현재 권한 GE1)                 │
│        │   └─ AgDataGrid (ds_roleMap)                       │
│        └─ ContentPanel (우하 — 전체 권한 GE2)                 │
│            └─ AgDataGrid (ds_perm)                          │
│  └─ ButtonGroup (셔틀 BS-001/BS-002 — GE1 ↔ GE2 사이 중앙)    │
└────────────────────────────────────────────────────────────┘
```

| 영역 | 담당 컴포넌트 | 비고 |
|---|---|---|
| SIDEBAR / HEADER / TabsBar | portal PortalShell | 화면별 설계 대상 아님 |
| 페이지 타이틀 / 상단 버튼바 | `PageLayout` `title` / `buttons` | A-BTN 흡수 (PageLayout.buttons 배열) |
| A-FILTER (조회조건) | `SearchArea` + `SearchField` × 4 | `@dk-oasis/shared/layout` |
| MAIN (콘텐츠) | `ContentBody` + `ContentPanel` × 4 | 2 행 × 2 열 분할 |
| 그리드 | `AgDataGrid` (+ `useGridDataManager`) × 3 | `@dk-oasis/shared/grid` |
| 폼 | `FormGroup` + `ComboBox` / `DatePicker` / `Input` / `Select` | `@dk-oasis/shared/form` |
| 팝업 | `Modal` / `MessageModal` | `@dk-oasis/shared/modal` |
| 셔틀 버튼 | `Button` × 2 + `ButtonGroup` | A-GRID-EXT 중앙 정렬 |

---

## §2. 화면 레이아웃

### §2.1 레이아웃 유형 + 페이지 유형 자동 결정 (R-12)

| 항목 | 값 (enum 강제) |
|---|---|
| **페이지 유형 (자동 결정)** | D — 다중 그리드 (분석 §3.1 / 기능 §1.2 페이지 유형 매칭: G=1 + GE=2 + D=1 + L=0 → D 다중 그리드 우선) |
| **레이아웃 유형** | 좌우분할형 + 상하분할형 혼합 (Master+Detail 상단 좌우 / GE1+GE2 하단 좌우 + 중앙 셔틀) |
| **참조 화면** | (legacy 유사 화면) `csa::CommUserMng` (사용자 관리) — 동일 좌우+상하 4분할 패턴. 본 화면이 권한 부여 메인 UX 정본 |

### §2.2 메인 영역 구조도 (ASCII — 분석 §3.1 좌표 1:1 반영)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  div_title  (top=0 / height=40)                                              │
│  ┌─ "역할 관리" (Static, left=0, w=250) ─┬─ commonTopButton (search/reset/   │
│  │                                       │   save/close 4 버튼)              │
│  └───────────────────────────────────────┴───────────────────────────────────┘
├─────────────────────────────────────────────────────────────────────────────┤
│  div_search  (top=50 / height=43 / cssclass=div_WFSA_Box)                    │
│  ┌─ [BIZ SYSTEM] [cbo_bizSystemCode] [역할 ID] [edt_ROLE_ID] [역할명] [edt_  │
│  │  ROLE_NM] [사용 여부] [cbo_USE_TP] ─────────────────────────────────────  │
│  └───────────────────────────────────────────────────────────────────────────┘
├─────────────────────────────────────────────────────────────────────────────┤
│  btn_fold  (top=93 / height=10 / cssclass=btn_WFSA_Fold)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  div_main  (top=113 / bottom=40)                                             │
│  ┌─ div_mainGrd ──────────────────────┐ ┌─ div_mainDetail ─────────────────┐ │
│  │  [역할 목록] [leftMenu (3 btn)] [rightMenu (4 btn)]                       │ │
│  │  ┌─ grd_main ──────────────────┐  │ │  ┌─ div_detail ──────────────────┐ │ │
│  │  │ 상태 ROLE ID ROLE 이름 ...  │  │ │  │ (To-Be D-001 제거)            │ │ │
│  │  │ ─── ─────── ─────────── ... │  │ │  │ 역할 ID    | [edt_role_id]    │ │ │
│  │  │  ▣   ABC    ABC 역할        │  │ │  │ 메뉴 ID    | [cbo_folder]     │ │ │
│  │  │  ...                        │  │ │  │ ID         | [edt_id]         │ │ │
│  │  └─────────────────────────────┘  │ │  │ 역할명     | [edt_role_nm]    │ │ │
│  └────────────────────────────────────┘ │  │ 역할 설명  | [edt_role_desc]  │ │ │
│                                          │  │ 사용 여부  | [edt_use_tp(R)] │ │ │
│                                          │  │ 유효 개시일| [cal_start...]  │ │ │
│                                          │  │ 유효 기한일| [cal_end...]    │ │ │
│                                          │  └────────────────────────────────┘ │ │
│                                          └────────────────────────────────────┘ │
│  ┌─ div_subGrd1 ──────────────────┐ ┌─[BS-001] ┐ ┌─ div_subGrd2 ────────────┐ │
│  │  [현재 버튼 권한] [Perm] [필터]│ │  ▼ 삭제   │ │  [전체 버튼 권한 ...]    │ │
│  │  ┌─ grd_sub1 ──────────────┐   │ ├──────────┤ │  ┌─ grd_sub2 ─────────┐  │ │
│  │  │ ☑ PERMISSION ID OBJECT │   │ │  ▲ 추가  │ │  │ ☑ PERMISSION ID ...│  │ │
│  │  │ ☑ ABC.001       OBJ01  │   │ │ [BS-002] │ │  │ ☑ PERM.001         │  │ │
│  │  │ ...                    │   │ └──────────┘ │  │ ...                │  │ │
│  │  └────────────────────────┘   │              │  └────────────────────┘  │ │
│  └─────────────────────────────────┘              └──────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│  div_bottom  (bottom=0 / height=20 / cssclass=div_WF_Footer / commonBottomStatus) │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## §3. 영역별 배치 상세

### §3.1 영역 크기 및 배치 (5 enum)

| 영역 | 높이 | 너비 | 스크롤 | 리사이즈 | 비고 |
|---|---|---|---|---|---|
| A-FILTER | 고정 (height=43) | 100% (left=20 / right=20) | 없음 | N | 3 SearchField 단일 행 (정책 #1 — S-001 BIZ SYSTEM 제거) |
| A-GRID | 가변 (Row 1 좌 — flex 1) | 가변 (좌 — flex 1 / 우 Detail 480 고정) | 세로 | Y | 메인 역할 목록 그리드 (Row 1 좌) |
| A-GRID-EXT | 가변 (Row 2 — flex 1) | 가변 (sub1 flex 1 + sub2 좌 OBJECT flex 1 + sub2 우 권한 flex 1 — 3 패널 row) | 세로 | Y | sub1 현재 권한 + sub2 좌 OBJECT 목록 + sub2 우 전체 권한 (Round 3 — Modal 폐기 / 인라인 그리드 방식) |
| A-DETAIL | 가변 (Row 1 우 — 480px 고정) | 480px (`<ContentPanel width={480}>`) | 세로 | N | Row 1 우 — 8 필드 단일 폼 (정책 #1 — D-001 BIZ SYSTEM 제거 / W5 B Detail wrapper 적용) |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| A-BTN | 고정 (height=40) | 100% (top=0 / right=0) | 없음 | N | PageLayout.buttons (조회/저장 — Round 7 닫기 폐기 / §J K-013) + GridPanel buttons (행추가/행복사/행삭제/행취소) + sub1 셔틀 ▼권한삭제 / sub2 우 권한조회 / 권한추가 (Round 3) |

#### §3.1.1 W5 A 패턴 — 2x2 레이아웃 collapse 회피 (Round 2 결함 fix / 2026-06-02)

> **결함 발생**: Round 1 (AsIs 1:1 재개발) 시점에서 `ContentBody root direction="column"` + 내부 row × 2 만 사용했더니 portal shell 안에서 ContentBody 가 column 으로 스택되지 않고 row 로 flatten 되며 row 2 가 row 1 옆으로 collapse. shared `.content-body--column { flex-direction: column }` selector 가 `.page-layout` 한정으로만 적용되어 portal shell 안에서 무력화.
>
> **회피 정책 (Round 2 worker 재지시 2회 후 채택)**:
>
> 1. `ContentBody root` 의 direction prop 폐기 (`<ContentBody root>` 만 사용).
> 2. ContentBody 의 **외곽 column stacker div** 를 명시 — `display:flex; flexDirection:column; flex:1 1 0; gap:6; minHeight:0;`.
> 3. 외곽 div 안에 **Row 1 div + Row 2 div 2개의 row div** 를 명시 — 각 `display:flex; flexDirection:row; flex:1 1 0; gap:6; minHeight:0;`.
> 4. 각 Row div 안에 `ContentPanel` 들을 child 로 배치.
>
> 결과 구조 (FE [page.tsx:819~1166](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L819) 정합):
>
> ```tsx
> <ContentBody root>
>   <div style={{display:'flex', flexDirection:'column', flex:'1 1 0', gap:6, minHeight:0}}>
>     <div style={{display:'flex', flexDirection:'row',    flex:'1 1 0', gap:6, minHeight:0}}>
>       <ContentPanel>{/* Row 1 좌 — 역할 목록 그리드 */}</ContentPanel>
>       <ContentPanel width={480}>{/* Row 1 우 — Detail */}</ContentPanel>
>     </div>
>     <div style={{display:'flex', flexDirection:'row',    flex:'1 1 0', gap:6, minHeight:0}}>
>       <ContentPanel>{/* Row 2 sub1 — 현재 버튼 권한 */}</ContentPanel>
>       <ContentPanel>{/* Row 2 sub2 좌 — OBJECT 목록 */}</ContentPanel>
>       <ContentPanel>{/* Row 2 sub2 우 — 전체 버튼 권한 */}</ContentPanel>
>     </div>
>   </div>
> </ContentBody>
> ```
>
> **AsIs ↔ ToBe 매핑**:
>
> | AsIs xfdl 영역 | ToBe React 영역 |
> |---|---|
> | `div_mainGrd` (Row 1 좌) | Row 1 첫 번째 `<ContentPanel>` (flex 1) |
> | `div_mainDetail` (Row 1 우) | Row 1 두 번째 `<ContentPanel width={480}>` |
> | `div_subGrd1` (Row 2 좌) | Row 2 첫 번째 `<ContentPanel>` (flex 1 — sub1) |
> | `div_buttonGrp` (Row 2 셔틀 BS-001 ▼ / BS-002 ▲) | **폐기 (Round 3)** — 셔틀 BS-002 ▲ 추가는 sub2 우 GridPanel `btn_addPerms` 로 흡수 / BS-001 ▼ 삭제는 sub1 GridPanel `btn_shuttle_remove` 로 흡수 |
> | `div_subGrd2` (Row 2 우) — **단일 패널** | Row 2 두 번째 `<ContentPanel>` (sub2 좌 — OBJECT 목록 그리드) + Row 2 세 번째 `<ContentPanel>` (sub2 우 — 전체 권한 그리드) **2 패널 분할** (Round 3 — §3.1.2 정본) |

#### §3.1.2 sub2 인라인 2 패널 분할 (Round 3 — OBJECT-LoV Modal 폐기 / 2026-06-02)

> **결함 발생 (Round 2)**: AsIs xfdl:129 `div_object_id` (commonDynamic.xfdl Essential) 의 OBJECT 검색 + 선택 UI 가 Round 1 ToBe 에 누락되어 sub2 → sub1 권한 추가 시 V-002 "OBJECT ID 입력 후 추가해주세요" alert 으로 기능 차단. Round 2 worker 가 OBJECT-LoV 를 별도 Modal (P-001 commonDynamic 등가) 로 신설했으나 사용자 검수 결과 "Modal 흐름이 AsIs UX 와 비교해 한 단계 더 들어가야 함 → 인라인으로 펴라" 결정.
>
> **회피 정책 (Round 3 사용자 결정)**:
>
> - Round 2 OBJECT-LoV Modal 폐기.
> - sub2 영역을 **2 ContentPanel 로 분할** (좌 OBJECT 목록 그리드 + 우 권한 그리드).
> - **좌 패널** (OBJECT 목록):
>   - panel header 우측 정렬 FILTER 라벨 + Input (OBJECT_ID + OBJECT_NM UPPER LIKE 부분 일치 / §5.5.1 정본)
>   - GridPanel `title="OBJECT 목록"` + `count={filteredObjectRows.length}`
>   - AgDataGrid `selectable multiSelect={true}` (다중 체크박스 선택)
>   - 데이터 = BE `searchObjectLov` 응답 (Form onload 시 1회 + 클라이언트 useMemo 필터)
> - **우 패널** (전체 권한):
>   - panel header 우측 정렬 FILTER 라벨 + Input (PERMISSION_ID + PERMISSION_NM UPPER LIKE 부분 일치 / §5.5.1 정본)
>   - GridPanel `title="전체 버튼 권한"` + `count={filteredPermRows.length}`
>   - GridPanel `buttons=[btn_permSearch (권한 조회), btn_addPerms (권한 추가)]`
>   - AgDataGrid `selectable multiSelect={false}` (단일 라디오 선택)
>   - 데이터 = BE `searchCmPerm` 응답 (Round 4 — NOT EXISTS 분기 제거 / §3.4.X 정본)
> - **AsIs P-001 OBJECT 조회 Modal 폐기** — §6 P-001 ~~취소선~~ 처리.
>
> **다중 row 권한 추가 동작 (Round 3 신설 정책)**:
>
> - "권한 추가" 버튼 클릭 시 `selected OBJECTs (N개) × selected PERM (1개) = N row` 일괄 INSERT 로 saveCmRoleMap 호출.
> - BE saveCmRoleMap 은 이미 `List<Map<String,Object>> master` 다중 row 지원 — BE 변경 ✗ (재사용).
> - validation: V-001 ROLE 미선택 / V-002 OBJECT 미선택 / V-PERM 권한 미선택.
> - "권한 조회" 버튼은 AsIs `fn_permSearch` 동작 유지 — 우 권한 그리드 재조회 (BE `searchCmPerm` 단일 호출).

### §3.2 A-FILTER 내부 배치 (분석 §3.2 4 컨트롤 좌표 1:1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ div_search  (cssclass=div_WFSA_Box / top=50 / height=43)                     │
│                                                                              │
│  [BIZ SYSTEM] [cbo_bizSystem▼]  [역할 ID] [edt_ROLE_ID____]  [역할명]        │
│   ↑ left=10   ↑ left=100        ↑ left=260 ↑ left=320         ↑ left=480     │
│   w=80 (Static) w=80 (Combo)    w=60 (Static) w=120 (Edit)    w=50 (Static)  │
│                                                                              │
│  [edt_ROLE_NM________________]  [사용 여부]  [cbo_USE_TP▼]                    │
│   ↑ left=540 / w=200             ↑ left=770   ↑ left=830                     │
│                                  w=65 (Static) w=50 (Combo)                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

> 4 컨트롤 모두 top=10 + height=21 단일 행 정렬. Static 라벨은 `edi_WFSA_Label` cssclass (readonly Edit 으로 라벨 표현 — As-Is mui 컨벤션).

### §3.3 MAIN 내부 배치 (4 패널 + 셔틀)

```
A-GRID (좌상)                                          A-DETAIL (우상)
top=0 / height=277 / left=0 / right=440                top=0 / left=`div_mainGrd:10` / w=430 / height=277
┌─────────────────────────────────────────────────┐    ┌──────────────────────────────────────┐
│ ┌─ leftMenu (210px) ─┬─ rightMenu (360px) ─┐    │    │ ┌─ div_detail (top=25) ─────────┐   │
│ │ [역할 목록] chk_che│ rowAdd Delete Copy   │    │    │ │ (To-Be D-001 BIZ SYSTEM 제거) │   │
│ │ ck btn_sum copyPas │ Cancel               │    │    │ │ 역할 ID      [edt_role_id ro] │   │
│ │ te                 │                      │    │    │ │ 메뉴 ID      [cbo_folder▼]    │   │
│ ├────────────────────┴──────────────────────┤    │    │ │ ID           [edt_id]         │   │
│ │  grd_main  (autofittype=col)              │    │    │ │ 역할명       [edt_role_nm]    │   │
│ │  ┌─────┬────────┬──────┬─────┐...         │    │    │ │ 역할 설명    [edt_role_desc]  │   │
│ │  │ 상태│ROLE ID │ROLE 이│...  │            │    │    │ │ 사용 여부    ◉ Yes ○ No       │   │
│ │  │     │        │름    │     │            │    │    │ │ 유효 개시일  [cal_start]      │   │
│ │  ├─────┼────────┼──────┼─────┤            │    │    │ │ 유효 기한일  [cal_end]        │   │
│ │  │  ▣  │  R001  │xxx   │...  │            │    │    │ └────────────────────────────────┘ │
│ │  └─────┴────────┴──────┴─────┘            │    │    │                                    │
│ └───────────────────────────────────────────┘    │    └──────────────────────────────────────┘
└─────────────────────────────────────────────────┘

A-GRID-EXT (좌하 sub1 + 셔틀 + 우하 sub2)
top=287 / bottom=0
┌─────────────────────────────────┬──[버튼]──┬──────────────────────────────────┐
│ div_subGrd1  (left=0 / w=605)    │  Shuttle │ div_subGrd2  (left=639 / right=0) │
│ [현재 버튼 권한] [Perm] [필터____]│   ▼     │ [전체 버튼 권한 (OBJECT ID 선택...│
│ ┌─────────────────────────────┐  │  삭제   │  ) ] ⓘ [Perm] [필터________]      │
│ │ grd_sub1                    │  │ [BS-001]│ [OBJECT ID] [div_object_id_____]  │
│ │ ☑ PERMISSION ID OBJECT ID...│  │  ▲     │ ┌────────────────────────────────┐ │
│ │ ☑ ABC.001       OBJ01       │  │  추가   │ │ grd_sub2                       │ │
│ │ ☑ ABC.002       OBJ01       │  │ [BS-002]│ │ ☑ PERMISSION ID PERMISSION명... │ │
│ │ ...                         │  │         │ │ ☑ PERM.001     권한 1           │ │
│ └─────────────────────────────┘  │         │ │ ☑ PERM.002     권한 2           │ │
│                                  │         │ │ ...                            │ │
│                                  │         │ └────────────────────────────────┘ │
└─────────────────────────────────┴─────────┴──────────────────────────────────┘
```

> 셔틀 버튼 (BS-001 / BS-002) 위치: `div_buttonGrp` (left=`div_subGrd1:5` / right=`div_subGrd2:5` / top=65% / height=75) — 두 그리드 사이 중앙 수직 배치 (**Round 3 — 폐기 / sub1 + sub2 우 GridPanel buttons 흡수 / §3.1.1 정본**).

#### §3.3.1 ToBe 실 구조 ASCII (Round 3 — 인라인 분할 / 2026-06-02)

> AsIs ASCII 박스 (§3.3 본문) 는 1:1 보존. 본 sub-section 은 Round 3 ToBe 실 React 구조를 별도 ASCII 로 보강.

```
Row 1 (flex 1 / flexDirection=row)
┌───────────────────────────────────────┬──────────────────────────────┐
│ ContentPanel (Row 1 좌 — flex 1)       │ ContentPanel (Row 1 우 — 480) │
│ ┌─ GridPanel "역할 목록" + count ────┐ │ ┌─ Detail wrapper (W5 B) ──┐  │
│ │ buttons=[행추가/행복사/행삭제/행취소] │ │ │ (선택 시) 2-line 헤더:    │  │
│ │ ┌─ AgDataGrid (ROLE_COLUMNS) ─┐   │ │ │   line1 (32px 회색 빈)    │  │
│ │ │  rowKey="__rowId"           │   │ │ │   line2 (28px "상세 정보") │  │
│ │ │  selectable single          │   │ │ │ ─ table (DETAIL_TABLE) ─  │  │
│ │ │  ┌────┬───────┬─────┬─...┐  │   │ │ │ 역할 ID * │ Input         │  │
│ │ │  │상태│ROLE ID│ROLE..│..│  │   │ │ │ 메뉴 ID * │ ComboBox      │  │
│ │ │  ├────┼───────┼─────┼─...┤  │   │ │ │ ID *      │ Input         │  │
│ │ │  │ ▣  │ R001  │xxx   │.. │  │   │ │ │ 역할명    │ Input         │  │
│ │ │  └────┴───────┴─────┴─...┘  │   │ │ │ 역할 설명 │ Input         │  │
│ │ └─────────────────────────────┘   │ │ │ 사용 여부 │ RadioGroup    │  │
│ └─────────────────────────────────────┘ │ │ 유효 개시일│ DatePicker  │  │
│                                         │ │ 유효 기한일│ DatePicker  │  │
│                                         │ └──────────────────────────┘  │
└───────────────────────────────────────┴──────────────────────────────┘

Row 2 (flex 1 / flexDirection=row — 3 ContentPanel)
┌─────────────────────────┬─────────────────────────┬─────────────────────────┐
│ ContentPanel (sub1)      │ ContentPanel (sub2 좌)   │ ContentPanel (sub2 우)   │
│ GridPanel "현재 버튼 권한"│ FILTER 라벨 + Input      │ FILTER 라벨 + Input      │
│ buttons=[▼ 권한 삭제]    │ (OBJECT_ID/OBJECT명 LIKE)│ (PERMISSION_ID/명 LIKE)  │
│ + Perm 필터              │ GridPanel "OBJECT 목록"  │ GridPanel "전체 버튼 권한"│
│ AgDataGrid               │ AgDataGrid               │ buttons=[권한 조회 / 권한 추가]│
│ selectable multiSelect   │ selectable multiSelect   │ AgDataGrid               │
│ (다중 체크박스)           │ (다중 체크박스)           │ selectable single (라디오)│
│ data=filteredRoleMapRows │ data=filteredObjectRows  │ data=filteredPermRows    │
└─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

### §3.4 Detail 영역 디자인 (W5 B + C 패턴)

#### §3.4.1 W5 B — Detail wrapper 2-line 헤더 + 회색 배경 (W5 commUserMng iter#4 정본)

> Round 2 (AsIs 1:1 재개발) 시점에서 Detail 영역에 헤더가 없어 양 그리드의 grid-panel-header / column-header 와 정렬 불일치 ("툭 튀어나옴"). W5 commUserMng iter#3 결정 (J-008) 후 본 화면도 동일 패턴 적용.

| 영역 | 높이 | 배경 | 내용 | 비고 |
|---|---|---|---|---|
| Detail wrapper outer | `marginTop: 32` (Row 1 grid-panel-header 32px 와 align) | `#fff` (border `1px solid #d4dae0`) | 2-line 헤더 + table | W5 B 정본 |
| line 1 (panel-header 자리) | 28 (실측 값) | `#f4f6f8` (회색) | "상세 정보" 라벨 (fontSize:13 / fontWeight:600) | grid-panel-header 와 일렬 정렬 |
| line 2 (form 본문 wrapper) | 가변 | `#fff` | `<table style={DETAIL_TABLE_STYLE}>` | 행별 W5 C 정렬 |

> **NOTE — commUserMng iter#4 의 J-012 "흰색 빈공간 회색화"** 와 본 화면 차이: 본 화면 Detail 은 grid 가 한 옆에 있는 게 아니라 Row 1 우측 단독이므로 J-012 의 line1 + 본문 회색화 정책은 적용 ✗. 본 화면은 line 1 만 `#f4f6f8` + 본문 `#fff` 유지. (사용자 검수 시 동일 결함 발견 시 J-012 패턴으로 회귀하면 됨.)

#### §3.4.2 W5 C — Form row 정렬 정책 (label cell + value cell 1:1)

> AsIs xfdl 의 `div_detail` 8 행 (정책 #1 — D-001 BIZ SYSTEM 제거) 모두 `[라벨 컬럼 | 입력 컬럼]` 단일 패턴. W5 commUserMng iter#3 J-009 "비슷한 배열의 행은 동일 패턴" 적용 — 본 화면은 모든 행이 동일 패턴이므로 별도 행별 분기 ✗.

| 행 | 라벨 (`DETAIL_LABEL_CELL`) | 입력 (`DETAIL_VALUE_CELL`) | readOnly 분기 |
|---|---|---|---|
| 1 | 역할 ID * | `<Input maxLength=100>` | **inserted 행만 입력 가능 / 기존 행 readOnly** (Round 5 정책 #11 정정 / §5.5.X 정본) |
| 2 | 메뉴 ID * | `<ComboBox data={menuLov} valueField="MENU_ID" labelField="MENU_ID_NM">` | `!isNewRow` 시 disabled (AsIs xfdl:763~769 정합) |
| 3 | ID * | `<Input maxLength=100>` | `!isNewRow` 시 readOnly (AsIs 등가) |
| 4 | 역할명 | `<Input maxLength=100>` | 항상 가능 |
| 5 | 역할 설명 | `<Input maxLength=300>` | 항상 가능 |
| 6 | 사용 여부 | `<RadioGroup>` Y/사용, N/미사용 | 항상 가능 |
| 7 | 유효 개시일 | `<DatePicker>` | 항상 가능 |
| 8 | 유효 기한일 | `<DatePicker>` (default `9999-12-31 00:00:00` — W5 G END_OF_TIME / J-011 정본) | 항상 가능 |

#### §3.4.3 W5 G — BE 시간 처리 (END_OF_TIME 9999-12-31 00:00:00)

> W5 commUserMng iter#3 J-011 결정. AsIs Oracle TO_DATE(SUBSTR("99991231",1,14),'YYYYMMDDhh24miss') → 시분초 부족 → DB 저장 시 00:00:00. ToBe 도 동일 1:1 보존.

| 입력 | 처리 | DB 저장 값 |
|---|---|---|
| START_ACTIVE_DATE 미입력 (행 추가) | `LocalDateTime.now()` (자정 보장) | yyyy-MM-dd 00:00:00 |
| END_ACTIVE_DATE 미입력 (행 추가) | `END_OF_TIME = LocalDateTime.of(9999, 12, 31, 0, 0, 0)` | 9999-12-31 00:00:00 |
| FE input (yyyy-MM-dd 10자) | `parseLocalDateTime` → `T00:00:00` 부착 | yyyy-MM-dd 00:00:00 |
| FE input (yyyyMMdd 8자 AsIs 잔존) | `parseLocalDateTime` → 자릿수 검증 + T00:00:00 부착 | yyyy-MM-dd 00:00:00 |

→ AsIs DB ↔ ToBe DB 시간 1:1 일치 보장. 정본 코드: [CommRoleMngService.java:78](src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/csa/commRoleMng/service/CommRoleMngService.java#L78) `END_OF_TIME` 상수.

---

## §4. 그리드 컬럼 디자인

> 기능설계서 §3.2 (G + GE — 26 컬럼) 그대로 인용. 자체 추가 ✗.

**표기 원칙**: `DB 컬럼명` = SNAKE_CASE / `화면 표시명` = 한글 라벨 (As-Is 1byte 보존).

### §4.1 메인 그리드 (G-NNN — `grd_main` / ds_main)

| DB 컬럼명 | 화면 표시명 | 정렬 | 표시 형식 | 비고 |
|---|---|---|---|---|
| STATUS | 상태 | Center | image | displaytype `imagecontrol` — CRUD 행상태 (size=30) |
| ROLE_ID | ROLE ID | Center | varchar(30) | autosizecol=limitmin / size=80 |
| ROLE_NM | ROLE 이름 | Left | varchar(100) | size=160 / textAlign=left |
| ROLE_DESC | ROLE 설명 | Left | varchar(300) | size=240 / textAlign=left |
| MENU_ID | MENU | Center | varchar(30) | size=48 |
| ~~BIZ_SYSTEM_CODE~~ | ~~BIZ\nSYSTEM~~ | ~~Center~~ | ~~varchar(10)~~ | **To-Be 제거 (정책 #1)** — As-Is xfdl:151/166/177 인용만 |
| USE_TP | 사용구분 | Center | bit(Y/N) | size=55 / combotext (ds_useTp Y/사용, N/미사용) |
| START_ACTIVE_DATE | 유효개시일 | Center | date(YYYY-MM-DD) | size=80 / displaytype `date` / calendardateformat |
| END_ACTIVE_DATE | 유효기한일 | Center | date(YYYY-MM-DD) | size=80 / 동일 |

> **To-Be G 카운트 = 8** (G-006 BIZ_SYSTEM 제거 / 정책 #1).

### §4.2 확장 그리드 1 (GE-NNN sub1 — `grd_sub1` / ds_roleMap — 현재 권한)

| DB 컬럼명 | 화면 표시명 | 정렬 | 표시 형식 | 비고 |
|---|---|---|---|---|
| CHK | (체크 셀) | Center | checkbox | band=left / size=28 / displaytype `checkboxcontrol` |
| PERMISSION_ID | PERMISSION ID | Left | varchar(100) [Q-002] | size=107 / autosizecol=limitmin (LIKE 필터: PERMISSION_ID_UPPER) |
| OBJECT_ID | OBJECT ID | Left | varchar(100) [Q-002] | size=97 |
| PERMISSION_NM | PERMISSION 명 | Left | varchar(100) [Q-002] | size=120 |
| PERMISSION_COMMON | 공통 권한 | Left | varchar(256) [Q-002] | size=155 |
| PERMISSION_CUSTOM | CUSTOM 권한 | Left | varchar(256) [Q-002] | size=148 |
| POPUP_BTN | POPUP 버튼 | Left | varchar(256) [Q-002] | size=135 |
| OBJECT_NM | OBJECT 명 | Left | varchar(256) [Q-002] | size=100 |
| SYSTEM_CODE | SYSTEM | Center | varchar(256) [Q-002] | size=60 |
| SERVICE | SERVICE | Left | varchar(256) [Q-002] | size=80 |
| ROLE_ID | 역할 ID | Left | varchar(90) [Q-002] | size=80 (본 매핑 ROLE_ID — FK to TB_MCM_SEC_ROLE) |

### §4.3 확장 그리드 2 (GE-NNN sub2 — `grd_sub2` / ds_perm — 전체 권한 후보)

| DB 컬럼명 | 화면 표시명 | 정렬 | 표시 형식 | 비고 |
|---|---|---|---|---|
| CHK | (체크 셀) | Center | checkbox | band=left / size=30 |
| PERMISSION_ID | PERMISSION ID | Left | varchar(100) [Q-002] | size=128 |
| PERMISSION_NM | PERMISSION명 (As-Is 띄어쓰기 ✗ — 1:1 보존) | Left | varchar(100) [Q-002] | size=128 |
| PERMISSION_COMMON | 공통 권한 | Left | varchar(256) [Q-002] | size=167 |
| PERMISSION_CUSTOM | CUSTOM 권한 | Left | varchar(256) [Q-002] | size=155 |
| POPUP_BTN | POPUP버튼 (As-Is 띄어쓰기 ✗ — 1:1 보존) | Left | varchar(256) [Q-002] | size=120 |

### §4.4 코드값 표시 변환 (기능설계서 §3.3 인용)

| DB 컬럼 | 코드 마스터 | 변환 예 |
|---|---|---|
| ~~BIZ_SYSTEM_CODE~~ | ~~LV-001 ds_lovSubSystem (APP_HOST_ID 동적)~~ | **To-Be 제거 (정책 #1)** |
| MENU_ID | LV-001 ds_lovMenuId (MENU_ID / MENU_ID_NM 동적 — **BIZ_SYSTEM 종속 필터 제거 / 정책 #1**) | "M001" → "기준정보 메뉴" |
| USE_TP | LV-002 ds_useTp (정적 Y/N) | "Y" → "사용", "N" → "미사용" |

### §4.5 그리드 행 조건별 표시

| 조건 | 표시 방식 | 비고 |
|---|---|---|
| ds_main 행 선택 (rowposition 변경) | red/blue 셀 강조 (`gfn_gridSelectedRow(grd_main, "red", "blue", "")`, xfdl:341) | 본 화면 컨벤션 |
| ds_main 신규 행 (rowType=2) | G-001 STATUS 컬럼에 "Inserted" 이미지 + 상세 폼의 cbo_folder/edt_id 활성화 | xfdl:172 / 763~769 |
| ds_main 수정 행 (rowType=4) | G-001 STATUS 컬럼에 "Updated" 이미지 | xfdl:172 |
| ds_main 삭제 행 (rowType=8) | G-001 STATUS 컬럼에 "Deleted" 이미지 (gfn_deleteRow 후) | xfdl:172 / 723 |
| ds_roleMap / ds_perm CHK=1 행 | (별도 행 강조 ✗ — 체크박스 자체로 표시) + 헤드 CHK 카운트 동기화 (xfdl:613~618) | xfdl:610~620 |
| ds_perm 필터 적용 시 | enableredraw=false → filter 적용 → enableredraw=true (chunked render) | xfdl:929~939 |

---

## §5. 컴포넌트 구조

```
CommRoleMngPage                              ← m-mcm/page-components/csa/commRoleMng/page.tsx
├── PageLayout                               ← @dk-oasis/shared/layout: PageLayout
│   ├── title="역할 관리"                    (prop)
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
│   ├── buttons=[조회, 저장]                  ← @dk-oasis/shared/form: Button (B-001 / B-003 — B-002 초기화 폐기 / W5 J-005 정합 + **B-004 닫기 폐기 Round 7 / §J K-013** — portal 탭 close 가 host 처리)
│   ├── SearchArea (A-FILTER)                ← @dk-oasis/shared/layout: SearchArea
│   │   ├── SearchField (S-002 역할 ID)      ← @dk-oasis/shared/layout: SearchField
│   │   │   └── Input
│   │   ├── SearchField (S-003 역할명)
│   │   │   └── Input
│   │   └── SearchField (S-004 사용 여부, type="select")
│   │       └── (내장 select)
│   │   (To-Be 3 SearchField — S-001 BIZ SYSTEM 제거 / 정책 #1)
│   └── ContentBody root (W5 A 패턴 — §3.1.1 정본)
│       └── column stacker div (외곽 column / flex 1)
│           ├── row 1 div (flexDirection=row / flex 1)
│           │   ├── ContentPanel (Row 1 좌 — 역할 목록 / flex 1)
│           │   │   └── GridPanel "역할 목록" + count + buttons=[행추가/행복사/행삭제/행취소]
│           │   │       └── AgDataGrid (ROLE_COLUMNS — G-001~G-009 / G-006 BIZ_SYSTEM ✗)
│           │   └── ContentPanel (Row 1 우 — Detail / width=480)
│           │       └── Detail wrapper (W5 B — §3.4.1 정본)
│           │           ├── line 1 (28px / #f4f6f8 회색) "상세 정보"
│           │           └── table (DETAIL_TABLE_STYLE) 8 행 (W5 C — §3.4.2 정본)
│           │               ├── Input (D-002 역할 ID *) — **readOnly: inserted 만 입력 가능 (Round 5 / §5.5.X 정본)**
│           │               ├── ComboBox (D-003 메뉴 ID *)
│           │               ├── Input (D-004 ID *)
│           │               ├── Input (D-005 역할명 / Q-014 정정)
│           │               ├── Input (D-006 역할 설명 / Q-014 정정)
│           │               ├── RadioGroup (D-007 사용 여부 — Y/사용, N/미사용 / Q-007 UI 자연 흡수)
│           │               ├── DatePicker (D-008 유효 개시일)
│           │               └── DatePicker (D-009 유효 기한일 — END_OF_TIME default 9999-12-31 00:00:00 / W5 G)
│           └── row 2 div (flexDirection=row / flex 1) — **3 패널 (Round 3 — §3.1.2 정본)**
│               ├── ContentPanel (sub1 — 현재 버튼 권한 / flex 1)
│               │   ├── Perm 필터 div (panel header 아래 / Round 4 이전 위치)
│               │   └── GridPanel "현재 버튼 권한" + count + buttons=[▼ 권한 삭제 (BS-001 흡수)]
│               │       └── AgDataGrid (ROLE_MAP_COLUMNS — GE-001~GE-011) selectable multiSelect
│               ├── ContentPanel (sub2 좌 — OBJECT 목록 / flex 1) — **Round 3 신설**
│               │   ├── **FILTER 패널** (Round 4 — §5.5.1 정본) — panel header 우측 회색 stripe
│               │   │   └── Input (objectFilter — OBJECT_ID + OBJECT_NM UPPER LIKE)
│               │   └── GridPanel "OBJECT 목록" + count
│               │       └── AgDataGrid (OBJECT_COLUMNS — OBJECT_ID / OBJECT_NM) selectable multiSelect
│               │           data = filteredObjectRows (useMemo: objectRows + objectFilter + roleMapRows 제외)
│               └── ContentPanel (sub2 우 — 전체 버튼 권한 / flex 1)
│                   ├── **FILTER 패널** (Round 4 — §5.5.1 정본) — panel header 우측 회색 stripe
│                   │   └── Input (permFilter — PERMISSION_ID + PERMISSION_NM UPPER LIKE)
│                   └── GridPanel "전체 버튼 권한" + count + buttons=[권한 조회 (B-012) / 권한 추가 (BS-002 흡수 + N row INSERT)]
│                       └── AgDataGrid (PERM_COLUMNS — GE-012~GE-017) selectable single (라디오)
│                           data = filteredPermRows (useMemo: permRows + permFilter / Round 4 — NOT EXISTS ✗)
└── ErrorModal                                ← @dk-oasis/shared/layout: ErrorModal
   (**Round 3 — P-001 OBJECT 조회 Modal 폐기** / Round 2 신설 후 Round 3 인라인 그리드로 흡수)
```

> **(MUST)**: 03 §A.9-3 의 심볼만 사용. `FilterBar` / `DataGrid` / `SplitPanel` / `BottomBar` / `Toolbar` / `Pagination` / `Resizer` / `IconButton` / `FormField` / `Dropdown` / `CheckboxGroup` / `TextInput` / `DateRangePicker` / `SearchPopupInput` / `FilterRow` / `FilterPanel` / `GridHeader` / `SubGrid` / `EditableDataGrid` / `SplitGridContainer` 사용 금지.
>
> **D-007 Radio = `RadioGroup` 사용** (UI 자연 흡수 — Q-007 closed). Y/사용, N/미사용 2 옵션 정적 RadioGroup.

### §5.1.1 W5 E — 버튼 활성화 정책 (RBAC 권한 기반 + 사전 disabled 제거)

> W5 commUserMng iter#2 J-004 / J-005 결정. 본 화면도 동일 패턴 적용 — 사전 disabled 로 클릭조차 못하게 막지 않고, 클릭 시점에 validation 차단.

| 버튼 | 활성화 조건 | validation (클릭 시) |
|---|---|---|
| B-001 조회 | RBAC 권한 보유 | (없음 — 항상 가능) |
| ~~B-002 초기화~~ | **AsIs 부재 → 폐기 (W5 J-005 정합)** | - |
| B-003 저장 | RBAC 권한 보유 | V-005 변경 행 ≥ 1 / V-008 PK 미입력 차단 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| ~~B-004 닫기~~ | **Round 7 폐기 (§J K-013)** — portal 탭 close 가 host 처리 → 화면 내부 닫기 버튼 의미 ✗ | (해당 없음) |
| 행추가 / 행복사 / 행삭제 / 행취소 (GridPanel buttons) | 항상 활성 (`disabled={isSearching || isSaving}` 만) | V-001 / V-002 / V-003 / V-004 |
| ▼ 권한 삭제 (sub1 GridPanel buttons) | 항상 활성 | V-001 ROLE 미선택 / 행 미선택 |
| 권한 조회 / 권한 추가 (sub2 우 GridPanel buttons) | 항상 활성 | V-001 ROLE 미선택 / V-002 OBJECT 미선택 / V-PERM 권한 미선택 |

### §5.4.1 sub2 우 — 권한 추가 multi-row INSERT (Round 3 정본)

> Round 3 신설 — Modal 폐기 / 인라인 그리드 분할 정합.

| 항목 | 동작 |
|---|---|
| 트리거 | 사용자가 sub2 좌 OBJECT 목록에서 N 개 체크 + sub2 우 권한 그리드에서 1 개 라디오 선택 + "권한 추가" 클릭 |
| validation | V-001 ROLE_ID 선택 / V-002 OBJECT N ≥ 1 / V-PERM PERMISSION 1 선택 |
| 처리 | `selectedObjectIds × selectedPermId = N row` 합성 후 `saveCmRoleMap([{ROLE_ID, OBJECT_ID, PERMISSION_ID, rowStatus:"inserted"} × N])` 일괄 호출 |
| BE 변경 | ✗ — `saveCmRoleMap(List<Map> master)` 가 이미 다중 row 지원 (W5 정본 patterns). 중복 PK 는 `secRoleMappingRepository.existsById(pk)` 분기로 silent skip |
| 후속 | 응답 `ds_roleMap` 으로 sub1 갱신 + FE 가 별도 searchCmPerm 호출 시 sub2 우 갱신 |

### §5.5.1 FILTER 2 패널 header 신설 (Round 4 — 2026-06-03)

> Round 3 까지는 sub1 "Perm 필터" 만 panel header 안에 존재 + sub2 좌 / 우는 별도 FILTER 미정. Round 4 사용자 결정 — sub2 좌 / 우 각각에도 FILTER 라벨 + Input 신설 + 검색 범위 확장.

| 패널 | 위치 | 검색 범위 | 상태 변수 |
|---|---|---|---|
| sub1 (현재 버튼 권한) | panel header 안 (Round 3 위치 유지) | PERMISSION_ID (단독) | `roleMapFilter` |
| **sub2 좌 (OBJECT 목록)** | ContentPanel 안 GridPanel sibling **회색 stripe** (`#f4f6f8` + `border-bottom: 1px solid #d4dae0`) | **OBJECT_ID + OBJECT_NM** UPPER LIKE 부분 일치 (양쪽 확장) | `objectFilter` |
| **sub2 우 (전체 버튼 권한)** | ContentPanel 안 GridPanel sibling **회색 stripe** (동일) | **PERMISSION_ID + PERMISSION_NM** UPPER LIKE 부분 일치 (기존 ID 단독 → 양쪽 확장) | `permFilter` |

> **FILTER 가시화 fix (Round 4 round-2 worker 재지시)**: 초기 Round 4 구현에서 FILTER div 를 `<GridPanel>` 의 children 안에 두었더니 GridPanel 내부 hidden style 로 인해 화면에서 안 보임. 해결 — FILTER div 를 GridPanel **밖** + ContentPanel 안에서 GridPanel **sibling** 으로 분리 + 회색 stripe 명시. 정본 코드: [page.tsx:1082~1129](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L1082).

### §5.5.2 OBJECT 목록 — sub1 이미 부여 OBJECT 클라이언트 제외 (Round 4 / 2026-06-03)

> 사용자 결정 — 이미 sub1 (현재 권한) 에 부여된 OBJECT 는 sub2 좌 OBJECT 목록에서 자동 제외 (재부여 방지). FE 클라이언트 useMemo 만으로 처리 — BE 변경 ✗.

```ts
const filteredObjectRows = useMemo(() => {
  const kw = objectFilter.trim().toUpperCase();
  const grantedObjIds = new Set(roleMapRows.map(r => String(r.OBJECT_ID ?? "")));
  return objectRows.filter(row => {
    const id = String(row.OBJECT_ID ?? "");
    if (grantedObjIds.has(id)) return false;          // 이미 부여 — 제외
    if (!kw) return true;
    const nm = String(row.OBJECT_NM ?? "").toUpperCase();
    return id.toUpperCase().includes(kw) || nm.includes(kw);
  });
}, [objectRows, objectFilter, roleMapRows]);
```

정본 코드: [page.tsx:331~344](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L331).

### §5.5.3 전체 버튼 권한 — NOT EXISTS 분기 제거 (Round 4 / 2026-06-03)

> 사용자 결정 — sub2 우 전체 버튼 권한 그리드는 권한 부여 여부 무관 모든 권한 항상 표시. BE `SecRoleMappingNativeRepository.searchCmPerm` SQL 의 `NOT EXISTS (... TB_MCM_SEC_ROLE_MAPPING B WHERE B.PERMISSION_ID = A.PERMISSION_ID AND B.ROLE_ID = #{ROLE_ID})` 분기 제거.

| 항목 | Round 3 이전 | Round 4 이후 |
|---|---|---|
| BE searchCmPerm SQL WHERE | `USE_TP='Y' AND NOT EXISTS (...)` | `USE_TP='Y'` 만 |
| 의미 | 본 ROLE_ID 에 미할당 권한만 | 전체 권한 항상 표시 |
| 사유 | sub2 좌 OBJECT 가 sub1 이미 부여 OBJECT 제외로 변경됨에 따라 (§5.5.2), 권한 그리드는 OBJECT × PERMISSION 매트릭스의 "권한 축" 으로 항상 전체 표시 — 사용자가 다른 OBJECT 에 대해 동일 PERMISSION 부여 시 권한 풀이 NOT EXISTS 로 가려지는 결함 회피 | - |

정본 코드: [SecRoleMappingNativeRepository.java:124~146](src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/repository/SecRoleMappingNativeRepository.java#L124).

### §5.5.X ROLE_ID readOnly — inserted 행만 입력 가능 (Round 5)

> AsIs 행 추가 시점에 ROLE_ID 는 cbo_folder (MENU_ID) + edt_id (ID) 의 입력 후 `MENU_ID + "_" + ID` 자동 합성. ToBe 도 동일 1:1 보존하되 readOnly 정책은 **inserted 행만 입력 가능**으로 변경.

| 행 상태 | ROLE_ID Input | MENU_ID ComboBox | ID Input | 비고 |
|---|---|---|---|---|
| inserted (행 추가 직후) | **readOnly=false** (직접 편집 가능) + handleCellChange 의 MENU_ID/ID 변경 시 ROLE_ID 자동 합성 분기 보존 | enabled | enabled | 자동 합성 → 사용자가 override 가능 |
| updated (기존 행 클릭) | **readOnly=true** | disabled | readOnly=true | PK 변경 차단 |
| deleted | (편집 불가) | (편집 불가) | (편집 불가) | - |

정본 코드: [page.tsx:903~911](src/frontend/m-mcm/page-components/csa/commRoleMng/page.tsx#L903) — `readOnly={selected.nativeeditor_status !== "inserted"}` 분기.

---

## §6. 팝업 / 다이얼로그

> 기능설계서 §9 (P-001 / P-002) 인용.

| 팝업ID | 팝업명 | 트리거 | 크기 | 내용 | 반환값 |
|---|---|---|---|---|---|
| ~~P-001~~ | ~~OBJECT 조회~~ | ~~div_object_id 클릭 (sub2 영역)~~ | **Round 3 — 폐기** (사용자 결정 / §3.1.2 정본) — sub2 좌 인라인 OBJECT 목록 그리드로 흡수 | - | - |
| ~~P-002~~ | ~~(메뉴 이동) — As-Is 미호출~~ | **To-Be 제거 (정책 #1 신규 미반영 / Q-010 closed)** — As-Is fn_linkCommMenu / fn_openMenu 가 주석 처리 (실 호출 ✗) → To-Be 별도 라우팅 추가 ✗ | - | - | - |

> **To-Be P 카운트 = 0** (Round 3 P-001 OBJECT 조회 Modal 폐기 후 0건).
>
> **Round 2 시점 P-001 등재 이력**: Round 2 worker 가 As-Is xfdl:321~336 `div_object_id` (commonDynamic.xfdl Essential) 누락 결함을 해소하려 OBJECT 조회 Modal 신설 → Round 3 사용자 결정으로 sub2 좌 인라인 그리드 분할 + filteredObjectRows useMemo 로 흡수되며 Modal 폐기. BE `searchObjectLov` action 은 Round 2 신설된 상태 유지 (인라인 그리드 데이터 소스로 재사용).

---

## §7. 빈 상태 / 로딩 / 에러 표시

> 구현 소스: `useApiCall` (로딩·성공/실패) + `useGfnMessage` (사용자 메시지) + `Spinner` (인라인) + `ErrorModal` (치명적).

| 상황 | 표시 위치 | 표시 방식 | 구현 |
|---|---|---|---|
| ds_main 데이터 없음 | grd_main ContentPanel 중앙 | 아이콘 + "조회 결과가 없습니다" | `AgDataGrid` 기본 empty state |
| ds_main 행 미선택 (rowposition < 0) | 우상 상세 ContentPanel 중앙 | 아이콘 + "목록에서 항목을 선택하세요" + 폼 전체 비활성화 (`gfn_setEnable(div_mainDetail, false)`, xfdl:340) | 화면 고유 표시 (분석 §3 D 영역 초기 상태) |
| ds_roleMap 데이터 없음 (선택 역할 권한 없음) | grd_sub1 ContentPanel 중앙 | 아이콘 + "조회 결과가 없습니다" | `AgDataGrid` 기본 empty state |
| ds_perm 데이터 없음 (모든 권한 이미 할당) | grd_sub2 ContentPanel 중앙 | 아이콘 + "조회 결과가 없습니다" | `AgDataGrid` 기본 empty state |
| 조회 로딩 중 (searchCmRole / searchCmRoleMap / searchCmPerm) | 해당 ContentPanel | 스피너 오버레이 | `Spinner` 또는 `AgDataGrid` loading prop |
| 저장 중 (saveCmRole / saveCmRoleMap) | 버튼 영역 (B-003 / BS-001 / BS-002) | 버튼 비활성 + 스피너 | `useApiCall` loading 상태 |
| 저장 성공 | 하단 status (div_bottom) | "{N}건 저장 되었습니다." (commonBottomStatus 메시지) + 확인 다이얼로그 "저장 되었습니다." | xfdl:478 / 512 (As-Is `gfn_message` → React `useGfnMessage` 토스트) |
| 조회 성공 | 하단 status | "{N}건 조회 되었습니다." | xfdl:456 / 487 / 518 |
| Validation 차단 (V-001~V-008) | gfn_message 모달 (warning / information) | "선택된 ROLE ID가 없습니다." / "OBJECT ID 입력 후 추가해 주세요." 등 | `useGfnMessage` 모달 |
| API 에러 (400 / 500) | 하단 status (As-Is) + 토스트 (To-Be) | `commonBottomStatus_msg(strErrorMsg)` (As-Is xfdl:465 / 481) → `useGfnMessage` 토스트 (To-Be) | `useApiCall` 자동 처리 |
| 치명적 에러 | 전체 | `ErrorModal` | `@dk-oasis/shared/layout: ErrorModal` |

---

## §8. 반응형 규칙

| 브레이크포인트 | A-FILTER | MAIN 영역 | 비고 |
|---|---|---|---|
| 기본 (대형 ≥1280px) | 1행 4 필드 | 2x2 분할 (G/D + GE1/GE2 + 셔틀) | As-Is xfdl `Form width="1280" height="670"` |
| 중형 (1024~1279px) | 2행 분할 (2+2 필드) | 상하 분할 (G+D 상단 / GE1+GE2 하단 — 셔틀 가로 배치) | xfdl 좌표 보정 |
| 소형 (<1024px) | - | - | MES 화면 모바일 미지원 |

---

## §9. 아이콘

> 외부 아이콘 라이브러리 금지 (03 §A.5-4). 모든 아이콘은 `src/csa/commRoleMng/icons.ts` 의 path 상수 + 로컬 `Icon({ path })` 래퍼.

| 용도 | ICONS 상수명 | 출처 (SVG path 원본) | 비고 |
|---|---|---|---|
| 조회 (B-001 / B-012) | `ICONS.search` | Heroicons outline · magnifying-glass | 돋보기 |
| 초기화 (B-002) | `ICONS.reset` | Heroicons outline · arrow-path | 회전 화살표 |
| 저장 (B-003) | `ICONS.save` | Heroicons outline · floppy-disk | 디스크 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| ~~닫기 (B-004)~~ | ~~`ICONS.close`~~ | ~~Heroicons outline · x-mark~~ | **Round 7 폐기 (§J K-013)** — portal 탭 close 가 host 처리 |
| 행 추가 (B-008) | `ICONS.plus` | Heroicons outline · plus | + |
| 행 삭제 (B-009) | `ICONS.trash` | Heroicons outline · trash | 휴지통 |
| 행 복사 (B-010) | `ICONS.copy` | Heroicons outline · document-duplicate | 문서 복사 |
| 행 취소 (B-011) | `ICONS.arrowUturnLeft` | Heroicons outline · arrow-uturn-left | 되돌리기 |
| 셔틀 추가 (BS-002 ▲) | `ICONS.chevronUp` | Heroicons outline · chevron-up | ▲ |
| 셔틀 삭제 (BS-001 ▼) | `ICONS.chevronDown` | Heroicons outline · chevron-down | ▼ |
| 접기/펴기 (B-013) | `ICONS.chevronUp` / `ICONS.chevronDown` (토글) | (동일 재사용) | 접기 상태에 따라 toggle |
| 정렬 오름 | `ICONS.chevronUp` | (동일) | ▲ |
| 정렬 내림 | `ICONS.chevronDown` | (동일) | ▼ |
| 상태 행 (G-001 STATUS) | `ICONS.statusInserted` / `ICONS.statusUpdated` / `ICONS.statusDeleted` | (custom 정의 — As-Is xfdl displaytype `imagecontrol` 의 image path 1:1 인용) | rowType 별 분기 |

---

## §10. 스크린샷 / 와이어프레임 참조

> **(MUST)** 자유 서술 금지. 캡처 미제공 시 표 대신 1 줄 명시.

해당 없음 — §2.2 와이어프레임이 기준 (00 §3.3 캡처 미제공 정책 + xfdl Layout 좌표 1:1 복원).

| 화면 영역 | 캡처 경로 / 링크 | 출처 (As-Is / Figma / 운영) | 비고 |
|---|---|---|---|

---

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
## §J. 사용자 검수 이력 / 라운드 카탈로그

> 본 절은 ToBe 코드 구현 후 사용자 검수에서 발견된 결함 + 사용자 결정 정책 변경의 라운드별 요약. 상세 결함 명세 + 코드 변경 위치는 정합체크서 §K 정본 인용. W5 패턴 A~G 표시는 §3.1.1 (W5 A) / §3.4.1 (W5 B) / §3.4.2 (W5 C) / §3.4.3 (W5 G) / §5.1.1 (W5 E) 본문 유지.

| Round | 일자 | 변경 | 영향 §/D-NNN/G-NNN/B-NNN |
|---|---|---|---|
| Round 1 | 2026-06-02 | AsIs 1:1 재개발 (2x2 레이아웃) — 사전 ToBe 폐기 | §3.1.1 (W5 A) / §3.3.1 |
| Round 2 | 2026-06-02 | OBJECT-LoV 누락 결함 → searchObjectLov action 신설 + Modal (P-001) 신설 + 2x2 collapse 회피 | §3.1.1 (W5 A) / §3.1.2 (선행) / §6 P-001 |
| Round 3 | 2026-06-02 | OBJECT-LoV Modal (P-001) 폐기 + sub2 인라인 2 패널 분할 + 권한 추가 multi-row INSERT | §3.1.2 / §3.3.1 / §5 / §5.4.1 / §6 P-001 ~~폐기~~ |
| Round 4 | 2026-06-03 | FILTER 2 패널 신설 (sub2 좌/우) + OBJECT 목록 sub1 클라이언트 제외 + searchCmPerm NOT EXISTS 제거 (ACCESS_TP FILTER 2 옵션 추가는 본 화면 N/A) | §5.5.1 / §5.5.2 / §5.5.3 |
| Round 5 | 2026-06-03 | ROLE_ID (PK) readOnly — inserted 행만 입력 가능 | §3.4.2 / §5.5.X / D-002 |
| Round 6 | 2026-06-04 | OBJECT 목록 sub1 제외 + NOT EXISTS 제거 (Round 4 선행 — N/A) / ACCESS_TP FILTER 2 옵션 추가 (본 화면 N/A) / PK readOnly inserted-only (Round 5 선행 — N/A) | N/A (선행 라운드로 이미 반영) |
| Round 7 | 2026-06-04~05 | **btn_close (B-004) 완전 제거** — PageLayout buttons 배열에서 entry 삭제 + 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준 (조회/초기화/저장). 사유: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼은 의미 ✗ | §3.1 A-BTN / §5 PageLayout.buttons / §5.1.1 W5 E B-004 / §9 아이콘 B-004 / B-004 |

> **W5 패턴 A~G 표시 (기존 보존)**:
> - W5 A — 2x2 collapse 회피 (§3.1.1)
> - W5 B — Detail wrapper 2-line 헤더 (§3.4.1)
> - W5 C — Form row 정렬 (§3.4.2)
> - W5 E — 버튼 활성화 정책 (§5.1.1)
> - W5 G — END_OF_TIME 9999-12-31 00:00:00 (§3.4.3)
> - W5 D / F — 본 화면 미적용 (Detail line2 본문 회색화 N/A — J-012 / Detail title 좌측 정렬 N/A — commRoleMng Detail 단독 패널)

---

## §6.14 Phase 3 종료 자가 점검 (4 질문)

1. **14항 위반?** — 위반 ✗. 분석 §3 + 기능 §3 / §3.2 / §4 / §5 / §9 인용. 컴포넌트 신규 추가 ✗ (PageLayout / SearchArea / AgDataGrid / ContentBody / ContentPanel / GridPanel / Input / ComboBox / DatePicker / RadioGroup / ErrorModal 등 03 §A.9-3 등재 심볼만). 본 갱신 (2026-06-04): W5 A~G + Round 2~5 정합 항목 신설 — §3.1.1 (W5 A / 2x2 collapse 회피) / §3.1.2 (sub2 인라인 분할 / Round 3) / §3.3.1 (ToBe 실 구조 ASCII) / §3.4.1 (W5 B Detail wrapper) / §3.4.2 (W5 C Form row) / §3.4.3 (W5 G END_OF_TIME) / §5.1.1 (W5 E 버튼 정책) / §5.4.1 (multi-row INSERT / Round 3) / §5.5.1 (FILTER 2 패널 / Round 4) / §5.5.2 (OBJECT 클라이언트 제외 / Round 4) / §5.5.3 (NOT EXISTS 제거 / Round 4) / §5.5.X (ROLE_ID readOnly / Round 5). P-001 Round 3 폐기 명시.
2. **검증 안 한 부분?** — 없음. Q 활성 0 (17건 전수 closed). 미반영 사유: BIZ_SYSTEM 정책 #1 — 결정 누적 §G 정본 잔존 (분석/기능/디자인 4 산출물 §C 5축 정합 일치).
3. **그대로 수용?** — Round 2~5 모든 worker 재지시 결과 본문 갱신 + 코드 동시 반영 (정합체크서 §J 추적).
4. **임의 합리화?** — 없음. 모든 결정은 (a) AsIs 1:1 / (b) 사용자 결정 (Round 3 인라인 / Round 4 NOT EXISTS 제거 / Round 5 readOnly) / (c) W5 commUserMng 정본 (iter#2~#4) 인용.

→ Phase 3 통과 (갱신 2026-06-04 — W5 A~G + Round 2~5 sub-section 등재 / Q 활성 0).

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
→ Phase 3 재통과 (갱신 2026-06-05 — Round 6 (N/A 선행) / Round 7 (B-004 btn_close 완전 제거) 등재 + §J 라운드 카탈로그 신설). 본 갱신 영향 §: §3.1 A-BTN / §5 PageLayout.buttons / §5.1.1 B-004 / §9 아이콘 B-004 / §J 신설.
