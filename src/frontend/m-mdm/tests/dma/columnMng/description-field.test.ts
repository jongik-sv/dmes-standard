/** @vitest-environment happy-dom */

// columnMng 설명·활용처 메모 칸 — 형식 선택 [글 | HTML]. 처음 형식은 descriptionFormat(백엔드와 같은 규칙), 글 → HTML 은 이스케이프해 줄마다 <p>,
// HTML → 글은 확인 뒤 글자만. 빈 값은 빈 값 그대로. 글자 수 표시·20,000자 초과 경고(입력은 막지 않는다). 저장하면 다른 형식으로 보일 값은 미리 알린다.
// 화면에 붙인 모습: 행을 다시 열면 형식을 새로 판별하고(칸을 새로 그린다), 저장 요청에 고친 값이 실린다.
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const mocks = vi.hoisted(() => ({
  listGrid: { current: null as Record<string, unknown> | null },
}));

// 컬럼 목록 그리드(rowKey=columnId)의 props 만 잡는다. 그리드 자체는 그리지 않는다.
vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  return {
    ...actual,
    AgDataGrid: (props: Record<string, unknown>) => {
      if (props.rowKey === "columnId") mocks.listGrid.current = props;
      return null;
    },
  };
});

import ColumnMngPage from "../../../pages/dma/columnMng/page";
import {
  DESCRIPTION_MAX,
  DescriptionField,
  type DescriptionFieldProps,
} from "../../../pages/dma/columnMng/DescriptionField";

import {
  RBAC_STORE_KEY,
  findButton,
  flush,
  installDomStorage,
  jsonResponse,
  polyfillLayout,
  typeInto,
} from "../../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;

const tid = <T extends Element = HTMLElement>(id: string) =>
  document.querySelector<T & Element>(`[data-testid="${id}"]`) as T | null;

/** 형식 선택의 칸(글·HTML)을 누른다. */
async function pickFormat(testId: string, format: "TEXT" | "HTML") {
  const radio = tid(`${testId}-format`)?.querySelector<HTMLInputElement>(`input[type="radio"][value="${format}"]`);
  if (!radio) throw new Error(`${testId} 형식 ${format} 칸 없음`);
  await act(async () => {
    radio.click();
  });
  await flush();
  await flush();
}

const checkedFormat = (testId: string) =>
  tid(`${testId}-format`)?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value;

beforeEach(() => {
  installDomStorage();
  polyfillLayout();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container.remove();
  vi.restoreAllMocks();
});

// ─────────────────────────────── 칸 하나 ───────────────────────────────

interface Harness {
  onChange: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
  value: () => string;
}

async function mountField(initial: string, props: Partial<DescriptionFieldProps> = {}): Promise<Harness> {
  const onChange = vi.fn();
  const confirm = vi.fn().mockResolvedValue(true);
  let current = initial;
  function Wrap() {
    const [v, setV] = useState(initial);
    current = v;
    return createElement(DescriptionField, {
      value: v,
      testId: "desc",
      ariaLabel: "설명",
      confirm,
      ...props,
      onChange: (next: string) => {
        onChange(next);
        setV(next);
      },
    });
  }
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(Wrap)));
  });
  await flush();
  await flush();
  return { onChange, confirm: (props.confirm as ReturnType<typeof vi.fn>) ?? confirm, value: () => current };
}

