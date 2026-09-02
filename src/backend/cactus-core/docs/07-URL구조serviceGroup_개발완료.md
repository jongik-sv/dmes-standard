# 07. URL 구조 (serviceGroup) (개발완료)

> 통합 원본: `개발플랜/URL 구조 변경.md`
> 구현 상태: **개발완료** (2026-04-26 최종 확정).

---

## 1. 최종 URL 구조

```
POST /oasis/{serviceId}/{action}
```

예시 (BE 직접 호출):
- `POST /oasis/secUser/search`
- `POST /oasis/workOrder/save`
- `POST /oasis/schedule/run`

> **BFF 컨벤션** (Phase 7, `frontend/portal/CLAUDE.md`):
> UI → BFF 는 `/api/{module}/oasis/{serviceId}/{action}` 로 호출하고, BFF 가 `/api/{module}/oasis/` prefix 를 제거 후 BE 의 `/oasis/{serviceId}/{action}` 으로 forward.

---

## 2. serviceGroup 프로퍼티 (URL 에서 분리됨)

`cactus.oasis.service-group` 은 **URL 경로에 들어가지 않음**. 다만 BPMN 라우팅·로깅·`OasisProperties` 식별 용도로 application.yml 에서 유지.

| 모듈 | service-group | application.yml |
|---|---|---|
| portal | `portal` | `cactus.oasis.service-group: portal` |
| mpp | `mpp` | `cactus.oasis.service-group: mpp` |
| aps | `aps` | `cactus.oasis.service-group: aps` |
| (신규 모듈) | 모듈명 | 동일 |

모듈 분리는 **NginX 또는 BFF의 `/api/{module}/` prefix** 로 처리되며, BE 자체의 URL 은 `/oasis/...` 로 통일.

---

## 3. 컨트롤러 매핑

```java
// cactus-core/web/inbound/OasisController.java
@ResponseBody
@RequestMapping("/oasis")
public class OasisController {
    private final OasisServiceExecutor executor;

    public OasisController(OasisServiceExecutor executor) {
        this.executor = executor;
    }

    @PostMapping("/{serviceId}/{action}")
    public CactusResponse handle(
            @RequestBody CactusRequest request,
            @PathVariable("serviceId") String serviceId,
            @PathVariable("action") String action) {
        return executor.execute(serviceId, action, request);
    }
}
```

> 컨트롤러는 단순한 단일 매핑이며, 모든 모듈에 동일하게 적용. 모듈 식별은 URL 외부 (NginX/BFF) 에서 수행.

---

## 4. 다른 inbound 컨트롤러 (Phase 7 추가)

`cactus-core/web/inbound/` 패키지에 다음 진입 컨트롤러가 함께 위치. `InboundAutoConfiguration` 이 **`@Bean` + 조건부**로 등록 (컴포넌트 스캔 미사용 — `@Controller` 어노테이션 부착 안 됨):

| 컨트롤러 | URL prefix | 등록 빈 메서드 | 활성 조건 | 정리본 |
|---|---|---|---|---|
| `OasisController` | `/oasis/{serviceId}/{action}` | `cactusOasisController` | `@ConditionalOnBean(OasisServiceExecutor.class)` | 03 |
| `ServiceController` | `/service/{serviceId}` | `cactusServiceController` | `@ConditionalOnBean(OasisServiceExecutor.class)` | (Phase 7) |
| `QueryController` | `/query/{queryId}` | `cactusQueryController` | `@ConditionalOnClass(SqlSession.class)` + `@ConditionalOnBean(SqlSession.class)` | (Phase 7) |
| `LovController` | `/lov/master/{code}/{group?}`, `/lov/query/{queryId}`, `/lov/service/{serviceId}` | `cactusLovController` | `@ConditionalOnClass(SqlSession.class)` + `@ConditionalOnBean({SqlSession, OasisServiceExecutor})` 둘 다 필요 | 11 (부분 구현) |

또한 `InboundAutoConfiguration` 은 **`WebMvcRegistrations` 빈 (`cactusWebMvcRegistrations`)** 을 등록해서 default `RequestMappingHandlerMapping` 을 `CactusRequestMappingHandlerMapping` 으로 교체. Spring 7 의 `isHandler` 가 `@Controller` 만 인식하도록 변경된 것에 대한 호환 처리 (Spring 6 까지의 동작 — 클래스 레벨 `@RequestMapping` 도 핸들러로 인식 — 복원).

