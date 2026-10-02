/**
 * WMO 날씨 코드표(스펙 §8.2 — 코드 → 이름·아이콘은 렌더러가 갖는다).
 * 아이콘은 키 문자열만 돌려준다 — 실제 그림(@tabler/icons-react)은 weather/renderer.tsx 가 고른다.
 * 0 맑음, 1~3 구름, 45·48 안개, 51~57 이슬비, 61~67 비, 71~77 눈, 80~82 소나기, 85·86 소낙눈, 95~99 뇌우.
 */
export type WeatherIconKey = "sun" | "cloud" | "fog" | "rain" | "snow" | "storm" | "unknown";

export interface WeatherCodeInfo {
  name: string;
  icon: WeatherIconKey;
}

const UNKNOWN: WeatherCodeInfo = { name: "알 수 없음", icon: "unknown" };

/** [시작, 끝(포함), 정보] — 구간 밖은 알 수 없음. */
const RANGES: ReadonlyArray<readonly [number, number, WeatherCodeInfo]> = [
  [0, 0, { name: "맑음", icon: "sun" }],
  [1, 3, { name: "구름", icon: "cloud" }],
  [45, 45, { name: "안개", icon: "fog" }],
  [48, 48, { name: "안개", icon: "fog" }],
  [51, 57, { name: "이슬비", icon: "rain" }],
  [61, 67, { name: "비", icon: "rain" }],
  [71, 77, { name: "눈", icon: "snow" }],
  [80, 82, { name: "소나기", icon: "rain" }],
  [85, 86, { name: "소낙눈", icon: "snow" }],
  [95, 99, { name: "뇌우", icon: "storm" }],
];

export function weatherCodeInfo(code: unknown): WeatherCodeInfo {
  const n = typeof code === "string" && code.trim() !== "" ? Number(code) : code;
  if (typeof n !== "number" || !Number.isInteger(n)) return { ...UNKNOWN };
  for (const [from, to, info] of RANGES) {
    if (n >= from && n <= to) return { ...info };
  }
  return { ...UNKNOWN };
}
