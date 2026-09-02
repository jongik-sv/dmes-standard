# 04. 단위 테스트 - Handler / Registry

## 대상 클래스

- `handler/KafkaInterfaceHandlerRegistry.java`
- `handler/DefaultKafkaInterfaceHandler.java`

> Mock 대상: `ApplicationContext`, `DefaultKafkaInterfaceHandler`

---

## 사전 조건 (공통)

```
Mock:
  - ApplicationContext applicationContext
  - DefaultKafkaInterfaceHandler defaultHandler
```

---

## KafkaInterfaceHandlerRegistry

### TC-HDL-001: 등록된 TRANSACTION_CODE → 해당 핸들러 반환

| 항목 | 내용 |
|------|------|
| **메서드** | `getHandler("PQR02012")` |
| **Mock 설정** | `applicationContext.getBean("PQR02012", KafkaInterfaceHandler.class)` → customHandler |
| **기대 결과** | customHandler 반환 |

### TC-HDL-002: 미등록 TRANSACTION_CODE → DefaultHandler 반환

| 항목 | 내용 |
|------|------|
| **메서드** | `getHandler("UNKNOWN_CODE")` |
| **Mock 설정** | `applicationContext.getBean("UNKNOWN_CODE", ...)` → `NoSuchBeanDefinitionException` |
| **기대 결과** | defaultHandler 반환 |

### TC-HDL-003: null TRANSACTION_CODE → DefaultHandler 반환

| 항목 | 내용 |
|------|------|
| **메서드** | `getHandler(null)` |
| **기대 결과** | defaultHandler 반환 |
| **검증** | `applicationContext.getBean()` 호출 **없음** |

### TC-HDL-004: 빈 문자열 TRANSACTION_CODE → DefaultHandler 반환

| 항목 | 내용 |
|------|------|
| **메서드** | `getHandler("  ")` |
| **기대 결과** | defaultHandler 반환 |
| **검증** | `applicationContext.getBean()` 호출 **없음** |

### TC-HDL-005: hasHandler() - 존재

| 항목 | 내용 |
|------|------|
| **메서드** | `hasHandler("PQR02012")` |
| **Mock 설정** | `applicationContext.getBean("PQR02012", ...)` → customHandler |
| **기대 결과** | `true` |

### TC-HDL-006: hasHandler() - 미존재

| 항목 | 내용 |
|------|------|
| **메서드** | `hasHandler("UNKNOWN")` |
| **Mock 설정** | `applicationContext.getBean()` → 예외 |
| **기대 결과** | `false` |

### TC-HDL-007: hasHandler() - null

| 항목 | 내용 |
|------|------|
| **메서드** | `hasHandler(null)` |
| **기대 결과** | `false` |

---

## DefaultKafkaInterfaceHandler

### TC-HDL-008: 기본 핸들러 - success 반환하여 메시지 스킵

| 항목 | 내용 |
|------|------|
| **메서드** | `businessHandle(context)` |
| **입력** | `context.transactionCode = "UNKNOWN"` |
| **기대 결과** | `HandleResult.success()` 반환 (`success=true`) |

### TC-HDL-009: 기본 핸들러 - 로그에 경고 메시지 출력

| 항목 | 내용 |
|------|------|
| **메서드** | `businessHandle(context)` |
| **입력** | `context.transactionCode = "MISSING_TX"` |
| **검증** | WARN 레벨 로그에 `"MISSING_TX"` 포함 |
