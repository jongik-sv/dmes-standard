# 04. 인증·보안 JWT (개발완료)

> 통합 원본: `Cactus 보안 모듈 구현 가이드.md`, `CACTUS_SECURITY.md`, `new/04-security.md`
> 구현 상태: **개발완료** (HMAC-SHA256 대칭키 기반). RSA 비대칭 전환 + BFF 1차 RS256 검증은 17번 미개발 정리본 참고.

---

## 1. 인증 흐름

```
사용자 로그인 → AuthController.login(LoginRequest)
  ↓ AuthService.authenticate(userId, rawPassword)
  ↓ SecUser 조회 + PasswordEncoder.matches(BCrypt)
  ↓ loadUserRoles(userId) → ["ROLE_USER", "ROLE_OPERATION", ...]
  ↓ JwtTokenProvider.generateTokenPair(UserInfo) → (accessToken, refreshToken)
  ↓ TokenPair 반환

이후 요청 → JwtAuthenticationFilter
  ↓ Authorization: Bearer <token> 추출
  ↓ JwtTokenProvider.validateAndExtract(token) → UserInfo + roles
  ↓ UserContextHolder.set(userInfo)
  ↓ SecurityContext 에 Authentication 등록 (roles 기반 GrantedAuthority)
```

---

## 2. 핵심 클래스

| 클래스 | 위치 | 역할 |
|---|---|---|
| `AuthController` | **cactus-core 에 없음** — 도메인 모듈 자체 작성 | 예: `portal/core/.../security/controller/PortalAuthController` (`/api/auth/login`, `/api/auth/refresh`) |
| `AuthService` | `security/auth/AuthService.java` | 사용자 검증, 토큰 발급. `loadUserRoles()` 는 도메인에서 override. `cactus.auth.enabled: true` 시 빈 등록 |
| `SecUser` | `security/auth/SecUser.java` | JPA 엔티티, **`TB_SEC_USER`** (CactusAuditEntity 상속) |
| `SecUserRepository` | `security/auth/SecUserRepository.java` | `JpaRepository<SecUser, String>` |
| `LoginRequest` / `RefreshRequest` | `security/auth/*.java` | record |
| `PasswordEncoder` | `security/auth/PasswordEncoder.java` | BCrypt (jBCrypt 0.4) |
| `UserInfo` | **`security/context/UserInfo.java`** | record (userId, userNm, userEmpNo, roles). roles 미지정 시 `["ROLE_USER"]` 자동 부여 |
| `UserContext` | `security/context/UserContext.java` | 보조 컨텍스트 |
| `UserContextHolder` | `security/context/UserContextHolder.java` | ThreadLocal UserInfo. `getUserId()` null-safe → "SYSTEM" |
| `TokenPair` | **`security/jwt/TokenPair.java`** | record (accessToken, refreshToken) |
| `JwtTokenProvider` | `security/jwt/JwtTokenProvider.java` | HMAC-SHA256 서명/검증, `roles` 클레임 처리, `requireIssuer` 검증 |
| `JwtAuthenticationFilter` | `security/jwt/JwtAuthenticationFilter.java` | OncePerRequestFilter, Bearer 추출, 사전 인증(MockMvc) 보존, SecurityContext + UserContextHolder + JwtTokenHolder 설정 |
| `JwtTokenHolder` | `security/jwt/JwtTokenHolder.java` | ThreadLocal 토큰 보관 (모듈간 호출 시 전파용) |
| `ClientKeyFilter` | **`security/filter/ClientKeyFilter.java`** (cactus-core 자체) | `X-Client-Key` 헤더 검증 (`cactus.security.client-key` 정의 시 활성). BFF↔BE 간 사전 신뢰 |

---

## 3. JWT 토큰 구조

### 3.1 클레임
| 클레임 | 의미 |
|---|---|
| `sub` | userId |
| `userNm` | 사용자 이름 |
| `userEmpNo` | 사번 |
| `roles` | List<String> (예: `["ROLE_USER", "ROLE_OPERATION"]`). roles 가 비어있으면 발급 시 클레임 자체 생략, 검증 시 자동으로 `["ROLE_USER"]` 부여 |
| `type` | "refresh" 인 경우 refresh token. access token 에서는 미발급 |
| `jti` | UUID — 토큰 고유 ID |
| `iat`, `exp` | 발급/만료 시각 |
| `iss` | 발급자 (**필수** — `parseClaims()` 에서 `requireIssuer(issuer)` 검증) |

### 3.2 서명
- **HMAC-SHA256** (`Keys.hmacShaKeyFor(Decoders.BASE64.decode(secret))`)
- secret: `cactus.jwt.secret` (Base64 인코딩 문자열, 최소 256bit)
- issuer: `cactus.jwt.issuer` (기본 "dmes")
- Access token 만료: `cactus.jwt.access-token-expiry` (초 단위, **기본 28800 = 8시간**, MES 1교대)
- Refresh token 만료: `cactus.jwt.refresh-token-expiry` (초 단위, **기본 86400 = 24시간**)

---

## 4. roles 클레임 발급

`AuthService.loadUserRoles(String userId)` 를 도메인이 override 하여 DB에서 역할 조회:

