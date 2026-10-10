import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createViewSync } from "../../../pages/dma/erdEdit/state/view-sync";
import type { ErdViewState } from "../../../pages/dma/erdEdit/types";

const view = (diagramId: string, ...selectedTables: string[]): ErdViewState => ({ diagramId, selectedTables });

describe("createViewSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("첫 값은 바로, 1초 안의 값은 모아 마지막 값 하나만 1초 뒤에 보낸다", () => {
    const sent: ErdViewState[] = [];
    const sync = createViewSync((v) => sent.push(v));
    sync.push(view("d-1"));
    sync.push(view("d-1", "t-1"));
    sync.push(view("d-1", "t-2"));
    expect(sent).toEqual([view("d-1")]);
    vi.advanceTimersByTime(999);
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([view("d-1"), view("d-1", "t-2")]);
  });

  it("마지막으로 보낸 값과 같으면 보내지 않고, forget 뒤에는 같은 값도 다시 보낸다", () => {
    const sent: ErdViewState[] = [];
    const sync = createViewSync((v) => sent.push(v));
    sync.push(view("d-1", "t-2", "t-1"));
    vi.advanceTimersByTime(2000);
    sync.push(view("d-1", "t-1", "t-2"));
    expect(sent).toHaveLength(1);
    sync.forget();
    vi.advanceTimersByTime(2000);
    sync.push(view("d-1", "t-1", "t-2"));
    expect(sent).toHaveLength(2);
  });

  it("dispose 하면 기다리던 값을 보내지 않는다", () => {
    const sent: ErdViewState[] = [];
    const sync = createViewSync((v) => sent.push(v));
    sync.push(view("d-1"));
    sync.push(view("d-2"));
    sync.dispose();
    vi.advanceTimersByTime(5000);
    expect(sent).toEqual([view("d-1")]);
  });
});
