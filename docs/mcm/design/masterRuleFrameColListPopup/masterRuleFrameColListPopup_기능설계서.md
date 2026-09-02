---
screenId: masterRuleFrameColListPopup
asIsId: MasterRuleFrameColListPopup
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-04
작성자: Agent
---

# MCM — 업무기준 컬럼 리스트 등록 팝업 기능설계서

> 본 설계서의 모든 표는 분석리포트(masterRuleFrameColListPopup_분석리포트.md)의 해당 절을 인용한다.

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| **화면명** | 업무기준 컬럼 리스트 등록 팝업 |
| **화면 식별자** | masterRuleFrameColListPopup |
| **모듈** | mcm (공통관리) > cmb (업무기준 관리(원장)) |
| **화면 목적** | 부모 화면(업무기준 구조관리)에서 선택한 업무기준(RULE)의 소스 테이블 컬럼을 메타 조회하여 컬럼 리스트를 편집·등록한다. 저장 시 기존 컬럼정보를 전체 삭제 후 재등록한다. |
| **주요 사용자** | 공통관리(업무기준 마스터) 운영자 |
| **접근 경로** | 부모 MasterRuleFrame 의 "기초데이터 등록 버튼"(btn_ruleCol) → 모달 팝업 (분석 §1 호출 컨텍스트) |

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId | mcm | 01 A.1 |
| moduleGroup | cmb | 01 A.2 |
| mesModule | m-mcm | 01 A.4.5 (`m-{moduleId}`) |
| 적용 명명 룰 | MES 단일 룰 | moduleId ≠ mpn |
| 화면식별자 (screenId) | masterRuleFrameColListPopup | 01 A.3 / A.4.1 |
| pageName | masterRuleFrameColListPopup | 01 A.4.2 (= screenId) |
| pageId | masterRuleFrameColListPopup | 01 A.4.3 (= screenId) |
| serviceId | masterRuleFrameColListPopup | 01 A.4.4 |
| 페이지 유형 | E (등록 폼 — A-FILTER 표시 전용 + 편집 그리드 위주) | FE가이드 §3-1 (분석 §3) |
| 주요 API path (UI→BFF) | `POST /api/mcm/oasis/masterRuleFrameColListPopup/{action}` | 04 §A.2-3 |
| 주요 API path (BFF→BE) | `POST /oasis/masterRuleFrameColListPopup/{action}` | 04 §A.2-3 |
| Frontend 파일명 | masterRuleFrameColListPopup.tsx | 03 컨벤션 |
| tsup entry key | `pages/cmb/masterRuleFrameColListPopup` | 01 A.4.6 |

---

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| A-FILTER | 업무기준 표시 영역 | 부모 전달 업무기준 ID/명 read-only 표시 (분석 §3.2 S-001~004) |
| A-GRID | 컬럼 리스트 그리드 | 편집 가능 컬럼 리스트 (분석 §3.3 G-001~008) |
| A-DETAIL | 상세 영역 | 해당 없음 |
| A-BTN | 버튼 영역 | 등록/닫기/접기 (분석 §4.1 B-001~003) |

---

## 3. 조회조건 정의 (영역: A-FILTER)

> 본 팝업의 A-FILTER 는 검색 입력이 아니라 부모 전달값 표시 전용 (분석 §3.2). 행은 분석 §3.2 그대로 인용.

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 (✓/✗) |
|---|---|---|
| 행 수 일치 | `본 §3 행 == 분석 §3.2 행` (4) | ✓ |
| 화면 표시명 1byte 일치 | 분석 §3.2 셀 본문 인용 | ✓ |
| 입력 방식 enum (5값) | 정규식 `^(TextBox\|ComboBox\|CheckBox\|DatePicker\|Lookup)$` | ✓ |

| 필드ID | DB 컬럼명 (SNAKE_CASE) | 화면 표시명 (분석 §3.2 인용) | 입력 방식 (5 enum) | 필수 (Y/N) | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | (UI 라벨) | 업무기준 | TextBox | N | "업무기준" | Static 라벨 (분석 §3.2) |
| S-002 | RULE_ID | (업무기준 ID 표시값) | TextBox | N | (sRuleId 수신) | readonly — 부모 전달 sRuleId 표시 |
| S-003 | (UI 라벨) | 업무기준명 | TextBox | N | "업무기준명" | Static 라벨 (분석 §3.2) |
| S-004 | (UI 표시) | (업무기준명 표시값) | TextBox | N | (sRuleNm 수신) | readonly — 부모 전달 sRuleNm 표시 |

