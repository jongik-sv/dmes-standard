# Verdaccio Guide

> 2026-07-09에 공통 가이드 영역으로 이동했다. 이 문서는 APS 전용이 아니라 프라이빗 npm 레지스트리와 독립 업무 모듈 개발 공통 가이드다.

Verdaccio를 이용한 프라이빗 npm 레지스트리 구성 및 독립 업무 모듈 개발 가이드.

---

## 1. 개요

이 문서는 다음 시나리오를 다룬다.

- Verdaccio(프라이빗 npm 레지스트리)를 로컬에 구성한다.
- `@dk-oasis/shared` 패키지를 Verdaccio에 배포한다.
- 모노레포 **외부**에 독립 업무 모듈 프로젝트를 생성하고, Verdaccio에서 shared 패키지를 설치해 개발한다.

> **왜 필요한가?**
> 현재 모노레포(`pnpm workspace`)에서는 `workspace:*`로 shared를 참조하지만, 모듈 팀이 독립 저장소로 분리될 때는 npm 레지스트리를 통해 shared를 배포/설치해야 한다. Verdaccio는 이 과정을 로컬에서 검증할 수 있게 해준다.

---

## 2. 사전 요구 사항

| 항목 | 버전 | 비고 |
|------|------|------|
| Node.js | 20 이상 | `node -v`로 확인 |
| pnpm | 10 이상 | `pnpm -v`로 확인 |
| 본 프로젝트 | - | `dmes-standard` 클론 완료 상태 |

---

## 3. Verdaccio 설치

Verdaccio는 프로젝트 루트에 devDependency로 설치한다. 글로벌 설치하지 않는다.

```bash
cd dmes-standard
pnpm add -Dw verdaccio
```

설치 확인:

```bash
pnpm exec verdaccio --version
```

---

## 4. Verdaccio 실행

```bash
pnpm exec verdaccio --listen 4873
```

정상 실행 시 아래 로그가 출력된다.

```
info --- http address - http://localhost:4873/ - verdaccio/6.x.x
```

- 기본 포트: `4873`
- 웹 UI: 브라우저에서 `http://localhost:4873/` 접속 가능
- 설정 파일 위치: `C:\Users\<사용자>\.config\verdaccio\config.yaml`

> **팁**: 별도 터미널에서 실행해두고, 배포/설치 작업은 다른 터미널에서 진행한다.

---

## 5. Verdaccio 사용자 등록

패키지를 배포하려면 사용자 인증이 필요하다. API로 등록한다.

```bash
curl -s -XPUT \
  -H "Content-type: application/json" \
  -d '{"name":"test","password":"test123"}' \
  http://localhost:4873/-/user/org.couchdb.user:test
```

응답 예시:

```json
{
  "ok": "user 'test' created",
  "token": "MmU5MzM4YmUz..."
}
```

반환된 `token` 값을 복사해둔다. 이후 배포 시 인증에 사용된다.

---

## 6. shared 패키지를 Verdaccio에 배포

### 6-1. shared/package.json 수정

`"private": true`를 `"private": false`로 변경해야 npm publish가 가능하다.

```jsonc
// shared/package.json
{
  "name": "@dk-oasis/shared",
  "version": "0.1.0",
  "private": false,   // true → false
  ...
}
```

### 6-2. shared/.npmrc 생성

`shared/` 디렉토리에 `.npmrc` 파일을 만들고 Verdaccio 인증 정보를 설정한다.

```ini
registry=http://localhost:4873/
//localhost:4873/:_authToken="<5단계에서 받은 token>"
```

### 6-3. Prisma 클라이언트 생성

shared는 Prisma를 사용하므로, 빌드 전에 클라이언트를 생성해야 한다.

```bash
cd shared

# .env 파일이 없으면 생성
cp .env.example .env

# Prisma 클라이언트 생성 (PowerShell에서는 환경변수 설정 방식이 다름)
# bash / Git Bash:
DATABASE_URL="file:../menu.db" pnpm prisma generate

# PowerShell:
$env:DATABASE_URL="file:../menu.db"; pnpm prisma generate
```

