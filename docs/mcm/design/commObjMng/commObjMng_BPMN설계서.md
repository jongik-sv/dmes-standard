---
screenId: commObjMng
asIsId: CommObjMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29 (6 정책 결정 일괄 반영: 2026-05-31)
작성자: Agent
---

# mcm — OBJECT 관리 BPMN설계서

> **BackEnd / BPMN 측 확정 값**:
> - 프로세스 ID: `commObjMng` (= serviceId, As-Is bpmn process id = `CommObjMng`)
> - Bean명: `commObjMngService`
> - moduleId / serviceId / API URL 정본: 04 §A.2-3
> - UI→BFF: `POST /api/mcm/oasis/commObjMng/{action}`
> - BFF→BE: `POST /oasis/commObjMng/{action}`
>
> **명명 룰**: MES 단일 룰 (4 식별자 1byte 동일 — mcm 모듈, APS 예외 미적용)
>
> **인용 정본**: 분석리포트 §6 (SQL ID) + §7 (Java = 해당 없음) + §8 (BPMN 전수). 자체 추가 ✗.
> **As-Is 1:1 보존**: BPMN node id (Task_00oihyb / Task_1dh8dal 등 hash 형식), sequenceFlow id, modelerTemplate 인용 그대로 보존. 변환은 §6 "To-Be 식별자" 안에서만 제안.

---

## 1. 프로세스 개요

