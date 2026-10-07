/**
 * 조회 기본값 설정 창 모델(설계 2026-10-07-search-defaults §8.3·§4) — 줄 만들기·규칙 되돌리기·미리보기 검사·영역 합치기.
 */
import { describe, expect, it } from "vitest";

import type { SearchDefaultRule } from "../../src/layout/search-defaults/rule";
import {
  buildSettingsRows,
  checkRow,
  currentValueRules,
  matchRangePreset,
  mergeAreaRules,
  pickToRelative,
  relativeToPick,
  rowRules,
  type PairRow,
  type SettingsField,
  type SingleRow,
} from "../../src/layout/search-defaults/settings-model";

const NOW = new Date(2026, 9, 7, 10, 0, 0); // 2026-10-07

const text = (key: string, label = key): SettingsField => ({ fieldKey: key, storageKey: key, valueType: "text", label });
const select = (key: string): SettingsField => ({
  fieldKey: key,
  storageKey: key,
  valueType: "select",
  label: key,
  options: [
    { value: "", label: "전체" },
    { value: "Y", label: "사용" },
  ],
});
const date = (key: string, pair?: SettingsField["pair"], scope = ""): SettingsField => ({
  fieldKey: key,
  storageKey: scope ? `${scope}.${key}` : key,
  valueType: "date",
  label: key,
  pair,
});
const periodFields = (scope = "") => [
  date("fromDt", { role: "from", partnerKey: "fromDt~to" }, scope),
  date("fromDt~to", { role: "to", partnerKey: "fromDt" }, scope),
];

describe("상대 날짜 이름표", () => {
  it("규칙 ↔ 이름표가 서로 되돌아간다(0 과 undefined 는 같다)", () => {
    const cases: Array<[SearchDefaultRule & { kind: "relative" }, string, number]> = [
      [{ kind: "relative", base: "today" }, "today", 0],
      [{ kind: "relative", base: "today", days: -1 }, "yesterday", 0],
      [{ kind: "relative", base: "today", days: -5 }, "daysAgo", 5],
      [{ kind: "relative", base: "today", days: 3, months: 0 }, "daysAfter", 3],
      [{ kind: "relative", base: "monthStart", months: -1 }, "prevMonthStart", 0],
      [{ kind: "relative", base: "monthEnd" }, "monthEnd", 0],
      [{ kind: "relative", base: "today", months: -3 }, "monthsAgo", 3],
    ];
    for (const [rule, id, n] of cases) {
      const pick = relativeToPick(rule);
      expect(pick).toEqual({ presetId: id, n });
      const back = pickToRelative(pick!);
      expect(relativeToPick(back)).toEqual(pick);
    }
  });

  it("이름표로 나타낼 수 없는 규칙은 null", () => {
    expect(relativeToPick({ kind: "relative", base: "monthStart", days: 3 })).toBeNull();
    expect(relativeToPick({ kind: "relative", base: "today", months: -1, days: -1 })).toBeNull();
    expect(relativeToPick({ kind: "relative", base: "monthEnd", months: -2 })).toBeNull();
  });

  it("묶음 판정은 months·days 의 0 과 undefined 를 같게 본다", () => {
    expect(matchRangePreset({ kind: "relative", base: "today", days: -6, months: 0 }, { kind: "relative", base: "today", days: 0 })).toBe("last7");
    expect(matchRangePreset({ kind: "relative", base: "monthStart", months: -1 }, { kind: "relative", base: "monthEnd", months: -1 })).toBe("prevMonth");
    expect(matchRangePreset({ kind: "relative", base: "today", days: -5 }, { kind: "relative", base: "today" })).toBeNull();
  });
});

