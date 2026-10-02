# 위젯 기반(A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 포털 홈을 "자유 배치 가능한 위젯(조각 프로그램)" 체계로 바꾼다 — shared 위젯 계약·보드·탭·작업 공간, 사용자별 서버 저장(mcm `secWidget`), m-mcm 위젯 등록부 코드 생성, 기존 홈 위젯 11개 이전.

**Architecture:** shared `@dk-oasis/shared/widget` 이 위젯 타입·순수 배치 함수·`WidgetFrame`·`WidgetBoard`(react-grid-layout 2.x)·`WidgetTabs`·`WidgetPicker`·`WidgetWorkspace` 를 제공한다. 저장은 `WidgetStore` 인터페이스로 주입한다. m-mcm 은 `widgets/{group}/{name}/` 폴더를 코드 생성 스크립트로 `WIDGET_REGISTRY` 에 모으고, 홈 화면이 `WidgetWorkspace` 에 등록부·기본 배치·`secWidget` 저장소를 넘긴다. 백엔드는 mcm-core 에 엔티티 2개·서비스·트랜잭션 Writer 를, mcm api 에 `secWidget.bpmn` 을 둔다.

**Tech Stack:** React 19 · Next 16 · TypeScript · react-grid-layout 2.2.4 · vitest 3 + happy-dom(shared) · node:test(m-mcm 스크립트) · Spring Boot · JPA · OASIS BPMN · JUnit 5 + Mockito

**Spec:** `docs/superpowers/specs/2026-10-02-widget-foundation-design.md` (시안: `docs/superpowers/specs/assets/2026-10-02-widget-foundation-mockups/widget-home.html`)

## Global Constraints

- 격자: 넓은 화면(≥1200px) 24칸 · 중간(≥768px) 12칸 · 좁은 화면 1칸, 세로 한 칸 20px, 간격 8px, 세로(위로) 당김, 겹침 없음.
- 저장은 넓은 화면 배치 하나만. 편집은 24칸 화면에서만(W-D12). 중간·좁은 화면은 다시 흘린 배치를 보기 전용으로 보인다.
- 크기 조절 손잡이 8방향(`n,e,s,w,ne,se,sw,nw`). 위젯 최소 크기 기본 `{ w: 4, h: 6 }`.
- 한도: 탭 사용자당 10개, 위젯 탭당 30개, 탭 이름 1~20자·사용자 안 중복 금지, 자동 새로 고침 최소 30초.
- 「홈」 탭: ID `home`, 늘 첫 자리, 지우기·이름 바꾸기 불가. 미저장이면 코드 기본 배치(`HOME_DEFAULT_LAYOUT`).
- RBAC 권한은 범위 밖. 다만 `secWidget` 은 본인 데이터라 즐겨찾기처럼 AUTH_ONLY(인증만) 목록에 넣는다 — BE `EndpointPermissionFilter`·FE `m-mcm/proxy.ts`·`shared/tests/unit/rbac-policy.unit.test.ts` 세 곳을 같이 고친다.
- 백엔드 OASIS 표준: 서비스 클래스·메서드에 `@Transactional` 금지, serviceTask `output="result"`, `grid` 속성 금지, `conditionExpression` 금지, List 는 `grids.{파라미터명}.rows` 로만 받는다(`docs/guide/BackEnd/standard-v2/backend-standard/02-structure-naming-constraints.md` §6-C·§6-E). 예외는 `BusinessException(ErrorCode, String)`.
- userId 는 요청 본문에서 받지 않고 `SecurityIdentity.currentUserId()` 로만 얻는다(IDOR).
- 테이블: `MCMAPUSER.TB_MCM_SEC_USER_WIDGET_TAB`·`TB_MCM_SEC_USER_WIDGET`, 감사 컬럼은 `McmAuditEntity`. 로컬은 `ddl-auto: update`, 서버 스키마는 `docs/mcm/erd/csa-menu.dbml`·`csa-menu-tables.md` 등재. Flyway 마이그레이션은 만들지 않는다.
- shared 새 컴포넌트는 Part B §18 절차로 등록하고 같은 작업에서 `mantine-aggrid-ui` 스킬 컴포넌트 문서·색인을 갱신한다. 색·간격은 `var(--color-*)`·`var(--spacing-*)` 토큰만 쓴다. 한 변 컬러 바 금지(Local-Rules §8).
- shared 컴포넌트 시험은 `@testing-library` 없이 `react-dom/client` `createRoot` + `act`, 파일 머리 `/** @vitest-environment happy-dom */`, 시험 파일은 `.test.ts`(JSX 금지, `createElement` 사용).
- shared 위젯 컴포넌트는 Mantine 컴포넌트(`Button` 등)를 쓰지 않는다 — 시험에 MantineProvider 가 없다. 버튼은 `<button>` + `WIDGET_CSS` 클래스로 만든다.
- 브라우저 확인은 ego-browser 스킬로 하고, 끝나면 작업 공간을 닫는다. 도커 금지(SQLite·로컬 서버만).
- 커밋 메시지: `type(scope): 한글 요약` + 본문 첫 줄 "쉬운 설명:" + `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. 이 워크트리에서 `git` 이 rtk 훅에 막히면 `/usr/bin/git` 으로 부른다.

## Review Focus

1. **좁은 화면에서 편집 시도** — 1100px 폭에서 [배치 편집]이 비활성이고 안내가 보여야 한다. 편집 중 창을 좁히면 격자가 고정(보기 전용)되고 [완료]·[취소]는 계속 동작해야 한다. → Task 3(보드 `canEdit` 시험), Task 5(작업 공간 시험).
2. **서버에서 받은 망가진 배치** — 격자 밖 좌표·겹친 위젯·최소 크기보다 작은 크기·같은 instId 두 개가 와도 화면이 깨지지 않고 정리되어 보여야 한다. → Task 1(`sanitizeLayout` 시험).
3. **등록부에 없는 위젯 ID** — 보기 모드에서는 안 보이고, 편집 모드에서는 「없는 위젯」 칸으로 보여 ✕ 로만 뺄 수 있어야 한다. → Task 2(틀 시험), Task 3(보드 시험).
4. **저장 실패** — [완료]에서 서버가 거절하면 편집 모드와 변경 내용이 그대로 남고 메시지가 보여야 한다. 보기 모드 탭 메뉴 작업이 실패하면 화면이 원래 값으로 돌아가야 한다. → Task 5.
5. **불러오기 실패 후 덮어쓰기** — `search` 실패 시 [배치 편집]이 비활성이어야 한다(빈 상태를 저장해 사용자 배치를 지우지 않게). → Task 5.

---

## 파일 구조

| 경로 | 책임 |
|---|---|
| `src/frontend/shared/src/widget/types.ts` | 위젯 계약 타입(`WidgetMeta`·`WidgetProps`·`WidgetItem`·`WidgetTab`·`WidgetStore`·`WidgetRegistry`) |
| `src/frontend/shared/src/widget/constants.ts` | 격자 규격·한도·「홈」 상수 |
| `src/frontend/shared/src/widget/widget-layout.ts` | 순수 함수(검증·다시 흘리기·추가·빼기·잠금·키보드 이동·비교·탭 이름 검사·ID) |
| `src/frontend/shared/src/widget/widget-dnd.ts` | 서랍→격자 끌기 중인 위젯 ID 공유 |
| `src/frontend/shared/src/widget/frame-context.ts` | 틀 맥락과 훅(`useWidgetStatus`·`useWidgetBodySize`·`WidgetHeaderActions`·`WidgetTitleExtra`) |
| `src/frontend/shared/src/widget/WidgetFrame.tsx` | 위젯 공통 틀(제목 줄·새로 고침·화면 열기·잠금·빼기·로딩·오류 경계·없는 위젯) |
| `src/frontend/shared/src/widget/WidgetBoard.tsx` | react-grid-layout 감싸기(칸 수·편집·잠금·끌어 놓기·크기 이름표) |
| `src/frontend/shared/src/widget/WidgetTabs.tsx` | 위젯 탭 줄(선택·추가·이름 바꾸기·탭 메뉴) |
| `src/frontend/shared/src/widget/WidgetPicker.tsx` | [위젯 추가] 서랍(검색·눌러 추가·끌기) |
| `src/frontend/shared/src/widget/WidgetWorkspace.tsx` | 탭+보드+서랍+편집 흐름+저장소 연동 |
| `src/frontend/shared/src/widget/styles.tsx` | `WIDGET_CSS`(react-grid-layout·react-resizable 필수 규칙 포함)와 `<WidgetStyle />` |
| `src/frontend/shared/src/widget/index.ts` | 진입점 |
| `src/frontend/shared/tests/unit/widget-*.unit.test.ts` | 시험 |
| `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/widget/**` | 엔티티·리포지토리·DTO·Writer·서비스 |
| `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/widget/service/SecWidgetServiceTest.java` | 서비스 시험 |
| `src/backend/mcm/api/src/main/resources/services/roleManagement/secWidget.bpmn` | OASIS 서비스 |
| `src/backend/mcm/api/src/test/java/com/dongkuk/dmes/mcm/widget/SecWidgetBpmnActionTest.java` | BPMN 계약 시험 |
| `src/frontend/m-mcm/scripts/widget-registry-lib.mjs` · `generate-widget-registry.mjs` · `widget-registry-lib.test.mjs` | 등록부 코드 생성과 시험 |
| `src/frontend/m-mcm/lib/generated/widget-registry.ts` | 생성물(커밋한다 — page-registry 와 같음) |
| `src/frontend/m-mcm/widgets/home/{11개}/widget.meta.ts`·`widget.tsx` | 홈 위젯 |
| `src/frontend/m-mcm/page-components/home/notice-store.ts` | 공지 목록·선택 공유 저장소 |
| `src/frontend/m-mcm/page-components/home/widget-store.ts` | `secWidget` 를 부르는 `WidgetStore` 구현 |
| `src/frontend/m-mcm/page-components/home/home-layout.ts` | `HOME_DEFAULT_LAYOUT` |

---

### Task 1: shared 위젯 계약·배치 순수 함수·진입점

**Files:**
- Create: `src/frontend/shared/src/widget/types.ts`, `constants.ts`, `widget-layout.ts`, `index.ts`
- Modify: `src/frontend/shared/package.json`(dependencies·exports), `src/frontend/shared/tsup.config.ts`(entry), `src/frontend/pnpm-lock.yaml`
- Test: `src/frontend/shared/tests/unit/widget-layout.unit.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces (뒤 작업이 그대로 쓴다):
  - 타입 `WidgetSize`, `WidgetMeta`, `WidgetProps`, `WidgetComponent`, `WidgetRegistryEntry`, `WidgetRegistry`, `WidgetItem`, `WidgetTab`, `WidgetStore`, `WidgetMoveKey`
  - 상수 `WIDGET_COLS=24`, `WIDGET_ROW_HEIGHT=20`, `WIDGET_MARGIN=8`, `WIDGET_WIDE_MIN_WIDTH=1200`, `WIDGET_MEDIUM_MIN_WIDTH=768`, `WIDGET_DEFAULT_MIN_SIZE`, `HOME_TAB_ID="home"`, `HOME_TAB_NAME="홈"`, `MAX_TABS=10`, `MAX_WIDGETS_PER_TAB=30`, `TAB_NAME_MAX=20`, `MIN_REFRESH_SEC=30`
  - 함수 `colsForWidth(width): 24|12|1`, `minSizeOf(meta?)`, `maxSizeOf(meta?)`, `validateWidgetMeta(meta): string[]`, `sanitizeLayout(items, registry): WidgetItem[]`, `reflowLayout(items, cols): WidgetItem[]`, `addItem(items, widgetId, meta, instId, at?): WidgetItem[]`, `removeItem(items, instId)`, `toggleLock(items, instId)`, `moveByKey(items, instId, key, mode, registry)`, `itemsEqual(a, b)`, `tabsEqual(a, b)`, `validateTabName(name, tabs, selfTabId): string | null`, `nextTabId(tabs)`, `newInstanceId()`, `homeTab(items): WidgetTab`, `canAddWidget(items, meta): boolean`

- [ ] **Step 1: react-grid-layout 의존성 추가**

`src/frontend/shared/package.json` 의 `dependencies` 에 알파벳 순서로 `"react-grid-layout": "2.2.4"` 를 넣고 설치한다(라이선스 MIT 확인됨, Part B §3).

```bash
cd src/frontend && pnpm install --filter @dk-oasis/shared && pnpm why react-grid-layout | head -5
```
Expected: `react-grid-layout 2.2.4` 한 벌만 보인다.

- [ ] **Step 2: 타입·상수 작성**

`src/frontend/shared/src/widget/types.ts`:
```ts
/**
 * 위젯 계약 — 위젯 = 자유 배치 가능한 조각 프로그램(화면 컴포넌트). 스펙 §2.
 * 위젯 하나 = 폴더 하나(widget.meta.ts + widget.tsx). 등록부(WidgetRegistry)는 화면 쪽(m-mcm)이 코드 생성으로 만든다.
 */
import type { ReactNode } from "react";

/** 격자 칸 수. */
export interface WidgetSize {
  w: number;
  h: number;
}

export interface WidgetMeta {
  /** "{모듈}.{이름}" — 저장 키. 바꾸면 사용자 배치에서 그 위젯이 빠진다. */
  id: string;
  title: string;
  /** 제목 옆 작은 부제(예: "전일 기준"). */
  subtitle?: string;
  /** [위젯 추가] 서랍의 짧은 설명. */
  description?: string;
  defaultSize: WidgetSize;
  /** 기본 { w: 4, h: 6 }. */
  minSize?: WidgetSize;
  /** 기본 제한 없음(가로는 격자 폭까지). */
  maxSize?: WidgetSize;
  /** 자동 새로 고침 주기(초). 30 미만이면 30. 없으면 자동 새로 고침 없음. */
  refreshSec?: number;
  /** 제목 줄 「화면 열기」가 여는 포털 pageId(예: "mls:lsh/noticeMgmt"). */
  linkPageId?: string;
  /** 한 탭에 여러 번 놓을 수 있는지(기본 true). */
  multiple?: boolean;
  /** 본문 안쪽 여백(기본 true). 그리드처럼 칸을 채우는 위젯은 false. */
  bodyPadding?: boolean;
}

export interface WidgetProps {
  /** 보드 안 고유 ID — 같은 위젯을 두 번 놓아도 구분한다. */
  instanceId: string;
  size: WidgetSize;
  /** 인스턴스 설정. A 에서는 늘 null(설정 편집은 C). */
  config: unknown;
  /** 새로 고침 신호. 값이 바뀌면 위젯이 다시 조회한다. */
  refreshKey: number;
}

export type WidgetComponent = (props: WidgetProps) => ReactNode;

export interface WidgetRegistryEntry {
  meta: WidgetMeta;
  /** 본체 지연 로딩 — default export 가 WidgetComponent. */
  load: () => Promise<{ default: unknown }>;
}

export type WidgetRegistry = Readonly<Record<string, WidgetRegistryEntry>>;

/** 탭에 놓인 위젯 인스턴스 — 넓은 화면(24칸) 좌표. */
export interface WidgetItem {
  instId: string;
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  locked: boolean;
  config: unknown | null;
}

export interface WidgetTab {
  tabId: string;
  name: string;
  seq: number;
  locked: boolean;
  items: WidgetItem[];
}

/** 저장소 — 화면이 서버 서비스(secWidget)로 구현해 주입한다. 실패는 Error(message) 로 던진다. */
export interface WidgetStore {
  /** 사용자 탭 전체. 「홈」 탭을 한 번도 저장하지 않았으면 결과에 home 이 없다. */
  load(): Promise<WidgetTab[]>;
  /** 탭 하나를 통째로 바꾼다(없으면 만든다). */
  saveTab(tab: WidgetTab): Promise<void>;
  deleteTab(tabId: string): Promise<void>;
  /** 「홈」을 뺀 탭 ID 를 새 순서대로. */
  reorderTabs(tabIds: string[]): Promise<void>;
  /** 사용자 「홈」 배치를 지운다(다음부터 기본 배치). */
  resetHome(): Promise<void>;
}

export type WidgetMoveKey = "left" | "right" | "up" | "down";
```

`src/frontend/shared/src/widget/constants.ts`:
```ts
/** 위젯 격자 규격·한도(스펙 §3.2·§3.5). */
export const WIDGET_COLS = 24;
export const WIDGET_ROW_HEIGHT = 20;
export const WIDGET_MARGIN = 8;
export const WIDGET_WIDE_MIN_WIDTH = 1200;
export const WIDGET_MEDIUM_MIN_WIDTH = 768;
export const WIDGET_DEFAULT_MIN_SIZE = { w: 4, h: 6 } as const;
export const WIDGET_RESIZE_HANDLES = ["n", "e", "s", "w", "ne", "se", "sw", "nw"] as const;

export const HOME_TAB_ID = "home";
export const HOME_TAB_NAME = "홈";
export const MAX_TABS = 10;
export const MAX_WIDGETS_PER_TAB = 30;
export const TAB_NAME_MAX = 20;
export const MIN_REFRESH_SEC = 30;
```

- [ ] **Step 3: 실패하는 시험 작성**

`src/frontend/shared/tests/unit/widget-layout.unit.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
  addItem,
  canAddWidget,
  colsForWidth,
  homeTab,
  itemsEqual,
  moveByKey,
  newInstanceId,
  nextTabId,
  reflowLayout,
  removeItem,
  sanitizeLayout,
  tabsEqual,
  toggleLock,
  validateTabName,
  validateWidgetMeta,
} from "../../src/widget/widget-layout";
import type { WidgetItem, WidgetMeta, WidgetRegistry, WidgetTab } from "../../src/widget/types";

const meta = (id: string, w = 6, h = 6, extra: Partial<WidgetMeta> = {}): WidgetMeta => ({
  id,
  title: id,
  defaultSize: { w, h },
  ...extra,
});
const REG: WidgetRegistry = {
  "t.a": { meta: meta("t.a"), load: async () => ({ default: () => null }) },
  "t.b": { meta: meta("t.b", 8, 10, { minSize: { w: 6, h: 8 } }), load: async () => ({ default: () => null }) },
  "t.one": { meta: meta("t.one", 6, 6, { multiple: false }), load: async () => ({ default: () => null }) },
};
const it_ = (instId: string, widgetId: string, x: number, y: number, w: number, h: number, locked = false): WidgetItem => ({
  instId, widgetId, x, y, w, h, locked, config: null,
});

/** 두 위젯이 겹치는지. */
function overlaps(a: WidgetItem, b: WidgetItem) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function assertNoOverlap(items: WidgetItem[]) {
  for (let i = 0; i < items.length; i += 1)
    for (let j = i + 1; j < items.length; j += 1) expect(overlaps(items[i], items[j]), `${items[i].instId}↔${items[j].instId}`).toBe(false);
}

describe("colsForWidth", () => {
  it("1200 이상 24칸, 768 이상 12칸, 그 아래 1칸", () => {
    expect(colsForWidth(1440)).toBe(24);
    expect(colsForWidth(1200)).toBe(24);
    expect(colsForWidth(1199)).toBe(12);
    expect(colsForWidth(768)).toBe(12);
    expect(colsForWidth(767)).toBe(1);
  });
});

describe("validateWidgetMeta", () => {
  it("기본 크기가 최소·최대 밖이면 문제를 돌려준다", () => {
    expect(validateWidgetMeta(meta("t.ok", 6, 6))).toEqual([]);
    expect(validateWidgetMeta(meta("t.small", 2, 6))).toHaveLength(1);
    expect(validateWidgetMeta(meta("t.big", 30, 6))).toHaveLength(1);
    expect(validateWidgetMeta(meta("bad id", 6, 6))).toHaveLength(1);
  });
});

describe("sanitizeLayout", () => {
  it("격자 밖 좌표를 안으로 자르고 겹침을 위로 당김으로 푼다", () => {
    const out = sanitizeLayout(
      [it_("a", "t.a", 22, 0, 6, 6), it_("b", "t.a", 0, 0, 6, 6), it_("c", "t.a", 0, 0, 6, 6)],
      REG
    );
    expect(out).toHaveLength(3);
    for (const i of out) {
      expect(i.x).toBeGreaterThanOrEqual(0);
      expect(i.x + i.w).toBeLessThanOrEqual(24);
    }
    assertNoOverlap(out);
  });

  it("최소 크기보다 작으면 최소로 키우고, 정수가 아닌 값·NaN 을 정리한다", () => {
    const out = sanitizeLayout([it_("b", "t.b", 1.6, Number.NaN, 2, 3)], REG);
    expect(out[0]).toMatchObject({ x: 2, y: 0, w: 6, h: 8 });
  });

  it("같은 instId 는 처음 것만 남긴다", () => {
    const out = sanitizeLayout([it_("a", "t.a", 0, 0, 6, 6), it_("a", "t.a", 6, 0, 6, 6)], REG);
    expect(out.map((i) => i.instId)).toEqual(["a"]);
  });

  it("등록부에 없는 위젯은 지우지 않고 크기만 1~24 로 자른다", () => {
    const out = sanitizeLayout([it_("x", "gone.widget", 0, 0, 40, 0)], REG);
    expect(out[0]).toMatchObject({ widgetId: "gone.widget", w: 24, h: 1 });
  });

  it("잠긴 위젯은 당김에도 자리를 지킨다", () => {
    const out = sanitizeLayout([it_("l", "t.a", 0, 10, 6, 6, true), it_("a", "t.a", 6, 30, 6, 6)], REG);
    expect(out.find((i) => i.instId === "l")).toMatchObject({ x: 0, y: 10 });
    expect(out.find((i) => i.instId === "a")!.y).toBe(0);
  });
});

describe("reflowLayout", () => {
  const wide = [it_("a", "t.a", 0, 0, 12, 6), it_("b", "t.a", 12, 0, 12, 6), it_("c", "t.a", 0, 6, 24, 6)];
  it("24칸이면 그대로", () => {
    expect(reflowLayout(wide, 24)).toEqual(wide);
  });
  it("12칸이면 x·w 를 절반으로 줄이고 겹치지 않는다", () => {
    const out = reflowLayout(wide, 12);
    expect(out.find((i) => i.instId === "a")).toMatchObject({ x: 0, w: 6 });
    expect(out.find((i) => i.instId === "b")).toMatchObject({ x: 6, w: 6 });
    expect(out.find((i) => i.instId === "c")).toMatchObject({ x: 0, w: 12 });
    assertNoOverlap(out);
  });
  it("1칸이면 위→아래·왼→오른 순서로 한 줄씩 쌓는다", () => {
    const out = reflowLayout(wide, 1);
    expect(out.map((i) => [i.instId, i.x, i.y, i.w])).toEqual([
      ["a", 0, 0, 1],
      ["b", 0, 6, 1],
      ["c", 0, 12, 1],
    ]);
  });
});

describe("addItem · removeItem · toggleLock · canAddWidget", () => {
  it("자리를 주지 않으면 맨 아래 왼쪽에 기본 크기로 놓는다", () => {
    const out = addItem([it_("a", "t.a", 0, 0, 24, 6)], "t.b", REG["t.b"].meta, "n1");
    expect(out.find((i) => i.instId === "n1")).toMatchObject({ x: 0, y: 6, w: 8, h: 10, locked: false, config: null });
  });
  it("자리를 주면 그 자리에 놓고 겹치는 위젯을 밀어낸다", () => {
    const out = addItem([it_("a", "t.a", 0, 0, 6, 6)], "t.a", REG["t.a"].meta, "n1", { x: 0, y: 0 });
    assertNoOverlap(out);
    expect(out.find((i) => i.instId === "n1")).toMatchObject({ x: 0, y: 0 });
  });
  it("잠긴 위젯은 빼지 않는다", () => {
    const items = [it_("l", "t.a", 0, 0, 6, 6, true)];
    expect(removeItem(items, "l")).toEqual(items);
    expect(removeItem([it_("a", "t.a", 0, 0, 6, 6)], "a")).toEqual([]);
  });
  it("잠금을 뒤집는다", () => {
    expect(toggleLock([it_("a", "t.a", 0, 0, 6, 6)], "a")[0].locked).toBe(true);
  });
  it("multiple:false 위젯이 이미 있거나 30개면 더 놓을 수 없다", () => {
    expect(canAddWidget([it_("o", "t.one", 0, 0, 6, 6)], REG["t.one"].meta)).toBe(false);
    expect(canAddWidget([], REG["t.one"].meta)).toBe(true);
    const many = Array.from({ length: 30 }, (_, i) => it_(`w${i}`, "t.a", 0, i * 6, 6, 6));
    expect(canAddWidget(many, REG["t.a"].meta)).toBe(false);
  });
});

describe("moveByKey", () => {
  const base = [it_("a", "t.a", 0, 0, 6, 6), it_("b", "t.a", 0, 6, 6, 6)];
  it("←→ 는 한 칸 옮기고 격자 밖으로 나가지 않는다", () => {
    expect(moveByKey(base, "a", "right", "move", REG).find((i) => i.instId === "a")!.x).toBe(1);
    expect(moveByKey(base, "a", "left", "move", REG).find((i) => i.instId === "a")!.x).toBe(0);
  });
  it("↓ 는 아래 위젯과 위아래 순서를 바꾼다", () => {
    const out = moveByKey(base, "a", "down", "move", REG);
    expect(out.find((i) => i.instId === "b")!.y).toBeLessThan(out.find((i) => i.instId === "a")!.y);
    assertNoOverlap(out);
  });
  it("↑ 는 위 위젯과 위아래 순서를 바꾼다", () => {
    const out = moveByKey(base, "b", "up", "move", REG);
    expect(out.find((i) => i.instId === "b")!.y).toBeLessThan(out.find((i) => i.instId === "a")!.y);
    assertNoOverlap(out);
  });
  it("resize 는 폭·높이를 한 칸 바꾸고 최소 크기 아래로 내려가지 않는다", () => {
    expect(moveByKey(base, "a", "right", "resize", REG).find((i) => i.instId === "a")!.w).toBe(7);
    const small = [it_("b2", "t.b", 0, 0, 6, 8)];
    expect(moveByKey(small, "b2", "left", "resize", REG)[0].w).toBe(6);
    expect(moveByKey(small, "b2", "up", "resize", REG)[0].h).toBe(8);
  });
  it("잠긴 위젯은 움직이지 않는다", () => {
    const locked = [it_("l", "t.a", 0, 0, 6, 6, true)];
    expect(moveByKey(locked, "l", "right", "move", REG)).toEqual(locked);
  });
});

describe("비교·탭 도우미", () => {
  const tab = (tabId: string, name: string, items: WidgetItem[] = []): WidgetTab => ({ tabId, name, seq: 1, locked: false, items });
  it("itemsEqual 은 순서와 상관없이 같은 배치를 같다고 본다", () => {
    const a = [it_("a", "t.a", 0, 0, 6, 6), it_("b", "t.a", 6, 0, 6, 6)];
    expect(itemsEqual(a, [a[1], a[0]])).toBe(true);
    expect(itemsEqual(a, [a[0], { ...a[1], x: 7 }])).toBe(false);
  });
  it("tabsEqual 은 이름·잠금·배치를 비교한다", () => {
    expect(tabsEqual(tab("tab-1", "가"), tab("tab-1", "가"))).toBe(true);
    expect(tabsEqual(tab("tab-1", "가"), tab("tab-1", "나"))).toBe(false);
  });
  it("validateTabName 은 빈 이름·20자 초과·중복을 거른다", () => {
    const tabs = [tab("home", "홈"), tab("tab-1", "내 생산")];
    expect(validateTabName("  ", tabs, "tab-2")).toBe("탭 이름을 입력해 주세요.");
    expect(validateTabName("가".repeat(21), tabs, "tab-2")).toBe("탭 이름은 20자 이하로 정합니다.");
    expect(validateTabName("내 생산", tabs, "tab-2")).toBe("같은 이름의 탭이 있습니다.");
    expect(validateTabName("내 생산", tabs, "tab-1")).toBeNull();
    expect(validateTabName("품질", tabs, "tab-2")).toBeNull();
  });
  it("nextTabId 는 쓰지 않은 tab-n 을 고른다", () => {
    expect(nextTabId([tab("home", "홈"), tab("tab-1", "a"), tab("tab-3", "b")])).toBe("tab-2");
  });
  it("newInstanceId 는 40자 이하이고 겹치지 않는다", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newInstanceId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id.length).toBeLessThanOrEqual(40);
  });
  it("homeTab 은 홈 탭을 만든다", () => {
    expect(homeTab([])).toEqual({ tabId: "home", name: "홈", seq: 0, locked: false, items: [] });
  });
});
```

- [ ] **Step 4: 시험이 실패하는지 확인**

Run: `cd src/frontend/shared && pnpm vitest run tests/unit/widget-layout.unit.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/widget/widget-layout"`

- [ ] **Step 5: 순수 함수 구현**

