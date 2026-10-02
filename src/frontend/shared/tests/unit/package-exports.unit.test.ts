/**
 * package.json exports 가 tsup 진입점·tsc 선언 출력 위치와 맞는지 검사한다.
 *
 * JS 는 tsup 이 진입점마다 dist/<이름>.js 로 묶고, .d.ts 는 tsc(tsconfig.build.json)가 소스 구조 그대로
 * dist/types/<src 기준 경로>.d.ts 로 만든다(scripts/lib-dev.mjs). 진입점을 추가하면서 exports 의 types 를
 * 옛 위치(dist/<이름>.d.ts)로 적거나 빠뜨리면 소비 패키지 tsc 가 타입을 못 찾으므로 여기서 막는다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import tsupConfig from "../../tsup.config";

const pkgDir = path.resolve(__dirname, "../..");
const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")) as {
  main: string;
  types: string;
  exports: Record<string, string | { types: string; import: string }>;
};

type EntryMap = Record<string, string>;
const config = (typeof tsupConfig === "function" ? tsupConfig({}) : tsupConfig) as {
  entry: EntryMap;
  dts: unknown;
};
const entries = Object.entries(config.entry).filter(([, src]) => !src.endsWith(".css"));

const subpath = (name: string) => (name === "index" ? "." : `./${name}`);
const typesPath = (src: string) =>
  `./dist/types/${src.replace(/^src\//, "").replace(/\.tsx?$/, "")}.d.ts`;

describe("package.json exports", () => {
  it("tsup 은 .d.ts 를 만들지 않는다(tsc 가 만든다)", () => {
    expect(config.dts).toBe(false);
  });

  it.each(entries)("진입점 %s 의 exports 가 dist JS 와 dist/types 선언을 가리킨다", (name, src) => {
    expect(pkg.exports[subpath(name)]).toEqual({
      types: typesPath(src),
      import: `./dist/${name}.js`,
    });
  });

  it("객체형 exports 는 모두 tsup 진입점에 대응한다", () => {
    const names = new Set(entries.map(([name]) => subpath(name)));
    const objectKeys = Object.entries(pkg.exports)
      .filter(([, v]) => typeof v === "object")
      .map(([k]) => k);
    expect(objectKeys.filter((k) => !names.has(k))).toEqual([]);
  });

  it("최상위 main·types 는 루트 진입점과 같다", () => {
    expect(pkg.main).toBe("./dist/index.js");
    expect(pkg.types).toBe((pkg.exports["."] as { types: string }).types);
  });
});
