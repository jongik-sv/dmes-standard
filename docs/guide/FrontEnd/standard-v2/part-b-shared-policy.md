# Part B: @dk-oasis/shared 사용 정책

> 상위 문서: [Frontend 표준 개발 가이드 V2](../FrontEnd_표준_통합_개발가이드_v2.md)
> 본 문서의 범위는 워크스페이스 공용 패키지 `@dk-oasis/shared` 다. **m-mpn 로컬 공통층**(`src/_shared`, 도메인 공통)은 [Part D. m-mpn 공통 모듈 카탈로그](part-d-mpn-shared-catalog.md)가 정본이며, Part D 에 등재된 모듈은 본 문서의 ASK 대상이 아니다.

**구현 기반: Mantine 9(그리드 ag-grid-community 33).** shared 의 그리드 외 공통
UI(폼·모달·메시지·탭·트리·레이아웃·portal-shell·로그인 폼)는 Mantine 9 위에
구현되어 있다. 그리드는 ag-grid-community v33 을 그대로 쓴다. 결정 근거는
[전 모듈 ADR-0001](../../adr/0001-ui-library-mantine9-aggrid.md) 을 따른다.

## 0. 사용 정책

| 등급     | 의미                                                          |
| -------- | ------------------------------------------------------------- |
| MUST     | 해당 용도에는 반드시 본 항목을 사용한다.                      |
| SHOULD   | 특별한 사유가 없으면 본 항목을 사용한다.                      |
| MAY      | 조건에 해당하면 사용할 수 있다.                               |
| MUST NOT | 일반 업무 페이지에서 사용 금지 (포털/인증 등 특수 영역 전용). |
| ASK      | 본 문서에 없는 항목은 임의로 쓰지 말고 사용자에게 확인한다.   |

---

## 1. 허용 목록 총괄 표

| 서브패스                                      | 상태                   | 용도                                 | 본문 가이드 연결 |
| --------------------------------------------- | ---------------------- | ------------------------------------ | ---------------- |
| `@dk-oasis/shared/http`                       | MUST                   | `apiRequest`, `HttpError`, `getJson` | §8, §10          |
| `@dk-oasis/shared/ui-provider`                | MUST (호스트 root)     | `DmesUiProvider`, Mantine theme      | §4-2             |
| `@dk-oasis/shared/portal-shell-core`          | MUST                   | 페이지 컴포넌트 타입                 | §14-2            |
| `@dk-oasis/shared/portal-shell`               | MUST NOT (일반 페이지) | 포털 프레임 전용                     | —                |
| `@dk-oasis/shared/layout`                     | MUST                   | 레이아웃 컴포넌트                    | §14-2            |
| `@dk-oasis/shared/variables.css`              | MUST                   | 공통 디자인 토큰                     | §4-1             |
| `@dk-oasis/shared/form`                       | MUST                   | 입력 컨트롤                          | §14-2            |
| `@dk-oasis/shared/grid`                       | MUST                   | Grid 및 행 상태 관리                 | §9, §14-2        |
| `@dk-oasis/shared/tree`                       | SHOULD                 | 트리 표현                            | —                |
| `@dk-oasis/shared/markdown-editor`            | SHOULD                 | 마크다운 메모·설명 편집과 표시       | §18              |
| `@dk-oasis/shared/notice-body-view`           | SHOULD                 | 공지 본문(TEXT·MD·HTML) 읽기 표시    | §18              |
| `@dk-oasis/shared/detail-popover`             | SHOULD                 | 클릭으로 여는 큰 상세 팝오버         | §18              |
| `@dk-oasis/shared/dashboard`                  | SHOULD                 | 대시보드 격자·카드·KPI 타일·추이 선  | §18              |
| `@dk-oasis/shared/modal`                      | MUST (모달 페이지)     | Modal 시스템                         | §11 E            |
| `@dk-oasis/shared/message-provider`           | MUST                   | 사용자 메시지                        | §8               |
| `@dk-oasis/shared/use-api-call`               | SHOULD                 | API 호출 + 메시지                    | §8               |
| `@dk-oasis/shared/use-form-validation`        | SHOULD                 | 입력 검증                            | —                |
| `@dk-oasis/shared/error-boundary`             | MAY                    | 치명적 에러 경계                     | —                |
| `@dk-oasis/shared/snapshot`                   | MUST (상태 지속)       | 탭 스냅샷 유틸                       | §7               |
| `@dk-oasis/shared/utils`, `/lib`              | ASK                    | 세부 심볼 미등재 (실제 파일 확인)    | —                |
| `@dk-oasis/shared/secure-storage`             | ASK                    | 세부 심볼 미등재                     | —                |
| `@dk-oasis/shared/oasis`, `/oasis-proxy`      | MUST NOT (일반 페이지) | 포털 프록시 전용                     | —                |
| `@dk-oasis/shared/auth-*`                     | MUST NOT (일반 페이지) | 인증 레이어 전용                     | —                |
| `@dk-oasis/shared/access-db`, `/portal-menu*` | MUST NOT (일반 페이지) | 포털 메뉴/DB 전용                    | —                |

