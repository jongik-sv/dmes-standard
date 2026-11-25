import { describe, expect, it } from "vitest";

import {
  displayValue,
  guidedToLine,
  inboundPayload,
  lineMapped,
  lineToGuided,
  nextSpecNo,
  parseLine,
  parseText,
  previewSpecNos,
  splitTokens,
  summarizeLine,
  termText,
  type DictItem,
} from "../../../src/qdm/qualitySpec/dsl";

const DICT: DictItem[] = [
  { attrCd: "CUS_CD", attrNm: "고객사", kind: "COND", unit: null, useYn: "Y" },
  { attrCd: "PRD_NM_CD", attrNm: "품명", kind: "COND", unit: null, useYn: "Y" },
  {
    attrCd: "RAW_THK",
    attrNm: "원재료 두께",
    kind: "COND",
    unit: "mm",
    useYn: "Y",
  },
  {
    attrCd: "RAW_WID",
    attrNm: "원재료 폭",
    kind: "COND",
    unit: "mm",
    useYn: "Y",
  },
  {
    attrCd: "COLOR_CD",
    attrNm: "색상코드",
    kind: "COND",
    unit: null,
    useYn: "Y",
  },
  { attrCd: "CCL_BOM", attrNm: "BOM", kind: "BOTH", unit: null, useYn: "Y" },
  {
    attrCd: "RAW_MTRL",
    attrNm: "원재료 재질",
    kind: "BOTH",
    unit: null,
    useYn: "Y",
  },
  {
    attrCd: "PROC_CD",
    attrNm: "통과공정",
    kind: "RESULT",
    unit: null,
    useYn: "Y",
  },
  {
    attrCd: "TOP_THK",
    attrNm: "상도 도막두께",
    kind: "RESULT",
    unit: "㎛",
    useYn: "Y",
  },
  { attrCd: "GLOSS", attrNm: "광택", kind: "RESULT", unit: "GU", useYn: "Y" },
  {
    attrCd: "POST_TRT",
    attrNm: "후처리",
    kind: "RESULT",
    unit: null,
    useYn: "N",
  },
];

describe("splitTokens", () => {
  it("따옴표 안의 쉼표는 나누지 않는다", () => {
    expect(splitTokens("고객사 = 1, BOM = 'A,B', 광택 = 3")).toEqual([
      "고객사 = 1",
      "BOM = 'A,B'",
      "광택 = 3",
    ]);
  });
});

describe("parseLine", () => {
  it("연산자 없는 표기는 가장 긴 사전 항목명을 앞부분으로 읽는다(원재료 두께 1.2)", () => {
    const p = parseLine(
      "고객사 = 320104, 품명 = L, 원재료 두께 1.2 | 원재료 재질 = H36",
      DICT,
    );
    expect(p.ok).toBe(true);
    expect(p.cus).toBe("320104");
    expect(p.prd).toBe("L");
    expect(p.conds[2]).toMatchObject({
      attrNm: "원재료 두께",
      op: "=",
      val: "1.2",
    });
    expect(p.conds[2].attr?.attrCd).toBe("RAW_THK");
    expect(p.results[0]).toMatchObject({ attrNm: "원재료 재질", val: "H36" });
    expect(p.issues).toEqual([]);
  });

  it(">= 는 ≥ 로, 범위 값은 ~ 로 바꾼다", () => {
    const p = parseLine(
      "고객사 = 1, 품명 = L, 원재료 폭 >= 1100, 원재료 두께 = 0.5~0.8 | 상도 도막두께 ≥ 20",
      DICT,
    );
    expect(p.conds[2]).toMatchObject({ op: "≥", val: "1100" });
    expect(p.conds[3]).toMatchObject({ op: "~", val: "0.5~0.8" });
    expect(p.results[0]).toMatchObject({ op: "≥", val: "20" });
  });

  it("따옴표를 벗기고 시스템 코드로도 항목을 찾는다", () => {
    const p = parseLine(
      "고객사 = 1, 품명 = L, ccl_bom = 'A60041' | 통과공정 = 1P-33-83-A3",
      DICT,
    );
    expect(p.conds[2]).toMatchObject({ attrNm: "BOM", val: "A60041" });
    expect(p.ok).toBe(true);
  });

  it("사전에 없는 항목은 경고(빠른 추가), 인식 못 한 토큰은 오류", () => {
    const p = parseLine("고객사 = 1, 품명 = L, 경도 = 3 | 광택 = 30", DICT);
    const warn = p.issues.find((i) => i.quickAdd);
    expect(warn).toMatchObject({
      level: "warn",
      name: "경도",
      kindGuess: "COND",
    });
    expect(p.ok).toBe(true);
    expect(lineMapped(p)).toBe(false);

    const bad = parseLine("고객사 = 1, 품명 = L, 아무말 | 광택 = 30", DICT);
    expect(bad.ok).toBe(false);
    expect(
      bad.issues.some(
        (i) => i.level === "err" && i.msg.includes("인식할 수 없습니다"),
      ),
    ).toBe(true);
  });

  it("고객사·품명이 없으면 오류(채번 기준)", () => {
    const p = parseLine("원재료 두께 = 1.2 | 원재료 재질 = H36", DICT);
    expect(p.ok).toBe(false);
    expect(p.issues.filter((i) => i.level === "err").map((i) => i.msg)).toEqual(
      [
        "조건에 고객사가 필요합니다 (채번 기준)",
        "조건에 품명이 필요합니다 (채번 기준)",
      ],
    );
  });

  it("| 가 없으면 경고하고 전체를 조건으로 읽는다", () => {
    const p = parseLine("고객사 = 1, 품명 = L", DICT);
    expect(p.results).toEqual([]);
    expect(p.issues[0]).toMatchObject({ level: "warn" });
    expect(p.ok).toBe(true);
    expect(summarizeLine(p).flag).toBe("warn");
  });

  it("| 뒤가 비면 오류, 값이 비면 오류", () => {
    expect(parseLine("고객사 = 1, 품명 = L |", DICT).ok).toBe(false);
    expect(
      parseLine("고객사 = 1, 품명 = L, 광택 = | 통과공정 = X", DICT).ok,
    ).toBe(false);
  });

  it("조건용 항목이 결과 쪽에 있으면 경고", () => {
    const p = parseLine("고객사 = 1, 품명 = L | 원재료 폭 = 3", DICT);
    expect(
      p.issues.some((i) => i.level === "warn" && i.msg.includes("조건용 항목")),
    ).toBe(true);
  });

  it("사용 중지 항목은 인식하지 않는다", () => {
    const p = parseLine("고객사 = 1, 품명 = L | 후처리 = 보호필름", DICT);
    expect(p.results[0].attr).toBeNull();
  });
});

