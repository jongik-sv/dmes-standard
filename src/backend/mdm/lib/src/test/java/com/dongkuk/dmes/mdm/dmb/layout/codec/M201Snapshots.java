package com.dongkuk.dmes.mdm.dmb.layout.codec;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemType;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutNumFormat;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.function.UnaryOperator;

/**
 * TSK-05-03 design.md §3.1 — html M201 전체를 계약 record 로 손으로 조립한다. DB 를 쓰지 않는다 — 직렬화기가 스냅샷만으로 동작함을
 * 보이는 입력이다. L100(0, 100, 13항목)·L110(100, 30, 6항목)·본문 COIL_ID·PROD_DT·COIL_THK(158/4)·FILLER(162/25), 총 187.
 */
final class M201Snapshots {

    static final LayoutUnitTable UNITS = LayoutUnitTable.of(List.of(
            new LayoutUnitTable.Unit("MM", "LENGTH", new BigDecimal("1")),
            new LayoutUnitTable.Unit("UM", "LENGTH", new BigDecimal("0.001")),
            new LayoutUnitTable.Unit("INCH", "LENGTH", new BigDecimal("25.4")),
            new LayoutUnitTable.Unit("TON", "WEIGHT", new BigDecimal("1000")),
            new LayoutUnitTable.Unit("KG", "WEIGHT", new BigDecimal("1"))));

    private M201Snapshots() {
    }

    static MdmLayoutItemSnapshot chr(int seq, MdmFillKind kind, String phys, String def, String override, int offset, int length) {
        return new MdmLayoutItemSnapshot(seq, kind, MdmLayoutItemType.CHAR, phys, null, null, null, def, override, null, offset,
                length, null, null);
    }

    static MdmLayoutItemSnapshot num(int seq, MdmFillKind kind, String phys, String def, int offset, int length) {
        return new MdmLayoutItemSnapshot(seq, kind, MdmLayoutItemType.NUM, phys, null, null, null, def, null, null, offset, length,
                null, 0);
    }

    static MdmLayoutItemSnapshot filler(int seq, int offset, int length) {
        return new MdmLayoutItemSnapshot(seq, MdmFillKind.FILLER, null, null, null, null, null, null, null, length, offset, length,
                null, null);
    }

    static MdmLayoutItemSnapshot coilThk(int seq, int offset) {
        return new MdmLayoutItemSnapshot(seq, MdmFillKind.DATA, MdmLayoutItemType.NUM, "COIL_THK", null, null,
                new MdmLayoutNumFormat(false, true, 1), null, null, null, offset, 4, "MM", 1);
    }

    static MdmLayoutHeaderRef l100() {
        return new MdmLayoutHeaderRef(1, 100L, "L100 GLUE 공통 헤더", 0, 100, List.of(
                chr(1, MdmFillKind.AUTO, "TC_CD", "LAYOUT_ID", null, 0, 8),
                chr(2, MdmFillKind.CONST, "SND_FAC_TP", "B0", "B1", 8, 4),
                chr(3, MdmFillKind.CONST, "SND_PROC_TP", "L2", null, 12, 3),
                chr(4, MdmFillKind.CONST, "RCV_FAC_TP", "B1", null, 15, 4),
                chr(5, MdmFillKind.CONST, "RCV_PROC_TP", "MES", null, 19, 3),
                chr(6, MdmFillKind.AUTO, "SNT_SND_HRP", "SEND_TIME", null, 22, 14),
                chr(7, MdmFillKind.CONST, "SND_PGM_ID", "L2IFSND", null, 36, 14),
                chr(8, MdmFillKind.CONST, "EAI_IF_ID", null, "IFL2MES201", 50, 12),
                chr(9, MdmFillKind.CONST, "SNT_TP", "S", null, 62, 1),
                num(10, MdmFillKind.AUTO, "SNT_ORD", "SEQ", 63, 5),
                chr(11, MdmFillKind.CONST, "IF_DATA_NTR", "I", null, 68, 1),
                num(12, MdmFillKind.AUTO, "SNT_LTH", "MSG_LENGTH", 69, 6),
                filler(13, 75, 25)), new BigDecimal("1.000"));
    }