`src/frontend/shared/src/widget/widget-layout.ts`:
```ts
/**
 * 위젯 배치 순수 함수 — React·DOM 에 기대지 않아 단위 시험으로 고정한다(스펙 §3·§4.3).
 * 좌표는 늘 넓은 화면(24칸) 기준이다. 당김·충돌은 react-grid-layout/core 의 verticalCompactor·moveElement 를 쓴다.
 */
import { moveElement, verticalCompactor, type Layout, type LayoutItem } from "react-grid-layout/core";

import {
  HOME_TAB_ID,
  HOME_TAB_NAME,
  MAX_WIDGETS_PER_TAB,
  TAB_NAME_MAX,
  WIDGET_COLS,
  WIDGET_DEFAULT_MIN_SIZE,
  WIDGET_MEDIUM_MIN_WIDTH,
  WIDGET_WIDE_MIN_WIDTH,
} from "./constants";
import type { WidgetItem, WidgetMeta, WidgetMoveKey, WidgetRegistry, WidgetSize, WidgetTab } from "./types";

const WIDGET_ID_RE = /^[a-z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*$/;

export function colsForWidth(width: number): 24 | 12 | 1 {
  if (width >= WIDGET_WIDE_MIN_WIDTH) return 24;
  if (width >= WIDGET_MEDIUM_MIN_WIDTH) return 12;
  return 1;
}

export function minSizeOf(meta?: WidgetMeta): WidgetSize {
  return meta?.minSize ?? { ...WIDGET_DEFAULT_MIN_SIZE };
}

export function maxSizeOf(meta?: WidgetMeta): WidgetSize {
  return {
    w: Math.min(meta?.maxSize?.w ?? WIDGET_COLS, WIDGET_COLS),
    h: meta?.maxSize?.h ?? Number.POSITIVE_INFINITY,
  };
}

/** 메타 문제 목록(없으면 []). 등록부를 읽을 때 콘솔 오류로 알리고 크기는 범위로 자른다. */
export function validateWidgetMeta(meta: WidgetMeta): string[] {
  const problems: string[] = [];
  if (!WIDGET_ID_RE.test(meta.id)) problems.push(`${meta.id}: id 는 "{모듈}.{이름}" 형식이어야 합니다.`);
  const min = minSizeOf(meta);
  const max = maxSizeOf(meta);
  const { w, h } = meta.defaultSize;
  if (w < min.w || h < min.h || w > max.w || h > max.h) {
    problems.push(`${meta.id}: defaultSize ${w}×${h} 가 최소 ${min.w}×${min.h}·최대 ${max.w}×${max.h} 범위 밖입니다.`);
  }
  return problems;
}

const toInt = (v: number, fallback: number) => (Number.isFinite(v) ? Math.round(v) : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function clampItem(item: WidgetItem, registry: WidgetRegistry, cols: number = WIDGET_COLS): WidgetItem {
  const meta = registry[item.widgetId]?.meta;
  const min = meta ? minSizeOf(meta) : { w: 1, h: 1 };
  const max = meta ? maxSizeOf(meta) : { w: cols, h: Number.POSITIVE_INFINITY };
  const w = clamp(toInt(item.w, min.w), Math.min(min.w, cols), Math.min(max.w, cols));
  const h = clamp(toInt(item.h, min.h), min.h, max.h);
  const x = clamp(toInt(item.x, 0), 0, cols - w);
  const y = Math.max(0, toInt(item.y, 0));
  return { ...item, x, y, w, h, locked: Boolean(item.locked), config: item.config ?? null };
}

function toLayout(items: readonly WidgetItem[]): LayoutItem[] {
  return items.map((i) => ({ i: i.instId, x: i.x, y: i.y, w: i.w, h: i.h, static: i.locked }));
}

function fromLayout(layout: Layout, items: readonly WidgetItem[]): WidgetItem[] {
  const pos = new Map(layout.map((l) => [l.i, l]));
  return items.map((it) => {
    const l = pos.get(it.instId);
    return l ? { ...it, x: l.x, y: l.y, w: l.w, h: l.h } : it;
  });
}

function compact(items: readonly WidgetItem[], cols: number = WIDGET_COLS): WidgetItem[] {
  return fromLayout(verticalCompactor.compact(toLayout(items), cols), items);
}

/** 서버·저장값을 화면에 쓰기 전에 정리한다 — 중복 instId 제거, 크기·좌표 자르기, 겹침을 당김으로 풀기. */
export function sanitizeLayout(items: readonly WidgetItem[], registry: WidgetRegistry): WidgetItem[] {
  const seen = new Set<string>();
  const unique: WidgetItem[] = [];
  for (const it of items) {
    if (!it || !it.instId || seen.has(it.instId)) continue;
    seen.add(it.instId);
    unique.push(clampItem(it, registry));
  }
  return compact(unique);
}

/** 넓은 화면 배치를 중간(12칸)·좁은(1칸) 화면용으로 다시 흘린다(보기 전용). */
export function reflowLayout(items: readonly WidgetItem[], cols: number): WidgetItem[] {
  if (cols >= WIDGET_COLS) return [...items];
  const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  if (cols === 1) {
    let y = 0;
    return ordered.map((it) => {
      const out = { ...it, x: 0, y, w: 1 };
      y += it.h;
      return out;
    });
  }
  const ratio = cols / WIDGET_COLS;
  const scaled = ordered.map((it) => {
    const w = Math.max(1, Math.min(cols, Math.ceil(it.w * ratio)));
    const x = Math.min(Math.floor(it.x * ratio), cols - w);
    return { ...it, x, w, locked: false };
  });
  return compact(scaled, cols);
}

export function canAddWidget(items: readonly WidgetItem[], meta: WidgetMeta): boolean {
  if (items.length >= MAX_WIDGETS_PER_TAB) return false;
  if (meta.multiple === false && items.some((i) => i.widgetId === meta.id)) return false;
  return true;
}

/** 위젯을 놓는다 — at 이 없으면 맨 아래 왼쪽, 있으면 그 자리(겹친 위젯은 밀려난다). */
export function addItem(
  items: readonly WidgetItem[],
  widgetId: string,
  meta: WidgetMeta,
  instId: string,
  at?: { x: number; y: number }
): WidgetItem[] {
  const bottom = items.reduce((acc, i) => Math.max(acc, i.y + i.h), 0);
  const placed = clampItem(
    { instId, widgetId, x: at?.x ?? 0, y: at?.y ?? bottom, w: meta.defaultSize.w, h: meta.defaultSize.h, locked: false, config: null },
    { [widgetId]: { meta, load: async () => ({ default: null }) } }
  );
  const layout = toLayout([...items, placed]);
  const target = layout[layout.length - 1];
  const moved = moveElement(layout, target, placed.x, placed.y, true, false, "vertical", WIDGET_COLS);
  return compact(fromLayout(moved, [...items, placed]));
}

export function removeItem(items: readonly WidgetItem[], instId: string): WidgetItem[] {
  const target = items.find((i) => i.instId === instId);
  if (!target || target.locked) return [...items];
  return compact(items.filter((i) => i.instId !== instId));
}

export function toggleLock(items: readonly WidgetItem[], instId: string): WidgetItem[] {
  return items.map((i) => (i.instId === instId ? { ...i, locked: !i.locked } : i));
}

/** 키보드 이동(mode=move) · 크기 조절(mode=resize). 잠긴 위젯은 그대로. ↑↓ 는 위·아래 이웃과 순서를 바꾼다. */
export function moveByKey(
  items: readonly WidgetItem[],
  instId: string,
  key: WidgetMoveKey,
  mode: "move" | "resize",
  registry: WidgetRegistry
): WidgetItem[] {
  const target = items.find((i) => i.instId === instId);
  if (!target || target.locked) return [...items];
  if (mode === "resize") {
    const dw = key === "right" ? 1 : key === "left" ? -1 : 0;
    const dh = key === "down" ? 1 : key === "up" ? -1 : 0;
    const resized = clampItem({ ...target, w: target.w + dw, h: target.h + dh }, registry);
    return compact(items.map((i) => (i.instId === instId ? resized : i)));
  }
  let nx = target.x;
  let ny = target.y;
  if (key === "left") nx = Math.max(0, target.x - 1);
  if (key === "right") nx = Math.min(WIDGET_COLS - target.w, target.x + 1);
  const sharesColumns = (o: WidgetItem) => o.instId !== instId && o.x < target.x + target.w && target.x < o.x + o.w;
  if (key === "down") {
    const below = items.filter((o) => sharesColumns(o) && o.y >= target.y + target.h).sort((a, b) => a.y - b.y)[0];
    if (!below) return [...items];
    ny = below.y + below.h - target.h + 1;
  }
  if (key === "up") {
    const above = items.filter((o) => sharesColumns(o) && o.y + o.h <= target.y).sort((a, b) => b.y - a.y)[0];
    if (!above) return [...items];
    ny = above.y;
  }
  const layout = toLayout(items);
  const l = layout.find((x) => x.i === instId)!;
  const moved = moveElement(layout, l, nx, ny, true, false, "vertical", WIDGET_COLS);
  return compact(fromLayout(moved, items));
}

const itemKey = (i: WidgetItem) => `${i.instId}|${i.widgetId}|${i.x}|${i.y}|${i.w}|${i.h}|${i.locked ? 1 : 0}`;

export function itemsEqual(a: readonly WidgetItem[], b: readonly WidgetItem[]): boolean {
  if (a.length !== b.length) return false;
  const sa = a.map(itemKey).sort();
  const sb = b.map(itemKey).sort();
  return sa.every((k, idx) => k === sb[idx]);
}

export function tabsEqual(a: WidgetTab, b: WidgetTab): boolean {
  return a.tabId === b.tabId && a.name === b.name && a.locked === b.locked && itemsEqual(a.items, b.items);
}

export function validateTabName(name: string, tabs: readonly WidgetTab[], selfTabId: string): string | null {
  const v = name.trim();
  if (!v) return "탭 이름을 입력해 주세요.";
  if (v.length > TAB_NAME_MAX) return `탭 이름은 ${TAB_NAME_MAX}자 이하로 정합니다.`;
  if (tabs.some((t) => t.tabId !== selfTabId && t.name === v)) return "같은 이름의 탭이 있습니다.";
  return null;
}

export function nextTabId(tabs: readonly WidgetTab[]): string {
  const used = new Set(tabs.map((t) => t.tabId));
  let n = 1;
  while (used.has(`tab-${n}`)) n += 1;
  return `tab-${n}`;
}

export function newInstanceId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `w-${Date.now().toString(36)}-${rand}`;
}

export function homeTab(items: readonly WidgetItem[]): WidgetTab {
  return { tabId: HOME_TAB_ID, name: HOME_TAB_NAME, seq: 0, locked: false, items: [...items] };
}
```

`moveElement`·`verticalCompactor.compact` 의 실제 결과가 시험 기대와 다르면 시험을 고치지 말고 위 구현(이웃 찾기·목표 y 계산)을 고친다. 단 "겹침 없음"·"격자 안" 단언은 절대 완화하지 않는다.

- [ ] **Step 6: 시험 통과 확인**

Run: `cd src/frontend/shared && pnpm vitest run tests/unit/widget-layout.unit.test.ts`
Expected: PASS (전부)

- [ ] **Step 7: 진입점 등록**

`src/frontend/shared/src/widget/index.ts`(이 작업에서는 타입·상수·함수만, 뒤 작업이 컴포넌트를 덧붙인다):
```ts
export * from "./types";
export * from "./constants";
export {
  addItem,
  canAddWidget,
  colsForWidth,
  homeTab,
  itemsEqual,
  maxSizeOf,
  minSizeOf,
  moveByKey,
  newInstanceId,
  nextTabId,
  reflowLayout,
  removeItem,
  sanitizeLayout,
  tabsEqual,
  toggleLock,
  validateTabName,
  validateWidgetMeta,
} from "./widget-layout";
```

`src/frontend/shared/tsup.config.ts` 의 `entry` 에서 `dashboard:` 줄 바로 아래에:
```ts
    widget: "src/widget/index.ts",
```
`external` 배열에는 넣지 않는다(react-grid-layout 을 widget.js 에 묶는다 — 다른 진입점이 쓰지 않는다).

`src/frontend/shared/package.json` 의 `exports` 에서 `"./dashboard"` 항목 바로 아래에:
```json
    "./widget": {
      "types": "./dist/types/widget/index.d.ts",
      "import": "./dist/widget.js"
    },
```

- [ ] **Step 8: 진입점 시험·타입 검사**

Run: `cd src/frontend/shared && pnpm vitest run tests/unit/package-exports.unit.test.ts tests/unit/widget-layout.unit.test.ts && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS, 타입 오류 0

- [ ] **Step 9: Commit**

```bash
/usr/bin/git add src/frontend/shared/src/widget src/frontend/shared/tests/unit/widget-layout.unit.test.ts src/frontend/shared/package.json src/frontend/shared/tsup.config.ts src/frontend/pnpm-lock.yaml
/usr/bin/git commit -m "feat(shared): 위젯 계약 타입과 배치 순수 함수를 추가한다" -m "쉬운 설명: 홈 화면 위젯을 자유롭게 놓고 크기를 바꾸기 위한 기본 규칙(격자 24칸, 겹침 정리, 탭 이름 검사)을 만들었습니다.

- @dk-oasis/shared/widget 진입점, react-grid-layout 2.2.4
- sanitizeLayout·reflowLayout·addItem·moveByKey 등과 단위 시험

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: WidgetFrame(위젯 공통 틀)과 틀 훅·스타일

**Files:**
- Create: `src/frontend/shared/src/widget/frame-context.ts`, `WidgetFrame.tsx`, `styles.tsx`
- Modify: `src/frontend/shared/src/widget/index.ts`
- Test: `src/frontend/shared/tests/unit/widget-frame.unit.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `WidgetItem`, `WidgetRegistryEntry`, `WidgetComponent`, `WidgetMoveKey`, `MIN_REFRESH_SEC`
- Produces:
  - `WidgetFrame(props: WidgetFrameProps)` — `WidgetFrameProps = { item: WidgetItem; entry: WidgetRegistryEntry | undefined; editing: boolean; sizeLabel?: string | null; onToggleLock(instId: string): void; onRemove(instId: string): void; onKeyMove?(instId: string, key: WidgetMoveKey, mode: "move" | "resize"): void }`
  - 위젯 본체용: `useWidgetStatus(): (status: WidgetStatus) => void`(`WidgetStatus = { kind: "ready" } | { kind: "loading" } | { kind: "error"; message: string; retry?: () => void }`), `useWidgetBodySize(): { width: number; height: number | null }`, `WidgetHeaderActions({ children })`, `WidgetTitleExtra({ children })`
  - `WIDGET_CSS`, `WidgetStyle()`, CSS 클래스 `cm-widget`, `cm-widget__head`(끌기 손잡이), `cm-widget__btn`(끌기 취소 대상)
  - `openPortalPage(pageId: string): void` — `window` 에 `portal-open-tab` 이벤트(`detail: { pageId }`)를 보낸다

- [ ] **Step 1: 실패하는 시험 작성**

`src/frontend/shared/tests/unit/widget-frame.unit.test.ts`:
```ts
/** @vitest-environment happy-dom */
import { act, createElement as h, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetFrame, WidgetHeaderActions, useWidgetStatus } from "../../src/widget";
import type { WidgetItem, WidgetRegistryEntry } from "../../src/widget";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const item = (extra: Partial<WidgetItem> = {}): WidgetItem => ({
  instId: "i1", widgetId: "t.a", x: 0, y: 0, w: 6, h: 6, locked: false, config: null, ...extra,
});
const entry = (component: unknown, extra: Partial<WidgetRegistryEntry["meta"]> = {}): WidgetRegistryEntry => ({
  meta: { id: "t.a", title: "샘플 위젯", defaultSize: { w: 6, h: 6 }, ...extra },
  load: async () => ({ default: component }),
});
const noop = () => {};

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

describe("WidgetFrame", () => {
  it("제목을 그리고 지연 로딩한 본체를 보인다", async () => {
    const Body = () => h("p", { "data-testid": "body" }, "본문");
    act(() => root.render(h(WidgetFrame, { item: item(), entry: entry(Body), editing: false, onToggleLock: noop, onRemove: noop })));
    await flush();
    expect(host.querySelector(".cm-widget__title")!.textContent).toBe("샘플 위젯");
    expect(host.querySelector('[data-testid="body"]')!.textContent).toBe("본문");
    expect(host.querySelector(".cm-widget")!.getAttribute("data-widget-id")).toBe("t.a");
  });

  it("본체가 렌더 중 예외를 던져도 틀 안에 안내와 [다시 시도]만 보인다", async () => {
    const Broken = () => {
      throw new Error("boom");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => root.render(h(WidgetFrame, { item: item(), entry: entry(Broken), editing: false, onToggleLock: noop, onRemove: noop })));
    await flush();
    expect(host.textContent).toContain("위젯을 불러오지 못했습니다.");
    expect(host.querySelector('[data-action="retry"]')).not.toBeNull();
    spy.mockRestore();
  });

  it("useWidgetStatus 의 error 를 틀이 공통 모양으로 그린다", async () => {
    const retry = vi.fn();
    const Body = () => {
      const setStatus = useWidgetStatus();
      useEffect(() => setStatus({ kind: "error", message: "조회 실패", retry }), [setStatus]);
      return h("p", null, "본문");
    };
    act(() => root.render(h(WidgetFrame, { item: item(), entry: entry(Body), editing: false, onToggleLock: noop, onRemove: noop })));
    await flush();
    expect(host.textContent).toContain("조회 실패");
    act(() => (host.querySelector('[data-action="retry"]') as HTMLButtonElement).click());
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("WidgetHeaderActions 내용은 제목 줄로 옮겨진다", async () => {
    const Body = () => h(WidgetHeaderActions, null, h("span", { "data-testid": "act" }, "배지"));
    act(() => root.render(h(WidgetFrame, { item: item(), entry: entry(Body), editing: false, onToggleLock: noop, onRemove: noop })));
    await flush();
    expect(host.querySelector(".cm-widget__head [data-testid='act']")).not.toBeNull();
  });

  it("보기 모드에서는 새로 고침·화면 열기만, 편집 모드에서는 잠금·빼기만 보인다", async () => {
    const Body = () => h("p", null, "본문");
    const props = { item: item(), entry: entry(Body, { linkPageId: "mls:lsh/noticeMgmt" }), onToggleLock: noop, onRemove: noop };
    act(() => root.render(h(WidgetFrame, { ...props, editing: false })));
    await flush();
    expect(host.querySelector('[data-action="refresh"]')).not.toBeNull();
    expect(host.querySelector('[data-action="open"]')).not.toBeNull();
    expect(host.querySelector('[data-action="remove"]')).toBeNull();
    act(() => root.render(h(WidgetFrame, { ...props, editing: true })));
    expect(host.querySelector('[data-action="refresh"]')).toBeNull();
    expect(host.querySelector('[data-action="lock"]')).not.toBeNull();
    expect(host.querySelector('[data-action="remove"]')).not.toBeNull();
  });

  it("「화면 열기」는 portal-open-tab 이벤트를 보낸다", async () => {
    const Body = () => h("p", null, "본문");
    const seen: string[] = [];
    const onOpen = (e: Event) => seen.push((e as CustomEvent<{ pageId: string }>).detail.pageId);
    window.addEventListener("portal-open-tab", onOpen);
    act(() => root.render(h(WidgetFrame, { item: item(), entry: entry(Body, { linkPageId: "mls:lsh/noticeMgmt" }), editing: false, onToggleLock: noop, onRemove: noop })));
    await flush();
    act(() => (host.querySelector('[data-action="open"]') as HTMLButtonElement).click());
    window.removeEventListener("portal-open-tab", onOpen);
    expect(seen).toEqual(["mls:lsh/noticeMgmt"]);
  });

  it("잠긴 위젯은 편집 모드에서 빼기 버튼이 비활성이다", async () => {
    const onRemove = vi.fn();
    act(() => root.render(h(WidgetFrame, { item: item({ locked: true }), entry: entry(() => null), editing: true, onToggleLock: noop, onRemove })));
    await flush();
    const btn = host.querySelector('[data-action="remove"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("등록부에 없는 위젯은 「없는 위젯」 칸과 ✕ 만 보인다", () => {
    const onRemove = vi.fn();
    act(() => root.render(h(WidgetFrame, { item: item({ widgetId: "gone.x" }), entry: undefined, editing: true, onToggleLock: noop, onRemove })));
    expect(host.textContent).toContain("없는 위젯");
    expect(host.textContent).toContain("gone.x");
    act(() => (host.querySelector('[data-action="remove"]') as HTMLButtonElement).click());
    expect(onRemove).toHaveBeenCalledWith("i1");
  });

  it("편집 모드에서 제목 줄 키보드로 이동·크기 조절을 알린다", async () => {
    const onKeyMove = vi.fn();
    act(() => root.render(h(WidgetFrame, { item: item(), entry: entry(() => null), editing: true, onToggleLock: noop, onRemove: noop, onKeyMove })));
    await flush();
    const head = host.querySelector(".cm-widget__head") as HTMLElement;
    act(() => head.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    act(() => head.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true })));
    expect(onKeyMove.mock.calls).toEqual([
      ["i1", "right", "move"],
      ["i1", "down", "resize"],
    ]);
  });
});
```

- [ ] **Step 2: 시험 실패 확인**

Run: `cd src/frontend/shared && pnpm vitest run tests/unit/widget-frame.unit.test.ts`
Expected: FAIL — `WidgetFrame` 이 export 되지 않음

- [ ] **Step 3: 틀 맥락·훅 구현**

`src/frontend/shared/src/widget/frame-context.ts`:
```ts
"use client";

/** 위젯 틀 맥락 — 위젯 본체가 틀에 상태를 알리고, 제목 줄 자리에 내용을 넣고, 본문 크기를 읽는다(스펙 §2.2). */
import { createContext, createElement, Fragment, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type WidgetStatus =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "error"; message: string; retry?: () => void };

export interface WidgetFrameApi {
  setStatus: (status: WidgetStatus) => void;
  bodySize: { width: number; height: number | null };
  actionsSlot: HTMLElement | null;
  titleSlot: HTMLElement | null;
}

const NOOP_API: WidgetFrameApi = {
  setStatus: () => {},
  bodySize: { width: 0, height: null },
  actionsSlot: null,
  titleSlot: null,
};

export const WidgetFrameContext = createContext<WidgetFrameApi>(NOOP_API);

export function useWidgetStatus(): (status: WidgetStatus) => void {
  return useContext(WidgetFrameContext).setStatus;
}

export function useWidgetBodySize(): { width: number; height: number | null } {
  return useContext(WidgetFrameContext).bodySize;
}

/** 제목 줄 오른쪽(버튼 앞)에 위젯 고유 버튼·배지를 넣는다. */
export function WidgetHeaderActions({ children }: { children?: ReactNode }) {
  const slot = useContext(WidgetFrameContext).actionsSlot;
  return slot ? createPortal(createElement(Fragment, null, children), slot) : null;
}

/** 제목 바로 옆에 동적 부제·배지를 넣는다(예: "안읽음 3건"). */
export function WidgetTitleExtra({ children }: { children?: ReactNode }) {
  const slot = useContext(WidgetFrameContext).titleSlot;
  return slot ? createPortal(createElement(Fragment, null, children), slot) : null;
}

/** 포털 셸이 듣는 화면 열기 이벤트(m-mcm home types.ts openPortalTab 과 같은 계약). */
export function openPortalPage(pageId: string): void {
  window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId } }));
}
```

- [ ] **Step 4: 스타일 작성**

`src/frontend/shared/src/widget/styles.tsx` — react-grid-layout 의 `css/styles.css` 와 react-resizable 의 `css/styles.css` 중 배치에 필요한 규칙(`.react-grid-layout`, `.react-grid-item`, `.react-grid-item.react-grid-placeholder`, `.react-grid-item > .react-resizable-handle`, `.react-resizable-handle-{n,e,s,w,ne,nw,se,sw}` 위치·커서)을 `node_modules/react-grid-layout/css/styles.css` 와 `node_modules/react-resizable/css/styles.css` 에서 그대로 옮기되, 손잡이 배경 이미지·색은 아래 토큰 규칙으로 바꾼다. 출처 주석을 남긴다.
```tsx
/**
 * 위젯 공용 스타일 — 컴포넌트가 `<style href precedence>` 로 한 번만 넣는다(Part B §18-3, dashboard/styles.tsx 와 같은 방식).
 * react-grid-layout·react-resizable 의 배치 필수 규칙을 옮겨 왔다(원본: node_modules/react-grid-layout/css/styles.css,
 * node_modules/react-resizable/css/styles.css, MIT). 색·간격은 공통 토큰만 쓴다. 한 변 컬러 바 금지.
 */
