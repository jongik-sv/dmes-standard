/**
 * 계산기 유형 순수 로직 시험(calculator-model.ts) — 우선순위·%·±·⌫·반복 =·0 나누기·표기·기록·키보드 매핑.
 * node 환경에서 돈다. 계산은 @dk-oasis/shared/evalex 의 D(decimal.js 복제본, shared dist)를 쓴다. 렌더 시험은 calculator-render.test.ts.
 */
import { describe, expect, it } from "vitest";

import {
  CALC_DIV_ZERO_MESSAGE,
  CALC_HISTORY_MAX,
  CALC_KEY_SHORTCUTS,
  CALC_KEYS,
  CALC_VALUE_MIN_FONT,
  CALCULATOR_DEFAULT_CONFIG,
  INITIAL_CALC_STATE,
  calcActionForKey,
  calcFonts,
  calcReducer,
  copyValue,
  displayText,
  displayValue,
  exprText,
  formatNumberText,
  historyVisible,
  readCalculatorConfig,
  type CalcAction,
  type CalcOp,
  type CalcState,
} from "./calculator-model";
import { meta } from "./type.meta";

/** 키 글자 하나를 동작으로 — 숫자, 연산자(+ − × ÷), = % ± ⌫(<) C . */
function actionOf(ch: string): CalcAction {
  if (ch >= "0" && ch <= "9") return { type: "digit", digit: ch };
  switch (ch) {
    case "+":
    case "−":
    case "×":
    case "÷":
      return { type: "operator", op: ch as CalcOp };
    case "=":
      return { type: "equals" };
    case "%":
      return { type: "percent" };
    case "±":
      return { type: "negate" };
    case "<":
      return { type: "backspace" };
    case "C":
      return { type: "clear" };
    case ".":
      return { type: "decimal" };
  }
  throw new Error(`시험용 키가 아닙니다: ${ch}`);
}

/** "1+2×3=" 처럼 키를 한 글자씩 누른다(공백은 무시). */
function run(seq: string, from: CalcState = INITIAL_CALC_STATE): CalcState {
  let s = from;
  for (const ch of seq) {
    if (ch === " ") continue;
    s = calcReducer(s, actionOf(ch));
  }
  return s;
}

const shown = (seq: string) => displayText(run(seq));

describe("유형 메타·설정", () => {
  it("id·크기·초기 설정이 지시와 같다", () => {
    expect(meta.id).toBe("calculator");
    expect(meta.title).toBe("계산기");
    expect(meta.description).toBe("사칙연산 계산기(우선순위·백분율·계산 기록)");
    expect(meta.defaultSize).toEqual({ w: 6, h: 12 });
    expect(meta.minSize).toEqual({ w: 4, h: 9 });
    expect(meta.initialConfig).toEqual({ showHistory: true });
    expect(meta.initialConfig).toEqual(CALCULATOR_DEFAULT_CONFIG);
  });

  it("정의 설정 읽기 — 정상 값은 그대로, 잘못된 값은 기본값(기록 보이기)", () => {
    expect(readCalculatorConfig({ showHistory: false })).toEqual({ showHistory: false });
    expect(readCalculatorConfig({ showHistory: true })).toEqual({ showHistory: true });
    for (const raw of [null, undefined, "x", 3, [], {}, { showHistory: "no" }, { showHistory: 0 }]) {
      expect(readCalculatorConfig(raw)).toEqual({ showHistory: true });
    }
  });

  it("기본 설정 객체는 읽을 때마다 새로 만든다(공유 상태를 건드리지 못한다)", () => {
    readCalculatorConfig(null).showHistory = false;
    expect(CALCULATOR_DEFAULT_CONFIG.showHistory).toBe(true);
  });
});

describe("단추 배열", () => {
  it("5행 4열 — C ⌫ % ÷ / 7 8 9 × / 4 5 6 − / 1 2 3 + / ± 0 . =", () => {
    const labels = CALC_KEYS.map((k) => k.label);
    expect(labels).toEqual(["C", "⌫", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "±", "0", ".", "="]);
    expect(new Set(CALC_KEYS.map((k) => k.id)).size).toBe(20);
  });
});

