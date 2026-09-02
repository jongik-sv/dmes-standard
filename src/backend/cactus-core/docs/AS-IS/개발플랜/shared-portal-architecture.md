# shared / portal 역할 분석서

> 작성일: 2026-04-06
> 목적: `@dk-oasis/shared`와 `@dk-oasis/portal`의 역할, 책임 범위, 의존 관계를 정리한 아키텍처 분석 문서
>
> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - cactus-core 본체에서 **AuthController 는 호출자 0 데드코드로 삭제**됨. portal 은 자체 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 를 사용한다(BFF `/api/auth/*` 핸들러는 portal BE 의 PortalAuthController 로 프록시).
> - **OasisController 매핑은 `/oasis` 로 고정**. `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지.
> - BFF 컨벤션: UI→BFF `/api/{module}/oasis/{serviceId}/{action}` 또는 `/api/{module}/nooasis/{path}`, BFF→BE 는 OASIS 그대로(`/oasis/{...}`), REST 는 `/api/{module}/nooasis/` segment 만 제거.
> - env: `BACKEND_CLIENT_KEY` 통일. BFF→BE 호출 시 헤더는 `X-Backend-Client-Key` 표준.

---

## 1. 전체 구조

```
┌──────────────────────────────────────────────────────────────┐
│                    portal (호스트 앱)                          │
│  ┌────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ 라우팅  │  │ API 프록시 │  │ 인증 설정 │  │  모듈 로딩     │  │
│  │ (App   │  │ (BFF)    │  │ (Config) │  │ (module-     │  │
│  │ Router)│  │          │  │          │  │  config.ts)  │  │
│  └───┬────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│      │            │             │               │           │
│  ┌───┴────────────┴─────────────┴───────────────┴────────┐  │
│  │              page-components (업무 화면 등록)            │  │
│  │   scheduling/ | planning/ | bom/ | access-management/ │  │
│  └───────────────────────┬───────────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────┘
                           │ import