describe("채번", () => {
  it("같은 고객사-품명 묶음의 최대 순번 + 1, 예약한 번호도 센다", () => {
    expect(
      nextSpecNo("320104", "L", ["320104-L01", "320104-L03", "110197-L09"]),
    ).toBe("320104-L04");
    expect(nextSpecNo("320104", "L", ["320104-L01"], ["320104-L02"])).toBe(
      "320104-L03",
    );
    expect(nextSpecNo("110197", "3", [])).toBe("110197-301");
  });

  it("여러 줄은 차례로 번호를 예약한다", () => {
    const lines = parseText(
      "고객사 = 1, 품명 = L | 광택 = 1\n\n고객사 = 1, 품명 = L | 광택 = 2\n원재료 두께 = 1",
      DICT,
    );
    expect(lines).toHaveLength(3);
    expect(previewSpecNos(lines, ["1-L01"])).toEqual(["1-L02", "1-L03", null]);
  });
});

describe("표시", () => {
  it("값 표시 — = 와 ~ 는 값만", () => {
    expect(displayValue("=", "H36")).toBe("H36");
    expect(displayValue("~", "0.5~0.8")).toBe("0.5~0.8");
    expect(displayValue("≥", "20")).toBe("≥ 20");
    expect(
      termText({ attrNm: "원재료 두께", op: "~", val: "0.5~0.8", unit: "mm" }),
    ).toBe("원재료 두께 0.5~0.8 mm");
    expect(termText({ attrNm: "광택", op: "=", val: "30", unit: null })).toBe(
      "광택 = 30",
    );
  });

  it("수신 전문 머리", () => {
    expect(
      inboundPayload({
        ordNo: "D260831027-010",
        cusCd: "320104",
        cusNm: null,
        prdNmCd: "L",
        prdNm: null,
        qty: "24.0 t",
        recvAt: "",
        attrs: { RAW_THK: "0.8" },
      }),
    ).toEqual({
      IF_ID: "OMS_MESQ_ORD_001",
      ORD_NO: "D260831027-010",
      CUS_CD: "320104",
      PRD_NM_CD: "L",
      QTY: "24.0 t",
      RAW_THK: "0.8",
    });
  });
});

describe("간편 입력 ↔ 한 줄", () => {
  it("간편 입력을 한 줄로 쓰고 다시 되돌린다", () => {
    const line = guidedToLine(
      {
        cusCd: "320104",
        prdNmCd: "L",
        conds: [
          { attrCd: "RAW_THK", op: "≥", val: "1.2" },
          { attrCd: "RAW_WID", op: "=", val: "900~1250" },
        ],
        results: [{ attrCd: "RAW_MTRL", op: "=", val: "H36" }],
      },
      DICT,
    );
    expect(line).toBe(
      "고객사 = 320104, 품명 = L, 원재료 두께 ≥ 1.2, 원재료 폭 = 900~1250 | 원재료 재질 = H36",
    );
    const back = lineToGuided(line, DICT);
    expect(back).toEqual({
      cusCd: "320104",
      prdNmCd: "L",
      conds: [
        { attrCd: "RAW_THK", op: "≥", val: "1.2" },
        { attrCd: "RAW_WID", op: "=", val: "900~1250" },
      ],
      results: [{ attrCd: "RAW_MTRL", op: "=", val: "H36" }],
    });
  });

  it("여러 줄이거나 미매핑 항목이 있으면 되돌리지 않는다", () => {
    expect(
      lineToGuided(
        "고객사 = 1, 품명 = L | 광택 = 1\n고객사 = 1, 품명 = L | 광택 = 2",
        DICT,
      ),
    ).toBeNull();
    expect(
      lineToGuided("고객사 = 1, 품명 = L, 경도 = 3 | 광택 = 1", DICT),
    ).toBeNull();
  });
});