export const WIDGET_CSS = `
/* ── react-grid-layout 필수 규칙(원본에서 옮김) ── */
.react-grid-layout { position: relative; transition: height 200ms ease; }
.react-grid-item { transition: all 200ms ease; transition-property: left, top, width, height; }
.react-grid-item.cssTransforms { transition-property: transform, width, height; }
.react-grid-item.resizing { transition: none; z-index: 3; will-change: width, height; }
.react-grid-item.react-draggable-dragging { transition: none; z-index: 3; will-change: transform; }
.react-grid-item.dropping { visibility: hidden; }
.react-grid-item.react-grid-placeholder { background: var(--color-primary); opacity: 0.12; transition-duration: 100ms; z-index: 2; border-radius: var(--radius-md); user-select: none; }
.react-grid-item > .react-resizable-handle { position: absolute; width: 12px; height: 12px; z-index: 4; }
.react-resizable-handle-se { right: 2px; bottom: 2px; cursor: se-resize; }
.react-resizable-handle-sw { left: 2px; bottom: 2px; cursor: sw-resize; }
.react-resizable-handle-ne { right: 2px; top: 2px; cursor: ne-resize; }
.react-resizable-handle-nw { left: 2px; top: 2px; cursor: nw-resize; }
.react-grid-item > .react-resizable-handle.react-resizable-handle-n,
.react-grid-item > .react-resizable-handle.react-resizable-handle-s { left: 12px; right: 12px; width: auto; height: 8px; cursor: ns-resize; }
.react-grid-item > .react-resizable-handle.react-resizable-handle-n { top: -2px; }
.react-grid-item > .react-resizable-handle.react-resizable-handle-s { bottom: -2px; }
.react-grid-item > .react-resizable-handle.react-resizable-handle-e,
.react-grid-item > .react-resizable-handle.react-resizable-handle-w { top: 12px; bottom: 12px; height: auto; width: 8px; cursor: ew-resize; }
.react-grid-item > .react-resizable-handle.react-resizable-handle-e { right: -2px; }
.react-grid-item > .react-resizable-handle.react-resizable-handle-w { left: -2px; }
.react-grid-item:hover > .react-resizable-handle-se { border-right: 2px solid var(--color-primary); border-bottom: 2px solid var(--color-primary); }
.react-grid-item:hover > .react-resizable-handle-sw { border-left: 2px solid var(--color-primary); border-bottom: 2px solid var(--color-primary); }
.react-grid-item:hover > .react-resizable-handle-ne { border-right: 2px solid var(--color-primary); border-top: 2px solid var(--color-primary); }
.react-grid-item:hover > .react-resizable-handle-nw { border-left: 2px solid var(--color-primary); border-top: 2px solid var(--color-primary); }

/* ── 위젯 틀 ── */
.cm-widget { position: relative; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; background: var(--color-bg); border: 1px solid var(--color-border-light); border-radius: var(--radius-md); overflow: hidden; }
.cm-widget[data-editing="true"] .cm-widget__head { background: var(--color-bg-header); cursor: grab; }
.cm-widget[data-locked="true"][data-editing="true"] .cm-widget__head { cursor: default; }
.cm-widget[data-locked="true"] { border-color: var(--color-border); }
.cm-widget__head { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; min-height: 34px; padding: 0 6px 0 12px; border-bottom: 1px solid var(--color-border-light); outline: none; }
.cm-widget__head:focus-visible { box-shadow: inset 0 0 0 2px var(--color-focus); }
.cm-widget__title { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-lg); font-weight: 700; color: var(--color-text); }
.cm-widget__sub { flex-shrink: 0; font-size: var(--font-size-xs); color: var(--color-text-muted); }
.cm-widget__title-extra { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.cm-widget__spacer { flex: 1 1 auto; }
.cm-widget__actions { display: inline-flex; align-items: center; gap: 4px; }
.cm-widget__btn { width: 24px; height: 24px; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); cursor: pointer; font-size: 13px; }
.cm-widget__btn:hover:not(:disabled) { background: var(--color-bg-hover); color: var(--color-text); }
.cm-widget__btn:disabled { opacity: 0.35; cursor: not-allowed; }
.cm-widget__btn[aria-pressed="true"] { color: var(--color-primary); background: var(--color-primary-soft); }
.cm-widget__body { flex: 1 1 0; min-height: 0; overflow: auto; }
.cm-widget__body--padded { padding: var(--spacing-md) var(--spacing-lg); }
.cm-widget__state { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--spacing-sm); padding: var(--spacing-lg); text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.cm-widget__state--error { color: var(--color-danger); }
.cm-widget__text-btn { height: 26px; padding: 0 10px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text); font-size: var(--font-size-sm); cursor: pointer; }
.cm-widget__text-btn:hover { background: var(--color-bg-hover); }
.cm-widget__size { position: absolute; right: 8px; bottom: 8px; z-index: 5; padding: 2px 7px; border-radius: var(--radius-sm); background: var(--shell-header-bg); color: var(--shell-header-fg); font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; pointer-events: none; }
.cm-widget--missing { background: var(--color-bg-light); border-style: dashed; border-color: var(--color-border); }
.cm-widget--missing .cm-widget__title { color: var(--color-text-muted); }
.cm-widget__skeleton { padding: var(--spacing-lg); display: flex; flex-direction: column; gap: var(--spacing-sm); }
.cm-widget__skeleton i { display: block; height: 12px; border-radius: var(--radius-sm); background: var(--color-bg-hover); }

/* ── 보드·탭·서랍·작업 공간(뒤 작업에서 쓰는 클래스도 여기 둔다) ── */
.cm-widget-board { position: relative; min-height: 120px; }
.cm-widget-board[data-editing="true"] { border-radius: var(--radius-md); outline: 1px dashed color-mix(in srgb, var(--color-primary) 35%, transparent); outline-offset: 2px; background-color: color-mix(in srgb, var(--color-primary) 2%, transparent); }
.cm-widget-board__empty { padding: 40px 12px; text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.cm-widget-tabs { display: flex; align-items: flex-end; gap: 4px; min-height: 34px; border-bottom: 1px solid var(--color-border); }
.cm-widget-tab { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 32px; margin-bottom: -1px; padding: 0 6px 0 12px; border: 1px solid transparent; border-bottom: 0; border-radius: var(--radius-md) var(--radius-md) 0 0; background: transparent; color: var(--color-text-secondary); font-size: var(--font-size-md); cursor: pointer; }
.cm-widget-tab:hover { background: var(--color-bg-hover); }
.cm-widget-tab[aria-selected="true"] { background: var(--color-bg); border-color: var(--color-border); color: var(--color-text); font-weight: 600; }
.cm-widget-tab__lock { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.cm-widget-tab__more { width: 20px; height: 20px; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); cursor: pointer; letter-spacing: 1px; }
.cm-widget-tab__more:hover { background: var(--color-bg-hover); color: var(--color-text); }
.cm-widget-tab__name { width: 120px; height: 24px; padding: 0 6px; border: 1px solid var(--color-primary); border-radius: var(--radius-sm); font: inherit; }
.cm-widget-tab__error { position: absolute; left: 0; top: 100%; z-index: 30; margin-top: 4px; padding: 4px 8px; border-radius: var(--radius-sm); background: var(--color-danger-soft); color: var(--color-danger); font-size: var(--font-size-xs); white-space: nowrap; }
.cm-widget-tabs__add { width: 28px; height: 28px; margin-bottom: 3px; border: 1px dashed var(--color-border); border-radius: var(--radius-md); background: transparent; color: var(--color-text-muted); font-size: 16px; line-height: 1; cursor: pointer; }
.cm-widget-tabs__add:hover:not(:disabled) { color: var(--color-primary); border-color: var(--color-primary); }
.cm-widget-tabs__add:disabled { opacity: 0.4; cursor: not-allowed; }
.cm-widget-tabs__trailing { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; padding-bottom: 4px; }
.cm-widget-menu { position: absolute; z-index: 40; min-width: 176px; padding: 4px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: 0 6px 20px rgba(15, 23, 32, 0.16); }
.cm-widget-menu button { display: flex; width: 100%; align-items: center; gap: 8px; padding: 6px 10px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text); font-size: var(--font-size-md); text-align: left; cursor: pointer; }
.cm-widget-menu button:hover:not(:disabled) { background: var(--color-bg-hover); }
.cm-widget-menu button:disabled { color: var(--color-text-disabled); cursor: not-allowed; }
.cm-widget-menu button[data-danger="true"] { color: var(--color-danger); }
.cm-widget-menu hr { margin: 4px 0; border: 0; border-top: 1px solid var(--color-border-light); }
.cm-widget-picker { display: flex; flex-direction: column; width: 268px; flex: 0 0 268px; max-height: calc(100vh - 160px); position: sticky; top: 8px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.cm-widget-picker__head { padding: 10px 12px 8px; border-bottom: 1px solid var(--color-border-light); }
.cm-widget-picker__title { display: block; margin: 0 0 6px; font-size: var(--font-size-lg); font-weight: 700; }
.cm-widget-picker__search { width: 100%; height: 28px; box-sizing: border-box; padding: 0 8px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; }
.cm-widget-picker__list { overflow: auto; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
.cm-widget-picker__item { display: block; width: 100%; padding: 7px 9px; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); background: var(--color-bg); text-align: left; cursor: grab; }
.cm-widget-picker__item:hover:not(:disabled) { border-color: var(--color-primary); background: var(--color-primary-soft); }
.cm-widget-picker__item:disabled { opacity: 0.45; cursor: not-allowed; }
.cm-widget-picker__name { display: flex; justify-content: space-between; gap: 6px; font-weight: 600; font-size: var(--font-size-md); color: var(--color-text); }
.cm-widget-picker__size { font-weight: 400; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.cm-widget-picker__desc { margin: 2px 0 0; font-size: var(--font-size-xs); color: var(--color-text-muted); }
.cm-widget-picker__foot { padding: 8px 12px; border-top: 1px solid var(--color-border-light); font-size: var(--font-size-xs); color: var(--color-text-muted); }
.cm-widget-ws { display: flex; flex-direction: column; gap: var(--spacing-sm); min-width: 0; }
.cm-widget-ws__body { display: flex; gap: 10px; align-items: flex-start; }
.cm-widget-ws__board { flex: 1 1 auto; min-width: 0; }
.cm-widget-ws__banner { display: flex; align-items: center; gap: var(--spacing-md); padding: 6px 10px; border: 1px solid color-mix(in srgb, var(--color-danger) 35%, transparent); border-radius: var(--radius-md); background: var(--color-danger-soft); color: var(--color-danger); font-size: var(--font-size-sm); }
.cm-widget-ws__btn { height: 28px; padding: 0 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text); font-size: var(--font-size-sm); cursor: pointer; white-space: nowrap; }
.cm-widget-ws__btn:hover:not(:disabled) { background: var(--color-bg-hover); }
.cm-widget-ws__btn:disabled { opacity: 0.45; cursor: not-allowed; }
.cm-widget-ws__btn--primary { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-on-primary); }
.cm-widget-ws__btn--primary:hover:not(:disabled) { background: var(--color-primary-hover); }
.cm-widget-ws__hint { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-primary); }
`;

const STYLE_HREF = "cm-widget";

export function WidgetStyle() {
  return (
    <style href={STYLE_HREF} precedence="default">
      {WIDGET_CSS}
    </style>
  );
}
```

- [ ] **Step 5: WidgetFrame 구현**

`src/frontend/shared/src/widget/WidgetFrame.tsx`:
```tsx
"use client";

/**
 * 위젯 공통 틀 — 제목 줄(제목·부제·위젯 고유 자리·새로 고침·화면 열기 / 편집: 잠금·빼기)과 본문.
 * 본체는 등록부 load() 로 지연 로딩하고, 위젯마다 오류 경계를 둬 한 위젯이 죽어도 다른 위젯·보드는 그대로다(스펙 §6).
 * 제목 줄(.cm-widget__head)이 끌기 손잡이이고, 버튼(.cm-widget__btn)에서는 끌기가 시작되지 않는다(WidgetBoard dragConfig).
 */
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type KeyboardEvent as ReactKeyboardEvent,
  type LazyExoticComponent,
  type ReactNode,
} from "react";

import { MIN_REFRESH_SEC } from "./constants";
import { openPortalPage, WidgetFrameContext, type WidgetFrameApi, type WidgetStatus } from "./frame-context";
import { WidgetStyle } from "./styles";
import type { WidgetComponent, WidgetItem, WidgetMoveKey, WidgetProps, WidgetRegistryEntry } from "./types";

export interface WidgetFrameProps {
  item: WidgetItem;
  /** undefined 면 등록부에 없는 위젯 — 「없는 위젯」 칸을 그린다. */
  entry: WidgetRegistryEntry | undefined;
  editing: boolean;
  /** 크기 조절 중 이름표(예: "10 × 20"). */
  sizeLabel?: string | null;
  onToggleLock: (instId: string) => void;
  onRemove: (instId: string) => void;
  onKeyMove?: (instId: string, key: WidgetMoveKey, mode: "move" | "resize") => void;
}

const lazyCache = new WeakMap<WidgetRegistryEntry, LazyExoticComponent<WidgetComponent>>();

function lazyBody(entry: WidgetRegistryEntry): LazyExoticComponent<WidgetComponent> {
  let comp = lazyCache.get(entry);
  if (!comp) {
    comp = lazy(async () => {
      const mod = await entry.load();
      if (typeof mod.default !== "function") throw new Error(`${entry.meta.id}: default export 가 컴포넌트가 아닙니다.`);
      return { default: mod.default as WidgetComponent };
    });
    lazyCache.set(entry, comp);
  }
  return comp;
}

class WidgetErrorBoundary extends Component<{ onRetry: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[widget] 렌더 실패", error, info.componentStack);
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="cm-widget__state cm-widget__state--error">
          위젯을 불러오지 못했습니다.
          <button type="button" className="cm-widget__text-btn" data-action="retry" onClick={this.props.onRetry}>
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const KEY_MAP: Record<string, WidgetMoveKey> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

export function WidgetFrame({ item, entry, editing, sizeLabel, onToggleLock, onRemove, onKeyMove }: WidgetFrameProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<WidgetStatus>({ kind: "ready" });
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const [bodySize, setBodySize] = useState<{ width: number; height: number | null }>({ width: 0, height: null });
  const bodyRef = useRef<HTMLDivElement>(null);
  const meta = entry?.meta;

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setBodySize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 자동 새로 고침 — 보기 모드에서만, 최소 30초.
  const refreshSec = meta?.refreshSec;
  useEffect(() => {
    if (editing || !refreshSec) return;
    const t = window.setInterval(() => setRefreshKey((k) => k + 1), Math.max(MIN_REFRESH_SEC, refreshSec) * 1000);
    return () => window.clearInterval(t);
  }, [editing, refreshSec]);

  const api = useMemo<WidgetFrameApi>(
    () => ({ setStatus, bodySize, actionsSlot, titleSlot }),
    [bodySize, actionsSlot, titleSlot]
  );

  const retryLoad = useCallback(() => {
    // lazy 는 실패한 import 를 기억하므로 캐시를 지워 다시 불러오게 한다.
    if (entry) lazyCache.delete(entry);
    setStatus({ kind: "ready" });
    setAttempt((a) => a + 1);
  }, [entry]);

  const onHeadKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!editing || !onKeyMove || item.locked) return;
    const key = KEY_MAP[e.key];
    if (key) {
      e.preventDefault();
      onKeyMove(item.instId, key, e.shiftKey ? "resize" : "move");
    } else if (e.key === "Delete") {
      e.preventDefault();
      onRemove(item.instId);
    }
  };

  if (!entry) {
    return (
      <section className="cm-widget cm-widget--missing" data-widget-id={item.widgetId} data-editing={editing ? "true" : undefined}>
        <WidgetStyle />
        <div className="cm-widget__head">
          <h3 className="cm-widget__title">없는 위젯</h3>
          <span className="cm-widget__spacer" />
          {editing && (
            <button type="button" className="cm-widget__btn" data-action="remove" title="빼기" aria-label="빼기" onClick={() => onRemove(item.instId)}>
              ✕
            </button>
          )}
        </div>
        <div className="cm-widget__state">
          등록부에 없는 위젯입니다
          <code>{item.widgetId}</code>
          ✕ 로 빼면 저장할 때 함께 사라집니다.
        </div>
      </section>
    );
  }

  const Body = lazyBody(entry);
  const props: WidgetProps = { instanceId: item.instId, size: { w: item.w, h: item.h }, config: item.config, refreshKey };
  const padded = meta?.bodyPadding !== false;

  return (
    <section
      className="cm-widget"
      data-widget-id={entry.meta.id}
      data-inst-id={item.instId}
      data-editing={editing ? "true" : undefined}
      data-locked={item.locked ? "true" : undefined}
      aria-label={entry.meta.title}
    >
      <WidgetStyle />
      <div className="cm-widget__head" tabIndex={editing ? 0 : -1} onKeyDown={onHeadKeyDown}>
        <h3 className="cm-widget__title">{entry.meta.title}</h3>
        {entry.meta.subtitle && <span className="cm-widget__sub">{entry.meta.subtitle}</span>}
        <span className="cm-widget__title-extra" ref={setTitleSlot} />
        <span className="cm-widget__spacer" />
        <span className="cm-widget__actions" ref={setActionsSlot} />
        {!editing && (
          <>
            {item.locked && <span className="cm-widget__sub" title="잠김">🔒</span>}
            <button type="button" className="cm-widget__btn" data-action="refresh" title="새로 고침" aria-label="새로 고침" onClick={() => setRefreshKey((k) => k + 1)}>
              ↻
            </button>
            {entry.meta.linkPageId && (
              <button type="button" className="cm-widget__btn" data-action="open" title="화면 열기" aria-label="화면 열기" onClick={() => openPortalPage(entry.meta.linkPageId!)}>
                ↗
              </button>
            )}
          </>
        )}
        {editing && (
          <>
            <button
              type="button"
              className="cm-widget__btn"
              data-action="lock"
              aria-pressed={item.locked}
              title={item.locked ? "잠금 풀기" : "잠그기"}
              aria-label={item.locked ? "잠금 풀기" : "잠그기"}
              onClick={() => onToggleLock(item.instId)}
            >
              {item.locked ? "🔒" : "🔓"}
            </button>
            <button
              type="button"
              className="cm-widget__btn"
              data-action="remove"
              title="빼기"
              aria-label="빼기"
              disabled={item.locked}
              onClick={() => onRemove(item.instId)}
            >
              ✕
            </button>
          </>
        )}
      </div>
      <div ref={bodyRef} className={`cm-widget__body${padded ? " cm-widget__body--padded" : ""}`}>
        <WidgetFrameContext.Provider value={api}>
          <WidgetErrorBoundary key={attempt} onRetry={retryLoad}>
            <Suspense fallback={<div className="cm-widget__skeleton"><i style={{ width: "60%" }} /><i /><i style={{ width: "80%" }} /></div>}>
              {status.kind === "error" ? (
                <div className="cm-widget__state cm-widget__state--error">
                  {status.message}
                  {status.retry && (
                    <button type="button" className="cm-widget__text-btn" data-action="retry" onClick={status.retry}>
                      다시 시도
                    </button>
                  )}
                </div>
              ) : null}
              <div hidden={status.kind === "error"} style={{ height: "100%" }}>
                <Body {...props} />
              </div>
            </Suspense>
          </WidgetErrorBoundary>
        </WidgetFrameContext.Provider>
      </div>
      {sizeLabel && <span className="cm-widget__size">{sizeLabel}</span>}
    </section>
  );
}
```

`index.ts` 에 덧붙인다:
```ts
export { WidgetFrame } from "./WidgetFrame";
export type { WidgetFrameProps } from "./WidgetFrame";
export {
  openPortalPage,
  useWidgetBodySize,
  useWidgetStatus,
  WidgetHeaderActions,
  WidgetTitleExtra,
} from "./frame-context";
export type { WidgetStatus } from "./frame-context";
export { WIDGET_CSS, WidgetStyle } from "./styles";
```

- [ ] **Step 6: 시험 통과 확인**

Run: `cd src/frontend/shared && pnpm vitest run tests/unit/widget-frame.unit.test.ts`
Expected: PASS. happy-dom 에서 `<style href precedence>` 경고가 나면 dashboard 시험과 같은 방식인지 확인하고, 경고 문구가 `tests/setup.ts` 에서 이미 걸러지는지 본다(새 필터는 추가하지 않는다).

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add src/frontend/shared/src/widget src/frontend/shared/tests/unit/widget-frame.unit.test.ts
/usr/bin/git commit -m "feat(shared): 위젯 공통 틀(WidgetFrame)과 틀 훅을 추가한다" -m "쉬운 설명: 모든 위젯이 같은 제목 줄·새로 고침·화면 열기 버튼과 오류 안내를 갖게 하는 틀을 만들었습니다. 위젯 하나가 고장 나도 다른 위젯은 그대로 보입니다.

- 지연 로딩·위젯별 오류 경계·없는 위젯 칸
- useWidgetStatus·useWidgetBodySize·WidgetHeaderActions·WidgetTitleExtra
- WIDGET_CSS(react-grid-layout 필수 규칙 포함)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: WidgetBoard(자유 배치 격자)

**Files:**
- Create: `src/frontend/shared/src/widget/WidgetBoard.tsx`, `src/frontend/shared/src/widget/widget-dnd.ts`
- Modify: `src/frontend/shared/src/widget/index.ts`
- Test: `src/frontend/shared/tests/unit/widget-board.unit.test.ts`

**Interfaces:**
- Consumes: Task 1 `colsForWidth`, `reflowLayout`, `addItem`, `removeItem`, `toggleLock`, `moveByKey`, `minSizeOf`, `maxSizeOf`, `newInstanceId`, 상수; Task 2 `WidgetFrame`
- Produces:
  - `WidgetBoard(props: WidgetBoardProps)` — `WidgetBoardProps = { items: readonly WidgetItem[]; registry: WidgetRegistry; editing: boolean; tabLocked: boolean; onChange(items: WidgetItem[]): void; onWideChange?(wide: boolean): void; width?: number; testId?: string }` (`width` 는 시험·특수 배치용 고정 폭, 없으면 `useContainerWidth` 로 잰다)
  - `setDraggingWidget(id: string | null)`, `getDraggingWidget(): string | null`

- [ ] **Step 1: 실패하는 시험 작성**

`src/frontend/shared/tests/unit/widget-board.unit.test.ts`:
```ts
/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetBoard } from "../../src/widget";
import type { WidgetItem, WidgetRegistry } from "../../src/widget";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const REG: WidgetRegistry = {
  "t.a": { meta: { id: "t.a", title: "가", defaultSize: { w: 6, h: 6 } }, load: async () => ({ default: () => h("p", null, "가 본문") }) },
  "t.b": { meta: { id: "t.b", title: "나", defaultSize: { w: 6, h: 6 } }, load: async () => ({ default: () => h("p", null, "나 본문") }) },
};
const it_ = (instId: string, widgetId: string, x: number, y: number, extra: Partial<WidgetItem> = {}): WidgetItem => ({
  instId, widgetId, x, y, w: 6, h: 6, locked: false, config: null, ...extra,
});
const ITEMS = [it_("a", "t.a", 0, 0), it_("b", "t.b", 6, 0), it_("g", "gone.x", 12, 0)];

function render(props: Partial<Parameters<typeof WidgetBoard>[0]> = {}) {
  const onChange = vi.fn();
  const onWideChange = vi.fn();
  act(() =>
    root.render(
      h(WidgetBoard, { items: ITEMS, registry: REG, editing: false, tabLocked: false, onChange, onWideChange, width: 1440, ...props })
    )
  );
  return { onChange, onWideChange };
}
const titles = () => [...host.querySelectorAll(".cm-widget__title")].map((e) => e.textContent);

describe("WidgetBoard", () => {
  it("보기 모드에서는 등록부에 없는 위젯을 그리지 않고 손잡이가 없다", () => {
    render();
    expect(titles()).toEqual(["가", "나"]);
    expect(host.querySelector(".react-resizable-handle")).toBeNull();
  });

  it("편집 모드에서는 없는 위젯 칸과 8방향 손잡이가 보인다", () => {
    render({ editing: true });
    expect(titles()).toContain("없는 위젯");
    const first = host.querySelector(".react-grid-item")!;
    expect(first.querySelectorAll(".react-resizable-handle")).toHaveLength(8);
  });

  it("잠긴 위젯은 편집 모드에서도 손잡이가 없다", () => {
    render({ editing: true, items: [it_("a", "t.a", 0, 0, { locked: true })] });
    expect(host.querySelector(".react-resizable-handle")).toBeNull();
  });

  it("잠긴 탭이면 편집 모드여도 손잡이가 없다", () => {
    render({ editing: true, tabLocked: true });
    expect(host.querySelector(".react-resizable-handle")).toBeNull();
  });

  it("좁은 폭이면 편집 모드여도 손잡이가 없고 onWideChange(false) 를 알린다", () => {
    const { onWideChange } = render({ editing: true, width: 1000 });
    expect(host.querySelector(".react-resizable-handle")).toBeNull();
    expect(onWideChange).toHaveBeenLastCalledWith(false);
  });

  it("✕ 로 빼면 onChange 로 뺀 배치를 알린다", async () => {
    const { onChange } = render({ editing: true });
    const remove = host.querySelector('.cm-widget[data-inst-id="a"] [data-action="remove"]') as HTMLButtonElement;
    act(() => remove.click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((i: WidgetItem) => i.instId)).toEqual(["b", "g"]);
  });

  it("잠금 버튼은 onChange 로 잠금을 뒤집어 알린다", () => {
    const { onChange } = render({ editing: true });
    act(() => (host.querySelector('.cm-widget[data-inst-id="b"] [data-action="lock"]') as HTMLButtonElement).click());
    expect(onChange.mock.calls[0][0].find((i: WidgetItem) => i.instId === "b").locked).toBe(true);
  });

  it("제목 줄 → 키는 한 칸 옮긴 배치를 알린다", () => {
    const { onChange } = render({ editing: true });
    const head = host.querySelector('.cm-widget[data-inst-id="a"] .cm-widget__head') as HTMLElement;
    act(() => head.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(onChange.mock.calls[0][0].find((i: WidgetItem) => i.instId === "a").x).toBe(1);
  });
});
```

- [ ] **Step 2: 시험 실패 확인**

Run: `cd src/frontend/shared && pnpm vitest run tests/unit/widget-board.unit.test.ts`
Expected: FAIL — `WidgetBoard` 가 export 되지 않음

- [ ] **Step 3: 끌기 공유 모듈**

`src/frontend/shared/src/widget/widget-dnd.ts`:
```ts
/**
 * [위젯 추가] 서랍 → 격자 끌기 중인 위젯 ID. HTML5 dragover 에서는 dataTransfer 를 읽을 수 없어
 * 서랍이 dragstart 에 여기에 적고 보드가 dragover·drop 에서 읽는다.
 */
let dragging: string | null = null;

export function setDraggingWidget(id: string | null): void {
  dragging = id;
}

export function getDraggingWidget(): string | null {
  return dragging;
}
```

- [ ] **Step 4: WidgetBoard 구현**

`src/frontend/shared/src/widget/WidgetBoard.tsx`:
```tsx
"use client";

/**
 * 위젯 자유 배치 격자 — react-grid-layout 2.x 를 감싼다(스펙 §3.2·§3.4).
 * - 칸 수는 폭으로 정한다(24·12·1). 24칸이 아니면 넓은 화면 배치를 다시 흘려 보기 전용으로 보인다(W-D12).
 * - 편집 가능 = editing && 넓은 화면 && 탭 잠금 아님. 잠긴 위젯은 static 이라 자리를 지킨다.
 * - 끌기 손잡이는 제목 줄(.cm-widget__head), 버튼(.cm-widget__btn)에서는 끌기가 시작되지 않는다.
 * - 서랍에서 끌어 오면(widget-dnd) 놓은 자리에 기본 크기로 추가한다.
 */
import { useEffect, useMemo, useState } from "react";
import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout, type LayoutItem } from "react-grid-layout";

import {
  WIDGET_COLS,
  WIDGET_MARGIN,
  WIDGET_RESIZE_HANDLES,
  WIDGET_ROW_HEIGHT,
} from "./constants";
import { getDraggingWidget, setDraggingWidget } from "./widget-dnd";
import { WidgetFrame } from "./WidgetFrame";
import { WidgetStyle } from "./styles";
import type { WidgetItem, WidgetMoveKey, WidgetRegistry } from "./types";
import {
  addItem,
  canAddWidget,
  colsForWidth,
  maxSizeOf,
  minSizeOf,
  moveByKey,
  newInstanceId,
  reflowLayout,
  removeItem,
  toggleLock,
} from "./widget-layout";

export interface WidgetBoardProps {
  items: readonly WidgetItem[];
  registry: WidgetRegistry;
  editing: boolean;
  tabLocked: boolean;
  onChange: (items: WidgetItem[]) => void;
  /** 넓은 화면(24칸) 여부가 바뀔 때. 작업 공간이 [배치 편집]을 막는 데 쓴다. */
  onWideChange?: (wide: boolean) => void;
  /** 고정 폭(px). 없으면 컨테이너 폭을 잰다. */
  width?: number;
  testId?: string;
}

function applyLayout(layout: Layout, items: readonly WidgetItem[]): WidgetItem[] {
  const pos = new Map(layout.map((l) => [l.i, l]));
  return items.map((it) => {
    const l = pos.get(it.instId);
    return l ? { ...it, x: l.x, y: l.y, w: l.w, h: l.h } : it;
  });
}

export function WidgetBoard({ items, registry, editing, tabLocked, onChange, onWideChange, width: fixedWidth, testId }: WidgetBoardProps) {
  const measured = useContainerWidth({ initialWidth: fixedWidth ?? 1280 });
  const width = fixedWidth ?? measured.width;
  const cols = colsForWidth(width);
  const wide = cols === WIDGET_COLS;
  const canEdit = editing && wide && !tabLocked;
  const [sizeLabel, setSizeLabel] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    onWideChange?.(wide);
  }, [wide, onWideChange]);

  const visible = useMemo(
    () => (editing ? [...items] : items.filter((it) => registry[it.widgetId])),
    [items, registry, editing]
  );
  const shown = useMemo(() => (wide ? visible : reflowLayout(visible, cols)), [visible, wide, cols]);

  const layout = useMemo<LayoutItem[]>(
    () =>
      shown.map((it) => {
        const meta = registry[it.widgetId]?.meta;
        const min = meta ? minSizeOf(meta) : { w: 1, h: 1 };
        const max = meta ? maxSizeOf(meta) : { w: cols, h: Number.POSITIVE_INFINITY };
        return {
          i: it.instId,
          x: it.x,
          y: it.y,
          w: it.w,
          h: it.h,
          minW: Math.min(min.w, cols),
          minH: min.h,
          maxW: Math.min(max.w, cols),
          maxH: max.h,
          static: it.locked || !canEdit,
        };
      }),
    [shown, registry, cols, canEdit]
  );

  const commit = (next: Layout) => onChange(applyLayout(next, items));
  const onKeyMove = (instId: string, key: WidgetMoveKey, mode: "move" | "resize") =>
    onChange(moveByKey(items, instId, key, mode, registry));

  return (
    <div
      ref={measured.containerRef}
      className="cm-widget-board"
      data-editing={canEdit ? "true" : undefined}
      data-cols={cols}
      data-testid={testId}
    >
      <WidgetStyle />
      {shown.length === 0 ? (
        <div className="cm-widget-board__empty">
          {canEdit ? "오른쪽 [위젯 추가]에서 위젯을 누르거나 끌어 놓으세요." : "놓인 위젯이 없습니다. [배치 편집]에서 위젯을 추가하세요."}
        </div>
      ) : null}
      <ReactGridLayout
        width={width}
        layout={layout}
        gridConfig={{ cols, rowHeight: WIDGET_ROW_HEIGHT, margin: [WIDGET_MARGIN, WIDGET_MARGIN], containerPadding: [0, 0] }}
        dragConfig={{ enabled: canEdit, handle: ".cm-widget__head", cancel: ".cm-widget__btn" }}
        resizeConfig={{ enabled: canEdit, handles: WIDGET_RESIZE_HANDLES }}
        dropConfig={{ enabled: canEdit, defaultItem: { w: 6, h: 6 } }}
        compactor={verticalCompactor}
        onDropDragOver={() => {
          const id = getDraggingWidget();
          const meta = id ? registry[id]?.meta : undefined;
          if (!meta || !canAddWidget(items, meta)) return false;
          return { w: meta.defaultSize.w, h: meta.defaultSize.h };
        }}
        onDrop={(_next, dropped) => {
          const id = getDraggingWidget();
          setDraggingWidget(null);
          const meta = id ? registry[id]?.meta : undefined;
          if (!id || !meta || !dropped || !canAddWidget(items, meta)) return;
          onChange(addItem(items, id, meta, newInstanceId(), { x: dropped.x, y: dropped.y }));
        }}
        onDragStop={(next) => commit(next)}
        onResize={(_next, _old, item) => setSizeLabel({ id: item.i, text: `${item.w} × ${item.h}` })}
        onResizeStop={(next) => {
          setSizeLabel(null);
          commit(next);
        }}
      >
        {shown.map((it) => (
          <div key={it.instId}>
            <WidgetFrame
              item={it}
              entry={registry[it.widgetId]}
              editing={canEdit}
              sizeLabel={sizeLabel?.id === it.instId ? sizeLabel.text : null}
              onToggleLock={(instId) => onChange(toggleLock(items, instId))}
              onRemove={(instId) => onChange(removeItem(items, instId))}
              onKeyMove={onKeyMove}
            />
          </div>
        ))}
      </ReactGridLayout>
    </div>
  );
}
```

`resizeConfig.handles` 가 `readonly` 배열을 받으므로 `WIDGET_RESIZE_HANDLES`(as const) 를 그대로 넘긴다. `EventCallback` 의 실제 인자 순서가 `(layout, oldItem, newItem, placeholder, event, element)` 와 다르면 `node_modules/react-grid-layout/dist/types-*.d.mts` 의 `EventCallback` 을 보고 맞춘다. `static: !canEdit` 로 보기 모드 손잡이를 없애는 것이 시험 기대(보기 모드 손잡이 없음)와 맞는지 확인하고, react-grid-layout 이 `dragConfig.enabled=false` 만으로 손잡이를 그리지 않으면 `static` 대신 그 방식을 써도 된다.

`index.ts` 에 덧붙인다:
```ts
export { WidgetBoard } from "./WidgetBoard";
export type { WidgetBoardProps } from "./WidgetBoard";
export { getDraggingWidget, setDraggingWidget } from "./widget-dnd";
```

- [ ] **Step 5: 시험 통과 확인**

Run: `cd src/frontend/shared && pnpm vitest run tests/unit/widget-board.unit.test.ts tests/unit/widget-frame.unit.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add src/frontend/shared/src/widget src/frontend/shared/tests/unit/widget-board.unit.test.ts
/usr/bin/git commit -m "feat(shared): 위젯 자유 배치 격자(WidgetBoard)를 추가한다" -m "쉬운 설명: 위젯을 24칸 격자 아무 곳에나 끌어 놓고 네 변·네 모서리에서 크기를 바꿀 수 있게 했습니다. 좁은 화면에서는 보기만 됩니다.

