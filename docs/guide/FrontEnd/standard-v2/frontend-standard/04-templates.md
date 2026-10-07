# 04. 표준 템플릿

> 상위 문서: [Frontend 표준 개발 가이드 V2](../../FrontEnd_표준_통합_개발가이드_v2.md)

## 14. 표준 템플릿 (형태 고정 뼈대)

### 14-1. API 서비스 모듈 `{name}-api.ts`

```ts
import { apiRequest } from "@dk-oasis/shared/http";
import type { SavePayload } from "@dk-oasis/shared/grid";
import type { ProductRow, ProductSearchRequest } from "./types";

// 조회: plain DTO body
// UI→BFF 컨벤션: /api/{moduleId}/oasis/{serviceId}/{action}
export async function searchProducts(req: ProductSearchRequest): Promise<ProductRow[]> {
  return apiRequest<ProductRow[]>("/api/mpp/oasis/product/search", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// 저장: SavePayload → { master: [...] } 로 변환
// - 최상위 키 `master` 는 BE saveProducts(List<Map> master) 파라미터명과 동일 (§10-3)
// - 변경 없는 행은 전송에서 제외 (§9-3)
export async function saveProducts(payload: SavePayload): Promise<{ savedCount: number }> {
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

- MUST: UI→BFF URL 은 `/api/{moduleId}/oasis/{serviceId}/{action}` (OASIS) 또는 `/api/{moduleId}/rest/{API_PATH}` (REST) 컨벤션을 사용한다. (RULE.md §"URL 컨벤션 (UI → BFF → BE)")
- MUST: 저장 body 최상위 키는 `master`(§10-3). Master-Detail 이면 `{ master, detail }`.
- 레거시 API 키 유지는 §10-3 예외 절을 따른다.

### 14-2. 페이지 본체 `{Name}Page.tsx`

```tsx
"use client";
import { useState } from "react";
import type { PortalShellPageComponent } from "@dk-oasis/shared/portal-shell-core";
import { PageLayout, SearchArea, SearchField, ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, useGridDataManager } from "@dk-oasis/shared/grid";
import { useApiCall } from "@dk-oasis/shared/use-api-call";
import { searchProducts, saveProducts } from "./product-api";
import type { ProductRow, ProductSearchRequest } from "./types";
import { USE_YN_OPTIONS } from "./constants";

