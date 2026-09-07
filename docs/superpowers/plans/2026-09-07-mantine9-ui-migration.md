# Mantine 9 공통 UI 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@dk-oasis/shared` 의 그리드 외 UI 컴포넌트 내부를 Mantine 9 로 재구현하되 export 이름·props·CSS 서브패스 계약을 유지해 화면 코드와 e2e 가 바뀌지 않게 한다.

**Architecture:** 호스트(m-mcm) root layout 에 `DmesUiProvider`(MantineProvider + Dates + Notifications + Modals + MessageProvider) 를 한 번 감싼다. shared 의 각 컴포넌트는 파일·export·props 를 그대로 두고 내부만 Mantine 으로 바꾸며, 기존 CSS 클래스명은 루트 요소에 `clsx` 로 남긴다. 디자인 토큰은 `theme.ts` 로 옮기고 `variables.css` 는 Mantine 변수의 별칭이 된다. ag-grid 는 그대로 두고 색만 토큰에 연결한다.

**Tech Stack:** Next 16.1.6 · React 19.2.3 · TypeScript 5.9 · pnpm 10 · tsup 8 · vitest 3 + happy-dom · Mantine 9.6 (`core/hooks/dates/notifications/modals`) · dayjs · @tabler/icons-react · clsx · ag-grid-community 33 · Tailwind v4(호스트) · postcss-preset-mantine

**Spec:** `docs/superpowers/specs/2026-09-07-mantine9-ui-migration-design.md`

## Global Constraints

- Mantine 패키지 버전은 전부 `^9.6.0` 으로 고정하고 shared 는 peerDependencies + devDependencies, 호스트(m-mcm, m-design-dummy)는 dependencies 로 선언한다.
- `@dk-oasis/shared/*` 의 export 이름·props 인터페이스·CSS 서브패스(`./form.css` 등)는 바꾸지 않는다. 새 export 는 `./ui-provider` 하나만 추가한다.
- e2e 가 쓰는 shared 클래스 13개는 같은 역할의 요소에 반드시 남긴다: `.cm-message-modal-overlay` `.cm-modal` `.cm-modal-overlay` `.modal-overlay` `.cm-tree` `.tree-item` `.content-panel` `.page-button` `.page-layout__header-buttons` `.tab-bar` `.cm-data-grid` `.cm-grid-panel` `.grid-panel-count`.
- shared 의 CSS 파일에서 Mantine 전용 PostCSS 문법(`rem()`, `light-dark()`, `$mantine-breakpoint-*`)을 쓰지 않는다(tsup 은 CSS 를 그대로 복사한다).
- Mantine 컴포넌트를 쓰는 shared 파일은 첫 줄에 `"use client";` 를 둔다.
- 화면 모듈(m-mcm/page-components, m-mpn, m-mqc, m-mls, m-mpp, m-analog)의 코드는 건드리지 않는다. 예외는 `m-mcm/app/layout.tsx`, `m-mcm/app/portal/page.tsx`, `m-mcm/app/popup/[...slug]/page.tsx` 의 Provider 정리, `m-mcm/postcss.config.mjs`, `m-mcm/app/globals.css`, `m-mcm/package.json` 뿐이다.
- 테스트 파일은 `shared/tests/unit/*.unit.test.ts`(확장자 `.ts`, `createElement` 사용, `/** @vitest-environment happy-dom */` 헤더) 규칙을 따른다. vitest include 가 `tests/**/*.test.ts` 라 `.tsx` 는 실행되지 않는다.
- 커밋 메시지는 Conventional Commits `type(scope): subject` 한국어 본문. scope 는 `shared`, `m-mcm`, `docs` 등.
- 각 병렬 작업은 자기 담당 파일만 수정한다. 담당 밖 파일이 바뀌어야 하면 리드에게 보고하고 멈춘다.

---

## 파일 구조

```
src/frontend/shared/
  package.json                 T0 (deps 교체, exports 추가)
  tsup.config.ts               T0 (entry ui-provider, external)
  vitest.config.ts             T0 (setupFiles)
  tests/setup.ts               T0 (matchMedia/ResizeObserver 폴리필)
  tests/unit/mantine-test-utils.ts  T0 (Provider 감싼 render 헬퍼)
  src/ui-provider/
    index.tsx                  T0  DmesUiProvider, ColorSchemeScript, mantineHtmlProps 재노출
    theme.ts                   T0  dmesTheme
  src/styles/variables.css     T0  Mantine 변수 별칭
  src/components/grid/
    MuiDataGrid.tsx            T0  삭제
    index.ts                   T0  MuiDataGrid export 제거
    grid.css                   P5  색상 토큰화
  src/components/form/*.tsx    P1
  src/components/form/form.css P1
  src/components/modal.tsx     P2
  src/components/modal.css     P2
  src/components/message-provider.tsx  P2
  src/layout/ErrorModal.tsx    P2
  src/components/lookup/*.tsx  P2
  src/components/tabs/Tabs.tsx P3
  src/components/tree/Tree.tsx, tree.css  P3
  src/layout/*.tsx (ErrorModal 제외), page-layout.css, DetailFormStyles.ts  P3
  src/portal-shell/** , portal-shell.css  P4
  src/auth/login-form.tsx, login-form.css  P4
src/frontend/m-mcm/
  package.json, postcss.config.mjs, app/globals.css, app/layout.tsx  T0
  app/portal/page.tsx, app/popup/[...slug]/page.tsx  T0 (MessageProvider 래핑 제거)
src/frontend/m-design-dummy/  P6
docs/guide/adr/, docs/guide/FrontEnd/**, docs/guide/design/**  P6
```

---

## T0: 기반 (리드가 직렬 수행)

**Files:**
- Modify: `src/frontend/shared/package.json`
- Modify: `src/frontend/shared/tsup.config.ts`
- Modify: `src/frontend/shared/vitest.config.ts`
- Create: `src/frontend/shared/tests/setup.ts`
- Create: `src/frontend/shared/tests/unit/mantine-test-utils.ts`
- Create: `src/frontend/shared/src/ui-provider/theme.ts`
- Create: `src/frontend/shared/src/ui-provider/index.tsx`
- Modify: `src/frontend/shared/src/styles/variables.css`
- Delete: `src/frontend/shared/src/components/grid/MuiDataGrid.tsx`
- Modify: `src/frontend/shared/src/components/grid/index.ts`
- Modify: `src/frontend/m-mcm/package.json`, `postcss.config.mjs`, `app/globals.css`, `app/layout.tsx`, `app/portal/page.tsx`, `app/popup/[...slug]/page.tsx`
- Test: `src/frontend/shared/tests/unit/ui-provider.unit.test.ts`

**Interfaces:**
- Produces: `DmesUiProvider({ children })`, `dmesTheme: MantineThemeOverride`, `renderWithMantine(element): { host, root, unmount }` (테스트 헬퍼), CSS 변수 별칭 `--color-primary` 등.

- [ ] **Step 1: 의존성 교체**

```bash
cd src/frontend/shared
pnpm remove @mui/material @mui/x-data-grid @emotion/react @emotion/styled
pnpm add -D @mantine/core@^9.6.0 @mantine/hooks@^9.6.0 @mantine/dates@^9.6.0 @mantine/notifications@^9.6.0 @mantine/modals@^9.6.0 dayjs @tabler/icons-react clsx
cd ../m-mcm
pnpm add @mantine/core@^9.6.0 @mantine/hooks@^9.6.0 @mantine/dates@^9.6.0 @mantine/notifications@^9.6.0 @mantine/modals@^9.6.0 dayjs @tabler/icons-react clsx
pnpm add -D postcss-preset-mantine postcss-simple-vars
```

`shared/package.json` 을 직접 편집한다.

```json
"peerDependencies": {
  "@mantine/core": "^9.6.0",
  "@mantine/dates": "^9.6.0",
  "@mantine/hooks": "^9.6.0",
  "@mantine/modals": "^9.6.0",
  "@mantine/notifications": "^9.6.0",
  "ag-grid-community": "^33.0.0",
  "ag-grid-react": "^33.0.0",
  "react": "^19.2.0",
  "react-dom": "^19.2.0"
},
"peerDependenciesMeta": {
  "ag-grid-community": { "optional": true },
  "ag-grid-react": { "optional": true }
}
```

`exports` 에 추가:

