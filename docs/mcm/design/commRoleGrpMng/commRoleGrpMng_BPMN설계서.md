---
screenId: commRoleGrpMng
asIsId: CommRoleGrpMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# mcm — 역할 그룹 관리 BPMN설계서

> **BackEnd / BPMN 측 확정 값**:
> - 프로세스 ID: `commRoleGrpMng` (= serviceId, As-Is bpmn process id = `CommRoleGrpMng`)
> - **프로세스 name: "역할 그룹 관리"** (As-Is `"부모역할 부여 조회"` 부정확 정정 — Q-011 해소)
> - Bean명: `commRoleGrpMngService`
> - moduleId / serviceId / API URL 정본: 04 §A.2-3
> - UI→BFF: `POST /api/mcm/oasis/commRoleGrpMng/{action}`
> - BFF→BE: `POST /oasis/commRoleGrpMng/{action}`
> - **BPMN action enum = 6** (As-Is 7 → To-Be **6**, lov 폐기 — 정책 #1 / Q-005 / Q-008 자동 해소)
>
> **명명 룰**: MES 단일 룰 (4 식별자 1byte 동일 — mcm 모듈, APS 예외 미적용)
>
> **인용 정본**: 분석리포트 §6 (SQL ID) + §7 (Java — 본 화면은 부재) + §8 (BPMN 전수). 자체 추가 ✗.
> **As-Is 1:1 보존**: BPMN node id (Task_00oihyb / Task_1dh8dal 등 hash 형식), sequenceFlow id, modelerTemplate 인용 그대로 보존. 변환은 §6 "To-Be 식별자" 안에서만 제안.
>
> **Java UserTask 자산 부재**: 분석리포트 §0 / §2 / §7 에 명시. 본 화면의 모든 비즈니스 노드는 ScriptTask (commonDbTask.CommonSelectTask + commonDbTask.CommonMultiSaveTask) 만 사용 → §3 (UserTask Java 클래스 상세) = **해당 없음**.

---

## 1. 프로세스 개요

> **표기 컨벤션**:
> - DB 컬럼명 / 테이블명: SNAKE_CASE — As-Is 보존 (`MCMAPUSER.TB_MCM_SEC_*` — 사용자 결정 동일 cma 정책)
> - audit 컬럼: cactus-core `CactusAuditEntity` 9 컬럼 자동 (`C_*` / `U_*` / `VER`) — JPA `@PrePersist` / `@PreUpdate`
> - API JSON 필드: camelCase (`edt_ROLE_GROUP_ID` / `edt_ROLE_GROUP_NM` / `cbo_USE_TP` / `cbo_bizSystemCode` 는 As-Is 검색 파라미터 보존 / `ROLE_GROUP_ID` / `ROLE_ID` 등 dataset 컬럼 As-Is 보존)
> - Java 패키지: Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 (모듈 단위 공유) / Service·DTO = `com.dongkuk.dmes.mcm.csa.commRoleGrpMng.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동 정책 동일 적용 — csa 그룹 첫 화면)
> - DB ↔ DTO 매핑은 API 계층에서

### 1.1 API 엔드포인트 총괄 (분석 §11 채택 결과 인용)

| API-ID | Method | URL | 설명 | action (분기 enum) | 트리거 |
|---|---|---|---|---|---|
| ~~API-001~~ | ~~POST~~ | ~~`POST /oasis/commRoleGrpMng/lov`~~ | ~~BIZ SYSTEM 콤보 LoV 초기 조회~~ | ~~lov~~ | - | **To-Be 정책 #1 폐기** (Q-005 / Q-008 자동 해소) |
| API-002 | POST | `POST /oasis/commRoleGrpMng/searchCmRoleGrp` | 역할 그룹 메인 그리드 조회 | searchCmRoleGrp | EX-001 btn_search (`fn_search`, xfdl:665) |
| API-003 | POST | `POST /oasis/commRoleGrpMng/saveCmRoleGrp` | 역할 그룹 메인 그리드 일괄 저장 (INSERT/UPDATE/DELETE 통합) | saveCmRoleGrp | EX-003 btn_save (`fn_save`, xfdl:674) |
| API-004 | POST | `POST /oasis/commRoleGrpMng/searchCmRoleGrpMap` | 선택 역할 그룹의 매핑 역할 조회 | searchCmRoleGrpMap | `ds_main_onrowposchanged` (xfdl:764) |
| API-005 | POST | `POST /oasis/commRoleGrpMng/saveCmRoleGrpMap` | 역할 그룹-역할 매핑 저장 (INSERT/DELETE) | saveCmRoleGrpMap | B-002 (`fn_removeRoleMapRow`, xfdl:611) / B-003 (`fn_appendRoleMapRow`, xfdl:625) |
| API-006 | POST | `POST /oasis/commRoleGrpMng/searchCmRole` | 미매핑된 전체 역할 조회 | searchCmRole | `ds_main_onrowposchanged` (xfdl:766) |
| API-007 | POST | `POST /oasis/commRoleGrpMng/searchCmRoleGrpMenu` | 매핑 역할이 보유한 메뉴 트리 조회 | searchCmRoleGrpMenu | `ds_main_onrowposchanged` (xfdl:768) |

> **To-Be action 활성 합계 = 6** (lov 폐기). 정책 #1 (BIZ SYSTEM 콤보 제거) 으로 사용자 사전 명시 "6 enum" 일치 (Q-008 해소).

### 1.2 API 패턴 자동 판정 결과 (C1~C6)

| 조건 | 충족 (Y/N) | 근거 | 판정 영향 |
|---|---|---|---|
| C1. As-Is SP case 분기 4종 이상 + 조회/트랜잭션 분리 | N | mui 의 As-Is 는 SP 가 아니라 Mapper.xml inline SQL. ExclusiveGateway 의 7 분기는 SP case 분기가 아닌 BPMN flow 분기 — C1 정의에 부적합 | - |
| C2. LoV master 호출 컬럼 5종 이상 | N | LV-001 (selectAppHostId — 외부 namespace) + LV-002 (정적 Y/N S-004) + LV-003 (정적 Y/N D-005 Radio) = 3 LoV — 5 미달 | - |
| C3. 회사·공장 종속 LoV 1종 이상 | N | BIZ_SYSTEM_CODE 는 시스템 구분 (회사/공장 종속 ✗). USE_TP 'Y' / MENU_TP 'WEB' 하드코딩이 있으나 단일 상수 | - |
| C4. 동적 컬럼 응답 팝업/그리드 1개 이상 | N | 그리드 컬럼 구성 고정 (As-Is 보존). 모든 그리드 정적 컬럼 | - |
| C5. 독립 query 분리가 적합함 | N | save 와 search 가 chain (saveCmRoleGrpMap 후 3 회 재조회 chain — xfdl callback 처리) — 독립 분리 부적합 | - |
| C6. 외부 SP 호출로 단일 actionGateway 부적합 | N (단, lov 의 `CommObjMngMapper.selectAppHostId` 외부 namespace 인용 — cross-namespace 호출 1 건. SP 가 아닌 외부 mapper 라 C6 적합 ✗) | 외부 SP 호출 ✗ — namespace 인용만 1 건 (Q-005) | - |

| 항목 | 값 |
|---|---|
| C1~C6 충족 개수 | **0 / 6** |
| 채택 패턴 | **OASIS 단일 BPMN (자동)** (충족 0 룰 — default OASIS) |
| API 라우팅 | `POST /oasis/{serviceId}/{action}` |
| Q-NNN 등재 여부 | N (충족 0 — OASIS 채택) |

> As-Is BPMN 자체가 단일 ExclusiveGateway 의 7 action 분기 형태 — OASIS 단일 BPMN 패턴 그대로 To-Be 채택.

---

## 2. 프로세스별 BPMN 상세

> 본 §2 는 분석리포트 §8 (BPMN 전수) 의 모든 task / sequenceFlow 를 action 별로 흐름 ASCII 로 표현. As-Is BPMN id (Task_xxx / SequenceFlow_xxx) 모두 보존.

### ~~2.1 lov (API-001)~~ — **To-Be 정책 #1 폐기 / Q-005 + Q-008 자동 해소**

본 절은 As-Is 인용만 보존. To-Be BPMN 에서 Task_1erud76 (lov_SUBSYSTEM 조회) 노드 + SequenceFlow_0gdqjne (lov flow) + SequenceFlow_0bmn2j8 (Task → End) 모두 제거. xfdl `fn_lov` 메서드 및 `CommRoleGrpMng_onload` 의 `fn_lov()` 호출 라인 제거. 외부 namespace `CommObjMngMapper.selectAppHostId` 인용 제거.

### 2.2 searchCmRoleGrp (EX-001 → API-002) — 역할 그룹 메인 조회

```
[btn_search 클릭]  (fn_search, xfdl:665)
    │
    ├─ edt_ROLE_GROUP_ID  ← S-002 입력값
    ├─ edt_ROLE_GROUP_NM  ← S-003 입력값
    └─ cbo_USE_TP         ← S-004 콤보값
    │  (cbo_bizSystemCode 파라미터 — **To-Be 정책 #1 폐기**)
    │  (gfn_scanOpenerComponent(div_search.form) — xfdl:449)
    │  sOutDs="ds_main=ds_main"
    │
    ▼
POST /oasis/commRoleGrpMng/searchCmRoleGrp
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_0tt1mbk name="searchCmRoleGrp"  (bpmn:44)
    │
    ▼  Task_00oihyb "역할 그룹 조회"  (bpmn:30)
    │  class=CommonSelectTask
    │  sqlKey=`#{serviceId}Mapper.selectCommRoleGrp`
    │  resultKey=`ds_main`
    │  (SQL — To-Be 정책 #1 적용:
    │   SELECT ROLE_GROUP_* + USER_ID(scalar subquery)  (BIZ_SYSTEM_CODE 컬럼 제거)
    │   FROM TB_MCM_SEC_ROLEGROUP A
    │   WHERE UPPER(A.ROLE_GROUP_ID) LIKE UPPER('%'||#{edt_ROLE_GROUP_ID}||'%')
    │     + UPPER(A.ROLE_GROUP_NM) LIKE
    │     + A.USE_TP = #{cbo_USE_TP}
    │     (BIZ_SYSTEM_CODE WHERE 분기 폐기)
    │   ORDER BY A.START_ACTIVE_DATE)
    │
    │  SequenceFlow_105vwsz (bpmn:112)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack("searchCmRoleGrp"), xfdl:530)
        ├─ ds_main = ds_main (out alias)
        ├─ ds_main.rowCount > 0 → Detail 영역 enable / rowCount=0 → Detail 영역 disable (V-1005)
        └─ bottom status: "{N}건 조회 되었습니다."  (M-007)
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_main=ds_main` |
| 파라미터 (sArgument) | `edt_ROLE_GROUP_ID` + `edt_ROLE_GROUP_NM` + `cbo_USE_TP` (cbo_bizSystemCode 파라미터 폐기 — 정책 #1) |
| BPMN node | StartEvent_1 → ExclusiveGateway_1 → Task_00oihyb → EndEvent_1 |
| 호출 SQL | `selectCommRoleGrp` (xml:7~35) |

### 2.3 saveCmRoleGrp (EX-003 → API-003) — 역할 그룹 일괄 저장

```
[EX-003 btn_save 클릭]  (fn_save, xfdl:674)
    │
    ▼  V-001~V-004 validation (기능 §6.1) + confirm 모달 통과
    │
    ├─ ds_main (변경 행만 :U — INSERT/UPDATE/DELETE 통합)
    │  (xfdl:471 — sInDs="ds_main=ds_main:U")
    │
    ▼
POST /oasis/commRoleGrpMng/saveCmRoleGrp
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_0grwghu name="saveCmRoleGrp"  (bpmn:77)
    │
    ▼  Task_1dh8dal "역할 그룹 저장"  (bpmn:45)
    │  class=CommonMultiSaveTask
    │  paramKey=`ds_main`, resultKey=`ds_main`
    │  insertSqlKey=`#{serviceId}Mapper.insertCommRoleGrp`
    │  updateSqlKey=`#{serviceId}Mapper.updateCommRoleGrp`
    │  deleteSqlKey=`#{serviceId}Mapper.deleteCommRoleGrp`
    │
    │  (CommonMultiSaveTask 동작):
    │  ├─ for i=0..ds_main.size():
    │  │   nativeeditor_status 분기:
    │  │   ├─ "inserted" → insertCommRoleGrp (xml:37~58)
    │  │   │     ├─ **(Service 책임 — Q-003 해소)**
    │  │   │     │   ROLE_GROUP_ID PK 중복 검증 + 중복 시 도메인 예외
    │  │   │     ├─ INSERT TB_MCM_SEC_ROLEGROUP
    │  │   │     │  (ROLE_GROUP_ID, ROLE_GROUP_NM, ROLE_GROUP_DESC,
    │  │   │     │   USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE
    │  │   │     │   — BIZ_SYSTEM_CODE 폐기 / 정책 #1)
    │  │   │     │   (ref_Audit fragment → cactus-core 자동)
    │  │   ├─ "updated"  → updateCommRoleGrp (xml:60~70)
    │  │   │     ├─ UPDATE SET (5 컬럼 — BIZ_SYSTEM_CODE 폐기)
    │  │   │     │   (ref_Audit fragment → cactus-core 자동)
    │  │   │     └─ WHERE ROLE_GROUP_ID = #{ROLE_GROUP_ID}
    │  │   └─ "deleted"  → deleteCommRoleGrp (xml:72~83)
    │  │         ├─ DELETE FROM TB_MCM_SEC_ROLEGROUP A
    │  │         └─ WHERE A.ROLE_GROUP_ID = #{ROLE_GROUP_ID}
    │  │            AND NOT EXISTS (TB_MCM_SEC_USER_MAPPING B WHERE B.ROLE_GROUP_ID = A.ROLE_GROUP_ID)
    │  │            AND NOT EXISTS (TB_MCM_SEC_ROLEGROUP_MAPPING C WHERE C.ROLE_GROUP_ID = A.ROLE_GROUP_ID)
    │
    │  SequenceFlow_1vkp3qd (bpmn:111)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack("saveCmRoleGrp"), xfdl:545)
        ├─ nErrorCode==0 시 bottom status: "{N}건 조회 되었습니다." + info("저장 되었습니다.") (M-008)
        ├─ 콜백 fn_msgSuccessSave 에서 fn_search() 재호출 (재조회 chain — xfdl:552)
        └─ 오류 시 strErrorMsg bottom status 표시
```

| 입력 (sInDatasets) | `ds_main=ds_main:U` |
|---|---|
| 출력 (sOutDatasets) | (없음 — fn_run 의 sOutDs="" / 콜백에서 fn_search 재호출로 ds_main 재조회) |
| 파라미터 (sArgument) | (없음) |
| BPMN node | Start → Gateway → Task_1dh8dal → End |
| 호출 SQL (status 분기) | insertCommRoleGrp / updateCommRoleGrp / deleteCommRoleGrp (행마다 1 회) |

### 2.4 searchCmRoleGrpMap (Master row change → API-004) — 매핑 역할 조회

```
[ds_main_onrowposchanged]  (xfdl:753)
    │  rowposition > -1 + rowCount != 0 + e.reason != 52 (단순 rowposition 만 변경 ✗)
    │  → 3 회 fn_run chain (Map → Role → Menu)
    │
    ├─ ROLE_GROUP_ID  ← ds_main.getColumn(rowposition, "ROLE_GROUP_ID")  (xfdl:478)
    │  null 차단 → ds_roleGrpMap.clearData()
    │
    ▼
POST /oasis/commRoleGrpMng/searchCmRoleGrpMap
    │  sOutDs="ds_roleGrpMap=ds_roleGrpMap"
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_11y43nf name="searchCmRoleGrpMap"  (bpmn:76)
    │
    ▼  Task_0xxo78b "역할 그룹 부여 조회"  (bpmn:62)
    │  class=CommonSelectTask
    │  sqlKey=`#{serviceId}Mapper.selectCommRoleGrpMap`
    │  resultKey=`ds_roleGrpMap`
    │  (SQL: SELECT B.ROLE_ID + B.ROLE_NM + B.MENU_ID + B.USE_TP + DATES + A.ROLE_GROUP_ID
    │   + **B.PARENT_ROLE_ID (To-Be SELECT 절 추가 — Q-010 해소)**
    │   FROM TB_MCM_SEC_ROLEGROUP_MAPPING A, TB_MCM_SEC_ROLE B
    │   WHERE A.ROLE_ID = B.ROLE_ID AND A.ROLE_GROUP_ID = #{ROLE_GROUP_ID}
    │   ORDER BY B.ROLE_ID)
    │
    │  SequenceFlow_1tgyodp (bpmn:113)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack("searchCmRoleGrpMap"), xfdl:561)
        ├─ nErrorCode==0 시 bottom status: "{N}건 조회 되었습니다."
        └─ 오류 시 strErrorMsg
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_roleGrpMap=ds_roleGrpMap` |
| 파라미터 (sArgument) | `ROLE_GROUP_ID` (ds_main.rowposition 에서 추출) |
| BPMN node | Start → Gateway → Task_0xxo78b → End |
| 호출 SQL | `selectCommRoleGrpMap` (xml:85~98) |

### 2.5 saveCmRoleGrpMap (B-002 / B-003 → API-005) — 매핑 저장 + 3 회 재조회 chain

```
[B-002 셔틀 (좌→우 = 제외, fn_removeRoleMapRow, xfdl:611)]
    또는
[B-003 셔틀 (우→좌 = 추가, fn_appendRoleMapRow, xfdl:625)]
    │
    ▼  V-401 / V-501 처리 (기능 §6.5 / §6.6)
    │
    ├─ ds_roleGrpMap (변경 행만 :U, status 분기)
    │  (xfdl:492 — sInDs="ds_roleGrpMap=ds_roleGrpMap:U")
    │
    ▼
POST /oasis/commRoleGrpMng/saveCmRoleGrpMap
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_109h9q1 name="saveCmRoleGrpMap"  (bpmn:95)
    │
    ▼  Task_0weig4p "역할 그룹 부여 저장"  (bpmn:78)
    │  class=CommonMultiSaveTask
    │  paramKey=`ds_roleGrpMap`, resultKey=`ds_roleGrpMap`
    │  insertSqlKey=`#{serviceId}Mapper.insertCommRoleGrpMap`
    │  updateSqlKey=`#{serviceId}Mapper.updateCommRoleGrpMap`  ← **더미 SELECT 'X' FROM DUAL (xml:113~116)**
    │  deleteSqlKey=`#{serviceId}Mapper.deleteCommRoleGrpMap`
    │
    │  (CommonMultiSaveTask 동작):
    │  ├─ "inserted" → insertCommRoleGrpMap (xml:100~111)
    │  │     ├─ INSERT TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID + ref_Audit.insert)
    │  ├─ "updated"  → updateCommRoleGrpMap (xml:113~116) — 더미 SELECT 'X' FROM DUAL (실 동작 ✗)
    │  └─ "deleted"  → deleteCommRoleGrpMap (xml:118~126)
    │        ├─ DELETE FROM TB_MCM_SEC_ROLEGROUP_MAPPING A
    │        └─ WHERE A.ROLE_GROUP_ID = #{ROLE_GROUP_ID} AND A.ROLE_ID = #{ROLE_ID}
    │           (추가 NOT EXISTS 검증 코드는 주석 처리 xml:122~125)
    │
    │  SequenceFlow_11vs9ef (bpmn:114)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack("saveCmRoleGrpMap"), xfdl:569)
        ├─ info("저장 되었습니다.") (M-008)
        └─ 콜백 fn_msgSuccessSave 에서 3 회 fn_run 재호출:
            - fn_run("searchCmRoleGrpMap")  (현재 역할 재조회)
            - fn_run("searchCmRole")         (전체 역할 재조회)
            - fn_run("searchCmRoleGrpMenu")  (메뉴 트리 재조회)
