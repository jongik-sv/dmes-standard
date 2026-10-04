/**
 * `OasisCallError` 클래스가 빌드 결과(dist/*.js)에서 http.js 한 곳에만 있는지 검사한다.
 *
 * shared 는 tsup `splitting:false` 라 한 모듈을 여러 진입점이 import 하면 진입점마다 그 코드가 복사된다. 클래스가 두 번
 * 복사되면 화면이 던진 오류와 다른 진입점이 검사하는 클래스가 달라 `instanceof` 가 거짓이 된다. 그래서 oasis-call.ts 는
 * `/http` 진입점(src/http/entry.ts)만 내보내고 shared 의 다른 모듈은 import 하지 않는다 — 이 시험이 그 약속을 지킨다.
 *
 * dist 를 읽으므로 `pnpm build` 뒤에 돈다(dist 가 없으면 실패한다). 소스맵(.js.map)의 sourcesContent 는 세지 않는다.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import tsupConfig from "../../tsup.config";

const pkgDir = path.resolve(__dirname, "../..");
const distDir = path.join(pkgDir, "dist");
const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")) as {
  exports: Record<string, { types: string; import: string }>;
};
const config = (typeof tsupConfig === "function" ? tsupConfig({}) : tsupConfig) as { entry: Record<string, string> };

/** dist 아래 .js 파일(하위 폴더 포함, dist/types 의 선언 제외). */
function distJsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (full !== path.join(distDir, "types")) out.push(...distJsFiles(full));
    } else if (ent.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

/** 클래스 몸체 사본의 표시 — esbuild 는 `var OasisCallError = class extends Error` 로 낸다(이름이 겹치면 OasisCallError2 등). */
const CLASS_COPY = /\bclass\s+OasisCallError\d*\b|\bOasisCallError\d*\s*=\s*class\b|this\.name\s*=\s*"OasisCallError"/;

describe("OasisCallError 번들 사본", () => {
  it("/http 진입점은 src/http/entry.ts 이고 루트 index 는 oasis-call 을 내보내지 않는다", () => {
    expect(config.entry.http).toBe("src/http/entry.ts");
    expect(pkg.exports["./http"]).toEqual({ types: "./dist/types/http/entry.d.ts", import: "./dist/http.js" });
    const httpIndex = readFileSync(path.join(pkgDir, "src/http/index.ts"), "utf8");
    expect(httpIndex).not.toMatch(/oasis-call/);
  });

  it("shared 소스에서 oasis-call 을 import 하는 곳은 http/entry.ts 하나다", () => {
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(ent.name) && /from\s+["'][^"']*oasis-call["']/.test(readFileSync(full, "utf8"))) {
          importers.push(path.relative(pkgDir, full));
        }
      }
    };
    walk(path.join(pkgDir, "src"));
    expect(importers).toEqual([path.join("src", "http", "entry.ts")]);
  });

  it("dist/*.js 에서 OasisCallError 클래스는 http.js 한 곳에만 있다", () => {
    expect(existsSync(path.join(distDir, "http.js")), "dist/http.js 가 없다 — shared 폴더에서 pnpm build 를 먼저 돌린다").toBe(true);
    const http = readFileSync(path.join(distDir, "http.js"), "utf8");
    expect(http, "dist/http.js 가 낡았다(callOasisAt 없음) — pnpm build 를 다시 돌린다").toMatch(/\bcallOasisAt\b/);

    const withCopy = distJsFiles(distDir)
      .filter((f) => CLASS_COPY.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(distDir, f));
    expect(withCopy).toEqual(["http.js"]);
  });
});
