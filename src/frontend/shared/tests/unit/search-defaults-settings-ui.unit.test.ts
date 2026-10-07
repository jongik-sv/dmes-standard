/** @vitest-environment happy-dom */
/**
 * 조회 영역 설정 아이콘·메뉴·설정 창(설계 2026-10-07-search-defaults §8) — SearchArea 를 진짜로 그리고 서버 호출만 바꿔 끼운다.
 *  - 아이콘: 사용자·등록 칸이 있을 때만, defaults=false·대화 상자 안이면 없다. 눌러도 조회하지 않는다.
 *  - 설정 창: 저장하면 이 영역 칸 규칙만 바꿔 savePage 하고(다른 영역 규칙은 남김) 칸에 바로 넣는다. 조회는 하지 않는다.
 *    저장 실패면 창이 닫히지 않는다. 창 안 입력에서 Enter 를 쳐도 조회하지 않는다. 창이 열려 있으면 F8 조회가 막힌다.
 *  - 메뉴: 지금 조건을 기본값으로·내 기본값 초기화(남는 규칙이 없으면 resetPage).
 */
import { act, createElement, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageLayout } from "../../src/layout/PageLayout";
import { SearchArea, type SearchAreaProps } from "../../src/layout/SearchArea";
import { SearchField } from "../../src/layout/SearchField";
import {
  getPageSearchDefaults,
  resetSearchDefaultsStore,
  setSearchDefaultsLocalForDev,
  setSearchDefaultsTransportForTest,
  type PageRules,
} from "../../src/layout/search-defaults/store";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { installMemoryLocalStorage } from "./grid-personalize-test-env";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

const PAGE = "mcm:csa/settingsTest";
const USER = "u1";

let rendered: Rendered | null = null;
let calls: Array<[string, unknown]> = [];
let failSave = false;
let searches = 0;
let latest: Record<string, string> = {};

function setUser(id: string | null) {
  (globalThis as Record<string, unknown>).__dkOasisCurrentUserStore__ = {
    user: id ? { id, name: null } : null,
    inflight: null,
    generation: 0,
    listeners: new Set(),
  };
}

function given(rules: PageRules) {
  setSearchDefaultsLocalForDev(USER, PAGE, rules);
  setSearchDefaultsTransportForTest(async (action, body) => {
    calls.push([action, body]);
    if (action === "search") {
      const rows = Object.entries(rules).map(([fieldKey, rule]) => ({ pageId: PAGE, fieldKey, ruleJson: JSON.stringify(rule) }));
      return { meta: { success: true }, data: { result: { rows } } };
    }
    if (failSave) return { meta: { success: false, message: "서버 거절" } };
    return { meta: { success: true } };
  });
}

function Screen(props: { area?: Partial<SearchAreaProps>; second?: boolean; withLayout?: boolean }) {
  const [f, setF] = useState({ item: "", useTp: "Y", from: "", to: "", item2: "" });
  latest = f;
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const main = createElement(
    SearchArea,
    { onSearch: () => (searches += 1), ...props.area },
    createElement(SearchField, { label: "품번", name: "itemCd", value: f.item, onChange: set("item") }),
    createElement(SearchField, {
      label: "사용",
      name: "useTp",
      type: "select",
      value: f.useTp,
      onChange: set("useTp"),
      options: [
        { value: "", label: "전체" },
        { value: "Y", label: "사용" },
        { value: "N", label: "미사용" },
      ],
    }),
    createElement(SearchField, { label: "기간", name: "fromDt", type: "date", value: f.from, onChange: set("from") }),
    createElement(SearchField, { label: "~", type: "date", value: f.to, onChange: set("to") }),
  );
  const second = props.second
    ? createElement(
        SearchArea,
        { onSearch: () => {}, defaultsScope: "tab2" },
        createElement(SearchField, { label: "품번2", name: "itemCd", value: f.item2, onChange: set("item2") }),
      )
    : null;
  const body = createElement("div", null, main, second);
  if (!props.withLayout) return body;
  return createElement(PageLayout, { title: "t", buttons: [{ id: "btn_search", label: "조회", type: "primary", onClick: () => (searches += 1) }] }, body);
}

const inPage = (node: ReactNode) => createElement(TabPageContext.Provider, { value: { pageId: PAGE, serviceId: "" } }, node);

