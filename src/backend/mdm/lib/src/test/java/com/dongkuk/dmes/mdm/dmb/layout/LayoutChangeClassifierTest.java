package com.dongkuk.dmes.mdm.dmb.layout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemType;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutNumFormat;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutChangeClassifier.Change;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutChangeClassifier.Kind;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

/**
 * TSK-05-03 design.md §3.1·§6.6 — 변경 분류(html 변경 분류 표 + D11, 불변 I17). 여분을 쪼개 항목을 넣으면 총 길이·기존 오프셋이
 * 그대로라 순차 전환이다(수용 기준 6). 나머지는 대조군(동시 전환)이다.
 */
class LayoutChangeClassifierTest {

    private static final Map<String, String> NAMES = Map.of("COIL_ID", "코일 ID", "PROD_DT", "생산일자", "COIL_THK", "코일 두께",
            "EXTRA", "추가");
    private static final Function<String, String> NAME = NAMES::get;

    private static MdmLayoutItemSnapshot chr(int seq, MdmFillKind kind, String phys, String def, String override, int offset, int len) {
        return new MdmLayoutItemSnapshot(seq, kind, MdmLayoutItemType.CHAR, phys, null, null, null, def, override, null, offset, len,
                null, null);
    }

    private static MdmLayoutItemSnapshot thk(int seq, int offset, int len, int implied) {
        return new MdmLayoutItemSnapshot(seq, MdmFillKind.DATA, MdmLayoutItemType.NUM, "COIL_THK", null, null,
                new MdmLayoutNumFormat(false, true, implied), null, null, null, offset, len, null, 1);
    }

    private static MdmLayoutItemSnapshot filler(int seq, int offset, int len) {
        return new MdmLayoutItemSnapshot(seq, MdmFillKind.FILLER, null, null, null, null, null, null, null, len, offset, len, null, null);
    }

    private static MdmLayoutHeaderRef l100(String sndFacOverride, String sndProcDefault) {
        return new MdmLayoutHeaderRef(1, 100L, "L100", 0, 100, List.of(
                chr(1, MdmFillKind.CONST, "SND_FAC_TP", "B0", sndFacOverride, 0, 4),
                chr(2, MdmFillKind.CONST, "SND_PROC_TP", sndProcDefault, null, 4, 3),
                filler(3, 7, 93)), new BigDecimal("1.000"));
    }

    private static MdmLayoutHeaderRef l110() {
        return new MdmLayoutHeaderRef(2, 110L, "L110", 100, 30, List.of(filler(1, 0, 30)), new BigDecimal("1.000"));
    }

    private static MdmLayoutSnapshot snap(String name, String encoding, List<MdmLayoutHeaderRef> headers, List<MdmLayoutItemSnapshot> body) {
        int total = headers.stream().mapToInt(MdmLayoutHeaderRef::totalLength).sum() + body.stream().mapToInt(MdmLayoutItemSnapshot::length).sum();
        return new MdmLayoutSnapshot(201L, name, "GLUE", "L2", "MES", encoding, null, new BigDecimal("1.000"), total, headers, body);
    }

    private static List<MdmLayoutHeaderRef> headers() {
        return List.of(l100("B1", "L2"), l110());
    }

    /** v1 — 본문 [COIL_ID 20, PROD_DT 8, FILLER 29], 총 187. */
    private static MdmLayoutSnapshot v1() {
        return snap("M201", "EUC-KR", headers(), List.of(chr(1, MdmFillKind.DATA, "COIL_ID", null, null, 130, 20),
                chr(2, MdmFillKind.DATA, "PROD_DT", null, null, 150, 8), filler(3, 158, 29)));
    }

    /** v2 — 본문 [COIL_ID, PROD_DT, COIL_THK 4, FILLER 25], 총 187. */
    private static MdmLayoutSnapshot v2() {
        return snap("M201", "EUC-KR", headers(), List.of(chr(1, MdmFillKind.DATA, "COIL_ID", null, null, 130, 20),
                chr(2, MdmFillKind.DATA, "PROD_DT", null, null, 150, 8), thk(3, 158, 4, 1), filler(4, 162, 25)));
    }

    private static MdmLayoutSnapshot withBody(MdmLayoutSnapshot s, List<MdmLayoutItemSnapshot> body) {
        return snap(s.layoutName(), s.encoding(), s.headers(), body);
    }

