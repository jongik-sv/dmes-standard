import { describe, expect, it } from "vitest";

import {
  axisLabel,
  collectDataOf,
  defaultSelection,
  deltaOf,
  formatCollectedAt,
  readLastRun,
  shouldRunCollect,
  toCollectTiles,
  toTrendPoints,
} from "./format";

const row = (at: string, key: string, value: unknown) => ({ COLLECTED_AT: at, ITEM_KEY: key, VALUE: value });
const resp = (rows: unknown[], extra: Record<string, unknown> = {}) => ({
  columns: ["COLLECTED_AT", "ITEM_KEY", "VALUE"],
  rows,
  truncated: false,
  lastRun: null,
  ...extra,
});

describe("readLastRun", () => {
  it("OK·FAIL·RUN 만 읽고 메시지는 있을 때만", () => {
    expect(readLastRun({ at: "2026-10-05T09:10:00", status: "FAIL", message: "시간 초과" })).toEqual({
      at: "2026-10-05T09:10:00",
      status: "FAIL",
      message: "시간 초과",
    });
    expect(readLastRun({ at: "x", status: "OK", message: "" })).toEqual({ at: "x", status: "OK" });
    expect(readLastRun({ status: "RUN" })).toEqual({ at: "", status: "RUN" });
  });

  it("모양이 이상하면 null", () => {
    for (const v of [null, undefined, "FAIL", [], {}, { status: "DONE" }, { status: 1 }]) expect(readLastRun(v)).toBeNull();
  });
});

describe("collectDataOf", () => {
  it("항목별로 모으고 수집 시각 오름차순, 숫자 글자는 숫자·그 밖은 글자", () => {
    const d = collectDataOf(
      resp([
        row("2026-10-05T09:10:00", "B", "12.5"),
        row("2026-10-05T09:00:00", "B", 10),
        row("2026-10-05T09:00:00", "A", "정상"),
        row("2026-10-05T09:10:00", "A", "점검"),
      ])
    );
    expect(d.items.map((i) => i.key)).toEqual(["B", "A"]);
    expect(d.items[0].points).toEqual([
      { at: "2026-10-05T09:00:00", value: 10 },
      { at: "2026-10-05T09:10:00", value: 12.5 },
    ]);
    expect(d.items[1].points.map((p) => p.value)).toEqual(["정상", "점검"]);
    expect(d.truncated).toBe(false);
    expect(d.lastRun).toBeNull();
  });

  it("값이 없거나 키·시각이 빈 행은 버린다", () => {
    const d = collectDataOf(resp([row("2026-10-05T09:00:00", "A", null), row("", "A", 1), row("2026-10-05T09:00:00", "", 1), row("2026-10-05T09:00:00", "A", 2), "x", null]));
    expect(d.items).toEqual([{ key: "A", points: [{ at: "2026-10-05T09:00:00", value: 2 }] }]);
  });

  it("빈 글자 값은 글자로 둔다(0 이 되지 않는다)", () => {
    expect(collectDataOf(resp([row("2026-10-05T09:00:00", "A", "  ")])).items[0].points[0].value).toBe("  ");
  });

  it("항목 순서는 가장 최근 시각에 있는 항목이 먼저(행 순서), 그 시각에 없는 항목은 뒤에 이름순", () => {
    const d = collectDataOf(
      resp([
        row("2026-10-05T09:00:00", "OLD2", 1),
        row("2026-10-05T09:00:00", "OLD1", 1),
        row("2026-10-05T09:00:00", "A", 1),
        row("2026-10-05T09:10:00", "A", 2),
        row("2026-10-05T09:10:00", "C", 3),
      ])
    );
    expect(d.items.map((i) => i.key)).toEqual(["A", "C", "OLD1", "OLD2"]);
  });

  it("빈 응답·이상한 응답·lastRun·truncated", () => {
    expect(collectDataOf({ rows: [] }).items).toEqual([]);
    expect(collectDataOf(null)).toEqual({ items: [], lastRun: null, truncated: false });
    const d = collectDataOf(resp([], { truncated: true, lastRun: { at: "2026-10-05T09:10:00", status: "FAIL" } }));
    expect(d.truncated).toBe(true);
    expect(d.lastRun).toEqual({ at: "2026-10-05T09:10:00", status: "FAIL" });
  });
});

