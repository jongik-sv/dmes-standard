// TSK-08-03 design §3.2 — 입력 계약 표 계산(computeInputContract 래핑·행 묶음·base 대비 diff 4종·contractWarnings). 계산값이라 저장하지 않는다(불변 6).
import { describe, expect, it } from "vitest";

import type { InputContract } from "../../../src/contract/engine-contract.generated";
import { computeInputContract, type RuleDef } from "../../../src/evalex";
import {
  computeContract,
  contractOfView,
  contractWarnings,
  diffContract,
  expressionTexts,
  groupContractRows,
} from "../../../pages/dme/ruleEdit/sections/contract/contract-view";
import type { RuleEditView } from "../../../pages/dme/ruleEdit/types";
import { BASE_SPD_LKP, PROD_WGT_CALC, PROD_WGT_CALC_PV2, QLTY_GRD_JDG, resolveType } from "../../fixtures/evalex-rules";
import { ast } from "../../helpers/parse-expr";
import { draftView, sourceOf } from "./fixtures";

const names = (xs: { name: string }[]) => xs.map((x) => x.name);

describe("computeContract — computeInputContract 래핑", () => {
  it("PROD_WGT_CALC: 저장 형태에서 계산한 계약이 evalex 직접 계산과 같다(06:202 발췌 형태)", () => {
    const { src, asts } = sourceOf(PROD_WGT_CALC);
    const { contract, pending } = computeContract(src, asts, resolveType);
    expect(pending).toEqual([]);
    expect(contract).toEqual(computeInputContract(PROD_WGT_CALC, resolveType));
    expect(names(contract.always)).toEqual(["PROD_TYPE", "CALC_BASIS"]);
    const sorted = (xs: { name: string }[]) => names(xs).sort();
    expect(contract.rows.map((r) => ({ row: r.rowId, cond: r.cond, required: sorted(r.required), optional: sorted(r.optional) }))).toEqual([
      { row: 1, cond: "PROD_TYPE = COIL · CALC_BASIS = LEN", required: ["COIL_LEN", "COIL_THK", "COIL_WID", "SPEC_GRAV"], optional: [] },
      { row: 3, cond: "PROD_TYPE = COIL · CALC_BASIS = DIA", required: ["COIL_IN_DIA", "COIL_OUT_DIA", "COIL_VOID_RT", "COIL_WID", "SPEC_GRAV"], optional: [] },
      { row: 2, cond: "PROD_TYPE = SHEET", required: ["COIL_THK", "COIL_WID", "SHEET_CNT", "SHEET_LEN", "SPEC_GRAV"], optional: [] },
    ]);
  });

  it("BASE_SPD_LKP: 열 조건(grp_cond)이 읽는 TOP_RESIN_CD·COAT_SIDE 가 always 에 든다", () => {
    const texts: Record<number, string> = {
      2: 'STR_STARTS_WITH(TOP_RESIN_CD, "2")',
      3: 'STR_STARTS_WITH(TOP_RESIN_CD, "6")',
      4: 'TOP_RESIN_CD == "F"',
      5: 'STR_STARTS_WITH(TOP_RESIN_CD, "W") && COAT_SIDE == "1"',
      6: 'STR_STARTS_WITH(TOP_RESIN_CD, "W") && COAT_SIDE == "2"',
      7: 'STR_STARTS_WITH(TOP_RESIN_CD, "B") && COAT_SIDE == "1"',
      8: 'STR_STARTS_WITH(TOP_RESIN_CD, "B") && COAT_SIDE == "2"',
    };
    const { src } = sourceOf(BASE_SPD_LKP, texts);
    const asts = Object.fromEntries(Object.values(texts).map((t) => [t, ast(t)]));
    expect(expressionTexts(src).sort()).toEqual(Object.values(texts).sort());
    const { contract, pending } = computeContract(src, asts, resolveType);
    expect(pending).toEqual([]);
    expect(names(contract.always)).toEqual(["COIL_THK", "TOP_RESIN_CD", "COAT_SIDE"]);
    // 결과 열 그룹 이름(BASE_SPD)과 결과 변수는 계약에서 빠진다.
    expect(names(contract.always)).not.toContain("BASE_SPD");
  });

  it("아직 파싱하지 못한 식(서버 AST 없음)은 pending 으로 알리고 계산은 계속한다", () => {
    const texts: Record<number, string> = { 2: 'TOP_RESIN_CD == "F"' };
    const { src } = sourceOf({ ...BASE_SPD_LKP, vars: BASE_SPD_LKP.vars.slice(0, 2) }, texts);
    const { contract, pending } = computeContract(src, {}, resolveType);
    expect(pending).toEqual(['TOP_RESIN_CD == "F"']);
    expect(names(contract.always)).toEqual(["COIL_THK"]);
  });

  it("타입 해석기를 안 주면 룰 열에 있는 변수는 그 타입이고 없는 변수는 이름만 채운다", () => {
    const { src, asts } = sourceOf(PROD_WGT_CALC);
    const { contract } = computeContract(src, asts);
    expect(contract.always.map((v) => v.name)).toEqual(["PROD_TYPE", "CALC_BASIS"]);
    expect(contract.rows[0].required.map((v) => v.name)).toContain("SPEC_GRAV");
  });
});