describe("DescriptionField — 형식 선택 [글 | HTML]", () => {
  it("처음 형식은 descriptionFormat — 일반 글이면 글(Textarea), 알려진 태그가 있으면 HTML 편집기", async () => {
    await mountField("a < b\n둘째 줄 Map<String>");
    expect(checkedFormat("desc")).toBe("TEXT");
    expect(tid<HTMLTextAreaElement>("desc-text")?.value).toBe("a < b\n둘째 줄 Map<String>");
    expect(tid("desc-html")).toBeNull();
  });

  it("알려진 태그가 있으면 HTML 형식으로 열고 편집기를 보인다(열기만 해서는 onChange 없음)", async () => {
    const h = await mountField("<p>설명 <b>굵게</b></p>");
    expect(checkedFormat("desc")).toBe("HTML");
    expect(tid("desc-html")).not.toBeNull();
    expect(tid("desc-text")).toBeNull();
    expect(h.onChange).not.toHaveBeenCalled();
  });

  it("글 → HTML: 이스케이프해 줄마다 <p> 로 감싼다(빈 줄은 빈 문단), 묻지 않는다", async () => {
    const h = await mountField("a < b\n\n둘째");
    await pickFormat("desc", "HTML");
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.onChange).toHaveBeenLastCalledWith("<p>a &lt; b</p>\n<p><br></p>\n<p>둘째</p>");
    expect(checkedFormat("desc")).toBe("HTML");
    expect(tid("desc-html")).not.toBeNull();
  });

  it("HTML → 글: 확인을 받는다 — 취소면 그대로, 확인이면 글자만 남긴다(블록 사이 줄바꿈)", async () => {
    const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const h = await mountField("<h2>제목</h2><p>본문<br>둘째</p><ul><li>가</li></ul>", { confirm });
    await pickFormat("desc", "TEXT");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(String(confirm.mock.calls[0]?.[0])).toMatch(/글자만/);
    expect(h.onChange).not.toHaveBeenCalled();
    expect(checkedFormat("desc")).toBe("HTML");
    expect(tid("desc-html")).not.toBeNull();

    await pickFormat("desc", "TEXT");
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(h.onChange).toHaveBeenLastCalledWith("제목\n본문\n둘째\n가");
    expect(checkedFormat("desc")).toBe("TEXT");
    expect(tid<HTMLTextAreaElement>("desc-text")?.value).toBe("제목\n본문\n둘째\n가");
  });

  it("빈 값은 빈 값 그대로 — 형식을 바꿔도 값을 만들지 않고 묻지도 않는다", async () => {
    const h = await mountField("");
    await pickFormat("desc", "HTML");
    expect(checkedFormat("desc")).toBe("HTML");
    await pickFormat("desc", "TEXT");
    expect(checkedFormat("desc")).toBe("TEXT");
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.onChange).not.toHaveBeenCalled();
    expect(h.value()).toBe("");
  });

  it("글자 수를 보이고 20,000자를 넘으면 경고하되 입력은 막지 않는다(글 모드)", async () => {
    expect(DESCRIPTION_MAX).toBe(20000);
    const h = await mountField("가");
    expect(tid("desc-text-count")?.textContent).toContain("1 / 20,000");
    expect(tid("desc-text-count")?.getAttribute("data-over")).toBe("false");
    const ta = tid<HTMLTextAreaElement>("desc-text")!;
    expect(ta.hasAttribute("maxlength")).toBe(false);
    await typeInto(ta, "x".repeat(20001));
    expect(h.value().length).toBe(20001);
    expect(tid("desc-text-count")?.textContent).toContain("20,001 / 20,000");
    expect(tid("desc-text-count")?.getAttribute("data-over")).toBe("true");
  });

  it("HTML 모드는 편집기가 같은 상한으로 글자 수를 보인다", async () => {
    await mountField("<p>a</p>");
    expect(tid("desc-html-count")?.textContent).toBe("글자 1 · HTML 8 / 20,000자");
  });

  it("저장하면 다른 형식으로 보일 값은 미리 알린다", async () => {
    await mountField("a");
    expect(tid("desc-format-warning")).toBeNull();
    // 글 모드인데 알려진 태그가 있다 → 저장하면 HTML 로 보인다
    await typeInto(tid<HTMLTextAreaElement>("desc-text")!, "<b>굵게</b>");
    expect(tid("desc-format-warning")?.textContent).toMatch(/HTML/);
    // HTML 모드인데 알려진 태그가 없다 → 저장하면 글로 보인다
    await typeInto(tid<HTMLTextAreaElement>("desc-text")!, "그냥 글");
    expect(tid("desc-format-warning")).toBeNull();
    await pickFormat("desc", "HTML");
    await act(async () => {
      tid<HTMLButtonElement>("desc-html-mode-html")!.click();
    });
    await flush();
    await typeInto(tid<HTMLTextAreaElement>("desc-html-source")!, "태그 없는 글");
    expect(tid("desc-format-warning")?.textContent).toMatch(/글로/);
  });
});

// ─────────────────────────────── 화면에 붙인 모습 ───────────────────────────────

const ok = (result: unknown) => ({ meta: { success: true }, data: { result } });

const LIST_ROW = {
  columnId: 7,
  columnName: "강종",
  physName: "STL_GRD",
  domainId: null,
  required: false,
};