    @Test
    void 여분을_쪼개_항목을_추가하면_총_길이_불변_순차_전환이다() {
        MdmLayoutSnapshot a = v1();
        MdmLayoutSnapshot b = v2();
        assertEquals(187, a.totalLength());
        assertEquals(187, b.totalLength());
        Change c = LayoutChangeClassifier.classify(a, b, NAME);
        assertEquals("SEQUENTIAL", c.switchMode());
        assertEquals(List.of(Kind.FILLER_SPLIT), c.kinds());
        assertEquals("여분 29 → 코일 두께 4 + 여분 25 (여분 쪼개 쓰기)", c.summary());
    }

    @Test
    void 여분_뒤쪽에_항목을_두어도_여분_안이면_순차_전환이다() {
        MdmLayoutSnapshot b = withBody(v1(), List.of(chr(1, MdmFillKind.DATA, "COIL_ID", null, null, 130, 20),
                chr(2, MdmFillKind.DATA, "PROD_DT", null, null, 150, 8), filler(3, 158, 25), thk(4, 183, 4, 1)));
        Change c = LayoutChangeClassifier.classify(v1(), b, NAME);
        assertEquals("SEQUENTIAL", c.switchMode());
        assertEquals(List.of(Kind.FILLER_SPLIT), c.kinds());
        assertEquals("여분 29 → 여분 25 + 코일 두께 4 (여분 쪼개 쓰기)", c.summary());
    }

    @Test
    void 항목_길이가_바뀌면_동시_전환이다() {
        MdmLayoutSnapshot b = withBody(v2(), List.of(chr(1, MdmFillKind.DATA, "COIL_ID", null, null, 130, 20),
                chr(2, MdmFillKind.DATA, "PROD_DT", null, null, 150, 8), thk(3, 158, 5, 1), filler(4, 163, 24)));
        Change c = LayoutChangeClassifier.classify(v2(), b, NAME);
        assertEquals("SIMULTANEOUS", c.switchMode());
        assertEquals(List.of(Kind.ITEM_LENGTH), c.kinds());
        assertEquals("코일 두께 길이 4 → 5", c.summary());
    }

    @Test
    void 항목_순서가_바뀌면_동시_전환이다() {
        MdmLayoutSnapshot b = withBody(v2(), List.of(chr(1, MdmFillKind.DATA, "PROD_DT", null, null, 130, 8),
                chr(2, MdmFillKind.DATA, "COIL_ID", null, null, 138, 20), thk(3, 158, 4, 1), filler(4, 162, 25)));
        Change c = LayoutChangeClassifier.classify(v2(), b, NAME);
        assertEquals("SIMULTANEOUS", c.switchMode());
        assertEquals(List.of(Kind.ITEM_ORDER), c.kinds());
    }

    @Test
    void 헤더_구성이_바뀌면_동시_전환이다() {
        MdmLayoutSnapshot a = v2();
        MdmLayoutSnapshot b = snap("M201", "EUC-KR", List.of(l100("B1", "L2")), List.of(
                chr(1, MdmFillKind.DATA, "COIL_ID", null, null, 100, 20), chr(2, MdmFillKind.DATA, "PROD_DT", null, null, 120, 8),
                thk(3, 128, 4, 1), filler(4, 132, 25)));
        Change c = LayoutChangeClassifier.classify(a, b, NAME);
        assertEquals("SIMULTANEOUS", c.switchMode());
        assertTrue(c.kinds().contains(Kind.HEADER_STACK), c.kinds().toString());
        assertTrue(!c.kinds().contains(Kind.ITEM_ORDER), "헤더 구성이 오프셋 이동을 설명한다: " + c.kinds());
    }

    @Test
    void 헤더_항목_구조가_바뀌면_동시_전환이다() {
        MdmLayoutHeaderRef longer = new MdmLayoutHeaderRef(2, 110L, "L110", 100, 30, List.of(filler(1, 0, 27),
                chr(2, MdmFillKind.CONST, "EXTRA", "X", null, 27, 3)), new BigDecimal("1.000"));
        MdmLayoutSnapshot b = snap("M201", "EUC-KR", List.of(l100("B1", "L2"), longer), v2().items());
        Change c = LayoutChangeClassifier.classify(v2(), b, NAME);
        assertEquals("SIMULTANEOUS", c.switchMode());
        assertEquals(List.of(Kind.HEADER_STACK), c.kinds());
        assertEquals("헤더 구성 변경", c.summary());
    }

    @Test
    void CONST_값_재정의는_순차_전환이다() {
        MdmLayoutSnapshot b = snap("M201", "EUC-KR", List.of(l100("B2", "L2"), l110()), v2().items());
        Change c = LayoutChangeClassifier.classify(v2(), b, p -> null);
        assertEquals("SEQUENTIAL", c.switchMode());
        assertEquals(List.of(Kind.CONST_VALUE), c.kinds());
        assertEquals("상수 SND_FAC_TP B1 → B2", c.summary());
    }