describe("숫자 입력과 표시", () => {
  it("처음 값은 0 이고 윗줄은 비어 있다", () => {
    expect(displayText(INITIAL_CALC_STATE)).toBe("0");
    expect(exprText(INITIAL_CALC_STATE)).toBe("");
  });

  it("정수부에 천 단위 쉼표를 넣고 소수부·입력 중인 소수점·끝의 0 은 입력한 모양 그대로 둔다", () => {
    expect(shown("1250")).toBe("1,250");
    expect(shown("1234567")).toBe("1,234,567");
    expect(shown("1234567.89")).toBe("1,234,567.89");
    expect(shown("1250.")).toBe("1,250.");
    expect(shown("1.50")).toBe("1.50");
    expect(shown("100")).toBe("100");
    expect(formatNumberText("-1234567")).toBe("−1,234,567");
    expect(formatNumberText("1.2345e+16")).toBe("1.2345e+16"); // 지수 표기는 쉼표를 넣지 않는다
  });

  it("앞의 0 은 붙지 않는다 — 007 → 7, 00 → 0", () => {
    expect(shown("007")).toBe("7");
    expect(shown("00")).toBe("0");
    expect(shown("0.05")).toBe("0.05");
  });

  it("-0 뒤의 숫자도 선행 0 을 바꾼다 — 0 . 5 ± ⌫ ⌫ 7 → -7, 0 이면 -0 그대로", () => {
    const negZero = run("0.5±<<"); // "-0.5" → "-0." → "-0"
    expect(negZero.entry).toBe("-0");
    expect(calcReducer(negZero, { type: "digit", digit: "7" }).entry).toBe("-7");
    expect(calcReducer(negZero, { type: "digit", digit: "0" }).entry).toBe("-0");
    expect(displayText(calcReducer(negZero, { type: "digit", digit: "7" }))).toBe("−7");
    expect(run("0.5±<<7=").entry).toBe("-7");
    expect(copyValue(run("0.5±<<7"))).toBe("-7");
    // 소수점이 있으면 0 은 그대로 둔다
    expect(run("0.±5").entry).toBe("-0.5");
  });

  it("소수점만 먼저 눌러도 0. 으로 시작하고, 소수점은 한 번만 받는다", () => {
    expect(shown(".")).toBe("0.");
    expect(shown(".5")).toBe("0.5");
    expect(shown("1.2.3")).toBe("1.23");
  });

  it("입력 숫자는 최대 16자리까지 받는다 — 소수점·부호는 자리로 세지 않는다", () => {
    expect(run("12345678901234567890").entry).toBe("1234567890123456");
    expect(run("0.123456789012345678").entry).toBe("0.123456789012345"); // 0 과 소수 15자리 = 16자리
    expect(run("1234567890123456.").entry).toBe("1234567890123456"); // 16자리에서는 소수점도 더 받지 않는다
    expect(run("1234567890123456±").entry).toBe("-1234567890123456");
    expect(run("1234567890123456±7").entry).toBe("-1234567890123456"); // 부호가 붙어도 17번째 숫자는 안 받는다
  });
});

