---
screenId: commUserRoleCopy
asIsId: CommUserRoleCopy
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# mcm — 사용자 권한 일괄 등록 기능설계서

> **인용 정본**: 본 문서의 모든 본문은 `commUserRoleCopy_분석리포트.md` 의 §1~§13 / §17 인용. 자체 추가 ✗. 행수 / ID / 표시명 / SQL ID / BPMN flow / action enum 모두 분석리포트와 1byte 일치.
> **환경 제약**: 분석리포트 §0 인용 — Runner / R14-Step0 / manifest 미적용 (사용자 결정). WinForms 전제 항목은 mui 등가물로 매핑.

---

## 1. 화면 개요

### 1.1 업무/설계 측면 (분석 §1 인용)

| 항목 | 내용 |
|---|---|
| **화면명** | 사용자 권한 일괄 등록 |
| **화면 식별자** | commUserRoleCopy |
| **모듈** | mcm (csa 그룹) |
| **화면 목적** | 1명의 "Copy 대상" 사용자가 보유한 역할그룹 (RoleGroup) 매핑을 1~N명의 "권한 생성 대상" 사용자에게 일괄 복사한다. 동시에 권한부여 이력 (TB_MCM_SEC_USER_ROLL_HIS) 을 적재한다. |
| **주요 사용자** | 시스템 관리자 / 사용자 권한 운영 담당자 |
| **접근 경로** | (As-Is) Nexacro Mui Portal — csa 그룹 → CommUserRoleCopy |

### 1.2 Frontend 개발 연계 값

> 명명 룰 = **MES 단일 룰** (moduleId == `mcm` ≠ `mpn` — APS 예외 미적용). 4 식별자 (screenId / pageId / serviceId / pageName) 1byte 동일.

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | mcm — 한글명 **"공통관리"** | 01 A.1 |
| moduleGroup | csa — 한글명 **"시스템관리"** | 01 A.2 (사용자 결정 등재) |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 사용자 권한 일괄 등록 (commUserRoleCopy) | - |
| mesModule | m-mcm | 01 A.4.5 (`m-{moduleId}`) |
| 적용 명명 룰 | MES 단일 룰 | moduleId == `mpn` 아님 |
| 화면식별자 (screenId) | commUserRoleCopy | 01 A.3 / A.4.1 (camelCase `{화면명}`) |
| pageName | commUserRoleCopy | 01 A.4.2 (MES: = screenId) |
| pageId | commUserRoleCopy | 01 A.4.3 (MES: = screenId) |
| serviceId | commUserRoleCopy | 01 A.4.4 |
| 페이지 유형 | **D 다중 그리드** (G + GE 3종 병렬 = 4 그리드) | 분석 §3 (G 3 + GE-001 2 + GE-002 5 + GE-003 5 + D = 0) |
| 주요 API path (UI→BFF) | `POST /api/mcm/oasis/commUserRoleCopy/{action}` | 04 §A.2-3 |
| 주요 API path (BFF→BE) | `POST /oasis/commUserRoleCopy/{action}` | 04 §A.2-3 |
| Frontend 파일명 | `commUserRoleCopy.tsx` | 03 컨벤션 (MES: `{screenId}.tsx`) |
| tsup entry key | `pages/csa/commUserRoleCopy` | 01 A.4.6 (MES: `pages/{moduleGroup}/{pageName}`) |

---

## 2. 화면 영역 정의 (분석 §3.1 인용)

