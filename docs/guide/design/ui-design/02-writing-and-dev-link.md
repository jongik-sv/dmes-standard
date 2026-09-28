# {CLIENT} MES 디자인설계 표준 가이드

> 상위 문서: [{CLIENT} MES 디자인설계 표준 가이드](../03_화면_디자인설계_가이드.md)

## A.7. 표준 템플릿

### A.7-1. 템플릿 위치
디자인설계서 스펙 템플릿은 [`03-template-and-sample.md`](03-template-and-sample.md) 의 템플릿 절이다. 해당 템플릿을 기준으로 `{화면식별자}_디자인설계서.md` 를 만들고 내용을 채워 넣는다.

### A.7-2. 파일 네이밍
- 작성 파일명: `{화면식별자}_디자인설계서.md` (예: `orderRegistration_디자인설계서.md`) (MUST)
- 저장 위치: `docs/{moduleId}/design/{화면식별자}/` (MUST) — 기능설계서와 동일 폴더

### A.7-3. 구조도 표기
ASCII 박스 문자 세트 사용: `┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ─ │`. 이모지/다른 박스 문자 혼용 금지. (MUST)

---

## A.8. 작성 규칙

> **(MUST) 분석리포트 정본 인용 양식 적용** — 본 §A.8 의 모든 §1 ~ §10 작성 규칙은 **00 §16 정본 인용 매트릭스** 를 적용한다. 분석리포트 §X.Y 의 표를 그대로 인용 (자체 추가 금지). 인용 양식: 설계서 해당 절 첫 줄에 `(분석리포트 §X.Y 와 동일)` 명기 + 표 복사. 디자인설계서 고유 정보(좌표·색상·아이콘 등)는 분석리포트 §4.2 좌표 표 + 기능설계서 §3 인용 위에 추가 컬럼으로만 보강. 분석리포트에 없는 행을 디자인설계서가 추가하면 정합체크서 §A 가 ✗ 로 차단한다.

### A.8-1. §2 화면 레이아웃
- §2.1 레이아웃 유형(§A.4-1) 선택. (MUST)
- §2.2 전체 영역 배치 ASCII 구조도. 기능설계서 영역ID 그대로 명기. (MUST)

### A.8-2. §3 영역별 배치 상세
- §3.1 영역 크기/너비/스크롤/리사이즈 표. (MUST)
- §3.2 A-FILTER 내부 배치 구조도. (MUST)
- §3.3 MAIN 내부 배치 구조도 (폼 레이아웃, 서브그리드 위치). (MUST)

### A.8-3. §4 그리드 컬럼 디자인
- 열: `DB 컬럼명 | 화면 표시명 | 정렬 | 표시 형식 | 비고` (MUST)
- DB 컬럼 없는 표시 컬럼(순번 등)은 `-`. (MUST)
- §4.2 코드값 변환은 기능 §3.3과 동기화. (MUST)
- §4.3 행 조건별 표시: 조건은 DB 컬럼 식 (`ORDER_STATUS='DONE'`). (MUST)

### A.8-4. §5 컴포넌트 구조
- 트리 구조 들여쓰기 표기. (MUST)
- 각 컴포넌트 우측에 **shared 실제 import 경로 + 심볼**을 주석으로 표기. (MUST)
  - 표기: `← @dk-oasis/shared/layout: PageLayout` / `← @dk-oasis/shared/grid: AgDataGrid` / `← @dk-oasis/shared/form: ComboBox` / `← 화면 고유`
  - 금지: `← shared/FilterBar` 같이 **shared에 존재하지 않는 이름** (§A.5-3, §A.10)
