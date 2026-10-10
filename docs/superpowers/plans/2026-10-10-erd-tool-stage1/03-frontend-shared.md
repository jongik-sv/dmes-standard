# ERD 도구 단계 1 — Task 6: shared `react-flow` 부품 복사와 포털 SSE 제한

> 공통 제약(Global Constraints)·단계 1 에서 정한 점(S1~S17)·Review Focus·파일 구조는 [README](README.md) 에 있다. 이 문서의 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [02-backend-import.md](02-backend-import.md) · [README](README.md) · 다음: [04-frontend-viewer.md](04-frontend-viewer.md)

### Task 6: shared `react-flow` 부품 복사와 포털 SSE 제한

룰 세트 편집기 캔버스에서 업무와 무관한 부품을 새 서브패스 `@dk-oasis/shared/react-flow` 로 **복사**한다(S12, 스펙 2.2). `m-mdm/pages/dme/ruleSetEdit/` 아래 파일은 하나도 고치지 않는다. 화면마다 다른 값(testId·클래스 접두·문구·무시할 노드 형식)은 props 로 받고 기본값을 둔다(Part B §18-3(1)). 같은 Task 에서 포털 BFF 가 ERD SSE 를 2분에 끊지 않게 한다(S15).

README Review Focus 5개 가운데 이 Task 에 속하는 것은 없다.

**Files:**
- Create: `src/frontend/shared/src/components/react-flow/{react-flow.ts,route-path.ts,snap.ts,viewport-guard.ts}` (복사)
- Create: `src/frontend/shared/src/components/react-flow/{styles.ts,ToolButton.tsx,context-menu.ts,ContextMenu.tsx,shortcuts.ts,find.ts,FindWidget.tsx,ViewportGuard.tsx,SnapGuideStyle.tsx,index.ts}`
- Create: `src/frontend/shared/tests/unit/react-flow-{snap,route-segment,viewport-guard,shortcuts,context-menu,find-widget}.unit.test.ts`
- Create: `.claude/skills/mantine-aggrid-ui/references/components/react-flow.md`
- Modify: `src/frontend/shared/{package.json,tsup.config.ts,tests/setup.ts}`, `src/frontend/pnpm-lock.yaml`
- Modify: `docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md`(§1 표), `.claude/skills/mantine-aggrid-ui/{SKILL.md,scripts/ui_docs.mjs,references/components/llms.txt,references/components/llms-full.txt}`
- Modify: `src/frontend/m-mcm/lib/http/be-proxy.ts`, `src/frontend/m-mcm/tests/http/be-proxy.test.ts`

**Interfaces:**
- Consumes: 단계 0 SSE 경로 `GET /api/mdm/erd/stream/{modelId}`(BFF 가 받는 `backendPath`).
- Produces (`@dk-oasis/shared/react-flow`, Task 8·9 가 쓴다):
  - `@xyflow/react` 전부(`export *`, 스타일시트 포함). 이 서브패스 하나로 React Flow 와 공통 부품을 함께 가져온다.
  - 선 경로(원본과 같은 이름): `FlowPos`, `Side`, `SmoothStepInput`, `routePath`, `routeMidpoint`, `insertRoutePoint`, `smoothStepPoints`, `autoRoute`, `finishRoute`, `simplifyRoute`, `roundPoint`, `segmentAxis`, `segmentHandles`, `isClear`, `moveSegment`, `snapRoutePoint`, `snapSegmentDelta`, 상수 `ROUTE_RADIUS`·`AUTO_ROUTE_OFFSET`·`ROUTE_STUB`·`SEGMENT_MIN_PX`·`SEGMENT_CLEAR_PX`·`SEGMENT_SNAP_PX`·`ROUTE_GUIDE_OVERHANG`, 형 `SegmentAxis`·`SegmentHandle`·`RoutePointGuide`.
  - 스냅: `snapIndex`, `snapHitIn`, `snapMoveIn`, `snapMove`, `snapThreshold`, `boundsOf`, `SNAP_THRESHOLD_PX`, 형 `SnapBox`(원본 `Box` — xyflow 의 `Box` 와 이름이 겹쳐 바꿔 내보낸다)·`Guide`·`GuideAxis`·`SnapResult`·`SnapIndex`·`SnapHit`, 스타일 `SnapGuideStyle`.
  - 화면 길잡이: `ViewportGuard`(props `onFit, fitKeyLabel, ignoreNodeTypes?, lostText?, fitText?, testId?, flowExemptClassName?, classPrefix?`), `RECHECK_MS`, `LOST_DELAY_MS`, 계산 `boundsOfRects`·`panExtentOf`·`sameExtent`·`visibleRect`·`insideExtent`·`allOutside`·`KEEP_VISIBLE_PX`·`NO_EXTENT`, 형 `FlowRect`·`PanExtent`.
  - 메뉴: `ContextMenu`(props `items, at, onClose, testId?, classPrefix?`), 형 `MenuItem`·`MenuSwatch`(`color` 는 CSS 색 값, `icon` 은 `ReactNode`).
  - 단축키: `shortcutOf<Id>(e, mac, bindings)`, `dispatchShortcut<Id>(e, handlers, mac, bindings)`, `UNHANDLED`, `isMacPlatform`, `isTypingTarget`, `isShown`, `CANVAS_SHORTCUTS`, 형 `KeyLike`·`ShortcutBinding<Id>`·`ShortcutHandlers<Id>`·`ShortcutHelpRow<Id, Mode>`·`CanvasShortcutId`.
  - 찾기: `FindWidget`(props `find, inputRef, focusSeq, onClose, mac, testId?, label?, inputLabel?, placeholder?, noResultText?, classPrefix?`), `findCountText`, `FIND_NO_RESULT`, `compileFind`, `escapeRegExp`, `INVALID_FIND`, `DEFAULT_FIND_OPTIONS`, 형 `FindOptions`·`FindState`·`FindMatcher`.
  - 단추: `ToolButton`, `keepFocusOffButtons`, `DEFAULT_CLASS_PREFIX`(`"rfx"`).
- Produces (m-mcm): `backendTimeoutMs("GET", ".../erd/stream/{id}") === 86_400_000`.

클래스 접두 기본값은 `rfx` 다. 룰 세트 편집기의 `rsf-*` 를 그대로 쓰면 포털 한 문서 안에서 두 화면의 규칙이 서로 덮는다. `<style href>` 에 접두를 넣어 접두가 다르면 규칙도 따로 들어가게 한다(React 19 는 같은 href 를 한 번만 넣는다).

- [ ] **Step 1: shared 의존성 추가와 한 벌 확인**

`src/frontend/shared/package.json` 의 `dependencies` 맨 앞에 두 줄을 넣는다(정확한 버전 — m-mdm 이 지금 쓰는 설치본과 같다. 둘 다 MIT).

```diff
   "dependencies": {
+    "@dagrejs/dagre": "3.1.1",
+    "@xyflow/react": "12.12.0",
     "@tiptap/extension-hard-break": "^3.31.4",
```

m-mdm `package.json` 의 `@xyflow/react ^12.12.0`·`@dagrejs/dagre ^3.1.1` 은 그대로 둔다(S12). 설치와 확인은 `src/frontend` 에서 한다.

```bash
pnpm install --prefer-offline
/usr/bin/git diff --stat -- pnpm-lock.yaml
pnpm why -r @xyflow/react
readlink -f shared/node_modules/@xyflow/react
readlink -f m-mdm/node_modules/@xyflow/react
ls node_modules/.pnpm | grep -c '^@xyflow+react@'
ls node_modules/.pnpm | grep -c '^@dagrejs+dagre@'
```

Expected:
- `pnpm-lock.yaml` 은 `importers.shared.dependencies` 에 두 항목(10줄 안팎)만 는다. `packages:`·`snapshots:` 는 바뀌지 않는다.
- `pnpm why` 는 `@dk-oasis/shared` 와 `@dk-oasis/m-mdm` 아래에 모두 `@xyflow/react 12.12.0` 을 보인다.
- 두 `readlink -f` 결과가 같은 `.pnpm/@xyflow+react@12.12.0_…` 경로다. 같은 버전이라도 peer 변형이 다르면 두 벌이 되어 React Flow 저장소 문맥이 갈린다. 그래서 경로까지 견준다.
- 두 `grep -c` 는 모두 `1`.
- 하나라도 어긋나면(수가 1 이 아니거나 두 경로가 다르면) `pnpm why -r react` 로 react 설치본을 보고 `pnpm dedupe` 를 돈 뒤 위 확인을 다시 한다. 그래도 두 벌이면 멈추고 `## 계획 작성자 메모` 에 적어 조정자에게 묻는다(S12 는 한 벌을 전제한다. Task 8 캔버스는 React Flow 저장소 문맥이 하나여야 한다).

- [ ] **Step 2: 시험 환경 — `DOMMatrixReadOnly` 폴리필**

`src/frontend/shared/tests/setup.ts` 의 `if (!window.scrollTo) …` 줄 바로 뒤(첫 `if (typeof window …)` 블록 안)에 m-mdm `tests/setup.ts` 와 같은 폴리필을 넣는다. 나머지 줄은 그대로 둔다.

```diff
   if (!window.scrollTo) window.scrollTo = () => {};
+
+  // React Flow(@xyflow/react) — transform 배율(m22)을 DOMMatrixReadOnly 로 읽는다. happy-dom 에 없으면 최소 구현을 둔다(m-mdm tests/setup.ts 와 같다).
+  if (!("DOMMatrixReadOnly" in globalThis)) {
+    class DMR {
+      m22 = 1;
+      constructor(transform?: string) {
+        const m = /scale\(([-\d.]+)/.exec(transform ?? "") ?? /matrix\([^,]+,[^,]+,[^,]+,\s*([-\d.]+)/.exec(transform ?? "");
+        if (m) this.m22 = Number(m[1]);
+      }
+    }
+    (globalThis as unknown as { DOMMatrixReadOnly: typeof DMR }).DOMMatrixReadOnly = DMR;
+  }
 }
```

- [ ] **Step 3: 실패하는 시험 — 원본 시험 셋 옮기기**

원본 시험 가운데 업무 코드에 기대는 부분만 뺀다. `src/frontend` 에서 부른다.

```bash
O=m-mdm/tests/dme/ruleSetEdit
T=shared/tests/unit
# snap — 4행(SHORTCUT_HELP import)과 163~169행(describe("도움말"), 룰 세트 도움말 표)을 뺀다.
perl -ne 'next if $. == 4 || ($. >= 163 && $. <= 169); s#\.\./\.\./\.\./pages/dme/ruleSetEdit/canvas/#../../src/components/react-flow/#; print' $O/snap.test.ts > $T/react-flow-snap.unit.test.ts
# route-segment — 12행(flow-edit import)을 shared route-path 의 FlowPos 로 바꾸고, 216~223행(setRoute 거부 시험, 업무 모델)을 뺀다.
perl -ne 'next if $. >= 216 && $. <= 223; $_ = qq{import type { FlowPos } from "../../src/components/react-flow/route-path";\n} if $. == 12; s#\.\./\.\./\.\./pages/dme/ruleSetEdit/canvas/#../../src/components/react-flow/#; print' $O/route-segment.test.ts > $T/react-flow-route-segment.unit.test.ts
# viewport-guard — 그룹 틀 형식을 ignoreNodeTypes prop 으로 넘기고, 단추 기본 글을 "전체 보기" 로 본다. 12행(import 끝) 뒤에 act 환경 표시를 넣는다.
perl -ne 's#\.\./\.\./\.\./pages/dme/ruleSetEdit/canvas/#../../src/components/react-flow/#; s#rsfGroup#group#g; s#fitKeyLabel: "Shift\+1" \}#fitKeyLabel: "Shift+1", ignoreNodeTypes: ["group"] }#; s#흐름도로 돌아가기#전체 보기#; print; print qq{\nObject.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });\n} if $. == 12' $O/viewport-guard.test.ts > $T/react-flow-viewport-guard.unit.test.ts
grep -c "pages/dme\|rsfGroup\|SHORTCUT_HELP\|setRoute" $T/react-flow-*.unit.test.ts
```

Expected: 마지막 `grep -c` 가 세 파일 모두 `0`.

`shared/tests/unit/react-flow-shortcuts.unit.test.ts` — 원본 단언을 모두 지킨다. 룰 세트 키 표를 묶음 표로 다시 만들어 넘긴다.

