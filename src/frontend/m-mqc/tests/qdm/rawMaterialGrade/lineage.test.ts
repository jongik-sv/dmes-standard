// 원판연계 — 도금기준 → 칼라파생 나무, 재검토 사유(원판과 다름·범위 밖·원판 변경), 목록 배지.
import { describe, expect, it } from "vitest";

import { rowBadges } from "@/common/rule";
import { kindText, rawMaterialDisplay } from "@/qdm/rawMaterialGrade/display";
import {
  buildLineage,
  cellValueText,
  previousVersion,
  rangeInside,
  thkRangeOf,
  thkRangeText,
} from "@/qdm/rawMaterialGrade/lineage";

import { base, derived, solo, version } from "./fixtures";

describe("원판연계", () => {
  it("셀 글·두께 범위 읽기와 안쪽 판정(경계 포함 여부)", () => {
    expect(cellValueText({ op: "EQ", left: "G", summary: "= G" })).toBe("G");
    expect(
      cellValueText({ op: "IN", list: ["A", "B"], summary: "IN (A, B)" }),
    ).toBe("A, B");
    expect(cellValueText({ op: "NA", summary: "-" })).toBe("");
    const r = thkRangeOf({
      op: "<= 변수 <",
      left: "0.2",
      right: "3",
      summary: "",
    });
    expect(thkRangeText(r)).toBe("0.2 ≤ t < 3");
    expect(
      rangeInside(
        thkRangeOf({ op: "<= 변수 <", left: "0.2", right: "1.6", summary: "" }),
        r,
      ),
    ).toBe(true);
    expect(
      rangeInside(
        thkRangeOf({ op: "<= 변수 <=", left: "0.2", right: "3", summary: "" }),
        r,
      ),
    ).toBe(false);
    expect(
      rangeInside(
        thkRangeOf({ op: "< 변수 <", left: "0.1", right: "1", summary: "" }),
        r,
      ),
    ).toBe(false);
    expect(rangeInside(null, r)).toBe(false);
    expect(rangeInside(r, null)).toBe(true);
  });

  it("나무 — 도금기준 아래 칼라파생, 칼라전용 따로, 원판과 맞으면 사유 없음", () => {
    const l = buildLineage(version("1.000", [base("2.2"), derived(), solo]));
    expect(
      l.bases.map((b) => [b.node.key, b.children.map((c) => c.key)]),
    ).toEqual([["RM-006", ["RM-007"]]]);
    expect(l.standalone.map((n) => n.key)).toEqual(["RM-011"]);
    expect(l.counts).toEqual({ base: 1, derived: 1, standalone: 1, review: 0 });
    expect(l.bases[0].children[0]).toMatchObject({
      prod: "3",
      spec: "KS3-CGCD-2",
      alt: "G25",
      msg: "",
    });
  });

  it("재검토 — 재질·적정원료가 다르거나 범위 밖, 원판 룰 없음", () => {
    const l = buildLineage(
      version("1.000", [
        base("2.2"),
        derived({ MAT_CD: "5A" }, "0.25", "2.5"),
        solo,
      ]),
    );
    expect(l.reviews.get("RM-007")).toEqual([
      "재질코드가 원판과 다릅니다(원판 4B · 파생 5A)",
      "두께범위(0.25 ≤ t < 2.5)가 원판 범위(0.2 ≤ t < 2.2) 밖입니다",
    ]);
    const orphan = buildLineage(version("1.000", [derived()]));
    expect(orphan.orphans.map((n) => n.key)).toEqual(["RM-007"]);
    expect(orphan.reviews.get("RM-007")).toEqual([
      "원판 룰 RM-006 을 찾을 수 없습니다",
    ]);
  });

  it("원판 변경 — 앞 버전과 원판 두께범위가 달라지면 파생에 재검토 필요(v1.000 → v1.001)", () => {
    const v1 = version("1.000", [base("2.2"), derived(), solo]);
    const v2 = version("1.001", [base("2.5"), derived(), solo]);
    expect(previousVersion([v1, v2], "1.001")).toBe(v1);
    expect(previousVersion([v1, v2], "1.000")).toBeUndefined();
    const l = buildLineage(v2, v1);
    expect(l.reviews.get("RM-007")).toEqual([
      "원판 RM-006 변경(v1.000 → v1.001): 두께범위 0.2 ≤ t < 2.2 → 0.2 ≤ t < 2.5",
    ]);
    // 목록 배지 — 이력을 품은 표시 설정, 지금 버전(1.001)과 앞 버전을 견준다.
    const display = rawMaterialDisplay([v1, v2]);
    const rule = {
      ruleId: "QD_RAW_MATERIAL_GRADE",
      applyFrom: null,
      hitPolicy: "FIRST",
      ...v2,
    };
    expect(rowBadges(display, v2.rows[1].results, rule)).toEqual([
      expect.objectContaining({ label: "재검토 필요", tone: "warning" }),
    ]);
    expect(rowBadges(display, v2.rows[0].results, rule)).toEqual([]);
    expect(rowBadges(rawMaterialDisplay([]), v2.rows[1].results, rule)).toEqual(
      [],
    );
  });

  it("기준유형 칸 글 — 원판 룰 ID 를 붙인다", () => {
    expect(kindText("DERIVED", { BASE_RULE_KEY: "RM-001" })).toBe(
      "칼라파생 ↳ RM-001",
    );
    expect(kindText("BASE", { BASE_RULE_KEY: null })).toBe("도금기준");
  });
});
