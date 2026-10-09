"use client";

import { useEffect, useState } from "react";

import { fetchWidgetOptions } from "./api";
import { EXCHANGE_CURRENCIES, QUICK_LOCATIONS, type WeatherLocation } from "./config";

export interface EditorOptions {
  /** 통화 선택지 — 서버(환율 마스터 칼럼 라벨) 값, 못 읽거나 비면 고정 목록. */
  currencies: readonly string[];
  /** 날씨 빠른 추가 지점 — 서버(수집 작업) 값, 못 읽거나 비면 고정 목록. */
  places: readonly WeatherLocation[];
}

const FALLBACK: EditorOptions = { currencies: EXCHANGE_CURRENCIES, places: QUICK_LOCATIONS };

/**
 * 위젯 편집기 선택지. 처음엔 고정 목록을 보이고, 서버 값이 오면 바꾼다(실패·빈 목록이면 고정 목록 그대로).
 * 서버 호출은 {@link fetchWidgetOptions} 가 잠시 캐시한다.
 */
export function useWidgetOptions(): EditorOptions {
  const [options, setOptions] = useState<EditorOptions>(FALLBACK);
  useEffect(() => {
    let alive = true;
    fetchWidgetOptions()
      .then((o) => {
        if (!alive) return;
        setOptions({
          currencies: o.currencies.length > 0 ? o.currencies : FALLBACK.currencies,
          places: o.places.length > 0 ? o.places : FALLBACK.places,
        });
      })
      .catch(() => {
        /* 서버 선택지를 못 읽어도 편집은 고정 목록으로 이어 간다. */
      });
    return () => {
      alive = false;
    };
  }, []);
  return options;
}