async function mount(node: ReactNode) {
  rendered = renderWithMantine(node as React.ReactElement);
  await act(async () => {
    await Promise.resolve();
  });
}

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const byTestId = <T extends Element = HTMLElement>(id: string) => $<T>(`[data-testid="${id}"]`);
const icons = () => document.querySelectorAll('[data-testid="search-settings-menu"]');

async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
    await Promise.resolve();
  });
}

async function openMenuItem(testId: string, iconIndex = 0) {
  await click(icons()[iconIndex]);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await click(byTestId(testId));
}

async function changeSelect(testId: string, value: string) {
  const el = byTestId<HTMLSelectElement>(testId);
  expect(el).not.toBeNull();
  await act(async () => {
    el!.value = value;
    el!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function typeInto(testId: string, value: string) {
  const el = byTestId<HTMLInputElement>(testId)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const flush = async () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });

beforeEach(() => {
  installMemoryLocalStorage();
  resetSearchDefaultsStore();
  // 사용자 없음 경우의 /api/auth/me 확인이 실제 연결을 시도하지 않게 한다.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
  setUser(USER);
  calls = [];
  failSave = false;
  searches = 0;
  given({});
});

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  setSearchDefaultsTransportForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("설정 아이콘", () => {
  it("사용자·등록 칸이 있으면 보이고, 눌러도 조회하지 않는다", async () => {
    await mount(inPage(createElement(Screen)));
    expect(icons()).toHaveLength(1);
    expect((icons()[0] as HTMLButtonElement).type).toBe("button");
    await click(icons()[0]);
    expect(searches).toBe(0);
  });

  it("defaults=false·사용자 없음·대화 상자 안이면 그리지 않는다", async () => {
    await mount(inPage(createElement(Screen, { area: { defaults: false } })));
    expect(icons()).toHaveLength(0);
    rendered!.unmount();
    setUser(null);
    await mount(inPage(createElement(Screen)));
    expect(icons()).toHaveLength(0);
    rendered!.unmount();
    setUser(USER);
    await mount(inPage(createElement("div", { role: "dialog" }, createElement(Screen))));
    expect(icons()).toHaveLength(0);
  });
});

describe("설정 창", () => {
  it("저장하면 이 영역 규칙만 바꿔 savePage 하고 칸에 바로 넣는다(다른 영역 규칙은 남김, 조회 없음)", async () => {
    given({ "tab2.itemCd": { kind: "fixed", value: "T2" } });
    await mount(inPage(createElement(Screen, { second: true })));
    expect(latest.item2).toBe("T2");
    await openMenuItem("search-settings-open");
    expect(byTestId("search-defaults-dialog")).not.toBeNull();
    await changeSelect("sd-mode-itemCd", "fixed");
    await typeInto("sd-fixed-itemCd", "P-9");
    await changeSelect("sd-mode-fromDt", "range");
    await changeSelect("sd-range-fromDt", "prevMonth");
    await click(byTestId("search-defaults-dialog-save"));
    await flush();
    const save = calls.find(([a]) => a === "savePage")!;
    const sent = (save[1] as { grids: { rows: { rows: Array<{ fieldKey: string; ruleJson: string }> } } }).grids.rows.rows;
    expect(sent.map((r) => [r.fieldKey, JSON.parse(r.ruleJson)])).toEqual([
      ["tab2.itemCd", { kind: "fixed", value: "T2" }],
      ["itemCd", { kind: "fixed", value: "P-9" }],
      ["fromDt", { kind: "relative", base: "monthStart", months: -1 }],
      ["fromDt~to", { kind: "relative", base: "monthEnd", months: -1 }],
    ]);
    expect(byTestId("search-defaults-dialog")).toBeNull();
    expect(latest.item).toBe("P-9");
    expect(latest.from < latest.to).toBe(true);
    expect(searches).toBe(0);
  });

  it("일괄 옵션 「마지막 조회값」 은 모든 칸 줄을 채우고, 저장은 칸별 규칙 행이다", async () => {
    await mount(inPage(createElement(Screen)));
    await openMenuItem("search-settings-open");
    await click(byTestId("search-defaults-bulk-last"));
    expect(byTestId<HTMLSelectElement>("sd-mode-itemCd")!.value).toBe("last");
    expect(byTestId<HTMLSelectElement>("sd-mode-fromDt")!.value).toBe("last");
    await click(byTestId("search-defaults-dialog-save"));
    await flush();
    expect(getPageSearchDefaults(USER, PAGE)).toEqual({
      itemCd: { kind: "last" },
      useTp: { kind: "last" },
      fromDt: { kind: "last" },
      "fromDt~to": { kind: "last" },
    });
  });

  it("다시 열면 저장한 묶음이 그대로 보인다", async () => {
    given({ fromDt: { kind: "relative", base: "today", days: -6 }, "fromDt~to": { kind: "relative", base: "today" } });
    await mount(inPage(createElement(Screen)));
    await openMenuItem("search-settings-open");
    expect(byTestId<HTMLSelectElement>("sd-mode-fromDt")!.value).toBe("range");
    expect(byTestId<HTMLSelectElement>("sd-range-fromDt")!.value).toBe("last7");
  });

  it("저장 실패면 창을 닫지 않고 오류를 보인다", async () => {
    failSave = true;
    await mount(inPage(createElement(Screen)));
    await openMenuItem("search-settings-open");
    await changeSelect("sd-mode-itemCd", "fixed");
    await typeInto("sd-fixed-itemCd", "X");
    await click(byTestId("search-defaults-dialog-save"));
    await flush();
    expect(byTestId("search-defaults-dialog")).not.toBeNull();
    expect(byTestId("search-defaults-dialog-error")?.textContent).toContain("서버 거절");
    expect(latest.item).toBe("");
  });

  it("시작이 끝보다 늦은 기간은 저장 단추가 막힌다", async () => {
    await mount(inPage(createElement(Screen)));
    await openMenuItem("search-settings-open");
    await changeSelect("sd-mode-fromDt", "relative");
    await changeSelect("sd-rel-fromDt-preset", "daysAfter");
    expect(byTestId("sd-error-fromDt")?.textContent).toBe("시작이 끝보다 늦습니다");
    expect(byTestId<HTMLButtonElement>("search-defaults-dialog-save")!.disabled).toBe(true);
  });

  it("창 안 입력에서 Enter 를 쳐도 조회하지 않고, 창이 열려 있으면 F8 조회가 막힌다", async () => {
    await mount(inPage(createElement(Screen, { withLayout: true })));
    await openMenuItem("search-settings-open");
    await changeSelect("sd-mode-itemCd", "fixed");
    const input = byTestId<HTMLInputElement>("sd-fixed-itemCd")!;
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      input.form?.requestSubmit();
    });
    expect(input.form ?? null).toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "F8", bubbles: true }));
    });
    expect(searches).toBe(0);
  });
});

