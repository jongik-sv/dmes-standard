# Part C. Quick Sample — 주문등록 (orderRegistration)

> 상위 문서: [{CLIENT} MES 기능설계 표준 가이드](../02_화면_기능설계_가이드.md)


> Part A 규칙을 Part B 템플릿에 적용한 **실제 예시**. 처음 적용 시 본 샘플을 참고 패턴으로 활용한다. MES 명명 룰 (§A.2-1) 에 따라 `screenId = pageId = serviceId = orderRegistration` 단일 토큰.

## C.0. 시나리오
- 화면: **주문등록 (orderRegistration)**
- 영업팀이 고객사 주문을 등록/조회/확정/취소
- MTO 중심 + MTS 일부 지원
- 마스터-디테일 (헤더 + 품목 라인)
- 상태 워크플로우: WAIT → CONF → PROC → DONE / CANCEL

## C.1. 결정 사항
| 항목 | 값 |
|---|---|
| 화면 식별자 (`screenId = pageId = serviceId`) | `orderRegistration` |
| 화면명 | 주문등록 |
| 모듈 | 영업관리 (MLS) |
| 주 사용자 | 영업팀, 생산관리팀 |
| 화면 유형 | 상태 워크플로우 + 마스터-디테일 (§A.10) |

## C.2. §1 화면 개요

### C.2-1. 업무/설계 측면
| 화면명 | 주문등록 |
| 화면 식별자 | orderRegistration |
| 모듈 | 영업관리 (MLS) |
| 화면 목적 | 고객사 주문을 등록/조회/관리하고, 주문 확정 시 생산계획(APS) Demand를 생성한다. |
| 주요 사용자 | 영업팀, 생산관리팀 |
| 접근 경로 | 메뉴 > 주문관리 > 주문등록 |

### C.2-2. Frontend 개발 연계 값 (MES — `screenId = pageId = serviceId` 단일 토큰)
| mesModule | `m-mls` |
| moduleGroup | `order` |
| **screenId / pageId / serviceId** | `orderRegistration` (단일 camelCase, BPMN 파일명 `orderRegistration.bpmn` 과 동일) |
| 페이지 유형 | **C** (조회+저장) + 상태 워크플로우 혼합 — §A.10 "상태 워크플로우" 행 |
| moduleId | `mls` |
| Frontend 파일 | `src/frontend/m-mls/pages/order/orderRegistration.tsx` |
| 주요 API path (UI→BFF) | `POST /api/mls/oasis/orderRegistration/search`, `POST /api/mls/oasis/orderRegistration/save`, `POST /api/mls/oasis/orderRegistration/confirm`, `POST /api/mls/oasis/orderRegistration/cancel` |
| 주요 API path (BFF→BE) | `POST /oasis/orderRegistration/search`, `POST /oasis/orderRegistration/save`, `POST /oasis/orderRegistration/confirm`, `POST /oasis/orderRegistration/cancel` |
| tsup entry key | `pages/order/orderRegistration` |

## C.3. §3.1 조회조건 (S-NNN)
| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 |
|---|---|---|---|---|---|
| S-001 | ORDER_DATE | 주문일자(시작) | DatePicker | Y | 당월 1일 |
| S-002 | ORDER_DATE | 주문일자(종료) | DatePicker | Y | 오늘 |
| S-003 | CUSTOMER_CODE | 고객사 | 드롭다운 | N | 전체 |
| S-004 | ORDER_STATUS | 주문상태 | 드롭다운 | N | 전체 |
| S-005 | ORDER_NO | 주문번호 | 텍스트 | N | - |

## C.4. §3.2 조회 결과 (G-NNN)
| 컬럼ID | DB 컬럼명 | 화면 표시명 | 정렬 | 비고 |
|---|---|---|---|---|
| G-001 | - | No | Center | 자동 순번 |
| G-002 | ORDER_NO | 주문번호 | Left | 클릭 시 상세 표시 |
| G-003 | CUSTOMER_NAME | 고객사 | Left | 거래처 마스터 JOIN |
| G-004 | ORDER_DATE | 주문일자 | Center | |
| G-005 | DUE_DATE | 납기일 | Center | |
| G-006 | ORDER_STATUS | 상태 | Center | 뱃지 + 코드→명칭 변환 |
| G-007 | TOTAL_AMOUNT | 총금액 | Right | |

