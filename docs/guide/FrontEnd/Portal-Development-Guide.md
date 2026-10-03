# Portal (m-mcm) 개발 가이드

포털은 `src/frontend/m-mcm` 이다(구 `src/frontend/portal` 은 폐기). 화면 구현 표준은 [FrontEnd 표준 v2](FrontEnd_표준_통합_개발가이드_v2.md), BFF URL 컨벤션(OASIS/REST/Phase 7) 정본은 [frontend-standard/01 §2-2](standard-v2/frontend-standard/01-rules-decisions-files.md) 를 따른다. 본 문서는 포털 고유의 **BFF 프록시 인프라**와 **CSS 참조**만 둔다. 보안 공통 정책은 [Security-Guide.md](../Security/Security-Guide.md), 메뉴 역할 정책은 [Portal-Menu-Role-Policy.md](Portal-Menu-Role-Policy.md) 를 함께 본다.

## 1. BFF 프록시 인프라

UI → BFF → BE 호출 경로 컨벤션 자체는 frontend-standard/01 §2-2 가 정본이다. 여기서는 포털 BFF 가 그 컨벤션을 구현하는 방식만 정리한다.

### 1-1. createOasisProxyHandler

`@dk-oasis/shared/oasis-proxy` 의 `createOasisProxyHandler` 가 OASIS/REST 프록시를 단일 진입점에서 처리한다. 모듈 라우트(`m-mcm/app/api/[module]/oasis/[serviceId]/[action]/route.ts`)는 모듈 식별자만 넘긴다.

