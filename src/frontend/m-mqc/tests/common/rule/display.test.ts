// 결과 표시 설정(display.ts) — 보일 결과 순서, 빈 값·형식, 배지, 결과 문장, 판정 타일, 이력 행 키.
import { describe, expect, it } from "vitest";

import { diffVersions } from "@/common/rule/diff";
import {
  displayResultText,
  formatResult,
  isBlankValue,
  leadText,
  rowBadges,
  rowKeyOf,
  signedNumber,
  tileResultNames,
  visibleResultNames,
  type RuleDisplay,
} from "@/common/rule/display";
import { hitRows, resultEntries } from "@/common/rule/judge";
import type { RuleVersion } from "@/common/rule/types";

import { CATALOG, PLTCM } from "./fixtures";

const D: RuleDisplay = {
  keyVar: "RULE_KEY",
  leadVars: ["PRIO"],
  primaryVars: ["QTY", "MISSING"],
  hiddenVars: ["SRC_NOTE"],
  blankValues: ["-"],
  format: { QTY: signedNumber, PRIO: (v, r) => `${v}/${r.RULE_KEY}` },
  badges: (r) =>
    r.SRC_NOTE
      ? [{ label: "원본주의", tone: "danger", title: r.SRC_NOTE }]
      : [],
};

const KEYED = {
  ...PLTCM,
  vars: [
    ...PLTCM.vars,
    {
      varId: 5,
      kind: "RESULT" as const,
      name: "RULE_KEY",
      dataType: "STRING" as const,
      dispType: "VALUE" as const,
      seq: 2,
    },
    {
      varId: 6,
      kind: "RESULT" as const,
      name: "PRIO",
      dataType: "NUMBER" as const,
      dispType: "VALUE" as const,
      seq: 3,
    },
  ],
};

describe("결과 표시 설정", () => {
  it("보일 결과 — 업무 결과 먼저, 숨김·룰 ID·앞 열 제외, 설정 없으면 그대로", () => {
    const names = ["RULE_KEY", "NOTE", "QTY", "PRIO", "SRC_NOTE"];
    expect(visibleResultNames(names, D)).toEqual(["QTY", "NOTE"]);
    expect(visibleResultNames(names, undefined)).toEqual(names);
    expect(tileResultNames(names, D)).toEqual(["QTY"]);
    expect(tileResultNames(["NOTE"], D)).toEqual(["NOTE"]);
  });

  it("빈 값(「-」·null·공백)은 「—」, 형식 함수는 원문과 행 결과를 받는다", () => {
    expect(isBlankValue("-", D)).toBe(true);
    expect(isBlankValue("-", undefined)).toBe(false);
    expect(formatResult(D, "QTY", "2")).toBe("+2");
    expect(formatResult(D, "QTY", "-0.04")).toBe("−0.04");
    expect(formatResult(D, "QTY", "0")).toBe("0");
    expect(formatResult(D, "SRC_NOTE", "-")).toBe("—");
    expect(formatResult(D, "PRIO", "3", { RULE_KEY: "WR-1" })).toBe("3/WR-1");
    expect(rowKeyOf(D, { RULE_KEY: " WR-1 " })).toBe("WR-1");
    expect(rowKeyOf(D, { RULE_KEY: "-" })).toBeNull();
    expect(leadText("X", D, { PRIO: "1", RULE_KEY: "WR-1" }, CATALOG)).toBe(
      "PRIO 1/WR-1",
    );
  });

  it("부호 붙은 수 — 부동소수 찌꺼기 없이, 숫자가 아니면 원문", () => {
    expect(signedNumber("0.30000000000000004")).toBe("+0.3");
    expect(signedNumber("abc")).toBe("abc");
  });

  it("배지는 빈 값 처리 뒤 결과로 부른다", () => {
    expect(rowBadges(D, { SRC_NOTE: "-" }, undefined)).toEqual([]);
    expect(rowBadges(D, { SRC_NOTE: "원본주의 x" }, undefined)).toEqual([
      { label: "원본주의", tone: "danger", title: "원본주의 x" },
    ]);
    expect(rowBadges(undefined, { SRC_NOTE: "y" }, undefined)).toEqual([]);
  });

  it("결과 문장·적중 행·결과 타일에 표시 설정을 쓴다", () => {
    const display: RuleDisplay = {
      keyVar: "RULE_KEY",
      primaryVars: ["WID_SHRINK_QTY"],
      format: { WID_SHRINK_QTY: signedNumber },
    };
    const row = { results: { WID_SHRINK_QTY: "2", RULE_KEY: "WR-1" } };
    expect(displayResultText(KEYED, row, display, CATALOG)).toBe(
      "폭 수축량 +2 mm · PRIO —",
    );
    const result = {
      ruleId: "C10B1074",
      ver: "1",
      evalTs: "",
      status: "MATCHED" as const,
      hits: [{ rowId: 10, seq: 1 }],
      results: { WID_SHRINK_QTY: "2", RULE_KEY: "WR-1", PRIO: "1" },
      defaultApplied: false,
      trace: [],
      message: null,
    };
    const rule = {
      ...KEYED,
      rows: KEYED.rows.map((r) => ({
        ...r,
        results: { ...r.results, RULE_KEY: `WR-${r.rowId}`, PRIO: "1" },
      })),
    };
    expect(
      hitRows(result, rule, CATALOG, display).map((h) => [h.ruleKey, h.result]),
    ).toEqual([["WR-10", "폭 수축량 +2 mm · PRIO 1"]]);
    expect(hitRows(result, rule, CATALOG)[0].ruleKey).toBe("—");
    expect(
      resultEntries(result, rule, CATALOG, display).map((e) => [
        e.name,
        e.value,
      ]),
    ).toEqual([["WID_SHRINK_QTY", "+2"]]);
  });

  it("이력 — 행 키는 따로, 앞 열(우선순위) 값이 바뀌어도 변경으로 잡는다", () => {
    const v = (prio: string, qty: string, key: string): RuleVersion => ({
      ver: "1",
      applyFrom: null,
      applyTo: null,
      vars: KEYED.vars,
      rows: [
        {
          ...KEYED.rows[0],
          results: { WID_SHRINK_QTY: qty, RULE_KEY: key, PRIO: prio },
        },
      ],
    });
    const display: RuleDisplay = { keyVar: "RULE_KEY", leadVars: ["PRIO"] };
    const diffs = diffVersions(
      "C10B1074",
      v("1", "2", "WR-1"),
      v("2", "2", "WR-1"),
      CATALOG,
      display,
    );
    expect(diffs.map((d) => [d.kind, d.ruleKey])).toEqual([
      ["changed", "WR-1"],
    ]);
    expect(diffs[0].after).toContain("PRIO 2");
    expect(diffs[0].after).not.toContain("WR-1");
    expect(
      diffVersions(
        "C10B1074",
        v("1", "2", "WR-1"),
        v("1", "2", "WR-9"),
        CATALOG,
        display,
      ).map((d) => d.kind),
    ).toEqual(["same"]);
  });
});
