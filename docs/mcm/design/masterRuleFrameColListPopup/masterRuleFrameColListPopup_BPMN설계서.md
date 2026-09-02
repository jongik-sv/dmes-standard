---
screenId: masterRuleFrameColListPopup
asIsId: MasterRuleFrameColListPopup
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
---

# MCM — 업무기준 컬럼 리스트 등록 팝업 BPMN설계서

> **BackEnd / BPMN 측 확정 값**:
> - 프로세스 ID: masterRuleFrameColListPopup (= serviceId)
> - Bean명: masterRuleFrameColListPopupService (To-Be)
> - moduleId=mcm / serviceId=masterRuleFrameColListPopup / 명명 룰: MES 단일 룰 (camelCase)
> - UI→BFF: `POST /api/mcm/oasis/masterRuleFrameColListPopup/{action}`
> - BFF→BE: `POST /oasis/masterRuleFrameColListPopup/{action}`
>
> **As-Is 비교** (분석 §8):
> - As-Is process id: `MasterRuleFrameColListPopup` (bpmn:3)
> - As-Is 액션 2종: search (CommonSelectTask) + save (UserTask SaveMasterRuleBaseColList)
> - As-Is sqlKey (search): `#{serviceId}Mapper.GetRuleColList`
> - As-Is class (save): `#{basePackage}SaveMasterRuleBaseColList`

---

## 1. 프로세스 개요

> **표기 컨벤션**: DB 컬럼명/테이블명 = SNAKE_CASE / API JSON 필드 = camelCase

### 1.1 API 엔드포인트 총괄

> 분석 §8.5 (BPMN ↔ xfdl ↔ Mapper/Java 정합) + 기능 §5 인용.

| API-ID | Method (POST 고정) | URL (T3-D enum) | 설명 | action (7 enum) | 트리거 (B-NNN / E-NNN 인용) |
|---|---|---|---|---|---|
| API-001 | POST | `POST /api/mcm/oasis/masterRuleFrameColListPopup/search` (UI→BFF) / `POST /oasis/masterRuleFrameColListPopup/search` (BFF→BE) | 업무기준 소스 테이블 컬럼 리스트 조회 (onload 자동) | search | (onload 자동 / 부모 P-001 진입) |
| API-002 | POST | `POST /api/mcm/oasis/masterRuleFrameColListPopup/save` (UI→BFF) / `POST /oasis/masterRuleFrameColListPopup/save` (BFF→BE) | 컬럼 리스트 전체 재등록 (DELETE 후 INSERT) | save | B-001 (등록) |

**B-002 닫기 / B-003 접기 / E-001 일괄 IN/OUT**: 클라이언트 only — 서버 API 미발생 (분석 §4.1 / §4.3).

### 1.2 API 패턴 자동 판정 결과 (분석리포트 §11 인용 — 04 §A.2-3-2)

| 항목 | 값 |
|---|---|
| C1~C6 충족 개수 (§2.1 측정) | 0 / 6 |
| 채택 패턴 (3 enum) | OASIS 단일 BPMN (자동) |
| API 라우팅 enum (T3-D 결과) | `POST /oasis/{serviceId}/{action}` (search / save 2 액션 — 단일 actionGateway) |
| Q-NNN 등재 여부 | ✗ (충족 0~1 — 자동 채택. As-Is 가 이미 단일 BPMN + ExclusiveGateway search/save 2 분기) |

---

## 2. API 패턴 자동 판정 (C1~C6 — 분석리포트 §11 인용)

### 2.1 C1~C6 충족 여부

| 조건 | 충족 (Y/N) | 근거 | 판정 영향 |
|---|---|---|---|
| C1. As-Is SP case 분기 4종 이상 + 조회/트랜잭션 분리 | N | @Case 분기 SP 없음 — Mapper 단일 SELECT + Java delete/insert (분석 §5.5) | 미충족 |
| C2. LoV master 호출 컬럼 5종 이상 | N | 자체 innerdataset 3종 (ds_inOut/ds_div/ds_colType) — master 호출 ✗ | 미충족 |
| C3. 회사·공장 종속 LoV 1종 이상 | N | 회사·공장 종속 없음 | 미충족 |
| C4. 동적 컬럼 응답 팝업/그리드 1개 이상 | N | 고정 9 컬럼 (동적 테이블명이나 컬럼은 고정 그리드) | 미충족 |
| C5. 독립 query 분리가 적합함 | N | 단일 SELECT + 단일 save 트랜잭션 | 미충족 |
| C6. 외부 SP 호출로 단일 actionGateway 부적합 | N | 외부 SP 없음 (Java가 외부 공통 Mapper 직접 호출) | 미충족 |

