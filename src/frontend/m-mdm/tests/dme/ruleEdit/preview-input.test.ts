// 열 설정 미리보기 입력 한 줄 → 평가 레코드. 입력 칸을 칠 때마다 render 안에서 불리므로 어떤 글자에도 던지지 않아야 한다.
import { describe, expect, it } from "vitest";

import { D, NUMBER_TEXT } from "@/evalex";

import { parsePreviewInput } from "../../../pages/dme/ruleEdit/expr/preview-input";

describe("parsePreviewInput", () => {
  it("엔진 숫자 글자는 NUMBER, true·false 는 불린, 나머지는 글자(따옴표는 벗긴다)", () => {
    const r = parsePreviewInput('coil_thk=1.80, n=-3\nflag=true, name="AB", code=X1');
    expect(r.COIL_THK).toBeInstanceOf(D);
    expect(NUMBER_TEXT.get(r.COIL_THK as InstanceType<typeof D>)).toBe("1.80");
    expect(r.N).toBeInstanceOf(D);
    expect(String(r.N)).toBe("-3");
    expect(r.FLAG).toBe(true);
    expect(r.NAME).toBe("AB");
    expect(r.CODE).toBe("X1");
  });

  it("치는 도중의 5.·.5 와 지수 글자는 숫자로 읽지 않고 글자로 둔다 — 던지지 않는다(F4)", () => {
    expect(parsePreviewInput("COIL_THK=1.")).toEqual({ COIL_THK: "1." });
    expect(parsePreviewInput("A=.5, B=+.5, C=1e3")).toEqual({ A: ".5", B: "+.5", C: "1e3" });
  });

  it("이름이 없거나 = 가 없는 조각은 건너뛴다", () => {
    expect(parsePreviewInput("=1, X, Y=2")).toEqual({ Y: expect.anything() });
  });
});