```

| 입력 (sInDatasets) | `ds_roleGrpMap=ds_roleGrpMap:U` |
|---|---|
| 출력 (sOutDatasets) | (없음 — 콜백에서 3 회 재조회 chain) |
| 파라미터 (sArgument) | (없음) |
| BPMN node | Start → Gateway → Task_0weig4p → End |
| 호출 SQL (status 분기) | insertCommRoleGrpMap / updateCommRoleGrpMap (DUAL 더미) / deleteCommRoleGrpMap |

### 2.6 searchCmRole (Master row change → API-006) — 미매핑 전체 역할 조회

```
[ds_main_onrowposchanged]  (xfdl:766 — Map 다음 chain)
    │
    ├─ ROLE_GROUP_ID  ← ds_main.getColumn(rowposition, "ROLE_GROUP_ID")  (xfdl:499)
    │  null 차단 (행 없음 시 skip)
    │
    ▼
POST /oasis/commRoleGrpMng/searchCmRole
    │  sOutDs="ds_role=ds_role"
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_13bmd6q name="searchCmRole"  (bpmn:110)
    │
    ▼  Task_1re6tzu "역할 조회"  (bpmn:96)
    │  class=CommonSelectTask
    │  sqlKey=`#{serviceId}Mapper.selectCommRole`
    │  resultKey=`ds_role`
    │  paramKey="" (없음 — sArgs 로 전달)
    │  (SQL: SELECT A.ROLE_ID + ROLE_NM + MENU_ID + USE_TP + DATES
    │   + **A.PARENT_ROLE_ID (To-Be SELECT 절 추가 — Q-010 해소)**
    │   FROM TB_MCM_SEC_ROLE A
    │   WHERE A.USE_TP = 'Y'  ← 하드코딩
    │     AND NOT EXISTS (SELECT 'X' FROM TB_MCM_SEC_ROLEGROUP_MAPPING B
    │                     WHERE B.ROLE_ID = A.ROLE_ID
    │                       AND B.ROLE_GROUP_ID = #{ROLE_GROUP_ID})
    │   ORDER BY A.ROLE_ID)
    │
    │  SequenceFlow_0p8l9xo (bpmn:115)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack("searchCmRole"), xfdl:583)
        ├─ nErrorCode==0 시 bottom status: "{N}건 조회 되었습니다."
        └─ 오류 시 strErrorMsg
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_role=ds_role` |
| 파라미터 (sArgument) | `ROLE_GROUP_ID` |
| BPMN node | Start → Gateway → Task_1re6tzu → End |
| 호출 SQL | `selectCommRole` (xml:128~143) |

### 2.7 searchCmRoleGrpMenu (Master row change → API-007) — 메뉴 트리 조회

```
[ds_main_onrowposchanged]  (xfdl:768 — Role 다음 chain)
    │
    ├─ ROLE_GROUP_ID  ← ds_main.getColumn(rowposition, "ROLE_GROUP_ID")  (xfdl:511)
    │  null 차단 → ds_menuTreeList.clearData()
    │
    ▼
