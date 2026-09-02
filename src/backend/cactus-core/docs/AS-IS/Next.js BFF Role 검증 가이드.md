# Next.js BFF Role 검증 가이드

> **APS Core Migration 반영(요약)**
> - cactus-core 본체에서 **AuthController 는 호출자 0 데드코드로 삭제**됨. 로그인/리프레시/로그아웃 API 는 portal 모듈의 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 가 노출한다.
> - **OasisController 매핑은 `/oasis` 로 고정**. `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지.
> - BFF 컨벤션: UI→BFF 는 `/api/{module}/oasis/{serviceId}/{action}` 또는 `/api/{module}/nooasis/{path}`, BFF→BE 는 OASIS 그대로(`/oasis/{serviceId}/{action}`), REST 는 `/api/{module}/nooasis/` segment 만 제거.
> - env: 클라이언트 키 환경변수는 `BACKEND_CLIENT_KEY` 로 통일. BFF 가 BE 로 호출 시 `X-Backend-Client-Key` 헤더로 전달, BE 의 ClientKeyFilter 가 검증한다.

## 인증/인가 흐름

```
1. 로그인 요청
   Portal(React) → Next.js(BFF) → Portal WAS → Security(DB)
                                  ← JWT 발급 (Access + Refresh)

2. API 요청
   Portal(React) → Next.js(BFF) → [Role 검증] → NginX → 도메인 WAS
                    ① JWT 파싱         ② Role 체크      ③ 토큰 전달
```

## Role 검증 전략

**핵심 원칙: BFF는 "가벼운 1차 검증", WAS는 "완전한 2차 검증"**

| 계층 | 검증 내용 | 목적 |
|------|----------|------|
| **Next.js (BFF)** | JWT 유효성 + Role 매핑으로 API 접근 차단 | 불필요한 백엔드 트래픽 차단 |
| **WAS (SpringSecurity)** | 토큰 서명 검증 + 세부 권한 체크 | 실제 보안 보장 |

## 구현 방식

### 1. Middleware에서 JWT 디코딩 + Role 체크

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify, importSPKI } from 'jose'

// 도메인별 필요 Role 매핑 (BFF 컨벤션: `/api/{module}/...`)
const ROUTE_ROLE_MAP: Record<string, string[]> = {
  '/api/aps':       ['ROLE_PRODUCTION', 'ROLE_ADMIN'],   // 공정계획 (APS)
  '/api/mpp':       ['ROLE_OPERATION', 'ROLE_ADMIN'],    // 생산수행
  '/api/mqc':       ['ROLE_QUALITY', 'ROLE_ADMIN'],      // 품질관리
  '/api/portal':    ['ROLE_USER', 'ROLE_ADMIN'],         // 포털
}

export async function middleware(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // RSA 공개키로 JWT 서명 검증 (BFF에는 public key만 배포)
    const publicKey = await importSPKI(process.env.JWT_PUBLIC_KEY!, 'RS256')
    const { payload } = await jwtVerify(
      token,
      publicKey,
      { algorithms: ['RS256'] }
    )

    // Role 체크
    const userRoles = payload.roles as string[]
    const matchedRoute = Object.keys(ROUTE_ROLE_MAP)
      .find(route => request.nextUrl.pathname.startsWith(route))

    if (matchedRoute) {
      const requiredRoles = ROUTE_ROLE_MAP[matchedRoute]
      const hasRole = requiredRoles.some(role => userRoles.includes(role))

      if (!hasRole) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // 백엔드로 토큰 그대로 전달
    const response = NextResponse.next()
    response.headers.set('X-User-Id', payload.sub as string)
    response.headers.set('X-User-Roles', userRoles.join(','))
    return response

  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
}

export const config = {
  matcher: '/api/:path*'
}
```

### 2. Route Handler에서 백엔드 프록시

```typescript
// app/api/[module]/oasis/[...path]/route.ts
import { NextRequest } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL // NginX 주소
const BACKEND_CLIENT_KEY = process.env.BACKEND_CLIENT_KEY!

export async function POST(request: NextRequest) {
  // BFF 컨벤션:
  //   - OASIS:    UI→BFF `/api/{module}/oasis/{serviceId}/{action}`
  //               → BFF→BE `/oasis/{serviceId}/{action}` (그대로 전달)
  //   - 비-OASIS: UI→BFF `/api/{module}/nooasis/{path}`
  //               → BFF→BE `/{path}` (`/api/{module}/nooasis/` segment 만 제거)
  const inboundPath = request.nextUrl.pathname            // 예: /api/aps/oasis/workorder/search
  const backendPath = inboundPath
    .replace(/^\/api\/[^/]+\/oasis(\/|$)/, '/oasis$1')    // OASIS 경로 → /oasis/...
    .replace(/^\/api\/[^/]+\/nooasis(\/|$)/, '$1')        // 비-OASIS → segment 제거

  return fetch(`${BACKEND_URL}${backendPath}${request.nextUrl.search}`, {
    method: 'POST',
    headers: {
      'Authorization': request.headers.get('Authorization')!,
      'X-User-Id': request.headers.get('X-User-Id')!,
      'X-User-Roles': request.headers.get('X-User-Roles')!,
      'X-Backend-Client-Key': BACKEND_CLIENT_KEY,         // ClientKeyFilter 검증용
    },
    body: request.body,
  })
}
```

## 고려사항

| 항목 | 권장 |
|------|------|
| **JWT 검증 방식** | 대칭키(HMAC) 보다 **비대칭키(RSA/EC)** 권장 — BFF에는 public key만 배포 |
| **토큰 저장 위치** | httpOnly Cookie 권장 (XSS 방어) |
| **Refresh Token** | BFF에서 처리하여 프론트에 노출하지 않음 |
| **Role 매핑 관리** | 하드코딩보다 설정 파일 또는 DB 기반으로 관리 |
| **서명 키 공유** | Portal WAS에서 발급한 JWT를 BFF와 도메인 WAS 모두 검증해야 하므로 **public key 공유 필요** |

## 비대칭키 방식 권장 이유

```
Portal WAS (private key로 JWT 서명/발급)
    ↓
Next.js BFF (public key로 검증만) ← 키 유출되어도 토큰 위조 불가
    ↓
도메인 WAS (public key로 검증만)
```

BFF는 신뢰 경계 밖에 있는 Node.js 서버이므로, private key를 두지 않는 비대칭키 구조가 보안상 적합합니다.
