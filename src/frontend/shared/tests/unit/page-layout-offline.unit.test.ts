// @vitest-environment happy-dom

import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageLayout } from "../../src/layout/PageLayout";
import { renderWithMantine } from "./mantine-test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PageLayout offline contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("does not request auth or RBAC data when objId is omitted", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    // 렌더 하네스만 renderWithMantine 으로 교체(Mantine 컴포넌트는 Provider 없이 렌더 불가) — 단언은 무변경.
    const r = renderWithMantine(
      createElement(
        PageLayout,
        {
          title: "Offline design page",
          buttons: [{ id: "search", label: "조회", onClick: vi.fn() }],
        },
        createElement("div", null, "local data")
      )
    );

    expect(fetchSpy).not.toHaveBeenCalled();

    r.unmount();
  });
});
