/** @vitest-environment happy-dom */
/**
 * 정시 수집 편집기 — 일정·원천 칸 전환이 정의 설정(onChange)을 어떻게 고치는지, 칸 단위 오류와 onValidate 보고.
 * 진짜 shared(dist) 의 입력 부품·그리드·공급자를 쓴다(_query/editors-mdm-meta.test.ts 와 같은 설정). JSX 없이 createElement 로 쓴다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import CollectEditor from "./editor";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (!("ResizeObserver" in window)) {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const VALID_SQL = {
  schedule: { mode: "interval", everyMin: 10 },
  source: { kind: "sql", sql: "SELECT A, B FROM T", valueField: "B" },
  show: { days: 7 },
};

async function show(value: unknown) {
  const onChange = vi.fn();
  const onValidate = vi.fn();
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement(CollectEditor, { value, onChange, onValidate })));
  });
  return { onChange, onValidate };
}

const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const must = (id: string) => {
  const el = q(id);
  if (!el) throw new Error(`[data-testid="${id}"] 가 없습니다. 지금 화면: ${host.innerHTML.slice(0, 300)}`);
  return el;
};

async function choose(id: string, value: string) {
  const el = must(id) as HTMLSelectElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const labels = () => [...host.querySelectorAll("th")].map((el) => el.textContent);

describe("정시 수집 편집기", () => {
  it("라벨 3개(일정·원천·표시)와 data-testid", async () => {
    await show(VALID_SQL);
    expect(labels()).toEqual(["일정 *", "원천 *", "표시"]);
    expect(q("widget-editor-collect")).not.toBeNull();
  });

  it("올바른 SQL 설정이면 오류가 없고 onValidate([]) 를 알린다", async () => {
    const { onValidate } = await show(VALID_SQL);
    expect(onValidate).toHaveBeenLastCalledWith([]);
    expect(q("wc-err-schedule")).toBeNull();
    expect(q("wc-err-source")).toBeNull();
    expect(q("wc-err-show")).toBeNull();
  });

  it("칸 단위 오류를 해당 칸 아래에 보이고 합친 목록을 onValidate 로 알린다", async () => {
    const { onValidate } = await show({
      schedule: { mode: "interval", everyMin: 7 },
      source: { kind: "sql", sql: "", valueField: "" },
      show: { days: 0, unit: "가".repeat(11) },
    });
    expect(must("wc-err-schedule").textContent).toContain("수집 주기는");
    expect([...host.querySelectorAll('[data-testid="wc-err-source"]')].map((e) => e.textContent)).toEqual(["SQL 을 입력하세요", "값 컬럼을 입력하세요"]);
    expect([...host.querySelectorAll('[data-testid="wc-err-show"]')]).toHaveLength(2);
    expect(onValidate).toHaveBeenLastCalledWith(expect.arrayContaining(["SQL 을 입력하세요", "값 컬럼을 입력하세요", "단위는 10자 이하로 입력하세요"]));
    expect(onValidate.mock.lastCall![0]).toHaveLength(5);
  });

  it("수집 주기를 고르면 schedule 만 고친다(다른 키는 지킨다)", async () => {
    const { onChange } = await show({ ...VALID_SQL, extra: 1 });
    await choose("wc-every", "30");
    expect(onChange).toHaveBeenCalledWith({ ...VALID_SQL, extra: 1, schedule: { mode: "interval", everyMin: 30 } });
  });

  it("방식을 매일로 바꾸면 시각 목록(처음 09:00)을 시작값으로 두고 시각 목록 칸이 보인다", async () => {
    const { onChange } = await show(VALID_SQL);
    expect(q("wc-at-list")).toBeNull();
    await choose("wc-mode", "daily");
    expect(onChange).toHaveBeenCalledWith({ ...VALID_SQL, schedule: { mode: "daily", at: ["09:00"] } });
  });

  it("daily 설정이면 시각 목록과 시각 오류 안내", async () => {
    const { onValidate } = await show({ ...VALID_SQL, schedule: { mode: "daily", at: ["09:00", "25:00"] } });
    expect(q("wc-at-list")).not.toBeNull();
    expect(q("wc-every")).toBeNull();
    expect(must("wc-err-schedule").textContent).toBe("수집 시각 「25:00」 은 HH:mm(00:00~23:59) 형식이어야 합니다");
    expect(onValidate.mock.lastCall![0]).toHaveLength(1);
  });

  it("원천 종류를 환율로 바꾸면 source 를 환율 시작값으로 바꾸고 SQL 시험 결과(__preview)는 지운다", async () => {
    const { onChange } = await show({ ...VALID_SQL, __preview: { columns: ["A"], rows: [], truncated: false } });
    await choose("wc-kind", "exchange");
    const next = onChange.mock.lastCall![0];
    expect(next.source).toEqual({ kind: "exchange", currencies: ["USD", "EUR", "JPY", "CNY"] });
    expect(next.__preview).toBeUndefined();
    expect(next.schedule).toEqual(VALID_SQL.schedule);
  });

  it("HTTP 원천은 주소·항목 칸을, 환율은 통화 칸을 보이고 SQL 시험 단추는 SQL 에만 있다", async () => {
    await show(VALID_SQL);
    expect(q("wq-preview-run")).not.toBeNull();
    await show({ ...VALID_SQL, source: { kind: "http", url: "https://a.b/x", items: [{ key: "금", path: "data.price" }] } });
    expect(q("wc-url")).not.toBeNull();
    expect(q("wc-items")).not.toBeNull();
    expect(q("wq-preview-run")).toBeNull();
    await show({ ...VALID_SQL, source: { kind: "exchange", currencies: ["USD"] } });
    expect(q("wc-currencies")).not.toBeNull();
    expect(q("wq-preview-run")).toBeNull();
    expect(host.textContent).toContain("시험 버튼이 없습니다");
  });

  it("SQL 칸은 수집용 안내 — :userId·:deptCd 금지, 조회 조건 칸 없음", async () => {
    await show(VALID_SQL);
    expect(host.textContent).toContain("수집에는 사용자가 없어");
    expect(host.textContent).not.toContain("조회 조건");
    expect(host.textContent).not.toContain(":userId 사용자 ID");
  });

  it("SQL 에 사용자 변수를 쓰면 오류", async () => {
    await show({ ...VALID_SQL, source: { kind: "sql", sql: "SELECT :userId FROM T", valueField: "B" } });
    expect(must("wc-err-source").textContent).toBe("수집에는 사용자가 없어 :userId 를 쓸 수 없습니다");
  });

  it("표시 기간·단위 입력은 show 를 고친다(기간을 비우면 키를 뺀다)", async () => {
    const { onChange } = await show({ ...VALID_SQL, show: { days: 7, unit: "건" } });
    const unit = must("wc-unit") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(unit, "원");
      unit.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange.mock.lastCall![0].show).toEqual({ days: 7, unit: "원" });
    const days = must("wc-days") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(days, "");
      days.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const out = onChange.mock.lastCall![0].show;
    expect(out.days).toBeUndefined();
    // 부모가 값을 다시 내려 주지 않는 시험이라 앞서 고친 단위(원)가 최신 값으로 남아 있다.
    expect(out.unit).toBe("원");
  });
});
