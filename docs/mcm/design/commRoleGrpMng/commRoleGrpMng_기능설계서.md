---
screenId: commRoleGrpMng
asIsId: CommRoleGrpMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# mcm — 역할 그룹 관리 기능설계서

> **인용 정본**: 본 문서의 모든 본문은 `commRoleGrpMng_분석리포트.md` 의 §1~§13 인용. 자체 추가 ✗. 행수 / ID / 표시명 / SQL ID / BPMN flow / action enum 모두 분석리포트와 1byte 일치.
> **환경 제약**: 분석리포트 §0 인용 — Runner / R14-Step0 / manifest 미적용 (사용자 결정). WinForms 전제 항목은 mui 등가물로 매핑. Java UserTask 자산 부재 — 분석리포트 §7 / §0 / §2 명시.

---

## 1. 화면 개요

### 1.1 업무/설계 측면 (분석 §1 인용)

| 항목 | 내용 |
|---|---|
| **화면명** | 역할 그룹 관리 |
| **화면 식별자** | commRoleGrpMng |
| **모듈** | mcm (csa 그룹) |
| **화면 목적** | 시스템관리(csa) 영역의 역할 그룹(Role Group) 마스터를 관리한다. 역할 그룹별 역할(Role) 매핑을 셔틀 UI로 추가/제외하여 사용자 권한 구조의 중간 계층을 정의한다. 매핑된 역할이 접근 가능한 메뉴 트리를 미리보기로 제공한다. |
| **주요 사용자** | 시스템 관리자 / 보안 운영 담당자 |
| **접근 경로** | (As-Is) Nexacro Mui Portal — csa 그룹 → CommRoleGrpMng |

### 1.2 Frontend 개발 연계 값

> 명명 룰 = **MES 단일 룰** (moduleId == `mcm` ≠ `mpn` — APS 예외 미적용). 4 식별자 (screenId / pageId / serviceId / pageName) 1byte 동일.

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | mcm — 한글명 **"공통관리"** | 01 A.1 |
| moduleGroup | csa — 한글명 **"시스템관리"** | 01 A.2 (사용자 결정 등재) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 역할 그룹 관리 (commRoleGrpMng) | - |
| mesModule | m-mcm | 01 A.4.5 (`m-{moduleId}`) |
| 적용 명명 룰 | MES 단일 룰 | moduleId == `mpn` 아님 |
| 화면식별자 (screenId) | commRoleGrpMng | 01 A.3 / A.4.1 (camelCase 단일 토큰) |
| pageName | commRoleGrpMng | 01 A.4.2 (MES: = screenId) |
| pageId | commRoleGrpMng | 01 A.4.3 (MES: = screenId) |
| serviceId | commRoleGrpMng | 01 A.4.4 |
| 페이지 유형 | **D 다중 그리드** (분석 §3 — G + GE1 + GE2 + LT 4 그리드 + D 상세 폼 동시 존재) | 분석 §3 (G-NNN 8 + GE1-NNN 8 + GE2-NNN 7 + LT-NNN 1 + D-NNN 7) |
| 주요 API path (UI→BFF) | `POST /api/mcm/oasis/commRoleGrpMng/{action}` | 04 §A.2-3 |
| 주요 API path (BFF→BE) | `POST /oasis/commRoleGrpMng/{action}` | 04 §A.2-3 |
| Frontend 파일명 | `commRoleGrpMng.tsx` | 03 컨벤션 (MES: `{screenId}.tsx`) |
| tsup entry key | `pages/csa/commRoleGrpMng` | 01 A.4.6 (MES: `pages/{moduleGroup}/{pageName}`) |

---

## 2. 화면 영역 정의 (분석 §3.1 인용)

| 영역ID | 영역명 | xfdl 컨테이너 | 설명 |
|---|---|---|---|
| A-TITLE | 타이틀 영역 | `div_title` (xfdl:6) | 화면명 + 공통 topMenu (4 기본 버튼 + 1 링크) |
| A-FILTER | 조회조건 영역 | `div_search` (xfdl:14) | BIZ SYSTEM + 역할 그룹ID + 역할 그룹명 + 사용 여부 |
| A-FOLD | 접기 토글 | `btn_fold` (xfdl:46) | 조회조건 접기/펴기 |
| A-MAIN-TOP-LEFT (= A-GRID) | 역할 그룹 목록 그리드 | `div_mainGrd` (xfdl:124) | G-001~G-008 + 좌측 메뉴 + 우측 commonRightButton |
| A-MAIN-TOP-RIGHT (= A-DETAIL) | 역할 그룹 상세 폼 | `div_mainDetail` (xfdl:220) | D-001~D-007 입력 (BindItem 7 양방향 바인딩) |
| A-MAIN-BOT-LEFT (= A-GRID-EXT1 + A-TREE) | 좌하 패널 | `div_subGrd1` (xfdl:50) | LT 메뉴 트리 + GE1 현재 역할 그리드 |
| A-MAIN-CENTER (= A-SHUTTLE) | 셔틀 영역 | `div_buttonGrp` (xfdl:116) | B-002/B-003 셔틀 버튼 (추가/제외) |
| A-MAIN-BOT-RIGHT (= A-GRID-EXT2) | 우하 패널 | `div_subGrd2` (xfdl:173) | GE2 전체 역할 그리드 + 필터 입력 |
| A-FOOTER | 하단 status 영역 | `div_bottom` (xfdl:273) | 공통 bottom status 메시지 |