- 트리 최상단은 화면 컴포넌트 + 실제 파일 경로 형식으로 표기한다. (MUST)
  - **MES**: `{ScreenId}Page (← m-{moduleId}/src/{moduleGroup}/{screenId}/{ScreenId}Page.tsx)` — 예: `PlateSlittingMgmtPage (← m-mls/src/master/plateSlittingMgmt/PlateSlittingMgmtPage.tsx)`
  - **APS 예외**: `{KebabName}Page (← m-mpn/src/{moduleGroup}/{kebab-name}/{KebabName}Page.tsx)` — 예: `ProductionPlanPage (← m-mpn/src/planning/production-plan/ProductionPlanPage.tsx)`

### A.8-5. §6 팝업/다이얼로그
- 열: `팝업ID | 팝업명 | 트리거 | 크기 | 내용 | 반환값` (MUST)
- 트리거/반환값은 DB 컬럼명 기준. (MUST)
- 기능설계서 §9와 팝업ID 일치. (MUST)

### A.8-6. §7 빈/로딩/에러
**자유 서술 금지 (MUST)**. 다음 표 양식만 허용 (표(상황/표시/근거) 3열 고정).

| 상황 | 표시 | 근거 |
|---|---|---|
| 그리드 데이터 없음 |  |  |
| 상세 미선택 |  |  |
| 로딩 중 |  |  |
| API 에러 |  |  |
| 필드 유효성 에러 |  |  |

위 5 행은 **MUST** (모두 채움). 화면 고유 추가 상황은 행 추가 가능 (단, "근거" 컬럼 비공란 금지).

### A.8-7. §8 반응형 규칙
- 브레이크포인트별 A-FILTER / MAIN 배치 변화. (MUST)
- 모바일 미지원 시 "미지원" 명시. (MUST)

### A.8-8. §9 아이콘
- 주요 버튼·그리드·상태 아이콘의 **용도와 상수명(ICONS.xxx)** 을 매핑. (MUST)
- path 문자열 자체는 설계서에 넣지 않는다 (구현 단계 `src/{group}/{page}/icons.ts` 에서 관리). (MUST)
- Heroicons outline 24px 출처 권장. 직접 그린 도형은 출처 "custom" 으로 기록. (SHOULD)
- 외부 아이콘 라이브러리(lucide-react 등) 컴포넌트명(`FilePlus`, `Trash2`) 기재 금지. (MUST NOT)

---

## A.9. 개발가이드 연계 규칙

디자인설계서는 「FrontEnd_표준_통합_개발가이드_v2.md」와 아래 접점에서 정합되어야 한다. (MUST)

### A.9-1. 설계서 ↔ 개발가이드 매핑 총괄

| 설계 산출물 | Frontend 개발가이드 대응 | 정합 규칙 |
|---|---|---|
| §A.2-1 FE 연계 값 (mesModule/moduleGroup/screenId(=pageId=serviceId)/페이지유형/Frontend 파일/tsup entry) | §2-2, §2-3 | 기능설계서와 동일 값 1:1. **MES**: `screenId = pageId = serviceId` 단일 토큰 `{화면명}`. **APS 예외**: kebab + `-page.tsx`. |
| 페이지 유형 (A~E) | §3-1 유형 + §3-2 필수 파일 | 유형별 파일 세트 결정 |
| §1 공통 레이아웃 | §14-2 `PageLayout` + SearchArea + ContentBody | 영역 구조 1:1 |
| §2.2 메인 영역 구조도 | §14-2 `ContentBody > ContentPanel` | 구조도의 ContentPanel 수와 코드의 ContentPanel 수 일치. 2개 이상이면 리사이즈 가능해야 함 — [Frontend Part B](../../FrontEnd/standard-v2/part-b-shared-policy.md) §4-3 |
| §3 영역별 배치 (A-FILTER) | §14-2 `SearchArea > SearchField` | 필드 수·ID·입력 방식 일치 |
| §4 그리드 컬럼 | §6 `AgDataGrid` columns + `types.ts` Row | 컬럼 수·키·타입 일치. 저장형은 §9 `useGridDataManager` |
| §5 컴포넌트 구조 | §14-2 ~ §14-4 필수 파일 + import 심볼 | 트리의 `← shared/...` 주석이 실제 import 문과 일치 |
| §6 팝업 | §11 E + `@dk-oasis/shared/modal` `Modal` / `MessageModal` | 팝업ID ↔ Modal 컴포넌트 1:1 |
| §7 빈/로딩/에러 | §8 `useApiCall` + `useGfnMessage` + `Spinner` + `ErrorModal` | 토스트/필드 에러/로딩 표기 일치 |
| §9 아이콘 | §A.5-4 인라인 SVG + `icons.ts` | 상수명 ↔ path 데이터 매핑 |
| §10 스타일 토큰 | `shared/src/*.css` CSS Custom Properties | `var(--color-*)`, `var(--spacing-*)` 로 참조 |

