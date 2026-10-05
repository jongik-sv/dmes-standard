/** @vitest-environment happy-dom */
/**
 * 정시 수집 렌더러 구조 시험 — shared 의 KpiTile·KpiTileGroup 을 실물로 그려 「다른 KPI 위젯과 똑같이」 쓰는지 본다(감싸기 회귀 방지).
 * 서버 호출 훅·차트·본문 크기 훅만 대역이다. 진짜 shared(dist)를 쓴다(_query/editors-mdm-meta.test.ts 와 같은 설정). JSX 없이 createElement 로 쓴다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { collectDataOf } from "./format";

const h = vi.hoisted(() => ({ useCollectData: vi.fn() }));
vi.mock("./useCollectData", () => ({ useCollectData: h.useCollectData }));
vi.mock("@dk-oasis/shared/widget", () => ({ useWidgetBodySize: () => ({ width: 400, height: 400 }) }));
vi.mock("@dk-oasis/shared/charts", async () => {
  const { createElement: el } = await import("react");
  return { LineChart: () => el("div", { "data-testid": "line" }) };
});

const { default: CollectRenderer } = await import("./renderer");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const row = (at: string, key: string, value: unknown) => ({ COLLECTED_AT: at, ITEM_KEY: key, VALUE: value });
const LONG = "아주 긴 상태 글자 값이 위젯 폭을 넘어서 줄바꿈이나 가로 넘침을 만들 수 있는 경우";

async function render() {
  h.useCollectData.mockReturnValue(
    collectDataOf({
      rows: [
        row("2026-10-05T09:00:00", "생산량", 1000),
        row("2026-10-05T09:00:00", "상태", "정상"),
        row("2026-10-05T09:10:00", "생산량", 1030),
        row("2026-10-05T09:10:00", "상태", LONG),
      ],
    })
  );
  const props = { instanceId: "i", widgetId: "def.c1234567", definition: { show: { unit: "건" } }, refreshKey: 0, title: "t", size: { w: 8, h: 8 }, config: null };
  await act(async () => {
    root.render(createElement(CollectRenderer, props as never));
  });
}

describe("정시 수집 — 실제 KpiTile·KpiTileGroup 구조", () => {
  it("타일 묶음의 자식은 KpiTile(.cm-kpi) 그대로이고 단추로 감싸지 않는다", async () => {
    await render();
    const group = container.querySelector<HTMLElement>('[data-testid="wc-tiles"]')!;
    expect(group.className).toBe("cm-kpi-group");
    const kids = [...group.children].filter((c) => c.tagName !== "STYLE");
    expect(kids).toHaveLength(2);
    for (const kid of kids) expect(kid.classList.contains("cm-kpi")).toBe(true);
    expect(group.querySelector("button")).toBeNull();
  });

  it("증감은 KpiTile 기본(neutral) 색 — 화면이 방향 색 클래스를 덮지 않는다", async () => {
    await render();
    const delta = container.querySelector<HTMLElement>('[data-testid="wc-tile-생산량"] .cm-kpi__delta')!;
    expect(delta.textContent).toBe("▲ 30 (+3.0%)");
    expect(delta.getAttribute("data-tone")).toBe("neutral");
    expect(container.querySelector('[class*="wc-delta"]')).toBeNull();
  });

  it("항목 선택 단추는 타일 묶음 밖의 별도 줄에 있고 선택은 aria-pressed", async () => {
    await render();
    const picks = container.querySelector<HTMLElement>('[data-testid="wc-picks"]')!;
    expect(picks.closest(".cm-kpi-group")).toBeNull();
    expect([...picks.querySelectorAll("button")].map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["생산량", "true"],
      ["상태", "false"],
    ]);
    await act(async () => picks.querySelectorAll("button")[1].click());
    expect([...picks.querySelectorAll("button")].map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("긴 글자 값은 말줄임 칸에 담고 전체 글자를 title 로 준다(숫자 값은 그대로)", async () => {
    await render();
    const text = container.querySelector<HTMLElement>('[data-testid="wc-tile-상태"] .wc__text')!;
    expect(text.textContent).toBe(LONG);
    expect(text.getAttribute("title")).toBe(LONG);
    expect(container.querySelector('[data-testid="wc-tile-생산량"] .wc__text')).toBeNull();
    expect(container.querySelector('[data-testid="wc-tile-생산량"] .cm-kpi__value')!.textContent).toContain("1,030");
  });
});
