/** @vitest-environment happy-dom */
/**
 * MdmFieldLabel — th·라벨 자리에 넣는 인라인 라벨(spec 2026-10-03-mdm-screen-meta-validation §2 B1·B2·B3·B6·B8, §4).
 *  - 공급자 밖이거나 메타가 없으면 `label ?? name` 글자 그대로(DOM 이 단순 텍스트와 같다), 툴팁·요청 없음.
 *  - 캡션 우선순위: 적은 label 이 이긴다(explicit), captionPriority="mdm" 이면 MDM 이 이긴다. kind 로 그리드·폼 캡션 칸을 고른다.
 *  - 공급자 안에서 사전에 없거나(meta=false 포함) 오류면 라벨 글자 + 흐린 글자 name 툴팁을 띄운다(받는 중에는 단순 텍스트).
 *  - 메타가 있으면 hover·focus 때 FormGroup 과 같은 포털 툴팁(.form-tip-text--portal)에 MdmMetaCard 를 띄우고, 스크린리더 설명은 aria-describedby 로 잇는다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MdmFieldLabel, MdmMetaProvider, resetMdmMetaStore, type MdmFieldLabelProps } from "../../src/mdm-meta";
import { TEXT_DOMAIN, TITLE, fakeMetaFetch, settle } from "./mdm-meta-fixtures";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  resetMdmMetaStore();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

async function show(el: ReactNode) {
  await act(async () => root!.render(el));
  await act(async () => {
    await settle(60);
  });
  await act(async () => {
    await settle(60);
  });
}

const label = (props: MdmFieldLabelProps) => createElement(MdmFieldLabel, props);
/** th 안에 둔다 — 이 부품의 실제 자리. */
const inTh = (props: MdmFieldLabelProps) =>
  createElement("table", null, createElement("tbody", null, createElement("tr", null, createElement("th", null, label(props)))));
const inProvider = (child: ReactNode, priority?: "explicit" | "mdm") =>
  createElement(MdmMetaProvider, { module: "mls", captionPriority: priority }, child);

const th = () => host.querySelector("th") as HTMLElement;
const trigger = () => host.querySelector(".form-tip-trigger") as HTMLElement | null;
const portal = () => document.querySelector(".form-tip-text--portal") as HTMLElement | null;

function rect(over: Partial<DOMRect>): DOMRect {
  return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...over } as DOMRect;
}
function placeTrigger(box: Partial<DOMRect>, innerWidth = 1024) {
  vi.stubGlobal("innerWidth", innerWidth);
  trigger()!.getBoundingClientRect = () => rect(box);
}
function hover(on: boolean) {
  act(() => {
    trigger()!.dispatchEvent(new MouseEvent(on ? "mouseover" : "mouseout", { bubbles: true, relatedTarget: null }));
  });
}

describe("공급자 밖 — 단순 텍스트와 같다", () => {
  it("label 을 적으면 그 글자 그대로이고 요청·툴팁이 없다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    await show(inTh({ name: "TITLE", label: "제목" }));
    expect(th().innerHTML).toBe("제목");
    expect(trigger()).toBeNull();
    expect(portal()).toBeNull();
    expect(f.calls).toHaveLength(0);
  });

  it("required 는 라벨 뒤에 ' *' 를 붙인다", async () => {
    await show(inTh({ name: "TITLE", label: "제목", required: true }));
    expect(th().innerHTML).toBe("제목 *");
  });

  it("label 을 비우면 name 이 그대로 보인다", async () => {
    await show(inTh({ name: "noticeTitle" }));
    expect(th().textContent).toBe("noticeTitle");
  });

  it("className·style 을 주면 그 값을 가진 span 으로 감싼다(툴팁은 없다)", async () => {
    await show(inTh({ name: "TITLE", label: "제목", className: "my-label", style: { color: "red" } }));
    const span = th().querySelector("span.my-label") as HTMLElement;
    expect(span.textContent).toBe("제목");
    expect(span.style.color).toBe("red");
    expect(span.classList.contains("form-tip-trigger")).toBe(false);
  });
});