describe("groupContractRows — 필수·선택 집합이 같은 행 묶기", () => {
  it("PROD_WGT_CALC 는 행마다 필수가 달라 3묶음이고, 묶음마다 행 조건 요약을 가진다", () => {
    const { src, asts } = sourceOf(PROD_WGT_CALC);
    const groups = groupContractRows(computeContract(src, asts, resolveType).contract);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.rowIds)).toEqual([[1], [3], [2]]);
    expect(groups[0].conds).toEqual(["PROD_TYPE = COIL · CALC_BASIS = LEN"]);
  });

  it("QLTY_GRD_JDG 는 결과 식이 상수인 행끼리 한 묶음이고 BASE_FCT 를 쓰는 행은 따로다", () => {
    const { src, asts } = sourceOf(QLTY_GRD_JDG);
    const groups = groupContractRows(computeContract(src, asts, resolveType).contract);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.rowIds.length === 3)!.rowIds).toEqual([1, 2, 4]);
    expect(groups.find((g) => g.rowIds.length === 3)!.conds).toHaveLength(3);
    expect(groups.find((g) => g.rowIds.length === 1)!.required).toEqual(["BASE_FCT"]);
  });

  it("묶음 키는 이름 순서와 무관하다(필수·선택 각각 정렬)", () => {
    const c: InputContract = {
      always: [],
      rows: [
        { rowId: 1, cond: "a", required: [{ name: "B", dataType: "NUMBER" }, { name: "A", dataType: "NUMBER" }], optional: [] },
        { rowId: 2, cond: "b", required: [{ name: "A", dataType: "NUMBER" }, { name: "B", dataType: "NUMBER" }], optional: [] },
      ],
    };
    expect(groupContractRows(c)).toHaveLength(1);
  });

  it("필수가 같아도 선택 집합이 다르면 다른 묶음이다", () => {
    const n = (name: string) => ({ name, dataType: "NUMBER" as const });
    const c: InputContract = {
      always: [],
      rows: [
        { rowId: 1, cond: "a", required: [n("A")], optional: [n("X")] },
        { rowId: 2, cond: "b", required: [n("A")], optional: [] },
      ],
    };
    expect(groupContractRows(c).map((g) => g.rowIds)).toEqual([[1], [2]]);
  });
});

describe("diffContract — base(RELEASED) 계약 대비 4종", () => {
  const vt = (name: string) => ({ name, dataType: "NUMBER" as const });
  const contract = (always: string[], required: string[], optional: string[] = []): InputContract => ({
    always: always.map(vt),
    rows: [{ rowId: 1, cond: "-", required: required.map(vt), optional: optional.map(vt) }],
  });
  const kinds = (d: ReturnType<typeof diffContract>) => d.map((x) => `${x.kind}:${x.name}:${x.severity}`);

  it("필수가 늘었다 = 경고", () => {
    expect(kinds(diffContract(contract([], ["A"]), contract([], ["A", "B"])))).toEqual(["REQUIRED_ADDED:B:WARNING"]);
  });

  it("선택 → 필수 = 경고", () => {
    expect(kinds(diffContract(contract([], [], ["A"]), contract([], ["A"])))).toEqual(["OPTIONAL_TO_REQUIRED:A:WARNING"]);
  });

  it("필수가 빠졌다 = 알림", () => {
    expect(kinds(diffContract(contract([], ["A", "B"]), contract([], ["A"])))).toEqual(["REQUIRED_REMOVED:B:INFO"]);
  });

  it("필수 → 선택 = 알림", () => {
    expect(kinds(diffContract(contract([], ["A"]), contract([], [], ["A"])))).toEqual(["REQUIRED_TO_OPTIONAL:A:INFO"]);
  });

  it("조건 변수(always)가 늘거나 줄어도 필수가 늘거나 빠진 것으로 본다", () => {
    expect(kinds(diffContract(contract(["A"], []), contract(["A", "K"], [])))).toEqual(["REQUIRED_ADDED:K:WARNING"]);
    expect(kinds(diffContract(contract(["A", "K"], []), contract(["A"], [])))).toEqual(["REQUIRED_REMOVED:K:INFO"]);
  });

  it("같은 계약이거나 선택만 늘고 줄면 diff 가 없다", () => {
    expect(diffContract(contract(["A"], ["B"]), contract(["A"], ["B"]))).toEqual([]);
    expect(diffContract(contract([], []), contract([], [], ["X"]))).toEqual([]);
  });

  it("PROD_WGT_CALC PV1 → PV2: SPEC_GRAV 필수 → 선택은 알림 하나뿐이다(경고 없음)", () => {
    const a = sourceOf(PROD_WGT_CALC);
    const b = sourceOf(PROD_WGT_CALC_PV2);
    const d = diffContract(computeContract(a.src, a.asts, resolveType).contract, computeContract(b.src, b.asts, resolveType).contract);
    expect(kinds(d)).toEqual(["REQUIRED_TO_OPTIONAL:SPEC_GRAV:INFO"]);
    expect(contractWarnings(d)).toEqual([]);
  });

  it("contractWarnings 는 경고만 확정 화면 확인란용 문장으로 돌려준다", () => {
    const d = diffContract(contract([], ["A"], []), contract([], ["A", "B"]));
    expect(contractWarnings(d)).toEqual([d[0].message]);
    expect(d[0].message).toContain("B");
  });
});

