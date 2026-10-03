package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.ColumnMeta;
import org.junit.jupiter.api.Test;

/**
 * 메타 피드 컬럼 값의 설명 칸(D-150). 설명이 HTML 이면 {@code descriptionHtml} = 소독본(피드에서 한 번 더 소독 — 옛 데이터 방어),
 * {@code description} = 그 글자만. 일반 글이면 {@code descriptionHtml} = null, {@code description} 은 저장된 그대로다. 활용처 메모도 HTML 이면
 * 글자만 싣는다({@code usageNoteHtml} 칸은 없다).
 */
class MetaFeedDictionaryDescriptionTest {

    @Test
    void HTML_설명은_소독본과_글자만을_나눠_싣는다() {
        ColumnMeta m = meta("<p>a &lt; b &amp; c</p><p onclick=\"x()\">둘째</p><script>alert(1)</script>");

        assertEquals("<p>a &lt; b &amp; c</p><p>둘째</p>", m.descriptionHtml(), "소독하지 않고 저장된 옛 데이터도 피드에서 소독한다");
        assertEquals("a < b & c\n둘째", m.description(), "글자만 그리는 옛 소비자는 태그 대신 글자를 본다");
    }

    @Test
    void 일반_글_설명은_그대로_싣고_descriptionHtml_은_null() {
        ColumnMeta m = meta("a < b & Map<String>\n둘째 줄");

        assertNull(m.descriptionHtml());
        assertEquals("a < b & Map<String>\n둘째 줄", m.description());
    }

    @Test
    void 설명이_없으면_둘_다_null() {
        ColumnMeta m = meta(null);

        assertNull(m.descriptionHtml());
        assertNull(m.description());
    }

    @Test
    void 글자가_없는_HTML_설명은_description_이_null() {
        ColumnMeta m = meta("<hr>");

        assertEquals("<hr>", m.descriptionHtml());
        assertNull(m.description());
    }

    @Test
    void 소독_뒤_알려진_태그가_남지_않는_옛_데이터는_p_로_감싼_HTML_로_싣는다() {
        ColumnMeta m = meta("<td>x &amp; y</td>"); // 표 밖의 td 는 파서가 버린다

        assertEquals("<p>x &amp; y</p>", m.descriptionHtml());
        assertEquals("x & y", m.description());
    }

    /** 검토 C1 — 엔티티로만 쓴 태그가 풀려 소독되지 않은 HTML 로 descriptionHtml 에 나가지 않는다. description 은 늘 글자로 그리는 칸이다. */
    @Test
    void 엔티티로만_쓴_태그는_descriptionHtml_에서_엔티티_그대로다() {
        ColumnMeta m = meta("<td>&lt;img src=x onerror=alert(1)&gt;</td>");

        assertEquals("<p>&lt;img src=x onerror=alert(1)&gt;</p>", m.descriptionHtml());
        assertEquals("<img src=x onerror=alert(1)>", m.description(), "글자 칸 — 소비자는 판별하지 않고 글자로 그린다(가이드 §11)");
    }

    @Test
    void 일반_글_활용처_메모와_별칭_칸은_그대로다() {
        MdmColumn c = column("<p>설명</p>");
        c.setUsageNote("메모 a < b");

        ColumnMeta m = MetaFeedDictionary.columnMeta(c, null, "MES", "Coil_T");

        assertEquals("메모 a < b", m.usageNote());
        assertEquals("MES", m.matchedSystem());
        assertEquals("Coil_T", m.systemPhysName());
        assertEquals("<p>설명</p>", m.descriptionHtml());
    }

    @Test
    void HTML_활용처_메모는_다시_소독한_뒤_글자만_싣는다() {
        MdmColumn c = column("설명");
        c.setUsageNote("<p>메모 &lt; 1</p><ul><li>화면 A</li></ul><script>alert(1)</script>");

        assertEquals("메모 < 1\n화면 A", MetaFeedDictionary.columnMeta(c, null, null, null).usageNote());

        c.setUsageNote("<hr>");
        assertNull(MetaFeedDictionary.columnMeta(c, null, null, null).usageNote(), "글자가 없으면 null");
    }

    private static ColumnMeta meta(String description) {
        return MetaFeedDictionary.columnMeta(column(description), null, null, null);
    }

    private static MdmColumn column(String description) {
        MdmColumn c = new MdmColumn("코일 두께", "COIL_THK", null);
        c.setDescription(description);
        return c;
    }
}
