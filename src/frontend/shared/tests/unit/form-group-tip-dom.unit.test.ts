/** @vitest-environment happy-dom */
/**
 * FormGroup 포털 툴팁 DOM 고정 시험 — 툴팁 로직을 `useHoverTip` 으로 뽑아 FormGroup·MdmFieldLabel 이 함께 쓰게 한 리팩터링(2026-10-03)이
 * FormGroup 의 DOM·위치 판정·동작을 한 글자도 바꾸지 않았음을 못 박는다. 기대값은 리팩터링 전 FormGroup 이 낸 DOM 그대로다.
 *  - 정적 DOM: 툴팁 없음 / 글자 tip / ReactNode tip / tip + error / MDM 카드 tip.
 *  - 포털 툴팁: hover(라벨 글자)·focus(필드) 때 body 에 붙는 마크업, 위·아래 판정과 왼쪽 가장자리 보정.
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
const norm = (html: string) => html.replace(/_r_[0-9a-z]+_|«r[0-9a-z]+»|:r[0-9a-z]+:/g, "ID");

function rect(over: Partial<DOMRect>): DOMRect {
  return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...over } as DOMRect;
}

/** 라벨 박스의 위치를 정한다(happy-dom 은 레이아웃을 계산하지 않는다). */
function placeLabel(box: Partial<DOMRect>, innerWidth = 1024) {
  vi.stubGlobal("innerWidth", innerWidth);
  const label = r!.host.querySelector("label") as HTMLElement;
  label.getBoundingClientRect = () => rect(box);
}

function hover(on: boolean) {
  const trigger = r!.host.querySelector(".form-tip-trigger") as HTMLElement;
  act(() => {
    trigger.dispatchEvent(new MouseEvent(on ? "mouseover" : "mouseout", { bubbles: true, relatedTarget: null }));
  });
}

const group = () => (r!.host.querySelector(".form-group") as HTMLElement).outerHTML;
const portal = () => document.querySelector(".form-tip-text--portal") as HTMLElement | null;

