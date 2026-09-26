package com.dongkuk.dmes.mdm.entity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.function.BiConsumer;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

/**
 * TSK-06-01 design.md §3.12 — Spring·DB 없이 04 엔티티·IdClass 값 규칙을 직접 고정한다. 방언과 무관한 규칙을
 * 단위 테스트로 잡는다.
 */
class MdmCodeEntityValueTest {

    private static final LocalDateTime WITH_MILLIS = LocalDateTime.of(2026, 7, 1, 0, 0, 0, 700_000_000);
    private static final LocalDateTime SECONDS = LocalDateTime.of(2026, 7, 1, 0, 0, 0);
    private static final BigDecimal ONE = new BigDecimal("1");
    private static final BigDecimal ONE_SCALE3 = new BigDecimal("1.000");

    /** 불변 규칙 22 — 초 미만을 반올림하는 DB 도 있어(…:00.700 → …:01) 세터가 먼저 초 단위로 자른다. */
    @Test
    void MdmCodeVer_의_일시_세터_6개는_초_단위로_자른다() {
        record Slot(String name, BiConsumer<MdmCodeVer, LocalDateTime> setter, Function<MdmCodeVer, LocalDateTime> getter) {
        }
        List<Slot> slots = List.of(
                new Slot("applyFrom", MdmCodeVer::setApplyFrom, MdmCodeVer::getApplyFrom),
                new Slot("applyTo", MdmCodeVer::setApplyTo, MdmCodeVer::getApplyTo),
                new Slot("requestedAt", MdmCodeVer::setRequestedAt, MdmCodeVer::getRequestedAt),
                new Slot("approvedAt", MdmCodeVer::setApprovedAt, MdmCodeVer::getApprovedAt),
                new Slot("releasedAt", MdmCodeVer::setReleasedAt, MdmCodeVer::getReleasedAt),
                new Slot("cancelledAt", MdmCodeVer::setCancelledAt, MdmCodeVer::getCancelledAt));
        for (Slot slot : slots) {
            MdmCodeVer ver = new MdmCodeVer("PROC_CD", ONE_SCALE3, "MAJOR");
            slot.setter().accept(ver, WITH_MILLIS);
            assertEquals(SECONDS, slot.getter().apply(ver), slot.name());
            slot.setter().accept(ver, null);
            assertEquals(null, slot.getter().apply(ver), slot.name() + " null");
        }
    }

    /** 불변 규칙 23 ① — scale 0 으로 넣어도(SQLite 는 1.000 을 INTEGER 1 로 저장한다, F26) 게터는 scale 3 을 돌려준다. */
    @Test
    void 버전_번호_게터는_scale_3_을_돌려준다() {
        MdmCodeVer ver = new MdmCodeVer("PROC_CD", ONE, "MAJOR");
        ver.setRestoredFrom(ONE);
        assertEquals(ONE_SCALE3, ver.getVer());
        assertEquals(ONE_SCALE3, ver.getRestoredFrom());

        MdmCodeItem item = new MdmCodeItem("PROC_CD", "82", ONE);
        assertEquals(ONE_SCALE3, item.getFromVer());
        assertEquals(new BigDecimal("9999.000"), item.getToVer(), "새 행의 to_ver 는 열린 9999.000");
        item.setToVer(new BigDecimal("2"));
        assertEquals(new BigDecimal("2.000"), item.getToVer());

        MdmCodeCate cate = new MdmCodeCate("PROC_CD", "BASE", ONE, "REGEX");
        cate.setToVer(new BigDecimal("2"));
        assertEquals(ONE_SCALE3, cate.getFromVer());
        assertEquals(new BigDecimal("2.000"), cate.getToVer());

        MdmCodeCateItem cateItem = new MdmCodeCateItem("PROC_CD", "MAJOR", "82", ONE);
        cateItem.setToVer(new BigDecimal("2"));
        assertEquals(ONE_SCALE3, cateItem.getFromVer());
        assertEquals(new BigDecimal("2.000"), cateItem.getToVer());
    }

    /** 불변 규칙 23 ② — IdClass 동등성은 scale 과 무관하다(BigDecimal.equals 는 scale 을 본다). */
    @Test
    void IdClass_4개는_scale_이_달라도_같은_키로_본다() {
        assertSameKey(new MdmCodeVerId("PROC_CD", ONE), new MdmCodeVerId("PROC_CD", ONE_SCALE3));
        assertSameKey(new MdmCodeItemId("PROC_CD", "82", ONE), new MdmCodeItemId("PROC_CD", "82", ONE_SCALE3));
        assertSameKey(new MdmCodeCateId("PROC_CD", "BASE", ONE), new MdmCodeCateId("PROC_CD", "BASE", ONE_SCALE3));
        assertSameKey(new MdmCodeCateItemId("PROC_CD", "MAJOR", "82", ONE),
                new MdmCodeCateItemId("PROC_CD", "MAJOR", "82", ONE_SCALE3));

        assertNotEquals(new MdmCodeVerId("PROC_CD", ONE), new MdmCodeVerId("PROC_CD", new BigDecimal("1.001")));
        assertNotEquals(new MdmCodeItemId("PROC_CD", "82", ONE), new MdmCodeItemId("PROC_CD", "83", ONE));
    }

    private static void assertSameKey(Object a, Object b) {
        assertEquals(a, b);
        assertEquals(b, a);
        assertEquals(a.hashCode(), b.hashCode(), a + " / " + b);
    }
}