POST /oasis/commRoleGrpMng/searchCmRoleGrpMenu
    │  sOutDs="ds_menuTreeList=ds_menuTreeList"
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_0oowkcm name="searchCmRoleGrpMenu&#10;"  (bpmn:130, name 끝에 줄바꿈 — As-Is 보존)
    │
    ▼  Task_1p3b1yy "역할 그룹 메뉴 조회"  (bpmn:116)
    │  class=CommonSelectTask
    │  sqlKey=`#{serviceId}Mapper.selectMenuObjTree`
    │  resultKey=`ds_menuTreeList`
    │  (SQL: WITH MROLE AS (5 테이블 implicit join — RGM/RG/R/RM/MNU,
    │                       WHERE RGM.ROLE_GROUP_ID = #{ROLE_GROUP_ID}
    │                       AND RG.USE_TP='Y' AND R.USE_TP='Y' AND MNU.USE_TP='Y'
    │                       AND MNU.MENU_TP='WEB'),
    │        MENU AS (MROLE UNION SELECT FROM TB_MCM_SEC_MENU_FLD
    │                START WITH MENU_ID IN (...) CONNECT BY PRIOR PARENT_MENU_ID = MENU_ID),
    │        MENU1 AS (계층 LEVEL/SYS_CONNECT_BY_PATH/CONNECT_BY_ISLEAF)
    │   SELECT M.RMENU_ID / SEQ / NM / LEV / PARENT_MENU_ID / ROWNUM / OBJECT_ID / VIEW_YN
    │   FROM MENU1 M LEFT JOIN TB_MCM_SEC_OBJ O ON M.OBJECT_ID = O.OBJECT_ID(+)
    │   WHERE M.PARENT_MENU_ID IS NOT NULL OR EXISTS (child)
    │   ORDER BY SEQ)
    │
    │  SequenceFlow_1qe8l6w (bpmn:131)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack("searchCmRoleGrpMenu"), xfdl:592)
        ├─ nErrorCode==0 시 bottom status: "{N}건 조회 되었습니다."
        └─ 오류 시 strErrorMsg
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_menuTreeList=ds_menuTreeList` |
| 파라미터 (sArgument) | `ROLE_GROUP_ID` |
| BPMN node | Start → Gateway → Task_1p3b1yy → End |
| 호출 SQL | `selectMenuObjTree` (xml:145~249) |

---

## 3. UserTask Java 클래스 상세

**해당 없음** — 분석리포트 §0 / §2 / §7 명시. 본 화면은 `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommRoleGrpMng/` 디렉토리 **부재** (직접 ls 확인 — `csa/` 하위에 `CommChainMasterMng` / `CommSyncMng` / `CommUserMng` / `CommUserRoleCopy` 4 디렉토리만 존재 / `CommRoleGrpMng` ✗).

본 화면의 모든 비즈니스 노드는 BPMN ScriptTask (commonDbTask.CommonSelectTask + commonDbTask.CommonMultiSaveTask) 만 사용. Java 커스텀 UserTask 클래스 정의 ✗.

**To-Be 정책**:

| 항목 | 정책 |
|---|---|
| Java 커스텀 UserTask 작성 | ✗ — As-Is 1:1 보존 (BPMN 의 commonDbTask 만 사용) |
| BPMN Task class | `com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` (5 노드) + `com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask` (2 노드) — As-Is 그대로 보존 |
| 트랜잭션 모델 | OASIS framework 의 `CommonMultiSaveTask` 자체 트랜잭션 (행마다 status 분기) — As-Is 그대로 보존 |
| Service Java 신규 작성 | ✗ — 본 화면 To-Be 산출물에 service Java 패키지 정의는 cma 4 화면과 형식 통일 (Entity/Repository 만 모듈 단위 평탄, Service/DTO 화면 단위) 하되 본 화면의 Service 클래스 구현은 OASIS BPMN 의 commonDbTask 가 흡수 (별도 클래스 ✗) |

---

## 4. 트랜잭션 경계 / 오류 처리

### 4.1 트랜잭션 모델

| 경계 | 범위 | 비고 |
|---|---|---|
| lov (API-001) | Task_1erud76 — 단순 조회 (Read-only) | 트랜잭션 외부 |
| searchCmRoleGrp (API-002) | Task_00oihyb — 단순 조회 (Read-only) | 트랜잭션 외부 |
| saveCmRoleGrp (API-003) | Task_1dh8dal (CommonMultiSaveTask) 의 for 루프 전체 = 단일 트랜잭션 (OASIS framework) | 한 행 실패 → 전체 rollback (OASIS 표준) |
| searchCmRoleGrpMap (API-004) | Task_0xxo78b — 단순 조회 (Read-only) | 트랜잭션 외부 |
| saveCmRoleGrpMap (API-005) | Task_0weig4p (CommonMultiSaveTask) 의 for 루프 전체 = 단일 트랜잭션 | 한 행 실패 → 전체 rollback |
| searchCmRole (API-006) | Task_1re6tzu — 단순 조회 (Read-only) | 트랜잭션 외부 |
| searchCmRoleGrpMenu (API-007) | Task_1p3b1yy — 단순 조회 (Read-only) | 트랜잭션 외부 |

### 4.2 오류 응답

| 상황 | 응답 | 클라이언트 처리 |
|---|---|---|
| CommonMultiSaveTask 분기 실패 (dao.update <= 0) | OASIS framework 의 표준 오류 응답 (IllegalTaskException 등가) | `nErrorCode != 0` → fn_callBack else 분기 → `div_bottom.form.fn_commonBottomStatus_msg(strErrorMsg)` 표시 |
| deleteCommRoleGrp 의 NOT EXISTS 차단 (rowcount=0) | rowcount=0 → CommonMultiSaveTask 의 행 단위 실패 처리 정책에 따라 트랜잭션 fail | 동일 |
| validation 실패 (xfdl 단계) | `gfn_message(..., "warning"/"error"/"information", ...)` 모달 + return (서버 미호출) | - |
| 서버 200 + ds 갱신 | callback 정상 분기 → `fn_commonBottomStatus_msg("{N}건 조회 되었습니다.")` 또는 info ("저장 되었습니다.") | - |

### 4.3 동시성 / Optimistic Locking

| 항목 | As-Is | To-Be |
|---|---|---|
| Last-write-wins / 동시 수정 검증 | As-Is 명시 ✗ | **To-Be**: cactus-core `CactusAuditEntity.VER` (@Version) 자동 적용 — JPA Optimistic Locking 활성화 (사용자 결정 — cma 4 화면 정책 동일) |

---

## 5. 트랜잭션 경계별 입출력 DTO 매핑

### ~~5.1 lov (API-001)~~ — **To-Be 정책 #1 폐기 / Q-005 + Q-008 자동 해소**

본 절은 As-Is 인용만. To-Be DTO 매핑 ✗.

### 5.2 searchCmRoleGrp (API-002)

| Request Body | 타입 | As-Is 컬럼 | 비고 |
|---|---|---|---|
| edt_ROLE_GROUP_ID | string | (검색 조건) | LIKE 부분 일치 (UPPER) |
| edt_ROLE_GROUP_NM | string | (검색 조건) | UPPER 대소문자 무시 부분 일치 |
| cbo_USE_TP | string | (검색 조건) | 정확 일치 |
| ~~cbo_bizSystemCode~~ | - | - | **To-Be 정책 #1 폐기** |

| Response | 타입 | 비고 |
|---|---|---|
| ds_main → ds_main | List<Map> (ROLE_GROUP_ID / ROLE_GROUP_NM / ROLE_GROUP_DESC / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / USER_ID(scalar subquery) — **As-Is 8 → To-Be 7 컬럼**, BIZ_SYSTEM_CODE 폐기) | §9.1 분석리포트 인용 |

### 5.3 saveCmRoleGrp (API-003)

| Request Body | 타입 | 비고 |
|---|---|---|
| ds_main (`:U` 변경 행만 + status enum) | List<Map> (INSERT: 7 컬럼 / UPDATE: 7 컬럼 / DELETE: 1 컬럼) | CommonMultiSaveTask 의 nativeeditor_status 분기 |

| Response | 타입 | 비고 |
|---|---|---|
| (없음 — 콜백에서 fn_search 재호출로 재조회) | - | OASIS framework 가 정상/오류 종료 코드만 반환 |

### 5.4 searchCmRoleGrpMap (API-004)

| Request Body | 타입 | As-Is 컬럼 |
|---|---|---|
| ROLE_GROUP_ID | string | = ds_main.rowposition.ROLE_GROUP_ID |

| Response | 타입 | 비고 |
|---|---|---|
| ds_roleGrpMap → ds_roleGrpMap | List<Map> (ROLE_ID / ROLE_NM / MENU_ID / USE_TP / START/END_ACTIVE_DATE / ROLE_GROUP_ID + **PARENT_ROLE_ID** — As-Is 7 → **To-Be 8 컬럼**, Q-010 해소) | §9.2 분석리포트 인용 |

### 5.5 saveCmRoleGrpMap (API-005)

| Request Body | 타입 | 비고 |
|---|---|---|
| ds_roleGrpMap (`:U` 변경 행 + status 분기) | List<Map> (INSERT: 2 컬럼 / UPDATE: 더미 DUAL / DELETE: 2 컬럼) | CommonMultiSaveTask 의 nativeeditor_status 분기 |

| Response | 타입 | 비고 |
|---|---|---|
| (없음 — 콜백에서 3 회 chain 재조회) | - | - |

### 5.6 searchCmRole (API-006)

| Request Body | 타입 | As-Is 컬럼 |
|---|---|---|
| ROLE_GROUP_ID | string | (NOT EXISTS subquery 의 매핑 검증용) |

| Response | 타입 | 비고 |
|---|---|---|
| ds_role → ds_role | List<Map> (ROLE_ID / ROLE_NM / MENU_ID / USE_TP / START/END_ACTIVE_DATE + **PARENT_ROLE_ID** — As-Is 6 → **To-Be 7 컬럼**, Q-010 해소) | §9.3 분석리포트 인용 |

### 5.7 searchCmRoleGrpMenu (API-007)

| Request Body | 타입 | As-Is 컬럼 |
|---|---|---|
| ROLE_GROUP_ID | string | (계층 쿼리 WITH MROLE 의 WHERE 키) |

| Response | 타입 | 비고 |
|---|---|---|
| ds_menuTreeList → ds_menuTreeList | List<Map> (MENU_ID / MENU_SEQ / MENU_NM / LEV / PARENT_MENU_ID / ROW_SEQ / OBJECT_ID / MENU_VIEW_YN — 8 컬럼) | §9.6 / §9.7 / §9.8 분석리포트 인용 |

---

## 6. To-Be 식별자 (BPMN 기능 식별자 안)

> 정본 명명 (R-12): BPMN 기능 식별자 = `{screenId}_{기능명}` = `commRoleGrpMng_{action}`. 본 §6 은 As-Is 의 hash id (Task_xxx) 와 1:1 매핑 안.

### 6.1 process / serviceId

| As-Is | To-Be |
|---|---|
| bpmn2:process id = `CommRoleGrpMng` | `commRoleGrpMng` (= serviceId) |
| process name = "부모역할 부여 조회" (As-Is 부정확) | **`name="역할 그룹 관리"`** (Q-011 해소 — process name 정정) |

### 6.2 action 분기 (sequenceFlow name) — **활성 6 enum / lov 폐기**

| As-Is sequenceFlow id / name | To-Be 기능 식별자 |
|---|---|
| ~~`SequenceFlow_0gdqjne`~~ / ~~name="lov"~~ | **To-Be 정책 #1 폐기** (Q-005 / Q-008 자동 해소) |
| `SequenceFlow_0tt1mbk` / name="searchCmRoleGrp" | `commRoleGrpMng_searchCmRoleGrp` |
| `SequenceFlow_0grwghu` / name="saveCmRoleGrp" | `commRoleGrpMng_saveCmRoleGrp` |
| `SequenceFlow_11y43nf` / name="searchCmRoleGrpMap" | `commRoleGrpMng_searchCmRoleGrpMap` |
| `SequenceFlow_109h9q1` / name="saveCmRoleGrpMap" | `commRoleGrpMng_saveCmRoleGrpMap` |
| `SequenceFlow_13bmd6q` / name="searchCmRole" | `commRoleGrpMng_searchCmRole` |
| `SequenceFlow_0oowkcm` / name="searchCmRoleGrpMenu&#10;" (As-Is name 끝에 줄바꿈) | `commRoleGrpMng_searchCmRoleGrpMenu` (To-Be 정정 — 줄바꿈 제거) |

### 6.3 Task / UserTask id (As-Is 보존 권고)

| As-Is task id | name | To-Be 식별자 |
|---|---|---|
| `Task_00oihyb` | 역할 그룹 조회 | (As-Is 보존 권고 — BPMN 내부 id) |
| `Task_1dh8dal` | 역할 그룹 저장 | (동일) |
| `Task_0xxo78b` | 역할 그룹 부여 조회 | (동일) |
| `Task_0weig4p` | 역할 그룹 부여 저장 | (동일) |
| `Task_1re6tzu` | 역할 조회 | (동일) |
| `Task_1p3b1yy` | 역할 그룹 메뉴 조회 | (동일) |
| ~~`Task_1erud76`~~ | ~~lov_SUBSYSTEM 조회~~ | **To-Be 정책 #1 폐기** (Q-005 / Q-008 자동 해소) |

### 6.4 sqlKey (#{serviceId}Mapper)

| As-Is sqlKey | To-Be sqlKey (serviceId 치환) |
|---|---|
| `#{serviceId}Mapper.selectCommRoleGrp` | `commRoleGrpMngMapper.selectCommRoleGrp` |
| `#{serviceId}Mapper.insertCommRoleGrp` | `commRoleGrpMngMapper.insertCommRoleGrp` |
| `#{serviceId}Mapper.updateCommRoleGrp` | `commRoleGrpMngMapper.updateCommRoleGrp` |
| `#{serviceId}Mapper.deleteCommRoleGrp` | `commRoleGrpMngMapper.deleteCommRoleGrp` |
| `#{serviceId}Mapper.selectCommRoleGrpMap` | `commRoleGrpMngMapper.selectCommRoleGrpMap` |
| `#{serviceId}Mapper.insertCommRoleGrpMap` | `commRoleGrpMngMapper.insertCommRoleGrpMap` |
| `#{serviceId}Mapper.updateCommRoleGrpMap` | `commRoleGrpMngMapper.updateCommRoleGrpMap` (더미 DUAL 보존 — CommonMultiSaveTask 의 updateSqlKey 요구) |
| `#{serviceId}Mapper.deleteCommRoleGrpMap` | `commRoleGrpMngMapper.deleteCommRoleGrpMap` |
| `#{serviceId}Mapper.selectCommRole` | `commRoleGrpMngMapper.selectCommRole` |
| `#{serviceId}Mapper.selectMenuObjTree` | `commRoleGrpMngMapper.selectMenuObjTree` |
| ~~`CommObjMngMapper.selectAppHostId`~~ | **To-Be 정책 #1 폐기** (외부 namespace 호출 자체 제거 / Q-005 해소) |

