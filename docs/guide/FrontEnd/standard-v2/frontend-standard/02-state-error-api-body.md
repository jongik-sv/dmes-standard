# 02. 상태, 에러, API body

> 상위 문서: [Frontend 표준 개발 가이드 V2](../../FrontEnd_표준_통합_개발가이드_v2.md)

## 6. 금지 사항 (MUST NOT)

| 항목 | 이유 |
|---|---|
| `rm -rf dist` (shared 또는 모든 `m-{moduleCode}` 패키지) | portal dev 의 webpack 캐시 파괴 → "Module not found" 루프 |
| tsup `clean: true` | 빌드 중 dist 일시 비어 portal 실패 |
| `.catch(() => [])`, `.catch(() => {})` | 에러 무음 처리 금지 |
| `alert`, `console.error` 로 사용자 메시지 | `useGfnMessage` 체계와 이중화 |
| 커스텀 `fetch` / `axios` wrapper 신규 작성 | `apiRequest` 만 사용 |
| 상대경로 체인 import | §5-1 위반 |
| `portal/page-components` 내 비즈니스 로직 | 재내보내기 전용 |
| 신규 전역 상태관리 라이브러리 임의 도입 | §7 참조 |
| 페이지 컴포넌트에서 직접 `fetch` | §8 책임 분리 위반 |
| Grid 행 상태 필드(`nativeeditor_status` / `_rowState`) 를 body 에 직접 포함 | §9 변환 규칙 위반 |
| `console.log` / `console.error` 를 영속 로그·사용자 메시지로 사용 | 사용자 메시지는 `useGfnMessage` 단일 창구. 디버그 목적은 임시 허용하되 PR 전 제거 |

### 6-A. 설계서 임의 변경 금지 (MUST NOT)

**6-A-1.** 설계서 §7 To-Be Entity 컬럼 목록에 없는 컬럼을 FE types/응답 매핑에 임의로 추가하지 않는다.
- §4.3 "편집 여부 N" + "근거 (STUFF/JOIN)" 표시 = DB 저장 컬럼이 아닌 동적 변환 시그널. FE 도 동일 — 매번 BE 응답에서 변환된 값을 받는 것이지 자체 캐싱 컬럼이 아니다.
- **사례 (위반 시 결과)**: `jobNm` 을 FE `MoldInfo` 타입에 자체 캐싱 컬럼으로 추가 + popup 결과 갱신 시 jobNm 동기화 미적용 → 그리드의 사용공정명이 실제 jobCd 와 불일치.

**6-A-2.** 설계서 §3/§4/§5 항목을 화면에 임의로 줄이거나 합치지 않는다.
- 화면 폭 / 가독성 등 사유로 줄여야 한다면 사용자에게 먼저 확인 (Q-NNN 등재).
- **사례**: 66 그리드 컬럼 → 16 임의 축소 / 14 검색조건 → 6 임의 축소 = MUST NOT.

**6-A-3.** 설계서가 명시하지 않은 정책을 임의로 광범위하게 적용하지 않는다.
- **사례**: §7.3 의 상태별 편집 매트릭스가 명시 안 된 상태에서 "폐기/수정중 모든 컬럼 editable=false" 로 광범위 적용 = MUST NOT.

**6-A-4.** 단순화 / 캐싱 결정은 사용자 동의 후 진행.
- "단순화 한 번에 해결" 충동은 안티패턴.
- **사례**: 외부 JOIN 응답 컬럼들을 FE 자체 캐싱하여 popup 결과에 갱신 안 함 (분기 회피).

**6-A-5.** 위반 시 정합체크서 §K (코드 구현 정합) 가 ✗ 되어 §13-5 의 재개발 의무 사이클 발동.

---

## 7. 상태관리 규칙

