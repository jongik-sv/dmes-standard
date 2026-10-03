/** @vitest-environment happy-dom */
/**
 * 단위 계산기 렌더러·편집기 동작 시험.
 * - shared 의 폼 부품(@dk-oasis/shared/form)은 대역으로 바꾼다(Mantine 은 MantineProvider 가 필요하다). 복사(copyText)도 대역이다.
 * - 계산·서식은 실물(units·unit-format·unit-model — @dk-oasis/shared/evalex 의 D)을 쓴다.
 * - JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UNIT_ABSOLUTE_ZERO_WARNING, UNIT_DEFAULT_OUTSIDE_ERROR, unitUnknownCategoryError } from "./unit-model";

const h = vi.hoisted(() => ({
  copyText: vi.fn<(text: string) => Promise<boolean>>(),
}));

vi.mock("@dk-oasis/shared/form", async () => {
  const { createElement: el } = await import("react");
  type Opt = string | { value: string; label: string };
  return {
    copyText: (text: string) => h.copyText(text),
    Button: (p: {
      children?: unknown;
      onClick?: () => void;
      disabled?: boolean;
      ariaLabel?: string;
      className?: string;
      "data-testid"?: string;
    }) =>
      el(
        "button",
        { type: "button", onClick: p.onClick, disabled: p.disabled, "aria-label": p.ariaLabel, className: p.className, "data-testid": p["data-testid"] },
        p.children as never
      ),
    Input: (p: {
      value?: string | number;
      onChange?: (v: string) => void;
      maxLength?: number;
      "aria-label"?: string;
      "data-testid"?: string;
    }) =>
      el("input", {
        type: "text",
        value: p.value,
        maxLength: p.maxLength,
        "aria-label": p["aria-label"],
        "data-testid": p["data-testid"],
        onChange: (e: { currentTarget: { value: string } }) => p.onChange?.(e.currentTarget.value),
      }),
    Select: (p: {
      value?: string;
      onChange?: (v: string) => void;
      options?: Opt[];
      placeholder?: string;
      "aria-label"?: string;
      "data-testid"?: string;
    }) =>
      el(
        "select",
        {
          value: p.value,
          "aria-label": p["aria-label"],
          "data-testid": p["data-testid"],
          onChange: (e: { currentTarget: { value: string } }) => p.onChange?.(e.currentTarget.value),
        },
        [...(p.placeholder ? [{ value: "", label: p.placeholder }] : []), ...(p.options ?? [])].map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return el("option", { key: opt.value, value: opt.value }, opt.label);
        })
      ),
    SegmentedControl: (p: { value: string; onChange?: (v: string) => void; options: { value: string; label: string }[]; testId?: string }) =>
      el(
        "div",
        { role: "radiogroup", "data-testid": p.testId },
        p.options.map((o) =>
          el("button", { key: o.value, type: "button", "data-value": o.value, "aria-pressed": p.value === o.value, onClick: () => p.onChange?.(o.value) }, o.label)
        )
      ),
    Checkbox: (p: { checked?: boolean; onChange?: (c: boolean) => void; label?: string }) =>
      el(
        "label",
        null,
        el("input", { type: "checkbox", checked: !!p.checked, onChange: (e: { currentTarget: { checked: boolean } }) => p.onChange?.(e.currentTarget.checked) }),
        p.label
      ),
    FormGroup: (p: { label?: string; children?: unknown }) => el("div", { "data-group": p.label }, p.children as never),
  };
});

const { default: UnitConverterRenderer } = await import("./renderer");
const { default: UnitConverterEditor } = await import("./editor");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 메모리 저장소 대역 — Node 22+ 는 `--localstorage-file` 없이는 전역 localStorage 가 undefined 인 접근자를 갖고 있어
 * happy-dom 환경에서도 window.localStorage 가 비어 있다. 시험마다 새 저장소를 window.localStorage 로 꽂는다.
 */
class MemoryStorage {
  private readonly map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, v: string) {
    this.map.set(key, String(v));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
}

const ownStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
let store: MemoryStorage;

function useStore() {
  Object.defineProperty(window, "localStorage", { configurable: true, get: () => store });
}

afterAll(() => {
  if (ownStorageDescriptor) Object.defineProperty(window, "localStorage", ownStorageDescriptor);
  else delete (window as unknown as { localStorage?: unknown }).localStorage;
});

