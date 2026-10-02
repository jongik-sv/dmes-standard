/** @vitest-environment happy-dom */

// 대시보드 부품(shared dashboard) — 12열 격자 칸 너비, 카드 머리·고정 높이·본문 배치, KPI 타일, 추이 선.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DashboardCard,
  DashboardCell,
  DashboardGrid,
  KpiTile,
  Sparkline,
} from "../../src/components/dashboard";
import { spanDefaults } from "../../src/components/dashboard/DashboardGrid";
import { sparklinePoints } from "../../src/components/dashboard/Sparkline";
import { clampPercent } from "../../src/components/dashboard/KpiTile";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(el: ReturnType<typeof createElement>) {
  act(() => root.render(el));
  return host;
}

const byTestId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

describe("spanDefaults", () => {
  it("작은 타일은 좁은 화면에서 넓히고, 카드는 한 줄을 다 쓴다", () => {
    expect(spanDefaults({ span: 2 })).toEqual({ span: 2, spanMd: 4, spanSm: 6 });
    expect(spanDefaults({ span: 3 })).toEqual({ span: 3, spanMd: 6, spanSm: 12 });
    expect(spanDefaults({ span: 8 })).toEqual({ span: 8, spanMd: 12, spanSm: 12 });
    expect(spanDefaults({})).toEqual({ span: 12, spanMd: 12, spanSm: 12 });
    expect(spanDefaults({ span: 4, spanMd: 6, spanSm: 6 })).toEqual({
      span: 4,
      spanMd: 6,
      spanSm: 6,
    });
  });
});

describe("DashboardGrid · DashboardCell", () => {
  it("격자에 칸 너비 속성을 붙이고 fill 이면 스크롤 클래스를 단다", () => {
    render(
      createElement(
        DashboardGrid,
        { fill: true, testId: "grid", ariaLabel: "홈" },
        createElement(DashboardCell, { span: 2, testId: "cell" }, "타일")
      )
    );
    const grid = byTestId("grid");
    // fill 은 바깥 감싸개가 스크롤하고 격자 자체는 높이를 정하지 않는다(격자가 고정 높이면 카드가 눌린다).
    expect(grid.className).toBe("cm-dash-grid");
    expect(grid.parentElement?.className).toBe("cm-dash-scroll");
    expect(grid.getAttribute("aria-label")).toBe("홈");
    const cell = byTestId("cell");
    expect(cell.dataset.span).toBe("2");
    expect(cell.dataset.spanMd).toBe("4");
    expect(cell.dataset.spanSm).toBe("6");
  });

  it("fill 이 아니면 감싸개 없이 격자만 그린다", () => {
    render(createElement(DashboardGrid, { testId: "grid", className: "x" }, "칸"));
    const grid = byTestId("grid");
    expect(grid.className).toBe("cm-dash-grid x");
    expect(grid.parentElement).toBe(host);
  });

  it("스타일은 문서에 한 번만 들어간다", () => {
    render(
      createElement(
        DashboardGrid,
        null,
        createElement(DashboardCard, { title: "가" }, "본문"),
        createElement(DashboardCard, { title: "나" }, "본문")
      )
    );
    const styles = document.querySelectorAll(
      'style[data-href="cm-dashboard"], style[href="cm-dashboard"]'
    );
    expect(styles.length).toBeLessThanOrEqual(1);
    expect(document.head.innerHTML + host.innerHTML).toContain(".cm-dash-card__head");
  });
});

describe("DashboardCard", () => {
  it("머리에 제목·부제·표지·동작을, 그 아래 도구 줄과 본문을 그린다", () => {
    render(
      createElement(
        DashboardCard,
        {
          title: "내 알림",
          subtitle: "안읽음 4건",
          titleExtra: createElement("i", { "data-testid": "extra" }, "구현 예정"),
          actions: createElement("button", { "data-testid": "act" }, "모두 읽음"),
          toolbar: createElement("div", { "data-testid": "tb" }, "필터"),
          span: 4,
          testId: "card",
        },
        createElement("p", { "data-testid": "body" }, "목록")
      )
    );
    const card = byTestId("card");
    expect(card.tagName).toBe("SECTION");
    expect(card.getAttribute("aria-label")).toBe("내 알림");
    expect(card.dataset.span).toBe("4");
    expect(card.dataset.spanMd).toBe("12");
    expect(card.querySelector(".cm-dash-card__title")?.textContent).toBe("내 알림");
    expect(card.querySelector(".cm-dash-card__sub")?.textContent).toBe("안읽음 4건");
    expect(card.querySelector(".cm-dash-card__extra [data-testid=extra]")).not.toBeNull();
    expect(card.querySelector(".cm-dash-card__actions [data-testid=act]")).not.toBeNull();
    expect(card.querySelector(".cm-dash-card__toolbar [data-testid=tb]")).not.toBeNull();
    const body = card.querySelector(".cm-dash-card__body")!;
    expect(body.className).toBe("cm-dash-card__body cm-dash-card__body--padded");
    expect(body.querySelector("[data-testid=body]")).not.toBeNull();
  });

  it("height 를 주면 높이를 고정하고 본문 스크롤 클래스를 단다", () => {
    render(
      createElement(DashboardCard, { title: "공지사항", height: 400, testId: "card" }, "본문")
    );
    const card = byTestId("card");
    expect(card.style.height).toBe("400px");
    expect(card.classList.contains("cm-dash-card--fixed")).toBe(true);
  });

  it("bodyLayout=fill 은 여백 없이 세로 flex 본문을 쓰고, bodyPadding 이면 위 여백만 준다", () => {
    render(createElement(DashboardCard, { title: "가", bodyLayout: "fill", testId: "a" }, "본문"));
    expect(byTestId("a").querySelector(".cm-dash-card__body")?.className).toBe(
      "cm-dash-card__body cm-dash-card__body--fill"
    );
    render(
      createElement(
        DashboardCard,
        { title: "가", bodyLayout: "fill", bodyPadding: true, testId: "a" },
        "본문"
      )
    );
    expect(byTestId("a").querySelector(".cm-dash-card__body")?.className).toBe(
      "cm-dash-card__body cm-dash-card__body--fill cm-dash-card__body--padded"
    );
  });

  it("높이를 주지 않으면 고정 클래스·인라인 높이가 없다", () => {
    render(createElement(DashboardCard, { title: "가", testId: "card" }, "본문"));
    const card = byTestId("card");
    expect(card.style.height).toBe("");
    expect(card.classList.contains("cm-dash-card--fixed")).toBe(false);
  });
});

