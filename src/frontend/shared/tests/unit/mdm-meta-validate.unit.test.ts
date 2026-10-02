/** @vitest-environment happy-dom */
/**
 * MDM 화면 값 검증(spec §5, C1·C5) — validateMdmValue 표와 useMdmValidation 훅.
 * 문구·판정은 서버(cactus-core MdmValueChecks·DefaultDomainValidator)와 같은 꼴이다.
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MdmMetaProvider,
  codePointLength,
  requestColumns,
  resetMdmMetaStore,
  toPhysName,
  useMdmColumn,
  useMdmValidation,
  validateMdmValue,
  type MdmScreenColumn,
} from "../../src/mdm-meta";
import { column, fakeMetaFetch, settle } from "./mdm-meta-fixtures";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/** 로컬 mdm.db 도메인 30(일자, DT)의 표준식 AST 그대로. */
const DT_AST = {
  type: "FUNCTION",
  value: "STR_MATCHES",
  params: [
    { type: "VARIABLE_OR_CONSTANT", value: "value" },
    { type: "STRING_LITERAL", value: "^(?:(?:19|20)[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])|99991231)$" },
  ],
};
const DT_TEXT = 'STR_MATCHES(value, "^(?:(?:19|20)[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])|99991231)$")';

const TITLE = column("TITLE", { labelMid: "공지제목", labelShort: "제목", dataType: "STRING", length: 5, required: true });
const QTY = column("QTY", { labelMid: "수량", dataType: "NUMBER", length: 5, scale: 2 });
const CNT = column("CNT", { labelMid: "건수", dataType: "NUMBER", length: 3, scale: null });
const RATE = column("RATE", { labelMid: "비율", dataType: "NUMBER", length: null, scale: 1 });
const REG_DT = column("REG_DT", { labelMid: "등록일시", dataType: "DATE", length: null });
const FLAG = column("FLAG", { labelMid: "여부", dataType: "BOOLEAN", length: null });
const USE_YN = column("USE_YN", {
  labelMid: "사용여부",
  dataType: "STRING",
  length: 1,
  allowedCodes: [
    { code: "Y", name: "예" },
    { code: "N", name: "아니오" },
  ],
});
const WORK_DT = column("WORK_DT", {
  labelMid: "작업일자",
  dataType: "STRING",
  length: 8,
  stdExpr: { text: DT_TEXT, ast: DT_AST },
});

const code = (c: MdmScreenColumn, v: unknown) => validateMdmValue(c, v)?.code ?? null;
const msg = (c: MdmScreenColumn, v: unknown) => validateMdmValue(c, v)?.message ?? null;

describe("codePointLength", () => {
  it("UTF-16 단위가 아니라 code point 로 센다(이모지·한글)", () => {
    expect(codePointLength("abc")).toBe(3);
    expect(codePointLength("한글")).toBe(2);
    expect(codePointLength("😀😀")).toBe(2);
    expect("😀😀".length).toBe(4);
    expect(codePointLength("")).toBe(0);
  });
});

describe("validateMdmValue — 필수·빈 값", () => {
  it("null·undefined·공백만은 빈 값 — 필수면 REQUIRED, 아니면 통과", () => {
    for (const v of [null, undefined, "", "   "]) {
      expect(code(TITLE, v)).toBe("REQUIRED");
      expect(code(QTY, v)).toBeNull();
    }
    expect(msg(TITLE, "")).toBe("공지제목은(는) 필수입니다");
  });

  it("빈 값이면 표준식을 보지 않는다", () => {
    expect(code(WORK_DT, "")).toBeNull();
  });
});