```ts
/** @vitest-environment happy-dom */
// 캔버스 단축키 — 묶음 표(bindings)로 판정한다. 룰 세트 편집기 shortcuts.test.ts 의 단언을 그 키 표로 그대로 지킨다.
import { describe, expect, it, vi } from "vitest";

import {
  CANVAS_SHORTCUTS, UNHANDLED, dispatchShortcut, isMacPlatform, isShown, isTypingTarget, shortcutOf,
  type CanvasShortcutId, type KeyLike, type ShortcutBinding,
} from "../../src/components/react-flow/shortcuts";

type RuleSetId = CanvasShortcutId | "continue" | "stop" | "step" | "stepBack" | "breakpoint"
  | "alignLeft" | "alignRight" | "alignHCenter" | "distributeH" | "nudgeLeft" | "nudgeLeftBig";
/** 룰 세트 편집기 키 표(일부) — 공통 표 + 디버거 기능키 + Alt 정렬 + 화살표 옮기기. */
const RULE_SET: readonly ShortcutBinding<RuleSetId>[] = [
  ...CANVAS_SHORTCUTS,
  { id: "continue", key: "F5" }, { id: "stop", key: "F5", shift: true },
  { id: "step", key: "F10" }, { id: "stepBack", key: "F10", shift: true }, { id: "breakpoint", key: "F9" },
  { id: "alignLeft", code: "KeyA", alt: true }, { id: "alignRight", code: "KeyD", alt: true },
  { id: "distributeH", code: "KeyH", alt: true, shift: true }, { id: "alignHCenter", code: "KeyH", alt: true },
  { id: "nudgeLeft", key: "ArrowLeft" }, { id: "nudgeLeftBig", key: "ArrowLeft", shift: true },
];
const k = (key: string, mods: Partial<KeyLike> = {}, target: EventTarget | null = null): KeyLike => ({
  key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target, ...mods,
});
const of = (e: KeyLike, mac: boolean) => shortcutOf(e, mac, RULE_SET);

describe("shortcuts", () => {
  it("Win/Linux 는 Ctrl, Mac 은 Cmd 로 되돌리기·다시 하기", () => {
    expect(of(k("z", { ctrlKey: true }), false)).toBe("undo");
    expect(of(k("Z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo");
    expect(of(k("y", { ctrlKey: true }), false)).toBe("redo");
    expect(of(k("z", { metaKey: true }), true)).toBe("undo");
    expect(of(k("z", { ctrlKey: true }), true)).toBeNull(); // Mac 의 Ctrl+Z 는 되돌리기가 아니다
    expect(of(k("z", { metaKey: true }), false)).toBeNull();
  });

  it("복사·붙여넣기·복제·찾기·삭제·Esc", () => {
    expect(of(k("c", { ctrlKey: true }), false)).toBe("copy");
    expect(of(k("v", { ctrlKey: true }), false)).toBe("paste");
    expect(of(k("d", { ctrlKey: true }), false)).toBe("duplicate");
    expect(of(k("f", { metaKey: true }), true)).toBe("find");
    expect(of(k("Delete"), false)).toBe("delete");
    expect(of(k("Backspace"), true)).toBe("delete");
    expect(of(k("Escape"), false)).toBe("escape");
    expect(of(k("Delete", { ctrlKey: true }), false)).toBeNull();
  });

  it("화면 표에 넣은 기능키 — 표에 없으면 null", () => {
    expect(of(k("F5"), false)).toBe("continue");
    expect(of(k("F5", { shiftKey: true }), false)).toBe("stop");
    expect(of(k("F10"), false)).toBe("step");
    expect(of(k("F10", { shiftKey: true }), false)).toBe("stepBack");
    expect(of(k("F9"), true)).toBe("breakpoint");
    expect(of(k("F5", { ctrlKey: true }), false)).toBeNull(); // Ctrl+F5 강제 새로 고침은 건드리지 않는다
    expect(shortcutOf(k("F5"), false, CANVAS_SHORTCUTS)).toBeNull();
  });

  it("Alt 조합은 물리 키(code)로 보고, Ctrl·Meta 가 같이 눌리면(AltGr) 무시한다", () => {
    expect(of(k("å", { altKey: true, code: "KeyA" }), true)).toBe("alignLeft");
    expect(of(k("d", { altKey: true, code: "KeyD" }), false)).toBe("alignRight");
    expect(of(k("H", { altKey: true, shiftKey: true, code: "KeyH" }), false)).toBe("distributeH");
    expect(of(k("h", { altKey: true, code: "KeyH" }), false)).toBe("alignHCenter");
    expect(of(k("A", { altKey: true, shiftKey: true, code: "KeyA" }), false)).toBeNull();
    expect(of(k("a", { altKey: true }), false)).toBeNull(); // code 를 모르면 무시
  });

  it("화살표 옮기기 — Shift 는 큰 걸음", () => {
    expect(of(k("ArrowLeft"), false)).toBe("nudgeLeft");
    expect(of(k("ArrowLeft", { shiftKey: true }), false)).toBe("nudgeLeftBig");
  });

  it("Alt 가 눌렸거나 입력 칸이면 무시한다", () => {
    expect(of(k("z", { ctrlKey: true, altKey: true }), false)).toBeNull();
    const ta = document.createElement("textarea");
    const input = document.createElement("input");
    const ce = document.createElement("div");
    ce.contentEditable = "true";
    for (const t of [ta, input, ce]) expect(of(k("z", { ctrlKey: true }, t), false)).toBeNull();
    expect(isTypingTarget(ta)).toBe(true);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
  });

  it("손잡이가 있을 때만 막고 부른다 — UNHANDLED 를 돌려주면 막지 않는다", () => {
    const undo = vi.fn();
    const ev = { ...k("z", { ctrlKey: true }), preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(dispatchShortcut(ev, { undo }, false, RULE_SET)).toBe(true);
    expect(undo).toHaveBeenCalledOnce();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
    expect(ev.stopPropagation).toHaveBeenCalledOnce();
    const f5 = { ...k("F5"), preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(dispatchShortcut(f5, { undo }, false, RULE_SET)).toBe(false); // continue 손잡이 없음 → 브라우저 새로 고침 그대로
    expect(f5.preventDefault).not.toHaveBeenCalled();
    const esc = { ...k("Escape"), preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(dispatchShortcut(esc, { escape: () => UNHANDLED }, false, CANVAS_SHORTCUTS)).toBe(false);
    expect(esc.preventDefault).not.toHaveBeenCalled();
  });

  it("Shift+1 화면 맞춤 · Shift+2 고른 것으로 이동 — 자판과 무관하게 물리 키로 본다", () => {
    expect(of(k("!", { shiftKey: true, code: "Digit1" }), false)).toBe("fitView");
    expect(of(k("!", { shiftKey: true, code: "Digit1" }), true)).toBe("fitView");
    expect(of(k("@", { shiftKey: true, code: "Digit2" }), false)).toBe("fitSelection");
    expect(of(k("1", { code: "Digit1" }), false)).toBeNull(); // Shift 없이는 아니다
    expect(of(k("!", { shiftKey: true, ctrlKey: true, code: "Digit1" }), false)).toBeNull();
    expect(of(k("!", { shiftKey: true, metaKey: true, code: "Digit1" }), true)).toBeNull();
    expect(of(k("!", { shiftKey: true, altKey: true, code: "Digit1" }), false)).toBeNull();
    const input = document.createElement("input");
    expect(of(k("!", { shiftKey: true, code: "Digit1" }, input), false)).toBeNull(); // 입력 칸은 무시
  });

  it("플랫폼 판정·보이는지 판정", () => {
    expect(isMacPlatform({ platform: "MacIntel" })).toBe(true);
    expect(isMacPlatform({ platform: "Win32", userAgent: "Windows NT" })).toBe(false);
    expect(isMacPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)" })).toBe(true);
    expect(isShown(null)).toBe(false);
    expect(isShown(document.createElement("div"))).toBe(false); // 문서에 붙지 않았다
  });
});
```

`shared/tests/unit/react-flow-context-menu.unit.test.ts` — 원본 `describe("ContextMenu")` 4건(`buildMenu`·`MENU_PROVIDERS`·`viewMenu` 는 업무 코드라 뺀다)에 견본·props 시험을 더한다.

```ts
/** @vitest-environment happy-dom */
// 캔버스 우클릭 메뉴 — 룰 세트 편집기 context-menu.test.ts 의 ContextMenu 시험 + 견본 격자·testId·클래스 접두.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { ContextMenu, type ContextMenuProps } from "../../src/components/react-flow/ContextMenu";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function mount(items: ContextMenuProps["items"], extra: Partial<ContextMenuProps> = {}, onClose = vi.fn(), onParentKey = vi.fn()) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement("div", { onKeyDown: onParentKey }, createElement(ContextMenu, { items, at: { x: 10, y: 20 }, onClose, ...extra })));
  });
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, onClose, onParentKey, done };
}
const q = (host: Element, id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe("ContextMenu", () => {
  it("항목이 0개면 열지 않는다", async () => {
    const m = await mount([]);
    expect(q(m.host, "flow-menu")).toBeNull();
    m.done();
  });

  it("항목을 누르면 run 뒤 닫고, 꺼진 항목은 disabled + title, children 은 들여 쓴 버튼", async () => {
    const run = vi.fn();
    const child = vi.fn();
    const m = await mount([
      { id: "a", label: "가", run },
      { id: "b", label: "나", disabled: true, title: "안 되는 이유" },
      { id: "c", label: "묶음", children: [{ id: "c-1", label: "하위", run: child }] },
    ]);
    expect(q(m.host, "flow-menu")!.style.left).toBe("10px");
    const b = q(m.host, "flow-menu-item-b") as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe("안 되는 이유");
    expect(q(m.host, "flow-menu-item-c")!.tagName).toBe("DIV");
    expect(q(m.host, "flow-menu-item-c-1")!.className).toContain("rfx-menu-item-nested");
    await act(async () => {
      q(m.host, "flow-menu-item-a")!.click();
    });
    expect(run).toHaveBeenCalledOnce();
    expect(m.onClose).toHaveBeenCalledOnce();
    m.done();
  });

  it("메뉴 단추에서 Delete 는 위 onKeyDown 으로 올라가지 않고, Esc 는 스스로 닫는다", async () => {
    const m = await mount([{ id: "a", label: "가", run: vi.fn() }]);
    const btn = q(m.host, "flow-menu-item-a")!;
    await act(async () => {
      btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    });
    expect(m.onParentKey).not.toHaveBeenCalled();
    expect(m.onClose).not.toHaveBeenCalled();
    await act(async () => {
      btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(m.onParentKey).not.toHaveBeenCalled();
    expect(m.onClose).toHaveBeenCalled();
    m.done();
  });

  it("바깥을 누르면 닫는다", async () => {
    const m = await mount([{ id: "a", label: "가", run: vi.fn() }]);
    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(m.onClose).toHaveBeenCalled();
    m.done();
  });

  it("견본 항목 — 누르면 닫지 않고 격자를 펼치고, 견본 색은 CSS 값 그대로, 견본을 누르면 run 뒤 닫는다", async () => {
    const pick = vi.fn();
    const m = await mount([{
      id: "color", label: "색상", icon: createElement("i", { "data-testid": "ico" }),
      swatches: [{ id: "blue", label: "파랑", color: "var(--color-primary-soft)", borderColor: "var(--color-primary)", active: true, run: pick }],
    }]);
    expect(q(m.host, "ico")).not.toBeNull();
    await act(async () => {
      q(m.host, "flow-menu-item-color")!.click();
    });
    expect(m.onClose).not.toHaveBeenCalled();
    const sw = q(m.host, "flow-menu-swatch-blue")!;
    expect(sw.style.backgroundColor).toBe("var(--color-primary-soft)");
    expect(sw.getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      sw.click();
    });
    expect(pick).toHaveBeenCalledOnce();
    expect(m.onClose).toHaveBeenCalledOnce();
    m.done();
  });

  it("testId·클래스 접두를 바꾸면 그 이름으로 그리고 규칙도 그 접두로 넣는다", async () => {
    const m = await mount([{ id: "a", label: "가", run: vi.fn() }], { testId: "erd-menu", classPrefix: "erdx" });
    expect(q(m.host, "erd-menu")!.className).toBe("erdx-menu");
    expect(q(m.host, "erd-menu-item-a")!.className).toBe("erdx-menu-item");
    expect(document.head.textContent).toContain(".erdx-menu-item");
    m.done();
  });
});
```

`shared/tests/unit/react-flow-find-widget.unit.test.ts` — 원본 `find-widget.test.ts` 는 룰 세트 화면 전체를 띄우는 시험이라 옮길 수 없다. 같은 단언(건수 글·옵션 `aria-pressed`·잘못된 정규식·Enter/Shift+Enter·조합 중 무시·Esc·키가 부모로 올라가지 않음)을 위젯 하나에 가짜 `FindState` 로 건다.

