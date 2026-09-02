# Part B. 스펙 템플릿 (templates 정본 참조)

> 상위 문서: [{CLIENT} MES BPMN 프로세스 설계 표준 가이드](../04_백단_BPMN_기능설계_가이드.md)


> **(MUST)** BPMN설계서 산출물의 양식 정본은 [`templates/BPMN설계서.template.md`](../templates/BPMN설계서.template.md) 이다 (단일 정본 — 본 가이드 본문에 양식 중복 금지). Agent 는 `{화면식별자}_BPMN설계서.md` 를 작성할 때 본 정본 템플릿을 복사하여 frontmatter 6 필드를 채우고, 분석리포트 §11 (C1~C6 자동 판정) / §5 (As-Is 메서드 매핑) / 기능설계서 §5 (B-NNN) 를 인용한다.

> 절 순서 / 표 헤더 / "해당 없음" 유지 / frontmatter 6 필드 변경 금지 (MUST). §2 액션별 ASCII 흐름도 / §6.2 검토한 대안 사유 1~3 문장 외 자유 단락 / 임의 산문 금지.

> API URL / OASIS / Phase 7 규칙 정본은 본 가이드 §A.2-3. C1~C6 판정 기준 정본은 본 가이드 §A.2-3-2. (MUST NOT) Agent 자체 추론으로 자동 판정 결과 뒤집기 금지 — 정합체크서 §D 가 ✗ 로 차단.

> BPMN설계서가 신규 부여하는 식별자는 `API-NNN` 만 (MUST). B-NNN / S-NNN / D-NNN / L-NNN / V-NNN / P-NNN 은 기능설계서 정의 그대로 인용. 정본은 01 A.4.8 참조.

---


# Part C. Quick Sample — 주문등록 (orderRegistration)

## C.0. 시나리오
- 화면: **주문등록 (orderRegistration)** — 마스터-디테일 + 상태 워크플로우 (FE 페이지 유형 **C**). MES 명명 룰 (02 §A.2-1): `screenId = pageId = serviceId = orderRegistration` 단일 토큰.
- BackEnd: serviceId `orderRegistration` / Bean명 `orderRegistrationService` / moduleId `mls` / BFF→BE URL `POST /oasis/orderRegistration/{action}` / UI→BFF URL `POST /api/mls/oasis/orderRegistration/{action}`
- Frontend 연계: mesModule `m-mls` / `screenId = pageId = serviceId = orderRegistration` / 페이지 유형 `C`

## C.1. §1 표기 컨벤션 (필수 박스)
> DB/테이블: 대문자 SNAKE_CASE (`ORDER_NO`, `ORDERS`) | API JSON: camelCase (`orderNo`) | 바인드: `:DATE_FROM` | 코드값(`WAIT`) → 명칭(`대기`) 변환

## C.2. §1.1 API 엔드포인트 총괄

moduleId `mls` / serviceId `orderRegistration` 기준. Frontend 는 `apiRequest("/api/mls/oasis/orderRegistration/{action}", ...)` 로 호출 → portal BFF 가 BE 의 `POST /oasis/orderRegistration/{action}` (cactus `OasisController` 단일 매핑) 으로 프록시. 모든 Method 는 POST. 표 의 URL 은 BFF→BE (WAS 수신) 경로 기준.

| API-ID | Method | URL (BFF→BE) | 설명 | action | FE `{screenId}-api.ts` 함수 | 트리거 |
|---|---|---|---|---|---|---|
| API-001 | POST | /oasis/orderRegistration/search | 주문 목록 조회 | `search` | `searchOrders(req)` | B-001 [조회] |
| API-002 | POST | /oasis/orderRegistration/read | 주문 상세 조회 | `read` | `getOrder(req)` (body: `{ orderId }`) | 그리드 행 클릭 |
| API-003 | POST | /oasis/orderRegistration/save | 주문 저장 (신규/수정/삭제 통합, rowStatus) | `save` | `saveOrders(payload)` (body: `{ master: [...rowStatus...] }`) | B-004 [저장] / B-005 [삭제] |
| API-004 | POST | /oasis/orderRegistration/changeStatus | 주문 상태 변경 | `changeStatus` | `changeOrderStatus(body)` | B-006 [확정] / B-007 [취소] |
| API-005 | POST | /oasis/customer/search | 고객사 목록 (별도 화면·별도 serviceId) | `search` | `searchCustomers()` | 화면 초기 로드 |

