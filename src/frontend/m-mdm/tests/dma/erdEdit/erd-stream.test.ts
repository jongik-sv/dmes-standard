/** @vitest-environment happy-dom */
import { act, createElement, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useErdModel } from "../../../pages/dma/erdEdit/state/useErdModel";
import { ErdStreamClient, backoffDelay, newSession, streamUrl, useErdStream } from "../../../pages/dma/erdEdit/state/useErdStream";
import type { ErdDelta, ErdModelView } from "../../../pages/dma/erdEdit/types";
import { FakeEventSource as FakeES, emptyModel, table, viewOf } from "./erd-fixtures";

const factory = (url: string) => new FakeES(url);

function viewAt(rev: number, ...tableIds: string[]): ErdModelView {
  const m = emptyModel();
  for (const id of tableIds) m.tables[id] = table(`TB_${id.toUpperCase().replace("-", "_")}`, id);
  return viewOf(m, { rev });
}
const addTable = (rev: number, id: string): ErdDelta => ({
  modelId: "mcm", rev, userId: "other", session: "claude-a", source: "MCP",
  changes: [{ kind: "table", id, op: "upsert", value: table(`TB_${id}`, id) as unknown as Record<string, unknown> }],
});

describe("ErdStreamClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeES.all = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function client(rev: number | null = 5) {
    const statuses: string[] = [];
    const got: string[] = [];
    const c = new ErdStreamClient({
      modelId: "mcm", session: "ui-a", factory, lastRev: () => rev, onStatus: (s) => statuses.push(s),
      handlers: {
        onHello: (r) => got.push(`hello ${r}`), onDelta: (d) => got.push(`change ${d.rev}`), onReload: (r) => got.push(`reload ${r}`),
        onPresence: (p) => got.push(`presence ${p.length}`), onClaims: (l) => got.push(`claim ${l.length}`),
      },
    });
    return { c, statuses, got };
  }

  it("streamUrl 은 세션과 출처 UI 를 싣고, rev 가 있을 때만 sinceRev 를 붙인다", () => {
    expect(streamUrl("mcm", "ui-a", 5)).toBe("/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/mcm?session=ui-a&source=UI&sinceRev=5");
    expect(streamUrl("mcm", "ui-a", null)).toBe("/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/mcm?session=ui-a&source=UI");
    expect(newSession(() => 0)).toBe("ui-00000000");
  });

  it("끊기면 연결을 닫고 lost 로 알린 뒤 1초·2초 간격으로 그때의 rev 를 붙여 다시 연다", () => {
    const { c, statuses } = client();
    c.start();
    FakeES.all[0].emit("open");
    FakeES.all[0].emit("error");
    expect(FakeES.all[0].closed).toBe(true);
    expect(statuses).toEqual(["connecting", "open", "lost"]);
    vi.advanceTimersByTime(999);
    expect(FakeES.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeES.all).toHaveLength(2);
    expect(FakeES.all[1].url).toContain("sinceRev=5");
    FakeES.all[1].emit("error");
    vi.advanceTimersByTime(1999);
    expect(FakeES.all).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeES.all).toHaveLength(3);
    expect(statuses.at(-1)).toBe("lost"); // 다시 여는 동안 띠를 내리지 않는다
    FakeES.all[2].emit("ping", { at: "2026-10-11T00:00:00Z" });
    expect(statuses.at(-1)).toBe("open");
    expect(backoffDelay(0)).toBe(1000);
    expect(backoffDelay(9)).toBe(30000);
  });

  it("open·claim 만 받고 끊기면 다시 연결 간격을 처음으로 돌리지 않는다", () => {
    const { c } = client();
    c.start();
    FakeES.all[0].emit("error");
    vi.advanceTimersByTime(1000);
    FakeES.all[1].emit("open");
    FakeES.all[1].emit("claim", []);
    FakeES.all[1].emit("error");
    vi.advanceTimersByTime(1999);
    expect(FakeES.all).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeES.all).toHaveLength(3);
  });

  it("숨은 동안은 다시 열지 않고, 보이면 곧바로 연다. 열린 연결은 숨어도 닫지 않는다", () => {
    const { c } = client();
    c.start();
    FakeES.all[0].emit("open");
    c.setAllowed(false);
    expect(FakeES.all[0].closed).toBe(false);
    FakeES.all[0].emit("error");
    vi.advanceTimersByTime(60000);
    expect(FakeES.all).toHaveLength(1);
    c.setAllowed(true);
    expect(FakeES.all).toHaveLength(2);
  });

  it("이벤트를 처리기로 넘기고, 닫은 연결의 늦은 이벤트와 같은 상태의 ping 은 무시한다", () => {
    const { c, statuses, got } = client();
    c.start();
    const es = FakeES.all[0];
    es.emit("hello", { rev: 5 });
    es.emit("change", addTable(6, "t-1"));
    es.emit("presence", [{ session: "ui-b" }]);
    es.emit("claim", []);
    es.emit("reload", { rev: 9 });
    es.emit("ping", { at: "x" });
    expect(got).toEqual(["hello 5", "change 6", "presence 1", "claim 0", "reload 9"]);
    expect(statuses).toEqual(["connecting", "open"]);
    c.stop();
    es.emit("change", addTable(7, "t-2"));
    expect(got).toHaveLength(5);
  });
});

