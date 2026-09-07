# 공통 UI 기반 전환 설계 — Mantine 9 + ag-grid-community

- 작성일: 2026-09-07
- 상태: 승인 (대화에서 A안 승인)
- 범위: 1단계 — `@dk-oasis/shared` 내부 구현 교체, 화면 코드 무변경
- 관련 결정: MRT(mantine-react-table) 미채택 → 그리드는 ag-grid-community 유지

## 1. 배경과 결정

Antigravity 분석 보고서(`mantine_vs_shadcn_analysis.md`)는 "Mantine + Mantine React Table(MRT)" 을 권고했다. 그러나 2026-09-07 시점 확인 결과 MRT 는 사실상 유지보수가 멈췄다.

| 항목 | 확인 값 |
|---|---|
| MRT 마지막 배포 | 2.0.0-beta.9 (2025-02-17), peer `@mantine/core ^7.9` |
| MRT 저장소 | 2026-06 CI 워크플로 삭제 이후 커밋 없음 |
| Mantine 최신 | 9.6.0 (2026-08-31), peer `react ^19.2` |
| 현재 프론트 | Next 16.1.6 · React 19.2.3 · Tailwind v4 · pnpm 10 |

결정: **Mantine 9 를 그리드 외 전 UI 기반으로 채택하고, 그리드는 이미 shared 에 있는 ag-grid-community v33(MIT) 을 유지한다.** MUI(`@mui/material`, `@mui/x-data-grid`, `@emotion/*`) 는 실사용 화면이 없으므로 제거한다.

## 2. 현황 (조사 결과 요약)

- 화면 모듈(m-mcm 22개 화면, m-mpn/mqc/mls/mpp sample, m-analog)은 UI 를 전량 `@dk-oasis/shared/*` 서브패스로만 소비한다. `@mui`·`ag-grid` 직접 import 는 0건이다.
- ag-grid 의존은 `components/grid/AgDataGrid.tsx` 와 이를 재사용하는 `components/lookup/LookupModal.tsx` 두 곳뿐이다. 화면에서 그리드 ref API 직접 호출은 0건이다.
- 그리드 외 공통 UI(폼 13종, modal, message-provider, tabs, tree, layout 12종, portal-shell, 로그인 폼, charts 5종, matrix-table)는 전부 순수 React + 전역 CSS 자체 구현이다.
- 스타일: CSS Modules 0건, 전역 `.css` 파일을 tsup entry 로 내보내고 화면이 `@dk-oasis/shared/form.css` 등을 import 한다. 디자인 토큰은 `src/styles/variables.css` 의 `:root` 커스텀 프로퍼티다.
- 호스트 `m-mcm` 은 Tailwind v4 를 `globals.css` 에서 `@import "tailwindcss"` 로 쓰고 있다. root layout 에 Provider 가 없다.
- 단위 테스트: `shared/tests/unit` 17개(vitest). e2e: `e2e/` 32 spec, `getByRole/getByText` 위주, ag-grid DOM 클래스 셀렉터 18 파일.
- 문서: `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md:127-176` 이 컴포넌트 export 와 "기본값은 AgDataGrid" 를 규정. 설계 템플릿·ui-design 가이드는 shared 컴포넌트명을 화이트리스트로 인용. 전 모듈 횡단 ADR 위치는 아직 없다(모듈별 `docs/{module}/design/adr/` 만 존재).

## 3. 목표와 비목표

목표

1. `@dk-oasis/shared` 의 UI 컴포넌트 내부를 Mantine 9 로 재구현하되 **export 이름·props 계약·CSS 서브패스 export 를 유지**해 화면 코드와 e2e 셀렉터가 바뀌지 않게 한다.
2. MUI 계열 의존과 `MuiDataGrid` 를 제거한다.
3. 디자인 토큰을 Mantine theme 으로 옮기고, ag-grid 테마와 잔존 CSS 가 같은 토큰을 쓰게 한다.
4. FE 표준 문서·설계 템플릿·ADR·디자인 샌드박스를 갱신한다.

