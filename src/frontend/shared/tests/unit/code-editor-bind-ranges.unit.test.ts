import { describe, expect, it } from "vitest";

import { findBindRanges } from "../../src/components/code-editor";

describe("findBindRanges — SQL 의 :이름 바인드 위치", () => {
  it("이름과 구간(콜론 포함)을 처음 나온 순서로 돌려준다", () => {
    const sql = "SELECT * FROM T WHERE A = :deptCd AND B = :Dt_1";
    const r = findBindRanges(sql);
    expect(r.map((b) => b.name)).toEqual(["deptCd", "Dt_1"]);
    expect(sql.slice(r[0].start, r[0].end)).toBe(":deptCd");
    expect(sql.slice(r[1].start, r[1].end)).toBe(":Dt_1");
  });

  it("작은따옴표 문자열과 주석 안의 :이름 은 바인드가 아니다", () => {
    const sql = "SELECT ':a' x, /* :b */ y FROM T -- :c\nWHERE z = :real";
    expect(findBindRanges(sql).map((b) => b.name)).toEqual(["real"]);
  });

  it("::, := 와 숫자 바인드, 단어에 붙은 콜론은 뺀다", () => {
    const sql = "SELECT a::int, x:=1, :1, t:name FROM T WHERE k = :ok";
    expect(findBindRanges(sql).map((b) => b.name)).toEqual(["ok"]);
  });

  it("같은 이름이 여러 번 나오면 모두 돌려준다", () => {
    expect(findBindRanges(":a + :a").map((b) => b.start)).toEqual([0, 5]);
  });

  it("빈 글이면 빈 배열", () => {
    expect(findBindRanges("")).toEqual([]);
  });
});
