package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** TSK-08-02 design §3.1 「RuleIdRulesTest」·I1 — 룰 ID 는 컬럼 물리명 규칙(정규식 + 50자 이하)이다. */
class RuleIdRulesTest {

    @ParameterizedTest
    @ValueSource(strings = {"QLTY_GRD_JDG", "A", "B2", "BASE_SPD_LKP", "X_1_2"})
    void 물리명_규칙을_지키면_통과한다(String id) {
        assertDoesNotThrow(() -> RuleIdRules.validateRuleId(id));
    }

    @Test
    void _50자는_통과한다() {
        assertDoesNotThrow(() -> RuleIdRules.validateRuleId("A".repeat(50)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"qlty_grd", "QLTY__GRD", "_QLTY", "QLTY_", "QLTY-GRD", "1QLTY", "QLTY GRD", "품질"})
    void 규칙을_어기면_INVALID_VALUE_다(String id) {
        BusinessException e = assertThrows(BusinessException.class, () -> RuleIdRules.validateRuleId(id));
        assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode());
        assertTrue(e.getMessage().contains("컬럼 물리명 규칙"), e.getMessage());
    }

    @Test
    void _51자는_INVALID_VALUE_다() {
        BusinessException e = assertThrows(BusinessException.class, () -> RuleIdRules.validateRuleId("A".repeat(51)));
        assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "\t"})
    void 비었으면_REQUIRED_VALUE_다(String id) {
        assertEquals(ErrorCode.REQUIRED_VALUE, assertThrows(BusinessException.class, () -> RuleIdRules.validateRuleId(id)).getErrorCode());
    }

    @Test
    void null_은_REQUIRED_VALUE_다() {
        assertEquals(ErrorCode.REQUIRED_VALUE, assertThrows(BusinessException.class, () -> RuleIdRules.validateRuleId(null)).getErrorCode());
    }
}
