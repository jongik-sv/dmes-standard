import { describe, expect, it } from "vitest";

import { meta as exchangeMeta } from "@/widget-types/exchange/type.meta";
import { meta as weatherMeta } from "@/widget-types/weather/type.meta";
import {
  addQuickLocation,
  coordText,
  daysOptions,
  EXCHANGE_CURRENCIES,
  EXCHANGE_INITIAL,
  exchangeRequest,
  parseCoord,
  patchConfig,
  QUICK_LOCATIONS,
  readExchangeConfig,
  readWeatherConfig,
  sameCoord,
  toggleCurrency,
  validLocations,
  validateExchangeConfig,
  validateWeatherConfig,
  WEATHER_INITIAL,
} from "@/widget-types/_ext/config";

describe("유형 메타 — initialConfig 가 계약과 같다", () => {
  it("환율: 8×10, { base: KRW, currencies: [USD,EUR,JPY,CNY], days: 30 }", () => {
    expect(exchangeMeta.id).toBe("exchange");
    expect(exchangeMeta.defaultSize).toEqual({ w: 8, h: 10 });
    expect(exchangeMeta.initialConfig).toEqual({ base: "KRW", currencies: ["USD", "EUR", "JPY", "CNY"], days: 30 });
    expect(exchangeMeta.initialConfig).toEqual(EXCHANGE_INITIAL);
  });

  it("날씨: 8×8, 서울 한 곳", () => {
    expect(weatherMeta.id).toBe("weather");
    expect(weatherMeta.defaultSize).toEqual({ w: 8, h: 8 });
    expect(weatherMeta.initialConfig).toEqual({ locations: [{ name: "서울", lat: 37.5665, lon: 126.978 }] });
    expect(weatherMeta.initialConfig).toEqual(WEATHER_INITIAL);
  });
});

describe("patchConfig — 편집기가 모르는 키를 지키며 바꾼다", () => {
  it("일부 키만 바꾸고 나머지는 그대로", () => {
    expect(patchConfig({ base: "KRW", days: 30, extra: 1 }, { days: 7 })).toEqual({ base: "KRW", days: 7, extra: 1 });
  });

  it("원본이 객체가 아니면 새 객체로 시작한다(원본은 건드리지 않는다)", () => {
    expect(patchConfig(null, { days: 7 })).toEqual({ days: 7 });
    const src = { days: 30 };
    patchConfig(src, { days: 7 });
    expect(src).toEqual({ days: 30 });
  });
});

describe("readExchangeConfig — 정의 설정 읽기(느슨하게)", () => {
  it("없거나 이상한 값이면 초기 설정", () => {
    expect(readExchangeConfig(null)).toEqual(EXCHANGE_INITIAL);
    expect(readExchangeConfig("x")).toEqual(EXCHANGE_INITIAL);
    expect(readExchangeConfig([])).toEqual(EXCHANGE_INITIAL);
    expect(readExchangeConfig({})).toEqual(EXCHANGE_INITIAL);
  });

  it("통화는 공백 제거·대문자·중복 제거, 문자열 아닌 값은 버린다", () => {
    expect(readExchangeConfig({ currencies: [" usd", "EUR", "usd", 3, null] }).currencies).toEqual(["USD", "EUR"]);
  });

  it("편집 중 비운 목록은 그대로 비어 있다(초기값으로 되돌리지 않는다)", () => {
    expect(readExchangeConfig({ currencies: [] }).currencies).toEqual([]);
  });

  it("days 는 숫자(숫자 문자열 포함), 아니면 30", () => {
    expect(readExchangeConfig({ days: 7 }).days).toBe(7);
    expect(readExchangeConfig({ days: "90" }).days).toBe(90);
    expect(readExchangeConfig({ days: "x" }).days).toBe(30);
  });

  it("초기 설정 객체를 되돌려 줘도 원본이 바뀌지 않는다", () => {
    const a = readExchangeConfig(null);
    a.currencies.push("GBP");
    expect(EXCHANGE_INITIAL.currencies).toEqual(["USD", "EUR", "JPY", "CNY"]);
  });
});

