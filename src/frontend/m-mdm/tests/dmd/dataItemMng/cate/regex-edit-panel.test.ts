/** @vitest-environment happy-dom */

// 특성 시험 — dmd 데이터 항목 카테고리 탭의 RegexEditPanel 이 지금 하는 일을 고정한다. 정규식·대상 칸이 바뀔 때마다
// onPreview, 패널이 사라질 때 onFlushPreview, cate prop 이 바뀌면 입력값 재동기화, 비활성 조건(!canEdit || !cate.open),
// [저장] 인자 순서(이름, 정규식, 대상 칸, 설명), 머리글 "{cateId} — REGEX 정의"(e2e 가 단언), 대상 칸 후보.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { RegexEditPanel, type RegexEditPanelProps } from "../../../../pages/dmd/dataItemMng/cate/components/RegexEditPanel";
import type { CateRow } from "../../../../pages/dmd/dataItemMng/cate/types";

let container: HTMLDivElement;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
});

const wrap = (props: RegexEditPanelProps) => createElement(DmesUiProvider, null, createElement(RegexEditPanel, props));

async function render(props: RegexEditPanelProps) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(wrap(props));
  });
}

async function rerender(props: RegexEditPanelProps) {
  await act(async () => {
    root!.render(wrap(props));
  });
}

const testId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const input = (id: string) => testId(id) as HTMLInputElement;
const select = () => testId("regex-target") as HTMLSelectElement;

async function typeInto(id: string, value: string) {
  const el = input(id);
  expect(el, id).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function chooseTarget(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select(), value);
    select().dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const CATE: CateRow = {
  cateId: "KRONLY", cateName: "한국만", defKind: "REGEX", defExpr: "^KR", defTarget: null, description: "설명",
  open: true, matchCount: 3,
};

function props(over: Partial<RegexEditPanelProps> = {}): RegexEditPanelProps {
  return {
    cate: CATE, lvlCnt: 1, attrLabels: [null, "항구", "  "], canEdit: true,
    onSave: vi.fn(), onPreview: vi.fn(), onFlushPreview: vi.fn(), ...over,
  };
}

describe("dmd RegexEditPanel", () => {
  it("머리글·testid·초기값을 그리고 대상 칸 기본은 KEY, 후보는 키·n차·라벨 있는 attr 이다", async () => {
    await render(props());
    expect(testId("regex-edit-panel")!.querySelector("p")!.textContent).toBe("KRONLY — REGEX 정의");
    expect(input("regex-name").value).toBe("한국만");
    expect(input("regex-expr").value).toBe("^KR");
    expect(input("regex-expr").placeholder).toBe("예: ^[0-9]+$");
    expect(input("regex-desc").value).toBe("설명");
    expect(select().value).toBe("KEY");
    expect(Array.from(select().options).map((o) => [o.value, o.textContent])).toEqual([
      ["KEY", "키"], ["LVL1", "1차"], ["ATTR02", "항구"],
    ]);
    expect(testId("regex-save")!.textContent).toBe("저장");
  });

  it("정규식·대상 칸을 바꿀 때마다 onPreview(정규식, 대상 칸) 을 부르고 이름·설명은 부르지 않는다", async () => {
    const p = props();
    await render(p);
    await typeInto("regex-expr", "^CN");
    expect(p.onPreview).toHaveBeenLastCalledWith("^CN", "KEY");
    await chooseTarget("LVL1");
    expect(p.onPreview).toHaveBeenLastCalledWith("^CN", "LVL1");
    expect(p.onPreview).toHaveBeenCalledTimes(2);
    await typeInto("regex-name", "중국만");
    await typeInto("regex-desc", "새 설명");
    expect(p.onPreview).toHaveBeenCalledTimes(2);
  });

  it("[저장] 은 (이름, 정규식, 대상 칸, 설명) 순서로 onSave 를 부른다", async () => {
    const p = props();
    await render(p);
    await typeInto("regex-name", "중국만");
    await typeInto("regex-expr", "^CN");
    await chooseTarget("ATTR02");
    await typeInto("regex-desc", "새 설명");
    await click(testId("regex-save"));
    expect(p.onSave).toHaveBeenCalledWith("중국만", "^CN", "ATTR02", "새 설명");
  });

  it("cate 가 바뀌면 입력값을 새 cate 로 다시 맞춘다(null 은 빈 글자, 대상 칸은 KEY)", async () => {
    const p = props();
    await render(p);
    await typeInto("regex-expr", "고치는 중");
    await rerender({ ...p, cate: { ...CATE, cateId: "CNONLY", cateName: null, defExpr: "^CN", defTarget: "LVL1", description: null } });
    expect(testId("regex-edit-panel")!.querySelector("p")!.textContent).toBe("CNONLY — REGEX 정의");
    expect(input("regex-name").value).toBe("");
    expect(input("regex-expr").value).toBe("^CN");
    expect(select().value).toBe("LVL1");
    expect(input("regex-desc").value).toBe("");
    await rerender({ ...p, cate: { ...CATE, cateId: "CNONLY", cateName: null, defExpr: "^CN", defTarget: null, description: null } });
    expect(select().value).toBe("KEY");
  });

  it("같은 cate 값으로 다시 그리면 입력 중인 값을 지우지 않는다", async () => {
    const p = props();
    await render(p);
    await typeInto("regex-expr", "고치는 중");
    await rerender({ ...p, cate: { ...CATE } });
    expect(input("regex-expr").value).toBe("고치는 중");
  });

  it.each([
    ["canEdit=false", { canEdit: false }],
    ["닫힌 카테고리", { cate: { ...CATE, open: false } }],
  ] as const)("%s 이면 네 칸과 [저장] 이 모두 꺼진다", async (_label, over) => {
    await render(props(over as Partial<RegexEditPanelProps>));
    for (const id of ["regex-name", "regex-expr", "regex-target", "regex-desc", "regex-save"]) {
      expect((testId(id) as HTMLInputElement).disabled, id).toBe(true);
    }
  });

  it("편집할 수 있으면 네 칸과 [저장] 이 켜져 있다", async () => {
    await render(props());
    for (const id of ["regex-name", "regex-expr", "regex-target", "regex-desc", "regex-save"]) {
      expect((testId(id) as HTMLInputElement).disabled, id).toBe(false);
    }
  });

  it("사라질 때 onFlushPreview 를 한 번 부른다(다시 그릴 때는 부르지 않고, 마지막에 받은 함수를 부른다)", async () => {
    const first = vi.fn();
    const last = vi.fn();
    const p = props({ onFlushPreview: first });
    await render(p);
    await rerender({ ...p, onFlushPreview: last });
    expect(first).not.toHaveBeenCalled();
    expect(last).not.toHaveBeenCalled();
    act(() => root!.unmount());
    root = null;
    expect(first).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledTimes(1);
  });
});
