import { readFileSync } from "node:fs";
import path from "node:path";
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { D } from "../src/evalex";
import {
  BASE_FUNCTIONS,
  EVAL_TS,
  EXPR_VAR_PREFIX,
  MDM_ARITY,
  RESERVED_CONSTANTS,
  RESERVED_PREFIX,
} from "../src/evalex/contract-constants";
import { FUNCTIONS } from "../src/evalex/functions";
import { JAVA_EXPR_DIR } from "./helpers/engine-paths";

/**
 * TSK-03-04 design.md §3.2 「evalex-contract-parity.test.ts (5)」 — 화면 상수가 Java 계약 소스와 같다(I22).
 * Java 소스를 텍스트로 읽어 정규식으로 뽑는다(스키마를 상대경로로 공유한 TSK-03-01 관례와 같다).
 */
const java = (file: string) => readFileSync(path.join(JAVA_EXPR_DIR, file), "utf8");

/** `NAME = Set.of(…)` 안의 문자열 리터럴. */
function setOf(source: string, name: string): string[] {
  const m = new RegExp(`${name}\\s*=\\s*Set\\.of\\(([^;]*?)\\);`, "s").exec(source);
  if (!m) throw new Error(`${name} = Set.of(...) 를 찾지 못했다`);
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

describe("evalex 계약 상수 = Java 계약", () => {
  it("화면 BASE 함수 = FunctionSets.BASE", () => {
    const base = setOf(java("FunctionSets.java"), "BASE");
    expect([...BASE_FUNCTIONS].sort()).toEqual([...base].sort());
    const table = FUNCTIONS.filter((f) => f.set === "BASE").map((f) => f.name);
    expect([...table].sort()).toEqual([...base].sort());
  });

  it("MDM 함수 인자 수 = MdmFunction", () => {
    const src = java("MdmFunction.java");
    const arity: Record<string, [number, number]> = {};
    for (const m of src.matchAll(/^\s*(INSTR|MASTER|MASTER_AT)\((\d+),\s*(\d+),/gm)) {
      arity[m[1]] = [Number(m[2]), Number(m[3])];
    }
    expect(arity).toEqual({ INSTR: [...MDM_ARITY.INSTR], MASTER: [...MDM_ARITY.MASTER], MASTER_AT: [...MDM_ARITY.MASTER_AT] });
  });

  it("예약 이름 = ReservedNames", () => {
    const src = java("ReservedNames.java");
    expect([...RESERVED_CONSTANTS].sort()).toEqual(setOf(src, "CONSTANTS").sort());
    expect(/EVAL_TS\s*=\s*"([^"]+)"/.exec(src)?.[1]).toBe(EVAL_TS);
    expect(/RESERVED_PREFIX\s*=\s*"([^"]+)"/.exec(src)?.[1]).toBe(RESERVED_PREFIX);
    expect(/EXPR_VAR_PREFIX\s*=\s*"([^"]+)"/.exec(src)?.[1]).toBe(EXPR_VAR_PREFIX);
  });

  it("Decimal 설정 = MdmExpressionConfig.MATH_CONTEXT", () => {
    const m = /MATH_CONTEXT\s*=\s*new MathContext\((\d+),\s*RoundingMode\.(\w+)\)/.exec(java("MdmExpressionConfig.java"));
    expect(m).not.toBeNull();
    const rounding: Record<string, number> = { HALF_EVEN: Decimal.ROUND_HALF_EVEN, HALF_UP: Decimal.ROUND_HALF_UP };
    expect(D.precision).toBe(Number(m![1]));
    expect(D.rounding).toBe(rounding[m![2]]);
  });

  it("NULL 인자 정책 표가 지원 함수를 모두 덮는다", () => {
    const names = FUNCTIONS.map((f) => f.name);
    expect([...names].sort()).toEqual([...BASE_FUNCTIONS, "INSTR", "MASTER", "MASTER_AT"].sort());
    for (const f of FUNCTIONS) {
      expect(f.nullPolicy, f.name).toBeDefined();
    }
  });
});