describe("공급자 안 — 캡션 우선순위(B1·B2)", () => {
  it("label 을 적으면 적은 값이 이긴다(기본 explicit)", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE } }).fn);
    await show(inProvider(inTh({ name: "TITLE", label: "화면 제목" })));
    expect(th().textContent).toBe("화면 제목");
  });

  it("label 을 비우면 MDM 폼 캡션(labelMid)", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE } }).fn);
    await show(inProvider(inTh({ name: "TITLE" })));
    expect(th().textContent).toBe("공지제목");
  });

  it('captionPriority="mdm" 이면 MDM 캡션이 적은 label 을 이긴다', async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE } }).fn);
    await show(inProvider(inTh({ name: "TITLE", label: "화면 제목" }), "mdm"));
    expect(th().textContent).toBe("공지제목");
  });

  it('kind="grid" 이면 그리드 캡션 칸(labelShort)을 쓴다', async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE } }).fn);
    await show(inProvider(inTh({ name: "TITLE", kind: "grid" })));
    expect(th().textContent).toBe("제목");
  });

  it("required 는 MDM 캡션 뒤에도 ' *' 이고 글자 노드는 하나다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE } }).fn);
    await show(inProvider(inTh({ name: "TITLE", required: true })));
    expect(th().textContent).toBe("공지제목 *");
    expect(trigger()!.childNodes).toHaveLength(1);
  });

  it("메타 연결 키: camelCase name 은 물리명으로, meta 문자열은 name 을 이긴다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    await show(inProvider(inTh({ name: "title" })));
    expect(f.calls[0].body).toEqual({ names: ["TITLE"] });
    expect(th().textContent).toBe("공지제목");
    act(() => root?.unmount());
    resetMdmMetaStore();
    root = createRoot(host);
    const g = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", g.fn);
    await show(inProvider(inTh({ name: "화면키", meta: "TITLE" })));
    expect(g.calls[0].body).toEqual({ names: ["TITLE"] });
    expect(th().textContent).toBe("공지제목");
  });
});

describe("공급자 안 — 메타가 없을 때(글자 툴팁)", () => {
  /** 트리거에 마우스를 올려 연 글자 툴팁 상자. */
  function openTip() {
    placeTrigger({ left: 100, top: 400, bottom: 420 });
    hover(true);
    return portal();
  }

  it("사전에 없으면(missing) 글자는 label 이고 둘째 줄에 흐린 글자 name 을 띄운다(스크린리더 사본은 없다)", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: {} }).fn);
    await show(inProvider(inTh({ name: "noticeTitle", label: "공지 제목", required: true }), "mdm"));
    expect(th().textContent).toBe("공지 제목 *");
    expect(trigger()).not.toBeNull();
    expect(trigger()!.hasAttribute("aria-describedby")).toBe(false);
    expect(document.querySelector(".form-sr-only")).toBeNull();
    expect(portal()).toBeNull(); // 올리기 전에는 상자가 없다
    const tip = openTip()!;
    expect(tip.className).toBe("form-tip-text form-tip-text--portal");
    expect(tip.firstChild?.textContent).toBe("공지 제목"); // 별표 없는 라벨 글자
    expect(tip.querySelector("span")?.textContent).toBe("noticeTitle");
    hover(false);
    expect(portal()).toBeNull();
  });

  it("name 이 라벨 글자와 같으면 라벨만 띄운다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: {} }).fn);
    await show(inProvider(inTh({ name: "TITLE" })));
    const tip = openTip()!;
    expect(tip.textContent).toBe("TITLE");
    expect(tip.querySelector("span")).toBeNull();
  });

  it("MDM 이 오류(HTTP 500)여도 글자 툴팁은 뜬다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ status: 500 }).fn);
    await show(inProvider(inTh({ name: "TITLE" })));
    expect(th().textContent).toBe("TITLE");
    expect(openTip()!.textContent).toBe("TITLE");
  });

  it("meta={false} 면 부르지 않고 글자 툴팁만 뜬다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    await show(inProvider(inTh({ name: "noticeTitle", label: "제목", meta: false }), "mdm"));
    expect(th().textContent).toBe("제목");
    expect(f.calls).toHaveLength(0);
    const tip = openTip()!;
    expect(tip.firstChild?.textContent).toBe("제목");
    expect(tip.querySelector("span")?.textContent).toBe("noticeTitle");
  });

  it("공급자가 꺼져 있으면(disabled — 위젯 편집기 등) 공급자 밖과 같다: 요청·툴팁 없이 단순 텍스트", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    await show(createElement(MdmMetaProvider, { module: "mls", disabled: true }, inTh({ name: "noticeTitle", label: "공지 제목" })));
    expect(th().innerHTML).toBe("공지 제목");
    expect(trigger()).toBeNull();
    expect(f.calls).toHaveLength(0);
  });

  it("받는 중(loading)에는 단순 텍스트로 두어 카드로 바뀔 때 깜박이지 않는다", async () => {
    vi.stubGlobal("fetch", () => new Promise(() => {})); // 끝나지 않는 요청
    await act(async () => root!.render(inProvider(inTh({ name: "TITLE", label: "제목" }))));
    expect(th().innerHTML).toBe("제목");
    expect(trigger()).toBeNull();
  });
});

