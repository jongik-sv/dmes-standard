/** @vitest-environment happy-dom */
/**
 * 모달 안 상호작용 카드의 Escape(재검토 확인 필요 1 → 재검토 2 I1·m1, 2026-10-03 조정 결정) — 실제 shared Modal(Mantine 9 Modal 래퍼) 안.
 *  - HTML 설명 카드가 열려 있을 때 누른 Escape 는 카드만 닫고 모달은 열어 둔다(입력하던 등록 팝업을 잃지 않게). 다음 Escape 는 모달을 닫는다.
 *  - Mantine Modal 은 window 캡처 단계에서 Escape 를 받고, 대상에 `data-mantine-stop-propagation="true"` 가 있으면 닫지 않는다(ModalBase/use-modal).
 *    useHoverTip 은 모듈을 읽을 때 window 캡처 keydown 리스너를 한 번 달아(모달 효과보다 먼저), 열린 카드가 있을 때 누른 Escape 의 대상에만
 *    그 순간 표지를 달고 이벤트가 끝나면 자기가 단 것만 걷는다. 그래서 focus 위치(body 포함)·React 가 관리하는 Combobox 표지와 상관없이 맞다.
 *  - 카드가 없거나 글자(비상호작용) 카드면 Escape 는 예전처럼 모달을 닫는다.
 */
import { act, createElement, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComboBox } from "../../src/components/form/ComboBox";
import { FormGroup } from "../../src/components/form/FormGroup";
import { Input } from "../../src/components/form/Input";
import { Modal } from "../../src/components/modal";
import { MdmMetaProvider, resetMdmMetaStore } from "../../src/mdm-meta";
import { TITLE, column, fakeMetaFetch, settle } from "./mdm-meta-fixtures";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

const BODY = column("NOTICE_BODY", {
  columnName: "본문",
  labelMid: "본문",
  description: "굵은 설명 링크",
  descriptionHtml: '<p><b>굵은</b> 설명 <a href="https://example.com/doc">링크</a></p>',
});
const MEMO = column("NOTICE_MEMO", {
  columnName: "메모",
  labelMid: "메모",
  description: "메모 설명",
  descriptionHtml: "<p><i>메모</i> 설명</p>",
});
const STOP = "data-mantine-stop-propagation";
const GUARD_KEY = "__dkOasisHoverTipEscapeGuard";

let r: Rendered | null = null;

beforeEach(() => {
  resetMdmMetaStore();
  // Mantine Transition 의 rAF 콜백을 React 커밋 밖으로 미룬다(modal-a11y.unit.test.ts 와 같은 하네스).
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queueMicrotask(() => act(() => cb(0)));
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  r?.unmount();
  r = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const portals = () => [...document.querySelectorAll<HTMLElement>(".form-tip-text--portal")];
const portal = () => portals()[0] ?? null;
const openCards = () =>
  (globalThis as Record<string, { open: number } | undefined>)[GUARD_KEY]?.open ?? 0;
/** 실제 keydown 처럼 focus 를 가진 요소에 보낸다(Mantine 핸들러가 event.target.getAttribute 를 부른다). */
function escape() {
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
  });
}

const input = () => createElement(Input, { value: "", onChange: () => undefined });

async function openModal(onClose: () => void, body: ReactNode) {
  vi.stubGlobal(
    "fetch",
    fakeMetaFetch({ columns: { NOTICE_BODY: BODY, NOTICE_MEMO: MEMO, TITLE } }).fn
  );
  r = renderWithMantine(
    createElement(
      MdmMetaProvider,
      { module: "mls" },
      createElement(Modal, { open: true, title: "등록", onClose }, body)
    )
  );
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await settle(60);
    });
  }
}