const ProductPage: PortalShellPageComponent = () => {
  const apiCall = useApiCall();
  // 조회 조건은 객체 하나로 두고, 칸 onChange 는 함수형 갱신으로 쓴다(조회 기본값 규칙: Part B §4-4).
  const [filter, setFilter] = useState<ProductSearchRequest>({ useYn: "", regFromDt: "", regToDt: "" });
  const grid = useGridDataManager<ProductRow>({
    rowKey: "productId",
    emptyForm: {},
    rowToForm: (row) => row as Partial<ProductRow>,
    saveHandler: async (payload) => {
      await saveProducts(payload);
    },
  });

  const handleSearch = async () => {
    const data = await apiCall(() => searchProducts(filter), { successMessage: "조회 완료" });
    if (data) grid.setRows(data);
  };

  return (
    <PageLayout title="표시명" buttons={[
      <Button key="s" onClick={handleSearch}>조회</Button>,
      <Button key="v" onClick={grid.save}>저장</Button>,
    ]}>
      {/* 첫 조회는 마운트 effect 가 아니라 autoSearch 로 한다. 조회 칸에는 name 또는 defaultKey 를 달고, 기간은 type="date" 두 칸(label="~")을 쓴다. */}
      <SearchArea onSearch={() => void handleSearch()} autoSearch>
        <SearchField
          label="사용여부"
          defaultKey="useYn"
          type="select"
          value={filter.useYn ?? ""}
          options={USE_YN_OPTIONS}
          onChange={(v) => setFilter((f) => ({ ...f, useYn: v }))}
        />
        <SearchField
          label="등록일"
          defaultKey="regFromDt"
          type="date"
          value={filter.regFromDt ?? ""}
          onChange={(v) => setFilter((f) => ({ ...f, regFromDt: v }))}
        />
        <SearchField
          label="~"
          type="date"
          value={filter.regToDt ?? ""}
          onChange={(v) => setFilter((f) => ({ ...f, regToDt: v }))}
        />
      </SearchArea>
      <ContentBody root>
        <ContentPanel>
          <AgDataGrid columns={[]} data={grid.rows} />
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
};

export default ProductPage;
```

> 위 코드는 형태 고정 뼈대이다. 조회 영역의 `autoSearch`·`defaultKey`·`type="date"` 기간·함수형 `onChange` 는 [Part B §4-4](../part-b-shared-policy.md#4-4-조회-칸-사용자-기본값-searchareasearchfield) 표준이다. `useGridDataManager` 의 정확한 반환 API(`setRows`, `save`, `rows`) 는 실제 파일 확인 후 사용한다. 이름이 다르면 실제 export 를 따른다.

### 14-3. Portal 재내보내기 `portal/page-components/{moduleGroup}/{screenId}/page.tsx`

**MES (mls / mqc / mpp / mas / mcm)**:
```tsx
// 예: src/portal/page-components/master/plateSlittingMgmt/page.tsx
export { default } from "@dk-oasis/m-{moduleCode}/pages/{moduleGroup}/{screenId}";
```

**APS 예외 (mpn — 분기 2)**:
```tsx
// 예: src/portal/page-components/master/mpn-aps-something/page.tsx
export { default } from "@dk-oasis/m-mpn/pages/{group}/{page-name}-page";
```

### 14-4. 업무 모듈 엔트리

**MES**: `m-{moduleCode}/pages/{moduleGroup}/{screenId}.tsx` (camelCase 단일 토큰, suffix `-page` 금지)

대상 업무 모듈 패키지 내의 `pages/` 하위에 둔다. 한 줄 재내보내기 파일이다.

```tsx
// 예: src/frontend/m-mls/pages/master/plateSlittingMgmt.tsx
export { default } from "../../src/{moduleGroup}/{screenId}/{ComponentName}Page";
```

**APS 예외 (mpn)**: `m-mpn/pages/{group}/{page-name}-page.tsx` (기존 kebab + `-page` 패턴 유지)

```tsx
// 예: src/frontend/m-mpn/pages/master/mpn-aps-something-page.tsx
export { default } from "../../src/{group}/{page-name}/{ComponentName}Page";
```

### 14-5. tsup.config 엔트리 등록

**MES**:
```ts
entry: {
  // ...기존
  "pages/{moduleGroup}/{screenId}": "pages/{moduleGroup}/{screenId}.tsx",
  // 예: "pages/master/plateSlittingMgmt": "pages/master/plateSlittingMgmt.tsx"
}
```

**APS 예외 (mpn)**:
```ts
entry: {
  "pages/{group}/{page-name}-page": "pages/{group}/{page-name}-page.tsx",
  // 예: "pages/master/mpn-aps-something-page": "pages/master/mpn-aps-something-page.tsx"
}
```

- MUST: 위 5개 파일/설정이 모두 존재해야 portal 에서 페이지가 열린다.
- **MUST (MES)**: tsup entry key 와 파일명 모두 camelCase 단일 토큰 `{screenId}` 사용. `-page` suffix / kebab-case 금지.
- **MUST (m-mdm)**: m-mdm 은 와일드카드 exports 를 쓰지 않으므로 새 화면은 tsup entry 와 `package.json` exports 에 같은 이름으로 함께 등록한다(`m-mdm/tests/package-exports.test.ts` 가 대조한다).
- **MUST (APS, mpn)**: 기존 kebab + `-page` suffix 패턴 유지. 신규 MES 룰 적용 금지 (AS-IS 1:1 보존).

---
