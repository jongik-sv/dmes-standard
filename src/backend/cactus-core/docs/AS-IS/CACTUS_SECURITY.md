# Cactus - 인증 보안 상세 설계

> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - cactus-core 본체에서 **AuthController 는 호출자 0 데드코드로 삭제**됨. 본 문서의 AuthController 관련 절(§3.1, §3.3, §5.2 등)은 portal 모듈의 자체 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 를 참조한다.
> - 신규 표준 필터: **ClientKeyFilter**(`X-Backend-Client-Key` 헤더 검증), **RequestIdFilter**(요청 식별자 발급/전파).
> - 신규 AutoConfiguration: **CactusAuthAutoConfiguration**(default 비활성, `cactus.auth.enabled: true` 시 활성), **CactusWebSecurityAutoConfiguration**(default `SecurityFilterChain`, `@ConditionalOnMissingBean`).
> - env: 클라이언트 키 환경변수는 `BACKEND_CLIENT_KEY` 로 통일 (구 `UI_CLIENT_KEY` 폐기).

> **현행 사실 — BFF↔BE 헤더 4 종 (2026-04-26)**
>
> 본 문서·도해(§1.2, §3 등)에 등장하는 `X-Backend-Client-Key` 라는 헤더명은 **옛 표현이며, 현 표준은 `X-Client-Key`** 이다. 실제 cactus-core `ClientKeyFilter` 가 검증하는 헤더명은 `X-Client-Key` (`HEADER_CLIENT_KEY = "X-Client-Key"`) 이며, 루트 `CLAUDE.md` "Phase 7 신규 컨벤션" 표·BFF 프록시 정책과 일치한다.
>
> | 헤더 | 발급 주체 | BE 측 처리 |
> |---|---|---|
> | `Authorization` | BFF (Bearer JWT) | `JwtAuthenticationFilter` 가 검증 |
> | `X-Client-Key` | BFF (env `BACKEND_CLIENT_KEY`) | `ClientKeyFilter` 가 BFF→BE 게이트키 검증 |
> | `X-Authenticated-User` | BFF | 컨텍스트 보조용 (BE 는 신뢰만, 직접 검증 안 함) |
> | `X-Authenticated-Role` | BFF | 컨텍스트 보조용 (동상) |
>
> 본문에 남아 있는 `X-Backend-Client-Key` 토큰은 이력 보존 목적으로 일괄 치환하지 않는다. 신규 작성·신규 코드는 반드시 `X-Client-Key` 로 작성한다.

## 1. 개요

### 1.1 설계 원칙

| 원칙 | 설명 |
|------|------|
| **Cactus가 인증 전체 제공** | 로그인/토큰발급/검증/필터/컨텍스트 관리 모두 Cactus에 포함 |
| **프로젝트별 Fork** | 각 프로젝트는 Cactus를 복제하여 인증 로직을 프로젝트에 맞게 커스터마이징 |
| **BFF가 토큰 보관** | JWT는 httpOnly 쿠키에 저장, 브라우저 JS 접근 불가 |
| **Stateless** | 서버 세션 없음, 모든 인증 정보는 JWT에 포함 |

### 1.2 토큰 흐름 전체 그림

```
                         ┌─── Docker Internal Network ───────────────────────────┐
                         │                                                        │
Browser ←→ Next.js BFF ←┼→ Portal (:8081)     ← 로그인/토큰발급/갱신/사용자관리  │
           (:3000)       │                                                        │
  httpOnly   Bearer      ├→ Operation (:8082)  ← JWT 검증만                       │
  cookie     header      ├→ Logistics (:8083)  ← JWT 검증만                       │
                         ├→ Quality (:8084)    ← JWT 검증만                       │
                         └→ Equipment (:8085)  ← JWT 검증만                       │
                                                                                  │
                         └────────────────────────────────────────────────────────┘

Cactus (cactus-core 본체):
  ├── (※ AuthController 는 cactus-core 본체에서 삭제됨 — portal 의 PortalAuthController 사용)
  ├── (※ AuthService 도 cactus-core 본체에서는 미제공 — portal 모듈에서 자체 구현)
  ├── JwtTokenProvider         → 토큰 생성/검증
  ├── JwtAuthenticationFilter  → 매 API 요청마다 JWT 검증
  ├── ClientKeyFilter          → `X-Backend-Client-Key` 헤더 검증 (cactus 표준)
  ├── RequestIdFilter          → 요청 식별자 발급/전파 (cactus 표준)
  ├── UserContextHolder        → 검증된 사용자 정보를 ThreadLocal에 보관
  └── JwtTokenHolder           → 모듈 간 통신 시 토큰 전파용

  * portal 모듈은 자체 PortalAuthController/AuthService(`com.dongkuk.dmes.mcm.*`) 로
    DB 조회/비밀번호 검증 로직을 구현한다.
```

---

## 2. JWT 토큰 설계

### 2.1 토큰 종류

| 토큰 | 용도 | 만료 | 저장 위치 |
|------|------|------|----------|
| **Access Token** | API 인증 | 8시간 (MES 1교대 기준) | httpOnly 쿠키 `access_token` |
| **Refresh Token** | Access Token 갱신 | 24시간 | httpOnly 쿠키 `refresh_token` |

> MES 특성: 교대 근무 8시간 동안 재로그인 없이 사용해야 함.
> Refresh Token으로 교대 시간 내 토큰 만료 시 자동 갱신.

### 2.2 Access Token 구조

```
Header:
{
  "alg": "HS256",
  "typ": "JWT"
}

Payload:
{
  "sub": "admin",                           // 사용자 ID (USER_ID)
  "iss": "dmes-portal",                     // 발급자
  "iat": 1710302400,                        // 발급 시각
  "exp": 1710331200,                        // 만료 시각 (8시간 후)
  "jti": "550e8400-e29b-41d4-a716-446655440000",  // 토큰 고유 ID
  "userNm": "홍길동",                        // 사용자명 (USER_NM)
  "userEmpNo": "E20210001"                  // 사번 (USER_EMP_NO)
}

Signature:
  HMAC-SHA256(base64(header) + "." + base64(payload), secretKey)
```

### 2.3 Refresh Token 구조