describe("validateExchangeConfig — 편집기 검사", () => {
  it("초기 설정은 통과", () => {
    expect(validateExchangeConfig(EXCHANGE_INITIAL)).toEqual([]);
  });

  it("통화가 0개면 오류", () => {
    expect(validateExchangeConfig({ base: "KRW", currencies: [], days: 30 })).toEqual(["통화를 하나 이상 고르세요"]);
  });

  it("통화는 10개까지(서버 한도)", () => {
    const eleven = [...EXCHANGE_CURRENCIES, "THB"] as string[];
    expect(validateExchangeConfig({ base: "KRW", currencies: eleven, days: 30 })).toEqual(["통화는 10개까지 고를 수 있습니다"]);
    expect(validateExchangeConfig({ base: "KRW", currencies: eleven.slice(0, 10), days: 30 })).toEqual([]);
  });

  it("통화 코드 형식이 틀리면 오류", () => {
    expect(validateExchangeConfig({ base: "KRW", currencies: ["US"], days: 30 })).toEqual(["통화 코드가 올바르지 않습니다: US"]);
  });

  it("기간은 1~90 정수", () => {
    const bad = ["기간은 1~90일 사이 정수여야 합니다"];
    expect(validateExchangeConfig({ base: "KRW", currencies: ["USD"], days: 0 })).toEqual(bad);
    expect(validateExchangeConfig({ base: "KRW", currencies: ["USD"], days: 91 })).toEqual(bad);
    expect(validateExchangeConfig({ base: "KRW", currencies: ["USD"], days: 1.5 })).toEqual(bad);
    expect(validateExchangeConfig({ base: "KRW", currencies: ["USD"], days: 1 })).toEqual([]);
    expect(validateExchangeConfig({ base: "KRW", currencies: ["USD"], days: 90 })).toEqual([]);
  });

  it("KRW 는 기준 통화라 대상 통화로 고를 수 없다(서버도 거절한다)", () => {
    expect(validateExchangeConfig({ base: "KRW", currencies: ["USD", "KRW"], days: 30 })).toEqual([
      "기준 통화(KRW)는 대상 통화로 고를 수 없습니다",
    ]);
  });

  it("기준 통화는 KRW 만", () => {
    expect(validateExchangeConfig({ base: "USD", currencies: ["EUR"], days: 30 })).toEqual(["기준 통화는 KRW 만 지원합니다"]);
  });

  it("원본이 객체가 아니어도 초기 설정으로 읽어 통과한다", () => {
    expect(validateExchangeConfig(null)).toEqual([]);
  });
});

describe("exchangeRequest — 서버에 보낼 값", () => {
  it("올바른 통화만, 중복 없이, 10개까지", () => {
    expect(exchangeRequest({ base: "KRW", currencies: ["USD", "US", "usd", "EUR"], days: 30 })).toEqual({
      symbols: ["USD", "EUR"],
      days: 30,
    });
    const many = EXCHANGE_CURRENCIES as readonly string[];
    expect(exchangeRequest({ base: "KRW", currencies: [...many], days: 30 }).symbols).toHaveLength(10);
  });

  it("KRW 는 빼고 보낸다", () => {
    expect(exchangeRequest({ base: "KRW", currencies: ["KRW", "USD"], days: 30 }).symbols).toEqual(["USD"]);
  });

  it("기간은 1~90 으로 맞춘다", () => {
    expect(exchangeRequest({ base: "KRW", currencies: ["USD"], days: 500 }).days).toBe(90);
    expect(exchangeRequest({ base: "KRW", currencies: ["USD"], days: 0 }).days).toBe(1);
    expect(exchangeRequest({ base: "KRW", currencies: ["USD"], days: 7.6 }).days).toBe(8);
  });
});

