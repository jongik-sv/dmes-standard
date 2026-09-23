import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import tsupConfigs from "../tsup.config";

/**
 * pages/**\/page.tsx 실물 파일과 tsup.config.ts 의 entry 키가 1:1 대응하는지 확인한다.
 *
 * m-mls·m-mqc·m-mpn·m-mpp 는 이 스모크가 없어 "새 page.tsx 를 추가하고 tsup entry 를 깜빡한다"는
 * 실패 모드(런타임에 dist/pages/.../page.js 없음 → 포털에서 404)를 아무도 잡지 않는다(design.md §3.2).
 */
const PAGES_ROOT = path.resolve(__dirname, "..", "pages");

/** depth 1({leaf}/page.tsx) + depth 2({group}/{leaf}/page.tsx) 만 스캔 — codegen 스캔 범위와 동일. */
function collectPageKeys(rootDir: string): string[] {
  const keys: string[] = [];
  for (const top of readdirSync(rootDir, { withFileTypes: true })) {
    if (!top.isDirectory() || top.name.startsWith("_")) continue;
    const topDir = path.join(rootDir, top.name);

    if (readdirSync(topDir).includes("page.tsx")) {
      keys.push(top.name);
      continue;
    }

    for (const sub of readdirSync(topDir, { withFileTypes: true })) {
      if (!sub.isDirectory() || sub.name.startsWith("_")) continue;
      const leafDir = path.join(topDir, sub.name);
      if (readdirSync(leafDir).includes("page.tsx")) {
        keys.push(`${top.name}/${sub.name}`);
      }
    }
  }
  return keys.sort();
}

/** tsup.config.ts 의 "pages/..." entry 키에서 앞의 "pages/" 접두를 떼 page key 로 정규화한다. */
function collectTsupPageEntryKeys(): string[] {
  const keys: string[] = [];
  for (const config of tsupConfigs) {
    const entry = config.entry;
    if (!entry || Array.isArray(entry)) continue;
    for (const entryKey of Object.keys(entry)) {
      if (entryKey.startsWith("pages/") && entryKey.endsWith("/page")) {
        keys.push(entryKey.slice("pages/".length, -"/page".length));
      }
    }
  }
  return keys.sort();
}

describe("tsup entries ↔ pages/**/page.tsx 정합", () => {
  it("디스크의 page.tsx 목록과 tsup entry 키가 1:1 대응한다", () => {
    const diskKeys = collectPageKeys(PAGES_ROOT);
    const tsupKeys = collectTsupPageEntryKeys();

    expect(diskKeys.length).toBeGreaterThan(0);
    expect(tsupKeys).toEqual(diskKeys);
  });
});
