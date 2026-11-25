/**
 * 원자재강종관리 결과 표시 — 룰 ID(RM-)·순번(0 예외)·기준유형(「칼라파생 ↳ RM-001」) 앞 열, 재질·적정원료·차선원료를 굵게,
 * 원판 룰 ID 는 기준유형 칸에 합쳐 숨긴다. 파생 행에 원판연계 검사(lineage.ts)로 「재검토 필요」 배지를 단다.
 * 배지는 지금 보는 버전과 그 앞 버전(이력)을 견주므로 이력이 바뀔 때마다 새로 만든다(rawMaterialDisplay(versions)).
 */
import type { RuleDisplay, RuleVersion, RuleView } from "@/common/rule";

import {
  buildLineage,
  KIND_LABEL,
  previousVersion,
  type Lineage,
  type RuleKind,
} from "./lineage";

/** 레거시 순번 — 0 은 예외 룰(먼저 평가). */
export function legacyNoText(value: string): string {
  return value === "0" ? "0 예외" : value;
}

/** 기준유형 칸 글 — 「칼라파생 ↳ RM-001」. */
export function kindText(
  value: string,
  results: Readonly<Record<string, string | null>>,
): string {
  const label = KIND_LABEL[value as RuleKind] ?? value;
  return results.BASE_RULE_KEY ? `${label} ↳ ${results.BASE_RULE_KEY}` : label;
}

/** 이력(versions)을 품은 표시 설정. versions 가 비면 원판 변경은 보지 않는다. */
export function rawMaterialDisplay(
  versions: readonly RuleVersion[],
): RuleDisplay {
  // 룰 객체마다 한 번만 나무를 만든다(행마다 badges 가 불린다).
  const cache = new WeakMap<RuleView, Lineage>();
  const lineageOf = (rule: RuleView): Lineage => {
    let l = cache.get(rule);
    if (!l) {
      l = buildLineage(rule, previousVersion(versions, rule.ver));
      cache.set(rule, l);
    }
    return l;
  };
  return {
    keyVar: "RULE_KEY",
    leadVars: ["LEGACY_NO", "RULE_KIND"],
    primaryVars: ["MAT_CD", "RAW_MAT_PRI", "RAW_MAT_ALT"],
    hiddenVars: ["BASE_RULE_KEY"],
    blankValues: ["-"],
    format: { LEGACY_NO: legacyNoText, RULE_KIND: kindText },
    columnWidths: {
      RULE_KIND: 140,
      RAW_MAT_ALT: 120,
      RAW_GRADE_MSG: 240,
      INHERIT_NOTE: 220,
    },
    badges: (r, rule) => {
      const key = r.RULE_KEY;
      const reasons =
        rule && key ? lineageOf(rule).reviews.get(key) : undefined;
      return reasons
        ? [
            {
              label: "재검토 필요",
              tone: "warning",
              title: reasons.join(" / "),
            },
          ]
        : [];
    },
  };
}
