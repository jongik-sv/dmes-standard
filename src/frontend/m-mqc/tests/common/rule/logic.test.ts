// 룰 키트 순수 로직 — 조건 글, 라벨 대체(catalog 없음), 목록 펴기·열·거르기, 버전 차이, 판정 입력·근거, 가려짐 분석.
import { describe, expect, it } from "vitest";

import { unreachableRowIds } from "@/common/rule/api";
import { diffSummary, diffVersions } from "@/common/rule/diff";
import {
  buildJudgeInput,
  checkJudgeInput,
  failedRows,
  hitRows,
  judgeFields,
  resultEntries,
} from "@/common/rule/judge";
import {
  columnSpecs,
  filterRows,
  flattenRules,
  groupCounts,
} from "@/common/rule/list";
import {
  groupsForRules,
  orderedVarNames,
  ruleOptions,
  screenGroups,
  varLabel,
  type Catalog,
} from "@/common/rule/meta";
import {
  cellText,
  conditionSentence,
  rowConditionText,
  rowResultText,
} from "@/common/rule/text";
import type { JudgeResult, RuleVersion } from "@/common/rule/types";
import { errorMessage } from "@/common/oasis";

import { CATALOG, CGL, EMPTY_RULE, HISTORY, PLTCM } from "./fixtures";

const EMPTY: Catalog = {
  RULES: {},
  CODES: {},
  SCREEN_RULES: {},
  SCREEN_CODES: {},
};

describe("조건 글", () => {
  it("그리드 칸은 NA 를 —, 범위의 변수를 x, 비교 기호를 ≤ ≥ ≠ 로 쓴다", () => {
    expect(cellText("-")).toBe("—");
    expect(cellText(null)).toBe("—");
    expect(cellText("0.22 <= 변수 <= 0.249")).toBe("0.22 ≤ x ≤ 0.249");
    expect(cellText("IN (H32, M32)")).toBe("IN (H32, M32)");
    expect(cellText("<> A")).toBe("≠ A");
  });

  it("문장은 라벨을 넣는다 — 범위는 자리에, 비교·목록은 앞에, 값만 있는 칸은 「= 값」", () => {
    expect(conditionSentence("0.22 <= 변수 < 0.3", "두께")).toBe(
      "0.22 ≤ 두께 < 0.3",
    );
    expect(conditionSentence("IN (A, B)", "원자재코드")).toBe(
      "원자재코드 IN (A, B)",
    );
    expect(conditionSentence("NOT IN (A)", "원자재코드")).toBe(
      "원자재코드 NOT IN (A)",
    );
    expect(conditionSentence(">= 5", "폭")).toBe("폭 ≥ 5");
    expect(conditionSentence("84", "공정코드")).toBe("공정코드 = 84");
    expect(conditionSentence("-", "폭")).toBeNull();
  });

  it("행 조건·결과 문장 — catalog 라벨·단위, 보지 않는 조건은 뺀다", () => {
    expect(rowConditionText(PLTCM, PLTCM.rows[0], CATALOG)).toBe(
      "원자재코드 IN (H32, M32) · 0.22 ≤ PLTCM 출측두께 ≤ 0.249",
    );
    expect(rowResultText(PLTCM, PLTCM.rows[0], CATALOG)).toBe("폭 수축량 2 mm");
  });

  it("catalog 가 비면 Maru 변수명으로 대신한다", () => {
    expect(varLabel("C10B1074", "THK", EMPTY)).toBe("THK");
    expect(rowConditionText(PLTCM, PLTCM.rows[0], EMPTY)).toBe(
      "RAW_MATL_CD IN (H32, M32) · 0.22 ≤ THK ≤ 0.249",
    );
    expect(rowResultText(PLTCM, PLTCM.rows[0], EMPTY)).toBe("WID_SHRINK_QTY 2");
  });
});