describe("validateMdmValue — 타입", () => {
  it("NUMBER: 숫자·평문 십진 문자열만", () => {
    expect(code(QTY, 12.5)).toBeNull();
    expect(code(QTY, "12.5")).toBeNull();
    expect(code(QTY, "-3")).toBeNull();
    expect(code(QTY, "1,000")).toBe("TYPE");
    expect(code(QTY, "1e3")).toBe("TYPE");
    expect(code(QTY, " 12")).toBe("TYPE");
    expect(code(QTY, "abc")).toBe("TYPE");
    expect(code(QTY, true)).toBe("TYPE");
    expect(code(QTY, Number.NaN)).toBe("TYPE");
    expect(msg(QTY, "abc")).toBe("수량은(는) 숫자여야 합니다");
  });

  it("DATE: 날짜·일시 형식(달력 엄격), Date 객체, ISO 오프셋", () => {
    for (const ok of [
      "2026-10-03",
      "20261003",
      "2026/10/03",
      "2026-10-03 08:30:00",
      "2026-10-03T08:30:00",
      "2026-10-03 08:30",
      "2026-10-03T08:30",
      "20261003083000",
      "2026-10-03T08:30:00+09:00",
      "2026-10-03T08:30:00Z",
      " 2026-10-03 ",
      new Date(2026, 9, 3),
    ]) {
      expect(code(REG_DT, ok), String(ok)).toBeNull();
    }
    for (const bad of ["2026-02-30", "2026-13-01", "2026-10-03 25:00:00", "어제", "2026-1-3", 1759449600000, true]) {
      expect(code(REG_DT, bad), String(bad)).toBe("TYPE");
    }
    expect(msg(REG_DT, "어제")).toBe("등록일시은(는) 날짜 형식이 아닙니다");
  });

  it("STRING: 문자열·숫자는 받고 불린은 형식 오류", () => {
    expect(code(TITLE, "abc")).toBeNull();
    expect(code(TITLE, 123)).toBeNull();
    expect(code(TITLE, true)).toBe("TYPE");
    expect(msg(TITLE, true)).toBe("공지제목: 값 형식이 올바르지 않습니다");
  });

  it("BOOLEAN: 불린 또는 TRUE/FALSE(대소문자 무시)", () => {
    expect(code(FLAG, true)).toBeNull();
    expect(code(FLAG, "false")).toBeNull();
    expect(code(FLAG, "TRUE")).toBeNull();
    expect(code(FLAG, "Y")).toBe("TYPE");
    expect(code(FLAG, 1)).toBe("TYPE");
  });

  it("dataType 이 비거나 모르는 값이면 STRING 으로 본다(서버와 같은 기본값)", () => {
    const c = column("X", { dataType: null, length: 2 });
    expect(code(c, "abc")).toBe("LENGTH");
    expect(code(column("Y", { dataType: "VARCHAR2", length: 2 }), "abc")).toBe("LENGTH");
  });
});

describe("validateMdmValue — 길이(code point)", () => {
  it("문자열 길이를 code point 로 잰다", () => {
    expect(code(TITLE, "가나다라마")).toBeNull();
    expect(code(TITLE, "😀😀😀😀😀")).toBeNull();
    expect(code(TITLE, "가나다라마바")).toBe("LENGTH");
    expect(msg(TITLE, "abcdef")).toBe("공지제목은(는) 최대 5자입니다");
  });

  it("length 가 없으면 길이를 보지 않는다", () => {
    expect(code(column("MEMO", { length: null }), "x".repeat(5000))).toBeNull();
  });
});

describe("validateMdmValue — 소수 자리 NUMBER(p,s)", () => {
  it("정수부 ≤ p−s, 소수부 ≤ s", () => {
    expect(code(QTY, "999.99")).toBeNull();
    expect(code(QTY, "-999.99")).toBeNull();
    expect(code(QTY, "1000")).toBe("SCALE");
    expect(code(QTY, "1.234")).toBe("SCALE");
    expect(msg(QTY, "1.234")).toBe("수량은(는) 정수 3자리, 소수 2자리까지입니다");
  });

  it("끝자리 0 은 세지 않는다(stripTrailingZeros)", () => {
    expect(code(QTY, "1.2300")).toBeNull();
    expect(code(QTY, "0.05")).toBeNull();
    expect(code(QTY, "000999")).toBeNull();
  });

  it("scale 이 없으면 0 — NUMBER(p) 는 정수", () => {
    expect(code(CNT, "999")).toBeNull();
    expect(code(CNT, "1000")).toBe("SCALE");
    expect(code(CNT, "1.5")).toBe("SCALE");
    expect(msg(CNT, "1.5")).toBe("건수은(는) 정수 3자리, 소수 0자리까지입니다");
  });

  it("precision 이 없고 scale 만 있으면 소수부만 본다", () => {
    expect(code(RATE, "123456.7")).toBeNull();
    expect(code(RATE, "1.25")).toBe("SCALE");
    expect(msg(RATE, "1.25")).toBe("비율은(는) 소수 1자리까지입니다");
  });

  it("JS 숫자도 같은 규칙(지수 표기 숫자 포함)", () => {
    expect(code(QTY, 999.99)).toBeNull();
    expect(code(QTY, 1e-7)).toBe("SCALE");
    expect(code(QTY, 12345)).toBe("SCALE");
  });
});

