// 룰 키트 시험 대역 — qcdRule 응답 모양(QcdRuleService)과 catalog. 폭 수축량 2개 공정(PLTCM·CGL)과 COLLECT 룰 하나.
import type { Catalog } from "@/common/rule/meta";
import type { RuleView, RuleVersion } from "@/common/rule/types";

export const NA = { op: "NA", summary: "-" };

export const PLTCM: RuleView = {
  ruleId: "C10B1074",
  ver: "1",
  applyFrom: "2026-11-01 00:00:00",
  hitPolicy: "FIRST",
  vars: [
    {
      varId: 1,
      kind: "COND",
      name: "RAW_MATL_CD",
      dataType: "STRING",
      dispType: "ONE",
      seq: 1,
    },
    {
      varId: 2,
      kind: "COND",
      name: "THK",
      dataType: "NUMBER",
      dispType: "TWO",
      seq: 2,
    },
    {
      varId: 3,
      kind: "COND",
      name: "WID",
      dataType: "NUMBER",
      dispType: "TWO",
      seq: 3,
    },
    {
      varId: 4,
      kind: "RESULT",
      name: "WID_SHRINK_QTY",
      dataType: "NUMBER",
      dispType: "VALUE",
      seq: 1,
    },
  ],
  rows: [
    {
      rowId: 10,
      seq: 1,
      rowKind: "NORMAL",
      cells: {
        "1": { op: "IN", list: ["H32", "M32"], summary: "IN (H32, M32)" },
        "2": {
          op: "<= 변수 <=",
          left: "0.22",
          right: "0.249",
          summary: "0.22 <= 변수 <= 0.249",
        },
        "3": NA,
        "4": { val: "2", summary: "2" },
      },
      summary: "IN (H32, M32) · 0.22 <= 변수 <= 0.249 · -",
      results: { WID_SHRINK_QTY: "2" },
    },
    // 행 10 에 모두 덮인다(가려짐).
    {
      rowId: 11,
      seq: 2,
      rowKind: "NORMAL",
      cells: {
        "1": { op: "IN", list: ["H32"], summary: "IN (H32)" },
        "2": {
          op: "<= 변수 <=",
          left: "0.23",
          right: "0.24",
          summary: "0.23 <= 변수 <= 0.24",
        },
        "3": NA,
        "4": { val: "9", summary: "9" },
      },
      summary: "IN (H32) · 0.23 <= 변수 <= 0.24 · -",
      results: { WID_SHRINK_QTY: "9" },
    },
  ],
};

export const CGL: RuleView = {
  ruleId: "C10B1075",
  ver: "2",
  applyFrom: "2026-11-02 00:00:00",
  hitPolicy: "FIRST",
  vars: [
    {
      varId: 11,
      kind: "COND",
      name: "PROC_CD",
      dataType: "STRING",
      dispType: "EQUAL",
      seq: 1,
    },
    {
      varId: 12,
      kind: "COND",
      name: "THK",
      dataType: "NUMBER",
      dispType: "TWO",
      seq: 2,
    },
    {
      varId: 13,
      kind: "COND",
      name: "WID",
      dataType: "NUMBER",
      dispType: "TWO",
      seq: 3,
    },
    {
      varId: 14,
      kind: "RESULT",
      name: "WID_SHRINK_QTY",
      dataType: "NUMBER",
      dispType: "VALUE",
      seq: 1,
    },
  ],
  rows: [
    {
      rowId: 20,
      seq: 1,
      rowKind: "NORMAL",
      cells: {
        "11": { op: "EQ", left: "84", summary: "84" },
        "12": NA,
        "13": {
          op: "<= 변수 <",
          left: "600",
          right: "1270",
          summary: "600 <= 변수 < 1270",
        },
        "14": { val: "3", summary: "3" },
      },
      summary: "84 · - · 600 <= 변수 < 1270",
      results: { WID_SHRINK_QTY: "3" },
    },
  ],
};

/** 적용 버전 없는 룰. */
export const EMPTY_RULE = (ruleId: string): RuleView => ({
  ruleId,
  ver: null,
  applyFrom: null,
  hitPolicy: null,
  vars: [],
  rows: [],
});

/** catalog 대역 — PLTCM 은 라벨·단위가 있고, CGL 은 THK 라벨만 다르다. PROC_CD·WID(CGL)는 라벨이 없어 변수명으로 보인다. */
export const CATALOG: Catalog = {
  RULES: {
    C10B1074: {
      ruleId: "C10B1074",
      title: "PLTCM폭수축량",
      group: "PLTCM",
      groupLabel: "PLTCM",
      hitPolicy: "FIRST",
      conds: [
        { name: "RAW_MATL_CD", label: "원자재코드" },
        { name: "THK", label: "PLTCM 출측두께", unit: "mm" },
        { name: "WID", label: "PLTCM 폭", unit: "mm" },
      ],
      results: [{ name: "WID_SHRINK_QTY", label: "폭 수축량", unit: "mm" }],
    },
    C10B1075: {
      ruleId: "C10B1075",
      title: "CGL폭감소량",
      group: "CGL",
      groupLabel: "CGL",
      hitPolicy: "FIRST",
      conds: [{ name: "THK", label: "압연SET 두께" }],
      results: [{ name: "WID_SHRINK_QTY", label: "폭 수축량", unit: "mm" }],
    },
  },
  CODES: {
    QC_ITEM_NAME: {
      codeId: "QC_ITEM_NAME",
      title: "품명코드",
      attrNames: ["영문명"],
    },
  },
  SCREEN_RULES: { testScreen: ["C10B1074", "C10B1075"] },
  SCREEN_CODES: { testScreen: ["QC_ITEM_NAME"] },
};

export const HISTORY: RuleVersion[] = [
  {
    ver: "1",
    applyFrom: "2026-10-01 00:00:00",
    applyTo: "2026-11-01 00:00:00",
    vars: PLTCM.vars,
    rows: [
      { ...PLTCM.rows[0], results: { WID_SHRINK_QTY: "3" } },
      // 다음 버전에서 지워진다.
      { ...PLTCM.rows[1], rowId: 12, seq: 2 },
    ],
  },
  {
    ver: "2",
    applyFrom: "2026-11-01 00:00:00",
    applyTo: null,
    vars: PLTCM.vars,
    rows: [PLTCM.rows[0], { ...PLTCM.rows[1], seq: 3 }],
  },
];
