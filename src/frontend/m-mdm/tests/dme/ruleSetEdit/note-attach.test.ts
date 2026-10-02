/** @vitest-environment happy-dom */

// 메모 서식 편집기 붙이기 — 캔버스 메모(NoteNodeView)·오른쪽 패널 「메모」 칸이 shared 마크다운 편집기(@dk-oasis/shared/markdown-editor)를 쓴다.
// 편집하지 않을 때는 서식이 적용된 읽기 전용 모습, 편집 중에는 캔버스를 움직이지 않는 편집기(nodrag nowheel nopan), 링크는 새 탭·노드 고르기와 충돌 없음.
// 편집 방식 기억은 룰 세트 키 rsf:noteEditMode(사용자가 골라 둔 값 유지) — 캔버스·패널이 같은 키라 같이 바뀐다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { addNote, setPositions, toEditFlow, updateNote, type EditFlow, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { clearLayoutCache } from "../../../pages/dme/ruleSetEdit/flow-layout";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage, polyfillLayout, typeInto } from "../helpers/render";
import { byTestId, click as clickId, installServer, openSet, pageContainer, q as pq, uninstallServer } from "../helpers/rule-set-page";

/** 메모 편집 방식(서식·MD)을 룰 세트 키에 미리 적는다 — shared 편집기가 열릴 때 이 값을 읽는다(JSON 문자열, 예전 local-store 와 같은 형식). */
const NOTE_MODE_KEY = "rsf:noteEditMode";
function setNoteEditMode(mode: "wysiwyg" | "markdown") {
  localStorage.setItem(NOTE_MODE_KEY, JSON.stringify(mode));
}

const P = (x: number, y: number): FlowPos => ({ x, y });
const base = () => setPositions(toEditFlow(null, ["NA_A", "NA_B"]), { start: P(0, 0), r1: P(0, 150), r2: P(0, 300), end: P(0, 450) });
function withNote(text: string): { flow: EditFlow; id: string } {
  const r = addNote(base(), P(300, 150), null);
  return { flow: updateNote(r.flow, r.id, { text }), id: r.id };
}

const noop = () => {};
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: base(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
    onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    onRouteChange: noop, ...over,
  };
}

const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const fire = async (el: Element, type: string, init: MouseEventInit = {}) =>
  act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
const esc = async (el: Element) =>
  act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });

describe("캔버스 메모 — MarkdownEditor 붙이기", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    installDomStorage();
    localStorage.clear();
    polyfillLayout();
    setNoteEditMode("wysiwyg");
    clearLayoutCache();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    setNoteEditMode("wysiwyg");
  });
  async function draw(p: FlowCanvasProps) {
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
    });
    await flush();
  }

  it("편집하지 않을 때는 보기·편집 모드 모두 서식이 적용된 읽기 전용 모습이다(편집기 없음)", async () => {
    const { flow, id } = withNote("**굵게** 글\n- 하나");
    for (const mode of ["view", "edit"] as const) {
      await draw(props({ flow, mode }));
      const note = q(`flow-note-${id}`)!;
      expect(note.querySelector("strong")?.textContent, mode).toBe("굵게");
      expect(note.querySelector("ul li")?.textContent, mode).toBe("하나");
      expect(note.querySelector(".cm-md-editing"), mode).toBeNull();
      expect(note.querySelector("textarea, [contenteditable]"), mode).toBeNull();
      expect(q(`flow-note-text-${id}`), mode).toBeNull();
    }
  });

  it("보기·디버그 모드에서는 두 번 눌러도 편집기가 열리지 않는다", async () => {
    const { flow, id } = withNote("메모");
    for (const mode of ["view", "debug"] as const) {
      await draw(props({ flow, mode, selectedId: id }));
      await fire(q(`flow-note-${id}`)!, "dblclick");
      await fire(q(`flow-note-${id}`)!, "click");
      expect(q(`flow-note-text-${id}`), mode).toBeNull();
    }
  });

  it("편집 중에는 MarkdownEditor(도구 막대 floating) — 뿌리에 nodrag nowheel nopan nokey, 도구 막대가 메모 안에 함께 있다", async () => {
    const { flow, id } = withNote("메모");
    await draw(props({ flow, selectedId: id }));
    await fire(q(`flow-note-${id}`)!, "dblclick");
    await flush();
    const ed = q(`flow-note-text-${id}`)!;
    expect(ed).not.toBeNull();
    expect(ed.getAttribute("data-editing")).toBe("true");
    for (const c of ["nodrag", "nowheel", "nopan", "nokey", "cm-md-floating", "cm-md-editing"]) expect(ed.classList.contains(c), c).toBe(true);
    expect(q(`flow-note-${id}`)!.contains(ed.querySelector('[data-testid="md-toolbar"]'))).toBe(true);
    // 크기 손잡이는 편집 중에도 그대로다.
    expect(document.querySelectorAll(`[data-testid^="flow-notegrip-${id}-"]`).length).toBe(3);
  });

  it("MD 모드에서 원문을 고치면 onNoteChange(id, {text}) 로 올린다", async () => {
    setNoteEditMode("markdown");
    const { flow, id } = withNote("메모");
    const onNoteChange = vi.fn();
    await draw(props({ flow, selectedId: id, onNoteChange }));
    await fire(q(`flow-note-${id}`)!, "dblclick");
    await flush();
    const ta = q(`flow-note-text-${id}`)!.querySelector<HTMLTextAreaElement>('[data-testid="md-editor-source"]')!;
    expect(ta.value).toBe("메모");
    await typeInto(ta, "## 제목");
    expect(onNoteChange).toHaveBeenLastCalledWith(id, { text: "## 제목" });
  });

  it("Esc 로 닫으면 읽기 모습으로 돌아가고 초점은 캔버스로 간다", async () => {
    setNoteEditMode("markdown");
    const { flow, id } = withNote("메모");
    await draw(props({ flow, selectedId: id }));
    await fire(q(`flow-note-${id}`)!, "click");
    await flush();
    const ta = q(`flow-note-text-${id}`)!.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(document.activeElement).toBe(ta);
    await esc(ta);
    await flush();
    expect(q(`flow-note-text-${id}`)).toBeNull();
    expect(document.activeElement).toBe(q("flow-canvas"));
  });

  it("편집기 밖 다른 칸으로 초점이 가면 닫히고, 그 칸의 초점은 그대로 둔다", async () => {
    setNoteEditMode("markdown");
    const { flow, id } = withNote("메모");
    const outside = document.createElement("input");
    document.body.appendChild(outside);
    await draw(props({ flow, selectedId: id }));
    await fire(q(`flow-note-${id}`)!, "click");
    await flush();
    await act(async () => outside.focus());
    await flush();
    expect(q(`flow-note-text-${id}`)).toBeNull();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("링크는 새 탭(noopener noreferrer)이고, 누르면 노드를 고르지도 편집기를 열지도 않는다", async () => {
    const { flow, id } = withNote("[사이트](https://example.com)");
    const onSelect = vi.fn();
    await draw(props({ flow, selectedId: id, onSelect }));
    const a = q(`flow-note-${id}`)!.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://example.com");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    // React Flow 의 끌기는 네이티브 이벤트라 React 전파 멈춤으로 막히지 않는다 — 링크에 nodrag nopan(linkClassName).
    expect(a.classList.contains("nodrag")).toBe(true);
    expect(a.classList.contains("nopan")).toBe(true);
    // 실제 새 탭 열기는 막는다(happy-dom 이동 방지).
    a.addEventListener("click", (e) => e.preventDefault());
    await fire(a, "pointerdown");
    await fire(a, "click");
    expect(onSelect).not.toHaveBeenCalled();
    expect(q(`flow-note-text-${id}`)).toBeNull();
  });
});

// ─────────────────────────────── 오른쪽 패널 「메모」 칸 ───────────────────────────────

