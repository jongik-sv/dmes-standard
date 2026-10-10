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

  it("runPreview 가 있으면 그것으로 시험하고 previewWidgetQuery 는 부르지 않는다", async () => {
    const runPreview = vi.fn().mockResolvedValue({ columns: ["B"], rows: [], truncated: false });
    const onPreview = vi.fn();
    await act(async () => {
      root.render(
        createElement(
          DmesUiProvider,
          null,
          createElement(SqlEditor, { sql: "select :ok", params: [{ name: "ok", type: "text" as const }], preview: null, onSqlChange: () => {}, onPreview, runPreview })
        )
      );
    });
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="wq-preview-run"]')!.click());
    expect(runPreview).toHaveBeenCalledWith("select :ok", [{ name: "ok", type: "text" }]);
    expect(h.preview).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenCalledWith({ columns: ["B"], rows: [], truncated: false });
  });

  it("SQL 칸은 aria-label SQL 의 입력 칸이고 고치면 onSqlChange 를 부른다(Monaco 불러오기 실패 → 대체 칸)", async () => {
    const onSqlChange = vi.fn();
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement(SqlEditor, { sql: "select 1", preview: null, onSqlChange, onPreview: () => {} })));
    });
    const ta = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="SQL"]')!;
    expect(ta.value).toBe("select 1");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(ta, "select 2");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onSqlChange).toHaveBeenCalledWith("select 2");
  });

  it("시험 중에 다시 불러도(단축키 겹침) 요청은 한 번만 나간다", async () => {
    let resolve!: (v: { columns: string[]; rows: never[]; truncated: boolean }) => void;
    const runPreview = vi.fn(() => new Promise<{ columns: string[]; rows: never[]; truncated: boolean }>((r) => (resolve = r)));
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement(SqlEditor, { sql: "select 1", preview: null, onSqlChange: () => {}, onPreview: () => {}, runPreview })));
    });
    const btn = host.querySelector<HTMLButtonElement>('[data-testid="wq-preview-run"]')!;
    // 같은 렌더 안에서 두 번 — 버튼이 아직 disabled 로 바뀌기 전이다.
    await act(async () => {
      btn.click();
      btn.click();
    });
    expect(runPreview).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ columns: [], rows: [], truncated: false }));
  });
});
