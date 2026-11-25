// 생산가부관리(qdf) 순수 로직 시험 — 셀 조건 풀이, 주문단중 매트릭스, 생산가부 칸 펼치기, 주문정합성 문장·결과 풀이.
import { describe, expect, it } from "vitest";

import { parseCell, testCond } from "@/qdf/shared/cond";
import {
  buildWeightMatrix,
  cellKey,
  feasibleSplits,
  limitOf,
  rangeMismatches,
  weightChanges,
} from "@/qdf/orderWeightError/weight";
import {
  expandGroup,
  feasChanges,
  groupOfMaterial,
  groupsOf,
  isOverlay,
  locate,
  parseAxis,
  sheetsOf,
  statesOf,
} from "@/qdf/productionFeasibility/feasibility";
import {
  fieldsOf,
  filterRules,
  groupByTarget,
  EMPTY_FILTER,
  toOcRules,
  valueLabelsOf,
} from "@/qdf/orderConsistency/model";
import { josa, phraseText, rulePhrases } from "@/qdf/orderConsistency/sentence";
import {
  buildOrderInput,
  explain,
  fireBlocks,
  formatErrors,
  orderFromRule,
} from "@/qdf/orderConsistency/simulate";
import { SIM_BASE, SIM_PRESETS } from "@/qdf/orderConsistency/presets";
import { REVIEW_ISSUES } from "@/qdf/orderConsistency/issues";

import {
  FEAS_CODES,
  FEAS_RULE,
  OC_CODES,
  OC_RULE,
  range,
  WEIGHT_LIMIT,
  WEIGHT_V1,
  WEIGHT_V2,
} from "./fixtures";

describe("셀 조건", () => {
  it("범위 셀은 경계 포함 여부를 읽고, 숫자 변수는 숫자로 비교한다", () => {
    const c = parseCell(range(0.24, 0.3));
    expect(c).toMatchObject({
      op: "BETWEEN",
      low: "0.24",
      high: "0.3",
      lowInclusive: true,
      highInclusive: false,
    });
    expect(testCond(c, "0.24", true)).toBe("P");
    expect(testCond(c, "0.3", true)).toBe("F");
    expect(testCond(c, "", true)).toBe("N");
    expect(testCond(c, "abc", true)).toBe("X");
  });
  it("빈 값은 IS_NULL 만 참이고 0 은 빈 값이 아니다", () => {
    const isNull = parseCell({ op: "IS_NULL", summary: "IS NULL" });
    expect(testCond(isNull, null, true)).toBe("P");
    expect(testCond(isNull, "0", true)).toBe("F");
    const eq0 = parseCell({ op: "EQ", left: "0", summary: "= 0" });
    expect(testCond(eq0, null, true)).toBe("N");
    expect(testCond(eq0, "0", true)).toBe("P");
  });
});

describe("주문단중 매트릭스", () => {
  it("단중 × 분할 칸 — 허용범위 칸 수와 계산값과 다른 수정값을 센다", () => {
    const m = buildWeightMatrix(WEIGHT_V2);
    expect(m.weights).toEqual([15, 24]);
    expect(m.splits).toEqual([2, 3, 5, 6]);
    expect(m.inRangeCount).toBe(3);
    expect(m.editedCount).toBe(1);
    const c = m.cells.get(cellKey(24, 6))!;
    expect(c).toMatchObject({
      value: 4.05,
      base: 4,
      edited: true,
      inRange: true,
    });
    expect(feasibleSplits(m, 24)).toEqual([5, 6]);
    expect(buildWeightMatrix(WEIGHT_V1).editedCount).toBe(0);
  });
  it("허용 범위는 코드 MIN·MAX, 룰 결과와 어긋난 칸을 고른다", () => {
    const limit = limitOf([WEIGHT_LIMIT]);
    expect(limit).toEqual({ min: 4, max: 5, unit: "MT/개" });
    expect(limitOf([])).toBeNull();
    expect(rangeMismatches(buildWeightMatrix(WEIGHT_V2), limit)).toEqual([]);
    expect(
      rangeMismatches(buildWeightMatrix(WEIGHT_V2), {
        min: 4.5,
        max: 5,
        unit: "",
      }).map((c) => `${c.weight}x${c.split}`),
    ).toEqual(["24x6"]);
  });
  it("수정 이력 — 새 버전 먼저, 칸 수정과 최초 등록", () => {
    const rows = weightChanges([
      {
        ...WEIGHT_V1,
        ver: "1.000",
        applyFrom: "2026-11-01 00:00:00",
        applyTo: null,
      },
      {
        ...WEIGHT_V2,
        ver: "1.001",
        applyFrom: "2026-11-20 09:00:00",
        applyTo: null,
      },
    ]);
    expect(rows.map((r) => [r.ver, r.kind, r.item, r.before, r.after])).toEqual(
      [
        [
          "1.001",
          "셀 수정",
          "단중 24.0 × 6분할",
          "4.00 (범위 내)",
          "4.05 (범위 내)",
        ],
        ["1.000", "최초 등록", "단중 2단 × 분할 4열", "", "4셀 · 범위 내 3셀"],
      ],
    );
  });
});

