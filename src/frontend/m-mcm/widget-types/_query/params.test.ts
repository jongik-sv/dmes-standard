import { describe, expect, it } from "vitest";

import {
  appendUndeclaredParams,
  cleanValues,
  extractBindNames,
  initialValues,
  normalizeDateDefault,
  missingRequired,
  optionsToText,
  paramsOf,
  paramUsageNotes,
  parseOptionsText,
  planRun,
  usableParams,
  validateParams,
  validateQueryConfig,
  type QueryParam,
} from "./format";

describe("paramsOf — 모양을 믿지 않고 정리해 읽는다", () => {
  it("params 가 배열이 아니면 빈 목록", () => {
    expect(paramsOf(null)).toEqual([]);
    expect(paramsOf({})).toEqual([]);
    expect(paramsOf({ params: "x" })).toEqual([]);
    expect(paramsOf({ params: { name: "a" } })).toEqual([]);
  });

  it("객체가 아닌 원소는 건너뛰고, 형이 이상하면 text, 이름·라벨은 공백을 지운다", () => {
    expect(paramsOf({ params: [1, null, { name: " dept ", label: " 부서 ", type: "zzz" }] })).toEqual([
      { name: "dept", label: "부서", type: "text" },
    ]);
  });

  it("기본값은 글자·숫자만(숫자는 글자로), 필수는 true 일 때만, 선택지는 값 있는 것만", () => {
    expect(
      paramsOf({
        params: [
          {
            name: "lv",
            type: "select",
            default: 3,
            required: "yes",
            options: [{ value: "1", label: "하" }, { value: "" }, { label: "값없음" }, "x", { value: 2 }],
          },
          { name: "d", type: "date", default: { a: 1 }, required: true },
        ],
      })
    ).toEqual([
      { name: "lv", type: "select", default: "3", options: [{ value: "1", label: "하" }, { value: "2" }] },
      { name: "d", type: "date", required: true },
    ]);
  });

  it("이름이 빈 항목도 남긴다(편집기가 고치게) — 그릴 때는 usableParams 가 거른다", () => {
    const all = paramsOf({ params: [{ name: "", type: "text" }, { name: "a", type: "text" }, { name: "a", type: "date" }, { name: "1x", type: "text" }] });
    expect(all).toHaveLength(4);
    expect(usableParams(all)).toEqual([{ name: "a", type: "text" }]);
  });
});

describe("값 정리·필수 검사·실행 판정", () => {
  const params: QueryParam[] = [
    { name: "dept", type: "text", required: true },
    { name: "from", type: "date", default: "2026-10-01" },
    { name: "n", type: "number" },
  ];

  it("처음 값은 기본값이고 없으면 빈 글자, 기본값은 200자까지", () => {
    expect(initialValues(params)).toEqual({ dept: "", from: "2026-10-01", n: "" });
    expect(initialValues([{ name: "a", type: "text", default: "x".repeat(250) }]).a).toHaveLength(200);
  });

  it("cleanValues 는 선언된 이름만, 앞뒤 공백을 지우고 200자까지, 빈 값은 빈 글자로 둔다", () => {
    expect(cleanValues(params, { dept: "  A  ", extra: "무시", n: "x".repeat(300) })).toEqual({
      dept: "A",
      from: "",
      n: "x".repeat(200),
    });
  });

  it("missingRequired — 필수인데 공백뿐이거나 없는 이름", () => {
    expect(missingRequired(params, { dept: "  " })).toEqual(["dept"]);
    expect(missingRequired(params, {})).toEqual(["dept"]);
    expect(missingRequired(params, { dept: "A" })).toEqual([]);
  });

  it("planRun — 조건이 없으면 값 없이 부른다(paramsJson 을 싣지 않는다)", () => {
    expect(planRun([], {})).toEqual({ run: true });
  });

  it("planRun — 필수가 비면 부르지 않고, 채우면 정리한 값으로 부른다", () => {
    expect(planRun(params, { dept: "" })).toEqual({ run: false, missing: ["dept"] });
    expect(planRun(params, { dept: " A ", from: "2026-10-02" })).toEqual({
      run: true,
      values: { dept: "A", from: "2026-10-02", n: "" },
    });
  });
});

