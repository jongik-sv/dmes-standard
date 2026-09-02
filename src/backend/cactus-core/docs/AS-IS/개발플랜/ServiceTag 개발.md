# [완료] [cactus-core] Service Tag 추적 체계 설계

> 일시: 2026-04-01 12:00 (원본) / 2026-04-26 (현행 사실 박스)
> 프로젝트: cactus-core
> 참조: dmes-ref TraceIdLoggingFilter, OASIS MDCTemplate
>
> **구현 완료 사실 (마이그레이션 완료, 2026-04-26)**
> 본 설계의 핵심 기능은 cactus-core 본체에 구현 완료되었다. 본문 코드 예시의 `com.dongkuk.cactus.web.filter` 패키지는 모두 현행 `com.dongkuk.dmes.cactus.web.filter` 로 읽는다.
> - 트랜잭션 식별자: `com.dongkuk.dmes.cactus.util.TxIdGenerator` + `com.dongkuk.dmes.cactus.web.filter.TxIdFilter` (MDC 주입)
> - 요청 식별자: `com.dongkuk.dmes.cactus.web.filter.RequestIdFilter` (MDC + 응답 헤더 `X-Request-Id`)
> - 등록: `CactusAutoConfiguration` (TxIdFilter), `CactusWebSecurityAutoConfiguration` (RequestIdFilter)

---

## 1. 현황 분석

### 1.1 dmes-ref 방식

```
HTTP 요청 진입
  │
  ▼
TraceIdLoggingFilter
  │  new MDCTemplate().mdc(null)
  │  → MDC["service_tag"] = 랜덤4자리 (예: "a7f3")
  │  → 내부에서 chain.doFilter() 실행
  │  → finally: MDC.clear()
  │
  ├─ ServiceController
  │    serviceTag = MDC.get("service_tag")   // "a7f3"
  │    requestTag = 파라미터 또는 랜덤8자리
  │
  ├─ OASIS 서비스 실행
  │    ├─ 서브서비스 호출 시
  │    │    new MDCTemplate().mdc("a7f3")
  │    │    → MDC["service_tag"] = "a7f3:x2b1"  (체이닝)
  │    │
  │    ├─ 병렬 게이트웨이 (ParallelGatewayExecutable)
  │    │    부모 serviceTag를 읽어서 자식 스레드에 전파
  │    │    → 각 스레드: MDCTemplate.mdc("a7f3") → "a7f3:k9m2"
  │    │
  │    └─ 분리된 서브서비스 (SubServiceDisconnected...)
  │         별도 스레드에서 부모 serviceTag 전파
  │
  └─ finally: MDC.clear()   // 필터 레벨에서 전체 정리
```

**핵심 포인트:**
- `MDCTemplate.mdc(null)` → 최초 4자리 생성
- `MDCTemplate.mdc(existingTag)` → 기존 + ":" + 새 4자리 (체이닝)
- `MDCTemplate.mdc()` 의 finally 에서 `MDC.clear()` 호출
- OASIS 내부의 병렬/서브서비스 실행기에서 자동으로 부모 tag 전파

### 1.2 cactus-core 현재 방식

```
HTTP 요청 진입
  │
  ▼
TxIdFilter (HIGHEST_PRECEDENCE)
  │  MDC["txId"] = UUID 8자리 (임시)
  │  → finally: MDC.remove("txId")
  │
  ├─ JwtAuthenticationFilter (order=10)
  │    UserContextHolder, JwtTokenHolder 설정
  │
  ├─ OasisController → OasisServiceExecutor.execute()
  │    txId = TxIdGenerator.generate(userId, menuId)
  │    MDC["txId"] = 정식 txId 로 교체 (userId-menuId-timestamp-random3)
  │    → OASIS 서비스 실행 (MDCTemplate 미사용)
  │
  └─ finally 없음 (TxIdFilter에서 remove)
```

**문제점:**
1. OASIS의 `service_tag` 개념이 없음 → 서브서비스/병렬 호출 시 로그 추적 불가
2. OASIS `MDCTemplate`을 사용하지 않음 → 체이닝/전파 미동작
3. `MDCTemplate.mdc()`가 `MDC.clear()`를 호출하므로, 단순 조합 시 `txId`가 날아감

---

## 2. 핵심 제약사항

### 2.1 MDCTemplate의 MDC.clear() 문제

```java
// OASIS MDCTemplate.java
public void mdc(String serviceTag) {
    MDC.put("service_tag", ...);
    try {
        process();
    } finally {
        MDC.clear();    // ← txId 포함 MDC 전체 삭제!
    }
}
```