---

## 2. HTTP 계층 `/http`

검증된 export:

```ts
// 범용
import { apiRequest, HttpError, getJson } from "@dk-oasis/shared/http";

// Phase 7 헬퍼 (수동 path 조립 지양)
import {
  apiQuery,
  apiQueryService,
  apiService,
  apiLovMaster,
  apiLovQuery,
  apiLovService,
} from "@dk-oasis/shared/http";
```

- MUST: BE 호출은 `apiRequest` 또는 위 Phase 7 헬퍼로 수행한다.
- MUST NOT: `fetch`, `axios`, 자작 wrapper 사용.
- SHOULD: Phase 7 path(query / service / lov, Part A §2-2-1) 호출은 헬퍼를 우선 사용한다.
- 동작: 토큰 자동 주입(localStorage `oasis_access_token`), 401 에러 메시지 throw, BE `error.message` 추출 후 throw.

> **모듈 제약** (Part A §2-2-1-A): Phase 7 6 종 헬퍼 (`apiQuery` / `apiQueryService` / `apiService` / `apiLovMaster` / `apiLovQuery` / `apiLovService`) 는 BE 측 MyBatis `SqlSession` 빈을 등록한 모듈 (**aps / mpn 만 허용**) 에서만 사용 가능하다. **mpp / mqc / mls / mcm** 화면은 무조건 `apiRequest` + OASIS path (`/api/{module}/oasis/{serviceId}/{action}`) 를 사용한다. 위반 시 runtime 404 + 정합체크서 §K ✗.

### 2-1. BFF 프록시 계약 (참고)

BFF (Next.js `app/api/{moduleId}/...`) 가 BE 로 요청을 프록시할 때의 계약은 RULE.md 가 정본이며, 일반 페이지에서 직접 의식할 필요는 없다. 다만 디버깅·환경 구성 시 다음을 알고 있어야 한다.

- 인증 헤더 4종 (필수): `Authorization`, `X-Client-Key`, `X-Authenticated-User`, `X-Authenticated-Role`
- 환경변수 우선순위: `${MODULE}_WAS_URL` → `BACKEND_API_URL` (fallback)
- `X-Client-Key` 의 값은 BFF 의 `BACKEND_CLIENT_KEY` env 에서 부착된다.
- BFF 라우팅 규칙: `oasis/...` 는 그대로 전달, `rest/...` / `query/...` / `service/...` / `lov/...` 는 `/api/{moduleId}/` prefix 만 제거하여 `${module_url}/...` 로 전달.

상세 매핑은 RULE.md §"URL 컨벤션 (UI → BFF → BE)" / §"Phase 7 신규 컨벤션" 표를 참고한다.

