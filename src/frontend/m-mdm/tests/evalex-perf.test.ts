import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { compile, convertForType, evaluate, previewRule, type RuleDef } from "../src/evalex";
import { BASE_SPD_LKP, QLTY_GRD_JDG } from "./fixtures/evalex-rules";
import { ast } from "./helpers/parse-expr";

/**
 * TSK-03-04 design.md §6.13·D6 — PRD NFR-1 "1만 행 판정 100 ms 이내".
 *
 * 1만 행 = 그리드 레코드 1만 개. 숫자 값은 그리드가 주는 모양 그대로 문자열이고, 문자열 → Decimal 변환을 측정에 넣는다.
 * compile(또는 룰 준비) 1회 → 워밍업 3회 → 측정 5회의 중앙값 < 100 ms. 기준은 완화하지 않는다.
 */
const N = 10_000;
const LIMIT_MS = 100;

/** 선형 합동 난수(씨앗 고정). */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

function fixed(r: number, digits: number) {
  return r.toFixed(digits);
}

function measure(run: () => void): { median: number; samples: number[] } {
  for (let i = 0; i < 3; i++) run();
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    run();
    samples.push(performance.now() - t0);
  }
  const median = [...samples].sort((a, b) => a - b)[2];
  return { median, samples };
}

function assertFast(label: string, run: () => void) {
  const { median, samples } = measure(run);
  expect(median, `${label}: 중앙값 ${median.toFixed(1)} ms, 5회 ${samples.map((s) => s.toFixed(1)).join(" / ")}`).toBeLessThan(LIMIT_MS);
}

describe("NFR-1 성능", { timeout: 60_000 }, () => {
  it("NFR-1: 식 R2 를 1만 레코드에 100 ms 안에 평가한다", () => {
    const r2 = ast("value >= 0.1 && value <= 3.5 && value % 0.1 == 0 && value >= COIL_THK");
    const rnd = lcg(2);
    const records = Array.from({ length: N }, () => ({ value: fixed(rnd() * 4, 1), COIL_THK: fixed(rnd() * 3, 2) }));
    compile(r2);
    assertFast("R2", () => {
      for (const rec of records) {
        const out = evaluate(r2, { value: convertForType(rec.value, "NUMBER"), COIL_THK: convertForType(rec.COIL_THK, "NUMBER") });
        if (out.kind !== "value") throw new Error(JSON.stringify(out));
      }
    });
  });

  it("NFR-1: 식 R3 를 1만 레코드에 100 ms 안에 평가한다", () => {
    const r3 = ast('IF(GRADE == "A", value <= 2.0, value <= 3.5) && STR_MATCHES(LOT, "^[A-Z0-9]{10,20}$")');
    const rnd = lcg(3);
    const records = Array.from({ length: N }, (_, i) => ({
      GRADE: rnd() < 0.5 ? "A" : "B",
      value: fixed(rnd() * 4, 2),
      LOT: `LOT${String(i).padStart(9, "0")}`,
    }));
    compile(r3);
    assertFast("R3", () => {
      for (const rec of records) {
        const out = evaluate(r3, { GRADE: rec.GRADE, value: convertForType(rec.value, "NUMBER"), LOT: rec.LOT });
        if (out.kind !== "value") throw new Error(JSON.stringify(out));
      }
    });
  });

  it("NFR-1: BASE_SPD_LKP(UNIQUE 7행) 미리보기를 1만 레코드에 100 ms 안에 한다", () => {
    const rnd = lcg(4);
    const records = Array.from({ length: N }, () => ({ COIL_THK: fixed(0.01 + rnd() * 1.19, 2), TOP_RESIN_CD: "2A", COAT_SIDE: "1" }));
    previewAll(BASE_SPD_LKP, records);
    assertFast("BASE_SPD_LKP", () => previewAll(BASE_SPD_LKP, records));
  });

  it("NFR-1: QLTY_GRD_JDG(FIRST) 미리보기를 1만 레코드에 100 ms 안에 한다", () => {
    const rnd = lcg(5);
    const grades = ["A", "B", "C", "D"];
    const records = Array.from({ length: N }, () => ({
      COIL_THK: fixed(1 + rnd() * 3, 2),
      COIL_WID: fixed(800 + rnd() * 800, 0),
      SURF_GRD: grades[Math.floor(rnd() * 4)],
    }));
    previewAll(QLTY_GRD_JDG, records);
    assertFast("QLTY_GRD_JDG", () => previewAll(QLTY_GRD_JDG, records));
  });
});

function previewAll(rule: RuleDef, records: Record<string, string>[]) {
  for (const rec of records) {
    const p = previewRule(rule, rec);
    if (p.kind !== "ok") throw new Error(JSON.stringify(p));
  }
}
