/** @vitest-environment happy-dom */
/**
 * 룰 계산기 렌더러·편집기 동작 시험 — 입력 칸 자동 생성·검사·계산·결과 표시·중간값·안내·편집기 미리보기.
 * 서버 호출(./api)과 shared 폼 부품은 대역으로 바꾼다(B3 에서 목을 걷어도 이 시험은 그대로 쓴다).
 * JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeIo, normalizeRun } from "./rule-calc-model";

const h = vi.hoisted(() => ({
  fetchIo: vi.fn(),
  run: vi.fn(),
}));

vi.mock("./api", () => ({
  fetchRuleCalcIo: (...a: unknown[]) => h.fetchIo(...a),
  runRuleCalc: (...a: unknown[]) => h.run(...a),
}));

vi.mock("@dk-oasis/shared/form", async () => {
  const { createElement: el } = await import("react");
  type P = Record<string, unknown> & { onChange?: (v: never) => void };
  return {
    Button: (p: P) =>
      el("button", { type: p.type ?? "button", disabled: p.disabled as boolean, onClick: p.onClick as never, "data-testid": p["data-testid"] }, p.children as never),
    Input: (p: P) =>
      el(
        "span",
        null,
        el("input", {
          id: p.id,
          type: p.type ?? "text",
          value: p.value as string,
          inputMode: p.inputMode,
          "data-testid": p["data-testid"],
          onChange: (e: { currentTarget: { value: string } }) => p.onChange?.(e.currentTarget.value as never),
        }),
        p.error ? el("em", { "data-err-for": p["data-testid"] }, p.error as string) : null
      ),
    Select: (p: P) =>
      el(
        "select",
        {
          id: p.id,
          value: p.value as string,
          "data-testid": p["data-testid"],
          onChange: (e: { currentTarget: { value: string } }) => p.onChange?.(e.currentTarget.value as never),
        },
        ...(p.placeholder ? [el("option", { key: "", value: "" }, p.placeholder as string)] : []),
        ...(p.options as { value: string; label: string }[]).map((o) => el("option", { key: o.value, value: o.value }, o.label))
      ),
    Checkbox: (p: P) =>
      el("input", {
        type: "checkbox",
        checked: p.checked as boolean,
        disabled: p.disabled as boolean,
        "data-testid": "rc-editor-steps",
        onChange: (e: { currentTarget: { checked: boolean } }) => p.onChange?.(e.currentTarget.checked as never),
      }),
    FormGroup: (p: P) => el("div", { "data-group": p.label as string }, p.children as never),
  };
});

const { default: RuleCalcRenderer } = await import("./renderer");
const { default: RuleCalcEditor } = await import("./editor");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.fetchIo.mockReset();
  h.run.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const q = (testId: string) => container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const must = (testId: string) => {
  const found = q(testId);
  if (!found) throw new Error(`[data-testid="${testId}"] 가 없습니다. 지금 화면: ${container.innerHTML.slice(0, 600)}`);
  return found;
};

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** 제어 입력칸에 글자를 넣는다(React 가 값 변경으로 알아채도록 native setter 를 거친다). */
async function type(testId: string, text: string) {
  const el = must(testId) as HTMLInputElement | HTMLSelectElement;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

const click = async (testId: string) => {
  await act(async () => {
    must(testId).click();
  });
};

const baseProps = { instanceId: "i1", widgetId: "def.rc", size: { w: 6, h: 12 }, config: null };

async function renderRc(definition: unknown, refreshKey = 0) {
  await act(async () => {
    root.render(createElement(RuleCalcRenderer, { ...baseProps, definition, refreshKey } as never));
  });
  await flush();
}

const ruleIo = () =>
  normalizeIo({
    ok: true,
    target: { tp: "RULE", id: "M47C0001", name: "원판 중량", ver: "1.000", verStatus: "RELEASED", status: "INUSE" },
    inputs: [
      { name: "THK", label: "두께", dataType: "NUMBER", scale: 3, unit: "MM", required: true },
      { name: "GRADE", label: "강종", dataType: "STRING", scale: null, unit: "", required: false },
      { name: "COATED", label: "도금 여부", dataType: "BOOLEAN", scale: null, unit: "", required: false },
    ],
    outputs: [{ name: "COIL_WT", label: "원판 중량", dataType: "NUMBER", scale: 2, unit: "KG" }],
    steps: [],
    messages: [],
  });

const setIo = () =>
  normalizeIo({
    ok: true,
    target: { tp: "SET", id: "M47_COAT_WT", name: "코팅중량 세트", ver: "1.000", verStatus: "RELEASED", status: "INUSE" },
    inputs: [{ name: "THK", label: "두께", dataType: "NUMBER", scale: null, unit: "MM", required: true }],
    outputs: [{ name: "COAT_WT", label: "코팅중량", dataType: "NUMBER", scale: 2, unit: "KG" }],
    steps: [
      { ruleId: "M47C0007", name: "도장부착량", outputs: [{ name: "COAT_ADH", label: "도장부착량", dataType: "NUMBER", scale: 3, unit: "" }] },
      { ruleId: "M47C0006", name: "코팅중량", outputs: [{ name: "COAT_WT", label: "코팅중량", dataType: "NUMBER", scale: 2, unit: "KG" }] },
    ],
    messages: [],
  });

const setRun = () =>
  normalizeRun({
    ok: true,
    result: { COAT_WT: "12.3456" },
    steps: [
      { ruleId: "M47C0007", inputs: { THK: "0.5" }, outputs: { COAT_ADH: "0.02" }, hit: true, defaultApplied: false },
      { ruleId: "M47C0006", inputs: { COAT_ADH: "0.02" }, outputs: { COAT_WT: "12.3456" }, hit: false, defaultApplied: true },
    ],
    messages: [],
  });

describe("렌더러 — 대상·로딩·오류", () => {
  it("대상이 없으면 안내만 보이고 서버를 부르지 않는다", async () => {
    await renderRc({ targetTp: "RULE", targetId: "", showSteps: false });
    expect(must("rc-empty").textContent).toContain("지정하세요");
    expect(h.fetchIo).not.toHaveBeenCalled();
  });

  it("io 를 읽는 동안 불러오는 중, 실패하면 오류 문구", async () => {
    let reject!: (e: Error) => void;
    h.fetchIo.mockReturnValue(new Promise((_, rj) => (reject = rj)));
    await renderRc({ targetTp: "RULE", targetId: "M47C0001" });
    expect(must("rc-loading")).toBeTruthy();
    await act(async () => reject(new Error("서버 오류가 발생했습니다.")));
    expect(must("rc-error").textContent).toBe("서버 오류가 발생했습니다.");
  });

  it("확정 버전 없음이면 입력 칸·계산 단추 없이 문구만", async () => {
    h.fetchIo.mockResolvedValue(
      normalizeIo({ ok: false, target: {}, inputs: [], outputs: [], steps: [], messages: [{ code: "NO_RELEASED", text: "확정 버전 없음" }] })
    );
    await renderRc({ targetTp: "RULE", targetId: "M47C0099" });
    expect(must("rc-messages").textContent).toBe("확정 버전 없음");
    expect(q("rc-run")).toBeNull();
    expect(h.fetchIo).toHaveBeenCalledWith("RULE", "M47C0099");
  });

  it("대상이 바뀐 뒤 늦게 도착한 옛 응답은 버린다", async () => {
    let resolveOld!: (v: ReturnType<typeof ruleIo>) => void;
    h.fetchIo.mockReturnValueOnce(new Promise((r) => (resolveOld = r)));
    h.fetchIo.mockResolvedValueOnce(setIo());
    await renderRc({ targetTp: "RULE", targetId: "OLD" });
    await renderRc({ targetTp: "SET", targetId: "M47_COAT_WT" });
    expect(must("rc-root").textContent).toContain("코팅중량 세트");
    await act(async () => resolveOld(ruleIo()));
    expect(must("rc-root").textContent).toContain("코팅중량 세트");
    expect(must("rc-root").textContent).not.toContain("원판 중량");
  });

  it("refreshKey 가 바뀌면 io 를 다시 읽는다", async () => {
    h.fetchIo.mockResolvedValue(ruleIo());
    const def = { targetTp: "RULE", targetId: "M47C0001" };
    await renderRc(def, 0);
    await renderRc(def, 1);
    expect(h.fetchIo).toHaveBeenCalledTimes(2);
  });
});

describe("렌더러 — 입력 칸 자동 생성과 검사", () => {
  beforeEach(() => h.fetchIo.mockResolvedValue(ruleIo()));

  it("io 의 라벨·단위·필수·종류대로 칸이 생긴다", async () => {
    await renderRc({ targetTp: "RULE", targetId: "M47C0001" });
    const labels = [...container.querySelectorAll(".mcm-rc__label")].map((l) => l.textContent);
    expect(labels).toEqual(["두께*MM", "강종", "도금 여부"]);
    expect((must("rc-input-THK") as HTMLInputElement).inputMode).toBe("decimal");
    expect(must("rc-input-COATED").tagName).toBe("SELECT");
    expect(must("rc-root").textContent).toContain("원판 중량");
  });

  it("필수가 비면 칸 아래에 알리고 서버로 보내지 않는다", async () => {
    await renderRc({ targetTp: "RULE", targetId: "M47C0001" });
    await click("rc-run");
    expect(container.querySelector('[data-err-for="rc-input-THK"]')?.textContent).toBe("필수 입력입니다");
    expect(h.run).not.toHaveBeenCalled();
  });

  it("숫자 모양이 아니거나 소수 자리를 넘으면 보내지 않는다", async () => {
    await renderRc({ targetTp: "RULE", targetId: "M47C0001" });
    await type("rc-input-THK", "abc");
    await click("rc-run");
    expect(container.querySelector('[data-err-for="rc-input-THK"]')?.textContent).toBe("숫자를 입력하세요");
    await type("rc-input-THK", "1.2345");
    await click("rc-run");
    expect(container.querySelector('[data-err-for="rc-input-THK"]')?.textContent).toBe("소수 3자리까지 입력할 수 있습니다");
    expect(h.run).not.toHaveBeenCalled();
  });
});

describe("렌더러 — 계산·결과", () => {
  beforeEach(() => h.fetchIo.mockResolvedValue(ruleIo()));

  it("값이 있는 칸만 글자 그대로 보내고, 결과는 소수 자리(HALF_UP)·쉼표·단위로 보인다", async () => {
    h.run.mockResolvedValue(normalizeRun({ ok: true, result: { COIL_WT: "12345.675" }, steps: [], messages: [] }));
    await renderRc({ targetTp: "RULE", targetId: "M47C0001" });
    await type("rc-input-THK", " 0.500 ");
    await type("rc-input-COATED", "true");
    await click("rc-run");
    await flush();
    expect(h.run).toHaveBeenCalledWith("RULE", "M47C0001", { THK: "0.500", COATED: "true" });
    expect(must("rc-result-COIL_WT").textContent).toBe("12,345.68KG");
  });

  it("Enter(form submit)로도 계산한다", async () => {
    h.run.mockResolvedValue(normalizeRun({ ok: true, result: { COIL_WT: "1" }, steps: [], messages: [] }));
    await renderRc({ targetTp: "RULE", targetId: "M47C0001" });
    await type("rc-input-THK", "1");
    await act(async () => {
      must("rc-root").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(must("rc-result-COIL_WT").textContent).toBe("1.00KG");
  });

  it("계산을 못 하면(ok=false) 안내 문구만 보이고 결과는 없다", async () => {
    h.run.mockResolvedValue(normalizeRun({ ok: false, result: {}, steps: [], messages: [{ code: "EVAL_ERROR", text: "식 평가 오류" }] }));
    await renderRc({ targetTp: "RULE", targetId: "M47C0001" });
    await type("rc-input-THK", "1");
    await click("rc-run");
    await flush();
    expect(must("rc-messages").textContent).toBe("식 평가 오류");
    expect(must("rc-messages").querySelector("li")?.className).toContain("mcm-rc__msg--error");
    expect(q("rc-results")).toBeNull();
  });

  it("경고(RULE_DEPRECATED)는 결과와 함께 보인다", async () => {
    h.run.mockResolvedValue(normalizeRun({ ok: true, result: { COIL_WT: "2" }, steps: [], messages: [{ code: "RULE_DEPRECATED", text: "" }] }));
    await renderRc({ targetTp: "RULE", targetId: "M47C0001" });
    await type("rc-input-THK", "1");
    await click("rc-run");
    await flush();
    expect(must("rc-messages").textContent).toContain("폐기");
    expect(must("rc-result-COIL_WT").textContent).toBe("2.00KG");
  });

  it("호출이 실패하면 오류를 보이고, 입력을 고치면 이전 결과를 지운다", async () => {
    h.run.mockRejectedValueOnce(new Error("권한이 없습니다."));
    await renderRc({ targetTp: "RULE", targetId: "M47C0001" });
    await type("rc-input-THK", "1");
    await click("rc-run");
    await flush();
    expect(must("rc-run-error").textContent).toBe("권한이 없습니다.");

    h.run.mockResolvedValue(normalizeRun({ ok: true, result: { COIL_WT: "3" }, steps: [], messages: [] }));
    await click("rc-run");
    await flush();
    expect(q("rc-results")).not.toBeNull();
    await type("rc-input-THK", "2");
    expect(q("rc-results")).toBeNull();
  });
});

describe("렌더러 — 늦게 온 응답과 상태", () => {
  beforeEach(() => h.fetchIo.mockResolvedValue(ruleIo()));

  it("계산 중에 입력을 고치면 옛 값의 결과는 버린다", async () => {
    let resolveRun!: (v: ReturnType<typeof normalizeRun>) => void;
    h.run.mockReturnValueOnce(new Promise((r) => (resolveRun = r)));
    await renderRc({ targetTp: "RULE", targetId: "M47C0001" });
    await type("rc-input-THK", "1");
    await click("rc-run");
    await type("rc-input-THK", "2");
    await act(async () => resolveRun(normalizeRun({ ok: true, result: { COIL_WT: "9" }, steps: [], messages: [] })));
    expect(q("rc-results")).toBeNull();
    expect(must("rc-run").textContent).toBe("계산");
  });

  it("계산 중에 대상이 바뀌었다 돌아와도 결과가 반영되고 단추가 잠기지 않는다", async () => {
    let resolveRun!: (v: ReturnType<typeof normalizeRun>) => void;
    h.run.mockReturnValueOnce(new Promise((r) => (resolveRun = r)));
    const a = { targetTp: "RULE", targetId: "M47C0001" };
    await renderRc(a);
    await type("rc-input-THK", "1");
    await click("rc-run");
    await renderRc({ targetTp: "RULE", targetId: "OTHER" });
    await renderRc(a);
    await act(async () => resolveRun(normalizeRun({ ok: true, result: { COIL_WT: "4" }, steps: [], messages: [] })));
    expect(must("rc-result-COIL_WT").textContent).toBe("4.00KG");
    expect((must("rc-run") as HTMLButtonElement).disabled).toBe(false);
  });

  it("같은 대상의 새로 고침(refreshKey)은 입력한 값을 지우지 않는다", async () => {
    const def = { targetTp: "RULE", targetId: "M47C0001" };
    await renderRc(def, 0);
    await type("rc-input-THK", "0.5");
    await renderRc(def, 1);
    expect((must("rc-input-THK") as HTMLInputElement).value).toBe("0.5");
  });

  it("ok=false 인데 안내가 비어 오면 기본 문구를 보인다", async () => {
    h.run.mockResolvedValue(normalizeRun({ ok: false, result: {}, steps: [], messages: [] }));
    await renderRc({ targetTp: "RULE", targetId: "M47C0001" });
    await type("rc-input-THK", "1");
    await click("rc-run");
    await flush();
    expect(must("rc-run-fail").textContent).toBe("계산하지 못했습니다");
  });

  it("결과 영역은 알림 영역(aria-live)이고 실패 안내는 alert 로 읽힌다", async () => {
    h.run.mockResolvedValue(normalizeRun({ ok: false, result: {}, steps: [], messages: [{ code: "EVAL_ERROR", text: "x" }] }));
    await renderRc({ targetTp: "RULE", targetId: "M47C0001" });
    await type("rc-input-THK", "1");
    await click("rc-run");
    await flush();
    expect(must("rc-done").getAttribute("aria-live")).toBe("polite");
    expect(must("rc-messages").getAttribute("role")).toBe("alert");
  });

  it("목록 결과는 원소마다 소수 자리를 맞추고, 문자 출력의 중간값은 서식을 입히지 않는다", async () => {
    h.fetchIo.mockResolvedValue(
      normalizeIo({
        ok: true,
        target: { name: "세트" },
        inputs: [],
        outputs: [{ name: "LST", label: "목록", dataType: "NUMBER", scale: 2 }],
        steps: [{ ruleId: "R1", name: "앞", outputs: [{ name: "CODE", label: "코드", dataType: "STRING" }] }],
        messages: [],
      })
    );
    h.run.mockResolvedValue(
      normalizeRun({
        ok: true,
        result: { LST: ["1.2345", "2.5"] },
        steps: [{ ruleId: "R1", inputs: {}, outputs: { CODE: "00123" }, hit: true, defaultApplied: false }],
        messages: [],
      })
    );
    await renderRc({ targetTp: "SET", targetId: "S1", showSteps: true });
    await click("rc-run");
    await flush();
    expect(must("rc-result-LST").textContent).toBe("1.23, 2.50");
    expect(must("rc-step-R1").textContent).toContain("00123");
  });
});

describe("렌더러 — 룰 세트 중간값", () => {
  beforeEach(() => {
    h.fetchIo.mockResolvedValue(setIo());
    h.run.mockResolvedValue(setRun());
  });

  it("showSteps 가 켜져 있으면 단계별 중간값을 보인다(라벨·소수 자리·적중 표시)", async () => {
    await renderRc({ targetTp: "SET", targetId: "M47_COAT_WT", showSteps: true });
    await type("rc-input-THK", "0.5");
    await click("rc-run");
    await flush();
    expect(must("rc-result-COAT_WT").textContent).toBe("12.35KG");
    const steps = must("rc-steps").textContent ?? "";
    expect(steps).toContain("1. 도장부착량");
    expect(steps).toContain("0.020");
    expect(must("rc-step-M47C0006").textContent).toContain("기본값 적용");
  });

  it("showSteps 가 꺼져 있으면(기본) 결과만", async () => {
    await renderRc({ targetTp: "SET", targetId: "M47_COAT_WT", showSteps: false });
    await type("rc-input-THK", "0.5");
    await click("rc-run");
    await flush();
    expect(q("rc-result-COAT_WT")).not.toBeNull();
    expect(q("rc-steps")).toBeNull();
  });

  it("룰 대상이면 showSteps 가 켜져 있어도 단계를 그리지 않는다", async () => {
    h.fetchIo.mockResolvedValue(ruleIo());
    h.run.mockResolvedValue(setRun());
    await renderRc({ targetTp: "RULE", targetId: "M47C0001", showSteps: true });
    await type("rc-input-THK", "0.5");
    await click("rc-run");
    await flush();
    expect(q("rc-steps")).toBeNull();
  });
});

describe("편집기", () => {
  async function renderEditor(value: unknown, onChange = vi.fn(), onValidate = vi.fn()) {
    await act(async () => {
      root.render(createElement(RuleCalcEditor, { value, onChange, onValidate } as never));
    });
    return { onChange, onValidate };
  }

  it("ID 가 비면 검사 오류를 알리고 [입력 칸 확인] 은 잠긴다", async () => {
    const { onValidate } = await renderEditor({ targetTp: "RULE", targetId: "", showSteps: false });
    expect(onValidate).toHaveBeenLastCalledWith(["룰 또는 룰 세트를 지정하세요"]);
    expect((must("rc-editor-check") as HTMLButtonElement).disabled).toBe(true);
  });

  it("종류·ID 를 고치면 설정 전체를 만들어 알린다 — 룰이면 중간값은 끈다", async () => {
    const { onChange } = await renderEditor({ targetTp: "SET", targetId: "M47_COAT_WT", showSteps: true });
    await type("rc-editor-tp", "RULE");
    expect(onChange).toHaveBeenLastCalledWith({ targetTp: "RULE", targetId: "M47_COAT_WT", showSteps: false });
    await type("rc-editor-id", " M47C0001 ");
    expect(onChange).toHaveBeenLastCalledWith({ targetTp: "SET", targetId: "M47C0001", showSteps: true });
  });

  it("중간값 옵션은 세트에서만 켠다", async () => {
    const { onChange } = await renderEditor({ targetTp: "SET", targetId: "S1", showSteps: false });
    expect((must("rc-editor-steps") as HTMLInputElement).disabled).toBe(false);
    await act(async () => must("rc-editor-steps").click());
    expect(onChange).toHaveBeenLastCalledWith({ targetTp: "SET", targetId: "S1", showSteps: true });
    await act(async () => {
      root.render(createElement(RuleCalcEditor, { value: { targetTp: "RULE", targetId: "R1", showSteps: false }, onChange, onValidate: vi.fn() } as never));
    });
    expect((must("rc-editor-steps") as HTMLInputElement).disabled).toBe(true);
  });

  it("[입력 칸 확인] 은 내 DRAFT 를 우선하는 미리보기(preview=true)로 io 를 읽어 보인다", async () => {
    h.fetchIo.mockResolvedValue(setIo());
    await renderEditor({ targetTp: "SET", targetId: "M47_COAT_WT", showSteps: false });
    await click("rc-editor-check");
    await flush();
    expect(h.fetchIo).toHaveBeenCalledWith("SET", "M47_COAT_WT", true);
    const text = must("rc-editor-preview").textContent ?? "";
    expect(text).toContain("코팅중량 세트");
    expect(text).toContain("입력 칸 1개");
    expect(text).toContain("두께 (THK, NUMBER");
    expect(text).toContain("실행 순서 2단계");
  });

  it("확인 중에 ID 를 바꿨다 되돌려도 단추가 잠기지 않는다", async () => {
    let resolveIo!: (v: ReturnType<typeof ruleIo>) => void;
    h.fetchIo.mockReturnValueOnce(new Promise((r) => (resolveIo = r)));
    const onChange = vi.fn();
    const a = { targetTp: "RULE", targetId: "M47C0001", showSteps: false };
    const show = async (value: unknown) =>
      act(async () => {
        root.render(createElement(RuleCalcEditor, { value, onChange, onValidate: vi.fn() } as never));
      });
    await show(a);
    await click("rc-editor-check");
    await show({ ...a, targetId: "M47C0001X" });
    await show(a);
    await act(async () => resolveIo(ruleIo()));
    expect((must("rc-editor-check") as HTMLButtonElement).disabled).toBe(false);
    expect(must("rc-editor-preview").textContent).toContain("입력 칸 3개");
  });

  it("미리보기가 실패하면 오류 문구, 확정 버전이 없으면 안내만", async () => {
    h.fetchIo.mockRejectedValueOnce(new Error("권한이 없습니다."));
    await renderEditor({ targetTp: "RULE", targetId: "R1", showSteps: false });
    await click("rc-editor-check");
    await flush();
    expect(must("rc-editor-error").textContent).toBe("권한이 없습니다.");

    h.fetchIo.mockResolvedValueOnce(normalizeIo({ ok: false, inputs: [], messages: [{ code: "NOT_FOUND", text: "룰 없음" }] }));
    await click("rc-editor-check");
    await flush();
    const text = must("rc-editor-preview").textContent ?? "";
    expect(text).toContain("룰 없음");
    expect(text).not.toContain("입력 칸");
  });
});