describe("서식", () => {
  it("formatCollectedAt — 분까지, 모양이 다르면 그대로", () => {
    expect(formatCollectedAt("2026-10-05T09:10:00")).toBe("2026-10-05 09:10");
    expect(formatCollectedAt("2026-10-05 09:10:00")).toBe("2026-10-05 09:10");
    expect(formatCollectedAt("어제")).toBe("어제");
  });

  it("axisLabel — 하루 안이면 시각만", () => {
    expect(axisLabel("2026-10-05T09:10:00", false)).toBe("09:10");
    expect(axisLabel("2026-10-05T09:10:00", true)).toBe("10-05 09:10");
    expect(axisLabel("x", true)).toBe("x");
  });

  it("deltaOf — 늘면 ▲, 줄면 ▼, 같으면 ―, 전 값이 0 이면 백분율 없음, 글자면 null", () => {
    const p = (value: number | string) => ({ at: "", value });
    expect(deltaOf(p(100), p(103.2))).toEqual({ text: "▲ 3.2 (+3.2%)", dir: "up" });
    expect(deltaOf(p(200), p(150))).toEqual({ text: "▼ 50 (-25.0%)", dir: "down" });
    expect(deltaOf(p(5), p(5))).toEqual({ text: "― 0", dir: "flat" });
    expect(deltaOf(p(0), p(7))).toEqual({ text: "▲ 7", dir: "up" });
    expect(deltaOf(p(-10), p(-5))).toEqual({ text: "▲ 5 (+50.0%)", dir: "up" });
    expect(deltaOf(p(1234), p(2468))).toEqual({ text: "▲ 1,234 (+100.0%)", dir: "up" });
    expect(deltaOf(undefined, p(1))).toBeNull();
    expect(deltaOf(p("A"), p(1))).toBeNull();
    expect(deltaOf(p(1), p("B"))).toBeNull();
    // 부동소수 잔재가 보이지 않는다(0.1 + 0.2 류).
    expect(deltaOf(p(0.1), p(0.3))?.text.startsWith("▲ 0.2 ")).toBe(true);
  });
});

describe("toCollectTiles", () => {
  const data = collectDataOf(
    resp([
      row("2026-10-05T09:00:00", "라인1", 1000),
      row("2026-10-05T09:00:00", "상태", "정상"),
      row("2026-10-05T09:10:00", "라인1", 1030),
      row("2026-10-05T09:10:00", "상태", "점검"),
      row("2026-10-05T09:10:00", "신규", 5),
    ])
  );

  it("최신 값·단위(숫자만)·전 회차 대비·수집 시각", () => {
    const tiles = toCollectTiles(data.items, "건");
    expect(tiles.map((t) => t.key)).toEqual(["라인1", "상태", "신규"]);
    expect(tiles[0]).toEqual({ key: "라인1", value: "1,030", unit: "건", delta: "▲ 30 (+3.0%)", deltaDir: "up", collectedAt: "2026-10-05 09:10", chartable: true });
    // 글자 값에는 단위·증감이 없다.
    expect(tiles[1]).toEqual({ key: "상태", value: "점검", collectedAt: "2026-10-05 09:10", chartable: false });
    // 회차가 하나뿐이면 증감·추이가 없다.
    expect(tiles[2]).toMatchObject({ value: "5", unit: "건", chartable: false });
    expect(tiles[2].delta).toBeUndefined();
  });

  it("단위가 없으면 unit 키가 없다", () => {
    expect(toCollectTiles(data.items, "")[0]).not.toHaveProperty("unit");
  });
});

describe("추이·선택", () => {
  const data = collectDataOf(
    resp([
      row("2026-10-05T09:00:00", "A", 1),
      row("2026-10-05T09:10:00", "A", "x"),
      row("2026-10-05T09:20:00", "A", 3),
      row("2026-10-06T09:00:00", "A", 4),
    ])
  );

  it("toTrendPoints — 숫자 값만, 여러 날이면 날짜 포함 눈금", () => {
    expect(toTrendPoints(data.items[0])).toEqual([
      { label: "10-05 09:00", value: 1 },
      { label: "10-05 09:20", value: 3 },
      { label: "10-06 09:00", value: 4 },
    ]);
    expect(toTrendPoints(undefined)).toEqual([]);
  });

  it("하루 안이면 시각만", () => {
    const one = collectDataOf(resp([row("2026-10-05T09:00:00", "A", 1), row("2026-10-05T09:10:00", "A", 2)]));
    expect(toTrendPoints(one.items[0]).map((p) => p.label)).toEqual(["09:00", "09:10"]);
  });

  it("defaultSelection — 추이를 그릴 수 있는 첫 항목, 없으면 첫 항목, 없으면 null", () => {
    const tile = (key: string, chartable: boolean) => ({ key, value: "1", collectedAt: "", chartable });
    expect(defaultSelection([tile("a", false), tile("b", true)])).toBe("b");
    expect(defaultSelection([tile("a", false)])).toBe("a");
    expect(defaultSelection([])).toBeNull();
  });
});

describe("shouldRunCollect", () => {
  it("저장 전 자리 표시 ID·빈 ID 는 부르지 않는다", () => {
    expect(shouldRunCollect("def.k3x9q2ab")).toBe(true);
    expect(shouldRunCollect("def.preview")).toBe(false);
    expect(shouldRunCollect("")).toBe(false);
    expect(shouldRunCollect("  ")).toBe(false);
  });
});
