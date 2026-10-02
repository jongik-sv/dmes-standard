/** @vitest-environment happy-dom */

// 대시보드 카드 배치(shared dashboard) — 접기, 폭(칸 수)·높이 조절, 사용자별 저장·초기화, 본문 크기 전달.
// 포인터 끌기는 happy-dom 에 배치 계산이 없어 시험하지 않고, 같은 계산 함수(widthToSpan·clampHeight)와 방향키 조절로 대신한다.
import { act, createElement as h, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/portal-shell/use-user-button-rbac", () => ({
  useUserButtonRbac: () => ({ userId: "u1" }),
  peekLastUserId: () => "u1",
}));

import {
  DashboardCard,
  DashboardGrid,
  DashboardRow,
  useDashboardLayout,
  type DashboardBodySize,
} from "../../src/components/dashboard";
import {
  clampHeight,
  clampSpan,
  loadDashboardLayout,
  sanitizeLayout,
  saveDashboardLayout,
  widthToSpan,
} from "../../src/components/dashboard/layout";

// happy-dom 에서 localStorage 가 노출되지 않을 수 있어 Map 기반 스텁을 둔다(content-body 테스트와 같은 방식).
const mem = new Map<string, string>();
const ls = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
Object.defineProperty(window, "localStorage", { value: ls, configurable: true });

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mem.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function render(el: ReactNode) {
  act(() => root.render(el));
}

const byTestId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

function key(el: Element, k: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
}

function dblclick(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
}

function click(el: Element) {
  act(() => {
    (el as HTMLElement).click();
  });
}

describe("배치 계산 함수", () => {
  it("clampSpan 은 1~12 정수, 최소 칸 수 이상으로 자른다", () => {
    expect(clampSpan(7.4)).toBe(7);
    expect(clampSpan(20)).toBe(12);
    expect(clampSpan(1, 3)).toBe(3);
    expect(clampSpan(Number.NaN, 3)).toBe(3);
  });

  it("clampHeight 는 최소 높이 이상 정수로 자른다", () => {
    expect(clampHeight(50, 120)).toBe(120);
    expect(clampHeight(333.6, 120)).toBe(334);
  });

  it("widthToSpan 은 끈 폭을 가장 가까운 칸 수로 맞춘다", () => {
    // 격자 1188px, 간격 8 → 칸 폭 (1188 − 88) / 12 ≈ 91.67. 8칸 폭 = 8 × 91.67 + 7 × 8 ≈ 789.3
    expect(widthToSpan(789, 1188, 8)).toBe(8);
    expect(widthToSpan(789 + 60, 1188, 8)).toBe(9);
    expect(widthToSpan(30, 1188, 8, 3)).toBe(3);
    expect(widthToSpan(5000, 1188, 8)).toBe(12);
  });

  it("저장값은 검증해 올바른 항목만 남기고(카드 접힘은 버림), 사용자·화면별로 나눈다", () => {
    expect(
      sanitizeLayout({
        a: { collapsed: true, span: 6, height: 300.4 },
        b: { span: 13, height: -1, collapsed: "y" },
        c: "x",
        d: { collapsed: true },
        "row:top": { collapsed: true, span: 4 },
        "row:x": { collapsed: false },
      })
    ).toEqual({ a: { span: 6, height: 300 }, "row:top": { collapsed: true } });
    saveDashboardLayout("u1", "home", { a: { span: 4 } });
    expect(loadDashboardLayout("u1", "home")).toEqual({ a: { span: 4 } });
    expect(loadDashboardLayout("u2", "home")).toEqual({});
    saveDashboardLayout("u1", "home", {});
    expect(mem.has("dmes:dash:v2:u1:home")).toBe(false);
  });
});

function card(props: Record<string, unknown>, body: ReactNode = "본문") {
  return h(DashboardCard, { title: "월별 생산 실적", testId: "card", ...props }, body);
}

/** 행 하나에 카드를 나란히 둔 격자(시안처럼 8 + 4). */
function rowGrid(
  cards: ReactNode[],
  gridProps: Record<string, unknown> | null = null,
  rowProps = {}
) {
  return h(
    DashboardGrid,
    gridProps,
    h(DashboardRow, { rowId: "top", testId: "row", ...rowProps }, ...cards)
  );
}

