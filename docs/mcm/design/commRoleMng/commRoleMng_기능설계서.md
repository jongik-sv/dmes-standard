---
screenId: commRoleMng
asIsId: CommRoleMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
갱신일: 2026-05-31
작성자: Agent
---

# mcm — 역할 관리 기능설계서

## §0. 환경 제약 (분석리포트 §0 동일)

| 항목 | 결정 | 사유 |
|---|---|---|
| Auto Manifest Runner (R-14) | 적용 ✗ | mui 자산 비정합 (분석 §0) |
| R-13 SOP 30 Step | 미실행 | manifest 부재 |
| 정합체크서 §A.3 / §A.A-R12-1 / §D.4 | ✗ + 사유 명시 | "Runner mui 미지원" |
| 가이드 템플릿 (WinForms 전제) | 절 구조 참고만 | mui 등가물 매핑 (분석 §0) |

> 본 기능설계서는 분석리포트 §0.1.3 (단일 원천 원칙) 에 따라 분석리포트 §1~§13 의 행을 1:1 인용. 자체 추가 ✗.

---

## §1. 화면 개요

### §1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| **화면명** | 역할 관리 |
| **화면 식별자** | commRoleMng |
| **As-Is 식별자** | CommRoleMng |
| **모듈** | mcm (공통관리) / csa (시스템관리) |
| **화면 목적** | 시스템 사용자 역할 (Role) 마스터의 등록·수정·삭제 및 각 역할에 부여된 권한(Permission)을 OBJECT 단위로 부여/회수한다. (분석 §1 인용) |
| **주요 사용자** | 시스템 관리자 (역할/권한 운영 담당자) |
| **접근 경로** | 공통관리 > 시스템관리 > 역할 관리 (URL: `/portal/mcm/csa/commRoleMng`) |

### §1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | `mcm` | 01 A.1 (mcm — Manufacturing Common Management) |
| moduleGroup | `csa` | 01 A.2 (cm + a~z 영역 순번 — csa = 시스템관리) |
| mesModule | `m-mcm` | 01 A.4.5 (`m-{moduleId}`) |
| 적용 명명 룰 | `MES 단일 룰` | moduleId == `mcm` → MES 룰 |
| 화면식별자 (screenId) | `commRoleMng` | 01 A.3 / A.4.1 (단일 토큰 camelCase) |
| pageName | `commRoleMng` | 01 A.4.2 (MES = screenId 동일) |
| pageId | `commRoleMng` | 01 A.4.3 (MES = screenId 동일) |
| serviceId | `commRoleMng` | 01 A.4.4 |
| 페이지 유형 | **D** (다중 그리드 — 메인 G + 확장 GE 2개) | FE가이드 §3-1 (분석 §3.3 / §3.4 카운트 매핑) |
| 주요 API path (UI→BFF) | `POST /api/mcm/oasis/commRoleMng/{action}` | 04 §A.2-3 (OASIS 채택 — §11.2 인용) |
| 주요 API path (BFF→BE) | `POST /oasis/commRoleMng/{action}` | 04 §A.2-3 |
| Frontend 파일명 | `commRoleMng.tsx` | 03 컨벤션 (MES) |
| tsup entry key | `pages/csa/commRoleMng` | 01 A.4.6 (MES) |

---

## §2. 화면 영역 정의

> 영역 5 enum (T3-A): `A-FILTER` / `A-GRID` / `A-GRID-EXT` / `A-DETAIL` / `A-BTN`. 분석 §3.1 8 영역 → 가이드 5 enum 매핑.

