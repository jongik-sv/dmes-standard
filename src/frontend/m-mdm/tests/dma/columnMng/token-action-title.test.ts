/** @vitest-environment happy-dom */

// 컬럼 사전 분해 토큰 표의 처리 칸 — 최소 폭 220px(Local-Rules §30)에서 긴 후보 이름·안내가 말줄임돼도 전체 글자를 제목(title)으로
// 볼 수 있어야 한다. 이 칸은 render 전용이라 셀 툴팁을 끄므로(tooltip:false) 버튼·글자에 title 을 직접 붙인다(2026-10-03).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const mocks = vi.hoisted(() => ({
  tokenGrid: { current: null as Record<string, unknown> | null },
}));

// 분해 토큰 그리드(rowKey=seq)의 props 만 잡는다. 그리드 자체는 그리지 않는다.
vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  return {
    ...actual,
    AgDataGrid: (props: Record<string, unknown>) => {
      if (props.rowKey === "seq") mocks.tokenGrid.current = props;
      return null;
    },
  };
});

import ColumnMngPage from "../../../pages/dma/columnMng/page";
import type { NameToken } from "../../../pages/dma/columnMng/types";
import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, typeInto } from "../../dme/helpers/render";

const LONG_NAME = "원재료 코일 두께 측정 기준 공정 구간 판정용 긴 이름";

function token(seq: number, status: NameToken["status"], over: Partial<NameToken> = {}): NameToken {
  return { seq, surface: `토큰${seq}`, status, termId: null, termName: null, senseNo: null, engAbbr: null, abbr: "", candidates: [], ...over };
}

const TOKENS: NameToken[] = [
  token(1, "MATCHED", { termId: 1, termName: "코일", abbr: "COIL" }),
  token(2, "SYNONYM", { termId: 2, termName: LONG_NAME, abbr: "THK" }),
  token(3, "AMBIGUOUS", {
    termId: 3,
    termName: LONG_NAME,
    candidates: [{ termId: 3, termName: LONG_NAME, senseNo: 2, engAbbr: "LONGABBR" } as NameToken["candidates"][number]],
  }),
  token(4, "AMBIGUOUS", { candidates: [{ termId: 9, termName: "후보", senseNo: 1, engAbbr: "C" } as NameToken["candidates"][number]] }),
  token(5, "NO_ABBR"),
  token(6, "UNKNOWN"),
];

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  installDomStorage();
  mocks.tokenGrid.current = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const m = url.match(/\/oasis\/columnMng\/(\w+)/);
    const ok = (result: unknown) => ({ meta: { success: true }, data: { result } });
    if (m?.[1] === "search") return jsonResponse(ok({ list: [], domains: [], systems: [] }));
    if (m?.[1] === "compare") {
      return jsonResponse(ok({
        direction: "FORWARD", input: "원재료 코일두께", tokens: TOKENS, logicalName: "", physName: "", placeholder: true,
        domains: [], recommendedDomainId: null, duplicates: [],
      }));
    }
    if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
    if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
      return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
    }
    return jsonResponse({}, 404);
  }) as typeof fetch;
  delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container.remove();
  globalThis.fetch = originalFetch;
  delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
});

/** 처리 칸이 이 줄에 그리는 것을 따로 그려 그 맨 바깥 요소를 돌려준다. */
function actionCell(seq: number): Element {
  const props = mocks.tokenGrid.current!;
  const col = (props.columns as Array<{ key: string; render?: (v: unknown, row: Record<string, unknown>) => unknown }>).find(
    (c) => c.key === "ACTION",
  )!;
  const row = (props.data as Array<Record<string, unknown>>).find((r) => r.seq === seq)!;
  const html = renderToStaticMarkup(createElement(DmesUiProvider, null, col.render!(row.ACTION, row) as never));
  const holder = document.createElement("div");
  holder.innerHTML = html;
  // 공급자(Mantine)가 넣는 <style> 은 칸 내용이 아니다.
  holder.querySelectorAll("style").forEach((x) => x.remove());
  // 맨 바깥 요소의 title 을 본다 — 안쪽 요소에만 title 이 있으면 말줄임되는 바깥 칸에서 보이지 않을 수 있다(검토 N2).
  const el = holder.firstElementChild;
  expect(el, `처리 칸 ${seq}`).toBeTruthy();
  return el!;
}

describe("분해 토큰 표 처리 칸 제목(title)", () => {
  it("모든 상태의 처리 칸은 말줄임돼도 전체 글자를 제목으로 보인다(버튼 포함)", async () => {
    await act(async () => {
      root!.render(createElement(DmesUiProvider, null, createElement(ColumnMngPage)));
    });
    await flush();
    await flush();
    await typeInto(document.querySelector('[data-testid="gen-input"]') as HTMLInputElement, "원재료 코일두께");
    await act(async () => findButton(document.body, "분해").click());
    await flush();
    await flush();
    expect(mocks.tokenGrid.current, "토큰 그리드").toBeTruthy();

    for (const seq of [1, 2, 3, 4, 5, 6]) {
      const el = actionCell(seq);
      const text = (el.textContent ?? "").trim();
      expect(text, `처리 칸 ${seq} 글자`).not.toBe("");
      expect(el.getAttribute("title"), `처리 칸 ${seq} 제목`).toBe(text);
    }
    expect(actionCell(2).getAttribute("title")).toContain(LONG_NAME);
    expect(actionCell(3).getAttribute("title")).toContain(LONG_NAME);
    expect(actionCell(6).tagName).toBe("BUTTON");
  });
});