```ts
/** @vitest-environment happy-dom */
// 찾기 위젯·일치 판정 — 룰 세트 편집기 find-widget.test.ts·find.test.ts 의 단언을 위젯 단위로 옮겼다.
import { act, createElement, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FIND_OPTIONS, INVALID_FIND, compileFind, escapeRegExp, type FindState } from "../../src/components/react-flow/find";
import { FIND_NO_RESULT, FindWidget, findCountText, type FindWidgetProps } from "../../src/components/react-flow/FindWidget";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

function stub(over: Partial<FindState> = {}): FindState {
  return {
    query: "", setQuery: vi.fn(), options: { ...DEFAULT_FIND_OPTIONS }, toggleOption: vi.fn(), invalid: false,
    hits: [], index: -1, next: vi.fn(), prev: vi.fn(), ...over,
  };
}
let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
});
function mount(find: FindState, extra: Partial<FindWidgetProps> = {}) {
  const onClose = vi.fn();
  const onParentKey = vi.fn();
  r = renderWithMantine(
    createElement("div", { onKeyDown: onParentKey },
      createElement(FindWidget, { find, inputRef: createRef<HTMLInputElement>(), focusSeq: 1, onClose, mac: false, ...extra })),
  );
  return { onClose, onParentKey };
}
const q = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelector(`[data-testid="${id}"]`) as T;
function key(el: Element, init: KeyboardEventInit): KeyboardEvent {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    el.dispatchEvent(ev);
  });
  return ev;
}

describe("compileFind·escapeRegExp", () => {
  it("빈 질의는 null, 기본은 대소문자 무시 부분 일치", () => {
    expect(compileFind("  ")).toBeNull();
    const m = compileFind("grd") as (t: string) => boolean;
    expect(m("E2S_GRD")).toBe(true);
    expect(m("E2S_FCT")).toBe(false);
  });
  it("대소문자 구분·단어 단위(한글 포함)·정규식", () => {
    expect((compileFind("grd", { ...DEFAULT_FIND_OPTIONS, caseSensitive: true }) as (t: string) => boolean)("E2S_GRD")).toBe(false);
    const word = compileFind("판정", { ...DEFAULT_FIND_OPTIONS, wholeWord: true }) as (t: string) => boolean;
    expect(word("등급 판정")).toBe(true);
    expect(word("등급 재판정")).toBe(false);
    expect((compileFind("^E2S_GRD\\d$", { ...DEFAULT_FIND_OPTIONS, regex: true }) as (t: string) => boolean)("E2S_GRD2")).toBe(true);
  });
  it("잘못된 정규식은 INVALID_FIND, 빈 일치(x*)는 결과로 치지 않는다, 정규식이 아니면 글자 그대로", () => {
    expect(compileFind("E2S_(GRD", { ...DEFAULT_FIND_OPTIONS, regex: true })).toBe(INVALID_FIND);
    expect((compileFind("x*", { ...DEFAULT_FIND_OPTIONS, regex: true }) as (t: string) => boolean)("abc")).toBe(false);
    expect((compileFind("a.b") as (t: string) => boolean)("axb")).toBe(false);
    expect(escapeRegExp("a.b*(c)")).toBe("a\\.b\\*\\(c\\)");
  });
});

describe("FindWidget", () => {
  it("건수 글 — 빈 글은 빈 글, 결과가 없으면 「결과 없음」, 있으면 순번/전체", () => {
    expect(findCountText({ query: "", hits: [], index: -1 })).toBe("");
    expect(findCountText({ query: "a", hits: [], index: -1 })).toBe(FIND_NO_RESULT);
    expect(findCountText({ query: "a", hits: ["x", "y"], index: 1 })).toBe("2/2");
    expect(findCountText({ query: "a", hits: [], index: -1 }, "표 없음")).toBe("표 없음");
    mount(stub({ query: "zz" }));
    expect(q("flow-find-count").textContent).toBe("결과 없음");
    expect(q("flow-find-count").hasAttribute("data-empty")).toBe(true);
    expect(q<HTMLButtonElement>("flow-find-next").disabled).toBe(true);
    expect(q<HTMLButtonElement>("flow-find-prev").disabled).toBe(true);
  });

  it("처음 그리면 입력 칸에 초점을 둔다", () => {
    mount(stub({ query: "abc" }));
    expect(document.activeElement).toBe(q("flow-find"));
  });

  it("Enter 는 다음, Shift+Enter 는 이전 — 한글 조합 중(isComposing)이면 무시한다", () => {
    const find = stub({ query: "x", hits: ["a", "b"], index: 0 });
    mount(find);
    expect(key(q("flow-find"), { key: "Enter" }).defaultPrevented).toBe(true);
    expect(find.next).toHaveBeenCalledOnce();
    key(q("flow-find"), { key: "Enter", shiftKey: true });
    expect(find.prev).toHaveBeenCalledOnce();
    expect(key(q("flow-find"), { key: "Enter", isComposing: true }).defaultPrevented).toBe(false);
    expect(key(q("flow-find"), { key: "Enter", shiftKey: true, isComposing: true }).defaultPrevented).toBe(false);
    expect(find.next).toHaveBeenCalledOnce();
    expect(find.prev).toHaveBeenCalledOnce();
  });

  it("옵션 셋 — aria-pressed 는 find.options, 누르면 toggleOption(키)", () => {
    const find = stub({ options: { caseSensitive: true, wholeWord: false, regex: false } });
    mount(find);
    expect(q("flow-find-case").getAttribute("aria-pressed")).toBe("true");
    expect(q("flow-find-word").getAttribute("aria-pressed")).toBe("false");
    act(() => q("flow-find-word").click());
    expect(find.toggleOption).toHaveBeenCalledWith("wholeWord");
  });

  it("잘못된 정규식 — 입력 칸에 오류 테두리(form-error)·aria-invalid", () => {
    mount(stub({ query: "(", invalid: true, options: { ...DEFAULT_FIND_OPTIONS, regex: true } }));
    expect(q("flow-find").classList.contains("form-error")).toBe(true);
    expect(q("flow-find").getAttribute("aria-invalid")).toBe("true");
  });

  it("Esc 는 onClose, 위젯 안의 키는 부모 onKeyDown 으로 올라가지 않는다", () => {
    const m = mount(stub({ query: "x", hits: ["a"], index: 0 }));
    key(q("flow-find-next"), { key: "Delete" });
    expect(m.onParentKey).not.toHaveBeenCalled();
    key(q("flow-find"), { key: "Escape" });
    expect(m.onClose).toHaveBeenCalledOnce();
    expect(m.onParentKey).not.toHaveBeenCalled();
  });

  it("위젯 안의 Ctrl+F(Mac 은 Cmd+F)는 입력 칸을 다시 고르고 브라우저 찾기를 막는다", () => {
    mount(stub(), { mac: true });
    expect(key(q("flow-find-close"), { key: "f", metaKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(q("flow-find"));
  });

  it("testId·문구·클래스 접두를 props 로 바꾼다", () => {
    mount(stub({ query: "q" }), {
      testId: "erd-find", label: "표 찾기", inputLabel: "표 찾기 — 물리명·논리명", placeholder: "표 이름", noResultText: "표 없음", classPrefix: "erdx",
    });
    expect(q("erd-find-widget").getAttribute("aria-label")).toBe("표 찾기");
    expect(q("erd-find-widget").className).toBe("erdx-find-widget");
    expect(q("erd-find").getAttribute("aria-label")).toBe("표 찾기 — 물리명·논리명");
    expect(q("erd-find").getAttribute("placeholder")).toBe("표 이름");
    expect(q("erd-find-count").textContent).toBe("표 없음");
    expect(document.head.textContent).toContain(".erdx-find-widget");
  });
});
```

- [ ] **Step 4: 시험이 실패하는지 확인**

Run(`src/frontend`): `pnpm --filter @dk-oasis/shared exec vitest run tests/unit/react-flow-`
Expected: 6개 파일 모두 FAIL — `Failed to resolve import "../../src/components/react-flow/…"`(폴더가 아직 없다).

- [ ] **Step 5: 순수 모듈 복사**

```bash
F=m-mdm/pages/dme/ruleSetEdit/canvas
S=shared/src/components/react-flow
mkdir -p $S
for f in snap viewport-guard; do { echo "// 룰 세트 편집기 $F/$f.ts 의 복사본(ERD 단계 1 Task 6). 합치기는 docs/erd-tool/deferred.md 15번."; cat $F/$f.ts; } > $S/$f.ts; done
{ echo "// 룰 세트 편집기 $F/route-path.ts 의 복사본(ERD 단계 1 Task 6). 합치기는 docs/erd-tool/deferred.md 15번."; perl -pe 's#^import type \{ FlowPos \} from "\.\./flow-edit";$#/** 흐름 좌표의 한 점. */\nexport interface FlowPos {\n  x: number;\n  y: number;\n}#' $F/route-path.ts; } > $S/route-path.ts
diff <(sed 1d $S/snap.ts) $F/snap.ts && diff <(sed 1d $S/viewport-guard.ts) $F/viewport-guard.ts && echo same
grep -n "from \"\.\." $S/*.ts
```

Expected: `same` 이 찍히고, 마지막 `grep` 은 아무것도 내지 않는다(`route-path.ts` 의 `flow-edit` import 가 `FlowPos` 선언으로 바뀌었다).

`$S/react-flow.ts` 는 원본 4줄과 같은 내용을 쓴다.

```ts
// React Flow 진입점 — 이 서브패스의 부품과 화면은 @xyflow/react 대신 이 모듈에서 import 한다(룰 세트 편집기 canvas/react-flow.ts 복사본).
// 외부 패키지 스타일시트는 호스트(Next)가 번들한다(Local-Rules §17 허용). tsup 은 shared dependencies 라 import 를 그대로 남긴다.
export * from "@xyflow/react";
import "@xyflow/react/dist/style.css";
```

- [ ] **Step 6: 스타일 — `styles.ts`, `SnapGuideStyle.tsx`**

원본 `styles/{menu,toolbox,viewport,snap}.ts` 에서 이 부품이 쓰는 규칙만 옮긴다. 노드 색 견본 규칙(`--rsf-c-*`)·선 [+] 단추·도움말·미니맵 내리기 규칙은 룰 세트 전용이라 뺀다.

```ts
/**
 * react-flow 부품 스타일 — 룰 세트 편집기 styles/{menu,toolbox,viewport,snap}.ts 에서 옮겼다.
 * 컴포넌트가 `<style href precedence>` 로 직접 넣는다(Part B §18-3(2) — 포털은 원격 모듈의 CSS 파일을 싣지 않는다).
 * 클래스 접두(기본 "rfx")로 규칙을 만들고 href 에도 접두를 넣는다. 접두가 다르면 규칙이 따로 들어간다.
 * 색·간격·글자 크기는 공통 토큰만 쓴다. 모서리·그림자도 공통 토큰(--radius-*, --shadow-dropdown)이다(JsonView 와 같다).
 */
export const DEFAULT_CLASS_PREFIX = "rfx";

export type StylePart = "menu" | "tool" | "find" | "viewport" | "snap";
export const styleHref = (part: StylePart, prefix: string): string => `dk-react-flow-${part}-${prefix}`;

export const menuCss = (p: string) => `
.${p}-menu {
  position: fixed; z-index: 400; min-width: 160px; max-width: 320px; padding: 4px 0;
  display: flex; flex-direction: column;
  background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-dropdown);
}
.${p}-menu-item {
  display: block; width: 100%; padding: 4px var(--spacing-md); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: none; border: none; color: var(--color-text); font: inherit; cursor: pointer;
}
.${p}-menu-item:hover:not(:disabled), .${p}-menu-item:focus-visible { background: var(--color-bg-hover); outline: none; }
.${p}-menu-item:disabled { color: var(--color-text-muted); cursor: default; }
.${p}-menu-item[data-danger="true"]:not(:disabled) { color: var(--color-danger); }
.${p}-menu-item-nested { padding-left: calc(var(--spacing-md) * 2); }
.${p}-menu-item-icon { display: flex; align-items: center; gap: var(--spacing-xs); }
.${p}-menu-group { display: flex; flex-direction: column; }
.${p}-menu-swatches { display: grid; grid-template-columns: repeat(3, 28px); gap: 8px; padding: 8px var(--spacing-md); }
.${p}-menu-swatch {
  box-sizing: border-box; width: 28px; height: 28px; margin: 0; padding: 0; cursor: pointer;
  background: var(--color-bg); border: 2px solid var(--color-border-strong); border-radius: var(--radius-md);
}
.${p}-menu-swatch:hover, .${p}-menu-swatch:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.${p}-menu-swatch[aria-pressed="true"] { box-shadow: 0 0 0 4px var(--color-border-light), 0 0 0 5px var(--color-border-strong); }
.${p}-menu-group-title { padding: 4px var(--spacing-md); font-size: var(--font-size-sm); color: var(--color-text-secondary); }
`;

export const toolCss = (p: string) => `
.${p}-tip { position: relative; display: inline-flex; }
.${p}-tip > .${p}-tool-btn { width: 26px; min-width: 26px; height: 26px; min-height: 26px; padding: 0; }
.${p}-tip:hover::after, .${p}-tip:focus-within::after {
  content: attr(data-tip); position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%); z-index: 10;
  padding: 2px var(--spacing-sm); white-space: nowrap; pointer-events: none; font-size: var(--font-size-sm); font-weight: normal;
  color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  box-shadow: var(--shadow-dropdown);
}
.${p}-tip[data-tip-off]::after { display: none; }
.${p}-tip[data-tip-align="end"]:hover::after, .${p}-tip[data-tip-align="end"]:focus-within::after { left: auto; right: 0; transform: none; }
`;

export const findCss = (p: string) => `
.${p}-find-widget {
  position: absolute; top: 8px; right: 15px; z-index: 6;
  display: flex; align-items: center; gap: 2px; padding: 4px;
  background: var(--color-bg); border: 1px solid var(--color-border-light); border-radius: var(--radius-md);
  box-shadow: var(--shadow-dropdown);
}
.${p}-find-field { position: relative; display: flex; align-items: center; }
.${p}-find-widget .${p}-find-input { width: 240px; height: 26px; min-height: 26px; padding-right: 70px; font-size: var(--font-size-sm); }
.${p}-find-opts { position: absolute; top: 50%; right: 3px; transform: translateY(-50%); display: flex; gap: 1px; }
.${p}-find-opt {
  display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0;
  border: 1px solid transparent; border-radius: var(--radius-sm); background: none; color: var(--color-text-secondary);
  font: inherit; font-size: var(--font-size-xs); font-weight: 600; line-height: 1; cursor: pointer;
}
.${p}-find-opt:hover { background: var(--color-bg-hover); color: var(--color-text); }
.${p}-find-opt[aria-pressed="true"] { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); }
.${p}-find-opt:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.${p}-find-opt[data-opt="wholeWord"] > span { text-decoration: underline; text-underline-offset: 2px; }
.${p}-find-count { min-width: 64px; padding: 0 var(--spacing-xs); font-size: var(--font-size-sm); color: var(--color-text-secondary); white-space: nowrap; }
.${p}-find-count[data-empty] { color: var(--color-danger); }
.${p}-find-widget .${p}-tool-btn { border-color: transparent; background: none; }
.${p}-find-widget .${p}-tool-btn:hover:not(:disabled) { background: var(--color-bg-hover); border-color: transparent; }
`;

export const viewportCss = (p: string) => `
.${p}-lost { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.${p}-lost-card {
  pointer-events: auto; display: flex; flex-direction: column; align-items: center; gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg); font-size: var(--font-size-sm); color: var(--color-text-secondary);
  background: var(--color-bg); border: 1px solid var(--color-border-light); border-radius: var(--radius-md); box-shadow: var(--shadow-dropdown);
}
.${p}-lost-btn {
  display: inline-flex; align-items: center; gap: var(--spacing-xs); padding: 4px var(--spacing-md); cursor: pointer;
  font: inherit; color: var(--color-primary); background: var(--color-primary-soft); border: 1px solid var(--color-primary); border-radius: var(--radius-sm);
}
.${p}-lost-btn:hover { filter: brightness(0.97); }
.${p}-lost-btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.${p}-lost-btn kbd { font: inherit; font-size: var(--font-size-xs); color: var(--color-text-secondary); }
`;

export const snapCss = (p: string) => `
.${p}-snap-guide { position: absolute; pointer-events: none; border: 0 solid var(--color-primary); }
.${p}-snap-guide[data-axis="x"] { width: 0; border-left-style: solid; }
.${p}-snap-guide[data-axis="y"] { height: 0; border-top-style: solid; }
`;
```

