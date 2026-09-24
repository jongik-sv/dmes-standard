package com.dongkuk.dmes.mdm.dmb.layout;

import java.util.Map;

/**
 * 저장 요청 한 행(TSK-05-02 design.md §2). 화면이 보낸 {@code OFFSET}·{@code LENGTH} 는 읽지 않는다 — 서버가 다시 계산한다(불변 I4).
 */
public record LayoutItemDraft(int seq, String fillKind, String columnPhys, String transUnit, String unitItem,
                              String numFormat, String defaultValue, Integer fillerLength) {

    /**
     * 키 {@code FILL_KIND, COLUMN_PHYS, TRANS_UNIT, UNIT_ITEM, NUM_FORMAT, DEFAULT_VALUE, FILLER_LENGTH}. 빈 문자열은 null.
     * 순번은 grid 행 순서가 정본이다 — 요청의 {@code SEQ} 가 아니라 호출자가 준 {@code seq}(1..n)를 쓴다(드래그 순서, 불변 I11).
     */
    public static LayoutItemDraft fromRow(Map<String, Object> row, int seq) {
        return new LayoutItemDraft(seq, text(row.get("FILL_KIND")), text(row.get("COLUMN_PHYS")),
                text(row.get("TRANS_UNIT")), text(row.get("UNIT_ITEM")), text(row.get("NUM_FORMAT")),
                text(row.get("DEFAULT_VALUE")), integer(row.get("FILLER_LENGTH")));
    }

    static String text(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    static Integer integer(Object v) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        String s = text(v);
        if (s == null) {
            return null;
        }
        try {
            return Integer.valueOf(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