describe("연산자 우선순위와 식 윗줄", () => {
  it("1 + 2 × 3 = 7", () => {
    expect(shown("1+2×3=")).toBe("7");
    expect(shown("2×3+4=")).toBe("10");
    expect(shown("10−2×3=")).toBe("4");
    expect(shown("2+6÷3=")).toBe("4");
  });

  it("같은 순위는 왼쪽부터 — 10 − 2 − 3 = 5, 8 ÷ 2 ÷ 2 = 2", () => {
    expect(shown("10−2−3=")).toBe("5");
    expect(shown("8÷2÷2=")).toBe("2");
    expect(shown("2×3÷4=")).toBe("1.5");
  });

  it("윗줄은 진행 중인 식 — 연산자를 누르면 보이고 입력 중인 숫자가 뒤에 붙는다", () => {
    expect(exprText(run("1250"))).toBe(""); // 숫자 하나뿐이면 아랫줄과 같으니 비운다
    expect(exprText(run("1250×"))).toBe("1,250 ×");
    expect(displayText(run("1250×"))).toBe("1,250"); // 아랫줄은 직전 값
    const s = run("1250×3");
    expect(exprText(s)).toBe("1,250 × 3");
    expect(displayText(s)).toBe("3");
  });

  it("= 뒤에는 식에 =가 붙고 아랫줄은 결과", () => {
    const s = run("1250×3=");
    expect(exprText(s)).toBe("1,250 × 3 =");
    expect(displayText(s)).toBe("3,750");
  });

  it("연산자를 연달아 누르면 마지막 연산자로 바꾼다", () => {
    const s = run("5+×");
    expect(exprText(s)).toBe("5 ×");
    expect(shown("5+×3=")).toBe("15");
    expect(shown("5+−÷×2=")).toBe("10");
  });

  it("아무것도 안 누르고 연산자부터 누르면 0 에서 시작한다", () => {
    expect(exprText(run("+"))).toBe("0 +");
    expect(shown("+3=")).toBe("3");
  });

  it("숫자 하나만 입력하고 = 를 누르면 그 값이 결과이고 기록에는 남지 않는다", () => {
    const s = run("5=");
    expect(displayText(s)).toBe("5");
    expect(exprText(s)).toBe("5 =");
    expect(s.history).toEqual([]);
    expect(displayText(run("="))).toBe("0");
  });

  it("끝의 소수점·소수 끝 0 은 식에 넣을 때 정리한다 — 3. + 1.50 = 4.5", () => {
    expect(exprText(run("3.+"))).toBe("3 +");
    expect(shown("3.+1.50=")).toBe("4.5");
  });
});

describe("= 반복", () => {
  it("5 + 3 = = → 11, 한 번 더 → 14", () => {
    expect(shown("5+3==")).toBe("11");
    expect(shown("5+3===")).toBe("14");
  });

  it("반복할 때 윗줄은 결과 + 마지막 연산", () => {
    expect(exprText(run("5+3=="))).toBe("8 + 3 =");
  });

  it("우선순위 식 뒤에는 마지막 연산자와 피연산자를 되풀이한다 — 2 + 3 × 4 = 14, = 56", () => {
    expect(shown("2+3×4=")).toBe("14");
    expect(shown("2+3×4==")).toBe("56");
  });

  it("5 + = 은 앞 숫자를 피연산자로 써서 10 이다", () => {
    expect(shown("5+=")).toBe("10");
    expect(shown("5+==")).toBe("15");
  });

  it("숫자 하나만의 =, 반복할 연산이 없으면 한 번 더 눌러도 그대로", () => {
    expect(shown("5==")).toBe("5");
  });
});

describe("퍼센트(%)", () => {
  it("+ 앞이면 a + a×b/100 — 200 + 10% = 220 (= 전에 10% 자리에 20 이 보인다)", () => {
    const s = run("200+10%");
    expect(displayText(s)).toBe("20");
    expect(exprText(s)).toBe("200 + 20");
    expect(shown("200+10%=")).toBe("220");
  });

  it("− 앞이면 a − a×b/100 — 200 − 10% = 180", () => {
    expect(shown("200−10%=")).toBe("180");
  });

  it("× ÷ 앞이면 b/100 — 50 × 10% = 5, 50 ÷ 10% = 500", () => {
    expect(shown("50×10%=")).toBe("5");
    expect(shown("50÷10%=")).toBe("500");
    expect(displayText(run("50×10%"))).toBe("0.1");
  });

  it("a 는 그 연산자 앞까지의 식 값이다 — 1 + 2 × 3 + 10% = 7.7", () => {
    expect(shown("1+2×3+10%=")).toBe("7.7");
  });

  it("식이 숫자 하나면 그 값 / 100", () => {
    expect(shown("50%")).toBe("0.5");
    expect(shown("%")).toBe("0");
    expect(shown("50%=")).toBe("0.5");
  });

  it("입력 없이 연산자 뒤에 누르면 앞 숫자를 b 로 쓴다 — 200 + % = 600", () => {
    expect(shown("200+%=")).toBe("600");
  });

  it("결과 뒤 % 는 결과 / 100", () => {
    expect(shown("200+10%=%")).toBe("2.2");
  });

  it("% 로 나온 값은 입력한 값이 아니라서 다음 숫자가 그 값을 대신한다", () => {
    expect(shown("200+10%5=")).toBe("205");
  });
});