describe("validateMdmValue — 허용 코드", () => {
  it("allowedCodes 를 받았을 때만 본다", () => {
    expect(code(USE_YN, "Y")).toBeNull();
    expect(code(USE_YN, "X")).toBe("CODE");
    expect(msg(USE_YN, "X")).toBe("사용여부: 허용되지 않은 코드입니다");
    expect(code(column("C", { allowedCodes: null, length: 5 }), "X")).toBeNull();
  });

  it("빈 목록은 어떤 코드도 받지 않는다", () => {
    expect(code(column("C", { allowedCodes: [], length: 5 }), "Y")).toBe("CODE");
  });

  it("길이 검사가 허용 코드보다 먼저다", () => {
    expect(code(USE_YN, "YY")).toBe("LENGTH");
  });
});

describe("validateMdmValue — 도메인 표준식", () => {
  it("value 하나로 평가해 거짓이면 STD_EXPR", () => {
    expect(code(WORK_DT, "20261003")).toBeNull();
    expect(code(WORK_DT, "99991231")).toBeNull();
    expect(code(WORK_DT, "20261315")).toBe("STD_EXPR");
    expect(msg(WORK_DT, "20261315")).toBe(`작업일자: 표준 규칙을 만족하지 않습니다(${DT_TEXT})`);
  });

  it("행의 다른 값은 표준식에 넣지 않는다(엔진 DOMAIN_STD 변수는 value 하나)", () => {
    const c = column("A", {
      length: 10,
      stdExpr: {
        text: "value == OTHER",
        ast: {
          type: "INFIX_OPERATOR",
          value: "==",
          params: [
            { type: "VARIABLE_OR_CONSTANT", value: "value" },
            { type: "VARIABLE_OR_CONSTANT", value: "OTHER" },
          ],
        },
      },
    });
    // OTHER 가 없어 화면은 판정하지 못한다 → 통과(서버 확인)
    expect(validateMdmValue(c, "x", { OTHER: "y", A: "x" })).toBeNull();
  });

  it("NUMBER 값은 십진수로 넘긴다", () => {
    const c = column("N", {
      dataType: "NUMBER",
      length: 10,
      scale: 2,
      stdExpr: {
        text: "value > 0",
        ast: {
          type: "INFIX_OPERATOR",
          value: ">",
          params: [
            { type: "VARIABLE_OR_CONSTANT", value: "value" },
            { type: "NUMBER_LITERAL", value: "0" },
          ],
        },
      },
    });
    expect(code(c, "1.5")).toBeNull();
    expect(code(c, -1)).toBe("STD_EXPR");
    expect(code(c, "0")).toBe("STD_EXPR");
  });

  it("isSupported 가 거짓(화면이 못 하는 함수)이면 통과 — 서버에 맡긴다", () => {
    const c = column("M", {
      length: 10,
      stdExpr: {
        text: 'CODE("X", value)',
        ast: {
          type: "FUNCTION",
          value: "CODE",
          params: [
            { type: "STRING_LITERAL", value: "X" },
            { type: "VARIABLE_OR_CONSTANT", value: "value" },
          ],
        },
      },
    });
    expect(code(c, "anything")).toBeNull();
  });

  it("결과가 불린이 아니거나 AST 가 깨졌으면 통과", () => {
    const notBool = column("S", {
      length: 10,
      stdExpr: { text: "value", ast: { type: "VARIABLE_OR_CONSTANT", value: "value" } },
    });
    expect(code(notBool, "x")).toBeNull();
    const broken = column("B", { length: 10, stdExpr: { text: "?", ast: { type: "???" } } });
    expect(code(broken, "x")).toBeNull();
    const noAst = column("C", { length: 10, stdExpr: { text: "value > 1", ast: null } });
    expect(code(noAst, "x")).toBeNull();
  });
});

