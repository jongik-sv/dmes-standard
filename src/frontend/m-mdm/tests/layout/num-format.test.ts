// TSK-05-02 design.md §3.4·D3 — NUM_FORMAT 형식(불변 I15). Java LayoutNumFormatCodecTest 와 같은 벡터.
import { describe, expect, it } from "vitest";
import { decodeNumFormat, encodeNumFormat } from "../../src/layout/num-format";

describe("num-format", () => {
  it("M201 코일 두께 형식을 문자열로 쓰고 읽는다", () => {
    const f = { sign: false, zeroPad: true, impliedScale: 1, width: 4 };
    expect(encodeNumFormat(f)).toBe("SIGN=N;ZERO=Y;SCALE=1;WIDTH=4");
    expect(decodeNumFormat("SIGN=N;ZERO=Y;SCALE=1;WIDTH=4")).toEqual(f);
    expect(decodeNumFormat("SIGN=Y;ZERO=N;SCALE=0;WIDTH=12")).toEqual({ sign: true, zeroPad: false, impliedScale: 0, width: 12 });
  });

  it.each([
    "ZERO=Y;SIGN=N;SCALE=1;WIDTH=4", "SIGN=N;ZERO=Y;SCALE=1", "SIGN=X;ZERO=Y;SCALE=1;WIDTH=4",
    "SIGN=N;ZERO=Y;SCALE=1;WIDTH=0", "SIGN=N,ZERO=Y,SCALE=1,WIDTH=4", "sign=N;ZERO=Y;SCALE=1;WIDTH=4",
    "SIGN=N;ZERO=Y;SCALE=1;WIDTH=4;", "", "SIGN=N;ZERO=Y;SCALE=10;WIDTH=4", "SIGN=N;ZERO=Y;SCALE=1;WIDTH=100",
  ])("키 순서가 다르거나 키가 빠지거나 값이 틀리면 읽지 않는다: %s", (text) => {
    expect(() => decodeNumFormat(text)).toThrow();
  });

  it("50자를 넘지 않는다", () => {
    const max = encodeNumFormat({ sign: true, zeroPad: true, impliedScale: 9, width: 99 });
    expect(max).toBe("SIGN=Y;ZERO=Y;SCALE=9;WIDTH=99");
    expect(max.length).toBeLessThanOrEqual(50);
  });
});
