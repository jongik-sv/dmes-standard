// TSK-08-02 — 룰 화면 테스트 공용 view 응답(06 샘플 QLTY_GRD_JDG 를 저장 형태로).
import type { AstNode } from "../../../src/contract/engine-contract.generated";
import type { RuleDef, RuleVarDef } from "../../../src/evalex";
import type { ContractSource } from "../../../pages/dme/ruleEdit/sections/contract/contract-view";
import type { ResolvedVar, RuleEditView, VarMeta } from "../../../pages/dme/ruleEdit/types";

export const SAMPLE_VARS: RuleEditView["vars"] = [
  { varId: 1, varKind: "COND", dispType: "2", seq: 1, varName: "COIL_THK", exprVar: false, label: "두께", dataType: "NUMBER", scale: 2, dateString: false, maruCodeId: null, domainId: 1, domainName: "코일 두께", typeSource: "COLUMN", description: "코일 한 개의 두께" },
  { varId: 2, varKind: "COND", dispType: "1", seq: 2, varName: "COIL_WID", exprVar: false, label: "폭", dataType: "NUMBER", scale: 0, dateString: false, maruCodeId: null, domainId: 2, domainName: "코일 폭", typeSource: "COLUMN", description: null },
  { varId: 3, varKind: "COND", dispType: "1", seq: 3, varName: "SURF_GRD", exprVar: false, label: "표면등급", dataType: "STRING", scale: null, dateString: false, maruCodeId: null, domainId: 3, domainName: "표면 등급", typeSource: "COLUMN", description: null },
  { varId: 4, varKind: "RESULT", dispType: "Value", seq: 1, varName: "QLTY_GRD", exprVar: false, label: "판정등급", dataType: "STRING", scale: null, dateString: false, maruCodeId: null, domainId: null, domainName: null, typeSource: "DECLARED", description: null },
  { varId: 5, varKind: "RESULT", dispType: "Value", seq: 2, varName: "PRC_FCT", exprVar: false, label: "단가계수", dataType: "NUMBER", scale: null, dateString: false, maruCodeId: null, domainId: null, domainName: null, typeSource: "DECLARED", description: null },
];

export const SAMPLE_ROWS: RuleEditView["rows"] = [
  { rowId: 1, seq: 1, rowKind: "NORMAL", cells: '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"GT","left":"1000"},"3":{"op":"IN","list":["A"]},"4":{"val":"A"},"5":{"val":"1.05"}}', note: "광폭 A급" },
  { rowId: 2, seq: 2, rowKind: "NORMAL", cells: '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"GT","left":"1000"},"3":{"op":"IN","list":["B"]},"4":{"val":"B"},"5":{"val":"1.00"}}', note: "광폭 B급" },
  { rowId: 3, seq: 3, rowKind: "NORMAL", cells: '{"1":{"op":"GE","left":"2.5"},"2":{"op":"NA"},"3":{"op":"NOT_IN","list":["C"]},"4":{"val":"B"},"5":{"val":"0.98"}}', note: "후물" },
  { rowId: 4, seq: 0, rowKind: "DEFAULT", cells: '{"4":{"val":"C"},"5":{"val":"0.90"}}', note: null },
];

/** 버전 2 DRAFT(소유자 owner) + 버전 1 RELEASED. */
export function draftView(owner: string | null, me = "e2e_mdm_steward", overrides: Partial<RuleEditView> = {}): RuleEditView {
  const mine = owner === me;
  return {
    me,
    editable: mine,
    headerEditable: mine,
    unappliedVersionExists: true,
    confirmScreenReady: false,
    rule: {
      maruRuleId: "QLTY_GRD_JDG",
      maruRuleName: "품질 등급 판정",
      ruleKind: "DECISION",
      status: "INUSE",
      sourceKind: "MDM",
      sourceSystem: null,
      description: "설명",
      usageNote: "3CCL 출측 판정",
    },
    versions: [
      { ver: 2, status: "DRAFT", applyFrom: null, applyTo: null, ownerId: owner, baseVer: 1, hitPolicy: "FIRST", rowVersion: 3 },
      { ver: 1, status: "RELEASED", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00", ownerId: null, baseVer: null, hitPolicy: "FIRST", rowVersion: 0 },
    ],
    selectedVer: 2,
    vars: SAMPLE_VARS,
    rows: SAMPLE_ROWS,
    baseRows: SAMPLE_ROWS,
    issues: [],
    usage: {
      usageNote: "3CCL 출측 판정",
      sets: [{ setId: "LS_E2E", setName: "E2E 룰 세트", status: "INUSE", dependsOn: ["BASE_SPD_LKP"], dependedBy: [] }],
    },
    ...overrides,
  };
}

/** 버전 1 RELEASED 만 있는 룰(미적용 버전 없음). */
export function releasedView(me = "e2e_mdm_steward", overrides: Partial<RuleEditView> = {}): RuleEditView {
  const base = draftView(null, me);
  return {
    ...base,
    editable: false,
    headerEditable: true,
    unappliedVersionExists: false,
    versions: [base.versions[1]],
    selectedVer: 1,
    baseRows: [],
    ...overrides,
  };
}

const DISP: Record<RuleVarDef["dispType"], ResolvedVar["dispType"]> = { EQUAL: "Equal", ONE: "1", TWO: "2", EXPRESSION: "Expression", VALUE: "Value" };

/** evalex 테스트 룰 → 화면이 view 로 받는 저장 형태(ResolvedVar·varMeta·StoredRow). 식 텍스트는 `texts`(varId → 텍스트)로 준다. */
export function sourceOf(rule: RuleDef, texts: Record<number, string> = {}): { src: ContractSource; asts: Record<string, AstNode> } {
  const asts: Record<string, AstNode> = {};
  const vars: ResolvedVar[] = rule.vars.map((v) => {
    const exprVar = v.varKind === "COND" && v.exprAst != null;
    if (exprVar) asts[texts[v.varId]] = v.exprAst!;
    return {
      varId: v.varId,
      varKind: v.varKind,
      dispType: DISP[v.dispType],
      seq: v.seq,
      varName: exprVar ? texts[v.varId] : v.varName,
      exprVar,
      label: v.label ?? null,
      dataType: v.dataType,
      scale: v.scale ?? null,
      dateString: false,
      typeSource: "COLUMN",
    };
  });
  const meta: VarMeta[] = rule.vars.map((v) => {
    if (v.grpCondAst) asts[texts[v.varId]] = v.grpCondAst;
    return { varId: v.varId, axis: "NONE", resGrp: v.resGrp ?? null, grpCond: v.grpCondAst ? texts[v.varId] : null };
  });
  const rows = rule.rows.map((r) => ({ rowId: r.rowId, seq: r.seq, rowKind: r.rowKind, cells: JSON.stringify(r.cells), note: null }));
  return { src: { ruleId: rule.ruleId, ruleKind: rule.ruleKind, hitPolicy: rule.hitPolicy, vars, meta, rows }, asts };
}

