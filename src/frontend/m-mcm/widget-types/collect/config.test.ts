import { describe, expect, it } from "vitest";

import {
  collectErrors,
  COLLECT_INITIAL,
  everyMinLabel,
  pathError,
  urlError,
  EVERY_MIN_OPTIONS,
  readCollectConfig,
  scheduleToJson,
  showDaysOf,
  showToJson,
  sourceOfKind,
  sourceToJson,
  unitOf,
  validateCollectConfig,
} from "./config";

const sql = (over: Record<string, unknown> = {}) => ({
  schedule: { mode: "interval", everyMin: 10 },
  source: { kind: "sql", sql: "SELECT LINE, CNT FROM T WHERE D = :today", keyField: "LINE", valueField: "CNT" },
  show: { days: 7, unit: "건" },
  ...over,
});

describe("readCollectConfig — 모양을 믿지 않고 읽는다", () => {
  it("비었거나 이상하면 interval 10분·sql 원천·7일", () => {
    for (const raw of [null, undefined, "x", [], {}, { schedule: 1, source: [], show: "x" }]) {
      const c = readCollectConfig(raw);
      expect(c.schedule).toEqual({ mode: "interval", everyMin: 10, at: [] });
      expect(c.source.kind).toBe("sql");
      expect(c.show).toEqual({ days: 7, unit: "" });
    }
  });

  it("initialConfig 는 검사 대상이 아닌 빈 SQL 만 걸린다", () => {
    expect(validateCollectConfig(COLLECT_INITIAL)).toEqual(["SQL 을 입력하세요", "값 컬럼을 입력하세요"]);
  });

  it("종류별 칸을 읽는다 — 통화는 대문자·중복 제거, 시각·항목은 공백 제거", () => {
    const c = readCollectConfig({
      schedule: { mode: "daily", at: [" 09:00 ", 5, "18:30"] },
      source: { kind: "exchange", currencies: ["usd", " eur ", "USD", 3] },
    });
    expect(c.schedule.at).toEqual(["09:00", "18:30"]);
    expect(c.source.currencies).toEqual(["USD", "EUR"]);
    const h = readCollectConfig({ source: { kind: "http", url: "https://a.b/x", items: [{ key: " 금 ", path: " a.b " }, "x"] } });
    expect(h.source.items).toEqual([{ key: "금", path: "a.b" }]);
  });

  it("everyMin·days 는 숫자 글자도 받는다", () => {
    expect(readCollectConfig({ schedule: { everyMin: "30" }, show: { days: "14" } })).toMatchObject({
      schedule: { everyMin: 30 },
      show: { days: 14 },
    });
  });

  it("showDaysOf·unitOf — 범위 밖이면 7일, 단위는 10자까지", () => {
    expect(showDaysOf(sql())).toBe(7);
    expect(showDaysOf({ show: { days: 30 } })).toBe(30);
    expect(showDaysOf({ show: { days: 91 } })).toBe(7);
    expect(showDaysOf({ show: { days: 2.5 } })).toBe(7);
    expect(unitOf({ show: { unit: "  원  " } })).toBe("원");
    // 읽기는 원래 글자를 지킨다(입력 중 끝 공백을 지우면 「a b」 를 칠 수 없다).
    expect(readCollectConfig({ show: { unit: "a " } }).show.unit).toBe("a ");
    expect(unitOf({ show: { unit: "가".repeat(12) } })).toHaveLength(10);
  });
});

