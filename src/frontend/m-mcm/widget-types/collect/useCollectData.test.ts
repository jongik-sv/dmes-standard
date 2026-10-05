/** @vitest-environment happy-dom */
/**
 * useCollectData — widgetData/run 호출·오류 고정 문구·다시 시도·늦은 응답 무시. 서버 호출(api)과 틀 상태 훅은 대역이다.
 */
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CollectData } from "./format";

const h = vi.hoisted(() => ({ run: vi.fn(), setStatus: vi.fn(), last: { current: null as unknown } }));
vi.mock("../_query/api", () => ({ runWidgetRaw: h.run }));
vi.mock("@dk-oasis/shared/widget", () => ({ useWidgetStatus: () => h.setStatus }));

const { useCollectData } = await import("./useCollectData");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const RAW = {
  rows: [{ COLLECTED_AT: "2026-10-05T09:00:00", ITEM_KEY: "A", VALUE: 1 }],
  lastRun: { at: "2026-10-05T09:00:00", status: "FAIL", message: "서버 내부 문구" },
};

beforeEach(() => {
  h.run.mockReset();
  h.setStatus.mockReset();
  h.last.current = null;
  h.run.mockResolvedValue(RAW);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Probe(p: { widgetId: string; refreshKey: number }) {
  const value = useCollectData(p.widgetId, p.refreshKey);
  useEffect(() => {
    h.last.current = value;
  });
  return null;
}
const now = () => h.last.current as CollectData | null;
async function mount(widgetId: string, refreshKey = 0) {
  await act(async () => {
    root.render(createElement(Probe, { widgetId, refreshKey }));
  });
}
const frameErrors = () => h.setStatus.mock.calls.map((c) => c[0]).filter((s) => s.kind === "error");

describe("useCollectData", () => {
  it("widgetId 로 부르고 응답을 항목·lastRun 으로 바꿔 돌려준다", async () => {
    await mount("def.c1234567");
    expect(h.run).toHaveBeenCalledWith("def.c1234567");
    expect(now()!.items).toEqual([{ key: "A", points: [{ at: "2026-10-05T09:00:00", value: 1 }] }]);
    expect(now()!.lastRun).toEqual({ at: "2026-10-05T09:00:00", status: "FAIL", message: "서버 내부 문구" });
    expect(h.setStatus).toHaveBeenLastCalledWith({ kind: "ready" });
  });

  it("refreshKey 가 바뀌면 다시 부른다", async () => {
    await mount("def.c1234567", 0);
    await mount("def.c1234567", 1);
    expect(h.run).toHaveBeenCalledTimes(2);
  });

  it("저장 전 자리 표시 ID·빈 widgetId 는 부르지 않는다", async () => {
    await mount("def.preview");
    await mount("");
    expect(h.run).not.toHaveBeenCalled();
    expect(now()).toBeNull();
  });

  it("실패하면 틀에 고정 문구(서버 문구 없음)와 다시 시도를 알리고, 다시 시도하면 부른다", async () => {
    h.run.mockRejectedValueOnce(new Error("connect timed out: 10.1.2.3"));
    await mount("def.c1234567");
    const err = frameErrors()[0];
    expect(err.message).toBe("위젯 데이터를 불러오지 못했습니다");
    expect(JSON.stringify(h.setStatus.mock.calls)).not.toContain("10.1.2.3");
    await act(async () => err.retry());
    expect(h.run).toHaveBeenCalledTimes(2);
    expect(now()!.items).toHaveLength(1);
  });

  it("늦게 온 옛 응답은 무시한다", async () => {
    let resolveOld: (v: unknown) => void = () => {};
    h.run.mockImplementationOnce(() => new Promise((res) => (resolveOld = res)));
    await mount("def.c1234567", 0);
    await mount("def.c1234567", 1);
    await act(async () => resolveOld({ rows: [{ COLLECTED_AT: "2026-10-05T08:00:00", ITEM_KEY: "OLD", VALUE: 9 }] }));
    expect(now()!.items.map((i) => i.key)).toEqual(["A"]);
  });
});
