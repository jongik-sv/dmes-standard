/**
 * 기본 탭(고정 탭)·내보내기·가져오기·공유 결과 순수 함수(widget-tabs 2026-10-05, 설계 design-widget-tabs §4).
 */
import { describe, expect, it } from "vitest";

import {
  buildTabExport,
  fixedTabCount,
  isFixedTab,
  orderTabs,
  parseTabImport,
  shareResultMessage,
  tabImportMessage,
  uniqueTabName,
} from "../../src/widget";
import type { WidgetItem, WidgetRegistry, WidgetTab } from "../../src/widget";

const load = async () => ({ default: () => null });
const REG: WidgetRegistry = {
  "t.a": { meta: { id: "t.a", title: "가", defaultSize: { w: 6, h: 6 } }, load },
  "t.one": { meta: { id: "t.one", title: "하나", defaultSize: { w: 24, h: 6 }, multiple: false }, load },
  "t.off": { meta: { id: "t.off", title: "꺼짐", defaultSize: { w: 6, h: 6 }, disabled: true }, load },
};
const tab = (tabId: string, name: string, seq: number, extra: Partial<WidgetTab> = {}): WidgetTab => ({ tabId, name, seq, locked: false, items: [], ...extra });
const item = (instId: string, x = 0, y = 0): WidgetItem => ({ instId, widgetId: "t.a", x, y, w: 6, h: 6, locked: false, config: null });

const file = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 1, kind: "dmes-widget-tab", name: "생산", items: [{ widgetId: "t.a", x: 0, y: 0, w: 6, h: 6, locked: true, config: { q: 1 } }], ...over });
let seqId = 0;
const newId = () => `n${(seqId += 1)}`;

describe("고정 탭", () => {
  it("홈과 기본 탭이 고정 탭이다", () => {
    expect(isFixedTab(tab("home", "홈", 0))).toBe(true);
    expect(isFixedTab(tab("def-3", "생산 현황", 101, { defaultTab: true }))).toBe(true);
    expect(isFixedTab(tab("tab-1", "내 탭", 1))).toBe(false);
  });

  it("홈 → 기본 탭(seq 순) → 일반 탭(seq 순)으로 정렬한다 — 기본 탭 tabSeq 가 100+ 여도 일반 탭 앞이다", () => {
    const out = orderTabs([
      tab("tab-2", "B", 2),
      tab("def-9", "기본2", 102, { defaultTab: true }),
      tab("tab-1", "A", 1),
      tab("home", "홈", 0),
      tab("def-4", "기본1", 101, { defaultTab: true }),
    ]);
    expect(out.map((t) => t.tabId)).toEqual(["home", "def-4", "def-9", "tab-1", "tab-2"]);
  });

  it("앞에서부터 이어진 고정 탭 수를 센다", () => {
    expect(fixedTabCount([tab("home", "홈", 0), tab("def-1", "기본", 101, { defaultTab: true }), tab("tab-1", "A", 1)])).toBe(2);
    expect(fixedTabCount([tab("home", "홈", 0), tab("tab-1", "A", 1)])).toBe(1);
    expect(fixedTabCount([])).toBe(0);
  });
});

describe("uniqueTabName", () => {
  const tabs = [tab("home", "홈", 0), tab("tab-1", "생산", 1), tab("tab-2", "생산 2", 2)];
  it("겹치지 않으면 그대로(앞뒤 공백 제거), 겹치면 숫자 꼬리를 붙인다", () => {
    expect(uniqueTabName("  품질 ", tabs)).toBe("품질");
    expect(uniqueTabName("생산", tabs)).toBe("생산 3");
  });
  it("20자로 자르고, 꼬리를 붙여도 20자를 넘지 않는다", () => {
    const long = "가".repeat(25);
    expect(uniqueTabName(long, [])).toBe("가".repeat(20));
    const named = uniqueTabName(long, [tab("tab-1", "가".repeat(20), 1)]);
    expect(named).toBe(`${"가".repeat(18)} 2`);
    expect(named.length).toBeLessThanOrEqual(20);
  });
  it("비면 기본 이름을 쓴다", () => {
    expect(uniqueTabName("   ", [])).toBe("가져온 탭");
  });
});

