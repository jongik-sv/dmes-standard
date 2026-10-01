// D-132 — 부모 연결·교체·제거 순수 함수: 저장된 행 → 초안, 부모만 바꾸기, 후보, 문구.
import { describe, expect, it } from "vitest";
import { linkCandidates, parentLinkLabels, relinkDraft, storedForm } from "../../../pages/dma/domainMng/parent-link";
import type { DomainDetail, DomainRow } from "../../../pages/dma/domainMng/types";

function row(id: number, parent: number | null, extra: Partial<DomainRow> = {}): DomainRow {
  return {
    DOMAIN_ID: id, PARENT_DOMAIN_ID: parent, DEPTH: parent === null ? 0 : 1, DOMAIN_NAME: `도메인${id}`, STD_NAME: `D${id}`,
    DOMAIN_KIND: "QTY", DATA_TYPE: "NUMBER", LENGTH: null, SCALE: null, UNIT_CODE: null, MARU_CODE_ID: null,
    CATE_ID: null, STD_RULE: null, BIZ_RULE: null, VER: 3, EFF_LENGTH: null, EFF_SCALE: null, EFF_UNIT_CODE: null,
    EFF_MARU_CODE_ID: null, EFF_CATE_ID: null, EFF_STD_EXPR: null, EFF_STD_AST: null, EFF_BIZ_EXPR: null,
    BIZ_REQUIRED_VARS: [], HAS_BIZ: false, CHILD_COUNT: 0, MATCHED: true, ...extra,
  };
}

function detail(extra: Partial<DomainDetail> = {}): DomainDetail {
  return {
    ...row(2, 1, { LENGTH: 10, STD_RULE: "value < 9" }),
    DESCRIPTION: null, EXAMPLES: ["1", "2"],
    TEST_CASES: [{ VALUE: "5", EXPECT: true, VARS: null, MEMO: null }, { VALUE: "10", EXPECT: false, VARS: "{}", MEMO: "경계" }],
    ...extra,
  };
}

describe("parent-link", () => {
  it("저장된 행을 화면 초안·케이스·예시로 바꾼다", () => {
    const f = storedForm(detail());
    expect(f.draft).toMatchObject({ domainId: 2, ver: 3, parentDomainId: 1, length: 10, stdRule: "value < 9", bizRule: "",
      description: "" });
    expect(f.cases).toEqual([
      { VALUE: "5", EXPECT: true, VARS: "", MEMO: "" },
      { VALUE: "10", EXPECT: false, VARS: "{}", MEMO: "경계" },
    ]);
    expect(f.examples).toEqual(["1", "2"]);
  });

  it("부모만 바꾸고 나머지는 저장된 값 그대로다", () => {
    const relinked = relinkDraft(detail(), 7);
    const stored = storedForm(detail());
    expect(relinked.draft).toEqual({ ...stored.draft, parentDomainId: 7 });
    expect(relinked.cases).toEqual(stored.cases);
    expect(relinkDraft(detail(), null).draft.parentDomainId).toBeNull();
  });

  it("후보에서 자기·자기 하위·지금 부모를 뺀다", () => {
    const rows = [row(1, null), row(2, 1), row(3, 2), row(4, null), row(5, 4)];
    expect(linkCandidates(rows, 2, 1).map((r) => r.DOMAIN_ID)).toEqual([4, 5]);
    expect(linkCandidates(rows, 4, null).map((r) => r.DOMAIN_ID)).toEqual([1, 2, 3]);
  });

  it("부모가 있는 도메인의 연결은 교체다", () => {
    expect(parentLinkLabels("link", false)).toEqual({ title: "부모 연결", action: "연결" });
    expect(parentLinkLabels("link", true)).toEqual({ title: "부모 교체", action: "교체" });
    expect(parentLinkLabels("unlink", true)).toEqual({ title: "부모 연결 제거", action: "연결 제거" });
  });
});