```json
"./ui-provider": { "types": "./dist/ui-provider.d.ts", "import": "./dist/ui-provider.js" }
```

(기존 exports 항목의 형식을 열어 보고 같은 형태로 맞춘다. `./modal` 항목을 복사해 이름만 바꾸면 된다.)

- [ ] **Step 2: tsup 설정**

`tsup.config.ts` 의 `entry` 에 `"ui-provider": "src/ui-provider/index.tsx"` 추가. `external` 에서 `@mui/x-data-grid`, `@mui/material`, `@emotion/react`, `@emotion/styled` 를 제거하고 다음을 추가:

```ts
"@mantine/core",
"@mantine/hooks",
"@mantine/dates",
"@mantine/notifications",
"@mantine/modals",
"dayjs",
"@tabler/icons-react",
"clsx",
```

- [ ] **Step 3: MuiDataGrid 삭제**

```bash
git rm src/frontend/shared/src/components/grid/MuiDataGrid.tsx
```

`src/components/grid/index.ts` 에서 `MuiDataGrid` 관련 export 줄을 지운다. `grep -rn MuiDataGrid src tests` 가 0건인지 확인한다.

- [ ] **Step 4: 테스트 setup 과 헬퍼**

`vitest.config.ts` 의 `test` 에 `setupFiles: ["tests/setup.ts"]` 추가.

`tests/setup.ts`:

```ts
// happy-dom 에 없는 브라우저 API 를 Mantine 이 요구한다.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (!("ResizeObserver" in window)) {
    class RO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  }
  if (!window.scrollTo) window.scrollTo = () => {};
}
```

`tests/unit/mantine-test-utils.ts`:

```ts
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { dmesTheme } from "../../src/ui-provider/theme";

export interface Rendered {
  host: HTMLDivElement;
  root: Root;
  unmount: () => void;
}

/** MantineProvider 로 감싸 렌더한다. 각 테스트는 unmount() 로 정리한다. */
export function renderWithMantine(element: ReactElement): Rendered {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(MantineProvider, { theme: dmesTheme }, element));
  });
  return {
    host,
    root,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

export function rerender(r: Rendered, element: ReactElement) {
  act(() => {
    r.root.render(createElement(MantineProvider, { theme: dmesTheme }, element));
  });
}
```

- [ ] **Step 5: theme.ts**

```ts
import { createTheme, type MantineColorsTuple } from "@mantine/core";

// variables.css 의 --color-primary #337ab7 / hover #2a6499 를 index 6 / 7 에 둔다.
const dmes: MantineColorsTuple = [
  "#e8f1f9", "#d0e2f2", "#a9c9e6", "#7fafd9", "#5c98cd",
  "#4487c2", "#337ab7", "#2a6499", "#22507a", "#1a3d5c",
];
// --color-danger #d9534f / hover #c9302c
const danger: MantineColorsTuple = [
  "#fbeaea", "#f6d3d2", "#eeaba9", "#e58480", "#df6561",
  "#db5450", "#d9534f", "#c9302c", "#a82824", "#7f1e1b",
];

export const dmesTheme = createTheme({
  primaryColor: "dmes",
  primaryShade: 6,
  colors: { dmes, danger },
  defaultRadius: "sm",
  fontFamily:
    '"Pretendard", "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", -apple-system, sans-serif',
  fontSizes: { xs: "12px", sm: "13px", md: "14px", lg: "16px", xl: "18px" },
  components: {
    Button: { defaultProps: { size: "xs" } },
    TextInput: { defaultProps: { size: "xs" } },
    NativeSelect: { defaultProps: { size: "xs" } },
    Select: { defaultProps: { size: "xs" } },
    MultiSelect: { defaultProps: { size: "xs" } },
    Textarea: { defaultProps: { size: "xs" } },
    Checkbox: { defaultProps: { size: "xs" } },
    Radio: { defaultProps: { size: "xs" } },
    DateInput: { defaultProps: { size: "xs" } },
    Modal: { defaultProps: { centered: true, radius: "sm" } },
    Tabs: { defaultProps: { variant: "default" } },
  },
});
```

fontFamily 는 `form.css`/`page-layout.css` 에 있는 실제 스택을 grep 해서 같은 값으로 맞춘다(`grep -n "font-family" src/components/form/form.css src/layout/page-layout.css`).

- [ ] **Step 6: ui-provider/index.tsx**

```tsx
"use client";

import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import "dayjs/locale/ko";
import { MessageProvider } from "../components/message-provider";
import { dmesTheme } from "./theme";

export { dmesTheme } from "./theme";
export { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";

export function DmesUiProvider({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={dmesTheme} defaultColorScheme="light">
      <DatesProvider settings={{ locale: "ko", firstDayOfWeek: 0 }}>
        <Notifications position="top-right" zIndex={10000} />
        <ModalsProvider>
          <MessageProvider>{children}</MessageProvider>
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
```

- [ ] **Step 7: variables.css 별칭화**

`:root` 의 색상 변수를 Mantine 변수 별칭으로 바꾼다. 변수명은 전부 유지한다.

```css
:root {
  --color-primary: var(--mantine-color-dmes-6, #337ab7);
  --color-primary-hover: var(--mantine-color-dmes-7, #2a6499);
  --color-danger: var(--mantine-color-danger-6, #d9534f);
  --color-danger-hover: var(--mantine-color-danger-7, #c9302c);
  --color-text: var(--mantine-color-text, #333);
  --color-text-muted: var(--mantine-color-dimmed, #666);
  /* 나머지 변수는 기존 값 유지. 위 6개만 별칭으로 바꾼다. */
}
```

`tests/unit/primary-color-consistency.unit.test.ts` 는 P1/P2 가 CSS 를 갈아엎으면 실패하므로, T0 에서 다음처럼 바꾼다: `.cm-btn-primary` 규칙 검사 두 개를 삭제하고 대신 `variables.css` 가 `--color-primary: var(--mantine-color-dmes-6` 를 포함하는지 검사한다. `tabs`/`error-boundary` 의 `#1a73e8`, `#1976d2` 부재 검사는 유지한다.

- [ ] **Step 8: 호스트 m-mcm**

`postcss.config.mjs`:

```js
const config = {
  plugins: {
    "postcss-preset-mantine": {},
    "postcss-simple-vars": {
      variables: {
        "mantine-breakpoint-xs": "36em",
        "mantine-breakpoint-sm": "48em",
        "mantine-breakpoint-md": "62em",
        "mantine-breakpoint-lg": "75em",
        "mantine-breakpoint-xl": "88em",
      },
    },
    "@tailwindcss/postcss": {},
  },
};
export default config;
```

`app/globals.css` 첫 줄들:

```css
@layer mantine, theme, base, components, utilities;
@import "@mantine/core/styles.layer.css";
@import "@mantine/dates/styles.layer.css";
@import "@mantine/notifications/styles.layer.css";
@import "tailwindcss";
@import "@dk-oasis/shared/variables.css";
@import "./page-layout.css";
@source "../../shared/src";
```

Tailwind v4 는 `theme, base, components, utilities` 층을 쓴다. `mantine` 을 그 앞에 선언하면 Tailwind preflight(base)가 Mantine 보다 우선한다. 스크린샷에서 버튼 배경이 사라지면 순서를 `@layer theme, base, mantine, components, utilities;` 로 바꾼다. 둘 중 무엇을 택했는지 커밋 본문에 적는다.

`app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import { ColorSchemeScript, DmesUiProvider, mantineHtmlProps } from "@dk-oasis/shared/ui-provider";
import "./globals.css";

// metadata, viewport 는 기존 그대로

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body className="m-0">
        <DmesUiProvider>{children}</DmesUiProvider>
      </body>
    </html>
  );
}
```

`app/portal/page.tsx:217-219` 와 `app/popup/[...slug]/page.tsx:91-93` 의 `<MessageProvider>...</MessageProvider>` 래핑을 풀고 자식만 남긴다. `MessageProvider` import 는 제거하고 `useGfnMessage` import 는 유지한다.

- [ ] **Step 9: Provider 테스트 작성**

`tests/unit/ui-provider.unit.test.ts`:

