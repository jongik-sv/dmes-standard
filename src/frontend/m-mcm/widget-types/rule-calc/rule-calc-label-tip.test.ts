/** @vitest-environment happy-dom */
/**
 * 룰 계산기 입력·결과 라벨 × MDM 컬럼 사전 툴팁 — 입력·출력 이름이 사전 물리명(PROC_CD·COIL_GAL_WGT 등)이라
 * 포털 탭 공급자(module "mcm") 안에서는 라벨이 사전 카드 툴팁 트리거(.form-tip-trigger)가 되고, 이름 목록이 사전에 한 번에 요청된다.
 * 공급자 밖(도크 등 공급자가 없는 자리)이면 라벨은 예전처럼 적어 둔 글자 그대로다.
 * 서버 호출(./api)만 대역이고, 공급자·폼 부품·라벨은 진짜 shared(dist) 다. JSX 없이 createElement 로 쓴다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MdmMetaProvider, resetMdmMetaStore } from "@dk-oasis/shared/mdm-meta";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { normalizeIo, normalizeRun } from "./rule-calc-model";

const h = vi.hoisted(() => ({ fetchIo: vi.fn(), run: vi.fn() }));

vi.mock("./api", () => ({
  fetchRuleCalcIo: (...a: unknown[]) => h.fetchIo(...a),
  runRuleCalc: (...a: unknown[]) => h.run(...a),
  searchRuleCalcTargets: vi.fn(),
  RULE_CALC_SEARCH_LIMIT: 2,
}));

import RuleCalcRenderer from "./renderer";

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

/** 어떤 이름을 물어도 사전에 있는 것처럼 답한다. */
function fakeFetch() {
  const asked: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes("mdmMeta")) return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    const body = init?.body ? (JSON.parse(String(init.body)) as { names?: string[] }) : {};
    const items: Record<string, unknown> = {};
    for (const n of body.names ?? []) {
      asked.push(n);
      items[n] = {
        physName: n,
        columnName: `사전-${n}`,
        labelLong: `사전-${n}`,
        labelMid: `사전-${n}`,
        labelShort: `사전-${n}`,
        description: "설명",
        usageNote: null,
        dataType: "STRING",
        length: 10,
        scale: null,
        required: false,
        defaultValue: null,
        refKind: null,
        refTarget: null,
        refCateId: null,
        domain: null,
        stdExpr: null,
        bizRuleOnServer: false,
        bizRequiredVars: [],
        codeRef: null,
        allowedCodes: null,
      };
    }
    return new Response(JSON.stringify({ items, missing: [], unavailable: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return { fn, asked };
}

let root: Root | null = null;
let host: HTMLDivElement;
let f: ReturnType<typeof fakeFetch>;

beforeEach(() => {
  resetMdmMetaStore();
  h.fetchIo.mockReset();
  h.run.mockReset();
  f = fakeFetch();
  vi.stubGlobal("fetch", f.fn);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

const io = () =>
  normalizeIo({
    ok: true,
    target: { tp: "RULE", id: "M47C0005", name: "코일도금중량", ver: "1.000", verStatus: "RELEASED", status: "INUSE" },
    inputs: [
      { name: "PROC_CD", label: "공정 코드", dataType: "STRING", scale: null, unit: "", required: false },
      { name: "GAL_ATT_AMT", label: "도금부착량", dataType: "NUMBER", scale: 1, unit: "GPM2", required: false },
    ],
    outputs: [{ name: "COIL_GAL_WGT", label: "코일 도금 중량", dataType: "NUMBER", scale: 0, unit: "" }],
    steps: [],
    messages: [],
  });

const props = {
  instanceId: "i1",
  widgetId: "def.rc",
  size: { w: 6, h: 12 },
  config: null,
  refreshKey: 0,
  definition: { targetTp: "RULE", targetId: "M47C0005" },
};

async function show(withProvider: boolean) {
  h.fetchIo.mockResolvedValue(io());
  const body = createElement(RuleCalcRenderer, props as never);
  const el = createElement(DmesUiProvider, null, withProvider ? createElement(MdmMetaProvider, { module: "mcm", children: body }) : body);
  await act(async () => root!.render(el));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 150));
  });
}

const triggers = () => [...host.querySelectorAll(".form-tip-trigger")].map((el) => el.textContent);

describe("룰 계산기 라벨 툴팁", () => {
  it("공급자 안 — 입력 라벨마다 사전 툴팁 트리거가 서고 입력 이름이 사전에 요청된다", async () => {
    await show(true);
    // 사전 캡션이 아니라 위젯이 룰에서 받은 라벨(명시 캡션)이 글자로 남는다.
    expect(triggers()).toEqual(["공정 코드", "도금부착량"]);
    expect(f.asked).toEqual(expect.arrayContaining(["PROC_CD", "GAL_ATT_AMT"]));
  });

  it("공급자 안 — 계산 뒤 결과 라벨도 사전 툴팁 트리거가 된다", async () => {
    await show(true);
    h.run.mockResolvedValue(normalizeRun({ ok: true, result: { COIL_GAL_WGT: "1234" }, steps: [], messages: [] }));
    const input = host.querySelector<HTMLInputElement>('[data-testid="rc-input-GAL_ATT_AMT"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "10");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="rc-run"]')!.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(host.querySelector('[data-testid="rc-result-COIL_GAL_WGT"]')?.textContent).toBe("1,234");
    expect(triggers()).toEqual(["공정 코드", "도금부착량", "코일 도금 중량"]);
    expect(f.asked).toContain("COIL_GAL_WGT");
  });

  it("공급자 밖 — 라벨은 글자 그대로이고 사전 요청이 없다", async () => {
    await show(false);
    expect(triggers()).toEqual([]);
    expect([...host.querySelectorAll(".mcm-rc__label")].map((l) => l.textContent)).toEqual(["공정 코드", "도금부착량GPM2"]);
    expect(f.asked).toEqual([]);
  });
});