`SnapGuideStyle.tsx`:

```tsx
"use client";

import { DEFAULT_CLASS_PREFIX, snapCss, styleHref } from "./styles";

/**
 * 맞춤 안내선 규칙(`${접두}-snap-guide`, `data-axis="x"|"y"`)을 문서에 넣는다. 안내선 div 의 자리·길이·굵기(1/zoom)는
 * 흐름 좌표 층 안에서 캔버스가 인라인으로 준다(룰 세트 편집기 styles/snap.ts 와 같다).
 */
export function SnapGuideStyle({ classPrefix = DEFAULT_CLASS_PREFIX }: { classPrefix?: string }) {
  return (
    <style href={styleHref("snap", classPrefix)} precedence="default">
      {snapCss(classPrefix)}
    </style>
  );
}
```

- [ ] **Step 7: `ToolButton.tsx`, `context-menu.ts`, `ContextMenu.tsx`**

`ToolButton.tsx` — 원본 `canvas/ToolButton.tsx` 와 `FlowToolbar.keepFocusOffButtons` 를 합쳤다. shared 안에서는 `../form/Button` 을 상대 경로로 쓴다(JsonView 와 같다).

```tsx
"use client";

/**
 * 툴바 아이콘 단추(룰 세트 편집기 canvas/ToolButton.tsx 복사본). 글자 없이 아이콘만 보이고, 이름은 aria-label(= label),
 * 설명은 단추를 감싼 `span.${접두}-tip[data-tip]` 의 CSS 툴팁이다. title 은 두지 않는다(브라우저 툴팁과 겹침 방지).
 * 크기는 26×26 정사각형 — 공용 Button 의 size 를 바꾸지 않고 `${접두}-tool-btn` 규칙으로 고정한다.
 */
import type { MouseEvent, ReactNode } from "react";

import { Button, type ButtonProps } from "../form/Button";
import { DEFAULT_CLASS_PREFIX, styleHref, toolCss } from "./styles";

/** 단추 위 mousedown 의 기본 동작(초점 옮기기)을 막는다. 누르기(click)는 그대로 온다(Local-Rules §19). */
export function keepFocusOffButtons(e: MouseEvent<HTMLElement>): void {
  if ((e.target as Element | null)?.closest?.("button")) e.preventDefault();
}

export interface ToolButtonProps extends Omit<ButtonProps, "children" | "ariaLabel" | "title"> {
  /** 접근성 이름(aria-label). */
  label: string;
  icon: ReactNode;
  /** 툴팁 글. 없으면 label. */
  tip?: string;
  /** "end" 는 툴팁 오른쪽 끝을 단추 오른쪽 끝에 맞춘다(툴바 오른쪽 끝 단추). */
  align?: "center" | "end";
  /** 툴팁을 숨긴다. */
  tipOff?: boolean;
  /** 클래스 접두(기본 "rfx"). */
  classPrefix?: string;
}

export function ToolButton({ label, icon, tip, align = "center", tipOff, className, classPrefix = DEFAULT_CLASS_PREFIX, ...rest }: ToolButtonProps) {
  const p = classPrefix;
  return (
    <span className={`${p}-tip`} data-tip={tip ?? label} data-tip-align={align === "end" ? "end" : undefined} data-tip-off={tipOff ? "" : undefined}>
      <style href={styleHref("tool", p)} precedence="default">
        {toolCss(p)}
      </style>
      <Button ariaLabel={label} className={className ? `${p}-tool-btn ${className}` : `${p}-tool-btn`} {...rest}>
        {icon}
      </Button>
    </span>
  );
}
```

`context-menu.ts` — 원본 `canvas/context-menu.ts` 의 `MenuItem`·`MenuSwatch` 만 옮긴다. 노드 색 키(`NodeColor`)는 CSS 색 값으로, 아이콘 키(`"brush"`)는 `ReactNode` 로 바꾼다. 메뉴 대상·제공자·캔버스 동작은 업무 모델이라 옮기지 않는다.

```ts
import type { ReactNode } from "react";

/** 색 견본 한 칸. testid 는 `${testId}-swatch-${id}`. */
export interface MenuSwatch {
  id: string;
  label: string;
  /** 칸 채움 색 — CSS 색 값(공통 토큰 `var(--color-…)` 를 쓴다). */
  color: string;
  /** 칸 테두리 색(없으면 기본 테두리). */
  borderColor?: string;
  /** 고른 칸. */
  active: boolean;
  run: () => void;
}

export interface MenuItem {
  /** testid 는 `${testId}-item-${id}`. */
  id: string;
  label: string;
  /** 없으면 children 만 있는 묶음 제목. */
  run?: () => void;
  disabled?: boolean;
  /** 꺼진 이유. */
  title?: string;
  danger?: boolean;
  /** 견본 항목 단추 앞 아이콘. */
  icon?: ReactNode;
  /** 있으면 누를 때 메뉴를 닫지 않고 아래에 견본 격자를 펼친다. 견본을 누르면 run() 뒤 닫는다. */
  swatches?: MenuSwatch[];
  /** 하위 항목 — 떠 있는 하위 메뉴가 아니라 들여 쓴 묶음으로 그린다. */
  children?: MenuItem[];
}
```

`ContextMenu.tsx` — 원본과 동작이 같다(열기·위치 당김·첫 항목 초점·Esc·바깥 누르기·스크롤로 닫기·키를 위로 올리지 않기). 바뀐 곳은 testId·접두 props, 견본 색을 인라인 색으로 그리기, 아이콘을 `ReactNode` 로 받기, 자기 `<style>` 넣기다.