비목표 (2단계로 분리)

- 화면 inline style(204건) 정리, `window.confirm`(12곳) 공통 확인 모달 통일.
- shared API 재설계, 화면이 Mantine 컴포넌트를 직접 쓰는 방식.
- 다크 모드. (테마는 light 고정, `ColorSchemeScript` 만 둔다.)
- charts(SVG 자체 구현)·matrix-table 교체. `@mantine/charts` 는 recharts 의존을 추가하므로 도입하지 않는다.

## 4. 아키텍처

### 4.1 패키지·빌드

`shared/package.json`

- dependencies 추가: `@mantine/core`, `@mantine/hooks`, `@mantine/dates`, `@mantine/notifications`, `@mantine/modals` (모두 `^9.6.0`), `dayjs`, `@tabler/icons-react`, `clsx`.
  - Mantine 은 화면 앱마다 단일 인스턴스여야 하므로 **peerDependencies 로 선언**하고 devDependencies 에도 넣어 shared 단독 빌드·테스트가 되게 한다. 호스트 `m-mcm` 과 `m-design-dummy` 가 같은 버전을 dependencies 로 가진다.
- 제거: `@mui/material`, `@mui/x-data-grid`, `@emotion/react`, `@emotion/styled` (peer·peerMeta 모두), `src/components/grid/MuiDataGrid.tsx` 와 grid/index.ts 의 해당 export.
- tsup: `external` 에 `@mantine/core`, `@mantine/hooks`, `@mantine/dates`, `@mantine/notifications`, `@mantine/modals`, `dayjs`, `@tabler/icons-react` 추가. MUI 항목 제거. 새 entry `ui-provider: src/ui-provider/index.tsx`.
- PostCSS: shared 는 `.css` 를 그대로 복사하므로 Mantine 전용 문법(`rem()`, `light-dark()`)을 shared 의 CSS 파일에서 쓰지 않는다. 호스트 `m-mcm/postcss.config.mjs` 에 `postcss-preset-mantine` 과 `postcss-simple-vars` 를 Tailwind 플러그인 앞에 추가한다.
- Mantine CSS 로드: `m-mcm/app/globals.css` 에서 `@import "tailwindcss"` **앞에** `@import "@mantine/core/styles.layer.css"`, `@import "@mantine/dates/styles.layer.css"`, `@import "@mantine/notifications/styles.layer.css"` 를 둔다. `.layer.css` 는 `@layer mantine` 으로 감싸져 Tailwind preflight 보다 우선순위가 낮아지지 않도록 `@layer mantine, tailwind-base;` 순서를 명시한다. (Tailwind v4 preflight 가 button/input 리셋을 하므로 Mantine 이 뒤에 오게 한다.)

### 4.2 테마 브릿지 (`src/ui-provider/theme.ts`)

`variables.css` 의 값을 Mantine theme 으로 옮긴다.

- `primaryColor: "dmes"`, `colors.dmes` 는 `#337ab7` 기준 10단계(hover `#2a6499` 가 index 7 부근에 오도록 생성). `colors.danger` 는 `#d9534f` 기준.
- `defaultRadius: "sm"` (Mantine 9 기본 `md` 를 되돌림), `fontFamily` 는 현재 `form.css`/`page-layout.css` 의 한국어 폰트 스택 그대로.
- ERP 밀도: `components` 의 `defaultProps` 로 `TextInput/NativeSelect/Select/MultiSelect/DateInput/Textarea/Checkbox/Radio/Button` 에 `size: "xs"`, `Modal` 에 `centered: true`.
- `variables.css` 는 파일과 변수명을 유지하되 값을 Mantine CSS 변수의 별칭으로 바꾼다. 예: `--color-primary: var(--mantine-color-dmes-6)`. ag-grid 테마와 화면 잔존 CSS 가 자동으로 같은 색을 쓴다. `tests/unit/primary-color-consistency.unit.test.ts` 는 이 별칭 규칙에 맞게 갱신한다.
- ag-grid: `AgDataGrid` 의 테마를 ag-grid v33 Theming API(`themeQuartz.withParams`) 로 Mantine 변수(`--mantine-color-*`, `--mantine-font-family`, `--mantine-radius-sm`)에 연결한다. `grid.css` 의 색상 하드코딩을 변수 참조로 바꾸는 선에서 정리하고 구조는 유지한다.

