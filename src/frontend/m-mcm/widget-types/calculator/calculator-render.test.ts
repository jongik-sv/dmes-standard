/** @vitest-environment happy-dom */
/**
 * 계산기 렌더러·편집기 동작 시험 — 단추 계산·키보드(계산기 영역에서만)·초점·기록 칸·복사·글자 크기.
 * shared 의 위젯 틀 훅(useWidgetBodySize)과 폼 부품(복사 copyText 포함)은 대역으로 바꾼다. 본문 크기는 시험이 바꿔 가며 넣는다.
 * JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  body: { width: 600, height: 400 as number | null },
  copyText: vi.fn<(text: string) => Promise<boolean>>(),
}));

vi.mock("@dk-oasis/shared/widget", () => ({ useWidgetBodySize: () => h.body }));

vi.mock("@dk-oasis/shared/form", async () => {
  const { createElement: el } = await import("react");
  return {
    copyText: (text: string) => h.copyText(text),
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
  h.copyText.mockReset();
  h.copyText.mockImplementation(async () => true);
  container = document.createElement("div");
  outside = document.createElement("div"); // 계산기 밖의 다른 입력칸이 들어갈 자리
  document.body.append(container, outside);
  root = createRoot(container);
});

afterEach(() => {
  unmount();
  container.remove();
  outside.remove();
  vi.useRealTimers();
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
    expect(value()).toBe("−220");
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

  it("- / = % . Backspace Escape Delete 와 숫자패드 소수점(,)도 처리한다", async () => {
    await renderCalc();
    for (const k of ["9", "-", "3", "="]) await keydown(area(), k);
    expect(value()).toBe("6");
    for (const k of ["Escape", "8", "/", "4", "Enter"]) await keydown(area(), k);
    expect(value()).toBe("2");
    for (const k of ["Delete", "1"]) await keydown(area(), k);
    expect(await keydown(area(), ",", { code: "NumpadDecimal" })).toBe(true); // 쉼표 로캘의 숫자패드 소수점
    for (const k of ["5", "Backspace"]) await keydown(area(), k);
    expect(value()).toBe("1.");
    for (const k of ["Escape", "2", "0", "0", "+", "1", "0", "%", "="]) await keydown(area(), k);
    expect(value()).toBe("220");
    await keydown(area(), ".");
    expect(value()).toBe("0.");
  });

  it("일반 쉼표는 소수점으로 받지 않고 무시한다(preventDefault 도 안 한다) — 1,250 을 버릇대로 쳐도 1250", async () => {
    await renderCalc();
    for (const k of ["1", ",", "2", "5", "0"]) {
      const handled = await keydown(area(), k, k === "," ? { code: "Comma" } : {});
      expect(handled).toBe(k !== ",");
    }
    expect(value()).toBe("1,250");
    expect(await keydown(area(), ",")).toBe(false); // code 가 없어도 같다
    expect(value()).toBe("1,250");
    await keydown(area(), ".");
    await keydown(area(), "5");
    expect(value()).toBe("1,250.5");
  });

  it("F9 는 ± — 키보드만으로 부호를 바꾼다(0 은 그대로)", async () => {
    await renderCalc();
    expect(await keydown(area(), "F9")).toBe(true);
    expect(value()).toBe("0"); // 0 의 부호는 바꾸지 않는다
    for (const k of ["5", "F9"]) await keydown(area(), k);
    expect(value()).toBe("−5");
    await keydown(area(), "F9");
    expect(value()).toBe("5");
    for (const k of ["*", "3", "F9", "Enter"]) await keydown(area(), k);
    expect(value()).toBe("−15");
  });

  it("영역에 aria-keyshortcuts 로 받는 키를 알린다 — 숫자·연산자·Enter·Backspace·Escape·F9", async () => {
    await renderCalc();
    const keys = (area().getAttribute("aria-keyshortcuts") ?? "").split(" ");
    for (const k of ["0", "5", "9", "Plus", "-", "*", "/", "=", "Enter", "Backspace", "Escape", "F9"]) expect(keys).toContain(k);
  });

  it("입력 중 -0 에서 숫자를 치면 선행 0 이 남지 않는다 — 0 . 5 ± ⌫ ⌫ 7 → −7", async () => {
    await renderCalc();
    await press("0", "dot", "5", "neg", "back", "back");
    expect(value()).toBe("−0");
    await press("7");
    expect(value()).toBe("−7");
    await press("clear", "0", "dot", "5", "neg", "back", "back", "0");
    expect(value()).toBe("−0"); // 0 은 −0 그대로
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

describe("Esc — [배치 편집]의 취소(shared WidgetWorkspace 의 document keydown)로 새지 않는다", () => {
  /** document 의 bubble 단계 keydown 리스너 — WidgetWorkspace 가 쓰는 방식 그대로(capture 아님). 뿌리(container)보다 뒤에 등록한다. */
  let onDocument: ReturnType<typeof vi.fn>;
  /** 뿌리(container) 자신에 뒤늦게 건 bubble 리스너 — Next 앱 라우터는 React 위임 뿌리가 document 라 WidgetWorkspace 리스너가
   *  React 리스너와 같은 노드에 뒤에 걸린다. 같은 노드의 뒤 리스너는 stopPropagation 으로는 못 막고 stopImmediatePropagation 만 막는다. */
  let onRoot: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    onDocument = vi.fn();
    onRoot = vi.fn();
    document.addEventListener("keydown", onDocument);
    container.addEventListener("keydown", onRoot);
  });
  afterEach(() => {
    document.removeEventListener("keydown", onDocument);
    container.removeEventListener("keydown", onRoot);
  });

  it("계산기 영역에서 Esc 를 누르면 계산기는 지우고(처리·preventDefault) document 의 bubble keydown 리스너에는 닿지 않는다", async () => {
    await renderCalc();
    await press("1", "2");
    onDocument.mockClear();
    onRoot.mockClear();

    const handled = await keydown(area(), "Escape");
    expect(handled).toBe(true);
    expect(value()).toBe("0");
    expect(onDocument).not.toHaveBeenCalled();
    expect(onRoot).not.toHaveBeenCalled(); // 같은 뿌리 노드의 뒤 리스너도(document 가 뿌리인 실제 앱과 같은 조건)
  });

  it("Esc 가 아닌 키는 막지 않는다 — 처리한 숫자 키도 위로 전파된다", async () => {
    await renderCalc();
    onDocument.mockClear();
    onRoot.mockClear();
    await keydown(area(), "5");
    await keydown(area(), "Delete");
    expect(onDocument).toHaveBeenCalledTimes(2);
    expect(onRoot).toHaveBeenCalledTimes(2);
  });

  it("계산기가 처리하지 않는 Esc 는 막지 않는다 — 영역 안쪽 단추·Ctrl 조합·영역 밖", async () => {
    await renderCalc();
    await press("1", "add", "2", "eq");
    onDocument.mockClear();
    await keydown(must("calc-copy"), "Escape");
    await keydown(must("calc-history-item"), "Escape");
    await keydown(area(), "Escape", { ctrlKey: true });
    expect(onDocument).toHaveBeenCalledTimes(3);
    expect(value()).toBe("3"); // 지우지도 않았다

    const input = document.createElement("input");
    outside.append(input);
    await keydown(input, "Escape");
    expect(onDocument).toHaveBeenCalledTimes(4);
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

  it("기록 칸의 이름은 제목(h4)과 aria-labelledby 로 잇는다 — aria-label 과 같은 이름이 겹치지 않는다", async () => {
    await renderCalc();
    const aside = must("calc-history");
    const title = container.querySelector("h4");
    expect(title?.textContent).toBe("계산 기록");
    expect(title?.id).toBeTruthy();
    expect(aside.getAttribute("aria-labelledby")).toBe(title?.id);
    expect(aside.hasAttribute("aria-label")).toBe(false);
  });

  it("기록 단추를 키보드로 눌러도 초점이 계산기 영역으로 돌아와 바로 숫자 키를 쓸 수 있다", async () => {
    await renderCalc();
    await press("1", "2", "add", "3", "eq");
    const item = must("calc-history-item");
    item.focus();
    expect(document.activeElement).toBe(item);
    await act(async () => {
      item.click(); // 키보드 Enter·Space 는 click 으로 온다(mousedown 없음)
    });
    expect(value()).toBe("15");
    expect(document.activeElement).toBe(area());
    await keydown(area(), "+");
    await keydown(area(), "1");
    await keydown(area(), "Enter");
    expect(value()).toBe("16");
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
  /** copyText 의 대체 경로(숨은 textarea + execCommand)처럼 초점을 가져간 뒤 결과를 돌려주는 대역. */
  function copyTextStealingFocus(ok: boolean) {
    h.copyText.mockImplementation(async () => {
      const ta = document.createElement("textarea");
      outside.append(ta);
      ta.focus();
      await Promise.resolve();
      ta.remove();
      return ok;
    });
  }

  it("shared copyText 로 현재 표시 값을 쉼표·하이픈 그대로(쉼표 없이) 복사하고, 잠시 완료 표시를 한다", async () => {
    await renderCalc();
    await press("1", "2", "5", "0", "mul", "3", "eq");
    await act(async () => {
      must("calc-copy").click();
    });
    await flush();
    expect(h.copyText).toHaveBeenCalledTimes(1);
    expect(h.copyText).toHaveBeenCalledWith("3750");
    expect(must("calc-copy").className).toContain("mcm-calc__copy--done");
  });

  it("clipboard 가 없는 환경(http)이어도 copyText 경로로 복사되고 초점이 영역으로 돌아온다 — navigator.clipboard 를 직접 쓰지 않는다", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    copyTextStealingFocus(true); // copyText 의 execCommand 대체 경로처럼 초점을 가져간다
    try {
      await renderCalc();
      await press("7");
      await act(async () => {
        must("calc-copy").click();
      });
      await flush();
      expect(h.copyText).toHaveBeenCalledWith("7");
      expect(must("calc-copy").className).toContain("mcm-calc__copy--done");
      expect(document.activeElement).toBe(area());
    } finally {
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    }
  });

  it("복사 뒤 copyText 가 가져간 초점을 계산기 영역으로 되돌린다 — 바로 숫자 키를 쓴다", async () => {
    copyTextStealingFocus(true);
    await renderCalc();
    await press("4");
    await act(async () => {
      must("calc-copy").click();
    });
    await flush();
    expect(document.activeElement).toBe(area());
    await keydown(area(), "2");
    expect(value()).toBe("42");
  });

  it("복사가 실패해도 초점은 영역으로 돌아오고, 완료 표시는 없다", async () => {
    copyTextStealingFocus(false);
    await renderCalc();
    await press("7");
    await act(async () => {
      must("calc-copy").click();
    });
    await flush();
    expect(document.activeElement).toBe(area());
    expect(must("calc-copy").className).not.toContain("mcm-calc__copy--done");
    expect(must("calc-copy-status").textContent).toBe("");
  });

  it("음수는 하이픈 값으로 복사한다 — 화면의 −(U+2212)가 아니다", async () => {
    await renderCalc();
    await press("5", "neg");
    expect(value()).toBe("−5");
    await act(async () => {
      must("calc-copy").click();
    });
    expect(h.copyText).toHaveBeenCalledWith("-5");
  });

  it("입력 중인 값도 복사한다 — 끝의 소수점은 뗀다", async () => {
    await renderCalc();
    await press("1", "2", "3", "4", "dot");
    await act(async () => {
      must("calc-copy").click();
    });
    expect(h.copyText).toHaveBeenCalledWith("1234");
  });

  it("copyText 가 거부(false·예외)하면 조용히 무시한다 — 오류도 완료 표시도 없다", async () => {
    h.copyText.mockResolvedValue(false);
    await renderCalc();
    await press("7");
    await act(async () => {
      must("calc-copy").click();
    });
    await flush();
    expect(must("calc-copy").className).not.toContain("mcm-calc__copy--done");
    expect(value()).toBe("7");

    h.copyText.mockRejectedValue(new Error("NotAllowedError"));
    await act(async () => {
      must("calc-copy").click();
    });
    await flush();
    expect(h.copyText).toHaveBeenCalledTimes(2);
    expect(must("calc-copy").className).not.toContain("mcm-calc__copy--done");
    expect(document.activeElement).toBe(area());
  });

  it("오류 상태에서는 복사하지 않는다", async () => {
    await renderCalc();
    await press("5", "div", "0", "eq");
    await act(async () => {
      must("calc-copy").click();
    });
    expect(h.copyText).not.toHaveBeenCalled();
  });

  it("성공하면 보이지 않는 status 영역에 「복사했습니다」를 1.2초 동안 넣는다 — 스크린리더가 복사 성공을 듣는다", async () => {
    vi.useFakeTimers();
    await renderCalc();
    await press("9");
    const status = must("calc-copy-status");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe("");
    await act(async () => {
      must("calc-copy").click();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(status.textContent).toBe("복사했습니다");
    expect(must("calc-copy").className).toContain("mcm-calc__copy--done");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(status.textContent).toBe("복사했습니다"); // 1.2초 전
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(status.textContent).toBe("");
    expect(must("calc-copy").className).not.toContain("mcm-calc__copy--done");
  });

  it("복사가 끝나기 전에 계산기가 사라져도 오류 없이 넘어가고 완료 표시 타이머를 남기지 않는다", async () => {
    vi.useFakeTimers();
    let finish: (ok: boolean) => void = () => {};
    h.copyText.mockImplementation(() => new Promise<boolean>((r) => (finish = r)));
    await renderCalc();
    await press("3");
    await act(async () => {
      must("calc-copy").click();
    });
    unmount();
    await act(async () => {
      finish(true);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(container.innerHTML).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("값 표시", () => {
  it("값 칸에 전체 값을 title 로 단다(좁아서 잘려도 마우스를 올리면 보인다)", async () => {
    await renderCalc();
    await press("1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "1", "2", "3", "4", "5", "neg");
    expect(value()).toBe("−123,456,789,012,345");
    expect(must("calc-value").getAttribute("title")).toBe("−123,456,789,012,345");
    await press("clear", "5", "div", "0", "eq");
    expect(must("calc-value").getAttribute("title")).toBe("0으로 나눌 수 없습니다");
  });

  it("음수 부호는 연산자와 같은 −(U+2212)로 보인다 — 윗줄 식·기록에서도 5 − −5", async () => {
    await renderCalc();
    await press("5", "sub", "5", "neg");
    expect(expr()).toBe("5 − −5");
    await press("eq");
    expect(value()).toBe("10");
    expect(must("calc-history-item").textContent).toBe("5 − −5 =10");
    await press("neg");
    expect(value()).toBe("−10");
    expect(container.textContent).not.toMatch(/-\d/); // 화면에는 하이픈 음수가 없다
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
