import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NETWORK_ERROR_MESSAGE,
  exchangeParams,
  fetchExchange,
  fetchWidgetOptions,
  fetchWeather,
  normalizeExchange,
  normalizeOptions,
  OPTIONS_TTL_MS,
  resetWidgetOptionsCache,
  normalizeWeather,
  unwrapPayload,
  weatherParams,
} from "@/widget-types/_ext/api";

const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
}

function sent(i = 0): { url: string; method: string; body: { meta: Record<string, unknown>; params: Record<string, unknown> } } {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, method: String(init.method), body: JSON.parse(String(init.body)) };
}

beforeEach(() => {
  resetWidgetOptionsCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unwrapPayload — OASIS 응답 봉투 해제", () => {
  it("data.result 안의 값을 펼친다", () => {
    expect(unwrapPayload({ meta: { success: true }, data: { result: { a: 1 } } })).toEqual({ result: { a: 1 }, a: 1 });
  });

  it("업무 거절(meta.success=false, HTTP 200)은 메시지를 담아 던진다", () => {
    expect(() => unwrapPayload({ meta: { success: false, message: "날씨 정보를 불러오지 못했습니다" } })).toThrow(
      "날씨 정보를 불러오지 못했습니다"
    );
  });

  it("메시지가 없는 거절도 던진다", () => {
    expect(() => unwrapPayload({ meta: { success: false } })).toThrow("요청이 거부되었습니다.");
  });

  it("빈 응답은 빈 객체", () => {
    expect(unwrapPayload(null)).toEqual({});
  });
});

describe("요청 params 모양", () => {
  it("환율: base 는 KRW, symbols 는 쉼표 문자열, days 는 숫자", () => {
    expect(exchangeParams(["USD", "EUR"], 30)).toEqual({ base: "KRW", symbols: "USD,EUR", days: 30 });
  });

  it("날씨: lat·lon 숫자", () => {
    expect(weatherParams(37.5665, 126.978)).toEqual({ lat: 37.5665, lon: 126.978 });
  });
});

describe("normalizeExchange", () => {
  it("latest·history 를 숫자·yyyy-MM-dd 로 맞춘다(문자열 숫자·yyyyMMdd 도 받는다)", () => {
    const r = normalizeExchange({
      latest: [{ cur: "usd", rate: "1380.5", diff: 3.5, date: "20260930" }],
      history: [{ date: "20260929", cur: "USD", rate: 1377 }],
      stale: true,
    });
    expect(r).toEqual({
      latest: [{ cur: "USD", rate: 1380.5, diff: 3.5, date: "2026-09-30" }],
      history: [{ date: "2026-09-29", cur: "USD", rate: 1377 }],
      stale: true,
      disabled: false,
    });
  });

  it("diff 가 없으면 null, 값이 없는 history 줄은 버린다", () => {
    const r = normalizeExchange({
      latest: [{ cur: "USD", rate: 1380.5, date: "2026-09-30" }, { rate: 1 }],
      history: [{ date: "2026-09-29", cur: "USD" }, { date: "bad", cur: "USD", rate: 1 }, { date: "2026-09-30", cur: "USD", rate: 1380.5 }],
    });
    expect(r.latest).toEqual([{ cur: "USD", rate: 1380.5, diff: null, date: "2026-09-30" }]);
    expect(r.history).toEqual([{ date: "2026-09-30", cur: "USD", rate: 1380.5 }]);
    expect(r.stale).toBe(false);
  });

  it("disabled 표시를 읽고, 응답이 비어 있어도 안전하다", () => {
    expect(normalizeExchange({ disabled: true })).toEqual({ latest: [], history: [], stale: false, disabled: true });
    expect(normalizeExchange({})).toEqual({ latest: [], history: [], stale: false, disabled: false });
  });

  it("empty(환율 마스터에 값 없음)는 true 일 때만 결과에 실리고 disabled 와 따로 읽는다", () => {
    expect(normalizeExchange({ empty: true })).toEqual({ latest: [], history: [], stale: false, disabled: false, empty: true });
    expect(normalizeExchange({ empty: "true", disabled: true })).toEqual({ latest: [], history: [], stale: false, disabled: true });
  });
});

