import { describe, expect, it } from "vitest";

import { formatSlot, formatValue, isCollectStored, mergePages, pivotBySlot, toLatestRows } from "./collect-data";
import type { CollectDataRow } from "./types";

const row = (slot: string, itemKey: string, valueNum: number | null, valueTxt = ""): CollectDataRow => ({ slot, itemKey, valueNum, valueTxt, collectedAt: "2026-10-09T08:50:01" });

describe("formatSlot·formatValue", () => {
  it("SLOT 을 날짜·시각 글자로 바꾸고 형식이 아니면 그대로 둔다", () => {
    expect(formatSlot("202610090850")).toBe("2026-10-09 08:50");
    expect(formatSlot("abc")).toBe("abc");
  });
  it("숫자 값은 소수 8자리까지 불필요한 0 없이, 없으면 글자 값을 보인다", () => {
    expect(formatValue({ valueNum: 21.5, valueTxt: "" })).toBe("21.5");
    expect(formatValue({ valueNum: 1234567.1, valueTxt: "" })).toBe("1,234,567.1");
    expect(formatValue({ valueNum: 0, valueTxt: "x" })).toBe("0");
    expect(formatValue({ valueNum: null, valueTxt: "맑음" })).toBe("맑음");
  });
});

describe("toLatestRows", () => {
  it("항목 키·값·수집 시각 행으로 바꾼다", () => {
    expect(toLatestRows([row("202610090850", "TEMP", 21.5)])).toEqual([{ itemKey: "TEMP", value: "21.5", collectedAt: "2026-10-09T08:50:01" }]);
  });
});

describe("pivotBySlot", () => {
  const data = [row("202610090850", "TEMP", 21.5), row("202610090850", "HUM", 40), row("202610090840", "TEMP", 20.1), row("202610090840", "A.B C", null, "메모")];

  it("SLOT 이 행, 항목이 열이다(최신 SLOT 먼저, 항목은 사전순, 칸 이름은 순번)", () => {
    const p = pivotBySlot(data);
    expect(p.columns).toEqual([
      { key: "c0", header: "A.B C" },
      { key: "c1", header: "HUM" },
      { key: "c2", header: "TEMP" },
    ]);
    expect(p.rows.map((r) => r.slot)).toEqual(["202610090850", "202610090840"]);
    expect(p.rows[0]).toEqual({ slot: "202610090850", slotLabel: "2026-10-09 08:50", c1: "40", c2: "21.5" });
    expect(p.rows[1]).toEqual({ slot: "202610090840", slotLabel: "2026-10-09 08:40", c0: "메모", c2: "20.1" });
    expect(p.clipped).toBe(false);
  });

  it("항목이 상한을 넘으면 앞쪽 열만 두고 clipped 로 알린다", () => {
    const p = pivotBySlot(data, 2);
    expect(p.columns.map((c) => c.header)).toEqual(["A.B C", "HUM"]);
    expect(p.clipped).toBe(true);
    expect(p.rows[0].c2).toBeUndefined();
  });

  it("빈 입력은 빈 결과다", () => {
    expect(pivotBySlot([])).toEqual({ columns: [], rows: [], clipped: false });
  });
});

describe("mergePages", () => {
  it("같은 (SLOT, 항목)은 뒤에 온 것으로 바꾸고 SLOT 내림차순·항목 오름차순으로 정렬한다", () => {
    const merged = mergePages([row("202610090850", "B", 1), row("202610090850", "A", 1)], [row("202610090850", "B", 2), row("202610090840", "A", 3)]);
    expect(merged.map((r) => `${r.slot}/${r.itemKey}/${r.valueNum}`)).toEqual(["202610090850/A/1", "202610090850/B/2", "202610090840/A/3"]);
  });
});

describe("isCollectStored", () => {
  it("저장한 수집 작업이고 값 저장이 켜진 것만 참이다", () => {
    expect(isCollectStored({ isNew: false, jobKind: "COLLECT", save: true })).toBe(true);
    expect(isCollectStored({ isNew: false, jobKind: "COLLECT", save: false })).toBe(false);
    expect(isCollectStored({ isNew: true, jobKind: "COLLECT", save: true })).toBe(false);
    expect(isCollectStored({ isNew: false, jobKind: "QUERY", save: true })).toBe(false);
    expect(isCollectStored(null)).toBe(false);
  });
});
