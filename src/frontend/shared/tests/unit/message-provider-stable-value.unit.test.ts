/** @vitest-environment happy-dom */
/**
 * MessageProvider 의 context 값은 렌더마다 새 객체가 아니어야 한다 — 모달 상태(msgState)가 바뀌어도
 * useMessage 를 쓰는 소비자(memo)가 다시 그려지지 않는다(리팩토링 2026-10 프론트 레인 1번).
 */
import { act, createElement, memo } from "react";
import { describe, expect, it } from "vitest";
import { MessageProvider, useMessage, type ShowMessageParams } from "../../src/components/message-provider";
import { renderWithMantine } from "./mantine-test-utils";

describe("MessageProvider context 값", () => {
  it("모달을 열고 닫아도 memo 소비자는 다시 그려지지 않고 showMessage 는 같은 함수다", () => {
    let renders = 0;
    let show: ((p: ShowMessageParams) => void) | null = null;
    const seen = new Set<unknown>();
    const Consumer = memo(function Consumer() {
      const ctx = useMessage();
      renders += 1;
      seen.add(ctx);
      show = ctx.showMessage;
      return null;
    });

    renderWithMantine(createElement(MessageProvider, null, createElement(Consumer)));
    expect(renders).toBe(1);

    act(() => show!({ message: "첫 메시지" }));
    act(() => show!({ message: "두 번째 메시지", alertType: "warning" }));

    expect(renders).toBe(1);
    expect(seen.size).toBe(1);
  });
});