### 6.5 UserTask class 패키지

| As-Is | To-Be (제안 — 사용자 결정 위임) |
|---|---|
| (Java UserTask 부재 — N/A) | - |
| `com.dongkuk.dmes.mui.task.ui.csa.CommRoleGrpMng.{ScriptTask 흡수 — 별도 Service 클래스 ✗}` | (별도 Service 클래스 신규 작성 ✗) — BPMN 의 commonDbTask 가 흡수 |
| Entity / Repository 패키지 | `com.dongkuk.dmes.mcm.{entity,repository}.*` (모듈 단위 평탄, cma 4 화면 정책 동일) |
| **Entity 클래스 명명 (정책 #6 A — 분석 §11.1 정본)** | `SecRoleGroup` (TB_MCM_SEC_ROLEGROUP) / `SecRoleGroupMapping` (TB_MCM_SEC_ROLEGROUP_MAPPING) / `SecRoleGroupRole` (별칭 — 정본은 commRoleMng 의 SecRole). read-only 인용: SecRole / SecRoleMapping / SecUserMapping / SecMenu / SecMenuFld / SecObj |

---

## 7. As-Is 인용 정합

| 본 § | 인용 정본 | 검증 |
|---|---|---|
| §1.1 | 분석 §8.3 (action 7 분기 + 흐름) | 7 API + 7 action 일치 |
| §1.2 | 분석 §11 C1~C6 | 0/6 → OASIS 단일 채택 |
| §2.1 ~ §2.7 | 분석 §6 (SQL ID) + §8 (BPMN 전수) | 모든 task id / sequenceFlow id / sqlKey / class cite 100% |
| §3 | 분석 §7 (해당 없음 — Java UserTask 부재) | "해당 없음" 보존 + 사유 명시 |
| §4 | 분석 §6 + xfdl callback | 트랜잭션 경계 + 오류 처리 As-Is 보존 |
| §5 | 분석 §6 + xfdl gfn_transaction 인자 | sInDatasets / sOutDatasets / sArgument As-Is 1:1 |
| §6 | 분석 §8 + 정합체크서 §B 명명 규칙 | To-Be 명명 안 (제안) |

---

## §-1. §6.14 Phase 종료 자동 고해성사 4 질문

| # | 질문 | 답변 |
|---|---|---|
| 1 | 14항 위반? | No — 분석리포트 갱신본 §6 (SQL 10) + §8 (BPMN 활성 9 노드 + 13 sequenceFlow + **6 action**) 1:1 인용. lov 폐기 반영 |
| 2 | 검증 안 한 부분? | No — 6 활성 action 모두 §2 본문 + §5 DTO 매핑 + §6 To-Be 명명 안 명시. Q-005 / Q-008 / Q-010 / Q-011 모두 §1.1 / §2.x / §5.x / §6.1 / §6.2 / §6.4 본문 명시 |
| 3 | 그대로 수용? | Yes — 정책 #1 (BIZ SYSTEM 콤보 제거) 으로 lov action 폐기 → action **6 enum** 으로 사용자 사전 명시 일치 (Q-008 해소) |
| 4 | 임의 합리화? | No — 가이드 §외 임의 신설 없음. Java UserTask 부재 사유 §3 명시 |

> 4 질문 모두 통과 → Phase 4 BPMN설계서 작성 완료. **2026-05-31 갱신 적용 — Q 12 건 해소 / action 6 enum / process name 정정 / Task_1erud76 폐기 / PARENT_ROLE_ID SELECT 추가**.
