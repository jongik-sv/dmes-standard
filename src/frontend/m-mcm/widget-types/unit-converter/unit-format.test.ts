/**
 * 단위 계산기 서식 시험 — 입력 읽기(쉼표·공백·숫자 아님)와 결과 표시(10자리·끝 0·쉼표·지수 표기 경계).
 */
import { D } from "@dk-oasis/shared/evalex";
import { describe, expect, it } from "vitest";

import { formatNumber, INVALID_NUMBER_TEXT, parseNumberInput } from "./unit-format";

const fmt = (v: string, grouping = true) => formatNumber(new D(v), grouping);

describe("parseNumberInput — 숫자 읽기", () => {
  const value = (text: string) => {
    const r = parseNumberInput(text);
    return r.ok ? r.value.toString() : null;
  };

  it("쉼표·공백(앞뒤·가운데·전각)은 무시한다", () => {
    expect(value("1,234.5")).toBe("1234.5");
    expect(value("  12 345  ")).toBe("12345");
    expect(value("1,2,3")).toBe("123");
    expect(value("1　234")).toBe("1234");
  });

  it("부호·소수점·지수를 읽는다(e+n·e-n 포함 — [⇄] 가 지수 표기 결과를 되먹인다)", () => {
    expect(value("-5")).toBe("-5");
    expect(value("+5")).toBe("5");
    expect(value(".5")).toBe("0.5");
    expect(value("5.")).toBe("5");
    expect(value("1.5e+15")).toBe("1500000000000000");
    expect(value("1.234568e-7")).toBe("0.0000001234568");
    expect(value("1E3")).toBe("1000");
    expect(value("−5")).toBe("-5"); // 유니코드 마이너스
  });

  it("빈 입력은 empty 다", () => {
    expect(parseNumberInput("")).toEqual({ ok: false, reason: "empty" });
    expect(parseNumberInput("  , ")).toEqual({ ok: false, reason: "empty" });
  });

  it("숫자가 아니면 invalid — decimal.js 가 받는 Infinity·NaN·16진·2진도 거른다", () => {
    for (const text of ["abc", "-", ".", "+", "1.2.3", "1e", "e5", "--1", "1-", "12abc", "Infinity", "-Infinity", "NaN", "0x1f", "0b101", "0o7", "1_000", "１２"]) {
      expect(parseNumberInput(text), text).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("지수가 너무 커서 무한대가 되는 입력은 invalid 다", () => {
    expect(parseNumberInput("1e99999999999999999")).toEqual({ ok: false, reason: "invalid" });
  });

  it("안내 문구", () => {
    expect(INVALID_NUMBER_TEXT).toBe("숫자를 입력하세요");
  });
});

describe("formatNumber — 유효숫자 10자리", () => {
  it("11자리 이상은 10자리로 반올림(HALF_UP)하고 끝의 0 을 지운다", () => {
    expect(fmt("3.30578512396694")).toBe("3.305785124");
    expect(fmt("0.123456789049")).toBe("0.123456789");
    expect(fmt("0.12345678905")).toBe("0.1234567891"); // 5 는 올림
    expect(fmt("1.2345678905")).toBe("1.234567891");
    expect(fmt("2.500000000000")).toBe("2.5");
    expect(fmt("10.0000000001")).toBe("10");
  });

  it("정수·소수는 그대로(끝 0 없음)", () => {
    expect(fmt("25.4")).toBe("25.4");
    expect(fmt("100")).toBe("100");
    expect(fmt("0.5")).toBe("0.5");
    expect(fmt("-0.5")).toBe("-0.5");
  });

  it("0 과 -0 은 「0」", () => {
    expect(fmt("0")).toBe("0");
    expect(fmt("-0")).toBe("0");
    expect(formatNumber(new D("0").neg())).toBe("0");
    expect(fmt("0.0000")).toBe("0");
  });

  it("11자리 정수는 유효숫자 밖을 0 으로 채운다(10자리로 반올림)", () => {
    expect(fmt("12345678901")).toBe("12,345,678,900");
    expect(fmt("12345678905")).toBe("12,345,678,910");
  });
});

describe("formatNumber — 천 단위 쉼표", () => {
  it("정수부에만 넣는다", () => {
    expect(fmt("1234567.891")).toBe("1,234,567.891");
    expect(fmt("999")).toBe("999");
    expect(fmt("1000")).toBe("1,000");
    expect(fmt("3600000")).toBe("3,600,000");
    expect(fmt("0.0012345")).toBe("0.0012345");
  });

  it("부호는 묶음 밖이다", () => {
    expect(fmt("-1234567")).toBe("-1,234,567");
    expect(fmt("-123")).toBe("-123");
    expect(fmt("-999999.5")).toBe("-999,999.5");
  });

  it("grouping=false 는 쉼표를 넣지 않는다(복사·[⇄] 되먹임용)", () => {
    expect(fmt("1234567.891", false)).toBe("1234567.891");
    expect(fmt("-1234567", false)).toBe("-1234567");
  });
});

describe("formatNumber — 지수 표기 경계", () => {
  it("1e15 이상이면 지수 표기, 쉼표 없음", () => {
    expect(fmt("1e15")).toBe("1e+15");
    expect(fmt("1.5e15")).toBe("1.5e+15");
    expect(fmt("-2.5e20")).toBe("-2.5e+20");
    expect(fmt("1234567890123456789")).toBe("1.23456789e+18");
    expect(fmt("1.5e15", false)).toBe("1.5e+15");
  });

  it("0 이 아니면서 1e-6 미만이면 지수 표기", () => {
    expect(fmt("1.234568e-7")).toBe("1.234568e-7");
    expect(fmt("0.00000012345678")).toBe("1.2345678e-7");
    expect(fmt("-5e-10")).toBe("-5e-10");
    expect(fmt("9.9999e-7")).toBe("9.9999e-7");
  });

  it("1e-6 이상은 평문", () => {
    expect(fmt("0.000001")).toBe("0.000001");
    expect(fmt("0.0000012345")).toBe("0.0000012345");
    expect(fmt("-0.000001")).toBe("-0.000001");
  });

  it("경계는 반올림 뒤 값으로 판정한다 — 999999999999999.95 는 지수, 9.9999999996e-7 은 평문", () => {
    expect(fmt("999999999999999.95")).toBe("1e+15");
    expect(fmt("999999999999999")).toBe("1e+15"); // 10자리 반올림하면 1.000000000e15
    expect(fmt("9.9999999996e-7")).toBe("0.000001");
    expect(fmt("9.9999999994e-7")).toBe("9.999999999e-7");
  });

  it("1e15 아래 평문은 쉼표가 들어간다", () => {
    expect(fmt("123456789012345")).toBe("123,456,789,000,000");
    expect(fmt("100000000000000")).toBe("100,000,000,000,000");
    expect(fmt("999999999000000")).toBe("999,999,999,000,000");
  });
});
