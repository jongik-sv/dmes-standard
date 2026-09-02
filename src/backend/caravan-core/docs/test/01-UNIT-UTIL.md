# 01. 단위 테스트 - 유틸리티 / 상수 / DTO

## 대상 클래스

- `util/JsonUtil.java`
- `handler/HandleResult.java`
- `model/KafkaMessageContext.java`

> Mock 불필요. 외부 의존성 없는 순수 단위 테스트.

---

## JsonUtil

### TC-UTIL-001: JSON → Map 파싱 성공

| 항목 | 내용 |
|------|------|
| **메서드** | `parseMap(String json)` |
| **입력** | `{"TRANSACTION_CODE":"PQR02012","INTERFACE_MSG":"A\|B\|C"}` |
| **기대 결과** | Map 반환, `map.get("TRANSACTION_CODE")` == `"PQR02012"` |

### TC-UTIL-002: JSON → Map 파싱 - 빈 객체

| 항목 | 내용 |
|------|------|
| **메서드** | `parseMap(String json)` |
| **입력** | `{}` |
| **기대 결과** | 빈 Map 반환 (size == 0) |

### TC-UTIL-003: JSON → Map 파싱 - 잘못된 JSON

| 항목 | 내용 |
|------|------|
| **메서드** | `parseMap(String json)` |
| **입력** | `{invalid json` |
| **기대 결과** | `RuntimeException` 발생 |

### TC-UTIL-004: JSON → Map 파싱 - null 입력

| 항목 | 내용 |
|------|------|
| **메서드** | `parseMap(String json)` |
| **입력** | `null` |
| **기대 결과** | 예외 발생 |

### TC-UTIL-005: Object → JSON 직렬화

| 항목 | 내용 |
|------|------|
| **메서드** | `toJson(Object obj)` |
| **입력** | `LinkedHashMap` {TRANSACTION_CODE: "PQR02012", INTERFACE_MSG: "A\|B"} |
| **기대 결과** | JSON 문자열, 필드 순서 유지, `"TRANSACTION_CODE"` 키 포함 |

### TC-UTIL-006: Object → JSON 직렬화 - null 입력

| 항목 | 내용 |
|------|------|
| **메서드** | `toJson(Object obj)` |
| **입력** | `null` |
| **기대 결과** | `"null"` 문자열 반환 |

### TC-UTIL-007: JSON 유효성 검증 - 유효

| 항목 | 내용 |
|------|------|
| **메서드** | `isValidJson(String json)` |
| **입력** | `{"key":"value"}` |
| **기대 결과** | `true` |

### TC-UTIL-008: JSON 유효성 검증 - 무효

| 항목 | 내용 |
|------|------|
| **메서드** | `isValidJson(String json)` |
| **입력** | `not-json-string` |
| **기대 결과** | `false` |

### TC-UTIL-009: JSON → 타입 변환

| 항목 | 내용 |
|------|------|
| **메서드** | `parse(String json, Class<T> type)` |
| **입력** | `{"transactionCode":"PQR02012","interfaceMsg":"A\|B"}`, `KafkaMessage.class` |
| **기대 결과** | KafkaMessage 객체 반환, `transactionCode` == `"PQR02012"` |

---

## HandleResult

### TC-UTIL-010: HandleResult.success()

| 항목 | 내용 |
|------|------|
| **메서드** | `HandleResult.success()` |
| **기대 결과** | `success=true`, `retryable=false`, `errorCode=null`, `errorMessage=null` |

### TC-UTIL-011: HandleResult.success(data)

| 항목 | 내용 |
|------|------|
| **메서드** | `HandleResult.success("result-data")` |
| **기대 결과** | `success=true`, `data="result-data"` |

### TC-UTIL-012: HandleResult.fail(code, message)

| 항목 | 내용 |
|------|------|
| **메서드** | `HandleResult.fail("ERR001", "처리 실패")` |
| **기대 결과** | `success=false`, `retryable=false`, `errorCode="ERR001"`, `errorMessage="처리 실패"` |

### TC-UTIL-013: HandleResult.failRetryable(code, message)

| 항목 | 내용 |
|------|------|
| **메서드** | `HandleResult.failRetryable("TEMP_ERR", "일시 오류")` |
| **기대 결과** | `success=false`, `retryable=true`, `errorCode="TEMP_ERR"` |

---

## KafkaMessageContext

### TC-UTIL-014: getInterfaceMsgArray() - 정상 파이프 분리

| 항목 | 내용 |
|------|------|
| **입력** | `interfaceMsg = "PQR02012\|P\|S\|5A\|20260130"` |
| **기대 결과** | 배열 크기 5, `[0]="PQR02012"`, `[1]="P"`, `[4]="20260130"` |

### TC-UTIL-015: getInterfaceMsgArray() - null interfaceMsg

| 항목 | 내용 |
|------|------|
| **입력** | `interfaceMsg = null` |
| **기대 결과** | 빈 배열 (length == 0) |

### TC-UTIL-016: getInterfaceMsgArray() - 빈 문자열

| 항목 | 내용 |
|------|------|
| **입력** | `interfaceMsg = ""` |
| **기대 결과** | 빈 배열 (length == 0) |

### TC-UTIL-017: getString() - 존재하는 키

| 항목 | 내용 |
|------|------|
| **입력** | `rawMessageMap = {"CUSTOM":"value"}`, key = `"CUSTOM"` |
| **기대 결과** | `"value"` |

### TC-UTIL-018: getString() - 존재하지 않는 키

| 항목 | 내용 |
|------|------|
| **입력** | `rawMessageMap = {"CUSTOM":"value"}`, key = `"UNKNOWN"` |
| **기대 결과** | `null` |

### TC-UTIL-019: getString() - rawMessageMap이 null

| 항목 | 내용 |
|------|------|
| **입력** | `rawMessageMap = null`, key = `"ANY"` |
| **기대 결과** | `null` |