### 2.2 채택 결과 (04 §A.2-3-2 정본 인용)

| 항목 | 값 |
|---|---|
| C1~C6 충족 개수 | 0 / 6 |
| 채택 패턴 (3 enum) | OASIS 단일 BPMN (자동) |
| API 라우팅 enum | `POST /oasis/masterRuleFrameColListPopup/{action}` (search / save) |
| Q-NNN 등재 여부 | ✗ |
| 정합 | As-Is BPMN 이 이미 단일 process + ExclusiveGateway 2 분기 (search/save) — As-Is 1:1 보존 |

---

## 2. 프로세스별 BPMN 상세

### 2.1 화면 초기화 프로세스 (onload)

```
[팝업 진입 (MasterRuleFrameColListPopup_onload)]
    │
    ├──→ gfn_formOnLoad
    ├──→ fn_button() (commonTopButton 주입: btn_save / btn_close)
    ├──→ 부모 파라미터 수신: sRuleId = gfn_Data_Return("sRuleId") / sRuleNm = gfn_Data_Return("sRuleNm")
    │       - sRuleId → edt_MasterRuleId.set_value (표시)
    │       - sRuleNm → edt_MasterRuleNm.set_value (표시)
    │
    └──→ fn_search() 자동 호출 (API-001)
              │
              └──→ gfn_comboCreate(grd_main, ds_inOut, fn_comboCallBackInOut)
```

### 2.2 조회 프로세스 (search — onload 자동)

```
[onload 자동 호출 fn_search]
    │
    ├──→ ds_grdRuleCol.clearData()
    ├──→ sArgument: pRuleId = sRuleId / pTable = "TB_MCA_" + sRuleId
    │
    └──→ POST /oasis/masterRuleFrameColListPopup/search (API-001)
              │
              ├──→ BPMN: StartEvent_1 → ExclusiveGateway_1 → GetRuleColList ("search" 분기)
              │
              ├──→ GetRuleColList (CommonSelectTask):
              │       sqlKey = MasterRuleFrameColListPopupMapper.GetRuleColList
              │       resultKey = ds_grdRuleCol
              │       (Oracle 메타: ALL_TAB_COLUMNS/ALL_COL_COMMENTS, OWNER='MCA_SOURCE', TABLE_NAME=pTable)
              │
              ├──→ 성공:
              │     - ds_grdRuleCol ← 조회 결과
              │     - gfn_commonBottomStatus_msg("{n}건 조회 되었습니다.")
              │     - gfn_comboCreate(ds_inOut, fn_comboCallBackInOut)
              │
              └──→ 실패:
                    - gfn_commonBottomStatus_msg(strErrorMsg)
```

### 2.3 상세 조회 프로세스 (그리드 행 클릭)

해당 없음 (인라인 편집 — 별도 상세 조회 API 없음).

### 2.4 신규 등록 / 저장 프로세스 (B-001 등록 → save)

```
[B-001 등록 버튼 클릭 (fn_save)]
    ▼
프론트 유효성 검증 (기능 §6):
    ├─ V-001: IN 조건 컬럼 존재 (없으면 alert + 중단)
    ├─ V-002: OUT 조건 컬럼 존재 (없으면 alert + 중단)
    └─ 행별: V-003 COL_NM → V-004 COL_ID → V-005 MASTER_CODE_DIV → V-006 COL_TYPE → V-007 COL_LEN
          (미입력 시 alert + 해당 행/셀 포커스 + 중단)
    ▼
XV-001 확인 다이얼로그: "저장하시면 기존에 있던 컬럼정보들은 모두 삭제됩니다. 저장하시겠습니까?"
    ▼ (확인)
POST /oasis/masterRuleFrameColListPopup/save (API-002)
    │ Request Body: { ruleId, rows: [{ colId, colNm, ioFlag, colType, colLen, colPrecLen, masterCodeDiv }, ...] }
    ▼
BPMN: StartEvent_1 → ExclusiveGateway_1 → SaveMasterRuleBaseColList ("save" 분기, UserTask)
    ▼
서버 (SaveMasterRuleBaseColList):
    ├─ 1. DELETE TB_MCA_RULE_COL_LIST WHERE RULE_ID = #{pRuleId}
    ├─ 2. FOR each row: INSERT (RULE_ID / RULE_VER="1" / COL_SEQ=++cnt / COL_ID / COL_NM / IO_FLAG / COL_TYPE / COL_LEN / COL_PREC_LEN / MASTER_CODE_DIV)
    ├─ 3. INSERT 실패 시 throw → IllegalTaskException (롤백)
    └─ 4. cnt_save context 적재
    ▼
응답:
    ├─→ 200 성공: gfn_popupClose() → 부모 콜백 fn_returnColListPopupCallBack → 부모 fn_search()
    └─→ 실패: gfn_commonBottomStatus_msg(strErrorMsg)
```

