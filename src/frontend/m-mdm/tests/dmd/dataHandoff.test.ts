/** @vitest-environment happy-dom */

// TSK-07-02 design.md D7 — dataMng 등록 → dataEdit 탭 인계. sessionStorage 왕복 + window 커스텀 이벤트.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DATA_EDIT_SELECT_EVENT,
  broadcastDataEditTarget,
  consumeDataEditTarget,
  stashDataEditTarget,
} from "../../pages/dmd/dataHandoff";

describe("dataHandoff", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("stash 뒤 consume 은 그 ID 를 한 번 돌려주고 지운다", () => {
    stashDataEditTarget("SHIPY");
    expect(consumeDataEditTarget()).toBe("SHIPY");
    expect(consumeDataEditTarget()).toBeNull();
  });

  it("비어 있는 상태에서 consume 은 null 이다", () => {
    expect(consumeDataEditTarget()).toBeNull();
  });

  it("broadcastDataEditTarget 은 DATA_EDIT_SELECT_EVENT 를 maruDataId 와 함께 낸다", () => {
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(DATA_EDIT_SELECT_EVENT, listener);
    broadcastDataEditTarget("SHIPY");
    window.removeEventListener(DATA_EDIT_SELECT_EVENT, listener);
    expect(seen).toEqual([{ maruDataId: "SHIPY" }]);
  });

  it("sessionStorage 접근이 실패해도 stash·consume 은 던지지 않는다", () => {
    const getSpy = vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("사생활 보호 모드");
    });

    expect(() => stashDataEditTarget("SHIPY")).not.toThrow();
    expect(consumeDataEditTarget()).toBeNull();

    getSpy.mockRestore();
  });
});