describe("extractBindNames — 사용자 바인드 근사 추출", () => {
  it("순서·중복 제거, 시스템 변수 제외", () => {
    expect(extractBindNames("SELECT * FROM T WHERE A = :dept AND B = :userId AND C = :dept AND D >= :from AND E = :today")).toEqual([
      "dept",
      "from",
    ]);
  });

  it(":: 캐스트는 바인드가 아니다", () => {
    expect(extractBindNames("SELECT a::int, b::text, :x::int FROM T")).toEqual(["x"]);
  });

  it("전기일 시스템 변수(:bizDate·:bizYesterday·:baseHour)도 사용자 바인드가 아니다", () => {
    expect(extractBindNames("SELECT * FROM T WHERE D = :bizDate AND Y = :bizYesterday AND H = :baseHour AND P = :plant")).toEqual([
      "plant",
    ]);
  });

  it("문자열 리터럴·따옴표 식별자·주석 안의 :이름은 뺀다", () => {
    const sql = [
      "SELECT ':no' AS a, 'it''s :no2' AS b, \"col:no3\" -- :no4",
      "/* :no5 */ FROM T WHERE X = :yes -- 끝 :no6",
    ].join("\n");
    expect(extractBindNames(sql)).toEqual(["yes"]);
  });

  it("주석 안의 따옴표가 문자열을 열지 않고, 문자열 안의 -- 가 주석을 열지 않는다", () => {
    expect(extractBindNames("SELECT 1 -- it's\nFROM T WHERE a = :one")).toEqual(["one"]);
    expect(extractBindNames("SELECT '--' AS a FROM T WHERE a = :two")).toEqual(["two"]);
  });

  it("시각 글자(12:30)·콜론만 있는 것은 바인드가 아니다", () => {
    expect(extractBindNames("SELECT TO_DATE('12:30') FROM T WHERE a = 1:2 AND t = :")).toEqual([]);
  });

  it("닫히지 않은 따옴표·주석도 멈추지 않는다", () => {
    expect(extractBindNames("SELECT :a, 'abc :b")).toEqual(["a"]);
    expect(extractBindNames("SELECT :a /* :b")).toEqual(["a"]);
  });
});

