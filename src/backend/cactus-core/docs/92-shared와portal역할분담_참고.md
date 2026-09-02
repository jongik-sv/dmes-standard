# 92. shared 와 portal 역할 분담 (참고)

> 통합 원본: `개발플랜/shared-portal-architecture.md` (497줄)
> 성격: **참고**. FE 의 `shared` (npm 라이브러리) 와 `portal` (호스트 앱) 의 책임 분리 안내.

---

## 1. 역할 매트릭스

| 항목 | shared | portal |
|---|---|---|
| 성격 | npm 패키지 (`@dk-oasis/shared`) | Next.js 호스트 앱 |
| 책임 | 프레임워크 / 컴포넌트 / 유틸 | 라우팅, BFF, 인증 설정, 메뉴 |
| 배포 | GitLab Package Registry | Vercel/사내 인프라 |
| 사용처 | portal + 모든 m-xxx 모듈 | 단일 호스트 |

---

## 2. shared (`@dk-oasis/shared`) export 맵

`frontend/shared/package.json` 의 `exports` 정의 (subpath 별 진입점). 30+ 개로 세분화되어 트리쉐이킹·번들 크기 최적화.

### 2.1 UI 컴포넌트
| subpath | 핵심 |
|---|---|
| `/layout` | PageLayout, SearchArea, SearchField, ContentBody, ContentPanel, MaxHandle, ErrorModal (+ `/layout.css`) |
| `/grid` | GridPanel, AgDataGrid, MuiDataGrid, CustomDataGrid, useRowStateManager (+ `/grid.css`) |
| `/form` | Input, Select, ComboBox, MultiSelectComboBox, DatePicker, Radio, Checkbox, Textarea, FormGroup, Spinner, Button (+ `/form.css`) |
| `/tree` | 트리 컴포넌트 (+ `/tree.css`) |
| `/modal` | Modal 컴포넌트 (+ `/modal.css`) |
| `/error-boundary` | React ErrorBoundary 래퍼 |
| `/message-provider` | useGfnMessage (Toast/배너) |

### 2.2 통신·인증 (HTTP/OASIS/Auth)
| subpath | 핵심 |
|---|---|
| `/http` | apiRequest, apiQuery, apiQueryService, apiService, apiLovMaster, apiLovQuery, apiLovService |
| `/oasis` | OASIS 클라이언트 헬퍼 |
| `/oasis-proxy` | BFF→BE OASIS 프록시 유틸 |
| `/auth-server` | NextAuth 서버 측 헬퍼 |
| `/auth-cookies` | 세션 쿠키 유틸 |
| `/auth-proxy` | BFF 인증 프록시 |
| `/auth-db` | 인증 DB (Prisma) |
| `/auth-routes` | NextAuth 라우트 정의 |
| `/auth-login-form` | 로그인 폼 컴포넌트 (+ `/auth-login-form.css`) |
| `/auth-login-page` | 로그인 페이지 컴포넌트 |

### 2.3 포탈 셸
| subpath | 핵심 |
|---|---|
| `/portal-shell-core` | PageProps, 모듈 동적 로딩 (PortalShellPageComponent) |
| `/portal-shell` | PortalShell UI (+ `/portal-shell.css`) |
| `/portal-menu` | 동적 메뉴 트리 |
| `/portal-menu-db` | 메뉴 DB 헬퍼 |
| `/portal-menu-routes` | 메뉴 라우트 정의 |
| `/access-db` | 접근권한 DB |

### 2.4 유틸·훅
| subpath | 핵심 |
|---|---|
| `/utils` | 공용 유틸 함수 |
| `/lib` | 공용 라이브러리 헬퍼 |
| `/use-form-validation` | 폼 검증 훅 |
| `/use-api-call` | API 호출 훅 |
| `/secure-storage` | 암호화된 localStorage |
| `/snapshot` | 화면 snapshot 관리 |

### 2.5 페이지
| subpath | 핵심 |
|---|---|
| `/pages/home-page` | 기본 홈 페이지 컴포넌트 |

> **인증은 단일 export 가 아닌 `/auth-server`, `/auth-cookies`, `/auth-proxy`, `/auth-db`, `/auth-routes`, `/auth-login-form`, `/auth-login-page` 등 7+ 개로 분리**되어 있음 (정리본 이전 표기 `/auth` 단일 export 는 부정확). 메뉴도 `/portal-menu`, `/portal-menu-db`, `/portal-menu-routes` 3분리.

---

## 3. portal 책임

