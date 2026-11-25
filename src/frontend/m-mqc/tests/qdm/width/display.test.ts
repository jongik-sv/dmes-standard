// 폭 룰 표시 설정 — 룰 ID·우선순위·순번(0 예외)·원본주의·부호, 간편판정 폭 타일(적중 없음은 0).
import { describe, expect, it } from "vitest";

import { formatResult, rowBadges, type JudgeResult } from "@/common/rule";
import { legacyNoText, widthDisplay } from "@/qdm/width/display";

import { CGL, PLTCM } from "../../common/rule/fixtures";

const judged = (status: JudgeResult["status"], qty?: string): JudgeResult => ({
  ruleId: "C10B1074",
  ver: "1",
  evalTs: "",
  status,
  hits: status === "MATCHED" ? [{ rowId: 10, seq: 1 }] : [],
  results:
    qty === undefined ? {} : { WID_SHRINK_QTY: qty, WID_MARGIN_QTY: qty },
  defaultApplied: false,
  trace: [],
  message: null,
});

describe("폭 룰 표시 설정", () => {
  it("열 구성 — 룰 ID·앞 열·업무 결과·숨김, 형식·배지", () => {
    const d = widthDisplay("shrink");
    expect(d).toMatchObject({
      keyVar: "RULE_KEY",
      leadVars: ["PRIO", "LEGACY_NO"],
      primaryVars: ["WID_SHRINK_QTY"],
      hiddenVars: ["SRC_NOTE"],
      blankValues: ["-"],
    });
    expect(widthDisplay("margin").primaryVars).toEqual(["WID_MARGIN_QTY"]);
    expect(formatResult(d, "WID_SHRINK_QTY", "2")).toBe("+2");
    expect(formatResult(d, "LEGACY_NO", "0")).toBe("0 예외");
    expect(legacyNoText("12")).toBe("12");
    expect(rowBadges(d, { SRC_NOTE: "-" }, undefined)).toEqual([]);
    expect(
      rowBadges(d, { SRC_NOTE: "원본주의 PLTCM폭범위 600~1000" }, undefined),
    ).toEqual([
      {
        label: "원본주의",
        tone: "danger",
        title: "원본주의 PLTCM폭범위 600~1000",
      },
    ]);
  });

  it("간편판정 타일 — 진입 폭 → 출측 폭, 적중 없음은 0, 폭이 없으면 안내", () => {
    const tiles = widthDisplay("shrink").judgeTiles!;
    expect(
      tiles({
        ruleId: "C10B1074",
        rule: PLTCM,
        result: judged("MATCHED", "2"),
        input: { WID: "1000" },
      }).map((t) => [t.label, t.value]),
    ).toEqual([
      ["진입 폭", "1000"],
      ["출측 폭", "998"],
    ]);
    const miss = tiles({
      ruleId: "C10B1074",
      rule: PLTCM,
      result: judged("NO_MATCH"),
      input: { WID: "1000" },
    });
    expect(miss[1]).toMatchObject({ value: "1000" });
    expect(miss[1].target).toContain("해당 룰 없음 → 0");
    expect(
      tiles({
        ruleId: "C10B1074",
        rule: PLTCM,
        result: judged("MATCHED", "2"),
        input: {},
      })[0].target,
    ).toBe("폭을 넣으면 계산합니다");
  });

  it("마진 — 주문 폭 → 제품 폭, 폭 조건이 없는 룰은 해당 없음", () => {
    const tiles = widthDisplay("margin").judgeTiles!;
    expect(
      tiles({
        ruleId: "C10B1075",
        rule: CGL,
        result: judged("MATCHED", "12"),
        input: { WID: "1200" },
      }).map((t) => [t.label, t.value]),
    ).toEqual([
      ["주문 폭", "1200"],
      ["제품 폭", "1188"],
    ]);
    const noWidth = { ...CGL, vars: CGL.vars.filter((v) => v.name !== "WID") };
    expect(
      tiles({
        ruleId: "QD_X",
        rule: noWidth,
        result: judged("MATCHED", "20"),
        input: {},
      }),
    ).toEqual([
      expect.objectContaining({ label: "주문 폭", value: "해당 없음" }),
    ]);
  });
});