```
Payload:
{
  "sub": "admin",                           // 사용자 ID
  "iss": "dmes-portal",                     // 발급자
  "iat": 1710302400,
  "exp": 1710388800,                        // 만료 시각 (24시간 후)
  "jti": "660e8400-e29b-41d4-a716-446655440001",
  "type": "refresh"                         // Refresh 토큰 구분용
}
```

> Access Token과 달리 userNm, userEmpNo를 포함하지 않음.
> Refresh 시 DB에서 최신 사용자 정보를 다시 조회하여 새 Access Token에 반영.

### 2.4 서명 키 관리

```yaml
# application.yml
cactus:
  jwt:
    secret: ${JWT_SECRET}           # 환경변수, 최소 256bit (32바이트 이상)
    issuer: dmes-portal
    access-token-expiry: 28800      # 8시간 (초)
    refresh-token-expiry: 86400     # 24시간 (초)
```

| 항목 | 값 |
|------|-----|
| **알고리즘** | HMAC-SHA256 (대칭키) |
| **키 길이** | 최소 256bit |
| **키 형식** | Base64 인코딩 문자열 |
| **키 관리** | 환경변수 `JWT_SECRET` (소스코드/설정파일에 하드코딩 금지) |
| **모든 모듈 동일 키** | Portal에서 발급한 토큰을 다른 모듈에서 검증해야 하므로 |

```
키 생성 예시:
  openssl rand -base64 48
  → "v4J8Kf9Lp2QmRtYw3NxAz7BcDeFgHi5jOk1MnPqSrUuVwXy0123456789Ab=="
```

---

## 3. 인증 흐름 상세

### 3.1 로그인

```
Browser (SPA)
  │ POST /api/auth/login
  │ body: { userId: "admin", password: "****" }
  ▼
Next.js BFF (/api/auth/login/route.ts)
  │ 1. 요청 본문을 그대로 Portal에 전달
  │
  │ POST http://dmes-portal:8081/api/auth/login
  │ body: { userId: "admin", password: "****" }
  ▼
Portal PortalAuthController → AuthService (cactus-core 본체에는 AuthController 없음)
  │ 1. userId로 사용자 조회 (TB_MCM_SEC_USER)
  │ 2. 계정 상태 확인 (USE_TP = 'Y', PWD_FAIL_COUNT < 5)
  │ 3. 비밀번호 조회 (TB_MCM_SEC_USER_PWD)
  │ 4. 비밀번호 검증 (BCrypt, USER_ENC_PWD)
  │ 5. 실패 시 PWD_FAIL_COUNT 증가 → 5회 이상이면 잠금
  │ 6. 성공 시:
  │    a. PWD_FAIL_COUNT 초기화
  │    b. UserInfo 생성 (USER_ID, USER_NM, USER_EMP_NO)
  │    c. Access Token + Refresh Token 발급
  │
  │ 응답: { success: true, data: { accessToken, refreshToken, userInfo } }
  ▼
Next.js BFF
  │ 1. 응답에서 accessToken, refreshToken 추출
  │ 2. httpOnly 쿠키로 설정:
  │    Set-Cookie: access_token=ey...; HttpOnly; Secure; SameSite=Strict; Path=/
  │    Set-Cookie: refresh_token=ey...; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh
  │ 3. userInfo만 클라이언트에 반환 (토큰은 반환하지 않음)
  │
  │ 응답: { success: true, data: { userInfo: { userId, userNm, userEmpNo } } }
  ▼
Browser
  │ 1. userInfo를 상태 관리에 저장 (Zustand/Redux)
  │ 2. 메인 화면으로 라우팅
```

### 3.2 API 호출 (토큰 검증)

```
Browser (SPA)
  │ POST /api/operation/workorder/search
  │ body: { params: { plantCode: "P01" }, payload: null }
  │ cookie: access_token=ey... (자동 전송)
  ▼
Next.js BFF (/api/[module]/[...serviceId]/route.ts)
  │ 1. 쿠키에서 access_token 추출
  │ 2. 토큰이 없으면 → 401 응답
  │ 3. Authorization: Bearer {access_token} 헤더로 변환
  │ 4. 대상 모듈 URL로 프록시
  │
  │ POST http://dmes-operation:8082/api/workorder/search
  │ header: Authorization: Bearer ey...
  ▼
Cactus JwtAuthenticationFilter (자동 등록, 모든 모듈 공통)
  │ 1. URL이 스킵 대상인지 확인 (login, refresh, health)
  │ 2. Authorization 헤더에서 "Bearer " 이후 토큰 추출
  │ 3. JwtTokenProvider.validateAndExtract(token)
  │    → 서명 검증, 만료 체크, Claims 파싱
  │ 4. UserInfo 생성 (sub → userId, userNm, userEmpNo)
  │ 5. UserContextHolder.set(userInfo) → ThreadLocal에 저장
  │ 6. JwtTokenHolder.set(token) → 모듈 간 통신 시 전파용
  │ 7. chain.doFilter() → 이후 처리 진행
  │ 8. finally: UserContextHolder.clear(), JwtTokenHolder.clear()
  ▼
OasisController
  │ → OasisServiceExecutor.execute("workorder", "search", params)
  ▼
응답: { success: true, data: { list: [...], totalCount: 150 } }
```

### 3.3 토큰 갱신 (Refresh)

```
Browser (SPA)
  │ (API 호출 시 401 응답 수신)
  │
  │ POST /api/auth/refresh
  │ cookie: refresh_token=ey... (자동 전송, Path=/api/auth/refresh)
  ▼
Next.js BFF (/api/auth/refresh/route.ts)
  │ 1. 쿠키에서 refresh_token 추출
  │ 2. Portal에 갱신 요청
  │
  │ POST http://dmes-portal:8081/api/auth/refresh
  │ body: { refreshToken: "ey..." }
  ▼
Portal PortalAuthController → AuthService (cactus-core 본체에는 AuthController 없음)
  │ 1. Refresh Token 검증 (서명, 만료, type="refresh")
  │ 2. sub에서 userId 추출
  │ 3. TB_MCM_SEC_USER 재조회 (USE_TP 체크)
  │ 4. 새 UserInfo 생성 (USER_NM, USER_EMP_NO 최신 반영) ★
  │ 5. 새 Access Token + 새 Refresh Token 발급 (Rotation)
  │
  │ 응답: { accessToken: "ey...(new)", refreshToken: "ey...(new)" }
  ▼
Next.js BFF
  │ 1. 새 토큰들을 httpOnly 쿠키로 교체
  │ 2. 클라이언트에 성공 응답
  ▼
Browser
  │ 원래 실패했던 API 재시도 (자동)
```