```ts
/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { DmesUiProvider } from "../../src/ui-provider";
import { useMessage } from "../../src/components/message-provider";

function Probe() {
  const { showMessage } = useMessage();
  return createElement("span", { "data-ok": typeof showMessage === "function" ? "1" : "0" }, "probe");
}

describe("DmesUiProvider", () => {
  it("MessageProvider 를 포함해 useMessage 가 동작한다", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(createElement(DmesUiProvider, null, createElement(Probe)));
    });
    expect(host.querySelector("span")?.getAttribute("data-ok")).toBe("1");
    act(() => root.unmount());
    host.remove();
  });

  it("dmes 팔레트 CSS 변수를 주입한다", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(createElement(DmesUiProvider, null, createElement("i")));
    });
    const style = document.querySelector("style[data-mantine-styles]")?.textContent ?? "";
    expect(style).toContain("--mantine-color-dmes-6: #337ab7");
    act(() => root.unmount());
    host.remove();
  });
});
```

- [ ] **Step 10: 실행·검증**

```bash
cd src/frontend && pnpm install
pnpm --filter @dk-oasis/shared test:unit
pnpm --filter @dk-oasis/shared lint
pnpm --filter @dk-oasis/shared build
pnpm --filter @dk-oasis/mcm lint
```

기대: 기존 17개 + 신규 2개 통과, tsc 통과, dist/ui-provider.js 생성.

- [ ] **Step 11: 커밋**

```bash
git add -A src/frontend/shared src/frontend/m-mcm src/frontend/pnpm-lock.yaml
git commit -m "feat(shared): Mantine 9 기반 도입 — ui-provider·테마·MUI 제거"
```

---

## P1: 폼 13종 (sonnet)

**Files:**
- Modify: `src/frontend/shared/src/components/form/{Button,Input,Select,Checkbox,DatePicker,Radio,Textarea,FormGroup,ComboBox,MultiSelectComboBox,Spinner,LoadingOverlay,ProgressBar}.tsx`
- Modify: `src/frontend/shared/src/components/form/form.css`
- Test: `src/frontend/shared/tests/unit/mantine-form.unit.test.ts`
- 유지: `tests/unit/form-group-a11y.unit.test.ts` 통과

**Interfaces:**
- Consumes: `renderWithMantine`, `rerender` (T0).
- Produces: 아래 각 컴포넌트의 기존 props 인터페이스 그대로. `form/index.ts` 는 수정하지 않는다.

**계약 (변경 금지, 원문)**

```ts
// Button
export type ButtonVariant = "default" | "primary" | "danger";
export type ButtonSize = "default" | "sm" | "mini";
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  children?: ReactNode; variant?: ButtonVariant; size?: ButtonSize;
  type?: "button" | "submit" | "reset"; ariaLabel?: string;
}
// Input / Textarea
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value?: string | number; onChange?: (value: string) => void; error?: string;
}
// Select
export type SelectOption = string | { value: string; label: string };
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  value?: string | number; onChange?: (value: string) => void; options?: SelectOption[];
  placeholder?: string; error?: string;
}
// DatePicker
export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  value?: string; onChange?: (value: string) => void; error?: string;
}
// Checkbox
export interface CheckboxProps { id?: string; checked?: boolean; onChange?: (checked: boolean) => void;
  label?: string; disabled?: boolean; className?: string; style?: CSSProperties;
  "aria-label"?: string; "aria-labelledby"?: string; "aria-describedby"?: string; "aria-invalid"?: boolean; }
// Radio
export type RadioOption = string | { value: string; label: string };
export interface RadioProps { id?: string; name?: string; value?: string | number; onChange?: (value: string) => void;
  options?: RadioOption[]; disabled?: boolean; className?: string; style?: CSSProperties; /* aria-* 4종 */ }
// FormGroup
export interface FormGroupProps { label?: string; required?: boolean; children?: ReactNode; className?: string;
  labelWidth?: number; style?: CSSProperties; error?: string; tip?: string; }
// ComboBox / MultiSelectComboBox: 파일 상단 인터페이스 원문 유지 (data/valueField/labelField/value/onChange/... onCreateNew/createLabel/maxVisible)
// Spinner / LoadingOverlay / ProgressBar: 파일 상단 인터페이스 원문 유지
```

**매핑 규칙**

| 컴포넌트 | Mantine | 규칙 |
|---|---|---|
| Button | `Button` | variant default→`variant="default"`, primary→`variant="filled" color="dmes"`, danger→`variant="filled" color="danger"`. size default→`sm`, sm→`xs`, mini→`compact-xs`. 루트 className `form-button form-button--{variant} form-button--{size}` 유지(기존 클래스 산출식을 그대로 옮긴다). `ariaLabel`→`aria-label`. |
| Input | `TextInput` | `onChange={(e) => onChange?.(e.currentTarget.value)}`, `error` 는 문자열 그대로. className `form-input` + error 시 `form-error`. 나머지 HTML attrs spread. |
| Textarea | `Textarea` | Input 과 동일, `autosize={false}`, `rows` 전달. |
| Select | `NativeSelect` | `data` 는 `placeholder` 가 있으면 `[{value:"",label:placeholder,disabled:false}, ...options]`. 문자열 옵션은 `{value:s,label:s}`. `value={String(value ?? "")}`. |
| Checkbox | `Checkbox` | `onChange={(e)=>onChange?.(e.currentTarget.checked)}`, label 전달, wrapper className `form-checkbox-label`, input className `form-checkbox`(`classNames={{ input: "form-checkbox", root: ... }}`). |
| Radio | `Radio.Group` + `Radio` | `value={String(value ?? "")}`, `onChange={(v)=>onChange?.(v)}`, name 전달. 옵션 문자열 정규화. 루트 className `form-radio-group`. |
| DatePicker | `DateInput`(@mantine/dates) | `value={value || null}` (문자열), `onChange={(v)=>onChange?.(v ?? "")}`, `valueFormat="YYYY-MM-DD"`, `clearable`, `placeholder="YYYY-MM-DD"`. `InputHTMLAttributes` 중 `disabled/readOnly/id/name/placeholder/style/className` 만 전달하고 나머지는 무시한다(타입은 유지). |
| FormGroup | `Input.Wrapper` | `label`, `required`(`withAsterisk`), `error`, `description` 대신 tip 은 기존 hover 툴팁 로직 유지(`Tooltip` 으로 교체 가능). `labelWidth` 는 `style={{ "--form-label-width": labelWidth+"px" }}` 로 유지. a11y: `Input.Wrapper` 가 `label htmlFor` 를 자식 input `id` 와 연결하려면 `id` 를 `React.cloneElement` 로 주입하던 기존 방식을 그대로 둔다. |
| ComboBox | `Select searchable` | `data` = `data.map(d => typeof d==="string" ? {value:d,label:d} : {value:String(d[valueField]), label:String(d[labelField])})`, `limit={maxVisible}`, `onChange={(v)=>onChange?.(v ?? "", original)}`. `onCreateNew` 는 `nothingFoundMessage` 를 버튼으로 렌더해 클릭 시 호출. `readOnly` 는 `readOnly` prop. |
| MultiSelectComboBox | `MultiSelect searchable` | 동일 변환, `value: string[]`. |
| Spinner | `Loader` | `size`(px 숫자 그대로), `color`, overlay 모드는 `Overlay` + 중앙 정렬 div. className `oasis-spinner`. |
| LoadingOverlay | `LoadingOverlay` | `visible`, `overlayProps={{ backgroundOpacity }}`, `zIndex`, `loaderProps={{ size, children: label }}`. scope fullscreen 은 `pos="fixed"`. |
| ProgressBar | `Progress` | `value` 없고 running 이면 `animated striped value={100}`, 색은 status 별(dmes/danger/green), `hideWhenIdle` 유지, label 은 아래 `Text size="xs"`. className `oasis-progress`. |

**CSS**: `form.css` 에서 위 컴포넌트의 외형 규칙(배경·테두리·패딩·포커스)을 삭제하고, 남길 것: 레이아웃 유틸(`.form-group` 격자·`--form-label-width`), `.form-error-message`, `.search-history-*`(SearchHistoryInput 이 `form-input` 클래스를 쓰므로 `.form-input` 최소 규칙은 남긴다). 삭제 전 각 클래스를 `grep -rn "클래스명" src/frontend/m-mcm src/frontend/m-mpn src/frontend/m-mqc src/frontend/m-mls src/frontend/m-mpp src/frontend/m-analog src/frontend/e2e` 로 확인하고 참조가 있으면 남긴다.

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/unit/mantine-form.unit.test.ts`

```ts
/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, Checkbox, DatePicker, Input, Radio, Select, Textarea } from "../../src/components/form";
import { renderWithMantine } from "./mantine-test-utils";