describe("validateParams / validateQueryConfig 의 조건 검사", () => {
  const sql = "SELECT :a";
  const ok = { name: "a", type: "text" };

  it("params 가 없거나 비면 통과", () => {
    expect(validateParams({})).toEqual([]);
    expect(validateParams({ params: [] })).toEqual([]);
    expect(validateQueryConfig("query-table", { sql, columns: [], params: [ok] })).toEqual([]);
  });

  it("params 가 배열이 아니면 거절", () => {
    expect(validateParams({ params: "x" })).toEqual(["조회 조건 설정 형식이 올바르지 않습니다"]);
  });

  it("이름 형식·빈 이름·시스템 이름·중복", () => {
    expect(validateParams({ params: [{ name: "", type: "text" }] })).toEqual(["조회 조건 1번의 이름을 입력하세요"]);
    expect(validateParams({ params: [{ name: "1a", type: "text" }] })[0]).toContain("영문자로 시작하는");
    expect(validateParams({ params: [{ name: "a-b", type: "text" }] })[0]).toContain("영문자로 시작하는");
    expect(validateParams({ params: [{ name: "a".repeat(31), type: "text" }] })[0]).toContain("30자 이하");
    expect(validateParams({ params: [{ name: "userId", type: "text" }] })).toEqual([
      "조회 조건 1번의 이름 「userId」 은 시스템 변수 이름이라 쓸 수 없습니다",
    ]);
    for (const reserved of ["deptCd", "today", "yesterday", "monthStart", "now", "bizDate", "bizYesterday", "baseHour"]) {
      expect(validateParams({ params: [{ name: reserved, type: "text" }] })).toHaveLength(1);
    }
    expect(validateParams({ params: [ok, { name: "a", type: "date" }] })).toEqual(["조회 조건 2번의 이름 「a」 이 중복됩니다"]);
  });

  it("개수는 10개까지", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `p${i}`, type: "text" }));
    expect(validateParams({ params: eleven })).toEqual(["조회 조건은 최대 10개까지 둘 수 있습니다"]);
    expect(validateParams({ params: eleven.slice(0, 10) })).toEqual([]);
  });

  it("형 enum, 기본값 200자, select 의 선택지", () => {
    expect(validateParams({ params: [{ name: "a" }] })).toEqual(["조회 조건 1번의 형을 고르세요"]);
    expect(validateParams({ params: [{ name: "a", type: "zzz" }] })).toEqual(["조회 조건 1번의 형을 고르세요"]);
    expect(validateParams({ params: [{ name: "a", type: "text", default: "x".repeat(201) }] })).toEqual([
      "조회 조건 1번의 기본값은 200자 이하로 입력하세요",
    ]);
    expect(validateParams({ params: [{ name: "a", type: "text", default: "x".repeat(200) }] })).toEqual([]);
    expect(validateParams({ params: [{ name: "a", type: "select" }] })).toEqual([
      "조회 조건 1번은 선택 형이라 선택지를 하나 이상 넣어야 합니다",
    ]);
    expect(validateParams({ params: [{ name: "a", type: "select", options: [] }] })).toHaveLength(1);
    expect(validateParams({ params: [{ name: "a", type: "select", options: [{ value: "" }] }] })).toEqual([
      "조회 조건 1번에 값이 빈 선택지가 있습니다",
    ]);
    expect(validateParams({ params: [{ name: "a", type: "select", options: [{ value: "1" }] }] })).toEqual([]);
  });

  it("validateQueryConfig 에 묶여 SQL 오류와 같이 나온다", () => {
    expect(validateQueryConfig("query-table", { sql: "", columns: [], params: [{ name: "", type: "text" }] })).toEqual([
      "SQL 을 입력하세요",
      "조회 조건 1번의 이름을 입력하세요",
    ]);
    expect(validateQueryConfig("query-number", { sql, labelField: "L", valueField: "V", params: [{ name: "now", type: "text" }] })).toHaveLength(1);
  });
});

describe("선택지 글자 변환·SQL 에서 가져오기", () => {
  it("값:라벨,값:라벨 을 읽고(첫 콜론에서 나눔, 빈 조각 버림) 되돌린다", () => {
    expect(parseOptionsText("A:전체, B:부분 ,C, ,:무값,D:a:b")).toEqual([
      { value: "A", label: "전체" },
      { value: "B", label: "부분" },
      { value: "C" },
      { value: "D", label: "a:b" },
    ]);
    expect(parseOptionsText("")).toEqual([]);
    expect(optionsToText([{ value: "A", label: "전체" }, { value: "C" }])).toBe("A:전체,C");
    expect(optionsToText(undefined)).toBe("");
  });

  it("appendUndeclaredParams — 선언 안 된 바인드만 글자 형으로 뒤에 붙인다", () => {
    const list: QueryParam[] = [{ name: "a", type: "date" }];
    expect(appendUndeclaredParams(list, "SELECT :a, :b, :userId, :b, :c")).toEqual([
      { name: "a", type: "date" },
      { name: "b", type: "text" },
      { name: "c", type: "text" },
    ]);
    expect(appendUndeclaredParams(list, "SELECT :a")).toEqual(list);
  });

  it("paramUsageNotes — 선언 안 된 것과 안 쓰인 것", () => {
    expect(paramUsageNotes("SELECT :a, :b", [{ name: "a", type: "text" }, { name: "z", type: "text" }, { name: "", type: "text" }])).toEqual({
      undeclared: ["b"],
      unused: ["z"],
    });
  });
});

