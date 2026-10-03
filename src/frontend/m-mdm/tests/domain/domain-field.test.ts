/** @vitest-environment happy-dom */

// 도메인 한 개를 정하는 칸(DomainField) — 칸을 떠날 때(blur) 확정 검색이 한 건이면 바로 적용하지만, 그 응답보다 먼저
// [찾기]를 눌렀으면 늦게 온 확정 응답이 막 연 찾기 팝업을 닫거나 도메인을 바꾸지 않는다(Local-Rules §11·§15 요청 순번).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { DomainField, type DomainRow } from "@/domain";

let container: HTMLDivElement;
let root: Root | null = null;

const ROW: DomainRow = { domainId: 7, stdName: "THK", domainName: "두께", domainKind: "QTY", dataType: "NUMBER" } as DomainRow;

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function render(search: (k: string) => Promise<DomainRow[]>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const onChange = vi.fn();
  await act(async () => {
    root!.render(
      createElement(DmesUiProvider, null, createElement(DomainField, { domainId: null, label: "", search, onChange, testId: "t-dom" })),
    );
  });
  return { onChange };
}

const input = () => container.querySelector('[data-testid="t-dom"]') as HTMLInputElement;
const box = () => document.body.querySelector('[data-testid="t-dom-box"]');

async function typeAndBlur(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
});

describe("DomainField", () => {
  it("칸을 떠나 한 건이 찾아지면 바로 적용한다", async () => {
    const search = vi.fn(async () => [ROW]);
    const { onChange } = await render(search);
    await typeAndBlur("두께");
    await flush();
    expect(search).toHaveBeenCalledWith("두께");
    expect(onChange).toHaveBeenCalledWith(ROW);
    expect(box()).toBeNull();
  });

  it("칸을 떠난 확정 검색이 끝나기 전에 [찾기]를 누르면, 늦게 온 한 건 응답이 찾기 팝업을 닫거나 도메인을 바꾸지 않는다", async () => {
    let release!: (rows: DomainRow[]) => void;
    const search = vi.fn((k: string) => (k === "두께" ? new Promise<DomainRow[]>((r) => (release = r)) : Promise.resolve([ROW])));
    const { onChange } = await render(search);
    await typeAndBlur("두께");
    const find = container.querySelector('[data-testid="t-dom-find"]') as HTMLButtonElement;
    await act(async () => {
      find.click();
    });
    await flush();
    expect(box()).not.toBeNull();
    await act(async () => {
      release([ROW]);
    });
    await flush();
    expect(box()).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
