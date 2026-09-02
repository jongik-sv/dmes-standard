# dev-portal 설계서

> 작성일: 2026-04-06
> 목적: 모듈 개발자가 shared만 설치하여 독립적으로 업무 화면을 개발·테스트할 수 있도록, 경량 호스트 앱(dev-portal) 구조를 설계한다.
>
> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - cactus-core 본체에서 **AuthController 는 호출자 0 데드코드로 삭제**됨. portal 은 자체 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 를 사용한다.
> - **OasisController 매핑은 `/oasis` 로 고정**. `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지.
> - BFF 컨벤션: UI→BFF `/api/{module}/oasis/{serviceId}/{action}` 또는 `/api/{module}/nooasis/{path}`, BFF→BE 는 OASIS 그대로(`/oasis/{...}`), REST 는 `/api/{module}/nooasis/` segment 만 제거.
> - env: `BACKEND_CLIENT_KEY` 통일.

---

## 1. 배경

### 1.1 문제

| 문제 | 설명 |
|------|------|
| Next.js 호스트 앱 없음 | 모듈의 페이지 컴포넌트는 단독 실행 불가. Next.js App Router가 필요 |
| API 프록시 없음 | 모든 API 호출이 portal의 `/api/[...path]` BFF를 경유. 이것 없이는 백엔드 호출 불가 |
| 인증 세션 없음 | 로그인/세션 관리가 portal의 `lib/auth/config.ts`에 구현. 세션 없으면 API 401 |
| 포탈 쉘 없음 | 탭, 사이드바, 메뉴 등 PortalShell이 portal에서 마운트됨 |
| 메뉴 DB 없음 | `menu.db`가 portal에 존재 |

> **결론**: `@dk-oasis/shared`만 설치해서는 빌드까지만 가능하고, 실제 화면을 띄워 개발하는 것은 불가능

### 1.2 해결

**dev-portal**: portal에서 필수 기능만 추출한 경량 호스트 앱 템플릿.
모듈 개발자에게 같이 배포하여, 자기 모듈을 등록하고 실행할 수 있게 한다.

---

## 2. dev-portal vs portal 범위 비교

| 기능 | portal (운영) | dev-portal (개발) |
|------|:------------:|:----------------:|
| 로그인/로그아웃 | O | O |
| 포탈 쉘 (탭, 사이드바, 헤더) | O | O |
| API 프록시 (BFF) | O | O |
| 메뉴 DB (SQLite) | O | O (개발용 최소 메뉴) |
| 사용자 관리 화면 | O | X (불필요) |
| 접근 권한 관리 | O | X (불필요) |
| 다중 모듈 등록 | O | 단일 모듈 개발용 |
| 운영 배포 | O | X |
| OASIS 연동 테스트 페이지 | O | 선택 |

---

## 3. dev-portal 디렉토리 구조

```
dev-portal/
├── app/
│   ├── layout.tsx                     ← 루트 레이아웃 (CSS import)
│   ├── page.tsx                       ← 루트 → 로그인/포탈 분기
│   ├── login/
│   │   └── page.tsx                   ← 로그인 페이지
│   ├── portal/
│   │   ├── page.tsx                   ← PortalShell 마운트
│   │   ├── module-config.ts           ← 개발 모듈 등록 (개발자가 수정)
│   │   └── registered-modules.ts      ← 모듈 리졸버
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.ts           ← NextAuth 핸들러
│       ├── portal/
│       │   ├── menu/
│       │   │   └── route.ts           ← 메뉴 API (로컬 DB)
│       │   └── favorites/
│       │       └── route.ts           ← 즐겨찾기 API (로컬 DB)
│       └── v1/
│           └── [...path]/
│               └── route.ts           ← 백엔드 BFF 프록시
├── lib/
│   ├── auth/
│   │   └── config.ts                  ← NextAuth 설정
│   ├── http/
│   │   └── bff-auth.ts                ← BFF 인증 헬퍼
│   └── db/
│       └── prisma.ts                  ← 로컬 DB 연결
├── proxy.ts                           ← 미들웨어 (경로 보호)
├── menu.db                            ← 개발용 메뉴 DB (최소 구성)
├── package.json
├── next.config.ts
├── tsconfig.json
├── .env.example                       ← 환경변수 템플릿
├── .npmrc.example                     ← GitLab 레지스트리 설정 템플릿
└── README.md                          ← 사용법
```

---

## 4. 핵심 파일 설계

### 4.1 package.json

```jsonc
{
  "name": "@dk-oasis/dev-portal",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 5000 --turbopack",
    "build": "next build",
    "start": "next start --port 5000"
  },
  "dependencies": {
    "@dk-oasis/shared": "^0.1.0",
    "next": "^16.1.6",
    "next-auth": "^4.24.13",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "@prisma/adapter-better-sqlite3": "^7.5.0",
    "@prisma/client": "^7.5.0",
    "better-sqlite3": "^12.8.0",
    "dotenv": "^16.6.0"
  },
  "devDependencies": {
    "@types/node": "^20.19.37",
    "@types/react": "^19.2.14",
    "typescript": "^5.9.3"
  }
}
```

### 4.2 module-config.ts (개발자가 수정하는 파일)

```typescript
import type { PortalModuleConfigEntry } from "@dk-oasis/shared/portal-shell-core";
import { createSafePageLoader } from "@dk-oasis/shared/portal-shell-core";

