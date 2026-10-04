/** @vitest-environment happy-dom */
import { createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 다시 마운트된 직후: 이번 인스턴스는 아직 사용자 확인 전(userId "")이지만, 같은 세션에서 이미 확인한 사용자(u1)가 있다.
vi.mock("../../src/portal-shell/use-current-user-id", () => ({ useCurrentUserId: () => "" }));
vi.mock("../../src/portal-shell/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/portal-shell/current-user")>()),
  peekCurrentUser: () => ({ id: "u1", name: null }),
}));

import { ContentBody } from "../../src/layout/ContentBody";
import { ContentPanel } from "../../src/layout/ContentPanel";
import { saveSplit } from "../../src/layout/split-sizing";
import { renderWithMantine } from "./mantine-test-utils";

const mem = new Map<string, string>();
const ls = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
if (typeof window !== "undefined") Object.defineProperty(window, "localStorage", { value: ls, configurable: true });

describe("ContentBody resizable — 다시 마운트될 때", () => {
  afterEach(() => localStorage.clear());

  it("사용자 확인을 기다리지 않고 첫 렌더부터 저장된 크기로 그린다(기본 크기로 그렸다 바뀌는 깜빡임 방지)", () => {
    saveSplit("u1", "t", { ".$r": { kind: "px", value: 520 } });
    const r = renderWithMantine(
      h(ContentBody, { root: true, resizable: true, storageKey: "t" }, [
        h(ContentPanel, { key: "l" }, "L"),
        h(ContentPanel, { key: "r", width: 400 }, "R"),
      ]),
    );
    const els = document.querySelectorAll<HTMLElement>(".content-panel");
    expect(els[1].style.flex).toBe("0 1 520px");
    r.unmount();
  });
});
