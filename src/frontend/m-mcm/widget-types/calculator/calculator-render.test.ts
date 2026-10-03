/** @vitest-environment happy-dom */
/**
 * 계산기 렌더러·편집기 동작 시험 — 단추 계산·키보드(계산기 영역에서만)·초점·기록 칸·복사·글자 크기.
 * shared 의 위젯 틀 훅(useWidgetBodySize)과 폼 부품은 대역으로 바꾼다. 본문 크기는 시험이 바꿔 가며 넣는다.
 * JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  body: { width: 600, height: 400 as number | null },
}));

vi.mock("@dk-oasis/shared/widget", () => ({ useWidgetBodySize: () => h.body }));

vi.mock("@dk-oasis/shared/form", async () => {
  const { createElement: el } = await import("react");
  return {
    Checkbox: (p: { checked?: boolean; onChange?: (v: boolean) => void; label?: string }) =>
      el(
        "label",
        null,
        el("input", {
          type: "checkbox",
          checked: p.checked,
          "data-testid": "calc-editor-history",
          onChange: (e: { currentTarget: { checked: boolean } }) => p.onChange?.(e.currentTarget.checked),
        }),
        p.label
      ),
    FormGroup: (p: { label?: string; children?: unknown }) => el("div", { "data-group": p.label }, p.children as never),
  };
});

const { default: CalculatorRenderer } = await import("./renderer");
const { default: CalculatorTypeEditor } = await import("./editor");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let outside: HTMLDivElement;
let root: Root;
let unmounted = false;

function unmount() {
  if (unmounted) return;
  unmounted = true;
  act(() => root.unmount());
}

beforeEach(() => {
  unmounted = false;
  h.body = { width: 600, height: 400 };
  container = document.createElement("div");
  outside = document.createElement("div"); // 계산기 밖의 다른 입력칸이 들어갈 자리
  document.body.append(container, outside);
  root = createRoot(container);
});

afterEach(() => {
  unmount();
  container.remove();
  outside.remove();
  delete (navigator as unknown as { clipboard?: unknown }).clipboard;
});

const q = (testId: string) => container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const must = (testId: string) => {
  const found = q(testId);
  if (!found) throw new Error(`[data-testid="${testId}"] 가 없습니다. 지금 화면: ${container.innerHTML.slice(0, 400)}`);
  return found;
};

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function renderCalc(definition: unknown = { showHistory: true }) {
  const props = {
    instanceId: "inst-1",
    widgetId: "def.calc1234",
    definition,
    refreshKey: 0,
    size: { w: 6, h: 12 },
    config: null,
  };
  await act(async () => {
    root.render(createElement(CalculatorRenderer, props as never));
  });
  return props;
}

/** 본문 크기가 바뀐 것처럼 다시 그린다. */
async function rerender(props: object) {
  await act(async () => {
    root.render(createElement(CalculatorRenderer, { ...props } as never));
  });
}

/** 단추를 차례로 누른다 — "1", "2", "mul", "eq" 처럼 data-testid 꼬리(calc-key-{id}). */
async function press(...ids: string[]) {
  for (const id of ids) {
    await act(async () => {
      must(`calc-key-${id}`).click();
    });
  }
}

const value = () => must("calc-value").textContent;
const expr = () => must("calc-expr").textContent;

/** 키보드 이벤트를 target 에서 일으킨다. 처리됐는지(preventDefault)를 돌려준다. */
async function keydown(target: Element, key: string, init: KeyboardEventInit = {}): Promise<boolean> {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(ev);
  });
  return ev.defaultPrevented;
}

const area = () => must("widget-calc");

