/**
 * FloatingPanel 순수 함수(floating-panel-model.ts) 시험 — 저장값 파싱·검증, 화면 안으로 자르기, 최소 크기, 기본 위치.
 * 컴포넌트(포털·끌기)는 브라우저가 필요해 여기서 다루지 않는다.
 */
import { describe, expect, it } from "vitest";

import {
  FLOATING_PANEL_DEFAULT_SIZE,
  clampPanelRect,
  defaultPanelRect,
  floatingPanelStorageKey,
  parsePanelState,
  resolveInitialPanelState,
  serializePanelState,
} from "../../src/components/floating-panel/floating-panel-model";

const MIN = { minWidth: 240, minHeight: 160 };
const VP = { width: 1280, height: 800 };

describe("floatingPanelStorageKey", () => {
  it("dmes:floating-panel: 접두어 뒤에 호출자 키를 붙인다", () => {
    expect(floatingPanelStorageKey("logviewer-services")).toBe("dmes:floating-panel:logviewer-services");
  });
});

describe("parsePanelState", () => {
  it("정상 값을 읽는다(collapsed 없으면 펼침)", () => {
    expect(parsePanelState('{"x":10,"y":20,"width":300,"height":200}')).toEqual({
      x: 10, y: 20, width: 300, height: 200, collapsed: false,
    });
    expect(parsePanelState('{"x":0,"y":0,"width":300,"height":200,"collapsed":true}')?.collapsed).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["빈 문자열", ""],
    ["JSON 아님", "{깨짐"],
    ["배열", "[1,2,3,4]"],
    ["null 리터럴", "null"],
    ["숫자 하나", "42"],
    ["필드 누락", '{"x":1,"y":2,"width":300}'],
    ["문자열 숫자", '{"x":"1","y":2,"width":300,"height":200}'],
    ["NaN 은 JSON 에서 null", '{"x":null,"y":2,"width":300,"height":200}'],
    ["너비 0", '{"x":1,"y":2,"width":0,"height":200}'],
    ["높이 음수", '{"x":1,"y":2,"width":300,"height":-5}'],
    ["collapsed 가 boolean 아님", '{"x":1,"y":2,"width":300,"height":200,"collapsed":"yes"}'],
  ])("깨진 값(%s)은 null", (_label, raw) => {
    expect(parsePanelState(raw as string | null | undefined)).toBeNull();
  });

  it("serialize → parse 왕복(반올림)", () => {
    const raw = serializePanelState({ x: 10.4, y: 20.6, width: 300.2, height: 200.7, collapsed: true });
    expect(parsePanelState(raw)).toEqual({ x: 10, y: 21, width: 300, height: 201, collapsed: true });
  });
});

describe("clampPanelRect", () => {
  it("화면 안이면 그대로", () => {
    const r = { x: 100, y: 100, width: 400, height: 300 };
    expect(clampPanelRect(r, VP, MIN)).toEqual(r);
  });

  it("오른쪽·아래로 넘으면 창 전체가 들어오게 당긴다", () => {
    expect(clampPanelRect({ x: 1200, y: 780, width: 400, height: 300 }, VP, MIN)).toEqual({
      x: 880, y: 500, width: 400, height: 300,
    });
  });

  it("음수 위치는 0", () => {
    expect(clampPanelRect({ x: -50, y: -10, width: 400, height: 300 }, VP, MIN)).toMatchObject({ x: 0, y: 0 });
  });

  it("정확히 경계에 맞닿는 창은 그대로", () => {
    const r = { x: 880, y: 500, width: 400, height: 300 };
    expect(clampPanelRect(r, VP, MIN)).toEqual(r);
  });

  it("화면보다 큰 저장값은 화면 크기로 줄이고 (0,0)", () => {
    expect(clampPanelRect({ x: 300, y: 300, width: 5000, height: 4000 }, VP, MIN)).toEqual({
      x: 0, y: 0, width: 1280, height: 800,
    });
  });

  it("최소 크기보다 작으면 최소 크기로 키운다", () => {
    expect(clampPanelRect({ x: 10, y: 10, width: 50, height: 20 }, VP, MIN)).toMatchObject({
      width: 240, height: 160,
    });
  });

  it("화면이 최소 크기보다 작으면 화면 크기가 상한이다", () => {
    expect(clampPanelRect({ x: 50, y: 50, width: 400, height: 300 }, { width: 200, height: 120 }, MIN)).toEqual({
      x: 0, y: 0, width: 200, height: 120,
    });
  });

  it("화면 크기를 모르면(0×0) 자르지 않고 음수·0 만 보정한다", () => {
    expect(clampPanelRect({ x: -5, y: 40, width: 400, height: 300 }, { width: 0, height: 0 }, MIN)).toEqual({
      x: 0, y: 40, width: 400, height: 300,
    });
  });

  it("숫자가 아닌 값은 0·최소 크기로 대체한다", () => {
    const bad = { x: Number.NaN, y: Number.POSITIVE_INFINITY, width: Number.NaN, height: Number.NaN };
    expect(clampPanelRect(bad, VP, MIN)).toEqual({ x: 0, y: 0, width: 240, height: 160 });
  });

  it("소수는 반올림한다", () => {
    expect(clampPanelRect({ x: 10.5, y: 20.4, width: 300.5, height: 200.2 }, VP, MIN)).toEqual({
      x: 11, y: 20, width: 301, height: 200,
    });
  });
});

describe("defaultPanelRect", () => {
  it("defaultRect 가 없으면 기본 크기를 화면 오른쪽 위에 놓는다", () => {
    const r = defaultPanelRect(VP);
    expect(r.width).toBe(FLOATING_PANEL_DEFAULT_SIZE.width);
    expect(r.height).toBe(FLOATING_PANEL_DEFAULT_SIZE.height);
    expect(r.x + r.width).toBeLessThan(VP.width);
    expect(r.x).toBe(VP.width - r.width - 24);
    expect(r.y).toBe(72);
  });

  it("좁은 화면에서도 x 는 음수가 되지 않는다", () => {
    expect(defaultPanelRect({ width: 300, height: 600 }).x).toBe(0);
  });

  it("일부만 준 defaultRect 는 나머지를 기본값으로 채운다", () => {
    expect(defaultPanelRect(VP, { x: 40, y: 50 })).toEqual({ x: 40, y: 50, width: 480, height: 360 });
    expect(defaultPanelRect(VP, { width: 600 }).width).toBe(600);
  });
});

describe("resolveInitialPanelState", () => {
  it("저장값이 없거나 깨졌으면 기본 위치(펼침)", () => {
    const a = resolveInitialPanelState(null, VP, MIN);
    const b = resolveInitialPanelState("{깨짐", VP, MIN);
    expect(a).toEqual(b);
    expect(a.collapsed).toBe(false);
    expect(a.width).toBe(480);
  });

  it("저장값을 쓰되 화면 안으로 자른다(접힘 유지)", () => {
    const raw = JSON.stringify({ x: 5000, y: 5000, width: 9000, height: 9000, collapsed: true });
    expect(resolveInitialPanelState(raw, VP, MIN)).toEqual({ x: 0, y: 0, width: 1280, height: 800, collapsed: true });
  });

  it("defaultRect 도 화면 밖이면 자른다", () => {
    expect(resolveInitialPanelState(null, VP, MIN, { x: 2000, y: 2000, width: 400, height: 300 })).toEqual({
      x: 880, y: 500, width: 400, height: 300, collapsed: false,
    });
  });
});
