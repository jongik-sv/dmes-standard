package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import java.util.List;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.ColumnMeta;
import org.junit.jupiter.api.Test;

/** 메타 피드 컬럼 값의 타입 칸 — 도메인이 없으면 컬럼 기본 타입을 싣는다(단위·도메인 파생 칸은 없다). */
class MetaFeedDictionaryBaseTypeTest {

    @Test
    void 도메인_없는_컬럼은_기본_타입을_싣고_도메인_파생_칸은_비운다() {
        MdmColumn c = new MdmColumn("코일 두께", "COIL_THK", null);
        c.setDataType("NUMBER");
        c.setLength(10);
        c.setScale(2);

        ColumnMeta m = MetaFeedDictionary.columnMeta(c, null, null, null);

        assertEquals("NUMBER", m.dataType());
        assertEquals(10, m.length());
        assertEquals(2, m.scale());
        assertNull(m.domain());
        assertNull(m.stdExpr());
        assertNull(m.bizExpr());
        assertNull(m.codeRef());
        assertTrue(m.bizRequiredVars().isEmpty());
    }

    @Test
    void 타입_있는_도메인은_컬럼_기본_타입보다_먼저_이긴다() {
        DomainNode node = new DomainNode(7L, null, "두께", "THK", "NUMBER", "NUMBER", 8, 1, null, null, null,
                null, null, null, null, null, null, null, null);
        EffectiveDomainView view = new EffectiveDomainView(7L, "NUMBER", "NUMBER", 8, 1, null, null, null, null, null,
                null, null, null);
        MetaFeedDictionary.Chain chain = new MetaFeedDictionary.Chain(List.of(node), view);
        MdmColumn c = new MdmColumn("코일 두께", "COIL_THK", 7L);
        c.setDataType("STRING");
        c.setLength(99);
        c.setScale(9);

        ColumnMeta m = MetaFeedDictionary.columnMeta(c, chain, null, null);

        assertEquals("NUMBER", m.dataType());
        assertEquals(8, m.length());
        assertEquals(1, m.scale());
    }

    @Test
    void 도메인도_기본_타입도_없으면_타입_칸은_null() {
        ColumnMeta m = MetaFeedDictionary.columnMeta(new MdmColumn("코일 두께", "COIL_THK", null), null, null, null);

        assertNull(m.dataType());
        assertNull(m.length());
        assertNull(m.scale());
    }
}
