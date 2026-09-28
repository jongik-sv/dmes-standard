/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/portal-shell/use-user-button-rbac", () => ({ useUserButtonRbac: () => ({ userId: "u1" }) }));

import { ContentBody } from "../../src/layout/ContentBody";
import { ContentPanel } from "../../src/layout/ContentPanel";
import { MaxHandle } from "../../src/layout/MaxHandle";
import { computeResize, loadSplit, parseSizeSpec, saveSplit, specToFlex } from "../../src/layout/split-sizing";
import { renderWithMantine } from "./mantine-test-utils";

// happy-dom 에서 localStorage 가 노출되지 않을 수 있어 Map 기반 스텁을 전역·window 양쪽에 둔다.
const mem = new Map<string, string>();
const ls = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
if (typeof window !== "undefined") Object.defineProperty(window, "localStorage", { value: ls, configurable: true });

describe("split-sizing", () => {
  it("prop 에서 px / % / grow 규격을 읽는다", () => {
    expect(parseSizeSpec(440, undefined)).toEqual({ kind: "px", value: 440 });
    expect(parseSizeSpec("46%", undefined)).toEqual({ kind: "pct", value: 46 });
    expect(parseSizeSpec(undefined, 1.2)).toEqual({ kind: "grow", value: 1.2 });
    expect(parseSizeSpec(undefined, "2 1 0")).toEqual({ kind: "grow", value: 2 });
    expect(parseSizeSpec(undefined, undefined)).toEqual({ kind: "grow", value: 1 });
    expect(specToFlex({ kind: "px", value: 300 })).toBe("0 1 300px");
  });

  const side = (key: string, spec: ReturnType<typeof parseSizeSpec>, size: number, min = 200) => ({ key, spec, size, min });

  it("px 패널이 있으면 그 px 만 조절한다(오른쪽 px 는 막대를 왼쪽으로 끌면 커진다)", () => {
    const r = computeResize(side("a", { kind: "grow", value: 1 }, 600), side("b", { kind: "px", value: 400 }, 400), -50, 1000);
    expect(r).toEqual({ b: { kind: "px", value: 450 } });
  });

  it("% 패널은 컨테이너 대비 % 로 조절한다", () => {
    const r = computeResize(side("a", { kind: "pct", value: 40 }, 400), side("b", { kind: "grow", value: 1 }, 600), 100, 1000);
    expect(r).toEqual({ a: { kind: "pct", value: 50 } });
  });

  it("둘 다 flex 면 grow 합을 유지하며 비율을 나눈다", () => {
    const r = computeResize(side("a", { kind: "grow", value: 1 }, 500), side("b", { kind: "grow", value: 1 }, 500), 250, 1000);
    expect(r).toEqual({ a: { kind: "grow", value: 1.5 }, b: { kind: "grow", value: 0.5 } });
  });

  it("최소 크기에서 멈춘다", () => {
    const r = computeResize(side("a", { kind: "px", value: 300 }, 300), side("b", { kind: "grow", value: 1 }, 700), -500, 1000);
    expect(r).toEqual({ a: { kind: "px", value: 200 } });
  });

  it("저장값은 사용자·화면별로 읽고 잘못된 값은 버린다", () => {
    saveSplit("u1", "s", { ".0": { kind: "px", value: 300 } });
    expect(loadSplit("u1", "s")).toEqual({ ".0": { kind: "px", value: 300 } });
    expect(loadSplit("u2", "s")).toEqual({});
    localStorage.setItem("dmes:split:v1:u1:bad", JSON.stringify({ x: { kind: "px", value: "a" } }));
    expect(loadSplit("u1", "bad")).toEqual({});
  });
});

describe("ContentBody resizable", () => {
  afterEach(() => localStorage.clear());

  const panels = (extra?: unknown) => [
    h(ContentPanel, { key: "l", panelId: "l" }, h(MaxHandle, { panelId: "l" })),
    extra,
    h(ContentPanel, { key: "r", width: 400 }, "R"),
    h(ContentPanel, { key: "x" }, "X"),
  ];
  const bars = () => document.querySelectorAll(".content-split-bar").length;

  it("resizable 이 없으면 막대가 없다", () => {
    const r = renderWithMantine(h(ContentBody, { root: true }, panels()));
    expect(bars()).toBe(0);
    r.unmount();
  });

  it("레이아웃 자식 사이에만 막대를 넣고, 최대화 중에는 숨긴다", async () => {
    const r = renderWithMantine(h(ContentBody, { root: true, resizable: true }, panels(h("span", { key: "s" }, "not-panel"))));
    expect(bars()).toBe(2);
    await act(async () => (document.querySelector(".grid-max-handle") as HTMLButtonElement).click());
    expect(bars()).toBe(0);
    r.unmount();
  });

  it("저장된 크기를 복원하고 최소 크기를 건다", async () => {
    saveSplit("u1", "t", { ".$r": { kind: "px", value: 520 } });
    const r = renderWithMantine(h(ContentBody, { root: true, resizable: true, storageKey: "t" }, panels()));
    await act(async () => {});
    const els = document.querySelectorAll<HTMLElement>(".content-panel");
    expect(els[1].style.flex).toBe("0 1 520px");
    expect(els[0].style.minWidth).toBe("200px");
    r.unmount();
  });

  it("column 부모에서 height 만 준 패널은 그 높이로 고정된다", () => {
    const r = renderWithMantine(
      h(ContentBody, { direction: "column" }, h(ContentPanel, { height: 230 }, "T"), h(ContentPanel, null, "B")),
    );
    const el = document.querySelectorAll<HTMLElement>(".content-panel")[0];
    expect([el.style.flexGrow, el.style.flexBasis]).toEqual(["0", "230px"]);
    r.unmount();
  });
});
