/**
 * crontab 5칸 식(`분 시 일 월 요일`) 해석 — 입력 중 즉시 오류를 보이는 브라우저 계산기.
 * 설명·다음 예정·최종 검사는 서버(`cronPreview`)가 정본이다.
 * 규칙(설계 문서 §4.0): `*`·`,`·`-`·`/`, 월·요일 영문 이름, 요일 0·7=일요일, 매크로(@daily 등).
 * `?`·`L`·`W`·`#`·6칸 식은 거절하고, 일과 요일을 함께 제한한 식도 거절한다.
 * 시간대는 브라우저 시간대를 쓴다(서버 미리보기가 Asia/Seoul 정본).
 */

export interface ParsedCron {
  /** 정규화한 5칸 원문(매크로는 풀어 쓴 식). */
  fields: [string, string, string, string, string];
  min: boolean[];
  hour: boolean[];
  /** 1~31 (0번 칸은 쓰지 않는다). */
  dom: boolean[];
  /** 1~12 (0번 칸은 쓰지 않는다). */
  mon: boolean[];
  /** 0(일)~6(토). */
  dow: boolean[];
}

export type CronResult = { ok: true; cron: ParsedCron } | { ok: false; error: string };

const MACROS: Record<string, string> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
};

const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DOW_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
export const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];

const FIELD_LABELS = ["분", "시", "일", "월", "요일"];

class CronError extends Error {}

function parseField(text: string, label: string, lo: number, hi: number, names?: string[], nameBase = 0): boolean[] {
  const out = new Array<boolean>(hi + 1).fill(false);
  if (/[?#]/.test(text) || /\d[LW]/i.test(text) || /^(L|LW)$/i.test(text)) {
    throw new CronError("? L W # 는 crontab 에 없는 문법이라 쓸 수 없습니다.");
  }
  const bad = () => new CronError(`${label} 칸 값이 올바르지 않습니다(${lo}~${hi === 7 ? 6 : hi}).`);
  const value = (s: string): number => {
    if (names && /^[A-Za-z]{3}$/.test(s)) {
      const idx = names.indexOf(s.toUpperCase());
      if (idx < 0) throw bad();
      return idx + nameBase;
    }
    if (!/^\d+$/.test(s)) throw bad();
    return Number(s);
  };
  for (const part of text.split(",")) {
    if (part === "") throw bad();
    const [rangeText, stepText, extra] = part.split("/");
    if (extra !== undefined) throw bad();
    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText) || Number(stepText) < 1) throw bad();
      step = Number(stepText);
    }
    let a: number;
    let b: number;
    if (rangeText === "*") {
      a = lo;
      b = hi === 7 ? 6 : hi;
    } else if (rangeText.includes("-")) {
      const [s, e, more] = rangeText.split("-");
      if (more !== undefined || s === "" || e === "") throw bad();
      a = value(s);
      b = value(e);
    } else {
      a = value(rangeText);
      b = stepText !== undefined ? (hi === 7 ? 6 : hi) : a;
    }
    if (a < lo || b > hi || a > b) throw bad();
    for (let v = a; v <= b; v += step) out[v] = true;
  }
  return out;
}

/** 직접 입력 다섯 칸의 정의 — 이름표·허용 범위·짧은 예. */
export const CRON_FIELD_SPECS = [
  { label: "분", range: "0-59", example: "*/5, 0,30" },
  { label: "시", range: "0-23", example: "9-18, 0,12" },
  { label: "일", range: "1-31", example: "1, 1,15" },
  { label: "월", range: "1-12", example: "*/3, 1,7" },
  { label: "요일", range: "0-6 (일=0)", example: "1-5, 0,6" },
] as const;

const FIELD_RULES: [number, number, string[]?, number?][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12, MONTH_NAMES, 1],
  [0, 7, DOW_NAMES, 0],
];

/** 한 칸의 글자가 올바르면 null, 아니면 그 칸의 오류 문구(칸 이름 없이). */
export function validateFieldText(index: number, text: string): string | null {
  const value = text.trim();
  if (value === "") return "값을 입력하세요.";
  const [lo, hi, names, nameBase] = FIELD_RULES[index];
  try {
    parseField(value, FIELD_LABELS[index], lo, hi, names, nameBase);
    return null;
  } catch (e) {
    const message = e instanceof CronError ? e.message : "값이 올바르지 않습니다.";
    return message.startsWith(`${FIELD_LABELS[index]} 칸 `) ? message.slice(FIELD_LABELS[index].length + 3) : message;
  }
}