### 3.2 조회 결과 (그리드 컬럼)

> 분석 §3.3 그대로 인용.

**인용 검증 미니 표**:

| 검증 항목 | 측정 방법 | 결과 |
|---|---|---|
| 행 수 일치 | `본 §3.2 G 행 == 분석 §3.3 G 행` (9, 순번 포함) | ✓ |
| 표시명 1 enum 매칭 | 확정 한글 인용 | ✓ |
| 표시 형식 enum | 자료형(길이) | ✓ |

**메인 그리드 (G-NNN)**:

| 컬럼ID | DB 컬럼명 (alias) | 화면 표시명 (분석 §3.3 인용) | 데이터 설명 | 정렬 (3 enum) | 표시 형식 (자료형(길이)) |
|---|---|---|---|---|---|
| G-000 | (UI 자동) | 순번 | currow+1 (UI 산출) | Center | int(5) |
| G-001 | COL_ID | 영문항목명 | 컬럼 영문명 (editmaxlength 30) | Left | varchar(30) |
| G-002 | COL_NM | 한글항목명 | 컬럼 한글명 (editmaxlength 100) | Left | varchar(100) |
| G-003 | CHK | 선택 | 일괄 IN/OUT 적용 대상 체크 (UI 전용) | Center | bit(1/0) |
| G-004 | IO_FLAG | (IN/OUT 콤보) | IN/OUT 여부 (ds_inOut) | Center | varchar(3) |
| G-005 | MASTER_CODE_DIV | 코드여부 | 마스터코드 여부 (ds_div Y/N) | Center | varchar(1) |
| G-006 | COL_TYPE | 유형 | 컬럼 형식 (ds_colType DATE/NUMBER/VARCHAR2) | Center | varchar(20) |
| G-007 | COL_LEN | 총길이 | 총길이 (mask ##,##9, editmaxlength 5) | Right | int(5) |
| G-008 | COL_PREC_LEN | 소수점길이 | 소수점 길이 (mask ##,##9, editmaxlength 5) | Right | int(5) |

**확장/서브 그리드 (GE-NNN 또는 G2-NNN)** — 해당 없음.

| 컬럼ID | DB 컬럼명 | 화면 표시명 | 데이터 설명 | 정렬 | 비고 |
|---|---|---|---|---|---|

### 3.3 코드값 표시 변환

> 분석 §10 LoV 인용.

| DB 컬럼 | 코드 마스터 | 변환 예 |
|---|---|---|
| IO_FLAG | ds_inOut (LV-003) | (공백)→선택 / IN→IN / OUT→OUT |
| MASTER_CODE_DIV | ds_div (LV-001) | N→N / Y→Y |
| COL_TYPE | ds_colType (LV-002) | DATE/NUMBER/VARCHAR2 |

---

## 4. 상세 영역 필드 정의 (영역: A-DETAIL)

해당 없음 (분석 §3 — 상세 영역 없음. 편집은 A-GRID 인라인).

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | (해당 없음) | - | - | - | - | - |

### 4.2 라인 필드 (서브 그리드)

해당 없음.

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 설명 |
|---|---|---|---|---|---|
| L-001 | (해당 없음) | - | - | - | - |

---

## 5. 버튼 및 기능 동작 정의

### 5.1 버튼 목록

> 분석 §4.1 인용 + To-Be action 7 enum.

| 버튼ID | 버튼명 (분석 §4.1 인용) | 위치 (toolbar / 본체 / 그리드셀) | To-Be action (7 enum) | 설명 |
|---|---|---|---|---|
| B-001 | 등록 | toolbar (commonTop btn_save) | save | V-001~V-007 검증 후 confirm → 전체 재등록 |
| B-002 | 닫기 | toolbar (commonTop btn_close) | popup | gfn_popupClose (팝업 닫기) |
| B-003 | 조회조건 접기/펴기 | 본체 (btn_fold) | popup | gfn_fold (영역 토글) |

### 5.1-1 그리드셀 인라인 버튼 (GB-NNN) — T1-D

해당 없음 (분석 §4.2).

| 버튼ID | 버튼명 | 소속 그리드 (G/GE/L-NNN) | 셀 컬럼 | 핸들러 | 설명 |
|---|---|---|---|---|---|
| GB-001 | (해당 없음) | - | - | - | - |

### 5.2 버튼별 동작 상세

> 분석 §5 As-Is 메서드 매핑 인용. BPMN설계서 §3 과 1:1 대응.

| 버튼ID | 트리거 | 선행 조건 | 동작 (단계별) | 호출 액션 (action) |
|---|---|---|---|---|
| B-001 | fn_save (Script:235) | V-001~V-007 통과 + XV-001 confirm | 1) IN/OUT 존재 검증 2) 행별 필수값 검증 3) "기존 컬럼정보 모두 삭제" 확인 4) save 트랜잭션 (DELETE TB_MCA_RULE_COL_LIST + INSERT loop) 5) 성공 시 popupClose | save |
| B-002 | fn_close (Script:330) | 없음 | gfn_popupClose() | popup |
| B-003 | btn_fold_onclick (Script:335) | 없음 | gfn_fold (div_search 토글) | popup |
| E-001 | fn_comboCallBackInOut (Script:209) | 헤더 IN/OUT 콤보 변경 | CHK=1 인 모든 행에 IO_FLAG 일괄 setColumn | (클라이언트 일괄 편집) |

