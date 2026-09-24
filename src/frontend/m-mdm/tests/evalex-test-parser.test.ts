import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CorpusFile } from "../src/contract/engine-contract.generated";
import { CORPUS_PATH } from "./helpers/engine-paths";
import { ast } from "./helpers/parse-expr";

/**
 * TSK-03-04 design §8 Build 이탈 B1 — 테스트 전용 파서(`helpers/parse-expr.ts`)가 EvalEx 파서와 같은 AST 를 만드는지 본다.
 * 코퍼스 식 사례의 ast 는 JUnit 이 EvalEx 파싱 결과와 같음을 확인한 값이다. 다른 evalex 테스트는 이 파서로 AST 를 얻는다.
 */
describe("테스트 전용 식 파서", () => {
  it("코퍼스 식 사례 전부에서 EvalEx AST 와 같다", () => {
    const corpus: CorpusFile = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
    const exprs = corpus.cases.flatMap((c) => (c.kind === "expr" ? [c] : []));
    expect(exprs.length).toBeGreaterThan(0);
    for (const c of exprs) {
      expect(ast(c.expr), c.id).toEqual(c.ast);
    }
  });
});