`MDCTemplate`은 finally에서 `MDC.clear()`를 호출한다.
이것은 `service_tag`만 지우는 게 아니라 **MDC 전체를 비운다**.

따라서 cactus-core의 `txId`와 공존하려면 이 동작을 고려해야 한다.

### 2.2 OASIS 내부 자동 전파

OASIS의 병렬/서브서비스 실행기들은 내부적으로:
1. 부모 스레드에서 `MDC.get(SERVICE_TAG)` 로 현재 태그를 읽음
2. 자식 스레드에서 `new MDCTemplate().mdc(parentTag)` 로 체이닝
3. 이 동작은 OASIS 코드 내부에서 이루어지므로 cactus-core가 개입할 필요 없음
4. **단, 최초 service_tag가 MDC에 설정되어 있어야 동작함**

---

## 3. 설계 안

### 3.1 안 A — TxIdFilter에서 MDCTemplate 래핑 (권장)

dmes-ref와 동일하게, 필터 레벨에서 `MDCTemplate`으로 전체 요청을 감싼다.
`txId`는 MDCTemplate 스코프 안에서 별도 설정한다.

#### 필터 체인 흐름

```
HTTP 요청 진입
  │
  ▼
TxIdFilter (HIGHEST_PRECEDENCE)
  │  ① MDCTemplate.mdc(null) 호출
  │     → MDC["service_tag"] = 랜덤4자리
  │     → process() 안에서:
  │        ② MDC["txId"] = UUID 8자리 (임시)
  │        ③ chain.doFilter(request, response)
  │     → finally: MDC.clear()  ← MDCTemplate이 전체 정리
  │
  ├─ JwtAuthenticationFilter (order=10)
  │    UserContextHolder 설정
  │
  ├─ OasisServiceExecutor.execute()
  │    ④ txId = TxIdGenerator.generate(userId, menuId)
  │    ⑤ MDC["txId"] = 정식 txId 교체 (기존 로직 유지)
  │    ⑥ OASIS 서비스 실행
  │       → 서브서비스: MDCTemplate.mdc("a7f3") → "a7f3:x2b1" (자동 체이닝)
  │       → 병렬: 부모 tag 자동 전파
  │
  └─ MDCTemplate finally: MDC.clear()   // 스레드 깨끗하게 정리
```

#### 코드 변경

**TxIdFilter.java (수정)**

```java
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TxIdFilter extends OncePerRequestFilter {

    private static final String TX_ID_KEY = "txId";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        new MDCTemplate() {
            @Override
            public void process() {
                // MDCTemplate이 service_tag를 설정한 후 여기 진입
                // txId는 service_tag 스코프 안에서 설정
                MDC.put(TX_ID_KEY, UUID.randomUUID().toString().substring(0, 8));
                try {
                    filterChain.doFilter(request, response);
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }
        }.mdc(null);
        // MDCTemplate.finally → MDC.clear() → txId + service_tag 모두 정리
    }
}
```

**OasisServiceExecutor.java (변경 없음)**

```java
// 기존 코드 그대로 유지
String txId = TxIdGenerator.generate(userId, menuId);
MDC.put("txId", txId);  // 정식 txId로 교체
// OASIS 서비스 실행 → 내부에서 service_tag 체이닝 자동 동작
```

#### MDC 상태 변화 타임라인

```
시점                    MDC["service_tag"]    MDC["txId"]
─────────────────────   ──────────────────    ─────────────
필터 진입 전            (없음)                (없음)
MDCTemplate.mdc(null)   "a7f3"                (없음)
TxIdFilter 내부         "a7f3"                "3e8f1a2b" (임시)
JWT 필터                "a7f3"                "3e8f1a2b"
OasisServiceExecutor    "a7f3"                "user01-PROD001-20260401-c3f" (정식)
OASIS 서브서비스        "a7f3:x2b1"           "user01-PROD001-20260401-c3f"
OASIS 병렬 스레드       "a7f3:k9m2"           (없음 — 별도 스레드)
필터 완료 후            (없음)                (없음)  ← MDC.clear()
```

#### 장점
- ✅ OASIS의 기존 체이닝/전파 메커니즘 100% 활용
- ✅ dmes-ref와 동일한 패턴 → 운영팀 학습 비용 0
- ✅ `MDC.clear()`가 필터 레벨에서 한 번만 → 깔끔한 정리
- ✅ OasisServiceExecutor 코드 변경 없음
- ✅ 비OASIS 엔드포인트(auth 등)도 service_tag 추적 가능