describe("normalizeWeather", () => {
  it("current·daily 를 숫자로 맞춘다", () => {
    const r = normalizeWeather({
      current: { temp: 21.46, code: 2, wind: 10.8, humidity: 55 },
      daily: [
        { date: "2026-10-03", min: 12, max: 21, code: 3, pop: 10 },
        { date: "2026-10-04", min: "13", max: "22", code: "61", pop: null },
      ],
      stale: true,
    });
    expect(r.current).toEqual({ temp: 21.46, code: 2, wind: 10.8, humidity: 55 });
    expect(r.daily).toEqual([
      { date: "2026-10-03", min: 12, max: 21, code: 3, pop: 10 },
      { date: "2026-10-04", min: 13, max: 22, code: 61, pop: null },
    ]);
    expect(r.stale).toBe(true);
  });

  it("수집 시각·수집 대상 아님·값 없음 표지를 읽는다", () => {
    expect(normalizeWeather({ current: { temp: 1 }, daily: [], collectedAt: "2026-10-09T12:30" }).collectedAt).toBe("2026-10-09T12:30");
    expect(normalizeWeather({ current: null, daily: [], uncollected: true })).toEqual({
      current: null,
      daily: [],
      stale: false,
      collectedAt: null,
      uncollected: true,
      empty: false,
    });
    expect(normalizeWeather({ current: null, daily: [], empty: true })).toMatchObject({ current: null, uncollected: false, empty: true });
  });

  it("current 가 없고 표지도 없으면 모두 꺼진 빈 결과", () => {
    expect(normalizeWeather({})).toEqual({ current: null, daily: [], stale: false, collectedAt: null, uncollected: false, empty: false });
  });

  it("날짜가 없는 예보 줄은 버린다", () => {
    expect(normalizeWeather({ current: { temp: 1 }, daily: [{ min: 1 }] }).daily).toEqual([]);
  });
});

describe("fetchExchange · fetchWeather — 호출", () => {
  it("환율: POST /api/mcm/oasis/widgetExt/exchange 로 params 를 보내고 결과를 풀어 준다", async () => {
    reply({
      meta: { success: true },
      data: {
        result: {
          latest: [{ cur: "USD", rate: 1380.5, diff: 3.5, date: "20260930" }],
          history: [{ date: "20260930", cur: "USD", rate: 1380.5 }],
        },
      },
    });
    const r = await fetchExchange(["USD", "EUR"], 30);
    const req = sent();
    expect(req.url).toBe("/api/mcm/oasis/widgetExt/exchange");
    expect(req.method).toBe("POST");
    expect(req.body.params).toEqual({ base: "KRW", symbols: "USD,EUR", days: 30 });
    expect(r.latest[0]).toEqual({ cur: "USD", rate: 1380.5, diff: 3.5, date: "2026-09-30" });
    expect(r.history).toHaveLength(1);
  });

  it("날씨: POST /api/mcm/oasis/widgetExt/weather", async () => {
    reply({
      meta: { success: true },
      data: { result: { current: { temp: 20, code: 0, wind: 7.2, humidity: 40 }, daily: [] } },
    });
    const r = await fetchWeather(37.5665, 126.978);
    const req = sent();
    expect(req.url).toBe("/api/mcm/oasis/widgetExt/weather");
    expect(req.body.params).toEqual({ lat: 37.5665, lon: 126.978 });
    expect(r.current?.temp).toBe(20);
  });

  it("업무 거절은 메시지와 함께 던진다", async () => {
    reply({ meta: { success: false, message: "날씨 정보를 불러오지 못했습니다" } });
    await expect(fetchWeather(1, 2)).rejects.toThrow("날씨 정보를 불러오지 못했습니다");
  });

  it("HTTP 오류도 던진다", async () => {
    reply({ message: "권한이 없습니다." }, 403);
    await expect(fetchExchange(["USD"], 7)).rejects.toThrow("권한이 없습니다.");
  });
});