### 5.3 그리드 동작

| 동작 | 설명 |
|---|---|
| 행 클릭 | 행 선택 (selecttype=multiarea) |
| 행 더블클릭 | 해당 없음 (인라인 편집) |
| 헤더 IN/OUT 콤보 | CHK=1 행 일괄 IO_FLAG 적용 (E-001) |
| 셀 편집 | COL_ID/COL_NM(text) / IO_FLAG·MASTER_CODE_DIV·COL_TYPE(combo) / COL_LEN·COL_PREC_LEN(mask) / CHK(checkbox) |

---

## 6. 입력값 검증 규칙

> 분석 §5.2 (V-NNN) 인용.

### 6.1 필드별 검증

| 규칙ID | 대상 필드 (`DB 컬럼명 (필드ID)`) | 검증 내용 | 에러 메시지 |
|---|---|---|---|
| V-001 | IO_FLAG (G-004) | IN 조건 컬럼 1개 이상 존재 | "IN 조건을 포함한 컬럼이 없습니다. 확인해주세요." |
| V-002 | IO_FLAG (G-004) | OUT 조건 컬럼 1개 이상 존재 | "OUT 조건을 포함한 컬럼이 없습니다. 확인해주세요." |
| V-003 | COL_NM (G-002) | 행별 한글항목명 필수 | "한글항목명을 입력해 주십시오." |
| V-004 | COL_ID (G-001) | 행별 영문항목명 필수 | "영문항목명을 입력해 주십시오." |
| V-005 | MASTER_CODE_DIV (G-005) | 행별 코드여부 필수 | "코드여부를 선택해 주십시오." |
| V-006 | COL_TYPE (G-006) | 행별 유형 필수 | "유형을 선택해 주십시오." |
| V-007 | COL_LEN (G-007) | 행별 총길이 필수 | "총길이를 입력해 주십시오." |

### 6.2 연관 검증 (여러 필드 조합)

| 규칙ID | 조건 | 에러 메시지 |
|---|---|---|
| XV-001 | 저장 확인 (confirm) | "저장하시면 기존에 있던 컬럼정보들은 모두 삭제됩니다.\n저장하시겠습니까?" |

### 6.3 검증 실행 순서

```
[등록] 클릭
  → 1단계: IN/OUT 존재 (V-001, V-002)
  → 2단계: 행별 필수값 (V-003 COL_NM → V-004 COL_ID → V-005 MASTER_CODE_DIV → V-006 COL_TYPE → V-007 COL_LEN)
  → 3단계: 저장 확인 (XV-001 confirm)
  → 확인 → save 트랜잭션 요청
  → 실패 → 첫 번째 에러 행/셀로 포커스 이동 + 에러 메시지 표시
```