#### 단점
- ⚠️ cactus-core가 OASIS의 `MDCTemplate` 클래스에 직접 의존
- ⚠️ `MDCTemplate`이 checked exception을 process()에서 던질 수 없어서 RuntimeException 래핑 필요
- ⚠️ OASIS 없는 환경(테스트 등)에서 `MDCTemplate` 클래스 필요

---

### 3.2 안 B — 자체 ServiceTag 구현 + OASIS 연결

OASIS `MDCTemplate`에 의존하지 않고, cactus-core 자체적으로 service_tag를 관리한다.
OASIS 실행 시에만 `MDCTemplate`으로 위임한다.

#### 필터 체인 흐름

```
HTTP 요청 진입
  │
  ▼
TxIdFilter (HIGHEST_PRECEDENCE)
  │  ① MDC["service_tag"] = 랜덤4자리 (직접 설정)
  │  ② MDC["txId"] = UUID 8자리 (임시)
  │  → finally: MDC.clear()  ← 직접 정리
  │
  ├─ JwtAuthenticationFilter
  │
  ├─ OasisServiceExecutor.execute()
  │    ③ txId 정식 교체
  │    ④ serviceTag = MDC.get("service_tag") 보관
  │    ⑤ MDCTemplate.mdc(null) 로 OASIS 실행 래핑
  │       → OASIS 내부 체이닝 동작
  │    ⑥ MDCTemplate.finally → MDC.clear()  ← OASIS가 전체 비움!
  │    ⑦ MDC["txId"], MDC["service_tag"] 복원 필요
  │
  └─ TxIdFilter finally: MDC.clear()
```

#### 코드 변경

**TxIdFilter.java (수정)**

```java
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TxIdFilter extends OncePerRequestFilter {

    private static final String TX_ID_KEY = "txId";
    private static final String SERVICE_TAG_KEY = "service_tag";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {
        try {
            MDC.put(SERVICE_TAG_KEY, generateRandomString(4));
            MDC.put(TX_ID_KEY, UUID.randomUUID().toString().substring(0, 8));
            filterChain.doFilter(request, response);
        } finally {
            MDC.clear();
        }
    }

    private static String generateRandomString(int length) {
        // 랜덤 영숫자 4자리 생성
    }
}
```

**OasisServiceExecutor.java (수정 — MDC 저장/복원)**

```java
public CactusResponse execute(String serviceId, String action, CactusRequest request) {
    String txId = TxIdGenerator.generate(userId, menuId);
    MDC.put("txId", txId);

    // 현재 MDC 상태 백업
    String currentServiceTag = MDC.get("service_tag");

    try {
        // MDCTemplate 안에서 OASIS 실행
        final CactusResponse[] result = new CactusResponse[1];
        new MDCTemplate() {
            @Override
            public void process() {
                Map<String, TypedObject> inputs = requestConverter.convert(request, action);
                ServiceContext sc = ...;
                ServiceResult sr = serviceStarter.start(serviceId, sc);
                result[0] = responseConverter.convert(sr, txId);
            }
        }.mdc(null);
        // MDCTemplate.finally → MDC.clear() 발생!

        return result[0];
    } catch (...) {
        ...
    } finally {
        // MDC 복원 (후속 필터/로깅을 위해)
        if (currentServiceTag != null) MDC.put("service_tag", currentServiceTag);
        MDC.put("txId", txId);
    }
}
```

#### 장점
- ✅ 필터에서 service_tag 직접 제어 → OASIS 없는 엔드포인트도 동작
- ✅ 의미가 명확 — cactus-core가 주도권을 가짐

#### 단점
- ❌ **MDC 저장/복원 로직이 복잡** — MDCTemplate의 MDC.clear() 이후 복원 필요
- ❌ OASIS가 MDCTemplate.mdc(null)로 **새 service_tag를 생성** → 필터에서 설정한 tag와 다른 값
- ❌ 서브서비스 체이닝이 필터의 tag가 아닌 OASIS 내부 tag 기준으로 동작
- ❌ MDC 저장/복원 중 예외 발생 시 불일치 가능성
- ❌ 코드 복잡도 높음

---

### 3.3 안 C — OASIS 조건부 분기

OASIS 유무에 따라 동작을 분기한다.
OASIS가 classpath에 있으면 `MDCTemplate` 사용, 없으면 자체 구현.

#### 코드 구조