성공 시 `shared/generated/prisma/` 디렉토리가 생성된다.

### 6-4. 빌드

```bash
pnpm build
```

성공 시 `shared/dist/` 디렉토리에 빌드 산출물이 생성된다.

### 6-5. 배포

```bash
npm publish --registry http://localhost:4873
```

성공 시 아래 메시지가 출력된다.

```
+ @dk-oasis/shared@0.1.0
```

`http://localhost:4873/` 웹 UI에서도 패키지를 확인할 수 있다.

### 6-6. 배포 후 원복

Verdaccio 배포 검증이 끝나면 shared의 변경사항을 원복한다.

```bash
# shared/package.json의 private을 다시 true로 변경
# shared/.npmrc 삭제 (토큰이 포함되어 있으므로 커밋하지 않는다)
```

---

## 7. 독립 업무 모듈 프로젝트 생성

모노레포 **외부**에 독립 프로젝트를 만든다.

### 7-1. 프로젝트 디렉토리 생성

```bash
mkdir m-sample
cd m-sample
```

### 7-2. .npmrc 설정

`@dk-oasis` 스코프의 패키지를 Verdaccio에서 가져오도록 설정한다.

```ini
# m-sample/.npmrc
@dk-oasis:registry=http://localhost:4873/
```

> 이 설정으로 `@dk-oasis/*` 패키지는 Verdaccio에서, 나머지는 공식 npm에서 설치된다.

### 7-3. package.json

```json
{
  "name": "@dk-oasis/m-sample",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./pages/*": {
      "types": "./dist/pages/*.d.ts",
      "import": "./dist/pages/*.js"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "dev:next": "next dev --port 5003",
    "format": "prettier --write .",
    "lint": "tsc --noEmit"
  },
  "pnpm": {
    "onlyBuiltDependencies": ["esbuild"]
  }
}
```

**exports 설명:**
- `"."`: 모듈의 엔트리 포인트 (`src/index.ts`)
- `"./pages/*"`: 페이지 컴포넌트를 portal에서 동적으로 import하기 위한 경로. [`DMES-Module-Package-Publishing-and-Consumption-Guide.md`](../Operations/DMES-Module-Package-Publishing-and-Consumption-Guide.md)의 페이지 파일 규칙을 따른다.

### 7-4. tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "pages"],
  "exclude": ["node_modules", "dist"]
}
```

### 7-5. tsup.config.ts

```typescript
import { defineConfig } from "tsup";

const external = [
  "react",
  "react-dom",
];

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
    },
    format: ["esm"],
    target: "es2022",
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    outDir: "dist",
    external,
    loader: {
      ".svg": "dataurl",
    },
  },
  {
    entry: ["pages/**/*-page.tsx"],
    format: ["esm"],
    target: "es2022",
    dts: true,
    sourcemap: true,
    clean: false,
    splitting: false,
    outDir: "dist/pages",
    external,
    loader: {
      ".svg": "dataurl",
    },
  },
]);
```

**tsup 설정 설명:**
- 두 개의 빌드 설정으로 구성된다.
  - 첫 번째: `src/index.ts`를 `dist/index.js`로 빌드 (모듈 엔트리)
  - 두 번째: `pages/**/*-page.tsx`를 `dist/pages/`로 빌드 (페이지 컴포넌트)
- `external`에 react, react-dom을 지정하여 번들에 포함하지 않는다 (portal이 제공).

### 7-6. 디렉토리 구조 생성

```bash
mkdir src pages
```

### 7-7. src/index.ts

```typescript
export {};
```

### 7-8. 의존성 설치

```bash
# @dk-oasis/shared는 Verdaccio에서, 나머지는 공식 npm에서 설치된다
pnpm add @dk-oasis/shared react react-dom
pnpm add -D @types/react @types/react-dom typescript tsup prettier
```

설치 완료 시 `@dk-oasis/shared 0.1.0`이 Verdaccio에서 정상 설치된 것을 확인할 수 있다.

---

## 8. 페이지 개발

### 8-1. 페이지 파일 규칙

| 규칙 | 설명 |
|------|------|
| 위치 | `pages/` 디렉토리 하위 |
| 파일명 | `<page-name>-page.tsx` |
| export | `export default function` (React 컴포넌트) |
| props | `@dk-oasis/shared/portal-shell-core`의 `PageProps` 타입 준수 |
| 지시자 | 파일 최상단에 `"use client"` 필수 |

### 8-2. 페이지 예제

```tsx
// pages/sample-dashboard-page.tsx
"use client";

