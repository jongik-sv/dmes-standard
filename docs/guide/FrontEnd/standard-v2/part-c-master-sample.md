# Part C: Quick Sample — Master: mstProduct 페이지

> 상위 문서: [Frontend 표준 개발 가이드 V2](../FrontEnd_표준_통합_개발가이드_v2.md)


==========================================================
※ 본 샘플은 패턴 참고용이다. 그대로 복사하지 않는다.
※ 구체 값(`mstProduct`, /api/mpp/oasis/product, **m-mpp**) 은 실제 도메인·대상 업무 모듈에 맞게 치환한다. URL 규격은 Part A §2-2 (RULE.md §"URL 컨벤션") 를 그대로 따른다.
※ 본 샘플은 **조업관리(MPP) 모듈 — MES 분기 3** 의 Master 페이지를 가정한 것이다. 품질 화면이면 `m-mqc` 로, 물류 화면이면 `m-mls` 로 치환한다. MES 룰에 따라 파일명은 **camelCase 단일 토큰 `{screenId}.tsx`** (suffix `-page` 금지) 를 사용한다.
※ APS 화면(`m-mpn`, mpn — 분기 2) 도 공통 Frontend 규칙을 따른다. 단, 화면 엔트리 파일은 기존 kebab + `-page` suffix 패턴 (`mpn-aps-something-page.tsx`) 을 유지한다.
※ Part A §2-3 에 따라 새 페이지는 **해당 업무 영역의 `m-{moduleCode}` 모듈** 에 둔다. 한 모듈에 모든 페이지를 몰아넣지 않는다.
==========================================================

---

## 0. 시나리오

- 도메인: Master "Product"
- 페이지 유형: C. 조회 + 저장 (Form + Grid, 행 상태 관리 필요)
- API: 조회 1건, 저장 1건
- BE body shape: 조회는 plain DTO, 저장은 `{ master: [...rowStatus...] }` (§10-3)

---

## 1. 결정 사항

| 항목 | 값 |
|---|---|
| mesModule | `m-mpp` (본 샘플은 조업관리 모듈을 가정. 타 업무면 `m-mpn` / `m-mqc` / `m-mls` 등으로 치환) |
| moduleGroup | `master` |
| screenId / pageId / serviceId / pageName | `mstProduct` (MES 단일값 — camelCase, suffix/kebab 금지) |
| pageId (full) | `portal:master/mstProduct` |
| API path (UI→BFF) | `POST /api/mpp/oasis/mstProduct/search`, `POST /api/mpp/oasis/mstProduct/save` |
| API path (BFF→BE) | `POST /oasis/mstProduct/search`, `POST /oasis/mstProduct/save` (cactus `OasisController` 단일 매핑) |
| tsup entry key | `pages/master/mstProduct` (suffix `-page` 금지 — MES 룰) |

---

## 2. 생성 파일 목록

아래 경로의 `m-mpp` 부분은 **대상 업무 모듈 이름** 이다. 타 업무면 `m-mqc` / `m-mls` 등으로 치환한다. MES 룰: `{screenId}` 단일 토큰 (camelCase), suffix `-page` / kebab 금지.

| # | 파일 |
|---|---|
| 1 | `src/m-mpp/src/master/mstProduct/types.ts` |
| 2 | `src/m-mpp/src/master/mstProduct/constants.ts` |
| 3 | `src/m-mpp/src/master/mstProduct/mstProduct-api.ts` |
| 4 | `src/m-mpp/src/master/mstProduct/MstProductPage.tsx` |
| 5 | `src/m-mpp/pages/master/mstProduct.tsx` |
| 6 | `src/m-mpp/tsup.config.ts` (엔트리 추가) |
| 7 | `src/portal/page-components/master/mstProduct/page.tsx` |

> **APS 예외 (mpn — 분기 2)**: 위 #5 / #7 은 기존 kebab + `-page` 패턴 유지 → `src/frontend/m-mpn/pages/master/mpn-aps-something-page.tsx`.

---

## 3. 파일 코드

### 3-1. types.ts

```ts
// useGridDataManager<T extends Record<string, unknown>> 제약 때문에 Record 를 확장한다.
export interface ProductRow extends Record<string, unknown> {
  productId: string;
  productNm: string;
  productType: string;
  useYn: string;
}

export interface ProductSearchRequest {
  productType?: string;
  useYn?: string;
}
```

