/** @vitest-environment happy-dom */

// TSK-04-02 design.md §2 — use-debounced-effect. vi.useFakeTimers 로 디바운스 지연과 재실행 시
// 이전 요청이 abort 되는지 확인한다.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedEffect } from "../../src/hooks/use-debounced-effect";

let container: HTMLDivElement;
let root: Root | null = null;

function Probe({ value, onRun }: { value: string; onRun: (signal: AbortSignal) => void }) {
  useDebouncedEffect(
    (signal) => {
      onRun(signal);
    },
    [value],
    300,
  );
  return null;
}

async function render(value: string, onRun: (signal: AbortSignal) => void) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Probe, { value, onRun }));
  });
}

async function update(value: string, onRun: (signal: AbortSignal) => void) {
  await act(async () => {
    root!.render(createElement(Probe, { value, onRun }));
  });
}

describe("useDebouncedEffect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    vi.useRealTimers();
  });

  it("지연 시간 전에는 실행하지 않는다", async () => {
    const onRun = vi.fn();
    await render("a", onRun);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onRun).not.toHaveBeenCalled();
  });

  it("지연 시간이 지나면 실행한다", async () => {
    const onRun = vi.fn();
    await render("a", onRun);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("지연 중 값이 다시 바뀌면 이전 타이머를 취소하고 새로 디바운스한다", async () => {
    const onRun = vi.fn();
    await render("a", onRun);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    await update("b", onRun);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onRun).not.toHaveBeenCalled(); // 아직 300ms 안 지남(재시작됐으므로)
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("새 요청이 실행되면 이전 AbortController 를 abort 한다", async () => {
    let firstSignal: AbortSignal | null = null;
    const onRun = vi.fn((signal: AbortSignal) => {
      if (!firstSignal) firstSignal = signal;
    });
    await render("a", onRun);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(firstSignal!.aborted).toBe(false);

    await update("b", onRun);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(firstSignal!.aborted).toBe(true);
  });
});