describe("생산가부 시트", () => {
  const sheets = sheetsOf(FEAS_CODES, ["QD_FEAS_2CGL_GI", "QD_FEAS_X"]);
  const groups = groupsOf(FEAS_CODES, sheets[0], FEAS_RULE);
  const states = statesOf(FEAS_CODES);
  const seed = (g: (typeof groups)[number]) =>
    expandGroup(FEAS_RULE, g).map((r) => r.map((c) => c.state ?? ".").join(""));

  it("시트 머리·재질 그룹은 코드에서, 코드가 없는 룰은 룰 제목으로", () => {
    expect(sheets[0]).toMatchObject({
      key: "S1",
      tab: "B.D 생산범위(2CGL GI)",
      rev: "[개정일 : '25.03.31]",
      notes: ["-. 내경 508Py 권취 가능", "-. 생산가능 후처리"],
      post: {
        heads: ["구분\n(후처리 Code)", "무처리\n(MX)"],
        rows: [["GI", "O"]],
      },
    });
    expect(sheets[1].key).toBe("QD_FEAS_X");
    expect(groups.map((g) => g.code)).toEqual(["S1-G1", "S1-G2"]);
    expect(groups[0].materials).toEqual(["1A", "AA"]);
    expect(groups[1].overlay).toEqual({
      rows: 1,
      cols: 1,
      text: "주석",
      red: true,
    });
    expect(states.find((s) => s.code === "P")?.background).toBe(
      "var(--color-primary-soft)",
    );
  });
  it("합친 행을 칸으로 되편다(시트와 같은 상태)", () => {
    expect(seed(groups[0])).toEqual(["-PP-", "PPPC", "PPPP"]);
    expect(seed(groups[1])).toEqual(["..", ".."]); // 행 없는 그룹 = 해당 없음
    expect(isOverlay(groups[1], 0, 0)).toBe(true);
    expect(isOverlay(groups[1], 0, 1)).toBe(false);
  });
  it("코드가 없으면 축을 행에서 뽑는다(칸 상태는 같다)", () => {
    const fallback = groupsOf([], { key: "QD_FEAS_2CGL_GI" }, FEAS_RULE);
    expect(fallback.map((g) => g.code)).toEqual(["S1-G1"]);
    expect(fallback[0].widths.map((a) => a.value)).toEqual([1260, 1230, 650]);
    expect(fallback[0].thicks.map((a) => a.value)).toEqual([0.24, 0.3, 1]);
    expect(
      expandGroup(FEAS_RULE, fallback[0]).map((r) =>
        r.map((c) => c.state).join(""),
      ),
    ).toEqual(["-P-", "PPC", "PPP"]);
  });
  it("값 → 칸 — 폭은 윗칸 미만, 두께는 다음 칸 미만, 끝 칸은 그 값만", () => {
    const g = groups[0];
    expect(parseAxis("1260,650↑").map((a) => a.label)).toEqual([
      "1260",
      "650↑",
    ]);
    expect(locate(g.widths, 1260, "width")).toBe(0);
    expect(locate(g.widths, 1259, "width")).toBe(1);
    expect(locate(g.widths, 700, "width")).toBe(2);
    expect(locate(g.widths, 600, "width")).toBe(-1);
    expect(locate(g.thicks, 0.45, "thick")).toBe(1);
    expect(locate(g.thicks, 1, "thick")).toBe(3);
    expect(locate(g.thicks, 1.2, "thick")).toBe(-1);
    expect(groupOfMaterial(groups, "ea")?.code).toBe("S1-G2");
  });
  it("수정 이력 — 버전끼리 다른 칸만", () => {
    const v2 = {
      ...FEAS_RULE,
      ver: "1.001",
      rows: FEAS_RULE.rows.map((r) =>
        r.seq === 5 ? { ...r, results: { FEAS_STAT: "X" } } : r,
      ),
    };
    const rows = feasChanges(sheets[0], groups, [FEAS_RULE, v2], states);
    expect(rows.map((r) => [r.ver, r.kind, r.item, r.before, r.after])).toEqual(
      [
        [
          "1.001",
          "셀 수정",
          "[2CGL GI · CQ, Gr-A] 폭 1230 × 두께 1",
          "조건부 생산",
          "생산불가(검증 완료)",
        ],
        ["1.000", "최초 등록", "2CGL GI · 재질 그룹 2종", "", "룰 행 6개"],
      ],
    );
  });
});

