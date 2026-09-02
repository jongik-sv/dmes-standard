# Cactus 보안 모듈 구현 가이드

> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - cactus-core 본체에서 **AuthController 는 호출자 0 데드코드로 삭제**됨. portal 은 자체 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 를 사용한다.
> - 신규 표준 필터: **ClientKeyFilter**(`X-Backend-Client-Key` 검증), **RequestIdFilter**(요청 식별자 발급/전파).
> - 신규 AutoConfiguration: **CactusAuthAutoConfiguration**(default 비활성, `cactus.auth.enabled: true` 시 활성), **CactusWebSecurityAutoConfiguration**(default `SecurityFilterChain`, `@ConditionalOnMissingBean`). 본 가이드의 `CactusSecurityAutoConfiguration` 은 신규 두 AutoConfiguration 으로 분리된 형태로 보면 된다.
> - env: 클라이언트 키 환경변수는 `BACKEND_CLIENT_KEY` 로 통일.

> **현행 사실 — BFF↔BE 헤더 4 종 (2026-04-26)**
>
> 본 가이드 본문·다른 문서에 일부 남아 있는 `X-Backend-Client-Key` 라는 헤더명은 **옛 표현이며, 현 표준은 `X-Client-Key`** 이다. 실제 cactus-core `ClientKeyFilter` 가 검증하는 헤더명은 `X-Client-Key` (`HEADER_CLIENT_KEY = "X-Client-Key"`) 이며, 루트 `CLAUDE.md` "Phase 7 신규 컨벤션" 표·BFF 프록시 정책과도 일치한다.
>
> | 헤더 | 발급 주체 | BE 측 처리 |
> |---|---|---|
> | `Authorization` | BFF (Bearer JWT) | `JwtAuthenticationFilter` 가 검증 |
> | `X-Client-Key` | BFF (env `BACKEND_CLIENT_KEY`) | `ClientKeyFilter` 가 BFF→BE 게이트키 검증 |
> | `X-Authenticated-User` | BFF | 컨텍스트 보조용 (BE 는 신뢰만, 직접 검증 안 함) |
> | `X-Authenticated-Role` | BFF | 컨텍스트 보조용 (동상) |
>
> 본문에 흩어져 있는 `X-Backend-Client-Key` 토큰을 일괄 치환하지는 않으므로, 신규 작성·신규 코드는 반드시 `X-Client-Key` 로 작성한다.

## 개요

Cactus는 모든 도메인 WAS에서 공통으로 사용하는 자바 라이브러리이며, BFF에서 1차 검증을 통과한 요청에 대해 **2차 완전 검증**을 담당한다.

## 패키지 구조

```
cactus-security/
├── config/
│   └── SecurityConfig.java          # SpringSecurity 필터 체인 설정
├── jwt/
│   ├── JwtTokenProvider.java        # JWT 파싱/검증 (public key)
│   └── JwtProperties.java           # JWT 관련 설정 프로퍼티
├── filter/
│   ├── JwtAuthenticationFilter.java # 요청마다 토큰 검증하는 필터
│   ├── ClientKeyFilter.java         # `X-Backend-Client-Key` 헤더 검증 (cactus 표준, 신규)
│   └── RequestIdFilter.java         # 요청 식별자 발급/전파 (cactus 표준, 신규)
├── context/
│   └── UserContext.java             # 인증된 사용자 정보 보관
├── annotation/
│   └── RequireRole.java             # 메서드 레벨 권한 체크 어노테이션
├── handler/
│   ├── AccessDeniedHandler.java     # 403 처리
│   └── AuthenticationEntryPoint.java # 401 처리
└── autoconfigure/
    ├── CactusAuthAutoConfiguration.java         # 신규: default 비활성, `cactus.auth.enabled: true` 시 활성
    ├── CactusWebSecurityAutoConfiguration.java  # 신규: default SecurityFilterChain (@ConditionalOnMissingBean)
    └── CactusSecurityAutoConfiguration.java     # 위 두 AutoConfiguration 의 통합 별칭(이력)
```

## 핵심 구현

### 1. JWT 설정 프로퍼티

```java
@ConfigurationProperties(prefix = "cactus.security.jwt")
public class JwtProperties {
    private String publicKeyPath;    // RSA public key 경로
    private String issuer;           // 토큰 발급자 (Portal WAS)
    private long clockSkewSeconds = 30; // 시간 오차 허용
}
```

각 도메인 WAS의 `application.yml`에서 설정:

```yaml
cactus:
  security:
    jwt:
      public-key-path: classpath:keys/public.pem
      issuer: portal-was
      clock-skew-seconds: 30
```

### 2. JWT Token Provider (Public Key 검증)

```java
@Component
public class JwtTokenProvider {

    private final RSAPublicKey publicKey;
    private final JwtProperties properties;

    public JwtTokenProvider(JwtProperties properties) throws Exception {
        this.properties = properties;
        this.publicKey = loadPublicKey(properties.getPublicKeyPath());
    }

    /**
     * 토큰 검증 — 서명, 만료, 발급자 모두 체크
     */
    public Claims validateToken(String token) {
        return Jwts.parser()
                .verifyWith(publicKey)
                .requireIssuer(properties.getIssuer())
                .clockSkewSeconds(properties.getClockSkewSeconds())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public String extractUserId(Claims claims) {
        return claims.getSubject();
    }

    @SuppressWarnings("unchecked")
    public List<String> extractRoles(Claims claims) {
        return claims.get("roles", List.class);
    }

    private RSAPublicKey loadPublicKey(String path) throws Exception {
        Resource resource = new ClassPathResource(path.replace("classpath:", ""));
        String key = new String(resource.getInputStream().readAllBytes())
                .replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replaceAll("\\s", "");

        byte[] decoded = Base64.getDecoder().decode(key);
        X509EncodedKeySpec spec = new X509EncodedKeySpec(decoded);
        return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(spec);
    }
}
```

