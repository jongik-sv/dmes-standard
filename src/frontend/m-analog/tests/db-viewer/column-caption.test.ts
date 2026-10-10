import { describe, expect, it } from "vitest";
import {
  dbCommentOf,
  mdmNamesOf,
} from "../../src/anl/db-viewer/column-caption";
import type { MdmScreenColumn } from "@dk-oasis/shared/mdm-meta";

/** 최소 MDM 컬럼 메타 — 시험에서 바꿀 칸만 받는다. */
function meta(overrides: Partial<MdmScreenColumn> = {}): MdmScreenColumn {
  return {
    physName: "CODE_ID",
    columnName: null,
    labelLong: null,
    labelMid: null,
    labelShort: null,
    description: null,
    usageNote: null,
    dataType: null,
    length: null,
    scale: null,
    required: false,
    defaultValue: null,
    refKind: null,
    refTarget: null,
    refCateId: null,
    domain: null,
    stdExpr: null,
    bizRuleOnServer: false,
    bizRequiredVars: [],
    codeRef: null,
    allowedCodes: null,
    ...overrides,
  };
}

describe("dbCommentOf", () => {
  it("칼럼 주석을 앞뒤 공백을 떼고 보인다", () => {
    expect(dbCommentOf("  코드 식별자 ")).toBe("코드 식별자");
    expect(dbCommentOf("코드 식별자")).toBe("코드 식별자");
  });

  it("주석이 없거나 공백뿐이면 빈칸이다", () => {
    expect(dbCommentOf(null)).toBe("");
    expect(dbCommentOf(undefined)).toBe("");
    expect(dbCommentOf("   ")).toBe("");
  });
});

describe("mdmNamesOf", () => {
  const columns = [{ COLUMN_NAME: "CODE_ID" }, { COLUMN_NAME: "CODE_NM" }];

  it("메타가 있으면 그리드 헤더와 같은 캡션 순서(labelShort 먼저)로 이름을 얻는다", () => {
    const names = mdmNamesOf(
      columns,
      new Map([
        ["CODE_ID", meta({ labelShort: "코드", labelMid: "코드 ID" })],
        ["CODE_NM", meta({ columnName: "코드명" })],
      ]),
    );
    expect(names.get("CODE_ID")).toBe("코드");
    // label 칸이 모두 비었으면 columnName 으로 캡션을 만든다.
    expect(names.get("CODE_NM")).toBe("코드명");
  });

  it("사전에 없는 칼럼(null)과 알 수 없는 칼럼(키 없음)은 이름을 갖지 않는다", () => {
    const names = mdmNamesOf(columns, new Map([["CODE_ID", null]]));
    expect(names.has("CODE_ID")).toBe(false);
    expect(names.has("CODE_NM")).toBe(false);
  });
});
