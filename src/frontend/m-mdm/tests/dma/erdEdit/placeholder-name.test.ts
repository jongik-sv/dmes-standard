import { describe, expect, it } from "vitest";

import { GRID_COLUMNS, gridRows } from "../../../pages/dma/erdEdit/panels/ColumnGrid";
import { placeholderName } from "../../../pages/dma/erdEdit/placeholder-name";
import { menuModel } from "./erd-fixtures";

describe("placeholderName (§7.3)", () => {
  it("EXCEL_TP「*** 구분」→「EXCEL 구분」, 바꿔 넣은 자리 0", () => {
    expect(placeholderName("*** 구분", "EXCEL_TP")).toEqual({
      display: "EXCEL 구분", reconstructed: "*** 구분", unknownWords: [0], mismatch: false,
    });
  });

  it("GROUP_ID1「*** ***」→「GROUP ID1」, 두 자리 모두", () => {
    const r = placeholderName("*** ***", "GROUP_ID1");
    expect(r.display).toBe("GROUP ID1");
    expect(r.unknownWords).toEqual([0, 1]);
    expect(r.reconstructed).toBe("*** ***");
  });

  it("PWD_FAIL_COUNT「분말 실패 ***」→「분말 실패 COUNT」, 자리 2", () => {
    const r = placeholderName("분말 실패 ***", "PWD_FAIL_COUNT");
    expect(r.display).toBe("분말 실패 COUNT");
    expect(r.unknownWords).toEqual([2]);
  });

  it("수가 다르면 display = reconstructed, unknownWords 비움, mismatch 로 툴팁에 물리명 전체", () => {
    const r = placeholderName("*** 구분", "A_B_C");
    expect(r).toEqual({ display: "*** 구분", reconstructed: "*** 구분", unknownWords: [], mismatch: true });
  });

  it("*** 가 없으면 그대로이고 mismatch 도 아니다", () => {
    expect(placeholderName("품목 코드", "ITEM_CD")).toEqual({
      display: "품목 코드", reconstructed: "품목 코드", unknownWords: [], mismatch: false,
    });
  });
});

describe("컬럼 그리드 — 사전 재구성 칸", () => {
  it("칸 순서 = 논리명 | 사전 재구성 | 물리명, 재구성 칸은 읽기 전용, 편집 칸은 그대로", () => {
    const keys = GRID_COLUMNS.map((c) => c.key);
    expect(keys.slice(1, 4)).toEqual(["logical", "reconstructed", "phys"]);
    expect(GRID_COLUMNS.find((c) => c.key === "reconstructed")?.editable).toBeUndefined();
  });

  it("행의 logical 은 저장 값 그대로(편집기가 저장 값으로 시작), 표시 값은 logicalShown 에 따로 둔다", () => {
    const m = menuModel();
    const cid = m.tables["t-1"].columnOrder[0];
    m.columns[cid].logical = "*** 구분";
    m.columns[cid].phys = "EXCEL_TP";
    const row = gridRows(m, "t-1", null, new Set(), true)[0];
    expect(row.logical).toBe("*** 구분");
    expect(row.reconstructed).toBe("*** 구분");
    expect(row.logicalShown.display).toBe("EXCEL 구분");
  });
});
