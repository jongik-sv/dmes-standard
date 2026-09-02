---
screenId: commPermMng
asIsId: CommPermMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# mcm — PERMISSION 관리 기능설계서

> **인용 정본**: 본 문서의 모든 본문은 `commPermMng_분석리포트.md` 의 §1~§13 인용. 자체 추가 ✗. 행수 / ID / 표시명 / SQL ID / BPMN flow / action enum 모두 분석리포트와 1byte 일치.
> **환경 제약**: 분석리포트 §0 인용 — Runner / R14-Step0 / manifest 미적용 (사용자 결정). WinForms 전제 항목은 mui 등가물로 매핑.
> **cross-cutting 정책 #1 적용 (2026-05-31)**: BIZ_SYSTEM_CODE 컬럼 폐기 — As-Is S-001 / D-007 / D-008 / G-008 (Detail Combo Essential + Search Combo + Grid 컬럼) / DS-003 / Bind item10 / lov action / Task_08v4ryn / SequenceFlow_1dd2kqv·0xqzbh4 / fn_lov / fn_callBack 의 lov 분기 / cross-module `CommObjMngMapper.selectAppHostId` 모두 **To-Be 폐기**. As-Is 인용은 보존.
> **cross-cutting 정책 #6 적용 (A안)**: Entity 명명 = `SecPerm` (TB_MCM_SEC_PERM → SecPerm 1:1). SecPermButton Entity 미생성.

---

## 1. 화면 개요

### 1.1 업무/설계 측면 (분석 §1 인용)

| 항목 | 내용 |
|---|---|
| **화면명** | PERMISSION 관리 (xfdl titletext "PERMISSON 관리" 오타 — To-Be 정정) |
| **화면 식별자** | commPermMng |
| **모듈** | mcm (csa 그룹) |
| **화면 목적** | 시스템 권한 마스터 (TB_MCM_SEC_PERM) 의 조회·등록·수정·저장을 단일 화면에서 처리한다. 권한 ID 단위로 공통 버튼 / CUSTOM 버튼 / POPUP 버튼 / ACTION 권한 / BIZ SYSTEM 을 등록·관리하며, 다른 권한 관련 화면 (commRoleGrpMng / commRoleMng / commUserMng) 이 본 화면에서 등록한 PERMISSION_ID 를 참조한다. |
| **주요 사용자** | 시스템 관리자 / 권한 운영 담당자 |
| **접근 경로** | (As-Is) Nexacro Mui Portal — csa 그룹 → CommPermMng |

### 1.2 Frontend 개발 연계 값

> 명명 룰 = **MES 단일 룰** (moduleId == `mcm` ≠ `mpn` — APS 예외 미적용). 4 식별자 (screenId / pageId / serviceId / pageName) 1byte 동일.

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | mcm — 한글명 **"공통관리"** | 01 A.1 |
| moduleGroup | csa — 한글명 **"시스템관리"** | 01 A.2 (사용자 결정 등재) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > PERMISSION 관리 (commPermMng) | - |
| mesModule | m-mcm | 01 A.4.5 (`m-{moduleId}`) |
| 적용 명명 룰 | MES 단일 룰 | moduleId == `mpn` 아님 |
| 화면식별자 (screenId) | commPermMng | 01 A.3 / A.4.1 (camelCase `{화면명}`) |
| pageName | commPermMng | 01 A.4.2 (MES: = screenId) |
| pageId | commPermMng | 01 A.4.3 (MES: = screenId) |
| serviceId | commPermMng | 01 A.4.4 |
| 페이지 유형 | **C 단일 마스터 그리드 + 상세 폼** (G + D 동시 존재 / GE = 0) | 분석 §3 (G-NNN 12 + D-NNN 26 + GE=0 + L=0) |
| 주요 API path (UI→BFF) | `POST /api/mcm/oasis/commPermMng/{action}` | 04 §A.2-3 |
| 주요 API path (BFF→BE) | `POST /oasis/commPermMng/{action}` | 04 §A.2-3 |
| Frontend 파일명 | `commPermMng.tsx` | 03 컨벤션 (MES: `{screenId}.tsx`) |
| tsup entry key | `pages/csa/commPermMng` | 01 A.4.6 (MES: `pages/{moduleGroup}/{pageName}`) |

---

## 2. 화면 영역 정의 (분석 §3.1 인용)

| 영역ID | 영역명 | xfdl 컨테이너 | 설명 |
|---|---|---|---|
| A-TITLE | 타이틀 영역 | `div_title` (xfdl:134) | 화면명 + 공통 topMenu (btn_search / btn_reset / btn_save / btn_close 4 기본 버튼) |
| A-FILTER | 조회조건 영역 | `div_search` (xfdl:142) | BIZ SYSTEM + PERMISSION ID + PERMISSION 명 + 사용 여부 |
| A-FOLD | 조회조건 접기 버튼 | `btn_fold` (xfdl:7) | B-001 (`btn_fold_onclick`) |
| A-MAIN | 메인 컨테이너 | `div_main` (xfdl:8) | 좌(그리드) + 우(상세) 분할 컨테이너 |
| A-MAIN-LEFT (= A-GRID) | Permission 마스터 그리드 영역 | `div_mainGrd` (xfdl:11) | G-001~G-012 + commonLeftButton (chk_check / btn_sum) + commonRightButton (행추가/삭제/복사/취소 4 버튼) |
| A-MAIN-RIGHT (= A-DETAIL) | Permission 상세 입력 폼 영역 | `div_mainDetail` (xfdl:72) | D-001~D-026 (PERMISSION ID / 명 / 설명 / BIZ SYSTEM / 사용여부 / 유효개시일 / 유효기한일 / 공통 / CUSTOM / POPUP / ACTION 권한 TextArea + 라벨/박스/Static) |
| A-BTN | 버튼 영역 | div_mainDetail 내 / div_main 상단 토글 | B-002 (공통 권한 팝업) / B-003 (CUSTOM 권한 팝업) / B-001 (접기 토글) — 3 버튼 |
| A-FOOTER | 하단 status 영역 | `div_bottom` (xfdl:6) | 공통 bottom status 메시지 |