describe("form (Mantine 구현) 계약", () => {
  it("Input 은 onChange(value: string) 로 문자열을 돌려주고 form-input 클래스를 유지한다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(Input, { value: "a", onChange, id: "f1" }));
    const input = r.host.querySelector("input#f1") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.className).toContain("form-input");
    act(() => {
      input.value = "ab";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("ab");
    r.unmount();
  });

  it("Input error 는 role=alert 메시지를 렌더한다", () => {
    const r = renderWithMantine(createElement(Input, { value: "", error: "필수" }));
    expect(r.host.querySelector('[role="alert"]')?.textContent).toContain("필수");
    r.unmount();
  });

  it("Select 는 placeholder 를 빈 값 옵션으로 두고 string 값을 돌려준다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(
      createElement(Select, { value: "", onChange, placeholder: "선택", options: ["A", { value: "b", label: "B" }] }),
    );
    const sel = r.host.querySelector("select") as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(["", "A", "b"]);
    act(() => {
      sel.value = "b";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("b");
    r.unmount();
  });

  it("Button variant/size 를 Mantine 으로 매핑하면서 form-button 클래스를 유지한다", () => {
    const onClick = vi.fn();
    const r = renderWithMantine(createElement(Button, { variant: "primary", size: "sm", onClick }, "저장"));
    const btn = r.host.querySelector("button") as HTMLButtonElement;
    expect(btn.className).toContain("form-button");
    expect(btn.textContent).toContain("저장");
    act(() => btn.click());
    expect(onClick).toHaveBeenCalled();
    r.unmount();
  });

  it("Checkbox 는 onChange(checked: boolean) 을 돌려준다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(Checkbox, { checked: false, onChange, label: "사용" }));
    const cb = r.host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    act(() => cb.click());
    expect(onChange).toHaveBeenCalledWith(true);
    r.unmount();
  });

  it("Radio 는 options 의 value 를 돌려준다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(Radio, { value: "Y", onChange, options: ["Y", { value: "N", label: "아니오" }] }));
    const radios = r.host.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(2);
    act(() => (radios[1] as HTMLInputElement).click());
    expect(onChange).toHaveBeenCalledWith("N");
    r.unmount();
  });

  it("DatePicker 는 YYYY-MM-DD 문자열을 주고받는다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(DatePicker, { value: "2026-09-07", onChange, id: "d1" }));
    const input = r.host.querySelector("input#d1") as HTMLInputElement;
    expect(input.value).toContain("2026");
    r.unmount();
  });

  it("Textarea 는 onChange(value: string) 을 돌려준다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(Textarea, { value: "", onChange }));
    const ta = r.host.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      ta.value = "x";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("x");
    r.unmount();
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter @dk-oasis/shared test:unit -- mantine-form` → Mantine 요소가 없어 querySelector/className 단언에서 FAIL.

- [ ] **Step 3: 구현** — 대표 코드. 나머지는 매핑 규칙대로 같은 형태로 작성한다.

`Input.tsx`:

```tsx
"use client";

import { type InputHTMLAttributes, useId } from "react";
import { TextInput } from "@mantine/core";
import clsx from "clsx";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value?: string | number;
  onChange?: (value: string) => void;
  error?: string;
}

export function Input({ id, value = "", onChange, error, className = "", disabled, readOnly, style, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  return (
    <TextInput
      id={inputId}
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.currentTarget.value)}
      disabled={disabled}
      readOnly={readOnly}
      error={error ? <span id={errorId} className="form-error-message" role="alert">{error}</span> : undefined}
      aria-invalid={error ? true : rest["aria-invalid"]}
      aria-describedby={error ? errorId : rest["aria-describedby"]}
      classNames={{ input: clsx("form-input", error && "form-error", className) }}
      style={style}
      {...(rest as object)}
    />
  );
}
```

`Select.tsx`:

```tsx
"use client";

import { type SelectHTMLAttributes, useId } from "react";
import { NativeSelect } from "@mantine/core";
import clsx from "clsx";

export type SelectOption = string | { value: string; label: string };

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  value?: string | number;
  onChange?: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
  error?: string;
}

export function Select({ id, value = "", onChange, options = [], placeholder, error, className = "", disabled, style, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const errorId = `${selectId}-error`;
  const data = [
    ...(placeholder ? [{ value: "", label: placeholder }] : []),
    ...options.map((o) => (typeof o === "string" ? { value: o, label: o } : o)),
  ];
  return (
    <NativeSelect
      id={selectId}
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.currentTarget.value)}
      data={data}
      disabled={disabled}
      error={error ? <span id={errorId} className="form-error-message" role="alert">{error}</span> : undefined}
      aria-describedby={error ? errorId : rest["aria-describedby"]}
      classNames={{ input: clsx("form-select", error && "form-error", className) }}
      style={style}
      {...(rest as object)}
    />
  );
}
```

`DatePicker.tsx`:

```tsx
"use client";

import { type InputHTMLAttributes, useId } from "react";
import { DateInput } from "@mantine/dates";
import clsx from "clsx";

export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function DatePicker({ id, value = "", onChange, error, className = "", disabled, readOnly, placeholder, name, style }: DatePickerProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  return (
    <DateInput
      id={inputId}
      name={name}
      value={ISO.test(value) ? value : null}
      onChange={(v) => onChange?.(v ?? "")}
      valueFormat="YYYY-MM-DD"
      placeholder={placeholder ?? "YYYY-MM-DD"}
      clearable
      disabled={disabled}
      readOnly={readOnly}
      error={error ? <span id={errorId} className="form-error-message" role="alert">{error}</span> : undefined}
      classNames={{ input: clsx("form-datepicker", error && "form-error", className) }}
      style={style}
    />
  );
}
```

`Button.tsx`:

```tsx
"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Button as MantineButton } from "@mantine/core";
import clsx from "clsx";

export type ButtonVariant = "default" | "primary" | "danger";
export type ButtonSize = "default" | "sm" | "mini";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: "button" | "submit" | "reset";
  ariaLabel?: string;
}

const VARIANT = {
  default: { variant: "default" as const, color: undefined },
  primary: { variant: "filled" as const, color: "dmes" },
  danger: { variant: "filled" as const, color: "danger" },
};
const SIZE = { default: "sm", sm: "xs", mini: "compact-xs" } as const;

export function Button({ children, variant = "default", size = "default", type = "button", ariaLabel, className = "", ...rest }: ButtonProps) {
  return (
    <MantineButton
      type={type}
      variant={VARIANT[variant].variant}
      color={VARIANT[variant].color}
      size={SIZE[size]}
      aria-label={ariaLabel}
      className={clsx("form-button", `form-button--${variant}`, `form-button--${size}`, className)}
      {...(rest as object)}
    >
      {children}
    </MantineButton>
  );
}
```

기존 `Button.tsx:36` 의 클래스 산출식(`variantClass`, `sizeClass`)이 위와 다르면 **기존 식을 우선**한다(e2e 가 그 클래스를 볼 수 있다).

- [ ] **Step 4: 테스트 통과 확인** — `pnpm --filter @dk-oasis/shared test:unit` 전체 실행. `form-group-a11y` 포함 전부 PASS.

- [ ] **Step 5: CSS 정리와 참조 확인** — form.css 정리 후 `pnpm --filter @dk-oasis/shared lint && pnpm --filter @dk-oasis/shared build`.

- [ ] **Step 6: 커밋**

```bash
git add src/frontend/shared/src/components/form src/frontend/shared/tests/unit/mantine-form.unit.test.ts
git commit -m "feat(shared): 폼 컴포넌트 13종 Mantine 9 로 재구현 (props 계약 유지)"
```

---

## P2: 모달·메시지·ErrorModal·lookup 껍데기 (sonnet)

**Files:**
- Modify: `src/frontend/shared/src/components/modal.tsx`, `modal.css`, `message-provider.tsx`
- Modify: `src/frontend/shared/src/layout/ErrorModal.tsx`
- Modify: `src/frontend/shared/src/components/lookup/{LookupModal,LookupTextField,LookupIconButton}.tsx`
- Test: `src/frontend/shared/tests/unit/mantine-modal.unit.test.ts`
- 유지: `modal-a11y.unit.test.ts`, `lookup-shortcuts.unit.test.ts` 통과

**Interfaces:**
- Consumes: `renderWithMantine`(T0), `@mantine/notifications` 의 `notifications.show` (toast).
- Produces: `Modal`, `MessageModal`, `AlertType`, `useMessage`, `useGfnMessage`, `MessageProvider` 기존 시그니처 그대로. `LookupModal` 은 내부 `Modal` 을 쓰므로 `Modal` 계약만 지키면 된다.

**계약 (원문)**

```ts
export interface ModalProps { open: boolean; title?: string; toolbar?: ReactNode; children?: ReactNode; footer?: ReactNode;
  onClose?: () => void; className?: string; size?: "sm" | "md" | "lg" | "xl"; showCloseButton?: boolean;
  bodyClassName?: string; descriptionId?: string; }