- react-grid-layout 감싸기, 24·12·1칸 전환, 잠금 위젯 고정
- 서랍에서 끌어 놓기, 키보드 이동·크기 조절, 크기 이름표

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: WidgetTabs(탭 줄)·WidgetPicker(위젯 추가 서랍)

**Files:**
- Create: `src/frontend/shared/src/widget/WidgetTabs.tsx`, `src/frontend/shared/src/widget/WidgetPicker.tsx`
- Modify: `src/frontend/shared/src/widget/index.ts`
- Test: `src/frontend/shared/tests/unit/widget-tabs.unit.test.ts`

**Interfaces:**
- Consumes: Task 1 `HOME_TAB_ID`, `MAX_TABS`, `TAB_NAME_MAX`, `canAddWidget`, `WidgetTab`, `WidgetRegistry`; Task 3 `setDraggingWidget`
- Produces:
  - `WidgetTabs(props: WidgetTabsProps)` — `WidgetTabsProps = { tabs: readonly WidgetTab[]; activeTabId: string; editing: boolean; menuDisabled?: boolean; renamingTabId: string | null; onSelect(tabId): void; onAdd(): void; onRenameStart(tabId): void; onRenameCommit(tabId: string, name: string): string | null; onRenameCancel(): void; onToggleLock(tabId): void; onMove(tabId: string, dir: -1 | 1): void; onDelete(tabId): void; onResetHome(): void; trailing?: ReactNode }` — `onRenameCommit` 이 오류 문구를 돌려주면 입력 칸을 닫지 않고 문구를 보인다
  - `WidgetPicker(props: WidgetPickerProps)` — `WidgetPickerProps = { registry: WidgetRegistry; items: readonly WidgetItem[]; onAdd(widgetId: string): void }`

- [ ] **Step 1: 실패하는 시험 작성**

`src/frontend/shared/tests/unit/widget-tabs.unit.test.ts`:
```ts
/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDraggingWidget, WidgetPicker, WidgetTabs } from "../../src/widget";
import type { WidgetItem, WidgetRegistry, WidgetTab } from "../../src/widget";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const tab = (tabId: string, name: string, locked = false): WidgetTab => ({ tabId, name, seq: 0, locked, items: [] });
const TABS = [tab("home", "홈"), tab("tab-1", "내 생산", true), tab("tab-2", "품질")];

function renderTabs(extra: Record<string, unknown> = {}) {
  const handlers = {
    onSelect: vi.fn(), onAdd: vi.fn(), onRenameStart: vi.fn(), onRenameCommit: vi.fn(() => null), onRenameCancel: vi.fn(),
    onToggleLock: vi.fn(), onMove: vi.fn(), onDelete: vi.fn(), onResetHome: vi.fn(),
  };
  act(() => root.render(h(WidgetTabs, { tabs: TABS, activeTabId: "home", editing: false, renamingTabId: null, ...handlers, ...extra })));
  return handlers;
}
const menuLabels = () => [...document.querySelectorAll(".cm-widget-menu button")].map((b) => `${b.textContent?.trim()}${(b as HTMLButtonElement).disabled ? "(off)" : ""}`);
const openMenu = (tabId: string) => act(() => (host.querySelector(`[data-tab-menu="${tabId}"]`) as HTMLButtonElement).click());

describe("WidgetTabs", () => {
  it("탭 이름·잠금 표시와 선택을 그린다", () => {
    const hs = renderTabs();
    const tabs = [...host.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs[1].querySelector(".cm-widget-tab__lock")).not.toBeNull();
    act(() => (tabs[2] as HTMLElement).click());
    expect(hs.onSelect).toHaveBeenCalledWith("tab-2");
  });

  it("「홈」 메뉴에는 잠금과 기본 배치로 되돌리기만 있다", () => {
    renderTabs();
    openMenu("home");
    expect(menuLabels()).toEqual(["탭 잠그기", "기본 배치로 되돌리기"]);
  });

  it("다른 탭 메뉴는 이름 바꾸기·잠금·옮기기·지우기, 맨 끝 탭은 오른쪽으로가 비활성", () => {
    renderTabs();
    openMenu("tab-2");
    expect(menuLabels()).toEqual(["이름 바꾸기", "탭 잠그기", "왼쪽으로", "오른쪽으로(off)", "탭 지우기"]);
  });

  it("편집 모드에서는 이름 바꾸기만 쓸 수 있다", () => {
    renderTabs({ editing: true });
    openMenu("tab-2");
    expect(menuLabels()).toEqual(["이름 바꾸기", "탭 잠그기(off)", "왼쪽으로(off)", "오른쪽으로(off)", "탭 지우기(off)"]);
  });

  it("탭 10개면 (+) 가 비활성이다", () => {
    const many = Array.from({ length: 10 }, (_, i) => tab(i === 0 ? "home" : `tab-${i}`, `t${i}`));
    renderTabs({ tabs: many });
    expect((host.querySelector('[data-action="add-tab"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("이름 바꾸기 입력은 Enter 로 확정하고 오류 문구를 보이면 칸을 유지한다", () => {
    const onRenameCommit = vi.fn(() => "같은 이름의 탭이 있습니다.");
    renderTabs({ renamingTabId: "tab-2", onRenameCommit });
    const input = host.querySelector(".cm-widget-tab__name") as HTMLInputElement;
    expect(input.maxLength).toBe(20);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "내 생산");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onRenameCommit).toHaveBeenCalledWith("tab-2", "내 생산");
    expect(host.textContent).toContain("같은 이름의 탭이 있습니다.");
  });
});

describe("WidgetPicker", () => {
  const REG: WidgetRegistry = {
    "t.a": { meta: { id: "t.a", title: "공지사항", description: "공지 목록", defaultSize: { w: 10, h: 16 } }, load: async () => ({ default: () => null }) },
    "t.one": { meta: { id: "t.one", title: "주요 지표", defaultSize: { w: 24, h: 6 }, multiple: false }, load: async () => ({ default: () => null }) },
  };
  const placed: WidgetItem[] = [{ instId: "x", widgetId: "t.one", x: 0, y: 0, w: 24, h: 6, locked: false, config: null }];

  it("이름·크기를 보이고 multiple:false 로 이미 놓인 위젯은 비활성이다", () => {
    const onAdd = vi.fn();
    act(() => root.render(h(WidgetPicker, { registry: REG, items: placed, onAdd })));
    const items = [...host.querySelectorAll(".cm-widget-picker__item")] as HTMLButtonElement[];
    expect(items.map((b) => b.querySelector(".cm-widget-picker__size")!.textContent)).toEqual(["10×16", "24×6"]);
    expect(items[1].disabled).toBe(true);
    act(() => items[0].click());
    expect(onAdd).toHaveBeenCalledWith("t.a");
  });

  it("검색어로 이름·설명을 거른다", () => {
    act(() => root.render(h(WidgetPicker, { registry: REG, items: [], onAdd: vi.fn() })));
    const input = host.querySelector(".cm-widget-picker__search") as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "지표");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect([...host.querySelectorAll(".cm-widget-picker__name")].map((e) => e.firstChild?.textContent)).toEqual(["주요 지표"]);
  });

  it("끌기 시작하면 끄는 위젯 ID 를 적고 끝나면 지운다", () => {
    act(() => root.render(h(WidgetPicker, { registry: REG, items: [], onAdd: vi.fn() })));
    const item = host.querySelector(".cm-widget-picker__item") as HTMLElement;
    act(() => item.dispatchEvent(new Event("dragstart", { bubbles: true })));
    expect(getDraggingWidget()).toBe("t.a");
    act(() => item.dispatchEvent(new Event("dragend", { bubbles: true })));
    expect(getDraggingWidget()).toBeNull();
  });
});
```

- [ ] **Step 2: 시험 실패 확인**

Run: `cd src/frontend/shared && pnpm vitest run tests/unit/widget-tabs.unit.test.ts`
Expected: FAIL — `WidgetTabs` 가 export 되지 않음

- [ ] **Step 3: WidgetTabs 구현**

`src/frontend/shared/src/widget/WidgetTabs.tsx`:
```tsx
"use client";

/**
 * 위젯 탭 줄(스펙 §3.5). 「홈」은 늘 첫 자리이고 지우기·이름 바꾸기 불가.
 * 탭 메뉴(⋯): 이름 바꾸기·잠금·왼쪽/오른쪽·지우기, 「홈」은 잠금·기본 배치로 되돌리기만. 편집 모드에서는 이름 바꾸기만.
 * 메뉴는 Mantine 없이 그린다(바깥 누름·Escape 로 닫힘).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { HOME_TAB_ID, MAX_TABS, TAB_NAME_MAX } from "./constants";
import { WidgetStyle } from "./styles";
import type { WidgetTab } from "./types";

export interface WidgetTabsProps {
  tabs: readonly WidgetTab[];
  activeTabId: string;
  editing: boolean;
  /** 불러오기 실패 등으로 탭 메뉴·추가를 막는다. */
  menuDisabled?: boolean;
  renamingTabId: string | null;
  onSelect: (tabId: string) => void;
  onAdd: () => void;
  onRenameStart: (tabId: string) => void;
  /** 오류 문구를 돌려주면 입력 칸을 유지하고 문구를 보인다. */
  onRenameCommit: (tabId: string, name: string) => string | null;
  onRenameCancel: () => void;
  onToggleLock: (tabId: string) => void;
  onMove: (tabId: string, dir: -1 | 1) => void;
  onDelete: (tabId: string) => void;
  onResetHome: () => void;
  trailing?: ReactNode;
}

function RenameInput({ tab, onCommit, onCancel }: { tab: WidgetTab; onCommit: (name: string) => string | null; onCancel: () => void }) {
  const [value, setValue] = useState(tab.name);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => setError(onCommit(value));
  return (
    <>
      <input
        ref={ref}
        className="cm-widget-tab__name"
        value={value}
        maxLength={TAB_NAME_MAX}
        aria-label="탭 이름"
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={commit}
      />
      {error && <span className="cm-widget-tab__error" role="alert">{error}</span>}
    </>
  );
}

export function WidgetTabs(props: WidgetTabsProps) {
  const { tabs, activeTabId, editing, menuDisabled, renamingTabId, trailing } = props;
  const [menu, setMenu] = useState<{ tabId: string; left: number; top: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const menuTab = menu ? tabs.find((t) => t.tabId === menu.tabId) : undefined;
  const menuIndex = menuTab ? tabs.indexOf(menuTab) : -1;
  const run = (fn: () => void) => () => {
    setMenu(null);
    fn();
  };

  return (
    <div className="cm-widget-tabs" role="tablist" aria-label="위젯 탭">
      <WidgetStyle />
      {tabs.map((t) => (
        <div
          key={t.tabId}
          role="tab"
          tabIndex={0}
          aria-selected={t.tabId === activeTabId}
          className="cm-widget-tab"
          data-tab-id={t.tabId}
          onClick={() => props.onSelect(t.tabId)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && props.onSelect(t.tabId)}
        >
          {renamingTabId === t.tabId ? (
            <RenameInput tab={t} onCommit={(name) => props.onRenameCommit(t.tabId, name)} onCancel={props.onRenameCancel} />
          ) : (
            <span>{t.name}</span>
          )}
          {t.locked && <span className="cm-widget-tab__lock" title="잠긴 탭">🔒</span>}
          {!menuDisabled && (
            <button
              type="button"
              className="cm-widget-tab__more"
              data-tab-menu={t.tabId}
              aria-label={`${t.name} 탭 메뉴`}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setMenu((m) => (m?.tabId === t.tabId ? null : { tabId: t.tabId, left: r.left, top: r.bottom + 4 }));
              }}
            >
              ⋯
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="cm-widget-tabs__add"
        data-action="add-tab"
        title={`새 탭 (최대 ${MAX_TABS}개)`}
        aria-label="새 탭"
        disabled={menuDisabled || tabs.length >= MAX_TABS}
        onClick={props.onAdd}
      >
        +
      </button>
      <div className="cm-widget-tabs__trailing">{trailing}</div>
      {menu && menuTab && (
        <div className="cm-widget-menu" role="menu" style={{ position: "fixed", left: menu.left, top: menu.top }} onClick={(e) => e.stopPropagation()}>
          {menuTab.tabId === HOME_TAB_ID ? (
            <>
              <button type="button" role="menuitem" disabled={editing} onClick={run(() => props.onToggleLock(menuTab.tabId))}>
                {menuTab.locked ? "잠금 풀기" : "탭 잠그기"}
              </button>
              <hr />
              <button type="button" role="menuitem" disabled={editing} onClick={run(props.onResetHome)}>
                기본 배치로 되돌리기
              </button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={run(() => props.onRenameStart(menuTab.tabId))}>
                이름 바꾸기
              </button>
              <button type="button" role="menuitem" disabled={editing} onClick={run(() => props.onToggleLock(menuTab.tabId))}>
                {menuTab.locked ? "잠금 풀기" : "탭 잠그기"}
              </button>
              <button type="button" role="menuitem" disabled={editing || menuIndex <= 1} onClick={run(() => props.onMove(menuTab.tabId, -1))}>
                왼쪽으로
              </button>
              <button type="button" role="menuitem" disabled={editing || menuIndex >= tabs.length - 1} onClick={run(() => props.onMove(menuTab.tabId, 1))}>
                오른쪽으로
              </button>
              <hr />
              <button type="button" role="menuitem" data-danger="true" disabled={editing} onClick={run(() => props.onDelete(menuTab.tabId))}>
                탭 지우기
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

메뉴 라벨 시험은 `textContent.trim()` 을 비교하므로 버튼 글자 앞에 아이콘 글자를 넣지 않는다.

- [ ] **Step 4: WidgetPicker 구현**

`src/frontend/shared/src/widget/WidgetPicker.tsx`:
```tsx
"use client";

/** [위젯 추가] 서랍 — 이름·설명 검색, 눌러서 맨 아래에 추가, 끌어서 원하는 자리에 놓기(스펙 §3.4). */
import { useMemo, useState } from "react";

import { WidgetStyle } from "./styles";
import type { WidgetItem, WidgetRegistry } from "./types";
import { setDraggingWidget } from "./widget-dnd";
import { canAddWidget } from "./widget-layout";

export interface WidgetPickerProps {
  registry: WidgetRegistry;
  items: readonly WidgetItem[];
  onAdd: (widgetId: string) => void;
}

export function WidgetPicker({ registry, items, onAdd }: WidgetPickerProps) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim();
    return Object.values(registry)
      .map((e) => e.meta)
      .filter((m) => !q || m.title.includes(q) || (m.description ?? "").includes(q))
      .sort((a, b) => a.title.localeCompare(b.title, "ko"));
  }, [registry, query]);

  return (
    <aside className="cm-widget-picker" aria-label="위젯 추가">
      <WidgetStyle />
      <div className="cm-widget-picker__head">
        <h4 className="cm-widget-picker__title">위젯 추가</h4>
        <input
          className="cm-widget-picker__search"
          placeholder="위젯 이름 검색"
          aria-label="위젯 이름 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="cm-widget-picker__list">
        {list.length === 0 && <div className="cm-widget__state">검색 결과가 없습니다.</div>}
        {list.map((m) => {
          const enabled = canAddWidget(items, m);
          return (
            <button
              key={m.id}
              type="button"
              className="cm-widget-picker__item"
              data-widget-id={m.id}
              disabled={!enabled}
              draggable={enabled}
              title={enabled ? "눌러서 추가하거나 격자로 끌어 놓습니다" : "이미 놓였거나 탭에 위젯이 30개입니다"}
              onClick={() => onAdd(m.id)}
              onDragStart={(e) => {
                setDraggingWidget(m.id);
                // Firefox 는 dataTransfer 가 비면 끌기를 시작하지 않는다.
                e.dataTransfer?.setData("text/plain", m.id);
              }}
              onDragEnd={() => setDraggingWidget(null)}
            >
              <span className="cm-widget-picker__name">
                {m.title}
                <span className="cm-widget-picker__size">
                  {m.defaultSize.w}×{m.defaultSize.h}
                </span>
              </span>
              {m.description && <p className="cm-widget-picker__desc">{m.description}</p>}
            </button>
          );
        })}
      </div>
      <div className="cm-widget-picker__foot">눌러서 맨 아래에 추가하거나, 끌어서 원하는 자리에 놓습니다.</div>
    </aside>
  );
}
```

시험의 `dragstart` 는 `Event` 라 `dataTransfer` 가 없다 — 위 코드처럼 `e.dataTransfer?.` 로 부른다. `.cm-widget-picker__name` 의 `firstChild` 가 제목 글자 노드여야 검색 시험이 맞는다.

`index.ts` 에 덧붙인다:
```ts
export { WidgetTabs } from "./WidgetTabs";
export type { WidgetTabsProps } from "./WidgetTabs";
export { WidgetPicker } from "./WidgetPicker";
export type { WidgetPickerProps } from "./WidgetPicker";
```

- [ ] **Step 5: 시험 통과 확인**

Run: `cd src/frontend/shared && pnpm vitest run tests/unit/widget-tabs.unit.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add src/frontend/shared/src/widget src/frontend/shared/tests/unit/widget-tabs.unit.test.ts
/usr/bin/git commit -m "feat(shared): 위젯 탭 줄과 위젯 추가 서랍을 추가한다" -m "쉬운 설명: 사용자가 위젯 화면을 탭으로 여러 개 만들고, 서랍에서 위젯을 골라 넣을 수 있게 했습니다.

- WidgetTabs: 선택·추가·이름 바꾸기·잠금·옮기기·지우기·홈 기본 배치 되돌리기
- WidgetPicker: 검색·눌러 추가·끌어 놓기

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: WidgetWorkspace(편집 흐름·저장소 연동)와 shared 문서

**Files:**
- Create: `src/frontend/shared/src/widget/WidgetWorkspace.tsx`
- Modify: `src/frontend/shared/src/widget/index.ts`, `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md`(진입점 표), `.claude/skills/mantine-aggrid-ui/scripts/ui_docs.py`(색인 그룹), `.claude/skills/mantine-aggrid-ui/references/components/llms.txt`·`llms-full.txt`(스크립트 재생성)
- Create: `.claude/skills/mantine-aggrid-ui/references/components/widget.md`
- Test: `src/frontend/shared/tests/unit/widget-workspace.unit.test.ts`

**Interfaces:**
- Consumes: Task 1~4 전부
- Produces: `WidgetWorkspace(props: WidgetWorkspaceProps)` — `WidgetWorkspaceProps = { registry: WidgetRegistry; homeDefault: readonly WidgetItem[]; store: WidgetStore; userId?: string | null; confirm?(title: string, message: string): Promise<boolean>; notify?(message: string, kind: "success" | "error"): void; boardWidth?: number; testId?: string }` (`confirm`·`notify` 가 없으면 `useMessage` 로 띄운다. `boardWidth` 는 시험용 고정 폭)

- [ ] **Step 1: 실패하는 시험 작성**

`src/frontend/shared/tests/unit/widget-workspace.unit.test.ts`:
```ts
/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetWorkspace } from "../../src/widget";
import type { WidgetItem, WidgetRegistry, WidgetStore, WidgetTab } from "../../src/widget";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const REG: WidgetRegistry = {
  "t.a": { meta: { id: "t.a", title: "가", defaultSize: { w: 6, h: 6 } }, load: async () => ({ default: () => h("p", null, "가") }) },
};
const it_ = (instId: string, x = 0, y = 0): WidgetItem => ({ instId, widgetId: "t.a", x, y, w: 6, h: 6, locked: false, config: null });
const HOME_DEFAULT = [it_("d1")];

function makeStore(tabs: WidgetTab[] | Error = []): WidgetStore & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    load: vi.fn(async () => {
      calls.push("load");
      if (tabs instanceof Error) throw tabs;
      return tabs;
    }),
    saveTab: vi.fn(async (t: WidgetTab) => {
      calls.push(`saveTab:${t.tabId}:${t.name}:${t.items.length}`);
    }),
    deleteTab: vi.fn(async (id: string) => {
      calls.push(`deleteTab:${id}`);
    }),
    reorderTabs: vi.fn(async (ids: string[]) => {
      calls.push(`reorder:${ids.join(",")}`);
    }),
    resetHome: vi.fn(async () => {
      calls.push("resetHome");
    }),
  };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}
const btn = (sel: string) => host.querySelector(sel) as HTMLButtonElement;
const click = (sel: string) => act(() => btn(sel).click());

async function mount(store: WidgetStore, extra: Record<string, unknown> = {}) {
  const confirm = vi.fn(async () => true);
  const notify = vi.fn();
  act(() =>
    root.render(h(WidgetWorkspace, { registry: REG, homeDefault: HOME_DEFAULT, store, confirm, notify, boardWidth: 1440, ...extra }))
  );
  await flush();
  return { confirm, notify };
}
const tabNames = () => [...host.querySelectorAll('[role="tab"] > span:first-child')].map((e) => e.textContent);

describe("WidgetWorkspace", () => {
  it("저장한 홈이 없으면 기본 배치로 「홈」 탭을 보인다", async () => {
    await mount(makeStore([]));
    expect(tabNames()).toEqual(["홈"]);
    expect(host.querySelectorAll(".cm-widget").length).toBe(1);
  });

  it("불러오기 실패면 안내 띠를 보이고 [배치 편집]을 막는다", async () => {
    await mount(makeStore(new Error("network")));
    expect(host.textContent).toContain("저장한 위젯 화면을 불러오지 못했습니다");
    expect(btn('[data-action="start-edit"]').disabled).toBe(true);
  });

  it("좁은 폭이면 [배치 편집]이 비활성이고 안내 제목을 단다", async () => {
    await mount(makeStore([]), { boardWidth: 1000 });
    expect(btn('[data-action="start-edit"]').disabled).toBe(true);
    expect(btn('[data-action="start-edit"]').title).toBe("넓은 화면에서 편집할 수 있습니다");
  });

  it("편집 → 위젯 빼기 → [완료] 는 바뀐 탭만 저장한다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] }]);
    await mount(store);
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="a"] [data-action="remove"]');
    click('[data-action="done-edit"]');
    await flush();
    expect(store.calls).toEqual(["load", "saveTab:home:홈:1"]);
    expect(btn('[data-action="start-edit"]')).not.toBeNull();
  });

  it("[완료] 저장이 실패하면 편집 모드와 변경을 유지하고 알린다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] }]);
    (store.saveTab as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("탭 이름이 중복입니다."));
    const { notify } = await mount(store);
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="a"] [data-action="remove"]');
    click('[data-action="done-edit"]');
    await flush();
    expect(notify).toHaveBeenCalledWith("탭 이름이 중복입니다.", "error");
    expect(btn('[data-action="done-edit"]')).not.toBeNull();
    expect(host.querySelectorAll(".cm-widget").length).toBe(1);
  });

  it("[취소] 는 바뀐 것이 있으면 확인 후 되돌린다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] }]);
    const { confirm } = await mount(store);
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="a"] [data-action="remove"]');
    click('[data-action="cancel-edit"]');
    await flush();
    expect(confirm).toHaveBeenCalledWith("변경 내용을 버릴까요?", expect.any(String));
    expect(host.querySelectorAll(".cm-widget").length).toBe(2);
    expect(store.calls).toEqual(["load"]);
  });

  it("(+) 새 탭은 편집 모드로 들어가고 [취소]하면 사라진다", async () => {
    await mount(makeStore([]));
    click('[data-action="add-tab"]');
    expect(tabNames()).toHaveLength(1); // 새 탭은 이름 입력 칸이라 span 이 아니다
    expect(host.querySelector(".cm-widget-tab__name")).not.toBeNull();
    expect(btn('[data-action="done-edit"]')).not.toBeNull();
    act(() => (host.querySelector(".cm-widget-tab__name") as HTMLInputElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    click('[data-action="cancel-edit"]');
    await flush();
    expect(tabNames()).toEqual(["홈"]);
  });

  it("보기 모드 탭 지우기는 확인 후 바로 저장소에 지운다", async () => {
    const store = makeStore([
      { tabId: "home", name: "홈", seq: 0, locked: false, items: [] },
      { tabId: "tab-1", name: "내 생산", seq: 1, locked: false, items: [] },
    ]);
    const { confirm } = await mount(store);
    act(() => btn('[data-tab-menu="tab-1"]').click());
    const del = [...document.querySelectorAll(".cm-widget-menu button")].find((b) => b.textContent?.includes("탭 지우기")) as HTMLButtonElement;
    act(() => del.click());
    await flush();
    expect(confirm).toHaveBeenCalled();
    expect(store.calls).toContain("deleteTab:tab-1");
    expect(tabNames()).toEqual(["홈"]);
  });

  it("보기 모드 탭 잠금 저장이 실패하면 원래대로 되돌린다", async () => {
    const store = makeStore([
      { tabId: "home", name: "홈", seq: 0, locked: false, items: [] },
      { tabId: "tab-1", name: "내 생산", seq: 1, locked: false, items: [] },
    ]);
    (store.saveTab as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("저장 실패"));
    const { notify } = await mount(store);
    act(() => btn('[data-tab-menu="tab-1"]').click());
    const lock = [...document.querySelectorAll(".cm-widget-menu button")].find((b) => b.textContent?.includes("탭 잠그기")) as HTMLButtonElement;
    act(() => lock.click());
    await flush();
    expect(notify).toHaveBeenCalledWith("저장 실패", "error");
    expect(host.querySelector('[data-tab-id="tab-1"] .cm-widget-tab__lock')).toBeNull();
  });

  it("편집 중 Escape 는 편집을 취소한다(바뀐 것이 없으면 확인 없이)", async () => {
    const { confirm } = await mount(makeStore([]));
    click('[data-action="start-edit"]');
    act(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await flush();
    expect(confirm).not.toHaveBeenCalled();
    expect(btn('[data-action="start-edit"]')).not.toBeNull();
  });

  it("잠긴 탭은 [배치 편집]이 비활성이다", async () => {
    await mount(makeStore([{ tabId: "home", name: "홈", seq: 0, locked: true, items: [] }]));
    expect(btn('[data-action="start-edit"]').disabled).toBe(true);
  });

  it("「기본 배치로 되돌리기」는 확인 후 resetHome 을 부르고 기본 배치를 보인다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0), it_("c", 12, 0)] }]);
    await mount(store);
    act(() => btn('[data-tab-menu="home"]').click());
    const reset = [...document.querySelectorAll(".cm-widget-menu button")].find((b) => b.textContent?.includes("기본 배치")) as HTMLButtonElement;
    act(() => reset.click());
    await flush();
    expect(store.calls).toContain("resetHome");
    expect(host.querySelectorAll(".cm-widget").length).toBe(1);
  });
});
```

- [ ] **Step 2: 시험 실패 확인**

Run: `cd src/frontend/shared && pnpm vitest run tests/unit/widget-workspace.unit.test.ts`
Expected: FAIL — `WidgetWorkspace` 가 export 되지 않음

- [ ] **Step 3: WidgetWorkspace 구현**