describe("저장 모양으로 되돌리기", () => {
  it("방식·종류에 맞는 키만 남긴다", () => {
    expect(scheduleToJson({ mode: "daily", everyMin: 10, at: ["09:00"] })).toEqual({ mode: "daily", at: ["09:00"] });
    expect(scheduleToJson({ mode: "interval", everyMin: 30, at: ["09:00"] })).toEqual({ mode: "interval", everyMin: 30 });
    const base = readCollectConfig(sql()).source;
    expect(sourceToJson(base)).toEqual({ kind: "sql", sql: base.sql, valueField: "CNT", keyField: "LINE" });
    expect(sourceToJson({ ...base, keyField: "" })).not.toHaveProperty("keyField");
    expect(sourceToJson({ ...base, kind: "http", url: "https://a", items: [{ key: "k", path: "p" }] })).toEqual({
      kind: "http",
      url: "https://a",
      items: [{ key: "k", path: "p" }],
    });
    expect(sourceToJson({ ...base, kind: "exchange", currencies: ["USD"] })).toEqual({ kind: "exchange", currencies: ["USD"] });
    expect(showToJson({ days: 7, unit: "" })).toEqual({ days: 7 });
    expect(showToJson({ days: 7, unit: "건" })).toEqual({ days: 7, unit: "건" });
  });

  it("원천 종류를 바꾸면 이전 칸을 버리고 새 종류의 시작값으로(같은 종류면 그대로)", () => {
    const prev = readCollectConfig(sql()).source;
    expect(sourceOfKind("sql", prev)).toBe(prev);
    expect(sourceOfKind("exchange", prev)).toMatchObject({ kind: "exchange", sql: "", currencies: ["USD", "EUR", "JPY", "CNY"] });
    expect(sourceOfKind("http", prev)).toMatchObject({ kind: "http", sql: "", items: [{ key: "", path: "" }] });
    expect(sourceOfKind("sql", { ...prev, kind: "http" })).toMatchObject({ kind: "sql", sql: "", valueField: "" });
  });

  it("주기 글자", () => {
    expect(everyMinLabel(10)).toBe("10분");
    expect(everyMinLabel(60)).toBe("60분(1시간)");
    expect(everyMinLabel(1440)).toBe("1440분(24시간)");
  });
});

