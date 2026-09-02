# 17. RSA 비대칭 JWT 및 BFF Role 검증 (미개발)

> 통합 원본: `Cactus 보안 모듈 구현 가이드.md`, `Next.js BFF Role 검증 가이드.md`, `new/04-security.md`
> 구현 상태:
> - **RSA 비대칭 JWT**: 미구현. cactus-core/portal-be 모두 **HMAC-SHA256 대칭키** 방식.
> - **BFF Role 검증**: 본 문서 설계(jose + RS256 + 정적 ROUTE_ROLE_MAP)는 미구현이나, **다른 아키텍처(NextAuth 세션 + 동적 권한 캐시 + proxy.ts 403 차단)로 핵심 기능은 이미 작동 중**.
> - **JWT roles 클레임**: 이미 구현됨 (정리본 04 참고).

---

## 1. 현재 구현 vs 본 문서 설계

| 항목 | 현재 portal+cactus-core | 본 문서 설계 | 상태 |
|------|------------------|--------------|------|
| JWT 알고리즘 | HMAC-SHA256 (대칭키) | RSA-256 (비대칭키) | ❌ |
| 서명/검증 키 | 모든 모듈이 동일한 `cactus.jwt.secret` 공유 | Portal: private key 보유 / 도메인 모듈 + BFF: public key만 | ❌ |
| BFF JWT 직접 검증 | **하지 않음** (NextAuth 세션 쿠키로 검증, 백엔드에 backendAccessToken 위임) | jose `jwtVerify` + RS256 검증 | ❌ |
| BFF Role 차단 | **proxy.ts에서 동적 권한 캐시(`api-permission-cache.ts`, TTL 5분) 기반 차단 + 403 반환** | 정적 ROUTE_ROLE_MAP + 미들웨어 차단 | ⚠ 다른 방식으로 작동 |
| 도메인별 인가 (BE) | SecurityConfig는 `permitAll/authenticated`만, hasAnyAuthority 매핑 없음 | `requestMatchers("/api/production/**").hasAnyAuthority("ROLE_PRODUCTION")` | ❌ |
| 헤더 교차 검증 | 없음 | `X-User-Id` ↔ JWT subject 일치 여부 확인 | ❌ |
| 백엔드 전달 헤더 | `X-Authenticated-User`, `X-Authenticated-Role` (Phase 7 BFF: `app/api/[module]/rest/[...path]/route.ts` 등) | `X-User-Id`, `X-User-Roles` | ⚠ 헤더명 다름 |
| JWT roles 클레임 | **JWT에 List<String> 포함됨** (`JwtTokenProvider.java:71-72`) | 동일 | ✅ |
| BE Role 조회 | `PortalAuthService.loadUserRoles()` → `TB_SEC_USER_ROLE` → `"ROLE_" + roleId` | 동일 | ✅ |

---

## 2. 비대칭키 방식의 이점

```
Portal WAS (private key) ─── JWT 서명 발급
    │
    ├──→ Next.js BFF (public key)        검증만 가능 → 키 유출되어도 토큰 위조 불가
    │
    └──→ 도메인 WAS (public key)         검증만 가능 → 모든 도메인 모듈 안전
```

BFF는 신뢰 경계 밖의 Node.js 서버이므로, private key를 두지 않는 비대칭키 구조가 보안상 적합.

---

## 3. 설계 1 — RSA Public Key 기반 검증

### 3.1 패키지 구조 (제안)
```
cactus-core/security/
├── jwt/
│   ├── JwtTokenProvider.java          # RSA public/private key 분기
│   └── JwtProperties.java             # publicKeyPath, privateKeyPath, issuer
├── filter/
│   └── JwtAuthenticationFilter.java   # X-User-Id ↔ subject 교차검증 추가
└── ...
```

