import { describe, expect, it } from "vitest";

import { widgetGridPersonalize } from "./widget-grid";

describe("widgetGridPersonalize — 위젯 그리드 개인화 키", () => {
  it("배치 인스턴스마다 다른 gridId 를 준다(같은 유형을 두 번 놓아도 겹치지 않는다)", () => {
    const a = widgetGridPersonalize("def.q1", "w-aaa");
    const b = widgetGridPersonalize("def.q1", "w-bbb");
    expect(a).toEqual({ gridId: "widget-w-aaa" });
    expect(b).toEqual({ gridId: "widget-w-bbb" });
    expect(a.gridId).not.toBe(b.gridId);
  });

  it("같은 인스턴스는 늘 같은 gridId 다(새로 고침해도 설정이 이어진다)", () => {
    expect(widgetGridPersonalize("def.q1", "w-aaa")).toEqual(widgetGridPersonalize("def.q1", "w-aaa"));
  });

  it("관리 화면 미리보기와 인스턴스가 없는 자리는 개인화를 끈다", () => {
    expect(widgetGridPersonalize("def.preview", "w-aaa")).toEqual({ personalize: false });
    expect(widgetGridPersonalize("def.q1", "preview")).toEqual({ personalize: false });
    expect(widgetGridPersonalize("def.q1", "")).toEqual({ personalize: false });
    expect(widgetGridPersonalize(undefined, undefined)).toEqual({ personalize: false });
  });
});
