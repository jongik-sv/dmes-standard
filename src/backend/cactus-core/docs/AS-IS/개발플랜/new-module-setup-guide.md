# 새 모듈 세팅 가이드

> 작성일: 2026-04-06
> 목적: 모듈 개발자가 `@dk-oasis/shared`를 활용하여 새로운 업무 모듈을 생성하고, dev-portal에 연결하여 개발하기까지의 전체 절차를 안내한다.
>
> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - cactus-core 본체에서 **AuthController 는 호출자 0 데드코드로 삭제**됨. portal 은 자체 PortalAuthController(`com.dongkuk.dmes.mcm.*`) 를 사용한다.
> - 신규 표준 필터 ClientKeyFilter / RequestIdFilter, 신규 AutoConfiguration CactusAuthAutoConfiguration / CactusWebSecurityAutoConfiguration.
> - **OasisController 매핑은 `/oasis` 로 고정**. `cactus.oasis.service-group` 프로퍼티는 BPMN 라우팅/로깅 식별 용도로만 유지.
> - BFF 컨벤션: UI→BFF `/api/{module}/oasis/{serviceId}/{action}` 또는 `/api/{module}/nooasis/{path}`, BFF→BE 는 OASIS 그대로(`/oasis/{...}`), REST 는 `/api/{module}/nooasis/` segment 만 제거.
> - env: `BACKEND_CLIENT_KEY` 통일.
> - {CLIENT} 사이트 코드 패키지 컨벤션: `com.dongkuk.dmes.{aps|mpp|mqc|portal}.*`.

---

## 1. 개요

### 1.1 모듈이란?

```
portal (호스트 앱)
├── @dk-oasis/shared     ← 공통 프레임워크
├── @dk-oasis/m-aps      ← APS 업무 모듈 ★
├── @dk-oasis/m-mes      ← MES 업무 모듈 ★  (새로 만들 모듈)
└── @dk-oasis/m-xxx      ← 기타 모듈 ★
```

모듈은 shared의 UI 컴포넌트와 레이아웃을 사용하여 **업무 화면(페이지 컴포넌트)** 을 구현한 npm 패키지이다.
portal에 등록하면 포탈 쉘의 탭으로 동적 로딩된다.

### 1.2 모듈의 구성 요소

```
m-xxx/
├── src/               ← 비즈니스 로직 (타입, API, 상수, 폼 컴포넌트)
├── pages/             ← 페이지 엔트리 (portal에서 import하는 진입점)
├── dist/              ← 빌드 결과물 (tsup으로 생성)
├── package.json       ← 패키지 설정 + exports
├── tsup.config.ts     ← 빌드 설정
└── tsconfig.json      ← TypeScript 설정
```

---

## 2. 사전 준비

### 2.1 필수 도구

| 도구 | 버전 | 설치 |
|------|------|------|
| Node.js | 22+ | https://nodejs.org |
| pnpm | 9+ | `corepack enable && corepack prepare pnpm@latest --activate` |
| Git | 최신 | https://git-scm.com |

### 2.2 GitLab 토큰

shared 패키지를 설치하려면 GitLab Personal Access Token이 필요하다.

1. GitLab > User Settings > Access Tokens
2. 이름: `npm-install` (자유)
3. 스코프: `read_api` (설치만 할 경우)
4. 생성 후 토큰 값 복사

### 2.3 환경변수 등록

```bash
# ~/.bashrc 또는 ~/.zshrc 에 추가
export GITLAB_TOKEN="glpat-xxxxxxxxxxxx"
```

---

## 3. 단계별 세팅 절차

### Step 1: 프로젝트 디렉토리 생성

```bash
mkdir m-mes
cd m-mes
git init
```

### Step 2: .npmrc 생성 (GitLab 레지스트리 연결)

```ini
# .npmrc
@dk-oasis:registry=https://gitlab.회사도메인.com/api/v4/projects/{프로젝트ID}/packages/npm/
//gitlab.회사도메인.com/api/v4/projects/{프로젝트ID}/packages/npm/:_authToken=${GITLAB_TOKEN}
```

