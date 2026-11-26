package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** ERD 사전 — 도메인 없는 컬럼의 기본 타입을 물리명으로 찾는다. 도메인 있는 컬럼은 기본 타입을 싣지 않는다(도메인 우선). */
class ErdDictionaryBaseTypeTest {

    private static final ErdDomainSpec BASE = new ErdDomainSpec(null, null, "NUMBER", 10, 2);

    @Test
    void 도메인_없는_컬럼의_기본_타입을_물리명으로_찾는다() {
        var index = ErdDictionary.index(
                List.of(new ErdDictionary.ColumnRow(1L, "COIL_THK", "코일 두께", null, BASE)), List.of());
        ErdDictionary d = dict(index);

        assertThat(d.baseType("coil_thk")).contains(BASE);
        assertThat(d.fillByPhys("COIL_THK").domainId()).isNull();
    }

    @Test
    void 도메인_있는_컬럼은_기본_타입을_버린다() {
        var index = ErdDictionary.index(
                List.of(new ErdDictionary.ColumnRow(1L, "COIL_THK", "코일 두께", 7L, BASE)), List.of());
        ErdDictionary d = dict(index);

        assertThat(d.baseType("COIL_THK")).isEmpty();
        assertThat(d.fillByPhys("COIL_THK").domainId()).isEqualTo(7L);
    }

    @Test
    void 로더는_도메인_없고_타입_있는_컬럼만_기본_타입_스펙을_만든다() {
        MdmColumn plain = new MdmColumn("코일 두께", "COIL_THK", null);
        plain.setDataType("STRING");
        plain.setLength(5);
        MdmColumn withDomain = new MdmColumn("코일 두께", "COIL_THK", 7L);
        withDomain.setDataType("STRING");

        assertThat(ErdDictionaryLoader.baseSpec(plain)).isEqualTo(new ErdDomainSpec(null, null, "STRING", 5, null));
        assertThat(ErdDictionaryLoader.baseSpec(withDomain)).isNull();
        assertThat(ErdDictionaryLoader.baseSpec(new MdmColumn("a", "A", null))).isNull();
    }

    private static ErdDictionary dict(Map<String, ErdDictionary.ColumnEntry> index) {
        return new ErdDictionary(TermDictionary.of(List.of()), Set.of(), Set.of(), Map.of(), List.of(), index);
    }
}