import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

export default function SampleDashboardPage({ onSnapshotChange }: PageProps) {
  return (
    <div>
      <h2>m-sample Dashboard</h2>
      <p>독립 업무 모듈의 대시보드 페이지입니다.</p>
      <button
        type="button"
        onClick={() => {
          onSnapshotChange({
            module: "m-sample",
            page: "sample-dashboard",
            refreshedAt: new Date().toISOString(),
          });
        }}
      >
        스냅샷 저장
      </button>
    </div>
  );
}
```

**핵심 포인트:**
- `PageProps`는 `@dk-oasis/shared/portal-shell-core`에서 import한다. 이것이 portal과의 계약이다.
- `onSnapshotChange`를 통해 portal에 상태를 전달할 수 있다.
- 하위 디렉토리 구조도 가능하다. 예: `pages/order/order-list-page.tsx`

### 8-3. shared 패키지의 주요 import 경로

| import 경로 | 용도 |
|-------------|------|
| `@dk-oasis/shared` | 공통 유틸 (http, secure-storage, snapshot 등) |
| `@dk-oasis/shared/portal-shell-core` | PageProps 타입, 페이지 로더 유틸 |
| `@dk-oasis/shared/http` | HTTP 클라이언트 |
| `@dk-oasis/shared/secure-storage` | 암호화 스토리지 |
| `@dk-oasis/shared/snapshot` | 스냅샷 유틸 |

---

## 9. 빌드 및 검증

### 9-1. 빌드

```bash
pnpm build
```

성공 시 아래와 같은 산출물이 생성된다.

```
dist/
  index.js          # 모듈 엔트리
  index.d.ts        # 타입 선언
  pages/
    sample-dashboard-page.js      # 페이지 번들
    sample-dashboard-page.d.ts    # 페이지 타입 선언
```

### 9-2. 타입 검사

```bash
pnpm lint
```

### 9-3. 검증 체크리스트

- [ ] `pnpm build`가 에러 없이 완료되는가
- [ ] `pnpm lint`가 에러 없이 통과하는가
- [ ] `dist/pages/` 하위에 페이지 `.js`와 `.d.ts`가 모두 생성되었는가
- [ ] 페이지에서 `@dk-oasis/shared/portal-shell-core`의 `PageProps`를 정상 import하는가

---

## 10. 최종 디렉토리 구조

```
m-sample/
  .npmrc                  # @dk-oasis 스코프 → Verdaccio 지정
  package.json
  tsconfig.json
  tsup.config.ts
  src/
    index.ts              # 모듈 엔트리
  pages/
    sample-dashboard-page.tsx   # 페이지 컴포넌트
  dist/                   # (빌드 산출물, git 제외)
    index.js
    index.d.ts
    pages/
      sample-dashboard-page.js
      sample-dashboard-page.d.ts