---

## 3. 페이지 인터페이스 `/portal-shell-core`

검증된 export (요지):

```ts
import type {
  PortalShellPageComponent,
  PageProps,
} from "@dk-oasis/shared/portal-shell-core";
import { parsePageId } from "@dk-oasis/shared/portal-shell-core";
```

- MUST: 페이지 본체는 `PortalShellPageComponent` 시그니처로 export.

---

## 4. 레이아웃 `/layout`

검증된 export:

```ts
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
  ErrorModal,
} from "@dk-oasis/shared/layout";
import "@dk-oasis/shared/layout.css";
```

- MUST: 페이지 상단 타이틀·버튼바·검색 영역·본문은 위 구성으로만 작성한다.
- MUST: 화면을 좌우 또는 상하로 분할하는 경우(§4-3)는 리사이즈 가능하게 만든다.

### 4-1. 공통 디자인 토큰 `/variables.css`

```ts
import "@dk-oasis/shared/variables.css";
```

- MUST: 앱 전역 색상·간격·타이포그래피·폼 크기 토큰은 위 CSS를 단일 정본으로 사용한다.
- MUST NOT: 각 앱의 전역 CSS에 동일한 `:root` 토큰을 복사해 별도 관리하지 않는다.
- MUST: 토큰 구조(원시 `--c-*` / 의미 `--color-*`·`--shell-*`), 값, 하드코딩 색 금지 규칙은 [UI 시각 표준](../UI-Visual-Standard.md) §3~§5 를 따른다.

### 4-2. UI Provider `/ui-provider`

검증된 export:

```ts
import { ColorSchemeScript, DmesUiProvider, dmesTheme } from "@dk-oasis/shared/ui-provider";
```

- MUST: `DmesUiProvider` 는 **호스트 root layout 이 한 번만** 감싼다(`m-mcm/app/layout.tsx` 등). 페이지·개별 라우트 layout 에서 중복으로 감싸지 않는다.
- MUST: `ColorSchemeScript` 는 **호스트 root layout 의 `<head>` 전용**이다(FOUC 방지용 인라인 스크립트). 화면 모듈이나 본문에서 렌더하지 않는다. 참조 구현은 `m-mcm/app/layout.tsx` 다.
- MAY: `dmesTheme` 은 `DmesUiProvider` 가 이미 적용하므로 호스트가 직접 쓸 일은 없다. 테스트 하네스나 Storybook 처럼 Provider 를 직접 구성하는 경우에만 참조한다.
- MUST: 테마 값(팔레트 `dmes`·`danger`·`loginBrand`, Pretendard, 반경 3px, 기본 크기 `xs`=26px)과 토스트 위치(우측 하단)는 [UI 시각 표준](../UI-Visual-Standard.md) §4·§8 이 정본이다.
- MUST NOT: 화면 모듈에서 `@mantine/*` 를 직접 import 하지 않는다. 필요한 컴포넌트가 shared 에 없으면 shared 에 추가한다(§17 참조).

### 4-3. 분할 영역 크기 조절 (`ContentBody resizable`)

화면을 좌우 또는 상하로 분할하는 경우(`ContentBody` 안에 `ContentPanel` 이나 중첩 `ContentBody` 를 2개 이상 두는 경우)는 사용자가 크기를 조절할 수 있게 만든다.

```tsx
<ContentBody root resizable storageKey="mdm.dma.columnMng">
  <ContentPanel minSize={200}>...</ContentPanel>
  <ContentPanel minSize={200}>...</ContentPanel>
</ContentBody>
```