`src/frontend/shared/src/widget/WidgetWorkspace.tsx`:
```tsx
"use client";

/**
 * 위젯 작업 공간 — 탭 줄 + 보드 + [위젯 추가] 서랍 + 편집 흐름(스펙 §3·§4.3·§6).
 * - 저장은 주입받은 WidgetStore 로 한다. [완료]는 편집 시작 이후 바뀐 탭만 saveTab 한다.
 * - 보기 모드 탭 메뉴 작업(이름·잠금·옮기기·지우기·홈 되돌리기)은 바로 저장하고, 실패하면 화면을 되돌린다.
 * - 편집 모드 탭 메뉴는 이름 바꾸기만(이름은 [완료] 때 저장). (+) 새 탭은 편집 모드로 만들고 [취소]면 사라진다.
 * - 불러오기 실패면 기본 「홈」을 보이고 [배치 편집]을 막는다(빈 상태로 덮어쓰지 않게).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMessage } from "../components/message-provider";
import { HOME_TAB_ID, MAX_TABS } from "./constants";
import { WidgetBoard } from "./WidgetBoard";
import { WidgetPicker } from "./WidgetPicker";
import { WidgetStyle } from "./styles";
import { WidgetTabs } from "./WidgetTabs";
import type { WidgetItem, WidgetRegistry, WidgetStore, WidgetTab } from "./types";
import {
  addItem,
  canAddWidget,
  homeTab,
  newInstanceId,
  nextTabId,
  sanitizeLayout,
  tabsEqual,
  validateTabName,
  validateWidgetMeta,
} from "./widget-layout";

export interface WidgetWorkspaceProps {
  registry: WidgetRegistry;
  homeDefault: readonly WidgetItem[];
  store: WidgetStore;
  /** 마지막 탭 기억 키(localStorage dmes:widget:lastTab:{userId}). */
  userId?: string | null;
  confirm?: (title: string, message: string) => Promise<boolean>;
  notify?: (message: string, kind: "success" | "error") => void;
  boardWidth?: number;
  testId?: string;
}

type LoadStatus = "loading" | "ready" | "error";

/** MessageProvider 밖(시험 등)이면 null. useMessage 는 Provider 밖에서 던진다. */
function useOptionalMessage() {
  try {
    return useMessage();
  } catch {
    return null;
  }
}

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "요청을 처리하지 못했습니다.");
const lastTabKey = (userId?: string | null) => (userId ? `dmes:widget:lastTab:${userId}` : null);

function readLastTab(userId?: string | null): string | null {
  const key = lastTabKey(userId);
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLastTab(userId: string | null | undefined, tabId: string) {
  const key = lastTabKey(userId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, tabId);
  } catch {
    /* 사적 창 등 — 기억하지 않는다 */
  }
}

export function WidgetWorkspace({ registry, homeDefault, store, userId, confirm, notify, boardWidth, testId }: WidgetWorkspaceProps) {
  const message = useOptionalMessage();
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [tabs, setTabs] = useState<WidgetTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>(HOME_TAB_ID);
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<WidgetTab[] | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [wide, setWide] = useState(true);
  const [saving, setSaving] = useState(false);
  const loadSeq = useRef(0);

  const ask = useCallback(
    (title: string, text: string): Promise<boolean> => {
      if (confirm) return confirm(title, text);
      if (!message) return Promise.resolve(window.confirm(`${title}\n${text}`));
      return new Promise((resolve) =>
        message.showMessage({ title, message: text, alertType: "confirm", onConfirm: () => resolve(true), onCancel: () => resolve(false) })
      );
    },
    [confirm, message]
  );
  const tell = useCallback(
    (text: string, kind: "success" | "error") => {
      if (notify) return notify(text, kind);
      message?.showMessage({ message: text, alertType: kind === "error" ? "error" : "success", toast: true });
    },
    [notify, message]
  );

  // 등록부 메타 검사(크기 범위 등) — 개발 중 알림용.
  useEffect(() => {
    for (const entry of Object.values(registry)) {
      for (const p of validateWidgetMeta(entry.meta)) console.error(`[widget] ${p}`);
    }
  }, [registry]);

  const defaultHome = useCallback(() => homeTab(sanitizeLayout(homeDefault, registry)), [homeDefault, registry]);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setStatus("loading");
    try {
      const loaded = await store.load();
      if (seq !== loadSeq.current) return;
      const cleaned = loaded.map((t) => ({ ...t, items: sanitizeLayout(t.items, registry) }));
      const home = cleaned.find((t) => t.tabId === HOME_TAB_ID);
      const others = cleaned.filter((t) => t.tabId !== HOME_TAB_ID).sort((a, b) => a.seq - b.seq);
      const next = [home ? { ...home, name: homeTab([]).name, seq: 0 } : defaultHome(), ...others];
      setTabs(next);
      const last = readLastTab(userId);
      setActiveTabId(last && next.some((t) => t.tabId === last) ? last : HOME_TAB_ID);
      setStatus("ready");
    } catch {
      if (seq !== loadSeq.current) return;
      setTabs([defaultHome()]);
      setActiveTabId(HOME_TAB_ID);
      setStatus("error");
    }
  }, [store, registry, defaultHome, userId]);

  useEffect(() => {
    void load();
    return () => {
      loadSeq.current += 1;
    };
  }, [load]);

  const active = tabs.find((t) => t.tabId === activeTabId) ?? tabs[0];
  const setActiveItems = (items: WidgetItem[]) =>
    setTabs((prev) => prev.map((t) => (t.tabId === active?.tabId ? { ...t, items } : t)));

  const selectTab = (tabId: string) => {
    setActiveTabId(tabId);
    writeLastTab(userId, tabId);
  };

  /* ── 편집 흐름 ── */
  const startEdit = () => {
    setSnapshot(tabs.map((t) => ({ ...t, items: [...t.items] })));
    setEditing(true);
  };
  const changedTabs = useMemo(() => {
    if (!snapshot) return [];
    return tabs.filter((t) => {
      const before = snapshot.find((s) => s.tabId === t.tabId);
      return !before || !tabsEqual(before, t);
    });
  }, [tabs, snapshot]);

  const finishEdit = () => {
    setEditing(false);
    setSnapshot(null);
    setRenamingTabId(null);
  };

  const doneEdit = async () => {
    setSaving(true);
    try {
      for (const t of changedTabs) {
        const seq = tabs.indexOf(t);
        await store.saveTab({ ...t, seq });
      }
      finishEdit();
      if (changedTabs.length > 0) tell("배치를 저장했습니다.", "success");
    } catch (e) {
      tell(errMsg(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = async () => {
    if (changedTabs.length > 0 && !(await ask("변경 내용을 버릴까요?", "배치 편집을 시작한 뒤 바꾼 내용이 모두 사라집니다."))) return;
    const restored = snapshot ?? tabs;
    setTabs(restored);
    if (!restored.some((t) => t.tabId === activeTabId)) setActiveTabId(HOME_TAB_ID);
    finishEdit();
  };

  // Escape — 편집 취소(입력 칸·메뉴 안에서 누른 Escape 는 그쪽이 처리한다).
  const cancelRef = useRef(cancelEdit);
  cancelRef.current = cancelEdit;
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "Escape" || t?.closest("input, textarea, [role='menu']")) return;
      void cancelRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing]);

  /* ── 탭 작업 ── */
  const addTab = () => {
    if (tabs.length >= MAX_TABS) return;
    const tabId = nextTabId(tabs);
    let name = "새 탭";
    for (let n = 2; tabs.some((t) => t.name === name); n += 1) name = `새 탭 ${n}`;
    if (!editing) startEdit();
    setTabs((prev) => [...prev, { tabId, name, seq: prev.length, locked: false, items: [] }]);
    setActiveTabId(tabId);
    setRenamingTabId(tabId);
  };

  /** 보기 모드 즉시 저장 — 먼저 화면에 반영하고 실패하면 되돌린다. */
  const saveNow = async (next: WidgetTab[], persist: () => Promise<void>) => {
    const before = tabs;
    setTabs(next);
    try {
      await persist();
    } catch (e) {
      setTabs(before);
      tell(errMsg(e), "error");
    }
  };

  const renameCommit = (tabId: string, name: string): string | null => {
    const error = validateTabName(name, tabs, tabId);
    if (error) return error;
    const value = name.trim();
    setRenamingTabId(null);
    const next = tabs.map((t) => (t.tabId === tabId ? { ...t, name: value } : t));
    if (editing) setTabs(next);
    else {
      const tab = next.find((t) => t.tabId === tabId)!;
      void saveNow(next, () => store.saveTab({ ...tab, seq: next.indexOf(tab) }));
    }
    return null;
  };

  const toggleTabLock = (tabId: string) => {
    const next = tabs.map((t) => (t.tabId === tabId ? { ...t, locked: !t.locked } : t));
    const tab = next.find((t) => t.tabId === tabId)!;
    void saveNow(next, () => store.saveTab({ ...tab, seq: next.indexOf(tab) }));
  };

  const moveTab = (tabId: string, dir: -1 | 1) => {
    const i = tabs.findIndex((t) => t.tabId === tabId);
    const j = i + dir;
    if (i <= 0 || j <= 0 || j >= tabs.length) return;
    const next = [...tabs];
    [next[i], next[j]] = [next[j], next[i]];
    void saveNow(next, () => store.reorderTabs(next.filter((t) => t.tabId !== HOME_TAB_ID).map((t) => t.tabId)));
  };

  const deleteTab = async (tabId: string) => {
    const tab = tabs.find((t) => t.tabId === tabId);
    if (!tab || tabId === HOME_TAB_ID) return;
    if (!(await ask("탭을 지울까요?", `「${tab.name}」 탭과 위젯 ${tab.items.length}개를 지웁니다.`))) return;
    const next = tabs.filter((t) => t.tabId !== tabId);
    if (activeTabId === tabId) selectTab(HOME_TAB_ID);
    await saveNow(next, () => store.deleteTab(tabId));
  };

  const resetHome = async () => {
    if (!(await ask("기본 배치로 되돌릴까요?", "「홈」 탭의 내 배치를 지우고 기본 배치로 돌아갑니다."))) return;
    const next = tabs.map((t) => (t.tabId === HOME_TAB_ID ? { ...defaultHome(), locked: t.locked } : t));
    await saveNow(next, () => store.resetHome());
  };

  const addFromPicker = (widgetId: string) => {
    const meta = registry[widgetId]?.meta;
    if (!active || !meta || !canAddWidget(active.items, meta)) return;
    setActiveItems(addItem(active.items, widgetId, meta, newInstanceId()));
  };

  if (status === "loading" || !active) {
    return (
      <div className="cm-widget-ws" data-testid={testId} aria-busy="true">
        <WidgetStyle />
        <div className="cm-widget-tabs" />
        <div className="cm-widget__skeleton">
          <i style={{ width: "40%" }} />
          <i />
          <i style={{ width: "70%" }} />
        </div>
      </div>
    );
  }

  const editBlockedReason =
    status === "error" ? "저장한 위젯 화면을 불러오지 못해 편집할 수 없습니다" : !wide ? "넓은 화면에서 편집할 수 있습니다" : active.locked ? "잠긴 탭입니다. 탭 메뉴에서 잠금을 풀어 주세요." : null;

  const trailing = editing ? (
    <>
      <span className="cm-widget-ws__hint">배치 편집 중</span>
      <button type="button" className="cm-widget-ws__btn" data-action="cancel-edit" disabled={saving} onClick={() => void cancelEdit()}>
        취소
      </button>
      <button type="button" className="cm-widget-ws__btn cm-widget-ws__btn--primary" data-action="done-edit" disabled={saving} onClick={() => void doneEdit()}>
        {saving ? "저장 중…" : "완료"}
      </button>
    </>
  ) : (
    <button
      type="button"
      className="cm-widget-ws__btn"
      data-action="start-edit"
      disabled={editBlockedReason != null}
      title={editBlockedReason ?? "위젯을 옮기고 크기를 바꿉니다"}
      onClick={startEdit}
    >
      ✎ 배치 편집
    </button>
  );

  return (
    <div className="cm-widget-ws" data-testid={testId}>
      <WidgetStyle />
      {status === "error" && (
        <div className="cm-widget-ws__banner" role="alert">
          저장한 위젯 화면을 불러오지 못했습니다.
          <button type="button" className="cm-widget-ws__btn" onClick={() => void load()}>
            다시 시도
          </button>
        </div>
      )}
      <WidgetTabs
        tabs={tabs}
        activeTabId={active.tabId}
        editing={editing}
        menuDisabled={status === "error"}
        renamingTabId={renamingTabId}
        onSelect={selectTab}
        onAdd={addTab}
        onRenameStart={setRenamingTabId}
        onRenameCommit={renameCommit}
        onRenameCancel={() => setRenamingTabId(null)}
        onToggleLock={toggleTabLock}
        onMove={moveTab}
        onDelete={(id) => void deleteTab(id)}
        onResetHome={() => void resetHome()}
        trailing={trailing}
      />
      <div className="cm-widget-ws__body">
        <div className="cm-widget-ws__board">
          <WidgetBoard
            items={active.items}
            registry={registry}
            editing={editing}
            tabLocked={active.locked}
            onChange={setActiveItems}
            onWideChange={setWide}
            width={boardWidth}
          />
        </div>
        {editing && wide && !active.locked && <WidgetPicker registry={registry} items={active.items} onAdd={addFromPicker} />}
      </div>
    </div>
  );
}
```

`useMessage` 의 import 경로가 shared 내부에서 `../components/message-provider` 가 맞는지 확인한다(`src/components/message-provider.tsx`). `splitting:false` 때문에 widget.js 와 message-provider.js 가 각각 코드를 갖지만, message-provider 는 Context 를 `globalThis` 에 캐시하므로 같은 Provider 를 본다(조사 결과 message-provider.tsx:29-45). 시험의 「(+) 새 탭」 단언 `tabNames()` 는 이름 입력 칸이 `span` 이 아니라서 1개다.

`index.ts` 에 덧붙인다:
```ts
export { WidgetWorkspace } from "./WidgetWorkspace";
export type { WidgetWorkspaceProps } from "./WidgetWorkspace";
```

- [ ] **Step 4: 시험 통과 확인**

Run: `cd src/frontend/shared && pnpm vitest run tests/unit/widget-workspace.unit.test.ts && pnpm test:unit`
Expected: 새 시험 PASS, 기존 shared 시험 전체 PASS(기준선 591개 + 새 시험)

- [ ] **Step 5: 공통 컴포넌트 문서·색인 갱신(Part B §18)**

1. `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md` 진입점 표의 `@dk-oasis/shared/dashboard` 줄 바로 아래에:
```markdown
| `@dk-oasis/shared/widget`                     | SHOULD                 | 위젯 자유 배치(탭·보드·틀·서랍·작업 공간) | §18              |
```
2. `.claude/skills/mantine-aggrid-ui/references/components/widget.md` 를 새로 만든다 — 기존 `dashboard.md` 와 같은 절 구성(용도·import·props 표·예시·주의)으로 `WidgetWorkspace`·`WidgetBoard`·`WidgetFrame`·`WidgetTabs`·`WidgetPicker`·훅 4개(`useWidgetStatus`·`useWidgetBodySize`·`WidgetHeaderActions`·`WidgetTitleExtra`)·`WidgetStore` 계약을 적고, 예시는 Task 10 의 홈 화면 연결 코드를 줄여 싣는다. "행 단위 대시보드가 필요하면 dashboard, 사용자가 자유 배치·탭·서버 저장을 쓰면 widget" 선택 기준을 맨 위에 둔다.
3. `.claude/skills/mantine-aggrid-ui/scripts/ui_docs.py` 의 그룹 목록에서 `("대시보드 (`@dk-oasis/shared/dashboard`)", ["dashboard"]),` 다음 줄에 `("위젯 (`@dk-oasis/shared/widget`)", ["widget"]),` 를, 진입점 목록에 `"widget/index.ts",` 를 `"components/dashboard/index.ts",` 아래에 넣는다.
4. 색인을 다시 만든다:
```bash
python3 .claude/skills/mantine-aggrid-ui/scripts/ui_docs.py --help | head -20   # 재생성 하위 명령 이름 확인
python3 .claude/skills/mantine-aggrid-ui/scripts/ui_docs.py <재생성 하위 명령>
git diff --stat .claude/skills/mantine-aggrid-ui
```
Expected: `llms.txt`·`llms-full.txt` 에 widget 항목이 생긴다.

- [ ] **Step 6: shared 빌드 확인**

Run: `cd src/frontend/shared && pnpm build`
Expected: 성공, `dist/widget.js`·`dist/types/widget/index.d.ts` 생성. `pnpm dev` 가 켜진 작업 트리면 Local-Rules §2-2 대로 별도 빌드 대신 watch 결과를 확인한다.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add src/frontend/shared/src/widget src/frontend/shared/tests/unit/widget-workspace.unit.test.ts docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md .claude/skills/mantine-aggrid-ui
/usr/bin/git commit -m "feat(shared): 위젯 작업 공간(WidgetWorkspace)과 공통 컴포넌트 문서를 추가한다" -m "쉬운 설명: 탭·격자·위젯 추가 서랍을 하나로 묶고, 배치 편집을 [완료]로 저장하거나 [취소]로 되돌리는 흐름을 만들었습니다. 저장에 실패해도 편집한 내용이 사라지지 않습니다.

- 바뀐 탭만 저장, 보기 모드 탭 작업 즉시 저장·실패 시 되돌림
- 불러오기 실패·좁은 화면·잠긴 탭에서 편집 막기
- Part B 진입점 표, mantine-aggrid-ui widget 문서·색인

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 백엔드 엔티티·리포지토리·서비스(mcm-core)

**Files:**
- Create (모두 `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/widget/` 아래):
  - `entity/SecUserWidgetTab.java`, `entity/SecUserWidgetTabId.java`, `entity/SecUserWidget.java`, `entity/SecUserWidgetId.java`
  - `repository/SecUserWidgetTabRepository.java`, `repository/SecUserWidgetRepository.java`
  - `dto/SecWidgetSearchRequest.java`, `dto/SecWidgetTabRequest.java`, `dto/SecWidgetTabSaveRequest.java`
  - `service/SecWidgetTabWriter.java`, `service/SecWidgetService.java`
- Test: `src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/widget/service/SecWidgetServiceTest.java`

**Interfaces:**
- Consumes: `McmAuditEntity`, `SecurityIdentity`, `BusinessException`, `ErrorCode`
- Produces (Task 7 BPMN·Task 10 프런트가 쓴다):
  - 빈 `secWidgetService`: `Map<String,Object> search(SecWidgetSearchRequest request)` → `{ tabs: List<Map>, widgets: List<Map> }`; `Map<String,Object> saveTab(SecWidgetTabSaveRequest request, List<Map<String,Object>> widgets)` → `{ tabId, savedCount }`; `Map<String,Object> deleteTab(SecWidgetTabRequest request)` → `{ tabId, deleted: true }`; `Map<String,Object> reorderTabs(List<Map<String,Object>> tabs)` → `{ count }`; `Map<String,Object> resetHome(SecWidgetSearchRequest request)` → `{ deleted: int }`
  - 탭 Map 키: `tabId, tabNm, tabSeq, lockYn` / 위젯 Map 키: `tabId, instId, widgetId, posX, posY, sizeW, sizeH, lockYn, configJson`

- [ ] **Step 1: 엔티티·키·리포지토리·DTO 작성**

`entity/SecUserWidgetTabId.java`:
```java
package com.dongkuk.dmes.mcm.widget.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link SecUserWidgetTab} 복합키 (USER_ID, TAB_ID). */
public class SecUserWidgetTabId implements Serializable {

    private String userId;
    private String tabId;

    public SecUserWidgetTabId() {}

    public SecUserWidgetTabId(String userId, String tabId) {
        this.userId = userId;
        this.tabId = tabId;
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SecUserWidgetTabId that)) return false;
        return Objects.equals(userId, that.userId) && Objects.equals(tabId, that.tabId);
    }

    @Override
    public int hashCode() { return Objects.hash(userId, tabId); }
}
```

`entity/SecUserWidgetTab.java`:
```java
package com.dongkuk.dmes.mcm.widget.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 사용자 위젯 탭 — 포털 홈 위젯 화면의 탭 하나(스펙 2026-10-02-widget-foundation §4.1).
 * TAB_ID 는 "home" 또는 "tab-{n}". 감사컬럼은 {@link McmAuditEntity}.
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_WIDGET_TAB", schema = "MCMAPUSER")
@IdClass(SecUserWidgetTabId.class)
public class SecUserWidgetTab extends McmAuditEntity {

    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    @Id
    @Column(name = "TAB_ID", length = 30, nullable = false)
    private String tabId;

    @Column(name = "TAB_NM", length = 60, nullable = false)
    private String tabNm;

    @Column(name = "TAB_SEQ", nullable = false)
    private Integer tabSeq;

    @Column(name = "LOCK_YN", length = 1, nullable = false)
    private String lockYn;

    public SecUserWidgetTab() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }
    public String getTabNm() { return tabNm; }
    public void setTabNm(String tabNm) { this.tabNm = tabNm; }
    public Integer getTabSeq() { return tabSeq; }
    public void setTabSeq(Integer tabSeq) { this.tabSeq = tabSeq; }
    public String getLockYn() { return lockYn; }
    public void setLockYn(String lockYn) { this.lockYn = lockYn; }
}
```

`entity/SecUserWidgetId.java`: `SecUserWidgetTabId` 와 같은 모양으로 필드 `userId`, `tabId`, `instId` 세 개, 생성자 `(String userId, String tabId, String instId)`, `equals`·`hashCode` 를 세 필드로 쓴다.
```java
package com.dongkuk.dmes.mcm.widget.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link SecUserWidget} 복합키 (USER_ID, TAB_ID, INST_ID). */
public class SecUserWidgetId implements Serializable {

    private String userId;
    private String tabId;
    private String instId;

    public SecUserWidgetId() {}

    public SecUserWidgetId(String userId, String tabId, String instId) {
        this.userId = userId;
        this.tabId = tabId;
        this.instId = instId;
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }
    public String getInstId() { return instId; }
    public void setInstId(String instId) { this.instId = instId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SecUserWidgetId that)) return false;
        return Objects.equals(userId, that.userId) && Objects.equals(tabId, that.tabId)
                && Objects.equals(instId, that.instId);
    }

    @Override
    public int hashCode() { return Objects.hash(userId, tabId, instId); }
}
```

`entity/SecUserWidget.java`:
```java
package com.dongkuk.dmes.mcm.widget.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 탭에 놓인 위젯 인스턴스 — 넓은 화면(24칸) 격자 좌표·크기(스펙 §4.1).
 * CONFIG_JSON 은 인스턴스 설정(C 단계). 세 방언에서 같은 형으로 쓰려고 VARCHAR(4000).
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_WIDGET", schema = "MCMAPUSER")
@IdClass(SecUserWidgetId.class)
public class SecUserWidget extends McmAuditEntity {

    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    @Id
    @Column(name = "TAB_ID", length = 30, nullable = false)
    private String tabId;

    @Id
    @Column(name = "INST_ID", length = 40, nullable = false)
    private String instId;

    @Column(name = "WIDGET_ID", length = 100, nullable = false)
    private String widgetId;

    @Column(name = "POS_X", nullable = false)
    private Integer posX;

    @Column(name = "POS_Y", nullable = false)
    private Integer posY;

    @Column(name = "SIZE_W", nullable = false)
    private Integer sizeW;

    @Column(name = "SIZE_H", nullable = false)
    private Integer sizeH;

    @Column(name = "LOCK_YN", length = 1, nullable = false)
    private String lockYn;

    @Column(name = "CONFIG_JSON", length = 4000)
    private String configJson;

    public SecUserWidget() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }
    public String getInstId() { return instId; }
    public void setInstId(String instId) { this.instId = instId; }
    public String getWidgetId() { return widgetId; }
    public void setWidgetId(String widgetId) { this.widgetId = widgetId; }
    public Integer getPosX() { return posX; }
    public void setPosX(Integer posX) { this.posX = posX; }
    public Integer getPosY() { return posY; }
    public void setPosY(Integer posY) { this.posY = posY; }
    public Integer getSizeW() { return sizeW; }
    public void setSizeW(Integer sizeW) { this.sizeW = sizeW; }
    public Integer getSizeH() { return sizeH; }
    public void setSizeH(Integer sizeH) { this.sizeH = sizeH; }
    public String getLockYn() { return lockYn; }
    public void setLockYn(String lockYn) { this.lockYn = lockYn; }
    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }
}
```

`repository/SecUserWidgetTabRepository.java`:
```java
package com.dongkuk.dmes.mcm.widget.repository;

import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTabId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SecUserWidgetTabRepository extends JpaRepository<SecUserWidgetTab, SecUserWidgetTabId> {

    List<SecUserWidgetTab> findByUserIdOrderByTabSeqAsc(String userId);
}
```

`repository/SecUserWidgetRepository.java`:
```java
package com.dongkuk.dmes.mcm.widget.repository;

import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

public interface SecUserWidgetRepository extends JpaRepository<SecUserWidget, SecUserWidgetId> {

    List<SecUserWidget> findByUserId(String userId);

    @Modifying
    @Transactional
    void deleteByUserIdAndTabId(String userId, String tabId);
}
```

DTO 세 개 — 기본 생성자와 getter/setter 만(secFavorite DTO 와 같은 모양), `userId` 필드는 두지 않는다:
```java
package com.dongkuk.dmes.mcm.widget.dto;

/** secWidget search·resetHome 요청 — 입력 없음(사용자는 인증 컨텍스트). */
public class SecWidgetSearchRequest {
    public SecWidgetSearchRequest() {}
}
```
```java
package com.dongkuk.dmes.mcm.widget.dto;

/** secWidget deleteTab 요청. */
public class SecWidgetTabRequest {

    private String tabId;

    public SecWidgetTabRequest() {}

    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }
}
```
```java
package com.dongkuk.dmes.mcm.widget.dto;

/** secWidget saveTab 요청의 params — 위젯 목록은 grids.widgets.rows(파라미터 이름 widgets)로 따로 받는다. */
public class SecWidgetTabSaveRequest {

    private String tabId;
    private String tabNm;
    private Integer tabSeq;
    private String lockYn;

    public SecWidgetTabSaveRequest() {}

    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }
    public String getTabNm() { return tabNm; }
    public void setTabNm(String tabNm) { this.tabNm = tabNm; }
    public Integer getTabSeq() { return tabSeq; }
    public void setTabSeq(Integer tabSeq) { this.tabSeq = tabSeq; }
    public String getLockYn() { return lockYn; }
    public void setLockYn(String lockYn) { this.lockYn = lockYn; }
}
```

- [ ] **Step 2: 실패하는 서비스 시험 작성**

