/** @vitest-environment happy-dom */
/**
 * 상호작용 포털 툴팁(useHoverTip interactive) — HTML 설명 카드(descriptionHtml)를 띄울 때만 켠다(2026-10-03 사용자 승인).
 *  - 상자는 pointer-events:auto, 최대 폭 640px. 트리거를 떠나도 150ms 유예하고 그 사이 상자에 들어가면 유지, 상자를 나가면(유예 뒤) 닫힌다.
 *  - Escape 로 닫힌다. 일반 글 카드·글자 tip·화면이 준 tip 은 예전과 같다(떠나면 즉시 닫힘, 문서 keydown 듣지 않음).
 *  - 스크린리더용 숨은 사본은 글자 설명이다(HTML 의 링크가 보이지 않는 채 Tab 순서에 들지 않게).
 */
import { act, createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormGroup } from "../../src/components/form/FormGroup";
import { Input } from "../../src/components/form/Input";
import { HOVER_TIP_GRACE_MS } from "../../src/components/form/useHoverTip";
import { MdmFieldLabel, MdmMetaProvider, resetMdmMetaStore } from "../../src/mdm-meta";
import { TEXT_DOMAIN, TITLE, column, fakeMetaFetch, settle } from "./mdm-meta-fixtures";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;

const BODY = column("NOTICE_BODY", {
  columnName: "본문",
  labelLong: "공지 본문",
  labelMid: "본문",
  description: "굵은 설명 링크",
  descriptionHtml: '<p><b>굵은</b> 설명 <a href="https://example.com/doc">링크</a></p>',
  dataType: "STRING",
  length: 4000,
});

