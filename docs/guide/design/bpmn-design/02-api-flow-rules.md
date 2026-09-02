# {CLIENT} MES BPMN 프로세스 설계 표준 가이드

> 상위 문서: [{CLIENT} MES BPMN 프로세스 설계 표준 가이드](../04_백단_BPMN_기능설계_가이드.md)

## A.3. 표준 구조

### A.3-1. BPMN설계서 섹션 구성 (순서 고정)

| 섹션 | 제목 | 필수 여부 |
|---|---|---|
| §1 | 프로세스 개요 (+ 표기 컨벤션 박스 + API 엔드포인트 총괄) | MUST |
| §2 | 프로세스별 BPMN 상세 | MUST |
| §3 | 에러 처리 매트릭스 | MUST |
| §4 | 데이터 연동 및 부수 효과 | MUST |
| §5 | 화면 생명주기 | SHOULD |
| §6 | 특이사항 / 설계 결정 | MUST |

### A.3-2. 프로세스 필수 흐름
해당 화면에 적용되는 흐름은 모두 §2에 포함한다. (MUST, 없으면 "해당 없음" 명시)

| 프로세스 | 트리거 | 비고 |
|---|---|---|
| 화면 초기화 | 화면 진입 | 기본값/코드마스터/권한 로드 |
| 조회 | [조회] 클릭, Enter | A-FILTER 화면에서 MUST |
| **통합 조회 (다단 그리드)** | [조회] 1회 | 다단 그리드형 화면에서 MUST — 단일 API로 여러 그리드 응답 |
| 상세 조회 | 그리드 행 클릭 | A-DETAIL 있는 화면에서 MUST |
| 신규 등록 | [신규] + [저장] | 등록 가능 화면에서 MUST |
| 수정 | 더블클릭 + [저장] | 수정 가능 화면에서 MUST |
| **일괄 저장 (그리드 인라인)** | [저장] 1회 | 그리드 인라인 편집 화면에서 MUST — 다중 행 1 트랜잭션 |
| 삭제 | [삭제] | 삭제 가능 화면에서 MUST |
| 상태 변경 | [확정]/[취소] 등 | 상태 전이 있는 화면에서 MUST |
| **계층별 상태 변경** | 계층별 전용 버튼 | **다계층 상태 체계** 화면에서 MUST — 계층별 별도 API |
| **분할/합치기** | [분할]/[병합] | 업무상 분할·통합이 있는 화면 |
| **업무 특화 연계 조회** | [이력조회]/[연관자재]/[QP조회] 등 | 업무 특화 버튼 다수 화면에서 MUST — 버튼당 별도 GET API |
| **업무 특화 연계 편집 이동** | [성적서관리]/[부적합내역] | 별도 화면 이동 — 트리거/이동 URL 명시 |

---

## A.4. 핵심 선택 기준

### A.4-1. 액션 분리 기준 (v2 표준 URL 기반)

모든 URL 은 `POST /oasis/{serviceId}/{action}` 형식. action 만으로 동작을 구분. **MES 의 `serviceId` = `screenId` = `{화면명}`** 단일 토큰.

| 상황 | 기본 action | URL 예시 (MES) |
|---|---|---|
| 조회 (목록/검색) | `search` | `POST /oasis/inspectionResult/search` |
| 단건 조회 | `read` | `POST /oasis/inspectionResult/read` |
| 저장 (신규/수정/삭제 통합, rowStatus 로 구분) | `save` | `POST /oasis/inspectionResult/save` |
| 상태 변경 (단일 계층) | `changeStatus` | `POST /oasis/inspectionResult/changeStatus` |
| **다계층 상태** | 계층별 **각각** `change{LayerName}` | `POST /oasis/inspectionResult/changeInspectionStatus`, `.../changeProgress`, `.../changeJudgment` |
| 마스터-디테일 저장 | `save` (body: `{ master, detail }`) | `POST /oasis/orderRegistration/save` |
| **다단 그리드 통합 조회** | `search` → Response 를 그리드별로 **분리 응답** | `POST /oasis/inspectionResult/search` → `{ top, bottom }` |
| **분할** | `split` / `merge` | `POST /oasis/inspectionResult/split` |
| **업무 특화 연계 조회** | `search{SubResource}` | `POST /oasis/inspectionResult/searchHoldLogs`, `/searchNonconformities` |
| **업무 특화 연계 편집** | `save{SubResource}` / `create{SubResource}` | `POST /oasis/orderRegistration/saveNote`, `POST /oasis/inspectionResult/createNonconformity` |
| 완료실적 취소 등 부가 동작 | `{verb}{Object}` (동사 camelCase) | `POST /oasis/workReport/cancelResult` |
| 파일 업로드 | `uploadFile` | `POST /oasis/inspectionResult/uploadFile` |