describe("부호(±)", () => {
  it("입력 중인 값의 부호를 바꾼다 — 두 번 누르면 원래대로", () => {
    expect(shown("5±")).toBe("−5");
    expect(shown("5±±")).toBe("5");
    expect(shown("1250±")).toBe("−1,250");
    expect(shown("1.5±")).toBe("−1.5");
  });

  it("입력한 뒤에도 이어서 입력할 수 있다", () => {
    expect(shown("5±3")).toBe("−53");
    expect(shown("0.±5")).toBe("−0.5");
  });

  it("0 의 부호는 바꾸지 않는다(−0 이 안 생긴다)", () => {
    expect(shown("±")).toBe("0");
    expect(shown("0±")).toBe("0");
  });

  it("음수를 식에 넣어 계산한다 — 5 × -3 = -15", () => {
    expect(shown("5×3±=")).toBe("−15");
    expect(shown("5+3±=")).toBe("2");
  });

  it("연산자 바로 뒤의 ± 는 직전 값의 부호를 바꿔 입력 값으로 둔다 — 5 + ± = 0", () => {
    expect(displayText(run("5+±"))).toBe("−5");
    expect(shown("5+±=")).toBe("0");
    expect(shown("5+±3=")).toBe("8"); // 계산된 값이라 다음 숫자가 대신한다
  });

  it("결과의 부호를 바꾸면 그 값에서 이어 계산한다 — 2 + 3 = ± → -5, + 1 = -4", () => {
    const s = run("2+3=±");
    expect(displayText(s)).toBe("−5");
    expect(s.mode).toBe("input");
    expect(shown("2+3=±+1=")).toBe("−4");
  });
});

describe("한 글자 지우기(⌫)", () => {
  it("입력 중인 숫자의 끝 글자를 지운다", () => {
    expect(shown("123<")).toBe("12");
    expect(shown("123<<")).toBe("1");
    expect(shown("1.5<<")).toBe("1");
    expect(shown("1.5<")).toBe("1.");
  });

  it("다 지우면 0, 음수의 부호만 남으면 0", () => {
    expect(shown("1<")).toBe("0");
    expect(shown("5±<")).toBe("0");
    expect(shown("<")).toBe("0");
  });

  it("지운 뒤 다시 입력하면 이어서 받는다", () => {
    expect(shown("123<4")).toBe("124");
  });

  it("결과 표시 중·연산자 직후·계산된 값에는 아무 일도 하지 않는다", () => {
    const result = run("1+2=");
    expect(calcReducer(result, { type: "backspace" })).toBe(result);
    const afterOp = run("5+");
    expect(calcReducer(afterOp, { type: "backspace" })).toBe(afterOp);
    const pct = run("200+10%");
    expect(calcReducer(pct, { type: "backspace" })).toBe(pct);
    expect(shown("1+2=<")).toBe("3");
  });

  it("식 안의 입력도 지운다 — 5 + 12 ⌫ → 5 + 1", () => {
    const s = run("5+12<");
    expect(exprText(s)).toBe("5 + 1");
  });
});

describe("모두 지우기(C)", () => {
  it("식·입력·결과를 모두 지운다", () => {
    for (const seq of ["12+3", "12+3=", "5÷0=", "5+3=="]) {
      const s = run(`${seq}C`);
      expect(displayText(s)).toBe("0");
      expect(exprText(s)).toBe("");
      expect(s.mode).toBe("input");
      expect(s.tokens).toEqual([]);
      expect(s.repeat).toBeNull();
    }
  });

  it("지운 뒤 = 를 눌러도 반복 연산이 남아 있지 않다", () => {
    expect(shown("5+3=C=")).toBe("0");
  });
});

