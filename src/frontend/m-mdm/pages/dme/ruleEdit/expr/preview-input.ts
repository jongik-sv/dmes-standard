/**
 * 미리보기 입력 `변수=값, 변수=값` → 평가 레코드. 십진 문자열은 NUMBER, 나머지는 STRING·불린으로 바꾼다.
 * 식을 읽는 코드가 아니라 입력 칸 한 줄을 나누는 것이다(식 파싱은 서버, 불변 9).
 */
import { convertForType, type EvalValue } from "@/evalex";

const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

export function parsePreviewInput(text: string): Record<string, EvalValue> {
  const out: Record<string, EvalValue> = {};
  for (const part of text.split(/[,\n]/)) {
    const at = part.indexOf("=");
    if (at <= 0) continue;
    const name = part.slice(0, at).trim().toUpperCase();
    const raw = part.slice(at + 1).trim();
    if (!name) continue;
    if (raw === "true" || raw === "false") out[name] = raw === "true";
    else if (DECIMAL.test(raw)) out[name] = convertForType(raw, "NUMBER");
    else out[name] = raw.replace(/^"(.*)"$/, "$1");
  }
  return out;
}