> **MUST**: 모든 URL 이 `POST` (BE v2 §3). GET/PUT/PATCH/DELETE 사용 금지.
> **MUST**: 같은 `serviceId` 아래의 여러 action 은 **같은 BPMN 파일의 actionGateway 분기** 로 구현 (BE v2 Part B §6-1).
> **MUST**: 다계층 상태는 **계층별 action 분리** — 각 계층의 전이 규칙/권한/부수효과가 독립적.

### A.4-1-1. 다계층 상태 API 설계 패턴 (MUST)

기능설계서 §A.8-7-1 다계층 상태가 있는 화면은 아래 규칙을 따른다.

**계층별 별도 action (같은 serviceId — MES 예시)**:
```
POST /oasis/inspectionResult/changeInspectionStatus   ← 계층 1 (전체 프로세스)
POST /oasis/inspectionResult/changeProgress           ← 계층 2 (진행 상태)
POST /oasis/inspectionResult/changeJudgment           ← 계층 3 (판정·판정상태)
```

- 모두 **같은 BPMN 파일** (`inspectionResult.bpmn`) 의 **actionGateway 분기**로 구현.
- 각 action 의 **Request Body 는 해당 계층 전용 필드만** 포함. (MUST)
- 각 action 별 **권한/검증 규칙/부수효과**를 §2 에 명시. (MUST)
- 계층 간 자동 연동(예: 계층3 확정 시 계층1 자동 전환)은 **§4.1 부수 효과** 에 표기. (MUST)

### A.4-1-2. 통합 조회 API 설계 패턴 (MUST, 다단 그리드 화면)

```
POST /oasis/{serviceId}/search
Response:
{
  "top": { "totalCount": N, "list": [...] },
  "bottom": { "totalCount": M, "list": [...] }
}
```

- 단일 DB 쿼리로 조회 후 서버에서 **구분 필드**(예: 상태코드) 기준 분리. (MUST)
- 그리드별 별도 API 호출 **금지** (MUST NOT) — 일관된 필터링/성능 확보.
- 2개 그리드 기준 `top/bottom` 키. 3단 이상은 `waiting/inProgress/completed` 등 의미 키. (SHOULD)
- 그리드별 페이징이 필요하면 각 그리드 응답 내 `pagination` 객체 포함. (MAY)

### A.4-1-3. 일괄 저장 API 설계 패턴 (MUST, 그리드 인라인 편집 화면)

Frontend 는 `useGridDataManager` 의 `SavePayload = { inserted, updated, deleted }` 를 `{name}-api.ts` 에서 **v2 §10-3 최상위 키 `master` (또는 `master`+`detail`) 로 변환하여 전송** 한다. BPMN 설계서의 Request Body 는 **변환 후 shape** 로 기술한다.

**단일 Grid 저장 (유형 C)** — 최상위 키 `master` 고정 (FE v2 §10-3):

```
POST /oasis/{serviceId}/save
Request Body:
{
  "master": [
    { "id": 101, "updatedAt": "...", "fieldA": "...", ..., "rowStatus": "C" },   ← 신규
    { "id": 102, "updatedAt": "...", "fieldA": "...", ..., "rowStatus": "U" },   ← 수정
    { "id": 103,                                         "rowStatus": "D"  }    ← 삭제
  ]
}
```

**Master-Detail 저장 (유형 D)** — 최상위 키 `master` + `detail` 고정:

