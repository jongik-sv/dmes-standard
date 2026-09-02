# 04. 보안 설계

> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - cactus-core 본체에서 **AuthController/AuthService 는 호출자 0 데드코드로 삭제**됨. portal 은 자체 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 를 사용한다. 본 문서 §4.4, §4.5 의 AuthController/AuthService 는 portal 모듈의 PortalAuthController/AuthService 로 읽는다.
> - 신규 표준 필터 **ClientKeyFilter**(`X-Backend-Client-Key` 검증) / **RequestIdFilter**(요청 식별자 발급/전파).
> - 신규 AutoConfiguration **CactusAuthAutoConfiguration**(default 비활성, `cactus.auth.enabled: true` 시 활성) / **CactusWebSecurityAutoConfiguration**(default `SecurityFilterChain`, `@ConditionalOnMissingBean`).
> - env: 클라이언트 키 환경변수는 `BACKEND_CLIENT_KEY` 로 통일 (구 `UI_CLIENT_KEY` 폐기).

## 1. 전체 인증 아키텍처

```
┌──────────────┐      ┌──────────────┐      ┌──────────┐
│  React UI    │◄────►│  Next.js BFF │◄────►│  WAS     │
│              │      │  (프론트서버)  │      │ (Spring) │
└──────────────┘      └──────────────┘      └──────────┘
     브라우저            Cookie 관리           JWT 검증
                       JWT 1차 디코딩          인증/인가
                       Role 사전 체크          DB 접근
```

### 역할 분리

| 계층 | 역할 |
|------|------|
| **React UI** | 로그인 폼 → BFF 로그인 API 호출, 토큰은 직접 관리하지 않음 |
| **Next.js BFF** | Cookie에 JWT 저장/관리, 요청 시 Authorization 헤더로 변환하여 WAS 전달, 1차 Role 체크 (경량) |
| **WAS (cactus-core)** | JWT 서명 검증, 완전한 인증/인가, DB 기반 사용자/권한 조회 |

## 2. JWT 토큰 설계

### 2.1 토큰 종류

| 토큰 | 만료 | 용도 | 저장 위치 |
|------|------|------|----------|
| Access Token | 30분 | API 인증 | BFF httpOnly Cookie |
| Refresh Token | 7일 | Access Token 갱신 | BFF httpOnly Cookie |

### 2.2 Access Token Claims

```json
{
  "sub": "admin",
  "userId": "admin",
  "userName": "관리자",
  "roles": ["ROLE_ADMIN", "ROLE_USER"],
  "plantCode": "P01",
  "deptCode": "D001",
  "iss": "cactus",
  "iat": 1711792200,
  "exp": 1711794000
}
```

### 2.3 서명 방식

| 환경 | 알고리즘 | 설명 |
|------|---------|------|
| **단일 WAS** | HS256 (HMAC) | 대칭키, 설정 간단 |
| **멀티 모듈** | RS256 (RSA) | WAS는 개인키로 서명, BFF/타 모듈은 공개키로 검증 |

> **권장**: 멀티 모듈 환경에서는 RS256 사용. BFF가 공개키만으로 JWT를 디코딩할 수 있어 안전.

## 3. 인증 흐름

### 3.1 로그인

```
React → BFF POST /api/auth/login { loginId, password }
         │
         ▼
       BFF → WAS POST /auth/login { loginId, password }
                  │
                  ├─ AuthService.login()
                  │   ├─ SecUserRepository.findByLoginId()
                  │   ├─ PasswordEncoder.matches() → BCrypt 검증
                  │   └─ JwtTokenProvider.generateTokenPair()
                  │
                  └─ Response: { accessToken, refreshToken }
         │
         ▼
       BFF: Set-Cookie (httpOnly, Secure, SameSite=Strict)
         │
         ▼
React ← 200 OK (로그인 성공, 사용자 정보)
```

### 3.2 API 요청 (인증된 상태)