```tsx
"use client";

/**
 * 캔버스 우클릭·[+] 메뉴(룰 세트 편집기 canvas/ContextMenu.tsx 복사본) — 떠 있는 레이어 하나(position: fixed)에 항목 버튼을 세로로 둔다.
 * 항목을 누르면 run() 뒤 닫는다. Esc·바깥 누르기·스크롤로 닫는다. 화면 밖으로 넘치면 안쪽으로 당긴다. 항목이 0개면 열지 않는다.
 * 메뉴 안 키 입력은 여기서 끊는다 — 메뉴 단추에 초점이 있을 때 Delete 등이 캔버스 단축키로 올라가지 않게.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { MenuItem } from "./context-menu";
import { DEFAULT_CLASS_PREFIX, menuCss, styleHref } from "./styles";

export interface ContextMenuProps {
  items: MenuItem[];
  /** 화면 좌표(clientX·clientY). null 이면 닫힘. */
  at: { x: number; y: number } | null;
  onClose(): void;
  /** 메뉴 틀 data-testid(기본 "flow-menu"). 항목 `${testId}-item-${id}`, 견본 `${testId}-swatch-${id}`. */
  testId?: string;
  /** 클래스 접두(기본 "rfx"). */
  classPrefix?: string;
}

/** 화면 가장자리와 띄울 간격(px). */
const EDGE_GAP = 4;

interface EntryProps {
  item: MenuItem;
  onClose(): void;
  onResize(): void;
  testId: string;
  p: string;
}

function ItemButton({ item, onClose, nested, testId, p }: Omit<EntryProps, "onResize"> & { nested: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`${p}-menu-item${nested ? ` ${p}-menu-item-nested` : ""}`}
      data-testid={`${testId}-item-${item.id}`}
      data-danger={item.danger ? "true" : undefined}
      disabled={item.disabled}
      title={item.title}
      onClick={() => {
        item.run?.();
        onClose();
      }}
    >
      {item.label}
    </button>
  );
}

/** 견본 격자를 펼치는 항목 — 단추는 메뉴를 닫지 않고, 견본을 누르면 run 뒤 닫는다. */
function SwatchEntry({ item, onClose, onResize, testId, p }: EntryProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${p}-menu-group`}>
      <button
        type="button"
        role="menuitem"
        className={`${p}-menu-item ${p}-menu-item-icon`}
        data-testid={`${testId}-item-${item.id}`}
        aria-expanded={open}
        disabled={item.disabled}
        title={item.title}
        onClick={() => {
          setOpen((v) => !v);
          onResize();
        }}
      >
        {item.icon ?? null}
        <span>{item.label}</span>
      </button>
      {open && (
        <div className={`${p}-menu-swatches`} role="group" aria-label={item.label}>
          {item.swatches!.map((sw) => (
            <button
              key={sw.id}
              type="button"
              className={`${p}-menu-swatch`}
              data-swatch={sw.id}
              data-testid={`${testId}-swatch-${sw.id}`}
              aria-label={sw.label}
              title={sw.label}
              aria-pressed={sw.active}
              style={{ backgroundColor: sw.color, borderColor: sw.borderColor }}
              onClick={() => {
                sw.run();
                onClose();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Entry(props: EntryProps) {
  const { item, onClose, testId, p } = props;
  if (item.swatches && item.swatches.length > 0) return <SwatchEntry {...props} />;
  if (!item.children || item.children.length === 0) return <ItemButton item={item} onClose={onClose} nested={false} testId={testId} p={p} />;
  return (
    <div className={`${p}-menu-group`} role="group" aria-label={item.label}>
      {item.run ? (
        <ItemButton item={item} onClose={onClose} nested={false} testId={testId} p={p} />
      ) : (
        <div className={`${p}-menu-group-title`} data-testid={`${testId}-item-${item.id}`} title={item.title}>
          {item.label}
        </div>
      )}
      {item.children.map((c) => (
        <ItemButton key={c.id} item={c} onClose={onClose} nested testId={testId} p={p} />
      ))}
    </div>
  );
}

export function ContextMenu({ items, at, onClose, testId = "flow-menu", classPrefix = DEFAULT_CLASS_PREFIX }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(at);
  const open = !!at && items.length > 0;
  /** 항목이 메뉴 높이를 바꾸면(견본 격자 펼침) 올려 위치 당김을 다시 돌린다. */
  const [resizes, setResizes] = useState(0);
  const onResize = useCallback(() => setResizes((n) => n + 1), []);

  // 여는 자리가 바뀌면 그 자리에 두고, 그린 뒤 화면 밖으로 넘치면 안쪽으로 당긴다.
  useLayoutEffect(() => {
    if (!open || !at) return;
    const el = ref.current;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    const vw = typeof window === "undefined" ? 0 : window.innerWidth;
    const vh = typeof window === "undefined" ? 0 : window.innerHeight;
    const x = vw > 0 && at.x + w + EDGE_GAP > vw ? Math.max(EDGE_GAP, vw - w - EDGE_GAP) : at.x;
    const y = vh > 0 && at.y + h + EDGE_GAP > vh ? Math.max(EDGE_GAP, vh - h - EDGE_GAP) : at.y;
    setPos({ x, y });
  }, [open, at, resizes]);

  // 열리면 첫 항목에 초점을 준다(활성 항목이 없으면 메뉴 틀). 닫힐 때 초점이 메뉴 안이거나 없으면 열기 전 자리로 돌린다.
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = el.querySelector<HTMLButtonElement>("button:not(:disabled)");
    (first ?? el).focus();
    return () => {
      const cur = document.activeElement;
      if (prev?.isConnected && (!cur || cur === document.body || el.contains(cur))) prev.focus();
    };
  }, [open, at]);

  // Esc·바깥 누르기·스크롤로 닫는다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const outside = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", outside, true);
    window.addEventListener("wheel", outside, { capture: true, passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", outside, true);
      window.removeEventListener("wheel", outside, { capture: true });
    };
  }, [open, onClose]);

  if (!open) return null;
  const p = classPrefix;
  const at2 = pos ?? at;
  return (
    <div
      ref={ref}
      className={`${p}-menu`}
      data-testid={testId}
      role="menu"
      tabIndex={-1}
      style={{ left: at2.x, top: at2.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <style href={styleHref("menu", p)} precedence="default">
        {menuCss(p)}
      </style>
      {items.map((item) => (
        <Entry key={item.id} item={item} onClose={onClose} onResize={onResize} testId={testId} p={p} />
      ))}
    </div>
  );
}
```

- [ ] **Step 8: `shortcuts.ts`, `find.ts`, `FindWidget.tsx`**

`shortcuts.ts` — 원본의 순수 함수(`isMacPlatform`·`isTypingTarget`·`isShown`·`UNHANDLED`)는 그대로 두고, 룰 세트 전용 키 판정(디버거·정렬·옮기기)을 화면이 넘기는 묶음 표로 바꾼다. 원본 판정 규칙(입력 칸 무시, Alt 는 물리 키·Ctrl·Meta 와 함께면 무시, 플랫폼 수정키, 잘못된 수정키면 무시)은 그대로다.

```ts
/**
 * 캔버스 단축키 판정(룰 세트 편집기 canvas/shortcuts.ts 를 일반화한 복사본). 캔버스에 초점이 있을 때 화면이 onKeyDown 에서 한 번 부른다.
 * 입력 칸이면 무시하고, 묶음 표에 있고 손잡이가 있는 키만 preventDefault·stopPropagation 한다(나머지는 브라우저·포털 동작 그대로).
 * 키 표는 화면이 정한다 — 공통 키는 CANVAS_SHORTCUTS, 화면 전용 키는 그 뒤에 잇는다. 앞에 있는 묶음이 먼저 맞는다.
 */

/** `code` 는 물리 키(Mac Option+글자는 e.key 가 'å' 처럼 바뀌므로 Alt 조합은 code 로 판정한다). */
export interface KeyLike { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; target: EventTarget | null }
/** 핸들러가 할 일이 없어 키를 쓰지 않았다는 표시 — 디스패처가 막지 않고 브라우저 기본 동작에 맡긴다. */
export const UNHANDLED = Symbol("shortcut-unhandled");
export type ShortcutHandlers<Id extends string> = Partial<Record<Id, () => unknown>>;

/** 키 묶음 하나. `key`(한 글자면 소문자) 또는 `code`(물리 키) 가운데 하나로 맞춘다. 수정키는 적은 것과 정확히 같아야 한다. */
export interface ShortcutBinding<Id extends string> {
  id: Id;
  key?: string;
  /** Alt 조합과 Shift+숫자처럼 자판마다 e.key 가 바뀌는 키. */
  code?: string;
  /** 플랫폼 수정키(Win·Linux Ctrl, Mac Cmd). */
  mod?: boolean;
  shift?: boolean;
  /** Alt(⌥) 조합 — code 로만 맞춘다. Ctrl·Meta 가 같이 눌리면(AltGr) 맞추지 않는다. */
  alt?: boolean;
}

/** 도움말 표 한 줄 — 모드 형식은 화면이 정한다. */
export interface ShortcutHelpRow<Id extends string, Mode extends string> { id: Id; win: string; mac: string; label: string; modes: readonly Mode[] }

export type CanvasShortcutId = "undo" | "redo" | "delete" | "escape" | "copy" | "paste" | "duplicate" | "find" | "fitView" | "fitSelection";
/** 캔버스 공통 키(룰 세트 편집기와 같다). Shift+1·Shift+2 는 물리 키로 본다(자판마다 e.key 가 '!'·'@' 로 다르다). */
export const CANVAS_SHORTCUTS: readonly ShortcutBinding<CanvasShortcutId>[] = [
  { id: "undo", key: "z", mod: true },
  { id: "redo", key: "z", mod: true, shift: true },
  { id: "redo", key: "y", mod: true },
  { id: "copy", key: "c", mod: true },
  { id: "paste", key: "v", mod: true },
  { id: "duplicate", key: "d", mod: true },
  { id: "find", key: "f", mod: true },
  { id: "fitView", code: "Digit1", shift: true },
  { id: "fitSelection", code: "Digit2", shift: true },
  { id: "delete", key: "Delete" },
  { id: "delete", key: "Backspace" },
  { id: "escape", key: "Escape" },
];

export function isMacPlatform(nav: { platform?: string; userAgent?: string } | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav) return false;
  return /Mac|iPhone|iPad/i.test(nav.platform ?? "") || /Macintosh|Mac OS X/i.test(nav.userAgent ?? "");
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || el.getAttribute?.("contenteditable") === "true";
}

/** 요소가 화면에 보이는지 — 조상 중 display:none 이 있으면(포털이 고르지 않은 탭을 숨긴 경우) 보이지 않는다. */
export function isShown(el: HTMLElement | null | undefined): boolean {
  if (!el || !el.isConnected) return false;
  if (typeof el.checkVisibility === "function") return el.checkVisibility();
  return el.offsetParent !== null;
}

export function shortcutOf<Id extends string>(e: KeyLike, mac: boolean, bindings: readonly ShortcutBinding<Id>[]): Id | null {
  if (isTypingTarget(e.target)) return null;
  if (e.altKey) {
    if (e.ctrlKey || e.metaKey || !e.code) return null; // Windows 의 AltGr 은 Ctrl+Alt
    for (const b of bindings) if (b.alt && b.code === e.code && !!b.shift === e.shiftKey) return b.id;
    return null;
  }
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!mod && (e.ctrlKey || e.metaKey)) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  for (const b of bindings) {
    if (b.alt || !!b.mod !== mod || !!b.shift !== e.shiftKey) continue;
    if (b.code !== undefined ? b.code === e.code : b.key === key) return b.id;
  }
  return null;
}

export function dispatchShortcut<Id extends string>(
  e: KeyLike & { preventDefault(): void; stopPropagation(): void },
  handlers: ShortcutHandlers<Id>,
  mac: boolean,
  bindings: readonly ShortcutBinding<Id>[],
): boolean {
  const id = shortcutOf(e, mac, bindings);
  const run = id ? handlers[id] : undefined;
  if (!run) return false;
  if (run() === UNHANDLED) return false;
  e.preventDefault();
  e.stopPropagation();
  return true;
}
```

`find.ts` — 원본 `state/useFind.ts` 에서 업무 모델(`findNodes`·`useFind`)을 뺀 나머지. `escapeRegExp` 는 원본에서 내부 함수였으나 여기서는 내보낸다.

```ts
/**
 * 찾기 위젯 상태 형식과 일치 판정(룰 세트 편집기 state/useFind.ts 복사본, 업무 모델 검색 함수는 뺐다). React 의존이 없다.
 * 옵션 셋(VS Code 찾기 위젯과 같다): 대소문자 구분 · 단어 단위 · 정규식. 끄면 대소문자를 무시한 부분 일치다.
 * 잘못된 정규식은 예외를 내지 않고 INVALID_FIND 로 알린다. 빈 글자 일치(`x*` 등)는 결과로 치지 않는다.
 */
export interface FindOptions {
  /** 대소문자 구분(Aa). */
  caseSensitive: boolean;
  /** 단어 단위(ab) — 일치 앞뒤가 글자·숫자·밑줄이 아니어야 한다. */
  wholeWord: boolean;
  /** 정규식(.*). */
  regex: boolean;
}

export const DEFAULT_FIND_OPTIONS: Readonly<FindOptions> = { caseSensitive: false, wholeWord: false, regex: false };

/** 찾기 위젯이 읽는 상태 — 화면의 찾기 훅이 만든다. */
export interface FindState {
  query: string;
  setQuery(q: string): void;
  options: FindOptions;
  toggleOption(key: keyof FindOptions): void;
  /** 정규식 옵션이 켜져 있고 글자가 정규식으로 잘못됐다(결과 0건). */
  invalid: boolean;
  /** 찾은 대상 ID(화면이 정한 순서). */
  hits: string[];
  /** 지금 가리키는 hits 순번(없으면 -1). */
  index: number;
  next(): void;
  prev(): void;
}

/** 글자 하나가 단어 글자(글자·숫자·밑줄 — 한글 포함)인가. */
const WORD_CHAR = /[\p{L}\p{N}_]/u;
const isWordChar = (ch: string | undefined): boolean => !!ch && WORD_CHAR.test(ch);

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 잘못된 정규식 표시. */
export const INVALID_FIND = "invalid" as const;
export type FindMatcher = (text: string) => boolean;

/** 질의·옵션으로 일치 판정 함수를 만든다. 빈 질의면 null, 정규식이 잘못됐으면 INVALID_FIND. 단어 단위는 일치 앞뒤 글자를 유니코드로 본다. */
export function compileFind(query: string, opts: FindOptions = DEFAULT_FIND_OPTIONS): FindMatcher | typeof INVALID_FIND | null {
  if (query.trim() === "") return null;
  let re: RegExp;
  try {
    re = new RegExp(opts.regex ? query : escapeRegExp(query.trim()), opts.caseSensitive ? "g" : "gi");
  } catch {
    return INVALID_FIND;
  }
  return (text: string) => {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const end = m.index + m[0].length;
      if (m[0] !== "" && (!opts.wholeWord || (!isWordChar(text[m.index - 1]) && !isWordChar(text[end])))) return true;
      re.lastIndex = m.index + 1; // 빈 일치·단어 경계 실패 — 한 글자 뒤에서 다시 찾는다(무한 반복 방지)
    }
    return false;
  };
}
```

`FindWidget.tsx` — 동작은 원본과 같다(열 때마다 입력 칸 초점·전체 선택, Enter 다음·Shift+Enter 이전, 조합 중 무시, Esc 는 캡처 단계에서 닫기, 위젯 안 Ctrl/Cmd+F 는 입력 칸 다시 고르기, 위젯 안 키는 위로 올리지 않기). testId·문구·접두를 props 로 받는다.

```tsx
"use client";

/**
 * 찾기 위젯(룰 세트 편집기 canvas/FindWidget.tsx 복사본, VS Code 찾기 위젯 방식) — 캔버스 감싸개 안 오른쪽 위에 떠 있는 작은 상자.
 * 입력 칸(칸 안쪽 오른쪽에 옵션 토글 셋) · 건수 · [이전](Shift+Enter) · [다음](Enter) · [닫기](Esc).
 * 단추는 눌러도 초점을 가져가지 않는다(keepFocusOffButtons — 초점이 입력 칸에 남는다, Local-Rules §19).
 * 잘못된 정규식이면 입력 칸에 공용 오류 테두리(form-error)와 aria-invalid 를 준다. 글자·옵션은 화면의 찾기 훅에 남는다.
 */
import { useEffect, type KeyboardEvent, type RefObject } from "react";

import { IconArrowDown, IconArrowUp, IconX } from "@tabler/icons-react";

import { Input } from "../form/Input";
import type { FindOptions, FindState } from "./find";
import { DEFAULT_CLASS_PREFIX, findCss, styleHref } from "./styles";
import { ToolButton, keepFocusOffButtons } from "./ToolButton";

/** 옵션 토글 — 순서는 VS Code 와 같다. testid 는 `${testId}-${suffix}`. */
const OPTIONS: { key: keyof FindOptions; suffix: string; label: string; glyph: string }[] = [
  { key: "caseSensitive", suffix: "case", label: "대소문자 구분", glyph: "Aa" },
  { key: "wholeWord", suffix: "word", label: "단어 단위로", glyph: "ab" },
  { key: "regex", suffix: "regex", label: "정규식 사용", glyph: ".*" },
];

export const FIND_NO_RESULT = "결과 없음";

/** 건수 글 — 글자가 비면 빈 글, 결과가 없으면 noResultText, 있으면 "2/5". */
export function findCountText(find: Pick<FindState, "query" | "hits" | "index">, noResultText: string = FIND_NO_RESULT): string {
  if (find.query.trim() === "") return "";
  return find.hits.length === 0 ? noResultText : `${find.index + 1}/${find.hits.length}`;
}

export interface FindWidgetProps {
  find: FindState;
  inputRef: RefObject<HTMLInputElement | null>;
  /** 올라갈 때마다 입력 칸에 초점을 두고 전체 선택한다(처음 그릴 때 포함). */
  focusSeq: number;
  /** Esc·[닫기] — 화면이 초점을 캔버스로 돌리고 위젯을 닫는다. */
  onClose(): void;
  /** Mac 이면 Cmd+F, 아니면 Ctrl+F. */
  mac: boolean;
  /** 입력 칸 data-testid(기본 "flow-find"). 위젯 `-widget`, 옵션 `-case`·`-word`·`-regex`, 건수 `-count`, 단추 `-prev`·`-next`·`-close`. */
  testId?: string;
  /** 위젯 aria-label(기본 "찾기"). */
  label?: string;
  /** 입력 칸 aria-label(기본 "찾을 글"). */
  inputLabel?: string;
  /** 입력 칸 자리 글(기본 "찾기"). */
  placeholder?: string;
  /** 결과가 없을 때 건수 자리 글(기본 "결과 없음"). */
  noResultText?: string;
  /** 클래스 접두(기본 "rfx"). */
  classPrefix?: string;
}

export function FindWidget({
  find, inputRef, focusSeq, onClose, mac,
  testId = "flow-find", label = "찾기", inputLabel = "찾을 글", placeholder = "찾기", noResultText = FIND_NO_RESULT, classPrefix = DEFAULT_CLASS_PREFIX,
}: FindWidgetProps) {
  useEffect(() => {
    const el = inputRef.current;
    el?.focus({ preventScroll: true });
    el?.select();
  }, [focusSeq, inputRef]);

  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    }
    // 위젯 안의 키는 캔버스 단축키 디스패처(감싸개 onKeyDown)로 보내지 않는다.
    e.stopPropagation();
  };
  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (e.shiftKey) find.prev();
    else find.next();
  };

  const p = classPrefix;
  const none = find.hits.length === 0;
  return (
    <div
      data-testid={`${testId}-widget`}
      className={`${p}-find-widget`}
      role="search"
      aria-label={label}
      onMouseDown={keepFocusOffButtons}
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
    >
      <style href={styleHref("find", p)} precedence="default">
        {findCss(p)}
      </style>
      <div className={`${p}-find-field`}>
        <Input
          data-testid={testId}
          {...({ ref: inputRef } as object)}
          className={find.invalid ? `${p}-find-input form-error` : `${p}-find-input`}
          aria-invalid={find.invalid}
          placeholder={placeholder}
          aria-label={inputLabel}
          value={find.query}
          onChange={find.setQuery}
          onKeyDown={onInputKeyDown}
        />
        <span className={`${p}-find-opts`}>
          {OPTIONS.map((o) => (
            <span key={o.key} className={`${p}-tip`} data-tip={o.label}>
              <button
                type="button"
                data-testid={`${testId}-${o.suffix}`}
                data-opt={o.key}
                className={`${p}-find-opt`}
                aria-label={o.label}
                aria-pressed={find.options[o.key]}
                onClick={() => find.toggleOption(o.key)}
              >
                <span aria-hidden="true">{o.glyph}</span>
              </button>
            </span>
          ))}
        </span>
      </div>
      <span data-testid={`${testId}-count`} className={`${p}-find-count`} data-empty={none ? "" : undefined} aria-live="polite">
        {findCountText(find, noResultText)}
      </span>
      <ToolButton classPrefix={p} data-testid={`${testId}-prev`} label="이전 결과" align="end" tip="이전 결과 (Shift+Enter)"
        icon={<IconArrowUp size={14} aria-hidden="true" />} disabled={none} onClick={find.prev} />
      <ToolButton classPrefix={p} data-testid={`${testId}-next`} label="다음 결과" align="end" tip="다음 결과 (Enter)"
        icon={<IconArrowDown size={14} aria-hidden="true" />} disabled={none} onClick={find.next} />
      <ToolButton classPrefix={p} data-testid={`${testId}-close`} label="닫기" tip="닫기 (Esc)" align="end"
        icon={<IconX size={14} aria-hidden="true" />} onClick={onClose} />
    </div>
  );
}
```

- [ ] **Step 9: `ViewportGuard.tsx`**

원본 계산과 시간 상수(`RECHECK_MS=400`, `LOST_DELAY_MS=300`)는 그대로다. 그룹 틀 형식(`GROUP_TYPE = "rsfGroup"`)은 `ignoreNodeTypes` prop 으로, 문구·testId·React Flow 예외 클래스(`nopan nodrag nowheel`)는 props 로 바꾼다. 이동 한계 계산에는 무시할 형식도 넣는다(원본과 같다).

```tsx
"use client";