> `nativeeditor_status` / `_rowState` 같은 행 상태 필드는 타입에 포함하지 않는다. shared 의 `useGridDataManager` 가 내부적으로 관리한다.

### 3-2. constants.ts

```ts
import type { GridColumn } from "@dk-oasis/shared/grid";

// `as const` 를 붙이면 readonly 배열이 되어 AgDataGrid 의 columns(GridColumn[])에 들어가지 않는다.
export const PRODUCT_COLUMNS: GridColumn[] = [
  { key: "productId", header: "제품코드", width: 120, align: "left" },
  { key: "productNm", header: "제품명", width: 180, align: "left" },
  { key: "productType", header: "유형", width: 120, align: "left" },
  { key: "useYn", header: "사용", width: 80, align: "center" },
];

export const USE_YN_OPTIONS = [
  { value: "", label: "전체" },
  { value: "Y", label: "사용" },
  { value: "N", label: "미사용" },
];
```

### 3-3. product-api.ts

```ts
import { apiRequest } from "@dk-oasis/shared/http";
import type { SavePayload } from "@dk-oasis/shared/grid";
import type { ProductRow, ProductSearchRequest } from "./types";

// 조회: plain DTO body (Part A §10-2)
export async function searchProducts(req: ProductSearchRequest): Promise<ProductRow[]> {
  return apiRequest<ProductRow[]>("/api/mpp/oasis/product/search", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// 저장: SavePayload → { master: [...] } 변환 (Part A §10-3, §10-4)
// - `master` 는 BE saveProducts(List<Map> master) 의 파라미터명과 동일
// - 변경 없는 행은 전송에서 제외 (§9-3)
export async function saveProducts(payload: SavePayload): Promise<{ savedCount: number }> {
  // body 키와 변수명은 일치시킨다 (Part A §4-1 예외 · §10-3 body 최상위 키 규칙)
  const master = [
    ...payload.inserted.map((r) => ({ ...r, rowStatus: "C" })),
    ...payload.updated.map((r) => ({ ...r, rowStatus: "U" })),
    ...payload.deleted.map((r) => ({ ...r, rowStatus: "D" })),
  ];
  return apiRequest("/api/mpp/oasis/product/save", {
    method: "POST",
    body: JSON.stringify({ master }),
  });
}
```

### 3-4. ProductPage.tsx

```tsx
"use client";
import { useState } from "react";
import type { PortalShellPageComponent } from "@dk-oasis/shared/portal-shell-core";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, useGridDataManager } from "@dk-oasis/shared/grid";
import { useApiCall } from "@dk-oasis/shared/use-api-call";
import { searchProducts, saveProducts } from "./product-api";
import type { ProductRow, ProductSearchRequest } from "./types";
import { PRODUCT_COLUMNS, USE_YN_OPTIONS } from "./constants";

const ProductPage: PortalShellPageComponent = () => {
  const [filter, setFilter] = useState<ProductSearchRequest>({ useYn: "" });
  const apiCall = useApiCall();

  const grid = useGridDataManager<ProductRow>({
    rowKey: "productId",
    emptyForm: {},
    rowToForm: (row) => row as Partial<ProductRow>,
    // 저장 실패 시:
    //  - Level A(메시지): useApiCall / useGfnMessage 가 자동 처리 (Part A §8-4, 필수)
    //  - Level B(셀 하이라이트): shared/http · shared/grid 의 지원 확인 전까지는 미구현. 확인 후 §8-4 규칙 적용
    saveHandler: async (payload) => {
      await saveProducts(payload);
    },
    onSaveSuccess: async () => {
      await handleSearch();
    },
  });

  const handleSearch = async () => {
    // successMessage 는 토스트가 아니라 모달로 뜬다. 조회 성공은 알리지 않는다(mantine-aggrid-ui screen-patterns §메시지).
    const data = await apiCall(() => searchProducts(filter));
    if (data) grid.setRows(data);
  };

  // buttons 는 JSX 가 아니라 PageButton 객체 배열이다(id·label·type·action 은 screen-patterns §상단 버튼).
  return (
    <PageLayout
      title="제품 관리"
      screenId="mstProduct"
      objId="mstProduct"
      buttons={[
        { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary", action: "search" },
        {
          id: "btn_save",
          label: "저장",
          onClick: () => void grid.handleSave(),
          type: "save",
          disabled: grid.isSaving || !grid.hasChanges,
          action: "save",
        },
      ]}
    >
      <SearchArea>
        <SearchField
          label="사용여부"
          type="select"
          value={filter.useYn ?? ""}
          options={USE_YN_OPTIONS}
          onChange={(v) => setFilter((f) => ({ ...f, useYn: v }))}
        />
      </SearchArea>
      <ContentBody root>
        <ContentPanel>
          <AgDataGrid rowKey="productId" columns={PRODUCT_COLUMNS} data={grid.rows} columnSizing="fit" />
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
};

export default ProductPage;
```

