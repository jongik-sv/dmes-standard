/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WidgetFrame, defWidgetMeta } from "../../src/widget";
import type { WidgetHelp, WidgetItem, WidgetRegistryEntry, WidgetTypeRegistryEntry, WidgetDefRow } from "../../src/widget";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let rendered: Rendered | null = null;
afterEach(() => {
  rendered?.unmount();
  rendered = null;
  document.body.innerHTML = "";
});

const item: WidgetItem = { instId: "i1", widgetId: "t.a", x: 0, y: 0, w: 6, h: 6, locked: false, config: null };
const Body = () => h("p", null, "본문");
const entry = (extra: Partial<WidgetRegistryEntry["meta"]> = {}): WidgetRegistryEntry => ({
  meta: { id: "t.a", title: "샘플 위젯", defaultSize: { w: 6, h: 6 }, ...extra },
  load: async () => ({ default: Body }),
});
const noop = () => {};

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
  });
}

/** 조건이 참이 될 때까지(최대 5초) 기다린다 — 모달은 처음 누를 때 지연 로딩하므로 그 시간이 걸린다. */
async function until(cond: () => boolean) {
  for (let i = 0; i < 250 && !cond(); i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

const render = (e: WidgetRegistryEntry, editing = false, hideTitle = false) => {
  rendered = renderWithMantine(h(WidgetFrame, { item, entry: e, editing, onToggleLock: noop, onRemove: noop, hideTitle }));
};

const helpOf = (loadMarkdown: () => Promise<string>): WidgetHelp => ({ title: "샘플 도움말", loadMarkdown });
const helpBtn = () => document.querySelector<HTMLButtonElement>('[data-action="help"]');

describe("위젯 틀 「?」 도움말 단추", () => {
  it("meta.help 가 없으면 단추가 없다(기존 모양 그대로)", async () => {
    render(entry());
    await flush();
    expect(helpBtn()).toBeNull();
    expect(document.querySelector('[data-action="refresh"]')).not.toBeNull();
  });

  it("meta.help 가 있으면 단추가 보이고 누르기 전에는 문서를 불러오지 않는다", async () => {
    const load = vi.fn(async () => "# 제목\n\n## 1. 첫 절\n\n본문");
    render(entry({ help: helpOf(load) }));
    await flush();
    const btn = helpBtn();
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute("aria-label")).toBe("도움말");
    expect(load).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("제목을 숨기는 도구 창 틀(hideTitle)에도 단추가 있다", async () => {
    render(entry({ help: helpOf(async () => "# 제목") }), false, true);
    await flush();
    expect(helpBtn()).not.toBeNull();
  });

  it("배치 편집 중에는 단추를 보이지 않는다", async () => {
    render(entry({ help: helpOf(async () => "# 제목") }), true);
    await flush();
    expect(helpBtn()).toBeNull();
  });

  it("누르면 모달이 열려 문서를 보이고 닫으면 사라진다", async () => {
    const load = vi.fn(async () => "# 제목\n\n## 1. 첫 절\n\n첫 절 본문\n\n## 2. 둘째 절\n\n둘째 절 본문");
    render(entry({ help: helpOf(load) }));
    await flush();
    act(() => helpBtn()!.click());
    await until(() => document.querySelector('[data-testid="widget-help-doc"]') !== null);
    expect(load).toHaveBeenCalledTimes(1);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain("샘플 도움말");
    expect(document.querySelector('[data-testid="widget-help-doc"]')?.textContent).toContain("첫 절 본문");
    expect(document.querySelector('[data-testid="widget-help-doc"]')?.textContent).toContain("2. 둘째 절");
    const close = document.querySelector<HTMLButtonElement>('[role="dialog"] [aria-label="닫기"], [role="dialog"] button.mantine-Modal-close');
    expect(close).not.toBeNull();
    act(() => close!.click());
    await until(() => document.querySelector('[data-testid="widget-help-doc"]') === null);
    expect(document.querySelector('[data-testid="widget-help-doc"]')).toBeNull();
  });

  it("문서를 불러오지 못하면 모달에 오류 문구를 보인다", async () => {
    render(entry({ help: helpOf(async () => Promise.reject(new Error("x"))) }));
    await flush();
    act(() => helpBtn()!.click());
    await until(() => document.querySelector('[data-testid="widget-help-error"]') !== null);
    expect(document.querySelector('[data-testid="widget-help-error"]')?.textContent).toBe("도움말을 불러오지 못했습니다.");
  });
});

describe("정의 위젯 meta 로의 help 전달", () => {
  const help = helpOf(async () => "# 제목");
  const type = (extra: Partial<WidgetTypeRegistryEntry["meta"]> = {}): WidgetTypeRegistryEntry => ({
    meta: { id: "rule-calc", title: "룰 계산기", defaultSize: { w: 6, h: 12 }, initialConfig: {}, ...extra },
    loadRenderer: async () => ({ default: Body }),
    loadEditor: async () => ({ default: Body }),
  });
  const row = {
    widgetId: "def.rcalc001", srcTp: "D", typeId: "rule-calc", title: "원판 중량", subtitle: null, description: null,
    defW: null, defH: null, minW: null, minH: null, maxW: null, maxH: null, refreshSec: null, linkPageId: null,
    multipleYn: null, categoryCd: null, privateYn: null, useYn: "Y", dataSrc: null, config: null,
  } as WidgetDefRow;

  it("유형 meta.help 가 정의 위젯 meta.help 가 된다", () => {
    expect(defWidgetMeta(row, type({ help })).help).toBe(help);
  });

  it("유형에 help 가 없으면 정의 위젯 meta 에도 help 키가 없다", () => {
    expect("help" in defWidgetMeta(row, type())).toBe(false);
  });
});
