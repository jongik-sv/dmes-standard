package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * headerMng·layoutMng 응답 행 조립(TSK-05-02 design.md §6.1 — 행 키 UPPER_SNAKE). 두 화면이 같은 항목 모양을 받는다.
 */
public final class LayoutRows {

    private LayoutRows() {
    }

    /** 항목 한 행 + 사전 파생값({@code DISPLAY_NAME·DOMAIN_NAME·DATA_TYPE·DOMAIN_LENGTH·SCALE·UNIT_CODE}). */
    public static Map<String, Object> item(MdmLayoutItem i, LayoutColumnInfo c) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("SEQ", i.getSeq());
        row.put("FILL_KIND", i.getFillKind());
        row.put("COLUMN_PHYS", i.getColumnPhys());
        row.put("DISPLAY_NAME", c == null ? null : c.displayName());
        row.put("DOMAIN_NAME", c == null ? null : c.domainName());
        row.put("DATA_TYPE", c == null ? null : c.dataType());
        row.put("DOMAIN_LENGTH", c == null ? null : c.length());
        row.put("SCALE", c == null ? null : c.scale());
        row.put("UNIT_CODE", c == null ? null : c.unitCode());
        row.put("TRANS_UNIT", i.getTransUnit());
        row.put("UNIT_ITEM", i.getUnitItem());
        row.put("NUM_FORMAT", i.getNumFormat());
        row.put("DEFAULT_VALUE", i.getDefaultValue());
        row.put("FILLER_LENGTH", i.getFillerLength());
        row.put("OFFSET", i.getOffset());
        row.put("LENGTH", i.getLength());
        return row;
    }

    public static List<Map<String, Object>> items(List<MdmLayoutItem> items, Map<String, LayoutColumnInfo> dictionary) {
        List<Map<String, Object>> rows = new ArrayList<>(items.size());
        for (MdmLayoutItem i : items) {
            rows.add(item(i, i.getColumnPhys() == null ? null : dictionary.get(i.getColumnPhys())));
        }
        return rows;
    }

    /** 검사를 통과한 행들의 항목 길이(불변 I4) — FILLER 길이 / 표현 자리수 / 도메인 유효 길이. */
    public static List<Integer> lengths(List<LayoutItemDraft> drafts, Map<String, LayoutColumnInfo> dictionary) {
        List<Integer> out = new ArrayList<>(drafts.size());
        for (LayoutItemDraft d : drafts) {
            LayoutColumnInfo c = d.columnPhys() == null ? null : dictionary.get(d.columnPhys());
            LayoutNumFormat f = d.numFormat() == null ? null : LayoutNumFormatCodec.decode(d.numFormat());
            out.add(LayoutOffsetCalculator.itemLength(LayoutFillKinds.parse(d.fillKind()), d.fillerLength(), f,
                    c == null ? null : c.length()));
        }
        return out;
    }

    /** 저장할 항목 엔티티 — OFFSET·LENGTH 는 서버 계산값. */
    public static List<MdmLayoutItem> entities(Long layoutId, List<LayoutItemDraft> drafts, List<Integer> lengths,
                                               List<Integer> offsets) {
        List<MdmLayoutItem> out = new ArrayList<>(drafts.size());
        for (int i = 0; i < drafts.size(); i++) {
            LayoutItemDraft d = drafts.get(i);
            MdmLayoutItem e = new MdmLayoutItem(layoutId, d.seq(), d.fillKind());
            e.setColumnPhys(d.columnPhys());
            e.setTransUnit(d.transUnit());
            e.setUnitItem(d.unitItem());
            e.setNumFormat(d.numFormat());
            e.setDefaultValue(d.defaultValue());
            e.setFillerLength(d.fillerLength());
            e.setOffset(offsets.get(i));
            e.setLength(lengths.get(i));
            out.add(e);
        }
        return out;
    }

    public static List<LayoutItemDraft> drafts(List<Map<String, Object>> rows) {
        List<LayoutItemDraft> out = new ArrayList<>();
        if (rows == null) {
            return out;
        }
        for (int i = 0; i < rows.size(); i++) {
            out.add(LayoutItemDraft.fromRow(rows.get(i), i + 1));
        }
        return out;
    }

    public static List<String> physNames(List<LayoutItemDraft> drafts) {
        List<String> out = new ArrayList<>();
        for (LayoutItemDraft d : drafts) {
            if (d.columnPhys() != null) {
                out.add(d.columnPhys());
            }
        }
        return out;
    }

    /** {@code [UNIT_CODE, DIMENSION, BASE_UNIT]} → 행. */
    public static List<Map<String, Object>> units(List<Object[]> rows) {
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("UNIT_CODE", r[0]);
            m.put("DIMENSION", r[1]);
            m.put("BASE_UNIT", r[2]);
            out.add(m);
        }
        return out;
    }

    /** 이름 부분 일치(대소문자 무시). 키워드가 비면 참. */
    public static boolean matches(String name, String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return true;
        }
        return name != null && name.toLowerCase(Locale.ROOT).contains(keyword.trim().toLowerCase(Locale.ROOT));
    }

    public static String text(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    public static Long id(Object v) {
        if (v instanceof Number n) {
            return n.longValue();
        }
        String s = LayoutItemDraft.text(v);
        if (s == null) {
            return null;
        }
        try {
            return Long.valueOf(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