```
React → BFF /api/order/orderMgt/search
         │
         ├─ Middleware: Cookie에서 JWT 추출
         ├─ JWT 디코딩 (서명 검증 선택적) → roles 확인 (1차 체크)
         ├─ Authorization: Bearer {accessToken} 헤더 설정
         │
         ▼
       BFF → WAS POST /api/order/orderMgt/search
                  │
                  ├─ JwtAuthenticationFilter
                  │   ├─ Authorization 헤더에서 토큰 추출
                  │   ├─ JwtTokenProvider.validateAndParse()
                  │   ├─ UserInfo 생성 → UserContextHolder 저장
                  │   └─ SecurityContext 인증 설정
                  │
                  ├─ OasisController.execute()
                  │
                  └─ Response: CactusResponse
```

### 3.3 토큰 갱신

```
BFF: Access Token 만료 감지 (401 또는 만료 시간 체크)
  │
  ▼
BFF → WAS POST /auth/refresh { refreshToken }
           │
           ├─ JwtTokenProvider.validateRefreshToken()
           └─ 새 TokenPair 발급
  │
  ▼
BFF: Cookie 갱신 → 원래 요청 재시도
```

### 3.4 로그아웃

```
React → BFF POST /api/auth/logout
         │
         ├─ Cookie 삭제 (accessToken, refreshToken)
         └─ (선택) WAS에 로그아웃 알림 → 토큰 블랙리스트 등록
```

## 4. 핵심 클래스

### 4.1 JwtTokenProvider

```java
public class JwtTokenProvider {
    TokenPair generateTokenPair(UserInfo userInfo);  // 로그인 시 토큰 쌍 생성
    UserInfo validateAndParse(String token);          // 토큰 검증 + 사용자 정보 추출
    boolean isExpired(String token);                  // 만료 여부 확인
}
```

- HMAC/RSA 모드를 프로퍼티로 전환 가능
- RSA 모드: 개인키(`private.pem`)로 서명, 공개키(`public.pem`)로 검증
- 업무 모듈은 공개키만 있으면 토큰 검증 가능

### 4.2 JwtAuthenticationFilter

```java
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    // 1. Authorization: Bearer {token} 추출
    // 2. JwtTokenProvider.validateAndParse()
    // 3. UserInfo → UserContextHolder에 저장
    // 4. X-User-Id 헤더와 토큰 userId 교차 검증 (BFF 변조 방지)
    // 5. SecurityContext 인증 설정
}
```

**X-User-Id 교차 검증**: BFF가 보낸 `X-User-Id` 헤더와 JWT 내 `userId`가 일치하는지 확인.
불일치 시 401 응답. BFF 프록시 경유 시 변조를 방지하는 이중 체크.

### 4.3 UserInfo / UserContextHolder

```java
// 요청 스코프에서 사용자 정보 접근
UserInfo user = UserContextHolder.getContext().getUserInfo();
String userId = user.getUserId();
List<String> roles = user.getRoles();
String plantCode = user.getPlantCode();
```

### 4.4 PortalAuthController (※ cactus-core 본체에서는 삭제됨, portal 모듈에서 노출)

```
POST /auth/login          → 로그인 (LoginRequest → TokenPair)
POST /auth/refresh        → 토큰 갱신 (RefreshRequest → TokenPair)
POST /auth/logout         → 로그아웃
GET  /auth/me             → 현재 사용자 정보 (토큰에서 추출)
```

> cactus-core 본체에는 AuthController 가 더 이상 존재하지 않는다(호출자 0 데드코드 제거). portal 모듈(`com.dongkuk.dmes.mcm.*`) 에서 PortalAuthController 로 노출한다.

### 4.5 AuthService (※ portal 모듈에서 자체 구현)

```java
public class AuthService {
    TokenPair login(String loginId, String password);    // DB 조회 + BCrypt 검증 + 토큰 발급
    TokenPair refresh(String refreshToken);              // 리프레시 토큰 검증 + 새 토큰 발급
    void logout(String userId);                          // (선택) 블랙리스트 등록
}
```

