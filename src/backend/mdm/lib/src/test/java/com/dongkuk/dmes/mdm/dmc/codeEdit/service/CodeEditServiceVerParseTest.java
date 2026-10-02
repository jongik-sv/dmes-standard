package com.dongkuk.dmes.mdm.dmc.codeEdit.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import org.junit.jupiter.api.Test;

/** CodeEditService 의 버전 문자열 해석은 공통 규칙으로 지수 표기를 거부한다(MDM021). */
class CodeEditServiceVerParseTest {

    @Test
    void parsesPlainVersion() {
        assertEquals("1.001", CodeEditService.parseVer("1.001").toPlainString());
        assertEquals("2.000", CodeEditService.parseVer(" 2 ").toPlainString());
    }

    @Test
    void exponentNotationAndBadFormatAreInvalidInput() {
        for (String bad : new String[] {"1e5", "1e999999999", "-1", "1.0001", " ", "abc"}) {
            BusinessException e = assertThrows(BusinessException.class, () -> CodeEditService.parseVer(bad), bad);
            assertEquals(MdmErrorCode.INVALID_INPUT.code(), e.getErrors().get(0).code(), bad);
        }
    }
}
