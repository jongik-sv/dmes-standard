/**
 * 입력 계약 계산(TSK-08-03 design §2.1) — 저장하지 않는 계산값이다(불변 6): 엔티티·칼럼·마이그레이션을 더하지 않고, 화면이 view 응답의
 * 변수·행·`varMeta` 로 evalex `computeInputContract` 를 돌려 그린다. 필수/선택은 AST NULL 가드 분석이 정하고 사전 `required` 는 쓰지 않는다.
 *
 * 식 변수·열 조건(grp_cond)의 AST 는 view 에 실려 오지 않으므로 서버 `parseExpr` 가 준 AST(텍스트 → AST)를 받아 쓴다(화면 JS 파서 금지, 불변 9).
 * AST 가 아직 없는 식은 `pending` 으로 알리고 그 참조 변수는 계약에서 빠진다.
 */
import type { AstNode, InputContract, VarType } from "@/contract/engine-contract.generated";
import { computeInputContract, type RuleDef, type RuleVarDef } from "@/evalex";

import { ruleDefFromStored } from "../../decision-table/grid-model";
import type { HitPolicyCode, ResolvedVar, RuleEditView, StoredRow, VarMeta } from "../../types";

/** 계약을 계산할 한 버전의 저장 형태. */
export interface ContractSource {
  ruleId: string;
  ruleKind: "DECISION" | "DERIVE";
  hitPolicy: HitPolicyCode | null;
  vars: ResolvedVar[];
  meta: VarMeta[];
  rows: StoredRow[];
}

/** 서버가 파싱한 식 텍스트 → AST. */
export type AstByText = Record<string, AstNode>;

export interface ContractResult {
  contract: InputContract;
  /** AST 를 못 받은 식 텍스트 — 그 참조 변수는 계약에서 빠졌다. */
  pending: string[];
}

/** 서버 파싱이 필요한 식 텍스트 — 조건 식 변수(변수 이름 자리에 식)와 열 조건. 중복 없이 처음 나온 순서. */
export function expressionTexts(src: Pick<ContractSource, "vars" | "meta">): string[] {
  const out: string[] = [];
  const push = (t: string | null | undefined) => {
    const text = t?.trim();
    if (text && !out.includes(text)) out.push(text);
  };
  for (const v of src.vars) if (v.varKind === "COND" && v.exprVar) push(v.varName);
  for (const m of src.meta) push(m.grpCond);
  return out;
}

/** 룰 열의 타입 → 없는 이름은 STRING 이름뿐인 타입(표시는 이름 위주). */
function typeResolverOf(vars: readonly ResolvedVar[]): (name: string) => VarType {
  const byName = new Map<string, ResolvedVar>();
  for (const v of vars) if (v.varName && !v.exprVar) byName.set(v.varName.toUpperCase(), v);
  return (name) => {
    const v = byName.get(name.toUpperCase());
    return v
      ? { name, dataType: v.dataType, scale: v.scale ?? null, domainId: v.domainId != null ? String(v.domainId) : null }
      : { name, dataType: "STRING", scale: null, domainId: null };
  };
}

/** 저장 형태 → evalex `RuleDef`. 식 변수 참조·열 조건 AST·결과 열 그룹은 varMeta·서버 AST 로 채운다. */
function toRuleDef(src: ContractSource, asts: AstByText, pending: string[]): RuleDef {
  const base = ruleDefFromStored(src.ruleId, src.ruleKind, src.hitPolicy, src.vars, src.rows);
  const vars: RuleVarDef[] = base.vars.map((d) => {
    const v = src.vars.find((x) => x.varId === d.varId)!;
    const m = src.meta.find((x) => x.varId === d.varId);
    const out: RuleVarDef = { ...d };
    if (v.varKind === "COND" && v.exprVar) {
      const text = v.varName?.trim() ?? "";
      const a = asts[text];
      if (a) out.exprAst = a;
      else {
        out.refVars = [];
        if (text && !pending.includes(text)) pending.push(text);
      }
    }
    if (v.varKind === "RESULT") {
      out.resGrp = m?.resGrp?.trim() ? m.resGrp : null;
      const text = m?.grpCond?.trim() ?? "";
      if (text) {
        const a = asts[text];
        if (a) out.grpCondAst = a;
        else if (!pending.includes(text)) pending.push(text);
      }
    }
    return out;
  });
  return { ...base, vars };
}

/** 입력 계약 계산 — `typeOf` 를 안 주면 룰 열의 타입을 쓴다(없는 이름은 이름뿐). */
export function computeContract(src: ContractSource, asts: AstByText, typeOf?: (name: string) => VarType): ContractResult {
  const pending: string[] = [];
  const rule = toRuleDef(src, asts, pending);
  return { contract: computeInputContract(rule, typeOf ?? typeResolverOf(src.vars)), pending };
}

/** 필수·선택 변수 집합이 같은 행을 한 줄로 묶은 것. */
export interface ContractGroup {
  key: string;
  rowIds: number[];
  /** 묶인 행마다의 조건 요약(rowIds 와 같은 순서). */
  conds: string[];
  required: string[];
  optional: string[];
}

/** 필수·선택 집합이 같은 행을 한 줄로 묶는다(키 `JSON.stringify([req.sort(), opt.sort()])`, 첫 등장 순). */
export function groupContractRows(contract: InputContract): ContractGroup[] {
  const groups: ContractGroup[] = [];
  const byKey = new Map<string, ContractGroup>();
  for (const r of contract.rows) {
    const required = r.required.map((v) => v.name);
    const optional = r.optional.map((v) => v.name);
    const key = JSON.stringify([[...required].sort(), [...optional].sort()]);
    let g = byKey.get(key);
    if (!g) {
      g = { key, rowIds: [], conds: [], required, optional };
      byKey.set(key, g);
      groups.push(g);
    }
    g.rowIds.push(r.rowId);
    g.conds.push(r.cond);
  }
  return groups;
}