| 영역ID | 영역명 | xfdl 컨테이너 | 설명 |
|---|---|---|---|
| A-FILTER | 조회조건 영역 | `div_search` (xfdl:183) | Copy 대상 사용자 ID/사번 1 입력 (S-001) |
| A-MAIN | 메인 컨테이너 | `div_main` (xfdl:8) | 5 sub-div + 2 shuttle button 컨테이너 |
| A-COPY-USER (= A-GRID) | COPY 대상 사용자 영역 | `div_copyUser` (xfdl:11) | grd_copyUser (G-001~G-003) — 1 row 표시 + "COPY 대상" 라벨 |
| A-COPY-ROLEGRP (= A-GRID-EXT-1) | COPY 대상 RoleGroup 영역 | `div_copyRoleGroup` (xfdl:43) | grd_copyRoleGroup (GE-001) — Copy 대상의 역할그룹 List |
| A-INF-REQ (= A-DETAIL) | 권한생성 대상 헤더 + 정보 입력 | `div_infReq` (xfdl:71) | 정보처리의뢰서번호 (D-001/D-002) + 처리사유 (D-003/D-004) + "권한생성 대상" 라벨 (D-008) |
| A-USER-TO (= A-GRID-EXT-2) | 권한 생성 대상 사용자 영역 | `div_userTo` (xfdl:84) | grd_userTo (GE-002) — 셔틀 이동 시 누적 |
| A-SHUTTLE | 셔틀 버튼 영역 | `btn_left` + `btn_right` (xfdl:121~122) | userFrom ↔ userTo 좌/우 이동 |
| A-USER-FROM (= A-GRID-EXT-3) | 사용자 List 영역 | `div_userFrom` (xfdl:123) | grd_userFrom (GE-003) + 필터 (D-005/D-006) + commonLeftButton |
| A-BTN | 버튼 영역 | 외부 commonTopButton (조회/저장) + shuttle 2 + fold 1 | B-001~B-005 |
| A-TITLE | 타이틀 영역 | `div_title` (xfdl:175) | 화면명 + 공통 topMenu (외부 btn_search + btn_save 자동 등록) |
| A-FOOTER | 하단 status 영역 | `div_bottom` (xfdl:6) | 공통 bottom status 메시지 |

> 본 화면은 "전체 사용자 List → 권한 생성 대상" 사용자 셔틀 패턴 + "Copy 대상 정보 + RoleGroup" 표시 패턴이 결합된 형태. 5 영역 표준이 아닌 **11 영역** (Master+Detail 분할이 아닌 4 그리드 병렬 + 셔틀 1 + 권한생성헤더 1 + 타이틀 1 + 푸터 1).

---

## 3. 조회조건 정의 (영역: A-FILTER)

### 3.1 조회조건 필드 (S-NNN — 분석 §3.2 그대로 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | 본 §3.1 행 == 분석 §3.2 행 (1 행) | ✓ |
| 입력 방식 enum (5값) | TextBox 만 사용 | ✓ |

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | (입력값 → `pUserIdCopy` 파라미터) | Copy 대상 사용자 ID/사번 | TextBox | Y (search action 호출 시 사전 검증 — xfdl:300~303) | (기본값 ✗) | Copy 대상 사용자 식별 — USER_ID 또는 USER_EMP_NO 일치 (SQL 의 OR 조건, xml:26) |

### 3.2 조회 결과 (G/GE-NNN 4 그리드 — 분석 §3.3 인용)

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 그리드 수 일치 | G 1 + GE 3 = 4 그리드 | ✓ |
| 컬럼 합계 | G-001~003 (3) + GE-001 ROLE_GROUP 2 + GE-002 userTo 5 + GE-003 userFrom 5 = 15 컬럼 | ✓ |

#### §3.2-A G 그리드 (grd_copyUser — COPY 대상 사용자, 1 row)

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 정렬 | 표시 형식 | 편집 | 필수 |
|---|---|---|---|---|---|---|
| G-001 | USER_ID | 사용자ID | Left | varchar(256) | N (edittype="none" — xfdl:32) | - |
| G-002 | USER_EMP_NO | 사번 | Left | varchar(256) | N (기본) | - |
| G-003 | USER_NM | 사용자명 | Left | varchar(256) | N (기본) | - |

#### §3.2-B GE-001 그리드 (grd_copyRoleGroup — COPY 대상 RoleGroup List)

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 정렬 | 표시 형식 | 비고 |
|---|---|---|---|---|---|
| GE-001-1 | ROLE_GROUP_ID | 역할 그룹 ID | Left | varchar(256) | - |
| GE-001-2 | ROLE_GROUP_NM | 역할 그룹명 | Left | varchar(256) | - |

#### §3.2-C GE-002 그리드 (grd_userTo — 권한 생성 대상 사용자)

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 정렬 | 표시 형식 | 편집 | 비고 |
|---|---|---|---|---|---|---|
| GE-002-1 | CHK | 선택 | Center | checkbox (`displaytype="checkboxcontrol"`) | Y (checkbox) | 셔틀 이동 대상 마킹 |
| GE-002-2 | USER_ID | 사용자ID | Left | varchar(256) | N (edittype="none") | - |
| GE-002-3 | USER_EMP_NO | 사번 | Left | varchar(256) | N | - |
| GE-002-4 | USER_NM | 사용자명 | Left | varchar(256) | N | - |
| GE-002-5 | DEPT_NM | 부서 | Left | varchar(256) | N | - |