```java
// portal/.../PortalAuthService.java
@Override
protected List<String> loadUserRoles(String userId) {
    return userRoleRepository.findByUserId(userId).stream()
        .map(r -> "ROLE_" + r.getRoleId())
        .toList();
}
```

이후 `JwtTokenProvider.generateTokenPair(UserInfo)` 가 roles 를 클레임에 포함.

---

## 5. SecUser 엔티티 (`TB_SEC_USER`)

`cactus-core/security/auth/SecUser.java`. RBAC 엑셀 스키마 기준. 테이블명은 `TB_SEC_USER` 이며 dmes-film 의 `TB_MCM_SEC_USER` 와는 다른 단순화된 스키마. 감사 컬럼은 `CactusAuditEntity` 상속.

| 컬럼 | Java 필드 | 의미 |
|---|---|---|
| `USER_ID` | userId | PK |
| `USER_NM` | userNm | 사용자명 |
| `USER_NO` | userNo | 사번 (이전 명칭 `USER_EMP_NO` — `getUserEmpNo()` 호환 메서드 제공) |
| `USER_PASS` | userPass | BCrypt 해시 |
| `USE_YN` | useYn | 사용여부 (Y/N). `isActive()` 헬퍼 |
| `LOCK_YN` | lockYn | 잠금여부 (Y/N). `isLocked()` 헬퍼 |
| `TRY_CNT` | tryCnt | 로그인 실패 횟수 |
| `PASS_INIT_YN` | passInitYn | 비밀번호 초기화 필요 여부 (Y/N) |
| `PASS_SET_DD` | passSetDd | 비밀번호 설정일 (LocalDate) |
| `DEPT_CD` | deptCd | 부서 코드 |
| `VALID_STR_DD` | validStrDd | 유효 시작일 |
| `VALID_END_DD` | validEndDd | 유효 종료일 |
| (감사 컬럼 9종) | (상속) | CactusAuditEntity — CREATED_BY/AT/SVC_ID/PGM_ID, UPDATED_BY/AT/SVC_ID/PGM_ID, VERSION (정리본 06 참고) |

> 비밀번호 만료/재사용 방지/이력 관리 비즈니스 로직은 18번 미개발 정리본 참고.

---

## 6. 헤더 표준

### 6.1 BFF → BE
| 헤더 | 의미 |
|---|---|
| `Authorization: Bearer <accessToken>` | JWT |
| `X-Client-Key` | BFF↔BE 사전 신뢰 (ClientKeyFilter) |
| `X-Authenticated-User` | BFF가 검증한 사용자 ID (백엔드 보조) |
| `X-Authenticated-Role` | BFF가 검증한 역할 |

> 문서 17번 설계의 `X-User-Id`, `X-User-Roles` 와 헤더명이 다름. 향후 통일 검토.

---

## 7. SecurityFilterChain

```java
// CactusWebSecurityAutoConfiguration.cactusDefaultSecurityFilterChain()
http
  .csrf(disable)
  .sessionManagement(STATELESS)
  .authorizeHttpRequests(auth -> auth
    .requestMatchers("/auth/**").permitAll()
    .requestMatchers("/actuator/health").permitAll()
    .requestMatchers("/oasis/**").authenticated()
    .anyRequest().authenticated())
  .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
  .addFilterBefore(clientKeyFilter, JwtAuthenticationFilter.class)   // client-key 정의 시
  .addFilterBefore(requestIdFilter, ClientKeyFilter.class)
  .addFilterBefore(txIdFilter, RequestIdFilter.class)
```

- 등록 위치: **`CactusWebSecurityAutoConfiguration`** (autoconfigure 패키지)
- `@ConditionalOnMissingBean(SecurityFilterChain.class)` — 도메인 모듈이 자체 SecurityFilterChain 빈을 등록하면 비활성 (예: portal 의 `com.dongkuk.dmes.mcm.config.SecurityConfig`)
- 필터 체인: TxIdFilter → RequestIdFilter → ClientKeyFilter (선택) → JwtAuthenticationFilter → UsernamePasswordAuthenticationFilter
- 도메인별 `hasAnyAuthority("ROLE_*")` 매핑은 미적용. 17번 정리본 참고.

---

## 8. 미구현 항목 (참조 라벨링)

- **RSA 비대칭 JWT (RS256)**: 17번 정리본 (현 시점 도입 필요성 낮음, 트리거 발생 시 검토)
- **토큰 블랙리스트 (Redis)**: 미구현. 로그아웃 시 토큰 무효화 필요 시 도입.
- **Rate Limiting**: NginX 또는 Bucket4j 등 외부 처리.
- **비밀번호 만료/이력**: 18번 정리본
- **BFF 1차 Role 검증**: portal `proxy.ts` + `api-permission-cache.ts` 로 다른 방식 작동 중 (17번 정리본 §5.2)

---

## 9. 관련 정리본

- 02 패키지구조 (security/ 패키지)
- 07 URL 구조 (`/api/auth/*` 라우팅)
- 17 RSA 비대칭 JWT 및 BFF Role 검증 (미개발)
- 18 비밀번호 변경이력 및 정책 (미개발)
