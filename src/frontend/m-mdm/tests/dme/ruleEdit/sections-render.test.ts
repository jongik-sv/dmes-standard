/** @vitest-environment happy-dom */

// TSK-08-03 design §3.2 — 열 설정 섹션 렌더 스모크(happy-dom). 순수 로직은 column-draft.test.ts 가 덮고, 여기서는 화면 연결만 본다:
// 초안 편집 → 검사 표시 → 적용 요청 본문(part COLUMNS, grids.rows.rows)·거부 시 요청 없음, 초안 dirty 면 표 저장 차단, 열 머리 하이라이트.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { DecisionTableCard } from "../../../pages/dme/ruleEdit/decision-table/DecisionTableCard";
import { ColumnSettingsSection } from "../../../pages/dme/ruleEdit/sections/columns/ColumnSettingsSection";
import { ColumnDraftSharedContext } from "../../../pages/dme/ruleEdit/sections/column-draft-context";
import { TABLE_SECTIONS } from "../../../pages/dme/ruleEdit/sections";
import type { RuleEditCardProps } from "../../../pages/dme/ruleEdit/cards";
import type { RuleEditView } from "../../../pages/dme/ruleEdit/types";
import { findButton, flush, installDomStorage, jsonResponse, typeInto, visibleText } from "../helpers/render";
import { draftView } from "./fixtures";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let bodies: Array<{ url: string; body: Record<string, unknown> }> = [];
let writes = 0;
const notices: unknown[] = [];

const CANDIDATES = [
  { name: "COIL_THK", label: "두께", kind: "COLUMN" as const },
  { name: "COIL_WID", label: "폭", kind: "COLUMN" as const },
  { name: "SURF_GRD", label: "표면등급", kind: "COLUMN" as const },
];

function view(over: Partial<RuleEditView> = {}): RuleEditView {
  return {
    ...draftView("e2e_mdm_steward"),
    varCandidates: CANDIDATES,
    varMeta: [],
    ...over,
  };
}

function props(v: RuleEditView, canDo: (a: string) => boolean = () => true): RuleEditCardProps {
  return {
    view: v,
    me: v.me,
    editable: v.editable,
    reload: async () => {},
    selectVer: async () => {},
    notify: (n) => notices.push(n),
    runWrite: async (fn) => {
      const r = await fn();
      writes++;
      return r;
    },
    setDirty: () => {},
    canDo,
    busy: false,
  };
}

async function mount(node: ReturnType<typeof createElement>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, node));
  });
  await flush();
}

const q = <T extends Element>(sel: string) => container.querySelector(sel) as T;