describe("메뉴", () => {
  it("지금 조건을 기본값으로 — 확인 뒤 칸 값을 고정 값으로 저장한다(빈 텍스트·날짜는 빼고 select 는 남김)", async () => {
    await mount(inPage(createElement(Screen)));
    await openMenuItem("search-settings-save-current");
    expect(byTestId("search-settings-confirm")?.textContent).toContain("날짜 칸은 오늘 날짜로 고정");
    const ok = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "확인");
    await click(ok ?? null);
    await flush();
    expect(getPageSearchDefaults(USER, PAGE)).toEqual({ useTp: { kind: "fixed", value: "Y" } });
  });

  it("내 기본값 초기화 — 남는 규칙이 없으면 resetPage, 다른 영역 규칙이 있으면 그것만 남겨 savePage", async () => {
    given({ itemCd: { kind: "fixed", value: "A" } });
    await mount(inPage(createElement(Screen)));
    await openMenuItem("search-settings-reset");
    const ok = () => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "확인") ?? null;
    await click(ok());
    await flush();
    expect(calls.some(([a]) => a === "resetPage")).toBe(true);
    expect(latest.item).toBe("A"); // 지금 칸 값은 그대로

    rendered!.unmount();
    rendered = null;
    resetSearchDefaultsStore();
    calls = [];
    given({ itemCd: { kind: "fixed", value: "A" }, "tab2.itemCd": { kind: "fixed", value: "T2" } });
    await mount(inPage(createElement(Screen, { second: true })));
    await openMenuItem("search-settings-reset", 0);
    await click(ok());
    await flush();
    expect(calls.some(([a]) => a === "resetPage")).toBe(false);
    expect(getPageSearchDefaults(USER, PAGE)).toEqual({ "tab2.itemCd": { kind: "fixed", value: "T2" } });
  });
});