/** 통째로 붙여 넣은 글자를 다섯 칸으로 나눈다. 5칸 식이나 매크로가 아니면 null. */
export function splitExpression(text: string): string[] | null {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const macro = MACROS[trimmed.toLowerCase()];
  const tokens = (macro ?? trimmed).split(" ");
  return tokens.length === 5 && tokens.every((t) => t !== "") ? tokens : null;
}

export function parseCron(input: string): CronResult {
  let text = input.trim().replace(/\s+/g, " ");
  if (text === "") return { ok: false, error: "crontab 식을 입력하세요." };
  const macro = MACROS[text.toLowerCase()];
  if (macro) text = macro;
  const fields = text.split(" ");
  if (fields.length !== 5) {
    return { ok: false, error: "5칸(분 시 일 월 요일)으로 입력하세요. 초 칸이 있는 6칸 식은 쓸 수 없습니다." };
  }
  try {
    const min = parseField(fields[0], FIELD_LABELS[0], 0, 59);
    const hour = parseField(fields[1], FIELD_LABELS[1], 0, 23);
    const dom = parseField(fields[2], FIELD_LABELS[2], 1, 31);
    const mon = parseField(fields[3], FIELD_LABELS[3], 1, 12, MONTH_NAMES, 1);
    const dowRaw = parseField(fields[4], FIELD_LABELS[4], 0, 7, DOW_NAMES, 0);
    const dow = dowRaw.slice(0, 7);
    if (dowRaw[7]) dow[0] = true;
    if (fields[2] !== "*" && fields[4] !== "*") {
      return { ok: false, error: "일과 요일 중 하나는 * 로 두세요." };
    }
    return { ok: true, cron: { fields: fields as ParsedCron["fields"], min, hour, dom, mon, dow } };
  } catch (e) {
    return { ok: false, error: e instanceof CronError ? e.message : "crontab 식을 읽을 수 없습니다." };
  }
}

/** direction=1 이면 `from` 다음 분부터 앞으로, -1 이면 `from` 직전 분부터 뒤로 count 개의 실행 시각을 찾는다. */
export function runTimes(cron: ParsedCron, from: Date, count: number, direction: 1 | -1 = 1): Date[] {
  const result: Date[] = [];
  const t = new Date(from.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + direction);
  const limit = from.getTime() + direction * 4 * 366 * 24 * 3600 * 1000;
  let guard = 0;
  while (result.length < count && guard++ < 200000) {
    if ((limit - t.getTime()) * direction < 0) break;
    const y = t.getFullYear();
    const mo = t.getMonth();
    const d = t.getDate();
    const h = t.getHours();
    const mi = t.getMinutes();
    if (!cron.mon[mo + 1]) {
      t.setTime((direction > 0 ? new Date(y, mo + 1, 1, 0, 0) : new Date(y, mo, 0, 23, 59)).getTime());
    } else if (!cron.dom[d] || !cron.dow[t.getDay()]) {
      t.setTime((direction > 0 ? new Date(y, mo, d + 1, 0, 0) : new Date(y, mo, d - 1, 23, 59)).getTime());
    } else if (!cron.hour[h]) {
      t.setTime((direction > 0 ? new Date(y, mo, d, h + 1, 0) : new Date(y, mo, d, h - 1, 59)).getTime());
    } else if (!cron.min[mi]) {
      t.setTime(new Date(y, mo, d, h, mi + direction).getTime());
    } else {
      result.push(new Date(t.getTime()));
      t.setMinutes(t.getMinutes() + direction);
    }
  }
  return result;
}