### 4.3 Provider (`@dk-oasis/shared/ui-provider`)

```tsx
export function DmesUiProvider({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={dmesTheme} defaultColorScheme="light">
      <DatesProvider settings={{ locale: "ko", firstDayOfWeek: 0 }}>
        <Notifications position="top-right" />
        <ModalsProvider>
          <MessageProvider>{children}</MessageProvider>
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
export { dmesTheme } from "./theme";
export { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
```

- `m-mcm/app/layout.tsx`: `<html lang="ko" {...mantineHtmlProps}>`, `<head><ColorSchemeScript defaultColorScheme="light" /></head>`, `<body><DmesUiProvider>{children}</DmesUiProvider></body>`. `/portal`, `/popup/[...slug]`, `/login` 모두 root layout 아래이므로 한 번에 덮인다.
- `MessageProvider` 를 직접 감싸는 곳은 두 군데다: `m-mcm/app/portal/page.tsx:217` 과 `m-mcm/app/popup/[...slug]/page.tsx:91`. `DmesUiProvider` 가 root 에서 감싸므로 이 두 곳의 래핑을 제거한다(`useGfnMessage` import 는 유지).
- 라우트 layout 은 `app/layout.tsx` 와 `app/portal/layout.tsx` 둘뿐이다. `/popup/[...slug]` 도 root layout 아래이므로 별도 Provider 가 필요 없다.
- `m-design-dummy/src/main.tsx` 도 `DmesUiProvider` 로 감싼다.

### 4.4 컴포넌트 매핑

원칙: **파일·export 이름·props 인터페이스는 유지**한다. 내부 구현만 교체하고, 기존 CSS 클래스명은 e2e 나 화면 CSS 가 참조할 수 있으므로 루트 요소에 `className` 으로 함께 남긴다(`clsx`).

e2e(`e2e/*.spec.ts`)가 셀렉터로 쓰는 shared 클래스는 다음 13개다. 이 클래스는 **반드시 같은 역할의 요소에 남긴다**.

`.cm-message-modal-overlay` `.cm-modal` `.cm-modal-overlay` `.modal-overlay` (modal) · `.cm-tree` `.tree-item` (tree, sidebar) · `.content-panel` `.page-button` `.page-layout__header-buttons` (layout) · `.tab-bar` (portal-shell) · `.cm-data-grid` `.cm-grid-panel` `.grid-panel-count` (grid, lookup — 변경 없음)

`.ag-*` 클래스는 ag-grid 가 유지되므로 그대로다.

