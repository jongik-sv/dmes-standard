/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { DmesUiProvider } from "../../src/ui-provider";
import { useMessage } from "../../src/components/message-provider";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe() {
  const { showMessage } = useMessage();
  return createElement(
    "span",
    { "data-ok": typeof showMessage === "function" ? "1" : "0" },
    "probe",
  );
}

describe("DmesUiProvider", () => {
  it("MessageProvider 를 포함해 useMessage 가 동작한다", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(createElement(DmesUiProvider, null, createElement(Probe)));
    });
    expect(host.querySelector("span")?.getAttribute("data-ok")).toBe("1");
    act(() => root.unmount());
    host.remove();
  });

  it("dmes 팔레트 CSS 변수를 주입한다", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(createElement(DmesUiProvider, null, createElement("i")));
    });
    const style = document.querySelector("style[data-mantine-styles]")?.textContent ?? "";
    expect(style).toContain("--mantine-color-dmes-6: #337ab7");
    act(() => root.unmount());
    host.remove();
  });
});
