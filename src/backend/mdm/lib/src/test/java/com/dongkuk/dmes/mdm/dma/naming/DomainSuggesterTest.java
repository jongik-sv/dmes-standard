package com.dongkuk.dmes.mdm.dma.naming;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-04-04 design.md §3.2 D1~D5 — 물리명 꼬리와 도메인 표준명의 최장 일치(불변 규칙 I9, D4).
 */
class DomainSuggesterTest {

    private static final DomainEntry COIL_THK = new DomainEntry(10L, "코일 두께", "COIL_THK");
    private static final DomainEntry RMTL_COIL_THK = new DomainEntry(11L, "원재료 코일 두께", "RMTL_COIL_THK");

    @Test
    void D1_꼬리가_가장_길게_일치하는_도메인을_추천한다() {
        List<DomainMatch> matches = DomainSuggester.suggest("RMTL_COIL_THK", List.of(COIL_THK, RMTL_COIL_THK));

        assertEquals(List.of(11L, 10L), matches.stream().map(m -> m.domain().domainId()).toList());
        assertEquals(List.of(3, 2), matches.stream().map(DomainMatch::matchLength).toList());
        assertEquals(11L, DomainSuggester.recommended(matches).domainId());
    }

    @Test
    void D2_꼬리가_자리_표시자면_추천이_없다() {
        List<DomainMatch> matches = DomainSuggester.suggest("RMTL_COIL_THK_***", List.of(COIL_THK, RMTL_COIL_THK,
                new DomainEntry(12L, "이상", "***")));

        assertTrue(matches.isEmpty());
        assertNull(DomainSuggester.recommended(matches));
    }

    @Test
    void D3_같은_길이_일치는_domainId_오름차순() {
        DomainEntry a = new DomainEntry(21L, "두께 B", "COIL_THK");
        DomainEntry b = new DomainEntry(20L, "두께 A", "COIL_THK");

        List<DomainMatch> matches = DomainSuggester.suggest("RMTL_COIL_THK", List.of(a, b));

        assertEquals(List.of(20L, 21L), matches.stream().map(m -> m.domain().domainId()).toList());
    }

    @Test
    void D4_도메인이_물리명보다_길면_일치하지_않는다() {
        assertTrue(DomainSuggester.suggest("COIL_THK", List.of(RMTL_COIL_THK)).isEmpty());
    }

    @Test
    void 머리나_중간만_같은_도메인은_일치하지_않는다() {
        DomainEntry head = new DomainEntry(30L, "원재료 코일", "RMTL_COIL");
        DomainEntry partial = new DomainEntry(31L, "일 두께", "OIL_THK");

        assertTrue(DomainSuggester.suggest("RMTL_COIL_THK", List.of(head, partial)).isEmpty());
    }

    @Test
    void D5_빈_도메인_목록은_빈_결과() {
        assertTrue(DomainSuggester.suggest("RMTL_COIL_THK", List.of()).isEmpty());
        assertTrue(DomainSuggester.suggest("", List.of(COIL_THK)).isEmpty());
    }
}
