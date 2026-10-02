import type { CellJson, VarType } from "../../../../src/evalex";
import type { RuleDef, RuleRowDef, RuleVarDef } from "../../../../src/evalex";
import { ast } from "./parse-expr";

/**
 * TSK-03-04 테스트 룰 정의. 출처는 06-business-rule.md 와 시안 06-business-rule.html(QV1·PV1·PV2·BV1, 컬럼 사전 DICT).
 */

/** 시안 컬럼 사전(html 367-388) — 이름 → VarType. */
const DICT: Record<string, Omit<VarType, "name">> = {
  COIL_THK: { dataType: "NUMBER", scale: 2, domainId: "THK_MM" },
  COIL_WID: { dataType: "NUMBER", scale: 0, domainId: "WID_MM" },
  SURF_GRD: { dataType: "STRING", scale: null, domainId: "SURF_GRD_CD" },
  COIL_LEN: { dataType: "NUMBER", scale: 1, domainId: "LEN_M" },
  SPEC_GRAV: { dataType: "NUMBER", scale: 3, domainId: "SG" },
  PROD_TYPE: { dataType: "STRING", scale: null, domainId: "PROD_TYPE_CD" },
  CALC_BASIS: { dataType: "STRING", scale: null, domainId: "CALC_BASIS_CD" },
  COIL_OUT_DIA: { dataType: "NUMBER", scale: 0, domainId: "LEN_MM" },
  COIL_IN_DIA: { dataType: "NUMBER", scale: 0, domainId: "LEN_MM" },
  COIL_VOID_RT: { dataType: "NUMBER", scale: 2, domainId: "PCT" },
  SHEET_LEN: { dataType: "NUMBER", scale: 0, domainId: "LEN_MM" },
  SHEET_CNT: { dataType: "NUMBER", scale: 0, domainId: "QTY" },
  PROD_WGT: { dataType: "NUMBER", scale: 1, domainId: "WGT_KG" },
  BASE_FCT: { dataType: "NUMBER", scale: 2, domainId: "FCT" },
  MAT_CD: { dataType: "STRING", scale: null, domainId: "MAT_CD" },
  TOP_RESIN_CD: { dataType: "STRING", scale: null, domainId: "NAME20" },
  COAT_SIDE: { dataType: "STRING", scale: null, domainId: "NAME20" },
  QLTY_GRD: { dataType: "STRING", scale: null, domainId: "QLTY_GRD_CD" },
};

/** 타입 해석기 — 사전에 없으면 undefined. */
export function resolveType(name: string): VarType {
  const t = DICT[name];
  return (t ? { name, ...t } : undefined) as VarType;
}

export function cond(
  varId: number,
  dispType: RuleVarDef["dispType"],
  varName: string | null,
  seq: number,
  extra: Partial<RuleVarDef> = {},
): RuleVarDef {
  const dataType = varName && DICT[varName] ? DICT[varName].dataType : "STRING";
  const scale = varName && DICT[varName] ? DICT[varName].scale : null;
  return { varId, varKind: "COND", dispType, seq, varName, dataType, scale, ...extra };
}

export function result(varId: number, dispType: RuleVarDef["dispType"], varName: string, seq: number, extra: Partial<RuleVarDef> = {}): RuleVarDef {
  const dataType = DICT[varName] ? DICT[varName].dataType : "NUMBER";
  return { varId, varKind: "RESULT", dispType, seq, varName, dataType, ...extra };
}

export function E(text: string): CellJson {
  return { expr: text, ast: ast(text) };
}

export function row(rowId: number, seq: number, cells: Record<number, CellJson>, rowKind: RuleRowDef["rowKind"] = "NORMAL"): RuleRowDef {
  return { rowId, seq, rowKind, cells };
}

/** QLTY_GRD_JDG v1 — 06:83-90, 시안 QV1. FIRST. */
export const QLTY_GRD_JDG: RuleDef = {
  ruleId: "QLTY_GRD_JDG",
  ruleKind: "DECISION",
  hitPolicy: "FIRST",
  vars: [
    cond(1, "TWO", "COIL_THK", 1),
    cond(2, "ONE", "COIL_WID", 2),
    cond(3, "ONE", "SURF_GRD", 3),
    result(4, "VALUE", "QLTY_GRD", 1),
    result(5, "EXPRESSION", "PRC_FCT", 2),
  ],
  rows: [
    row(1, 1, { 1: { op: "<= 변수 <", left: "1.6", right: "2.5" }, 2: { op: "GT", left: "1000" }, 3: { op: "IN", list: ["A"] }, 4: { val: "A" }, 5: E("1.05") }),
    row(2, 2, { 1: { op: "<= 변수 <", left: "1.6", right: "2.5" }, 2: { op: "GT", left: "1000" }, 3: { op: "IN", list: ["B"] }, 4: { val: "B" }, 5: E("1.00") }),
    row(3, 3, { 1: { op: "GE", left: "2.5" }, 2: { op: "NA" }, 3: { op: "NOT_IN", list: ["C"] }, 4: { val: "B" }, 5: E("ROUND(BASE_FCT * 0.98, 2)") }),
    row(4, 0, { 4: { val: "C" }, 5: E("0.90") }, "DEFAULT"),
  ],
};