describe("0으로 나누기", () => {
  it("= 에서 오류 문구를 보이고 윗줄에 식을 남긴다", () => {
    const s = run("5÷0=");
    expect(s.mode).toBe("error");
    expect(displayText(s)).toBe(CALC_DIV_ZERO_MESSAGE);
    expect(CALC_DIV_ZERO_MESSAGE).toBe("0으로 나눌 수 없습니다");
    expect(exprText(s)).toBe("5 ÷ 0 =");
    expect(copyValue(s)).toBe("");
  });

  it("0 ÷ 0 도, 식 가운데의 0 나눗셈도 오류다", () => {
    expect(run("0÷0=").mode).toBe("error");
    expect(run("1+4÷0×2=").mode).toBe("error");
    expect(run("1+4÷0+10%").mode).toBe("error"); // % 가 앞 식을 계산하다 걸려도 오류
  });

  it("오류 상태에서는 연산자·=·%·±·⌫ 를 무시한다", () => {
    const err = run("5÷0=");
    for (const a of [
      { type: "operator", op: "+" },
      { type: "equals" },
      { type: "percent" },
      { type: "negate" },
      { type: "backspace" },
    ] as CalcAction[]) {
      expect(calcReducer(err, a)).toBe(err);
    }
  });

  it("다음 숫자·소수점 입력에서 초기화하고 그 입력부터 새로 시작한다", () => {
    const afterDigit = run("5÷0=7");
    expect(afterDigit.mode).toBe("input");
    expect(displayText(afterDigit)).toBe("7");
    expect(exprText(afterDigit)).toBe("");
    expect(displayText(run("5÷0=."))).toBe("0.");
    expect(shown("5÷0=7+1=")).toBe("8");
  });

  it("C 에서도 초기화한다", () => {
    expect(run("5÷0=C").mode).toBe("input");
  });

  it("오류는 기록에 남지 않는다", () => {
    expect(run("5÷0=").history).toEqual([]);
  });
});

describe("소수 계산은 정확하다", () => {
  it("0.1 + 0.2 = 0.3", () => {
    expect(shown("0.1+0.2=")).toBe("0.3");
    expect(shown("0.1×3=")).toBe("0.3");
    expect(shown("0.3−0.1=")).toBe("0.2");
    expect(shown("1.1×1.1=")).toBe("1.21");
  });

  it("유효숫자 15자리에서 반올림(HALF_UP)하고 끝의 0 을 지운다", () => {
    expect(shown("1÷3=")).toBe("0.333333333333333");
    expect(shown("2÷3=")).toBe("0.666666666666667");
    expect(shown("1÷3×3=")).toBe("1"); // 중간 계산은 정밀하게 하고 보일 때만 반올림
    expect(shown("2.50+2.50=")).toBe("5");
    expect(shown("2.5×4=")).toBe("10");
    expect(shown("100÷8=")).toBe("12.5");
  });
});

describe("큰 값·작은 값 표기", () => {
  it("정수부가 15자리까지는 그대로, 16자리 이상이면 지수 표기", () => {
    expect(shown("99999999999999×10=")).toBe("999,999,999,999,990"); // 15자리
    expect(shown("123456789012345×10=")).toBe("1.23456789012345e+15"); // 16자리
    expect(shown("999999999×999999999=")).toBe("9.99999998e+17");
    expect(shown("1000000000×1000000000=")).toBe("1e+18");
  });

  it("반올림하고 나서 16자리가 되면 지수 표기 — 999999999999999 + 0.5", () => {
    expect(shown("999999999999999+0.5=")).toBe("1e+15");
  });

  it("0.000001 미만의 0 아닌 값은 지수 표기, 그 이상은 그대로", () => {
    expect(shown("1÷1000000=")).toBe("0.000001");
    expect(shown("1÷10000000=")).toBe("1e−7");
    expect(shown("1÷3000000=")).toBe("3.33333333333333e−7");
    expect(shown("0.000001−0.000001=")).toBe("0"); // 0 은 지수로 안 쓴다
  });

  it("음수도 같은 규칙", () => {
    expect(shown("123456789012345×10±=")).toBe("−1.23456789012345e+15");
    expect(shown("5−5−1÷10000000=")).toBe("−1e−7");
  });

  it("지수 표기 결과를 이어 계산한다 — 값은 그대로 쓰인다", () => {
    expect(shown("1000000000×1000000000=÷1000000000=")).toBe("1,000,000,000");
  });

  it("16자리를 입력하고 = 하면 반올림돼 지수로 보인다", () => {
    expect(shown("1234567890123456=")).toBe("1.23456789012346e+15");
  });
});