> **표기 컨벤션**:
> - DB 컬럼명 / 테이블명: SNAKE_CASE — As-Is 보존 (`MCMAPUSER.TB_MCM_SEC_*` — 사용자 결정)
> - audit 컬럼: cactus-core `CactusAuditEntity` 9 컬럼 자동 (`C_*` / `U_*` / `VER`) — JPA `@PrePersist` / `@PreUpdate`
> - API JSON 필드: camelCase (`edt_OBJECT_ID` / `cbo_USE_TP` / `cbo_bizSystemCode` 등 As-Is `gfn_scanOpenerComponent` 자동 수집 키 보존)
> - Java 패키지 (정책 #1 / #6 (A) 일괄 반영 2026-05-31):
>   - Entity = `com.dongkuk.dmes.mcm.entity.*` (모듈 직속 — 가이드 §3-1) — `SecObj` (본 owner) / `SecMenu` / `SecMenuFld` / `SecRoleMapping` (read-only 조인 — As-Is 직역 클래스명, 정책 #6 (A))
>   - Repository = `com.dongkuk.dmes.mcm.repository.SecObjRepository` (JPA only, native query 허용 — 정책 #1)
>   - Service / DTO = `com.dongkuk.dmes.mcm.csa.commObjMng.{service|dto}.*` (가이드 §6-A-1 / §7-1)
>   - audit = `McmAuditEntity` 상속 (cma 정본 패턴 — 정책 #6 (A))
>   - **APP_HOST / BIZ_SYSTEM_CODE 폐기 (정책 #1)**: 본 화면에서 의존 자산 (Entity AppHost / selectAppHostId / BPMN Task_0wm0wlq + SequenceFlow_1igvr9j) 모두 미생성. 기존 mcm-core cma 정본 자산은 보존
> - DB ↔ DTO 매핑은 API 계층에서

### 1.1 API 엔드포인트 총괄 (분석 §6 + §8 채택 결과 인용)

| API-ID | Method | URL | 설명 | action (분기 enum) | 트리거 (B-NNN) |
|---|---|---|---|---|---|
| API-001 | POST | `POST /oasis/commObjMng/searchCmObj` | OBJECT 그리드 조회 | searchCmObj | B-001 (`btn_search`, 공통 topMenu) |
| API-002 | POST | `POST /oasis/commObjMng/saveCmObj` | OBJECT 일괄 저장 (UPDATE/INSERT/DELETE status 자동 분기 — CommonMultiSaveTask) | saveCmObj | B-003 (`btn_save`, 공통 topMenu) |
| API-003 | POST | `POST /oasis/commObjMng/lov` | As-Is: BIZ SYSTEM (APP_HOST_ID) + MENU ID 2 dataset 동시 조회 / **To-Be 정책 #1**: MENU ID 1 dataset 만 조회 (APP_HOST_ID/BIZ_SYSTEM_CODE 폐기) | lov | Form onload (자동, `fn_lov`, xfdl:271) |

> **As-Is action 3 종 모두 To-Be 유지 확정** (action enum 그대로 — search/save/lov). **To-Be 정책 #1**: lov action 의 SQL 6→5 축소 (selectAppHostId 폐기) + BPMN Task_0wm0wlq + SequenceFlow_1igvr9j 노드 제거 (action enum 6→6 유지가 아닌 7→6 = sub-task 1 감소).
> **가이드 표준 6 enum (search / searchDetail / save / saveDetail / delete / deleteDetail) 대비**:
> - `search` → `searchCmObj` (1:1 매핑)
> - `save` → `saveCmObj` (1:1 매핑)
> - `searchDetail` / `saveDetail` / `delete` / `deleteDetail` → **"해당 없음"** (본 화면은 단일 그리드, delete 는 save 의 자동 status 분기로 처리)
> - 추가 `lov` → 가이드 표준 6 enum 외 (OASIS 단일 BPMN 패턴에서는 Form 초기 LoV 로딩 별도 action 으로 종종 사용 — 본 화면 As-Is 보존)

### 1.2 API 패턴 자동 판정 결과 (C1~C6)

| 조건 | 충족 (Y/N) | 근거 | 판정 영향 |
|---|---|---|---|
| C1. As-Is SP case 분기 4종 이상 + 조회/트랜잭션 분리 | N | mui 의 As-Is 는 SP 가 아니라 Mapper.xml inline SQL. ExclusiveGateway 의 3 분기는 SP case 분기가 아닌 BPMN flow 분기 — C1 정의에 부적합 | - |
| C2. LoV master 호출 컬럼 5종 이상 | N | As-Is: LV-001 (ds_lovSubSystem, selectAppHostId) + LV-002 (ds_lovMenuId, selectMenuId) + LV-003 (ds_useTp, 정적) + LV-004 (ds_access_tp, 정적) = 4 LoV / **To-Be 정책 #1**: 3 LoV (LV-001 폐기 + 후속 LV 재정렬 LV-002→LV-001 등). C2 미충족 | - |
| C3. 회사·공장 종속 LoV 1종 이상 | N | 모든 LoV 가 시스템 공통 (회사/공장 의존 ✗) | - |
| C4. 동적 컬럼 응답 팝업/그리드 1개 이상 | N | 그리드 컬럼 구성 고정 (As-Is 보존). D-010 ACCESS_TP 분기는 단일 컬럼의 enable 분기로 응답 자체는 정적 | - |
| C5. 독립 query 분리가 적합함 | N | save 와 search 가 BPMN 내에서 chain (saveCmObj 콜백 → 자동 fn_run("searchCmObj") 재조회) — 독립 분리 부적합 | - |
| C6. 외부 SP 호출로 단일 actionGateway 부적합 | N | 외부 SP 호출 ✗ — 본 화면 SQL 모두 자체 Mapper namespace | - |

| 항목 | 값 |
|---|---|
| C1~C6 충족 개수 | **0 / 6** |
| 채택 패턴 | **OASIS 단일 BPMN (자동)** (충족 0~1 룰) |
| API 라우팅 | `POST /oasis/{serviceId}/{action}` |
| Q-NNN 등재 여부 | N (충족 0 — OASIS 단일 BPMN 적용) |

> As-Is BPMN 자체가 단일 ExclusiveGateway 의 3 action 분기 형태 — OASIS 단일 BPMN 패턴 그대로 To-Be 채택.

---

## 2. 프로세스별 BPMN 상세

> 본 §2 는 분석리포트 §8 (BPMN 전수) 의 모든 task / sequenceFlow 를 action 별로 흐름 ASCII 로 표현. As-Is BPMN id (Task_xxx / SequenceFlow_xxx) 모두 보존.

### 2.1 searchCmObj (B-001 → API-001) — OBJECT 조회

```
[btn_search 클릭]  (xfdl:404 → fn_run("searchCmObj"))
    │
    ├─ edt_OBJECT_ID    ← div_search.form.edt_OBJECT_ID.value         (S-002)
    ├─ cbo_USE_TP       ← div_search.form.cbo_USE_TP.value             (S-003)
    ├─ ~~cbo_bizSystemCode ← div_search.form.cbo_bizSystemCode.value     (S-001)~~ — To-Be 정책 #1 폐기
    │  (gfn_scanOpenerComponent(div_search.form) 자동 수집 — To-Be 정책 #1 후 2 파라미터 수집)
    │
    ▼  fn_beforeRun: ds_main.clearData() + filter("")  (xfdl:311~315)
    │
    ▼
POST /oasis/commObjMng/searchCmObj   (UI→BFF)  →  /oasis/commObjMng/searchCmObj   (BFF→BE)
    │
    ▼  StartEvent_1 (bpmn:4)
    │
    │  SequenceFlow_1 (bpmn:21)
    │
    ▼  ExclusiveGateway_1 (bpmn:12 — name="분기", shapeBackground=#ffff00)
    │
    │  SequenceFlow_0tt1mbk name="searchCmObj"  (bpmn:38)
    │
    ▼  Task_00oihyb "OBJECT 정보 조회"  (bpmn:23)
    │  class=com.dongkuk.oasis.task.commonDbTask.CommonSelectTask
    │  modelerTemplate=com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate
    │  isServiceResult=true, dao="", paramKey="", sqlKey=#{serviceId}Mapper.selectCommObjMng
    │  resultKey=ds_main
    │
    │  SQL (selectCommObjMng, xml:7~41) — As-Is 본문 + **To-Be 정책 #1** 폐기 분기 명시:
    │  SELECT A.OBJECT_ID, A.OBJECT_NM, A.PROGRAM_DESC, A.SYSTEM_CODE,
    │         ~~A.BIZ_SYSTEM_CODE,~~ (To-Be 정책 #1 폐기) A.OBJECT_TYPE, A.SERVICE, A.USE_TP, A.ACCESS_TP,
    │         A.FORM_URL, A.OUT_ACCESS_IP, A.PARAM, A.START_ACTIVE_DATE,
    │         A.END_ACTIVE_DATE,
    │         (SELECT B.MENU_ID FROM MCMAPUSER.TB_MCM_SEC_MENU B
    │          WHERE B.OBJECT_ID = A.OBJECT_ID AND ROWNUM = 1) AS MENU_ID,
    │         SUBSTR(A.OBJECT_ID, INSTR(A.OBJECT_ID,'::')+2, LENGTH(A.OBJECT_ID)) AS ID
    │  FROM MCMAPUSER.TB_MCM_SEC_OBJ A
    │  <where>
    │    <if edt_OBJECT_ID>: (UPPER(A.OBJECT_ID) LIKE UPPER('%'||#{edt_OBJECT_ID}||'%')
    │                          OR UPPER(A.OBJECT_NM) LIKE UPPER('%'||#{edt_OBJECT_ID}||'%'))
    │    <if cbo_USE_TP>: AND A.USE_TP = #{cbo_USE_TP}
    │    ~~<if cbo_bizSystemCode>: AND A.BIZ_SYSTEM_CODE = #{cbo_bizSystemCode}~~ (To-Be 정책 #1 폐기)
    │  </where>
    │  ORDER BY A.START_ACTIVE_DATE
    │
    │  SequenceFlow_105vwsz (bpmn:37)
    │
    ▼  EndEvent_1 (bpmn:7)
    │
    ▼  callback (fn_callBack("searchCmObj"), xfdl:375)
        ├─ ds_main = ds_main (out alias 동명)
        ├─ bottom status: "{strErrorMsg['ds_main']}건 조회 되었습니다."  (M-007)
        └─ ds_main.getRowCount() > 0 → Detail 영역 활성화
           (gfn_setEnable("...div_mainDetail","true"), xfdl:379)
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_main=ds_main` |
| 파라미터 (sArgument) | `gfn_scanOpenerComponent(div_search.form)` — `edt_OBJECT_ID` + `cbo_USE_TP` + `cbo_bizSystemCode` 자동 수집 |
| BPMN node | StartEvent_1 → ExclusiveGateway_1 → Task_00oihyb → EndEvent_1 |
| 호출 SQL (순서대로) | selectCommObjMng (xml:7) |

### 2.2 saveCmObj (B-003 → API-002) — OBJECT 일괄 저장 (status 자동 분기)

```
[B-003 btn_save 클릭]  (xfdl:464 → fn_save → fn_run("saveCmObj"))
    │
    ▼  3 단계 validation (V-001 ~ V-003, 기능 §6.1)
    │  + fn_beforeRun: (무동작 — sSvcId saveCmObj 분기 빈 본문, xfdl:317)
    │  + fn_run save 사전 처리: START/END_ACTIVE_DATE 8자 substring (V-901)
    │
    ├─ ds_main (변경 행만 :U — `:U` 마커는 status enum 분류)
    └─ sArgs = "" (saveCmObj 분기는 sArgs 미설정, xfdl:361)
    │
    ▼
POST /oasis/commObjMng/saveCmObj
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_0grwghu name="saveCmObj"  (bpmn:22)
    │
    ▼  Task_1dh8dal "OBJECT 정보 저장"  (bpmn:39)
    │  class=com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask
    │  modelerTemplate=com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask
    │  isServiceResult=true, dao="", nextBranchSpel=""
    │  paramKey=ds_main, resultKey=ds_main
    │  insertSqlKey=#{serviceId}Mapper.insertCommObjMng
    │  updateSqlKey=#{serviceId}Mapper.updateCommObjMng
    │  deleteSqlKey=#{serviceId}Mapper.deleteCommObjMng
    │
    │  처리 (CommonMultiSaveTask 표준 — `!nativeeditor_status` 자동 분기):
    │  ├─ for row in ds_main:
    │  │   status = row.get("!nativeeditor_status")
    │  │   ├─ "inserted" → dao.insert("commObjMngMapper.insertCommObjMng", row)
    │  │   │              ├─ INSERT INTO MCMAPUSER.TB_MCM_SEC_OBJ
    │  │   │              │   (OBJECT_ID, OBJECT_NM, PROGRAM_DESC, SYSTEM_CODE,
    │  │   │              │    ~~BIZ_SYSTEM_CODE,~~ (To-Be 정책 #1 폐기) OBJECT_TYPE, SERVICE, USE_TP, ACCESS_TP,
    │  │   │              │    FORM_URL, OUT_ACCESS_IP, PARAM, START_ACTIVE_DATE,
    │  │   │              │    END_ACTIVE_DATE
    │  │   │              │    ~~<include ref_Audit.insert_item />~~ (To-Be McmAuditEntity JPA 자동))
    │  │   │              └─ VALUES (... As-Is 14 컬럼 / **To-Be 13 컬럼** + ~~<include ref_Audit.insert_value />~~ JPA 자동)
    │  │   │
    │  │   ├─ "updated"  → dao.update("commObjMngMapper.updateCommObjMng", row)
    │  │   │              ├─ UPDATE MCMAPUSER.TB_MCM_SEC_OBJ
    │  │   │              │   SET OBJECT_NM, PROGRAM_DESC, SYSTEM_CODE, ~~BIZ_SYSTEM_CODE,~~ (To-Be 정책 #1 폐기)
    │  │   │              │       OBJECT_TYPE, SERVICE, USE_TP, ACCESS_TP, FORM_URL,
    │  │   │              │       OUT_ACCESS_IP, PARAM, START_ACTIVE_DATE,
    │  │   │              │       END_ACTIVE_DATE
    │  │   │              │       ~~<include ref_Audit.update />~~ (To-Be McmAuditEntity JPA 자동)
    │  │   │              └─ WHERE OBJECT_ID = #{OBJECT_ID}
    │  │   │
    │  │   └─ "deleted"  → dao.delete("commObjMngMapper.deleteCommObjMng", row)
    │  │                  ├─ DELETE FROM MCMAPUSER.TB_MCM_SEC_OBJ A
    │  │                  └─ WHERE A.OBJECT_ID = #{OBJECT_ID}
    │  │                     AND NOT EXISTS (SELECT 'X' FROM MCMAPUSER.TB_MCM_SEC_MENU B
    │  │                                      WHERE B.OBJECT_ID = A.OBJECT_ID)
    │  │                     AND NOT EXISTS (SELECT 'X' FROM MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING C
    │  │                                      WHERE C.OBJECT_ID = A.OBJECT_ID)
    │  │
    │  └─ cnt = 각 분기 rowcount 누적
    │
    │  SequenceFlow_1vkp3qd (bpmn:56)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack("saveCmObj"), xfdl:384)
        ├─ bottom status: "{strErrorMsg['ds_main']}건 조회 되었습니다."  (M-007 재사용 — As-Is 결함 보존)
        ├─ gfn_message("", "", "성공적으로 저장되었습니다.", "info", "확인", fn_msgSuccessSave)  (M-006)
        └─ fn_msgSuccessSave callback: rtn ✓ → fn_run("searchCmObj") 자동 재조회
```

| 입력 (sInDatasets) | `ds_main=ds_main:U` (변경 행만 전송 — CommonMultiSaveTask 가 status 자동 분기) |
|---|---|
| 출력 (sOutDatasets) | (xfdl 명시 ✗ — sOutDs="" 빈 값, xfdl:329) — server resultKey=ds_main 으로 갱신 |
| 파라미터 (sArgument) | (없음 — sArgs="" 빈 값, xfdl:361) |
| BPMN node 흐름 | Start → Gateway → Task_1dh8dal → End |
| 호출 SQL (status 자동 분기) | insertCommObjMng (xml:43) / updateCommObjMng (xml:80) / deleteCommObjMng (xml:99) |

### 2.3 lov (Form onload → API-003) — LoV 사전 로딩

```
[Form onload 자동]  (xfdl:271 → fn_lov)
    │  sUrl="" / sInDatasets="" / sArgs=""
    │
    ▼
POST /oasis/commObjMng/lov
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_13avwvi name="lov"  (bpmn:85)
    │  As-Is targetRef: Task_0wm0wlq / **To-Be 정책 #1**: Task_1lhctxq (직결 — selectAppHostId 노드 제거)
    │
    │  ~~▼  Task_0wm0wlq "lov_SUBSYSTEM 조회"  (bpmn:57) — To-Be 정책 #1 폐기~~
    │  ~~class=CommonSelectTask, sqlKey=#{serviceId}Mapper.selectAppHostId~~
    │  ~~resultKey=ds_selectAppHostId / isServiceResult=true / dao="" / paramKey=""~~
    │  ~~modelerTemplate=MapperBaseDbAccessTemplate~~
    │
    │  ~~SQL (selectAppHostId, xml:112~116):~~
    │  ~~SELECT APP_HOST_ID FROM MCMAPUSER.TB_MCM_APPHOST GROUP BY APP_HOST_ID~~ — **To-Be 폐기 (정책 #1)**
    │
    │  ~~SequenceFlow_1igvr9j (bpmn:86)~~ — **To-Be 정책 #1 폐기**
    │
    ▼  Task_1lhctxq "lov_MENU_ID 조회"  (bpmn:71)
    │  class=CommonSelectTask, sqlKey=#{serviceId}Mapper.selectMenuId
    │  resultKey=ds_selectMenuId
    │
    │  SQL (selectMenuId, xml:118~130):
    │  SELECT MENU_ID,
    │         MAX(BIZ_SYSTEM_CODE) AS BIZ_SYSTEM_CODE,
    │         MAX(MENU_ID) || ' (' || MAX(MENU_NM) || ')' AS MENU_ID_NM
    │  FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD
    │  WHERE PARENT_MENU_ID IS NOT NULL
    │  GROUP BY MENU_ID
    │  ORDER BY MENU_ID
    │  (SELECT 의 BIZ_SYSTEM_CODE 컬럼은 TB_MCM_SEC_MENU_FLD 의 본 컬럼 — 본 화면 정책 #1 폐기는 APP_HOST 의 BIZ_SYSTEM_CODE 만 — read-only LoV 컬럼은 보존)
    │
    │  SequenceFlow_0pbcc9f (bpmn:87)
    │
    ▼  EndEvent_1
    │
    ▼  callback (gfn_transaction의 표준 callback — fn_lov 는 sCallbackFnc 미지정)
        ├─ ~~ds_lovSubSystem = ds_selectAppHostId  (out alias, xfdl:300)~~ — **To-Be 정책 #1 폐기**
        └─ ds_lovMenuId   = ds_selectMenuId      (out alias, xfdl:300)
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | As-Is: `ds_lovSubSystem=ds_selectAppHostId ds_lovMenuId=ds_selectMenuId` / **To-Be 정책 #1**: `ds_lovMenuId=ds_selectMenuId` (1 dataset 만) |
| 파라미터 (sArgument) | (없음) |
| BPMN node 흐름 | As-Is: Start → Gateway → Task_0wm0wlq → Task_1lhctxq → End / **To-Be 정책 #1**: Start → Gateway → Task_1lhctxq → End (Task_0wm0wlq + SequenceFlow_1igvr9j 제거) |
| 호출 SQL (순서대로) | As-Is: selectAppHostId → selectMenuId / **To-Be**: selectMenuId 만 |

### 2.4 ~ 2.6 searchDetail / saveDetail / delete / deleteDetail — **해당 없음**

본 화면은 단일 그리드 + 단일 상세 폼 (G+D) 형. As-Is BPMN process 의 ExclusiveGateway_1 은 3 outgoing 만 (searchCmObj / saveCmObj / lov). 가이드 표준 6 action enum 중:

| 가이드 표준 action | 본 화면 처리 |
|---|---|
| search | `searchCmObj` 로 1:1 매핑 (§2.1) |
| **searchDetail** | **해당 없음** — Detail 영역은 ds_main 의 BindItem 양방향 동기화로 자동 갱신 (별도 트랜잭션 ✗) |
| save | `saveCmObj` 로 1:1 매핑 (§2.2) |
| **saveDetail** | **해당 없음** — 단일 그리드 (Detail 별도 트랜잭션 ✗) |
| **delete** | **해당 없음** — `saveCmObj` 의 CommonMultiSaveTask 자동 status="deleted" 분기에서 `deleteCommObjMng` 호출 (xml:99) |
| **deleteDetail** | **해당 없음** |
| 추가 `lov` | `lov` action — Form onload 시 자동 호출 (§2.3) |

> **To-Be 동작**: As-Is 3 action 모두 보존. 가이드 표준 6 enum 명시. 별도 action 신설 ✗.

---

## 3. UserTask Java 클래스 상세

해당 없음 — 본 화면은 UserTask Java 클래스 ✗. BPMN 의 모든 Task (Task_00oihyb / Task_1dh8dal / Task_0wm0wlq / Task_1lhctxq) 는 ScriptTask (`com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` 또는 `CommonMultiSaveTask`) — Java 직접 작성 ✗.

> 분석 §2 #2 / §7 인용: `docs/external/.../task/ui/csa/CommObjMng/` 디렉토리 자체가 부재 (csa Java 디렉토리 ls 결과 = CommChainMasterMng / CommSyncMng / CommUserMng / CommUserRoleCopy 4 폴더만).

### 3.1 ScriptTask 보존 정책

| Task | class (FQN) | 보존 정책 |
|---|---|---|
| Task_00oihyb (OBJECT 정보 조회) | `com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` | As-Is 보존 — OASIS common DB task 표준 |
| Task_1dh8dal (OBJECT 정보 저장) | `com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask` | As-Is 보존 — `!nativeeditor_status` 자동 분기 (inserted/updated/deleted) |
| ~~Task_0wm0wlq (lov_SUBSYSTEM 조회)~~ | ~~`com.dongkuk.oasis.task.commonDbTask.CommonSelectTask`~~ | **To-Be 정책 #1 폐기** — selectAppHostId / ds_selectAppHostId / APP_HOST/BIZ_SYSTEM_CODE 의존 자산 모두 제거 |
| Task_1lhctxq (lov_MENU_ID 조회) | `com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` | As-Is 보존 — incoming sequenceFlow 가 As-Is `SequenceFlow_1igvr9j` 에서 **To-Be**: `SequenceFlow_13avwvi` (ExclusiveGateway_1) 로 직결 |

> 본 화면은 신규 Java UserTask 작성 ✗ (사용자 결정 — As-Is ScriptTask 보존). 신규 작성 시 패키지는 `com.dongkuk.dmes.mcm.csa.commObjMng.service.*` (가이드 §6-A-1 / §7-1 — 2026-05-31 6 정책 결정 #1 반영). **BPMN node 합계 — As-Is**: 7 노드 / SequenceFlow 9 → **To-Be 정책 #1**: 6 노드 / SequenceFlow 8 (Task_0wm0wlq + SequenceFlow_1igvr9j 제거). action enum 7→6.

---

## 4. 트랜잭션 경계 / 오류 처리

### 4.1 트랜잭션 모델

| 경계 | 범위 | 비고 |
|---|---|---|
| searchCmObj (API-001) | (조회 — 트랜잭션 외부 / Read-only) | - |
| saveCmObj (API-002) | Task_1dh8dal (CommonMultiSaveTask) 의 for 루프 전체 = 단일 트랜잭션 (`TransactionalDao`) | 한 행 실패 → 전체 rollback |
| lov (API-003) | (조회 — 트랜잭션 외부) | As-Is: 2 Task (selectAppHostId → selectMenuId) 순차 호출 / **To-Be 정책 #1**: 1 Task (selectMenuId 만) — 트랜잭션 경계 외 |

### 4.2 오류 응답

| 상황 | 응답 | 클라이언트 처리 |
|---|---|---|
| dao.update <= 0 (rowcount 0) | OASIS framework 의 표준 오류 응답 — CommonMultiSaveTask 내부에서 결정 | OASIS framework 의 표준 응답 — `nErrorCode != 0` → callback else 분기 → `gfn_commonBottomStatus_msg(strErrorMsg)` 표시 |
| deleteCommObjMng 의 `NOT EXISTS` 차단 (연결 메뉴 / 권한 mapping) | rowcount 0 (silent) — 에러 ✗ 단지 미삭제 | (xfdl B-006 단계에서 사전 차단으로 보호. server 만 차단 시 silent 미삭제 → 사용자 인지 ✗ 잠재 결함 — As-Is 보존) |
| validation 실패 (xfdl 단계) | `gfn_message(..., "warning", ...)` 모달 + return (서버 미호출) | - |
| 서버 200 + ds 갱신 | callback 정상 분기 → `gfn_commonBottomStatus_msg("{N}건 조회 되었습니다.")` (xfdl:376 / 385 재사용 — M-007 saveCmObj 분기 결함 보존) | - |

### 4.3 동시성 / Optimistic Locking

| 항목 | As-Is | To-Be |
|---|---|---|
| UPDATED_AT / 동시 수정 검증 (Optimistic Locking) | As-Is 명시 ✗ (last-write-wins) | **To-Be 정책 #6 (A)**: `McmAuditEntity` 상속 (cma 정본 패턴) — 8 audit 컬럼 JPA `@PrePersist` / `@PreUpdate` 자동. Optimistic Locking 은 McmAuditEntity 의 `@Version` 컬럼 정의 시 활성화 (cma 정본 결정 위임) |
| insert/update/delete race condition | Oracle 의 표준 트랜잭션 격리 | MSSQL 동일 패턴 적용 |

---

## 5. 트랜잭션 경계별 입출력 DTO 매핑

### 5.1 searchCmObj (API-001)

| Request Body | 타입 | As-Is 컬럼 | 비고 |
|---|---|---|---|
| edt_OBJECT_ID | string | (검색 조건) | UPPER LIKE 부분 일치 — A.OBJECT_ID OR A.OBJECT_NM (xml:30~31) |
| cbo_USE_TP | string | (검색 조건) | "Y" / "N" 일치 |
| ~~cbo_bizSystemCode~~ | ~~string~~ | ~~(검색 조건)~~ | ~~APP_HOST_ID 일치~~ — **To-Be 정책 #1 폐기** |

| Response | 타입 | 비고 |
|---|---|---|
| ds_main → ds_main | As-Is: List<Map> (16 컬럼 — OBJECT_ID, OBJECT_NM, PROGRAM_DESC, SYSTEM_CODE, ~~BIZ_SYSTEM_CODE~~, OBJECT_TYPE, SERVICE, USE_TP, ACCESS_TP, FORM_URL, OUT_ACCESS_IP, PARAM, START_ACTIVE_DATE, END_ACTIVE_DATE, MENU_ID(scalar subquery), ID(SUBSTR)) / **To-Be 정책 #1**: 15 컬럼 (BIZ_SYSTEM_CODE 폐기) | §9.1 분석리포트 인용 + scalar subquery 2 컬럼 (MENU_ID / ID) 별도 명시 |

### 5.2 saveCmObj (API-002)

| Request Body | 타입 | 비고 |
|---|---|---|
| ds_main (`:U` 변경 행만, `!nativeeditor_status` 포함) | As-Is: List<Map> (14 본 컬럼 + audit) / **To-Be 정책 #1**: 13 본 컬럼 + audit (McmAuditEntity JPA 자동) | CommonMultiSaveTask 가 자동 분기 — As-Is: insert 14 / update 13 + WHERE OBJECT_ID / delete 1 WHERE OBJECT_ID / **To-Be**: insert 13 / update 12 + WHERE OBJECT_ID / delete 1 WHERE OBJECT_ID |

| Response | 타입 | 비고 |
|---|---|---|
| ds_main → ds_main | (resultKey 동명 — server 측 갱신 결과 미반환 — As-Is callback 에서 ds_main 그대로 사용) | - |
| (콜백 자동) → fn_run("searchCmObj") | (재조회 — API-001 동일) | xfdl:389 fn_msgSuccessSave 콜백 |

### 5.3 lov (API-003)

| Request Body | 타입 | 비고 |
|---|---|---|
| (없음) | - | - |

| Response | 타입 | 비고 |
|---|---|---|
| ~~ds_lovSubSystem → ds_selectAppHostId~~ | ~~List<Map> (APP_HOST_ID 1 컬럼)~~ | ~~LV-001~~ — **To-Be 정책 #1 폐기** |
| ds_lovMenuId → ds_selectMenuId | List<Map> (MENU_ID, BIZ_SYSTEM_CODE, MENU_ID_NM 3 컬럼) | LV-001 (As-Is LV-002 → 정책 #1 재정렬) |

---

## 6. To-Be 식별자 (BPMN 기능 식별자 안)

> 정본 명명 (R-12): BPMN 기능 식별자 = `{screenId}_{기능명}` = `commObjMng_{action}`. 본 §6 은 As-Is 의 hash id (Task_xxx) 와 1:1 매핑 안.

### 6.1 process / serviceId

| As-Is | To-Be |
|---|---|
| bpmn2:process id = `CommObjMng` | `commObjMng` (= serviceId) |
| process name = "OBJECT 관리" | `commObjMng` (또는 "OBJECT 관리") |
| process isExecutable = false | (As-Is 보존 권고 — modelerTemplate 호환) |

### 6.2 action 분기 (sequenceFlow name)

| As-Is sequenceFlow id / name | To-Be 기능 식별자 |
|---|---|
| `SequenceFlow_0tt1mbk` / name="searchCmObj" | `commObjMng_searchCmObj` |
| `SequenceFlow_0grwghu` / name="saveCmObj" | `commObjMng_saveCmObj` |
| `SequenceFlow_13avwvi` / name="lov" | `commObjMng_lov` |

> As-Is `searchCmObj` / `saveCmObj` 이름은 가이드 표준 `search` / `save` 와 다름 — As-Is 보존 권고 (mui 자산 호환). To-Be 가이드 표준 정합 시 `search` / `save` 로 rename 가능 (사용자 결정 위임).

### 6.3 Task id (As-Is 보존 권고)

| As-Is task id | name | To-Be 식별자 |
|---|---|---|
| `Task_00oihyb` | OBJECT 정보 조회 | (As-Is 보존 권고 — BPMN 내부 id) |
| `Task_1dh8dal` | OBJECT 정보 저장 | (동일) |
| ~~`Task_0wm0wlq`~~ | ~~lov_SUBSYSTEM 조회~~ | **To-Be 정책 #1 폐기** |
| `Task_1lhctxq` | lov_MENU_ID 조회 | (As-Is 보존 — incoming sequenceFlow 직결 변경) |

### 6.4 sqlKey (#{serviceId}Mapper)

| As-Is sqlKey | To-Be sqlKey (serviceId 치환) |
|---|---|
| `#{serviceId}Mapper.selectCommObjMng` | `commObjMngMapper.selectCommObjMng` (To-Be 정책 #1: BIZ_SYSTEM_CODE SELECT+WHERE 분기 제거) |
| `#{serviceId}Mapper.insertCommObjMng` | `commObjMngMapper.insertCommObjMng` (To-Be 정책 #1: BIZ_SYSTEM_CODE INSERT 컬럼/VALUES 행 제거 + ref_Audit fragment 폐기 → McmAuditEntity JPA 자동) |
| `#{serviceId}Mapper.updateCommObjMng` | `commObjMngMapper.updateCommObjMng` (To-Be 정책 #1: BIZ_SYSTEM_CODE UPDATE SET 행 제거 + ref_Audit 폐기) |
| `#{serviceId}Mapper.deleteCommObjMng` | `commObjMngMapper.deleteCommObjMng` |
| ~~`#{serviceId}Mapper.selectAppHostId`~~ | ~~`commObjMngMapper.selectAppHostId`~~ — **To-Be 정책 #1 폐기** |
| `#{serviceId}Mapper.selectMenuId` | `commObjMngMapper.selectMenuId` |

### 6.5 UserTask class 패키지

해당 없음 — 본 화면은 UserTask Java 클래스 ✗. 모든 Task 가 ScriptTask (CommonSelectTask / CommonMultiSaveTask) — As-Is 보존.

신규 UserTask 신설 시:

| As-Is | To-Be (6 정책 결정 #1 / #6 (A) 반영 — 2026-05-31) |
|---|---|
| (해당 없음 — Entity) | `com.dongkuk.dmes.mcm.entity.SecObj` (모듈 직속 — 가이드 §3-1) / SecMenu / SecMenuFld / SecRoleMapping (정책 #6 (A) 직역명) — `extends McmAuditEntity` |
| (해당 없음 — Repository) | `com.dongkuk.dmes.mcm.repository.SecObjRepository` (JPA, native query 허용 — 정책 #1) |
| (해당 없음 — Service / DTO) | `com.dongkuk.dmes.mcm.csa.commObjMng.{service|dto}.*` (가이드 §6-A-1 / §7-1) |

---

## 7. As-Is 인용 정합

| 본 § | 인용 정본 | 검증 |
|---|---|---|
| §1.1 | 분석 §8.3 (action 3 분기 + 흐름) | 3 API + 3 action 일치 |
| §1.2 | 분석 §6 + §8 C1~C6 | C2 N (4 LoV) → 0/6 → OASIS 단일 채택 |
| §2.1 ~ §2.3 | 분석 §6 (SQL ID) + §8 (BPMN 전수) | 모든 task id / sequenceFlow id / sqlKey cite 100% |
| §2.4 ~ §2.6 | (해당 없음 — 4 action 가이드 표준 매핑) | searchDetail / saveDetail / delete / deleteDetail 모두 "해당 없음" 명시 |
| §3 | 분석 §7 = "해당 없음" | UserTask Java ✗ — ScriptTask 만 |
| §4 | 분석 §6 (CommonMultiSaveTask) + xfdl callback | 트랜잭션 경계 + 오류 처리 As-Is 보존 |
| §5 | 분석 §6 + xfdl gfn_transaction 인자 | sInDatasets / sOutDatasets / sArgument As-Is 1:1 |
| §6 | 분석 §8 + 정합체크서 §B 명명 규칙 | To-Be 명명 안 (제안) |

---

## 8. Phase 4 자체 검증 (§6.14 4질문)

| 질문 | 답 |
|---|---|
| 1. 14항 위반? | **No** — 분석 §6 + §8 직접 인용. action 3 enum 그대로. BPMN node id / sequenceFlow id 모두 cite. |
| 2. 검증 안 한 부분? | **No** — 가이드 표준 6 enum 매핑 (3 매핑 + 4 "해당 없음") 모두 명시. |
| 3. 그대로 수용? | **No** — As-Is 결함 (M-007 saveCmObj 분기 메시지 재사용 결함 / fn_msgSuccessSave 미선언 / deleteCommObjMng silent 미삭제 잠재 결함) 모두 As-Is 보존 + 분석 §12 인용. |
| 4. 임의 합리화? | **No** — As-Is action 이름 (searchCmObj / saveCmObj) 그대로. 가이드 표준 (search / save) rename 은 사용자 결정 위임 명시. |

> Phase 4 모두 No → Phase 5 진입.
