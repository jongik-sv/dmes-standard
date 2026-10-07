/** @vitest-environment happy-dom */
/**
 * 진입점마다 따로 묶이는 dist 에서도 위젯 묶음(widget.js)의 WidgetFrame 경계가 layout 묶음(layout.js)의 ContentBody 에 닿는지 확인한다.
 * context 가 묶음마다 따로 생기면 경계가 소용없다(공지 카드가 위젯 관리 미리보기에서 다시 nested 로 판정됨).
 * dist 가 없으면(빌드 전) 건너뛴다 — shared 를 빌드한 뒤 돌린다.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/portal-shell/use-current-user-id", () => ({ useCurrentUserId: () => "u1" }));

import { renderWithMantine } from "./mantine-test-utils";

const dist = resolve(__dirname, "../../dist");
const built = existsSync(resolve(dist, "widget.js")) && existsSync(resolve(dist, "layout.js"));

describe.skipIf(!built)("LayoutContextBoundary — dist 묶음 사이", () => {
  it("widget 묶음의 WidgetFrame 안 layout 묶음 ContentBody 는 바깥 resizable 패널 안에서도 nested 가 아니다", async () => {
    const { WidgetFrame } = await import(/* @vite-ignore */ resolve(dist, "widget.js"));
    const { ContentBody, ContentPanel } = await import(/* @vite-ignore */ resolve(dist, "layout.js"));
    const Body = () => h(ContentBody, null, h("p", null, "본문"));
    const item = { instId: "i1", widgetId: "t.a", x: 0, y: 0, w: 6, h: 6, locked: false, config: null };
    const entry = { meta: { id: "t.a", title: "샘플", defaultSize: { w: 6, h: 6 } }, load: async () => ({ default: Body }) };
    const noop = () => {};
    const frame = h(WidgetFrame, { item, entry, editing: false, onToggleLock: noop, onRemove: noop });
    const r = renderWithMantine(h(ContentBody, { root: true, resizable: true }, h(ContentPanel, { key: "a", width: "35%" }, frame), h(ContentPanel, { key: "b" }, "B")));
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    const inner = document.querySelector<HTMLElement>(".cm-widget__body .content-body")!;
    expect(inner).not.toBeNull();
    expect(inner.classList.contains("content-body--nested")).toBe(false);
    expect(inner.style.flex).toBe("");
    r.unmount();
  });
});