`src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/widget/service/SecWidgetServiceTest.java`:
```java
package com.dongkuk.dmes.mcm.widget.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabSaveRequest;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** {@link SecWidgetService} — 사용자 격리(IDOR)·입력 검사·한도·탭 교체 위임. */
@ExtendWith(MockitoExtension.class)
class SecWidgetServiceTest {

    @Mock SecUserWidgetTabRepository tabRepository;
    @Mock SecUserWidgetRepository widgetRepository;
    @Mock SecWidgetTabWriter writer;
    @Mock SecurityIdentity securityIdentity;

    @InjectMocks SecWidgetService service;

    private static SecWidgetTabSaveRequest save(String tabId, String tabNm) {
        SecWidgetTabSaveRequest r = new SecWidgetTabSaveRequest();
        r.setTabId(tabId);
        r.setTabNm(tabNm);
        r.setTabSeq(1);
        r.setLockYn("N");
        return r;
    }

    private static Map<String, Object> widget(String instId, int x, int y, int w, int h) {
        Map<String, Object> m = new HashMap<>();
        m.put("instId", instId);
        m.put("widgetId", "home.notice");
        m.put("posX", x);
        m.put("posY", y);
        m.put("sizeW", w);
        m.put("sizeH", h);
        m.put("lockYn", "N");
        return m;
    }

    private static SecUserWidgetTab tab(String userId, String tabId, String nm, int seq) {
        SecUserWidgetTab t = new SecUserWidgetTab();
        t.setUserId(userId);
        t.setTabId(tabId);
        t.setTabNm(nm);
        t.setTabSeq(seq);
        t.setLockYn("N");
        return t;
    }

    @Test
    @DisplayName("search 는 인증 사용자의 탭·위젯만 Map 목록으로 돌려준다")
    void searchReturnsOwnTabsAndWidgets() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(tab("userA", "home", "홈", 0)));
        SecUserWidget w = new SecUserWidget();
        w.setUserId("userA"); w.setTabId("home"); w.setInstId("i1"); w.setWidgetId("home.notice");
        w.setPosX(0); w.setPosY(0); w.setSizeW(10); w.setSizeH(16); w.setLockYn("Y");
        when(widgetRepository.findByUserId("userA")).thenReturn(List.of(w));

        Map<String, Object> result = service.search(new SecWidgetSearchRequest());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tabs = (List<Map<String, Object>>) result.get("tabs");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> widgets = (List<Map<String, Object>>) result.get("widgets");
        assertThat(tabs).singleElement().satisfies(t -> {
            assertThat(t.get("tabId")).isEqualTo("home");
            assertThat(t.get("tabNm")).isEqualTo("홈");
            assertThat(t.get("lockYn")).isEqualTo("N");
        });
        assertThat(widgets).singleElement().satisfies(m -> {
            assertThat(m.get("instId")).isEqualTo("i1");
            assertThat(m.get("sizeW")).isEqualTo(10);
            assertThat(m.get("lockYn")).isEqualTo("Y");
        });
    }

    @Test
    @DisplayName("인증 사용자가 없으면 모든 action 이 AUTH_FAILED 로 거절되고 저장소를 건드리지 않는다")
    void rejectsWithoutUser() {
        when(securityIdentity.currentUserId()).thenReturn(null);

        assertThatThrownBy(() -> service.search(new SecWidgetSearchRequest())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.saveTab(save("home", "홈"), List.of())).isInstanceOf(BusinessException.class);
        verify(tabRepository, never()).findByUserIdOrderByTabSeqAsc(anyString());
        verify(writer, never()).replaceTab(anyString(), any(), anyList());
    }

    @Test
    @DisplayName("saveTab 은 인증 사용자로 탭 교체를 Writer 에 맡긴다 — home 이름은 「홈」으로 고정")
    void saveTabDelegatesToWriter() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(new ArrayList<>());

        Map<String, Object> result = service.saveTab(save("home", "아무 이름"), List.of(widget("i1", 0, 0, 10, 16)));

        ArgumentCaptor<SecWidgetTabWriter.TabValues> tabCap = ArgumentCaptor.forClass(SecWidgetTabWriter.TabValues.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<SecWidgetTabWriter.WidgetValues>> widgetCap = ArgumentCaptor.forClass(List.class);
        verify(writer).replaceTab(eq("userA"), tabCap.capture(), widgetCap.capture());
        assertThat(tabCap.getValue().tabNm()).isEqualTo("홈");
        assertThat(tabCap.getValue().tabSeq()).isEqualTo(0);
        assertThat(widgetCap.getValue()).singleElement().satisfies(v -> {
            assertThat(v.instId()).isEqualTo("i1");
            assertThat(v.sizeW()).isEqualTo(10);
        });
        assertThat(result).containsEntry("tabId", "home").containsEntry("savedCount", 1);
    }

    @Test
    @DisplayName("saveTab 입력 검사 — tabId 형식·이름 길이·이름 중복·격자 밖·instId 중복")
    void saveTabValidates() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA"))
                .thenReturn(List.of(tab("userA", "home", "홈", 0), tab("userA", "tab-1", "내 생산", 1)));

        assertThatThrownBy(() -> service.saveTab(save("bad id", "가"), List.of())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.saveTab(save("tab-2", " "), List.of())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.saveTab(save("tab-2", "가".repeat(21)), List.of())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.saveTab(save("tab-2", "내 생산"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("같은 이름");
        assertThatThrownBy(() -> service.saveTab(save("tab-2", "품질"), List.of(widget("i1", 20, 0, 6, 6))))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.saveTab(save("tab-2", "품질"), List.of(widget("i1", 0, 0, 6, 6), widget("i1", 6, 0, 6, 6))))
                .isInstanceOf(BusinessException.class);
        verify(writer, never()).replaceTab(anyString(), any(), anyList());
    }

    @Test
    @DisplayName("같은 탭의 이름 그대로 저장은 중복으로 보지 않는다")
    void saveTabSameNameSameTab() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(tab("userA", "tab-1", "내 생산", 1)));

        service.saveTab(save("tab-1", "내 생산"), List.of());

        verify(writer).replaceTab(eq("userA"), any(), anyList());
    }

    @Test
    @DisplayName("탭 10개면 새 탭은 거절, 기존 탭 저장은 허용 · 위젯 31개는 거절")
    void saveTabLimits() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        List<SecUserWidgetTab> ten = new ArrayList<>();
        ten.add(tab("userA", "home", "홈", 0));
        for (int i = 1; i <= 9; i++) ten.add(tab("userA", "tab-" + i, "t" + i, i));
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(ten);

        assertThatThrownBy(() -> service.saveTab(save("tab-10", "새"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("10");
        service.saveTab(save("tab-3", "t3"), List.of());
        List<Map<String, Object>> many = new ArrayList<>();
        for (int i = 0; i < 31; i++) many.add(widget("i" + i, 0, i * 6, 6, 6));
        assertThatThrownBy(() -> service.saveTab(save("tab-3", "t3"), many))
                .isInstanceOf(BusinessException.class).hasMessageContaining("30");
    }

    @Test
    @DisplayName("deleteTab 은 home 을 거절하고, 다른 탭은 Writer 로 지운다")
    void deleteTab() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        SecWidgetTabRequest home = new SecWidgetTabRequest();
        home.setTabId("home");
        assertThatThrownBy(() -> service.deleteTab(home)).isInstanceOf(BusinessException.class);

        SecWidgetTabRequest req = new SecWidgetTabRequest();
        req.setTabId("tab-1");
        assertThat(service.deleteTab(req)).containsEntry("deleted", true);
        verify(writer).deleteTab("userA", "tab-1");
    }

    @Test
    @DisplayName("reorderTabs 는 home 을 빼고 받은 순서대로 1부터 매긴다")
    void reorderTabs() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA"))
                .thenReturn(List.of(tab("userA", "home", "홈", 0), tab("userA", "tab-1", "a", 1), tab("userA", "tab-2", "b", 2)));

        Map<String, Object> result = service.reorderTabs(List.of(Map.of("tabId", "tab-2"), Map.of("tabId", "home"), Map.of("tabId", "tab-1")));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Integer>> cap = ArgumentCaptor.forClass(Map.class);
        verify(writer).reorder(eq("userA"), cap.capture());
        assertThat(cap.getValue()).containsExactlyInAnyOrderEntriesOf(Map.of("tab-2", 1, "tab-1", 2));
        assertThat(result).containsEntry("count", 2);
    }

    @Test
    @DisplayName("resetHome 은 인증 사용자의 home 탭만 지운다")
    void resetHome() {
        when(securityIdentity.currentUserId()).thenReturn("userA");

        service.resetHome(new SecWidgetSearchRequest());

        verify(writer).deleteTab("userA", "home");
    }
}
```

- [ ] **Step 3: 시험 실패 확인**

Run: `cd src/backend && ./gradlew :mcm-core:test --tests "com.dongkuk.dmes.mcm.widget.*"`
Expected: FAIL — `SecWidgetService`·`SecWidgetTabWriter` 클래스 없음(컴파일 오류). `JAVA_HOME` 은 JDK 21(메모리 local-run-mac-setup 참조).

- [ ] **Step 4: Writer 구현**

`service/SecWidgetTabWriter.java`:
```java
package com.dongkuk.dmes.mcm.widget.service;

import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTabId;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 위젯 탭 쓰기의 트랜잭션 경계. OASIS 서비스 빈({@link SecWidgetService})에는 {@code @Transactional} 을 붙일 수 없어
 * (CGLIB 프록시가 파라미터명 메타데이터를 잃는다, BackEnd 표준 §6-B-1) 원자성이 필요한 쓰기를 이 빈에 모은다.
 * 기존 탭 행은 찾아서 고쳐 감사 컬럼(C_AT 등)을 보존한다.
 */
@Component("secWidgetTabWriter")
public class SecWidgetTabWriter {

    /** 검증을 마친 탭 값. */
    public record TabValues(String tabId, String tabNm, int tabSeq, String lockYn) {}

    /** 검증을 마친 위젯 값. */
    public record WidgetValues(String instId, String widgetId, int posX, int posY, int sizeW, int sizeH,
                               String lockYn, String configJson) {}

    private final SecUserWidgetTabRepository tabRepository;
    private final SecUserWidgetRepository widgetRepository;

    @Autowired
    public SecWidgetTabWriter(SecUserWidgetTabRepository tabRepository, SecUserWidgetRepository widgetRepository) {
        this.tabRepository = tabRepository;
        this.widgetRepository = widgetRepository;
    }

    /** 탭 하나를 통째로 바꾼다 — 탭 행 upsert, 위젯 행 지우고 다시 넣기. */
    @Transactional
    public void replaceTab(String userId, TabValues tab, List<WidgetValues> widgets) {
        SecUserWidgetTab row = tabRepository.findById(new SecUserWidgetTabId(userId, tab.tabId()))
                .orElseGet(SecUserWidgetTab::new);
        row.setUserId(userId);
        row.setTabId(tab.tabId());
        row.setTabNm(tab.tabNm());
        row.setTabSeq(tab.tabSeq());
        row.setLockYn(tab.lockYn());
        tabRepository.save(row);

        widgetRepository.deleteByUserIdAndTabId(userId, tab.tabId());
        widgetRepository.flush();
        widgetRepository.saveAll(widgets.stream().map(w -> {
            SecUserWidget e = new SecUserWidget();
            e.setUserId(userId);
            e.setTabId(tab.tabId());
            e.setInstId(w.instId());
            e.setWidgetId(w.widgetId());
            e.setPosX(w.posX());
            e.setPosY(w.posY());
            e.setSizeW(w.sizeW());
            e.setSizeH(w.sizeH());
            e.setLockYn(w.lockYn());
            e.setConfigJson(w.configJson());
            return e;
        }).toList());
    }

    /** 탭과 그 위젯을 지운다. 없으면 아무것도 하지 않는다. */
    @Transactional
    public void deleteTab(String userId, String tabId) {
        widgetRepository.deleteByUserIdAndTabId(userId, tabId);
        tabRepository.findById(new SecUserWidgetTabId(userId, tabId)).ifPresent(tabRepository::delete);
    }

    /** tabId → 새 순서. 사용자에게 없는 탭은 건너뛴다. */
    @Transactional
    public void reorder(String userId, Map<String, Integer> seqByTabId) {
        List<SecUserWidgetTab> tabs = tabRepository.findByUserIdOrderByTabSeqAsc(userId);
        for (SecUserWidgetTab t : tabs) {
            Integer seq = seqByTabId.get(t.getTabId());
            if (seq != null) t.setTabSeq(seq);
        }
        tabRepository.saveAll(tabs);
    }
}
```

- [ ] **Step 5: 서비스 구현**

`service/SecWidgetService.java`:
```java
package com.dongkuk.dmes.mcm.widget.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabSaveRequest;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 사용자 위젯 탭·배치 저장 — OASIS {@code secWidget}(스펙 2026-10-02-widget-foundation §4.2).
 * 사용자는 늘 인증 컨텍스트에서 얻는다(IDOR). 쓰기 원자성은 {@link SecWidgetTabWriter} 가 맡는다 — 이 클래스에는
 * {@code @Transactional} 을 붙이지 않는다(BackEnd 표준 §6-B-1).
 */
@Service("secWidgetService")
public class SecWidgetService {

    static final String HOME_TAB_ID = "home";
    static final String HOME_TAB_NM = "홈";
    static final int GRID_COLS = 24;
    static final int MAX_TABS = 10;
    static final int MAX_WIDGETS = 30;
    static final int TAB_NM_MAX = 20;
    private static final Pattern TAB_ID = Pattern.compile("^(home|tab-\\d{1,6})$");

    private final SecUserWidgetTabRepository tabRepository;
    private final SecUserWidgetRepository widgetRepository;
    private final SecWidgetTabWriter writer;
    private final SecurityIdentity securityIdentity;

    @Autowired
    public SecWidgetService(SecUserWidgetTabRepository tabRepository,
                            SecUserWidgetRepository widgetRepository,
                            SecWidgetTabWriter writer,
                            SecurityIdentity securityIdentity) {
        this.tabRepository = tabRepository;
        this.widgetRepository = widgetRepository;
        this.writer = writer;
        this.securityIdentity = securityIdentity;
    }

    /** 사용자 탭 전체와 위젯 전체. */
    public Map<String, Object> search(SecWidgetSearchRequest request) {
        String userId = requireUser();
        List<Map<String, Object>> tabs = new ArrayList<>();
        for (SecUserWidgetTab t : tabRepository.findByUserIdOrderByTabSeqAsc(userId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("tabId", t.getTabId());
            m.put("tabNm", HOME_TAB_ID.equals(t.getTabId()) ? HOME_TAB_NM : t.getTabNm());
            m.put("tabSeq", t.getTabSeq());
            m.put("lockYn", t.getLockYn());
            tabs.add(m);
        }
        List<Map<String, Object>> widgets = new ArrayList<>();
        for (SecUserWidget w : widgetRepository.findByUserId(userId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("tabId", w.getTabId());
            m.put("instId", w.getInstId());
            m.put("widgetId", w.getWidgetId());
            m.put("posX", w.getPosX());
            m.put("posY", w.getPosY());
            m.put("sizeW", w.getSizeW());
            m.put("sizeH", w.getSizeH());
            m.put("lockYn", w.getLockYn());
            m.put("configJson", w.getConfigJson());
            widgets.add(m);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tabs", tabs);
        result.put("widgets", widgets);
        return result;
    }

    /** 탭 하나를 통째로 바꾼다. 위젯 목록은 grids.widgets.rows. */
    public Map<String, Object> saveTab(SecWidgetTabSaveRequest request, List<Map<String, Object>> widgets) {
        String userId = requireUser();
        String tabId = trim(request.getTabId());
        if (tabId == null || !TAB_ID.matcher(tabId).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "탭 ID 형식이 올바르지 않습니다.");
        }
        boolean home = HOME_TAB_ID.equals(tabId);
        String tabNm = home ? HOME_TAB_NM : trim(request.getTabNm());
        if (tabNm == null || tabNm.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "탭 이름을 입력해 주세요.");
        }
        if (tabNm.length() > TAB_NM_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "탭 이름은 " + TAB_NM_MAX + "자 이하로 정합니다.");
        }
        List<SecUserWidgetTab> existing = tabRepository.findByUserIdOrderByTabSeqAsc(userId);
        boolean isNew = existing.stream().noneMatch(t -> t.getTabId().equals(tabId));
        if (isNew && existing.size() >= MAX_TABS) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "탭은 " + MAX_TABS + "개까지 만들 수 있습니다.");
        }
        if (!home && existing.stream().anyMatch(t -> !t.getTabId().equals(tabId) && tabNm.equals(t.getTabNm()))) {
            throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 이름의 탭이 있습니다.");
        }
        List<Map<String, Object>> rows = widgets == null ? List.of() : widgets;
        if (rows.size() > MAX_WIDGETS) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "위젯은 탭당 " + MAX_WIDGETS + "개까지 놓을 수 있습니다.");
        }
        List<SecWidgetTabWriter.WidgetValues> values = new ArrayList<>();
        Set<String> instIds = new HashSet<>();
        for (Map<String, Object> row : rows) {
            SecWidgetTabWriter.WidgetValues v = toWidget(row);
            if (!instIds.add(v.instId())) {
                throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 위젯 인스턴스 ID 가 두 번 있습니다: " + v.instId());
            }
            values.add(v);
        }
        int seq = home ? 0 : Math.max(1, request.getTabSeq() == null ? existing.size() : request.getTabSeq());
        String lockYn = "Y".equals(request.getLockYn()) ? "Y" : "N";
        writer.replaceTab(userId, new SecWidgetTabWriter.TabValues(tabId, tabNm, seq, lockYn), values);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tabId", tabId);
        result.put("savedCount", values.size());
        return result;
    }

    public Map<String, Object> deleteTab(SecWidgetTabRequest request) {
        String userId = requireUser();
        String tabId = trim(request.getTabId());
        if (tabId == null || !TAB_ID.matcher(tabId).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "탭 ID 형식이 올바르지 않습니다.");
        }
        if (HOME_TAB_ID.equals(tabId)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "「홈」 탭은 지울 수 없습니다.");
        }
        writer.deleteTab(userId, tabId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tabId", tabId);
        result.put("deleted", true);
        return result;
    }

    /** grids.tabs.rows 의 tabId 순서대로 1부터 매긴다. home 은 늘 0 이라 건너뛴다. */
    public Map<String, Object> reorderTabs(List<Map<String, Object>> tabs) {
        String userId = requireUser();
        Set<String> owned = new HashSet<>();
        for (SecUserWidgetTab t : tabRepository.findByUserIdOrderByTabSeqAsc(userId)) owned.add(t.getTabId());
        Map<String, Integer> seq = new LinkedHashMap<>();
        int n = 1;
        for (Map<String, Object> row : tabs == null ? List.<Map<String, Object>>of() : tabs) {
            String tabId = row == null ? null : trim(String.valueOf(row.get("tabId")));
            if (tabId == null || HOME_TAB_ID.equals(tabId) || !owned.contains(tabId) || seq.containsKey(tabId)) continue;
            seq.put(tabId, n++);
        }
        writer.reorder(userId, seq);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("count", seq.size());
        return result;
    }

    public Map<String, Object> resetHome(SecWidgetSearchRequest request) {
        String userId = requireUser();
        writer.deleteTab(userId, HOME_TAB_ID);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("deleted", 1);
        return result;
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private String requireUser() {
        String userId = securityIdentity.currentUserId();
        if (userId == null || userId.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_FAILED, "인증 정보가 없습니다.");
        }
        return userId;
    }

    private static String trim(String s) {
        return s == null || "null".equals(s) ? null : s.trim();
    }

    private static int intOf(Map<String, Object> row, String key) {
        Object v = row.get(key);
        if (v instanceof Number num) return num.intValue();
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, key + " 는 정수여야 합니다.");
        }
    }

    private static SecWidgetTabWriter.WidgetValues toWidget(Map<String, Object> row) {
        String instId = trim(row.get("instId") == null ? null : String.valueOf(row.get("instId")));
        String widgetId = trim(row.get("widgetId") == null ? null : String.valueOf(row.get("widgetId")));
        if (instId == null || instId.isEmpty() || instId.length() > 40) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 인스턴스 ID 가 올바르지 않습니다.");
        }
        if (widgetId == null || widgetId.isEmpty() || widgetId.length() > 100) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 ID 가 올바르지 않습니다.");
        }
        int x = intOf(row, "posX");
        int y = intOf(row, "posY");
        int w = intOf(row, "sizeW");
        int h = intOf(row, "sizeH");
        if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > GRID_COLS) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 자리·크기가 격자(" + GRID_COLS + "칸) 밖입니다: " + instId);
        }
        String lockYn = "Y".equals(row.get("lockYn")) ? "Y" : "N";
        Object config = row.get("configJson");
        String configJson = config == null ? null : String.valueOf(config);
        if (configJson != null && configJson.length() > 4000) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 설정이 너무 깁니다: " + instId);
        }
        return new SecWidgetTabWriter.WidgetValues(instId, widgetId, x, y, w, h, lockYn, configJson);
    }
}
```

- [ ] **Step 6: 시험 통과 확인**

Run: `cd src/backend && ./gradlew :mcm-core:test --tests "com.dongkuk.dmes.mcm.widget.*"`
Expected: PASS (9개). `@InjectMocks` 가 생성자 주입으로 네 목을 넣는지 확인한다.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/widget src/backend/mcm-core/src/test/java/com/dongkuk/dmes/mcm/widget
/usr/bin/git commit -m "feat(mcm): 사용자 위젯 탭·배치 저장 서비스(secWidget)를 추가한다" -m "쉬운 설명: 사용자가 꾸민 위젯 화면(탭·위젯 자리·크기)을 서버에 저장해 다른 PC 에서도 같은 화면을 보게 했습니다.

- 엔티티 TB_MCM_SEC_USER_WIDGET_TAB·TB_MCM_SEC_USER_WIDGET
- SecWidgetService(search·saveTab·deleteTab·reorderTabs·resetHome), 인증 사용자 강제
- 탭 교체 원자성은 SecWidgetTabWriter, 한도·이름·격자 검사

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: secWidget BPMN·계약 시험·AUTH_ONLY·ERD 문서

**Files:**
- Create: `src/backend/mcm/api/src/main/resources/services/roleManagement/secWidget.bpmn`
- Create: `src/backend/mcm/api/src/test/java/com/dongkuk/dmes/mcm/widget/SecWidgetBpmnActionTest.java`
- Modify: `src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/endpoint/EndpointPermissionFilter.java`(AUTH_ONLY 목록), `src/frontend/m-mcm/proxy.ts`(authOnlyPrefixes), `src/frontend/shared/tests/unit/rbac-policy.unit.test.ts`, `docs/mcm/erd/csa-menu.dbml`, `docs/mcm/erd/csa-menu-tables.md`

**Interfaces:**
- Consumes: Task 6 의 빈 `secWidgetService` 와 메서드·DTO
- Produces: `POST /api/mcm/oasis/secWidget/{search|saveTab|deleteTab|reorderTabs|resetHome}` — 요청 `{ meta: { menuId: "HOME" }, params: {...}, grids: { widgets|tabs: { rows: [...] } } }`, 응답 `data.result`

- [ ] **Step 1: 실패하는 BPMN 계약 시험 작성**

`src/backend/mcm/api/src/test/java/com/dongkuk/dmes/mcm/widget/SecWidgetBpmnActionTest.java` — `src/backend/mls/api/src/test/java/com/dongkuk/dmes/mls/lsh/NoticeBpmnActionTest.java` 의 helpers(`processId`·`tasksByAction`·`properties`·`parse`·`method`)를 그대로 옮기고, 아래 시험 본문을 쓴다(파라미터 2개 허용이 다르다):
```java
package com.dongkuk.dmes.mcm.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mcm.widget.service.SecWidgetService;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * {@code services/roleManagement/secWidget.bpmn} 의 OASIS 계약 — 스프링 없이 XML 만 파싱한다(mls NoticeBpmnActionTest 와 같은 방식).
 * saveTab 은 dto(params) + grids.widgets.rows 두 파라미터(mdm headerMng.save 와 같은 모양), reorderTabs 는 grids.tabs.rows 하나.
 */
class SecWidgetBpmnActionTest {

    private static final String BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String CAMUNDA = "http://camunda.org/schema/1.0/bpmn";

    @Test
    void secWidget_는_다섯_분기이고_서비스_메서드와_대응한다() throws Exception {
        Document doc = parse("services/roleManagement/secWidget.bpmn");

        assertEquals("secWidget", processId(doc));
        Map<String, Element> byAction = tasksByAction(doc);
        assertEquals(List.of("deleteTab", "reorderTabs", "resetHome", "saveTab", "search"), List.copyOf(byAction.keySet()));

        NodeList tasks = doc.getElementsByTagNameNS(BPMN, "serviceTask");
        assertEquals(5, tasks.getLength());
        for (Map.Entry<String, Element> e : byAction.entrySet()) {
            Element task = e.getValue();
            Map<String, String> props = properties(task);
            assertEquals("secWidgetService", task.getAttributeNS(CAMUNDA, "class"), e.getKey());
            assertEquals("result", props.get("output"), e.getKey() + " output (§6-C-2)");
            assertFalse(props.containsKey("grid"), e.getKey() + " grid 속성 금지 (§6-C-1)");
            assertEquals(e.getKey(), props.get("method"), "method 이름 = action");
        }
        assertEquals(0, doc.getElementsByTagNameNS(BPMN, "conditionExpression").getLength());

        assertDto(byAction, "search", "com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest");
        assertDto(byAction, "resetHome", "com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest");
        assertDto(byAction, "deleteTab", "com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabRequest");
        assertDto(byAction, "saveTab", "com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabSaveRequest");
        assertFalse(properties(byAction.get("reorderTabs")).containsKey("dto"), "reorderTabs 는 grids.tabs 만");

        Method save = method(SecWidgetService.class, "saveTab");
        assertEquals(2, save.getParameterCount());
        assertEquals("widgets", save.getParameters()[1].getName(), "grids.widgets.rows ↔ 파라미터 이름 (§6-E-3)");
        assertEquals("tabs", method(SecWidgetService.class, "reorderTabs").getParameters()[0].getName());

        assertEquals("secWidgetService", SecWidgetService.class.getAnnotation(Service.class).value());
        assertFalse(SecWidgetService.class.isAnnotationPresent(Transactional.class), "@Transactional 금지 (§6-B-1)");
        for (Method m : SecWidgetService.class.getDeclaredMethods()) {
            assertFalse(m.isAnnotationPresent(Transactional.class), m.getName());
        }
    }

    private static void assertDto(Map<String, Element> byAction, String action, String dto) throws Exception {
        assertEquals(dto, properties(byAction.get(action)).get("dto"), action);
        assertEquals(dto, method(SecWidgetService.class, action).getParameterTypes()[0].getName(), action + " 첫 파라미터 = dto");
    }

    // ── helpers: mls NoticeBpmnActionTest 에서 그대로 옮긴다 ──

    private static Method method(Class<?> type, String name) {
        List<Method> found = Arrays.stream(type.getMethods()).filter(m -> m.getName().equals(name)).toList();
        assertEquals(1, found.size(), name + " 는 public 메서드 하나");
        return found.get(0);
    }

    private static String processId(Document doc) {
        Element process = (Element) doc.getElementsByTagNameNS(BPMN, "process").item(0);
        assertEquals("true", process.getAttribute("isExecutable"));
        return process.getAttribute("id");
    }

    private static Map<String, Element> tasksByAction(Document doc) {
        Map<String, Element> tasks = new HashMap<>();
        NodeList list = doc.getElementsByTagNameNS(BPMN, "serviceTask");
        for (int i = 0; i < list.getLength(); i++) {
            Element t = (Element) list.item(i);
            tasks.put(t.getAttribute("id"), t);
        }
        Map<String, Element> out = new TreeMap<>();
        NodeList flows = doc.getElementsByTagNameNS(BPMN, "sequenceFlow");
        for (int i = 0; i < flows.getLength(); i++) {
            Element flow = (Element) flows.item(i);
            if ("actionGateway".equals(flow.getAttribute("sourceRef"))) {
                Element target = tasks.get(flow.getAttribute("targetRef"));
                assertNotNull(target, flow.getAttribute("name") + " 분기의 대상이 serviceTask 가 아니다");
                out.put(flow.getAttribute("name"), target);
            }
        }
        assertTrue(!out.isEmpty(), "actionGateway 분기가 없다");
        return out;
    }

    private static Map<String, String> properties(Element task) {
        Map<String, String> props = new HashMap<>();
        NodeList list = task.getElementsByTagNameNS(CAMUNDA, "property");
        for (int i = 0; i < list.getLength(); i++) {
            Element p = (Element) list.item(i);
            props.put(p.getAttribute("name"), p.getAttribute("value"));
        }
        return props;
    }

    private static Document parse(String path) throws Exception {
        try (InputStream in = SecWidgetBpmnActionTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, path + " 가 클래스패스에 없다");
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            return factory.newDocumentBuilder().parse(in);
        }
    }
}
```

Run: `cd src/backend && ./gradlew :mcm:api:test --tests "com.dongkuk.dmes.mcm.widget.SecWidgetBpmnActionTest"`
Expected: FAIL — `services/roleManagement/secWidget.bpmn 가 클래스패스에 없다`. 태스크 경로가 다르면 `./gradlew projects | grep -i mcm` 으로 이름을 확인한다(mcm 은 includeBuild 라 `:mcm:api:test` 가 기본).

- [ ] **Step 2: BPMN 작성**

