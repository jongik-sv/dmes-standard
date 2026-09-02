---
screenId: commMenuMng
asIsId: CommMenuMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# mcm — 메뉴 관리 디자인설계서

> **Frontend 개발 연계 값** (기능설계서 §1.2 와 동일):
> - mesModule = `m-mcm` / moduleGroup = `csa` / pageName = `commMenuMng` / pageId = `commMenuMng` / 페이지 유형 = **D 다중 그리드 + 단일 상세 폼** / tsup entry key = `pages/csa/commMenuMng`
>
> **명명 룰**: MES 단일 룰 (mcm 모듈 — APS 예외 미적용). 4 식별자 1byte 동일.
>
> **인용 정본**: 분석리포트 §3 (UI 컴포넌트 전수) + 기능설계서 §3 (S/G/GT/GO) + §4 (D) + §5 (B). 자체 추가 ✗.

---

## 0. W5 패턴 + cross-cutting 정책 반영 (2026-06-02 ~ 2026-06-05 사용자 검수 이력)

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
> **본 디자인설계서는 commMenuMng iter#1~#5 + Round 6~7 + Phase 1~4 사용자 검수 결과를 본문 반영한다.** 변경 카탈로그 (W5 A~G / Tree 컴포넌트 / OBJECT_ID LoV 자동 매핑 / FULL_SEQ 인코딩 / 그룹 ID 토큰 룰 / SEC_MENU vs SEC_MENU_FLD 분리 / WITH RECURSIVE 후손 조회 / SecMenuFld 컬럼 ADD / SecUserService.getMyMenus 결합 / Round 6 btn_close 제거 / Round 6 OBJECT 검색 LookupModal 통일 / Round 6 메뉴 트리 3차 정렬 / Round 7 메뉴 필드 관리 팝업 신설 / Phase 1+2 componentPath / Phase 3+4 page-registry codegen) — 상세 이력 = 정합체크서 §J.

### 0.1 W5 A~G 적용 매핑 (다른 csa/cme 화면과 동일)

| Pattern | 적용 위치 | 적용 결과 |
|---|---|---|
| **A** PageLayout 레이아웃 | 본 §1.2 / §2.2 | `<PageLayout title="메뉴 관리" buttons={topButtons}>` + SearchArea + ContentBody + 3 분할 ContentPanel (Tree / List+Object / Detail) |
| **B** Detail wrapper | 본 §3.5 | `<DetailForm wrapper>` D-001~D-018 18 컨트롤 + Essential `*` 표시 |
| **C** Form row | 본 §3.5 | label width=140 + input left=143 (라벨/입력 1:1 행) |
| **D** Grid | 본 §4.1~§4.3 | AgDataGrid × 3 (List 12 col / Tree 1 col / Object 8 col To-Be) |
| **E** Buttons (commonTopButton 4 / commonLeft 3 / commonRight 5 + fold 1) | 본 §5.1~§5.4 | 외부 framework 자동 주입 + `fn_search` / `fn_save` / `fn_rowAdd` 등 wiring |
| **F** Auto-search | csa 자동조회 정책 | 화면 onload 시 `loadList` 자동 실행 (xfdl `gfn_formOnLoad(obj,true)` 등가). 사용자 결정 [2026-06-02 csa 8 화면 정책] |
| **G** BE 시간 | 전 컬럼 cactus-core `CactusAuditEntity` | START_ACTIVE_DATE / END_ACTIVE_DATE 직접 표시 + CREATE_DATE / UPDATE_DATE audit 자동 (서버 시간 — 클라 시간 사용 ✗) |

### 0.2 FULL_SEQ 인코딩 체계 (cross-cutting reference, Round 3 — 2026-06-03 / 자동부여 갱신 2026-06-05 iter#6)