/**
 * 화면 길잡이(룰 세트 편집기 canvas/ViewportGuard.tsx 복사본) — ReactFlow 의 자식으로 그린다. 계산은 viewport-guard.ts.
 * 1. 이동 한계: 노드 경계 상자·캔버스 크기·배율이 바뀔 때마다 저장소의 translateExtent 를 다시 넣는다. 한계가 줄어 지금 화면이
 *    한계 밖에 남으면 RECHECK_MS 동안 더 바뀌지 않을 때(끌기·영역 선택 중이 아니면) 한 번 맞춘다(화면 맞춤 애니메이션보다 길다).
 * 2. 화면 밖 안내: 화면에 걸친 노드가 하나도 없으면(ignoreNodeTypes 형식은 세지 않는다) LOST_DELAY_MS 뒤 안내와 [전체 보기] 를 띄운다.
 * 저장소 구독은 이 작은 컴포넌트만 다시 그린다. 안내 상자는 React Flow 예외 클래스라 그 위에서 끌어도 화면이 움직이지 않는다.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { useStore, useStoreApi, type ReactFlowState } from "./react-flow";
import { isShown } from "./shortcuts";
import { DEFAULT_CLASS_PREFIX, styleHref, viewportCss } from "./styles";
import { keepFocusOffButtons } from "./ToolButton";
import {
  NO_EXTENT, allOutside, boundsOfRects, insideExtent, panExtentOf, sameExtent, visibleRect, type FlowRect, type PanExtent,
} from "./viewport-guard";

/** 경계 상자·캔버스 크기가 바뀐 뒤 화면을 한계 안으로 맞추기까지 기다리는 시간(ms). */
export const RECHECK_MS = 400;
/** 화면 밖 상태가 이만큼(ms) 이어지면 안내를 띄운다. */
export const LOST_DELAY_MS = 300;

const NO_TYPES: readonly string[] = [];
const NO_IGNORE: ReadonlySet<string> = new Set();

/** 숨기지 않고 크기를 잰 노드의 사각형(흐름 좌표). ignore 형식은 뺀다. */
function nodeRects(s: ReactFlowState, ignore: ReadonlySet<string>): FlowRect[] {
  const out: FlowRect[] = [];
  for (const n of s.nodeLookup.values()) {
    if (n.hidden || (n.type !== undefined && ignore.has(n.type))) continue;
    const w = n.measured?.width ?? n.width ?? 0;
    const h = n.measured?.height ?? n.height ?? 0;
    if (!(w > 0) || !(h > 0)) continue;
    const pos = n.internals.positionAbsolute;
    out.push({ x: pos.x, y: pos.y, w, h });
  }
  return out;
}

const selectExtent = (s: ReactFlowState): PanExtent | null =>
  panExtentOf(boundsOfRects(nodeRects(s, NO_IGNORE)), s.width, s.height, s.transform[2]);
/** 경계 상자·캔버스 크기 열쇠(배율·화면 이동에는 바뀌지 않는다). 모르면 "". */
const selectGeometry = (s: ReactFlowState): string => {
  const b = boundsOfRects(nodeRects(s, NO_IGNORE));
  return b && s.width > 0 && s.height > 0 ? `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}|${s.width}x${s.height}` : "";
};
/** 노드 끌기·화면 끌기·영역 선택 중 — 이때는 화면을 맞추지 않는다. */
const selectBusy = (s: ReactFlowState): boolean => {
  if (s.paneDragging || s.userSelectionActive) return true;
  for (const n of s.nodeLookup.values()) if (n.dragging) return true;
  return false;
};

/** 지금 화면이 이동 한계 밖이면 한계 안으로 한 번 맞춘다. 캔버스가 숨어 있으면(display:none 탭) 건너뛴다. */
function recheck(s: ReactFlowState): void {
  if (!isShown(s.domNode)) return;
  const extent = selectExtent(s);
  if (!extent || insideExtent(visibleRect(s.transform, s.width, s.height), extent)) return;
  const [x, y, zoom] = s.transform;
  void s.panZoom?.setViewportConstrained({ x, y, zoom }, [[0, 0], [s.width, s.height]], extent);
}

export interface ViewportGuardProps {
  /** [전체 보기] — 화면 맞춤. */
  onFit: () => void;
  /** 안내에 적을 화면 맞춤 단축키 글(플랫폼별). */
  fitKeyLabel: string;
  /** 화면 밖 판정에서 뺄 노드 형식(그룹 틀 등). 기본 없음. 이동 한계에는 넣는다. */
  ignoreNodeTypes?: readonly string[];
  /** 안내 글(기본 "화면에 보이는 요소가 없습니다."). */
  lostText?: string;
  /** 단추 글(기본 "전체 보기"). */
  fitText?: string;
  /** 안내 틀 data-testid(기본 "flow-lost"). 단추는 `${testId}-fit`. */
  testId?: string;
  /** 안내 상자에 붙일 React Flow 예외 클래스(기본 "nopan nodrag nowheel"). ReactFlow 의 noPanClassName 등을 바꿨으면 같이 바꾼다. */
  flowExemptClassName?: string;
  /** 클래스 접두(기본 "rfx"). */
  classPrefix?: string;
}

