import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import tsupConfigs from "../tsup.config";
import { PACKAGE_ROOT } from "./helpers/engine-paths";

/**
 * TSK-03-04 design.md §3.2 「evalex-entry.test.ts (3)」·§6.1·D7 — evalex 모듈은 서브패스 `@dk-oasis/m-mdm/evalex` 로 공개하고
 * 루트 배럴은 타입 전용으로 둔다(I43).
 */
const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"));

describe("evalex 공개 경로", () => {
  it("package.json exports 에 ./evalex 가 dist/evalex/index.js·d.ts 를 가리키고 루트 배럴 src/index.ts 에는 ./evalex 문자열이 없다", () => {
    expect(pkg.exports["./evalex"]).toEqual({ types: "./dist/evalex/index.d.ts", import: "./dist/evalex/index.js" });
    const index = readFileSync(path.join(PACKAGE_ROOT, "src/index.ts"), "utf8");
    expect(index).not.toContain("./evalex");
  });

  it("tsup 첫 설정 entry 에 evalex/index 가 src/evalex/index.ts 로 있다", () => {
    const entry = tsupConfigs[0].entry as Record<string, string>;
    expect(entry["evalex/index"]).toBe("src/evalex/index.ts");
    expect(entry.index).toBe("src/index.ts");
  });

  it("decimal.js 는 dependencies 에 있고 devDependencies 에 없다", () => {
    expect(pkg.dependencies["decimal.js"]).toBe("^10.6.0");
    expect(pkg.devDependencies?.["decimal.js"]).toBeUndefined();
  });
});
