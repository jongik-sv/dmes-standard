// 폭 룰 공정 합산 — chain: 앞 공정을 나간 폭이 다음 공정의 폭 조건으로 들어가고, 적중 없음은 0, 합·최종 폭. parallel: 모두 같은 주문 폭.
import { describe, expect, it, vi } from "vitest";

import type { JudgeResult } from "@/common/rule/types";
import {
  amountVarOf,
  flowFields,
  flowSteps,
  runFlow,
  widthVarOf,
} from "@/qdm/width/flow";

import { CATALOG, CGL, PLTCM } from "../../common/rule/fixtures";

const GROUPS = [
  { key: "PLTCM", label: "PLTCM", ruleIds: ["C10B1074"] },
  { key: "CGL", label: "CGL", ruleIds: ["C10B1075"] },
  { key: "JZ", label: "정전", ruleIds: ["C10B1077"] },
];

const matched = (ruleId: string, qty: string): JudgeResult => ({
  ruleId,
  ver: "1",
  evalTs: "",
  status: "MATCHED",
  hits: [{ rowId: 1, seq: 1 }],
  results: { WID_SHRINK_QTY: qty },
  defaultApplied: false,
  trace: [],
  message: null,
});

describe("공정 흐름", () => {
  it("폭 변수·결과 변수를 찾고, 입력 칸은 폭을 뺀 조건 합집합", () => {
    expect(widthVarOf(PLTCM, "C10B1074", CATALOG)).toBe("WID");
    expect(amountVarOf(PLTCM, "C10B1074", CATALOG)).toBe("WID_SHRINK_QTY");
    const steps = flowSteps(GROUPS);
    expect(steps.map((s) => s.ruleId)).toEqual([
      "C10B1074",
      "C10B1075",
      "C10B1077",
    ]);
    expect(
      flowFields(steps, [PLTCM, CGL], CATALOG).map((f) => [
        f.name,
        f.label,
        f.numeric,
      ]),
    ).toEqual([
      ["RAW_MATL_CD", "원자재코드", false],
      ["THK", "PLTCM 출측두께", true],
      ["PROC_CD", "PROC_CD", false],
    ]);
  });

  it("앞 공정을 나간 폭으로 다음 공정을 판정하고, 적중 없음은 0 으로 더한다", async () => {
    const judge = vi.fn(
      async (ruleId: string, input: Record<string, string>) => {
        if (ruleId === "C10B1074") return matched(ruleId, "2.5");
        if (ruleId === "C10B1075")
          return matched(ruleId, input.WID === "997.5" ? "3" : "99");
        return {
          ...matched(ruleId, ""),
          status: "RULE_NOT_FOUND" as const,
          hits: [],
          results: {},
        };
      },
    );
    const flow = await runFlow(
      flowSteps(GROUPS),
      [PLTCM, CGL],
      { THK: "0.23", RAW_MATL_CD: "H32", PROC_CD: "84" },
      1000,
      judge,
      "2026-11-25 23:59:59",
      CATALOG,
    );
    expect(judge.mock.calls).toEqual([
      [
        "C10B1074",
        { RAW_MATL_CD: "H32", THK: "0.23", WID: "1000" },
        "2026-11-25 23:59:59",
      ],
      [
        "C10B1075",
        { THK: "0.23", PROC_CD: "84", WID: "997.5" },
        "2026-11-25 23:59:59",
      ],
      // 정의가 없는 룰 — 폭 변수를 모르므로 폭 없이 부른다.
      ["C10B1077", {}, "2026-11-25 23:59:59"],
    ]);
    expect(
      flow.steps.map((s) => [s.inWidth, s.amount, s.outWidth, s.status]),
    ).toEqual([
      [1000, 2.5, 997.5, "MATCHED"],
      [997.5, 3, 994.5, "MATCHED"],
      [994.5, 0, 994.5, "RULE_NOT_FOUND"],
    ]);
    expect(flow).toMatchObject({
      startWidth: 1000,
      total: 5.5,
      finalWidth: 994.5,
      matched: 2,
    });
  });

  it("판정 호출이 실패하면 그 오류를 던진다", async () => {
    const judge = vi.fn(async () => {
      throw new Error("MDM 에서 기준 정의를 받을 수 없습니다");
    });
    await expect(
      runFlow(flowSteps(GROUPS), [PLTCM], {}, 1000, judge),
    ).rejects.toThrow("MDM");
  });

  it("parallel — 공정마다 같은 시작 폭으로 판정하고, 폭 조건이 없는 룰은 폭 없이, 제품 폭 = 시작 − 합, 룰 ID 를 싣는다", async () => {
    const noWidth = {
      ...CGL,
      vars: CGL.vars.filter((v) => v.name !== "WID"),
    };
    const judge = vi.fn(async (ruleId: string) => ({
      ...matched(ruleId, ruleId === "C10B1074" ? "10" : "20"),
      results: {
        WID_SHRINK_QTY: ruleId === "C10B1074" ? "10" : "20",
        RULE_KEY: ruleId === "C10B1074" ? "WM-PLTCM-001" : "-",
      },
    }));
    const flow = await runFlow(
      flowSteps(GROUPS.slice(0, 2)),
      [PLTCM, noWidth],
      { THK: "0.5" },
      1000,
      judge,
      undefined,
      CATALOG,
      "parallel",
      { keyVar: "RULE_KEY", blankValues: ["-"] },
    );
    expect(judge.mock.calls.map((c) => c[1])).toEqual([
      { RAW_MATL_CD: "", THK: "0.5", WID: "1000" },
      { PROC_CD: "", THK: "0.5" },
    ]);
    expect(
      flow.steps.map((s) => [s.inWidth, s.outWidth, s.amount, s.ruleKey]),
    ).toEqual([
      [1000, 990, 10, "WM-PLTCM-001"],
      [1000, 980, 20, null],
    ]);
    expect(flow).toMatchObject({ total: 30, finalWidth: 970 });
  });
});