bpmn-skill(`bpmn-tool`)이 설치되어 있으면 그 스킬로 만들고, 없으면 아래 XML 을 그대로 쓴다. 구조는 `secFavorite.bpmn` 과 같다(분기 이름 = sequenceFlow `name`, `actionGateway` 의 `input=action`).
```xml
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="secWidgetDefinitions"
                  targetNamespace="http://dongkuk.com/dmes/mcm">
  <!-- 사용자 위젯 탭·배치 저장(포털 홈) — 스펙 2026-10-02-widget-foundation §4.2. 본인 데이터라 AUTH_ONLY. -->
  <bpmn:process id="secWidget" name="사용자 위젯 서비스" isExecutable="true">
    <bpmn:startEvent id="start"><bpmn:outgoing>flow_to_gw</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="flow_to_gw" sourceRef="start" targetRef="actionGateway" />

    <bpmn:exclusiveGateway id="actionGateway">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="input" value="action" />
        </camunda:properties>
      </bpmn:extensionElements>
      <bpmn:incoming>flow_to_gw</bpmn:incoming>
      <bpmn:outgoing>flow_search</bpmn:outgoing>
      <bpmn:outgoing>flow_saveTab</bpmn:outgoing>
      <bpmn:outgoing>flow_deleteTab</bpmn:outgoing>
      <bpmn:outgoing>flow_reorderTabs</bpmn:outgoing>
      <bpmn:outgoing>flow_resetHome</bpmn:outgoing>
    </bpmn:exclusiveGateway>

    <bpmn:sequenceFlow id="flow_search" name="search" sourceRef="actionGateway" targetRef="searchTask" />
    <bpmn:serviceTask id="searchTask" name="위젯 탭·배치 조회" camunda:class="secWidgetService">
      <bpmn:extensionElements><camunda:properties>
        <camunda:property name="method" value="search" />
        <camunda:property name="output" value="result" />
        <camunda:property name="dto" value="com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest" />
      </camunda:properties></bpmn:extensionElements>
      <bpmn:incoming>flow_search</bpmn:incoming>
      <bpmn:outgoing>flow_search_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="flow_search_end" sourceRef="searchTask" targetRef="endSearch" />
    <bpmn:endEvent id="endSearch"><bpmn:incoming>flow_search_end</bpmn:incoming></bpmn:endEvent>

    <bpmn:sequenceFlow id="flow_saveTab" name="saveTab" sourceRef="actionGateway" targetRef="saveTabTask" />
    <bpmn:serviceTask id="saveTabTask" name="탭 저장(통째로 교체)" camunda:class="secWidgetService">
      <bpmn:extensionElements><camunda:properties>
        <camunda:property name="method" value="saveTab" />
        <camunda:property name="output" value="result" />
        <camunda:property name="dto" value="com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabSaveRequest" />
      </camunda:properties></bpmn:extensionElements>
      <bpmn:incoming>flow_saveTab</bpmn:incoming>
      <bpmn:outgoing>flow_saveTab_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="flow_saveTab_end" sourceRef="saveTabTask" targetRef="endSaveTab" />
    <bpmn:endEvent id="endSaveTab"><bpmn:incoming>flow_saveTab_end</bpmn:incoming></bpmn:endEvent>

    <bpmn:sequenceFlow id="flow_deleteTab" name="deleteTab" sourceRef="actionGateway" targetRef="deleteTabTask" />
    <bpmn:serviceTask id="deleteTabTask" name="탭 지우기" camunda:class="secWidgetService">
      <bpmn:extensionElements><camunda:properties>
        <camunda:property name="method" value="deleteTab" />
        <camunda:property name="output" value="result" />
        <camunda:property name="dto" value="com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabRequest" />
      </camunda:properties></bpmn:extensionElements>
      <bpmn:incoming>flow_deleteTab</bpmn:incoming>
      <bpmn:outgoing>flow_deleteTab_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="flow_deleteTab_end" sourceRef="deleteTabTask" targetRef="endDeleteTab" />
    <bpmn:endEvent id="endDeleteTab"><bpmn:incoming>flow_deleteTab_end</bpmn:incoming></bpmn:endEvent>

    <bpmn:sequenceFlow id="flow_reorderTabs" name="reorderTabs" sourceRef="actionGateway" targetRef="reorderTabsTask" />
    <bpmn:serviceTask id="reorderTabsTask" name="탭 순서 바꾸기" camunda:class="secWidgetService">
      <bpmn:extensionElements><camunda:properties>
        <camunda:property name="method" value="reorderTabs" />
        <camunda:property name="output" value="result" />
      </camunda:properties></bpmn:extensionElements>
      <bpmn:incoming>flow_reorderTabs</bpmn:incoming>
      <bpmn:outgoing>flow_reorderTabs_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="flow_reorderTabs_end" sourceRef="reorderTabsTask" targetRef="endReorderTabs" />
    <bpmn:endEvent id="endReorderTabs"><bpmn:incoming>flow_reorderTabs_end</bpmn:incoming></bpmn:endEvent>

    <bpmn:sequenceFlow id="flow_resetHome" name="resetHome" sourceRef="actionGateway" targetRef="resetHomeTask" />
    <bpmn:serviceTask id="resetHomeTask" name="홈 기본 배치로 되돌리기" camunda:class="secWidgetService">
      <bpmn:extensionElements><camunda:properties>
        <camunda:property name="method" value="resetHome" />
        <camunda:property name="output" value="result" />
        <camunda:property name="dto" value="com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest" />
      </camunda:properties></bpmn:extensionElements>
      <bpmn:incoming>flow_resetHome</bpmn:incoming>
      <bpmn:outgoing>flow_resetHome_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="flow_resetHome_end" sourceRef="resetHomeTask" targetRef="endResetHome" />
    <bpmn:endEvent id="endResetHome"><bpmn:incoming>flow_resetHome_end</bpmn:incoming></bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>
```

- [ ] **Step 3: BPMN 시험·정적 검사 통과 확인**

Run:
```bash
cd src/backend && ./gradlew :mcm:api:test --tests "com.dongkuk.dmes.mcm.widget.SecWidgetBpmnActionTest"
cd ../.. && python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root . 2>&1 | tail -5
```
Expected: PASS, 정적 검사에 secWidget 위반 0건.

- [ ] **Step 4: AUTH_ONLY 세 곳 갱신 — 시험 먼저**

`src/frontend/shared/tests/unit/rbac-policy.unit.test.ts`:
1. `CFG.authOnlyPrefixes` 의 `"/api/mls/oasis/noticeBoard/search",` 줄 아래에:
```ts
    "/api/mcm/oasis/secWidget/", // m-mcm proxy.ts 와 같은 값 — 사용자 위젯 탭·배치(본인 데이터, 2026-10-02)
```
2. noticeBoard 시험 아래에:
```ts
  it("AUTH_ONLY(mcm secWidget) — 다섯 action 모두 권한키 없는 사용자도 pass, 미로그인은 unauthorized", async () => {
    for (const action of ["search", "saveTab", "deleteTab", "reorderTabs", "resetHome"]) {
      expect(await evaluateApiPolicy(`/api/mcm/oasis/secWidget/${action}`, viewer, CFG, loadThrow)).toBe("pass");
    }
    expect(await evaluateApiPolicy("/api/mcm/oasis/secWidget/search", null, CFG, loadThrow)).toBe("unauthorized");
    expect(await evaluateApiPolicy("/api/mcm/oasis/secWidgetAdmin/search", viewer, CFG, loadEmpty)).toBe("forbidden-perm");
  });
```

Run: `cd src/frontend/shared && pnpm vitest run tests/unit/rbac-policy.unit.test.ts`
Expected: PASS(시험 안 CFG 를 바꿨으므로 바로 통과한다 — 운영 목록과 같은 값인지는 아래 2·3 에서 맞춘다). `secWidgetAdmin` 단언이 실패하면 prefix 가 `"/api/mcm/oasis/secWidget/"`(끝 슬래시 포함)인지 확인한다.

`src/frontend/m-mcm/proxy.ts` 의 `authOnlyPrefixes` 에서 `"/api/mcm/oasis/secStartPgm/toggle",` 줄 아래에:
```ts
    "/api/mcm/oasis/secWidget/", // 포털 홈 위젯 탭·배치(본인 데이터, 5 action 전부) — BE EndpointPermissionFilter 와 동기화
```

`EndpointPermissionFilter.java` 의 `AUTH_ONLY_OBJ_ACTION_PREFIXES` 에서 `"secstartpgm/toggle",` 줄 아래에:
```java
            "secwidget/",               // 포털 홈 위젯 탭·배치(search/saveTab/deleteTab/reorderTabs/resetHome) — 본인 데이터 (2026-10-02)
```
`"secwidget/"` 는 `secwidgetadmin/...` 같은 다른 서비스와 겹치지 않는다(objId 다음에 `/` 가 온다).

- [ ] **Step 5: ERD 문서 등재**

`docs/mcm/erd/csa-menu.dbml` 의 `Table TB_MCM_SEC_USER_FAVORITE_FOLD { ... }` 블록 다음에:
```dbml
Table TB_MCM_SEC_USER_WIDGET_TAB {
  USER_ID varchar(30) [note: '→ TB_MCM_SEC_USER']
  TAB_ID  varchar(30) [note: 'home 또는 tab-{n}']
  TAB_NM  varchar(60) [not null, note: '탭 이름(home 은 「홈」 고정 표시)']
  TAB_SEQ integer     [not null, note: '탭 순서(home=0)']
  LOCK_YN char(1)     [not null, note: '탭 잠금 Y/N']

  indexes {
    (USER_ID, TAB_ID) [pk]
  }

  Note: '포털 홈 사용자 위젯 탭(2026-10-02, 스펙 widget-foundation §4.1). 사용자당 최대 10개. 감사 컬럼 9개(McmAuditEntity).'
}

Table TB_MCM_SEC_USER_WIDGET {
  USER_ID     varchar(30)   [note: '→ TB_MCM_SEC_USER']
  TAB_ID      varchar(30)   [note: '→ TB_MCM_SEC_USER_WIDGET_TAB']
  INST_ID     varchar(40)   [note: '위젯 인스턴스 ID(탭 안 고유)']
  WIDGET_ID   varchar(100)  [not null, note: '위젯 ID({모듈}.{이름}) — 프런트 등록부 키']
  POS_X       integer       [not null, note: '넓은 화면 24칸 격자 x']
  POS_Y       integer       [not null, note: '격자 y(한 칸 20px)']
  SIZE_W      integer       [not null, note: '폭(칸)']
  SIZE_H      integer       [not null, note: '높이(칸)']
  LOCK_YN     char(1)       [not null, note: '위젯 잠금 Y/N']
  CONFIG_JSON varchar(4000) [note: '인스턴스 설정(C 단계에서 사용, A 는 NULL)']

  indexes {
    (USER_ID, TAB_ID, INST_ID) [pk]
  }

  Note: '탭에 놓인 위젯. 탭당 최대 30개. 감사 컬럼 9개(McmAuditEntity).'
}
```
같은 파일의 `Ref:` 목록 끝(`TB_MCM_SEC_USER_FAVORITE_FOLD.USER_ID > ...` 다음)에:
```dbml
Ref: TB_MCM_SEC_USER_WIDGET_TAB.USER_ID > TB_MCM_SEC_USER.USER_ID
Ref: TB_MCM_SEC_USER_WIDGET.(USER_ID, TAB_ID) > TB_MCM_SEC_USER_WIDGET_TAB.(USER_ID, TAB_ID)
```
테이블 그룹(`TB_MCM_SEC_USER_FAVORITE_FOLD` 가 들어 있는 `TableGroup` 목록)에 `TB_MCM_SEC_USER_WIDGET_TAB`·`TB_MCM_SEC_USER_WIDGET` 두 줄을 넣는다.

`docs/mcm/erd/csa-menu-tables.md` 의 `| \`TB_MCM_SEC_USER_FAVORITE\` | 개인 즐겨찾기 | 0행 | 포털 사이드바 |` 줄 아래에:
```markdown
| `TB_MCM_SEC_USER_WIDGET_TAB` | 개인 위젯 탭 | 신규(2026-10-02) | 포털 홈 위젯 |
| `TB_MCM_SEC_USER_WIDGET` | 개인 위젯 배치 | 신규(2026-10-02) | 포털 홈 위젯 |
```

- [ ] **Step 6: mcm-core 컴파일·시험 확인**

Run: `cd src/backend && ./gradlew :mcm-core:test --tests "com.dongkuk.dmes.mcm.widget.*" :mcm:api:test --tests "com.dongkuk.dmes.mcm.widget.*"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add src/backend/mcm/api/src/main/resources/services/roleManagement/secWidget.bpmn src/backend/mcm/api/src/test/java/com/dongkuk/dmes/mcm/widget src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/endpoint/EndpointPermissionFilter.java src/frontend/m-mcm/proxy.ts src/frontend/shared/tests/unit/rbac-policy.unit.test.ts docs/mcm/erd/csa-menu.dbml docs/mcm/erd/csa-menu-tables.md
/usr/bin/git commit -m "feat(mcm): secWidget OASIS 서비스를 열고 본인 데이터 목록에 등록한다" -m "쉬운 설명: 위젯 화면 저장 기능을 화면에서 부를 수 있게 서비스 주소를 열었습니다. 각자 자기 화면만 저장하므로 별도 권한 없이 로그인한 사람은 누구나 씁니다.

- secWidget.bpmn(search·saveTab·deleteTab·reorderTabs·resetHome)과 BPMN 계약 시험
- AUTH_ONLY: BE EndpointPermissionFilter·FE proxy.ts·rbac 시험
- mcm ERD 문서에 두 테이블 등재

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: m-mcm 위젯 등록부 코드 생성

**Files:**
- Create: `src/frontend/m-mcm/scripts/widget-registry-lib.mjs`, `src/frontend/m-mcm/scripts/generate-widget-registry.mjs`, `src/frontend/m-mcm/scripts/widget-registry-lib.test.mjs`
- Create(생성물): `src/frontend/m-mcm/lib/generated/widget-registry.ts`
- Modify: `src/frontend/m-mcm/package.json`(scripts)

**Interfaces:**
- Consumes: shared 타입 `WidgetRegistry`(생성물이 import)
- Produces: `WIDGET_REGISTRY: WidgetRegistry` (`@/lib/generated/widget-registry`), 키 `"{group}.{name}"`

- [ ] **Step 1: 실패하는 스크립트 시험 작성**

`src/frontend/m-mcm/scripts/widget-registry-lib.test.mjs`:
```js
// node --test scripts/widget-registry-lib.test.mjs — 위젯 등록부 생성 규칙.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { collectWidgets, keyToId, renderRegistry } from "./widget-registry-lib.mjs";

async function makeWidget(root, group, name, { id = `${group}.${name}`, body = true } = {}) {
  const dir = path.join(root, group, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "widget.meta.ts"), `export const meta = { id: "${id}", title: "t", defaultSize: { w: 6, h: 6 } };\n`);
  if (body) await writeFile(path.join(dir, "widget.tsx"), "export default function W() { return null; }\n");
}

test("keyToId 는 group/name 을 group.name 으로 바꾼다", () => {
  assert.equal(keyToId("home/notice"), "home.notice");
});

test("collectWidgets 는 meta·본체 짝이 있는 2단 폴더만 이름순으로 모은다", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "wreg-"));
  await makeWidget(root, "home", "notice");
  await makeWidget(root, "home", "alarms");
  await makeWidget(root, "_shared", "skip");
  const result = await collectWidgets(root);
  assert.deepEqual(result.map((w) => w.key), ["home/alarms", "home/notice"]);
});

test("본체(widget.tsx)가 없으면 오류", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "wreg-"));
  await makeWidget(root, "home", "notice", { body: false });
  await assert.rejects(() => collectWidgets(root), /widget\.tsx/);
});

test("meta 의 id 가 폴더와 다르면 오류", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "wreg-"));
  await makeWidget(root, "home", "notice", { id: "home.news" });
  await assert.rejects(() => collectWidgets(root), /home\.notice/);
});

test("renderRegistry 는 meta 정적 import 와 본체 지연 import 리터럴을 쓴다", () => {
  const out = renderRegistry([
    { id: "home.alarms", metaImport: "@/widgets/home/alarms/widget.meta", bodyImport: "@/widgets/home/alarms/widget" },
    { id: "home.notice", metaImport: "@/widgets/home/notice/widget.meta", bodyImport: "@/widgets/home/notice/widget" },
  ]);
  assert.match(out, /^\/\/ AUTO-GENERATED by scripts\/generate-widget-registry\.mjs/);
  assert.match(out, /import \{ meta as m0 \} from "@\/widgets\/home\/alarms\/widget\.meta";/);
  assert.match(out, /"home\.notice": \{ meta: m1, load: \(\) => import\("@\/widgets\/home\/notice\/widget"\) \},/);
  assert.match(out, /export const WIDGET_REGISTRY: WidgetRegistry = \{/);
});

test("renderRegistry 는 같은 id 가 두 번이면 오류", () => {
  assert.throws(
    () =>
      renderRegistry([
        { id: "home.a", metaImport: "x", bodyImport: "y" },
        { id: "home.a", metaImport: "x2", bodyImport: "y2" },
      ]),
    /중복/
  );
});
```

Run: `cd src/frontend/m-mcm && node --test scripts/widget-registry-lib.test.mjs`
Expected: FAIL — `Cannot find module './widget-registry-lib.mjs'`

- [ ] **Step 2: 라이브러리·생성 스크립트 구현**

`src/frontend/m-mcm/scripts/widget-registry-lib.mjs`:
```js
/**
 * 위젯 등록부 생성 규칙(스펙 2026-10-02-widget-foundation §2.3) — generate-widget-registry.mjs 가 쓰고 node:test 로 시험한다.
 * 위젯 폴더: widgets/{group}/{name}/widget.meta.ts + widget.tsx. 이름이 _ 로 시작하는 폴더는 건너뛴다(공용 도우미 자리).
 * meta 는 TS 라 값을 실행하지 않고, id 문자열이 폴더와 같은지만 정규식으로 확인한다. 크기 범위는 shared validateWidgetMeta 가 실행 시 검사한다.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function keyToId(key) {
  return key.replace("/", ".");
}

/** rootDir 아래 위젯을 모은다 → [{ key: "group/name", id: "group.name" }] (key 이름순). */
export async function collectWidgets(rootDir) {
  if (!(await exists(rootDir))) return [];
  const out = [];
  for (const g of await fs.readdir(rootDir, { withFileTypes: true })) {
    if (!g.isDirectory() || g.name.startsWith("_")) continue;
    for (const n of await fs.readdir(path.join(rootDir, g.name), { withFileTypes: true })) {
      if (!n.isDirectory() || n.name.startsWith("_")) continue;
      const dir = path.join(rootDir, g.name, n.name);
      const metaPath = path.join(dir, "widget.meta.ts");
      if (!(await exists(metaPath))) continue;
      const key = `${g.name}/${n.name}`;
      const id = keyToId(key);
      if (!(await exists(path.join(dir, "widget.tsx")))) {
        throw new Error(`[widget-registry] ${key}: widget.meta.ts 짝인 widget.tsx 가 없습니다.`);
      }
      const src = await fs.readFile(metaPath, "utf8");
      const m = src.match(/\bid\s*:\s*["']([^"']+)["']/);
      if (!m || m[1] !== id) {
        throw new Error(`[widget-registry] ${key}: widget.meta.ts 의 id 는 "${id}" 여야 합니다(지금: ${m ? `"${m[1]}"` : "없음"}).`);
      }
      out.push({ key, id });
    }
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

/** entries: [{ id, metaImport, bodyImport }] → widget-registry.ts 내용. import 경로는 정적 리터럴(turbopack). */
export function renderRegistry(entries) {
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.id)) throw new Error(`[widget-registry] 위젯 id 중복: ${e.id}`);
    seen.add(e.id);
  }
  const imports = entries.map((e, i) => `import { meta as m${i} } from ${JSON.stringify(e.metaImport)};`).join("\n");
  const rows = entries
    .map((e, i) => `  ${JSON.stringify(e.id)}: { meta: m${i}, load: () => import(${JSON.stringify(e.bodyImport)}) },`)
    .join("\n");
  return `// AUTO-GENERATED by scripts/generate-widget-registry.mjs — do not edit manually.
// 갱신 방법: \`node scripts/generate-widget-registry.mjs\` (predev/prebuild 훅 자동 실행).
// widgets/{group}/{name}/widget.meta.ts(정적) + widget.tsx(지연 로딩). 스펙 2026-10-02-widget-foundation §2.3.
import type { WidgetRegistry } from "@dk-oasis/shared/widget";
${imports ? `\n${imports}\n` : ""}
export const WIDGET_REGISTRY: WidgetRegistry = {
${rows}
};
`;
}
```

`src/frontend/m-mcm/scripts/generate-widget-registry.mjs`:
```js
/**
 * 위젯 등록부 생성 — m-mcm widgets/ 를 훑어 lib/generated/widget-registry.ts 를 쓴다.
 * 모듈 패키지 위젯(m-mls/widgets 등)은 그 패키지가 package.json exports "./widgets/*"·tsup entry 를 열었을 때
 * MODULE_WIDGET_PACKAGES 에 추가한다(A 단계에서는 m-mcm 위젯만 있다).
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { collectWidgets, renderRegistry } from "./widget-registry-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(ROOT, "lib", "generated", "widget-registry.ts");

/** [{ pkg, dir }] — 예: { pkg: "@dk-oasis/m-mls", dir: path.resolve(ROOT, "..", "m-mls", "widgets") } */
const MODULE_WIDGET_PACKAGES = [];