> `{프로젝트ID}`는 shared가 퍼블리시된 GitLab 프로젝트의 ID

### Step 3: package.json 생성

```jsonc
{
  "name": "@dk-oasis/m-mes",
  "version": "0.1.0",
  "private": false,
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
    },
    "./pages/*.css": "./dist/pages/*.css"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "lint": "tsc --noEmit",
    "format": "prettier --write ."
  },
  "dependencies": {
    "@dk-oasis/shared": "^0.1.0",
    "next": "^16.1.6",
    "react": "^19.2.4",
    "react-dom": "^19.2.4"
  },
  "devDependencies": {
    "@types/node": "^20.19.37",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "ag-grid-community": "^33.0.0",
    "ag-grid-react": "^33.0.0",
    "prettier": "^3.8.1",
    "tsup": "^8.5.1",
    "typescript": "^5.9.3"
  }
}
```

### Step 4: tsconfig.json 생성

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
    },
    "noEmit": true,
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo",
    "plugins": [{ "name": "next" }]
  },
  "include": ["src", "pages"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 5: tsup.config.ts 생성

```typescript
import { defineConfig } from "tsup";

const external = [
  "react",
  "react-dom",
  "next",
  "next/navigation",
  "next-auth",
  "next-auth/react",
  "@dk-oasis/shared",
  /^@dk-oasis\/shared\/.*/,
];

export default defineConfig([
  // 1. 공통 엔트리 (index)
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    target: "es2022",
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    outDir: "dist",
    external,
    loader: { ".svg": "dataurl" },
  },
  // 2. 페이지 엔트리 (개발하면서 추가)
  {
    entry: {
      // ── 여기에 페이지를 추가 ──
      "pages/production/work-order-page": "pages/production/work-order-page.tsx",
      // "pages/production/work-result-page": "pages/production/work-result-page.tsx",
    },
    format: ["esm"],
    target: "es2022",
    dts: true,
    sourcemap: true,
    clean: false,    // ← 첫 번째 빌드의 dist를 유지
    splitting: false,
    outDir: "dist",
    external,
    loader: { ".svg": "dataurl" },
  },
]);
```

### Step 6: 디렉토리 구조 생성

```bash
mkdir -p src/production/work-order
mkdir -p pages/production
touch src/index.ts
```

### Step 7: 기본 파일 작성

**src/index.ts**:
```typescript
export {};
```

**src/production/work-order/types.ts**:
```typescript
// 백엔드 Response 매핑 타입
export interface WorkOrder {
  id: number;
  orderNo: string;
  productName: string;
  quantity: number;
  status: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

// Request 타입
export interface WorkOrderCreateRequest {
  orderNo: string;
  productName: string;
  quantity: number;
  dueDate: string;
}

export interface WorkOrderUpdateRequest extends WorkOrderCreateRequest {
  id: number;
}

// Filter 타입
export interface WorkOrderFilter {
  orderNo?: string;
  status?: string;
}
```

**src/production/work-order/constants.ts**:
```typescript
import type { GridColumn } from "@dk-oasis/shared/grid";

export const WORK_ORDER_STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: "PLANNED", label: "계획" },
  { value: "IN_PROGRESS", label: "진행중" },
  { value: "COMPLETED", label: "완료" },
  { value: "CANCELLED", label: "취소" },
];

export const WORK_ORDER_STATUS_LABEL: Record<string, string> = {
  PLANNED: "계획",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

export const WORK_ORDER_COLUMNS: GridColumn[] = [
  { field: "orderNo", headerName: "작업지시번호", width: 150 },
  { field: "productName", headerName: "제품명", width: 200, flex: 1 },
  { field: "quantity", headerName: "수량", width: 100, type: "number" },
  { field: "statusLabel", headerName: "상태", width: 100 },
  { field: "dueDate", headerName: "납기일", width: 120 },
];
```

**src/production/work-order/work-order-api.ts**:
```typescript
import type { WorkOrder, WorkOrderCreateRequest, WorkOrderUpdateRequest, WorkOrderFilter } from "./types";

// 공통 request 함수 (shared에서 제공하는 패턴)
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `요청 실패 (${res.status})`);
  }
  return res.json();
}

// ── API 함수 ──

export async function fetchWorkOrderList(filter?: WorkOrderFilter): Promise<WorkOrder[]> {
  const params = new URLSearchParams();
  if (filter?.orderNo) params.set("orderNo", filter.orderNo);
  if (filter?.status) params.set("status", filter.status);
  const query = params.toString();
  const res = await request<{ data: WorkOrder[] }>(`/api/work-orders${query ? `?${query}` : ""}`);
  return res.data;
}

export async function fetchWorkOrderDetail(id: number): Promise<WorkOrder> {
  const res = await request<{ data: WorkOrder }>(`/api/work-orders/${id}`);
  return res.data;
}

export async function createWorkOrder(data: WorkOrderCreateRequest): Promise<WorkOrder> {
  const res = await request<{ data: WorkOrder }>("/api/work-orders", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function updateWorkOrder(id: number, data: WorkOrderUpdateRequest): Promise<WorkOrder> {
  const res = await request<{ data: WorkOrder }>(`/api/work-orders/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function deleteWorkOrder(id: number): Promise<void> {
  await request(`/api/work-orders/${id}`, { method: "DELETE" });
}
```

**pages/production/work-order-page.tsx**:
```typescript
"use client";

import { useState, useCallback, useEffect } from "react";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { useGfnMessage } from "@dk-oasis/shared/message-provider";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
} from "@dk-oasis/shared/layout";
import { Input, Select, Button } from "@dk-oasis/shared/form";
import {
  AgDataGrid,
  type GridColumn,
} from "@dk-oasis/shared/grid";