> **AuthController 는 cactus-core 에 존재하지 않는다**. `CactusAuthAutoConfiguration` 은 `AuthService`/`PasswordEncoder` 빈만 등록하며 (`cactus.auth.enabled: true` 시), 실제 HTTP 엔드포인트(`/api/auth/login`, `/api/auth/refresh`)는 도메인 모듈이 자체 컨트롤러로 작성한다 (예: `portal/core` 의 `PortalAuthController`). 정리본 04 §2 참고.

---

## 5. JwtAuthenticationFilter 인증 제외

실제 구현 (`JwtAuthenticationFilter.java`):

```java
private static final List<String> SKIP_SUFFIXES = Arrays.asList(
    "/api/auth/login",
    "/api/auth/refresh"
);

private static final List<String> SKIP_FIXED = Arrays.asList(
    "/actuator/health",
    "/actuator/info"
);

private boolean shouldSkip(HttpServletRequest request) {
    String path = request.getRequestURI();
    if (SKIP_FIXED.stream().anyMatch(path::startsWith)) return true;
    return SKIP_SUFFIXES.stream().anyMatch(path::endsWith);
}
```

- `SKIP_SUFFIXES`: `endsWith` 매칭 — 인증 엔드포인트 (어떤 prefix든 무관)
- `SKIP_FIXED`: `startsWith` 매칭 — actuator 엔드포인트
- 두 리스트는 분리되어 있으므로 `/actuator/health` 는 `SKIP_FIXED` 에 속함

필터 등록은 `CactusWebSecurityAutoConfiguration` 의 SecurityFilterChain 명시 등록 + `setEnabled(false)` 로 servlet 자동 등록 차단.

---

## 6. 변경 이력

### 6.1 1차 안 (폐기)
```
POST /api/{serviceGroup}/{serviceId}/{action}
```
- `@PathVariable String serviceGroup` 으로 처리
- 단점: 모든 모듈이 동일 prefix `/api/` 를 공유, NginX 라우팅 분리 어려움

### 6.2 2차 안 (폐기)
```
POST /{serviceGroup}/api/{serviceId}/{action}
```
- `@RequestMapping("/${cactus.oasis.service-group}/api")` 으로 모듈별 자동 prefix
- 단점: 컨트롤러 매핑이 외부 프로퍼티에 의존, 단일 BE 노출 path 가 모듈마다 달라짐

### 6.3 최종 안 (현재)
```
POST /oasis/{serviceId}/{action}
```
- BE 컨트롤러는 단순 고정 매핑 `/oasis`
- 모듈 식별은 NginX 또는 BFF 의 `/api/{module}/` 외부 라우팅으로 분리
- `cactus.oasis.service-group` 은 URL에서 빠지고 식별·로깅 용도로만 유지

---

## 7. FE BFF 컨벤션 (참고, Phase 7)

| 의미 | UI → BFF | BFF → BE |
|---|---|---|
| OASIS | `/api/{module}/oasis/{serviceId}/{action}` | `/oasis/{serviceId}/{action}` |
| REST | `/api/{module}/rest/{path}` | `/{path}` 또는 `${MODULE_WAS_URL}/{path}` |
| Query (mybatis) | `/api/{module}/query/{queryId}` | `/query/{queryId}` |
| Query via service | `/api/{module}/query/service/{serviceId}` | `/query/service/{serviceId}` |
| Tx service | `/api/{module}/service/{serviceId}` | `/service/{serviceId}` |
| LoV master | `/api/{module}/lov/master/{code}/{group?}` | `/lov/master/{code}/{group?}` |
| LoV (mybatis) | `/api/{module}/lov/query/{queryId}` | `/lov/query/{queryId}` |
| LoV (service) | `/api/{module}/lov/service/{serviceId}` | `/lov/service/{serviceId}` |

소스: `frontend/portal/CLAUDE.md` Phase 7 BFF 컨벤션 표.

---

## 8. 운영 팁

- **새 모듈 추가**: `application.yml` 에 `cactus.oasis.service-group: <모듈명>` 만 설정 (URL 구조는 모든 모듈 공통)
- **NginX 설정**: `/api/{module}/oasis/* → ${module}-was/oasis/*` 단순 라우팅
- **로컬 개발**: 모듈별 다른 포트 사용 (예: portal 8081, mpp 8082) → BFF 가 `${MODULE_WAS_URL}` 환경변수로 분기

---

## 9. 관련 정리본

- 02 패키지구조 (autoconfigure/, web/inbound/)
- 03 OasisController 통합 레이어
- 04 인증보안 JWT (AuthController)
- 11 마스터코드 및 LoV (LovController 라우팅 부분 구현)