describe("네트워크 실패 — 브라우저 영어 문구 대신 한국어", () => {
  it.each(["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."])(
    "환율: fetch 가 TypeError(%s)로 실패하면 한국어 문구로 던진다",
    async (browserMessage) => {
      fetchMock.mockRejectedValueOnce(new TypeError(browserMessage));
      const err = await fetchExchange(["USD"], 7).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("환율 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      expect((err as Error).message).not.toContain(browserMessage);
    }
  );

  it("날씨: 같은 경우 날씨 문구로 던진다", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchWeather(1, 2)).rejects.toThrow(NETWORK_ERROR_MESSAGE.weather);
  });

  it("서버가 보낸 거절 문구는 바꾸지 않는다(업무 거절·HTTP 오류)", async () => {
    reply({ meta: { success: false, message: "정의에 없는 통화입니다: JPY" } });
    await expect(fetchExchange(["JPY"], 7)).rejects.toThrow("정의에 없는 통화입니다: JPY");
    reply({ message: "요청이 너무 잦습니다. 잠시 뒤 다시 시도하세요." }, 429);
    await expect(fetchExchange(["USD"], 7)).rejects.toThrow("요청이 너무 잦습니다. 잠시 뒤 다시 시도하세요.");
  });
});

describe("편집기 선택지(widgetExt/options)", () => {
  const OK = { meta: { success: true }, data: { result: { currencies: ["USD", "EUR"], places: [{ name: "서울", lat: 37.57, lon: 126.98 }] } } };

  it("normalizeOptions — 통화는 대문자 3자리·KRW 제외·중복 없이, 지점은 이름·좌표 범위를 지킨 것만", () => {
    expect(
      normalizeOptions({
        currencies: ["usd", " EUR ", "KRW", "ABCD", "USD", 3, null],
        places: [
          { name: " 서울 ", lat: "37.57", lon: 126.98 },
          { name: "서울", lat: 1, lon: 1 },
          { name: "", lat: 1, lon: 1 },
          { name: "범위밖", lat: 91, lon: 0 },
          { name: "좌표없음", lat: 1 },
          "x",
        ],
      }),
    ).toEqual({ currencies: ["USD", "EUR"], places: [{ name: "서울", lat: 37.57, lon: 126.98 }] });
  });

  it("normalizeOptions — 응답이 비었거나 모양이 틀리면 빈 목록", () => {
    expect(normalizeOptions({})).toEqual({ currencies: [], places: [] });
    expect(normalizeOptions({ currencies: "USD", places: { a: 1 } })).toEqual({ currencies: [], places: [] });
  });

  it("options 호출 — widgetExt/options 에 params 없이 보내고 결과를 정리해 준다", async () => {
    reply(OK);
    await expect(fetchWidgetOptions()).resolves.toEqual({ currencies: ["USD", "EUR"], places: [{ name: "서울", lat: 37.57, lon: 126.98 }] });
    expect(sent().url).toBe("/api/mcm/oasis/widgetExt/options");
    expect(sent().body).toEqual({ meta: { menuId: "HOME" }, params: {} });
  });

  it("TTL 안에서는 다시 부르지 않고, 지나면 다시 부른다", async () => {
    reply(OK);
    reply(OK);
    await fetchWidgetOptions(1_000);
    await fetchWidgetOptions(1_000 + OPTIONS_TTL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchWidgetOptions(1_000 + OPTIONS_TTL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("실패는 캐시하지 않아 다음 호출이 다시 서버를 부른다", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchWidgetOptions(1_000)).rejects.toThrow(NETWORK_ERROR_MESSAGE.options);
    reply(OK);
    await expect(fetchWidgetOptions(1_001)).resolves.toMatchObject({ currencies: ["USD", "EUR"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