const PROD_EXPR = {
  len: "ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)",
  dia: "ROUND(PI / 4 * (COIL_OUT_DIA ^ 2 - COIL_IN_DIA ^ 2) * COIL_WID * (1 - COIL_VOID_RT / 100) * SPEC_GRAV / 1000000, 1)",
  sheet: "ROUND(COIL_THK * COIL_WID * SHEET_LEN * SHEET_CNT * SPEC_GRAV / 1000000, 1)",
};

function prodWgt(coalesce: boolean): RuleDef {
  const x = (s: string) => E(coalesce ? s.replace("SPEC_GRAV", "COALESCE(SPEC_GRAV, 7.85)") : s);
  return {
    ruleId: "PROD_WGT_CALC",
    ruleKind: "DECISION",
    hitPolicy: "UNIQUE",
    vars: [cond(1, "EQUAL", "PROD_TYPE", 1), cond(3, "EQUAL", "CALC_BASIS", 2), result(2, "EXPRESSION", "PROD_WGT", 1)],
    rows: [
      row(1, 1, { 1: { op: "EQ", left: "COIL" }, 3: { op: "EQ", left: "LEN" }, 2: x(PROD_EXPR.len) }),
      row(3, 2, { 1: { op: "EQ", left: "COIL" }, 3: { op: "EQ", left: "DIA" }, 2: x(PROD_EXPR.dia) }),
      row(2, 3, { 1: { op: "EQ", left: "SHEET" }, 3: { op: "NA" }, 2: x(PROD_EXPR.sheet) }),
    ],
  };
}

/** PROD_WGT_CALC PV1 — 시안 html 466-477(F16). UNIQUE. var 3(CALC_BASIS)은 열 seq 2. */
export const PROD_WGT_CALC = prodWgt(false);
/** PROD_WGT_CALC PV2 — 결과 식의 SPEC_GRAV 를 COALESCE(SPEC_GRAV, 7.85) 로 바꾼 DRAFT. */
export const PROD_WGT_CALC_PV2 = prodWgt(true);

const THK_BANDS: [string, string, string][] = [
  ["< 변수 <=", "0", "0.5"],
  ["< 변수 <", "0.5", "0.6"],
  ["<= 변수 <", "0.6", "0.7"],
  ["<= 변수 <", "0.7", "0.8"],
  ["<= 변수 <", "0.8", "0.9"],
  ["<= 변수 <", "0.9", "1"],
  ["<= 변수 <=", "1", "1.2"],
];
const SPD_GRP: [string, string | null][] = [
  ["TEXTURE", 'STR_STARTS_WITH(TOP_RESIN_CD, "2")'],
  ["AKZO", 'STR_STARTS_WITH(TOP_RESIN_CD, "6")'],
  ["FLUORO", 'TOP_RESIN_CD == "F"'],
  ["WXL1", 'STR_STARTS_WITH(TOP_RESIN_CD, "W") && COAT_SIDE == "1"'],
  ["WXL2", 'STR_STARTS_WITH(TOP_RESIN_CD, "W") && COAT_SIDE == "2"'],
  ["BACK1", 'STR_STARTS_WITH(TOP_RESIN_CD, "B") && COAT_SIDE == "1"'],
  ["BACK2", 'STR_STARTS_WITH(TOP_RESIN_CD, "B") && COAT_SIDE == "2"'],
  ["GENERAL", null],
];
const SPD_VALS = [
  [100, 100, 90, 110, 110, 110, 110, 120],
  [100, 100, 90, 110, 110, 110, 110, 110],
  [90, 90, 80, 100, 100, 100, 100, 100],
  [80, 80, 70, 90, 90, 90, 90, 90],
  [70, 70, 60, 80, 80, 80, 80, 80],
  [60, 60, 50, 70, 70, 70, 70, 70],
  [50, 50, 50, 70, 70, 60, 60, 60],
];

/** BASE_SPD_LKP v1 — 06:71-79, 시안 BV1(F18). UNIQUE 7행, 결과 열 그룹 BASE_SPD. */
export const BASE_SPD_LKP: RuleDef = {
  ruleId: "BASE_SPD_LKP",
  ruleKind: "DECISION",
  hitPolicy: "UNIQUE",
  vars: [
    cond(1, "TWO", "COIL_THK", 1),
    ...SPD_GRP.map(([name, g], j) =>
      result(j + 2, "VALUE", name, j + 1, { resGrp: "BASE_SPD", grpCondAst: g ? ast(g) : null, dataType: "NUMBER" }),
    ),
  ],
  rows: THK_BANDS.map(([op, left, right], i) => {
    const cells: Record<number, CellJson> = { 1: { op: op as "<= 변수 <", left, right } };
    SPD_VALS[i].forEach((v, j) => {
      cells[j + 2] = { val: String(v) };
    });
    return row(i + 1, i + 1, cells);
  }),
};