describe("주문정합성", () => {
  const rules = toOcRules(OC_RULE);
  const fields = fieldsOf(OC_RULE, OC_CODES);
  const labels = valueLabelsOf(OC_CODES);
  const labelOf = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
  const byKey = (k: string) => rules.find((r) => r.key === k)!;

  it("룰 카드 — 대상 항목 조건을 맨 뒤로, 결과를 읽는다", () => {
    const r = byKey("R-075");
    expect(r.conds.map((c) => c.field)).toEqual(["PRD_NM_CD", "ORD_SPNL_TP"]);
    expect(r).toMatchObject({
      errCode: "A72",
      target: "ORD_SPNL_TP",
      actor: "등록자",
    });
    expect(fields.map((f) => [f.key, f.type])).toContainEqual([
      "ORD_EXC_WTH",
      "number",
    ]);
    expect(
      fieldsOf(OC_RULE, []).find((f) => f.key === "ORD_EXC_WTH")?.type,
    ).toBe("number");
  });
  it("조건 문장 — 조사·연결 어미·값 라벨·접기", () => {
    expect(josa("품명코드", "가", "이")).toBe("가");
    expect(josa("주문환산폭", "가", "이")).toBe("이");
    expect(josa("A1", "가", "이")).toBe("이");
    const p = rulePhrases(byKey("R-075").conds, labelOf, labels);
    expect(p.map((x) => phraseText(x))).toEqual([
      "품명코드가 G(GI)·K·V 중 하나이고",
      "주문Spangle구분이 6이면",
    ]);
    expect(p[0].estimated).toBe(true);
    const list = rulePhrases(byKey("R-068").conds, labelOf, labels, "list");
    expect(list.map((x) => phraseText(x))).toEqual([
      "품명코드가 E임",
      "도금량지정코드가 입력 없음",
    ]);
    const wide = rulePhrases(
      [
        {
          field: "PRD_NM_CD",
          cond: parseCell({
            op: "NOT_IN",
            list: ["1", "2", "3", "4", "5", "6", "7"],
            summary: "",
          }),
        },
      ],
      labelOf,
      labels,
    );
    expect(phraseText(wide[0], true)).toBe(
      "품명코드가 1·2·3 외 4개 외의 값이면",
    );
    const between = rulePhrases(byKey("R-C98").conds, labelOf, labels, "list");
    expect(phraseText(between[0])).toBe("주문환산폭이 800 이상 ~ 1101 미만");
  });
  it("룰 거르기 — 에러코드 정확 일치·키워드·대상 묶음", () => {
    expect(
      filterRules(rules, { ...EMPTY_FILTER, errCode: "a72" }, labelOf).map(
        (r) => r.key,
      ),
    ).toEqual(["R-075", "R-077"]);
    expect(
      filterRules(rules, { ...EMPTY_FILTER, keyword: "조합폭" }, labelOf).map(
        (r) => r.key,
      ),
    ).toEqual(["R-112", "R-C98"]);
    expect(
      groupByTarget(rules, labelOf).map((g) => [g.target, g.rules.length]),
    ).toEqual([
      ["ORD_SPNL_TP", 3],
      ["GW_ASG_CD", 2],
      ["ORD_MIX_WTH10", 2],
    ]);
  });
  it("서버 입력 — 조건 키 전부, 빈칸은 null, 숫자 칸 형식 검사", () => {
    const input = buildOrderInput(fields, {
      PRD_NM_CD: " G ",
      ORD_MIX_WTH10: "0",
    });
    expect(input).toEqual({
      PRD_NM_CD: "G",
      ORD_SPNL_TP: null,
      GW_ASG_CD: null,
      ORD_EXC_WTH: null,
      ORD_MIX_WTH10: "0",
    });
    expect(formatErrors(fields, { ORD_EXC_WTH: "12a" })).toEqual([
      { field: "ORD_EXC_WTH", label: "주문환산폭", value: "12a" },
    ]);
  });
  it("결과 풀이 — 접기·분류 정렬·동시발화 묶음·미입력 집계", () => {
    // 품명 3·Spangle 3 → R-077(A72)·R-081(A722) 이 같은 항목·같은 분류라 동시발화 한 상자.
    const order = { PRD_NM_CD: "3", ORD_SPNL_TP: "3" };
    const out = explain(rules, new Set([2, 3]), order, fields);
    expect(out.fired.map((f) => [f.rule.key, f.coGroup])).toEqual([
      ["R-077", "ORD_SPNL_TP"],
      ["R-081", "ORD_SPNL_TP"],
    ]);
    expect(fireBlocks(out.fired).map((b) => [b.co, b.items.length])).toEqual([
      [true, 2],
    ]);
    // R-112(= 0)·R-C98(폭 범위) 은 빈칸 때문에 평가하지 못한다.
    expect(out.skippedByNull).toBe(2);
    expect(out.nullFields.map((n) => [n.field, n.rules])).toEqual([
      ["ORD_MIX_WTH10", 1],
      ["ORD_EXC_WTH", 1],
    ]);
    expect(out.mismatches).toEqual([]);

    const missing = explain(rules, new Set([4, 5]), { PRD_NM_CD: "E" }, fields);
    expect(missing.fired.map((f) => [f.rule.key, f.folded])).toEqual([
      ["R-068", ["R-069"]],
    ]);
    expect(missing.fired[0].checks.map((c) => c.state)).toEqual(["P", "P"]);
  });
  it("룰에서 만든 주문은 그 룰을 발화시킨다", () => {
    for (const r of rules) {
      const order = orderFromRule(r, SIM_BASE, fields);
      const checks = r.conds.map((c) =>
        testCond(
          c.cond,
          order[c.field] ?? null,
          fields.find((f) => f.key === c.field)?.type === "number",
        ),
      );
      expect(checks.every((s) => s === "P")).toBe(true);
    }
  });
  it("프리셋 5건과 검토 이슈 15건", () => {
    expect(SIM_PRESETS.map((p) => [p.key, p.expect])).toEqual([
      ["p1", ["R-075"]],
      ["p2", ["R-068"]],
      ["p3", ["R-133"]],
      ["p4", []],
      ["p5", ["R-C98"]],
    ]);
    expect(SIM_PRESETS[0].order.CCL_BOM_NO).toBeUndefined();
    expect(SIM_PRESETS[4].order.ORD_MIX_WTH9).toBe("100");
    expect(REVIEW_ISSUES).toHaveLength(15);
    expect(REVIEW_ISSUES.filter((i) => i.type === "conflict")).toHaveLength(3);
  });
});
