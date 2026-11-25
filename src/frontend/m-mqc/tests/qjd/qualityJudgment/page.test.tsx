/** @vitest-environment happy-dom */
// 품질판정 화면 렌더 시험 — 진입 조회로 코일 목록이 보이고, 행을 누르면 상세를 읽고, [판정 계산] 이 judge 를 부른다.
// 서버·사용자 확인·버튼 권한은 fetch 대역이다(tests/qdm/lineWidthShrinkage/page.test.tsx 와 같은 틀).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { QualityJudgmentPage } from "@/qjd/qualityJudgment/QualityJudgmentPage";

const ROW = {
  coilNo: "C260901001",
  ordNo: "D260831014-010",
  cusNm: "수요가 A",
  prdCd: "3",
  prdLabel: "3 : CCGI",
  specCd: "KS3-CGCC",
  sizeText: "0.450 × 1490",
  wgt: 9340,
  lineCd: "5CGL",
  heatNo: "5A1207",
  inspBy: "이도현",
  inspAt: "2026-09-02 08:10",
  status: "WAIT",
  statusNm: "판정대기",
  suggStatus: "HOLD",
  suggStatusNm: "보류",
  badges: [
    { grp: "COAT", short: "도", name: "도금량", result: "PASS" },
    { grp: "SURF", short: "표", name: "표면", result: "PASS" },
    { grp: "MECH", short: "기", name: "기계적성질", result: "NONE" },
    { grp: "DIM", short: "치", name: "치수", result: "PASS" },
  ],
};
const detail = (sugg: string, suggNm: string) => ({
  coil: ROW,
  judgment: { status: "WAIT", statusNm: "판정대기", suggStatus: sugg, suggStatusNm: suggNm, judgedAt: "2026-09-02 08:10", decidedBy: null, decidedAt: null, note: null, open: true },
  items: [{ itemCd: "YP", itemNm: "YP", label: "YP (MPa)", critTp: "RANGE", critTxt: "205~380", measVal: null, result: "NONE", resultNm: "미검" }],
  chemistry: [],
  history: [],
});

type Call = { action: string; params: Record<string, unknown> };
let calls: Call[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ok = (result: unknown) => json({ meta: { success: true }, data: { result } });

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}
const STORES = ["__dkOasisButtonRbacStore__", "__dkOasisCurrentUserStore__"];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const name of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true, writable: true });
  }
  for (const k of STORES) delete (globalThis as Record<string, unknown>)[k];
  calls = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const m = url.match(/\/api\/mqc\/oasis\/qualityJudgment\/(\w+)/);
      if (m) {
        const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
        calls.push({ action: m[1], params });
        if (m[1] === "search") return ok({ rows: [ROW], totalCount: 1, counts: { WAIT: 1, PASS: 0, FAIL: 0, HOLD: 0 } });
        if (m[1] === "view") return ok(detail("HOLD", "보류"));
        if (m[1] === "judge") return ok(detail("PASS", "합격"));
        if (m[1] === "history") return ok({ events: [] });
        if (m[1] === "codes") return ok({ criteria: [], lines: [], products: [] });
      }
      if (url.includes("/api/auth/me")) return json({ user: { id: "tester" } });
      if (url.includes("/secUser/myButtonEndpoints"))
        return json({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
      return json({}, 404);
    }),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  for (const k of STORES) delete (globalThis as Record<string, unknown>)[k];
});

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i++) await flush();
}
const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const buttonByText = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => text(b) === label);

describe("품질판정 화면", () => {
  it("진입 조회 → 행 선택 → 판정 계산", async () => {
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement(QualityJudgmentPage, { tabId: "t", snapshot: null, onSnapshotChange: () => {} })));
    });
    await settle();

    const search = calls.find((c) => c.action === "search");
    expect(search?.params).toMatchObject({ fromDt: "2026-08-30", toDt: "", status: "" });
    expect(text(host)).toContain("판정 대기 (1)");

    const cell = [...host.querySelectorAll(".ag-cell")].find((c) => text(c) === "C260901001");
    expect(cell).toBeTruthy();
    await act(async () => {
      (cell as HTMLElement).click();
    });
    await settle();
    expect(calls.some((c) => c.action === "view" && c.params.coilNo === "C260901001")).toBe(true);
    expect(text(host.querySelector('[data-testid="jdg-suggestion"]'))).toBe("보류");

    const judge = buttonByText("판정 계산");
    expect(judge?.disabled).toBe(false);
    await act(async () => {
      judge!.click();
    });
    await settle();
    const j = calls.find((c) => c.action === "judge");
    expect(j?.params).toMatchObject({ coilNo: "C260901001", valuesJson: "" });
    expect(text(host.querySelector('[data-testid="jdg-suggestion"]'))).toBe("합격");
  });
});