describe("열 설정 섹션 렌더", () => {
  beforeEach(() => {
    installDomStorage();
    bodies = [];
    writes = 0;
    notices.length = 0;
    globalThis.sessionStorage?.clear();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      bodies.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      if (url.includes("/oasis/ruleEdit/save")) return jsonResponse({ meta: { success: true }, data: { result: { part: "COLUMNS", rowVersion: 4, rowIdMap: { "-1": 6 }, issues: [] } } });
      return jsonResponse({}, 404);
    }) as typeof fetch;
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
  });

  it("열마다 한 줄, 처음에는 변경이 없어 적용·버리기가 꺼져 있다", async () => {
    await mount(createElement(ColumnSettingsSection, props(view())));
    expect(container.querySelectorAll("[data-testid^='col-row-']")).toHaveLength(5);
    expect(q<HTMLButtonElement>("[data-testid='col-apply']").disabled).toBe(true);
    expect(q<HTMLButtonElement>("[data-testid='col-discard']").disabled).toBe(true);
    expect(container.querySelector("[data-testid='col-dirty']")).toBeNull();
  });

  it("읽기 전용(편집 불가)이면 편집 버튼 없이 표만 보인다", async () => {
    await mount(createElement(ColumnSettingsSection, props(draftView("other_user"))));
    expect(q("[data-testid='col-readonly']")).not.toBeNull();
    expect(container.querySelector("[data-testid='col-apply']")).toBeNull();
    expect((q("[data-testid='col-name-v1'] input, input[data-testid='col-name-v1']") as HTMLInputElement).disabled).toBe(true);
  });

  it("값 타입 없는 프로그램 변수를 넣으면 줄 검사가 거부를 보이고, 적용을 눌러도 요청을 보내지 않는다(원자)", async () => {
    await mount(createElement(ColumnSettingsSection, props(view())));
    await typeInto(q<HTMLInputElement>("input[data-testid='col-name-v2']"), "MY_PROG_VAR");
    expect(q("[data-testid='col-check-v2']").textContent).toContain("프로그램 변수는 값 타입을 선언해야 합니다");
    expect(q("[data-testid='col-reject-count']").textContent).toContain("거부 1건");
    await act(async () => {
      q<HTMLButtonElement>("[data-testid='col-apply']").click();
    });
    await flush();
    expect(bodies.filter((b) => b.url.includes("/oasis/ruleEdit/save"))).toHaveLength(0);
    expect(q("[data-testid='col-apply-rejects']").textContent).toContain("아무 것도 반영되지 않음");
  });

  it("결과 열을 추가해 적용하면 part COLUMNS 요청이 grids.rows.rows 로 가고 적중 정책은 싣지 않는다", async () => {
    await mount(createElement(ColumnSettingsSection, props(view())));
    await act(async () => {
      q<HTMLButtonElement>("[data-testid='col-add-result']").click();
    });
    await typeInto(q<HTMLInputElement>("input[data-testid='col-name-n1']"), "NEW_RES");
    // 새 결과 열은 값 타입이 필요하다 — 기본 타입 선택.
    const select = q<HTMLSelectElement>("select[data-testid='col-type-n1']");
    await act(async () => {
      select.value = "STRING";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(q("[data-testid='col-notices']").textContent).toContain("새 열 NEW_RES");
    await act(async () => {
      q<HTMLButtonElement>("[data-testid='col-apply']").click();
    });
    await flush();
    const save = bodies.find((b) => b.url.includes("/oasis/ruleEdit/save"))!;
    const params = save.body.params as Record<string, unknown>;
    expect(params).toEqual({ part: "COLUMNS", maruRuleId: "QLTY_GRD_JDG", ver: 2, rowVersion: 3 });
    const rows = (save.body.grids as { rows: { rows: Array<Record<string, unknown>> } }).rows.rows;
    expect(rows).toHaveLength(6);
    expect(rows[5]).toMatchObject({ varId: -1, varKind: "RESULT", varName: "NEW_RES", dataType: "STRING" });
    expect(writes).toBe(1);
    expect(JSON.stringify(notices)).toContain("새 열 NEW_RES");
  });

  it("초안 버리기는 변경을 되돌린다", async () => {
    await mount(createElement(ColumnSettingsSection, props(view())));
    await typeInto(q<HTMLInputElement>("input[data-testid='col-label-v1']"), "바뀐 이름");
    expect(q("[data-testid='col-dirty']")).not.toBeNull();
    await act(async () => {
      q<HTMLButtonElement>("[data-testid='col-discard']").click();
    });
    expect(container.querySelector("[data-testid='col-dirty']")).toBeNull();
    expect(q<HTMLInputElement>("input[data-testid='col-label-v1']").value).toBe("두께");
  });

  it("열 머리 클릭이 정한 varId 의 줄은 하이라이트된다", async () => {
    const shared = { colDirty: false, setColDirty: () => {}, highlightVarId: 3, setHighlightVarId: () => {} };
    await mount(createElement(ColumnDraftSharedContext.Provider, { value: shared }, createElement(ColumnSettingsSection, props(view()))));
    expect(q("[data-testid='col-row-v3']").getAttribute("data-highlight")).toBe("true");
    expect(q("[data-testid='col-row-v1']").getAttribute("data-highlight")).toBeNull();
  });
});

describe("표 카드 + 열 설정 섹션(불변 13)", () => {
  beforeEach(() => {
    installDomStorage();
    globalThis.sessionStorage?.clear();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      return jsonResponse({}, 404);
    }) as typeof fetch;
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
  });

  it("섹션 목록에 열 설정이 들어 있다", () => {
    expect(TABLE_SECTIONS.map((s) => s.id)).toContain("columns");
  });

  it("열 설정 초안이 dirty 이면 표 저장이 꺼지고 안내가 나오며, 초안을 버리면 다시 켜진다", async () => {
    await mount(createElement(DecisionTableCard, { ...props(view()), extraSections: TABLE_SECTIONS }));
    await act(async () => {
      findButton(container, "행 추가").click();
    });
    expect(findButton(container, "표 저장").disabled).toBe(false);
    expect(container.querySelector("[data-testid='dt-col-block']")).toBeNull();

    await typeInto(q<HTMLInputElement>("input[data-testid='col-label-v1']"), "바뀐 이름");
    expect(findButton(container, "표 저장").disabled).toBe(true);
    expect(visibleText(q("[data-testid='dt-col-block']"))).toContain("열 설정 초안이 있어");

    await act(async () => {
      q<HTMLButtonElement>("[data-testid='col-discard']").click();
    });
    expect(findButton(container, "표 저장").disabled).toBe(false);
    expect(container.querySelector("[data-testid='dt-col-block']")).toBeNull();
  });
});
