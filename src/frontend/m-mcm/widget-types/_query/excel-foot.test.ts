/** @vitest-environment happy-dom */
/**
 * ExcelFoot(표 아래 줄) 동작 시험 — 안내 글·[엑셀] 단추 모습, 누르면 onExcel, disabled 면 누를 수 없다.
 * shared 의 Button·아이콘만 대역으로 바꾼다(QueryStyle 은 실물). JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dk-oasis/shared/form", async () => {
  const { createElement: el } = await import("react");
  return {
    Button: (p: {
      children?: unknown;
      onClick?: () => void;
      disabled?: boolean;
      size?: string;
      title?: string;
      "data-testid"?: string;
    }) =>
      el(
        "button",
        {
          type: "button",
          onClick: p.onClick,
          disabled: p.disabled,
          title: p.title,
          "data-size": p.size,
          "data-testid": p["data-testid"],
        },
        p.children as never
      ),
  };
});

vi.mock("@tabler/icons-react", async () => {
  const { createElement: el } = await import("react");
  return { IconDownload: () => el("svg", { "data-testid": "icon-download" }) };
});

const { ExcelFoot } = await import("./excel-foot");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderFoot(props: { note: string; onExcel: () => void; disabled?: boolean }) {
  await act(async () => {
    root.render(createElement(ExcelFoot, props));
  });
}

const button = () => {
  const found = container.querySelector<HTMLButtonElement>('[data-testid="wq-excel"]');
  if (!found) throw new Error(`[data-testid="wq-excel"] 가 없습니다. 지금 화면: ${container.innerHTML.slice(0, 400)}`);
  return found;
};

describe("ExcelFoot — 모습", () => {
  it("왼쪽에 안내 글(.wq-foot__note), 오른쪽에 아이콘과 「엑셀」 단추를 .wq-foot 안에 그린다", async () => {
    await renderFoot({ note: "1,234건", onExcel: vi.fn() });
    const foot = container.querySelector(".wq-foot");
    expect(foot).not.toBeNull();
    expect(foot!.querySelector(".wq-foot__note")?.textContent).toBe("1,234건");
    const btn = foot!.querySelector<HTMLButtonElement>("button")!;
    expect(btn).toBe(button());
    expect(btn.textContent).toBe("엑셀");
    expect(btn.title).toBe("보이는 행을 엑셀로 내려받기");
    expect(btn.getAttribute("data-size")).toBe("mini");
    expect(btn.querySelector('[data-testid="icon-download"]')).not.toBeNull();
    // 안내 글이 단추보다 앞(왼쪽)이다
    expect(foot!.firstElementChild?.className).toBe("wq-foot__note");
    expect(foot!.lastElementChild).toBe(btn);
  });
});

describe("ExcelFoot — 동작", () => {
  it("[엑셀]을 누르면 onExcel 이 한 번 불린다", async () => {
    const onExcel = vi.fn();
    await renderFoot({ note: "3행", onExcel });
    expect(button().disabled).toBe(false);
    await act(async () => {
      button().click();
    });
    expect(onExcel).toHaveBeenCalledTimes(1);
  });

  it("disabled 면 단추가 비활성이고 눌러도 onExcel 이 불리지 않는다", async () => {
    const onExcel = vi.fn();
    await renderFoot({ note: "0건", onExcel, disabled: true });
    expect(button().disabled).toBe(true);
    await act(async () => {
      button().click();
    });
    expect(onExcel).not.toHaveBeenCalled();
  });
});
