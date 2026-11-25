// 생산가부관리(qdf) 시험 대역 — qcdRule search·codes 응답 모양의 작은 룰·코드.
import type {
  CodeSet,
  RuleCell,
  RuleRow,
  RuleVar,
  RuleView,
} from "@/common/rule";

type VarSpec = [
  name: string,
  kind: "COND" | "RESULT",
  dataType: "STRING" | "NUMBER",
];

export function vars(specs: VarSpec[]): RuleVar[] {
  return specs.map(([name, kind, dataType], i) => ({
    varId: i + 1,
    kind,
    name,
    dataType,
    dispType: kind === "RESULT" ? "VALUE" : "ONE",
    seq: i + 1,
  }));
}

export const eq = (v: string | number): RuleCell => ({
  op: "EQ",
  left: String(v),
  summary: `= ${v}`,
});
export const inList = (...list: string[]): RuleCell => ({
  op: "IN",
  list,
  summary: `IN (${list.join(", ")})`,
});
export const notIn = (...list: string[]): RuleCell => ({
  op: "NOT_IN",
  list,
  summary: `NOT IN (${list.join(", ")})`,
});
export const isNull = (): RuleCell => ({ op: "IS_NULL", summary: "IS NULL" });
export const cmp = (op: "GT" | "GE" | "LT" | "LE", v: number): RuleCell => ({
  op,
  left: String(v),
  summary: `${op} ${v}`,
});
/** 범위 — closedRight 면 `<= 변수 <=`, 아니면 `<= 변수 <`. */
export const range = (
  left: number,
  right: number,
  closedRight = false,
): RuleCell => ({
  op: closedRight ? "<= 변수 <=" : "<= 변수 <",
  left: String(left),
  right: String(right),
  summary: `${left} <= 변수 ${closedRight ? "<=" : "<"} ${right}`,
});

/** 행 — cells 는 변수명 → 셀, results 는 변수명 → 값. */
export function row(
  vs: RuleVar[],
  seq: number,
  cells: Record<string, RuleCell>,
  results: Record<string, string>,
): RuleRow {
  const byId: Record<string, RuleCell> = {};
  for (const v of vs) {
    if (v.kind === "COND")
      byId[String(v.varId)] = cells[v.name!] ?? { op: "NA", summary: "-" };
    else byId[String(v.varId)] = { val: results[v.name!] ?? "-", summary: "" };
  }
  return {
    rowId: seq,
    seq,
    rowKind: "NORMAL",
    cells: byId,
    summary: "",
    results,
  };
}

export function rule(
  ruleId: string,
  vs: RuleVar[],
  rows: RuleRow[],
  ver = "1.000",
  hitPolicy = "FIRST",
): RuleView {
  return {
    ruleId,
    ver,
    applyFrom: "2026-11-01 00:00:00",
    hitPolicy,
    vars: vs,
    rows,
  };
}

export function codeSet(
  codeId: string,
  items: { code: string; name: string; lvl?: string[]; attrs?: string[] }[],
): CodeSet {
  return {
    codeId,
    ver: "1.000",
    items: items.map((i, n) => ({
      code: i.code,
      name: i.name,
      alterName: null,
      seq: n + 1,
      lvl: i.lvl ?? [],
      attrs: i.attrs ?? [],
    })),
  };
}

// ── 주문단중에러 ─────────────────────────────────────────────

export const WEIGHT_VARS = vars([
  ["ORD_UNT_WGT", "COND", "NUMBER"],
  ["SPLIT_CNT", "COND", "NUMBER"],
  ["SPLIT_UNT_WGT", "RESULT", "NUMBER"],
  ["IN_RANGE_YN", "RESULT", "STRING"],
]);

const wrow = (seq: number, w: number, s: number, v: string, yn: string) =>
  row(
    WEIGHT_VARS,
    seq,
    { ORD_UNT_WGT: eq(w), SPLIT_CNT: eq(s) },
    {
      SPLIT_UNT_WGT: v,
      IN_RANGE_YN: yn,
    },
  );