> **본 화면 D-009 FULL SEQ 컬럼 + SEC_MENU 시드 17 행 일괄 재인코딩에 적용되는 모듈 전역 인코딩 룰.**
>
> **(2026-06-05 / iter#6) FULL_SEQ 는 사용자가 직접 입력하지 않고 자동부여된다.** BE `SecMenuNativeRepository.recomputeMenuFullSeq()` 가 메뉴 트리 전체 FULL_SEQ 를 7자리 인코딩으로 **멱등 재계산**한다. 호출 시점 = ⑴ `CommMenuMngService.saveCmMenu` / `saveCmMenuFld` 의 CRUD 직후·재조회 직전, ⑵ `DataInitializer` 기동 시(SoT — System of Truth). 즉 저장할 때마다 + 애플리케이션 기동 시마다 트리 전체가 재인코딩되어 정합이 유지된다.

| 단위 | 자릿값 | 예 |
|---|---:|---|
| 모듈 (TB_MCM_SEC_MENU_FLD, PARENT_MENU_ID NULL) | i×1,000,000 (i=1..9) | 1번째 모듈 = 1,000,000 / 2번째 모듈 = 2,000,000 / 3번째 = 3,000,000 … (mcm 은 1번째 = 1,000,000) |
| 그룹 폴더 (FLD child) | 부모BASE + j×10,000 (j=1..99) | cma = +10,000 / csa = +20,000 / cme = +30,000 (그룹 등록 순) |
| 화면 (TB_MCM_SEC_MENU) | 그룹BASE + 100 + k×10 (k=0..89) | 그룹 내 화면 k → 그룹BASE + 100 + k×10 |

* **결과 예 (csa/메뉴 관리)**: mcm(1,000,000) + csa(+20,000) + 화면 위치(+100 + k×10) = 1,02n,nnn.
* 17 row 시드 일괄 재인코딩: 본 룰 적용 → SEC_MENU + SEC_MENU_FLD 시드 모두 정합. 마이그레이션 SQL 본문 = 마이그레이션 디렉터리 정본. **(iter#6)** 시드뿐 아니라 저장·기동 시 `recomputeMenuFullSeq()` 가 동일 인코딩으로 재계산하므로 사용자 추가/삭제 후에도 트리 전체 FULL_SEQ 가 자동 멱등 정규화된다.
* **모듈 일반화 (iter#6)**: 모듈 BASE 는 등록 순서 i 에 대해 i×1,000,000 으로 일반화된다 (1번째=1,000,000, 2번째=2,000,000 …). 모듈은 `TB_MCM_SEC_MENU_FLD` 에서 `PARENT_MENU_ID IS NULL` 인 폴더 행으로 식별한다.

### 0.3 그룹 ID 토큰 룰 (Round 3 — 2026-06-03)

> As-Is 3 글자 그룹 토큰 `cma` / `csa` / `cme` 를 그대로 사용 — 접두 `grp-` 제거 결정. 본 화면 `moduleGroup=csa` 는 본 룰 적용 결과이다.

| As-Is (제안) | To-Be 정본 |
|---|---|
| ~~grp-cma~~ | `cma` |
| ~~grp-csa~~ | `csa` |
| ~~grp-cme~~ | `cme` |

* 본 룰은 frontmatter `moduleGroup` / pageId / tsup entry key 모두 동기 적용.

### 0.4 SEC_MENU vs SEC_MENU_FLD 분리 (Round 3 — 2026-06-03 / PK 단독화 2026-06-05 iter#6)

| 테이블 | 역할 | PK | 본 화면 영향 |
|---|---|---|---|
| `TB_MCM_SEC_MENU` | **leaf 13 화면만** 등재 (실제 페이지) | **MENU_ID 단독** (To-Be — iter#6) | 메인 그리드 (G-001~G-012) 표시 대상 |
| `TB_MCM_SEC_MENU_FLD` | **폴더 4 행** (mcm 1 + cma/csa/cme 3) | MENU_ID 단독 (변경 없음) | 메뉴 트리 (GT-001) 구조 노드. 메인 그리드 표시 ✗ (필요 시 JOIN) |

* SecMenuFld 컬럼 멱등 ADD: `FULL_SEQ` / `USE_TP` / `MENU_TP` / `MENU_VIEW_YN` 4 컬럼 ALTER ADD (마이그레이션 디렉터리 정본) + 시드 보정.
* `SecUserService.getMyMenus` 가 SEC_MENU + SEC_MENU_FLD 결합 반환 → portal 사이드바 트리 정합.
* **(2026-06-05 / iter#6) TB_MCM_SEC_MENU PK = MENU_ID 단독화** (사용자 결정 2026-06-05): As-Is 복합 PK `(MENU_ID, MENU_SEQ)` → `MENU_ID` 단독. MENU_SEQ 는 PK 에서 분리되어 순수 "메뉴 순서" 컬럼이 된다.
  - 엔티티 `SecMenu`: `@IdClass` / `menuSeq @Id` / PK 클래스 제거. `SecMenuRepository` 는 `JpaRepository<SecMenu, String>` 으로 변경.
  - `saveCmMenu` 키는 menuId 단독. 신규등록 시 MENU_ID 가 이미 존재하면 오류 처리(무단 덮어쓰기 차단).
  - 기동 시 자동 마이그레이션: 기존 복합 PK 를 자동 감지하여 DROP 후 MENU_ID 단독 PK 재생성(멱등). `TB_MCM_SEC_MENU_FLD` 는 이미 MENU_ID 단독 PK 라 변경 없음(정합 유지).

### 0.5 WITH RECURSIVE 후손 조회 (Round 3 — 2026-06-03)

> 트리 노드 (폴더) click 시 그 후손 폴더 IDs 를 MSSQL CTE 로 일괄 수집한 뒤 `SEC_MENU.PARENT_MENU_ID IN (...)` 으로 leaf 화면을 메인 그리드에 노출.

```sql
WITH FldDesc AS (
  SELECT MENU_ID FROM TB_MCM_SEC_MENU_FLD WHERE MENU_ID = #{rootMenuId}
  UNION ALL
  SELECT f.MENU_ID FROM TB_MCM_SEC_MENU_FLD f
  INNER JOIN FldDesc d ON f.PARENT_MENU_ID = d.MENU_ID
)
SELECT * FROM TB_MCM_SEC_MENU
 WHERE PARENT_MENU_ID IN (SELECT MENU_ID FROM FldDesc)
```

* As-Is Oracle `CONNECT BY PRIOR` 등가 → MSSQL CTE 변환 (정합체크 §F 변환점 행 포함).

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### 0.6 Phase 1+2 componentPath derived 필드 (2026-06-05)

> **BE `myMenusTree` 응답 DTO 에 derived 필드 `componentPath` 추가** = `${PARENT_MENU_ID}/${OBJECT_ID}`. FE `Sidebar` 가 그대로 소비 → portal 라우팅에서 정적 `module-pages.ts` 의존을 우회한다.

| 항목 | 결정 |
|---|---|
| 발생 위치 | BE — `SecUserService.getMyMenus` 트리 응답 |
| 필드 명 | `componentPath` (String) |
| 산출 공식 | `${PARENT_MENU_ID}/${OBJECT_ID}` (예: `csa/commMenuMng`) |
| FE 소비 | portal `Sidebar` 컴포넌트 — 메뉴 click 시 `componentPath` 를 직접 라우팅 키로 사용 |
| 효과 | 정적 `module-pages.ts` 의존 우회 — 신규 화면 등록 시 BE 시드 (FULL_SEQ 자동 인코딩) 만으로 사이드바·라우팅 동작 |

### 0.7 Phase 3+4 page-registry codegen (2026-06-05)

> **codegen 스크립트 `scripts/generate-page-registry.mjs` 신설** + **auto-generated `lib/generated/page-registry.ts` 도입** → 기존 정적 `module-pages.ts` 파일 **완전 제거**.

| 항목 | 결정 |
|---|---|
| codegen 스크립트 | `scripts/generate-page-registry.mjs` (신설) — 파일 시스템 스캔으로 page 등록 자동 산출 |
| 산출물 | `lib/generated/page-registry.ts` (auto-generated, manual 편집 ✗) |
| 폐기 | 기존 `module-pages.ts` 파일 **완전 제거** (Phase 4) |
| 효과 | 화면 추가 / 삭제 시 codegen 재실행 만으로 registry 동기. 수기 편집 결함 차단. 0.6 componentPath 와 결합 시 BE 시드 + codegen 만으로 신규 화면 등록 완료 |

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
- 표시 형식 (MES 단일 룰): `mcm:commMenuMng`
- moduleId 정본: 01 A.1 (업무 페이지는 `portal` 금지)

### 1.2 화면 설계 대상 영역 (PageLayout 기반)

```
┌────────────────────────────────────────────────────────────┐
│ PageLayout.title = "메뉴 관리"                              │
│ <!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->            │
│ PageLayout.buttons = [ btn_search, btn_reset, btn_save ]    │
│   (commonTopButton **To-Be 3 개** — Round 6 btn_close 제거) │
│  ├─ SearchArea  (A-FILTER)                                  │
│  │    └─ SearchField × **To-Be 3** (As-Is 4, S-001 cross-cutting 정책 #1 폐기)│
│  │       (~~S-001 BIZ SYSTEM combo (폐기)~~ / S-002 메뉴 ID    │
│  │        textbox / S-003 메뉴 명 textbox / S-004 사용 유무 combo)│
│  ├─ FoldButton (B-013 div_search 접기/펴기)                  │
│  └─ ContentBody (MAIN — 3 분할: 트리 / 리스트+OBJECT / 상세)  │
│        ├─ ContentPanel-LEFT  (A-MAIN-TREE)                  │
│        │     └─ AgDataGrid (Tree GT-001)                    │
│        ├─ ContentPanel-CENTER (A-MAIN-LIST)                 │
│        │     ├─ Toolbar [commonLeftButton 3 + commonRight   │
│        │     │           Button 5]                          │
│        │     ├─ AgDataGrid (List G-001~G-012)               │
│        │     └─ AgDataGrid (OBJECT GO-001~GO-009)           │
│        └─ ContentPanel-RIGHT (A-MAIN-DETAIL)                │
│              └─ DetailForm (D-001~D-018, 18 입력 컨트롤)     │
└────────────────────────────────────────────────────────────┘
```

| 영역 | 담당 컴포넌트 | 비고 |
|---|---|---|
| SIDEBAR / HEADER / TabsBar | portal PortalShell | 화면별 설계 대상 아님 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 페이지 타이틀 / 상단 버튼바 | `PageLayout` `title` / `buttons` | `title` = "메뉴 관리" / `buttons` = [btn_search, btn_reset, btn_save] **(To-Be 3 — Round 6 btn_close 제거. 사유: portal 탭 close 는 host 가 처리, 화면 내부 닫기 버튼 의미 ✗)** |
| A-FILTER (조회조건) | `SearchArea` + `SearchField` × 4 | `@dk-oasis/shared/layout` |
| MAIN (콘텐츠) | `ContentBody` + `ContentPanel` × 3 (좌/중앙/우 분할) | `@dk-oasis/shared/layout` |
| 그리드 (트리 / 리스트 / OBJECT) | `AgDataGrid` (+ `useGridDataManager`) | `@dk-oasis/shared/grid` (Tree 는 treeData 옵션) |
| 폼 (상세 입력) | `DetailForm` 의 Input / Select / Radio / Calendar / TextArea / Dynamic LoV | `@dk-oasis/shared/form` |
| 팝업 (P-001 OBJECT LoV) | `DynamicLovModal` (commonDynamic.xfdl 등가) | `@dk-oasis/shared/modal` |

---

## 2. 화면 레이아웃

### 2.1 레이아웃 유형 + 페이지 유형 자동 결정

| 항목 | 값 |
|---|---|
| **페이지 유형 (자동 결정)** | **D 다중 그리드 + 단일 상세 폼** (분석 §3 — G=12 + GT=1 + GO=9 + D=18 → 3 그리드 + 1 폼) |
| **레이아웃 유형** | **3 분할형** (As-Is xfdl: 좌측 트리 width=250 / 중앙 리스트+OBJECT left=260 right=450 / 우측 상세폼 width=440 height=466) |
| **참조 화면** | (없음 — `-`) |

### 2.2 메인 영역 구조도 (As-Is 좌표 1:1 보존)

```
top=0 ──────────────────────────────────────────────────────  left=20, right=20
│ A-TITLE (div_title, height=40)                              │
│  edt_title "메뉴 관리" (width=250)                            │
│        │  commonTopButton (btn_search/btn_reset/btn_save/   │
│        │                    btn_close, left=270 height=27) │
top=div_title:10 ────────────────────────────────────────────
│ A-FILTER (div_search, height=43, cssclass=div_WFSA_Box)     │
│  ~~[BIZ SYSTEM] [cbo_bizSystemCode]~~ (To-Be 폐기) [메뉴 ID]  │
│  [edt_MENU_ID] [메뉴 명] [edt_MENU_NM] [사용 유무] [cbo_USE_TP]│
top=93 ─────────────────────────────────────────────────────
│ B-013 btn_fold (height=10, 접기 토글)                        │
top=btn_fold:20 ────────────────────────────────────────────
│ A-MAIN (div_main, bottom=40, 3 분할)                        │
│ ┌────────────┬──────────────────────┬──────────────────┐  │
│ │ A-MAIN-    │ A-MAIN-LIST          │ A-MAIN-DETAIL    │  │
│ │  TREE      │ (left=260 right=450) │ (width=440       │  │
│ │ (width=250)│                       │  height=466)     │  │
│ │            │ ┌── Toolbar ────────┐│ ┌────────────┐ │  │
│ │            │ │ edt_srch_cseq    ││ │ 라벨/입력  │ │  │
│ │            │ │ ("조회 결과")    ││ │ 좌측 width │ │  │
│ │            │ │ div_leftMenu     ││ │ =140       │ │  │
│ │            │ │ (chk/sum/copy)   ││ │ 입력 left  │ │  │
│ │            │ │ edt_dtl_info    ││ │ =143 ~     │ │  │
│ │            │ │ ("상세 정보")    ││ │ 18 컨트롤  │ │  │
│ │            │ │ div_rightMenu    ││ │ 가로 2 단  │ │  │
│ │            │ │ (rowInsert/Add/  ││ │ 폼 배치    │ │  │
│ │            │ │  Delete/Copy/    ││ │            │ │  │
│ │            │ │  Cancel)         ││ └────────────┘ │  │
│ │            │ └──────────────────┘│ ┌──────────────┐ │
│ │            │ ┌── grd_M0F0 top=25┐│ │ grd_object   │ │
│ │ ┌──── ────┐│ │  G-001~G-012     ││ │ Mng (GO 9 col│ │
│ │ │ grd_M0F1││ │  메뉴 리스트       ││ │  top=div_   │ │
│ │ │ GT-001  ││ │                  ││ │  detail:6)   │ │
│ │ │ 트리     ││ └──────────────────┘│ │              │ │
│ │ │  top=25 ││                      │ └──────────────┘ │
│ │ │ bottom=0││                      │                  │
│ │ └─────────┘│                      │                  │
│ └────────────┴──────────────────────┴──────────────────┘  │
bottom=0 ───────────────────────────────────────────────────
│ A-FOOTER (div_bottom, height=20, border 1px solid #ededed)  │
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
| A-FOLD | 10 px 고정 | 100% (left=20 / right=20) | 없음 | N | btn_fold (xfdl:29) |
| A-MAIN | 가변 (top=btn_fold:20 / bottom=40) | 100% (left=20 / right=20) | (자식 그리드별 세로) | Y (xfdl 3 분할 비율 고정) | div_main (xfdl:30) |
| A-MAIN-TREE | A-MAIN 동일 (top=25 / bottom=0 within div_main) | 250 px 고정 (left=0) | 세로 (grd_M0F1) | N (xfdl 고정) | grd_M0F1 (xfdl:87) |
| A-MAIN-LIST | A-MAIN 동일 (top=25 / bottom=0) | 약 35% (left=260 / right=450) | 세로 (grd_M0F0) | N | grd_M0F0 (xfdl:35) |
| A-MAIN-DETAIL | top=25 / height=466 | 440 px 고정 (left=grd_M0F0:10) | 없음 (폼 입력 영역) | N | div_detail (xfdl:106) |
| A-MAIN-OBJECT | top=div_detail:6 / height=67 | 435 px 고정 (left=grd_M0F0:10) | 세로 (필요 시) | N | grd_objectMng (xfdl:180) |
| A-MAIN-LEFTMENU | 21 px 고정 | 157 px (left=edt_srch_cseq:3) | 없음 | N | div_leftMenu (xfdl:34) |
| A-MAIN-RIGHTMENU | 21 px 고정 | 340 px (right=450) | 없음 | N | div_rightMenu (xfdl:179) |
| A-FOOTER | 20 px 고정 | 100% (left=20 / right=20) | 없음 | N | div_bottom (xfdl:28) |

### 3.2 A-FILTER 내부 배치 (좌표 As-Is 1:1 + To-Be 폐기 marker)

```
top=10 ─────────────────────────────────────────────────────────────────────
│ ~~[BIZ SYSTEM] [cbo_biz]~~ (To-Be 폐기) [메뉴 ID] [edt_MENU_ID]              │
│  ↑              ↑                        ↑         ↑                         │
│  ~~stc_~~      ~~width=80~~              stsuseId  width=100 maxlength=300   │
│  ~~bizSystemCode value="Y"~~             width=55  text="부산역 CY"          │
│  ~~(width=90)~~ ~~displaynull~~                    text="메뉴 ID"            │
│                 ~~text="전체"~~                                              │
│  ──── 이어서 ────                                                            │
│  [메뉴 명] [edt_MENU_NM]  [사용 유무] [cbo_USE_TP]                           │
│   ↑         ↑              ↑          ↑                                     │
│   stsuseNm  width=200      edt_useTp  width=72                              │
│   width=55  maxlength=300  width=65   index=0 value="Y" text="Y"            │
│             text="부산역 CY"                                                 │
top=30 ─────────────────────────────────────────────────────────────────────
* To-Be 좌표 재배치: stsuseId / edt_MENU_ID 가 div_search 의 첫 컴포넌트로 이동 (좌측 left=10 start).
```

| 컨트롤 | 정확한 xfdl 좌표 | cssclass | 비고 |
|---|---|---|---|
| ~~stc_bizSystemCode (S-001 라벨)~~ | ~~left=10 / top=10 / width=90 / height=21~~ | ~~edi_WFSA_Label~~ | **As-Is**: "BIZ SYSTEM" 라벨. **To-Be 폐기** (cross-cutting 정책 #1) |
| ~~cbo_bizSystemCode (S-001 입력)~~ | ~~left=stc_bizSystemCode:10 / top=10 / width=80 / height=21~~ | ~~(없음)~~ | **As-Is**: displayrowcount=10 / index=0 / value="Y" / text="Y" / displaynulltext="전체" / innerdataset=ds_lovSubSystem. **To-Be 폐기** (cross-cutting 정책 #1) |
| stsuseId (S-002 라벨) | left=cbo_bizSystemCode:40 / top=10 / width=55 / height=21 (**To-Be**: left=10 / 첫 컴포넌트 위치로 이동) | edi_WFSA_Label | "메뉴 ID" / tooltiptype="hover" |
| edt_MENU_ID (S-002 입력) | left=stsuseId:10 / top=10 / width=100 / height=21 | (없음) | maxlength=300 / text="부산역 CY" |
| stsuseNm (S-003 라벨) | left=edt_MENU_ID:40 / top=10 / width=55 / height=21 | edi_WFSA_Label | "메뉴 명" / tooltiptype="hover" |
| edt_MENU_NM (S-003 입력) | left=stsuseNm:10 / top=10 / width=200 / height=21 | (없음) | maxlength=300 / text="부산역 CY" |
| edt_useTp (S-004 라벨) | left=edt_MENU_NM:40 / top=10 / width=65 / height=21 | edi_WFSA_Label | "사용 유무" |
| cbo_USE_TP (S-004 입력) | left=edt_useTp:10 / top=10 / width=72 / height=21 | (없음) | displayrowcount=7 / index=0 / value="Y" / text="Y" / innerdataset=ds_cboUseYn |

### 3.3 A-MAIN-TREE 내부 배치 (메뉴 트리)

```
top=25 ──────────────────────────────────────────────────────────────────  right=0
│ grd_M0F1 (binddataset=ds_menuTreeList, taborder=0)                       │
│  Format: head 1줄 (26px) + body 1줄 (26px) / Column 1개 (size=182)        │
│  treeinitstatus="expand,all" / autofittype="col" / autosizingtype="col"   │
│                                                                            │
│  Head row 0:  메뉴 구조                                                    │
│  Body row:    bind:MENU_NM (displaytype=treeitemcontrol                    │
│               treelevel=bind:LEV treestartlevel=0 edittype=tree)           │
│                                                                            │
│  options: width=250 / bottom=0                                             │
│  events:  oncellclick → searchCmMenu 트랜잭션 (xfdl:770)                    │
│           onmousemove → tooltiptext 동적 세트 (xfdl:830)                    │
bottom=0 ───────────────────────────────────────────────────────────────
```

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
#### 3.3.1 To-Be 트리 컴포넌트 — shared `<Tree>` + nested TreeNode (Round 2~3, 2026-06-02 ~ 2026-06-03 / 3차 정렬 Round 6, 2026-06-04)

> **As-Is**: AgGrid `grd_M0F1` 의 단일 컬럼 + `treeitemcontrol` displaytype + `treelevel=bind:LEV` (LEV 들여쓰기 로직). 본 화면 트리는 1 단 깊이뿐 아니라 폴더 4 행 (mcm / cma / csa / cme) → leaf 13 화면의 **다단 계층**.
>
> **To-Be**: AgGrid LEV 들여쓰기 패턴을 폐기하고 `@dk-oasis/shared/tree` 의 `<Tree>` 컴포넌트 + nested `TreeNode` 구조로 전환.

| 항목 | 결정 |
|---|---|
| 컴포넌트 | shared `<Tree>` (Tree.tsx) — `@dk-oasis/shared/tree` |
| 데이터 모델 | nested `TreeNode` 객체 (children[] 재귀). 평면 LEV 컬럼 ✗ |
| 초기 전개 | `expandAll` prop = true (As-Is xfdl `treeinitstatus="expand,all"` 등가) |
| 스타일 | `tree.css` import 필요 (shared 1줄 추가 + rebuild) |
| 클릭 핸들러 | `onNodeClick(node)` → 폴더 노드는 SEC_MENU_FLD WITH RECURSIVE 후손 조회 (§0.5) → 메인 그리드 로드 / leaf 노드는 단일 MENU_ID 로드 |
| 마우스오버 | `title` 또는 tooltip prop — As-Is `onmousemove → tooltiptext 동적` 등가 (브라우저 환경 한정) |
| **정렬 — Round 6 (2026-06-04)** | `buildMenuTree()` 의 정렬 pass = **3차 정렬**. **(1)** 부모-자식 구조 그룹핑 → **(2)** `MENU_SEQ asc` (numeric — `parseInt` 후 비교) → **(3)** `FULL_SEQ asc` (tiebreak). `CommMenuMngTreeRow` 타입에 **`FULL_SEQ?: string` optional 필드** 추가. 동일 MENU_SEQ 노드는 FULL_SEQ 순으로 안정 정렬 |

**Tree.tsx 1줄 추가** (`@dk-oasis/shared` 측):

```ts
import './tree.css'; // Round 2 — 트리 스타일 적용 (shared rebuild 후 본 화면에 적용)
```

> Round 2 (2026-06-02): AgGrid LEV 들여쓰기 → shared `<Tree>` 컴포넌트 + nested TreeNode 구조 전환 결정. Round 3 (2026-06-03): `tree.css` import 추가 및 shared 패키지 rebuild 적용. Round 6 (2026-06-04): 3차 정렬 pass 추가 (MENU_SEQ numeric asc + FULL_SEQ tiebreak).

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
#### 3.3.2 트리 헤더 — "필드 관리" 버튼 (Round 7 — 2026-06-04~05)

> **좌측 트리 헤더 우측에 "필드 관리" 버튼 신설**. 클릭 시 xl size Modal 팝업 (§6.2 P-002) 으로 메뉴 필드 4 컬럼 batch 편집.

| 항목 | 결정 |
|---|---|
| 위치 | A-MAIN-TREE 헤더 (그리드 상단 toolbar 우측 정렬) |
| 컴포넌트 | shared `<Button>` (variant=primary, size=sm) |
| 트리거 | `onClick` → `openMenuFldModal()` (xl size Modal 표시) |
| 가시성 | 트리 헤더에 항상 표시 |

### 3.4 A-MAIN-LIST 내부 배치 (메뉴 리스트)

```
top=0 ───────────────────────────────────────────────────────────────────  right=0
│ Toolbar (top=0, height=21)                                              │
│  edt_srch_cseq (left=263 width=64 — "조회 결과" 표시)                     │
│  div_leftMenu (left=edt_srch_cseq:3 width=157 — chk/sum/copy 3 도구)     │
│  edt_dtl_info (top=0 width=77 right=363 — "상세 정보" 표시)              │
│  div_rightMenu (top=0 width=340 right=450 — rowInsert/Add/Delete/        │
│                  Copy/Cancel 5 버튼)                                     │
top=25 ──────────────────────────────────────────────────────────────────
│ grd_M0F0 (binddataset=ds_menuList, taborder=1)                          │
│  Format: head 1줄 (24px) + body 1줄 (24px) / Column 12개                 │
│  Columns: 40/80/80/100/100/60/76/80/80/80/80/120  (총 996 px)            │
│                                                                          │
│  Head row 0:  상태│메뉴순서│메뉴 ID│메뉴명│OBJECT ID│FULL SEQ│사용구분│   │
│               메뉴타입│유효개시일│유효기한일│표시 여부│메뉴설명             │
│  Body row:    STATUS(image)│MENU_SEQ│MENU_ID│MENU_NM(autosize)│OBJECT_ID││
│               FULL_SEQ│USE_TP(combo)│MENU_TP│START_ACTIVE_DATE(date)│   │
│               END_ACTIVE_DATE(date)│MENU_VIEW_YN(combo)│MENU_DESC(auto)│ │
│                                                                          │
│  options: selecttype=cell / autosizebandtype=allband /                    │
│           autosizingtype=col / cellsizingtype=col /                       │
│           cellmovingtype=col / cellsizebandtype=allband                   │
│  events:  oncellclick → fn_searchObj + cbo_menu_id 자동 (xfdl:865)        │
│           onheadclick → gfn_commonOnheadclick (정렬, xfdl:794)            │
bottom=0 ───────────────────────────────────────────────────────────────
```

| Toolbar 컨트롤 위치 (xfdl 좌표) | 컨트롤ID | 좌표 |
|---|---|---|
| left=263 / top=0 / width=64 | edt_srch_cseq | "조회 결과" (cssclass=edi_WF_Title1) |
| left=edt_srch_cseq:3 / top=0 / width=157 | div_leftMenu | url include commonLeftButton.xfdl |
| top=0 / width=77 / right=363 | edt_dtl_info | "상세 정보" (cssclass=edi_WF_Title1) |
| top=0 / width=340 / right=450 | div_rightMenu | url include commonRightButton.xfdl |

### 3.5 A-MAIN-DETAIL 내부 배치 (상세 입력 폼)

> div_detail (xfdl:106~177): top=25 / left=grd_M0F0:10 / width=440 / height=466. 18 입력 컨트롤 + 17 라벨이 가로 2 단 (라벨 left=0 width=140 / 입력 left=143 width=가변) 으로 배치.

```
top=0 (div_detail 내부) ───────────────────────────────────────────────
│ ┌────────────────┬───────────────────────────────────────┐
│ │ (라벨)         │ (입력 컨트롤)                          │
│ ├────────────────┼───────────────────────────────────────┤
│ │ 메뉴 그룹*     │ cbo_menu_grp (D-001 Combo)             │
│ │ (Static00_00)  │  innerdataset=ds_menuGrp               │
│ │  top=0         │  top=4 height=21                       │
│ ├────────────────┼───────────────────────────────────────┤
│ │ 메뉴 ID*       │ cbo_menu_id (D-002 Combo)              │
│ │ (Static00)     │  innerdataset=ds_menuGrpSub            │
│ │  top=28        │  top=32 height=21                      │
│ ├────────────────┼───────────────────────────────────────┤
│ │ 메뉴 순서*     │ edt_lst_seq (D-004 TextBox)            │
│ │ (Static01)     │  숫자만 입력 maxLength=8 (To-Be iter#6) │
│ │  top=56        │  top=60 height=21                      │
│ │                │  저장 시 '0' LPAD 8자리("12"→"00000012")│
│ │                │  ─── edt_menu_seq (D-005 readonly,     │
│ │                │       left=302 top=60)                 │
│ ├────────────────┼───────────────────────────────────────┤
│ │ 메뉴명*        │ edt_menu_nm (D-006 TextBox)            │
│ │ (Static02)     │  top=88 height=21                      │
│ │  top=84        │                                         │
│ ├────────────────┼───────────────────────────────────────┤
│ │ OBJECT ID*     │ div_object_id (D-007 동적 LoV Div)     │
│ │ (Static03)     │  url=commonDynamic.xfdl                │
│ │  top=112       │  top=116 height=21                     │
│ ├────────────────┼───────────────────────────────────────┤
│ │ 상위 폴더      │ edt_parent_menu_id (D-008 readonly)    │
│ │ (Static06)     │  inputtype=digit                       │
│ │  top=140       │  top=144 height=21                     │
│ ├────────────────┼───────────────────────────────────────┤
│ │ FULL SEQ       │ edt_full_seq (D-009 TextBox)           │
│ │ (Static05)     │  inputtype=digit / readOnly (To-Be     │
│ │  top=168       │   iter#6 — 자동부여)                    │
│ │                │  placeholder="저장 시 자동 부여"        │
│ │                │  top=172 height=21                     │
│ ├────────────────┼───────────────────────────────────────┤
│ │ 사용 구분      │ rdo_use_tp (D-010 Radio)               │
│ │ (Static04)     │  Y=사용 / N=미사용 columncount=2        │
│ │  top=196       │  top=200 height=21                     │
│ ├────────────────┼───────────────────────────────────────┤
│ │ 메뉴 타입      │ cbo_menu_tp (D-011 Combo)              │
│ │ (Static08)     │  innerdataset 내부 WEB/MOBIL           │
│ │  top=224       │  top=228 height=21                     │
│ ├────────────────┼───────────────────────────────────────┤
│ │ 유효개시일     │ cal_start_active_date (D-012 Calendar) │
│ │ (Static09)     │  dateformat=yyyy-MM-dd                 │
│ │  top=252       │  top=256 width=214 height=21           │
│ ├────────────────┼───────────────────────────────────────┤
│ │ 유효기한일     │ cal_end_active_date (D-013 Calendar)   │
│ │ (Static10)     │  dateformat=yyyy-MM-dd                 │
│ │  top=280       │  top=284 width=214 height=21           │
│ ├────────────────┼───────────────────────────────────────┤
│ │ 표시 여부      │ rdo_menu_view_yn (D-014 Radio)         │
│ │ (Static11)     │  Y=표시 / N=미표시 columncount=2        │
│ │  top=308       │  top=312 height=21                     │
│ ├────────────────┼───────────────────────────────────────┤
│ │ 메뉴 설명      │ txa_menu_desc (D-015 TextArea)         │
│ │ (Static07)     │  height=40                             │
│ │  top=336 h=46  │  top=339 height=40                     │
│ ├────────────────┼───────────────────────────────────────┤
│ │ PARAM1         │ edt_param1 (D-016 TextBox)             │
│ │ (Static02_00)  │  top=385 height=21                     │
│ │  top=381       │                                         │
│ ├────────────────┼───────────────────────────────────────┤
│ │ PARAM2         │ edt_param2 (D-017 TextBox)             │
│ │ (Static02_00_  │  top=413 height=21                     │
│ │   00) top=409  │                                         │
│ ├────────────────┼───────────────────────────────────────┤
│ │ PARAM3         │ edt_param3 (D-018 TextBox)             │
│ │ (Static02_00_  │  top=441 height=21                     │
│ │   00_00) top=  │                                         │
│ │   437          │                                         │
│ └────────────────┴───────────────────────────────────────┘
└──────────────────────────────────────────────────────────
* = Essential (필수) cssclass 적용
```

| 라벨 / 입력 그룹 | xfdl 좌표 (라벨 left=0 width=140, 입력 left=143 / right=5) | 비고 |
|---|---|---|
| D-001 메뉴 그룹 | 라벨 Static00_00 top=0 height=29 / 입력 cbo_menu_grp top=4 height=21 | Essential |
| D-002 메뉴 ID | 라벨 Static00 top=28 height=29 (cssclass=edi_WF_LabelFirstE) / 입력 cbo_menu_id top=32 height=21 | Essential / autoselect=false / **To-Be: MENU_ID 입력은 inserted (신규) 행에서만 편집 가능, updated 행에서는 `readOnly`** (W5 정합 — 이미 적용됨, Round 5 점검) |
| D-004 메뉴 순서 + D-005 우측 표시 | 라벨 Static01 top=56 height=29 / D-004 입력 edt_lst_seq top=60 right=151 / D-005 edt_menu_seq left=302 top=60 right=5 readonly | D-004 Essential / D-005 readonly / **To-Be (iter#6): D-004 숫자만 입력(FE replace 필터), maxLength=8. 저장 시 '0' LPAD 8자리("12"→"00000012", BE `lpad8()`). C5(PK 단독화) 이후 SEC_MENU·FLD 모두 insert/update 에 LPAD 적용(이전 "신규만 LPAD" 제약 해소)** |
| D-006 메뉴명 | 라벨 Static02 top=84 height=29 / 입력 edt_menu_nm top=88 right=5 | Essential |
| D-007 OBJECT ID | 라벨 Static03 top=112 height=29 / 입력 div_object_id top=116 right=5 | Essential / url=commonDynamic.xfdl / **To-Be: Input `readOnly` 강제 (직접 입력 차단 — 검색 only). LoV 모달에서 OBJECT 선택 시 OBJECT_ID + PARENT_MENU_ID (상위 폴더) 동시 자동 세트** (Round 5 — 2026-06-04) |
| D-008 상위 폴더 | 라벨 Static06 top=140 height=29 / 입력 edt_parent_menu_id top=144 right=5 readonly | inputtype=digit |
| D-009 FULL SEQ | 라벨 Static05 top=168 height=29 / 입력 edt_full_seq top=172 right=5 | inputtype=digit / **To-Be (iter#6): `readOnly` 강제 (자동부여 — 사용자 직접 입력 ✗). placeholder="저장 시 자동 부여". 저장·기동 시 `recomputeMenuFullSeq()` 가 §0.2 인코딩으로 재계산** |
| D-010 사용 구분 | 라벨 Static04 top=196 height=29 / 입력 rdo_use_tp left=149 top=200 width=130 | LoV LV-001 |
| D-011 메뉴 타입 | 라벨 Static08 top=224 height=29 / 입력 cbo_menu_tp top=228 right=5 | LoV LV-003 (내부 hardcoded) |
| D-012 유효개시일 | 라벨 Static09 top=252 height=29 / 입력 cal_start_active_date left=144 top=256 width=214 | dateformat |
| D-013 유효기한일 | 라벨 Static10 top=280 height=29 / 입력 cal_end_active_date left=144 top=284 width=214 | dateformat |
| D-014 표시 여부 | 라벨 Static11 top=308 height=29 / 입력 rdo_menu_view_yn left=149 top=312 width=130 | LoV LV-002 |
| D-015 메뉴 설명 | 라벨 Static07 top=336 height=46 / 입력 txa_menu_desc top=339 right=5 height=40 | TextArea |
| D-016 PARAM1 | 라벨 Static02_00 top=381 height=29 / 입력 edt_param1 top=385 right=5 | - |
| D-017 PARAM2 | 라벨 Static02_00_00 top=409 height=29 / 입력 edt_param2 top=413 right=5 | - |
| D-018 PARAM3 | 라벨 Static02_00_00_00 top=437 height=29 / 입력 edt_param3 top=441 right=5 | - |

### 3.6 A-MAIN-OBJECT 내부 배치 (OBJECT 그리드)

```
top=div_detail:6 ──────────────────────────────────────────────────────  width=435
│ grd_objectMng (binddataset=ds_objMng, taborder=7)                       │
│  Format: head 1줄 (24px) + body 1줄 (24px) / Column **As-Is 9 → To-Be 8** │
│  Columns: 160/120/120/60/80/80/80/~~80~~/92  (As-Is 총 872 / To-Be 792 px)│
│                                                                          │
│  Head row 0:  FORM URL│SERVICE│PARAM│사용 유무│유효 개시일│유효 기한일│   │
│               SYSTEM│~~SUB SYSTEM~~│OBJECT TYPE  (SUB SYSTEM = GO-008 폐기)│
│  Body row:    FORM_URL(left/auto)│SERVICE(left)│PARAM(left)│USE_TP│      │
│               START_ACTIVE_DATE(date)│END_ACTIVE_DATE(date)│SYSTEM_CODE│ │
│               ~~BIZ_SYSTEM_CODE~~│OBJECT_TYPE  (BIZ_SYSTEM_CODE 폐기)     │
│                                                                          │
│  options: width=435 / height=67 (단일 행 표시)                            │
│  events:  (등록 없음 — read-only 표시 전용)                                │
top=div_detail:6 + 67 ───────────────────────────────────────────────────
```

---

## 4. 그리드 (G-NNN / GT-NNN / GO-NNN — 기능설계서 §3.2 인용)

### 4.1 G-NNN 메인 그리드 (`grd_M0F0` 메뉴 리스트)

| 컬럼 | size (xfdl) | cell type (head / body) | format | 정렬 | 편집 | 필수 |
|---|---:|---|---|---|---|---|
| G-001 상태 | 40 (band=left) | head:text="상태" / body:bind:STATUS displaytype=imagecontrol | image (auto row state) | Center | N | - |
| G-002 메뉴순서 | 80 | head:text="메뉴순서" / body:bind:MENU_SEQ | varchar (8자리 '0' LPAD — iter#6) | Center | N | - |
| G-003 메뉴 ID | 80 | head:text="메뉴 ID" / body:bind:MENU_ID | varchar | Left | N | - |
| G-004 메뉴명 | 100 | head:text="메뉴명" / body:bind:MENU_NM autosizecol=default controlautosizingtype=width textAlign=left | varchar | Left | N | - |
| G-005 OBJECT ID | 100 | head:text="OBJECT ID" / body:bind:OBJECT_ID textAlign=left | varchar | Left | N | - |
| G-006 FULL SEQ | 60 | head:text="FULL SEQ" / body:bind:FULL_SEQ | varchar (자동부여 표시 — iter#6, §0.2 7자리 인코딩) | Center | N | - |
| G-007 사용구분 | 76 | head:text="사용구분" / body:bind:USE_TP displaytype=combotext combodataset=ds_cboUseYn combocodecol=code combodatacol=name | combo (LV-001) | Center | N | - |
| G-008 메뉴타입 | 80 | head:text="메뉴타입" / body:bind:MENU_TP | varchar | Center | N | - |
| G-009 유효개시일 | 80 | head:text="유효개시일" / body:bind:START_ACTIVE_DATE displaytype=date calendardateformat=yyyy-MM-dd | date | Center | N | - |
| G-010 유효기한일 | 80 | head:text="유효기한일" / body:bind:END_ACTIVE_DATE displaytype=date calendardateformat=yyyy-MM-dd | date | Center | N | - |
| G-011 표시 여부 | 80 | head:text="표시 여부" / body:bind:MENU_VIEW_YN displaytype=combotext combodataset=ds_menuViewYn combocodecol=CD combodatacol=NM | combo (LV-002) | Center | N | - |
| G-012 메뉴설명 | 120 | head:text="메뉴설명" controlautosizingtype=width / body:bind:MENU_DESC textAlign=left | varchar | Left | N | - |

> 그리드 Header Row 1 (size=24) + Body Row 1 (size=24). `selecttype="cell"`, `autosizebandtype="allband"`, `autosizingtype="col"`, `cellsizingtype="col"`, `cellmovingtype="col"`, `cellsizebandtype="allband"`. font=12px Malgun Gothic.

### 4.2 GT-NNN 메뉴 트리 그리드 (`grd_M0F1`)

| 컬럼 | size | head | body | format | 비고 |
|---|---:|---|---|---|---|
| GT-001 메뉴 구조 | 182 | "메뉴 구조" (Row size=26) | bind:MENU_NM displaytype=treeitemcontrol treelevel=bind:LEV treestartlevel=0 edittype=tree | tree node | treeinitstatus="expand,all" (초기 전체 펼침) |

> 그리드 옵션: `autofittype="col"`, `autosizingtype="col"`, head Row 1 (26px) + body Row 1 (26px), font=12px Malgun Gothic, width=250.

### 4.3 GO-NNN OBJECT 그리드 (`grd_objectMng`)

| 컬럼 | size | head | body | format | 정렬 |
|---|---:|---|---|---|---|
| GO-001 FORM URL | 160 | "FORM URL" controlautosizingtype=width autosizecol=limitmax | bind:FORM_URL textAlign=left | varchar (autosize) | Left |
| GO-002 SERVICE | 120 | "SERVICE" | bind:SERVICE textAlign=left | varchar | Left |
| GO-003 PARAM | 120 | "PARAM" | bind:PARAM textAlign=left | varchar | Left |
| GO-004 사용 유무 | 60 | "사용 유무" | bind:USE_TP | varchar (raw Y/N) | Center |
| GO-005 유효 개시일 | 80 | "유효 개시일" | bind:START_ACTIVE_DATE calendardateformat=yyyy-MM-dd | date | Center |
| GO-006 유효 기한일 | 80 | "유효 기한일" | bind:END_ACTIVE_DATE calendardateformat=yyyy-MM-dd | date | Center |
| GO-007 SYSTEM | 80 | "SYSTEM" | bind:SYSTEM_CODE | varchar | Center |
| ~~GO-008 SUB SYSTEM~~ | ~~80~~ | ~~"SUB SYSTEM"~~ | ~~bind:BIZ_SYSTEM_CODE~~ | - | **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 컬럼 폐기) |
| GO-009 OBJECT TYPE | 92 | "OBJECT TYPE" | bind:OBJECT_TYPE | varchar | Center |

> 그리드 옵션: 단일 head Row + body Row (size=24), width=435, height=67. 단일 행 표시 (선택 메뉴의 단일 OBJECT_ID 에 대응).

### 4.4 그리드 추가 동작 (UX)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| UX-001 | 메뉴 트리 노드 click 시 해당 MENU_ID 로 searchCmMenu 트랜잭션 (gfn_setDivDefault(div_detail) + p_MENU_ID 파라미터) | grd_M0F1 oncellclick (xfdl:770) | 기능 §6.8 V-701 V-702 |
| UX-002 | 메뉴 트리 펼침/접힘 버튼 click 은 스킵 (clickitem == "treeitembutton") | 동일 | 기능 §6.8 V-701 |
| UX-003 | 메뉴 트리 mousemove 시 tooltiptext 동적 세트 (브라우저 환경에서만) | grd_M0F1 onmousemove (xfdl:830) | 분석 §4.4 #26 |
| UX-004 | 메뉴 리스트 cell click 시 OBJECT ID 자동 세트 + 메뉴 ID 콤보 자동 선택 (메뉴 depth 매칭 루프) + OBJECT 그리드 자동 갱신 | grd_M0F0 oncellclick (xfdl:865) | 기능 §6.7 V-601~V-603 |
| UX-005 | 메뉴 리스트 head click 시 공통 정렬 | grd_M0F0 onheadclick (xfdl:794) | 분석 §4.4 #22 |
| UX-006 | ds_menuList row position 변경 시 rowType=1 (삭제 행) → 입력 컨트롤 disable / 그 외 → enable | ds_menuList onrowposchanged (xfdl:895) | 기능 §6.10 V-901 V-902 |
| UX-007 | 행추가 / 행삽입 시 ds_menuTreeList 의 MENU_ID / MENU_SEQ 를 신규 행에 자동 세트 (선택된 트리 노드 기반) + cbo_menu_id.set_value | fn_rowAdd (xfdl:679) / fn_rowInsert (xfdl:711) | 기능 §6.11 V-A01~V-A08 |
| UX-008 | 행추가 시 ds_objMng 자동 clear (선택된 OBJECT 표시 제거) | fn_rowAdd (xfdl:684) | 분석 §4.4 #15 |
| UX-009 | 행복사 시 rowposition<0 차단 경고 "선택 행이 없습니다." | fn_rowCopy (xfdl:701) | 기능 §6.3 V-201 |
| UX-010 | 행삭제 시 OBJECT_ID 존재 확인 질문 다이얼로그 (existing 인 경우 question 후 fn_MsgDeleteCallBack) | fn_rowDelete (xfdl:496) | 기능 §6.2 V-101~V-103 |
| UX-011 | onload 시 div_detail 비활성 + 그리드 selected row 표시 색 ("red", "blue") | CommMenuMng_onload (xfdl:411~413) | 분석 §4.4 #2 |

---

## 5. 버튼 (toolbar / 그리드 셀) — 기능 §5.1 인용

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
### 5.1 공통 topMenu (div_title, EX-001 등록)

> **(Round 6 — 2026-06-04~05) commonTopButton 4 버튼 표준 → To-Be 3 버튼 표준** (조회/초기화/저장). B-004 btn_close 는 PageLayout buttons 배열에서 entry **완전 삭제** + unused `handleClose` dead code 제거. 사유: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼은 의미 ✗. 가이드 §6-E 4 버튼 표준의 본 화면 예외.

| 버튼ID | text (등록 이름) | cssclass | 등록 위치 | 동작 |
|---|---|---|---|---|
| B-001 | 조회 (btn_search) | (외부 framework 표준) | div_topMenu 의 fn_commonTop_onload 1번 | `fn_search` 호출 → searchCmMenu 트랜잭션 |
| B-002 | 초기화 (btn_reset) | (외부 framework 표준) | 2번 | `fn_reset` → gfn_setDivDefault(div_search) |
| B-003 | 저장 (btn_save) | (외부 framework 표준) | 3번 | `fn_save` → fn_before_save_chk + confirm → fn_MsgSaveCallBack → saveCmMenu |
| ~~B-004~~ | ~~닫기 (btn_close)~~ | ~~(외부 framework 표준)~~ | ~~4번~~ | ~~`fn_close` → fn_closeForm~~ — **To-Be 폐기 (Round 6 — PageLayout buttons 배열 entry 삭제 + handleClose dead code 제거. portal 탭 close 가 host 처리)** |

### 5.2 공통 leftMenu (div_main 의 div_leftMenu, EX-002 등록)

| 버튼ID | text | cssclass | 등록 위치 | 동작 |
|---|---|---|---|---|
| B-005 | 체크 (chk_check) | (외부) | div_leftMenu 의 fn_commonLeft_onload 1번 | 그리드 체크 컬럼 표시/숨김 |
| B-006 | 합계 (btn_sum) | (외부) | 2번 | 그리드 합계 표시 |
| B-007 | 복사/붙여넣기 (btn_copyPaste) | (외부) | 3번 | 그리드 복사 붙여넣기 |

### 5.3 공통 rightMenu (div_main 의 div_rightMenu, EX-003 등록)

| 버튼ID | text | cssclass | 등록 위치 | 동작 |
|---|---|---|---|---|
| B-008 | 행삽입 (btn_rowInsert 사용자정의) | (외부) | div_rightMenu 의 fn_commonRight_onload 사용자정의 1번 | `fn_rowInsert` → ds_menuList.insertRow(rowposition+1) + 5 컬럼 기본값 |
| B-009 | 행추가 (btn_rowAdd) | (외부) | 기본 1번 | `fn_rowAdd` → addRow + 6 컬럼 기본값 + ds_objMng clear |
| B-010 | 행삭제 (btn_rowDelete) | (외부) | 기본 2번 | `fn_rowDelete` → OBJECT_ID 확인 후 question 또는 즉시 삭제 |
| B-011 | 행복사 (btn_rowCopy) | (외부) | 기본 3번 | `fn_rowCopy` → rowposition 검증 + gfn_rowcopyData |
| B-012 | 행취소 (btn_rowCancel) | (외부) | 기본 4번 | `fn_rowCancel` → gfn_grdInit |

### 5.4 외부 버튼 / 접기

| 버튼ID | text | cssclass | width / 위치 | 동작 |
|---|---|---|---|---|
| B-013 | (없음 — 아이콘) | btn_WFSA_Fold | top=93 / height=10 / left=20 / right=20 | div_search 접기/펴기 |
| B-014 | (등록 ✗) div_search_btn_fold_onclick | - | (xfdl 등록 ✗) | As-Is 호출 안 됨 — 함수 정의만 잔존 (To-Be 제거) |

### 5.5 그리드 셀 인라인 버튼 (GB-NNN)

해당 없음 — 본 화면 그리드 셀에 ButtonField / displaytype="button" ✗.

---

## 6. 팝업 (P-NNN — 기능 §9 인용)

| P-ID | 종류 | 화면 (xfdl url) | 트리거 | 전달 | 반환 처리 |
|---|---|---|---|---|---|
| P-001 | dynamic LoV (공통 div) | `_com_div::commonDynamic.xfdl` | D-007 (div_object_id 검색창 클릭) | edt_OBJECT_ID 검색어 + 등록 시 12 파라미터 (form, "S", "commonList", "csa::CommMenuMng", "ds_menuObjLst", "OBJECT_ID, OBJECT_NM, FORM_URL", "OBJECTID, OBJECT명, FORM URL", "OBJECT 조회", "OBJECT_ID", "OBJECT_NM", "edt_OBJECT_ID", "fn_callBack", "1") | fn_callBack("commonList") 콜백 → ds_menuList.setColumn(rowposition, "OBJECT_ID", nErrorCode.OBJECT_ID) 자동 세트 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| P-002 | 메뉴 필드 관리 (xl size Modal, 4 컬럼 inline editable batch — To-Be 신규 Round 7 / iter#6) | (As-Is ✗ — To-Be 추가 Modal) | **A-MAIN-TREE 헤더 "필드 관리" 버튼** click (§3.3.2) | 선택 메뉴/폴더 컨텍스트 | 그리드 편집 → 저장 시 **신설 BPMN action `saveCmMenuFld`** (List<Map> batch rowStatus INSERT/UPDATE/DELETE 분기) → `recomputeMenuFullSeq()` 재계산 후 재조회 |

> P-001 은 본 화면의 div_detail 내부 동적 LoV 컴포넌트 (commonDynamic.xfdl include). 트랜잭션 action = `commonList` → `selectMenuObjPop` SQL 호출. To-Be 등가: **shared `<Modal>` + `<Input>` + `<Button>` + `<AgDataGrid>` 조합 LookupModal** (`commUserMng` 부서 검색 폼과 동일 형식 — Round 6, 2026-06-04 — 이전 inline div overlay 폐기, 표준 shared Modal 형식 통일).

#### 6.1 P-001 LoV 자동 매핑 정책 (Round 5 — 2026-06-04)

> **D-007 OBJECT_ID 입력은 `readOnly` 강제 (직접 입력 차단). LoV 모달을 통해서만 변경** — 사용자 결정 (Round 5).
>
> **LoV 모달에서 OBJECT 선택 시 단일 OBJECT_ID 가 아닌 OBJECT_ID + PARENT_MENU_ID (상위 폴더) 2 필드를 동시 자동 세트**.

| 필드 | 자동 세트 여부 | 설정 방식 |
|---|---|---|
| OBJECT_ID | ✓ 항상 | LoV row.OBJECT_ID → ds_menuList.setColumn(rowposition, "OBJECT_ID", ...) |
| PARENT_MENU_ID (D-008 상위 폴더) | ✓ 항상 | LoV row.PARENT_MENU_ID (BE `selectMenuObjPop` SQL 의 scalar subquery 컬럼) → ds_menuList.setColumn(rowposition, "PARENT_MENU_ID", ...) → D-008 표시 |

**BE 변경**: `selectMenuObjPop` SQL 에 PARENT_MENU_ID scalar subquery 추가 — 본 화면 모듈 `mappers-csa/CommMenuMng.xml` 정본.

```sql
SELECT o.OBJECT_ID, o.OBJECT_NM, o.FORM_URL,
       (SELECT TOP 1 m.PARENT_MENU_ID
          FROM TB_MCM_SEC_MENU_FLD m
         WHERE m.MENU_ID = (SELECT TOP 1 menu.MENU_ID FROM TB_MCM_SEC_MENU menu WHERE menu.OBJECT_ID = o.OBJECT_ID)
       ) AS PARENT_MENU_ID
  FROM TB_MCM_SEC_OBJ o
 WHERE ...
```

> 본 변경은 분석리포트 §6 SQL 카탈로그 + §11 변환점에 cross-cutting 정책 #1 인접 행으로 등재 (정합체크 §F).

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
#### 6.2 P-002 메뉴 필드 관리 팝업 (To-Be 신규 — Round 7 / iter#6, 2026-06-04~05)

> **(2026-06-04~05 / Round 7) As-Is 에 없던 "메뉴 필드 관리" xl size Modal 팝업을 To-Be 신규 추가**. 좌측 트리 헤더 우측 "필드 관리" 버튼 (§3.3.2) 클릭 시 표시. 메뉴 필드를 그리드 형태로 일괄 batch 관리하며, FULL SEQ 는 자동부여(read-only) 컬럼으로 표시(C2), MENU_SEQ 는 숫자만 입력하고 저장 시 8자리 '0' LPAD 처리한다(C4).
>
> **Round 7 신설 사항**:
> - **BPMN action 2개 신설**: `searchCmMenuFld` (ds_menuFldList 반환) / `saveCmMenuFld` (List<Map> batch rowStatus 분기 INSERT/UPDATE/DELETE)
> - **BE `SecMenuNativeRepository` 신규 메서드 4개**: `searchMenuFldList` / `insertMenuFld` / `updateMenuFld` (자식 가드 — 트리 정합 보장) / `deleteMenuFld`
> - **toolbar**: 좌측 행추가 / 행복사 / 행삭제 / 행취소 (4 버튼) + 우측 닫기 / 저장 (2 버튼) 일괄
> - **결함 해소**: 기존 단건 INSERT (NOT EXISTS 가드) 의 false-positive 문제 (mpn 모듈에서 중복 오탐 발생) → batch INSERT + PK 충돌 시 `IllegalStateException` 발생 + FE 메시지 표시로 해소

| 컬럼 | 표시 | 편집 | 비고 |
|---|---|---|---|
| MENU_ID | 메뉴 ID | 신규 행에서만 편집 / 기존 행 read-only | 키 컬럼 (C5 — PK MENU_ID 단독). 신규 시 중복이면 오류(무단 덮어쓰기 차단) |
| MENU_SEQ | 메뉴 순서 | 숫자만 입력 (FE replace 필터, maxLength=8) | 저장 시 '0' LPAD 8자리 ("12"→"00000012", BE `lpad8()`) — C4. insert/update 모두 적용 |
| MENU_NM | 메뉴명 | editable | - |
| PARENT_MENU_ID | 상위 폴더 | editable / LoV | 그룹 폴더 MENU_ID (C3 정합 — 트리 노드 / OBJECT LoV 선택값 보존, blank 시만 self fallback) |
| FULL SEQ | FULL SEQ | **read-only (editable:false)** | 자동부여 (C2). 저장·기동 시 `recomputeMenuFullSeq()` 가 §0.2 7자리 인코딩으로 재계산. 사용자 직접 입력 ✗ |

* 저장 흐름: 그리드 편집 → 저장 시 `CommMenuMngService.saveCmMenu` / `saveCmMenuFld` CRUD 직후 `recomputeMenuFullSeq()` 가 트리 전체 FULL_SEQ 를 멱등 재계산 → 재조회. MENU_SEQ 는 insert/update 모두 8자리 LPAD 적용(C4 — C5 PK 단독화 이후 SEC_MENU·FLD 공통, 이전 "신규만 LPAD" 제약 해소).
* PARENT_MENU_ID 는 자기참조(self)가 아니라 FE 가 보낸 그룹 폴더 PARENT_MENU_ID(트리 노드 / OBJECT LoV 선택값)를 보존한다(C3). As-Is 자기참조(`PARENT_MENU_ID = #{MENU_ID}`) 폐기로 화면이 그룹 폴더에서 분리되지 않으며 FULL_SEQ 그룹BASE 산출이 정상 동작한다.
* 오류 발생 시 오류 팝업(`.error-modal-overlay`)이 본 팝업 위에 표시된다 — §7.3 z-index 전역 수정(C7) 참조.

---

## 7. 메시지 표기 (기능 §10 인용)

### 7.1 표기 위치별

| 위치 | 메시지 종류 | 컴포넌트 |
|---|---|---|
| confirm 다이얼로그 | M-001 ("저장하시겠습니까?") | `gfn_message("","",text,"confirm","확인","fn_MsgSaveCallBack")` (xfdl 표준 — To-Be `ConfirmModal` 등가) |
| question 다이얼로그 | M-003 ("OBJECT ID가 연결...") | `gfn_message("","",text,"question","선택","fn_MsgDeleteCallBack")` (To-Be `QuestionModal` 등가) |
| information 알림 | M-002 ("저장할 데이터가 없습니다.") / M-009 ("저장되었습니다.") / M-010 ("저장 실패 하였습니다.") | `gfn_message(...,"information"/"info",...)` (To-Be `InfoModal` 등가) |
| warning 알림 | M-004 ("선택 행이 없습니다.") / M-005 ("0 또는 공백은 메뉴 순서가 될수 없습니다.") / M-006 ("메뉴가 존재하지 않습니다.") | `gfn_message(...,"warning",...)` (To-Be `WarningModal` 등가) |
| 하단 status bar | M-007 ("{N}건 조회 되었습니다.") / M-008 ("{cnt}건 조회 되었습니다." — saveCmMenu 콜백, As-Is 문구 보존) / M-011 (서버 에러) | `div_bottom.form.fn_commonBottomStatus_msg(text)` (div_bottom common — To-Be `StatusBar` 등가) |

### 7.2 색상 / 강조

| 컴포넌트 | cssclass | 색상 의미 |
|---|---|---|
| 메뉴 리스트 그리드 selected row | (xfdl `gfn_gridSelectedRow` "red", "blue") | 빨강 background / 파랑 텍스트 — 선택 행 강조 |
| 메뉴 트리 그리드 selected row | (동일) | 동일 |
| D-001 / D-002 / D-004 / D-006 / D-007 필수 입력 | Essential | 빨강 테두리 또는 별표 — 필수 입력 표시 |
| 라벨 cssclass=edi_WF_Label / LabelE / LabelFirstE | (외부 framework 표준) | 라벨 색상 / 폰트 |
| 타이틀 cssclass=edi_WFHD_Title / edi_WF_Title1 | (외부 framework 표준) | 화면 타이틀 / 섹션 타이틀 강조 |
| 조회조건 라벨 cssclass=edi_WFSA_Label / stc_WFSA_Label | (외부 framework 표준) | 검색 영역 라벨 |
| 조회조건 배경 cssclass=div_WFSA_Box | (외부 framework 표준) | 검색 영역 박스 |

### 7.3 오류 팝업 z-index 전역 수정 (To-Be — iter#6, 2026-06-05)

> **(2026-06-05 / iter#6) 오류 팝업이 모든 Modal 위에 표시되도록 z-index 전역 수정** (C7). shared `layout/page-layout.css` 의 `.error-modal-overlay` z-index 를 **50 → 10001** 로 상향. 일반 `Modal` (9999) / `MessageModal` (10000) 위에 오류 팝업이 표시된다.

| 레이어 | z-index | 비고 |
|---|---:|---|
| 일반 Modal | 9999 | 메뉴 필드 관리 팝업(P-002) 등 일반 팝업 |
| MessageModal | 10000 | 메시지 모달 |
| `.error-modal-overlay` (오류 팝업) | **10001** (To-Be — As-Is 50) | 모든 Modal 위에 표시 |

* As-Is 결함: z-index=50 이라 오류 팝업이 팝업(P-002 등) 뒤로 깔려, 팝업을 닫아야만 오류를 확인할 수 있었다.
* To-Be: shared `layout/page-layout.css` `.error-modal-overlay` z-index 50 → 10001 전역 수정 → 메뉴 필드 관리 등 모든 팝업 위에 오류 팝업이 즉시 표시된다.

---

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
## J. 사용자 검수 이력 / 라운드 카탈로그

> 본 절은 본 화면 디자인설계서의 라운드별 변경 이력을 한눈에 보기 위한 cross-ref 카탈로그이다. 본문 상세 절차는 §0.1~§0.7, §3.3~§3.3.2, §3.5, §5.1, §6, §7.3 참조. iter#1~#5 / iter#6 (C1~C7) 항목별 상세는 정합체크서 §J 정본.

| Round | 일자 | 변경 | 영향 §/D-NNN/G-NNN/B-NNN |
|---|---|---|---|
| Round 1~5 (W5 / FULL_SEQ 인코딩 / 그룹 ID 토큰 / SEC_MENU·FLD 분리 / WITH RECURSIVE / OBJECT_ID LoV 자동 매핑 / PK readOnly inserted-only) | 2026-06-02 ~ 2026-06-04 | W5 7 패턴 + Tree 컴포넌트 + FULL_SEQ 인코딩 + 그룹 ID 토큰 + SEC_MENU vs SEC_MENU_FLD 분리 + WITH RECURSIVE 후손 조회 + OBJECT_ID LoV → OBJECT_ID + PARENT_MENU_ID 동시 자동 매핑 + D-002 MENU_ID readOnly inserted-only | §0.1 ~ §0.5 / §3.3.1 / §3.5 (D-002 / D-007 / D-008) / §6 (P-001) / §6.1 |
| **Round 6** | **2026-06-04** | (1) commonTopButton 4 → 3 (btn_close 제거) / (2) OBJECT 검색 LookupModal 형식 통일 (shared Modal + Input + Button + AgDataGrid) / (3) 메뉴 트리 정렬 3차 pass 추가 (MENU_SEQ numeric asc + FULL_SEQ tiebreak — `CommMenuMngTreeRow.FULL_SEQ?: string` 추가) | §1.2 / §3.3.1 / §5.1 (B-004 폐기) / §6 (P-001 LookupModal) |
| **Round 7** | **2026-06-04~05** | 메뉴 구조 위 "필드 관리" 버튼 + xl size Modal 신설 (4 컬럼 inline editable batch — MENU_ID / MENU_SEQ / MENU_NM / PARENT_MENU_ID + FULL_SEQ read-only) + 행추가/행복사/행삭제/행취소 + 닫기/저장 일괄. BPMN action 2개 신설 (`searchCmMenuFld` / `saveCmMenuFld` batch) + BE Repository 메서드 4개 신규. 기존 단건 INSERT (NOT EXISTS 가드) false-positive 결함 → batch + PK 충돌 IllegalStateException 으로 해소 | §3.3.2 / §6.2 (P-002) |
| **Phase 1+2** | **2026-06-05** | BE `myMenusTree` 응답에 derived `componentPath = ${PARENT_MENU_ID}/${OBJECT_ID}` 추가 → FE `Sidebar` 가 그대로 소비. portal 라우팅 정적 `module-pages.ts` 의존 우회 | §0.6 |
| **Phase 3+4** | **2026-06-05** | codegen `scripts/generate-page-registry.mjs` 신설 + auto-generated `lib/generated/page-registry.ts` 도입 + 기존 `module-pages.ts` 파일 **완전 제거** | §0.7 |

---

## §6.14 Phase 3 종료 4질문 자체 검증

1. **14항 위반?** ✗ 위반 없음. 미존재 컴포넌트 0 (모든 행이 분석리포트 §3 + 기능설계서 §3 §4 §5 인용). 좌표 As-Is 1:1 보존 (xfdl 좌표 그대로 인용).
2. **검증 안 한 부분?** §3.5 의 18 입력 컴포넌트 + 17 라벨 좌표 1byte 일치 검증 (xfdl:106~177). 모든 라벨 / 입력 컨트롤의 left / top / width / height / cssclass 명시.
3. **그대로 수용?** As-Is 1:1 보존 — 모든 cssclass (edi_WFHD_Title / edi_WF_Title1 / edi_WFSA_Label / div_WFSA_Box / btn_WFSA_Fold / Essential / edi_WF_Label* / stc_WFSA_Label) 그대로 인용.
4. **임의 합리화?** ✗. 본 디자인설계서는 분석 §3 의 영역 / Static / Edit / Combo / Button / Grid / Div / TextArea / Radio / Calendar / Dataset 전수를 1:1 인용. 표 헤더 / 행 수 모두 분석리포트와 동일.

→ ✓ Phase 3 검증 통과 → Phase 4 진입.
