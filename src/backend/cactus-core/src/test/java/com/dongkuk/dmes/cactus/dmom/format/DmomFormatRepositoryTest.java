package com.dongkuk.dmes.cactus.dmom.format;

import org.junit.jupiter.api.Test;
import org.mybatis.spring.SqlSessionTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * DmomFormatRepository 단위 테스트. SqlSessionTemplate mock.
 *
 * <p>핵심: mapUnderscoreToCamelCase=true 로 결과 키가 camelCase 임을 가정한 매핑 검증.
 */
class DmomFormatRepositoryTest {

    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    @Test
    void getActiveLayout_camelCase결과키_매핑() {
        SqlSessionTemplate tmpl = mock(SqlSessionTemplate.class);
        List<Map<String, Object>> rows = List.of(
                row("formatId", "FMT01", "formatVer", new java.math.BigDecimal("1.00"),
                        "itemSeq", 1, "itemTp", "E", "itemId", "A", "itemNm", "항목A",
                        "dataTp", "1", "dataLen", 10, "dataDecimalPrec", 0),
                row("formatId", "FMT01", "formatVer", new java.math.BigDecimal("1.00"),
                        "itemSeq", 2, "itemTp", "E", "itemId", "B", "itemNm", "항목B",
                        "dataTp", "2", "dataLen", 8, "dataDecimalPrec", 2)
        );
        when(tmpl.selectList(eq("DmomMapper.getFormatLayout"), any())).thenReturn((List) rows);

        DmomFormatRepository repo = new DmomFormatRepository(tmpl, "IF_");
        FormatLayout layout = repo.getActiveLayout("TC01", "IFID01");

        assertThat(layout.isEmpty()).isFalse();
        assertThat(layout.formatId()).isEqualTo("FMT01");
        assertThat(layout.items()).hasSize(2);
        FormatItem first = layout.items().get(0);
        assertThat(first.itemSeq()).isEqualTo(1L);
        assertThat(first.itemTp()).isEqualTo("E");
        assertThat(first.itemId()).isEqualTo("A");
        assertThat(first.dataTp()).isEqualTo("1");
        assertThat(first.dataLen()).isEqualTo(10);
        assertThat(layout.items().get(1).dataDecimalPrec()).isEqualTo(2);
    }

    @Test
    void getActiveLayout_조회0건이면_empty() {
        SqlSessionTemplate tmpl = mock(SqlSessionTemplate.class);
        when(tmpl.selectList(eq("DmomMapper.getFormatLayout"), any())).thenReturn(List.of());

        DmomFormatRepository repo = new DmomFormatRepository(tmpl, "IF_");
        assertThat(repo.getActiveLayout("TC01", "IFID01").isEmpty()).isTrue();
    }

    @Test
    void resolveSendTable_SEND_TABLE_ID_우선() {
        SqlSessionTemplate tmpl = mock(SqlSessionTemplate.class);
        when(tmpl.<String>selectOne(eq("DmomMapper.getSendTableId"), any())).thenReturn("IF_CUSTOM_TABLE");

        DmomFormatRepository repo = new DmomFormatRepository(tmpl, "IF_");
        assertThat(repo.resolveSendTable("MMQCMMCMTT01", "TC01")).isEqualTo("IF_CUSTOM_TABLE");
    }

    @Test
    void resolveSendTable_미지정시_prefix_fallback() {
        SqlSessionTemplate tmpl = mock(SqlSessionTemplate.class);
        when(tmpl.<String>selectOne(eq("DmomMapper.getSendTableId"), any())).thenReturn(null);

        DmomFormatRepository repo = new DmomFormatRepository(tmpl, "IF_");
        assertThat(repo.resolveSendTable("MMQCMMCMTT01", "TC01")).isEqualTo("IF_MMQCMMCMTT01");
    }
}