| 상태 유형 | 규칙 |
|---|---|
| 지역 상태 | SHOULD: `useState` / `useReducer` 우선 |
| 탭 전환 후 유지되는 상태 | MUST: `PortalShellPageComponent.snapshot` / `onSnapshotChange` 를 먼저 검토 |
| 여러 페이지 공유 상태 | MAY: 기존 프로젝트 표준 store/context 가 있으면 그 범위 내 사용 |
| 신규 전역 상태관리 | MUST NOT: Redux/Zustand/Jotai 등 신규 도입 금지. 필요 판단 시 §12 절차 |

---

## 7-A. 응답 매핑 규칙 (cactus envelope ↔ FE payload)

BE (cactus) 응답 envelope 표준 schema (BE 가이드 §6-D / §6-E 참조):

```ts
interface CactusEnvelope {
  meta: { success: boolean; code?: string; message?: string; ... };
  data?: Record<string, unknown>;     // 단일 값 (number / string / 객체)
  grids?: Record<string, { rows: unknown[] }>;  // List<Map> 데이터
}
```

**7-A-1.** 매핑 규칙 (cactus `CactusResponseConverter` 자동 분리 정합):
- Service 가 List 직접 반환 + BPMN `output="{key}"` → `envelope.grids.{key}.rows`
- Service 가 단일 값 반환 + BPMN `output="{key}"` → `envelope.data.{key}`

**7-A-2.** Service 가 Map 반환 + BPMN `output="result"` 패턴 (비표준):
- 응답이 `envelope.data.result = Map<String, Object>` 형태로 저장됨 — Map 내부 List 는 cactus 가 자동 분리 ✗
- FE 에서 `data.result` 안의 key 를 별도 extract 처리 필요:
```ts
function unwrapPayload<T>(res: unknown): T {
  const env = res as CactusEnvelope;
  const out: Record<string, unknown> = {};
  if (env?.data) {
    Object.assign(out, env.data);
    const inner = env.data["result"];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      Object.assign(out, inner as Record<string, unknown>);
    }
  }
  if (env?.grids) {
    for (const [k, v] of Object.entries(env.grids)) out[k] = v?.rows ?? [];
  }
  return out as T;
}
```

**7-A-3.** **MUST**: 응답 매핑은 `*-api.ts` 또는 `*-repository.ts` 안에서 처리. 페이지 컴포넌트는 unwrap 된 flat payload 만 받는다.

**7-A-4.** **사례 (2026-05-28)**: mcm cma `masterCodeMng/api.ts` 가 `payload.ds_GetCodeMasterList` 직접 접근 → 화면 0건. fix: `envelope.data.result.ds_GetCodeMasterList` 매핑 (§7-A-2 패턴).

---

## 7-B. shared AgDataGrid 사용 규칙

[AgDataGrid](../../../../../src/frontend/shared/src/components/grid/AgDataGrid.tsx) 의 prop 가이드.

**7-B-1.** `columnSizing` 모드:
- `"fit"` (기본 권장): 컬럼 합 ≤ 그리드 폭 → 비율 분배 / 컬럼 합 > 그리드 폭 → col.width 보장 + 좌우 스크롤
- `"fixed"`: col.width 픽셀 그대로. 합 초과 시 좌우 스크롤
- `"auto"`: 컨텐츠 폭 측정 (autoSizeColumns 기반). 동적 폭 필요 시만 사용

**7-B-2.** `stopEditingWhenCellsLoseFocus` prop (기본 `true`):
- 행추가 직후 React re-render 로 cellEditor input 의 focus 가 잠시 이동되어도 편집 유지가 필요한 화면 (예: mcm cma 의 Master Code 관리) 은 **`false` 명시**

**7-B-3.** 행 선택 + 강조 + 행삭제 활성화 매커니즘:
- GridPanel `selectedRowKey` prop + AgDataGrid `highlightedRowKey` + `onRowClick` 3 prop 모두 세팅 필수
- `selectedRowKey` 가 null 이면 GridPanel 의 내장 행삭제 / 행복사 버튼 disabled
- AgDataGrid 의 `rowKey` 값 = `selectedRowKey` 값과 정확히 일치해야 강조 동작. 합성 ID 필요 시 행 객체에 `__rowId` 같은 별도 키 부여 + `rowKey="__rowId"` 패턴 권장