```
POST /oasis/{serviceId}/save
Request Body:
{
  "master": [ { "orderId": "O1", "rowStatus": "U" } ],
  "detail": [ { "orderId": "O1", "lineNo": 1, "qty": 10, "rowStatus": "C" } ]
}
```

- **3자 일치 (MUST)**: body 키 `master` = 그리드명 = BE 메서드 파라미터명 (`List<Map> master`).
- **MUST NOT**: 신규 API 에서 `items` / `rows` / `payload` 등 임의 키 사용. 레거시 예외는 FE v2 §10-3 예외 절 + 설계서 §11 에 근거 기록.
- **rowStatus 규약** (FE v2 §9-3): `C=Create`, `U=Update`, `D=Delete`. **변경 없는 행은 전송 제외** (`R` 명시 금지).
- **하나의 트랜잭션**으로 처리. 일부 성공/일부 실패 방지. (MUST)
- 각 행은 `updatedAt` 포함하여 **행별 동시 수정 체크**. (MUST)
- **금지 필드 (MUST NOT)**: `nativeeditor_status`, `_rowState` 등 Frontend `useGridDataManager` 내부 필드.

**에러 응답 — v2 §8-2 2레벨 shape** (MUST):

```json
{
  "meta":   { "success": false, "code": "E001", "message": "입력값을 확인해주세요." },
  "errors": [
    { "grid": "master", "rowKey": "P001", "rowIndex": 0,
      "field": "goodQty", "code": "E001",
      "message": "양품수량은 0 이상이어야 합니다" }
  ]
}
```

- `errors[].grid` 값은 **저장 body 최상위 키와 동일** (`master` / `detail`).
- 6필드 (`grid`, `rowKey`, `rowIndex`, `field`, `code`, `message`) 고정. 재매핑 금지. (FE v2 §8-4)

### A.4-1-4. 업무 특화 연계 조회 API 패턴 (MUST)

현재 선택 건의 **연관 데이터 읽기** 는 **같은 serviceId 의 search{SubResource} action** 으로 분리. Body 에 id 포함.

```
POST /oasis/inspectionResult/searchHoldLogs        Body: { "inspectionId": 123 }
POST /oasis/workReport/searchMaterials             Body: { "moNo": "MO-001" }
POST /oasis/inspectionResult/searchNonconformities Body: { "inspectionId": 123 }
POST /oasis/qualityPlan/search                     Body: { "productCode": "P001" }  ← 별도 serviceId (별도 화면)
```

- **같은 도메인 내 서브 조회**는 같은 serviceId + `search{SubResource}` action. (기본)
- **다른 도메인(=다른 화면) 리소스 조회**는 **별도 serviceId** 를 둔다. 별도 serviceId 도 동일하게 `{화면명}` 규약을 따른다 (예: `qualityPlan`, `certificate`).
- 편집이 있으면 `save{SubResource}` / `create{SubResource}` action 추가.

### A.4-2. 동시 수정 방지 선택
| 방식 | 적용 기준 |
|---|---|
| Optimistic Lock (updatedAt 체크) | 일반 업무 화면 (기본값) |
| Pessimistic Lock (DB Lock) | 재고/생산실적 등 정합성 중요 화면 |
| 없음 | 단순 조회 전용 |

### A.4-3. 부수 효과(Side Effect) 적용 여부
- 상태 전이가 **타 모듈 데이터(Demand, Inventory 등)** 에 영향 → §4 부수 효과 표에 반드시 등록. (MUST)
- 동일 모듈 내 컬럼 업데이트만 있음 → 부수 효과 표 등록 불필요. (MAY)

### A.4-4. 권한 체크 구조 (OASIS 연계)

{CLIENT} 의 API 권한(RBAC) 검증은 **3단 파이프라인**으로 이루어진다. BPMN 설계 단계에서 각 단계가 자동 처리하는 범위를 이해하고, 서비스 로직에서 보완해야 할 권한 검증만 설계서 §2 에 기술한다.

