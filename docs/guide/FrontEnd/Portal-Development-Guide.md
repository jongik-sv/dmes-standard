# Portal (m-mcm) 개발 가이드

포털은 `src/frontend/m-mcm` 이다(구 `src/frontend/portal` 은 폐기). 화면 구현 표준은 [FrontEnd 표준 v2](FrontEnd_표준_통합_개발가이드_v2.md), BFF URL 컨벤션(OASIS/REST/Phase 7) 정본은 [frontend-standard/01 §2-2](standard-v2/frontend-standard/01-rules-decisions-files.md) 를 따른다. 본 문서는 포털 고유의 **BFF 프록시 인프라**와 **CSS 참조**만 둔다. 보안 공통 정책은 [Security-Guide.md](../Security/Security-Guide.md), 메뉴 역할 정책은 [Portal-Menu-Role-Policy.md](Portal-Menu-Role-Policy.md) 를 함께 본다.

## 1. BFF 프록시 인프라

UI → BFF → BE 호출 경로 컨벤션 자체는 frontend-standard/01 §2-2 가 정본이다. 여기서는 포털 BFF 가 그 컨벤션을 구현하는 방식만 정리한다.

### 1-1. createOasisProxyHandler

`@dk-oasis/shared/oasis-proxy` 의 `createOasisProxyHandler` 가 OASIS/REST 프록시를 단일 진입점에서 처리한다. 모듈 라우트(`m-mcm/app/api/[module]/oasis/[serviceId]/[action]/route.ts`)는 모듈 식별자만 넘긴다.

- `backendApiUrlByModule(module)` 이 모듈별 WAS URL(`MPN_WAS_URL`, `MPP_WAS_URL` 등, 없으면 `BACKEND_API_URL` 폴백)을 반환한다.
- OASIS 는 경로 그대로, REST 는 `rest/` 세그먼트만 제거해 BE 로 전달한다.

### 1-2. 인증 헤더 주입

BFF 는 NextAuth 세션을 검증한 뒤 BE 로 forward 할 때 다음 3종 헤더를 자동 주입한다(정본 구현: `shared/src/oasis-proxy`, REST는 `m-mcm/lib/http/be-proxy.ts`). 사용자 Bearer token은 forward하지 않는다.

- `X-Client-Key: ${BACKEND_CLIENT_KEY}`
- `X-Authenticated-User: <token.sub>`
- `X-Authenticated-Role: <token.roles.join(",")>` (원본 다중 역할, 없으면 단일 `token.role`)

시나리오 확정 REST POST는 BFF에서도 원본 역할 기준 `ADMIN|PLANNER`를 요구해 VIEWER를 403으로 선차단한다. 이 검사는 UX·방어 계층이며 최종 경계는 BE 서비스 method guard다.

### 1-3. 포털 자기참조 호출

포털이 자체 OASIS 자원(메뉴·즐겨찾기 등)을 호출할 때는 BE 를 직접 부르지 않고 자기 BFF 를 재호출한다(`m-mcm/lib/http/oasis-client.ts`). middleware 무한 루프를 막기 위해 내부 호출에는 `X-Internal-Bff-Call: 1` 헤더를 부착하고, middleware 는 이 헤더가 있을 때 인증/리다이렉트를 bypass 한다. 외부(브라우저) 호출에는 부착하지 않으며 부착돼 들어와도 거부한다. 권한관리 repository 도 모두 이 자기 BFF 패턴을 쓰고 BE 직접 호출은 금지한다.

### 1-4. middleware 인증 전용 prefix

`m-mcm/proxy.ts` 의 `AUTH_ONLY_API_PREFIXES` 는 인증 검사만 하고 BFF 후속 처리는 하지 않는 prefix 목록이다(`/api/auth/`, `/api/{module}/oasis/`, `/api/{module}/rest/` 등). 폐기된 prefix(`api/backend` catch-all, 구 OASIS 그룹 라우트, `nooasis/`, `api/v1` 등)는 목록에 두지 않는다.

## 2. CSS 참조

### 2-1. import

포털 진입점(`m-mcm/app/portal/page.tsx`)에서 shared CSS 를 import 한다. 개별 페이지 컴포넌트에서 재import 할 필요는 없다.

```typescript
import "@dk-oasis/shared/portal-shell.css";  // 포털 프레임 (사이드바, 헤더, 탭바)
import "@dk-oasis/shared/grid.css";           // 그리드 (AG-Grid 커스텀)
import "@dk-oasis/shared/form.css";           // 폼 입력 필드
import "@dk-oasis/shared/modal.css";          // 모달/다이얼로그
```

### 2-2. 주요 클래스

- 폼: `form-panel` / `form-panel-content` / `form-row` / `form-label`(`required`) / `form-value`, 입력 `form-input` `form-select` `form-textarea` `form-datepicker` `form-checkbox` `form-radio-group`, 버튼 `form-button`(`-primary`/`-danger`), 에러 `form-error` `form-error-message`.
- 페이지: `page-layout` / `page-layout__header` / `page-layout__title` / `page-layout__header-buttons`, 버튼 `btn` `btn-primary` `btn-save`.
- 빈 상태: `data-table-empty`.

### 2-3. 그리드 행 상태

`_rowState` 값에 따라 자동 적용된다.

| 행 상태 | CSS 클래스 | 배경색 |
|---|---|---|
| `added` / `copied` | `ag-row-inserted` | 연두 `#e8f5e9` |
| `modified` | `ag-row-modified` | 노랑 `#fff8e1` |
| `deleted` | `ag-row-deleted` | 빨강 `#ffebee` (취소선) |
| 선택 행 | `ag-row-highlighted` | 파랑 `#e3f2fd` |

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
