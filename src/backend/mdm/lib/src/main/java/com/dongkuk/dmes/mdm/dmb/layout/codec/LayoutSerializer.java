package com.dongkuk.dmes.mdm.dmb.layout.codec;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemType;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSerializeContext;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSerializer;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 03 전문 직렬화기(TSK-05-03 design.md §6.3 — 불변 I1~I9). 입력은 스냅샷·레코드·호출 문맥뿐이다(I11). 칸 값: DATA = 레코드의
 * {@code COLUMN_PHYS}, CONST = 헤더면 재정의 ?? 기본값·본문이면 기본값, AUTO = 문맥·스냅샷(I7), FILLER = 공백. 숫자 칸은 전송
 * 단위·단위 항목이 가리키는 단위로 기준 단위에서 변환한 뒤 형식에 맞춰 쓴다(I8·I9).
 */
public class LayoutSerializer implements MdmLayoutSerializer {

    private final LayoutUnitTable units;

    public LayoutSerializer(LayoutUnitTable units) {
        this.units = units;
    }

    /** 스냅샷 {@code encoding}(없으면 UTF-8, I2). */
    public static Charset charset(MdmLayoutSnapshot snapshot) {
        String enc = snapshot.encoding();
        return enc == null || enc.isBlank() ? StandardCharsets.UTF_8 : Charset.forName(enc.trim());
    }

    @Override
    public byte[] serialize(MdmLayoutSnapshot snapshot, Map<String, Object> record, MdmLayoutSerializeContext context) {
        Charset cs = charset(snapshot);
        List<LayoutSegment> segments = LayoutSegments.of(snapshot);
        byte[] out = new byte[snapshot.totalLength()];
        for (LayoutSegment s : segments) {
            byte[] b = encode(snapshot, s, record, context, cs);
            System.arraycopy(b, 0, out, s.offset(), b.length);
        }
        return out;
    }

    /** 구간 하나 — 렌더(execute)가 항목별 오류를 모으려고 따로 부른다. 결과 길이는 늘 {@code segment.length()}. */
    public byte[] encode(MdmLayoutSnapshot snapshot, LayoutSegment segment, Map<String, Object> record,
                         MdmLayoutSerializeContext context, Charset cs) {
        MdmLayoutItemSnapshot item = segment.item();
        try {
            byte[] b = encodeItem(snapshot, segment, item, record, context, cs);
            if (b.length != segment.length()) {
                throw new LayoutCodecException("칸 길이가 다르다: " + b.length + " ≠ " + segment.length());
            }
            return b;
        } catch (LayoutCodecException e) {
            if (e.seq() != null) {
                throw e;
            }
            throw new LayoutCodecException(item.seq(), item.columnPhys(), e.reason());
        }
    }

    private byte[] encodeItem(MdmLayoutSnapshot snapshot, LayoutSegment segment, MdmLayoutItemSnapshot item,
                              Map<String, Object> record, MdmLayoutSerializeContext context, Charset cs) {
        int len = segment.length();
        MdmFillKind kind = item.fillKind();
        if (kind == MdmFillKind.FILLER) {
            return LayoutFieldCodec.blank(len);
        }
        if (kind == MdmFillKind.AUTO) {
            return auto(snapshot, item, len, context, cs);
        }
        Object value = kind == MdmFillKind.DATA ? record.get(item.columnPhys()) : constValue(segment, item);
        if (item.dataType() == MdmLayoutItemType.NUM) {
            BigDecimal v = toTarget(number(value), item, record);
            return LayoutFieldCodec.encodeNumber(v, len, LayoutNumSpec.of(item));
        }
        return LayoutFieldCodec.encodeChar(text(value), len, cs);
    }

    private static String constValue(LayoutSegment segment, MdmLayoutItemSnapshot item) {
        if (!segment.body() && item.overrideValue() != null && !item.overrideValue().isBlank()) {
            return item.overrideValue();
        }
        return item.defaultValue();
    }

    private static byte[] auto(MdmLayoutSnapshot snapshot, MdmLayoutItemSnapshot item, int len, MdmLayoutSerializeContext ctx,
                               Charset cs) {
        String kind = item.defaultValue();
        if (LayoutAutoValues.SEND_TIME.equals(kind)) {
            return LayoutFieldCodec.encodeChar(LayoutAutoValues.sendTime(ctx.sendTime(), len), len, cs);
        }
        if (LayoutAutoValues.MSG_LENGTH.equals(kind)) {
            return LayoutFieldCodec.encodeNumber(BigDecimal.valueOf(snapshot.totalLength()), len, integerSpec(item));
        }
        if (LayoutAutoValues.SEQ.equals(kind)) {
            return LayoutFieldCodec.encodeNumber(BigDecimal.valueOf(ctx.seq()), len, integerSpec(item));
        }
        if (LayoutAutoValues.LAYOUT_ID.equals(kind)) {
            return item.dataType() == MdmLayoutItemType.NUM
                    ? LayoutFieldCodec.encodeNumber(BigDecimal.valueOf(snapshot.layoutId()), len, integerSpec(item))
                    : LayoutFieldCodec.encodeChar(String.valueOf(snapshot.layoutId()), len, cs);
        }
        throw new LayoutCodecException("AUTO 종류를 모른다: " + kind);
    }

    /** 수치 AUTO(MSG_LENGTH·SEQ)는 도메인과 무관하게 왼쪽 0 정수다(I7) — 형식이 있으면 부호·채움만 따른다. */
    private static LayoutNumSpec integerSpec(MdmLayoutItemSnapshot item) {
        return item.numFormat() == null ? new LayoutNumSpec(false, true, 0, 0)
                : new LayoutNumSpec(item.numFormat().sign(), item.numFormat().zeroPad(), 0, 0);
    }

    /** 기준 단위 → 단위 항목 값(비면 기준 그대로) 또는 전송 단위(I8·I9). */
    private BigDecimal toTarget(BigDecimal v, MdmLayoutItemSnapshot item, Map<String, Object> record) {
        if (v == null) {
            return null;
        }
        String target = null;
        if (item.unitItem() != null) {
            target = text(record.get(item.unitItem()));
        } else if (item.transUnit() != null) {
            target = item.transUnit();
        }
        if (target == null || target.isBlank()) {
            return v;
        }
        if (item.unitCode() == null) {
            throw new LayoutCodecException("기준 단위가 없는 도메인은 단위를 바꿀 수 없다: → " + target);
        }
        return LayoutUnitConverter.convert(v, item.unitCode(), target.trim(), units);
    }

    static BigDecimal number(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal b) {
            return b;
        }
        if (value instanceof Number n) {
            return new BigDecimal(n.toString());
        }
        if (value instanceof String s) {
            if (s.isBlank()) {
                return null;
            }
            try {
                return new BigDecimal(s.trim());
            } catch (NumberFormatException e) {
                throw new LayoutCodecException("숫자가 아니다: " + s);
            }
        }
        throw new LayoutCodecException("숫자로 바꿀 수 없는 값: " + value);
    }

    static String text(Object value) {
        if (value == null) {
            return null;
        }
        return value instanceof BigDecimal b ? b.toPlainString() : String.valueOf(value);
    }
}
