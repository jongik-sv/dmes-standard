/** @vitest-environment happy-dom */
/**
 * 위젯 유형 편집기(query-number·query-chart·query-table·chat) × MDM 화면 메타 — 편집기의 칸은 컬럼 사전과 이어지지 않는다.
 * 포털 탭 공급자(module "mcm") 안에서 렌더해도: 사전 요청 0회, 라벨·머리글은 적어 둔 글자 그대로, 사전 카드 툴팁(.form-tip-trigger)이 없다.
 * 가짜 사전은 모든 이름에 답한다 — 어느 칸이든 연결돼 있었다면 요청이 나가고 캡션이 바뀐다.
 * 진짜 shared(dist) 의 공급자·그리드·라벨을 쓴다. JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MdmMetaProvider, resetMdmMetaStore } from "@dk-oasis/shared/mdm-meta";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import ChatEditor from "../chat/editor";
import QueryChartEditor from "../query-chart/editor";
import QueryNumberEditor from "../query-number/editor";
import QueryTableEditor from "../query-table/editor";

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
if (!("ResizeObserver" in window)) {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
}

/** 어떤 이름을 물어도 사전에 있는 것처럼 답한다. 그 밖의 호출(쿼리 위젯 목록 등)은 빈 결과. */
function fakeFetch() {
  const calls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (!url.includes("mdmMeta")) {
      return new Response(JSON.stringify({ success: true, data: {}, rows: [], items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const body = init?.body ? (JSON.parse(String(init.body)) as { names?: string[] }) : {};
    const items: Record<string, unknown> = {};
    for (const n of body.names ?? []) {
      items[n] = {
        physName: n,
        columnName: `사전-${n}`,
        labelLong: `사전-${n}`,
        labelMid: `사전-${n}`,
        labelShort: `사전-${n}`,
        description: "설명",
        usageNote: null,
        dataType: "STRING",
        length: 10,
        scale: null,
        required: false,
        defaultValue: null,
        refKind: null,
        refTarget: null,
        refCateId: null,
        domain: null,
        stdExpr: null,
        bizRuleOnServer: false,
        bizRequiredVars: [],
        codeRef: null,
        allowedCodes: null,
      };
    }
    return new Response(JSON.stringify({ items, missing: [], unavailable: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { fn, calls };
}

let root: Root | null = null;
let host: HTMLDivElement;
let f: ReturnType<typeof fakeFetch>;

beforeEach(() => {
  resetMdmMetaStore();
  f = fakeFetch();
  vi.stubGlobal("fetch", f.fn);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

async function show(editor: typeof ChatEditor, value: unknown) {
  const el = createElement(
    DmesUiProvider,
    null,
    createElement(MdmMetaProvider, {
      module: "mcm",
      children: createElement(editor, { value, onChange: () => undefined }),
    })
  );
  await act(async () => root!.render(el));
  // 배치 대기(MDM_META_BATCH_MS)와 응답 처리를 흘려보낸다.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 150));
  });
}

const labels = () => [...host.querySelectorAll("th")].map((el) => el.textContent);
const headers = () => [...host.querySelectorAll(".ag-header-cell-text")].map((el) => el.textContent);
/** 「조회 조건」 목록 표 머리글 — 세 쿼리 유형 편집기가 같다. */
const PARAM_HEADERS = ["이름 *", "라벨", "형", "기본값", "필수", "선택지(값:라벨,…)"];
const metaCalls = () => f.calls.filter((u) => u.includes("mdmMeta"));

describe("위젯 유형 편집기는 사전 연결 없이 적어 둔 글자 그대로 그린다", () => {
  it("query-number — 라벨 6개", async () => {
    await show(QueryNumberEditor, { sql: "select 1 a", labelField: "a", valueField: "a" });
    expect(labels()).toEqual(["SQL *", "조회 조건", "라벨 필드 *", "값 필드 *", "단위 필드", "단위", "값 형식"]);
    expect(host.querySelector(".form-tip-trigger")).toBeNull();
    expect(metaCalls()).toEqual([]);
  });

  it("query-chart — 라벨 5개와 값 계열 표 머리글", async () => {
    await show(QueryChartEditor, { sql: "select 1 a", chartType: "bar", xField: "a", series: [{ field: "a" }] });
    expect(labels()).toEqual(["SQL *", "조회 조건", "차트 종류 *", "가로축 필드 *", "값 계열 *", "단위(원 차트)"]);
    expect(headers()).toEqual([...PARAM_HEADERS, "필드 *", "이름(범례)"]);
    expect(host.querySelector(".form-tip-trigger")).toBeNull();
    expect(metaCalls()).toEqual([]);
  });

  it("query-table — 라벨 2개와 표시 컬럼 표 머리글", async () => {
    await show(QueryTableEditor, { sql: "select 1 a", columns: [{ field: "a" }] });
    expect(labels()).toEqual(["SQL *", "조회 조건", "표시 컬럼"]);
    expect(headers()).toEqual([...PARAM_HEADERS, "필드 *", "머리글", "폭", "정렬", "형식"]);
    expect(host.querySelector(".form-tip-trigger")).toBeNull();
    expect(metaCalls()).toEqual([]);
  });

  it("chat — 라벨 4개", async () => {
    await show(ChatEditor, { systemPrompt: "", welcome: "", pageGuide: false, dataQueryDefIds: [] });
    expect(labels()).toEqual(["시스템 프롬프트", "첫 인사", "포털 화면 안내", "데이터 질의에 쓸 쿼리 위젯"]);
    expect(host.querySelector(".form-tip-trigger")).toBeNull();
    expect(metaCalls()).toEqual([]);
  });
});
