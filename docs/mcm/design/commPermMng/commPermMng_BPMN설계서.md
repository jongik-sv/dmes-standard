---
screenId: commPermMng
asIsId: CommPermMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# mcm — PERMISSION 관리 BPMN설계서

> **BackEnd / BPMN 측 확정 값**:
> - 프로세스 ID: `commPermMng` (= serviceId, As-Is bpmn process id = `sample1` / name = `menuInfor` — 다른 화면 잔존 오타. To-Be 정정)
> - Bean명: `commPermMngService`
> - moduleId / serviceId / API URL 정본: 04 §A.2-3
> - UI→BFF: `POST /api/mcm/oasis/commPermMng/{action}`
> - BFF→BE: `POST /oasis/commPermMng/{action}`
>
> **명명 룰**: MES 단일 룰 (4 식별자 1byte 동일 — mcm 모듈, APS 예외 미적용)
>
> **인용 정본**: 분석리포트 §6 (SQL ID) + §7 (Java — 해당 없음) + §8 (BPMN 전수). 자체 추가 ✗.
> **As-Is 1:1 보존**: BPMN node id (Task_00oihyb / Task_1dh8dal / Task_08v4ryn / ExclusiveGateway_1 등 hash 형식), sequenceFlow id, modelerTemplate 인용 그대로 보존. 변환은 §6 "To-Be 식별자" 안에서만 제안.
> **cross-cutting 정책 #1 적용 (2026-05-31)**: BIZ_SYSTEM_CODE 컬럼 폐기 — lov action / Task_08v4ryn / SequenceFlow_1dd2kqv / SequenceFlow_0xqzbh4 / cross-module `CommObjMngMapper.selectAppHostId` 모두 **To-Be 폐기**. As-Is 인용은 본문 보존. BPMN 노드 6→5 / sequenceFlow 7→5 / action 3→2.
> **cross-cutting 정책 #6 (A안, 2026-05-31)**: Entity 명명 = `SecPerm` (TB_MCM_SEC_PERM → SecPerm 1:1). SecPermButton Entity 미생성 (As-Is mui 에 별도 button 테이블 ✗).

---

## 1. 프로세스 개요