```

---

## 11. 자주 발생하는 문제

### Prisma 관련 에러 (shared 빌드 시)

```
ERROR: Could not resolve "../../generated/prisma/client"
```

**원인**: Prisma 클라이언트가 생성되지 않았다.
**해결**: `shared/` 디렉토리에서 `DATABASE_URL="file:../menu.db" pnpm prisma generate` 실행.

### DATABASE_URL 환경 변수 에러

```
Error: DATABASE_URL 환경 변수가 필요합니다.
```

**원인**: `shared/.env` 파일이 없거나 환경변수가 설정되지 않았다.
**해결**:
- `shared/.env.example`을 `shared/.env`로 복사하거나
- PowerShell: `$env:DATABASE_URL="file:../menu.db"; pnpm prisma generate`
- bash: `DATABASE_URL="file:../menu.db" pnpm prisma generate`

### JWT_SESSION_ERROR (브라우저)

```
[next-auth][error][JWT_SESSION_ERROR] "decryption operation failed"
```

**원인**: 이전 세션 쿠키가 현재 AUTH_SECRET과 맞지 않는다.
**해결**: 브라우저 개발자 도구 → Application → Cookies → localhost 쿠키 삭제 후 새로고침.

### pnpm approve-builds 프롬프트

Verdaccio에서 설치한 패키지가 네이티브 빌드 스크립트를 포함할 수 있다. `package.json`에 아래를 추가하면 인터랙티브 프롬프트를 방지할 수 있다.

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["esbuild"]
  }
}
```

---

## 12. 로컬 환경 설정 (git 미추적 파일)

아래 파일들은 로컬 Verdaccio 환경에서만 필요하며 `.gitignore`에 등록되어 있다.
Verdaccio 테스트 시 수동으로 생성해야 한다.

### 12-1. 프로젝트 루트 `.npmrc`

`@dk-oasis` 스코프 패키지를 Verdaccio에서 가져오도록 설정한다.

```ini
# dmes-standard/.npmrc
@dk-oasis:registry=http://localhost:4873/
```

### 12-2. shared/.npmrc

shared 패키지를 Verdaccio에 배포할 때 필요하다. 인증 토큰을 포함하므로 절대 커밋하지 않는다.

```ini
# shared/.npmrc
registry=http://localhost:4873/
//localhost:4873/:_authToken="<Verdaccio 사용자 등록 시 받은 token>"
```

### 12-3. m-mcm/.npmrc

포털 호스트(`m-mcm`)에서 Verdaccio의 모듈 패키지를 설치할 때 필요하다.

```ini
# m-mcm/.npmrc
@dk-oasis:registry=http://localhost:4873/
```

### 12-4. shared/package.json `private` 변경

Verdaccio 배포 시 `"private": true`를 `"private": false`로 임시 변경해야 한다.
배포 후 반드시 `true`로 원복한다. (6-1, 6-6 참조)

### 12-5. m-mcm 모듈 등록

Verdaccio에 배포한 모듈을 포털 호스트(`m-mcm`)에서 테스트하려면 아래 작업이 필요하다.

1. `m-mcm/package.json`에 모듈 의존성 추가: `"@dk-oasis/m-sample": "0.1.0"`
2. `m-mcm/app/portal/module-config.ts`에 모듈 등록:
   ```typescript
   {
     moduleId: "m-sample",
     packageName: "@dk-oasis/m-sample",
     loadPage: createSafePageLoader((pageName) => import(`@dk-oasis/m-sample/pages/${pageName}-page`)),
   },
   ```
3. DB에 메뉴 데이터 추가 (3단계: 모듈 그룹 → 디렉토리 → 페이지)

> 이 변경사항은 로컬 테스트용이며 커밋하지 않는다. Verdaccio가 없는 환경에서 `pnpm install`이 실패하기 때문이다.

---

## 13. 참고 문서

- [DMES-Module-Package-Publishing-and-Consumption-Guide.md](../Operations/DMES-Module-Package-Publishing-and-Consumption-Guide.md) - 모듈 패키지 발행·버전 고정·소비 계약
- [RULE.md](../../../RULE.md) - 개발 규칙 및 핵심 계약
- [Security-Guide.md](../Security/Security-Guide.md) - 보안/인증 정책
- [Verdaccio 공식 문서](https://verdaccio.org/docs/what-is-verdaccio)