describe("행 단위 접기(DashboardRow) — 카드 단위 접기는 없다", () => {
  it("한 행에 카드가 나란히 놓이고, 어느 카드의 버튼이든 행 전체를 접고 펼친다", () => {
    render(
      rowGrid([
        h(
          DashboardCard,
          {
            title: "공지",
            cardId: "n",
            span: 8,
            collapsible: true,
            height: 400,
            toolbar: h("div", null, "필터"),
            actions: h("button", { "data-testid": "act" }, "공지 관리"),
            testId: "c1",
          },
          "공지 본문"
        ),
        h(
          DashboardCard,
          { title: "알림", cardId: "m", span: 4, collapsible: true, height: 400, testId: "c2" },
          "알림 본문"
        ),
      ])
    );
    const row = byTestId("row");
    expect(row.className).toBe("cm-dash-row");
    expect(row.getAttribute("role")).toBe("group");
    // 한 행에 8칸 + 4칸으로 나란히(카드마다 한 줄이 아니다).
    expect(byTestId("c1").parentElement).toBe(row);
    expect(byTestId("c2").parentElement).toBe(row);
    expect(byTestId("c1").dataset.span).toBe("8");
    expect(byTestId("c2").dataset.span).toBe("4");

    const t1 = byTestId("c1").querySelector<HTMLButtonElement>(".cm-dash-card__toggle")!;
    const t2 = byTestId("c2").querySelector<HTMLButtonElement>(".cm-dash-card__toggle")!;
    expect(t1.type).toBe("button");
    expect(t1.getAttribute("aria-label")).toBe("이 줄 접기");
    expect(t1.getAttribute("aria-expanded")).toBe("true");
    const body1 = byTestId("c1").querySelector<HTMLElement>(".cm-dash-card__body")!;
    expect(t1.getAttribute("aria-controls")).toBe(body1.id);

    // 오른쪽 카드 버튼으로 접어도 행 전체가 접힌다.
    click(t2);
    expect(row.dataset.collapsed).toBe("true");
    for (const id of ["c1", "c2"]) {
      const el = byTestId(id);
      expect(el.dataset.collapsed).toBe("true");
      expect(el.classList.contains("cm-dash-card--collapsed")).toBe(true);
      expect(el.querySelector<HTMLElement>(".cm-dash-card__body")!.hidden).toBe(true);
      expect(el.style.height).toBe("");
    }
    expect(byTestId("c1").querySelector<HTMLElement>(".cm-dash-card__toolbar")!.hidden).toBe(true);
    expect(byTestId("c1").querySelector("[data-testid=act]")).not.toBeNull();
    expect(body1.textContent).toBe("공지 본문"); // 언마운트하지 않고 숨긴다
    expect(t1.getAttribute("aria-label")).toBe("이 줄 펼치기");
    expect(t1.getAttribute("aria-expanded")).toBe("false");

    // 왼쪽 카드 버튼으로 펼쳐도 행 전체가 펼쳐진다.
    click(t1);
    expect(row.dataset.collapsed).toBeUndefined();
    expect(byTestId("c2").dataset.collapsed).toBeUndefined();
    expect(byTestId("c2").style.height).toBe("400px");
  });

  it("접기 버튼이 없는 카드도 행이 접히면 함께 접힌다", () => {
    render(
      rowGrid([
        h(
          DashboardCard,
          { title: "가", cardId: "a", span: 6, collapsible: true, testId: "c1" },
          "가"
        ),
        h(DashboardCard, { title: "나", cardId: "b", span: 6, testId: "c2" }, "나"),
      ])
    );
    expect(byTestId("c2").querySelector(".cm-dash-card__toggle")).toBeNull();
    click(byTestId("c1").querySelector(".cm-dash-card__toggle")!);
    expect(byTestId("c2").dataset.collapsed).toBe("true");
  });

  it("행 밖 카드·collapsible=false 행의 카드에는 접기 버튼이 없다", () => {
    render(h(DashboardGrid, null, card({ cardId: "a", collapsible: true })));
    expect(byTestId("card").querySelector(".cm-dash-card__toggle")).toBeNull();
    render(
      rowGrid(
        [h(DashboardCard, { title: "가", cardId: "a", collapsible: true, testId: "c1" }, "가")],
        null,
        { collapsible: false }
      )
    );
    expect(byTestId("c1").querySelector(".cm-dash-card__toggle")).toBeNull();
    expect(byTestId("row").dataset.collapsed).toBeUndefined();
  });

  it("그리드 밖 단독 행도 행 안 상태로 함께 접힌다", () => {
    render(
      h(
        DashboardRow,
        { rowId: "solo", testId: "row" },
        h(DashboardCard, { title: "가", collapsible: true, testId: "c1" }, "가"),
        h(DashboardCard, { title: "나", testId: "c2" }, "나")
      )
    );
    click(byTestId("c1").querySelector(".cm-dash-card__toggle")!);
    expect(byTestId("c2").dataset.collapsed).toBe("true");
  });
});

