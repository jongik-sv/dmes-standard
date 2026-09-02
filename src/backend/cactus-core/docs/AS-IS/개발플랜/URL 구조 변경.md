# [완료] [cactus-core] URL 구조 변경 이력

> 일시: 2026-04-01 09:00 (원본) / 2026-04-26 (현행 사실 박스)
> 프로젝트: cactus-core
>
> **구현 완료 사실 (마이그레이션 완료, 2026-04-26)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - **OasisController 매핑은 `/oasis/{serviceId}/{action}` 으로 고정.** 본문에 등장하는 두 옛 매핑(`/api/{serviceGroup}/{serviceId}/{action}` 1차안, `/${cactus.oasis.service-group}/api` 2차안) 은 모두 폐기되었다.
> - `cactus.oasis.service-group` 프로퍼티는 매핑 prefix 가 아니라 **BPMN 라우팅/로깅 식별** 용도로만 유지된다.
> - cactus-core 본체에서 AuthController 는 호출자 0 데드코드로 **삭제**. portal 은 자체 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 를 사용한다.
> - BFF 컨벤션: UI→BFF `/api/{module}/oasis/{serviceId}/{action}` (또는 `/api/{module}/nooasis/{path}`), BFF→BE 는 OASIS 그대로.
>
> 본 문서의 “수정 내용” 절은 옛 매핑 → 신 매핑으로의 의사결정 흐름 기록이며, 본문 코드 예시(옛 패키지 / 옛 매핑 포함)는 이력 보존 목적으로 그대로 유지한다.

## 1. 이슈/지시사항

- URL 구조를 `/{serviceGroup}/api/{serviceId}/{action}` 으로 변경
- serviceGroup은 각 모듈의 application.yml에서 설정
- Nginx가 serviceGroup prefix로 모듈별 라우팅

## 2. 수정 내용

### OasisProperties.java — serviceGroup 프로퍼티 추가

```java
// 추가
private String serviceGroup = "app";
// + getter/setter
```

### OasisController.java — URL 매핑 변경

```java
// 변경 전 (1차)
@RequestMapping("/api")
@PostMapping("/{serviceGroup}/{serviceId}/{action}")

// 변경 후 (1차) — 폐기됨
@RequestMapping("/${cactus.oasis.service-group}/api")
@PostMapping("/{serviceId}/{action}")

// 최종 (현행)
@RequestMapping("/oasis")
@PostMapping("/{serviceId}/{action}")
```

- serviceGroup이 PathVariable → application.yml 프로퍼티로 변경
- execute() 호출에서 serviceGroup 파라미터 제거
- **최종**: 매핑 prefix 는 `/oasis` 로 고정. `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지.

### OasisServiceExecutor.java — serviceGroup 파라미터 제거

```java
// 변경 전
public CactusResponse execute(String serviceGroup, String serviceId, String action, CactusRequest request)

// 변경 후
public CactusResponse execute(String serviceId, String action, CactusRequest request)
```

### AuthController.java — URL 매핑 변경 (※ 최종 삭제됨)

```java
// 변경 전
@RequestMapping("/api/auth")

// 변경 후 (1차)
@RequestMapping("/${cactus.oasis.service-group}/api/auth")
```

> **최종**: cactus-core 본체의 AuthController 는 호출자 0 데드코드로 삭제됨. portal 모듈은 자체 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 를 사용한다.

### JwtAuthenticationFilter.java — SKIP_PATHS 동적 처리

```java
// 변경 전: 고정 경로
SKIP_PATHS = ["/api/auth/login", "/api/auth/refresh", ...]

// 변경 후: suffix 매칭 (serviceGroup prefix 무관하게 동작)
SKIP_SUFFIXES = ["/api/auth/login", "/api/auth/refresh"]
SKIP_FIXED = ["/actuator/health", "/actuator/info"]
// path.endsWith() 로 매칭
```

### SecurityAutoConfiguration.java — 필터 URL 패턴 확장

```java
// 변경 전
registration.addUrlPatterns("/api/*");

// 변경 후
registration.addUrlPatterns("/*");
```

## 3. 결과

- 컴파일: BUILD SUCCESSFUL
- 테스트: 64개 전체 통과

### 업무 모듈 설정 예시

```yaml
# application.yml
cactus:
  oasis:
    service-group: production   # → URL: /production/api/{serviceId}/{action}
```

### Nginx 라우팅 예시

```nginx
location /production/ { proxy_pass http://production-was:8080; }
location /quality/    { proxy_pass http://quality-was:8080; }
location /master/     { proxy_pass http://master-was:8080; }
```

## 4. 후속 — Phase 7 컨벤션 (현 구현)

본 문서가 다룬 OASIS 매핑(`/oasis/{serviceId}/{action}`) 외에 cactus-core 는 다음 3 종 Inbound 컨트롤러를 추가로 등록한다 (`com.dongkuk.dmes.cactus.web.inbound`):

- `QueryController` — `/query/{queryId}` (MyBatis 단순 조회)
- `ServiceController` — `/service/{serviceId}`, `/query/service/{serviceId}` (OASIS 트랜잭션/조회)
- `LovController` — `/lov/master/{code}[/{group}]`, `/lov/query/{queryId}`, `/lov/service/{serviceId}` (LoV 전용)

상세 매핑·BFF↔BE 경로·헤더 정책은 [`../06-OasisController-상세설계.md`](../06-OasisController-상세설계.md) § 11 "Phase 7 — Query / Service / Lov 컨벤션" 참조. 루트 `CLAUDE.md` "Phase 7 신규 컨벤션" 표가 정으로 한다.