```java
// ServiceTagFilter.java — OASIS 있을 때
@ConditionalOnClass(MDCTemplate.class)
public class OasisServiceTagFilter extends OncePerRequestFilter {
    // 안 A 방식 (MDCTemplate 래핑)
}

// ServiceTagFilter.java — OASIS 없을 때
@ConditionalOnMissingClass("com.dongkuk.oasis.logger.MDCTemplate")
public class DefaultServiceTagFilter extends OncePerRequestFilter {
    // 자체 MDC 설정/정리
}
```

#### 장점
- ✅ OASIS 의존 없는 환경에서도 service_tag 사용 가능
- ✅ OASIS 있을 때는 완전한 체이닝 지원

#### 단점
- ❌ 필터가 2개 → 유지보수 복잡도 증가
- ❌ 동작이 환경에 따라 달라져서 디버깅 시 혼란
- ❌ 실질적으로 cactus-core는 항상 OASIS와 함께 쓰므로 과잉 설계

---

## 4. 비교 매트릭스

| 평가 항목 | 안 A (MDCTemplate 래핑) | 안 B (자체 구현) | 안 C (조건부 분기) |
|-----------|:---------------------:|:---------------:|:-----------------:|
| OASIS 체이닝 지원 | ✅ 완전 | ⚠️ 부분적 | ✅ 완전 |
| 병렬 스레드 전파 | ✅ 자동 | ⚠️ 부분적 | ✅ 자동 |
| txId 공존 | ✅ 자연스러움 | ❌ 복원 로직 필요 | ✅ 자연스러움 |
| 코드 복잡도 | 낮음 | 높음 | 중간 |
| 변경 파일 수 | 1개 (TxIdFilter) | 2개 (Filter + Executor) | 3개 (Filter 2 + Config) |
| OASIS 의존 | ✅ 있음 | 필터: 없음 / Executor: 있음 | 조건부 |
| dmes-ref 호환성 | ✅ 동일 패턴 | ⚠️ 다른 패턴 | ✅ 동일 패턴 |
| 운영팀 학습 비용 | 없음 | 있음 | 있음 |
| 비OASIS 엔드포인트 | ✅ service_tag 있음 | ✅ service_tag 있음 | ✅ service_tag 있음 |
| MDC 정리 안전성 | ✅ MDCTemplate이 보장 | ⚠️ 직접 관리 | ✅ MDCTemplate이 보장 |

---

## 5. 권장안: 안 A (MDCTemplate 래핑)

### 5.1 선택 이유

1. **OASIS 체이닝이 핵심 가치** — service_tag를 도입하는 이유가 OASIS 서브서비스/병렬 추적인데, MDCTemplate을 쓰지 않으면 이 가치가 절반으로 줄어든다.

2. **cactus-core는 항상 OASIS와 함께 사용** — oasis-core가 compileOnly가 아닌 api 의존이므로 MDCTemplate 클래스 가용성이 보장된다.

3. **MDC.clear() 문제가 자연 해결** — 필터 레벨에서 MDCTemplate이 감싸므로, 그 안에서 설정한 txId도 같은 라이프사이클로 관리된다.

4. **변경 최소** — TxIdFilter 1개 파일만 수정. OasisServiceExecutor 변경 불필요.

### 5.2 최종 설계

#### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `TxIdFilter.java` | MDCTemplate 래핑 적용, service_tag + txId 동시 설정 |
| `logback 패턴` (프로젝트측) | `%X{service_tag}` 추가 권장 |

#### TxIdFilter 최종 코드

```java
package com.dongkuk.cactus.web.filter;

import com.dongkuk.oasis.logger.MDCTemplate;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * 요청 진입 시 service_tag(OASIS 추적용)와 임시 txId를 MDC에 설정한다.
 *
 * <p>OASIS MDCTemplate으로 전체 요청을 감싸서:
 * <ul>
 *   <li>service_tag: 랜덤 4자리 → OASIS 서브서비스 호출 시 자동 체이닝</li>
 *   <li>txId: 임시 UUID 8자리 → OasisServiceExecutor에서 정식 txId로 교체</li>
 * </ul>
 * 요청 완료 시 MDCTemplate.finally에서 MDC 전체 클리어.
 */
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TxIdFilter extends OncePerRequestFilter {

    private static final String TX_ID_KEY = "txId";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        new MDCTemplate() {
            @Override
            public void process() {
                MDC.put(TX_ID_KEY, UUID.randomUUID().toString().substring(0, 8));
                try {
                    filterChain.doFilter(request, response);
                } catch (ServletException | IOException e) {
                    throw new RuntimeException(e);
                }
            }
        }.mdc(null);
    }
}
```

#### 로그 출력 예시