| shared export | 현재 | Mantine 9 구현 | 계약 유지 방법 |
|---|---|---|---|
| `form/Button` | button + .btn | `Button` | `variant`(primary/secondary/danger/…) → Mantine `variant`+`color` 매핑 표를 컴포넌트 안에 둔다. `size` sm/md/lg → xs/sm/md. |
| `form/Input` | input | `TextInput` | `onChange(value: string)` 유지. `error?: string` → `error` prop. |
| `form/Select` | select | `NativeSelect` | `options: SelectOption[]`·`placeholder` → `data`(placeholder 는 빈 value 옵션). 값은 string. |
| `form/ComboBox` | 자체 드롭다운 | `Select searchable` | `data/valueField/labelField` 를 `{value,label}[]` 로 변환. |
| `form/MultiSelectComboBox` | 자체 | `MultiSelect searchable` | 동일 변환, `value: string[]`. |
| `form/Checkbox`, `Radio` | input | `Checkbox`, `Radio.Group`+`Radio` | `RadioOption[]` 유지. |
| `form/DatePicker` | input[type=date] | `@mantine/dates DateInput` | value `'YYYY-MM-DD'` 문자열 그대로. `valueFormat="YYYY-MM-DD"`, `clearable`. |
| `form/Textarea` | textarea | `Textarea` | 동일. |
| `form/FormGroup` | div+label | `Input.Wrapper`(label/description/error) | a11y 테스트(`form-group-a11y`) 통과 유지: label `htmlFor` 연결. |
| `form/Spinner`, `LoadingOverlay`, `ProgressBar` | CSS 애니메이션 | `Loader`, `LoadingOverlay`, `Progress` | `ProgressStatus` 색 매핑. |
| `modal/Modal` | createPortal | `Modal` | `open/onClose/title/width/footer` 등 기존 props 유지. `modal-a11y` 테스트 통과(role=dialog, aria-labelledby, ESC, focus trap 은 Mantine 이 제공). |
| `modal/MessageModal`, `message-provider` | 자체 | `Modal` 기반 재구현, `useMessage/useGfnMessage/gfn_message` API 동일 | `AlertType` 별 아이콘은 `@tabler/icons-react`. confirm 은 Promise 반환 규약 유지. |
| `layout/ErrorModal` | Modal 래핑 | 위 Modal 재사용 | 변경 최소. |
| `tabs/Tabs` | 자체 | `Tabs` | `items/activeKey/onChange` 유지. |
| `tree/Tree` | 자체 | `Tree` + `useTree({ expandedState, selectedState })` | 기존 `TreeNode`(key/label/children/…) → `TreeNodeData`(value/label/children) 어댑터. 기존 `onSelect/onExpand/expandedKeys/selectedKey` props 를 제어 상태에 연결. 아이콘·체크박스 옵션은 `renderNode` 로. |
| `layout/PageLayout` | div+css | `Stack`/`Group`/`Title`/`Button` | 버튼 RBAC(`useUserButtonRbac`) 로직 그대로. 클래스명 `.page-layout` 등 유지. `page-layout-offline` 테스트 통과. |
| `layout/SearchArea`, `SearchField`, `SearchHistoryInput` | div+css | `Paper`+`Group`+`Grid`, 입력은 위 form 래퍼 재사용 | props 유지. search-history 로직 무변경. |
| `layout/ContentBody`, `ContentPanel`, `ResizableFormPanel`, `MaxHandle` | div+css | `Paper`/`Box` + 기존 리사이즈 로직 | `useContentMaximize` 유지. |
| `layout/DetailFormStyles` 상수 | inline style 객체 | Mantine 변수 참조 값으로 갱신 | 화면이 그대로 spread 하므로 키 유지. |
| `lookup/LookupModal`, `LookupTextField`, `LookupIconButton` | Modal + AgDataGrid | Mantine `Modal` 껍데기 + `AgDataGrid` 그대로, TextField 는 `TextInput` + `rightSection` 버튼 | `lookup-shortcuts` 테스트(키 단축키) 통과. |
| `portal-shell` Header/Sidebar/TabsBar/Dashboard/MenuSearchDialog/FavoriteFolderPickerModal | 자체 + css | `AppShell`(header/navbar/main), `NavLink`, `ScrollArea`, `Modal`, `ActionIcon`, `Menu` | `portal-shell.tsx` 의 상태·탭 이력·즐겨찾기 로직은 손대지 않고 표현 컴포넌트만 교체. `tabs-bar-*`, `portal-shell-*`, `use-tab-history` 테스트 통과. |
| `auth-login-form` | form + css | `Paper`, `TextInput`, `PasswordInput`, `Checkbox`, `Button` | `signIn("credentials", { userId, password })` 흐름과 필드 name 유지. e2e 로그인 셀렉터(`getByLabel`/`getByRole`) 유지. |
| `grid/AgDataGrid`, `GridPanel`, `GridBadge`, `GridHelpButton`, `Pagination`, `CustomDataGrid`, 훅 2종 | — | **변경 없음**(테마 연결만). `Pagination` 은 Mantine `Pagination` 으로 교체 가능하나 1단계에서는 유지. | |
| `grid/MuiDataGrid` | MUI | **삭제** | grid/index.ts export 제거, 문서에서 제거. |
| `charts/*`, `matrix-table`, `error-boundary` | SVG/자체 | 변경 없음 | |

