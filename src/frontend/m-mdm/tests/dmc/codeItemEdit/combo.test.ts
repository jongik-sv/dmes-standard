// TSK-06-03 design.md §4.8 — 미리보기 콤보 단계(시뮬레이터 combo(), §1.4-2). 코드인 항목(그룹+코드 포함)을 먼저, 그 안은
// 값 순이다(seq 가 아니다). 결과를 `값(종류, 이름)` 으로 이어 시뮬레이터 콤보 줄과 비교한다.
import { describe, expect, it } from "vitest";
import { comboSteps, type ComboItem } from "../../../pages/dmc/codeItemEdit/combo";
import { ORG, STEEL_STD, simBlock } from "./sim-fixtures";

/** "  고른 값 KS         → ..." 줄을 {고른 값: 오른쪽} 으로. */
function simCombo(title: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of simBlock(title)) {
    const m = /^ {2}고른 값 (\S+)\s+→ (.*)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const withName = (items: ComboItem[]) =>
  items.map((i) => `${i.value}(${i.kind}${i.name ? `, ${i.name}` : ""})`).join(", ");
const withoutName = (items: ComboItem[]) => items.map((i) => `${i.value}(${i.kind})`).join(", ");
const last = <T,>(xs: T[]) => xs[xs.length - 1];

describe("comboSteps — 시뮬레이터 콤보와 글자 단위 일치", () => {
  it("STEEL_STD 5단계", () => {
    const sim = simCombo("STEEL_STD 콤보");
    const cases: [string, string[]][] = [
      ["(없음)", []],
      ["KS", ["KS"]],
      ["KS-3", ["KS", "KS-3"]],
      ["KS-3-CGCH", ["KS", "KS-3", "KS-3-CGCH"]],
      ["JIS", ["JIS"]],
    ];
    for (const [label, path] of cases) {
      expect(withName(last(comboSteps(STEEL_STD, path))), label).toBe(sim[label]);
    }
  });

  it("ORG 3단계(05 표본, 이름 없이 비교)", () => {
    const sim = simCombo("ORG 콤보·트리");
    const cases: [string, string[]][] = [
      ["(없음)", []],
      ["PH", ["PH"]],
      ["PH-A", ["PH", "PH-A"]],
    ];
    for (const [label, path] of cases) {
      expect(withoutName(last(comboSteps(ORG, path))), label).toBe(sim[label]);
    }
  });

  it("단계 목록은 경로 앞부분마다 하나씩이다", () => {
    const steps = comboSteps(STEEL_STD, ["KS", "KS-3"]);
    expect(steps).toHaveLength(3);
    expect(steps[0].map((i) => i.value)).toEqual(["JIS", "KS"]);
  });
});