- `backendApiUrlByModule(module)` 이 모듈별 WAS URL(`MPN_WAS_URL`, `MPP_WAS_URL` 등, 없으면 `BACKEND_API_URL` 폴백)을 반환한다.
- OASIS 는 경로 그대로, REST 는 `rest/` 세그먼트만 제거해 BE 로 전달한다.
- module·serviceId·action 은 영문·숫자·밑줄(`^[A-Za-z0-9_]+$`)만 받고 아니면 400, 붙일 때 인코딩한다. 라우트는 디코드된 값을 받으므로 `search%2F..%2F..%2FnoticeMgmt%2Fsave` 같은 값이 BE 에서 다른 서비스가 되지 않게 한다(2026-10-03).
- proxy 는 `/api/` 경로에 인코딩된 `/`·`\`·`.`·`;`(대소문자·`%252F` 같은 이중 인코딩 포함)·날 `\`·`;`·점 조각 `.`·`..` 가 있으면 권한 판정 전에 400 을 준다(`lib/http/path-guard.ts`). `forwardToBackend` 도 BE 경로를 같은 함수로 본다. 화면 코드는 경로 조각에 이런 글자를 넣지 않는다 — 값은 본문이나 조회 문자열로 보낸다.

### 1-2. 인증 헤더 주입

BFF 는 NextAuth 세션을 검증한 뒤 BE 로 forward 할 때 다음 3종 헤더를 자동 주입한다(정본 구현: `shared/src/oasis-proxy`, REST는 `m-mcm/lib/http/be-proxy.ts`). 사용자 Bearer token은 forward하지 않는다.

- `X-Client-Key: ${BACKEND_CLIENT_KEY}`
- `X-Authenticated-User: <token.sub>`
- `X-Authenticated-Role: <token.roles.join(",")>` (원본 다중 역할, 없으면 단일 `token.role`)

세션 쿠키 이름은 NextAuth 와 같은 함수(`lib/auth/session-cookie.ts`)로 정한다 — `NEXTAUTH_URL` 이 https 면 `__Secure-` 쿠키만 읽는다. BE 로 넘기는 `X-Forwarded-For` 는 `TRUSTED_PROXY_HOPS`(기본 0 = 넘기지 않음)만큼 오른쪽에서 고른 주소 하나뿐이다(`lib/http/forwarded-for.ts`, Nginx 설정은 [배포 가이드 §4.3](../Operations/DMES-Deployment-Guide.md#43-운영계)).

시나리오 확정 REST POST는 BFF에서도 원본 역할 기준 `ADMIN|PLANNER`를 요구해 VIEWER를 403으로 선차단한다. 이 검사는 UX·방어 계층이며 최종 경계는 BE 서비스 method guard다.

### 1-3. 서버 코드의 OASIS 호출·내부 호출

- 서버 코드(Route Handler·server component·server action)가 사용자 대신 OASIS 를 부를 때는 자기 BFF 를 다시 부르지 않고 BE 를 바로 부른다(`m-mcm/lib/http/oasis-client.ts` — X-Client-Key + 세션에서 확인한 사용자로 `X-Authenticated-*`). 2026-10-03 까지는 자기 BFF 를 `X-Internal-Bff-Call: 1` + `X-Authenticated-*` 로 다시 불렀는데, BFF 가 그 헤더를 믿으면 브라우저가 붙인 같은 헤더도 믿게 되어 로그인하지 않은 사용자도 아무 사용자로 BE 를 부를 수 있었다.
- BFF 는 요청 헤더로 인증·권한 검사를 건너뛰지 않고, 요청 헤더의 사용자 정보(`X-Authenticated-*`)를 믿지 않는다(`lib/http/bff-auth.ts` 는 세션 쿠키만 본다). BE 로 넘기는 신뢰 헤더는 BFF 가 새로 만든다.
- 서버 간 호출이 BFF 로 들어오는 곳은 정확 경로 `/api/mcm/internal/cache/invalidate-role`(BE `RoleChangedEventListener` → 권한 캐시 무효화) 하나다. `/api/mcm/internal/` 아래 다른 경로는 404 다. proxy 와 라우트가 `X-Bff-Internal-Secret` 헤더를 BE → BFF 전용 비밀 `BFF_INTERNAL_SECRET` 과 시간 상수로 비교해 연다(`lib/http/internal-call.ts`). 이 비밀로 열리는 것은 캐시 비우기뿐이다.
- BFF → BE 마스터 비밀(`BACKEND_CLIENT_KEY`·`X-Client-Key`, BE 에서 아무 사용자로 인증된다)은 이 경로에서 받지 않는다 — BE 가 마스터 비밀을 BFF 쪽으로 보내지 않게 나눴다. BFF 는 비밀이 없거나 비면 늘 403, 운영(`NODE_ENV=production`)에서 저장소 로컬 값(`dmes-bff-internal-local-2026`)이거나 `BACKEND_CLIENT_KEY` 와 같으면 거절한다.
- BE 는 `mcm.bff.invalidate-role-url`(← `BFF_INVALIDATE_ROLE_URL`)·`mcm.bff.internal-secret`(← `BFF_INTERNAL_SECRET`) 이 둘 다 있을 때만 부른다. 코드 기본값은 없고, 없으면 부르지 않아 권한 변경은 BFF 캐시 TTL(5분)로 반영된다. 로컬은 `application-local.yml` 과 `m-mcm/.env.example` 이 같은 로컬 값을 갖는다(기존 로컬 `.env` 에는 `BFF_INTERNAL_SECRET` 줄을 더한다).

### 1-4. middleware 인증 전용 prefix

`m-mcm/proxy.ts` 의 `AUTH_ONLY_API_PREFIXES` 는 인증 검사만 하고 BFF 후속 처리는 하지 않는 prefix 목록이다(`/api/auth/`, `/api/{module}/oasis/`, `/api/{module}/rest/` 등). 폐기된 prefix(`api/backend` catch-all, 구 OASIS 그룹 라우트, `nooasis/`, `api/v1` 등)는 목록에 두지 않는다.

## 2. CSS 참조

### 2-1. import

root layout(`m-mcm/app/layout.tsx`)이 `@dk-oasis/shared/ui-provider` 의
`DmesUiProvider` 로 앱 전체를 **한 번만** 감싼다(`/portal`, `/popup/[...slug]`,
`/login` 모두 root layout 아래이므로 별도 Provider 가 필요 없다). Mantine 자체
CSS(`@mantine/core/styles.layer.css` 등)는 `m-mcm/app/globals.css` 에서
Tailwind 보다 먼저 로드되므로 포털 진입점에서 따로 import 하지 않는다.

포털 진입점(`m-mcm/app/portal/page.tsx`)에서는 shared 의 나머지 CSS 를
import 한다. 개별 페이지 컴포넌트에서 재import 할 필요는 없다.

```typescript
import "@dk-oasis/shared/portal-shell.css";  // 포털 프레임 (사이드바, 헤더, 탭바)
import "@dk-oasis/shared/grid.css";           // 그리드 (AG-Grid 커스텀, Mantine 테마 변수 연동)
import "@dk-oasis/shared/form.css";           // 폼 입력 필드 (Mantine 위 ERP 밀도 오버라이드)
import "@dk-oasis/shared/modal.css";          // 모달/다이얼로그
```

### 2-2. 주요 클래스

- 폼: `form-panel` / `form-panel-content` / `form-row` / `form-label`(`required`) / `form-value`, 입력 `form-input` `form-select` `form-textarea` `form-datepicker` `form-checkbox` `form-radio-group`, 버튼 `form-button`(`-primary`/`-danger`), 에러 `form-error` `form-error-message`.
- 페이지: `page-layout` / `page-layout__header` / `page-layout__title` / `page-layout__header-buttons`, 버튼 `btn` `btn-primary` `btn-save`.
- 빈 상태: `data-table-empty`.

### 2-3. 그리드 행 상태

`_rowState` 값에 따라 자동 적용된다.

| 행 상태 | CSS 클래스 | 배경 토큰 (값) |
|---|---|---|
| `added` / `copied` | `ag-row-inserted` | `--color-success-soft` (`#d8f0e0`) |
| `modified` | `ag-row-modified` | `--color-edited` (`#fef3c7`) |
| `deleted` | `ag-row-deleted` | `--color-danger-soft` (`#fdeaea`, 취소선) |
| 선택 행 | `ag-row-highlighted` | `--color-selection` (`#dbe8fb`) |

색 값의 정본은 `variables.css` 와 [UI 시각 표준](UI-Visual-Standard.md) §5·§7 이다. 선택 행은 배경 톤으로만 구분하고 왼쪽 컬러 바를 붙이지 않는다.

선택 + 상태 동시(예: `ag-row-inserted` + `ag-row-highlighted`)면 더 진한 배경이 적용된다.

### 2-4. CSS 변수

`page-layout` 에서 오버라이드 가능하다. 페이지별로 `<PageLayout className="my-page">` + `.page-layout.my-page { ... }` 로 재정의한다.

```css
.page-layout {
  --form-label-width: 100px;         /* 폼 라벨 너비 */
  --search-input-width: 150px;       /* 검색 입력 필드 너비 */
  --search-select-min-width: 100px;  /* 검색 셀렉트 최소 너비 */
}
```