> `useGridDataManager` 의 반환 필드는 `rows`·`setRows`·`handleSave`·`hasChanges`·`isSaving`·`saveError` 등이다(정본: `shared/src/components/grid/useGridDataManager.ts`). 행추가·행삭제·셀 편집·저장 실패 표시까지 갖춘 완전한 예는 `.claude/skills/mantine-aggrid-ui/references/examples/grid-edit/` (타입 검사 통과본)를 본다.

### 3-5. pages/master/mstProduct.tsx (MES — camelCase 단일 토큰)

```tsx
export { default } from "../../src/master/mstProduct/MstProductPage";
```

> **APS 예외 (mpn)**: `pages/master/mpn-aps-something-page.tsx` (kebab + `-page` 유지).

### 3-6. tsup.config.ts (엔트리 추가 diff)

**MES**:
```ts
export default defineConfig({
  entry: {
    // ... 기존
    "pages/master/mstProduct": "pages/master/mstProduct.tsx",
  },
});
```

**APS 예외 (mpn)**:
```ts
export default defineConfig({
  entry: {
    "pages/master/mpn-aps-something-page": "pages/master/mpn-aps-something-page.tsx",
  },
});
```

### 3-7. portal/page-components/master/mstProduct/page.tsx

```tsx
export { default } from "@dk-oasis/m-mpp/pages/master/mstProduct";
```

> **APS 예외 (mpn)**: `portal/page-components/master/mpn-aps-something/page.tsx` → `export { default } from "@dk-oasis/m-mpn/pages/master/mpn-aps-something-page";`

---

## 4. 규칙 매핑

| 파일 | Part A 섹션 |
|---|---|
| 3-1 types.ts | §4 명명, §3-2 (유형 C 필수 파일), §9 (행 상태 필드 제외) |
| 3-2 constants.ts | §4 명명 |
| 3-3 mstProduct-api.ts | §8 에러 처리, §9-2/§9-3 변환 위치, §10-2~§10-4 body 규칙, §2-2 URL 규칙 |
| 3-4 MstProductPage.tsx | §1-2 기본 원칙, §7 상태관리, §14-2 템플릿 |
| 3-5 m-mpp 엔트리 (`pages/master/mstProduct.tsx`) | §4 명명 (MES camelCase 단일 토큰), §14-4 |
| 3-6 tsup.config | §14-5, §13-2 체크 |
| 3-7 portal 재내보내기 | §14-3 |

---

## 5. 본 샘플의 사용법

- 본 샘플은 패턴 참조용이다. 구체 값(`mstProduct`, `/api/mpp/oasis/mstProduct`, `useYn` 등) 은 실제 도메인으로 치환한다.
- 페이지 유형이 A/B/D/E 인 경우 §3-2 필수 파일 표에 맞게 일부 파일을 생략하거나 확장한다.
- 샘플 그대로 복사하지 않는다. 복사 시에도 Part A §6 금지 사항, §9 변환 규칙, §10 body 규칙을 위반하지 않는지 확인한다.
- MUST (MES): 샘플을 복사하더라도 URL 규격(§2-2), body 최상위 키(§10-3), **파일명 규칙 (`{screenId}.tsx` — camelCase 단일 토큰, suffix `-page` 금지)** 은 반드시 동일하게 유지한다. 업무 도메인과 컬럼만 치환한다.
- MUST (APS / mpn — 분기 2): 본 Frontend 가이드의 공통 규칙을 따르되, 기존 패턴 (`{page-name}-page.tsx`, kebab + `-page` suffix) 을 유지한다.