    static MdmLayoutHeaderRef l110() {
        return new MdmLayoutHeaderRef(2, 110L, "L110 L2 구간 헤더", 100, 30, List.of(
                chr(1, MdmFillKind.CONST, "LINE_CODE", "B1", null, 0, 2),
                num(2, MdmFillKind.AUTO, "SEQUENCE_NO", "SEQ", 2, 4),
                num(3, MdmFillKind.AUTO, "LENGTH", "MSG_LENGTH", 6, 5),
                chr(4, MdmFillKind.AUTO, "DATE", "SEND_TIME", null, 11, 8),
                chr(5, MdmFillKind.AUTO, "TIME", "SEND_TIME", null, 19, 6),
                filler(6, 25, 5)), new BigDecimal("1.000"));
    }

    static List<MdmLayoutItemSnapshot> body() {
        return List.of(chr(1, MdmFillKind.DATA, "COIL_ID", null, null, 130, 20), chr(2, MdmFillKind.DATA, "PROD_DT", null, null, 150, 8),
                coilThk(3, 158), filler(4, 162, 25));
    }

    static MdmLayoutSnapshot m201() {
        return new MdmLayoutSnapshot(201L, "M201", "IFL2MES201", "L2", "MES", "EUC-KR", "숫자 왼쪽 0, 문자 오른쪽 공백", new BigDecimal("1.000"), 187,
                List.of(l100(), l110()), body());
    }

    static MdmLayoutSnapshot withBody(MdmLayoutSnapshot s, List<MdmLayoutItemSnapshot> body, int total) {
        return new MdmLayoutSnapshot(s.layoutId(), s.layoutName(), s.eaiCode(), s.sndSystem(), s.rcvSystem(), s.encoding(),
                s.padRule(), s.layoutVersion(), total, s.headers(), body);
    }

    static MdmLayoutSnapshot withEncoding(MdmLayoutSnapshot s, String encoding) {
        return new MdmLayoutSnapshot(s.layoutId(), s.layoutName(), s.eaiCode(), s.sndSystem(), s.rcvSystem(), encoding, s.padRule(),
                s.layoutVersion(), s.totalLength(), s.headers(), s.items());
    }

    /** 본문 항목 하나를 바꾼다(seq 로 찾는다). */
    static MdmLayoutSnapshot withItem(MdmLayoutSnapshot s, int seq, UnaryOperator<MdmLayoutItemSnapshot> edit) {
        List<MdmLayoutItemSnapshot> body = new ArrayList<>();
        for (MdmLayoutItemSnapshot i : s.items()) {
            body.add(i.seq() == seq ? edit.apply(i) : i);
        }
        return withBody(s, body, s.totalLength());
    }

    static MdmLayoutItemSnapshot copy(MdmLayoutItemSnapshot i, String transUnit, String unitItem, MdmLayoutNumFormat fmt, int length,
                                      String unitCode, Integer scale) {
        return new MdmLayoutItemSnapshot(i.seq(), i.fillKind(), i.dataType(), i.columnPhys(), transUnit, unitItem, fmt,
                i.defaultValue(), i.overrideValue(), i.fillerLength(), i.offset(), length, unitCode, scale);
    }

    static String spaces(int n) {
        return " ".repeat(n);
    }

    /** html 값(F3)으로 조립한 기대 한 줄. L110 길이는 전문 총 길이 00187(D5), TC_CD 는 LAYOUT_ID 대리키 201(D5). */
    static String expectedLine(String coilId, String thk) {
        String l100 = "201     " + "B1  " + "L2 " + "B1  " + "MES" + "20260922143015" + "L2IFSND       " + "IFL2MES201  " + "S"
                + "00001" + "I" + "000187" + spaces(25);
        String l110 = "B1" + "0001" + "00187" + "20260922" + "143015" + spaces(5);
        String body = coilId + spaces(20 - coilId.length()) + "20260922" + thk + spaces(25);
        return l100 + l110 + body;
    }
}