describe("DashboardCard 크기 조절", () => {
  it("resizable 이면 폭·높이 손잡이(separator, Tab 포커스)를 두고, 행이 접히면 숨긴다", () => {
    render(rowGrid([card({ cardId: "a", resizable: true, collapsible: true, span: 8 })]));
    const el = byTestId("card");
    const x = el.querySelector<HTMLElement>(".cm-dash-card__resize--x")!;
    const y = el.querySelector<HTMLElement>(".cm-dash-card__resize--y")!;
    expect(x.getAttribute("role")).toBe("separator");
    expect(x.getAttribute("aria-orientation")).toBe("vertical");
    expect(x.tabIndex).toBe(0);
    expect(y.getAttribute("aria-orientation")).toBe("horizontal");
    click(el.querySelector(".cm-dash-card__toggle")!);
    expect(el.querySelector(".cm-dash-card__resize")).toBeNull();
  });

  it('resizable="height" 이면 높이 손잡이만, false 면 손잡이가 없다', () => {
    render(h(DashboardGrid, null, card({ cardId: "a", resizable: "height" })));
    expect(byTestId("card").querySelector(".cm-dash-card__resize--x")).toBeNull();
    expect(byTestId("card").querySelector(".cm-dash-card__resize--y")).not.toBeNull();
    render(h(DashboardGrid, null, card({ cardId: "a" })));
    expect(byTestId("card").querySelector(".cm-dash-card__resize")).toBeNull();
  });

  it("폭은 방향키로 1칸씩 바꾸고 최소 칸 수에서 멈추며, 좁은 화면 칸 수는 선언한 span 을 따른다", () => {
    render(rowGrid([card({ cardId: "a", resizable: true, span: 4, minSpan: 3 })]));
    const el = byTestId("card");
    const x = el.querySelector<HTMLElement>(".cm-dash-card__resize--x")!;
    key(x, "ArrowRight");
    expect(el.dataset.span).toBe("5");
    expect(x.getAttribute("aria-valuenow")).toBe("5");
    expect(el.dataset.spanMd).toBe("12");
    key(x, "ArrowLeft");
    key(x, "ArrowLeft");
    key(x, "ArrowLeft");
    expect(el.dataset.span).toBe("3");
    dblclick(x);
    expect(el.dataset.span).toBe("4");
  });

  it("높이는 방향키로 20px 씩 바꾸고 최소 높이에서 멈추며, 두 번 누르면 기본 높이로 돌아간다", () => {
    render(rowGrid([card({ cardId: "a", resizable: true, height: 400, minHeight: 380 })]));
    const el = byTestId("card");
    const y = el.querySelector<HTMLElement>(".cm-dash-card__resize--y")!;
    key(y, "ArrowDown");
    expect(el.style.height).toBe("420px");
    key(y, "ArrowUp");
    key(y, "ArrowUp");
    key(y, "ArrowUp");
    expect(el.style.height).toBe("380px");
    dblclick(y);
    expect(el.style.height).toBe("400px");
  });
});

function ResetButton() {
  const layout = useDashboardLayout();
  return h(
    "button",
    { "data-testid": "reset", disabled: !layout?.customized, onClick: () => layout?.reset() },
    "배치 초기화"
  );
}