### 3.2 JwtTokenProvider (RSA 분기)
```java
public class JwtTokenProvider {
    private final RSAPublicKey publicKey;   // 검증용
    private final RSAPrivateKey privateKey; // 발급용 (Portal에만)
    
    public Claims validateToken(String token) {
        return Jwts.parser()
                .verifyWith(publicKey)
                .requireIssuer(properties.getIssuer())
                .clockSkewSeconds(30)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
    
    private RSAPublicKey loadPublicKey(String path) {
        Resource res = new ClassPathResource(path.replace("classpath:", ""));
        String key = new String(res.getInputStream().readAllBytes())
            .replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replaceAll("\\s", "");
        byte[] decoded = Base64.getDecoder().decode(key);
        return (RSAPublicKey) KeyFactory.getInstance("RSA")
            .generatePublic(new X509EncodedKeySpec(decoded));
    }
}
```

### 3.3 SecurityConfig 도메인별 권한 매핑
```java
http.authorizeHttpRequests(auth -> auth
    .requestMatchers("/actuator/health").permitAll()
    .requestMatchers("/api/production/**").hasAnyAuthority("ROLE_PRODUCTION", "ROLE_ADMIN")
    .requestMatchers("/api/operation/**").hasAnyAuthority("ROLE_OPERATION", "ROLE_ADMIN")
    .anyRequest().authenticated())
```

---

## 4. 설계 2 — Next.js BFF 1차 Role 차단

### 4.1 책임 분담
| 계층 | 검증 내용 | 목적 |
|------|----------|------|
| Next.js BFF | JWT 유효성 + Route별 Role 매핑 | 불필요한 백엔드 트래픽 차단 |
| WAS (cactus) | 토큰 서명 검증 + 세부 권한 체크 | 실제 보안 보장 |

### 4.2 Middleware 예시
```typescript
const ROUTE_ROLE_MAP: Record<string, string[]> = {
  '/api/production': ['ROLE_PRODUCTION', 'ROLE_ADMIN'],
  '/api/operation':  ['ROLE_OPERATION', 'ROLE_ADMIN'],
};

export async function middleware(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const publicKey = await importSPKI(process.env.JWT_PUBLIC_KEY!, 'RS256');
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });

  const userRoles = payload.roles as string[];
  const matchedRoute = Object.keys(ROUTE_ROLE_MAP)
    .find(route => request.nextUrl.pathname.startsWith(route));

  if (matchedRoute) {
    const required = ROUTE_ROLE_MAP[matchedRoute];
    if (!required.some(r => userRoles.includes(r)))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const response = NextResponse.next();
  response.headers.set('X-User-Id', payload.sub as string);
  response.headers.set('X-User-Roles', userRoles.join(','));
  return response;
}
```

---

## 5. 미구현 사유 및 현재 작동 부분

### 5.1 미구현 사유
- 모든 모듈이 **사내 단일 신뢰 경계** 내에 배포됨
- 프론트엔드 인증은 **NextAuth 세션 쿠키** 기반 (BFF가 직접 JWT를 검증하지 않음)
- BFF는 백엔드 토큰(`backendAccessToken`)을 그대로 위임 프록시
- 외부 노출 API 없음 → secret 공유 방식의 위험이 노출되지 않음

### 5.2 이미 작동하고 있는 빌딩블록
| 빌딩블록 | 위치 | 비고 |
|---------|------|------|
| JWT roles 클레임 발급 | `cactus-core/security/jwt/JwtTokenProvider.java:71-72` | `accessBuilder.claim(CLAIM_ROLES, userInfo.roles())` |
| DB role 조회 | `portal-be/.../PortalAuthService.loadUserRoles()` | `TB_SEC_USER_ROLE` → `"ROLE_" + roleId` |
| BFF 동적 권한 캐시 | `frontend/portal/lib/auth/api-permission-cache.ts` (TTL 5분, `TTL_MS = 5 * 60 * 1000`) | role별 API 패턴 캐시 |
| BFF 1차 차단 (403) | `frontend/portal/proxy.ts` 라인 ~110-116 (`checkApiPermission` 실패), ~103-107 (캐시 미적재) | `NextResponse.json(..., { status: 403 })` |
| 백엔드 헤더 주입 | `frontend/portal/app/api/[module]/rest/[...path]/route.ts` (Phase 7 BFF 컨벤션) | `X-Authenticated-User`, `X-Authenticated-Role`, `X-Client-Key`, Authorization 4종 |
| BFF self-fetch 식별 | `frontend/portal/lib/http/bff-auth.ts` | `X-Internal-Bff-Call: 1` (RBAC cache warmup 등) |

