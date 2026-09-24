/**
 * NUM_FORMAT 문자열 형식(TSK-05-02 design.md D3 — 불변 I15). 정본은 Java `LayoutNumFormatCodec`:
 * `SIGN=Y|N;ZERO=Y|N;SCALE=<0~9>;WIDTH=<1~99>`, 키 순서 고정·네 키 필수. 두 벌이 같은 벡터를 통과해야 한다.
 */
import type { NumFormat } from "./types";

const FORMAT = /^SIGN=([YN]);ZERO=([YN]);SCALE=(\d);WIDTH=([1-9]\d?)$/;

export function encodeNumFormat(f: NumFormat): string {
  return `SIGN=${f.sign ? "Y" : "N"};ZERO=${f.zeroPad ? "Y" : "N"};SCALE=${f.impliedScale};WIDTH=${f.width}`;
}

/** 형식 위반이면 던진다(서버 L08). */
export function decodeNumFormat(text: string | null | undefined): NumFormat {
  const m = FORMAT.exec(text ?? "");
  if (!m) throw new Error(`숫자 표현 형식이 SIGN=Y|N;ZERO=Y|N;SCALE=n;WIDTH=n 이 아니다: ${text ?? ""}`);
  return { sign: m[1] === "Y", zeroPad: m[2] === "Y", impliedScale: Number(m[3]), width: Number(m[4]) };
}

/** 던지지 않는 판독 — 화면 재계산용. */
export function tryDecodeNumFormat(text: string | null | undefined): NumFormat | null {
  try {
    return text ? decodeNumFormat(text) : null;
  } catch {
    return null;
  }
}