describe("결과 뒤 입력", () => {
  it("숫자를 누르면 새 계산을 시작한다 — 이전 식·반복 연산을 버린다", () => {
    const s = run("1+2=5");
    expect(displayText(s)).toBe("5");
    expect(exprText(s)).toBe("");
    expect(s.repeat).toBeNull();
    expect(shown("1+2=5+3=")).toBe("8");
    expect(shown("1+2=5==")).toBe("5"); // 새로 입력한 5 = 은 숫자 하나라 반복할 연산이 없다
  });

  it("소수점을 누르면 0. 으로 새로 시작한다", () => {
    expect(shown("1+2=.")).toBe("0.");
  });

  it("연산자를 누르면 결과에 이어서 계산한다 — 1 + 2 = × 4 = 12", () => {
    const s = run("1+2=×");
    expect(exprText(s)).toBe("3 ×");
    expect(displayText(s)).toBe("3");
    expect(shown("1+2=×4=")).toBe("12");
    expect(shown("1+2=×4==")).toBe("48");
  });

  it("지수 표기 결과 뒤에 연산자를 눌러도 이어진다", () => {
    expect(exprText(run("1000000000×1000000000=+"))).toBe("1e+18 +");
  });
});

describe("계산 기록", () => {
  it("= 로 계산할 때마다 최신이 앞에 쌓인다 — 식은 쉼표 포함, 결과는 쉼표 없는 글", () => {
    const s = run("1250×3=2+3=");
    expect(s.history.map((h) => [h.expr, h.result])).toEqual([
      ["2 + 3", "5"],
      ["1,250 × 3", "3750"],
    ]);
    expect(new Set(s.history.map((h) => h.id)).size).toBe(2);
  });

  it("= 반복도 기록한다", () => {
    const s = run("5+3==");
    expect(s.history.map((h) => [h.expr, h.result])).toEqual([
      ["8 + 3", "11"],
      ["5 + 3", "8"],
    ]);
  });

  it("최근 10건만 남긴다", () => {
    let s = INITIAL_CALC_STATE;
    for (let i = 1; i <= 12; i += 1) s = run(`${i}+1=`, s);
    expect(s.history).toHaveLength(CALC_HISTORY_MAX);
    expect(s.history[0].expr).toBe("12 + 1");
    expect(s.history[9].expr).toBe("3 + 1");
    expect(new Set(s.history.map((h) => h.id)).size).toBe(10);
  });

  it("C 와 오류는 기록을 지우지 않는다", () => {
    const s = run("1+1=C5÷0=C");
    expect(s.history.map((h) => h.expr)).toEqual(["1 + 1"]);
  });

  it("기록을 누르면 그 결과를 현재 값으로 불러온다 — 아랫줄에 값, 식은 비고, = 는 아무 일도 안 한다", () => {
    const s = calcReducer(run("1250×3=C"), { type: "recall", value: "3750" });
    expect(displayText(s)).toBe("3,750");
    expect(exprText(s)).toBe("");
    expect(displayText(calcReducer(s, { type: "equals" }))).toBe("3,750");
    expect(calcReducer(s, { type: "equals" }).history).toHaveLength(1); // 숫자 하나의 = 는 기록을 늘리지 않는다
  });

  it("불러온 값에서 이어 계산하거나 새 숫자를 입력한다", () => {
    const base = run("1250×3=");
    const recalled = calcReducer(base, { type: "recall", value: "20" });
    expect(displayText(run("+1=", recalled))).toBe("21");
    expect(displayText(run("7", recalled))).toBe("7");
  });

  it("식 도중에 불러오면 입력 값만 바꾼다 — 5 + [20] = 25", () => {
    const s = calcReducer(run("1+1=C5+"), { type: "recall", value: "20" });
    expect(exprText(s)).toBe("5 + 20");
    expect(displayText(run("=", s))).toBe("25");
  });

  it("결과·오류 뒤에 불러오면 반복 연산·오류를 버리고 그 값으로 시작한다", () => {
    const afterResult = calcReducer(run("5+3="), { type: "recall", value: "20" });
    expect(afterResult.repeat).toBeNull();
    expect(displayText(calcReducer(afterResult, { type: "equals" }))).toBe("20");
    const afterError = calcReducer(run("5÷0="), { type: "recall", value: "9" });
    expect(afterError.mode).toBe("input");
    expect(displayText(afterError)).toBe("9");
  });
});