---

## 7. 상태 정의 및 상태별 제어

### 7.1 상태 정의

해당 없음 (분석 §9.1 ST-NNN 없음 — 본 화면은 상태 enum 미보유. IO_FLAG/MASTER_CODE_DIV/COL_TYPE 는 코드값 LV-NNN 으로만 처리).

| 상태코드 | 한글명 | 설명 | 단순 표시값/동작 제어값 | 수정 가능 | 삭제 가능 |
|---|---|---|---|---|---|
| (해당 없음) | - | - | - | - | - |

### 7.2 상태 전이 규칙

```
(해당 없음 — 상태 전이 없음)
```

### 7.3 상태별 필드 편집 가능 여부

| 필드 (`DB 컬럼명 (화면 표시명)`) | 신규 |
|---|---|
| (해당 없음 — 모든 그리드 셀 항상 편집 가능) | - |

### 7.4 상태별 버튼 활성/비활성

| 버튼 | 항상 |
|---|---|
| (해당 없음 — B-001~003 항상 활성) | - |

---

## 8. 권한 정의

| 기능 | ADMIN | MANAGER | USER | 비고 |
|---|---|---|---|---|
| 조회 | O | O | O | onload 자동 search |
| 신규등록 | O | O | △ | 외부 권한 프로세스 위임 (전사 정책) |
| 수정 | O | O | △ | save = 전체 재등록 |
| 삭제 | O | O | △ | save 내부 DELETE (개별 삭제 버튼 없음) |
| 상태 변경 | - | - | - | 해당 없음 |

---

## 9. 연동 화면 / 팝업

> 분석 §1 (부모 호출) / §4.1 인용. 본 화면은 호출 대상(팝업).

| 팝업ID | 대상 | 호출 방식 | 트리거 | 주고받는 데이터 |
|---|---|---|---|---|
| P-001 | (부모) MasterRuleFrame → 본 팝업 | gfn_openPopup("modal",...) | 부모 btn_ruleCol 클릭 | 입력 `{ sRuleId, sRuleNm }` / 반환 없음 (부모 콜백 = fn_search) |

---

## 10. 기타 열거형 (LoV)

> 분석 §10 인용.

| 열거형 (DB 컬럼) | 코드값 | 화면 표시명 | 설명 |
|---|---|---|---|
| IO_FLAG (LV-003) | (공백) / IN / OUT | 선택 / IN / OUT | ds_inOut |
| MASTER_CODE_DIV (LV-001) | N / Y | N / Y | ds_div |
| COL_TYPE (LV-002) | DATE / NUMBER / VARCHAR2 | DATE / NUMBER / VARCHAR2 | ds_colType |

---

## 11. 특이사항 / 설계 결정

### 11.1 [확인필요] 인용 (분석리포트 §13 그대로)

| 분석리포트 §13 ID | 항목 | 영향도 (높음/중간/낮음) | 후속 조치 | 상태 (open/resolved/wontfix) |
|---|---|---|---|---|
| Q-001 | TB_MCA_RULE_COL_LIST To-Be 정본 | 높음 | DMES-SECTION-MCA sheet134 등재 확인 + 형제 masterRuleFrame §7 Entity `MasterRuleColList` 정합 (분석 §7.2) | resolved |
| Q-002 | save 반환 dataset 불일치 | 낮음 | 개발 시 반환 형식 `{ savedCount }` 표준화 | **확정 (As-Is 보존 + cnt 표준화 — 사용자 2026-06-04)** |

### 11.2 검토한 대안 (있는 경우만)

| 대안 | 장점 | 단점 | 채택 여부 (○/×) | 사유 |
|---|---|---|---|---|
| save 시 개별 행 INSERT/UPDATE/DELETE (rowStatus 기반) | 변경분만 처리 | As-Is(전체 DELETE+INSERT)와 동작 불일치 | × | As-Is 1:1 보존 (XV-001 "모두 삭제" 메시지 그대로) |