### 4.5 CSS 서브패스 export

`./form.css`, `./modal.css`, `./tree.css`, `./layout.css`, `./portal-shell.css`, `./auth-login-form.css`, `./variables.css`, `./grid.css` 는 **파일과 export 를 모두 유지**한다. 화면이 import 하는 경로를 깨지 않기 위해서다. 내용은 다음으로 줄인다.

- Mantine 이 담당하는 기본 스타일(입력·버튼·모달 외형)은 삭제.
- 남기는 것: 레이아웃 전용 규칙(페이지 프레임·검색 영역 그리드·리사이즈 핸들), Mantine 위에 얹는 ERP 밀도 오버라이드, 화면이 참조하는 유틸 클래스, ag-grid 오버라이드.
- 삭제 전 `grep -r "클래스명" m-mcm m-mpn m-mqc m-mls m-mpp m-analog e2e` 로 참조 0건을 확인한다. 참조가 있으면 남긴다.

## 5. 오류 처리·경계 조건

- Mantine 컴포넌트는 `'use client'` 가 붙어 있다. shared 의 각 컴포넌트 파일 상단에 `"use client"` 를 명시해 Next 16 서버 컴포넌트 경계에서 실패하지 않게 한다. tsup 은 directive 를 보존한다(`banner` 불필요, 각 파일 상단 유지 확인).
- `DateInput` 에 잘못된 문자열이 오면 `null` 로 정규화하고 `onChange("")` 를 호출한다(현행 input[type=date] 와 같은 결과).
- `NativeSelect` 에 `options` 에 없는 value 가 오면 빈 옵션을 선택 상태로 둔다(현행 동작 유지).
- Provider 가 없는 환경(단위 테스트)에서도 컴포넌트가 렌더되도록 vitest `setup` 에 `MantineProvider` 래퍼 `render` 헬퍼를 둔다. `window.matchMedia`, `ResizeObserver` 폴리필을 setup 에 추가한다.
- 팝업 라우트 `/popup/[...slug]` 는 별도 창으로 열리므로 root layout 을 공유하는지 확인한다. 공유하지 않으면 그 layout 에도 `DmesUiProvider` 를 둔다.

## 6. 검증

1. `pnpm --filter @dk-oasis/shared lint && pnpm --filter @dk-oasis/shared test:unit` — 기존 17개 + 신규 계약 테스트 통과.
2. 신규 단위 테스트(컴포넌트별 최소 1개): props 왕복(value/onChange), a11y role/label, 기존 클래스명 존재. 파일 위치 `shared/tests/unit/mantine-*.unit.test.ts`.
3. `pnpm build:libs` 성공, `pnpm --filter @dk-oasis/mcm lint`(tsc) 통과.
4. 포털 기동(`./local-run.sh` 또는 5001 우회) → `admin/admin123` 로그인 → 공통관리 › 시스템관리 › 사용자 관리 열기 → 조회·행 선택·상세 폼·LOV 팝업·저장 확인 메시지까지 스크린샷으로 확인.
5. Playwright: `e2e/` 중 로그인·메뉴·사용자 관리·마스터코드 관련 spec 을 우선 실행. ag-grid 클래스 셀렉터는 그리드가 유지되므로 영향 없음이 기대값이다. 실패 시 셀렉터가 아니라 구현을 고친다(계약 유지 원칙).

## 7. 문서·ADR·샌드박스