import type { WorkOrder, WorkOrderFilter } from "../../src/production/work-order/types";
import {
  WORK_ORDER_STATUS_OPTIONS,
  WORK_ORDER_STATUS_LABEL,
  WORK_ORDER_COLUMNS,
} from "../../src/production/work-order/constants";
import { fetchWorkOrderList } from "../../src/production/work-order/work-order-api";

export default function WorkOrderPage({ tabId }: PageProps) {
  const gfn_message = useGfnMessage();
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [filter, setFilter] = useState<WorkOrderFilter>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // 목록 조회
  const handleSearch = useCallback(async () => {
    try {
      const data = await fetchWorkOrderList(filter);
      setRows(data);
    } catch (err) {
      gfn_message(
        err instanceof Error ? err.message : "조회 실패",
        "", "", "error"
      );
    }
  }, [filter, gfn_message]);

  // 초기 로딩
  useEffect(() => {
    handleSearch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 그리드 데이터 변환
  const gridData = rows.map((row) => ({
    ...row,
    statusLabel: WORK_ORDER_STATUS_LABEL[row.status] ?? row.status,
  }));

  return (
    <PageLayout
      title="작업지시 관리"
      buttons={[
        { label: "조회", onClick: handleSearch },
      ]}
    >
      <SearchArea>
        <SearchField label="작업지시번호">
          <Input
            value={filter.orderNo ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, orderNo: e.target.value }))}
          />
        </SearchField>
        <SearchField label="상태">
          <Select
            value={filter.status ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
            options={WORK_ORDER_STATUS_OPTIONS}
          />
        </SearchField>
      </SearchArea>

      <ContentBody>
        <ContentPanel title="작업지시 목록">
          <AgDataGrid
            columns={WORK_ORDER_COLUMNS}
            rows={gridData}
            getRowId={(row) => String(row.id)}
            onRowClick={(row) => setSelectedId(row.id)}
            selectedRowId={selectedId ? String(selectedId) : undefined}
          />
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
```

### Step 8: .gitignore 생성

```gitignore
node_modules/
dist/
.next/
.tsbuildinfo
.npmrc
.env
```

### Step 9: 의존성 설치 & 빌드

```bash
# shared가 GitLab에서 설치됨
pnpm install

# 빌드 확인
pnpm build
```

---

## 4. dev-portal 연결 (화면 테스트)

### Step 1: dev-portal 클론 & 설치

```bash
# 별도 디렉토리에 dev-portal 클론
cd ..
git clone https://gitlab.회사도메인.com/oasis/dev-portal.git
cd dev-portal
cp .env.example .env
# .env 설정 (BACKEND_API_URL 등)
pnpm install
```

### Step 2: 모듈 링크

```bash
# dev-portal에서 로컬 모듈 참조
pnpm add ../m-mes
```

### Step 3: module-config.ts에 모듈 등록

```typescript
// dev-portal/app/portal/module-config.ts

const modules = [
  { moduleId: "dev-portal", packageName: "@dk-oasis/dev-portal" },
  { moduleId: "m-mes", packageName: "@dk-oasis/m-mes" },      // ← 추가
];

const moduleLoaders = {
  "dev-portal": (pageName) => import(`../page-components/${pageName}/page`),
  "m-mes": (pageName) => import(`@dk-oasis/m-mes/pages/${pageName}`),  // ← 추가
};
```

### Step 4: next.config.ts에 transpile 추가

```typescript
// dev-portal/next.config.ts
// portalTranspilePackages에 자동으로 포함됨 (module-config.ts에서 export)
```

### Step 5: 메뉴에 화면 추가

dev-portal의 menu.db에 INSERT:

```sql
INSERT INTO PortalMenu (id, parentId, displayText, type, moduleId, pageName, sortOrder, depth)
VALUES ('MES-WO', 'DEV', '작업지시', 'page', 'm-mes', 'production/work-order', 1, 2);
```

### Step 6: 실행 & 확인

```bash
cd dev-portal
pnpm dev
# → http://localhost:5000 → 로그인 → 사이드바에서 "작업지시" 클릭
```

---

## 5. 페이지 추가 절차 (반복)

새 화면을 추가할 때마다 아래를 반복한다:

### 5.1 소스 파일 추가

```
src/production/work-result/
├── types.ts
├── constants.ts
├── work-result-api.ts
└── WorkResultForm.tsx     (필요 시)
```

### 5.2 페이지 엔트리 추가

```
pages/production/work-result-page.tsx
```

### 5.3 tsup.config.ts에 엔트리 추가

```typescript
entry: {
  "pages/production/work-order-page": "pages/production/work-order-page.tsx",
  "pages/production/work-result-page": "pages/production/work-result-page.tsx",  // ← 추가
},
```

### 5.4 package.json exports 확인

와일드카드 `./pages/*`로 이미 커버되므로 추가 불필요.
단, 하위 depth가 3단계 이상이면 별도 export 추가:

```jsonc
"./pages/production/sub/*": {
  "types": "./dist/pages/production/sub/*.d.ts",
  "import": "./dist/pages/production/sub/*.js"
}
```

### 5.5 메뉴 DB에 등록

```sql
INSERT INTO PortalMenu (id, parentId, displayText, type, moduleId, pageName, sortOrder, depth)
VALUES ('MES-WR', 'DEV', '작업실적', 'page', 'm-mes', 'production/work-result', 2, 2);
```

### 5.6 빌드 & 확인

```bash
cd m-mes && pnpm build
cd ../dev-portal && pnpm dev
```

---

## 6. 프론트엔드 개발 패턴 참고

### 6.1 파일별 역할

| 파일 | 역할 | 참고 |
|------|------|------|
| `types.ts` | 백엔드 Response/Request/Filter 타입 정의 | 백엔드 API 스펙 기준 |
| `constants.ts` | 옵션 배열, 라벨 맵, 그리드 컬럼 정의 | UI 표시용 상수 |
| `{feature}-api.ts` | API 클라이언트. `/api/...` 호출 | BFF 프록시 경유 |
| `{Feature}Form.tsx` | 상세 폼 컴포넌트 | `memo()` 감싸기, onChange 콜백 |
| `{feature}-page.tsx` | 페이지 엔트리. 상태관리 + 그리드 + 폼 조합 | `"use client"` 필수 |

### 6.2 API 함수 네이밍 규칙

| 접두사 | 용도 | HTTP Method |
|--------|------|-------------|
| `fetch{Entity}List` | 목록 조회 | GET |
| `fetch{Entity}Detail` | 상세 조회 | GET |
| `create{Entity}` | 생성 | POST |
| `update{Entity}` | 수정 | PUT |
| `delete{Entity}` | 삭제 | DELETE |
| `change{Entity}Status` | 상태 변경 | PATCH |

### 6.3 shared에서 자주 사용하는 import

```typescript
// 페이지 타입
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

// 메시지
import { useGfnMessage } from "@dk-oasis/shared/message-provider";

// 레이아웃
import { PageLayout, SearchArea, SearchField, ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

// 폼
import { Button, Input, Select, ComboBox, DatePicker, Checkbox } from "@dk-oasis/shared/form";

// 그리드
import { AgDataGrid, GridPanel, useGridDataManager, useRowStateManager } from "@dk-oasis/shared/grid";
import type { GridColumn, RowStateItem } from "@dk-oasis/shared/grid";

// 트리
import { Tree } from "@dk-oasis/shared/tree";

// 모달
import { Modal } from "@dk-oasis/shared/modal";

// 유틸리티
import { gfn_isNull, gfn_today, gfn_toString } from "@dk-oasis/shared/utils";
```

### 6.4 주의사항

| 규칙 | 설명 |
|------|------|
| `"use client"` 필수 | 페이지 컴포넌트 최상단에 반드시 선언 |
| `new Date()` 모듈 상수 금지 | Hydration 오류 발생. 함수 내부에서만 사용 |
| 에러 메시지 | `gfn_message("메시지", "", "", "error")` 사용. alert/console.error 금지 |
| API 경로 | `/api/...` 상대경로. 절대 URL 사용 금지 |
| PageProps 인터페이스 | `{ tabId, snapshot, onSnapshotChange }` 준수 |

---

## 7. 운영 portal 등록 (개발 완료 후)

모듈 개발이 완료되면 운영 portal에 등록한다.

### 7.1 모듈 퍼블리시

```bash
cd m-mes
npm version 1.0.0
pnpm build
npm publish
```

### 7.2 portal에 모듈 추가

```bash
# portal 프로젝트에서
pnpm add @dk-oasis/m-mes
```

### 7.3 module-config.ts 등록

```typescript
// portal/app/portal/module-config.ts
const modules = [
  { moduleId: "portal", packageName: "@dk-oasis/portal" },
  { moduleId: "m-mes", packageName: "@dk-oasis/m-mes" },  // ← 추가
];
```

### 7.4 메뉴 DB에 화면 등록

운영 menu.db에 메뉴 항목 INSERT

### 7.5 portal 빌드 & 배포

```bash
cd portal
pnpm build
# → 배포
```

---

## 8. 체크리스트

### 초기 세팅

- [ ] .npmrc 설정 (GitLab 레지스트리)
- [ ] GITLAB_TOKEN 환경변수 등록
- [ ] package.json 작성
- [ ] tsconfig.json 작성
- [ ] tsup.config.ts 작성
- [ ] src/index.ts 생성
- [ ] `pnpm install` 성공
- [ ] `pnpm build` 성공

### 페이지 개발

- [ ] types.ts 작성 (백엔드 API 스펙 기준)
- [ ] constants.ts 작성 (그리드 컬럼, 옵션, 라벨)
- [ ] {feature}-api.ts 작성 (`/api/...` 경로)
- [ ] {feature}-page.tsx 작성 (`"use client"`, PageProps)
- [ ] tsup.config.ts에 페이지 엔트리 추가
- [ ] `pnpm build` 성공

### dev-portal 연결

- [ ] dev-portal 클론 & 설치
- [ ] 모듈 링크 (`pnpm add ../m-mes`)
- [ ] module-config.ts에 모듈 등록
- [ ] menu.db에 메뉴 추가
- [ ] `pnpm dev` → 화면 확인

### 운영 등록

- [ ] 모듈 GitLab Package Registry 퍼블리시
- [ ] portal에 `pnpm add @dk-oasis/m-mes`
- [ ] portal/module-config.ts에 등록
- [ ] 운영 메뉴 DB에 등록
- [ ] portal 빌드 & 배포
