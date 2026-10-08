# 08. MDC 추적 및 TxId (개발완료)

> 통합 원본: `개발플랜/ServiceTag 개발.md`
> 구현 상태: **개발완료** — TxIdFilter, RequestIdFilter, TxIdGenerator 구현됨. 단, **service_tag 체이닝·병렬게이트웨이 전파 부분은 미구현** (필요 시 별도 작업).

---

## 1. 핵심 컴포넌트

| 클래스 | 위치 | 역할 |
|---|---|---|
| `TxIdFilter` | `cactus-core/web/filter/TxIdFilter.java` | OASIS `MDCTemplate` 으로 요청을 감싸 `service_tag` 설정 + 임시 UUID 8자리를 MDC `txId` 에 설정 |
| `RequestIdFilter` | `cactus-core/web/filter/RequestIdFilter.java` | 동일 역할의 코어 구현체 (TxIdFilter 와 협업) |
| `TxIdGenerator` | `cactus-core/util/TxIdGenerator.java` | 정식 txId 생성: `{userId}-{menuId}-{yyyyMMddHHmmss}-{random3}` |

> **등록 방식**: `CactusWebSecurityAutoConfiguration#txIdFilterRegistration` 이 보안 필터 체인(FilterChainProxy) **바깥**의 servlet 필터로 등록한다(`Ordered.HIGHEST_PRECEDENCE + 10`, Spring Security 필터 -100 보다 앞). 각 모듈 SecurityConfig 는 SecurityFilterChain 에 추가하지 않는다. FilterChainProxy 가 체인 시작 전에 남기는 `Securing POST ...` 로그와 ClientKey 401 등 보안 단계 거절 로그에도 service_tag 가 붙게 하기 위해서다. 순서는 `FilterRegistrationBean` 의 order 로 정하므로 **TxIdFilter 에 `@Order` 어노테이션은 부착되지 않음**.

---

## 2. TxId 흐름

```
HTTP 요청 진입
  ↓ TxIdFilter (보안 필터 체인 바깥 servlet 필터, FilterChainProxy 보다 앞)
  ↓ new MDCTemplate() { ... }.mdc(null)        ← OASIS MDCTemplate 진입 (service_tag 자동 설정)
  ↓ MDC.put("txId", UUID.random()[0..8])       ← 임시 ID 8자리
  ↓ filterChain.doFilter(request, response)
  ↓ ...
  ↓ OasisController.handle()
  ↓ OasisServiceExecutor.execute()
  ↓ String txId = TxIdGenerator.generate(userId, menuId)
  ↓ MDC.put("txId", txId)                       ← 정식 ID로 교체
  ↓ ServiceContext 진입 (BPMN 실행)
  ↓ 서비스 메서드들의 모든 로그가 같은 txId 로 묶임
  ↓ 응답 시 ResponseMeta.txId 로 클라이언트에 반환
  ↓ MDCTemplate.finally → MDC 전체 클리어
```

**OASIS MDCTemplate 이 자동 설정하는 값**:
- `service_tag`: 랜덤 4자리 — OASIS 서브서비스 호출 시 자동 체이닝 (예: `a7f3` → `a7f3:x2b1` → `a7f3:x2b1:k9m2`)

(참고로 §6 미구현 항목에서 언급한 service_tag 체이닝은 **OASIS 코어가 제공**하므로 cactus 측은 단일 추적만 활용함)

---

## 3. 로그 패턴

### 3.1 logback-spring.xml (예시 패턴 — 도메인 모듈별 정의)

cactus-core 자체에는 logback 설정 파일이 없으며, 각 도메인 모듈(`portal`, `mpp` 등)이 자체 `logback-spring.xml` 에 다음과 같은 패턴을 정의해 사용한다:
```xml
<pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] [%X{txId}] %-5level %logger{36} - %msg%n</pattern>
```

`%X{txId}` 가 MDC 의 txId 값을 출력. service_tag 도 함께 표시하려면 `%X{service_tag}` 추가 가능.

### 3.2 출력 예시
```
2026-04-27 14:23:01.234 [http-nio-8082-exec-1] [adminUser-MPP_WORK_ORDER-20260427142301-547] INFO  WorkOrderService - search...
2026-04-27 14:23:01.245 [http-nio-8082-exec-1] [adminUser-MPP_WORK_ORDER-20260427142301-547] INFO  ...
```

같은 요청의 모든 로그가 동일한 txId로 식별 가능.

---

## 4. 클라이언트 추적

CactusResponse.meta.txId 로 응답되어 사용자 화면에 노출 가능. 운영 중 사용자가 에러 화면의 txId를 알려주면 백엔드 로그를 즉시 검색 가능.

---

## 5. ServiceContext 통합

OASIS 서비스 실행 시 inputs Map 에는 txId 가 자동 포함되어, BPMN 내부 ServiceTask 들도 같은 txId 컨텍스트에서 동작. `oasis-core` 의 `MDCTemplate` 이 ThreadLocal 누수 없이 정리 보장.

---

## 6. service_tag 체이닝 / 병렬 전파 — OASIS 자동 처리 + cactus 측 미적용

본 정리본의 두 가지 사실을 분리해서 본다:

### 6.1 OASIS MDCTemplate 자체의 동작 (cactus 가 받는 것)
- `new MDCTemplate() { ... }.mdc(null)` 호출 시 OASIS 코어가 `service_tag` 4자리를 자동 설정
- OASIS 내부에서 다른 ServiceContext 를 호출하면 OASIS 측이 체이닝 처리 (`a7f3` → `a7f3:x2b1`)
- cactus-core 의 `TxIdFilter` 는 이 MDCTemplate 를 그대로 사용하므로, **OASIS 코어가 제공하는 범위까지는 자동 동작**

### 6.2 cactus 측 미구현 (BPMN 외부 호출 트리)
- cactus 가 직접 만든 비즈니스 흐름(예: 컨트롤러 → 서비스 → 다른 서비스)에서 service_tag 체이닝은 **수동으로 MDCTemplate 호출하지 않으면 동작 안 함**
- BPMN 의 `parallelGateway` 분기 시 자식 스레드에 MDC 전파는 OASIS 측 구현 의존 — cactus 에서 별도 작업 안 함
- ModuleClient (15번 미개발) 도입 시점에 모듈 간 호출 시 service_tag 헤더 전파를 추가해야 분산 추적 통일

### 6.3 검토안 (`개발플랜/ServiceTag 개발.md` 원본)
원본 문서에 3가지 안 검토:
1. TraceId 단일 추적만 (**현재 cactus-core 구현 — 단 OASIS 가 service_tag 는 자동 처리**)
2. cactus 자체에서 ServiceTag 체이닝 명시 호출 추가
3. MDCTemplate 자동 전파 인터셉터 추가 → 권장 (모듈 간 통신 시점에 도입)

---

## 7. 운영 팁

- 로그 검색: `grep "[adminUser-MPP_WORK_ORDER-20260427" application.log`
- 분산 로그 (다중 모듈): NginX `X-Request-Id` 와 cactus txId 매핑 필요 시 RequestIdFilter 수정.
- 외부 모듈 호출 시 (15번 미개발 ModuleClient 도입 시점) txId 를 헤더로 전파하여 모듈간 추적 통일 권장.

---

## 8. 관련 정리본

- 05 웹 공통 (필터 체인)
- 06 감사엔티티 (AuditHolder + 같은 ThreadLocal 패턴)
- 12 요청 로그 DB 저장 (미개발) — txId 기반 영구 추적
- 15 HTTP 클라이언트 / 모듈 간 통신 (미개발) — txId 헤더 전파