## C.3. §2.4 신규 등록 프로세스 발췌

```
[신규] → 상세 초기화 (ORDER_DATE=오늘, ORDER_TYPE='MTO', MANAGER_NAME=로그인사용자)
  ▼
[사용자 입력] (고객사/품목 팝업, 수량×단가=금액)
  ▼
[저장] → 프론트 검증 → POST /oasis/orderRegistration/save (API-003)  ← body: { master: [{ ..., rowStatus: "C" }] }
  ▼ Request Body:
  {
    "orderDate": "2026-04-21",
    "customerCode": "C001",
    "dueDate": "2026-05-10",
    "orderType": "MTO",
    "managerName": "홍길동",
    "remark": "...",
    "items": [{ "productCode": "P001", "quantity": 100, "unitPrice": 15000, "drawingNo": "..." }]
  }
  ▼ 서버:
  1. 유효성 검증 (필수값, 고객사/품목 존재, MTO 납기 규칙, 벨로우즈 도면번호)
  2. 주문번호 채번 (ORD-YYYYMMDD-NNN)
  3. ORDERS INSERT (ORDER_STATUS='WAIT') / ORDER_ITEMS INSERT / TOTAL_AMOUNT 계산
  ▼
  ├─ 201: { orderId: 123, orderNo: "ORD-20260421-003" } / "저장되었습니다" / 재조회 / 자동 선택
  ├─ 400 fieldErrors: 필드별 에러
  ├─ 409: "잠시 후 다시 시도"
  └─ 422: 서버 반환 메시지
```

## C.4. §2.7 상태 변경 프로세스 (확정) 발췌

```
[확정 버튼 클릭] (WAIT → CONF)
    ▼
P-004 확인 다이얼로그
    ▼
POST /oasis/orderRegistration/changeStatus (API-004)
    │ Request: { "orderStatus": "CONF" }
    ▼
서버:
    ├ 1. 전이 허용 확인 (WAIT → CONF)
    ├ 2. ORDERS.ORDER_STATUS = 'CONF'
    └ 3. 부수 효과: DEMAND 생성 (APS) ★
        - DEMAND.ORDER_ID / DEMAND.PRODUCT_CODE / DEMAND.QUANTITY / DEMAND.DUE_DATE
    ▼
응답:
    ├─ 200: "주문이 확정되었습니다" + 상세 재조회
    ├─ 400: "현재 상태에서 확정할 수 없습니다"
    └─ 500: "서버 오류가 발생했습니다"
```

## C.5. §4.1 상태 전이 부수 효과

| 상태 전이 | 부수 효과 | 대상 모듈 |
|---|---|---|
| WAIT → CONF | DEMAND 생성 | APS |
| CONF → WAIT | DEMAND 삭제 | APS |
| CONF → CANCEL | DEMAND 삭제 | APS |
| PROC → CANCEL | DEMAND 삭제 + 재고 해제 | APS, 재고 |

## C.6. §4.2 참조 무결성

| 관계 | 제약 | 위반 시 |
|---|---|---|
| ORDERS → 거래처 마스터 | CUSTOMER_CODE 존재 | 저장 시 400 |
| ORDER_ITEMS → 품목 마스터 | PRODUCT_CODE 존재 | 저장 시 400 |
| ORDERS 삭제 → DEMAND 참조 | CONF 이상 참조 가능 | WAIT만 삭제 가능 |

## C.7. §A.9 일치 키 검증 (본 샘플)

| 일치 키 | 값 |
|---|---|
| screenId / pageId / serviceId | `orderRegistration` (MES — 단일 토큰) |
| 파일명 | `orderRegistration.bpmn` |
| process id | `orderRegistration` |
| Bean명 | `orderRegistrationService` |
| method | `search`, `save`, `delete`, `changeStatus` |
| DTO | `OrderRegistrationSearchRequest`, `OrderRegistrationResponse` |
| action | `search`, `save`, `delete`, `changeStatus` |