**7-B-4.** `GridColumn.render` 로 interactive cellRenderer (체크박스, 상태 아이콘 등) 구현 가능:
- render 함수 시그니처: `(value, row) => React.ReactNode`
- page.tsx 의 setter callback 을 closure 로 캡쳐하려면 buildColumns 함수 시그니처에 callback parameter 추가 + useMemo dep 에 callback 포함

**7-B-5.** `tooltipValueGetter` (defaultColDef 자동 적용):
- 컬럼 폭 초과로 ... 잘림 시 마우스오버 시 전체 값을 OS title 으로 표시. 추가 prop 없이 동작.

**7-B-6.** 행 클릭 시 cellEditor focus 보호:
- `handleRowClicked` 가 편집 중 (`api.getEditingCells().length > 0`) 이면 container focus 이동 skip. 자동 동작 — 사용자 코드 무관.

---

## 8. 에러 처리 책임 분리

### 8-1. 책임

| 계층 | 책임 |
|---|---|
| API 서비스 모듈 (`*-api.ts`) | 요청/응답 처리, 실패 시 throw |
| 페이지 컴포넌트 | `useApiCall` 또는 try/catch + `useGfnMessage` 로 사용자 메시지 표시 |
| `apiRequest` (shared) | 401 처리, BE `error.message` 추출 |

### 8-2. BE 에러 응답 공식 계약

본 프로젝트의 BE 는 에러 응답을 다음 두 레벨 JSON shape 로 내려보낸다. 상세 규격은 BackEnd 가이드 Part C §4-6 참조.

**Level A (모든 에러에 필수):**
```json
{
  "meta": { "success": false, "code": "E001", "message": "입력값을 확인해주세요." }
}
```

**Level B (그리드 저장 검증 실패 시 추가):**
```json
{
  "meta":   { "success": false, "code": "E001", "message": "..." },
  "errors": [
    { "grid": "master", "rowKey": "P001", "rowIndex": 0,
      "field": "productNm", "code": "E001",
      "message": "제품명은 필수입니다." }
  ]
}
```

- `apiRequest` 는 `meta.message` 를 추출하여 `Error` 로 throw 한다(Level A 의 기본 동작).
- Level B 의 `errors` 배열이 FE 까지 어떤 JS 경로로 전달되는지는 `shared/http` 의 구현에 따른다. 본 가이드는 **JSON 필드명과 의미** 만 고정하며, 실제 수신 객체의 속성/훅은 §8-4 에서 조건부로 다룬다.
- MUST NOT: API 모듈과 페이지에서 둘 다 사용자 메시지를 표시하여 중복 노출.

### 8-3. 흐름

```
page → useApiCall(() => productApi.save(payload))
       └─ productApi.save → apiRequest → BE
            ├─ 성공: 데이터 반환
            └─ 실패: Error throw (apiRequest 가 error.message 로 변환)
       └─ useApiCall 이 gfn_message 로 표시
```

### 8-4. 에러 상세 2레벨 처리 규칙

BE 에러 응답(§8-2) 을 FE 에서 처리하는 규칙을 레벨별로 분리한다.

**Level A — 공통 메시지 표시 (MUST, 모든 페이지)**

- MUST: 모든 API 호출 실패 시 `useGfnMessage` 로 **메시지 1회** 를 표시한다.
- MUST: 메시지 소스는 `apiRequest` 가 throw 한 `Error.message` (= BE `meta.message`) 를 그대로 사용한다.
- MUST: `useApiCall` 을 사용하는 경우 자동 표시에 위임한다. 수동 `try/catch` 의 경우 catch 블록에서 `gfn.error(e.message)` 를 호출한다.

**Level B — 그리드 행/셀 하이라이트 (저장형 Grid 페이지 조건부 SHOULD)**

