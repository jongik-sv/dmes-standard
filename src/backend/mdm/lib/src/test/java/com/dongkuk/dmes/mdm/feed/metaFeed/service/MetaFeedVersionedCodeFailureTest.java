package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.metarev.MetaTargetType;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * 코드 목차·본문에서 원장 읽기가 던지면 그 키만 failed 가 되고 묶음은 거부되지 않는다(D-154 T7 minor). 룰·세트·전문 loader 와 같은 보호를 코드도 받는다.
 * 원장 읽기를 HTTP 시험으로는 깨뜨릴 수 없어 원장 질의를 목으로 바꿔 시험한다.
 */
class MetaFeedVersionedCodeFailureTest {

    private static MetaFeedVersioned versionedWith(MasterCodeLedgerQueries ledger) {
        MetaFeedDefinitions definitions = mock(MetaFeedDefinitions.class);
        when(definitions.ledger()).thenReturn(ledger);
        return new MetaFeedVersioned(definitions);
    }

    @Test
    void 코드_목차에서_원장_헤더_읽기가_던지면_그_키만_failed_다() {
        MasterCodeLedgerQueries ledger = mock(MasterCodeLedgerQueries.class);
        when(ledger.header(anyString())).thenThrow(new IllegalStateException("원장 읽기 실패"));

        MetaFeedVersionedResult r = versionedWith(ledger).toc(MetaTargetType.CODE, List.of("BAD_CD"), LocalDateTime.parse("2026-08-01T00:00:00"));

        assertTrue(r.items().isEmpty());
        assertEquals(1, r.failed().size());
        assertEquals("BAD_CD", r.failed().get(0).get("key"));
        assertEquals("원장 읽기 실패", r.failed().get(0).get("message"));
    }

    @Test
    void 코드_본문에서_원장_읽기가_던지면_그_키의_모든_쌍이_같은_메시지로_failed_다() {
        MasterCodeLedgerQueries ledger = mock(MasterCodeLedgerQueries.class);
        when(ledger.header(anyString())).thenThrow(new IllegalStateException("원장 읽기 실패"));

        MetaFeedVersionedResult r = versionedWith(ledger).bodies(MetaTargetType.CODE, List.of(
                new MetaFeedService.BodyKey("BAD_CD", new BigDecimal("1.000"), "1.000"),
                new MetaFeedService.BodyKey("BAD_CD", new BigDecimal("2.000"), "2.000")));

        assertTrue(r.items().isEmpty());
        assertEquals(2, r.failed().size());
        for (Map<String, Object> f : r.failed()) {
            assertEquals("BAD_CD", f.get("key"));
            assertEquals("원장 읽기 실패", f.get("message"));
            assertFalse(String.valueOf(f.get("message")).isBlank());
        }
    }
}