describe("검사 — 일정", () => {
  it("interval 주기는 허용 목록(1440 의 약수 13개)만", () => {
    expect(EVERY_MIN_OPTIONS).toHaveLength(13);
    for (const n of EVERY_MIN_OPTIONS) expect(validateCollectConfig(sql({ schedule: { mode: "interval", everyMin: n } }))).toEqual([]);
    for (const n of [1, 7, 45, 90, 2000]) {
      expect(collectErrors(sql({ schedule: { mode: "interval", everyMin: n } })).schedule).toEqual([
        "수집 주기는 5·10·15·20·30·60·120·180·240·360·480·720·1440분 중에서 고르세요",
      ]);
    }
  });

  it("daily 시각은 1~24개, HH:mm 실제 시각, 중복 없음", () => {
    const at = (list: unknown) => collectErrors(sql({ schedule: { mode: "daily", at: list } })).schedule;
    expect(at(["00:00", "23:59", "09:05"])).toEqual([]);
    expect(at([])).toEqual(["수집 시각을 1~24개 넣으세요"]);
    expect(at(Array.from({ length: 25 }, (_, i) => `${String(i % 24).padStart(2, "0")}:${i < 24 ? "00" : "30"}`))).toEqual([
      "수집 시각은 최대 24개까지 둘 수 있습니다",
    ]);
    expect(at(Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`))).toEqual([]);
    expect(at(["24:00"])).toEqual(["수집 시각 「24:00」 은 HH:mm(00:00~23:59) 형식이어야 합니다"]);
    expect(at(["9:00", "12:60", "ab", ""])).toHaveLength(4);
    expect(at(["09:00", "09:00"])).toEqual(["수집 시각 「09:00」 이 중복됩니다"]);
  });

  it("환율 원천의 주기는 60분 이상(interval 일 때만, daily 는 제한 없음)", () => {
    const ex = (schedule: unknown) => collectErrors({ ...sql({ schedule }), source: { kind: "exchange", currencies: ["USD"] } }).schedule;
    for (const n of [60, 120, 180, 240, 360, 480, 720, 1440]) expect(ex({ mode: "interval", everyMin: n })).toEqual([]);
    for (const n of [5, 10, 15, 20, 30]) {
      expect(ex({ mode: "interval", everyMin: n })).toEqual(["환율 원천은 주기마다 수집할 때 60분 이상으로 고르세요(더 자주 모으려면 매일 정해진 시각을 쓰세요)"]);
    }
    expect(ex({ mode: "daily", at: ["09:00", "09:01"] })).toEqual([]);
    // 다른 원천은 5분도 허용, 허용 목록 밖 주기는 환율에서도 기존 문구 하나만.
    expect(collectErrors(sql({ schedule: { mode: "interval", everyMin: 5 } })).schedule).toEqual([]);
    expect(ex({ mode: "interval", everyMin: 7 })).toHaveLength(1);
    expect(validateCollectConfig({ ...sql({ schedule: { mode: "interval", everyMin: 10 } }), source: { kind: "exchange", currencies: ["USD"] } })).toHaveLength(1);
  });

  it("알 수 없는 방식은 거절", () => {
    expect(collectErrors(sql({ schedule: { mode: "weekly" } })).schedule[0]).toContain("수집 방식을");
  });
});

describe("검사 — 원천", () => {
  const src = (source: Record<string, unknown>) => collectErrors(sql({ source })).source;

  it("sql — 필수 칸, 사용자 변수·입력 조건 금지, 허용 시스템 변수", () => {
    expect(src({ kind: "sql", sql: "", valueField: "" })).toEqual(["SQL 을 입력하세요", "값 컬럼을 입력하세요"]);
    expect(src({ kind: "sql", sql: "SELECT 1 AS V", valueField: "V" })).toEqual([]);
    expect(src({ kind: "sql", sql: "SELECT :today, :yesterday, :monthStart, :now FROM T", valueField: "V" })).toEqual([]);
    expect(src({ kind: "sql", sql: "SELECT :userId, :deptCd FROM T", valueField: "V" })).toEqual([
      "수집에는 사용자가 없어 :userId·:deptCd 를 쓸 수 없습니다",
    ]);
    expect(src({ kind: "sql", sql: "SELECT :dept, :x FROM T", valueField: "V" })).toEqual([
      "수집 SQL 에는 사용자 입력 조건(:dept, :x)을 쓸 수 없습니다",
    ]);
    // 리터럴·캐스트는 바인드가 아니다.
    expect(src({ kind: "sql", sql: "SELECT ':a', a::int FROM T", valueField: "V" })).toEqual([]);
  });

  it("http — 주소·항목", () => {
    const item = { key: "금", path: "data.items[0].price" };
    expect(src({ kind: "http", url: "https://api.example.com/x?a=1", items: [item] })).toEqual([]);
    expect(src({ kind: "http", url: "", items: [item] })).toEqual(["주소를 입력하세요"]);
    const notAbs = "주소는 http:// 또는 https:// 로 시작하는 절대 주소여야 합니다";
    expect(src({ kind: "http", url: "ftp://a.b", items: [item] })).toEqual([notAbs]);
    expect(src({ kind: "http", url: "/relative", items: [item] })).toEqual([notAbs]);
    expect(src({ kind: "http", url: "https://u:p@a.b/x", items: [item] })).toEqual(["주소에 사용자 정보(user:pw@)를 넣을 수 없습니다"]);
    expect(src({ kind: "http", url: "https://a.b", items: [] })).toEqual(["수집 항목을 1~20개 넣으세요"]);
    expect(src({ kind: "http", url: "https://a.b", items: Array.from({ length: 21 }, (_, i) => ({ key: `k${i}`, path: "a" })) })).toEqual([
      "수집 항목은 최대 20개까지 둘 수 있습니다",
    ]);
  });

  it("http 항목 — 이름 1~100자, 값 위치 형식", () => {
    const one = (i: Record<string, unknown>) => src({ kind: "http", url: "https://a.b", items: [i] });
    expect(one({ key: "", path: "a" })).toEqual(["수집 항목 1번의 이름을 입력하세요"]);
    expect(one({ key: "k".repeat(101), path: "a" })).toEqual(["수집 항목 1번의 이름은 100자 이하로 입력하세요"]);
    expect(one({ key: "k".repeat(100), path: "a" })).toEqual([]);
    expect(one({ key: "k", path: "" })).toEqual(["수집 항목 1번의 값 위치를 입력하세요"]);
    for (const ok of ["price", "data.price", "data.items[0].price", "[0].x", "a[1][2]", "시세.값", "a_b$c-d", "a[9999]", "a[0000]"]) {
      expect(one({ key: "k", path: ok })).toEqual([]);
    }
    for (const bad of ["a..b", ".a", "a.", "a[x]", "a[0", "a b", "a[]", "a/b", "a@b", "a:b", "a[10000]", "a[0]b", "a[-1]", "a[1.5]"]) {
      expect(one({ key: "k", path: bad })).toHaveLength(1);
    }
    expect(one({ key: "k", path: "a/b" })[0]).toContain("글자·숫자와 _ $ - 만");
  });

  it("값 위치 길이·조각 수 — 200자, 20조각까지", () => {
    expect(pathError("a".repeat(200))).toBeNull();
    expect(pathError("a".repeat(201))).not.toBeNull();
    const parts = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`).join(".");
    expect(pathError(parts(20))).toBeNull();
    expect(pathError(parts(21))).not.toBeNull();
    // 첨자도 한 조각으로 센다.
    expect(pathError(`${parts(19)}[0]`)).toBeNull();
    expect(pathError(`${parts(20)}[0]`)).not.toBeNull();
  });

  it("http 항목 이름이 겹치면 거절", () => {
    expect(src({ kind: "http", url: "https://a.b", items: [{ key: "금", path: "a" }, { key: "은", path: "b" }, { key: "금", path: "c" }] })).toEqual([
      "수집 항목 3번의 이름 「금」 이 중복됩니다",
    ]);
  });

  it("http 주소 — java.net.URI 가 받지 않는 글자·호스트를 거절한다", () => {
    const item = { key: "k", path: "a" };
    const url = (u: string) => src({ kind: "http", url: u, items: [item] });
    for (const ok of ["https://api.example.com/x?a=1&b=%EA%B0%80", "http://localhost:8080/p", "http://10.1.2.3/x", "https://[::1]:8443/x", "HTTPS://A.B/x#f", "  https://a.b/x  ", "https://a.b/가나?q=한글"]) {
      expect(url(ok)).toEqual([]);
    }
    for (const bad of ["https://a.b/x y", "https://a.b/x|y", "https://a.b/{x}", "https://a.b/x^y", "https://a.b/x\\y", "https://a.b/<x>", "https://a.b/x%zz", "https://a.b/x%2"]) {
      expect(url(bad)[0]).toContain("쓸 수 없는 글자");
    }
    for (const bad of ["https://my_host.example/x", "https://가나.kr/x", "https:///x", "https://", "https://a.b-/x", "https://-a.b/x", "https://a..b/x", "https://1.2.3/x", "https://999.1.1.1/x", "https://a.1/x", "https:a.b/x"]) {
      expect(url(bad)[0], bad).toContain("올바른 호스트");
    }
    expect(url("https://u@a.b/x")).toEqual(["주소에 사용자 정보(user:pw@)를 넣을 수 없습니다"]);
    expect(url("https://a.b/" + "x".repeat(488))).toEqual([]);
    expect(url("https://a.b/" + "x".repeat(489))).toEqual(["주소는 500자 이하로 입력하세요"]);
    expect(urlError("")).toBe("주소를 입력하세요");
  });

  it("sql 컬럼 이름은 100자까지(값·항목 컬럼)", () => {
    const sqlSrc = (f: Record<string, unknown>) => src({ kind: "sql", sql: "SELECT 1", valueField: "V", ...f });
    expect(sqlSrc({ valueField: "v".repeat(100), keyField: "k".repeat(100) })).toEqual([]);
    expect(sqlSrc({ valueField: "v".repeat(101) })).toEqual(["값 컬럼은 100자 이하로 입력하세요"]);
    expect(sqlSrc({ keyField: "k".repeat(101) })).toEqual(["항목 컬럼은 100자 이하로 입력하세요"]);
    expect(sqlSrc({ keyField: 5 })).toHaveLength(1);
    expect(sqlSrc({ keyField: null })).toEqual([]);
  });

  it("원천 종류가 없거나 모르면 거절하고, 환율 통화는 서버처럼 대문자만(중복 거절)", () => {
    expect(src({ kind: "ftp" })).toEqual(["원천 종류를 SQL·HTTP JSON·환율 중에서 고르세요"]);
    expect(src({})).toEqual(["원천 종류를 SQL·HTTP JSON·환율 중에서 고르세요"]);
    expect(src({ kind: "exchange", currencies: ["usd"] })).toEqual(["통화 코드가 올바르지 않습니다: usd"]);
    expect(src({ kind: "exchange", currencies: ["USD", "USD"] })).toEqual(["통화 USD 가 중복됩니다"]);
  });

  it("schedule·source 가 없는 설정은 읽기 기본값으로 가리지 않고 거절한다(서버 거절과 같다)", () => {
    const e = collectErrors({ show: { days: 7 } });
    expect(e.schedule).toEqual(["수집 일정이 아직 설정되지 않았습니다. 방식(주기마다·매일 정해진 시각)을 다시 골라 주세요"]);
    expect(e.source).toEqual(["수집 원천이 아직 설정되지 않았습니다. 원천 종류를 다시 골라 주세요"]);
    expect(validateCollectConfig(null)).toHaveLength(2);
    expect(validateCollectConfig({ schedule: [], source: "x" })).toHaveLength(2);
  });

  it("값은 서버처럼 JSON 형을 본다 — everyMin·days 는 숫자 글자를, at 은 글자 아닌 값을 거절", () => {
    expect(collectErrors(sql({ schedule: { mode: "interval", everyMin: "30" } })).schedule).toHaveLength(1);
    expect(collectErrors(sql({ schedule: { mode: "interval", everyMin: 30.5 } })).schedule).toHaveLength(1);
    expect(collectErrors(sql({ show: { days: "14" } })).show).toHaveLength(1);
    expect(collectErrors(sql({ show: { days: null, unit: null } })).show).toEqual([]);
    expect(collectErrors(sql({ show: "x" })).show).toEqual(["표시 설정 형식이 올바르지 않습니다"]);
    expect(collectErrors(sql({ schedule: { mode: "daily", at: [900] } })).schedule).toEqual(["수집 시각 「900」 은 HH:mm(00:00~23:59) 형식이어야 합니다"]);
    expect(collectErrors({ ...sql(), show: undefined }).show).toEqual([]);
  });

  it("exchange — 3자리 대문자 1~10개, KRW·중복 금지", () => {
    expect(src({ kind: "exchange", currencies: ["USD", "EUR"] })).toEqual([]);
    expect(src({ kind: "exchange", currencies: [] })).toEqual(["통화를 1~10개 고르세요"]);
    expect(src({ kind: "exchange", currencies: ["KRW"] })).toEqual(["기준 통화(KRW)는 대상 통화로 고를 수 없습니다"]);
    expect(src({ kind: "exchange", currencies: ["US"] })).toEqual(["통화 코드가 올바르지 않습니다: US"]);
    const eleven = ["USD", "EUR", "JPY", "CNY", "GBP", "AUD", "CAD", "CHF", "HKD", "SGD", "THB"];
    expect(src({ kind: "exchange", currencies: eleven })).toEqual(["통화는 최대 10개까지 고를 수 있습니다"]);
    expect(src({ kind: "exchange", currencies: eleven.slice(0, 10) })).toEqual([]);
  });
});

describe("검사 — 표시", () => {
  const show = (s: unknown) => collectErrors(sql({ show: s })).show;

  it("기간은 1~90 정수(비우면 통과), 단위는 10자까지", () => {
    expect(show({})).toEqual([]);
    expect(show({ days: 1, unit: "" })).toEqual([]);
    expect(show({ days: 90, unit: "가".repeat(10) })).toEqual([]);
    for (const d of [0, 91, 2.5, -3, "abc", NaN]) expect(show({ days: d })).toEqual(["표시 기간은 1~90일의 정수로 입력하세요"]);
    expect(show({ days: 7, unit: "가".repeat(11) })).toEqual(["단위는 공백을 포함해 10자 이하로 입력하세요"]);
    // 서버는 받은 값(trim 전) 길이로 본다 — 공백이 길이에 든다.
    expect(show({ unit: " ".repeat(10) + "건" })).toHaveLength(1);
    expect(show({ unit: "건" })).toEqual([]);
    expect(show({ unit: 5 })).toHaveLength(1);
  });
});

describe("validateCollectConfig — 칸 묶음을 합친 목록", () => {
  it("일정·원천·표시 순서로 합친다", () => {
    expect(
      validateCollectConfig({
        schedule: { mode: "interval", everyMin: 7 },
        source: { kind: "sql", sql: "", valueField: "V" },
        show: { days: 0 },
      })
    ).toEqual([
      "수집 주기는 5·10·15·20·30·60·120·180·240·360·480·720·1440분 중에서 고르세요",
      "SQL 을 입력하세요",
      "표시 기간은 1~90일의 정수로 입력하세요",
    ]);
  });
});
