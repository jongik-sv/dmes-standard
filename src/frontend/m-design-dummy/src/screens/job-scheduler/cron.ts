/**
 * crontab 5칸 식(`분 시 일 월 요일`) 해석 — 예약 작업 관리 시안 전용 계산기.
 * 실제 화면은 저장 시 서버(cronPreview)가 계산하며, 시안에서는 브라우저가 같은 규칙으로 흉내 낸다.
 * 규칙(설계 문서 §4.0): `*`·`,`·`-`·`/`, 월·요일 영문 이름, 요일 0·7=일요일, 매크로(@daily 등).
 * `?`·`L`·`W`·`#`·6칸 식은 거절하고, 일과 요일을 함께 제한한 식도 거절한다.
 * 시간대는 브라우저 시간대를 그대로 쓴다(시안).
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
  { value: "0 2 * * *", label: "매일 02:00 (0 2 * * *)" },
  { value: "0 9 * * 1-5", label: "평일 09:00 (0 9 * * 1-5)" },
  { value: "0 4 * * 0", label: "매주 일요일 04:00 (0 4 * * 0)" },
  { value: "30 0 1 * *", label: "매월 1일 00:30 (30 0 1 * *)" },
];