    @Test
    void 헤더_상수_기본값만_바뀌어도_순차_전환이다() {
        MdmLayoutSnapshot b = snap("M201", "EUC-KR", List.of(l100("B1", "L3"), l110()), v2().items());
        Change c = LayoutChangeClassifier.classify(v2(), b, null);
        assertEquals("SEQUENTIAL", c.switchMode());
        assertEquals(List.of(Kind.CONST_VALUE), c.kinds());
        assertEquals("상수 SND_PROC_TP L2 → L3", c.summary());
    }

    @Test
    void 숫자_표현_형식이_바뀌면_동시_전환이다() {
        MdmLayoutSnapshot b = withBody(v2(), List.of(chr(1, MdmFillKind.DATA, "COIL_ID", null, null, 130, 20),
                chr(2, MdmFillKind.DATA, "PROD_DT", null, null, 150, 8), thk(3, 158, 4, 0), filler(4, 162, 25)));
        Change c = LayoutChangeClassifier.classify(v2(), b, NAME);
        assertEquals("SIMULTANEOUS", c.switchMode());
        assertEquals(List.of(Kind.FORMAT), c.kinds());
        assertEquals("코일 두께 형식 변경", c.summary());
    }

    @Test
    void 인코딩이_바뀌면_동시_전환이다() {
        MdmLayoutSnapshot b = snap("M201", "UTF-8", headers(), v2().items());
        Change c = LayoutChangeClassifier.classify(v2(), b, NAME);
        assertEquals("SIMULTANEOUS", c.switchMode());
        assertEquals(List.of(Kind.FORMAT), c.kinds());
        assertEquals("인코딩 EUC-KR → UTF-8", c.summary());
    }

    @Test
    void 끝에_항목을_붙여_총_길이가_늘면_동시_전환이다() {
        List<MdmLayoutItemSnapshot> body = new ArrayList<>(v2().items());
        body.add(chr(5, MdmFillKind.DATA, "EXTRA", null, null, 187, 3));
        Change c = LayoutChangeClassifier.classify(v2(), withBody(v2(), body), NAME);
        assertEquals("SIMULTANEOUS", c.switchMode());
        assertEquals(List.of(Kind.ITEM_INSERT, Kind.TOTAL_LENGTH), c.kinds());
        assertEquals("추가 추가, 총 길이 187 → 190", c.summary());
    }

    @Test
    void 여분_밖에_끼워_넣으면_동시_전환이다() {
        MdmLayoutSnapshot b = withBody(v2(), List.of(chr(1, MdmFillKind.DATA, "EXTRA", null, null, 130, 3),
                chr(2, MdmFillKind.DATA, "COIL_ID", null, null, 133, 20), chr(3, MdmFillKind.DATA, "PROD_DT", null, null, 153, 8),
                thk(4, 161, 4, 1), filler(5, 165, 22)));
        Change c = LayoutChangeClassifier.classify(v2(), b, NAME);
        assertEquals("SIMULTANEOUS", c.switchMode());
        assertTrue(c.kinds().contains(Kind.ITEM_INSERT), c.kinds().toString());
        assertTrue(!c.kinds().contains(Kind.ITEM_ORDER), "삽입이 오프셋 이동을 설명한다: " + c.kinds());
    }

    @Test
    void 항목을_빼면_동시_전환이다() {
        MdmLayoutSnapshot b = withBody(v2(), List.of(chr(1, MdmFillKind.DATA, "COIL_ID", null, null, 130, 20),
                chr(2, MdmFillKind.DATA, "PROD_DT", null, null, 150, 8), filler(3, 158, 29)));
        Change c = LayoutChangeClassifier.classify(v2(), b, NAME);
        assertEquals("SIMULTANEOUS", c.switchMode());
        assertEquals(List.of(Kind.ITEM_REMOVED), c.kinds());
        assertEquals("코일 두께 삭제", c.summary());
    }

    @Test
    void 이름만_바뀌면_순차_전환이다() {
        MdmLayoutSnapshot b = snap("M201 새 이름", "EUC-KR", headers(), v2().items());
        Change c = LayoutChangeClassifier.classify(v2(), b, NAME);
        assertEquals("SEQUENTIAL", c.switchMode());
        assertEquals(List.of(Kind.META), c.kinds());
        assertEquals("기본 속성 변경", c.summary());
    }

    @Test
    void 이전_버전이_없으면_최초_등록이다() {
        Change c = LayoutChangeClassifier.classify(null, v2(), NAME);
        assertNull(c.switchMode());
        assertEquals(List.of(Kind.INITIAL), c.kinds());
        assertEquals("최초 등록", c.summary());
    }
}