function triggers() {
  return [...document.querySelectorAll<HTMLElement>(".cm-modal .form-tip-trigger")];
}
function hover(trigger: HTMLElement, on = true) {
  const label = trigger.closest("label") as HTMLElement;
  label.getBoundingClientRect = () =>
    ({
      left: 100,
      top: 400,
      bottom: 420,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  act(() => {
    trigger.dispatchEvent(
      new MouseEvent(on ? "mouseover" : "mouseout", { bubbles: true, relatedTarget: null })
    );
  });
}

describe("모달 안 HTML 카드와 Escape", () => {
  it("카드가 열려 있으면 Escape 는 카드만 닫고 모달은 열어 둔다 — 다음 Escape 는 모달을 닫는다, 표지는 남지 않는다", async () => {
    const onClose = vi.fn();
    await openModal(onClose, createElement(FormGroup, { name: "noticeBody" }, input()));
    hover(triggers()[0]);
    expect(portal()?.getAttribute("data-tip-interactive")).toBe("true");
    escape();
    expect(portal()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      await settle(10);
    });
    expect(document.querySelector(`[${STOP}]`)).toBeNull();
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("(a) 카드 안 글자를 눌러 focus 가 body 로 빠진 뒤의 Escape 도 카드만 닫는다", async () => {
    const onClose = vi.fn();
    await openModal(onClose, createElement(FormGroup, { name: "noticeBody" }, input()));
    hover(triggers()[0]);
    const p = portal()!;
    act(() => {
      p.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: null }));
    });
    // 카드 안 글자(focus 를 받지 않는 요소)를 누르면 브라우저는 focus 를 body 로 옮긴다.
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(document.activeElement).toBe(document.body);
    escape();
    expect(portal()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      await settle(10);
    });
    expect(document.body.hasAttribute(STOP)).toBe(false);
  });

  it("카드 안 링크에 focus 가 있어도 Escape 는 카드만 닫는다", async () => {
    const onClose = vi.fn();
    await openModal(onClose, createElement(FormGroup, { name: "noticeBody" }, input()));
    hover(triggers()[0]);
    const link = portal()!.querySelector("a")!;
    act(() => link.focus());
    escape();
    expect(portal()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("(b) FormGroup 의 ComboBox 에서 값을 고른 뒤(React 가 Combobox 표지를 지운 뒤) 카드가 열린 채 누른 Escape 도 카드만 닫는다", async () => {
    const onClose = vi.fn();
    function Field() {
      const [v, setV] = useState("");
      return createElement(
        FormGroup,
        { name: "noticeBody" },
        createElement(ComboBox, {
          data: [
            { value: "a", label: "Apple" },
            { value: "b", label: "Banana" },
          ],
          value: v,
          onChange: (nv: string) => setV(nv),
        })
      );
    }
    await openModal(onClose, createElement(Field));
    const box = document.querySelector<HTMLInputElement>(".cm-modal input")!;
    act(() => box.focus()); // 필드 focus 로 카드가 열리고 드롭다운도 열린다
    expect(portal()?.getAttribute("data-tip-interactive")).toBe("true");
    const option = document.querySelectorAll<HTMLElement>('.cm-modal [role="option"]')[1];
    act(() => option.click());
    expect(box.value).toBe("Banana");
    expect(box.hasAttribute(STOP)).toBe(false); // 드롭다운이 닫히며 React 가 표지를 지웠다
    expect(portal()).not.toBeNull(); // focus 로 연 카드는 그대로
    escape();
    expect(portal()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("(c) 카드가 닫힌 뒤 ComboBox 드롭다운이 열린 상태의 Escape 는 드롭다운만 닫는다 — Mantine 의 표지를 지우지 않는다", async () => {
    const onClose = vi.fn();
    await openModal(
      onClose,
      createElement(
        FormGroup,
        { name: "noticeBody" },
        createElement(ComboBox, {
          data: [
            { value: "a", label: "Apple" },
            { value: "b", label: "Banana" },
          ],
          value: "",
          onChange: () => undefined,
        })
      )
    );
    const trigger = triggers()[0];
    hover(trigger); // 카드를 hover 로 연다(드롭다운은 닫혀 있다)
    expect(portal()).not.toBeNull();
    const box = document.querySelector<HTMLInputElement>(".cm-modal input")!;
    act(() => box.focus()); // 드롭다운이 열리고 Mantine 이 표지를 단다
    expect(box.getAttribute(STOP)).toBe("true");
    hover(trigger, false); // 라벨을 떠나 유예 뒤 카드가 닫힌다
    await act(async () => {
      await settle(200);
    });
    expect(portal()).toBeNull();
    expect(box.getAttribute(STOP)).toBe("true"); // 우리가 걷지 않았다
    escape();
    expect(onClose).not.toHaveBeenCalled();
    expect(box.hasAttribute(STOP)).toBe(false); // 드롭다운이 닫혔다
  });

  it("(d) 카드 두 개가 열렸다가 하나가 닫혀도 남은 카드의 보호가 유지되고, 열린 카드 수가 맞게 돌아간다", async () => {
    const onClose = vi.fn();
    await openModal(
      onClose,
      createElement(
        "div",
        null,
        createElement(FormGroup, { name: "noticeBody" }, input()),
        createElement(FormGroup, { name: "noticeMemo" }, input())
      )
    );
    const [a, b] = triggers();
    const base = openCards();
    hover(a);
    hover(a, false); // A 를 떠나 유예가 돈다
    hover(b); // 유예 안에 B 가 열린다(폼 카드는 지연 0)
    expect(portals()).toHaveLength(2);
    expect(openCards()).toBe(base + 2);
    await act(async () => {
      await settle(200);
    });
    expect(portals()).toHaveLength(1); // A 만 닫혔다
    expect(openCards()).toBe(base + 1);
    escape();
    expect(portals()).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    expect(openCards()).toBe(base);
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("카드가 없으면 Escape 는 모달을 닫는다(예전 동작)", async () => {
    const onClose = vi.fn();
    await openModal(onClose, createElement(FormGroup, { name: "noticeBody" }, input()));
    expect(portal()).toBeNull();
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("글자(비상호작용) 카드는 예전과 같다 — 열려 있어도 Escape 는 모달을 닫는다", async () => {
    const onClose = vi.fn();
    await openModal(onClose, createElement(FormGroup, { name: "title" }, input()));
    hover(triggers()[0]);
    expect(portal()).not.toBeNull();
    expect(portal()!.hasAttribute("data-tip-interactive")).toBe(false);
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
