---
screenId: {화면식별자}
asIsId: {As-Is 코드}
moduleId: {moduleId}
moduleGroup: {moduleGroup}
작성일: YYYY-MM-DD
작성자: Agent
---

<!--
  본 템플릿은 BPMN설계서 산출물의 정본 양식이다 (단일 정본 — 가이드 본문에 본 표 양식 중복 금지).
  Agent 는 본 템플릿의 절 순서 / 표 헤더 / "해당 없음" 유지 / frontmatter 6 필드를 변경할 수 없다 (MUST).
  자유 서술은 §2 액션별 ASCII 흐름도 (코드 블록 내) / §6.2 검토한 대안 사유 1~3 문장만 허용. 자유 단락 / 임의 산문 금지.
  (MUST) C1~C6 자동 판정 결과는 04 §A.2-3-2 정본 그대로 적용 — 자체 추론으로 뒤집기 금지 (MUST NOT). 자체 추론 시 정합체크서 §D 가 ✗ 로 차단.
-->

# {모듈명} — {화면명} BPMN설계서

> **BackEnd / BPMN 측 확정 값**:
> - 프로세스 ID: {화면식별자} (= serviceId)
> - Bean명: `{serviceId}Service`
> - moduleId / serviceId / API URL 정본: 04 §A.2-3
> - UI→BFF: `POST /api/{moduleId}/oasis/{serviceId}/{action}`
> - BFF→BE: `POST /oasis/{serviceId}/{action}`
>
> **명명 룰 (사용자 결정 사항)**:
> - **MES (mls / mqc / mpp 등)**: serviceId = screenId = pageId = pageName = `{화면명}` camelCase (4 식별자 1byte 동일). 예: `plateSlittingMgmt`
> - **APS 예외 (mpn 한정)**: pageName = kebab-case, Frontend 파일명 = `{pageName}-page.tsx`. serviceId 는 MES/APS 공통 camelCase.
> - 정본: 정합체크서 §B (MES 단일 룰 + APS 예외 분리)
>
> **Frontend 연계 값** (기능설계서 §1.2 와 동일):
> - mesModule / pageId / 페이지 유형

---

## 1. 프로세스 개요

> **표기 컨벤션**:
> - DB 컬럼명 / 테이블명: SNAKE_CASE
> - API JSON 필드: camelCase
> - DB ↔ DTO 매핑은 API 계층에서 (예: `SELECT ORDER_NO` → `{ "orderNo": ... }`)

### 1.1 API 엔드포인트 총괄

<!--
  R-12: 분석리포트 §11 (C1~C6) + 기능설계서 §5 (B-NNN / GB-NNN) 인용. 자체 추론 ✗.
  알고리즘 (00 §6.4.7-1 T3-D 라우팅 enum 본문 직접 박힘):
  - 충족 0~1 → 범용 actionGateway (단일 OASIS): `POST /api/{moduleId}/oasis/{serviceId}/{action}` (UI→BFF) / `POST /oasis/{serviceId}/{action}` (BFF→BE)
  - 충족 2~3 → 잠정 OASIS + Q-NNN
  - 충족 ≥4 → Phase 7 분리 (MUST): `POST /api/{moduleId}/{phase7-type}/{queryId | serviceId | lovId}`

  셀별 규칙:
  - Method: POST 고정 (1 enum)
  - URL: T3-D 라우팅 enum 그대로
  - action: 기능 §5 의 7 enum (search / save / delete / changeStatus / popup / link / export)
  - 트리거: 기능 §5 의 B-NNN / GB-NNN ID 인용

  매핑 사례 (Tier 6):
  - C1~C6 6/6 충족 → Phase 7 분리: API-001 search / `POST /api/mpp/query/{queryId}` / B-001 / 조회
  - C1~C6 0/6 충족 → 범용 OASIS: API-001 search / `POST /oasis/workReport/search` / B-001 / 조회
  - 외부 SP 호출 (C6) + 채택 Phase 7 → API-002 cancelResult / `POST /api/mpp/service/{serviceId}` / B-005 / 작업실적삭제
-->

| API-ID | Method (POST 고정) | URL (T3-D enum) | 설명 | action (7 enum) | 트리거 (B-NNN / GB-NNN 인용) |
|---|---|---|---|---|---|
| <!-- 예시 (workReport — Phase 7) --> |
| API-001 | POST | `POST /api/mpp/query/sList` | 메인 그리드 조회 | search | B-001 |
| API-002 | POST | `POST /api/mpp/service/cancelResult` | 작업실적 취소 (외부 SP) | changeStatus | B-005 |
| <!-- 본 화면 --> |
| API-001 |  |  |  |  |  |

### 1.2 API 패턴 자동 판정 결과 (분석리포트 §11 인용 — 04 §A.2-3-2 채택 표 직접 박힘)

