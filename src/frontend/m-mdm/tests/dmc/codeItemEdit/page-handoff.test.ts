/** @vitest-environment happy-dom */

// 화면 간 인계(handoff)·응답 순서 가드(Local-Rules §11·§15, dataItemMng 리뷰 결함 1·3 과 같은 모양).
// ① 이미 열린 탭이 방금 등록된 마루 코드를 넘겨받으면 그 코드를 제 이름으로 보인다(고르기는 그때그때 서버에서 찾으므로
//    목록을 미리 읽지 않는다).
// ② 이름이 바뀐 코드를 넘겨받으면 현재 코드 표시도 새 이름이 된다.
// ③ 다른 코드를 고른 뒤 늦게 온 옛 view 가 그리드·버전 Select 를 덮지 않는다.
// ④ 되돌리기 응답을 기다리는 사이 다른 코드를 고르면 옛 코드로 다시 부르지 않는다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { openMdmPage, takeMdmPageParams } from "@/shell";
import CodeItemEditPage from "../../../pages/dmc/codeItemEdit/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const PATH = "dmc/codeItemEdit";
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | null = null;

type Summary = { maruCodeId: string; maruCodeName: string };
/** search 가 돌려주는 목록 — 시험 중에 바꿔 "방금 등록됨"·"이름 바뀜"을 흉내 낸다. */
let codeList: Summary[] = [];
/** view 가 주는 머리 이름 — 목록과 다르게 두면 "이름이 바뀐 뒤" 가 된다. */
let headerName: Record<string, string> = {};
/** 설정하면 이 코드의 view 응답을 붙잡는다. */
let holdView: { id: string; until: Promise<void> } | null = null;
/** 설정하면 restore 응답을 붙잡는다. */
let holdRestore: Promise<void> | null = null;
let calls: { action: string; params: Record<string, unknown> }[] = [];

function serverRow(code: string, change = "NONE") {
  return {
    code, name: `${code} 이름`, alterName: null, seq: 1, description: null, fromVer: "1.000", toVer: "9999.000",
    lvl1: null, lvl2: null, lvl3: null, lvl4: null, lvl5: null,
    attr01: null, attr02: null, attr03: null, attr04: null, attr05: null,
    attr06: null, attr07: null, attr08: null, attr09: null, attr10: null,
    change, prev: null, tableCategories: [], patchBlocked: false,
  };
}

/** 코드마다 행·버전이 다르다 — STEEL 은 v1.000 과 되돌릴 수 있는 CHANGED 행, NEW 는 v2.000 과 N1 행. */
function viewOf(id: string) {
  const ver = id === "NEW" ? "2.000" : "1.000";
  return {
    header: {
      maruCodeId: id, maruCodeName: headerName[id] ?? codeList.find((c) => c.maruCodeId === id)?.maruCodeName ?? id,
      sourceKind: "MDM", status: "INUSE", lvlCnt: 0, attrLabels: [],
    },
    versions: [{ ver, display: `v${ver}`, status: "DRAFT", verKind: "MAJOR", ownerId: "kim", applyFrom: null, applyTo: null }],
    selected: { ver, display: `v${ver}`, status: "DRAFT", ownerId: "kim", rowVersion: 4, warning: null, editable: true, patchable: false },
    rows: id === "NEW" ? [serverRow("N1")] : [serverRow("S1", "CHANGED")],
    closed: [], closedCateItems: [], categories: [],
  };
}

function stubFetch() {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const ok = (result: unknown) => new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
    const m = u.match(/\/oasis\/codeItemEdit\/(\w+)/);
    const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
    if (m) {
      calls.push({ action: m[1], params });
      if (m[1] === "search") {
        return ok({ codes: codeList.map((c) => ({ ...c, sourceKind: "MDM", status: "INUSE", lvlCnt: 0 })) });
      }
      if (m[1] === "view") {
        const id = String(params.maruCodeId);
        if (holdView && holdView.id === id) await holdView.until;
        return ok(viewOf(id));
      }
      if (m[1] === "restore") {
        if (holdRestore) await holdRestore;
        return ok({ rowVersion: 5 });
      }
      if (m[1] === "compare") return ok({ rows: [], warnings: [] });
      return ok({});
    }
    if (u.includes("/oasis/codeCateEdit/view")) {
      const id = String(params.maruCodeId);
      return ok({ ...viewOf(id), categories: [], items: [], cateItems: [] });
    }
    if (u.includes("/api/auth/me")) return new Response(JSON.stringify({ user: { id: "kim" } }), { status: 200 });
    if (u.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
      return new Response(JSON.stringify({
        grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } },
      }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(CodeItemEditPage, { tabId: "t1" })));
  });
  await settle();
}