### 3. 인증 필터

```java
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider tokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String token = resolveToken(request);

        if (token != null) {
            try {
                Claims claims = tokenProvider.validateToken(token);

                String userId = tokenProvider.extractUserId(claims);
                List<String> roles = tokenProvider.extractRoles(claims);

                // BFF에서 전달한 헤더와 토큰 내 정보 일치 여부 교차 검증
                String headerUserId = request.getHeader("X-User-Id");
                if (headerUserId != null && !headerUserId.equals(userId)) {
                    response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Token mismatch");
                    return;
                }

                List<GrantedAuthority> authorities = roles.stream()
                        .map(SimpleGrantedAuthority::new)
                        .collect(Collectors.toList());

                UsernamePasswordAuthenticationToken auth =
                        new UsernamePasswordAuthenticationToken(userId, null, authorities);
                auth.setDetails(new UserContext(userId, roles, claims));

                SecurityContextHolder.getContext().setAuthentication(auth);

            } catch (JwtException e) {
                response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid token");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private String resolveToken(HttpServletRequest request) {
        String bearer = request.getHeader("Authorization");
        if (bearer != null && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }
        return null;
    }
}
```

### 4. SecurityConfig (필터 체인)

```java
@Configuration
@EnableMethodSecurity  // @PreAuthorize 활성화 (메서드 레벨 권한 체크 필요 시)
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final CactusAccessDeniedHandler accessDeniedHandler;
    private final CactusAuthenticationEntryPoint authenticationEntryPoint;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)        // API 서버이므로 CSRF 불필요
                .sessionManagement(session ->
                    session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(ex -> ex
                    .accessDeniedHandler(accessDeniedHandler)
                    .authenticationEntryPoint(authenticationEntryPoint))
                .authorizeHttpRequests(auth -> auth
                    .requestMatchers("/actuator/health").permitAll()
                    .requestMatchers("/api/production/**").hasAnyAuthority("ROLE_PRODUCTION", "ROLE_ADMIN")
                    .requestMatchers("/api/operation/**").hasAnyAuthority("ROLE_OPERATION", "ROLE_ADMIN")
                    .requestMatchers("/api/quality/**").hasAnyAuthority("ROLE_QUALITY", "ROLE_ADMIN")
                    .requestMatchers("/api/logistics/**").hasAnyAuthority("ROLE_LOGISTICS", "ROLE_ADMIN")
                    .anyRequest().authenticated())
                .addFilterBefore(jwtAuthenticationFilter,
                    UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
```

### 5. 메서드 레벨 권한 체크 (@PreAuthorize)

> **참고: OasisController와 URL-pattern 기반 인가**
>
> Oasis 프레임워크의 `OasisController`는 단일 `handle()` 메서드로 모든 요청을 처리하는 구조이므로,
> 메서드 레벨 `@PreAuthorize`를 적용할 수 없다. 대신 위 SecurityConfig의 `authorizeHttpRequests`에서
> URL-pattern 기반으로 도메인별 역할(Role)을 매핑하여 인가를 수행한다.
> (예: `/api/production/**` → `ROLE_PRODUCTION`, `ROLE_ADMIN`)
>
> 아래의 `@PreAuthorize` 예시는 OasisController를 사용하지 않는 별도의 도메인 컨트롤러에서
> 메서드 레벨 권한 체크가 필요한 경우의 참고용이다.

도메인 WAS 컨트롤러에서 사용:

```java
// 공정계획 WAS 컨트롤러
@RestController
@RequestMapping("/production/plans")
public class ProductionPlanController {

    @GetMapping
    @PreAuthorize("hasAnyAuthority('ROLE_PRODUCTION', 'ROLE_ADMIN')")
    public List<PlanDto> getPlans() {
        // ...
    }

    @PostMapping
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public PlanDto createPlan(@RequestBody PlanDto dto) {
        // ...
    }
}
```

### 6. AutoConfiguration (자동 설정)

```java
@AutoConfiguration
@EnableConfigurationProperties(JwtProperties.class)
@ComponentScan(basePackages = "com.dongkuk.dmes.cactus.security")
public class CactusSecurityAutoConfiguration {
}
```

`META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`:

```
com.dongkuk.dmes.cactus.security.autoconfigure.CactusSecurityAutoConfiguration
```

## BFF ↔ Cactus 검증 역할 분담

```
           BFF (Next.js)                    Cactus (WAS)
  ──────────────────────────      ──────────────────────────────
  JWT 디코딩 + 서명 검증           JWT 서명 검증 (동일 public key)
  Route 레벨 Role 매핑 체크        URL-pattern 기반 인가 + 메서드 레벨 @PreAuthorize
  X-User-Id, X-User-Roles 헤더    헤더 ↔ 토큰 교차 검증
  빠른 차단 (백엔드 트래픽 절감)    완전한 보안 보장
```

## 고려사항

| 항목 | 설명 |
|------|------|
| **Key Rotation** | public key 갱신 시 모든 WAS 재배포 필요 → JWKS endpoint 방식 고려 |
| **토큰 블랙리스트** | 로그아웃 시 토큰 무효화를 위해 Redis 기반 블랙리스트 고려 |
| **Rate Limiting** | NginX에서 처리하되, Cactus에서도 사용자별 제한 가능 |
| **감사 로그** | 필터에서 인증 성공/실패를 로깅하여 보안 감사에 활용 |
