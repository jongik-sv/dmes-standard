package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** spec §5.5 이름 정규화 — 소문자가 섞이면 camelCase 로 보고 UPPER_SNAKE, 이미 대문자면 그대로. */
class MdmNamesTest {

    @Test
    void camelCase_는_UPPER_SNAKE_로_바꾸고_대문자는_그대로_둔다() {
        assertThat(MdmNames.toPhysName("codeNm")).isEqualTo("CODE_NM");
        assertThat(MdmNames.toPhysName("coilThk")).isEqualTo("COIL_THK");
        assertThat(MdmNames.toPhysName("item2Cd")).isEqualTo("ITEM2_CD");
        assertThat(MdmNames.toPhysName("lvl1")).isEqualTo("LVL1");
        assertThat(MdmNames.toPhysName("Code_nm")).isEqualTo("CODE_NM");
        assertThat(MdmNames.toPhysName("CODE_NM")).isEqualTo("CODE_NM");
        assertThat(MdmNames.toPhysName(" COIL_THK ")).isEqualTo("COIL_THK");
    }

    @Test
    void 비거나_null_이면_null() {
        assertThat(MdmNames.toPhysName(null)).isNull();
        assertThat(MdmNames.toPhysName("  ")).isNull();
    }
}
