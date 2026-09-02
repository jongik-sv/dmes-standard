# SECURITY GUIDE

> 2026-07-09에 공통 가이드 영역으로 이동했다. 이 문서는 APS 전용이 아니라 {CLIENT} 분기 공통 보안 가이드다.

이 문서는 {CLIENT} 분기 (`com.dongkuk.dmes.*`) 기준의 인증/인가 처리 구성, 운영 설정, 점검 항목을 정리한다. 백엔드(Spring) 와 프론트엔드(Next.js) 양쪽 모두 `cactus-core` 가 제공하는 공통 보안 컴포넌트를 우선 사용한다.

> 모듈 명명: 현 분기 (2026-07-09 기준) 의 백엔드 모듈은 `mcm`, `mpn`, `mpp`, `mqc`, `mls` 5종 이다. 구 설계에서 언급되던 `portal` 모듈은 `mcm` 으로 통합되었고, `aps` 단독 부트 모듈은 없다 — `aps-core` 는 라이브러리 모듈로 `mpn-api` 에 포함되어 단일 부트 앱으로 기동된다.

## 1. 아키텍처 요약

### 1-1. 백엔드 (Spring) — cactus-core 통합

- `cactus-core` 가 다음 필터 4종 + AutoConfiguration 2종을 제공한다.
  - 필터
    - `TxIdFilter` (`cactus.web.filter`) — MDC `txId` 발급. 가장 앞단에서 동작해야 ClientKey 401 short-circuit 응답에도 `txId` 가 부여된다.
    - `RequestIdFilter` (`cactus.web.filter`) — 요청 추적용 `X-Request-Id` 발급/전파.
    - `ClientKeyFilter` (`cactus.security.filter`) — `X-Client-Key` 헤더 검증 + BFF 신뢰 채널 사전 인증 (2-1 참조).
    - `JwtAuthenticationFilter` (`cactus.security.jwt`) — Bearer JWT 검증. 사전 인증이 있으면 검증 스킵.
  - 자동 구성
    - `CactusAuthAutoConfiguration` — default 비활성. `cactus.auth.enabled: true` 일 때만 활성화된다 (`@ConditionalOnProperty(matchIfMissing = false)`).
    - `CactusWebSecurityAutoConfiguration` — `@ConditionalOnMissingBean(SecurityFilterChain.class)` 로 default `SecurityFilterChain` 을 등록한다. 즉, 모듈에서 자체 `SecurityFilterChain` 빈을 정의하면 cactus default 는 자동으로 비활성화된다. `ClientKeyFilter` 빈은 `cactus.security.client-key` 프로퍼티가 정의된 경우에만 등록된다.
- 모듈별 적용 정책 (실측)
  - **mpp** — 자체 `SecurityConfig` 없음. cactus default `SecurityFilterChain` 사용.
  - **mls** — 자체 `SecurityConfig` 없음. cactus default `SecurityFilterChain` 사용 (mpp 와 동일).
  - **mqc** — `MqcSecurityConfig` 가 존재하며 `anyRequest().permitAll()` 로 모든 요청 허용. **임시 비활성 상태** — 운영 전환 전에 mpn 패턴 (permitAll 5종 + cactus 필터 체인) 으로 교체하거나, 본 SecurityConfig 를 제거해 cactus default 로 위임한다. 현 상태로는 ClientKey / JWT 검증이 모두 우회되므로 외부 네트워크에 노출하지 않는다.
  - **mpn** (= aps 부트) — 자체 `SecurityConfig` 존재. permitAll 대상은 `/auth/**`, `/api/auth/**`, `/swagger-ui/**`, `/v3/api-docs/**`, `/actuator/health` 5종. 필터 체인은 `txId → requestId → clientKey → jwt → UsernamePasswordAuthenticationFilter`.
  - **mcm** (구 portal 역할) — 자체 `SecurityConfig` 존재. mcm-core 의 `McmSecurityDefaults.applyTo()` 로 default URL 매처를 적용한 뒤 사이트 특이 매처 (`/kafkaApi/**` internal-only, `/kmc/**` authenticated) 를 추가한다. 필터 체인은 `txId → requestId → clientKey → jwt → revokedToken → endpointPerm → UsernamePasswordAuthenticationFilter`. `@EnableMethodSecurity` 활성.
    - `RevokedTokenFilter` — JTI 블랙리스트 (mcm/api)
    - `EndpointPermissionFilter` — `PERM_BUTTON.endpoint` 기반 동적 권한 체크 (mcm-core)
  - **aps-core** — 라이브러리 모듈. production `SecurityConfig` 없음. `TestSecurityConfig` 만 테스트용으로 존재한다. 실제 부트 시 인증/인가는 호스트 모듈 (현재 `mpn-api`) 의 `SecurityConfig` 가 담당한다.
    - 중요 mutation은 aps-core 서비스 method guard가 최종 인가 경계다. 시나리오 확정 `POST /api/scenarios/{scenarioId}/finalize`는 `ROLE_ADMIN` 또는 `ROLE_PLANNER`만 허용하고 `ROLE_VIEWER`는 403으로 거부한다.
