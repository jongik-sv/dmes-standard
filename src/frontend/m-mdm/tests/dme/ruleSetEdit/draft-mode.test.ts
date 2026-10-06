/** @vitest-environment happy-dom */

// 룰 버전 선택 칸(spec 2026-10-06 §7.1·§7.4) — 칸이 있고 기본값이 "적용 중(기본)", 내 DRAFT 우선일 때만 검사 기준 안내가 보인다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { DRAFT_CHECK_NOTE, InputForm } from "../../../pages/dme/ruleSetEdit/debugger/InputForm";
import type { Simulation } from "../../../pages/dme/ruleSetEdit/debugger/useSimulation";
import type { RuleVersionMode } from "../../../pages/dme/ruleSetEdit/types";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const simOf = (ruleVersions: RuleVersionMode, setRuleVersions = vi.fn()) =>
  ({ fields: [], json: "", evalTs: "", evalTsError: null, setEvalTs: vi.fn(), ruleVersions, setRuleVersions }) as unknown as Simulation;

async function mount(sim: Simulation) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(InputForm, { sim })));
  });
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe("InputForm — 룰 버전 선택 칸", () => {
  it("칸이 있고 기본값은 적용 중(기본), 안내는 보이지 않는다", async () => {
    await mount(simOf("RELEASED"));
    const select = container!.querySelector<HTMLSelectElement>('[data-testid="dbg-rule-versions"]');
    expect(select).not.toBeNull();
    expect(select!.value).toBe("RELEASED");
    expect(select!.selectedOptions[0].textContent).toBe("적용 중(기본)");
    expect(container!.querySelector('[data-testid="dbg-draft-check-note"]')).toBeNull();
  });
  it("내 DRAFT 우선이면 검사 기준 안내가 보인다", async () => {
    await mount(simOf("MY_DRAFT"));
    const select = container!.querySelector<HTMLSelectElement>('[data-testid="dbg-rule-versions"]');
    expect(select!.selectedOptions[0].textContent).toBe("내 DRAFT 우선");
    expect(container!.querySelector('[data-testid="dbg-draft-check-note"]')?.textContent).toBe(DRAFT_CHECK_NOTE);
  });
  it("선택을 바꾸면 setRuleVersions 가 불린다", async () => {
    const setRuleVersions = vi.fn();
    await mount(simOf("RELEASED", setRuleVersions));
    const select = container!.querySelector<HTMLSelectElement>('[data-testid="dbg-rule-versions"]')!;
    await act(async () => {
      select.value = "MY_DRAFT";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(setRuleVersions).toHaveBeenCalledWith("MY_DRAFT");
  });
});
