/** @vitest-environment happy-dom */
/** 조건 줄 다중 선택 칸 — 처음 그릴 때(값 없음)도 입력 하나뿐인 한 칸이고, 뿌리 상자 겹침을 지우는 규칙이 있다. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MdmMetaProvider } from "@dk-oasis/shared/mdm-meta";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { ConditionField } from "./ConditionBar";
import type { QueryParam } from "./format";
import { QUERY_CSS } from "./parts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  // 사전 조회(mdmMeta)가 나가지 않게 막는다 — 서버가 없는 시험 환경.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function show(param: QueryParam, value: string | string[]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const el = createElement(
    DmesUiProvider,
    null,
    createElement(MdmMetaProvider, { module: "mcm" } as never, createElement(ConditionField, { param, value, inputId: "x", onChange: () => undefined }))
  );
  await act(async () => root!.render(el));
  return host;
}

describe("다중 선택 조건 칸", () => {
  const multi: QueryParam = { name: "st", type: "multi", options: [{ value: "A" }, { value: "B" }] };

  it("값이 없어도 select 가 아니라 콤보 입력 하나(placeholder 선택)이다", async () => {
    const h = await show(multi, []);
    expect(h.querySelectorAll("select")).toHaveLength(0);
    const inputs = h.querySelectorAll('input[role="combobox"]');
    expect(inputs).toHaveLength(1);
    expect(inputs[0].getAttribute("placeholder")).toBe("선택");
  });

  it("뿌리 상자 겹침을 지우는 규칙과 빈 select 흐림 규칙이 스타일에 있다", () => {
    expect(QUERY_CSS).toContain(".wq-cond--multi .form-multiselect");
    expect(QUERY_CSS).toContain('select:has(option[value=""]:checked)');
  });
});
