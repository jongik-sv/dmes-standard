# 93. shared 배포 및 신규 모듈 가이드 (참고)

> 통합 원본: `개발플랜/shared-deployment-strategy.md` (322줄), `개발플랜/new-module-setup-guide.md` (739줄)
> 성격: **참고**. shared 패키지의 사내 npm 배포 전략 + 신규 m-xxx 모듈 셋업 절차.

---

## 1. shared 배포 — GitLab Package Registry

### 1.1 배포 대상
`@dk-oasis/shared` (Next.js 호환 ESM + DTS 포함)

### 1.2 인프라
| 항목 | 설정 |
|---|---|
| Registry | GitLab Package Registry (사내 GitLab) |
| 버전 관리 | Semver (1.x.y) |
| 인증 | `.npmrc` 의 `_authToken` 또는 CI 변수 |

### 1.3 .npmrc (consumer 측)
```
@dk-oasis:registry=https://gitlab.internal/api/v4/projects/{projectId}/packages/npm/
//gitlab.internal/api/v4/projects/{projectId}/packages/npm/:_authToken=${GITLAB_TOKEN}
```

### 1.4 CI/CD 자동 배포 (GitLab CI 예시)
```yaml
publish-shared:
  stage: deploy
  script:
    - cd src/frontend/shared
    - pnpm build
    - pnpm publish --access internal --no-git-checks
  only:
    - tags
```

### 1.5 버전 정책
- **major (x.0.0)**: API breaking change
- **minor (1.x.0)**: 기능 추가
- **patch (1.0.x)**: 버그 수정
- 배포 후 모든 m-xxx 의 dependency 갱신 필요

---

## 2. 신규 m-xxx 모듈 셋업 — 9단계 체크리스트

### Step 1. 디렉토리 생성
```
src/frontend/m-xxx/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts
│   └── {feature}/
│       ├── api.ts
│       └── types.ts
└── pages/
    └── {feature}-page.tsx
```

### Step 2. package.json
```json
{
  "name": "@dk-oasis/m-xxx",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./pages/*": "./dist/pages/*.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  },
  "dependencies": {
    "@dk-oasis/shared": "workspace:*"
  },
  "peerDependencies": {
    "react": "^19", "next": "^16"
  }
}
```

### Step 3. tsup.config.ts
```typescript
import { defineConfig } from "tsup";

export default defineConfig([
  { entry: { index: "src/index.ts" }, format: ["esm"], dts: true, clean: false },
  { entry: { "pages/xxx-page": "pages/xxx-page.tsx" }, format: ["esm"], dts: true, clean: false, external: ["react", "next"] },
]);
```

> **주의**: `clean: false` 필수 (portal dev 서버가 dist/ 를 watch 하므로 빌드 중 dist 가 비면 무한 루프 발생).

### Step 4. tsconfig.json
shared 의 tsconfig 상속 (jsx, target, moduleResolution 등 일치)

### Step 5. types.ts (도메인 타입)
```typescript
export interface XxxItem { id: string; name: string; ... }
export interface XxxFilter { ... }
```

### Step 6. api.ts (BFF 호출)
```typescript
import { apiRequest } from "@dk-oasis/shared/http";

export async function fetchXxxList(filter: XxxFilter) {
  const res = await apiRequest("/api/xxx/oasis/xxxService/search", {
    method: "POST",
    body: JSON.stringify({ meta: {...}, params: filter }),
  });
  return res.grids?.items?.rows ?? [];
}
```

> Phase 7 BFF 컨벤션은 `frontend/CLAUDE.md` 참고. `apiQuery`, `apiService`, `apiLovMaster` 등 헬퍼 권장.

### Step 7. {feature}-page.tsx (페이지 컴포넌트)
```tsx
"use client";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { useGfnMessage } from "@dk-oasis/shared/message-provider";
import { PageLayout, SearchArea, ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import { GridPanel, AgDataGrid } from "@dk-oasis/shared/grid";

export default function XxxPage({ onSnapshotChange }: PageProps) {
    // ...
}
```

### Step 8. portal 등록
`portal/app/portal/module-config.ts`, `registered-modules.ts` 에 동적 로딩 등록:
```typescript
"m-xxx": () => import("@dk-oasis/m-xxx/pages/xxx-page"),
```

### Step 9. portal/page-components/{module}/{feature}/page.tsx 재수출
```tsx
export { default } from "@dk-oasis/m-xxx/pages/xxx-page";
```

### 추가: 메뉴 DB 등록
`portal/seed-{module}-menu.mjs` 에 메뉴 항목 추가 후 시드.

---

## 3. BE 측 모듈 셋업 (요약)

신규 백엔드 모듈 추가 시:
```
src/backend/{module}/
├── api/                # bootJar 가능한 Spring Boot
│   ├── build.gradle
│   └── src/main/...
└── core/               # 비즈니스 로직, JPA 엔티티
    ├── build.gradle
    └── src/main/...
```

`build.gradle` 의존성:
```groovy
api 'com.dongkuk:cactus-core:1.0.x-SNAPSHOT'
```

`application.yml`:
```yaml
spring:
  application:
    name: {module}
cactus:
  oasis:
    service-group: {module}
    service-path: classpath:/services/
```

BPMN 파일은 `src/main/resources/services/{serviceId}/{serviceId}.bpmn`.

---

## 4. 빌드/배포 순서

1. **BE 빌드**: `cd src/backend && ./gradlew :{module}:api:build`
2. **shared 빌드** (변경 시): `cd src/frontend/shared && pnpm build`
3. **m-xxx 빌드**: `cd src/frontend/m-xxx && pnpm build`
4. **portal 개발 서버**: `cd src/frontend/portal && pnpm dev` (자동 reload)
5. **portal 빌드** (배포 시): `pnpm build`

---

## 5. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| Module not found 무한 루프 | dist/ 삭제됨 또는 clean: true | dist 복구 + clean: false 유지 + portal dev 재시작 |
| BFF 에서 401 | NextAuth 세션 만료 | 재로그인 |
| BPMN 라우팅 실패 | `cactus.oasis.service-group` 미설정 | application.yml 확인 |
| FE 빌드 OK, 런타임 에러 | shared 버전 mismatch | `pnpm install` 재실행 |

---

## 6. 관련 정리본

- 92 shared 와 portal 역할 분담
- 94 dev-portal 설계
- 03 OasisController 통합 레이어 (BPMN 매핑)
- 07 URL 구조 (serviceGroup)
