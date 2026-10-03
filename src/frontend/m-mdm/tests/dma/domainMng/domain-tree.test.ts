// TSK-04-03 design.md §4.5 — 트리 표시 순수 함수(들여쓰기·부모 후보).
import { describe, expect, it } from "vitest";
import { indentLabel, parentCandidates, toGridRows, typeLabel } from "../../../pages/dma/domainMng/domain-tree";
import type { DomainRow } from "../../../pages/dma/domainMng/types";

function row(id: number, parent: number | null, depth: number, name: string, extra: Partial<DomainRow> = {}): DomainRow {
  return {
    DOMAIN_ID: id, PARENT_DOMAIN_ID: parent, DEPTH: depth, DOMAIN_NAME: name, STD_NAME: `D${id}`,
    DOMAIN_KIND: "QTY", DATA_TYPE: "NUMBER", LENGTH: null, SCALE: null, UNIT_CODE: null, MARU_CODE_ID: null,
    CATE_ID: null, STD_RULE: null, BIZ_RULE: null, VER: 0, EFF_LENGTH: null, EFF_SCALE: null, EFF_UNIT_CODE: null,
    EFF_MARU_CODE_ID: null, EFF_CATE_ID: null, EFF_STD_EXPR: null, EFF_STD_AST: null, EFF_BIZ_EXPR: null,
    BIZ_REQUIRED_VARS: [], HAS_BIZ: false, CHILD_COUNT: 0, MATCHED: true, ...extra,
  };
}

describe("domain-tree", () => {
  it("깊이만큼 들여쓰고 자식에는 └ 를 붙인다", () => {
    expect(indentLabel("중량", 0)).toBe("중량");
    expect(indentLabel("코일 중량", 1)).toBe("└ 코일 중량");
    expect(indentLabel("GROSS 중량", 2)).toBe("　└ GROSS 중량");
  });

  it("부모 후보에서 자기와 자기 하위를 뺀다", () => {
    const rows = [row(1, null, 0, "중량"), row(2, 1, 1, "코일 중량"), row(3, 2, 2, "GROSS"), row(4, null, 0, "두께")];
    expect(parentCandidates(rows, 2).map((r) => r.DOMAIN_ID)).toEqual([1, 4]);
    expect(parentCandidates(rows, null).map((r) => r.DOMAIN_ID)).toEqual([1, 2, 3, 4]);
    expect(parentCandidates([], 1)).toEqual([]);
  });

  it("타입 칸 — 최상위는 타입 길이,소수, 자식은 상속 또는 좁힌 길이", () => {
    expect(typeLabel(row(1, null, 0, "중량", { LENGTH: 12, SCALE: 3 }))).toBe("숫자 12,3");
    expect(typeLabel(row(2, 1, 1, "코일 중량"))).toBe("(상속)");
    expect(typeLabel(row(3, 1, 1, "코일", { LENGTH: 8 }))).toBe("≤ 8");
  });

  it("그리드 행은 다른 칸에서 파생되는 표시를 자기 칸 값으로 미리 담는다 — 같은 행 키로 다시 조회해도 바뀐 칸이 다시 그려진다", () => {
    // 그리드는 행 키가 같으면 칸 값이 바뀐 칸만 다시 그린다. 표시가 DEPTH·PARENT_DOMAIN_ID 같은 다른 칸에서 나오면
    // 부모 연결을 끊고 다시 조회해도 「└ … (상속)」이 남는다(e2e domainMng E8). 그래서 표시 문자열을 칸 값으로 둔다.
    const linked = toGridRows([row(2, 1, 1, "코일 중량", { UNIT_CODE: null })])[0];
    const unlinked = toGridRows([row(2, null, 0, "코일 중량", { UNIT_CODE: null })])[0];
    expect(linked._NAME).toBe("└ 코일 중량");
    expect(unlinked._NAME).toBe("코일 중량");
    expect(linked._UNIT).toBe("(상속)");
    expect(unlinked._UNIT).toBe("");
    expect(linked._TYPE).toBe("(상속)");
    expect(unlinked._TYPE).not.toBe(linked._TYPE);
    // 검색 일치 여부(흐린 글자)만 바뀌어도 이름 칸 값이 달라진다.
    const dim = toGridRows([row(2, 1, 1, "코일 중량", { MATCHED: false })])[0];
    expect(dim._NAME).not.toBe(linked._NAME);
    expect(dim._NAME.replace(/\u200B/g, "")).toBe(linked._NAME);
    // 종류에 따라 바뀌는 표준식 칸, 비즈니스식 요약 칸
    expect(toGridRows([row(3, null, 0, "코드", { DOMAIN_KIND: "CODE", STD_RULE: "x" })])[0]._STD).toBe("비움(코드 참조만)");
    expect(toGridRows([row(4, null, 0, "길이", { HAS_BIZ: true, BIZ_REQUIRED_VARS: ["A", "B"] })])[0]._BIZ).toBe("있음 (A, B)");
    expect(toGridRows([row(4, null, 0, "길이")])[0]._BIZ).toBe("-");
  });
});