#### §3.2-D GE-003 그리드 (grd_userFrom — 전체 사용자 List, 필터·검색 가능)

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 정렬 | 표시 형식 | 편집 | 비고 |
|---|---|---|---|---|---|---|
| GE-003-1 | CHK | 선택 | Center | checkbox | Y | 셔틀 이동 + 전체선택 (commonLeftButton) |
| GE-003-2 | USER_ID | 사용자ID | Left | varchar(256) | N | - |
| GE-003-3 | USER_EMP_NO | 사번 | Left | varchar(256) | N | - |
| GE-003-4 | USER_NM | 사용자명 | Left | varchar(256) | N | - |
| GE-003-5 | DEPT_NM | 부서 | Left | varchar(256) | N | head Cell 의 `tooltiptext="bind:DEPT_NM"` (긴 부서명 툴팁) |

### 3.3 코드값 표시 변환 (분석 §10 인용 — 2026-05-31 Q-004 해소 반영)

| DB 컬럼 / 위치 | 코드 마스터 (LV-NNN) | 변환 동작 |
|---|---|---|
| (이력 적재 WORKS_CODE) | LV-001 (Java 하드코딩 "P") | DB 마스터 호출 ✗ — "P" 고정 (Q-008 부분 해소 — Permission 추정) |
| (이력 적재 RESP_GBN) | LV-002 (Java 하드코딩 "A") | DB 마스터 호출 ✗ — "A" 고정 (Q-005 해소 — A=추가 Add) |
| TB_MCM_SEC_USER.USE_TP | LV-003 (SQL WHERE 하드코딩 "Y") | 사용중 사용자 (Y) 만 조회 |
| ~~EAIUSER.USAGE_YN~~ | ~~LV-004~~ | **폐기 (Q-004 해소 2026-05-31, 정책 #2)** — EAI 외부 인터페이스 폐기. To-Be 대응 = LV-004-NEW |
| MCMAPUSER.TB_MCM_DEPT_INFO.USE_TP | LV-004-NEW (To-Be SQL JOIN WHERE 하드코딩 "Y") | 사용중 부서 (Y) 만 조회. As-Is USAGE_YN='A' (EAI Active) 의 To-Be 등가물 |

> 본 화면은 LoV (코드 마스터) 콤보 호출 ✗. `NewCodeQuery` / `GeneralDialog` / cbo (Combo) 컴포넌트 사용 미존재. 모든 LV-NNN 은 하드코딩 또는 WHERE 절 enum 값.

---

## 4. 상세 영역 필드 정의 (영역: A-INF-REQ — 권한생성 헤더)

### 4.1 권한생성 헤더 입력 (D-NNN — 분석 §3.4 인용)

| 필드ID | DB 컬럼명 (적재 위치) | 화면 표시명 | 입력 방식 | 필수 | maxlength | 설명 |
|---|---|---|---|---|---|---|
| D-001 | (라벨) | 정보처리의뢰서번호 | Edit (라벨, readonly) | - | - | edt_st_infReqNo 의 옆 라벨 |
| D-002 | TB_MCM_SEC_USER_ROLL_HIS.INF_REQ_NO | (D-001 의 옆 입력) | TextBox | N (저장 시 D-002+D-004 둘 다 null 이면 "권한부여 선처리" confirm — V-002) | 300 | xfdl edt_infReqNo |
| D-003 | (라벨) | 처리사유 | Edit (라벨, readonly) | - | - | edt_st_description 의 옆 라벨 |
| D-004 | TB_MCM_SEC_USER_ROLL_HIS.DESCRIPTION | (D-003 의 옆 입력) | TextBox | N (D-002 와 결합 검증) | 300 | xfdl edt_description |
| D-005 | (클라이언트 필터) | ID/사번/이름 | TextBox | N | 100 | grd_userFrom 의 oninput 필터 (`fn_userFromFilter` type=USER) |
| D-006 | (클라이언트 필터) | 부서 | TextBox | N | 100 | grd_userFrom 의 oninput 필터 (type=DEPT) |
| D-007 | (라벨) | COPY 대상 | Edit (라벨, readonly, cssclass=edi_WF_Title1) | - | - | div_copyUser 의 헤더 라벨 |
| D-008 | (라벨) | 권한생성 대상 | Edit (라벨, readonly, cssclass=edi_WF_Title1) | - | - | div_infReq 의 헤더 라벨 |
| D-009 | (라벨) | 사용자 List | Edit (라벨, readonly, cssclass=edi_WF_Title1) | - | - | div_userFrom 의 헤더 라벨 |
| D-010 | (타이틀) | 사용자 권한 일괄 등록 | Edit (타이틀, readonly, cssclass=edi_WFHD_Title) | - | - | div_title 의 타이틀 |
| D-011 | (구분선) | (text=빈) | Static (cssclass=stc_WF_Box) | - | - | div_infReq 의 라벨 행 박스 |
| D-012 | (구분선) | (text=빈) | Static (cssclass=stc_WF_Box) | - | - | div_infReq 의 라벨 행 박스 |

### 4.2 라인 필드 (서브 그리드)

해당 없음 — L-NNN (parent FK 다중 row 라인) ✗. 본 화면 그리드 4 종은 모두 G/GE 분류 (parent FK 관계 없음).

---

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록 (B-NNN — 분석 §4.1 그대로 인용)

| 버튼ID | 버튼명 | 위치 | To-Be action (7 enum) | 설명 |
|---|---|---|---|---|
| B-001 | 조회 (btn_search) | 외부 commonTopButton | **search** | Copy 대상 사용자 + RoleGroup 조회 (`fn_search`, xfdl:299) |
| B-002 | 저장 (btn_save) | 외부 commonTopButton | **save** | 권한 일괄 복사 + 이력 적재 (`fn_save`, xfdl:317) |
| B-003 | (셔틀 좌) | div_main / btn_left | (클라이언트 전용) | grd_userFrom CHK=1 행 → grd_userTo 이동 (xfdl:413) |
| B-004 | (셔틀 우) | div_main / btn_right | (클라이언트 전용) | grd_userTo CHK=1 행 → grd_userFrom 복귀 + CHK=0 해제 (xfdl:425) |
| B-005 | (접기) | div_main 상단 / btn_fold | (클라이언트 전용) | `gfn_fold` — div_search 접기/펴기 (xfdl:506) |

> commonTopButton 의 사용자정의버튼 = 빈 배열 (xfdl:268), 기본버튼 = `["btn_search"], ["btn_save"]` 만 등록 (xfdl:269). 본 화면은 행추가/행복사/행삭제 등 Master 그리드 toolbar ✗ — 셔틀 + 입력 영역 모드.

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN)

