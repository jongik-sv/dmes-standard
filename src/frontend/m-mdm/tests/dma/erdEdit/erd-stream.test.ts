/** @vitest-environment happy-dom */
import { act, createElement, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useErdModel, type ErdModelApi } from "../../../pages/dma/erdEdit/state/useErdModel";
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

  it("끊길 때마다 onLost 를 부른다 — 화면이 모델이 있는지 확인해 연결을 멈출 수 있다", () => {
    const lost = vi.fn();
    const c = new ErdStreamClient({
      modelId: "mcm", session: "ui-a", factory, lastRev: () => 5, onStatus: () => undefined,
      handlers: { onHello: vi.fn(), onDelta: vi.fn(), onReload: vi.fn(), onPresence: vi.fn(), onClaims: vi.fn(), onLost: lost },
    });
    c.start();
    FakeES.all[0].emit("error");
    expect(lost).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    FakeES.all[1].emit("error");
    expect(lost).toHaveBeenCalledTimes(2);
    c.stop();
    expect(lost).toHaveBeenCalledTimes(2);
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

  it("version 이벤트를 onVersion 으로 넘긴다(S2-12)", () => {
    const got: string[] = [];
    const c = new ErdStreamClient({
      modelId: "mcm", session: "ui-a", factory, lastRev: () => 5, onStatus: () => undefined,
      handlers: {
        onHello: () => undefined, onDelta: () => undefined, onReload: () => undefined, onPresence: () => undefined, onClaims: () => undefined,
        onVersion: (ev) => got.push(`${ev.reason} ${ev.rowVersion}`),
      },
    });
    c.start();
    FakeES.all[0].emit("version", { modelId: "mcm", ver: "1.000", status: "DRAFT", ownerId: "a", editors: [], rowVersion: 12,
      reason: "LOCK", userId: "a", at: "2026-10-11T05:10:03Z" });
    expect(got).toEqual(["LOCK 12"]);
    c.stop();
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
    const m = useErdModel("mcm", "ui-t", "tester", load);
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

  it("exclusiveWaitsForOwnEcho", async () => {
    // S2-29: exclusive 결과의 rev 까지 화면 상태가 따라올 때까지 다음 일을 놓지 않는다. 5초가 지나면 다시 읽는다.
    const load = vi.fn(async (_id: string) => viewAt(5, "t-a"));
    let api: ErdModelApi | null = null;
    function Probe() {
      const m = useErdModel("mcm", "ui-t", "tester", load);
      api = m;
      const handlers = useMemo(() => ({
        onHello: () => undefined, onDelta: m.applyDelta, onReload: () => void m.reload(), onPresence: m.setPresence, onClaims: m.setClaims,
      }), [m.applyDelta, m.reload, m.setPresence, m.setClaims]);
      useErdStream({ modelId: "mcm", session: "ui-t", ready: m.state !== null, lastRev: m.state?.rev ?? null, handlers, factory });
      return createElement("div", { "data-testid": "h", "data-rev": String(m.state?.rev ?? "") });
    }
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(Probe));
    });
    await act(async () => undefined);
    const ex = <T,>(fn: () => Promise<T>) => (api as unknown as ErdModelApi).exclusive(fn);
    const order: string[] = [];

    // 응답(rev 6)이 SSE 에코보다 먼저 왔다 — 에코가 올 때까지 다음 일을 놓지 않는다
    let first: unknown;
    await act(async () => {
      void ex(async () => ({ applied: true, rev: 6 })).then((r) => {
        first = r;
      });
      void ex(async () => {
        order.push("second");
      });
    });
    expect(first).toEqual({ applied: true, rev: 6 }); // 부른 쪽은 결과를 바로 받는다
    expect(order).toEqual([]);
    await act(async () => {
      FakeES.all[0].emit("change", { ...addTable(6, "t-b"), session: "ui-t", source: "UI" });
    });
    expect(attr("data-rev")).toBe("6");
    expect(order).toEqual(["second"]);

    // 에코가 5초 안에 오지 않으면 모델을 다시 읽고 다음 일을 놓는다
    load.mockImplementationOnce(async () => viewAt(8, "t-a", "t-b"));
    await act(async () => {
      void ex(async () => ({ rev: 8 }));
      void ex(async () => {
        order.push("third");
      });
    });
    expect(order).toEqual(["second"]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(order).toEqual(["second"]);
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(order).toEqual(["second", "third"]);
    expect(attr("data-rev")).toBe("8");
  });

  it("reload 이벤트가 몰려도(dropMine 다시 읽기·느린 응답·읽기 실패) 연결을 닫고 다시 열지 않는다 — SSE 되먹임 후보 1 기각(deferred 121)", async () => {
    // ErdViewer 와 같은 처리: onReload → reload({dropMine:true}), onHello → rev 다르면 reload, ready = 상태가 있고 모델이 같음.
    const loads: Array<(v: ErdModelView | Error) => void> = [];
    const load = vi.fn((_id: string) => new Promise<ErdModelView>((res, rej) => {
      loads.push((v) => (v instanceof Error ? rej(v) : res(v)));
    }));
    function Viewer() {
      const m = useErdModel("mcm", "ui-t", "tester", load);
      const ready = m.state !== null && m.state.modelId === "mcm";
      const handlers = useMemo(() => ({
        onHello: (rev: number) => { if (rev !== m.state?.rev) void m.reload(); },
        onDelta: m.applyDelta, onReload: () => void m.reload({ dropMine: true }), onPresence: m.setPresence, onClaims: m.setClaims,
      }), [m.applyDelta, m.reload, m.setPresence, m.setClaims, m.state?.rev]);
      const status = useErdStream({ modelId: "mcm", session: "ui-t", ready, lastRev: m.state?.rev ?? null, handlers, factory });
      return createElement("div", { "data-testid": "h", "data-status": status, "data-rev": String(m.state?.rev ?? "") });
    }
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(Viewer));
    });
    await act(async () => loads.shift()!(viewAt(5, "t-a"))); // 처음 읽기
    expect(FakeES.all).toHaveLength(1);
    expect(FakeES.all[0].url).toContain("sinceRev=5");
    act(() => FakeES.all[0].emit("open"));

    // reload 가 연달아 온다 — 읽는 동안 상태는 남아 ready 가 내려가지 않는다.
    for (const rev of [9, 12, 15]) {
      await act(async () => {
        FakeES.all[0].emit("reload", { rev });
      });
      expect(FakeES.all).toHaveLength(1);
      expect(FakeES.all[0].closed).toBe(false);
      await act(async () => loads.shift()!(viewAt(rev, "t-a")));
      expect(attr("data-rev")).toBe(String(rev));
    }
    // 읽기가 실패해도 마찬가지다.
    await act(async () => {
      FakeES.all[0].emit("reload", { rev: 20 });
    });
    await act(async () => loads.shift()!(new Error("읽기 실패")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(FakeES.all).toHaveLength(1);
    expect(FakeES.all[0].closed).toBe(false);
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("되돌리기 요청이 서버에 닿지 않으면(던짐·다시 읽는 중 거절) 그 rev 를 myRevs 에 돌려 둔다", async () => {
    const load = vi.fn(async (_id: string) => viewAt(5, "t-a"));
    let restoreFails = true;
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
      const action = String(url).split("/").pop();
      if (action === "restore" && restoreFails) throw new TypeError("Failed to fetch");
      const result = action === "save"
        ? { applied: true, rev: 6, rowVersion: 1, warnings: [], rejection: null, changes: [{ kind: "table", id: "t-a", op: "patch", value: { logical: "가" } }] }
        : { applied: true, rev: 7, rowVersion: 2, warnings: [], rejection: null, changes: [{ kind: "table", id: "t-a", op: "patch", value: { logical: "나" } }] };
      return new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
    }));
    try {
      let api: ErdModelApi | null = null;
      function Probe() {
        api = useErdModel("mcm", "ui-t", "tester", load);
        return null;
      }
      host = document.createElement("div");
      document.body.appendChild(host);
      root = createRoot(host);
      await act(async () => {
        root!.render(createElement(Probe));
      });
      await act(async () => undefined);
      const m = () => api as unknown as ErdModelApi;
      await act(async () => {
        await m().apply([{ op: "updateTable", id: "t-a", set: { logical: "가" } }], "이름");
      });
      expect(m().myRevs).toEqual([6]);

      // 던짐 — 요청이 반영되지 않았다
      let out: unknown;
      await act(async () => {
        out = await m().undo(6);
      });
      expect(out).toMatchObject({ ok: false });
      expect(m().myRevs).toEqual([6]);

      // 다시 읽는 중이면 보내지 않고 RELOAD 로 거절한다 — rev 는 그대로 둔다
      let finish!: (v: ErdModelView) => void;
      load.mockImplementationOnce(() => new Promise<ErdModelView>((r) => { finish = r; }));
      restoreFails = false;
      await act(async () => {
        void m().reload();
        out = await m().undo(6);
      });
      expect(out).toMatchObject({ ok: false, notice: { code: "RELOAD" } });
      expect(m().myRevs).toEqual([6]);
      await act(async () => {
        finish(viewAt(6, "t-a"));
      });

      // 서버에 닿으면 꺼낸다
      await act(async () => {
        out = await m().undo(6);
      });
      expect(out).toMatchObject({ ok: true, rev: 7 });
      expect(m().myRevs).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("다시 읽기가 코드 달린 오류(MDM029)로 실패하면 errorCode 로 알린다", async () => {
    const gone = Object.assign(new Error("모델이 없습니다"), { code: "MDM029" });
    const load = vi.fn(async (_id: string) => viewAt(5, "t-a"));
    let api: ErdModelApi | null = null;
    function Probe() {
      api = useErdModel("mcm", "ui-t", "tester", load);
      return createElement("div");
    }
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root!.render(createElement(Probe)); });
    await act(async () => undefined);
    expect((api as unknown as ErdModelApi).errorCode).toBeNull();
    load.mockRejectedValueOnce(gone);
    await act(async () => { await (api as unknown as ErdModelApi).reload({ dropMine: true }); });
    expect((api as unknown as ErdModelApi).error).toBe("모델이 없습니다");
    expect((api as unknown as ErdModelApi).errorCode).toBe("MDM029");
  });
});