export type AlertType = "info" | "warning" | "error" | "success" | "confirm";
export interface MessageModalProps { open: boolean; title?: string; message?: string | ReactNode; alertType?: AlertType;
  onClose: () => void; onConfirm?: () => void; confirmText?: string; cancelText?: string; }
export interface ShowMessageParams { title?: string; message: string; alertType?: AlertType; callback?: () => void;
  onConfirm?: () => void; onCancel?: () => void; toast?: boolean; toastDuration?: number; }
```

**매핑 규칙**

- `Modal` → Mantine `Modal` 을 컴파운드로 쓴다: `Modal.Root opened={open} onClose={onClose ?? noop} size={SIZE[size]} centered` → `Modal.Overlay className="cm-modal-overlay modal-overlay"` → `Modal.Content className={clsx("cm-modal", className)} aria-describedby={descriptionId}` → `Modal.Header`(title + `showCloseButton && <Modal.CloseButton aria-label="닫기" />`) → `Modal.Body className={clsx("cm-modal-body", bodyClassName)}` 안에 `toolbar`(있으면 `.cm-modal-toolbar`) + children + footer(`.cm-modal-footer`). size 매핑 sm→`sm`, md→`md`, lg→`lg`, xl→`xl`. `open=false` 면 `null` 이 아니라 `opened={false}` 로 두되, 기존 테스트가 "닫혔을 때 DOM 에 없음" 을 검사하면 `keepMounted={false}`(기본) 로 충분하다.
- `MessageModal` → 위 `Modal` 재사용. Overlay className 은 `cm-message-modal-overlay`. 아이콘은 `@tabler/icons-react` 의 `IconInfoCircle/IconAlertTriangle/IconCircleX/IconCircleCheck/IconHelp`. 색은 `COLOR_MAP` 을 Mantine 색 이름으로: info `blue`, warning `orange`, error `danger`, success `green`, confirm `dmes`. 버튼은 `@dk-oasis/shared/form` 의 `Button` 이 아니라 Mantine `Button` 직접 사용(클래스 `cm-btn-primary`, `cm-btn` 을 e2e/CSS 호환으로 남긴다). confirm 타입은 확인·취소 두 버튼, 그 외는 확인 하나. 확인 버튼에 `autoFocus`.
- `message-provider.tsx` 의 Context/globalThis 캐싱 로직은 그대로 두고, `toast: true` 분기만 `notifications.show({ message, title, color, autoClose: toastDuration ?? 3000 })` 으로 바꾼다. 기존 자체 토스트 렌더 코드는 삭제한다.
- `ErrorModal` → `Modal` 재사용, 제목 "오류", 본문 `.error-modal__body`, 버튼 "확인". `message === null` 이면 `opened=false`.
- `LookupModal` → 내부에서 쓰던 자체 모달 마크업을 `Modal`(위) 로 바꾼다. 필터 입력은 `TextInput/NativeSelect`, 그리드는 `AgDataGrid` 그대로, `.cm-lookup-grid` 유지. 키 단축키(Enter/ESC/F4) 로직은 손대지 않는다.
- `LookupTextField` → `TextInput` + `rightSection={<LookupIconButton .../>}`, input className `form-input` 유지, wrapper `cm-lookup-text-field` 유지.
- `LookupIconButton` → `ActionIcon variant="subtle" size={size + 8}` + `IconExternalLink`. className `cm-lookup-icon-button`, `aria-label` 유지.

- [ ] **Step 1: 실패하는 테스트** — `tests/unit/mantine-modal.unit.test.ts`

```ts
/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { MessageModal, Modal } from "../../src/components/modal";
import { ErrorModal } from "../../src/layout/ErrorModal";
import { renderWithMantine } from "./mantine-test-utils";

