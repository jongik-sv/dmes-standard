// 원자재강종 시험 대역 — qcdRule 응답 모양의 QD_RAW_MATERIAL_GRADE 행(도금기준 RM-006 → 칼라파생 RM-007, 칼라전용 RM-011).
import type { RuleRow, RuleVar, RuleVersion } from "@/common/rule";

export const VARS: RuleVar[] = [
  ["PRD_NM_CD", "COND", "STRING", "ONE"],
  ["SPC_AVR", "COND", "STRING", "ONE"],
  ["ORD_USG_CD", "COND", "STRING", "ONE"],
  ["THK", "COND", "NUMBER", "TWO"],
  ["MAT_CD", "RESULT"],
  ["RAW_MAT_PRI", "RESULT"],
  ["RAW_MAT_ALT", "RESULT"],
  ["RAW_GRADE_MSG", "RESULT"],
  ["RULE_KEY", "RESULT"],
  ["RULE_KIND", "RESULT"],
  ["BASE_RULE_KEY", "RESULT"],
  ["INHERIT_NOTE", "RESULT"],
  ["LEGACY_TYPE", "RESULT"],
  ["LEGACY_NO", "RESULT"],
].map(([name, kind, dataType = "STRING", dispType = "VALUE"], i) => ({
  varId: i + 1,
  kind: kind as "COND" | "RESULT",
  name,
  dataType: dataType as "STRING" | "NUMBER",
  dispType: dispType as "ONE" | "TWO" | "VALUE",
  seq: i + 1,
}));

export function row(
  rowId: number,
  prod: string,
  spec: string,
  lo: string,
  hi: string,
  r: Record<string, string>,
): RuleRow {
  return {
    rowId,
    seq: rowId,
    rowKind: "NORMAL",
    cells: {
      "1": { op: "EQ", left: prod, summary: `= ${prod}` },
      "2": { op: "EQ", left: spec, summary: `= ${spec}` },
      "3": { op: "NA", summary: "-" },
      "4": {
        op: "<= 변수 <",
        left: lo,
        right: hi,
        summary: `${lo} <= 변수 < ${hi}`,
      },
    },
    summary: "",
    results: {
      MAT_CD: "-",
      RAW_MAT_PRI: "-",
      RAW_MAT_ALT: "-",
      RAW_GRADE_MSG: "-",
      BASE_RULE_KEY: "-",
      INHERIT_NOTE: "자체 기준",
      LEGACY_TYPE: "1A0",
      LEGACY_NO: "1",
      ...r,
    },
  };
}

export const base = (hi: string) =>
  row(1, "G", "KSG-SGCD2", "0.2", hi, {
    RULE_KEY: "RM-006",
    RULE_KIND: "BASE",
    MAT_CD: "4B",
    RAW_MAT_PRI: "H2J",
  });
export const derived = (
  r: Record<string, string> = {},
  lo = "0.25",
  hi = "1.6",
) =>
  row(2, "3", "KS3-CGCD-2", lo, hi, {
    RULE_KEY: "RM-007",
    RULE_KIND: "DERIVED",
    BASE_RULE_KEY: "RM-006",
    MAT_CD: "4B",
    RAW_MAT_PRI: "H2J",
    RAW_MAT_ALT: "G25",
    ...r,
  });
export const solo = row(3, "3", "KS-3-CGCC", "0.35", "0.45", {
  RULE_KEY: "RM-011",
  RULE_KIND: "STANDALONE",
  MAT_CD: "BA",
  LEGACY_NO: "0",
});

export const version = (ver: string, rows: RuleRow[]): RuleVersion => ({
  ver,
  applyFrom: null,
  applyTo: null,
  vars: VARS,
  rows,
});
