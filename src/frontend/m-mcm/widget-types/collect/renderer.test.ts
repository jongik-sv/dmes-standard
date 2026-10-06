/** @vitest-environment happy-dom */
/**
 * 자동 수집 렌더러 동작 시험 — 타일·선택·추이 차트·값 없음·최근 수집 실패·저장 전 안내.
 * useCollectData(서버 호출)와 shared 의 차트·타일·본문 크기 훅은 대역이다. 변환·서식(./format)·설정 읽기(./config)는 실물이다.
 * JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { collectDataOf, type CollectData } from "./format";

interface LineProps {
  data: { label: string; value: number }[];
  height?: number;
  yLabel?: string;
}

const h = vi.hoisted(() => ({
  useCollectData: vi.fn(),
  line: { current: null as LineProps | null },
}));

vi.mock("./useCollectData", () => ({ useCollectData: h.useCollectData }));
vi.mock("@dk-oasis/shared/widget", () => ({ useWidgetBodySize: () => ({ width: 400, height: 400 }) }));
vi.mock("@dk-oasis/shared/charts", async () => {
  const { createElement: el } = await import("react");
  return {
    LineChart: (p: LineProps) => {
      h.line.current = p;
      return el("div", { "data-testid": "line" });
    },
  };
});
vi.mock("@dk-oasis/shared/dashboard", async () => {
  const { createElement: el } = await import("react");
  return {
    KpiTileGroup: (p: { children?: unknown; testId?: string }) => el("div", { "data-testid": p.testId }, p.children as never),
    KpiTile: (p: { label: string; value: unknown; unit?: string; delta?: unknown; target?: string; testId?: string }) =>
      el("div", { "data-testid": p.testId }, [
        el("b", { key: "l" }, p.label),
        el("i", { key: "v", "data-role": "value" }, p.value as never, p.unit ? ` ${p.unit}` : null),
        el("span", { key: "d", "data-role": "delta" }, p.delta as never),
        el("em", { key: "t", "data-role": "target" }, p.target),
      ]),
  };
});

const { default: CollectRenderer } = await import("./renderer");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.useCollectData.mockReset();
  h.line.current = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const must = (id: string) => {
  const el = q(id);
  if (!el) throw new Error(`[data-testid="${id}"] 가 없습니다. 지금 화면: ${container.innerHTML.slice(0, 400)}`);
  return el;
};

const row = (at: string, key: string, value: unknown) => ({ COLLECTED_AT: at, ITEM_KEY: key, VALUE: value });
const data = (rows: unknown[], extra: Record<string, unknown> = {}): CollectData => collectDataOf({ rows, ...extra });

const sample = () =>
  data([
    row("2026-10-05T09:00:00", "상태", "정상"),
    row("2026-10-05T09:00:00", "생산량", 1000),
    row("2026-10-05T09:10:00", "상태", "점검"),
    row("2026-10-05T09:10:00", "생산량", 1030),
  ]);

async function render(d: CollectData | null, over: { widgetId?: string; definition?: unknown } = {}) {
  h.useCollectData.mockReturnValue(d);
  const props = {
    instanceId: "i",
    widgetId: over.widgetId ?? "def.collect12",
    definition: over.definition ?? { show: { unit: "건" } },
    refreshKey: 4,
    title: "자동 수집",
    size: { w: 8, h: 8 },
    config: null,
  };
  await act(async () => {
    root.render(createElement(CollectRenderer, props as never));
  });
  return props;
}

describe("자동 수집 렌더러", () => {
  it("widgetId·refreshKey 로 useCollectData 를 부른다", async () => {
    await render(sample());
    expect(h.useCollectData).toHaveBeenCalledWith("def.collect12", 4);
  });

  it("항목마다 타일 — 최신 값·단위(숫자만)·전 회차 대비·수집 시각", async () => {
    await render(sample());
    const t = must("wc-tile-생산량");
    expect(t.querySelector("[data-role=value]")!.textContent).toBe("1,030 건");
    expect(t.querySelector("[data-role=delta]")!.textContent).toBe("▲ 30 (+3.0%)");
    expect(t.querySelector("[data-role=target]")!.textContent).toBe("수집 2026-10-05 09:10");
    const s = must("wc-tile-상태");
    expect(s.querySelector("[data-role=value]")!.textContent).toBe("점검");
    expect(s.querySelector("[data-role=delta]")!.textContent).toBe("");
  });

  it("처음엔 추이를 그릴 수 있는 첫 항목의 선 차트를 보이고, 타일을 고르면 바뀐다", async () => {
    await render(sample());
    expect(must("wc-pick-생산량").getAttribute("aria-pressed")).toBe("true");
    expect(must("wc-pick-상태").getAttribute("aria-pressed")).toBe("false");
    expect(h.line.current!.data).toEqual([
      { label: "09:00", value: 1000 },
      { label: "09:10", value: 1030 },
    ]);
    expect(h.line.current!.yLabel).toBe("건");
    expect(must("wc-chart").textContent).toContain("생산량 추이");

    // 글자만 있는 항목을 고르면 그릴 수 없다는 안내.
    await act(async () => must("wc-pick-상태").click());
    expect(must("wc-pick-상태").getAttribute("aria-pressed")).toBe("true");
    expect(q("wc-chart")).toBeNull();
    expect(q("wc-chart-none")).not.toBeNull();
  });

  it("차트 높이는 본문 높이의 절반(최소 140)", async () => {
    await render(sample());
    expect(h.line.current!.height).toBe(200);
  });

  it("값이 없으면 「아직 수집된 값이 없습니다」(타일·차트 없음)", async () => {
    await render(data([]));
    expect(must("wc-empty").textContent).toBe("아직 수집된 값이 없습니다");
    expect(q("wc-tiles")).toBeNull();
    expect(h.line.current).toBeNull();
  });

  it("최근 수집이 실패했으면 타일 위에 「최근 수집 실패」 한 줄(서버 메시지는 보이지 않는다)", async () => {
    await render(
      data(
        [row("2026-10-05T09:00:00", "생산량", 1000), row("2026-10-05T09:10:00", "생산량", 1030)],
        { lastRun: { at: "2026-10-05T09:20:00", status: "FAIL", message: "connect timed out: 10.1.2.3" } }
      )
    );
    const fail = must("wc-fail");
    expect(fail.textContent).toBe("최근 수집 실패");
    expect(container.textContent).not.toContain("10.1.2.3");
    const wc = must("wc");
    expect(wc.firstElementChild).toBe(fail);
    expect(q("wc-tile-생산량")).not.toBeNull();
  });

  it("값이 없어도 실패했으면 실패 줄과 값 없음이 함께 보인다", async () => {
    await render(data([], { lastRun: { at: "2026-10-05T09:20:00", status: "FAIL" } }));
    expect(q("wc-fail")).not.toBeNull();
    expect(q("wc-empty")).not.toBeNull();
  });

  it("OK·RUN 이거나 lastRun 이 없으면 실패 줄이 없다", async () => {
    await render(data([row("2026-10-05T09:00:00", "a", 1)], { lastRun: { at: "x", status: "OK" } }));
    expect(q("wc-fail")).toBeNull();
    await render(data([row("2026-10-05T09:00:00", "a", 1)], { lastRun: { at: "x", status: "RUN" } }));
    expect(q("wc-fail")).toBeNull();
  });

  it("결과가 아직 없으면(null) 아무것도 그리지 않는다", async () => {
    await render(null);
    expect(q("wc")).toBeNull();
  });

  it("값이 두 회차 모이기 전에는 선 차트 대신 안내", async () => {
    await render(data([row("2026-10-05T09:00:00", "a", 1)]));
    expect(q("wc-chart")).toBeNull();
    expect(must("wc-chart-none").textContent).toContain("2회 이상");
  });

  it("저장 전 정의(자리 표시 ID)는 미리보기 안내를 보인다", async () => {
    await render(null, { widgetId: "def.preview" });
    expect(must("wc-preview-note").textContent).toContain("첫 수집이 끝나면");
  });

  it("500건에서 잘렸으면 안내", async () => {
    await render(data([row("2026-10-05T09:00:00", "a", 1)], { truncated: true }));
    expect(container.textContent).toContain("최대 500건");
  });
});