describe("Modal (Mantine 구현) 계약", () => {
  it("open 시 role=dialog 와 e2e 클래스(cm-modal, cm-modal-overlay) 를 렌더한다", () => {
    const r = renderWithMantine(createElement(Modal, { open: true, title: "T", onClose: () => {} }, "본문"));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(document.querySelector(".cm-modal")).not.toBeNull();
    expect(document.querySelector(".cm-modal-overlay")).not.toBeNull();
    expect(document.body.textContent).toContain("본문");
    r.unmount();
  });

  it("open=false 면 dialog 가 없다", () => {
    const r = renderWithMantine(createElement(Modal, { open: false, title: "T" }, "본문"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    r.unmount();
  });

  it("MessageModal confirm 은 확인/취소 버튼과 cm-message-modal-overlay 를 렌더하고 onConfirm 을 호출한다", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const r = renderWithMantine(createElement(MessageModal, { open: true, alertType: "confirm", message: "계속?", onConfirm, onClose }));
    expect(document.querySelector(".cm-message-modal-overlay")).not.toBeNull();
    const buttons = Array.from(document.querySelectorAll('[role="dialog"] button')).filter((b) => b.textContent?.trim());
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(expect.arrayContaining(["확인", "취소"]));
    act(() => (buttons.find((b) => b.textContent?.trim() === "확인") as HTMLButtonElement).click());
    expect(onConfirm).toHaveBeenCalled();
    r.unmount();
  });

  it("ErrorModal 은 message 가 있을 때만 '오류' 제목으로 열린다", () => {
    const r = renderWithMantine(createElement(ErrorModal, { message: "실패", onClose: () => {} }));
    expect(document.body.textContent).toContain("오류");
    expect(document.body.textContent).toContain("실패");
    r.unmount();
    const r2 = renderWithMantine(createElement(ErrorModal, { message: null, onClose: () => {} }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    r2.unmount();
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter @dk-oasis/shared test:unit -- mantine-modal`.

- [ ] **Step 3: 구현** — `modal.tsx` 의 `Modal`:

```tsx
"use client";

import { memo, type ReactNode } from "react";
import { Modal as M } from "@mantine/core";
import clsx from "clsx";

const SIZE = { sm: "sm", md: "md", lg: "lg", xl: "xl" } as const;

function ModalComponent({ open, title, toolbar, children, footer, onClose, className = "", size = "md", showCloseButton = true, bodyClassName = "", descriptionId }: ModalProps) {
  return (
    <M.Root opened={open} onClose={onClose ?? (() => {})} size={SIZE[size]} centered>
      <M.Overlay className="cm-modal-overlay modal-overlay" />
      <M.Content className={clsx("cm-modal", className)} aria-describedby={descriptionId}>
        {(title || showCloseButton) && (
          <M.Header className="cm-modal-header">
            <M.Title className="cm-modal-title">{title}</M.Title>
            {showCloseButton && <M.CloseButton aria-label="닫기" />}
          </M.Header>
        )}
        <M.Body className={clsx("cm-modal-body", bodyClassName)}>
          {toolbar && <div className="cm-modal-toolbar">{toolbar}</div>}
          {children}
          {footer && <div className="cm-modal-footer">{footer}</div>}
        </M.Body>
      </M.Content>
    </M.Root>
  );
}
export const Modal = memo(ModalComponent);
```

기존 `useModalFocusContract`, `generateId` 는 Mantine 이 focus trap·ESC·aria 를 제공하므로 삭제한다. `modal-a11y` 테스트가 검사하는 항목(첫/마지막 요소 Tab 순환, ESC 로 onClose, `aria-labelledby`)은 Mantine 이 만족한다. 실패하면 테스트를 고치지 말고 `trapFocus`, `closeOnEscape` 기본값을 확인한다.

- [ ] **Step 4: 통과 확인** — 전체 `test:unit`, `lint`, `build`.

- [ ] **Step 5: modal.css 정리** — 오버레이·박스 외형 규칙 삭제, `.cm-modal-toolbar/.cm-modal-footer/.cm-btn*` 레이아웃 규칙만 남긴다. 참조 확인 grep 후 커밋.

- [ ] **Step 6: 커밋**

```bash
git add src/frontend/shared/src/components/modal.tsx src/frontend/shared/src/components/modal.css src/frontend/shared/src/components/message-provider.tsx src/frontend/shared/src/layout/ErrorModal.tsx src/frontend/shared/src/components/lookup src/frontend/shared/tests/unit/mantine-modal.unit.test.ts
git commit -m "feat(shared): 모달·메시지·ErrorModal·Lookup 을 Mantine Modal 기반으로 재구현"
```

---

## P3: 탭·트리·레이아웃 (sonnet)

**Files:**
- Modify: `src/frontend/shared/src/components/tabs/Tabs.tsx`
- Modify: `src/frontend/shared/src/components/tree/Tree.tsx`, `tree.css`
- Modify: `src/frontend/shared/src/layout/{PageLayout,SearchArea,SearchField,SearchHistoryInput,ContentBody,ContentPanel,ResizableFormPanel,MaxHandle}.tsx`, `DetailFormStyles.ts`, `page-layout.css`
- Test: `src/frontend/shared/tests/unit/mantine-layout.unit.test.ts`
- 유지: `page-layout-offline.unit.test.ts`, `search-history-store.unit.test.ts`, `primary-color-consistency.unit.test.ts`(Tabs 의 `var(--color-primary, #337ab7)` 문자열 포함 검사) 통과

**Interfaces:**
- Consumes: P1 의 `Input/Select/Radio`(SearchField 내부), `renderWithMantine`.
- Produces: 기존 props 그대로. `Tree` 의 `TreeNode { id, label, children?, [key]: unknown }`, `TreeProps { items, expandedItems, selectedItems, onExpandedItemsChange(null, ids), onSelectedItemsChange(null, id), className }` 유지.

**매핑 규칙**

- `Tabs` → Mantine `Tabs value={activeKey} onChange={(v)=> v && onChange(v)}` + `Tabs.List` + `Tabs.Tab value={key} disabled`. 루트 className `cm-tabs` + 전달 className. 밑줄 색은 `styles={{ tab: { "--tab-color": "var(--color-primary, #337ab7)" } }}` 처럼 **소스에 `var(--color-primary, #337ab7)` 문자열이 남게** 한다(색 일관성 테스트가 grep 한다).
- `Tree` → Mantine `Tree` + `useTree`. 어댑터: `toNodeData(items): TreeNodeData[]` 는 `{ value: String(id), label, children }`. `expandedState` 는 `Object.fromEntries(expandedItems.map(id => [String(id), true]))`, `selectedState` 는 `selectedItems.map(String)`. 제어/비제어 분기(기존 `controlledExpanded !== undefined`)는 유지한다. `useTree({ expandedState, selectedState, multiple: false })` 결과를 `tree` prop 으로 넘기고, `renderNode` 에서 `elementProps` 에 `className={clsx("tree-item", selected && "selected")}` 와 `onClick` 을 얹어 기존 콜백을 호출한다. 루트 className `cm-tree`. `expandOnClick={false}`(토글은 화살표 아이콘 클릭으로만 — 기존 동작이 그러하다면 유지, 아니면 true).
- `PageLayout` → 헤더는 `Group justify="space-between"`, 제목 `Title order={2} className="page-layout__title"`, 버튼 컨테이너 `div.page-layout__header-buttons` 안에 Mantine `Button`(className `page-button page-button--{type}` 유지). RBAC 판정(`useUserButtonRbac`, `canDoButton`), `emitSearch`, breadcrumb, screenId 표기 로직은 **한 줄도 바꾸지 않는다**. 루트 `div.page-layout` 유지.
- `SearchArea` → 루트를 `Paper withBorder p="xs" className="search-area"` 로, 조건 영역은 기존 `.search-area__conditions` 격자 CSS 유지(`form` 렌더 분기와 `role="search"` 유지).
- `SearchField` → 라벨 `Text size="xs" className="search-field__label"`, 입력은 type 별로 P1 의 `Input/Select/Radio` 재사용(text 는 history 가 켜지면 기존 `SearchHistoryInput`). 루트 `div.search-field {spanClass}` 유지.
- `SearchHistoryInput` → 입력만 `TextInput`(className `form-input search-history-input` 유지), 드롭다운 `ul[role=listbox]` 마크업과 저장 로직은 그대로.
- `ContentBody/ContentPanel/ResizableFormPanel/MaxHandle` → `ContentPanel` 루트를 `Paper withBorder className="content-panel"` 로 바꾸는 것 외에 로직 무변경. `MaxHandle` 아이콘은 `IconArrowsMaximize/IconArrowsMinimize`(tabler) 로 교체, className 유지.
- `DetailFormStyles.ts` → 값만 토큰으로: `#f4f6f8`→`var(--mantine-color-gray-0, #f4f6f8)`, `#d4dae0`→`var(--mantine-color-gray-3, #d4dae0)`, `#c0c6cc`→`var(--mantine-color-gray-4, #c0c6cc)`, `#333`→`var(--mantine-color-text, #333)`. 키와 export 이름은 유지.
- `page-layout.css`(26KB) → 버튼·입력 외형 규칙 삭제, 격자·여백·리사이즈 핸들·최대화 규칙 유지. 삭제 전 참조 grep.

- [ ] **Step 1: 실패하는 테스트** — `tests/unit/mantine-layout.unit.test.ts`

```ts
/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "../../src/components/tabs";
import { Tree } from "../../src/components/tree";
import { ContentPanel, PageLayout } from "../../src/layout";
import { renderWithMantine } from "./mantine-test-utils";

describe("tabs/tree/layout (Mantine 구현) 계약", () => {
  it("Tabs 는 activeKey 탭에 aria-selected 를 주고 onChange(key) 를 호출한다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(Tabs, { items: [{ key: "a", label: "A" }, { key: "b", label: "B" }], activeKey: "a", onChange }));
    const tabs = r.host.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    act(() => (tabs[1] as HTMLElement).click());
    expect(onChange).toHaveBeenCalledWith("b");
    r.unmount();
  });

  it("Tree 는 cm-tree/tree-item 클래스를 유지하고 선택 시 onSelectedItemsChange(null, id) 를 호출한다", () => {
    const onSel = vi.fn();
    const items = [{ id: 1, label: "루트", children: [{ id: 2, label: "자식" }] }];
    const r = renderWithMantine(createElement(Tree, { items, expandedItems: [1], onSelectedItemsChange: onSel }));
    expect(r.host.querySelector(".cm-tree")).not.toBeNull();
    const nodes = r.host.querySelectorAll(".tree-item");
    expect(nodes.length).toBe(2);
    act(() => (nodes[1] as HTMLElement).click());
    expect(onSel).toHaveBeenCalledWith(null, "2");
    r.unmount();
  });

  it("PageLayout 은 page-layout__header-buttons 안에 page-button 을 렌더한다", () => {
    const onClick = vi.fn();
    const r = renderWithMantine(
      createElement(PageLayout, { title: "화면", buttons: [{ id: "s", label: "조회", onClick, action: "search" }] }, createElement("div", null, "본문")),
    );
    const btn = r.host.querySelector(".page-layout__header-buttons .page-button") as HTMLButtonElement;
    expect(btn?.textContent).toContain("조회");
    act(() => btn.click());
    expect(onClick).toHaveBeenCalled();
    r.unmount();
  });

  it("ContentPanel 은 content-panel 클래스를 유지한다", () => {
    const r = renderWithMantine(createElement(ContentPanel, { flex: 1 }, "x"));
    expect(r.host.querySelector(".content-panel")).not.toBeNull();
    r.unmount();
  });
});
```

PageLayout 이 `useTabPage`/portal context 를 요구해 Provider 없이 렌더가 실패하면, 기존 `page-layout-offline.unit.test.ts` 가 어떻게 감싸는지 보고 같은 방식으로 감싼다.

- [ ] **Step 2: 실패 확인** → **Step 3: 구현** (Tree 어댑터 핵심)

```tsx
"use client";

import { memo, useMemo } from "react";
import { Tree as MTree, useTree, type TreeNodeData, type RenderTreeNodePayload } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import clsx from "clsx";
import "./tree.css";

function toNodeData(items: TreeNode[]): TreeNodeData[] {
  return items.map((n) => ({ value: String(n.id), label: n.label, children: n.children ? toNodeData(n.children) : undefined }));
}

function TreeComponent({ items = [], expandedItems: controlledExpanded, selectedItems: controlledSelected, onExpandedItemsChange, onSelectedItemsChange, className = "" }: TreeProps) {
  const [internalExpanded, setInternalExpanded] = useState<(string | number)[]>([]);
  const [internalSelected, setInternalSelected] = useState<string[]>([]);
  const expandedItems = controlledExpanded ?? internalExpanded;
  const selectedItems: string[] = controlledSelected !== undefined
    ? (Array.isArray(controlledSelected) ? controlledSelected.map(String) : [String(controlledSelected)])
    : internalSelected;

  const data = useMemo(() => toNodeData(items), [items]);
  const tree = useTree({
    expandedState: Object.fromEntries(expandedItems.map((id) => [String(id), true])),
    selectedState: selectedItems,
    multiple: false,
  });

  const toggle = (id: string) => {
    const next = expandedItems.map(String).includes(id) ? expandedItems.filter((x) => String(x) !== id) : [...expandedItems, id];
    onExpandedItemsChange ? onExpandedItemsChange(null, next) : setInternalExpanded(next);
  };
  const select = (id: string) => {
    onSelectedItemsChange ? onSelectedItemsChange(null, id) : setInternalSelected([id]);
  };

  const renderNode = ({ node, expanded, hasChildren, selected, level, elementProps }: RenderTreeNodePayload) => (
    <div
      {...elementProps}
      className={clsx("tree-item", selected && "selected", elementProps.className)}
      style={{ paddingLeft: level * 16 }}
      onClick={(e) => { e.stopPropagation(); select(node.value); }}
    >
      {hasChildren ? (
        <IconChevronRight size={14} className={clsx("tree-item__toggle", expanded && "expanded")}
          onClick={(e) => { e.stopPropagation(); toggle(node.value); }} />
      ) : <span className="tree-item__toggle tree-item__toggle--leaf" />}
      <span className="tree-item__label">{node.label}</span>
    </div>
  );

  return <MTree data={data} tree={tree} renderNode={renderNode} expandOnClick={false} selectOnClick={false} className={clsx("cm-tree", className)} />;
}
export const Tree = memo(TreeComponent);
```

기존 `Tree.tsx` 의 `TreeNode`/`TreeProps` 인터페이스 원문은 파일에 그대로 둔다. `useState` import 를 잊지 않는다.

- [ ] **Step 4: 통과 확인** — 전체 `test:unit`, `lint`, `build`. `primary-color-consistency` 가 실패하면 Tabs 소스에 `var(--color-primary, #337ab7)` 문자열이 있는지 확인한다.

- [ ] **Step 5: CSS 정리 후 커밋**

```bash
git add src/frontend/shared/src/components/tabs src/frontend/shared/src/components/tree src/frontend/shared/src/layout src/frontend/shared/tests/unit/mantine-layout.unit.test.ts
git commit -m "feat(shared): 탭·트리·페이지 레이아웃을 Mantine 9 로 재구현 (계약·클래스 유지)"
```

---

## P4: 포털 셸·로그인 (opus)

**Files:**
- Modify: `src/frontend/shared/src/portal-shell/portal-shell.tsx`(표현 부분만), `portal-shell.css`, `header/Header.tsx`, `header/Header.css`, `sidebar/Sidebar.tsx`, `sidebar/Sidebar.css`, `sidebar/FavoritesTree.tsx`, `tabs-bar/TabsBar.tsx`, `tabs-bar/TabsBar.css`, `dashboard/Dashboard.tsx`, `dashboard/Dashboard.css`, `MenuSearchDialog.tsx`, `FavoriteFolderPickerModal.tsx`
- Modify: `src/frontend/shared/src/auth/login-form.tsx`, `login-form.css`
- Test: `src/frontend/shared/tests/unit/mantine-portal-shell.unit.test.ts`
- 유지: `portal-shell-menu-search`, `portal-shell-module`, `tabs-bar-hover-style`, `tabs-bar-visibility`, `use-tab-history` 통과. 이 다섯 개가 소스 문자열을 grep 하는 방식이면(예: `tabs-bar-hover-style`) 검사하는 문자열을 먼저 읽고 새 구현에 남긴다.

**Interfaces:**
- Consumes: P2 의 `Modal`(MenuSearchDialog, FavoriteFolderPickerModal), P3 의 `Tree` 는 쓰지 않는다(사이드바 트리는 자체 구현 유지, 클래스 `tree-item` 필수).
- Produces: `HeaderProps`, `SidebarProps`, `TabsBarProps`, `FavoritesTreeProps`, `PortalLoginFormProps` 원문 그대로. `portal-shell/index.ts`, `core.ts` export 무변경.

**매핑 규칙**

- `portal-shell.tsx` 는 상태·훅·이벤트 로직을 **손대지 않는다**. 최상위 프레임만 `AppShell header={{ height: 48, collapsed: !isHeaderVisible }} navbar={{ width: isExpanded ? 240 : 56, breakpoint: 0 }} padding={0}` 로 바꾸고 `AppShell.Header`, `AppShell.Navbar`, `AppShell.Main` 에 기존 자식을 넣는다. 기존 최상위 className(`portal-shell` 등)은 `AppShell className` 에 둔다.
- `Header` → `Group h={48} px="sm" justify="space-between"`, 사용자 메뉴는 `Menu` + `Menu.Item onClick={onLogout}`. 앱명 클릭 `onGoHome`.
- `Sidebar` → 상단 토글 `SegmentedControl value={navigationViewMode} data={[{value:"menu",label:"메뉴"},{value:"favorites",label:"즐겨찾기"}]}`, 접기 버튼 `ActionIcon`, 트리는 `ScrollArea` 안에 기존 재귀 `TreeItem` 유지(마크업은 `NavLink` 로 바꿔도 되지만 `className="tree-item"` 과 `data-path` 등 기존 속성을 유지한다). `FavoritesTree` 동일.
- `TabsBar` → 탭 스트립은 자체 마크업 유지(드래그 재정렬 로직 때문), 루트 `div.tab-bar` 유지, 우측 액션 버튼(홈·새로고침·헤더 토글·즐겨찾기·캡쳐)은 `ActionIcon variant="subtle"` + tabler 아이콘. 탭 닫기 `CloseButton size="xs"`.
- `Dashboard` → `Container`/`SimpleGrid` 로 감싸기만.
- `MenuSearchDialog` → P2 `Modal` + `TextInput autoFocus` + 결과 리스트(`ul[role=listbox]` 유지). 키보드 이동 로직 유지.
- `FavoriteFolderPickerModal` → P2 `Modal` + `Radio.Group`/`TextInput`.
- `login-form.tsx` → `Paper className="login-form"` 안에 `TextInput name="userId" label="아이디" className="login-input"`, `PasswordInput name="password" label="비밀번호" className="login-input"`, `Checkbox label="아이디 저장"`, `Anchor` "비밀번호 변경"(className `login-change-pw`), `Button type="submit" fullWidth` "로그인", 오류 `Alert color="danger" className="login-error"`. `signIn("credentials", { userId, password, callbackUrl, redirect: false })` 호출부와 아이디 저장(localStorage) 로직은 그대로. 배경 이미지 wrapper `div.login-wrapper` 유지.

- [ ] **Step 1: 실패하는 테스트** — `tests/unit/mantine-portal-shell.unit.test.ts`

```ts
/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { TabsBar } from "../../src/portal-shell/tabs-bar/TabsBar";
import { Header } from "../../src/portal-shell/header/Header";
import { renderWithMantine } from "./mantine-test-utils";

describe("portal-shell (Mantine 구현) 계약", () => {
  it("TabsBar 는 tab-bar 클래스를 유지하고 탭 클릭/닫기 콜백을 호출한다", () => {
    const onTabClick = vi.fn();
    const onTabClose = vi.fn();
    const tabs = [{ id: "t1", title: "사용자 관리", pageId: "commUserMng" }] as never;
    const r = renderWithMantine(createElement(TabsBar, { tabs, activeTabId: "t1", onTabClick, onTabClose, onGoHome: () => {} }));
    expect(r.host.querySelector(".tab-bar")).not.toBeNull();
    const tab = Array.from(r.host.querySelectorAll("*")).find((el) => el.textContent?.trim() === "사용자 관리" && el.children.length === 0) as HTMLElement;
    act(() => tab.click());
    expect(onTabClick).toHaveBeenCalledWith("t1");
    r.unmount();
  });

  it("Header 는 사용자명을 표시하고 로그아웃을 호출한다", () => {
    const onLogout = vi.fn();
    const r = renderWithMantine(createElement(Header, { appName: "DMES", userName: "관리자", loginId: "admin", onLogout }));
    expect(r.host.textContent).toContain("관리자");
    const logout = Array.from(r.host.querySelectorAll("button")).find((b) => b.textContent?.includes("로그아웃"));
    if (logout) {
      act(() => logout.click());
      expect(onLogout).toHaveBeenCalled();
    }
    r.unmount();
  });
});
```

`TabState` 의 실제 필드는 `portal-shell/types.ts` 를 열어 맞춘다(`as never` 대신 정확한 객체를 쓴다).

- [ ] **Step 2: 실패 확인** → **Step 3: 구현** (위 규칙) → **Step 4: 기존 테스트 5개 포함 전체 통과** → **Step 5: CSS 정리** → **Step 6: 커밋**

```bash
git add src/frontend/shared/src/portal-shell src/frontend/shared/src/auth/login-form.tsx src/frontend/shared/src/auth/login-form.css src/frontend/shared/tests/unit/mantine-portal-shell.unit.test.ts
git commit -m "feat(shared): 포털 셸·로그인 폼을 Mantine AppShell 기반으로 재구현"
```

---

## P5: ag-grid 색상 토큰 연결 (sonnet)

**Files:**
- Modify: `src/frontend/shared/src/components/grid/grid.css`
- Test: `src/frontend/shared/tests/unit/grid-css-tokens.unit.test.ts`

**Interfaces:** 없음. `AgDataGrid.tsx` 는 수정하지 않는다.

**규칙**: `grid.css` 의 하드코딩 색 134건 중 다음 계열만 토큰으로 바꾼다. 나머지는 그대로 둔다.

| 기존 값 | 대체 |
|---|---|
| `#337ab7`, `#2a6499` | `var(--color-primary)`, `var(--color-primary-hover)` |
| `#d9534f`, `#c9302c` | `var(--color-danger)`, `var(--color-danger-hover)` |
| 선택 행 배경(`.ag-row-selected` 계열의 연파랑) | `var(--mantine-color-dmes-0, 기존값)` |
| 헤더 배경 회색 | `var(--mantine-color-gray-0, 기존값)` |
| 테두리 회색(`#d4dae0`, `#ddd`, `#e0e0e0`) | `var(--mantine-color-gray-3, 기존값)` |
| 본문 텍스트 `#333` | `var(--mantine-color-text, #333)` |

`--ag-*` 변수(`.ag-theme-alpine` 오버라이드)도 같은 규칙으로 값만 바꾼다.

- [ ] **Step 1: 테스트**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/components/grid/grid.css", import.meta.url), "utf8");

describe("grid.css 토큰화", () => {
  it("primary/danger 색을 하드코딩하지 않는다", () => {
    expect(css).not.toMatch(/#337ab7/i);
    expect(css).not.toMatch(/#2a6499/i);
    expect(css).not.toMatch(/#d9534f/i);
  });
  it("cm-data-grid 와 ag-theme 오버라이드가 남아 있다", () => {
    expect(css).toContain(".cm-data-grid");
    expect(css).toContain("--ag-");
  });
});
```

- [ ] **Step 2: 실패 확인** → **Step 3: 치환** → **Step 4: 통과·build** → **Step 5: 커밋**

```bash
git add src/frontend/shared/src/components/grid/grid.css src/frontend/shared/tests/unit/grid-css-tokens.unit.test.ts
git commit -m "style(shared): ag-grid 테마 색상을 Mantine 토큰에 연결"
```

---

## P6: 문서·ADR·디자인 샌드박스 (haiku, ADR 본문은 sonnet)

**Files:**
- Create: `docs/guide/adr/README.md`, `docs/guide/adr/0001-ui-library-mantine9-aggrid.md`
- Modify: `.claude/skills/adr-write/SKILL.md`(공통 ADR 위치 한 줄), `docs/guide/FrontEnd/README.md`(ADR 링크), `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md:127-176`, `docs/guide/FrontEnd/Portal-Development-Guide.md:42`, `docs/guide/design/templates/디자인설계서.template.md`, `docs/guide/design/ui-design/01-overview-and-rules.md`, `docs/guide/design/ui-design/02-writing-and-dev-link.md`
- Modify: `src/frontend/m-design-dummy/package.json`, `src/main.tsx`, `README.md`, `DESIGN-HANDOFF.md`

**규칙**

- ADR 은 `adr-write` 스킬을 호출해 규약(필수 절: 배경·결정·근거·대안·영향·상태)대로 쓴다. 상태 ACCEPTED. 본문 근거는 스펙 1절의 표(MRT 마지막 배포·peer·Mantine 버전)를 인용한다. 대안 3개: MRT(Mantine 7 고정), mantine-datatable, TanStack Table 직접 조립.
- `part-b-shared-policy.md`: export 목록에서 `MuiDataGrid` 삭제, "구현 기반: Mantine 9(그리드 ag-grid-community 33)" 문단 추가, 금지 규칙에 "`@mantine/*` 를 화면 모듈에서 직접 import 하지 않는다. 필요한 컴포넌트가 shared 에 없으면 shared 에 추가한다" 추가, "`DmesUiProvider` 는 호스트 root layout 이 한 번 감싼다" 추가.
- 설계 템플릿·ui-design 01/02: `MuiDataGrid` 언급 삭제, 컴포넌트 표 상단에 "구현 기반: Mantine 9 + ag-grid-community" 한 줄.
- `m-design-dummy`: `pnpm add @mantine/core@^9.6.0 @mantine/hooks@^9.6.0 @mantine/dates@^9.6.0 @mantine/notifications@^9.6.0 @mantine/modals@^9.6.0 dayjs @tabler/icons-react clsx`; `main.tsx` 에서 `import "@mantine/core/styles.css"` 등 3개 CSS 와 `DmesUiProvider` 로 `<App />` 감싸기; README·DESIGN-HANDOFF 에 "UI 기반 Mantine 9, 그리드 ag-grid" 명시와 Provider 필수 안내.

- [ ] **Step 1: ADR 작성(adr-write 스킬)** → **Step 2: 문서 개정** → **Step 3: design-dummy 갱신 후 `pnpm --filter @dk-oasis/m-design-dummy build`(스크립트가 있으면) 통과** → **Step 4: 커밋 2개**

```bash
git add docs/guide .claude/skills/adr-write/SKILL.md
git commit -m "docs(guide): UI 기반 Mantine 9 + ag-grid 결정 ADR 과 FE 표준 개정"
git add src/frontend/m-design-dummy src/frontend/pnpm-lock.yaml
git commit -m "chore(m-design-dummy): Mantine Provider 적용과 핸드오프 문서 갱신"
```

---

## T9: 통합 검증 (리드)

- [ ] **Step 1:** `cd src/frontend && pnpm install && pnpm --filter @dk-oasis/shared test:unit && pnpm --filter @dk-oasis/shared lint && pnpm build:libs && pnpm --filter @dk-oasis/mcm lint`
- [ ] **Step 2:** `rm -rf m-mcm/.next`; 포털 기동(README 의 `./local-run.sh`, 이 Mac 에서는 5001 우회) → `admin/admin123` 로그인 → 사용자 관리 열기 → 조회 → 행 선택 → LOV 팝업 열기 → 저장 확인 메시지. 각 단계 스크린샷을 보고 판단한다.
- [ ] **Step 3:** `cd src/frontend && pnpm exec playwright test e2e/login*.spec.ts e2e/*user*.spec.ts e2e/*master*.spec.ts` (파일명은 `ls e2e` 로 맞춘다).
- [ ] **Step 4:** 실패 항목은 셀렉터가 아니라 구현을 고친다. 전부 통과하면 `git log --oneline main..` 으로 커밋 목록을 정리하고 보고한다.
