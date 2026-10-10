/** 맞춤 레포트 2차(스펙 2026-10-10-custom-report-v2-design §2) — 새 조건 형·상대 날짜·서식·합계·검사. */
import { describe, expect, it } from "vitest";

import {
  appendUndeclaredParams,
  cleanValues,
  codeGroupsOf,
  columnSums,
  formatCell,
  formatMask,
  initialValues,
  missingRequired,
  paramsOf,
  paramUsageNotes,
  planRun,
  resolveDateDefault,
  tableConfigOf,
  toColumnDefs,
  usableParams,
  validateColumns,
  validateParams,
  validateQueryConfig,
  type QueryParam,
} from "./format";

/** 기준일 2026-03-31 — 스펙 §2.2 표. */
const TODAY = new Date(2026, 2, 31);

describe("resolveDateDefault(스펙 §2.2 표)", () => {
  it.each([
    ["0d", "2026-03-31"],
    ["-7d", "2026-03-24"],
    ["+1d", "2026-04-01"],
    ["-1w", "2026-03-24"],
    ["-1M", "2026-02-28"],
    ["-13M", "2025-02-28"],
    ["monthStart", "2026-03-01"],
    ["monthEnd", "2026-03-31"],
    ["prevMonthStart", "2026-02-01"],
    ["prevMonthEnd", "2026-02-28"],
    ["yearStart", "2026-01-01"],
  ])("%s → %s", (word, expected) => {
    expect(resolveDateDefault(word, TODAY)).toBe(expected);
  });

  it("-1y 는 기준일 2024-02-29 에서 2023-02-28", () => {
    expect(resolveDateDefault("-1y", new Date(2024, 1, 29))).toBe("2023-02-28");
  });

  it("절대 날짜는 yyyy-MM-dd 로, 없는 날짜·모르는 낱말은 null", () => {
    expect(resolveDateDefault("20261002", TODAY)).toBe("2026-10-02");
    expect(resolveDateDefault("2026-10-02", TODAY)).toBe("2026-10-02");
    expect(resolveDateDefault("2026-02-30", TODAY)).toBeNull();
    expect(resolveDateDefault("tomorrow", TODAY)).toBeNull();
    expect(resolveDateDefault("1234d", TODAY)).toBeNull();
  });
});