> **표기 컨벤션**:
> - DB 컬럼명 / 테이블명: SNAKE_CASE — As-Is 보존 (`MCMAPUSER.TB_MCM_SEC_PERM` / `MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING` — 사용자 결정)
> - audit 컬럼: cactus-core `CactusAuditEntity` 9 컬럼 자동 (`C_*` / `U_*` / `VER`) — JPA `@PrePersist` / `@PreUpdate`
> - API JSON 필드: camelCase (`edt_PERMISSION_ID` / `edt_PERMISSION_NM` / `cbo_USE_TP` / `cbo_bizSystemCode` 등 As-Is 파라미터 보존)
> - Java 패키지: Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 (모듈 단위 공유) / Service·DTO = `com.dongkuk.dmes.mcm.csa.commPermMng.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1)
> - DB ↔ DTO 매핑은 API 계층에서

### 1.1 API 엔드포인트 총괄 (분석 §8.3 / 기능설계서 §11 인용)

| API-ID | Method | URL | 설명 | action (분기 enum) | 트리거 (B-NNN / EX-NNN) |
|---|---|---|---|---|---|
| API-001 | POST | `POST /oasis/commPermMng/search` | Permission 그리드 조회 (selectCommPermMng) | searchCmPerm | EX-001 btn_search (공통 topMenu) → fn_search → fn_run("searchCmPerm") (xfdl:368~370) |
| API-002 | POST | `POST /oasis/commPermMng/save` | Permission 일괄 저장 (insert/update/delete `nativeeditor_status` 분기) + 후속 자동 search | saveCmPerm | EX-001 btn_save (공통 topMenu) → fn_save → fn_run("saveCmPerm") (xfdl:423~442) |
| ~~API-003~~ | ~~POST~~ | ~~`POST /oasis/commPermMng/lov`~~ | ~~BIZ SYSTEM (App Host ID) 콤보 LoV (cross-module `CommObjMngMapper.selectAppHostId`)~~ | ~~lov~~ | ~~onload → fn_lov (xfdl:244~263) — 1회만~~ → **To-Be 폐기** (cross-cutting 정책 #1) |

> **As-Is 3 action → To-Be 2 action** (lov 폐기, cross-cutting 정책 #1). 본 화면은 6 enum 중 search / save / popup ~~/ lov~~ 사용 — popup 은 BPMN ✗ (클라이언트 전용 — `gfn_openPopup`). delete / export 미사용.

### 1.2 API 패턴 자동 판정 결과 (C1~C6)

| 조건 | 충족 (Y/N) | 근거 | 판정 영향 |
|---|---|---|---|
| C1. As-Is SP case 분기 4종 이상 + 조회/트랜잭션 분리 | N | mui 의 As-Is 는 SP 가 아니라 Mapper.xml inline SQL. ExclusiveGateway 의 As-Is 3 분기 (searchCmPerm / saveCmPerm / lov) → **To-Be 2 분기** (searchCmPerm / saveCmPerm — cross-cutting 정책 #1 로 lov 폐기) 는 SP case 분기가 아닌 BPMN flow 분기 — C1 정의에 부적합 | - |
| C2. LoV master 호출 컬럼 5종 이상 | N | As-Is LV-001 (ds_cmbValidYn hardcoded) + LV-002 (Radio inner Dataset hardcoded) + LV-003 (ds_lovSubSystem cross-module) = 3 LoV → **To-Be 2 LoV** (LV-003 폐기) — 5 미만 | - |
| C3. 회사·공장 종속 LoV 1종 이상 | N | 모든 LoV 가 시스템 공통 (회사/공장 의존 ✗) | - |
| C4. 동적 컬럼 응답 팝업/그리드 1개 이상 | N | 그리드 컬럼 구성 고정 (As-Is 보존). 팝업 (commonPermBtnPopup) 은 외부 화면 — 본 화면 응답 ✗ | - |
| C5. 독립 query 분리가 적합함 | N | save 와 search 가 BPMN 내에서 chain (save 후 search 자동) — 독립 분리 부적합 | - |
| C6. 외부 SP 호출로 단일 actionGateway 부적합 | N | 외부 SP 호출 ✗ — 본 화면 SQL 모두 자체 Mapper namespace + 1 cross-module mapper sqlKey (`CommObjMngMapper.selectAppHostId`) | - |

| 항목 | 값 |
|---|---|
| C1~C6 충족 개수 | **0 / 6** |
| 채택 패턴 | **OASIS 단일 BPMN (자동)** (충족 0~1 룰) |
| API 라우팅 | `POST /oasis/{serviceId}/{action}` |
| Q-NNN 등재 여부 | N (충족 0 — 잠정 OASIS 룰 미적용) |

> As-Is BPMN 자체가 단일 ExclusiveGateway 의 3 action 분기 형태 — OASIS 단일 BPMN 패턴 그대로 To-Be 채택.

---

## 2. 프로세스별 BPMN 상세

> 본 §2 는 분석리포트 §8 (BPMN 전수) 의 모든 task / sequenceFlow 를 action 별로 흐름 ASCII 로 표현. As-Is BPMN id (Task_00oihyb / Task_1dh8dal / Task_08v4ryn / SequenceFlow_xxx) 모두 보존.

### 2.1 searchCmPerm (EX-001 btn_search → API-001) — Permission 조회

```
[btn_search 클릭] (공통 topMenu — EX-001, fn_commonTop_onload 등록)
    │
    ├─ edt_PERMISSION_ID  ← div_search.edt_PERMISSION_ID.value (S-002)
    ├─ edt_PERMISSION_NM  ← div_search.edt_PERMISSION_NM.value (S-003)
    ├─ cbo_USE_TP         ← div_search.cbo_USE_TP.value         (S-004)
    └─ cbo_bizSystemCode  ← div_search.cbo_bizSystemCode.value  (S-001)
    │
    ▼  fn_search (xfdl:368) → fn_run("searchCmPerm") (xfdl:284)
    │  fn_beforeRun: ds_main.clearData() + ds_main.filter("") (xfdl:272~275)
    │  sArgs = gfn_scanOpenerComponent(div_search.form) (xfdl:301)
    │
    ▼  gfn_transaction("searchCmPerm", "csa::CommPermMng", "", "ds_main=ds_main", sArgs, "fn_callBack") (xfdl:323)
    │
POST /oasis/commPermMng/search   (UI→BFF)  →  /oasis/commPermMng/search   (BFF→BE)
    │
    ▼  StartEvent_1 (bpmn:4~6)
    │
    │  SequenceFlow_1 (bpmn:21)
    │
    ▼  ExclusiveGateway_1 "분기" (bpmn:12~20, gatewayDirection="Diverging")
    │
    │  SequenceFlow_0tt1mbk name="searchCmPerm" (bpmn:38)
    │
    ▼  Task_00oihyb "PERMISSION 정보 조회" (bpmn:23~36)
    │  class=com.dongkuk.oasis.task.commonDbTask.CommonSelectTask
    │  modelerTemplate=com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate
    │  isServiceResult=true / dao="" / paramKey="" / resultKey="ds_main"
    │  sqlKey="#{serviceId}Mapper.selectCommPermMng" (→ CommPermMngMapper.selectCommPermMng, xml:7~40)
    │
    │  SequenceFlow_105vwsz (bpmn:37)
    │
    ▼  EndEvent_1 (bpmn:7~11)
    │
    ▼  fn_callBack("searchCmPerm", nErrorCode, strErrorMsg) (xfdl:330)
       div_bottom.fn_commonBottomStatus_msg(strErrorMsg["ds_main"] + "건 조회 되었습니다.") (xfdl:334)
       if (ds_main.getRowCount() > 0) gfn_setEnable("div_mainDetail", "true") (xfdl:336~338)