beforeEach(() => resetMdmMetaStore());
afterEach(() => {
  r?.unmount();
  r = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function show(el: ReactNode) {
  vi.stubGlobal(
    "fetch",
    fakeMetaFetch({ columns: { NOTICE_BODY: BODY, TITLE }, domains: { D_TEXT: TEXT_DOMAIN } }).fn
  );
  r = renderWithMantine(createElement(MdmMetaProvider, { module: "mls" }, el));
  await act(async () => {
    await settle(60);
  });
  await act(async () => {
    await settle(60);
  });
}

function rect(over: Partial<DOMRect>): DOMRect {
  return {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...over,
  } as DOMRect;
}
function place(el: HTMLElement, box: Partial<DOMRect>, innerWidth = 1024, innerHeight = 800) {
  vi.stubGlobal("innerWidth", innerWidth);
  vi.stubGlobal("innerHeight", innerHeight);
  el.getBoundingClientRect = () => rect(box);
}
const trigger = () => r!.host.querySelector(".form-tip-trigger") as HTMLElement;
const portal = () => document.querySelector(".form-tip-text--portal") as HTMLElement | null;
function enter(el: HTMLElement, on: boolean) {
  act(() => {
    el.dispatchEvent(
      new MouseEvent(on ? "mouseover" : "mouseout", { bubbles: true, relatedTarget: null })
    );
  });
}
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const escape = () =>
  act(
    () =>
      void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  );

describe("MdmFieldLabel — HTML 설명 카드는 상호작용 툴팁", () => {
  async function opened() {
    await show(createElement(MdmFieldLabel, { name: "NOTICE_BODY" }));
    place(trigger(), { left: 100, top: 400, bottom: 420 });
    vi.useFakeTimers();
    enter(trigger(), true);
    return portal()!;
  }

  it("상자는 pointer-events:auto · 최대 폭 640px 이고 카드는 HTML 을 그린다", async () => {
    const p = await opened();
    expect(p.getAttribute("data-tip-interactive")).toBe("true");
    expect(p.style.pointerEvents).toBe("auto");
    expect(p.style.maxWidth).toBe("640px");
    expect(p.querySelector('[data-mdm-html="true"] b')?.textContent).toBe("굵은");
    expect(p.querySelector("a")?.getAttribute("target")).toBe("_blank");
  });

  it(`트리거를 떠나도 ${HOVER_TIP_GRACE_MS}ms 유예 — 149ms 에는 열려 있고 151ms 에 닫힌다`, async () => {
    expect(HOVER_TIP_GRACE_MS).toBe(150);
    await opened();
    enter(trigger(), false);
    advance(149);
    expect(portal()).not.toBeNull();
    advance(2);
    expect(portal()).toBeNull();
  });

  it("유예 안에 상자로 들어가면 계속 열려 있고, 상자를 나가면 유예 뒤 닫힌다", async () => {
    const p = await opened();
    enter(trigger(), false);
    advance(100);
    enter(p, true);
    advance(5000);
    expect(portal()).toBe(p);
    enter(p, false);
    advance(149);
    expect(portal()).not.toBeNull();
    advance(2);
    expect(portal()).toBeNull();
  });

  it("상자를 나갔다가 유예 안에 트리거로 돌아오면 유지된다", async () => {
    const p = await opened();
    enter(p, true);
    enter(p, false);
    advance(100);
    enter(trigger(), true);
    advance(1000);
    expect(portal()).not.toBeNull();
  });

  it("Escape 로 바로 닫힌다(상자 안에 있어도)", async () => {
    const p = await opened();
    enter(p, true);
    escape();
    expect(portal()).toBeNull();
    // 다시 열면 상자 밖에서 시작한다 — 트리거를 떠나면 유예 뒤 닫힌다.
    enter(trigger(), true);
    enter(trigger(), false);
    advance(151);
    expect(portal()).toBeNull();
  });

  it("오른쪽 가장자리 보정은 640px 폭으로 하고, 위쪽 공간 판정은 큰 카드(60vh+120)로 한다 — 상자는 화면 안 높이로 줄인다", async () => {
    await show(createElement(MdmFieldLabel, { name: "NOTICE_BODY" }));
    place(trigger(), { left: 900, top: 400, bottom: 420 }, 1000, 800);
    enter(trigger(), true);
    const p = portal()!;
    expect(p.style.left).toBe("352px"); // 1000 - 640 - 8
    expect(p.style.transform).toBe(""); // 394 < 480+120+8 → 아래
    expect(p.style.top).toBe("426px");
    expect(p.style.maxHeight).toBe("366px"); // 800 - 426 - 8
    expect(p.style.overflowY).toBe("auto");
  });

  it("스크린리더 설명(aria-describedby)은 글자 설명이고 링크가 없다", async () => {
    await show(createElement(MdmFieldLabel, { name: "NOTICE_BODY" }));
    const id = trigger().getAttribute("aria-describedby")!;
    const sr = document.getElementById(id)!;
    expect(sr.textContent).toContain("굵은 설명 링크");
    expect(sr.querySelector("a")).toBeNull();
    expect(sr.querySelector("[data-mdm-html]")).toBeNull();
  });
});

describe("일반 글 카드는 예전과 같다", () => {
  it("MdmFieldLabel — 떠나면 즉시 닫히고 상자에 상호작용 표시·pointer-events·max-width 가 없다", async () => {
    await show(createElement(MdmFieldLabel, { name: "TITLE" }));
    place(trigger(), { left: 100, top: 400, bottom: 420 });
    enter(trigger(), true);
    const p = portal()!;
    expect(p.hasAttribute("data-tip-interactive")).toBe(false);
    expect(p.style.pointerEvents).toBe("");
    expect(p.style.maxWidth).toBe("");
    expect(p.style.maxHeight).toBe("");
    enter(trigger(), false);
    expect(portal()).toBeNull();
  });

  it("문서 keydown 을 듣지 않는다 — Escape 를 눌러도 일반 글 카드는 그대로", async () => {
    const add = vi.spyOn(document, "addEventListener");
    await show(createElement(MdmFieldLabel, { name: "TITLE" }));
    place(trigger(), { left: 100, top: 400, bottom: 420 });
    enter(trigger(), true);
    expect(add.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(0);
    escape();
    expect(portal()).not.toBeNull();
  });
});

describe("FormGroup — MDM HTML 카드일 때만 상호작용", () => {
  const input = () => createElement(Input, { value: "", onChange: () => undefined });
  const label = () => r!.host.querySelector("label") as HTMLElement;

  it("name 으로 HTML 카드를 띄우면 상호작용 툴팁이고 유예 뒤 닫힌다, 숨은 사본은 글자다", async () => {
    await show(createElement(FormGroup, { name: "noticeBody" }, input()));
    place(label(), { left: 100, top: 400, bottom: 420 });
    vi.useFakeTimers();
    enter(trigger(), true);
    const p = portal()!;
    expect(p.getAttribute("data-tip-interactive")).toBe("true");
    expect(p.style.pointerEvents).toBe("auto");
    expect(p.style.maxWidth).toBe("640px");
    expect(p.querySelector('[data-mdm-html="true"]')).not.toBeNull();
    const sr = r!.host.querySelector(".form-sr-only") as HTMLElement;
    expect(sr.querySelector("a")).toBeNull();
    expect(sr.textContent).toContain("굵은 설명 링크");
    enter(trigger(), false);
    advance(149);
    expect(portal()).not.toBeNull();
    advance(2);
    expect(portal()).toBeNull();
  });

  it("필드에서 focus 로 연 HTML 카드도 Escape 로 닫힌다", async () => {
    await show(createElement(FormGroup, { name: "noticeBody" }, input()));
    place(label(), { left: 100, top: 400, bottom: 420 });
    act(() => (r!.host.querySelector("input") as HTMLInputElement).focus());
    expect(portal()).not.toBeNull();
    escape();
    expect(portal()).toBeNull();
  });

  it("화면이 tip 을 주면 HTML 메타가 있어도 예전 툴팁(즉시 닫힘·상호작용 없음)이다", async () => {
    await show(createElement(FormGroup, { name: "noticeBody", tip: "화면 도움말" }, input()));
    place(label(), { left: 100, top: 400, bottom: 420 });
    enter(trigger(), true);
    expect(portal()!.hasAttribute("data-tip-interactive")).toBe(false);
    expect(portal()!.textContent).toBe("화면 도움말");
    enter(trigger(), false);
    expect(portal()).toBeNull();
  });
});
