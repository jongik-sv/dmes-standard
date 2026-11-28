package com.dongkuk.dmes.mdm.common.dictionary;

import static com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures.node;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.entity.MdmColumn;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.junit.jupiter.api.Test;

/** 컬럼 유효 타입 규칙 — 도메인 체인 먼저, 없으면 컬럼 기본 타입(2026-11-26 컬럼 기본 타입 결정). DB 없음. */
class ColumnEffectiveTypeTest {

    private final MdmEvaluator ev = DomainFixtures.evaluator();

    private DomainTreeSnapshot tree() {
        return DomainTreeSnapshot.of(List.of(
                node(1).name("중량").std("WGT").kind("QTY").type("NUMBER").length(12).scale(3).build(ev),
                node(2).name("포장 중량").std("PKG_WGT").kind("QTY").type("NUMBER").parent(1L).length(8).build(ev)));
    }

    private static MdmColumn column(Long domainId, String dataType, Integer length, Integer scale) {
        MdmColumn c = new MdmColumn("컬럼", "COL_X", domainId);
        c.setDataType(dataType);
        c.setLength(length);
        c.setScale(scale);
        return c;
    }

    @Test
    void 도메인_있는_컬럼은_기본_타입_칸과_무관하게_도메인_체인_값을_낸다() {
        ColumnEffectiveType t = ColumnEffectiveType.of(column(2L, "STRING", 99, null), tree());

        assertEquals(new ColumnEffectiveType("NUMBER", 8, 3, ColumnEffectiveType.Source.DOMAIN), t);
        assertEquals("DOMAIN", t.sourceName());
    }

    @Test
    void 도메인_없는_컬럼은_기본_타입을_내고_타입도_없으면_NONE() {
        assertEquals(new ColumnEffectiveType("NUMBER", 13, 3, ColumnEffectiveType.Source.BASE),
                ColumnEffectiveType.of(column(null, "NUMBER", 13, 3), tree()));

        ColumnEffectiveType none = ColumnEffectiveType.of(column(null, null, null, null), tree());
        assertEquals(ColumnEffectiveType.NONE, none);
        assertNull(none.sourceName());
    }

    @Test
    void 스냅샷에_없는_도메인은_기본_타입으로_넘어간다() {
        assertEquals(new ColumnEffectiveType("STRING", 7, null, ColumnEffectiveType.Source.BASE),
                ColumnEffectiveType.of(column(404L, "STRING", 7, null), tree()));
    }
}