```

### 2.2 saveCmPerm (EX-001 btn_save → API-002) — Permission 일괄 저장

```
[btn_save 클릭] (공통 topMenu — EX-001)
    │
    ▼  fn_save (xfdl:423)
    │  검증 1: gfn_isDatasetChanged(ds_main) — false 면 "변경된 데이터가 없습니다." confirm + return false (xfdl:425~428)
    │  검증 2: gfn_dsRequired(grd_main, "PERMISSION_ID USE_TP") — false 면 return false (xfdl:431~433)
    │  검증 3: confirm "저장하시겠습니까?" → 콜백 fn_msgSaveBeforeCallBack — rtn true 시 진행 (xfdl:441)
    │
    ▼  this.fv_row = ds_main.rowposition  (xfdl:437 — rowposition 백업)
    │
    ▼  fn_run("saveCmPerm") (xfdl:284)
    │  날짜 8자 truncate: rowType != 1 (삭제 아님) 행의 START_ACTIVE_DATE / END_ACTIVE_DATE 가 8자 초과면 substring(0,8) (xfdl:308~317)
    │  sInDs = "ds_main=ds_main:U" (변경 행만)
    │
    ▼  gfn_transaction("saveCmPerm", "csa::CommPermMng", "ds_main=ds_main:U", "", "", "fn_callBack") (xfdl:323)
    │
POST /oasis/commPermMng/save   (UI→BFF)  →  /oasis/commPermMng/save   (BFF→BE)
    │
    ▼  StartEvent_1 (bpmn:4~6)
    │
    │  SequenceFlow_1 (bpmn:21)
    │
    ▼  ExclusiveGateway_1 "분기" (bpmn:12~20)
    │
    │  SequenceFlow_0grwghu name="saveCmPerm" (bpmn:22)
    │
    ▼  Task_1dh8dal "PERMISSION 정보 저장" (bpmn:39~55)
    │  class=com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask
    │  modelerTemplate=com.dongkuk.oasis.task.commonDbTask.CommonMultiSaveTask
    │  isServiceResult=true / dao="" / nextBranchSpel="" / paramKey="ds_main" / resultKey="ds_main"
    │  insertSqlKey="#{serviceId}Mapper.insertCommPermMng" (→ CommPermMngMapper.insertCommPermMng, xml:42~71)
    │  updateSqlKey="#{serviceId}Mapper.updateCommPermMng" (→ CommPermMngMapper.updateCommPermMng, xml:73~87)
    │  deleteSqlKey="#{serviceId}Mapper.deleteCommPermMng" (→ CommPermMngMapper.deleteCommPermMng, xml:89~96)
    │
    │  (행마다 nativeeditor_status 분기:
    │     "inserted" → insertCommPermMng (xml:42)
    │     "updated"  → updateCommPermMng (xml:73)
    │     "deleted"  → deleteCommPermMng (xml:89) — NOT EXISTS 안전장치 (xml:92~95))
    │
    │  SequenceFlow_1vkp3qd (bpmn:56)
    │
    ▼  EndEvent_1 (bpmn:7~11)
    │
    ▼  fn_callBack("saveCmPerm", nErrorCode, strErrorMsg) (xfdl:342)
       div_bottom.fn_commonBottomStatus_msg(strErrorMsg["ds_main"] + "건 조회 되었습니다.") (xfdl:343 — As-Is "조회" 메시지 그대로 보존)
       gfn_message("", "", "성공적으로 저장되었습니다.", "confirm", "확인", fn_msgSuccessSave) (xfdl:350)
       fn_msgSuccessSave: rtn true → fn_run("searchCmPerm") (재조회, xfdl:344~349)
