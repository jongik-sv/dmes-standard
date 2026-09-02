# 05. 웹 레이어 공통

> **APS Core Migration 반영**: 패키지 `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`. 신규 표준 필터 ClientKeyFilter / RequestIdFilter 가 web 필터 체인에 함께 등록된다(env: `BACKEND_CLIENT_KEY`).

## 1. 에러 처리

### 1.1 ErrorCode (에러 코드 정의)

```java
public enum ErrorCode {
    // 공통
    SUCCESS("S000", "성공"),
    UNKNOWN_ERROR("E000", "알 수 없는 오류"),
    INVALID_REQUEST("E001", "잘못된 요청"),
    VALIDATION_FAILED("E002", "유효성 검증 실패"),

    // 인증/인가
    UNAUTHORIZED("E100", "인증 필요"),
    FORBIDDEN("E101", "권한 없음"),
    TOKEN_EXPIRED("E102", "토큰 만료"),
    TOKEN_INVALID("E103", "유효하지 않은 토큰"),

    // 비즈니스
    BUSINESS_ERROR("B000", "비즈니스 오류"),
    DATA_NOT_FOUND("B001", "데이터 없음"),
    DUPLICATE_DATA("B002", "중복 데이터"),
    DATA_INTEGRITY("B003", "데이터 무결성 위반"),

    // OASIS
    SERVICE_NOT_FOUND("O001", "서비스를 찾을 수 없음"),
    SERVICE_EXECUTION_ERROR("O002", "서비스 실행 오류");
}
```

### 1.2 BusinessException

업무 로직에서 의도적으로 발생시키는 예외. HTTP 200 + resultCode=FAIL로 응답.

```java
public class BusinessException extends RuntimeException {
    private final ErrorCode errorCode;
    private final List<ErrorDetail> errors;

    // 사용 예시
    throw new BusinessException(ErrorCode.DATA_NOT_FOUND, "주문번호 ORD-001을 찾을 수 없습니다");
    throw new BusinessException(ErrorCode.VALIDATION_FAILED, errors);
}
```

### 1.3 GlobalExceptionHandler

`@ControllerAdvice`로 전역 예외를 잡아 `CactusResponse`로 변환.

| 예외 | HTTP | resultCode | 처리 |
|------|------|-----------|------|
| `BusinessException` | 200 | FAIL | 비즈니스 오류 (정상 흐름) |
| `MethodArgumentNotValidException` | 400 | ERROR | @Valid 검증 실패 |
| `HttpMessageNotReadableException` | 400 | ERROR | JSON 파싱 실패 |
| `AccessDeniedException` | 403 | ERROR | 권한 없음 |
| `Exception` | 500 | ERROR | 예상치 못한 서버 오류 |

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<CactusResponse> handleBusiness(BusinessException e) {
        return ResponseEntity.ok(
            CactusResponse.builder()
                .fail(e.getErrorCode().getCode(), e.getMessage())
                .errors(e.getErrors())
                .build()
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<CactusResponse> handleUnknown(Exception e) {
        log.error("Unexpected error", e);
        return ResponseEntity.status(500).body(
            CactusResponse.builder()
                .error(ErrorCode.UNKNOWN_ERROR.getCode(), "서버 내부 오류가 발생했습니다")
                .build()
        );
    }
}
```

## 2. 서블릿 필터

### 2.1 필터 체인 순서

```
요청 →  TxIdFilter (1순위)
     →  JwtAuthenticationFilter (2순위)
     →  (Spring Security FilterChain)
     →  OasisController
```

### 2.2 TxIdFilter (트랜잭션 ID 필터)

모든 요청에 고유한 트랜잭션 ID를 부여한다.

```
동작:
1. 요청 헤더 X-TX-ID가 있으면 사용, 없으면 UUID 생성
2. MDC에 txId 설정 (로깅 추적용)
3. 응답 헤더 X-TX-ID로 반환
```

**TxIdGenerator**: `UUID.randomUUID()` 기반. 형식: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### 2.3 RequestLoggingFilter (향후 구현)

요청/응답 로깅. 개발/디버그 용도.

```yaml
cactus:
  logging:
    enabled: true
    include-payload: true
    max-payload-length: 1000
```

## 3. ApiResponse (범용 응답 래퍼)

OASIS를 경유하지 않는 직접 API (로그인, 헬스체크 등)용 간단한 응답 래퍼.

```java
public class ApiResponse<T> {
    private boolean success;
    private String message;
    private T data;

    public static <T> ApiResponse<T> ok(T data) { ... }
    public static <T> ApiResponse<T> ok(String message, T data) { ... }
    public static ApiResponse<Void> error(String message) { ... }
}
```

**사용 구분**:
- `CactusResponse`: OASIS 서비스 경유 요청 (그리드 데이터, 업무 화면)
- `ApiResponse`: 직접 API (인증, 공통코드, 헬스체크 등)

## 4. CORS 설정 (업무 모듈)

cactus-core는 CORS 설정을 제공하지 않는다. 업무 모듈에서 직접 설정.

```java
// 업무 모듈 WebConfig
@Bean
public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(List.of("https://dmes.dongkuk.com"));
    config.setAllowedMethods(List.of("POST", "GET", "OPTIONS"));
    config.setAllowedHeaders(List.of("*"));
    config.setAllowCredentials(true);
    // ...
}
```

> **참고**: BFF 패턴에서는 브라우저 → BFF가 동일 도메인이므로 CORS 이슈가 없음.
> BFF → WAS는 서버 간 통신이므로 CORS 미적용. 직접 WAS 접근 시에만 필요.