describe("조건 읽기·값 만들기", () => {
  const range: QueryParam = { name: "fromDt", type: "daterange", toName: "toDt", default: "-7d", toDefault: "0d", maxSpanDays: 31, required: true };
  const multi: QueryParam = { name: "st", type: "multi", options: [{ value: "S" }, { value: "H" }], countName: "stCnt", default: "S,H" };

  it("paramsOf 는 새 키를 지키고 빈 값은 뺀다", () => {
    const got = paramsOf({
      params: [
        { name: "fromDt", type: "daterange", toName: "toDt", toDefault: "0d", maxSpanDays: 31 },
        { name: "g", type: "select", codeGroup: "WIDGET_CTG" },
        { name: "m", type: "multi", countName: " " },
      ],
    });
    expect(got[0]).toEqual({ name: "fromDt", type: "daterange", toName: "toDt", toDefault: "0d", maxSpanDays: 31 });
    expect(got[1]).toEqual({ name: "g", type: "select", codeGroup: "WIDGET_CTG" });
    expect(got[2]).toEqual({ name: "m", type: "multi" });
  });

  it("initialValues: 기간은 두 키에 날짜, 다중은 쉼표로 나눈 배열", () => {
    expect(initialValues([range, multi], TODAY)).toEqual({ fromDt: "2026-03-24", toDt: "2026-03-31", st: ["S", "H"] });
  });

  it("cleanValues: 다중은 중복 제거·정렬, countName 은 보내지 않는다", () => {
    const out = cleanValues([range, multi], { fromDt: " 2026-03-01 ", toDt: "2026-03-31", st: ["H", "S", "H", " "], stCnt: "9" });
    expect(out).toEqual({ fromDt: "2026-03-01", toDt: "2026-03-31", st: ["H", "S"] });
  });

  it("cleanValues: 다중은 100개까지", () => {
    const many = Array.from({ length: 150 }, (_, i) => `V${String(i).padStart(3, "0")}`);
    const out = cleanValues([multi], { st: many });
    expect((out.st as string[]).length).toBe(100);
  });

  it("missingRequired·planRun: 기간은 둘 중 하나만 비어도 막고, 순서·최대 일수 위반도 막는다", () => {
    expect(missingRequired([range], { fromDt: "2026-03-01", toDt: "" })).toEqual(["fromDt"]);
    expect(planRun([range], { fromDt: "2026-03-01", toDt: "2026-03-31" }).run).toBe(true);
    expect(planRun([range], { fromDt: "2026-03-31", toDt: "2026-03-01" }).run).toBe(false);
    expect(planRun([range], { fromDt: "2026-01-01", toDt: "2026-03-31" }).run).toBe(false);
    expect(missingRequired([{ ...multi, required: true }], { st: [] })).toEqual(["st"]);
  });

  it("planRun: 기간 오류는 필수 누락과 다른 문구로 알리고, 값 JSON 이 너무 길면 줄이지 않고 막는다", () => {
    const bad = planRun([range], { fromDt: "2026-03-31", toDt: "2026-03-01" });
    expect(bad).toMatchObject({ run: false, message: "시작 날짜가 끝 날짜보다 늦습니다" });
    expect(planRun([range], { fromDt: "", toDt: "" })).toEqual({ run: false, missing: ["fromDt"] });
    const long = Array.from({ length: 100 }, (_, i) => `${"x".repeat(190)}${i}`);
    const free: QueryParam = { name: "m", type: "multi", options: [{ value: "a" }] };
    const plan = planRun([free], { m: long });
    expect(plan.run).toBe(false);
    expect(plan).toMatchObject({ message: expect.stringContaining("너무 많") });
  });

  it("paramsOf 키 순서는 편집기 왕복과 같다(JSON 비교가 순서에 걸리지 않음)", () => {
    const raw = { name: "m", type: "multi", options: [{ value: "a" }], countName: "mCnt", required: true };
    const first = paramsOf({ params: [raw] })[0];
    expect(Object.keys(first)).toEqual(["name", "type", "required", "options", "countName"]);
  });

  it("usableParams: 끝 이름이 없거나 겹치면 기간 조건을 그리지 않는다", () => {
    expect(usableParams([{ name: "a", type: "daterange" }])).toEqual([]);
    expect(usableParams([{ name: "a", type: "text" }, { name: "b", type: "daterange", toName: "a" }])).toHaveLength(1);
    expect(usableParams([range])).toHaveLength(1);
  });

  it("paramUsageNotes·appendUndeclaredParams 는 toName·countName 을 선언으로 본다", () => {
    const sql = "SELECT 1 FROM T WHERE D >= :fromDt AND D <= :toDt AND (:stCnt = 0 OR S IN (:st))";
    expect(paramUsageNotes(sql, [range, multi])).toEqual({ undeclared: [], unused: [] });
    expect(appendUndeclaredParams([range, multi], sql)).toHaveLength(2);
  });
});

describe("validateParams 2판", () => {
  const check = (p: Record<string, unknown>) => validateParams({ params: [p] });

  it("정상 기간·다중·코드 조건은 통과", () => {
    expect(check({ name: "fromDt", type: "daterange", toName: "toDt", default: "monthStart", toDefault: "0d", maxSpanDays: 31 })).toEqual([]);
    expect(check({ name: "m", type: "multi", codeGroup: "WIDGET_CTG", countName: "mCnt", default: "A,B" })).toEqual([]);
    expect(check({ name: "s", type: "select", codeGroup: "USRQ_CTG" })).toEqual([]);
  });

  it("기간: 끝 이름 필수, 최대 일수 범위, 잘못된 낱말 기본값", () => {
    expect(check({ name: "a", type: "daterange" }).join()).toContain("끝 이름");
    expect(check({ name: "a", type: "daterange", toName: "b", maxSpanDays: 4000 }).join()).toContain("최대 일수");
    expect(check({ name: "a", type: "daterange", toName: "b", default: "soon" }).join()).toContain("기본값");
  });

  it("코드 그룹은 형식 검사, 선택지와 함께 쓸 수 없다", () => {
    expect(check({ name: "s", type: "select", codeGroup: "bad group" }).join()).toContain("코드 그룹");
    expect(check({ name: "s", type: "select", codeGroup: "OK_GRP", options: [{ value: "x" }] }).join()).toContain("함께");
    expect(check({ name: "s", type: "multi" }).join()).toContain("선택지 또는 코드 그룹");
  });

  it("끝·개수 이름도 이름 규칙과 중복 검사를 받는다", () => {
    expect(
      validateParams({ params: [{ name: "a", type: "daterange", toName: "a" }] }).join()
    ).toContain("중복");
    expect(
      validateParams({ params: [{ name: "m", type: "multi", options: [{ value: "x" }], countName: "today" }] }).join()
    ).toContain("시스템 변수");
  });
});

