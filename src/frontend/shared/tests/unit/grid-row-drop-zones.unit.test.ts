/** @vitest-environment happy-dom */

// 그리드 밖 놓을 자리(AgDataGrid rowDropZones) — 등록 시점, 다시 그려도 다시 등록하지 않음, 끈 행 전달, 해제.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGridRowDropZones } from "../../src/components/grid/useGridRowDropZones";
import type { GridRowDropZone } from "../../src/components/grid/grid-types";

type ZoneParams = {
  getContainer: () => HTMLElement;
  onDragging?: (e: unknown) => void;
  onDragLeave?: (e: unknown) => void;
  onDragStop?: (e: unknown) => void;
};

function fakeGridRef() {
  const added: ZoneParams[] = [];
  const removed: ZoneParams[] = [];
  const api = {
    addRowDropZone: vi.fn((p: ZoneParams) => added.push(p)),
    removeRowDropZone: vi.fn((p: ZoneParams) => removed.push(p)),
    isDestroyed: () => false,
  };
  return { ref: { current: { api } } as never, api, added, removed };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function Probe(props: { gridRef: never; ready: boolean; zones?: GridRowDropZone[] }) {
  useGridRowDropZones(props.gridRef, props.ready, props.zones);
  return null;
}

function render(props: { gridRef: never; ready: boolean; zones?: GridRowDropZone[] }) {
  act(() => root.render(createElement(Probe, props)));
}

describe("useGridRowDropZones", () => {
  it("그리드가 준비되기 전에는 등록하지 않는다", () => {
    const g = fakeGridRef();
    render({ gridRef: g.ref, ready: false, zones: [{ getContainer: () => null, onDrop: () => {} }] });
    expect(g.api.addRowDropZone).not.toHaveBeenCalled();
  });

  it("준비되면 자리마다 한 번 등록하고, 콜백만 바뀌어 다시 그려도 다시 등록하지 않는다", () => {
    const g = fakeGridRef();
    const first = vi.fn();
    render({ gridRef: g.ref, ready: true, zones: [{ getContainer: () => null, onDrop: first }] });
    expect(g.api.addRowDropZone).toHaveBeenCalledTimes(1);

    const second = vi.fn();
    render({ gridRef: g.ref, ready: true, zones: [{ getContainer: () => null, onDrop: second }] });
    expect(g.api.addRowDropZone).toHaveBeenCalledTimes(1);

    // 최신 콜백을 부른다 — 여러 행이면 nodes 전체의 data 를 넘긴다.
    const mouse = new MouseEvent("mouseup");
    g.added[0].onDragStop?.({ node: { data: { id: 1 } }, nodes: [{ data: { id: 1 } }, { data: { id: 2 } }], event: mouse });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }], mouse);
  });

  it("nodes 가 비면 node 한 행을 넘기고, 자리 요소가 없으면 화면에 없는 빈 요소를 준다", () => {
    const g = fakeGridRef();
    const onDrop = vi.fn();
    render({ gridRef: g.ref, ready: true, zones: [{ getContainer: () => null, onDrop }] });
    g.added[0].onDragStop?.({ node: { data: { id: 7 } }, nodes: [], event: new MouseEvent("mouseup") });
    expect(onDrop.mock.calls[0][0]).toEqual([{ id: 7 }]);
    const el = g.added[0].getContainer();
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.isConnected).toBe(false);
  });

  it("끄는 중 이동·벗어남·취소를 자리 콜백으로 전달한다", () => {
    const g = fakeGridRef();
    const zone = { getContainer: () => host, onDrop: vi.fn(), onDragging: vi.fn(), onDragLeave: vi.fn() };
    render({ gridRef: g.ref, ready: true, zones: [zone] });
    const mouse = new MouseEvent("mousemove");
    g.added[0].onDragging?.({ node: { data: { id: 3 } }, nodes: [], event: mouse });
    expect(zone.onDragging).toHaveBeenCalledWith([{ id: 3 }], mouse);
    g.added[0].onDragLeave?.({});
    expect(zone.onDragLeave).toHaveBeenCalledTimes(1);
    expect(g.added[0].getContainer()).toBe(host);
  });

  it("자리 개수가 바뀌거나 사라지면 이전 등록을 지운다", () => {
    const g = fakeGridRef();
    const z = { getContainer: () => null, onDrop: () => {} };
    render({ gridRef: g.ref, ready: true, zones: [z] });
    render({ gridRef: g.ref, ready: true, zones: [z, z] });
    expect(g.api.removeRowDropZone).toHaveBeenCalledTimes(1);
    expect(g.api.addRowDropZone).toHaveBeenCalledTimes(3);
    render({ gridRef: g.ref, ready: true, zones: undefined });
    expect(g.api.removeRowDropZone).toHaveBeenCalledTimes(3);
  });
});