describe("공급자 안 — 툴팁(B3·B8)", () => {
  async function loaded(priority?: "explicit" | "mdm") {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE }, domains: { D_TEXT: TEXT_DOMAIN } }).fn);
    await show(inProvider(inTh({ name: "TITLE", required: true }), priority));
  }

  it("메타가 있으면 라벨 글자가 툴팁 트리거(form-tip-trigger)가 된다 — Tab 순서에는 들지 않는다(tabIndex -1, 입력 Tab 흐름 유지)", async () => {
    await loaded();
    const t = trigger()!;
    expect(t.tagName).toBe("SPAN");
    expect(t.getAttribute("tabindex")).toBe("-1");
    expect(portal()).toBeNull(); // 올리기 전에는 뜨지 않는다
  });

  it("마우스를 올리면 body 에 MdmMetaCard 포털이 뜨고, 내리면 사라진다", async () => {
    await loaded();
    placeTrigger({ left: 100, top: 400, bottom: 420 });
    hover(true);
    const p = portal()!;
    expect(p.parentElement).toBe(document.body);
    expect(p.querySelector('[data-mdm-section="title"]')?.textContent).toContain("공지 제목");
    expect(p.querySelector('[data-mdm-section="format"]')?.textContent).toContain("STRING(1000)");
    expect(p.querySelector('[data-mdm-section="domain"]')?.textContent).toContain("텍스트");
    expect(host.contains(p)).toBe(false);
    hover(false);
    expect(portal()).toBeNull();
  });

  it("focus 가 들어오면 같은 툴팁이 뜨고 blur 하면 닫힌다", async () => {
    await loaded();
    placeTrigger({ left: 100, top: 400, bottom: 420 });
    act(() => trigger()!.focus());
    expect(portal()?.querySelector(".mdm-meta-card")).not.toBeNull();
    act(() => trigger()!.blur());
    expect(portal()).toBeNull();
  });

  it("위치는 FormGroup 과 같은 규칙 — 트리거 왼쪽 위(translateY(-100%)), 위쪽이 모자라면 아래, 오른쪽 끝은 안으로 당긴다", async () => {
    await loaded();
    placeTrigger({ left: 100, top: 400, bottom: 420 });
    hover(true);
    expect(portal()!.style.left).toBe("100px");
    expect(portal()!.style.top).toBe("394px");
    expect(portal()!.style.transform).toBe("translateY(-100%)");
    expect(portal()!.style.position).toBe("fixed");
    hover(false);
    placeTrigger({ left: 100, top: 100, bottom: 120 }); // 노드 tip 은 위쪽 200px+8 필요
    hover(true);
    expect(portal()!.style.top).toBe("126px");
    expect(portal()!.style.transform).toBe("");
    hover(false);
    placeTrigger({ left: 900, top: 400, bottom: 420 }, 1000);
    hover(true);
    expect(portal()!.style.left).toBe("672px");
  });

  it("툴팁 상자는 FormGroup 과 같은 클래스(.form-tip-text)다", async () => {
    await loaded();
    placeTrigger({ left: 100, top: 400, bottom: 420 });
    hover(true);
    expect(portal()!.className).toBe("form-tip-text form-tip-text--portal");
  });

  it("스크린리더 설명: aria-describedby 가 가리키는 요소가 카드 내용을 갖고, th 의 글자·접근 이름을 늘리지 않는다", async () => {
    await loaded();
    const ids = (trigger()!.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    expect(ids).toHaveLength(1);
    const desc = document.getElementById(ids[0])!;
    expect(desc.className).toBe("form-sr-only");
    expect(desc.textContent).toContain("STRING(1000)");
    expect(th().contains(desc)).toBe(false);
    expect(th().textContent).toBe("공지제목 *");
  });

  it("툴팁이 닫혀 있어도 설명 요소는 남고, 언마운트하면 body 에서 사라진다", async () => {
    await loaded();
    const id = trigger()!.getAttribute("aria-describedby")!;
    expect(document.getElementById(id)).not.toBeNull();
    act(() => root?.unmount());
    root = createRoot(host);
    expect(document.getElementById(id)).toBeNull();
  });

  it("같은 화면의 라벨 여럿은 서로 다른 설명 id 를 쓴다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE } }).fn);
    await show(
      inProvider(
        createElement(
          "div",
          null,
          label({ name: "TITLE", kind: "grid" }),
          label({ name: "TITLE", kind: "form" })
        )
      )
    );
    const ids = [...host.querySelectorAll(".form-tip-trigger")].map((el) => el.getAttribute("aria-describedby"));
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("className·style 은 트리거 span 에 붙는다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE } }).fn);
    await show(inProvider(inTh({ name: "TITLE", className: "my-label", style: { fontWeight: 700 } })));
    const t = trigger()!;
    expect(t.classList.contains("my-label")).toBe(true);
    expect(t.style.fontWeight).toBe("700");
  });

  it("카드 폭: 툴팁 상자는 body 아래 position:fixed 라 폭 0 감싸개(ag-grid .ag-tooltip-custom 사고, 02fd9586)에 갇히지 않고, form.css 가 폭을 220~320px 로 둔다", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/form/form.css"), "utf8");
    const box = /\.form-tip-text\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(box).toMatch(/min-width:\s*220px/);
    expect(box).toMatch(/max-width:\s*320px/);
    expect(box).not.toMatch(/(^|[;\s])width:/); // 고정 폭을 두지 않는다 — 내용 폭(shrink-to-fit)
  });
});