### 2.5 수정 프로세스 (행 더블클릭 → 저장)

해당 없음 (수정 = save 전체 재등록과 동일 경로. 개별 행 수정 = 인라인 편집 후 §2.4 save).

### 2.6 삭제 프로세스 (B-NNN)

해당 없음 (개별 삭제 버튼 없음 — save 내부 전체 DELETE 후 INSERT 로 처리, §2.4).

### 2.7 상태 변경 프로세스 (확정/취소 등)

해당 없음 (상태 enum 없음 — 기능 §7).

---

## 3. 에러 처리 매트릭스

| HTTP 상태 | 에러 코드 | 화면 처리 | 사용자 메시지 |
|---|---|---|---|
| 400 | VALIDATION_ERROR | fieldErrors → 행/셀 에러 표시 | V-001~V-007 메시지 |
| 400 | BAD_REQUEST | 토스트 (error) | 서버 반환 message |
| 401 | UNAUTHORIZED | 로그인 페이지 리다이렉트 | - |
| 403 | FORBIDDEN | 토스트 (error) | "권한이 없습니다" |
| 404 | NOT_FOUND | 토스트 (warning) | "해당 데이터가 존재하지 않습니다" |
| 409 | CONFLICT | 동시 수정 다이얼로그 | "다른 사용자가 이미 수정했습니다" |
| 422 | BUSINESS_RULE_VIOLATION | bottom 메시지 / 다이얼로그 | 서버 반환 message (As-Is gfn_commonBottomStatus_msg) |
| 500 | INTERNAL_ERROR | bottom 메시지 (error) | "서버 오류가 발생했습니다" (As-Is IllegalTaskException → strErrorMsg) |
| timeout | - | 로딩 해제 + 토스트 | "요청 시간이 초과되었습니다" |
| network | - | 로딩 해제 + 토스트 | "네트워크 연결을 확인해주세요" |

---

## 4. 데이터 연동 및 부수 효과

### 4.1 상태 변경 시 부수 효과

| 상태 전이 | 부수 효과 | 대상 모듈 | 설명 |
|---|---|---|---|
| (해당 없음) | save 시 TB_MCA_RULE_COL_LIST 전체 재등록 (RULE_ID 기준 DELETE 후 INSERT) | mcm (업무기준) | 분석 §5.3 (Java delete + insert loop) |

### 4.2 참조 무결성

| 관계 | 제약 | 위반 시 |
|---|---|---|
| TB_MCA_RULE_COL_LIST.RULE_ID → 업무기준(RULE) | save 는 RULE_ID 기준 전체 교체 | INSERT 실패 시 IllegalTaskException (전체 롤백) |

### 4.3 동시 수정 방지

```
As-Is 는 동시 수정 방지 (updatedAt 비교) 미적용 — RULE_ID 기준 전체 DELETE+INSERT.
To-Be: optimistic lock 적용 여부 개발 단계 결정 (mcm-core McmAuditEntity VER @Version — §7.2 audit 매핑 연계).
```

### 4.4 트랜잭션 경계

| 액션 | 트랜잭션 범위 | 비고 |
|---|---|---|
| TX-001 (search) | API-001 진입 ~ CommonSelectTask 응답 | 읽기 전용 (Oracle 메타 딕셔너리) |
| TX-002 (save) | API-002 진입 ~ SaveMasterRuleBaseColList 완료 | DELETE + INSERT loop 단일 트랜잭션 (실패 시 전체 롤백 — Java throw IllegalTaskException). OASIS 서비스 @Transactional 금지 → cactus TransactionTemplate |

---

## 5. 화면 생명주기

| 단계 | 이벤트 | 동작 | 호출 액션 |
|---|---|---|---|
| onMount | 팝업 진입 | 부모 파라미터(sRuleId/sRuleNm) 수신 → 표시 → 자동 조회 + ds_inOut 콤보 생성 | search (API-001) |
| onUnmount | 팝업 닫기 (B-002 / save 성공) | gfn_popupClose → 부모 콜백 fn_search | - |
| onBeforeUnload | 브라우저 새로고침 / 닫기 | (As-Is 미적용) | - |

---

## 6. 특이사항 / 설계 결정

### 6.1 [확인필요] 인용 (분석리포트 §13 의 BPMN 관련만)

