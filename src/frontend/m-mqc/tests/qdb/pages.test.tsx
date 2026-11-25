/** @vitest-environment happy-dom */
// 기준정보관리(qdb) 화면 렌더 시험 — 마스터코드·칼라부재료관리·칼라BOM관리가 실제 Maru 항목(live-codes.json)으로 그려지고,
// [Maru에서 편집] 이 Maru 코드 편집 탭(mdm:dmc/codeItemEdit)을 그 코드로 여는지 본다. 서버·사용자·버튼 권한은 fetch 대역이다.
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { ColorBomPage } from "@/qdb/colorBom/ColorBomPage";
import { ColorSubmaterialPage } from "@/qdb/colorSubmaterial/ColorSubmaterialPage";
import { MasterCodePage } from "@/qdb/masterCode/MasterCodePage";
import {
  CODE_EDIT_PAGE_ID,
  MDM_HANDOFF_KEY,
  openCodeEdit,
} from "@/qdb/common/open-code-edit";

import live from "./live-codes.json";

type Call = { codeIds: string[] };
let calls: Call[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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
let opened: string[] = [];
const onOpen = (e: Event) =>
  opened.push((e as CustomEvent<{ pageId: string }>).detail.pageId);

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  for (const k of [...STORES, MDM_HANDOFF_KEY])
    delete (globalThis as Record<string, unknown>)[k];
  for (const name of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, name, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
  calls = [];
  opened = [];
  window.addEventListener("portal-open-tab", onOpen);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/mqc/oasis/qcdRule/codes")) {
        const params = (JSON.parse(String(init?.body ?? "{}")).params ??
          {}) as { codeIds?: string };
        const ids = String(params.codeIds ?? "").split(",");
        calls.push({ codeIds: ids });
        // 응답에 없는 코드는 서버처럼 빈 항목으로 준다.
        const codes = ids.map(
          (id) =>
            live.codes.find((c) => c.codeId === id) ?? {
              codeId: id,
              ver: null,
              items: [],
            },
        );
        return json({ meta: { success: true }, data: { result: { codes } } });
      }
      if (url.includes("/api/auth/me")) return json({ user: { id: "tester" } });
      if (url.includes("/secUser/myButtonEndpoints"))
        return json({
          grids: {
            buttons: {
              rows: [
                { objId: "*", action: "*", endpoint: "*", httpMethod: "*" },
              ],
            },
          },
        });
      return json({}, 404);
    }),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  window.removeEventListener("portal-open-tab", onOpen);
  vi.unstubAllGlobals();
  for (const k of [...STORES, MDM_HANDOFF_KEY])
    delete (globalThis as Record<string, unknown>)[k];
});

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i++) await flush();
}
async function mount(Page: ComponentType<PageProps>) {
  await act(async () => {
    root.render(
      createElement(
        DmesUiProvider,
        null,
        createElement(Page, {
          tabId: "t",
          snapshot: null,
          onSnapshotChange: () => {},
        }),
      ),
    );
  });
  await settle();
}
const byTestId = (id: string) =>
  host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (el: Element | null | undefined) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const button = (label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => text(b) === label,
  );
async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}
const handoff = () =>
  (
    (globalThis as Record<string, unknown>)[MDM_HANDOFF_KEY] as
      Record<string, Record<string, string>> | undefined
  )?.[CODE_EDIT_PAGE_ID];

describe("openCodeEdit", () => {
  it("코드·버전을 mdm 인계 저장소에 두고 코드 편집 탭을 연다", () => {
    openCodeEdit("QC_COLOR_BOM", "1.000");
    expect(handoff()).toEqual({ maruCodeId: "QC_COLOR_BOM", ver: "1.000" });
    expect(opened).toEqual(["mdm:dmc/codeItemEdit"]);
    openCodeEdit("QC_USE_YN", null);
    expect(handoff()).toEqual({ maruCodeId: "QC_USE_YN" });
  });
});

describe("마스터코드 화면", () => {
  it("진입 때 화면의 코드 묶음을 한 번 읽고 첫 묶음을 상세로 보인다", async () => {
    await mount(MasterCodePage);
    expect(calls.length).toBeGreaterThan(0);
    const asked = calls.flatMap((c) => c.codeIds);
    expect(asked).toContain("QC_PRD_NM_CD");
    expect(asked).toContain("QC_OC_ACTOR");
    expect(text(byTestId("masterCode-detail-codeId"))).toBe("QC_PRODUCT_TYPE");
    expect(text(byTestId("masterCode-detail-ver"))).toBe(
      "적용 버전 없음 · 0건",
    );
    await click(button("Maru에서 편집"));
    expect(handoff()).toEqual({ maruCodeId: "QC_PRODUCT_TYPE" });
  });
});

describe("칼라부재료관리 화면", () => {
  it("부재료를 구분 막대와 함께 보이고 첫 부재료 상세를 보인다", async () => {
    await mount(ColorSubmaterialPage);
    expect(calls[0].codeIds).toEqual(["QC_COLOR_SUBMAT", "QC_COLOR_BOM"]);
    const kinds = text(byTestId("colorSubmaterial-kind"));
    expect(kinds).toContain("전체 16");
    expect(kinds).toContain("상도 8");
    expect(kinds).toContain("보호필름 2");
    expect(text(byTestId("colorSubmaterial-detail-code"))).toBe("PM-EP05");
    expect(text(byTestId("colorSubmaterial-detail-thk"))).toBe("5 ㎛");
    expect(byTestId("colorSubmaterial-swatch")).toBeTruthy();
    await click(button("Maru에서 편집"));
    expect(handoff()).toEqual({ maruCodeId: "QC_COLOR_SUBMAT", ver: "1.000" });
  });
});

describe("칼라BOM관리 화면", () => {
  it("첫 BOM 의 도장 단면과 도막 합계를 그린다", async () => {
    await mount(ColorBomPage);
    expect(calls[0].codeIds).toEqual([
      "QC_COLOR_BOM",
      "QC_COLOR_SUBMAT",
      "QC_PRD_NM_CD",
    ]);
    expect(text(byTestId("colorBom-coat-total"))).toBe("도막 합계 27 ㎛");
    const svg = byTestId("colorBom-diagram");
    expect(svg?.tagName.toLowerCase()).toBe("svg");
    expect(byTestId("colorBom-diagram-band-S00001-FT")).toBeTruthy();
    expect(byTestId("colorBom-diagram-band-steel")).toBeTruthy();
    expect(text(byTestId("colorBom-diagram-brace-front"))).toBe("전면 20 ㎛");
    expect(text(svg)).toContain("전면 상도 · PE 상도 회백색");
    await click(button("Maru에서 편집"));
    expect(handoff()).toEqual({ maruCodeId: "QC_COLOR_BOM", ver: "1.000" });
  });
});