### 3.4 로그아웃

```
Browser (SPA)
  │ POST /api/auth/logout
  ▼
Next.js BFF (/api/auth/logout/route.ts)
  │ 1. access_token, refresh_token 쿠키 삭제
  │    Set-Cookie: access_token=; Max-Age=0; HttpOnly; Path=/
  │    Set-Cookie: refresh_token=; Max-Age=0; HttpOnly; Path=/api/auth/refresh
  │ 2. (선택) Portal에 로그아웃 알림 → 로그인 이력 업데이트
  ▼
Browser
  │ 1. 상태 초기화
  │ 2. 로그인 화면으로 라우팅
```

---

## 4. Cactus 보안 클래스 상세

### 4.1 패키지 구조

```
com.dongkuk.dmes.cactus/
├── common/
│   ├── ApiResponse.java              # 통일 API 응답 포맷
│   ├── BusinessException.java        # 비즈니스 예외 (ErrorCode 포함)
│   └── ErrorCode.java                # 에러 코드 enum (A001~A009)
├── security/
│   ├── auth/
│   │   ├── (※ AuthController.java 는 cactus-core 본체에서 삭제됨 — portal 사용)
│   │   ├── (※ AuthService.java 도 cactus-core 본체에서는 미제공 — portal 구현)
│   │   ├── LoginRequest.java         # 로그인 요청 DTO (record)
│   │   ├── RefreshRequest.java       # 갱신 요청 DTO (record)
│   │   ├── PasswordEncoder.java      # BCrypt 비밀번호 처리
│   │   ├── SecUser.java              # JPA Entity (TB_MCM_SEC_USER)
│   │   ├── SecUserPwd.java           # JPA Entity (TB_MCM_SEC_USER_PWD)
│   │   ├── SecUserRepository.java    # Spring Data JPA Repository
│   │   └── SecUserPwdRepository.java # Spring Data JPA Repository
│   ├── jwt/
│   │   ├── JwtTokenProvider.java     # 토큰 생성/검증 (issuer, jti 포함)
│   │   ├── JwtAuthenticationFilter.java # 요청마다 JWT 검증 필터
│   │   ├── JwtTokenHolder.java       # 현재 요청의 원본 토큰 보관 (ThreadLocal)
│   │   └── TokenPair.java            # Access + Refresh 토큰 쌍 (record)
│   ├── filter/
│   │   ├── ClientKeyFilter.java      # `X-Backend-Client-Key` 헤더 검증 (cactus 표준, 신규)
│   │   └── RequestIdFilter.java      # 요청 식별자 발급/전파 (cactus 표준, 신규)
│   └── context/
│       ├── UserInfo.java             # JWT에서 추출한 사용자 정보 (record)
│       ├── UserContextHolder.java    # ThreadLocal 사용자 컨텍스트
│       └── UserContext.java          # UserContextHolder의 Spring Bean 래퍼
└── autoconfigure/
    ├── CactusProperties.java                   # jwt + security 설정
    ├── CactusAutoConfiguration.java            # ComponentScan, EnableConfigurationProperties
    ├── CactusAuthAutoConfiguration.java        # 신규: default 비활성. `cactus.auth.enabled: true` 시 활성
    ├── CactusWebSecurityAutoConfiguration.java # 신규: default SecurityFilterChain (`@ConditionalOnMissingBean`)
    └── SecurityAutoConfiguration.java          # JWT 필터, UserContext Bean 자동 등록
```

### 4.2 JwtTokenProvider

```java
/**
 * JWT 토큰의 생성과 검증을 담당한다.
 * SecurityAutoConfiguration에서 Bean으로 등록된다.
 *
 * - 생성: AuthService에서 로그인/갱신 시 호출
 * - 검증: JwtAuthenticationFilter에서 매 요청마다 호출
 *
 * JJWT 0.12.x (jjwt-api / jjwt-impl / jjwt-jackson) 사용.
 */
public class JwtTokenProvider {

    private final SecretKey key;
    private final String issuer;
    private final long accessTokenExpiry;
    private final long refreshTokenExpiry;

    public JwtTokenProvider(CactusProperties properties) {
        CactusProperties.Jwt jwt = properties.getJwt();
        byte[] keyBytes = Decoders.BASE64.decode(jwt.getSecret());
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.issuer = jwt.getIssuer();
        this.accessTokenExpiry = jwt.getAccessTokenExpiry();
        this.refreshTokenExpiry = jwt.getRefreshTokenExpiry();
    }

    /** Access Token + Refresh Token 쌍을 생성한다. */
    public TokenPair generateTokenPair(UserInfo userInfo) {
        Instant now = Instant.now();

        String accessToken = Jwts.builder()
            .subject(userInfo.userId())
            .issuer(issuer)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusSeconds(accessTokenExpiry)))
            .id(UUID.randomUUID().toString())
            .claim("userNm", userInfo.userNm())
            .claim("userEmpNo", userInfo.userEmpNo())
            .signWith(key)
            .compact();

        String refreshToken = Jwts.builder()
            .subject(userInfo.userId())
            .issuer(issuer)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusSeconds(refreshTokenExpiry)))
            .id(UUID.randomUUID().toString())
            .claim("type", "refresh")
            .signWith(key)
            .compact();

        return new TokenPair(accessToken, refreshToken);
    }

    /** Access Token을 검증하고 UserInfo를 추출한다. */
    public UserInfo validateAndExtract(String token) {
        Claims claims = parseClaims(token);

        String tokenType = claims.get("type", String.class);
        if ("refresh".equals(tokenType)) {
            throw new JwtException("Not an access token");
        }

        return new UserInfo(
            claims.getSubject(),
            claims.get("userNm", String.class),
            claims.get("userEmpNo", String.class)
        );
    }

    /** Refresh Token을 검증하고 userId를 반환한다. */
    public String validateRefreshToken(String token) {
        Claims claims = parseClaims(token);

        String tokenType = claims.get("type", String.class);
        if (!"refresh".equals(tokenType)) {
            throw new JwtException("Not a refresh token");
        }

        return claims.getSubject();
    }

    /** 토큰 유효 여부를 boolean으로 반환한다. */
    public boolean isTokenValid(String token) {
        try {
            validateAndExtract(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
            .verifyWith(key)
            .requireIssuer(issuer)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }
}
```