> 본 화면은 표준 5 영역 + A-TITLE / A-FOOTER 2 영역 + A-FOLD / A-MAIN-* (5 서브 영역) 추가. As-Is xfdl 의 6 패널 레이아웃 1:1 보존.

---

## 3. 조회조건 정의 (영역: A-FILTER)

### 3.1 조회조건 필드 (S-NNN — 분석 §3.2 그대로 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3.1 활성 행 (3) + 폐기 행 1 (~~S-001~~) == 분석 §3.2 행 (3 활성 + 1 폐기) | ✓ |
| 입력 방식 enum (5값) | TextBox + ComboBox 만 사용 | ✓ |

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| ~~S-001~~ | ~~BIZ_SYSTEM_CODE~~ | ~~BIZ SYSTEM~~ | ~~ComboBox~~ | - | - | **To-Be 정책 #1 폐기** (Q-004/Q-005/Q-008 일괄 해소). cbo_bizSystemCode 콤보 / ds_lovSubSystem Dataset / lov action / Task_1erud76 BPMN 노드 / selectAppHostId 외부 namespace 호출 모두 폐기 |
| S-002 | ROLE_GROUP_ID | 역할 그룹ID | TextBox | N | (없음 — 디자인 시점 "부산역 CY" 더미) | ROLE_GROUP_ID 부분 일치 검색 — 단, SQL WHERE 는 `UPPER(A.ROLE_GROUP_ID) LIKE UPPER('%' \|\| ... \|\| '%')` 만 매칭 (MASTER_CODE 매칭 ✗ — cma masterCodeMng 와 다름) |
| S-003 | ROLE_GROUP_NM | 역할 그룹명 | TextBox | N | (없음 — 디자인 더미 "부산역 CY") | UPPER 대소문자 무시 부분 일치 검색 |
| S-004 | USE_TP | 사용 여부 | ComboBox | N | `value="Y"` | 사용 여부 (Y/N) — 정적 hardcoded Dataset (LV-002) |

