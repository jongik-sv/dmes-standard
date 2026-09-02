// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageLayout } from "../../src/layout/PageLayout";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PageLayout offline contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("does not request auth or RBAC data when objId is omitted", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          PageLayout,
          {
            title: "Offline design page",
            buttons: [{ id: "search", label: "조회", onClick: vi.fn() }],
          },
          createElement("div", null, "local data")
        )
      );
    });

    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