/** v1.000 — 계산값. 15 × 2·3, 24 × 5·6. */
export const WEIGHT_V1 = rule("QD_ORDER_WEIGHT_ERROR", WEIGHT_VARS, [
  wrow(1, 15, 2, "7.5", "N"),
  wrow(2, 15, 3, "5", "Y"),
  wrow(3, 24, 5, "4.8", "Y"),
  wrow(4, 24, 6, "4", "Y"),
]);
/** v1.001 — 24 × 6 을 4.05 로 수정. */
export const WEIGHT_V2 = rule(
  "QD_ORDER_WEIGHT_ERROR",
  WEIGHT_VARS,
  [
    wrow(1, 15, 2, "7.5", "N"),
    wrow(2, 15, 3, "5", "Y"),
    wrow(3, 24, 5, "4.8", "Y"),
    wrow(4, 24, 6, "4.05", "Y"),
  ],
  "1.001",
);

export const WEIGHT_LIMIT = codeSet("QC_ORD_WGT_LIMIT", [
  { code: "MIN", name: "허용 단중 Min", attrs: ["4.0", "MT/개"] },
  { code: "MAX", name: "허용 단중 Max", attrs: ["5.0", "MT/개"] },
]);

// ── 생산가부 ─────────────────────────────────────────────────

export const FEAS_VARS = vars([
  ["MAT_GRP_CD", "COND", "STRING"],
  ["WID", "COND", "NUMBER"],
  ["THK", "COND", "NUMBER"],
  ["FEAS_STAT", "RESULT", "STRING"],
]);

const frow = (seq: number, g: string, w: RuleCell, t: RuleCell, st: string) =>
  row(FEAS_VARS, seq, { MAT_GRP_CD: eq(g), WID: w, THK: t }, { FEAS_STAT: st });

/**
 * 그룹 S1-G1 — 폭 1260·1230·650↑ × 두께 0.24·0.3·0.5·1. 시트 칸:
 *   1260 "-PP-" · 1230 "PPPC" · 650 "PPPP"(같은 상태가 이어진 칸은 한 행).
 */
export const FEAS_RULE = rule("QD_FEAS_2CGL_GI", FEAS_VARS, [
  frow(1, "S1-G1", eq(1260), range(0.24, 0.3), "-"),
  frow(2, "S1-G1", eq(1260), range(0.3, 1), "P"),
  frow(3, "S1-G1", eq(1260), eq(1), "-"),
  frow(4, "S1-G1", range(1230, 1260), range(0.24, 1), "P"),
  frow(5, "S1-G1", range(1230, 1260), eq(1), "C"),
  frow(6, "S1-G1", range(650, 1230), range(0.24, 1, true), "P"),
]);

export const FEAS_CODES: CodeSet[] = [
  codeSet("QC_FEAS_SHEET", [
    {
      code: "S1",
      name: "B.D 생산범위(2CGL GI)",
      attrs: [
        "2CGL GI 생산가능 SIZE (Full Hard 치수 기준)",
        "[개정일 : '25.03.31]",
        "",
        "-. 내경 508Py 권취 가능\n-. 생산가능 후처리",
        '{"heads":["구분\\n(후처리 Code)","무처리\\n(MX)"],"rows":[["GI","O"]]}',
        "QD_FEAS_2CGL_GI",
      ],
    },
  ]),
  codeSet("QC_FEAS_MATL_GRP", [
    {
      code: "S1-G1",
      name: "CQ, Gr-A",
      lvl: ["S1"],
      attrs: [
        "1A,AA",
        "재질코드(Material Code) = 1A, AA",
        "1260,1230,650↑",
        "0.24,0.3,0.5,1",
        "※ 폭 수축량 불균일",
        "",
        "",
      ],
    },
    {
      code: "S1-G2",
      name: "Gr-E(G550)",
      lvl: ["S1"],
      attrs: [
        "EA",
        "재질코드(Material Code) = EA",
        "1260,650↑",
        "0.24,0.5",
        "",
        "PL-TCM 형상 제어 애로",
        '{"rows":1,"cols":1,"text":"주석","red":true}',
      ],
    },
  ]),
  codeSet("QC_FEAS_STATE", [
    { code: "-", name: "생산불가", attrs: ["white"] },
    { code: "P", name: "생산가능", attrs: ["blue"] },
    { code: "C", name: "조건부 생산", attrs: ["yellow"] },
    { code: "X", name: "생산불가(검증 완료)", attrs: ["red"] },
  ]),
];

// ── 주문정합성 ───────────────────────────────────────────────

