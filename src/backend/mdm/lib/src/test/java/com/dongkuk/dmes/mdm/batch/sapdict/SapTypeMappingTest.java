package com.dongkuk.dmes.mdm.batch.sapdict;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.batch.sapdict.SapTypeMapping.ValueDefinition;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDataType;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainKind;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * TSK-04-05 design.md §3.3 — SAP {@code DATATYPE} → 마루 값 정의 매핑 표(§4.2, 불변 규칙 I8). 표의 모든 행을
 * 파라미터로 확인하고, 표에 없는 타입은 {@code Optional.empty()}(→ {@code UNSUPPORTED_TYPE})임을 고정한다.
 */
class SapTypeMappingTest {

    @ParameterizedTest(name = "{0} LENG={1} DECIMALS={2} → {7}")
    @CsvSource(nullValues = "null", value = {
            // datatype, leng, decimals, data_type, length, scale, kind_hint, domain_key
            "CHAR, 20, 0, STRING, 20, null, null, STRING(20)",
            "NUMC, 6, 0, STRING, 6, null, null, STRING(6)",
            "CLNT, 3, 0, STRING, 3, null, null, STRING(3)",
            "LANG, 1, 0, STRING, 1, null, null, STRING(1)",
            "CUKY, 5, 0, STRING, 5, null, null, STRING(5)",
            "UNIT, 3, 0, STRING, 3, null, null, STRING(3)",
            "ACCP, 6, 0, STRING, 6, null, null, STRING(6)",
            "SSTR, 255, 0, STRING, 255, null, null, STRING(255)",
            "DATS, 8, 0, STRING, 8, null, DATE, STRING(8):DATE",
            "TIMS, 6, 0, STRING, 6, null, DATE, STRING(6):DATE",
            "DEC, 3, 1, NUMBER, 3, 1, null, 'NUMBER(3,1)'",
            "CURR, 15, 2, NUMBER, 15, 2, null, 'NUMBER(15,2)'",
            "QUAN, 13, 3, NUMBER, 13, 3, QTY, 'NUMBER(13,3):QTY'",
            "INT1, 3, 0, NUMBER, 3, 0, null, 'NUMBER(3,0)'",
            "INT2, 5, 0, NUMBER, 5, 0, null, 'NUMBER(5,0)'",
            "INT4, 10, 0, NUMBER, 10, 0, null, 'NUMBER(10,0)'",
            "INT8, 19, 0, NUMBER, 19, 0, null, 'NUMBER(19,0)'",
    })
    void 매핑_표의_모든_행(String datatype, int leng, int decimals, MdmDataType dataType, Integer length,
            Integer scale, MdmDomainKind kindHint, String domainKey) {
        ValueDefinition def = SapTypeMapping.map(datatype, leng, decimals).orElseThrow();

        assertEquals(dataType, def.dataType());
        assertEquals(length, def.length());
        assertEquals(scale, def.scale());
        assertEquals(kindHint, def.kindHint());
        assertEquals(domainKey, def.domainKey());
    }

    @Test
    void DATS_와_TIMS_는_입력_LENG_와_무관하게_고정_길이다() {
        assertEquals("STRING(8):DATE", SapTypeMapping.map("DATS", 10, 0).orElseThrow().domainKey());
        assertEquals(8, SapTypeMapping.map("DATS", 0, 0).orElseThrow().length());
        assertEquals("STRING(6):DATE", SapTypeMapping.map("TIMS", 8, 0).orElseThrow().domainKey());
    }

    @Test
    void INT_는_DECIMALS_가_있어도_scale_0_이다() {
        ValueDefinition def = SapTypeMapping.map("INT4", 10, 3).orElseThrow();

        assertEquals(0, def.scale());
        assertEquals("NUMBER(10,0)", def.domainKey());
    }

    @Test
    void 문자열_타입은_DECIMALS_가_있어도_scale_이_빈_값이다() {
        assertNull(SapTypeMapping.map("CHAR", 10, 2).orElseThrow().scale());
    }

    @ParameterizedTest
    @ValueSource(strings = {"FLTP", "RAW", "STRG", "LRAW", "RSTR", "D16D", "REF", "", "  "})
    void 표에_없는_타입은_빈_값이다(String datatype) {
        assertTrue(SapTypeMapping.map(datatype, 16, 16).isEmpty(), datatype);
    }

    @Test
    void datatype_은_앞뒤_공백을_떼고_대문자로_비교한다() {
        assertEquals("NUMBER(3,1)", SapTypeMapping.map(" dec ", 3, 1).orElseThrow().domainKey());
        assertEquals("STRING(8):DATE", SapTypeMapping.map("dats", 8, 0).orElseThrow().domainKey());
    }
}