describe("buildTabExport", () => {
  it("version·kind·name 과 instId 없는 항목(좌표·잠금·설정)을 싣는다", () => {
    const t = tab("tab-1", "내 생산", 1, { items: [{ ...item("a", 6, 2), locked: true, config: { sql: "x" } }, item("b")] });
    expect(buildTabExport(t)).toEqual({
      version: 1,
      kind: "dmes-widget-tab",
      name: "내 생산",
      items: [
        { widgetId: "t.a", x: 6, y: 2, w: 6, h: 6, locked: true, config: { sql: "x" } },
        { widgetId: "t.a", x: 0, y: 0, w: 6, h: 6, locked: false, config: null },
      ],
    });
  });

  it("내보낸 파일을 다시 가져오면 같은 배치가 된다", () => {
    const t = tab("tab-1", "내 생산", 1, { items: [item("a"), item("b", 6, 0)] });
    const out = parseTabImport(JSON.stringify(buildTabExport(t)), { registry: REG, tabs: [tab("home", "홈", 0)], newId });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.tab.items.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual([
      { x: 0, y: 0, w: 6, h: 6 },
      { x: 6, y: 0, w: 6, h: 6 },
    ]);
  });
});

describe("parseTabImport", () => {
  const base = [tab("home", "홈", 0), tab("tab-1", "생산", 1)];

  it("새 tab-N·새 instId·겹치지 않는 이름·잠금 없는 일반 탭을 만든다(위젯 잠금·설정은 지킨다)", () => {
    const out = parseTabImport(file(), { registry: REG, tabs: base, newId: () => "fresh" });
    expect(out).toEqual({
      ok: true,
      dropped: [],
      tab: {
        tabId: "tab-2",
        name: "생산 2",
        seq: 2,
        locked: false,
        items: [{ instId: "fresh", widgetId: "t.a", x: 0, y: 0, w: 6, h: 6, locked: true, config: { q: 1 } }],
      },
    });
  });

  it("JSON 이 아니면 거절한다", () => {
    expect(parseTabImport("{oops", { registry: REG, tabs: base })).toEqual({ ok: false, error: "JSON 파일이 아닙니다." });
  });

  it("version 이 1 이 아니면 거절한다", () => {
    const out = parseTabImport(file({ version: 2 }), { registry: REG, tabs: base });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("version 2");
  });

  it.each([
    ["kind 다름", file({ kind: "other" })],
    ["name 없음", file({ name: undefined })],
    ["items 가 배열 아님", file({ items: {} })],
    ["최상위가 배열", "[]"],
  ])("모양이 틀리면 거절한다 — %s", (_label, text) => {
    expect(parseTabImport(text, { registry: REG, tabs: base })).toEqual({ ok: false, error: "위젯 탭 파일 모양이 아닙니다." });
  });

  it("위젯 줄 모양이 틀리면(좌표가 숫자 아님) 몇 번째인지 알린다", () => {
    const out = parseTabImport(file({ items: [{ widgetId: "t.a", x: 0, y: 0, w: 6, h: 6 }, { widgetId: "t.a", x: "1", y: 0, w: 6, h: 6 }] }), { registry: REG, tabs: base });
    expect(out).toEqual({ ok: false, error: "2번째 위젯의 모양이 틀립니다." });
  });

  it("위젯이 30개를 넘으면 거절한다", () => {
    const items = Array.from({ length: 31 }, () => ({ widgetId: "t.a", x: 0, y: 0, w: 6, h: 6 }));
    const out = parseTabImport(file({ items }), { registry: REG, tabs: base });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("31개");
  });

  it("30개는 받아들인다", () => {
    const items = Array.from({ length: 30 }, () => ({ widgetId: "t.a", x: 0, y: 0, w: 6, h: 6 }));
    const out = parseTabImport(file({ items }), { registry: REG, tabs: base, newId });
    expect(out.ok && out.tab.items.length).toBe(30);
  });

  it("없는·사용 중지 위젯과 한 번만 놓는 위젯의 중복은 빼고 알린다", () => {
    const items = [
      { widgetId: "t.a", x: 0, y: 0, w: 6, h: 6 },
      { widgetId: "t.gone", x: 6, y: 0, w: 6, h: 6 },
      { widgetId: "t.off", x: 12, y: 0, w: 6, h: 6 },
      { widgetId: "t.one", x: 0, y: 6, w: 24, h: 6 },
      { widgetId: "t.one", x: 0, y: 12, w: 24, h: 6 },
    ];
    const out = parseTabImport(file({ items }), { registry: REG, tabs: base, newId });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.tab.items.map((i) => i.widgetId)).toEqual(["t.a", "t.one"]);
    expect(out.dropped).toEqual([
      { widgetId: "t.gone", reason: "missing" },
      { widgetId: "t.off", reason: "disabled" },
      { widgetId: "t.one", reason: "duplicate" },
    ]);
    expect(tabImportMessage(out.tab.name, out.dropped)).toBe(
      "「생산 2」 탭을 가져왔습니다. 없는 위젯(t.gone), 사용 중지 위젯(t.off), 한 번만 놓는 위젯의 중복(t.one)은(는) 빼고 가져왔습니다."
    );
  });

  it("탭 한도에 닿았으면 파일을 보기 전에 거절한다", () => {
    const full = Array.from({ length: 10 }, (_, i) => tab(i === 0 ? "home" : `tab-${i}`, `t${i}`, i));
    const out = parseTabImport(file(), { registry: REG, tabs: full });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("최대 10개");
    expect(parseTabImport(file(), { registry: REG, tabs: base, maxTabs: 2 }).ok).toBe(false);
  });

  it("위젯 크기는 등록부 범위로 정리한다(sanitizeLayout)", () => {
    const out = parseTabImport(file({ items: [{ widgetId: "t.a", x: 30, y: -3, w: 1, h: 2 }] }), { registry: REG, tabs: base, newId });
    expect(out.ok && out.tab.items[0]).toMatchObject({ x: 20, y: 0, w: 4, h: 6 });
  });
});

