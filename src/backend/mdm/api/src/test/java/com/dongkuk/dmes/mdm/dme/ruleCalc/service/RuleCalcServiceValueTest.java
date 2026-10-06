package com.dongkuk.dmes.mdm.dme.ruleCalc.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcMessage;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import org.junit.jupiter.api.Test;

/** {@link RuleCalcService} 의 값 변환·메시지 매핑 순수 함수 시험(스프링·DB 없음). */
class RuleCalcServiceValueTest {

    // ── 숫자 크기 방어 ──────────────────────────────────────────────────────

    @Test
    void 자릿수가_너무_큰_NUMBER_입력은_거절한다() {
        assertThrows(IllegalArgumentException.class, () -> RuleCalcService.toInput("1e999999999", "NUMBER"));
        assertThrows(IllegalArgumentException.class, () -> RuleCalcService.toInput("1e-999999999", "NUMBER"));
        assertThrows(IllegalArgumentException.class, () -> RuleCalcService.toInput("9".repeat(1001), "NUMBER"));
        assertThrows(IllegalArgumentException.class, () -> RuleCalcService.toInput("9".repeat(5000), "NUMBER"));
        assertThrows(IllegalArgumentException.class, () -> RuleCalcService.toInput(new BigDecimal("1e999999999"), "NUMBER"));
        assertThrows(IllegalArgumentException.class, () -> RuleCalcService.passThrough(new BigDecimal("1e999999999")));
        assertThrows(IllegalArgumentException.class, () -> RuleCalcService.toInput(new BigDecimal("1e999999999"), "STRING"), "글자 칸에 담을 때 펼치지 않는다");
    }

    @Test
    void 상한_이내의_숫자는_그대로_받는다() {
        assertEquals(new BigDecimal("2.00000000000000000001"), RuleCalcService.toInput("2.00000000000000000001", "NUMBER"));
        assertEquals(new BigDecimal("1e1000"), RuleCalcService.toInput("1e1000", "NUMBER"));
        assertEquals(BigDecimal.valueOf(1200), RuleCalcService.toInput(1200, "NUMBER"));
        assertEquals(new BigDecimal("0.1"), RuleCalcService.toInput(0.1d, "NUMBER"), "double 은 최단 표기로 읽는다");
        assertEquals("0.5", RuleCalcService.toInput(new BigDecimal("0.5"), "STRING"));
    }

    @Test
    void 출력의_큰_BigDecimal_은_펼치지_않고_과학_표기를_유지한다() {
        assertEquals("1.2300", RuleCalcService.format(new BigDecimal("1.2300")));
        assertEquals("1E+999999999", RuleCalcService.format(new BigDecimal("1e999999999")));
        assertEquals("1E-999999999", RuleCalcService.format(new BigDecimal("1e-999999999")));
        assertEquals(List.of("1", "1E+5000"), RuleCalcService.format(List.of(BigDecimal.ONE, new BigDecimal("1e5000"))));
    }

    // ── 타입을 풀지 못한 입력은 받은 타입 그대로 ────────────────────────────

    @Test
    void passThrough_는_불린_숫자_글자를_받은_타입_그대로_넘긴다() {
        assertSame(Boolean.TRUE, RuleCalcService.passThrough(true));
        assertEquals("Hot", RuleCalcService.passThrough("Hot"), "글자는 글자 그대로");
        assertSame(Boolean.TRUE, RuleCalcService.passThrough(" true "), "정확히 TRUE·FALSE 글자만 불린으로 읽는다(IF 전용 불린 변수)");
        assertSame(Boolean.FALSE, RuleCalcService.passThrough("FALSE"));
        assertEquals("TRUE_LOVE", RuleCalcService.passThrough("TRUE_LOVE"));
        assertEquals(new BigDecimal("2.0"), RuleCalcService.passThrough(new BigDecimal("2.0")));
        assertEquals(BigDecimal.valueOf(7), RuleCalcService.passThrough(7));
        assertThrows(IllegalArgumentException.class, () -> RuleCalcService.passThrough(List.of(1)), "배열·객체는 받지 않는다");
    }

    // ── 엔진 위반 → 메시지 코드 ─────────────────────────────────────────────

    private static Violation violation(Code code, String name) {
        return new Violation(Stage.INPUT_CHECK, code, "R1", null, name, "원문", List.of());
    }

    @Test
    void 위반의_이름이_입력_이름이면_INPUT_MISSING_INPUT_INVALID_다() {
        Set<String> inputs = Set.of("COIL_THK", "COIL_WID");
        assertEquals(RuleCalcMessage.INPUT_MISSING, RuleCalcService.violationMessage(violation(Code.MISSING_KEY, "COIL_THK"), inputs).getCode());
        assertEquals(RuleCalcMessage.INPUT_MISSING, RuleCalcService.violationMessage(violation(Code.REQUIRED_NULL, "coil_wid"), inputs).getCode(), "대소문자 무시");
        assertEquals(RuleCalcMessage.INPUT_INVALID, RuleCalcService.violationMessage(violation(Code.TYPE_CONVERSION, "COIL_THK"), inputs).getCode());
    }

    @Test
    void 위반의_이름이_입력이_아니면_모두_EVAL_ERROR_다() {
        Set<String> inputs = Set.of("COIL_THK");
        for (Code code : List.of(Code.MISSING_KEY, Code.REQUIRED_NULL, Code.TYPE_CONVERSION, Code.EVALUATION_ERROR, Code.UNIQUE_MULTIPLE_HITS)) {
            assertEquals(RuleCalcMessage.EVAL_ERROR, RuleCalcService.violationMessage(violation(code, "PRE_FCT"), inputs).getCode(), code.name());
        }
        assertEquals(RuleCalcMessage.EVAL_ERROR, RuleCalcService.violationMessage(violation(Code.MISSING_KEY, null), inputs).getCode(), "이름 없는 위반");
        assertEquals(RuleCalcMessage.EVAL_ERROR, RuleCalcService.violationMessage(violation(Code.EVALUATION_ERROR, "COIL_THK"), inputs).getCode(),
                "입력 이름이어도 키·타입 위반이 아니면 판정 오류");
        assertTrue(RuleCalcService.violationMessage(violation(Code.MISSING_KEY, "PRE_FCT"), inputs).getText().startsWith("[R1] "));
    }
}