┌──────────────────────────┼──────────────────────────────────┐
│                    m-aps (업무 모듈)                          │
│   pages/master/*  |  pages/scheduling/*  |  pages/planning/* │
│   src/master/*    |  src/scheduling/*    |  src/planning/*   │
└──────────────────────────┼──────────────────────────────────┘
                           │ import
┌──────────────────────────┼──────────────────────────────────┐
│                   shared (프레임워크)                         │
│  auth | portal-shell | UI 컴포넌트 | layout | utils | oasis │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. shared (`@dk-oasis/shared`) — 프레임워크 / 공통 라이브러리

### 2.1 역할 요약

모듈 개발자가 `pnpm add`로 설치해서 사용하는 **재사용 가능한 기반 코드**.
자체적으로 실행되는 앱이 아니며, 반드시 호스트 앱(portal)에서 마운트되어야 동작한다.

### 2.2 모듈별 상세 분석

#### 2.2.1 인증 시스템 (`src/auth/`)

| 파일 | 역할 | 사용 대상 |
|------|------|-----------|
| `server.ts` | 핵심 인증 로직. NextAuth 옵션, JWT 발급, OIDC 토큰, 역할 검증 (`hasRequiredRole`), 세션 조회 (`getAuthSession`), Bearer 토큰 검증 | portal (lib/auth/config.ts) |
| `db.ts` | Prisma 기반 사용자 DB. CRUD, bcrypt 비밀번호 해시, 소프트 삭제 | portal (인증 시) |
| `cookies.ts` | 세션 쿠키 이름 관리. HTTPS/HTTP 분기, `__Secure-`/`__Host-` prefix | portal (미들웨어) |
| `proxy.ts` | NextAuth 미들웨어. `/portal/*` 경로 보호, 미인증 시 `/login` 리다이렉트 | portal (middleware.ts) |
| `routes.ts` | 팩토리 함수. `createPortalAppBindings()`로 인증+메뉴+사용자관리 핸들러 일괄 생성 | portal (lib/auth/config.ts) |
| `login-form.tsx` | 로그인 UI. ID/PW 입력, 기본비밀번호(dmes) 감지 시 변경 모달 | portal (app/login/) |
| `login-page.tsx` | 로그인 페이지 팩토리. 인증 상태 확인 후 리다이렉트 | portal (app/login/) |
| `PasswordChangeModal.tsx` | 비밀번호 변경 모달. 현재/새 비밀번호 입력, 유효성 검증 | login-form에서 호출 |

**역할 계층 (RBAC)**:
```
viewer(0) < editor(1) < admin(2) < sysadmin(3)
```

**핵심 함수**:
```typescript
getAuthSession()                           // 현재 세션 조회
requireAuthUser(minimumRole?)              // 세션 + 역할 검증 (API 보호)
authenticateOidcBearerToken(req, role?)    // Bearer 토큰 검증
hasRequiredRole(current, minimum)          // 역할 비교
createPortalAppBindings(options)           // 인증 전체 셋업 팩토리
```

---

#### 2.2.2 포탈 쉘 (`src/portal-shell/`)

| 파일 | 역할 |
|------|------|
| `portal-shell.tsx` | 메인 쉘 컴포넌트. 탭 관리, 사이드바, 헤더, 대시보드, 즐겨찾기, 동적 페이지 로딩, 탭 상태 localStorage 영속화 |
| `core.ts` | 페이지 이름 조합/검증, 모듈 페이지 리졸버, 안전 페이지 로더 |
| `module.ts` | 모듈 등록. pageId 파싱 (`moduleId:path/pageName`), 모듈 프로바이더 등록 |
| `types.ts` | `PortalShellPageComponent` (tabId, snapshot, onSnapshotChange), `PortalShellMenuItem` |
| `home-tab.ts` | 홈 탭 관리 |
| `header/Header.tsx` | 상단 네비게이션 헤더 |
| `sidebar/Sidebar.tsx` | 좌측 메뉴 사이드바 |
| `tabs-bar/TabsBar.tsx` | 탭 바 (열림/닫힘/활성화) |
| `dashboard/Dashboard.tsx` | 컨텐츠 영역 |
| `use-portal-menu.ts` | 메뉴 데이터 fetch 훅 |
| `use-portal-favorites.ts` | 즐겨찾기 fetch 훅 |

**모듈 개발자가 직접 사용하는 것**: `PortalShellPageComponent` 타입 (페이지 인터페이스)

```typescript
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

export default function MyPage({ tabId, snapshot, onSnapshotChange }: PageProps) {
  return <div>...</div>;
}
```

---

#### 2.2.3 메뉴 시스템 (`src/portal-menu/`)

| 파일 | 역할 |
|------|------|
| `types.ts` | `PortalMenuRecord`, `PortalFavoriteMenuRecord`, Repository 인터페이스 |
| `service.ts` | 메뉴 트리 변환, depth 검증(최대 3단계), 자동 "사용자관리" 메뉴 주입, 정렬, 순환참조 감지 |
| `db.ts` | Prisma 기반 메뉴/즐겨찾기 DB 조회 |
| `routes.ts` | API 핸들러: `GET /api/portal/menu`, `GET/POST/DELETE /api/portal/favorites` |

---

#### 2.2.4 사용자 관리 (`src/user-management/`)

| 파일 | 역할 |
|------|------|
| `routes.ts` | 사용자 CRUD API 핸들러. `minimumRole: "admin"` 적용. Bearer 토큰 → 세션 fallback 이중 인증 |

---

#### 2.2.5 UI 컴포넌트 (`src/components/`)

**폼 컴포넌트** (`form/`):

| 컴포넌트 | 설명 |
|----------|------|
| `Button` | 버튼 (default, primary, danger 변형) |
| `Input` | 텍스트 입력 |
| `Select` | 드롭다운 선택 |
| `Checkbox` | 체크박스 |
| `DatePicker` | 날짜 선택기 |
| `Radio` | 라디오 버튼 그룹 |
| `Textarea` | 다중 라인 텍스트 |
| `FormGroup` | 폼 필드 래퍼 |
| `ComboBox` | 자동완성 드롭다운 |
| `Spinner` | 로딩 스피너 |

**그리드 컴포넌트** (`grid/`):

| 컴포넌트 | 설명 |
|----------|------|
| `AgDataGrid` | AG Grid 기반 데이터 그리드. 멀티 셀렉트, 정렬, 리사이즈 |
| `MuiDataGrid` | MUI DataGrid 기반 |
| `CustomDataGrid` | 커스텀 그리드 |
| `GridPanel` | CRUD 그리드 래퍼. 추가/수정/삭제, 임시행, 액션 버튼 |
| `useGridDataManager` | 행 상태 추적 (new/modified/deleted), 저장 관리 |
| `useRowStateManager` | 행 레벨 상태 관리 |

**기타**:

| 컴포넌트 | 설명 |
|----------|------|
| `Tree` (`tree/`) | 계층적 트리 뷰 |
| `Modal` (`modal.tsx`) | 모달 다이얼로그. ESC 닫기, 탭 트래핑, 포커스 관리 |
| `MessageProvider` (`message-provider.tsx`) | gfn_message 알림 시스템 |
| `ErrorBoundary` (`error-boundary.tsx`) | React 에러 바운더리 |

---

#### 2.2.6 레이아웃 (`src/layout/`)

| 컴포넌트 | 설명 |
|----------|------|
| `PageLayout` | 페이지 전체 래퍼. 제목, 액션 버튼 영역 |
| `SearchArea` | 검색 필터 섹션 |
| `SearchField` | 개별 검색 입력 필드 |
| `ContentBody` | 메인 컨텐츠 영역 |
| `ContentPanel` | 스크롤 가능한 컨텐츠 패널 |
| `ErrorModal` | 에러 표시 모달 |

---

#### 2.2.7 유틸리티 (`src/lib/`, `src/utils/`)

| 모듈 | 주요 함수 |
|------|-----------|
| `libUtil` | null 체크, 타입 변환, 공통 유틸 |
| `libDate` | 날짜 포맷팅, 변환 |
| `libFormat` | 숫자/통화 포맷팅 |
| `libString` | 문자열 조작 (trim, pad, split 등) |
| `libValidation` | 유효성 검증 (이메일, 전화번호, 사업자번호 등) |
| `libDataset` | 데이터셋 조작 |
| `libExcel` | Excel 내보내기 |
| `libChart` | 차트 데이터 유틸 |
| `generateId` | 타임스탬프 + 랜덤 ID 생성 |
| `broadcastChannel` | 크로스 탭 통신 |

---

#### 2.2.8 HTTP / Storage / Snapshot

| 모듈 | 파일 | 역할 |
|------|------|------|
| `http` | `src/http/index.ts` | `getJson<T>()` fetch 유틸, `HttpError` 클래스 |
| `secure-storage` | `src/secure-storage/index.ts` | localStorage 래퍼. Base64 인코딩 읽기/쓰기 |
| `snapshot` | `src/snapshot/index.ts` | `cloneSnapshot<T>()`, `isSnapshotEqual()` |

---

#### 2.2.9 OASIS 백엔드 연동 (`src/oasis/`)

| 파일 | 역할 |
|------|------|
| `types.ts` | `OasisServiceRequest/Response`, `OasisLoginRequest/Response` |
| `oasis-api-client.ts` | HTTP 클라이언트 팩토리. 토큰 자동 갱신, 401 처리 |
| `oasis-token-store.ts` | 클라이언트 사이드 토큰 저장 (Base64) |
| `use-oasis-auth.ts` | React 인증 훅 |
| `use-oasis-service.ts` | React 서비스 호출 훅 |

---

#### 2.2.10 기타

| 모듈 | 역할 |
|------|------|
| `access-db.ts` | Prisma 클라이언트 싱글톤 팩토리 (SQLite 30초 busy timeout) |
| `use-form-validation.ts` | 폼 유효성 검증 훅 |
| `pages/home-page.tsx` | 기본 홈 페이지 컴포넌트 |
| `prisma/schema.prisma` | DB 스키마 (PortalUser, PortalMenu, PortalFavoriteMenu) |

---

### 2.3 exports 목록 (25+ 개)

```
@dk-oasis/shared                   전체 패키지
@dk-oasis/shared/http              HTTP 유틸
@dk-oasis/shared/secure-storage    보안 저장소
@dk-oasis/shared/snapshot          스냅샷 유틸
@dk-oasis/shared/portal-shell-core 포탈 쉘 코어 (타입, 유틸)
@dk-oasis/shared/portal-shell      포탈 쉘 컴포넌트
@dk-oasis/shared/portal-menu       메뉴 서비스
@dk-oasis/shared/portal-menu-db    메뉴 DB
@dk-oasis/shared/portal-menu-routes 메뉴 API 핸들러
@dk-oasis/shared/auth-db           인증 DB
@dk-oasis/shared/auth-cookies      인증 쿠키
@dk-oasis/shared/auth-proxy        인증 미들웨어
@dk-oasis/shared/auth-server       인증 서버 로직
@dk-oasis/shared/auth-routes       인증 라우트 팩토리
@dk-oasis/shared/auth-login-form   로그인 폼
@dk-oasis/shared/auth-login-page   로그인 페이지
@dk-oasis/shared/layout            레이아웃 컴포넌트
@dk-oasis/shared/layout.css        레이아웃 스타일
@dk-oasis/shared/access-db         Prisma 클라이언트
@dk-oasis/shared/utils             유틸리티 모음
@dk-oasis/shared/error-boundary    에러 바운더리
@dk-oasis/shared/use-form-validation 폼 검증 훅
@dk-oasis/shared/modal             모달 컴포넌트
@dk-oasis/shared/message-provider  메시지 프로바이더
@dk-oasis/shared/form              폼 컴포넌트
@dk-oasis/shared/grid              그리드 컴포넌트
@dk-oasis/shared/tree              트리 컴포넌트
@dk-oasis/shared/oasis             OASIS 연동
@dk-oasis/shared/lib               레거시 유틸
@dk-oasis/shared/*.css             스타일 파일들
```

---

## 3. portal (`@dk-oasis/portal`) — 호스트 웹 애플리케이션

### 3.1 역할 요약

shared와 업무 모듈(m-aps 등)을 **조립하여 실행**하는 최종 앱.
Next.js App Router 기반으로 라우팅, 인증, API 프록시, 모듈 로딩을 담당한다.

### 3.2 영역별 상세 분석

#### 3.2.1 앱 라우팅 (`app/`)

| 경로 | 파일 | 역할 |
|------|------|------|
| `/` | `app/page.tsx` | 루트. 인증 여부에 따라 `/portal` 또는 `/login` 리다이렉트 |
| `/login` | `app/login/page.tsx` | 로그인 페이지. shared의 `createPortalLoginPage()` 사용 |
| `/portal` | `app/portal/page.tsx` | 포탈 메인. PortalShell 마운트, 메뉴/즐겨찾기 로딩, 로그아웃 |
| `/oasis-test` | `app/oasis-test/page.tsx` | OASIS 서비스 테스트 페이지 (개발용) |

#### 3.2.2 API 프록시 (`app/api/`)

| 엔드포인트 | 메서드 | 역할 | 인증 |
|-----------|--------|------|------|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth 핸들러 (로그인, 로그아웃, 세션) | - |
| `/api/auth/me` | GET | 현재 사용자 정보 반환 | 세션 |
| `/api/auth/password` | PATCH/POST | 비밀번호 변경/초기화 → 백엔드 프록시 | 세션 |
| `/api/portal/menu` | GET | 메뉴 트리 → 백엔드 `secUser/myMenus` 프록시 | 세션 |
| `/api/portal/favorites` | GET | 즐겨찾기 → 백엔드 `secFavorite/search` 프록시 | 세션 |
| `/api/users` | GET/POST | 사용자 목록/생성 | admin |
| `/api/users/[id]` | PUT/DELETE | 사용자 수정/삭제 | admin |
| **`/api/[...path]`** | ALL | **범용 백엔드 REST 프록시 (BFF)** | 세션 |
| `/api/[serviceId]/[action]` | POST | OASIS CactusRequest 프록시 | 세션 |

> **`/api/[...path]`가 핵심**: 모듈의 모든 API 호출(`fetch("/api/materials")`)이 이 프록시를 경유하여 백엔드에 도달

#### 3.2.3 인증 설정 (`lib/auth/config.ts`)

shared의 `createPortalAppBindings()`를 호출하여 구체적인 설정을 주입:

```typescript
const portalBindings = createPortalAppBindings({
  databaseUrl: resolvePortalDatabaseUrl(),    // file:../menu.db
  authCookiePrefix: "oasis-portal-auth",
  oidcAudience: "oasis-portal",
  allowSessionFallback: true,
  backendApiUrl: process.env.BACKEND_API_URL,
});
```

**내보내는 함수**:
- `getAuthSession()` — 세션 조회
- `requireAuthUser()` — 보호된 API용
- `authNextGet/Post` — NextAuth 핸들러
- `authMeGet` — /api/auth/me 핸들러
- `normalizeCallbackUrl()` — 콜백 URL 정규화

#### 3.2.4 BFF 인증 헬퍼 (`lib/http/bff-auth.ts`)

```typescript
getBffAuthContext(req: NextRequest)
→ { userId: string, backendAccessToken?: string } | null
```

API 프록시 라우트에서 세션 쿠키의 JWT를 파싱하여 백엔드 요청에 필요한 인증 정보를 추출한다.

#### 3.2.5 모듈 로딩 시스템 (`app/portal/`)

**module-config.ts**:
```typescript
const modules: PortalModuleConfigEntry[] = [
  { moduleId: "portal", packageName: "@dk-oasis/portal" },
  // 새 모듈 추가 시 여기에 등록
];
```

**registered-modules.ts**:
```typescript
resolvePortalPage(pageId: string)
// "portal:scheduling/gantt" → page-components/scheduling/gantt/page.tsx 로딩
// "m-aps:master/bom" → @dk-oasis/m-aps/pages/master/bom-page 로딩
```

#### 3.2.6 업무 화면 (`page-components/`)

| 그룹 | 화면 수 | 주요 화면 |
|------|---------|-----------|
| `access-management/` | 5 | 사용자, 역할, 권한, 객체, 메뉴 관리 |
| `scheduling/` | 10 | 간트, 요약, 스케줄 목록, 분석, 실행, 프로파일 등 |
| `planning/` | 8 | 수요, 주문, 계획주문, 페깅, 용량, 타임라인 등 |
| `master/` (bom, material 등) | 12+ | BOM, 자재, 자원, 공정, 캘린더, 재고, 고객, 협력사 등 |
| `operation/` | 4 | 일정 발행, 긴급주문, 동결구간, 설비가동중단 |
| `simulation/` | 3 | 시나리오, 비교, KPI 대시보드 |
| 기타 | 3 | 홈, 대시보드, 셋업 매트릭스 |

**페이지 등록 방식**:
- portal 내부 구현: `page-components/` 아래에 직접 작성
- m-aps 모듈에서 re-export: `export { default } from "@dk-oasis/m-aps/pages/master/bom-page"`

#### 3.2.7 데이터베이스 (`menu.db`)

- SQLite 파일. Prisma ORM으로 접근
- 테이블: `PortalUser`, `PortalMenu`, `PortalFavoriteMenu`
- 개발용 로컬 DB. 운영은 백엔드에서 메뉴 조회

#### 3.2.8 환경 변수

```env
# 필수
AUTH_SECRET=                      # JWT 서명 시크릿 (32자 이상)
NEXTAUTH_URL=http://localhost:5000
DATABASE_URL=file:../menu.db

# 백엔드 연동
BACKEND_API_URL=                  # 백엔드 서버 URL
BACKEND_CLIENT_KEY=               # 백엔드 클라이언트 키

# 선택
AUTH_COOKIE_PREFIX=oasis-portal-auth
AUTH_BOOTSTRAP_ADMIN_ID=admin
AUTH_BOOTSTRAP_ADMIN_PASSWORD=admin
```

---

## 4. shared vs portal 책임 비교

| 책임 | shared | portal |
|------|--------|--------|
| 인증 로직 (JWT, 역할 검증) | **O** (구현) | 설정만 주입 |
| NextAuth 설정 | 팩토리 제공 | **O** (구체적 설정) |
| 미들웨어 (경로 보호) | **O** (구현) | 적용 |
| 로그인 UI | **O** (컴포넌트) | 페이지로 마운트 |
| 포탈 쉘 (탭, 사이드바) | **O** (컴포넌트) | 마운트 + 메뉴 데이터 전달 |
| API 프록시 (BFF) | - | **O** |
| 모듈 등록/로딩 | 인터페이스 제공 | **O** (설정) |
| UI 컴포넌트 | **O** | 사용 |
| 레이아웃 | **O** | 사용 |
| 유틸리티 | **O** | 사용 |
| 메뉴 DB | 스키마 + 조회 로직 | **O** (DB 파일 관리) |
| 업무 화면 | - | **O** (등록/라우팅) |
| 빌드/배포 | npm 패키지 | Next.js 앱 |

---

## 5. 데이터 흐름

### 5.1 페이지 로딩 흐름

```
사용자 → /portal 접속
  → portal/app/portal/page.tsx (PortalShell 마운트)
    → shared/portal-shell.tsx (쉘 렌더링)
      → GET /api/portal/menu (메뉴 조회)
      → 사이드바에 메뉴 트리 표시
      → 사용자가 메뉴 클릭
        → resolvePortalPage("portal:scheduling/gantt")
          → page-components/scheduling/gantt/page.tsx 동적 로딩
            → 탭에 마운트
```

### 5.2 API 호출 흐름

```
페이지 컴포넌트 (m-aps)
  → fetch("/api/aps/oasis/materials/search")              // BFF 컨벤션 (OASIS)
    → portal/app/api/[module]/oasis/[...path]/route.ts (BFF 프록시)
      → getBffAuthContext(req) → JWT에서 userId, backendAccessToken 추출
      → fetch(`${BACKEND_API_URL}/oasis/materials/search`, {   // BFF→BE 는 OASIS 그대로
          headers: {
            "X-Backend-Client-Key": BACKEND_CLIENT_KEY,        // ClientKeyFilter 검증용
            "X-Authenticated-User": userId,
            "X-Authenticated-Role": role,
            "Authorization": `Bearer ${backendAccessToken}`
          }
        })
      → 백엔드 응답을 그대로 반환
```

### 5.3 인증 흐름

```
사용자 → /login 접속
  → shared/login-form.tsx (ID/PW 입력)
    → NextAuth signIn("credentials", { userId, password })
      → shared/auth/server.ts (CredentialsProvider)
        → 로컬 SQLite 검증 또는 백엔드 POST /auth/login (portal BE 의 PortalAuthController)
          → JWT 발급 → 세션 쿠키 저장
            → /portal로 리다이렉트

이후 모든 API 요청:
  → 쿠키에서 JWT 자동 전달
    → portal API 프록시에서 인증 확인
      → 백엔드로 전달
```

---

## 6. 모듈 개발자 관점

### 6.1 모듈 개발자가 사용하는 shared 모듈

```typescript
// 페이지 타입
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

// 레이아웃
import { PageLayout, SearchArea, ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

// 폼 컴포넌트
import { Button, Input, Select, ComboBox, DatePicker } from "@dk-oasis/shared/form";

// 그리드
import { AgDataGrid, GridPanel, useRowStateManager } from "@dk-oasis/shared/grid";

// 메시지
import { useGfnMessage } from "@dk-oasis/shared/message-provider";

// 유틸리티
import { gfn_isNull, gfn_today } from "@dk-oasis/shared/utils";
```

### 6.2 모듈 개발자가 신경 쓰지 않아도 되는 것

- 인증/세션 관리 → portal이 처리
- API 프록시 → `/api/...`로 호출하면 portal이 백엔드로 전달
- 메뉴 구조 → portal에서 등록
- 포탈 쉘 (탭, 사이드바) → shared + portal이 처리
- DB 접근 → 프론트에서 직접 DB 접근 안 함
