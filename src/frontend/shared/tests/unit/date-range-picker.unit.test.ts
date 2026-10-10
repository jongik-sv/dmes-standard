/** @vitest-environment happy-dom */
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DateRangePicker } from "../../src/components/form";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

describe("DateRangePicker", () => {
  let rendered: Rendered | undefined;
  afterEach(() => rendered?.unmount());

  it("두 칸에 값과 aria-label 을 그린다", () => {
    rendered = renderWithMantine(
      createElement(DateRangePicker, { from: "2026-10-01", to: "2026-10-10", onChange: () => {}, id: "rg", toAriaLabel: "끝날" }),
    );
    const from = rendered.host.querySelector<HTMLInputElement>("#rg-from")!;
    const to = rendered.host.querySelector<HTMLInputElement>("#rg-to")!;
    expect(from.value).toBe("2026-10-01");
    expect(to.value).toBe("2026-10-10");
    expect(from.getAttribute("aria-label")).toBe("시작일");
    expect(to.getAttribute("aria-label")).toBe("끝날");
    expect(rendered.host.querySelector('[role="alert"]')).toBeNull();
  });

  it("시작이 종료보다 늦으면 오류를 보인다", () => {
    rendered = renderWithMantine(
      createElement(DateRangePicker, { from: "2026-10-11", to: "2026-10-10", onChange: () => {}, id: "rg" }),
    );
    expect(rendered.host.querySelector('[role="alert"]')?.textContent).toContain("시작일이 종료일보다 늦습니다");
    expect(rendered.host.querySelector("#rg-to")!.getAttribute("aria-invalid")).toBe("true");
  });
});
