// 부모 도메인 검색형 선택 — 서버 검색 결과를 후보 규칙으로 거르고 DomainField 줄로 바꾸는 순수 함수.
import { describe, expect, it, vi } from "vitest";
import { parentCandidates } from "../../../pages/dma/domainMng/domain-tree";
import { linkCandidates } from "../../../pages/dma/domainMng/parent-link";
import { makeParentSearch, toPickerRow } from "../../../pages/dma/domainMng/parent-search";
import type { DomainRow } from "../../../pages/dma/domainMng/types";

function row(id: number, parent: number | null, extra: Partial<DomainRow> = {}): DomainRow {
  return {
    DOMAIN_ID: id, PARENT_DOMAIN_ID: parent, DEPTH: parent === null ? 0 : 1, DOMAIN_NAME: `도메인${id}`, STD_NAME: `D${id}`,
    DOMAIN_KIND: "QTY", DATA_TYPE: "NUMBER", LENGTH: null, SCALE: null, UNIT_CODE: null, MARU_CODE_ID: null,
    CATE_ID: null, STD_RULE: null, BIZ_RULE: null, VER: 3, EFF_LENGTH: null, EFF_SCALE: null, EFF_UNIT_CODE: null,
    EFF_MARU_CODE_ID: null, EFF_CATE_ID: null, EFF_STD_EXPR: null, EFF_STD_AST: null, EFF_BIZ_EXPR: null,
    BIZ_REQUIRED_VARS: [], HAS_BIZ: false, CHILD_COUNT: 0, MATCHED: true, ...extra,
  };
}

describe("parent-search", () => {
  it("DomainRow 를 찾기 줄로 바꾼다", () => {
    expect(toPickerRow(row(2, 1, { LENGTH: 10, SCALE: 2, STD_RULE: "value < 9" }))).toEqual({
      domainId: 2, stdName: "D2", domainName: "도메인2", domainKind: "QTY", dataType: "NUMBER", length: 10, scale: 2,
      stdRule: "value < 9",
    });
  });

  it("MATCHED 행만 남기되 조상(MATCHED 아님)을 통해 자기 하위를 찾아 뺀다", async () => {
    // 키워드 "하위" 가 자기(2)의 하위 3 에만 맞았다 — 서버는 조상 1·2 도 MATCHED=false 로 함께 준다.
    const rows = [row(1, null, { MATCHED: false }), row(2, 1, { MATCHED: false }), row(3, 2), row(5, 1)];
    const fetch = vi.fn(async () => rows);
    const search = makeParentSearch(fetch, (r) => parentCandidates(r, 2));
    expect((await search("하위")).map((r) => r.domainId)).toEqual([5]);
    expect(fetch).toHaveBeenCalledWith("하위");
  });

  it("자기 자신은 이름을 정확히 넣어도 나오지 않는다", async () => {
    const rows = [row(1, null, { MATCHED: false }), row(2, 1, { DOMAIN_NAME: "코일" })];
    const search = makeParentSearch(async () => rows, (r) => parentCandidates(r, 2));
    expect(await search("코일")).toEqual([]);
  });

  it("손자만 검색어에 맞아도(조상은 MATCHED 아님) 제외가 MATCHED 거르기보다 앞서 손자가 빠진다 — 연결 후보 경로", async () => {
    // 자기 2, 2→3→4. 서버는 4 만 MATCHED, 조상 1·2·3 은 MATCHED=false 로 준다. MATCHED 부터 거르면 4 가 새어 나온다.
    const rows = [row(1, null, { MATCHED: false }), row(2, 1, { MATCHED: false }), row(3, 2, { MATCHED: false }), row(4, 3), row(9, null)];
    const search = makeParentSearch(async () => rows, (r) => linkCandidates(r, 2, 1));
    expect((await search("손자")).map((r) => r.domainId)).toEqual([9]);
  });

  it("신규(자기 없음)는 MATCHED 전부, 연결 후보는 지금 부모도 뺀다", async () => {
    const rows = [row(1, null), row(2, 1), row(3, null, { MATCHED: false })];
    expect((await makeParentSearch(async () => rows, (r) => parentCandidates(r, null))("")).map((r) => r.domainId)).toEqual([1, 2]);
    const link = makeParentSearch(async () => rows, (r) => linkCandidates(r, 2, 1));
    expect(await link("")).toEqual([]);
  });

  it("9건 이상 맞으면 정확히 일치 → 앞부분 일치 → 나머지 순으로 8건만 준다", async () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => row(10 + i, null, { DOMAIN_NAME: `큰 두께${i}`, STD_NAME: `X${i}` })),
      row(20, null, { DOMAIN_NAME: "두께 A", STD_NAME: "A" }),
      row(21, null, { DOMAIN_NAME: "두께", STD_NAME: "B" }),
    ];
    const out = await makeParentSearch(async () => rows, (r) => r)("두께");
    expect(out).toHaveLength(8);
    expect(out.slice(0, 2).map((r) => r.domainId)).toEqual([21, 20]);
    expect(out.map((r) => r.domainId)).toEqual([21, 20, 10, 11, 12, 13, 14, 15]);
  });
});