describe("단추 배열·단추로 계산", () => {
  it("단추 5행 4열 — 20개가 C ⌫ % ÷ / 7 8 9 × / 4 5 6 − / 1 2 3 + / ± 0 . = 순서이고 Tab 순서에서는 빠진다", async () => {
    await renderCalc();
    const keys = [...container.querySelectorAll<HTMLButtonElement>(".mcm-calc__key")];
    expect(keys.map((b) => b.textContent)).toEqual(["C", "⌫", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "±", "0", ".", "="]);
    expect(keys.every((b) => b.tabIndex === -1 && b.type === "button")).toBe(true);
    expect(must("calc-key-div").getAttribute("aria-label")).toBe("나누기");
    expect(area().tabIndex).toBe(0);
  });

  it("처음에는 아랫줄 0, 윗줄은 비어 있다", async () => {
    await renderCalc();
    expect(value()).toBe("0");
    expect(expr()).toBe("");
  });

  it("1250 × 3 = — 입력 중 윗줄은 식, = 뒤에는 식 =, 아랫줄은 쉼표 넣은 결과", async () => {
    await renderCalc();
    await press("1", "2", "5", "0");
    expect(value()).toBe("1,250");
    await press("mul");
    expect(expr()).toBe("1,250 ×");
    await press("3");
    expect(expr()).toBe("1,250 × 3");
    expect(value()).toBe("3");
    await press("eq");
    expect(expr()).toBe("1,250 × 3 =");
    expect(value()).toBe("3,750");
  });

  it("우선순위·소수 — 1 + 2 × 3 = 7, 0.1 + 0.2 = 0.3", async () => {
    await renderCalc();
    await press("1", "add", "2", "mul", "3", "eq");
    expect(value()).toBe("7");
    await press("clear", "0", "dot", "1", "add", "0", "dot", "2", "eq");
    expect(value()).toBe("0.3");
  });

  it("%·±·⌫·C 단추", async () => {
    await renderCalc();
    await press("2", "0", "0", "add", "1", "0", "pct");
    expect(value()).toBe("20");
    await press("eq");
    expect(value()).toBe("220");
    await press("neg");
    expect(value()).toBe("-220");
    await press("clear", "1", "2", "3", "back");
    expect(value()).toBe("12");
    await press("clear");
    expect(value()).toBe("0");
  });

  it("0으로 나누면 오류 문구를 보이고 복사 단추가 꺼지며, 다음 숫자에서 초기화한다", async () => {
    await renderCalc();
    await press("5", "div", "0", "eq");
    expect(value()).toBe("0으로 나눌 수 없습니다");
    expect(expr()).toBe("5 ÷ 0 =");
    expect(must("calc-value").className).toContain("mcm-calc__value--error");
    expect((must("calc-copy") as HTMLButtonElement).disabled).toBe(true);
    await press("7");
    expect(value()).toBe("7");
    expect(expr()).toBe("");
    expect((must("calc-copy") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("키보드 — 계산기 영역에 초점이 있을 때만", () => {
  it("숫자·연산자·Enter 로 계산한다 — 1 + 2 * 3 Enter = 7, 처리한 키는 preventDefault 한다", async () => {
    await renderCalc();
    for (const k of ["1", "+", "2", "*", "3"]) expect(await keydown(area(), k)).toBe(true);
    expect(expr()).toBe("1 + 2 × 3");
    expect(await keydown(area(), "Enter")).toBe(true);
    expect(value()).toBe("7");
    expect(expr()).toBe("1 + 2 × 3 =");
  });

  it("- / = % . , Backspace Escape Delete 도 처리한다", async () => {
    await renderCalc();
    for (const k of ["9", "-", "3", "="]) await keydown(area(), k);
    expect(value()).toBe("6");
    for (const k of ["Escape", "8", "/", "4", "Enter"]) await keydown(area(), k);
    expect(value()).toBe("2");
    for (const k of ["Delete", "1", ",", "5", "Backspace"]) await keydown(area(), k);
    expect(value()).toBe("1.");
    for (const k of ["Escape", "2", "0", "0", "+", "1", "0", "%", "="]) await keydown(area(), k);
    expect(value()).toBe("220");
    await keydown(area(), ".");
    expect(value()).toBe("0.");
  });

  it("처리하지 않는 키는 preventDefault 하지 않고 계산도 안 바꾼다 — 글자·Tab·F5", async () => {
    await renderCalc();
    await keydown(area(), "5");
    for (const k of ["a", "Tab", "F5", "ArrowLeft", " "]) expect(await keydown(area(), k)).toBe(false);
    expect(value()).toBe("5");
  });

  it("Ctrl·Meta·Alt 와 함께 누른 키는 건드리지 않는다 — 브라우저·전역 단축키 보호", async () => {
    await renderCalc();
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(await keydown(area(), "5", init)).toBe(false);
      expect(await keydown(area(), "Enter", init)).toBe(false);
    }
    expect(value()).toBe("0");
    // Shift 는 막지 않는다 — + * % 는 Shift 로 친다
    expect(await keydown(area(), "+", { shiftKey: true })).toBe(true);
  });

  it("영역 밖 입력칸에서 친 키는 무시한다 — 값도 안 바뀌고 preventDefault 도 안 한다", async () => {
    await renderCalc();
    const input = document.createElement("input");
    outside.append(input);
    input.focus();
    for (const k of ["5", "+", "Enter", "Backspace", "Escape"]) expect(await keydown(input, k)).toBe(false);
    expect(value()).toBe("0");
  });

  it("영역 안쪽 단추(기록·복사)에 초점이 있을 때의 Enter·숫자는 계산에 쓰지 않는다 — 단추 자신의 동작을 건드리지 않는다", async () => {
    await renderCalc();
    await press("1", "add", "2", "eq");
    for (const target of [must("calc-history-item"), must("calc-copy"), must("calc-key-7")]) {
      expect(await keydown(target, "Enter")).toBe(false);
      expect(await keydown(target, "7")).toBe(false);
    }
    expect(value()).toBe("3");
    expect(expr()).toBe("1 + 2 =");
  });
});

describe("초점 — 마우스로 눌러도 계산기 영역이 초점을 지킨다", () => {
  it("단추 mousedown 은 기본 동작(초점 이동)을 막고 영역에 초점을 둔다", async () => {
    await renderCalc();
    const input = document.createElement("input");
    outside.append(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => {
      must("calc-key-5").dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(area());

    // 그 상태에서 바로 키보드가 먹는다
    await press("5");
    await keydown(document.activeElement as Element, "3");
    expect(value()).toBe("53");
  });

  it("기록·복사 단추도 같다", async () => {
    await renderCalc();
    await press("1", "add", "1", "eq");
    for (const id of ["calc-history-item", "calc-copy"]) {
      area().blur();
      const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      await act(async () => {
        must(id).dispatchEvent(ev);
      });
      expect(ev.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(area());
    }
  });
});

describe("계산 기록", () => {
  it("너비가 충분하고 설정이 켜져 있으면 오른쪽에 기록 칸이 보이고, 처음에는 비어 있다", async () => {
    await renderCalc();
    expect(must("calc-history")).toBeTruthy();
    expect(must("calc-history-empty").textContent).toBe("기록이 없습니다");
    expect(q("calc-history-item")).toBeNull();
  });

  it("= 로 계산할 때마다 최신이 위에 쌓인다 — 식과 결과(쉼표)", async () => {
    await renderCalc();
    await press("1", "2", "5", "0", "mul", "3", "eq");
    await press("2", "add", "3", "eq");
    const items = [...container.querySelectorAll('[data-testid="calc-history-item"]')];
    expect(items.map((i) => i.textContent)).toEqual(["2 + 3 =5", "1,250 × 3 =3,750"]);
    expect(q("calc-history-empty")).toBeNull();
  });

  it("기록을 누르면 그 결과가 현재 값으로 불러와지고, 거기서 이어 계산한다", async () => {
    await renderCalc();
    await press("1", "2", "5", "0", "mul", "3", "eq");
    await press("2", "add", "3", "eq");
    expect(value()).toBe("5");
    const items = container.querySelectorAll<HTMLElement>('[data-testid="calc-history-item"]');
    await act(async () => {
      items[1].click(); // 1,250 × 3 = 3,750
    });
    expect(value()).toBe("3,750");
    expect(expr()).toBe("");
    await press("add", "1", "eq");
    expect(value()).toBe("3,751");
  });

  it("최근 10건만 보인다", async () => {
    await renderCalc();
    for (let i = 0; i < 12; i += 1) await press("1", "add", "1", "eq");
    expect(container.querySelectorAll('[data-testid="calc-history-item"]')).toHaveLength(10);
  });

  it("showHistory=false 면 너비가 넓어도 기록 칸이 없다", async () => {
    await renderCalc({ showHistory: false });
    await press("1", "add", "2", "eq");
    expect(q("calc-history")).toBeNull();
    expect(q("calc-history-item")).toBeNull();
  });

  it("설정이 없거나 틀리면 기본값(기록 보임)", async () => {
    await renderCalc(null);
    expect(q("calc-history")).not.toBeNull();
  });

  it("본문 너비가 420px 미만이거나 모르면(0) 기록 칸을 숨기고, 다시 넓어지면 쌓아 둔 기록이 그대로 보인다", async () => {
    const props = await renderCalc();
    await press("1", "add", "2", "eq");
    expect(q("calc-history")).not.toBeNull();

    h.body = { width: 419, height: 400 };
    await rerender(props);
    expect(q("calc-history")).toBeNull();
    expect(value()).toBe("3"); // 계산 상태는 그대로

    h.body = { width: 0, height: null };
    await rerender(props);
    expect(q("calc-history")).toBeNull();

    h.body = { width: 420, height: 400 };
    await rerender(props);
    expect(must("calc-history-item").textContent).toBe("1 + 2 =3");
  });
});

describe("값 복사", () => {
  function mockClipboard(writeText: (t: string) => Promise<void>) {
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  }

  it("현재 표시 값을 쉼표 없이 복사하고, 잠시 완료 표시를 한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    await renderCalc();
    await press("1", "2", "5", "0", "mul", "3", "eq");
    await act(async () => {
      must("calc-copy").click();
    });
    await flush();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("3750");
    expect(must("calc-copy").className).toContain("mcm-calc__copy--done");
  });

  it("입력 중인 값도 복사한다 — 끝의 소수점은 뗀다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    await renderCalc();
    await press("1", "2", "3", "4", "dot");
    await act(async () => {
      must("calc-copy").click();
    });
    expect(writeText).toHaveBeenCalledWith("1234");
  });

  it("클립보드가 막혀 있으면(거부·없음) 조용히 무시한다 — 오류도 완료 표시도 없다", async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error("NotAllowedError")));
    await renderCalc();
    await press("7");
    await act(async () => {
      must("calc-copy").click();
    });
    await flush();
    expect(must("calc-copy").className).not.toContain("mcm-calc__copy--done");
    expect(value()).toBe("7");

    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }); // clipboard 자체가 없는 환경(http 등)
    await act(async () => {
      must("calc-copy").click();
    });
    await flush();
    expect(must("calc-copy").className).not.toContain("mcm-calc__copy--done");
  });
});

describe("글자 크기", () => {
  it("본문 크기를 알면 단추·표시창 글자 크기를 변수로 넣고, 모르면 넣지 않는다(스타일 기본값)", async () => {
    h.body = { width: 340, height: 300 };
    const props = await renderCalc({ showHistory: false });
    expect(area().getAttribute("style")).toMatch(/--calc-key-font:\s*\d+px/);
    expect(area().getAttribute("style")).toMatch(/--calc-value-font:\s*\d+px/);

    h.body = { width: 0, height: null };
    await rerender(props);
    expect(area().getAttribute("style") ?? "").not.toContain("--calc-key-font");
  });

  it("스타일(<style href precedence>)은 계산기를 둘 놓아도 한 번만 들어간다", async () => {
    await renderCalc();
    const second = createRoot(outside);
    await act(async () => {
      second.render(createElement(CalculatorRenderer, { definition: null } as never));
    });
    expect(document.querySelectorAll('style[data-href="mcm-widget-calculator"]')).toHaveLength(1);
    expect(outside.querySelector(".mcm-calc")).not.toBeNull();
    act(() => second.unmount());
  });
});

describe("편집기", () => {
  async function renderEditor(value: unknown, onChange = vi.fn(), onValidate = vi.fn()) {
    await act(async () => {
      root.render(createElement(CalculatorTypeEditor, { value, onChange, onValidate }));
    });
    return { onChange, onValidate };
  }

  it("「계산 기록 보이기」 체크박스 하나 — 켜짐 값이 체크돼 있고 끄면 { showHistory: false } 를 알린다", async () => {
    const { onChange } = await renderEditor({ showHistory: true });
    const box = must("calc-editor-history") as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    expect(container.textContent).toContain("계산 기록 보이기");
    await act(async () => {
      box.click();
    });
    expect(onChange).toHaveBeenCalledWith({ showHistory: false });
  });

  it("꺼진 값은 체크 해제 상태이고 켜면 { showHistory: true }", async () => {
    const { onChange } = await renderEditor({ showHistory: false });
    const box = must("calc-editor-history") as HTMLInputElement;
    expect(box.checked).toBe(false);
    await act(async () => {
      box.click();
    });
    expect(onChange).toHaveBeenCalledWith({ showHistory: true });
  });

  it("값이 없거나 틀리면 기본값(켬)으로 보인다", async () => {
    for (const bad of [null, undefined, "x", {}, { showHistory: "yes" }]) {
      await renderEditor(bad);
      expect((must("calc-editor-history") as HTMLInputElement).checked).toBe(true);
    }
  });

  it("검증 오류가 없으므로 onValidate 에 빈 목록을 알린다(값을 바꿔도 다시 부르지 않는다)", async () => {
    const onValidate = vi.fn();
    await renderEditor({ showHistory: true }, vi.fn(), onValidate);
    expect(onValidate).toHaveBeenCalledTimes(1);
    expect(onValidate).toHaveBeenCalledWith([]);
    await renderEditor({ showHistory: false }, vi.fn(), onValidate);
    expect(onValidate).toHaveBeenCalledTimes(1);
  });
});