해당 없음 — 본 화면 그리드 4 종 셀에 ButtonField / displaytype="button" 셀 ✗.

### 5.2 액션 → SQL ID 매핑 (분석 §6 + §8.3 인용)

| To-Be action | 트리거 (xfdl 메서드) | BPMN 분기 sequenceFlow | 호출 SQL ID (순서대로) | UserTask Java |
|---|---|---|---|---|
| searchUserList | `fn_searchUserList` (xfdl:287) — `CommUserRoleCopy_onload` 자동 호출 (xfdl:261) | `SequenceFlow_0tt1mbk` (name=searchUserList) | selectUserList | - |
| search | `fn_search` (xfdl:299) — B-001 (commonTopButton btn_search) | `SequenceFlow_0pg57cu` (name=search) | (1) selectCopyUserMap → (2) selectCopyRoleGroupList | - |
| save | `fn_save` (xfdl:317) — B-002 (commonTopButton btn_save) | `SequenceFlow_0eh8isc` (name=save) | (UserTask) → for-loop { **To-Be 정정 (Q-001 정책 #1)** `CommUserRoleCopyMapper.selectRoleMergeObject` (As-Is `CommUserMngMapper.*` 외부 호출 결함 정정) → for-loop **To-Be 흡수 (Q-002/Q-006 정책 #6)** JPA `SecUserRollHisRepository.saveAll()` (As-Is `TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK` 외부 Mapper 폐기) → `mergeCommonCopyRoleGrp`} | `SaveRoleGroupCopy.java` |

> save 분기는 BPMN 상 후속 task 없이 EndEvent 로 직진 (Task_selectUserList 미연결). **Q-003 해소 2026-05-31**: As-Is 의도된 분리 (save 트랜잭션과 List 재조회 책임 분리) 보존. xfdl 콜백 (`fn_callBack("save")`) 이 별도 `fn_searchUserList()` 재호출하여 ds_userFrom 갱신 (xfdl:395). React 등가물 (save mutation → searchUserList refetch) 동일 패턴.

---

## 6. 비즈니스 룰 (validation / 도메인 룰)

### 6.1 B-002 (저장 — fn_save) validation 룰 (분석 §4.3 #5 / xfdl:317~358)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-001 | `ds_copyUser.rowcount == 0` 차단 (조회 미수행 또는 결과 없음) | 저장 클릭 | "복사 대상 사용자가 조회되지 않았습니다." | warning + return false | xfdl:327~330 |
| V-002 | `ds_userTo.rowcount == 0` 차단 (셔틀 미이동) | 저장 클릭 | "권한 생성 대상자가 없습니다." | warning + return false | xfdl:332~335 |
| V-003 | `infReqNo` (D-002) 또는 `description` (D-004) 둘 중 하나라도 null → `infReqNoFlag = false` → confirm 메시지 변경 | 저장 클릭 | (V-001/V-002 통과 후) "정보처리의뢰서번호/처리사유가 입력되지 않았습니다.\n권한부여 선처리 하시겠습니까?" / 둘 다 채워졌으면 "권한을 복사 하시겠습니까?" | confirm — 사용자가 "확인" 시 transaction 실행 / 취소 시 무동작 | xfdl:320~325, 352~356 |
| V-004 | confirm 콜백 (`fn_msgSaveBeforeCallBack`) 에서 rtn==true 일 때만 `gfn_transaction("save", ...)` 호출 | confirm 확인 | - | (취소 시 transaction ✗) | xfdl:337~350 |

### 6.2 B-001 (조회 — fn_search) validation 룰 (분석 §4.3 #4 / xfdl:299~314)

| # | 룰 | 트리거 | 메시지 | 차단 동작 | 근거 |
|---|---|---|---|---|---|
| V-101 | `edt_userIdCopy.value` null 차단 (`gfn_isNull`) | 조회 클릭 | "Copy 대상 사용자 ID/사번 입력 후 조회해주세요." | warning + return false | xfdl:300~303 |

### 6.3 B-003 (셔틀 좌 — userFrom → userTo) 동작 룰 (분석 §4.3 #7 / xfdl:413~422)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-201 | `ds_userFrom.rowcount`부터 0 까지 **역순 루프** | 셔틀 좌 클릭 | i = rowcount → 0 → 행 삭제 안전 (forward 루프 시 index shift 문제 회피) | xfdl:415 |
| V-202 | `CHK == 1` 행 만 `ds_userTo.addRow` + `copyRow(nRow, ds_userFrom, i)` + `ds_userFrom.deleteRow(i)` | 행 단위 | userFrom 에서 userTo 로 이동 | xfdl:416~420 |

### 6.4 B-004 (셔틀 우 — userTo → userFrom) 동작 룰 (분석 §4.3 #8 / xfdl:425~435)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-301 | `ds_userTo.rowcount`부터 0 까지 역순 루프 | 셔틀 우 클릭 | 동일 (안전 삭제) | xfdl:427 |
| V-302 | `CHK == 1` 행 만 `ds_userFrom.addRow` + `copyRow(nRow, ds_userTo, i)` + `setColumn(nRow, "CHK", 0)` (반환 시 CHK 해제) + `ds_userTo.deleteRow(i)` | 행 단위 | userTo 에서 userFrom 으로 복귀 + 체크 해제 | xfdl:428~433 |

### 6.5 D-005 / D-006 필터 동작 룰 (분석 §4.3 #9~#11 / xfdl:438~499)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-401 | D-005 (사용자 필터) oninput → `fn_userFromFilter(searchValue, "USER")` | 사용자 필터 입력 | type=USER 분기로 진입 | xfdl:438~443 |
| V-402 | D-006 (부서 필터) oninput → `fn_userFromFilter(searchValue, "DEPT")` | 부서 필터 입력 | type=DEPT 분기로 진입 | xfdl:445~450 |
| V-403 | type=USER + searchValue null + deptSearchValue null → `ds_userFrom.filter("")` (필터 해제) | 양쪽 비움 | 전체 노출 | xfdl:457~459 |
| V-404 | type=USER + searchValue null + deptSearchValue 존재 → DEPT_NM 단독 LIKE upper | 사용자만 비움 | DEPT 필터만 적용 | xfdl:460~462 |
| V-405 | type=USER + searchValue 존재 → USER_ID / USER_EMP_NO / USER_NM 3 컬럼 OR LIKE upper (대소문자 무시) | 사용자 입력 | 3 컬럼 OR 검색 | xfdl:464~467 |
| V-406 | type=USER + searchValue 존재 + deptSearchValue 존재 → V-405 결과 AND DEPT_NM LIKE upper | 양쪽 입력 | 결합 AND 필터 | xfdl:468~470 |
| V-407 | type=DEPT + searchValue null + userSearchValue null → 필터 해제 | 양쪽 비움 | 전체 노출 | xfdl:478~480 |
| V-408 | type=DEPT + searchValue null + userSearchValue 존재 → USER 3 컬럼 OR LIKE upper | 부서만 비움 | USER 필터만 | xfdl:481~484 |
| V-409 | type=DEPT + searchValue 존재 → DEPT_NM LIKE upper | 부서 입력 | DEPT 단독 | xfdl:486 |
| V-410 | type=DEPT + searchValue 존재 + userSearchValue 존재 → V-409 결과 AND USER 3 컬럼 OR LIKE upper | 양쪽 입력 | 결합 AND 필터 | xfdl:488~491 |
| V-411 | 최종 `ds_userFrom.filter(filterString)` 적용 | 분기 종료 | 필터 적용 | xfdl:496 |

### 6.6 save 콜백 동작 룰 (분석 §4.3 #6 / xfdl:384~404)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-501 | `nErrorCode == 0` → bottom status 메시지 `strErrorMsg["ds_userFrom"]+ "건 조회 되었습니다."` 표시 | save 콜백 성공 | "{N}건 조회 되었습니다." (저장 메시지 아닌 조회 메시지 — As-Is 보존) | xfdl:386 |
| V-502 | 4 dataset clearData — `ds_copyRolegrp` / `ds_copyUser` / `ds_userTo` / `ds_userFrom` | save 콜백 성공 | 화면 초기화 1단계 | xfdl:389~392 |
| V-503 | `fn_searchUserList()` 재호출 (ds_userFrom 새로고침) | save 콜백 성공 | 화면 초기화 2단계 — 전체 사용자 List 재조회 (V-502 이후 ds_userFrom 채움) | xfdl:395 |
| V-504 | 입력 4 필드 초기화 — `edt_infReqNo` / `edt_description` / `edt_userFilter` / `edt_userIdCopy` set_value("") | save 콜백 성공 | 화면 초기화 3단계 | xfdl:396~400 |
| V-505 | `ds_userFrom.filter("")` 필터 해제 | save 콜백 성공 | 화면 초기화 4단계 (필터 잔재 제거) | xfdl:399 |
| V-506 | `nErrorCode != 0` → `gfn_commonBottomStatus_msg(strErrorMsg)` 표시 (오류 메시지 그대로) | save 콜백 실패 | 오류 표시만 | xfdl:402 |

### 6.7 searchUserList / search 콜백 동작 룰 (분석 §4.3 #6 / xfdl:367~382)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-601 | searchUserList 콜백 성공 → `strErrorMsg["ds_userFrom"]+ "건 조회 되었습니다."` | searchUserList 콜백 | bottom status | xfdl:369~373 |
| V-602 | search 콜백 성공 → `strErrorMsg["ds_userCopy"]+ "건 조회 되었습니다."` (outDataset 명은 ds_copyUser 인데 메시지 키는 ds_userCopy — As-Is 보존 / 오타 추정) | search 콜백 | bottom status | xfdl:377~378 |
| V-603 | 모든 콜백 nErrorCode != 0 → `gfn_commonBottomStatus_msg(strErrorMsg)` | 분기 else | 오류 메시지 | xfdl:372 / 380 / 402 |

### 6.8 onload 동작 룰 (분석 §4.3 #1~#2 / xfdl:251~279)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-701 | `gfn_formOnLoad(obj, true)` 호출 | Form onload | 폼 라이프사이클 진입 | xfdl:253 |
| V-702 | `gfn_gridSelectedRow(grd_userFrom, "red", "blue", "")` 호출 | onload | grd_userFrom 의 선택 행 색상 (red/blue/배경 없음) 설정 | xfdl:254 |
| V-703 | `gfn_quickMenuSet` 3 회 호출 — grd_copyRoleGroup / grd_userTo / grd_userFrom 에 우클릭 메뉴 등록 (인자 `"", true, false, false, false, false` — sort 만 활성) | onload | 우클릭 메뉴 등록 | xfdl:256~258 |
| V-704 | `fn_button()` 호출 — commonTopButton (`btn_search` + `btn_save`) + commonLeftButton (CHK 컬럼 전체선택) 등록 | onload | 공통 버튼 hookup | xfdl:260 |
| V-705 | `fn_searchUserList()` 자동 호출 — 초기 진입 시 전체 사용자 List 즉시 조회 | onload | 진입 즉시 그리드 초기 충전 | xfdl:261 |

### 6.9 commonLeftButton 동작 룰 (분석 §3.6 EX-002 / xfdl:274~278)

| # | 룰 | 트리거 | 동작 | 근거 |
|---|---|---|---|---|
| V-801 | `fn_commonLeft_onload(this, grd_userFrom, div_leftMenu, new Array(""), "CHK")` 호출 | onload (fn_button 내부) | grd_userFrom 의 CHK 컬럼 기준 전체선택/전체해제 토글 (외부 공통 좌측 메뉴 컴포넌트) | xfdl:274~278 |

---

## 7. 상태값 ST-NNN (분석 §10.1 인용)

| ID | As-Is 상태값 | 의미 | 영향 영역 |
|---|---|---|---|
| ST-001 | `CHK = "1"` / `"0"` | 셔틀 이동 대상 마킹 (checkbox 선택) | GE-002-1 / GE-003-1 + B-003 / B-004 트리거 + commonLeftButton 전체선택 |
| ST-002 | `infReqNoFlag` boolean | 정보처리의뢰서번호 + 처리사유 입력 여부 결합 (둘 다 채워졌으면 true) — V-003 confirm 메시지 분기 | xfdl fn_save (xfdl:320~356) |
| ST-003 | `ds_copyUser.rowcount == 0` / `ds_userTo.rowcount == 0` | 저장 전 사전조건 검증 (V-001 / V-002) | xfdl fn_save (xfdl:327~335) |
| ST-004 | `END_ACTIVE_DATE > SYSDATE` (SQL WHERE) | 활성 종료일 비교 — 미만/같음 시 사용자 List 제외 | selectUserList WHERE (xml:16) |
| ST-005 | `USE_TP = 'Y'` (SQL WHERE) | 사용중 사용자 만 노출 | selectUserList WHERE (xml:17) |
| ~~ST-006~~ | ~~`USAGE_YN = 'A'` (EAI SQL WHERE)~~ | ~~EAI 부서 활성 행 만 인입~~ | ~~selectUserList scalar subquery WHERE (xml:11~12)~~ → **폐기 (Q-004 해소 2026-05-31, 정책 #2)** EAI → TB_MCM_DEPT_INFO 전환 |
| ST-006-NEW | `D.USE_TP = 'Y'` (TB_MCM_DEPT_INFO JOIN WHERE) | DMES 자체 부서 마스터 활성 행 만 인입 (To-Be 등가물) | selectUserList LEFT JOIN MCMAPUSER.TB_MCM_DEPT_INFO D ON D.DEPT_CD=S.DEPT_CD AND D.USE_TP='Y' |

---

## 8. 권한 / 접근 제어

As-Is 코드 (xfdl + java) 내에 명시적 권한 체크 호출 없음 (`gfn_authority` / role check grep 0 hits). 공통 topMenu 의 `btn_search` + `btn_save` 기본 버튼만 등록 (xfdl:269). **To-Be**: 본 화면 자체 권한 분기 ✗ — To-Be 외부 권한 프로세스 모델 (전사 정책) 에 위임 (사용자 결정 — masterCodeMng / cma 4 화면과 동일).

| 항목 | 값 | 근거 |
|---|---|---|
| 화면 진입 권한 | (As-Is 명시 ✗ — 포털 메뉴 권한 모델 종속) | xfdl 전체 grep |
| 버튼 권한 | (As-Is 명시 ✗) | 동일 |
| To-Be 정책 | To-Be 외부 권한 프로세스 (전사 정책) 위임 — 본 화면 자체 권한 분기 ✗ | 사용자 결정 |

---

## 9. 팝업 / 연계 화면 (P-NNN — 분석 §5 인용)

해당 없음. 본 화면 xfdl Script 의 `gfn_openPopup` / `OpenForm` grep 0 건. 외부 화면 호출 ✗.

---

## 10. 메시지 / 알림

| # | 메시지 | 유형 | 발생 위치 (xfdl:line) | 근거 |
|---|---|---|---|---|
| M-001 | "Copy 대상 사용자 ID/사번 입력 후 조회해주세요." | warning | V-101 / xfdl:301 | - |
| M-002 | "복사 대상 사용자가 조회되지 않았습니다." | warning | V-001 / xfdl:328 | - |
| M-003 | "권한 생성 대상자가 없습니다." | warning | V-002 / xfdl:333 | - |
| M-004 | "정보처리의뢰서번호/처리사유가 입력되지 않았습니다.\n권한부여 선처리 하시겠습니까?" | confirm | V-003 분기 (infReqNoFlag==false) / xfdl:353 | - |
| M-005 | "권한을 복사 하시겠습니까?" | confirm | V-003 분기 (infReqNoFlag==true) / xfdl:355 | - |
| M-006 | "{N}건 조회 되었습니다." (searchUserList 콜백 — `strErrorMsg["ds_userFrom"]`) | bottom status | V-601 / xfdl:370 | - |
| M-007 | "{N}건 조회 되었습니다." (search 콜백 — `strErrorMsg["ds_userCopy"]` — outDataset 명과 mismatch, As-Is 보존) | bottom status | V-602 / xfdl:378 | - |
| M-008 | "{N}건 조회 되었습니다." (save 콜백 — `strErrorMsg["ds_userFrom"]` — 저장 메시지 아닌 조회 메시지 As-Is 보존) | bottom status | V-501 / xfdl:386 | - |
| M-009 | (오류 메시지 그대로) — `gfn_commonBottomStatus_msg(strErrorMsg)` | bottom status | V-603 (모든 분기) / xfdl:372 / 380 / 402 | - |
| M-010 | (Java 예외 메시지) — `log.error("Exception occur", e)` + `IllegalTaskException` wrap | log.error + throw | java:83~84 | - |
| M-011 | (Java 로그) — "##########	SaveRoleGroupHis RoleGroup 이력 저장 시작" (클래스명 SaveRoleGroupCopy 인데 SaveRoleGroupHis 로 기록 — As-Is 오타 보존) | log.debug | java:28 | - |
| M-012 | (Java 로그) — "##########	INSERT ROLE COPY HIS (A) = [{}] " | log.debug | java:66 | - |

> Java 의 로그 메시지 오타 (SaveRoleGroupHis ↔ SaveRoleGroupCopy / insertRollHis ↔ insertRoleHis) 는 As-Is 그대로 보존. **To-Be**: 정정 (분석 §11 #14 / #15).

---

## 11. As-Is 인용 정합 (분석리포트 §1~§13 ↔ 본 §1~§10)

| 본 § | 인용 정본 (분석리포트) | 인용 검증 |
|---|---|---|
| §1.1 | 분석 §1 | 1byte 일치 |
| §1.2 | 분석 §1 + 가이드 명명 룰 | 4 식별자 1byte 동일 |
| §2 | 분석 §3.1 | 영역 11 행 |
| §3.1 | 분석 §3.2 | 1 행 일치 |
| §3.2 | 분석 §3.3 (A~D 4 그리드) | G 3 + GE 12 = 15 컬럼 일치 |
| §4.1 | 분석 §3.4 | D 12 행 일치 |
| §4.2 | 분석 §3.5 | "해당 없음" 보존 |
| §5.1 | 분석 §4.1 | 5 행 일치 |
| §5.1-1 | 분석 §4.2 | "해당 없음" 보존 |
| §5.2 | 분석 §6 + §8.3 | 3 action + 5 SQL ID + 2 외부 Mapper SQL 일치 |
| §6 | 분석 §4.3 (메서드 표) | V-001~V-801 모두 cite |
| §7 | 분석 §10.1 | 6 ST 일치 |
| §8 | (To-Be 외부 권한 프로세스 위임 — 사용자 결정) | 본 화면 권한 분기 ✗ |
| §9 | 분석 §5 | "해당 없음" 보존 |
| §10 | 분석 §4.3 + java | M-001~M-012 모두 cite |
