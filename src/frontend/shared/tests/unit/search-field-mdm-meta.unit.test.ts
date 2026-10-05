/** @vitest-environment happy-dom */
/**
 * SearchField × MDM 컬럼 사전 라벨(2026-10-05 tooltip-shared A2).
 *  - `name` 을 주지 않으면 예전과 DOM·동작이 같다: 공급자 안이어도 요청이 없고, 라벨은 글자 그대로다(필터 키 edt_·cbo_ 로 이름을 추론하지 않는다).
 *  - `name` 을 주면 라벨을 MdmFieldLabel 로 그려 사전에 있을 때 MDM 카드 툴팁을 띄운다(name → 물리명, meta 문자열 우선, meta=false 끔).
 */
import { act, createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchField, type SearchFieldProps } from "../../src/layout/SearchField";
import { MdmMetaProvider, resetMdmMetaStore } from "../../src/mdm-meta";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";
import { TEXT_DOMAIN, TITLE, fakeMetaFetch, settle } from "./mdm-meta-fixtures";

let rendered: Rendered | null = null;

beforeEach(() => {
  resetMdmMetaStore();
});
afterEach(() => {
  rendered?.unmount();
  rendered = null;
  vi.unstubAllGlobals();
});

async function show(el: ReactNode) {
  rendered = renderWithMantine(createElement("div", { "data-testid": "host" }, el));
  await act(async () => {
    await settle(60);
  });
  await act(async () => {
    await settle(60);
  });
  return rendered.host;
}

/** 자동 생성 id(React useId·Mantine)를 지운 본문 HTML — 렌더마다 달라지는 값만 뺀다. */
const bodyHtml = (host: HTMLElement) =>
  (host.querySelector('[data-testid="host"]') as HTMLElement).innerHTML
    .replace(/_r_[0-9a-z]+_/g, "_r_")
    .replace(/mantine-[0-9a-z]+-label/g, "mantine-id-label");

const field = (props: SearchFieldProps) => createElement(SearchField, props);
const inProvider = (child: ReactNode) => createElement(MdmMetaProvider, { module: "mls" }, child);

/** 이름 없는 SearchField 네 가지 모양(텍스트·선택·라디오·사용자 입력). 필터 키처럼 생긴 historyKey 를 줘도 이름으로 쓰지 않는다. */
const plainFields = () => [
  field({ label: "제목", value: "", historyKey: "edt_title" }),
  field({ label: "구분", type: "select", value: "", options: [{ value: "A", label: "가" }] }),
  field({ label: "사용", type: "radio", value: "Y", options: [{ value: "Y", label: "예" }] }),
  field({ label: "기간", children: createElement("input", { "data-testid": "custom" }) }),
];

describe("SearchField — name 없음(예전과 같다)", () => {
  it("공급자 안이어도 요청이 없고 DOM 이 공급자 밖과 같다", async () => {
    const outside = bodyHtml(await show(plainFields()));
    rendered?.unmount();
    resetMdmMetaStore();
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    const inside = bodyHtml(await show(inProvider(plainFields())));
    expect(inside).toBe(outside);
    expect(f.calls).toHaveLength(0);
  });

  it("라벨은 Text(.search-field__label) 안의 글자 하나다", async () => {
    const host = await show(field({ label: "제목", value: "" }));
    const lbl = host.querySelector(".search-field__label") as HTMLElement;
    expect(lbl.textContent).toBe("제목");
    expect(lbl.children).toHaveLength(0);
    expect(host.querySelector(".form-tip-trigger")).toBeNull();
  });
});

describe("SearchField — name·meta", () => {
  it("name 이 사전에 있으면 라벨이 툴팁 트리거가 되고 적은 label 이 캡션이다(explicit)", async () => {
    const f = fakeMetaFetch({ columns: { TITLE }, domains: { D_TEXT: TEXT_DOMAIN } });
    vi.stubGlobal("fetch", f.fn);
    const host = await show(inProvider(field({ label: "공지 제목", name: "title", value: "" })));
    const trigger = host.querySelector(".search-field__label .form-tip-trigger") as HTMLElement;
    expect(trigger).not.toBeNull();
    expect(trigger.textContent).toBe("공지 제목");
    expect(f.calls[0]?.url).toBe("/api/mls/mdmMeta/columns");
    expect(f.calls[0]?.body.names).toEqual(["TITLE"]);
  });

  it("meta 문자열이 name 보다 우선한다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    const host = await show(inProvider(field({ label: "제목", name: "noticeHead", meta: "TITLE", value: "" })));
    expect(f.calls[0]?.body.names).toEqual(["TITLE"]);
    expect(host.querySelector(".search-field__label .form-tip-trigger")).not.toBeNull();
  });

  it("meta=false 면 요청도 툴팁도 없다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    const host = await show(inProvider(field({ label: "제목", name: "title", meta: false, value: "" })));
    expect(f.calls).toHaveLength(0);
    expect(host.querySelector(".form-tip-trigger")).toBeNull();
    expect(host.querySelector(".search-field__label")?.textContent).toBe("제목");
  });

  it("name 없이 meta 만 주면 연결하지 않는다(meta 는 name 이 있을 때만 쓴다)", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    const host = await show(inProvider(field({ label: "제목", meta: "TITLE", value: "" })));
    expect(f.calls).toHaveLength(0);
    expect(host.querySelector(".form-tip-trigger")).toBeNull();
  });

  it("사전에 없는 name 은 라벨 글자 그대로다", async () => {
    const f = fakeMetaFetch({ columns: {} });
    vi.stubGlobal("fetch", f.fn);
    const host = await show(inProvider(field({ label: "분류", name: "category", value: "" })));
    expect(host.querySelector(".form-tip-trigger")).toBeNull();
    expect(host.querySelector(".search-field__label")?.textContent).toBe("분류");
  });

  it("radio name 은 name 이 아니라 label 그대로다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: {} }).fn);
    const host = await show(
      inProvider(field({ label: "사용", name: "useYn", type: "radio", value: "Y", options: [{ value: "Y", label: "예" }] }))
    );
    // Radio 는 그룹 name 앞에 useId 를 붙인다 — 뒷부분이 label 인지 본다.
    expect((host.querySelector('input[type="radio"]') as HTMLInputElement).name).toMatch(/-사용$/);
  });
});