const io = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [],
});
function viewOf(setId: string, flow: EditFlow): RuleSetView {
  return {
    set: { setId, setName: "메모 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["NA_A", "NA_B"], flow, branched: true },
    rules: [io("NA_A"), io("NA_B")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}

describe("오른쪽 패널 「메모」 칸 — MarkdownField(도구 막대 inline)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    polyfillLayout();
    setNoteEditMode("wysiwyg");
  });
  afterEach(() => {
    uninstallServer();
    setNoteEditMode("wysiwyg");
  });

  it("보기 모드 — 서식이 적용된 읽기 모습만, 눌러도 편집기가 열리지 않는다", async () => {
    const { flow, id } = withNote("**굵게**");
    await openSet("NA_1", viewOf("NA_1", flow));
    await clickId(`flow-note-${id}`);
    const view = byTestId("flow-prop-note-view");
    expect(view.querySelector("strong")?.textContent).toBe("굵게");
    await clickId("flow-prop-note-view");
    expect(pq("flow-prop-note-text")).toBeNull();
  });

  it("편집 모드 — 메모를 고르면 누르지 않아도 편집기(도구 막대 + 편집 칸)가 보이고, MD 원문을 고치면 캔버스 메모도 바뀌고, Esc·초점이 빠져도 닫히지 않는다", async () => {
    setNoteEditMode("markdown");
    const { flow, id } = withNote("메모");
    await openSet("NA_2", viewOf("NA_2", flow));
    await clickId("flow-mode-edit");
    await clickId(`flow-note-${id}`);
    await flush();
    expect(pq("flow-prop-note-view")).toBeNull();
    const ed = byTestId("flow-prop-note-text");
    expect(ed.getAttribute("data-editing")).toBe("true");
    expect(ed.classList.contains("cm-md-inline")).toBe(true);
    expect(ed.classList.contains("nodrag")).toBe(false);
    expect(ed.querySelector('[data-testid="md-toolbar"]')).not.toBeNull();
    // 처음 그릴 때 초점을 가져가지 않는다(캔버스 단축키를 빼앗지 않는다).
    expect(ed.contains(document.activeElement)).toBe(false);
    const ta = ed.querySelector<HTMLTextAreaElement>('[data-testid="md-editor-source"]')!;
    await act(async () => ta.focus());
    await typeInto(ta, "**새 글**");
    await flush();
    expect(byTestId(`flow-note-${id}`).querySelector("strong")?.textContent).toBe("새 글");
    await esc(ta);
    await flush();
    expect(pq("flow-prop-note-text")).not.toBeNull();
    expect(byTestId("flow-prop-note-text").querySelector('[data-testid="md-toolbar"]')).not.toBeNull();
    const outside = document.createElement("input");
    document.body.appendChild(outside);
    try {
      await act(async () => outside.focus());
      await flush();
      expect(byTestId("flow-prop-note-text").querySelector('[data-testid="md-toolbar"]')).not.toBeNull();
      expect(byTestId("flow-prop-note-text").querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("**새 글**");
    } finally {
      outside.remove();
    }
  });

  it("캔버스 서식 편집기 안의 Delete·Backspace·Ctrl+Z 는 화면 단축키(메모 지우기·흐름 되돌리기)로 가지 않는다", async () => {
    const { flow, id } = withNote("메모");
    await openSet("NA_4", viewOf("NA_4", flow));
    await clickId("flow-mode-edit");
    await clickId(`flow-note-${id}`);
    await clickId(`flow-note-${id}`);
    await flush();
    const rich = byTestId(`flow-note-text-${id}`).querySelector<HTMLElement>('[contenteditable="true"]')!;
    expect(rich).not.toBeNull();
    for (const init of [{ key: "Delete" }, { key: "Backspace" }, { key: "z", ctrlKey: true }, { key: "z", metaKey: true }]) {
      await act(async () => { rich.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })); });
    }
    await flush();
    expect(pq(`flow-note-${id}`)).not.toBeNull();
    expect(pq(`flow-note-text-${id}`)).not.toBeNull();
    expect(byTestId(`flow-note-${id}`).textContent).toContain("메모");
  });

  it("캔버스 메모 편집 중 도구 막대 단추에 초점이 있어도 Delete·Backspace·Ctrl+Z 가 메모를 지우거나 흐름을 되돌리지 않는다", async () => {
    const { flow, id } = withNote("메모");
    await openSet("NA_4", viewOf("NA_4", flow));
    await clickId("flow-mode-edit");
    await clickId(`flow-note-${id}`);
    await clickId(`flow-note-${id}`);
    await flush();
    const btn = byTestId(`flow-note-text-${id}`).querySelector<HTMLElement>('[data-testid="md-tb-bold"]')!;
    expect(btn).not.toBeNull();
    btn.focus();
    for (const init of [{ key: "Delete" }, { key: "Backspace" }, { key: "z", ctrlKey: true }, { key: "z", metaKey: true }]) {
      await act(async () => { btn.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })); });
    }
    await flush();
    expect(pq(`flow-note-${id}`)).not.toBeNull();
    expect(byTestId(`flow-note-${id}`).textContent).toContain("메모");
  });

  it("편집 모드 — 빈 메모도 바로 빈 편집 칸과 도구 막대를 보인다(안내 글 없이), 보기 모드의 빈 메모는 「메모 없음」", async () => {
    const { flow, id } = withNote("");
    await openSet("NA_3", viewOf("NA_3", flow));
    await clickId(`flow-note-${id}`);
    expect(byTestId("flow-prop-note-view").textContent).toContain("메모 없음");
    await clickId("flow-mode-edit");
    await flush();
    const ed = byTestId("flow-prop-note-text");
    expect(ed.querySelector('[data-testid="md-toolbar"]')).not.toBeNull();
    expect(ed.querySelector('[data-testid="md-editor-rich"]')!.textContent).toBe("");
  });

  it("메모 패널은 남은 높이를 채운다 — 메모 패널·칸에 fill 클래스, 「지우기」는 구역 맨 아래. 다른 종류 패널에는 fill 이 없다", async () => {
    const { flow, id } = withNote("메모");
    await openSet("NA_6", viewOf("NA_6", flow));
    await clickId("flow-mode-edit");
    await clickId(`flow-note-${id}`);
    await flush();
    const panel = byTestId("flow-prop-note");
    expect(panel.classList.contains("rsf-panel-fill")).toBe(true);
    const field = panel.querySelector(".cm-md-field")!;
    expect(field.classList.contains("cm-md-fill")).toBe(true);
    expect(byTestId("flow-prop-note-text").classList.contains("cm-md-fill")).toBe(true);
    const body = panel.querySelector(".rsf-section-body")!;
    expect(body.lastElementChild!.classList.contains("rsf-panel-actions")).toBe(true);
    expect(body.firstElementChild).toBe(field);
    // 보기 모드에서도 읽기 상자가 채운다.
    await clickId("flow-mode-view");
    await flush();
    expect(byTestId("flow-prop-note-view").classList.contains("cm-md-fill")).toBe(true);
    // 룰 노드를 고르면 fill 이 없다(다른 종류 패널 배치는 그대로).
    await clickId("flow-node-r1");
    await flush();
    expect(byTestId("flow-side").getAttribute("data-kind")).toBe("RULE");
    expect(pq("flow-prop-note")).toBeNull();
    expect(pageContainer().querySelector(".rsf-panel-fill")).toBeNull();
  });

  it("사용자가 골라 둔 편집 방식(rsf:noteEditMode = MD)으로 패널 칸과 캔버스 메모가 함께 열리고, 캔버스에서 바꾸면 패널도 바뀌고 키에 남는다", async () => {
    setNoteEditMode("markdown");
    const { flow, id } = withNote("메모");
    await openSet("NA_5", viewOf("NA_5", flow));
    await clickId("flow-mode-edit");
    await clickId(`flow-note-${id}`);
    await flush();
    const panelEd = () => byTestId("flow-prop-note-text");
    expect(panelEd().querySelector('[data-testid="md-editor-source"]')).not.toBeNull();
    // 이미 고른 메모를 다시 누르면 캔버스 편집기가 열린다.
    await clickId(`flow-note-${id}`);
    await flush();
    const canvasEd = byTestId(`flow-note-text-${id}`);
    expect(canvasEd.querySelector('[data-testid="md-editor-source"]')).not.toBeNull();
    await act(async () => {
      const b = canvasEd.querySelector<HTMLElement>('[data-testid="md-mode-wysiwyg"]')!;
      b.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      b.click();
    });
    await flush();
    expect(panelEd().querySelector('[data-testid="md-editor-rich"]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(NOTE_MODE_KEY)!)).toBe("wysiwyg");
    expect(localStorage.getItem("cm-md:editMode")).toBeNull();
  });

  it("편집 모드에서 메모를 고르기만 하면(패널 편집기가 바로 열려도) 흐름이 바뀌지 않는다 — 예전 일반 글·빈 줄·빈 메모, 메모 사이 전환에도 되돌리기가 생기지 않는다", async () => {
    const texts = ["a\n\n\nb", "줄1\n줄2 <b>x</b>", "[TODO]: 내일", "    들여쓴 글", "- [ ] 할 일", "끝 빈 줄\n\n", ""];
    let flow = base();
    const ids: string[] = [];
    texts.forEach((text, i) => {
      const r = addNote(flow, P(300, 100 + i * 120), null);
      flow = updateNote(r.flow, r.id, { text });
      ids.push(r.id);
    });
    await openSet("NA_7", viewOf("NA_7", flow));
    await clickId("flow-mode-edit");
    const undoDisabled = () => (byTestId("flow-undo") as HTMLButtonElement).disabled;
    expect(undoDisabled()).toBe(true);
    for (const id of [...ids, ids[0]]) {
      await clickId(`flow-note-${id}`);
      await flush();
      expect(pq("flow-prop-note-text"), id).not.toBeNull();
      expect(undoDisabled(), id).toBe(true);
    }
    // 시험이 헛돌지 않는지 — 실제로 고치면 되돌리기가 켜진다(모드 전환 자체는 고침이 아니다).
    await act(async () => {
      const b = byTestId("flow-prop-note-text").querySelector<HTMLElement>('[data-testid="md-mode-md"]')!;
      b.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      b.click();
    });
    await flush();
    expect(undoDisabled()).toBe(true);
    await typeInto(byTestId("flow-prop-note-text").querySelector<HTMLTextAreaElement>("textarea")!, "고친 글");
    await flush();
    expect(undoDisabled()).toBe(false);
  });
});