describe("FormGroup 정적 DOM(툴팁이 닫힌 상태)", () => {
  it("툴팁 없음", () => {
    r = renderWithMantine(createElement(FormGroup, { label: "제목", required: true }, input()));
    expect(norm(group())).toMatchInlineSnapshot(`"<div class="form-group"><label style="width: 120px; min-width: 120px;" class="form-group-label m_8fdc1311 mantine-InputWrapper-label" for="ID-control" id="ID-label"><span class="form-required">*</span>제목</label><div class="form-group-field"><div class="m_46b77525 mantine-InputWrapper-root mantine-TextInput-root" data-size="xs"><div style="--input-height: var(--input-height-xs); --input-fz: var(--mantine-font-size-xs);" class="m_6c018570 mantine-Input-wrapper mantine-TextInput-wrapper" data-variant="default" data-size="xs"><input class="form-input m_8fb7ebe7 mantine-Input-input mantine-TextInput-input" data-variant="default" placeholder="" aria-labelledby="ID-label" aria-invalid="false" id="ID-control" type="text" value=""></div></div></div></div>"`);
  });

  it("글자 tip", () => {
    r = renderWithMantine(createElement(FormGroup, { label: "제목", tip: "도움말" }, input()));
    expect(norm(group())).toMatchInlineSnapshot(`"<div class="form-group"><label style="width: 120px; min-width: 120px;" class="form-group-label has-tip m_8fdc1311 mantine-InputWrapper-label" for="ID-control" id="ID-label"><span class="form-tip-trigger">제목</span></label><div class="form-group-field"><div class="m_46b77525 mantine-InputWrapper-root mantine-TextInput-root" data-size="xs"><div style="--input-height: var(--input-height-xs); --input-fz: var(--mantine-font-size-xs);" class="m_6c018570 mantine-Input-wrapper mantine-TextInput-wrapper" data-variant="default" data-size="xs"><input class="form-input m_8fb7ebe7 mantine-Input-input mantine-TextInput-input" data-variant="default" placeholder="" aria-labelledby="ID-label" aria-invalid="false" aria-describedby="ID-tip" id="ID-control" type="text" value=""></div></div><span id="ID-tip" class="form-sr-only">도움말</span></div></div>"`);
  });

  it("ReactNode tip + 필수", () => {
    r = renderWithMantine(
      createElement(
        FormGroup,
        { label: "제목", required: true, tip: createElement("b", { className: "rich-tip" }, "굵은 도움말") },
        input()
      )
    );
    expect(norm(group())).toMatchInlineSnapshot(`"<div class="form-group"><label style="width: 120px; min-width: 120px;" class="form-group-label has-tip m_8fdc1311 mantine-InputWrapper-label" for="ID-control" id="ID-label"><span class="form-tip-trigger"><span class="form-required">*</span>제목</span></label><div class="form-group-field"><div class="m_46b77525 mantine-InputWrapper-root mantine-TextInput-root" data-size="xs"><div style="--input-height: var(--input-height-xs); --input-fz: var(--mantine-font-size-xs);" class="m_6c018570 mantine-Input-wrapper mantine-TextInput-wrapper" data-variant="default" data-size="xs"><input class="form-input m_8fb7ebe7 mantine-Input-input mantine-TextInput-input" data-variant="default" placeholder="" aria-labelledby="ID-label" aria-invalid="false" aria-describedby="ID-tip" id="ID-control" type="text" value=""></div></div><span id="ID-tip" class="form-sr-only"><b class="rich-tip">굵은 도움말</b></span></div></div>"`);
  });

  it("tip + error", () => {
    r = renderWithMantine(createElement(FormGroup, { label: "제목", tip: "도움말", error: "틀림" }, input()));
    expect(norm(group())).toMatchInlineSnapshot(`"<div class="form-group"><label style="width: 120px; min-width: 120px;" class="form-group-label has-tip m_8fdc1311 mantine-InputWrapper-label" for="ID-control" id="ID-label"><span class="form-tip-trigger">제목</span></label><div class="form-group-field"><div class="m_46b77525 mantine-InputWrapper-root mantine-TextInput-root" data-size="xs"><div style="--input-height: var(--input-height-xs); --input-fz: var(--mantine-font-size-xs);" class="m_6c018570 mantine-Input-wrapper mantine-TextInput-wrapper" data-variant="default" data-size="xs"><input class="form-input m_8fb7ebe7 mantine-Input-input mantine-TextInput-input" data-variant="default" placeholder="" aria-labelledby="ID-label" aria-invalid="true" aria-describedby="ID-tip ID-error" id="ID-control" type="text" value=""></div></div><span id="ID-tip" class="form-sr-only">도움말</span><span id="ID-error" class="form-error-message" role="alert">틀림</span></div></div>"`);
  });

  it("MDM 카드 tip(공급자 안, name 만)", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE }, domains: { D_TEXT: TEXT_DOMAIN } }).fn);
    r = renderWithMantine(createElement(MdmMetaProvider, { module: "mls" }, createElement(FormGroup, { name: "title" }, input())));
    await act(async () => {
      await settle(60);
    });
    await act(async () => {
      await settle(60);
    });
    expect(norm(group())).toMatchInlineSnapshot(`"<div class="form-group"><label style="width: 120px; min-width: 120px;" class="form-group-label has-tip m_8fdc1311 mantine-InputWrapper-label" for="ID-control" id="ID-label"><span class="form-tip-trigger">공지제목</span></label><div class="form-group-field"><div class="m_46b77525 mantine-InputWrapper-root mantine-TextInput-root" data-size="xs"><div style="--input-height: var(--input-height-xs); --input-fz: var(--mantine-font-size-xs);" class="m_6c018570 mantine-Input-wrapper mantine-TextInput-wrapper" data-variant="default" data-size="xs"><input class="form-input m_8fb7ebe7 mantine-Input-input mantine-TextInput-input" data-variant="default" placeholder="" aria-labelledby="ID-label" aria-invalid="false" id="ID-control" type="text" value="" aria-describedby="ID-tip"></div></div><span id="ID-tip" class="form-sr-only"><span class="mdm-meta-card" style="display: flex; flex-direction: column; gap: 4px; max-width: 360px; line-height: 1.5; text-align: left; white-space: normal; word-break: break-word;"><span data-mdm-section="title" style="display: block;"><span style="font-weight: 600;">공지 제목</span><span style="margin-left: 6px; font-family: var(--font-family-mono, monospace); opacity: 0.75;">TITLE</span></span><span data-mdm-section="description" style="display: block;"><span style="display: block;">공지사항의 제목</span></span><span data-mdm-section="format" style="display: block;"><span style="opacity: 0.75; margin-right: 4px;">형식</span>STRING(1000) · 필수</span><span data-mdm-section="domain" style="display: block;"><span style="opacity: 0.75; margin-right: 4px;">도메인</span>텍스트 (D_TEXT · TEXT)</span></span></span></div></div>"`);
  });
});

