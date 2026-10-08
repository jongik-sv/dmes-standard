/** @vitest-environment happy-dom */
/**
 * SqlEditor [쿼리 시험] — 이름이 올바른(usableParams) 조건 정의만 previewWidgetQuery 로 보낸다.
 * 서버 호출(api)은 대역이고 shared(dist) 의 입력 부품은 실물이다. JSX 없이 createElement 로 쓴다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const h = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("./api", () => ({ previewWidgetQuery: h.preview }));

const { SqlEditor } = await import("./SqlEditor");

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  h.preview.mockReset();
  h.preview.mockResolvedValue({ columns: ["A"], rows: [], truncated: false });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("SqlEditor — [쿼리 시험] 과 조건 정의", () => {
  it("이름이 있는 정의만 보낸다(이름 비었거나 형식이 틀리거나 겹친 것은 뺀다)", async () => {
    const params = [
      { name: "", type: "text" as const },
      { name: "ok", type: "text" as const, default: "1" },
      { name: "1bad", type: "text" as const },
      { name: "ok", type: "date" as const },
    ];
    await act(async () => {
      root.render(
        createElement(DmesUiProvider, null, createElement(SqlEditor, { sql: "select :ok", params, preview: null, onSqlChange: () => {}, onPreview: () => {} }))
      );
    });
    const btn = host.querySelector<HTMLButtonElement>('[data-testid="wq-preview-run"]')!;
    await act(async () => btn.click());
    expect(h.preview).toHaveBeenCalledWith("mcm", "select :ok", [{ name: "ok", type: "text", default: "1" }]);
  });
});
