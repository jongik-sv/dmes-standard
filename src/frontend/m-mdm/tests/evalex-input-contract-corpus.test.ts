// TSK-08-04 design §2.1·I28 — 입력 계약 코퍼스 동치(TS 쪽). 한 벌 코퍼스(엔진 test resources)를 화면 경로
// `computeContract`(contract-view — 운영 `ruleDefFromStored` + varMeta + 서버 AST → evalex `computeInputContract`)로 돌려
// always·행별 rowId·cond·required·optional 이 expect 와 순서까지 같은지 본다. Java 짝은 엔진 `InputContractCorpusTest`(같은 파일·같은 하한).
// 파일이 없으면 실패한다 — 건너뛰지 않는다.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import type { AstNode, VarType } from "../src/contract/engine-contract.generated";
import { computeContract, type AstByText } from "../pages/dme/ruleEdit/sections/contract/contract-view";
import type { HitPolicyCode, ResolvedVar, StoredRow, VarMeta } from "../pages/dme/ruleEdit/types";
import { INPUT_CONTRACT_CORPUS_PATH } from "./helpers/engine-paths";

/** Java `InputContractCorpusTest.MIN_CASES` 와 같아야 한다. 사례를 더하면 두 러너를 함께 올린다. */
const MIN_CASES = 12;

type StoredVarRow = Omit<ResolvedVar, "dateString" | "typeSource">;

interface CorpusCase {
  id: string;
  note: string;
  rule: {
    ruleId: string;
    ruleKind: "DECISION" | "DERIVE";
    hitPolicy: HitPolicyCode | null;
    vars: StoredVarRow[];
    meta: Array<Pick<VarMeta, "varId" | "resGrp" | "grpCond">>;
    rows: StoredRow[];
  };
  asts: Record<string, AstNode>;
  types: Record<string, Omit<VarType, "name">>;
  expect: { always: string[]; rows: Array<{ rowId: number; cond: string; required: string[]; optional: string[] }> };
}

const corpus = JSON.parse(fs.readFileSync(INPUT_CONTRACT_CORPUS_PATH, "utf8")) as { version: number; cases: CorpusCase[] };

/** 코퍼스 타입 표(대문자 이름). 없는 이름은 undefined — 계산기가 던진다(Java 도 같다). */
function typeResolver(types: CorpusCase["types"]): (name: string) => VarType {
  return (name) => {
    const t = types[name.toUpperCase()];
    return (t ? { name, ...t } : undefined) as VarType;
  };
}

describe("입력 계약 코퍼스 동치(TS)", () => {
  it("코퍼스는 version 1 이고 사례 수가 하한 이상이며 id 가 겹치지 않는다", () => {
    expect(corpus.version).toBe(1);
    expect(corpus.cases.length).toBeGreaterThanOrEqual(MIN_CASES);
    expect(new Set(corpus.cases.map((c) => c.id)).size).toBe(corpus.cases.length);
  });

  it.each(corpus.cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const typeOf = typeResolver(c.types);
    const vars = c.rule.vars.map((v) => ({ ...v, dateString: false, typeSource: "COLUMN" }) as ResolvedVar);
    const { contract } = computeContract(
      { ruleId: c.rule.ruleId, ruleKind: c.rule.ruleKind, hitPolicy: c.rule.hitPolicy, vars, meta: c.rule.meta, rows: c.rule.rows },
      c.asts as AstByText,
      typeOf,
    );
    expect(contract, c.note).toEqual({
      always: c.expect.always.map(typeOf),
      rows: c.expect.rows.map((r) => ({ rowId: r.rowId, cond: r.cond, required: r.required.map(typeOf), optional: r.optional.map(typeOf) })),
    });
  });

  it("06:1324 — QLTY_GRD_JDG v1 은 row 3 만 BASE_FCT 필수다", () => {
    const c = corpus.cases.find((x) => x.id === "qlty-grd-jdg-v1")!;
    expect(c.expect.rows.map((r) => [r.rowId, r.required])).toEqual([
      [1, []],
      [2, []],
      [3, ["BASE_FCT"]],
      [4, []],
    ]);
  });
});
