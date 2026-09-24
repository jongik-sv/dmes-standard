package com.dongkuk.dmes.mdm.dmb.layout.codec;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemType;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutParser;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.Charset;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 03 전문 파서(TSK-05-03 design.md §6.3 — 불변 I8~I10). 파싱 → 단위 역변환만 한다 — <b>받는 쪽은 도메인 유효 식도 제약도 CONST
 * 기대값도 보지 않는다</b>(03:42, F7). 구조 오류(길이 ≠ 총 길이, 숫자 칸의 비숫자)만 예외다. 결과는 본문 DATA·CONST·AUTO 항목만
 * {@code COLUMN_PHYS} 키로 SEQ 순이다(D10).
 */
public class LayoutParser implements MdmLayoutParser {

    private final LayoutUnitTable units;

    public LayoutParser(LayoutUnitTable units) {
        this.units = units;
    }

    @Override
    public Map<String, Object> parse(MdmLayoutSnapshot snapshot, byte[] message) {
        if (message == null || message.length != snapshot.totalLength()) {
            throw new LayoutCodecException("전문 길이 " + (message == null ? null : message.length) + " 이 총 길이 "
                    + snapshot.totalLength() + " 와 다르다");
        }
        Charset cs = LayoutSerializer.charset(snapshot);
        LayoutSegments.of(snapshot);
        List<MdmLayoutItemSnapshot> body = snapshot.items().stream().sorted(Comparator.comparingInt(MdmLayoutItemSnapshot::seq))
                .toList();
        Map<String, Object> out = new LinkedHashMap<>();
        for (MdmLayoutItemSnapshot i : body) {
            if (i.fillKind() != MdmFillKind.FILLER && i.columnPhys() != null) {
                out.put(i.columnPhys(), decode(i, Arrays.copyOfRange(message, i.offset(), i.offset() + i.length()), cs));
            }
        }
        for (MdmLayoutItemSnapshot i : body) {
            if (i.fillKind() != MdmFillKind.FILLER && out.get(i.columnPhys()) instanceof BigDecimal v) {
                out.put(i.columnPhys(), toBase(v, i, out));
            }
        }
        return out;
    }

    /** 칸 하나 — 숫자 칸은 {@link BigDecimal}(전송 단위 그대로), 문자 칸은 오른쪽 공백을 뗀 문자열. 공백 칸은 null. */
    public static Object decode(MdmLayoutItemSnapshot item, byte[] slice, Charset cs) {
        try {
            if (item.dataType() == MdmLayoutItemType.NUM) {
                return LayoutFieldCodec.decodeNumber(slice, LayoutNumSpec.of(item));
            }
            return LayoutFieldCodec.decodeChar(slice, cs);
        } catch (LayoutCodecException e) {
            throw new LayoutCodecException(item.seq(), item.columnPhys(), e.reason());
        }
    }

    /** 전송 단위·단위 항목 값(비면 기준 단위) → 기준 단위, 도메인 소수 자리로 HALF_UP(I8·I9). */
    private BigDecimal toBase(BigDecimal v, MdmLayoutItemSnapshot item, Map<String, Object> parsed) {
        String from = null;
        if (item.unitItem() != null) {
            Object u = parsed.get(item.unitItem());
            from = u == null ? null : String.valueOf(u).trim();
        } else if (item.transUnit() != null) {
            from = item.transUnit();
        }
        if (from == null || from.isBlank() || item.unitCode() == null) {
            return v;
        }
        try {
            BigDecimal base = LayoutUnitConverter.convert(v, from, item.unitCode(), units);
            return item.scale() == null ? base : base.setScale(item.scale(), RoundingMode.HALF_UP);
        } catch (LayoutCodecException e) {
            throw new LayoutCodecException(item.seq(), item.columnPhys(), e.reason());
        }
    }
}