### 4.3 JwtAuthenticationFilter

```java
/**
 * 모든 /api/** 요청에 대해 JWT를 검증하는 서블릿 필터.
 * 검증 성공 → UserContextHolder, JwtTokenHolder에 사용자 정보 세팅.
 * 검증 실패 → 401 JSON 응답 반환.
 *
 * SecurityAutoConfiguration에서 FilterRegistrationBean으로 자동 등록.
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);

    private final JwtTokenProvider tokenProvider;

    /**
     * JWT 검증을 건너뛸 경로.
     */
    private static final List<String> SKIP_PATHS = List.of(
        "/api/auth/login",
        "/api/auth/refresh",
        "/actuator/health",
        "/actuator/info"
    );

    public JwtAuthenticationFilter(JwtTokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain chain) throws ServletException, IOException {
        try {
            // 1. 스킵 경로 확인
            if (shouldSkip(request)) {
                chain.doFilter(request, response);
                return;
            }

            // 2. Authorization 헤더에서 토큰 추출
            var token = extractToken(request);
            if (token == null) {
                sendError(response, 401, "A001", "인증 토큰이 없습니다");
                return;
            }

            // 3. 토큰 검증 + UserInfo 추출
            UserInfo userInfo;
            try {
                userInfo = tokenProvider.validateAndExtract(token);
            } catch (ExpiredJwtException e) {
                sendError(response, 401, "A002", "토큰이 만료되었습니다");
                return;
            } catch (JwtException e) {
                sendError(response, 401, "A003", "유효하지 않은 토큰입니다");
                return;
            }

            // 4. ThreadLocal에 사용자 정보 세팅
            UserContextHolder.set(userInfo);
            JwtTokenHolder.set(token);

            log.debug("[JWT] 인증 성공: userId={}, empNo={}",
                userInfo.userId(), userInfo.userEmpNo());

            // 5. 다음 필터/컨트롤러 진행
            chain.doFilter(request, response);

        } finally {
            // 6. 반드시 ThreadLocal 클리어 (메모리 누수 방지)
            UserContextHolder.clear();
            JwtTokenHolder.clear();
        }
    }

    private String extractToken(HttpServletRequest request) {
        var header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }

    private boolean shouldSkip(HttpServletRequest request) {
        var path = request.getRequestURI();
        return SKIP_PATHS.stream().anyMatch(path::startsWith);
    }

    private void sendError(HttpServletResponse response, int status,
                           String errorCode, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("""
            {
              "success": false,
              "data": null,
              "message": "%s",
              "errorCode": "%s",
              "timestamp": "%s"
            }
            """.formatted(message, errorCode, LocalDateTime.now()));
    }
}
```

### 4.4 UserInfo (record)

```java
/**
 * JWT에서 추출한 사용자 정보. 불변(immutable).
 * ThreadLocal에 저장되므로 불변성이 중요하다.
 */
public record UserInfo(
    String userId,       // 사용자 ID (USER_ID, JWT sub)
    String userNm,       // 사용자명 (USER_NM)
    String userEmpNo     // 사번 (USER_EMP_NO)
) {}
```

### 4.5 UserContextHolder

```java
/**
 * ThreadLocal 기반 사용자 컨텍스트.
 * JwtAuthenticationFilter에서 set, finally에서 clear.
 * Controller / Service / BPMN Task 어디서든 get으로 접근.
 */
public final class UserContextHolder {

    private static final ThreadLocal<UserInfo> HOLDER = new ThreadLocal<>();

    private UserContextHolder() {}

    public static void set(UserInfo userInfo) {
        HOLDER.set(userInfo);
    }

    /** 현재 스레드의 사용자 정보. 비인증 상태면 null. */
    public static UserInfo get() {
        return HOLDER.get();
    }

    /** 사용자 ID. 비인증이면 "SYSTEM" (배치/스케줄러 등). */
    public static String getUserId() {
        var user = HOLDER.get();
        return user != null ? user.userId() : "SYSTEM";
    }

    /** 사번. 비인증이면 빈 문자열. */
    public static String getUserEmpNo() {
        var user = HOLDER.get();
        return user != null ? user.userEmpNo() : "";
    }

    public static void clear() {
        HOLDER.remove();
    }
}
```

### 4.6 UserContext (Spring Bean 래퍼)

```java
/**
 * UserContextHolder의 Spring Bean 래퍼.
 * 생성자 주입이 필요한 경우 사용.
 */
@Component
public class UserContext {

    public UserInfo getCurrentUser() {
        return UserContextHolder.get();
    }

    public String getCurrentUserId() {
        return UserContextHolder.getUserId();
    }

    public boolean isAuthenticated() {
        return UserContextHolder.get() != null;
    }
}
```

### 4.7 JwtTokenHolder / TokenPair

```java
/**
 * 현재 요청의 원본 JWT를 ThreadLocal에 보관.
 * 모듈 간 REST 호출 시 Authorization 헤더로 전파하기 위함.
 */
public final class JwtTokenHolder {

    private static final ThreadLocal<String> HOLDER = new ThreadLocal<>();

    private JwtTokenHolder() {}

    public static void set(String token)  { HOLDER.set(token); }
    public static String get()            { return HOLDER.get(); }
    public static void clear()            { HOLDER.remove(); }
}
```

```java
/** Access + Refresh 토큰 쌍. */
public record TokenPair(
    String accessToken,
    String refreshToken
) {}
```

### 4.8 SecurityAutoConfiguration

