/** @vitest-environment happy-dom */
/**
 * useQueryData 의 입력 조건 동작 — 입력 중인 값(draft)은 서버 호출에 쓰지 않고 [검색] 으로 확정한 값(applied)만 쓴다.
 * 서버 호출(api)과 shared 의 틀 상태 훅은 대역이다. 조건 판정(planRun)·값 정리는 실물(_query/format.ts)이다.
 * JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { QueryResult } from "./format";
import type { QueryData } from "./useQueryData";

const h = vi.hoisted(() => ({
  run: vi.fn(),
  setStatus: vi.fn(),
  last: { current: null as unknown },
}));

vi.mock("./api", () => ({ runWidgetQuery: h.run }));
vi.mock("@dk-oasis/shared/widget", () => ({ useWidgetStatus: () => h.setStatus }));

const { useQueryData } = await import("./useQueryData");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.run.mockReset();
  h.setStatus.mockReset();
  h.last.current = null;
  h.run.mockImplementation(async () => ({ columns: ["A"], rows: [{ A: 1 }], truncated: false }) satisfies QueryResult);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Probe(p: { definition: unknown; widgetId: string; refreshKey: number }) {
  const value = useQueryData(p.definition, p.widgetId, p.refreshKey);
  useEffect(() => {
    h.last.current = value;
  });
  return null;
}

const now = () => h.last.current as QueryData;

async function mount(definition: unknown, widgetId = "def.q1234567", refreshKey = 0) {
  await act(async () => {
    root.render(createElement(Probe, { definition, widgetId, refreshKey }));
  });
}

const DEPT = { name: "dept", label: "부서", type: "text", required: true };
const FROM = { name: "from", type: "date", default: "2026-10-01" };

describe("useQueryData — 조건이 없는 위젯", () => {
  it("값 없이 widgetId 로만 부르고 조건 줄 정보는 비어 있다", async () => {
    await mount({ sql: "select 1" });
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(h.run).toHaveBeenCalledWith("def.q1234567", undefined);
    expect(now().condition.params).toEqual([]);
    expect(now().condition.needInput).toBe(false);
    expect(now().data?.rows).toEqual([{ A: 1 }]);
  });

  it("refreshKey 가 바뀌면 다시 부른다", async () => {
    await mount({ sql: "select 1" }, "def.q1234567", 0);
    await mount({ sql: "select 1" }, "def.q1234567", 1);
    expect(h.run).toHaveBeenCalledTimes(2);
  });
});

describe("useQueryData — 입력 조건", () => {
  it("입력 중인 값(draft)으로는 서버를 부르지 않고, [검색] 으로 확정한 값으로만 부른다", async () => {
    await mount({ sql: "select :dept", params: [DEPT, FROM] });
    // 필수(dept)가 비어 있으니 처음에는 부르지 않는다 — 안내만.
    expect(h.run).not.toHaveBeenCalled();
    expect(now().condition.needInput).toBe(true);
    expect(now().data).toBeNull();
    expect(now().condition.draft).toEqual({ dept: "", from: "2026-10-01" });

    await act(async () => now().condition.setDraft("dept", " A01 "));
    expect(now().condition.draft.dept).toBe(" A01 ");
    expect(h.run).not.toHaveBeenCalled();
    expect(now().condition.needInput).toBe(true);

    await act(async () => now().condition.search());
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(h.run).toHaveBeenLastCalledWith("def.q1234567", { dept: "A01", from: "2026-10-01" });
    expect(now().condition.needInput).toBe(false);
    expect(now().data?.rows).toEqual([{ A: 1 }]);
  });

  it("검색 뒤 입력만 바꾸면 다시 부르지 않고, refreshKey 로 다시 부를 때도 확정한 값을 쓴다", async () => {
    const def = { sql: "select :dept", params: [{ name: "dept", type: "text" }] };
    await mount(def);
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(h.run).toHaveBeenLastCalledWith("def.q1234567", { dept: "" });

    await act(async () => now().condition.setDraft("dept", "B"));
    expect(h.run).toHaveBeenCalledTimes(1);

    await mount(def, "def.q1234567", 1);
    expect(h.run).toHaveBeenCalledTimes(2);
    expect(h.run).toHaveBeenLastCalledWith("def.q1234567", { dept: "" });
    expect(now().condition.draft.dept).toBe("B");

    await act(async () => now().condition.search());
    expect(h.run).toHaveBeenCalledTimes(3);
    expect(h.run).toHaveBeenLastCalledWith("def.q1234567", { dept: "B" });
  });

  it("같은 값으로 [검색] 을 다시 눌러도 다시 부른다", async () => {
    await mount({ sql: "select :x", params: [{ name: "x", type: "text", default: "1" }] });
    expect(h.run).toHaveBeenCalledTimes(1);
    await act(async () => now().condition.search());
    expect(h.run).toHaveBeenCalledTimes(2);
  });

  it("값을 비워 필수가 비면 부르지 않고 이전 결과도 지운다(서버 거절이 오류 띠로 뜨지 않는다)", async () => {
    await mount({ sql: "select :dept", params: [{ ...DEPT, default: "A" }] });
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(now().data).not.toBeNull();

    await act(async () => now().condition.setDraft("dept", "  "));
    await act(async () => now().condition.search());
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(now().condition.needInput).toBe(true);
    expect(now().data).toBeNull();
    expect(h.setStatus).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));
  });

  it("값은 200자까지만 담는다", async () => {
    await mount({ sql: "select :x", params: [{ name: "x", type: "text" }] });
    await act(async () => now().condition.setDraft("x", "가".repeat(300)));
    expect(now().condition.draft.x).toHaveLength(200);
  });

  it("조건 정의가 바뀌면 값을 기본값으로 되돌린다", async () => {
    await mount({ sql: "select :x", params: [{ name: "x", type: "text", default: "a" }] });
    await act(async () => now().condition.setDraft("x", "b"));
    await mount({ sql: "select :x", params: [{ name: "x", type: "text", default: "c" }] });
    expect(now().condition.draft).toEqual({ x: "c" });
    expect(h.run).toHaveBeenLastCalledWith("def.q1234567", { x: "c" });
  });

  it("date 형 기본값 yyyyMMdd 는 날짜 입력 칸이 읽는 yyyy-MM-dd 로 보이고 그 값으로 부른다", async () => {
    await mount({ sql: "select :d", params: [{ name: "d", type: "date", default: "20261005" }] });
    expect(now().condition.draft).toEqual({ d: "2026-10-05" });
    expect(h.run).toHaveBeenLastCalledWith("def.q1234567", { d: "2026-10-05" });
  });

  it("이름 형식이 틀리거나 겹친 조건은 그리지도 보내지도 않는다", async () => {
    await mount({ sql: "select 1", params: [{ name: "1bad", type: "text" }, { name: "ok", type: "text" }, { name: "ok", type: "date" }] });
    expect(now().condition.params).toEqual([{ name: "ok", type: "text" }]);
    expect(h.run).toHaveBeenLastCalledWith("def.q1234567", { ok: "" });
  });
});

describe("useQueryData — 관리 화면 미리보기(__preview)", () => {
  it("서버를 부르지 않고 미리보기 결과와 조건 줄 정보를 돌려준다(필수가 비어도 안내 대신 결과)", async () => {
    await mount({
      sql: "select :dept",
      params: [DEPT],
      __preview: { columns: ["A"], rows: [{ A: 9 }], truncated: false },
    });
    expect(h.run).not.toHaveBeenCalled();
    expect(now().data?.rows).toEqual([{ A: 9 }]);
    expect(now().condition.params).toHaveLength(1);
    expect(now().condition.needInput).toBe(false);
  });

  it("저장 전 자리 표시 ID(def.preview)나 빈 widgetId 도 부르지 않는다", async () => {
    await mount({ sql: "select 1" }, "def.preview");
    await mount({ sql: "select 1" }, "");
    expect(h.run).not.toHaveBeenCalled();
  });
});

describe("useQueryData — 조건이 있는 위젯의 서버 오류", () => {
  const def = { sql: "select :x", params: [{ name: "x", type: "text", default: "1" }] };
  const errorsToFrame = () => h.setStatus.mock.calls.map((c) => c[0]).filter((s) => s.kind === "error");

  it("틀에 오류를 알리지 않고 condition.error 로 돌려준다 — 조건 줄 정보와 값은 그대로", async () => {
    h.run.mockRejectedValueOnce(new Error("서버 문구"));
    await mount(def);
    expect(errorsToFrame()).toEqual([]);
    expect(h.setStatus).toHaveBeenLastCalledWith({ kind: "ready" });
    expect(now().condition.error?.message).toBe("위젯 데이터를 불러오지 못했습니다");
    expect(now().data).toBeNull();
    expect(now().condition.params).toHaveLength(1);
    expect(now().condition.draft).toEqual({ x: "1" });
  });

  it("[다시 시도] 는 확정한 값으로 다시 부르고, 성공하면 오류가 사라진다", async () => {
    h.run.mockRejectedValueOnce(new Error("x"));
    await mount(def);
    await act(async () => now().condition.error!.retry());
    expect(h.run).toHaveBeenCalledTimes(2);
    expect(h.run).toHaveBeenLastCalledWith("def.q1234567", { x: "1" });
    expect(now().condition.error).toBeNull();
    expect(now().data?.rows).toEqual([{ A: 1 }]);
  });

  it("값을 고쳐 [검색] 하면 새 값으로 부르고 지난 오류는 사라진다", async () => {
    h.run.mockRejectedValueOnce(new Error("x"));
    await mount(def);
    await act(async () => now().condition.setDraft("x", "2"));
    await act(async () => now().condition.search());
    expect(h.run).toHaveBeenLastCalledWith("def.q1234567", { x: "2" });
    expect(now().condition.error).toBeNull();
  });

  it("늦게 온 옛 응답(결과·실패)은 무시한다", async () => {
    let rejectOld: (e: Error) => void = () => {};
    h.run.mockImplementationOnce(() => new Promise((_, rej) => (rejectOld = rej)));
    await mount(def);
    await act(async () => now().condition.setDraft("x", "2"));
    await act(async () => now().condition.search());
    expect(now().data?.rows).toEqual([{ A: 1 }]);
    // 첫 호출(x=1)의 실패가 뒤늦게 와도 새 결과를 덮지 않는다.
    await act(async () => rejectOld(new Error("옛 실패")));
    expect(now().condition.error).toBeNull();
    expect(now().data?.rows).toEqual([{ A: 1 }]);
  });

  it("늦게 온 옛 성공 응답이 새 결과를 덮지 않는다", async () => {
    let resolveOld: (r: QueryResult) => void = () => {};
    h.run.mockImplementationOnce(() => new Promise((res) => (resolveOld = res)));
    await mount(def);
    await act(async () => now().condition.setDraft("x", "2"));
    await act(async () => now().condition.search());
    await act(async () => resolveOld({ columns: ["A"], rows: [{ A: "옛" }], truncated: false }));
    expect(now().data?.rows).toEqual([{ A: 1 }]);
  });

  it("조건이 없는 위젯은 지금처럼 틀에 오류를 알리고 condition.error 는 null", async () => {
    h.run.mockRejectedValueOnce(new Error("x"));
    await mount({ sql: "select 1" });
    expect(errorsToFrame()).toHaveLength(1);
    expect(now().condition.error).toBeNull();
  });
});

describe("useQueryData — 서버 오류", () => {
  it("실패하면 틀에 오류(다시 시도 포함)를 알린다", async () => {
    h.run.mockRejectedValueOnce(new Error("서버 문구"));
    await mount({ sql: "select 1" });
    const call = h.setStatus.mock.calls.map((c) => c[0]).find((s) => s.kind === "error");
    expect(call).toMatchObject({ kind: "error", message: "위젯 데이터를 불러오지 못했습니다" });
    await act(async () => call.retry());
    expect(h.run).toHaveBeenCalledTimes(2);
  });
});