describe("contractOfView — view 응답(baseVars·baseRows)에서 계약과 diff", () => {
  function viewOf(cur: RuleDef, base: RuleDef): RuleEditView {
    const c = sourceOf(cur).src;
    const b = sourceOf(base).src;
    return { ...draftView("me", "me"), rule: { ...draftView("me", "me").rule, maruRuleId: "PROD_WGT_CALC" }, vars: c.vars, varMeta: c.meta, rows: c.rows, baseVars: b.vars, baseRows: b.rows };
  }

  it("DRAFT(base_ver 있음)는 base 대비 diff 를 만든다 — 필수 → 선택은 알림이라 contractWarnings 는 비어 있다", () => {
    const r = contractOfView(viewOf(PROD_WGT_CALC_PV2, PROD_WGT_CALC), {});
    expect(r.diffs.map((d) => `${d.kind}:${d.name}`)).toEqual(["REQUIRED_TO_OPTIONAL:SPEC_GRAV"]);
    expect(r.contractWarnings).toEqual([]);
  });

  it("필수가 늘면 contractWarnings 에 문장이 실린다(확정 화면 확인란 데이터)", () => {
    const r = contractOfView(viewOf(PROD_WGT_CALC, PROD_WGT_CALC_PV2), {});
    expect(r.diffs.map((d) => d.kind)).toEqual(["OPTIONAL_TO_REQUIRED"]);
    expect(r.contractWarnings).toHaveLength(1);
    expect(r.contractWarnings[0]).toContain("SPEC_GRAV");
  });

  // BASE_SPD_LKP: 열 조건(grp_cond)이 TOP_RESIN_CD·COAT_SIDE 를 읽어 필수가 된다. base(v1)는 열 조건이 없던 버전으로 본다.
  const GRP_TEXTS: Record<number, string> = {
    2: 'STR_STARTS_WITH(TOP_RESIN_CD, "2")',
    3: 'STR_STARTS_WITH(TOP_RESIN_CD, "6")',
    4: 'TOP_RESIN_CD == "F"',
    5: 'STR_STARTS_WITH(TOP_RESIN_CD, "W") && COAT_SIDE == "1"',
    6: 'STR_STARTS_WITH(TOP_RESIN_CD, "W") && COAT_SIDE == "2"',
    7: 'STR_STARTS_WITH(TOP_RESIN_CD, "B") && COAT_SIDE == "1"',
    8: 'STR_STARTS_WITH(TOP_RESIN_CD, "B") && COAT_SIDE == "2"',
  };
  function grpView(withBaseMeta: boolean): { v: RuleEditView; asts: Record<string, ReturnType<typeof ast>> } {
    const { src } = sourceOf(BASE_SPD_LKP, GRP_TEXTS);
    const noGrp = src.meta.map((m) => ({ ...m, grpCond: null }));
    const cur = draftView("me", "me");
    const v: RuleEditView = {
      ...cur,
      rule: { ...cur.rule, maruRuleId: "BASE_SPD_LKP" },
      vars: src.vars,
      varMeta: src.meta,
      rows: src.rows,
      baseVars: src.vars,
      baseRows: src.rows,
      ...(withBaseMeta ? { baseVarMeta: noGrp } : {}),
    };
    return { v, asts: Object.fromEntries(Object.values(GRP_TEXTS).map((t) => [t, ast(t)])) };
  }

  it("DRAFT 에서 grp_cond 가 새 변수를 참조하면 필수 입력 증가 경고가 난다(base 는 baseVarMeta 로 계산한다)", () => {
    const { v, asts } = grpView(true);
    const r = contractOfView(v, asts);
    expect(r.contractWarnings.some((w) => w.includes("TOP_RESIN_CD"))).toBe(true);
    expect(r.contractWarnings.some((w) => w.includes("COAT_SIDE"))).toBe(true);
  });

  it("baseVarMeta 가 없으면(옛 응답) base 도 지금 varMeta 로 계산한다 — 열 조건 변경은 잡히지 않는다(기존 동작)", () => {
    const { v, asts } = grpView(false);
    expect(contractOfView(v, asts).diffs).toEqual([]);
  });

  it("baseVars 가 없거나 base_ver 가 없으면 diff 없이 지금 계약만 계산한다", () => {
    const v = viewOf(PROD_WGT_CALC, PROD_WGT_CALC);
    expect(contractOfView({ ...v, baseVars: undefined }, {}).base).toBeNull();
    expect(contractOfView({ ...v, baseVars: undefined }, {}).current).not.toBeNull();
    const noBase = { ...v, versions: v.versions.map((x) => ({ ...x, baseVer: null })) };
    expect(contractOfView(noBase, {}).diffs).toEqual([]);
  });
});
