/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApplyOutcome } from "../../../pages/dma/erdEdit/edit-context";
import { isNetworkError, useErdModel, type ErdModelApi } from "../../../pages/dma/erdEdit/state/useErdModel";
import type { ErdApplyResult, ErdChange, ErdDelta, ErdModelView } from "../../../pages/dma/erdEdit/types";
import { emptyModel, table, viewOf } from "./erd-fixtures";

/** useErdModel 지킴 시험 — 보관 중 다시 읽기 한 번, 연결 실패 알림, 모델 바꿈·dropMine·화면 닫음 뒤 늦은 응답과 남은 묶음. */

function viewAt(modelId: string, rev: number, ...tableIds: string[]): ErdModelView {
  const m = emptyModel();
  for (const id of tableIds) m.tables[id] = table(`TB_${id}`, id);
  return viewOf(m, { modelId, rev });
}
const tableChange = (id: string): ErdChange => ({ kind: "table", id, op: "upsert", value: table(`TB_${id}`, id) as unknown as Record<string, unknown> });
const saved = (rev: number, ...changes: ErdChange[]): ErdApplyResult => ({ applied: true, rev, rowVersion: 1, warnings: [], rejection: null, changes });
const okResponse = (result: ErdApplyResult) =>
  new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });

/** fetch 대역 — 부를 때마다 action 을 남기고, 줄에 넣은 응답을 차례로 돌려준다(없으면 기본 응답). */
function stubFetch(fallback: () => Promise<Response>) {
  const calls: string[] = [];
  const queue: (() => Promise<Response>)[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
    calls.push(String(url).split("/").pop() ?? "");
    return (queue.shift() ?? fallback)();
  }));
  return { calls, queue };
}
/** 늦게 끝낼 응답. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("useErdModel 지킴", () => {
  let host: HTMLDivElement;
  let root: Root | null = null;
  let api: ErdModelApi | null = null;
  const m = () => api as unknown as ErdModelApi;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    api = null;
    host?.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function Probe({ modelId, load }: { modelId: string; load: (id: string) => Promise<ErdModelView> }) {
    api = useErdModel(modelId, "ui-t", "tester", load);
    return null;
  }
  async function mount(load: (id: string) => Promise<ErdModelView>, modelId = "mcm") {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(Probe, { modelId, load }));
    });
    await act(async () => undefined);
  }
  async function rerender(load: (id: string) => Promise<ErdModelView>, modelId: string) {
    await act(async () => {
      root!.render(createElement(Probe, { modelId, load }));
    });
    await act(async () => undefined);
  }

  it("보관 델타가 5초를 넘어 다시 읽을 때 읽기가 1초를 넘어도 한 번만 읽는다", async () => {
    const load = vi.fn(async (id: string) => viewAt(id, 5, "t-a"));
    stubFetch(async () => okResponse(saved(7, tableChange("t-x"))));
    await mount(load);
    // 응답 rev 7 > 아래층 rev 5 + 1 — 남의 rev 6 이 아직 안 와서 보관한다
    await act(async () => {
      await m().apply([{ op: "updateTable", id: "t-a", set: { logical: "가" } }], "이름");
    });
    expect(m().pending.map((b) => b.state)).toEqual(["held"]);

    const slow = deferred<ErdModelView>();
    load.mockImplementation(() => slow.promise);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(load).toHaveBeenCalledTimes(2); // 읽는 동안 1초마다 새로 읽지 않는다
    await act(async () => {
      slow.resolve(viewAt("mcm", 7, "t-a", "t-x"));
    });
    expect(m().pending).toEqual([]);
    expect(m().state?.rev).toBe(7);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("SSE 가 틈을 채워 보관한 표 델타를 얹으면 columnsSeq 를 올린다", async () => {
    const load = vi.fn(async (id: string) => viewAt(id, 5, "t-a"));
    stubFetch(async () => okResponse(saved(7, tableChange("t-x"))));
    await mount(load);
    await act(async () => {
      await m().apply([{ op: "updateTable", id: "t-a", set: { logical: "가" } }], "이름");
    });
    const before = m().columnsSeq;
    // 남의 rev 6 은 다이어그램만 바꾼다 — 그래도 뒤이어 얹은 rev 7(표)로 컬럼 표준을 다시 읽어야 한다
    const diagramOnly: ErdDelta = {
      modelId: "mcm", rev: 6, userId: "other", session: "claude-a", source: "MCP",
      changes: [{ kind: "diagram", id: "d-1", op: "upsert", value: { id: "d-1", name: "주" } }],
    };
    act(() => m().applyDelta(diagramOnly));
    expect(m().state?.rev).toBe(7);
    expect(m().pending).toEqual([]);
    expect(m().columnsSeq).toBe(before + 1);
  });

  it("연결 실패는 NETWORK 알림이고, 5xx 로 실패한 되돌리기는 rev 를 myRevs 에 돌려 두지 않는다", async () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("서버와 연결할 수 없습니다. 네트워크 또는 서버 상태를 확인한 뒤 다시 시도해 주세요."))).toBe(true);
    expect(isNetworkError(new Error("요청 시간이 지났습니다."))).toBe(false);

    const load = vi.fn(async (id: string) => viewAt(id, 5, "t-a"));
    const f = stubFetch(async () => okResponse(saved(6, tableChange("t-a"))));
    await mount(load);
    f.queue.push(async () => {
      throw new TypeError("Failed to fetch");
    });
    let out: ApplyOutcome | undefined;
    await act(async () => {
      out = await m().apply([{ op: "updateTable", id: "t-a", set: { logical: "가" } }], "이름");
    });
    expect(out).toMatchObject({ ok: false, notice: { code: "NETWORK" } });
    expect(m().pending).toEqual([]);

    await act(async () => {
      out = await m().apply([{ op: "updateTable", id: "t-a", set: { logical: "가" } }], "이름");
    });
    expect(m().myRevs).toEqual([6]);
    // 5xx — 서버가 반영했을 수 있으므로 꺼낸 rev 를 다시 넣지 않는다
    f.queue.push(async () => new Response("boom", { status: 500, statusText: "Server Error" }));
    await act(async () => {
      out = await m().undo(6);
    });
    expect(out).toMatchObject({ ok: false });
    expect(out && !out.ok ? out.notice.code : null).not.toBe("NETWORK");
    expect(m().myRevs).toEqual([]);
  });

  it("응답을 기다리는 사이 모델을 바꾸면 응답을 얹지 않고 myRevs 에도 넣지 않는다", async () => {
    const load = vi.fn(async (id: string) => viewAt(id, 5, id === "mcm" ? "t-a" : "t-m"));
    const f = stubFetch(async () => okResponse(saved(6, tableChange("t-x"))));
    const late = deferred<Response>();
    f.queue.push(() => late.promise);
    await mount(load);
    let p!: Promise<ApplyOutcome>;
    await act(async () => {
      p = m().apply([{ op: "updateTable", id: "t-a", set: { logical: "가" } }], "이름");
    });
    await rerender(load, "m2");
    expect(m().state?.modelId).toBe("m2");
    let out: ApplyOutcome | undefined;
    await act(async () => {
      late.resolve(okResponse(saved(6, tableChange("t-x"))));
      out = await p;
    });
    expect(out).toMatchObject({ ok: true, rev: 6 });
    expect(m().myRevs).toEqual([]);
    expect(m().state?.rev).toBe(5);
    expect(Object.keys(m().state?.model.tables ?? {})).toEqual(["t-m"]);
    expect(m().pending).toEqual([]);
  });

  it("reload({dropMine:true}) 뒤 늦은 응답은 얹지 않고, 줄에 남은 묶음은 보내지 않는다", async () => {
    const load = vi.fn(async (id: string) => viewAt(id, 5, "t-a"));
    const f = stubFetch(async () => okResponse(saved(6, tableChange("t-x"))));
    const late = deferred<Response>();
    f.queue.push(() => late.promise);
    await mount(load);
    let first!: Promise<ApplyOutcome>;
    let second!: Promise<ApplyOutcome>;
    await act(async () => {
      first = m().apply([{ op: "updateTable", id: "t-a", set: { logical: "가" } }], "하나");
      second = m().apply([{ op: "updateTable", id: "t-a", set: { logical: "나" } }], "둘");
    });
    expect(f.calls).toEqual(["save"]);
    await act(async () => {
      await m().reload({ dropMine: true });
    });
    let out1: ApplyOutcome | undefined;
    let out2: ApplyOutcome | undefined;
    await act(async () => {
      late.resolve(okResponse(saved(6, tableChange("t-x"))));
      out1 = await first;
      out2 = await second;
    });
    expect(out1).toMatchObject({ ok: true, rev: 6 });
    expect(out2).toMatchObject({ ok: false, notice: { code: "RELOAD", message: "모델이 바뀌어 보내지 않았습니다." } });
    expect(f.calls).toEqual(["save"]); // 둘째 묶음은 보내지 않았다
    expect(m().myRevs).toEqual([]);
    expect(m().state?.rev).toBe(5);
    expect(m().pending).toEqual([]);
  });

  it("화면을 닫으면 줄에 남은 묶음을 보내지 않는다", async () => {
    const load = vi.fn(async (id: string) => viewAt(id, 5, "t-a"));
    const f = stubFetch(async () => okResponse(saved(7, tableChange("t-y"))));
    const late = deferred<Response>();
    f.queue.push(() => late.promise);
    await mount(load);
    let second!: Promise<ApplyOutcome>;
    await act(async () => {
      void m().apply([{ op: "updateTable", id: "t-a", set: { logical: "가" } }], "하나");
      second = m().apply([{ op: "updateTable", id: "t-a", set: { logical: "나" } }], "둘");
    });
    act(() => root?.unmount());
    root = null;
    let out: ApplyOutcome | undefined;
    await act(async () => {
      late.resolve(okResponse(saved(6, tableChange("t-x"))));
      out = await second;
    });
    expect(out).toMatchObject({ ok: false, notice: { code: "RELOAD" } });
    expect(f.calls).toEqual(["save"]);
  });

  it("다른 모델의 델타는 다시 읽는 동안 모은 것까지 버린다", async () => {
    const load = vi.fn(async (id: string) => viewAt(id, 5, "t-a"));
    stubFetch(async () => okResponse(saved(6)));
    await mount(load);
    const other = (rev: number, id: string): ErdDelta => ({
      modelId: "other", rev, userId: "x", session: "claude-a", source: "MCP", changes: [tableChange(id)],
    });
    act(() => m().applyDelta(other(6, "t-z")));
    expect(m().state?.rev).toBe(5);

    const slow = deferred<ErdModelView>();
    load.mockImplementationOnce(() => slow.promise);
    let p!: Promise<void>;
    await act(async () => {
      p = m().reload();
    });
    act(() => {
      m().applyDelta(other(6, "t-z"));
      m().applyDelta({ ...other(6, "t-b"), modelId: "mcm" });
    });
    await act(async () => {
      slow.resolve(viewAt("mcm", 5, "t-a"));
      await p;
    });
    expect(m().state?.rev).toBe(6);
    expect(Object.keys(m().state?.model.tables ?? {}).sort()).toEqual(["t-a", "t-b"]);
  });
});