describe("줄 만들기", () => {
  it("기간 짝은 한 줄(묶음 판정), 나머지는 칸마다 한 줄", () => {
    const fields = [text("item"), ...periodFields(), select("useTp")];
    const rows = buildSettingsRows(
      fields,
      {
        item: { kind: "fixed", value: "P1" },
        fromDt: { kind: "relative", base: "today", days: -29 },
        "fromDt~to": { kind: "relative", base: "today" },
      },
      "",
    );
    expect(rows.map((r) => r.kind)).toEqual(["single", "pair", "single"]);
    expect((rows[0] as SingleRow).mode).toBe("fixed");
    expect((rows[1] as PairRow).mode).toBe("range");
    expect((rows[1] as PairRow).rangeId).toBe("last30");
    expect((rows[2] as SingleRow).mode).toBe("none");
  });

  it("scope 가 있으면 짝의 상대 칸을 scope 붙은 키로 찾는다", () => {
    const rows = buildSettingsRows(periodFields("tab2"), {}, "tab2");
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("pair");
  });

  it("이름표로 못 나타내는 규칙은 사용자 지정으로 두고, 고치지 않으면 그대로 저장한다", () => {
    const odd: SearchDefaultRule = { kind: "relative", base: "monthStart", days: 3 };
    const [single] = buildSettingsRows([date("baseDt")], { baseDt: odd }, "");
    expect((single as SingleRow).mode).toBe("custom");
    expect(rowRules(single)).toEqual([["baseDt", odd]]);
    const [pair] = buildSettingsRows(periodFields(), { fromDt: odd }, "");
    expect((pair as PairRow).mode).toBe("custom");
    expect(rowRules(pair)).toEqual([
      ["fromDt", odd],
      ["fromDt~to", null],
    ]);
  });

  it("묶음·상대 날짜·고정 줄을 규칙으로 되돌린다", () => {
    const [pair] = buildSettingsRows(periodFields(), {}, "");
    const range: PairRow = { ...(pair as PairRow), mode: "range", rangeId: "thisMonth" };
    expect(rowRules(range)).toEqual([
      ["fromDt", { kind: "relative", base: "monthStart" }],
      ["fromDt~to", { kind: "relative", base: "monthEnd" }],
    ]);
    const rel: PairRow = { ...range, mode: "relative", fromSide: { fixed: "", rel: { presetId: "daysAgo", n: 7 } }, toSide: { fixed: "", rel: { presetId: "today", n: 0 } } };
    expect(rowRules(rel)).toEqual([
      ["fromDt", { kind: "relative", base: "today", days: -7 }],
      ["fromDt~to", { kind: "relative", base: "today" }],
    ]);
    // 빈 고정 날짜는 규칙을 두지 않는다.
    const fixed: PairRow = { ...range, mode: "fixed", fromSide: { fixed: "2026-10-01", rel: { presetId: "today", n: 0 } }, toSide: { fixed: "", rel: { presetId: "today", n: 0 } } };
    expect(rowRules(fixed)).toEqual([
      ["fromDt", { kind: "fixed", value: "2026-10-01" }],
      ["fromDt~to", null],
    ]);
  });
});

describe("미리보기·검사", () => {
  it("기간 미리보기와 시작>끝 오류", () => {
    const [pair] = buildSettingsRows(periodFields(), {}, "");
    const ok: PairRow = { ...(pair as PairRow), mode: "range", rangeId: "prevMonth" };
    expect(checkRow(ok, {}, NOW)).toEqual({ preview: "2026-09-01 ~ 2026-09-30" });
    const bad: PairRow = { ...ok, mode: "fixed", fromSide: { fixed: "2026-10-09", rel: { presetId: "today", n: 0 } }, toSide: { fixed: "2026-10-01", rel: { presetId: "today", n: 0 } } };
    expect(checkRow(bad, {}, NOW).error).toBe("시작이 끝보다 늦습니다");
  });

  it("선택지에 없는 고정 값은 경고, 마지막 조회값은 저장된 값이나 「없음」", () => {
    const [row] = buildSettingsRows([select("useTp")], { useTp: { kind: "fixed", value: "Z" } }, "");
    expect(checkRow(row, {}, NOW).warning).toContain("선택지에 없는 값");
    const last: SingleRow = { ...(row as SingleRow), mode: "last" };
    expect(checkRow(last, {}, NOW).preview).toBe("없음");
    expect(checkRow(last, { useTp: "Y" }, NOW).preview).toBe("사용");
  });
});

describe("영역 합치기·지금 조건", () => {
  it("이 영역 칸 키만 바꾸거나 빼고, 다른 영역·지금 없는 칸 규칙은 남긴다", () => {
    const fields = [text("item", "품번"), select("useTp")];
    const rows = mergeAreaRules(
      {
        item: { kind: "fixed", value: "OLD" },
        useTp: { kind: "fixed", value: "Y" },
        "tab2.item": { kind: "fixed", value: "T2" },
        hiddenField: { kind: "last" },
      },
      new Set(fields.map((f) => f.storageKey)),
      [
        ["item", { kind: "fixed", value: "NEW" }],
        ["useTp", null],
      ],
      new Map(fields.map((f) => [f.storageKey, f])),
    );
    expect(rows).toEqual([
      { fieldKey: "tab2.item", rule: { kind: "fixed", value: "T2" } },
      { fieldKey: "hiddenField", rule: { kind: "last" } },
      { fieldKey: "item", rule: { kind: "fixed", value: "NEW" }, fieldLabel: "품번", fieldMeta: null },
    ]);
  });

  it("지금 조건 — 빈 텍스트·날짜는 규칙 없음, select 의 빈 값(전체)은 남긴다", () => {
    expect(
      currentValueRules([
        { ...text("item"), value: "" },
        { ...date("baseDt"), value: "" },
        { ...select("useTp"), value: "" },
        { ...text("memo"), value: "A" },
      ]),
    ).toEqual([
      ["item", null],
      ["baseDt", null],
      ["useTp", { kind: "fixed", value: "" }],
      ["memo", { kind: "fixed", value: "A" }],
    ]);
  });
});
