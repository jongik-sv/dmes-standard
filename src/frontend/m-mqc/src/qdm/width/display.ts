/**
 * 폭 룰 화면(폭수축량·폭마진량) 결과 표시 설정 — 데이터 담당이 결과 열에 둔 보조 값을 프로토타입처럼 보인다.
 *   RULE_KEY(WR-·WM- 룰 ID) → 「룰 ID」 열, PRIO·LEGACY_NO → 「우선순위」·「순번」 앞 열(순번 0 은 「0 예외」),
 *   SRC_NOTE(원본주의 …) → 「원본주의」 배지, 수축량·마진폭 → 부호 붙여 굵게(「+2」, 0 은 흐리게).
 * 간편판정에는 폭 조건 값으로 진입 폭 → 출측 폭(수축량), 주문 폭 → 제품 폭(마진폭) 타일을 더한다. 적중이 없으면 양을 0 으로 본다.
 */
import {
  numberOrNull,
  signedNumber,
  tidyNumber,
  type JudgeTile,
  type RuleDisplay,
} from "@/common/rule";

import { widthVarOf } from "./flow";

export type WidthKind = "shrink" | "margin";

export const WIDTH_KEY_VAR = "RULE_KEY";
export const SRC_NOTE_VAR = "SRC_NOTE";

const AMOUNT_VAR: Record<WidthKind, string> = {
  shrink: "WID_SHRINK_QTY",
  margin: "WID_MARGIN_QTY",
};

const TILE_TEXT: Record<
  WidthKind,
  { amount: string; inWidth: string; outWidth: string }
> = {
  shrink: { amount: "폭감소량", inWidth: "진입 폭", outWidth: "출측 폭" },
  margin: { amount: "마진폭", inWidth: "주문 폭", outWidth: "제품 폭" },
};

/** 레거시 순번 — 0 은 예외 룰(먼저 평가). */
export function legacyNoText(value: string): string {
  return value === "0" ? "0 예외" : value;
}

/** 간편판정 폭 타일 — 폭 조건 변수가 없거나 값이 없으면 안내 타일 하나. */
export function widthTiles(
  kind: WidthKind,
  args: Parameters<NonNullable<RuleDisplay["judgeTiles"]>>[0],
): JudgeTile[] {
  const text = TILE_TEXT[kind];
  const widthVar = widthVarOf(args.rule, args.ruleId);
  if (!widthVar)
    return [
      {
        key: "inWidth",
        label: text.inWidth,
        value: "해당 없음",
        target: "이 공정 룰에는 폭 조건이 없습니다",
      },
    ];
  const width = numberOrNull(args.input[widthVar]);
  if (width === null)
    return [
      {
        key: "inWidth",
        label: `${text.inWidth}`,
        value: "—",
        target: "폭을 넣으면 계산합니다",
      },
    ];
  const matched = args.result.status === "MATCHED";
  const amount = matched
    ? (numberOrNull(args.result.results[AMOUNT_VAR[kind]]) ?? 0)
    : 0;
  return [
    { key: "inWidth", label: text.inWidth, value: String(width), unit: "mm" },
    {
      key: "outWidth",
      label: text.outWidth,
      value: String(tidyNumber(width - amount)),
      unit: "mm",
      target: `${text.inWidth} ${width} − ${text.amount} ${amount}${matched ? "" : " (해당 룰 없음 → 0)"}`,
    },
  ];
}

/** 폭 룰 표시 설정. 모듈 상수로 만들어 넘긴다. */
export function widthDisplay(kind: WidthKind): RuleDisplay {
  const amountVar = AMOUNT_VAR[kind];
  return {
    keyVar: WIDTH_KEY_VAR,
    seqLabel: "평가 순서",
    leadVars: ["PRIO", "LEGACY_NO"],
    primaryVars: [amountVar],
    hiddenVars: [SRC_NOTE_VAR],
    blankValues: ["-"],
    format: { [amountVar]: signedNumber, LEGACY_NO: legacyNoText },
    badges: (r) =>
      r[SRC_NOTE_VAR]
        ? [{ label: "원본주의", tone: "danger", title: r[SRC_NOTE_VAR] }]
        : [],
    judgeTiles: (args) => widthTiles(kind, args),
  };
}