describe("date 형 기본값", () => {
  it("normalizeDateDefault — yyyy-MM-dd·yyyyMMdd 실제 날짜만 yyyy-MM-dd 로", () => {
    expect(normalizeDateDefault("2026-10-05")).toBe("2026-10-05");
    expect(normalizeDateDefault("20261005")).toBe("2026-10-05");
    expect(normalizeDateDefault("2024-02-29")).toBe("2024-02-29");
    for (const bad of ["2026-02-30", "20261301", "2026-1-5", "2026-1005", "202610-05", "abc", "", "2026/10/05"]) {
      expect(normalizeDateDefault(bad)).toBeNull();
    }
  });

  it("initialValues — yyyyMMdd 는 바꾸고, 실제 날짜가 아니면 글자 그대로 둔다(검사가 막는다)", () => {
    expect(initialValues([{ name: "d", type: "date", default: "20261005" }])).toEqual({ d: "2026-10-05" });
    expect(initialValues([{ name: "d", type: "date", default: "20261399" }])).toEqual({ d: "20261399" });
    expect(initialValues([{ name: "t", type: "text", default: "20261005" }])).toEqual({ t: "20261005" });
  });

  it("validateParams — date 기본값은 yyyy-MM-dd·yyyyMMdd 실제 날짜", () => {
    const one = (def: string) => validateParams({ params: [{ name: "d", type: "date", default: def }] });
    expect(one("2026-10-05")).toEqual([]);
    expect(one("20261005")).toEqual([]);
    expect(one("")).toEqual([]);
    expect(one("2026-02-30")).toEqual(["조회 조건 1번의 기본값은 yyyy-MM-dd 또는 yyyyMMdd 형식의 실제 날짜로 입력하세요"]);
    expect(one("오늘")).toHaveLength(1);
  });
});

describe("validateParams — 서버와 같은 형·선택지 규칙", () => {
  const one = (p: Record<string, unknown>) => validateParams({ params: [{ name: "a", ...p }] });

  it("number 기본값은 숫자", () => {
    expect(one({ type: "number", default: "12.5" })).toEqual([]);
    expect(one({ type: "number", default: "-3" })).toEqual([]);
    expect(one({ type: "number", default: "1,234" })).toEqual(["조회 조건 1번의 기본값은 숫자로 입력하세요"]);
    expect(one({ type: "number", default: "abc" })).toHaveLength(1);
  });

  it("select 기본값은 선택지 값 중 하나", () => {
    const options = [{ value: "A" }, { value: "B", label: "비" }];
    expect(one({ type: "select", options, default: "B" })).toEqual([]);
    expect(one({ type: "select", options })).toEqual([]);
    expect(one({ type: "select", options, default: "C" })).toEqual(["조회 조건 1번의 기본값은 선택지 값 중 하나여야 합니다"]);
  });

  it("선택지 값 중복·50개 초과·값 200자 초과·라벨 50자 초과", () => {
    expect(one({ type: "select", options: [{ value: "A" }, { value: "A" }] })).toEqual(["조회 조건 1번에 값이 겹치는 선택지가 있습니다"]);
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ value: `v${i}` }));
    expect(one({ type: "select", options: many(50) })).toEqual([]);
    expect(one({ type: "select", options: many(51) })).toEqual(["조회 조건 1번의 선택지는 최대 50개까지 둘 수 있습니다"]);
    expect(one({ type: "select", options: [{ value: "x".repeat(200) }] })).toEqual([]);
    expect(one({ type: "select", options: [{ value: "x".repeat(201) }] })).toEqual(["조회 조건 1번의 선택지 값은 200자 이하로 입력하세요"]);
    expect(one({ type: "select", options: [{ value: "A", label: "라".repeat(50) }] })).toEqual([]);
    expect(one({ type: "select", options: [{ value: "A", label: "라".repeat(51) }] })).toEqual(["조회 조건 1번의 선택지 라벨은 50자 이하로 입력하세요"]);
  });
});
