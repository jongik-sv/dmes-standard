/**
 * 날씨 위젯 지점별 값 캐시(스펙 2026-10-02-widget-admin-generic §8). 지점 탭을 오갈 때 서버를 다시 부르지 않고 받아 둔 값을 바로 그리려는 순수 함수들.
 * 캐시는 좌표별 값을 담고, 새로고침 번호(refreshKey)가 바뀌면 통째로 버린다.
 * @dk-oasis/shared 를 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */

export interface WeatherCache<T> {
  refreshKey: number;
  entries: Record<string, T>;
}

export function weatherCoordKey(lat: number, lon: number): string {
  return `${lat},${lon}`;
}

export function emptyWeatherCache<T>(refreshKey: number): WeatherCache<T> {
  return { refreshKey, entries: {} };
}

/** 캐시의 새로고침 번호가 현재와 다르면 비운 캐시를, 같으면 그대로(같은 참조) 돌려준다. */
export function syncWeatherCache<T>(cache: WeatherCache<T>, refreshKey: number): WeatherCache<T> {
  return cache.refreshKey === refreshKey ? cache : emptyWeatherCache<T>(refreshKey);
}

/** 이 좌표의 캐시된 값. 새로고침 번호가 다르면(옛 값) 없다고 본다. */
export function readWeatherCache<T>(cache: WeatherCache<T>, refreshKey: number, key: string): T | undefined {
  return cache.refreshKey === refreshKey ? cache.entries[key] : undefined;
}

/** 받은 값을 캐시에 넣는다(캐시 객체를 직접 바꾸고 돌려준다). 새로고침 번호가 다르면 먼저 비운다. */
export function writeWeatherCache<T>(cache: WeatherCache<T>, refreshKey: number, key: string, value: T): WeatherCache<T> {
  const target = syncWeatherCache(cache, refreshKey);
  target.entries[key] = value;
  return target;
}
