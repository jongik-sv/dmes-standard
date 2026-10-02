/** @vitest-environment happy-dom */
/**
 * FormGroup × MDM 화면 메타(spec B1·B2·B3·B6, §4 FormGroup 신규 prop).
 *  - 공급자 밖: name 을 줘도 부르지 않고 예전과 같은 DOM.
 *  - 공급자 안: 비운 label 은 폼 캡션(labelMid), tip 이 없으면 MdmMetaCard 를 같은 포털 툴팁으로 띄운다.
 *  - tip 은 ReactNode 도 받는다.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormGroup } from "../../src/components/form/FormGroup";
import { Input } from "../../src/components/form/Input";
import { MdmMetaProvider, resetMdmMetaStore } from "../../src/mdm-meta";
import { TEXT_DOMAIN, TITLE, fakeMetaFetch, settle } from "./mdm-meta-fixtures";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;

beforeEach(() => resetMdmMetaStore());
afterEach(() => {
  r?.unmount();
  r = null;
  vi.unstubAllGlobals();
});

const input = () => createElement(Input, { value: "", onChange: () => undefined });
const labelText = () => r!.host.querySelector("label")?.textContent;

async function wait() {
  await act(async () => {
    await settle(60);
  });
}

describe("FormGroup 공급자 밖", () => {
  it("name 을 줘도 부르지 않고 DOM 이 name 없을 때와 같다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    r = renderWithMantine(createElement(FormGroup, { label: "제목", required: true, tip: "도움말" }, input()));
    const plain = r.host.innerHTML.replace(/_r_[0-9a-z]+_|«r[0-9a-z]+»|:r[0-9a-z]+:/g, "ID");
    r.unmount();
    r = renderWithMantine(createElement(FormGroup, { label: "제목", required: true, tip: "도움말", name: "title" }, input()));
    await wait();
    const named = r.host.innerHTML.replace(/_r_[0-9a-z]+_|«r[0-9a-z]+»|:r[0-9a-z]+:/g, "ID");
    expect(named).toBe(plain);
    expect(f.calls).toHaveLength(0);
  });

  it("label 을 비우고 name 만 주면 name 을 라벨로 쓴다", () => {
    r = renderWithMantine(createElement(FormGroup, { name: "title" }, input()));
    expect(labelText()).toBe("title");
  });

  it("tip 에 ReactNode 를 줄 수 있다(포커스 때 포털 툴팁으로 띄운다)", () => {
    r = renderWithMantine(
      createElement(FormGroup, { label: "제목", tip: createElement("b", { className: "rich-tip" }, "굵은 도움말") }, input())
    );
    act(() => r!.host.querySelector("input")?.focus());
    expect(document.querySelector(".form-tip-text--portal .rich-tip")?.textContent).toBe("굵은 도움말");
  });
});

describe("FormGroup 공급자 안", () => {
  it("label 을 비우면 폼 캡션(labelMid)을 쓰고 MdmMetaCard 를 툴팁으로 띄운다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE }, domains: { D_TEXT: TEXT_DOMAIN } });
    vi.stubGlobal("fetch", f.fn);
    r = renderWithMantine(createElement(MdmMetaProvider, { module: "mls" }, createElement(FormGroup, { name: "title" }, input())));
    await wait();
    await wait();
    expect(f.calls[0].body).toEqual({ names: ["TITLE"] });
    expect(labelText()).toBe("공지제목");
    expect(r.host.querySelector("label")?.classList.contains("has-tip")).toBe(true);

    act(() => r!.host.querySelector("input")?.focus());
    const portal = document.querySelector(".form-tip-text--portal");
    expect(portal?.querySelector('[data-mdm-section="title"]')?.textContent).toContain("공지 제목");
    expect(portal?.querySelector('[data-mdm-section="format"]')?.textContent).toContain("STRING(1000)");
    // 스크린리더 설명도 같은 내용
    const describedBy = r.host.querySelector("input")?.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ").some((id) => document.getElementById(id)?.textContent?.includes("STRING(1000)"))).toBe(
      true
    );
  });

  it("label 을 적으면 그대로(explicit), captionPriority=mdm 이면 MDM 캡션", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    r = renderWithMantine(
      createElement(MdmMetaProvider, { module: "mls" }, createElement(FormGroup, { name: "title", label: "화면 제목" }, input()))
    );
    await wait();
    expect(labelText()).toBe("화면 제목");
    r.unmount();
    r = renderWithMantine(
      createElement(
        MdmMetaProvider,
        { module: "mls", captionPriority: "mdm" },
        createElement(FormGroup, { name: "title", label: "화면 제목" }, input())
      )
    );
    await wait();
    expect(labelText()).toBe("공지제목");
  });

  it("tip 을 주면 MDM 카드보다 tip 이 이긴다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    r = renderWithMantine(
      createElement(MdmMetaProvider, { module: "mls" }, createElement(FormGroup, { name: "title", tip: "화면 도움말" }, input()))
    );
    await wait();
    act(() => r!.host.querySelector("input")?.focus());
    expect(document.querySelector(".form-tip-text--portal")?.textContent).toBe("화면 도움말");
  });

  it("meta={false} 면 부르지 않는다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    r = renderWithMantine(
      createElement(MdmMetaProvider, { module: "mls" }, createElement(FormGroup, { name: "title", label: "제목", meta: false }, input()))
    );
    await wait();
    expect(f.calls).toHaveLength(0);
  });
});