- mcm 의 default permitAll 매처 (`McmSecurityDefaults`)
  - permitAll: `/api/auth/**`, `/actuator/health`, `/actuator/info`
  - `ROLE_SYSADMIN`: `/oasis/secUser/save`, `/oasis/secRole/save`, `/oasis/secPerm/save`, `/oasis/secObj/save`, `/oasis/secMenu/save`, `/oasis/secRolePerm/save`, `/oasis/secUserRole/save`, `/oasis/secRoleGroup/{save,assignRoles,assignUsers}`, `/oasis/secCode/save`, `/oasis/secUser/resetPassword`
  - authenticated: `/oasis/secUser/{myMenus, myMenusTree, myPermissions}`, `/oasis/secFavorite/**`, `/oasis/secMenu/recordAccess`
- 폐기 항목
  - 구 `AuthController` (cactus 측 데드코드) 는 삭제됨. 인증 엔드포인트는 `McmAuthController` (`mcm/lib`) 가 `/api/auth/**` 로 제공한다.

### 1-2. 프론트엔드 (Next.js) — NextAuth + BFF

- 로그인은 `NextAuth` `credentials` provider 로 처리한다 (`shared/src/auth/server.ts`).
- 세션 유지는 `jwt` 전략 + 쿠키 기반 세션 토큰(`session-token`).
- NextAuth 는 로그인 시 `${BACKEND_API_URL}/api/auth/login` 을 직접 호출한다. 인증 path 는 ClientKey skip 대상이므로 `X-Client-Key` 헤더는 전송하지 않는다.
- BFF (`/api/{module}/oasis/{serviceId}/{action}`, `/api/{module}/rest/*`, Phase 7 `query/service/lov` 등) 호출 시에는 **사용자 JWT 를 forward 하지 않는다.** 대신 BFF 신뢰 채널 헤더 3종을 전달한다 (`shared/src/oasis-proxy/index.ts`):
  - `X-Client-Key: ${BACKEND_CLIENT_KEY}`
  - `X-Authenticated-User: ${session.userId}`
  - `X-Authenticated-Role: ${session.roles.join(",")}` (단일 역할이면 `session.role`)

## 2. ClientKey / 사용자 컨텍스트 헤더 / RequestId

### 2-1. `X-Client-Key` + BFF 신뢰 채널 모델

- 신뢰 가능한 BFF/서버에서 백엔드를 호출할 때 첨부하는 사전 공유 키.
- 키 우선순위 (`ClientKeyFilter`)
  1. 환경 변수 `BACKEND_CLIENT_KEY` (운영 권장)
  2. `application.yml` 의 `cactus.security.client-key` (개발 default)
  - 두 값이 모두 비어 있으면 검증 스킵 (개발 편의).
- skip path default: `/auth/`, `/api/auth/`, `/actuator/` (prefix 매칭, `cactus.security.client-key-skip-paths` 로 override 가능).
- 검증 성공 시 동작
  - `X-Authenticated-User` 헤더 값을 principal 로 `UsernamePasswordAuthenticationToken` 을 생성해 `SecurityContextHolder` 에 set.
  - `X-Authenticated-Role` 헤더 값은 콤마로 분리한 뒤 각 토큰을 `ROLE_` prefix (이미 있으면 유지) 로 normalize 해서 `SimpleGrantedAuthority` 리스트로 set.
  - 사전 인증이 set 되면 후속 `JwtAuthenticationFilter` 는 보존 분기로 진입해 JWT 검증을 스킵한다.
  - 즉 BFF↔BE 구간은 shared secret 으로 신뢰하고, 사용자 컨텍스트는 별도 헤더로 전달한다.
- 인증 엔드포인트 (`/api/auth/login` 등) 는 ClientKey skip 대상이라 NextAuth → 백엔드 로그인 호출에는 키를 붙이지 않는다.

### 2-2. Bearer JWT

- 사용자 인증 토큰. cactus `JwtAuthenticationFilter` 가 `Authorization: Bearer` 헤더를 검증한다.
- 검증 성공 시 `SecurityContext` 에 사용자 principal 이 주입되며, RBAC 권한 평가의 근거가 된다.
- 단, **BFF → BE 경로에서는 Bearer 가 forward 되지 않는다.** 사용자 JWT 를 직접 들고 BE 를 호출하는 시나리오 (브라우저 외 클라이언트, 백오피스 스크립트 등) 에서만 사용된다.

