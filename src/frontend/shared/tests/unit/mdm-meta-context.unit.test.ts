/** @vitest-environment happy-dom */
/**
 * MdmMetaProvider·useMdmColumn(s) — 공급자 밖이면 아무것도 부르지 않고 {null,null,false}, 안이면 모듈(pageId 앞부분 또는
 * module prop)로 컬럼 → 도메인 순서로 받는다(spec B4·B5·B6·B7).
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MdmMetaProvider,
  resetMdmMetaStore,
  useMdmCaptionPriority,
  useMdmColumn,
  useMdmColumns,
  useMdmMetaScope,
} from "../../src/mdm-meta";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { TEXT_DOMAIN, TITLE, column, fakeMetaFetch, settle } from "./mdm-meta-fixtures";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root | null = null;

async function render(el: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(el));
}

async function wait() {
  await act(async () => {
    await settle();
  });
}

beforeEach(() => resetMdmMetaStore());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Probe({ name, meta }: { name: string; meta?: string | false }) {
  const info = useMdmColumn(name, meta);
  return createElement("span", {
    "data-testid": "probe",
    "data-loading": String(info.loading),
    "data-column": info.column?.physName ?? "",
    "data-domain": info.domain?.domainId ?? "",
  });
}
const probe = () => host.querySelector('[data-testid="probe"]') as HTMLElement;

describe("공급자 밖", () => {
  it("useMdmColumn 은 {null,null,false} 이고 아무것도 부르지 않는다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    await render(createElement(Probe, { name: "title" }));
    await wait();
    expect(probe().dataset.loading).toBe("false");
    expect(probe().dataset.column).toBe("");
    expect(f.calls).toHaveLength(0);
  });

  it("useMdmCaptionPriority 는 explicit, useMdmMetaScope 는 null", async () => {
    function P() {
      const scope = useMdmMetaScope();
      return createElement("span", { "data-testid": "p" }, `${useMdmCaptionPriority()}|${scope === null}`);
    }
    await render(createElement(P));
    expect(host.textContent).toBe("explicit|true");
  });
});

describe("공급자 안", () => {
  it("module prop 으로 컬럼을 받고 이어 도메인을 받는다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE }, domains: { D_TEXT: TEXT_DOMAIN } });
    vi.stubGlobal("fetch", f.fn);
    await render(createElement(MdmMetaProvider, { module: "mls" }, createElement(Probe, { name: "title" })));
    expect(probe().dataset.loading).toBe("true");
    await wait();
    await wait();
    expect(probe().dataset.loading).toBe("false");
    expect(probe().dataset.column).toBe("TITLE");
    expect(probe().dataset.domain).toBe("D_TEXT");
    expect(f.calls.map((c) => c.url)).toEqual(["/api/mls/mdmMeta/columns", "/api/mls/mdmMeta/domains"]);
    expect(f.calls[0].body).toEqual({ names: ["TITLE"] });
  });

  it("module 을 주지 않으면 포털 탭 pageId 의 ':' 앞부분을 쓴다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    await render(
      createElement(
        TabPageContext.Provider,
        { value: { pageId: "mqc:lsh/noticeMgmt", serviceId: "" } },
        createElement(MdmMetaProvider, null, createElement(Probe, { name: "title" }))
      )
    );
    await wait();
    expect(f.calls[0]?.url).toBe("/api/mqc/mdmMeta/columns");
  });

  it("모듈을 정할 수 없으면(pageId 없음) 부르지 않는다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    await render(createElement(MdmMetaProvider, null, createElement(Probe, { name: "title" })));
    await wait();
    expect(f.calls).toHaveLength(0);
    expect(probe().dataset.loading).toBe("false");
  });

  it("meta 가 이름을 이기고, meta={false} 면 끈다", async () => {
    const f = fakeMetaFetch({ columns: { NOTICE_TITLE: column("NOTICE_TITLE") } });
    vi.stubGlobal("fetch", f.fn);
    await render(
      createElement(
        MdmMetaProvider,
        { module: "mls" },
        createElement(Probe, { name: "title", meta: "NOTICE_TITLE" }),
        createElement(Probe, { name: "other", meta: false })
      )
    );
    await wait();
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].body).toEqual({ names: ["NOTICE_TITLE"] });
  });

  it("disabled 면 부르지 않는다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    await render(createElement(MdmMetaProvider, { module: "mls", disabled: true }, createElement(Probe, { name: "title" })));
    await wait();
    expect(f.calls).toHaveLength(0);
  });

  it("안쪽 공급자는 주지 않은 값을 바깥에서 물려받는다", async () => {
    function P() {
      const s = useMdmMetaScope();
      return createElement("span", null, `${s?.module}|${s?.captionPriority}|${s?.disabled}`);
    }
    await render(
      createElement(MdmMetaProvider, { module: "mls" }, createElement(MdmMetaProvider, { captionPriority: "mdm" }, createElement(P)))
    );
    expect(host.textContent).toBe("mls|mdm|false");
  });

  it("useMdmColumns 는 여러 이름을 POST 한 번으로 받고 name 키로 돌려준다", async () => {
    const CATEGORY = column("CATEGORY");
    const f = fakeMetaFetch({ columns: { TITLE, CATEGORY } });
    vi.stubGlobal("fetch", f.fn);
    let seen: Map<string, { column: unknown }> | null = null;
    function P() {
      seen = useMdmColumns([{ name: "title" }, { name: "category" }, { name: "useYn", meta: false }]);
      return null;
    }
    await render(createElement(MdmMetaProvider, { module: "mls" }, createElement(P)));
    await wait();
    await wait();
    expect(f.calls[0].body).toEqual({ names: ["TITLE", "CATEGORY"] });
    expect((seen!.get("title")!.column as { physName: string }).physName).toBe("TITLE");
    expect((seen!.get("category")!.column as { physName: string }).physName).toBe("CATEGORY");
    expect(seen!.get("useYn")!.column).toBeNull();
  });

  it("이미 받아 둔 메타는 다음 마운트에서 기다리지 않고 바로 보인다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE }, domains: { D_TEXT: TEXT_DOMAIN } });
    vi.stubGlobal("fetch", f.fn);
    await render(createElement(MdmMetaProvider, { module: "mls" }, createElement(Probe, { name: "title" })));
    await wait();
    await wait();
    act(() => root?.unmount());
    host.remove();
    await render(createElement(MdmMetaProvider, { module: "mls" }, createElement(Probe, { name: "title" })));
    expect(probe().dataset.column).toBe("TITLE");
    expect(probe().dataset.domain).toBe("D_TEXT");
    expect(probe().dataset.loading).toBe("false");
    expect(f.calls).toHaveLength(2);
  });
});