describe("메타·묶음", () => {
  it("변수 순서는 catalog 순서를 따르고, catalog 에 없는 변수는 뒤에 seq 순", () => {
    // CGL catalog 에는 THK 만 있다 → THK 먼저, 그 뒤 PROC_CD·WID(seq 순).
    expect(orderedVarNames(CGL, "C10B1075", "COND", CATALOG)).toEqual([
      "THK",
      "PROC_CD",
      "WID",
    ]);
    expect(orderedVarNames(CGL, "C10B1075", "COND", EMPTY)).toEqual([
      "PROC_CD",
      "THK",
      "WID",
    ]);
    // 서버 정의가 없으면 catalog 목록.
    expect(orderedVarNames(undefined, "C10B1074", "COND", CATALOG)).toEqual([
      "RAW_MATL_CD",
      "THK",
      "WID",
    ]);
  });

  it("묶음은 catalog group 으로, 없으면 룰 하나가 묶음 하나(라벨 = 룰 ID)", () => {
    expect(screenGroups("testScreen", CATALOG)).toEqual([
      { key: "PLTCM", label: "PLTCM", ruleIds: ["C10B1074"] },
      { key: "CGL", label: "CGL", ruleIds: ["C10B1075"] },
    ]);
    expect(groupsForRules(["QD_X"], EMPTY)).toEqual([
      { key: "QD_X", label: "QD_X", ruleIds: ["QD_X"] },
    ]);
    expect(
      ruleOptions(
        [{ key: "G", label: "묶음", ruleIds: ["C10B1074", "C10B1075"] }],
        CATALOG,
      ),
    ).toEqual([
      { value: "C10B1074", label: "묶음 · PLTCM폭수축량" },
      { value: "C10B1075", label: "묶음 · CGL폭감소량" },
    ]);
  });
});

describe("룰 목록", () => {
  const groups = screenGroups("testScreen", CATALOG);
  const unreachable = new Map([[PLTCM.ruleId, unreachableRowIds(PLTCM)]]);

  it("가려짐 분석 — 행 11 은 행 10 에 모두 덮인다", () => {
    expect([...unreachableRowIds(PLTCM)]).toEqual([11]);
    expect(unreachableRowIds(CGL).size).toBe(0);
    expect(unreachableRowIds(EMPTY_RULE("X")).size).toBe(0);
  });

  it("여러 룰의 행을 묶음 순서로 펴고, 조건 셀을 변수명으로 싣는다", () => {
    const rows = flattenRules(
      [CGL, PLTCM, EMPTY_RULE("C10B1076")],
      groups,
      unreachable,
      CATALOG,
    );
    expect(rows.map((r) => r.key)).toEqual([
      "C10B1074-10",
      "C10B1074-11",
      "C10B1075-20",
    ]);
    expect(rows[0]).toMatchObject({
      groupKey: "PLTCM",
      groupLabel: "PLTCM",
      ver: "1",
      unreachable: false,
      results: { WID_SHRINK_QTY: "2" },
    });
    expect(rows[1].unreachable).toBe(true);
    expect(Object.keys(rows[2].cells)).toEqual(["THK", "PROC_CD", "WID"]);
    expect(groupCounts(rows)).toEqual({ "": 3, PLTCM: 2, CGL: 1 });
  });

  it("열은 보이는 룰의 변수 합집합 — 라벨이 다르면 첫 라벨, 모두 tooltip 에", () => {
    const { conds, results } = columnSpecs(
      [PLTCM, CGL],
      ["C10B1074", "C10B1075"],
      CATALOG,
    );
    expect(conds.map((c) => [c.name, c.label])).toEqual([
      ["RAW_MATL_CD", "원자재코드"],
      ["THK", "PLTCM 출측두께"],
      ["WID", "PLTCM 폭"],
      ["PROC_CD", "PROC_CD"],
    ]);
    expect(conds[1].tooltip).toBe(
      "PLTCM 출측두께 / 압연SET 두께 — Maru 변수 THK",
    );
    expect(results).toEqual([
      {
        name: "WID_SHRINK_QTY",
        kind: "RESULT",
        label: "폭 수축량",
        unit: "mm",
        tooltip: "Maru 변수 WID_SHRINK_QTY",
      },
    ]);
    // CGL 만 보이면 CGL 라벨.
    expect(
      columnSpecs([PLTCM, CGL], ["C10B1075"], CATALOG).conds.map(
        (c) => c.label,
      ),
    ).toEqual(["압연SET 두께", "PROC_CD", "WID"]);
  });

  it("묶음·검색어로 거른다(행 ID·순번·조건 문장)", () => {
    const rows = flattenRules([PLTCM, CGL], groups, unreachable, CATALOG);
    expect(filterRows(rows, { group: "CGL" }).map((r) => r.rowId)).toEqual([
      20,
    ]);
    expect(
      filterRows(rows, { group: "", keyword: "m32" }).map((r) => r.rowId),
    ).toEqual([10]);
    expect(
      filterRows(rows, { group: "", keyword: " 84 " }).map((r) => r.rowId),
    ).toEqual([20]);
    expect(filterRows(rows, { group: "PLTCM", keyword: "84" })).toEqual([]);
  });
});