describe("toggleCurrency · daysOptions", () => {
  it("고르면 목록 순서(USD·EUR·JPY…)대로 들어간다", () => {
    expect(toggleCurrency(["USD", "JPY"], "EUR", true)).toEqual(["USD", "EUR", "JPY"]);
  });

  it("해제하면 빠진다", () => {
    expect(toggleCurrency(["USD", "EUR"], "USD", false)).toEqual(["EUR"]);
  });

  it("이미 있는 것을 또 고르면 그대로", () => {
    expect(toggleCurrency(["USD"], "USD", true)).toEqual(["USD"]);
  });

  it("목록에 없는 코드는 맨 뒤에 둔다", () => {
    expect(toggleCurrency(["USD", "XYZ"], "EUR", true)).toEqual(["USD", "EUR", "XYZ"]);
  });

  it("서버가 준 통화 순서(order)를 따라 정렬하고 그 밖의 코드는 맨 뒤에 둔다", () => {
    const order = ["EUR", "USD", "JPY"];
    expect(toggleCurrency(["JPY", "THB"], "USD", true, order)).toEqual(["USD", "JPY", "THB"]);
    expect(toggleCurrency(["USD"], "EUR", true, order)).toEqual(["EUR", "USD"]);
  });

  it("저장된 THB(편집기 목록에서 빠진 통화)는 유지되고 해제할 수도 있다", () => {
    expect(EXCHANGE_CURRENCIES as readonly string[]).not.toContain("THB");
    expect(toggleCurrency(["USD", "THB"], "EUR", true)).toEqual(["USD", "EUR", "THB"]);
    expect(toggleCurrency(["USD", "THB"], "THB", false)).toEqual(["USD"]);
    expect(validateExchangeConfig({ base: "KRW", currencies: ["USD", "THB"], days: 30 })).toEqual([]);
  });

  it("기간 선택지는 7·30·90, 설정값이 그 밖이면 함께 보인다", () => {
    expect(daysOptions(30)).toEqual([7, 30, 90]);
    expect(daysOptions(14)).toEqual([7, 14, 30, 90]);
    expect(daysOptions(Number.NaN)).toEqual([7, 30, 90]);
    expect(daysOptions(500)).toEqual([7, 30, 90]);
  });
});

describe("readWeatherConfig · validLocations", () => {
  it("없거나 이상한 값이면 초기 설정(서울)", () => {
    expect(readWeatherConfig(null)).toEqual(WEATHER_INITIAL);
    expect(readWeatherConfig({})).toEqual(WEATHER_INITIAL);
    expect(readWeatherConfig({ locations: "x" })).toEqual(WEATHER_INITIAL);
  });

  it("편집 중 비운 목록은 그대로 비어 있다", () => {
    expect(readWeatherConfig({ locations: [] }).locations).toEqual([]);
  });

  it("이름은 문자열, 좌표는 숫자(문자열 숫자 포함), 아니면 NaN 으로 보존한다", () => {
    const cfg = readWeatherConfig({
      locations: [
        { name: "인천", lat: "37.4563", lon: 126.7052 },
        { name: 3, lat: null, lon: "x" },
        "bad",
      ],
    });
    expect(cfg.locations[0]).toEqual({ name: "인천", lat: 37.4563, lon: 126.7052 });
    expect(cfg.locations[1].name).toBe("");
    expect(Number.isNaN(cfg.locations[1].lat)).toBe(true);
    expect(Number.isNaN(cfg.locations[1].lon)).toBe(true);
    expect(cfg.locations).toHaveLength(2);
  });

  it("validLocations 는 이름이 있고 좌표 범위 안인 지점만 남긴다", () => {
    const cfg = {
      locations: [
        { name: "서울", lat: 37.5, lon: 127 },
        { name: " ", lat: 37.5, lon: 127 },
        { name: "극점", lat: 91, lon: 0 },
        { name: "경계", lat: -90, lon: 180 },
        { name: "NaN", lat: Number.NaN, lon: 0 },
      ],
    };
    expect(validLocations(cfg).map((l) => l.name)).toEqual(["서울", "경계"]);
  });
});

