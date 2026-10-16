/**
 * 미리보기 입력 `변수=값, 변수=값` → 평가 레코드. 엔진 숫자 글자는 NUMBER, 나머지는 STRING·불린으로 바꾼다.
 * 숫자 판정은 엔진 레코드 값 규칙과 같다(F4) — 치는 도중의 `5.`·`.5` 는 글자로 남고 던지지 않는다(render 안에서 불린다).
 * 식을 읽는 코드가 아니라 입력 칸 한 줄을 나누는 것이다(식 파싱은 서버, 불변 9).
 */
import { ENGINE_NUMBER_TEXT, convertForType, type EvalValue } from "@/evalex";

export function parsePreviewInput(text: string): Record<string, EvalValue> {
  const out: Record<string, EvalValue> = {};
  for (const part of text.split(/[,\n]/)) {
    const at = part.indexOf("=");
    if (at <= 0) continue;
    const name = part.slice(0, at).trim().toUpperCase();
    const raw = part.slice(at + 1).trim();
    if (!name) continue;
    if (raw === "true" || raw === "false") out[name] = raw === "true";
    else if (ENGINE_NUMBER_TEXT.test(raw)) out[name] = convertForType(raw, "NUMBER");
    else out[name] = raw.replace(/^"(.*)"$/, "$1");
  }
  return out;
}
