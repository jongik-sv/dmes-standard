---
screenId: commObjMng
asIsId: CommObjMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29 (6 정책 결정 일괄 반영: 2026-05-31)
작성자: Agent
---

# mcm — OBJECT 관리 기능설계서

> **퍼미션 모델 v2 (2026-11-27)**: 이 화면의 권한 모델이 바뀌었다. 문서 맨 끝 "퍼미션 (퍼미션 모델 v2)" 절이 아래 본문보다 우선한다. 본문의 옛 `TB_MCM_SEC_ROLE_MAPPING`·PERMISSION_ID 서술은 이력이다.

> **인용 정본**: 본 문서의 모든 본문은 `commObjMng_분석리포트.md` 의 §1~§14 인용. 자체 추가 ✗. 행수 / ID / 표시명 / SQL ID / BPMN flow / action enum 모두 분석리포트와 1byte 일치.
> **환경 제약**: 분석리포트 §0 인용 — Runner / R14-Step0 / manifest 미적용 (사용자 결정). WinForms 전제 항목은 mui 등가물로 매핑.

---

## 1. 화면 개요

### 1.1 업무/설계 측면 (분석 §1 인용)

| 항목 | 내용 |
|---|---|
| **화면명** | OBJECT 관리 |
| **화면 식별자** | commObjMng |
| **모듈** | mcm (csa 그룹) |
| **화면 목적** | 시스템 OBJECT (화면 / 외부 url / Service / Form URL / Param / Object Type / Biz System / Menu 연결) 의 조회·등록·수정·삭제를 단일 화면에서 처리한다. 후속 권한 (role / role-mapping) 화면이 본 화면의 OBJECT_ID 를 참조한다. |
| **주요 사용자** | 시스템 관리자 / 권한 OBJECT 운영 담당자 |
| **접근 경로** | (As-Is) Nexacro Mui Portal — csa 그룹 → CommObjMng |

### 1.2 Frontend 개발 연계 값

> 명명 룰 = **MES 단일 룰** (moduleId == `mcm` ≠ `mpn` — APS 예외 미적용). 4 식별자 (screenId / pageId / serviceId / pageName) 1byte 동일.

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | mcm — 한글명 **"공통관리"** | 01 A.1 |
| moduleGroup | csa — 한글명 **"시스템관리"** | 01 A.2 (사용자 결정 등재 — 2026-05-29) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > OBJECT 관리 (commObjMng) | - |
| mesModule | m-mcm | 01 A.4.5 (`m-{moduleId}`) |
| 적용 명명 룰 | MES 단일 룰 | moduleId == `mpn` 아님 |
| 화면식별자 (screenId) | commObjMng | 01 A.3 / A.4.1 (camelCase `{화면명}` — MES 단일 토큰) |
| pageName | commObjMng | 01 A.4.2 (MES: = screenId) |
| pageId | commObjMng | 01 A.4.3 (MES: = screenId) |
| serviceId | commObjMng | 01 A.4.4 |
| 페이지 유형 | **C 단일 그리드 + 단일 상세 폼** (G + D 동시 존재, GE 없음, L 없음) | 분석 §3 — As-Is: G-NNN 15 + D-NNN 16 / **To-Be 정책 #1**: G-NNN 14 + D-NNN 15 (G-006 / D-003 폐기) + GE=0 + L=0 |
| 주요 API path (UI→BFF) | `POST /api/mcm/oasis/commObjMng/{action}` | 04 §A.2-3 |
| 주요 API path (BFF→BE) | `POST /oasis/commObjMng/{action}` | 04 §A.2-3 |
| Frontend 파일명 | `commObjMng.tsx` | 03 컨벤션 (MES: `{screenId}.tsx`) |
| tsup entry key | `pages/csa/commObjMng` | 01 A.4.6 (MES: `pages/{moduleGroup}/{pageName}`) |

---

## 2. 화면 영역 정의 (분석 §3.1 인용)

| 영역ID | 영역명 | xfdl 컨테이너 | 설명 |
|---|---|---|---|
| A-TITLE | 타이틀 영역 | `div_title` (xfdl:145) | 화면명 "OBJECT 관리" + 공통 topMenu (외부 btn_search/btn_reset/btn_save/btn_close 자동 등록) |
| A-FILTER | 조회조건 영역 | `div_search` (xfdl:153) | As-Is: BIZ SYSTEM (S-001) + OBJECT (S-002) + 사용 여부 (S-003) / **To-Be 정책 #1**: OBJECT (S-002) + 사용 여부 (S-003) — S-001 BIZ SYSTEM 콤보 폐기 |
| A-FOLD | 접기 버튼 | `btn_fold` (xfdl:7) | div_search 접기/펴기 토글 |
| A-MAIN-LEFT (= A-GRID) | 마스터 그리드 영역 | `div_mainGrd` (xfdl:11) | G-001~G-015 + commonLeftButton (chk_check, btn_sum) + commonRightButton (rowAdd, rowDelete, rowCopy, rowCancel) |
| A-MAIN-RIGHT (= A-DETAIL) | 상세 입력 영역 | `div_mainDetail` (xfdl:81) | D-001~D-016 + 배경 Static 16 + 라벨 Edit 16 |
| A-FOOTER | 하단 status 영역 | `div_bottom` (xfdl:6) | 공통 bottom status 메시지 |

> 본 화면은 표준 5 영역 + A-TITLE / A-FOOTER 2 영역 추가. A-MAIN-LEFT (Master 그리드) 와 A-MAIN-RIGHT (Detail 폼) 가 좌우 분할 (div_mainGrd right=440 / div_mainDetail width=430).

---

## 3. 조회조건 정의 (영역: A-FILTER)

