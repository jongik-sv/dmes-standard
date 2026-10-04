package com.dongkuk.dmes.mdm.common.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.common.BusinessException;
import org.junit.jupiter.api.Test;

class MdmStringsTest {

    @Test
    void blankToNull_공백이면_null_아니면_trim() {
        assertThat(MdmStrings.blankToNull(null)).isNull();
        assertThat(MdmStrings.blankToNull("  \t")).isNull();
        assertThat(MdmStrings.blankToNull(" ")).isNull();
        assertThat(MdmStrings.blankToNull(" a b ")).isEqualTo("a b");
    }

    @Test
    void trimToNull_trim_결과가_비면_null() {
        assertThat(MdmStrings.trimToNull(null)).isNull();
        assertThat(MdmStrings.trimToNull("   ")).isNull();
        assertThat(MdmStrings.trimToNull(" a ")).isEqualTo("a");
        // trim 이 자르지 않는 유니코드 공백은 blankToNull 과 달리 그대로 남는다(기존 동작 보존)
        assertThat(MdmStrings.trimToNull(" ")).isEqualTo(" ");
    }

    @Test
    void str_null이면_null_아니면_toString() {
        assertThat(MdmStrings.str(null)).isNull();
        assertThat(MdmStrings.str(12)).isEqualTo("12");
        assertThat(MdmStrings.str(" x ")).isEqualTo(" x ");
    }

    @Test
    void invalid_는_INVALID_INPUT_예외를_만든다() {
        BusinessException e = MdmErrors.invalid("값이 틀림");
        assertThat(e.getMessage()).contains("값이 틀림");
        assertThat(e.getMessage()).isEqualTo(
                MdmErrors.of(com.dongkuk.dmes.mdm.contract.common.MdmErrorCode.INVALID_INPUT, "값이 틀림", java.util.List.of()).getMessage());
    }
}