- MUST: 직접 자식인 `ContentPanel`·`ContentBody` 사이에 드래그 막대가 들어가도록 분할 영역은 `ContentBody`/`ContentPanel` 를 직접 자식으로 둔다. Fragment 나 다른 컴포넌트로 감싸지 않는다. `div`·CSS grid 로 직접 분할하지 않는다.
- MUST: `storageKey` 는 `<모듈>.<디렉터리>.<화면>` 형식을 쓴다(예: `mdm.dma.columnMng`). 중첩 분할은 `storageKey="<...>.<부위>"` 처럼 접미사를 붙이고(예: `mdm.dma.columnMng.bottom`), 중첩 `ContentBody` 에도 `resizable` 을 준다.
- 동작: px 패널은 px 로, `%` 패널은 `%` 로, 둘 다 `flex` 면 비율로 조절된다. 크기는 localStorage 에 사용자·화면별로 저장된다. 더블클릭하면 기본 크기로 돌아가고, 방향키로 10px 씩 움직인다. 최대화 중에는 막대가 숨겨진다.
- 최소 크기: `ContentPanel`·중첩 `ContentBody` 의 `minSize`(px) prop. 기본값은 row 200 / column 120.
- 중첩 `ContentBody` 는 부모 안에서의 크기를 `width` / `height` / `flex` prop 으로 받는다(`ContentPanel` 과 같은 규칙).
- MUST NOT: 우측 폼 폭만 조절하는 기존 `ResizableFormPanel` 을 신규 화면에 쓰지 않는다 — 위 방식(`ContentBody resizable`)을 쓴다.
- 구현: `src/frontend/shared/src/layout/{ContentBody,ContentPanel,split-sizing}.{tsx,ts}`. 적용 예시: `src/frontend/m-mdm/pages/dma/columnMng/page.tsx`.

---

## 5. Form `/form`

검증된 export:

```ts
import {
  Button,
  Input,
  Select,
  Checkbox,
  DatePicker,
  DateTimePicker,
  Radio,
  Textarea,
  FormGroup,
  ComboBox,
  Spinner,
} from "@dk-oasis/shared/form";
import "@dk-oasis/shared/form.css";
```

- MUST: 모든 입력 컨트롤은 본 모듈에서 가져온다.
- 날짜·시각은 `DatePicker`(날짜)·`DateTimePicker`(날짜 + 시각) 래퍼를 쓴다. 두 값 모두 문자열이다.
  `DateTimePicker` 는 `yyyy-MM-dd HH:mm:ss` 를 주고받으며 24시간제·초까지 입력한다(브라우저 기본
  `datetime-local` 은 OS 지역 설정과 브라우저마다 달라 보이므로 쓰지 않는다).
  - 입력 칸이 진짜 `<input>` 이다. `yyyy-MM-dd HH:mm:ss` 를 직접 치거나 붙여 넣으면 곧바로 값이 된다.
    읽을 수 없는 글자(빈 값·`2026-13-01`·`25:00:00`·초 없는 값)는 값을 바꾸지 않고, 포커스를 벗어나면
    원래 값으로 되돌린다(`DateInput` 의 `fixOnBlur` 와 같다). Enter 는 확정 + 닫기, Escape 는 되돌리고 닫기.
  - 입력 칸을 누르면 달력 + 시·분·초 패널이 열린다. 날짜는 달력으로, 시각은 패널의 시·분·초 칸(24시간제)으로
    고친다. 두 길은 모두 살아 있다.
  - `parseDateTime`(`@dk-oasis/shared/form`) 으로 같은 규칙을 순수 판정할 수 있다.

---

## 6. Grid `/grid`

검증된 export (대표):

```ts
import {
  AgDataGrid,
  DataGrid,
  GridPanel,
  useGridDataManager,
  useRowStateManager,
  ROW_STATUS,
  type SavePayload,
  type GridColumn,
} from "@dk-oasis/shared/grid";
import "@dk-oasis/shared/grid.css";
```