describe("KpiTile", () => {
  it("값·단위·기준·증감·막대를 그린다", () => {
    render(
      createElement(KpiTile, {
        label: "냉연 생산 (PLTCM)",
        value: "5,860",
        unit: "t",
        trend: [5.62, 5.71, 5.8],
        target: "계획 6,000t",
        delta: "전일 +1.4%",
        deltaTone: "good",
        progress: 97.66,
        testId: "kpi",
      })
    );
    const kpi = byTestId("kpi");
    expect(kpi.querySelector(".cm-kpi__value")?.textContent).toBe("5,860t");
    expect(kpi.querySelector(".cm-kpi__unit")?.textContent).toBe("t");
    expect(kpi.querySelector(".cm-kpi__foot")?.textContent).toContain("계획 6,000t");
    const delta = kpi.querySelector<HTMLElement>(".cm-kpi__delta")!;
    expect(delta.className).toBe("cm-kpi__delta cm-kpi__delta--good");
    expect(delta.textContent).toBe("전일 +1.4%");
    const bar = kpi.querySelector<HTMLElement>("[role=progressbar]")!;
    expect(bar.getAttribute("aria-valuenow")).toBe("98");
    expect(bar.querySelector("i")!.style.width).toBe("97.7%");
    expect(kpi.querySelector("svg.cm-sparkline")).not.toBeNull();
    expect(kpi.querySelector(".cm-badge")).toBeNull();
  });

  it("주의면 경고 배지와 경고색 추이 선을 쓰고, 막대는 100% 에서 자른다", () => {
    render(
      createElement(KpiTile, {
        label: "제품 출하",
        value: "9,240",
        trend: [1, 2, 3],
        delta: "전일 -2.3%",
        deltaTone: "bad",
        progress: 140,
        warn: true,
        testId: "kpi",
      })
    );
    const kpi = byTestId("kpi");
    expect(kpi.classList.contains("cm-kpi--warn")).toBe(true);
    expect(kpi.querySelector(".cm-badge")?.textContent).toBe("주의");
    expect(kpi.querySelector(".cm-kpi__delta")?.className).toBe("cm-kpi__delta cm-kpi__delta--bad");
    expect(kpi.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow")).toBe("100");
    expect(kpi.querySelector("svg.cm-sparkline path:last-of-type")?.getAttribute("stroke")).toBe(
      "var(--color-warning)"
    );
  });

  it("progress·trend·기준이 없으면 막대·추이 선·아래 줄을 그리지 않는다", () => {
    render(createElement(KpiTile, { label: "가", value: 1, testId: "kpi" }));
    const kpi = byTestId("kpi");
    expect(kpi.querySelector("[role=progressbar]")).toBeNull();
    expect(kpi.querySelector("svg")).toBeNull();
    expect(kpi.querySelector(".cm-kpi__foot")).toBeNull();
  });

  it("clampPercent 는 0~100 밖과 NaN 을 자른다", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(250)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(42.5)).toBe(42.5);
  });
});

describe("Sparkline", () => {
  it("최솟값은 아래, 최댓값은 위 여백에 놓는다", () => {
    const pts = sparklinePoints([0, 10, 5], 84, 26);
    expect(pts).toEqual([
      [2, 23],
      [42, 3],
      [82, 13],
    ]);
  });

  it("값이 모두 같으면 가운데 수평선, 2개 미만이면 그리지 않는다", () => {
    expect(sparklinePoints([3, 3, 3], 84, 26).map((p) => p[1])).toEqual([13, 13, 13]);
    expect(sparklinePoints([1], 84, 26)).toEqual([]);
    render(createElement(Sparkline, { values: [1], testId: "sp" }));
    expect(host.querySelector("svg")).toBeNull();
  });

  it("ariaLabel 이 있으면 img 로, 없으면 장식으로 숨긴다", () => {
    render(createElement(Sparkline, { values: [1, 2], testId: "sp" }));
    expect(byTestId("sp").getAttribute("aria-hidden")).toBe("true");
    render(
      createElement(Sparkline, { values: [1, 2], ariaLabel: "7일 추이", area: false, testId: "sp" })
    );
    const svg = byTestId("sp");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("7일 추이");
    expect(svg.querySelectorAll("path").length).toBe(1);
  });
});