/** 식이 올바르면 null, 아니면 오류 문구. minGapMin 을 주면 앞으로의 실행 간격이 그보다 짧은 식도 거절한다(수집 작업 하한). */
export function validateCron(expr: string, minGapMin?: number): string | null {
  const parsed = parseCron(expr);
  if (!parsed.ok) return parsed.error;
  if (minGapMin) {
    const times = runTimes(parsed.cron, new Date(), 40);
    for (let i = 1; i < times.length; i += 1) {
      if ((times[i].getTime() - times[i - 1].getTime()) / 60000 < minGapMin) {
        return `실행 간격이 ${minGapMin}분보다 짧습니다. 수집 작업은 ${minGapMin}분 이상 간격으로 두세요.`;
      }
    }
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDateTime(d: Date, withSeconds = false): string {
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withSeconds ? `${base}:${pad(d.getSeconds())}` : base;
}

export function formatWithDow(d: Date): string {
  return `${formatDateTime(d)} (${DOW_KO[d.getDay()]})`;
}

const valuesOf = (flags: boolean[], lo: number): number[] => {
  const out: number[] = [];
  for (let v = lo; v < flags.length; v += 1) if (flags[v]) out.push(v);
  return out;
};

const isContiguous = (vals: number[]) => vals.every((v, i) => i === 0 || v === vals[i - 1] + 1);

const joinDow = (vals: number[]): string => {
  if (vals.length === 5 && vals[0] === 1 && vals[4] === 5) return "평일";
  if (vals.length === 2 && vals[0] === 0 && vals[1] === 6) return "주말";
  if (vals.length === 7) return "";
  if (vals.length === 1) return `매주 ${DOW_KO[vals[0]]}요일`;
  if (vals.length >= 3 && isContiguous(vals)) return `${DOW_KO[vals[0]]}~${DOW_KO[vals[vals.length - 1]]}`;
  return `${vals.map((v) => DOW_KO[v]).join("·")}요일`;
};

const stepOf = (field: string): number | null => {
  const m = /^\*\/(\d+)$/.exec(field);
  return m ? Number(m[1]) : null;
};

/** 사람이 읽는 설명(「매일 02:00」·「10분마다」). 식이 올바르지 않으면 빈 글자. */
export function describeCron(expr: string): string {
  const parsed = parseCron(expr);
  if (!parsed.ok) return "";
  const { cron } = parsed;
  const [fMin, fHour, fDom, fMon, fDow] = cron.fields;
  const mins = valuesOf(cron.min, 0);
  const hours = valuesOf(cron.hour, 0);

  const dayParts: string[] = [];
  if (fMon !== "*") dayParts.push(`${valuesOf(cron.mon, 1).join("·")}월`);
  if (fDom !== "*") dayParts.push(`${fMon === "*" ? "매월 " : ""}${valuesOf(cron.dom, 1).join("·")}일`);
  if (fDow !== "*") {
    const dow = joinDow(valuesOf(cron.dow, 0));
    if (dow) dayParts.push(dow);
  }

  let time: string;
  let clock = false;
  const minStep = stepOf(fMin);
  const hourStep = stepOf(fHour);
  const hourText = () =>
    hours.length > 4 && isContiguous(hours) ? `${hours[0]}~${hours[hours.length - 1]}시` : `${hours.join("·")}시`;
  if (fMin === "*" && fHour === "*") {
    time = "매분";
  } else if (minStep && fHour === "*") {
    time = `${minStep}분마다`;
  } else if ((fMin === "*" || minStep) && fHour !== "*") {
    time = `${hourText()} ${fMin === "*" ? "매분" : `${minStep}분마다`}`;
  } else if (fHour === "*") {
    time = mins.length === 1 && mins[0] === 0 ? "매시 정각" : `매시 ${mins.join("·")}분`;
  } else if (hourStep) {
    time = mins.length === 1 && mins[0] === 0 ? `${hourStep}시간마다 정각` : `${hourStep}시간마다 ${mins.join("·")}분`;
  } else if (hours.length > 4) {
    const m = mins.length === 1 && mins[0] === 0 ? "매시 정각" : `매시 ${mins.join("·")}분`;
    time = `${hourText()} ${m}`;
  } else {
    const times: string[] = [];
    for (const h of hours) for (const m of mins) times.push(`${pad(h)}:${pad(m)}`);
    time = times.length > 4 ? `${times.slice(0, 4).join(", ")} 외` : times.join(", ");
    clock = true;
  }
  if (clock && dayParts.length === 0) return `매일 ${time}`;
  return [...dayParts, time].join(" ");
}

/** 「자주 쓰는 식」 선택지. */
export const CRON_PRESETS: { value: string; label: string }[] = [
  { value: "* * * * *", label: "매분 (* * * * *)" },
  { value: "*/5 * * * *", label: "5분마다 (*/5 * * * *)" },
  { value: "*/10 * * * *", label: "10분마다 (*/10 * * * *)" },
  { value: "0 * * * *", label: "매시 정각 (0 * * * *)" },
  { value: "0 7 * * *", label: "매일 07:00 (0 7 * * *)" },
  { value: "0 7 * * 1-5", label: "평일 07:00 (0 7 * * 1-5)" },
  { value: "0 7 * * 0", label: "매주 일요일 07:00 (0 7 * * 0)" },
  { value: "30 7 1 * *", label: "매월 1일 07:30 (30 7 1 * *)" },
];

/* ------------------------------------------------------------------ 쉬운 설정 */

export type EasyKind = "everyMinute" | "everyNMinutes" | "hourly" | "daily" | "weekly" | "monthly";

export const EASY_KIND_LABEL: Record<EasyKind, string> = {
  everyMinute: "매분",
  everyNMinutes: "N분마다",
  hourly: "매시간",
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
};

export const EASY_INTERVALS = [1, 2, 3, 5, 10, 15, 20, 30];

/** 쉬운 설정 값. 반복 종류에 쓰지 않는 칸은 마지막으로 만진 값을 그대로 둔다(종류를 바꿔도 입력이 사라지지 않게). */
export interface EasyConfig {
  kind: EasyKind;
  /** N분마다 */
  interval: number;
  /** 매시간: 몇 분에 */
  minute: number;
  /** 시간대 제한(N분마다·매시간) */
  limitHours: boolean;
  hourFrom: number;
  hourTo: number;
  /** 요일 0(일)~6(토). 비어 있거나 7개면 제한 없음. 매주는 하나 이상 필요. */
  weekdays: number[];
  /** HH:mm 목록(매일·매주·매월) */
  times: string[];
  /** 매월 날짜 1~31 */
  days: number[];
}

export const DEFAULT_EASY: EasyConfig = {
  kind: "daily",
  interval: 5,
  minute: 0,
  limitHours: false,
  hourFrom: 8,
  hourTo: 20,
  weekdays: [],
  times: ["07:00"],
  days: [1],
};

export type BuildResult = { ok: true; cron: string } | { ok: false; error: string };

const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** 정렬한 값 목록을 crontab 칸 글자로 — 3개 이상 이어진 값은 범위(1-5)로 줄인다. */
function compressList(values: number[]): string {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    if (j - i >= 2) parts.push(`${sorted[i]}-${sorted[j]}`);
    else for (let k = i; k <= j; k += 1) parts.push(String(sorted[k]));
    i = j + 1;
  }
  return parts.join(",");
}

function dowField(weekdays: number[]): string {
  const set = [...new Set(weekdays)];
  return set.length === 0 || set.length === 7 ? "*" : compressList(set);
}

/** 쉬운 설정 → crontab 식. 만들 수 없으면 사유를 돌려준다. */
export function buildCron(e: EasyConfig): BuildResult {
  const hours = (): string | BuildResult => {
    if (!e.limitHours) return "*";
    if (e.hourFrom > e.hourTo) {
      return { ok: false, error: "시작 시는 끝 시보다 늦을 수 없습니다. 밤을 넘기는 시간대는 지원하지 않습니다." };
    }
    return `${e.hourFrom}-${e.hourTo}`;
  };
  switch (e.kind) {
    case "everyMinute":
      return { ok: true, cron: "* * * * *" };
    case "everyNMinutes": {
      if (!EASY_INTERVALS.includes(e.interval)) return { ok: false, error: "간격을 목록에서 고르세요." };
      const h = hours();
      if (typeof h !== "string") return h;
      return { ok: true, cron: `${e.interval === 1 ? "*" : `*/${e.interval}`} ${h} * * ${dowField(e.weekdays)}` };
    }
    case "hourly": {
      if (!Number.isInteger(e.minute) || e.minute < 0 || e.minute > 59) return { ok: false, error: "분은 0~59 사이로 고르세요." };
      const h = hours();
      if (typeof h !== "string") return h;
      return { ok: true, cron: `${e.minute} ${h} * * ${dowField(e.weekdays)}` };
    }
    case "daily":
    case "weekly":
    case "monthly": {
      if (e.kind === "weekly" && e.weekdays.length === 0) return { ok: false, error: "요일을 하나 이상 고르세요." };
      if (e.kind === "monthly" && e.days.length === 0) return { ok: false, error: "날짜를 하나 이상 고르세요." };
      if (e.times.length === 0) return { ok: false, error: "시각을 하나 이상 추가하세요." };
      const parsed = e.times.map((t) => TIME_PATTERN.exec(t.trim()));
      if (parsed.some((m) => m === null)) return { ok: false, error: "시각을 HH:mm 형식으로 모두 입력하세요." };
      const minutes = new Set(parsed.map((m) => Number(m?.[2])));
      if (minutes.size > 1) {
        return { ok: false, error: "분이 같은 시각만 함께 쓸 수 있습니다. 분이 다르면 작업을 나눠 등록하세요." };
      }
      const minute = [...minutes][0];
      const hourList = compressHours(parsed.map((m) => Number(m?.[1])));
      const dom = e.kind === "monthly" ? compressList(e.days) : "*";
      const dow = e.kind === "monthly" ? "*" : dowField(e.weekdays);
      return { ok: true, cron: `${minute} ${hourList} ${dom} * ${dow}` };
    }
    default:
      return { ok: false, error: "반복 종류를 고르세요." };
  }
}

/** 시각 목록의 시 칸은 범위로 줄이지 않고 쉼표 목록으로 둔다(8-20 은 매시간의 시간대 제한과 구분된다). */
function compressHours(hours: number[]): string {
  return [...new Set(hours)].sort((a, b) => a - b).join(",");
}

const INTEGER = /^\d+$/;
const INT_LIST = /^\d+(,\d+)*$/;
const HOUR_RANGE = /^(\d+)-(\d+)$/;

const timesOf = (hourField: string, minute: string): string[] =>
  [...new Set(hourField.split(",").map(Number))].sort((a, b) => a - b).map((h) => `${pad(h)}:${pad(Number(minute))}`);

/** crontab 식 → 쉬운 설정. 쉬운 설정으로 나타낼 수 없는 식이면 null. */
export function toEasy(expr: string): EasyConfig | null {
  const parsed = parseCron(expr);
  if (!parsed.ok) return null;
  const { cron } = parsed;
  const [fMin, fHour, fDom, fMon] = cron.fields;
  if (fMon !== "*") return null;
  const dowVals = valuesOf(cron.dow, 0);
  const weekdays = dowVals.length === 7 ? [] : dowVals;
  const base: EasyConfig = { ...DEFAULT_EASY, times: [...DEFAULT_EASY.times], days: [...DEFAULT_EASY.days] };

  if (fDom !== "*") {
    if (!INTEGER.test(fMin) || !INT_LIST.test(fHour)) return null;
    return { ...base, kind: "monthly", days: valuesOf(cron.dom, 1), times: timesOf(fHour, fMin) };
  }

  const step = /^\*\/(\d+)$/.exec(fMin);
  const stepOk = fMin === "*" || (step !== null && EASY_INTERVALS.includes(Number(step[1])));
  const range = fHour === "*" ? null : HOUR_RANGE.exec(fHour);
  if (stepOk) {
    if (fHour !== "*" && !range) return null;
    const interval = fMin === "*" ? 1 : Number(step?.[1]);
    if (interval === 1 && fHour === "*" && weekdays.length === 0) return { ...base, kind: "everyMinute" };
    return {
      ...base,
      kind: "everyNMinutes",
      interval,
      limitHours: range !== null,
      hourFrom: range ? Number(range[1]) : base.hourFrom,
      hourTo: range ? Number(range[2]) : base.hourTo,
      weekdays,
    };
  }

  if (!INTEGER.test(fMin)) return null;
  if (fHour === "*" || range) {
    return {
      ...base,
      kind: "hourly",
      minute: Number(fMin),
      limitHours: range !== null,
      hourFrom: range ? Number(range[1]) : base.hourFrom,
      hourTo: range ? Number(range[2]) : base.hourTo,
      weekdays,
    };
  }
  if (INT_LIST.test(fHour)) {
    return { ...base, kind: weekdays.length > 0 ? "weekly" : "daily", weekdays, times: timesOf(fHour, fMin) };
  }
  return null;
}

/** 쉬운 설정 아래에 보이는 참고 안내(저장을 막지는 않는다). */
export function easyNotice(e: EasyConfig): string | null {
  if (e.kind === "monthly" && e.days.some((d) => d >= 29)) return "29~31일을 고르면 그 날짜가 없는 달은 건너뜁니다.";
  return null;
}
