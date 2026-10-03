/** @vitest-environment happy-dom */
/**
 * 단위 계산기 렌더러·편집기 동작 시험.
 * - shared 의 폼 부품(@dk-oasis/shared/form)은 대역으로 바꾼다(Mantine 은 MantineProvider 가 필요하다). 복사(copyText)도 대역이다.
 * - 현재 사용자(./unit-user — shared 포털 셸의 `/api/auth/me` 확인)도 대역이다. h.peek = 첫 렌더에 쓰는 마지막 확인 사용자, h.userId = 확인된 사용자.
 * - 계산·서식은 실물(units·unit-format·unit-model — @dk-oasis/shared/evalex 의 D)을 쓴다.
 * - JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UNIT_ABSOLUTE_ZERO_WARNING, UNIT_DEFAULT_OUTSIDE_ERROR, UNIT_EDITOR_ALL_NOTE, unitUnknownCategoryError } from "./unit-model";
import { SAVE_DELAY_MS } from "./use-unit-state";

const h = vi.hoisted(() => ({
  copyText: vi.fn<(text: string) => Promise<boolean>>(),
  peek: "u1",
  userId: "u1",
}));

vi.mock("./unit-user", () => ({
  peekUserId: () => h.peek,
  useConfirmedUserId: (enabled: boolean) => (enabled ? h.userId : ""),
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
      title?: string;
      className?: string;
      "data-testid"?: string;
    }) =>
      el(
        "button",
        { type: "button", onClick: p.onClick, disabled: p.disabled, "aria-label": p.ariaLabel, title: p.title, className: p.className, "data-testid": p["data-testid"] },
        p.children as never
      ),
    Input: (p: {
      value?: string | number;
      onChange?: (v: string) => void;
      maxLength?: number;
      inputMode?: "text" | "decimal";
      "aria-label"?: string;
      "aria-invalid"?: boolean;
      "aria-describedby"?: string;
      "data-testid"?: string;
    }) =>
      el("input", {
        type: "text",
        value: p.value,
        maxLength: p.maxLength,
        inputMode: p.inputMode,
        "aria-label": p["aria-label"],
        "aria-invalid": p["aria-invalid"],
        "aria-describedby": p["aria-describedby"],
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
    Checkbox: (p: { checked?: boolean; disabled?: boolean; onChange?: (c: boolean) => void; label?: string }) =>
      el(
        "label",
        null,
        el("input", {
          type: "checkbox",
          checked: !!p.checked,
          disabled: !!p.disabled,
          onChange: (e: { currentTarget: { checked: boolean } }) => p.onChange?.(e.currentTarget.checked),
        }),
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
  h.peek = "u1";
  h.userId = "u1";
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

/** 기억 디바운스(SAVE_DELAY_MS)가 지나 localStorage 에 쓰이도록 기다린다. */
async function settled() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, SAVE_DELAY_MS + 80));
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

  it("쉼표는 천 단위 모양만 받는다 — 1,5·1,2,3 은 숫자가 아니다", async () => {
    await renderWidget();
    await choose("unit-from", "m");
    await choose("unit-to", "m");
    for (const [input, shown] of [
      ["1,234", "1,234"],
      ["1,234,567.5", "1,234,567.5"],
      [" 12 345 ", "12,345"],
    ]) {
      await typeInto("unit-input", input);
      expect(text("unit-result"), input).toBe(shown);
    }
    for (const bad of ["1,5", "1,2,3", "12,34", ",5", "1,234,"]) {
      await typeInto("unit-input", bad);
      expect(text("unit-result"), bad).toBe("숫자를 입력하세요");
      expect(must("unit-input").getAttribute("aria-invalid"), bad).toBe("true");
    }
  });

  it("전각 숫자·쉼표·마침표·부호는 반각으로 읽는다", async () => {
    await renderWidget();
    await choose("unit-from", "m");
    await choose("unit-to", "m");
    await typeInto("unit-input", "１２");
    expect(text("unit-result")).toBe("12");
    await typeInto("unit-input", "－１，２３４．５");
    expect(text("unit-result")).toBe("-1,234.5");
    await typeInto("unit-input", "１２Ａ");
    expect(text("unit-result")).toBe("숫자를 입력하세요");
  });

  it("지수가 너무 크거나 작으면 무한대 대신 「값이 너무 큽니다」·「값이 너무 작습니다」, 복사는 막힌다", async () => {
    await renderWidget();
    await choose("unit-from", "km");
    await choose("unit-to", "mm");
    await typeInto("unit-input", "1e9000000000000000");
    expect(text("unit-result")).toBe("값이 너무 큽니다");
    expect(rowTexts().every(([, t]) => t === "–")).toBe(true);
    expect((must("unit-copy") as HTMLButtonElement).disabled).toBe(true);
    expect(must("unit-input").getAttribute("aria-invalid")).toBe("true");
    await typeInto("unit-input", "1e-5000");
    expect(text("unit-result")).toBe("값이 너무 작습니다");
    await typeInto("unit-input", "1e1000");
    expect(text("unit-result")).toBe("1e+1006");
    expect((must("unit-copy") as HTMLButtonElement).disabled).toBe(false);
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

describe("접근성", () => {
  it("결과 칸은 라이브 영역(role=status·aria-live=polite)이고, 역할 없는 상자의 aria-label 은 없다", async () => {
    await renderWidget();
    const result = must("unit-result");
    expect(result.getAttribute("role")).toBe("status");
    expect(result.getAttribute("aria-live")).toBe("polite");
    expect(must("unit-result-box").getAttribute("aria-label")).toBeNull();
    expect(must("unit-result-box").getAttribute("role")).toBeNull();
    await typeInto("unit-input", "abc");
    expect(must("unit-result").getAttribute("role")).toBe("status"); // 안내 문구도 같은 영역에서 읽힌다
    expect(text("unit-result")).toBe("숫자를 입력하세요");
  });

  it("입력 칸은 inputMode=text 다(iOS 숫자 패드에는 - 가 없어 음수 온도를 못 넣는다)", async () => {
    await renderWidget();
    expect(must("unit-input").getAttribute("inputmode")).toBe("text");
  });

  it("잘못된 입력이면 입력 칸에 aria-invalid 와 결과 칸을 가리키는 aria-describedby 를 단다", async () => {
    await renderWidget();
    const input = must("unit-input");
    const resultId = must("unit-result").id;
    expect(resultId).not.toBe("");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.getAttribute("aria-describedby")).toBeNull();
    await typeInto("unit-input", "1.2.3");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(resultId);
    await typeInto("unit-input", "5");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });

  it("빈 입력은 잘못된 입력이 아니다 — aria-invalid 는 false 이고 안내만 연결한다", async () => {
    await renderWidget();
    await typeInto("unit-input", "");
    expect(must("unit-input").getAttribute("aria-invalid")).toBe("false");
    expect(must("unit-input").getAttribute("aria-describedby")).toBe(must("unit-result").id);
    expect(text("unit-result")).toBe("숫자를 입력하세요");
  });

  it("아이콘 단추에 title 이 있다", async () => {
    await renderWidget();
    expect(must("unit-swap").getAttribute("title")).toBe("단위 바꾸기");
    expect(must("unit-copy").getAttribute("title")).toBe("결과 복사");
    expect(must("unit-swap").getAttribute("aria-label")).toBe("단위 바꾸기");
    expect(must("unit-copy").getAttribute("aria-label")).toBe("결과 복사");
  });

  it("단위 목록 ul 에 role=list 를 준다", async () => {
    await renderWidget();
    const list = must("unit-list");
    expect(list.tagName).toBe("UL");
    expect(list.getAttribute("role")).toBe("list");
  });

  it("복사하면 보이지 않는 role=status 가 「복사했습니다」를 알린다(처음엔 비어 있다)", async () => {
    await renderWidget();
    const notice = must("unit-copy-notice");
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.textContent).toBe("");
    await click("unit-copy");
    expect(must("unit-copy-notice").textContent).toBe("복사했습니다");
  });

  it("복사가 실패하면 알리지 않는다", async () => {
    await renderWidget();
    h.copyText.mockImplementation(async () => false);
    await click("unit-copy");
    expect(must("unit-copy-notice").textContent).toBe("");
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

  it("어려운 값 — 9.999999999 MPa → kgf/cm² 를 바꿔도 왕복이 깨지지 않는다(10자리로 반올림한 값을 잇지 않는다)", async () => {
    await renderWidget();
    await choose("unit-category", "pressure");
    await typeInto("unit-input", "9.999999999");
    expect(text("unit-result")).toBe("101.9716213");
    await click("unit-swap");
    expect(value("unit-from")).toBe("kgfcm2");
    expect(value("unit-to")).toBe("mpa");
    // 입력으로 이어지는 값은 17자리 정밀 값이고, 화면 결과만 10자리다
    expect(value("unit-input")).toBe("101.97162128759566");
    expect(text("unit-result")).toBe("9.999999999"); // 반올림한 10 이 아니다
  });

  it("입력을 고치지 않고 [⇄] 를 다시 누르면 직전 입력·단위를 그대로 되돌린다(긴 소수가 남지 않는다)", async () => {
    await renderWidget();
    await choose("unit-category", "pressure");
    await typeInto("unit-input", "9.999999999");
    await click("unit-swap");
    expect(value("unit-input")).toBe("101.97162128759566");
    await click("unit-swap");
    expect(value("unit-input")).toBe("9.999999999");
    expect(value("unit-from")).toBe("mpa");
    expect(value("unit-to")).toBe("kgfcm2");
    expect(text("unit-result")).toBe("101.9716213");
    // 되돌린 뒤 다시 누르면 처음처럼 바꾼다
    await click("unit-swap");
    expect(value("unit-input")).toBe("101.97162128759566");
    expect(value("unit-from")).toBe("kgfcm2");
  });

  it("입력·단위·분류를 고치면 되돌리기가 풀려 새로 바꾼다", async () => {
    await renderWidget();
    await choose("unit-category", "pressure");
    await typeInto("unit-input", "9.999999999");
    await click("unit-swap"); // kgf/cm² → MPa, 입력 101.97162128759566
    await typeInto("unit-input", "100");
    await click("unit-swap"); // 입력을 고쳤으므로 되돌리지 않고 바꾼다: MPa → kgf/cm²
    expect(value("unit-from")).toBe("mpa");
    expect(value("unit-to")).toBe("kgfcm2");
    expect(value("unit-input")).toBe("9.8066500000000000".replace(/0+$/, "")); // 100 kgf/cm² = 9.80665 MPa
    await click("unit-row-psi"); // 단위를 고쳤다
    await click("unit-swap");
    expect(value("unit-from")).toBe("psi");
    expect(value("unit-to")).toBe("mpa");
    expect(value("unit-input")).not.toBe("100");
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
  const KEY = "dmes:widget:unit-converter:u1:inst-1";
  const stored = (key = KEY) => JSON.parse(store.getItem(key)!);

  /** 위젯을 닫았다가(탭 전환·다시 그리기) 다시 연다. */
  async function reopen(p: RenderProps = {}) {
    unmount();
    container.remove();
    mount();
    await renderWidget(p);
  }

  it("기억한 분류·단위·입력값이 다시 그릴 때 복원된다", async () => {
    await renderWidget();
    await choose("unit-category", "pressure");
    await choose("unit-to", "psi");
    await typeInto("unit-input", "55");
    expect(text("unit-result")).toBe("7,977.075575"); // 55 MPa → psi
    const before = text("unit-result");
    await reopen();
    expect(value("unit-category")).toBe("pressure");
    expect(value("unit-from")).toBe("mpa");
    expect(value("unit-to")).toBe("psi");
    expect(value("unit-input")).toBe("55");
    expect(text("unit-result")).toBe(before);
  });

  it("저장하는 값 — 사용자·인스턴스별 키(dmes:widget:unit-converter:{userId}:{instanceId})에 분류·단위·입력값이 들어 있다", async () => {
    await renderWidget();
    await choose("unit-category", "mass");
    await choose("unit-to", "oz");
    await typeInto("unit-input", "7");
    await settled();
    expect(store.length).toBe(1);
    const saved = stored();
    expect(saved.category).toBe("mass");
    expect(saved.text).toBe("7");
    expect(saved.units.mass).toEqual({ from: "kg", to: "oz" });
  });

  it("마운트만 해서는 쓰지 않는다 — 값이 바뀔 때만 쓴다", async () => {
    store.setItem(KEY, JSON.stringify({ v: 1, category: "mass", units: {}, text: "3" }));
    const setItem = vi.spyOn(store, "setItem");
    await renderWidget();
    await settled();
    expect(setItem).not.toHaveBeenCalled();
    await typeInto("unit-input", "4");
    await settled();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(stored().text).toBe("4");
  });

  it("쓰기는 300ms 디바운스한다 — 연달아 고쳐도 한 번, 마지막 값만 쓴다", async () => {
    const setItem = vi.spyOn(store, "setItem");
    await renderWidget();
    await typeInto("unit-input", "1");
    await typeInto("unit-input", "12");
    await typeInto("unit-input", "123");
    expect(setItem).not.toHaveBeenCalled();
    expect(store.getItem(KEY)).toBeNull();
    await settled();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(stored().text).toBe("123");
  });

  it("아직 쓰기 전에 위젯이 사라져도(탭 전환) 마지막 값을 바로 쓴다", async () => {
    await renderWidget();
    await typeInto("unit-input", "77");
    expect(store.getItem(KEY)).toBeNull();
    unmount();
    expect(stored().text).toBe("77");
  });

  it("다른 인스턴스는 기억이 따로다 — 고치지 않은 인스턴스는 키도 만들지 않는다", async () => {
    await renderWidget({ instanceId: "inst-1" });
    await choose("unit-category", "force");
    await typeInto("unit-input", "9");
    await reopen({ instanceId: "inst-2" });
    expect(value("unit-category")).toBe("length");
    expect(value("unit-input")).toBe("1");
    await settled();
    expect(store.getItem("dmes:widget:unit-converter:u1:inst-2")).toBeNull();
    expect(stored().text).toBe("9");
  });

  it("사용자가 다르면 같은 인스턴스(관리자가 정한 기본 배치)라도 기억이 섞이지 않는다", async () => {
    await renderWidget();
    await choose("unit-category", "force");
    await typeInto("unit-input", "9");
    h.peek = "u2";
    h.userId = "u2";
    await reopen();
    expect(value("unit-category")).toBe("length"); // u1 의 값이 보이지 않는다
    expect(value("unit-input")).toBe("1");
    await typeInto("unit-input", "5");
    await settled();
    expect(stored("dmes:widget:unit-converter:u2:inst-1").text).toBe("5");
    expect(stored().text).toBe("9"); // u1 의 값은 덮이지 않았다
    h.peek = "u1";
    h.userId = "u1";
    await reopen();
    expect(value("unit-category")).toBe("force");
    expect(value("unit-input")).toBe("9");
  });

  it("사용자를 모르면 기억하지 않는다 — 읽지도 쓰지도 않는다", async () => {
    store.setItem(KEY, JSON.stringify({ v: 1, category: "mass", units: {}, text: "3" }));
    h.peek = "";
    h.userId = "";
    await renderWidget();
    expect(value("unit-category")).toBe("length");
    expect(value("unit-input")).toBe("1");
    const before = store.getItem(KEY);
    await typeInto("unit-input", "8");
    await settled();
    expect(store.length).toBe(1);
    expect(store.getItem(KEY)).toBe(before);
    unmount();
    expect(store.getItem(KEY)).toBe(before);
  });

  it("확인된 사용자가 나중에 정해지면 그 사용자의 기억으로 다시 읽고, 읽기만으로는 쓰지 않는다", async () => {
    store.setItem(KEY, JSON.stringify({ v: 1, category: "pressure", units: { pressure: { from: "bar", to: "psi" } }, text: "42" }));
    const raw = store.getItem(KEY);
    h.peek = "";
    h.userId = "";
    await renderWidget();
    expect(value("unit-category")).toBe("length");
    h.userId = "u1"; // /api/auth/me 확인이 끝났다
    await renderWidget();
    expect(value("unit-category")).toBe("pressure");
    expect(value("unit-from")).toBe("bar");
    expect(value("unit-to")).toBe("psi");
    expect(value("unit-input")).toBe("42");
    await settled();
    expect(store.getItem(KEY)).toBe(raw);
  });

  it("처음에 읽은 사용자와 확인된 사용자가 다르면(재로그인 직후) 확인된 사용자의 기억으로 다시 읽는다", async () => {
    store.setItem(KEY, JSON.stringify({ v: 1, category: "mass", units: {}, text: "5" }));
    store.setItem("dmes:widget:unit-converter:u2:inst-1", JSON.stringify({ v: 1, category: "force", units: {}, text: "7" }));
    h.peek = "u1"; // 이전 사용자
    h.userId = "u2";
    await renderWidget();
    expect(value("unit-category")).toBe("force");
    expect(value("unit-input")).toBe("7");
    await settled();
    expect(stored().text).toBe("5"); // 이전 사용자의 기억은 건드리지 않는다
  });

  it("처음에 읽은 사용자와 확인된 사용자가 다른데 새 사용자의 기억이 없으면 기본값으로 시작한다", async () => {
    store.setItem(KEY, JSON.stringify({ v: 1, category: "mass", units: {}, text: "5" }));
    h.peek = "u1";
    h.userId = "u3";
    await renderWidget();
    expect(value("unit-category")).toBe("length");
    expect(value("unit-input")).toBe("1");
    expect(store.getItem("dmes:widget:unit-converter:u3:inst-1")).toBeNull();
  });

  it("[⇄] 와 목록 줄 선택도 기억한다", async () => {
    await renderWidget();
    await typeInto("unit-input", "25.4");
    await click("unit-swap");
    await click("unit-row-cm");
    await reopen();
    expect(value("unit-from")).toBe("in");
    expect(value("unit-to")).toBe("cm");
    expect(value("unit-input")).toBe("1");
  });

  it("기억한 분류가 설정에서 빠졌으면 화면은 기본 분류로 시작한다(입력값은 이어진다)", async () => {
    store.setItem(KEY, JSON.stringify({ v: 1, category: "pressure", units: { pressure: { from: "bar", to: "psi" } }, text: "42" }));
    await renderWidget({ definition: { categories: ["length", "mass"], defaultCategory: "mass" } });
    expect(must("unit-category").getAttribute("role")).toBe("radiogroup");
    expect(must("unit-category").querySelector('[aria-pressed="true"]')?.getAttribute("data-value")).toBe("mass");
    expect(value("unit-from")).toBe("kg");
    expect(value("unit-to")).toBe("lb");
    expect(value("unit-input")).toBe("42"); // 입력값은 분류와 상관없이 이어진다
  });

  it("설정에서 빠진 분류를 기억하고 있어도 입력·단위를 고치다가 그 분류를 덮지 않는다", async () => {
    const definition = { categories: ["length", "mass"], defaultCategory: "mass" };
    store.setItem(KEY, JSON.stringify({ v: 1, category: "pressure", units: { pressure: { from: "bar", to: "psi" } }, text: "42" }));
    await renderWidget({ definition });
    await typeInto("unit-input", "43");
    await settled();
    expect(stored().category).toBe("pressure");
    expect(stored().units.pressure).toEqual({ from: "bar", to: "psi" });
    expect(stored().text).toBe("43");
    await choose("unit-to", "oz"); // 화면에 보이는 무게 분류의 단위를 고쳐도
    await click("unit-swap");
    await settled();
    expect(stored().category).toBe("pressure");
    expect(stored().units.mass).toEqual({ from: "oz", to: "kg" });
    expect(stored().units.pressure).toEqual({ from: "bar", to: "psi" });
    // 설정에 그 분류가 다시 들어오면 기억한 분류로 돌아온다
    await reopen();
    await reopen({ definition: { categories: [], defaultCategory: "length" } });
    expect(value("unit-category")).toBe("pressure");
    expect(value("unit-from")).toBe("bar");
  });

  it("분류를 직접 고르면 그 분류를 기억한다", async () => {
    store.setItem(KEY, JSON.stringify({ v: 1, category: "pressure", units: {}, text: "42" }));
    await renderWidget({ definition: { categories: ["length", "mass"], defaultCategory: "mass" } });
    await act(async () => {
      must("unit-category").querySelector<HTMLElement>('[data-value="length"]')!.click();
    });
    await settled();
    expect(stored().category).toBe("length");
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
    await settled();
    expect(store.length).toBe(0);

    await reopen({ instanceId: "", widgetId: "def.abc12345" });
    await typeInto("unit-input", "9");
    await settled();
    expect(store.length).toBe(0);
    expect(value("unit-input")).toBe("9");
  });

  it("미리보기는 저장돼 있던 값을 읽지도 않는다", async () => {
    store.setItem("dmes:widget:unit-converter:u1:preview", JSON.stringify({ v: 1, category: "mass", units: {}, text: "77" }));
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
    await settled();
    expect(getItem).toHaveBeenCalled();
    expect(setItem).toHaveBeenCalled();
    expect(text("unit-result")).toBe("3.937007874");
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

  const ALL_IDS = ["length", "mass", "area", "volume", "temperature", "pressure", "force", "speed", "energy"];
  const defaultOptions = () => Array.from(must("widget-unit-default").querySelectorAll("option")).map((o) => o.value);

  it("처음 설정(categories 가 빈 배열 = 전체)은 체크박스가 모두 켜져 있고 「모든 분류」 안내, 기본 분류는 길이, 오류 없음", async () => {
    await renderEditor({ categories: [], defaultCategory: "length" });
    expect(container.querySelectorAll('[data-testid^="widget-unit-cat-"]')).toHaveLength(9);
    expect(checkedIds()).toEqual(ALL_IDS);
    expect(text("widget-unit-note")).toBe(UNIT_EDITOR_ALL_NOTE);
    expect(value("widget-unit-default")).toBe("length");
    expect(defaultOptions()).toEqual(["", ...ALL_IDS]);
    expect(onValidate).toHaveBeenLastCalledWith([]);
    expect((must("widget-unit-select-all") as HTMLButtonElement).disabled).toBe(true);
    expect(q("widget-unit-select-none")).toBeNull(); // 「전체 해제」는 없다 — 비어 있으면 전체와 같아서 뜻이 겹친다
  });

  it("모두 켜진 상태에서 하나를 끄면 나머지를 표 순서로 올리고 기본 분류는 그대로 둔다", async () => {
    await renderEditor({ categories: [], defaultCategory: "length" });
    await act(async () => {
      box("pressure").click();
    });
    expect(onChange).toHaveBeenLastCalledWith({ categories: ALL_IDS.filter((id) => id !== "pressure"), defaultCategory: "length" });
  });

  it("기본 분류의 체크를 끄면 기본 분류를 조용히 고치지 않는다 — 검사 오류가 알리고 선택칸은 「선택하세요」다", async () => {
    await renderEditor({ categories: ["length", "mass"], defaultCategory: "mass" });
    expect(checkedIds()).toEqual(["length", "mass"]);
    expect(text("widget-unit-note")).toBe("2개 분류를 보입니다.");
    expect(defaultOptions()).toEqual(["", "length", "mass"]);
    await act(async () => {
      box("mass").click();
    });
    const next = { categories: ["length"], defaultCategory: "mass" };
    expect(onChange).toHaveBeenLastCalledWith(next);
    await renderEditor(next); // 관리 화면이 올린 값을 다시 내려준다
    expect(onValidate).toHaveBeenLastCalledWith([UNIT_DEFAULT_OUTSIDE_ERROR]);
    expect(value("widget-unit-default")).toBe("");
    // 기본 분류를 사용자가 고르면 그때 바로잡힌다
    await choose("widget-unit-default", "length");
    expect(onChange).toHaveBeenLastCalledWith({ categories: ["length"], defaultCategory: "length" });
  });

  it("이미 틀린 기본 분류(보일 분류 밖)는 체크박스만 눌러서는 고쳐지지 않는다 — 그 분류를 켜면 저절로 맞는다", async () => {
    await renderEditor({ categories: ["length", "mass"], defaultCategory: "pressure" });
    await act(async () => {
      box("area").click();
    });
    expect(onChange).toHaveBeenLastCalledWith({ categories: ["length", "mass", "area"], defaultCategory: "pressure" });
    await act(async () => {
      box("pressure").click();
    });
    expect(onChange).toHaveBeenLastCalledWith({ categories: ["length", "mass", "pressure"], defaultCategory: "pressure" });
  });

  it("체크로 모두 켜면 [] 로 저장한다(분류가 늘어도 보이게)", async () => {
    await renderEditor({ categories: ALL_IDS.filter((id) => id !== "speed"), defaultCategory: "length" });
    expect(checkedIds()).toEqual(ALL_IDS.filter((id) => id !== "speed"));
    await act(async () => {
      box("speed").click();
    });
    expect(onChange).toHaveBeenLastCalledWith({ categories: [], defaultCategory: "length" });
  });

  it("전체 선택은 [] 로 저장하고 기본 분류는 그대로 둔다", async () => {
    await renderEditor({ categories: ["mass"], defaultCategory: "mass" });
    expect((must("widget-unit-select-all") as HTMLButtonElement).disabled).toBe(false);
    await click("widget-unit-select-all");
    expect(onChange).toHaveBeenLastCalledWith({ categories: [], defaultCategory: "mass" });
  });

  it("옛 설정처럼 아홉 분류를 모두 적어 둔 값도 모두 켠 채로 보이고 전체 선택으로 [] 로 정리한다", async () => {
    await renderEditor({ categories: ALL_IDS, defaultCategory: "length" });
    expect(checkedIds()).toEqual(ALL_IDS);
    expect(text("widget-unit-note")).toBe(UNIT_EDITOR_ALL_NOTE);
    await click("widget-unit-select-all");
    expect(onChange).toHaveBeenLastCalledWith({ categories: [], defaultCategory: "length" });
  });

  it("하나만 남은 체크는 끌 수 없다(전부 끄면 전체와 같아진다)", async () => {
    await renderEditor({ categories: ["mass"], defaultCategory: "mass" });
    expect(box("mass").disabled).toBe(true);
    expect(box("length").disabled).toBe(false);
    onChange.mockClear();
    await act(async () => {
      box("mass").click();
    });
    expect(onChange).not.toHaveBeenCalled();
    await renderEditor({ categories: ["mass", "area"], defaultCategory: "mass" });
    expect(box("mass").disabled).toBe(false);
  });

  it("기본 분류는 보일 분류 안에서만 고른다", async () => {
    await renderEditor({ categories: ["length", "mass"], defaultCategory: "length" });
    await choose("widget-unit-default", "mass");
    expect(onChange).toHaveBeenLastCalledWith({ categories: ["length", "mass"], defaultCategory: "mass" });
    onChange.mockClear();
    await choose("widget-unit-default", "pressure"); // 목록에 없는 값은 받지 않는다
    expect(onChange).not.toHaveBeenCalled();
  });

  it("전체(빈 목록)일 때 기본 분류는 아무 분류나 고른다", async () => {
    await renderEditor({ categories: [], defaultCategory: "length" });
    await choose("widget-unit-default", "pressure");
    expect(onChange).toHaveBeenLastCalledWith({ categories: [], defaultCategory: "pressure" });
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