## C.5. §3.3 코드값 변환
| DB 컬럼 | 코드 마스터 | 변환 예 |
|---|---|---|
| ORDER_STATUS | CODE_ORDER_STATUS | WAIT→대기, CONF→확정, PROC→진행, DONE→완료, CANCEL→취소 |
| ORDER_TYPE | CODE_ORDER_TYPE | MTO→주문생산, MTS→재고생산 |

## C.6. §4 상세 영역 (D-NNN)
| D-001 | ORDER_NO | 주문번호 | 읽기전용 | - | 자동채번 |
| D-002 | ORDER_DATE | 주문일자 | DatePicker | Y | 오늘 |
| D-003 | CUSTOMER_CODE | 고객사 | 검색 팝업 | Y | - |
| D-004 | DUE_DATE | 납기일 | DatePicker | Y | - |
| D-005 | ORDER_TYPE | 주문유형 | 드롭다운 | Y | MTO |
| D-006 | MANAGER_NAME | 담당자 | 텍스트 | N | 로그인 사용자 |
| D-007 | REMARK | 비고 | 텍스트 영역 | N | - |

## C.7. §4.2 품목 라인 (L-NNN)
| L-001 | PRODUCT_CODE | 품목코드 | 검색 팝업 | Y |
| L-002 | PRODUCT_NAME | 품목명 | 읽기전용 | - |
| L-003 | QUANTITY | 수량 | 숫자 | Y |
| L-004 | UNIT_PRICE | 단가 | 숫자 | Y |
| L-005 | AMOUNT | 금액 | 읽기전용 | - |
| L-006 | DRAWING_NO | 도면번호 | 텍스트 | 조건부 |

## C.8. §5.1 버튼 (상태 워크플로우 + 마스터-디테일 패턴)
| B-001 조회 | B-002 초기화 | B-003 신규 | B-004 저장 | B-005 삭제 | B-006 확정 | B-007 취소 | B-008 엑셀 |

## C.9. §6 검증 규칙 (발췌)
| V-001 | ORDER_DATE (D-002) | 필수 입력 | "주문일자를 입력해주세요" |
| V-005 | DUE_DATE (D-004) | ORDER_DATE 보다 이후 | "납기일은 주문일자 이후여야 합니다" |
| XV-002 | ORDER_TYPE='MTO' 이고 DUE_DATE < ORDER_DATE + 14일 | "MTO 주문의 납기일은 주문일로부터 최소 14일 이후여야 합니다" |
| XV-003 | 품목이 벨로우즈인데 DRAWING_NO 없음 | "벨로우즈 제품은 도면번호가 필수입니다" |

## C.10. §7.2 상태 전이
```
WAIT → CONF      주문 확정 (Demand 생성)
WAIT → CANCEL    주문 취소
CONF → WAIT      확정 취소 (생산계획 반영 전만)
CONF → PROC      생산 시작 (시스템 자동)
CONF → CANCEL    확정 후 취소
PROC → DONE      출하 완료 (시스템 자동)
PROC → CANCEL    생산 중 취소 (관리자만)
```

## C.11. §9 연동 / 팝업
| 거래처 검색 팝업 | 모달 | CUSTOMER_CODE 검색 | → CUSTOMER_CODE, CUSTOMER_NAME |
| 품목 검색 팝업 | 모달 | PRODUCT_CODE 검색 | → PRODUCT_CODE, PRODUCT_NAME, UNIT_PRICE |
| 생산계획 (APS) | 데이터 연동 | 주문 확정 시 | → Demand 생성 (서버 내부) |

## C.12. 3종 설계서 일치 키 (중요)
본 기능설계서의 값은 디자인/BPMN 설계서와 일치해야 한다.

| 일치 키 | 기능설계서 | 디자인설계서 | BPMN설계서 |
|---|---|---|---|
| 화면 식별자 | §1 `orderRegistration` | §2-1 | §2-1 |
| 영역ID | §2 | §1, §2 | - |
| 필드ID | §4 | §5 (컴포넌트 트리) | §2 Request body |
| 버튼ID | §5.1 | §5 (ActionButtons) | §1.1 트리거 |
| 팝업ID | §9 | §6 | - |
| DB 컬럼명 | §3, §4 | §4 | §2, §4.2 |
| 상태코드 | §7 | - | §2.7, §4.1 |
| action | 버튼 의미 | - | §1.1 action 열 |

**일치 키가 깨지면 곧 개발 단계 버그/재작업 발생** → 3종 설계서를 항상 동기화. (MUST)