### 2-3. `X-Request-Id` / `txId`

- 요청 추적/상관관계 식별용 ID. cactus `RequestIdFilter` 가 자동 발급/전파한다.
- `TxIdFilter` 는 별도의 MDC `txId` 를 가장 앞단에서 발급해 ClientKey 401 short-circuit 응답에도 추적 ID 가 남도록 한다.
- BFF 와 백엔드 로그를 연결할 때 사용한다.

## 3. 브라우저 쿠키 기반 인증(세션)

### 적용 방식

- NextAuth 세션 토큰을 쿠키에 저장한다.
- 인증 라우트/렌더링에서 `getServerSession` 또는 `getToken` 으로 검증한다.
- 권한은 `session.user` 기반으로 확인한다.

### 쿠키 구성 포인트

- `session-token`, `callback-url` 등을 앱별 prefix (`authCookiePrefix`) 로 분기한다.
- `path: "/"`, `sameSite: "Lax"`, `httpOnly: true` 사용.
- `Secure` 값은 `NEXTAUTH_URL` 프로토콜 기반으로 결정된다 (`startsWith("https://")`).
- `AUTH_SECRET` 환경변수가 서명/검증의 루트 신뢰점이다.

해당 설정은 `shared/src/auth/cookies.ts`, `shared/src/auth/server.ts` 에서 확인한다.

### 장단점

- 장점
  - 브라우저가 경로별·도메인별로 자동 전송
  - `HttpOnly` 로 JS 접근을 제한할 수 있음
  - 페이지 SSR/CSR 전환에서 자연스럽게 동작
- 제한점
  - 토큰이 탈취되면 브라우저 쿠키를 갖고 있는 모든 요청에 영향
  - 서버 DB 세션 스토어가 없는 구조에서는 특정 세션 개별 강제 회수가 어렵다 (5번 참조).

## 4. Bearer JWT 기반 인증

- BFF 가 아닌 외부 클라이언트가 직접 BE 를 호출할 때 사용한다 (BFF 경로에서는 Bearer 미전송).
- 토큰이 유효하면 `sub/role/exp` 기반으로 정합성을 판단한다.
- 토큰 형식(`access_token`/`id_token`) 과 검증은 `shared/src/auth/server.ts` 에서 수행한다.

### 사용 시나리오

- 브라우저가 아닌 클라이언트(모바일/스크립트) 에서 명시적으로 인증 정보를 전달할 때
- 서로 다른 서브도메인/서비스 호출에서 쿠키 자동 전송 의존을 피할 때

### 장단점

- 장점
  - 토큰 단위 제어가 명시적
  - 토큰 만료/갱신 정책을 API 레이어에 맞춰 조정하기 쉬움
- 제한점
  - JS 가 토큰을 다루면 XSS 노출 시 즉시 유출 가능
- 운영 규칙
  - `access_token` 같은 민감 토큰은 `localStorage`/`sessionStorage` 보관 지양
  - Bearer 사용 시 저장 위치, 전송 대상, 만료 정책을 고정한다.

## 5. 현재 시스템에서의 세션 무효화 범위

- 현재 구조(`session: "jwt"`) 는 DB 세션 스토어가 없으므로 특정 단일 세션 토큰을 즉시 회수하기가 어렵다.
- 가능한 조치
  - 현재 브라우저 세션 종료: `signOut()` 또는 쿠키 삭제
  - 전체 강제 무효화: `AUTH_SECRET` 교체
  - 사용자/토큰 정밀 무효화 구현
    - mcm 의 `RevokedTokenFilter` + JTI 블랙리스트 테이블 (현행)
    - DB 버전 필드(`tokenVersion`) 추가
    - 혹은 `database` 세션 전략으로 전환

## 6. 분기 규칙(요청별)

- 브라우저 동작은 기본적으로 쿠키 기반 세션 인증.
- API 는 다음 우선순위로 판단한다.
  1. `ClientKeyFilter` 가 `X-Client-Key` 를 검증해 BFF 신뢰 채널이 성립하고 `X-Authenticated-User` 가 있으면 사전 인증 사용
  2. 사전 인증이 없으면 `JwtAuthenticationFilter` 가 `Authorization: Bearer` 검증
  3. 둘 다 실패 / 미제공이면 세션 fallback
  4. 모두 실패 시 401

## 7. 쿠키 보안 속성 가이드

### Domain

- 미지정 시 host-only 쿠키.
- 지정할 경우 하위 서브도메인까지 공유 대상.

### Path

