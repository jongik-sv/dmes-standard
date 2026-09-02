# 05. 핸들러 (Handler)

## 파일 목록

| 파일 | 역할 |
|------|------|
| `handler/KafkaInterfaceHandler.java` | 핸들러 인터페이스 (호스트 프로젝트에서 구현) |
| `handler/KafkaInterfaceHandlerRegistry.java` | TRANSACTION_CODE → Bean 조회 |
| `handler/DefaultKafkaInterfaceHandler.java` | 미등록 TRANSACTION_CODE용 기본 핸들러 |
| `handler/HandleResult.java` | 핸들러 실행 결과 DTO |

---

## 핸들러 라우팅 메커니즘

```
메시지 수신
    │
    ├── TRANSACTION_CODE 추출 (예: "PQR02012")
    │
    ▼
KafkaInterfaceHandlerRegistry.getHandler("PQR02012")
    │
    ├── ApplicationContext.getBean("PQR02012")
    │       │
    │       ├── Bean 존재 → instanceof KafkaInterfaceHandler 확인 → 반환
    │       │
    │       └── Bean 없거나 타입 불일치 → DefaultKafkaInterfaceHandler 반환
    │
    ▼
handler.businessHandle(context) 실행
```

핵심 원리: **TRANSACTION_CODE 값이 곧 Spring Bean 이름**이다.

### SERAI 시스템 예외

`biz-system`이 `serai`로 시작하면 TRANSACTION_CODE 기반 라우팅을 하지 않고, 모든 메시지가 `SeraiConsumeHandler` Bean으로 고정 라우팅된다.

```
SERAI 시스템 (biz-system: serai_prod):
메시지 수신
    │
    ├── TRANSACTION_CODE 추출 (예: "PQR02012")
    │
    ├── bizSystem.startsWith("serai") == true
    │
    ▼
KafkaInterfaceHandlerRegistry.getHandler("SeraiConsumeHandler")
    │
    ▼
SeraiConsumeHandler.BusinessStart.businessHandle(context) 실행
    └── context.getTransactionCode()로 원본 코드 접근 가능
```

---

## KafkaInterfaceHandler (인터페이스)

**경로**: `handler/KafkaInterfaceHandler.java`

호스트 프로젝트에서 구현해야 하는 유일한 인터페이스이다.

```java
public interface KafkaInterfaceHandler {
    HandleResult businessHandle(KafkaMessageContext context);
}
```

### 구현 규칙

1. **Bean 이름** = TRANSACTION_CODE 값

```java
@Component("PQR02012")   // ← TRANSACTION_CODE
public class BusinessStart implements KafkaInterfaceHandler { ... }
```

2. **패키지 컨벤션** (권장)

```
com.{project}.handler.{TRANSACTION_CODE}.BusinessStart

예:
com.myproject.handler.PQR02012.BusinessStart
com.myproject.handler.ABC01234.BusinessStart
```

3. **예외를 던지지 않는다** — 모든 결과를 `HandleResult`로 반환한다

```java
@Override
public HandleResult businessHandle(KafkaMessageContext context) {
    try {
        // 비즈니스 로직
        return HandleResult.success();
    } catch (TemporaryException e) {
        return HandleResult.failRetryable("TEMP_ERR", e.getMessage());
    } catch (Exception e) {
        return HandleResult.fail("ERROR", e.getMessage());
    }
}
```

---

## KafkaInterfaceHandlerRegistry

**경로**: `handler/KafkaInterfaceHandlerRegistry.java`

`@Component`로 등록되며, `ApplicationContext`를 통해 Bean을 조회한다.

### getHandler(String transactionCode)

```java
public KafkaInterfaceHandler getHandler(String transactionCode) {
    try {
        Object bean = applicationContext.getBean(transactionCode);
        if (bean instanceof KafkaInterfaceHandler) {
            return (KafkaInterfaceHandler) bean;
        }
    } catch (NoSuchBeanDefinitionException e) {
        // Bean이 없는 경우
    }
    log.warn("핸들러 미등록: {}", transactionCode);
    return defaultHandler;
}
```

- Bean이 존재하고 `KafkaInterfaceHandler` 타입이면 반환
- Bean이 없거나 타입이 다르면 `DefaultKafkaInterfaceHandler` 반환

### hasHandler(String transactionCode)

Bean 존재 여부를 확인하는 보조 메서드이다.

---

## DefaultKafkaInterfaceHandler

**경로**: `handler/DefaultKafkaInterfaceHandler.java`

미등록 TRANSACTION_CODE로 메시지가 들어왔을 때 사용되는 기본 핸들러이다.

```java
@Component
public class DefaultKafkaInterfaceHandler implements KafkaInterfaceHandler {
    @Override
    public HandleResult businessHandle(KafkaMessageContext context) {
        log.warn("미등록 TRANSACTION_CODE: {} - 메시지 스킵", context.getTransactionCode());
        return HandleResult.success();  // success 반환 → offset 커밋 → 다음 메시지로
    }
}
```

`HandleResult.success()`를 반환하므로 메시지가 **커밋(스킵)** 된다. 재시도하지 않는다.

---

## HandleResult

**경로**: `handler/HandleResult.java`

핸들러 실행 결과를 표현하는 DTO이다.

### 필드

