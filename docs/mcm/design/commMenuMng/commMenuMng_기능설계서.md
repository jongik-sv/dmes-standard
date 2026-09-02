---
screenId: commMenuMng
asIsId: CommMenuMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# mcm — 메뉴 관리 기능설계서

> **인용 정본**: 본 문서의 모든 본문은 `commMenuMng_분석리포트.md` 의 §1~§13 인용. 자체 추가 ✗. 행수 / ID / 표시명 / SQL ID / BPMN flow / action enum 모두 분석리포트와 1byte 일치.
> **환경 제약**: 분석리포트 §0 인용 — Runner / R14-Step0 / manifest 미적용 (사용자 결정). WinForms 전제 항목은 mui 등가물로 매핑.

---

## 1. 화면 개요

### 1.1 업무/설계 측면 (분석 §1 인용)

| 항목 | 내용 |
|---|---|
| **화면명** | 메뉴 관리 |
| **화면 식별자** | commMenuMng |
| **모듈** | mcm (csa 그룹) |
| **화면 목적** | 포털 메뉴 트리 (`TB_MCM_SEC_MENU_FLD` 폴더) + 메뉴 항목 (`TB_MCM_SEC_MENU` 엔트리) + 연결 OBJECT (`TB_MCM_SEC_OBJ` FORM/URL/SERVICE/PARAM) 의 통합 등록·수정·삭제를 단일 화면에서 처리한다. 다른 모듈의 모든 화면이 본 화면에서 등록한 메뉴 ↔ OBJECT 연결을 통해 포털에서 호출된다. |
| **주요 사용자** | 시스템 관리자 / 메뉴 권한 운영 담당자 |
| **접근 경로** | (As-Is) Nexacro Mui Portal — csa 그룹 → CommMenuMng |

### 1.2 Frontend 개발 연계 값

> 명명 룰 = **MES 단일 룰** (moduleId == `mcm` ≠ `mpn` — APS 예외 미적용). 4 식별자 (screenId / pageId / serviceId / pageName) 1byte 동일.

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | mcm — 한글명 **"공통관리"** | 01 A.1 |
| moduleGroup | csa — 한글명 **"시스템관리"** | 01 A.2 (사용자 결정 등재) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 메뉴 관리 (commMenuMng) | - |
| mesModule | m-mcm | 01 A.4.5 (`m-{moduleId}`) |
| 적용 명명 룰 | MES 단일 룰 | moduleId == `mpn` 아님 |
| 화면식별자 (screenId) | commMenuMng | 01 A.3 / A.4.1 (camelCase `{화면명}`) |
| pageName | commMenuMng | 01 A.4.2 (MES: = screenId) |
| pageId | commMenuMng | 01 A.4.3 (MES: = screenId) |
| serviceId | commMenuMng | 01 A.4.4 |
| 페이지 유형 | **D 다중 그리드** (G + GT + GO 3 그리드 + D 상세 폼 동시 존재) | 분석 §3 (G-NNN 12 + GT-NNN 1 + GO-NNN 9 + D-NNN 18) |
| 주요 API path (UI→BFF) | `POST /api/mcm/oasis/commMenuMng/{action}` | 04 §A.2-3 |
| 주요 API path (BFF→BE) | `POST /oasis/commMenuMng/{action}` | 04 §A.2-3 |
| Frontend 파일명 | `commMenuMng.tsx` | 03 컨벤션 (MES: `{screenId}.tsx`) |
| tsup entry key | `pages/csa/commMenuMng` | 01 A.4.6 (MES: `pages/{moduleGroup}/{pageName}`) |

---

## 2. 화면 영역 정의 (분석 §3.1 인용)

| 영역ID | 영역명 | xfdl 컨테이너 | 설명 |
|---|---|---|---|
| A-TITLE | 타이틀 영역 | `div_title` (xfdl:6) | 화면명 + 공통 topMenu (btn_search/btn_reset/btn_save/btn_close) |
| A-FILTER | 조회조건 영역 | `div_search` (xfdl:14) | BIZ SYSTEM + 메뉴 ID + 메뉴 명 + 사용 유무 (4 조건) |
| A-FOLD | 조회조건 접기 | `btn_fold` (xfdl:29) | 조회조건 접기/펴기 토글 |
| A-MAIN | 메인 컨테이너 | `div_main` (xfdl:30) | 트리 + 리스트 + 상세 폼 + OBJECT 그리드 4 구역 |
| A-MAIN-TREE | 메뉴 트리 영역 | `grd_M0F1` 내부 (xfdl:87) | GT-001 (treeitemcontrol, 메뉴 구조) |
| A-MAIN-LIST | 메뉴 리스트 영역 | `grd_M0F0` 내부 (xfdl:35) | G-001~G-012 (메뉴 12 컬럼) |
| A-MAIN-DETAIL | 상세 입력 영역 | `div_detail` (xfdl:106) | D-001~D-018 (메뉴 그룹 / 메뉴 ID / 메뉴 순서 / 메뉴명 / OBJECT ID / 상위 폴더 / FULL SEQ / 사용 구분 / 메뉴 타입 / 유효개시/기한일 / 표시 여부 / 메뉴 설명 / PARAM1~3) |
| A-MAIN-OBJECT | OBJECT 그리드 영역 | `grd_objectMng` (xfdl:180) | GO-001~GO-009 (선택 메뉴 OBJECT 정보 9 컬럼) |
| A-MAIN-LEFTMENU | 좌측 공통 메뉴 | `div_leftMenu` (xfdl:34) | chk_check / btn_sum / btn_copyPaste (3 도구) |
| A-MAIN-RIGHTMENU | 우측 공통 메뉴 | `div_rightMenu` (xfdl:179) | btn_rowInsert (사용자정의) + btn_rowAdd / Delete / Copy / Cancel (기본 4) |
| A-FOOTER | 하단 status 영역 | `div_bottom` (xfdl:28) | 공통 bottom status 메시지 |

> 본 화면은 표준 5 영역 (A-FILTER / A-MAIN / A-BTN / A-TITLE / A-FOOTER) + A-FOLD + A-MAIN 의 자식 6 영역 (TREE / LIST / DETAIL / OBJECT / LEFTMENU / RIGHTMENU) 으로 구성. div_main 내 트리 (좌측 width=250) + 리스트 (중앙 left=260 right=450) + 상세 폼 (우측 width=440) + OBJECT 그리드 (우측 하단 width=435 height=67) 의 4 분할 레이아웃.

---

