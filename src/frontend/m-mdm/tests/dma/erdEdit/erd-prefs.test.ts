import { describe, expect, it } from "vitest";

import { DEFAULT_PREFS, PREFS_MAX_VIEWPORTS, loadPrefs, prefsKey, savePrefs, withSeen, withViewport } from "../../../pages/dma/erdEdit/state/prefs";
import { isCountedViolation, modelSummary, summaryText } from "../../../pages/dma/erdEdit/state/violations";
import { menuModel } from "./erd-fixtures";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };

describe("작업 상태 저장(U21)", () => {
  it("사용자별 키에 저장하고 다시 읽는다", () => {
    const s = mem();
    savePrefs("u1", { ...DEFAULT_PREFS, lastModelId: "mcm", reviewOpen: true }, s);
    expect(s.m.has(prefsKey("u1"))).toBe(true);
    expect(loadPrefs("u1", s)).toMatchObject({ lastModelId: "mcm", reviewOpen: true });
    expect(loadPrefs("u2", s)).toEqual(DEFAULT_PREFS);
  });
  it("깨진 JSON·모르는 값·막힌 저장소는 기본값", () => {
    const s = mem();
    s.setItem(prefsKey("u1"), "{not json");
    expect(loadPrefs("u1", s)).toEqual(DEFAULT_PREFS);
    s.setItem(prefsKey("u1"), JSON.stringify({ mode: "weird", preset: "both", sideOpen: "yes" }));
    expect(loadPrefs("u1", s)).toMatchObject({ mode: "logical", preset: "both", sideOpen: true });
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadPrefs("u1", throwing)).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs("u1", DEFAULT_PREFS, throwing)).not.toThrow();
    expect(loadPrefs(null, s)).toEqual(DEFAULT_PREFS);
  });
  it("viewport 는 최대 30개, 오래된 것부터 뺀다. 같은 키는 맨 뒤로", () => {
    let p = DEFAULT_PREFS;
    for (let i = 0; i < PREFS_MAX_VIEWPORTS + 2; i++) p = withViewport(p, "m", `d${i}`, { x: i, y: 0, zoom: 1 });
    expect(Object.keys(p.viewports)).toHaveLength(PREFS_MAX_VIEWPORTS);
    expect(p.viewports["m/d0"]).toBeUndefined();
    p = withViewport(p, "m", "d2", { x: 9, y: 9, zoom: 0.5 });
    expect(Object.keys(p.viewports).at(-1)).toBe("m/d2");
  });
  it("seenReadOnly 는 같은 키를 두 번 넣지 않고 20개까지", () => {
    let p = withSeen(withSeen(DEFAULT_PREFS, "mcm:released"), "mcm:released");
    expect(p.seenReadOnly).toEqual(["mcm:released"]);
    for (let i = 0; i < 25; i++) p = withSeen(p, `m${i}:notEditor`);
    expect(p.seenReadOnly).toHaveLength(20);
  });
});

describe("위반 정의 하나(U25)", () => {
  it("TYPE·DOMAIN·MISS 만, 감사 컬럼은 보기를 켰을 때만 센다", () => {
    const m = menuModel();
    // menuModel 의 컬럼 하나를 감사 컬럼(C_AT)으로 바꿔 시험한다.
    const auditId = Object.keys(m.columns)[0];
    m.columns[auditId] = { ...m.columns[auditId], phys: "C_AT" };
    const st = { [auditId]: "DOMAIN" } as const;
    expect(isCountedViolation(m, auditId, st, false)).toBe(false);
    expect(isCountedViolation(m, auditId, st, true)).toBe(true);
  });
  it("요약 줄 — 관계는 REJECTED 를 빼고, 상태가 없으면 위반은 …", () => {
    const s = modelSummary(menuModel(), null, false);
    expect(s.violations).toBeNull();
    expect(summaryText(s)).toMatch(/^표 \d+ · 관계 \d+\(추정 \d+\) · 고칠 위반 …$/);
  });
});
