# 08. 모듈간 통신 (향후 구현)

> **[Status: not yet implemented as of 2026-04-26]** No `ModuleClient` class (or equivalent module-to-module HTTP client) exists in cactus-core today. This chapter is a design draft; the actual API surface will be defined when the module-client component is built.

> **상태**: 설계 단계. 멀티 모듈(마이크로서비스) 환경에서 모듈 간 HTTP 통신을 지원한다.
>
> **APS Core Migration 반영**: 패키지 `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`. 모듈간 호출 시 `X-Client-Key` 헤더(env `BACKEND_CLIENT_KEY`, 옛 표현 `X-Backend-Client-Key` 는 폐기) 전달이 표준이며, 수신 모듈은 ClientKeyFilter 로 검증한다. RequestIdFilter 가 발급한 요청 식별자도 함께 전파한다.

## 1. 개요

DMES가 여러 Spring Boot 모듈로 분리되면, 모듈 간 통신이 필요하다.
cactus-core의 `ModuleClient`는 JWT 전파, 에러 핸들링, Circuit Breaker를 통합한 HTTP 클라이언트를 제공한다.

```
┌─────────────┐     ModuleClient      ┌─────────────┐
│  주문 모듈   │ ───────────────────► │  재고 모듈   │
│  (order)    │  JWT 자동 전파         │ (inventory) │
│             │  Circuit Breaker      │             │
└─────────────┘                       └─────────────┘
```

## 2. ModuleClient 설계

### 2.1 인터페이스

```java
public class ModuleClient {

    /**
     * 다른 모듈의 OASIS 서비스 호출
     */
    public CactusResponse call(String moduleId, String serviceGroup,
                                String serviceId, String action,
                                CactusRequest request);

    /**
     * 다른 모듈의 일반 API 호출
     */
    public <T> T get(String moduleId, String path, Class<T> responseType);
    public <T> T post(String moduleId, String path, Object body, Class<T> responseType);
}
```

### 2.2 사용 예시

```java
@Service
public class OrderService {
    private final ModuleClient moduleClient;

    public void checkStock(String itemCode) {
        CactusRequest request = CactusRequest.builder()
            .param("itemCode", itemCode)
            .build();

        CactusResponse response = moduleClient.call(
            "inventory",                    // 대상 모듈
            "stock", "stockInquiry",        // serviceGroup, serviceId
            "search",                       // action
            request
        );
    }
}
```

## 3. JWT 자동 전파

현재 요청의 JWT 토큰을 모듈간 호출 시 자동으로 전달한다.

```
요청 흐름:
Client → [JWT] → 주문 모듈 → [JWT 전파] → 재고 모듈
                                          ↓
                               JwtAuthenticationFilter가
                               동일하게 검증
```

```java
// ModuleClient 내부 구현
String token = JwtTokenHolder.getToken();  // ThreadLocal에서 현재 토큰 추출
httpRequest.setHeader("Authorization", "Bearer " + token);
```

## 4. 모듈 주소 설정

```yaml
cactus:
  modules:
    inventory:
      url: http://inventory-service:8080
      timeout: 10s
    quality:
      url: http://quality-service:8080
      timeout: 15s
```

## 5. Circuit Breaker (선택)

Resilience4j 기반으로 장애 전파를 방지한다.

```yaml
cactus:
  modules:
    inventory:
      circuit-breaker:
        enabled: true
        failure-rate-threshold: 50       # 실패율 50% 초과 시 차단
        wait-duration-in-open-state: 30s # 차단 후 30초 대기
        sliding-window-size: 10          # 최근 10건 기준
```

| 상태 | 동작 |
|------|------|
| CLOSED | 정상 호출 |
| OPEN | 즉시 fallback 응답 (호출 안 함) |
| HALF_OPEN | 일부 요청만 허용하여 복구 확인 |

## 6. 에러 처리

| 상황 | 처리 |
|------|------|
| 대상 모듈 응답 없음 | `ModuleCallException` (timeout) |
| 대상 모듈 4xx 응답 | 원본 에러 코드/메시지 전달 |
| 대상 모듈 5xx 응답 | `ModuleCallException` (서버 오류) |
| Circuit Breaker OPEN | fallback 응답 또는 `CircuitBreakerOpenException` |

## 7. 구현 우선순위

멀티 모듈 전환 시점에 구현한다. 현재 단일 모듈 환경에서는 불필요.

| 단계 | 내용 |
|------|------|
| 1단계 | RestClient 기반 ModuleClient + JWT 전파 |
| 2단계 | Circuit Breaker 통합 |
| 3단계 | 서비스 디스커버리 연동 (필요 시) |
