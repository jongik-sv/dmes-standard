// TSK-08-04 design §2.5·I26 — 저장 뒤 동치 배지(`sameIssues`)는 분석기 코드(7종 + DERIVE_ORDER)만 견준다. 서버 저장 검사가 더한
// 이슈(코드 참조·도메인 범위 등)는 배지를 깨지 않고 "서버 저장 검사" 목록으로 따로 보인다.
import { describe, expect, it } from "vitest";

import { ANALYZER_CODES, sameIssues, serverOnlyIssues } from "../../../pages/dme/ruleEdit/decision-table/analysis";
import type { RuleIssueView } from "../../../pages/dme/ruleEdit/types";

const overlap: RuleIssueView = { code: "OVERLAP", severity: "WARNING", rowIds: [1, 2] };
const codeRef: RuleIssueView = { code: "CODE_VALUE_MISSING", severity: "WARNING", rowIds: [1], varId: 3, message: "행 1·표면등급: 코드 값 X 가 없다" };
const domain: RuleIssueView = { code: "DOMAIN_RANGE", severity: "WARNING", rowIds: [2], varId: 1 };

describe("분석기 코드 범위", () => {
  it("ANALYZER_CODES 는 분석기 코드 7종과 DERIVE_ORDER 다", () => {
    expect([...ANALYZER_CODES].sort()).toEqual(
      ["ALL_NA_ROW", "DERIVE_ORDER", "NULL_GAP", "OVERLAP", "OVERLAP_UNRESOLVED", "UNREACHABLE", "UNRESOLVED_CELL", "VALUE_GAP"].sort(),
    );
  });

  it("서버 이슈에 비분석 코드가 앞뒤로 더 있어도 분석 이슈가 같으면 참", () => {
    expect(sameIssues([overlap], [codeRef, overlap, domain])).toBe(true);
    expect(sameIssues([], [codeRef])).toBe(true);
  });

  it("분석 코드가 다르면 거짓", () => {
    expect(sameIssues([overlap], [codeRef, { ...overlap, severity: "ERROR" }])).toBe(false);
    expect(sameIssues([overlap], [codeRef])).toBe(false);
    expect(sameIssues([], [{ code: "ALL_NA_ROW", severity: "ERROR", rowIds: [5] }])).toBe(false);
  });

  it("serverOnlyIssues 는 분석기 코드가 아닌 이슈만 순서대로 돌려준다", () => {
    expect(serverOnlyIssues([codeRef, overlap, domain])).toEqual([codeRef, domain]);
  });
});
