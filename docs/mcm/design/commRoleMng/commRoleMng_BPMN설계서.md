---
screenId: commRoleMng
asIsId: CommRoleMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
갱신일: 2026-05-31
작성자: Agent
---

# mcm — 역할 관리 BPMN설계서

> **퍼미션 모델 v2 (2026-11-27)**: 이 화면의 권한 모델이 바뀌었다. 문서 맨 끝 "퍼미션 (퍼미션 모델 v2)" 절이 아래 본문보다 우선한다. 본문의 옛 `TB_MCM_SEC_ROLE_MAPPING`·PERMISSION_ID 서술은 이력이다.

## §0. 환경 제약 (분석리포트 §0 동일)

| 항목 | 결정 | 사유 |
|---|---|---|
| Auto Manifest Runner (R-14) | 적용 ✗ | mui 자산 비정합 |
| R-13 SOP 30 Step | 미실행 | manifest 부재 |
| 정합체크서 §A.3 / §A.A-R12-1 / §D.4 | ✗ + 사유 명시 | "Runner mui 미지원" |
| 가이드 템플릿 (WinForms 전제) | 절 구조 참고만 | mui 등가물 (BPMN sequenceFlow.name = action) 매핑 |

> **BackEnd / BPMN 측 확정 값**:
> - 프로세스 ID: `commRoleMng` (= serviceId, **process name = "역할 관리"** — Q-012 해소)
> - Bean명: `commRoleMngService`
> - moduleId / serviceId / API URL 정본: 04 §A.2-3
> - UI→BFF: `POST /api/mcm/oasis/commRoleMng/{action}`
> - BFF→BE: `POST /oasis/commRoleMng/{action}`
> - As-Is BPMN URL: `csa::CommRoleMng` (xfdl:370) → To-Be 매핑 `mcm.csa.commRoleMng`
> - **To-Be Entity 명명** (정책 #6 (A) — cactus-core sec 모델 잔존 보존): `SecRole` (TB_MCM_SEC_ROLE) / `SecRoleMapping` (TB_MCM_SEC_ROLE_MAPPING, `@IdClass(SecRoleMappingId.class)` 복합 PK). Repository = `SecRoleRepository` / `SecRoleMappingRepository`
>
> **명명 룰**: MES 단일 룰 — serviceId=screenId=pageId=pageName=`commRoleMng` camelCase. cactus oasis ScriptTask 표준 패턴 적용 (가이드 §6-C/D/E + §7-A/B — Q-015 closed).
>
> **Frontend 연계 값** (기능설계서 §1.2 와 동일): mesModule=`m-mcm` / pageId=`commRoleMng` / 페이지 유형=D.

---

## §1. 프로세스 개요

### §1.1 API 엔드포인트 총괄

> 분석 §11 (C1~C6) + 기능 §5 (B-NNN / BS-NNN) 인용. 본 화면은 OASIS 단일 채택 (충족 0~1 — §11.2 결정 ✓). action 7 enum 매핑.

| API-ID | Method (POST 고정) | URL (T3-D enum) | 설명 | action (7 enum) | 트리거 (B-NNN / BS-NNN 인용) |
|---|---|---|---|---|---|
| API-001 | POST | `POST /oasis/commRoleMng/searchCmRole` | 역할 마스터 그리드 조회 | search → BPMN `searchCmRole` 분기 | B-001 (btn_search) |
| API-002 | POST | `POST /oasis/commRoleMng/saveCmRole` | 역할 마스터 일괄 저장 (INSERT/UPDATE/DELETE 행상태 분기 — CommonMultiSaveTask) | save → BPMN `saveCmRole` 분기 | B-003 (btn_save) |
| API-003 | POST | `POST /oasis/commRoleMng/searchCmRoleMap` | 선택 역할의 현재 권한 조회 | search → BPMN `searchCmRoleMap` 분기 | (간접) ds_main_onrowposchanged (xfdl:756) — 행 선택 시 자동 |
| API-004 | POST | `POST /oasis/commRoleMng/saveCmRoleMap` | 현재 권한 일괄 저장 (INSERT + DELETE 분기) | save → BPMN `saveCmRoleMap` 분기 | BS-001 (btn_right 삭제) + BS-002 (btn_left 추가) |
| API-005 | POST | `POST /oasis/commRoleMng/searchCmPerm` | 전체 권한 후보 조회 (선택 ROLE_ID 미할당 권한 풀) | search → BPMN `searchCmPerm` 분기 | B-012 (btn_permSearch) + (간접) ds_main_onrowposchanged (xfdl:758) |
| API-006 | POST | `POST /oasis/commRoleMng/lov` | LoV 일괄 조회 (**To-Be MENU_ID 마스터 only — BIZ_SYSTEM 제거 / 정책 #1**) | search (LoV) → BPMN `lov` 분기 (**Task_17ggria 단일** — Task_0r5ztlq 제거) | (간접) CommRoleMng_onload (xfdl:316) — Form onload 시 자동 |

### §1.2 API 패턴 자동 판정 결과 (분석 §11 인용)

| 항목 | 값 |
|---|---|
| C1~C6 충족 개수 (분석 §11.1 인용) | **0** (mui 환경 — As-Is SP case 분기 패턴 부재 + 외부 SP 호출 0 + 동적 컬럼 응답 0 — 모든 C 조건 N) |
| 채택 패턴 (3 enum: OASIS / 잠정 OASIS / Phase 7) | **OASIS 단일 BPMN** (충족 0 → 자동 채택) |
| API 라우팅 enum (T3-D 결과) | `POST /oasis/{serviceId}/{action}` (= `POST /oasis/commRoleMng/{action}`) |
| Q-NNN 등재 여부 (충족 2~3 일 때만 Y) | N (충족 0 → 잠정 OASIS 아님) |

### §1.3 As-Is BPMN ↔ To-Be 매핑 (분석 §7 + §8 인용)

> 분석 §7 (cactus oasis Task 9) + §8.2 (sequenceFlow.name 8 action) 1:1 매핑. As-Is 미호출 2 분기 (`searchCmRoleMapPnt` / `pntRoleIdPop`) 는 To-Be 제거 (분석 §11 #11 결정 ✓).

| As-Is BPMN Task | As-Is sequenceFlow.name | As-Is Mapper sqlKey | To-Be action | To-Be 채택 |
|---|---|---|---|---|
| Task_00oihyb (역할 조회) | searchCmRole | CommRoleMngMapper.selectCommRole | searchCmRole | ○ |
| Task_1dh8dal (역할 저장) | saveCmRole | CommRoleMngMapper.{insertCommRole / updateCommRole / deleteCommRole} | saveCmRole | ○ |
| Task_0xxo78b (역할 부여 조회) | searchCmRoleMap | CommRoleMngMapper.selectCommRoleMapList | searchCmRoleMap | ○ |
| Task_0weig4p (역할 부여 저장) | saveCmRoleMap | CommRoleMngMapper.{insertCommRoleMap / ~~updateCommRoleMap~~ / deleteCommRoleMap} | saveCmRoleMap | ○ (updateCommRoleMap = **To-Be 제거** / Q-011 closed — JPA saveAll 자연 흡수. updateSqlKey property 자체 삭제) |
| Task_1re6tzu (PERMISSION 조회) | searchCmPerm | CommRoleMngMapper.selectCommPerm | searchCmPerm | ○ |
| Task_0f9lt7e (부모역할 부여 조회) | searchCmRoleMapPnt | CommRoleMngMapper.selectCommRoleMapList (재사용) | (제거) | × — As-Is 미호출 |
| Task_1sm19m8 (부모 역할 POPUP) | pntRoleIdPop | CommRoleMngMapper.selectCommPntRoleMapPop | (제거) | × — As-Is 미호출 + Mapper 본문 절반 주석 |
| ~~Task_0r5ztlq (lov_SUBSYSTEM 조회)~~ | ~~lov~~ | ~~CommObjMngMapper.selectAppHostId (cross-namespace 외부)~~ | (제거) | × — **정책 #1 일괄 폐기** (BIZ_SYSTEM_CODE / APP_HOST_ID 컬럼·LoV 제거) + cross-namespace 호출 제거 |
| Task_17ggria (lov_MENU_ID 조회) | lov | **`commRoleMngMapper.selectMenuId`** (To-Be 본 namespace 내재화) | lov (Task_17ggria 단일) | ○ |

> **To-Be 채택 = 6 Task / 6 action enum** (searchCmRole / saveCmRole / searchCmRoleMap / saveCmRoleMap / searchCmPerm / lov). As-Is 9 Task 중 3 Task 제거 (Task_0f9lt7e / Task_1sm19m8 / **Task_0r5ztlq**). lov 분기는 단일 Task (MENU_ID only).

---

## §2. 프로세스별 BPMN 상세

### §2.1 화면 초기화 프로세스 (CommRoleMng_onload + fn_lov + fn_formAfterOnload)

```
[화면 진입 (탭 활성화)]
    │
    ▼
fn_formBeforeOnload (xfdl:283)
    ├── div_topMenu.fn_commonTop_onload (B-001~B-004 등록)
    ├── div_leftMenu.fn_commonLeft_onload (B-005~B-007 등록)
    ├── div_rightMenu(1).fn_commonRight_onload (B-008~B-011 등록)
    └── div_rightMenu(2).fn_commonRight_onload (B-012 btn_permSearch 등록)
    │
    ▼
CommRoleMng_onload (xfdl:316)
    ├── div_object_id.commonDynamic_onload (P-001 OBJECT 조회 컴포넌트 초기화)
    ├── gfn_formOnLoad(obj)
    ├── gfn_setEnable(div_mainDetail, false)  [상세 영역 비활성화]
    ├── gfn_gridSelectedRow × 3 (red/blue 셀 강조)
    └── fn_lov() 호출
        │
        ▼
   POST /oasis/commRoleMng/lov (API-006)
        │ Request Body: {}  (파라미터 없음)
        │
        ▼
   BPMN 분기 (sequenceFlow.name="lov")
        │
        ▼
   Task_17ggria (lov_MENU_ID 조회 — CommonSelectTask, **To-Be 단일 Task**)
        │ sqlKey: commRoleMngMapper.selectMenuId (본 namespace 내재화 — Q-015 closed)
        │ resultKey: ds_selectMenuId
        │
        ▼
   응답: 200 → ds_lovMenuId = ds_selectMenuId
   (※ Task_0r5ztlq lov_SUBSYSTEM 조회 분기는 정책 #1 일괄 폐기로 To-Be 제거됨)

    │
    ▼
gfn 라이프사이클 — fn_formAfterOnload (xfdl:316~321 추정 — As-Is 본문 등재 미확인)
    │ (단, ds_main_onrowposchanged 트리거는 행 미존재 시 미실행)
```

### §2.2 조회 프로세스 (B-001 btn_search — searchCmRole)

```
[B-001 btn_search 클릭] (또는 Enter 키)
    │
    ▼
fn_search (xfdl:630) → fn_run("searchCmRole") (xfdl:378)
    │
    ▼
sArgs = gfn_scanOpenerComponent(div_search.form)
    │ (= edt_ROLE_ID + edt_ROLE_NM + cbo_USE_TP + cbo_bizSystemCode 자동 직렬화)
    │ Request Body: { "edt_ROLE_ID": "...", "edt_ROLE_NM": "...", "cbo_USE_TP": "Y", "cbo_bizSystemCode": "..." }
    │ sOutDs = "ds_main=ds_main"
    │
    ▼
화면: 로딩 시작 (Spinner + AgDataGrid loading prop)
    │
    ▼
POST /oasis/commRoleMng/searchCmRole (API-001)
    │
    ▼
BPMN 분기 (sequenceFlow.name="searchCmRole")
    │
    ▼
Task_00oihyb (역할 조회 — CommonSelectTask)
    │ sqlKey: #{serviceId}Mapper.selectCommRole
    │ resultKey: ds_main
    │ 서버 처리: SELECT TB_MCM_SEC_ROLE (10 컬럼) + scalar subquery (ROLE_GROUP_ID) + WHERE 동적 4 필터
    │           ORDER BY START_ACTIVE_DATE
    │
    ▼
응답:
    ├─→ 200 성공: ds_main 갱신 → grd_main 표시 + commonBottomStatus "{N}건 조회 되었습니다."
    │   IF rowcount > 0 → gfn_setEnable(div_mainDetail, true) [상세 활성화] (xfdl:458)
    │   IF rowcount == 0 → gfn_setEnable(div_mainDetail, false)
    │
    └─→ 400/500: commonBottomStatus(strErrorMsg) (As-Is 단순 메시지 표시 — To-Be 는 useGfnMessage 토스트 + ErrorModal)
```

### §2.3 행 선택 프로세스 (ds_main_onrowposchanged — searchCmRoleMap + searchCmPerm)

```
[grd_main 행 클릭 또는 rowposition 변경]
    │
    ▼
ds_main_onrowposchanged (xfdl:740)
    │
    ▼
IF (rowType != 2 AND rowposition > -1 AND rowcount != 0 AND reason != 52)  [신규 행 + 빈 + 미변경 제외]
    │
    ├── sub1/sub2 헤드 CHK="0" 초기화 (xfdl:746~747)
    ├── fn_run("searchCmRoleMap") 호출
    └── fn_run("searchCmPerm") 호출 (병렬)

│ fn_run("searchCmRoleMap"):
│   sArgs = "ROLE_ID=" + ds_main.ROLE_ID
│   sOutDs = "ds_roleMap=ds_roleMap"
│   │
│   ▼
│   POST /oasis/commRoleMng/searchCmRoleMap (API-003)
│   │
│   ▼
│   BPMN 분기 (sequenceFlow.name="searchCmRoleMap")
│   │
│   ▼
│   Task_0xxo78b (역할 부여 조회 — CommonSelectTask)
│       sqlKey: #{serviceId}Mapper.selectCommRoleMapList
│       resultKey: ds_roleMap
│       서버 처리: SELECT TB_MCM_SEC_ROLE_MAPPING A + TB_MCM_SEC_OBJ B + TB_MCM_SEC_PERM C
│                 WHERE A.ROLE_ID = #{ROLE_ID} (+ BIZ_SYSTEM 종속 필터)
│   │
│   ▼
│   응답: 200 → ds_roleMap 갱신 (11 컬럼 + PERMISSION_ID_UPPER 콜백 계산) → grd_sub1 표시
│         + commonBottomStatus "{N}건 조회 되었습니다."

│ fn_run("searchCmPerm"):
│   sArgs = "ROLE_ID=" + ds_main.ROLE_ID
│   sOutDs = "ds_perm=ds_perm"
│   │
│   ▼
│   POST /oasis/commRoleMng/searchCmPerm (API-005)
│   │
│   ▼
│   BPMN 분기 (sequenceFlow.name="searchCmPerm")
│   │
│   ▼
│   Task_1re6tzu (PERMISSION 조회 — CommonSelectTask)
│       sqlKey: #{serviceId}Mapper.selectCommPerm
│       resultKey: ds_perm
│       서버 처리: SELECT TB_MCM_SEC_PERM A
│                 WHERE A.USE_TP='Y' AND NOT EXISTS (B.PERMISSION_ID + ROLE_ID)
│   │
│   ▼
│   응답: 200 → ds_perm 갱신 (5 컬럼 + PERMISSION_ID_UPPER 콜백 계산) → grd_sub2 표시

    │
    ▼
IF rowType == 2 (신규 행) → cbo_folder + edt_id 활성화 / ELSE → 비활성화 (xfdl:763~769)
```

### §2.4 신규 등록 프로세스 (B-008 → B-003)

```
[B-008 btn_rowAdd 클릭]
    │
    ▼
fn_rowAdd (xfdl:687)
    ├── ds_main.addRow() (rowType=2 INSERTED)
    ├── gfn_setEnable(div_mainDetail, true)
    ├── 디폴트 세팅: USE_TP="Y" / START_ACTIVE_DATE=gfn_today() / END_ACTIVE_DATE="99991231"
    └── cbo_folder + edt_id 활성화 (rowType=2 분기)
    │
    ▼
[D-NNN 필드 입력]
    ├── D-001 BIZ SYSTEM (Combo, ds_lovSubSystem)
    │   onitemchanged → ds_lovMenuId.filter("BIZ_SYSTEM_CODE == '{값}'")
    ├── D-003 메뉴 ID (Combo, ds_lovMenuId — 종속 필터)
    ├── D-004 ID (Text, maxlength=100)
    │   → ds_main_oncolumnchanged → ROLE_ID 자동 합성 ("role_"+MENU_ID+"_"+ID)
    ├── D-005 역할명 / D-006 역할 설명 / D-007 사용 여부 / D-008/D-009 유효기간 입력
    │
    ▼
[B-003 btn_save 클릭]
    │
    ▼
fn_save (xfdl:648)
    │
    ▼
fn_before_save_chk (xfdl:667)
    ├── V-005: gfn_isDatasetChanged(ds_main) — 변경 없음 시 "저장할 데이터가 없습니다." (information) + return false
    └── V-006: gfn_cpRequired(this, "ROLE_ID") — ROLE_ID 필수 검증
    │
    ▼
확인 다이얼로그 "저장하시겠습니까?" → fn_msgSaveCallBack rtn=true
    │
    ▼
fn_run("saveCmRole") (xfdl:386)
    │ sInDs = "ds_main=ds_main:U" (변경 행만 직렬화 — rowType 분기)
    │ sOutDs = "" (As-Is 빈값 — saveCmRole 콜백에서 별도 fn_search 재호출)
    │
    ▼
POST /oasis/commRoleMng/saveCmRole (API-002)
    │
    ▼
BPMN 분기 (sequenceFlow.name="saveCmRole")
    │
    ▼
Task_1dh8dal (역할 저장 — CommonMultiSaveTask)
    │ paramKey: ds_main
    │ resultKey: ds_main
    │ insertSqlKey: #{serviceId}Mapper.insertCommRole
    │ updateSqlKey: #{serviceId}Mapper.updateCommRole
    │ deleteSqlKey: #{serviceId}Mapper.deleteCommRole
    │
    │ 서버 처리 (행상태별 분기):
    │   ├── rowType=2 (INSERTED): insertCommRole 호출 — TB_MCM_SEC_ROLE INSERT (8 컬럼 + audit)
    │   ├── rowType=4 (UPDATED):  updateCommRole 호출 — UPDATE WHERE ROLE_ID + audit
    │   └── rowType=8 (DELETED):  deleteCommRole 호출 — DELETE WHERE ROLE_ID + NOT EXISTS 2회 (참조 무결성)
    │
    ▼
응답:
    ├─→ 200: gfn_message "저장 되었습니다." (info) → fn_msgSuccessSave 콜백 (rtn=true) → fn_search() 재호출
    │
    ├─→ 400: commonBottomStatus(strErrorMsg) (As-Is)
    │   → To-Be: useGfnMessage 토스트 (validation error)
    │
    ├─→ 409 (참조 무결성 위반 — DELETE 시 NOT EXISTS 차단): 422 BUSINESS_RULE_VIOLATION
    │   → To-Be: "연결된 데이터가 존재하여 삭제할 수 없습니다." (다이얼로그)
    │
    └─→ 500: commonBottomStatus + ErrorModal
```

### §2.5 수정 프로세스 (grd_main 행 선택 → D-NNN 수정 → B-003)

```
[grd_main 행 선택] → ds_main_onrowposchanged (§2.3) → 상세 양방향 바인딩
    │
    ▼
[D-NNN 수정 가능 필드만 편집 — 기능 §7.3]
    ├── 기존 행 (rowType=1): MENU_ID / ID readonly (xfdl:768)
    └── 신규 행 (rowType=2): MENU_ID / ID 편집 가능 (xfdl:764)
    │
    ▼
ds_main 컬럼 변경 → rowType=4 (UPDATED)
    │
    ▼
[B-003 btn_save 클릭] → fn_save → fn_before_save_chk → 확인 다이얼로그 → fn_run("saveCmRole")
    │
    ▼ (§2.4 와 동일 — updateSqlKey 분기)
    Task_1dh8dal → updateCommRole 호출
    │ 서버 처리: UPDATE TB_MCM_SEC_ROLE
    │           SET ROLE_NM, ROLE_DESC, MENU_ID, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE + audit
    │           WHERE ROLE_ID = #{ROLE_ID}
    │
    ▼
응답:
    ├─→ 200: 토스트 / fn_search() 재조회
    ├─→ 400: validation 에러
    ├─→ 409 (동시 수정 충돌 — UPDATED_AT 비교 도입 시 — To-Be 추가 검토 Q-NEW): "잠시 후 다시 시도"
    └─→ 422: 서버 반환 메시지
```

### §2.6 삭제 프로세스 (B-009 → B-003)

```
[B-009 btn_rowDelete 클릭]
    │
    ▼
fn_rowDelete (xfdl:710)
    ├── V-003: roleGrpId != null → "연결된 [역할그룹] 이 존재합니다. 제외 후 삭제 하세요" (warning) → return
    └── V-004: ds_roleMap.rowcount > 0 → "연결된 [권한] 이 존재합니다. 제외 후 삭제 하세요" (warning) → return
    │
    ▼ (V-003 + V-004 통과)
gfn_deleteRow(ds_main, nRow) → rowType=8 (DELETED)
    │
    ▼
[B-003 btn_save 클릭] → fn_save → fn_run("saveCmRole")
    │
    ▼ (§2.4 와 동일 — deleteSqlKey 분기)
Task_1dh8dal → deleteCommRole 호출
    │ 서버 처리: DELETE FROM TB_MCM_SEC_ROLE A
    │           WHERE A.ROLE_ID = #{ROLE_ID}
    │           AND NOT EXISTS (TB_MCM_SEC_ROLEGROUP_MAPPING)  [재검증 — V-003 화면 검증과 별도]
    │           AND NOT EXISTS (TB_MCM_SEC_ROLE_MAPPING)       [재검증 — V-004 화면 검증과 별도]
    │
    ▼
응답:
    ├─→ 200: 토스트 / fn_search() 재조회
    └─→ 422 (NOT EXISTS 실패 — rowcount=0): "참조된 데이터가 존재하여 삭제할 수 없습니다." (서버측 검증)
```

### §2.7 권한 추가/삭제 프로세스 (BS-001 + BS-002 — saveCmRoleMap)

```
[BS-002 btn_left 클릭 — 현재권한 추가]
    │
    ▼
div_main_div_buttonGrp_btn_left_onclick (xfdl:782)
    │
    ▼
fn_appendRoleMapRow (xfdl:572)
    ├── V-001: vRoleId = ds_main.ROLE_ID → null 시 "선택된 ROLE ID가 없습니다." (warning) → return
    ├── V-002: vObjId = div_object_id.fn_get_value() → null 시 "OBJECT ID 입력 후 추가해 주세요." (warning) → return
    │
    ▼ (V-001 + V-002 통과)
ds_roleMap.set_enableevent(false)
    │
    ▼
FOR i IN ds_perm:
    IF ds_perm.CHK[i] == "1" AND PERMISSION_ID[i] != null:
        ds_roleMap.addRow() (rowType=2 INSERTED)
        ds_roleMap.setColumn(ROLE_ID = vRoleId)
        ds_roleMap.setColumn(OBJECT_ID = vObjId)
        ds_roleMap.setColumn(PERMISSION_ID = ds_perm.PERMISSION_ID[i])
    │
    ▼
ds_roleMap.set_enableevent(true)
    │
    ▼
fn_run("saveCmRoleMap") (xfdl:404)
    │ sInDs = "ds_roleMap=ds_roleMap:U" (rowType=2 + 8 분리 직렬화)
    │
    ▼
POST /oasis/commRoleMng/saveCmRoleMap (API-004)
    │
    ▼
BPMN 분기 (sequenceFlow.name="saveCmRoleMap")
    │
    ▼
Task_0weig4p (역할 부여 저장 — CommonMultiSaveTask)
    │ paramKey: ds_roleMap
    │ resultKey: ds_roleMap
    │ insertSqlKey: #{serviceId}Mapper.insertCommRoleMap
    │ **(updateSqlKey property 자체 삭제 — Q-011 closed, JPA saveAll 자연 흡수)**
    │ deleteSqlKey: #{serviceId}Mapper.deleteCommRoleMap
    │
    │ 서버 처리 (행상태별 분기):
    │   ├── rowType=2 (INSERTED): insertCommRoleMap 호출 — TB_MCM_SEC_ROLE_MAPPING INSERT (ROLE_ID + OBJECT_ID + PERMISSION_ID + audit)
    │   └── rowType=8 (DELETED): deleteCommRoleMap 호출 — DELETE WHERE PK 3 컬럼 매칭
    │
    ▼
응답:
    ├─→ 200: gfn_message "저장 되었습니다." (info) → fn_msgSuccessSave 콜백
    │   → fn_run("searchCmRoleMap") + fn_run("searchCmPerm") 재호출 (양쪽 그리드 갱신)
    │
    ├─→ 400/500: commonBottomStatus(strErrorMsg)


[BS-001 btn_right 클릭 — 현재권한 삭제]
    │
    ▼
div_main_div_buttonGrp_btn_right_onclick (xfdl:773)
    │
    ▼
fn_removeRoleMapRow (xfdl:557)
    │ ds_roleMap.set_enableevent(false)
    │
    │ FOR i FROM ds_roleMap.rowcount DOWN TO 0:
    │     IF ds_roleMap.CHK[i] == "1":
    │         ds_roleMap.deleteRow(i)  (rowType=8 DELETED)
    │
    │ ds_roleMap.set_enableevent(true)
    │
    ▼
fn_run("saveCmRoleMap") (xfdl:568)
    │
    ▼ (위 BS-002 와 동일 BPMN 분기 — deleteSqlKey 만 호출)
    Task_0weig4p → deleteCommRoleMap 호출
```

---

## §3. 에러 처리 매트릭스

| HTTP 상태 | 에러 코드 | 화면 처리 | 사용자 메시지 |
|---|---|---|---|
| 400 | VALIDATION_ERROR | useGfnMessage 토스트 (warning) / fieldErrors → 필드 에러 표시 | "{필드명}는(은) 필수 입력 항목입니다." (V-006 gfn_cpRequired 결과 등) |
| 400 | BAD_REQUEST | commonBottomStatus(strErrorMsg) (As-Is) → 토스트 (To-Be) | 서버 반환 message |
| 401 | UNAUTHORIZED | 로그인 페이지 리다이렉트 | - |
| 403 | FORBIDDEN | 토스트 (error) | "권한이 없습니다" (역할 관리 = ADMIN 전용 — §8 권한) |
| 404 | NOT_FOUND | 토스트 (warning) + fn_search() 재조회 | "해당 데이터가 존재하지 않습니다" |
| 409 | CONFLICT | (현재 동시 수정 방지 미적용 — UPDATED_AT 비교 도입 시 Q-NEW) | "잠시 후 다시 시도" |
| 422 | BUSINESS_RULE_VIOLATION | gfn_message 다이얼로그 (warning) | "연결된 [역할그룹] 이 존재합니다. 제외 후 삭제 하세요" (V-003 서버측 재검증) / "연결된 [권한] 이 존재합니다. 제외 후 삭제 하세요" (V-004 서버측 재검증) |
| 500 | INTERNAL_ERROR | 토스트 (error) + commonBottomStatus | "서버 오류가 발생했습니다" |
| timeout | - | 로딩 해제 + 토스트 | "요청 시간이 초과되었습니다" |
| network | - | 로딩 해제 + 토스트 | "네트워크 연결을 확인해주세요" |

---

## §4. 데이터 연동 및 부수 효과

### §4.1 상태 변경 시 부수 효과

| 상태 전이 | 부수 효과 | 대상 모듈 | 설명 |
|---|---|---|---|
| TB_MCM_SEC_ROLE.USE_TP "Y" → "N" (D-007 변경 + saveCmRole) | 즉시 효과 ✗ — 단순 마스터 갱신. 본 ROLE_ID 를 참조하는 사용자/역할그룹 매핑은 보존 (별도 화면 운영) | 본 화면 (mcm.csa.commRoleMng) | audit 자동 갱신 (UPDATE_USER / UPDATE_DATE) |
| TB_MCM_SEC_ROLE INSERT (B-008 → B-003) | 즉시 효과 ✗ — 신규 ROLE_ID 가 다른 화면 (CommUserMng / CommRoleGrpMng) 의 후보로 노출 | 본 화면 + cross-screen (CommUserMng / CommRoleGrpMng — 비동기 노출) | audit 자동 채움 (CREATE_USER / CREATE_DATE / UPDATE_USER / UPDATE_DATE) |
| TB_MCM_SEC_ROLE DELETE (B-009 → B-003) | 참조 무결성 보호 (NOT EXISTS) 통과 시만 삭제 — 화면 V-003/V-004 + 서버 SQL 재검증 2중 보호 | 본 화면 + TB_MCM_SEC_ROLEGROUP_MAPPING + TB_MCM_SEC_ROLE_MAPPING 참조 확인 | audit history 보존 (Soft delete 미사용 — 실 DELETE) |
| TB_MCM_SEC_ROLE_MAPPING INSERT (BS-002 → saveCmRoleMap) | 즉시 효과 ✗ — 본 ROLE_ID 의 다음 searchCmRoleMap 시점에 반영. searchCmPerm 도 재조회 (할당된 권한 후보 풀에서 제외) | 본 화면 (sub1 + sub2 양쪽 갱신) | audit 자동 채움 |
| TB_MCM_SEC_ROLE_MAPPING DELETE (BS-001 → saveCmRoleMap) | 즉시 효과 ✗ — 본 ROLE_ID 의 다음 searchCmRoleMap 시점에 반영. searchCmPerm 도 재조회 (해제된 권한이 후보 풀에 복귀) | 본 화면 (sub1 + sub2 양쪽 갱신) | audit history 보존 |

### §4.2 참조 무결성

| 관계 | 제약 | 위반 시 |
|---|---|---|
| TB_MCM_SEC_ROLE.ROLE_ID ← TB_MCM_SEC_ROLEGROUP_MAPPING.ROLE_ID | NOT NULL FK (참조) | 본 화면 deleteCommRole 의 NOT EXISTS 검증 (xml:80~82) — 위반 시 DELETE 실패 (rowcount=0) → 화면 422 + V-003 메시지 |
| TB_MCM_SEC_ROLE.ROLE_ID ← TB_MCM_SEC_ROLE_MAPPING.ROLE_ID | NOT NULL FK (참조) | 본 화면 deleteCommRole 의 NOT EXISTS 검증 (xml:83~86) — 위반 시 DELETE 실패 → V-004 메시지 |
| TB_MCM_SEC_ROLE_MAPPING.OBJECT_ID ← TB_MCM_SEC_OBJ.OBJECT_ID | NOT NULL FK (참조) | insertCommRoleMap 시 위반 시 FK constraint 에러 (서버 422) — 화면 OBJECT 조회 P-001 통과 시 정상 |
| TB_MCM_SEC_ROLE_MAPPING.PERMISSION_ID ← TB_MCM_SEC_PERM.PERMISSION_ID | NOT NULL FK (참조) | insertCommRoleMap 시 위반 시 FK constraint 에러 (서버 422) — 화면 ds_perm 후보 풀 자동 보장 |
| TB_MCM_SEC_ROLE.MENU_ID ← MENU 마스터 | NOT NULL FK (참조) | LV-001 단일 LoV 보장 (BIZ_SYSTEM 종속 필터 제거 / 정책 #1) |
| ~~TB_MCM_SEC_ROLE.BIZ_SYSTEM_CODE ← APP_HOST 마스터~~ | **To-Be 본 화면 미참조 (정책 #1)** — DDL 컬럼 자체는 보존 (다른 화면 / 운영 관점 유지) | (LoV 없음) |

### §4.3 동시 수정 방지

```
As-Is: 동시 수정 방지 미적용 (UPDATED_AT 비교 코드 부재)
To-Be 추가 검토 (Q-NEW):
  수정/삭제 요청 시:
    - API Request 에 updatedAt 포함
    - 서버: TB_MCM_SEC_ROLE.UPDATE_DATE (CactusAuditEntity) 와 비교
    - 불일치 시 409 Conflict
    - 화면: 재조회 유도

본 BPMN 설계서는 As-Is 1:1 보존 원칙에 따라 동시 수정 방지를 적용 ✗.
사용자 결정 후속 (Q-NEW) 으로 미루며, To-Be 구현 시 CactusAuditEntity 의 UPDATE_DATE 활용 권장.
```

### §4.4 트랜잭션 경계

| 액션 | 트랜잭션 범위 | 비고 |
|---|---|---|
| searchCmRole / searchCmRoleMap / searchCmPerm / lov | (조회 — 트랜잭션 없음) | CommonSelectTask 의 read-only |
| saveCmRole | 단일 트랜잭션 (Task_1dh8dal 1 UserTask) — ds_main 의 N 행 (INSERT/UPDATE/DELETE 행상태별) 모두 1 트랜잭션 | CommonMultiSaveTask 의 nextBranchSpel="" → 전체 행 묶음 처리 |
| saveCmRoleMap | 단일 트랜잭션 (Task_0weig4p 1 UserTask) — ds_roleMap 의 N 행 (INSERT/DELETE) 모두 1 트랜잭션 | 동일 패턴 |

---

## §5. 화면 생명주기

| 단계 | 이벤트 | 동작 | 호출 액션 |
|---|---|---|---|
| onMount | 화면 진입 (탭 활성화) | fn_formBeforeOnload (commonTop/Left/Right 등록) + CommRoleMng_onload (commonDynamic_onload + gfn_formOnLoad + setEnable false + gridSelectedRow×3) + fn_lov() | lov (API-006) |
| onSearch | B-001 클릭 / Enter | fn_search → fn_run("searchCmRole") | searchCmRole (API-001) |
| onRowSelect (grd_main) | grd_main 행 클릭 / rowposition 변경 | ds_main_onrowposchanged → fn_run("searchCmRoleMap") + fn_run("searchCmPerm") | searchCmRoleMap + searchCmPerm (API-003 + API-005) |
| onSave | B-003 클릭 | fn_save → fn_before_save_chk → 확인 다이얼로그 → fn_run("saveCmRole") | saveCmRole (API-002) |
| onRoleMapAdd | BS-002 클릭 | fn_appendRoleMapRow → 검증 → ds_roleMap addRow → fn_run("saveCmRoleMap") | saveCmRoleMap (API-004) |
| onRoleMapRemove | BS-001 클릭 | fn_removeRoleMapRow → ds_roleMap deleteRow → fn_run("saveCmRoleMap") | saveCmRoleMap (API-004) |
| onPermSearch | B-012 클릭 | fn_permSearch → fn_run("searchCmPerm") | searchCmPerm (API-005) |
| onUnmount | 화면 이탈 (메뉴 이동 / 뒤로가기) | fn_close → objApp.gv_AppTabPath.form.fn_closeForm() (As-Is) → IF isDirty=true: "저장하지 않은 변경사항" 확인 (To-Be) | (클라이언트) |
| onBeforeUnload | 브라우저 새로고침 / 닫기 | IF isDirty=true: 브라우저 기본 확인 다이얼로그 | (클라이언트) |

---

## §6. 특이사항 / 설계 결정

### §6.1 [확인필요] 인용 (분석리포트 §13 의 BPMN 관련 항목)

| 분석리포트 §13 ID | 항목 | 분류 | 영향도 (높음/중간/낮음) | 해소 방식 | 근거 | 상태 |
|---|---|---|---|---|---|---|
| ~~Q-002~~ | ~~DMES Excel 컬럼 카탈로그 미추출~~ | DB / 데이터형 | 중간 | 분석 §9.4 신설 (2026-05-30) | §9.4 5 시트 125 컬럼 전수 | **closed** |
| ~~Q-010~~ | ~~fn_linkCommMenu / fn_openMenu 본문 정의 + 호출 모두 ✗~~ | BPMN (외부 화면) | 낮음 | 정책 #1 (신규 미반영) — P-002 외부 라우팅 추가 ✗ | xfdl:289 / 307 / 842 | **closed** |
| ~~Q-011~~ | ~~updateCommRoleMap no-op~~ | BPMN (Mapper) | 낮음 | UI 자연 흡수 (JPA saveAll) — Task_0weig4p updateSqlKey property 자체 삭제 + Mapper 본문 제거 | xml:127~130 + §1.3 + §2.7 | **closed** |
| ~~Q-012~~ | ~~BPMN process name "부모역할 부여 조회" 비일관~~ | BPMN (메타데이터) | 낮음 | To-Be process name = "역할 관리" / process id = `commRoleMng` 정정 | bpmn:3 | **closed** |
| ~~Q-015~~ | ~~dao 속성 빈값 + isServiceResult=true 의도~~ | BPMN (cactus 표준) | 낮음 | UI 자연 흡수 — oasis ScriptTask 표준 (가이드 §6-C/D/E + §7-A/B) 적용. ksm cactus-core `OasisServiceExecutor` + `MyBatisSqlRunner` 재설계 — dao / isServiceResult property 삭제 | bpmn:37 등 | **closed** |
| ~~Q-016~~ | ~~searchCmRoleMap 콜백의 ds_roleMap 행 rowType 변환~~ | BPMN (응답 후처리) | 낮음 | UI 자연 흡수 — React `useGridDataManager` normalize 자동 처리 | xfdl:494 / 525 | **closed** |
| ~~Q-017~~ | ~~fn_msgSuccessSave 안에서 fn_search 호출 시 this 컨텍스트~~ | BPMN (응답 후처리) | 낮음 | 추적 완료 (libUtil.xjs:1693/1771) — As-Is 정상 동작 | xfdl:472~476 | **closed** |
| Q-NEW (BPMN-1) | 동시 수정 방지 (UPDATED_AT 비교) | BPMN (응답 후처리) | 중간 | To-Be 추가 검토 (§4.3) — CactusAuditEntity 활용 권장 | §4.3 | open (To-Be 후속 — 본 작업 외 PR 사항) |
| ~~Q-NEW (BPMN-2)~~ | ~~미사용 BPMN flow 2 종 (searchCmRoleMapPnt + pntRoleIdPop)~~ | BPMN (구조) | 낮음 | **To-Be 제거** — sequenceFlow + Task_0f9lt7e + Task_1sm19m8 제거 | bpmn:118~149 + §1.3 | **closed** |
| ~~Q-NEW (BPMN-3)~~ | ~~cross-namespace `CommObjMngMapper.selectAppHostId` 호출 제거~~ | BPMN (구조) | 낮음 | **To-Be 제거** (정책 #1) — Task_0r5ztlq + sequenceFlow lov 일부 + lov 단일 Task 재구성 (Task_17ggria 만 잔존, namespace 내재화) | bpmn:150~163 + §1.3 | **closed** |

> **§6.1 활성 Q = Q-NEW (BPMN-1) 1건** (To-Be 후속 PR 사항 — CactusAuditEntity 동시수정방지 / 본 작업 14 사용자 요구사항 외 항목). 분석리포트 §13 17건 ↔ 본 BPMN §6.1 9건 일치 (BPMN 관련 항목만 인용) — 모두 closed.

### §6.2 검토한 대안 (있는 경우만)

> 분석 §11 + 기능 §11.2 의 OASIS / Phase 7 채택 결정 BPMN 측면.

| 대안 | 장점 | 단점 | 채택 여부 (○/×) | 사유 |
|---|---|---|---|---|
| OASIS 단일 BPMN (As-Is BPMN 1:1 보존) | As-Is BPMN 구조 (ExclusiveGateway 분기 + cactus oasis Task) 그대로 / Mapper sqlKey 1:1 / 개발 단순 / cactus oasis 공통 패턴 활용 | action 분기 다수 (6) — actionGateway 분기 매트릭스 검증 필요 / cactus oasis 의존 (mcm-core 패키지 결합) | ○ | 본 화면 = 분석 §11.1 C1~C6 충족 0 → 자동 OASIS 채택. As-Is BPMN 이 이미 ExclusiveGateway 패턴 / cactus oasis ScriptTask 패턴이 mcm cma 4 화면 적용 사례 (`project_cma_mcm_core_migration.md`) 와 동일 |
| Phase 7 분리 (각 action 별 별도 BPMN + endpoint) | 각 SQL 독립 / 테스트 단순 / 트랜잭션 격리 | 6 BPMN + 6 endpoint × FE 분기 / OASIS 패턴 위반 / mcm cma 표준과 불일치 | × | C1~C6 충족 0 → OASIS 가 자동 채택. mcm 모듈 표준 (cma 4 화면) 도 OASIS 단일 채택 |
| As-Is BPMN 그대로 (미사용 분기 보존) | As-Is 1:1 완전 보존 | 데드 코드 — 가독성 저하 + 컴파일 시간 손실 | × | 분석 §11 결정 — 미사용 BPMN flow 2 종 (searchCmRoleMapPnt + pntRoleIdPop) 은 As-Is xfdl 가 명시적으로 주석 처리 → To-Be 제거 표준 |
| ref_Audit Mapper fragment 이전 | As-Is 동일 | MyBatis fragment 의존성 / cactus-core 미사용 / mcm cma 4 화면 결정 위반 | × | cactus-core CactusAuditEntity 자동 채움 (사용자 결정 — `project_cma_mcm_core_migration.md`) |

---

## §6.14 Phase 4 종료 자가 점검 (4 질문)

1. **14항 위반?** — 위반 ✗. 분석 §6 (Mapper) + §7 (UserTask 없음) + §8 (BPMN 9 Task + 8 분기) + §11 (To-Be 변환점 30) 인용. **To-Be action 6 enum** (As-Is 8 → To-Be 6 — searchCmRole / saveCmRole / searchCmRoleMap / saveCmRoleMap / searchCmPerm / lov) + **To-Be 6 Task** (As-Is 9 - 3 = 6: 잔존 = Task_00oihyb / Task_1dh8dal / Task_0xxo78b / Task_0weig4p / Task_1re6tzu / Task_17ggria. 제거 = Task_0f9lt7e / Task_1sm19m8 / **Task_0r5ztlq (정책 #1)**). OASIS 단일 채택 (C1~C6=0).
2. **검증 안 한 부분?** — Q-NEW (BPMN-1) 동시 수정 방지 (CactusAuditEntity / UPDATED_AT) — 본 작업 14 사용자 요구사항 외, To-Be 후속 PR.
3. **그대로 수용?** — Q-002/010/011/012/015/016/017/Q-NEW(BPMN-2)/Q-NEW(BPMN-3) = 9건 모두 closed (분석 §13 17건 / BPMN §6.1 9건). 단일 원천 정합.
4. **임의 합리화?** — 없음.

→ Phase 4 통과 (갱신 2026-05-31 — BPMN 관련 Q 9건 전수 closed).


---

## 퍼미션 (퍼미션 모델 v2, 2026-11-27)

> 이 절은 위 본문보다 우선한다. 위 본문은 옛 `TB_MCM_SEC_ROLE_MAPPING` 3-table JOIN 모델의 흐름이다.
> 근거: `docs/perm-bench/decompose.md` D7·D13·D14·D15·D18·D30, §0.4. 구현: 커밋 127920264. 정본 파일: `src/backend/mcm/api/src/main/resources/services/csa/commRoleMng/commRoleMng.bpmn`.
> 서비스: `commRoleMngService` (`com.dongkuk.dmes.mcm.csa.commRoleMng.service`).

### P.1 action 표

action 이름 = BPMN sequenceFlow `name` = 게이트 토큰이다. URL 은 `POST /oasis/commRoleMng/{action}` 이다.

| action (flow name) | 구분 | service method | 입력 | 출력 grids / data | 오류 코드 |
|---|---|---|---|---|---|
| `search` | 바뀜 | `searchCmRole` | params `edtROLEID` · `edtROLENM` · `cboUSETP` (옛 그대로) | grids `ds_main` (옛 칸 + `GROUP_CNT` · `USER_CNT` · `PERM_CNT`) | 없음 |
| `save` | 바뀜 | `saveCmRole` | grids `master.rows` (옛 그대로) | data `cnt_merge` · grids `ds_main` (재조회, 집계 3칸 포함) | 없음 (삭제 차단은 조용히 건너뜀) |
| `searchRoleGroups` | 새 | `searchRoleGroups` | params `roleId` (dto `CommRoleMngRoleRequest`) | grids `groups` (ROLE_GROUP_ID · ROLE_GROUP_NM · USE_TP · USER_CNT) · data `USER_CNT` (`USE_TP='Y'` 인 역할만 센다. 사용 안 함 역할은 0. 그룹 줄의 `USER_CNT` 는 그룹이 `USE_TP='N'` 이면 0) | 없음 |
| `searchCmRoleMap` | 바뀜 | `searchCmRoleMap` | params `roleId` (dto `CommRoleMngSearchRoleMapRequest`). 비면 옛 키 `ROLE_ID` 를 쓴다 | grids `perms` (ROLE_ID · OBJECT_ID · OBJECT_NM · MENU_FOLDER_ID · MENU_PATH · MENU_NM · OBJ_BTN_PERM · OBJ_POPUP_PERM · OBJ_READ_PERM · BTN_PERM · POPUP_PERM · DATA_PERM). 값 칸은 `PermTokens` 로 정규화해서 내린다 (null 은 빈 문자열) | 없음 |
| `saveCmRoleMap` | 바뀜 | `saveCmRoleMap` | params `roleId` (dto `CommRoleMngRoleRequest`) + grids `perms.rows` (ROLE_ID · OBJECT_ID · BTN_PERM · POPUP_PERM · DATA_PERM · OP_TP `MERGE`\|`DEL`) | data `cnt_merge` · `cnt_delete` | `PERM_BAD_ROW` · `PERM_SYSADMIN` · `PERM_NO_ROLE` · `PERM_ROLE_MISMATCH` · `PERM_NO_OBJ` · `PERM_EMPTY_BTN` · `PERM_NOT_IN_OBJ` · `PERM_TOO_LONG` |
| `searchFolderObj` | 새 | `searchFolderObj` | params `roleId` · `menuFolderId` (dto `CommRoleMngRoleRequest`) | grids `objs` (OBJECT_ID · OBJECT_NM · MENU_NM · MENU_FOLDER_ID · MENU_PATH · OBJ_BTN_PERM · OBJ_POPUP_PERM · OBJ_READ_PERM · USE_TP · HAS_PERM) | 없음 |
| `lov` | 바뀜 | `lov` | 없음 | grids `ds_lovMenuId` (옛 그대로) + grids `menus` (MENU_ID · MENU_NM · PARENT_MENU_ID · MENU_LV · MENU_PATH) | 없음 |
| `searchCmPerm` | 옛 (남김) | `searchCmPerm` | params `ROLE_ID` | grids `ds_perm` (옛 PERMISSION 후보) | 없음 |
| `searchObjectLov` | 옛 (남김) | `searchObjectLov` | (옛 그대로) | grids `ds_menuObjLst` | 없음 |

- 새 action 은 2개(`searchRoleGroups`·`searchFolderObj`), 바뀐 action 은 5개(`search`·`save`·`searchCmRoleMap`·`saveCmRoleMap`·`lov`)다.
- `searchCmPerm`·`searchObjectLov` 는 옛 모델의 action 이다. 이번 회차는 BPMN 에 남긴다. FE 가 안 쓰면 다음 회차에 뺀다. 새 화면은 부르지 않는다.
- 옛 `ds_roleMap` 은 더 내지 않는다. 새 이름은 `perms` 다.
- `searchCmRoleMap` 이 낸 `perms` 줄은 `saveCmRoleMap` 에 보내는 줄과 칸 이름이 같다. SYSADMIN 이면 빈 목록이다.
- `PERM_CNT` 는 SYSADMIN 에서 `-1` 이다. 퍼미션 행이 없다는 뜻이다.
- `USER_CNT`(`search`·`save` 의 `ds_main`, `searchRoleGroups` 합계)는 `USE_TP='Y'` 인 역할만 센다. 사용 안 함 역할은 0 이다.

### P.2 BPMN 구조

- `actionGateway` (`input=action`) 에서 serviceTask 9개로 분기한다. 조건식은 쓰지 않는다. flow `name` 만으로 분기한다.
- 모든 serviceTask 는 `camunda:class="commRoleMngService"` 다. `method` 속성이 service method 를 고른다.
- `saveCmRoleMap` 은 params `roleId` 를 `dto`(`CommRoleMngRoleRequest`)로 받고, grids `perms` 를 method 인자 `perms` 로 받는다. (commUserMng `pwdinit` 과 같은 패턴이다.)
- `searchRoleGroups`·`searchFolderObj` 는 같은 dto `CommRoleMngRoleRequest` 를 쓴다 (`roleId`, `menuFolderId`).
- 옛 §2.3 의 `searchCmRoleMap` + `searchCmPerm` 동시 호출, §2.7 의 BS-001·BS-002 INSERT/DELETE 흐름(`insertCommRoleMap` 등)은 더 쓰지 않는다. 새 흐름은 아래 P.3 이다.
- 옛 `SecRoleMappingNativeRepository` 의 3-table JOIN 은 `searchCmRoleMap` 에서 쓰지 않는다. 새 표는 `SecRolePermRepository` 와 `CommPermQueryRepository` 로 읽고 쓴다.

### P.3 퍼미션 저장 처리 순서 (`saveCmRoleMap`)

1. `roleId` 가 비었으면 `PERM_BAD_ROW`. `roleId` 가 SYSADMIN(`SYSADMIN` 또는 `ROLE_SYSADMIN`)이면 `PERM_SYSADMIN`. 역할이 없으면 `PERM_NO_ROLE` (지우기만 보낸 저장도 검사한다).
2. 모든 줄을 검사한다. 줄마다 아래 순서다.
   1. 줄의 ROLE_ID 가 params `roleId` 와 다르면 `PERM_ROLE_MISMATCH`.
   2. OBJECT_ID 가 비면 `PERM_BAD_ROW`.
   3. 같은 (ROLE_ID, OBJECT_ID) 가 이미 나왔으면 `PERM_BAD_ROW`.
   4. OP_TP 가 `MERGE`·`DEL` 이 아니면 `PERM_BAD_ROW`.
   5. `MERGE` 인데 오브젝트가 없으면 `PERM_NO_OBJ`.
   6. `MERGE` 인데 정규화한 BTN_PERM 이 비면 `PERM_EMPTY_BTN` (D14).
   7. BTN_PERM·POPUP_PERM 에 오브젝트 허용 값 밖의 값이 있으면 `PERM_NOT_IN_OBJ` (D15).
   8. 어느 칸이든 1000자를 넘으면 `PERM_TOO_LONG`.
3. 틀린 줄이 하나라도 있으면 `BusinessException(BUSINESS_ERROR, "CODE: 상세")` 로 끝낸다. 아무것도 쓰지 않는다.
4. 통과하면 `MERGE` 줄을 넣거나 고치고 `DEL` 줄을 지운다.
5. 값이 실제로 바뀌었거나 줄이 지워졌으면 `RoleChangedEvent(roleId)` 를 한 번 발행한다 (D30). 같은 값으로 다시 저장하면 이벤트가 없다.
6. `cnt_merge`·`cnt_delete` 를 돌려준다.

- 오류는 `BusinessException` 이다. 메시지는 오류 코드로 시작한다. FE 는 메시지를 그대로 보여 준다.
- 서비스에 `@Transactional` 을 두지 않는다. OASIS executor 가 process 단위로 감싼다.

### P.4 역할 저장·삭제 (`save`)

- 입력과 상태 분기(`inserted`·`updated`·`deleted`)는 옛 그대로다.
- 삭제 검사는 옛 검사에 새 검사를 덧붙였다. 셋 중 하나라도 0 보다 크면 그 줄을 조용히 건너뛴다.
  - `TB_MCM_SEC_ROLEGROUP_MAPPING` 줄 수.
  - `TB_MCM_SEC_ROLE_MAPPING` 줄 수 (옛 검사 유지).
  - `TB_MCM_SEC_ROLE_PERM` 줄 수 (새 검사, `SecRolePermRepository.countByRoleId`).
- 옛 `TB_MCM_SEC_ROLE_MAPPING` 에는 외래키가 없다 (V1 은 PK 만). 옛 줄이 남아도 `ORA-02292` 가 나지 않는다.
- `RoleChangedEvent` 는 다음 경우에 한 번 발행한다 (D30). 새로 만드는 줄은 포함하지 않는다.
  - 기존 역할의 USE_TP 가 바뀌었다.
  - 기존 역할의 유효 기간(START_ACTIVE_DATE·END_ACTIVE_DATE)이 바뀌었다.
  - 역할을 실제로 지웠다.
- 응답은 `cnt_merge` 와 재조회한 `ds_main` 이다. 계약은 `ds_main` 의 집계 칸을 말하지 않았다. 구현은 `search` 와 같게 집계 3칸을 넣는다.

### P.5 SYSADMIN 과 이벤트

- SYSADMIN 은 퍼미션 행이 없다 (D13). `PERM_CNT=-1`, `searchCmRoleMap` 은 빈 목록, `saveCmRoleMap` 은 `PERM_SYSADMIN`.
- SYSADMIN 은 `SYSADMIN` 또는 런타임 별칭 `ROLE_SYSADMIN` 이다.
- 이 화면이 발행하는 `RoleChangedEvent` 는 `saveCmRole`·`saveCmRoleMap` 두 곳이다. 구독처가 권한 캐시를 비운다.

### P.6 계약과 구현의 차이

- 오류 코드는 commPermMng `save` 와 같은 이름을 쓴다. 이 화면만 더 가진 코드는 `PERM_ROLE_MISMATCH` 다.
- 줄의 ROLE_ID·OBJECT_ID 와 params `roleId` 는 앞뒤 공백을 자르고 비교한다.
- `searchFolderObj` 의 `MENU_NM`·`MENU_PATH` 는 고른 폴더 안의 대표 메뉴 값이다.
- `save` 응답의 `ds_main` 에도 집계 3칸이 있다.
