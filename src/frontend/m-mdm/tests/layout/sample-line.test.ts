// TSK-05-03 design.md §3.5 — 샘플 전문 한 줄 표시(html render() 규칙). 공백은 가운뎃점, 눈금자, 구역 색, 구간 제목.
import { describe, expect, it } from "vitest";
import { ZONE_COLORS, ruler, segmentTitle, visibleText, zoneColor, zoneKey } from "@/layout/sample-line";

describe("sample-line", () => {
  it("공백은 가운뎃점으로 보인다", () => {
    expect(visibleText("B1  ")).toBe("B1··");
    expect(visibleText("코일 A")).toBe("코일·A");
  });

  it("눈금자는 10의 배수에 십의 자리, 5의 배수에 + 를 둔다", () => {
    expect(ruler(20)).toBe("....+....1....+....2");
    expect(ruler(187)).toHaveLength(187);
    expect(ruler(110).slice(99, 110)).toBe("0....+....1");
  });

  it("구역 색은 헤더 순서·본문·FILLER 로 나뉜다", () => {
    expect(zoneKey({ ZONE: "HEADER", HEADER_SEQ: 1, FILL_KIND: "CONST" })).toBe("h1");
    expect(zoneKey({ ZONE: "HEADER", HEADER_SEQ: 2, FILL_KIND: "AUTO" })).toBe("h2");
    expect(zoneKey({ ZONE: "BODY", HEADER_SEQ: 0, FILL_KIND: "DATA" })).toBe("body");
    expect(zoneKey({ ZONE: "BODY", HEADER_SEQ: 0, FILL_KIND: "FILLER" })).toBe("filler");
    expect(zoneKey({ ZONE: "HEADER", HEADER_SEQ: 1, FILL_KIND: "FILLER" })).toBe("filler");
    expect(ZONE_COLORS).toEqual({ h1: "#dbeafe", h2: "#fef3c7", body: "#dcfce7", filler: "#e5e7eb" });
    expect(zoneColor("h1")).toBe("#dbeafe");
    expect(zoneColor("h3")).toBe("#dbeafe");
    expect(zoneColor("h4")).toBe("#fef3c7");
    expect(zoneColor("filler")).toBe("#e5e7eb");
  });

  it("구간 제목은 구역·이름·1부터 센 위치다", () => {
    expect(segmentTitle({ ZONE: "BODY", ZONE_LABEL: "본문", NAME: "코일 두께", OFFSET: 158, LENGTH: 4 })).toBe("본문 코일 두께 159-162");
    expect(segmentTitle({ ZONE: "HEADER", ZONE_LABEL: "L100", NAME: "전문타입", OFFSET: 62, LENGTH: 1 })).toBe("L100 전문타입 63");
  });
});