### 3.1 조회조건 필드 (S-NNN — 분석 §3.2 그대로 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3.1 행 == 분석 §3.2 행 (As-Is 3 행) / **To-Be 정책 #1**: 2 행 (S-001 폐기) | ✓ |
| 입력 방식 enum (5값) | As-Is: Combo + TextBox + Combo / **To-Be**: TextBox + Combo | ✓ |

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| ~~S-001~~ | ~~BIZ_SYSTEM_CODE~~ (To-Be 정책 #1 폐기) | ~~BIZ SYSTEM~~ | ~~Combo (LV-001 `ds_lovSubSystem` — TB_MCM_APPHOST.APP_HOST_ID)~~ | N | ~~index=0 / value="Y" / displaynulltext="전체" (As-Is 부적절 보존)~~ | As-Is = BIZ SYSTEM (호스트 ID) 일치 검색 / **To-Be 폐기** (조회조건 콤보 + LoV + 컬럼 모두 제거) |
| S-002 | OBJECT_ID (또는 OBJECT_NM) | OBJECT | TextBox | N | text="부산역 CY" (디자인 더미 — 실 사용 시 빈 값) | OBJECT_ID 또는 OBJECT_NM UPPER LIKE 부분 일치 OR 검색 (xml:30~31) |
| S-003 | USE_TP | 사용 여부 | Combo (LV-002 `ds_useTp` 정적 Y/N — As-Is LV-003 → 정책 #1 재정렬 LV-002) | N | index=0 / value="Y" | 사용 여부 (Y/N) 일치 검색 |

### 3.2 조회 결과 (G-NNN 메인 그리드 — 분석 §3.3 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3.2 G 행 == 분석 §3.3 G 행 — As-Is 15 행 / **To-Be 정책 #1**: 14 행 (G-006 BIZ_SYSTEM_CODE 폐기) | ✓ |
| 표시명 1 enum 매칭 | 한글 / 영문 / 영문 줄바꿈 (\\r\\n) 모두 As-Is 보존 | ✓ |

| 컬럼ID | DB 컬럼명 (alias) | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 | 편집 (분기) | 필수 |
|---|---|---|---|---|---|---|---|
| G-001 | STATUS | 상태 | Nexacro auto row state 아이콘 (As-Is). **To-Be**: FE 프레임워크에서 동일 row state 표시 기능 구현 | Center | imagecontrol | N (자동) | - |
| G-002 | OBJECT_ID | OBJECT ID | OBJECT 마스터 PK (`{prefix}::{ID}` 자동 조합) | Left | varchar | Y (As-Is 직접 편집 가능 / 신규 행은 D-005+D-004 자동 조합) | Y (저장 필수 — xfdl:472) |
| G-003 | OBJECT_NM | OBJECT NAME | OBJECT 명 | Left | varchar | Y (text) | - |
| G-004 | PROGRAM_DESC | 프로그램 설명 | 프로그램 설명 | Left | varchar | Y (text) | - |
| G-005 | SYSTEM_CODE | SYSTEM | 시스템 코드 (As-Is 기본 "MES") | Center | varchar | Y (text) | - |
| ~~G-006~~ | ~~BIZ_SYSTEM_CODE~~ (To-Be 정책 #1 폐기) | ~~BIZ\\r\\nSYSTEM~~ | ~~BIZ 시스템 (App Host)~~ | Center | varchar | Y (text) | Y (저장 필수) — **To-Be 폐기** (그리드 컬럼 + fn_save 필수 검증 제거 — 4 → 3) |
| G-007 | OBJECT_TYPE | OBJECT\\r\\nTYPE | OBJECT 유형 (As-Is 기본 "web" → To-Be 코드 WEB·POPUP·SUB·WIDGET, [오브젝트 유형](#오브젝트-유형-2026-11-28)) | Center | varchar | Y (text) | - |
| G-008 | SERVICE | SERVICE | 서비스명 | Left | varchar | Y (text) | - |
| G-009 | USE_TP | 사용\\r\\n여부 | 사용 여부 (Y/N) | Center | combo (LV-003) | Y (combo) | Y (저장 필수) |
| G-010 | FORM_URL | FORM URL | 폼 URL (As-Is 내부 neXacro 인 경우 `{OBJECT_ID}.xfdl` 자동 세트) | Left | varchar | Y (text) | - |
| G-011 | OUT_ACCESS_IP | 외부 접속 주소 | 외부 접속 주소 (As-Is 외부 url 인 경우 활성) | Left | varchar | Y (text) | - |
| G-012 | PARAM | PARAM | 파라미터 | Left | varchar | Y (text) | - |
| G-013 | START_ACTIVE_DATE | 유효개시일 | 유효 개시일 (As-Is 기본 `gfn_today()`) | Center | date (yyyy-MM-dd) | Y (date) | - |
| G-014 | END_ACTIVE_DATE | 유효기한일 | 유효 기한일 (As-Is 기본 "99991231") | Center | date (yyyy-MM-dd) | Y (date) | - |
| G-015 | ACCESS_TP | 접속 경로 | 접속 경로 (LV-004 정적 3 enum: 1=내부 neXacro / 2=외부 neXacro / 3=외부 url) | Center | combo (LV-004) | Y (combo) | Y (저장 필수) |

**확장/서브 그리드 (GE-NNN)**: 해당 없음 — 본 화면은 단일 그리드.

### 3.3 코드값 표시 변환 (분석 §10 인용)

| DB 컬럼 | 코드 마스터 (LV-NNN) | 변환 예 |
|---|---|---|
| ~~BIZ_SYSTEM_CODE~~ | ~~LV-001 (`selectAppHostId` → ds_lovSubSystem)~~ (To-Be 정책 #1 폐기) | ~~"DKHOST" → "DKHOST" (APP_HOST_ID 그대로)~~ |
| MENU_ID | LV-001 (`selectMenuId` → ds_lovMenuId) — As-Is LV-002 → 정책 #1 재정렬 LV-001 | "BIZ001" → "BIZ001 (메뉴명)" (MENU_ID_NM 조합) |
| USE_TP | LV-002 (xfdl `ds_useTp` 정적 Y/N) — As-Is LV-003 → 정책 #1 재정렬 LV-002 | Y → "Yes" / N → "No" |
| ACCESS_TP | LV-003 (xfdl `ds_access_tp` 정적 1/2/3) — As-Is LV-004 → 정책 #1 재정렬 LV-003 | "1" → "내부 neXacro" / "2" → "외부 neXacro" / "3" → "외부 url" |

---

## 4. 상세 영역 필드 정의 (영역: A-DETAIL — 분석 §3.5 인용)

### 4.1 상세 필드 (D-NNN — `div_detail` 단일 상세 입력 폼)

> 본 §4.1 은 분석 §3.5 의 16 D-NNN 전수 인용 + BindItem (분석 §3.9) 17 행 1:1 매핑.

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | OBJECT_ID | OBJECT ID | TextBox (readonly=true) | Y (Essential) | (자동 조합) | D-004 또는 D-005 변경 시 자동 갱신 (`{prefix}::{ID}` 형식). cssclass="Essential" |
| D-002 | SYSTEM_CODE | SYSTEM | TextBox | - | 행추가 "MES" | 시스템 코드 |
| ~~D-003~~ | ~~BIZ_SYSTEM_CODE~~ (To-Be 정책 #1 폐기) | ~~BIZ SYSTEM~~ | ~~Combo (LV-001)~~ | ~~Y (Essential)~~ | ~~(DB)~~ | ~~BIZ 시스템 (App Host) 선택~~ — **To-Be 폐기** (Detail 콤보 + Essential + Bind item7 모두 제거) |
| D-004 | MENU_ID | MENU ID | Combo (LV-002) | - | (DB) | 메뉴 ID 선택 → OBJECT_ID 자동 조합 (D-004 핸들러 xfdl:551) |
| D-005 | ID | ID | TextBox | Y (Essential) | (수동 입력) | ID 입력 → OBJECT_ID 자동 조합 (D-005 핸들러 xfdl:560) |
| D-006 | OBJECT_NM | OBJECT명 | TextBox | - | (수동 입력) | OBJECT 명 |
| D-007 | PROGRAM_DESC | 프로그램 설명 | TextBox | - | (수동 입력) | 프로그램 설명 |
| D-008 | OBJECT_TYPE | OBJECT TYPE | Select (WEB 메뉴 화면 · POPUP 팝업 · SUB 화면 안 기능 · WIDGET 도구 위젯 — 2026-11-28, As-Is TextBox) | - | 행추가 "WEB" (As-Is "web") | OBJECT 유형 |
| D-009 | SERVICE | SERVICE | TextBox | - | (수동 입력) | 서비스명 |
| D-010 | ACCESS_TP | 접속 경로 | Combo (LV-003 정적 3 enum — As-Is LV-004 → 정책 #1 재정렬 LV-003) | Y (Essential) | (DB / 신규 비어있음) | 접속 경로 선택 → FORM_URL / OUT_ACCESS_IP enable 분기 (D-010 핸들러 xfdl:521) |
| D-011 | FORM_URL | FORM URL | TextBox | - | (ACCESS_TP=1 자동 `{OBJECT_ID}.xfdl`) | FORM URL |
| D-012 | OUT_ACCESS_IP | 외부  접속 주소 (라벨 더블 스페이스 As-Is 보존) | TextBox | - | (수동 입력) | 외부 접속 주소 (ACCESS_TP=2/3 활성) |
| D-013 | USE_TP | 사용 여부 | Radio (LV-002 정적 Y/N — As-Is LV-003 → 정책 #1 재정렬 LV-002) | - | 행추가 "Y" | 사용 여부 |
| D-014 | PARAM | 파라메터 | TextBox | - | (수동 입력) | 파라미터 |
| D-015 | START_ACTIVE_DATE | 유효 개시일 | Calendar (yyyy-MM-dd) | - | 행추가 `gfn_today()` (8자) | 유효 개시일 |
| D-016 | END_ACTIVE_DATE | 유효 기한일 | Calendar (yyyy-MM-dd) | - | 행추가 "99991231" (8자) | 유효 기한일 |

### 4.2 라인 필드 (서브 그리드)

해당 없음 — L-NNN (parent FK 다중 row 라인) ✗. 본 화면은 단일 그리드 + 단일 상세 폼 (G + D).

---

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록 (B-NNN — 분석 §4.1 그대로 인용)

| 버튼ID | 버튼명 | 위치 | To-Be action (3 enum) | 설명 |
|---|---|---|---|---|
| B-001 | 조회 | 공통 topMenu (btn_search 외부) | **search** (As-Is sSvcId="searchCmObj") | `fn_search` → `fn_run("searchCmObj")` (xfdl:404) |
| B-002 | 초기화 | 공통 topMenu (btn_reset 외부) | (클라이언트 전용) | `fn_reset` → `gfn_setDivDefault(div_search)` + `cbo_USE_TP.set_index(1)` (As-Is 보존 — index 1 = "N") |
| B-003 | 저장 | 공통 topMenu (btn_save 외부) | **save** (As-Is sSvcId="saveCmObj") | `fn_save` → 4 단계 validation → `fn_run("saveCmObj")` |
| B-004 | 닫기 | 공통 topMenu (btn_close 외부) | (클라이언트 전용) | `fn_close` → `nexacro.getApplication().gv_AppTabPath.form.fn_closeForm()` |
| B-005 | 행추가 | 공통 rightMenu (btn_rowAdd 외부) | (클라이언트 전용) | `fn_rowAdd` → `ds_main.addRow()` + 5 default 세트 (USE_TP/SYSTEM_CODE×2/START/END/OBJECT_TYPE) + Detail 활성화 |
| B-006 | 행삭제 | 공통 rightMenu (btn_rowDelete 외부) | (클라이언트 전용 + save 의 delete 자동 분기) | `fn_rowDelete` → MENU_ID 존재 시 차단 + 그 외 `gfn_deleteRow` + 비활성 |
| B-007 | 행복사 | 공통 rightMenu (btn_rowCopy 외부) | (클라이언트 전용) | `fn_rowCopy` → rowposition < 0 차단 + `gfn_rowcopyData` + OBJECT_ID="" clear + 활성 |
| B-008 | 행취소 | 공통 rightMenu (btn_rowCancel 외부) | (클라이언트 전용) | `fn_rowCancel` → `gfn_grdInit(grd_main)` |
| B-009 | (접기) | div_main 상단 | (클라이언트 전용) | `btn_fold_onclick` → `gfn_fold(this, div_search, div_main, btn_fold)` |
| B-010 | (가변) | 공통 leftMenu (chk_check / btn_sum 외부) | (외부 공통) | commonLeftButton 의 그리드 체크 / 합계 등 |

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN)

해당 없음 — 본 화면 그리드 셀에 ButtonField / displaytype="button" ✗.

### 5.2 액션 → SQL ID 매핑 (분석 §6 + §8.3 인용)

| To-Be action | As-Is sSvcId | 트리거 (xfdl 메서드) | BPMN 분기 sequenceFlow | 호출 SQL ID (순서대로) | UserTask Java |
|---|---|---|---|---|---|
| search | searchCmObj | `fn_search` (xfdl:404) → `fn_run` (xfdl:324) — btn_search (공통 top) | `SequenceFlow_0tt1mbk` (searchCmObj) | selectCommObjMng (xml:7) | - (ScriptTask) |
| save | saveCmObj | `fn_save` (xfdl:464) → `fn_run` (xfdl:324) — btn_save (공통 top) | `SequenceFlow_0grwghu` (saveCmObj) | (ds_main:U status 분기) insertCommObjMng / updateCommObjMng / deleteCommObjMng (xml:43 / 80 / 99) | - (CommonMultiSaveTask 자동 분기) |
| lov | lov | `fn_lov` (xfdl:296) — Form onload 시 자동 호출 | `SequenceFlow_13avwvi` (lov) | As-Is: (1) selectAppHostId (xml:112) → (2) selectMenuId (xml:118) / **To-Be 정책 #1**: selectMenuId 1 회만 (selectAppHostId 폐기) | - (As-Is ScriptTask 2 연속 → To-Be 1 개) |

> **As-Is action enum (실 호출 3)**: `searchCmObj` / `saveCmObj` / `lov`. 사용자 지시의 "BPMN action 6 enum" 은 가이드 표준 enum (search / searchDetail / save / saveDetail / delete / deleteDetail) — 본 화면은 그 중 search / save 2 enum 사용 + 추가 lov 1 enum. **searchDetail / saveDetail / delete / deleteDetail 4 action 은 "해당 없음"** (delete 는 save 의 자동 status 분기로 처리).

---

## 6. 비즈니스 룰 (validation / 도메인 룰)

### 6.1 B-003 (저장) validation 룰 (분석 §4.4 #13 / xfdl:464~482)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-001 | 변경 데이터 검증 (`!gfn_isDatasetChanged(ds_main)`) | 저장 클릭 | "변경된 데이터가 없습니다." | confirm + `fn_msgSuccessSave` 콜백 (As-Is 변수 미선언 잠재 ReferenceError 보존) + return false | xfdl:466~469 |
| V-002 | As-Is: 필수 입력 4 컬럼 검증 (`gfn_dsRequired(grd_main, "OBJECT_ID BIZ_SYSTEM_CODE ACCESS_TP USE_TP")`) / **To-Be 정책 #1**: BIZ_SYSTEM_CODE 제거 → **필수 3 컬럼** (`OBJECT_ID ACCESS_TP USE_TP`) | 저장 클릭 | (gfn 표준 — 미입력 컬럼 표시) | return false | xfdl:472~474 |
| V-003 | 저장 confirm | 저장 클릭 | "저장하시겠습니까?" | `fn_msgSaveBeforeCallBack` (rtn ✓ → `fn_run("saveCmObj")`) | xfdl:476~481 |

### 6.2 B-006 (행삭제) 룰 (분석 §4.4 #11 / xfdl:443~459)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-101 | MENU_ID 존재 시 차단 (`!gfn_isNull(menuId)`) | 행삭제 클릭 | "연결된 메뉴가 존재합니다. 제외 후 삭제 하세요?" (warning) | return (server SQL 의 `NOT EXISTS` 이중 안전) | xfdl:446~450 |
| V-102 | MENU_ID null → `gfn_deleteRow(ds_main, nRow)` | 행삭제 클릭 | - | (정상 삭제 — `!nativeeditor_status="deleted"` 마킹) | xfdl:451~452 |
| V-103 | 후처리: 행 0 → Detail 영역 비활성화 | 삭제 후 | - | `gfn_setEnable("...div_mainDetail","false")` | xfdl:455~457 |

### 6.3 B-007 (행복사) 룰 (분석 §4.4 #10 / xfdl:431~441)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-201 | rowposition < 0 차단 | 행복사 클릭 | "선택 행이 없습니다." (warning) | return | xfdl:432~435 |
| V-202 | 정상 → `gfn_rowcopyData` + OBJECT_ID="" clear | 행복사 클릭 | - | Detail 영역 활성화 | xfdl:437~440 |

### 6.4 B-005 (행추가) 자동 default (분석 §4.4 #9 / xfdl:414~429)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| V-301 | `ds_main.addRow()` + USE_TP="Y" / SYSTEM_CODE="MES" (2회 중복 set, As-Is 보존) / START_ACTIVE_DATE=`gfn_today()` / END_ACTIVE_DATE="99991231" / OBJECT_TYPE="web" | 행추가 클릭 | xfdl:415~423 |
| V-302 | `edt_id.setFocus(true)` + Detail 영역 활성화 | 행추가 클릭 | xfdl:425~428 |

### 6.5 D-010 (edt_access_tp 접속 경로 변경) 분기 (분석 §4.4 #18 / xfdl:521~549)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| V-401 | obj.value == "1" (내부 neXacro) → edt_form_url enable=true / edt_out_access_ip enable=false. posttext 비어 있지 않으면 edt_form_url 값 = `edt_object_id.value + ".xfdl"` 자동 세트. posttext 빈 → "". focus edt_form_url | D-010 onitemchanged | xfdl:524~537 |
| V-402 | obj.value == "2" (외부 neXacro) → 둘 다 enable=true. focus edt_form_url | 동일 | xfdl:538~541 |
| V-403 | obj.value == "3" (외부 url) → edt_form_url enable=false / edt_out_access_ip enable=true. focus edt_out_access_ip | 동일 | xfdl:542~546 |

### 6.6 D-004 / D-005 (OBJECT_ID 자동 조합) 분기 (분석 §4.4 #19, #20)

| # | 동작 | 트리거 | 비고 (As-Is 결함 보존) | 근거 |
|---|---|---|---|---|
| V-501 | D-004 (cbo_folder) onitemchanged → `edt_id.value` null 아니면 `edt_object_id.set_value(obj.value+"::"+vId)` (`{MENU_ID 전체}::{ID}` 형식) | D-004 변경 | (xfdl:551~558) | xfdl:556 |
| V-502 | D-005 (edt_id) onchanged → `cbo_folder.value` null 아니면 `edt_object_id.set_value(vFolder.substring(0,3)+"::"+obj.value)` (`{MENU_ID 앞 3자}::{ID}` 형식) | D-005 변경 | **As-Is mismatch 잠재 결함 보존** — V-501 과 V-502 가 같은 OBJECT_ID 를 다른 형식으로 자동 조합. 마지막 호출이 덮어쓰기로 동작 (As-Is 보존, 분석 §10.1 ST-008) | xfdl:565 |

### 6.7 ds_main_onrowposchanged 자동 동작 (분석 §4.4 #15 / xfdl:491~508)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| V-601 | `ds_main.getRowType(e.newrow) == '1'` (삭제 row) → `edt_id.set_enable(false)` + `cbo_folder.set_enable(false)` | row 위치 변경 | xfdl:500~502 |
| V-602 | 그 외 → 두 컴포넌트 set_enable(true) | row 위치 변경 | xfdl:503~506 |

### 6.8 콜백 공통 동작 (분석 §4.4 #6 / xfdl:372~398)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| V-701 | `searchCmObj` 콜백 → bottom status "{N}건 조회 되었습니다." + ds_main.getRowCount() > 0 면 Detail 영역 활성 | searchCmObj 완료 | xfdl:375~381 |
| V-702 | `saveCmObj` 콜백 → bottom status + `gfn_message("", "", "성공적으로 저장되었습니다.", "info", "확인", fn_msgSuccessSave)` info 모달 → rtn ✓ → `fn_run("searchCmObj")` 재조회 | saveCmObj 완료 | xfdl:384~393 |

### 6.9 fn_beforeRun 자동 동작 (분석 §4.4 #4 / xfdl:309~321)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| V-801 | sSvcId == "searchCmObj" → `ds_main.clearData()` + `ds_main.filter("")` 초기화 | search 전 | xfdl:311~315 |
| V-802 | sSvcId == "saveCmObj" → (무동작) → return true | save 전 | xfdl:317~320 |

### 6.10 fn_run save 사전 처리 (분석 §4.4 #5 / xfdl:345~363)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| V-901 | sSvcId == "saveCmObj" → ds_main.set_enableevent(false) → for-loop (rowType != 1) → START_ACTIVE_DATE / END_ACTIVE_DATE 8자 substring 자르기 (`nexacro->mapper millisecond cut`, 21.05.31 최규찬) → set_enableevent(true) | save 전 | xfdl:347~359 |

---

## 7. 상태값 ST-NNN (분석 §10.1 인용)

| ID | As-Is 상태값 | 의미 | 영향 영역 |
|---|---|---|---|
| ST-001 | `USE_TP = "Y"` / `"N"` | 사용여부 (Y/N) | G-009 (combo) / D-013 (Radio) / S-003 (cbo_USE_TP) / 저장 V-002 |
| ST-002 | `ACCESS_TP = "1"` / `"2"` / `"3"` | 접속 경로 enum (1=내부 / 2=외부 neXacro / 3=외부 url) | G-015 / D-010 / 저장 V-002 / D-010 onitemchanged V-401~403 |
| ST-003 | `SYSTEM_CODE = "MES"` (행추가 default) | 시스템 코드 (As-Is 항상 "MES" — 2회 중복 set) | DS-001 / V-301 |
| ST-004 | `OBJECT_TYPE = "WEB"` (행추가 default, As-Is "web") | OBJECT 유형 (As-Is 항상 "web" → To-Be 코드 WEB·POPUP·SUB·WIDGET) | DS-001 / V-301 |
| ST-005 | `END_ACTIVE_DATE = "99991231"` (행추가 default) | 종료 일자 (As-Is 9999-12-31 만료 무한) | DS-001 / V-301 |
| ST-006 | `ds_main.getRowType(currow) == '1'` (삭제 row) | 그리드 row 상태 (Nexacro RowType: 1=삭제 / 2=신규 / 4=수정 / 8=수정후삭제) | V-601 / V-602 |
| ST-007 | `STATUS` (Nexacro auto row state — To-Be FE 동일 구현) | 상태 아이콘 | G-001 표시 전용 |
| ST-008 | OBJECT_ID 자동 조합 패턴 | D-004 또는 D-005 변경 시 OBJECT_ID 자동 갱신 (V-501 / V-502 — mismatch As-Is 보존) | D-001 / D-004 / D-005 |
| ST-009 | `MENU_ID` 존재 여부 (삭제 차단) | xfdl B-006 → MENU_ID null 아니면 차단. server `NOT EXISTS` 이중 안전 | B-006 / deleteCommObjMng |

---

## 8. 권한 / 접근 제어

As-Is 코드 (xfdl + Mapper.xml) 내에 명시적 권한 체크 호출 없음 (`gfn_authority` / role check grep 0 hits). 공통 topMenu 의 4 버튼 (btn_search/reset/save/close) 만 자동 등록 (xfdl:277~281). **To-Be**: 본 화면 자체 권한 분기 ✗ — To-Be 외부 권한 프로세스 모델 (전사 정책) 에 위임 (사용자 결정).

| 항목 | 값 | 근거 |
|---|---|---|
| 화면 진입 권한 | (As-Is 명시 ✗ — 포털 메뉴 권한 모델 종속) | xfdl 전체 grep |
| 버튼 권한 | (As-Is 명시 ✗) | 동일 |
| To-Be 정책 | To-Be 외부 권한 프로세스 (전사 정책) 위임 — 본 화면 자체 권한 분기 ✗ | 사용자 결정 |

---

## 9. 팝업 / 연계 화면 (P-NNN — 분석 §5 인용)

해당 없음 — 본 화면의 xfdl Script 의 `gfn_openPopup` / `OpenForm` grep 결과 0 hit. 본 화면에서 호출되는 다른 외부 화면: 없음.

> 주석된 `this.fn_detailPopup()` 호출 (xfdl:507) 은 미구현 + 주석 처리되어 As-Is 비활성. To-Be 미반영.

---

## 10. 메시지 / 알림

| # | 메시지 | 유형 | 발생 위치 (xfdl:line) | 근거 |
|---|---|---|---|---|
| M-001 | "변경된 데이터가 없습니다." | confirm | V-001 / xfdl:467 | - |
| M-002 | (gfn_dsRequired 표준 — 미입력 컬럼 표시) | warning | V-002 / xfdl:472 | (gfn 표준) |
| M-003 | "저장하시겠습니까?" | confirm | V-003 / xfdl:481 | - |
| M-004 | "연결된 메뉴가 존재합니다. 제외 후 삭제 하세요?" | warning | V-101 / xfdl:449 | - |
| M-005 | "선택 행이 없습니다." | warning | V-201 / xfdl:433 | - |
| M-006 | "성공적으로 저장되었습니다." | info | V-702 / xfdl:392 | - |
| M-007 | "{N}건 조회 되었습니다." | bottom status | V-701 / xfdl:376 + saveCmObj 분기 xfdl:385 (재사용 문구) | - |
| M-008 | (CommonMultiSaveTask 의 server 에러 응답 — `nErrorCode != 0`) | OASIS framework 표준 | xfdl:520 등 — `gfn_commonBottomStatus_msg(strErrorMsg)` | - |

> M-007 saveCmObj 분기는 As-Is 잠재 결함 — "조회 되었습니다" 문구가 save 콜백에서도 재사용 (xfdl:385). To-Be 동일 보존 또는 "저장 되었습니다" 정정 위임.

---

## 11. As-Is 인용 정합 (분석리포트 §1~§14 ↔ 본 §1~§10)

| 본 § | 인용 정본 (분석리포트) | 인용 검증 |
|---|---|---|
| §1.1 | 분석 §1 | 1byte 일치 |
| §1.2 | 분석 §1 + 가이드 명명 룰 | 4 식별자 1byte 동일 |
| §2 | 분석 §3.1 | 영역 7 → 5 정규 + 2 추가 (TITLE / FOOTER) |
| §3.1 | 분석 §3.2 | As-Is 3 행 / **To-Be 2 행** (S-001 폐기 — 정책 #1) |
| §3.2 | 분석 §3.3 | As-Is G 15 행 / **To-Be 14 행** (G-006 폐기 — 정책 #1) (GE 0) |
| §4.1 | 분석 §3.5 | As-Is D 16 행 / **To-Be 15 행** (D-003 폐기 — 정책 #1) |
| §4.2 | 분석 §3.5 | L "해당 없음" 보존 |
| §5.1 | 분석 §4.1 | 10 행 일치 (외부 commonTopButton 4 + commonRightButton 4 + btn_fold 1 + commonLeftButton 1) |
| §5.1-1 | 분석 §4.2 | "해당 없음" 보존 |
| §5.2 | 분석 §6 + §8.3 | 3 action + 6 SQL ID 일치 |
| §6 | 분석 §4.4 (메서드 표) | V-001~V-901 모두 cite |
| §7 | 분석 §10.1 | 9 ST 일치 |
| §8 | (To-Be 외부 권한 프로세스 위임 — 사용자 결정) | 본 화면 권한 분기 ✗ |
| §9 | 분석 §5 | "해당 없음" 보존 |
| §10 | 분석 §4.4 + xfdl callback | M-001~M-008 모두 cite |

---

## 12. Phase 2 자체 검증 (§6.14 4질문)

| 질문 | 답 |
|---|---|
| 1. 14항 위반? | **No** — 분석 §1~§14 직접 인용 + cite 보존. 자체 추가 0 hits. |
| 2. 검증 안 한 부분? | **No** — 미존재 항목 신규 추가 0. NNN ID 일치 (S 3 / G 15 / D 16 / B 10 / V-001~901 / ST 9 / M 1~8). |
| 3. 그대로 수용? | **No** — 분석리포트의 As-Is 결함 8 종 동일 보존 + To-Be 결정/위임 인용. |
| 4. 임의 합리화? | **No** — As-Is action 실 호출 3 enum 그대로. 4 enum "해당 없음" 명시. |

> Phase 2 모두 No → Phase 3 진입.


---

## 퍼미션 (퍼미션 모델 v2, 2026-11-27)

> 이 절은 위 본문보다 우선한다. 위 본문에서 `TB_MCM_SEC_ROLE_MAPPING` 을 역할 연결로 다룬 서술은 옛 모델의 것이다.
> 근거: `docs/perm-bench/decompose.md` D7·D8·D13·D14·D15·D18·D30, §0.4. 구현: 커밋 030d656b2.
> OBJECT 마스터(OBJECT_ID·OBJECT_NM·접속 경로 등) 편집은 그대로다. 바뀐 것은 허용 값, 영향 보기, 퍼미션 연결이다.

### P.1 화면 뜻 변경

- 오브젝트는 "어떤 버튼·팝업 action 이 있는가"를 목록으로 가진다. 이 목록이 허용 값이다.
- 역할에게 줄 수 있는 퍼미션 값은 이 허용 값의 부분집합이다 (D15).
- 아래 옛 서술은 더 쓰지 않는다. 이력으로만 둔다.
  - 삭제 차단 사유가 "메뉴 참조 + 옛 `TB_MCM_SEC_ROLE_MAPPING` 매핑" 두 가지뿐이라는 서술 (새 사유 추가, P.5).
  - 옛 `TB_MCM_SEC_ROLE_MAPPING` 을 역할 연결의 정본으로 보는 서술 전부. 새 정본은 `TB_MCM_SEC_ROLE_PERM` 이다.
- 위 본문에는 쓰이지 않았지만 코드에 있던 동작이 있다. OBJECT 저장 때 `SYSADMIN` 역할에 `PERM_ALL` 을 자동 매핑하던 동작이다. D13 에서 삭제했다 (P.7).

### P.2 허용 값 칼럼 3개

| 칸 | 의미 | 저장 규칙 |
|---|---|---|
| `BTN_PERM` | 이 오브젝트의 버튼 action 코드 목록 (D7) | 쉼표 구분. 정규화한다 |
| `POPUP_PERM` | 이 오브젝트 안에서 팝업을 여는 action 코드 목록 (D8) | 같음 |
| `DATA_PERM` | 데이터 범위 값 목록 | 같음 |

- 정규화: 앞뒤 공백 제거, 빈 값 제거, 중복 제거, 순서 유지. 값이 비면 NULL 로 저장한다.
- 한 칸은 1000자까지다. 넘으면 `PERM_TOO_LONG` 으로 거절한다. 모든 줄을 먼저 검사하므로 한 줄이라도 넘으면 아무것도 쓰지 않는다.
- 그리드와 저장 줄에 칸 3개가 들어간다. 행에 칸이 없으면 그 칸은 건드리지 않는다.

### P.3 조회 (action `search`)

- 조회 조건을 하나 더했다.

| 조건 | params 이름 | 의미 |
|---|---|---|
| 메뉴 폴더 | `menuFolderId` | 그 폴더와 하위 폴더의 메뉴가 가리키는 오브젝트만 본다. 비면 전체. 하위 폴더는 SQL 재귀로 펴므로 폴더 수 제한(IN 1000개)이 없다 |

- 옛 조건 `edtOBJECTID`·`cboUSETP` 는 그대로다.
- 그리드에 칸을 더했다.

| 칸 | 의미 |
|---|---|
| `BTN_PERM` · `POPUP_PERM` · `DATA_PERM` | 허용 값 |
| `MENU_CNT` | 이 오브젝트를 가리키는 메뉴 수 |
| `PERM_CNT` | 이 오브젝트에 퍼미션을 가진 역할 수 |

### P.4 값 빼기 영향 (action `save`)

- 허용 값은 저장할 때 함께 저장한다.
- 수정으로 BTN·POPUP 값이 빠지거나 `USE_TP` 가 `Y` → `N` 이 되면, 영향을 응답 `impacts` 로 알려 준다.
- 퍼미션 행은 고치지 않는다 (D15). 퍼미션의 값은 남고, 계산에서만 빠진다 (오브젝트 허용 값과의 교집합). 값을 다시 넣으면 원래대로 돌아온다.
- 영향 줄은 값마다 한 줄이다. 칸은 아래와 같다.

| 칸 | 의미 |
|---|---|
| `OBJECT_ID` | 바뀐 오브젝트 |
| `KIND` | `BTN` · `POPUP` · `USE_TP` |
| `CODE` | 빠진 값. `USE_TP` 줄은 `N` |
| `PERM_CNT` | 영향받는 퍼미션 줄 수 |
| `USER_CNT` | 그 역할을 받는 사람 수 (그룹 겹침 제외). `USE_TP='Y'` 인 역할만 센다 |

- 영향받는 퍼미션이 0 이면 줄을 만들지 않는다.
- 새로 만드는 오브젝트에는 영향이 없다.
- 저장은 `impacts` 가 있어도 끝난다. `impacts` 는 알림용이다. 화면이 보여 주는 방식은 FE 설계서가 정한다.
- `USE_TP` `N` 은 "사용 안 함" 이다. `USE_TP` 줄의 `USER_CNT` 는 사용 안 함으로 바꿔도 되는지 확인하는 숫자다.

### P.5 삭제 검사

- 오브젝트 삭제는 아래 셋이 모두 0 일 때만 된다. 하나라도 있으면 그 줄을 조용히 건너뛴다 (오류 없음).

| 검사 | 표 |
|---|---|
| 이 오브젝트를 가리키는 메뉴 수 | `TB_MCM_SEC_MENU` |
| 비-SYSADMIN 옛 매핑 수 (옛 검사 유지) | `TB_MCM_SEC_ROLE_MAPPING` |
| 새 퍼미션 수 (새로 더한 검사) | `TB_MCM_SEC_ROLE_PERM` |

- SYSADMIN 의 옛 매핑 줄은 차단 사유가 아니다. 삭제할 때 함께 지운다. 옛 줄이 남아 있는 DB 를 위한 처리다.

### P.6 이 오브젝트의 퍼미션과 메뉴 (actions `searchObjPerm` · `searchObjMenu`)

- 오브젝트를 고르면 화면이 두 곳을 채운다.
- 「이 오브젝트의 퍼미션」(`searchObjPerm`): 이 오브젝트를 가진 역할마다 한 줄.
  - 칸: ROLE_ID · ROLE_NM · ROLE_USE_TP · BTN_PERM · POPUP_PERM · DATA_PERM · EFF_BTN_PERM · EFF_POPUP_PERM · USER_CNT.
  - `EFF_*` 는 역할의 값과 오브젝트 허용 값의 교집합이다. 역할 값의 순서를 따른다.
  - `USER_CNT` 는 역할마다 받는 사람 수다. 합계 `USER_CNT` 는 그룹 겹침을 뺀 사람 수다. `USE_TP='Y'` 인 역할만 센다. 사용 안 함 역할은 0 이다.
- 「가리키는 메뉴」(`searchObjMenu`): 이 오브젝트를 가리키는 메뉴마다 한 줄.
  - 칸: MENU_ID · MENU_NM · PARENT_MENU_ID · MENU_PATH · MENU_TP · MENU_VIEW_YN · USE_TP.
  - 정렬은 WEB 메뉴를 먼저, 그다음 MENU_ID 순이다.
- 역할이나 메뉴 화면으로 이동하는 훅은 별도 계약(`open-with`)을 따른다. 이 문서의 범위가 아니다.

### P.7 SYSADMIN 자동 매핑 삭제 (D13)

- 오브젝트를 저장해도 SYSADMIN 에게 `PERM_ALL` 을 자동으로 붙이지 않는다.
- SYSADMIN 은 퍼미션 행 없이 모든 사용 오브젝트 × 허용 값 전부로 계산한다.
- `PERM_ALL` 시드는 중단했다.

### P.8 캐시 무효화 (D30)

- 아래 경우에 `RoleChangedEvent` 를 한 번 발행한다. 대상은 SYSADMIN 과 그 오브젝트에 퍼미션을 가진 역할들이다. 오브젝트에 퍼미션 줄이 없어도 발행한다.
  - 오브젝트를 새로 만들었다.
  - 오브젝트를 지웠다.
  - 수정에서 `BTN_PERM`·`POPUP_PERM`·`USE_TP`·`SYSTEM_CODE`·`START_ACTIVE_DATE`·`END_ACTIVE_DATE` 중 하나가 바뀌었다.
- SYSADMIN 은 퍼미션 행 없이 사용 오브젝트 전부로 계산한다 (D13). 그래서 오브젝트가 바뀌면 SYSADMIN 의 계산도 바뀐다.
- 오브젝트를 저장하거나 지우면 `MenuChangedEvent(OBJECT)` 를 발행한다. 메뉴 카탈로그를 비운다.

## 오브젝트 유형 (2026-11-28)

- `OBJECT_TYPE` 은 자유 입력에서 코드로 바뀌었다. 값은 대문자 코드 네 개다. 공통 코드가 아니라 상수다(BE `mcm-core entity.SecObjType`, FE `row-model.ts OBJECT_TYPE_OPTIONS`). 접속 경로·메뉴 셋과 같은 관례다.

| 코드 | 화면 이름 | 뜻 | 메뉴에 넣기 |
|---|---|---|---|
| `WEB` | 메뉴 화면 | 포털이 메뉴로 여는 화면 | 된다 |
| `POPUP` | 팝업 | 다른 화면 안에서 여는 창(모달). 예: `termRegPop`·`dataCsvUploadPop` | 안 된다 |
| `SUB` | 화면 안 기능 | 다른 화면의 탭·상세·단추가 부르는 서비스 권한 키(그 화면에 합쳐진 옛 화면 포함). 예: `codeEdit`·`dataHistory`·`metaFeed` | 안 된다 |
| `WIDGET` | 도구 위젯 | 포털 홈·위젯 틀에서 쓰는 부품 | 안 된다 |

- 상세의 OBJECT TYPE 칸은 고르기(Select)다. 새 행의 기본값은 `WEB` 이다.
- 저장(action `save`)은 쓰기 전에 모든 행의 유형을 검증한다.
  - 대소문자·앞뒤 공백은 맞춰 준다(`web` → `WEB`). 빈 값은 `WEB` 이다.
  - 네 코드가 아니면 `INVALID_VALUE` 로 거부한다. 아무 행도 쓰지 않는다.
  - 메뉴에 놓인 오브젝트를 `POPUP`·`WIDGET`·`SUB` 로 바꾸면 거부한다. 메뉴 관리에서 메뉴를 먼저 뺀다.
  - 행에 `OBJECT_TYPE` 칸이 없는 수정은 저장된 값을 지킨다.
- 권한(직무 퍼미션·권한 작업대)은 유형과 상관없다.
- 기존 값은 Flyway `V28__obj_type_code` 가 바꿨다. 옛 `web` 은 `WEB` 으로, 메뉴에 놓이지 않은 10개는 `POPUP` 2개·`SUB` 6개·`WIDGET` 2개로 바꿨다. 새 DB 는 시드가 맞는 유형으로 넣는다.
- 조회 조건의 OBJECT TYPE 은 그대로 부분 일치 입력이다. 코드를 넣어 찾는다.