```java
/**
 * 보안 관련 Bean을 자동 등록한다.
 * Cactus 의존성 추가만으로 모든 모듈에 JWT 필터가 적용됨.
 */
@AutoConfiguration
@ConditionalOnProperty(prefix = "cactus.jwt", name = "secret")
public class SecurityAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public JwtTokenProvider jwtTokenProvider(CactusProperties properties) {
        return new JwtTokenProvider(properties);
    }

    @Bean
    public FilterRegistrationBean<JwtAuthenticationFilter> jwtFilter(
            JwtTokenProvider tokenProvider) {
        var registration = new FilterRegistrationBean<>(
            new JwtAuthenticationFilter(tokenProvider));
        registration.addUrlPatterns("/api/*");
        registration.setOrder(10);    // CorrelationIdFilter(1) → LoggingFilter(5) → JWT(10)
        return registration;
    }

    @Bean
    @ConditionalOnMissingBean
    public UserContext userContext() {
        return new UserContext();
    }
}
```

### 4.9 공통 클래스 (common 패키지)

```java
/** 통일된 API 응답 포맷 */
public class ApiResponse<T> {
    private final boolean success;
    private final T data;
    private final String message;
    private final String errorCode;
    private final LocalDateTime timestamp;

    public static <T> ApiResponse<T> ok(T data) { ... }
    public static <T> ApiResponse<T> error(String errorCode, String message) { ... }
}

/** 비즈니스 로직 예외. ErrorCode와 함께 사용. */
public class BusinessException extends RuntimeException {
    private final ErrorCode errorCode;

    public BusinessException(ErrorCode errorCode) { ... }
    public BusinessException(ErrorCode errorCode, String message) { ... }
}

/** 인증 에러 코드 */
public enum ErrorCode {
    AUTH_FAILED    ("A004", 401, "사용자 ID 또는 비밀번호가 일치하지 않습니다"),
    ACCOUNT_LOCKED ("A005", 403, "계정이 잠겼습니다. 관리자에게 문의하세요"),
    ACCOUNT_DISABLED("A006", 403, "비활성 계정입니다"),
    TOKEN_EXPIRED  ("A008", 401, "토큰이 만료되었습니다"),
    INVALID_TOKEN  ("A009", 401, "유효하지 않은 토큰입니다");

    private final String code;
    private final int httpStatus;
    private final String defaultMessage;
}
```

---

## 5. 인증 모듈 (Cactus 포함)

Cactus에 기본 포함되는 인증 코드. 각 프로젝트에서 Fork 후 DB 스키마, 비밀번호 정책 등을 커스터마이징한다.

### 5.1 패키지 위치

```
cactus-core/src/main/java/com/dongkuk/dmes/cactus/security/auth/
├── (※ AuthController.java 는 cactus-core 본체에서 삭제됨)
├── (※ AuthService.java 도 cactus-core 본체에서는 미제공)
├── LoginRequest.java          # 로그인 요청 (record)
├── RefreshRequest.java        # 갱신 요청 (record)
├── PasswordEncoder.java       # BCrypt 비밀번호 처리
├── SecUser.java               # JPA Entity (TB_MCM_SEC_USER)
├── SecUserPwd.java            # JPA Entity (TB_MCM_SEC_USER_PWD)
├── SecUserRepository.java     # Spring Data JPA Repository
└── SecUserPwdRepository.java  # Spring Data JPA Repository

portal 모듈(`com.dongkuk.dmes.mcm.*`):
└── PortalAuthController.java   # /auth/login, /auth/refresh, /auth/logout REST API
└── AuthService.java            # DB 조회/비밀번호 검증/잠금 정책
```

### 5.2 PortalAuthController (※ cactus-core 본체 AuthController 는 삭제됨)

```java
/**
 * 인증 전용 REST Controller — portal 모듈에서만 노출된다.
 * cactus-core 본체에는 더 이상 AuthController 가 없다(호출자 0 데드코드로 제거).
 */
@RestController
@RequestMapping("/auth")
public class PortalAuthController {

    private final AuthService authService;

    public PortalAuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ApiResponse<?> login(@RequestBody LoginRequest request) {
        var result = authService.login(request);
        return ApiResponse.ok(result);
    }

    @PostMapping("/refresh")
    public ApiResponse<?> refresh(@RequestBody RefreshRequest request) {
        var result = authService.refresh(request.refreshToken());
        return ApiResponse.ok(result);
    }

    @PostMapping("/logout")
    public ApiResponse<?> logout() {
        var userId = UserContextHolder.getUserId();
        authService.logout(userId);
        return ApiResponse.ok("로그아웃 되었습니다");
    }
}
```

### 5.3 AuthService (★ 커스터마이징 대상)