let container: HTMLDivElement;
let root: Root;
let unmounted = false;

function unmount() {
  if (unmounted) return;
  unmounted = true;
  act(() => root.unmount());
}

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  unmounted = false;
}

beforeEach(() => {
  h.copyText.mockReset();
  h.copyText.mockImplementation(async () => true);
  store = new MemoryStorage();
  useStore();
  mount();
});

afterEach(() => {
  unmount();
  container.remove();
  vi.restoreAllMocks();
});

const q = (testId: string) => container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const must = (testId: string) => {
  const found = q(testId);
  if (!found) throw new Error(`[data-testid="${testId}"] 가 없습니다. 지금 화면: ${container.innerHTML.slice(0, 600)}`);
  return found;
};
const text = (testId: string) => must(testId).textContent;
const value = (testId: string) => (must(testId) as HTMLInputElement | HTMLSelectElement).value;
const rowTexts = () =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="unit-row-"]')).map((b) => [b.getAttribute("data-testid")!.replace("unit-row-", ""), b.querySelector(".mcm-uc__row-val")!.textContent]);
const rowIds = () => rowTexts().map(([id]) => id);

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function click(testId: string) {
  await act(async () => {
    must(testId).click();
  });
  await flush();
}

async function typeInto(testId: string, v: string) {
  const el = must(testId) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function choose(testId: string, v: string) {
  const el = must(testId) as HTMLSelectElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

interface RenderProps {
  definition?: unknown;
  widgetId?: string;
  instanceId?: string;
}

async function renderWidget(p: RenderProps = {}) {
  const props = {
    instanceId: p.instanceId ?? "inst-1",
    widgetId: p.widgetId ?? "def.abc12345",
    definition: p.definition ?? { categories: [], defaultCategory: "length" },
    refreshKey: 0,
    size: { w: 8, h: 12 },
    config: null,
  };
  await act(async () => {
    root.render(createElement(UnitConverterRenderer, props as never));
  });
  await flush();
}

describe("처음 화면", () => {
  it("전체 분류(9개)는 Select 로, 기본은 길이 mm → in, 값 1", async () => {
    await renderWidget();
    const category = must("unit-category");
    expect(category.tagName).toBe("SELECT");
    expect(Array.from(category.querySelectorAll("option")).map((o) => o.value)).toEqual([
      "length",
      "mass",
      "area",
      "volume",
      "temperature",
      "pressure",
      "force",
      "speed",
      "energy",
    ]);
    expect(value("unit-category")).toBe("length");
    expect(value("unit-input")).toBe("1");
    expect(value("unit-from")).toBe("mm");
    expect(value("unit-to")).toBe("in");
    expect(text("unit-result")).toBe("0.03937007874");
    expect(rowIds()).toEqual(["mm", "cm", "m", "km", "in", "ft", "yd", "mi"]);
    expect(must("unit-row-in").getAttribute("aria-pressed")).toBe("true");
    expect(must("unit-row-mm").getAttribute("aria-pressed")).toBe("false");
  });

  it("설정의 기본 분류로 시작한다", async () => {
    await renderWidget({ definition: { categories: [], defaultCategory: "pressure" } });
    expect(value("unit-category")).toBe("pressure");
    expect(value("unit-from")).toBe("mpa");
    expect(value("unit-to")).toBe("kgfcm2");
    expect(text("unit-result")).toBe("10.19716213");
  });

  it("설정이 없어도(definition null) 그려진다", async () => {
    await renderWidget({ definition: null });
    expect(value("unit-category")).toBe("length");
    expect(rowIds()).toHaveLength(8);
  });
});

describe("값을 넣으면 결과와 전체 목록이 바뀐다", () => {
  it("입력 즉시 결과·목록이 바뀐다", async () => {
    await renderWidget();
    await typeInto("unit-input", "25.4");
    expect(text("unit-result")).toBe("1");
    expect(rowTexts()).toEqual([
      ["mm", "25.4"],
      ["cm", "2.54"],
      ["m", "0.0254"],
      ["km", "0.0000254"],
      ["in", "1"],
      ["ft", "0.08333333333"],
      ["yd", "0.02777777778"],
      ["mi", "0.00001578282828"],
    ]);
  });

  it("쉼표·공백은 무시하고 결과에는 천 단위 쉼표를 넣는다", async () => {
    await renderWidget();
    await choose("unit-to", "m");
    await typeInto("unit-input", " 1,234,567 ");
    expect(text("unit-result")).toBe("1,234.567");
    await choose("unit-from", "km");
    await choose("unit-to", "mm");
    await typeInto("unit-input", "1");
    expect(text("unit-result")).toBe("1,000,000");
  });

  it("숫자가 아니면 결과 칸에 「숫자를 입력하세요」, 목록은 –, 복사는 막힌다", async () => {
    await renderWidget();
    for (const bad of ["abc", "", "1.2.3", "Infinity"]) {
      await typeInto("unit-input", bad);
      expect(text("unit-result"), bad).toBe("숫자를 입력하세요");
      expect(rowTexts().every(([, t]) => t === "–"), bad).toBe(true);
      expect((must("unit-copy") as HTMLButtonElement).disabled, bad).toBe(true);
    }
    await typeInto("unit-input", "2");
    expect((must("unit-copy") as HTMLButtonElement).disabled).toBe(false);
    expect(text("unit-result")).toBe("0.07874015748");
  });

  it("음수는 모든 분류에서 받는다", async () => {
    await renderWidget();
    await typeInto("unit-input", "-25.4");
    expect(text("unit-result")).toBe("-1");
    await choose("unit-category", "pressure");
    await typeInto("unit-input", "-1");
    expect(text("unit-result")).toBe("-10.19716213");
  });

  it("절대영도 아래 온도는 계산하고 경고를 보인다", async () => {
    await renderWidget();
    await choose("unit-category", "temperature");
    expect(q("unit-warn")).toBeNull();
    await typeInto("unit-input", "-300");
    expect(text("unit-result")).toBe("-508");
    expect(text("unit-warn")).toBe(UNIT_ABSOLUTE_ZERO_WARNING);
    await typeInto("unit-input", "-273.15");
    expect(q("unit-warn")).toBeNull();
    await choose("unit-category", "length");
    await typeInto("unit-input", "-300");
    expect(q("unit-warn")).toBeNull();
  });

  it("100 °C = 212 °F = 373.15 K, -40 °C = -40 °F", async () => {
    await renderWidget();
    await choose("unit-category", "temperature");
    await typeInto("unit-input", "100");
    expect(text("unit-result")).toBe("212");
    expect(rowTexts()).toEqual([
      ["celsius", "100"],
      ["fahrenheit", "212"],
      ["kelvin", "373.15"],
    ]);
    await typeInto("unit-input", "-40");
    expect(text("unit-result")).toBe("-40");
  });
});

describe("분류·단위 선택", () => {
  it("분류를 바꾸면 그 분류의 단위·목록으로 바뀌고 입력값은 이어진다", async () => {
    await renderWidget();
    await typeInto("unit-input", "5");
    await choose("unit-category", "pressure");
    expect(value("unit-input")).toBe("5");
    expect(value("unit-from")).toBe("mpa");
    expect(value("unit-to")).toBe("kgfcm2");
    expect(rowIds()).toEqual(["pa", "kpa", "mpa", "bar", "atm", "psi", "kgfcm2", "kgfmm2", "mmhg"]);
    expect(text("unit-result")).toBe("50.98581065");
  });

  it("분류별로 고른 단위를 따로 기억해 돌아오면 그대로다", async () => {
    await renderWidget();
    await choose("unit-from", "ft");
    await choose("unit-to", "m");
    await choose("unit-category", "mass");
    expect(value("unit-from")).toBe("kg");
    await choose("unit-category", "length");
    expect(value("unit-from")).toBe("ft");
    expect(value("unit-to")).toBe("m");
  });

  it("목록 줄을 누르면 그 단위가 「변환 후」 단위가 된다", async () => {
    await renderWidget();
    await typeInto("unit-input", "100");
    await click("unit-row-cm");
    expect(value("unit-to")).toBe("cm");
    expect(text("unit-result")).toBe("10");
    expect(must("unit-row-cm").getAttribute("aria-pressed")).toBe("true");
    expect(must("unit-row-in").getAttribute("aria-pressed")).toBe("false");
    await click("unit-row-ft");
    expect(value("unit-to")).toBe("ft");
    expect(text("unit-result")).toBe("0.3280839895");
    expect(value("unit-from")).toBe("mm");
  });

  it("「변환 전」 단위를 바꾸면 결과·목록이 다시 계산된다", async () => {
    await renderWidget();
    await choose("unit-from", "m");
    await choose("unit-to", "mm");
    expect(text("unit-result")).toBe("1,000");
    expect(rowTexts().find(([id]) => id === "km")?.[1]).toBe("0.001");
  });

  it("보일 분류가 4개 이하면 SegmentedControl, 5개 이상이면 Select, 1개면 이름만", async () => {
    await renderWidget({ definition: { categories: ["length", "mass", "area"], defaultCategory: "mass" } });
    const seg = must("unit-category");
    expect(seg.getAttribute("role")).toBe("radiogroup");
    expect(Array.from(seg.querySelectorAll("button")).map((b) => b.getAttribute("data-value"))).toEqual(["length", "mass", "area"]);
    expect(seg.querySelector('[aria-pressed="true"]')?.getAttribute("data-value")).toBe("mass");
    expect(value("unit-from")).toBe("kg");
    await act(async () => {
      seg.querySelector<HTMLElement>('[data-value="area"]')!.click();
    });
    expect(rowIds()).toEqual(["mm2", "cm2", "m2", "km2", "ha", "pyeong", "ft2", "in2"]);
    expect(text("unit-result")).toBe("0.3025"); // 1 m² → 평

    unmount();
    mount();
    await renderWidget({ definition: { categories: ["length", "mass", "area", "volume", "force"], defaultCategory: "length" } });
    expect(must("unit-category").tagName).toBe("SELECT");
    expect(Array.from(must("unit-category").querySelectorAll("option")).map((o) => o.value)).toEqual(["length", "mass", "area", "volume", "force"]);

    unmount();
    mount();
    await renderWidget({ definition: { categories: ["pressure"], defaultCategory: "pressure" } });
    expect(must("unit-category").tagName).toBe("SPAN");
    expect(text("unit-category")).toBe("압력");
    expect(value("unit-from")).toBe("mpa");
  });
});

describe("[⇄] 바꾸기", () => {
  it("두 단위가 서로 바뀌고 결과가 입력으로 이어져 결과가 원래 입력이 된다", async () => {
    await renderWidget();
    await typeInto("unit-input", "25.4");
    expect(text("unit-result")).toBe("1");
    await click("unit-swap");
    expect(value("unit-from")).toBe("in");
    expect(value("unit-to")).toBe("mm");
    expect(value("unit-input")).toBe("1");
    expect(text("unit-result")).toBe("25.4");
    await click("unit-swap");
    expect(value("unit-from")).toBe("mm");
    expect(value("unit-to")).toBe("in");
    expect(value("unit-input")).toBe("25.4");
    expect(text("unit-result")).toBe("1");
  });

  it("이어지는 값에는 쉼표를 넣지 않는다", async () => {
    await renderWidget();
    await choose("unit-from", "km");
    await choose("unit-to", "mm");
    await typeInto("unit-input", "1");
    expect(text("unit-result")).toBe("1,000,000");
    await click("unit-swap");
    expect(value("unit-input")).toBe("1000000");
    expect(text("unit-result")).toBe("1");
  });

  it("지수 표기 결과도 입력으로 이어져 되돌아온다", async () => {
    await renderWidget();
    await choose("unit-from", "km");
    await choose("unit-to", "mm");
    await typeInto("unit-input", "1e10");
    expect(text("unit-result")).toBe("1e+16");
    await click("unit-swap");
    expect(value("unit-input")).toBe("1e+16");
    expect(value("unit-from")).toBe("mm");
    expect(text("unit-result")).toBe("10,000,000,000");
  });

  it("입력이 숫자가 아니면 단위만 바뀌고 입력은 그대로다", async () => {
    await renderWidget();
    await typeInto("unit-input", "abc");
    await click("unit-swap");
    expect(value("unit-from")).toBe("in");
    expect(value("unit-to")).toBe("mm");
    expect(value("unit-input")).toBe("abc");
    expect(text("unit-result")).toBe("숫자를 입력하세요");
  });

  it("온도도 이어진다 — 100 °C → 212 °F, 바꾸면 212 °F → 100 °C", async () => {
    await renderWidget();
    await choose("unit-category", "temperature");
    await typeInto("unit-input", "100");
    expect(text("unit-result")).toBe("212");
    await click("unit-swap");
    expect(value("unit-input")).toBe("212");
    expect(value("unit-from")).toBe("fahrenheit");
    expect(text("unit-result")).toBe("100");
  });
});

describe("복사", () => {
  it("쉼표 없는 결과를 클립보드에 보내고, 복사 표시가 잠시 바뀐다", async () => {
    await renderWidget();
    await choose("unit-from", "km");
    await choose("unit-to", "mm");
    await click("unit-copy");
    expect(h.copyText).toHaveBeenCalledTimes(1);
    expect(h.copyText).toHaveBeenCalledWith("1000000");
    expect(must("unit-copy").querySelector(".tabler-icon-check")).not.toBeNull();
  });

  it("클립보드가 막혀 실패를 돌려주거나 예외를 던져도 조용히 넘어간다", async () => {
    await renderWidget();
    h.copyText.mockImplementation(async () => false);
    await click("unit-copy");
    expect(must("unit-copy").querySelector(".tabler-icon-check")).toBeNull();
    h.copyText.mockImplementation(async () => {
      throw new Error("denied");
    });
    await click("unit-copy");
    expect(h.copyText).toHaveBeenCalledTimes(2);
    expect(text("unit-result")).toBe("0.03937007874");
  });

  it("숫자가 아니면 복사하지 않는다", async () => {
    await renderWidget();
    await typeInto("unit-input", "x");
    await click("unit-copy");
    expect(h.copyText).not.toHaveBeenCalled();
  });
});

describe("브라우저 기억(localStorage)", () => {
  const KEY = "dmes:widget:unit-converter:inst-1";

  it("기억한 분류·단위·입력값이 다시 그릴 때 복원된다", async () => {
    await renderWidget();
    await choose("unit-category", "pressure");
    await choose("unit-to", "psi");
    await typeInto("unit-input", "55");
    expect(text("unit-result")).toBe("7,977.075575"); // 55 MPa → psi
    const before = text("unit-result");
    unmount();
    container.remove();
    mount();
    await renderWidget();
    expect(value("unit-category")).toBe("pressure");
    expect(value("unit-from")).toBe("mpa");
    expect(value("unit-to")).toBe("psi");
    expect(value("unit-input")).toBe("55");
    expect(text("unit-result")).toBe(before);
  });

  it("저장하는 값 — 인스턴스별 키에 분류·단위·입력값이 들어 있다", async () => {
    await renderWidget();
    await choose("unit-category", "mass");
    await choose("unit-to", "oz");
    await typeInto("unit-input", "7");
    const saved = JSON.parse(store.getItem(KEY)!);
    expect(saved.category).toBe("mass");
    expect(saved.text).toBe("7");
    expect(saved.units.mass).toEqual({ from: "kg", to: "oz" });
  });

  it("다른 인스턴스는 기억이 따로다", async () => {
    await renderWidget({ instanceId: "inst-1" });
    await choose("unit-category", "force");
    await typeInto("unit-input", "9");
    unmount();
    container.remove();
    mount();
    await renderWidget({ instanceId: "inst-2" });
    expect(value("unit-category")).toBe("length");
    expect(value("unit-input")).toBe("1");
    expect(store.getItem("dmes:widget:unit-converter:inst-2")).not.toBeNull();
  });

  it("[⇄] 와 목록 줄 선택도 기억한다", async () => {
    await renderWidget();
    await typeInto("unit-input", "25.4");
    await click("unit-swap");
    await click("unit-row-cm");
    unmount();
    container.remove();
    mount();
    await renderWidget();
    expect(value("unit-from")).toBe("in");
    expect(value("unit-to")).toBe("cm");
    expect(value("unit-input")).toBe("1");
  });

  it("기억한 분류가 설정에서 빠졌으면 기본 분류로 돌아간다", async () => {
    store.setItem(KEY, JSON.stringify({ v: 1, category: "pressure", units: { pressure: { from: "bar", to: "psi" } }, text: "42" }));
    await renderWidget({ definition: { categories: ["length", "mass"], defaultCategory: "mass" } });
    expect(must("unit-category").getAttribute("role")).toBe("radiogroup");
    expect(must("unit-category").querySelector('[aria-pressed="true"]')?.getAttribute("data-value")).toBe("mass");
    expect(value("unit-from")).toBe("kg");
    expect(value("unit-to")).toBe("lb");
    expect(value("unit-input")).toBe("42"); // 입력값은 분류와 상관없이 이어진다
  });

  it("기억한 분류가 설정 안이면 그대로 쓴다", async () => {
    store.setItem(KEY, JSON.stringify({ v: 1, category: "length", units: { length: { from: "yd", to: "ft" } }, text: "3" }));
    await renderWidget({ definition: { categories: ["length", "mass"], defaultCategory: "mass" } });
    expect(must("unit-category").querySelector('[aria-pressed="true"]')?.getAttribute("data-value")).toBe("length");
    expect(value("unit-from")).toBe("yd");
    expect(value("unit-to")).toBe("ft");
    expect(text("unit-result")).toBe("9");
  });

  it("깨진 기억·모르는 단위는 무시하고 기본값으로 그린다", async () => {
    store.setItem(KEY, "{깨짐");
    await renderWidget();
    expect(value("unit-category")).toBe("length");
    expect(value("unit-input")).toBe("1");
    unmount();
    container.remove();
    store.setItem(KEY, JSON.stringify({ v: 1, category: "length", units: { length: { from: "zz", to: "ft" } }, text: "2" }));
    mount();
    await renderWidget();
    expect(value("unit-from")).toBe("mm");
    expect(value("unit-to")).toBe("ft");
  });

  it("관리 화면 미리보기(instanceId preview·widgetId def.preview)와 인스턴스 없음은 기억하지 않는다", async () => {
    await renderWidget({ instanceId: "preview", widgetId: "def.preview" });
    await choose("unit-category", "pressure");
    await typeInto("unit-input", "8");
    expect(store.length).toBe(0);

    unmount();
    container.remove();
    mount();
    await renderWidget({ instanceId: "", widgetId: "def.abc12345" });
    await typeInto("unit-input", "9");
    expect(store.length).toBe(0);
    expect(value("unit-input")).toBe("9");
  });

  it("미리보기는 저장돼 있던 값을 읽지도 않는다", async () => {
    store.setItem("dmes:widget:unit-converter:preview", JSON.stringify({ v: 1, category: "mass", units: {}, text: "77" }));
    await renderWidget({ instanceId: "preview", widgetId: "def.preview" });
    expect(value("unit-category")).toBe("length");
    expect(value("unit-input")).toBe("1");
  });
});

describe("저장소가 막혀 있어도 정상 동작한다", () => {
  function blockStorage() {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
    expect(() => window.localStorage).toThrow();
    return useStore;
  }

  it("localStorage 접근 자체가 예외를 던져도 그려지고 계산·바꾸기가 된다", async () => {
    const restore = blockStorage();
    try {
      await renderWidget();
      expect(text("unit-result")).toBe("0.03937007874");
      await typeInto("unit-input", "25.4");
      expect(text("unit-result")).toBe("1");
      await choose("unit-category", "pressure");
      await click("unit-swap");
      expect(value("unit-from")).toBe("kgfcm2");
      await click("unit-row-psi");
      expect(value("unit-to")).toBe("psi");
    } finally {
      restore();
    }
  });

  it("getItem·setItem 이 예외를 던져도 그려지고 동작한다", async () => {
    const getItem = vi.spyOn(store, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const setItem = vi.spyOn(store, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    await renderWidget();
    await typeInto("unit-input", "100");
    expect(text("unit-result")).toBe("3.937007874");
    expect(getItem).toHaveBeenCalled();
    expect(setItem).toHaveBeenCalled();
  });

  it("저장소가 아예 없어도(undefined) 그려진다", async () => {
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => undefined });
    try {
      await renderWidget();
      await typeInto("unit-input", "100");
      expect(text("unit-result")).toBe("3.937007874");
    } finally {
      useStore();
    }
  });
});

describe("편집기", () => {
  const onChange = vi.fn();
  const onValidate = vi.fn();

  beforeEach(() => {
    onChange.mockReset();
    onValidate.mockReset();
  });

  async function renderEditor(val: unknown) {
    await act(async () => {
      root.render(createElement(UnitConverterEditor, { value: val, onChange, onValidate } as never));
    });
    await flush();
  }

  const box = (id: string) => container.querySelector<HTMLInputElement>(`[data-testid="widget-unit-cat-${id}"] input`)!;
  const checkedIds = () => Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="widget-unit-cat-"]')).filter((d) => d.querySelector("input")!.checked).map((d) => d.getAttribute("data-testid")!.replace("widget-unit-cat-", ""));

  it("처음 설정은 아무것도 체크되지 않고 「전체」 안내, 기본 분류는 길이, 오류 없음", async () => {
    await renderEditor({ categories: [], defaultCategory: "length" });
    expect(container.querySelectorAll('[data-testid^="widget-unit-cat-"]')).toHaveLength(9);
    expect(checkedIds()).toEqual([]);
    expect(text("widget-unit-note")).toBe("아무것도 고르지 않으면 전체 분류를 보입니다.");
    expect(value("widget-unit-default")).toBe("length");
    expect(Array.from(must("widget-unit-default").querySelectorAll("option")).map((o) => o.value)).toEqual(["", "length", "mass", "area", "volume", "temperature", "pressure", "force", "speed", "energy"]);
    expect(onValidate).toHaveBeenLastCalledWith([]);
    expect((must("widget-unit-select-none") as HTMLButtonElement).disabled).toBe(true);
  });

  it("체크하면 알려진 분류만 표 순서로 올리고 기본 분류를 보일 분류 안으로 맞춘다", async () => {
    await renderEditor({ categories: [], defaultCategory: "length" });
    await act(async () => {
      box("pressure").click();
    });
    expect(onChange).toHaveBeenLastCalledWith({ categories: ["pressure"], defaultCategory: "pressure" });
  });

  it("체크를 풀면 기본 분류가 빠졌을 때 첫 분류(length 우선)로 맞춘다", async () => {
    await renderEditor({ categories: ["length", "mass"], defaultCategory: "mass" });
    expect(checkedIds()).toEqual(["length", "mass"]);
    expect(text("widget-unit-note")).toBe("2개 분류를 보입니다.");
    expect(Array.from(must("widget-unit-default").querySelectorAll("option")).map((o) => o.value)).toEqual(["", "length", "mass"]);
    await act(async () => {
      box("mass").click();
    });
    expect(onChange).toHaveBeenLastCalledWith({ categories: ["length"], defaultCategory: "length" });
  });

  it("전체 선택·전체 해제", async () => {
    await renderEditor({ categories: ["mass"], defaultCategory: "mass" });
    await click("widget-unit-select-all");
    expect(onChange).toHaveBeenLastCalledWith({
      categories: ["length", "mass", "area", "volume", "temperature", "pressure", "force", "speed", "energy"],
      defaultCategory: "mass",
    });
    await click("widget-unit-select-none");
    expect(onChange).toHaveBeenLastCalledWith({ categories: [], defaultCategory: "mass" });
  });

  it("기본 분류는 보일 분류 안에서만 고른다", async () => {
    await renderEditor({ categories: ["length", "mass"], defaultCategory: "length" });
    await choose("widget-unit-default", "mass");
    expect(onChange).toHaveBeenLastCalledWith({ categories: ["length", "mass"], defaultCategory: "mass" });
    onChange.mockClear();
    await choose("widget-unit-default", "pressure"); // 목록에 없는 값은 받지 않는다
    expect(onChange).not.toHaveBeenCalled();
  });

  it("모르는 분류 id 는 검증 오류로 알리고, 체크를 바꾸면 모르는 id 는 떨어진다", async () => {
    await renderEditor({ categories: ["length", "zzz"], defaultCategory: "length" });
    expect(onValidate).toHaveBeenLastCalledWith([unitUnknownCategoryError("zzz")]);
    expect(checkedIds()).toEqual(["length"]);
    await act(async () => {
      box("mass").click();
    });
    expect(onChange).toHaveBeenLastCalledWith({ categories: ["length", "mass"], defaultCategory: "length" });
  });

  it("기본 분류가 보일 분류 밖이면 검증 오류를 알리고 선택칸은 「선택하세요」다", async () => {
    await renderEditor({ categories: ["length", "mass"], defaultCategory: "pressure" });
    expect(onValidate).toHaveBeenLastCalledWith([UNIT_DEFAULT_OUTSIDE_ERROR]);
    expect(value("widget-unit-default")).toBe("");
  });

  it("설정이 비어 있어도(undefined) 그려지고 오류가 없다", async () => {
    await renderEditor(undefined);
    expect(onValidate).toHaveBeenLastCalledWith([]);
    expect(value("widget-unit-default")).toBe("length");
  });
});
