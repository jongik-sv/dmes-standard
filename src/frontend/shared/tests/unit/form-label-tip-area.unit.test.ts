/** @vitest-environment happy-dom */
/**
 * 폼 라벨 툴팁 트리거 범위(2026-10-05) — 라벨 글자가 아니라 라벨 칸 전체에서 뜬다(그리드 머리글 MdmHeaderLabel 과 같은 방식).
 *  - 칸의 빈 곳(글자 밖)에 mouseover 하면 뜬다 / 칸 안 이동(relatedTarget 이 칸 안)으로는 닫히지 않는다 / 입력칸 hover 로는 뜨지 않는다.
 *  - 대상: MdmFieldLabel(th, td, .search-field__label), FormGroup(.form-group-label). HTML 설명 카드(상호작용)도 같다.
 */
import { act, createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormGroup } from "../../src/components/form/FormGroup";
import { Input } from "../../src/components/form/Input";
import { MdmFieldLabel, MdmMetaProvider, resetMdmMetaStore } from "../../src/mdm-meta";
import { HOVER_TIP_GRACE_MS } from "../../src/components/form/useHoverTip";
import { SearchField } from "../../src/layout/SearchField";
import { TEXT_DOMAIN, TITLE, column, fakeMetaFetch, settle } from "./mdm-meta-fixtures";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;

const BODY = column("NOTICE_BODY", {
  columnName: "본문",
  labelMid: "본문",
  description: "설명",
  descriptionHtml: "<p><b>굵은</b> 설명</p>",
});

beforeEach(() => resetMdmMetaStore());
afterEach(() => {
  r?.unmount();
  r = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function show(el: ReactNode, columns: Record<string, unknown> = { TITLE }) {
  vi.stubGlobal("fetch", fakeMetaFetch({ columns: columns as never, domains: { D_TEXT: TEXT_DOMAIN } }).fn);
  r = renderWithMantine(createElement(MdmMetaProvider, { module: "mls" }, el));
  await act(async () => {
    await settle(60);
  });
  await act(async () => {
    await settle(60);
  });
}

const q = (sel: string) => r!.host.querySelector(sel) as HTMLElement;
const portal = () => document.querySelector(".form-tip-text--portal") as HTMLElement | null;
function fire(el: Element, type: "mouseover" | "mouseout", relatedTarget: Element | null = null) {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget }));
  });
}

const detail = (name: string) =>
  createElement(
    "table",
    null,
    createElement(
      "tbody",
      null,
      createElement(
        "tr",
        null,
        createElement("th", { "data-testid": "th" }, createElement(MdmFieldLabel, { name })),
        createElement("td", { "data-testid": "td" }, createElement("input", { "data-testid": "in" }))
      )
    )
  );

describe("MdmFieldLabel — th 칸 전체", () => {
  it.each([
    ["사전에 있는 라벨", "TITLE", { TITLE }],
    ["사전에 없는 라벨(글자 툴팁)", "NOPE", { TITLE }],
  ])("%s: th 의 빈 곳 mouseover 로 뜨고, 칸 안 이동으로는 닫히지 않고, td 로는 뜨지 않는다", async (_n, name, cols) => {
    await show(detail(name), cols);
    expect(portal()).toBeNull();
    fire(q("td"), "mouseover");
    expect(portal()).toBeNull();
    fire(q("th"), "mouseover");
    expect(portal()).not.toBeNull();
    // 칸 안 이동 — 글자 span 에서 th 로 나가는 mouseout(relatedTarget 이 칸 안)
    fire(q(".form-tip-trigger"), "mouseout", q("th"));
    expect(portal()).not.toBeNull();
    // 칸 밖(td)으로 나가면 닫힌다
    fire(q("th"), "mouseout", q("td"));
    expect(portal()).toBeNull();
  });

  it("공급자 밖에서는 단순 텍스트이고 th 에 걸어도 툴팁이 없다", () => {
    r = renderWithMantine(detail("TITLE"));
    fire(q("th"), "mouseover");
    expect(portal()).toBeNull();
    expect(q("th").innerHTML).toBe("TITLE");
  });

  it("HTML 설명 카드도 칸 전체에서 뜨고 150ms 유예 뒤 닫히며 칸 안을 누르면 바로 닫힌다", async () => {
    await show(detail("NOTICE_BODY"), { NOTICE_BODY: BODY });
    vi.useFakeTimers();
    fire(q("th"), "mouseover");
    expect(portal()?.querySelector('[data-mdm-html="true"]')).not.toBeNull();
    fire(q("th"), "mouseout", q("td"));
    expect(portal()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(HOVER_TIP_GRACE_MS + 10);
    });
    expect(portal()).toBeNull();
    fire(q("th"), "mouseover");
    expect(portal()).not.toBeNull();
    act(() => {
      q("th").dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(portal()).toBeNull();
  });
});

describe("FormGroup — 라벨 박스 전체", () => {
  const group = (props: Record<string, unknown>) =>
    createElement(FormGroup, props as never, createElement(Input, { value: "", onChange: () => undefined }));

  it.each([
    ["tip 글자", { label: "제목", tip: "도움말" }],
    ["공급자 안 라벨 글자 툴팁", { label: "제목" }],
  ])("%s: 라벨 박스 빈 곳 mouseover 로 뜨고 입력칸 hover 로는 뜨지 않는다", async (_n, props) => {
    await show(group(props));
    fire(q(".form-group-field"), "mouseover");
    expect(portal()).toBeNull();
    fire(q(".form-group-label"), "mouseover");
    expect(portal()).not.toBeNull();
    fire(q(".form-tip-trigger"), "mouseout", q(".form-group-label"));
    expect(portal()).not.toBeNull();
    fire(q(".form-group-label"), "mouseout", q(".form-group-field"));
    expect(portal()).toBeNull();
  });

  it("공급자 밖 + tip 없음은 트리거·툴팁이 없다", () => {
    r = renderWithMantine(group({ label: "제목" }));
    fire(q(".form-group-label"), "mouseover");
    expect(portal()).toBeNull();
    expect(q(".form-tip-trigger")).toBeNull();
  });
});

describe("SearchField — 라벨 영역 전체", () => {
  it("라벨 영역 빈 곳에서 뜨고 입력칸에서는 뜨지 않는다", async () => {
    await show(createElement(SearchField, { label: "제목", name: "TITLE", value: "", onChange: () => undefined } as never));
    fire(q(".search-field input"), "mouseover");
    expect(portal()).toBeNull();
    fire(q(".search-field__label"), "mouseover");
    expect(portal()).not.toBeNull();
    fire(q(".form-tip-trigger"), "mouseout", q(".search-field__label"));
    expect(portal()).not.toBeNull();
  });
});
