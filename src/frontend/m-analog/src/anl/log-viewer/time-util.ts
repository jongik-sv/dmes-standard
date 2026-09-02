/**
 * 로그 분석 (anl/logViewer) — 일시 유틸.
 * 원본: analog-express-ui-plate src/util/time.js 이식 (로직 동일).
 *
 * 표시 형식 = "YYYY-MM-DD HH:mm:ss", API 형식 = yyyyMMddHHmmss(14자리).
 */

/** 현재 시각에서 minute 분 전 시각을 표시 형식 문자열로 반환. */
export function timeGenerator(minute: number): string {
  const now = new Date();
  const chgFromDate = new Date(now.setMinutes(now.getMinutes() - minute));
  return formatDate(chgFromDate);
}

/** Date → "YYYY-MM-DD HH:mm:ss". */
export function formatDate(nowDate: Date): string {
  const nowYear = nowDate.getFullYear();
  const nowMonth = (nowDate.getMonth() + 1).toString().padStart(2, "0");
  const nowDay = nowDate.getDate().toString().padStart(2, "0");
  const nowHour = nowDate.getHours().toString().padStart(2, "0");
  const nowMinute = nowDate.getMinutes().toString().padStart(2, "0");
  const nowSecond = nowDate.getSeconds().toString().padStart(2, "0");
  return `${nowYear}-${nowMonth}-${nowDay} ${nowHour}:${nowMinute}:${nowSecond}`;
}

/** yyyyMMddHHmmss(14자리) → Date. */
export function yyyymmddhh24missToDate(dateString: string): Date {
  return new Date(
    Number(dateString.substring(0, 4)),
    Number(dateString.substring(4, 6)) - 1,
    Number(dateString.substring(6, 8)),
    Number(dateString.substring(8, 10)),
    Number(dateString.substring(10, 12)),
    Number(dateString.substring(12, 14)),
  );
}

/** yyyyMMddHHmmss 문자열에 seconds(음수 허용)를 더해 yyyyMMddHHmmss 로 반환. */
export function addSecondsToYyyymmddhh24miss(
  yyyymmddhh24miss: string,
  seconds: number,
): string {
  const aSecondAddedDate = new Date(
    yyyymmddhh24missToDate(yyyymmddhh24miss).getTime() + seconds * 1000,
  );
  aSecondAddedDate.setMilliseconds(0);
  return toYyyymmddhh24miss(aSecondAddedDate);
}

/**
 * Date 또는 표시 형식 문자열 → yyyyMMddHHmmss(14자리) 정규화.
 * 문자열이면 `- _ : 공백 T ,` 를 제거하고, 12자리(초 없음)면 "00" 을 붙이며, 14자 초과는 절단한다.
 * 형식이 불완전하면 14자리가 아닌 문자열이 반환될 수 있다 — 호출부에서 길이 검증한다.
 */
export function toYyyymmddhh24miss(date: Date | string): string {
  if (!date) return date as string;

  if (date instanceof Date) {
    const pad = (num: number, length: number) =>
      String(num).padStart(length, "0");
    const yyyy = date.getFullYear().toString();
    const MM = pad(date.getMonth() + 1, 2);
    const dd = pad(date.getDate(), 2);
    const hh = pad(date.getHours(), 2);
    const mm = pad(date.getMinutes(), 2);
    const ss = pad(date.getSeconds(), 2);
    return yyyy + MM + dd + hh + mm + ss;
  }

  let dateString = date
    .replace(/-/gi, "")
    .replace(/_/gi, "")
    .replace(/:/gi, "")
    .replace(/ /gi, "")
    .replace(/T/gi, "")
    .replace(/,/gi, "");

  if (dateString.length === 12) {
    dateString = dateString + "00";
  }

  if (dateString.length > 14) {
    dateString = dateString.substring(0, 14);
  }

  return dateString;
}