describe("배치 저장·초기화", () => {
  const tree = () =>
    h(
      DashboardGrid,
      { layoutKey: "t.layout" },
      h(ResetButton),
      h(
        DashboardRow,
        { rowId: "top", testId: "row" },
        card({ cardId: "a", collapsible: true, resizable: true, span: 6 }),
        h(DashboardCard, { title: "옆", cardId: "b", span: 6, testId: "c2" }, "옆")
      )
    );

  it("layoutKey 가 있으면 행 접힘·카드 칸 수를 사용자별로 저장하고 다시 열 때 되살린다", () => {
    render(tree());
    expect(byTestId("reset").hasAttribute("disabled")).toBe(true);
    click(byTestId("card").querySelector(".cm-dash-card__toggle")!);
    expect(JSON.parse(mem.get("dmes:dash:v2:u1:t.layout")!)).toEqual({
      "row:top": { collapsed: true },
    });
    click(byTestId("card").querySelector(".cm-dash-card__toggle")!);
    key(byTestId("card").querySelector(".cm-dash-card__resize--x")!, "ArrowRight");
    expect(JSON.parse(mem.get("dmes:dash:v2:u1:t.layout")!)).toEqual({ a: { span: 7 } });

    mem.set(
      "dmes:dash:v2:u1:t.layout",
      JSON.stringify({ a: { span: 7 }, "row:top": { collapsed: true } })
    );
    act(() => root.unmount());
    root = createRoot(host);
    render(tree());
    expect(byTestId("card").dataset.span).toBe("7");
    expect(byTestId("c2").dataset.collapsed).toBe("true");
    expect(byTestId("reset").hasAttribute("disabled")).toBe(false);
  });

  it("이전 형식(v1) 저장값과 카드 단위 접힘 값은 읽지 않는다", () => {
    mem.set("dmes:dash:v1:u1:t.layout", JSON.stringify({ "row:top": { collapsed: true } }));
    mem.set("dmes:dash:v2:u1:t.layout", JSON.stringify({ a: { collapsed: true } }));
    render(tree());
    expect(byTestId("card").dataset.collapsed).toBeUndefined();
    expect(byTestId("row").dataset.collapsed).toBeUndefined();
  });

  it("배치 초기화는 행 접힘·카드 크기를 기본값으로 되돌리고 저장값을 지운다", () => {
    mem.set(
      "dmes:dash:v2:u1:t.layout",
      JSON.stringify({ a: { span: 9 }, "row:top": { collapsed: true } })
    );
    render(tree());
    expect(byTestId("card").dataset.collapsed).toBe("true");
    click(byTestId("reset"));
    expect(byTestId("card").dataset.collapsed).toBeUndefined();
    expect(byTestId("card").dataset.span).toBe("6");
    expect(mem.has("dmes:dash:v2:u1:t.layout")).toBe(false);
  });

  it("layoutKey 가 없으면 저장하지 않는다", () => {
    render(rowGrid([card({ cardId: "a", collapsible: true })]));
    click(byTestId("card").querySelector(".cm-dash-card__toggle")!);
    expect(byTestId("card").dataset.collapsed).toBe("true");
    expect(mem.size).toBe(0);
  });
});

describe("본문 크기 전달(함수 children)", () => {
  function stubSize(w: number, hgt: number) {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(w);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(hgt);
  }

  it("카드 높이가 정해지지 않으면 height 는 null, 정해지면 본문 높이(여백 제외)를 넘긴다", () => {
    stubSize(500, 300);
    const seen: DashboardBodySize[] = [];
    const fn = (s: DashboardBodySize) => {
      seen.push(s);
      return "차트";
    };
    render(
      h(DashboardGrid, null, h(DashboardCard, { title: "가", bodyPadding: false, children: fn }))
    );
    expect(seen.at(-1)).toEqual({ width: 500, height: null });

    render(
      h(
        DashboardGrid,
        null,
        h(DashboardCard, { title: "가", height: 360, bodyPadding: false, children: fn })
      )
    );
    expect(seen.at(-1)).toEqual({ width: 500, height: 300 });
  });
});
