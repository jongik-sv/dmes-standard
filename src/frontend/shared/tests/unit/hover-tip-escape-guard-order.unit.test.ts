/** @vitest-environment happy-dom */
/**
 * 모달 Escape 보호의 등록 순서(재검토 3 n1) — 포털은 루트 레이아웃(ui-provider·message-provider)과 portal-shell 의 모달을 첫 화면 청크보다 먼저
 * 마운트한다. 가드(window 캡처 keydown 리스너)가 그 모달의 Mantine 리스너보다 먼저 등록되도록 shared Modal 모듈도 가드를 설치한다.
 * 이 파일은 useHoverTip·FormGroup·mdm-meta 를 정적으로 읽지 않는다 — 모달을 먼저 마운트한 뒤 카드 모듈을 처음 동적으로 읽는다.
 */
import { act, createElement, useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "../../src/components/modal";
import { renderWithMantine } from "./mantine-test-utils";

const GUARD_KEY = "__dkOasisHoverTipEscapeGuard";
const USE_HOVER_TIP = "../../src/components/form/useHoverTip";

describe("모달을 먼저 마운트한 뒤 카드 모듈을 처음 읽어도", () => {
  it("shared Modal 모듈을 읽는 것만으로 가드가 설치된다", () => {
    expect((globalThis as Record<string, unknown>)[GUARD_KEY]).toBeDefined();
  });

  it("카드가 열린 채 누른 Escape 는 카드만 닫고 모달은 남긴다", async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      queueMicrotask(() => act(() => cb(0)));
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const onClose = vi.fn();
    let setBody: (n: ReactNode) => void = () => undefined;
    function Host() {
      const [body, sb] = useState<ReactNode>(null);
      setBody = sb;
      return createElement(Modal, { open: true, title: "등록", onClose }, body);
    }
    const r = renderWithMantine(createElement(Host));
    await act(async () => {
      await new Promise((res) => setTimeout(res, 60));
    });

    // 모달(과 그 Mantine window 캡처 리스너)이 이미 마운트된 뒤 카드 모듈을 처음 읽는다.
    vi.resetModules();
    const mod = (await import(
      USE_HOVER_TIP
    )) as typeof import("../../src/components/form/useHoverTip");
    function Card() {
      const tip = mod.useHoverTip<HTMLSpanElement>(false, { interactive: true });
      return createElement(
        "span",
        null,
        createElement(
          "span",
          { ref: tip.anchorRef, "data-testid": "trigger", onMouseEnter: tip.showTip },
          "라벨"
        ),
        createElement(mod.HoverTipPortal, { tipPos: tip.tipPos, box: tip.box }, "카드")
      );
    }
    act(() => setBody(createElement(Card)));
    const trigger = document.querySelector('[data-testid="trigger"]')!;
    act(() => {
      trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: null }));
    });
    expect(document.querySelector(".form-tip-text--portal")).not.toBeNull();
    act(() => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });
    expect(document.querySelector(".form-tip-text--portal")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    r.unmount();
    vi.unstubAllGlobals();
  });
});
