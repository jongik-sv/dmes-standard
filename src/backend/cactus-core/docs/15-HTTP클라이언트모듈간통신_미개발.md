# 15. HTTP 클라이언트 / 모듈 간 통신 (미개발)

> 통합 원본: `new/08-module-client.md` (`Status: not yet implemented as of 2026-04-26`)
> 구현 상태: **미구현** (ModuleClient 자체). 단, JWT 자동 전파용 `JwtTokenHolder` 는 이미 구현됨.

---

## 1. 설계 의도

- 모듈간 동기 HTTP 호출 표준화
- JWT 토큰 자동 전파 (BFF→A모듈→B모듈 식 호출 체인)
- Circuit Breaker, 재시도, 타임아웃 등 resilience 패턴
- txId 헤더 전파로 분산 추적 통일

---

## 2. 제안 명세

### 2.1 패키지
```
cactus-core/client/
├── ModuleClient.java              # 추상 인터페이스
├── CactusRestClient.java          # Spring 6 RestClient 래퍼
├── ModuleClientProperties.java
├── ModuleClientAutoConfiguration.java
└── interceptor/
    ├── JwtPropagationInterceptor.java     # JwtTokenHolder.get() → Authorization 헤더
    ├── TxIdPropagationInterceptor.java    # MDC.get("txId") → X-Tx-Id 헤더
    └── CircuitBreakerInterceptor.java     # Resilience4j 통합
```

### 2.2 application.yml
```yaml
cactus:
  client:
    portal:
      base-url: http://portal-was:8081
      timeout: 5s
    mpp:
      base-url: http://mpp-was:8082
      timeout: 5s
```

### 2.3 사용 패턴
```java
@Component
public class WorkOrderQueryService {
    private final ModuleClient portalClient;
    
    public List<User> getUsers() {
        return portalClient.post("/portal/api/secUser/search")
            .body(request)
            .retrieve()
            .toEntityList(User.class);
        // JWT, txId, X-Client-Key 자동 헤더 추가됨
    }
}
```

---

## 3. 부분 구현 흔적

| 항목 | 위치 | 내용 |
|---|---|---|
| JWT ThreadLocal | `cactus-core/security/jwt/JwtTokenHolder.java` | 토큰 보관, 추후 ModuleClient 가 사용 |

→ JWT 전파의 핵심 인프라(JwtTokenHolder)는 이미 깔려 있음. ModuleClient 도입 시 이를 활용한 인터셉터만 추가하면 됨.

---

## 4. 미구현 사유

- 현재 모듈간 동기 호출 빈도 낮음 (각 모듈이 독립 BPMN 서비스로 작동)
- BFF (Next.js portal) 가 단순 프록시 역할로 모듈간 직접 호출 우회
- 도입 우선순위 Phase 4 (`new/09-implementation-roadmap.md`)

---

## 5. 도입 시 고려사항

| 항목 | 설명 |
|---|---|
| 라이브러리 | Spring 6 RestClient (RestTemplate 후속) 권장 |
| Circuit Breaker | Resilience4j 통합 |
| 재시도 정책 | 5xx 만 재시도, 4xx 는 즉시 실패 |
| 타임아웃 | connect 1s, read 5s 기본 |
| JWT 전파 | JwtTokenHolder (이미 구현) 활용 |
| txId 전파 | `X-Tx-Id` 헤더로 호출 체인 연결 |
| Service Discovery | 단순 환경변수 우선, 추후 Eureka/Consul |

---

## 6. 임시 대안

- 도메인별 RestTemplate 직접 사용 (현재 portal `proxy.ts` 의 fetch 와 유사)
- JWT 헤더는 수동 `request.header("Authorization", token)`
- 운영 안정성은 NginX upstream + healthcheck 로 일부 대체

---

## 7. 관련 정리본

- 04 인증보안 JWT (JwtTokenHolder)
- 08 MDC 추적 및 TxId (txId 헤더 전파 전제)
- 14 메시지 EAI 및 메일 (비동기 통신)
- 90 갭분석 및 구현 로드맵