describe("validateMdmValue — 캡션", () => {
  it("폼 캡션 labelMid → labelLong → labelShort → columnName → 물리명, 주면 그것", () => {
    const c = column("TITLE", { required: true });
    expect(msg(c, "")).toBe("TITLE은(는) 필수입니다");
    expect(msg({ ...c, columnName: "제목명" }, "")).toBe("제목명은(는) 필수입니다");
    expect(msg({ ...c, labelShort: "제목", labelLong: "공지 제목" }, "")).toBe("공지 제목은(는) 필수입니다");
    expect(validateMdmValue(c, "", undefined, "화면제목")?.message).toBe("화면제목은(는) 필수입니다");
  });

  it("첫 실패에서 멈춘다(필수 → 타입 → 길이·소수 → 코드 → 표준식)", () => {
    expect(code(QTY, "abc")).toBe("TYPE");
    expect(code(WORK_DT, "2026100399")).toBe("LENGTH");
  });
});

describe("useMdmValidation", () => {
  beforeEach(() => resetMdmMetaStore());
  afterEach(() => vi.unstubAllGlobals());

  type Api = ReturnType<typeof useMdmValidation>;

  async function mount(withProvider: boolean, names: string[] = []): Promise<{ api: () => Api; unmount: () => Promise<void> }> {
    let api: Api | null = null;
    function Probe() {
      api = useMdmValidation();
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    const probe = createElement(Probe);
    await act(async () =>
      root.render(withProvider ? createElement(MdmMetaProvider, { module: "mls" }, probe) : probe)
    );
    if (names.length > 0) {
      // 화면의 그리드·폼(useMdmColumn·그리드 열)이 이름을 등록한 것과 같게 store 를 채운다.
      await act(async () => {
        await requestColumns("mls", names.map((n) => toPhysName(n)!));
      });
    }
    return {
      api: () => api!,
      unmount: async () => {
        await act(async () => root.unmount());
      },
    };
  }

  it("공급자 밖이면 아무것도 검사하지 않고 부르지도 않는다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    const m = await mount(false);
    expect(m.api().validateValue("title", "")).toBeNull();
    expect(m.api().validateRow({ title: "" }, ["title"])).toEqual({});
    expect(m.api().validateRows([{ title: "" }], ["title"])).toEqual([]);
    await settle(40);
    expect(f.calls).toHaveLength(0);
    await m.unmount();
  });

  it("등록되지 않은 이름은 요청하지 않고 건너뛴다 — 렌더 중 부수 효과가 없고, 등록(받아 둠) 뒤부터 검사한다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE, QTY } });
    vi.stubGlobal("fetch", f.fn);
    const m = await mount(true);
    expect(m.api().validateValue("title", "")).toBeNull();
    expect(m.api().validateRows([{ title: "" }], ["title"])).toEqual([]);
    await act(async () => {
      await settle(60);
    });
    expect(f.calls).toHaveLength(0);
    await act(async () => {
      await requestColumns("mls", ["TITLE"]);
    });
    expect(m.api().validateValue("title", "")?.code).toBe("REQUIRED");
    await m.unmount();
  });

  /**
   * 업무 BE 가 MDM 에 닿지 못하거나(unavailable) 500 이 나는 동안에도, 렌더마다 validateValue 를 불러(입력 칸 즉시 검사) 글자마다 POST 가 나가지
   * 않는다 — 요청은 칸을 등록한(useMdmColumn) 한 번뿐이다. 묶음 틱(16ms)보다 길게 쉬며 다시 그려 같은 틱 묶음으로 가려지지 않게 한다.
   */
  it.each([
    ["unavailable", { columns: { TITLE }, unavailable: ["TITLE"] }],
    ["HTTP 500", { columns: { TITLE }, status: 500 }],
  ] as const)("%s 상태에서 렌더마다 validateValue 를 불러도 POST 는 1회", async (_label, meta) => {
    const f = fakeMetaFetch(meta);
    vi.stubGlobal("fetch", f.fn);
    const seen: Array<string | null> = [];
    function Row({ value }: { value: string }) {
      useMdmColumn("title");
      const { validateValue } = useMdmValidation();
      seen.push(validateValue("title", value)?.code ?? null);
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    for (const value of ["a", "ab", "abc", "abcd", "abcdefgh"]) {
      await act(async () => root.render(createElement(MdmMetaProvider, { module: "mls" }, createElement(Row, { value }))));
      await act(async () => {
        await settle(40);
      });
    }
    expect(f.calls.filter((c) => c.url.endsWith("/mdmMeta/columns"))).toHaveLength(1);
    expect(seen.every((c) => c === null)).toBe(true); // 모르는 동안은 서버에 맡긴다
    await act(async () => root.unmount());
  });

  it("validateValue·validateRow·validateRows — 키를 물리명으로, meta 로 덮고 false 면 끈다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE, QTY } });
    vi.stubGlobal("fetch", f.fn);
    const m = await mount(true, ["title", "qty"]);
    const api = m.api();
    expect(api.validateValue("title", "abcdef")?.code).toBe("LENGTH");
    expect(api.validateValue("subject", "abcdef", undefined, "TITLE")?.code).toBe("LENGTH");
    expect(api.validateValue("title", "", undefined, false)).toBeNull();
    expect(api.validateValue("unknownCol", "x")).toBeNull();

    const row = { title: "", qty: "1.234", memo: "x" };
    const issues = api.validateRow(row, ["title", "qty", "memo"]);
    expect(Object.keys(issues)).toEqual(["title", "qty"]);
    expect(issues.title.code).toBe("REQUIRED");
    expect(issues.qty.code).toBe("SCALE");

    const rows = [
      { title: "ok", qty: "1" },
      { title: "", qty: "x", rowStatus: "D" },
      { title: "", qty: "1", _rowState: "deleted" },
      { title: "", qty: "1", nativeeditor_status: "deleted" },
      { title: "abcdef", qty: "x", rowStatus: "U" },
    ];
    const all = api.validateRows(rows, ["title", "qty"]);
    expect(all.map((r) => [r.rowIndex, r.field, r.issue.code])).toEqual([
      [4, "title", "LENGTH"],
      [4, "qty", "TYPE"],
    ]);
    await m.unmount();
  });

  it("validateRows — 삭제 행 판정은 서버 MdmValidator 처럼 앞뒤 공백·대소문자를 무시한다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE, QTY } }).fn);
    const m = await mount(true, ["title", "qty"]);
    const bad = { title: "", qty: "x" }; // 검사하면 title REQUIRED · qty TYPE
    const rows = [
      { ...bad, rowStatus: "d" },
      { ...bad, rowStatus: "DELETED" },
      { ...bad, rowStatus: " D " },
      { ...bad, rowStatus: " Deleted " },
      { ...bad, rowStatus: "deleted" },
      { ...bad, rowStatus: "U" }, // 삭제가 아니다 — 검사한다
      { ...bad, rowStatus: "" },
      { ...bad, rowStatus: 7 }, // 문자열이 아니어도 던지지 않는다
      { ...bad, rowStatus: "DEL" }, // D·deleted 만 삭제다
    ];
    const all = m.api().validateRows(rows, ["title"]);
    expect(all.map((r) => r.rowIndex)).toEqual([5, 6, 7, 8]);
    await m.unmount();
  });

  it("disabled 공급자 아래에서는 검사하지 않는다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    let api: Api | null = null;
    function Probe() {
      api = useMdmValidation();
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () =>
      root.render(createElement(MdmMetaProvider, { module: "mls", disabled: true }, createElement(Probe)))
    );
    expect(api!.validateValue("title", "")).toBeNull();
    await settle(40);
    expect(f.calls).toHaveLength(0);
    await act(async () => root.unmount());
  });
});
