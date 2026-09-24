// TSK-05-02 design.md §3.4·F10 — fill_kind 칸 행렬(불변 I6). Java LayoutItemRulesTest 와 같은 표.
import { describe, expect, it } from "vitest";
import { AUTO_KINDS, FIELDS, cell, clearClosedFields, precheck } from "../../src/layout/fill-kind";
import type { FillKind, LayoutItemRow } from "../../src/layout/types";

const CLOSED = [
  "DATA.DEFAULT_VALUE", "DATA.FILLER_LENGTH", "CONST.FILLER_LENGTH", "AUTO.FILLER_LENGTH", "AUTO.TRANS_UNIT", "AUTO.UNIT_ITEM",
  "FILLER.COLUMN_PHYS", "FILLER.DEFAULT_VALUE", "FILLER.TRANS_UNIT", "FILLER.UNIT_ITEM", "FILLER.NUM_FORMAT",
];
const REQUIRED = ["DATA.COLUMN_PHYS", "CONST.COLUMN_PHYS", "AUTO.COLUMN_PHYS", "AUTO.DEFAULT_VALUE", "FILLER.FILLER_LENGTH"];
const KINDS: FillKind[] = ["DATA", "CONST", "AUTO", "FILLER"];

describe("fill-kind", () => {
  it("F10 행렬 전 칸이 Java 와 같다", () => {
    let n = 0;
    for (const k of KINDS) {
      for (const f of FIELDS) {
        const key = `${k}.${f}`;
        const expected = CLOSED.includes(key) ? "closed" : REQUIRED.includes(key) ? "required" : "optional";
        expect(cell(k, f), key).toBe(expected);
        n++;
      }
    }
    expect(n).toBe(24);
  });

  it("fill_kind 를 FILLER 로 바꾸면 컬럼·기본값·단위·형식이 비워진다", () => {
    const row: LayoutItemRow = {
      KEY: "k", SEQ: 1, FILL_KIND: "FILLER", COLUMN_PHYS: "COIL_THK", DEFAULT_VALUE: "1", TRANS_UNIT: "mm", UNIT_ITEM: "U",
      NUM_FORMAT: "SIGN=N;ZERO=Y;SCALE=0;WIDTH=4", FILLER_LENGTH: 5, DISPLAY_NAME: "코일 두께", DOMAIN_LENGTH: 3,
    };
    const out = clearClosedFields(row);
    expect(out.COLUMN_PHYS).toBeNull();
    expect(out.DEFAULT_VALUE).toBeNull();
    expect(out.TRANS_UNIT).toBeNull();
    expect(out.UNIT_ITEM).toBeNull();
    expect(out.NUM_FORMAT).toBeNull();
    expect(out.FILLER_LENGTH).toBe(5);
    expect(out.DISPLAY_NAME).toBeNull();
    expect(out.DOMAIN_LENGTH).toBeNull();
  });

  it("DATA 로 바꾸면 FILLER 길이와 기본값이 비워진다", () => {
    const out = clearClosedFields({ KEY: "k", SEQ: 1, FILL_KIND: "DATA", FILLER_LENGTH: 5, DEFAULT_VALUE: "X", COLUMN_PHYS: "C" });
    expect(out.FILLER_LENGTH).toBeNull();
    expect(out.DEFAULT_VALUE).toBeNull();
    expect(out.COLUMN_PHYS).toBe("C");
  });

  it("AUTO_KINDS 는 4종", () => {
    expect(AUTO_KINDS).toEqual(["SEND_TIME", "MSG_LENGTH", "SEQ", "LAYOUT_ID"]);
  });

  it("precheck 는 서버와 같은 L02·L03 문구를 낸다", () => {
    expect(precheck([{ KEY: "a", SEQ: 1, FILL_KIND: "FILLER", FILLER_LENGTH: 25, DEFAULT_VALUE: "X" }]))
      .toEqual(["L02[1] FILLER 항목에는 DEFAULT_VALUE 를 넣을 수 없다"]);
    expect(precheck([{ KEY: "a", SEQ: 2, FILL_KIND: "AUTO", COLUMN_PHYS: "TC_CD" }]))
      .toEqual(["L03[2] AUTO 항목에는 DEFAULT_VALUE 가 필요하다"]);
    expect(precheck([{ KEY: "a", SEQ: 3, FILL_KIND: "FILLER", FILLER_LENGTH: 0 }]))
      .toEqual(["L03[3] FILLER 길이는 1 이상이다: 0"]);
    expect(precheck([{ KEY: "a", SEQ: 1, FILL_KIND: "DATA", COLUMN_PHYS: "COIL_ID" }])).toEqual([]);
  });
});