export type ContractDiffKind = "REQUIRED_ADDED" | "OPTIONAL_TO_REQUIRED" | "REQUIRED_REMOVED" | "REQUIRED_TO_OPTIONAL";

export interface ContractDiff {
  kind: ContractDiffKind;
  /** 호출하는 쪽을 깨는 변경 = WARNING(필수 늘음·선택→필수), 아닌 변경 = INFO(필수 빠짐·필수→선택). */
  severity: "WARNING" | "INFO";
  name: string;
  message: string;
}

type Level = "REQUIRED" | "OPTIONAL" | "NONE";

/** 변수 이름 → 요구 수준. 조건 변수(always)와 어느 행에서든 필수면 REQUIRED, 선택으로만 나오면 OPTIONAL. */
function levels(c: InputContract): Map<string, Level> {
  const out = new Map<string, Level>();
  for (const r of c.rows) for (const v of r.optional) if (!out.has(v.name)) out.set(v.name, "OPTIONAL");
  for (const r of c.rows) for (const v of r.required) out.set(v.name, "REQUIRED");
  for (const v of c.always) out.set(v.name, "REQUIRED");
  return out;
}

/** base(RELEASED) 계약과 지금 계약을 견준 변경 4종. 저장·상신을 막지 않는다 — 확정 화면 확인란이 경고를 소비한다. */
export function diffContract(base: InputContract, current: InputContract): ContractDiff[] {
  const before = levels(base);
  const after = levels(current);
  const out: ContractDiff[] = [];
  const names = [...new Set([...before.keys(), ...after.keys()])];
  for (const name of names) {
    const b: Level = before.get(name) ?? "NONE";
    const a: Level = after.get(name) ?? "NONE";
    if (a === "REQUIRED" && b === "NONE") out.push({ kind: "REQUIRED_ADDED", severity: "WARNING", name, message: `필수 입력이 늘었습니다: ${name}` });
    else if (a === "REQUIRED" && b === "OPTIONAL")
      out.push({ kind: "OPTIONAL_TO_REQUIRED", severity: "WARNING", name, message: `선택 입력이 필수가 되었습니다: ${name}` });
    else if (b === "REQUIRED" && a === "NONE") out.push({ kind: "REQUIRED_REMOVED", severity: "INFO", name, message: `필수 입력이 빠졌습니다: ${name}` });
    else if (b === "REQUIRED" && a === "OPTIONAL")
      out.push({ kind: "REQUIRED_TO_OPTIONAL", severity: "INFO", name, message: `필수 입력이 선택이 되었습니다: ${name}` });
  }
  return out;
}

/** 확정(상신) 화면 확인란이 소비하는 경고 문장 목록(WARNING 만). 08-05 가 이 목록이 비어 있지 않으면 확인란을 둔다. */
export function contractWarnings(diffs: readonly ContractDiff[]): string[] {
  return diffs.filter((d) => d.severity === "WARNING").map((d) => d.message);
}

/** view 응답의 선택 버전 저장 형태. `base` 는 RELEASED(base_ver) 버전 — baseVars 가 없거나 base 가 없으면 null. */
export function contractSourceOfView(view: RuleEditView, which: "current" | "base"): ContractSource | null {
  const selected = view.versions.find((v) => v.ver === view.selectedVer);
  if (!selected) return null;
  if (which === "base") {
    if (selected.baseVer == null || !view.baseVars || view.baseVars.length === 0) return null;
    // base 버전의 저장 원값은 `baseVarMeta` 다. 없는 응답(옛 서버)이면 var_id 가 버전 복사에서 유지되므로 지금 varMeta 로 대신한다.
    return { ruleId: view.rule.maruRuleId, ruleKind: view.rule.ruleKind, hitPolicy: null, vars: view.baseVars, meta: view.baseVarMeta ?? view.varMeta ?? [], rows: view.baseRows };
  }
  return {
    ruleId: view.rule.maruRuleId,
    ruleKind: view.rule.ruleKind,
    hitPolicy: selected.hitPolicy ?? null,
    vars: view.vars,
    meta: view.varMeta ?? [],
    rows: view.rows,
  };
}

export interface ViewContract {
  current: ContractResult | null;
  base: ContractResult | null;
  diffs: ContractDiff[];
  /** 확정(상신) 화면 확인란이 소비하는 경고 문장(08-05). base 가 없으면 빈 목록. */
  contractWarnings: string[];
  pending: string[];
}

/** 화면이 그리는 계약과 base 대비 diff 를 한 번에 계산한다. 계산이 던지면(타입 미해석 등) 그 자리는 null 로 두고 diff 는 비운다. */
export function contractOfView(view: RuleEditView, asts: AstByText): ViewContract {
  const safe = (src: ContractSource | null): ContractResult | null => {
    if (!src) return null;
    try {
      return computeContract(src, asts);
    } catch {
      return null;
    }
  };
  const current = safe(contractSourceOfView(view, "current"));
  const base = safe(contractSourceOfView(view, "base"));
  const diffs = current && base ? diffContract(base.contract, current.contract) : [];
  return { current, base, diffs, contractWarnings: contractWarnings(diffs), pending: [...new Set([...(current?.pending ?? []), ...(base?.pending ?? [])])] };
}
