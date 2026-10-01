/** @vitest-environment happy-dom */

// 값 테스트 카드(④)의 입력 계약 계산 횟수 — 표 카드가 편집 중인 표를 올릴 때마다(`publishTableDraft`) 계약을 다시 계산하던 낭비를 센다.
// 계약은 편집본(BODY) 대상의 행 내용에 기대므로 BODY 는 표가 바뀌면 다시 계산해야 하지만, 저장된 버전(VERSION) 대상이나
// 다른 룰·버전의 표가 올라온 경우에는 계약 원본이 그대로라 다시 계산할 일이 없다.
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import type { RuleEditCardProps } from "../../../pages/dme/ruleEdit/cards";
import { ValueTestCard } from "../../../pages/dme/ruleEdit/cards/ValueTestCard";
import { RuleWorkbenchProvider, useRuleWorkbench, type TableDraft } from "../../../pages/dme/ruleEdit/state/workbench-context";
import type { RuleEditView, StoredRow } from "../../../pages/dme/ruleEdit/types";
import { clearVersionViewCache } from "../../../pages/dme/ruleEdit/value-test/run-request";
import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse } from "../helpers/render";
import { draftView } from "./fixtures";

const counts = vi.hoisted(() => ({ contract: 0 }));
vi.mock("@/evalex", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../../src/evalex")>();
  return {
    ...m,
    computeInputContract: (...a: Parameters<typeof m.computeInputContract>) => {
      counts.contract++;
      return m.computeInputContract(...a);
    },
  };
});

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let publish: ((d: Omit<TableDraft, "rev">) => void) | null = null;

function Probe(): ReactNode {
  publish = useRuleWorkbench().publishTableDraft;
  return null;
}

function propsOf(view: RuleEditView): RuleEditCardProps {
  return {
    view,
    me: view.me,
    editable: view.editable,
    reload: async () => {},
    selectVer: async () => {},
    notify: () => {},
    runWrite: async (fn) => fn(),
    setDirty: () => {},
    canDo: () => true,
    busy: false,
  };
}

async function render(view: RuleEditView) {
  await act(async () => {
    root!.render(
      createElement(DmesUiProvider, null, createElement(RuleWorkbenchProvider, null, createElement(Probe), createElement(ValueTestCard, propsOf(view)))),
    );
  });
  await flush();
}

/** 표 카드가 올리는 것처럼 편집 중인 표를 올린다. */
async function publishRows(draft: Omit<TableDraft, "rev">) {
  await act(async () => publish!(draft));
  await flush();
}

function rowsWith(view: RuleEditView, i: number, left: string): StoredRow[] {
  return view.rows.map((r, k) => (k === i ? { ...r, cells: r.cells.replace('"left":"1000"', `"left":"${left}"`) } : r));
}

describe("값 테스트 카드 계약 계산 횟수", () => {
  beforeEach(() => {
    installDomStorage();
    clearVersionViewCache();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
  });

  it("저장된 버전 대상이면 표를 고쳐 올려도 계약을 다시 계산하지 않는다", async () => {
    const view = draftView("someone_else"); // 편집 불가 → 대상은 버전 2(저장된 버전)
    await render(view);
    expect((container.querySelector('[data-testid="vt-target"]') as HTMLSelectElement).value).toBe("V:2");
    const first = counts.contract;
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      await publishRows({ ruleId: view.rule.maruRuleId, ver: 2, hitPolicy: "FIRST", rows: rowsWith(view, 0, String(2000 + i)), dirty: true });
    }
    const extra = counts.contract - first;
    console.log(`① VERSION 대상 표 올림 3회: 계약 계산 ${extra}회`);
    expect(extra).toBe(0);
    expect(container.querySelector('[data-testid="vt-field-COIL_THK"]')).not.toBeNull();
  });

  it("편집본 대상이면 이 룰·버전의 표 내용이 바뀔 때만 다시 계산한다", async () => {
    const view = draftView("e2e_mdm_steward");
    await render(view);
    expect((container.querySelector('[data-testid="vt-target"]') as HTMLSelectElement).value).toBe("BODY");
    const base = counts.contract;
    // 다른 버전의 표 — 편집본은 view 의 저장된 행을 그대로 쓰므로 계약 원본이 같다.
    await publishRows({ ruleId: view.rule.maruRuleId, ver: 1, hitPolicy: "FIRST", rows: rowsWith(view, 0, "3000"), dirty: true });
    const otherVer = counts.contract - base;
    // 이 버전의 표 — 행 내용이 바뀌었으니 한 번 계산한다.
    const edited = rowsWith(view, 0, "4000");
    await publishRows({ ruleId: view.rule.maruRuleId, ver: 2, hitPolicy: "FIRST", rows: edited, dirty: true });
    const own = counts.contract - base - otherVer;
    // 같은 행 배열로 dirty 만 바뀌어도 다시 계산하지 않는다.
    await publishRows({ ruleId: view.rule.maruRuleId, ver: 2, hitPolicy: "FIRST", rows: edited, dirty: false });
    const dirtyOnly = counts.contract - base - otherVer - own;
    console.log(`① BODY 대상: 다른 버전 표 ${otherVer}회, 이 버전 표 ${own}회, dirty 만 ${dirtyOnly}회`);
    expect(otherVer).toBe(0);
    expect(own).toBe(1);
    expect(dirtyOnly).toBe(0);
  });
});