describe("useErdModel + useErdStream", () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeES.all = [];
    // 문서가 보이는 상태로 고정한다(숨은 문서면 연결을 미룬다).
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host?.remove();
    vi.useRealTimers();
  });

  function Harness({ load }: { load: (id: string) => Promise<ErdModelView> }) {
    const m = useErdModel("mcm", load);
    const handlers = useMemo(() => ({
      onHello: () => undefined, onDelta: m.applyDelta, onReload: () => void m.reload(), onPresence: m.setPresence, onClaims: m.setClaims,
    }), [m.applyDelta, m.reload, m.setPresence, m.setClaims]);
    const status = useErdStream({ modelId: "mcm", session: "ui-t", ready: m.state !== null, lastRev: m.state?.rev ?? null, handlers, factory });
    return createElement("div", {
      "data-testid": "h", "data-status": status, "data-rev": String(m.state?.rev ?? ""),
      "data-tables": Object.keys(m.state?.model.tables ?? {}).join(","),
    });
  }

  async function mount(load: (id: string) => Promise<ErdModelView>) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(Harness, { load }));
    });
    await act(async () => undefined);
  }
  const attr = (name: string) => host.querySelector('[data-testid="h"]')!.getAttribute(name);

  it("streamReloadRefetchesModel", async () => {
    const load = vi.fn(async (_id: string) => viewAt(5, "t-a"));
    await mount(load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(FakeES.all).toHaveLength(1);
    expect(FakeES.all[0].url).toContain("sinceRev=5");
    act(() => FakeES.all[0].emit("open"));
    expect(attr("data-status")).toBe("open");

    // 끊김 → 끊김 띠
    act(() => FakeES.all[0].emit("error"));
    expect(attr("data-status")).toBe("lost");

    // 1초 뒤 다시 연결(sinceRev=5). 그사이 DRAFT 를 새로 만들어 서버가 reload{9} 를 보낸다.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(FakeES.all).toHaveLength(2);
    expect(FakeES.all[1].url).toContain("sinceRev=5");
    let resolve!: (v: ErdModelView) => void;
    load.mockImplementationOnce(() => new Promise<ErdModelView>((r) => { resolve = r; }));
    await act(async () => {
      FakeES.all[1].emit("reload", { rev: 9 });
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith("mcm");
    expect(attr("data-status")).toBe("open"); // 띠를 내린다

    // 다시 읽는 동안 온 델타: rev 7 은 응답(rev 9)에 이미 있으므로 버리고, rev 10 만 얹는다.
    act(() => {
      FakeES.all[1].emit("change", addTable(7, "t-stale"));
      FakeES.all[1].emit("change", addTable(10, "t-new"));
    });
    await act(async () => {
      resolve(viewAt(9, "t-b"));
    });
    expect(attr("data-rev")).toBe("10");
    expect(attr("data-tables")).toBe("t-b,t-new");
  });

  it("rev 를 건너뛴 델타를 받으면 모델 전체를 다시 읽는다", async () => {
    const load = vi.fn(async (_id: string) => viewAt(5, "t-a"));
    await mount(load);
    load.mockImplementationOnce(async () => viewAt(8, "t-a", "t-c"));
    await act(async () => {
      FakeES.all[0].emit("change", addTable(8, "t-c"));
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(attr("data-rev")).toBe("8");
    expect(attr("data-tables")).toBe("t-a,t-c");
  });
});
