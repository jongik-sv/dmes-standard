---
screenId: masterCodeSelPop
asIsId: MasterCodeSelPop
moduleId: mcm
moduleGroup: cma
작성일: 2026-05-27
작성자: Agent
---

# MCM — 마스터코드 선택 팝업 BPMN설계서

> **BackEnd / BPMN 측 확정 값**:
> - 프로세스 ID: masterCodeSelPop (= serviceId)
> - Bean명: masterCodeSelPopService (To-Be)
> - moduleId=mcm / serviceId=masterCodeSelPop / 명명 룰: MES 단일 룰 (camelCase)
> - UI→BFF: `POST /api/mcm/oasis/masterCodeSelPop/{action}`
> - BFF→BE: `POST /oasis/masterCodeSelPop/{action}`
>
> **As-Is 비교**:
> - As-Is process id: `MasterCodeSelPop` (MasterCodeSelPop.bpmn:3)
> - As-Is sqlKey: `#{serviceId}Mapper.GetCodeDetailList` → 실값 `MasterCodeSelPopMapper.GetCodeDetailList`
> - As-Is Java 클래스: ✗ (CommonSelectTask 공통 클래스만 사용)

---

## 1. 액션 매트릭스 (B-NNN → action enum)

기능설계서 §5 인용 + As-Is xfdl Script + BPMN 정합:

| API-ID | Method | URL (T3-D enum) | 설명 | action (7 enum) | 트리거 (B-NNN / E-NNN 인용) | As-Is sqlKey | As-Is BPMN sourceFlow name |
|---|---|---|---|---|---|---|---|
| API-001 | POST | `POST /api/mcm/oasis/masterCodeSelPop/search` (UI→BFF) / `POST /oasis/masterCodeSelPop/search` (BFF→BE) | 마스터코드 조회 | search | B-001 (commonTop btn_search) | `MasterCodeSelPopMapper.GetCodeDetailList` | `search` (SequenceFlow_0grwghu) |

**B-002 확인 / B-003 닫기 / B-004 접기 / E-001 더블클릭 / E-002 헤더정렬**: 클라이언트 only — 서버 API 미발생 (분석리포트 §8.1 = BPMN Task 1 개만 존재).

---

## 2. API 패턴 자동 판정 (C1~C6 — 분석리포트 §0 인용)

### 2.1 C1~C6 충족 여부

| 조건 | 충족 (Y/N) | 근거 | 판정 영향 |
|---|---|---|---|
| C1. As-Is SP case 분기 4종 이상 + 조회/트랜잭션 분리 | N | SP 없음 — Mapper 단일 SELECT 만 | 미충족 |
| C2. LoV master 호출 컬럼 5종 이상 | N | 본 화면 자체가 LoV — 추가 LoV 호출 ✗ | 미충족 |
| C3. 회사·공장 종속 LoV 1종 이상 | N | 회사·공장 종속 없음 (CODE_ID 기반 단순 LoV) | 미충족 |
| C4. 동적 컬럼 응답 팝업/그리드 1개 이상 | N | 고정 컬럼 5개 | 미충족 |
| C5. 독립 query 분리가 적합함 | N | 단일 SELECT — 분리 불필요 | 미충족 |
| C6. 외부 SP 호출로 단일 actionGateway 부적합 | N | SP 없음 | 미충족 |

### 2.2 채택 결과 (04 §A.2-3-2 정본 인용)

| 항목 | 값 |
|---|---|
| C1~C6 충족 개수 | 0 / 6 |
| 채택 패턴 (3 enum) | OASIS 단일 BPMN (자동) |
| API 라우팅 enum | `POST /oasis/{serviceId}/{action}` (= `POST /oasis/masterCodeSelPop/search`) |
| Q-NNN 등재 여부 | ✗ (충족 0~1 — 자동 채택) |
| 정합 | As-Is BPMN 가 이미 단일 CommonSelectTask + Gateway "search" 분기로 단일 OASIS 패턴 — As-Is 1:1 보존 |

---

## 3. action 별 BPMN flow

### 3.1 search (B-001 조회 / OnLoad 자동 조회)