- MUST: 저장형 페이지는 `useGridDataManager` 로 행 상태를 관리한다.
- MUST: `SavePayload = { inserted, updated, deleted, totalChanges }` 는 `*-api.ts` 에서 변환한다 (Part A §9).
- MUST NOT: `ag-grid-react` 를 페이지에서 직접 import.
- MUST NOT: `ag-grid-enterprise` 를 추가하거나 Enterprise 기능(행 그룹·집계·Excel Export 등)을 쓰지 않는다([전 모듈 ADR-0001](../../adr/0001-ui-library-mantine9-aggrid.md) D2). 필요하면 사용자에게 먼저 확인한다. Excel 다운로드는 `@dk-oasis/shared/utils` 의 `exportToExcel` 을 쓴다.
- MUST: 데이터 목록(머리행 + 데이터 행 반복)은 화면 크기·카드·모달과 관계없이 `AgDataGrid` 로 그린다. 제목·건수·버튼 툴바가 필요하면 `GridPanel` 안에 넣는다. 카드·패널 안의 몇 행짜리 작은 목록은 `height="auto"`(행 수만큼 높이가 늘어나는 ag `domLayout="autoHeight"`)를 쓴다. 행이 많아질 수 있는 목록에는 쓰지 않는다.
- MUST NOT: 화면에서 원시 `<table>` 이나 다른 그리드 라이브러리로 데이터 목록을 그리지 않는다(`CustomDataGrid` 는 2026-09-29 삭제). 예외는 라벨-값 짝의 폼 배치 표(`<thead>` 없음)와 `matrix-table` 이다. `DataGrid` 는 `AgDataGrid` 의 별칭이다.
- 열 그룹(여러 줄 머리): `GridColumn.children?: GridColumn[]` 이 있으면 그 항목은 열 그룹(ag-grid `ColGroupDef`, `groupId` = `key`)이 되고 잎만 데이터 열이다. 그룹 항목의 `headerComponent`·`headerComponentParams` 는 그룹 머리 컴포넌트로 쓴다. `GridColumn.headerTooltip?: string` 은 잎·그룹 머리 툴팁이다(mdm TSK-08-02 D8).
- 행 드래그(managed): `AgDataGrid` 의 `rowDragField?: string`(그 열에 드래그 손잡이), `isRowDraggable?: (row) => boolean`, `onRowOrderChange?: (orderedKeys) => void`(놓은 뒤 화면 순서의 `rowKey` 목록). `rowDragField` 를 주면 정렬이 꺼진다(ag-grid managed drag 는 정렬 중 동작하지 않는다). 순서는 호출자가 `data` 를 다시 넘겨 확정한다(mdm TSK-08-02 D8).
- 셀 상태 클래스(`@dk-oasis/shared/grid.css`): `cell-light-pink`(오류·비정상), `cell-warning`(경고), `cell-edited`(바뀐 칸), `cell-emphasis`(안쪽 테두리 강조). `GridColumn.cellClassRules` 로 준다. 화면 CSS 에 색 값을 두지 않는다(mdm TSK-08-02).

---

## 7. Tree `/tree`

검증된 export:

```ts
import { Tree, type TreeProps, type TreeNode } from "@dk-oasis/shared/tree";
import "@dk-oasis/shared/tree.css";
```

- SHOULD: 계층 표현이 필요할 때 사용한다.
- MUST NOT: 이전 오기 `TreeView` 를 import 하지 않는다 (존재하지 않는 심볼).

---

## 8. Modal `/modal`

검증된 export:

```ts
import {
  Modal,
  MessageModal,
  type ModalProps,
  type MessageModalProps,
  type AlertType,
} from "@dk-oasis/shared/modal";
import "@dk-oasis/shared/modal.css";
```

- MUST: 팝업·확인 대화상자는 `Modal` 또는 `MessageModal` 을 사용한다.

---

## 9. 메시지 `/message-provider`

검증된 export:

```ts
import {
  useGfnMessage,
  useMessage,
  MessageProvider,
} from "@dk-oasis/shared/message-provider";
```