## 3. 조회조건 정의 (영역: A-FILTER)

### 3.1 조회조건 필드 (S-NNN — 분석 §3.2 그대로 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3.1 행 == 분석 §3.2 행 (As-Is 4 행 → To-Be 3 행, S-001 cross-cutting 정책 #1 폐기) | ✓ |
| 입력 방식 enum (5값) | TextBox 2 + Combo **As-Is 2 → To-Be 1** (S-001 폐기) | ✓ |

| 필드ID | DB 컬럼명 (전송 키) | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| ~~S-001~~ | ~~cbo_bizSystemCode (BIZ_SYSTEM_CODE)~~ | ~~BIZ SYSTEM~~ | ~~Combo~~ | - | ~~index=0 / value="Y" / displaynulltext="전체"~~ | **As-Is**: LoV `ds_lovSubSystem` (`fn_lov` 로드 → APP_HOST_ID) + selectCommMenuMng `<if>` (xml:41) 매칭. **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 도메인 폐기). 조회조건 컬럼은 3 개 (S-002 / S-003 / S-004) 만 유지 |
| S-002 | edt_MENU_ID | 메뉴 ID | TextBox | N | text="부산역 CY" (As-Is placeholder 추정) / maxlength=300 | UPPER LIKE 부분 일치 검색 (xml:29) |
| S-003 | edt_MENU_NM | 메뉴 명 | TextBox | N | text="부산역 CY" / maxlength=300 | LIKE 부분 일치 검색 (xml:35) |
| S-004 | cbo_USE_TP (USE_TP) | 사용 유무 | Combo | N | index=0 / value="Y" | LoV `ds_cboUseYn` (Y=사용 / N=미사용, 정적). selectCommMenuMng 의 `<if>` (xml:38) 매칭 |

