/**
 * 단위 계산기 서식 시험 — 입력 읽기(천 단위 쉼표·공백·전각·숫자 아님·지수 상한)와 결과 표시(10자리·끝 0·쉼표·지수 표기 경계)·정밀 값(17자리).
 */
import { D } from "@dk-oasis/shared/evalex";
import { describe, expect, it } from "vitest";

import {
  formatExact,
  formatNumber,
  INVALID_NUMBER_TEXT,
  MAX_INPUT_EXPONENT,
  parseNumberInput,
  TOO_LARGE_TEXT,
  TOO_SMALL_TEXT,
} from "./unit-format";

const fmt = (v: string, grouping = true) => formatNumber(new D(v), grouping);

describe("parseNumberInput — 숫자 읽기", () => {
  const value = (text: string) => {
    const r = parseNumberInput(text);
    return r.ok ? r.value.toString() : null;
  };

  it("공백(앞뒤·가운데·전각 공백)은 무시한다", () => {
    expect(value("  12 345  ")).toBe("12345");
    expect(value("1　234")).toBe("1234");
    expect(value("- 5")).toBe("-5");
    expect(value("1 ,234")).toBe("1234");
  });

  it("쉼표는 천 단위 모양일 때만 받는다", () => {
    expect(value("1,234.5")).toBe("1234.5");
    expect(value("1,234,567")).toBe("1234567");
    expect(value("12,345.678")).toBe("12345.678");
    expect(value("999,999")).toBe("999999");
    expect(value("-1,234")).toBe("-1234");
    expect(value("+1,234")).toBe("1234");
    expect(value("−1,234")).toBe("-1234");
    expect(value("1,234.")).toBe("1234");
    expect(value(" 1,234 , 567 ")).toBe("1234567"); // 공백을 지운 뒤 모양을 본다
  });

  it("천 단위 모양이 아닌 쉼표는 숫자가 아니다 — 소수점 쉼표(1,5)·묶음이 틀린 것·앞뒤·소수부·지수 안의 쉼표", () => {
    for (const text of ["1,5", "1,2,3", "1,23", "1,2345", "12,34", "1234,567", ",5", "5,", "1,234,", "1,,234", "1,234.5,6", "1.234,5", "0,123", "01,234", "1,234e5", "1e1,000", "--1,234", ",", ",,"]) {
      expect(parseNumberInput(text), text).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("전각 숫자·쉼표·마침표·부호만 반각으로 읽는다(NFKC 는 쓰지 않는다)", () => {
    expect(value("１２")).toBe("12");
    expect(value("０１２３４５６７８９")).toBe("123456789");
    expect(value("１，２３４．５")).toBe("1234.5");
    expect(value("－５")).toBe("-5");
    expect(value("＋５")).toBe("5");
    expect(value("　１２　")).toBe("12");
    expect(value("１,２３４")).toBe("1234");
    expect(value("1.5e3")).toBe("1500");
    for (const text of ["１，５", "１２Ａ", "１２ｅ３", "①", "１２。５", "٣"]) {
      // 전각 쉼표가 천 단위 모양이 아니거나, 지정한 열 글자 밖(전각 영문·원문자·마침표 모양 글자·아랍 숫자)이면 숫자가 아니다.
      expect(parseNumberInput(text), text).toEqual({ ok: false, reason: "invalid" });
    }
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
    expect(parseNumberInput("  \u3000 ")).toEqual({ ok: false, reason: "empty" });
    expect(parseNumberInput("  , ")).toEqual({ ok: false, reason: "invalid" }); // 쉼표만 있는 글은 빈 입력이 아니라 숫자가 아니다
  });

  it("숫자가 아니면 invalid — decimal.js 가 받는 Infinity·NaN·16진·2진도 거른다", () => {
    for (const text of ["abc", "-", ".", "+", "1.2.3", "1e", "e5", "--1", "1-", "12abc", "Infinity", "-Infinity", "NaN", "0x1f", "0b101", "0o7", "1_000"]) {
      expect(parseNumberInput(text), text).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("지수 절댓값은 1000 까지 — 넘으면 크기 때문에 읽지 않는다(양수 tooLarge·음수 tooSmall)", () => {
    expect(MAX_INPUT_EXPONENT).toBe(1000);
    expect(value("1e1000")).toBe(new D("1e1000").toString());
    expect(value("1e-1000")).toBe(new D("1e-1000").toString());
    expect(value("-5.5E+1000")).toBe(new D("-5.5e1000").toString());
    expect(parseNumberInput("1e1001")).toEqual({ ok: false, reason: "tooLarge" });
    expect(parseNumberInput("-2.5e+5000")).toEqual({ ok: false, reason: "tooLarge" });
    expect(parseNumberInput("1e-1001")).toEqual({ ok: false, reason: "tooSmall" });
    expect(parseNumberInput("1E-99999")).toEqual({ ok: false, reason: "tooSmall" });
    expect(parseNumberInput("1e99999999999999999")).toEqual({ ok: false, reason: "tooLarge" });
    expect(parseNumberInput("1e9000000000000000")).toEqual({ ok: false, reason: "tooLarge" });
    expect(parseNumberInput("1e-9000000000000000")).toEqual({ ok: false, reason: "tooSmall" });
  });

  it("가수가 0 이면 지수가 커도 값은 0 이다", () => {
    expect(value("0e99999")).toBe("0");
    expect(value("0.000e-99999")).toBe("0");
  });

  it("안내 문구", () => {
    expect(INVALID_NUMBER_TEXT).toBe("숫자를 입력하세요");
    expect(TOO_LARGE_TEXT).toBe("값이 너무 큽니다");
    expect(TOO_SMALL_TEXT).toBe("값이 너무 작습니다");
  });
});

describe("formatExact — [⇄] 가 입력으로 잇는 정밀 값(17자리)", () => {
  const exact = (v: string) => formatExact(new D(v));

  it("유효숫자 17자리로 반올림(HALF_UP)하고 끝의 0 을 지운다 — 쉼표 없음", () => {
    expect(exact("9.999999999")).toBe("9.999999999"); // 10자리 표시는 「10」이 되는 값
    expect(exact("101.971621297792824")).toBe("101.97162129779282");
    expect(exact("0.333333333333333333333")).toBe("0.33333333333333333");
    expect(exact("0.666666666666666666666")).toBe("0.66666666666666667");
    expect(exact("2.5000000000000000")).toBe("2.5");
    expect(exact("1234567.891")).toBe("1234567.891");
    expect(exact("-1234567.891")).toBe("-1234567.891");
    expect(exact("25.4")).toBe("25.4");
    expect(exact("1000000")).toBe("1000000");
  });

  it("0 과 -0 은 「0」", () => {
    expect(exact("0")).toBe("0");
    expect(exact("-0")).toBe("0");
  });

  it("지수 표기 경계는 표시와 같다 — 1e15 이상·1e-6 미만(decimal.js 자체 임계값을 쓰지 않는다)", () => {
    expect(exact("1e16")).toBe("1e+16");
    expect(exact("1e15")).toBe("1e+15");
    expect(exact("123456789012345")).toBe("123456789012345");
    expect(exact("1.234568e-7")).toBe("1.234568e-7");
    expect(exact("-5e-10")).toBe("-5e-10");
    expect(exact("0.000001")).toBe("0.000001");
    expect(exact("12345678901234567890")).toBe("1.2345678901234568e+19");
  });

  it("만든 글은 입력으로 다시 읽힌다(값 손실은 17자리 안) — 읽을 수 없는 크기는 빈 글", () => {
    for (const v of ["9.999999999", "0.1", "-3.14159265358979323846", "1e16", "5e-10", "123456789012345.6"]) {
      const text = exact(v);
      const back = parseNumberInput(text);
      expect(back.ok, v).toBe(true);
      if (back.ok) expect(back.value.minus(new D(v)).abs().div(new D(v).abs()).lt("1e-16"), v).toBe(true);
    }
    expect(exact("1e1001")).toBe("");
    expect(exact("1e-1001")).toBe("");
    expect(formatExact(new D("Infinity"))).toBe("");
    expect(formatExact(new D("NaN"))).toBe("");
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

  it("grouping=false 는 쉼표를 넣지 않는다(복사용)", () => {
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