```
[브라우저] ─FE 경로(/api/{sg}/{sid}/{act})─▶ [portal middleware]
                                              │
                                              │ ① 인증(세션 쿠키) 검증
                                              │ ② RBAC 패턴 매칭 (portal-was 에서 로드)
                                              ▼
                                         [portal catch-all proxy]
                                              │
                                              │ ③ backendAccessToken 첨부 (Bearer)
                                              │ ④ WAS 경로로 재조합 후 전달
                                              ▼
          [모듈 WAS (mpp/mls/mqc ...)] ◀──────┘
              │
              │ ⑤ Cactus JwtAuthenticationFilter → 토큰 검증 (portal-was 와 동일 secret)
              │ ⑥ ClientKeyFilter → X-Client-Key 검증
              │ ⑦ BPMN actionGateway → Service Bean 메서드 dispatch
              ▼
          [서비스 로직] — ⑧ 업무 규칙 기반 권한 검증 (예: 본인 실적만 수정 허용)
```

**각 단계 책임 분담** (MUST 숙지):

| 단계 | 위치 | 담당 | 설계서 기술 여부 |
|---|---|---|---|
| ① 인증(세션) | portal middleware (`proxy.ts`) | NextAuth JWT 세션 쿠키 검증 | ❌ 인프라 |
| ② API 패턴 RBAC | portal middleware | `portal-was` 에서 role→API 패턴 로드 후 매칭. 없으면 403 | ❌ 인프라 |
| ③ 토큰 첨부 | portal catch-all (`oasis-proxy`) | NextAuth JWT 의 `backendAccessToken` 을 WAS 로 전달 | ❌ 인프라 |
| ④ URL 재조합 | portal catch-all | FE `/api/{sg}/{sid}/{act}` → WAS `/{sg}/api/{sid}/{act}` | ❌ 인프라 |
| ⑤ JWT 검증 | Cactus `JwtAuthenticationFilter` | portal-was 서명 토큰 검증 | ❌ 인프라 |
| ⑥ ClientKey | Cactus `ClientKeyFilter` | `X-Client-Key` 확인 | ❌ 인프라 |
| ⑦ dispatch | Cactus OASIS engine | BPMN actionGateway → Service Bean | ❌ 인프라 |
| ⑧ **업무 권한** | 각 Service Bean | 업무 규칙 기반 검증 (본인 데이터만 / 특정 상태에서만 / 공장별 등) | ✅ 설계서 §2 / §4 에 **명시 필수** |

**BPMN 설계서 §2 작성 규약** (MUST):
- 각 action 의 BPMN 상세 흐름에서 **⑧ 업무 권한** 에 해당하는 체크를 "선행 조건 / 권한 검증" 블록으로 기술.
- 예: `workReport/complete` — "작업자 본인 실적만 종료 가능. `sfc_oper_mast.worker_id = 세션 userId` 비교 후 불일치 시 403 반환"
- 인프라 단계(①~⑦) 는 BPMN 설계서에서 중복 기술하지 않는다 (본 §A.4-4 로 갈음).

**로컬 개발 환경 주의**:
- {CLIENT} 로컬에는 `portal-was` 가 없으므로 ②⑤ 가 정상 동작하지 않음.
- 로컬 테스트 시 임시로 다음 우회 수단 사용 (운영 영향 無):
  - portal `proxy.ts` 의 `AUTH_ONLY_API_PREFIXES` 에 `/api/{sg}/` 추가 → ② RBAC 우회
  - mpp 백엔드에 `application-local.yml` + `SecurityConfigLocal` 추가 → ⑤⑥ 우회 (자세한 내용은 로컬 개발 가이드 참조)
- **본 우회는 설계 산출물에 기술하지 않는다** — 로컬 개발 편의용이며 실제 운영 권한 흐름과 무관.

**MUST NOT**:
- 설계서 §2 에 인프라 단계(①~⑦) 의 동작을 중복 기술
- 서비스 메서드에서 ⑧ 업무 권한 체크를 누락 (⑤ JWT 만으로는 "로그인 여부" 만 검증됨)
- 로컬 개발 우회 수단(SecurityConfigLocal, AUTH_ONLY 임시 확장) 을 운영 환경에 반영

---

## A.5. 명명 규칙

