/** @vitest-environment happy-dom */
// 검사증명서관리 화면 렌더 시험 — 서버 대역(FakeMtcServer)을 넘겨 진입 조회, 탭 5개, 종이 미리보기, 재발행 확인 창, 진위 확인을 본다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { InspectionCertificateScreen } from "@/qpr/inspectionCertificate/InspectionCertificatePage";

import { FakeMtcServer } from "./fakeApi";

const STORES = ["__dkOasisButtonRbacStore__", "__dkOasisCurrentUserStore__"];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let host: HTMLDivElement;
let root: Root;
let server: FakeMtcServer;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const k of STORES) delete (globalThis as Record<string, unknown>)[k];
  server = new FakeMtcServer();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return json({ user: { id: "tester" } });
      if (url.includes("/secUser/myButtonEndpoints")) return json({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
      return json({}, 404);
    }),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const settle = async (n = 10) => {
  for (let i = 0; i < n; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};
const text = () => (host.textContent ?? "").replace(/\s+/g, " ");
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === label) as HTMLButtonElement | undefined;
async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => (el as HTMLElement).click());
  await settle();
}

async function mount() {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement(InspectionCertificateScreen, { api: server.api() })));
  });
  await settle(20);
}

describe("검사증명서관리 화면", () => {
  it("진입하면 발행본을 읽어 탭 5개와 선택한 증명서·종이 미리보기를 보인다", async () => {
    await mount();
    expect(server.calls[0].action).toBe("search");
    const t = text();
    for (const label of ["발행 (5)", "양식 편집", "단건 수정", "예외 규칙", "서명·스탬프"]) expect(t).toContain(label);
    expect(t).toContain("선택한 증명서");
    expect(t).toContain("V-44 REMARK — BIS 인증 안내");
    expect(host.querySelector('[data-testid="mtc-paper-frame"]')).toBeTruthy();
  });

  it("재발행은 차이 확인 창을 거친다", async () => {
    await mount();
    await click(button("재발행 (현재 규칙)"));
    expect(document.body.textContent).toContain("재발행");
    const confirmBtn = [...document.body.querySelectorAll("button")].filter((b) => (b.textContent ?? "").trim() === "재발행").at(-1);
    await click(confirmBtn);
    await settle(10);
    expect(server.calls.some((c) => c.action === "reissue")).toBe(true);
  });

  it("탭을 바꾸면 그 편집 패널이 나온다", async () => {
    await mount();
    for (const [tab, expected] of [
      ["양식 편집", "표 칸 구성"],
      ["단건 수정", "수정 사유"],
      ["예외 규칙", "시뮬레이션"],
      ["서명·스탬프", "새 이미지 올리기"],
    ]) {
      const el = [...host.querySelectorAll("[role=tab], button")].find((b) => (b.textContent ?? "").trim().startsWith(tab));
      await click(el);
      expect(text()).toContain(expected);
    }
  });
});