describe("formatMask·서식", () => {
  it("천 단위 구분과 소수 고정·최대 자릿수", () => {
    expect(formatMask(1234.5, "#,##0")).toBe("1,235");
    expect(formatMask(1234.5, "#,##0.0")).toBe("1,234.5");
    expect(formatMask(2, "0.00")).toBe("2.00");
    expect(formatMask(12345, "0")).toBe("12345");
    expect(formatMask(1.5, "#,##0.###")).toBe("1.5");
    expect(formatMask("abc", "#,##0")).toBe("abc");
    expect(formatMask(1234.5, "bad")).toBe("1,234.5");
  });

  it("formatCell 은 mask 를 number 에만 적용한다", () => {
    expect(formatCell(1234.567, "number", "#,##0.0")).toBe("1,234.6");
    expect(formatCell(1234.567, "number")).toBe("1,234.567");
  });
});

describe("tableConfigOf·validateColumns·columnSums", () => {
  const columns = [
    { field: "A", format: "number", mask: "#,##0.0", sum: true },
    { field: "S", format: "code", codeGroup: "WIDGET_CTG", badge: true },
    { field: "T", format: "text", mask: "#,##0", sum: true, codeGroup: "X_GRP", badge: true },
  ];

  it("새 키는 형식에 맞을 때만 남고 왕복해도 보존된다", () => {
    const cfg = tableConfigOf({ columns });
    expect(cfg.columns[0]).toEqual({ field: "A", format: "number", mask: "#,##0.0", sum: true });
    expect(cfg.columns[1]).toEqual({ field: "S", format: "code", codeGroup: "WIDGET_CTG", badge: true });
    expect(cfg.columns[2]).toEqual({ field: "T", format: "text" });
    expect(tableConfigOf({ columns: cfg.columns }).columns).toEqual(cfg.columns);
  });

  it("validateColumns: 형식에 안 맞는 서식·합계·코드 그룹·배지를 잡는다", () => {
    const errors = validateColumns({ columns });
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(validateColumns({ columns: [columns[0], columns[1]] })).toEqual([]);
    expect(validateColumns({ columns: [{ field: "A", format: "number", mask: "##" }] }).join()).toContain("서식");
    expect(validateQueryConfig("query-table", { sql: "SELECT 1", columns: [{ field: "T", format: "text", sum: true }] })).not.toEqual([]);
  });

  it("columnSums: sum 열만, 숫자가 아닌 칸은 건너뛴다", () => {
    const cols = tableConfigOf({ columns }).columns;
    const rows = [{ A: 1.5 }, { A: "2,000" }, { A: "x" }, { A: null }];
    expect(columnSums(rows, cols)).toEqual({ A: 2001.5 });
    expect(columnSums([], cols)).toEqual({ A: 0 });
  });
});

describe("코드 열 표시", () => {
  const cfg = tableConfigOf({ columns: [{ field: "S", format: "code", codeGroup: "G_ONE", badge: true }, { field: "N", format: "code", codeGroup: "G_ONE" }] });

  it("codeGroupsOf 는 중복 없이 그룹을 모은다", () => {
    expect(codeGroupsOf(cfg.columns)).toEqual(["G_ONE"]);
  });

  it("코드 값을 이름으로 보이고 없는 값은 그대로, 배지 열은 renderBadge 를 거친다", () => {
    const defs = toColumnDefs([], cfg, [], { codeLabels: { G_ONE: { A: "활성" } }, renderBadge: (t) => `[${t}]` });
    expect(defs[0].render?.("A", {})).toBe("[활성]");
    expect(defs[0].render?.("Z", {})).toBe("[Z]");
    expect(defs[1].render?.("A", {})).toBe("활성");
    expect(defs[1].render?.(null, {})).toBe("");
  });

  it("이름 표가 아직 없으면 코드 값 그대로", () => {
    const defs = toColumnDefs([], cfg, []);
    expect(defs[1].render?.("A", {})).toBe("A");
  });
});