describe("FormGroup 포털 툴팁", () => {
  it("라벨 글자에 올리면 body 에 뜨고 내리면 사라진다 — 위쪽 공간이 넉넉하면 위(translateY(-100%))", () => {
    r = renderWithMantine(createElement(FormGroup, { label: "제목", tip: "도움말" }, input()));
    placeLabel({ left: 100, top: 300, bottom: 320 });
    expect(portal()).toBeNull();
    hover(true);
    expect(portal()?.outerHTML).toMatchInlineSnapshot(`"<span class="form-tip-text form-tip-text--portal" style="position: fixed; left: 100px; top: 294px; display: block; transform: translateY(-100%);">도움말</span>"`);
    expect(portal()?.parentElement).toBe(document.body);
    hover(false);
    expect(portal()).toBeNull();
  });

  it("위쪽 공간이 모자라면 라벨 아래로 뒤집는다(글자 tip 은 72px 이상 필요)", () => {
    r = renderWithMantine(createElement(FormGroup, { label: "제목", tip: "도움말" }, input()));
    placeLabel({ left: 100, top: 40, bottom: 60 });
    hover(true);
    expect(portal()?.outerHTML).toMatchInlineSnapshot(`"<span class="form-tip-text form-tip-text--portal" style="position: fixed; left: 100px; top: 66px; display: block;">도움말</span>"`);
  });

  it("글자 tip 은 위쪽 80px 이면 위, 노드 tip 은 같은 80px 이면 아래(예상 높이 72 / 200)", () => {
    r = renderWithMantine(createElement(FormGroup, { label: "제목", tip: "도움말" }, input()));
    placeLabel({ left: 100, top: 90, bottom: 110 });
    hover(true);
    expect(portal()?.style.transform).toBe("translateY(-100%)");
    r.unmount();
    r = renderWithMantine(createElement(FormGroup, { label: "제목", tip: createElement("b", null, "노드") }, input()));
    placeLabel({ left: 100, top: 90, bottom: 110 });
    hover(true);
    expect(portal()?.style.transform).toBe("");
    expect(portal()?.style.top).toBe("116px");
  });

  it("오른쪽 가장자리에서는 툴팁 최대 폭(320)+여백(8)만큼 안으로 당기고, 왼쪽 밖이면 여백(8)에 붙인다", () => {
    r = renderWithMantine(createElement(FormGroup, { label: "제목", tip: "도움말" }, input()));
    placeLabel({ left: 900, top: 300, bottom: 320 }, 1000);
    hover(true);
    expect(portal()?.style.left).toBe("672px");
    hover(false);
    placeLabel({ left: -30, top: 300, bottom: 320 }, 1000);
    hover(true);
    expect(portal()?.style.left).toBe("8px");
  });

  it("필드에 focus 가 들어오면 같은 툴팁이 뜨고 blur 하면 닫힌다", () => {
    r = renderWithMantine(createElement(FormGroup, { label: "제목", tip: "도움말" }, input()));
    placeLabel({ left: 100, top: 300, bottom: 320 });
    const el = r.host.querySelector("input") as HTMLInputElement;
    act(() => el.focus());
    expect(portal()?.outerHTML).toMatchInlineSnapshot(`"<span class="form-tip-text form-tip-text--portal" style="position: fixed; left: 100px; top: 294px; display: block; transform: translateY(-100%);">도움말</span>"`);
    act(() => el.blur());
    expect(portal()).toBeNull();
  });

  it("툴팁이 없으면(tip·MDM 모두 없음) hover·focus 해도 아무것도 뜨지 않는다", () => {
    r = renderWithMantine(createElement(FormGroup, { label: "제목" }, input()));
    act(() => (r!.host.querySelector("input") as HTMLInputElement).focus());
    expect(portal()).toBeNull();
    expect(r.host.querySelector(".form-tip-trigger")).toBeNull();
  });

  it("공급자 안에서 사전에 없는 라벨은 라벨 글자 + 흐린 글자 name 툴팁이 뜨고 필드 focus·스크린리더 설명은 없다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: {} }).fn);
    r = renderWithMantine(
      createElement(MdmMetaProvider, { module: "mls" }, createElement(FormGroup, { label: "분류", name: "category" }, input()))
    );
    await act(async () => {
      await settle(60);
    });
    await act(async () => {
      await settle(60);
    });
    expect(r.host.querySelector("label")?.className).toContain("has-tip");
    expect(r.host.querySelector(".form-sr-only")).toBeNull();
    expect(r.host.querySelector("input")?.hasAttribute("aria-describedby")).toBe(false);
    act(() => (r!.host.querySelector("input") as HTMLInputElement).focus());
    expect(portal()).toBeNull(); // 필드 focus 로는 열리지 않는다
    placeLabel({ left: 100, top: 400, bottom: 420 });
    hover(true);
    const p = portal()!;
    expect(p.firstChild?.textContent).toBe("분류");
    expect(p.querySelector("span")?.textContent).toBe("category");
    expect(p.style.transform).toBe("translateY(-100%)"); // 글자 툴팁 예상 높이(72)로 위쪽 판정
    hover(false);
    expect(portal()).toBeNull();
  });

  it("공급자가 꺼져 있으면(disabled) 툴팁 없는 라벨은 공급자 밖과 같다 — has-tip·트리거가 없다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: {} }).fn);
    r = renderWithMantine(
      createElement(MdmMetaProvider, { module: "mls", disabled: true }, createElement(FormGroup, { label: "분류", name: "category" }, input()))
    );
    await act(async () => {
      await settle(60);
    });
    expect(r.host.querySelector("label")?.className).not.toContain("has-tip");
    expect(r.host.querySelector(".form-tip-trigger")).toBeNull();
  });

  it("공급자 안에서 name 이 없는 라벨은 라벨 글자만 뜬다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: {} }).fn);
    r = renderWithMantine(createElement(MdmMetaProvider, { module: "mls" }, createElement(FormGroup, { label: "제목" }, input())));
    await act(async () => {
      await settle(60);
    });
    placeLabel({ left: 100, top: 400, bottom: 420 });
    hover(true);
    expect(portal()!.textContent).toBe("제목");
    expect(portal()!.querySelector("span")).toBeNull();
  });

  it("MDM 카드 tip 도 같은 포털(.form-tip-text--portal)에 카드를 그린다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE }, domains: { D_TEXT: TEXT_DOMAIN } }).fn);
    r = renderWithMantine(createElement(MdmMetaProvider, { module: "mls" }, createElement(FormGroup, { name: "title" }, input())));
    await act(async () => {
      await settle(60);
    });
    await act(async () => {
      await settle(60);
    });
    placeLabel({ left: 100, top: 400, bottom: 420 });
    hover(true);
    const p = portal()!;
    expect(p.style.transform).toBe("translateY(-100%)");
    expect(p.querySelector(".mdm-meta-card")).not.toBeNull();
    expect(norm(p.outerHTML)).toMatchInlineSnapshot(`"<span class="form-tip-text form-tip-text--portal" style="position: fixed; left: 100px; top: 394px; display: block; transform: translateY(-100%);"><span class="mdm-meta-card" style="display: flex; flex-direction: column; gap: 4px; max-width: 360px; line-height: 1.5; text-align: left; white-space: normal; word-break: break-word;"><span data-mdm-section="title" style="display: block;"><span style="font-weight: 600;">공지 제목</span><span style="margin-left: 6px; font-family: var(--font-family-mono, monospace); opacity: 0.75;">TITLE</span></span><span data-mdm-section="description" style="display: block;"><span style="display: block;">공지사항의 제목</span></span><span data-mdm-section="format" style="display: block;"><span style="opacity: 0.75; margin-right: 4px;">형식</span>STRING(1000) · 필수</span><span data-mdm-section="domain" style="display: block;"><span style="opacity: 0.75; margin-right: 4px;">도메인</span>텍스트 (D_TEXT · TEXT)</span></span></span>"`);
  });
});