describe("tabImportMessage", () => {
  it("뺀 위젯이 없으면 한 문장이다", () => {
    expect(tabImportMessage("생산", [])).toBe("「생산」 탭을 가져왔습니다.");
  });
});

describe("shareResultMessage", () => {
  it("모두 성공이면 success 와 만든 탭 이름", () => {
    expect(
      shareResultMessage([
        { userId: "u1", ok: true, tabNm: "(공유) 생산", message: "" },
        { userId: "u2", ok: true, tabNm: "(공유) 생산", message: "" },
      ])
    ).toEqual({ kind: "success", text: "2명에게 「(공유) 생산」 탭으로 보냈습니다." });
  });

  it("실패가 있으면 error 와 사람별 사유(이름이 있으면 이름)", () => {
    expect(
      shareResultMessage(
        [
          { userId: "u1", ok: true, tabNm: "(공유) 생산", message: "" },
          { userId: "u2", ok: false, tabNm: "", message: "탭 수 한도를 넘습니다." },
        ],
        { u2: "김철수" }
      )
    ).toEqual({ kind: "error", text: "1명에게 보냈고 1명은 보내지 못했습니다. 김철수: 탭 수 한도를 넘습니다." });
    expect(shareResultMessage([{ userId: "u3", ok: false, tabNm: "", message: "" }]).text).toBe("보내지 못했습니다. u3: 보내지 못했습니다");
  });
});