export const OC_VARS = vars([
  ["PRD_NM_CD", "COND", "STRING"],
  ["ORD_SPNL_TP", "COND", "STRING"],
  ["GW_ASG_CD", "COND", "STRING"],
  ["ORD_EXC_WTH", "COND", "NUMBER"],
  ["ORD_MIX_WTH10", "COND", "NUMBER"],
  ["RULE_KEY", "RESULT", "STRING"],
  ["ERR_CD", "RESULT", "STRING"],
  ["ERR_MSG", "RESULT", "STRING"],
  ["ERR_CATEGORY", "RESULT", "STRING"],
  ["SEVERITY", "RESULT", "STRING"],
  ["WARN_CAND_YN", "RESULT", "STRING"],
  ["OWNER_DEPT", "RESULT", "STRING"],
  ["ACTOR", "RESULT", "STRING"],
  ["TARGET_ITEM", "RESULT", "STRING"],
  ["RULE_SOURCE", "RESULT", "STRING"],
]);

const orow = (
  seq: number,
  key: string,
  code: string,
  msg: string,
  category: string,
  target: string,
  cells: Record<string, RuleCell>,
) =>
  row(OC_VARS, seq, cells, {
    RULE_KEY: key,
    ERR_CD: code,
    ERR_MSG: msg,
    ERR_CATEGORY: category,
    SEVERITY: "error",
    WARN_CAND_YN: "N",
    OWNER_DEPT: "품질설계",
    ACTOR: "등록자",
    TARGET_ITEM: target,
    RULE_SOURCE: "order",
  });

export const OC_RULE = rule(
  "QD_ORDER_CHECK",
  OC_VARS,
  [
    // 대상(ORD_SPNL_TP) 조건이 앞 열이어도 카드에서는 맨 뒤로 간다.
    orow(1, "R-075", "A72", "GI Spangle 선택 오류", "선택오류", "ORD_SPNL_TP", {
      PRD_NM_CD: inList("G", "K", "V"),
      ORD_SPNL_TP: eq(6),
    }),
    orow(
      2,
      "R-077",
      "A72",
      "CCGI Spangle 선택 오류",
      "선택오류",
      "ORD_SPNL_TP",
      {
        PRD_NM_CD: inList("3", "6"),
        ORD_SPNL_TP: inList("1", "3", "6"),
      },
    ),
    orow(
      3,
      "R-081",
      "A722",
      "컬러원판 EXTRA SMOOTH ONLY",
      "선택오류",
      "ORD_SPNL_TP",
      {
        PRD_NM_CD: inList("3", "6", "9"),
        ORD_SPNL_TP: inList("1", "3", "6"),
      },
    ),
    orow(4, "R-068", "A61", "도금량코드 누락", "누락", "GW_ASG_CD", {
      PRD_NM_CD: eq("E"),
      GW_ASG_CD: isNull(),
    }),
    orow(5, "R-069", "A61", "도금량코드 누락", "누락", "GW_ASG_CD", {
      PRD_NM_CD: inList("E", "G"),
      GW_ASG_CD: isNull(),
    }),
    orow(6, "R-112", "A92", "조합폭10 오류", "선택오류", "ORD_MIX_WTH10", {
      ORD_MIX_WTH10: eq(0),
    }),
    orow(7, "R-C98", "A92", "조합폭10 오류", "선택오류", "ORD_MIX_WTH10", {
      ORD_MIX_WTH10: isNull(),
      ORD_EXC_WTH: range(800, 1101),
    }),
  ],
  "1.000",
  "COLLECT",
);

export const OC_CODES: CodeSet[] = [
  codeSet("QC_OC_FIELD", [
    {
      code: "PRD_NM_CD",
      name: "품명코드",
      attrs: ["code", "EAV|column", "", "40", ""],
    },
    {
      code: "ORD_SPNL_TP",
      name: "주문Spangle구분",
      attrs: ["code", "EAV", "", "4", ""],
    },
    {
      code: "GW_ASG_CD",
      name: "도금량지정코드",
      attrs: ["code", "EAV", "", "2", ""],
    },
    {
      code: "ORD_EXC_WTH",
      name: "주문환산폭",
      attrs: ["number", "column", "mm", "5", ""],
    },
    {
      code: "ORD_MIX_WTH10",
      name: "조합폭10",
      attrs: ["number", "EAV", "mm", "2", ""],
    },
  ]),
  codeSet("QC_OC_VALUE_LABEL", [
    {
      code: "PRD_NM_CD:G",
      name: "GI",
      lvl: ["PRD_NM_CD"],
      attrs: ["PRD_NM_CD", "G", "추정", "order#75 메시지"],
    },
  ]),
];