```

### 2.3 ~~lov (onload → API-003) — BIZ SYSTEM (App Host ID) 콤보 LoV~~ — **To-Be 폐기** (cross-cutting 정책 #1, 2026-05-31)

> **As-Is 인용 (보존)** — 실 동작 흐름:
>
> ```
> [Form onload] (xfdl:3 onload="fn_onload")
>     │
>     ▼  fn_onload(obj, e) (xfdl:244)
>     │  gfn_formOnLoad(obj) (xfdl:245)
>     │  gfn_setFirstRow(ds_cmbValidYn, "", "", "condCd", "condNm") (xfdl:247)
>     │  div_search.edt_PERMISSION_ID.setFocus() (xfdl:248)
>     │  gfn_setEnable("div_mainDetail", "false") (xfdl:250 — Detail 비활성)
>     │  gfn_gridSelectedRow(grd_main, "red", "blue", "") (xfdl:251)
>     │
>     ▼  fn_lov() (xfdl:256~263)
>     │  sSvcID = "lov"
>     │  sOutDatasets = "ds_lovSubSystem=ds_selectAppHostId"
>     │
>     ▼  gfn_transaction("lov", "", "", "ds_lovSubSystem=ds_selectAppHostId", "") (xfdl:262)
>     │
> POST /oasis/commPermMng/lov   (UI→BFF)  →  /oasis/commPermMng/lov   (BFF→BE)
>     │
>     ▼  StartEvent_1 (bpmn:4~6)
>     │
>     │  SequenceFlow_1 (bpmn:21)
>     │
>     ▼  ExclusiveGateway_1 "분기" (bpmn:12~20)
>     │
>     │  SequenceFlow_1dd2kqv name="lov" (bpmn:71)
>     │
>     ▼  Task_08v4ryn "lov_SUBSYSTEM 조회" (bpmn:57~70)
>     │  class=com.dongkuk.oasis.task.commonDbTask.CommonSelectTask
>     │  modelerTemplate=com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate
>     │  isServiceResult=true / dao="" / paramKey="" / resultKey="ds_selectAppHostId"
>     │  sqlKey="CommObjMngMapper.selectAppHostId" (**cross-module** — `#{serviceId}Mapper` 미사용)
>     │
>     │  SequenceFlow_0xqzbh4 (bpmn:72)
>     │
>     ▼  EndEvent_1 (bpmn:7~11)
>     │
>     ▼  fn_callBack("lov", ...) (xfdl:354)
>        (xfdl:356~357 주석만 — 실제 처리 ✗)
> ```
>
> **To-Be 폐기**: BIZ_SYSTEM_CODE 컬럼 폐기로 BIZ SYSTEM 콤보 (S-001 / D-008) 자체가 제거되므로 LoV 호출 불요. lov action / `fn_lov` 메서드 / `fn_callBack` 의 lov 분기 / Task_08v4ryn / SequenceFlow_1dd2kqv·0xqzbh4 / cross-module sqlKey 모두 폐기. `fn_onload` 마지막 `this.fn_lov();` 호출도 삭제. To-Be `fn_onload` 흐름은 fn_lov() 호출 부분만 제거 후 동일 (gfn_formOnLoad → setFirstRow ds_cmbValidYn → setFocus → setEnable false → gridSelectedRow → END).

---

## 3. BPMN 노드·flow 매트릭스 (분석 §8.1 / §8.2 인용)

### 3.1 노드 전수 (As-Is 6 노드 → To-Be 5 노드, cross-cutting 정책 #1)

| # | 노드 ID | 노드 종류 | name | 역할 | extensionElements / class | sqlKey | paramKey / resultKey |
|---:|---|---|---|---|---|---|---|
| 1 | `StartEvent_1` | startEvent | "Start Event" | 시작 이벤트 | - | - | - |
| 2 | `EndEvent_1` | endEvent | "End Event" | 종료 이벤트 (**As-Is 3** incoming → **To-Be 2** incoming) | - | - | - |
| 3 | `ExclusiveGateway_1` | exclusiveGateway | "분기" (gatewayDirection="Diverging") | sSvcId 분기 (**As-Is 3** outgoing: searchCmPerm / saveCmPerm / lov → **To-Be 2** outgoing: searchCmPerm / saveCmPerm) | ext:style shapeBackground="#ffff00" (bpmn:14) | - | - |
| 4 | `Task_00oihyb` | task (CommonSelectTask) | "PERMISSION 정보 조회" | searchCmPerm 분기 — 조회 | class=CommonSelectTask / isServiceResult=true / dao="" / modelerTemplate=MapperBaseDbAccessTemplate | `#{serviceId}Mapper.selectCommPermMng` | paramKey="" / resultKey="ds_main" |
| 5 | `Task_1dh8dal` | task (CommonMultiSaveTask) | "PERMISSION 정보 저장" | saveCmPerm 분기 — 저장 | class=CommonMultiSaveTask / isServiceResult=true / dao="" / nextBranchSpel="" / modelerTemplate=CommonMultiSaveTask | insert: `#{serviceId}Mapper.insertCommPermMng` / update: `#{serviceId}Mapper.updateCommPermMng` / delete: `#{serviceId}Mapper.deleteCommPermMng` | paramKey="ds_main" / resultKey="ds_main" |
| ~~6~~ | ~~`Task_08v4ryn`~~ | ~~task (CommonSelectTask)~~ | ~~"lov_SUBSYSTEM 조회"~~ | ~~lov 분기 — App Host ID 콤보 LoV~~ | ~~class=CommonSelectTask / isServiceResult=true / dao="" / modelerTemplate=MapperBaseDbAccessTemplate~~ | ~~`CommObjMngMapper.selectAppHostId` (cross-module)~~ | ~~paramKey="" / resultKey="ds_selectAppHostId"~~ → **To-Be 폐기** (cross-cutting 정책 #1) |

### 3.2 sequenceFlow 전수 (As-Is 7 flow → To-Be 5 flow, cross-cutting 정책 #1)

| # | flow ID | source | target | name (action 분기명) |
|---:|---|---|---|---|
| 1 | `SequenceFlow_1` | StartEvent_1 | ExclusiveGateway_1 | (없음) |
| 2 | `SequenceFlow_0grwghu` | ExclusiveGateway_1 | Task_1dh8dal | **saveCmPerm** |
| 3 | `SequenceFlow_0tt1mbk` | ExclusiveGateway_1 | Task_00oihyb | **searchCmPerm** |
| ~~4~~ | ~~`SequenceFlow_1dd2kqv`~~ | ~~ExclusiveGateway_1~~ | ~~Task_08v4ryn~~ | ~~**lov**~~ → **To-Be 폐기** (cross-cutting 정책 #1) |
| 5 | `SequenceFlow_105vwsz` | Task_00oihyb | EndEvent_1 | (없음) |
| 6 | `SequenceFlow_1vkp3qd` | Task_1dh8dal | EndEvent_1 | (없음) |
| ~~7~~ | ~~`SequenceFlow_0xqzbh4`~~ | ~~Task_08v4ryn~~ | ~~EndEvent_1~~ | ~~(없음)~~ → **To-Be 폐기** (cross-cutting 정책 #1) |

### 3.3 action 6 enum 매핑 (가이드 정본 enum vs 본 화면 사용 분기 — cross-cutting 정책 #1)

| 가이드 6 enum | 본 화면 사용 | BPMN flow | sqlKey |
|---|---|---|---|
| search | **Y** (searchCmPerm — As-Is sSvcId 명 보존) | SequenceFlow_0tt1mbk → Task_00oihyb | selectCommPermMng |
| save | **Y** (saveCmPerm) | SequenceFlow_0grwghu → Task_1dh8dal | insert/update/deleteCommPermMng (status 분기) |
| delete | N (`saveCmPerm` 내 status="deleted" 분기로 통합) | (별도 ✗) | - |
| popup | N (BPMN ✗ — 클라이언트 전용 `gfn_openPopup` 호출만) | (별도 ✗) | - |
| export | N (사용 ✗) | (별도 ✗) | - |
| ~~lov~~ | ~~**Y** (`lov` 분기)~~ | ~~SequenceFlow_1dd2kqv → Task_08v4ryn~~ | ~~CommObjMngMapper.selectAppHostId (cross-module)~~ → **To-Be N** (폐기, cross-cutting 정책 #1) |

> action 사용: **As-Is 3** (search / save / lov) → **To-Be 2** (search / save). delete 는 save 분기 내 status 분기로 통합 (CommonMultiSaveTask 표준 패턴). lov 는 BIZ_SYSTEM_CODE 컬럼 폐기로 To-Be 미사용.

---

## 4. SQL ID 매핑 (분석 §6 인용)

### 4.1 자체 namespace SQL (`CommPermMngMapper`)

| SQL ID | 유형 | BPMN Task | 호출 시점 | 파라미터 | 결과 |
|---|---|---|---|---|---|
| selectCommPermMng | select | Task_00oihyb | searchCmPerm 분기 | **As-Is** Map (`edt_PERMISSION_ID` / `edt_PERMISSION_NM` / `cbo_USE_TP` / `cbo_bizSystemCode`) → **To-Be** Map (`edt_PERMISSION_ID` / `edt_PERMISSION_NM` / `cbo_USE_TP`) — cbo_bizSystemCode 폐기 (cross-cutting 정책 #1) | **As-Is** List<Map> 13 컬럼 (… / BIZ_SYSTEM_CODE / ROLE_ID / BIZ_SYSTEM_CODE 중복 — As-Is 보존) → **To-Be** 11 컬럼 (BIZ_SYSTEM_CODE 2 회 모두 제거) |
| insertCommPermMng | insert | Task_1dh8dal (CommonMultiSaveTask) | saveCmPerm 분기 + nativeeditor_status="inserted" | **As-Is** Map (PERMISSION_ID / NM / DESC / COMMON / CUSTOM / POPUP_BTN / ACTION / BIZ_SYSTEM_CODE / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE + audit) → **To-Be** BIZ_SYSTEM_CODE 컬럼 + 바인딩 제거 | rowcount |
| updateCommPermMng | update | Task_1dh8dal (CommonMultiSaveTask) | saveCmPerm 분기 + nativeeditor_status="updated" | **As-Is** Map (PERMISSION_NM / DESC / COMMON / CUSTOM / POPUP_BTN / ACTION / BIZ_SYSTEM_CODE / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE + audit + PERMISSION_ID) → **To-Be** BIZ_SYSTEM_CODE 컬럼 + 바인딩 제거 | rowcount |
| deleteCommPermMng | delete | Task_1dh8dal (CommonMultiSaveTask) | saveCmPerm 분기 + nativeeditor_status="deleted" | Map (PERMISSION_ID) | rowcount (NOT EXISTS 안전장치 — ROLE 매핑 있으면 silent skip) |

### 4.2 ~~Cross-module SQL (외부 mapper namespace)~~ — **To-Be 폐기** (cross-cutting 정책 #1, 2026-05-31)

| SQL ID | 유형 | BPMN Task | 호출 시점 | 파라미터 | 결과 | 소속 모듈 |
|---|---|---|---|---|---|---|
| ~~CommObjMngMapper.selectAppHostId~~ | ~~select~~ | ~~Task_08v4ryn~~ | ~~lov 분기~~ | ~~(없음)~~ | ~~List<Map> (APP_HOST_ID)~~ | ~~commObjMng (csa 모듈 — 본 화면 설계 산출물 별도)~~ → **To-Be 폐기** |

> ~~cross-module sqlKey 의 owner = commObjMng 설계 산출물. 본 화면은 호출만~~ → **To-Be 폐기**: BIZ_SYSTEM_CODE 컬럼 폐기 + cross-module 호출 제거 (cross-cutting 정책 #1). 본 화면은 commObjMng 모듈에 대한 cross-module 의존성 0.

---

## 5. Java 구현 (해당 없음 — 분석 §7 인용)

본 화면의 BPMN Task 3 개 (Task_00oihyb / Task_1dh8dal / Task_08v4ryn) 는 모두 **표준 ScriptTask** (`CommonSelectTask` / `CommonMultiSaveTask`) — 화면 전용 Java UserTask 코드 없음.

| 항목 | 결정 |
|---|---|
| As-Is Java UserTask 폴더 | `docs/external/SampleErp/orgErpSource/mui/src/main/java/com/dongkuk/dmes/mui/task/ui/csa/CommPermMng/` — **부재** (ls 확인 — csa 하위 CommChainMasterMng / CommSyncMng / CommUserMng / CommUserRoleCopy 4 폴더만 존재) |
| As-Is Java 파일 수 | 0 개 |
| To-Be Java UserTask | 작성 ✗ — 표준 Task 만으로 BPMN 처리 |
| To-Be Service / DTO | `com.dongkuk.dmes.mcm.csa.commPermMng.service.CommPermMngService` (CommonMultiSaveTask 와 호환되는 ServiceResult 반환) / `CommPermMngDto` (PERMISSION_ID 등 **11** 컬럼 + audit — BIZ_SYSTEM_CODE 폐기, cross-cutting 정책 #1) |
| To-Be Entity (**cross-cutting 정책 #6 A안**) | **`SecPerm`** (TB_MCM_SEC_PERM 1:1 직역) `extends CactusAuditEntity`. JPA `@Entity @Table(schema="MCMAPUSER", name="TB_MCM_SEC_PERM")`. SecPermButton Entity **미생성** (As-Is mui 에 PERM_BUTTON 별도 테이블 ✗ — 본 화면 ds_main 의 PERMISSION_COMMON / CUSTOM / POPUP_BTN / ACTION 4 컬럼은 모두 TB_MCM_SEC_PERM 본 테이블의 단일 컬럼). Role 매핑 Entity = `SecRoleMapping` (read-only, commRoleMng 화면 owner) |
| To-Be Repository | `com.dongkuk.dmes.mcm.repository.SecPermRepository` (TB_MCM_SEC_PERM JPA Repository) — Entity `SecPerm extends CactusAuditEntity` |

> 표준 Task 동작 일반:
> - **CommonSelectTask**: `paramKey` 로 Map 추출 → `dao.queryForList(sqlKey, param)` → `resultKey` 로 Context 적재 → ServiceResult 반환.
> - **CommonMultiSaveTask**: `paramKey` 로 ArrayList<HashMap> 추출 → 각 행의 `nativeeditor_status` 분기로 insertSqlKey / updateSqlKey / deleteSqlKey 호출 → 단일 트랜잭션 내 처리 → cnt_insert / cnt_update / cnt_delete 누적.

---

## 6. To-Be 식별자 / 명명 (분석 §11.1 인용)

| 자산 | As-Is | To-Be |
|---|---|---|
| BPMN process id | `sample1` (As-Is 잔존 — 다른 화면명) | `commPermMng` |
| BPMN process name | `menuInfor` (As-Is 잔존 — 다른 화면명) | `commPermMng` |
| BPMN 파일 경로 | `src/main/resources/services/csa/CommPermMng.bpmn` | `src/main/resources/services/csa/commPermMng.bpmn` 또는 모듈 분리 시 `src/backend/mcm/src/main/resources/services/csa/commPermMng.bpmn` (RULE.md §4 정본) |
| Bean / Service | (해당 없음 — Java ✗) | `commPermMngService` (`@Service`) |
| Service 패키지 | (해당 없음) | `com.dongkuk.dmes.mcm.csa.commPermMng.service` (RULE.md §"패키지 명명 규칙" §3-1) |
| DTO 패키지 | (해당 없음) | `com.dongkuk.dmes.mcm.csa.commPermMng.dto` |
| Entity 패키지 | (해당 없음) | `com.dongkuk.dmes.mcm.entity` (모듈 단위 평탄) |
| **Entity 명 (cross-cutting 정책 #6 A안)** | (해당 없음) | **`SecPerm`** (TB_MCM_SEC_PERM 1:1 직역). SecPermButton 미생성. Role 매핑 = `SecRoleMapping` |
| Repository 패키지 | (해당 없음) | `com.dongkuk.dmes.mcm.repository` (모듈 단위 평탄) |
| Repository 명 | (해당 없음) | `SecPermRepository` |
| Mapper namespace (asis) | `CommPermMngMapper` | `CommPermMngMapper` (Mapper.xml.asis 보존). To-Be 본 화면은 JPA Repository + native query 로 흡수 또는 As-Is namespace 그대로 사용 (`#{serviceId}Mapper` 변수 = `commPermMng`Mapper → CommPermMngMapper) |
| SQL ID (selectCommPermMng 등) | `selectCommPermMng` / `insertCommPermMng` / `updateCommPermMng` / `deleteCommPermMng` | 동일 — As-Is 1:1 보존. JPA 흡수 시 method 명 = `findAllByCondition` / `insert` / `update` / `deleteByPermissionId` 권장 |
| Task ID (`Task_00oihyb` 등 hash) | 그대로 보존 (BPMN 호환) | 그대로 또는 가독성 보강 (`Task_selectPermission` / `Task_savePermission` / `Task_lovAppHostId`) — 결정 위임 |
| sequenceFlow ID (`SequenceFlow_xxx` 등 hash) | 그대로 보존 | 그대로 보존 |
| API URL (UI→BFF) | (해당 없음 — As-Is xfdl 직접 호출 `csa::CommPermMng`) | `POST /api/mcm/oasis/commPermMng/{action}` (BFF 가 oasis route 로 위임) |
| API URL (BFF→BE) | (해당 없음) | `POST /oasis/commPermMng/{action}` |
| xfdl titletext | "PERMISSON 관리" (오타) | "PERMISSION 관리" (정정) |
| selectCommPermMng SELECT 절 | xml:18 + xml:23 BIZ_SYSTEM_CODE 2회 중복 | **컬럼 자체 폐기** (cross-cutting 정책 #1) — SELECT 절에서 BIZ_SYSTEM_CODE 2 회 모두 제거 |
| **BPMN Task / SequenceFlow (cross-cutting 정책 #1)** | Task_08v4ryn + SequenceFlow_1dd2kqv + SequenceFlow_0xqzbh4 | **모두 To-Be 폐기** — 노드 6→5 / sequenceFlow 7→5 / action 3→2 |
| **BIZ_SYSTEM_CODE 컬럼 폐기 (cross-cutting 정책 #1, 2026-05-31)** | xfdl/xml/bpmn 16 hit (UI 4 + DS 2 + Bind 1 + Script 1 + SQL 5 + BPMN 3) | **모두 To-Be 폐기** — UI / Dataset / Bind / Script / SQL / BPMN 전수 제거. DB DDL 의 BIZ_SYSTEM_CODE VARCHAR(10) NOT NULL 컬럼은 보존 (legacy 데이터) |

---

## 7. cactus-core / OASIS 패턴 적용 (분석 §11 인용)

### 7.1 cactus-core audit (CactusAuditEntity 상속)

| 컬럼 | 타입 | 자동 채움 |
|---|---|---|
| C_USR_ID | VARCHAR(100) | @PrePersist — 현재 로그인 사용자 |
| C_AT | TIMESTAMP(Instant) | @PrePersist — Instant.now() |
| C_SVC_ID | VARCHAR(100) | @PrePersist — serviceId="commPermMng" 세트 |
| C_PGM_ID | VARCHAR(100) | @PrePersist — pageId="commPermMng" 세트 |
| U_USR_ID | VARCHAR(100) | @PreUpdate — 현재 로그인 사용자 |
| U_AT | TIMESTAMP(Instant) | @PreUpdate — Instant.now() |
| U_SVC_ID | VARCHAR(100) | @PreUpdate — serviceId 세트 |
| U_PGM_ID | VARCHAR(100) | @PreUpdate — pageId 세트 |
| VER | Long | @Version (Optimistic Locking) |

> **As-Is `ref_Audit` fragment 폐기**: As-Is Mapper.xml 의 `<include refid="ref_Audit.insert_item">` (xml:55) / `<include refid="ref_Audit.insert_value">` (xml:69) / `<include refid="ref_Audit.update">` (xml:85) — To-Be Mapper SQL 본문에서 제거. cactus-core Entity 가 9 컬럼 자동 채움.

### 7.2 OASIS BPMN ServiceResult 패턴

| 항목 | 값 |
|---|---|
| BPMN Task 의 `isServiceResult` | true (모든 3 Task) — bpmn:28/43/61 |
| ServiceResult 반환 형태 | `Map<String, Object>` — `resultKey` 명칭으로 적재 (`ds_main` / `ds_selectAppHostId`) |
| 클라이언트 매핑 | xfdl `gfn_transaction` 의 `sOutDs` 인자로 dataset 매핑 (예: `"ds_main=ds_main"`) |
| 에러 처리 | OASIS BPMN 표준 — exception 발생 시 `IllegalTaskException` wrap (CommonSelectTask / CommonMultiSaveTask 표준) |

---

## 8. 산출물 정합

| 항목 | 분석리포트 §X | 본 BPMN설계서 §Y |
|---|---|---|
| BPMN 노드 | §8.1 (**As-Is 6 → To-Be 5** 노드) | §3.1 (As-Is 6 → To-Be 5 노드) |
| BPMN sequenceFlow | §8.2 (**As-Is 7 → To-Be 5** flow) | §3.2 (As-Is 7 → To-Be 5 flow) |
| BPMN action 흐름 | §8.3 (**As-Is 3 → To-Be 2** action) | §2.1 / §2.2 (As-Is 3 → To-Be 2 action — §2.3 lov 폐기 표시) + §3.3 (6 enum 매핑) |
| SQL ID | §6 (자체 4 + ~~cross-module 1~~ 폐기) | §4.1 (자체 4) + §4.2 (cross-module 1 폐기) |
| Java UserTask | §7 (해당 없음) | §5 (해당 없음) |
| API 엔드포인트 | §11 / 기능설계서 §11 | §1.1 (**As-Is 3 → To-Be 2** API) |
| C1~C6 판정 | §11 (OASIS 단일 BPMN) | §1.2 (0/6 — OASIS) |
| To-Be 식별자 | §11.1 (6 자산) | §6 (15 자산 확장 — Entity 명·BIZ_SYSTEM_CODE 폐기·BPMN 폐기 추가) |
| audit 컬럼 | §9 (cactus-core 9) | §7.1 (9 컬럼) |
| Entity 명 (cross-cutting 정책 #6 A안) | §11.1 (SecPerm) | §5 / §6 (SecPerm) |

> 본 §8 모든 행수 일치 ✓ — 분석리포트 / 기능설계서 인용 정합 완성.

### §6.14 Phase 4 종료 자동 고해성사 4 질문

| # | 질문 | 답변 |
|---:|---|---|
| 1 | 14항 위반? | No — As-Is BPMN node id / sequenceFlow id 모두 1:1 보존 (Task_00oihyb / Task_1dh8dal / Task_08v4ryn / SequenceFlow_xxx). cite 100% (bpmn:N / xml:N / xfdl:N). cross-cutting 정책 #1·#6 (2026-05-31) 적용은 As-Is 인용 + To-Be 폐기 명시 패턴으로 일관 적용 |
| 2 | 검증 안 한 부분? | No — §8 산출물 정합 표 10 행 모두 분석리포트 §와 1:1 매칭 검증 (To-Be count 동기화) |
| 3 | 그대로 수용? | No — As-Is BPMN process id "sample1" / name "menuInfor" (다른 화면 잔존) 은 §6 To-Be 정정. SELECT BIZ_SYSTEM_CODE 중복 (xml:18 / 23) 도 컬럼 자체 폐기. cross-cutting 정책 #1: lov / Task_08v4ryn / SequenceFlow_1dd2kqv·0xqzbh4 / cross-module sqlKey 모두 폐기. cross-cutting 정책 #6 (A안): Entity 명 = `SecPerm` |
| 4 | 임의 합리화? | No — action 6 enum 매핑 (§3.3) 에서 본 화면 사용 = **As-Is 3 (search / save / lov) → To-Be 2 (search / save)** — lov 폐기 후 delete / popup / export 4 미사용. CommonMultiSaveTask 의 status 분기로 delete 통합 |

> 4 질문 모두 No. action 6 enum 일치 (As-Is 3 사용 / To-Be 2 사용 — lov 폐기 명시). Phase 4 통과 (cross-cutting 정책 #1·#6 적용 2026-05-31).