### A.9-2. shared 서브패스 사용 정책
- `@dk-oasis/shared` 허용 서브패스(Frontend 가이드 Part B §1 허용 목록)에서만 import. (MUST NOT 허용 외)
- `ASK` 등급 서브패스 사용 시 §11 특이사항에 사유 기록 후 팀 승인. (MUST)

### A.9-2-1. 모듈 패키지 구조 (m-mpn 기반 표준)

**원칙**: m-mpp / m-mls / m-mqc 등 **모든 모듈 패키지는 m-mpn 의 구조와 규약을 따른다.** (MUST)

**패키지 위치**: `frontend/src/m-{moduleId}/`

**표준 디렉토리 구조 (MES — `m-mls` / `m-mqc` / `m-mpp` / `m-mas` / `m-mcm`)**:
```
frontend/src/m-{moduleId}/
├─ package.json            ← name: "@dk-oasis/m-{moduleId}"
├─ tsup.config.ts          ← pages/** 엔트리 다중 번들 구성
├─ tsconfig.json
├─ pages/                  ← 엔트리 파일 (재-export 전용, "use client")
│   └─ {moduleGroup}/
│       └─ {screenId}.tsx    ← MES: 단일 토큰 (예: plateSlittingMgmt.tsx). -page 접미사 없음.
└─ src/                    ← 실제 화면 코드
    ├─ index.ts
    └─ {moduleGroup}/
        └─ {screenId}/                  ← 디렉토리도 screenId 그대로
            ├─ {ScreenId}Page.tsx       ← PortalShellPageComponent 구현 (예: PlateSlittingMgmtPage.tsx)
            ├─ {screenId}-api.ts        ← API 호출 모듈 (예: plateSlittingMgmt-api.ts)
            ├─ types.ts                 ← DTO 타입
            ├─ constants.ts             ← 그리드 컬럼, 기본값 등
            ├─ icons.ts                 ← 아이콘 path 상수 (§A.5-4)
            ├─ Icon.tsx                 ← 아이콘 래퍼
            └─ modals/                  ← 팝업(필요 시)
                └─ {Name}Modal.tsx
```

**APS 예외 구조 (`m-mpn` — `mpn` 체인)** — 기존 kebab + `-page.tsx` 컨벤션 유지:
```
src/frontend/m-mpn/
├─ pages/
│   └─ {moduleGroup}/
│       └─ {kebab-name}-page.tsx        ← 예: production-plan-page.tsx
└─ src/
    └─ {moduleGroup}/
        └─ {kebab-name}/                ← 예: production-plan/
            ├─ {KebabName}Page.tsx
            ├─ {kebab-name}-api.ts
            └─ ...
```

> MES 신규 화면은 위 MES 표준만 따른다. APS 예외 구조를 MES 신규 화면에 적용 금지. (MUST NOT)

**`package.json` 필수 필드** (MUST):
```jsonc
{
  "name": "@dk-oasis/m-{moduleId}",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./pages/*": { "types": "./dist/pages/*.d.ts", "import": "./dist/pages/*.js" }
  },
  "dependencies": {
    "@dk-oasis/shared": "workspace:*"
  }
}
```

