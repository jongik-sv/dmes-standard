# Business Logic Guide

> {CLIENT}/DMES 전체 시스템 공통 비즈니스 로직 구현 가이드다.
> APS 전용 엔진/시나리오 규칙은 APS 정본 문서와 설계 문서를 따른다.
> Entity/Repository/DTO/Service/Controller 같은 구현 구조는 [`Backend-Implementation-Guide.md`](Backend-Implementation-Guide.md)를 따른다.

## 1. 적용 범위와 우선순위

이 문서는 `src/backend/{moduleId}`, `src/backend/mpn`, `src/backend/aps-core` 에 공통으로 적용한다.

우선순위:

1. 확정된 설계서와 ADR
2. `RULE.md` 의 라우팅, URL, 패키지, 테스트 규칙
3. 이 공통 비즈니스 로직 가이드
4. 모듈별 보조 가이드

설계서와 구현이 다르면 구현을 수정한다. 설계서 자체가 틀렸다면 설계서를 먼저 개정하고, 변경 근거를 남긴 뒤 구현한다.

## 2. 설계서와 코드 추적성

설계서는 각 엔티티와 API에 대해 다음을 정의해야 한다.

| 항목 | 예시 |
|---|---|
| 엔티티 필드 | PK, 필수 여부, 길이, 정밀도, 기본값 |
| 비즈니스 규칙 코드 | `INV-R02`, `SCN-R01`, `CE-03` |
| 상태 전이 | `DRAFT -> REQUESTED -> APPROVED` |
| API 계약 | method, path, request, response |
| 교차 엔티티 검증 | 공장/작업장/품목/권한 범위 정합성 |
| DTO 필드 | request/response 필드명과 타입 |

규칙 코드가 있는 경우 다음 두 곳에 반드시 남긴다.

- 테스트 `@DisplayName`: `@DisplayName("[CE-04] 작업장이 일치하지 않으면 저장 실패")`
- 사용자/운영자에게 전달 가능한 에러 메시지: `"작업장이 일치해야 합니다 (CE-04)"`

## 3. 상태 전이 패턴

상태 전이는 설계서의 전이표와 코드가 1:1로 맞아야 한다.

### 3.1 전이 매트릭스

허용 전이는 명시적인 매트릭스로 정의한다.

```java
private static final Map<OrderStatus, List<OrderStatus>> VALID_TRANSITIONS = Map.of(
    OrderStatus.DRAFT, List.of(OrderStatus.REQUESTED, OrderStatus.CANCELED),
    OrderStatus.REQUESTED, List.of(OrderStatus.APPROVED, OrderStatus.REJECTED),
    OrderStatus.APPROVED, List.of(OrderStatus.CLOSED),
    OrderStatus.REJECTED, List.of(),
    OrderStatus.CANCELED, List.of(),
    OrderStatus.CLOSED, List.of()
);

private void validateStatusTransition(OrderStatus current, OrderStatus target) {
    List<OrderStatus> validTargets = VALID_TRANSITIONS.getOrDefault(current, List.of());
    if (!validTargets.contains(target)) {
        throw new BusinessException(ErrorCode.INVALID_STATE_TRANSITION,
            current + "에서 " + target + "로의 상태 전이는 허용되지 않습니다");
    }
}
```

### 3.2 엔티티 메서드

자기 상태와 함께 바뀌는 필드는 엔티티 메서드에서 원자적으로 갱신한다.

```java
public void approve(String approverId, LocalDateTime approvedAt) {
    if (this.status != OrderStatus.REQUESTED) {
        throw new IllegalStateException("REQUESTED 상태에서만 승인할 수 있습니다. 현재: " + this.status);
    }
    this.status = OrderStatus.APPROVED;
    this.approverId = approverId;
    this.approvedAt = approvedAt;
}
```

원칙:

- guard clause 를 먼저 둔다.
- 상태와 부수 필드는 같은 메서드에서 함께 변경한다.
- 엔티티 내부 불변식 위반은 `IllegalStateException` 또는 `IllegalArgumentException` 으로 막는다.
- API/업무 규칙 위반은 서비스 계층에서 `BusinessException` 으로 변환한다.

### 3.3 서비스 계층

서비스는 엔티티를 조회하고, 전이 가능 여부와 업무 가드를 검증한 뒤 엔티티 메서드를 호출한다.

```java
@Transactional
public OrderResponse approve(String orderId, ApproveRequest request) {
    Order order = findOrderOrThrow(orderId);
    validateStatusTransition(order.getStatus(), OrderStatus.APPROVED);
    validateApprovalAuthority(request.approverId(), order);
    order.approve(request.approverId(), LocalDateTime.now());
    return toResponse(orderRepository.save(order));
}
```

## 4. 비즈니스 검증 순서

비즈니스 검증은 다음 순서를 기본값으로 한다.

1. 참조 엔티티 존재 확인
2. 값 수준 비즈니스 규칙
3. 상태/권한/처리 가능 여부
4. 교차 엔티티 제약
5. 유니크 제약 조건

### 4.1 참조 무결성

```java
Item item = itemRepository.findById(request.itemId())
    .filter(i -> !i.getIsDeleted())
    .orElseThrow(() -> new ResourceNotFoundException("품목", request.itemId()));
```

### 4.2 값 수준 검증

```java
if (request.qty() == null || request.qty().compareTo(BigDecimal.ZERO) <= 0) {
    throw new BusinessException(ErrorCode.VALIDATION_ERROR, "수량은 0보다 커야 합니다");
}

if (!request.fromDate().isBefore(request.toDate())) {
    throw new BusinessException(ErrorCode.VALIDATION_ERROR, "시작일은 종료일보다 이전이어야 합니다");
}
```

