import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import tsupConfig from "../../../tsup.config";
import * as evalex from "../../../src/evalex";

/**
 * 식 평가기(evalex)는 서브패스 `@dk-oasis/shared/evalex` 로만 공개한다(2026-10-03, MDM 화면 메타·검증 C3).
 * m-mdm 에서 옮겨 왔고, 루트 배럴에는 싣지 않는다(decimal.js 를 루트 번들에 끌어들이지 않고, 같은 모듈이 두 번 묶여
 * `instanceof`·`NUMBER_TEXT` WeakMap 이 갈라지는 것을 막는다).
 */
const pkgDir = path.resolve(__dirname, "../../..");
const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
const config = (typeof tsupConfig === "function" ? tsupConfig({}) : tsupConfig) as { entry: Record<string, string> };

describe("evalex 공개 경로", () => {
  it("tsup 진입점 evalex 가 src/evalex/index.ts 이고 exports 가 dist/evalex.js·선언을 가리킨다", () => {
    expect(config.entry.evalex).toBe("src/evalex/index.ts");
    expect(pkg.exports["./evalex"]).toEqual({
      types: "./dist/types/evalex/index.d.ts",
      import: "./dist/evalex.js",
    });
  });

  it("루트 배럴(src/index.ts)은 evalex 를 싣지 않는다", () => {
    const index = readFileSync(path.join(pkgDir, "src/index.ts"), "utf8");
    expect(index).not.toMatch(/evalex/);
  });

  it("decimal.js 는 shared dependencies 에 있다(devDependencies 아님)", () => {
    expect(pkg.dependencies["decimal.js"]).toBe("^10.6.0");
    expect(pkg.devDependencies?.["decimal.js"]).toBeUndefined();
  });

  it("공개 값: 평가기·분석기·계약 상수·표", () => {
    for (const name of [
      "D",
      "NUMBER_TEXT",
      "PLAIN_DECIMAL",
      "fromTypedValue",
      "toTypedValue",
      "convertForType",
      "EvalexError",
      "FallbackSignal",
      "PatternRejected",
      "classify",
      "compile",
      "evaluate",
      "validate",
      "prepare",
      "isSupported",
      "usedVariables",
      "checkRecordKeys",
      "evaluateCell",
      "nullSafety",
      "computeInputContract",
      "analyzeDeriveOrder",
      "analyzeRule",
      "previewRule",
      "FUNCTIONS",
      "BASE_FUNCTIONS",
      "MDM_ARITY",
      "EVAL_TS",
      "EXPR_VAR_PREFIX",
      "RESERVED_CONSTANTS",
      "RESERVED_PREFIX",
    ]) {
      expect((evalex as Record<string, unknown>)[name], name).toBeDefined();
    }
  });

  it("shared 소스는 m-mdm 을 가져오지 않는다(순환 방지)", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && /from\s+["'][^"']*m-mdm/.test(readFileSync(full, "utf8"))) {
          hits.push(path.relative(pkgDir, full));
        }
      }
    };
    walk(path.join(pkgDir, "src"));
    expect(hits).toEqual([]);
  });
});
