/**
 * package.json exports 가 tsup 진입점·tsc 선언 출력 위치와 맞는지 검사한다(shared tests/unit/package-exports.unit.test.ts 와 같은 틀).
 *
 * JS 는 tsup 이 진입점마다 dist/<이름>.js 로 묶고, .d.ts 는 tsc(tsconfig.build.json, rootDir ".")가 소스 구조 그대로
 * dist/types/<패키지 기준 경로>.d.ts 로 만든다(scripts/lib-dev.mjs). 진입점 일부가 src 밖(pages/)에 있어서 types 는
 * dist/types/src/… 와 dist/types/pages/… 로 갈린다. exports 의 types 를 옛 위치(dist/<이름>.d.ts)로 적거나 빠뜨리면
 * 소비 패키지(m-mcm) tsc 가 타입을 못 찾거나 dist 에 남은 낡은 .d.ts 를 읽으므로 여기서 막는다.
 *
 * 화면 exports 는 와일드카드("./pages/*") 대신 화면마다 한 줄씩 적는다 — lib-dev 가 빌드 뒤 exports 의 types 파일이
 * 정말 있는지 검사하는데 와일드카드 경로는 그대로 파일로 찾아 늘 실패한다. 새 page.tsx 는 tsup entry 와 exports 에 함께 적는다.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import tsupConfigs from "../tsup.config";

const pkgDir = path.resolve(__dirname, "..");
const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")) as {
  main: string;
  types: string;
  exports: Record<string, string | { types: string; import: string }>;
};
// 머리 주석이 있으므로 JSON.parse 대신 TypeScript 의 설정 읽기를 쓴다.
const buildConfig = ts.readConfigFile(path.join(pkgDir, "tsconfig.build.json"), ts.sys.readFile).config as {
  compilerOptions: Record<string, unknown>;
  include: string[];
};

type EntryMap = Record<string, string>;
const configs = (Array.isArray(tsupConfigs) ? tsupConfigs : [tsupConfigs]) as { entry: EntryMap; dts: unknown }[];
const entries = configs.flatMap((c) => Object.entries(c.entry));

/** tsup entry 이름 → exports 키. index → ".", evalex/index → "./evalex", pages/… → 그대로. */
const subpath = (name: string) => (name === "index" ? "." : `./${name.replace(/\/index$/, "")}`);
const typesPath = (src: string) => `./dist/types/${src.replace(/\.tsx?$/, "")}.d.ts`;

describe("package.json exports", () => {
  it("tsup 은 .d.ts 를 만들지 않는다(tsc 가 만든다)", () => {
    expect(configs.length).toBeGreaterThan(0);
    for (const c of configs) expect(c.dts).toBe(false);
  });

  it("tsconfig.build.json 은 패키지 폴더 기준으로 dist/types 에 선언만 낸다", () => {
    expect(buildConfig.compilerOptions).toMatchObject({
      noEmit: false,
      emitDeclarationOnly: true,
      declaration: true,
      rootDir: ".",
      outDir: "dist/types",
    });
    // 빌드 정보는 배포 대상 dist 에 섞지 않는다(lib-dev 와 같은 위치).
    expect(String(buildConfig.compilerOptions.tsBuildInfoFile)).toMatch(/^node_modules\/\.cache\//);
  });

  it.each(entries)("진입점 %s 의 exports 가 dist JS 와 dist/types 선언을 가리킨다", (name, src) => {
    expect(pkg.exports[subpath(name)]).toEqual({
      types: typesPath(src),
      import: `./dist/${name}.js`,
    });
  });

  it.each(entries)("진입점 %s 의 선언은 tsconfig.build.json 이 컴파일하는 소스에서 나온다", (_name, src) => {
    expect(existsSync(path.join(pkgDir, src))).toBe(true);
    const top = src.split("/")[0];
    expect(buildConfig.include.some((g) => g.startsWith(`${top}/`) && g.endsWith(path.extname(src)))).toBe(true);
  });

  it("객체형 exports 는 모두 tsup 진입점에 대응한다(와일드카드 없음)", () => {
    const names = new Set(entries.map(([name]) => subpath(name)));
    const objectKeys = Object.entries(pkg.exports)
      .filter(([, v]) => typeof v === "object")
      .map(([k]) => k);
    expect(objectKeys.filter((k) => !names.has(k))).toEqual([]);
    expect(objectKeys.filter((k) => k.includes("*"))).toEqual([]);
  });

  it("포털이 등재하는 화면(pages/ 의 page.tsx)은 모두 tsup 진입점이다", () => {
    // m-mcm scripts/generate-page-registry.mjs collectPageKeys 와 같은 범위: depth 1~2, "_" 접두 폴더는 건너뛴다.
    // 진입점이 빠지면 포털의 import("@dk-oasis/m-mdm/pages/…/page") 가 exports·dist 에서 모두 길을 잃는다.
    const pagesDir = path.join(pkgDir, "pages");
    const dirs = (dir: string) =>
      readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
        .map((d) => d.name);
    const pages: string[] = [];
    for (const group of dirs(pagesDir)) {
      if (existsSync(path.join(pagesDir, group, "page.tsx"))) pages.push(`pages/${group}/page.tsx`);
      for (const leaf of dirs(path.join(pagesDir, group))) {
        if (existsSync(path.join(pagesDir, group, leaf, "page.tsx"))) pages.push(`pages/${group}/${leaf}/page.tsx`);
      }
    }
    expect(pages.length).toBeGreaterThan(0);
    const sources = new Set(entries.map(([, src]) => src));
    expect(pages.filter((p) => !sources.has(p))).toEqual([]);
  });

  it("최상위 main·types 는 루트 진입점과 같다", () => {
    expect(pkg.main).toBe("./dist/index.js");
    expect(pkg.types).toBe((pkg.exports["."] as { types: string }).types);
  });
});