```java
private boolean success;        // 처리 성공 여부
private boolean retryable;      // 재시도 가능 여부
private boolean skipOnMaxRetry; // 최대 재시도 초과 시 스킵 여부 (retryable=true일 때만 유효)
private String errorCode;       // 에러 코드
private String errorMessage;    // 에러 메시지
private Object data;            // 추가 데이터 (선택)
```

### 팩토리 메서드

| 메서드 | success | retryable | skipOnMaxRetry | 동작 |
|--------|---------|-----------|----------------|------|
| `success()` | true | false | - | offset 커밋, 다음 메시지 |
| `success(Object data)` | true | false | - | offset 커밋 + 데이터 반환 |
| `fail(String msg)` | false | **false** | - | 에러 DB 기록, offset 커밋(스킵) |
| `fail(String code, String msg)` | false | **false** | - | 에러 DB 기록, offset 커밋(스킵) |
| `failRetryable(String msg)` | false | **true** | **false** | 재시도 → 초과 시 컨테이너 PAUSE |
| `failRetryable(String code, String msg)` | false | **true** | **false** | 재시도 → 초과 시 컨테이너 PAUSE |
| `failRetryableSkip(String msg)` | false | **true** | **true** | 재시도 → 초과 시 에러 기록 후 스킵 |
| `failRetryableSkip(String code, String msg)` | false | **true** | **true** | 재시도 → 초과 시 에러 기록 후 스킵 |

### Consumer 측 처리 분기

```
HandleResult
├── success=true
│   └── acknowledge() → 다음 메시지
│
├── success=false, retryable=false
│   ├── KafkaErrorRepository.logConsumeError()
│   └── acknowledge() → 다음 메시지 (스킵)
│
└── success=false, retryable=true
    ├── attempt < maxAttempts → sleep(delayMs) → 재시도
    └── attempt >= maxAttempts
        ├── skipOnMaxRetry=false (failRetryable)
        │   ├── KafkaErrorRepository.logConsumeError()
        │   ├── containerController.pause()
        │   └── consumer.seek() (offset 롤백)
        │
        └── skipOnMaxRetry=true (failRetryableSkip)
            ├── KafkaErrorRepository.logConsumeError()
            └── acknowledge() → 다음 메시지 (자동 스킵)
```

---

## 핸들러 구현 예시

### 기본 구현

```java
@Component("PQR02012")
@RequiredArgsConstructor
public class BusinessStart implements KafkaInterfaceHandler {

    private final MyService myService;

    @Override
    public HandleResult businessHandle(KafkaMessageContext context) {
        String[] msgArr = context.getInterfaceMsgArray();
        // msgArr[0] = "PQR02012" (TRANSACTION_CODE)
        // msgArr[1] = 타입
        // msgArr[2] = 상태
        // ...

        myService.process(msgArr);
        return HandleResult.success();
    }
}
```

### SERAI 시스템 전용 핸들러 구현

`biz-system`이 `serai`로 시작하는 프로젝트에서 구현한다. Bean 이름은 반드시 `SeraiConsumeHandler`이어야 한다.

```java
package com.myproject.handler.SeraiConsumeHandler;

@Component("SeraiConsumeHandler")
@RequiredArgsConstructor
public class BusinessStart implements KafkaInterfaceHandler {

    @Override
    public HandleResult businessHandle(KafkaMessageContext context) {
        // 모든 TRANSACTION_CODE의 메시지가 여기로 들어온다
        String transactionCode = context.getTransactionCode();
        String[] msgArr = context.getInterfaceMsgArray();

        // TRANSACTION_CODE별 내부 분기 (필요시)
        switch (transactionCode) {
            case "PQR02012":
                return processPqr(msgArr);
            case "ABC01234":
                return processAbc(msgArr);
            default:
                log.warn("미처리 TRANSACTION_CODE: {}", transactionCode);
                return HandleResult.success();
        }
    }
}
```

### 재시도 가능 에러 처리

```java
@Component("ABC01234")
public class DataSync implements KafkaInterfaceHandler {

    @Override
    public HandleResult businessHandle(KafkaMessageContext context) {
        try {
            callExternalApi(context.getInterfaceMsg());
            return HandleResult.success();

        } catch (DbConnectionException e) {
            // DB 연결 불가 → 재시도, 실패 시 컨테이너 PAUSE (운영자 개입)
            return HandleResult.failRetryable("DB_ERROR", e.getMessage());

        } catch (ExternalApiException e) {
            // 외부 API 오류 → 재시도, 실패 시 에러 기록 후 다음 메시지 (자동 스킵)
            return HandleResult.failRetryableSkip("API_ERROR", e.getMessage());

        } catch (ValidationException e) {
            // 영구적 오류 → 즉시 스킵 (재시도 안 함)
            return HandleResult.fail("INVALID", e.getMessage());
        }
    }
}
```

### failRetryable vs failRetryableSkip 선택 기준

| 상황 | 권장 | 이유 |
|------|------|------|
| DB 연결 장애 | `failRetryable()` | DB 복구 전까지 모든 메시지가 실패하므로 멈춰야 함 |
| 외부 API 타임아웃 | `failRetryableSkip()` | 특정 메시지만 실패할 수 있으므로 다음 메시지 시도 |
| 필수 필드 누락 | `fail()` | 재시도해도 같은 결과이므로 즉시 스킵 |
| Kafka 브로커 장애 | `failRetryable()` | 인프라 문제이므로 멈추고 운영자 확인 필요 |
| 특정 데이터 파싱 오류 | `failRetryableSkip()` | 해당 메시지만 문제이므로 기록 후 넘어감 |