describe("표시 값·복사 값", () => {
  it("복사 값은 쉼표 없는 숫자다", () => {
    expect(copyValue(run("1250"))).toBe("1250");
    expect(copyValue(run("1250×3="))).toBe("3750");
    expect(copyValue(run("1250."))).toBe("1250"); // 끝의 소수점은 뗀다
    expect(copyValue(run("1250.5"))).toBe("1250.5");
    expect(copyValue(INITIAL_CALC_STATE)).toBe("0");
    expect(copyValue(run("123456789012345×10="))).toBe("1.23456789012345e+15");
  });

  it("입력이 없는 식의 아랫줄은 직전 숫자", () => {
    expect(displayValue(run("5+"))).toBe("5");
  });

  it("음수 부호는 보일 때만 −(U+2212)로 바꾼다 — 윗줄 식·기록 식·아랫줄은 −, 복사 값·내부 값은 하이픈 그대로", () => {
    const s = run("5−5±");
    expect(exprText(s)).toBe("5 − −5"); // 연산자 − 와 음수 부호 − 가 같은 글리프
    expect(displayText(s)).toBe("−5");
    expect(copyValue(s)).toBe("-5");
    expect(s.entry).toBe("-5");
    const done = run("5−5±=");
    expect(done.history[0]).toEqual({ id: 1, expr: "5 − −5", result: "10" });
    expect(copyValue(run("5±"))).toBe("-5");
    expect(copyValue(run("123456789012345×10±="))).toBe("-1.23456789012345e+15");
    expect(displayText(INITIAL_CALC_STATE)).not.toContain("-");
  });
});