→ "RS256 + jose + ROUTE_ROLE_MAP"은 미구현이지만, BFF가 권한 미달 요청을 백엔드 도달 전에 차단하는 기능은 작동 중.

---

## 6. RSA 전환 필요성 평가

### 6.1 현 시점 권장: **불필요**
- 사내 단일 신뢰 경계 + BFF가 직접 JWT 검증 안 함 → secret 공유 위험이 실제로 노출되지 않음
- RSA 도입 비용(키페어 관리·로테이션·JWKS 운영) > 현재 얻는 보안 이득

### 6.2 전환 트리거
| 트리거 | 이유 |
|--------|------|
| 외부망/협력사 노출 API 신설 | BFF·외부 클라이언트가 검증 주체가 됨 |
| 다중 사업장/별도 인프라 분리 배포 | secret 동기화·로테이션 부담 폭증 |
| 마이크로서비스 분리 + 팀별 운영 | 한 팀 secret 유출이 전체 영향 |
| ISMS / 금융권 등 보안 감사 요구 | 비대칭키 권장/필수 |
| BFF에서 1차 RS256 검증 도입 | BFF가 키를 보유해야 함 |

### 6.3 중간 안 (지금 즉시 적용 권장)
1. **`cactus.jwt.secret` 환경변수화** — 평문 하드코딩 제거.
2. **Access token 만료 단축 + Refresh rotation** — 탈취 시 영향 최소화.
3. **`X-User-Id` ↔ JWT subject 교차검증** — 10줄 변경으로 토큰 변조 방지.
4. **헤더명 표준화** — `X-Authenticated-User/Role` ↔ `X-User-Id/Roles` 통일.

### 6.4 RSA 전환 시 작업 범위
이미 깔린 빌딩블록 덕분에 1~2주 내 전환 가능:
- **cactus-core**: `JwtTokenProvider` RSA 분기 + `JwtProperties` 키 경로 추가 + 키페어 생성 스크립트
- **portal-be**: 도메인별 `hasAnyAuthority()` 매핑 (선택)
- **portal-fe**: `middleware.ts` 신설 + `jose` 도입 + 환경변수에 public key

---

## 7. 도입 시 고려사항

| 항목 | 설명 |
|------|------|
| Key Rotation | public key 갱신 시 모든 WAS 재배포 필요 → JWKS endpoint 방식 고려 |
| 토큰 블랙리스트 | 로그아웃 시 토큰 무효화 위해 Redis |
| Rate Limiting | NginX 또는 Bucket4j |
| 감사 로그 | 인증 성공/실패 로깅 |
| Role 매핑 관리 | **현재 portal은 DB 기반 동적 매핑(권장 방식 충족)**. 정적 ROUTE_ROLE_MAP 도입 시 오히려 후퇴 |

---

## 8. 주의 — `@PreAuthorize`와 OasisController 호환성

OasisController는 단일 `handle()` 메서드로 모든 요청을 처리하므로 메서드 레벨 `@PreAuthorize`가 불가능. URL pattern 기반 `authorizeHttpRequests`로 도메인별 Role 매핑.

---

## 9. 결론 요약

- **RSA 비대칭 JWT는 현 시점에 불필요** — secret 공유 리스크 미노출.
- **BFF Role 검증 본질은 이미 작동** — NextAuth + 동적 권한 캐시 + proxy.ts 403.
- **즉시 권장**: secret 환경변수화 + 토큰 만료 단축 + X-User-Id ↔ subject 교차검증.
- **트리거 발생 시 1~2주 내 전환 가능** — roles 클레임/role 캐시/프록시/403 등 빌딩블록 70% 이상 완성.

---

## 10. 관련 정리본

- 04 인증보안 JWT (현재 HMAC 구현)
- 07 URL 구조 (도메인별 권한 매핑 시 필요)
