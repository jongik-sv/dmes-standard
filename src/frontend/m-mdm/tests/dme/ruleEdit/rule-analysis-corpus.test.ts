// TSK-08-02 design §3.3·I13·I15 — 코퍼스 동치(TS 쪽). 한 벌 코퍼스(엔진 test resources)를 운영 `ruleDefFromStored` + evalex
// `analyzeRule`(그리드 즉시 검사와 같은 함수)로 돌려 `{code, severity, rowIds, varId, lower, upper}` 가 expect 와 순서까지 같은지 본다.
// Java 짝은 mdm/lib `RuleAnalysisCorpusTest`(같은 파일·같은 하한). 파일이 없으면 실패한다 — 건너뛰지 않는다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { analyzeRule } from "../../../src/evalex";
import { ruleDefFromStored } from "../../../pages/dme/ruleEdit/decision-table/grid-model";
import type { ResolvedVar, StoredRow } from "../../../pages/dme/ruleEdit/types";
import { ANALYSIS_CORPUS_PATH, PACKAGE_ROOT } from "../../helpers/engine-paths";

/** Java `RuleAnalysisCorpusTest` 의 하한과 같아야 한다(I15). 사례를 더하면 두 러너를 함께 올린다. */
const MIN_CASES = 30;

interface CorpusCase {
  id: string;
  rule: { ruleId: string; ruleKind: "DECISION" | "DERIVE"; hitPolicy: string | null; vars: ResolvedVar[]; rows: StoredRow[] };
  expect: Array<{ code: string; severity: string; rowIds: number[]; varId?: number; lower?: string; upper?: string }>;
}

function project(i: { code: string; severity: string; rowIds: number[]; varId?: number | null; lower?: string | null; upper?: string | null }) {
  return { code: i.code, severity: i.severity, rowIds: i.rowIds, varId: i.varId ?? null, lower: i.lower ?? null, upper: i.upper ?? null };
}

const corpus = JSON.parse(fs.readFileSync(ANALYSIS_CORPUS_PATH, "utf8")) as { version: number; cases: CorpusCase[] };

describe("분석 코퍼스 동치(TS)", () => {
  it("코퍼스는 version 1 이고 사례 수가 하한 이상이다", () => {
    expect(corpus.version).toBe(1);
    expect(corpus.cases.length).toBeGreaterThanOrEqual(MIN_CASES);
  });

  it.each(corpus.cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const def = ruleDefFromStored(c.rule.ruleId, c.rule.ruleKind, c.rule.hitPolicy as never, c.rule.vars, c.rule.rows);
    expect(analyzeRule(def).map(project)).toEqual(c.expect.map(project));
  });

  it("m-mdm 안에 코퍼스 사본이 없다(한 벌, I15)", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/corpus.*\.json$/i.test(e.name)) hits.push(path.relative(PACKAGE_ROOT, p));
      }
    };
    walk(PACKAGE_ROOT);
    expect(hits).toEqual([]);
  });
});