| 분석리포트 §13 ID | 항목 | 분류 | 영향도 (높음/중간/낮음) | 결정 | 근거 | 상태 (open/resolved/wontfix) |
|---|---|---|---|---|---|---|
| Q-001 | TB_MCA_RULE_COL_LIST To-Be 정본 (save 대상 테이블) | 데이터 | 높음 | DMES-SECTION-MCA sheet134 등재 + 형제 masterRuleFrame §7 Entity `MasterRuleColList` / Repository `MasterRuleColListRepository` 정합 (owner=MCAAPUSER, audit=McmAuditEntity 9) | 분석 §7.2 / §9.2 | resolved |
| Q-002 | save 반환 dataset 불일치 (ds_GetRuleDataUploadList 미생성) | BPMN/반환 | 낮음 | To-Be save 는 `{ savedCount }` 만 반환 | 분석 §4.1 | **확정 (As-Is 보존 + cnt 표준화 — 사용자 2026-06-04)** |

### 6.2 검토한 대안 (있는 경우만)

| 대안 | 장점 | 단점 | 채택 여부 (○/×) | 사유 |
|---|---|---|---|---|
| search 를 To-Be 자체 Entity 조회로 변경 (Oracle 메타 딕셔너리 제거) | DBMS 종속 제거 | As-Is(소스 테이블 메타 동적 조회) 동작 불일치 | × | As-Is 1:1 보존 — §11 에서 MSSQL INFORMATION_SCHEMA 변환만 적용 |
| search / save 를 별도 BPMN 분리 | 액션별 독립 | As-Is 단일 process(ExclusiveGateway 2분기) 불일치 | × | As-Is 1:1 보존 (단일 actionGateway) |

---

## 7. As-Is BPMN 1:1 보존 검증

| BPMN 요소 | As-Is | 본 설계서 등재 | 정합 |
|---|---|---|---|
| process | id=MasterRuleFrameColListPopup / name=업무기준 구조 등록 팝업 / isExecutable=false | §1 / §2 | ✓ |
| StartEvent_1 | name="Start Event" | §2 (BPMN flow) | ✓ |
| ExclusiveGateway_1 | gatewayDirection=Diverging (2 outgoing: search/save) | §2.2 / §2.4 | ✓ |
| GetRuleColList | task / modelerTemplate=MapperBaseDbAccessTemplate / name="컬럼 리스트 조회" | §2.2 / §1.1 (API-001) | ✓ |
| SaveMasterRuleBaseColList | userTask / modelerTemplate=com.dongkuk.dmes.UserTask / name="저장" | §2.4 / §1.1 (API-002) | ✓ |
| EndEvent_1 | name="End Event" (2 incoming) | §2.2 / §2.4 | ✓ |
| SequenceFlow_1 | Start → Gateway | §2.1 | ✓ |
| SequenceFlow_0grwghu | name="search" (Gateway→GetRuleColList) | §1.1 / §2.2 | ✓ |
| SequenceFlow_19mau2h | GetRuleColList → End | §2.2 | ✓ |
| SequenceFlow_1ul62kh | name="save" (Gateway→SaveMasterRuleBaseColList) | §1.1 / §2.4 | ✓ |
| SequenceFlow_184pcc9 | SaveMasterRuleBaseColList → End | §2.4 | ✓ |
| camunda:property class (search) | CommonSelectTask | §2.2 | ✓ |
| camunda:property sqlKey (search) | `#{serviceId}Mapper.GetRuleColList` | §1.1 / §2.2 | ✓ |
| camunda:property resultKey (search) | `ds_grdRuleCol` | §2.2 | ✓ |
| camunda:property class (save) | `#{basePackage}SaveMasterRuleBaseColList` | §2.4 | ✓ |
| ext:style (Gateway/GetRuleColList/Save) | #ffff00 / #1E88E5+#BBDEFB / rgb(251,140,0)+rgb(255,224,178) | (As-Is 시각화 보존 — 분석 §8.6) | ✓ |

### 7.1 To-Be BPMN 식별자 매핑

| 항목 | As-Is | To-Be | 변환 규칙 |
|---|---|---|---|
| BPMN process id | `MasterRuleFrameColListPopup` | `masterRuleFrameColListPopup` | screenId camelCase |
| BPMN sqlKey (search) | `MasterRuleFrameColListPopupMapper.GetRuleColList` | `masterRuleFrameColListPopupMapper.getRuleColList` (또는 보존 — To-Be Mapper namespace 결정) | Q (Mapper namespace) |
| BPMN class (save) | `#{basePackage}SaveMasterRuleBaseColList` | `com.dongkuk.dmes.mcm.cmb.masterRuleFrameColListPopup.SaveMasterRuleBaseColList` (To-Be 패키지) | 패키지 root 변환 |
| 기능 식별자 | (sequenceFlow name="search"/"save") | `masterRuleFrameColListPopup_search` / `masterRuleFrameColListPopup_save` | 01 A.4.4.1 |