**`tsup.config.ts` 필수 설정** (MUST):
- `external: ["react", "react-dom", "next", "@dk-oasis/shared", /^@dk-oasis\/shared\/.*/]`
- 엔트리에 **MES**: `pages/{moduleGroup}/{screenId}.tsx` (`-page` 접미사 없음) / **APS 예외**: `pages/{moduleGroup}/{kebab-name}-page.tsx` 포함
- `clean: false` 유지 (portal dev 가 dist/ 를 watch 중 이므로 clean:true 로 빌드 순간 모듈 not found 무한 루프 발생)

**m-mpn 레퍼런스**: APS 는 기존 컨벤션 유지 — `src/frontend/m-mpn/` 구조 그대로. MES 신규 패키지(m-mls/m-mqc/m-mpp/m-mas/m-mcm)는 본 §A.9-2-1 의 MES 표준 구조를 따른다 (kebab + `-page.tsx` 채택 금지).

### A.9-2-2. 신규 모듈 등록 절차 (PORTAL_MODULE_CONFIG)

모듈 패키지를 **새로 추가**할 때 — 예: m-mls, m-mqc 신설 시 — 아래 5 단계를 빠짐없이 수행한다. (MUST)

| 단계 | 파일 | 변경 내용 |
|---|---|---|
| 1 | `frontend/src/pnpm-workspace.yaml` | `packages:` 목록에 `- m-{moduleId}` 추가 |
| 2 | `frontend/src/portal/package.json` | `dependencies` 에 `"@dk-oasis/m-{moduleId}": "workspace:*"` 추가 |
| 3 | `frontend/src/portal/next.config.ts` | `transpilePackages` 에 `"@dk-oasis/m-{moduleId}"` 추가 (**누락 시 Context 분리 런타임 오류**) |
| 4 | `frontend/src/portal/app/portal/module-config.ts` | `PORTAL_MODULE_CONFIG` 배열에 엔트리 추가 |
| 5 | `frontend/src/portal/page-components/{moduleGroup}/{screenId}/page.tsx` (MES) / `…/{kebab-name}/page.tsx` (APS) | 재-export 스텁 작성 |

**4 단계 `PORTAL_MODULE_CONFIG` 엔트리 표준 형태**:

```ts
// MES (m-mls / m-mqc / m-mpp / m-mas / m-mcm)
{
  moduleId: "{moduleId}",                          // 소문자 식별자
  packageName: "@dk-oasis/m-{moduleId}",
  loadPage: createSafePageLoader(
    (screenId) => import(`@dk-oasis/m-{moduleId}/pages/${screenId}`)  // -page 접미사 없음
  ),
}

// APS 예외 (m-mpn — mpn 체인)
{
  moduleId: "mpn",
  packageName: "@dk-oasis/m-mpn",
  loadPage: createSafePageLoader(
    (pageName) => import(`@dk-oasis/m-mpn/pages/${pageName}-page`)  // 기존 kebab + -page 컨벤션
  ),
}
```

**5 단계 재-export 스텁 예시**:
```tsx
// MES — portal/page-components/master/plateSlittingMgmt/page.tsx
export { default } from "@dk-oasis/m-mls/pages/master/plateSlittingMgmt";

// APS 예외 — portal/page-components/planning/production-plan/page.tsx
export { default } from "@dk-oasis/m-mpn/pages/planning/production-plan-page";
```

**검증** (등록 후 필수 확인):
- `cd frontend/src/m-{moduleId} && pnpm build` 성공
- portal 재기동 후 해당 메뉴 진입 시 Context/Module not found 에러 없음
- 하단 푸터(page-id-badge) 에 `{moduleId}:{composedPageName}` 로 표시

### A.9-3. shared 실제 주요 컴포넌트·심볼 (설계서에 이 이름만 사용)

구현 기반: Mantine 9 + ag-grid-community.

설계서 §5 컴포넌트 구조에 등장해야 할 **실제 shared 이름** (FE 가이드 Part B 검증된 export):