```
[화면 진입 (OnLoad fn_formAfterOnload)]
    │
    ├──→ 호출 측 4 파라미터 수신 (sCodeId / sCodeNm / sCodeVal / sCodeValMean)
    │     - sCodeNm → edt_codeNm.set_value
    │     - sCodeVal → edt_codeVal.set_value
    │
    ├──→ fn_button() (commonTopButton 주입: btn_search / btn_confirm / btn_close)
    │
    └──→ fn_search() 자동 호출 (Script:135)
              │
              ▼
[B-001 조회 클릭 또는 OnLoad 자동 호출]
    │
    ├──→ ds_grdMain.clearData() (Script:166)
    │
    ├──→ sArgument 조립 (Script:161-163):
    │       pCodeId = this.sCodeId
    │       pDiv    = div_search.form.cbo_div.value (CODE_VAL or CODE_VAL_MEAN)
    │       pValue  = div_search.form.edt_codeVal.value
    │
    └──→ POST /api/mcm/oasis/masterCodeSelPop/search (API-001)
              │
              ├──→ BPMN: StartEvent_1 → ExclusiveGateway_1 → Task_2 ("search" 분기)
              │
              ├──→ Task_2 (CommonSelectTask):
              │       sqlKey = MasterCodeSelPopMapper.GetCodeDetailList
              │       resultKey = ds_GetCodeDetailList
              │       isServiceResult = true
              │
              ├──→ 성공:
              │     - ds_grdMain ← ds_GetCodeDetailList (xfdl sOutDatasets)
              │     - gfn_commonBottomStatus_msg("{n}건 조회 되었습니다.") (M-001)
              │     - ds_grdMain.set_rowposition(this.grd_row) (Script:176)
              │
              └──→ 실패:
                    - gfn_commonBottomStatus_msg(strErrorMsg) (M-002)
```

### 3.2 confirm (B-002 확인) — 클라이언트 only

```
[B-002 확인 클릭]
    │
    ├──→ obj = {} (Script:196)
    │
    ├──→ obj.sCodeVal     = ds_grdMain.getColumn(rowposition, "CODE_VAL")     (Script:197)
    ├──→ obj.sCodeValMean = ds_grdMain.getColumn(rowposition, "CODE_VAL_MEAN") (Script:198)
    │
    └──→ gfn_popupClose(obj) (Script:199)
              │
              └──→ 호출 화면의 콜백 (예: fn_returnMasterCodePopupCallBack) 실행
                    - rtVal.sCodeVal / rtVal.sCodeValMean 사용
```

### 3.3 close (B-003 닫기) — 클라이언트 only

```
[B-003 닫기 클릭]
    │
    └──→ this.close() (Script:204)
              │
              └──→ 호출 화면의 콜백 실행 (rtVal 없음 — gfn_isNull(rtVal) 분기 진입)
```

### 3.4 fold (B-004 접기/펴기) — 클라이언트 only

```
[B-004 btn_fold 클릭]
    │
    └──→ gfn_fold(this, this.div_search, this.div_main, this.btn_fold) (Script:210)
              │
              └──→ div_search 영역 토글 + div_main 영역 확장/축소
```

### 3.5 grid double click (E-001) — 클라이언트 only (B-002 와 동일 동작)

```
[grd_main 셀 더블클릭 (e.row)]
    │
    ├──→ obj = {} (Script:187)
    │
    ├──→ obj.sCodeVal     = ds_grdMain.getColumn(e.row, "CODE_VAL")     (Script:188)
    ├──→ obj.sCodeValMean = ds_grdMain.getColumn(e.row, "CODE_VAL_MEAN") (Script:189)
    │
    └──→ gfn_popupClose(obj) (Script:190)
```

### 3.6 grid head click (E-002) — 클라이언트 only

```
[grd_main 헤더 클릭]
    │
    └──→ gfn_commonOnheadclick(obj, e)  (gfn 공통 — 정렬 토글)
```

---

## 4. UserTask = 없음

본 화면은 **조회 전용**이다. 분석리포트 §7 / §8.1 에서 검증된 사실:

| 항목 | 결과 | 근거 |
|---|---|---|
| Java UserTask 클래스 | ✗ (CommonSelectTask 공통 클래스만 사용) | MasterCodeSelPop.bpmn:14 (`class=com.dongkuk.oasis.task.commonDbTask.CommonSelectTask`) |
| BPMN userTask 노드 | ✗ (task 1개 = ServiceTask, modelerTemplate=MapperBaseDbAccessTemplate) | MasterCodeSelPop.bpmn:10 (`<bpmn2:task ... modelerTemplate="...MapperBaseDbAccessTemplate"/>`) |
| 화면별 Java 핸들러 | ✗ | (Java 파일 미존재) |

---

## 5. 트랜잭션 경계

| 트랜잭션 | 시작 | 종료 | 범위 |
|---|---|---|---|
| TX-001 (search) | API-001 POST 진입 | CommonSelectTask 결과 응답 | 단일 SELECT (읽기 전용) — 트랜잭션 격리 수준은 As-Is 기본값 (Oracle READ COMMITTED 추정) |

**As-Is 1:1 보존**: 본 화면은 INSERT / UPDATE / DELETE 가 없어 쓰기 트랜잭션 경계 ✗.

---

## 6. To-Be 식별자

### 6.1 BPMN 식별자 매핑

