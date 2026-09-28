/** @vitest-environment happy-dom */

// TSK-06-02 design.md §6.10·I27 — 화면 간 파라미터 넘김 규약. pageId = "mdm:" + componentPath, params 는 한 번만 소비한다.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { openMdmPage, takeMdmPageParams, useMdmPageParams, type MdmPageParams } from "@/shell";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  // 남은 넘김 값은 다음 테스트에 새지 않게 비운다
  takeMdmPageParams("dmc/codeMng");
});

describe("page-handoff", () => {
  it("openMdmPage 는 mdm: 접두 pageId 로 portal-open-tab 을 낸다", () => {
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener("portal-open-tab", listener);
    openMdmPage("dmc/codeMng", { maruCodeId: "X" });
    window.removeEventListener("portal-open-tab", listener);
    expect(seen).toEqual([{ pageId: "mdm:dmc/codeMng" }]);
  });

  it("takeMdmPageParams 는 한 번만 돌려준다", () => {
    openMdmPage("dmc/codeMng", { maruCodeId: "X" });
    expect(takeMdmPageParams("dmc/codeMng")).toEqual({ maruCodeId: "X" });
    expect(takeMdmPageParams("dmc/codeMng")).toBeNull();
  });

  it("params 없이 열면 저장하지 않는다", () => {
    openMdmPage("dmc/codeMng");
    expect(takeMdmPageParams("dmc/codeMng")).toBeNull();
  });

  it("useMdmPageParams 는 마운트 때와 자기 탭 활성화 때 소비한다", async () => {
    const received: MdmPageParams[] = [];
    function Probe() {
      useMdmPageParams("dmc/codeMng", "tab-1", (p) => received.push(p));
      return null;
    }
    openMdmPage("dmc/codeMng", { maruCodeId: "A" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(createElement(Probe)));
    expect(received).toEqual([{ maruCodeId: "A" }]);

    // 다른 탭의 활성화는 소비하지 않는다
    openMdmPage("dmc/codeMng", { maruCodeId: "B" });
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId: "tab-9" } }));
    });
    expect(received).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId: "tab-1" } }));
    });
    expect(received).toEqual([{ maruCodeId: "A" }, { maruCodeId: "B" }]);
    expect(takeMdmPageParams("dmc/codeMng")).toBeNull();
  });
});
