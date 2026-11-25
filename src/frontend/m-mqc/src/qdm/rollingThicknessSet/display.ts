/**
 * 압연두께Set보정관리 결과 표시 — 룰 ID(TS-) 열, 두께보정치를 부호 붙여 굵게(「−0.04」), 간편판정에 Set 두께 = 주문두께 + 보정치 타일.
 * 적중이 없으면 보정 0 이라 Set 두께 = 주문두께다(프로토타입 rolling-thickness-set 과 같다).
 */
import {
  numberOrNull,
  signedNumber,
  tidyNumber,
  type JudgeTile,
  type JudgeTileArgs,
  type RuleDisplay,
} from "@/common/rule";

export const THK_VAR = "THK";
export const ADJ_VAR = "THK_ADJ";

/** Set 두께 타일 — 주문두께가 없으면 안내만. */
export function setThicknessTile(args: JudgeTileArgs): JudgeTile[] {
  const thk = numberOrNull(args.input[THK_VAR]);
  if (thk === null)
    return [
      {
        key: "setThk",
        label: "Set 두께",
        value: "—",
        target: "주문두께를 넣으면 계산합니다",
      },
    ];
  const matched = args.result.status === "MATCHED";
  const adj = matched ? (numberOrNull(args.result.results[ADJ_VAR]) ?? 0) : 0;
  const sign = adj < 0 ? "−" : "+";
  return [
    {
      key: "setThk",
      label: "Set 두께",
      value: String(tidyNumber(thk + adj)),
      unit: "mm",
      target: `주문두께 ${thk} ${sign} ${tidyNumber(Math.abs(adj))}${matched ? "" : " (해당 룰 없음 → 보정 0)"}`,
    },
  ];
}

export const DISPLAY: RuleDisplay = {
  keyVar: "RULE_KEY",
  primaryVars: [ADJ_VAR],
  blankValues: ["-"],
  format: { [ADJ_VAR]: signedNumber },
  judgeTiles: setThicknessTile,
};