// ────────────────────────────────────────
// 여기에 개발 중인 모듈을 등록하세요
// ────────────────────────────────────────
const modules: PortalModuleConfigEntry[] = [
  { moduleId: "dev-portal", packageName: "@dk-oasis/dev-portal" },
  // 예: { moduleId: "m-mes", packageName: "@dk-oasis/m-mes" },
];

// 모듈별 페이지 로더
const moduleLoaders: Record<string, (pageName: string) => Promise<any>> = {
  "dev-portal": (pageName) => import(`../page-components/${pageName}/page`),
  // 예: "m-mes": (pageName) => import(`@dk-oasis/m-mes/pages/${pageName}`),
};

export const loadConfiguredModulePage = createSafePageLoader(moduleLoaders);
export const portalTranspilePackages = modules.map((m) => m.packageName);
```

### 4.3 .env.example

```env
# ── 필수 ──
AUTH_SECRET=dev-secret-change-me-32chars-min!!
NEXTAUTH_URL=http://localhost:5000
DATABASE_URL=file:../menu.db

# ── 백엔드 연동 (없으면 API 호출 불가) ──
BACKEND_API_URL=http://localhost:8080
BACKEND_CLIENT_KEY=

# ── 선택 ──
AUTH_COOKIE_PREFIX=oasis-dev-auth
AUTH_BOOTSTRAP_ADMIN_ID=admin
AUTH_BOOTSTRAP_ADMIN_PASSWORD=admin
AUTH_BOOTSTRAP_ADMIN_NAME=관리자
AUTH_BOOTSTRAP_ADMIN_ROLE=sysadmin
```

### 4.4 개발용 메뉴 DB (menu.db)

최소 메뉴 구조. 개발자가 자기 모듈 화면을 여기에 추가한다.

```sql
-- 초기 메뉴 구조
INSERT INTO PortalMenu (id, parentId, displayText, type, moduleId, pageName, sortOrder, depth)
VALUES
  ('ROOT',    NULL,   '루트',       'folder', NULL,         NULL,                    0, 0),
  ('DEV',     'ROOT', '개발 모듈',   'folder', NULL,         NULL,                    1, 1),
  ('DEV-001', 'DEV',  '샘플 화면',   'page',   'dev-portal', 'sample/hello',          1, 2);
```

---

## 5. 모듈 개발자 사용 시나리오

### 5.1 초기 세팅

```bash
# 1. dev-portal 템플릿 클론
git clone https://gitlab.회사도메인.com/oasis/dev-portal.git
cd dev-portal

# 2. .npmrc 설정 (GitLab 레지스트리)
cp .npmrc.example .npmrc
# GITLAB_TOKEN 환경변수 설정

# 3. 환경변수 설정
cp .env.example .env
# BACKEND_API_URL 등 설정

# 4. 의존성 설치
pnpm install

# 5. 실행
pnpm dev
# → http://localhost:5000 에서 확인
```

### 5.2 자기 모듈 연결

```bash
# 1. 모듈 프로젝트 생성 (별도 디렉토리)
mkdir ../m-mes && cd ../m-mes
# package.json, tsup.config.ts 등 세팅 (새 모듈 세팅 가이드 참조)