- SHOULD: 저장형 Grid 페이지(유형 C/D) 는 Level B 를 구현한다. 단, 아래 두 조건을 모두 만족하는 경우에만 실제 구현 대상이 된다.
  1. `shared/http` 가 BE `errors` 배열을 FE 에 보존해서 노출하는 경로(예: throw 된 에러 객체의 속성, 또는 별도 훅) 가 확인된 경우
  2. `shared/grid` (`AgDataGrid` / `useGridDataManager`) 가 행·셀 하이라이트용 API 를 제공하는 경우
- 위 두 조건 중 어느 하나라도 확인되지 않은 시점에는 **Level A 만 필수** 이며, 저장형 페이지도 Level B 미구현으로 표준을 충족한다.
- ASK: 두 조건의 지원 여부가 불분명하면 §12 ASK 절차를 따르고, 확인 결과를 본 가이드에 반영한 뒤 구현한다.

**Level B 를 구현하는 경우의 공통 규칙**

- MUST: Level A 메시지 표시를 생략하지 않는다(두 레벨 병행).
- MUST: `errors` 배열의 필드는 BE 공식 계약(§8-2) 의 6필드(`grid`, `rowKey`, `rowIndex`, `field`, `code`, `message`) 를 그대로 사용한다.
- MUST: `grid` 값은 저장 API 의 body 최상위 키와 동일하다. 같은 페이지에 여러 그리드가 있을 때 이 값으로 대상 그리드를 식별한다.
- MUST NOT: `errors` 의 필드명을 개별 페이지에서 재매핑하지 않는다.

**참고: 수신 코드 패턴 (의사코드)**

```ts
// Level A: 모든 페이지 필수
try {
  await saveProducts(payload);
} catch (e: any) {
  gfn.error(e.message);
}

// Level B: shared/http 가 errors 배열을 보존해서 노출하고,
//         shared/grid 가 하이라이트 API 를 제공하는 것이 확인된 경우에만 적용.
// 실제 수신 경로(throw 된 객체의 속성, 또는 별도 훅) 와 하이라이트 API 의 시그니처는
// shared 소스에서 확인한 뒤 본 가이드에 보강하고 사용한다. (ASK)
```

### 8-5. 인증/인가 실패 처리

- 401 (토큰 만료/무효): `apiRequest` 가 자동 처리한다(토큰 재발급 또는 로그인 리다이렉트). 페이지는 별도 처리하지 않는다.
- 403 (권한 없음): Level A 메시지 표시(MUST). 페이지 자체 접근 제어(라우팅 단계) 는 본 가이드 범위 외이며 §12 ASK 절차를 따른다.

---

## 9. Grid 행 상태 ↔ API body 변환 규칙

### 9-1. 상태 관리 위치

- MUST: 저장형 페이지(유형 C/D) 는 shared 의 `useGridDataManager` (또는 `useRowStateManager`) 로 행 상태를 관리한다.
- MUST NOT: 페이지에서 `nativeeditor_status` / `_rowState` 필드를 수동으로 조작하지 않는다.

### 9-2. 변환 위치

- MUST: `useGridDataManager` 의 `saveHandler(payload: SavePayload)` 를 통해 **`*-api.ts`** 의 save 함수를 호출한다.
- MUST: `*-api.ts` 의 save 함수에서 `SavePayload = { inserted, updated, deleted, totalChanges }` 를 **해당 API 가 요구하는 DTO shape** 로 변환하여 전송한다.
- MUST NOT: `SavePayload` 를 그대로 body 에 넣지 않는다. `nativeeditor_status` 등 내부 필드가 body 에 유출되면 안 된다.

### 9-3. BE 가 C/U/D/R 규약을 요구하는 경우의 매핑

해당 API 가 행 단위 `rowStatus` 필드를 요구한다면 다음과 같이 매핑한다.

| SavePayload 필드 | BE `rowStatus` |
|---|---|
| `inserted` | `"C"` |
| `updated` | `"U"` |
| `deleted` | `"D"` |
| (변경 없음) | 전송 제외 |