### 4.3 교차 엔티티 검증

서로 다른 엔티티 사이의 정합성은 규칙 코드로 추적한다.

```java
if (!resource.getPlantId().equals(workOrder.getPlantId())) {
    throw new BusinessException(ErrorCode.VALIDATION_ERROR,
        "자원과 작업지시의 공장이 일치해야 합니다 (CE-03)");
}
```

### 4.4 유니크 제약

유니크 제약은 DB 제약에만 맡기지 않고 사용자 메시지를 위해 사전 검증한다.

```java
boolean duplicateExists = repository.existsByBusinessKey(
    request.plantId(), request.itemId(), request.effectiveDate());
if (duplicateExists) {
    throw new BusinessException(ErrorCode.DUPLICATE_RESOURCE,
        "동일한 업무 키의 데이터가 이미 존재합니다");
}
```

nullable 컬럼이 유니크 키에 포함되면 null/non-null 경우를 분리해 쿼리한다.

## 5. 수량, 금액, 비율 계산

수량, 금액, 비율 계산에는 `BigDecimal` 을 사용한다. `float`/`double` 은 금지한다.

```java
@Column(precision = 18, scale = 3)
private BigDecimal qty;

@Column(precision = 18, scale = 3)
private BigDecimal allocatedQty;

@Column(precision = 18, scale = 3)
private BigDecimal availableQty;
```

계산 원칙:

- 입력 null 과 음수/0 허용 여부를 먼저 검증한다.
- scale 과 rounding mode 는 필드/업무 규칙에서 정한다.
- 파생 필드는 엔티티 메서드 또는 `@PrePersist` / `@PreUpdate` 에서 일관되게 계산한다.
- 재고, 잔량, 실적처럼 차감이 있는 값은 음수 방지 규칙을 명시한다.

```java
public void allocate(BigDecimal delta) {
    if (delta == null || delta.signum() <= 0) {
        throw new IllegalArgumentException("할당 수량은 양수여야 합니다: " + delta);
    }
    BigDecimal next = this.allocatedQty.add(delta);
    if (next.compareTo(this.qty) > 0) {
        throw new IllegalStateException("할당 수량이 기준 수량을 초과합니다");
    }
    this.allocatedQty = next;
    this.availableQty = this.qty.subtract(this.allocatedQty);
}
```

## 6. ID와 비즈니스 키

| 유형 | 예시 | 사용 대상 |
|---|---|---|
| 비즈니스 키 | `ITEM-001`, `WC-01` | 마스터 데이터, 사용자 표시 |
| 접두어+일련번호 | `DMD-20260709-00001` | 트랜잭션 데이터 |
| 복합 키 | `PLANT-ITEM-DATE` | 컨텍스트 종속 데이터 |
| UUID | `a1b2c3d4-...` | 보조 엔티티, 내부 식별 |

원칙:

- FE 에 표시해야 하는 값과 내부 row key 를 구분한다.
- 시스템 생성 ID 는 그리드 주요 컬럼으로 노출하지 않는다.
- 복합 ID 에 null 이 포함되면 `"null"` 문자열이 들어가므로 구성 요소를 먼저 검증한다.
- 업무적으로 중복을 막아야 하는 값은 PK 와 별개로 business key 제약을 둔다.

## 7. 에러 코드와 예외

> 아래 표는 APS(aps-core) `ErrorCode`(`SYS-`/`BIZ-` 계열) 기준이다. MES OASIS 모듈(mcm·mls·mqc·mpp·mas)은 cactus-core `ErrorCode`(`E0xx`/`A0xx`/`S0xx`)를 사용하며 카탈로그는 [standard-v2 Part C §3](standard-v2/part-c-cactus-core-reference.md)을 따른다.

공통 에러 의미는 기존 `ErrorCode` 를 우선 재사용한다.

| 코드 | 이름 | HTTP | 사용 상황 |
|---|---|---|---|
| `SYS-002` | `VALIDATION_ERROR` | 400 | 값 수준, CE 규칙, 업무 검증 실패 |
| `SYS-003` | `RESOURCE_NOT_FOUND` | 404 | 엔티티 미발견 |
| `SYS-004` | `DUPLICATE_RESOURCE` | 409 | 유니크 키 중복 |
| `SYS-005` | `INVALID_STATE_TRANSITION` | 400 | 상태 전이 불가 |
| `BIZ-001` | `REFERENCE_INTEGRITY_VIOLATION` | 409 | 참조 중인 엔티티 삭제 시도 |

새 에러가 필요하면:

1. 기존 코드로 의미 표현이 가능한지 먼저 확인한다.
2. 불가능할 때만 `SYS-0XX` 또는 `BIZ-0XX` 로 추가한다.
3. HTTP 상태와 사용자 메시지를 함께 정의한다.
4. 테스트에서 해당 에러 코드를 검증한다.

## 8. 테스트 규칙

비즈니스 로직 테스트는 설계서의 규칙 코드를 기준으로 작성한다.

```java
@Test
@DisplayName("[CE-04] 자원과 공정의 작업장이 일치하지 않으면 매핑 생성 실패")
void ce04_workCenterMismatchRejected() {
    // given
    // when
    // then
}
```

테스트는 실제 서비스/엔진 코드를 호출하고 결과를 검증한다. 테스트 안에 비즈니스 로직을 재구현하지 않는다.
