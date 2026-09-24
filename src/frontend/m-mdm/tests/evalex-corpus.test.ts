import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CorpusCase, CorpusFile, TypedValue } from "../src/contract/engine-contract.generated";
import { D, evaluate, evaluateCell, fromTypedValue, toTypedValue, type EvalValue } from "../src/evalex";
import { CORPUS_PATH, ENGINE_ROOT, PACKAGE_ROOT } from "./helpers/engine-paths";

/**
 * TSK-03-04 design.md §3.2·§6.12 — 서버·화면 정합성 코퍼스의 화면 러너.
 *
 * 엔진 test resources 의 코퍼스 한 벌을 읽는다(JUnit CorpusConformanceTest 와 같은 파일). 두 러너가 모두 기대값과 같으면
 * 서버와 화면이 같다(수용 기준 "코퍼스 불일치 0건"). 화면 폴백은 고정 목록 4건에서만 허용한다(D4).
 */
const corpus: CorpusFile = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));

export const ALLOWED_FALLBACK_IDS = [
  "cell.code-in.no-set",
  "expr.master.data-fallback",
  "expr.concat.computed-scale",
  "expr.compare.mixed-type",
];

function run(c: CorpusCase) {
  if (c.kind === "expr") {
    const vars: Record<string, EvalValue> = {};
    for (const [k, v] of Object.entries(c.vars)) vars[k] = fromTypedValue(v);
    return evaluate(c.ast, vars, { codeSets: c.codeSets });
  }
  return evaluateCell(c.variable, c.cell, fromTypedValue(c.value), { patternRegex: c.patternRegex, codeSets: c.codeSets });
}

function sameValue(want: TypedValue, got: TypedValue): boolean {
  if (want.type !== got.type) return false;
  if (want.type === "NUMBER" && got.type === "NUMBER") return new D(want.value).eq(got.value);
  return JSON.stringify(want) === JSON.stringify(got);
}

function findCorpusCopies(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findCorpusCopies(full));
    else if (/corpus.*\.json$/.test(entry.name)) found.push(path.relative(PACKAGE_ROOT, full));
  }
  return found;
}

describe("정합성 코퍼스 — 화면 러너", () => {
  it.each(corpus.cases.map((c) => [c.id, c] as const))("%s", (id, c) => {
    const out = run(c);
    const fallbackAllowed = c.expect.screenFallback === true && ALLOWED_FALLBACK_IDS.includes(id);
    if (out.kind === "fallback") {
      expect(fallbackAllowed, `${id}: 허용 목록 밖 폴백(${out.reason})`).toBe(true);
      return;
    }
    expect(c.expect.screenFallback === true, `${id}: 폴백해야 할 자리에서 값을 냈다 ${JSON.stringify(out)}`).toBe(false);
    if ("error" in c.expect) {
      expect(out.kind === "error" ? out.code : JSON.stringify(out)).toBe(c.expect.error);
      return;
    }
    expect(out.kind, JSON.stringify(out)).toBe("value");
    if (out.kind !== "value") return;
    const got = toTypedValue(out.value);
    expect(sameValue(c.expect.value, got), `기대 ${JSON.stringify(c.expect.value)} / 실제 ${JSON.stringify(got)}`).toBe(true);
  });

  it("폴백을 허용한 사례는 고정 목록 4건과 같다", () => {
    const ids = corpus.cases.filter((c) => c.expect.screenFallback === true).map((c) => c.id);
    expect([...ids].sort()).toEqual([...ALLOWED_FALLBACK_IDS].sort());
  });

  it("id 가 유일하다", () => {
    const ids = corpus.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("m-mdm 안에 코퍼스 사본이 없고 러너는 엔진 test resources 를 읽는다", () => {
    expect(findCorpusCopies(PACKAGE_ROOT)).toEqual([]);
    expect(CORPUS_PATH.startsWith(path.join(ENGINE_ROOT, "src/test/resources") + path.sep)).toBe(true);
    expect(existsSync(CORPUS_PATH)).toBe(true);
  });
});