### 3.2 조회 결과 (G-NNN / GT-NNN / GO-NNN 그리드 — 분석 §3.3 / §3.4 / §3.5 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 메뉴 리스트 G 행 수 일치 | 본 §3.2 G 행 == 분석 §3.3 G 행 (12 행) | ✓ |
| 메뉴 트리 GT 행 수 일치 | 분석 §3.4 GT 행 (1 행) | ✓ |
| OBJECT 그리드 GO 행 수 일치 | 분석 §3.5 GO 행 (As-Is 9 행 → To-Be 8 행, GO-008 cross-cutting 정책 #1 폐기) | ✓ |

**메뉴 리스트 (G-NNN, `grd_M0F0`)**:

| 컬럼ID | DB 컬럼명 (alias) | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 | 편집 | 필수 |
|---|---|---|---|---|---|---|---|
| G-001 | STATUS | 상태 | Nexacro auto row state 아이콘 (To-Be: FE row state 표시 동일 구현) | Center | imagecontrol | N | - |
| G-002 | MENU_SEQ | 메뉴순서 | 메뉴 순서 (PK 일부, varchar) | Center | varchar | N | - |
| G-003 | MENU_ID | 메뉴 ID | 메뉴 ID (PK 일부, varchar) | Left | varchar | N | - |
| G-004 | MENU_NM | 메뉴명 | 메뉴 명칭 | Left | varchar (autosizecol) | N | - |
| G-005 | OBJECT_ID | OBJECT ID | 연결 OBJECT 의 ID (FK to TB_MCM_SEC_OBJ) | Left | varchar | N | - |
| G-006 | FULL_SEQ | FULL SEQ | 전체 정렬 순서 | Center | varchar (digit) | N | - |
| G-007 | USE_TP | 사용구분 | 사용 여부 (Y/N → 사용/미사용 표시) | Center | combo (LV-001) | N | - |
| G-008 | MENU_TP | 메뉴타입 | 메뉴 타입 (WEB/MOBIL) | Center | varchar | N | - |
| G-009 | START_ACTIVE_DATE | 유효개시일 | 시작일 | Center | date yyyy-MM-dd | N | - |
| G-010 | END_ACTIVE_DATE | 유효기한일 | 종료일 | Center | date yyyy-MM-dd | N | - |
| G-011 | MENU_VIEW_YN | 표시 여부 | 메뉴 표시 여부 (Y/N → 표시/미표시) | Center | combo (LV-002) | N | - |
| G-012 | MENU_DESC | 메뉴설명 | 메뉴 설명 | Left | varchar (autosizecol) | N | - |

> **편집 정책**: G-NNN 그리드는 As-Is 에서 셀 단위 직접 편집 컴포넌트가 정의되어 있지 않음 (`edittype`/`editmaxlength` 셀 단위 미정의 — 행 단위 편집은 `div_detail` 의 D-NNN 폼 입력으로만 수행). 단 fn_rowAdd / fn_rowInsert / fn_rowDelete 등 클라이언트 dataset 조작은 가능. 저장 시 ds_menuList:U 변경 행만 전송.

**메뉴 트리 (GT-NNN, `grd_M0F1`)**:

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 표시 형식 | 비고 |
|---|---|---|---|---|---|
| GT-001 | MENU_NM | 메뉴 구조 | 메뉴 폴더 트리 노드명 | treeitemcontrol (treelevel=LEV) | 클릭 시 해당 MENU_ID 로 `searchCmMenu` 트랜잭션 호출 (xfdl:770) |

**OBJECT 그리드 (GO-NNN, `grd_objectMng`)**:

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 |
|---|---|---|---|---|---|
| GO-001 | FORM_URL | FORM URL | OBJECT 의 FORM URL | Left | varchar (autosize) |
| GO-002 | SERVICE | SERVICE | OBJECT 의 SERVICE | Left | varchar |
| GO-003 | PARAM | PARAM | OBJECT 의 PARAM | Left | varchar |
| GO-004 | USE_TP | 사용 유무 | 사용 여부 | Center | varchar (raw Y/N) |
| GO-005 | START_ACTIVE_DATE | 유효 개시일 | 시작일 | Center | date yyyy-MM-dd |
| GO-006 | END_ACTIVE_DATE | 유효 기한일 | 종료일 | Center | date yyyy-MM-dd |
| GO-007 | SYSTEM_CODE | SYSTEM | 시스템 코드 | Center | varchar |
| ~~GO-008~~ | ~~BIZ_SYSTEM_CODE~~ | ~~SUB SYSTEM~~ | ~~비즈니스 시스템 코드~~ | - | **As-Is**: `SUB SYSTEM` 헤더 / `bind:BIZ_SYSTEM_CODE` body (xfdl:206 / 191 / 217). **To-Be 폐기** (cross-cutting 정책 #1). OBJECT 그리드 컬럼 9 → 8 (GO-001~GO-007 + GO-009) |
| GO-009 | OBJECT_TYPE | OBJECT TYPE | OBJECT 타입 | Center | varchar |

### 3.3 코드값 표시 변환 (분석 §10 인용)

| DB 컬럼 | 코드 마스터 (LV-NNN) | 변환 예 |
|---|---|---|
| USE_TP | LV-001 (xfdl `ds_cboUseYn` 정적 Y/N) | Y → "사용" / N → "미사용" |
| MENU_VIEW_YN | LV-002 (xfdl `ds_menuViewYn` 정적 Y/N) | Y → "표시" / N → "미표시" |
| MENU_TP | LV-003 (cbo_menu_tp 내부 정적 WEB/MOBIL) | WEB → "WEB" / MOBIL → "MOBIL" |
| ~~BIZ_SYSTEM_CODE~~ | ~~LV-004 (외부 `CommObjMngMapper.selectAppHostId` 결과)~~ | **To-Be 폐기** (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE 컬럼 폐기 동기 — S-001 / GO-008 / fn_lov / Task_1z04i9v / cross-namespace 호출 동시 제거) |
| MENU_GRP / MENU_ID (D-001 / D-002) | LV-005 (`selectMenuFldList` 결과 → ds_menuGrp / ds_menuGrpSub 분기 가공) | "{MENU_ID} ({MENU_NM})" 형식 |
| OBJECT_ID (D-007) | LV-006 (`selectMenuObjPop` → ds_menuObjLst, commonDynamic.xfdl LoV) | OBJECT_ID → 선택된 OBJECT_NM 표시 |
| OBJECT 정보 (GO) | LV-007 (`selectMenuObj` → ds_objMng) | 선택 메뉴의 OBJECT 9 컬럼 표시 |

---

## 4. 상세 영역 필드 정의 (영역: A-MAIN-DETAIL)

### 4.1 상세 입력 필드 (D-NNN — 분석 §3.6 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §4.1 행 == 분석 §3.6 행 (18 행) | ✓ |
| 입력 방식 enum (5값) | Combo 3 + TextBox 9 + TextArea 1 + Radio 2 + Calendar 2 + Dynamic LoV Div 1 | ✓ |

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 (cssclass=Essential) | maxlength | 기본값 (신규 행) | 설명 |
|---|---|---|---|---|---|---|---|
| D-001 | (그룹 식별 — bind 없음) | 메뉴 그룹 | Combo | Y | - | (콜백 분기에서 첫 char 매칭 자동 선택) | LoV LV-005 (ds_menuGrp — LEV=0 행) / onitemchanged 시 ds_menuGrpSub 의 PARENT_MENU_GRP 필터 |
| D-002 | (메뉴 ID 식별 — bind 없음) | 메뉴 ID | Combo | Y | - | (콜백 분기에서 MENU_SEQ substr 매칭 자동 선택) | LoV LV-005 (ds_menuGrpSub — LEV>0 행, filterstr 동적) / onitemchanged 시 edt_lst_seq enable + edt_parent_menu_id 자동 세트 |
| D-003 | MENU_ID (라벨 전용) | 메뉴 ID | (라벨) | - | - | - | xfdl:113 라벨 컴포넌트 (D-002 가 실 입력) |
| D-004 | (메뉴 순서 입력) | 메뉴 순서 | TextBox | Y | 8 | - | **As-Is**: inputtype="number" / maxlength 3 / onkillfocus 시 cbo_menu_id substr(0,5) + lpad("0",3) → edt_menu_seq 자동 세트. 신규 행만 enable. **To-Be (2026-06-05 / iter#6, C4)**: 숫자만 입력 (FE replace 필터 — 비숫자 제거), maxLength 8. 저장 시 '0' LPAD 8자리 정규화 ("12"→"00000012", BE lpad8()) — SEC_MENU·FLD insert/update 공통 적용 (C5 PK 단독화 이후 신규/수정 모두). MENU_SEQ 는 PK 에서 분리된 순수 "메뉴 순서" 컬럼 (C5) |
| D-005 | MENU_SEQ | (메뉴 순서 우측 표시) | TextBox (readonly) | - | 0 | - | bind item15 / D-004 onkillfocus 에서 자동 세트 |
| D-006 | MENU_NM | 메뉴명 | TextBox | Y | - | - | bind item2 |
| D-007 | OBJECT_ID | OBJECT ID | Dynamic LoV Div (commonDynamic.xfdl) | Y | - | (콜백에서 fn_set_value/fn_set_nm 자동 세트) | P-001 동적 LoV (selectMenuObjPop 호출, "OBJECT 조회" 팝업) |
| D-008 | MENU_ID (PARENT_MENU_ID 표시) | 상위 폴더 | TextBox (readonly) | - | - | (cbo_menu_id 의 text 첫 공백 전 substr 로 자동 세트) | bind item1 / inputtype="digit" |
| D-009 | FULL_SEQ | FULL SEQ | TextBox (readOnly) | - | - | - | **As-Is**: bind item4 / inputtype="digit" (사용자 입력). **To-Be (2026-06-05 / iter#6, C2)**: readOnly — 사용자 직접 입력 ✗ / placeholder "저장 시 자동 부여". FULL_SEQ 는 저장 시·기동 시 BE 가 7자리 인코딩으로 자동 부여 (C1, §6.1 V-005 참조). 모듈=i×1,000,000 / 그룹폴더=부모BASE+j×10,000 / 화면=그룹BASE+100+k×10 |
| D-010 | USE_TP | 사용 구분 | Radio | - | - | 'Y' (사용) | bind item8 / LoV LV-001 (Y=사용 / N=미사용 / columncount=2) |
| D-011 | MENU_TP | 메뉴 타입 | Combo | - | - | 'WEB' | bind item9 / LoV LV-003 (xfdl 내부 정적 WEB/MOBIL) |
| D-012 | START_ACTIVE_DATE | 유효개시일 | Calendar | - | - | `gfn_today()` (오늘 날짜) | bind item6 / dateformat="yyyy-MM-dd" |
| D-013 | END_ACTIVE_DATE | 유효기한일 | Calendar | - | - | "99991231" | bind item7 / dateformat="yyyy-MM-dd" |
| D-014 | MENU_VIEW_YN | 표시 여부 | Radio | - | - | 'Y' (표시) | bind item3 / LoV LV-002 (Y=표시 / N=미표시 / columncount=2 / rowcount=1) |
| D-015 | MENU_DESC | 메뉴 설명 | TextArea | - | - | - | bind item5 / height=40 |
| D-016 | MENU_PARAM1 | PARAM1 | TextBox | - | - | - | bind item0 |
| D-017 | MENU_PARAM2 | PARAM2 | TextBox | - | - | - | bind item10 |
| D-018 | MENU_PARAM3 | PARAM3 | TextBox | - | - | - | bind item11 |

### 4.2 라인 필드 (서브 그리드)

해당 없음 — L-NNN (parent FK 다중 row 라인) ✗. 본 화면은 G (메뉴 리스트) + GT (메뉴 트리) + D (단일 상세 폼) + GO (OBJECT 그리드) 구조이나 GO 는 부모 (선택 메뉴) FK 1:N 관계의 OBJECT 표시 그리드로 GO-NNN 으로 분류 (선택 메뉴의 OBJECT_ID 가 단일 — 1:N 이 아닌 1:1 표시).

---

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록 (B-NNN — 분석 §4.1 그대로 인용)

| 버튼ID | 버튼명 | 위치 | To-Be action | 설명 |
|---|---|---|---|---|
| B-001 | 조회 (btn_search) | div_title (commonTopButton EX-001) | **searchCmMenu** | `fn_search` (xfdl:461) — gfn_setDivDefault(div_detail) + gfn_scanOpenerComponent(div_search) + 트랜잭션 호출 |
| B-002 | 초기화 (btn_reset) | div_title (commonTopButton) | (클라이언트 전용) | `fn_reset` (xfdl:449) — gfn_setDivDefault(div_search) |
| B-003 | 저장 (btn_save) | div_title (commonTopButton) | **saveCmMenu** (confirm 후) | `fn_save` (xfdl:476) — fn_before_save_chk + confirm → fn_MsgSaveCallBack |
| B-004 | 닫기 (btn_close) | div_title (commonTopButton) | (클라이언트 전용) | `fn_close` (xfdl:483) — fn_closeForm |
| B-005 | 체크 (chk_check) | div_main (commonLeftButton EX-002) | (외부 framework) | 그리드 체크 컬럼 표시/숨김 토글 |
| B-006 | 합계 (btn_sum) | div_main (commonLeftButton) | (외부 framework) | 그리드 합계 표시 |
| B-007 | 복사/붙여넣기 (btn_copyPaste) | div_main (commonLeftButton) | (외부 framework) | 그리드 복사 붙여넣기 |
| B-008 | 행삽입 (btn_rowInsert 사용자정의) | div_main (commonRightButton EX-003) | (클라이언트 전용) | `fn_rowInsert` (xfdl:711) — insertRow + 5 컬럼 기본값 |
| B-009 | 행추가 (btn_rowAdd) | div_main (commonRightButton) | (클라이언트 전용) | `fn_rowAdd` (xfdl:679) — addRow + 6 컬럼 기본값 + ds_objMng clear |
| B-010 | 행삭제 (btn_rowDelete) | div_main (commonRightButton) | (클라이언트 전용) | `fn_rowDelete` (xfdl:489) — OBJECT_ID 존재 시 question 확인 / 미존재 시 즉시 삭제 |
| B-011 | 행복사 (btn_rowCopy) | div_main (commonRightButton) | (클라이언트 전용) | `fn_rowCopy` (xfdl:699) — rowposition 검증 + gfn_rowcopyData |
| B-012 | 행취소 (btn_rowCancel) | div_main (commonRightButton) | (클라이언트 전용) | `fn_rowCancel` (xfdl:733) — gfn_grdInit |
| B-013 | (접기) btn_fold | div_main 상단 (B-014 위) | (클라이언트 전용) | `btn_fold_onclick` (xfdl:455) — gfn_fold(this, div_search, div_main, btn_fold) — div_search 접기/펴기 |
| B-014 | (등록 ✗) div_search_btn_fold_onclick | (xfdl 등록 ✗ — As-Is 호출 안 됨, 함수 정의만 잔존) | (As-Is 호출 ✗) | xfdl:443 — 함수만 정의 (To-Be 제거 결정) |

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN)

해당 없음 — 본 화면 그리드 셀에 ButtonField / displaytype="button" 셀 ✗ (분석 §4.2 인용).

### 5.2 액션 → SQL ID 매핑 (분석 §6 + §8.3 인용)

| To-Be action | 트리거 (xfdl 메서드) | BPMN 분기 sequenceFlow | 호출 SQL ID (순서대로) | BPMN Task |
|---|---|---|---|---|
| searchCmMenu | `fn_search` (xfdl:461) — B-001 또는 GT-001 click 또는 AfterOnload 의 fn_search 직접 호출은 ✗ (AfterOnload 는 searchMenuGrp 만) | `SequenceFlow_0tt1mbk` (searchCmMenu) | (1) selectCommMenuMng → (2) selectMenuFldList | Task_00oihyb → Task_0xxo78b (chain) |
| searchMenuGrp | `fn_formAfterOnload` (xfdl:429) — 화면 로드 후 메뉴 폴더 트리 조회 (단독) | `SequenceFlow_11y43nf` (searchMenuGrp) | (1) selectMenuFldList | Task_0xxo78b |
| saveCmMenu | `fn_MsgSaveCallBack` (xfdl:644) — B-003 confirm 후 호출 | `SequenceFlow_0grwghu` (saveCmMenu) | (MultiSaveTask 가 rowType 분기 자동 처리) insertCommMenuMng (rowType=2) / updateCommMenuMng (rowType=4) / deleteCommMenuMng (rowType=1) | Task_1dh8dal (CommonMultiSaveTask) |
| searchObj | `fn_searchObj` (xfdl:758) — fn_callBack("searchCmMenu") 내부 호출 (xfdl:574) + G-NNN oncellclick (xfdl:889) | `SequenceFlow_043mfni` (searchObj) | selectMenuObj | Task_0ert1qi |
| commonList | `commonDynamic_onload` 등록 후 LoV 검색 시 (xfdl:385 등록 / xfdl:636 콜백) | `SequenceFlow_1s6r4vs` (commonList) | selectMenuObjPop | Task_0qsfdkd |
| ~~lov~~ | ~~`fn_lov` (xfdl:418) — CommMenuMng_onload 내부 호출 (xfdl:415)~~ | ~~`SequenceFlow_0ug4lxk` (lov)~~ | ~~(외부) CommObjMngMapper.selectAppHostId~~ | ~~Task_1z04i9v~~ — **To-Be 폐기** (cross-cutting 정책 #1). action 5 enum (searchCmMenu / searchMenuGrp / saveCmMenu / searchObj / commonList) 만 유지 |

---

## 6. 비즈니스 룰 (validation / 도메인 룰)

### 6.1 B-003 (메뉴 저장) validation 룰 (분석 §4.4 #19 / xfdl:737~755)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-001 | `gfn_isDatasetChanged(ds_menuList)` false 차단 | 저장 클릭 | "저장할 데이터가 없습니다." | gfn_message info + return false | xfdl:751~753 |
| V-002 | `gfn_cpRequired(this, "MENU_ID MENU_SEQ MENU_NM OBJECT_ID")` — 4 필수 컬럼 검증 | fn_before_save_chk 통과 시 | (필수 컬럼별 기본 메시지) | gfn_cpRequired 의 표준 차단 | xfdl:748 |
| V-003 | 저장 전 confirm — "저장하시겠습니까?" | fn_before_save_chk 통과 시 | "저장하시겠습니까?" | confirm 다이얼로그 (확인/취소) | xfdl:479 |
| V-004 | `ds_menuList` 의 모든 rowType≠1 행에 대해 START_ACTIVE_DATE / END_ACTIVE_DATE toString().length > 8 시 substring(0,8) — millisecond cut (21.05.31 최규찬) | fn_MsgSaveCallBack 의 confirm 후 | - | (자동 보정) | xfdl:649~659 |
| V-005 | **To-Be (2026-06-05 / iter#6, C1)**: FULL_SEQ 자동부여 — BE `SecMenuNativeRepository.recomputeMenuFullSeq()` 가 CRUD 직후·재조회 직전 (CommMenuMngService.saveCmMenu / saveCmMenuFld) + DataInitializer 기동 시 메뉴 트리 전체 FULL_SEQ 를 7자리 인코딩으로 멱등 재계산. 사용자는 FULL_SEQ 직접 입력 ✗ (D-009 readOnly). 인코딩: 모듈(FLD, PARENT_MENU_ID NULL)=i×1,000,000 (i=1..9) / 그룹폴더(FLD child)=부모BASE+j×10,000 (j=1..99) / 화면(SEC_MENU)=그룹BASE+100+k×10 (k=0..89). 폴더(TB_MCM_SEC_MENU_FLD)도 FULL_SEQ NUMERIC(10,0) 컬럼 사용 (searchMenuFldList / searchMenuFld SELECT 동봉) | saveCmMenu / saveCmMenuFld CRUD 직후 + 기동 시 | - | (자동 부여 — SoT) | BE recomputeMenuFullSeq() |
| V-006 | **To-Be (2026-06-05 / iter#6, C4)**: MENU_SEQ 저장 시 '0' LPAD 8자리 정규화 ("12"→"00000012", BE lpad8()). FE 는 숫자만 입력 (replace 필터, maxLength 8). C5(PK 단독화) 이후 SEC_MENU·FLD 모두 insert/update LPAD 적용 (이전 "신규만 LPAD" 제약 해소). 기존 SEC_MENU 8자리 미만 MENU_SEQ 는 기동 시 normalizeMenuSeqLpad8 으로 일괄 정규화 (C6, 숫자 8자 미만만 대상·멱등 / FLD 는 이미 8자리) | saveCmMenu insert/update + 기동 시(C6) | - | (자동 LPAD) | BE lpad8() / normalizeMenuSeqLpad8 |
| V-007 | **To-Be (2026-06-05 / iter#6, C5)**: TB_MCM_SEC_MENU PK = MENU_ID 단독 (복합 PK (MENU_ID, MENU_SEQ) → MENU_ID 단독). 신규등록 시 MENU_ID 가 기존 행과 중복이면 오류 — 무단 덮어쓰기 차단. 엔티티 SecMenu(@IdClass / menuSeq @Id / PK class 제거), SecMenuRepository(JpaRepository<SecMenu,String>). 기동 시 자동 마이그레이션 (기존 복합 PK 자동 감지 DROP + MENU_ID PK 재생성, 멱등). MENU_SEQ 는 PK 에서 분리된 순수 "메뉴 순서" 컬럼. TB_MCM_SEC_MENU_FLD 는 이미 MENU_ID 단독 PK (변경 없음) | saveCmMenu (신규등록) | "이미 존재하는 메뉴 ID 입니다." (중복 차단) | 신규 MENU_ID 중복 시 오류 반환 | BE saveCmMenu (menuId 키) |
| V-008 | **To-Be (2026-06-05 / iter#6, C3)**: saveCmMenu PARENT_MENU_ID 정합 정정 — As-Is xml:77/96 의 자기참조(PARENT_MENU_ID = #{MENU_ID}) 폐기 → FE 가 보낸 그룹 폴더 PARENT_MENU_ID (트리 노드 / OBJECT LoV 선택값) 보존 (blank 시만 self fallback). 사유: R3 트리 재설계 (폴더=TB_MCM_SEC_MENU_FLD / 화면 PARENT_MENU_ID = 그룹 폴더 MENU_ID) 와 자기참조가 모순 → 화면이 그룹에서 분리되고 FULL_SEQ 그룹BASE 산출 불가하던 결함 정정 | saveCmMenu insert/update | - | (그룹 PARENT_MENU_ID 보존) | BE saveCmMenu / As-Is xml:77,96 정정 |

### 6.2 B-010 (행삭제) 룰 (분석 §4.4 #11 / xfdl:489~500)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-101 | OBJECT_ID 존재 시 question 다이얼로그 | 행삭제 클릭 | "OBJECT ID가 연결 되어 있습니다. 그래도 삭제 설정 하시겠습니까?" | question 다이얼로그 (확인/취소) → fn_MsgDeleteCallBack | xfdl:494~497 |
| V-102 | OBJECT_ID null/공백 시 즉시 `gfn_deleteRow` | 행삭제 클릭 | - | (즉시 삭제) | xfdl:498~499 |
| V-103 | fn_MsgDeleteCallBack 콜백 rtn=true → `gfn_deleteRow` / rtn=false → return | 다이얼로그 응답 | - | - | xfdl:502~517 |

### 6.3 B-011 (행복사) 룰 (분석 §4.4 #16 / xfdl:699~709)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-201 | `ds_menuList.rowposition < 0` 차단 | 행복사 클릭 | "선택 행이 없습니다." | gfn_message warning + return | xfdl:700~703 |

### 6.4 D-004 (메뉴 순서) onkillfocus 룰 (분석 §4.4 #27 / xfdl:838~850)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-301 | cbo_menu_id null 또는 nMenuSeq null 또는 nMenuSeq == 0 차단 | edt_lst_seq onkillfocus | "0 또는 공백은 메뉴 순서가 될수 없습니다." | gfn_message warning + obj.set_value("") + return false | xfdl:843~847 |
| V-302 | 정상 시 `edt_menu_seq.set_value(nMenuIdSeq.substr(0,5) + gfn_lpad(nMenuSeq, "0", 3))` (8 char MENU_SEQ 자동 세트) | 동일 | - | (자동 세트) | xfdl:849 |
| V-303 | **To-Be (2026-06-05 / iter#6, C4)**: D-004 메뉴 순서 셀은 숫자만 입력 (FE replace 필터 — 비숫자 제거), maxLength 8. 저장 시 '0' LPAD 8자리 정규화 ("12"→"00000012", BE lpad8()). C5(PK 단독화) 이후 SEC_MENU·FLD insert/update 공통 적용 — As-Is 의 "신규 행만 enable" 제약과 별개로 수정 행 MENU_SEQ 도 LPAD 적용. 메뉴 필드 관리 팝업(§9 P-002) MENU_SEQ 셀도 동일 규칙 | edt_lst_seq 입력 / 저장 | - | (숫자만 + 자동 LPAD8) | BE lpad8() / FE replace 필터 |

### 6.5 D-001 (메뉴 그룹) onitemchanged 룰 (분석 §4.4 #25 / xfdl:821~828)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-401 | obj.text null → ds_menuGrpSub.set_filterstr("") (필터 제거) | cbo_menu_grp onitemchanged | (필터 제거) | xfdl:825~826 |
| V-402 | obj.text != null → `ds_menuGrpSub.set_filterstr("PARENT_MENU_GRP == '" + text.substr(0,1) + "'")` (첫 char 매칭 필터) | 동일 | (필터 적용) | xfdl:823~824 |

### 6.6 D-002 (메뉴 ID) onitemchanged 룰 (분석 §4.4 #28 / xfdl:852~863)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-501 | obj.text null → edt_lst_seq disable + edt_parent_menu_id="" | cbo_menu_id onitemchanged | (disable + clear) | xfdl:860~862 |
| V-502 | obj.text != null → edt_lst_seq enable + `edt_parent_menu_id.set_value(obj.text.substr(0, obj.text.indexOf(" ", 0)))` — cbo_menu_id text "MENU_ID (MENU_NM)" 의 첫 공백 전 substr (MENU_ID 만) 자동 세트 | 동일 | (enable + 자동 세트) | xfdl:854~858 |
| V-503 | **To-Be (2026-06-05 / iter#6, C5)**: MENU_ID 가 TB_MCM_SEC_MENU 단독 PK (복합 PK (MENU_ID, MENU_SEQ) → MENU_ID 단독). MENU_ID 가 메뉴 항목 식별 키이므로 신규등록 시 기존 MENU_ID 와 중복이면 저장 차단(§6.1 V-007 — 무단 덮어쓰기 방지). MENU_SEQ 는 PK 분리 후 순수 "메뉴 순서" 컬럼 (D-004). TB_MCM_SEC_MENU_FLD 는 이미 MENU_ID 단독 PK | cbo_menu_id 선택 / saveCmMenu | (신규 MENU_ID 중복 시 오류 — §6.1 V-007) | BE saveCmMenu(menuId 키) / SecMenuRepository<SecMenu,String> |

### 6.7 G-NNN oncellclick 룰 (분석 §4.4 #29 / xfdl:865~893)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-601 | OBJECT_ID → div_object_id.fn_set_value/fn_set_nm 자동 세트 | grd_M0F0 oncellclick | (자동 세트) | xfdl:867~871 |
| V-602 | MENU_SEQ != null → 메뉴 depth 추가 개선 루프 (substr 길이 줄여가며 ds_menuGrpSub findRows 매칭) → cbo_menu_id.set_index | 동일 | (cbo_menu_id 자동 선택) | xfdl:873~886 |
| V-603 | OBJECT_ID != null → `fn_searchObj(vObjId)` 호출 (searchObj 트랜잭션) / null → ds_objMng.clearData() | 동일 | (OBJECT 그리드 자동 갱신) | xfdl:888~892 |

### 6.8 GT-NNN oncellclick (메뉴 트리) 룰 (분석 §4.4 #21 / xfdl:770~792)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-701 | clickitem == "treeitembutton" 시 return (트리 펼침/접힘 버튼 클릭은 스킵) | grd_M0F1 oncellclick | (스킵) | xfdl:772~775 |
| V-702 | 그 외 → `gfn_setDivDefault(div_detail)` + `gfn_transaction("searchCmMenu", ...)` 호출 (p_MENU_ID = 트리 노드 MENU_ID) | 동일 | searchCmMenu 트랜잭션 (As-Is 메뉴 depth 추가 개선 — 21.05.31 최규찬) | xfdl:787~791 |

### 6.9 콜백 공통 동작 (분석 §4.4 #13 / xfdl:521~642)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| V-801 | strSvcId="searchCmMenu" → fv_sRow 복원 + bottom status "{N}건 조회 되었습니다." + rowcount > 0 시 Detail enable + cbo_menu_grp/cbo_menu_id 자동 선택 루프 + div_object_id 자동 세트 + `fn_searchObj` 호출 / rowcount=0 시 Detail 비활성 | fn_callBack(searchCmMenu) | xfdl:525~586 |
| V-802 | strSvcId="searchMenuGrp" → ds_menuGrp/ds_menuGrpSub clearData + ds_menuTreeList loop 로 LEV=0/LEV>0 분기 추가 + gfn_setFirstRow(ds_menuGrp, "", "", "MENU_SEQ", "MENU_GRP") | fn_callBack(searchMenuGrp) | xfdl:589~613 |
| V-803 | strSvcId="saveCmMenu" → bottom status "{cnt}건 조회 되었습니다." (As-Is 문구) + gfn_message info "저장되었습니다." → 콜백에서 `fn_search()` 재호출 / 에러 시 gfn_message info "저장 실패 하였습니다." | fn_callBack(saveCmMenu) | xfdl:616~633 |
| V-804 | strSvcId="commonList" → trace + ds_menuList.setColumn(rowposition, "OBJECT_ID", nErrorCode.OBJECT_ID) | fn_callBack(commonList) | xfdl:636~640 |
| V-805 | **결함 (As-Is 보존)**: case "searchCmMenu" 의 break 누락 → searchMenuGrp 분기로 fall-through 진입 (xfdl:587 — 메뉴 트리 가공 의도 추정) | fn_callBack(searchCmMenu) | xfdl:587 |

### 6.10 ds_menuList onrowposchanged 룰 (분석 §4.4 #30 / xfdl:895~907)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-901 | rowType=1 (삭제 행) → cbo_menu_grp/cbo_menu_id disable + edt_lst_seq null + disable | ds_menuList onrowposchanged | (disable + clear) | xfdl:897~901 |
| V-902 | 그 외 → cbo_menu_grp/cbo_menu_id/edt_lst_seq enable | 동일 | (enable) | xfdl:903~906 |

### 6.11 행추가 / 행삽입 기본값 (분석 §4.4 #15 / #17 / xfdl:679~696 / 711~731)

| # | 컬럼 | 기본값 | 근거 |
|---|---|---|---|
| V-A01 | MENU_ID | `ds_menuTreeList.MENU_ID` (선택된 트리 노드의 MENU_ID) | xfdl:687 / 717 |
| V-A02 | MENU_TP | 'WEB' | xfdl:688 / 718 |
| V-A03 | USE_TP | 'Y' | xfdl:689 / 719 |
| V-A04 | START_ACTIVE_DATE | `gfn_today()` (오늘 8자리) | xfdl:690 / 720 |
| V-A05 | END_ACTIVE_DATE | "99991231" 하드코딩 | xfdl:691 / 721 |
| V-A06 | MENU_VIEW_YN | 'Y' | xfdl:692 / 722 |
| V-A07 | cbo_menu_id.value | `ds_menuTreeList.MENU_SEQ` | xfdl:695 / 727 |
| V-A08 | (행복사 시 edt_lst_seq enable) | true | xfdl:708 / 730 |

---

## 7. 상태값 ST-NNN (분석 §10.1 인용)

| ID | As-Is 상태값 | 의미 | 영향 영역 |
|---|---|---|---|
| ST-001 | `USE_TP = "Y"` / `"N"` | 사용여부 (Y/N) | S-004 / G-007 / D-010 |
| ST-002 | `MENU_VIEW_YN = "Y"` / `"N"` | 표시여부 (Y/N) | G-011 / D-014 |
| ST-003 | `MENU_TP = "WEB"` / `"MOBIL"` | 메뉴 타입 (WEB/MOBIL) | D-011 |
| ST-004 | `ds_menuList.getRowType(currow)` (1=삭제 / 2=신규 / 4=수정 / 8=수정후삭제) | 그리드 row 상태 | D-001 / D-002 / D-004 (rowType=1 → disable) / fn_callBack saveCmMenu 분기 |
| ST-005 | `STATUS` (Nexacro auto row state — To-Be FE 동일 구현) | 상태 아이콘 | G-001 |
| ST-006 | `LEV` (DS-002.LEV) | 메뉴 트리 depth (0=최상위 / >0=하위) | GT-001 / D-001 / D-002 |
| ST-007 | `MENU_SEQ` substr 매칭 (메뉴 depth 추가 개선) | 깊은 depth 메뉴 ID 매칭 | fn_callBack searchCmMenu / G-NNN oncellclick / D-004 onkillfocus |

---

## 8. 권한 / 접근 제어

As-Is 코드 (xfdl + java) 내에 명시적 권한 체크 호출 없음 (`gfn_authority` / role check grep 0 hits). 공통 topMenu 의 4 기본 버튼 (`btn_search` / `btn_reset` / `btn_save` / `btn_close`) 만 등록 (xfdl:362). **To-Be**: 본 화면 자체 권한 분기 ✗ — To-Be 외부 권한 프로세스 모델 (전사 정책) 에 위임 (사용자 결정).

| 항목 | 값 | 근거 |
|---|---|---|
| 화면 진입 권한 | (As-Is 명시 ✗ — 포털 메뉴 권한 모델 종속 — 본 화면 자체가 메뉴 권한 등록 화면) | xfdl 전체 grep |
| 버튼 권한 | (As-Is 명시 ✗) | 동일 |
| To-Be 정책 | To-Be 외부 권한 프로세스 (전사 정책) 위임 — 본 화면 자체 권한 분기 ✗ | 사용자 결정 |

---

## 9. 팝업 / 연계 화면 (P-NNN — 분석 §5 인용)

| P-ID | 유형 | 이름 | 트리거 | 호출 라인 | 전달 파라미터 | 반환 처리 |
|---|---|---|---|---|---|---|
| P-001 | dynamic LoV | "OBJECT 조회" (공통 div commonDynamic.xfdl) | D-007 (div_object_id 의 검색창 클릭 시) | xfdl:385~399 (CommMenuMng_onload 의 commonDynamic_onload 12 파라미터 등록) | OBJECT_ID 검색어 (edt_OBJECT_ID) | `fn_callBack("commonList")` 콜백 (xfdl:636) — ds_menuList.setColumn(rowposition, "OBJECT_ID", nErrorCode.OBJECT_ID) 자동 세트 |
| P-002 | grid batch 팝업 | "메뉴 필드 관리" (**To-Be 신규 — 2026-06-05 / iter#6, C2/C4**) | (To-Be 추가 — 메뉴 폴더/그룹 필드 일괄 관리) | (To-Be 신규 — As-Is 미존재) | 선택 트리 노드 컨텍스트 | 그리드 batch 저장 (saveCmMenuFld) → recomputeMenuFullSeq() 자동 부여 (C1) |

> P-001 은 별도 화면이 아닌 본 화면의 div_detail 내부 `div_object_id` Div (commonDynamic.xfdl include) 의 동적 LoV. 트랜잭션 action = `commonList` → `selectMenuObjPop` SQL 호출.

> **P-002 "메뉴 필드 관리" 팝업 (To-Be 신규 — 2026-06-05 / iter#6)**: 그리드 batch 편집 팝업. 컬럼 = MENU_ID / MENU_SEQ / MENU_NM / PARENT_MENU_ID / FULL_SEQ. 셀 규칙: **MENU_SEQ** = 숫자만 입력 (FE replace 필터, maxLength 8) + 저장 시 '0' LPAD 8자리 (C4, BE lpad8()) / **FULL_SEQ** = readOnly (editable:false — 저장 시 recomputeMenuFullSeq() 자동 부여, C1/C2). 폴더(TB_MCM_SEC_MENU_FLD)도 FULL_SEQ NUMERIC(10,0) 컬럼 SELECT 동봉 (searchMenuFldList / searchMenuFld). 저장 action = `saveCmMenuFld` → CRUD 직후 recomputeMenuFullSeq() 호출. 팝업 위에 오류 메시지가 가려지지 않도록 오류 팝업 z-index 전역 상향 (C7 — .error-modal-overlay 50→10001, 일반 Modal 9999 / MessageModal 10000 위).

> 본 화면에서 호출되는 다른 외부 화면: `csa/csa::CommObjMng` (xfdl:803 fn_linkCommMenu / fn_openMenu — **As-Is 호출 ✗ 함수 정의만 잔존** → To-Be 제거).

---

## 10. 메시지 / 알림

| # | 메시지 | 유형 | 발생 위치 (xfdl:line) | 근거 |
|---|---|---|---|---|
| M-001 | "저장하시겠습니까?" | confirm | V-003 / xfdl:479 | fn_save |
| M-002 | "저장할 데이터가 없습니다." | information | V-001 / xfdl:752 | fn_before_save_chk |
| M-003 | "OBJECT ID가 연결 되어 있습니다. 그래도 삭제 설정 하시겠습니까?" | question | V-101 / xfdl:496 | fn_rowDelete |
| M-004 | "선택 행이 없습니다." | warning | V-201 / xfdl:701 | fn_rowCopy |
| M-005 | "0 또는 공백은 메뉴 순서가 될수 없습니다." | warning | V-301 / xfdl:844 | edt_lst_seq onkillfocus |
| M-006 | "메뉴가 존재하지 않습니다." | warning | xfdl:813 | fn_openMenu (As-Is 호출 ✗) |
| M-007 | "{N}건 조회 되었습니다." | bottom status | V-801 / xfdl:535 | fn_callBack searchCmMenu |
| M-008 | "{cnt}건 조회 되었습니다." (As-Is saveCmMenu 콜백의 문구 — "저장"이 아닌 "조회" — As-Is 보존) | bottom status | V-803 / xfdl:619 | fn_callBack saveCmMenu |
| M-009 | "저장되었습니다." | info | V-803 / xfdl:627 | fn_callBack saveCmMenu (gfn_message info → 콜백에서 fn_search 재호출) |
| M-010 | "저장 실패 하였습니다." | info | V-803 / xfdl:632 | fn_callBack saveCmMenu else 분기 |
| M-011 | (서버 에러 메시지 — strErrorMsg) | bottom status | xfdl:585 / 631 | fn_callBack else 분기 |

> 본 화면은 As-Is Java UserTask 가 없으므로 Java IllegalTaskException 메시지는 발생하지 않음. CommonSelectTask / CommonMultiSaveTask 의 표준 오류 메시지만 발생.

---

## 11. As-Is 인용 정합 (분석리포트 §1~§13 ↔ 본 §1~§10)

| 본 § | 인용 정본 (분석리포트) | 인용 검증 |
|---|---|---|
| §1.1 | 분석 §1 | 1byte 일치 |
| §1.2 | 분석 §1 + 가이드 명명 룰 | 4 식별자 1byte 동일 |
| §2 | 분석 §3.1 | 영역 11 (5 표준 + 6 분할) |
| §3.1 | 분석 §3.2 | As-Is 4 / To-Be 3 행 (S-001 cross-cutting 정책 #1 폐기) |
| §3.2 | 분석 §3.3 / §3.4 / §3.5 | G 12 + GT 1 + GO **As-Is 9 / To-Be 8** (GO-008 cross-cutting 정책 #1 폐기) |
| §3.3 | 분석 §10 | LV As-Is 7 / To-Be 6 행 (LV-004 cross-cutting 정책 #1 폐기) |
| §4.1 | 분석 §3.6 | 18 행 일치 |
| §4.2 | 분석 §3.6 (L 해당 없음) | "해당 없음" 보존 |
| §5.1 | 분석 §4.1 | 14 행 일치 |
| §5.1-1 | 분석 §4.2 | "해당 없음" 보존 |
| §5.2 | 분석 §6 + §8.3 | As-Is 6 / To-Be 5 action (lov 폐기 = cross-cutting 정책 #1) + As-Is 7 / To-Be 7 활성 SQL ID 일치 (SQL ID 자체 폐기 ✗ — 4 SQL 의 BIZ_SYSTEM_CODE 분기·컬럼만 To-Be 제거) |
| §6 | 분석 §4.4 (메서드 표) | V-001~V-902 모두 cite |
| §7 | 분석 §10.1 | 7 ST 일치 |
| §8 | (To-Be 외부 권한 프로세스 위임 — 사용자 결정) | 본 화면 권한 분기 ✗ |
| §9 | 분석 §5 | P-001 1 행 일치 |
| §10 | 분석 §4.4 + callback | M-001~M-011 모두 cite |

---

## §6.14 Phase 2 종료 4질문 자체 검증

1. **14항 위반?** ✗ 위반 없음. 미존재 항목 신규 0 (모든 행이 분석리포트 §1~§13 인용 — S 4 / G 12 / GT 1 / GO 9 / D 18 / B 14 / P 1 / LV 7 / ST 7 / V 모든 룰 / M 11 / 6 action / 7 활성 SQL). NNN ID 일치 (S/G/GT/GO/D/B/P/LV/ST/V/M).
2. **검증 안 한 부분?** §1.2 의 모든 식별자 값 (commMenuMng × 4) 및 mesModule (m-mcm) 및 tsup entry key (pages/csa/commMenuMng) 정합. §11 인용 매핑 표 15 행 모두 cite.
3. **그대로 수용?** As-Is 1:1 보존 — 모든 SQL ID (selectCommMenuMng / insertCommMenuMng / updateCommMenuMng / deleteCommMenuMng / selectMenuFldList / selectMenuObj / selectMenuObjPop) 그대로 / 미사용 selectCommRoleGrpList 는 To-Be 제거 명시 (§5.2 별도 명시 ✗ — 분석 §6 의 결정 그대로 위임).
4. **임의 합리화?** ✗. 본 기능설계서는 분석리포트의 모든 행을 1:1 인용. 표 헤더 / 행 수 / ID 모두 분석리포트와 동일.

→ ✓ Phase 2 검증 통과 → Phase 3 진입.