```java
/**
 * 인증 비즈니스 로직. JPA 기반.
 * 각 프로젝트 Fork 시 DB 스키마, 비밀번호 정책 등에 맞게 수정한다.
 */
@Service
public class AuthService {

    private final JwtTokenProvider tokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final SecUserRepository secUserRepository;
    private final SecUserPwdRepository secUserPwdRepository;
    private final int maxLoginFailures;

    public AuthService(JwtTokenProvider tokenProvider,
                       PasswordEncoder passwordEncoder,
                       SecUserRepository secUserRepository,
                       SecUserPwdRepository secUserPwdRepository,
                       CactusProperties properties) {
        this.tokenProvider = tokenProvider;
        this.passwordEncoder = passwordEncoder;
        this.secUserRepository = secUserRepository;
        this.secUserPwdRepository = secUserPwdRepository;
        this.maxLoginFailures = properties.getSecurity().getMaxLoginFailures();
    }

    @Transactional
    public Map<String, Object> login(LoginRequest request) {

        // 1. 사용자 조회 (TB_MCM_SEC_USER)
        SecUser user = secUserRepository.findById(request.userId())
            .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_FAILED));

        // 2. 계정 활성 확인 (USE_TP = 'Y')
        if (!user.isActive()) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
        }

        // 3. 계정 잠금 확인 (PWD_FAIL_COUNT)
        int failCount = user.getPwdFailCount() != null ? user.getPwdFailCount() : 0;
        if (failCount >= maxLoginFailures) {
            throw new BusinessException(ErrorCode.ACCOUNT_LOCKED);
        }

        // 4. 비밀번호 조회 (TB_MCM_SEC_USER_PWD)
        SecUserPwd userPwd = secUserPwdRepository.findById(request.userId())
            .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_FAILED));

        // 5. 비밀번호 검증 (BCrypt)
        if (!passwordEncoder.matches(request.password(), userPwd.getUserEncPwd())) {
            secUserRepository.incrementPwdFailCount(request.userId());
            throw new BusinessException(ErrorCode.AUTH_FAILED);
        }

        // 6. 성공 → 실패 횟수 초기화
        secUserRepository.resetPwdFailCount(request.userId());

        // 7. UserInfo 생성 + JWT 발급
        UserInfo userInfo = new UserInfo(
            user.getUserId(), user.getUserNm(), user.getUserEmpNo());
        TokenPair tokenPair = tokenProvider.generateTokenPair(userInfo);

        return Map.of(
            "accessToken", tokenPair.accessToken(),
            "refreshToken", tokenPair.refreshToken(),
            "userInfo", Map.of(
                "userId", userInfo.userId(),
                "userNm", userInfo.userNm() != null ? userInfo.userNm() : "",
                "userEmpNo", userInfo.userEmpNo() != null ? userInfo.userEmpNo() : ""
            )
        );
    }

    @Transactional(readOnly = true)
    public Map<String, Object> refresh(String refreshToken) {

        // 1. Refresh Token 검증
        String userId;
        try {
            userId = tokenProvider.validateRefreshToken(refreshToken);
        } catch (ExpiredJwtException e) {
            throw new BusinessException(ErrorCode.TOKEN_EXPIRED,
                "Refresh 토큰이 만료되었습니다. 다시 로그인하세요");
        } catch (JwtException e) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN,
                "유효하지 않은 Refresh 토큰입니다");
        }

        // 2. 사용자 재조회 (USE_TP 체크)
        SecUser user = secUserRepository.findById(userId)
            .filter(SecUser::isActive)
            .orElseThrow(() -> new BusinessException(ErrorCode.ACCOUNT_DISABLED,
                "비활성 계정입니다. 다시 로그인하세요"));

        // 3. 최신 정보로 새 UserInfo 생성 + Token Rotation
        UserInfo userInfo = new UserInfo(
            user.getUserId(), user.getUserNm(), user.getUserEmpNo());
        TokenPair newTokenPair = tokenProvider.generateTokenPair(userInfo);

        return Map.of(
            "accessToken", newTokenPair.accessToken(),
            "refreshToken", newTokenPair.refreshToken()
        );
    }

    public void logout(String userId) {
        // 필요 시 로그아웃 이력 저장
    }
}
```

### 5.4 JPA Entity

```java
@Entity
@Table(name = "TB_MCM_SEC_USER")
public class SecUser {

    @Id
    @Column(name = "USER_ID", length = 30)
    private String userId;

    @Column(name = "USER_EMP_NO", length = 10)
    private String userEmpNo;

    @Column(name = "USER_NM", length = 30)
    private String userNm;

    @Column(name = "USE_TP", nullable = false, length = 1)
    private String useTp;

    @Column(name = "PWD_FAIL_COUNT")
    private Integer pwdFailCount;

    // getter/setter 생략

    public boolean isActive() {
        return "Y".equals(useTp);
    }
}

@Entity
@Table(name = "TB_MCM_SEC_USER_PWD")
public class SecUserPwd {

    @Id
    @Column(name = "USER_ID", length = 30)
    private String userId;

    @Column(name = "USER_ENC_PWD", length = 100)
    private String userEncPwd;

    @Column(name = "LAST_PWD_CHNG_DATE")
    private LocalDate lastPwdChngDate;

    // getter 생략
}
```

### 5.5 Spring Data JPA Repository

```java
public interface SecUserRepository extends JpaRepository<SecUser, String> {

    @Modifying
    @Query("UPDATE SecUser u SET u.pwdFailCount = 0 WHERE u.userId = :userId")
    void resetPwdFailCount(String userId);

    @Modifying
    @Query("UPDATE SecUser u SET u.pwdFailCount = COALESCE(u.pwdFailCount, 0) + 1 WHERE u.userId = :userId")
    void incrementPwdFailCount(String userId);
}

public interface SecUserPwdRepository extends JpaRepository<SecUserPwd, String> {
}
```

### 5.6 PasswordEncoder

```java
/**
 * BCrypt 비밀번호 해싱/검증.
 * USER_ENC_PWD 컬럼에 BCrypt 해시를 저장한다.
 */
@Component
public class PasswordEncoder {

    public String encode(String rawPassword) {
        return BCrypt.hashpw(rawPassword, BCrypt.gensalt(12));
    }

    public boolean matches(String rawPassword, String storedHash) {
        return BCrypt.checkpw(rawPassword, storedHash);
    }
}
```

### 5.7 요청 DTO

```java
public record LoginRequest(
    String userId,
    String password
) {
    public LoginRequest {
        Objects.requireNonNull(userId, "사용자 ID는 필수입니다");
        Objects.requireNonNull(password, "비밀번호는 필수입니다");
    }
}

public record RefreshRequest(
    String refreshToken
) {}
```

---

## 6. Next.js BFF 보안 계층

### 6.1 쿠키 설정

```typescript
// src/lib/auth-cookies.ts

const COOKIE_OPTIONS = {
  httpOnly: true,              // JS 접근 불가 (XSS 방어)
  secure: true,                // HTTPS만 전송
  sameSite: 'strict' as const, // CSRF 방어
};

export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string }
) {
  response.cookies.set('access_token', tokens.accessToken, {
    ...COOKIE_OPTIONS,
    path: '/',
    maxAge: 8 * 60 * 60,          // 8시간
  });

  response.cookies.set('refresh_token', tokens.refreshToken, {
    ...COOKIE_OPTIONS,
    path: '/api/auth/refresh',     // 갱신 경로에서만 전송 (최소 권한)
    maxAge: 24 * 60 * 60,          // 24시간
  });
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set('access_token', '', { ...COOKIE_OPTIONS, path: '/', maxAge: 0 });
  response.cookies.set('refresh_token', '', {
    ...COOKIE_OPTIONS, path: '/api/auth/refresh', maxAge: 0
  });
}
```

### 6.2 로그인 API Route

