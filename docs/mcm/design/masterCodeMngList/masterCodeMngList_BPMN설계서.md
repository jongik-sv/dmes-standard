---
screenId: masterCodeMngList
asIsId: MasterCodeMngList
moduleId: mcm
moduleGroup: cme
작성일: 2026-05-29
작성자: Agent
---

# mcm — Master Code 상세조회 BPMN설계서

> **BackEnd / BPMN 측 확정 값**:
> - 프로세스 ID: `masterCodeMngList` (= serviceId, As-Is bpmn process id = `MasterCodeMngList`)
> - Bean명: `masterCodeMngListService`
> - moduleId / serviceId / API URL 정본: 04 §A.2-3
> - UI→BFF: `POST /api/mcm/oasis/masterCodeMngList/{action}`
> - BFF→BE: `POST /oasis/masterCodeMngList/{action}`
>
> **명명 룰**: MES 단일 룰 (4 식별자 1byte 동일 — mcm 모듈, APS 예외 미적용)
>
> **인용 정본**: 분석리포트 §6 (SQL ID) + §7 (Java — 해당 없음) + §8 (BPMN 전수). 자체 추가 ✗.
> **As-Is 1:1 보존**: BPMN node id (Task_2 / Task_1uvph9e 등 hash 형식), sequenceFlow id 인용 그대로 보존. 변환은 §6 "To-Be 식별자" 안에서만 제안.

---

## 1. 프로세스 개요

> **표기 컨벤션**:
> - DB 컬럼명 / 테이블명: SNAKE_CASE — As-Is 보존 (`MCMAPUSER.TB_MCM_CODE_*` — 사용자 결정)
> - audit 컬럼: cactus-core `CactusAuditEntity` 9 컬럼 자동 (`C_*` / `U_*` / `VER`) — 본 화면은 SELECT 만 사용하므로 audit 자동 채움 영향 ✗
> - API JSON 필드: camelCase (`pCodeId` / `pCodeNm` / `pCodeIdRef1~5` — As-Is 파라미터 보존)
> - Java 패키지: Service·DTO = `com.dongkuk.dmes.mcm.cme.masterCodeMngList.{service,dto}.*` / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` (모듈 단위 평탄 — masterCodeMng 와 entity 공유 / RULE.md §"패키지 명명 규칙" §3-1)
> - DB ↔ DTO 매핑은 API 계층에서

### 1.1 API 엔드포인트 총괄 (분석 §11 채택 결과 인용)

| API-ID | Method | URL | 설명 | action (분기 enum) | 트리거 (B-NNN) |
|---|---|---|---|---|---|
| API-001 | POST | `POST /oasis/masterCodeMngList/search` | Master 그리드 조회 (1 SQL — GetCodeMasterList) | search | btn_search (공통 topMenu, EX-001) |
| API-002 | POST | `POST /oasis/masterCodeMngList/searchDetail` | 선택 Master 의 Detail + 카테고리 LoV 조회 (2 SQL — GetTbMcmCodeCategoryList + GetCodeDetailList) | searchDetail | grd_main oncellclick (xfdl:363) |

> **As-Is 2 action 모두 As-Is 그대로 유지** (BPMN 정의 그대로). To-Be API 는 2 개 (`search` / `searchDetail`) 만 정의. masterCodeMng 의 save/saveDetail/delete/deleteDetail 4 action 은 본 화면에 부재.

### 1.2 API 패턴 자동 판정 결과 (C1~C6)

| 조건 | 충족 (Y/N) | 근거 | 판정 영향 |
|---|---|---|---|
| C1. As-Is SP case 분기 4종 이상 + 조회/트랜잭션 분리 | N | mui 의 As-Is 는 SP 가 아니라 Mapper.xml inline SQL. ExclusiveGateway 의 2 분기는 SP case 분기가 아닌 BPMN flow 분기 — C1 정의에 부적합 | - |
| C2. LoV master 호출 컬럼 5종 이상 | N | LV-001 (ds_chkYn 정적) + LV-002 (ds_lovCategoryId DB 호출 1회) + LV-003 (CODE_VAL_REF{N}_MN 은 GetCodeDetailList 내부 nested scalar subquery 로 별도 LoV 호출 ✗) + LV-004 (GetCodeMasterAllList — 호출 ✗) = 실 DB LoV 호출 1 종만 | - |
| C3. 회사·공장 종속 LoV 1종 이상 | N | 모든 LoV 가 시스템 공통 (회사/공장 의존 ✗). 'SZ0000' 하드코딩이 있으나 단일 상수 | - |
| C4. 동적 컬럼 응답 팝업/그리드 1개 이상 | N | 그리드 컬럼 구성 고정 (As-Is 보존). USER_DEFINE 분기는 등록 화면 masterCodeMng 만 존재 — 본 화면 부재 | - |
| C5. 독립 query 분리가 적합함 | N | search 와 searchDetail 모두 단순 SELECT chain — 독립 분리 부적합 | - |
| C6. 외부 SP 호출로 단일 actionGateway 부적합 | N | 외부 SP 호출 ✗ — 본 화면 SQL 모두 자체 Mapper namespace | - |

| 항목 | 값 |
|---|---|
| C1~C6 충족 개수 | **0 / 6** |
| 채택 패턴 | **OASIS 단일 BPMN (자동)** (충족 0~1 룰) |
| API 라우팅 | `POST /oasis/{serviceId}/{action}` |
| Q-NNN 등재 여부 | N (충족 0 — 자동 OASIS 채택) |

> As-Is BPMN 자체가 단일 ExclusiveGateway 의 2 action 분기 형태 — OASIS 단일 BPMN 패턴 그대로 To-Be 채택. masterCodeMng 와 동일 패턴 (action 수만 6 → 2 축소).

---

## 2. 프로세스별 BPMN 상세

> 본 §2 는 분석리포트 §8 (BPMN 전수) 의 모든 task / sequenceFlow 를 action 별로 흐름 ASCII 로 표현. As-Is BPMN id (Task_xxx / SequenceFlow_xxx) 모두 보존.

### 2.1 search (btn_search → API-001) — Master 조회

```
[btn_search 클릭]  (xfdl:284 — fn_search)
    │
    ├─ pCodeId  ← edt_codeVal.value
    └─ pCodeNm  ← edt_codeNm.value
    │
    ▼