| 서브패스 | 주요 심볼 |
|---|---|
| `/layout` | `PageLayout`, `SearchArea`, `SearchField`, `ContentBody`, `ContentPanel`, `ErrorModal` |
| `/form` | `Button`, `Input`, `Select`, `Checkbox`, `DatePicker`, `Radio`, `Textarea`, `FormGroup`, `ComboBox`, `Spinner` |
| `/grid` | `AgDataGrid`, `DataGrid`, `CustomDataGrid`, `GridPanel`, `useGridDataManager`, `useRowStateManager`, `ROW_STATUS`, type `SavePayload`, type `GridColumn` |
| `/modal` | `Modal`, `MessageModal` |
| `/tree` | `Tree`, type `TreeProps`, type `TreeNode` |
| `/message-provider` | `useGfnMessage`, `useMessage`, `MessageProvider` |
| `/use-api-call` | `useApiCall`, type `ApiCallOptions` |
| `/use-form-validation` | `useFormValidation`, type `FormErrors`, type `FieldRulesMap` |
| `/error-boundary` | `ErrorBoundary` |
| `/portal-shell-core` | type `PortalShellPageComponent`, type `PageProps`, `parsePageId` |
| `/http` | `apiRequest`, `HttpError`, `getJson` |
| `/snapshot` | `cloneSnapshot`, `isSnapshotEqual` |

> 위에 **없는 이름**(FilterBar / DataGrid* / SplitPanel / BottomBar / Toolbar / Pagination / Resizer / IconButton / FormField / Dropdown / RadioGroup / CheckboxGroup / TextInput / DateRangePicker / SearchPopupInput / FilterRow / FilterPanel / GridHeader / SubGrid / EditableDataGrid / SplitGridContainer 등)은 **shared에 없으므로 설계서에 기재하지 않는다.** (MUST NOT)

> \*`DataGrid` 는 `/grid` 보조 export에 있으나 **일반 페이지 기본은 `AgDataGrid`** 이다. (FE §6)

### A.9-4. 페이지 엔트리 파일 규약 (MUST)

모듈 패키지(`@dk-oasis/m-{moduleId}`) 의 **페이지 엔트리 파일** 은 아래 규칙을 반드시 지킨다.
- **MES**: `pages/{moduleGroup}/{screenId}.tsx` (`-page` 접미사 없음)
- **APS 예외**: `pages/{moduleGroup}/{kebab-name}-page.tsx` (기존 컨벤션 유지)

#### A.9-4-1. 첫 줄 `"use client"` 지시어

엔트리 파일의 **첫 줄**은 반드시 `"use client";` 여야 한다. (MUST)

```tsx
// MES — pages/master/plateSlittingMgmt.tsx
"use client";

export { default } from "../../src/master/plateSlittingMgmt/PlateSlittingMgmtPage";

// APS 예외 — pages/planning/production-plan-page.tsx
"use client";

export { default } from "../../src/planning/production-plan/ProductionPlanPage";
```

**왜 엔트리 파일에?**
- tsup 은 소스 파일의 `"use client"` 지시어를 dist 번들 첫 줄에 **원형 보존** 한다.
- Next.js 는 dist 의 **엔트리 파일 첫 줄**을 기준으로 Client/Server Component 를 판별한다.
- src 의 실제 컴포넌트 파일(예: `WorkReportPage.tsx`) 에만 `"use client"` 가 있고 엔트리 파일에 없으면, 번들 후 지시어가 내부로 숨어 Next.js 가 인식하지 못한다.
- 결과: 페이지가 Server Component 로 오인되어 React Context 가 분리되고 `useContext` 가 null 반환 (예: `useMessage must be used within a MessageProvider` 런타임 오류).

**검증 방법**:
```bash
# MES
head -1 frontend/src/m-{moduleId}/dist/pages/{moduleGroup}/{screenId}.js
# APS 예외
head -1 src/frontend/m-mpn/dist/pages/{moduleGroup}/{kebab-name}-page.js
# 출력이 "use client"; 이어야 정상
```