describe("validateWeatherConfig — 편집기 검사", () => {
  it("초기 설정은 통과", () => {
    expect(validateWeatherConfig(WEATHER_INITIAL)).toEqual([]);
  });

  it("지점이 0개면 오류", () => {
    expect(validateWeatherConfig({ locations: [] })).toEqual(["지점을 하나 이상 넣으세요"]);
  });

  it("이름이 비면 오류", () => {
    expect(validateWeatherConfig({ locations: [{ name: "  ", lat: 37, lon: 127 }] })).toEqual(["지점 1: 이름을 입력하세요"]);
  });

  it("위도 −90~90, 경도 −180~180 밖이면 오류", () => {
    expect(validateWeatherConfig({ locations: [{ name: "A", lat: 90.1, lon: 0 }] })).toEqual(["지점 1: 위도는 -90~90 사이 숫자여야 합니다"]);
    expect(validateWeatherConfig({ locations: [{ name: "A", lat: 0, lon: -180.1 }] })).toEqual(["지점 1: 경도는 -180~180 사이 숫자여야 합니다"]);
    expect(validateWeatherConfig({ locations: [{ name: "A", lat: -90, lon: 180 }] })).toEqual([]);
  });

  it("숫자가 아닌 좌표도 오류, 지점마다 번호를 붙여 모두 알린다", () => {
    const errors = validateWeatherConfig({
      locations: [
        { name: "A", lat: 0, lon: 0 },
        { name: "", lat: Number.NaN, lon: 0 },
      ],
    });
    expect(errors).toEqual(["지점 2: 이름을 입력하세요", "지점 2: 위도는 -90~90 사이 숫자여야 합니다"]);
  });
});

describe("빠른 추가", () => {
  it("5곳이 스펙 좌표 그대로 있다", () => {
    expect(QUICK_LOCATIONS).toEqual([
      { name: "서울", lat: 37.5665, lon: 126.978 },
      { name: "인천", lat: 37.4563, lon: 126.7052 },
      { name: "포항", lat: 36.019, lon: 129.3435 },
      { name: "당진", lat: 36.8898, lon: 126.6458 },
      { name: "부산", lat: 35.1796, lon: 129.0756 },
    ]);
  });

  it("지점을 뒤에 더한다", () => {
    const next = addQuickLocation([{ name: "서울", lat: 37.5665, lon: 126.978 }], QUICK_LOCATIONS[1]);
    expect(next.map((l) => l.name)).toEqual(["서울", "인천"]);
  });

  it("같은 이름이 이미 있으면 더하지 않는다", () => {
    const base = [{ name: "서울", lat: 37.5665, lon: 126.978 }];
    expect(addQuickLocation(base, QUICK_LOCATIONS[0])).toBe(base);
  });

  it("더한 지점은 원본 프리셋과 다른 객체다", () => {
    const next = addQuickLocation([], QUICK_LOCATIONS[0]);
    expect(next[0]).toEqual(QUICK_LOCATIONS[0]);
    expect(next[0]).not.toBe(QUICK_LOCATIONS[0]);
  });
});

describe("좌표 입력 글자 ↔ 숫자", () => {
  it("parseCoord: 숫자 글자는 숫자, 비었거나 숫자가 아니면 NaN", () => {
    expect(parseCoord("37.5665")).toBe(37.5665);
    expect(parseCoord(" -12 ")).toBe(-12);
    expect(Number.isNaN(parseCoord(""))).toBe(true);
    expect(Number.isNaN(parseCoord("-"))).toBe(true);
    expect(Number.isNaN(parseCoord("37."))).toBe(false);
    expect(Number.isNaN(parseCoord("abc"))).toBe(true);
  });

  it("coordText: 숫자는 글자로, NaN 은 빈 글자", () => {
    expect(coordText(37.5665)).toBe("37.5665");
    expect(coordText(Number.NaN)).toBe("");
  });

  it("sameCoord: 입력 중인 글자와 값이 같은 뜻인지(입력 도중 글자를 덮어쓰지 않으려고)", () => {
    expect(sameCoord("37.", 37)).toBe(true);
    expect(sameCoord("37.50", 37.5)).toBe(true);
    expect(sameCoord("", Number.NaN)).toBe(true);
    expect(sameCoord("-", Number.NaN)).toBe(true);
    expect(sameCoord("37", 38)).toBe(false);
    expect(sameCoord("", 0)).toBe(false);
  });
});