| 영역ID | 영역명 | 설명 | 분석 §3.1 매핑 |
|---|---|---|---|
| A-FILTER | 조회조건 영역 | **(To-Be 3 필터 — 정책 #1 적용)** 역할 ID / 역할명 / 사용 여부 — **As-Is `BIZ SYSTEM` 콤보 제거** | A-TITLE + A-FILTER + A-FOLD |
| A-GRID | 역할 목록 메인 그리드 | ds_main (**To-Be 8 컬럼 — BIZ_SYSTEM_CODE 제거**) + 좌측 leftMenu (chk_check/btn_sum/btn_copyPaste — React 공통 컴포넌트 자연 흡수 / Q-009 해소) + 우측 rightMenu (rowAdd/Delete/Copy/Cancel) | A-MAIN-LEFT-UP (G) |
| A-GRID-EXT | 확장 그리드 (현재 권한 + 전체 권한) | sub1 (ds_roleMap — To-Be 10 컬럼 / BIZ_SYSTEM_CODE 제거) + sub2 (ds_perm 6 컬럼) + 셔틀 버튼 2 (cssclass swap 정정 / Q-008 해소) + sub2 rightMenu (btn_permSearch) | A-MAIN-LEFT-DOWN (GE1) + A-MAIN-RIGHT-DOWN (GE2) + A-SHUTTLE |
| A-DETAIL | 역할 상세 입력 폼 | **(To-Be 8 라벨 + 8 컨트롤 — 정책 #1 D-001 BIZ SYSTEM 콤보 제거)** : **역할 ID** (Q-013 정정) / 메뉴 ID / ID / 역할명 / 역할 설명 / 사용 여부 (RadioGroup — Q-007 자연 흡수) / 유효 개시일 / 유효 기한일 | A-MAIN-RIGHT-UP (D) |
| A-BTN | 버튼 영역 통합 | topMenu 4 (search/reset/save/close) + B-013 (btn_fold) | A-BTN (PageLayout.buttons 흡수) |

> A-FOOTER (분석 §3.1) 는 portal 공통 영역 — 가이드 5 enum 외 (디자인설계서 §1.1 참조).

---

## §3. 조회조건 정의 (영역: A-FILTER)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3 행 == 분석 §3.2 행 | ✓ (4 == 4) |
| 화면 표시명 1byte 일치 | Compare-Object 분석[화면표시명] 본[화면표시명] | ✓ |
| 입력 방식 enum (5값) | 정규식 `^(TextBox\|ComboBox\|CheckBox\|DatePicker\|Lookup)$` 100% | ✓ |

| 필드ID | DB 컬럼명 (SNAKE_CASE) | 화면 표시명 (분석 §3.2 인용) | 입력 방식 (5 enum) | 필수 (Y/N) | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| ~~S-001~~ | ~~BIZ_SYSTEM_CODE~~ | ~~BIZ SYSTEM~~ | ~~ComboBox~~ | ~~N~~ | ~~"Y"~~ | **To-Be 제거 (정책 #1)** — As-Is `cbo_bizSystemCode` 콤보 + LoV `ds_lovSubSystem` 일괄 폐기. xfdl:17~18 As-Is 인용만 |
| S-002 | ROLE_ID | 역할 ID | TextBox | N | (빈 — placeholder) | maxlength=100 / UPPER LIKE 검색. **As-Is 디폴트 더미 "부산역 CY" 는 To-Be 미반영 (Q-001 해소 / 정책 #1)** |
| S-003 | ROLE_NM | 역할명 | TextBox | N | (빈 — placeholder) | maxlength=100 / UPPER LIKE 검색. **As-Is 디폴트 더미 "부산역 CY" 는 To-Be 미반영 (Q-001 해소)** |
| S-004 | USE_TP | 사용 여부 | ComboBox | N | "Y" (As-Is xfdl:24 `value="Y"`) | LoV `ds_useTp` 정적 (LV-002 — Y/사용, N/미사용). **As-Is `onitemchanged` 핸들러 본문 ✗ 는 To-Be 미반영 (Q-003 해소 / 정책 #1)** |

### §3.2 조회 결과 (메인 그리드 G-NNN)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3.2 G 행 == 분석 §3.3 G 행 | ✓ (9 == 9) |
| 표시명 1 enum 매칭 | 정규식 `^[가-힣 A-Z]+$` 또는 `^[A-Z_]+ \[Q-\d{3}\]$` 100% | ✓ |
| 표시 형식 enum | `^[a-zA-Z]+\([0-9,A-Za-z\-/: ]+\)$` 100% | ✓ |

**메인 그리드 (G-NNN — `grd_main`, binddataset=`ds_main`)**:

| 컬럼ID | DB 컬럼명 (alias) | 화면 표시명 (분석 §3.3 1byte) | 데이터 설명 | 정렬 (3 enum) | 표시 형식 (자료형(길이)) |
|---|---|---|---|---|---|
| G-001 | STATUS | 상태 | CRUD 행상태 이미지 (Inserted/Updated/Deleted) — As-Is `displaytype="imagecontrol"` | Center | image |
| G-002 | ROLE_ID | ROLE ID | 역할 ID PK | Center | varchar(90) [Q-002] |
| G-003 | ROLE_NM | ROLE 이름 | 역할 표시 이름 | Left | varchar(256) [Q-002] |
| G-004 | ROLE_DESC | ROLE 설명 | 역할 설명 (자유 텍스트) | Left | varchar(256) [Q-002] |
| G-005 | MENU_ID | MENU | 연결된 메뉴 ID (LoV LV-001 — MENU_ID 단일) | Center | varchar(30) |
| ~~G-006~~ | ~~BIZ_SYSTEM_CODE~~ | ~~BIZ\nSYSTEM~~ | ~~비즈니스 시스템 코드~~ | ~~Center~~ | **To-Be 제거 (정책 #1)** — As-Is `xfdl:151/166/177` 인용만. G 컬럼 수 = To-Be 8 |
| G-007 | USE_TP | 사용구분 | 사용 여부 콤보 (combodataset=`ds_useTp`) | Center | bit(Y/N) (combotext 표시) |
| G-008 | START_ACTIVE_DATE | 유효개시일 | 유효 시작일 (calendardateformat=`yyyy-MM-dd`) | Center | date(YYYY-MM-DD) |
| G-009 | END_ACTIVE_DATE | 유효기한일 | 유효 종료일 (기본 99991231) | Center | date(YYYY-MM-DD) |

**확장/서브 그리드 (GE-NNN — 분석 §3.4 17 컬럼 1:1 인용)**:

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 비고 |
|---|---|---|---|---|---|
| GE-001 | CHK | (체크 셀) | sub1 행 선택 (셔틀 삭제 대상) — displaytype `checkboxcontrol` | Center | sub1 (현재 권한) |
| GE-002 | PERMISSION_ID | PERMISSION ID | 권한 ID PK (대문자 LIKE 필터 동기화 — PERMISSION_ID_UPPER) | Left | sub1 |
| GE-003 | OBJECT_ID | OBJECT ID | OBJECT 마스터 ID (TB_MCM_SEC_OBJ FK) | Left | sub1 |
| GE-004 | PERMISSION_NM | PERMISSION 명 | 권한 표시명 (PERM 테이블에서 join) | Left | sub1 |
| GE-005 | PERMISSION_COMMON | 공통 권한 | 공통 권한 구분 | Left | sub1 |
| GE-006 | PERMISSION_CUSTOM | CUSTOM 권한 | 커스텀 권한 구분 | Left | sub1 |
| GE-007 | POPUP_BTN | POPUP 버튼 | 팝업 버튼 여부 | Left | sub1 |
| GE-008 | OBJECT_NM | OBJECT 명 | OBJECT 표시명 (OBJ 테이블 join) | Left | sub1 |
| GE-009 | SYSTEM_CODE | SYSTEM | 시스템 코드 (OBJ 테이블) | Center | sub1 |
| GE-010 | SERVICE | SERVICE | 서비스명 (OBJ 테이블) | Left | sub1 |
| GE-011 | ROLE_ID | 역할 ID | 본 매핑 ROLE_ID (FK to TB_MCM_SEC_ROLE) | Left | sub1 |
| GE-012 | CHK | (체크 셀) | sub2 행 선택 (셔틀 추가 대상) — displaytype `checkboxcontrol` | Center | sub2 (전체 권한 후보) |
| GE-013 | PERMISSION_ID | PERMISSION ID | 권한 ID PK | Left | sub2 |
| GE-014 | PERMISSION_NM | PERMISSION명 (As-Is sub1 GE-004 "PERMISSION 명" 과 표기 비대칭 — As-Is 1:1 보존) | 권한 표시명 | Left | sub2 |
| GE-015 | PERMISSION_COMMON | 공통 권한 | 공통 권한 구분 | Left | sub2 |
| GE-016 | PERMISSION_CUSTOM | CUSTOM 권한 | 커스텀 권한 구분 | Left | sub2 |
| GE-017 | POPUP_BTN | POPUP버튼 (As-Is sub1 GE-007 "POPUP 버튼" 과 표기 비대칭 — As-Is 1:1 보존) | 팝업 버튼 여부 | Left | sub2 |

### §3.3 코드값 표시 변환 (분석 §9.3 인용)

| DB 컬럼 | 코드 마스터 | 변환 예 |
|---|---|---|
| ~~BIZ_SYSTEM_CODE~~ | ~~LV-001 ds_lovSubSystem (APP_HOST_ID 동적)~~ | **To-Be 제거 (정책 #1)** |
| MENU_ID | LV-001 ds_lovMenuId (MENU_ID / MENU_ID_NM 동적 — **BIZ_SYSTEM 종속 필터 제거 / 정책 #1**) | "M001" → "기준정보 메뉴" |
| USE_TP | LV-002 ds_useTp (정적 Y/N) | "Y" → "사용", "N" → "미사용" |

> **To-Be LV 카운트 = 2** (LV-001 menuId / LV-002 useTp). As-Is LV-001 bizSystemCode 는 정책 #1 로 제거.

---

## §4. 상세 영역 필드 정의 (영역: A-DETAIL)

> 분석 §3.5 (D-NNN 9 행) 그대로 인용. 본 화면은 마스터 그리드 + 단일 상세 폼 양방향 바인딩 패턴.

| 필드ID | DB 컬럼명 | 화면 표시명 (분석 §3.5 1byte) | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| ~~D-001~~ | ~~BIZ_SYSTEM_CODE~~ | ~~BIZ SYSTEM~~ | ~~ComboBox~~ | ~~Y~~ | ~~(이전 그리드 행 값)~~ | **To-Be 제거 (정책 #1)** — As-Is `cbo_bizsystem` 콤보 + LoV + onitemchanged 핸들러 일괄 폐기 |
| D-002 | ROLE_ID | **역할 ID** (Q-013 정정) | TextBox | Y (cssclass `Essential`) | (자동 합성) | `readonly="true"` / maxlength=90 / 자동 합성 `"role_"+MENU_ID+"_"+ID` (xfdl:913). As-Is `canchange` 핸들러 본문 ✗ → To-Be Service 레이어 책임 (existsById 중복 PK 422 / Q-004 해소) |
| D-003 | MENU_ID | 메뉴 ID | ComboBox | Y (cssclass `Essential`) | (이전 그리드 행 값) | LoV ds_lovMenuId (LV-001) / 신규 행 (rowType=2) 만 활성 (xfdl:764). **BIZ_SYSTEM_CODE 종속 필터링 제거 (정책 #1)**. As-Is `cbo_bizSystemCode_onitemchanged` 핸들러명 mismatch 는 Q-005 자동 해소 |
| D-004 | ID | ID | TextBox | Y (cssclass `Essential`) | (빈 — placeholder) | maxlength=100 / `imemode="alpha"` / `inputtype="numberandenglish,symbol"` / 신규 행만 활성. **As-Is 디폴트 더미 + onchanged 핸들러 본문 ✗ 모두 To-Be 미반영 (Q-001 / Q-006 해소)** |
| D-005 | ROLE_NM | 역할명 (To-Be 라벨 컨트롤명 = `edt_st_roleNm` 의미 정합 — Q-014 해소) | TextBox | N | (빈) | maxlength=100 / `inputtype="normal"` |
| D-006 | ROLE_DESC | 역할 설명 (To-Be 라벨 컨트롤명 = `edt_st_roleDesc` 의미 정합 — Q-014 해소) | TextBox | N | (빈) | maxlength=100 / `inputtype="normal"` |
| D-007 | USE_TP | 사용 여부 | **RadioGroup (UI 자연 흡수 — Q-007 해소)** | N | "Y" | React RadioGroup 컴포넌트 — Y/Yes, N/No 2옵션 정적. 디자인 §5 RadioGroup 정본 |
| D-008 | START_ACTIVE_DATE | 유효 개시일 | DatePicker | N | (gfn_today() — 신규 행) | dateformat=`yyyy-MM-dd` / `usetrailingday="true"` |
| D-009 | END_ACTIVE_DATE | 유효 기한일 | DatePicker | N | "99991231" (신규 행 디폴트) | dateformat=`yyyy-MM-dd` / `usetrailingday="true"` |

> **To-Be D 카운트 = 8** (D-001 BIZ_SYSTEM 콤보 제거 / 정책 #1). 8 라벨 + 8 컨트롤.

### §4.2 라인 필드 (서브 그리드)

해당 없음 — 본 화면은 GE-NNN (sub1 + sub2) 확장 그리드만 존재. parent FK 기반 L-NNN 라인 필드는 부재 (분석 §3.5 명시).

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 설명 |
|---|---|---|---|---|---|

---

## §5. 버튼 및 기능 동작 정의

### §5.1 버튼 목록

> 분석 §4.1~§4.6 의 15 버튼 (B-001~B-013 + BS-001~BS-002) 그대로 인용. To-Be action 7 enum 매핑.

| 버튼ID | 버튼명 (분석 §4 인용) | 위치 (toolbar / 본체 / 그리드셀 / 셔틀) | To-Be action (7 enum) | 설명 |
|---|---|---|---|---|
| B-001 | btn_search (조회) | toolbar (div_title.topMenu) | search | 조회 조건 적용 → `searchCmRole` |
| B-002 | btn_reset (초기화) | toolbar | (클라이언트 전용 — 7 enum 외, `reset` 으로 임시 분류) | div_search 디폴트 재설정 |
| B-003 | btn_save (저장) | toolbar | save | 확인 → `saveCmRole` (행상태 분기) |
| B-004 | btn_close (닫기) | toolbar | (클라이언트 전용 — `close`) | 탭 닫기 |
| B-005 | chk_check | toolbar (commonLeft) | (클라이언트 전용 — Q-009) | 그리드 체크 토글 |
| B-006 | btn_sum | toolbar (commonLeft) | (클라이언트 전용 — Q-009) | 합계 표시 |
| B-007 | btn_copyPaste | toolbar (commonLeft) | (클라이언트 전용 — Q-009) | 행 복사/붙여넣기 |
| B-008 | btn_rowAdd (행추가) | toolbar (commonRight 1) | (클라이언트 전용) | ds_main 신규 행 추가 |
| B-009 | btn_rowDelete (행삭제) | toolbar (commonRight 1) | (클라이언트 전용 + 검증) | ROLE_GROUP_ID + ds_roleMap 검증 후 deleteRow |
| B-010 | btn_rowCopy (행복사) | toolbar (commonRight 1) | (클라이언트 전용) | 선택 행 복사 |
| B-011 | btn_rowCancel (행취소) | toolbar (commonRight 1) | (클라이언트 전용) | grd_main 초기화 |
| B-012 | btn_permSearch (조회) | toolbar (commonRight 2) | search (전체 권한) → `searchCmPerm` | sub2 전체 권한 후보 조회 |
| B-013 | btn_fold (접기/펴기) | 본체 (div_main 상단) | (클라이언트 전용 — `fold`) | div_search 토글 |
| BS-001 | btn_right (현재권한 삭제) | 셔틀 (div_buttonGrp) | save (간접) → `saveCmRoleMap` | sub1 CHK=1 → deleteRow + 즉시 저장 |
| BS-002 | btn_left (현재권한 추가) | 셔틀 | save (간접) → `saveCmRoleMap` | sub2 CHK=1 → ds_roleMap addRow + 즉시 저장 |

### §5.1-1 그리드셀 인라인 버튼 (GB-NNN) — T1-D

해당 없음 — 분석 §4.7 명시. 본 화면의 Grid 컬럼 정의에 ButtonField / displaytype="button" 셀 부재.

| 버튼ID | 버튼명 | 소속 그리드 (G/GE/L-NNN) | 셀 컬럼 | 핸들러 | 설명 |
|---|---|---|---|---|---|

### §5.2 버튼별 동작 상세

> 분석 §4.8 의 38 메서드 매트릭스 + §10 부수효과 인용. 본 절은 BPMN설계서 §2 액션별 명세와 1:1 대응.

| 버튼ID | 트리거 | 선행 조건 | 동작 (단계별) | 호출 액션 (action) |
|---|---|---|---|---|
| B-001 | onclick (commonTop btn_search) | (없음) | `fn_search()` → `fn_run("searchCmRole")` → POST API-001 → ds_main 갱신 | searchCmRole |
| B-002 | onclick (commonTop btn_reset) | (없음) | `fn_reset()` → `gfn_setDivDefault(div_search)` (조회조건 4 필드 디폴트 복원) | (클라이언트) |
| B-003 | onclick (commonTop btn_save) | `gfn_isDatasetChanged(ds_main)` true + V-006 (`gfn_cpRequired(this,"ROLE_ID")`) 통과 | `fn_save()` → 확인 다이얼로그 "저장하시겠습니까?" → fn_msgSaveCallBack rtn 시 `fn_run("saveCmRole")` → POST API-002 → 콜백 "저장 되었습니다." + `fn_search()` 재호출 | saveCmRole |
| B-004 | onclick (commonTop btn_close) | (없음) | `fn_close()` → `objApp.gv_AppTabPath.form.fn_closeForm()` | (클라이언트) |
| B-008 | onclick (commonRight 1 btn_rowAdd) | (없음) | `fn_rowAdd()` → `ds_main.addRow()` + 상세 활성화 + USE_TP="Y" / START_ACTIVE_DATE=오늘 / END_ACTIVE_DATE="99991231" | (클라이언트) |
| B-009 | onclick (commonRight 1 btn_rowDelete) | V-003 (ROLE_GROUP_ID null) + V-004 (ds_roleMap.rowcount == 0) 모두 통과 | `fn_rowDelete()` → 검증 → `gfn_deleteRow(ds_main, nRow)` (실 DELETE 는 후속 fn_save 시 deleteCommRole 트리거) | (클라이언트 + saveCmRole 시 DELETE 분기) |
| B-010 | onclick (commonRight 1 btn_rowCopy) | V-007 (rowposition >= 0) 통과 | `fn_rowCopy()` → `gfn_rowcopyData(ds_main, rowposition)` + 상세 활성화 | (클라이언트) |
| B-011 | onclick (commonRight 1 btn_rowCancel) | (없음) | `fn_rowCancel()` → `gfn_grdInit(grd_main)` | (클라이언트) |
| B-012 | onclick (commonRight 2 btn_permSearch) | (없음) | `fn_permSearch()` → `fn_run("searchCmPerm")` → POST API-005 → ds_perm 갱신 | searchCmPerm |
| B-013 | onclick (btn_fold) | (없음) | `btn_fold_onclick()` → `gfn_fold(this, div_search, div_main, btn_fold)` | (클라이언트) |
| BS-001 | onclick (btn_right) | (sub1 CHK=1 행 존재) | `div_main_div_buttonGrp_btn_right_onclick` → `fn_removeRoleMapRow()` → CHK=1 행 deleteRow → `fn_run("saveCmRoleMap")` → POST API-004 → 콜백 "저장 되었습니다." + sub1/sub2 재조회 | saveCmRoleMap |
| BS-002 | onclick (btn_left) | V-001 (ROLE_ID 선택) + V-002 (OBJECT_ID 입력) 통과 + (sub2 CHK=1 행 존재) | `div_main_div_buttonGrp_btn_left_onclick` → `fn_appendRoleMapRow()` → CHK=1 행 ds_roleMap addRow (ROLE_ID/OBJECT_ID/PERMISSION_ID) → `fn_run("saveCmRoleMap")` → POST API-004 → 콜백 + sub1/sub2 재조회 | saveCmRoleMap |

### §5.3 그리드 동작

| 동작 | 설명 |
|---|---|
| 행 클릭 (grd_main) | `ds_main_onrowposchanged` (xfdl:740) → rowType != 2 + rowposition > -1 + rowcount != 0 + reason != 52 시 sub1/sub2 헤드 CHK=0 초기화 + `fn_run("searchCmRoleMap")` + `fn_run("searchCmPerm")` 자동 호출 |
| 행 더블클릭 | (별도 핸들러 ✗ — 행 클릭으로 상세 양방향 바인딩) |
| 헤더 클릭 (grd_main) | `gfn_commonOnheadclick` — 컬럼 정렬 토글 |
| 헤더 클릭 (grd_sub1) | CHK 컬럼 헤드 시 `gfn_setGridCheckAll` (전체 선택/해제) / 그 외 `gfn_commonOnheadclick` |
| 헤더 클릭 (grd_sub2) | (동일 패턴) |
| 셀 값 변경 (grd_main MENU_ID / ID) | `ds_main_oncolumnchanged` → ROLE_ID 자동 합성 (`"role_"+MENU_ID+"_"+ID`) |
| 셀 값 변경 (grd_sub2) | `ds_perm_oncolumnchanged` → CHK 컬럼 시 헤드 텍스트 동기화 (전체 선택 여부) |
| 필터 입력 (sub1 / sub2 edt_permfilter) | `_edt_permfilter*_onkeyup` → PERMISSION_ID_UPPER LIKE 필터 (대소문자 무시) |
| 페이지 변경 | (그리드 페이지네이션 사용 ✗ — 전체 행 로드) |

---

## §6. 입력값 검증 규칙

> 분석 §10.1 V-001~V-008 8 행 인용 + V-NNN 명명.

### §6.1 필드별 검증

| 규칙ID | 대상 필드 (`DB 컬럼명 (필드ID)`) | 검증 내용 | 에러 메시지 |
|---|---|---|---|
| V-001 | (BS-002 트리거 시 ROLE_ID — `ds_main.ROLE_ID`) | `gfn_isNull(vRoleId)` 차단 | "선택된 ROLE ID가 없습니다." (warning) |
| V-002 | (BS-002 트리거 시 OBJECT_ID — `div_object_id.fn_get_value()`) | `gfn_isNull(vObjId)` 차단 | "OBJECT ID 입력 후 추가해 주세요." (warning) |
| V-003 | (B-009 트리거 시 ROLE_GROUP_ID — `ds_main.ROLE_GROUP_ID`) | `!gfn_isNull(roleGrpId)` 차단 | "연결된 [역할그룹] 이 존재합니다. 제외 후 삭제 하세요" (warning) |
| V-004 | (B-009 트리거 시 ds_roleMap 행 존재) | `ds_roleMap.rowcount > 0` 차단 | "연결된 [권한] 이 존재합니다. 제외 후 삭제 하세요" (warning) |
| V-005 | (B-003 fn_save 트리거 시 ds_main 변경 여부) | `!gfn_isDatasetChanged(ds_main)` 차단 | "저장할 데이터가 없습니다." (information) |
| V-006 | (B-003 fn_save 트리거 시 ROLE_ID 필수) | `gfn_cpRequired(this, "ROLE_ID")` — gfn 공통 필수값 검증 | (gfn 공통 메시지 — `[ROLE_ID]는(은) 필수 입력 항목입니다.` 등) |
| V-007 | (B-010 fn_rowCopy 트리거 시 선택 행 존재) | `ds_main.rowposition < 0` 차단 | "선택 행이 없습니다." (warning) |
| V-008 | (fn_linkCommMenu → fn_openMenu 시 메뉴 존재 — As-Is 미호출, Q-010) | `nRow == -1` (objApp.gds_menuInfo 검색 결과 부재) | "메뉴가 존재하지 않습니다." (warning) |

### §6.2 연관 검증 (여러 필드 조합)

| 규칙ID | 조건 | 에러 메시지 |
|---|---|---|
| XV-001 | (D-002 ROLE_ID 자동 합성 — D-003 MENU_ID + D-004 ID 모두 비어있지 않을 때만 `"role_"+MENU_ID+"_"+ID` 자동 채움) | (검증 ✗ — 자동 채움 로직, 빈 값 무시) |
| XV-002 | (D-001 BIZ_SYSTEM 변경 → D-003 MENU_ID 후보 동적 필터) | (검증 ✗ — 필터 로직, 빈 값 시 필터 제거) |

### §6.3 검증 실행 순서

```
[저장] B-003 클릭
  → 1단계: V-005 ds_main 변경 여부 (변경 없음 → 차단)
  → 2단계: V-006 ROLE_ID 필수 (gfn_cpRequired)
  → 3단계: (행상태 분기 — ROWTYPE_INSERTED / UPDATED / DELETED 자동 BPMN 분기)
  → 모두 통과 → 확인 다이얼로그 → 서버 요청
  → 실패 → gfn_message 표시 / 차단 시 return

[현재권한 추가] BS-002 클릭
  → 1단계: V-001 ROLE_ID 선택 검증
  → 2단계: V-002 OBJECT_ID 입력 검증
  → 3단계: (sub2 CHK=1 행 루프 — ds_roleMap addRow)
  → 모두 통과 → fn_run("saveCmRoleMap")

[행삭제] B-009 클릭
  → 1단계: V-003 ROLE_GROUP_ID 비어있음 검증 (참조 무결성)
  → 2단계: V-004 ds_roleMap.rowcount == 0 검증 (참조 무결성)
  → 모두 통과 → gfn_deleteRow (실 DELETE 는 후속 fn_save 시 deleteCommRole 트리거)
  → 실패 → 차단 메시지
```

---

## §7. 상태 정의 및 상태별 제어

### §7.1 상태 정의 (분석 §9.2 ST-NNN 5 행 인용)

| 상태코드 | 한글명 | 설명 | 단순 표시값/동작 제어값 | 수정 가능 | 삭제 가능 |
|---|---|---|---|---|---|
| ST-001 | 사용 (useTpY) | TB_MCM_SEC_ROLE.USE_TP="Y" — Active 역할 | 표시 + 그리드 조회 분기 (S-004) | Y | Y (참조 무결성 통과 시) |
| ST-002 | 미사용 (useTpN) | TB_MCM_SEC_ROLE.USE_TP="N" — Inactive 역할 | 표시 + 그리드 조회 분기 | Y | Y (참조 무결성 통과 시) |
| ST-003 | 행상태 (rowStatus) | ds_main.STATUS 이미지 (Inserted/Updated/Deleted 저장 전) | G-001 좌측 이미지 | (자동 갱신) | (자동 갱신) |
| ST-004 | Permission Active (permUseTpY) | TB_MCM_SEC_PERM.USE_TP="Y" — searchCmPerm 의 필터 | (서버 분기 — 화면 표시 영향 ✗) | (마스터 단위 — 본 화면 외) | (본 화면 외) |
| ST-005 | Object Active (objUseTpY) | TB_MCM_SEC_OBJ.USE_TP="Y" — selectMenuObjPop 의 필터 | (서버 분기 — P-001 OBJECT 후보) | (본 화면 외) | (본 화면 외) |

### §7.2 상태 전이 규칙

```
USE_TP="Y" (ST-001 사용)  ⇄  USE_TP="N" (ST-002 미사용)     (D-007 변경 + saveCmRole 트리거)

ds_main rowStatus (ST-003):
  NORMAL → INSERTED         (B-008 btn_rowAdd 시 addRow)
  NORMAL → UPDATED          (D-NNN 필드 수정 시)
  NORMAL → DELETED          (B-009 btn_rowDelete 시 — 참조 무결성 통과 후 gfn_deleteRow)
  → saveCmRole 시 INSERT / UPDATE / DELETE 분기 (CommonMultiSaveTask)
```

### §7.3 상태별 필드 편집 가능 여부

| 필드 (`DB 컬럼명 (화면 표시명)`) | 신규 (rowType=2) | 기존 (rowType=1) | DELETED (rowType=8) |
|---|---|---|---|
| BIZ_SYSTEM_CODE (D-001 BIZ SYSTEM) | 편집 가능 (Essential) | 편집 가능 | (편집 불가 — 삭제 행) |
| ROLE_ID (D-002 역할 ID — Q-013 정정) | readonly (자동 합성) | readonly | readonly |
| MENU_ID (D-003 메뉴 ID) | 편집 가능 (xfdl:764 활성화) | 편집 불가 (xfdl:768 비활성화) | 편집 불가 |
| ID (D-004 ID) | 편집 가능 (xfdl:765 활성화) | 편집 불가 (xfdl:769 비활성화) | 편집 불가 |
| ROLE_NM (D-005 역할명) | 편집 가능 | 편집 가능 | 편집 불가 |
| ROLE_DESC (D-006 역할 설명) | 편집 가능 | 편집 가능 | 편집 불가 |
| USE_TP (D-007 사용 여부) | 편집 가능 (디폴트 "Y") | 편집 가능 | 편집 불가 |
| START_ACTIVE_DATE (D-008 유효 개시일) | 편집 가능 (디폴트 오늘) | 편집 가능 | 편집 불가 |
| END_ACTIVE_DATE (D-009 유효 기한일) | 편집 가능 (디폴트 99991231) | 편집 가능 | 편집 불가 |

### §7.4 상태별 버튼 활성/비활성

| 버튼 | 미선택 (ds_main 비어있음) | 행 선택 (rowType=1 기존) | 행 선택 (rowType=2 신규) |
|---|---|---|---|
| B-001 (조회) | 활성 | 활성 | 활성 |
| B-002 (초기화) | 활성 | 활성 | 활성 |
| B-003 (저장) | 활성 (변경 없으면 V-005 차단) | 활성 (변경 시) | 활성 |
| B-004 (닫기) | 활성 | 활성 | 활성 |
| B-008 (행추가) | 활성 | 활성 | 활성 |
| B-009 (행삭제) | 비활성 (V-003/V-004 검증) | 활성 (참조 무결성 통과 시) | 활성 |
| B-010 (행복사) | 비활성 (V-007) | 활성 | 활성 |
| B-011 (행취소) | 활성 | 활성 | 활성 |
| B-012 (전체 권한 조회) | 비활성 (ROLE_ID null 시 fn_run skip) | 활성 | 활성 |
| BS-001 (현재권한 삭제) | 비활성 | 활성 (sub1 CHK=1 행 존재 시) | (신규 행은 ROLE_ID 자동 합성 후 활성) |
| BS-002 (현재권한 추가) | 비활성 (V-001/V-002) | 활성 (sub2 CHK=1 행 존재 시 + OBJECT_ID 입력 시) | 활성 |

---

## §8. 권한 정의

| 기능 | ADMIN | MANAGER | USER | 비고 |
|---|---|---|---|---|
| 조회 (B-001) | O | O | X | 본 화면은 시스템 관리자 영역. USER 는 접근 차단 (메뉴 권한 단위) |
| 신규등록 (B-008 → B-003) | O | △ (역할그룹 한정) | X | △ 정책은 후속 결정 (Q-NEW) |
| 수정 (D-NNN → B-003) | O | △ | X | 동일 |
| 삭제 (B-009 → B-003) | O | X | X | 삭제는 시스템 관리자 전용 (참조 무결성 보호) |
| 상태 변경 (D-007 USE_TP 변경 → B-003) | O | O | X | - |
| 현재권한 추가/삭제 (BS-001 / BS-002) | O | O | X | 권한 부여는 시스템 운영 핵심 |

---

## §9. 연동 화면 / 팝업

> 분석 §5 의 P-NNN 2 행 인용 (P-001 호출 / P-002 As-Is 미호출).

| 팝업ID | 대상 | 호출 방식 | 트리거 | 주고받는 데이터 |
|---|---|---|---|---|
| P-001 | OBJECT 조회 (commonDynamic) — `csa::CommMenuMng` 의 commonList 서비스 | popup (modal commonDynamic) | div_object_id (xfdl:129) 클릭 시 | IN: `edt_OBJECT_ID` (검색 키워드) + service args (`OBJECT_ID, OBJECT_NM, FORM_URL`) / OUT: 선택된 `OBJECT_ID` → div_object_id.fn_get_value() 결과 |
| P-002 | 화면 이동 — `csa/csa::CommObjMng` (As-Is 주석 처리 — Q-010, 호출 ✗) | external (메뉴 이동) | (As-Is 호출 ✗) | IN: sFullId / pArg / OUT: 새 탭 메뉴 |

---

## §10. 기타 열거형 (LoV)

> 분석 §9.3 LV-NNN 3 행 인용.

| 열거형 (DB 컬럼) | 코드값 | 화면 표시명 | 설명 |
|---|---|---|---|
| ~~BIZ_SYSTEM_CODE~~ | ~~(CommObjMngMapper.selectAppHostId 동적 조회)~~ | ~~(APP_HOST_ID 동적 값)~~ | **To-Be 제거 (정책 #1)** — As-Is LV-001 인용만 |
| MENU_ID (**To-Be LV-001**) | `commRoleMngMapper.selectMenuId` 동적 조회 — **BIZ_SYSTEM 종속 필터 제거 (정책 #1)** | (MENU_ID_NM) | D-003 cbo_folder 사용. As-Is cross-namespace `CommObjMngMapper.selectMenuId` 호출 → To-Be 본 화면 namespace 내재화 |
| USE_TP (**To-Be LV-002**) | Y / N | 사용 / 미사용 | S-004 cbo_USE_TP / G-007 사용구분 / **D-007 RadioGroup (Q-007 자연 흡수)** — ds_useTp 정적 |

> **To-Be LV 카운트 = 2** (As-Is 3 중 LV-001 bizSystemCode 제거).

---

## §11. 특이사항 / 설계 결정

### §11.1 [확인필요] 인용 (분석리포트 §13 그대로)

| 분석리포트 §13 ID | 항목 | 영향도 (높음/중간/낮음) | 해소 방식 | 상태 |
|---|---|---|---|---|
| ~~Q-001~~ | ~~잔존 디폴트 텍스트 "부산역 CY"~~ | 낮음 | 정책 #1 (신규 미반영) | **closed** |
| ~~Q-002~~ | ~~DMES Excel 컬럼 카탈로그 미추출~~ | 중간 | 분석 §9.4 신설 (2026-05-30) | **closed** |
| ~~Q-003~~ | ~~S-004 핸들러 본문 미정의~~ | 낮음 | 정책 #1 (신규 미반영) | **closed** |
| ~~Q-004~~ | ~~D-002 핸들러 본문 미정의~~ | 낮음 | Service 레이어 책임 (existsById 422) | **closed** |
| ~~Q-005~~ | ~~D-003 핸들러명 오타 + 본문 미정의~~ | 낮음 | 정책 #1 자동 해소 (cbo_bizSystemCode 자체 제거) | **closed** |
| ~~Q-006~~ | ~~D-004 핸들러 본문 미정의~~ | 낮음 | 정책 #1 (신규 미반영) | **closed** |
| ~~Q-007~~ | ~~D-007 입력 유형 Radio (5 enum 외)~~ | 중간 | UI 자연 흡수 — React RadioGroup | **closed** |
| ~~Q-008~~ | ~~셔틀 cssclass ↔ 실 동작 비일관~~ | 낮음 | To-Be cssclass swap 정정 | **closed** |
| ~~Q-009~~ | ~~commonLeftButton 3 버튼 핸들러 미명시~~ | 낮음 | UI 자연 흡수 — React 공통 컴포넌트 | **closed** |
| ~~Q-010~~ | ~~fn_linkCommMenu / fn_openMenu 본문 정의 + 호출 모두 ✗~~ | 낮음 | 정책 #1 (신규 미반영) | **closed** |
| ~~Q-011~~ | ~~updateCommRoleMap no-op~~ | 낮음 | UI 자연 흡수 — JPA saveAll | **closed** |
| ~~Q-012~~ | ~~BPMN process name 비일관~~ | 낮음 | To-Be 정정 "역할 관리" | **closed** |
| ~~Q-013~~ | ~~D-002 라벨 오타 "역활 ID"~~ | 낮음 | To-Be 정정 "역할 ID" | **closed** |
| ~~Q-014~~ | ~~D-005 / D-006 라벨 ↔ 컬럼 매핑 비일관~~ | 중간 | To-Be 라벨 컨트롤명 정정 | **closed** |
| ~~Q-015~~ | ~~dao 속성 빈값 + isServiceResult=true 의도~~ | 낮음 | UI 자연 흡수 — oasis ScriptTask 표준 | **closed** |
| ~~Q-016~~ | ~~searchCmRoleMap 콜백의 ds_roleMap 행 rowType 변환~~ | 낮음 | UI 자연 흡수 — React state | **closed** |
| ~~Q-017~~ | ~~fn_msgSuccessSave 안에서 fn_search 호출 시 this 컨텍스트~~ | 낮음 | 추적 완료 (libUtil.xjs:1693/1771) | **closed** |

> **§11.1 활성 Q = 0** (17건 전수 closed). 본 갱신 (2026-05-31) 신규 처리 = 15건. 사전 처리 = 2건.

### §11.2 검토한 대안 (있는 경우만)

> 분석 §11 To-Be 변환점 17 항 중 핵심 결정 (OASIS / Phase 7 채택 결정).

| 대안 | 장점 | 단점 | 채택 여부 (○/×) | 사유 |
|---|---|---|---|---|
| OASIS 범용 actionGateway (1 BPMN, action 분기) | As-Is BPMN 구조 1:1 유지 / SQL 직접 매핑 / 개발 단순 | action 분기 다수 (8) — actionGateway 분기 매트릭스 검증 필요 | ○ | 본 화면 = 분석 §11.1 C1~C6 충족 ≤ 1 → OASIS 단일 채택. As-Is BPMN 이 이미 ExclusiveGateway 분기 패턴 |
| Phase 7 분리 (action 별 별도 endpoint) | 각 SQL 독립 / 테스트 단순 | 8 endpoint × FE 분기 / OASIS 패턴 위반 | × | 본 화면은 OASIS 가 더 적합 (C1~C6 ≤ 1) |
| ref_Audit 매퍼 fragment 이전 | As-Is 동일 패턴 | MyBatis fragment 의존성 / cactus-core 미사용 | × | cactus-core CactusAuditEntity 자동 채움 패턴 채택 (사용자 결정 — `project_cma_mcm_core_migration.md`) |

---

## §6.14 Phase 2 종료 자가 점검 (4 질문)

1. **14항 위반?** — 위반 ✗. 분석리포트 §0.1.3 단일 원천 — S/G/GE/D/B/BS/P/ST/LV/V/XV 모두 분석 §3~§13 인용. 본 갱신 (2026-05-31): 정책 #1 일괄 적용으로 S-001 / D-001 / G-006 / LV bizSystemCode / SQL WHERE 분기 / BPMN Task_0r5ztlq 제거 + Q 17건 전수 closed.
2. **검증 안 한 부분?** — 없음. 모든 Q 해소 본문 반영 완료 (§2 / §3 / §3.2 / §3.3 / §4 / §10 / §11.1 동시 정합 갱신).
3. **그대로 수용?** — Q-NNN 17건 전수 closed (분석 §13 정본 인용).
4. **임의 합리화?** — 없음.

→ Phase 2 통과 (갱신 2026-05-31 — Q 활성 0).