async function main() {
  const entries = [];
  for (const w of await collectWidgets(path.join(ROOT, "widgets"))) {
    entries.push({ id: w.id, metaImport: `@/widgets/${w.key}/widget.meta`, bodyImport: `@/widgets/${w.key}/widget` });
  }
  for (const mod of MODULE_WIDGET_PACKAGES) {
    for (const w of await collectWidgets(mod.dir)) {
      entries.push({ id: w.id, metaImport: `${mod.pkg}/widgets/${w.key}/widget.meta`, bodyImport: `${mod.pkg}/widgets/${w.key}/widget` });
    }
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  const content = renderRegistry(entries);
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  const prev = await fs.readFile(OUT_FILE, "utf8").catch(() => "");
  if (prev !== content) await fs.writeFile(OUT_FILE, content, "utf8");
  console.log(`[generate-widget-registry] ${prev === content ? "unchanged" : "wrote"} ${OUT_FILE} (${entries.length} widgets)`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
```

- [ ] **Step 3: 시험 통과 확인**

Run: `cd src/frontend/m-mcm && node --test scripts/widget-registry-lib.test.mjs`
Expected: PASS (6개)

- [ ] **Step 4: package.json 훅·생성물**

`src/frontend/m-mcm/package.json` `scripts`:
```json
    "generate:page-registry": "node scripts/generate-page-registry.mjs",
    "generate:widget-registry": "node scripts/generate-widget-registry.mjs",
    "predev": "node scripts/generate-page-registry.mjs && node scripts/generate-widget-registry.mjs",
    "prebuild": "node scripts/generate-page-registry.mjs && node scripts/generate-widget-registry.mjs",
    "test:scripts": "node --test scripts/*.test.mjs",
```
(기존 `predev`·`prebuild` 두 줄을 위 값으로 바꾸고, 나머지 두 줄을 추가한다.)

Run: `cd src/frontend/m-mcm && pnpm generate:widget-registry && cat lib/generated/widget-registry.ts`
Expected: `WIDGET_REGISTRY` 가 빈 객체인 파일이 생긴다(위젯은 Task 9 에서 추가).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add src/frontend/m-mcm/scripts/widget-registry-lib.mjs src/frontend/m-mcm/scripts/generate-widget-registry.mjs src/frontend/m-mcm/scripts/widget-registry-lib.test.mjs src/frontend/m-mcm/lib/generated/widget-registry.ts src/frontend/m-mcm/package.json
/usr/bin/git commit -m "feat(mcm): 위젯 등록부 코드 생성 스크립트를 추가한다" -m "쉬운 설명: 위젯 폴더를 만들기만 하면 홈 화면이 알아서 그 위젯을 찾도록, 위젯 목록 파일을 자동으로 만드는 도구를 추가했습니다.

- widgets/{group}/{name}/widget.meta.ts·widget.tsx 수집, id·짝 검사
- predev·prebuild 훅, node --test 시험

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 홈 위젯 11개 이전과 공지 저장소

**Files:**
- Create: `src/frontend/m-mcm/page-components/home/notice-store.ts`, `src/frontend/m-mcm/page-components/home/home-layout.ts`
- Create: `src/frontend/m-mcm/widgets/home/{notice,notifications,kpi,monthly,equipment,process,defect,workOrders,alarms,shipments,quickLinks}/widget.meta.ts`·`widget.tsx` (22개 파일)
- Create: `src/frontend/m-mcm/widgets/home/_shared/grid-badge.tsx`(작업지시·출하 그리드가 함께 쓰는 배지 도우미)
- Modify: `src/frontend/m-mcm/page-components/home/chart-sizing.ts`(인자 타입), `NoticeCard.tsx`·`NotificationCard.tsx`(DashboardCard 껍데기를 벗겨 본문만 그리게)
- Modify(생성물): `src/frontend/m-mcm/lib/generated/widget-registry.ts`

**Interfaces:**
- Consumes: Task 2 `useWidgetBodySize`, `WidgetHeaderActions`, `WidgetTitleExtra`, `useWidgetStatus`, `openPortalPage`; Task 8 생성 스크립트
- Produces:
  - `notice-store.ts`: `useNoticeStore(): { notices: NoticeLoadState; selectedId: string | null }`, `ensureNoticesLoaded(): void`, `reloadNotices(): Promise<void>`, `selectNotice(id: string | null): void`, `selectUrgentOrFirst(): void`
  - `home-layout.ts`: `HOME_DEFAULT_LAYOUT: WidgetItem[]`
  - 위젯 ID 11개 `home.notice` … `home.quickLinks`

- [ ] **Step 1: 공지 저장소**

`src/frontend/m-mcm/page-components/home/notice-store.ts`:
```ts
/**
 * 홈 공지 목록·선택 공유 저장소 — 공지 위젯·긴급 공지 띠·알림 위젯이 같은 상태를 본다(스펙 §5).
 * 위젯이 독립 프로그램이 되어 화면 수준 useState 를 나눌 수 없으므로 구독형 저장소(useSyncExternalStore)로 둔다.
 * 요청 순번으로 늦게 온 이전 응답을 버린다.
 */
import { useSyncExternalStore } from "react";

import { searchNoticeBoard } from "./api";
import { firstUrgent, keepSelection, noticeKey, type NoticeLoadState } from "./types";

interface NoticeStoreState {
  notices: NoticeLoadState;
  selectedId: string | null;
}

let state: NoticeStoreState = { notices: { status: "loading" }, selectedId: null };
let requested = false;
let seq = 0;
const listeners = new Set<() => void>();

function set(next: Partial<NoticeStoreState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function reloadNotices(): Promise<void> {
  requested = true;
  const mine = ++seq;
  if (state.notices.status !== "ok") set({ notices: { status: "loading" } });
  return searchNoticeBoard().then(
    (rows) => {
      if (mine !== seq) return;
      set({ notices: { status: "ok", rows }, selectedId: keepSelection(rows, state.selectedId) });
    },
    () => {
      if (mine !== seq) return;
      set({ notices: { status: "error" } });
    }
  );
}

/** 한 번도 부르지 않았으면 부른다(홈 화면·공지 위젯이 둘 다 불러도 요청은 하나). */
export function ensureNoticesLoaded(): void {
  if (!requested) void reloadNotices();
}

export function selectNotice(id: string | null): void {
  set({ selectedId: id });
}

/** 공지 알림·긴급 띠 「내용 보기」 — 긴급 공지(없으면 첫 공지)를 고른다. */
export function selectUrgentOrFirst(): void {
  if (state.notices.status !== "ok" || state.notices.rows.length === 0) return;
  const target = firstUrgent(state.notices.rows) ?? state.notices.rows[0];
  set({ selectedId: noticeKey(target) });
}

export function useNoticeStore(): NoticeStoreState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );
}
```

- [ ] **Step 2: 기본 배치**

`src/frontend/m-mcm/page-components/home/home-layout.ts`(스펙 §5 표와 같은 값):
```ts
/** 「홈」 탭 기본 배치 — 사용자가 홈을 한 번도 저장하지 않았을 때 보인다(스펙 §3.6·§5). B 단계에서 DB 값으로 바뀐다. */
import type { WidgetItem } from "@dk-oasis/shared/widget";

const at = (widgetId: string, x: number, y: number, w: number, h: number): WidgetItem => ({
  instId: `default-${widgetId.split(".")[1]}`,
  widgetId,
  x,
  y,
  w,
  h,
  locked: false,
  config: null,
});

export const HOME_DEFAULT_LAYOUT: WidgetItem[] = [
  at("home.kpi", 0, 0, 24, 6),
  at("home.notice", 0, 6, 10, 16),
  at("home.notifications", 10, 6, 7, 16),
  at("home.quickLinks", 17, 6, 7, 16),
  at("home.monthly", 0, 22, 9, 13),
  at("home.equipment", 9, 22, 6, 13),
  at("home.process", 15, 22, 9, 13),
  at("home.workOrders", 0, 35, 14, 14),
  at("home.alarms", 14, 35, 10, 7),
  at("home.defect", 14, 42, 10, 7),
  at("home.shipments", 0, 49, 24, 10),
];
```

- [ ] **Step 3: 위젯 메타 11개**

모두 `export const meta: WidgetMeta = { ... };` 한 개만 export 하고 `import type { WidgetMeta } from "@dk-oasis/shared/widget";` 를 쓴다. 제목·부제는 지금 홈과 같게 둔다(사용자 눈에 보이는 문구를 바꾸지 않는다).

| 파일 | 값 |
|---|---|
| `widgets/home/notice/widget.meta.ts` | `{ id: "home.notice", title: "공지사항", description: "게시 중인 공지 목록과 본문", defaultSize: { w: 10, h: 16 }, minSize: { w: 6, h: 10 }, linkPageId: "mls:lsh/noticeMgmt", multiple: false }` |
| `widgets/home/notifications/widget.meta.ts` | `{ id: "home.notifications", title: "내 알림", description: "결재·공지·설비 알림(구현 예정 — 샘플)", defaultSize: { w: 7, h: 16 }, minSize: { w: 5, h: 8 }, multiple: false, bodyPadding: false }` |
| `widgets/home/kpi/widget.meta.ts` | `{ id: "home.kpi", title: "주요 지표", subtitle: "전일 기준", description: "생산·출하·품질 등 핵심 지표 6개(샘플)", defaultSize: { w: 24, h: 6 }, minSize: { w: 8, h: 5 } }` |
| `widgets/home/monthly/widget.meta.ts` | `{ id: "home.monthly", title: "월별 생산 실적", subtitle: "제품군별 · 단위 천 t", description: "제품군별 월 생산 실적과 계획(샘플)", defaultSize: { w: 9, h: 13 }, minSize: { w: 6, h: 9 } }` |
| `widgets/home/equipment/widget.meta.ts` | `{ id: "home.equipment", title: "설비 가동 상태", subtitle: "전체 14개 라인 · 현재", description: "라인 가동·정지·점검 비율(샘플)", defaultSize: { w: 6, h: 13 }, minSize: { w: 5, h: 10 } }` |
| `widgets/home/process/widget.meta.ts` | `{ id: "home.process", title: "공정별 금일 생산", subtitle: "교대조별 · 단위 t", description: "공정·교대조별 생산량(샘플)", defaultSize: { w: 9, h: 13 }, minSize: { w: 6, h: 8 } }` |
| `widgets/home/defect/widget.meta.ts` | `{ id: "home.defect", title: "불량 유형 (이번 주)", subtitle: "발생 건수", description: "불량 유형별 발생 건수(샘플)", defaultSize: { w: 10, h: 7 }, minSize: { w: 6, h: 6 } }` |
| `widgets/home/workOrders/widget.meta.ts` | `{ id: "home.workOrders", title: "금일 작업지시 현황", description: "오늘 작업지시와 진행률(샘플)", defaultSize: { w: 14, h: 14 }, minSize: { w: 8, h: 8 }, bodyPadding: false }` |
| `widgets/home/alarms/widget.meta.ts` | `{ id: "home.alarms", title: "설비 알람", subtitle: "최근 24시간", description: "최근 24시간 설비 알람(샘플)", defaultSize: { w: 10, h: 7 }, minSize: { w: 6, h: 6 } }` |
| `widgets/home/shipments/widget.meta.ts` | `{ id: "home.shipments", title: "출하 예정", subtitle: "D+0 ~ D+2", description: "D+0 ~ D+2 출하 예정(샘플)", defaultSize: { w: 24, h: 10 }, minSize: { w: 8, h: 7 }, bodyPadding: false }` |
| `widgets/home/quickLinks/widget.meta.ts` | `{ id: "home.quickLinks", title: "바로가기", subtitle: "즐겨찾기 메뉴", description: "즐겨찾기한 메뉴", defaultSize: { w: 7, h: 16 }, minSize: { w: 5, h: 6 }, multiple: false }` |

예(공지):
```ts
import type { WidgetMeta } from "@dk-oasis/shared/widget";

export const meta: WidgetMeta = {
  id: "home.notice",
  title: "공지사항",
  description: "게시 중인 공지 목록과 본문",
  defaultSize: { w: 10, h: 16 },
  minSize: { w: 6, h: 10 },
  linkPageId: "mls:lsh/noticeMgmt",
  multiple: false,
};
```

- [ ] **Step 4: 위젯 본체 옮기기 규칙**

`home-widgets.tsx` 의 위젯 함수(`KpiWidget`·`MonthlyWidget`·`EquipmentWidget`·`ProcessWidget`·`DefectWidget`·`WorkOrdersWidget`·`AlarmsWidget`·`ShipmentsWidget`)를 각 `widgets/home/{name}/widget.tsx` 의 `export default function` 으로 옮긴다. 옮길 때 바꾸는 것은 다음 다섯 가지뿐이다.
1. `<DashboardCard ...>` 껍데기를 지운다 — `title`·`subtitle` 은 메타가 그린다.
2. `actions={...}` 내용은 `<WidgetHeaderActions>...</WidgetHeaderActions>` 로, `titleExtra`·동적 부제는 `<WidgetTitleExtra>...</WidgetTitleExtra>` 로 본문 맨 앞에 둔다.
3. `children={(size) => ...}` 는 `const size = useWidgetBodySize();` 로 바꾼다.
4. `toolbar={...}` 는 본문 맨 위 `<div className="mcm-home-toolbar">` 로 옮긴다(아래 CSS 추가).
5. 모듈 수준 상수(컬럼 정의·차트 입력)는 그 위젯 파일로 함께 옮긴다. 두 위젯이 같이 쓰는 `GRID_BADGE_COLORS`·`toneBadge` 는 `widgets/home/_shared/grid-badge.tsx` 로 옮긴다.

`home-styles.ts` 의 `HOME_CSS` 끝에 추가:
```css
.mcm-home-toolbar { padding: 6px 10px; border-bottom: 1px solid var(--color-border-light); }
.mcm-home-sub { font-size: var(--font-size-xs); color: var(--color-text-muted); white-space: nowrap; }
```

`chart-sizing.ts` 의 인자 타입을 틀 크기와 맞춘다:
```ts
/** 월별 생산 실적 차트 높이(px) — 본문 높이가 정해졌으면 범례 줄을 뺀 값, 아니면 기본 230. */
export function monthlyChartHeight({ height }: { height: number | null }): number {
  if (height == null || height <= 0) return MONTHLY_DEFAULT_HEIGHT;
  return Math.max(140, Math.round(height - LEGEND_HEIGHT));
}
```
(맨 위 `import type { DashboardBodySize }` 줄은 지운다.)

예 1 — `widgets/home/kpi/widget.tsx`:
```tsx
"use client";

import { KpiTile, KpiTileGroup } from "@dk-oasis/shared/dashboard";

import { SAMPLE_KPIS, type SampleKpi } from "@/page-components/home/sample-data";

const fmtNum = (v: number) => (v >= 1000 ? v.toLocaleString("ko-KR") : String(v));

function kpiProps(k: SampleKpi) {
  const ratio = k.lowerBetter ? (k.plan / k.value) * 100 : (k.value / k.plan) * 100;
  return {
    label: k.label,
    value: fmtNum(k.value),
    unit: k.unit,
    trend: k.trend,
    target: k.lowerBetter ? `목표 ≤ ${fmtNum(k.plan)}${k.unit}` : `계획 ${fmtNum(k.plan)}${k.unit}`,
    delta: `전일 ${k.delta}`,
    deltaTone: k.good ? ("good" as const) : ("bad" as const),
    progress: ratio,
    warn: k.warn,
  };
}

/** 주요 지표 — KPI 6개(샘플). 폭이 줄면 안에서 줄바꿈한다. */
export default function KpiWidget() {
  return (
    <div data-testid="home-kpi-card">
      <KpiTileGroup ariaLabel="주요 지표">
        {SAMPLE_KPIS.map((k) => (
          <KpiTile key={k.key} {...kpiProps(k)} testId={`home-kpi-${k.key}`} />
        ))}
      </KpiTileGroup>
    </div>
  );
}
```

예 2 — `widgets/home/alarms/widget.tsx`:
```tsx
"use client";

import { Badge } from "@dk-oasis/shared/form";
import { WidgetHeaderActions } from "@dk-oasis/shared/widget";

import { ALARM_SEVERITY, SAMPLE_ALARMS } from "@/page-components/home/sample-data";

const ALARM_CRITICAL = SAMPLE_ALARMS.filter((a) => a.severity === "critical").length;
const ALARM_WARNING = SAMPLE_ALARMS.filter((a) => a.severity === "warning").length;

export default function AlarmsWidget() {
  return (
    <>
      <WidgetHeaderActions>
        <Badge tone="danger" label={`위험 ${ALARM_CRITICAL}`} />
        <Badge tone="warning" label={`주의 ${ALARM_WARNING}`} />
      </WidgetHeaderActions>
      <ul className="mcm-home-alarm" aria-label="설비 알람 목록">
        {SAMPLE_ALARMS.map((a) => (
          <li key={a.id} className="mcm-home-alarm__item">
            <Badge tone={ALARM_SEVERITY[a.severity].tone} label={ALARM_SEVERITY[a.severity].label} />
            <span>
              <b className="mcm-home-alarm__title">{a.title}</b>
              <span className="mcm-home-alarm__detail">{a.detail}</span>
            </span>
            <time className="mcm-home-alarm__time">{a.time}</time>
          </li>
        ))}
      </ul>
    </>
  );
}
```

예 3 — `widgets/home/monthly/widget.tsx`:
```tsx
"use client";

import { StackedColumnChart } from "@dk-oasis/shared/charts";
import { useWidgetBodySize } from "@dk-oasis/shared/widget";

import { monthlyChartHeight } from "@/page-components/home/chart-sizing";
import {
  MONTHLY_COATED,
  MONTHLY_COLD,
  MONTHLY_COLOR,
  MONTHLY_LAST_ACTUAL,
  MONTHLY_PLAN,
  MONTHS,
} from "@/page-components/home/sample-data";

const MONTHLY_SERIES = [
  { key: "cold", label: "냉연", color: "var(--color-chart-1)", values: MONTHLY_COLD },
  { key: "coated", label: "도금", color: "var(--color-chart-2)", values: MONTHLY_COATED },
  { key: "color", label: "컬러", color: "var(--color-chart-3)", values: MONTHLY_COLOR },
];
const MONTHLY_LINE = { label: "계획(합계)", color: "var(--color-chart-4)", values: MONTHLY_PLAN };

export default function MonthlyWidget() {
  const size = useWidgetBodySize();
  return (
    <StackedColumnChart
      height={monthlyChartHeight(size)}
      categories={MONTHS}
      series={MONTHLY_SERIES}
      line={MONTHLY_LINE}
      dimFrom={MONTHLY_LAST_ACTUAL + 1}
      dimLabel="10~12월은 전망(옅은 색)"
      totalAt={MONTHLY_LAST_ACTUAL}
      unit="천 t"
      ariaLabel="제품군별 월 생산 실적과 계획"
    />
  );
}
```

`workOrders` 는 부제 `WORK_ORDER_SUMMARY` 가 상수라 메타에 넣지 않고 `<WidgetTitleExtra><span className="mcm-home-sub">{WORK_ORDER_SUMMARY}</span></WidgetTitleExtra>` 로 둔다(메타 파일이 sample-data 를 import 하지 않게).

- [ ] **Step 5: 공지·알림·바로가기 위젯**

1. `NoticeCard.tsx` — `DashboardCard` 껍데기를 지우고 본문만 돌려주게 바꾼다. 지금 `subtitle`(113행 변수)은 `<WidgetTitleExtra><span className="mcm-home-sub">{subtitle}</span></WidgetTitleExtra>`, `actions`(「공지 관리 ›」)는 `<WidgetHeaderActions>` 로 옮긴다. `bodyLayout="fill"` 이 하던 일(본문을 세로로 채움)은 뿌리 `div` 에 `style={{ height: "100%", display: "flex", flexDirection: "column" }}` 로 대신한다. props(`state`·`selectedId`·`onSelect`·`onRetry`·`canManage`)는 그대로 둔다.
2. `NotificationCard.tsx` — 같은 방식으로 껍데기를 벗긴다: 부제(`안읽음 n건`)·`titleExtra`(구현 예정 배지)는 `WidgetTitleExtra`, `actions` 는 `WidgetHeaderActions`, `toolbar` 는 본문 맨 위 `.mcm-home-toolbar`. props(`onOpenNotice`) 그대로.
3. `widgets/home/notice/widget.tsx`:
```tsx
"use client";

import { useEffect } from "react";
import type { WidgetProps } from "@dk-oasis/shared/widget";

import { usePortalMenuPageIds } from "@/lib/portal-menu-store";
import { NoticeCard } from "@/page-components/home/NoticeCard";
import { ensureNoticesLoaded, reloadNotices, selectNotice, useNoticeStore } from "@/page-components/home/notice-store";
import { NOTICE_MGMT_PAGE_ID } from "@/page-components/home/types";

export default function NoticeWidget({ refreshKey }: WidgetProps) {
  const { notices, selectedId } = useNoticeStore();
  const menuPageIds = usePortalMenuPageIds();
  const canManage = menuPageIds?.has(NOTICE_MGMT_PAGE_ID) ?? false;

  useEffect(() => {
    if (refreshKey > 0) void reloadNotices();
    else ensureNoticesLoaded();
  }, [refreshKey]);

  return (
    <NoticeCard
      state={notices}
      selectedId={selectedId}
      onSelect={selectNotice}
      onRetry={() => void reloadNotices()}
      canManage={canManage}
    />
  );
}
```
4. `widgets/home/notifications/widget.tsx`:
```tsx
"use client";

import { NotificationCard } from "@/page-components/home/NotificationCard";
import { selectUrgentOrFirst } from "@/page-components/home/notice-store";

/** 공지 알림을 누르면 긴급 공지(없으면 첫 공지)를 고르고, 공지 위젯이 이 탭에 있으면 그 자리로 스크롤한다. */
export default function NotificationsWidget() {
  return (
    <NotificationCard
      onOpenNotice={() => {
        selectUrgentOrFirst();
        document.querySelector('[data-widget-id="home.notice"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }}
    />
  );
}
```
5. `widgets/home/quickLinks/widget.tsx` — `page.tsx` 137~182행의 `quickLinks` 계산과 `quickLinksBody` 를 옮긴다. `usePortalFavorites({ endpoint: "/api/mcm/oasis/secFavorite/search" })` 를 위젯 안에서 부르고, `refreshKey` 가 바뀌면 `refetch()`, `window` 의 `portal-tab-activated` 이벤트가 오면 `refetch()` 한다(위젯은 자기 포털 tabId 를 모르므로 탭 구분 없이 다시 읽는다). `openPortalTab` 대신 `openPortalPage`(shared/widget)를 쓴다.

- [ ] **Step 6: 등록부 생성·타입 검사**

Run:
```bash
cd src/frontend/m-mcm && pnpm generate:widget-registry && grep -c '": { meta:' lib/generated/widget-registry.ts && pnpm exec tsc --noEmit -p tsconfig.json
```
Expected: `11`, 타입 오류 0. (`page.tsx` 는 아직 옛 보드를 쓰므로 `home-widgets.tsx`·`LayoutControls.tsx` 는 이 작업에서 지우지 않는다 — Task 10 에서 정리한다.)

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add src/frontend/m-mcm/widgets src/frontend/m-mcm/page-components/home src/frontend/m-mcm/lib/generated/widget-registry.ts
/usr/bin/git commit -m "feat(mcm): 홈 위젯 11개를 위젯 폴더로 옮기고 공지 상태를 공유 저장소로 뺀다" -m "쉬운 설명: 홈의 공지·알림·지표·차트·표 위젯을 각각 독립된 조각 프로그램으로 나눴습니다. 화면에 보이는 내용은 그대로입니다.

- widgets/home/* meta·본체 11쌍, HOME_DEFAULT_LAYOUT
- notice-store: 공지 위젯·긴급 띠·알림이 같은 공지 상태 공유
- NoticeCard·NotificationCard 는 본문만 그림(제목 줄은 위젯 틀)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 홈 화면을 WidgetWorkspace 로 연결

**Files:**
- Create: `src/frontend/m-mcm/page-components/home/widget-store.ts`
- Modify: `src/frontend/m-mcm/page-components/home/page.tsx`, `src/frontend/m-mcm/page-components/home/api.ts`(`unwrap` export)
- Delete: `src/frontend/m-mcm/page-components/home/home-widgets.tsx`, `src/frontend/m-mcm/page-components/home/LayoutControls.tsx` (내용은 Task 9 에서 위젯 폴더로 옮겨졌다 — 화면·기능 삭제가 아니라 파일 이동의 마무리)

**Interfaces:**
- Consumes: Task 5 `WidgetWorkspace`, Task 7 `secWidget` API, Task 8 `WIDGET_REGISTRY`, Task 9 `HOME_DEFAULT_LAYOUT`·`notice-store`
- Produces: `secWidgetStore: WidgetStore`, 화면 `mcm:home`

- [ ] **Step 1: 저장소 구현**

`api.ts` 의 `function unwrap(` 앞에 `export` 를 붙인다.

`src/frontend/m-mcm/page-components/home/widget-store.ts`:
```ts
/**
 * secWidget(mcm OASIS)을 부르는 WidgetStore — 사용자 위젯 탭·배치 저장(스펙 §4.2).
 * 요청 본문은 CactusRequest 표준(params 는 평평한 값, 목록은 grids.{파라미터명}.rows — BackEnd 표준 §6-E).
 * 응답은 data.result(Map) — api.ts unwrap 이 풀어 준다. 실패(meta.success=false)는 Error(message) 로 던진다.
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type { WidgetItem, WidgetStore, WidgetTab } from "@dk-oasis/shared/widget";

import { unwrap } from "./api";

const url = (action: string) => `/api/mcm/oasis/secWidget/${action}`;

async function call(action: string, params: Record<string, unknown> = {}, grids?: Record<string, unknown[]>) {
  const body: Record<string, unknown> = { meta: { menuId: "HOME" }, params };
  if (grids) body.grids = Object.fromEntries(Object.entries(grids).map(([k, rows]) => [k, { rows }]));
  const res = await apiRequest<unknown>(url(action), { method: "POST", body: JSON.stringify(body) });
  return unwrap(res);
}

interface TabRow { tabId: string; tabNm: string; tabSeq: number; lockYn: string }
interface WidgetRow { tabId: string; instId: string; widgetId: string; posX: number; posY: number; sizeW: number; sizeH: number; lockYn: string; configJson: string | null }

function parseConfig(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const secWidgetStore: WidgetStore = {
  async load(): Promise<WidgetTab[]> {
    const out = await call("search");
    const tabs = (Array.isArray(out.tabs) ? out.tabs : []) as TabRow[];
    const widgets = (Array.isArray(out.widgets) ? out.widgets : []) as WidgetRow[];
    return tabs.map((t) => ({
      tabId: t.tabId,
      name: t.tabNm,
      seq: Number(t.tabSeq) || 0,
      locked: t.lockYn === "Y",
      items: widgets
        .filter((w) => w.tabId === t.tabId)
        .map<WidgetItem>((w) => ({
          instId: w.instId,
          widgetId: w.widgetId,
          x: Number(w.posX),
          y: Number(w.posY),
          w: Number(w.sizeW),
          h: Number(w.sizeH),
          locked: w.lockYn === "Y",
          config: parseConfig(w.configJson),
        })),
    }));
  },
  async saveTab(tab) {
    await call(
      "saveTab",
      { tabId: tab.tabId, tabNm: tab.name, tabSeq: tab.seq, lockYn: tab.locked ? "Y" : "N" },
      {
        widgets: tab.items.map((i) => ({
          instId: i.instId,
          widgetId: i.widgetId,
          posX: i.x,
          posY: i.y,
          sizeW: i.w,
          sizeH: i.h,
          lockYn: i.locked ? "Y" : "N",
          configJson: i.config == null ? null : JSON.stringify(i.config),
        })),
      }
    );
  },
  async deleteTab(tabId) {
    await call("deleteTab", { tabId });
  },
  async reorderTabs(tabIds) {
    await call("reorderTabs", {}, { tabs: tabIds.map((tabId) => ({ tabId })) });
  },
  async resetHome() {
    await call("resetHome");
  },
};
```

- [ ] **Step 2: 홈 화면 교체**

`page.tsx` 를 아래로 바꾼다(인사말·긴급 띠는 그대로, 위젯 영역만 `WidgetWorkspace`):
```tsx
"use client";

/**
 * 포털 홈(mcm:home) — 인사말·긴급 공지 띠 + 사용자 위젯 탭(WidgetWorkspace).
 * 위젯은 widgets/home/* (등록부 코드 생성), 배치는 사용자별 서버 저장(secWidget). 스펙 2026-10-02-widget-foundation.
 * KPI·차트·표·알림은 sample-data.ts 의 샘플이다(인사말 줄에 표시).
 */
import { useEffect, useState } from "react";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { PageLayout } from "@dk-oasis/shared/layout";
import { Badge, Button, SegmentedControl } from "@dk-oasis/shared/form";
import { WidgetWorkspace } from "@dk-oasis/shared/widget";

import { WIDGET_REGISTRY } from "@/lib/generated/widget-registry";

import { fetchCurrentUser, type CurrentUser } from "./api";
import { HOME_CSS, HOME_STYLE_HREF } from "./home-styles";
import { HOME_DEFAULT_LAYOUT } from "./home-layout";
import { ensureNoticesLoaded, selectNotice, useNoticeStore } from "./notice-store";
import { PRODUCT_GROUPS, currentShiftLabel } from "./sample-data";
import { firstUrgent, formatToday, noticeKey } from "./types";
import { secWidgetStore } from "./widget-store";

export default function PortalHomePage(_props: PageProps) {
  const [now] = useState(() => new Date());
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [productGroup, setProductGroup] = useState(PRODUCT_GROUPS[0]);
  const { notices } = useNoticeStore();

  useEffect(() => {
    ensureNoticesLoaded();
    let cancelled = false;
    void fetchCurrentUser().then((u) => {
      if (!cancelled) setUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const urgent = notices.status === "ok" ? firstUrgent(notices.rows) : undefined;
  const greeting = user?.name || user?.id;

  const openUrgent = () => {
    if (!urgent) return;
    selectNotice(noticeKey(urgent));
    document.querySelector('[data-widget-id="home.notice"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  return (
    <PageLayout title="홈">
      <style href={HOME_STYLE_HREF} precedence="default">
        {HOME_CSS}
      </style>
      <div className="mcm-home" data-testid="portal-home">
        <div className="mcm-home-welcome">
          <h2 className="mcm-home-welcome__hello" data-testid="home-greeting">
            {greeting ? `안녕하세요, ${greeting} 님` : "안녕하세요"}
          </h2>
          <span className="mcm-home-welcome__date">
            {formatToday(now)} · {currentShiftLabel(now.getHours())}
          </span>
          <Badge tone="warning" label="지표·차트·표는 샘플 데이터" />
          <div className="mcm-home-welcome__right">
            <SegmentedControl
              value={productGroup}
              onChange={setProductGroup}
              options={PRODUCT_GROUPS}
              ariaLabel="제품군"
              testId="home-product-group"
            />
          </div>
        </div>

        {urgent && (
          <div className="mcm-home-urgent" data-testid="home-urgent">
            <span className="mcm-home-urgent__label">긴급 공지</span>
            <span className="mcm-home-urgent__title" title={urgent.TITLE}>
              {urgent.TITLE}
            </span>
            <Button size="mini" onClick={openUrgent}>
              내용 보기
            </Button>
          </div>
        )}

        <WidgetWorkspace
          registry={WIDGET_REGISTRY}
          homeDefault={HOME_DEFAULT_LAYOUT}
          store={secWidgetStore}
          userId={user?.id ?? null}
          testId="home-widgets"
        />
      </div>
    </PageLayout>
  );
}
```

`home-styles.ts` 의 `HOME_CSS` 끝에 홈 뿌리 배치를 추가한다(기존 `DashboardGrid fill` 이 하던 세로 배치와 간격):
```css
.mcm-home { display: flex; flex-direction: column; gap: var(--spacing-sm); padding-bottom: var(--spacing-xl); min-width: 0; }
```

- [ ] **Step 3: 옛 파일 정리**

`home-widgets.tsx`·`LayoutControls.tsx` 를 아무 곳에서도 import 하지 않는지 확인한 뒤 지운다.
```bash
cd src/frontend/m-mcm && grep -rn "home-widgets\|LayoutControls" --include='*.ts' --include='*.tsx' . | grep -v node_modules | grep -v '\.next/'
```
Expected: 결과 없음 → `/usr/bin/git rm page-components/home/home-widgets.tsx page-components/home/LayoutControls.tsx`

- [ ] **Step 4: 타입 검사·빌드**

Run:
```bash
cd src/frontend/m-mcm && pnpm exec tsc --noEmit -p tsconfig.json && pnpm build 2>&1 | tail -15
```
Expected: 타입 오류 0, 빌드 성공(`prebuild` 가 두 등록부를 다시 만든다). `pnpm dev` 가 떠 있는 작업 트리면 Local-Rules §2-2 를 따른다.

- [ ] **Step 5: mantine-aggrid-ui audit**

Run: `python3 .claude/skills/mantine-aggrid-ui/scripts/ui_docs.py --help | grep -i audit` 로 audit 명령 두 개를 확인하고, 이번에 바꾼 파일(`src/frontend/shared/src/widget/**`, `src/frontend/m-mcm/page-components/home/**`, `src/frontend/m-mcm/widgets/**`)에 대해 둘 다 돌린다.
Expected: 0건(RULE.md mantine-aggrid-ui 행 — 커밋 전 audit 두 개 0건).

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add src/frontend/m-mcm/page-components/home src/frontend/m-mcm/lib/generated
/usr/bin/git commit -m "feat(mcm): 포털 홈을 사용자 위젯 탭(WidgetWorkspace)과 서버 저장으로 바꾼다" -m "쉬운 설명: 포털 첫 화면에서 위젯 화면을 탭으로 여러 개 만들고, 위젯을 자유롭게 놓고 크기를 바꾼 결과가 서버에 저장되어 어느 PC 에서나 같은 화면이 보입니다.

- secWidgetStore(search·saveTab·deleteTab·reorderTabs·resetHome)
- 인사말·긴급 띠는 그대로, 위젯 영역을 WidgetWorkspace 로 교체
- 옛 행 단위 보드용 home-widgets·LayoutControls 정리

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 실행 확인(E2E)과 마무리

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-widget-foundation-design.md`(구현 결과와 다른 점이 생기면 결정 표에 추가)

**Interfaces:**
- Consumes: Task 1~10 전부

- [ ] **Step 1: 전체 단위 시험**

Run:
```bash
cd src/frontend/shared && pnpm test:unit
cd ../m-mcm && pnpm test:scripts
cd ../../backend && ./gradlew :mcm-core:test --tests "com.dongkuk.dmes.mcm.widget.*" :mcm:api:test --tests "com.dongkuk.dmes.mcm.widget.*"
```
Expected: 모두 PASS

- [ ] **Step 2: 로컬 기동**

메모리 `local-run-mac-setup` 의 사전조건(JDK 21·포털 5100)을 확인하고 mcm 백엔드와 포털을 띄운다(도커 금지). 로컬은 `ddl-auto: update` 라 두 테이블이 자동으로 생긴다.

- [ ] **Step 3: ego-browser 로 시나리오 확인**

ego-browser 스킬을 읽고 TaskSpace 하나로 `http://localhost:5100` 포털 홈을 연다(창 폭 1440). 아래를 순서대로 확인하고 단계마다 스크린샷을 남긴다.
1. 처음: 「홈」 탭 하나, 기본 배치 11개 위젯, 공지 위젯에 실제 공지가 보인다.
2. [배치 편집] → 「바로가기」 제목 줄을 끌어 왼쪽으로 옮기면 다른 위젯이 비켜난다.
3. 「내 알림」 오른쪽 아래 모서리를 끌면 「w × h」 이름표가 보이고 크기가 바뀐다. 왼쪽 변(w)으로도 줄여 본다.
4. 「주요 지표」를 🔒 로 잠그고 다른 위젯을 그 위로 끌면 주요 지표는 자리를 지킨다.
5. 서랍에서 「설비 알람」을 눌러 추가, 「불량 유형」을 끌어 원하는 자리에 놓는다.
6. [완료] → 새로 고침 → 배치가 그대로다(서버 저장 확인).
7. (+) 로 새 탭 「설비 감시」를 만들고 위젯 2개를 넣어 [완료] → 탭 메뉴로 이름 바꾸기·잠금·왼쪽으로·지우기를 해 보고 새로 고침해 결과가 유지되는지 본다.
8. 「홈」 탭 메뉴 「기본 배치로 되돌리기」 → 기본 배치로 돌아온다.
9. 창 폭을 1000 으로 줄이면 [배치 편집]이 비활성이고 안내 제목이 보이며, 위젯이 12칸으로 다시 흘러 보인다.
10. 긴급 공지가 있으면 「내용 보기」로 공지 위젯이 그 공지를 고른다.

확인이 끝나면 `await task.finish({ keep: [] })` 로 작업 공간을 닫는다(메모리 close-browser-after-work).

- [ ] **Step 4: 스펙 갱신과 커밋**

구현하며 스펙과 달라진 점(예: 크기 이름표 위치, 기본 크기 조정)이 있으면 스펙 §8 결정 표에 W-D13 부터 추가한다. 없으면 이 단계는 건너뛴다.

```bash
/usr/bin/git add docs/superpowers/specs/2026-10-02-widget-foundation-design.md
/usr/bin/git commit -m "docs(widget): 위젯 기반 구현 결과를 스펙에 반영한다" -m "쉬운 설명: 실제로 만들어 보며 정한 세부 사항을 설계서에 기록했습니다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: 브랜치 마무리**

superpowers:finishing-a-development-branch 스킬로 `worktree-widget-foundation` 을 dev 에 합칠 방법을 사용자에게 묻는다(push·머지는 사용자 요청 시에만).