#### A.9-4-2. 엔트리 파일 내용 규약

- 엔트리는 **재내보내기만** 한다 (MUST)
- 실제 로직/JSX 는 src 의 페이지 컴포넌트에 있어야 한다
- src 컴포넌트에도 `"use client";` 선언 권장 (SHOULD — IDE/lint 경고 방지)
- 파일명 규칙:
  - **MES**: `pages/{moduleGroup}/{screenId}.tsx` (단일 토큰, `-page` 접미사 없음)
  - **APS 예외**: `pages/{moduleGroup}/{kebab-name}-page.tsx` (기존 컨벤션 유지)

**금지** (MUST NOT):
- 엔트리 파일에 비즈니스 로직/JSX 포함
- 엔트리에 `"use client"` 지시어 누락 (위 런타임 오류 원인)
- `"use client";` 앞에 다른 코드·주석 삽입 — 첫 줄이어야 한다

---

## A.10. 케이스 선택표

> "주요 shared" 열은 **실제 `@dk-oasis/shared` export 이름** 이다. 설계서 §5 컴포넌트 트리에 그대로 등장시킨다.

| 화면 유형 | 레이아웃 | FE 페이지 유형 | 주요 shared (실제 이름) | 그리드 | 팝업 | 참조 |
|---|---|---|---|---|---|---|
| 조회 전용 | 단일 그리드형 | **B** | `PageLayout` / `SearchArea` / `SearchField` / `ContentBody` / `ContentPanel` / `AgDataGrid` | O | X | — |
| 조회전용 Form (결과 없음) | 단일 폼형 | **A** | `PageLayout` / `SearchArea` / `FormGroup` / `ComboBox` / `DatePicker` | X | △ | — |
| 단일 레코드 관리 (CRUD) | 좌우 분할형 | **C** | `PageLayout` / `ContentBody` / `ContentPanel` ×2 / `AgDataGrid` / `FormGroup` / `useGridDataManager` / `useApiCall` / `useGfnMessage` | O | △ | — |
| 마스터-디테일 | 좌우 + 서브그리드 | **D** | `PageLayout` / `ContentPanel` ×2 / `AgDataGrid` ×2 / `useGridDataManager` | O | △ | Part C |
| 그리드 편집형 | 단일 그리드 (편집) | **C** | `AgDataGrid` + `useGridDataManager` + `ROW_STATUS` + `SavePayload` | O | X | — |
| 팝업 경유 액션형 | 기본 + Modal | **E** + 호출 페이지 | `Modal` / `MessageModal` / `FormGroup` / `useGfnMessage` | △ | O (필수) | — |
| 대시보드 | 카드-그리드형 | **B** | `PageLayout` / `ContentPanel` (카드) / `AgDataGrid` | O | X | — |
| 설정 / 관점 전환 | 탭형 | **B**/**C** | `PageLayout` / 탭 요소 / `FormGroup` | △ | △ | — |
| 트리-그리드 | 계층 + 목록 | **D** | `PageLayout` / `ContentPanel` ×2 / `Tree` / `AgDataGrid` | O | △ | — |
| **다단 그리드 워크플로우** | **상하 2단 그리드형** | **C** + **D** 혼합 | `PageLayout` / `ContentPanel` ×N(세로) / `AgDataGrid` / `useGridDataManager` / `Modal` | O (다수) | O (다수) | 검사결과등록(inspectionResult) |
| **업무 특화 버튼 다수** | 기본 + `PageLayout.buttons` 확장 | **C** 기반 + **E** 다수 | `PageLayout` (buttons 배열) / `Button` / `Modal` / `useGfnMessage` | O | O | 검사결과등록 |
| **그리드 인라인 편집형 (다중 행)** | 단일/다단 그리드 | **C** | `AgDataGrid` (편집 가능) + `useGridDataManager` (일괄 저장) | O | X | 검사결과등록 |

---

## A.11. 가이드 외 시나리오 대응

1. §A.10에 없는 UI 유형 → Frontend 가이드 §3 페이지 유형에서 가장 가까운 유형 선택.
2. 차이점 §11 특이사항 기록.
3. shared에 필요한 컴포넌트 없으면 shared 확장 제안 먼저.
4. 일회성 스타일/컴포넌트 남발 금지. (MUST NOT)

---

## A.12. 완료 체크리스트

### A.12-1. 설계 전
- [ ] 기능설계서 §2 화면 영역 확정
- [ ] **As-Is 화면 캡처 전수 분석 완료** (영역별 크롭 포함) *(선택 — 캡처 미제공 시 designer.cs 좌표·크기 + 기능설계서 §2/§3/§4 기반 추정으로 대체 가능, §11 명시 필수)*
- [ ] As-Is 레이아웃 유형 파악 → To-Be 레이아웃 전환 결정 (§A.2-5)
- [ ] 레이아웃 유형 (§A.4-1) 선택 → FE 페이지 유형(A~E) 매핑
- [ ] **FE 연계 값 확정** (mesModule / moduleGroup / `screenId(=pageId=serviceId)` / 페이지 유형 / Frontend 파일 / tsup entry) — 기능설계서와 동일. **MES**: `{화면명}` 단일 camelCase 토큰 / **APS 예외**: kebab + `-page.tsx`
- [ ] shared 허용 목록 확인 (FE 가이드 Part B §1)

### A.12-2. 설계 후
- [ ] §1 공통 레이아웃이 **portal PortalShell 주입 + PageLayout 기반** 으로 서술됨
- [ ] §2.2 ASCII 구조도가 기능설계서 영역ID와 일치
- [ ] §3 A-FILTER, MAIN 내부 배치 구조도 모두 있음
- [ ] §4 그리드 컬럼 `DB 컬럼명 / 화면 표시명` 2열 분리
- [ ] §4.2 코드값 변환이 기능 §3.3 과 일치
- [ ] §5 컴포넌트 트리의 모든 shared 참조 주석이 **실제 서브패스+심볼** (`← @dk-oasis/shared/layout: PageLayout`) 형식
- [ ] §5 트리 최상단이 **MES**: `{ScreenId}Page (← m-{moduleId}/src/{moduleGroup}/{screenId}/{ScreenId}Page.tsx)` / **APS 예외**: `{KebabName}Page (← m-mpn/src/{moduleGroup}/{kebab-name}/{KebabName}Page.tsx)` 형식
- [ ] §5 에 **shared에 없는 이름**(FilterBar, DataGrid, SplitPanel, BottomBar, Toolbar, Pagination, Resizer, IconButton, FormField, Dropdown, RadioGroup, CheckboxGroup, TextInput, DateRangePicker, SearchPopupInput, FilterRow, FilterPanel, GridHeader, SubGrid, EditableDataGrid, SplitGridContainer 등) 등장하지 않음
- [ ] §6 팝업ID가 기능설계서 §9 와 일치. 구현 컴포넌트 `Modal` / `MessageModal` from `@dk-oasis/shared/modal` 명시
- [ ] §7 빈/로딩/에러에 `useApiCall` + `useGfnMessage` + `Spinner` + `ErrorModal` 패턴 명시
- [ ] §8 반응형 규칙 (미지원 포함)
- [ ] §9 아이콘 표기 — **용도 + ICONS 상수명 + (선택)출처**. 외부 라이브러리(lucide-react 등) 컴포넌트명 **없음**
- [ ] §10 스타일 값이 hex·px 직접 기재가 아니라 CSS 토큰(`var(--*)`) 참조
- [ ] 허용 목록 외 shared 서브패스 사용 없음 (ASK 등급은 §11 기록)
- [ ] 외부 아이콘 라이브러리(lucide-react / @mui/icons-material / @ui5/icons) 미도입 확인

---
---
