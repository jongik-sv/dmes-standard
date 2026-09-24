package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** TSK-08-02 design §3.1 「RuleCellsCodecTest」·I17 — 셀 JSON 은 06 모양 그대로, 값을 고치지 않는다. */
class RuleCellsCodecTest {

    private static final Set<Integer> VARS = Set.of(1, 2, 3, 4, 5);

    @ParameterizedTest
    @ValueSource(strings = {
        "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.60\",\"right\":\"2.5\"},\"2\":{\"op\":\"GT\",\"left\":\" 1000 \"},"
                + "\"3\":{\"op\":\"IN\",\"list\":[\"B\",\"A\",\"A\"]},\"4\":{\"val\":\"A\"},\"5\":{\"expr\":\"1.05\",\"ast\":{\"type\":\"NUMBER_LITERAL\",\"value\":\"1.05\"}}}",
        "{\"3\":{\"op\":\"NA\"},\"1\":{\"op\":\"IS_NULL\"}}",
        "{}"
    })
    void 값을_고치지_않고_바이트_단위로_왕복한다(String json) {
        Map<Integer, Map<String, Object>> cells = RuleCellsCodec.parse(json);
        assertDoesNotThrow(() -> RuleCellsCodec.validateShape(cells, VARS));
        assertEquals(json, RuleCellsCodec.write(cells));
    }

    @Test
    void 키_순서를_보존한다() {
        assertEquals(List.of(3, 1), List.copyOf(RuleCellsCodec.parse("{\"3\":{\"op\":\"NA\"},\"1\":{\"op\":\"NA\"}}").keySet()));
    }

    @Test
    void 일곱_키_밖의_키는_거부한다() {
        assertInvalid("{\"1\":{\"op\":\"EQ\",\"left\":\"A\",\"text\":\"= A\"}}", "text");
        assertInvalid("{\"1\":{\"op\":\"NA\",\"meta\":{}}}", "meta");
    }

    @Test
    void 숫자_값은_거부한다() {
        assertInvalid("{\"1\":{\"op\":\"GT\",\"left\":1000}}", "left");
    }

    @Test
    void list_는_문자열_배열이어야_한다() {
        assertInvalid("{\"1\":{\"op\":\"IN\",\"list\":[\"A\",1]}}", "list");
        assertInvalid("{\"1\":{\"op\":\"IN\",\"list\":\"A\"}}", "list");
    }

    @Test
    void ast_는_객체여야_한다() {
        assertInvalid("{\"1\":{\"expr\":\"A > 1\",\"ast\":\"x\"}}", "ast");
    }

    @Test
    void null_값은_거부한다() {
        assertInvalid("{\"1\":{\"op\":\"EQ\",\"left\":null}}", "left");
    }

    @Test
    void 그_버전에_없는_var_id_는_거부한다() {
        assertInvalid("{\"9\":{\"op\":\"NA\"}}", "9");
    }

    @Test
    void 정수가_아닌_키와_객체가_아닌_셀과_JSON_아닌_문자열은_거부한다() {
        assertEquals(ErrorCode.INVALID_VALUE, assertThrows(BusinessException.class, () -> RuleCellsCodec.parse("{\"A\":{\"op\":\"NA\"}}")).getErrorCode());
        assertEquals(ErrorCode.INVALID_VALUE, assertThrows(BusinessException.class, () -> RuleCellsCodec.parse("{\"1\":\"NA\"}")).getErrorCode());
        assertEquals(ErrorCode.INVALID_VALUE, assertThrows(BusinessException.class, () -> RuleCellsCodec.parse("[1]")).getErrorCode());
        assertEquals(ErrorCode.INVALID_VALUE, assertThrows(BusinessException.class, () -> RuleCellsCodec.parse("not json")).getErrorCode());
    }

    @Test
    void 행_표시를_주면_메시지에_싣는다() {
        Map<Integer, Map<String, Object>> cells = RuleCellsCodec.parse("{\"2\":{\"op\":\"GT\",\"left\":1}}");
        BusinessException e = assertThrows(BusinessException.class, () -> RuleCellsCodec.validateShape(cells, VARS, "3행"));
        assertTrue(e.getMessage().contains("3행") && e.getMessage().contains("2"), e.getMessage());
    }

    private static void assertInvalid(String json, String mention) {
        BusinessException e = assertThrows(BusinessException.class, () -> RuleCellsCodec.validateShape(RuleCellsCodec.parse(json), VARS));
        assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode());
        assertTrue(e.getMessage().contains(mention), e.getMessage());
    }
}