- MUST: 사용자 메시지 표시는 이 모듈로만 한다. 새 화면은 `useMessage().showMessage`(객체 인자)를 쓰고, 상황별 문구·`alertType`·토스트 여부는 [`mantine-aggrid-ui` 스킬의 화면 표준 골격](../../../../.claude/skills/mantine-aggrid-ui/references/screen-patterns.md) §메시지 표를 따른다. `useGfnMessage`(위치 인자)는 기존 화면 호환용이다([UI 시각 표준 §8](../UI-Visual-Standard.md) 과 같은 범위).
- MUST NOT: `alert`, `console.error`, 자작 토스트 사용.

---

## 10. API 호출 훅 `/use-api-call`

검증된 export:

```ts
import { useApiCall, type ApiCallOptions } from "@dk-oasis/shared/use-api-call";
```

- SHOULD: 성공/실패 메시지 자동 처리가 필요한 호출에 사용.

---

## 11. 폼 검증 `/use-form-validation`

검증된 export:

```ts
import {
  useFormValidation,
  type FormErrors,
  type FieldRulesMap,
} from "@dk-oasis/shared/use-form-validation";
```

- SHOULD: 입력 검증 규칙이 있는 폼 페이지에서 사용.

---

## 12. 에러 바운더리 `/error-boundary`

검증된 export:

```ts
import {
  ErrorBoundary,
  type ErrorBoundaryProps,
} from "@dk-oasis/shared/error-boundary";
```

- MAY: 치명적 오류 격리 필요 영역에 사용.
- MUST NOT: 비즈니스 오류 처리를 대체하지 않는다 (비즈니스 오류는 `useGfnMessage`).

---

## 13. 스냅샷 `/snapshot`

검증된 export:

```ts
import { cloneSnapshot, isSnapshotEqual } from "@dk-oasis/shared/snapshot";
```

- MUST: 탭 전환 상태 유지 시 `PageProps.snapshot` 과 함께 사용한다.

---

## 14. 유틸 `/utils`, `/lib`, 스토리지 `/secure-storage`

- ASK: 세부 export 심볼은 본 문서에 등재하지 않았다. 사용 전 실제 `shared/src/{utils|lib|secure-storage}/` 를 확인하고, 필요 심볼이 검증되면 본 문서에 등재한 뒤 사용한다.
- MUST NOT: 존재 여부를 확인하지 않은 심볼을 임의 import.

---

## 15. ASK 대상 (일반 페이지 사용 제한)

- `/portal-shell`, `/portal-menu*`, `/auth-*`, `/oasis`, `/oasis-proxy`, `/access-db`, `/pages/home-page` : 포털/인증/메뉴 전용. 일반 업무 페이지에서 MUST NOT.
- 필요 판단 시 Part A §12 절차 적용.

---

## 16. 표준 import 예시

조회 + Grid 페이지:

```ts
import type { PortalShellPageComponent } from "@dk-oasis/shared/portal-shell-core";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
} from "@dk-oasis/shared/layout";
import { Button } from "@dk-oasis/shared/form";
import {
  AgDataGrid,
  useGridDataManager,
  type SavePayload,
} from "@dk-oasis/shared/grid";
import { useApiCall } from "@dk-oasis/shared/use-api-call";
import { apiRequest } from "@dk-oasis/shared/http";
```

모달 페이지:

```ts
import { Modal } from "@dk-oasis/shared/modal";
import { Button, Input } from "@dk-oasis/shared/form";
import { useGfnMessage } from "@dk-oasis/shared/message-provider";
```

---

## 17. 금지 사항 (재확인)