### A.5-1. API ID 체계
- 형식: `API-NNN` (3자리 일련번호). (MUST)
- 번호는 §1.1 API 엔드포인트 총괄표 등록 순서. (MUST)

### A.5-2. 프로세스 제목
- 형식: `§2.N {프로세스명} (트리거: {버튼ID 또는 이벤트})` (MUST)
- 예: `§2.2 조회 프로세스 (B-001: 조회 버튼)`

### A.5-3. DB 테이블/컬럼 vs API JSON

> **(MUST)** DB SNAKE_CASE / API JSON camelCase 정본은 [01 A.4.9](../01_Agent부속_가이드.md) 참조 (단일 정본 — 본 가이드 본문 중복 금지). 본 절은 BPMN 바인드 변수 표기까지 확장.

| 계층 | 표기 |
|---|---|
| DB 테이블 | 대문자 SNAKE_CASE (`ORDERS`, `ORDER_ITEMS`) — 정본 01 A.4.9 |
| DB 컬럼 | 대문자 SNAKE_CASE (`ORDER_NO`, `ORDER_STATUS`) — 정본 01 A.4.9 |
| API JSON (Request/Response Body) | camelCase (`orderNo`, `orderStatus`) — 정본 01 A.4.9 |
| 바인드 변수 (MyBatis/JPQL) | `:DATE_FROM`, `:ORDER_ID` (BPMN 고유 표기) |

- §1 상단에 **표기 컨벤션 박스** 를 반드시 둔다. (MUST)


### A.5-4. BPMN 핵심 일치 규칙 6가지 (BE v2 Part B §3)

아래 6개 는 **MUST** 이며, BPMN 설계서 / BPMN XML / BackEnd Service / API URL 사이에서 완전히 일치해야 한다. **MES 한정 — 모든 6개가 `screenId` 와 동일한 단일 토큰을 공유한다.**

| # | 검증 항목 | BPMN 기준 | BackEnd 기준 | MES 예시 (screenId=`orderRegistration`) |
|---|---|---|---|---|
| 1 | **파일명** | `{serviceId}.bpmn` (= `{screenId}.bpmn`) | API URL 의 `serviceId` | `orderRegistration.bpmn` |
| 2 | **process id** | `<bpmn:process id="{serviceId}">` | BPMN 파일명(확장자 제외) | `<bpmn:process id="orderRegistration">` |
| 3 | **Bean 이름** | `camunda:class="beanName"` | `@Service("beanName")` | `orderRegistrationService` |
| 4 | **메서드명** | `property name="method"` | Service 메서드명 | `search` / `save` / `changeStatus` |
| 5 | **DTO** | `property name="dto"` | DTO FQCN | `OrderRegistrationSearchRequest` |
| 6 | **action 분기** | `conditionExpression` 값 | API URL 의 `action` | `search` / `save` |

**표준 URL** (§A.2-3 과 동일):

```
POST /oasis/{serviceId}/{action}
```

| URL 구성요소 | 규칙 | 예 (MES) | 예 (APS 예외) |
|---|---|---|---|
| `moduleId` (UI→BFF 에만 등장) | UI 모듈 prefix. BFF→BE 호출 시 제거된다 | `mls` | `mpn` |
| `serviceId` | 파일명 = `<process id>` = `screenId`. **MES: `{화면명}` 단일 camelCase**. APS 예외: kebab. | `orderRegistration` | `production-plan` |
| `action` | BPMN actionGateway 분기 (Service 가 직접 해석 안 함) | `search` / `save` | 동일 |

- **MUST (MES)**: `serviceId = screenId = pageId` — 단일 토큰 `{화면명}` (정본 02 §A.2-1). 복수형 (`orders`), 하이픈 (`work-report`), 짧은 별칭(`order` for `orderRegistration`) 금지.
- **MUST**: 새 `serviceId` 도입 시 BPMN 파일 선행 생성 (없으면 URL 라우팅 불가).
- **MUST**: `serviceId` 는 화면식별자(`screenId`)와 동일. 미등재 화면식별자 임의 확정 금지 (MUST NOT).

---
