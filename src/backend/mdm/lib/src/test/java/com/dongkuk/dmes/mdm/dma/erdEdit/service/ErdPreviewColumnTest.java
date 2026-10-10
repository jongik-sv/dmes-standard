package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** 미리보기 임시 컬럼의 타입이 copyDomain 과 같은 대응(ErdTypeMapping.physicalOf, S2-3)을 따른다. */
class ErdPreviewColumnTest {

    @Test
    void stringDomainPreviewsAsVarchar2() {
        ErdColumn c = ErdEditService.previewColumn("MENU_NM", Optional.of(new ErdDomainSpec(7L, "명", "STRING", 100, null)));
        assertThat(c.phys).isEqualTo("MENU_NM");
        assertThat(c.domainId).isEqualTo(7L);
        assertThat(c.dataType).isEqualTo("VARCHAR2");
        assertThat(c.length).isEqualTo(100);
        assertThat(c.scale).isNull();
    }

    @Test
    void booleanAndTimestampDomainsUsePhysicalTypes() {
        ErdColumn yn = ErdEditService.previewColumn("USE_YN", Optional.of(new ErdDomainSpec(8L, "여부", "BOOLEAN", null, null)));
        assertThat(yn.dataType).isEqualTo("VARCHAR2");
        assertThat(yn.length).isEqualTo(1);
        ErdColumn ts = ErdEditService.previewColumn("REG_DT", Optional.of(new ErdDomainSpec(9L, "일시", "DATE", null, 6)));
        assertThat(ts.dataType).isEqualTo("TIMESTAMP(6)");
        assertThat(ts.length).isNull();
        assertThat(ts.scale).isNull();
    }

    @Test
    void noDomainLeavesTypeEmpty() {
        ErdColumn c = ErdEditService.previewColumn("ABC_ZZ", Optional.empty());
        assertThat(c.domainId).isNull();
        assertThat(c.dataType).isNull();
    }
}