- ADR: 전 모듈 횡단 결정을 담을 `docs/guide/adr/` 를 신설하고 `0001-ui-library-mantine9-aggrid.md` 를 `adr-write` 스킬 규약(필수 절, 상태, 인덱스)으로 작성한다. `docs/guide/adr/README.md` 인덱스도 만든다. 모듈별 ADR 규칙(`docs/{module}/design/adr/`)은 그대로 두고, 공통 결정은 이 위치를 쓴다고 `adr-write` SKILL.md 에 한 줄 추가한다.
- `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md:127-176`: export 목록에서 `MuiDataGrid` 제거, "구현 기반: Mantine 9(그리드는 ag-grid-community)" 명시, `@mantine/*` 직접 import 금지 규칙 추가(현행 `ag-grid-react` 직접 import 금지와 같은 취지), `ui-provider` 사용 규칙 추가.
- `docs/guide/FrontEnd/Portal-Development-Guide.md:42` 주석 갱신, root layout Provider 설명 추가.
- `docs/guide/design/templates/디자인설계서.template.md`, `docs/guide/design/ui-design/01-overview-and-rules.md`, `02-writing-and-dev-link.md`: 컴포넌트명은 유지되므로 "구현 기반" 한 줄과 `MuiDataGrid` 언급 제거만.
- `src/frontend/m-design-dummy/DESIGN-HANDOFF.md`, `README.md`: Mantine 기반임을 명시, Provider 추가.
- `docs/guide/FrontEnd/README.md` 에 ADR 링크.

## 8. 작업 분할과 병렬 실행

기반(직렬, 리드가 수행, 커밋 1개)

- 4.1 패키지·tsup·postcss, 4.2 theme.ts·variables.css 별칭, 4.3 ui-provider·root layout, MuiDataGrid 삭제, vitest setup 헬퍼. 이 커밋이 끝나야 아래가 시작된다.

병렬(파일 단위로 겹치지 않음, 각각 독립 브랜치 없이 같은 워크트리에서 서로 다른 디렉터리만 편집)

| 작업 | 대상 파일 | 모델 |
|---|---|---|
| P1 폼 13종 | `components/form/*`, `form.css`, 테스트 `mantine-form.*` | sonnet |
| P2 모달·메시지·ErrorModal·lookup 껍데기 | `components/modal.tsx`, `message-provider.tsx`, `modal.css`, `layout/ErrorModal.tsx`, `components/lookup/*` | sonnet |
| P3 탭·트리·레이아웃 | `components/tabs/*`, `components/tree/*`, `tree.css`, `layout/*`(ErrorModal 제외), `page-layout.css` | sonnet |
| P4 포털 셸·로그인 | `portal-shell/**`, `portal-shell.css`, `auth/login-form.tsx`, `login-form.css` | opus |
| P5 ag-grid 테마 브릿지 | `components/grid/AgDataGrid.tsx`(테마 부분만), `grid.css` | sonnet |
| P6 문서·ADR·샌드박스 | 7절 전체, `m-design-dummy/**` | haiku (ADR 본문은 sonnet) |

통합(리드): 빌드 → 단위 테스트 → 포털 기동·스크린샷 → e2e 일부 → 커밋.

각 병렬 작업의 완료 기준: 담당 파일의 단위 테스트 통과, `pnpm --filter @dk-oasis/shared lint` 통과, 담당 CSS 에서 삭제한 클래스의 외부 참조 0건 확인 보고.

## 9. 리스크

- Tailwind v4 preflight 와 Mantine 스타일 충돌: `@layer` 순서로 해결. 확인은 로그인 화면·사용자 관리 화면 스크린샷.
- `Tree` 의 기존 API(key 기반)와 Mantine `TreeNodeData`(value 기반) 어댑터에서 키 충돌: value 유일성 검사 후 경고 로그.
- `portal-shell.tsx`(28KB) 는 로직과 표현이 섞여 있어 표현만 분리하는 데 실수 여지가 크다. opus 배정, 기존 테스트 4개 통과를 게이트로 둔다.
- e2e 가 쓰는 shared 클래스 13개(4.4 절)는 요소에 그대로 남긴다. Mantine `Modal` 은 자체 overlay 요소를 만들므로 `.cm-modal-overlay`/`.cm-message-modal-overlay` 는 Mantine `Modal.Overlay` 의 `className` 으로, `.cm-modal` 은 `Modal.Content` 의 `className` 으로 부여한다.