POST /oasis/masterCodeMngList/search   (UI→BFF)  →  /oasis/masterCodeMngList/search   (BFF→BE)
    │
    ▼  StartEvent_1 (bpmn:4)
    │
    ▼  ExclusiveGateway_1 (bpmn:26)
    │
    │  SequenceFlow_0grwghu name="search"  (bpmn:35)
    │
    ▼  Task_2 "Main조회"  (bpmn:11)
    │  class=CommonSelectTask, sqlKey=#{serviceId}Mapper.GetCodeMasterList, resultKey=ds_GetCodeMasterList,
    │  isServiceResult=true, modelerTemplate=com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate
    │
    │  SQL 본문 요약 (xml:7~39):
    │  ├─ SELECT MAIN.CODE_ID, MAIN.CODE_NM, MAIN.CODE_DESC, MAIN.CODE_VER, MAIN.USE_TP,
    │  │         MAIN.START_ACTIVE_DATE, MAIN.END_ACTIVE_DATE, MAIN.CODE_OWNER_DEPT_NM,
    │  │         MAIN.CODE_OWNER_EMP_NO, MAIN.CODE_CHARACTER, MAIN.MASTER_CODE,
    │  │         MAIN.MASTER_CODE_REF1~5,
    │  │         (SELECT SUB.CODE_NM FROM MCMAPUSER.TB_MCM_CODE_MASTER SUB
    │  │           WHERE SUB.CODE_ID = MAIN.MASTER_CODE_REF{N}) AS MASTER_CODE_REF{N}_NM × 5
    │  ├─ FROM MCMAPUSER.TB_MCM_CODE_MASTER MAIN
    │  ├─ WHERE pCodeId 존재 시: (MAIN.CODE_ID LIKE '%' || pCodeId || '%'
    │  │                       OR MAIN.MASTER_CODE LIKE '%' || pCodeId || '%')
    │  ├─ AND pCodeNm 존재 시: UPPER(MAIN.CODE_NM) LIKE UPPER('%' || pCodeNm || '%')
    │  └─ ORDER BY MAIN.CODE_ID
    │
    │  SequenceFlow_0xwr48s (bpmn:66)
    │
    ▼  EndEvent_1 (bpmn:7)
    │
    ▼  callback (fn_callBack("search"), xfdl:328)
        ├─ ds_grdMain = ds_GetCodeMasterList (out alias)
        ├─ ds_grdMain.set_rowposition(this.grd_row) (xfdl:329)
        ├─ ds_grdMain.set_enableevent(true) (xfdl:330)
        └─ bottom status: "{N}건 조회 되었습니다."  (M-001)
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_grdMain=ds_GetCodeMasterList` |
| 파라미터 (sArgument) | `pCodeId` (edt_codeVal.value) + `pCodeNm` (edt_codeNm.value) |
| BPMN node | StartEvent_1 → ExclusiveGateway_1 → Task_2 → EndEvent_1 |
| 호출 SQL (순서대로) | GetCodeMasterList (xml:7) |

### 2.2 searchDetail (Master row click → API-002) — Detail + Category LoV 일괄 조회

```
[grd_main oncellclick]  (xfdl:363 — div_main_div1_grd_main_oncellclick)
    │  e.row != -1 + rowType != 2 (신규 아님) — dead code 가드 (본 화면은 신규 행 발생 ✗)
    │  ds_grdDetail.filter("") 초기화 후 fn_searchDetail() 호출
    │
    ├─ pCodeId          ← ds_grdMain.MASTER_CODE          (xfdl:312)
    ├─ pCodeIdRef1      ← ds_grdMain.MASTER_CODE_REF1     (xfdl:313)
    ├─ pCodeIdRef2      ← ds_grdMain.MASTER_CODE_REF2     (xfdl:314)
    ├─ pCodeIdRef3      ← ds_grdMain.MASTER_CODE_REF3     (xfdl:315)
    ├─ pCodeIdRef4      ← ds_grdMain.MASTER_CODE_REF4     (xfdl:316)
    └─ pCodeIdRef5      ← ds_grdMain.MASTER_CODE_REF5     (xfdl:317)
    │
    ▼
