/** @vitest-environment happy-dom */

// 컬럼 정보 팝오버(@/column-info) — 물리명으로 columnMng.view 를 부르고(열 때 한 번, 같은 물리명은 캐시), 도메인·용어·설명(HTML/일반 글)을
// 보이며, 조회 실패는 "정보 없음" 이고 캐시하지 않는다. 그리드 행·머리 안에 두어도 아이콘 클릭이 조상 click 으로 번지지 않는다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const callOasis = vi.fn();
vi.mock("@/dme/oasis-call", () => ({ callOasis: (...args: unknown[]) => callOasis(...args) }));

import {
  ColumnInfoPopover,
  ColumnPhysName,
  clearColumnInfoCache,
  descriptionFormat,
  domainTypeLabel,
  termsLabel,
} from "@/column-info";

let container: HTMLDivElement;
let root: Root | null = null;

const VIEW = {
  column: {
    columnId: 7,
    columnName: "원재료 코일 두께",
    physName: "RMTL_COIL_THK",
    labelLong: "원재료 코일 두께",
    labelMid: null,
    labelShort: "코일두께",
    description: "<p>코일 <b>두께</b></p><script>alert(1)</script>",
    required: true,
    defaultValue: "0",
    refKind: "MASTER",
    refTarget: "COIL_MASTER",
    refCateId: null,
    usageNote: "첫 줄\n둘째 줄 a < b",
  },
  domain: { domainId: 3, domainName: "코일 두께", stdName: "COIL_THK", dataType: "NUMBER", length: 12, scale: 3, unitCode: "MM" },
  terms: [
    { termId: 1, termName: "원재료", engAbbr: "RMTL", missing: false },
    { termId: 99, termName: null, engAbbr: null, missing: true },
  ],
  systems: [{ systemCode: "ERP", physName: "ZZ_RMTL_COIL_THK", transform: null, note: null }],
};

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function render(el: ReturnType<typeof createElement>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(DmesUiProvider, null, el));
  });
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

const q = <T extends Element = HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${id}"]`);