const VIEW_COLUMN = {
  columnId: 7,
  columnName: "강종",
  physName: "STL_GRD",
  labelLong: "강종",
  labelMid: "강종",
  labelShort: "강종",
  description: "<p>강종 <b>코드</b></p>",
  domainId: null,
  required: false,
  defaultValue: "",
  refKind: "",
  refTarget: "",
  refCateId: "",
  usageNote: "줄1 a < b\n줄2",
};

describe("ColumnMngPage 설명·활용처 메모 칸", () => {
  const saved: Record<string, unknown>[] = [];
  let saveFails = false;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mocks.listGrid.current = null;
    saved.length = 0;
    saveFails = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const m = url.match(/\/oasis\/columnMng\/(\w+)/);
      if (m?.[1] === "search") return jsonResponse(ok({ list: [LIST_ROW], domains: [], systems: [] }));
      if (m?.[1] === "view") return jsonResponse(ok({ column: VIEW_COLUMN, systems: [], terms: [] }));
      if (m?.[1] === "save") {
        saved.push(JSON.parse(String(init?.body ?? "{}")).params ?? {});
        if (saveFails) return jsonResponse({ meta: { success: false, message: "저장 실패" } }, 500);
        return jsonResponse(ok({ columnId: 7 }));
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints"))
        return jsonResponse({
          grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } },
        });
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  async function renderPage() {
    await act(async () => {
      root!.render(createElement(DmesUiProvider, null, createElement(ColumnMngPage)));
    });
    await flush();
    await flush();
  }

  async function openRow() {
    await act(async () => {
      (mocks.listGrid.current!.onRowClick as (row: Record<string, unknown>) => void)({ columnId: 7 });
    });
    await flush();
    await flush();
  }

  it("행을 열면 칸마다 형식을 판별하고, 다시 열면 바꾼 형식을 버리고 새로 판별한다", async () => {
    await renderPage();
    await openRow();
    expect(checkedFormat("form-description")).toBe("HTML");
    expect(tid("form-description-html")).not.toBeNull();
    expect(checkedFormat("form-usage-note")).toBe("TEXT");
    expect(tid<HTMLTextAreaElement>("form-usage-note-text")?.value).toBe("줄1 a < b\n줄2");

    await pickFormat("form-usage-note", "HTML");
    expect(checkedFormat("form-usage-note")).toBe("HTML");

    await openRow();
    expect(checkedFormat("form-usage-note")).toBe("TEXT");
    expect(tid<HTMLTextAreaElement>("form-usage-note-text")?.value).toBe("줄1 a < b\n줄2");
  });

  it("HTML 로 바꾼 활용처 메모가 저장 요청에 실린다", async () => {
    await renderPage();
    await openRow();
    await pickFormat("form-usage-note", "HTML");
    await act(async () => {
      findButton(container, "저장").click();
    });
    await flush();
    await flush();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      description: "<p>강종 <b>코드</b></p>",
      usageNote: "<p>줄1 a &lt; b</p>\n<p>줄2</p>",
    });
  });

  it("저장이 실패해도 칸을 새로 그리지 않아 값과 형식이 그대로 남는다", async () => {
    await renderPage();
    await openRow();
    await pickFormat("form-usage-note", "HTML");
    expect(checkedFormat("form-usage-note")).toBe("HTML");
    const before = tid("form-usage-note-html");
    saveFails = true;
    await act(async () => {
      findButton(container, "저장").click();
    });
    await flush();
    await flush();
    expect(saved).toHaveLength(1);
    expect(checkedFormat("form-usage-note")).toBe("HTML");
    expect(checkedFormat("form-description")).toBe("HTML");
    // 같은 DOM 이 남는다 = 다시 그리지 않았다
    expect(tid("form-usage-note-html")).toBe(before);
    expect(document.querySelector('[data-testid="form-usage-note-html"] .ProseMirror')?.textContent).toBe(
      "줄1 a < b줄2"
    );
  });

  it("HTML → 글 은 공용 확인창으로 묻는다", async () => {
    await renderPage();
    await openRow();
    await pickFormat("form-description", "TEXT");
    expect(document.body.textContent).toMatch(/글자만/);
    const okButton = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "확인");
    await act(async () => {
      okButton!.click();
    });
    await flush();
    await flush();
    expect(checkedFormat("form-description")).toBe("TEXT");
    expect(tid<HTMLTextAreaElement>("form-description-text")?.value).toBe("강종 코드");
  });
});