<!--
  정본: 04 §A.2-3-2. (MUST NOT) Agent 자체 추론으로 결과 뒤집기 금지.
  04 §A.2-3-2 채택 표 본문 직접 박힘:

  | 충족 개수 | 채택 패턴 | API 라우팅 | Q-NNN |
  |---:|---|---|---|
  | 0 | OASIS 단일 BPMN (자동) | POST /oasis/{serviceId}/{action} | ✗ |
  | 1 | OASIS 단일 BPMN (자동) | 동일 | ✗ |
  | 2 | 잠정 OASIS (Phase 7 후보) | 동일 | Q-NNN 등재 |
  | 3 | 잠정 OASIS (Phase 7 후보) | 동일 | Q-NNN 등재 |
  | 4 | Phase 7 분리 (MUST) | POST /api/{moduleId}/{phase7-type}/{ID} | ✗ |
  | 5 | Phase 7 분리 (MUST) | 동일 | ✗ |
  | 6 | Phase 7 분리 (MUST) | 동일 | ✗ |
-->

| 항목 | 값 |
|---|---|
| C1~C6 충족 개수 (분석 §11.1 인용) |  |
| 채택 패턴 (3 enum: OASIS / 잠정 OASIS / Phase 7) |  |
| API 라우팅 enum (T3-D 결과) |  |
| Q-NNN 등재 여부 (충족 2~3 일 때만 Y) |  |

---

## 2. 프로세스별 BPMN 상세

<!-- 분석리포트 §5 As-Is 메서드 매핑 + 기능설계서 §5 버튼 (B-NNN) 인용. 액션 = 분석리포트 §4.5 B-NNN 의 트리거. 자체 추가 액션 금지. -->

### 2.1 화면 초기화 프로세스

```
[화면 진입]
    │
    ├──→ (병렬) POST /oasis/{serviceId}/search (API-xxx)
    │         │
    │         └─→ 성공: ...
    │             실패: ...
    │
    ├──→ (병렬) 조회조건 기본값 세팅
    │
    └──→ 두 작업 완료 후
              │
              └─→ IF 자동조회=true
                    └─→ [조회 프로세스] 자동 실행 (§2.2)
```

### 2.2 조회 프로세스 (B-001: 조회 버튼)

```
[조회 버튼 클릭] 또는 [Enter 키]
    │
    ▼
화면: 로딩 시작
    │
    ▼
POST /oasis/{serviceId}/search (API-001)
    │
    ▼
서버 처리: SELECT / WHERE / ORDER BY / LIMIT
    ▼
응답:
    ├─→ 200 성공: 그리드 표시 / 페이징 갱신 / 0건 처리
    ├─→ 400: "검색 조건이 올바르지 않습니다"
    └─→ 500: "서버 오류가 발생했습니다"
```

### 2.3 상세 조회 프로세스 (그리드 행 클릭)

```
[그리드 행 클릭]
    ▼
IF isDirty=true → 확인 다이얼로그
    ▼
POST /oasis/{serviceId}/read (API-002)
    ▼
서버 처리: 헤더 / 라인 / JOIN
    ▼
응답:
    ├─→ 200: 상세 표시 / 상태별 편집 (기능 §7.3)
    └─→ 404: "해당 데이터를 찾을 수 없습니다" + 목록 재조회
```

### 2.4 신규 등록 프로세스 (B-NNN → 저장)

```
[신규 버튼 클릭]
    ▼
IF isDirty=true → 확인
    ▼
화면: 상세 초기화 / 기본값 / 모든 필드 편집 가능
    ▼
[저장 버튼] → 프론트 유효성 검증 (기능 §6)
    ▼
POST /oasis/{serviceId}/save (API-003)  ← rowStatus='C'
    │ Request Body: { camelCase JSON }
    ▼
서버: 검증 → 채번 → INSERT
    ▼
응답:
    ├─→ 201: 토스트 / 재조회 / 자동 선택
    ├─→ 400: fieldErrors → 필드 에러 표시
    ├─→ 409: "잠시 후 다시 시도"
    └─→ 422: 서버 반환 메시지
```

### 2.5 수정 프로세스 (행 더블클릭 → 저장)

```
[그리드 행 더블클릭]
    ▼
상세 조회 (§2.3) → 상태별 편집 (기능 §7.3)
    ▼
[저장 버튼] → 프론트 유효성 검증
    ▼
POST /oasis/{serviceId}/save (API-004)  ← rowStatus='U' + updatedAt
    ▼
서버:
    ├─→ 1. DB.UPDATED_AT ≠ 요청.updatedAt → 409
    ├─→ 2. 상태별 수정 가능 필드 검증 → 400
    ├─→ 3. 유효성 + 비즈니스 규칙
    ├─→ 4. UPDATE + UPDATED_AT 갱신
    ▼
응답:
    ├─→ 200: 토스트 / 재조회
    ├─→ 409: 동시 수정 다이얼로그 → 재조회 or 유지
    └─→ 400/422: 에러 표시
```

