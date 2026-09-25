/**
 * m-mdm test 스크립트 — 일반 스위트(vitest.config.ts, 병렬)와 부하 민감 성능 스위트(vitest.perf.config.ts, 한 fork)를
 * 차례로 **둘 다** 돌린다(docs/dflow-team/perf-audit-report.md P3). 앞 스위트가 실패해도 뒤 스위트를 돌려 테스트 총수가
 * 줄지 않게 하고, 끝에 두 스위트를 합친 총수 한 줄을 찍는다(게이트 총수는 이 줄을 읽는다).
 *
 * 인자는 두 스위트에 그대로 넘긴다(예: pnpm --filter @dk-oasis/m-mdm test tests/evalex-perf.test.ts). 파일 필터가 한쪽 스위트에만
 * 걸리는 것이 정상이므로, 인자가 있을 때만 --passWithNoTests 를 붙인다.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// .bin/vitest 는 Windows 에서 .cmd 라 셸 없이 못 띄운다 — 패키지 bin(vitest.mjs)을 현재 node 로 직접 실행한다.
const VITEST = path.join(path.dirname(createRequire(import.meta.url).resolve("vitest/package.json")), "vitest.mjs");
const args = process.argv.slice(2);
const outDir = mkdtempSync(path.join(tmpdir(), "m-mdm-test-"));

const SUITES = [
  { name: "일반", config: "vitest.config.ts" },
  { name: "성능", config: "vitest.perf.config.ts" },
];

let failed = false;
const totals = { files: 0, tests: 0, passed: 0, failed: 0, skipped: 0 };
for (const suite of SUITES) {
  const json = path.join(outDir, `${suite.config}.json`);
  const r = spawnSync(
    process.execPath,
    [
      VITEST,
      "run",
      "-c",
      suite.config,
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${json}`,
      ...(args.length > 0 ? ["--passWithNoTests"] : []),
      ...args,
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
  if (r.status !== 0) failed = true;
  try {
    const report = JSON.parse(readFileSync(json, "utf8"));
    totals.files += report.testResults.length;
    totals.tests += report.numTotalTests;
    totals.passed += report.numPassedTests;
    totals.failed += report.numFailedTests;
    totals.skipped += report.numPendingTests + report.numTodoTests;
  } catch {
    // 설정 오류 등으로 보고서가 없으면 합계를 믿을 수 없다 — 실패로 끝낸다.
    console.error(`[m-mdm test] ${suite.name} 스위트 결과(${suite.config})를 읽지 못했다`);
    failed = true;
  }
}
rmSync(outDir, { recursive: true, force: true });

console.log(
  `\n[m-mdm test 합계] Test Files ${totals.files} · Tests ${totals.tests} ` +
    `(passed ${totals.passed} · failed ${totals.failed} · skipped ${totals.skipped}) — 일반 + 성능 스위트`,
);
process.exit(failed ? 1 : 0);