- MUST: 본 프로젝트의 BE 저장 API 는 `rowStatus` 규약을 사용한다(BackEnd 가이드 §8-5).
- MUST: `inserted` → `"C"`, `updated` → `"U"`, `deleted` → `"D"` 로 매핑한다.
- MUST: 변경 없는 행은 **전송에서 제외** 한다. `"R"` 을 명시적으로 붙여 전송하지 않는다.

---

## 10. API 요청 body 규칙 (고정)

### 10-1. 공통

- MUST: body 는 **plain DTO shape** 으로 전송한다.
- MUST NOT: `meta / params / grids` 형태의 CactusRequest 래핑은 사용하지 않는다.
- MUST: body 조립은 `*-api.ts` 에서 수행한다. 페이지 컴포넌트는 도메인 상태만 넘긴다.
- MUST NOT: `nativeeditor_status`, `_rowState` 등 Grid 내부 필드를 body 에 포함하지 않는다(§9 참조).
- 본 규칙은 **프로젝트 표준 규칙** 이다. BE 측 엔진의 내부 매핑이 plain DTO 와 다를 경우, BackEnd 가이드 Part B §8-2 의 BPMN `input` 매핑을 통해 본 규칙과 일치하도록 맞춘다.

### 10-2. 조회 body

- MUST: SearchRequest DTO 의 필드를 그대로 body 최상위에 둔다.

```json
{ "productType": "SEAL", "useYn": "Y" }
```

### 10-3. 저장 body 최상위 키 규칙

저장 API 의 body 최상위 키는 **BE 메서드 파라미터명 = 그리드명 = body 키** 3자 일치로 고정한다. 개발자가 임의로 `rows`, `payload`, `items` 등으로 정하지 않는다.

**단일 Grid 저장 (유형 C)**

- MUST: 최상위 키는 `master` 로 고정한다.

```json
{
  "master": [
    { "productId": "P001", "productNm": "벨로우즈", "rowStatus": "C" },
    { "productId": "P002", "useYn": "N",           "rowStatus": "U" }
  ]
}
```

**Master-Detail 저장 (유형 D)**

- MUST: 최상위 키는 `master`, `detail` 로 고정한다.

```json
{
  "master": [ { "orderId": "O1", "rowStatus": "U" } ],
  "detail": [ { "orderId": "O1", "lineNo": 1, "qty": 10, "rowStatus": "C" } ]
}
```

**레거시 API 예외**

- MUST: 신규 또는 재설계되는 저장 API 는 위 고정 키(`master` / `master`+`detail`) 를 따른다.
- MAY: 기존 레거시 API 가 이미 다른 키(예: `rows`, `payload`) 를 쓰고 있는 경우에 한해, 해당 키를 그대로 유지할 수 있다. 이 경우 다음을 모두 만족해야 한다.
  - 사용 중인 키가 API 설계서에 **명시** 되어 있을 것
  - BE 메서드 파라미터명과 BPMN `input` 매핑이 해당 키와 맞물려 있을 것 (BackEnd 가이드 §8-4 3자 일치는 레거시 키 기준으로 유지)
- MUST NOT: 프런트가 임의로 새 키(`rows`, `payload`, `items` 등) 를 만들지 않는다. 레거시가 아닌 신규 API 에서 `master`/`detail` 이외의 키를 선택하는 것은 금지한다.

### 10-4. SavePayload → body 변환

- MUST: `useGridDataManager` 의 `SavePayload = { inserted, updated, deleted, totalChanges }` 를 `*-api.ts` 의 save 함수에서 위 shape 로 변환한다.
- MUST: 변환 시 §9-3 의 `C/U/D` 매핑을 적용한다.
- MUST: 변경 없는 행은 전송에서 제외한다(§9-3).

### 10-5. 그 외

- 다중 Grid 가 세 개 이상 필요한 경우(예: `master/detail/sub`) 는 본 가이드 범위 외이며, §12 ASK 절차를 따른다.
- 레거시 API 로 인해 §10-3 예외 절을 적용해야 하는 경우, 페이지 헤더 주석에 "레거시 키 유지 — 설계서 §X 참조" 를 남긴다(MAY). 신규 개발에서는 예외 절에 기대지 않는다.

---