| 항목 | As-Is | To-Be | 변환 규칙 |
|---|---|---|---|
| BPMN process id | `MasterCodeSelPop` | `masterCodeSelPop` | screenId = `{moduleId}{화면명}` camelCase |
| BPMN process name | "마스터코드 조회" | "마스터코드 조회" (보존) | As-Is name 보존 |
| BPMN Task name | "Main조회" | "Main조회" (보존) | 동일 |
| BPMN 기능 식별자 (`{screenId}_{기능명}`) | (As-Is 없음 — sequenceFlow name="search" 만) | `masterCodeSelPop_search` | 정본 룰 |
| BPMN sqlKey | `MasterCodeSelPopMapper.GetCodeDetailList` | `MppMcmMasterCodeSelPopMapper.getCodeDetailList` 또는 `MasterCodeSelPopMapper.getCodeDetailList` (To-Be Mapper namespace 결정) | Q-NNN — Mapper namespace 명명 규칙 결정 위임 |
| BPMN resultKey | `ds_GetCodeDetailList` | `ds_GetCodeDetailList` 보존 또는 camelCase 변환 (`dsGetCodeDetailList`) | To-Be FE-BE 데이터 규약에 따라 결정 |
| BPMN class | `com.dongkuk.oasis.task.commonDbTask.CommonSelectTask` | 동일 보존 (또는 To-Be 패키지 재정의) | OASIS 공통 클래스 — 신규 모듈은 동일 클래스 재사용 |

### 6.2 BPMN 노드 식별자 (As-Is 보존)

| 노드 | As-Is ID | To-Be ID (보존) |
|---|---|---|
| StartEvent | StartEvent_1 | StartEvent_1 |
| ExclusiveGateway (action 분기) | ExclusiveGateway_1 | ExclusiveGateway_1 |
| Task (Main조회 / CommonSelectTask) | Task_2 | Task_2 (또는 Task_search) |
| EndEvent | EndEvent_1 | EndEvent_1 |
| SequenceFlow (Start → Gateway) | SequenceFlow_1 | SequenceFlow_1 |
| SequenceFlow (Gateway → Task, name="search") | SequenceFlow_0grwghu | SequenceFlow_0grwghu (또는 `flow_search`) |
| SequenceFlow (Task → End) | SequenceFlow_0lnje1n | SequenceFlow_0lnje1n |

### 6.3 As-Is BPMN → To-Be 변환점

| 항목 | 변경 | 사유 |
|---|---|---|
| process id | `MasterCodeSelPop` → `masterCodeSelPop` | screenId 명명 규칙 적용 |
| sqlKey namespace | Mapper 위치 (mappers-cma) 와 namespace 결정 위임 | Q-NNN (To-Be Mapper 패키지 결정) |
| ext:style 시각화 (shapeBackground 등) | 보존 권장 | As-Is 1:1 보존 |
| Oracle ↔ MSSQL 변환 | Mapper 본문 (`\|\|` → `+`) | 분석리포트 §11 |

---

## 7. As-Is BPMN 1:1 보존 검증

| BPMN 요소 | As-Is | 본 설계서 등재 | 정합 |
|---|---|---|---|
| process | id=MasterCodeSelPop / name=마스터코드 조회 / isExecutable=false | §6.1 / §6.2 | ✓ |
| StartEvent_1 | name="Start Event" | §3 / §6.2 | ✓ |
| ExclusiveGateway_1 | gatewayDirection=Diverging | §3 / §6.2 | ✓ |
| Task_2 | name="Main조회" / modelerTemplate=MapperBaseDbAccessTemplate | §3.1 / §6.1 / §6.2 | ✓ |
| EndEvent_1 | name="End Event" | §3 / §6.2 | ✓ |
| SequenceFlow_1 | (Start→Gateway) | §3.1 / §6.2 | ✓ |
| SequenceFlow_0grwghu | name="search" (Gateway→Task) | §3.1 / §6.2 / §1 (액션 매트릭스) | ✓ |
| SequenceFlow_0lnje1n | (Task→End) | §3.1 / §6.2 | ✓ |
| camunda:property class | CommonSelectTask | §4 / §6.1 | ✓ |
| camunda:property paramKey | (빈 값) | §3.1 (Task_2 입력은 serviceResult.input) / 분석 §8.3 | ✓ |
| camunda:property isServiceResult | true | §3.1 / 분석 §8.3 | ✓ |
| camunda:property dao | (빈 값) | 분석 §8.3 | ✓ |
| camunda:property sqlKey | `#{serviceId}Mapper.GetCodeDetailList` | §1 (API 매트릭스) / §6.1 | ✓ |
| camunda:property resultKey | `ds_GetCodeDetailList` | §1 / §6.1 / §3.1 | ✓ |
| ext:style (Task_2) | shapeBackground=#0080c0 labelForeground=#000000 | (As-Is 시각화 보존 — §6.3) | ✓ |
| ext:style (ExclusiveGateway_1) | shapeBackground=#ffff00 labelPosition=Center of Figure | 동일 | ✓ |