const verSelect = () => container.querySelector('[data-testid="code-ver-select"]') as HTMLSelectElement;
const currentLabel = () => container.querySelector('[data-testid="code-current"]')?.textContent ?? "";
const gridText = () => container.querySelector('[data-testid="code-grid"]')?.textContent ?? "";

/** 조회칸 고르기 — 칸에서 Enter 로 찾고 드롭다운의 그 코드를 누른다. */
async function chooseCode(id: string) {
  const input = container.querySelector('[data-testid="code-pick-keyword"]') as HTMLInputElement;
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await settle();
  const option = container.querySelector(`[data-testid="code-pick-${id}"]`) as HTMLButtonElement;
  expect(option, id).toBeTruthy();
  await act(async () => {
    option.click();
  });
  await settle();
}

async function handoff(maruCodeId: string) {
  openMdmPage(PATH, { maruCodeId });
  await act(async () => {
    window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId: "t1" } }));
  });
  await settle();
}

describe("codeItemEdit — handoff·응답 순서", () => {
  beforeEach(() => {
    calls = [];
    codeList = [{ maruCodeId: "STEEL", maruCodeName: "강종" }];
    headerName = {};
    holdView = null;
    holdRestore = null;
    takeMdmPageParams(PATH);
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    stubFetch();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    takeMdmPageParams(PATH);
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  it("① 이미 열린 탭이 방금 등록된 코드를 넘겨받으면 그 코드를 제 이름으로 보인다(목록을 미리 읽지 않는다)", async () => {
    await render();
    expect(calls.filter((c) => c.action === "search")).toHaveLength(0);
    expect(currentLabel()).toBe("");

    codeList = [...codeList, { maruCodeId: "NEW", maruCodeName: "신규 코드" }];
    await handoff("NEW");
    expect(calls.filter((c) => c.action === "search")).toHaveLength(0);
    expect(currentLabel()).toBe("NEW 신규 코드");
    expect(gridText()).toContain("N1");
  });

  it("② 이름이 바뀐 코드를 넘겨받으면 현재 코드 표시도 새 이름이 된다", async () => {
    await render();
    await chooseCode("STEEL");
    expect(calls.filter((c) => c.action === "search")).toHaveLength(1);
    expect(currentLabel()).toBe("STEEL 강종");

    headerName = { STEEL: "강종(개정)" };
    await handoff("STEEL");
    expect(currentLabel()).toBe("STEEL 강종(개정)");
  });

  it("③ 다른 코드를 고른 뒤 늦게 온 옛 view 는 그리드·버전 Select 를 덮지 않는다", async () => {
    codeList = [...codeList, { maruCodeId: "NEW", maruCodeName: "신규 코드" }];
    await render();
    let release!: () => void;
    holdView = { id: "STEEL", until: new Promise<void>((r) => (release = r)) };
    await chooseCode("STEEL");
    await chooseCode("NEW");
    expect(gridText()).toContain("N1");
    expect(verSelect().value).toBe("2.000");

    await act(async () => {
      release();
    });
    await settle();
    expect(currentLabel()).toBe("NEW 신규 코드");
    expect(gridText()).toContain("N1");
    expect(gridText()).not.toContain("S1");
    expect(verSelect().value).toBe("2.000");
  });

  it("④ 되돌리기 응답을 기다리는 사이 다른 코드를 고르면 옛 코드로 다시 부르지 않는다", async () => {
    codeList = [...codeList, { maruCodeId: "NEW", maruCodeName: "신규 코드" }];
    await render();
    await chooseCode("STEEL");
    const revert = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === "되돌리기");
    expect(revert).toBeTruthy();

    let release!: () => void;
    holdRestore = new Promise<void>((r) => (release = r));
    await act(async () => {
      revert!.click();
    });
    await settle();
    await chooseCode("NEW");
    const viewsBefore = calls.filter((c) => c.action === "view").length;

    await act(async () => {
      release();
    });
    await settle();
    expect(calls.some((c) => c.action === "restore" && c.params.maruCodeId === "STEEL")).toBe(true);
    expect(calls.filter((c) => c.action === "view")).toHaveLength(viewsBefore);
    expect(currentLabel()).toBe("NEW 신규 코드");
    expect(gridText()).toContain("N1");
    expect(gridText()).not.toContain("S1");
  });
});
