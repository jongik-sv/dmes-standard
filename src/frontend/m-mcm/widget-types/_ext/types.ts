/**
 * 환율·날씨 위젯 공용 타입(스펙 2026-10-02-widget-admin-generic §5.1·§8). 서버 응답을 api.ts 가 이 모양으로 맞춰 준다.
 * @dk-oasis/shared 를 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */

/** 통화별 최신 값. diff = 최근 값 − 그 전 값(1 단위 기준, 없으면 null). */
export interface ExchangeLatest {
  cur: string;
  rate: number | null;
  diff: number | null;
  /** yyyy-MM-dd */
  date: string | null;
}

export interface ExchangeHistoryPoint {
  /** yyyy-MM-dd */
  date: string;
  cur: string;
  rate: number;
}

export interface ExchangeResult {
  latest: ExchangeLatest[];
  history: ExchangeHistoryPoint[];
  /** 제공자 호출 실패로 DB 에 있던 값만 돌려준 경우. */
  stale: boolean;
  /** 서버가 외부 연결을 끈 경우(dmes.widget.ext.enabled=false). */
  disabled: boolean;
  /** MDM 환율 마스터(FX_RATE)에 요청 범위의 값이 하나도 없는 경우(예약 작업 mdm.exchangeRateSync 확인). 값이 있으면 생략된다. */
  empty?: boolean;
}

export interface WeatherCurrent {
  temp: number | null;
  /** WMO 날씨 코드 */
  code: number | null;
  /** Open-Meteo 기본 단위 km/h */
  wind: number | null;
  humidity: number | null;
}

export interface WeatherDaily {
  /** yyyy-MM-dd */
  date: string;
  min: number | null;
  max: number | null;
  code: number | null;
  /** 강수확률 % */
  pop: number | null;
}

export interface WeatherResult {
  current: WeatherCurrent | null;
  daily: WeatherDaily[];
  stale: boolean;
  disabled: boolean;
}

/** 표(AgDataGrid) 한 줄 — 서식까지 끝낸 값. type 별칭이라 Record<string, unknown> 로 넘길 수 있다. */
export type ExchangeRow = {
  cur: string;
  /** "1 USD" · "100 JPY" */
  label: string;
  rateText: string;
  diffText: string;
  dir: "up" | "down" | "flat" | "none";
  /** 추이 점(날짜 오름차순, 표시 단위 기준) */
  spark: number[];
  /** 기준일 yyyy-MM-dd */
  date: string | null;
};