beforeEach(() => {
  clearColumnInfoCache();
  callOasis.mockReset();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("ColumnInfoPopover", () => {
  it("열 때 물리명으로 view 를 한 번 부르고 컬럼·도메인·용어·설명을 보인다", async () => {
    callOasis.mockResolvedValue(VIEW);
    render(createElement(ColumnInfoPopover, { physName: "RMTL_COIL_THK" }));
    expect(callOasis).not.toHaveBeenCalled();

    click(q("column-info-trigger")!);
    expect(q("column-info-loading")).not.toBeNull();
    await flush();

    expect(callOasis).toHaveBeenCalledWith("columnMng", "view", { physName: "RMTL_COIL_THK", withDomain: true });
    expect(q("column-info-panel")?.textContent).toContain("컬럼 정보 · RMTL_COIL_THK");
    expect(q("column-info-name")?.textContent).toBe("원재료 코일 두께");
    expect(q("column-info-phys")?.textContent).toBe("RMTL_COIL_THK");
    expect(q("column-info-domain")?.textContent).toBe("코일 두께 (COIL_THK) · NUMBER(12,3) · 단위 MM");
    expect(q("column-info-terms")?.textContent).toBe("원재료(RMTL) · (없는 용어 #99)");
    expect(q("column-info-panel")?.textContent).toContain("ERP ZZ_RMTL_COIL_THK");
    expect(q('copy-text-button')).not.toBeNull();

    const desc = q("column-info-description")!;
    expect(desc.getAttribute("data-format")).toBe("HTML");
    expect(desc.querySelector("b")?.textContent).toBe("두께");
    expect(desc.querySelector("script")).toBeNull();

    const note = q("column-info-usage-note")!;
    expect(note.getAttribute("data-format")).toBe("TEXT");
    expect(note.textContent).toBe("첫 줄\n둘째 줄 a < b");
  });

  it("같은 물리명은 다시 열어도, 다른 트리거에서 열어도 다시 조회하지 않는다", async () => {
    callOasis.mockResolvedValue(VIEW);
    render(
      createElement(
        "div",
        null,
        createElement(ColumnInfoPopover, { physName: "RMTL_COIL_THK", testId: "a" }),
        createElement(ColumnInfoPopover, { physName: "rmtl_coil_thk", testId: "b" }),
      ),
    );
    click(q("a-trigger")!);
    await flush();
    click(q("a-close")!);
    click(q("a-trigger")!);
    await flush();
    click(q("b-trigger")!);
    await flush();
    expect(q("b-panel")?.textContent).toContain("원재료 코일 두께");
    expect(callOasis).toHaveBeenCalledTimes(1);
  });

  it("조회 실패는 '정보 없음' 이고 캐시하지 않아 다음에 열면 다시 묻는다", async () => {
    callOasis.mockRejectedValueOnce(new Error("컬럼을 찾을 수 없습니다"));
    render(createElement(ColumnInfoPopover, { physName: "NOT_EXISTS" }));
    click(q("column-info-trigger")!);
    await flush();
    expect(q("column-info-empty")?.textContent).toContain("정보 없음");
    expect(q("column-info-empty")?.textContent).toContain("컬럼을 찾을 수 없습니다");

    callOasis.mockResolvedValueOnce(VIEW);
    click(q("column-info-close")!);
    click(q("column-info-trigger")!);
    await flush();
    expect(callOasis).toHaveBeenCalledTimes(2);
    expect(q("column-info-name")?.textContent).toBe("원재료 코일 두께");
  });

  it("행(조상)의 click 은 아이콘·패널 클릭으로 불리지 않는다", async () => {
    callOasis.mockResolvedValue(VIEW);
    const rowClick = vi.fn();
    render(createElement("div", { onClick: rowClick, "data-testid": "row" }, createElement(ColumnPhysName, { physName: "RMTL_COIL_THK" })));
    const nativeRowClick = vi.fn();
    q("row")!.addEventListener("click", nativeRowClick);
    click(q("column-info-trigger")!);
    await flush();
    click(q("column-info-name")!);
    expect(rowClick).not.toHaveBeenCalled();
    expect(nativeRowClick).not.toHaveBeenCalled();
    expect(q("column-info-panel")).not.toBeNull();
  });
});

describe("ColumnPhysName", () => {
  it("물리명 글자와 정보 아이콘을 그리고, 비면 아무것도 그리지 않는다", () => {
    render(createElement("div", { "data-testid": "host" }, createElement(ColumnPhysName, { physName: " ABC " }), createElement(ColumnPhysName, { physName: null })));
    expect(q("host")!.textContent).toBe("ABC");
    expect(document.querySelectorAll('[data-testid="column-info-trigger"]').length).toBe(1);
  });
});

describe("표시 도우미", () => {
  it("descriptionFormat — 알려진 태그만 HTML 로 본다", () => {
    expect(descriptionFormat("<p>가</p>")).toBe("HTML");
    expect(descriptionFormat("줄1<br>줄2")).toBe("HTML");
    expect(descriptionFormat("Map<String> 값")).toBe("TEXT");
    expect(descriptionFormat("a < b > c")).toBe("TEXT");
    expect(descriptionFormat(null)).toBe("TEXT");
  });

  it("domainTypeLabel·termsLabel", () => {
    expect(domainTypeLabel({ dataType: "VARCHAR", length: 20, scale: null })).toBe("VARCHAR(20)");
    expect(domainTypeLabel({ dataType: "NUMBER", length: null, scale: null })).toBe("NUMBER");
    expect(domainTypeLabel({ dataType: null, length: null, scale: null })).toBe("타입 없음");
    expect(termsLabel([{ termId: null, termName: "○○", missing: true }, { termId: 2, termName: "코일", engAbbr: null }])).toBe("○○ · 코일");
  });
});