> **S-NNN 활성 합계 = 3** (S-001 폐기 — 정책 #1).

### 3.2 조회 결과 (G-NNN 메인 그리드 — 분석 §3.3 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3.2 G 행 == 분석 §3.3 G 행 (8 행) | ✓ |
| 표시명 1 enum 매칭 | 확정 한글 8 행 | ✓ |

| 컬럼ID | DB 컬럼명 (alias) | 화면 표시명 | 데이터 설명 | 정렬 | 표시 형식 | 편집 (분기) | 필수 |
|---|---|---|---|---|---|---|---|
| G-001 | STATUS | 상태 | Nexacro auto row state 아이콘 (As-Is). **To-Be**: FE 프레임워크에서 동일 row state 표시 기능 구현 (사용자 결정 — masterCodeMng ST-005 와 동일) | Center | imagecontrol | N (`edittype="none"`) | - |
| G-002 | ROLE_GROUP_ID | 역할 그룹 ID | 역할 그룹 ID (PK) | Left | varchar (autofit col) | Y (기본 편집 — `edittype` 미지정) | - (As-Is 명시 ✗) |
| G-003 | ROLE_GROUP_NM | 역할 그룹명 | 역할 그룹명 | Left | varchar | Y | - |
| G-004 | ROLE_GROUP_DESC | 역할 그룹 설명 | 역할 그룹 설명 | Left | varchar | Y | - |
| ~~G-005~~ | ~~BIZ_SYSTEM_CODE~~ | ~~BIZ SYSTEM~~ | - | Center | varchar | - | **To-Be 정책 #1 폐기** (메인 그리드에서 BIZ SYSTEM 컬럼 제거) |
| G-006 | USE_TP | 사용구분 | 사용 여부 (Y/N) | Center | varchar | Y | - |
| G-007 | START_ACTIVE_DATE | 유효개시일 | 유효 개시 일자 | Center | date(yyyy-MM-dd) | Y | - |
| G-008 | END_ACTIVE_DATE | 유효기한일 | 유효 기한 일자 | Center | date(yyyy-MM-dd) | Y | - |

**확장/서브 그리드 1 (GE1-NNN — `grd_sub1` 현재 역할, 분석 §3.4 인용)**:

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 비고 |
|---|---|---|---|---|---|
| GE1-001 | CHK | (체크박스) | 셔틀 선택 마킹 (CHK=1 → B-002 셔틀 제외 대상) | Center | checkbox / 헤드 클릭 시 전체 토글 (xfdl:802) |
| GE1-002 | ROLE_ID | 역할 ID | 매핑된 역할 ID | Left | - |
| GE1-003 | ROLE_NM | 역할명 | 매핑된 역할명 | Left | - |
| GE1-004 | PARENT_ROLE_ID | 부모역할 ID | 부모 역할 ID (Q-010 — Mapper SELECT 절 누락) | Left | - |
| GE1-005 | USE_TP | 사용 여부 | 사용 여부 (Y/N) | Center | - |
| GE1-006 | START_ACTIVE_DATE | 유효개시일 | 유효 개시 일자 | Center | date(yyyy-MM-dd) |
| GE1-007 | END_ACTIVE_DATE | 유효기한일 | 유효 기한 일자 | Center | date(yyyy-MM-dd) |
| GE1-008 | ROLE_GROUP_ID | 역할 그룹 ID | 매핑 역할 그룹 ID (참조) | Left | - |

**좌측 보조 트리 (LT — `grd_M0F1` 메뉴 구조, 분석 §3.5 인용)**:

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 비고 |
|---|---|---|---|---|---|
| LT-001 | MENU_NM | 메뉴 구조 | 트리 노드 (treelevel=`bind:LEV`, treestartlevel=0) | Left | tree edittype + treeitemcontrol displaytype, `treeinitstatus="expand,all"` |

**확장/서브 그리드 2 (GE2-NNN — `grd_sub2` 전체 역할, 분석 §3.6 인용)**:

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 비고 |
|---|---|---|---|---|---|
| GE2-001 | CHK | (체크박스) | 셔틀 선택 마킹 (CHK=1 → B-003 셔틀 추가 대상) | Center | checkbox / 헤드 클릭 시 전체 토글 (xfdl:819) + `ds_role_oncolumnchanged` 자동 head 동기화 |
| GE2-002 | ROLE_ID | 역할 ID | 미매핑 역할 ID | Left | - |
| GE2-003 | ROLE_NM | 역할명 | 미매핑 역할명 | Left | - |
| GE2-004 | PARENT_ROLE_ID | 부모역할 ID | 부모 역할 ID (Q-010) | Left | - |
| GE2-005 | USE_TP | 사용여부 | 사용 여부 | Center | - |
| GE2-006 | START_ACTIVE_DATE | 유효개시일 | 유효 개시 일자 | Center | date(yyyy-MM-dd) |
| GE2-007 | END_ACTIVE_DATE | 유효기한일 | 유효 기한 일자 | Center | date(yyyy-MM-dd) |

### 3.3 코드값 표시 변환 (분석 §10 인용)

| DB 컬럼 | 코드 마스터 (LV-NNN) | 변환 예 |
|---|---|---|
| ~~BIZ_SYSTEM_CODE~~ | ~~LV-001 (외부 namespace)~~ | **To-Be 정책 #1 폐기** (Q-005 해소) |
| USE_TP (S-004) | LV-002 (xfdl 정적 Y/N 2 행) | Y → "Y" / N → "N" |
| USE_TP (D-005 Radio) | LV-003 (xfdl 정적 Y/Yes, N/No 2 행 — 라벨 표기 다름) | Y → "Yes" / N → "No" |

---

## 4. 상세 영역 필드 정의 (영역: A-MAIN-TOP-RIGHT = A-DETAIL)

### 4.1 D-NNN 상세 입력 필드 (분석 §3.7 인용)

| ID | DB 컬럼 | 화면 표시명 | 입력 방식 | maxlength | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|---|
| D-001 | ROLE_GROUP_ID | 역할 그룹 ID | TextBox | 90 | Y (cssclass=`Essential` + `edi_WF_LabelFirstE`) | (자동 prefix 폐기 — 정책 #1) | ROLE_GROUP_ID — canchange 핸들러는 To-Be 미정의. **Service 레이어가 PK 중복 검증 책임 보유 (Q-003 해소)** |
| ~~D-002~~ | ~~BIZ_SYSTEM_CODE~~ | ~~BIZ SYSTEM~~ | ~~ComboBox~~ | - | - | - | **To-Be 정책 #1 폐기** (Q-004 자동 해소). cbo_subSystemCode 콤보 / BI-007 BindItem / stc_Static5 배경 모두 폐기 |
| D-003 | ROLE_GROUP_NM | 역할 그룹명 | TextBox | 100 | N | - | - |
| D-004 | ROLE_GROUP_DESC | 역할 그룹 설명 | TextBox | 100 | N | - | - |
| D-005 | USE_TP | 사용 여부 | Radio | - | N (라벨 cssclass=`edi_WF_LabelFirst`) | "Y" (value=Y, text=Yes) | direction=vertical, codecolumn=Y/N, datacolumn=Yes/No |
| D-006 | START_ACTIVE_DATE | 유효 개시일 | Calendar | - | N | fn_rowAdd 시 `gfn_today()` 세트 (xfdl:717) | usetrailingday=true |
| D-007 | END_ACTIVE_DATE | 유효 기한일 | Calendar | - | N | fn_rowAdd 시 "99991231" 세트 (xfdl:718, ST-002) | usetrailingday=true |

### 4.2 라인 필드 (서브 그리드)

해당 없음 — L-NNN (parent FK 다중 row 라인 — D-NNN 상세에 종속된 라인) ✗. GE1 (현재 역할) 은 역할 그룹 매핑이지만 표면적으로 G + GE 2 단계 master-detail 구조로 분기 분류상 GE-NNN 으로 분류.

---

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록 (B-NNN — 분석 §4.1 그대로 인용)

| 버튼ID | 버튼명 | 위치 | To-Be action (**6 enum** — 정책 #1 후) | 설명 |
|---|---|---|---|---|
| B-001 | (접기 토글, 아이콘) | A-FOLD | (클라이언트 전용) | `gfn_fold` — div_search 접기/펴기 |
| B-002 | (셔틀 우→좌 = 제외, cssclass=`btn_WF_ShuttleDeleteH`) | A-MAIN-CENTER (셔틀) | **saveCmRoleGrpMap** (DELETE 분기) | `fn_removeRoleMapRow` — 현재 역할 (GE1) 의 CHK=1 행 모두 ds_roleGrpMap.deleteRow + DELETE 트랜잭션. **To-Be 정정 (Q-006 해소)**: cssclass 의미와 동작 일치 — Delete 모양 = 제외 |
| B-003 | (셔틀 좌→우 = 추가, cssclass=`btn_WF_ShuttleAddH`) | A-MAIN-CENTER (셔틀) | **saveCmRoleGrpMap** (INSERT 분기) | `fn_appendRoleMapRow` — ds_main rowposition 의 ROLE_GROUP_ID null 차단 → 전체 역할 (GE2) 의 CHK=1 + ROLE_ID 비-null 행 모두 ds_roleGrpMap.addRow + INSERT 트랜잭션. **To-Be 정정 (Q-006 해소)**: cssclass 의미와 동작 일치 — Add 모양 = 추가 |

### 5.1-1 외부 commonTopButton (EX-NNN — 분석 §4.2 인용)

| EX-ID | 등록명 | 트리거 함수 | To-Be action |
|---|---|---|---|
| EX-001 | btn_search | `fn_search` | **searchCmRoleGrp** |
| EX-002 | btn_reset | `fn_reset` | (클라이언트 전용 — `gfn_setDivDefault`) |
| EX-003 | btn_save | `fn_save` (조건부 confirm 후) | **saveCmRoleGrp** |
| EX-004 | btn_close | `fn_close` | (탭 닫기 — `gv_AppTabPath.form.fn_closeForm()`) |
| EX-005 | (링크 "사용자 관리" — fn_linkCommMenu) | `fn_linkCommMenu` | (외부 화면 이동 — `csa/csa::CommObjMng`) |

### 5.1-2 외부 commonLeftButton (EX2-NNN — 분석 §4.3 인용)

| EX2-ID | 등록명 | 동작 |
|---|---|---|
| EX2-001 | chk_check | (공통 left 기본 토글) |
| EX2-002 | btn_sum | (공통 left 기본 합계) |
| EX2-003 | btn_copyPaste | (공통 left 기본 복사/붙여넣기) |

### 5.1-3 외부 commonRightButton (EX3-NNN — 분석 §4.4 인용)

| EX3-ID | 등록명 | 트리거 함수 | To-Be action |
|---|---|---|---|
| EX3-001 | btn_rowAdd | `fn_rowAdd` | (클라이언트 전용 — ds_main.addRow + USE_TP="Y" + START/END_ACTIVE_DATE 기본값 + ROLE_GROUP_ID prefix) |
| EX3-002 | btn_rowDelete | `fn_rowDelete` | (클라이언트 전용 — USER_MAPPING 종속 검증 후 `gfn_deleteRow`) |
| EX3-003 | btn_rowCopy | `fn_rowCopy` | (클라이언트 전용 — `gfn_rowcopyData`) |
| EX3-004 | btn_rowCancel | `fn_rowCancel` | (클라이언트 전용 — `gfn_grdInit`) |

### 5.1-4 그리드셀 인라인 버튼 (GB-NNN)

해당 없음 — 본 화면 그리드 셀에 ButtonField / displaytype="button" 셀 ✗ (분석 §4.5).

### 5.2 액션 → SQL ID 매핑 (분석 §6 + §8.3 인용)

| To-Be action | 트리거 (xfdl 메서드) | BPMN 분기 sequenceFlow | 호출 SQL ID (순서대로) | UserTask Java |
|---|---|---|---|---|
| ~~lov~~ | ~~`fn_lov` — onload 말미 자동 호출~~ | ~~`SequenceFlow_0gdqjne`~~ | ~~`CommObjMngMapper.selectAppHostId`~~ | - | **To-Be 정책 #1 폐기** (Q-005/Q-008 자동 해소) |
| searchCmRoleGrp | `fn_search` (xfdl:665) — EX-001 btn_search | `SequenceFlow_0tt1mbk` (searchCmRoleGrp) | `selectCommRoleGrp` (To-Be `BIZ_SYSTEM_CODE` 파라미터/SELECT/WHERE 절 제거) | - (ScriptTask) |
| saveCmRoleGrp | `fn_save` (xfdl:674) — EX-003 btn_save (confirm 후) | `SequenceFlow_0grwghu` (saveCmRoleGrp) | (`CommonMultiSaveTask` 분기) `insertCommRoleGrp` / `updateCommRoleGrp` / `deleteCommRoleGrp` | - (ScriptTask) |
| searchCmRoleGrpMap | `fn_run("searchCmRoleGrpMap")` (xfdl:476) — `ds_main_onrowposchanged` (xfdl:764) | `SequenceFlow_11y43nf` (searchCmRoleGrpMap) | `selectCommRoleGrpMap` | - (ScriptTask) |
| saveCmRoleGrpMap | B-002 (`fn_removeRoleMapRow`, xfdl:611) / B-003 (`fn_appendRoleMapRow`, xfdl:625) | `SequenceFlow_109h9q1` (saveCmRoleGrpMap) | (`CommonMultiSaveTask` 분기) `insertCommRoleGrpMap` / `updateCommRoleGrpMap` (더미 DUAL) / `deleteCommRoleGrpMap` | - (ScriptTask) |
| searchCmRole | `fn_run("searchCmRole")` (xfdl:497) — `ds_main_onrowposchanged` (xfdl:766) | `SequenceFlow_13bmd6q` (searchCmRole) | `selectCommRole` | - (ScriptTask) |
| searchCmRoleGrpMenu | `fn_run("searchCmRoleGrpMenu")` (xfdl:509) — `ds_main_onrowposchanged` (xfdl:768) | `SequenceFlow_0oowkcm` (searchCmRoleGrpMenu) | `selectMenuObjTree` | - (ScriptTask) |

---

## 6. 비즈니스 룰 (validation / 도메인 룰)

### 6.1 EX-003 (역할 그룹 저장) validation 룰 (분석 §4.6 #15 / xfdl:674~708)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-001 | confirm("저장하시겠습니까?") — confirm 모달 통과 시에만 fn_run("saveCmRoleGrp") 호출 | btn_save 클릭 | "저장하시겠습니까?" (confirm) | (취소 시 return) | xfdl:683 |
| V-002 | `gfn_isDatasetChanged(ds_main)` false 시 → 차단 | fn_before_save_chk 진입 | "저장할 데이터가 없습니다." (information) | return false | xfdl:705~707 |
| V-003 | `ds_roleGrpMap.getRowCount() > 0` 시 → 차단 (역할 매핑 존재 시 저장 차단) | fn_before_save_chk | "현재 연결된 역할이 존재 합니다. 삭제 후 처리하세요." (error) | return false | xfdl:697~700 |
| V-004 | `gfn_cpRequired(this, "ROLE_GROUP_ID")` — D-001 (ROLE_GROUP_ID) 필수 검증 | fn_before_save_chk | (gfn 표준 메시지) | gfn return | xfdl:702 |

### 6.2 EX3-002 (역할 그룹 행삭제) validation 룰 (분석 §4.6 #18 / xfdl:736~747)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-101 | `USER_ID` 값 존재 시 → 차단 (selectCommRoleGrp 의 scalar subquery 로 가져온 USER_MAPPING 매칭 결과) | btn_rowDelete 클릭 | "연결된 사용자가 존재합니다. 제외 후 삭제 하세요?" (warning) | return (차단) | xfdl:741~744 |
| V-102 | USER_ID null 시 → `gfn_deleteRow(ds_main, nRow)` 클라이언트 행삭제 | (V-101 통과) | - | (정상 삭제) | xfdl:745 |

### 6.3 EX3-003 (역할 그룹 행복사) validation 룰 (분석 §4.6 #17 / xfdl:725~734)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-201 | `ds_main.rowposition < 0` 시 → 차단 | btn_rowCopy 클릭 | "선택 행이 없습니다." (warning) | return | xfdl:727~729 |

### 6.4 EX3-001 (역할 그룹 행추가) — 자동 세트 룰 (분석 §4.6 #16 / xfdl:710~723)

| # | 룰 | 동작 | 근거 |
|---|---|---|---|
| V-301 | ds_main.addRow + Detail 영역 enable | 자동 (검증 ✗) | xfdl:712~713 |
| V-302 | USE_TP="Y" 자동 세트 | 자동 | xfdl:716 |
| V-303 | START_ACTIVE_DATE=`gfn_today()` 자동 세트 | 자동 | xfdl:717 |
| V-304 | END_ACTIVE_DATE="99991231" 자동 세트 (ST-002) | 자동 | xfdl:718 |
| ~~V-305~~ | ~~ROLE_GROUP_ID 자동 prefix~~ | - | ~~xfdl:720~721~~ (**To-Be 정책 #1 폐기** — BIZ SYSTEM 콤보 자체 폐기로 prefix 로직 제거) |

### 6.5 B-003 (셔틀 우→좌 = 현재 역할 추가) validation 룰 (분석 §4.6 #8 / xfdl:625~645)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-401 | ds_main rowposition 의 ROLE_GROUP_ID null 시 → 차단 | btn_left 클릭 | "선택된 Role 그룹 ID가 없습니다." (warning) | return | xfdl:628~632 |
| V-402 | ds_role 의 CHK=="1" 행 중 ROLE_ID null 행 자동 skip | for-loop | - | (skip) | xfdl:636 |

### 6.6 B-002 (셔틀 좌→우 = 현재 역할 제외) — 자동 동작 (분석 §4.6 #7 / xfdl:611~623)

| # | 룰 | 동작 | 근거 |
|---|---|---|---|
| V-501 | ds_roleGrpMap.set_enableevent(false) → CHK=="1" 행 모두 deleteRow → enableevent(true) → fn_run("saveCmRoleGrpMap") | 자동 | xfdl:613~622 |

### 6.7 ds_main 행 위치 변경 시 자동 chain 조회 (분석 §4.6 #20 / xfdl:753~770)

| # | 룰 | 트리거 | 차단 / 조건 | 근거 |
|---|---|---|---|---|
| V-601 | rowposition > -1 + rowCount != 0 + e.reason != 52 (단순 rowposition 외) 시 → grd_sub1/grd_sub2 head row 0 text="0" reset + 3 회 fn_run 호출. **To-Be (Q-013 해소)**: React state 자연 흡수 — useEffect dependency 로 selectedRow 변경 시점에만 chain 호출 (Nexacro reason 52 등가 — rowposition 변경만 발생 시 미트리거) | onrowposchanged | (reason 52 = 데이터 변경 없는 rowposition 만 변경 시 chain 미실행) | xfdl:755~769 |
| V-602 | 3 회 chain: fn_run("searchCmRoleGrpMap") + fn_run("searchCmRole") + fn_run("searchCmRoleGrpMenu") | 동일 | - | xfdl:764~768 |

### 6.8 그리드 헤드 CHK 클릭 시 전체 토글 (분석 §4.6 #25 / xfdl:802~810 / #27 / xfdl:819~827)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-701 | GE1 (grd_sub1) 헤드 CHK 클릭 시 → `gfn_setGridCheckAll(obj, e)` 호출 (전체 행 CHK 토글) | grd_sub1 onheadclick | - | xfdl:802~810 |
| V-702 | GE2 (grd_sub2) 헤드 CHK 클릭 시 → `gfn_setGridCheckAll(obj, e)` 호출 | grd_sub2 onheadclick | - | xfdl:819~827 |
| V-703 | GE2 (grd_sub2) CHK 컬럼 변경 시 → `fn_setChkDs` 가 head row 0 의 text 를 "1"/"0" 으로 자동 동기화 | ds_role oncolumnchanged → fn_setChkDs | - | xfdl:647~656 / 837~840 |

### 6.9 GE2 필터 입력 (분석 §4.6 #32 / xfdl:862~870)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-801 | edt_rolefilter value 가 있으면 `ds_role.filter("ROLE_ID.indexOf('{value}')>-1")` 부분 일치 / 비어 있으면 filter("") clear | edt_rolefilter onkeyup | - | xfdl:864~868 |

### 6.10 콜백 메시지 (분석 §4.6 #6 / xfdl:528~605)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| V-901 | searchCmRoleGrp 콜백 — `nErrorCode==0` 시 "{N}건 조회 되었습니다." bottom status / 오류 시 strErrorMsg | fn_callBack("searchCmRoleGrp") | xfdl:530~543 |
| V-902 | saveCmRoleGrp 콜백 — `nErrorCode==0` 시 "{N}건 조회 되었습니다." 표시 + info("저장 되었습니다.") 모달 → 콜백에서 fn_search() 재호출 | fn_callBack("saveCmRoleGrp") | xfdl:545~559 |
| V-903 | searchCmRoleGrpMap 콜백 — "{N}건 조회 되었습니다." 표시 (오류 시 strErrorMsg) | fn_callBack("searchCmRoleGrpMap") | xfdl:561~567 |
| V-904 | saveCmRoleGrpMap 콜백 — info("저장 되었습니다.") 모달 → 콜백에서 3 회 fn_run 재호출 (searchCmRoleGrpMap / searchCmRole / searchCmRoleGrpMenu) | fn_callBack("saveCmRoleGrpMap") | xfdl:569~581 |
| V-905 | searchCmRole 콜백 — "{N}건 조회 되었습니다." 표시 | fn_callBack("searchCmRole") | xfdl:583~590 |
| V-906 | searchCmRoleGrpMenu 콜백 — "{N}건 조회 되었습니다." 표시 | fn_callBack("searchCmRoleGrpMenu") | xfdl:592~599 |

### 6.11 onload 자동 동작 (분석 §4.6 #2 / xfdl:385~416)

| # | 동작 | 트리거 | 근거 |
|---|---|---|---|
| V-1001 | gfn_formOnLoad(obj) | Form onload | xfdl:407 |
| V-1002 | Detail 영역 비활성화 (`gfn_setEnable("this.div_main.form.div_mainDetail","false")`) | Form onload | xfdl:410 |
| V-1003 | 3 그리드 SelectedRow 색상 (red/blue) 세팅 — `gfn_gridSelectedRow` 3 회 (grd_main / grd_sub1 / grd_sub2) | Form onload | xfdl:411~413 |
| V-1004 | `fn_lov()` 호출 — lov action 트랜잭션 | Form onload | xfdl:415 |
| V-1005 | searchCmRoleGrp 콜백에서 ds_main.rowcount > 0 시 Detail 영역 enable / rowcount=0 시 비활성화 | fn_callBack("searchCmRoleGrp") | xfdl:534~539 |

---

## 7. 상태값 ST-NNN (분석 §10.1 인용)

| ID | As-Is 상태값 | 의미 | 영향 영역 |
|---|---|---|---|
| ST-001 | `USE_TP = "Y"` / `"N"` | 사용여부 (Y/N) | G-006 / D-005 / GE1-005 / GE2-005 / S-004 / selectCommRole WHERE / selectMenuObjTree WHERE (3 회) |
| ST-002 | `END_ACTIVE_DATE = "99991231"` 하드코딩 | 유효 기한일 = 9999-12-31 영구 활성 | V-304 (fn_rowAdd 자동 세트) |
| ST-003 | `START_ACTIVE_DATE = gfn_today()` | 유효 개시일 = 행추가 시 오늘 | V-303 |
| ST-004 | `STATUS` (Nexacro auto row state — To-Be FE 동일 구현) | 상태 아이콘 | G-001 |
| ST-005 | `ds_main.getRowType(rowposition)` | 그리드 row 상태 (Nexacro RowType: 1=삭제 / 2=신규 / 4=수정 / 8=수정후삭제) | saveCmRoleGrp 의 `:U` 마킹 + BPMN CommonMultiSaveTask 분기 |
| ST-006 | `CHK == "1"` (GE1 / GE2) | 그리드 행 선택 마킹 | V-701~V-703 + B-002/B-003 |
| ~~ST-007~~ | ~~ROLE_GROUP_ID 자동 prefix~~ | - | ~~V-305~~ (**To-Be 정책 #1 폐기**) |
| ST-008 | `USER_ID` (selectCommRoleGrp scalar subquery USER_MAPPING 매칭 결과) | 종속 사용자 존재 시 행삭제 차단 | V-101 |
| ST-009 | `MENU_TP = "WEB"` 하드코딩 | 메뉴 트리 조회 시 WEB 메뉴만 표시 | LT (메뉴 트리) |

---

## 8. 권한 / 접근 제어

As-Is 코드 (xfdl) 내에 명시적 권한 체크 호출 없음 (`gfn_authority` / role check grep 0 hits). 공통 topMenu 의 4 기본 버튼 (btn_search / btn_reset / btn_save / btn_close) + 1 링크 (fn_linkCommMenu) 등록만. **To-Be**: 본 화면 자체 권한 분기 ✗ — To-Be 외부 권한 프로세스 모델 (전사 정책) 에 위임 (사용자 결정 — masterCodeMng 와 동일 정책).

| 항목 | 값 | 근거 |
|---|---|---|
| 화면 진입 권한 | (As-Is 명시 ✗ — 포털 메뉴 권한 모델 종속) | xfdl 전체 grep |
| 버튼 권한 | (As-Is 명시 ✗) | 동일 |
| To-Be 정책 | To-Be 외부 권한 프로세스 (전사 정책) 위임 | 사용자 결정 |

---

## 9. 팝업 / 연계 화면 (P-NNN — 분석 §5 인용)

해당 없음 — 본 화면에는 modal 팝업 호출 없음 (`gfn_openPopup` / OpenForm grep 0 hits). 외부 화면 이동만 존재:

| 연계 ID | 유형 | 이름 | 트리거 | 호출 라인 | 전달 파라미터 | 반환 처리 |
|---|---|---|---|---|---|---|
| EX-005 | navigate (외부 화면) | "사용자 관리" (commonTopButton 의 링크) | EX-005 (fn_linkCommMenu) | xfdl:842 → 845 | `("csa/csa::CommObjMng", "")` | (외부 메뉴 화면 — 본 화면 callback ✗) |

---

## 10. 메시지 / 알림

| # | 메시지 | 유형 | 발생 위치 (xfdl:line) | 근거 |
|---|---|---|---|---|
| M-001 | "저장하시겠습니까?" | confirm modal | V-001 / fn_save / xfdl:683 | - |
| M-002 | "저장할 데이터가 없습니다." | information | V-002 / fn_before_save_chk / xfdl:705 | - |
| M-003 | "현재 연결된 역할이 존재 합니다. 삭제 후 처리하세요." | error | V-003 / fn_before_save_chk / xfdl:699 | - |
| M-004 | "연결된 사용자가 존재합니다. 제외 후 삭제 하세요?" | warning | V-101 / fn_rowDelete / xfdl:742 | - |
| M-005 | "선택 행이 없습니다." | warning | V-201 / fn_rowCopy / xfdl:727 | - |
| M-006 | "선택된 Role 그룹 ID가 없습니다." | warning | V-401 / fn_appendRoleMapRow / xfdl:630 | - |
| M-007 | "{N}건 조회 되었습니다." | bottom status | V-901 / V-903 / V-905 / V-906 / xfdl:533 / 564 / 586 / 595 | - |
| M-008 | "저장 되었습니다." | info modal | V-902 (saveCmRoleGrp) / V-904 (saveCmRoleGrpMap) / xfdl:555 / 580 | - |
| M-009 | "메뉴가 존재하지 않습니다." | warning | fn_openMenu (EX-005 외부 화면 미발견) / xfdl:855 | - |
| M-010 | (gfn 표준 메시지) "ROLE_GROUP_ID 는 필수 입력 항목 입니다." | (gfn_cpRequired) | V-004 / xfdl:702 | gfn 표준 |

---

## 11. As-Is 인용 정합 (분석리포트 §1~§13 ↔ 본 §1~§10)

| 본 § | 인용 정본 (분석리포트) | 인용 검증 |
|---|---|---|
| §1.1 | 분석 §1 | 1byte 일치 |
| §1.2 | 분석 §1 + 가이드 명명 룰 | 4 식별자 1byte 동일 |
| §2 | 분석 §3.1 | 영역 9 → 5 정규 + 4 추가 (TITLE / FOLD / CENTER / FOOTER) |
| §3.1 | 분석 §3.2 | 4 행 일치 |
| §3.2 | 분석 §3.3 / §3.4 / §3.5 / §3.6 | G 8 + GE1 8 + LT 1 + GE2 7 = 24 행 일치 |
| §4 | 분석 §3.7 | D 7 행 일치 |
| §5.1 | 분석 §4.1 | B 3 행 일치 |
| §5.1-1 ~ §5.1-3 | 분석 §4.2 / §4.3 / §4.4 | EX 5 + EX2 3 + EX3 4 = 12 행 일치 |
| §5.1-4 | 분석 §4.5 | "해당 없음" 보존 |
| §5.2 | 분석 §6 + §8.3 | 7 action + 10 SQL ID 일치 |
| §6 | 분석 §4.6 (메서드 표) | V-001~V-1005 모두 cite |
| §7 | 분석 §10.1 | 9 ST 일치 |
| §8 | (To-Be 외부 권한 프로세스 위임 — 사용자 결정) | 본 화면 권한 분기 ✗ |
| §9 | 분석 §5 + §4.2 (EX-005) | 외부 화면 1 행 일치 |
| §10 | 분석 §4.6 + xfdl | M-001~M-010 모두 cite |

---

## §-1. §6.14 Phase 종료 자동 고해성사 4 질문

| # | 질문 | 답변 |
|---|---|---|
| 1 | 14항 위반? | No — 분석리포트 §0.1.3 단일 원천 1:1 인용. S 3 활성 (1 폐기) / G 7 활성 (1 폐기) / GE1 8 / GE2 7 / LT 1 / D 6 활성 (1 폐기) / B 3 / EX 5 + EX2 3 + EX3 4 / action **6** / SQL 10 / ST 8 활성 (1 폐기) 모두 분석 갱신본 행수 일치 |
| 2 | 검증 안 한 부분? | No — Q 12 건 해소 결정 (2026-05-31) 본 §3.1 / §3.2 / §3.3 / §4.1 / §5.1 / §5.2 / §6.4 / §6.7 / §7 / §10 본문 직접 반영 |
| 3 | 그대로 수용? | Yes — 정책 #1 (BIZ SYSTEM 콤보 제거) 으로 lov action 폐기 → action **6 enum** 으로 사용자 사전 명시 일치 (Q-008 해소) |
| 4 | 임의 합리화? | No — Q 12 건 모두 분석 §11.0 / §12 에서 해소 사유 명시 + 본 기능설계서 본문 정합 |

> 4 질문 모두 통과 → Phase 2 기능설계서 작성 완료. **2026-05-31 갱신 적용 — Q 12 건 해소 / action 6 enum**.