```typescript
// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { setAuthCookies } from '@/lib/auth-cookies';

const PORTAL_URL = process.env.PORTAL_URL!;

export async function POST(req: NextRequest) {
  const body = await req.json();

  const portalRes = await fetch(`${PORTAL_URL}/api/portal/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = await portalRes.json();

  if (!result.success) {
    return NextResponse.json(result, { status: portalRes.status });
  }

  // 토큰을 httpOnly 쿠키에 저장, userInfo만 클라이언트에 반환
  const response = NextResponse.json({
    success: true,
    data: { userInfo: result.data.userInfo },
  });

  setAuthCookies(response, {
    accessToken: result.data.accessToken,
    refreshToken: result.data.refreshToken,
  });

  return response;
}
```

### 6.3 토큰 갱신 API Route

```typescript
// src/app/api/auth/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { setAuthCookies, clearAuthCookies } from '@/lib/auth-cookies';

const PORTAL_URL = process.env.PORTAL_URL!;

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refresh_token')?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { success: false, errorCode: 'A002', message: '인증이 만료되었습니다' },
      { status: 401 }
    );
  }

  const portalRes = await fetch(`${PORTAL_URL}/api/portal/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const result = await portalRes.json();

  if (!result.success) {
    const response = NextResponse.json(result, { status: 401 });
    clearAuthCookies(response);
    return response;
  }

  const response = NextResponse.json({ success: true });
  setAuthCookies(response, {
    accessToken: result.data.accessToken,
    refreshToken: result.data.refreshToken,
  });
  return response;
}
```

### 6.4 로그아웃 API Route

```typescript
// src/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth-cookies';

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ success: true });
  clearAuthCookies(response);
  return response;
}
```

### 6.5 서비스 프록시 (토큰 전달)

```typescript
// src/lib/proxy.ts
import { NextRequest, NextResponse } from 'next/server';

const MODULE_URLS: Record<string, string> = {
  portal:    process.env.PORTAL_URL!,
  operation: process.env.OPERATION_URL!,
  logistics: process.env.LOGISTICS_URL!,
  quality:   process.env.QUALITY_URL!,
  equipment: process.env.EQUIPMENT_URL!,
};

export async function proxyToBackend(
  module: string, path: string, req: NextRequest
): Promise<NextResponse> {

  const baseUrl = MODULE_URLS[module];
  if (!baseUrl) {
    return NextResponse.json(
      { success: false, message: `알 수 없는 모듈: ${module}` },
      { status: 400 }
    );
  }

  // 쿠키에서 Access Token 추출 → Bearer 헤더로 변환
  const accessToken = req.cookies.get('access_token')?.value;
  if (!accessToken) {
    return NextResponse.json(
      { success: false, errorCode: 'A001', message: '인증이 필요합니다' },
      { status: 401 }
    );
  }

  const backendRes = await fetch(`${baseUrl}/api/${path}`, {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: req.body,
  });

  const data = await backendRes.json();
  return NextResponse.json(data, { status: backendRes.status });
}
```

### 6.6 프론트엔드 자동 갱신

```typescript
// src/lib/api-client.ts

let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

function processQueue(error: any) {
  failedQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve());
  failedQueue = [];
}

export async function apiClient<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (response.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
        if (refreshRes.ok) {
          processQueue(null);
          return apiClient<T>(url, options);  // 원래 요청 재시도
        } else {
          processQueue(new Error('Refresh failed'));
          window.location.href = '/login';
          throw new Error('인증이 만료되었습니다');
        }
      } finally {
        isRefreshing = false;
      }
    } else {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: () => resolve(apiClient<T>(url, options)),
          reject,
        });
      });
    }
  }

  return response.json();
}

/** BPMN 서비스 호출 공통 함수 */
export async function executeService(
  module: string,
  serviceId: string,
  request: { params?: Record<string, any>; payload?: any } = {}
) {
  return apiClient(`/api/${module}/${serviceId}`, {
    method: 'POST',
    body: JSON.stringify({
      params: request.params ?? {},
      payload: request.payload ?? null,
    }),
  });
}
```

---

## 7. 보안 관련 DB 스키마

> DDL 원본: `docs/SQL/TB_MCM_SEC_USER.sql`, `docs/SQL/TB_MCM_SEC_USER_PWD.sql`

### 7.1 TB_MCM_SEC_USER (사용자 정보)

| 컬럼 | 타입 | 설명 | 인증 시 용도 |
|------|------|------|-------------|
| **USER_ID** | VARCHAR(30) PK | 사용자 ID | 로그인 ID |
| USER_EMP_NO | VARCHAR(10) | 사번 | JWT claim |
| USER_NM | VARCHAR(30) | 사용자명 | JWT claim |
| USE_TP | VARCHAR(1) NOT NULL | 사용구분 | 'Y'=활성, 그 외=비활성 |
| PWD_FAIL_COUNT | NUMBER(5) | 패스워드 오입력 횟수 | 5회 초과 시 계정 잠금 |
| SSO_ID | VARCHAR(30) | SSO ID | SSO 연동 시 사용 |
| DEPT_CD | VARCHAR(10) | 부서코드 | |
| START_ACTIVE_DATE | DATE | 유효개시일 | 계정 유효기간 체크 |
| END_ACTIVE_DATE | DATE | 유효기한일 | 계정 유효기간 체크 |
| EMAIL | VARCHAR(30) | 이메일 | |
| IN_OUT_EMP_TP | VARCHAR(1) NOT NULL | 내부/외부 구분 | |

### 7.2 TB_MCM_SEC_USER_PWD (사용자 패스워드 정보)

| 컬럼 | 타입 | 설명 | 인증 시 용도 |
|------|------|------|-------------|
| **USER_ID** | VARCHAR(30) PK | 사용자 ID (FK → SEC_USER) | |
| **USER_ENC_PWD** | VARCHAR(100) | BCrypt 해시 비밀번호 | 로그인 비밀번호 검증 |
| SALT | VARCHAR(100) | 비밀번호 SALT | 미사용 (BCrypt 자체 salt 포함) |
| USER_SSO_PWD | VARCHAR(100) | SSO 비밀번호 | SSO 연동 시 |
| USER_ENC_TEMP_PWD | VARCHAR(100) | 임시 비밀번호 | 초기/임시 비밀번호 로그인 |
| TEMP_PWD_EXPIRATION_DATE | TIMESTAMP(6) | 임시 비밀번호 만료일시 | 임시 비밀번호 유효기간 체크 |
| LAST_PWD_CHNG_DATE | DATE | 최종 비밀번호 변경일 | 비밀번호 변경 주기 체크 |

---

## 8. 모듈 간 통신 시 토큰 전파

```
dmes-operation                           dmes-logistics
┌───────────────────────┐                ┌───────────────────────┐
│ JwtAuthenticationFilter│                │ JwtAuthenticationFilter│
│   ↓ UserContextHolder  │                │   ↓ 동일 JWT 검증     │
│   ↓ JwtTokenHolder     │                │                       │
│                        │   REST         │                       │
│ WorkOrderService       │ ────────────→  │ InventoryService      │
│   └─ LogisticsClient   │ Bearer: JWT   │                       │
│        └─ JwtPropagating│               │                       │
│           Interceptor   │               │                       │
└───────────────────────┘                └───────────────────────┘
```

```java
/**
 * 모듈 간 REST 호출 시 원본 JWT를 자동 전파하는 인터셉터.
 * RestClient에 등록되어 모든 outbound 요청에 Authorization 헤더를 추가한다.
 */
@Component
public class JwtPropagatingInterceptor implements ClientHttpRequestInterceptor {

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body,
                                         ClientHttpRequestExecution execution) throws IOException {

        var token = JwtTokenHolder.get();
        if (token != null) {
            request.getHeaders().setBearerAuth(token);
        }

        var correlationId = MDC.get("correlationId");
        if (correlationId != null) {
            request.getHeaders().set("X-Correlation-Id", correlationId);
        }

        return execution.execute(request, body);
    }
}
```

---

## 9. 필터 체인 순서

```
요청 수신
  │
  ▼
① CorrelationIdFilter (order=1)
  │ → X-Correlation-Id 생성/전파, MDC 세팅
  ▼
② RequestLoggingFilter (order=5)
  │ → 요청 URL, 메서드, 소요시간 로깅
  ▼
③ JwtAuthenticationFilter (order=10)
  │ → JWT 검증, UserContextHolder/JwtTokenHolder 세팅
  │ → 실패 시 401 JSON 응답 (이후 진행 안 함)
  ▼
④ Spring DispatcherServlet
  │ → OasisController.execute()
  ▼
응답 반환
  │
  ▼ (finally)
  JWT Filter: UserContextHolder.clear(), JwtTokenHolder.clear()
  Correlation Filter: MDC.clear()
```

---

## 10. 비밀번호 정책

| 항목 | 정책 | DB 컬럼 |
|------|------|---------|
| **해싱** | BCrypt (cost factor 12) | `SEC_USER_PWD.USER_ENC_PWD` |
| **최소 길이** | 8자 이상 | |
| **복잡도** | 영문 + 숫자 + 특수문자 1개 이상 | |
| **변경 주기** | 90일 (설정 가능) | `SEC_USER_PWD.LAST_PWD_CHNG_DATE` |
| **계정 잠금** | 5회 연속 실패 → 잠금 | `SEC_USER.PWD_FAIL_COUNT` |
| **임시 비밀번호** | 관리자 발급, 만료일시 체크 | `SEC_USER_PWD.USER_ENC_TEMP_PWD`, `TEMP_PWD_EXPIRATION_DATE` |

---

## 11. 에러 코드 (인증)

| 코드 | HTTP | 의미 | 발생 위치 |
|------|------|------|----------|
| `A001` | 401 | 인증 토큰 없음 | JwtAuthenticationFilter |
| `A002` | 401 | 토큰 만료 | JwtAuthenticationFilter |
| `A003` | 401 | 유효하지 않은 토큰 | JwtAuthenticationFilter |
| `A004` | 401 | ID 또는 비밀번호 불일치 | AuthService |
| `A005` | 403 | 계정 잠금 | AuthService |
| `A006` | 403 | 비활성 계정 | AuthService |
| `A008` | 401 | Refresh 토큰 만료 | AuthService |
| `A009` | 401 | 유효하지 않은 Refresh 토큰 | AuthService |

---

## 12. 보안 체크리스트

| 분류 | 항목 | 구현 |
|------|------|------|
| **전송** | HTTPS 필수 | Docker 앞단 Nginx/LB에서 TLS 종료 |
| **토큰 저장** | httpOnly + Secure + SameSite=Strict | BFF 쿠키 설정 |
| **XSS 방어** | 토큰이 JS에 노출되지 않음 | httpOnly 쿠키 |
| **CSRF 방어** | SameSite=Strict + POST only | 쿠키 설정 + API 설계 |
| **Brute Force** | 5회 실패 시 계정 잠금 | AuthService |
| **토큰 만료** | Access 8h, Refresh 24h | JwtProperties |
| **토큰 갱신** | Refresh Token Rotation | AuthService.refresh() |
| **키 관리** | 환경변수, 소스코드에 미포함 | JWT_SECRET 환경변수 |
| **내부 통신** | Docker 내부 네트워크만 | 외부 노출 포트 3000만 |
| **비밀번호** | BCrypt hash, 평문 저장 금지 | PasswordEncoder |
| **로그 마스킹** | 비밀번호, 토큰 로그에 미출력 | RequestLoggingFilter 제외 목록 |

---

## 13. 설정 요약

```yaml
# ── Cactus 설정 (프로젝트별 Fork 후 커스터마이징) ──
cactus:
  jwt:
    secret: ${JWT_SECRET}                # 환경변수, Base64 인코딩, 최소 256bit
    issuer: dmes                         # JWT 발급자 (기본값: dmes)
    access-token-expiry: 28800           # 8시간 (초, MES 1교대 기준)
    refresh-token-expiry: 86400          # 24시간 (초)
  security:
    max-login-failures: 5                # 로그인 실패 허용 횟수
    password-expiry-days: 90             # 비밀번호 변경 주기 (일)

# ── JPA (프로젝트별 DB 설정) ──
spring:
  datasource:
    url: jdbc:tibero:thin:@host:port:sid
    username: ${DB_USER}
    password: ${DB_PASSWORD}
  jpa:
    hibernate:
      ddl-auto: none                     # 기존 테이블 사용, DDL 자동생성 안 함
```