export function ViewportGuard({
  onFit, fitKeyLabel, ignoreNodeTypes = NO_TYPES, lostText = "화면에 보이는 요소가 없습니다.", fitText = "전체 보기",
  testId = "flow-lost", flowExemptClassName = "nopan nodrag nowheel", classPrefix = DEFAULT_CLASS_PREFIX,
}: ViewportGuardProps) {
  const store = useStoreApi();
  const ignoreKey = ignoreNodeTypes.join("\n");
  const ignore = useMemo<ReadonlySet<string>>(() => (ignoreKey === "" ? NO_IGNORE : new Set(ignoreKey.split("\n"))), [ignoreKey]);
  const selectLost = useCallback(
    (s: ReactFlowState) => allOutside(nodeRects(s, ignore), visibleRect(s.transform, s.width, s.height)),
    [ignore],
  );
  const extent = useStore(selectExtent, sameExtent);
  const lost = useStore(selectLost);
  const geometry = useStore(selectGeometry);
  const busy = useStore(selectBusy);
  const [showLost, setShowLost] = useState(false);
  useEffect(() => {
    if (!lost) {
      setShowLost(false);
      return;
    }
    const t = setTimeout(() => setShowLost(true), LOST_DELAY_MS);
    return () => clearTimeout(t);
  }, [lost]);

  useEffect(() => {
    store.getState().setTranslateExtent(extent ?? NO_EXTENT);
  }, [store, extent]);
  useEffect(() => {
    if (!geometry || busy) return;
    const t = setTimeout(() => recheck(store.getState()), RECHECK_MS);
    return () => clearTimeout(t);
  }, [store, geometry, busy]);
  // 캔버스를 내릴 때 한계를 풀어 둔다(같은 저장소를 다시 쓰는 경우 대비).
  useEffect(() => () => store.getState().setTranslateExtent(NO_EXTENT), [store]);

  const p = classPrefix;
  return (
    <>
      <style href={styleHref("viewport", p)} precedence="default">
        {viewportCss(p)}
      </style>
      {lost && showLost ? (
        <div className={`${p}-lost`} data-testid={testId}>
          <div className={`${p}-lost-card ${flowExemptClassName}`} role="status">
            <span>{lostText}</span>
            <button type="button" className={`${p}-lost-btn`} data-testid={`${testId}-fit`} onMouseDown={keepFocusOffButtons} onClick={onFit}>
              {fitText} <kbd>{fitKeyLabel}</kbd>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 10: 배럴 `index.ts`**

xyflow 도 `type Box` 를 내보내므로 snap 의 `Box` 는 `SnapBox` 로 내보낸다(명시 export 가 `export *` 를 가려 xyflow 의 `Box` 뜻이 바뀌지 않게 한다). 루트 `src/index.ts` 에는 넣지 않는다(루트 import 가 React Flow 와 스타일시트를 끌어오지 않게).

```ts
export * from "./react-flow";
export {
  AUTO_ROUTE_OFFSET, ROUTE_GUIDE_OVERHANG, ROUTE_RADIUS, ROUTE_STUB, SEGMENT_CLEAR_PX, SEGMENT_MIN_PX, SEGMENT_SNAP_PX,
  autoRoute, finishRoute, insertRoutePoint, isClear, moveSegment, roundPoint, routeMidpoint, routePath, segmentAxis, segmentHandles,
  simplifyRoute, smoothStepPoints, snapRoutePoint, snapSegmentDelta,
} from "./route-path";
export type { FlowPos, RoutePointGuide, SegmentAxis, SegmentHandle, Side, SmoothStepInput } from "./route-path";
export { SNAP_THRESHOLD_PX, boundsOf, snapHitIn, snapIndex, snapMove, snapMoveIn, snapThreshold } from "./snap";
export type { Box as SnapBox, Guide, GuideAxis, SnapHit, SnapIndex, SnapResult } from "./snap";
export { SnapGuideStyle } from "./SnapGuideStyle";
export { KEEP_VISIBLE_PX, NO_EXTENT, allOutside, boundsOfRects, insideExtent, panExtentOf, sameExtent, visibleRect } from "./viewport-guard";
export type { FlowRect, PanExtent } from "./viewport-guard";
export { LOST_DELAY_MS, RECHECK_MS, ViewportGuard } from "./ViewportGuard";
export type { ViewportGuardProps } from "./ViewportGuard";
export { ContextMenu } from "./ContextMenu";
export type { ContextMenuProps } from "./ContextMenu";
export type { MenuItem, MenuSwatch } from "./context-menu";
export { CANVAS_SHORTCUTS, UNHANDLED, dispatchShortcut, isMacPlatform, isShown, isTypingTarget, shortcutOf } from "./shortcuts";
export type { CanvasShortcutId, KeyLike, ShortcutBinding, ShortcutHandlers, ShortcutHelpRow } from "./shortcuts";
export { DEFAULT_FIND_OPTIONS, INVALID_FIND, compileFind, escapeRegExp } from "./find";
export type { FindMatcher, FindOptions, FindState } from "./find";
export { FIND_NO_RESULT, FindWidget, findCountText } from "./FindWidget";
export type { FindWidgetProps } from "./FindWidget";
export { ToolButton, keepFocusOffButtons } from "./ToolButton";
export type { ToolButtonProps } from "./ToolButton";
export { DEFAULT_CLASS_PREFIX } from "./styles";
```

- [ ] **Step 11: 시험 통과 확인**

Run(`src/frontend`): `pnpm --filter @dk-oasis/shared exec vitest run tests/unit/react-flow-`
Expected: 6개 파일 PASS, 실패 0. 옮긴 파일은 원본에서 뺀 시험만 빠진다(snap `it` 20 — 원본 21, route-segment `it` 20 + `it.each` 2 — 원본 `it` 21, viewport-guard `it` 12 — 원본과 같다).

- [ ] **Step 12: 노출 — tsup·exports, 빌드와 번들 확인**

`src/frontend/shared/tsup.config.ts` 의 `entry` 에서 `"json-view"` 줄 뒤에 한 줄:

```diff
     "json-view": "src/components/json-view/index.ts",
+    "react-flow": "src/components/react-flow/index.ts",
```

`src/frontend/shared/package.json` 의 `exports` 에서 `"./json-view"` 항목 뒤에:

```diff
+    "./react-flow": {
+      "types": "./dist/types/components/react-flow/index.d.ts",
+      "import": "./dist/react-flow.js"
+    },
```

`external` 배열은 고치지 않는다. tsup 이 `dependencies` 의 `@xyflow/react`(하위 경로 `dist/style.css` 포함)를 스스로 밖에 둔다.

```bash
pnpm --filter @dk-oasis/shared build
grep -c '"@xyflow/react"' shared/dist/react-flow.js
grep -c '@xyflow/react/dist/style.css' shared/dist/react-flow.js
ls shared/dist/react-flow.css
ls shared/dist/types/components/react-flow/index.d.ts
wc -c shared/dist/react-flow.js
pnpm --filter @dk-oasis/shared lint
pnpm --filter @dk-oasis/shared test:unit
```

Expected:
- build 성공(`.d.ts` 단계 포함 — `TSUP_DTS=0` 을 주지 않는다).
- 두 `grep -c` 가 `1` 이상(xyflow 를 번들에 넣지 않고 import 를 남겼다). `ls …react-flow.css` 는 `No such file or directory`.
- `index.d.ts` 가 있고, `react-flow.js` 는 100KB 미만이다(xyflow 를 넣었다면 수백 KB 다).
- `grep -c` 가 `0` 이거나 `react-flow.css` 가 생겼으면 tsup 이 xyflow 를 번들에 넣은 것이다. `tsup.config.ts` 의 `external` 배열 끝에 `"@xyflow/react", /^@xyflow\/react\//` 를 더하고 다시 빌드해 같은 확인을 한다.
- lint 오류 0. `test:unit` 전체 PASS — `package-exports.unit.test.ts` 의 "진입점 react-flow 의 exports …" 가 함께 통과한다.

- [ ] **Step 13: 문서 — Part B 표, 스킬 문서, 색인**

`docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md` §1 표에서 `json-view` 행 뒤에:

```markdown
| `@dk-oasis/shared/react-flow`                 | SHOULD                 | React Flow 캔버스 공통 부품(진입점·선 경로·스냅·화면 길잡이·우클릭 메뉴·단축키·찾기 위젯) | §18              |
```

`.claude/skills/mantine-aggrid-ui/SKILL.md` "업무 상황 → 컴포넌트" 표의 `json-view` 행 뒤에:

```markdown
| 노드·선을 그리는 캔버스 화면(React Flow) | `react-flow`: `@xyflow/react` 전부 + 선 경로(`routePath`·`smoothStepPoints`)·스냅·`ViewportGuard`·`ContextMenu`·`shortcutOf`/`dispatchShortcut`·`FindWidget`. `@xyflow/react` 를 직접 import 하지 않는다 |
```

`.claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs`:

```diff
   ['떠 있는 창 — 비모달 (`@dk-oasis/shared/floating-panel`)', ['floating-panel']],
+  ['React Flow 캔버스 (`@dk-oasis/shared/react-flow`)', ['react-flow']],
   ['MDM 화면 메타 (`@dk-oasis/shared/mdm-meta`)', ['mdm-meta']],
```

```diff
   'components/json-view/index.ts',
+  'components/react-flow/index.ts',
   'components/code-editor/index.ts',
```

`.claude/skills/mantine-aggrid-ui/references/components/react-flow.md` 를 만든다. `coverage` 는 `index.ts` 의 이름 있는 값 export 가 문서에 단어로 모두 나오는지 본다(`export *` 는 보지 않는다). 그래서 아래 "내보내는 것" 표에 모든 값 이름을 적는다.

````markdown
# React Flow 캔버스 부품

노드·선을 그리는 캔버스 화면(React Flow)에서 업무와 무관한 부품을 함께 쓸 때 쓴다. `@xyflow/react` 전부와 선 경로 계산·끌기 스냅·화면 길잡이·우클릭 메뉴·단축키 판정·찾기 위젯을 한 서브패스로 준다.

- import: `import { ReactFlow, ReactFlowProvider, ViewportGuard, ContextMenu, FindWidget, shortcutOf, CANVAS_SHORTCUTS } from "@dk-oasis/shared/react-flow";` (CSS import 없음 — xyflow 스타일시트는 이 서브패스가 불러오고, 부품은 자기 `<style>` 을 넣는다)
- 소스: `src/frontend/shared/src/components/react-flow/` (`index.ts` 배럴)
- 내부 구현: 룰 세트 편집기(`m-mdm/pages/dme/ruleSetEdit/canvas/`) 부품의 복사본이다. 합치기는 `docs/erd-tool/deferred.md` 15번. 의존성 `@xyflow/react` 12.12.0·`@dagrejs/dagre` 3.1.1(shared `dependencies`).
- Part B 허용 목록(§1): `react-flow` SHOULD.

## 언제 쓰나

- 쓴다: ERD·흐름도처럼 노드를 놓고 선으로 잇는 캔버스 화면. 화면은 `@xyflow/react` 를 직접 import 하지 않고 이 서브패스에서 가져온다.
- 쓰지 않는다: 표·트리 → [AgDataGrid](ag-data-grid.md)·[Tree](tree.md). 업무 모델을 아는 노드·선 그리기(표 노드, 관계선 등)는 화면 폴더에 둔다(Part B §18-1).
- 클래스 접두는 기본 `rfx`(`DEFAULT_CLASS_PREFIX`)다. 한 화면에서 같은 접두를 쓴다. 접두를 바꾸면 `<style href>` 도 따로 들어간다.

## 표준 사용

```tsx
import { useRef, useState } from "react";
import {
  CANVAS_SHORTCUTS, ContextMenu, FindWidget, ReactFlow, ReactFlowProvider, ViewportGuard, dispatchShortcut, isMacPlatform,
  type FindState, type MenuItem,
} from "@dk-oasis/shared/react-flow";

export function Canvas({ find, onFit }: { find: FindState; onFit(): void }) {
  const mac = isMacPlatform();
  const inputRef = useRef<HTMLInputElement>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[] } | null>(null);
  return (
    <div
      tabIndex={0}
      style={{ position: "relative", height: "100%" }}
      onKeyDown={(e) => dispatchShortcut(e, { find: () => setFindOpen(true), fitView: onFit }, mac, CANVAS_SHORTCUTS)}
    >
      <ReactFlowProvider>
        <ReactFlow nodes={[]} edges={[]} onPaneContextMenu={(e) => setMenu({ at: { x: e.clientX, y: e.clientY }, items: [{ id: "fit", label: "전체 보기", run: onFit }] })}>
          <ViewportGuard onFit={onFit} fitKeyLabel={mac ? "⇧1" : "Shift+1"} testId="erd-lost" />
        </ReactFlow>
      </ReactFlowProvider>
      {findOpen ? <FindWidget find={find} inputRef={inputRef} focusSeq={0} mac={mac} onClose={() => setFindOpen(false)} testId="erd-find" /> : null}
      <ContextMenu items={menu?.items ?? []} at={menu?.at ?? null} onClose={() => setMenu(null)} testId="erd-menu" />
    </div>
  );
}
```

## 내보내는 것

| 묶음 | 이름 |
|---|---|
| React Flow | `@xyflow/react` 의 모든 export(`ReactFlow`, `useStore`, `Position` …). xyflow 의 `Box` 는 그대로 xyflow 뜻이다 |
| 선 경로(순수) | `routePath`, `routeMidpoint`, `insertRoutePoint`, `smoothStepPoints`, `autoRoute`, `finishRoute`, `simplifyRoute`, `roundPoint`, `segmentAxis`, `segmentHandles`, `isClear`, `moveSegment`, `snapRoutePoint`, `snapSegmentDelta`, 상수 `ROUTE_RADIUS`, `AUTO_ROUTE_OFFSET`, `ROUTE_STUB`, `SEGMENT_MIN_PX`, `SEGMENT_CLEAR_PX`, `SEGMENT_SNAP_PX`, `ROUTE_GUIDE_OVERHANG`, 형 `FlowPos`, `Side`, `SmoothStepInput`, `SegmentAxis`, `SegmentHandle`, `RoutePointGuide` |
| 끌기 스냅(순수) | `snapIndex`, `snapHitIn`, `snapMoveIn`, `snapMove`, `snapThreshold`, `boundsOf`, `SNAP_THRESHOLD_PX`, 형 `SnapBox`(xyflow `Box` 와 겹쳐 이름을 바꿨다), `Guide`, `GuideAxis`, `SnapResult`, `SnapIndex`, `SnapHit`. 안내선 규칙은 `SnapGuideStyle` |
| 화면 길잡이 | `ViewportGuard`, `RECHECK_MS`(400), `LOST_DELAY_MS`(300), 계산 `boundsOfRects`, `panExtentOf`, `sameExtent`, `visibleRect`, `insideExtent`, `allOutside`, `KEEP_VISIBLE_PX`(80), `NO_EXTENT` |
| 우클릭 메뉴 | `ContextMenu`, 형 `MenuItem`, `MenuSwatch` |
| 단축키 | `shortcutOf`, `dispatchShortcut`, `UNHANDLED`, `CANVAS_SHORTCUTS`, `isMacPlatform`, `isTypingTarget`, `isShown`, 형 `KeyLike`, `ShortcutBinding`, `ShortcutHandlers`, `ShortcutHelpRow`, `CanvasShortcutId` |
| 찾기 | `FindWidget`, `findCountText`, `FIND_NO_RESULT`, `compileFind`, `escapeRegExp`, `INVALID_FIND`, `DEFAULT_FIND_OPTIONS`, 형 `FindOptions`, `FindState`, `FindMatcher` |
| 단추·공통 | `ToolButton`(26×26 아이콘 단추 + CSS 툴팁), `keepFocusOffButtons`(단추 mousedown 초점 이동 막기), `DEFAULT_CLASS_PREFIX` |

## Props

`ViewportGuard` — ReactFlow 의 자식으로 둔다.

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `onFit` | `() => void` | — | [전체 보기] 단추 |
| `fitKeyLabel` | `string` | — | 단추 옆에 적을 화면 맞춤 단축키 글 |
| `ignoreNodeTypes` | `readonly string[]` | `[]` | 화면 밖 판정에서 뺄 노드 형식(그룹 틀 등) |
| `lostText` | `string` | `"화면에 보이는 요소가 없습니다."` | 안내 글 |
| `fitText` | `string` | `"전체 보기"` | 단추 글 |
| `testId` | `string` | `"flow-lost"` | 안내 틀. 단추는 `<testId>-fit` |
| `flowExemptClassName` | `string` | `"nopan nodrag nowheel"` | 안내 상자의 React Flow 예외 클래스 |
| `classPrefix` | `string` | `"rfx"` | 클래스 접두 |

`ContextMenu` — `items: MenuItem[]`, `at: {x, y} | null`(null 이면 닫힘), `onClose()`, `testId`(기본 `"flow-menu"`, 항목 `<testId>-item-<id>`, 견본 `<testId>-swatch-<id>`), `classPrefix`. `MenuSwatch.color`·`borderColor` 는 CSS 색 값(`var(--color-…)`)이고 `MenuItem.icon` 은 `ReactNode` 다(견본 항목 단추에 그린다).

`FindWidget` — `find: FindState`(화면의 찾기 훅이 만든다. 일치 판정은 `compileFind`), `inputRef`, `focusSeq`(올리면 입력 칸 초점·전체 선택), `onClose()`, `mac`, `testId`(기본 `"flow-find"` — 입력 칸. 위젯 `-widget`, 옵션 `-case`·`-word`·`-regex`, 건수 `-count`, 단추 `-prev`·`-next`·`-close`), `label`(기본 `"찾기"`), `inputLabel`(기본 `"찾을 글"`), `placeholder`(기본 `"찾기"`), `noResultText`(기본 `"결과 없음"`), `classPrefix`.

`shortcutOf(e, mac, bindings)` · `dispatchShortcut(e, handlers, mac, bindings)` — `bindings` 는 `ShortcutBinding<Id>[]`(`key` 또는 `code`, `mod`·`shift`·`alt`). 앞에 있는 묶음이 먼저 맞는다. 입력 칸이면 무시하고, Alt 조합은 `code` 로만 보며 Ctrl·Meta 가 함께면(AltGr) 무시한다. 손잡이가 `UNHANDLED` 를 돌려주면 막지 않는다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 화면에서 `@xyflow/react` 를 직접 import | `@dk-oasis/shared/react-flow` 에서 가져온다. 스타일시트도 여기서 한 번 불러온다 |
| 화면에 `.css` 를 만들어 메뉴·찾기 위젯 모양을 덮음 | 화면 노드·선 규칙은 화면이 `<style href precedence>` 로 넣는다(Local-Rules §17). 부품 모양을 바꿔야 하면 shared 를 고친다(승인 뒤) |
| `import { Box } from "@dk-oasis/shared/react-flow"` 로 스냅 상자를 기대함 | 스냅 상자는 `SnapBox` 다. `Box` 는 xyflow 형식이다 |
| 단축키 표를 화면마다 처음부터 씀 | `[...CANVAS_SHORTCUTS, …화면 전용]` 로 잇는다 |
````

```bash
node ../../.claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs index --write
node ../../.claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs full --write
node ../../.claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs coverage
```

Expected: 마지막 줄 `coverage 통과`. `미등재 export: …` 가 나오면 그 이름을 "내보내는 것" 표에 더하고 다시 돈다.

- [ ] **Step 14: 룰 세트 편집기를 건드리지 않았는지 확인**

```bash
/usr/bin/git status --short -- m-mdm
pnpm --filter "@dk-oasis/m-mdm^..." build
pnpm --filter @dk-oasis/m-mdm lint
pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dme/ruleSetEdit/snap.test.ts tests/dme/ruleSetEdit/route-segment.test.ts tests/dme/ruleSetEdit/viewport-guard.test.ts tests/dme/ruleSetEdit/shortcuts.test.ts tests/dme/ruleSetEdit/context-menu.test.ts tests/dme/ruleSetEdit/find-widget.test.ts
```

Expected: `git status` 출력 없음(m-mdm 은 한 파일도 바뀌지 않았다). build·lint 성공. 원본 6개 시험 PASS.

- [ ] **Step 15: 커밋**

```bash
/usr/bin/git add shared/package.json shared/tsup.config.ts shared/tests/setup.ts shared/src/components/react-flow shared/tests/unit/react-flow-*.unit.test.ts pnpm-lock.yaml
/usr/bin/git add ../../docs/guide/FrontEnd/standard-v2/part-b-shared-policy.md ../../.claude/skills/mantine-aggrid-ui/SKILL.md ../../.claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs ../../.claude/skills/mantine-aggrid-ui/references/components/react-flow.md ../../.claude/skills/mantine-aggrid-ui/references/components/llms.txt ../../.claude/skills/mantine-aggrid-ui/references/components/llms-full.txt
/usr/bin/git commit -m "feat(shared): React Flow 캔버스 공통 부품 react-flow 서브패스 — 룰 세트 편집기 부품 복사

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r"
```

- [ ] **Step 16: 실패하는 시험 — 포털 SSE 타이머(S15)**

`src/frontend/m-mcm/tests/http/be-proxy.test.ts` 의 `describe("backendTimeoutMs")` 마지막 `it` 뒤에 두 건을 넣는다.

```ts
  it("ERD SSE(GET …/erd/stream/{모델})는 24시간 — setTimeout 상한(2^31-1ms) 안의 유한값", () => {
    const ms = backendTimeoutMs("GET", "/api/mdm/erd/stream/mcm");
    expect(ms).toBe(24 * 60 * MIN);
    expect(Number.isFinite(ms)).toBe(true);
    expect(ms).toBeLessThanOrEqual(2 ** 31 - 1); // 넘으면 Node 가 1ms 로 줄여 바로 끊는다
  });

  it("ERD 스트림 경로라도 GET 이 아니거나 비슷한 이름이면 기본 2분", () => {
    expect(backendTimeoutMs("POST", "/api/mdm/erd/stream/mcm")).toBe(2 * MIN);
    expect(backendTimeoutMs("GET", "/api/mdm/erd/streams/mcm")).toBe(2 * MIN);
    expect(backendTimeoutMs("GET", "/api/mdm/erd/stream")).toBe(2 * MIN);
  });
```

`describe("forwardToBackend")` 마지막 `it` 뒤에 한 건을 넣는다. 응답 스트림이 열린 채로 3분이 지나도 BE 요청이 끊기지 않는지를 가짜 시계로 본다.

```ts
  it("ERD SSE 는 응답 스트림이 열린 채 3분이 지나도 BE 요청을 끊지 않고, 24시간에 끊는다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let signal: AbortSignal | null | undefined;
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
        signal = init.signal;
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('event: hello\ndata: {"rev":3}\n\n'));
          },
        });
        return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
      });
      const req = new NextRequest("http://bff.test/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/mcm?session=s1&source=UI");
      const res = await forwardToBackend(req, "mdm", "/api/mdm/erd/stream/mcm");
      expect(res.headers.get("content-type")).toBe("text/event-stream");
      vi.advanceTimersByTime(3 * 60 * 1000);
      expect(signal!.aborted).toBe(false);
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      expect(signal!.aborted).toBe(true);
      await res.body?.cancel();
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 17: 시험이 실패하는지 확인**

Run(`src/frontend`): `pnpm --filter @dk-oasis/m-mcm exec vitest run tests/http/be-proxy.test.ts`
Expected: 2건 FAIL — `expected 120000 to be 86400000`, `expected true to be false`(2분 타이머가 이미 끊었다). 나머지는 PASS.

- [ ] **Step 18: 구현 — `backendTimeoutMs` 에 ERD SSE 분기**

`src/frontend/m-mcm/lib/http/be-proxy.ts`:

```diff
 /** 미디어 위젯 파일 내려받기(GET·HEAD) — 동영상 구간 스트림. */
 const MEDIA_FILE_PATH = /\/widgetMedia\/file\//;
+/** ERD 실시간 반영 SSE(GET, 단계 1 S15) — 화면을 연 동안 이어지는 스트림. */
+const ERD_STREAM_PATH = /\/erd\/stream\/[^/]+$/;
+/**
+ * SSE 타이머 상한 24시간. 타이머는 응답 스트림이 끝날 때까지 돈다. Node setTimeout 은 2^31-1ms(약 24.8일)를 넘는 값(Infinity 포함)을
+ * 1ms 로 줄여 바로 끊으므로 유한값을 쓴다. 24시간에 끊기면 화면이 sinceRev 로 다시 붙는다.
+ */
+const STREAM_TIMEOUT_MS = 24 * 60 * 60 * 1000;
 
 export function backendTimeoutMs(method: string, backendPath: string): number {
+  if (method === "GET" && ERD_STREAM_PATH.test(backendPath)) {
+    return STREAM_TIMEOUT_MS;
+  }
   if (
     /(?:\/export(?:\/|$)|\/download(?:\/|$))/.test(backendPath)
   ) {
```

`forwardToBackend` 의 주석 줄 "일반 JSON은 2분, export/download·미디어 올리기/내려받기는 5분, 실제 장기 실행 mutation만 30분을 허용한다." 끝에 ", ERD SSE 는 24시간" 을 더한다.

- [ ] **Step 19: 시험 통과 확인**

```bash
pnpm --filter @dk-oasis/m-mcm exec vitest run tests/http/be-proxy.test.ts
pnpm --filter @dk-oasis/m-mcm test
```

Expected: be-proxy 전부 PASS. m-mcm 전체 PASS(실패 0).

- [ ] **Step 20: 커밋**

```bash
/usr/bin/git add m-mcm/lib/http/be-proxy.ts m-mcm/tests/http/be-proxy.test.ts
/usr/bin/git commit -m "fix(m-mcm): ERD SSE 는 BFF 타이머를 24시간으로 — 2분에 끊기지 않게

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r"
```

## 계획 작성자 메모

- 스타일 토큰: 원본 CSS 의 `--radius-*`·`--shadow-dropdown` 은 그대로 둔다. 숫자로 바꾸면 그림자 rgba 색이 글자로 들어가 §8 에 어긋난다. shared `JsonView` 도 `--radius-sm` 을 쓴다. 브리프의 "색·간격·글자 크기 토큰만" 을 "색은 토큰만" 으로 읽었다.
- 단축키 API 를 묶음 표로 바꿨다: `shortcutOf(e, mac, bindings)`, `dispatchShortcut(e, handlers, mac, bindings)`(원본은 2·3인자). Task 8·9(04 파일)는 `[...CANVAS_SHORTCUTS, …]` 로 불러야 한다. 04 와 맞는지 조정자가 확인해야 한다.
- snap 의 `Box` 는 배럴에서 `SnapBox` 로 내보낸다. xyflow 의 `type Box` 와 이름이 겹친다. 04 가 `Box` 를 쓰면 `SnapBox` 로 바꿔야 한다.
- Part B §18-3(3) 은 화면 패키지에 같은 라이브러리를 두지 말라고 한다. README S12 를 따라 m-mdm 의 `@xyflow/react`·`@dagrejs/dagre` 를 남긴다. 한 벌인지는 `pnpm why` 와 realpath 로 확인한다.
- shared 의존 버전은 정확한 버전(`12.12.0`, `3.1.1`)이다. m-mdm 은 `^` 범위다. 지금 잠금 파일에서는 같은 설치본으로 풀린다.
- `@dagrejs/dagre` 는 이 Task 에서 쓰지 않는다(S12 대로 넣기만 한다. 자동 배치는 단계 2).
- 클래스 접두 기본값은 `rfx` 다. 원본 `rsf` 를 쓰면 포털 한 문서 안에서 룰 세트 편집기 규칙(색 견본 등)과 서로 덮는다.
- 기본 문구를 중립으로 바꿨다: ViewportGuard 안내 "화면에 보이는 요소가 없습니다."·단추 "전체 보기", FindWidget 입력 칸 aria-label "찾을 글". testId 기본값(`flow-*`)은 원본과 같다.
- find-widget 원본 시험은 룰 세트 화면 전체를 띄우는 시험이라 옮기지 못했다. 같은 단언을 위젯 단위 새 시험으로 썼다. context-menu 는 `ContextMenu` 4건만 옮겼다(`buildMenu` 등은 업무 코드).
- 문서가 약 1,730줄로 브리프의 상한(700줄)을 넘는다. 고쳐 쓴 부품 7개와 새 시험 3개의 전체 코드를 실었다. 그대로 복사하는 파일(route-path·snap·viewport-guard·시험 3개)은 cp·perl 명령으로 줄였다. Task 를 나누지는 않았다.
- be-proxy 정규식은 `/\/erd\/stream\/[^/]+$/` 다(모델 ID 한 조각만 받는다). README S15·조사 시트(C-frontend §5-3)의 `/\/erd\/stream\//` 보다 좁아 `/erd/stream/x/y` 는 2분이다.