> 본 화면은 표준 6 영역 (A-TITLE / A-FILTER / A-FOLD / A-MAIN / A-MAIN-LEFT / A-MAIN-RIGHT / A-BTN / A-FOOTER = 8 영역). A-MAIN-LEFT (Master 그리드) 와 A-MAIN-RIGHT (Detail 폼) 가 좌우 분할 (div_mainGrd right=520 / div_mainDetail width=500).

---

## 3. 조회조건 정의 (영역: A-FILTER)

### 3.1 조회조건 필드 (S-NNN — 분석 §3.2 그대로 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3.1 행 == 분석 §3.2 행 (As-Is 4 행 → **To-Be 3 행**, S-001 폐기) | ✓ |
| 입력 방식 enum (5값) | Combo / TextBox 만 사용 | ✓ |

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| ~~S-001~~ | ~~BIZ_SYSTEM_CODE~~ | ~~BIZ SYSTEM~~ | ~~Combo~~ | ~~N~~ | ~~`ds_lovSubSystem` LoV (`CommObjMngMapper.selectAppHostId` cross-module 호출), value="Y" text="Y" displaynulltext="전체" (xfdl:146)~~ | ~~App Host ID 단위 BIZ SYSTEM 필터 (검색조건)~~ → **To-Be 폐기** (cross-cutting 정책 #1) |
| S-002 | PERMISSION_ID | PERMISSION ID | TextBox | N | "부산역 CY" placeholder (As-Is xfdl:148 — To-Be 빈 값 정정) maxlength=100 | PERMISSION ID 부분 일치 검색 (대소문자 무시 — UPPER 비교, xml:27) |
| S-003 | PERMISSION_NM | PERMISSION 명 | TextBox | N | "부산역 CY" placeholder (As-Is xfdl:150 — To-Be 빈 값 정정) maxlength=100 | PERMISSION 명 부분 일치 검색 (대소문자 무시 — UPPER 비교, xml:30) |
| S-004 | USE_TP | 사용 여부 | Combo | N | `ds_cmbValidYn` hardcoded Y/N, value="Y" text="Y" index=0 (xfdl:152) | 사용 여부 필터 (Y/N — 정확 일치 비교, xml:33) |

### 3.2 조회 결과 (G-NNN 메인 그리드 — 분석 §3.3 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3.2 G 행 == 분석 §3.3 G 행 (As-Is 12 행 → **To-Be 11 행**, G-008 폐기) | ✓ |
| 표시명 1 enum 매칭 | 확정 한글 9 행 + 영문 표시 (PERMISSION ID/명 / ~~BIZ SYSTEM~~ / POPUP 버튼 / CUSTOM 버튼 권한 / ACTION 권한) — As-Is 1:1 보존, To-Be G-008 폐기 | ✓ |

| 컬럼ID | DB 컬럼명 (alias) | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 | 편집 (분기) | 필수 |
|---|---|---|---|---|---|---|---|
| G-001 | STATUS | 상태 | Nexacro auto row state icon (신규/수정/삭제) — band="left" 고정 | Center | imagecontrol | N | - |
| G-002 | PERMISSION_ID | PERMISSION ID | Permission ID (PK) | Left | text, autosizecol=limitmin | Y (신규 행만 — `ds_main_onrowposchanged` 분기, xfdl:453~457) | Y (fn_save 필수 — `gfn_dsRequired("PERMISSION_ID USE_TP")`, xfdl:431) |
| G-003 | PERMISSION_NM | PERMISSION명 | Permission 명 | Left | text, autosizecol=limitmin | Y (text) | N |
| G-004 | PERMISSION_COMMON | 공통 버튼 권한 | commonTop / commonTopCustom / commonRight 버튼 권한 (콤마 분리 추정) | Left | text, autosizecol=none | Y (text) | N |
| G-005 | PERMISSION_CUSTOM | CUSTOM 버튼 권한 | CUSTOM 버튼 권한 (콤마 분리 추정) | Left | text, autosizecol=none | Y (text) | N |
| G-006 | POPUP_BTN | POPUP\r\n버튼 (멀티라인) | POPUP 화면 버튼 권한 | Left | text, autosizecol=limitmin | Y (text) | N |
| G-007 | PERMISSION_ACTION | ACTION 권한 | ACTION 권한 (메뉴/기능 단위) | Left | text, autosizecol=none | Y (text) | N |
| ~~G-008~~ | ~~BIZ_SYSTEM_CODE~~ | ~~BIZ\r\nSYSTEM (멀티라인)~~ | ~~App Host ID (소속 시스템)~~ | ~~Center~~ | ~~text, autosizecol=limitmin~~ | ~~Y (text)~~ | ~~N~~ → **To-Be 폐기** (cross-cutting 정책 #1) |
| G-009 | USE_TP | 사용\r\n여부 (멀티라인) | Y/N | Center | text, autosizecol=limitmin | Y (text) | Y (fn_save 필수 — xfdl:431) |
| G-010 | START_ACTIVE_DATE | 유효개시일 | yyyy-MM-dd | Center | displaytype=date, calendardateformat=yyyy-MM-dd, autosizecol=limitmin | Y (date) | N |
| G-011 | END_ACTIVE_DATE | 유효기한일 | yyyy-MM-dd | Center | displaytype=date, calendardateformat=yyyy-MM-dd, autosizecol=limitmin | Y (date) | N |
| G-012 | PERMISSION_DESC | 권한 설명 | Permission 설명 | Left | text, autosizecol=limitmin | Y (text) | N |

> 그리드 옵션: `selecttype="cell"`, `scrollbartype="auto"`, `autosizingtype="col"`, `cellsizingtype="col"`, `cellmovingtype="col"`, `cellsizebandtype="allband"`, head Row 1 size=40 + body Row 1 size=24, G-001 band="left" 고정.
>
> 이벤트: `onheadclick="div_main_div_mainGrd_grd_main_onheadclick"` → `gfn_commonOnheadclick` 공통 정렬 (xfdl:462~465).

### 3.3 LoV / 코드값 (LV-NNN — 분석 §10 인용)

| ID | 코드 그룹 / 출처 | As-Is 값 | 표시명 | 사용 위치 | 비고 |
|---|---|---|---|---|---|
| LV-001 | xfdl 정적 Dataset `ds_cmbValidYn` (hardcoded Y/N) | Y / N | Y / N (codecolumn=condCd, datacolumn=condNm 동일) | S-004 (사용 여부 콤보) | `gfn_setFirstRow(ds_cmbValidYn, "", "", "condCd", "condNm")` 첫 행 추가 (xfdl:247) |
| LV-002 | xfdl Radio inner Dataset (`edt_use_tp`) (hardcoded Y/Yes + N/No) | Y / N | Yes / No (codecolumn=Y/N → datacolumn=Yes/No) | D-010 (Radio 사용 여부, vertical) | Radio Component 내부 hardcoded 2 행 |
| ~~LV-003~~ | ~~cross-module `CommObjMngMapper.selectAppHostId` → `ds_lovSubSystem`~~ | ~~(외부 결과 — APP_HOST_ID)~~ | ~~(외부 결과 — APP_HOST_ID = codecolumn = datacolumn)~~ | ~~S-001 (검색조건 BIZ SYSTEM) / D-008 (상세 입력 BIZ SYSTEM)~~ | ~~`fn_lov` (xfdl:256) → BPMN `lov` 분기~~ → **To-Be 폐기** (cross-cutting 정책 #1) |

---

## 4. 상세/라인 필드 정의 (영역: A-MAIN-RIGHT)

### 4.1 상세 폼 (D-NNN — 분석 §3.5 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §4.1 D 행 == 분석 §3.5 D 행 (As-Is 26 행 → **To-Be 24 행**, D-007 / D-008 폐기) | ✓ |
| 입력 방식 enum | TextBox / TextArea / ~~Combo~~ / Radio / Calendar / Static / Button (To-Be Combo 미사용 — D-008 폐기 후 Detail 영역에는 Combo 없음) | ✓ |

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 바인딩 (BindItem) | 필수 (cssclass `Essential`) | 기본값 / maxlength | 설명 |
|---|---|---|---|---|---|---|---|
| D-001 | (라벨) | "PERMISSION ID" | Static (Edit readonly, cssclass `edi_WF_LabelFirstE` — E = Essential 라벨) | - | (라벨 자체 E) | - | 라벨 (xfdl:85) |
| D-002 | PERMISSION_ID | (입력) | TextBox (cssclass `Essential`) | item0 → ds_main.PERMISSION_ID | Y | maxlength=90, inputtype=normal, inputmode=normal, "부산역 CY" placeholder (xfdl:92) | PK — 신규 행 enable / 기존 행 disable (`ds_main_onrowposchanged`, xfdl:454~457) |
| D-003 | (라벨) | "PERMISSION명" | Static (Edit readonly, cssclass `edi_WF_Label`) | - | - | - | 라벨 (xfdl:83) |
| D-004 | PERMISSION_NM | (입력) | TextBox | item4 → ds_main.PERMISSION_NM | N | maxlength=100, inputtype=normal, "부산역 CY" placeholder (xfdl:94) | Permission 명 |
| D-005 | (라벨) | "PERMISSION 설명" | Static (Edit readonly, cssclass `edi_WF_Label`) | - | - | - | 라벨 (xfdl:86) |
| D-006 | PERMISSION_DESC | (입력) | TextBox | item8 → ds_main.PERMISSION_DESC | N | maxlength=100, inputtype=normal, "부산역 CY" placeholder (xfdl:114) | Permission 설명 |
| ~~D-007~~ | ~~(라벨)~~ | ~~"BIZ SYSTEM"~~ | ~~Static (Edit readonly, cssclass `edi_WF_LabelE` — E = Essential 라벨)~~ | - | ~~(라벨 자체 E)~~ | - | ~~라벨 (xfdl:126)~~ → **To-Be 폐기** (cross-cutting 정책 #1 — Essential 라벨 제거) |
| ~~D-008~~ | ~~BIZ_SYSTEM_CODE~~ | ~~(선택)~~ | ~~Combo (cssclass `Essential`)~~ | ~~item10 → ds_main.BIZ_SYSTEM_CODE~~ | ~~Y~~ | ~~innerdataset=`ds_lovSubSystem`, codecolumn=`APP_HOST_ID`, datacolumn=`APP_HOST_ID`, index=0, displayrowcount=10, text="내부 neXacro" (xfdl:127)~~ | ~~App Host ID 단일 선택~~ → **To-Be 폐기** (cross-cutting 정책 #1 — Essential cssclass + Bind item10 + ds_lovSubSystem 모두 제거) |
| D-009 | (라벨) | "사용 여부" | Static (Edit readonly, cssclass `edi_WF_LabelFirst`) | - | - | - | 라벨 (xfdl:87) |
| D-010 | USE_TP | (선택) | Radio (vertical) | item6 → ds_main.USE_TP | (fn_save 시 필수 — xfdl:431) | innerdataset (Y/Yes + N/No 2 행 hardcoded), value="Y", index=0 (xfdl:95~112) | Y/N 라디오 (수직 배치) |
| D-011 | (라벨) | "유효 개시일" | Static (Edit readonly, cssclass `edi_WF_Label`) | - | - | - | 라벨 (xfdl:82) |
| D-012 | START_ACTIVE_DATE | (입력) | Calendar | item7 → ds_main.START_ACTIVE_DATE | N | dateformat=yyyy-MM-dd, usetrailingday=true (xfdl:113) | 신규 default `gfn_today()` (xfdl:383) — fn_run 에서 8자 truncate (xfdl:313) |
| D-013 | (라벨) | "유효 기한일" | Static (Edit readonly, cssclass `edi_WF_Label`) | - | - | - | 라벨 (xfdl:91) |
| D-014 | END_ACTIVE_DATE | (입력) | Calendar | item2 → ds_main.END_ACTIVE_DATE | N | dateformat=yyyy-MM-dd, usetrailingday=true (xfdl:93) | 신규 default `"99991231"` (xfdl:384) — fn_run 에서 8자 truncate (xfdl:314) |
| D-015 | (라벨) | "공통 버튼 권한\r\n(commonTop, commonTopCustom, \r\ncommonRight)" | Static (cssclass `stc_WF_Label1`) | - | - | - | 멀티라인 라벨 (xfdl:119) |
| D-016 | PERMISSION_COMMON | (입력) | TextArea | item1 → ds_main.PERMISSION_COMMON | N | - | 공통 버튼 권한 (B-002 팝업 결과로 set_value) |
| D-017 | (보조 버튼) | (공통버튼 권한 찾기) | Button (cssclass `btn_WF_Find`) | - | - | - | B-002 — `gfn_openPopup("modal", "commonPermBtnPopup", url, {btnChk:"common"}, "", "fn_PermBtnCallBack")` (xfdl:472~476) |
| D-018 | (라벨) | "CUSTOM 버튼 권한" | Static (Edit readonly, cssclass `edi_WF_Label`) | - | - | - | 라벨 (xfdl:84) |
| D-019 | PERMISSION_CUSTOM | (입력) | TextArea | item5 → ds_main.PERMISSION_CUSTOM | N | - | CUSTOM 버튼 권한 (B-003 팝업 결과로 set_value) |
| D-020 | (보조 버튼) | (CUSTOM 권한 찾기) | Button (cssclass `btn_WF_Find`) | - | - | - | B-003 — `gfn_openPopup("modal", "commonPermBtnPopup", url, {btnChk:"custom"}, "", "fn_PermBtnCallBack")` (xfdl:478~482) |
| D-021 | (라벨) | "POPUP 버튼" | Static (Edit readonly, cssclass `edi_WF_Label`) | - | - | - | 라벨 (xfdl:89) |
| D-022 | POPUP_BTN | (입력) | TextArea | item3 → ds_main.POPUP_BTN | N | - | POPUP 버튼 권한 |
| D-023 | (라벨) | "ACTION 권한" | Static (Edit readonly, cssclass `edi_WF_Label`) | - | - | - | 라벨 (xfdl:124) |
| D-024 | PERMISSION_ACTION | (입력) | TextArea | item9 → ds_main.PERMISSION_ACTION | N | - | ACTION 권한 |
| D-025 | (영역 라벨) | "상세 정보" | Static (Edit readonly, cssclass `edi_WF_Title1`) | - | - | - | div_mainDetail 상단 타이틀 (xfdl:118) |
| D-026 | (영역 라벨) | "조회 결과" | Static (Edit readonly, cssclass `edi_WF_Title1`) | - | - | - | div_mainGrd 상단 좌측 타이틀 (xfdl:67) |

### 4.2 라인 그리드 (L-NNN)

해당 없음 — 본 화면은 단일 마스터 그리드 + 상세 입력 폼 (D-NNN) 구조. 라인 그리드 (L = 0). 분석 §3.4 GE = 0 / D-NNN 26 (분석 §3.5) 인용.

### 4.3 Detail 영역 활성/비활성 동작 (분석 §10.1 ST-008 인용)

| 시점 | 동작 |
|---|---|
| onload 초기 | `gfn_setEnable("this.div_main.form.div_mainDetail","false")` 비활성 (xfdl:250) |
| searchCmPerm 콜백 + 0 건 | (`fn_callBack` 분기) — getRowCount() > 0 인 경우만 활성화 (xfdl:336~338) |
| searchCmPerm 콜백 + 1+ 건 | `gfn_setEnable("...div_mainDetail","true")` 활성 (xfdl:337) |
| fn_rowAdd | `gfn_setEnable("...div_mainDetail","true")` 활성 (xfdl:388) |
| fn_rowCopy | `gfn_setEnable("...div_mainDetail","true")` 활성 (xfdl:398) |
| fn_rowDelete 후 행 0 | `gfn_setEnable("...div_mainDetail","false")` 비활성 (xfdl:415) |

---

## 5. 버튼·액션 정의 (영역: A-BTN)

### 5.1 화면 직접 정의 버튼 (B-NNN — 분석 §4.1 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §5.1 B 행 == 분석 §4.1 B 행 (3 행) | ✓ |
| action enum 분기 | 3 / popup / popup / (client 전용) | ✓ |

| 버튼ID | 위치 | 버튼명 | xfdl id | onclick 핸들러 | To-Be action | 동작 enum |
|---|---|---|---|---|---|---|
| B-001 | div_main 상단 (접기 토글) | (접기 토글) | `btn_fold` | `btn_fold_onclick` (xfdl:467) | - (클라이언트 전용) | `gfn_fold(this, div_search, div_main, btn_fold)` — div_search 접기/펴기 토글 |
| B-002 | div_mainDetail 내 (D-016 우측) | (공통버튼 권한 찾기) | `btn_common_find` | `div_main_div_mainDetail_btn_common_find_onclick` (xfdl:472) | popup | `gfn_openPopup("modal", "commonPermBtnPopup", "_com_popup::commonPermBtnPopup.xfdl", {btnChk:"common"}, "", "fn_PermBtnCallBack")` |
| B-003 | div_mainDetail 내 (D-019 우측) | (CUSTOM 권한 찾기) | `btn_custom_find` | `div_main_div_mainDetail_btn_custom_find_onclick` (xfdl:478) | popup | `gfn_openPopup("modal", "commonPermBtnPopup", "_com_popup::commonPermBtnPopup.xfdl", {btnChk:"custom"}, "", "fn_PermBtnCallBack")` |

### 5.2 공통 topMenu / leftMenu / rightMenu 버튼 (EX — 분석 §4.3 인용)

| EX-ID | 등록 위치 | 호출 함수 | 등록 버튼 | 트리거 → 핸들러 |
|---|---|---|---|---|
| EX-001 (topMenu) | `div_title.div_topMenu` (xfdl:138) | `fn_commonTop_onload(this, "", new Array(["btn_search"],["btn_reset"],["btn_save"],["btn_close"]), false, "")` (xfdl:225~229) | btn_search / btn_reset / btn_save / btn_close (4 기본 버튼) | btn_search → `fn_search()` / btn_reset → `fn_reset()` / btn_save → `fn_save()` / btn_close → `fn_close()` |
| EX-002 (leftMenu) | `div_main.div_mainGrd.div_leftMenu` (xfdl:68) | `fn_commonLeft_onload(this, grd_main, div_leftMenu, new Array("chk_check","btn_sum"), "")` (xfdl:231~235) | chk_check / btn_sum (2 버튼) | (외부 처리 — 체크박스 / sum 행) |
| EX-003 (rightMenu) | `div_main.div_mainGrd.div_rightMenu` (xfdl:14) | `fn_commonRight_onload(this, "", new Array(["btn_rowAdd"],["btn_rowDelete"],["btn_rowCopy"],["btn_rowCancel"]), false, "")` (xfdl:237~241) | btn_rowAdd / btn_rowDelete / btn_rowCopy / btn_rowCancel (4 기본 버튼) | btn_rowAdd → `fn_rowAdd()` / btn_rowDelete → `fn_rowDelete()` / btn_rowCopy → `fn_rowCopy()` / btn_rowCancel → `fn_rowCancel()` |
| EX-004 (footer) | `div_bottom` (xfdl:6) | `fn_commonBottomStatus_msg(...)` (xfdl:334 / 343) | (외부 표시 전용) | (외부 처리 — status 메시지 표시) |

### 5.3 그리드 셀 인라인 버튼 (GB-NNN)

해당 없음 — 본 화면의 Grid 컬럼 정의에 ButtonField / displaytype="button" 셀 ✗ (분석 §4.2).

---

## 6. 검증 규칙 (As-Is xfdl Script 인용)

### 6.1 fn_save 시 필수 입력 검증 (분석 §4.4 #13 인용)

| 순서 | 검증 | 위치 | 미통과 시 |
|---|---|---|---|
| 1 | `gfn_isDatasetChanged(ds_main)` true | xfdl:425 | "변경된 데이터가 없습니다." confirm + return false |
| 2 | `gfn_dsRequired(grd_main, "PERMISSION_ID USE_TP")` true | xfdl:431 | (gfn 표준 — 미입력 셀로 focus 이동 + 경고) |
| 3 | confirm("저장하시겠습니까?") rtn true | xfdl:441 | (rtn false 시 저장 중단) |

> **결정 — 정정 완료 (2026-05-31)**: `gfn_dsRequired` 의 필수 컬럼 enum 이 `"PERMISSION_ID USE_TP"` 만 (xfdl:431). As-Is D-008 (BIZ_SYSTEM_CODE) 가 Essential cssclass 였으나 (xfdl:127) — **cross-cutting 정책 #1 (2026-05-31) 로 D-008 자체 폐기**. 따라서 보강 후보 항목 자체 소거 — To-Be 필수 컬럼 = `PERMISSION_ID USE_TP` 그대로 유지.

### 6.2 fn_rowDelete 시 ROLE 매핑 존재 검증 (분석 §4.4 #11 인용)

| 검증 | 위치 | 미통과 시 |
|---|---|---|
| `ds_main.getColumn(nRow, "ROLE_ID") != null` | xfdl:405~407 | "연결된 역할이 존재합니다. 제외 후 삭제 하세요?" 경고 + return (삭제 차단) |

> 본 검증의 ROLE_ID 값은 `selectCommPermMng` SQL 의 scalar subquery (xml:19~22) 결과 — TB_MCM_SEC_ROLE_MAPPING 에 매핑이 있는 경우 ROLE_ID 1 건이 채워짐.

### 6.3 deleteCommPermMng DB 안전장치 (분석 §6 #4 인용)

| 검증 | 위치 |
|---|---|
| `NOT EXISTS (SELECT 'X' FROM TB_MCM_SEC_ROLE_MAPPING B WHERE B.PERMISSION_ID = A.PERMISSION_ID)` | xml:92~95 |

> 본 SQL 의 NOT EXISTS check 는 fn_rowDelete 의 클라이언트 검증을 우회한 경우에도 DB 레벨에서 ROLE 매핑이 있는 PERMISSION 의 DELETE 를 silent skip 처리 (rowcount = 0).

### 6.4 ds_main_onrowposchanged — PK 편집 제어 (분석 §4.4 #15 인용)

| 조건 | 동작 |
|---|---|
| 새 row 의 PERMISSION_ID null 아니고 rowType != 2 (신규 아님) | `div_mainDetail.edt_permission_id.set_enable(false)` — PK 편집 차단 |
| 그 외 (PERMISSION_ID null 또는 신규 행) | `div_mainDetail.edt_permission_id.set_enable(true)` — PK 입력 허용 |

### 6.5 fn_run saveCmPerm 시 date 8자 truncate (분석 §4.4 #5 인용)

| 처리 | 위치 |
|---|---|
| `ds_main.set_enableevent(false)` | xfdl:308 |
| 모든 행 (rowType != 1, 삭제 아님) loop: START_ACTIVE_DATE / END_ACTIVE_DATE 가 8자 초과면 substring(0,8) | xfdl:309~316 |
| `ds_main.set_enableevent(true)` | xfdl:317 |

> Nexacro Calendar 의 DateTime 값이 millisecond 까지 포함될 때 Mapper 가 8자 (yyyyMMdd) 만 사용하므로 truncate (As-Is 주석 "21.05.31 최규찬" 참조).

---

## 7. 상태값 (ST-NNN — 분석 §10.1 인용)

| ID | 상태값 | 의미 | 영향 영역 |
|---|---|---|---|
| ST-001 | `USE_TP = "Y"` / `"N"` | 사용여부 (Y/N) | G-009 / D-010 / S-004 + fn_save 필수 + fn_rowAdd default "Y" |
| ST-002 | `START_ACTIVE_DATE = gfn_today()` (신규 default) | 신규 행 유효개시일 = 오늘 | fn_rowAdd default 세트 |
| ST-003 | `END_ACTIVE_DATE = "99991231"` (신규 default) | 신규 행 유효기한일 = 9999-12-31 (영구) | fn_rowAdd default 세트 |
| ST-004 | `ds_main.getRowType(currow)` | Nexacro RowType: 1=삭제 / 2=신규 / 4=수정 / 8=수정후삭제 | (1) ds_main_onrowposchanged: 신규만 PK 편집 (2) fn_run saveCmPerm: rowType != 1 행만 date truncate |
| ST-005 | `STATUS` (G-001, displaytype=imagecontrol, band="left") | Nexacro auto row state icon | G-001 표시 전용 |
| ST-006 | `ROLE_ID != null` (scalar subquery 결과) | 연결된 ROLE 존재 마킹 | fn_rowDelete 차단 + deleteCommPermMng NOT EXISTS 안전장치 |
| ST-007 | `gfn_isDatasetChanged(ds_main)` | 변경 데이터 존재 여부 | fn_save 첫 검증 — false 면 return |
| ST-008 | Detail 영역 활성/비활성 (`gfn_setEnable("...div_mainDetail", "true"/"false")`) | 마스터 row 0 건 / 1+ 건에 따라 div_mainDetail 영역 활성화 | onload / searchCmPerm 콜백 / fn_rowAdd / fn_rowCopy / fn_rowDelete |

---

## 8. 권한 / 접근 제어

본 화면은 PERMISSION 마스터 자체를 관리하는 시스템 관리자 전용 화면이다 (csa 그룹 — 시스템관리).

| 항목 | 결정 |
|---|---|
| 화면 자체 권한 분기 | ✗ — As-Is xfdl Script 내 권한 분기 코드 ✗ (분석 §12 명시) |
| To-Be 권한 모델 | 외부 권한 프로세스 (commRoleMng / commUserMng 등) 위임 — 본 화면 진입 자체가 시스템 관리자 PERMISSION 보유자에게만 허용 |

---

## 9. 팝업 사용 (P-NNN — 분석 §5 인용)

| 팝업ID | 유형 | 이름 | 호출 위치 | 전달 파라미터 (oArg) | 콜백 | 반환 처리 |
|---|---|---|---|---|---|---|
| P-001 | modal | "commonPermBtnPopup" (공통 버튼 권한 선택) | B-002 (xfdl:475) | `{btnChk: "common"}` | `fn_PermBtnCallBack` (xfdl:484) | `rtVal.rtnValeChk == "common"` 분기 → `txa_permission_common.set_value(rtVal.rtnVale)` (D-016 채움) |
| P-002 | modal | "commonPermBtnPopup" (CUSTOM 버튼 권한 선택) | B-003 (xfdl:481) | `{btnChk: "custom"}` | `fn_PermBtnCallBack` (xfdl:484) | `rtVal.rtnValeChk == "custom"` 분기 → `txa_permission_custom.set_value(rtVal.rtnVale)` (D-019 채움) |

> 팝업 url: `_com_popup::commonPermBtnPopup.xfdl` (외부 공통 팝업 — 본 화면 분석 범위 외). 본 화면에서 호출되는 다른 외부 화면 ✗ (분석 §5).

---

## 10. 메시지 / 알림

### 10.1 fn_callBack 메시지 (분석 §4.4 #6 인용)

| sSvcId 분기 | 메시지 위치 | 메시지 내용 |
|---|---|---|
| searchCmPerm | `fn_commonBottomStatus_msg("${rowcount}건 조회 되었습니다.")` (xfdl:334) | "${N}건 조회 되었습니다." |
| saveCmPerm | `fn_commonBottomStatus_msg("${rowcount}건 조회 되었습니다.")` (xfdl:343) **+** `gfn_message("", "", "성공적으로 저장되었습니다.", "confirm", "확인", fn_msgSuccessSave)` (xfdl:350) → confirm 콜백 rtn true → `fn_run("searchCmPerm")` 재조회 | (1) "${N}건 조회 되었습니다." (As-Is 그대로 — 저장 콜백인데 "조회" 메시지) + (2) "성공적으로 저장되었습니다." (3) 확인 클릭 → 재조회 |
| lov | (As-Is xfdl:356~357 주석만 — 처리 ✗) | (없음) |
| default | (없음) | (없음) |

> **결정 — As-Is 보존**: saveCmPerm 콜백의 "조회" 메시지 (분석 §12 결정 누적). To-Be cleanup 후보 — 사용자 결정 위임.

### 10.2 fn_save / fn_rowDelete / fn_rowCopy 사용자 메시지

| 메서드 | 위치 | 메시지 |
|---|---|---|
| fn_save | xfdl:426 | "변경된 데이터가 없습니다." (confirm — 변경 없음 시) |
| fn_save | xfdl:441 | "저장하시겠습니까?" (confirm — 저장 전) |
| fn_rowCopy | xfdl:394 | "선택 행이 없습니다." (warning — rowposition < 0 시) |
| fn_rowDelete | xfdl:408 | "연결된 역할이 존재합니다. 제외 후 삭제 하세요?" (warning — ROLE 매핑 존재 시) |

---

## 11. 데이터 흐름 (As-Is gfn_transaction → BPMN action 인용)

### 11.1 search (searchCmPerm) 흐름

| 단계 | 처리 |
|---|---|
| 1 | EX-001 btn_search 클릭 → `fn_search()` (xfdl:368) |
| 2 | `fn_run("searchCmPerm")` (xfdl:369) |
| 3 | `fn_beforeRun("searchCmPerm")` — `ds_main.clearData()` + `ds_main.filter("")` (xfdl:272~275) |
| 4 | sArgs = `gfn_scanOpenerComponent(div_search.form)` (S-001~S-004 4 값 자동 인입, xfdl:301) |
| 5 | `gfn_transaction("searchCmPerm", "csa::CommPermMng", "", "ds_main=ds_main", sArgs, "fn_callBack")` (xfdl:323) |
| 6 | BPMN: StartEvent → ExclusiveGateway (name="searchCmPerm") → Task_00oihyb (CommonSelectTask) → `selectCommPermMng` (xml:7) → EndEvent |
| 7 | 결과 `ds_main` 으로 매핑 (BPMN resultKey="ds_main" → 클라이언트 ds_main) |
| 8 | `fn_callBack("searchCmPerm", ...)` → "${N}건 조회 되었습니다." + getRowCount > 0 시 Detail 영역 활성화 |

### 11.2 save (saveCmPerm) 흐름

| 단계 | 처리 |
|---|---|
| 1 | EX-001 btn_save 클릭 → `fn_save()` (xfdl:423) |
| 2 | 검증 3 단계 (§6.1) — gfn_isDatasetChanged / gfn_dsRequired / confirm |
| 3 | confirm rtn true → `fv_row = ds_main.rowposition` 백업 → `fn_run("saveCmPerm")` (xfdl:438) |
| 4 | `fn_run("saveCmPerm")` — date 8자 truncate (§6.5) |
| 5 | sInDs = "ds_main=ds_main:U" (변경된 행만 — Nexacro Update 모드) |
| 6 | `gfn_transaction("saveCmPerm", "csa::CommPermMng", "ds_main=ds_main:U", "", "", "fn_callBack")` |
| 7 | BPMN: StartEvent → ExclusiveGateway (name="saveCmPerm") → Task_1dh8dal (CommonMultiSaveTask) → 행마다 `nativeeditor_status` 분기: |
|   | - "inserted" → `insertCommPermMng` (xml:42) |
|   | - "updated" → `updateCommPermMng` (xml:73) |
|   | - "deleted" → `deleteCommPermMng` (xml:89) — NOT EXISTS 안전장치 (xml:92~95) |
| 8 | 결과 cnt 누적 → EndEvent |
| 9 | `fn_callBack("saveCmPerm", ...)` → "${N}건 조회 되었습니다." (As-Is 그대로) + "성공적으로 저장되었습니다." confirm + rtn true → `fn_run("searchCmPerm")` 재조회 |

### 11.3 ~~lov 흐름 (onload 1회)~~ — **To-Be 폐기** (cross-cutting 정책 #1, 2026-05-31)

> **As-Is 인용 (보존)**: Form onload → `fn_lov()` (xfdl:244 → 253 → 262) → `gfn_transaction("lov", ...)` → BPMN `lov` 분기 → Task_08v4ryn (CommonSelectTask) → cross-module `CommObjMngMapper.selectAppHostId` → ds_lovSubSystem.
>
> **To-Be**: BIZ_SYSTEM_CODE 컬럼 폐기로 BIZ SYSTEM 콤보 (S-001 / D-008) 자체가 제거되므로 LoV 호출 불요. lov action / `fn_lov` 메서드 / `fn_callBack` 의 lov 분기 / Task_08v4ryn / SequenceFlow_1dd2kqv·0xqzbh4 / cross-module sqlKey 모두 폐기. `fn_onload` 마지막 줄 `this.fn_lov();` 호출도 삭제.

### 11.4 popup 흐름 (B-002 / B-003)

| 단계 | 처리 |
|---|---|
| 1 | B-002 / B-003 클릭 → `div_main_div_mainDetail_btn_common_find_onclick` / `div_main_div_mainDetail_btn_custom_find_onclick` |
| 2 | `oArg = {btnChk: "common"}` / `{btnChk: "custom"}` |
| 3 | `gfn_openPopup("modal", "commonPermBtnPopup", "_com_popup::commonPermBtnPopup.xfdl", oArg, "", "fn_PermBtnCallBack")` |
| 4 | 팝업 모달 표시 → 사용자 선택 → 팝업 close 시 setReturn(`{rtnValeChk, rtnVale}`) |
| 5 | `fn_PermBtnCallBack` — `rtVal = gfn_getReturn()` (xfdl:486) |
| 6 | `rtVal.rtnValeChk == "common"` 분기 → `txa_permission_common.set_value(rtVal.rtnVale)` (D-016 채움) |
| 7 | `rtVal.rtnValeChk == "custom"` 분기 → `txa_permission_custom.set_value(rtVal.rtnVale)` (D-019 채움) |

---

## 12. To-Be 변환 사항 (분석 §11 / §11.1 인용)

| 자산 | As-Is | To-Be |
|---|---|---|
| 권한 마스터 테이블 | `TB_MCM_SEC_PERM` (스키마 prefix ✗) | `MCMAPUSER.TB_MCM_SEC_PERM` |
| Role 매핑 테이블 | `TB_MCM_SEC_ROLE_MAPPING` (스키마 prefix ✗) | `MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING` |
| **Entity 명명 (cross-cutting 정책 #6 A안 — 2026-05-31)** | (해당 없음 — Java UserTask ✗) | **`SecPerm`** (TB_MCM_SEC_PERM 1:1 직역). `SecPermButton` Entity **미생성** (As-Is mui 에 별도 button 테이블 ✗). Role 매핑 Entity = `SecRoleMapping` (read-only, commRoleMng owner) |
| Java 패키지 | (해당 없음 — Java UserTask ✗) | Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 / Service·DTO = `com.dongkuk.dmes.mcm.csa.commPermMng.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1) |
| Mapper namespace | `CommPermMngMapper` | JPA Repository 흡수 (`SecPermRepository`) — Mapper.xml.asis 는 보존 |
| BPMN process id / name | `sample1` / `menuInfor` (As-Is 잔존) | `commPermMng` / `commPermMng` |
| xfdl titletext | "PERMISSON 관리" (오타) | "PERMISSION 관리" |
| SELECT BIZ_SYSTEM_CODE 중복 | xml:18 / 23 중복 | **컬럼 자체 폐기** (cross-cutting 정책 #1) — SELECT 절에서 모두 제거 |
| `END_ACTIVE_DATE` 신규 default | `"99991231"` (8자 String) | `LocalDate.of(9999,12,31)` 또는 `'9999-12-31'` |
| audit 컬럼 | As-Is `ref_Audit` fragment 17 컬럼 (xml:55 / 69 / 85) | cactus-core `CactusAuditEntity` 9 컬럼 — JPA `@PrePersist` / `@PreUpdate` 자동 |
| Oracle `\|\|` 문자열 결합 | xml:27 / 30 | MSSQL `+` 또는 `CONCAT(...)` |
| `UPPER(...)` | xml:27 / 30 | MSSQL `UPPER(...)` 동일 |
| `ROWNUM = 1` | xml:22 | MSSQL `SELECT TOP 1` (scalar subquery) |
| `NOT EXISTS` | xml:92~95 | MSSQL 동일 |
| `<where>` + `<if>` dynamic SQL | xml:25~38 | MSSQL 동일 (MyBatis 레벨) — 단 BIZ_SYSTEM_CODE `<if>` 절 (xml:36) 폐기로 4 절 → 3 절 |
| ~~cross-module sqlKey~~ | bpmn:65 (`CommObjMngMapper.selectAppHostId`) | **To-Be 폐기** (cross-cutting 정책 #1) — BIZ_SYSTEM_CODE 컬럼 폐기로 lov action / Task_08v4ryn / SequenceFlow_1dd2kqv·0xqzbh4 / cross-module 호출 모두 제거 |
| **BIZ_SYSTEM_CODE 컬럼 화면 사용 (cross-cutting 정책 #1)** | xfdl 8 hit (S-001 / D-007 / D-008 / G-008 / DS-001 / DS-003 / Bind item10 / fn_lov) + xml 5 hit (xml:18/23 SELECT 중복 / xml:36 WHERE / xml:51,65 INSERT / xml:81 UPDATE) + BPMN 3 hit (Task_08v4ryn / SequenceFlow_1dd2kqv / SequenceFlow_0xqzbh4) | **모두 To-Be 폐기** — UI 4 / DS 2 / Bind 1 / Script 1 / SQL 5 / BPMN 3 = 16 hit 제거 |
| Optimistic Locking | (해당 없음 — last-write-wins) | cactus-core `VER` (@Version) 자동 |

---

## 13. 산출물 정합 (분석 §13 인용)

| 항목 | 분석리포트 §X | 본 기능설계서 §Y |
|---|---|---|
| 화면 식별자 | §1 | §1.1 / §1.2 |
| 영역 | §3.1 (7 영역) | §2 (8 영역 — A-FOLD / A-BTN 분리) |
| 조회조건 | §3.2 (S **As-Is 4 → To-Be 3** 행, S-001 폐기) | §3.1 (As-Is 4 → To-Be 3 행) |
| 마스터 그리드 | §3.3 (G **As-Is 12 → To-Be 11** 행, G-008 폐기) | §3.2 (As-Is 12 → To-Be 11 행) |
| 상세 | §3.5 (D **As-Is 26 → To-Be 24** 행, D-007 / D-008 폐기) | §4.1 (As-Is 26 → To-Be 24 행) |
| 라인 그리드 | §3.4 (GE 0) | §4.2 (해당 없음) |
| 버튼 | §4.1 (B 3 행) | §5.1 (3 행) + §5.2 EX 4 행 |
| SQL | §6 (자체 4 + ~~cross-module 1~~ 폐기 — To-Be 자체 4) | §11 (action 별 SQL 분기, lov 폐기) |
| BPMN | §8 (**As-Is 6 노드 / 7 flow / 3 action → To-Be 5 노드 / 5 flow / 2 action**) | §11 (action 별 흐름, lov 폐기) |
| Java UserTask | §7 (해당 없음) | §1.1 (해당 없음) |
| 팝업 | §5 (P 2 행) | §9 (2 행) |
| 코드값 | §10 (LV **As-Is 3 → To-Be 2** 행, LV-003 폐기) | §3.3 (As-Is 3 → To-Be 2 행) |
| 상태값 | §10.1 (ST 8 행) | §7 (8 행) |

> 본 §13 모든 행수 일치 ✓ — 분석리포트 인용 정합 완성.

### §6.14 Phase 2 종료 자동 고해성사 4 질문

| # | 질문 | 답변 |
|---:|---|---|
| 1 | 14항 위반? | No — 분석리포트 §X 행수 1:1 인용 (As-Is S 4 / G 12 / D 26 / B 3 / P 2 / LV 3 / ST 8 → To-Be S 3 / G 11 / D 24 / B 3 / P 2 / LV 2 / ST 8 — cross-cutting 정책 #1 반영) |
| 2 | 검증 안 한 부분? | No — §13 산출물 정합 표 11 행 모두 분석리포트 §와 1:1 매칭 검증 (To-Be count 동기화) |
| 3 | 그대로 수용? | No — 신규 추가 0 (분석리포트 §0.1.3 단일 원천 원칙 준수). As-Is 오타 (xfdl titletext / BPMN process id / SELECT 중복) 는 §12 To-Be 변환점에 분석리포트 §11 / §11.1 인용. cross-cutting 정책 #1·#6 (2026-05-31) 적용 행 §12 누적 |
| 4 | 임의 합리화? | No — Q-001 (DMES Excel DDL) 은 분석리포트 §2 / §9 / §12 명시. 본 기능설계서는 분석리포트 §9 카탈로그 인용. BIZ_SYSTEM_CODE 폐기 / Entity SecPerm 명명 결정은 분석리포트 §11 / §12 cross-cutting 정책 항목 인용 |

> 4 질문 모두 No. Phase 2 통과 (cross-cutting 정책 #1·#6 적용 2026-05-31).