**logback 패턴 (프로젝트 application.yml에서 설정):**
```
%d{HH:mm:ss.SSS} [%thread] [%X{service_tag}] [%X{txId}] %-5level %logger{36} - %msg%n
```

**단일 서비스 호출:**
```
12:00:01.001 [http-1] [a7f3] [3e8f1a2b]          INFO  TxIdFilter - 요청 시작
12:00:01.010 [http-1] [a7f3] [user01-PROD-...-c3f] INFO  OasisServiceExecutor - PROD001/search
12:00:01.050 [http-1] [a7f3] [user01-PROD-...-c3f] INFO  MyTask - 쿼리 실행
12:00:01.100 [http-1] [a7f3] [user01-PROD-...-c3f] INFO  OasisServiceExecutor - 완료
```

**서브서비스 체이닝:**
```
12:00:01.001 [http-1] [a7f3]      INFO  MainService - 메인 서비스 시작
12:00:01.010 [http-1] [a7f3:x2b1] INFO  SubService1 - 서브서비스1 실행
12:00:01.020 [http-1] [a7f3:k9m2] INFO  SubService2 - 서브서비스2 실행
```

**병렬 게이트웨이:**
```
12:00:01.001 [http-1]   [a7f3]      INFO  ParallelGateway - 병렬 시작
12:00:01.010 [pool-1-1] [a7f3:p3q7] INFO  Branch1Task - 분기1 실행
12:00:01.010 [pool-1-2] [a7f3:r8s2] INFO  Branch2Task - 분기2 실행
12:00:01.050 [http-1]   [a7f3]      INFO  ParallelGateway - 병렬 합류
```

### 5.3 MDC 키 정리

| MDC 키 | 설정 시점 | 값 예시 | 용도 |
|--------|----------|---------|------|
| `service_tag` | TxIdFilter (MDCTemplate) | `a7f3` → `a7f3:x2b1` | OASIS 서비스 호출 체인 추적 |
| `txId` | TxIdFilter (임시) → OasisServiceExecutor (정식) | `user01-PROD001-20260401-c3f` | 비즈니스 트랜잭션 식별 |

**역할 구분:**
- `service_tag` = **기술적 추적** (어떤 코드 경로를 탔는지, 호출 깊이)
- `txId` = **비즈니스 추적** (누가, 어떤 메뉴에서, 어떤 서비스를)

---

## 6. 추가 고려사항

### 6.1 Checked Exception 래핑

`MDCTemplate.process()`는 checked exception을 선언하지 않으므로, `filterChain.doFilter()`의 `ServletException`/`IOException`을 `RuntimeException`으로 래핑해야 한다. 이는 dmes-ref의 `TraceIdLoggingFilter`에서도 동일한 패턴이다.

```java
// dmes-ref도 동일한 패턴 사용
catch (Exception e) {
    throw new RuntimeException(e);
}
```

서블릿 컨테이너는 `RuntimeException`을 받으면 원래의 checked exception을 unwrap하므로 동작에는 영향 없다.

### 6.2 비OASIS 엔드포인트 동작

`/api/auth/login`, `/api/auth/refresh` 등 OASIS를 거치지 않는 엔드포인트도 TxIdFilter를 통과하므로:
- `service_tag` = 랜덤 4자리 (체이닝 없이 단일 값)
- `txId` = 임시 UUID 8자리 (OasisServiceExecutor를 거치지 않으므로 정식 txId로 교체되지 않음)

인증 관련 로그에서도 `service_tag`와 `txId`가 출력되어 추적에 유리하다.

### 6.3 테스트 시 고려

단위 테스트에서 `MDCTemplate`이 classpath에 없으면 `TxIdFilter`가 동작하지 않는다.
cactus-core는 oasis-core를 api 의존으로 가지고 있으므로 테스트에서도 `MDCTemplate` 사용 가능하다.

```groovy
// build.gradle (현재 상태)
api 'com.dongkuk:oasis-core:5.0.0'  // MDCTemplate 포함
```

### 6.4 향후 확장

service_tag 체계가 자리잡으면, 이후 Phase에서 구현할 기능들과 자연스럽게 연결된다:

| 기능 | service_tag 활용 |
|------|-----------------|
| 요청 감사 로깅 (RequestLog) | txId + service_tag를 함께 DB에 저장 |
| 에러 추적 | 에러 발생 시 service_tag로 호출 경로 역추적 |
| 성능 모니터링 | service_tag 체인 길이로 호출 깊이 분석 |
| 분산 로그 검색 | Kibana/Loki에서 service_tag로 관련 로그 일괄 조회 |