### 2.6 삭제 프로세스 (B-NNN)

```
[삭제 버튼 클릭]
    ▼
IF 선택 없음 → 중단
IF 상태 ≠ 삭제 가능 → 토스트 중단
    ▼
확인 다이얼로그
    ▼
POST /oasis/{serviceId}/save (API-005)  ← rowStatus='D'
    ▼
서버: 상태 재확인 → 참조 데이터 확인 (있으면 422) → 삭제
    ▼
응답:
    ├─→ 200: 토스트 / 재조회
    └─→ 422: 서버 반환 에러
```

### 2.7 상태 변경 프로세스 (확정/취소 등)

```
[{확정} 버튼] ({FROM} → {TO})
    ▼
확인 다이얼로그
    ▼
POST /oasis/{serviceId}/changeStatus (API-006)
    │ Request Body: { "status": "{TO}" }
    ▼
서버: 전이 허용 확인 → 상태 변경 → 부수 효과 (§4.1)
    ▼
응답:
    ├─→ 200: 토스트 / 상세 재조회
    └─→ 400/422: 전이 불가 메시지
```

---

## 3. 에러 처리 매트릭스

<!-- 4 컬럼 고정 (HTTP 상태 / 에러 코드 / 화면 처리 / 사용자 메시지). -->

| HTTP 상태 | 에러 코드 | 화면 처리 | 사용자 메시지 |
|---|---|---|---|
| 400 | VALIDATION_ERROR | fieldErrors → 필드 에러 표시 | 필드별 에러 메시지 |
| 400 | BAD_REQUEST | 토스트 (error) | 서버 반환 message |
| 401 | UNAUTHORIZED | 로그인 페이지 리다이렉트 | - |
| 403 | FORBIDDEN | 토스트 (error) | "권한이 없습니다" |
| 404 | NOT_FOUND | 토스트 (warning) + 목록 재조회 | "해당 데이터가 존재하지 않습니다" |
| 409 | CONFLICT | 동시 수정 다이얼로그 | "다른 사용자가 이미 수정했습니다" |
| 422 | BUSINESS_RULE_VIOLATION | 토스트 / 다이얼로그 | 서버 반환 message |
| 500 | INTERNAL_ERROR | 토스트 (error) | "서버 오류가 발생했습니다" |
| timeout | - | 로딩 해제 + 토스트 | "요청 시간이 초과되었습니다" |
| network | - | 로딩 해제 + 토스트 | "네트워크 연결을 확인해주세요" |

---

## 4. 데이터 연동 및 부수 효과

### 4.1 상태 변경 시 부수 효과

| 상태 전이 | 부수 효과 | 대상 모듈 | 설명 |
|---|---|---|---|
|  |  |  |  |

### 4.2 참조 무결성

| 관계 | 제약 | 위반 시 |
|---|---|---|
|  |  |  |

### 4.3 동시 수정 방지

```
수정/삭제 요청 시:
  - API Request 에 updatedAt 포함
  - 서버: DB.UPDATED_AT 과 비교
  - 불일치 시 409 Conflict
  - 화면: 재조회 유도
```

### 4.4 트랜잭션 경계

| 액션 | 트랜잭션 범위 | 비고 |
|---|---|---|
|  |  |  |

---

## 5. 화면 생명주기

<!-- (MUST) 4 컬럼 고정 (단계 / 이벤트 / 동작 / 호출 액션). 자유 서술 금지. -->

| 단계 | 이벤트 | 동작 | 호출 액션 |
|---|---|---|---|
| onMount | 화면 진입 |  |  |
| onUnmount | 화면 이탈 (메뉴 이동 / 뒤로가기) | IF isDirty=true: "저장하지 않은 변경사항" 확인 → 확인 시 이동 / 취소 시 유지<br/>ELSE: 바로 이동 |  |
| onBeforeUnload | 브라우저 새로고침 / 닫기 | IF isDirty=true: 브라우저 기본 확인 다이얼로그 |  |

---

## 6. 특이사항 / 설계 결정

<!-- 분석리포트 §13 (Q-NNN 의 BPMN 관련 항목) 그대로 인용 — 자체 추가 금지. -->

### 6.1 [확인필요] 인용 (분석리포트 §13 의 BPMN 관련만)

| 분석리포트 §13 ID | 항목 | 분류 | 영향도 (높음/중간/낮음) | 결정 | 근거 | 상태 (open/resolved/wontfix) |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

### 6.2 검토한 대안 (있는 경우만)

<!-- 1~3 문장 사유는 표 안에 작성. 자유 단락 금지. -->

| 대안 | 장점 | 단점 | 채택 여부 (○/×) | 사유 |
|---|---|---|---|---|
|  |  |  |  |  |