# 2. dev-portal에서 로컬 모듈 링크
cd ../dev-portal
pnpm add ../m-mes --workspace   # 또는 npm link
```

### 5.3 모듈 등록

```typescript
// dev-portal/app/portal/module-config.ts
const modules = [
  { moduleId: "dev-portal", packageName: "@dk-oasis/dev-portal" },
  { moduleId: "m-mes", packageName: "@dk-oasis/m-mes" },  // ← 추가
];

const moduleLoaders = {
  "dev-portal": (pageName) => import(`../page-components/${pageName}/page`),
  "m-mes": (pageName) => import(`@dk-oasis/m-mes/pages/${pageName}`),  // ← 추가
};
```

### 5.4 메뉴에 화면 추가

menu.db에 새 메뉴 항목을 INSERT하거나, 개발용 시드 스크립트를 실행한다.

```sql
INSERT INTO PortalMenu (id, parentId, displayText, type, moduleId, pageName, sortOrder, depth)
VALUES ('MES-001', 'DEV', '작업지시', 'page', 'm-mes', 'production/work-order', 2, 2);
```

### 5.5 개발 흐름

```
pnpm dev (dev-portal)
  → http://localhost:5000 접속
    → admin/admin 로그인
      → 사이드바에서 "작업지시" 클릭
        → m-mes/pages/production/work-order-page.tsx 로딩
          → 화면 확인 & 개발
```

---

## 6. dev-portal 배포 방식

### 방식 A: Git 템플릿 레포 (권장)

```
GitLab: oasis/dev-portal (템플릿 레포)
  → 모듈 개발자가 fork 또는 clone
  → 자기 모듈 연결 후 개발
```

**장점**: 버전 관리, 업데이트 쉬움 (upstream merge)
**단점**: Git 관리 필요

### 방식 B: npm 패키지로 배포

```bash
npx @dk-oasis/create-module my-module
# → dev-portal + 모듈 스캐폴딩 자동 생성
```

**장점**: 원커맨드 셋업
**단점**: CLI 도구 개발/유지보수 필요

### 방식 C: 압축 파일 배포 (임시)

```
사내 공유 드라이브에 dev-portal.zip 배포
  → 다운로드 후 압축 해제
  → pnpm install & pnpm dev
```

**장점**: 즉시 가능
**단점**: 버전 관리 어려움

**권장**: 초기에는 **방식 A (Git 템플릿)** → 안정화 후 **방식 B (CLI)** 로 전환

---

## 7. dev-portal 업데이트 전략

shared가 버전업되면 dev-portal도 업데이트가 필요할 수 있다.

### 7.1 shared만 업데이트 (대부분의 경우)

```bash
cd dev-portal
pnpm update @dk-oasis/shared
# → 컴포넌트/유틸 변경만이면 dev-portal 수정 불필요
```

### 7.2 dev-portal 자체 업데이트 (Breaking Change)

shared의 인증 방식이나 PortalShell 인터페이스가 변경된 경우:

```bash
cd dev-portal
git remote add upstream https://gitlab.회사도메인.com/oasis/dev-portal.git
git fetch upstream
git merge upstream/main
# → 충돌 해결 후 사용
```

---

## 8. 제한사항 및 주의사항

| 항목 | 설명 |
|------|------|
| **백엔드 필수** | API 호출을 테스트하려면 백엔드 서버가 실행 중이어야 함 |
| **메뉴 DB 수동 관리** | 개발용 menu.db는 수동으로 메뉴를 추가해야 함. 운영 portal과 별도 |
| **사용자 관리 없음** | dev-portal에서는 bootstrap admin만 사용. 사용자 관리 UI 미포함 |
| **운영 배포 불가** | dev-portal은 개발 전용. 운영은 반드시 portal 사용 |
| **모듈 간 의존성** | 다른 모듈(m-aps 등)의 화면을 참조하려면 해당 모듈도 설치 필요 |

---

## 9. 향후 개선 방향

| 단계 | 내용 |
|------|------|
| **Phase 1** | dev-portal 템플릿 레포 구축 + shared GitLab 퍼블리시 |
| **Phase 2** | `npx @dk-oasis/create-module` CLI 도구 개발 |
| **Phase 3** | 백엔드 Mock 서버 제공 (백엔드 없이도 UI 개발 가능) |
| **Phase 4** | Storybook 연동 (컴포넌트 단위 개발/테스트) |
| **Phase 5** | 모듈별 E2E 테스트 환경 (Playwright + dev-portal) |
