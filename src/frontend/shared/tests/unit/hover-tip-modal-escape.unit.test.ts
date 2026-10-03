/** @vitest-environment happy-dom */
/**
 * 모달 안 상호작용 카드의 Escape(재검토 확인 필요 1, 2026-10-03 조정 결정) — 실제 shared Modal(Mantine 9 Modal 래퍼) 안의 FormGroup.
 *  - HTML 설명 카드가 열려 있을 때 Escape 는 카드만 닫고 모달은 열어 둔다(입력하던 등록 팝업을 잃지 않게).
 *  - 카드가 없으면 Escape 는 예전처럼 모달을 닫는다. 글자(비상호작용) 툴팁은 바뀌지 않는다.
 * Mantine Modal 은 window 캡처 단계에서 Escape 를 받고, 대상에 `data-mantine-stop-propagation="true"` 가 있으면 닫지 않는다(ModalBase/use-modal).
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const portal = () => document.querySelector<HTMLElement>(".form-tip-text--portal");
/** 실제 keydown 처럼 focus 를 가진 요소에 보낸다(Mantine 핸들러가 event.target.getAttribute 를 부른다). */
function escape() {
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
  });
}

async function openModal(onClose: () => void, name = "noticeBody") {
  vi.stubGlobal("fetch", fakeMetaFetch({ columns: { NOTICE_BODY: BODY, TITLE } }).fn);
  r = renderWithMantine(
    createElement(
      MdmMetaProvider,
      { module: "mls" },
      createElement(
        Modal,
        { open: true, title: "등록", onClose },
        createElement(
          FormGroup,
          { name },
          createElement(Input, { value: "", onChange: () => undefined })
        )
      )
    )
  );
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await settle(60);
    });
  }
}

function hoverLabel() {
  const trigger = document.querySelector<HTMLElement>(".cm-modal .form-tip-trigger")!;
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
    trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: null }));
  });
}

describe("모달 안 HTML 카드와 Escape", () => {
  it("카드가 열려 있으면 Escape 는 카드만 닫고 모달은 열어 둔다 — 다음 Escape 는 모달을 닫는다", async () => {
    const onClose = vi.fn();
    await openModal(onClose);
    hoverLabel();
    expect(portal()?.getAttribute("data-tip-interactive")).toBe("true");
    escape();
    expect(portal()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    // 카드가 닫히면 표지를 걷는다 — 다음 Escape 는 예전처럼 모달을 닫는다.
    expect(document.querySelector("[data-mantine-stop-propagation]")).toBeNull();
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("카드 안 링크에 focus 가 있어도 Escape 는 카드만 닫는다", async () => {
    const onClose = vi.fn();
    await openModal(onClose);
    hoverLabel();
    const link = portal()!.querySelector("a")!;
    act(() => link.focus());
    escape();
    expect(portal()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("카드가 없으면 Escape 는 모달을 닫는다(예전 동작)", async () => {
    const onClose = vi.fn();
    await openModal(onClose);
    expect(portal()).toBeNull();
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("글자(비상호작용) 카드는 예전과 같다 — 열려 있어도 Escape 는 모달을 닫는다", async () => {
    const onClose = vi.fn();
    await openModal(onClose, "title");
    hoverLabel();
    expect(portal()).not.toBeNull();
    expect(portal()!.hasAttribute("data-tip-interactive")).toBe(false);
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
