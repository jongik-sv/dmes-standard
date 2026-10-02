import { describe, expect, it } from "vitest";

import {
  emptyWeatherCache,
  readWeatherCache,
  syncWeatherCache,
  weatherCoordKey,
  writeWeatherCache,
} from "@/widget-types/_ext/weather-cache";

describe("날씨 지점 캐시", () => {
  it("좌표 키는 위도,경도", () => {
    expect(weatherCoordKey(37.5, 127)).toBe("37.5,127");
  });

  it("같은 새로고침 번호에서는 받아 둔 값을 돌려준다", () => {
    const cache = writeWeatherCache(emptyWeatherCache<string>(0), 0, "a", "값A");
    expect(readWeatherCache(cache, 0, "a")).toBe("값A");
    expect(readWeatherCache(cache, 0, "b")).toBeUndefined();
  });

  it("새로고침 번호가 다르면 옛 값은 없다고 본다", () => {
    const cache = writeWeatherCache(emptyWeatherCache<string>(0), 0, "a", "값A");
    expect(readWeatherCache(cache, 1, "a")).toBeUndefined();
  });

  it("syncWeatherCache — 같으면 같은 참조, 다르면 비운 새 캐시", () => {
    const cache = writeWeatherCache(emptyWeatherCache<string>(0), 0, "a", "값A");
    expect(syncWeatherCache(cache, 0)).toBe(cache);
    const next = syncWeatherCache(cache, 2);
    expect(next).not.toBe(cache);
    expect(next).toEqual({ refreshKey: 2, entries: {} });
  });

  it("옛 번호 캐시에 쓰면 비우고 새 번호로 넣는다", () => {
    const old = writeWeatherCache(emptyWeatherCache<string>(0), 0, "a", "값A");
    const next = writeWeatherCache(old, 1, "b", "값B");
    expect(next).toEqual({ refreshKey: 1, entries: { b: "값B" } });
  });
});