- MUST NOT: 커스텀 `fetch` / `axios` wrapper 작성.
- MUST NOT: `alert`, `console.error` 로 사용자 메시지 표시.
- MUST NOT: shared 의 컴포넌트를 페이지 로컬에서 중복 구현.
- MUST NOT: `@mantine/*` 를 화면 모듈에서 직접 import 하지 않는다. 필요한 컴포넌트가 shared 에 없으면 shared 에 추가한다(§18).
- MUST NOT: 업무 도메인에 묶이지 않는 UI 부품을 화면 폴더에 만들어 그 화면에서만 쓴다. shared 에 등록한다(§18).
- MUST NOT: 상대경로 체인(`../../../`) 으로 shared 또는 타 도메인 import.
- MUST NOT: `@dk-oasis/shared/dist/...` 직접 import.
- MUST NOT: 본 문서에 등재되지 않은 경로/심볼 임의 사용.
- 위 금지 사항 중 import 규칙은 `mantine-aggrid-ui` 스킬의 `audit` 가 기계 점검한다([FrontEnd 인덱스 §자동 점검](../README.md#자동-점검)).

---

## 18. 새 공통 컴포넌트 등록

화면 작업 중 **업무 도메인에 묶이지 않는 UI 부품**(입력 칸·편집기·표시 부품·도구 막대 등)을 새로 만들게 되면, 화면 폴더에 두지 않고 `@dk-oasis/shared` 에 공통 컴포넌트로 등록한다(2026-10-02 사용자 지시).

### 18-1. 등록 대상 판정

- MUST 등록: 다른 화면에서도 같은 모습·동작으로 쓸 수 있는 부품. 예: 마크다운 메모 편집기, 기간 입력, 파일 첨부 칸.
- 화면에 둔다: 그 화면의 업무 모델(흐름도 노드, 판정표 행 등)을 알아야만 동작하는 부품. 그 안에 도메인과 무관한 부분이 있으면 그 부분만 떼어 등록하고, 화면은 등록한 부품을 감싸 쓴다.
- 애매하면 등록하는 쪽을 고른다.

### 18-2. 승인

- 새 컴포넌트·새 서브패스 추가는 이 절을 사용자의 상시 승인으로 보고 묻지 않고 진행한다.
- 기존 shared 컴포넌트의 props·기본 동작·모습을 바꾸는 일은 지금처럼 사용자에게 알리고 승인 뒤에 한다. 다른 화면이 함께 바뀌기 때문이다.

### 18-3. 등록 절차 — 한 작업 안에서 끝낸다

1. **소스**: `shared/src/components/<이름>/` 와 `index.ts`. 화면 모듈 import, 화면 전용 저장 키·CSS 변수·클래스(예: React Flow 의 `nodrag`)를 남기지 않는다. 화면마다 달라지는 값(저장 키, 추가 클래스, testId, 문구)은 props 로 받고 기본값을 둔다.
2. **스타일**: 색·간격은 공통 토큰(`--color-*`, `--spacing-*`)만 쓴다. 새 `.css` export 를 만들지 않고 컴포넌트가 자기 `<style>` 을 직접 넣는다(`LookupModal` 과 같은 방식). 포털이 원격 모듈의 CSS 파일을 싣지 않기 때문이다.
3. **의존성**: 새 라이브러리는 라이선스(MIT·Apache 등)를 확인한 뒤 shared `dependencies` 에 넣는다. 화면 패키지에는 같은 라이브러리를 직접 두지 않고, `pnpm why <라이브러리>` 로 한 벌만 설치됐는지 확인한다.
4. **노출**: `shared/tsup.config.ts` 의 `entry`, `shared/package.json` 의 `exports`, 본 문서 §1 허용 목록 표에 새 서브패스를 넣는다.
5. **시험**: 컴포넌트 단위 시험은 `shared/tests/unit/` 에 둔다. 화면에 붙여 보는 통합 시험은 화면 패키지에 둔다.
6. **문서**: `mantine-aggrid-ui` 스킬의 `references/components/<이름>.md` 를 쓰고 색인을 갱신한다(스킬 §4 의 0번 절차).
7. **빌드·검증**: shared 를 `.d.ts` 를 켠 채 build 한 뒤, 쓰는 화면 패키지의 lint·build·test 를 돌린다.
