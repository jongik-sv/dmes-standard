/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { addCatch, toEditFlow, type EditFlow, type EditResult } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { edgeChips } from "../../../pages/dme/ruleSetEdit/flow-vars";
import { panelTargetOf } from "../../../pages/dme/ruleSetEdit/panels/PanelHeader";
import { PropertyPanel, type PropertyPanelProps } from "../../../pages/dme/ruleSetEdit/panels/PropertyPanel";
import type { SectionMemory } from "../../../pages/dme/ruleSetEdit/panels/Section";
import type { RuleSetCheck } from "../../../pages/dme/ruleSetEdit/types";
import { installDomStorage } from "../helpers/render";

function must(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → end, c1(NO_RESULT) → end, c2(INPUT_ERROR) → end. */
const twoCatches = () => must(addCatch(must(addCatch(toEditFlow(null, ["R_A"]), "r1", null)), "r1", null));
const OPEN: SectionMemory = { isOpen: () => true, toggle: () => {}, open: () => {} };

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  installDomStorage();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function draw(over: Partial<PropertyPanelProps> = {}) {
  const edits: EditFlow[] = [];
  const rejected: string[] = [];
  const base: PropertyPanelProps = {
    flow: twoCatches(), rules: {}, checks: [], selectedId: "c1", editable: true, editing: true, sections: OPEN, onOpenRule: () => {},
    onEdit: (fn) => {
      const r = fn(base.flow);
      if ("ok" in r && !r.ok) {
        rejected.push(r.reason);
        return r.reason;
      }
      edits.push("ok" in r ? r.flow : r);
      return null;
    },
    ...over,
  };
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement(PropertyPanel, base)));
  });
  return { edits, rejected };
}
const box = (k: string) => document.querySelector(`[data-testid="flow-prop-catch-kind-${k}"] input[type="checkbox"]`) as HTMLInputElement;

describe("속성 패널: 받는 노드(받는 노드 spec §8)", () => {
  it("받는 종류 네 개를 체크로 보이고, 같은 룰의 다른 받는 노드가 받는 종류는 끈다", async () => {
    await draw();
    expect(document.querySelector('[data-testid="flow-prop-catch"]')).not.toBeNull();
    expect(box("NO_RESULT").checked).toBe(true);
    expect(box("INPUT_ERROR").disabled).toBe(true);
    expect(document.querySelector('[data-testid="flow-prop-catch-owner-INPUT_ERROR"]')!.textContent).toBe("c2가 받는다");
    expect(box("EVAL_ERROR").checked).toBe(false);
  });

  it("체크를 켜면 편집 한 번으로 종류를 정해진 순서로 넣는다", async () => {
    const { edits } = await draw();
    await act(async () => {
      box("HIT_CONFLICT").click();
    });
    expect(edits).toHaveLength(1);
    expect(edits[0].nodes.find((n) => n.id === "c1")!.catches).toEqual(["NO_RESULT", "HIT_CONFLICT"]);
  });

  it("마지막 하나를 끄려 하면 편집이 거부된다", async () => {
    const { edits, rejected } = await draw();
    await act(async () => {
      box("NO_RESULT").click();
    });
    expect(edits).toHaveLength(0);
    expect(rejected).toEqual(["받을 예외 종류를 하나 이상 고른다"]);
  });

  it("종류 옆에 그 종류의 CATCH_NEVER 경고를 보인다", async () => {
    const never: RuleSetCheck = {
      code: "CATCH_NEVER", severity: "WARN", ruleId: "R_A", otherRuleId: null, varName: null,
      message: "R_A에 기본 행이 있어 c1가 받는 결과 없음이 일어나지 않는다", nodeId: "c1", edgeId: null,
    };
    await draw({ checks: [never] });
    expect(document.querySelector('[data-testid="flow-prop-catch-never-NO_RESULT"]')!.textContent).toBe(never.message);
    expect(document.querySelector('[data-testid="flow-prop-catch-never-HIT_CONFLICT"]')).toBeNull();
  });

  it("다른 받는 노드의 CATCH_NEVER 경고는 보이지 않는다", async () => {
    const other: RuleSetCheck = {
      code: "CATCH_NEVER", severity: "WARN", ruleId: "R_A", otherRuleId: null, varName: null,
      message: "R_A에 기본 행이 있어 c2가 받는 결과 없음이 일어나지 않는다", nodeId: "c2", edgeId: null,
    };
    await draw({ checks: [other] });
    expect(document.querySelector('[data-testid="flow-prop-catch-never-NO_RESULT"]')).toBeNull();
  });

  it("받는 노드에는 노드 설명 입력 칸이 없다", async () => {
    await draw();
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.querySelector('[data-testid="flow-prop-desc"]')).toBeNull();
  });

  it("머리글 이름은 label, 없으면 받는 종류 이름이다", () => {
    const f = twoCatches();
    expect(panelTargetOf(f, {}, "c1", null, "세트").name).toBe("결과 없음");
    expect(panelTargetOf(f, {}, "c2", null, "세트").name).toBe("입력 오류");
  });

  it("처리 갈래 첫 선의 변수 칩은 CATCH_* 다섯이다(하위 세트 Ruling 3·4 — CATCH_SET 포함)", () => {
    const f = twoCatches();
    const first = f.edges.find((e) => e.from === "c1")!;
    expect(edgeChips(f, {})[first.id]).toEqual(["CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG", "CATCH_SET"]);
  });
});