describe("버전 차이", () => {
  it("rowId 로 맞춰 변경·추가·삭제를 낸다(순번 → 행 ID 순)", () => {
    const diffs = diffVersions("C10B1074", HISTORY[0], HISTORY[1], CATALOG);
    expect(diffs.map((d) => [d.rowId, d.kind])).toEqual([
      [10, "changed"],
      [12, "removed"],
      [11, "added"],
    ]);
    expect(diffs[0].before).toContain("폭 수축량 3 mm");
    expect(diffs[0].after).toContain("폭 수축량 2 mm");
    expect(diffSummary(diffs)).toBe("추가 1 · 삭제 1 · 변경 1");
  });

  it("글이 같고 순번만 바뀌면 이동, 첫 버전은 모두 추가", () => {
    const v1: RuleVersion = { ...HISTORY[1], ver: "1" };
    const v2: RuleVersion = {
      ...HISTORY[1],
      ver: "2",
      rows: [{ ...HISTORY[1].rows[0], seq: 5 }, HISTORY[1].rows[1]],
    };
    expect(
      diffVersions("C10B1074", v1, v2, CATALOG).map((d) => [
        d.rowId,
        d.kind,
        d.before,
        d.after,
      ]),
    ).toEqual([
      [11, "same", expect.any(String), expect.any(String)],
      [10, "moved", "순번 1", "순번 5"],
    ]);
    expect(
      diffVersions("C10B1074", undefined, v1, CATALOG).every(
        (d) => d.kind === "added",
      ),
    ).toBe(true);
    expect(diffSummary(diffVersions("C10B1074", v1, v1, CATALOG))).toBe(
      "바뀐 행 없음",
    );
  });
});

