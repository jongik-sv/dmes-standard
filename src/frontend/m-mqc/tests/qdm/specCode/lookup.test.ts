// 규격약호 간편조회 — 입력 칸은 두 룰 조건의 합집합, 룰마다 자기 조건만 싣고 함께 판정, 적용 룰 ID·조건 문장.
import { describe, expect, it, vi } from "vitest";

import type { JudgeResult, RuleView } from "@/common/rule";
import { DISPLAY } from "@/qdm/specCode/SpecCodePage";
import {
  BASE_GRADE_RULE,
  LOOKUP_RULES,
  lookupFields,
  runLookup,
  THK_STD_RULE,
} from "@/qdm/specCode/lookup";

const str = (
  varId: number,
  name: string,
  kind: "COND" | "RESULT",
  seq: number,
) => ({
  varId,
  kind,
  name,
  dataType: "STRING" as const,
  dispType: (kind === "COND" ? "ONE" : "VALUE") as "ONE" | "VALUE",
  seq,
});

const THK: RuleView = {
  ruleId: THK_STD_RULE,
  ver: "1.001",
  applyFrom: null,
  hitPolicy: "FIRST",
  vars: [
    str(1, "SPEC_ORG_CD", "COND", 1),
    str(2, "THK_STD_CD", "RESULT", 1),
    str(3, "RULE_KEY", "RESULT", 2),
  ],
  rows: [
    {
      rowId: 1,
      seq: 1,
      rowKind: "NORMAL",
      cells: { "1": { op: "EQ", left: "KS", summary: "= KS" } },
      summary: "= KS",
      results: { THK_STD_CD: "BMT", RULE_KEY: "TK-001" },
    },
  ],
};
const MAP: RuleView = {
  ruleId: BASE_GRADE_RULE,
  ver: "1.000",
  applyFrom: null,
  hitPolicy: "FIRST",
  vars: [
    str(1, "SPEC_ORG_CD", "COND", 1),
    str(2, "STL_GRD_CD", "COND", 2),
    str(3, "BASE_STL_GRD_CD", "RESULT", 1),
    str(4, "RULE_KEY", "RESULT", 2),
  ],
  rows: [],
};

describe("규격약호 간편조회", () => {
  it("입력 칸 — 규격코드·강종코드(합집합, catalog 라벨)", () => {
    expect(
      lookupFields(LOOKUP_RULES, [THK, MAP]).map((f) => [f.name, f.label]),
    ).toEqual([
      ["SPEC_ORG_CD", "규격코드"],
      ["STL_GRD_CD", "강종코드"],
    ]);
  });

  it("룰마다 자기 조건만 싣고 함께 판정한다 — 적중은 룰 ID·조건 문장, 적중 없음은 null", async () => {
    const judge = vi.fn(async (ruleId: string): Promise<JudgeResult> => ({
      ruleId,
      ver: "1",
      evalTs: "",
      status: ruleId === THK_STD_RULE ? "MATCHED" : "NO_MATCH",
      hits: ruleId === THK_STD_RULE ? [{ rowId: 1, seq: 1 }] : [],
      results:
        ruleId === THK_STD_RULE
          ? { THK_STD_CD: "BMT", RULE_KEY: "TK-001" }
          : { BASE_STL_GRD_CD: null, RULE_KEY: null },
      defaultApplied: false,
      trace: [],
      message: ruleId === THK_STD_RULE ? null : "조건에 맞는 행이 없습니다",
    }));
    const items = await runLookup(
      LOOKUP_RULES,
      [THK, MAP],
      { SPEC_ORG_CD: "KS", STL_GRD_CD: "CGCC" },
      judge,
      "2026-11-25 23:59:59",
      DISPLAY,
    );
    expect(judge.mock.calls).toEqual([
      [THK_STD_RULE, { SPEC_ORG_CD: "KS" }, "2026-11-25 23:59:59"],
      [
        BASE_GRADE_RULE,
        { SPEC_ORG_CD: "KS", STL_GRD_CD: "CGCC" },
        "2026-11-25 23:59:59",
      ],
    ]);
    expect(items.map((i) => [i.ruleId, i.ruleKey, i.condition])).toEqual([
      [THK_STD_RULE, "TK-001", "규격코드 = KS"],
      [BASE_GRADE_RULE, null, null],
    ]);
  });
});
