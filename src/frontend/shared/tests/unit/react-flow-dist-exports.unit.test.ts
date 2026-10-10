/** @vitest-environment happy-dom */
/**
 * deferred 45 — shared 단위 시험은 src 를 읽어서, dist 진입점의 export 누락(esbuild 가 내부 모듈의 `export *` 재내보내기를 잃음,
 * 단계 1 조정-6)을 잡지 못한다. react-flow 진입점의 src 값 export 를 dist 가 모두 내는지 본다.
 * dist 가 없으면(빌드 전) 건너뛴다 — shared 를 빌드한 뒤 돌린다(README 프런트 검증 명령 순서). dist 가 src 보다 낡았으면 실패한다.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const distFile = resolve(__dirname, "../../dist/react-flow.js");
const built = existsSync(distFile);

async function loadDist(): Promise<Record<string, unknown>> {
  return (await import(/* @vite-ignore */ distFile)) as Record<string, unknown>;
}

describe.skipIf(!built)("react-flow dist 진입점", () => {
  it("src 진입점의 값 export 를 dist 가 모두 낸다", async () => {
    const src = (await import("../../src/components/react-flow/index")) as Record<string, unknown>;
    const out = await loadDist();
    expect(Object.keys(src).filter((k) => !(k in out)).sort()).toEqual([]);
  });

  it("@xyflow/react 재수출과 자동 배치가 dist 에 있다", async () => {
    const out = await loadDist();
    const names = ["ReactFlow", "ReactFlowProvider", "useReactFlow", "useStoreApi", "Handle", "getViewportForBounds", "autoLayout", "AUTO_LAYOUT_DEFAULTS"];
    expect(names.filter((n) => out[n] === undefined)).toEqual([]);
  });
});