### 4.6 PasswordEncoder

BCrypt 기반 비밀번호 암호화/검증.

```java
public class PasswordEncoder {
    String encode(String rawPassword);                   // BCrypt 해시
    boolean matches(String rawPassword, String encoded); // 검증
}
```

## 5. DB 스키마

### SEC_USER (사용자)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| USER_ID | VARCHAR(50) PK | 사용자 ID |
| LOGIN_ID | VARCHAR(50) UK | 로그인 ID |
| USER_NAME | VARCHAR(100) | 사용자명 |
| EMAIL | VARCHAR(200) | 이메일 |
| PLANT_CODE | VARCHAR(10) | 소속 공장 |
| DEPT_CODE | VARCHAR(20) | 소속 부서 |
| ROLES | VARCHAR(500) | 역할 (콤마 구분) |
| STATUS | VARCHAR(10) | ACTIVE/LOCKED/DISABLED |

### SEC_USER_PWD (비밀번호)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| USER_ID | VARCHAR(50) PK/FK | 사용자 ID |
| PASSWORD_HASH | VARCHAR(200) | BCrypt 해시 |
| LAST_CHANGED | TIMESTAMP | 마지막 변경일 |
| FAIL_COUNT | INT | 연속 실패 횟수 |
| LOCKED_UNTIL | TIMESTAMP | 잠금 해제 시간 |

## 6. Next.js BFF 보안 레이어

### 6.1 Cookie 관리

```typescript
// BFF 로그인 성공 시
res.cookies.set('access_token', tokenPair.accessToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 30 * 60  // 30분
});
```

### 6.2 Middleware Role 체크 (1차)

```typescript
// Next.js middleware.ts
export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  if (!token) return NextResponse.redirect('/login');

  const payload = decodeJwt(token); // 서명 검증 없이 디코딩 (1차 체크)
  const roles = payload.roles || [];

  // URL 패턴별 필요 Role 체크
  if (request.nextUrl.pathname.startsWith('/admin') && !roles.includes('ROLE_ADMIN')) {
    return NextResponse.redirect('/403');
  }
}
```

> **주의**: BFF의 Role 체크는 **UX 개선용 1차 필터**. 실제 인가는 WAS에서 JWT 서명 검증 후 수행.

### 6.3 프록시 헤더 전달

```typescript
// BFF → WAS 요청 시
const response = await fetch(`${WAS_URL}${path}`, {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'X-User-Id': decodedToken.userId,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(cactusRequest)
});
```

## 7. URL 패턴별 인가 (SecurityConfig)

업무 모듈의 `SecurityConfig`에서 URL 패턴별 접근 권한을 설정한다.

```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    return http
        .csrf(csrf -> csrf.disable())
        .sessionManagement(sm -> sm.sessionCreationPolicy(STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/auth/**").permitAll()
            .requestMatchers("/api/admin/**").hasRole("ADMIN")
            .requestMatchers("/api/**").authenticated()
        )
        .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
        .build();
}
```

## 8. 보안 체크리스트

| 항목 | 상태 | 설명 |
|------|------|------|
| JWT 서명 검증 | 구현 완료 | HMAC/RSA 지원 |
| BCrypt 비밀번호 | 구현 완료 | jBCrypt 0.4 |
| httpOnly Cookie | BFF 구현 | XSS로부터 토큰 보호 |
| X-User-Id 교차 검증 | 구현 완료 | BFF 변조 방지 |
| Token Refresh | 구현 완료 | 자동 갱신 흐름 |
| 로그인 실패 잠금 | 향후 구현 | FAIL_COUNT 기반 계정 잠금 |
| Token 블랙리스트 | 향후 구현 | 로그아웃 시 토큰 무효화 |
| Rate Limiting | 향후 구현 | 로그인 API 호출 제한 |
| 키 로테이션 | 향후 구현 | RSA 키 주기적 교체 |
