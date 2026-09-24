package com.dongkuk.dmes.mdm.dmd.dataItemMng.service;

import com.dongkuk.dmes.mdm.common.segment.DataItemValue;
import com.dongkuk.dmes.mdm.common.segment.ItemSegmentRow;
import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemRow;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemSaveRequest;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;

/** 항목 DTO 변환 — 일시는 서버가 {@code yyyy-MM-dd HH:mm:ss} 문자열로 준다(화면은 그대로 보인다, F19). */
public final class DataItemRows {

    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern(MdmTemporalBinder.SQLITE_TEXT_PATTERN);

    private DataItemRows() {
    }

    public static String text(LocalDateTime at) {
        return at == null ? null : TEXT.format(at);
    }

    public static DataItemRow toRow(ItemSegmentRow row) {
        DataItemValue v = row.value();
        DataItemRow out = new DataItemRow();
        out.setCode(row.key().code());
        out.setName(v.name());
        out.setAlterName(v.alterName());
        out.setSeq(v.seq());
        out.setDescription(v.description());
        out.setLvl1(v.lvl(1));
        out.setLvl2(v.lvl(2));
        out.setLvl3(v.lvl(3));
        out.setLvl4(v.lvl(4));
        out.setLvl5(v.lvl(5));
        out.setAttr01(v.attr(1));
        out.setAttr02(v.attr(2));
        out.setAttr03(v.attr(3));
        out.setAttr04(v.attr(4));
        out.setAttr05(v.attr(5));
        out.setAttr06(v.attr(6));
        out.setAttr07(v.attr(7));
        out.setAttr08(v.attr(8));
        out.setAttr09(v.attr(9));
        out.setAttr10(v.attr(10));
        out.setValidFrom(text(row.validFrom()));
        out.setValidTo(text(row.validTo()));
        out.setOpen(row.isOpen());
        out.setRowVersion(row.rowVersion());
        return out;
    }

    /** 저장 요청 → 정규화된 값(S5). 빠진 필드는 NULL 이다. */
    public static DataItemValue toValue(DataItemSaveRequest r) {
        return new DataItemValue(r.getName(), r.getAlterName(), r.getSeq(), r.getDescription(),
                Arrays.asList(r.getLvl1(), r.getLvl2(), r.getLvl3(), r.getLvl4(), r.getLvl5()),
                Arrays.asList(r.getAttr01(), r.getAttr02(), r.getAttr03(), r.getAttr04(), r.getAttr05(), r.getAttr06(),
                        r.getAttr07(), r.getAttr08(), r.getAttr09(), r.getAttr10()));
    }
}
