// TSK-05-03 design.md §3.5 — 스냅샷 내려받기(JSON 텍스트·엑셀 행·파일 이름).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SNAPSHOT_EXCEL_COLUMNS, snapshotExcelRows, snapshotFileBase, snapshotJsonText, type LayoutSnapshot } from "@/layout/snapshot-export";

const M201 = JSON.parse(readFileSync(path.resolve(__dirname, "../fixtures/m201-snapshot.json"), "utf8")) as LayoutSnapshot;

describe("snapshot-export", () => {
  it("파일 이름은 layout-{id}-v{n}", () => {
    expect(snapshotFileBase(12, 2)).toBe("layout-12-v2");
  });

  it("엑셀 행은 헤더·본문 항목을 절대 위치 순으로 편다", () => {
    const rows = snapshotExcelRows(M201, { COIL_THK: "코일 두께", SND_FAC_TP: "송신공장구분" });
    expect(rows).toHaveLength(23);
    expect(rows[0].POSITION).toBe("1-8");
    expect(rows[0].ZONE).toBe("L100 GLUE 공통 헤더");
    expect(rows[0].VALUE).toBe("LAYOUT_ID");
    expect(rows[1].VALUE).toBe("B1"); // 재정의가 기본값보다 먼저
    expect(rows[1].NAME).toBe("송신공장구분");
    const offsets = rows.map((r) => Number(r.OFFSET));
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    const l110First = rows.find((r) => r.COLUMN_PHYS === "LINE_CODE");
    expect(l110First?.OFFSET).toBe(100);
    expect(l110First?.POSITION).toBe("101-102");
    const thk = rows.find((r) => r.COLUMN_PHYS === "COIL_THK");
    expect(thk?.POSITION).toBe("159-162");
    expect(thk?.UNIT_CODE).toBe("mm");
    expect(thk?.NUM_FORMAT).toBe("부호 없음·0 채움·암묵 소수 1");
    expect(thk?.NAME).toBe("코일 두께");
    expect(rows[22].FILL_KIND).toBe("FILLER");
    expect(rows[22].NAME).toBe("여분");
    expect(SNAPSHOT_EXCEL_COLUMNS.map((c) => c.key)).toEqual(Object.keys(rows[0]));
  });

  it("JSON 텍스트는 2칸 들여쓰기로 다시 읽으면 같다", () => {
    const text = snapshotJsonText(M201);
    expect(text.split("\n")[1]).toMatch(/^ {2}"/);
    expect(JSON.parse(text)).toEqual(M201);
  });
});