- `"/"` 이면 전체 경로에 쿠키가 전달된다.
- 기능 단위 제한이 필요하면 경로를 좁히거나 경로 분기 정책을 둔다.

### SameSite

- `Lax` 는 기본적인 CSRF 방어에 유리하고, 일반 네비게이션에 자연스럽다.
- `None` 은 다른 도메인 요청 전송이 필요할 때 사용 (단, `Secure` 필수).

### Secure

- HTTPS 에서만 전송.
- 운영 환경에서는 필수.

## 8. 환경변수 / 설정 키 정리

| 변수 / 키 | 위치 | 용도 | 비고 |
|---|---|---|---|
| `BACKEND_CLIENT_KEY` | BFF env | BFF → 백엔드 호출 시 `X-Client-Key` 값 | 과거 `UI_CLIENT_KEY` 는 폐기 |
| `BACKEND_API_URL` | BFF env | NextAuth 가 직접 호출하는 백엔드 base URL + oasis-proxy fallback | 로그인 path: `/api/auth/login` |
| `AUTH_SECRET` | BFF env | NextAuth 세션 서명/검증 비밀키 | 배포 파이프라인으로 안전하게 관리 |
| `{MODULE}_WAS_URL` (예: `MCM_WAS_URL`, `MPN_WAS_URL`) | BFF env | 개발용 모듈 → WAS URL 매핑. 비어 있으면 `BACKEND_API_URL` fallback | 운영은 Nginx 단일 게이트웨이 |
| `BACKEND_CLIENT_KEY` | BE env | `ClientKeyFilter` 검증 키 (우선) | env 우선, yml fallback |
| `cactus.security.client-key` | BE yml | `ClientKeyFilter` 검증 키 (개발 default) | 미설정 시 `ClientKeyFilter` 빈 자체가 등록 안 됨 |
| `cactus.security.client-key-skip-paths` | BE yml | skip path 확장 (override) | 미설정 시 default 3종 적용 |
| `cactus.auth.enabled` | BE yml | `CactusAuthAutoConfiguration` 활성화 — `AuthService`, `SecUser` 엔터티 등 등록 | default `false`. mcm 만 `true` 사용 |

## 9. 보안 점검 체크리스트

- `AUTH_SECRET` 은 배포 파이프라인으로 안전하게 교체/관리한다.
- `BACKEND_CLIENT_KEY` 는 BFF 서버 환경변수로만 보관하고, 브라우저로 노출되지 않도록 한다.
- `next-auth` 쿠키/세션 설정은 앱별 `authCookiePrefix` 로 충돌을 방지한다.
- `Authorization` 헤더는 필요한 요청에서만 사용하고 로그에 노출하지 않는다.
- 미인가 응답은 상세 에러를 숨기고 `401` 로 일관되게 처리한다.
- **mpn** `SecurityConfig` 의 permitAll 목록이 의도한 5종 (`/auth/**`, `/api/auth/**`, `/swagger-ui/**`, `/v3/api-docs/**`, `/actuator/health`) 만 포함하는지 점검한다.
- **mcm** `SecurityConfig` 의 default 매처가 `McmSecurityDefaults.applyTo()` 를 통해 일괄 적용되는지, 사이트 특이 매처 (`/kafkaApi/**` internal-only, `/kmc/**` authenticated) 가 유지되는지 점검한다. `EndpointPermissionFilter` 의 servlet container 자동 등록은 `FilterRegistrationBean.setEnabled(false)` 로 차단되어 있어야 한다.
- **mqc** 의 `MqcSecurityConfig.anyRequest().permitAll()` 은 임시 비활성 상태다. 운영 전환 전 mpn 패턴으로 교체하거나 본 SecurityConfig 를 제거해 cactus default 로 위임하고, 그 전까지는 외부 노출 금지 (Nginx 차단 등) 를 함께 유지한다.
- **mpp** 가 자체 `SecurityConfig` 를 추가하지 않고 cactus default 를 그대로 사용하는지 확인한다.
- BFF 가 사용자 JWT (`Authorization: Bearer`) 를 forward 하지 않고, `X-Client-Key` + `X-Authenticated-User` + `X-Authenticated-Role` 3종 헤더만 전달하는지 점검한다.
- 시나리오 확정 감사의 `Scenario.selectedBy`와 `ScenarioFinalizeLog.finalizedBy`가 요청 body가 아니라 동일한 `SecurityContext` principal인지 점검한다.
- ClientKey skip path 가 default (`/auth/`, `/api/auth/`, `/actuator/`) 외에 임의로 확장되지 않았는지 점검한다.
- `cactus.security.client-key` 가 운영 yml 에 평문으로 노출되어 있지 않은지 점검한다 (운영은 `BACKEND_CLIENT_KEY` env 사용).