POST /oasis/masterCodeMngList/searchDetail
    │
    ▼  StartEvent_1 → ExclusiveGateway_1
    │
    │  SequenceFlow_02ocl0p name="searchDetail"  (bpmn:50)
    │
    ▼  Task_0zyza07 "Category조회"  (bpmn:51)
    │  class=CommonSelectTask, sqlKey=#{serviceId}Mapper.GetTbMcmCodeCategoryList,
    │  resultKey=ds_GetTbMcmCodeCategoryList
    │  SQL 본문 (xml:103~108):
    │  └─ SELECT CATEGORY_ID, CATEGORY_NM
    │     FROM MCMAPUSER.TB_MCM_CODE_CATEGORY
    │     WHERE MASTER_CODE = #{pCodeId}
    │
    │  SequenceFlow_0av6mvx (bpmn:65)
    │
    ▼  Task_1uvph9e "Detail조회"  (bpmn:36)
    │  class=CommonSelectTask, sqlKey=#{serviceId}Mapper.GetCodeDetailList,
    │  resultKey=ds_GetCodeDetailList
    │  SQL 본문 (xml:46~101 — 56 line):
    │  ├─ SELECT CDETAIL.MASTER_CODE, CDETAIL.CATEGORY_ID,
    │  │         (SELECT CATEGORY_NM FROM MCMAPUSER.TB_MCM_CODE_CATEGORY
    │  │           WHERE CATEGORY_ID = CDETAIL.CATEGORY_ID
    │  │             AND MASTER_CODE = CDETAIL.MASTER_CODE) AS CATEGORY_NM,
    │  │         CDETAIL.SORT_SEQ, CDETAIL.MASTER_CODE (중복 — As-Is 보존),
    │  │         CDETAIL.CODE_VAL, CDETAIL.CODE_VAL_MEAN, CDETAIL.CODE_VAL_DESC, CDETAIL.CODE_VER,
    │  │         NVL((SELECT SUB.CODE_VAL_MEAN FROM MCMAPUSER.TB_MCM_CODE_DETAIL SUB
    │  │              WHERE SUB.MASTER_CODE = (SELECT MAST.MASTER_CODE
    │  │                                       FROM MCMAPUSER.TB_MCM_CODE_MASTER MAST
    │  │                                       WHERE MAST.CODE_ID = #{pCodeIdRef{N}})
    │  │                AND SUB.CATEGORY_ID = 'SZ0000'
    │  │                AND SUB.CODE_VAL = CDETAIL.CODE_VAL_REF{N}),
    │  │             CDETAIL.CODE_VAL_REF{N}) AS CODE_VAL_REF{N}_MN × 5 (xml:59~94)
    │  ├─ FROM MCMAPUSER.TB_MCM_CODE_DETAIL CDETAIL
    │  ├─ WHERE pCodeId 존재 시: CDETAIL.MASTER_CODE = #{pCodeId}
    │  └─ ORDER BY CDETAIL.SORT_SEQ
    │
    │  SequenceFlow_0vevv59 (bpmn:67)
    │
    ▼  EndEvent_1
    │
    ▼  callback (fn_callBack("searchDetail"), xfdl:338)
        ├─ ds_grdDetail = ds_GetCodeDetailList (out alias)
        ├─ ds_lovCategoryId = ds_GetTbMcmCodeCategoryList (out alias)
        ├─ ds_grdDetail.set_rowposition(this.grd_row) (xfdl:339)
        ├─ ds_lovCategoryId.insertRow(0) + CATEGORY_ID="" / CATEGORY_NM="전체" (xfdl:341~343)
        ├─ cbo_categoryId.set_index(0) (xfdl:344)
        ├─ stc_master.set_text(ds_grdMain.MASTER_CODE) (xfdl:345)
        └─ bottom status: "{N}건 조회 되었습니다."  (M-002)
```

| 입력 (sInDatasets) | (없음) |
|---|---|
| 출력 (sOutDatasets) | `ds_grdDetail=ds_GetCodeDetailList ds_lovCategoryId=ds_GetTbMcmCodeCategoryList` |
| 파라미터 (sArgument) | `pCodeId` (= ds_grdMain.MASTER_CODE) + `pCodeIdRef1~5` (= ds_grdMain.MASTER_CODE_REF1~5) |
| BPMN node 흐름 | Start → Gateway → Task_0zyza07 (Category) → Task_1uvph9e (Detail) → End |
| 호출 SQL (순서대로) | GetTbMcmCodeCategoryList → GetCodeDetailList |

> **masterCodeMng 와의 차이점**: searchDetail 흐름이 (1) Task_1owudha (Ref1) → Task_1gf4j65 (Ref2) → Task_0hse01g (Ref3) → Task_06pl9uo (Ref4) → Task_1f6jrjg (Ref5) 5 task 미포함 — 본 화면은 Ref1~5 의 코드명을 `GetCodeDetailList` SQL 내부 nested scalar subquery 로 직접 합쳐서 반환. (2) Task_1ys7qxh (Main 마스터전체 조회) 미포함 — Master 그리드에 참조1~5 콤보가 없어서 마스터 전체 LoV 불필요.

### 2.3 (save / saveDetail / delete / deleteDetail) — **해당 없음 (본 화면 부재)**

본 화면은 조회 전용 — 등록/수정/삭제 action 미정의. masterCodeMng 의 6 action 중 본 화면은 2 action (search / searchDetail) 만 보유. BPMN/xfdl 자체에 save/saveDetail/delete/deleteDetail 분기/task/sequenceFlow ✗.

---

## 3. UserTask Java 클래스 상세

해당 없음 — 본 화면은 등록/수정/삭제 기능이 없어 Java UserTask 0 개. BPMN 의 3 Task 는 모두 `com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` 사용 (bpmn:15 / 39 / 53) — OASIS 표준 조회 task 로 별도 Java 클래스 작성 불필요.

| 항목 | 값 |
|---|---|
| As-Is Java UserTask | 0 개 |
| To-Be Java UserTask | 0 개 |
| 비고 | 조회 전용 화면 — BPMN commonDbTask 만으로 충족 |

---

## 4. 트랜잭션 경계 / 오류 처리

### 4.1 트랜잭션 모델

| 경계 | 범위 | 비고 |
|---|---|---|
| search (API-001) | Task_2 (CommonSelectTask) 1 회 SELECT — Read-only | 트랜잭션 외부 |
| searchDetail (API-002) | Task_0zyza07 + Task_1uvph9e 2 회 SELECT chain — Read-only | 동일 (Read-only) |

> 본 화면은 INSERT/UPDATE/DELETE 부재 — Optimistic Locking / TransactionalDao 모두 영향 ✗.

### 4.2 오류 응답

| 상황 | 응답 | 클라이언트 처리 |
|---|---|---|
| SQL 실행 오류 (SELECT) | OASIS framework 의 표준 오류 응답 — `nErrorCode != 0` → callback else 분기 → `gfn_commonBottomStatus_msg(strErrorMsg)` 표시 (xfdl:334 / 348) | - |
| validation 실패 (xfdl 단계) | (해당 없음 — 본 화면은 validation 모달 메시지 0 개) | - |
| 서버 200 + ds 갱신 | callback 정상 분기 → `gfn_commonBottomStatus_msg(strErrorMsg["ds_*"] + "건 조회 되었습니다.")` | - |

### 4.3 동시성 / Optimistic Locking

| 항목 | As-Is | To-Be |
|---|---|---|
| UPDATED_AT / 동시 수정 검증 (Optimistic Locking) | (조회 전용 — 영향 ✗) | (동일 — 영향 ✗) |

---

## 5. 트랜잭션 경계별 입출력 DTO 매핑

### 5.1 search (API-001)

| Request Body | 타입 | As-Is 컬럼 | 비고 |
|---|---|---|---|
| pCodeId | string | (검색 조건) | LIKE 부분 일치 + MASTER_CODE 도 동일 검색어 적용 (xml:32 OR) |
| pCodeNm | string | (검색 조건) | UPPER 대소문자 무시 비교 (xml:35) |

| Response | 타입 | 비고 |
|---|---|---|
| ds_grdMain → ds_GetCodeMasterList | List<Map> (21 컬럼 — CODE_ID, CODE_NM, CODE_DESC, CODE_VER, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE, CODE_OWNER_DEPT_NM, CODE_OWNER_EMP_NO, CODE_CHARACTER, MASTER_CODE, MASTER_CODE_REF1~5, MASTER_CODE_REF1_NM~5_NM) | 분석 §9.1 인용 |

### 5.2 searchDetail (API-002)

| Request Body | 타입 | As-Is 컬럼 |
|---|---|---|
| pCodeId | string | = ds_grdMain.MASTER_CODE |
| pCodeIdRef1~5 | string × 5 | = ds_grdMain.MASTER_CODE_REF1~5 (nested scalar subquery 의 SUB.MASTER_CODE 결정용) |

| Response | 타입 | 비고 |
|---|---|---|
| ds_grdDetail → ds_GetCodeDetailList | List<Map> (14 컬럼 — MASTER_CODE, CATEGORY_ID, CATEGORY_NM, SORT_SEQ, MASTER_CODE(중복), CODE_VAL, CODE_VAL_MEAN, CODE_VAL_DESC, CODE_VER, CODE_VAL_REF1_MN~5_MN) | 분석 §9.2 인용 |
| ds_lovCategoryId → ds_GetTbMcmCodeCategoryList | List<Map> (CATEGORY_ID, CATEGORY_NM) | LV-002 |

> **참고**: 본 화면의 GetCodeDetailList 응답 컬럼 수는 14 — masterCodeMng 의 19 컬럼보다 적음 (별도 LoV ds_codeValRef1~5 5 종 반환 ✗ — 본 화면은 nested scalar subquery 내부에서 직접 의미값 합쳐 반환).

---

## 6. To-Be 식별자 (BPMN 기능 식별자 안)

> 정본 명명 (R-12): BPMN 기능 식별자 = `{screenId}_{기능명}` = `masterCodeMngList_{action}`. 본 §6 은 As-Is 의 hash id (Task_xxx) 와 1:1 매핑 안.

### 6.1 process / serviceId

| As-Is | To-Be |
|---|---|
| bpmn2:process id = `MasterCodeMngList` | `masterCodeMngList` (= serviceId) |
| process name = "detailSave\n" (오해 소지 — As-Is 잔존 명칭) | `masterCodeMngList` (또는 "Master Code 상세조회") — As-Is "detailSave" 는 정정 권고 |

### 6.2 action 분기 (sequenceFlow name)

| As-Is sequenceFlow id / name | To-Be 기능 식별자 |
|---|---|
| `SequenceFlow_0grwghu` / name="search" | `masterCodeMngList_search` |
| `SequenceFlow_02ocl0p` / name="searchDetail" | `masterCodeMngList_searchDetail` |

### 6.3 Task id (As-Is 보존 권고)

| As-Is task id | name | To-Be 식별자 |
|---|---|---|
| `Task_2` | Main조회 | (As-Is 보존 권고 — BPMN 내부 id) |
| `Task_0zyza07` | Category조회 | (동일) |
| `Task_1uvph9e` | Detail조회 | (동일) |

### 6.4 sqlKey (#{serviceId}Mapper)

| As-Is sqlKey | To-Be sqlKey (serviceId 치환) |
|---|---|
| `#{serviceId}Mapper.GetCodeMasterList` | `masterCodeMngListMapper.GetCodeMasterList` |
| `#{serviceId}Mapper.GetCodeMasterAllList` | **To-Be 제거** (As-Is BPMN/xfdl 미호출 — Mapper 잔존) |
| `#{serviceId}Mapper.GetCodeDetailList` | `masterCodeMngListMapper.GetCodeDetailList` |
| `#{serviceId}Mapper.GetTbMcmCodeCategoryList` | `masterCodeMngListMapper.GetTbMcmCodeCategoryList` |

### 6.5 UserTask class 패키지

해당 없음 — 본 화면은 UserTask 0 개. To-Be Service 패키지는 다음과 같이 명명:

| 자산 | As-Is | To-Be (제안) |
|---|---|---|
| Service 클래스 | (해당 없음 — UserTask 0) | `com.dongkuk.dmes.mcm.cme.masterCodeMngList.service.MasterCodeMngListQueryService` (조회 전용 — Service 1 개) |
| DTO 패키지 | (해당 없음) | `com.dongkuk.dmes.mcm.cme.masterCodeMngList.dto.*` (Request/Response DTO) |
| Entity·Repository | (해당 없음 — Mapper.xml SELECT 만) | `com.dongkuk.dmes.mcm.{entity,repository}.*` — masterCodeMng 와 공유 (모듈 단위 평탄) |

### 6.6 cactus / oasis 의존성

| 항목 | 값 |
|---|---|
| BPMN modelerTemplate | `com.dongkuk.oasis.task.commonDbTask.MapperBaseDbAccessTemplate` (Task_2 만 명시 — bpmn:11. Task_0zyza07 / Task_1uvph9e 는 modelerTemplate 속성 미명시이나 동일 추정) |
| BPMN class | `com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` (Task_2 / Task_0zyza07 / Task_1uvph9e 3 회) |
| OASIS sqlKey 컨벤션 | `#{serviceId}Mapper.{SQL_ID}` |
| OASIS resultKey 컨벤션 | `ds_{SQL_ID}` (출력 Dataset 이름) |
| isServiceResult | true (3 task 모두) — OASIS service result 로 즉시 응답 |
| cactus-core 의존성 | 본 화면은 SELECT 만 — `CactusAuditEntity` audit 자동 채움 영향 ✗. masterCodeMng 가 등록한 audit 컬럼 (`C_*` / `U_*` / `VER`) 은 본 화면의 SELECT 응답에 단순 포함되어 표시 ✗ (DS-001 / DS-002 에 매핑 안됨) |

---

## 7. As-Is 인용 정합

| 본 § | 인용 정본 | 검증 |
|---|---|---|
| §1.1 | 분석 §8.3 (action 2 분기 + 흐름) | 2 API + 2 action 일치 |
| §1.2 | 분석 §11 C1~C6 | 0/6 → OASIS 단일 자동 채택 |
| §2.1 ~ §2.2 | 분석 §6 (SQL ID) + §8 (BPMN 전수) | 모든 task id / sequenceFlow id / sqlKey cite 100% |
| §2.3 | (해당 없음 — 본 화면 부재 action) | 명시 |
| §3 | 분석 §7 (해당 없음) | UserTask 0 개 |
| §4 | xfdl callback | 트랜잭션 경계 (Read-only) + 오류 처리 As-Is 보존 |
| §5 | 분석 §6 + xfdl gfn_transaction 인자 | sInDatasets / sOutDatasets / sArgument As-Is 1:1 |
| §6 | 분석 §8 + 정합체크서 §B 명명 규칙 | To-Be 명명 안 (제안) |