describe("간편판정", () => {
  it("입력 칸은 조건 변수 — 라벨·단위·숫자 여부, catalog 가 없으면 변수명", () => {
    expect(judgeFields(PLTCM, "C10B1074", CATALOG)).toEqual([
      {
        name: "RAW_MATL_CD",
        label: "원자재코드",
        unit: undefined,
        numeric: false,
      },
      { name: "THK", label: "PLTCM 출측두께", unit: "mm", numeric: true },
      { name: "WID", label: "PLTCM 폭", unit: "mm", numeric: true },
    ]);
    expect(judgeFields(CGL, "C10B1075", EMPTY).map((f) => f.label)).toEqual([
      "PROC_CD",
      "THK",
      "WID",
    ]);
    // 서버 정의 없이 catalog 만 있으면 글 칸으로.
    expect(
      judgeFields(undefined, "C10B1074", CATALOG).every((f) => !f.numeric),
    ).toBe(true);
  });

  it("숫자 칸은 값이 있을 때만 숫자인지 보고, 입력은 그 룰 칸만 싣는다(숫자 빈 칸 뺌, 글은 그대로)", () => {
    const fields = judgeFields(PLTCM, "C10B1074", CATALOG);
    expect(checkJudgeInput(fields, { THK: "abc", WID: "" })).toEqual({
      THK: "PLTCM 출측두께 값이 숫자가 아닙니다: abc",
    });
    expect(checkJudgeInput(fields, { THK: " 0.23 ", WID: "1e3" })).toEqual({});
    expect(
      buildJudgeInput(fields, {
        RAW_MATL_CD: " h32",
        THK: " 0.23 ",
        WID: "",
        PROC_CD: "84",
      }),
    ).toEqual({ RAW_MATL_CD: " h32", THK: "0.23" });
    expect(buildJudgeInput(fields, {})).toEqual({ RAW_MATL_CD: "" });
  });

  const noMatch: JudgeResult = {
    ruleId: "C10B1074",
    ver: "1",
    evalTs: "2026-11-25 10:00:00",
    status: "NO_MATCH",
    hits: [],
    results: {},
    defaultApplied: false,
    trace: [
      { rowId: 10, seq: 1, evaluated: true, hit: false, firstFalseVar: "THK" },
      {
        rowId: 11,
        seq: 2,
        evaluated: true,
        hit: false,
        firstFalseVar: "RAW_MATL_CD",
      },
    ],
    message: "조건에 맞는 행이 없습니다",
  };

  it("탈락 근거 — 처음 거짓인 조건의 라벨, 그 행의 조건 문장, 넣은 값", () => {
    expect(
      failedRows(noMatch, PLTCM, { THK: "0.5", RAW_MATL_CD: "" }, CATALOG),
    ).toEqual([
      {
        rowId: 10,
        seq: 1,
        varLabel: "PLTCM 출측두께",
        condition: "0.22 ≤ PLTCM 출측두께 ≤ 0.249",
        input: "0.5",
      },
      {
        rowId: 11,
        seq: 2,
        varLabel: "원자재코드",
        condition: "원자재코드 IN (H32)",
        input: "(빈 값)",
      },
    ]);
  });

  it("COLLECT 적중은 모두 보이고, 결과 값은 결과 변수 순서로", () => {
    const collect: JudgeResult = {
      ...noMatch,
      status: "MATCHED",
      hits: [
        { rowId: 10, seq: 1 },
        { rowId: 11, seq: 2 },
      ],
      results: { WID_SHRINK_QTY: "2", EXTRA: 7 },
      trace: [],
      message: null,
    };
    expect(
      hitRows(collect, PLTCM, CATALOG).map((h) => [h.rowId, h.result]),
    ).toEqual([
      [10, "폭 수축량 2 mm"],
      [11, "폭 수축량 9 mm"],
    ]);
    expect(resultEntries(collect, PLTCM, CATALOG)).toEqual([
      { name: "WID_SHRINK_QTY", label: "폭 수축량", unit: "mm", value: "2" },
      { name: "EXTRA", label: "EXTRA", unit: undefined, value: "7" },
    ]);
  });
});

describe("오류 문장", () => {
  it("업무 문장은 그대로, 예외 원문은 기본 문장으로", () => {
    expect(errorMessage(new Error("ruleIds 값이 없습니다"))).toBe(
      "ruleIds 값이 없습니다",
    );
    expect(errorMessage(new Error("java.lang.NullPointerException: x"))).toBe(
      "요청을 처리하지 못했습니다. 잠시 뒤 다시 시도하세요.",
    );
    expect(errorMessage(new Error("RAW_MATL_CD 값이 숫자가 아닙니다: a"))).toBe(
      "RAW_MATL_CD 값이 숫자가 아닙니다: a",
    );
    expect(errorMessage(undefined, "실패")).toBe("실패");
  });
});