### 3.1 인프라
- Next.js App Router 진입점 (`app/`)
- NextAuth 설정 (`app/api/auth/[...nextauth]`)
- BFF 프록시 (Phase 7 컨벤션):
  - `app/api/[module]/oasis/[serviceId]/[action]/route.ts`
  - `app/api/[module]/rest/[...path]/route.ts`
  - `app/api/[module]/query/[queryId]/route.ts`
  - `app/api/[module]/query/service/[serviceId]/route.ts`
  - `app/api/[module]/service/[serviceId]/route.ts`
  - `app/api/[module]/lov/master/[...path]/route.ts`
  - `app/api/[module]/lov/query/[queryId]/route.ts`
  - `app/api/[module]/lov/service/[serviceId]/route.ts`
- 공통 BFF 헬퍼 (`lib/http/be-proxy.ts`, `lib/http/bff-auth.ts`, `proxy.ts`)
- 메뉴 DB 시드 (`prisma/`, `seed-*.mjs`)

### 3.2 라우팅
- `/portal/page-components/{phase}/...` 에 페이지 등록
- 동적 모듈 로딩 (`app/portal/module-config.ts`, `registered-modules.ts`)
- m-xxx 모듈은 npm dependency 로 페이지 컴포넌트만 가져옴

### 3.3 인증/권한
- NextAuth 세션 쿠키 발급 (cookie name: `oasis-portal-auth.session-token`)
- `getToken()` 으로 세션 검증
- 동적 권한 캐시 (`lib/auth/api-permission-cache.ts`, `TTL_MS = 5 * 60 * 1000`)
- 403 차단 (`proxy.ts` 라인 ~110-116, ~103-107)
- 백엔드 헤더 4종 주입: `Authorization` (Bearer), `X-Client-Key`, `X-Authenticated-User`, `X-Authenticated-Role`
- BFF self-fetch 식별: `X-Internal-Bff-Call: 1` 헤더 (`lib/http/bff-auth.ts`)
- portal 만 자체 BE `SecurityConfig` (`com.dongkuk.dmes.mcm.config.SecurityConfig`) 보유 + `cactus.auth.enabled: true` 활성

---

## 4. 의존 관계

```
m-mpp ──┐
m-aps ──┼─→ @dk-oasis/shared (npm)
m-...  ──┘
              │
              ▼
            portal (Next.js host)
              │
              ▼
            BFF → BE (cactus-core 모듈)
```

- **m-xxx** 는 shared 만 의존, portal 직접 의존 안 함
- **portal** 은 shared + 모든 m-xxx 의존
- **shared** 는 어떤 모듈도 직접 의존 안 함 (NextAuth, react 등 외부 npm 만)

---

## 5. 책임 분리 원칙

### 5.1 shared 에 들어갈 것
- 모든 모듈에서 공통으로 쓰이는 컴포넌트
- 도메인 무관한 유틸/훅
- 인증·HTTP·메시지 등의 인프라 헬퍼

### 5.2 shared 에 들어가면 안 되는 것
- 특정 도메인의 비즈니스 로직 (예: 작업지시 상태 전이)
- 특정 화면의 페이지 컴포넌트
- portal 의 라우팅/메뉴 설정

### 5.3 portal 에만 들어갈 것
- App Router 페이지 (`app/`)
- BFF 프록시 라우트
- NextAuth 설정
- 메뉴 DB 시드
- 환경변수 (.env.local)

### 5.4 m-xxx 모듈에만 들어갈 것
- 도메인 페이지 컴포넌트 (`pages/...`)
- 도메인 API 호출 (`src/.../api.ts`)
- 도메인 타입 (`src/.../types.ts`)
- 도메인 비즈니스 로직

---

## 6. 빌드/개발 흐름

```
1. shared 수정 → cd shared && pnpm build (dist/ 생성)
2. portal 또는 m-xxx 가 dist/ 를 참조 (workspace 또는 npm dep)
3. portal dev 서버는 dist/ 를 watch
   주의: dist/ 삭제 금지 (Module not found 무한 루프)
   주의: tsup.config.ts 의 clean 옵션 false 유지
```

---

## 7. 참고 가이드

- **신규 모듈 셋업**: 정리본 93
- **shared 배포**: 정리본 93
- **dev-portal 분리 검토**: 정리본 94
- **BFF 컨벤션**: `frontend/CLAUDE.md` Phase 7 표

---

## 8. 관련 정리본

- 93 shared 배포 및 신규 모듈 가이드
- 94 dev-portal 설계
