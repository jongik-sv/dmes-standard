package com.dongkuk.dmes.mdm.dmb.layout.codec;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CharsetEncoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.regex.Pattern;

/**
 * 칸 하나의 인코딩·디코딩(TSK-05-03 design.md §6.3 — 불변 I1~I6). 순수 static. 길이는 모두 바이트다. 문자는 오른쪽 공백, 숫자는
 * 0 채움이면 왼쪽 {@code 0} 아니면 왼쪽 공백, 값이 없으면 칸 전체 공백. 넘치거나 인코딩이 담지 못하는 문자는 잘라내거나 {@code ?} 로
 * 바꾸지 않고 {@link LayoutCodecException}(D10).
 */
public final class LayoutFieldCodec {

    private static final byte SPACE = 0x20;
    private static final Pattern DIGITS = Pattern.compile("[0-9]+");
    private static final Pattern POINT = Pattern.compile("[0-9]*\\.?[0-9]*");

    private LayoutFieldCodec() {
    }

    public static byte[] blank(int length) {
        byte[] out = new byte[length];
        Arrays.fill(out, SPACE);
        return out;
    }

    public static byte[] encodeChar(String value, int length, Charset cs) {
        byte[] out = blank(length);
        if (value == null) {
            return out;
        }
        byte[] bytes = strict(value, cs);
        if (bytes.length > length) {
            throw new LayoutCodecException("값이 칸보다 길다: " + bytes.length + "바이트 > " + length + "바이트(" + cs.name() + ")");
        }
        System.arraycopy(bytes, 0, out, 0, bytes.length);
        return out;
    }

    /** 오른쪽 공백만 뗀다. 비면 null. */
    public static String decodeChar(byte[] slice, Charset cs) {
        int end = slice.length;
        while (end > 0 && slice[end - 1] == SPACE) {
            end--;
        }
        return end == 0 ? null : new String(slice, 0, end, cs);
    }

    public static byte[] encodeNumber(BigDecimal value, int length, LayoutNumSpec spec) {
        if (value == null) {
            return blank(length);
        }
        if (value.signum() < 0 && !spec.sign()) {
            throw new LayoutCodecException("부호 자리가 없는데 음수다: " + value.toPlainString());
        }
        BigDecimal abs = value.abs();
        String digits;
        if (spec.impliedScale() > 0) {
            digits = abs.setScale(spec.impliedScale(), RoundingMode.HALF_UP).unscaledValue().toString();
        } else if (spec.pointMode()) {
            digits = abs.setScale(spec.domainScale(), RoundingMode.HALF_UP).toPlainString();
        } else {
            digits = abs.setScale(0, RoundingMode.HALF_UP).toPlainString();
        }
        int bodyWidth = length - (spec.sign() ? 1 : 0);
        if (digits.length() > bodyWidth) {
            throw new LayoutCodecException("숫자 자리가 넘친다: " + value.toPlainString() + " → " + digits + "(" + bodyWidth + "자리)");
        }
        StringBuilder sb = new StringBuilder(length);
        if (spec.sign()) {
            sb.append(value.signum() < 0 ? '-' : '+');
        }
        sb.append(String.valueOf(spec.zeroPad() ? '0' : ' ').repeat(bodyWidth - digits.length()));
        sb.append(digits);
        return sb.toString().getBytes(StandardCharsets.US_ASCII);
    }

    public static BigDecimal decodeNumber(byte[] slice, LayoutNumSpec spec) {
        String text = new String(slice, StandardCharsets.US_ASCII);
        if (text.isBlank()) {
            return null;
        }
        boolean negative = false;
        String rest = text;
        if (spec.sign()) {
            char c = text.charAt(0);
            if (c != '+' && c != '-') {
                throw new LayoutCodecException("부호 자리가 +·- 가 아니다: " + text);
            }
            negative = c == '-';
            rest = text.substring(1);
        }
        rest = rest.stripLeading();
        boolean ok = spec.pointMode() ? POINT.matcher(rest).matches() && rest.chars().anyMatch(Character::isDigit)
                : DIGITS.matcher(rest).matches();
        if (!ok) {
            throw new LayoutCodecException("숫자 칸에 숫자가 아닌 글자가 있다: " + text);
        }
        BigDecimal v = spec.impliedScale() > 0 ? new BigDecimal(new BigInteger(rest), spec.impliedScale()) : new BigDecimal(rest);
        return negative ? v.negate() : v;
    }

    private static byte[] strict(String value, Charset cs) {
        CharsetEncoder encoder = cs.newEncoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        try {
            ByteBuffer buf = encoder.encode(CharBuffer.wrap(value));
            byte[] out = new byte[buf.remaining()];
            buf.get(out);
            return out;
        } catch (CharacterCodingException e) {
            throw new LayoutCodecException(cs.name() + " 로 담지 못하는 문자가 있다: " + value);
        }
    }
}
