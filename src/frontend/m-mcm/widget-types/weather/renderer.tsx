"use client";

/**
 * 날씨 위젯 렌더러 — 지점별 현재 기온·날씨 아이콘·바람·습도와 3일 예보. 스펙 2026-10-02-widget-admin-generic §6·§8.
 * 지점이 둘 이상이면 위쪽 작은 탭으로 고른다(고른 지점만 서버에 묻고, 받은 값은 탭을 오가도 기억한다).
 * 데이터는 widgetExt/weather. 코드 → 이름·아이콘은 _ext/weather-codes, 서식은 _ext/format.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconCloud,
  IconCloudFog,
  IconCloudRain,
  IconCloudSnow,
  IconCloudStorm,
  IconDroplet,
  IconQuestionMark,
  IconSun,
  IconWind,
  type Icon,
} from "@tabler/icons-react";
import { Badge } from "@dk-oasis/shared/form";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";
import { useWidgetStatus, WidgetTitleExtra, type WidgetProps } from "@dk-oasis/shared/widget";

import { fetchWeather } from "@/widget-types/_ext/api";
import { readWeatherConfig, validLocations } from "@/widget-types/_ext/config";
import { formatCollectedAt, formatHumidity, formatPop, formatRange, formatTemp, formatWind, weekdayLabel } from "@/widget-types/_ext/format";
import { EXT_CSS, EXT_STYLE_HREF } from "@/widget-types/_ext/styles";
import type { WeatherResult } from "@/widget-types/_ext/types";
import {
  emptyWeatherCache,
  readWeatherCache,
  syncWeatherCache,
  weatherCoordKey,
  writeWeatherCache,
  type WeatherCache,
} from "@/widget-types/_ext/weather-cache";
import { weatherCodeInfo, type WeatherIconKey } from "@/widget-types/_ext/weather-codes";

const LOAD_ERROR = "날씨 정보를 불러오지 못했습니다";
/** 예보 줄 수(스펙: 3일 예보). */
const FORECAST_DAYS = 3;

const ICONS: Record<WeatherIconKey, Icon> = {
  sun: IconSun,
  cloud: IconCloud,
  fog: IconCloudFog,
  rain: IconCloudRain,
  snow: IconCloudSnow,
  storm: IconCloudStorm,
  unknown: IconQuestionMark,
};

export default function WeatherWidget({ definition, refreshKey }: WidgetProps) {
  const setStatus = useWidgetStatus();
  const locations = useMemo(() => validLocations(readWeatherConfig(definition)), [definition]);
  const [active, setActive] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState<Record<string, WeatherResult>>({});
  // 좌표별로 받아 둔 값 — 탭을 오갈 때 서버를 다시 부르지 않는다. 새로고침(refreshKey)이 바뀌면 비운다.
  const cacheRef = useRef<WeatherCache<WeatherResult>>(emptyWeatherCache(refreshKey));

  // 지점이 줄어 고른 탭이 없어졌으면 마지막 지점으로.
  const idx = Math.max(0, Math.min(active, locations.length - 1));
  const loc = locations[idx];
  const lat = loc?.lat;
  const lon = loc?.lon;

  const tabItems = useMemo<TabItem[]>(() => locations.map((l, i) => ({ key: String(i), label: l.name })), [locations]);

  useEffect(() => {
    if (lat === undefined || lon === undefined) {
      setStatus({ kind: "ready" });
      return;
    }
    const key = weatherCoordKey(lat, lon);
    cacheRef.current = syncWeatherCache(cacheRef.current, refreshKey);
    const cached = readWeatherCache(cacheRef.current, refreshKey, key);
    if (cached) {
      setResults((prev) => (prev[key] === cached ? prev : { ...prev, [key]: cached }));
      setStatus({ kind: "ready" });
      return;
    }
    let cancelled = false;
    setStatus({ kind: "loading" });
    fetchWeather(lat, lon)
      .then((r) => {
        if (cancelled) return;
        cacheRef.current = writeWeatherCache(cacheRef.current, refreshKey, key, r);
        setResults((prev) => ({ ...prev, [key]: r }));
        setStatus({ kind: "ready" });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus({ kind: "error", message: LOAD_ERROR, retry: () => setAttempt((a) => a + 1) });
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, refreshKey, attempt, setStatus]);

  const result = lat === undefined || lon === undefined ? undefined : results[weatherCoordKey(lat, lon)];
  const current = result?.current ?? null;
  const info = weatherCodeInfo(current?.code);
  const NowIcon = ICONS[info.icon];

  return (
    <div className="mcm-wx" data-testid="widget-weather">
      <style href={EXT_STYLE_HREF} precedence="default">
        {EXT_CSS}
      </style>
      {result?.stale && (
        <WidgetTitleExtra>
          <Badge tone="warning" label="갱신 실패" title="날씨를 새로 수집하지 못해 이전에 모은 값을 보여 줍니다" />
        </WidgetTitleExtra>
      )}
      {locations.length > 1 && <Tabs items={tabItems} activeKey={String(idx)} onChange={(k) => setActive(Number(k))} />}
      {!loc ? (
        <div className="mcm-ext__state">표시할 지점이 없습니다</div>
      ) : !result ? null : !current ? (
        <div className="mcm-ext__state" data-testid="widget-weather-empty">
          {result.uncollected
            ? `${loc.name}은(는) 날씨 수집 대상이 아닙니다. 예약 작업에 날씨 수집 작업(mcm.weather.*)을 추가하세요`
            : result.empty
              ? "수집된 날씨가 아직 없습니다. 날씨 수집 작업이 실행되면 표시됩니다"
              : "표시할 날씨 정보가 없습니다"}
        </div>
      ) : (
        <>
          <div className="mcm-wx__now">
            <span className="mcm-wx__icon" role="img" aria-label={info.name}>
              <NowIcon size={32} aria-hidden="true" />
            </span>
            <div>
              <div className="mcm-wx__name">{loc.name}</div>
              <div className="mcm-wx__temp" data-testid="widget-weather-temp">
                {formatTemp(current.temp)}
              </div>
              <div className="mcm-wx__desc">{info.name}</div>
            </div>
            <div className="mcm-wx__meta">
              <span>
                <IconWind size={14} aria-hidden="true" />
                바람 {formatWind(current.wind)}
              </span>
              <span>
                <IconDroplet size={14} aria-hidden="true" />
                습도 {formatHumidity(current.humidity)}
              </span>
            </div>
          </div>
          <ul className="mcm-wx__days" aria-label="3일 예보">
            {result.daily.slice(0, FORECAST_DAYS).map((d) => {
              const dayInfo = weatherCodeInfo(d.code);
              const DayIcon = ICONS[dayInfo.icon];
              return (
                <li key={d.date} className="mcm-wx__day" title={`${d.date} ${dayInfo.name}`}>
                  <b>{weekdayLabel(d.date)}</b>
                  <DayIcon className="mcm-wx__day-icon" size={20} aria-hidden="true" />
                  <span>{formatRange(d.min, d.max)}</span>
                  <span>강수 {formatPop(d.pop)}</span>
                </li>
              );
            })}
          </ul>
          {result.collectedAt && (
            <div className="mcm-wx__desc" data-testid="widget-weather-collected-at">
              {formatCollectedAt(result.collectedAt)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