describe("키보드 매핑", () => {
  it("숫자·연산자·계산·지우기·소수점", () => {
    for (let d = 0; d <= 9; d += 1) expect(calcActionForKey(String(d))).toEqual({ type: "digit", digit: String(d) });
    expect(calcActionForKey("+")).toEqual({ type: "operator", op: "+" });
    expect(calcActionForKey("-")).toEqual({ type: "operator", op: "−" });
    expect(calcActionForKey("*")).toEqual({ type: "operator", op: "×" });
    expect(calcActionForKey("/")).toEqual({ type: "operator", op: "÷" });
    expect(calcActionForKey("Enter")).toEqual({ type: "equals" });
    expect(calcActionForKey("=")).toEqual({ type: "equals" });
    expect(calcActionForKey("Backspace")).toEqual({ type: "backspace" });
    expect(calcActionForKey("Escape")).toEqual({ type: "clear" });
    expect(calcActionForKey("Delete")).toEqual({ type: "clear" });
    expect(calcActionForKey("%")).toEqual({ type: "percent" });
    expect(calcActionForKey(".")).toEqual({ type: "decimal" });
  });

  it("F9 는 ±(Windows 계산기와 같은 키)", () => {
    expect(calcActionForKey("F9")).toEqual({ type: "negate" });
    expect(calcActionForKey("F9", "F9")).toEqual({ type: "negate" });
  });

  it("쉼표는 숫자패드 소수점(code NumpadDecimal)일 때만 소수점이고, 일반 쉼표는 무시한다 — 천 단위 쉼표를 버릇대로 쳐도 1,250 이 1.250 이 되지 않는다", () => {
    expect(calcActionForKey(",", "NumpadDecimal")).toEqual({ type: "decimal" });
    expect(calcActionForKey(",")).toBeNull();
    expect(calcActionForKey(",", "Comma")).toBeNull();
    expect(calcActionForKey(".", "NumpadDecimal")).toEqual({ type: "decimal" });
    expect(calcActionForKey(".", "Period")).toEqual({ type: "decimal" });
  });

  it("aria-keyshortcuts 값에 받는 키(숫자·연산자·Enter·Backspace·Escape·F9)가 모두 들어 있다", () => {
    const keys = CALC_KEY_SHORTCUTS.split(" ");
    for (const k of ["0", "9", "Plus", "-", "*", "/", "%", ".", "=", "Enter", "Backspace", "Escape", "Delete", "F9"]) {
      expect(keys).toContain(k);
    }
  });

  it("처리하지 않는 키는 null — 글자·Tab·방향키·F 키·스페이스", () => {
    for (const k of ["a", "A", "Tab", "ArrowLeft", "F5", " ", "Shift", "Control", "x", "10", ""]) {
      expect(calcActionForKey(k)).toBeNull();
    }
  });
});

describe("기록 칸·글자 크기", () => {
  it("설정이 켜져 있고 본문 너비가 420px 이상일 때만 기록 칸을 보인다", () => {
    expect(historyVisible(true, 420)).toBe(true);
    expect(historyVisible(true, 800)).toBe(true);
    expect(historyVisible(true, 419)).toBe(false);
    expect(historyVisible(true, 0)).toBe(false); // 너비를 모르면 숨긴다
    expect(historyVisible(false, 800)).toBe(false);
  });

  it("본문 크기를 모르면 null(스타일의 기본 크기)", () => {
    expect(calcFonts(0, 300, false, "0")).toBeNull();
    expect(calcFonts(300, null, false, "0")).toBeNull();
    expect(calcFonts(300, 0, false, "0")).toBeNull();
  });

  it("본문이 커질수록 단추 글자가 커지고 한도 안에서 멈춘다", () => {
    const small = calcFonts(200, 200, false, "0")!;
    const mid = calcFonts(340, 300, false, "0")!;
    const big = calcFonts(900, 900, false, "0")!;
    expect(small.key).toBeGreaterThanOrEqual(11);
    expect(mid.key).toBeGreaterThan(small.key);
    expect(big.key).toBeGreaterThanOrEqual(mid.key);
    expect(big.key).toBeLessThanOrEqual(24);
    expect(big.value).toBeLessThanOrEqual(34);
  });

  it("긴 값은 표시창 큰 글씨가 줄지만 10px 아래로는 안 내려간다", () => {
    const short = calcFonts(300, 300, false, "7")!;
    const long = calcFonts(300, 300, false, "−1,234,567,890,123,456")!;
    expect(long.value).toBeLessThan(short.value);
    expect(CALC_VALUE_MIN_FONT).toBe(10);
    expect(calcFonts(120, 300, false, "−1,234,567,890,123,456")!.value).toBe(10);
    // 하한이 12 일 때는 12 에서 멈췄을 너비에서 더 줄어든다 — 좁은 칸에서도 최대한 한 줄에 담는다
    const narrow = calcFonts(200, 300, false, "−1,234,567,890,123,456")!;
    expect(narrow.value).toBeLessThan(12);
    expect(narrow.value).toBeGreaterThanOrEqual(10);
  });

  it("기록 칸이 보이면 그만큼 단추 칸이 좁아져 글자도 작아진다", () => {
    const without = calcFonts(440, 400, false, "0")!;
    const withHistory = calcFonts(440, 400, true, "0")!;
    expect(withHistory.key).toBeLessThanOrEqual(without.key);
  });
});
